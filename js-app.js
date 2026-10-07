/* ============================================================
   stats.by — js-app.js
   Верхняя часть страницы, ссылки на график и запуск сайта.

   Подключается ПОСЛЕДНИМ — после js-core.js, js-chart-main.js и
   js-chart-seasonality.js (использует их функции).

     • переключатели (wireSegmented / syncSegmented);
     • Deep Linking: сборка и копирование ссылки, восстановление
       состояния (?g=1, ?g=2); в ссылку добавляется режим налогов (?t=);
     • верхние блоки: курс USD и прогноз, зарплата (медианная и
       средняя; значения — с учётом режима налогов, Tax из js-core.js);
     • «Налоги»: интерфейс переключателя до / после вычета
       (режим, ставки и формула — Tax в js-core.js);
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

  /* Начальное состояние для скринридеров берём из класса is-active. */
  buttons.forEach((item) => {
    item.setAttribute(
      "aria-pressed",
      item.classList.contains("is-active") ? "true" : "false"
    );
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.remove("is-active");
        item.setAttribute("aria-pressed", "false");
      });

      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");

      onChange(button.dataset.value);
    });
  });
}


function syncSegmented(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.querySelectorAll(".segmented-btn").forEach((button) => {
    const active = button.dataset.value === value;

    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
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
    .split(/[,_]/)
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
  const pairs = [["g", source === "seasonality" ? "2" : "1"]];

  if (source === "seasonality") {
    pairs.push(["s", state.seasonalityKey ? seriesId(state.seasonalityKey) : ""]);
    pairs.push(["y", formatYearRanges(Array.from(state.seasonalityYears))]);
    pairs.push(["c", state.seasonalityCurrency]);
    pairs.push(["m", state.seasonalityMode]);
    /* Месяцы в ссылке считаются с 1. */
    pairs.push([
      "r",
      `${state.seasonalityMonthStart + 1}-${state.seasonalityMonthEnd + 1}`,
    ]);
  } else {
    pairs.push([
      "i",
      getSeriesMeta()
        .filter((meta) => state.visible[meta.key])
        .map((meta) => seriesId(meta.key))
        .join("_"),
    ]);
    pairs.push(["c", state.currency]);
    pairs.push(["m", state.mode]);

    const startMonth = getMonthFromZoomPercent(state.zoomStart);
    const endMonth = getMonthFromZoomPercent(state.zoomEnd);

    if (startMonth && endMonth) {
      pairs.push(["z", `${startMonth}_${endMonth}`]);
    }
  }

  /* Режим налогов (читается в Tax, js-core.js, при загрузке страницы). */
  pairs.push(["t", Tax.getMode()]);

  return makeShareUrl(pairs);
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
    /* Нет ни одного известного ряда — остаётся набор по умолчанию. */
    const keys = parseSeriesList(params.get("i"));

    if (keys.length) {
      getSeriesMeta().forEach((meta) => {
        state.visible[meta.key] = false;
      });

      keys.forEach((key) => {
        state.visible[key] = true;
      });
    }

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
        .filter(isSeasonalityMeta)
        .map((meta) => meta.key)
    );
    const seasonalityParam = params.get("s");

    if (seasonalityParam === "") {
      state.seasonalityKey = null;
    } else if (seasonalityParam) {
      /* Неизвестный ID — остаётся показатель по умолчанию. */
      const seasonalityKey = keyFromSeriesToken(seasonalityParam);

      if (seasonalityKey && validKeys.has(seasonalityKey)) {
        state.seasonalityKey = seasonalityKey;
      }
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
    const years = parseYearRanges(params.get("y"))
      .filter((year) => availableYears.has(year));

    state.seasonalityYears = new Set(years);
    state.seasonalityYearsInitialized = true;

    const range = parseMonthRange(params.get("r"));

    if (range) {
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
 * следующий месяц»; прогноз — МЕДИАНА этих изменений.
 *
 * Не учитываются: данные до RATE_STATS_FROM (май 2016) и изменения,
 * затрагивающие месяцы-аномалии 2022 (RATE_EXCLUDED_MONTHS).
 * Годы не из расчёта в подсказке показываются зачёркнутыми.
 * Список изменений — от новых лет к старым.
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
    const month = DATA.months[i];

    if (Number(month.slice(5, 7)) !== baseMonthNumber) continue;
    if (month < RATE_STATS_FROM) continue;
    if (!isNum(values[i]) || !isNum(values[i + 1])) continue;
    if (Number(values[i]) === 0) continue;

    const year = Number(month.slice(0, 4));

    changes.push({
      label: baseMonthNumber === 12 ? `${year}→${year + 1}` : String(year),
      year,
      excluded:
        isExcludedRateMonth(month) ||
        isExcludedRateMonth(DATA.months[i + 1]),
      pct: (Number(values[i + 1]) / Number(values[i]) - 1) * 100,
    });
  }

  changes.reverse();

  const counted = changes.filter((item) => !item.excluded);
  const med = median(counted.map((item) => item.pct));

  if (med == null) {
    return null;
  }

  const baseValue = Number(values[baseIdx]);

  return {
    baseMonth: DATA.months[baseIdx],
    baseValue,
    baseMonthNumber,
    nextMonthNumber: baseMonthNumber % 12 + 1,
    changes,
    median: med,
    forecastValue: baseValue * (1 + med / 100),
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

  document.getElementById("rateTitle").textContent =
    `Средний курс за ${fmtMonthRu(forecast.baseMonth).toLowerCase()}`;

  document.getElementById("rateForecastLabel").textContent =
    `Прогноз на ${MONTH_NAMES_RU[forecast.nextMonthNumber - 1].toLowerCase()}`;

  const pctEl = document.getElementById("rateForecastPct");
  pctEl.textContent = formatPercentChange(100 + forecast.median);
  pctEl.className = `stat-delta ${pctClass(forecast.median)}`.trim();

  /* Прогнозное значение курса — серым, моноширинным шрифтом, x,xx. */
  const forecastValueEl = document.getElementById("rateForecastValue");

  if (forecastValueEl) {
    forecastValueEl.textContent = `≈ ${formatNumber(forecast.forecastValue, 2)}`;
  }

  /* Подсказка: изменения по годам, от новых к старым. */
  const tip = document.getElementById("rateInfoTip");
  const firstYear = forecast.changes[forecast.changes.length - 1].year;

  tip.innerHTML = "";

  const title = document.createElement("div");
  title.className = "info-tip-title";
  title.textContent =
    `медианное изменение по статистике с ${firstYear} года ` +
    `(зачёркнутые не учитываются):`;
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

  wireInfoTip("rateInfoWrap", "rateInfoBtn", "rateInfoTip");
}


/*
 * Кнопка «i» с всплывающей подсказкой (курс USD, распределение доходов).
 * Мышь — пока курсор над кнопкой или подсказкой; тач — касание
 * открывает, повторное закрывает; клавиатура — фокус.
 */
function wireInfoTip(wrapId, buttonId, tipId) {
  const wrap = document.getElementById(wrapId);
  const button = document.getElementById(buttonId);
  const tip = document.getElementById(tipId);

  if (!wrap || !button || !tip || wrap.dataset.wired) return;

  wrap.dataset.wired = "1";

  let timer = null;

  const show = () => {
    clearTimeout(timer);
    tip.hidden = false;
    button.classList.add("is-active");
  };

  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
    button.classList.remove("is-active");
  };

  const hideSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, 150);
  };

  wrap.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") show();
  });

  wrap.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hideSoon();
  });

  button.addEventListener("click", () => {
    if (!IS_TOUCH) return;
    tip.hidden ? show() : hide();
  });

  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) show();
  });

  button.addEventListener("blur", hide);

  document.addEventListener("pointerdown", (event) => {
    if (!tip.hidden && !wrap.contains(event.target)) hide();
  });
}


