/* ============================================================
   Налоги: переключатель «до вычета / после вычета»
   ============================================================
   Все исходные данные (data.json, data_salary.json) — ДО вычета
   налогов. Этот модуль:
     1) хранит режим сайта (по умолчанию — после вычета);
     2) считает чистый доход = брутто × TAX_FACTOR;
     3) оборачивает функции app.js, чтобы пересчитать зарплаты
        (медианная, средняя, минимальная) на графиках и в блоке
        «Медианная ЗП»;
     4) сообщает income.js о смене режима (событие taxmodechange).

   Подключать ПОСЛЕ app.js и ДО income.js.
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
