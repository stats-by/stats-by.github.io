/* ============================================================
   stats.by — js-core.js
   Ядро: константы, общее состояние, данные и общие помощники.

   Подключается ПЕРВЫМ. Здесь нет кода, который строит конкретный
   график или блок страницы — только то, что нужно сразу нескольким
   файлам:

     • окружение и константы (IS_TOUCH, палитра, порядок показателей);
     • состояние (state, DATA, chart, seasonalityChart);
     • метаданные рядов, группы, цвета;
     • загрузка и проверка data.json;
     • налоги (Tax): режим «до / после вычета», ставка, формула;
     • даты, единицы, конвертация валют и налогов
       (convertMonthlyValues), годовые ряды, интерполяция, проценты;
     • форматирование чисел;
     • общее для обоих графиков: подсветка линий и строки тултипа,
       пунктир 100%, геометрия и вид ручек слайдера;
     • общие константы верхних блоков (RATE_KEY).

   Все top-level функции и константы глобальные — файлы общаются
   через глобальные имена, как и раньше (без import/export).
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

/* Месяцы в родительном падеже — для дат событий: «13 августа 2026». */
const MONTH_GEN_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/*
 * Подписи оси X основного графика.
 * Ширины — оценка в пикселях для шрифта 12px: нужны только для того,
 * чтобы решить, какие годы между крайними подписями поместятся.
 */
const X_EDGE_LABEL_PX = 46;   /* «сен 2026» */
const X_YEAR_LABEL_PX = 28;   /* «2021» */
const X_LABEL_GAP_PX = 5;     /* минимальный зазор между подписями (и до крайних подписей) */

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

/*
 * Ключи рядов — это колонка `key` в блоках над таблицами data.xlsx
 * (они же попадают в data.json и в ссылки «Скопировать ссылку»).
 * Здесь перечислены только те ключи, на которые завязана логика сайта
 * (цвета линий, пересчёты, индексы, блок «Первый взнос»).
 * Подписи, единицы, группы и порядок рядов задаются в xlsx.
 * Если переименовываете ключ в xlsx — поменяйте его и здесь.
 */
const KEY = {
  medBy: "med-by",
  avgBy: "avg-by",
  medMinsk: "med-minsk",
  avgMinsk: "avg-minsk",
  minWage: "min-wage",
  bpm: "bpm",

  rate: "usd-rate",
  refi: "refi",

  rentTs: "rent-ts",
  rentRealt: "rent-realt",

  realt1k: "realt-1k",
  realt2k: "realt-2k",
  realt3k: "realt-3k",
  realt4k: "realt-4k",
  realtAdsNew: "realt-ads-new",
  realtAdsSec: "realt-ads-sec",
  realtAdsAll: "realt-ads-all",
  realtDeals: "realt-deals",

  wiki1k: "wiki-1k",
  wiki2k: "wiki-2k",
  wiki3k: "wiki-3k",
  wiki4k: "wiki-4k",
  wikiAll: "wiki-all",
  wikiDeals: "wiki-deals",
  wikiDealsNew: "wiki-deals-new",
  wikiDealsSec: "wiki-deals-sec",

  buildK: "build-k",
  build: "build",

  /* Индексы считаются в этом файле (DERIVED_INDEX_DEFS). */
  idxMedAvgMinsk: "idx-med-avg-minsk",
  idxMedAvgBy: "idx-med-avg-by",
  idxMedMinskBy: "idx-med-minsk-by",
  idxMedM2: "idx-med-m2",
  idxAvgM2: "idx-avg-m2",
  idxRentMed: "idx-rent-med",
};

/*
 * Группы (колонка `группа` в xlsx): код -> подпись в панели показателей.
 * Порядок групп в панели — порядок ключей здесь.
 * Пустая подпись = группа без заголовка (курс USD: самый верх панели).
 */
const GROUPS = {
  rate: "",
  salary: "Зарплаты",
  construction: "Строительство",
  rent: "Аренда",
  realt: "стоимость квартир Realt",
  wikidom: "стоимость квартир Wikidom",
  refinancing: "Ставка",
  index: "Индексы",
};