/*
 * Блок 2: зарплата — медианная и средняя, переключатель Минск / Беларусь,
 * рост за 12 месяцев (последний известный месяц к тому же месяцу
 * годом ранее). Значения — с учётом режима налогов (Tax, js-core.js).
 */
let salaryRegion = "minsk";

const SALARY_KEYS = {
  minsk: { median: "медианная_минск", avg: "средняя_средняя_минск" },
  belarus: { median: "медианная_беларусь", avg: "средняя_средняя_по_стране" },
};


function latestWithYearChange(values) {
  if (!Array.isArray(values)) return null;

  let idx = values.length - 1;

  while (idx >= 0 && !isNum(values[idx])) idx--;

  if (idx < 0) return null;

  const prevValue = values[idx - 12];
  const pct = isNum(prevValue) && Number(prevValue) !== 0
    ? (Number(values[idx]) / Number(prevValue) - 1) * 100
    : null;

  return { idx, value: Number(values[idx]), pct };
}


function renderMedianBlock() {
  const keys = SALARY_KEYS[salaryRegion] || SALARY_KEYS.minsk;
  const taxText = Tax.label();

  [
    ["median", "median"],
    ["avg", "avg"],
  ].forEach(([kind, prefix]) => {
    const valueEl = document.getElementById(`${prefix}Value`);
    const deltaEl = document.getElementById(`${prefix}Delta`);
    const noteEl = document.getElementById(`${prefix}Note`);
    const labelEl = document.getElementById(`${prefix}MonthLabel`);

    if (!valueEl) return;

    const info = latestWithYearChange(DATA.series[keys[kind]]);

    if (!info) {
      valueEl.textContent = "—";
      if (deltaEl) deltaEl.textContent = "";
      if (noteEl) noteEl.textContent = "";
      if (labelEl) labelEl.textContent = "";
      return;
    }

    valueEl.textContent = formatNumber(Tax.apply(info.value), 0);

    if (deltaEl) {
      deltaEl.textContent = info.pct == null
        ? ""
        : formatPercentChange(100 + info.pct);
      deltaEl.className = `stat-delta stat-delta-sm ${
        info.pct == null ? "" : pctClass(info.pct)
      }`.trim();
    }

    if (noteEl) {
      noteEl.textContent = info.pct == null ? "" : "за 12 мес.";
    }

    if (labelEl) {
      /* «, после вычета налогов» — отдельный span: на телефоне скрыт (CSS). */
      labelEl.textContent = fmtMonthRu(DATA.months[info.idx]).toLowerCase();

      const taxEl = document.createElement("span");
      taxEl.className = "salary-tax";
      taxEl.textContent = `, ${taxText}`;
      labelEl.appendChild(taxEl);
    }
  });
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
     * Переключатель региона в блоке «Зарплата».
     */
    wireSegmented(
      "salaryRegionToggle",
      (value) => {
        salaryRegion = value;
        renderMedianBlock();
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
      /* Текст ошибки вставляем через textContent, а не innerHTML. */
      const box = document.createElement("div");
      box.style.cssText =
        "padding:24px;color:#E8ECF1;font-family:var(--font-ui);";

      const title = document.createElement("strong");
      title.textContent = "Не удалось загрузить данные.";

      const message = document.createElement("div");
      message.style.cssText =
        "margin-top:8px;color:#878787;font-size:14px;";
      message.textContent = String(error.message || error);

      const hint = document.createElement("div");
      hint.style.cssText =
        "margin-top:12px;color:#878787;font-size:12px;";
      hint.textContent =
        "Открой консоль браузера (F12 → Console), " +
        "если нужна дополнительная диагностика.";

      box.appendChild(title);
      box.appendChild(message);
      box.appendChild(hint);

      chartElement.innerHTML = "";
      chartElement.appendChild(box);
    }
  }
}


