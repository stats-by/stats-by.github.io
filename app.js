/* ============================================================
   stats.by — V1
   Frontend для data.json v3
   ============================================================ */

"use strict";


/* ============================================================
   Сенсорные устройства
   ============================================================ */

const IS_TOUCH = !!(
  window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches
);



/* ============================================================
   Константы
   ============================================================ */

const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const MONTH_SHORT_RU = MONTH_NAMES_RU.map((name) =>
  name.slice(0, 3).toLowerCase()
);

const X_EDGE_LABEL_PX = 56;
const X_YEAR_LABEL_PX = 32;
const X_LABEL_GAP_PX = 12;
const X_YEAR_STEPS = [1, 2, 5, 10];

const BASELINE_COLOR = "#9EA0A5";

const X_GRID_COLOR = "#232B36";

const GROUP_ORDER = [
  "Зарплаты",
  "Курс",
  "Строительство",
  "Аренда",
  "стоимость квартир Realt",
  "стоимость квартир Wikidom",
  "Ставка",
];

const CHECKBOX_ORDER = [
  "медианная_беларусь",
  "средняя_средняя_по_стране",
  "медианная_минск",
  "средняя_средняя_минск",
  "мин_зп_минимальная_по_стране",
  "курс_usd_курс_usd_byn",
  "строительство_год_тыс",
  "строительство_год",
  "аренда_стоимость_аренды_realt",
  "аренда_стоимость_аренды_t_s_by",
  "realt_м2_стоимость_м2_однушек",
  "realt_м2_стоимость_м2_двушек",
  "realt_м2_стоимость_м2_трешек",
  "realt_м2_стоимость_м2_четырешек",
  "realt_м2_объявления_новостройки",
  "realt_м2_объявления_вторичка",
  "realt_м2_объявления_новостройки_вторичка",
  "realt_сделки_количество_сделок_новостройки_вторичка",
  "wikidom_м2_стоимость_м2_однушек",
  "wikidom_м2_стоимость_м2_двушек",
  "wikidom_м2_стоимость_м2_трешек",
  "wikidom_м2_стоимость_м2_четырешек",
  "wikidom_м2_стоимость_м2_общая",
  "wikidom_сделки_количество_сделок_новостройки_вторичка",
  "wikidom_сделки_количество_сделок_новостройки",
  "wikidom_сделки_количество_сделок_вторичка",
];


/* ============================================================
   Состояние приложения
   ============================================================ */

const state = {
  currency: "BYN",
  mode: "absolute",

  seasonalityCurrency: "USD",
  seasonalityMode: "percent",

  visible: {},

  seasonalityKey: "курс_usd_курс_usd_byn",

  seasonalityYears: new Set(),
  seasonalityYearsInitialized: false,
  seasonalityMonthStart: 0,
  seasonalityMonthEnd: 11,
  seasonalityMonthRangeInitialized: false,

  zoomStart: 0,
  zoomEnd: 100,

  lastZoomStart: 0,
  lastZoomEnd: 100,

  zoomAnchorEnd: 100,

  wheelZoomAt: 0,

  correctingZoom: false,

  hoveredMainSeriesId: null,
  hoveredSeasonalitySeriesId: null,
};


/* ============================================================
   Глобальные данные
   ============================================================ */

let DATA = null;
let chart = null;
let seasonalityChart = null;

const resolvedColors = {};


/* ============================================================
   Работа с CSS-цветами
   ============================================================ */

function resolveCssColors() {
  const styles = getComputedStyle(document.documentElement);

  const cssVariables = [
    "--c-median-country",
    "--c-avg-country",
    "--c-avg-minsk",
    "--c-rate",
    "--c-price-1k",
    "--c-price-2k",
    "--c-price-3k",
    "--c-price-4k",
  ];

  cssVariables.forEach((name) => {
    const value = styles.getPropertyValue(name).trim();

    if (value) {
      resolvedColors[name] = value;
    }
  });
}


const SERIES_PALETTE = [
  "#F2B84B",
  "#F0793C",
  "#E14F63",
  "#3DDC84",
  "#4FC3E8",
  "#4C93E0",
  "#7B7FE8",
  "#A66FE0",
  "#C46BE8",
  "#D65DB1",
  "#6CCB9A",
  "#75B9E6",
  "#9B9FE8",
  "#D49B63",
  "#8BCF5B",
  "#C77DFF",
];


