/* 檔案導讀：管理大廳、音訊、手機搖桿與每幀更新；網站整合在檔案末尾的父頁訊息處理。 */
(function () {
  "use strict";
  let portalPaused = false;
  const S = window.Serpent,
    $ = (id) => document.getElementById(id),
    $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) =>
    `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const avatar = (char) =>
    `<span class="mini-snake" style="--c:${char.color}" aria-hidden="true"></span>`;
  const number = (n) => Math.floor(n).toLocaleString("zh-TW");
  const timeString = (t) =>
    `${Math.floor(t / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(t % 60)
      .toString()
      .padStart(2, "0")}`;
  const STORAGE_KEY = "neon-serpent-v1";
  let profile = S.defaultProfile(),
    storageAvailable = true;
  try {
    profile = S.sanitizeProfile(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (_) {
    storageAvailable = false;
  }
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const reduced = () =>
    profile.settings.reducedMotion || motionPreference.matches;
  let game = null,
    gameRenderer = null,
    previewRenderer = null,
    page = "lobby",
    modalType = null,
    focusBeforeModal = null;
  let rotation = 0,
    previewTime = 0,
    keys = new Set(),
    dashTouch = false,
    mouseDash = false,
    joystickAngle = null,
    pointer = null,
    pointerOrigin = null,
    steer = "keys";
  let camera = { x: 0, z: 0 },
    zoom = 1,
    shake = 0,
    hitStop = 0,
    hurtFlash = 0,
    screenFlash = null,
    texts = [],
    flashes = [],
    coilFlashes = [],
    bolts = [],
    bossCast = null,
    introTimer = 0;
  let bannerTimer = 0,
    toastTimer = 0,
    hudTimer = 0,
    mapTimer = 0,
    lastCombo = 0;
  let lastFrame = performance.now(),
    accumulator = 0,
    lastRender = 0,
    result = null,
    tutorial = null;
  const POWER_LABEL = {
    speed: "疾風",
    magnet: "磁暴",
    fury: "怒焰",
    shield: "護盾",
  };
  const POWER_SHORT = {
    speed: "速度 +30%・衝刺免費",
    magnet: "吸附範圍 +9",
    fury: "傷害 ×1.8・咬更快",
    shield: "擋下一次傷害",
    bomb: "吃下就爆炸 90 傷害",
    rainbow: "+250 分・經驗 +14",
  };
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      storageAvailable = true;
    } catch (_) {
      if (storageAvailable) toast("瀏覽器無法儲存進度，本次仍可正常遊玩。");
      storageAvailable = false;
    }
    $("wallet").textContent = number(profile.crystals);
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3300);
  }
  function banner(message, tone = "") {
    const b = $("run-banner");
    b.textContent = message;
    b.dataset.tone = tone;
    b.classList.remove("visible");
    void b.offsetWidth;
    b.classList.add("visible");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove("visible"), 2600);
  }
  function showBossIntro(e) {
    const el = $("boss-intro");
    el.style.setProperty("--boss", e.color || "#ff7a81");
    $("boss-intro-name").textContent = e.name || "首領";
    $("boss-intro-title").textContent = e.title || "";
    $("boss-intro-tip").textContent = e.tip || "";
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(introTimer);
    introTimer = setTimeout(() => el.classList.remove("show"), 3200);
    screenFlash = { color: e.color || "#ff7a81", life: 0.5, max: 0.5 };
    shake = Math.max(shake, motion(0.5));
    sound.note(55, 1.4, 0.2, "sawtooth", 0, 110);
    sound.note(110, 1.2, 0.1, "triangle", 0.2, 55);
  }
  class Sound {
    constructor() {
      this.ctx = null;
      this.musicAt = 0;
      this.step = 0;
      this.lastEat = 0;
      this.lastHit = 0;
    }
    init() {
      try {
        if (!this.ctx)
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      } catch (_) {}
    }
    note(freq, duration, volume = 0.1, type = "sine", delay = 0, slide = 0) {
      if (!profile.settings.sound || !this.ctx || this.ctx.state !== "running")
        return;
      const ctx = this.ctx,
        now = ctx.currentTime + delay,
        o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      if (slide)
        o.frequency.exponentialRampToValueAtTime(slide, now + duration);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(
        volume * profile.settings.volume,
        now + 0.008,
      );
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + duration + 0.03);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
    eat(type) {
      if (!this.ctx || this.ctx.currentTime - this.lastEat < 0.05) return;
      this.lastEat = this.ctx.currentTime;
      const big = type === "crystal" || type === "fruit";
      this.note(
        big ? 988 : 660 + ((game?.foodEaten || 0) % 5) * 70,
        0.12,
        0.14,
        "sine",
      );
      if (big) this.note(1480, 0.18, 0.07, "sine", 0.05);
    }
    click() {
      this.note(480, 0.07, 0.07, "sine", 0, 740);
    }
    bite() {
      this.note(340, 0.06, 0.05, "square", 0, 150);
    }
    hit(source) {
      if (!this.ctx || this.ctx.currentTime - this.lastHit < 0.04) return;
      this.lastHit = this.ctx.currentTime;
      if (source === "ram") {
        this.note(160, 0.14, 0.14, "square", 0, 60);
        this.note(90, 0.2, 0.1, "triangle", 0, 45);
      } else this.note(200, 0.08, 0.05, "triangle", 0, 70);
    }
    coil(n) {
      [392, 523, 659, 880].forEach((f, i) =>
        this.note(f, 0.35, 0.1, "triangle", i * 0.045),
      );
      if (n > 0) {
        this.note(110, 0.4, 0.18, "sawtooth", 0, 40);
        this.note(1318, 0.4, 0.08, "sine", 0.2);
      }
    }
    power() {
      [660, 880, 1320].forEach((f, i) =>
        this.note(f, 0.22, 0.1, "sine", i * 0.06),
      );
    }
    portal() {
      this.note(220, 0.45, 0.12, "sine", 0, 880);
      this.note(440, 0.35, 0.06, "triangle", 0.1, 1320);
    }
    boost() {
      this.note(300, 0.25, 0.07, "sawtooth", 0, 900);
    }
    cache() {
      [784, 988, 1175, 1568].forEach((f, i) =>
        this.note(f, 0.2, 0.08, "triangle", i * 0.05),
      );
    }
    shield() {
      this.note(900, 0.3, 0.1, "sine", 0, 300);
    }
    boom() {
      this.note(90, 0.5, 0.25, "triangle", 0, 40);
      this.note(60, 0.6, 0.14, "sawtooth", 0, 30);
    }
    skill() {
      this.note(130, 0.45, 0.18, "sawtooth", 0, 820);
      this.note(1046, 0.5, 0.08, "sine", 0.1);
    }
    hurt() {
      this.note(140, 0.22, 0.23, "triangle", 0, 48);
    }
    level() {
      [523, 659, 784, 1046].forEach((n, i) =>
        this.note(n, 0.3, 0.12, "sine", i * 0.08),
      );
    }
    end(win) {
      (win ? [523, 659, 784, 1046] : [330, 277, 220, 165]).forEach((n, i) =>
        this.note(n, 0.5, 0.12, "triangle", i * 0.14),
      );
    }
    music() {
      if (!this.ctx || !profile.settings.sound) return;
      const t = this.ctx.currentTime;
      if (t < this.musicAt) return;
      this.musicAt = t + 0.28;
      const scale = [0, 7, 12, 16, 7, 19, 12, 7, 0, 7, 12, 14, 7, 19, 14, 7],
        n = scale[this.step % scale.length];
      this.note(130.81 * Math.pow(2, n / 12), 0.48, 0.025, "sine");
      if (this.step % 8 === 0)
        this.note(this.step % 16 === 0 ? 65.4 : 55, 1.6, 0.06, "triangle");
      this.step++;
    }
  }
  const sound = new Sound();
  const HERO_SKILL_TAGS = [
    "+12 HP・6 秒強力吸附",
    "範圍爆破・蛇身燃燒 6 秒",
    "全場凍結 5 秒",
    "6 秒無敵・撞擊反傷",
  ];
  const HERO_TIPS = [
    "吸附範圍最大，收集最輕鬆，適合新手。",
    "傷害最高但血最少，主動衝進去打。",
    "先凍住敵人，再繞圈纏繞一網打盡。",
    "血最多，開護盾直接撞進敵群。",
  ];
  function setCharacter(index) {
    profile.selected = index;
    const c = S.CHARACTERS[index];
    $("model-number").textContent = `0${index + 1} / 04`;
    $("model-word").textContent = c.english;
    $("model-name").textContent = c.name;
    $("model-class").textContent = `${c.role} / ${c.title}`;
    $("model-flavor").textContent = c.flavor;
    $("role-tag").textContent = c.role;
    $("ability-name").innerHTML = `${c.skill} <kbd>E</kbd>`;
    $("ability-desc").textContent = c.description;
    $("ability-icon").innerHTML = `<use href="#i-${c.icon}"/>`;
    $("character-stats").innerHTML = ["靈巧", "生存", "吸附"]
      .map(
        (name, i) =>
          `<div class="stat-row"><span>${name}</span><div class="stat-meter"><span style="transform:scaleX(${c.stats[i] / 100});background:${c.color}"></span></div><b>${c.stats[i]}</b></div>`,
      )
      .join("");
    $("ability-meta").innerHTML = [
      `冷卻 ${c.cooldown} 秒`,
      "E／右鍵發動",
      HERO_SKILL_TAGS[index],
    ]
      .map((x) => `<li>${x}</li>`)
      .join("");
    $("hero-tip").innerHTML = `<b>玩法建議</b>${HERO_TIPS[index]}`;
    $("character-numbers").innerHTML = [
      [c.health, "HP", "初始生命"],
      [c.speed, "", "移動速度"],
      [c.cooldown, "秒", "技能冷卻"],
      [c.magnet, "m", "吸附距離"],
    ]
      .map(
        ([n, unit, label]) =>
          `<div><strong>${n}<small>${unit}</small></strong><span>${label}</span></div>`,
      )
      .join("");
    $$(".character-card").forEach((b, i) => {
      b.classList.toggle("selected", i === index);
      b.setAttribute("aria-pressed", String(i === index));
    });
    save();
  }
  function setWorld(index) {
    profile.world = index;
    $$(".world-card").forEach((b, i) => {
      b.classList.toggle("selected", i === index);
      b.setAttribute("aria-pressed", String(i === index));
    });
    $("world-count").textContent = `0${index + 1} — 03`;
    save();
  }
  function setMode(mode) {
    profile.mode = mode;
    $$(".mode-card").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === mode);
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    $("mode-objective").textContent = modeGoal(mode);
    $("difficulty-note").textContent =
      mode === "zen" ? "悠遊秘境沒有敵人，難度不影響。" : "";
    save();
  }
  function setDifficulty(id) {
    profile.difficulty = S.DIFFICULTIES[id] ? id : "normal";
    const d = S.DIFFICULTIES[profile.difficulty];
    $$(".difficulty-option").forEach((b) => {
      const on = b.dataset.difficulty === profile.difficulty;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
    $("difficulty-desc").textContent = d.desc;
    save();
  }
  function navigate(next) {
    page = next;
    $$(".nav-button").forEach((b) =>
      b.classList.toggle("active", b.dataset.nav === next),
    );
    $("main-lobby").classList.toggle("hidden", next !== "lobby");
    $("secondary-page").classList.toggle("hidden", next === "lobby");
    if (next === "lab") renderLab();
    if (next === "records") renderRecords();
  }
  function renderLab() {
    $("secondary-page").innerHTML =
      `<div class="page-intro"><p class="section-label">把每次冒險，化為下一次的力量。</p><h1>進化研究所</h1><p>使用遊玩獲得的晶體永久強化蛇靈。升級將在下一局生效，每項最多 5 級。</p></div><div class="lab-grid">${S.META.map(
        (m) => {
          const lv = profile.upgrades[m.id],
            price = m.base * (lv + 1);
          return `<article class="lab-card">${icon(m.icon)}<h2>${m.name}</h2><p>${m.description}</p><span class="role-tag">目前等級 ${lv} / 5</span><div class="lab-level">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lv ? "filled" : ""}"></i>`).join("")}</div><button class="primary-button" data-buy="${m.id}" ${lv >= 5 || profile.crystals < price ? "disabled" : ""}>${icon("diamond")}${lv >= 5 ? "已達最高等級" : `${price} 晶體 / ${profile.crystals < price ? "晶體不足" : "升級強化"}`}</button></article>`;
        },
      ).join(
        "",
      )}</div><p class="help-note">收集金色晶體、打破晶簇寶箱、累積得分、完成挑戰與成就，都能獲得晶體。悠遊秘境也能累積進度。</p>`;
    $$("[data-buy]").forEach(
      (b) =>
        (b.onclick = () => {
          if (S.buyUpgrade(profile, b.dataset.buy)) {
            save();
            sound.level();
            renderLab();
            toast("永久強化完成，下一局立即生效。");
          }
        }),
    );
  }
  function renderRecords() {
    const stats = [
      [number(profile.best), "歷史最高分"],
      [profile.runs, "完成冒險"],
      [number(profile.totalKills), "累計擊退"],
      [profile.wins, "挑戰完成"],
    ];
    $("secondary-page").innerHTML =
      `<div class="page-intro"><p class="section-label">每一道軌跡，都值得記住。</p><h1>冒險紀錄</h1></div><div class="record-stats">${stats.map(([n, label]) => `<div class="record-stat"><strong>${n}</strong><span>${label}</span></div>`).join("")}</div><div class="section-row"><h2>成就收藏</h2><span>${profile.achievements.length} / ${S.ACHIEVEMENTS.length}　每項獎勵 10 晶體</span></div><div class="achievement-grid">${S.ACHIEVEMENTS.map((a) => `<article class="achievement ${profile.achievements.includes(a.id) ? "earned" : ""}">${icon("trophy")}<div><h3>${a.name}${profile.achievements.includes(a.id) ? " ✓" : ""}</h3><p>${a.desc}</p></div></article>`).join("")}</div><div class="history"><h2>最近冒險</h2>${profile.history.length ? `<table><thead><tr><th>角色</th><th>模式 / 戰場</th><th>得分</th><th>時間</th><th>結果</th></tr></thead><tbody>${profile.history.map((r) => `<tr><td>${S.CHARACTERS[r.character].name}</td><td>${S.MODES[r.mode].name} / ${S.WORLDS[r.world].name}${r.mode === "zen" ? "" : ` / ${S.DIFFICULTIES[r.difficulty || "normal"].name}`}</td><td>${number(r.score)}</td><td>${timeString(r.time)}</td><td>${r.won ? "完成" : "已結算"}</td></tr>`).join("")}</tbody></table>` : '<p class="empty-note">還沒有冒險紀錄。選一隻蛇靈，展開你的第一趟旅程吧。</p>'}</div>`;
  }
  function resetInput() {
    keys.clear();
    dashTouch = false;
    mouseDash = false;
    joystickAngle = null;
    $("joystick").firstElementChild.style.transform = "";
  }
  // Menus that pop up mid-action (evolution, results) start "guarded": the dialog itself takes focus and
  // clicks / Space / Enter are ignored briefly, so a held dash key can never pick an option by accident.
  let modalGuardUntil = 0,
    guardTimer = 0,
    upgradeArmed = false;
  function showModal(type, html, wide = false, opts = {}) {
    if (!modalType) focusBeforeModal = document.activeElement;
    resetInput();
    modalType = type;
    $("modal").innerHTML = html;
    $("modal").classList.toggle("wide", wide);
    $("modal").dataset.type = type;
    $("modal-backdrop").classList.remove("hidden");
    $("lobby").inert = true;
    $("game-screen").inert = true;
    const guard = opts.guard || 0;
    modalGuardUntil = performance.now() + guard;
    upgradeArmed = false;
    $("modal").classList.toggle("guarding", guard > 0);
    $("modal").style.setProperty("--guard", `${guard}ms`);
    clearTimeout(guardTimer);
    if (guard)
      guardTimer = setTimeout(
        () => $("modal").classList.remove("guarding"),
        guard,
      );
    requestAnimationFrame(() => {
      if (opts.guard) {
        $("modal").focus();
        return;
      }
      const focusable = $("modal").querySelector(
        "button:not(:disabled),select,input",
      );
      (focusable || $("modal")).focus();
    });
  }
  const guarded = () => performance.now() < modalGuardUntil;
  function closeModal() {
    modalType = null;
    $("modal-backdrop").classList.add("hidden");
    $("lobby").inert = false;
    $("game-screen").inert = false;
    if (focusBeforeModal?.isConnected && !focusBeforeModal.closest(".hidden"))
      focusBeforeModal.focus();
    focusBeforeModal = null;
  }
  function help(topic = "start", fromPause = false) {
    sound.init();
    const inRun = !!game && !game.over;
    if (inRun) game.paused = true;
    const selected = SerpentGuide.topics.some(([id]) => id === topic)
      ? topic
      : "start";
    showModal(
      "help",
      `<button class="icon-button modal-close" id="close-help" aria-label="關閉規則">${icon("close")}</button><h2 id="modal-title">霓境蛇行・玩法手冊</h2><p class="modal-subtitle">三個按鍵就能玩：移動、衝刺、技能。咬擊會自動發動。${inRun ? "閱讀中：遊戲與倒數已暫停。" : ""}</p><div class="guide-tabs" role="tablist" aria-label="規則章節">${SerpentGuide.topics.map(([id, label]) => `<button role="tab" id="tab-${id}" aria-selected="${id === selected}" aria-controls="guide-content" tabindex="${id === selected ? 0 : -1}" data-topic="${id}">${label}</button>`).join("")}</div><div id="guide-content" class="guide-content" role="tabpanel" tabindex="0" aria-labelledby="tab-${selected}">${SerpentGuide.content(selected)}</div><div class="modal-actions">${!inRun ? '<button class="primary-button" id="guide-practice">進入八步無傷練習</button>' : ""}<button class="${inRun ? "primary" : "secondary"}-button" id="help-done">${inRun ? "返回暫停選單" : "返回大廳"}</button></div>`,
      true,
    );
    const finish = () =>
      game && !game.over && game.needsUpgrade
        ? showUpgrades()
        : inRun || fromPause
          ? pauseMenu()
          : closeModal();
    $("close-help").onclick = $("help-done").onclick = finish;
    if ($("guide-practice"))
      $("guide-practice").onclick = () => startGame(true);
    const tabs = $$("[data-topic]");
    function selectTopic(id, focus = true) {
      tabs.forEach((b) => {
        const on = b.dataset.topic === id;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
      });
      $("guide-content").innerHTML = SerpentGuide.content(id);
      $("guide-content").setAttribute("aria-labelledby", `tab-${id}`);
      $("guide-content").scrollTop = 0;
      if (focus) tabs.find((b) => b.dataset.topic === id).focus();
    }
    tabs.forEach((b, i) => {
      b.onclick = () => selectTopic(b.dataset.topic);
      b.onkeydown = (e) => {
        let next = i;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft")
          next = (i + tabs.length - 1) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        else return;
        e.preventDefault();
        selectTopic(tabs[next].dataset.topic);
      };
    });
    requestAnimationFrame(() =>
      tabs.find((b) => b.dataset.topic === selected)?.focus(),
    );
  }
  // ---------- Pre-run briefing: everything you will meet this run, before you start ----------
  const briefIcon = {
    chest: (c) =>
      `<svg viewBox="0 0 32 32"><rect x="5" y="13" width="22" height="13" rx="2" fill="#7a4a26" stroke="${c}"/><path d="M5 14c0-6 22-6 22 0" fill="#8f5a2e" stroke="${c}"/><path d="M12 9v17M20 9v17" stroke="${c}" stroke-width="2"/><rect x="14" y="16" width="4" height="5" fill="${c}" stroke="none"/></svg>`,
    spring: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#123a33" stroke="${c}" stroke-width="2.5"/><path d="M16 12v12M10 18h12" stroke="#bfffe9" stroke-width="3"/></svg>`,
    pad: (c) =>
      `<svg viewBox="0 0 32 32"><rect x="4" y="9" width="24" height="15" rx="2" fill="#33402a" stroke="${c}"/><path d="m9 12 5 4.5-5 4.5M15 12l5 4.5-5 4.5M21 12l4 4.5-4 4.5" stroke="${c}" stroke-width="2"/></svg>`,
    portal: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="9" cy="17" r="6" fill="none" stroke="#c49bff" stroke-width="2.5"/><circle cx="23" cy="17" r="6" fill="none" stroke="#c49bff" stroke-width="2.5"/><path d="M13 13c2-3 4-3 6 0" stroke="${c}" stroke-dasharray="2 2"/></svg>`,
    zone: (c) =>
      `<svg viewBox="0 0 32 32"><path d="M5 18c0-7 8-10 13-8s10 3 9 9-9 8-14 7-8-3-8-8Z" fill="${c}" fill-opacity=".45" stroke="${c}"/></svg>`,
    rock: (c) =>
      `<svg viewBox="0 0 32 32"><path d="m6 24 4-12 7-5 8 6 2 11Z" fill="#46564f" stroke="${c}"/><path d="M14 28h6M17 7V3" stroke="${c}"/></svg>`,
    circle: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/><circle cx="16" cy="16" r="6" fill="${c}" fill-opacity=".55" stroke="none"/></svg>`,
    line: (c) =>
      `<svg viewBox="0 0 32 32"><path d="M4 22 28 10" stroke="${c}" stroke-width="6" stroke-opacity=".35"/><path d="M4 22 28 10" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/></svg>`,
    pool: (c) =>
      `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="19" rx="12" ry="8" fill="${c}" fill-opacity=".35" stroke="${c}"/><circle cx="12" cy="15" r="2" stroke="${c}"/><circle cx="19" cy="12" r="1.5" stroke="${c}"/></svg>`,
    ring: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="${c}" stroke-width="3"/><circle cx="16" cy="16" r="5" fill="none" stroke="${c}" stroke-opacity=".5"/></svg>`,
    laser: (c) =>
      `<svg viewBox="0 0 32 32"><path d="M4 26 28 6" stroke="${c}" stroke-width="7" stroke-opacity=".3" stroke-linecap="round"/><path d="M4 26 28 6" stroke="#fff" stroke-width="2"/></svg>`,
    bullet: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="20" cy="14" r="5" fill="${c}" stroke="none"/><path d="M5 23 15 17" stroke="${c}" stroke-opacity=".5" stroke-width="3"/></svg>`,
    head: (c) =>
      `<svg viewBox="0 0 32 32"><circle cx="12" cy="16" r="8" fill="#a0f0ba" stroke="none"/><path d="m24 9 5 7-5 7-5-7Z" fill="${c}" stroke="none"/></svg>`,
  };
  // ---------- 遊戲說明: five short visual pages, opened from the lobby or the pause menu ----------
  const ENEMY_TIPS = {
    chaser: "直直衝過來",
    serpent: "頭和身體都能咬",
    ranged: "保持距離射擊",
    swarm: "成群出現，繞圈清掉",
    splitter: "打倒後會分裂",
    charger: "紅線亮起就閃開",
    bomber: "閃爍時快離開",
    shield: "正面擋咬，用撞的",
    healer: "會幫隊友補血，先打它",
    sniper: "紅色雷射＝要開槍",
  };
  const GUIDE_PAGES = [
    ["play", "怎麼玩"],
    ["map", "地圖"],
    ["danger", "危險"],
    ["items", "食物道具"],
    ["foes", "敵人首領"],
  ];
  function guidePage(id, inRun) {
    const mode = inRun ? game.mode : profile.mode,
      world = S.WORLDS[inRun ? game.world : profile.world],
      d = S.DIFFICULTIES[inRun ? game.difficulty : profile.difficulty],
      ch = inRun ? game.character : S.CHARACTERS[profile.selected];
    const card = (art, title, text, tone = "") =>
      `<article class="gg-card ${tone}"><i class="gg-art">${art}</i><b>${title}</b><span>${text}</span></article>`;
    const svg = (name) =>
      `<svg viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
    const dot = (color) => `<em class="gg-dot" style="--c:${color}"></em>`;
    if (id === "play")
      return `<p class="gg-lead">這局目標：${S.MODES[mode].goal}</p><div class="gg-cards">${card(svg("arrow"), "移動", "滑鼠或 WASD，蛇會一直往前")}${card(svg("bolt"), "衝刺 Space／左鍵", "撞到敵人 70 傷害")}${card(svg(ch.icon), `技能 E／右鍵`, `${ch.skill}，冷卻後可再用`)}${card(svg("target"), "自動咬擊", "敵人在頭前方就會咬")}${card(svg("snake"), "繞圈絞殺", "頭碰到身體，圈內敵人重創")}${card(briefIcon.head("#ff7a81"), "只有頭會受傷", "身體被碰到不扣血", "bad")}</div>`;
    if (id === "map")
      return `<p class="gg-lead ok">這些都 <b>不會扣血</b>，放心靠近。</p><div class="gg-cards">${card(briefIcon.chest("#f2c14e"), "寶箱", "打破掉能量、晶體、道具")}${card(briefIcon.spring("#7ef0c8"), "治癒泉", "站進去每秒回 9 HP")}${card(briefIcon.pad("#d9f77b"), "加速板", "踩過去短暫加速")}${card(briefIcon.portal("#7fd1ff"), "傳送門", "同顏色兩座互通")}${card(briefIcon.zone(world.zone.accent), world.zone.name, world.zone.effect)}${card(briefIcon.rock("#8aa39c"), "岩石・柱子", "擋路，也擋子彈")}</div>`;
    if (id === "danger")
      return `<p class="gg-lead bad">看到這些就閃開，<b>只有蛇頭</b>會被打到。</p><div class="gg-cards">${card(briefIcon.head("#ff7a81"), "敵人的頭", "別用頭撞，衝刺時例外", "bad")}${card(briefIcon.bullet("#ffad85"), "子彈", "橫向閃開", "bad")}${card(briefIcon.circle("#ff5263"), "紅色圈", "圈填滿前離開", "bad")}${card(briefIcon.line("#ff8a3d"), "紅色直線", "快爆發了，往旁邊閃", "bad")}${card(briefIcon.pool("#9be37a"), "綠色毒霧", "站在裡面持續扣血", "bad")}${card(briefIcon.ring("#7fe8ff"), "能量環", "按住衝刺可以穿過", "bad")}</div>`;
    if (id === "items") {
      const food = ["energy", "fruit", "crystal", "heal"],
        short = {
          energy: "成長",
          fruit: "成長更多",
          crystal: "+1 晶體",
          heal: "+20 HP",
          speed: "速度 +30%",
          magnet: "吸更遠",
          fury: "傷害 ×1.8",
          shield: "擋一次傷害",
          bomb: "吃下就爆炸",
          rainbow: "大量得分",
        };
      const tile = (id) => {
        const f = S.FOODS[id];
        return `<article class="gg-tile">${dot(f.color || world.crystal)}<b>${f.name}</b><span>${short[id]}</span></article>`;
      };
      return `<p class="gg-lead">靠近就會自動吸過來。道具有時間限制，畫面邊緣的箭頭會指出位置。</p><h4 class="gg-sub">食物</h4><div class="gg-tiles">${food.map(tile).join("")}</div><h4 class="gg-sub">道具</h4><div class="gg-tiles">${S.POWER_IDS.map(tile).join("")}</div>`;
    }
    if (mode === "zen")
      return `<p class="gg-lead ok">悠遊秘境沒有敵人，放心探索。</p>`;
    const roster = Object.entries(S.ENEMIES).filter(
        ([, e]) => e.weight && e.tier <= d.tier,
      ),
      bosses =
        mode === "boss" || mode === "endless"
          ? S.BOSSES
          : mode === "survival"
            ? [S.BOSSES[0]]
            : [];
    return `<p class="gg-lead">難度<b>${d.name}</b>：會遇到 ${roster.length} 種怪物${bosses.length ? `和 ${bosses.length} 位首領` : ""}。</p><div class="gg-tiles foes">${roster.map(([k, e]) => `<article class="gg-tile">${dot(e.color)}<b>${e.name}</b><span>${ENEMY_TIPS[k] || ""}</span></article>`).join("")}</div>${bosses.length ? `<h4 class="gg-sub">首領・三個階段、各四招</h4><div class="gg-bosses">${bosses.map((b) => `<article style="--c:${b.color}"><b>${b.name}</b><span>${b.title}</span></article>`).join("")}</div>` : ""}`;
  }
  function showGameGuide(inRun = false, fromPause = false, page = 0) {
    sound.init();
    if (inRun && game) game.paused = true;
    const mode = inRun ? game.mode : profile.mode,
      world = S.WORLDS[inRun ? game.world : profile.world];
    const id = GUIDE_PAGES[page][0],
      last = page === GUIDE_PAGES.length - 1;
    showModal(
      "briefing",
      `<button class="icon-button modal-close" id="close-brief" aria-label="關閉說明">${icon("close")}</button><p class="section-label">${S.MODES[mode].name}・${world.name}${inRun ? "・遊戲已暫停" : ""}</p><h2 id="modal-title">遊戲說明</h2><nav class="gg-tabs" aria-label="說明頁">${GUIDE_PAGES.map(([, label], i) => `<button data-gpage="${i}" class="${i === page ? "on" : ""}" aria-current="${i === page}"><small>${i + 1}</small>${label}</button>`).join("")}</nav><div class="gg-page">${guidePage(id, inRun)}</div><div class="gg-foot"><button class="text-button" id="gg-full">${icon("help")}看完整規則</button><div class="gg-nav"><button class="secondary-button" id="gg-prev" ${page === 0 ? "disabled" : ""}>上一頁</button>${last ? `<button class="primary-button" id="gg-done">${inRun ? "回到遊戲" : "我知道了"}</button>` : `<button class="primary-button" id="gg-next">下一頁</button>`}</div></div>`,
      true,
    );
    const back = () =>
      inRun ? (fromPause ? pauseMenu() : resume()) : closeModal();
    $("close-brief").onclick = back;
    if ($("gg-done")) $("gg-done").onclick = back;
    $$("[data-gpage]").forEach(
      (b) =>
        (b.onclick = () =>
          showGameGuide(inRun, fromPause, Number(b.dataset.gpage))),
    );
    if ($("gg-next"))
      $("gg-next").onclick = () => showGameGuide(inRun, fromPause, page + 1);
    $("gg-prev").onclick = () =>
      page > 0 && showGameGuide(inRun, fromPause, page - 1);
    $("gg-full").onclick = () => help("start", inRun);
    guideState = { inRun, fromPause, page };
  }
  let guideState = null;
  function requestStart() {
    startGame();
  }
  function modeGoal(mode) {
    return S.MODES[mode].goal;
  }
  const lessons = [
    [
      "試著轉一個彎",
      "移動滑鼠，或按方向鍵／WASD 指定方向；手機拖動左下搖桿。蛇會一直前進，放開也不會停。",
    ],
    ["吃下 5 顆能量球", "朝前方的圓球移動，靠近就會自動吸入。"],
    [
      "按住衝刺半秒",
      "按住 Space、Shift、滑鼠左鍵或衝刺按鈕。放開就會恢復衝刺能量。",
    ],
    [
      "靠近練習靶，讓蛇自動咬",
      "不用按鍵！敵人進入蛇頭前方的黃色扇形，就會自動咬擊。",
    ],
    [
      "用衝刺撞中練習靶",
      "對準衝撞練習靶，按住衝刺，用蛇頭撞上去。衝刺撞擊傷害最高，還會把小蟲撞飛。",
    ],
    [
      "繞一圈，圈住練習靶",
      "蛇身已經變長。沿著虛線繞靶一圈，讓蛇頭穿過自己的身體，圈內敵人就會被纏繞絞殺。",
    ],
    ["使用一次專屬技能", "按 E、滑鼠右鍵或技能按鈕。技能冷卻結束就可以再用。"],
    [
      "選擇一次進化",
      "成長能量已經填滿。從三張卡片中選一張，或按 1／2／3；選擇時遊戲會暫停。",
    ],
  ];
  function refreshCoach() {
    if (!tutorial || tutorial.completed) return;
    const lesson = lessons[tutorial.step];
    $("coach-step").textContent = `無傷練習 ${tutorial.step + 1} / 8`;
    $("coach-title").textContent = lesson[0];
    $("coach-detail").textContent = lesson[1];
    const ratios = [
      tutorial.progress / 0.65,
      tutorial.progress / 5,
      tutorial.progress / 0.5,
      0,
      0,
      0,
      0,
      0,
    ];
    $("coach-progress").style.transform =
      `scaleX(${S.clamp(ratios[tutorial.step], 0, 1)})`;
    $("coach-status").textContent =
      tutorial.step === 1
        ? `已收集 ${Math.min(5, tutorial.progress)} / 5 顆`
        : tutorial.step === 2
          ? `已衝刺 ${Math.min(0.5, tutorial.progress).toFixed(1)} / 0.5 秒`
          : tutorial.step === 5
            ? "小技巧：持續往同一側轉，蛇頭很快就會碰到身體。"
            : "這裡不會受傷；練習分數不計入紀錄、不發獎勵。";
  }
  function completeTraining() {
    if (!tutorial?.completed || modalType === "training-done") return;
    profile.tutorialCompleted = true;
    profile.guideVersion = S.GUIDE_VERSION;
    save();
    game.paused = true;
    $("training-coach").classList.add("hidden");
    showModal(
      "training-done",
      `<p class="section-label">八步練習完成</p><h2 id="modal-title">你已經學會全部操作了。</h2><p class="modal-subtitle">轉彎、吞噬、衝刺、自動咬擊、衝撞、纏繞、技能與進化，全部完成。</p><div class="rule-callout"><strong>正式挑戰時，記得保護蛇頭。</strong><p>咬擊會自動發動；被圍住就按住衝刺撞出去，或繞圈纏繞一網打盡。牆壁和岩石不會扣血，岩石還能擋子彈。</p></div><p class="brief-goal">${modeGoal(profile.mode)}</p><div class="modal-actions"><button class="primary-button" id="training-play">開始${S.MODES[profile.mode].name}</button><button class="secondary-button" id="training-home">返回大廳</button></div>`,
      false,
      { guard: 600 },
    );
    $("training-play").onclick = () => startGame();
    $("training-home").onclick = home;
  }
  function settings(fromPause = false) {
    sound.init();
    const s = profile.settings;
    showModal(
      "settings",
      `<button class="icon-button modal-close" id="close-settings" aria-label="關閉設定">${icon("close")}</button><h2 id="modal-title">調整你的節奏</h2><p class="modal-subtitle">設定會自動儲存，立即生效。</p><div class="setting-row"><div><strong>音樂與音效</strong><p>原創合成環境音與互動音效</p></div><button id="sound-toggle" class="toggle ${s.sound ? "on" : ""}" aria-pressed="${s.sound}">${s.sound ? "開啟" : "關閉"}</button></div><div class="setting-row"><label for="volume">音量</label><input id="volume" type="range" min="0" max="100" value="${s.volume * 100}" aria-label="音量"></div><div class="setting-row"><div><label for="quality">畫面品質</label><p>省電模式減少粒子、光暈與解析度</p></div><select id="quality"><option value="high" ${s.quality === "high" ? "selected" : ""}>精緻畫質</option><option value="low" ${s.quality === "low" ? "selected" : ""}>流暢省電</option></select></div><div class="setting-row"><div><label for="control">電腦操作方式</label><p>自動：最後動到的是滑鼠還是鍵盤，就用哪一個</p></div><select id="control"><option value="auto" ${s.control === "auto" ? "selected" : ""}>自動切換（推薦）</option><option value="pointer" ${s.control === "pointer" ? "selected" : ""}>滑鼠跟隨為主</option><option value="keyboard" ${s.control === "keyboard" ? "selected" : ""}>只用鍵盤</option></select></div><div class="setting-row"><div><strong>減少動態效果</strong><p>關閉鏡頭震動、打擊停頓、閃爍與漂浮粒子</p></div><button id="motion-toggle" class="toggle ${s.reducedMotion ? "on" : ""}" aria-pressed="${s.reducedMotion}">${s.reducedMotion ? "開啟" : "關閉"}</button></div><p class="help-note">${storageAvailable ? "進度保存在目前瀏覽器。清除網站資料會移除存檔。" : "目前瀏覽器無法寫入存檔，關閉頁面後進度可能遺失。"}${motionPreference.matches ? " 已依系統偏好減少動態效果。" : ""}</p><div class="modal-actions"><button class="primary-button" id="settings-done">完成</button></div>`,
    );
    $("sound-toggle").onclick = () => {
      s.sound = !s.sound;
      save();
      sound.click();
      settings(fromPause);
    };
    $("motion-toggle").onclick = () => {
      s.reducedMotion = !s.reducedMotion;
      save();
      settings(fromPause);
    };
    $("volume").oninput = (e) => {
      s.volume = Number(e.target.value) / 100;
      save();
    };
    $("volume").onchange = () => sound.click();
    $("quality").onchange = (e) => {
      s.quality = e.target.value;
      if (previewRenderer) previewRenderer.quality = s.quality;
      if (gameRenderer) gameRenderer.quality = s.quality;
      save();
    };
    $("control").onchange = (e) => {
      s.control = e.target.value;
      steer = s.control === "pointer" ? "pointer" : "keys";
      save();
      updateControlHint();
    };
    const done = () => (fromPause ? pauseMenu() : closeModal());
    $("close-settings").onclick = $("settings-done").onclick = done;
  }
  function updateControlHint() {
    const c = profile.settings.control;
    document.querySelector(".game-tips").innerHTML =
      `${c === "keyboard" ? "WASD / 方向鍵移動" : "滑鼠或 WASD 移動"}<span>按住 Space／左鍵衝刺　E／右鍵技能　M 地圖　Esc 暫停</span>`;
  }
  function startGame(training = false) {
    training = training === true;
    sound.init();
    closeModal();
    resetInput();
    $("lobby").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    try {
      if (!gameRenderer || gameRenderer.lost)
        gameRenderer = new SerpentRenderer($("game-canvas"), {
          quality: profile.settings.quality,
        });
    } catch (error) {
      $("game-screen").classList.add("hidden");
      $("lobby").classList.remove("hidden");
      toast("畫面初始化失敗，請使用支援 WebGL 的瀏覽器重新開啟。");
      console.error(error);
      return;
    }
    game = new S.Game({
      character: profile.selected,
      world: profile.world,
      mode: profile.mode,
      upgrades: profile.upgrades,
      training,
      difficulty: profile.difficulty,
    });
    tutorial = training ? new S.Tutorial(game) : null;
    bossCast = null;
    bolts = [];
    $("boss-intro").classList.remove("show");
    camera = { x: 0, z: -3 };
    zoom = 1;
    texts = [];
    flashes = [];
    coilFlashes = [];
    screenFlash = null;
    shake = 0;
    hitStop = 0;
    hurtFlash = 0;
    result = null;
    accumulator = 0;
    lastCombo = 0;
    steer = profile.settings.control === "pointer" ? "pointer" : "keys";
    pointerOrigin = pointer ? { ...pointer } : null;
    $("training-coach").classList.toggle("hidden", !training);
    $("game-screen").classList.toggle("is-training", training);
    $("damage-notice").classList.add("hidden");
    refreshCoach();
    const c = game.character;
    $("hud-avatar").innerHTML = avatar(c);
    $("hud-character").textContent = c.name;
    $("skill-label").textContent = c.skill;
    $("skill-button").querySelector("svg").innerHTML =
      `<use href="#i-${c.icon}"/>`;
    const w = S.WORLDS[game.world];
    $("minimap-label").textContent = `${w.name}`;
    updateControlHint();
    $("game-canvas").focus();
    updateHUD();
    banner(
      training
        ? "安全練習開始 / 先試著轉彎"
        : game.mode === "zen"
          ? "沒有敵人、不會受傷 / 暫停後可結算獎勵"
          : "咬擊自動發動 / 按住衝刺撞擊 / 繞圈纏繞絞殺",
    );
    if (gameRenderer.fallback) toast("已啟用相容畫面模式，遊戲玩法不受影響。");
    else if (!training && profile.runs === 0)
      toast("隨時按 Esc，可以在暫停選單打開「本局說明」。");
  }
  function pauseMenu() {
    if (!game || game.over || game.needsUpgrade) return;
    game.paused = true;
    showModal(
      "pause",
      `<p class="section-label">世界與倒數已停止。</p><h2 id="modal-title">${game.training ? "練習已暫停" : "冒險已暫停"}</h2><p class="modal-subtitle">${game.training ? "八步無傷練習 / 不計紀錄" : S.MODES[game.mode].name + " / " + S.WORLDS[game.world].name + (game.mode === "zen" ? "" : " / 難度" + game.diff.name)}</p><p class="brief-goal">${game.training ? "按繼續會接著目前的練習步驟。" : modeGoal(game.mode)}</p><div class="result-meta"><div><strong>${number(game.score)}</strong><span>目前得分</span></div><div><strong>${timeString(game.time)}</strong><span>遊玩時間</span></div><div><strong>${game.level}</strong><span>進化等級</span></div></div><div class="modal-actions"><button class="primary-button" id="resume-button">${icon("play")}繼續${game.training ? "練習" : "冒險"}</button><button class="secondary-button" id="pause-map">戰場地圖 <kbd>M</kbd></button></div><div class="modal-actions"><button class="secondary-button" id="pause-brief">本局說明</button><button class="secondary-button" id="pause-rules">完整規則</button><button class="secondary-button" id="pause-settings">遊戲設定</button></div><div class="modal-actions"><button class="secondary-button" id="finish-run">${game.training ? "離開練習，不計紀錄" : "結算本局並領取獎勵"}</button></div>`,
    );
    $("resume-button").onclick = resume;
    $("pause-settings").onclick = () => settings(true);
    $("pause-rules").onclick = () => help("damage", true);
    $("pause-brief").onclick = () => showGameGuide(true, true);
    $("pause-map").onclick = () => openMap(true);
    $("finish-run").onclick = () => {
      if (game.training) {
        home();
        return;
      }
      closeModal();
      game.end(game.mode === "zen", "retired");
      processEvents();
    };
  }
  function resume() {
    if (!game || game.over) return;
    closeModal();
    game.paused = false;
    resetInput();
    accumulator = 0;
    $("game-canvas").focus();
  }
  function openMap(fromPause = false) {
    if (!game || game.over || game.needsUpgrade || game.training) return;
    sound.init();
    game.paused = true;
    const w = S.WORLDS[game.world];
    const legend = [
      ["me", "你的蛇", game.character.color],
      ["enemy", "敵人", "#ff6f78"],
      ["boss", "首領", "#ff4d5e"],
      ["power", "道具", "#f7a8ff"],
      ["cache", "晶簇寶箱", "#ffd27a"],
      ["spring", "治癒泉", "#7ef0c8"],
      ["pad", "加速板", "#d9f77b"],
      ["portal", "傳送門", "#c49bff"],
      ["zone", w.zone.name, w.zone.accent],
      ["rock", `${w.landmark}／岩石`, "#8aa39c"],
    ];
    showModal(
      "map",
      `<button class="icon-button modal-close" id="close-map" aria-label="關閉地圖">${icon("close")}</button><p class="section-label">${S.MODES[game.mode].name} / ${w.name}</p><h2 id="modal-title">戰場地圖</h2><p class="modal-subtitle">遊戲已暫停。白框是目前畫面範圍；道具 45 秒後消失，記得趁早去拿。</p><div class="big-map-wrap"><canvas id="big-map" aria-label="整張戰場的地圖"></canvas><ul class="map-legend">${legend.map(([k, label, color]) => `<li><i class="lg-${k}" style="--c:${color}"></i>${label}</li>`).join("")}</ul></div><p class="help-note">${w.zone.name}：${w.zone.effect}。</p><div class="modal-actions"><button class="primary-button" id="map-done">${fromPause ? "返回暫停選單" : "返回遊戲"} <kbd>M</kbd></button></div>`,
      true,
    );
    const done = () => (fromPause ? pauseMenu() : resume());
    $("close-map").onclick = $("map-done").onclick = done;
    $("modal").dataset.fromPause = String(fromPause);
    requestAnimationFrame(() => {
      if ($("big-map")) drawMap($("big-map"), game, true);
    });
  }
  function showUpgrades() {
    sound.level();
    const choices = game.choices.map((id) =>
      S.UPGRADES.find((u) => u.id === id),
    );
    showModal(
      "upgrade",
      `<div class="guard-bar" aria-hidden="true"><i></i></div><p class="section-label">進化等級 ${game.level}</p><h2 id="modal-title">你的下一種可能。</h2><p class="modal-subtitle">按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 或點選卡片。空白鍵不會選卡，避免衝刺時誤觸；遊戲已暫停。</p><div class="upgrade-grid">${choices.map((u, i) => `<button class="upgrade-card" data-upgrade="${u.id}">${icon(u.icon)}<small>${game.upgrades[u.id] ? `強化至 ${game.upgrades[u.id] + 1} 級` : "全新進化"}</small><h3>${u.name}</h3><p>${u.description}</p><kbd>${i + 1}</kbd></button>`).join("")}</div>`,
      true,
      { guard: 650 },
    );
    $$("[data-upgrade]").forEach(
      (b) => (b.onclick = () => choose(b.dataset.upgrade)),
    );
  }
  function choose(id) {
    if (game && game.chooseUpgrade(id)) {
      closeModal();
      sound.click();
      resetInput();
      $("game-canvas").focus();
      banner(S.UPGRADES.find((u) => u.id === id).name + "，進化完成");
      if (tutorial) {
        tutorial.action("upgrade");
        completeTraining();
      }
      updateHUD();
    }
  }
  function showResult() {
    result = S.settle(profile, game);
    if (!result) return;
    save();
    sound.end(game.won);
    resetInput();
    const died = game.endReason === "defeated",
      damage = game.lastDamage && S.DAMAGE[game.lastDamage.cause];
    const reason = died
      ? `${damage?.label || "生命耗盡"}，最後扣除 ${game.lastDamage?.amount || 0} HP，生命降到 0。`
      : game.endReason === "retired"
        ? "你主動結束本局，這不是死亡。已收集的獎勵照常結算。"
        : game.endReason === "arena-cleared"
          ? "四波敵蟲全數擊敗，蟲群對戰勝利！"
          : game.endReason === "boss-cleared"
            ? "三位首領全數擊敗，首領連戰勝利！"
            : "你存活到倒數歸零，完成本次挑戰。";
    showModal(
      "result",
      `<div class="guard-bar" aria-hidden="true"><i></i></div><span class="result-title">${died ? "生命歸零 / 冒險結束" : game.endReason === "retired" ? "主動結算" : "挑戰完成"}${game.mode === "zen" ? "" : ` / 難度${game.diff.name}`}${result.record ? " / 新紀錄" : ""}</span><h2 id="modal-title">${game.mode === "zen" ? "帶著微光，滿載而歸。" : game.won ? "秘境，記住了你的名字。" : "下一次，走得更遠。"}</h2><div class="result-reason ${died ? "danger" : ""}"><strong>${died ? "這次為什麼死亡？" : "本局結束原因"}</strong><p>${reason}</p>${died ? `<p>${damage?.advice || "留意左上生命，收集粉色十字或站進治癒泉恢復。"} 身體被碰到不會扣血。</p>` : ""}</div><div class="result-score">${number(game.score)}</div><div class="result-meta"><div><strong>${timeString(game.time)}</strong><span>冒險時間</span></div><div><strong>${game.maxLength}</strong><span>最長蛇身</span></div><div><strong>${game.kills}</strong><span>擊敗敵人</span></div><div><strong>${game.coilKills}</strong><span>纏繞擊殺</span></div></div><div class="result-loot">${icon("diamond")}+ ${result.reward} 進化晶體 <span class="subtle">已存入研究所</span></div>${result.earned.length ? `<p class="achievement-toast">新成就：${result.earned.join("、")}</p>` : ""}<div class="modal-actions"><button class="primary-button" id="again-button">${icon("play")}再來一局</button><button class="secondary-button" id="home-button">返回大廳</button></div>`,
      false,
      { guard: 900 },
    );
    $("again-button").onclick = () => startGame();
    $("home-button").onclick = home;
  }
  function home() {
    closeModal();
    game = null;
    tutorial = null;
    resetInput();
    $("training-coach").classList.add("hidden");
    $("game-screen").classList.remove("is-training");
    $("game-screen").classList.add("hidden");
    $("lobby").classList.remove("hidden");
    navigate("lobby");
    $("start-button").focus();
  }
  const motion = (amount) => (reduced() ? 0 : amount);
  function addText(x, z, text, color, opts = {}) {
    texts.push({
      x,
      z,
      text,
      color,
      life: opts.life || 1.1,
      max: opts.life || 1.1,
      size: opts.size || 13,
      offset: opts.offset || 0,
      rise: opts.rise ?? 1.2,
    });
    if (texts.length > 60) texts.splice(0, texts.length - 60);
  }
  function processEvents() {
    if (!game) return;
    const events = game.events.splice(0),
      head = game.snake[0];
    for (const e of events) {
      if (e.type === "eat") {
        sound.eat(e.food);
        if (e.crystal) addText(head.x, head.z, "+1 晶體", "#e5ed8d");
      }
      if (e.type === "power") {
        sound.power();
        banner(`${e.name}！${e.desc}`, "power");
        addText(head.x, head.z, e.name, e.color, {
          size: 22,
          life: 1.4,
          rise: 2,
        });
        screenFlash = { color: e.color, life: 0.35, max: 0.35 };
        if (e.id === "bomb") {
          sound.boom();
          shake = Math.max(shake, motion(0.45));
          hitStop = Math.max(hitStop, motion(0.06));
        }
      }
      if (e.type === "hurt") {
        sound.hurt();
        shake = Math.max(shake, motion(0.35));
        hurtFlash = motion(0.35) || 0.15;
        const source = S.DAMAGE[e.cause];
        $("damage-notice").textContent =
          `${source?.label || "蛇頭受傷"}：−${e.amount} HP${e.lostSegments ? ` / 蛇身 −${e.lostSegments} 節` : ""}`;
        $("damage-notice").classList.remove("hidden");
        addText(head.x, head.z, `−${e.amount} HP`, "#ff9da4", { size: 18 });
      }
      if (e.type === "shield-break") {
        sound.shield();
        addText(head.x, head.z, "護盾抵擋！", "#8fd3ff", {
          size: 18,
          life: 1.2,
        });
        screenFlash = { color: "#8fd3ff", life: 0.3, max: 0.3 };
      }
      if (e.type === "hit") {
        const label =
          {
            bite: "",
            ram: "撞擊 ",
            counter: "反擊 ",
            coil: "絞殺 ",
            bomb: "",
            skill: "",
            blast: "誘爆 ",
          }[e.source] ?? "";
        const color = e.blocked
          ? "#9fc6ff"
          : {
              bite: "#f6f3b0",
              ram: "#d5f875",
              counter: "#83d6ed",
              coil: "#fff3a8",
              bomb: "#ffb347",
              skill: game.character.color,
              blast: "#ff8a5a",
            }[e.source] || "#f1ed9d";
        const size = Math.min(30, 13 + e.amount / 9);
        // Coil damage is summarised once by the coil event instead of stacking one number per enemy.
        if (e.source !== "coil")
          addText(
            e.x,
            e.z,
            `${e.blocked ? "格擋 " : label}${e.amount}`,
            color,
            {
              size,
              offset:
                (texts.filter(
                  (t) => Math.abs(t.x - e.x) < 2 && Math.abs(t.z - e.z) < 2,
                ).length %
                  3) *
                16,
            },
          );
        sound.hit(e.source);
        if (e.source === "ram") {
          shake = Math.max(shake, motion(0.18));
          hitStop = Math.max(hitStop, motion(0.045));
        }
        if (e.boss && e.source !== "counter")
          shake = Math.max(shake, motion(0.1));
      }
      if (e.type === "bite") sound.bite();
      if (e.type === "kill") {
        flashes.push({
          x: e.x,
          z: e.z,
          life: e.boss ? 0.9 : 0.45,
          max: e.boss ? 0.9 : 0.45,
          r: e.boss ? 9 : 3.2,
          color: e.boss ? "#ffe08a" : "#ffb0a0",
        });
        sound.note(e.boss ? 120 : 220, 0.18, 0.09, "triangle", 0, 60);
        shake = Math.max(shake, motion(e.boss ? 0.7 : 0.1));
        if (e.boss) hitStop = Math.max(hitStop, motion(0.16));
      }
      if (e.type === "coil") {
        coilFlashes.push({ points: e.points, life: 0.7, max: 0.7 });
        sound.coil(e.count);
        const msg = e.count
          ? `纏繞絞殺${e.count > 1 ? ` ×${e.count}` : ""}！`
          : e.caches
            ? "纏繞破箱！"
            : `一圈吸光 ${e.food} 份`;
        addText(e.x, e.z, msg, "#fff3a8", {
          size: e.count ? 26 : 18,
          life: 1.4,
          rise: 1.6,
        });
        if (e.count)
          addText(e.x, e.z, `每隻 −${e.damage}`, "#ffe08a", {
            size: 15,
            life: 1.4,
            rise: 1.6,
            offset: -26,
          });
        if (e.count) {
          shake = Math.max(shake, motion(0.3 + e.count * 0.08));
          hitStop = Math.max(hitStop, motion(0.08));
          screenFlash = { color: "#fff3a8", life: 0.25, max: 0.25 };
          if (game.coils === 1 && !game.training)
            banner("第一次纏繞絞殺！圈越大、傷害越高", "power");
        }
      }
      if (e.type === "cache") {
        sound.cache();
        addText(e.x, e.z, "寶箱破裂！", "#ffd27a", { size: 17 });
        flashes.push({
          x: e.x,
          z: e.z,
          life: 0.5,
          max: 0.5,
          r: 3.5,
          color: "#ffd27a",
        });
        shake = Math.max(shake, motion(0.12));
      }
      if (e.type === "portal") {
        sound.portal();
        camera.x = head.x + Math.cos(game.angle) * 3;
        camera.z = head.z + Math.sin(game.angle) * 3;
        screenFlash = { color: "#c49bff", life: 0.4, max: 0.4 };
      }
      if (e.type === "boost") {
        sound.boost();
        screenFlash = { color: "#d9f77b", life: 0.18, max: 0.18 };
      }
      if (e.type === "combo") {
        addText(head.x, head.z, `${e.combo} 連擊！`, "#d9f77b", {
          size: 20 + Math.min(10, e.combo / 5),
          life: 1.2,
          rise: 2.2,
        });
        sound.note(880 + Math.min(600, e.combo * 10), 0.2, 0.08, "sine");
      }
      if (e.type === "erupt") {
        if (e.cause === "lightning") {
          bolts.push({
            x: e.x,
            z: e.z,
            life: 0.28,
            max: 0.28,
            seed: Math.random() * 1000,
          });
          flashes.push({
            x: e.x,
            z: e.z,
            life: 0.35,
            max: 0.35,
            r: 2.4,
            color: "#bff4ff",
          });
          sound.note(1800, 0.12, 0.06, "square", 0, 200);
          shake = Math.max(shake, motion(0.12));
        } else if (e.cause === "fissure") {
          flashes.push({
            x: e.x,
            z: e.z,
            life: 0.5,
            max: 0.5,
            r: 2,
            color: "#ff8a3d",
            line: e,
          });
          shake = Math.max(shake, motion(0.14));
          sound.note(70, 0.3, 0.12, "sawtooth", 0, 40);
        } else if (e.r) {
          flashes.push({
            x: e.x,
            z: e.z,
            life: 0.45,
            max: 0.45,
            r: e.r + 1,
            color: e.cause === "rockfall" ? "#ffcf8f" : "#ff7a85",
          });
          shake = Math.max(shake, motion(0.16));
          sound.note(90, 0.25, 0.1, "triangle", 0, 45);
        }
      }
      if (e.type === "explode") {
        flashes.push({
          x: e.x,
          z: e.z,
          life: 0.5,
          max: 0.5,
          r: e.r + 1.5,
          color: "#ff8a5a",
        });
        screenFlash = { color: "#ff6f59", life: 0.18, max: 0.18 };
        shake = Math.max(shake, motion(0.3));
        sound.boom();
      }
      if (e.type === "fuse") sound.note(1200, 0.08, 0.05, "square");
      if (e.type === "heal")
        addText(e.x, e.z, `+回復 ×${e.count}`, "#7dffb0", { size: 14 });
      if (e.type === "block")
        addText(e.x, e.z, "格擋！用衝撞破盾", "#9fc6ff", { size: 13 });
      if (e.type === "shield-down") {
        addText(e.x, e.z, "破盾！", "#cfe3ff", { size: 18 });
        sound.note(500, 0.15, 0.08, "square", 0, 120);
      }
      if (e.type === "immune")
        addText(e.x, e.z, "怒吼中・無敵", "#ffd0d4", { size: 14 });
      if (e.type === "stun") {
        addText(e.x, e.z, e.boss ? "首領暈眩！快攻擊" : "暈眩", "#fff3a8", {
          size: e.boss ? 20 : 14,
        });
        if (e.boss) sound.note(660, 0.3, 0.08, "triangle", 0, 330);
      }
      if (e.type === "split")
        addText(e.x, e.z, `分裂 ×${e.count}`, "#c4f59e", { size: 14 });
      if (e.type === "snipe") sound.note(1400, 0.1, 0.06, "sawtooth", 0, 500);
      if (e.type === "bounce") {
        shake = Math.max(shake, motion(0.22));
        hitStop = Math.max(hitStop, motion(0.05));
        flashes.push({
          x: e.x,
          z: e.z,
          life: 0.3,
          max: 0.3,
          r: 4,
          color: "#d5f875",
        });
      }
      if (e.type === "boss-dash") {
        shake = Math.max(shake, motion(0.2));
        sound.note(120, 0.35, 0.14, "sawtooth", 0, 50);
      }
      if (e.type === "guard")
        banner("女王之盾！小蟲活著時女王只受 35% 傷害", "danger");
      if (e.type === "boss-cast") {
        bossCast = {
          name: e.name,
          until: performance.now() + 2200,
          x: e.x,
          z: e.z,
          color: e.color,
        };
        addText(e.x, e.z, e.name, e.color, {
          size: 20,
          life: 1.3,
          rise: 2.4,
          offset: 40,
        });
        sound.note(260, 0.25, 0.07, "sawtooth", 0, 520);
      }
      if (e.type === "phase") {
        banner(`${e.name}・第 ${e.phase} 階段「${e.label}」`, "danger");
        screenFlash = { color: e.color, life: 0.45, max: 0.45 };
        shake = Math.max(shake, motion(0.6));
        hitStop = Math.max(hitStop, motion(0.18));
        sound.note(80, 0.9, 0.2, "sawtooth", 0, 160);
        sound.note(55, 1.1, 0.16, "triangle", 0.1, 40);
      }
      if (e.type === "intermission")
        banner(`清場成功 / 恢復 ${e.heal} HP，選擇進化後休息 3 秒`);
      if (e.type === "skill") {
        sound.skill();
        banner(e.name);
        shake = Math.max(shake, motion(0.15));
        screenFlash = { color: game.character.color, life: 0.3, max: 0.3 };
        if (tutorial) tutorial.action("skill");
      }
      if (e.type === "wave")
        banner(
          e.kinds?.length
            ? `第 ${e.wave} 波 / 新敵人：${e.kinds.join("、")}`
            : `第 ${e.wave} 波 / 秘境正在甦醒`,
          e.kinds?.length ? "danger" : "",
        );
      if (e.type === "boss") showBossIntro(e);
      if (e.type === "boss-killed") {
        banner("守衛已擊敗！收下你的戰利品", "power");
        sound.level();
      }
      if (
        e.type === "level" &&
        !game.over &&
        game.needsUpgrade &&
        modalType !== "upgrade"
      )
        showUpgrades();
      if (e.type === "end") showResult();
    }
    if (game?.events.length) processEvents();
  }
  function inputState() {
    let x =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let z =
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0),
      angle;
    if (x || z) {
      angle = Math.atan2(z, x);
      if (steer !== "keys") {
        steer = "keys";
        pointerOrigin = pointer ? { ...pointer } : null;
      }
    } else if (joystickAngle !== null) angle = joystickAngle;
    else if (
      steer === "pointer" &&
      profile.settings.control !== "keyboard" &&
      pointer &&
      gameRenderer
    ) {
      const h = gameRenderer.project(game.snake[0].x, 0.6, game.snake[0].z);
      const dx = pointer.x - h.x,
        dy = pointer.y - h.y;
      if (Math.hypot(dx, dy) > 24) angle = Math.atan2(dy / 0.848, dx);
    }
    return {
      angle,
      dash:
        keys.has("Space") ||
        keys.has("ShiftLeft") ||
        keys.has("ShiftRight") ||
        dashTouch ||
        mouseDash,
    };
  }
  function statusLine(g) {
    if (g.mode === "zen")
      return g.inSpring ? "治癒泉：恢復中" : "無傷模式：不會扣血";
    if (g.characterIndex === 3 && g.activeSkill > 0)
      return `星環護盾：無敵剩 ${g.activeSkill.toFixed(1)} 秒`;
    if (g.invulnerable > 0)
      return `短暫保護：剩 ${g.invulnerable.toFixed(1)} 秒`;
    if (g.inSpring)
      return g.health < g.maxHealth
        ? "治癒泉：每秒恢復 9 HP"
        : "治癒泉：生命已滿";
    if (g.zone === "slow") {
      const z = S.WORLDS[g.world].zone;
      return `${z.name}：${z.effect}`;
    }
    const boss = g.enemies.find((e) => e.boss);
    if (boss?.stunned > 0) return "首領暈眩中：受到傷害 ×1.5，快衝撞！";
    if (boss?.guard > 0 && g.enemies.some((o) => o.minion && !o.dead))
      return "女王之盾：先清掉召喚的小蟲，女王才會受到全額傷害";
    if (g.hazards.some((h) => h.type === "ring"))
      return "能量環來了：按住衝刺可以直接穿過";
    if (g.dashing) return "衝刺中：撞到敵人造成 70 傷害並撞飛";
    if (g.powers.shield > 0) return "護盾泡：可抵擋下一次傷害";
    if (g.health / g.maxHealth < 0.3)
      return "生命偏低：找粉色十字或治癒泉（小地圖綠圈）";
    if (g.snake.length >= 20 && g.coils === 0 && g.enemies.length)
      return "提示：繞圈讓蛇頭碰到自己身體，可纏繞絞殺圈內敵人";
    return "";
  }
  function updateHUD() {
    if (!game) return;
    const g = game;
    refreshCoach();
    $("run-objective").textContent = g.training
      ? "無傷練習 / 跟著任務學操作"
      : g.stageGap > 0
        ? `整備中 ${Math.ceil(g.stageGap)} 秒 / 下一戰即將開始`
        : g.mode === "arena"
          ? `殲滅第 ${g.wave} / 4 波：剩 ${g.waveRemaining + g.enemies.filter((e) => !e.dead).length} 隻`
          : g.mode === "boss"
            ? `首領連戰：已擊敗 ${g.bossesDefeated} / 3 位`
            : g.mode === "endless"
              ? `無盡第 ${g.wave} 波 / ${g.enemies.some((e) => e.boss && !e.dead) ? "首領戰進行中" : `下位首領 ${Math.max(0, Math.ceil(g.nextBossAt - g.time))} 秒`}`
              : modeGoal(g.mode);
    // The hint pill only appears when there is something worth saying right now.
    const hint = statusLine(g);
    $("protection-status").textContent = hint;
    $("hud-hint").classList.toggle("show", !!hint);
    $("hud-hint").classList.toggle(
      "warn",
      /偏低|無敵剩|暈眩|能量環|女王之盾/.test(hint) && !/星環/.test(hint),
    );
    $("game-tips").classList.toggle("faded", !g.training && g.time > 25);
    if (!g.lastDamage || g.time - g.lastDamage.time > 3.5)
      $("damage-notice").classList.add("hidden");
    $("score").textContent = number(g.score);
    document.querySelector(".score-box>span").textContent = g.training
      ? "練習分數"
      : "本局得分";
    $("timer").textContent = timeString(
      !Number.isFinite(g.duration)
        ? g.time
        : Math.max(0, Math.ceil(g.duration - g.time)),
    );
    $("wave-label").textContent = g.training
      ? "新手練習"
      : g.mode === "arena"
        ? `第 ${g.wave} / 4 波`
        : g.mode === "boss"
          ? `首領 ${Math.min(3, g.bossesDefeated + 1)} / 3`
          : g.mode === "survival" || g.mode === "endless"
            ? `第 ${g.wave} 波`
            : S.MODES[g.mode].name;
    $("hud-mode").textContent = g.training
      ? "八步無傷練習"
      : g.mode === "zen"
        ? `${S.MODES.zen.name}・${S.WORLDS[g.world].name}`
        : `${S.MODES[g.mode].name}・${g.diff.name}`;
    const hp = g.health / g.maxHealth,
      track = $("health-track");
    $("health-fill").style.transform = `scaleX(${hp})`;
    track.classList.toggle("low", hp < 0.3 && g.mode !== "zen");
    track.classList.toggle("shielded", g.powers.shield > 0);
    track.classList.toggle(
      "protected",
      g.invulnerable > 0 || (g.characterIndex === 3 && g.activeSkill > 0),
    );
    $("health-text").textContent = `${Math.ceil(g.health)} / ${g.maxHealth}`;
    $("level-label").textContent = `Lv. ${g.level}`;
    $("xp-fill").style.transform = `scaleX(${Math.min(1, g.xp / g.nextXP)})`;
    $("xp-text").textContent =
      `進化 ${Math.min(99, Math.floor((g.xp / g.nextXP) * 100))}%`;
    $("crystal-info").textContent = `晶體 ${g.crystals}`;
    $("length-info").textContent = `長度 ${g.snake.length}`;
    $("kills-info").textContent = `擊退 ${g.kills}`;
    $("combo-info").textContent = g.coilKills ? `纏繞擊殺 ${g.coilKills}` : "";
    $("dash-fill").style.transform = `scaleY(${g.dash / 100})`;
    $("dash-button").classList.toggle("free", g.powers.speed > 0);
    $("skill-fill").style.transform =
      `scaleY(${1 - g.cooldown / g.cooldownMax})`;
    $("cooldown-text").textContent =
      g.cooldown > 0 ? `${Math.ceil(g.cooldown)}s` : "";
    $("skill-button").classList.toggle("ready", g.cooldown <= 0);
    $("skill-button").setAttribute(
      "aria-label",
      `${g.character.skill}${g.cooldown > 0 ? `，冷卻剩餘 ${Math.ceil(g.cooldown)} 秒` : "，可使用"}`,
    );
    const buffs = Object.entries(g.powers)
      .filter(([, v]) => v > 0)
      .map(([id, v]) => ({
        id,
        v,
        max: S.FOODS[id].duration,
        color: S.FOODS[id].color,
        name: POWER_LABEL[id],
      }));
    if (g.boost > 0)
      buffs.push({
        id: "boost",
        v: g.boost,
        max: 1.6,
        color: "#d9f77b",
        name: "加速",
      });
    if (g.activeSkill > 0 && g.characterIndex !== 2)
      buffs.push({
        id: "skill",
        v: g.activeSkill,
        max: 6,
        color: g.character.color,
        name: g.character.skill,
      });
    if (g.frozen > 0)
      buffs.push({
        id: "freeze",
        v: g.frozen,
        max: 5,
        color: "#83d6ed",
        name: "凍結",
      });
    $("buff-bar").innerHTML = buffs
      .map(
        (b) =>
          `<span class="buff" style="--c:${b.color}"><b>${b.name}</b><small>${b.v.toFixed(b.v < 10 ? 1 : 0)}s</small><i style="transform:scaleX(${S.clamp(b.v / b.max, 0, 1)})"></i></span>`,
      )
      .join("");
    const combo = g.combo,
      meter = $("combo-meter");
    meter.classList.toggle("show", combo >= 3);
    if (combo >= 3) {
      $("combo-count").textContent = combo;
      $("combo-mult").textContent =
        `連擊・擊殺得分 ×${g.comboMultiplier().toFixed(1)}`;
      meter.style.setProperty("--fill", S.clamp(g.comboTimer / 3, 0, 1));
      if (combo > lastCombo && !reduced()) {
        meter.classList.remove("pop");
        void meter.offsetWidth;
        meter.classList.add("pop");
      }
    }
    lastCombo = combo;
    const boss = g.enemies.find((e) => e.boss);
    $("boss-hud").classList.toggle("hidden", !boss);
    if (boss) {
      const def = S.BOSSES[boss.variant],
        guarded = boss.guard > 0 && g.enemies.some((o) => o.minion && !o.dead);
      $("boss-hud").style.setProperty("--boss", boss.color);
      $("boss-hud").classList.toggle("guarded", guarded);
      $("boss-hud").classList.toggle("weak", boss.stunned > 0);
      $("boss-name").textContent = boss.name;
      $("boss-title").textContent = boss.title;
      $("boss-phase").textContent =
        boss.roar > 0
          ? "怒吼中・暫時無敵"
          : boss.stunned > 0
            ? "暈眩中・受到傷害 ×1.5"
            : guarded
              ? "女王之盾・先清小蟲"
              : `第 ${boss.phase} 階段・${def.phases[boss.phase - 1]}`;
      $("boss-fill").style.transform =
        `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
      $("boss-hp").textContent =
        `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`;
      $("boss-cast").textContent =
        bossCast && performance.now() < bossCast.until
          ? `招式：${bossCast.name}`
          : "";
    }
  }
  // ---------- Minimap ----------
  function mapTerrain(g, size, dpr) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = S.WORLDS[g.world],
      pad = 4,
      scale = (size - pad * 2) / (g.bound * 2),
      P = (p) => [size / 2 + p.x * scale, size / 2 + p.z * scale],
      big = size > 260;
    ctx.fillStyle = w.background;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = w.floor;
    ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);
    ctx.globalAlpha = 0.9;
    for (const p of g.patches) {
      const [x, z] = P(p);
      ctx.fillStyle = w.patches[p.tint];
      ctx.beginPath();
      ctx.ellipse(x, z, p.r * scale, p.r * scale * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = w.grid;
    ctx.lineWidth = 0.6;
    for (let v = -g.bound; v <= g.bound + 0.1; v += g.bound / 4) {
      const [a] = P({ x: v, z: 0 }),
        [, b] = P({ x: 0, z: v });
      ctx.beginPath();
      ctx.moveTo(a, pad);
      ctx.lineTo(a, size - pad);
      ctx.moveTo(pad, b);
      ctx.lineTo(size - pad, b);
      ctx.stroke();
    }
    for (const z of g.zones) {
      const [x, y] = P(z),
        r = z.r * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (z.type === "spring") {
        ctx.fillStyle = "#1f6d5c";
        ctx.fill();
        ctx.strokeStyle = "#7ef0c8";
      } else {
        ctx.fillStyle = w.zone.color;
        ctx.fill();
        ctx.strokeStyle = w.zone.accent + "99";
      }
      ctx.lineWidth = big ? 1.5 : 1;
      ctx.stroke();
      if (z.type === "spring") {
        ctx.strokeStyle = "#bfffe9";
        ctx.lineWidth = big ? 2 : 1.2;
        const s = Math.max(2, r * 0.45);
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s);
        ctx.lineTo(x, y + s);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#d9f77b";
    for (const p of g.pads) {
      const [x, y] = P(p),
        s = Math.max(2.2, 1.3 * scale);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.7, s * 0.75);
      ctx.lineTo(-s * 0.2, 0);
      ctx.lineTo(-s * 0.7, -s * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < g.portals.length; i += 2) {
      const a = g.portals[i],
        b = g.portals[i + 1],
        hue = a.pair ? "#7fd1ff" : "#c49bff",
        [ax, ay] = P(a),
        [bx, by] = P(b);
      ctx.strokeStyle = hue + "44";
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [
        [ax, ay],
        [bx, by],
      ]) {
        ctx.strokeStyle = hue;
        ctx.lineWidth = big ? 2.5 : 1.6;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.8, 1.4 * scale), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const o of g.obstacles) {
      const [x, y] = P(o);
      if (o.landmark) {
        const r = Math.max(4, o.r * scale * 1.2);
        ctx.fillStyle = ["#3a7d5c", "#a1e1ef", "#f3ba69"][g.world];
        ctx.strokeStyle = "#0a1418";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (g.world === 0) {
          ctx.arc(x, y, r, 0, Math.PI * 2);
        } else if (g.world === 1) {
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.75, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r * 0.75, y);
          ctx.closePath();
        } else ctx.rect(x - r * 0.6, y - r, r * 1.2, r * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = o.pillar ? w.crystal : "#56706b";
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, o.r * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = w.crystal + "aa";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);
    return { canvas: c, scale, P };
  }
  const mapCaches = { small: null, big: null };
  function drawMap(canvas, g, big = false) {
    const size = Math.round(canvas.clientWidth) || (big ? 520 : 176),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = canvas.height = Math.round(size * dpr);
    }
    // On large maps the corner minimap follows you and shows the nearby ~110 m; the M map always shows everything.
    const local = !big && g.bound > 70,
      half = local ? 55 : g.bound,
      tsize = local ? Math.round((size * g.bound) / half) : size,
      key = big ? "big" : "small";
    let cache = mapCaches[key];
    if (!cache || cache.game !== g || cache.tsize !== tsize)
      cache = mapCaches[key] = {
        game: g,
        tsize,
        img: mapTerrain(g, tsize, dpr),
      };
    const head = g.snake[0],
      pad = 4,
      cx = local ? S.clamp(head.x, -g.bound + half, g.bound - half) : 0,
      cz = local ? S.clamp(head.z, -g.bound + half, g.bound - half) : 0;
    const scale = (size - pad * 2) / (half * 2),
      P = (p) => [size / 2 + (p.x - cx) * scale, size / 2 + (p.z - cz) * scale];
    const ctx = canvas.getContext("2d"),
      t = performance.now() / 1000,
      k = big ? 1.7 : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (local) {
      const ts = cache.img.scale,
        sx = (tsize / 2 + (cx - half) * ts) * dpr,
        sy = (tsize / 2 + (cz - half) * ts) * dpr,
        sw = half * 2 * ts * dpr;
      ctx.fillStyle = S.WORLDS[g.world].background;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(
        cache.img.canvas,
        sx,
        sy,
        sw,
        sw,
        pad,
        pad,
        size - pad * 2,
        size - pad * 2,
      );
    } else ctx.drawImage(cache.img.canvas, 0, 0, size, size);
    if (!big)
      $("minimap-label").textContent =
        S.WORLDS[g.world].name + (local ? "・附近 110m" : "");
    for (const z of g.zones)
      if (z.type === "spring") {
        const [x, y] = P(z);
        ctx.strokeStyle = "#7ef0c8";
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          z.r * scale + 2 * k,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.PI * 2 * z.charge) / z.max,
        );
        ctx.stroke();
      }
    ctx.fillStyle = "#ffd27a";
    for (const c of g.caches) {
      if (c.dead) continue;
      const [x, y] = P(c),
        s = 2.4 * k;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
    }
    for (const f of g.food) {
      const def = S.FOODS[f.type];
      if (def.power) {
        const [x, y] = P(f),
          pulse = 1 + Math.sin(t * 6 + f.phase) * 0.25;
        ctx.fillStyle =
          f.type === "rainbow" ? `hsl(${(t * 120) % 360},90%,75%)` : def.color;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * k * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8 * k;
        ctx.stroke();
      } else if (
        f.type === "crystal" ||
        (big && f.type === "fruit") ||
        f.type === "heal"
      ) {
        const [x, y] = P(f);
        ctx.fillStyle = def.color;
        ctx.fillRect(x - 0.9 * k, y - 0.9 * k, 1.8 * k, 1.8 * k);
      } else if (big) {
        const [x, y] = P(f);
        ctx.fillStyle = S.WORLDS[g.world].crystal + "99";
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
    for (const hz of g.hazards) {
      const [x, y] = P(hz),
        type = hz.type || "circle";
      ctx.strokeStyle = hz.color || "#ff5263";
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      if (type === "line" || type === "beam") {
        const [x2, y2] = P({
          x: hz.x + Math.cos(hz.angle) * hz.length,
          z: hz.z + Math.sin(hz.angle) * hz.length,
        });
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
      } else
        ctx.arc(
          x,
          y,
          Math.max(1, (type === "ring" ? hz.radius : hz.r) * scale),
          0,
          Math.PI * 2,
        );
      ctx.stroke();
    }
    for (const e of g.enemies) {
      const [x, y] = P(e);
      if (e.elite) {
        ctx.fillStyle = "#ffd27a";
        ctx.beginPath();
        ctx.arc(x, y, 2.8 * k, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (e.boss) {
        const r = 4.5 * k;
        ctx.fillStyle = "#ff4d5e";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd0d4";
        ctx.lineWidth = 1.2 * k;
        ctx.beginPath();
        ctx.arc(x, y, r + 2 * k + Math.sin(t * 5) * 1.5 * k, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = e.kind === "ranged" ? "#db94ef" : "#ff6f78";
        ctx.beginPath();
        ctx.arc(x, y, 1.9 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // A boss outside the nearby window still gets an arrow on the minimap edge.
    if (local)
      for (const e of g.enemies)
        if (e.boss) {
          const [x, y] = P(e);
          if (x > pad && x < size - pad && y > pad && y < size - pad) continue;
          const a = Math.atan2(y - size / 2, x - size / 2),
            r = size / 2 - 10,
            ex = size / 2 + Math.cos(a) * r,
            ey = size / 2 + Math.sin(a) * r;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(a);
          ctx.fillStyle = "#ff4d5e";
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-5, 5);
          ctx.lineTo(-5, -5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
    if (gameRenderer && !game?.training) {
      const vh = gameRenderer.viewHeight || 43,
        vw = (vh * gameRenderer.width) / gameRenderer.height;
      const [x1, y1] = P({ x: camera.x - vw / 2, z: camera.z - vh * 0.59 }),
        [x2, y2] = P({ x: camera.x + vw / 2, z: camera.z + vh * 0.59 });
      ctx.strokeStyle = "#ffffff55";
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    ctx.strokeStyle = g.character.color;
    ctx.lineWidth = 2.2 * k;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    g.snake.forEach((p, i) => {
      if (i % 2 && i !== g.snake.length - 1) return;
      const [x, y] = P(p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    const [hx, hy] = P(g.snake[0]),
      s = 5 * k;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(g.angle);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0a1418";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s * 1.2, 0);
    ctx.lineTo(-s * 0.8, s * 0.8);
    ctx.lineTo(-s * 0.35, 0);
    ctx.lineTo(-s * 0.8, -s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // ---------- Effects layer ----------
  const glowCache = new Map();
  function glowSprite(color) {
    if (!glowCache.has(color)) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d"),
        g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(0.3, color + "88");
      g.addColorStop(1, color + "00");
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
    }
    return glowCache.get(color);
  }
  function drawFX(dt) {
    const canvas = $("fx-canvas"),
      ctx = canvas.getContext("2d"),
      w = gameRenderer.width,
      h = gameRenderer.height,
      g = game,
      ratio = Math.min(
        window.devicePixelRatio || 1,
        profile.settings.quality === "low" ? 1 : 1.5,
      );
    if (
      canvas.width !== Math.round(w * ratio) ||
      canvas.height !== Math.round(h * ratio)
    ) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fdt = g.paused || g.needsUpgrade ? 0 : dt,
      ppu = h / (gameRenderer.viewHeight || 43),
      P = (x, y, z) => gameRenderer.project(x, y, z),
      high = profile.settings.quality !== "low",
      head = g.snake[0];
    const onScreen = (p, m = 60) =>
      p.x > -m && p.x < w + m && p.y > -m && p.y < h + m;
    // Additive neon glows under the HUD markings.
    ctx.globalCompositeOperation = "lighter";
    const glow = (x, y, z, radius, color, alpha) => {
      const p = P(x, y, z),
        r = radius * ppu;
      if (!onScreen(p, r)) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite(color), p.x - r, p.y - r, r * 2, r * 2);
    };
    const wc = S.WORLDS[g.world].crystal;
    for (const z of g.zones)
      if (z.type === "spring")
        glow(
          z.x,
          0,
          z.z,
          z.r * 1.4,
          "#3fc9a3",
          0.22 + (0.2 * z.charge) / z.max,
        );
    for (const p of g.portals)
      glow(p.x, 0.8, p.z, 2.8, p.pair ? "#7fd1ff" : "#c49bff", 0.4);
    for (const p of g.pads)
      glow(p.x, 0, p.z, 1.9, "#d9f77b", p.cooldown > 0 ? 0.5 : 0.14);
    for (const c of g.caches)
      if (!c.dead) glow(c.x, 0.7, c.z, 2, "#ffd27a", 0.32);
    for (const o of g.obstacles)
      if (o.landmark) glow(o.x, o.height + 1, o.z, 3.2, wc, 0.3);
    for (const f of g.food) {
      const def = S.FOODS[f.type];
      if (def.power) glow(f.x, 1, f.z, 2.3, def.color, 0.55);
      else if (f.type !== "energy") glow(f.x, 0.4, f.z, 1, def.color, 0.32);
      else if (high) glow(f.x, 0.4, f.z, 0.6, wc, 0.2);
    }
    for (const p of g.projectiles)
      glow(
        p.x,
        0.6,
        p.z,
        p.kind === "orb" ? 2 : p.kind === "snipe" ? 1.6 : 1.3,
        p.color || "#ff8c5a",
        0.75,
      );
    for (const e of g.enemies)
      if (e.elite) glow(e.x, 0.8, e.z, 2, "#ffd27a", 0.3);
      else if (e.fuse > 0) glow(e.x, 0.6, e.z, 2.4, "#ff5d5d", 0.5);
    for (const o of g.orbits())
      glow(o.x, 0.9, o.z, 1, g.character.accent, 0.45);
    for (const e of g.enemies) if (e.boss) glow(e.x, 2, e.z, 5.5, e.color, 0.3);
    glow(
      head.x,
      0.6,
      head.z,
      g.dashing ? 2.6 : 1.8,
      g.powers.fury > 0 ? "#ff6f59" : g.character.color,
      g.dashing ? 0.4 : 0.22,
    );
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // Project attack footprints into the same world coordinates as collision checks.
    const footprint = (points, fill, stroke, width = 2) => {
      ctx.beginPath();
      points.forEach((point, i) => {
        const p = P(point.x, 0.16, point.z);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    };
    const circle = (x, z, r, n = 48) =>
      Array.from({ length: n }, (_, i) => ({
        x: x + Math.cos((i / n) * Math.PI * 2) * r,
        z: z + Math.sin((i / n) * Math.PI * 2) * r,
      }));
    const hexA = (hex, a) =>
      hex +
      Math.round(S.clamp(a, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0");
    const lane = (x, z, a, len, wid) => [
      { x: x - Math.sin(a) * wid, z: z + Math.cos(a) * wid },
      { x: x + Math.sin(a) * wid, z: z - Math.cos(a) * wid },
      {
        x: x + Math.cos(a) * len + Math.sin(a) * wid,
        z: z + Math.sin(a) * len - Math.cos(a) * wid,
      },
      {
        x: x + Math.cos(a) * len - Math.sin(a) * wid,
        z: z + Math.sin(a) * len + Math.cos(a) * wid,
      },
    ];
    const line = (a, b) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    const tn = performance.now() / 1000;
    // Enemy attacks: every danger shows its exact footprint before it lands.
    for (const hz of g.hazards) {
      const type = hz.type || "circle",
        col = hz.color || "#ff5263",
        prog = hz.duration ? 1 - Math.max(0, hz.timer) / hz.duration : 1;
      if (type === "circle") {
        footprint(
          circle(hz.x, hz.z, hz.r),
          hexA(col, 0.12 + prog * 0.2),
          hexA(col, 0.65 + 0.35 * Math.sin(tn * 18)),
          2,
        );
        footprint(
          circle(hz.x, hz.z, Math.max(0.05, hz.r * prog)),
          hexA(col, 0.38),
          null,
        );
        if (hz.cause === "lightning") {
          ctx.strokeStyle = hexA("#ffffff", 0.4 + prog * 0.5);
          ctx.lineWidth = 1.5;
          const c = P(hz.x, 0.16, hz.z),
            r = hz.r * ppu;
          line({ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y });
          line({ x: c.x, y: c.y - r * 0.8 }, { x: c.x, y: c.y + r * 0.8 });
        }
      } else if (type === "line") {
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -tn * 40;
        footprint(
          lane(hz.x, hz.z, hz.angle, hz.length, hz.width),
          hexA(col, 0.1 + prog * 0.22),
          hexA(col, 0.9),
          2,
        );
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        footprint(
          lane(hz.x, hz.z, hz.angle, hz.length * prog, hz.width * 0.45),
          hexA(col, 0.5),
          null,
        );
      } else if (type === "beam") {
        const a = P(hz.x, 1.4, hz.z),
          b = P(
            hz.x + Math.cos(hz.angle) * hz.length,
            1.4,
            hz.z + Math.sin(hz.angle) * hz.length,
          );
        if (hz.timer > 0) {
          const arc = [{ x: hz.x, z: hz.z }];
          for (let i = 0; i <= 20; i++) {
            const sa = hz.start + (hz.sweep * i) / 20;
            arc.push({
              x: hz.x + Math.cos(sa) * hz.length,
              z: hz.z + Math.sin(sa) * hz.length,
            });
          }
          footprint(arc, hexA(col, 0.06 + prog * 0.08), null);
          ctx.strokeStyle = hexA(col, 0.45 + 0.45 * Math.sin(tn * 30));
          ctx.lineWidth = 2;
          line(a, b);
        } else {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          ctx.strokeStyle = hexA(col, 0.3);
          ctx.lineWidth = hz.width * 2.4 * ppu;
          line(a, b);
          ctx.strokeStyle = hexA(col, 0.75);
          ctx.lineWidth = hz.width * ppu;
          line(a, b);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3 + Math.sin(tn * 40) * 1.5;
          line(a, b);
          ctx.restore();
        }
      } else if (type === "pool") {
        const fade = hz.timer > 0 ? prog : Math.min(1, hz.active);
        footprint(
          circle(hz.x, hz.z, hz.r),
          hexA(col, 0.06 + 0.2 * fade),
          hexA(col, 0.6 * fade),
          2,
        );
        for (let k = 0; k < 6; k++) {
          const ba = k * 1.3 + hz.x,
            br = hz.r * 0.7 * ((k * 0.37) % 1),
            ph = (tn * 1.4 + k * 0.29) % 1,
            c = P(
              hz.x + Math.cos(ba) * br,
              0.2 + ph * 1.2,
              hz.z + Math.sin(ba) * br,
            );
          ctx.strokeStyle = hexA(col, (1 - ph) * fade);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 2 + ph * 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (type === "ring") {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
        footprint(
          circle(hz.x, hz.z, hz.radius, 64),
          null,
          hexA(col, 0.9),
          Math.max(3, hz.width * ppu * 1.2),
        );
        ctx.shadowBlur = 0;
        footprint(circle(hz.x, hz.z, hz.radius, 64), null, "#ffffffcc", 1.5);
        ctx.restore();
        if (hz.radius < 6 && !reduced()) {
          const c = P(hz.x, 2.8, hz.z);
          ctx.font = '700 12px "Microsoft JhengHei",sans-serif';
          ctx.textAlign = "center";
          ctx.fillStyle = col;
          ctx.fillText("按住衝刺穿過", c.x, c.y);
        }
      }
    }
    for (const e of g.enemies) {
      if (e.windup > 0 || e.charge > 0) {
        const len = e.chargeLen || 12,
          wid = e.r,
          pr = e.windup > 0 ? 1 - e.windup / (e.windupMax || 1) : 1;
        footprint(
          lane(e.x, e.z, e.chargeAngle, len, wid),
          `rgba(255,82,99,${0.12 + pr * 0.2})`,
          "#ff8394",
        );
        footprint(
          lane(e.x, e.z, e.chargeAngle, Math.max(0.1, len * pr), wid * 0.5),
          "rgba(255,82,99,.35)",
          null,
        );
      }
      if (e.aim > 0 && Number.isFinite(e.aimAngle)) {
        const locked = e.aim <= 0.3 * g.diff.warn,
          a = P(e.x, 1.1, e.z),
          b = P(
            e.x + Math.cos(e.aimAngle) * 34,
            1.1,
            e.z + Math.sin(e.aimAngle) * 34,
          );
        ctx.save();
        ctx.shadowColor = "#ff3b6b";
        ctx.shadowBlur = 10;
        ctx.strokeStyle = locked
          ? "rgba(255,255,255,.95)"
          : `rgba(255,59,107,${0.55 + 0.3 * Math.sin(tn * 25)})`;
        ctx.lineWidth = locked ? 3.5 : 2.2;
        line(a, b);
        ctx.restore();
      }
      if (e.fuse > 0) {
        const pr = 1 - e.fuse / (e.fuseMax || 1);
        footprint(
          circle(e.x, e.z, 3),
          `rgba(255,93,93,${0.1 + pr * 0.25})`,
          Math.floor(tn * 12) % 2 ? "#ffffff" : "#ff5d5d",
          2,
        );
        footprint(
          circle(e.x, e.z, Math.max(0.05, 3 * pr)),
          "rgba(255,93,93,.3)",
          null,
        );
      }
    }
    // Coil flash: the enclosed loop lights up.
    for (const c of coilFlashes) {
      const a = c.life / c.max;
      ctx.save();
      ctx.shadowColor = "#ffe98a";
      ctx.shadowBlur = 20 * a;
      footprint(
        c.points,
        `rgba(255,236,150,${0.32 * a})`,
        `rgba(255,255,225,${a})`,
        3 + 5 * a,
      );
      ctx.restore();
      c.life -= fdt;
    }
    coilFlashes = coilFlashes.filter((c) => c.life > 0);
    // Bite range: faint when something is close, bright when the jaw snaps.
    const near =
      g.enemies.some((e) => S.distance(e, head) < g.biteRange + 5) ||
      g.caches.some((c) => !c.dead && S.distance(c, head) < g.biteRange + 4);
    if (g.biteVisual > 0 || near) {
      const pts = [head];
      for (let i = 0; i <= 24; i++) {
        const a = g.angle - Math.PI / 3 + ((i / 24) * Math.PI * 2) / 3;
        pts.push({
          x: head.x + Math.cos(a) * g.biteRange,
          z: head.z + Math.sin(a) * g.biteRange,
        });
      }
      if (g.biteVisual > 0) footprint(pts, "#d5f87548", "#f1ffb8", 2.5);
      else {
        ctx.setLineDash([5, 6]);
        footprint(pts, "#d5f87510", "#d5f87566", 1.2);
        ctx.setLineDash([]);
      }
    }
    if (
      tutorial &&
      tutorial.step === 5 &&
      tutorial.target &&
      !tutorial.target.dead
    ) {
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -g.time * 30;
      footprint(
        circle(tutorial.target.x, tutorial.target.z, 2.8),
        null,
        "#fff3a8cc",
        2.5,
      );
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    ctx.textAlign = "center";
    for (const e of g.enemies) {
      if (e.boss || e.hp < e.maxHp || e.dummy || S.distance(e, head) < 12) {
        const p = P(e.x, e.boss ? 5 : 2, e.z),
          width = e.boss ? 96 : 42;
        if (!onScreen(p)) continue;
        ctx.fillStyle = "#07151ddb";
        ctx.fillRect(p.x - width / 2, p.y, width, 5);
        ctx.fillStyle = e.color || "#ff8c91";
        ctx.fillRect(
          p.x - width / 2,
          p.y,
          width * Math.max(0, e.hp / e.maxHp),
          5,
        );
        ctx.font = '11px "Microsoft JhengHei",sans-serif';
        ctx.fillText(e.name, p.x, p.y - 6);
      }
    }
    for (const c of g.caches)
      if (!c.dead && c.hp < c.maxHp) {
        const p = P(c.x, 2, c.z);
        ctx.fillStyle = "#07151ddb";
        ctx.fillRect(p.x - 18, p.y, 36, 4);
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(p.x - 18, p.y, 36 * Math.max(0, c.hp / c.maxHp), 4);
      }
    // Name tags over power-ups so nobody has to remember what each one does. Nearest first; overlapping tags stack upward.
    const tags = [];
    for (const f of g.food
      .filter((f) => S.FOODS[f.type].power)
      .sort((a, b) => S.distance(a, head) - S.distance(b, head))) {
      const def = S.FOODS[f.type];
      if (f.life < 5 && Math.floor(g.time * 8) % 2 === 0) continue;
      const d = S.distance(f, head);
      if (d > 28) continue;
      const p = P(f.x, 2.3, f.z);
      if (!onScreen(p, 60)) continue;
      const color = f.type === "rainbow" ? "#f7c8ff" : def.color,
        title = def.name + (f.life < 10 ? `・${Math.ceil(f.life)} 秒` : ""),
        effect = POWER_SHORT[f.type] || "";
      ctx.globalAlpha = d < 10 ? 1 : Math.max(0.5, 1 - (d - 10) / 30);
      ctx.font = '700 13px "Microsoft JhengHei","Segoe UI",sans-serif';
      const w1 = ctx.measureText(title).width;
      ctx.font = '11px "Microsoft JhengHei","Segoe UI",sans-serif';
      const w2 = ctx.measureText(effect).width;
      const bw = Math.max(w1, w2) + 20,
        bh = 38,
        bx = p.x - bw / 2;
      let by = p.y - bh - 6;
      for (
        let k = 0;
        k < 4 &&
        tags.some(
          (r) =>
            bx < r.x + r.w + 4 &&
            bx + bw + 4 > r.x &&
            by < r.y + r.h + 4 &&
            by + bh + 4 > r.y,
        );
        k++
      )
        by -= bh + 6;
      tags.push({ x: bx, y: by, w: bw, h: bh });
      if (by < p.y - bh - 10) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, by + bh);
        ctx.lineTo(p.x, p.y - 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#071318e6";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 9);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 5, by + bh);
      ctx.lineTo(p.x + 5, by + bh);
      ctx.lineTo(p.x, by + bh + 6);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.font = '700 13px "Microsoft JhengHei","Segoe UI",sans-serif';
      ctx.fillText(title, p.x, by + 16);
      ctx.fillStyle = "#e8f3ef";
      ctx.font = '11px "Microsoft JhengHei","Segoe UI",sans-serif';
      ctx.fillText(effect, p.x, by + 31);
    }
    ctx.globalAlpha = 1;
    for (const f of flashes) {
      const a = f.life / f.max;
      f.life -= fdt;
      if (f.line) {
        const L = f.line;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        footprint(
          lane(L.x, L.z, L.angle, L.length, L.width * (1 + (1 - a) * 0.6)),
          hexA("#ff8a3d", 0.45 * a),
          hexA("#ffd27a", a),
          3,
        );
        ctx.restore();
        continue;
      }
      const p = P(f.x, 0.3, f.z),
        r = (1 - a) * f.r * ppu + 6;
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 2 + 6 * a;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    flashes = flashes.filter((f) => f.life > 0);
    // Lightning bolts: a jagged strike from the sky onto the target circle.
    for (const b of bolts) {
      const a = b.life / b.max,
        end = P(b.x, 0, b.z),
        top = { x: end.x + Math.sin(b.seed) * 30, y: -20 };
      let x = top.x,
        y = top.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "#9be8ff";
      ctx.shadowBlur = 18;
      for (const [width, color] of [
        [7, `rgba(155,232,255,${0.5 * a})`],
        [2.5, `rgba(255,255,255,${a})`],
      ]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          ctx.lineTo(
            top.x +
              (end.x - top.x) * t +
              (i < 8 ? Math.sin(b.seed * 7 + i * 3.1) * 18 : 0),
            top.y + (end.y - top.y) * t,
          );
        }
        ctx.stroke();
      }
      ctx.restore();
      b.life -= fdt;
    }
    bolts = bolts.filter((b) => b.life > 0);
    for (const text of texts) text.life -= fdt;
    texts = texts.filter((t) => t.life > 0);
    for (const text of texts) {
      const age = text.max - text.life,
        s = age < 0.12 ? 1.55 - (age / 0.12) * 0.55 : 1,
        p = P(text.x, 2 + age * text.rise, text.z);
      ctx.globalAlpha = Math.min(1, text.life * 2.5);
      ctx.font = `800 ${Math.round(text.size * s)}px "Segoe UI","Microsoft JhengHei",sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#061015";
      ctx.strokeText(text.text, p.x, p.y - text.offset);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, p.x, p.y - text.offset);
    }
    ctx.globalAlpha = 1;
    if ((g.time < 4 || g.training) && !g.over) {
      const p = P(head.x, 2.3, head.z);
      ctx.font = '12px "Microsoft JhengHei",sans-serif';
      ctx.fillStyle = "#eafbf0";
      ctx.shadowColor = "#071518";
      ctx.shadowBlur = 5;
      ctx.fillText("你的蛇頭 / 保護這裡", p.x, p.y);
      ctx.shadowBlur = 0;
    }
    // Edge arrows for important things you can't see yet.
    const marks = [];
    for (const e of g.enemies)
      if (e.boss)
        marks.push({ x: e.x, z: e.z, color: "#ff4d5e", label: e.name });
    for (const f of g.food)
      if (S.FOODS[f.type].power && S.distance(f, head) < 48)
        marks.push({
          x: f.x,
          z: f.z,
          color: S.FOODS[f.type].color,
          label: S.FOODS[f.type].name,
        });
    if (g.health / g.maxHealth < 0.4 && g.mode !== "zen") {
      let best = null;
      for (const z of g.zones)
        if (
          z.type === "spring" &&
          z.charge > 10 &&
          (!best || S.distance(z, head) < S.distance(best, head))
        )
          best = z;
      if (best)
        marks.push({ x: best.x, z: best.z, color: "#7ef0c8", label: "治癒泉" });
    }
    // Nearest first, and skip arrows that would land on top of one already drawn.
    marks.sort((a, b) => S.distance(a, head) - S.distance(b, head));
    const placed = [];
    for (const m of marks) {
      const p = P(m.x, 0.5, m.z),
        mx = 46,
        top = 120,
        bottom = 120;
      if (p.x > mx && p.x < w - mx && p.y > top && p.y < h - bottom) continue;
      const cx = w / 2,
        cy = h / 2,
        dx = p.x - cx,
        dy = p.y - cy,
        k = Math.min(
          (w / 2 - mx) / Math.max(1, Math.abs(dx)),
          (h / 2 - top) / Math.max(1, Math.abs(dy)),
        ),
        ex = cx + dx * k,
        ey = cy + dy * k,
        a = Math.atan2(dy, dx),
        dist = Math.round(S.distance(m, head));
      if (placed.some((q) => Math.hypot(q.x - ex, q.y - ey) < 40)) continue;
      placed.push({ x: ex, y: ey });
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = m.color;
      ctx.strokeStyle = "#061015";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-7, 9);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, -9);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      ctx.font = '600 11px "Microsoft JhengHei",sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#061015";
      const lx = ex - Math.cos(a) * 30,
        ly = ey - Math.sin(a) * 22 + 4;
      ctx.strokeText(`${m.label} ${dist}m`, lx, ly);
      ctx.fillStyle = m.color;
      ctx.fillText(`${m.label} ${dist}m`, lx, ly);
    }
    if (hurtFlash > 0) {
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.65,
      );
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, `rgba(255,80,85,${hurtFlash})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      hurtFlash = Math.max(0, hurtFlash - dt);
    }
    if (g.health / g.maxHealth < 0.3 && g.mode !== "zen" && !g.over) {
      const a =
        0.12 + (reduced() ? 0 : Math.sin(performance.now() / 260) * 0.07);
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.35,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, `rgba(255,60,70,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    if (screenFlash) {
      ctx.globalAlpha = (0.2 * screenFlash.life) / screenFlash.max;
      ctx.fillStyle = screenFlash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      screenFlash.life -= dt;
      if (screenFlash.life <= 0) screenFlash = null;
    }
    if ((g.dashing || g.boost > 0) && !reduced()) {
      ctx.strokeStyle = g.boost > 0 ? "#e8ff9a38" : "#b8efcd30";
      ctx.lineWidth = 1.5;
      const t = g.time;
      for (let i = 0; i < 22; i++) {
        const a = (i * Math.PI) / 11 + 0.1,
          r = 0.45 + ((t * 2.2 + i * 0.37) % 0.55);
        const x = w / 2 + Math.cos(a) * w * r,
          y = h / 2 + Math.sin(a) * h * r;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 60, y + Math.sin(a) * 60);
        ctx.stroke();
      }
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.12, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (document.hidden || portalPaused) return;
    if (game && !$("game-screen").classList.contains("hidden")) {
      if (!game.over && !game.paused && !game.needsUpgrade) {
        if (hitStop > 0) {
          hitStop = Math.max(0, hitStop - dt);
          accumulator = 0;
        } else {
          accumulator += dt;
          const input = inputState();
          while (accumulator >= 1 / 60) {
            game.update(1 / 60, input);
            if (tutorial) tutorial.update(1 / 60, input);
            accumulator -= 1 / 60;
            processEvents();
            if (game.over || game.paused || game.needsUpgrade || hitStop > 0) {
              accumulator = 0;
              break;
            }
          }
        }
        sound.music();
      } else accumulator = 0;
      // Camera leads the head so you see more of where you're going; dashing pulls back for speed.
      const h = game.snake[0],
        lead = game.training ? 1.5 : 3 + (game.dashing ? 2 : 0),
        follow = 1 - Math.exp(-dt * 5);
      camera.x += (h.x + Math.cos(game.angle) * lead - camera.x) * follow;
      camera.z += (h.z + Math.sin(game.angle) * lead - camera.z) * follow;
      const zoomTarget = reduced()
        ? 1
        : game.dashing || game.boost > 0
          ? 1.08
          : 1;
      zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt * 4));
      if (now - lastRender > (profile.settings.quality === "low" ? 30 : 10)) {
        lastRender = now;
        const renderCamera = { ...camera };
        if (shake > 0) {
          renderCamera.x += (Math.random() - 0.5) * shake * 2;
          renderCamera.z += (Math.random() - 0.5) * shake * 2;
          shake = Math.max(0, shake - dt * 1.6);
        }
        gameRenderer.gameScene(game, renderCamera, reduced(), zoom);
        drawFX(dt);
      }
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        updateHUD();
      }
      mapTimer += dt;
      if (mapTimer > 0.066) {
        mapTimer = 0;
        if (!game.training) drawMap($("minimap"), game);
        if (modalType === "map" && $("big-map"))
          drawMap($("big-map"), game, true);
      }
    } else if (
      page === "lobby" &&
      previewRenderer &&
      !previewRenderer.lost &&
      now - lastRender > 30
    ) {
      lastRender = now;
      if (!reduced() && !modalType) previewTime += dt;
      previewRenderer.previewScene(
        S.CHARACTERS[profile.selected],
        reduced() ? 0 : previewTime,
        rotation + (reduced() ? 0 : Math.sin(previewTime * 0.25) * 0.12),
      );
    }
  }
  // Populate buttons before initializing graphics, so navigation survives graphics failures.
  $("mode-list").innerHTML = Object.entries(S.MODES)
    .map(
      ([id, m]) =>
        `<button class="mode-card" data-mode="${id}" aria-pressed="false">${icon(m.icon)}<span><strong>${m.name}</strong><small>${m.tag}</small></span><span class="radio-mark"></span></button>`,
    )
    .join("");
  $("character-roster").innerHTML = S.CHARACTERS.map(
    (c, i) =>
      `<button class="character-card" data-character="${i}" aria-pressed="false" aria-label="選擇${c.name}，${c.role}">${avatar(c)}<span><strong>${c.name}</strong><small>${c.role}</small></span></button>`,
  ).join("");
  $("world-grid").innerHTML = S.WORLDS.map(
    (w, i) =>
      `<button class="world-card" data-world="${i}" aria-pressed="false"><span class="landscape" aria-hidden="true"></span><span class="world-copy"><span class="world-number">WORLD 0${i + 1}</span><h3>${w.name}</h3><p>${w.subtitle}</p></span><span class="world-check" aria-hidden="true">✓</span></button>`,
  ).join("");
  $$("[data-character]").forEach(
    (b) =>
      (b.onclick = () => {
        sound.init();
        sound.click();
        setCharacter(Number(b.dataset.character));
      }),
  );
  $$("[data-world]").forEach(
    (b) =>
      (b.onclick = () => {
        sound.init();
        sound.click();
        setWorld(Number(b.dataset.world));
      }),
  );
  $$("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        sound.init();
        sound.click();
        setMode(b.dataset.mode);
      }),
  );
  $("difficulty-list").innerHTML = Object.entries(S.DIFFICULTIES)
    .map(
      ([id, d]) =>
        `<button class="difficulty-option" data-difficulty="${id}" aria-pressed="false"><strong>${d.name}</strong><small>${d.tag}</small></button>`,
    )
    .join("");
  $$("[data-difficulty]").forEach(
    (b) =>
      (b.onclick = () => {
        sound.init();
        sound.click();
        setDifficulty(b.dataset.difficulty);
      }),
  );
  $$("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        sound.init();
        sound.click();
        navigate(b.dataset.nav);
      }),
  );
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    navigate("lobby");
  };
  $$('[data-action="settings"]').forEach((b) => (b.onclick = () => settings()));
  $("guide-button").onclick = () => showGameGuide();
  $$('[data-action="help"]').forEach((b) => (b.onclick = () => help()));
  $("practice-button").onclick = () => startGame(true);
  $("game-help").onclick = () => showGameGuide(true, false);
  $("exit-training").onclick = pauseMenu;
  $("start-button").onclick = requestStart;
  $("pause-button").onclick = pauseMenu;
  const trySkill = () => {
    if (!game) return;
    if (game.useSkill()) processEvents();
    else if (!game.paused && !game.needsUpgrade && !game.over)
      toast(`技能冷卻中，剩餘 ${Math.ceil(game.cooldown)} 秒`);
  };
  $("skill-button").onclick = trySkill;
  $("minimap-wrap").onclick = () => openMap();
  const canvasEl = $("game-canvas");
  canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());
  canvasEl.addEventListener("pointerdown", (e) => {
    if (!game || modalType || e.pointerType === "touch") return;
    e.preventDefault();
    canvasEl.focus();
    if (e.button === 0) {
      mouseDash = true;
      canvasEl.setPointerCapture(e.pointerId);
    } else if (e.button === 2) trySkill();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvasEl.addEventListener(event, (e) => {
      if (event !== "pointerup" || e.button === 0) mouseDash = false;
    });
  canvasEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    pointer = { x: e.clientX, y: e.clientY };
    const mode = profile.settings.control;
    if (mode === "pointer") steer = "pointer";
    else if (
      mode === "auto" &&
      steer !== "pointer" &&
      (!pointerOrigin ||
        Math.hypot(pointer.x - pointerOrigin.x, pointer.y - pointerOrigin.y) >
          40)
    )
      steer = "pointer";
  });
  $("dash-button").addEventListener("pointerdown", (e) => {
    if (!game || modalType) return;
    e.preventDefault();
    dashTouch = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("dash-button").addEventListener(event, () => (dashTouch = false));
  $("dash-button").addEventListener("keydown", (e) => {
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      dashTouch = true;
    }
  });
  $("dash-button").addEventListener("keyup", () => (dashTouch = false));
  $("rotate-model").onclick = () => (rotation += Math.PI / 4);
  let dragX = null;
  $("preview-canvas").addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  $("preview-canvas").addEventListener("pointermove", (e) => {
    if (dragX !== null) {
      rotation += (e.clientX - dragX) * 0.009;
      dragX = e.clientX;
    }
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("preview-canvas").addEventListener(event, () => (dragX = null));
  let joystickPointer = null;
  function joystickMove(e) {
    if (e.pointerId !== joystickPointer) return;
    const rect = $("joystick").getBoundingClientRect(),
      dx = e.clientX - rect.left - rect.width / 2,
      dy = e.clientY - rect.top - rect.height / 2,
      d = Math.hypot(dx, dy),
      r = Math.min(34, d);
    joystickAngle = d > 8 ? Math.atan2(dy, dx) : null;
    $("joystick").firstElementChild.style.transform = d
      ? `translate(${(dx / d) * r}px,${(dy / d) * r}px)`
      : "";
  }
  $("joystick").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    joystickPointer = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    joystickMove(e);
  });
  $("joystick").addEventListener("pointermove", joystickMove);
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("joystick").addEventListener(event, (e) => {
      if (e.pointerId === joystickPointer) {
        joystickPointer = null;
        joystickAngle = null;
        $("joystick").firstElementChild.style.transform = "";
      }
    });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (modalType) {
      if (
        guarded() &&
        [
          "Space",
          "Enter",
          "NumpadEnter",
          "Digit1",
          "Digit2",
          "Digit3",
          "Numpad1",
          "Numpad2",
          "Numpad3",
        ].includes(e.code)
      ) {
        e.preventDefault();
        return;
      }
      if (modalType === "upgrade") {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)
        ) {
          e.preventDefault();
          upgradeArmed = true;
          const cards = $$("[data-upgrade]"),
            i = cards.indexOf(document.activeElement),
            back = e.code === "ArrowLeft" || e.code === "ArrowUp";
          cards[
            i < 0
              ? back
                ? cards.length - 1
                : 0
              : (i + (back ? -1 : 1) + cards.length) % cards.length
          ]?.focus();
          return;
        }
        // Space / Enter only confirm a card the player deliberately moved to with Tab or the arrow keys.
        if (
          ["Space", "Enter", "NumpadEnter"].includes(e.code) &&
          !upgradeArmed
        ) {
          e.preventDefault();
          return;
        }
      }
      if (modalType === "result" && e.code === "Space") {
        e.preventDefault();
        return;
      }
      if (e.code === "Tab") {
        if (modalType === "upgrade") upgradeArmed = true;
        const list = [
            ...$("modal").querySelectorAll(
              'button:not(:disabled),input,select,[tabindex="0"]',
            ),
          ],
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      if (
        modalType === "briefing" &&
        guideState &&
        (e.code === "ArrowLeft" || e.code === "ArrowRight")
      ) {
        e.preventDefault();
        const next = guideState.page + (e.code === "ArrowRight" ? 1 : -1);
        if (next >= 0 && next < GUIDE_PAGES.length)
          showGameGuide(guideState.inRun, guideState.fromPause, next);
        return;
      }
      if (modalType === "map" && (e.code === "Escape" || e.code === "KeyM")) {
        e.preventDefault();
        $("map-done").click();
        return;
      }
      if (modalType === "pause" && e.code === "KeyM") {
        e.preventDefault();
        openMap(true);
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        if (modalType === "pause") resume();
        else if (modalType === "help") $("help-done").click();
        else if (modalType === "briefing") $("close-brief").click();
        else if (modalType === "training-done") home();
        else if (modalType === "settings") $("settings-done").click();
        else if (modalType === "result") home();
        return;
      }
      if (
        modalType === "upgrade" &&
        [
          "Digit1",
          "Digit2",
          "Digit3",
          "Numpad1",
          "Numpad2",
          "Numpad3",
        ].includes(e.code)
      ) {
        e.preventDefault();
        const id = game.choices[Number(e.code.slice(-1)) - 1];
        if (id) choose(id);
      }
      return;
    }
    if (game && !game.over) {
      const codes = [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "KeyE",
        "KeyH",
        "Escape",
        "KeyP",
        "KeyM",
      ];
      if (codes.includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if (!e.repeat && ["Escape", "KeyP"].includes(e.code)) pauseMenu();
      if (!e.repeat && e.code === "KeyE") trySkill();
      if (!e.repeat && e.code === "KeyH") showGameGuide(true, false);
      if (!e.repeat && e.code === "KeyM") openMap();
    } else if (
      e.code === "Enter" &&
      page === "lobby" &&
      !["BUTTON", "A", "INPUT", "SELECT"].includes(
        document.activeElement.tagName,
      )
    ) {
      e.preventDefault();
      requestStart();
    }
  });
  document.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (
      modalType &&
      e.code === "Space" &&
      !(modalType === "upgrade" && upgradeArmed)
    )
      e.preventDefault();
  });
  // Swallow clicks that land on a menu button during its short guard window.
  $("modal").addEventListener(
    "click",
    (e) => {
      if (guarded() && e.target.closest("button")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  // 隱藏 iframe 時也要停止模擬、預覽與音訊；保留升級／規則等原有視窗。
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== location.origin ||
      event.data?.type !== "akane-portal-state"
    )
      return;
    portalPaused = event.data.paused === true;
    resetInput();
    if (portalPaused) {
      autoPause();
      save();
      sound.ctx?.suspend().catch(() => {});
    } else if (sound.ctx?.state === "suspended") {
      sound.ctx.resume().catch(() => {});
    }
  });
  function autoPause() {
    resetInput();
    if (game && !game.over && !game.paused && !game.needsUpgrade && !modalType)
      pauseMenu();
  }
  window.addEventListener("blur", autoPause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) autoPause();
  });
  document.addEventListener("renderlost", () => {
    autoPause();
    toast("繪圖連線中斷，恢復後頁面會重新載入。");
  });
  setCharacter(profile.selected);
  setWorld(profile.world);
  setDifficulty(profile.difficulty);
  setMode(profile.mode);
  try {
    previewRenderer = new SerpentRenderer($("preview-canvas"), {
      preview: true,
      quality: profile.settings.quality,
    });
  } catch (error) {
    console.error(error);
    $("model-word").style.color = "#a0f0ba33";
    toast("角色預覽無法載入，請確認瀏覽器已啟用硬體加速。");
  }
  if (!storageAvailable) toast("目前無法讀寫本機存檔，遊戲仍可正常開玩。");
  // Development aid: open index.html?debug to inspect the running game from the browser console.
  if (new URLSearchParams(location.search).has("debug"))
    window.__serpent = {
      game: () => game,
      camera: () => camera,
      renderer: () => gameRenderer,
    };
  requestAnimationFrame(frame);
})();
