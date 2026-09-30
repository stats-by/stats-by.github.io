/* ============================================================
   stats.by — V1
   Frontend для data.json v3
   ============================================================ */

"use strict";


/* ============================================================
   Сенсорные устройства (телефон / планшет)
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
   Линейная интерполяция разреженных месячных рядов
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
   Нормализация в проценты
   ============================================================ */

function normalizeToPercent(values, baseIndex) {
  if (!Array.isArray(values)) {
    return [];
  }

  let reference = null;

  for (let i = baseIndex; i < values.length; i++) {
    const value = values[i];

    if (
      value != null &&
      Number.isFinite(Number(value))
    ) {
      reference = Number(value);
      break;
    }
  }

  if (reference == null) {
    for (let i = 0; i < values.length; i++) {
      const value = values[i];

      if (
        value != null &&
        Number.isFinite(Number(value))
      ) {
        reference = Number(value);
        break;
      }
    }
  }

  if (
    reference == null ||
    reference === 0
  ) {
    return values.map(() => null);
  }

  return values.map((value) => {
    if (
      value == null ||
      !Number.isFinite(Number(value))
    ) {
      return null;
    }

    return (Number(value) / reference) * 100;
  });
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
   Построение панели показателей
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

  metas.forEach((meta, index) => {
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

  metas.forEach((meta, index) => {
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
      },
      axisTick: { show: false },
      splitLine: { show: false },
    },

    yAxis: meta
      ? buildSeasonalityYAxis(meta)
      : {
          type: "value",
          axisLabel: { color: "#8A97A6" },
          splitLine: { lineStyle: { color: "#161C24" } },
        },

    legend: {
      show: !!meta,
      type: "scroll",
      top: 0,
      left: 0,
      right: 0,
      itemWidth: 18,
      itemHeight: 2,
      textStyle: {
        color: "#8A97A6",
        fontSize: 11,
      },
    },

    dataZoom: buildSeasonalityDataZoom(),

    series: meta ? getSeasonalitySeries(meta) : [],
  };
}


function renderSeasonality() {
  if (!seasonalityChart || !DATA) {
    return;
  }

  seasonalityChart.setOption(
    buildSeasonalityOption(),
    {
      notMerge: true,
      lazyUpdate: false,
    }
  );

  buildSeasonalityYearsPanel();
  updateTooltipHighlight(
    document.getElementById("seasonalityChart"),
    state.hoveredSeasonalitySeriesId
  );
}


/* ============================================================
   Таймлайн (dataZoom) графика сезонности
   ============================================================ */

const SEASONALITY_MAX_INDEX = 11;


function seasonalityIndexToPercent(index) {
  return (index / SEASONALITY_MAX_INDEX) * 100;
}


function seasonalityPercentToIndex(percent) {
  return Math.max(
    0,
    Math.min(
      SEASONALITY_MAX_INDEX,
      Math.round((Number(percent) / 100) * SEASONALITY_MAX_INDEX)
    )
  );
}


function buildSeasonalityDataZoom() {
  syncSeasonalityMonthState();

  return [
    {
      type: "slider",
      xAxisIndex: 0,
      start: seasonalityIndexToPercent(state.seasonalityMonthStart),
      end: seasonalityIndexToPercent(state.seasonalityMonthEnd),
    },
  ];
}


function wireSeasonalityDataZoom() {
  if (!seasonalityChart) return;

  seasonalityChart.on("dataZoom", () => {
    const option = seasonalityChart.getOption();
    const zoom = option && option.dataZoom && option.dataZoom[0];

    if (!zoom) return;

    const startPercent = Number(zoom.start);
    const endPercent = Number(zoom.end);

    if (!Number.isFinite(startPercent) || !Number.isFinite(endPercent)) {
      return;
    }

    let start = seasonalityPercentToIndex(startPercent);
    let end = seasonalityPercentToIndex(endPercent);

    if (end < start) {
      [start, end] = [end, start];
    }

    if (
      start === state.seasonalityMonthStart &&
      end === state.seasonalityMonthEnd
    ) {
      return;
    }

    state.seasonalityMonthStart = start;
    state.seasonalityMonthEnd = end;
    state.seasonalityMonthRangeInitialized = true;

    if (state.seasonalityMode === "percent") {
      const meta = metaByKey(state.seasonalityKey);

      if (meta) {
        seasonalityChart.setOption({ series: getSeasonalitySeries(meta) });
      }
    }
  });
}


/* ============================================================
   Значения по умолчанию
   ============================================================ */

function clearIndicators() {
  state.hoveredMainSeriesId = null;
  updateTooltipHighlight(document.getElementById("chart"), null);

  const metas = getSeriesMeta();

  metas.forEach((meta) => {
    state.visible[meta.key] = false;
  });

  const checkboxList = document.getElementById("checkboxList");

  if (checkboxList) {
    checkboxList
      .querySelectorAll('input[type="checkbox"]')
      .forEach((checkbox) => {
        checkbox.checked = false;
      });
  }

  render();
}


function initializeVisibility() {
  const metas = getSeriesMeta();

  metas.forEach((meta) => {
    state.visible[meta.key] = false;
  });

  const defaultKeys = new Set([
    "средняя_средняя_минск",
    "средняя_средняя_по_стране",
    "курс_usd_курс_usd_byn",
  ]);

  metas.forEach((meta) => {
    if (defaultKeys.has(meta.key)) {
      state.visible[meta.key] = true;
    }
  });
}


/* ============================================================
   Поиск начального диапазона
   ============================================================ */

function findDefaultZoomStart() {
  const months = DATA.months;

  const index = months.indexOf("2025-01");

  if (index >= 0 && months.length > 1) {
    return (index / (months.length - 1)) * 100;
  }

  const fallbackStart = Math.max(0, months.length - 24);

  return months.length > 1
    ? (fallbackStart / (months.length - 1)) * 100
    : 0;
}


/* ============================================================
   Подсветка активной линии и строки в тултипе
   ============================================================ */

function updateTooltipHighlight(chartContainer, activeSeriesId) {
  if (!chartContainer) return;
  const list = chartContainer.querySelector(".tt-list");
  if (!list) return;

  const rows = list.querySelectorAll(".tt-row");
  let anyActive = false;

  rows.forEach((row) => {
    const rowId = row.dataset.seriesId;
    const rowName = row.dataset.seriesName;
    const isActive = Boolean(
      activeSeriesId && (rowId === activeSeriesId || rowName === activeSeriesId)
    );

    if (isActive) {
      anyActive = true;
      row.classList.add("is-active");
    } else {
      row.classList.remove("is-active");
    }
  });

  if (anyActive) {
    list.classList.add("has-active");
  } else {
    list.classList.remove("has-active");
  }
}

function attachLineHoverHighlight(chartInstance, chartElement, chartType) {
  if (!chartInstance || !chartElement) return;

  if (IS_TOUCH) return;

  let rafId = null;
  let lastHoveredId = null;

  function setActiveSeries(seriesId) {
    if (lastHoveredId === seriesId) return;
    const prevId = lastHoveredId;
    lastHoveredId = seriesId;

    if (chartType === "main") {
      state.hoveredMainSeriesId = seriesId;
    } else {
      state.hoveredSeasonalitySeriesId = seriesId;
    }

    updateTooltipHighlight(chartElement, seriesId);

    try {
      if (prevId) {
        chartInstance.dispatchAction({
          type: "downplay",
          seriesId: prevId,
        });
      }
      if (seriesId) {
        chartInstance.dispatchAction({
          type: "highlight",
          seriesId: seriesId,
        });
      } else {
        chartInstance.dispatchAction({
          type: "downplay",
        });
      }
    } catch (e) {
      // Игнорируем некритичные исключения ECharts
    }
  }

  chartInstance.on("mouseover", (params) => {
    if (params && params.componentType === "series") {
      const id = params.seriesId || params.seriesName;
      if (id) {
        setActiveSeries(id);
      }
    }
  });

  if (chartInstance.getZr) {
    chartInstance.getZr().on("mousemove", (e) => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;

        const x = e.offsetX;
        const y = e.offsetY;

        if (
          typeof chartInstance.containPixel === "function" &&
          !chartInstance.containPixel({ gridIndex: 0 }, [x, y])
        ) {
          setActiveSeries(null);
          return;
        }

        const option = chartInstance.getOption();
        if (!option || !Array.isArray(option.series) || !option.series.length) {
          setActiveSeries(null);
          return;
        }

        let coord;
        try {
          coord = chartInstance.convertFromPixel({ gridIndex: 0 }, [x, y]);
        } catch (err) {
          return;
        }

        if (!coord || !Number.isFinite(coord[0])) {
          setActiveSeries(null);
          return;
        }

        const dataX = coord[0];
        const THRESHOLD = 24;
        const HYSTERESIS = 4;

        let minDistance = Infinity;
        let bestSeriesId = null;
        let activeSeriesDistance = Infinity;

        option.series.forEach((seriesItem, sIdx) => {
          if (!seriesItem || !Array.isArray(seriesItem.data)) return;

          const data = seriesItem.data;
          const len = data.length;
          if (len === 0) return;

          const idx0 = Math.max(0, Math.min(len - 1, Math.floor(dataX)));
          const idx1 = Math.max(0, Math.min(len - 1, Math.ceil(dataX)));

          const extractVal = (item) => {
            if (item == null) return null;
            if (typeof item === "object") {
              return item.value != null && Number.isFinite(Number(item.value))
                ? Number(item.value)
                : null;
            }
            return Number.isFinite(Number(item)) ? Number(item) : null;
          };

          const v0 = extractVal(data[idx0]);
          const v1 = extractVal(data[idx1]);

          if (v0 == null && v1 == null) return;

          let vInterp;
          if (v0 == null) {
            vInterp = v1;
          } else if (v1 == null) {
            vInterp = v0;
          } else if (idx0 === idx1) {
            vInterp = v0;
          } else {
            const frac = dataX - idx0;
            vInterp = v0 + (v1 - v0) * frac;
          }

          let pixel;
          try {
            pixel = chartInstance.convertToPixel(
              { seriesIndex: sIdx },
              [dataX, vInterp]
            );
          } catch (err) {
            return;
          }

          if (!pixel || !Number.isFinite(pixel[1])) return;

          const dist = Math.abs(y - pixel[1]);
          const sId = seriesItem.id || seriesItem.name;

          if (sId === lastHoveredId) {
            activeSeriesDistance = dist;
          }

          if (dist < minDistance) {
            minDistance = dist;
            bestSeriesId = sId;
          }
        });

        if (
          lastHoveredId &&
          activeSeriesDistance <= THRESHOLD &&
          activeSeriesDistance <= minDistance + HYSTERESIS
        ) {
          return;
        }

        if (minDistance <= THRESHOLD && bestSeriesId) {
          setActiveSeries(bestSeriesId);
        } else {
          setActiveSeries(null);
        }
      });
    });

    chartInstance.getZr().on("globalout", () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setActiveSeries(null);
    });
  }

  chartElement.addEventListener("mouseleave", () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    setActiveSeries(null);
  });

  chartInstance.on("hideTip", () => {
    setActiveSeries(null);
  });
}