/* ============================================================
   Метаданные рядов
   ============================================================ */

function getSeriesMeta() {
  if (!DATA || !Array.isArray(DATA.series_meta)) {
    return [];
  }

  return DATA.series_meta;
}


function metaByKey(key) {
  return getSeriesMeta().find((meta) => meta.key === key) || null;
}


function getStableSeriesIndex(meta) {
  return getSeriesMeta().indexOf(meta);
}


function getSeriesColor(meta, index) {
  const cssColorMap = {
    "медианная_беларусь": "--c-median-country",
    "средняя_средняя_по_стране": "--c-avg-country",
    "медианная_минск": "--c-avg-minsk",
    "средняя_средняя_минск": "--c-avg-minsk",
    "курс_usd_курс_usd_byn": "--c-rate",
    "realt_м2_1к": "--c-price-1k",
    "realt_м2_2к": "--c-price-2k",
    "realt_м2_3к": "--c-price-3k",
    "realt_м2_4к": "--c-price-4k",
  };

  const variable = cssColorMap[meta.key];

  if (variable && resolvedColors[variable]) {
    return resolvedColors[variable];
  }

  return SERIES_PALETTE[index % SERIES_PALETTE.length];
}


/* ============================================================
   Группы
   ============================================================ */

function getGroupLabel(meta) {
  if (!meta) {
    return "Прочее";
  }

  if (meta.group) {
    const groupMap = {
      salary: "Зарплаты",
      rate: "Курс",
      realt: "стоимость квартир Realt",
      wikidom: "стоимость квартир Wikidom",
      rent: "Аренда",
      construction: "Строительство",
      refinancing: "Ставка",
    };

    return groupMap[meta.group] || meta.group;
  }

  const sheet = String(meta.sheet || "").toLowerCase();

  if (sheet.includes("средняя") ||
      sheet.includes("медианная") ||
      sheet.includes("мин зп")) {
    return "Зарплаты";
  }

  if (sheet.includes("курс")) {
    return "Курс";
  }

  if (sheet.includes("realt")) {
    return "стоимость квартир Realt";
  }

  if (sheet.includes("wikidom")) {
    return "стоимость квартир Wikidom";
  }

  if (sheet.includes("аренда")) {
    return "Аренда";
  }

  if (sheet.includes("строительство")) {
    return "Строительство";
  }

  if (sheet.includes("ставка")) {
    return "Ставка";
  }

  return "Прочее";
}


function getInternalGroup(meta) {
  const label = getGroupLabel(meta);

  switch (label) {
    case "Зарплаты":
      return "salary";

    case "стоимость квартир Realt":
    case "стоимость квартир Wikidom":
    case "Аренда":
      return "housing";

    case "Курс":
      return "rate";

    default:
      return "other";
  }
}


/* ============================================================
   Загрузка data.json
   ============================================================ */

async function loadData() {
  const response = await fetch("./data.json", {
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить data.json: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  validateData(data);

  return data;
}


function validateData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("data.json содержит некорректный JSON.");
  }

  if (!Array.isArray(data.months)) {
    throw new Error("В data.json отсутствует массив months.");
  }

  if (!data.series || typeof data.series !== "object") {
    throw new Error("В data.json отсутствует объект series.");
  }

  if (!Array.isArray(data.series_meta)) {
    throw new Error("В data.json отсутствует массив series_meta.");
  }

  if (!data.annual_series || typeof data.annual_series !== "object") {
    data.annual_series = {};
  }

  data.series_meta.forEach((meta) => {
    if (!data.series.hasOwnProperty(meta.key)) {
      console.warn(
        `series_meta содержит ${meta.key}, но самого ряда нет в series.`
      );
    }
  });
}


/* ============================================================
   Работа с датами
   ============================================================ */

function isYearMonth(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value);
}


function fmtMonthRu(ym) {
  if (!isYearMonth(ym)) {
    return String(ym);
  }

  const parts = ym.split("-");

  const year = Number(parts[0]);
  const month = Number(parts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return String(ym);
  }

  return `${MONTH_NAMES_RU[month - 1]} ${year}`;
}


function fmtYear(year) {
  return String(year);
}


/* ============================================================
   Работа с единицами измерения
   ============================================================ */

