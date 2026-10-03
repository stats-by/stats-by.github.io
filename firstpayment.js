/* ============================================================
   Блок «Первый взнос»
   Сколько лет минчанин УЖЕ копил бы на первый взнос по ипотеке
   на хрущёвку. Самодостаточный модуль: читает data.json сам,
   с app.js не связан. Расчёт — чистая функция FirstPayment.calc().
   ============================================================ */
(function () {
  "use strict";

  /* ----- Настройки (все допущения — здесь) ----------------- */
  var CFG = {
    AREA: 33,                          /* м² хрущёвки */
    TAX: (1 - 0.01) * (1 - 0.13),      /* всегда «после вычета»: ФСЗН 1% + подоходный 13% */
    MIN_DOWN: 0.2,                     /* минимальный первоначальный взнос — 20% цены */
    BACKTEST_MONTHS: 36,               /* окно для коэффициента «медиана / средняя» */
    /* Прожиточный минимум, BYN/мес (ЗАГЛУШКА, пока нет в data.json) */
    LIVING: { 2013: 105, 2014: 140, 2015: 172, 2016: 174, 2017: 197, 2018: 214, 2019: 231, 2020: 258,
              2021: 288, 2022: 375, 2023: 367, 2024: 437, 2025: 491, 2026: 530.37 },
    /* Курс USD/BYN до 2016 года в базе нет — ПРИБЛИЗИТЕЛЬНЫЕ средние за год (заглушка). */
    RATE_STUB: { 2013: 0.90, 2014: 1.00, 2015: 1.59 },
    KEY: {
      median: "медианная_минск",
      avg: "средняя_средняя_минск",
      rate: "курс_usd_курс_usd_byn",
      price: "realt_м2_стоимость_м2_однушек",
      rent: "аренда_стоимость_аренды_realt",
      refi: "ставка_реф_ставка_рефинансирования"
    }
  };

  var st = { hold: "pillow", spread: 0, rent: false, family: false,
             loan: "annuity", rate: 14.3, years: 25 };
  var P = null;

  /* ----- Утилиты ------------------------------------------- */
  function num(v) { return v != null && isFinite(Number(v)) ? Number(v) : null; }

  function fmt(n, d) {
    return Number(n).toLocaleString("ru-RU",
      { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  function lastIdx(arr, upTo) {
    for (var i = Math.min(upTo, arr.length - 1); i >= 0; i--) if (num(arr[i]) != null) return i;
    return -1;
  }

  /* Линейно между известными точками; после последней — последнее значение. */
  function fill(arr, end) {
    var out = [], prev = -1, i, j;
    for (i = 0; i <= end; i++) out.push(null);
    for (i = 0; i <= end; i++) {
      if (num(arr[i]) == null) continue;
      out[i] = Number(arr[i]);
      if (prev >= 0) for (j = prev + 1; j < i; j++)
        out[j] = out[prev] + (out[i] - out[prev]) * (j - prev) / (i - prev);
      prev = i;
    }
    for (i = prev + 1; prev >= 0 && i <= end; i++) out[i] = out[prev];
    return out;
  }

  /* ----- Подготовка данных ---------------------------------- */
  function prepare(D) {
    var S = D.series, M = D.months, K = CFG.KEY;
    var end = lastIdx(S[K.price], M.length - 1);      /* последний месяц с ценами на квартиры */
    var start = 0;                                     /* первая публикация медианной ЗП по Минску */
    while (start < M.length && num(S[K.median][start]) == null) start++;
    var rate = fill(S[K.rate], end).map(function (v, i) {
      return v != null ? v : CFG.RATE_STUB[Number(M[i].slice(0, 4))] || null;
    });
    var refi = fill(S[K.refi], end);
    var rentUsd = fill(S[K.rent], end);
    var avg = fill(S[K.avg], end);

    /* Медиана: линейно между публикациями, дальше — средняя ЗП × коэффициент. */
    var med = fill(S[K.median], end);
    var L = lastIdx(S[K.median], end), ratios = [];
    for (var i = L; i >= 0 && i > L - CFG.BACKTEST_MONTHS; i--) {
      if (num(S[K.median][i]) != null && avg[i]) ratios.push(S[K.median][i] / avg[i]);
    }
    var k = ratios.reduce(function (a, b) { return a + b; }, 0) / (ratios.length || 1);
    for (var t = L + 1; t <= end; t++) med[t] = k * avg[t];

    var priceUsd = Number(S[K.price][end]) * CFG.AREA;
    return {
      months: M, start: start, end: end, rate: rate, refi: refi, med: med,
      rentByn: rentUsd.map(function (v, i) { return v == null || !rate[i] ? 0 : v * rate[i]; }),
      k: k, kN: ratios.length, lastMedian: M[L],
      priceUsd: priceUsd, priceByn: priceUsd * rate[end]
    };
  }

  /* ----- Расчёт --------------------------------------------- */
  function calc(P, s) {
    var people = s.family ? 2 : 1, t, sav = [];
    function room(i) {    /* доход минус расходы, без аренды */
      var min = CFG.LIVING[Number(P.months[i].slice(0, 4))] || CFG.LIVING[2026];
      return P.med[i] * CFG.TAX * people - 2 * people * min;
    }
    for (t = P.start; t <= P.end; t++)
      sav[t] = Math.max(0, room(t) - (s.rent ? P.rentByn[t] : 0));

    /* Платёж по кредиту = всё, что остаётся в последнем месяце + освободившаяся аренда. */
    var cap = Math.max(0, room(P.end));
    var rm = s.rate / 1200, N = s.years * 12;
    var f = s.loan === "annuity" ? (rm ? rm / (1 - Math.pow(1 + rm, -N)) : 1 / N) : 1 / N + rm;
    var down = Math.max(CFG.MIN_DOWN * P.priceByn, P.priceByn - cap / f);
    var loan = P.priceByn - down;

    function path(m) {
      var b = 0, usd = 0, out = [];
      for (var i = m; i <= P.end; i++) {
        if (s.hold === "usd") { usd += sav[i] / P.rate[i]; b = usd * P.rate[i]; }
        else b = b * (1 + (s.hold === "dep" ? (P.refi[i] + s.spread) / 1200 : 0)) + sav[i];
        out.push(b);
      }
      return out;
    }

    var m = P.end, p = null, found = down <= 0;
    if (!found) {
      for (m = P.end; m >= P.start; m--) {
        p = path(m);
        if (p[p.length - 1] >= down) { found = true; break; }
      }
      if (!found) { m = P.start; p = path(m); }
    } else p = path(P.end);

    var months = P.end - m + 1;
    var total = p[p.length - 1], deposited = 0;
    for (t = m; t <= P.end; t++) deposited += sav[t];

    var pay0 = loan * f;
    var paid = s.loan === "annuity" ? pay0 * N : loan + loan * rm * (N + 1) / 2;
    return { atMin: down <= CFG.MIN_DOWN * P.priceByn + 0.5, sav: sav[P.end], cap: cap, loan: loan, down: down, path: p, startMonth: P.months[m],
             months: months, found: found, total: total, extra: total - deposited,
             pay: pay0, interest: paid - loan, paid: paid };
  }

  /* ----- Отображение ---------------------------------------- */
  window.FirstPayment = { prepare: prepare, calc: calc, CFG: CFG };

  var root = document.getElementById("fpRoot");
  if (!root) return;

  function plural(n, a, b, c) {
    var x = n % 100, y = n % 10;
    return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c;
  }

  function span(mo) {
    var y = Math.floor(mo / 12), r = mo % 12, out = [];
    if (y) out.push(y + " " + plural(y, "год", "года", "лет"));
    if (r || !y) out.push(r + " мес.");
    return out.join(" ");
  }

  function seg(id, items) {
    return '<div class="segmented segmented-sm" id="' + id + '" role="group">' + items.map(function (it) {
      return '<button type="button" class="segmented-btn" data-v="' + it[0] + '">' + it[1] + "</button>";
    }).join("") + "</div>";
  }

  var ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"></path></svg>';

  /* Ссылка со всеми введёнными настройками (g=fp). */
  function shareUrl() {
    var u = new URL(window.location.href), q = new URLSearchParams();
    q.set("g", "fp"); q.set("h", st.hold); q.set("s", st.spread);
    q.set("r", st.rent ? 1 : 0); q.set("w", st.family ? 1 : 0);
    q.set("l", st.loan); q.set("p", st.rate); q.set("y", st.years);
    u.search = q.toString(); u.hash = "";
    return u.toString();
  }

  function restoreFromUrl() {
    var q = new URLSearchParams(window.location.search);
    if (q.get("g") !== "fp") return false;
    if (["pillow", "dep", "usd"].indexOf(q.get("h")) >= 0) st.hold = q.get("h");
    var sp = Number(q.get("s")); if (sp >= 0 && sp <= 4) st.spread = Math.round(sp);
    st.rent = q.get("r") === "1"; st.family = q.get("w") === "1";
    if (["annuity", "diff"].indexOf(q.get("l")) >= 0) st.loan = q.get("l");
    var rt = parseFloat(q.get("p")), yr = parseFloat(q.get("y"));
    if (isFinite(rt) && rt >= 0 && rt <= 100) st.rate = rt;
    if (isFinite(yr) && yr >= 1 && yr <= 40) st.years = yr;
    return true;
  }

  function copyLink(button) {
    var url = shareUrl();
    var done = function () {
      button.innerHTML = ICON_OK;
      clearTimeout(button._t);
      button._t = setTimeout(function () { button.innerHTML = ICON_COPY; }, 3000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () {});
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = url; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    try { if (document.execCommand("copy")) done(); } catch (e) {}
    ta.remove();
  }

  function buildShell() {
    root.innerHTML =
      '<div class="chart-head"><h2 class="chart-title">Первый взнос на хрущёвку ' + CFG.AREA + ' м²</h2>' +
        '<button type="button" class="deep-link-button" id="fpShare" aria-label="Скопировать ссылку с текущими настройками" title="Скопировать ссылку">' + ICON_COPY + "</button></div>" +
      '<div class="fp-ctrl">' +
        '<div class="fp-row"><span>Копил</span>' + seg("fpHold", [["pillow", "Под подушкой"], ["dep", "На вкладе"], ["usd", "В долларах"]]) + "</div>" +
        '<div class="fp-row" id="fpSpreadRow"><span>Ставка вклада</span>' + seg("fpSpread", [[0, "Реф."], [1, "+1%"], [2, "+2%"], [3, "+3%"], [4, "+4%"]]) + "</div>" +
        '<div class="fp-row"><span>Жильё</span>' + seg("fpRent", [["0", "Своё"], ["1", "Аренда"]]) + "</div>" +
        '<div class="fp-row"><span>Кто копит</span>' + seg("fpWho", [["0", "Один"], ["1", "Семья из двух"]]) + "</div>" +
        '<div class="fp-row"><span>Кредит</span>' + seg("fpLoan", [["annuity", "Аннуитет"], ["diff", "Дифференц."]]) +
          '<label class="fp-in">ставка <input type="number" id="fpRate" min="0" max="100" step="0.1" value="14.3">%</label>' +
          '<label class="fp-in">срок <input type="number" id="fpYears" min="1" max="40" step="1" value="25">лет</label></div>' +
      "</div>" +
      '<div class="fp-out" id="fpOut"></div>' +
      '<p class="hint" id="fpNote"></p>';

    root.querySelector("#fpShare").addEventListener("click", function (e) { copyLink(e.currentTarget); });
    root.querySelector("#fpRate").value = st.rate;
    root.querySelector("#fpYears").value = st.years;

    function bind(id, fn) {
      root.querySelectorAll("#" + id + " .segmented-btn").forEach(function (b) {
        b.addEventListener("click", function () { fn(b.dataset.v); update(); });
      });
    }
    bind("fpHold", function (v) { st.hold = v; });
    bind("fpSpread", function (v) { st.spread = Number(v); });
    bind("fpRent", function (v) { st.rent = v === "1"; });
    bind("fpWho", function (v) { st.family = v === "1"; });
    bind("fpLoan", function (v) { st.loan = v; });
    ["fpRate", "fpYears"].forEach(function (id) {
      root.querySelector("#" + id).addEventListener("input", function (e) {
        var v = parseFloat(String(e.target.value).replace(",", "."));
        if (!isFinite(v) || v < 0) return;
        if (id === "fpRate") st.rate = v; else st.years = Math.max(1, v);
        update();
      });
    });
  }

  function mark(id, val) {
    root.querySelectorAll("#" + id + " .segmented-btn").forEach(function (b) {
      b.classList.toggle("is-active", String(b.dataset.v) === String(val));
    });
  }

  function card(label, value, sub, cls) {
    return '<div class="fp-card"><div class="fp-label">' + label + '</div><div class="fp-val ' + (cls || "") +
      '">' + value + " <small>BYN</small></div><div class=\"fp-sub\">" + sub + "</div></div>";
  }

  function update() {
    var r = calc(P, st);
    mark("fpHold", st.hold); mark("fpSpread", st.spread); mark("fpRent", st.rent ? "1" : "0");
    mark("fpWho", st.family ? "1" : "0"); mark("fpLoan", st.loan);
    root.querySelector("#fpSpreadRow").style.display = st.hold === "dep" ? "" : "none";

    var big, sub;
    if (!r.found) {
      big = "Не хватило";
      sub = "За последние " + span(r.months) + " (с " + r.startMonth + ") человек накопил меньше первоначального взноса — всего " +
        fmt(r.total / P.priceByn * 100, 1) + "% от стоимости квартиры";
    } else { big = span(r.months); sub = r.months + " мес., копить можно было начать с " + r.startMonth; }

    var bars = r.path.map(function (v, i) {
      var h = Math.min(100, v / (r.down || 1) * 100);
      return '<i class="' + (i === r.path.length - 1 ? "is-last" : "") + '" style="height:' + h.toFixed(1) +
        '%" title="' + fmt(v) + ' BYN"></i>';
    }).join("");

    var extraLabel = st.hold === "dep" ? "Проценты по вкладу" : st.hold === "usd" ? "Курсовая разница" : "Проценты";
    root.querySelector("#fpOut").innerHTML =
      '<div class="fp-hero"><div class="fp-big">' + big + '</div><div class="fp-sub">' + sub + "</div></div>" +
      '<div class="fp-cards">' +
        card("Цена квартиры", fmt(P.priceByn), "$" + fmt(P.priceUsd) + " · " + fmt(P.rate[P.end], 3) + " BYN/$") +
        card("Первый взнос", fmt(r.down), fmt(r.down / P.priceByn * 100) + "% цены" + (r.atMin ? " (минимум)" : ""), "is-blue") +
        card("Откладывать в месяц", fmt(r.sav), st.rent ? "после аренды" : "доход минус расходы") +
        card(st.loan === "diff" ? "Первый платёж" : "Платёж по кредиту", fmt(r.pay), "до " + fmt(r.cap) + " в месяц доступно", "is-amber") +
      "</div>" +
      (r.path.length ? '<div class="fp-chart"><div class="fp-bars">' + bars + '</div><div class="fp-axis"><span>' +
        r.startMonth + "</span><span>накоплено " + fmt(r.total) + " из " + fmt(r.down) + " BYN</span></div></div>" : "") +
      '<div class="fp-cards fp-cards-3">' +
        card("Тело кредита", fmt(r.loan), "цена минус взнос") +
        card("Проценты банку", fmt(r.interest), "ставка " + fmt(st.rate, 1) + "% на " + st.years + " лет", "is-red") +
        card(extraLabel, fmt(r.extra), "за время накопления", "is-green") +
      "</div>";

    root.querySelector("#fpNote").textContent =
      "Расчёт на " + P.months[P.end] + " (последний месяц с ценами на квартиры). Доход — медианная ЗП по Минску после вычета налогов, " +
      "между майскими и ноябрьскими публикациями линейно, после последней (" + P.lastMedian + ") — средняя ЗП × " + fmt(P.k, 3) +
      " (средний коэффициент «медиана / средняя» за 3 года, " + P.kN + " точек). Расходы — 2 прожиточных минимума на человека " +
      "(временные значения по годам). Цена — средняя цена м² однушек Realt × " + CFG.AREA + " м². Взнос подобран так, чтобы платёж по кредиту " +
      "не превышал того, что человек откладывал в последнем месяце (плюс освободившаяся аренда), но не меньше " + CFG.MIN_DOWN * 100 + "% цены. " +
      "История — с первой публикации медианной ЗП по Минску (" + P.months[P.start] + "). Курс USD до 2016 года — приблизительный. Вклад без налога, ставка = ставка " +
      "рефинансирования месяца + надбавка, ежемесячная капитализация. Без учёта инфляции и роста цен на жильё.";
  }

  fetch("./data.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (D) {
      var fromLink = restoreFromUrl();
      P = prepare(D); buildShell(); update();
      if (fromLink) requestAnimationFrame(function () { root.scrollIntoView({ block: "start", behavior: "auto" }); });
    })
    .catch(function (e) { console.warn("Блок «Первый взнос»:", e); root.textContent = "Нет данных"; });

})();
