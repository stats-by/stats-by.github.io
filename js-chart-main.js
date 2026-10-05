/* ============================================================
   stats.by — js-chart-main.js
   Основной (верхний) график.

   Подключается после js-core.js. Точка входа — render().

     • панель показателей (чекбоксы) и видимость рядов;
     • построение линий, осей X/Y, тултип, option для ECharts;
     • слайдер и зум: ручки, пресеты «Год / 5 лет…», dataZoom;
     • маркеры событий под осью X (data_events.json);
     • подсказка процентного режима.

   Использует js-core.js. Вызывается из js-app.js: из init() и из
   блока «Налоги» (render() при смене режима налогов).
   ============================================================ */

"use strict";


/* ============================================================
   Панель показателей основного графика
   ============================================================ */

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
 * Нижний отступ сетки. Если на графике есть события, под подписями
 * оси X резервируем строку для их маркеров (EVENT_ROW_H).
 */
function getMainGridBottom() {
  return 84 + (EVENTS.length ? EVENT_ROW_H : 0);
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
        <span class="tt-name">${meta.tooltip_label || getSeriesLabel(meta)}</span>
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
      bottom: getMainGridBottom(),

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

    series: buildSeries(),
  };
}


/* ============================================================
   Вид ручек таймлайна основного графика (линия + таблетка)
   ============================================================
   Рисуем напрямую в zrender, вне компонентов ECharts, и двигаем
   через attr() — без setOption. Так слайдер не пересоздаётся под
   пальцем, и родное перетаскивание работает как раньше.
   Элементы silent: события получает невидимая нативная ручка.
   ============================================================ */

let mainSliderOverlay = null;

function ensureMainSliderOverlay() {
  if (mainSliderOverlay) {
    return mainSliderOverlay;
  }

  if (!chart || !echarts.graphic) {
    return null;
  }

  const graphic = echarts.graphic;
  const group = new graphic.Group();
  const overlay = { group };

  ["start", "end"].forEach((name) => {
    overlay[name] = {
      line: new graphic.Line({
        silent: true,
        z: 100,
        shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
        style: { stroke: HANDLE_COLOR, lineWidth: HANDLE_LINE_WIDTH },
      }),
      pill: new graphic.Rect({
        silent: true,
        z: 101,
        shape: {
          x: 0,
          y: 0,
          width: HANDLE_PILL_W,
          height: HANDLE_PILL_H,
          r: HANDLE_PILL_RADIUS,
        },
        style: {
          fill: HANDLE_PILL_FILL,
          stroke: HANDLE_COLOR,
          lineWidth: HANDLE_PILL_BORDER,
        },
      }),
    };

    group.add(overlay[name].line);
    group.add(overlay[name].pill);
  });

  chart.getZr().add(group);
  mainSliderOverlay = overlay;

  return overlay;
}


function updateMainSliderOverlay() {
  const overlay = ensureMainSliderOverlay();

  if (!overlay) {
    return;
  }

  const width = chart.getWidth();
  const height = chart.getHeight();

  if (!width || !height) {
    return;
  }

  /* Та же геометрия, что у dataZoom slider: left 8, right 14, bottom 19, height 30. */
  const track = width - SEASONALITY_SLIDER.left - SEASONALITY_SLIDER.right;
  const y2 = height - SEASONALITY_SLIDER.bottom;
  const y1 = y2 - SEASONALITY_SLIDER.height;
  const centerY = (y1 + y2) / 2;

  [["start", state.zoomStart], ["end", state.zoomEnd]].forEach(
    ([name, percent]) => {
      const x = SEASONALITY_SLIDER.left + (Number(percent) / 100) * track;

      overlay[name].line.attr({ shape: { x1: x, y1, x2: x, y2 } });
      overlay[name].pill.attr({
        shape: {
          x: x - HANDLE_PILL_W / 2,
          y: centerY - HANDLE_PILL_H / 2,
        },
      });
    }
  );
}


/* ============================================================
   Стиль слайдера основного графика
   ============================================================ */

/*
 * Нативные ручки ECharts на основном графике невидимы: они остаются
 * широкой зоной попадания (~25 × 37 px) с родным перетаскиванием.
 * Вид ручек (линия + таблетка) рисует updateMainSliderOverlay().
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
   События на первом графике (data_events.json)
   ============================================================
   data_events.json собирает build_events.py из events.xlsx. Маркеры —
   обычные HTML-кнопки в слое #eventsLayer поверх графика: они
   стоят в отдельной строке под подписями оси X и привязаны к
   месяцу события, поэтому двигаются вместе с зумом.

   Наведение (мышь) или касание/фокус (тач, клавиатура) показывает
   пунктирную вертикальную линию и тултип с описанием.
   ============================================================ */