function getMetaUnit(meta) {
  if (!meta) {
    return "";
  }

  return meta.unit || "";
}


function getDisplayUnit(meta) {
  if (!meta) {
    return "";
  }

  const group = getInternalGroup(meta);

  if (group === "salary") {
    return state.currency;
  }

  if (group === "housing") {
    return state.currency;
  }

  return getMetaUnit(meta);
}


/* ============================================================
   Проверка денежных рядов
   ============================================================ */

function isMoneySeries(meta) {
  const group = getInternalGroup(meta);

  return group === "salary" || group === "housing";
}


function isPercentSeries(meta) {
  if (!meta) {
    return false;
  }

  const unit = String(meta.unit || "").toLowerCase();

  return (
    unit === "%" ||
    unit.includes("процент")
  );
}


function isRateSeries(meta) {
  return getInternalGroup(meta) === "rate";
}


function isAnnualSeries(meta) {
  return meta && meta.frequency === "yearly";
}


/* ============================================================
   Получение месячного ряда
   ============================================================ */

function getRawMonthlyValues(meta) {
  if (!meta || !DATA.series) {
    return [];
  }

  const values = DATA.series[meta.key];

  if (!Array.isArray(values)) {
    return [];
  }

  return values;
}


/* ============================================================
   Конвертация валюты
   ============================================================ */

function getUsdRateSeries() {
  if (DATA.series["курс_usd_курс_usd_byn"]) {
    return DATA.series["курс_usd_курс_usd_byn"];
  }

  const meta = getSeriesMeta().find((item) => {
    const label = String(item.label || "").toLowerCase();
    const unit = String(item.unit || "").toLowerCase();

    return (
      label.includes("курс usd") ||
      label.includes("usd/byn") ||
      unit.includes("byn/usd")
    );
  });

  if (meta && DATA.series[meta.key]) {
    return DATA.series[meta.key];
  }

  return null;
}


function convertMonthlyValues(meta, currency) {
  const raw = getRawMonthlyValues(meta);

  if (!Array.isArray(raw)) {
    return [];
  }

  const group = getInternalGroup(meta);

  if (group === "rate") {
    return raw.slice();
  }

  if (group !== "salary" && group !== "housing") {
    return raw.slice();
  }

  if (
    (group === "salary" && currency === "BYN") ||
    (group === "housing" && currency === "USD")
  ) {
    return raw.slice();
  }

  const usdRate = getUsdRateSeries();

  if (!usdRate) {
    console.warn(
      "Не найден ряд курса USD/BYN. Конвертация валюты невозможна."
    );

    return raw.slice();
  }

  if (group === "salary" && currency === "USD") {
    return raw.map((value, index) => {
      const rate = usdRate[index];

      if (
        value == null ||
        rate == null ||
        !Number.isFinite(Number(value)) ||
        !Number.isFinite(Number(rate)) ||
        Number(rate) === 0
      ) {
        return null;
      }

      return Number(value) / Number(rate);
    });
  }

  if (group === "housing" && currency === "BYN") {
    return raw.map((value, index) => {
      const rate = usdRate[index];

      if (
        value == null ||
        rate == null ||
        !Number.isFinite(Number(value)) ||
        !Number.isFinite(Number(rate))
      ) {
        return null;
      }

      return Number(value) * Number(rate);
    });
  }

  return raw.slice();
}


/* ============================================================
   Годовые ряды
   ============================================================ */

function getRawAnnualValues(meta) {
  if (!meta || !DATA.annual_series) {
    return null;
  }

  const values = DATA.annual_series[meta.key];

  if (!values || typeof values !== "object") {
    return null;
  }

  return values;
}