/* ============================================================
   Налоги: переключатель «до вычета / после вычета»
   ============================================================
   Режим, ставки и формула живут в Tax (js-core.js); сами пересчёты
   выполняют потребители напрямую: convertMonthlyValues (графики),
   renderMedianBlock, блок «Распределение доходов», buildDeepLinkUrl.

   Здесь — только интерфейс:
     1) кнопки #taxToggle вызывают Tax.setMode(...);
     2) на событие taxmodechange (его рассылает Tax.setMode)
        синхронизируем кнопки и перерисовываем оба графика и блок
        зарплаты (renderMedianBlock). Блок курса от налогов не зависит,
        поэтому не перерисовывается; если появится новый верхний блок,
        зависящий от налогов, его нужно добавить в refreshAfterTaxChange.
        Блок «Распределение доходов» подписан на то же событие сам.

   Подключается при загрузке файла (а не из init()), чтобы переключатель
   работал независимо от загрузки data.json.
   ============================================================ */

function refreshAfterTaxChange() {
  /* Данные ещё не загружены — перерисовывать нечего. */
  if (!DATA) return;

  render();
  renderSeasonality();
  renderMedianBlock();
}

syncSegmented("taxToggle", Tax.getMode());

wireSegmented("taxToggle", (value) => {
  Tax.setMode(value);
});