const GROUP_ORDER = Object.keys(GROUPS);



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
  seasonalityKey: KEY.rate,

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
 * Цвет и стиль линии каждого показателя — в одном месте.
 *
 * Логика: ЦВЕТ = что показываем, ПУНКТИР = второй вариант того же:
 *   Минск — сплошная, Беларусь — пунктир;
 *   Realt — сплошная, Wikidom — пунктир;
 *   аренда t-s.by — сплошная, аренда Realt — пунктир.
 * Цвета не зависят от порядка рядов в data.json.
 *
 * dash: "solid" | "dashed" | "dotted"; width — необязательно.
 * Ряды, которых нет в таблице, получают цвет из SERIES_PALETTE.
 */
const SERIES_STYLE = {
  /* Зарплаты */
  [KEY.avgMinsk]:  { color: "#E14F63", dash: "solid" },
  [KEY.avgBy]:     { color: "#E14F63", dash: "dashed" },
  [KEY.medMinsk]:  { color: "#F2B84B", dash: "solid" },
  [KEY.medBy]:     { color: "#F2B84B", dash: "dashed" },
  [KEY.minWage]:   { color: "#8A8F98", dash: "solid" },
  [KEY.bpm]:       { color: "#FFFFFF", dash: "solid", width: 1.5 },

  /* Курс */
  [KEY.rate]:      { color: "#3DDC84", dash: "solid" },

  /* Аренда */
  [KEY.rentTs]:    { color: "#35D0E8", dash: "solid" },
  [KEY.rentRealt]: { color: "#35D0E8", dash: "dashed" },

  /* Стоимость м²: Realt — сплошная, Wikidom — пунктир */
  [KEY.realt1k]:   { color: "#4C8DFF", dash: "solid" },
  [KEY.wiki1k]:    { color: "#4C8DFF", dash: "dashed" },
  [KEY.realt2k]:   { color: "#FF6FB5", dash: "solid" },
  [KEY.wiki2k]:    { color: "#FF6FB5", dash: "dashed" },
  [KEY.realt3k]:   { color: "#B07CFF", dash: "solid" },
  [KEY.wiki3k]:    { color: "#B07CFF", dash: "dashed" },
  [KEY.realt4k]:   { color: "#FF9A52", dash: "solid" },
  [KEY.wiki4k]:    { color: "#FF9A52", dash: "dashed" },
  [KEY.wikiAll]:   { color: "#A8D84F", dash: "solid" },

  /* Объявления Realt */
  [KEY.realtAdsNew]: { color: "#7FD6C2", dash: "solid" },
  [KEY.realtAdsSec]: { color: "#7FD6C2", dash: "dashed" },
  [KEY.realtAdsAll]: { color: "#7FD6C2", dash: "dotted" },

  /* Сделки */
  [KEY.realtDeals]:    { color: "#D6D96B", dash: "solid" },
  [KEY.wikiDeals]:     { color: "#D6D96B", dash: "dashed" },
  [KEY.wikiDealsNew]:  { color: "#E8A33D", dash: "solid" },
  [KEY.wikiDealsSec]:  { color: "#E8A33D", dash: "dashed" },

  /* Строительство */
  [KEY.buildK]:    { color: "#C98B5B", dash: "solid" },
  [KEY.build]:     { color: "#C98B5B", dash: "dashed" },

  /* Индексы */
  [KEY.idxMedAvgMinsk]: { color: "#9BE15D", dash: "solid" },
  [KEY.idxMedAvgBy]:    { color: "#9BE15D", dash: "dashed" },
  [KEY.idxMedMinskBy]:  { color: "#7FDBFF", dash: "solid" },
  [KEY.idxMedM2]:       { color: "#FF8FA3", dash: "solid" },
  [KEY.idxAvgM2]:       { color: "#FF8FA3", dash: "dashed" },
  [KEY.idxRentMed]:     { color: "#E5E5E5", dash: "solid" },
};


/* Ряды, на которых точки (маркеры) не рисуются никогда. */
const NO_MARKER_KEYS = new Set([
  KEY.rentTs,
]);



/* Цвет ряда: из SERIES_STYLE, иначе — из общей палитры по индексу. */
function getSeriesColor(meta, index) {
  const style = meta && SERIES_STYLE[meta.key];

  if (style) {
    return style.color;
  }

  return SERIES_PALETTE[index % SERIES_PALETTE.length];
}


/* Тип линии: "solid" | "dashed" | "dotted". */
function getSeriesDash(meta) {
  const style = meta && SERIES_STYLE[meta.key];

  return (style && style.dash) || "solid";
}


function getSeriesWidth(meta, fallback) {
  const style = meta && SERIES_STYLE[meta.key];

  return (style && style.width) || fallback;
}