function getAnnualAsMonthly(meta) {
  const raw = getRawAnnualValues(meta);

  if (!raw) {
    return DATA.months.map(() => null);
  }

  return DATA.months.map((month) => {
    const year = month.slice(0, 4);
    const monthNumber = Number(month.slice(5, 7));

    if (monthNumber !== 12) {
      return null;
    }

    const value = raw[year];

    if (value == null) {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  });
}


/* ============================================================
   Получение итоговых значений ряда
   ============================================================ */

function getSeriesValues(meta) {
  if (isAnnualSeries(meta)) {
    return getAnnualAsMonthly(meta);
  }

  return convertMonthlyValues(meta, state.currency);
}


/* ============================================================
   Линейная интерполяция
   ============================================================ */

function interpolateMonthlyValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const result = values.map((value) => {
    const number = Number(value);

    if (value == null || !Number.isFinite(number)) {
      return null;
    }

    return {
      value: number,
      isOriginal: true,
    };
  });

  let previousIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const current = Number(values[i]);

    if (values[i] == null || !Number.isFinite(current)) {
      continue;
    }

    if (previousIndex >= 0 && i - previousIndex > 1) {
      const previous = Number(values[previousIndex]);
      const steps = i - previousIndex;

      for (let j = previousIndex + 1; j < i; j++) {
        const progress = (j - previousIndex) / steps;

        result[j] = {
          value: previous + (current - previous) * progress,
          isOriginal: false,
        };
      }
    }

    previousIndex = i;
  }

  return result;
}


function normalizeSeriesPointsToPercent(points, baseIndex) {
  if (!Array.isArray(points)) {
    return [];
  }

  let reference = null;

  for (let i = baseIndex; i < points.length; i++) {
    const point = points[i];
    const value = point && typeof point === "object"
      ? point.value
      : point;

    if (value != null && Number.isFinite(Number(value))) {
      reference = Number(value);
      break;
    }
  }

  if (reference == null) {
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const value = point && typeof point === "object"
        ? point.value
        : point;

      if (value != null && Number.isFinite(Number(value))) {
        reference = Number(value);
        break;
      }
    }
  }

  if (reference == null || reference === 0) {
    return points.map(() => null);
  }

  return points.map((point) => {
    if (point == null) {
      return null;
    }

    const value = point && typeof point === "object"
      ? point.value
      : point;

    if (value == null || !Number.isFinite(Number(value))) {
      return null;
    }

    return {
      value: (Number(value) / reference) * 100,
      isOriginal: point && typeof point === "object"
        ? point.isOriginal !== false
        : true,
    };
  });
}


function isSparseMonthlySeries(values) {
  if (!Array.isArray(values)) {
    return false;
  }

  const indexes = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value == null) {
      continue;
    }

    const number = typeof value === "object" && value !== null
      ? Number(value.value)
      : Number(value);

    if (Number.isFinite(number)) {
      indexes.push(i);
    }
  }

  if (indexes.length < 2) {
    return false;
  }

  const gaps = [];

  for (let i = 1; i < indexes.length; i++) {
    gaps.push(indexes[i] - indexes[i - 1]);
  }

  gaps.sort((a, b) => a - b);

  const middle = Math.floor(gaps.length / 2);
  const medianGap = gaps.length % 2
    ? gaps[middle]
    : (gaps[middle - 1] + gaps[middle]) / 2;

  return medianGap > 1;
}


/* ============================================================
   Форматирование чисел
   ============================================================ */