/* ============================================================
   Построение линий
   ============================================================ */

function buildSeries() {
  const months = DATA.months;

  const baseIndex = Math.round(
    (state.zoomStart / 100) * (months.length - 1)
  );

  const metas = getSeriesMeta();

  const visibleMetas = metas.filter(
    (meta) => state.visible[meta.key]
  );

  const result = visibleMetas.map((meta) => {
    const rawValues = getSeriesValues(meta);
    const shouldInterpolate = !isAnnualSeries(meta);

    let values = shouldInterpolate
      ? interpolateMonthlyValues(rawValues)
      : rawValues.map((value) => {
          if (value == null || !Number.isFinite(Number(value))) {
            return null;
          }

          return {
            value: Number(value),
            isOriginal: true,
          };
        });

    if (state.mode === "percent") {
      values = normalizeSeriesPointsToPercent(values, baseIndex);
    }

    const metaIndex = metas.indexOf(meta);
    const color = getSeriesColor(
      meta,
      metaIndex < 0 ? 0 : metaIndex
    );

    let yAxisIndex = 0;

    if (state.mode === "absolute") {
      if (
        isPercentSeries(meta) ||
        isRateSeries(meta)
      ) {
        yAxisIndex = 1;
      }
    }

    const showOriginalPoints =
      isAnnualSeries(meta) ||
      isSparseMonthlySeries(rawValues);

    const hasInterpolatedValues = values.some(
      (point) => point && point.isOriginal === false
    );

    return {
      id: meta.key,
      name: getSeriesLabel(meta),
      type: "line",

      data: values,

      yAxisIndex,

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
            return point && point.isOriginal === false ? 0 : 6;
          })
        : 0,

      connectNulls: true,

      sampling: hasInterpolatedValues ? undefined : "lttb",

      triggerLineEvent: true,
      cursor: "pointer",

      lineStyle: {
        color,
        width: 2,
      },

      itemStyle: {
        color,
      },

      emphasis: {
        focus: "series",
        lineStyle: {
          width: 3,
        },
      },

      z: (
        isPercentSeries(meta) ||
        isRateSeries(meta)
      ) ? 5 : 3,

      symbolKeepAspect: true,
    };
  });

  if (state.mode === "percent" && result.length) {
    result[0].markLine = buildBaselineMarkLine();
  }

  return result;
}