/* Лист events.xlsx, события которого рисуются на первом графике. */
const EVENTS_SHEET = "медианная";

const EVENT_COLOR_NAMES = new Set(["red", "green", "blue", "yellow"]);

/* Высота строки маркеров под осью X, px. */
const EVENT_ROW_H = 22;

/* Расстояние от оси X до центра маркера, px. */
const EVENT_CENTER_OFFSET = 34;

/* Размер маркера (должен совпадать с .event-marker в style.css), px. */
const EVENT_SIZE = 20;

const EVENT_STAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"></path>' +
  "</svg>";

let EVENTS = [];
let eventItems = [];
let activeEventItem = null;
let eventsLayerEl = null;
let eventLineEl = null;
let eventTipEl = null;
let eventsOutsideListenerAdded = false;


/* «2026-08-13» -> «13 августа 2026». */
function fmtEventDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));

  if (!match) {
    return String(iso);
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return String(iso);
  }

  return `${Number(match[3])} ${MONTH_GEN_RU[month - 1]} ${match[1]}`;
}


/*
 * Загружает data_events.json. Файл необязательный: если его нет или он
 * повреждён, сайт работает как раньше, без маркеров.
 */
async function loadEvents() {
  try {
    const response = await fetch("./data_events.json", {
      cache: "no-cache",
    });

    if (!response.ok) {
      return [];
    }

    const json = await response.json();
    const list = json && json.sheets && json.sheets[EVENTS_SHEET];

    if (!Array.isArray(list)) {
      return [];
    }

    return list.filter((ev) =>
      ev &&
      typeof ev.text === "string" &&
      EVENT_COLOR_NAMES.has(ev.color) &&
      getMonthIndex(ev.month) !== undefined
    );
  } catch (error) {
    console.warn("data_events.json не загружен:", error);
    return [];
  }
}


function getMainGridRect() {
  try {
    const model = chart.getModel();
    const grid = model.getComponent("grid", 0);
    const rect = grid && grid.coordinateSystem && grid.coordinateSystem.getRect();

    if (rect && Number.isFinite(rect.x) && Number.isFinite(rect.width)) {
      return rect;
    }
  } catch (error) {
    /* ниже — расчёт по параметрам сетки */
  }

  const left = getMainGridLeft();
  const right = getMainGridRight();
  const top = 42;
  const bottom = getMainGridBottom();

  return {
    x: left,
    y: top,
    width: chart.getWidth() - left - right,
    height: chart.getHeight() - top - bottom,
  };
}


function hideEvent() {
  if (activeEventItem) {
    activeEventItem.el.classList.remove("is-active");
  }

  activeEventItem = null;

  if (eventLineEl) eventLineEl.hidden = true;
  if (eventTipEl) eventTipEl.hidden = true;
}


/* Пунктирная линия и тултип рядом с активным маркером. */
function positionEventTip(item) {
  if (!eventTipEl || !eventLineEl || !eventsLayerEl) {
    return;
  }

  const rect = getMainGridRect();
  const layerWidth = eventsLayerEl.clientWidth;

  eventLineEl.style.left = `${item.x}px`;
  eventLineEl.style.top = `${rect.y}px`;
  eventLineEl.style.height =
    `${Math.max(0, item.y - EVENT_SIZE / 2 - rect.y)}px`;

  const tipWidth = eventTipEl.offsetWidth;
  const tipHeight = eventTipEl.offsetHeight;
  const gap = 12;

  /* Тултип справа от линии; если не помещается — слева. */
  let left = item.x + gap;

  if (left + tipWidth > layerWidth - 4) {
    left = item.x - gap - tipWidth;
  }

  left = Math.max(4, Math.min(layerWidth - tipWidth - 4, left));

  /* Над строкой маркеров, внутри области графика. */
  const top = Math.max(4, item.y - EVENT_SIZE / 2 - 8 - tipHeight);

  eventTipEl.style.left = `${left}px`;
  eventTipEl.style.top = `${top}px`;
}