function formatNumber(value, digits = 0) {
  if (
    value == null ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}


function formatValue(value, meta, percentMode = false) {
  if (
    value == null ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  const number = Number(value);

  if (percentMode) {
    return `${formatNumber(number, 1)}%`;
  }

  if (isPercentSeries(meta)) {
    return `${formatNumber(number, 2)}%`;
  }

  if (isRateSeries(meta)) {
    return formatNumber(number, 3);
  }

  const unit = getDisplayUnit(meta);

  if (isMoneySeries(meta)) {
    return `${formatNumber(number, 0)} ${unit}`;
  }

  if (
    unit === "шт." ||
    unit === "шт" ||
    unit === "тыс. м²"
  ) {
    return `${formatNumber(number, 0)} ${unit}`;
  }

  if (unit) {
    return `${formatNumber(number, 2)} ${unit}`;
  }

  return formatNumber(number, 2);
}


/* ============================================================
   Отображаемое название ряда
   ============================================================ */

function getSeriesLabel(meta) {
  if (!meta) {
    return "";
  }

  return meta.label || meta.key;
}


/* ============================================================
   Панель показателей
   ============================================================ */

function sortMetas(metas) {
  return metas.slice().sort((a, b) => {
    const groupA = getGroupLabel(a);
    const groupB = getGroupLabel(b);

    const indexA = GROUP_ORDER.indexOf(groupA);
    const indexB = GROUP_ORDER.indexOf(groupB);

    const normalizedA = indexA === -1 ? 999 : indexA;
    const normalizedB = indexB === -1 ? 999 : indexB;

    if (normalizedA !== normalizedB) {
      return normalizedA - normalizedB;
    }

    const orderA = CHECKBOX_ORDER.indexOf(a.key);
    const orderB = CHECKBOX_ORDER.indexOf(b.key);

    if (orderA !== -1 || orderB !== -1) {
      const normalizedOrderA = orderA === -1 ? 999 : orderA;
      const normalizedOrderB = orderB === -1 ? 999 : orderB;

      if (normalizedOrderA !== normalizedOrderB) {
        return normalizedOrderA - normalizedOrderB;
      }
    }

    return String(a.label || a.key).localeCompare(
      String(b.label || b.key),
      "ru"
    );
  });
}


function buildCheckboxPanel() {
  const container = document.getElementById("checkboxList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const metas = sortMetas(getSeriesMeta());

  let currentGroup = null;

  metas.forEach((meta) => {
    const groupLabel = getGroupLabel(meta);

    if (groupLabel !== currentGroup) {
      currentGroup = groupLabel;

      const groupTitle = document.createElement("div");

      groupTitle.className = "check-group-label";
      groupTitle.textContent = groupLabel;

      container.appendChild(groupTitle);
    }

    const row = document.createElement("label");

    row.className = "check-row";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = !!state.visible[meta.key];

    const color = getSeriesColor(meta, getStableSeriesIndex(meta));

    checkbox.style.accentColor = color;

    checkbox.addEventListener("change", () => {
      state.visible[meta.key] = checkbox.checked;
      setZoomByPreset("all");
    });

    const swatch = document.createElement("span");

    swatch.className = "check-swatch";
    swatch.style.background = color;

    const text = document.createElement("span");

    text.className = "check-label";
    text.textContent = getSeriesLabel(meta);

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);

    container.appendChild(row);
  });
}


/* ============================================================
   Панель показателей сезонности
   ============================================================ */

function clearSeasonalitySelection() {
  state.hoveredSeasonalitySeriesId = null;
  updateTooltipHighlight(document.getElementById("seasonalityChart"), null);

  state.seasonalityKey = null;
  state.seasonalityYears = new Set();
  state.seasonalityYearsInitialized = false;

  const container = document.getElementById(
    "seasonalityCheckboxList"
  );

  if (container) {
    container
      .querySelectorAll('input[type="checkbox"]')
      .forEach((checkbox) => {
        checkbox.checked = false;
      });
  }

  renderSeasonality();
}


function getSeasonalityYears(meta) {
  if (!meta || isAnnualSeries(meta)) {
    return [];
  }

  const values = convertMonthlyValues(meta, state.currency);
  const years = new Set();

  DATA.months.forEach((key, index) => {
    const value = values[index];

    if (
      isYearMonth(key) &&
      value != null &&
      Number.isFinite(Number(value))
    ) {
      years.add(Number(key.slice(0, 4)));
    }
  });

  return Array.from(years).sort((a, b) => a - b);
}


function syncSeasonalityMonthState() {
  const max = MONTH_NAMES_RU.length - 1;

  if (!state.seasonalityMonthRangeInitialized) {
    state.seasonalityMonthStart = 0;
    state.seasonalityMonthEnd = max;
    state.seasonalityMonthRangeInitialized = true;
    return;
  }

  state.seasonalityMonthStart = Math.max(
    0,
    Math.min(state.seasonalityMonthStart, max)
  );

  state.seasonalityMonthEnd = Math.max(
    state.seasonalityMonthStart,
    Math.min(state.seasonalityMonthEnd, max)
  );
}


function buildSeasonalityYearsPanel() {
  const container = document.getElementById("seasonalityYearsList");
  const meta = metaByKey(state.seasonalityKey);

  if (!container) {
    return;
  }

  const years = getSeasonalityYears(meta);
  container.innerHTML = "";

  years.forEach((year, index) => {
    const row = document.createElement("label");
    row.className = "check-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.seasonalityYears.has(year);
    checkbox.dataset.year = String(year);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.seasonalityYears.add(year);
      } else {
        state.seasonalityYears.delete(year);
      }
      renderSeasonality();
    });

    const swatch = document.createElement("span");
    swatch.className = "check-swatch";
    swatch.style.background = SERIES_PALETTE[index % SERIES_PALETTE.length];

    const text = document.createElement("span");
    text.className = "check-label";
    text.textContent = String(year);

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    container.appendChild(row);
  });
}


