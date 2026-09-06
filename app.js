/* ============================================================
   Данные о рядах: ключ в data.json, подпись, цвет, группа
   (группа определяет, как ряд ведёт себя при смене валюты)
   ============================================================ */
const SERIES_META = [
  { key: "median_salary_country", label: "Медианная ЗП, страна",  color: "var(--c-median-country)", cssVar: "--c-median-country", group: "salary", groupLabel: "Зарплаты", default: true, sparse: true },
  { key: "avg_salary_country",    label: "Средняя ЗП, страна",    color: "var(--c-avg-country)",    cssVar: "--c-avg-country",    group: "salary", groupLabel: "Зарплаты", default: true },
  { key: "avg_salary_minsk",      label: "Средняя ЗП, Минск",     color: "var(--c-avg-minsk)",      cssVar: "--c-avg-minsk",      group: "salary", groupLabel: "Зарплаты", default: true },
  { key: "usd_byn",               label: "Курс USD/BYN",          color: "var(--c-rate)",           cssVar: "--c-rate",           group: "rate",   groupLabel: "Курс",     default: true },
  { key: "price_1k",              label: "Цена м², 1-комнатные",  color: "var(--c-price-1k)",       cssVar: "--c-price-1k",       group: "realt",  groupLabel: "Жильё",    default: true },
  { key: "price_2k",              label: "Цена м², 2-комнатные",  color: "var(--c-price-2k)",       cssVar: "--c-price-2k",       group: "realt",  groupLabel: "Жильё",    default: false },
  { key: "price_3k",              label: "Цена м², 3-комнатные",  color: "var(--c-price-3k)",       cssVar: "--c-price-3k",       group: "realt",  groupLabel: "Жильё",    default: false },
  { key: "price_4k",              label: "Цена м², 4-комнатные",  color: "var(--c-price-4k)",       cssVar: "--c-price-4k",       group: "realt",  groupLabel: "Жильё",    default: false },
];

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const state = {
  currency: "BYN",       // 'BYN' | 'USD'
  mode: "absolute",      // 'absolute' | 'percent'
  visible: {},
  zoomStart: 0,
  zoomEnd: 100,
};

let DATA = null;
let chart = null;
let resolvedColors = {}; // cssVar -> actual hex, resolved once DOM is ready

function resolveCssColors() {
  const styles = getComputedStyle(document.documentElement);
  SERIES_META.forEach((m) => {
    resolvedColors[m.key] = styles.getPropertyValue(m.cssVar).trim();
  });
}

function metaByKey(key) {
  return SERIES_META.find((m) => m.key === key);
}

/* ============================================================
   Загрузка данных
   ============================================================ */
async function loadData() {
  const res = await fetch("./data.json");
  return res.json();
}

/* ============================================================
   Пересчёт валюты
   Зарплаты хранятся в BYN, цена за м² — в USD.
   Курс usd_byn собственную ось не меняет и не конвертируется.
   ============================================================ */
function getConvertedValues(meta, currency) {
  const raw = DATA.series[meta.key];
  const usd = DATA.series.usd_byn;

  if (meta.group === "rate") {
    return raw.slice();
  }
  if (meta.group === "salary") {
    if (currency === "BYN") return raw.slice();
    return raw.map((v, i) => (v == null || usd[i] == null ? null : v / usd[i]));
  }
  if (meta.group === "realt") {
    if (currency === "USD") return raw.slice();
    return raw.map((v, i) => (v == null || usd[i] == null ? null : v * usd[i]));
  }
  return raw.slice();
}

/* ============================================================
   Нормализация в проценты от базовой точки.
   Базовая точка — левый край видимого диапазона слайдера.
   Если в самой базовой точке для ряда нет данных, берём ближайшее
   доступное значение начиная с базового индекса и далее вперёд —
   иначе ряд просто исчез бы целиком из-за одной пустой ячейки.
   ============================================================ */
