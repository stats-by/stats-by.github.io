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
    AREA: { 1: 33, 2: 50, 3: 65 },          /* м² по умолчанию для 1–3 комнат */
    RENT_FROM: 2017, RENT_TO: 2025,    /* период сравнения Realt и t-s.by */
    RENT_DISCOUNT: 0.2,                /* «аренда ниже рынка» */
    TAX: (1 - 0.01) * (1 - 0.13),      /* всегда «после вычета»: ФСЗН 1% + подоходный 13% */
    MIN_DOWN: 0.2,                     /* минимальный первоначальный взнос — 20% цены */
    BACKTEST_MONTHS: 36,               /* окно для коэффициента «медиана / средняя» */
    KEY: {
      median: "медианная_минск",
      avg: "средняя_средняя_минск",
      rate: "курс_usd_курс_usd_byn",
      prices: ["wikidom_м2_стоимость_м2_однушек", "wikidom_м2_стоимость_м2_двушек",
               "wikidom_м2_стоимость_м2_трешек"],   /* цена покупки м² — Wikidom */
      rentTs: "аренда_стоимость_аренды_t_s_by",      /* основной ряд аренды (однушка) */
      rentRealt: "аренда_стоимость_аренды_realt",    /* только там, где нет t-s.by */
      refi: "ставка_реф_ставка_рефинансирования",
      bpm: "бпм_бюджет_прожиточного_минимума_бпм_для_трудоспособного_населения"   /* БПМ, BYN/мес */
    }
  };

  var st = { hold: "usd", spread: 2, income: "med", bpm: 2, rent: false, cheap: false, family: false,
             rooms: 1, area: CFG.AREA[1], loan: "annuity", rate: 14.3, years: 25 };
  var P = null;

  /* ----- Утилиты ------------------------------------------- */
  function num(v) { return v != null && isFinite(Number(v)) ? Number(v) : null; }

  function fmt(n, d) {
    return Number(n).toLocaleString("ru-RU",
      { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  var MONTH_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь",
                   "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  var MONTH_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
                   "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  /* «2013-11» -> «ноябрь 2013»; gen = true -> «ноября 2013» (для «с …», «до …»). */
  function fm(ym, gen) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym));
    if (!m) return String(ym);
    var i = Number(m[2]) - 1;
    if (i < 0 || i > 11) return String(ym);
    return (gen ? MONTH_GEN : MONTH_NOM)[i] + " " + m[1];
  }

  function lastIdx(arr, upTo) {
    for (var i = Math.min(upTo, arr.length - 1); i >= 0; i--) if (num(arr[i]) != null) return i;
    return -1;
  }

  function firstIdx(arr) {
    for (var i = 0; i < arr.length; i++) if (num(arr[i]) != null) return i;
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
    /* Конец периода накоплений — последний месяц с данными БПМ.
       По остальным показателям берём последнее известное значение (fill тянет его вперёд). */
    var end = lastIdx(S[K.bpm], M.length - 1);
    var rate = fill(S[K.rate], end);
    var refi = fill(S[K.refi], end);
    var bpm = fill(S[K.bpm], end);
    /* Аренда однушки: t-s.by; до его первой точки — Realt, уменьшенный на средний разрыв 2017–2025. */
    var ts = S[K.rentTs], rl = S[K.rentRealt], ratios2 = [], firstTs = 0;
    M.forEach(function (mm, j) {
      var y = Number(mm.slice(0, 4));
      if (y >= CFG.RENT_FROM && y <= CFG.RENT_TO && num(ts[j]) != null && num(rl[j]) != null) ratios2.push(rl[j] / ts[j]);
    });
    var rentK = ratios2.reduce(function (a, b) { return a + b; }, 0) / (ratios2.length || 1) || 1;
    while (firstTs < M.length && num(ts[firstTs]) == null) firstTs++;
    var tsF = fill(ts, end), rlF = fill(rl, end);
    var rentUsd = tsF.map(function (v, j) { return j >= firstTs ? v : rlF[j] == null ? null : rlF[j] / rentK; });
    var avg = fill(S[K.avg], end);

    /* Медиана: линейно между публикациями, дальше — средняя ЗП × коэффициент. */
    var med = fill(S[K.median], end);
    var L = lastIdx(S[K.median], end), ratios = [];
    for (var i = L; i >= 0 && i > L - CFG.BACKTEST_MONTHS; i--) {
      if (num(S[K.median][i]) != null && avg[i]) ratios.push(S[K.median][i] / avg[i]);
    }
    var k = ratios.reduce(function (a, b) { return a + b; }, 0) / (ratios.length || 1);
    for (var t = L + 1; t <= end; t++) med[t] = k * avg[t];

    var ppm = K.prices.map(function (key) {           /* $ за м² по числу комнат, последний месяц */
      var i = lastIdx(S[key], end);
      return i < 0 ? null : Number(S[key][i]);
    });
    var priceLast = Math.max.apply(null, K.prices.map(function (key) { return lastIdx(S[key], end); }));
    var last = {
      bpm: M[end],
      rate: M[lastIdx(S[K.rate], end)],
      price: M[priceLast],
      rent: M[lastIdx(ts, end)],
      avg: M[lastIdx(S[K.avg], end)]
    };

    /* Первый месяц с данными по каждому ряду: от них зависит, с какого месяца можно считать историю. */
    function first(arr) { var i = firstIdx(arr); return i < 0 ? end : i; }
    var firstOf = {
      med: first(med), avg: first(avg), bpm: first(bpm),
      rate: first(rate), refi: first(refi), rent: first(rentUsd)
    };

    return {
      last: last,
      months: M, first: firstOf, end: end, rate: rate, refi: refi, med: med, bpm: bpm,
      rentByn: rentUsd.map(function (v, i) { return v == null || !rate[i] ? 0 : v * rate[i]; }),
      avg: avg, rentK: rentK, rentN: ratios2.length, firstTs: M[firstTs],
      k: k, kN: ratios.length, lastMedian: M[L],
      ppm: ppm, rentUsdEnd: rentUsd[end]
    };
  }

  /* Начало истории: самый поздний «первый месяц» среди рядов, которые нужны при текущих настройках.
     Без аренды и при средней ЗП — начало данных средней ЗП / БПМ; с медианой — первая публикация
     медианы; с арендой — ещё и начало данных по аренде. */
  function startFor(P, s) {
    var c = [[s.income === "avg" ? P.first.avg : P.first.med, s.income === "avg" ? "avg" : "med"],
             [P.first.bpm, "bpm"]];
    if (s.hold === "usd" || s.rent) c.push([P.first.rate, "rate"]);
    if (s.hold === "dep") c.push([P.first.refi, "refi"]);
    if (s.rent) c.push([P.first.rent, "rent"]);
    var best = c[0];
    c.forEach(function (x) { if (x[0] > best[0]) best = x; });
    return { idx: Math.min(best[0], P.end), why: best[1] };
  }

  /* ----- Расчёт --------------------------------------------- */
  function calc(P, s) {
    var people = s.family ? 2 : 1, t, sav = [];
    var from = startFor(P, s), start = from.idx;
    function room(i) {    /* доход минус расходы, без аренды */
      var min = minAt(i);
      return inc(i) - s.bpm * people * min;
    }
    function inc(i) { return (s.income === "avg" ? P.avg[i] : P.med[i]) * CFG.TAX * people; }
    function minAt(i) { return P.bpm[i]; }
    function rentAt(i) { return s.rent ? P.rentByn[i] * (s.cheap ? 1 - CFG.RENT_DISCOUNT : 1) : 0; }
    for (t = start; t <= P.end; t++)
      sav[t] = Math.max(0, room(t) - rentAt(t));

    /* Платёж по кредиту = всё, что остаётся в последнем месяце + освободившаяся аренда. */
    var cap = Math.max(0, room(P.end));
    var rm = s.rate / 1200, N = s.years * 12;
    var f = s.loan === "annuity" ? (rm ? rm / (1 - Math.pow(1 + rm, -N)) : 1 / N) : 1 / N + rm;
    var priceUsd = P.ppm[s.rooms - 1] * s.area, fx = P.rate[P.end], priceByn = priceUsd * fx;
    var down = Math.max(CFG.MIN_DOWN * priceByn, priceByn - cap / f);
    var loan = priceByn - down;

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
      for (m = P.end; m >= start; m--) {
        p = path(m);
        if (p[p.length - 1] >= down) { found = true; break; }
      }
      if (!found) { m = start; p = path(m); }
    } else p = path(P.end);

    var months = P.end - m + 1;
    var total = p[p.length - 1], deposited = 0;
    for (t = m; t <= P.end; t++) deposited += sav[t];

    var pay0 = loan * f;
    var paid = s.loan === "annuity" ? pay0 * N : loan + loan * rm * (N + 1) / 2;
    return { f: f, payNow: Math.max(0, priceByn - total) * f, inc: inc(P.end), exp: s.bpm * people * minAt(P.end), rentEnd: rentAt(P.end), priceUsd: priceUsd, priceByn: priceByn, fx: fx, atMin: down <= CFG.MIN_DOWN * priceByn + 0.5, sav: sav[P.end], cap: cap, loan: loan, down: down, path: p, startMonth: P.months[m],
             histIdx: start, histWhy: from.why,
             months: months, found: found, total: total, extra: total - deposited,
             pay: pay0, interest: paid - loan, paid: paid };
  }

  /* ----- Отображение ---------------------------------------- */
  window.FirstPayment = { prepare: prepare, calc: calc, CFG: CFG };

  var root = document.getElementById("fpRoot");
  if (!root) return;

  var WHY = {
    med: "первая публикация медианной ЗП по Минску",
    avg: "начало данных по средней ЗП по Минску",
    bpm: "начало данных БПМ",
    rate: "начало данных по курсу USD",
    refi: "начало данных по ставке рефинансирования",
    rent: "начало данных по аренде"
  };

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
      return '<button type="button" class="segmented-btn" data-v="' + it[0] + '"><span class="fp-b1">' + it[1] + "</span>" +
        (it[2] != null ? '<span class="fp-b2">' + it[2] + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }

  var ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"></path></svg>';

  /* Ссылка со всеми введёнными настройками (g=fp). */
  function shareUrl() {
    return makeShareUrl([
      ["g", "fp"], ["hold", st.hold], ["spread", st.spread],
      ["rent", st.rent ? 1 : 0], ["cheap", st.cheap ? 1 : 0], ["family", st.family ? 1 : 0],
      ["rooms", st.rooms], ["area", st.area], ["income", st.income], ["bpm", st.bpm],
      ["loan", st.loan], ["rate", st.rate], ["term", st.years]
    ]);
  }

  /* Новое имя параметра; если его нет — старое короткое (старые ссылки). */
  function pick(q, name, old) {
    var v = q.get(name);
    return v != null ? v : q.get(old);
  }

  function restoreFromUrl() {
    var q = new URLSearchParams(window.location.search);
    if (q.get("g") !== "fp") return false;
    var hold = pick(q, "hold", "h");
    if (["pillow", "dep", "usd"].indexOf(hold) >= 0) st.hold = hold;
    var spv = pick(q, "spread", "s"), sp = Number(spv);
    if (spv != null && sp >= 0 && sp <= 4) st.spread = Math.round(sp);
    st.rent = pick(q, "rent", "r") === "1";
    st.cheap = pick(q, "cheap", "d") === "1";
    st.family = pick(q, "family", "w") === "1";
    var loan = pick(q, "loan", "l");
    if (["annuity", "diff"].indexOf(loan) >= 0) st.loan = loan;
    var rm = Math.round(Number(pick(q, "rooms", "k"))), ar = parseFloat(pick(q, "area", "a"));
    if (rm >= 1 && rm <= 3) { st.rooms = rm; st.area = CFG.AREA[rm]; }
    if (isFinite(ar) && ar >= 10 && ar <= 300) st.area = ar;
    var inc = pick(q, "income", "i");
    if (["med", "avg"].indexOf(inc) >= 0) st.income = inc;
    if ([1.5, 2, 2.5, 3].indexOf(Number(pick(q, "bpm", "b"))) >= 0) st.bpm = Number(pick(q, "bpm", "b"));
    /* Те же правила, что у живых полей: ставка — любое число ≥ 0, срок — любое число ≥ 1. */
    var rt = parseFloat(pick(q, "rate", "p")), yr = parseFloat(pick(q, "term", "y"));
    if (isFinite(rt) && rt >= 0) st.rate = rt;
    if (isFinite(yr) && yr >= 1) st.years = yr;
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
      '<div class="chart-head"><h2 class="chart-title" id="fpTitle">Первый взнос</h2>' +
        '<button type="button" class="deep-link-button" id="fpShare" aria-label="Скопировать ссылку с текущими настройками" title="Скопировать ссылку">' + ICON_COPY + "</button></div>" +
      '<div class="fp-ctrl">' +
        '<div class="fp-row"><span>Квартира</span>' + seg("fpRooms", [["1", "1-к", ""], ["2", "2-к", ""], ["3", "3-к", ""]]) +
          '<label class="fp-in">площадь <input type="number" id="fpArea" min="10" max="300" step="1">м²</label></div>' +
        '<div class="fp-row"><span>Доход</span>' + seg("fpIncome", [["med", "Медианная ЗП", ""], ["avg", "Средняя ЗП", ""]]) + "</div>" +
        '<div class="fp-row"><span>Расходы</span>' + seg("fpBpm", [["1.5", "1,5 БПМ", ""], ["2", "2 БПМ", ""], ["2.5", "2,5 БПМ", ""], ["3", "3 БПМ", ""]]) + "</div>" +
        '<div class="fp-row"><span>Кто копит</span>' + seg("fpWho", [["0", "Один"], ["1", "Семья из двух"]]) + "</div>" +
        '<div class="fp-row"><span>Копил</span>' + seg("fpHold", [["pillow", "Под подушкой"], ["usd", "В долларах"], ["dep", "На вкладе"]]) +
          seg("fpSpread", [[0, "СР"], [1, "+1%"], [2, "+2%"], [3, "+3%"], [4, "+4%"]]) + "</div>" +
        '<div class="fp-row"><span>Жильё</span>' + seg("fpRent", [["0", "Своё"], ["1", "Аренда"]]) +
          seg("fpCheap", [["0", "Рыночная", ""], ["1", "Ниже рынка −20%", ""]]) + "</div>" +
        '<div class="fp-row"><span>Кредит</span>' + seg("fpLoan", [["annuity", "Аннуитет", "равные платежи"], ["diff", "Диф.", "с уменьшением"]]) +
          '<div class="fp-ins">' +
          '<label class="fp-in">ставка <input type="number" id="fpRate" min="0" step="0.1" value="14.3">%</label>' +
          '<label class="fp-in">срок <input type="number" id="fpYears" min="1" step="1" value="25">лет</label></div></div>' +
      "</div>" +
      '<div class="fp-out" id="fpOut"></div>' +
      '<p class="hint" id="fpNote"></p>';

    root.querySelector("#fpShare").addEventListener("click", function (e) { copyLink(e.currentTarget); });
    root.querySelector("#fpRate").value = st.rate;
    root.querySelector("#fpYears").value = st.years;
    root.querySelector("#fpArea").value = st.area;

    function bind(id, fn) {
      root.querySelectorAll("#" + id + " .segmented-btn").forEach(function (b) {
        b.addEventListener("click", function () { fn(b.dataset.v); update(); });
      });
    }
    bind("fpHold", function (v) { st.hold = v; });
    bind("fpRooms", function (v) {
      st.rooms = Number(v); st.area = CFG.AREA[st.rooms];
      root.querySelector("#fpArea").value = st.area;
    });
    bind("fpIncome", function (v) { st.income = v; });
    bind("fpBpm", function (v) { st.bpm = Number(v); });
    bind("fpCheap", function (v) { st.cheap = v === "1"; });
    root.querySelector("#fpArea").addEventListener("input", function (e) {
      var v = parseFloat(String(e.target.value).replace(",", "."));
      if (isFinite(v) && v >= 10 && v <= 300) { st.area = v; update(); }
    });
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

  function card(label, value, sub, cls, unit, approx) {
    return '<div class="fp-card"><div class="fp-label">' + label + '</div><div class="fp-val ' + (cls || "") +
      '">' + value + " <small>" + (unit || "BYN") + "</small>" +
      (approx ? ' <span class="fp-approx">≈ ' + approx + " USD</span>" : "") + "</div><div class=\"fp-sub\">" + sub + "</div></div>";
  }

  function ln(label, v) {
    return '<div class="fp-ln"><span>' + label + "</span><b>" + fmt(v) + " BYN</b></div>";
  }

  function update() {
    var r = calc(P, st), usd = st.hold === "usd";
    var u = usd ? "USD" : "BYN", k = usd ? 1 / r.fx : 1;        /* в режиме «в долларах» цена, взнос и накопления — в $ */
    function m(v) { return fmt(v * k); }
    mark("fpHold", st.hold); mark("fpSpread", st.spread); mark("fpRent", st.rent ? "1" : "0");
    mark("fpCheap", st.cheap ? "1" : "0"); mark("fpWho", st.family ? "1" : "0"); mark("fpLoan", st.loan);
    mark("fpRooms", st.rooms); mark("fpIncome", st.income); mark("fpBpm", st.bpm);
    /* Подписи кнопок со значениями, которые реально идут в расчёт (последний месяц). */
    var people = st.family ? 2 : 1;
    function lab(id, v, text) {
      root.querySelectorAll("#" + id + " .segmented-btn").forEach(function (b) { if (b.dataset.v === String(v)) b.querySelector(".fp-b2").textContent = text; });
    }
    var minEnd = P.bpm[P.end];
    [1, 2, 3].forEach(function (n) { lab("fpRooms", n, fmt(P.ppm[n - 1]) + " USD/м²"); });
    lab("fpIncome", "med", fmt(P.med[P.end] * CFG.TAX * people) + " BYN");
    lab("fpIncome", "avg", fmt(P.avg[P.end] * CFG.TAX * people) + " BYN");
    [1.5, 2, 2.5, 3].forEach(function (n) {
      lab("fpBpm", n, fmt(n * people * minEnd) + " BYN");
    });
    lab("fpCheap", "0", fmt(P.rentUsdEnd) + " USD");
    lab("fpCheap", "1", fmt(P.rentUsdEnd * (1 - CFG.RENT_DISCOUNT)) + " USD");
    root.querySelector("#fpSpread").style.display = st.hold === "dep" ? "" : "none";
    root.querySelector("#fpCheap").style.display = st.rent ? "" : "none";
    root.querySelector("#fpTitle").textContent = "Первый взнос: " + st.rooms + "-комнатный бабушатник, " + fmt(st.area, st.area % 1 ? 1 : 0) + " м²";

    var big, sub, pct = r.total / r.priceByn * 100, minPct = CFG.MIN_DOWN * 100;
    var period = "За последние " + span(r.months) + " (с " + fm(r.startMonth, true) + ") человек ";
    if (!r.found && pct < minPct) {
      big = "Не хватило на взнос";
      sub = period + "накопил меньше минимального первоначального взноса в " + minPct + "% — всего " + fmt(pct, 1) + "% от стоимости квартиры";
    } else if (!r.found) {
      big = "Копить дальше";
      sub = period + "накопил " + fmt(pct, 1) + "% от стоимости квартиры (" + m(r.total) + " " + u + ") — минимальный взнос есть, " +
        "но кредит на остальное он не потянул бы: нужен взнос " + fmt(r.down / r.priceByn * 100, 1) + "% (" + m(r.down) + " " + u + ")";
    } else { big = span(r.months); sub = r.months + " мес., копить нужно было начать с " + fm(r.startMonth, true); }

    var bars = r.path.map(function (v, i) {
      var h = Math.min(100, v / (r.down || 1) * 100);
      return '<i class="' + (i === r.path.length - 1 ? "is-last" : "") + '" style="height:' + h.toFixed(1) +
        '%" title="' + m(v) + ' ' + u + '"></i>';
    }).join("");

    var extraLabel = st.hold === "dep" ? "Проценты по вкладу" : usd ? "Курсовая разница" : "Проценты";
    root.querySelector("#fpOut").innerHTML =
      '<div class="fp-hero"><div class="fp-big">' + big + '</div><div class="fp-sub">' + sub + "</div></div>" +
      '<div class="fp-cards">' +
        card("Цена квартиры", m(r.priceByn), (usd ? fmt(r.priceByn) + " BYN" : fmt(r.priceUsd) + " USD") + " · " + fmt(r.fx, 3) + " BYN/USD",
          "", u, usd ? "" : fmt(r.priceUsd)) +
        '<div class="fp-card"><div class="fp-label">Накопления в месяц</div><div class="fp-calc">' +
          ln("Доход", r.inc) + ln("− Расходы", r.exp) + (st.rent ? ln("− Аренда", r.rentEnd) : "") + "</div>" +
          '<div class="fp-val">= ' + fmt(r.sav) + " <small>BYN</small> " + '<span class="fp-approx">≈ ' + fmt(r.sav / r.fx) + " USD</span></div></div>" +
        card(st.family ? "Уже накопили" : "Уже накопил", m(r.total),
          "минимальный первоначальный взнос " + minPct + "%: " + m(CFG.MIN_DOWN * r.priceByn) + " " + u +
          "<br><br>необходимо накопить, чтобы потянуть платёж по кредиту: " + m(r.down) + " " + u,
          "is-blue", u, usd ? "" : fmt(r.total / r.fx)) +
        '<div class="fp-card"><div class="fp-label">Кредит</div>' +
          '<div class="fp-sec"><div class="fp-sub">Сколько может потянуть платёж (доход − расходы, без аренды)</div><div class="fp-val">' +
            fmt(r.cap) + " <small>BYN/мес</small></div></div>" +
          '<div class="fp-sec"><div class="fp-sub">Требуемый платёж по кредиту' + (st.loan === "diff" ? " (первый)" : "") +
            " с текущим уровнем накоплений (" + m(r.total) + " " + u + ')</div><div class="fp-val ' + (r.payNow > r.cap + 0.5 ? "is-red" : "is-green") + '">' +
            fmt(r.payNow) + " <small>BYN/мес</small></div></div></div>" +
      "</div>" +
      (r.path.length ? '<div class="fp-chart"><div class="fp-bars">' + bars + '</div><div class="fp-axis"><span>' +
        fm(r.startMonth) + "</span><span>накоплено " + m(r.total) + " из " + m(r.down) + " " + u + "</span></div></div>" : "") +
      '<div class="fp-cards fp-cards-3">' +
        card("Тело кредита", fmt(r.loan), "цена минус взнос") +
        card("Проценты банку", fmt(r.interest), "ставка " + fmt(st.rate, 1) + "% на " + st.years + " лет", "is-red") +
        card(extraLabel, m(r.extra), "за время накопления", "is-green", u) +
      "</div>";

    var roomWord = ["однокомнатных", "двухкомнатных", "трёхкомнатных"][st.rooms - 1];
    var incomeText = st.income === "avg"
      ? "средняя ЗП по Минску после вычета налогов"
      : "медианная ЗП по Минску после вычета налогов (между майскими и ноябрьскими публикациями линейно, после последней, " + fm(P.lastMedian) +
        ", — средняя ЗП × " + fmt(P.k, 3) + ": средний коэффициент «медиана / средняя» за 3 года, " + P.kN + " точек)";
    root.querySelector("#fpNote").textContent =
      "Расчёт на " + fm(P.months[P.end]) + " (последний месяц с данными БПМ). Остальные данные — за последний доступный месяц: курс USD — " + fm(P.last.rate) +
      ", цены м² — " + fm(P.last.price) + ", аренда — " + fm(P.last.rent) + ", средняя ЗП — " + fm(P.last.avg) + "; если за расчётный месяц данных нет, считаем, что они не изменились. Доход — " + incomeText + ". Расходы — " +
      fmt(st.bpm, st.bpm % 1 ? 1 : 0) + " БПМ на человека (бюджет прожиточного минимума на каждый месяц из данных сайта). Цена — средняя цена м² " + roomWord + " квартир Wikidom × площадь. " +
      "Аренда — всегда однокомнатная: данные t-s.by" + (st.cheap ? ", со скидкой " + CFG.RENT_DISCOUNT * 100 + "%" : "") + "; до " + fm(P.firstTs, true) +
      ", где их нет, — данные Realt, уменьшенные в " + fmt(P.rentK, 2) + " раза (средний разрыв Realt и t-s.by в " + CFG.RENT_FROM + "–" + CFG.RENT_TO + ", " +
      P.rentN + " месяцев). Взнос подобран так, чтобы платёж по кредиту " +
      "не превышал того, что человек откладывал в последнем месяце (плюс освободившаяся аренда), но не меньше " + minPct + "% цены. " +
      "История — с " + fm(P.months[r.histIdx], true) + " (" + WHY[r.histWhy] + "); при других настройках начало может сдвигаться. Вклад без налога, ставка = ставка " +
      "рефинансирования месяца (СР) + надбавка, ежемесячная капитализация. Без учёта инфляции и роста цен на жильё.";
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
