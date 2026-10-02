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

/* Короткие названия месяцев для крайних подписей оси X: «мар 2021». */
const MONTH_SHORT_RU = MONTH_NAMES_RU.map((name) =>
  name.slice(0, 3).toLowerCase()
);

/*
 * Подписи оси X основного графика.
 * Ширины — оценка в пикселях для шрифта 12px: нужны только для того,
 * чтобы решить, какие годы между крайними подписями поместятся.
 */
const X_EDGE_LABEL_PX = 46;   /* «сен 2026» */
const X_YEAR_LABEL_PX = 28;   /* «2021» */
const X_LABEL_GAP_PX = 10;    /* минимальный зазор между подписями */

/* Размеры шрифтов подписей осей. */
const X_LABEL_FONT_PX = 10;   /* годы / месяцы под графиком */
const AXIS_FONT_PX = 10;      /* шкалы слева и справа */
const X_YEAR_STEPS = [1, 2, 5, 10];

/* Пунктир «100%» — общий для основного графика и сезонности. */
const BASELINE_COLOR = "#9EA0A5";

/* Вертикальная сетка по годам. */
const GRID_COLOR = "rgba(255,255,255,0.06)";
const X_GRID_COLOR = GRID_COLOR;

/* Сетка на слайдере сезонности: ярче и чуть толще обычной. */
const SLIDER_GRID_COLOR = "rgba(255,255,255,0.28)";
const SLIDER_GRID_WIDTH = 1.5;

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
 * Индекс ряда в ИСХОДНОМ (несортированном) списке series_meta.
 *
 * Это единственный источник индекса для назначения цвета.
 * Панель чекбоксов показывает показатели в отсортированном порядке
 * (по группам), а график и тултип используют исходный порядок —
 * если брать индекс из отсортированного списка, цвет в чекбоксе и
 * цвет линии на графике для одного и того же показателя расходятся.
 */
