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
  "Realt",
  "Wikidom",
  "Аренда",
  "Строительство",
  "Ставка",
];


/* ============================================================
   Состояние приложения
   ============================================================ */

const state = {
  currency: "BYN",
  mode: "absolute",

  visible: {},

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
};


/* ============================================================
   Глобальные данные
   ============================================================ */

let DATA = null;
let chart = null;

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
    "средняя_средняя_по_стране": "--c-avg-country",
    "средняя_средняя_минск": "--c-avg-minsk",
    "мин_зп_минимальная_по_стране": "--c-median-country",
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
      realt: "Realt",
      wikidom: "Wikidom",
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
    return "Realt";
  }

  if (sheet.includes("wikidom")) {
    return "Wikidom";
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

    case "Realt":
    case "Wikidom":
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
   Значения по умолчанию
   ============================================================ */

function clearIndicators() {
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
    let values = getSeriesValues(meta);

    if (state.mode === "percent") {
      values = normalizeToPercent(values, baseIndex);
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

    const sparse = values.filter(
      (value) => value != null
    ).length < Math.max(60, months.length * 0.35);

    return {
      id: meta.key,
      name: getSeriesLabel(meta),
      type: "line",

      data: values,

      yAxisIndex,

      showSymbol: sparse,
      symbolSize: sparse ? 6 : 3,

      connectNulls: true,

      /*
       * LTTB хорошо подходит для плотных рядов.
       * Для sparse-рядов оставляем исходные точки.
       */
      sampling: sparse ? undefined : "lttb",

      lineStyle: {
        color,
        width: 2,
      },

      itemStyle: {
        color,
      },

      emphasis: {
        focus: "series",
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

  let html = `
    <div style="
      font-weight:600;
      margin-bottom:8px;
    ">
      ${fmtMonthRu(month)}
    </div>
  `;

  params.forEach((param) => {
    const meta = metaByKey(param.seriesId);

    if (!meta) {
      return;
    }

    const rawValue = param.value;

    if (
      rawValue == null ||
      !Number.isFinite(Number(rawValue))
    ) {
      return;
    }

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

    html += `
      <div style="
        display:flex;
        align-items:center;
        gap:8px;
        margin-top:4px;
      ">
        <span style="
          width:8px;
          height:8px;
          border-radius:50%;
          background:${color};
          flex:0 0 8px;
        "></span>

        <span style="
          flex:1;
          color:#8A97A6;
        ">
          ${getSeriesLabel(meta)}
        </span>

        <span style="
          font-weight:600;
          margin-left:12px;
        ">
          ${valueText}
        </span>
      </div>
    `;
  });

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
        "box-shadow:0 8px 24px rgba(0,0,0,0.35);",

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

      {
        type: "inside",

        xAxisIndex: 0,

        start: state.zoomStart,
        end: state.zoomEnd,

        zoomOnMouseWheel: true,

        moveOnMouseMove: true,

        moveOnMouseWheel: true,
      },
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
        dataZoomIndex: [0, 1],
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

    /*
     * По умолчанию показываем последние 10 лет доступных данных
     * выбранных показателей. Если данных меньше 10 лет,
     * показываем весь доступный диапазон.
     */
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

    /*
     * Панель показателей.
     */
    buildCheckboxPanel();

    /*
     * Первый рендер.
     */
    render();

    /*
     * Переключатель валюты.
     */
    wireSegmented(
      "currencyToggle",
      (value) => {
        state.currency = value;

        render();
      }
    );

    /*
     * Переключатель абсолютное / проценты.
     */
    wireSegmented(
      "modeToggle",
      (value) => {
        state.mode = value;

        updatePercentHint();

        render();
      }
    );

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

    /*
     * Responsive.
     */
    window.addEventListener(
      "resize",
      () => {
        if (chart) {
          chart.resize();
        }
      }
    );

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