function showEvent(item) {
  if (!item || !item.visible || !eventTipEl || !eventLineEl) {
    return;
  }

  if (activeEventItem && activeEventItem !== item) {
    activeEventItem.el.classList.remove("is-active");
  }

  activeEventItem = item;
  item.el.classList.add("is-active");

  eventTipEl.innerHTML = "";

  const dateEl = document.createElement("div");
  dateEl.className = "event-tip-date";
  dateEl.textContent = fmtEventDate(item.ev.date);

  const textEl = document.createElement("div");
  textEl.className = "event-tip-text";
  textEl.textContent = item.ev.text;

  eventTipEl.appendChild(dateEl);
  eventTipEl.appendChild(textEl);

  eventTipEl.hidden = false;
  eventLineEl.hidden = false;

  positionEventTip(item);
}


/*
 * Ставит маркеры по текущему положению месяцев на оси X.
 * Вызывается после каждой отрисовки, зума и изменения размера.
 */
function layoutEvents() {
  if (!chart || !DATA || !eventItems.length) {
    return;
  }

  const rect = getMainGridRect();
  const centerY = rect.y + rect.height + EVENT_CENTER_OFFSET;

  eventItems.forEach((item) => {
    let x = null;

    try {
      const pixel = chart.convertToPixel(
        { xAxisIndex: 0 },
        DATA.months[item.index]
      );

      x = Array.isArray(pixel) ? pixel[0] : pixel;
    } catch (error) {
      x = null;
    }

    const visible =
      Number.isFinite(x) &&
      x >= rect.x - 0.5 &&
      x <= rect.x + rect.width + 0.5;

    item.visible = visible;
    item.el.hidden = !visible;

    if (visible) {
      item.x = x;
      item.y = centerY;
      item.el.style.left = `${x}px`;
      item.el.style.top = `${centerY}px`;
    }
  });

  if (activeEventItem) {
    if (activeEventItem.visible) {
      positionEventTip(activeEventItem);
    } else {
      hideEvent();
    }
  }
}


function buildEventMarkers() {
  eventsLayerEl = document.getElementById("eventsLayer");

  if (!eventsLayerEl) {
    return;
  }

  eventsLayerEl.innerHTML = "";
  eventItems = [];
  activeEventItem = null;

  if (!EVENTS.length) {
    return;
  }

  eventLineEl = document.createElement("div");
  eventLineEl.className = "event-line";
  eventLineEl.hidden = true;

  eventTipEl = document.createElement("div");
  eventTipEl.className = "event-tip";
  eventTipEl.setAttribute("role", "tooltip");
  eventTipEl.hidden = true;

  eventsLayerEl.appendChild(eventLineEl);
  eventsLayerEl.appendChild(eventTipEl);

  /*
   * Порядок в DOM = порядок наложения: важные события (приоритет 1)
   * идут последними и лежат сверху, если маркеры стоят рядом.
   * События без приоритета — внизу.
   */
  const sorted = EVENTS.slice().sort((a, b) =>
    (b.priority ?? 99) - (a.priority ?? 99) ||
    String(a.date).localeCompare(String(b.date))
  );

  sorted.forEach((ev) => {
    const el = document.createElement("button");

    el.type = "button";
    el.className = `event-marker is-${ev.color}`;
    el.setAttribute("aria-label", `${fmtEventDate(ev.date)}: ${ev.text}`);
    el.innerHTML = EVENT_STAR_SVG;

    const item = {
      ev,
      el,
      index: getMonthIndex(ev.month),
      x: 0,
      y: 0,
      visible: false,
    };

    /* Мышь: подсветка и тултип, пока курсор над маркером. */
    el.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") showEvent(item);
    });

    el.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && activeEventItem === item) {
        hideEvent();
      }
    });

    /* Тач: касание показывает тултип, повторное — скрывает. */
    el.addEventListener("click", () => {
      if (!IS_TOUCH) return;

      if (activeEventItem === item) {
        hideEvent();
      } else {
        showEvent(item);
      }
    });

    /* Клавиатура: Tab на маркер показывает тултип. */
    el.addEventListener("focus", () => {
      if (el.matches(":focus-visible")) showEvent(item);
    });

    el.addEventListener("blur", () => {
      if (activeEventItem === item) hideEvent();
    });

    eventsLayerEl.appendChild(el);
    eventItems.push(item);
  });

  /* Касание или клик в любом другом месте закрывает тултип. */
  if (!eventsOutsideListenerAdded) {
    eventsOutsideListenerAdded = true;

    document.addEventListener("pointerdown", (event) => {
      if (!activeEventItem) return;

      const target = event.target;

      if (target && target.closest && target.closest(".event-marker")) {
        return;
      }

      hideEvent();
    });
  }
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

  updateMainSliderOverlay();
  layoutEvents();
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
    updateMainSliderOverlay();
    layoutEvents();

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