/* ============================================================
   Форматирование X-оси
   ============================================================ */

let monthIndexMap = null;

function getMonthIndex(month) {
  if (!monthIndexMap) {
    monthIndexMap = new Map(
      DATA.months.map((value, index) => [value, index])
    );
  }

  return monthIndexMap.get(month);
}


function getMainGridSide() {
  return state.mode === "percent" ? 34 : 38;
}


function getLiveXWindow() {
  const last = DATA.months.length - 1;
  let start = null;
  let end = null;

  try {
    const model = chart && chart.getModel && chart.getModel();
    const zoomModel = model && model.getComponent("dataZoom", 0);
    const range =
      zoomModel && zoomModel.getValueRange && zoomModel.getValueRange();

    if (
      Array.isArray(range) &&
      Number.isFinite(range[0]) &&
      Number.isFinite(range[1])
    ) {
      start = Math.round(range[0]);
      end = Math.round(range[1]);
    }
  } catch (error) {
    start = null;
  }

  if (start == null || end == null) {
    start = Math.round((state.zoomStart / 100) * last);
    end = Math.round((state.zoomEnd / 100) * last);
  }

  start = Math.max(0, Math.min(last, start));
  end = Math.max(0, Math.min(last, end));

  if (end < start) {
    [start, end] = [end, start];
  }

  return [start, end];
}


let xTickLayoutCache = null;

function getXTickLayout() {
  const [start, end] = getLiveXWindow();
  const width = chart ? chart.getWidth() : 0;
  const key = `${start}|${end}|${width}|${getMainGridSide()}`;

  if (xTickLayoutCache && xTickLayoutCache.key === key) {
    return xTickLayoutCache;
  }

  const months = DATA.months;
  const gridWidth = Math.max(
    120,
    (width || 800) - 2 * getMainGridSide()
  );
  const pxPerMonth = gridWidth / Math.max(1, end - start);

  const januaries = new Set();

  for (let i = start + 1; i < end; i++) {
    if (months[i].slice(5, 7) === "01") {
      januaries.add(i);
    }
  }

  const minSpacing = X_YEAR_LABEL_PX + X_LABEL_GAP_PX;
  let step = X_YEAR_STEPS[X_YEAR_STEPS.length - 1];

  for (const candidate of X_YEAR_STEPS) {
    if (candidate * 12 * pxPerMonth >= minSpacing) {
      step = candidate;
      break;
    }
  }

  const safeEdge =
    X_EDGE_LABEL_PX + X_LABEL_GAP_PX + X_YEAR_LABEL_PX / 2;

  const labels = new Set([start, end]);

  januaries.forEach((index) => {
    const year = Number(months[index].slice(0, 4));

    if (year % step !== 0) {
      return;
    }

    const x = (index - start) * pxPerMonth;

    if (x < safeEdge || gridWidth - x < safeEdge) {
      return;
    }

    labels.add(index);
  });

  xTickLayoutCache = { key, start, end, labels, januaries };

  return xTickLayoutCache;
}