/*
 * Квадратик цвета в панели показателей: сплошной у сплошных линий,
 * со штриховкой (is-dashed) / точками (is-dotted) — у остальных.
 */
function applySwatchStyle(element, meta, color) {
  applySwatchDash(element, getSeriesDash(meta), color);
}


function applySwatchDash(element, dash, color) {

  element.style.setProperty("--sw", color);
  element.classList.toggle("is-dashed", dash === "dashed");
  element.classList.toggle("is-dotted", dash === "dotted");

  if (dash === "solid") {
    element.style.background = color;
  } else {
    element.style.background = "";
  }
}


/* ============================================================
   Группы
   ============================================================ */

/*
 * Подпись группы в панели показателей. Пустая строка — группа без
 * заголовка. Неизвестный код группы показываем как есть (чтобы
 * опечатка в xlsx была заметна).
 */
function getGroupLabel(meta) {
  if (!meta || !meta.group) {
    return "Прочее";
  }

  return Object.prototype.hasOwnProperty.call(GROUPS, meta.group)
    ? GROUPS[meta.group]
    : meta.group;
}


/* Количество сделок — штуки, а не деньги: валюта на них не влияет. */
function isDealsSeries(meta) {
  return !!meta && meta.unit === "шт.";
}


/*
 * Группа определяет поведение ряда при переключении валюты:
 * salary — исходно BYN, housing — исходно USD, rate — курс, other — без пересчёта.
 */
function getInternalGroup(meta) {
  if (isDealsSeries(meta)) return "other";

  switch (meta && meta.group) {
    case "salary":
      return "salary";

    case "realt":
    case "wikidom":
    case "rent":
      return "housing";

    case "rate":
      return "rate";

    default:
      return "other";
  }
}


/* ============================================================
   Загрузка data.json
   ============================================================ */

/*
 * data.json нужен нескольким блокам (графики, «Распределение доходов»,
 * «Первый взнос»). Скачиваем и проверяем его один раз: все вызывающие
 * получают один и тот же промис и один и тот же объект. Блоки данные
 * не меняют (validateData один раз правит подписи и добавляет индексы).
 * Если загрузка не удалась, кэш сбрасывается — следующий вызов попробует снова.
 */
let dataPromise = null;

function loadData() {
  if (!dataPromise) {
    dataPromise = (async () => {
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
    })().catch((error) => {
      dataPromise = null;
      throw error;
    });
  }

  return dataPromise;
}


/* ============================================================
   Проверка структуры data.json
   ============================================================ */

/* «м2» -> «м²» (буква «м» и надстрочная двойка). */
function fixSquare(text) {
  return String(text).replace(/м2/g, "м\u00B2");
}


/*
 * Подписи берём из xlsx как есть, только «м2» -> «м²».
 * Регистр и формулировки правятся в xlsx.
 */
function fixLabel(text) {
  if (text == null || text === "") return text;

  return fixSquare(text);
}

function validateData(data) {  if (!data || typeof data !== "object") {
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

  /* Подписи: «м2» -> «м²» (остальное — как в xlsx). */
  data.series_meta.forEach((meta) => {
    meta.label = fixLabel(meta.label);
    meta.tooltip_label = fixLabel(meta.tooltip_label);

    if (meta.unit) {
      meta.unit = fixSquare(meta.unit);
    }
  });

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
    const inSeries = data.series.hasOwnProperty(meta.key);
    const inAnnual = data.annual_series.hasOwnProperty(meta.key);

    if (!inSeries && !inAnnual) {
      console.warn(
        `series_meta содержит ${meta.key}, но самого ряда нет в series.`
      );
    }
  });

  addDerivedIndices(data);
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


