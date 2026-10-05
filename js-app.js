/* ============================================================
   stats.by — js-app.js
   Верхняя часть страницы, ссылки на график и запуск сайта.

   Подключается ПОСЛЕДНИМ — после js-core.js, js-chart-main.js и
   js-chart-seasonality.js (использует их функции).

     • переключатели (wireSegmented / syncSegmented);
     • Deep Linking: сборка и копирование ссылки, восстановление
       состояния (?g=1, ?g=2) — buildDeepLinkUrl оборачивает
       блок «Налоги»;
     • верхние блоки: курс USD и прогноз, медианная ЗП
       (renderMedianBlock оборачивает блок «Налоги»);
     • «Налоги»: переключатель до / после вычета (бывший tax.js);
     • «Распределение доходов» (бывший income.js);
     • init() — порядок инициализации сайта, и его запуск
       по DOMContentLoaded.
   ============================================================ */

"use strict";


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
   Верхние блоки (над графиками)
   ============================================================ */

/*
 * Прогноз курса на следующий месяц по сезонности.
 *
 * Базовый месяц — прошлый календарный месяц; если по нему ещё нет
 * данных, берём последний месяц, для которого курс есть.
 * Для каждого прошлого года считаем изменение «базовый месяц ->
 * следующий месяц», прогноз — среднее этих изменений
 * (то же, что «среднее» в тултипе графика сезонности).
 */