function setSeasonalityYears(checked) {
  const meta = metaByKey(state.seasonalityKey);
  const years = getSeasonalityYears(meta);
  state.seasonalityYears = checked ? new Set(years) : new Set();
  state.seasonalityYearsInitialized = true;
  buildSeasonalityYearsPanel();
  renderSeasonality();
}


function buildSeasonalityCheckboxPanel() {
  const container = document.getElementById("seasonalityCheckboxList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const metas = sortMetas(getSeriesMeta()).filter(
    (meta) => getGroupLabel(meta) !== "Строительство"
  );
  let currentGroup = null;

  metas.forEach((meta) => {
    const groupLabel = getGroupLabel(meta);

    if (groupLabel !== currentGroup) {
      currentGroup = groupLabel;

      const groupTitle = document.createElement("div");
      groupTitle.className = "check-group-label";
      groupTitle.textContent = groupLabel;
      container.appendChild(groupTitle);
    }

    const row = document.createElement("label");
    row.className = "check-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.seasonalityKey === meta.key;

    const color = getSeriesColor(meta, getStableSeriesIndex(meta));
    checkbox.style.accentColor = color;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.seasonalityKey = meta.key;
        state.seasonalityYears = new Set(getSeasonalityYears(meta));
        state.seasonalityYearsInitialized = true;
        state.seasonalityMonthStart = 0;
        state.seasonalityMonthEnd = 11;
        state.seasonalityMonthRangeInitialized = false;

        container
          .querySelectorAll('input[type="checkbox"]')
          .forEach((other) => {
            if (other !== checkbox) {
              other.checked = false;
            }
          });
      } else if (state.seasonalityKey === meta.key) {
        state.seasonalityKey = null;
        state.seasonalityYears = new Set();
        state.seasonalityYearsInitialized = false;
        state.seasonalityMonthStart = 0;
        state.seasonalityMonthEnd = 11;
        state.seasonalityMonthRangeInitialized = false;
      }

      buildSeasonalityYearsPanel();
      renderSeasonality();
    });

    const swatch = document.createElement("span");
    swatch.className = "check-swatch";
    swatch.style.background = color;

    const text = document.createElement("span");
    text.className = "check-label";
    text.textContent = getSeriesLabel(meta);

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);

    container.appendChild(row);
  });
}


function getSeasonalityMonths() {
  return MONTH_NAMES_RU.map((month) => month.slice(0, 3));
}


function getSeasonalitySeries(meta) {
  if (!meta || isAnnualSeries(meta)) return [];

  const years = getSeasonalityYears(meta);
  const visibleYears = new Set(state.seasonalityYears);
  const values = convertMonthlyValues(meta, state.seasonalityCurrency);
  const months = DATA.months;

  const result = years
    .filter((year) => visibleYears.has(year))
    .map((year) => {
      const data = MONTH_NAMES_RU.map((_, monthIndex) => {
        const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        const index = months.indexOf(key);

        if (index < 0) return null;

        const value = values[index];
        return value == null || !Number.isFinite(Number(value))
          ? null
          : Number(value);
      });

      const showOriginalPoints = isSparseMonthlySeries(data);
      let seriesData = interpolateMonthlyValues(data);

      if (state.seasonalityMode === "percent") {
        const findReference = (from) => {
          for (let i = from; i < seriesData.length; i++) {
            const point = seriesData[i];

            if (point != null && Number.isFinite(Number(point.value))) {
              return Number(point.value);
            }
          }

          return null;
        };

        const reference =
          findReference(state.seasonalityMonthStart) ?? findReference(0);

        if (reference != null && reference !== 0) {
          seriesData = seriesData.map((point) => {
            if (point == null) return null;

            return {
              value: (Number(point.value) / reference) * 100,
              isOriginal: point.isOriginal !== false,
            };
          });
        }
      }

      const color = SERIES_PALETTE[
        years.indexOf(year) % SERIES_PALETTE.length
      ];

      return {
        id: `seasonality-${meta.key}-${year}`,
        name: String(year),
        type: "line",
        data: seriesData,
        connectNulls: true,
        showSymbol: showOriginalPoints,
        showAllSymbol: showOriginalPoints,
        symbol: showOriginalPoints
          ? ((value, params) => {
              const point = params && params.data;
              return point && point.isOriginal === false
                ? "none"
                : "circle";
            })
          : "none",
        symbolSize: showOriginalPoints
          ? ((value, params) => {
              const point = params && params.data;
              return point && point.isOriginal === false ? 0 : 4;
            })
          : 0,
        triggerLineEvent: true,
        cursor: "pointer",
        lineStyle: { width: 1.5, opacity: 0.8, color },
        emphasis: { focus: "series", lineStyle: { width: 2.5 } },
        itemStyle: { color },
      };
    });

  if (state.seasonalityMode === "percent" && result.length) {
    result[0].markLine = buildBaselineMarkLine();
  }

  return result;
}


