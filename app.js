/* ============================================================
   stats.by — V1
   Frontend для data.json v3

   Источник данных:
     data.json
       - months
       - series
       - annual_series
       - series_meta

   В V1 список показателей НЕ прописан вручную.
   Он строится из series_meta, который формирует build_data.py.
   ============================================================ */

"use strict";


/* ============================================================
   Сенсорные устройства (телефон / планшет)
   ============================================================
   На тач-экранах зум и перемещение графика возможны ТОЛЬКО через
   нижний ползунок (slider). Касание графика лишь показывает
   всплывающее окно. На компьютере (мышь) поведение не меняется.
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

const GROUP_ORDER = [
  "Зарплаты",
  "Курс",
  "Строительство",
  "Аренда",
  "стоимость квартир Realt",
  "стоимость квартир Wikidom",
  "Ставка",
];

/*
 * Фиксированный порядок показателей внутри групп.
 * Для зарплат он соответствует порядку в интерфейсе:
 * медианная страна -> средняя страна -> медианная Минск ->
 * средняя Минск -> минимальная.
 */
const CHECKBOX_ORDER = [
  // Зарплаты
  "медианная_беларусь",
  "средняя_средняя_по_стране",
  "медианная_минск",
  "средняя_средняя_минск",
  "мин_зп_минимальная_по_стране",

  // Курс
  "курс_usd_курс_usd_byn",

  // Строительство
  "строительство_год_тыс",
  "строительство_год",

  // Аренда
  "аренда_стоимость_аренды_realt",
  "аренда_стоимость_аренды_t_s_by",

  // стоимость квартир Realt
  "realt_м2_стоимость_м2_однушек",
  "realt_м2_стоимость_м2_двушек",
  "realt_м2_стоимость_м2_трешек",
  "realt_м2_стоимость_м2_четырешек",
  "realt_м2_объявления_новостройки",
  "realt_м2_объявления_вторичка",
  "realt_м2_объявления_новостройки_вторичка",
  "realt_сделки_количество_сделок_новостройки_вторичка",

  // стоимость квартир Wikidom
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

  /* Независимые настройки графика сезонности. */
  seasonalityCurrency: "USD",
  seasonalityMode: "percent",

  visible: {},

  /* Показатель, выбранный для графика сезонности. */
  seasonalityKey: "курс_usd_курс_usd_byn",

  /* Годы, отображаемые на графике сезонности. */
  seasonalityYears: new Set(),
  seasonalityYearsInitialized: false,
  seasonalityMonthStart: 0,
  seasonalityMonthEnd: 11,
  seasonalityMonthRangeInitialized: false,

  zoomStart: 0,
  zoomEnd: 100,

  /* Последний подтверждённый диапазон dataZoom. */
  lastZoomStart: 0,
  lastZoomEnd: 100,

  /* Правая граница, от которой начинается ручной зум. */
  zoomAnchorEnd: 100,

  /*
   * Признак именно zoom колесом/gesture.
   * Нужен для того, чтобы не путать его с физическим
   * перетаскиванием ручек slider.
   */
  wheelZoomAt: 0,

  /* Не даём служебной коррекции dataZoom повторно обработать себя. */
  correctingZoom: false,

  /* Активные (подсвеченные) ряды при наведении на линии графиков */
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

  /*
   * Сохраняем существующие цвета V0 для первых основных рядов.
   * Для новых рядов используем палитру ниже.
   */
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


/*
 * Цвета для новых рядов.
 *
 * Это не влияет на данные.
 * Только распределяет визуальные цвета между линиями.
 */
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


/*
 * Получить цвет ряда.
 *
 * Для первых старых рядов пытаемся использовать существующие
 * CSS-переменные style.css.
 * Для всех остальных назначаем цвет из общей палитры.
 */
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

  /*
   * В build_data.py группа уже может быть указана.
   * Если её нет — определяем по названию листа.
   */
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


/*
 * Группа определяет поведение ряда при переключении валюты.
 */
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


/* ============================================================
   Проверка структуры data.json
   ============================================================ */

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

  /*
   * annual_series в V1 может быть пустым.
   */
  if (!data.annual_series || typeof data.annual_series !== "object") {
    data.annual_series = {};
  }

  /*
   * Проверяем наличие всех рядов из metadata.
   * Если какого-то ряда нет — просто предупреждаем.
   */
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

  /*
   * Зарплаты:
   * исходные данные в BYN.
   */
  if (group === "salary") {
    return state.currency;
  }

  /*
   * Жильё:
   * исходные данные в USD.
   */
  if (group === "housing") {
    return state.currency;
  }

  /*
   * Остальные показатели валютный переключатель не меняет.
   */
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
  /*
   * build_data.py создаёт этот ряд динамически.
   *
   * Если ключ известен напрямую — используем его.
   * Иначе ищем по metadata.
   */

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

  /*
   * Курс USD/BYN не конвертируется.
   */
  if (group === "rate") {
    return raw.slice();
  }

  /*
   * Прочие нефинансовые показатели также не меняются.
   */
  if (group !== "salary" && group !== "housing") {
    return raw.slice();
  }

  /*
   * Если выбрана исходная валюта ряда:
   *
   * salary -> BYN
   * housing -> USD
   */
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

  /*
   * BYN -> USD
   */
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

  /*
   * USD -> BYN
   */
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


/*
 * Преобразуем годовые данные в массив по общей месячной шкале.
 *
 * Годовое значение ставим в декабрь соответствующего года.
 *
 * Это позволяет совместить monthly и yearly ряды в одном ECharts.
 */
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

/*
 * Заполняем только пропуски МЕЖДУ двумя реальными значениями.
 *
 * Возвращаем объекты, чтобы ECharts мог отличать:
 *   isOriginal: true  — исходная точка, на ней показываем маркер;
 *   isOriginal: false — интерполированное значение, маркера нет.
 *
 * Значения до первой и после последней исходной точки не
 * экстраполируются и остаются null.
 */
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


/*
 * Нормализация в проценты с сохранением признака исходной
 * точки. Это важно: после интерполяции маркеры должны
 * оставаться только на фактических наблюдениях.
 */
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



/*
 * Определяем, действительно ли ряд выходит реже одного раза в месяц.
 *
 * В metadata многие ряды имеют frequency:"monthly", даже если
 * фактические наблюдения публикуются, например, раз в полгода.
 * Поэтому для отображения маркеров смотрим на реальные даты:
 * пропуски отдельных месяцев НЕ делают ряд разреженным.
 */
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

  /*
   * Используем медианный интервал. Поэтому несколько случайно
   * пропущенных месяцев в ежемесячном ряду не включают маркеры
   * на всём графике.
   */
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

/*
 * В процентном режиме:
 *
 * 100% = значение ряда в начальной точке выбранного диапазона.
 *
 * Например:
 *   2020 = 100%
 *   2025 = 145%
 *
 * Для каждого ряда точка отсчёта определяется независимо.
 */

function normalizeToPercent(values, baseIndex) {
  if (!Array.isArray(values)) {
    return [];
  }

  let reference = null;

  /*
   * Ищем первое доступное значение начиная с baseIndex.
   */
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

  /*
   * Если в правой части данных значения нет,
   * ищем вообще первое доступное значение.
   */
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

  /*
   * Денежные показатели.
   */
  if (isMoneySeries(meta)) {
    return `${formatNumber(number, 0)} ${unit}`;
  }

  /*
   * Количество сделок / квартир.
   */
  if (
    unit === "шт." ||
    unit === "шт" ||
    unit === "тыс. м²"
  ) {
    return `${formatNumber(number, 0)} ${unit}`;
  }

  /*
   * Общий случай.
   */
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

    const color = getSeriesColor(meta, index);

    checkbox.style.accentColor = color;

    checkbox.addEventListener("change", () => {
      state.visible[meta.key] = checkbox.checked;

      /*
       * При любом изменении чекбоксов пользователь начинает новый
       * просмотр набора показателей, поэтому показываем всю историю
       * выбранных рядов. Это отличается от самого первого открытия
       * сайта: при открытии действует стандартный диапазон 10 лет.
       */
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

    const color = getSeriesColor(meta, index);
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

  return years
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

      /*
       * Все 12 месяцев отдаём в график целиком: видимое окно задаёт
       * dataZoom-слайдер. Интерполируем только пропуски внутри года.
       */
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

        /* 100% = первая точка внутри выбранного окна. */
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

    dataZoom: [
      {
        type: "slider",

        xAxisIndex: 0,

        startValue: state.seasonalityMonthStart,
        endValue: state.seasonalityMonthEnd,

        minValueSpan: 1,

        /* Отключаем выделение нового диапазона мышью (протяжкой ЛКМ). */
        brushSelect: false,

        height: 24,

        bottom: 30,

        borderColor: "#232B36",

        backgroundColor: "#0A0E13",

        fillerColor: "rgba(61,220,132,0.10)",

        handleStyle: {
          color: "#1A222B",
          borderColor: "#5B6673",
        },

        moveHandleStyle: {
          color: "#2A3440",
        },

        textStyle: {
          color: "#5B6673",

          fontFamily: "var(--font-mono)",

          fontSize: 11,
        },

        labelFormatter: (value, valueStr) =>
          MONTH_NAMES_RU[Math.round(value)] || valueStr,
      },
    ],

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


function wireSeasonalityDataZoom() {
  if (!seasonalityChart) return;

  seasonalityChart.on("dataZoom", () => {
    const option = seasonalityChart.getOption();
    const zoom = option && option.dataZoom && option.dataZoom[0];

    if (!zoom) return;

    const max = MONTH_NAMES_RU.length - 1;
    let start = Number(zoom.startValue);
    let end = Number(zoom.endValue);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      start = (Number(zoom.start) / 100) * max;
      end = (Number(zoom.end) / 100) * max;
    }

    start = Math.max(0, Math.min(max, Math.round(start)));
    end = Math.max(0, Math.min(max, Math.round(end)));

    if (end < start) [start, end] = [end, start];

    if (
      start === state.seasonalityMonthStart &&
      end === state.seasonalityMonthEnd
    ) {
      return;
    }

    state.seasonalityMonthStart = start;
    state.seasonalityMonthEnd = end;
    state.seasonalityMonthRangeInitialized = true;

    /*
     * В абсолютном режиме ECharts сам фильтрует данные по окну.
     * В процентном нужно пересчитать базу 100% от нового левого края.
     */
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

  /*
   * Показатели, выбранные при первом открытии сайта.
   * Используем ключи из data.json, а не подписи.
   *
   * По умолчанию:
   *   - средняя МИНСК
   *   - средняя ПО СТРАНЕ
   *   - курс USD/BYN
   */
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

  /*
   * Для V1 по умолчанию показываем 2025-01 -> последняя дата.
   */
  const index = months.indexOf("2025-01");

  if (index >= 0 && months.length > 1) {
    return (index / (months.length - 1)) * 100;
  }

  /*
   * Если 2025-01 отсутствует,
   * показываем последние 24 месяца.
   */
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

  /*
   * На тач-экране касание графика только показывает тултип:
   * подсветку отдельных линий не включаем.
   */
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

    // Мгновенно обновляем классы в открытом тултипе без его перемещения
    updateTooltipHighlight(chartElement, seriesId);

    // Подсвечиваем линию на самом графике
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

  // Нативное событие наведения ECharts на элемент ряда
  chartInstance.on("mouseover", (params) => {
    if (params && params.componentType === "series") {
      const id = params.seriesId || params.seriesName;
      if (id) {
        setActiveSeries(id);
      }
    }
  });

  // Расчёт приближения курсора к линиям на графике (допуск ~24px для лёгкого считывания)
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
        const THRESHOLD = 24; // пикселей по вертикали для комфортного попадания
        const HYSTERESIS = 4; // гистерезис против мерцания при близких/пересекающихся линиях

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

        // Если ранее подсвеченная линия ещё близка к курсору — сохраняем её
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

  return visibleMetas.map((meta) => {
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

    /*
     * Правая ось:
     *
     * В абсолютном режиме:
     *   деньги -> левая ось
     *   проценты -> правая
     *   USD/BYN -> правая
     *   количество -> левая
     *
     * В процентном режиме всё находится на одной оси.
     */
    let yAxisIndex = 0;

    if (state.mode === "absolute") {
      if (
        isPercentSeries(meta) ||
        isRateSeries(meta)
      ) {
        yAxisIndex = 1;
      }
    }

    /*
     * Маркеры показываем только на рядах, которые фактически
     * публикуются реже одного раза в месяц.
     *
     * Важно: пропуск одного/нескольких месяцев в обычном
     * ежемесячном ряду НЕ превращает его в точечный график.
     */
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

      /*
       * Маркер определяется для КАЖДОЙ точки отдельно.
       * Поэтому при любом диапазоне видны все реальные
       * наблюдения, а интерполированные точки маркера не имеют.
       */
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

      /*
       * LTTB отключаем для рядов с интерполяцией: sampling
       * может выбрасывать исходные точки, из-за чего количество
       * видимых маркеров становилось неправильным.
       */
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

      /*
       * Годовые показатели ставим в декабре,
       * поэтому точки явно не соединяем через пустые месяцы.
       */
      symbolKeepAspect: true,
    };
  });
}


/* ============================================================
   Форматирование X-оси
   ============================================================ */

function formatXAxisLabel(value) {
  if (!isYearMonth(value)) {
    return value;
  }

  const year = value.slice(0, 4);
  const month = value.slice(5, 7);

  /*
   * На широкой шкале показываем только годы.
   */
  if (month === "01") {
    return year;
  }

  return "";
}


/* ============================================================
   Опции Y-осей
   ============================================================ */

function buildYAxes() {
  const textSecondary = "#8A97A6";
  const textTertiary = "#5B6673";
  const splitColor = "#161C24";

  /*
   * Процентный режим:
   * одна ось.
   */
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

  /*
   * Абсолютный режим.
   */
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

      /* Подпись под курсором: целое число */
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

      /* Подпись под курсором: два знака после запятой */
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
      getSeriesColor(
        meta,
        getSeriesMeta().indexOf(meta)
      );

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
      left: state.mode === "percent" ? 34 : 38,
      right: state.mode === "percent" ? 34 : 38,
      top: 42,
      bottom: 84,

      containLabel: false,
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
        show: false,
      },
    },

    yAxis: buildYAxes(),

    dataZoom: [
      {
        type: "slider",

        xAxisIndex: 0,

        start: state.zoomStart,
        end: state.zoomEnd,

        /* Отключаем выделение нового диапазона мышью (протяжкой ЛКМ). */
        brushSelect: false,

        height: 24,

        bottom: 30,

        borderColor: "#232B36",

        backgroundColor: "#0A0E13",

        fillerColor: "rgba(61,220,132,0.10)",

        handleStyle: {
          color: "#1A222B",
          borderColor: "#5B6673",
        },

        moveHandleStyle: {
          color: "#2A3440",
        },

        textStyle: {
          color: textTertiary,

          fontFamily: "var(--font-mono)",

          fontSize: 11,
        },

        labelFormatter: (value, valueStr) => {
          const index = Math.round(value);

          const month = months[index];

          return month || valueStr;
        },
      },

      /*
       * "inside" (колесо / перетаскивание / pinch по самому графику)
       * подключаем только на устройствах с мышью. На тач-экране
       * управление диапазоном — только нижним ползунком.
       */
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
    ],

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

    /* Если данных меньше выбранного периода — показываем всё. */
    const startIndex = Math.max(
      minIndex,
      maxIndex - periodMonths + 1
    );

    state.zoomStart = (startIndex / denominator) * 100;
    state.zoomEnd = bounds.end;
  }

  /*
   * После выбора пресета правая граница становится новой
   * фиксированной точкой ручного зума.
   */
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
  /*
   * ECharts не передаёт в событии dataZoom надёжный признак того,
   * была ли граница изменена колесом или перетаскиванием ручки.
   * Поэтому отдельно запоминаем нативное событие wheel.
   * dataZoom от колеса приходит сразу после него.
   */
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

    /*
     * Служебное второе событие после dispatchAction.
     */
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

    /*
     * Колесо определяем по отдельному событию ZRender.
     * Небольшое окно нужно только для связывания wheel -> dataZoom.
     */
    const isWheelZoom =
      Date.now() - state.wheelZoomAt < 100;

    /*
     * Любое ручное изменение отменяет подсветку пресета.
     */
    state.zoomPreset = null;
    updateZoomPresetButtons();

    /*
     * На тач-экране диапазон меняется только нижним ползунком
     * (ручки или перетаскивание всего окна) — принимаем как есть.
     */
    if (IS_TOUCH) {
      state.zoomStart = start;
      state.zoomEnd = end;
      state.lastZoomStart = start;
      state.lastZoomEnd = end;
      state.zoomAnchorEnd = end;
      return;
    }

    /*
     * Если это НЕ колесо, значит пользователь физически двигает
     * ручку slider или весь выделенный диапазон. Такие изменения
     * принимаем без коррекции.
     *
     * Это принципиально важно: правую ручку можно двигать ЛКМ,
     * но zoom колесом при этом продолжает держать правый край.
     */
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

    /*
     * Если обе границы изменились на одинаковую величину,
     * это перемещение всего выделенного диапазона.
     * Оставляем его как есть — это не изменение масштаба.
     */
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

    /*
     * Обе границы изменились и ширина изменилась — это zoom
     * колесом мыши / gesture.
     *
     * Zoom in:
     *   правая граница фиксирована;
     *   двигается только левая.
     *
     * Zoom out:
     *   сначала двигается левая граница влево;
     *   после достижения 0% начинает двигаться правая.
     */
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

    /*
     * Сначала создаём visibility state.
     */
    initializeVisibility();

    /* Сезонность по умолчанию: курс USD и все доступные годы. */
    const defaultSeasonalityMeta = metaByKey(state.seasonalityKey);
    if (defaultSeasonalityMeta) {
      state.seasonalityYears = new Set(
        getSeasonalityYears(defaultSeasonalityMeta)
      );
      state.seasonalityYearsInitialized = true;
    }

    /*
     * Если ссылка содержит Deep Link — восстанавливаем состояние
     * только того графика, который был источником ссылки.
     */
    const deepLinkSource = restoreDeepLinkState();

    /*
     * По умолчанию показываем последние 10 лет доступных данных
     * выбранных показателей. Если данных меньше 10 лет,
     * показываем весь доступный диапазон.
     */
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

    /*
     * Информация "данные по..."
     */
    updateDataUpTo();

    /*
     * Подсказка процентного режима.
     */
    updatePercentHint();

    /*
     * На мобильном экране панель показателей
     * по умолчанию сворачиваем.
     */
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

    /*
     * Создаём график.
     */
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

    /*
     * Панели показателей.
     */
    buildCheckboxPanel();
    buildSeasonalityCheckboxPanel();

    /*
     * Первый рендер.
     */
    render();
    renderSeasonality();

    /*
     * Подключение подсветки линий и соответствующих строк в тултипе.
     */
    attachLineHoverHighlight(chart, chartElement, "main");
    attachLineHoverHighlight(
      seasonalityChart,
      seasonalityChartElement,
      "seasonality"
    );

    /*
     * Переключатели первого графика.
     */
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

    /*
     * Те же переключатели для блока сезонности.
     */
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

    /*
     * Кнопки Deep Link.
     */
    wireDeepLinkButton("shareMainChart", "main");
    wireDeepLinkButton("shareSeasonalityChart", "seasonality");

    /*
     * Быстрые диапазоны графика.
     */
    const zoomPresets = document.getElementById("zoomPresets");

    if (zoomPresets) {
      zoomPresets.querySelectorAll(".zoom-preset-btn").forEach((button) => {
        button.addEventListener("click", () => {
          setZoomByPreset(button.dataset.value);
        });
      });
    }

    updateZoomPresetButtons();

    /*
     * Кнопка "Очистить".
     *
     * Кнопка находится внутри <summary>, поэтому явно отменяем
     * стандартное поведение summary и не даём клику менять
     * состояние <details>.
     */
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

    /*
     * Кнопка "Показать всю историю".
     */
    const resetButton =
      document.getElementById("resetZoom");

    if (resetButton) {
      resetButton.addEventListener(
        "click",
        resetZoom
      );
    }

    /*
     * DataZoom.
     */
    wireDataZoom();
    wireSeasonalityDataZoom();

    /*
     * Responsive.
     */
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

    /*
     * Небольшая диагностическая информация
     * в console — полезна на этапе V1.
     */
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

    /*
     * Не оставляем пользователя с пустым графиком
     * без объяснения причины.
     */
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