function computeRateForecast() {
  const values = DATA.series[RATE_KEY];

  if (!Array.isArray(values)) {
    return null;
  }

  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey =
    `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  let baseIdx = DATA.months.indexOf(prevKey);

  if (baseIdx < 0) {
    baseIdx = DATA.months.length - 1;
  }

  while (baseIdx >= 0 && !isNum(values[baseIdx])) {
    baseIdx--;
  }

  if (baseIdx < 0) {
    return null;
  }

  const baseMonthNumber = Number(DATA.months[baseIdx].slice(5, 7));
  const changes = [];

  for (let i = 0; i < baseIdx; i++) {
    if (Number(DATA.months[i].slice(5, 7)) !== baseMonthNumber) continue;
    if (!isNum(values[i]) || !isNum(values[i + 1])) continue;
    if (Number(values[i]) === 0) continue;

    const year = Number(DATA.months[i].slice(0, 4));

    changes.push({
      label: baseMonthNumber === 12 ? `${year}→${year + 1}` : String(year),
      year,
      excluded: isExcludedRateYear(year),
      pct: (Number(values[i + 1]) / Number(values[i]) - 1) * 100,
    });
  }

  const counted = changes.filter((item) => !item.excluded);

  if (!counted.length) {
    return null;
  }

  const average =
    counted.reduce((sum, item) => sum + item.pct, 0) / counted.length;

  return {
    baseMonth: DATA.months[baseIdx],
    baseValue: Number(values[baseIdx]),
    baseMonthNumber,
    nextMonthNumber: baseMonthNumber % 12 + 1,
    changes,
    average,
  };
}


/* Цвет для процента: зелёный / красный / без цвета. */
function pctClass(pct) {
  const rounded = Math.round(pct * 10) / 10;
  return rounded > 0 ? "is-up" : rounded < 0 ? "is-down" : "";
}


function renderRateBlock() {
  const forecast = computeRateForecast();
  const valueEl = document.getElementById("rateValue");

  if (!valueEl) return;

  if (!forecast) {
    valueEl.textContent = "—";
    return;
  }

  valueEl.textContent = formatNumber(forecast.baseValue, 3);

  document.getElementById("rateMonthLabel").textContent =
    `за ${fmtMonthRu(forecast.baseMonth).toLowerCase()}`;

  document.getElementById("rateForecastLabel").textContent =
    `Прогноз на ${MONTH_NAMES_RU[forecast.nextMonthNumber - 1].toLowerCase()}`;

  const pctEl = document.getElementById("rateForecastPct");
  pctEl.textContent = formatPercentChange(100 + forecast.average);
  pctEl.className = `stat-delta ${pctClass(forecast.average)}`.trim();

  /* Подсказка: изменения по годам. */
  const tip = document.getElementById("rateInfoTip");
  const firstYear = forecast.changes[0].year;

  tip.innerHTML = "";

  const title = document.createElement("div");
  title.className = "info-tip-title";
  title.textContent = `согласно статистике с ${firstYear} года:`;
  tip.appendChild(title);

  forecast.changes.forEach((item) => {
    const row = document.createElement("div");
    row.className = "info-tip-row" + (item.excluded ? " is-excluded" : "");

    const name = document.createElement("span");
    name.textContent = item.label;

    const value = document.createElement("span");
    value.className = pctClass(item.pct);
    value.textContent = formatPercentChange(100 + item.pct);

    row.appendChild(name);
    row.appendChild(value);
    tip.appendChild(row);
  });

  wireRateInfo();
}


let rateInfoWired = false;

function wireRateInfo() {
  if (rateInfoWired) return;

  const wrap = document.getElementById("rateInfoWrap");
  const button = document.getElementById("rateInfoBtn");
  const tip = document.getElementById("rateInfoTip");

  if (!wrap || !button || !tip) return;

  rateInfoWired = true;

  const show = () => {
    tip.hidden = false;
    button.classList.add("is-active");
  };

  const hide = () => {
    tip.hidden = true;
    button.classList.remove("is-active");
  };

  /* Мышь: подсказка, пока курсор над кнопкой. */
  wrap.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") show();
  });

  wrap.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hide();
  });

  /* Тач: касание открывает, повторное — закрывает. */
  button.addEventListener("click", () => {
    if (!IS_TOUCH) return;
    tip.hidden ? show() : hide();
  });

  /* Клавиатура. */
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) show();
  });

  button.addEventListener("blur", hide);

  document.addEventListener("pointerdown", (event) => {
    if (!tip.hidden && !wrap.contains(event.target)) hide();
  });
}


/* Блок 2: последняя известная медианная ЗП по Минску (временная версия). */
function renderMedianBlock() {
  const values = DATA.series[MEDIAN_MINSK_KEY];
  const valueEl = document.getElementById("medianValue");

  if (!Array.isArray(values) || !valueEl) return;

  let idx = values.length - 1;

  while (idx >= 0 && !isNum(values[idx])) idx--;

  if (idx < 0) return;

  valueEl.textContent = formatNumber(values[idx], 0);

  document.getElementById("medianMonthLabel").textContent =
    fmtMonthRu(DATA.months[idx]).toLowerCase();
}


function renderTopBlocks() {
  renderRateBlock();
  renderMedianBlock();
}


/* ============================================================
   Инициализация
   ============================================================ */

async function init() {
  try {
    resolveCssColors();

    DATA = await loadData();

    /*
     * События первого графика (data_events.json). Файл необязательный.
     * Загружаем до первого рендера: от их наличия зависит нижний
     * отступ сетки (строка маркеров под осью X).
     */
    EVENTS = await loadEvents();

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
     * Маркеры событий первого графика (положение задаёт layoutEvents
     * после отрисовки).
     */
    buildEventMarkers();

    /* Верхние блоки над графиками. */
    renderTopBlocks();

    /*
     * Первый рендер.
     */
    render();
    renderSeasonality();

    /* Любая перерисовка графика (зум, размер) — пересчёт маркеров. */
    chart.on("finished", layoutEvents);
    layoutEvents();

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
          updateMainSliderOverlay();
          layoutEvents();
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
        events: EVENTS.length,
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
   Налоги: переключатель «до вычета / после вычета»
   ============================================================
   Все исходные данные (data.json, data_salary.json) — ДО вычета
   налогов. Этот блок:
     1) хранит режим сайта (по умолчанию — после вычета);
     2) считает чистый доход = брутто × TAX_FACTOR;
     3) оборачивает функции js-core.js и js-app.js, чтобы пересчитать зарплаты
        (медианная, средняя, минимальная) на графиках и в блоке
        «Медианная ЗП»;
     4) сообщает блоку «Распределение доходов» о смене режима
        (событие taxmodechange).

   Стоит после js-core.js (там convertMonthlyValues) и ДО блока
   «Распределение доходов», который использует window.Tax.
   ============================================================ */
(function () {
  "use strict";

  /* ----- Ставки (меняются в одном месте) --------------------
     Подоходный налог 13% берётся с суммы после взноса в ФСЗН
     (1% с работника):  нетто = брутто × (1 − 0,01) × (1 − 0,13).
     Стандартные налоговые вычеты не учитываются.
     Ставка принята единой для всех лет.                        */
  var INCOME_TAX = 0.13;
  var PENSION_FUND = 0.01;
  var TAX_FACTOR = (1 - PENSION_FUND) * (1 - INCOME_TAX);

  var MODE_NET = "net";
  var MODE_GROSS = "gross";

  var mode = MODE_NET;   /* по умолчанию — после вычета */

  /* Режим из ссылки (?t=gross) */
  try {
    var fromUrl = new URLSearchParams(window.location.search).get("t");
    if (fromUrl === MODE_GROSS || fromUrl === MODE_NET) mode = fromUrl;
  } catch (e) { /* без параметров */ }

  var Tax = {
    factor: TAX_FACTOR,
    getMode: function () { return mode; },
    isNet: function () { return mode === MODE_NET; },

    /* Денежное значение зарплаты -> с учётом режима. */
    apply: function (value) {
      if (value == null || !isFinite(Number(value))) return value;
      return mode === MODE_NET ? Number(value) * TAX_FACTOR : Number(value);
    },

    /* Короткая подпись для подзаголовков. */
    label: function () {
      return mode === MODE_NET ? "после вычета налогов" : "до вычета налогов";
    }
  };

  window.Tax = Tax;


  /* ----- 1. Зарплатные ряды на графиках ---------------------
     convertMonthlyValues(meta, currency) вызывается и основным
     графиком, и сезонностью. Умножаем зарплатные ряды на
     коэффициент; пересчёт в USD (деление на курс) от этого
     не меняется — порядок операций не важен.                    */
  if (typeof convertMonthlyValues === "function") {
    var originalConvert = convertMonthlyValues;

    window.convertMonthlyValues = function (meta, currency) {
      var values = originalConvert(meta, currency);

      if (mode !== MODE_NET) return values;
      if (typeof getInternalGroup !== "function" ||
          getInternalGroup(meta) !== "salary") {
        return values;
      }

      /* БПМ — не зарплата, налоги с него не берутся. */
      if (meta && meta.key === BPM_KEY) return values;

      return values.map(function (value) {
        return value == null || !isFinite(Number(value))
          ? value
          : Number(value) * TAX_FACTOR;
      });
    };
  }


  /* ----- 2. Блок «Медианная ЗП, Минск» ---------------------- */
  if (typeof renderMedianBlock === "function") {
    window.renderMedianBlock = function () {
      var values = DATA.series[MEDIAN_MINSK_KEY];
      var valueEl = document.getElementById("medianValue");
      var labelEl = document.getElementById("medianMonthLabel");

      if (!Array.isArray(values) || !valueEl) return;

      var idx = values.length - 1;
      while (idx >= 0 && !isNum(values[idx])) idx--;
      if (idx < 0) return;

      valueEl.textContent = formatNumber(Tax.apply(values[idx]), 0);

      if (labelEl) {
        labelEl.textContent =
          fmtMonthRu(DATA.months[idx]).toLowerCase() + ", " + Tax.label();
      }
    };
  }


  /* ----- 3. Ссылка на график: добавляем режим --------------- */
  if (typeof buildDeepLinkUrl === "function") {
    var originalDeepLink = buildDeepLinkUrl;

    window.buildDeepLinkUrl = function (source) {
      var url = new URL(originalDeepLink(source));
      url.searchParams.set("t", mode);
      return url.toString();
    };
  }


  /* ----- 4. Переключатель ----------------------------------- */
  function syncButtons() {
    var toggle = document.getElementById("taxToggle");
    if (!toggle) return;

    toggle.querySelectorAll(".segmented-btn").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.value === mode);
    });
  }

  function refreshAll() {
    try {
      if (typeof DATA !== "undefined" && DATA) {
        render();
        renderSeasonality();
        renderTopBlocks();
      }
    } catch (error) {
      console.warn("Не удалось перерисовать после смены режима налогов:", error);
    }

    document.dispatchEvent(
      new CustomEvent("taxmodechange", { detail: { mode: mode } })
    );
  }

  function setMode(next) {
    if (next !== MODE_NET && next !== MODE_GROSS) return;
    if (next === mode) return;

    mode = next;
    syncButtons();
    refreshAll();
  }

  Tax.setMode = setMode;

  var toggle = document.getElementById("taxToggle");

  if (toggle) {
    toggle.querySelectorAll(".segmented-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.dataset.value);
      });
    });
  }

  syncButtons();
})();


/* ============================================================
   Блок «Распределение доходов»
   Данные: data_salary.json (распределение) и data.json (медиана).
   Самодостаточный блок: не использует функции остального кода.
   Режим налогов берётся из блока «Налоги» (window.Tax); без него —
   значения показываются как есть (до вычета).
   ============================================================ */
(function () {
  "use strict";

  /* Целевые доли работников, которые показываем (по 2 в строке). */
  var TARGETS = [90, 80, 70, 60, 50, 40, 30, 20, 15, 10, 5];

  /* Доля 50% берётся не из распределения, а из медианной зарплаты. */
  var MEDIAN_TARGET = 50;
  var MEDIAN_KEYS = {
    minsk: "медианная_минск",
    belarus: "медианная_беларусь"
  };

  var SALARY = null;   /* data_salary.json */
  var MAIN = null;     /* data.json */
  var region = "minsk";

  var grid = document.getElementById("incomeGrid");
  var periodEl = document.getElementById("incomePeriod");
  var toggle = document.getElementById("incomeRegionToggle");

  if (!grid || !toggle) return;

  function fmt(n, digits) {
    return Number(n).toLocaleString("ru-RU", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  /* Пересчёт порога дохода (в данных — до вычета) в текущий режим. */
  function money(value) {
    return window.Tax ? window.Tax.apply(value) : value;
  }

  function taxLabel() {
    return window.Tax ? window.Tax.label() : "до вычета налогов";
  }

  /* Доли меньше 10% — с одним знаком после запятой, остальные — целые. */
  function fmtShare(share) {
    if (share < 10) {
      var rounded = Math.round(Number(share.toFixed(2)) * 10) / 10;
      return fmt(rounded, 1) + "%";
    }
    return fmt(share, 0) + "%";
  }

  /*
   * Для целевого процента ищем интервал, у которого «доля зарабатывающих
   * от порога и выше» (share_from) ближе всего к цели.
   */
  function pickBin(bins, target) {
    var best = null;
    var bestDiff = Infinity;

    bins.forEach(function (bin) {
      var diff = Math.abs(bin.share_from - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = bin;
      }
    });

    return best;
  }

  /* Последнее известное значение медианной зарплаты региона (до вычета). */
  function latestMedian() {
    if (!MAIN || !MAIN.series) return null;

    var values = MAIN.series[MEDIAN_KEYS[region]];
    if (!Array.isArray(values)) return null;

    for (var i = values.length - 1; i >= 0; i--) {
      var v = values[i];
      if (v != null && isFinite(Number(v))) return Number(v);
    }

    return null;
  }

  function addCell(shareText, thresholdText) {
    var cell = document.createElement("div");
    cell.className = "income-cell";

    var pct = document.createElement("span");
    pct.className = "income-pct";
    pct.textContent = shareText;

    var thr = document.createElement("span");
    thr.className = "income-thr";
    thr.textContent = "> " + thresholdText + " BYN";

    cell.appendChild(pct);
    cell.appendChild(thr);
    grid.appendChild(cell);
  }

  function render() {
    var info = SALARY && SALARY.regions && SALARY.regions[region];

    grid.innerHTML = "";

    if (!info) return;

    if (periodEl) {
      periodEl.textContent = info.period && info.period.label
        ? "распределение за " + info.period.label + ", " + taxLabel()
        : "";
    }

    TARGETS.forEach(function (target) {
      if (target === MEDIAN_TARGET) {
        var median = latestMedian();

        if (median != null) {
          addCell("50%", fmt(money(median)));
          return;
        }
        /* Нет data.json — берём ближайшее значение из распределения. */
      }

      var bin = pickBin(info.bins, target);
      if (!bin) return;

      addCell(fmtShare(bin.share_from), fmt(money(bin.from)));
    });

    /* Максимальные доходы: последний (открытый) интервал, напр. >12000. */
    var top = info.bins[info.bins.length - 1];

    if (top) {
      addCell(fmtShare(top.share_from), fmt(money(top.from)));
    }
  }

  toggle.querySelectorAll(".segmented-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      toggle.querySelectorAll(".segmented-btn").forEach(function (item) {
        item.classList.remove("is-active");
      });
      button.classList.add("is-active");
      region = button.dataset.value;
      render();
    });
  });

  /* Смена режима «до / после вычета» (блок «Налоги»). */
  document.addEventListener("taxmodechange", render);

  function loadJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(url + ": HTTP " + response.status);
      return response.json();
    });
  }

  Promise.all([
    loadJson("./data_salary.json"),
    loadJson("./data.json").catch(function (error) {
      console.warn("data.json не загружен:", error);
      return null;
    })
  ])
    .then(function (result) {
      SALARY = result[0];
      MAIN = result[1];
      render();
    })
    .catch(function (error) {
      console.warn("data_salary.json не загружен:", error);
      grid.textContent = "Нет данных";
    });
})();


/* ============================================================
   Запуск
   ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  init
);