function getStableSeriesIndex(meta) {
  return getSeriesMeta().indexOf(meta);
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
function isDealsSeries(meta) {
  return !!meta && String(meta.key || "").includes("сделок");
}


function getInternalGroup(meta) {
  /* Количество сделок — штуки, а не деньги: валюта на них не влияет. */
  if (isDealsSeries(meta)) return "other";

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

  /* Количество сделок: число без единицы измерения. */
  if (isDealsSeries(meta)) return formatNumber(number, 0);

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


/*
 * Изменение относительно базы (100%) для тултипов: 101,4% -> +1,4%.
 * Оси графиков продолжают показывать уровень (100%, 120%...).
 */
function formatPercentChange(value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  const change = Math.round((Number(value) - 100) * 10) / 10;
  const text = Math.abs(change).toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (change > 0) return `+${text}%`;
  if (change < 0) return `\u2212${text}%`;
  return `${text}%`;
}


/*
 * HTML заголовка тултипа сезонности: «Октябрь среднее: +1,4%».
 */
function buildSeasonalityAverageHtml(monthName, validParams, meta) {
  const values = validParams.map((param) =>
    Number(
      param.value && typeof param.value === "object"
        ? param.value.value
        : param.value
    )
  );

  const average =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const percentMode = state.seasonalityMode === "percent";

  let valueText;
  let valueColor = "var(--text-primary)";

  if (percentMode) {
    valueText = formatPercentChange(average);
    const rounded = Math.round((average - 100) * 10) / 10;
    if (rounded > 0) valueColor = "var(--up)";
    if (rounded < 0) valueColor = "var(--down)";
  } else {
    valueText = formatValue(average, meta, false);
  }

  return `
    <div class="tt-header">
      <span class="tt-date">${monthName}</span>
      <span class="tt-avg-label">среднее:</span>
      <span class="tt-avg-val" style="color:${valueColor};">${valueText}</span>
    </div>
  `;
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

  /* Между границами всегда остаётся минимум один месяц. */
  state.seasonalityMonthStart = Math.max(
    0,
    Math.min(state.seasonalityMonthStart, max - SEASONALITY_MIN_SPAN)
  );

  state.seasonalityMonthEnd = Math.max(
    state.seasonalityMonthStart + SEASONALITY_MIN_SPAN,
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

        /* Узкий диапазон месяцев сохраняем, широкий (8+) сбрасываем. */
        const selectedMonths =
          state.seasonalityMonthEnd - state.seasonalityMonthStart + 1;

        if (selectedMonths >= 8) {
          state.seasonalityMonthStart = 0;
          state.seasonalityMonthEnd = 11;
          state.seasonalityMonthRangeInitialized = false;
        }

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

  /* В процентном режиме рисуем пунктир на уровне 100%. */
  if (state.seasonalityMode === "percent" && result.length) {
    result[0].markLine = buildBaselineMarkLine();
  }

  return result;
}


/*
 * Подпись деления шкалы. Число знаков после запятой одинаково у всех
 * делений оси (3,5 / 3,0 / 2,5), без разделителя тысяч (5000).
 */
function countDecimals(value) {
  const text = String(Number(Number(value).toFixed(6)));
  const dot = text.indexOf(".");

  return dot < 0 ? 0 : text.length - dot - 1;
}


function formatAxisTick(chartInstance, axisIndex, value, suffix = "") {
  let decimals = countDecimals(value);

  try {
    const model = chartInstance && chartInstance.getModel();
    const component = model && model.getComponent("yAxis", axisIndex);
    const ticks = component && component.axis && component.axis.scale.getTicks();

    if (Array.isArray(ticks) && ticks.length) {
      decimals = Math.max(
        ...ticks.map((tick) =>
          countDecimals(tick && typeof tick === "object" ? tick.value : tick)
        )
      );
    }
  } catch (error) {
    /* оставляем число знаков по самому значению */
  }

  decimals = Math.min(decimals, 3);

  return Number(value).toLocaleString("ru-RU", {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + suffix;
}


function buildSeasonalityYAxis(meta) {
  const percentMode = state.seasonalityMode === "percent";

  return {
    type: "value",
    position: "left",
    axisLabel: {
      color: "#878787",
      fontSize: AXIS_FONT_PX,
      margin: 4,
      formatter: (value) =>
        formatAxisTick(seasonalityChart, 0, value, percentMode ? "%" : ""),
    },
    axisLine: { show: false },
    splitLine: { show: true, lineStyle: { color: GRID_COLOR } },
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

  const monthIndex = params[0].dataIndex;
  const monthName = MONTH_NAMES_RU[monthIndex] || params[0].axisValue;

  let html = `
    ${buildSeasonalityAverageHtml(monthName, validParams, meta)}
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
    const valueText = state.seasonalityMode === "percent"
      ? formatPercentChange(value)
      : formatValue(value, meta, false);

    html += `
      <div class="tt-row ${isActive ? "is-active" : ""}"
           data-series-id="${param.seriesId}"
           data-series-name="${param.seriesName || ""}"
           style="--row-color:${color};">
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
      left: state.seasonalityMode === "percent" ? 31 : 27,
      right: 8,
      top: 16,
      bottom: 84,
      containLabel: false,
    },

    /*
     * Отключаем автоматическую подсветку (emphasis) всех рядов,
     * которую ECharts включает при tooltip.trigger = "axis".
     * Подсветкой отдельной линии управляет attachLineHoverHighlight().
     */
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
      backgroundColor: "#181a1b",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      padding: [12, 16],
      textStyle: {
        color: "#ffffff",
        fontSize: 13,
      },
      extraCssText:
        "border-radius:8px;" +
        "box-shadow:0 12px 32px -12px rgba(0,0,0,0.25);" +
        "pointer-events:none;",
      formatter: buildSeasonalityTooltipFormatter,
    },

    xAxis: {
      type: "category",
      data: months,
      boundaryGap: false,
      axisLabel: {
        color: "#878787",
        fontSize: X_LABEL_FONT_PX,
        margin: 8,
      },
      axisLine: {
        lineStyle: { color: "rgba(255,255,255,0.12)" },
      },
      axisTick: { show: false },

      /* Вертикальная сетка: одна линия на каждый месяц. */
      splitLine: {
        show: true,
        showMinLine: false,
        showMaxLine: false,
        interval: 0,
        lineStyle: {
          color: X_GRID_COLOR,
          width: 1,
        },
      },
    },

    yAxis: meta
      ? buildSeasonalityYAxis(meta)
      : {
          type: "value",
          axisLabel: { color: "#878787" },
          splitLine: { lineStyle: { color: GRID_COLOR } },
        },

    dataZoom: buildSeasonalityDataZoom(),

    graphic: buildSeasonalitySliderGrid(),

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
   ============================================================
   Собран по тому же принципу, что и под первым графиком:
   нижний slider (те же размеры и цвета) + на компьютере
   inside-зум мышью. Границы окна хранятся как индексы месяцев
   0..11 (для Deep Link), а в ECharts передаются в процентах.
   ============================================================ */

const SEASONALITY_MAX_INDEX = 11;

/* Минимальный зазор между границами таймлайна, в месяцах. */
const SEASONALITY_MIN_SPAN = 1;


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

  /*
   * Встроенный слайдер ECharts здесь только управляет видимым окном
   * (show: false — сам он не рисуется и не реагирует на касания).
   * Ручки и рамку рисуем сами (buildSeasonalitySliderGrid), чтобы
   * границы двигались строго по месяцам: ручка «стопорится» на каждом
   * месяце и не может встать между двумя.
   */
  return [
    {
      type: "slider",
      show: false,
      xAxisIndex: 0,
      startValue: state.seasonalityMonthStart,
      endValue: state.seasonalityMonthEnd,
      brushSelect: false,
      showDataShadow: false,
    },
  ];
}


/*
 * Таймлайн сезонности: вертикальные линии по месяцам + своя рамка,
 * закрашенное окно, две ручки и подписи месяцев. Геометрия — как у
 * слайдера основного графика (left 8, right 14, bottom 19, height 30).
 * 12 месяцев равномерно по ширине дорожки.
 */
const SEASONALITY_SLIDER = { left: 8, right: 14, bottom: 19, height: 30 };

/*
 * Ручки таймлайна — одинаковые на обоих графиках, как у DefiLlama:
 * тонкая вертикальная линия на всю высоту слайдера + небольшая
 * «таблетка» по центру. Рисуем их сами (graphic), а зону попадания
 * делаем отдельной и широкой — поэтому по ручке легко попасть.
 */
const HANDLE_COLOR = "rgba(255,255,255,0.9)";
const HANDLE_PILL_FILL = "rgba(0,0,0,0.85)";
const HANDLE_LINE_WIDTH = 1.5;
const HANDLE_PILL_W = 6;
const HANDLE_PILL_H = 20;
const HANDLE_PILL_RADIUS = 2.5;
const HANDLE_PILL_BORDER = 1;
const HANDLE_HIT_W = 26;         /* ширина невидимой зоны попадания */

function buildSliderHandleElements(idPrefix, x, y1, y2, withHitZone) {
  const centerY = (y1 + y2) / 2;

  const elements = [
    {
      id: `${idPrefix}-line`,
      type: "line",
      silent: true,
      z: 100,
      shape: { x1: x, y1, x2: x, y2 },
      style: { stroke: HANDLE_COLOR, lineWidth: HANDLE_LINE_WIDTH },
    },
    {
      id: `${idPrefix}-pill`,
      type: "rect",
      silent: true,
      z: 101,
      shape: {
        x: x - HANDLE_PILL_W / 2,
        y: centerY - HANDLE_PILL_H / 2,
        width: HANDLE_PILL_W,
        height: HANDLE_PILL_H,
        r: HANDLE_PILL_RADIUS,
      },
      style: {
        fill: HANDLE_PILL_FILL,
        stroke: HANDLE_COLOR,
        lineWidth: HANDLE_PILL_BORDER,
      },
    },
  ];

  /* Невидимая зона только для курсора (само перетаскивание — в wireSeasonalitySlider). */
  if (withHitZone) {
    elements.push({
      id: `${idPrefix}-hit`,
      type: "rect",
      z: 102,
      cursor: "ew-resize",
      shape: {
        x: x - HANDLE_HIT_W / 2,
        y: y1 - 4,
        width: HANDLE_HIT_W,
        height: y2 - y1 + 8,
      },
      style: { fill: "rgba(0,0,0,0.001)" },
    });
  }

  return elements;
}
const SEASONALITY_HIT_TOLERANCE = 16;   /* px вокруг ручки, куда можно «попасть» */

function getSeasonalitySliderGeometry() {
  const width = seasonalityChart ? seasonalityChart.getWidth() : 0;
  const height = seasonalityChart ? seasonalityChart.getHeight() : 0;

  if (!width || !height) {
    return null;
  }

  const track = width - SEASONALITY_SLIDER.left - SEASONALITY_SLIDER.right;
  const y2 = height - SEASONALITY_SLIDER.bottom;
  const y1 = y2 - SEASONALITY_SLIDER.height;

  return {
    width,
    height,
    track,
    y1,
    y2,
    step: track / SEASONALITY_MAX_INDEX,
    x: (index) =>
      SEASONALITY_SLIDER.left + (index / SEASONALITY_MAX_INDEX) * track,
  };
}


function buildSeasonalitySliderGrid() {
  const geo = getSeasonalitySliderGeometry();

  if (!geo) {
    return [];
  }

  const { y1, y2, track } = geo;
  const elements = [];

  /* Крайние линии совпадают с рамкой слайдера — их не рисуем. */
  for (let i = 1; i < SEASONALITY_MAX_INDEX; i++) {
    const x = geo.x(i);

    elements.push({
      id: `seasonality-slider-grid-${i}`,
      type: "line",
      silent: true,
      z: 1,
      shape: { x1: x, y1, x2: x, y2 },
      style: { stroke: SLIDER_GRID_COLOR, lineWidth: SLIDER_GRID_WIDTH },
    });
  }

  const start = state.seasonalityMonthStart;
  const end = state.seasonalityMonthEnd;
  const xs = geo.x(start);
  const xe = geo.x(end);
  const months = getSeasonalityMonths();

  /* Закрашенное окно между ручками. */
  elements.push({
    id: "seasonality-slider-filler",
    type: "rect",
    z: 2,
    cursor: "grab",
    shape: { x: xs, y: y1, width: Math.max(0, xe - xs), height: y2 - y1 },
    style: { fill: "rgba(0,0,0,0.1)" },
  });

  /* Рамка дорожки. */
  elements.push({
    id: "seasonality-slider-border",
    type: "rect",
    silent: true,
    z: 3,
    shape: {
      x: SEASONALITY_SLIDER.left,
      y: y1,
      width: track,
      height: y2 - y1,
    },
    style: {
      fill: "transparent",
      stroke: "rgba(255,255,255,0.4)",
      lineWidth: 1,
    },
  });

  /* Две ручки: всегда стоят ровно на границе месяца. */
  [["start", xs], ["end", xe]].forEach(([name, x]) => {
    buildSliderHandleElements(
      `seasonality-slider-handle-${name}`,
      x,
      y1,
      y2,
      true
    ).forEach((element) => elements.push(element));
  });

  /* Подписи месяцев под дорожкой (если ручки на одном месяце — одна). */
  const clampLabelX = (x) => Math.max(16, Math.min(geo.width - 16, x));

  [["start", xs, start, false], ["end", xe, end, start === end]].forEach(
    ([name, x, index, hidden]) => {
      elements.push({
        id: `seasonality-slider-label-${name}`,
        type: "text",
        silent: true,
        z: 5,
        invisible: hidden,
        x: clampLabelX(x),
        y: y2 + 4,
        style: {
          text: months[index] || "",
          fill: "#878787",
          font: "11px ui-monospace, Menlo, Consolas, monospace",
          align: "center",
          verticalAlign: "top",
        },
      });
    }
  );

  return elements;
}


/*
 * Применить новое окно месяцев: состояние, видимая область графика,
 * положение ручек и (в процентном режиме) база 100%.
 */
function applySeasonalityRange(start, end) {
  if (!seasonalityChart) return;

  start = Math.max(
    0,
    Math.min(SEASONALITY_MAX_INDEX - SEASONALITY_MIN_SPAN, start)
  );
  end = Math.max(
    start + SEASONALITY_MIN_SPAN,
    Math.min(SEASONALITY_MAX_INDEX, end)
  );

  if (
    start === state.seasonalityMonthStart &&
    end === state.seasonalityMonthEnd
  ) {
    return;
  }

  state.seasonalityMonthStart = start;
  state.seasonalityMonthEnd = end;
  state.seasonalityMonthRangeInitialized = true;

  seasonalityChart.dispatchAction({
    type: "dataZoom",
    dataZoomIndex: 0,
    startValue: start,
    endValue: end,
  });

  seasonalityChart.setOption({ graphic: buildSeasonalitySliderGrid() });

  if (state.seasonalityMode === "percent") {
    const meta = metaByKey(state.seasonalityKey);

    if (meta) {
      seasonalityChart.setOption({ series: getSeasonalitySeries(meta) });
    }
  }
}


/*
 * Перетаскивание ручек. Положение курсора каждый раз переводим в
 * ближайший месяц, поэтому ручка шагает по месяцам и не бывает
 * «между» ними. Слушатели на window — чтобы перетаскивание не
 * обрывалось, когда курсор/палец ушёл за пределы графика.
 */
function wireSeasonalitySlider() {
  if (!seasonalityChart) return;

  const dom = seasonalityChart.getDom();
  let drag = null;

  const pointOf = (event) => {
    const touch =
      (event.touches && event.touches[0]) ||
      (event.changedTouches && event.changedTouches[0]) ||
      event;
    const rect = dom.getBoundingClientRect();

    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const indexAt = (x, geo) =>
    Math.max(
      0,
      Math.min(
        SEASONALITY_MAX_INDEX,
        Math.round((x - SEASONALITY_SLIDER.left) / geo.step)
      )
    );

  const detect = (point, geo) => {
    const margin = SEASONALITY_HIT_TOLERANCE;

    if (point.y < geo.y1 - margin || point.y > geo.y2 + margin) {
      return null;
    }

    const start = state.seasonalityMonthStart;
    const end = state.seasonalityMonthEnd;
    const xs = geo.x(start);
    const xe = geo.x(end);
    const ds = Math.abs(point.x - xs);
    const de = Math.abs(point.x - xe);

    if (ds <= margin || de <= margin) {
      if (start === end) return "pending";
      return ds <= de ? "start" : "end";
    }

    if (point.x > xs && point.x < xe) return "move";

    return null;
  };

  const onMove = (event) => {
    if (!drag) return;

    if (event.cancelable) event.preventDefault();

    const geo = getSeasonalitySliderGeometry();
    if (!geo) return;

    const index = indexAt(pointOf(event).x, geo);
    let { mode } = drag;
    let start = drag.start;
    let end = drag.end;

    if (mode === "pending") {
      if (index === drag.start) return;
      mode = index < drag.start ? "start" : "end";
      drag.mode = mode;
    }

    if (mode === "start") {
      start = Math.min(index, drag.end - SEASONALITY_MIN_SPAN);
    } else if (mode === "end") {
      end = Math.max(index, drag.start + SEASONALITY_MIN_SPAN);
    } else {
      const span = drag.end - drag.start;
      start = Math.max(
        0,
        Math.min(SEASONALITY_MAX_INDEX - span, drag.start + index - drag.grab)
      );
      end = start + span;
    }

    applySeasonalityRange(start, end);
  };

  const onUp = () => {
    drag = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
  };

  const onDown = (event) => {
    if (event.type === "mousedown" && event.button !== 0) return;

    const geo = getSeasonalitySliderGeometry();
    if (!geo) return;

    const point = pointOf(event);
    const mode = detect(point, geo);

    if (!mode) return;

    /* Не даём странице прокручиваться / выделять текст при перетаскивании. */
    if (event.cancelable) event.preventDefault();

    drag = {
      mode,
      start: state.seasonalityMonthStart,
      end: state.seasonalityMonthEnd,
      grab: indexAt(point.x, geo),
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  };

  dom.addEventListener("mousedown", onDown);
  dom.addEventListener("touchstart", onDown, { passive: false });
}


let seasonalityPercentTimer = null;

function wireSeasonalityDataZoom() {
  if (!seasonalityChart) return;

  seasonalityChart.on("dataZoom", () => {
    const option = seasonalityChart.getOption();
    const zoom = option && option.dataZoom && option.dataZoom[0];

    if (!zoom) return;

    let start = Math.round(Number(zoom.startValue));
    let end = Math.round(Number(zoom.endValue));

    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    start = Math.max(0, Math.min(SEASONALITY_MAX_INDEX, start));
    end = Math.max(0, Math.min(SEASONALITY_MAX_INDEX, end));

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

    /* В процентном режиме пересчитываем базу 100% от левого края. */
    if (state.seasonalityMode === "percent") {
      const meta = metaByKey(state.seasonalityKey);

      if (meta) {
        clearTimeout(seasonalityPercentTimer);
        seasonalityPercentTimer = setTimeout(() => {
          seasonalityChart.setOption({ series: getSeasonalitySeries(meta) });
        }, 20);
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
    const trackPointer = (x, y) => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        rafId = null;

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
          if (seriesItem.id === ZOOM_SHADOW_ID) return;

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
    };

    chartInstance.getZr().on("mousemove", (e) => {
      trackPointer(e.offsetX, e.offsetY);
    });

    /*
     * Тач-экран: палец ведёт себя как курсор. Касание/движение пальца
     * по графику выбирает ближайшую линию, подсветка остаётся, пока
     * виден тултип (сбрасывается при его скрытии — событие hideTip).
     */
    if (IS_TOUCH) {
      const onTouch = (event) => {
        const touch = event.touches && event.touches[0];
        if (!touch) return;

        const rect = chartElement.getBoundingClientRect();
        trackPointer(touch.clientX - rect.left, touch.clientY - rect.top);
      };

      chartElement.addEventListener("touchstart", onTouch, { passive: true });
      chartElement.addEventListener("touchmove", onTouch, { passive: true });
    }

    chartInstance.getZr().on("globalout", () => {
      /* На тач-экране после отпускания пальца тултип остаётся. */
      if (IS_TOUCH) return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setActiveSeries(null);
    });
  }

  chartElement.addEventListener("mouseleave", () => {
    if (IS_TOUCH) return;
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

  /* В процентном режиме рисуем пунктир на уровне 100%. */
  if (state.mode === "percent" && result.length) {
    result[0].markLine = buildBaselineMarkLine();
  }

  const shadow = buildZoomShadowSeries(result);

  if (shadow) {
    result.unshift(shadow);
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


/* Отступ сетки слева/справа (одинаков для обеих сторон). */
function getMainGridLeft() {
  return state.mode === "percent" ? 31 : 27;
}

function getMainGridRight() {
  return state.mode === "percent" ? 4 : 22;
}


/*
 * Реальный видимый диапазон оси X (индексы месяцев).
 *
 * Читаем его прямо из dataZoom-модели ECharts, потому что подписи
 * оси пересчитываются в момент отрисовки — раньше, чем наш state
 * успевает обновиться. Если внутренний метод недоступен — берём
 * диапазон из state.
 */
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

/*
 * Раскладка подписей и вертикальной сетки для текущего диапазона.
 *
 *   start / end — первый и последний месяц диапазона: подписаны всегда;
 *   labels      — индексы месяцев с подписью (крайние + подходящие годы);
 *   januaries   — индексы январей внутри диапазона: на них линии сетки
 *                 (шаг сетки — 1 год).
 *
 * Между крайними подписями остаются только те годы, которые не
 * налезают друг на друга: при тесной шкале подписи через один,
 * через пять лет и т. д. (кратные годы: 2020, 2022, ...).
 */
function getXTickLayout() {
  const [start, end] = getLiveXWindow();
  const width = chart ? chart.getWidth() : 0;
  const key = `${start}|${end}|${width}|${getMainGridLeft()}|${getMainGridRight()}`;

  if (xTickLayoutCache && xTickLayoutCache.key === key) {
    return xTickLayoutCache;
  }

  const months = DATA.months;
  const gridWidth = Math.max(
    120,
    (width || 800) - getMainGridLeft() - getMainGridRight()
  );
  const pxPerMonth = gridWidth / Math.max(1, end - start);

  const januaries = new Set();

  for (let i = start + 1; i < end; i++) {
    if (months[i].slice(5, 7) === "01") {
      januaries.add(i);
    }
  }

  /* Наименьший шаг по годам, при котором подписи не слипаются. */
  const minSpacing = X_YEAR_LABEL_PX + X_LABEL_GAP_PX;
  let step = X_YEAR_STEPS[X_YEAR_STEPS.length - 1];

  for (const candidate of X_YEAR_STEPS) {
    if (candidate * 12 * pxPerMonth >= minSpacing) {
      step = candidate;
      break;
    }
  }

  /*
   * Крайние подписи прижаты к краям сетки (слева — по левому краю,
   * справа — по правому), поэтому год не должен подходить к краю
   * ближе, чем ширина крайней подписи + зазор + половина года.
   */
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

  /* Первый и последний месяц диапазона: «мар 2021». */
  if (index === layout.start || index === layout.end) {
    return `${MONTH_SHORT_RU[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  }

  /* Промежуточные подписи — только год. */
  if (layout.labels.has(index)) {
    return `{y|${value.slice(0, 4)}}`;
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
    /* Не тускнеет, когда наведение подсвечивает другую линию. */
    blur: { lineStyle: { opacity: 1 } },
    data: [{ yAxis: 100 }],
  };
}


/* ============================================================
   Опции Y-осей
   ============================================================ */

function buildYAxes() {
  const color = "#878787";
  const left = getMainGridLeft();
  const right = getMainGridRight();

  const splitLine = {
    show: true,
    lineStyle: { color: GRID_COLOR },
  };

  /*
   * Процентный режим: одна ось.
   */
  if (state.mode === "percent") {
    return [
      {
        type: "value",
        position: "left",
        name: "%",
        nameTextStyle: {
          color,
          fontSize: AXIS_FONT_PX,
          align: "left",
          padding: [0, 0, 0, -left + 2],
        },
        axisLabel: {
          color,
          fontSize: AXIS_FONT_PX,
          margin: 4,
          formatter: (value) => formatAxisTick(chart, 0, value, "%"),
        },
        splitLine,
        axisLine: { show: false },
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
        color,
        fontSize: AXIS_FONT_PX,
        align: "left",
        padding: [0, 0, 0, -left + 2],
      },
      axisLabel: {
        color,
        fontSize: AXIS_FONT_PX,
        margin: 4,
        formatter: (value) => formatAxisTick(chart, 0, value),
      },

      /* Подпись под курсором: целое число */
      axisPointer: {
        label: {
          formatter: (params) => String(Math.round(Number(params.value))),
        },
      },

      splitLine,
      axisLine: { show: false },
    },

    {
      type: "value",
      position: "right",
      name: "Ставки / курс",
      nameTextStyle: {
        color,
        fontSize: AXIS_FONT_PX,
        align: "right",
        padding: [0, -right + 2, 0, 0],
      },
      axisLabel: {
        color,
        fontSize: AXIS_FONT_PX,
        margin: 4,
        formatter: (value) => formatAxisTick(chart, 1, value),
      },

      /* Подпись под курсором: два знака после запятой */
      axisPointer: {
        label: {
          formatter: (params) => Number(params.value).toFixed(2),
        },
      },

      splitLine: { show: false },
      axisLine: { show: false },
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

    const valueText = state.mode === "percent"
      ? formatPercentChange(rawValue)
      : formatValue(rawValue, meta, false);

    const isActive = Boolean(
      activeId &&
      (param.seriesId === activeId || param.seriesName === activeId)
    );

    html += `
      <div class="tt-row ${isActive ? "is-active" : ""}"
           data-series-id="${param.seriesId}"
           data-series-name="${param.seriesName || ""}"
           style="--row-color:${color};">
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

  const textSecondary = "#878787";
  const textTertiary = "#878787";

  return {
    backgroundColor: "transparent",

    animation: false,

    textStyle: {
      fontFamily: "var(--font-ui)",
    },

    grid: {
      left: getMainGridLeft(),
      right: getMainGridRight(),
      top: 42,
      bottom: 84,

      containLabel: false,
    },

    /*
     * Отключаем автоматическую подсветку (emphasis) всех рядов,
     * которую ECharts включает при tooltip.trigger = "axis".
     * Подсветкой отдельной линии управляет attachLineHoverHighlight().
     */
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

      backgroundColor: "#181a1b",

      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,

      padding: [12, 16],

      textStyle: {
        color: "#ffffff",
        fontSize: 13,
      },

      extraCssText:
        "border-radius:8px;" +
        "box-shadow:0 12px 32px -12px rgba(0,0,0,0.25);" +
        "pointer-events:none;",

      formatter: buildTooltipFormatter,
    },

    xAxis: {
      type: "category",

      data: months,

      boundaryGap: false,

      axisLabel: {
        color: textSecondary,
        fontSize: X_LABEL_FONT_PX,

        margin: 8,

        hideOverlap: true,
        rich: {
          y: {
            fontWeight: 700,
            fontSize: X_LABEL_FONT_PX,
            color: "#c6c6c6",
          },
        },

        /*
         * Подписи задаём явно: первый и последний месяц диапазона
         * всегда видны, между ними — годы, которые помещаются.
         * (Автоматический шаг ECharts мог целиком пропускать январи,
         * и оставалась одна подпись.)
         */
        interval: (index) => getXTickLayout().labels.has(index),
        showMinLabel: true,
        showMaxLabel: true,
        alignMinLabel: "left",
        alignMaxLabel: "right",

        formatter: formatXAxisLabel,
      },

      axisLine: {
        lineStyle: {
          color: "rgba(255,255,255,0.12)",
        },
      },

      axisTick: {
        show: false,
      },

      /* Вертикальная сетка: одна линия на каждый январь (шаг — 1 год). */
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

    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        start: state.zoomStart,
        end: state.zoomEnd,
      },
      {
        type: "slider",
        xAxisIndex: 0,
        start: state.zoomStart,
        end: state.zoomEnd,

        /* Выделение нового диапазона протяжкой по слайдеру отключено. */
        brushSelect: false,

        /* График обновляется прямо во время перетаскивания ручек. */
        realtime: true,

        /* Геометрия DefiLlama */
        left: 8,
        right: 14,
        bottom: 19,
        height: 30,

        ...buildSliderStyle(true),

        labelFormatter: (value, valueStr) => {
          const month = months[Math.round(value)];
          return month || valueStr;
        },
      },
    ],

    graphic: buildMainSliderGraphic(),

    series: buildSeries(),
  };
}


/* ============================================================
   Ручки таймлайна основного графика (линия + таблетка)
   ============================================================ */

function buildMainSliderGraphic() {
  const width = chart ? chart.getWidth() : 0;
  const height = chart ? chart.getHeight() : 0;

  if (!width || !height) {
    return [];
  }

  const track = width - SEASONALITY_SLIDER.left - SEASONALITY_SLIDER.right;
  const y2 = height - SEASONALITY_SLIDER.bottom;
  const y1 = y2 - SEASONALITY_SLIDER.height;

  const xOf = (percent) =>
    SEASONALITY_SLIDER.left + (Number(percent) / 100) * track;

  return [
    ...buildSliderHandleElements(
      "main-slider-handle-start", xOf(state.zoomStart), y1, y2, false
    ),
    ...buildSliderHandleElements(
      "main-slider-handle-end", xOf(state.zoomEnd), y1, y2, false
    ),
  ];
}


let mainSliderGraphicFrame = null;

/* Обновляем ручки в следующем кадре: setOption нельзя вызывать прямо из события ECharts. */
function scheduleMainSliderGraphic() {
  if (mainSliderGraphicFrame) {
    return;
  }

  mainSliderGraphicFrame = requestAnimationFrame(() => {
    mainSliderGraphicFrame = null;

    if (chart) {
      chart.setOption({ graphic: buildMainSliderGraphic() });
    }
  });
}


/* ============================================================
   Стиль слайдера (общий для обоих графиков)
   ============================================================ */

/*
 * Нативные ручки ECharts на основном графике невидимы: они нужны только
 * как широкая зона попадания (~25 × 37 px) с родным перетаскиванием.
 * Сам вид ручек (линия + таблетка) рисует buildMainSliderGraphic().
 */
const SLIDER_HANDLE_ICON = "path://M-4,-6h8v12h-8z";
const SLIDER_HANDLE_INVISIBLE = {
  color: "rgba(0,0,0,0.001)",
  borderColor: "rgba(0,0,0,0)",
  borderWidth: 0,
};

function buildSliderStyle(withShadow) {
  return {
    showDataShadow: withShadow,

    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "transparent",
    fillerColor: "rgba(0,0,0,0.1)",

    handleIcon: SLIDER_HANDLE_ICON,
    handleSize: "125%",
    handleStyle: SLIDER_HANDLE_INVISIBLE,

    /* «Гриппер» над выделенным окном. */
    moveHandleSize: 8,
    moveHandleStyle: {
      color: "#5b5f63",
      borderColor: "transparent",
    },

    dataBackground: {
      lineStyle: { color: "rgba(255,255,255,0.35)", width: 1 },
      areaStyle: { color: "rgba(255,255,255,0.08)" },
    },
    selectedDataBackground: {
      lineStyle: { color: "rgba(255,255,255,0.75)", width: 1 },
      areaStyle: { color: "rgba(255,255,255,0.18)" },
    },

    emphasis: {
      handleStyle: SLIDER_HANDLE_INVISIBLE,
      moveHandleStyle: { color: "#7d8185" },
    },

    textStyle: {
      color: "#878787",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
    },
  };
}


/* ============================================================
   Мини-график внутри слайдера основного графика
   ============================================================
   ECharts рисует мини-график по ПЕРВОМУ ряду. Чтобы управлять тем,
   какой ряд там виден, добавляем невидимый ряд-копию первым в список.
   Он на той же оси Y, что и оригинал, поэтому масштаб осей не меняется.

   Выбор: ряд с самой длинной историей среди выбранных.
   Если выбрана средняя зарплата по Минску и она короче лидера не
   более чем на 12 месяцев — берём её.
   ============================================================ */

const ZOOM_SHADOW_ID = "__zoom_shadow__";
const ZOOM_SHADOW_PREFERRED_KEY = "средняя_средняя_минск";
const ZOOM_SHADOW_TOLERANCE_MONTHS = 12;

function buildZoomShadowSeries(seriesList) {
  let best = null;
  let preferred = null;

  seriesList.forEach((item) => {
    const data = item.data || [];
    let first = -1;
    let last = -1;

    data.forEach((point, index) => {
      if (point == null) return;
      if (first < 0) first = index;
      last = index;
    });

    if (first < 0) return;

    const entry = { item, span: last - first };

    if (!best || entry.span > best.span) best = entry;
    if (item.id === ZOOM_SHADOW_PREFERRED_KEY) preferred = entry;
  });

  if (!best) return null;

  const chosen =
    preferred && preferred.span >= best.span - ZOOM_SHADOW_TOLERANCE_MONTHS
      ? preferred
      : best;

  return {
    id: ZOOM_SHADOW_ID,
    type: "line",
    data: chosen.item.data,
    yAxisIndex: chosen.item.yAxisIndex,
    connectNulls: true,
    silent: true,
    animation: false,
    symbol: "none",
    showSymbol: false,
    lineStyle: { width: 0, opacity: 0 },
    itemStyle: { opacity: 0 },
    emphasis: { disabled: true },
    tooltip: { show: false },
    z: 0,
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

let mainPercentTimer = null;

function wireDataZoom() {
  chart.on("dataZoom", () => {
    const option = chart.getOption();
    const zoom = option && option.dataZoom && option.dataZoom[0];

    if (!zoom) return;

    let start = Number(zoom.start);
    let end = Number(zoom.end);

    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    if (end < start) [start, end] = [end, start];

    state.zoomStart = start;
    state.zoomEnd = end;
    state.lastZoomStart = start;
    state.lastZoomEnd = end;
    state.zoomAnchorEnd = end;
    state.zoomPreset = null;
    updateZoomPresetButtons();
    scheduleMainSliderGraphic();

    /*
     * В процентном режиме 100% зависит от левой границы. Обновляем только
     * серии (merge), а не весь график: полный render() пересоздаёт слайдер
     * прямо под пальцем.
     */
    if (state.mode === "percent") {
      clearTimeout(mainPercentTimer);
      mainPercentTimer = setTimeout(() => {
        chart.setOption({ series: buildSeries() });
      }, 20);
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

    /* Убираем синюю подсветку/выделение области графика при касании. */
    [chartElement, seasonalityChartElement].forEach((element) => {
      element.style.webkitTapHighlightColor = "transparent";
      element.style.webkitUserSelect = "none";
      element.style.userSelect = "none";
    });

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
    wireSeasonalitySlider();

    /*
     * Responsive.
     */
    window.addEventListener(
      "resize",
      () => {
        if (chart) {
          chart.resize();
          chart.setOption({ graphic: buildMainSliderGraphic() });
        }

        if (seasonalityChart) {
          seasonalityChart.resize();
          seasonalityChart.setOption({
            graphic: buildSeasonalitySliderGrid(),
          });
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
            color:#878787;
            font-size:14px;
          ">
            ${String(error.message || error)}
          </div>

          <div style="
            margin-top:12px;
            color:#878787;
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