function formatXAxisLabel(value) {
  if (!isYearMonth(value)) {
    return value;
  }

  const index = getMonthIndex(value);
  const layout = getXTickLayout();

  if (index === layout.start || index === layout.end) {
    return `${MONTH_SHORT_RU[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  }

  if (layout.labels.has(index)) {
    return value.slice(0, 4);
  }

  return "";
}


/* ============================================================
   Пунктирная линия 100% (для процентных графиков)
   ============================================================ */

function buildBaselineMarkLine() {
  return {
    silent: true,
    animation: false,
    symbol: ["none", "none"],
    label: { show: false },
    lineStyle: {
      color: BASELINE_COLOR,
      width: 1,
      type: "dashed",
    },
    emphasis: { lineStyle: { width: 1 } },
    blur: { lineStyle: { opacity: 1 } },
    data: [{ yAxis: 100 }],
  };
}


/* ============================================================
   Опции Y-осей
   ============================================================ */

function buildYAxes() {
  const textSecondary = "#8A97A6";
  const textTertiary = "#5B6673";
  const splitColor = "#161C24";

  if (state.mode === "percent") {
    return [
      {
        type: "value",
        position: "left",

        name: "%",

        nameTextStyle: {
          color: textTertiary,
        },

        axisLabel: {
          color: textSecondary,
          formatter: (value) => `${value}%`,
        },

        splitLine: {
          show: true,

          lineStyle: {
            color: splitColor,
          },
        },

        axisLine: {
          show: false,
        },
      },
    ];
  }

  return [
    {
      type: "value",

      position: "left",

      name: `Деньги, ${state.currency}`,

      nameTextStyle: {
        color: textTertiary,
      },

      axisLabel: {
        color: textSecondary,

        formatter: (value) => {
          return Number(value).toLocaleString("ru-RU");
        },
      },

      axisPointer: {
        label: {
          formatter: (params) => {
            return String(Math.round(Number(params.value)));
          },
        },
      },

      splitLine: {
        show: true,

        lineStyle: {
          color: splitColor,
        },
      },

      axisLine: {
        show: false,
      },
    },

    {
      type: "value",

      position: "right",

      name: "Ставки / курс",

      nameTextStyle: {
        color: textTertiary,
      },

      axisLabel: {
        color: textSecondary,

        formatter: (value) => {
          return Number(value).toLocaleString(
            "ru-RU",
            {
              maximumFractionDigits: 2,
            }
          );
        },
      },

      axisPointer: {
        label: {
          formatter: (params) => {
            return Number(params.value).toFixed(2);
          },
        },
      },

      splitLine: {
        show: false,
      },

      axisLine: {
        show: false,
      },
    },
  ];
}


/* ============================================================
   Tooltip
   ============================================================ */

function buildTooltipFormatter(params) {
  if (!params || params.length === 0) {
    return "";
  }

  const first = params[0];
  const dataIndex = first.dataIndex;
  const month = DATA.months[dataIndex];

  const activeId = state.hoveredMainSeriesId;

  const validParams = params.filter((param) => {
    const meta = metaByKey(param.seriesId);
    if (!meta) {
      return false;
    }

    const rawValue = param.value && typeof param.value === "object"
      ? param.value.value
      : param.value;

    return rawValue != null && Number.isFinite(Number(rawValue));
  });

  if (!validParams.length) {
    return "";
  }

  const hasActive = Boolean(
    activeId &&
    validParams.some(
      (param) => param.seriesId === activeId || param.seriesName === activeId
    )
  );

  let html = `
    <div class="tt-header">
      <div class="tt-date">${fmtMonthRu(month)}</div>
    </div>
    <div class="tt-list ${hasActive ? "has-active" : ""}">
  `;

  validParams.forEach((param) => {
    const meta = metaByKey(param.seriesId);
    const rawValue = param.value && typeof param.value === "object"
      ? param.value.value
      : param.value;

    const isApproximation =
      param.data &&
      typeof param.data === "object" &&
      param.data.isOriginal === false;

    const color =
      param.color ||
      getSeriesColor(meta, getStableSeriesIndex(meta));

    const valueText = formatValue(
      rawValue,
      meta,
      state.mode === "percent"
    );

    const isActive = Boolean(
      activeId &&
      (param.seriesId === activeId || param.seriesName === activeId)
    );

    html += `
      <div class="tt-row ${isActive ? "is-active" : ""}"
           data-series-id="${param.seriesId}"
           data-series-name="${param.seriesName || ""}"
           style="--row-color:${color};">
        <span class="tt-bar" style="background:${color};"></span>
        <span class="tt-dot" style="background:${color};"></span>
        <span class="tt-name">${getSeriesLabel(meta)}</span>
        <span class="tt-val">${valueText}${isApproximation ? " (аппр.)" : ""}</span>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}


/* ============================================================
   Построение основной ECharts option
   ============================================================ */

/*
 * Таймлайн (dataZoom slider) в стиле DefiLlama:
 *   - светлый контур слота;
 *   - mini-preview выбранных рядов (dataBackground);
 *   - крупные ручки (handle) с кастомной иконкой;
 *   - увеличенная высота, чтобы удобно было попадать пальцем.
 */
function buildMainDataZoom(months) {
  const textTertiary = "#5B6673";

  return [
    {
      type: "slider",
      xAxisIndex: 0,

      start: state.zoomStart,
      end: state.zoomEnd,

      brushSelect: false,

      height: 44,
      bottom: 24,

      borderColor: "#3A4450",
      borderWidth: 1,
      borderRadius: 6,

      backgroundColor: "#0D1218",

      fillerColor: "rgba(61,220,132,0.10)",

      /* Крупные ручки. Иконка — «плашка с насечками». */
      handleSize: 40,
      handleStyle: {
        color: "#2A3440",
        borderColor: "#8A97A6",
        borderWidth: 1,
        shadowBlur: 0,
        shadowColor: "transparent",
      },
      handleIcon:
        "path://M-2,0 H2 V40 H-2 Z " +
        "M-1.4,8 V32 M0,8 V32 M1.4,8 V32",

      /* «Шапка» для перетаскивания всего окна. */
      moveHandleSize: 12,
      moveHandleStyle: {
        color: "#3A4450",
        opacity: 0.75,
        borderColor: "#5B6673",
        borderWidth: 0,
      },

      /* Mini-preview рядов внутри слота. */
      showDataShadow: true,
      dataBackground: {
        lineStyle: {
          color: "#5B6673",
          width: 0.8,
          opacity: 0.55,
        },
        areaStyle: {
          color: "#3DDC84",
          opacity: 0.10,
        },
      },
      selectedDataBackground: {
        lineStyle: {
          color: "#3DDC84",
          width: 1,
          opacity: 0.9,
        },
        areaStyle: {
          color: "#3DDC84",
          opacity: 0.24,
        },
      },

      textStyle: {
        color: textTertiary,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
      },

      labelFormatter: (value, valueStr) => {
        const index = Math.round(value);
        const month = months[index];
        return month || valueStr;
      },
    },

    ...(IS_TOUCH
      ? []
      : [
          {
            type: "inside",

            xAxisIndex: 0,

            start: state.zoomStart,
            end: state.zoomEnd,

            zoomOnMouseWheel: true,

            moveOnMouseMove: true,

            moveOnMouseWheel: true,
          },
        ]),
  ];
}


function buildOption() {
  const months = DATA.months;

  const textSecondary = "#8A97A6";
  const textTertiary = "#5B6673";

  return {
    backgroundColor: "transparent",

    animation: false,

    textStyle: {
      fontFamily: "var(--font-ui)",
    },

    grid: {
      left: getMainGridSide(),
      right: getMainGridSide(),
      top: 42,
      bottom: 96,

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

        label: {
          color: "#000",
        },
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

      formatter: buildTooltipFormatter,
    },

    xAxis: {
      type: "category",

      data: months,

      boundaryGap: false,

      axisLabel: {
        color: textSecondary,

        margin: 12,

        hideOverlap: true,

        interval: (index) => getXTickLayout().labels.has(index),
        showMinLabel: true,
        showMaxLabel: true,
        alignMinLabel: "left",
        alignMaxLabel: "right",

        formatter: formatXAxisLabel,
      },

      axisLine: {
        lineStyle: {
          color: "#232B36",
        },
      },

      axisTick: {
        show: false,
      },

      splitLine: {
        show: true,
        showMinLine: false,
        showMaxLine: false,
        interval: (index) => getXTickLayout().januaries.has(index),
        lineStyle: {
          color: X_GRID_COLOR,
          width: 1,
        },
      },
    },

    yAxis: buildYAxes(),

    dataZoom: buildMainDataZoom(months),

    series: buildSeries(),
  };
}


/* ============================================================
   Рендер
   ============================================================ */

function render() {
  if (!chart || !DATA) {
    return;
  }

  chart.setOption(
    buildOption(),
    {
      notMerge: true,
      lazyUpdate: false,
    }
  );

  updateTooltipHighlight(
    document.getElementById("chart"),
    state.hoveredMainSeriesId
  );
}


/* ============================================================
   Переключатели
   ============================================================ */

function wireSegmented(id, onChange) {
  const element = document.getElementById(id);

  if (!element) {
    console.warn(`Элемент #${id} не найден.`);
    return;
  }

  const buttons =
    element.querySelectorAll(".segmented-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.remove("is-active");
      });

      button.classList.add("is-active");

      onChange(button.dataset.value);
    });
  });
}