function buildSeasonalityYAxis(meta) {
  const percentMode = state.seasonalityMode === "percent";

  return {
    type: "value",
    position: "left",
    name: percentMode ? "%" : (isRateSeries(meta) ? "BYN/USD" : getDisplayUnit(meta)),
    nameTextStyle: { color: "#5B6673" },
    axisLabel: {
      color: "#8A97A6",
      formatter: (value) => formatValue(value, meta, percentMode),
    },
    axisLine: { show: false },
    splitLine: { show: true, lineStyle: { color: "#161C24" } },
  };
}


function buildSeasonalityTooltipFormatter(params) {
  if (!Array.isArray(params) || !params.length) return "";

  const meta = metaByKey(state.seasonalityKey);
  const activeId = state.hoveredSeasonalitySeriesId;

  const validParams = params.filter((param) => {
    const value = param.value && typeof param.value === "object"
      ? param.value.value
      : param.value;
    return value != null && Number.isFinite(Number(value));
  });

  if (!validParams.length) return "";

  const hasActive = Boolean(
    activeId &&
    validParams.some(
      (param) => param.seriesId === activeId || param.seriesName === activeId
    )
  );

  let html = `
    <div class="tt-header">
      <div class="tt-date">${params[0].axisValue}</div>
    </div>
    <div class="tt-list ${hasActive ? "has-active" : ""}">
  `;

  validParams.forEach((param) => {
    const value = param.value && typeof param.value === "object"
      ? param.value.value
      : param.value;

    const isApproximation =
      param.data &&
      typeof param.data === "object" &&
      param.data.isOriginal === false;

    const isActive = Boolean(
      activeId &&
      (param.seriesId === activeId || param.seriesName === activeId)
    );

    const color = param.color || "#3DDC84";
    const valueText = formatValue(
      value,
      meta,
      state.seasonalityMode === "percent"
    );

    html += `
      <div class="tt-row ${isActive ? "is-active" : ""}"
           data-series-id="${param.seriesId}"
           data-series-name="${param.seriesName || ""}"
           style="--row-color:${color};">
        <span class="tt-bar" style="background:${color};"></span>
        <span class="tt-dot" style="background:${color};"></span>
        <span class="tt-name">${param.seriesName}</span>
        <span class="tt-val">${valueText}${isApproximation ? " (аппр.)" : ""}</span>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}


function buildSeasonalityOption() {
  const meta = metaByKey(state.seasonalityKey);
  syncSeasonalityMonthState();
  const months = getSeasonalityMonths();

  return {
    backgroundColor: "transparent",
    animation: false,

    textStyle: {
      fontFamily: "var(--font-ui)",
    },

    grid: {
      left: state.seasonalityMode === "percent" ? 34 : 38,
      right: state.seasonalityMode === "percent" ? 34 : 38,
      top: meta ? 38 : 20,
      bottom: 84,
      containLabel: false,
    },

    axisPointer: {
      triggerEmphasis: false,
    },

    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: {
        type: "cross",
        label: { color: "#000" },
      },
      backgroundColor: "#12181F",
      borderColor: "#232B36",
      borderWidth: 1,
      padding: 12,
      textStyle: {
        color: "#E8ECF1",
        fontSize: 12,
      },
      extraCssText:
        "border-radius:8px;" +
        "box-shadow:0 8px 24px rgba(0,0,0,0.35);" +
        "pointer-events:none;",
      formatter: buildSeasonalityTooltipFormatter,
    },

    xAxis: {
      type: "category",
      data: months,
      boundaryGap: false,
      axisLabel: {
        color: "#8A97A6",
        margin: 12,
      },
      axisLine: {
        lineStyle: { color: "#232B36" },