document.addEventListener("taxmodechange", (event) => {
  syncSegmented("taxToggle", event.detail.mode);
  refreshAfterTaxChange();
});


/* ============================================================
   Блок «Распределение доходов»
   Данные: data_salary.json (распределение) и data.json (медиана).
   Почти самодостаточный блок: из остального кода использует только
   wireInfoTip (кнопка «i») и Tax (js-core.js) — режим налогов.
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
    return Tax.apply(value);
  }

  function taxLabel() {
    return Tax.label();
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

  /* Тултип: > 100 — целые, 10…100 — 0,0, до 10 — 0,00. */
  function fmtSmart(n) {
    var a = Math.abs(Number(n));
    return fmt(n, a > 100 ? 0 : a >= 10 ? 1 : 2);
  }

  /* Доля в тултипе: от 10% — один знак, меньше 10% — два. */
  function fmtShareTip(share) {
    return fmtSmart(share) + "%";
  }

  /* Подпись интервала дохода (границы — в текущем режиме налогов). */
  function binLabel(bin) {
    if (bin.from === 0) return "< " + fmtSmart(money(bin.to));
    if (bin.to == null) return "> " + fmtSmart(money(bin.from));
    return fmtSmart(money(bin.from)) + "–" + fmtSmart(money(bin.to));
  }

  /* Подсказка «i»: все интервалы распределения из data_salary.json. */
  function renderInfo(info) {
    var tip = document.getElementById("incomeInfoTip");
    if (!tip) return;

    tip.innerHTML = "";

    var head = document.createElement("div");
    head.className = "inc-info-head";

    var title = document.createElement("div");
    title.textContent = "Все интервалы дохода, " + info.name +
      (info.period && info.period.label ? ", " + info.period.label : "");

    var meta = document.createElement("div");
    meta.className = "is-muted";
    meta.textContent = taxLabel() + ". Работников всего: " + fmt(info.total);

    head.appendChild(title);
    head.appendChild(meta);
    tip.appendChild(head);

    var table = document.createElement("div");
    table.className = "inc-table";

    function cell(text, cls) {
      var el = document.createElement("span");
      el.textContent = text;
      if (cls) el.className = cls;
      table.appendChild(el);
    }

    cell("Доход, BYN", "is-head");
    cell("в интервале", "is-head");
    cell("этот доход и выше", "is-head");
    cell("человек", "is-head");

    info.bins.forEach(function (bin) {
      cell(binLabel(bin));
      cell(fmtShareTip(bin.share));
      cell(fmtShareTip(bin.share_from));
      cell(fmt(bin.workers));
    });

    tip.appendChild(table);
  }

  function render() {
    var info = SALARY && SALARY.regions && SALARY.regions[region];

    grid.innerHTML = "";

    if (!info) return;

    renderInfo(info);

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
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      region = button.dataset.value;
      render();
    });
  });

  /* Смена режима «до / после вычета» (Tax.setMode, js-core.js). */
  document.addEventListener("taxmodechange", render);

  /* Подсказка «i» (wireInfoTip объявлена выше в этом файле). */
  wireInfoTip("incomeInfoWrap", "incomeInfoBtn", "incomeInfoTip");

  function loadJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(url + ": HTTP " + response.status);
      return response.json();
    });
  }

  Promise.all([
    loadJson("./data_salary.json"),
    loadData().catch(function (error) {
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