function normalize(values, baseIndex) {
  let ref = null;
  for (let i = baseIndex; i < values.length; i++) {
    if (values[i] != null) { ref = values[i]; break; }
  }
  if (ref == null) {
    for (let i = 0; i < values.length; i++) {
      if (values[i] != null) { ref = values[i]; break; }
    }
  }
  if (ref == null || ref === 0) return values.map(() => null);
  return values.map((v) => (v == null ? null : (v / ref) * 100));
}

/* ============================================================
   Форматирование значений
   ============================================================ */
function fmtMoney(v) {
  return v == null ? "—" : Math.round(v).toLocaleString("ru-RU");
}
function fmtRate(v) {
  return v == null ? "—" : v.toFixed(3);
}
function fmtPercent(v) {
  if (v == null) return "—";
  const sign = v >= 0 ? "" : "";
  return sign + v.toFixed(1) + "%";
}
function fmtMonthRu(ym) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES_RU[parseInt(m, 10) - 1]} ${y}`;
}

/* ============================================================
   Построение опции ECharts
   ============================================================ */
function buildOption() {
  const months = DATA.months;
  const baseIndex = Math.round((state.zoomStart / 100) * (months.length - 1));
  const visibleMetas = SERIES_META.filter((m) => state.visible[m.key]);

  const series = visibleMetas.map((meta) => {
    let values = getConvertedValues(meta, state.currency);
    let yAxisIndex = 0;

    if (state.mode === "percent") {
      values = normalize(values, baseIndex);
    } else {
      yAxisIndex = meta.group === "rate" ? 1 : 0;
    }

    return {
      name: meta.label,
      type: "line",
      data: values,
      yAxisIndex,
      showSymbol: !!meta.sparse,
      symbolSize: meta.sparse ? 7 : 4,
      connectNulls: false,
      sampling: meta.sparse ? undefined : "lttb",
      lineStyle: { color: resolvedColors[meta.key], width: 2 },
      itemStyle: { color: resolvedColors[meta.key] },
      emphasis: { focus: "series" },
      z: meta.group === "rate" ? 5 : 3,
    };
  });

  const axisLineColor = "#232B36";
  const textSecondary = "#8A97A6";
  const textTertiary = "#5B6673";

  let yAxis;
  if (state.mode === "percent") {
    yAxis = [{
      type: "value",
      position: "left",
      name: "%",
      nameTextStyle: { color: textTertiary },
      axisLabel: { formatter: "{value}%", color: textSecondary },
      splitLine: { lineStyle: { color: "#161C24" } },
      axisLine: { show: false },
    }];
  } else {
    yAxis = [
      {
        type: "value",
        position: "left",
        name: `Деньги, ${state.currency}`,
        nameTextStyle: { color: textTertiary },
        axisLabel: { color: textSecondary },
        splitLine: { lineStyle: { color: "#161C24" } },
        axisLine: { show: false },
      },
      {
        type: "value",
        position: "right",
        name: "Курс USD/BYN",
        nameTextStyle: { color: textTertiary },
        axisLabel: { color: textSecondary },
        splitLine: { show: false },
        axisLine: { show: false },
        min: 1.8,
        max: 3.8,
      },
    ];
  }

  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "var(--font-ui)" },
    grid: {
      left: 56,
      right: state.mode === "percent" ? 30 : 66,
      top: 46,
      bottom: 84,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { color: "#000" } },
      backgroundColor: "#12181F",
      borderColor: "#232B36",
      borderWidth: 1,
      padding: 12,
      textStyle: { color: "#E8ECF1", fontSize: 12 },
      extraCssText: "border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.35);",
      formatter: (params) => {
        if (!params.length) return "";
        const month = fmtMonthRu(months[params[0].dataIndex]);
        let html = `<div class="tt-date">${month}</div>`;
        params.forEach((p) => {
          const meta = SERIES_META.find((m) => m.label === p.seriesName);
          const val = p.value;
          let text;
          if (state.mode === "percent") {
            text = fmtPercent(val);
          } else if (meta.group === "rate") {
            text = fmtRate(val);
          } else {
            text = `${fmtMoney(val)} ${state.currency}`;
          }
          html += `<div class="tt-row"><span class="tt-dot" style="background:${p.color}"></span><span class="tt-name">${p.seriesName}</span><span class="tt-val">${text}</span></div>`;
        });
        return html;
      },
    },
    xAxis: {
      type: "category",
      data: months,
      boundaryGap: false,
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textSecondary,
        formatter: (value) => (value.endsWith("-01") ? value.slice(0, 4) : ""),
      },
    },
    yAxis,
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        start: state.zoomStart,
        end: state.zoomEnd,
        height: 26,
        bottom: 12,
        borderColor: "#232B36",
        backgroundColor: "#0D1218",
        fillerColor: "rgba(61, 220, 132, 0.10)",
        dataBackground: {
          lineStyle: { color: "#2A3440" },
          areaStyle: { color: "#1A222B" },
        },
        selectedDataBackground: {
          lineStyle: { color: "#3DDC84" },
          areaStyle: { color: "#3DDC84" },
        },
        handleStyle: { color: "#1A222B", borderColor: "#5B6673" },
        moveHandleStyle: { color: "#2A3440" },
        textStyle: { color: textTertiary, fontFamily: "var(--font-mono)", fontSize: 11 },
      },
      { type: "inside", xAxisIndex: 0, start: state.zoomStart, end: state.zoomEnd },
    ],
    series,
  };
}

function render() {
  chart.setOption(buildOption(), { notMerge: true });
}

/* ============================================================
   Панель чекбоксов
   ============================================================ */
function buildCheckboxPanel() {
  const container = document.getElementById("checkboxList");
  let currentGroup = null;

  SERIES_META.forEach((meta) => {
    if (meta.groupLabel !== currentGroup) {
      currentGroup = meta.groupLabel;
      const label = document.createElement("div");
      label.className = "check-group-label";
      label.textContent = currentGroup;
      container.appendChild(label);
    }

    const row = document.createElement("label");
    row.className = "check-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.visible[meta.key];
    checkbox.style.accentColor = resolvedColors[meta.key];
    checkbox.addEventListener("change", () => {
      state.visible[meta.key] = checkbox.checked;
      render();
    });

    const swatch = document.createElement("span");
    swatch.className = "check-swatch";
    swatch.style.background = resolvedColors[meta.key];

    const text = document.createElement("span");
    text.className = "check-label";
    text.textContent = meta.label;

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    container.appendChild(row);
  });
}

/* ============================================================
   Тумблеры (сегментированные переключатели)
   ============================================================ */
function wireSegmented(id, onChange) {
  const el = document.getElementById(id);
  const buttons = el.querySelectorAll(".segmented-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      onChange(btn.dataset.value);
    });
  });
}

/* ============================================================
   Инициализация
   ============================================================ */
async function init() {
  resolveCssColors();
  DATA = await loadData();

  SERIES_META.forEach((m) => { state.visible[m.key] = m.default; });

  // дефолтный видимый диапазон: 2025–2026
  const months = DATA.months;
  const startIdx = months.indexOf("2025-01");
  state.zoomStart = startIdx >= 0 ? (startIdx / (months.length - 1)) * 100 : 0;
  state.zoomEnd = 100;

  // сноска "по данным ..."
  document.getElementById("dataUpTo").textContent = fmtMonthRu(months[months.length - 1]);

  // на мобильных панель показателей по умолчанию свёрнута
  if (window.innerWidth < 900) {
    document.getElementById("controlsPanel").removeAttribute("open");
  }

  chart = echarts.init(document.getElementById("chart"), null, { renderer: "svg" });

  buildCheckboxPanel();
  render();

  wireSegmented("currencyToggle", (value) => {
    state.currency = value;
    render();
  });

  wireSegmented("modeToggle", (value) => {
    state.mode = value;
    document.getElementById("percentHint").hidden = value !== "percent";
    render();
  });

  document.getElementById("resetZoom").addEventListener("click", () => {
    state.zoomStart = 0;
    state.zoomEnd = 100;
    render();
  });

  chart.on("dataZoom", () => {
    const opt = chart.getOption();
    const dz = opt.dataZoom[0];
    state.zoomStart = dz.start;
    state.zoomEnd = dz.end;
    if (state.mode === "percent") render();
  });

  window.addEventListener("resize", () => chart.resize());
}

init();