function syncSegmented(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.querySelectorAll(".segmented-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.value === value);
  });
}


/* ============================================================
   Deep Linking
   ============================================================ */

function parseDeepLinkList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}


function getMonthFromZoomPercent(percent) {
  if (!DATA || !Array.isArray(DATA.months) || !DATA.months.length) {
    return null;
  }

  const denominator = Math.max(1, DATA.months.length - 1);
  const index = Math.max(0, Math.min(denominator, Math.round((Number(percent) / 100) * denominator)));

  return DATA.months[index] || null;
}


function getZoomPercentFromMonth(month) {
  if (!DATA || !Array.isArray(DATA.months) || DATA.months.length < 2) {
    return null;
  }

  const index = DATA.months.indexOf(month);

  if (index < 0) {
    return null;
  }

  return (index / (DATA.months.length - 1)) * 100;
}


function buildDeepLinkUrl(source) {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();

  params.set("g", source === "seasonality" ? "2" : "1");

  if (source === "seasonality") {
    params.set("s", state.seasonalityKey || "");
    params.set(
      "y",
      Array.from(state.seasonalityYears)
        .sort((a, b) => a - b)
        .join(",")
    );
    params.set("c", state.seasonalityCurrency);
    params.set("m", state.seasonalityMode);
    params.set(
      "r",
      `${state.seasonalityMonthStart},${state.seasonalityMonthEnd}`
    );
  } else {
    params.set(
      "i",
      getSeriesMeta()
        .filter((meta) => state.visible[meta.key])
        .map((meta) => meta.key)
        .join(",")
    );
    params.set("c", state.currency);
    params.set("m", state.mode);

    const startMonth = getMonthFromZoomPercent(state.zoomStart);
    const endMonth = getMonthFromZoomPercent(state.zoomEnd);

    if (startMonth && endMonth) {
      params.set("z", `${startMonth},${endMonth}`);
    }
  }

  url.search = params.toString();
  return url.toString();
}


