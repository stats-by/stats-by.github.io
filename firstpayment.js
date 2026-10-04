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
    /* Прожиточный минимум, BYN/мес (ЗАГЛУШКА, пока нет в data.json) */
    LIVING: { 2013: 105, 2014: 140, 2015: 172, 2016: 174, 2017: 197, 2018: 214, 2019: 231, 2020: 258,
              2021: 288, 2022: 375, 2023: 367, 2024: 437, 2025: 491, 2026: 530.37 },
    /* Курс USD/BYN до 2016 года в базе нет — ПРИБЛИЗИТЕЛЬНЫЕ средние за год (заглушка). */
    RATE_STUB: { 2013: 0.90, 2014: 1.00, 2015: 1.59 },
    KEY: {
      median: "медианная_минск",
      avg: "средняя_средняя_минск",
      rate: "курс_usd_курс_usd_byn",
      prices: ["realt_м2_стоимость_м2_однушек", "realt_м2_стоимость_м2_двушек",
               "realt_м2_стоимость_м2_трешек"],
      rentTs: "аренда_стоимость_аренды_t_s_by",      /* основной ряд аренды (однушка) */
      rentRealt: "аренда_стоимость_аренды_realt",    /* только там, где нет t-s.by */
      refi: "ставка_реф_ставка_рефинансирования"
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
    var end = lastIdx(S[K.prices[0]], M.length - 1);      /* последний месяц с ценами на квартиры */
    var start = 0;                                     /* первая публикация медианной ЗП по Минску */
    while (start < M.length && num(S[K.median][start]) == null) start++;
    var rate = fill(S[K.rate], end).map(function (v, i) {
      return v != null ? v : CFG.RATE_STUB[Number(M[i].slice(0, 4))] || null;
    });
    var refi = fill(S[K.refi], end);
    /* Аренда однушки: t-s.by; до его первой точки — Realt, уменьшенный на средний разрыв 2017–2025. */
    var ts = S[K.rentTs], rl = S[K.rentRealt], ratios2 = [], firstTs = 0, i2;
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
    return {
      months: M, start: start, end: end, rate: rate, refi: refi, med: med,
      rentByn: rentUsd.map(function (v, i) { return v == null || !rate[i] ? 0 : v * rate[i]; }),
      avg: avg, rentK: rentK, rentN: ratios2.length, firstTs: M[firstTs],
      k: k, kN: ratios.length, lastMedian: M[L],
      ppm: ppm
    };
  }

  /* ----- Расчёт --------------------------------------------- */
  function calc(P, s) {
    var people = s.family ? 2 : 1, t, sav = [];
    function room(i) {    /* доход минус расходы, без аренды */
      var min = minAt(i);
      return inc(i) - s.bpm * people * min;
    }
    function inc(i) { return (s.income === "avg" ? P.avg[i] : P.med[i]) * CFG.TAX * people; }
    function minAt(i) { return CFG.LIVING[Number(P.months[i].slice(0, 4))] || CFG.LIVING[2026]; }
    function rentAt(i) { return s.rent ? P.rentByn[i] * (s.cheap ? 1 - CFG.RENT_DISCOUNT : 1) : 0; }
    for (t = P.start; t <= P.end; t++)
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
    return { f: f, payNow: Math.max(0, priceByn - total) * f, inc: inc(P.end), exp: s.bpm * people * minAt(P.end), rentEnd: rentAt(P.end), priceUsd: priceUsd, priceByn: priceByn, fx: fx, atMin: down <= CFG.MIN_DOWN * priceByn + 0.5, sav: sav[P.end], cap: cap, loan: loan, down: down, path: p, startMonth: P.months[m],
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
    q.set("r", st.rent ? 1 : 0); q.set("d", st.cheap ? 1 : 0); q.set("w", st.family ? 1 : 0);
    q.set("k", st.rooms); q.set("a", st.area); q.set("i", st.income); q.set("b", st.bpm);
    q.set("l", st.loan); q.set("p", st.rate); q.set("y", st.years);
    u.search = q.toString(); u.hash = "";
    return u.toString();
  }

  function restoreFromUrl() {
    var q = new URLSearchParams(window.location.search);
    if (q.get("g") !== "fp") return false;
    if (["pillow", "dep", "usd"].indexOf(q.get("h")) >= 0) st.hold = q.get("h");
    var sp = Number(q.get("s")); if (sp >= 0 && sp <= 4) st.spread = Math.round(sp);
    st.rent = q.get("r") === "1"; st.cheap = q.get("d") === "1"; st.family = q.get("w") === "1";
    if (["annuity", "diff"].indexOf(q.get("l")) >= 0) st.loan = q.get("l");
    var rm = Math.round(Number(q.get("k"))), ar = parseFloat(q.get("a"));
    if (rm >= 1 && rm <= 3) { st.rooms = rm; st.area = CFG.AREA[rm]; }
    if (isFinite(ar) && ar >= 10 && ar <= 300) st.area = ar;
    if (["med", "avg"].indexOf(q.get("i")) >= 0) st.income = q.get("i");
    if ([1.5, 2, 2.5, 3].indexOf(Number(q.get("b"))) >= 0) st.bpm = Number(q.get("b"));
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
      '<div class="chart-head"><h2 class="chart-title" id="fpTitle">Первый взнос</h2>' +
        '<button type="button" class="deep-link-button" id="fpShare" aria-label="Скопировать ссылку с текущими настройками" title="Скопировать ссылку">' + ICON_COPY + "</button></div>" +
      '<div class="fp-ctrl">' +
        '<div class="fp-row"><span>Квартира</span>' + seg("fpRooms", [["1", "1 комн."], ["2", "2 комн."], ["3", "3 комн."]]) +
          '<label class="fp-in">площадь <input type="number" id="fpArea" min="10" max="300" step="1">м²</label></div>' +
        '<div class="fp-row"><span>Доход</span>' + seg("fpIncome", [["med", "Медианная ЗП"], ["avg", "Средняя ЗП"]]) + "</div>" +
        '<div class="fp-row"><span>Расходы</span>' + seg("fpBpm", [["1.5", "1,5 БПМ"], ["2", "2 БПМ"], ["2.5", "2,5 БПМ"], ["3", "3 БПМ"]]) + "</div>" +
        '<div class="fp-row"><span>Кто копит</span>' + seg("fpWho", [["0", "Один"], ["1", "Семья из двух"]]) + "</div>" +
        '<div class="fp-row"><span>Копил</span>' + seg("fpHold", [["pillow", "Под подушкой"], ["usd", "В долларах"], ["dep", "На вкладе"]]) +
          seg("fpSpread", [[0, "СР"], [1, "+1%"], [2, "+2%"], [3, "+3%"], [4, "+4%"]]) + "</div>" +
        '<div class="fp-row"><span>Жильё</span>' + seg("fpRent", [["0", "Своё"], ["1", "Аренда"]]) +
          seg("fpCheap", [["0", "Рыночная"], ["1", "Ниже рынка −20%"]]) + "</div>" +
        '<div class="fp-row"><span>Кредит</span>' + seg("fpLoan", [["annuity", "Аннуитет"], ["diff", "Дифференц."]]) +
          '<label class="fp-in">ставка <input type="number" id="fpRate" min="0" max="100" step="0.1" value="14.3">%</label>' +
          '<label class="fp-in">срок <input type="number" id="fpYears" min="1" max="40" step="1" value="25">лет</label></div>' +
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
    root.querySelector("#fpSpread").style.display = st.hold === "dep" ? "" : "none";
    root.querySelector("#fpCheap").style.display = st.rent ? "" : "none";
    root.querySelector("#fpTitle").textContent = "Первый взнос: " + st.rooms + "-комнатная квартира, " + fmt(st.area, st.area % 1 ? 1 : 0) + " м²";

    var big, sub, pct = r.total / r.priceByn * 100, minPct = CFG.MIN_DOWN * 100;
    var period = "За последние " + span(r.months) + " (с " + r.startMonth + ") человек ";
    if (!r.found && pct < minPct) {
      big = "Не хватило на взнос";
      sub = period + "накопил меньше минимального первоначального взноса в " + minPct + "% — всего " + fmt(pct, 1) + "% от стоимости квартиры";
    } else if (!r.found) {
      big = "Копить дальше";
      sub = period + "накопил " + fmt(pct, 1) + "% от стоимости квартиры (" + m(r.total) + " " + u + ") — минимальный взнос есть, " +
        "но кредит на остальное он не потянул бы: нужен взнос " + fmt(r.down / r.priceByn * 100, 1) + "% (" + m(r.down) + " " + u + ")";
    } else { big = span(r.months); sub = r.months + " мес., копить нужно было начать с " + r.startMonth; }

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
        card("Уже накопил", m(r.total),
          "минимальный первоначальный взнос " + minPct + "%: " + m(CFG.MIN_DOWN * r.priceByn) + " " + u +
          "<br>необходимо накопить, чтобы потянуть платёж по кредиту: " + m(r.down) + " " + u,
          "is-blue", u, usd ? "" : fmt(r.total / r.fx)) +
        '<div class="fp-card"><div class="fp-label">Кредит</div>' +
          '<div class="fp-sec"><div class="fp-sub">Сколько может потянуть платёж (доход − расходы, без аренды)</div><div class="fp-val">' +
            fmt(r.cap) + " <small>BYN/мес</small></div></div>" +
          '<div class="fp-sec"><div class="fp-sub">Требуемый платёж по кредиту' + (st.loan === "diff" ? " (первый)" : "") +
            " с текущим уровнем накоплений (" + m(r.total) + " " + u + ')</div><div class="fp-val ' + (r.payNow > r.cap + 0.5 ? "is-red" : "is-green") + '">' +
            fmt(r.payNow) + " <small>BYN/мес</small></div></div></div>" +
      "</div>" +
      (r.path.length ? '<div class="fp-chart"><div class="fp-bars">' + bars + '</div><div class="fp-axis"><span>' +
        r.startMonth + "</span><span>накоплено " + m(r.total) + " из " + m(r.down) + " " + u + "</span></div></div>" : "") +
      '<div class="fp-cards fp-cards-3">' +
        card("Тело кредита", fmt(r.loan), "цена минус взнос") +
        card("Проценты банку", fmt(r.interest), "ставка " + fmt(st.rate, 1) + "% на " + st.years + " лет", "is-red") +
        card(extraLabel, m(r.extra), "за время накопления", "is-green", u) +
      "</div>";

    var roomWord = ["однокомнатных", "двухкомнатных", "трёхкомнатных"][st.rooms - 1];
    var incomeText = st.income === "avg"
      ? "средняя ЗП по Минску после вычета налогов"
      : "медианная ЗП по Минску после вычета налогов (между майскими и ноябрьскими публикациями линейно, после последней, " + P.lastMedian +
        ", — средняя ЗП × " + fmt(P.k, 3) + ": средний коэффициент «медиана / средняя» за 3 года, " + P.kN + " точек)";
    root.querySelector("#fpNote").textContent =
      "Расчёт на " + P.months[P.end] + " (последний месяц с ценами на квартиры). Доход — " + incomeText + ". Расходы — " +
      fmt(st.bpm, st.bpm % 1 ? 1 : 0) + " БПМ на человека (БПМ — временные значения по годам). Цена — средняя цена м² " + roomWord + " квартир Realt × площадь. " +
      "Аренда — всегда однокомнатная: данные t-s.by" + (st.cheap ? ", со скидкой " + CFG.RENT_DISCOUNT * 100 + "%" : "") + "; до " + P.firstTs +
      ", где их нет, — данные Realt, уменьшенные в " + fmt(P.rentK, 2) + " раза (средний разрыв Realt и t-s.by в " + CFG.RENT_FROM + "–" + CFG.RENT_TO + ", " +
      P.rentN + " месяцев). Взнос подобран так, чтобы платёж по кредиту " +
      "не превышал того, что человек откладывал в последнем месяце (плюс освободившаяся аренда), но не меньше " + minPct + "% цены. " +
      "История — с первой публикации медианной ЗП по Минску (" + P.months[P.start] + "). Курс USD до 2016 года — приблизительный. Вклад без налога, ставка = ставка " +
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
