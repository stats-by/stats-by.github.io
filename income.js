/* ============================================================
   Блок «Распределение доходов»
   Данные: data_salary.json (распределение) и data.json (медиана).
   Самодостаточный модуль: не зависит от app.js.
   Режим налогов берётся из tax.js (window.Tax); без него —
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

  /* Смена режима «до / после вычета» (tax.js). */
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
