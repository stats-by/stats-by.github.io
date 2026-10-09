/* ============================================================
   stats.by — js-chart-seasonality.js
   Нижний график — «График сезонности».

   Подключается после js-core.js. Точка входа — renderSeasonality().

     • панели показателей и годов;
     • линии по годам, оси, тултип со средним, option для ECharts;
     • собственный таймлайн по месяцам: рамка, ручки, подписи,
       перетаскивание (wireSeasonalitySlider), dataZoom.

   Использует js-core.js. Вызывается из js-app.js: из init() и из
   блока «Налоги» (renderSeasonality() при смене режима налогов).
   ============================================================ */

"use strict";


/* Для курса USD месяцы-аномалии (2022, фев–май) не входят в медиану и зачёркнуты. */
function isSeasonalityExcluded(param) {
  if (state.seasonalityKey !== RATE_KEY) return false;

  const month = String(Number(param.dataIndex) + 1).padStart(2, "0");

  return isExcludedRateMonth(`${param.seriesName}-${month}`);
}


/*
 * HTML заголовка тултипа сезонности: «Октябрь медиана: +1,4%».
 */
function buildSeasonalityAverageHtml(monthName, validParams, meta) {
  const values = validParams
    .filter((param) => !isSeasonalityExcluded(param))
    .map((param) =>
      Number(
        param.value && typeof param.value === "object"
          ? param.value.value
          : param.value
      )
    );

  const average = median(values);
  const percentMode = state.seasonalityMode === "percent";

  let valueText = "—";
  let valueColor = "var(--text-primary)";

  if (average != null && percentMode) {
    valueText = formatChartPercent(average);
    const rounded = Math.round((average - 100) * 10) / 10;
    if (rounded > 0) valueColor = "var(--up)";
    if (rounded < 0) valueColor = "var(--down)";
  } else if (average != null) {
    valueText = formatValue(average, meta, false, state.seasonalityCurrency);
  }

  return `
    <div class="tt-header">
      <span class="tt-date">${monthName}</span>
      <span class="tt-avg-label">медиана:</span>
      <span class="tt-avg-val" style="color:${valueColor};">${valueText}</span>
    </div>
  `;
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

  const values = convertMonthlyValues(meta, state.seasonalityCurrency);
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


/*
 * Стиль линии года: сначала все цвета палитры сплошными, затем те же
 * цвета пунктиром, затем точками (как в показателях первого графика).
 */
const SEASONALITY_DASHES = ["solid", "dashed", "dotted"];

function getSeasonalityYearStyle(index) {
  const i = Math.max(0, index);
  const n = SERIES_PALETTE.length;

  return {
    color: SERIES_PALETTE[i % n],
    dash: SEASONALITY_DASHES[Math.floor(i / n) % SEASONALITY_DASHES.length],
  };
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
    const yearStyle = getSeasonalityYearStyle(index);
    applySwatchDash(swatch, yearStyle.dash, yearStyle.color);

    const text = document.createElement("span");
    text.className = "check-label";
    text.textContent = String(year);

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(text);
    container.appendChild(row);
  });

  updateSeasonalityYearsLayout();
  wireSeasonalityYearsResize(container);
}


/*
 * Число строк в панели «Годы» считаем по ширине: сколько столбцов
 * (колонок фиксированной ширины) помещается, столько и делаем,
 * строк — столько, чтобы вместить все годы.
 */
function updateSeasonalityYearsLayout() {
  const container = document.getElementById("seasonalityYearsList");

  if (!container) return;

  const count = container.children.length;
  const width = container.clientWidth;

  /* Панель свёрнута (ширина 0) — посчитаем, когда раскроют. */
  if (!count || !width) return;

  const styles = getComputedStyle(container);
  const colWidth = parseFloat(styles.gridAutoColumns) || 120;
  const gap = parseFloat(styles.columnGap) || 0;

  const columns = Math.max(1, Math.floor((width + gap) / (colWidth + gap)));
  const rows = Math.max(1, Math.ceil(count / columns));

  container.style.setProperty("--years-rows", String(rows));
}