function setShareButtonIcon(button, copied) {
  if (!button) {
    return;
  }

  button.innerHTML = copied
    ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>`;

  button.setAttribute(
    "aria-label",
    copied ? "Ссылка скопирована" : button.dataset.defaultAriaLabel
  );
}


async function copyDeepLink(source, button) {
  const url = buildDeepLinkUrl(source);

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) {
        throw new Error("Не удалось скопировать ссылку в буфер обмена.");
      }
    }

    setShareButtonIcon(button, true);

    if (button._deepLinkTimer) {
      clearTimeout(button._deepLinkTimer);
    }

    button._deepLinkTimer = setTimeout(() => {
      setShareButtonIcon(button, false);
      button._deepLinkTimer = null;
    }, 3000);
  } catch (error) {
    console.error("Не удалось скопировать Deep Link:", error);
  }
}


function wireDeepLinkButton(id, source) {
  const button = document.getElementById(id);

  if (!button) {
    return;
  }

  button.dataset.defaultAriaLabel = button.getAttribute("aria-label") || "Скопировать ссылку";

  button.addEventListener("click", () => {
    copyDeepLink(source, button);
  });
}


function restoreDeepLinkState() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("g");

  if (source === "1") {
    const validKeys = new Set(getSeriesMeta().map((meta) => meta.key));
    const keys = parseDeepLinkList(params.get("i"));

    getSeriesMeta().forEach((meta) => {
      state.visible[meta.key] = false;
    });

    keys.forEach((key) => {
      if (validKeys.has(key)) {
        state.visible[key] = true;
      }
    });

    const currency = params.get("c");
    const mode = params.get("m");

    if (currency === "BYN" || currency === "USD") {
      state.currency = currency;
    }

    if (mode === "absolute" || mode === "percent") {
      state.mode = mode;
    }

    const range = parseDeepLinkList(params.get("z"));
    const startPercent = getZoomPercentFromMonth(range[0]);
    const endPercent = getZoomPercentFromMonth(range[1]);

    if (startPercent != null && endPercent != null) {
      state.zoomStart = Math.min(startPercent, endPercent);
      state.zoomEnd = Math.max(startPercent, endPercent);
    }

    state.lastZoomStart = state.zoomStart;
    state.lastZoomEnd = state.zoomEnd;
    state.zoomAnchorEnd = state.zoomEnd;
    state.zoomPreset = null;

    syncSegmented("currencyToggle", state.currency);
    syncSegmented("modeToggle", state.mode);

    return "main";
  }

  if (source === "2") {
    const validKeys = new Set(
      getSeriesMeta()
        .filter((meta) => getGroupLabel(meta) !== "Строительство")
        .map((meta) => meta.key)
    );
    const seasonalityKey = params.get("s");

    if (seasonalityKey && validKeys.has(seasonalityKey)) {
      state.seasonalityKey = seasonalityKey;
    } else if (seasonalityKey === "") {
      state.seasonalityKey = null;
    }

    const currency = params.get("c");
    const mode = params.get("m");

    if (currency === "BYN" || currency === "USD") {
      state.seasonalityCurrency = currency;
    }

    if (mode === "absolute" || mode === "percent") {
      state.seasonalityMode = mode;
    }

    const meta = metaByKey(state.seasonalityKey);
    const availableYears = new Set(getSeasonalityYears(meta));
    const years = parseDeepLinkList(params.get("y"))
      .map((year) => Number(year))
      .filter((year) => Number.isInteger(year) && availableYears.has(year));

    state.seasonalityYears = new Set(years);
    state.seasonalityYearsInitialized = true;

    const range = parseDeepLinkList(params.get("r"))
      .map((value) => Number(value));

    if (range.length === 2 && range.every((value) => Number.isInteger(value))) {
      state.seasonalityMonthStart = Math.max(0, Math.min(11, range[0]));
      state.seasonalityMonthEnd = Math.max(
        state.seasonalityMonthStart,
        Math.min(11, range[1])
      );
      state.seasonalityMonthRangeInitialized = true;
    }

    syncSegmented("seasonalityCurrencyToggle", state.seasonalityCurrency);
    syncSegmented("seasonalityModeToggle", state.seasonalityMode);

    return "seasonality";
  }

  return null;
}


function focusDeepLinkSource(source) {
  if (source !== "seasonality") {
    return;
  }

  const section = document.querySelector(".seasonality-chart-section");

  if (section) {
    requestAnimationFrame(() => {
      section.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }
}

/* ============================================================
   Обновление подсказки процентного режима
   ============================================================ */

function updatePercentHint() {
  const hint = document.getElementById("percentHint");

  if (!hint) {
    return;
  }

  hint.hidden = state.mode !== "percent";
}


/* ============================================================
   Обновление даты данных
   ============================================================ */

function updateDataUpTo() {
  const element = document.getElementById("dataUpTo");

  if (!element || !DATA.months.length) {
    return;
  }

  element.textContent = fmtMonthRu(
    DATA.months[DATA.months.length - 1]
  );
}


/* ============================================================
   Границы данных выбранных рядов
   ============================================================ */

function getVisibleSeriesBounds() {
  const months = DATA.months;
  const metas = getSeriesMeta().filter(
    (meta) => state.visible[meta.key]
  );

  if (!metas.length || !months.length) {
    return null;
  }

  let minIndex = months.length - 1;
  let maxIndex = 0;
  let hasValue = false;

  metas.forEach((meta) => {
    const values = getSeriesValues(meta);

    values.forEach((value, index) => {
      if (
        value == null ||
        !Number.isFinite(Number(value))
      ) {
        return;
      }

      hasValue = true;
      minIndex = Math.min(minIndex, index);
      maxIndex = Math.max(maxIndex, index);
    });
  });

  if (!hasValue) {
    return null;
  }

  const denominator = Math.max(1, months.length - 1);

  return {
    start: (minIndex / denominator) * 100,
    end: (maxIndex / denominator) * 100,
  };
}


function setZoomByPreset(preset) {
  const months = DATA.months;
  const bounds = getVisibleSeriesBounds();

  if (!months.length) {
    return;
  }

  const denominator = Math.max(1, months.length - 1);

  if (!bounds) {
    state.zoomStart = 0;
    state.zoomEnd = 100;
  } else if (preset === "all") {
    state.zoomStart = bounds.start;
    state.zoomEnd = bounds.end;
  } else {
    const periodMonths = {
      "1y": 12,
      "5y": 60,
      "10y": 120,
      "15y": 180,
    }[preset];

    if (!periodMonths) {
      return;
    }

    const maxIndex = Math.round(
      (bounds.end / 100) * denominator
    );
    const minIndex = Math.round(
      (bounds.start / 100) * denominator
    );

    const startIndex = Math.max(
      minIndex,
      maxIndex - periodMonths + 1
    );

    state.zoomStart = (startIndex / denominator) * 100;
    state.zoomEnd = bounds.end;
  }

  state.zoomAnchorEnd = state.zoomEnd;
  state.zoomPreset = preset;
  state.lastZoomStart = state.zoomStart;
  state.lastZoomEnd = state.zoomEnd;
  state.correctingZoom = false;
  state.hoveredMainSeriesId = null;
  updateTooltipHighlight(document.getElementById("chart"), null);

  updateZoomPresetButtons();
  render();
}


function updateZoomPresetButtons() {
  const container = document.getElementById("zoomPresets");

  if (!container) {
    return;
  }

  container.querySelectorAll(".zoom-preset-btn").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.value === state.zoomPreset
    );
  });
}


function fitZoomToVisibleSeries() {
  const bounds = getVisibleSeriesBounds();

  if (!bounds) {
    state.zoomStart = 0;
    state.zoomEnd = 100;
  } else {
    state.zoomStart = bounds.start;
    state.zoomEnd = bounds.end;
  }

  state.lastZoomStart = state.zoomStart;
  state.lastZoomEnd = state.zoomEnd;
}


/* ============================================================
   Сброс диапазона
   ============================================================ */

function resetZoom() {
  state.hoveredMainSeriesId = null;
  updateTooltipHighlight(document.getElementById("chart"), null);

  state.zoomStart = 0;
  state.zoomEnd = 100;

  state.lastZoomStart = 0;
  state.lastZoomEnd = 100;

  render();
}


/* ============================================================
   Обработка изменения dataZoom
   ============================================================ */

function wireDataZoom() {
  if (chart && chart.getZr) {
    chart.getZr().on("mousewheel", () => {
      state.wheelZoomAt = Date.now();
    });

    chart.getZr().on("wheel", () => {
      state.wheelZoomAt = Date.now();
    });
  }

  chart.on("dataZoom", (params) => {
    const option = chart.getOption();

    if (
      !option ||
      !option.dataZoom ||
      !option.dataZoom.length
    ) {
      return;
    }

    const slider = option.dataZoom[0];

    let start = Number(slider.start);
    let end = Number(slider.end);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return;
    }

    start = Math.max(0, Math.min(100, start));
    end = Math.max(0, Math.min(100, end));

    if (end < start) {
      [start, end] = [end, start];
    }

    if (state.correctingZoom) {
      state.correctingZoom = false;
      state.zoomStart = start;
      state.zoomEnd = end;
      state.lastZoomStart = start;
      state.lastZoomEnd = end;
      state.zoomAnchorEnd = end;
      updateZoomPresetButtons();
      return;
    }

    const previousStart = state.lastZoomStart;
    const previousEnd = state.lastZoomEnd;
    const previousWidth = previousEnd - previousStart;
    const currentWidth = end - start;

    const startChanged =
      Math.abs(start - previousStart) > 0.000001;
    const endChanged =
      Math.abs(end - previousEnd) > 0.000001;

    const isWheelZoom =
      Date.now() - state.wheelZoomAt < 100;

    state.zoomPreset = null;
    updateZoomPresetButtons();

    if (IS_TOUCH) {
      state.zoomStart = start;
      state.zoomEnd = end;
      state.lastZoomStart = start;
      state.lastZoomEnd = end;
      state.zoomAnchorEnd = end;
      return;
    }

    if (!isWheelZoom && startChanged && !endChanged) {
      state.zoomStart = start;
      state.zoomEnd = previousEnd;
      state.lastZoomStart = start;
      state.lastZoomEnd = previousEnd;
      state.zoomAnchorEnd = previousEnd;
      return;
    }

    if (!isWheelZoom && !startChanged && endChanged) {
      state.zoomStart = previousStart;
      state.zoomEnd = end;
      state.lastZoomStart = previousStart;
      state.lastZoomEnd = end;
      state.zoomAnchorEnd = end;
      return;
    }

    if (
      !isWheelZoom &&
      startChanged &&
      endChanged &&
      Math.abs(currentWidth - previousWidth) <= 0.000001
    ) {
      state.zoomStart = start;
      state.zoomEnd = end;
      state.lastZoomStart = start;
      state.lastZoomEnd = end;
      state.zoomAnchorEnd = end;
      return;
    }

    let correctedStart;
    let correctedEnd;

    if (currentWidth < previousWidth - 0.000001) {
      correctedEnd = previousEnd;
      correctedStart = correctedEnd - currentWidth;
    } else if (currentWidth > previousWidth + 0.000001) {
      correctedEnd = previousEnd;
      correctedStart = correctedEnd - currentWidth;

      if (correctedStart < 0) {
        correctedStart = 0;
        correctedEnd = currentWidth;
      }
    } else {
      correctedStart = previousStart;
      correctedEnd = previousEnd;
    }

    correctedStart = Math.max(0, Math.min(100, correctedStart));
    correctedEnd = Math.max(
      correctedStart,
      Math.min(100, correctedEnd)
    );

    const changed =
      Math.abs(correctedStart - start) > 0.000001 ||
      Math.abs(correctedEnd - end) > 0.000001;

    state.zoomStart = correctedStart;
    state.zoomEnd = correctedEnd;
    state.lastZoomStart = correctedStart;
    state.lastZoomEnd = correctedEnd;
    state.zoomAnchorEnd = correctedEnd;

    if (changed) {
      state.correctingZoom = true;

      chart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex: IS_TOUCH ? [0] : [0, 1],
        start: correctedStart,
        end: correctedEnd,
      });
    }

    if (state.mode === "percent") {
      render();
    }
  });
}

/* ============================================================
   Инициализация
   ============================================================ */

async function init() {
  try {
    resolveCssColors();

    DATA = await loadData();

    initializeVisibility();

    const defaultSeasonalityMeta = metaByKey(state.seasonalityKey);
    if (defaultSeasonalityMeta) {
      state.seasonalityYears = new Set(
        getSeasonalityYears(defaultSeasonalityMeta)
      );
      state.seasonalityYearsInitialized = true;
    }

    const deepLinkSource = restoreDeepLinkState();

    if (deepLinkSource !== "main") {
      const defaultBounds = getVisibleSeriesBounds();

      if (defaultBounds) {
        const denominator = Math.max(1, DATA.months.length - 1);
        const tenYears = (120 / denominator) * 100;

        state.zoomEnd = defaultBounds.end;
        state.zoomStart = Math.max(
          defaultBounds.start,
          state.zoomEnd - tenYears + (100 / denominator)
        );
      } else {
        state.zoomStart = 0;
        state.zoomEnd = 100;
      }

      state.lastZoomStart = state.zoomStart;
      state.lastZoomEnd = state.zoomEnd;
      state.zoomAnchorEnd = state.zoomEnd;
      state.zoomPreset = "10y";
    }

    updateDataUpTo();

    updatePercentHint();

    const controlsPanel =
      document.getElementById("controlsPanel");

    if (
      controlsPanel &&
      window.innerWidth < 900
    ) {
      controlsPanel.removeAttribute("open");
    }

    const seasonalityControlsPanel =
      document.getElementById("seasonalityControlsPanel");

    if (
      seasonalityControlsPanel &&
      window.innerWidth < 900
    ) {
      seasonalityControlsPanel.removeAttribute("open");
    }

    const seasonalityYearsPanel =
      document.getElementById("seasonalityYearsPanel");

    if (
      seasonalityYearsPanel &&
      window.innerWidth < 900
    ) {
      seasonalityYearsPanel.removeAttribute("open");
    }

    const chartElement =
      document.getElementById("chart");

    if (!chartElement) {
      throw new Error(
        "Не найден элемент #chart в index.html."
      );
    }

    if (
      typeof echarts === "undefined"
    ) {
      throw new Error(
        "ECharts не загружен. Проверь echarts.min.js."
      );
    }

    chart = echarts.init(
      chartElement,
      null,
      {
        renderer: "svg",
      }
    );

    const seasonalityChartElement =
      document.getElementById("seasonalityChart");

    if (!seasonalityChartElement) {
      throw new Error(
        "Не найден элемент #seasonalityChart в index.html."
      );
    }

    seasonalityChart = echarts.init(
      seasonalityChartElement,
      null,
      {
        renderer: "svg",
      }
    );

    buildCheckboxPanel();
    buildSeasonalityCheckboxPanel();

    render();
    renderSeasonality();

    attachLineHoverHighlight(chart, chartElement, "main");
    attachLineHoverHighlight(
      seasonalityChart,
      seasonalityChartElement,
      "seasonality"
    );

    wireSegmented(
      "currencyToggle",
      (value) => {
        state.currency = value;
        render();
      }
    );

    wireSegmented(
      "modeToggle",
      (value) => {
        state.mode = value;
        updatePercentHint();
        render();
      }
    );

    wireSegmented(
      "seasonalityCurrencyToggle",
      (value) => {
        state.seasonalityCurrency = value;
        renderSeasonality();
      }
    );

    wireSegmented(
      "seasonalityModeToggle",
      (value) => {
        state.seasonalityMode = value;
        renderSeasonality();
      }
    );

    wireDeepLinkButton("shareMainChart", "main");
    wireDeepLinkButton("shareSeasonalityChart", "seasonality");

    const zoomPresets = document.getElementById("zoomPresets");

    if (zoomPresets) {
      zoomPresets.querySelectorAll(".zoom-preset-btn").forEach((button) => {
        button.addEventListener("click", () => {
          setZoomByPreset(button.dataset.value);
        });
      });
    }

    updateZoomPresetButtons();

    const clearButton =
      document.getElementById("clearIndicators");

    if (clearButton) {
      clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearIndicators();
      });
    }

    const clearSeasonalityYearsButton =
      document.getElementById("clearSeasonalityYears");
    const selectAllSeasonalityYearsButton =
      document.getElementById("selectAllSeasonalityYears");

    if (clearSeasonalityYearsButton) {
      clearSeasonalityYearsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSeasonalityYears(false);
      });
    }

    if (selectAllSeasonalityYearsButton) {
      selectAllSeasonalityYearsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSeasonalityYears(true);
      });
    }

    const resetButton =
      document.getElementById("resetZoom");

    if (resetButton) {
      resetButton.addEventListener(
        "click",
        resetZoom
      );
    }

    wireDataZoom();
    wireSeasonalityDataZoom();

    window.addEventListener(
      "resize",
      () => {
        if (chart) {
          chart.resize();
        }

        if (seasonalityChart) {
          seasonalityChart.resize();
        }
      }
    );

    focusDeepLinkSource(deepLinkSource);

    console.info(
      "stats.by V1 initialized",
      {
        version: DATA.version,
        months: DATA.months.length,
        monthlySeries: Object.keys(
          DATA.series || {}
        ).length,
        yearlySeries: Object.keys(
          DATA.annual_series || {}
        ).length,
        metadata: DATA.series_meta.length,
      }
    );

  } catch (error) {
    console.error(
      "Ошибка инициализации stats.by:",
      error
    );

    const chartElement =
      document.getElementById("chart");

    if (chartElement) {
      chartElement.innerHTML = `
        <div style="
          padding:24px;
          color:#E8ECF1;
          font-family:var(--font-ui);
        ">
          <strong>
            Не удалось загрузить данные.
          </strong>

          <div style="
            margin-top:8px;
            color:#8A97A6;
            font-size:14px;
          ">
            ${String(error.message || error)}
          </div>

          <div style="
            margin-top:12px;
            color:#5B6673;
            font-size:12px;
          ">
            Открой консоль браузера (F12 → Console),
            если нужна дополнительная диагностика.
          </div>
        </div>
      `;
    }
  }
}


/* ============================================================
   Запуск
   ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  init
);