function getDisplayUnit(meta, currency = state.currency) {
  if (!meta) {
    return "";
  }

  const group = getInternalGroup(meta);

  /*
   * Зарплаты:
   * исходные данные в BYN.
   */
  if (group === "salary") {
    return currency;
  }

  /*
   * Жильё:
   * исходные данные в USD.
   */
  if (group === "housing") {
    return currency;
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
  if (meta && meta.derived) {
    return getDerivedData(meta).values.slice();
  }

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
   Налоги: режим «до вычета / после вычета»
   ============================================================
   Все исходные данные (data.json, data_salary.json) — ДО вычета
   налогов. Tax — единственное место, где живут режим сайта, ставки
   и формула пересчёта:

     нетто = брутто × (1 − ФСЗН 1%) × (1 − подоходный 13%)

   Подоходный налог 13% берётся с суммы после взноса в ФСЗН
   (1% с работника). Стандартные налоговые вычеты не учитываются.
   Ставка принята единой для всех лет.

   Потребители обращаются к Tax напрямую (без проверок наличия):
     • convertMonthlyValues (ниже) — зарплатные ряды обоих графиков;
     • renderMedianBlock, «Распределение доходов», buildDeepLinkUrl
       (js-app.js) — Tax.apply / Tax.label / Tax.getMode.

   Смена режима: Tax.setMode(...) меняет режим и рассылает на
   document событие "taxmodechange" (detail.mode). На него подписаны
   js-app.js (перерисовка графиков и верхних блоков, кнопки
   переключателя) и блок «Распределение доходов».

   Если Tax окажется недоступен — это ReferenceError в консоли,
   а не тихие суммы до вычета.
   ============================================================ */

const Tax = (function () {
  const INCOME_TAX = 0.13;
  const PENSION_FUND = 0.01;
  const FACTOR = (1 - PENSION_FUND) * (1 - INCOME_TAX);

  const MODE_NET = "net";
  const MODE_GROSS = "gross";

  /* По умолчанию — после вычета. */
  let mode = MODE_NET;

  /* Режим из ссылки (?t=gross / ?t=net). */
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("t");

    if (fromUrl === MODE_GROSS || fromUrl === MODE_NET) {
      mode = fromUrl;
    }
  } catch (error) {
    /* без параметров */
  }

  return {
    factor: FACTOR,

    getMode() {
      return mode;
    },

    isNet() {
      return mode === MODE_NET;
    },

    /* Денежное значение зарплаты -> с учётом режима. */
    apply(value) {
      if (value == null || !isFinite(Number(value))) return value;

      return mode === MODE_NET ? Number(value) * FACTOR : Number(value);
    },

    /* Короткая подпись для подзаголовков. */
    label() {
      return mode === MODE_NET ? "после вычета налогов" : "до вычета налогов";
    },

    /*
     * Облагается ли ряд: все зарплатные ряды (медианная, средняя,
     * минимальная). БПМ — не зарплата, налоги с него не берутся.
     */
    isTaxedMeta(meta) {
      return (
        !!meta &&
        meta.key !== KEY.bpm &&
        getInternalGroup(meta) === "salary"
      );
    },

    setMode(next) {
      if (next !== MODE_NET && next !== MODE_GROSS) return;
      if (next === mode) return;

      mode = next;

      document.dispatchEvent(
        new CustomEvent("taxmodechange", { detail: { mode } })
      );
    },
  };
})();


/* ============================================================
   Индексы (производные ряды первого графика)
   ============================================================
   Считаются из рядов data.json на лету. Входные ряды линейно
   интерполируются между публикациями (до первой и после последней
   точки не продлеваются). Зарплаты в индексах 4–6 учитывают режим
   налогов Tax; в индексах 1–3 налоги сокращаются. Переключатель
   валюты на индексы не влияет.

   real[i] = true, если в этом месяце опубликованы все входные ряды;
   по нему график ставит маркеры и пометку «аппр.».
   ============================================================ */

const DERIVED_INDEX_DEFS = [
  {
    key: KEY.idxMedAvgMinsk,
    order: 1,
    label: "медианная ЗП в % от средней, Минск",
    unit: "%",
    decimals: 1,
    inputs: [KEY.medMinsk, KEY.avgMinsk],
    calc: (v) => (v[1] ? (v[0] / v[1]) * 100 : null),
  },
  {
    key: KEY.idxMedAvgBy,
    order: 2,
    label: "медианная ЗП в % от средней, страна",
    unit: "%",
    decimals: 1,
    inputs: [KEY.medBy, KEY.avgBy],
    calc: (v) => (v[1] ? (v[0] / v[1]) * 100 : null),
  },
  {
    key: KEY.idxMedMinskBy,
    order: 3,
    label: "медианная ЗП: Минск в % от страны",
    unit: "%",
    decimals: 1,
    inputs: [KEY.medMinsk, KEY.medBy],
    calc: (v) => (v[1] ? (v[0] / v[1]) * 100 : null),
  },
  {
    key: KEY.idxMedM2,
    order: 4,
    label: "медианная ЗП Минск, м\u00B2",
    unit: "м\u00B2",
    decimals: 2,
    inputs: [KEY.medMinsk, KEY.rate, KEY.realt1k],
    calc: (v, f) => (v[1] && v[2] ? (v[0] * f) / v[1] / v[2] : null),
  },
  {
    key: KEY.idxAvgM2,
    order: 5,
    label: "средняя ЗП Минск, м\u00B2",
    unit: "м\u00B2",
    decimals: 2,
    inputs: [KEY.avgMinsk, KEY.rate, KEY.realt1k],
    calc: (v, f) => (v[1] && v[2] ? (v[0] * f) / v[1] / v[2] : null),
  },
  {
    key: KEY.idxRentMed,
    order: 6,
    label: "аренда однушки в % от медианной ЗП",
    unit: "%",
    decimals: 0,
    inputs: [KEY.rentTs, KEY.rate, KEY.medMinsk],
    calc: (v, f) => (v[2] ? ((v[0] * v[1]) / (v[2] * f)) * 100 : null),
  },
];

function addDerivedIndices(data) {
  DERIVED_INDEX_DEFS.forEach((def) => {
    if (data.series_meta.some((meta) => meta.key === def.key)) return;

    data.series_meta.push({
      key: def.key,
      label: def.label,
      tooltip_label: def.label,
      group: "index",
      order: def.order,
      unit: def.unit,
      decimals: def.decimals,
      frequency: "monthly",
      derived: true,
    });
  });
}

/* Линейная интерполяция между известными точками; real — исходные точки. */
function interpolateLinearPlain(values, length) {
  const out = new Array(length).fill(null);
  const real = new Array(length).fill(false);
  let prev = -1;

  for (let i = 0; i < length; i++) {
    if (!isNum(values[i])) continue;

    out[i] = Number(values[i]);
    real[i] = true;

    if (prev >= 0 && i - prev > 1) {
      for (let j = prev + 1; j < i; j++) {
        out[j] = out[prev] + ((out[i] - out[prev]) * (j - prev)) / (i - prev);
      }
    }

    prev = i;
  }

  return { vals: out, real };
}

const derivedCache = {};

function getDerivedData(meta) {
  const cacheKey = `${meta.key}|${Tax.getMode()}`;

  if (derivedCache[cacheKey]) return derivedCache[cacheKey];

  const def = DERIVED_INDEX_DEFS.find((item) => item.key === meta.key);
  const length = DATA.months.length;
  const values = new Array(length).fill(null);
  const real = new Array(length).fill(false);

  if (def) {
    const inputs = def.inputs.map((key) =>
      interpolateLinearPlain(DATA.series[key] || [], length)
    );
    const factor = Tax.isNet() ? Tax.factor : 1;

    for (let i = 0; i < length; i++) {
      if (!inputs.every((input) => input.vals[i] != null)) continue;

      const value = def.calc(inputs.map((input) => input.vals[i]), factor);

      if (value != null && Number.isFinite(value)) {
        values[i] = value;
        real[i] = inputs.every((input) => input.real[i]);
      }
    }
  }

  derivedCache[cacheKey] = { values, real };

  return derivedCache[cacheKey];
}


/* ============================================================
   Конвертация валюты
   ============================================================ */

function getUsdRateSeries() {
  return (DATA.series && DATA.series[KEY.rate]) || null;
}


/*
 * Только валюта (без налогов): исходный ряд -> BYN или USD.
 */
function convertMonthlyCurrency(meta, currency) {
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


/*
 * Месячные значения ряда для графиков: валюта + налоги.
 *
 * Зарплатные ряды в режиме «после вычета» умножаются на коэффициент
 * Tax (пересчёт в USD — деление на курс — от этого не меняется:
 * порядок операций не важен). Остальные ряды — как есть.
 * Вызывается и основным графиком, и сезонностью.
 */
function convertMonthlyValues(meta, currency) {
  const values = convertMonthlyCurrency(meta, currency);

  if (!Tax.isNet() || !Tax.isTaxedMeta(meta)) {
    return values;
  }

  return values.map((value) => Tax.apply(value));
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


function formatValue(value, meta, percentMode = false, currency = state.currency) {
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

  /* Индексы: знаки после запятой и единица заданы в самом индексе. */
  if (meta && meta.derived) {
    const digits = meta.decimals == null ? 2 : meta.decimals;

    return meta.unit === "%"
      ? `${formatNumber(number, digits)}%`
      : `${formatNumber(number, digits)} ${meta.unit}`;
  }

  if (isPercentSeries(meta)) {
    return `${formatNumber(number, 2)}%`;
  }

  if (isRateSeries(meta)) {
    return formatNumber(number, 3);
  }

  /* Количество сделок: число без единицы измерения. */
  if (isDealsSeries(meta)) return formatNumber(number, 0);

  const unit = getDisplayUnit(meta, currency);

  /*
   * Доходы (зарплатные ряды): от 0 до 10 — 0,00; от 10 до 100 — 0,0;
   * больше 100 — целые. Нужно для ранних лет, когда в USD суммы малы.
   */
  if (getInternalGroup(meta) === "salary") {
    const abs = Math.abs(number);
    const digits = abs > 100 ? 0 : abs >= 10 ? 1 : 2;

    return `${formatNumber(number, digits)} ${unit}`;
  }

  /*
   * Прочие денежные показатели.
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
  if (change < 0) return `−${text}%`;
  return `${text}%`;
}


/*
 * Изменение относительно базы для тултипов графиков.
 * level — уровень (101,4 = +1,4%). Если уровень выше 120% или ниже 80% —
 * изменение округляется до целых (+25%, −25%), иначе до 0,1 (+19,9%).
 */
function formatChartPercent(level) {
  if (level == null || !Number.isFinite(Number(level))) {
    return "—";
  }

  const n = Number(level);
  const digits = n > 120 || n < 80 ? 0 : 1;
  const k = Math.pow(10, digits);
  const change = Math.round((n - 100) * k) / k;
  const text = Math.abs(change).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  if (change > 0) return `+${text}%`;
  if (change < 0) return `\u2212${text}%`;
  return `${text}%`;
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
   Сортировка показателей для панелей
   ============================================================ */

function sortMetas(metas) {
  const groupIndex = (meta) => {
    const index = GROUP_ORDER.indexOf(meta.group);

    return index === -1 ? 999 : index;
  };

  const orderOf = (meta) =>
    Number.isFinite(Number(meta.order)) ? Number(meta.order) : 999;

  return metas.slice().sort((a, b) => {
    if (groupIndex(a) !== groupIndex(b)) {
      return groupIndex(a) - groupIndex(b);
    }

    /* Порядок внутри группы — колонка `порядок` в xlsx. */
    if (orderOf(a) !== orderOf(b)) {
      return orderOf(a) - orderOf(b);
    }

    return String(a.label || a.key).localeCompare(
      String(b.label || b.key),
      "ru"
    );
  });
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


/*
 * Геометрия слайдера под графиком: left 8, right 14, bottom 19,
 * height 30. Одна на оба графика: по ней основной график позиционирует
 * свои ручки (updateMainSliderOverlay), а сезонность рисует весь
 * таймлайн. Имя историческое — константа появилась в сезонности.
 */
const SEASONALITY_SLIDER = { left: 8, right: 14, bottom: 19, height: 30 };

/*
 * Ручки таймлайна — одинаковые на обоих графиках, как у DefiLlama:
 * тонкая вертикальная линия на всю высоту слайдера + небольшая
 * «таблетка» по центру. Вид рисуем отдельно от зоны попадания:
 * зона широкая и невидимая, поэтому по ручке легко попасть.
 */
const HANDLE_COLOR = "rgba(255,255,255,0.9)";
const HANDLE_PILL_FILL = "rgba(0,0,0,0.85)";
const HANDLE_LINE_WIDTH = 1.5;
const HANDLE_PILL_W = 6;
const HANDLE_PILL_H = 20;
const HANDLE_PILL_RADIUS = 2.5;
const HANDLE_PILL_BORDER = 1;
const HANDLE_HIT_W = 26;         /* ширина невидимой зоны на графике сезонности */


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


/*
 * Идентификатор служебного ряда-копии для мини-графика в слайдере
 * основного графика (см. buildZoomShadowSeries в js-chart-main.js).
 * Лежит здесь, потому что общая подсветка линий
 * (attachLineHoverHighlight) пропускает этот ряд.
 */

const ZOOM_SHADOW_ID = "__zoom_shadow__";


/* ============================================================
   Общие константы и хелперы
   ============================================================
   Относятся к верхним блокам (js-app.js), но нужны и другим:
   RATE_KEY и isExcludedRateMonth — графику сезонности,
   isNum — верхним блокам (js-app.js).
   ============================================================ */

const RATE_KEY = KEY.rate;

/*
 * Месяцы, исключаемые из расчёта медианного изменения курса USD
 * (аномалия 2022): изменение, затрагивающее такой месяц, не считается.
 */
const RATE_EXCLUDED_MONTHS = ["2022-02", "2022-03", "2022-04", "2022-05"];

/* В верхнем блоке курса учитываем только данные с этого месяца. */
const RATE_STATS_FROM = "2016-05";

function isExcludedRateMonth(ym) {
  return RATE_EXCLUDED_MONTHS.includes(ym);
}

/* Медиана массива чисел (null, если массив пуст). */
function median(values) {
  const sorted = values
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (!sorted.length) return null;

  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* Показатели, которых нет в графике сезонности (кроме группы «Строительство»). */
const SEASONALITY_HIDDEN_KEYS = [
  KEY.medBy,
  KEY.medMinsk,
  KEY.bpm,
  KEY.minWage,
  KEY.realt3k,
  KEY.realt4k,
  KEY.wiki3k,
  KEY.wiki4k,
];

function isSeasonalityMeta(meta) {
  return meta.group !== "construction" &&
    meta.group !== "index" &&
    !SEASONALITY_HIDDEN_KEYS.includes(meta.key);
}

function isNum(value) {
  return value != null && Number.isFinite(Number(value));
}



/* ============================================================
   Deep Link: общие помощники ссылок
   ============================================================
   Формат ссылок (все блоки):
     • списки и периоды разделены "_" (не запятой, чтобы не было %2C);
     • ряды — ключи из колонки `key` в xlsx (короткие латинские);
     • годы сезонности — диапазоны: 2019-2021_2023-2026;
     • месяцы сезонности — с 1: r=3-8;
     • хвост #... в ссылку не попадает.
   ============================================================ */

/* Ключ ряда в ссылке — это и есть ключ из xlsx. */
function seriesId(key) {
  return String(key);
}


/* Ключ ряда из ссылки -> ключ в data.json, иначе null. */
function keyFromSeriesToken(token) {
  const value = String(token == null ? "" : token).trim();

  return getSeriesMeta().some((meta) => meta.key === value) ? value : null;
}


/* Список рядов из ссылки: "a-b_c-d". */
function parseSeriesList(value) {
  const out = [];

  String(value || "").split("_").forEach((token) => {
    const key = keyFromSeriesToken(token);

    if (key && !out.includes(key)) out.push(key);
  });

  return out;
}


/* [2019,2020,2021,2023] -> "2019-2021_2023". */
function formatYearRanges(years) {
  const list = Array.from(
    new Set(years.map(Number).filter((year) => Number.isInteger(year)))
  ).sort((a, b) => a - b);

  const parts = [];
  let i = 0;

  while (i < list.length) {
    let j = i;

    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;

    parts.push(j > i ? `${list[i]}-${list[j]}` : String(list[i]));
    i = j + 1;
  }

  return parts.join("_");
}


/* "2019-2021_2023" -> [2019,2020,2021,2023]. */
function parseYearRanges(value) {
  const out = [];

  String(value || "").split("_").forEach((part) => {
    const match = /^(\d{4})(?:-(\d{4}))?$/.exec(part.trim());

    if (!match) return;

    let from = Number(match[1]);
    let to = match[2] ? Number(match[2]) : from;

    if (from > to) [from, to] = [to, from];
    if (to - from > 300) return;

    for (let year = from; year <= to; year++) out.push(year);
  });

  return out;
}


/* "3-8" (месяцы с 1) -> [2, 7] (индексы с 0) или null. */
function parseMonthRange(value) {
  if (!value) return null;

  const parts = value.split("-");

  if (parts.length !== 2 || parts.some((part) => part.trim() === "")) {
    return null;
  }

  const from = Number(parts[0]) - 1;
  const to = Number(parts[1]) - 1;

  return Number.isInteger(from) && Number.isInteger(to) ? [from, to] : null;
}


/*
 * Адрес страницы с новыми параметрами, без хвоста #... .
 * Строка запроса собирается вручную: "_" и "-" остаются как есть.
 */
function makeShareUrl(pairs) {
  const url = new URL(window.location.href);

  url.hash = "";
  url.search = pairs
    .map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");

  return url.toString();
}