let seasonalityYearsResizeWired = false;

function wireSeasonalityYearsResize(container) {
  if (seasonalityYearsResizeWired) return;

  seasonalityYearsResizeWired = true;

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(updateSeasonalityYearsLayout).observe(container);
  }

  window.addEventListener("resize", updateSeasonalityYearsLayout);
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

  const metas = sortMetas(getSeriesMeta()).filter(isSeasonalityMeta);
  let currentGroup = null;

  metas.forEach((meta, index) => {
    const groupLabel = getGroupLabel(meta);

    if (groupLabel !== currentGroup) {
      currentGroup = groupLabel;

      /* Группа без подписи (курс USD) — без заголовка. */
      if (groupLabel) {
        const groupTitle = document.createElement("div");
        groupTitle.className = "check-group-label";
        groupTitle.textContent = groupLabel;
        container.appendChild(groupTitle);
      }
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
    applySwatchStyle(swatch, meta, color);

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
      const showOriginalPoints =
        !NO_MARKER_KEYS.has(meta.key) && isSparseMonthlySeries(data);
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

      const yearStyle = getSeasonalityYearStyle(years.indexOf(year));
      const color = yearStyle.color;

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
        lineStyle: { width: 1.5, opacity: 0.8, color, type: yearStyle.dash },
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


function buildSeasonalityYAxis(meta) {
  const percentMode = state.seasonalityMode === "percent";

  return {
    type: "value",
    position: "left",
    scale: true,
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
  const allYears = getSeasonalityYears(meta);

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
    const dash = getSeasonalityYearStyle(
      allYears.indexOf(Number(param.seriesName))
    ).dash;
    const valueText = state.seasonalityMode === "percent"
      ? formatChartPercent(value)
      : formatValue(value, meta, false, state.seasonalityCurrency);

    html += `
      <div class="tt-row ${isActive ? "is-active" : ""} ${isSeasonalityExcluded(param) ? "is-excluded" : ""}"
           data-series-id="${param.seriesId}"
           data-series-name="${param.seriesName || ""}"
           style="--row-color:${color};">
        <span class="tt-dot${dash === "solid" ? "" : " is-dashed"}"${dash === "solid" ? ` style="background:${color};"` : ""}></span>
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


/* Ручка для графика сезонности (элементы компонента graphic). */
function buildSliderHandleElements(idPrefix, x, y1, y2) {
  const centerY = (y1 + y2) / 2;

  return [
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
    /* Невидимая зона только для курсора; перетаскивание — в wireSeasonalitySlider. */
    {
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
    },
  ];
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


/*
 * Таймлайн сезонности: вертикальные линии по месяцам + своя рамка,
 * закрашенное окно, две ручки и подписи месяцев. Геометрия —
 * SEASONALITY_SLIDER (js-core.js). 12 месяцев равномерно по ширине
 * дорожки.
 */
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
      `seasonality-slider-handle-${name}`, x, y1, y2
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
    /*
     * Диапазон читаем из модели dataZoom (без копирования данных рядов,
     * как делает getOption()). Если внутренний метод недоступен —
     * запасной путь через getOption().
     */
    let start = NaN;
    let end = NaN;

    try {
      const model = seasonalityChart.getModel && seasonalityChart.getModel();
      const zoomModel = model && model.getComponent("dataZoom", 0);
      const range =
        zoomModel && zoomModel.getValueRange && zoomModel.getValueRange();

      if (Array.isArray(range)) {
        start = Math.round(Number(range[0]));
        end = Math.round(Number(range[1]));
      }
    } catch (error) {
      start = NaN;
      end = NaN;
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      const option = seasonalityChart.getOption();
      const zoom = option && option.dataZoom && option.dataZoom[0];

      if (!zoom) return;

      start = Math.round(Number(zoom.startValue));
      end = Math.round(Number(zoom.endValue));
    }

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
