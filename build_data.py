import json
import re
import sys
from pathlib import Path
from collections import OrderedDict
from openpyxl import load_workbook


MONTHS_RU = {
    "янв": 1, "январь": 1, "фев": 2, "февраль": 2,
    "март": 3, "апр": 4, "апрель": 4, "май": 5, "июнь": 6,
    "июль": 7, "авг": 8, "август": 8, "сент": 9, "сентябрь": 9,
    "окт": 10, "октябрь": 10, "ноя": 11, "ноябрь": 11,
    "дек": 12, "декабрь": 12,
}
DATE_RE = re.compile(r"^\d{4}-\d{2}$")


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.replace("\xa0", " ").strip()
        if not v:
            return None
    return v


def is_year(v):
    try:
        n = int(float(v))
        return 1900 <= n <= 2100
    except Exception:
        return False


def month_number(v):
    if v is None:
        return None
    return MONTHS_RU.get(str(v).strip().lower())


def slug(text):
    text = str(text or "").lower().replace("ё", "е").strip()
    text = re.sub(r"[^a-zа-я0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def unique_key(base, used):
    base = slug(base) or "series"
    key = base
    n = 2
    while key in used:
        key = f"{base}_{n}"
        n += 1
    used.add(key)
    return key


def worksheet_rows(ws):
    return [
        [clean(ws.cell(r, c).value) for c in range(1, ws.max_column + 1)]
        for r in range(1, ws.max_row + 1)
    ]


def month_runs(row):
    cols = [i for i, v in enumerate(row) if month_number(v) is not None]
    if len(cols) < 2:
        return []

    runs = []
    start = prev = cols[0]
    for c in cols[1:]:
        if c == prev + 1:
            prev = c
        else:
            runs.append((start, prev))
            start = prev = c
    runs.append((start, prev))
    return runs


def previous_label(rows, header_idx, start_col):
    if header_idx == 0:
        return None
    prev = rows[header_idx - 1]
    # Usually the label is immediately to the left of the first month.
    for c in range(start_col - 1, -1, -1):
        if c < len(prev) and prev[c] not in (None, ""):
            return str(prev[c]).strip()
    return None


def classify(sheet, label, annual=False):
    s = f"{sheet} {label}".lower()

    if "курс usd" in sheet.lower():
        return "rate", "BYN/USD", None
    if sheet == "ставка реф":
        return "rate", "%", None
    if sheet == "кредиты":
        return "rate", "%", None
    if sheet == "!депозиты":
        return "rate", "%", None

    if sheet in ("медианная", "средняя", "мин ЗП"):
        return "salary", "BYN", "BYN"

    if "аренда" in sheet.lower():
        return "housing", "USD", "USD"

    if "м2" in sheet.lower():
        return "housing", "USD", "USD"

    if "сделки" in sheet.lower():
        return "housing", "шт.", None

    if sheet == "строительство":
        if "площад" in s:
            return "construction", "тыс. м²", None
        return "construction", "шт.", None

    return "other", None, None


def parse_ym_sheet(ws):
    rows = worksheet_rows(ws)
    if not rows:
        return []

    header = rows[0]
    result = []

    for col in range(2, len(header)):
        label = header[col]
        if label in (None, ""):
            continue

        values = OrderedDict()
        for row in rows[1:]:
            date = row[1] if len(row) > 1 else None
            if not isinstance(date, str) or not DATE_RE.match(date.strip()):
                continue
            value = row[col] if col < len(row) else None
            if value is not None:
                values[date.strip()] = value

        if values:
            result.append((str(label).strip(), values))

    return result


def parse_monthly_sheet(ws):
    rows = worksheet_rows(ws)
    result = []
    used_local = set()

    for h, header in enumerate(rows):
        runs = month_runs(header)
        if not runs:
            continue

        for block_no, (start, end) in enumerate(runs, 1):
            year_col = start - 1
            if year_col < 0:
                continue

            label = previous_label(rows, h, start)
            if not label:
                label = f"{ws.title} — ряд {block_no}"

            values = OrderedDict()
            r = h + 1

            while r < len(rows):
                row = rows[r]

                # Next month header starts another vertical block.
                if month_runs(row):
                    break

                year = row[year_col] if year_col < len(row) else None
                if is_year(year):
                    year = int(float(year))
                    for c in range(start, end + 1):
                        m = month_number(header[c])
                        if m is None:
                            continue
                        value = row[c] if c < len(row) else None
                        if value is not None:
                            values[f"{year:04d}-{m:02d}"] = value

                r += 1

            if values:
                key = unique_key(f"{ws.title}_{label}", used_local)
                result.append({
                    "key": key,
                    "label": label,
                    "sheet": ws.title,
                    "frequency": "monthly",
                    "values": dict(values),
                    "header_row": h + 1,
                    "year_col": year_col + 1,
                    "start_col": start + 1,
                    "end_col": end + 1,
                })

    return result


def parse_annual_columns(ws):
    """Parse annual columns only for sheets that explicitly contain annual data.

    At present the only supported annual columns are in the construction sheet.
    This intentionally prevents numeric values in other sheets (e.g. Realt
    monthly blocks) from being mistaken for annual-series labels.
    """
    # At present only the construction sheet has supported annual columns.
    # Do not attempt to infer annual series from other sheets: in particular,
    # Realt m² contains numeric cells that must never become series names.
    if ws.title != "строительство":
        return []

    rows = worksheet_rows(ws)
    result = []
    used_local = set()

    for h, header in enumerate(rows):
        runs = month_runs(header)
        if not runs:
            continue

        # For construction the annual columns are the non-month columns after
        # the last monthly run, with their labels in the month-header row.
        start, end = runs[-1]
        year_col = start - 1
        if year_col < 0:
            continue

        for c in range(end + 1, len(header)):
            label = header[c] if c < len(header) else None
            if label in (None, ""):
                continue
            if month_number(label) is not None:
                continue

            # Do not treat a plain year/value-looking header as a series name.
            if is_year(label):
                continue

            values = OrderedDict()
            r = h + 1
            while r < len(rows):
                row = rows[r]

                # A new month header starts another vertical block.
                if month_runs(row):
                    break

                year = row[year_col] if year_col < len(row) else None
                if is_year(year):
                    value = row[c] if c < len(row) else None
                    if value is not None:
                        values[str(int(float(year)))] = value
                r += 1

            if values:
                key = unique_key(f"{ws.title}_{label}", used_local)
                group, unit, currency = classify(ws.title, str(label), annual=True)

                # Construction annual columns use their actual semantic units.
                label_l = str(label).lower()
                if "тыс" in label_l:
                    unit = "тыс. м²" if "площад" in str(header[0] or "").lower() else "шт."
                else:
                    unit = "шт."

                result.append({
                    "key": key,
                    "label": str(label).strip(),
                    "sheet": ws.title,
                    "frequency": "yearly",
                    "values": dict(values),
                    "header_row": h + 1,
                    "year_col": year_col + 1,
                    "column": c + 1,
                })

    return result

# Sheets reserved for future expansion. They are intentionally excluded
# from the current dataset.
EXCLUDED_SHEETS = {
    "кредиты",
    "!депозиты",
}


def main():
    script_dir = Path(__file__).resolve().parent

    excel_path = script_dir / "data.xlsx"
    json_path = script_dir / "data.json"

    if len(sys.argv) >= 2:
        excel_path = Path(sys.argv[1]).resolve()
    if len(sys.argv) >= 3:
        json_path = Path(sys.argv[2]).resolve()

    if not excel_path.exists():
        raise SystemExit(
            "ERROR: Excel file not found:\n  " + str(excel_path)
        )

    print("=" * 60)
    print("BUILD DATA")
    print("=" * 60)
    print("Excel:", excel_path)
    print("JSON :", json_path)
    print()

    wb = load_workbook(excel_path, data_only=True)

    all_monthly = OrderedDict()
    all_yearly = OrderedDict()
    datasets = OrderedDict()

    # Global registries prevent duplicate keys across different sheets.
    used_monthly_keys = set()
    used_yearly_keys = set()

    # Median sheet: explicit YYYY-MM rows.
    if "медианная" in wb.sheetnames:
        ws = wb["медианная"]
        rows = worksheet_rows(ws)
        keys = []
        for label, values in parse_ym_sheet(ws):
            group, unit, currency = classify("медианная", label)
            key = unique_key(f"медианная_{label}", used_monthly_keys)
            all_monthly[key] = {
                "key": key,
                "label": f"Медианная ЗП — {label}",
                "sheet": "медианная",
                "frequency": "monthly",
                "unit": unit,
                "group": group,
                "currency": currency,
                "values": values,
            }
            keys.append(key)

        datasets["медианная"] = {
            "sheet": "медианная",
            "monthly_series": keys,
            "yearly_series": [],
            "raw_rows": rows,
        }

    for sheet in wb.sheetnames:
        if sheet == "медианная" or sheet in EXCLUDED_SHEETS:
            continue

        ws = wb[sheet]
        rows = worksheet_rows(ws)

        monthly_keys = []
        yearly_keys = []

        for obj in parse_monthly_sheet(ws):
            group, unit, currency = classify(sheet, obj["label"])
            key = unique_key(obj["key"], used_monthly_keys)
            all_monthly[key] = {
                "key": key,
                "label": obj["label"],
                "sheet": sheet,
                "frequency": "monthly",
                "unit": unit,
                "group": group,
                "currency": currency,
                "values": obj["values"],
            }
            monthly_keys.append(key)

        for obj in parse_annual_columns(ws):
            group, unit, currency = classify(sheet, obj["label"], annual=True)
            key = unique_key(obj["key"], used_yearly_keys)
            all_yearly[key] = {
                "key": key,
                "label": obj["label"],
                "sheet": sheet,
                "frequency": "yearly",
                "unit": unit,
                "group": group,
                "currency": currency,
                "values": obj["values"],
            }
            yearly_keys.append(key)

        datasets[sheet] = {
            "sheet": sheet,
            "monthly_series": monthly_keys,
            "yearly_series": yearly_keys,
            "raw_rows": rows,
        }

    all_dates = set()
    for obj in all_monthly.values():
        all_dates.update(obj["values"].keys())

    if not all_dates:
        raise SystemExit("ERROR: no monthly data found.")

    def date_tuple(x):
        y, m = x.split("-")
        return int(y), int(m)

    ordered_dates = sorted(all_dates, key=date_tuple)
    start_y, start_m = date_tuple(ordered_dates[0])
    end_y, end_m = date_tuple(ordered_dates[-1])

    months = []
    y, m = start_y, start_m
    while (y, m) <= (end_y, end_m):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y += 1
            m = 1

    flat_series = OrderedDict()
    series_meta = []

    for key, obj in all_monthly.items():
        flat_series[key] = [obj["values"].get(month) for month in months]
        series_meta.append({
            "key": key,
            "label": obj["label"],
            "sheet": obj["sheet"],
            "frequency": "monthly",
            "unit": obj["unit"],
            "group": obj["group"],
            "currency": obj["currency"],
        })

    annual = OrderedDict()
    for key, obj in all_yearly.items():
        annual[key] = obj["values"]
        series_meta.append({
            "key": key,
            "label": obj["label"],
            "sheet": obj["sheet"],
            "frequency": "yearly",
            "unit": obj["unit"],
            "group": obj["group"],
            "currency": obj["currency"],
        })

    out = {
        "version": 3,
        "source": excel_path.name,
        "months": months,
        "series": flat_series,
        "annual_series": annual,
        "series_meta": series_meta,
        "datasets": datasets,
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, allow_nan=False)

    print("Writing JSON...")
    print()
    print("=" * 60)
    print("DONE")
    print("=" * 60)
    print("Output:", json_path)
    print("Size:", f"{json_path.stat().st_size / 1024:.1f} KB")
    print()
    print("Months:", months[0], "->", months[-1], f"({len(months)} points)")
    print("Monthly series:", len(flat_series))
    print("Yearly series :", len(annual))
    print()

    for meta in series_meta:
        if meta["frequency"] == "monthly":
            values = flat_series[meta["key"]]
            count = sum(v is not None for v in values)
            print(
                f'  {meta["key"]}: {count}/{len(values)} '
                f'| {meta["label"]} | {meta["unit"] or "—"}'
            )
        else:
            print(
                f'  {meta["key"]}: {len(annual[meta["key"]])} '
                f'yearly | {meta["label"]} | {meta["unit"] or "—"}'
            )


if __name__ == "__main__":
    main()
