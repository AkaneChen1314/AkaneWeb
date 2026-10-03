(function () {
  "use strict";
  const E = window.BillionEngine,
    $ = (id) => document.getElementById(id),
    SAVE = "billion-to-zero-v2",
    PREF = "billion-to-zero-preferences-v2";
  const esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const ICONS = {
      sky: "💎",
      moon: "🚀",
      bank: "🏦",
      bio: "🧬",
      coin: "🪐",
      future: "⚡",
      nft: "🐒",
      bond: "🎀",
    },
    LEV = [1, 2, 5, 10, 25, 50, 100];
  let s = E.create(),
    prefs = {
      sound: false,
      effects: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      tutorialDone: false,
      horror: true,
      visionAssist: false,
      marketPaused: false,
    },
    loaded = false,
    unlocked = false,
    selected = "sky",
    filter = "stock",
    product = "spot",
    direction = "long",
    chartMode = "price",
    tab = "positions",
    modalType = "",
    loanType = "bank",
    busy = false,
    lesson = false,
    lessonStep = 0,
    formalBackup = null,
    storageOK = true,
    audio = null,
    feedbackTimer = null,
    glitchTimer = null,
    chartPeriod = "day",
    chartDay = null,
    chartHover = null,
    chartPoints = [],
    sectorKind = "",
    sector = "all",
    assetSearch = "",
    contractDraft = null,
    lastLiveEffect = 0,
    interacting = false,
    interactionSince = 0;
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF) || "{}") };
    const raw = E.migrate(E.unpack(JSON.parse(localStorage.getItem(SAVE) || "null")));
    if (E.validate(raw)) {
      s = raw;
      loaded = true;
      unlocked = prefs.tutorialDone === true;
    }
  } catch {
    storageOK = false;
  }
  function money(v, d = 2) {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(d) + " 億";
    if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + " 萬";
    return Math.round(v).toLocaleString("zh-TW") + " 元";
  }
  function price(v) {
    return v < 1
      ? v.toFixed(5)
      : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signed(v, d = 2) {
    return (v >= 0 ? "+" : "") + v.toFixed(d);
  }
  function color(v) {
    return v >= 0 ? "positive" : "negative";
  }
  function toast(text, error = false) {
    const el = document.createElement("div");
    el.className = "toast" + (error ? " error" : "");
    el.textContent = text;
    $("toast-container").append(el);
    setTimeout(() => el.remove(), 4000);
  }
  function save() {
    try {
      localStorage.setItem(PREF, JSON.stringify(prefs));
      if (unlocked && !lesson && !s.practice) localStorage.setItem(SAVE, JSON.stringify(E.pack(s)));
      storageOK = true;
    } catch {
      storageOK = false;
    }
    $("save-status").textContent = lesson
      ? "練習中 · 正式資金不扣錢"
      : storageOK
        ? "此瀏覽器自動保存"
        : "無法保存，關閉會遺失進度";
  }
  function beep(bad = false) {
    if (!prefs.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain(),
        t = audio.currentTime;
      o.connect(g);
      g.connect(audio.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(bad ? 180 : 550, t);
      o.frequency.exponentialRampToValueAtTime(bad ? 70 : 940, t + 0.16);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t);
      o.stop(t + 0.23);
    } catch {}
  }
  function stopEffects() {
    clearTimeout(feedbackTimer);
    clearTimeout(glitchTimer);
    $("feedback").classList.remove("show");
    $("feedback-confetti").innerHTML = "";
  }
  function feedback(delta, caption = "", special = "") {
    clearTimeout(feedbackTimer);
    const win = delta > 0;
    $("feedback").className = "feedback " + (win ? "win" : "lose");
    $("feedback-icon").textContent = win ? "🤑" : special === "organ" ? "💔" : "💸";
    $("feedback-title").textContent =
      special === "organ" ? "錢拿到了。身體呢？" : win ? "這次居然賺了！" : "不是吧，又沒了。";
    $("feedback-amount").textContent =
      special === "organ" ? "無法撤銷的代價" : (delta >= 0 ? "+" : "−") + money(Math.abs(delta));
    $("feedback-caption").textContent =
      caption || (win ? "你是不是又想加碼了？" : "你開始想著：下一次就能翻回來。");
    $("feedback-confetti").innerHTML =
      win && prefs.effects
        ? Array.from(
            { length: 38 },
            (_, i) =>
              `<i class="confetti" style="left:${(i * 43) % 100}%;background:${["#ffdc69", "#ff88b5", "#84b9ff", "#83f3c3"][i % 4]};animation-delay:${(i % 7) * 0.07}s;transform:rotate(${i * 17}deg)"></i>`,
          ).join("")
        : "";
    $("feedback").classList.add("show");
    beep(!win);
    feedbackTimer = setTimeout(
      () => $("feedback").classList.remove("show"),
      prefs.effects ? 1800 : 700,
    );
  }
  function rank() {
    const eq = E.equity(s);
    if (s.ended)
      return s.endType === "death"
        ? {
            name: "猝死結局",
            avatar: "🪦",
            line: "最後一個通知，沒有人按下確認。",
            chapter: "終章 · 最後的紅線",
            title: "錢還沒追回來。",
            detail: "你的人生，卻先被透支光了。",
          }
        : {
            name: "街頭乞丐",
            avatar: "🧎",
            line: "失去的是帳戶，不是人的價值。",
            chapter: "終章 · 歸零之後",
            title: "你終於離開牌桌。",
            detail: "從百億大戶，到一無所有。",
          };
    if (s.health < 25)
      return {
        name: "透支的人",
        avatar: "😵‍💫",
        line: "你一直看盤，卻沒看見自己。",
        chapter: "第四章 · 身體先撐不住",
        title: "健康也沒有了。",
        detail: "休息或繼續加碼，現在都在付代價。",
      };
    if (eq < 0)
      return {
        name: "負債負翁",
        avatar: "😰",
        line: "借條比你的睡眠還長。",
        chapter: "第四章 · 債務追上來",
        title: "連未來的錢都輸了。",
        detail: "利息繼續跑，健康卻沒有一起增加。",
      };
    if (eq < 1e9)
      return {
        name: "破產邊緣",
        avatar: "🫠",
        line: "「最後一把」已經說了很多次。",
        chapter: "第三章 · 最後的籌碼",
        title: "再拚一次，就能翻本？",
        detail: "你越來越不敢看剩下的錢。",
      };
    if (eq < 5e9 || s.day > 24)
      return {
        name: "落魄大戶",
        avatar: "😟",
        line: "睡不著、放不下，還想追回來。",
        chapter: "第二章 · 越輸越想贏",
        title: "本金少了，膽子反而大了。",
        detail: "每一次借錢，都是把下一天押進去。",
      };
    return {
      name: "百億大戶",
      avatar: "🧑‍💼",
      line: "睡得好，覺得自己很會投資。",
      chapter: "第一章 · 有錢真好",
      title: "再拚一次，應該就會贏吧？",
      detail: "你繼承了 100 億。市場裡的人，突然都變成你的朋友。",
    };
  }
  function render() {
    const eq = E.equity(s),
      r = rank();
    $("chapter").textContent = lesson ? "練習帳戶 · 不影響正式的 100 億" : r.chapter;
    $("hero-title").textContent = lesson ? "跟著手指，親手玩一輪。" : s.playerName + "，" + r.title;
    $("hero-line").textContent = lesson
      ? "這次的練習會先讓你賺到錢，學會買進、等一天，再賣掉。"
      : r.detail;
    $("day").textContent = "第 " + s.day + " 天";
    $("day-progress").style.width = ((s.day - 1) / 59) * 100 + "%";
    $("rank").textContent = r.name;
    $("equity").innerHTML = (eq / 1e8).toFixed(2) + " <small>億</small>";
    $("equity").className = eq < 0 ? "negative" : "";
    $("cash").textContent = money(s.cash);
    $("daily").textContent = (s.daily >= 0 ? "+" : "−") + money(Math.abs(s.daily));
    $("daily").className = s.daily === 0 ? "" : color(s.daily);
    $("daily-caption").textContent =
      s.day === 1
        ? "盤中損益會跳動，賣掉才回到口袋"
        : s.daily > 0
          ? "還沒賣掉的獲利，隨時可以不見。"
          : "生活費、借款息和股票損益都算進來。";
    $("debt").textContent = money(s.debt);
    $("debt").className = s.debt ? "negative" : "";
    $("interest-caption").textContent = s.debt
      ? "明天光利息就要 " + money(E.interest(s))
      : "目前沒有借款";
    $("avatar").textContent = r.avatar;
    $("character-rank").textContent = s.playerName + " · " + r.name;
    $("character-line").textContent = r.line;
    $("health-text").textContent = Math.ceil(s.health) + " / " + s.healthCap;
    $("health-bar").style.width = s.health + "%";
    $("health-bar").style.background =
      s.health < 30 ? "linear-gradient(90deg,#e24763,#ff8196)" : "";
    $("health-note").textContent =
      s.healthCap < 100
        ? "永久上限只剩 " + s.healthCap + "；休息救不回部件。"
        : s.health < 30
          ? "你已經快撐不住。再透支可能走到死亡結局。"
          : "健康歸零會觸發死亡結局";
    $("stress-text").textContent = Math.round(s.stress) + " / 100";
    $("stress-bar").style.width = s.stress + "%";
    $("body-parts").innerHTML = E.ORGANS.map(
      (o) =>
        `<button class="body-part ${!E.organAvailable(s, o) ? "lost" : ""}" data-body-part="${o.id}" title="${esc(o.note)}"><span>${o.icon}</span><div><b>${o.name}</b><small>${bodyStatus(o)}</small></div></button>`,
    ).join("");
    const kidneys = 2 - s.organs.filter((id) => id.startsWith("kidney")).length,
      eyes = 2 - s.organs.filter((id) => id.startsWith("cornea")).length;
    $("organ-summary").textContent =
      `腎 ${kidneys}/2 · 肺 ${2 - s.organs.filter((id) => id.startsWith("lung")).length}/2 · 角膜 ${eyes}/2`;
    $("body-caption").textContent =
      eyes < 2
        ? "失去角膜讓行情模糊；視野輔助可保留可玩性。"
        : kidneys < 2
          ? "左腎、右腎分別記錄，休息無法恢復部件。"
          : "兩顆腎，各自保留；所有部件狀態都會存檔。";
    renderAtmosphere();
    $("loan-count").textContent = s.loans.length + " 張";
    renderLoans();
    renderAssets();
    renderMarket();
    renderOrder();
    renderPortfolio();
    renderNews();
    document.body.classList.toggle("reduced-effects", !prefs.effects);
    document.body.classList.toggle("dead-world", s.ended && s.endType === "death");
    $("sound-button").textContent = "♪ 音效" + (prefs.sound ? "開" : "關");
    $("motion-button").textContent = "特效" + (prefs.effects ? "開" : "關");
    $("motion-button").setAttribute("aria-pressed", String(prefs.effects));
    $("player-name").textContent = s.playerName;
    $("phone-unread").textContent = s.social.length;
    $("reputation").textContent = Math.round(s.reputation) + " / 100";
    $("reputation-caption").textContent =
      s.reputation < 35
        ? "謠言影響工作：薪水只剩 85%。"
        : s.reputation < 75
          ? "虛構朋友圈開始出現抹黑訊息。"
          : "朋友還在，別讓借條替你說話。";
    const lock = s.ended || !!s.pending || !!s.job || !!s.gamble || busy || (!unlocked && !lesson);
    for (const id of [
      "next-button",
      "skip-button",
      "rest-button",
      "work-button",
      "loan-button",
      "repay-button",
      "organ-button",
      "temptation-leverage",
      "temptation-mystery",
      "temptation-casino",
    ])
      $(id).disabled = lock;
    const mobileLoan = $("tutorial-loan-shortcut");
    if (mobileLoan) mobileLoan.disabled = lock;
    $("close-all").disabled = lock || !s.positions.length;
    $("skip-button").disabled = lock || lesson;
    $("work-button").disabled =
      s.ended ||
      !!s.pending ||
      !!s.gamble ||
      busy ||
      (!unlocked && !lesson) ||
      s.lastWorkDay === s.day;
    $("work-button").textContent = s.job ? "▶ 繼續這班工作" : "🧹 打工補錢";
    $("session-state").textContent = lesson
      ? "練習模式 · 正式百億原封不動"
      : s.ended
        ? "你的人生結局：" + r.name
        : s.gamble
          ? "賭桌上的本金還沒收回"
          : s.job
            ? "打工任務進行中"
            : s.pending
              ? "先處理這個突發狀況"
              : `第 ${s.day} 天 · ${clock(s.minute)} · ${clockReason()}`;
    $("session-note").textContent =
      s.health < 30
        ? "你要看一下健康了。"
        : s.loans.length
          ? "借款會扣息，也有到期催收。"
          : "生活費每天扣，市場不會等你準備好。";
    save();
    if (lesson && !$("modal").open) positionGuide();
  }
  function renderLoans() {
    $("loans").innerHTML = s.loans.length
      ? s.loans
          .map(
            (l) =>
              /* HTML */ `<div class="loan-row">
                <div><b>${E.LOAN_TYPES[l.type].name}</b><span>${money(l.balance)}</span></div>
                <small class="${l.due <= s.day + 1 ? "danger" : ""}"
                  >第 ${l.due} 天到期 · 每日息
                  ${(E.loanRate(l) * 100).toFixed(0)}%${l.extensions ? " · 已延期 " + l.extensions + " 次" : ""}${l.stage ? " · 催收階段 " + l.stage : ""}</small
                >
              </div>`,
          )
          .join("")
      : '<p class="loan-empty">今天還沒欠任何人。<br>有時候，「不用還錢」就是最大的自由。</p>';
  }
  function assetIcon(a) {
    return a.emoji || ICONS[a.id] || "💎";
  }
  function renderAssets() {
    if (sectorKind !== filter) {
      sectorKind = filter;
      sector = "all";
      $("sector-select").innerHTML =
        '<option value="all">所有題材</option>' +
        [...new Set(E.ASSETS.filter((a) => a.kind === filter).map((a) => a.sector))]
          .map((x) => `<option value="${esc(x)}">${esc(x)}</option>`)
          .join("");
      $("sector-select").value = "all";
    }
    const assets = E.ASSETS.filter(
      (a) =>
        a.kind === filter &&
        (sector === "all" || a.sector === sector) &&
        (!assetSearch ||
          (a.name + a.code + a.sector).toLowerCase().includes(assetSearch.toLowerCase())),
    );
    $("asset-count").textContent = assets.length + " 種商品 · 全館 " + E.ASSETS.length + " 種";
    $("assets").innerHTML = assets.length
      ? assets
          .map(
            (a, i) =>
              `<button class="asset-card ${a.id === selected ? "active" : ""}" style="--card-accent:${["#ff91c6", "#9c97ff", "#67d9ef", "#87e6b5", "#ffcf7c", "#ff9a81"][i % 6]}" data-asset="${a.id}" aria-pressed="${a.id === selected}"><span class="asset-emoji">${assetIcon(a)}</span><b>${a.name}</b><small>${a.sector}</small><span class="asset-change ${color(s.markets[a.id].change)}">${signed(s.markets[a.id].change)}%</span></button>`,
          )
          .join("")
      : '<p class="asset-empty">沒有找到。試試別的名字或題材。</p>';
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  }
  function renderMarket() {
    const a = E.ASSETS.find((x) => x.id === selected),
      m = s.markets[selected];
    $("selected-category").textContent = a.sector + " · 今天一單位的虛構價格";
    $("selected-name").textContent = a.name;
    $("selected-price").textContent = price(m.price);
    $("selected-change").textContent = "今天 " + signed(m.change) + "%";
    $("selected-change").className = color(m.change);
    $("selected-short-name").textContent = a.name;
    $("asset-note").innerHTML = a.note;
    renderChart();
  }
  function clockReason() {
    return s.ended
      ? "故事結束，可回看"
      : lesson
        ? "教學練習，時鐘暫停"
        : s.gamble
          ? "賭桌暫停，完成本局才繼續"
          : s.job
            ? "打工暫停，完成或放棄才繼續"
            : prefs.marketPaused
              ? "手動暫停，按繼續行情"
              : document.hidden
                ? "離開頁面暫停"
                : s.pending || busy
                  ? "事件暫停，完成選擇才繼續"
                  : $("modal").open
                    ? "閱讀視窗暫停，關閉後繼續"
                    : "全天行情 · 每秒 5 分鐘";
  }
  function clock(minute) {
    return (
      String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0")
    );
  }
  function renderAtmosphere() {
    const assets = s.cash + E.positionTotal(s),
      due = s.loans.some((l) => l.due <= s.day + 1 && l.balance > s.cash),
      eyeLoss = s.organs.filter((id) => id.startsWith("cornea")).length;
    const collector =
      s.pending?.type === "debt" ? s.loans.find((l) => l.id === s.pending.loanId) : null;
    let dread =
      s.health < 18 ||
      (s.ended && s.endType === "death") ||
      (collector?.type === "shark" && collector.stage >= 3)
        ? 3
        : s.health < 35 || s.reputation < 35 || due || s.debt > assets
          ? 2
          : s.health < 60 || s.stress >= 65 || (s.debt > 0 && E.equity(s) < 2e9)
            ? 1
            : 0;
    if (!prefs.horror || lesson) dread = 0;
    for (let i = 1; i <= 3; i++) document.body.classList.toggle("dread-" + i, dread === i);
    document.body.classList.toggle("vision-one", eyeLoss === 1 && !prefs.visionAssist && !lesson);
    document.body.classList.toggle("vision-two", eyeLoss === 2 && !prefs.visionAssist && !lesson);
    $("dread-banner").hidden = !dread;
    $("dread-banner").textContent =
      dread === 3
        ? "▰ 生命警報：心跳很遠，螢幕卻還亮著。"
        : due
          ? "☎ 門外的催款聲：你現在的現金，還不了即將到期的借條。"
          : dread === 2
            ? "☎ 未接來電又增加了。你的身體和帳戶，都在透支。"
            : "◌ 夜越來越深。房間裡只剩報價的光。";
    $("vision-assist").hidden = !eyeLoss;
    $("vision-assist").textContent = prefs.visionAssist ? "關閉視野輔助" : "啟用視野輔助";
    $("vision-assist").setAttribute("aria-pressed", String(prefs.visionAssist));
  }
  function renderChart() {
    const wealth = chartMode === "wealth",
      all = wealth ? s.equityTape : s.markets[selected].series,
      day = chartDay === null ? s.day : Math.min(chartDay, s.day);
    chartPoints = all.filter(
      (p) =>
        chartPeriod === "all" ||
        (chartPeriod === "five" && p.day <= day && p.day >= Math.max(1, day - 4)) ||
        (chartPeriod === "day" && p.day === day),
    );
    const noData = !chartPoints.length;
    if (noData)
      chartPoints = [
        { day, minute: 0, price: wealth ? s.history[day - 1] || 0 : s.markets[selected].price },
      ];
    const values = chartPoints.map((p) => p.price),
      w = Math.max(240, $("chart").clientWidth || 500),
      h = 220,
      pad = 16,
      right = 68,
      pw = w - pad - right,
      ph = 152,
      hi = Math.max(...values),
      lo = Math.min(...values),
      range = Math.max(Math.abs(hi) * 0.002, 0.000001, hi - lo),
      max = hi + range * 0.2,
      min = lo - range * 0.2,
      Y = (v) => 20 + ((max - v) / (max - min)) * ph,
      X = (i) => pad + (i / Math.max(1, values.length - 1)) * pw;
    const points = values
        .map((v, i) => (i ? "L" : "M") + X(i).toFixed(2) + " " + Y(v).toFixed(2))
        .join(" "),
      stroke = wealth ? "#ffda69" : values.at(-1) >= values[0] ? "#68e9ac" : "#ff7890";
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${stroke}" stop-opacity=".22"/><stop offset="1" stop-color="${stroke}" stop-opacity="0"/></linearGradient></defs>`;
    for (let i = 0; i < 4; i++) {
      const val = max - ((max - min) * i) / 3,
        y = Y(val);
      out += `<path d="M${pad} ${y}H${w - right}" stroke="#33405a" stroke-dasharray="4 6"/><text x="${w - right + 6}" y="${y + 4}" font-size="12" font-family="monospace" fill="#a5b0cc">${wealth ? (val / 1e8).toFixed(1) + "億" : val >= 1e5 ? (val / 1e4).toFixed(1) + "萬" : val < 1 ? val.toFixed(4) : val.toFixed(0)}</text>`;
    }
    out += `<path d="${points}L${X(values.length - 1)} 180L${pad} 180Z" fill="url(#shade)"/><path d="${points}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${X(values.length - 1)}" cy="${Y(values.at(-1))}" r="4" fill="${stroke}"/>`;
    for (const i of values.length === 1 ? [0] : [0, 1, 2]) {
      const n = Math.round((i * (values.length - 1)) / 2),
        p = chartPoints[n];
      out += `<text x="${X(n)}" y="210" font-size="12" fill="#a5b0cc" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${chartPeriod === "day" ? clock(p.minute) : "第 " + p.day + " 天"}</text>`;
    }
    let tip = "";
    if (chartHover !== null) {
      const n = Math.max(
          0,
          Math.min(values.length - 1, Math.round(chartHover * (values.length - 1))),
        ),
        p = chartPoints[n];
      out += `<path d="M${X(n)} 14V180" stroke="#ffda69" stroke-dasharray="4 3"/><circle cx="${X(n)}" cy="${Y(p.price)}" r="5" fill="#ffda69"/>`;
      tip = /* HTML */ `<div class="chart-tooltip" role="status">
        第 ${p.day} 天 · ${clock(p.minute)}${p.kind ? " · " + esc(p.kind) : ""}<b
          >${wealth ? "身家 " + money(p.price) : price(p.price) + " 元"}</b
        >
      </div>`;
    }
    $("chart").innerHTML = out + "</svg>" + tip;
    $("chart").setAttribute(
      "aria-label",
      `${wealth ? "我的身家" : "商品價格"}，第 ${day} 天，${values.length} 筆紀錄。最新 ${wealth ? money(values.at(-1)) : price(values.at(-1))}。左右鍵查看時間。`,
    );
    $("chart-story").textContent =
      chartPeriod === "all"
        ? `第 1 至 ${s.day} 天，${all.length} 筆行情完整保留。`
        : chartDay !== null
          ? `正在回看第 ${day} 天；即時行情仍在背景繼續。`
          : "線往上：價格變貴。線往下：價格變便宜。";
    $("market-clock").textContent =
      `${s.ended ? "■" : prefs.marketPaused ? "Ⅱ" : "●"} 第 ${s.day} 天 ${clock(s.minute)} · ${clockReason()}`;
    $("market-pause").textContent = prefs.marketPaused ? "▶ 繼續行情" : "⏸ 暫停行情";
    $("chart-day").max = s.day;
    $("chart-day").value = day;
    $("chart-day-label").textContent = "第 " + day + " 天";
    $("chart-prev").disabled = day <= 1;
    $("chart-next").disabled = day >= s.day;
    $("chart-hint").textContent =
      s.archiveNotice ||
      "滑鼠移入、手指按住，或左右鍵查看。盤中會改變真正損益；背景頁面與劇情期間暫停。";
    document
      .querySelectorAll("[data-chart]")
      .forEach((b) => b.classList.toggle("active", b.dataset.chart === chartMode));
    document
      .querySelectorAll("[data-period]")
      .forEach((b) => b.classList.toggle("active", b.dataset.period === chartPeriod));
    if (noData) {
      $("chart").innerHTML =
        '<div class="chart-empty">這個日期尚無紀錄<br><small>新增商品從升級當天開始記錄，沒有補造行情。</small></div>';
      $("chart").setAttribute("aria-label", "此日期尚無歷史紀錄");
      chartPoints = [];
    }
  }
  function inspectChart(event) {
    if (lesson || !chartPoints.length) return;
    const r = $("chart").getBoundingClientRect(),
      w = Math.max(240, $("chart").clientWidth || 500),
      relative = ((event.clientX - r.left) / r.width) * w;
    chartHover = Math.max(0, Math.min(1, (relative - 16) / (w - 84)));
    renderChart();
  }
  function jobsModal() {
    if (lesson) {
      lessonIntro("work");
      return;
    }
    if (s.job) {
      jobScreen();
      return;
    }
    modal(
      "jobs",
      /* HTML */ `<div class="modal-kicker">打工街 · 今天靠雙手領錢</div>
        <h2>選一份工作，親手完成。</h2>
        <p>
          一天只能領一班薪水。任務沒有倒數，可慢慢做；未完成不發薪。打工期間行情暫停，結束後繼續。
        </p>
        <div class="choices">
          ${E.JOBS.map((j) => `<button data-job="${j.id}"><b>${j.icon} ${j.name} · ${money(j.pay)}</b><small>${j.description} 共 ${j.rounds} 筆，健康 −${j.damage + (s.organs.some((x) => x.startsWith("lung")) ? 2 : 0) + (s.organs.includes("stomach") ? 1 : 0)}，壓力 −8。每次選錯扣 5% 薪水，最多扣 40%。</small></button>`).join("")}
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">先不接班</button>
        </div>`,
    );
  }
  function jobScreen(message = "") {
    const j = s.job;
    if (!j) return;
    const def = E.JOBS.find((x) => x.id === j.id);
    modal(
      "work",
      /* HTML */ `<div class="modal-kicker">第 ${s.day} 天 · ${def.icon} ${def.name}</div>
        <h2>完成 ${j.done} / ${def.rounds} 筆</h2>
        <div class="job-progress"><i style="width:${(j.done / def.rounds) * 100}%"></i></div>
        <p>${def.description}${s.reputation < 35 ? " 名譽受到謠言影響，這班薪水只剩 85%。" : ""}</p>
        <div class="job-order">
          <span
            >${j.id === "cafe" ? "客人的完整訂單" : j.id === "warehouse" ? "請按相同名稱的出口" : "先算一下，不用急"}</span
          ><strong>${esc(j.task.prompt)}</strong
          >${j.id === "cafe" ? "<small>現在選：" + ["杯型", "飲品", "溫度"][j.task.step] + "</small>" : ""}
        </div>
        <div class="job-answers">
          ${j.task.options.map((o) => `<button data-job-answer="${esc(o.id)}">${esc(o.label)}</button>`).join("")}
        </div>
        <p class="job-message" role="status">
          ${esc(message || "完成全部任務，才會拿到薪水。")}<br />目前失誤 ${j.mistakes} 次 ·
          預計薪水
          ${money(def.pay * (1 - Math.min(0.4, j.mistakes * 0.05)) * (s.reputation < 35 ? 0.85 : 1))}
        </p>
        <div class="modal-actions">
          <button class="ghost" data-action="pause-work">暫時休息（保留任務）</button
          ><button class="ghost" data-action="quit-work">放棄這班（不領薪）</button>
        </div>`,
    );
  }
  function settingsModal() {
    modal(
      "settings",
      /* HTML */ `<div class="modal-kicker">手機、電腦都能調整</div>
        <h2>讓這段人生保持可玩。</h2>
        <div class="choices">
          <button data-setting="sound">
            <b>音效：${prefs.sound ? "開" : "關"}</b
            ><small>自行開啟才播放。恐怖背景沒有突然巨響。</small></button
          ><button data-setting="effects">
            <b>彩色／紅屏動畫：${prefs.effects ? "開" : "溫和模式"}</b
            ><small>溫和模式保留靜態色彩提示，減少動畫。</small></button
          ><button data-setting="horror">
            <b>恐怖氣氛：${prefs.horror ? "開" : "關"}</b
            ><small>欠款與健康惡化會讓背景逐漸變暗、變紅，沒有頻閃。</small></button
          ><button data-setting="visionAssist">
            <b>視野輔助：${prefs.visionAssist ? "開" : "關"}</b
            ><small>角膜失去後可看清行情；不恢復部件、健康或金錢。</small>
          </button>
        </div>
        <div class="modal-actions">
          <button class="primary" data-action="dismiss">套用，回到人生</button>
        </div>`,
    );
  }
  function exportHistory() {
    let rows = ["商品代碼,商品名稱,遊戲日,時間,虛構價格,紀錄類型"];
    for (const a of E.ASSETS)
      for (const p of s.markets[a.id].series)
        rows.push(
          [a.code, a.name, p.day, clock(p.minute), p.price.toFixed(8), p.kind || "盤中報價"].join(
            ",",
          ),
        );
    for (const p of s.equityTape)
      rows.push(
        ["NET", "我的身家", p.day, clock(p.minute), p.price.toFixed(4), "身家快照"].join(","),
      );
    download(
      "百億人生1.2_完整行情_第" + s.day + "天.csv",
      rows.join("\n"),
      "text/csv;charset=utf-8",
    );
    toast("完整盤中行情與身家紀錄已下載。");
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function nameModal() {
    modal(
      "name",
      /* HTML */ `<div class="modal-kicker">百億人生 1.2 · 先創造角色</div>
        <h2>這張借條，要寫誰的名字？</h2>
        <p>給這段人生一個暱稱。故事、催收員、朋友與戰報都會用這個名字稱呼你。</p>
        <label class="name-label" for="character-name">角色名字（1 至 16 字，不必是真名）</label
        ><input
          class="name-input"
          id="character-name"
          type="text"
          maxlength="32"
          value="百億新手"
          autocomplete="off"
        />
        <div class="modal-box">
          證件、聯絡人、訊息都由遊戲生成。整個故事離線演出，只存在你的瀏覽器。
        </div>
        <div class="modal-actions">
          <button class="primary" data-action="choose-name">用這個名字，走進百億人生</button>
        </div>`,
    );
  }
  function chooseName() {
    const r = E.setName(s, $("character-name").value);
    if (!r.ok) {
      toast(r.message, true);
      return;
    }
    dismiss(true);
    render();
    if (!unlocked) welcome();
    else if (s.pending) pendingScreen();
    else if (s.job) jobScreen();
    else if (s.gamble) gambleScreen();
    else toast(s.playerName + "，歡迎回來。");
  }
  function contractModal() {
    if (!contractDraft) return;
    const c = contractDraft,
      t = E.LOAN_TYPES[c.type];
    modal(
      "contract",
      /* HTML */ `<div class="modal-kicker">
          ${c.type === "online" ? "秒速網貸" : "地下借條"} · 虛構簽約流程 1 / 1
        </div>
        <h2>${esc(s.playerName)}，先把名字留在這裡。</h2>
        <div class="fiction-id">
          <span>遊戲角色識別卡 · SIMULATION</span>
          <div>
            <strong>🎭</strong>
            <p>
              <b>${esc(s.playerName)}</b
              ><small
                >證件代碼 ${esc(s.fictionId)}<br />住址：虛構城・百億巷<br />僅供遊戲演出，非真實身分證</small
              >
            </p>
          </div>
        </div>
        <div class="contract-bill">
          <span>借 ${money(c.amount)}</span><b>真正入帳 ${money(c.amount * (1 - t.fee))}</b
          ><small>每日劇情利息 ${t.rate * 100}% · 第 ${s.day + t.days} 天到期</small>
        </div>
        <div class="choices">
          <button data-contract-ack="id">
            <b>${c.idAck ? "☑" : "☐"} 封存這張虛構證件</b
            ><small>只使用遊戲生成資料；不會上傳檔案或啟用相機。</small></button
          ><button data-contract-ack="contacts">
            <b>${c.contactsAck ? "☑" : "☐"} 閱讀虛構聯絡人／抵債條款</b
            ><small
              >${c.type === "online" ? "小夏、阿城、林店長是遊戲人物。逾期可能演出個資外洩、謠言群發和名譽損失。" : "逾期可能演出威脅、健康損傷、部件被低價抵債。"}日息可能逐輪升高。現實不應交出證件或接受違法催收。</small
            >
          </button>
        </div>
        <div class="signature-preview">簽名：<b>${esc(s.playerName)}</b></div>
        <div class="modal-actions">
          <button class="ghost" data-action="cancel-contract">反悔，不借了</button
          ><button
            class="primary"
            data-action="sign-contract"
            ${!c.idAck || !c.contactsAck ? "disabled" : ""}
          >
            簽下遊戲合約並入帳
          </button>
        </div>`,
    );
  }
  function signContract() {
    const c = contractDraft;
    if (!c || !c.idAck || !c.contactsAck) return;
    const r = E.borrow(s, c.amount, c.type, false, {
      id: s.fictionId,
      signedName: s.playerName,
      contacts: true,
    });
    if (r.ok) {
      contractDraft = null;
      dismiss(true);
      after(r);
    } else toast(r.message, true);
  }
  function collectionModal() {
    const scene = E.collectionScene(s);
    if (!scene) return;
    const l = scene.loan,
      p = s.pending,
      turn = p.turn || 0,
      o = E.ORGANS.find((x) => x.id !== "core" && x.id !== "liver_whole" && E.organAvailable(s, x)),
      danger = l.type !== "bank";
    const transcript = (p.transcript || [])
      .map(
        (x) =>
          `<div class="chat-bubble ${x.who === "player" ? "from-player" : "from-collector"}"><small>${x.who === "player" ? esc(s.playerName) : scene.who}</small><p>${esc(x.text)}</p></div>`,
      )
      .join("");
    const replies =
      turn < 3
        ? /* HTML */ `<div class="chat-current">
              <span>${scene.icon} ${scene.who}</span>
              <p>${esc(scene.lines[turn])}</p>
            </div>
            <div class="conversation-replies">
              <button data-debt-reply="answer">
                ${turn === 0 ? "接起來，聽他說完" : "我在聽，先核對帳單"}</button
              ><button data-debt-reply="question">如果還不完，會怎麼樣？</button
              ><button data-debt-reply="promise">先讓我想辦法</button>
            </div>`
        : /* HTML */ `<div class="collection-warning">
              ${esc(E.collectionPenalty(s, l))}<br />「求助」可避免本輪侵害，借條仍需處理。
            </div>
            <div class="choices">
              <button data-choice="0" ${s.cash + 1e-5 < l.balance ? "disabled" : ""}>
                <b>全額還清這張借條</b
                ><small>付 ${money(l.balance)}，壓力 −12，本輪沒有催收侵害。</small></button
              ><button data-choice="1">
                <b>延期三天，又說最後一次</b
                ><small>欠款 +20%、健康 −4、壓力 +12；加上本輪未付後果。</small></button
              ><button data-choice="2" ${!o ? "disabled" : ""}>
                <b>${o ? "自願交出" + o.name + "，先還一筆" : "沒有可用的部件"}</b
                ><small
                  >${o ? "健康 −" + o.damage + "，取得 " + money(o.price) + " 優先還款。" + (E.organFatal(s, o) ? "這會死亡。" : "代價不可逆；尚未還完再延兩天。") : "請選其他分支。"}</small
                ></button
              ><button data-choice="3">
                <b>掛斷，躲回螢幕裡</b
                ><small>欠款 +30%、健康 −8、壓力 +20；加上本輪未付後果，兩天後再來。</small></button
              ><button data-choice="4">
                <b>留存訊息，找朋友與援助站協商</b
                ><small
                  >遊戲費用 500 萬，健康 +5、壓力 −18、名譽
                  +8，本輪免受侵害，延三天。不是保證欠款消失。</small
                >
              </button>
            </div>`;
    modal(
      "debt",
      `<div class="collector-scene ${danger ? "danger-scene" : ""}"><div class="collector-top"><span class="collector-avatar">${scene.icon}</span><div><div class="modal-kicker">第 ${s.day} 天 · 第 ${l.stage || 1} 輪催收</div><h2>${scene.who}</h2><small>${danger ? "這是遊戲內威脅劇情。你可以找人一起面對。" : "遊戲借款通知"}</small></div></div><div class="collector-meter"><i style="width:${Math.min(100, (l.stage || 1) * 25)}%"></i></div><div class="collector-bill"><span>欠 ${money(l.balance)}</span><span>口袋 ${money(s.cash)}</span><span>日息 ${(E.loanRate(l) * 100).toFixed(0)}%</span></div><div class="chat-history">${transcript}</div>${replies}<div class="conversation-foot">對話 ${Math.min(turn + 1, 3)} / 3 · 行情已暫停 · 沒有現實聯絡或訊息發送</div></div>`,
    );
  }
  function collectionAfter(before) {
    const lost = s.organs.filter((x) => !before.organs.includes(x)),
      h = s.health - before.health,
      rep = s.reputation - before.reputation;
    modal(
      "collection-after",
      /* HTML */ `<div class="modal-kicker">催收後 · 房間又安靜了一點</div>
        <h2>${esc(s.playerName)}，這次付出了什麼？</h2>
        <div class="aftermath-grid">
          <div><small>健康變化</small><b class="${color(h)}">${signed(h, 1)}</b></div>
          <div><small>名譽變化</small><b class="${color(rep)}">${signed(rep, 0)}</b></div>
          <div><small>現金變化</small><b>${money(s.cash - before.cash)}</b></div>
          <div><small>目前總欠款</small><b class="negative">${money(s.debt)}</b></div>
        </div>
        ${lost.length ? '<div class="collection-warning">失去：' + lost.map((id) => esc(E.ORGANS.find((o) => o.id === id).name)).join("、") + "。不顯示身體傷害畫面；部件和上限已永久改變。</div>" : ""}
        <p>
          ${s.reputation < 75 ? "遊戲手機裡的朋友已收到不實訊息。你可以打開朋友圈，看到他們的反應。" : "暫時告一段落。借條與下一個到期日，仍留在帳戶裡。"}
        </p>
        <div class="modal-actions">
          <button class="ghost" data-action="open-phone">看看遊戲手機</button
          ><button class="primary" data-action="dismiss">回到房間</button>
        </div>`,
    );
  }
  function phoneModal() {
    modal(
      "phone",
      /* HTML */ `<div class="phone-head">
          <span>📱</span>
          <div>
            <div class="modal-kicker">離線演出 · 全部都是遊戲人物</div>
            <h2>${esc(s.playerName)}的手機</h2>
          </div>
        </div>
        <div class="phone-summary">
          名譽 <b>${s.reputation} / 100</b> ·
          ${s.reputation < 35 ? "謠言影響工作，薪資只剩 85%" : "朋友還在等你回覆"}
        </div>
        <div class="social-feed">
          ${
            s.social.length
              ? s.social
                  .map(
                    (x) =>
                      /* HTML */ `<article>
                        <span
                          >${x.who === "不明群發帳號" ? "⚠️" : x.who === "催收通知" ? "🚪" : "💬"}</span
                        >
                        <div>
                          <b>${esc(x.who)}</b><small>第 ${x.day} 天</small>
                          <p>${esc(x.text)}</p>
                        </div>
                      </article>`,
                  )
                  .join("")
              : "<article><span>💬</span><div><b>小夏</b><p>" +
                esc(s.playerName) +
                "，記得吃飯。沒有訊息，有時候也是一種平靜。</p></div></article>"
          }
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">放下手機</button
          ><button
            class="primary"
            data-action="friend-support"
            ${s.pending || s.job || s.gamble || s.ended || s.lastSupportDay === s.day ? "disabled" : ""}
          >
            跟朋友坦承近況 · 名譽 +6
          </button>
        </div>`,
    );
  }
  let casinoType = "dice",
    casinoStake = "0.05";
  function casinoModal() {
    if (lesson) {
      lessonIntro("casino");
      return;
    }
    if (s.gamble) {
      gambleScreen();
      return;
    }
    modal(
      "casino",
      /* HTML */ `<div class="casino-heading">
          <span>🎰</span>
          <div class="modal-kicker">深夜遊戲館 · 換張桌子，也不是翻本保證</div>
          <h2>股票之外，還能怎麼輸？</h2>
        </div>
        <div class="casino-menu">
          ${E.CASINO.map((g) => `<button data-casino-mode="${g.id}" class="${g.id === casinoType ? "active" : ""}"><span>${g.icon}</span><b>${g.name}</b></button>`).join("")}
        </div>
        <p>${E.CASINO.find((g) => g.id === casinoType).description}</p>
        <label for="casino-stake">這局拿多少億？</label>
        <div class="amount-field">
          <input
            id="casino-stake"
            type="number"
            min="0.0001"
            step="0.01"
            value="${esc(casinoStake)}"
            inputmode="decimal"
          /><span>億</span>
        </div>
        <div class="casino-record">
          <span>玩過 ${s.gambleStats.rounds} 局</span
          ><span class="${color(s.gambleStats.net)}">累計 ${money(s.gambleStats.net)}</span>
        </div>
        <div class="modal-box">
          純遊戲幣，沒有充值或兌現。早期偶爾贏，後期莊家更偏向自己；每遊戲日最多 12
          局。下注後本金立即扣掉，任務與行情暫停，完成或放棄才能再交易。
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">今晚先不去</button
          ><button
            class="primary"
            data-action="start-gamble"
            ${s.ended || s.pending || s.job ? "disabled" : ""}
          >
            下注，坐上這張桌子
          </button>
        </div>`,
    );
  }
  function playingCards(cards, hidden = false) {
    return cards
      .map(
        (c, i) =>
          `<div class="playing-card ${i % 2 ? "red-suit" : ""}">${hidden && i > 0 ? "<span>✦</span><b>？</b>" : "<small>" + ["♠", "♥", "♣", "♦"][i % 4] + "</small><b>" + esc(c.label) + "</b>"}</div>`,
      )
      .join("");
  }
  function gambleScreen() {
    const g = s.gamble;
    if (!g) return;
    let board = "",
      actions = "";
    if (g.id === "dice") {
      board = /* HTML */ `<div class="dice-cup">🎲</div>
        <p class="table-prompt">
          ${g.guess ? "你猜 " + (g.guess === "big" ? "大" : "小") + "。現在親手搖骰。" : "先猜大小，再搖骰。"}
        </p>
        <div class="gamble-choice">
          <button data-gamble-action="small" class="${g.guess === "small" ? "active" : ""}">
            小 · 3 至 10</button
          ><button data-gamble-action="big" class="${g.guess === "big" ? "active" : ""}">
            大 · 11 至 18
          </button>
        </div>`;
      actions = `<button class="primary" data-gamble-action="roll" ${!g.guess ? "disabled" : ""}>搖開骰盅</button>`;
    } else if (g.id === "cards") {
      board = /* HTML */ `<div class="hand-label">莊家 · 一張暗牌</div>
        <div class="card-hand">${playingCards(g.dealer, true)}</div>
        <div class="hand-label">${esc(s.playerName)} · ${E.handScore(g.player)} 點</div>
        <div class="card-hand">${playingCards(g.player)}</div>
        <p class="table-prompt">不要超過 21。停牌後莊家會攤牌，平手也是莊家贏。</p>`;
      actions =
        '<button class="primary" data-gamble-action="hit">再要一張</button><button class="ghost" data-gamble-action="stand">停牌，攤牌</button>';
    } else {
      board = /* HTML */ `<div class="mine-score">
          已翻 ${g.revealed.length} 格 · 安全後返還
          <b>${E.mineMultiplier(g.revealed.length).toFixed(2)} 倍</b>
        </div>
        <div class="mine-board">
          ${Array.from({ length: 9 }, (_, i) => `<button data-gamble-action="reveal" data-mine-index="${i}" class="${g.revealed.includes(i) ? "safe-tile" : ""}" ${g.revealed.includes(i) ? "disabled" : ""} aria-label="第 ${i + 1} 格${g.revealed.includes(i) ? "安全" : "未翻開"}">${g.revealed.includes(i) ? "💎" : "？"}</button>`).join("")}
        </div>
        <p class="table-prompt">
          ${g.bombs.length} 個雷。每次翻開都可能整筆歸零，知道什麼時候收手嗎？
        </p>`;
      actions = `<button class="primary" data-gamble-action="cashout" ${!g.revealed.length ? "disabled" : ""}>現在收手 · ${money(g.stake * E.mineMultiplier(g.revealed.length))}</button>`;
    }
    modal(
      "gamble",
      /* HTML */ `<div class="gamble-table">
        <div class="modal-kicker">第 ${s.day} 天 · ${E.CASINO.find((x) => x.id === g.id).name}</div>
        <h2>本金 ${money(g.stake)}，已放上賭桌。</h2>
        ${board}
        <div class="modal-actions">${actions}</div>
        <div class="table-exit">
          <button class="ghost" data-action="pause-gamble">保留本局，先休息</button
          ><button class="ghost" data-gamble-action="forfeit">放棄本局 · 本金全輸</button>
        </div>
      </div>`,
    );
  }
  function gambleResult() {
    const g = s.lastGamble;
    if (!g) return;
    const dice = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    let board =
      g.id === "dice"
        ? '<div class="dice-results">' +
          g.dice.map((n) => "<span>" + dice[n - 1] + "</span>").join("") +
          "</div>"
        : g.id === "cards"
          ? '<div class="hand-label">你的 ' +
            E.handScore(g.player) +
            " 點 / 莊家 " +
            E.handScore(g.dealer) +
            ' 點</div><div class="card-hand">' +
            playingCards(g.player) +
            '</div><div class="card-hand">' +
            playingCards(g.dealer) +
            "</div>"
          : '<div class="mine-board result-board">' +
            Array.from(
              { length: 9 },
              (_, i) =>
                '<div class="' +
                (g.bombs.includes(i) ? "bomb-tile" : "safe-tile") +
                '">' +
                (g.bombs.includes(i) ? "💣" : "💎") +
                "</div>",
            ).join("") +
            "</div>";
    modal(
      "gamble-result",
      /* HTML */ `<div class="casino-heading">
          <div class="modal-kicker">這一局已結算，只結算一次</div>
          <h2>${g.net > 0 ? "這次居然贏了。" : "又想著下一把了？"}</h2>
        </div>
        ${board}
        <p>${esc(g.reason)}</p>
        <div class="gamble-receipt">
          <span>投入 ${money(g.stake)}</span><span>拿回 ${money(g.payout)}</span
          ><b class="${color(g.net)}">這局 ${g.net >= 0 ? "+" : "−"}${money(Math.abs(g.net))}</b>
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">離開賭桌</button
          ><button class="primary" data-action="casino-again">再看一局（尚未下注）</button>
        </div>`,
    );
  }
  function leverage() {
    return product === "spot" ? 1 : LEV[Number($("leverage").value)] || 1;
  }
  function amount() {
    return Number($("amount").value) * 1e8;
  }
  function renderOrder() {
    const l = leverage(),
      amt = amount(),
      fee = E.orderFee(amt, l, product);
    document.querySelectorAll("[data-product]").forEach((b) => {
      b.classList.toggle("active", b.dataset.product === product);
      b.setAttribute("aria-pressed", String(b.dataset.product === product));
    });
    document.querySelectorAll("[data-direction]").forEach((b) => {
      b.classList.toggle("active", b.dataset.direction === direction);
      b.setAttribute("aria-pressed", String(b.dataset.direction === direction));
    });
    document.querySelector('[data-direction="short"]').disabled = product === "spot";
    $("leverage-zone").hidden = product === "spot";
    $("leverage-label").textContent = l + " 倍";
    $("order-preview").innerHTML =
      `你拿出 <strong>${Number.isFinite(amt) ? money(amt) : "—"}</strong>，猜它會<strong>${direction === "long" ? "漲" : "跌"}</strong>。<small>另外扣 ${Number.isFinite(fee) ? money(fee) : "—"} 平台費${product !== "spot" ? "，每天還有放大費" : ""}。</small>`;
    $("risk-note").textContent =
      product === "spot"
        ? "先從普通買股開始：猜對不等於已賺到，還要賣掉才能收回現金。"
        : product === "option"
          ? `三天後自動開獎。約 ${(100 / l).toFixed(l === 100 ? 0 : 1)}% 反向波動，就可能整筆歸零。`
          : `${l} 倍玩法：約 ${(100 / l).toFixed(l === 100 ? 0 : 1)}% 反向波動就可能把這筆錢全部吃掉。`;
    $("trade-button").textContent = s.ended
      ? "這段人生已結束"
      : `買進 · 猜會${direction === "long" ? "漲" : "跌"}${product !== "spot" ? " · " + l + " 倍" : ""}`;
    $("trade-button").disabled =
      s.ended || !!s.pending || !!s.job || !!s.gamble || busy || (!unlocked && !lesson);
  }
  function renderPortfolio() {
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("position-count").textContent = s.positions.length;
    if (tab === "positions") {
      $("portfolio-content").innerHTML = s.positions.length
        ? s.positions
            .map((p) => {
              const a = E.ASSETS.find((x) => x.id === p.asset),
                v = E.value(s, p),
                pnl = v - p.margin;
              return /* HTML */ `<article class="position-card">
                <div class="position-title">
                  <span>${assetIcon(a)}</span>
                  <div>
                    <b>${a.name}</b
                    ><small
                      >猜會${p.sign === 1 ? "漲" : "跌"} · ${p.leverage}
                      倍${p.expiry ? " · 第 " + p.expiry + " 天開獎" : ""}</small
                    >
                  </div>
                </div>
                <div class="position-pnl">
                  <strong class="${color(pnl)}"
                    >${pnl >= 0 ? "+" : "−"}${money(Math.abs(pnl))}</strong
                  ><small
                    >${pnl >= 0 ? "現在比買進時多" : "現在比買進時少"}
                    ${Math.abs((pnl / p.margin) * 100).toFixed(1)}%</small
                  >
                </div>
                <div class="position-details">
                  <span>原本拿出 ${money(p.margin)}<br />現在還值 ${money(v)}</span
                  ><button
                    data-close="${p.id}"
                    ${s.pending || s.job || s.gamble || busy ? "disabled" : ""}
                  >
                    賣掉，拿回錢
                  </button>
                </div>
              </article>`;
            })
            .join("")
        : /* HTML */ `<div class="holdings-empty">
            <span>🛒</span>
            <h3>${s.ended ? "最後一筆也沒了。" : "你還沒有買東西。"}</h3>
            <p>
              先挑一張股票卡，拿出少量錢。<br />買完行情會持續跳動；這裡就會顯示現在賺了或賠了。
            </p>
          </div>`;
    } else if (tab === "ledger")
      $("portfolio-content").innerHTML =
        '<div class="ledger-scroll">' +
        s.logs
          .map(
            (l) =>
              /* HTML */ `<div class="ledger-row">
                <span class="${l.type === "danger" ? "negative" : ""}">${esc(l.text)}</span
                ><small>第 ${l.day} 天</small>
              </div>`,
          )
          .join("") +
        "</div>";
    else
      $("portfolio-content").innerHTML =
        '<div class="achievement-grid">' +
        E.ACHIEVEMENTS.map(
          (a) =>
            `<div class="achievement ${s.achievements.includes(a.id) ? "on" : ""}"><b>${s.achievements.includes(a.id) ? "🏅" : "🔒"} ${a.name}</b><small>${a.description}</small></div>`,
        ).join("") +
        "</div>";
  }
  function renderNews() {
    $("news").innerHTML = s.news
      .slice(0, 3)
      .map(
        (n) =>
          /* HTML */ `<article class="news-item">
            <small>第 ${n.day} 天 · ${esc(n.tag)}</small>
            <p>${esc(n.text)}</p>
          </article>`,
      )
      .join("");
  }
  function modal(type, html) {
    modalType = type;
    $("modal-content").innerHTML = html;
    const title = $("modal-content").querySelector("h2");
    if (title) title.id = "modal-title";
    if (!$("modal").open) $("modal").showModal();
    if (lesson) $("coach-layer").hidden = true;
    renderChart();
  }
  function dismiss(force = false) {
    if (!force && ["event", "debt", "survival", "gamble", "name"].includes(modalType)) return;
    $("modal").close();
    modalType = "";
    renderChart();
    if (lesson) {
      $("coach-layer").hidden = false;
      positionGuide();
    }
  }
  function after(result, { visual = false, delta = null } = {}) {
    if (!result.ok) {
      toast(result.message, true);
      return result;
    }
    render();
    toast(result.message);
    if (visual) feedback(delta ?? s.daily);
    if (s.ended) ending();
    else if (s.pending) pendingScreen();
    return result;
  }
  function advance(count = 1, rest = false) {
    if ($("modal").open || busy || s.ended) return;
    const before = E.equity(s);
    let days = 0;
    for (let i = 0; i < count; i++) {
      const r = E.nextDay(s, { rest });
      if (!r.ok) {
        toast(r.message, true);
        return;
      }
      days++;
      if (s.pending || s.ended) break;
    }
    render();
    const delta = E.equity(s) - before;
    if (s.pending && s.pending.type === "glitch") {
      busy = true;
      render();
      const displayed = Math.max(delta, s.pending.shownProfit || 0);
      if (displayed > 0) {
        feedback(displayed, "股票帳面暫時賺到錢。你正想收下，平台卻……");
        glitchTimer = setTimeout(showGlitch, prefs.effects ? 1900 : 750);
      } else showGlitch();
    } else {
      if (delta !== 0)
        feedback(
          delta,
          rest
            ? "你休息了，股票和帳單還在走。"
            : days > 1
              ? "你剛剛一口氣過了 " + days + " 天。"
              : "",
        );
      if (s.ended) ending();
      else if (s.pending) pendingScreen();
      else toast(rest ? "休息結束，健康恢復了一些。" : "第 " + s.day + " 天結算完成。");
    }
    if (lesson) lessonAction("advance");
  }
  function welcome() {
    modal(
      "welcome",
      /* HTML */ `<div class="modal-kicker">百億人生 1.2 · 你的 24 小時人生</div>
        <h2>錢會動，人生也會動。</h2>
        <p>
          你有 100 億，最多 60 天。每 1 秒走 5
          分鐘，午夜自動換日；閱讀視窗、工作與賭局期間會暫停，關掉視窗或完成任務後繼續。
        </p>
        <div class="welcome-routes">
          <article>
            <b>📈 股票</b>
            <p>挑商品 → 選金額 → 買進 → 看線條 → 隨時賣掉。</p>
          </article>
          <article>
            <b>🧹 打工</b>
            <p>收銀、分包裹、做咖啡。親手完成才發薪，一天一班。</p>
          </article>
          <article>
            <b>🎰 賭桌</b>
            <p>骰子猜大小、21 點要牌、九宮格避雷。下注的遊戲錢真的會扣。</p>
          </article>
          <article>
            <b>🧬 身體與手機</b>
            <p>點角色看部件；查看朋友訊息、借條與不可逆的身體合約。</p>
          </article>
        </div>
        <div class="modal-box">
          這是刻意走向破產的黑色幽默遊戲。假
          404、催收、部件交易與死亡都是虛構演出。練習帳戶不會扣正式資金。
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="skip-lesson">跳過說明，直接玩</button
          ><button class="primary" data-action="start-lesson">跟著手指，練習 10 步</button>
        </div>`,
    );
  }
  const LESSONS = [
    {
      key: "asset",
      target: '[data-asset="sky"]',
      title: "① 先挑一個要買的東西",
      body: "這些卡片是不同的虛構股票。名字下面的百分比，表示它今天比昨天漲了或跌了多少。現在先買最左邊的「天頂晶圓」。",
      task: "點手指指著的「天頂晶圓」。",
    },
    {
      key: "budget",
      target: '[data-budget="1"]',
      title: "② 拿出 1 億試試，不要梭哈",
      body: "投入金額用「億」算：1 = 1 億，0.1 = 1 千萬。不要被大數字嚇到，這只是遊戲錢。先按 1 億，輸入欄就會幫你填好。",
      task: "按「1 億」。練習不影響正式資金。",
    },
    {
      key: "direction",
      target: '[data-direction="long"]',
      title: "③ 你覺得它會漲，還是會跌？",
      body: "「猜會漲」是價格上去你才賺錢。普通買股只能猜漲；想猜跌要切到放大模式。這次練習先猜會漲。",
      task: "點「猜會漲」，先把方向選好。",
    },
    {
      key: "buy",
      target: "#trade-button",
      title: "④ 真的買進，才會有結果",
      body: "你拿出的錢會從口袋移到「我買了什麼」。身家不會因為買進就全部消失，但平台會先收一點費用。這輪練習先暫停盤中行情；正式買進後，價格會持續跳動。",
      task: "按黃色「買進」按鈕。",
    },
    {
      key: "advance",
      target: "#next-button",
      title: "⑤ 過一天，看看開獎結果",
      body: "正式遊戲買完就能看盤中漲跌。這個按鈕會結算剩餘盤中行情，並推進一天。練習先用這個按鈕推進時間。正式盤中行情會持續變動；生活費和借款利息通常會一起結算。練習第一天我們先讓股票漲，讓你看懂獲利。",
      task: "按下方「過一天，看看結果」。",
    },
    {
      key: "sell",
      target: "[data-close]",
      title: "⑥ 彩色了！但錢還沒回口袋",
      body: "彩色畫面代表剛才賺了；持有卡會顯示「比買進時多多少」。只要沒賣掉，這筆獲利仍可能跌回去。現在把它賣掉，拿回現金。",
      task: "點持有卡上的「賣掉，拿回錢」。",
    },
    {
      key: "health",
      target: "#health-help",
      title: "⑦ 你不只有一個金錢帳戶",
      body: "旁邊還有身體健康與壓力。健康歸零會死亡；壓力越高，每天越容易透支。休息能恢復一點，但已賣掉的部件不會長回來。",
      task: "點「看懂身體」，確認你看到健康欄了。",
    },
    {
      key: "work",
      target: "#work-button",
      title: "⑧ 打工要親手做完",
      body: "入口就在休息旁。收銀要找零，包裹要分區，咖啡要照訂單做；不是按一下就發薪。任務沒有限時，一天只能領一班。",
      task: "點「打工補錢」，先看看三種工作說明。",
    },
    {
      key: "casino",
      target: "#casino-button",
      title: "⑨ 換張桌子，風險還在",
      body: "骰子、21 點、地雷九宮格都要親手選。下注會扣遊戲錢，莊家偏向自己；收手只能保住尚未輸掉的部分。",
      task: "點休息旁的「深夜遊戲館」，看懂怎麼玩。",
    },
    {
      key: "loan",
      target: "#loan-button",
      mobileTarget: "#tutorial-loan-shortcut",
      title: "⑩ 借錢是拿明天來下注",
      body: "銀行、網貸、高利貸，入帳速度很快，代價也很快。借到 1 億不等於賺到 1 億：欠款跟著增加，到期還會來催你。先打開借款說明。",
      task: "點「借錢再拚一次」。這次練習不會真的借款。",
    },
  ];
  function startLesson() {
    stopEffects();
    busy = false;
    dismiss(true);
    formalBackup = s;
    lesson = true;
    lessonStep = 0;
    s = E.create(20261002, true);
    s.playerName = formalBackup.playerName;
    s.named = true;
    selected = "sky";
    filter = "stock";
    sectorKind = "";
    sector = "all";
    assetSearch = "";
    $("asset-search").value = "";
    product = "spot";
    direction = "long";
    chartMode = "price";
    chartDay = null;
    chartPeriod = "day";
    chartHover = null;
    tab = "positions";
    $("amount").value = "1";
    $("leverage").value = 0;
    $("coach-layer").hidden = false;
    render();
    guideStep();
  }
  function lessonAction(key) {
    if (!lesson || LESSONS[lessonStep]?.key !== key) return;
    if (key === "loan") {
      lessonLoan();
      return;
    }
    lessonStep++;
    guideStep();
  }
  function guideTarget() {
    const step = LESSONS[lessonStep];
    if (!step) return null;
    let el = document.querySelector(step.target);
    if (el && el.getBoundingClientRect().height === 0 && step.mobileTarget)
      el = document.querySelector(step.mobileTarget);
    return el;
  }
  function guideStep() {
    if (!lesson || !LESSONS[lessonStep]) return;
    const step = LESSONS[lessonStep];
    $("coach-progress").textContent =
      "練習 " + (lessonStep + 1) + " / " + LESSONS.length + " · 正式錢不會少";
    $("coach-title").textContent = step.title;
    $("coach-body").textContent = step.body;
    $("coach-task").textContent = step.task;
    $("coach-track").innerHTML = LESSONS.map(
      (_, i) => `<i class="${i <= lessonStep ? "on" : ""}"></i>`,
    ).join("");
    $("coach-layer").hidden = false;
    const target = guideTarget();
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.focus({ preventScroll: true });
    }
    positionGuide();
    setTimeout(positionGuide, 60);
  }
  function positionGuide() {
    if (!lesson || $("modal").open) return;
    const el = guideTarget();
    if (!el) return;
    const r = el.getBoundingClientRect(),
      vw = window.innerWidth,
      vh = window.innerHeight;
    $("spotlight").style.cssText =
      `left:${Math.max(2, r.left - 5)}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;`;
    $("guide-hand").style.left = Math.max(10, Math.min(vw - 50, r.left + r.width * 0.65)) + "px";
    const below = r.bottom + 42 < vh - 100;
    $("guide-hand").style.top = (below ? r.bottom + 2 : Math.max(5, r.top - 45)) + "px";
    $("guide-hand").style.rotate = below ? "0deg" : "180deg";
    const coach = $("coach-card"),
      aboveSpace = Math.max(0, r.top - 18),
      belowSpace = Math.max(0, vh - r.bottom - 110),
      putAbove = aboveSpace >= belowSpace;
    coach.style.top = putAbove ? "14px" : "auto";
    coach.style.bottom = putAbove ? "auto" : "110px";
    coach.style.maxHeight = Math.max(120, (putAbove ? aboveSpace : belowSpace) - 18) + "px";
  }
  function lessonIntro(kind) {
    const work = kind === "work";
    modal(
      "lesson-intro",
      /* HTML */ `<div class="modal-kicker">${work ? "打工教室" : "賭桌教室"} · 說明不扣錢</div>
        <h2>${work ? "用你的雙手領薪水。" : "先懂規則，再決定上不上桌。"}</h2>
        <div class="intro-cards">
          ${(work ? E.JOBS : E.CASINO)
            .map(
              (x) =>
                /* HTML */ `<article>
                  <span>${x.icon}</span><b>${x.name}</b>
                  <p>${x.description}</p>
                  ${work ? /* HTML */ `<small>完成 ${x.rounds} 筆領 ${money(x.pay)}；答錯會扣薪。</small>` : ""}
                </article>`,
            )
            .join("")}
        </div>
        <div class="modal-box">
          ${work ? "工作期間時鐘暫停。暫時離開會保留任務；完成全部操作才拿錢，放棄不發薪。" : "賭局期間時鐘暫停。可以先休息再回來；必須完成或放棄本局，才能繼續交易。賭場每天最多 12 局，沒有真錢。"}
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="skip-lesson">跳過剩餘說明</button
          ><button class="primary" data-action="lesson-next">我懂了，下一步</button>
        </div>`,
    );
  }
  function lessonLoan() {
    modal(
      "lesson-loan",
      /* HTML */ `<div class="modal-kicker">最後一課 · 看懂借款代價</div>
        <h2>入帳快，不代表沒代價。</h2>
        <div class="loan-types">
          ${Object.entries(E.LOAN_TYPES)
            .map(
              ([id, t]) =>
                /* HTML */ `<div class="loan-type">
                  <b>${t.name}</b><small>先扣 ${t.fee * 100}%</small
                  ><small>每日息 ${t.rate * 100}%</small><small>${t.days} 日催收</small>
                </div>`,
            )
            .join("")}
        </div>
        <p>
          到期要還本金。還不出來可以延期，但欠得更多；也可能被劇情逼到簽身體合約。<strong
            >不要把借來的錢，當作賺來的錢。</strong
          >
        </p>
        <div class="modal-box">
          練習已完成：你會挑股票、決定金額、買進、等一天、看獲利與賣掉了。正式開始會回到原本的百億人生，不扣練習金額。
        </div>
        <div class="modal-actions">
          <button id="lesson-finish" class="primary" data-action="finish-lesson">
            👆 我看懂了，進入正式人生
          </button>
        </div>`,
    );
  }
  function finishLesson(skipped = false) {
    s = formalBackup || s;
    formalBackup = null;
    lesson = false;
    unlocked = true;
    prefs.tutorialDone = true;
    lessonStep = 0;
    $("coach-layer").hidden = true;
    dismiss(true);
    selected = "sky";
    filter = "stock";
    product = "spot";
    direction = "long";
    tab = "positions";
    $("amount").value = "1";
    $("leverage").value = 0;
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    toast(
      skipped
        ? "已跳過說明。隨時可按「怎麼玩？」重看。"
        : "練習完成！正式人生開始，原本的資金完整保留。",
    );
    if (s.pending) pendingScreen();
    else if (s.ended) ending();
  }
  function loanModal() {
    loanType = "bank";
    renderLoanModal();
  }
  function renderLoanModal() {
    const t = E.LOAN_TYPES[loanType],
      max = E.loanLimit(s, loanType);
    modal(
      "loan",
      /* HTML */ `<div class="modal-kicker">借錢不是賺錢</div>
        <h2>選一種，拿未來換現在。</h2>
        <div class="loan-types">
          ${Object.entries(E.LOAN_TYPES)
            .map(
              ([id, x]) =>
                `<button class="loan-type ${loanType === id ? "active" : ""}" data-loan-type="${id}"><b>${x.name}</b><small>每日息 ${x.rate * 100}%</small><small>${x.days} 日催收</small></button>`,
            )
            .join("")}
        </div>
        <div class="loan-terms">
          最多肯借你 <b>${money(max)}</b>。入帳先扣 <b>${t.fee * 100}%</b>，每日息
          <b>${t.rate * 100}%</b>，第 <b>${s.day + t.days} 天</b>會找你催收。
        </div>
        <div class="amount-field">
          <label class="sr-only" for="loan-amount">借款金額，單位億</label
          ><input
            id="loan-amount"
            type="number"
            min="0.0001"
            step="0.1"
            value="${(Math.floor(Math.min(1, max / 1e8) * 10000) / 10000).toFixed(4)}"
            inputmode="decimal"
          /><span>億</span>
        </div>
        <div id="loan-receipt" class="modal-box" style="margin-top:15px"></div>
        ${s.loans.length ? '<div class="modal-box" style="margin-top:12px"><strong>你現在的借條</strong><br>' + s.loans.map((l) => E.LOAN_TYPES[l.type].name + "：" + money(l.balance) + "，第 " + l.due + " 天到期").join("<br>") + "</div>" : ""}
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">先不借</button
          ><button class="primary" data-action="borrow" ${max < 10000 ? "disabled" : ""}>
            接受這張借條</button
          >${s.debt > 0 ? '<button class="ghost" data-action="open-repay">先還一筆</button>' : ""}
        </div>`,
    );
    loanReceipt();
    $("loan-amount").addEventListener("input", loanReceipt);
  }
  function loanReceipt() {
    const amt = Number($("loan-amount").value) * 1e8,
      t = E.LOAN_TYPES[loanType];
    $("loan-receipt").innerHTML =
      Number.isFinite(amt) && amt > 0
        ? `真正拿到 <strong>${money(amt * (1 - t.fee))}</strong>，欠款增加 <strong>${money(amt)}</strong>。<br>明天利息 ${money(amt * t.rate)}。這些是誇張的遊戲利率。`
        : "請輸入有效金額。";
  }
  function repayModal() {
    modal(
      "repay",
      /* HTML */ `<div class="modal-kicker">至少還一點，別讓利息繼續吃你</div>
        <h2>現在欠 ${money(s.debt)}</h2>
        <p>口袋可用 ${money(s.cash)}。會優先還快到期的借條；未付的生活費債務也算在總欠款裡。</p>
        <div class="amount-field">
          <label class="sr-only" for="repay-amount">還款金額，單位億</label
          ><input
            id="repay-amount"
            type="number"
            min="0.0001"
            step="0.1"
            value="${(Math.floor(Math.min(s.cash, s.debt) / 10000) / 10000).toFixed(4)}"
            inputmode="decimal"
          /><span>億</span>
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">先保留現金</button
          ><button class="primary" data-action="repay">還回去</button>
        </div>`,
    );
  }
  const BODY_ZONES = {
    all: "全身",
    head: "頭頸",
    chest: "胸腔",
    abdomen: "腹腔",
    structure: "骨骼與外層",
  };
  function bodyZone(id) {
    return ["cornea_left", "cornea_right", "thyroid"].includes(id)
      ? "head"
      : ["lung", "lung_right", "core"].includes(id)
        ? "chest"
        : ["marrow", "skin", "bone"].includes(id)
          ? "structure"
          : "abdomen";
  }
  function bodyStatus(o) {
    const r = s.organRecords.find((x) => x.id === o.id);
    return s.organs.includes(o.id)
      ? r?.cause === "seized"
        ? "被強行抵債"
        : r?.cause === "sold"
          ? "已賣出"
          : "已失去（舊檔）"
      : E.organAvailable(s, o)
        ? "仍在身體裡"
        : "隨整體失去";
  }
  function bodyModal(zone = "all") {
    const parts = E.ORGANS.filter((o) => zone === "all" || bodyZone(o.id) === zone),
      remaining = E.ORGANS.filter((o) => E.organAvailable(s, o)).length;
    modal(
      "body",
      /* HTML */ `<div class="modal-kicker">${esc(s.playerName)}的身體圖鑑 · 點部件查看</div>
        <h2>身體不能重新買進。</h2>
        <div class="body-vitals">
          <span>❤️ 健康 <b>${Math.ceil(s.health)} / ${s.healthCap}</b></span
          ><span>🧬 可用 <b>${remaining} / ${E.ORGANS.length}</b></span
          ><span>🌀 壓力 <b>${Math.round(s.stress)}</b></span>
        </div>
        <div class="body-explorer">
          <div class="anatomy-map">
            <svg viewBox="0 0 180 350" aria-hidden="true">
              <defs>
                <linearGradient id="body-glow" x1="0" x2="1">
                  <stop stop-color="#73dcec" />
                  <stop offset="1" stop-color="#b49aff" />
                </linearGradient>
              </defs>
              <circle cx="90" cy="38" r="27" />
              <path
                d="M70 69 Q42 73 33 106 L12 197 Q9 215 24 217 L48 132 L55 213 L45 323 Q43 344 59 344 L88 235 L92 235 L121 344 Q137 344 135 323 L125 213 L132 132 L156 217 Q171 215 168 197 L147 106 Q138 73 110 69 Z"
              />
              <path class="anatomy-spine" d="M90 79 V219" />
              ${[
                ["cornea_left", 77, 34, "👁"],
                ["cornea_right", 103, 34, "👁"],
                ["lung", 70, 113, "🫁"],
                ["lung_right", 110, 113, "🫁"],
                ["core", 92, 125, "♥"],
                ["liver", 102, 157, "◆"],
                ["stomach", 76, 175, "●"],
                ["kidney_left", 67, 199, "●"],
                ["kidney_right", 113, 199, "●"],
              ]
                .map(
                  ([id, x, y, icon]) =>
                    `<text class="${s.organs.includes(id) ? "missing-marker" : ""}" x="${x}" y="${y}" text-anchor="middle">${s.organs.includes(id) ? "×" : icon}</text>`,
                )
                .join("")}</svg
            ><small>示意圖・不是醫學影像<br />紅色叉號代表已失去</small>
            <div class="body-zone-links">
              ${Object.entries(BODY_ZONES)
                .filter(([k]) => k !== "all")
                .map(([k, v]) => `<button data-body-zone="${k}">${v} ›</button>`)
                .join("")}
            </div>
          </div>
          <div class="body-catalog">
            <div class="body-zone-tabs">
              ${Object.entries(BODY_ZONES)
                .map(
                  ([k, v]) =>
                    `<button class="${k === zone ? "active" : ""}" data-body-zone="${k}">${v}</button>`,
                )
                .join("")}
            </div>
            <div class="body-detail-grid">
              ${parts.map((o) => `<button class="body-item ${!E.organAvailable(s, o) ? "missing" : ""}" data-body-part="${o.id}"><span>${o.icon}</span><b>${o.name}</b><small>${bodyStatus(o)}</small><em>${E.organAvailable(s, o) ? "看狀態與合約 ›" : "查看失去紀錄 ›"}</em></button>`).join("")}
            </div>
          </div>
        </div>
        <p class="body-explorer-note">
          左右腎、左右肺、左右角膜分開記錄。肝臟碎片與剩餘肝臟有連動；部件、金額和傷害皆為虛構遊戲規則。
        </p>
        <div class="modal-actions">
          <button class="primary" data-action="dismiss">關閉檢查，回到人生</button>
        </div>`,
    );
  }
  function bodyDetail(id) {
    const o = E.ORGANS.find((x) => x.id === id);
    if (!o) return;
    const r = s.organRecords.find((x) => x.id === id),
      available = E.organAvailable(s, o),
      locked = s.ended || !!s.pending || !!s.job || !!s.gamble || busy,
      partCap =
        r?.cap ??
        (id.startsWith("kidney") && s.organs.some((x) => x.startsWith("kidney") && x !== id)
          ? 22
          : Math.min(s.healthCap, o.cap));
    modal(
      "body-detail",
      /* HTML */ `<div class="modal-kicker">
          ${BODY_ZONES[bodyZone(id)]} · ${esc(s.playerName)}的部件紀錄
        </div>
        <div class="body-organ-hero ${!available ? "missing" : ""}">
          <span>${o.icon}</span>
          <h2>${o.name}</h2>
          <b>${bodyStatus(o)}</b>
        </div>
        <div class="modal-box">
          <strong>功能與遊戲代價</strong>
          <p>${o.note}</p>
        </div>
        <div class="organ-detail-stats">
          <div><small>合約遊戲款</small><b>${money(o.price)}</b></div>
          <div><small>立即健康耗損</small><b>−${o.damage}</b></div>
          <div><small>永久健康上限</small><b>最多 ${partCap}</b></div>
        </div>
        ${
          available
            ? `<p class="${E.organFatal(s, o) ? "danger" : ""}">${E.organFatal(s, o) ? "⚠ 以你目前身體狀態，簽下這筆合約會直接死亡。" : "這筆合約不可撤銷，休息不會長回部件。"}${locked ? " 目前有事件／任務或已結局，只能查看。" : ""}</p>`
            : /* HTML */ `<div class="organ-loss-record">
                <strong>失去紀錄</strong>
                <p>
                  ${r?.day ? `第 ${r.day} 天 ${clock(r.minute)} · ${r.cause === "seized" ? "催收強行抵債" : "主動簽下身體合約"}<br>現金入帳 ${money(r.cash || 0)}${r.credit !== undefined ? ` · 抵債 ${money(r.credit)}` : ""}${r.healthBefore !== undefined ? `<br>當時健康 ${Math.ceil(r.healthBefore)} → ${Math.ceil(r.healthAfter)}，永久上限 ${r.cap}` : ""}` : r?.cause === "legacy" ? "舊版存檔只記錄已失去，沒有日期與原因；沒有補造紀錄。" : "剩餘肝臟已失去，這個子部件也不可用。"}
                </p>
              </div>`
        }
        <div class="modal-actions">
          <button class="ghost" data-action="back-body">回到全身圖鑑</button
          >${available ? `<button class="${E.organFatal(s, o) ? "danger-button" : "primary"}" data-organ="${id}" ${locked ? "disabled" : ""}>查看 ${o.name} 的合約</button>` : ""}
        </div>`,
    );
  }
  function organModal() {
    modal(
      "organs",
      /* HTML */ `<div class="modal-kicker">虛構黑市 · 不能撤銷的人生合約</div>
        <h2>真的要拿身體來翻本？</h2>
        <p>
          這裡的器官、價格、傷害都是荒誕遊戲設定。沒有實際交易資訊。<strong
            >健康上限降低後，休息不能把部件長回來。</strong
          >
        </p>
        <div class="organ-grid">
          ${E.ORGANS.map((o) => `<button class="organ-option" data-organ="${o.id}" ${!E.organAvailable(s, o) ? "disabled" : ""}><span>${o.icon}</span><span><b>${o.name}${!E.organAvailable(s, o) ? " · 已不可用" : ""}</b><small>${o.note}</small></span><strong>換 ${money(o.price, 1)}</strong></button>`).join("")}
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">身體先留著</button>
        </div>`,
    );
  }
  function confirmOrgan(id) {
    const o = E.ORGANS.find((x) => x.id === id),
      bothKidneys = id.startsWith("kidney") && s.organs.some((x) => x.startsWith("kidney"));
    modal(
      "organ-confirm",
      /* HTML */ `<div class="modal-kicker">黑市合約 · 確認不可逆代價</div>
        <h2>${E.organFatal(s, o) ? "這次會直接死亡。" : "失去" + o.name + "，能救回什麼？"}</h2>
        <p>
          取得 ${money(o.price)}。健康扣 ${o.damage}，永久健康上限最多
          ${bothKidneys ? 22 : Math.min(s.healthCap, o.cap)}。${esc(o.note)} 目前健康
          ${Math.ceil(s.health)}，<strong
            >${E.organFatal(s, o) ? "這筆交易會觸發死亡結局。" : "之後的每一天都更難撐。"}</strong
          >
        </p>
        <div class="modal-actions">
          <button class="ghost" data-action="back-organs">反悔，回去</button
          ><button class="primary" data-confirm-organ="${id}">簽下虛構合約</button>
        </div>`,
    );
  }
  function pendingScreen() {
    if (s.pending.type === "glitch") {
      showGlitch();
      return;
    }
    if (s.pending.type === "event") {
      const ev = E.EVENTS[s.pending.day];
      modal(
        "event",
        /* HTML */ `<div class="modal-kicker">
            第 ${s.day} 天 · ${ev.tag.split("/").at(-1).trim()}
          </div>
          <h2>${ev.title}</h2>
          <p>${ev.body}</p>
          <div class="choices">
            ${ev.choices.map((c, i) => `<button data-choice="${i}"><b>${c.label}</b><small>${c.detail}</small></button>`).join("")}
          </div>`,
      );
    } else if (s.pending.type === "debt") {
      collectionModal();
    } else {
      const organ = E.ORGANS.find(
        (x) => x.id !== "core" && x.id !== "liver_whole" && E.organAvailable(s, x),
      );
      modal(
        "survival",
        /* HTML */ `<div class="modal-kicker">口袋見底 · 要拿什麼再下注？</div>
          <h2>你已經沒有能用的錢。</h2>
          <p>這不是一個新的買點。是你連明天生活費都拿不出的那一天。</p>
          <div class="choices">
            <button data-choice="0">
              <b>接受結局，停止翻本</b
              ><small>進入街頭乞丐結局。帳戶歸零，人生仍可以重新開始。</small></button
            ><button data-choice="1" ${E.loanLimit(s, "shark") < 10000 ? "disabled" : ""}>
              <b>再簽一張地下借條</b
              ><small>借最多 5 億，先扣 15%，每日息 10%，三天後催收。</small></button
            ><button data-choice="2" ${!organ ? "disabled" : ""}>
              <b>${organ ? "交出" + organ.name + "，繼續撐" : "可交易的部件已用完"}</b
              ><small
                >${organ ? "換取 " + money(organ.price) + "。健康 −" + organ.damage + "，永久上限 " + organ.cap + "。" + (s.health <= organ.damage ? "這會觸發死亡結局。" : "代價不可逆。") : "你已沒有這種退路。"}</small
              >
            </button>
          </div>`,
      );
    }
  }
  function showGlitch() {
    clearTimeout(glitchTimer);
    busy = true;
    $("glitch-screen").hidden = false;
    stopEffects();
    $("glitch-text").textContent =
      s.pending && s.pending.shownProfit > 0
        ? "你剛才賺了 " + money(s.pending.shownProfit) + "。想收回來的時候，平台剛好壞掉。"
        : "平台正在維修。你想跑，卻暫時沒有賣出按鈕。";
    render();
  }
  function reconnect() {
    if (!s.pending || s.pending.type !== "glitch") return;
    const before = E.equity(s),
      r = E.resolveGlitch(s);
    busy = false;
    $("glitch-screen").hidden = true;
    render();
    feedback(E.equity(s) - before, "假斷線恢復了。可是價格已經朝你不希望的方向走了。");
    toast(r.message, true);
    if (s.ended) ending();
    else if (s.pending) pendingScreen();
  }
  function ending() {
    stopEffects();
    busy = false;
    $("glitch-screen").hidden = true;
    const death = s.endType === "death",
      eq = E.equity(s);
    modal(
      "end",
      `<div class="${death ? "ending-death" : ""}"><div class="modal-kicker">${death ? "結局 02 · 透支生命" : "結局 01 · 街頭乞丐"}</div><div class="end-avatar">${death ? "🪦" : "🧎"}</div><h2>${death ? "最後一個通知，你沒能按下。" : "你終於不用再盯著盤了。"}</h2><p style="line-height:1.8;color:var(--muted)">${esc(s.endReason)}</p><div class="end-values"><div><small>剩下的身家</small><b class="negative">${money(eq)}</b></div><div><small>活了多久</small><b>${s.day} 天</b></div><div><small>健康與壓力</small><b>${Math.ceil(s.health)} / ${Math.round(s.stress)}</b></div><div><small>失去的部件</small><b>${s.organs.length} 個</b></div><div><small>爆倉次數</small><b>${s.liquidations} 次</b></div><div><small>欠下的錢</small><b>${money(s.debt)}</b></div></div><div class="modal-box">結局是刻意安排的黑色幽默，不是現實投資或醫學判斷。真正要帶走的，是對「借錢翻本、保證獲利、拿健康換下注」的警惕。</div><div class="modal-actions"><button class="ghost" data-action="dismiss">看看最後的帳戶</button><button class="ghost" data-action="report">匯出人生戰報</button><button class="primary" data-action="new-life">重開一段人生</button></div></div>`,
    );
  }
  function helpModal() {
    modal(
      "help",
      /* HTML */ `<div class="modal-kicker">不必會炒股，先懂這六件事</div>
        <h2>用遊戲的方式看帳戶。</h2>
        <div class="modal-box">
          <strong>1. 挑一張卡</strong>：卡片下方顯示今天漲跌。選中的卡會有黃色邊框。<br /><strong
            >2. 決定方向</strong
          >：猜漲盼價格上升；猜跌盼價格下降，猜跌要開放大模式。<br /><strong>3. 決定金額</strong
          >：輸入 1 = 1 億；普通買股先練，全部梭哈會預留平台費。<br /><strong
            >4. 買進，看盤中漲跌</strong
          >：買進移動資金後，全天 24 小時，每 1 秒推進 5
          分鐘虛構行情，午夜自動換日，可隨時賣掉。「過一天」會結算當日剩餘行情，扣生活費與利息並推進一天。<br /><strong
            >5. 看持有卡，再賣掉</strong
          >：卡片寫現在賺／賠多少；賣掉才把剩餘錢放回口袋。<br /><strong
            >6. 照顧身體、處理借條</strong
          >：看健康、壓力與到期日，事件出現時必須先選擇。
        </div>
        <div class="modal-box">
          <strong>7. 打工</strong>：收銀找零、包裹分區、咖啡出單，完成所有操作才發薪。<br /><strong
            >8. 賭桌</strong
          >：骰子先猜大小再搖；21
          點選要牌或停牌；九宮格點安全格後可收手。莊家偏向自己，越玩風險越高。<br /><strong
            >9. 身體</strong
          >：點角色或「檢查我的身體」，選部位查看狀態與失去紀錄。<br /><strong>10. 暫停</strong
          >：說明、事件、工作、賭局、背景頁面會暫停；狀態列會告訴你怎麼恢復。
        </div>
        <p>
          身家 = 口袋現金 + 你買的東西現在還值多少 − 欠款。彩色代表剛賺到；紅屏代表虧了。404
          是遊戲內假斷線，不是真實錯誤。
        </p>
        <div class="modal-box">
          普通買股：跟著價格漲跌。放大模式：例如 100 倍，約 1%
          反向波動就可能歸零，盤中先爆倉就回不來。三天賭局：本遊戲的簡化選擇權，不是真實定價模型；到期時間價值消失。
        </div>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">我明白了</button
          ><button class="primary" data-action="start-lesson">再跟著手指練一輪</button>
        </div>`,
    );
  }
  function healthHelp() {
    if (lesson) {
      toast("健康歸零會死亡；壓力會加快耗損；已失去的部件不能恢復。");
      lessonAction("health");
      return;
    }
    modal(
      "health",
      /* HTML */ `<div class="modal-kicker">錢輸掉能再開局，身體也要看</div>
        <h2>健康 ${Math.ceil(s.health)}，壓力 ${Math.round(s.stress)}。</h2>
        <p>
          每過一天，健康會下降；壓力越高、日子越後面，耗損越快。爆倉、借高利貸和催收會讓壓力上升。
        </p>
        <div class="modal-box">
          <strong>休息一天</strong>：通常健康 +14；失去肺或骨髓時 +9。壓力 −25，支付 500
          萬遊戲費用。市場與利息仍然結算；當天其他損耗也會先扣，所以不是淨增加 14。<br /><strong
            >打工補錢</strong
          >：收銀、包裹分揀、咖啡出單，親手完成所有任務才領薪水；一天一班。離開頁面後任務仍保存，回來可續做。<br /><strong
            >身體合約</strong
          >：一個部件只能失去一次，永久健康上限下降。生存核心會直接讓你走到死亡結局。<br /><strong
            >健康歸零</strong
          >：停止交易，進入猝死結局。
        </div>
        <p>這些健康、傷害、部件、價格是虛構遊戲規則，不是醫學描述、建議或實際器官交易資訊。</p>
        <div class="modal-actions">
          <button class="primary" data-action="dismiss">好，先留意身體</button>
        </div>`,
    );
  }
  function chartHelp() {
    modal(
      "chart-help",
      /* HTML */ `<div class="modal-kicker">不用懂 K 線，也能玩</div>
        <h2>只看兩件事：方向，和你手上的錢。</h2>
        <p>
          全天每 1 秒走 5 分鐘，00:00 到 24:00，午夜自動換日
          收盤；價格就是買賣與損益使用的報價。手動暫停、打工、劇情、切到背景頁面時不跑行情。按過一天會快轉剩餘行情，並扣生活費和利息。橫向是時間，越右邊越接近你選的那天結尾。線往上代表價格變高，往下代表變低。猜漲的人希望往上，猜跌的人希望往下。
        </p>
        <div class="modal-box">
          商品百分比是它<strong>今天比昨天</strong>的漲跌。持有卡的損益則是<strong>現在和你買進時</strong>相比，還扣了放大費。兩個數字不同是正常的。<br />「我的身家」是你的整體淨值，已扣掉欠款。不是只有某一支股票。<br />用「盤中／近
          5
          天／全部紀錄」切換範圍，拖動「回看」選日期，或按左右箭頭往前翻。電腦移動滑鼠，手機按住或滑動即可看該點時間與價格；也能聚焦圖表後用左右鍵。結局後所有紀錄都保留，可從頁尾下載完整
          CSV。
        </div>
        <div class="modal-actions">
          <button class="primary" data-action="dismiss">回去看看那條線</button>
        </div>`,
    );
  }
  function report() {
    const r = rank();
    let text = `百億炒股人生 1.2 — 人生戰報\n全虛構黑色幽默遊戲，不是真實財務或醫學紀錄。\n\n第 ${s.day} 天 / 最多 60 天\n角色：${s.playerName} · ${r.name}\n身家：${money(E.equity(s))}\n口袋：${money(s.cash)}\n欠款：${money(s.debt)}\n巔峰：${money(s.peak)}\n健康：${Math.ceil(s.health)} / ${s.healthCap}\n壓力：${Math.round(s.stress)} / 100\n名譽：${s.reputation} / 100\n催收輪數：${s.collectionCount}\n強行抵債部件：${s.seizedCount}\n賭局：${s.gambleStats.rounds} 局\n賭局累計損益：${money(s.gambleStats.net)}\n打工班數：${s.jobsDone}\n打工總收入：${money(s.workIncome)}\n失去的部件：${s.organs.map((id) => E.ORGANS.find((x) => x.id === id).name).join("、") || "沒有"}\n借條：${s.loans.length} 張\n爆倉：${s.liquidations} 次\n假斷線：${s.glitches} 次\n成就：${s.achievements.length} / ${E.ACHIEVEMENTS.length}\n結局：${s.endReason || "仍在進行"}\n\n完整人生紀錄\n${[
      ...s.logs,
    ]
      .reverse()
      .map((l) => "第 " + l.day + " 天：" + l.text)
      .join("\n")}\n`;
    const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "百億炒股人生1.2_第" + s.day + "天戰報.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("這段人生已匯出。");
  }
  function resetPrompt() {
    modal(
      "reset",
      /* HTML */ `<div class="modal-kicker">新的人生，舊的誘惑</div>
        <h2>重開後，再從 100 億開始。</h2>
        <p>目前進度會被取代。可以先匯出戰報，再重新跟著手指完成練習。不同人生的虛構波動會改變。</p>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">先留著這一局</button
          ><button class="ghost" data-action="report">匯出戰報</button
          ><button class="primary" data-action="new-life">確定重開</button>
        </div>`,
    );
  }
  function newLife() {
    stopEffects();
    busy = false;
    lesson = false;
    formalBackup = null;
    $("coach-layer").hidden = true;
    $("glitch-screen").hidden = true;
    dismiss(true);
    s = E.create();
    unlocked = false;
    loaded = false;
    prefs.tutorialDone = false;
    selected = "sky";
    filter = "stock";
    sectorKind = "";
    sector = "all";
    assetSearch = "";
    $("asset-search").value = "";
    product = "spot";
    direction = "long";
    chartMode = "price";
    chartDay = null;
    chartPeriod = "day";
    chartHover = null;
    tab = "positions";
    $("amount").value = "1";
    $("leverage").value = 0;
    try {
      localStorage.removeItem(SAVE);
    } catch {}
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    nameModal();
  }
  function setProduct(p) {
    product = p;
    if (p === "spot") direction = "long";
    if (p === "option" && Number($("leverage").value) === 0) $("leverage").value = 3;
    renderOrder();
  }
  function trade() {
    const amt = amount(),
      l = leverage();
    if (!Number.isFinite(amt) || amt < 10000) {
      toast("請輸入至少 0.0001 億的有效金額。", true);
      return;
    }
    if (amt + E.orderFee(amt, l, product) > s.cash + 0.00001) {
      toast("口袋不夠：投入金額還要加平台費。", true);
      return;
    }
    const perform = () => {
      const r = E.open(s, { asset: selected, amount: amt, leverage: l, product, direction });
      after(r);
      if (r.ok) lessonAction("buy");
    };
    if (l >= 25 && !lesson) {
      modal(
        "trade-confirm",
        /* HTML */ `<div class="modal-kicker">${l} 倍 · 把輸贏一起放大</div>
          <h2>這 ${money(amt)}，可能一天就沒了。</h2>
          <p>
            只要約 ${100 / l}% 反向波動，就可能把投入全吃掉。即使收盤方向猜對，中途也能先被清算。
          </p>
          <div class="modal-actions">
            <button class="ghost" data-action="dismiss">調低一點</button
            ><button id="confirm-trade" class="primary">我知道，買下去</button>
          </div>`,
      );
      $("confirm-trade").addEventListener(
        "click",
        () => {
          dismiss(true);
          perform();
        },
        { once: true },
      );
    } else perform();
  }
  // Capture phase enforces real tutorial steps. Only the indicated control can act.
  document.addEventListener(
    "click",
    (event) => {
      if (!lesson) return;
      const b = event.target.closest("button");
      if (!b) return;
      if (b.dataset.action === "skip-lesson") return;
      if ($("modal").open) {
        if (["finish-lesson", "skip-lesson", "lesson-next"].includes(b.dataset.action)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const target = guideTarget();
      if (!target || !(target === b || target.contains(b))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast("先跟著手指完成這一步。");
      }
    },
    true,
  );
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.asset) {
      selected = b.dataset.asset;
      renderAssets();
      renderMarket();
      renderOrder();
      lessonAction("asset");
    }
    if (b.dataset.filter) {
      filter = b.dataset.filter;
      selected = E.ASSETS.find((a) => a.kind === filter).id;
      renderAssets();
      renderMarket();
      renderOrder();
    }
    if (b.dataset.direction) {
      direction = b.dataset.direction;
      renderOrder();
      lessonAction("direction");
    }
    if (b.dataset.product) setProduct(b.dataset.product);
    if (b.dataset.budget) {
      $("amount").value = b.dataset.budget;
      renderOrder();
      lessonAction("budget");
    }
    if (b.dataset.percent) {
      const max = s.cash / (1 + E.orderFee(1, leverage(), product));
      $("amount").value = (Math.floor((max * Number(b.dataset.percent)) / 10000) / 10000).toFixed(
        4,
      );
      renderOrder();
    }
    if (b.dataset.chart) {
      chartMode = b.dataset.chart;
      chartHover = null;
      renderChart();
    }
    if (b.dataset.period) {
      chartPeriod = b.dataset.period;
      chartHover = null;
      renderChart();
    }
    if (b.dataset.job) {
      const r = E.work(s, b.dataset.job);
      if (r.ok) {
        render();
        jobScreen();
      } else toast(r.message, true);
    }
    if (b.dataset.jobAnswer !== undefined) {
      const r = E.jobInput(s, b.dataset.jobAnswer);
      render();
      if (r.completed) {
        dismiss(true);
        after(r);
        feedback(r.pay, "這次靠自己的雙手領到薪水。");
      } else jobScreen(r.message);
    }
    if (b.dataset.setting) {
      prefs[b.dataset.setting] = !prefs[b.dataset.setting];
      render();
      settingsModal();
    }
    if (b.dataset.jump) {
      const selectors = {
        market: ".market-panel",
        order: ".order-panel",
        body: ".character-panel",
        holdings: ".holdings-panel",
      };
      document
        .querySelector(selectors[b.dataset.jump])
        .scrollIntoView({ block: "start", behavior: prefs.effects ? "smooth" : "instant" });
    }
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      renderPortfolio();
    }
    if (b.dataset.close) {
      const r = E.close(s, Number(b.dataset.close));
      after(r);
      if (r.ok) lessonAction("sell");
    }
    if (b.dataset.loanType) {
      loanType = b.dataset.loanType;
      renderLoanModal();
    }
    if (b.dataset.bodyPart) bodyDetail(b.dataset.bodyPart);
    if (b.dataset.bodyZone) bodyModal(b.dataset.bodyZone);
    if (b.dataset.organ) confirmOrgan(b.dataset.organ);
    if (b.dataset.confirmOrgan) {
      const r = E.sellOrgan(s, b.dataset.confirmOrgan);
      if (r.ok) {
        dismiss(true);
        render();
        feedback(-1, "失去的部件，不會因為回本而回來。", "organ");
        if (s.ended) ending();
      } else toast(r.message, true);
    }
    if (b.dataset.choice !== undefined) {
      const before = {
          health: s.health,
          reputation: s.reputation,
          cash: s.cash,
          organs: [...s.organs],
        },
        wasDebt = s.pending?.type === "debt";
      const r = E.choose(s, Number(b.dataset.choice));
      if (r.ok) {
        dismiss(true);
        after(r);
        if (wasDebt && !s.ended && !s.pending) {
          collectionAfter(before);
          if (s.health < before.health || s.reputation < before.reputation)
            feedback(
              -1,
              "這次輸掉的不只有錢。",
              s.organs.length > before.organs.length ? "organ" : "",
            );
        }
      } else toast(r.message, true);
    }
    if (b.dataset.contractAck && contractDraft) {
      contractDraft[b.dataset.contractAck === "id" ? "idAck" : "contactsAck"] =
        !contractDraft[b.dataset.contractAck === "id" ? "idAck" : "contactsAck"];
      contractModal();
    }
    if (b.dataset.debtReply) {
      const r = E.collectorReply(s, b.dataset.debtReply);
      if (r.ok) {
        render();
        beep(true);
        collectionModal();
      } else toast(r.message, true);
    }
    if (b.dataset.casinoMode) {
      if ($("casino-stake")) casinoStake = $("casino-stake").value;
      casinoType = b.dataset.casinoMode;
      casinoModal();
    }
    if (b.dataset.gambleAction) {
      const r = E.gambleAction(
        s,
        b.dataset.gambleAction,
        b.dataset.mineIndex === undefined ? undefined : Number(b.dataset.mineIndex),
      );
      if (r.ok) {
        render();
        if (r.completed) {
          dismiss(true);
          feedback(r.net, r.message);
          if (s.ended) ending();
          else if (s.pending) pendingScreen();
          else gambleResult();
        } else gambleScreen();
      } else toast(r.message, true);
    }
    const a = b.dataset.action;
    if (a === "choose-name") chooseName();
    if (a === "cancel-contract") {
      contractDraft = null;
      loanModal();
    }
    if (a === "sign-contract") signContract();
    if (a === "open-phone") phoneModal();
    if (a === "friend-support") {
      const r = E.support(s);
      render();
      phoneModal();
      toast(r.message, !r.ok);
    }
    if (a === "casino-again") casinoModal();
    if (a === "start-gamble") {
      casinoStake = $("casino-stake").value;
      const r = E.startGamble(s, casinoType, Number(casinoStake) * 1e8);
      if (r.ok) {
        render();
        gambleScreen();
      } else toast(r.message, true);
    }
    if (a === "pause-gamble") {
      dismiss(true);
      render();
      toast("本局已保留；回遊戲館繼續。結束前不能交易或過一天。");
    }
    if (a === "pause-work") {
      dismiss(true);
      render();
      toast("任務已保留；按打工繼續。工作完成前不能交易或過一天。");
    }
    if (a === "quit-work") {
      E.quitWork(s);
      dismiss(true);
      render();
      toast("放棄這班，沒有發薪。");
    }
    if (a === "dismiss") dismiss();
    if (a === "start-lesson") {
      if (!s.named) nameModal();
      else startLesson();
    }
    if (a === "finish-lesson") finishLesson();
    if (a === "skip-lesson") {
      if (!s.named) {
        nameModal();
      } else finishLesson(true);
    }
    if (a === "lesson-next") {
      dismiss(true);
      lessonAction(LESSONS[lessonStep].key);
    }
    if (a === "open-repay") repayModal();
    if (a === "report") report();
    if (a === "new-life") newLife();
    if (a === "back-organs") organModal();
    if (a === "back-body") bodyModal();
    if (a === "effects") {
      prefs.effects = !prefs.effects;
      save();
      document.body.classList.toggle("reduced-effects", !prefs.effects);
      welcome();
    }
    if (a === "borrow") {
      const amt = Number($("loan-amount").value) * 1e8;
      if (loanType !== "bank") {
        contractDraft = { amount: amt, type: loanType, idAck: false, contactsAck: false };
        contractModal();
      } else {
        const r = E.borrow(s, amt, loanType);
        if (r.ok) {
          dismiss(true);
          after(r);
        } else toast(r.message, true);
      }
    }
    if (a === "repay") {
      const r = E.payDebt(s, Number($("repay-amount").value) * 1e8);
      if (r.ok) {
        dismiss(true);
        after(r);
      } else toast(r.message, true);
    }
  });
  $("trade-button").addEventListener("click", trade);
  $("amount").addEventListener("input", () => {
    if (lesson) {
      $("amount").value = "1";
    }
    renderOrder();
  });
  $("leverage").addEventListener("input", () => {
    if (lesson) $("leverage").value = 0;
    renderOrder();
  });
  $("next-button").addEventListener("click", () => advance());
  $("skip-button").addEventListener("click", () => advance(5));
  $("rest-button").addEventListener("click", () => advance(1, true));
  $("work-button").addEventListener("click", jobsModal);
  $("loan-button").addEventListener("click", () => {
    if (lesson) lessonAction("loan");
    else loanModal();
  });
  $("repay-button").addEventListener("click", repayModal);
  $("organ-button").addEventListener("click", organModal);
  $("body-button").addEventListener("click", () => bodyModal());
  $("avatar").addEventListener("click", () => bodyModal());
  $("health-help").addEventListener("click", healthHelp);
  $("help-button").addEventListener("click", helpModal);
  $("chart-help").addEventListener("click", chartHelp);
  $("report-button").addEventListener("click", report);
  $("reset-button").addEventListener("click", resetPrompt);
  $("close-all").addEventListener("click", () => {
    modal(
      "close-all",
      /* HTML */ `<div class="modal-kicker">把剩下的錢放回口袋</div>
        <h2>全部賣掉？</h2>
        <p>
          你買的東西現在共值 ${money(E.positionTotal(s))}。賣掉會扣一點平台費，剩下的錢收回現金。
        </p>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">再等等</button
          ><button id="confirm-close" class="primary">全部賣掉</button>
        </div>`,
    );
    $("confirm-close").addEventListener(
      "click",
      () => {
        dismiss(true);
        after(E.closeAll(s));
      },
      { once: true },
    );
  });
  $("temptation-leverage").addEventListener("click", () => {
    selected = "future";
    filter = "risk";
    product = "margin";
    direction = "long";
    $("leverage").value = 6;
    $("amount").value = (
      Math.floor((s.cash * 0.1) / (1 + E.orderFee(1, 100, "margin")) / 10000) / 10000
    ).toFixed(4);
    renderAssets();
    renderMarket();
    renderOrder();
    document.querySelector(".order-panel").scrollIntoView({ block: "center", behavior: "smooth" });
    toast("只設定了 100 倍，還沒買。你還能反悔。");
  });
  $("temptation-mystery").addEventListener("click", () => {
    modal(
      "mystery",
      /* HTML */ `<div class="modal-kicker">朋友說：上市一定十倍</div>
        <h2>拿 1 億，信一次朋友？</h2>
        <p>前期偶爾有獲利，大部分拿不回多少；後期甚至一毛都沒了。每天只能玩一次。</p>
        <div class="modal-actions">
          <button class="ghost" data-action="dismiss">今天先不信</button
          ><button id="confirm-mystery" class="primary">花 1 億，開獎</button>
        </div>`,
    );
    $("confirm-mystery").addEventListener(
      "click",
      () => {
        dismiss(true);
        const before = E.equity(s),
          r = E.mystery(s);
        after(r, { visual: r.ok, delta: E.equity(s) - before });
      },
      { once: true },
    );
  });
  $("sound-button").addEventListener("click", () => {
    prefs.sound = !prefs.sound;
    beep();
    render();
  });
  $("motion-button").addEventListener("click", () => {
    prefs.effects = !prefs.effects;
    render();
    toast(prefs.effects ? "彩色與紅屏特效已開啟。" : "已改用溫和、無動畫的色彩提示。");
  });
  $("reconnect-button").addEventListener("click", reconnect);
  $("skip-glitch-button").addEventListener("click", reconnect);
  $("modal").addEventListener("cancel", (event) => {
    if (lesson || ["event", "debt", "survival", "welcome", "name", "gamble"].includes(modalType)) {
      event.preventDefault();
      toast(lesson ? "可按「跳過說明」直接開始，或繼續跟著手指。" : "請先做出選擇。");
    } else {
      modalType = "";
      renderChart();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.code === "Space" &&
      !event.repeat &&
      !$("modal").open &&
      !busy &&
      !lesson &&
      !["INPUT", "BUTTON", "TEXTAREA", "SELECT", "A"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      advance();
    }
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderChart();
      positionGuide();
    }, 100);
  });
  window.addEventListener(
    "scroll",
    () => {
      if (lesson) positionGuide();
    },
    { passive: true },
  );
  // Mobile keeps borrowing accessible even when the full loan list is collapsed.
  const shortcut = document.createElement("button");
  shortcut.id = "tutorial-loan-shortcut";
  shortcut.className = "purple-button mobile-loan-button";
  shortcut.textContent = "借錢再拚一次";
  document.querySelector(".character-panel").append(shortcut);
  shortcut.addEventListener("click", () => {
    if (lesson) lessonAction("loan");
    else loanModal();
  });
  const context = document.modelContext,
    life = new AbortController();
  if (context && typeof context.registerTool === "function") {
    const reg = (t) => {
      try {
        Promise.resolve(context.registerTool(t, { signal: life.signal })).catch(() => {});
      } catch {}
    };
    reg({
      name: "read_simulated_account",
      description:
        "Read the fictional character, game day, money, debt, health, stress, body parts and pending scene.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        playerName: s.playerName,
        reputation: s.reputation,
        gambling: !!s.gamble,
        day: s.day,
        equity: E.equity(s),
        cash: s.cash,
        debt: s.debt,
        health: s.health,
        stress: s.stress,
        organs: s.organs,
        pending: s.pending,
        ended: s.ended,
        practice: s.practice,
      }),
    });
    reg({
      name: "advance_simulated_trading_day",
      description:
        "Advance one fictional game day; requires finished or skipped onboarding and no open scene.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (
          !input ||
          Object.keys(input).length ||
          lesson ||
          !unlocked ||
          busy ||
          s.ended ||
          s.pending ||
          s.job ||
          s.gamble ||
          $("modal").open
        )
          return {
            ok: false,
            message: "Finish or skip onboarding, or complete the current scene.",
          };
        advance();
        return { ok: true, day: s.day, pending: s.pending, ended: s.ended };
      },
    });
    window.addEventListener("pagehide", () => life.abort(), { once: true });
  }
  $("asset-search").addEventListener("input", () => {
    assetSearch = $("asset-search").value;
    renderAssets();
  });
  $("sector-select").addEventListener("change", () => {
    sector = $("sector-select").value;
    renderAssets();
  });
  $("phone-button").addEventListener("click", phoneModal);
  $("casino-button").addEventListener("click", casinoModal);
  $("temptation-casino").addEventListener("click", casinoModal);
  $("settings-button").addEventListener("click", settingsModal);
  $("vision-assist").addEventListener("click", () => {
    prefs.visionAssist = !prefs.visionAssist;
    render();
  });
  $("history-export").addEventListener("click", exportHistory);
  $("market-pause").addEventListener("click", () => {
    prefs.marketPaused = !prefs.marketPaused;
    render();
  });
  $("chart").addEventListener("pointermove", inspectChart);
  $("chart").addEventListener("pointerdown", inspectChart);
  $("chart").addEventListener("pointerleave", () => {
    chartHover = null;
    renderChart();
  });
  $("chart").addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      chartHover = Math.max(
        0,
        Math.min(
          1,
          (chartHover === null ? 1 : chartHover) +
            (event.key === "ArrowLeft" ? -1 : 1) / Math.max(1, chartPoints.length - 1),
        ),
      );
      renderChart();
    }
  });
  $("chart-day").addEventListener("input", () => {
    chartDay = Number($("chart-day").value);
    chartPeriod = "day";
    chartHover = null;
    renderChart();
  });
  $("chart-prev").addEventListener("click", () => {
    chartDay = Math.max(1, (chartDay ?? s.day) - 1);
    chartPeriod = "day";
    chartHover = null;
    renderChart();
  });
  $("chart-next").addEventListener("click", () => {
    chartDay = Math.min(s.day, (chartDay ?? s.day) + 1);
    chartPeriod = "day";
    chartHover = null;
    renderChart();
  });
  $("chart-live").addEventListener("click", () => {
    chartDay = null;
    chartPeriod = "day";
    chartHover = null;
    renderChart();
  });
  document.addEventListener("visibilitychange", () => {
    interacting = false;
    renderChart();
  });
  document.addEventListener(
    "pointerdown",
    () => {
      interacting = true;
      interactionSince = Date.now();
    },
    { passive: true },
  );
  document.addEventListener(
    "pointerup",
    () => {
      interacting = false;
    },
    { passive: true },
  );
  document.addEventListener(
    "pointercancel",
    () => {
      interacting = false;
    },
    { passive: true },
  );
  window.addEventListener("blur", () => {
    interacting = false;
  });
  // 返回遊戲館時保存，不改變玩家原本的暫停偏好。
  window.addEventListener("akane-portal-pause", save);
  window.addEventListener("pagehide", save);
  function liveLoop() {
    const loopStarted = Date.now();
    if (
      (!interacting || Date.now() - interactionSince >= 2000) &&
      unlocked &&
      !lesson &&
      !s.practice &&
      !s.ended &&
      !s.pending &&
      !s.job &&
      !s.gamble &&
      !busy &&
      !prefs.marketPaused &&
      !document.hidden &&
      !window.akanePortalPaused &&
      !$("modal").open
    ) {
      const r = E.tick(s);
      if (r.ok) {
        render();
        if (s.pending && s.pending.type === "glitch") {
          busy = true;
          feedback(s.pending.shownProfit, "你正賺到錢，平台卻突然沒有回應……");
          glitchTimer = setTimeout(showGlitch, prefs.effects ? 1900 : 750);
        } else if (r.wiped) {
          feedback(r.delta, "盤中價格已觸發清算，這筆本金真的沒了。");
          lastLiveEffect = Date.now();
        } else if (
          s.positions.length &&
          Math.abs(r.delta) > 3e7 &&
          Date.now() - lastLiveEffect > 12000
        ) {
          feedback(r.delta, "盤中帳面損益，賣掉前還會變。");
          lastLiveEffect = Date.now();
        }
        if (s.ended) ending();
        else if (s.pending && s.pending.type !== "glitch") pendingScreen();
      }
    }
    setTimeout(liveLoop, Math.max(50, 1000 - (Date.now() - loopStarted)));
  }
  render();
  if (!s.named && !s.ended) nameModal();
  else if (!unlocked) welcome();
  else if (s.pending) pendingScreen();
  else if (s.ended) ending();
  else if (s.job) jobScreen();
  else if (s.gamble) gambleScreen();
  setTimeout(liveLoop, 1000);
})();
