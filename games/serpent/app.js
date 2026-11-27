/* 檔案導讀：管理大廳、音訊、手機搖桿與每幀更新；網站整合在檔案末尾的父頁訊息處理。 */
(function () {
  "use strict";
  let portalPaused = false;
  const S = window.Serpent,
    // ---------- 共用小工具 ----------

    // 用 id 找元素、用選擇器找全部的縮寫。
    $ = (id) => document.getElementById(id),
    $$ = (selector) => [...document.querySelectorAll(selector)];
  // 圖示的 SVG。
  const icon = (name) =>
    `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  // 小蛇頭像。
  const avatar = (char) =>
    `<span class="mini-snake" style="--c:${char.color}" aria-hidden="true"></span>`;
  // 數字加上千分位。
  const number = (n) => Math.floor(n).toLocaleString("zh-TW");
  // 秒數換成 分:秒。
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
  // 是否要減少動態（遊戲設定或系統設定其中一個有開）。
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
  // 道具的簡短說明，撿到時顯示。
  const POWER_SHORT = {
    speed: "速度 +30%・衝刺免費",
    magnet: "吸附範圍 +9",
    fury: "傷害 ×1.8・咬更快",
    shield: "擋下一次傷害",
    bomb: "吃下就爆炸 90 傷害",
    rainbow: "+250 分・經驗 +14",
  };
  // 儲存個人檔案；瀏覽器不能存時只提醒一次。
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
  // 畫面上的短訊息。
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3300);
  }
  // 畫面中央的提示橫幅。
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
  // 首領登場的介紹。
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

  // ---------- 音效 ----------

  // 用 Web Audio 合成音效與背景音樂，不需要音檔。
  class Sound {
    // 記錄上次播放的時間，避免同一種音效太密集。
    constructor() {
      this.ctx = null;
      this.musicAt = 0;
      this.step = 0;
      this.lastEat = 0;
      this.lastHit = 0;
    }
    // 第一次操作後才建立音訊（瀏覽器的規定）。
    init() {
      try {
        if (!this.ctx)
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      } catch (_) {}
    }
    // 播放一個音：頻率、長度、音量、波形、延遲與滑音。
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
      // 播完就斷開，釋放資源。
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
    // 吃到食物。
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
    // 打中敵人，衝撞的聲音比較重。
    hit(source) {
      if (!this.ctx || this.ctx.currentTime - this.lastHit < 0.04) return;
      this.lastHit = this.ctx.currentTime;
      if (source === "ram") {
        this.note(160, 0.14, 0.14, "square", 0, 60);
        this.note(90, 0.2, 0.1, "triangle", 0, 45);
      } else this.note(200, 0.08, 0.05, "triangle", 0, 70);
    }
    // 纏繞成功。
    coil(n) {
      [392, 523, 659, 880].forEach((f, i) =>
        this.note(f, 0.35, 0.1, "triangle", i * 0.045),
      );
      if (n > 0) {
        this.note(110, 0.4, 0.18, "sawtooth", 0, 40);
        this.note(1318, 0.4, 0.08, "sine", 0.2);
      }
    }
    // 撿到道具。
    power() {
      [660, 880, 1320].forEach((f, i) =>
        this.note(f, 0.22, 0.1, "sine", i * 0.06),
      );
    }
    // 穿過傳送門。
    portal() {
      this.note(220, 0.45, 0.12, "sine", 0, 880);
      this.note(440, 0.35, 0.06, "triangle", 0.1, 1320);
    }
    boost() {
      this.note(300, 0.25, 0.07, "sawtooth", 0, 900);
    }
    // 打破寶箱。
    cache() {
      [784, 988, 1175, 1568].forEach((f, i) =>
        this.note(f, 0.2, 0.08, "triangle", i * 0.05),
      );
    }
    shield() {
      this.note(900, 0.3, 0.1, "sine", 0, 300);
    }
    // 爆炸。
    boom() {
      this.note(90, 0.5, 0.25, "triangle", 0, 40);
      this.note(60, 0.6, 0.14, "sawtooth", 0, 30);
    }
    // 使用技能。
    skill() {
      this.note(130, 0.45, 0.18, "sawtooth", 0, 820);
      this.note(1046, 0.5, 0.08, "sine", 0.1);
    }
    hurt() {
      this.note(140, 0.22, 0.23, "triangle", 0, 48);
    }
    // 升級。
    level() {
      [523, 659, 784, 1046].forEach((n, i) =>
        this.note(n, 0.3, 0.12, "sine", i * 0.08),
      );
    }
    // 結束：勝利往上、失敗往下的音階。
    end(win) {
      (win ? [523, 659, 784, 1046] : [330, 277, 220, 165]).forEach((n, i) =>
        this.note(n, 0.5, 0.12, "triangle", i * 0.14),
      );
    }
    // 背景音樂：每 0.28 秒依音階彈一個音。
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

  // ---------- 大廳 ----------

  // 切換角色，更新介紹、技能與能力條。
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
        (name, i) => /* HTML */ `<div class="stat-row">
            <span>${name}</span>
            <div class="stat-meter">
              <span
                style="transform:scaleX(${
                  c.stats[i] / 100
                });background:${c.color}"
              ></span>
            </div>
            <b>${c.stats[i]}</b>
          </div>`,
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
  // 切換戰場。
  function setWorld(index) {
    profile.world = index;
    $$(".world-card").forEach((b, i) => {
      b.classList.toggle("selected", i === index);
      b.setAttribute("aria-pressed", String(i === index));
    });
    $("world-count").textContent = `0${index + 1} — 03`;
    save();
  }
  // 切換模式。
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
  // 切換難度。
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
  // 切換大廳頁面（大廳、研究所、紀錄）。
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
  // 進化研究所：用晶體買永久強化。
  function renderLab() {
    $("secondary-page").innerHTML = /* HTML */ `<div class="page-intro">
        <p class="section-label">把每次冒險，化為下一次的力量。</p>
        <h1>進化研究所</h1>
        <p>
          使用遊玩獲得的晶體永久強化蛇靈。升級將在下一局生效，每項最多 5 級。
        </p>
      </div>
      <div class="lab-grid">
        ${S.META.map((m) => {
          const lv = profile.upgrades[m.id],
            price = m.base * (lv + 1);
          return /* HTML */ `<article class="lab-card">
            ${icon(m.icon)}
            <h2>${m.name}</h2>
            <p>${m.description}</p>
            <span class="role-tag">目前等級 ${lv} / 5</span>
            <div class="lab-level">
              ${Array.from(
                { length: 5 },
                (_, i) =>
                  /* HTML */ `<i class="${i < lv ? "filled" : ""}"></i>`,
              ).join("")}
            </div>
            <button
              class="primary-button"
              data-buy="${m.id}"
              ${lv >= 5 || profile.crystals < price ? "disabled" : ""}
            >
              ${icon("diamond")}${
                lv >= 5
                  ? "已達最高等級"
                  : `${price} 晶體 / ${profile.crystals < price ? "晶體不足" : "升級強化"}`
              }
            </button>
          </article>`;
        }).join("")}
      </div>
      <p class="help-note">
        收集金色晶體、打破晶簇寶箱、累積得分、完成挑戰與成就，都能獲得晶體。悠遊秘境也能累積進度。
      </p>`;
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
  // 冒險紀錄。
  function renderRecords() {
    const stats = [
      [number(profile.best), "歷史最高分"],
      [profile.runs, "完成冒險"],
      [number(profile.totalKills), "累計擊退"],
      [profile.wins, "挑戰完成"],
    ];
    $("secondary-page").innerHTML = /* HTML */ `<div class="page-intro">
        <p class="section-label">每一道軌跡，都值得記住。</p>
        <h1>冒險紀錄</h1>
      </div>
      <div class="record-stats">
        ${stats
          .map(
            ([n, label]) => /* HTML */ `<div class="record-stat">
                <strong>${n}</strong><span>${label}</span>
              </div>`,
          )
          .join("")}
      </div>
      <div class="section-row">
        <h2>成就收藏</h2>
        <span
          >${profile.achievements.length} / ${S.ACHIEVEMENTS.length}　每項獎勵
          10 晶體</span
        >
      </div>
      <div class="achievement-grid">
        ${S.ACHIEVEMENTS.map(
          (a) => /* HTML */ `<article
              class="achievement ${
                profile.achievements.includes(a.id) ? "earned" : ""
              }"
            >
              ${icon("trophy")}
              <div>
                <h3>
                  ${a.name}${profile.achievements.includes(a.id) ? " ✓" : ""}
                </h3>
                <p>${a.desc}</p>
              </div>
            </article>`,
        ).join("")}
      </div>
      <div class="history">
        <h2>最近冒險</h2>
        ${
          profile.history.length
            ? /* HTML */ `<table>
              <thead>
                <tr>
                  <th>角色</th>
                  <th>模式 / 戰場</th>
                  <th>得分</th>
                  <th>時間</th>
                  <th>結果</th>
                </tr>
              </thead>
              <tbody>
                ${profile.history
                  .map(
                    (r) => /* HTML */ `<tr>
                        <td>${S.CHARACTERS[r.character].name}</td>
                        <td>
                          ${S.MODES[r.mode].name} /
                          ${S.WORLDS[r.world].name}${
                            r.mode === "zen"
                              ? ""
                              : ` / ${S.DIFFICULTIES[r.difficulty || "normal"].name}`
                          }
                        </td>
                        <td>${number(r.score)}</td>
                        <td>${timeString(r.time)}</td>
                        <td>${r.won ? "完成" : "已結算"}</td>
                      </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`
            : '<p class="empty-note">還沒有冒險紀錄。選一隻蛇靈，展開你的第一趟旅程吧。</p>'
        }
      </div>`;
  }
  // 清掉所有按住的輸入，避免切換畫面後角色自己動。
  function resetInput() {
    keys.clear();
    dashTouch = false;
    mouseDash = false;
    joystickAngle = null;
    $("joystick").firstElementChild.style.transform = "";
  }
  // 戰鬥中跳出的視窗（升級、結算）一開始會先防誤按：焦點放在視窗本身，短時間內
  // 不理會點擊、空白鍵與 Enter，按著衝刺鍵不會誤選。
  let modalGuardUntil = 0,
    guardTimer = 0,
    upgradeArmed = false;
  // 打開視窗；guard 期間不接受鍵盤，避免誤按。
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
  // 還在防誤按的時間內嗎。
  const guarded = () => performance.now() < modalGuardUntil;
  // 關閉視窗，焦點回到原本的元素。
  function closeModal() {
    modalType = null;
    $("modal-backdrop").classList.add("hidden");
    $("lobby").inert = false;
    $("game-screen").inert = false;
    if (focusBeforeModal?.isConnected && !focusBeforeModal.closest(".hidden"))
      focusBeforeModal.focus();
    focusBeforeModal = null;
  }

  // ---------- 玩法手冊與新手練習 ----------

  // 完整玩法手冊。
  function help(topic = "start", fromPause = false) {
    sound.init();
    const inRun = !!game && !game.over;
    if (inRun) game.paused = true;
    const selected = SerpentGuide.topics.some(([id]) => id === topic)
      ? topic
      : "start";
    showModal(
      "help",
      /* HTML */ `<button
          class="icon-button modal-close"
          id="close-help"
          aria-label="關閉規則"
        >
          ${icon("close")}
        </button>
        <h2 id="modal-title">霓境蛇行・玩法手冊</h2>
        <p class="modal-subtitle">
          三個按鍵就能玩：移動、衝刺、技能。咬擊會自動發動。${
            inRun ? "閱讀中：遊戲與倒數已暫停。" : ""
          }
        </p>
        <div class="guide-tabs" role="tablist" aria-label="規則章節">
          ${SerpentGuide.topics
            .map(
              ([id, label]) => /* HTML */ `<button
                  role="tab"
                  id="tab-${id}"
                  aria-selected="${id === selected}"
                  aria-controls="guide-content"
                  tabindex="${id === selected ? 0 : -1}"
                  data-topic="${id}"
                >
                  ${label}
                </button>`,
            )
            .join("")}
        </div>
        <div
          id="guide-content"
          class="guide-content"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="tab-${selected}"
        >
          ${SerpentGuide.content(selected)}
        </div>
        <div class="modal-actions">
          ${
            !inRun
              ? '<button class="primary-button" id="guide-practice">進入八步無傷練習</button>'
              : ""
          }<button
            class="${inRun ? "primary" : "secondary"}-button"
            id="help-done"
          >
            ${inRun ? "返回暫停選單" : "返回大廳"}
          </button>
        </div>`,
      true,
    );
    // 關閉手冊，回到原本該顯示的畫面。
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
    // 切換手冊的分頁。
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
      // 分頁支援方向鍵。
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
  // ---------- 出發前說明：先認識這一局會遇到的東西 ----------
  const briefIcon = {
    // 規則說明用的小圖示：寶箱（c 是顏色）。下面依序是治癒泉、跳躍板、傳送門、
    // 危險區、石頭、圓形範圍、直線、毒池、環形、雷射、子彈與蛇頭。
    chest: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <rect
          x="5"
          y="13"
          width="22"
          height="13"
          rx="2"
          fill="#7a4a26"
          stroke="${c}"
        />
        <path d="M5 14c0-6 22-6 22 0" fill="#8f5a2e" stroke="${c}" />
        <path d="M12 9v17M20 9v17" stroke="${c}" stroke-width="2" />
        <rect x="14" y="16" width="4" height="5" fill="${c}" stroke="none" />
      </svg>`,
    spring: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="18"
          r="11"
          fill="#123a33"
          stroke="${c}"
          stroke-width="2.5"
        />
        <path d="M16 12v12M10 18h12" stroke="#bfffe9" stroke-width="3" />
      </svg>`,
    pad: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <rect
          x="4"
          y="9"
          width="24"
          height="15"
          rx="2"
          fill="#33402a"
          stroke="${c}"
        />
        <path
          d="m9 12 5 4.5-5 4.5M15 12l5 4.5-5 4.5M21 12l4 4.5-4 4.5"
          stroke="${c}"
          stroke-width="2"
        />
      </svg>`,
    portal: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle
          cx="9"
          cy="17"
          r="6"
          fill="none"
          stroke="#c49bff"
          stroke-width="2.5"
        />
        <circle
          cx="23"
          cy="17"
          r="6"
          fill="none"
          stroke="#c49bff"
          stroke-width="2.5"
        />
        <path d="M13 13c2-3 4-3 6 0" stroke="${c}" stroke-dasharray="2 2" />
      </svg>`,
    zone: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <path
          d="M5 18c0-7 8-10 13-8s10 3 9 9-9 8-14 7-8-3-8-8Z"
          fill="${c}"
          fill-opacity=".45"
          stroke="${c}"
        />
      </svg>`,
    rock: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <path d="m6 24 4-12 7-5 8 6 2 11Z" fill="#46564f" stroke="${c}" />
        <path d="M14 28h6M17 7V3" stroke="${c}" />
      </svg>`,
    circle: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="${c}"
          fill-opacity=".25"
          stroke="${c}"
          stroke-width="2"
          stroke-dasharray="4 3"
        />
        <circle
          cx="16"
          cy="16"
          r="6"
          fill="${c}"
          fill-opacity=".55"
          stroke="none"
        />
      </svg>`,
    line: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <path
          d="M4 22 28 10"
          stroke="${c}"
          stroke-width="6"
          stroke-opacity=".35"
        />
        <path
          d="M4 22 28 10"
          stroke="${c}"
          stroke-width="2"
          stroke-dasharray="4 3"
        />
      </svg>`,
    pool: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <ellipse
          cx="16"
          cy="19"
          rx="12"
          ry="8"
          fill="${c}"
          fill-opacity=".35"
          stroke="${c}"
        />
        <circle cx="12" cy="15" r="2" stroke="${c}" />
        <circle cx="19" cy="12" r="1.5" stroke="${c}" />
      </svg>`,
    ring: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="${c}"
          stroke-width="3"
        />
        <circle
          cx="16"
          cy="16"
          r="5"
          fill="none"
          stroke="${c}"
          stroke-opacity=".5"
        />
      </svg>`,
    laser: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <path
          d="M4 26 28 6"
          stroke="${c}"
          stroke-width="7"
          stroke-opacity=".3"
          stroke-linecap="round"
        />
        <path d="M4 26 28 6" stroke="#fff" stroke-width="2" />
      </svg>`,
    bullet: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle cx="20" cy="14" r="5" fill="${c}" stroke="none" />
        <path
          d="M5 23 15 17"
          stroke="${c}"
          stroke-opacity=".5"
          stroke-width="3"
        />
      </svg>`,
    head: (c) => /* HTML */ `<svg viewBox="0 0 32 32">
        <circle cx="12" cy="16" r="8" fill="#a0f0ba" stroke="none" />
        <path d="m24 9 5 7-5 7-5-7Z" fill="${c}" stroke="none" />
      </svg>`,
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
  // 遊戲中快速說明的分頁。
  const GUIDE_PAGES = [
    ["play", "怎麼玩"],
    ["map", "地圖"],
    ["danger", "危險"],
    ["items", "食物道具"],
    ["foes", "敵人首領"],
  ];
  // 產生快速說明某一頁的內容，會依目前的模式與地圖調整。
  function guidePage(id, inRun) {
    const mode = inRun ? game.mode : profile.mode,
      world = S.WORLDS[inRun ? game.world : profile.world],
      d = S.DIFFICULTIES[inRun ? game.difficulty : profile.difficulty],
      ch = inRun ? game.character : S.CHARACTERS[profile.selected];
    // 一張說明卡片：左邊小圖、右邊標題與說明；tone 可以讓卡片換成警告色。
    const card = (
      art,
      title,
      text,
      tone = "",
    ) => /* HTML */ `<article class="gg-card ${tone}">
        <i class="gg-art">${art}</i><b>${title}</b><span>${text}</span>
      </article>`;
    const svg = (name) =>
      `<svg viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
    const dot = (color) => `<em class="gg-dot" style="--c:${color}"></em>`;
    if (id === "play")
      return /* HTML */ `<p class="gg-lead">這局目標：${S.MODES[mode].goal}</p>
        <div class="gg-cards">
          ${card(svg("arrow"), "移動", "滑鼠或 WASD，蛇會一直往前")}${card(
            svg("bolt"),
            "衝刺 Space／左鍵",
            "撞到敵人 70 傷害",
          )}${card(
            svg(ch.icon),
            `技能 E／右鍵`,
            `${ch.skill}，冷卻後可再用`,
          )}${card(svg("target"), "自動咬擊", "敵人在頭前方就會咬")}${card(
            svg("snake"),
            "繞圈絞殺",
            "頭碰到身體，圈內敵人重創",
          )}${card(
            briefIcon.head("#ff7a81"),
            "只有頭會受傷",
            "身體被碰到不扣血",
            "bad",
          )}
        </div>`;
    if (id === "map")
      return /* HTML */ `<p class="gg-lead ok">
          這些都 <b>不會扣血</b>，放心靠近。
        </p>
        <div class="gg-cards">
          ${card(
            briefIcon.chest("#f2c14e"),
            "寶箱",
            "打破掉能量、晶體、道具",
          )}${card(
            briefIcon.spring("#7ef0c8"),
            "治癒泉",
            "站進去每秒回 9 HP",
          )}${card(briefIcon.pad("#d9f77b"), "加速板", "踩過去短暫加速")}${card(
            briefIcon.portal("#7fd1ff"),
            "傳送門",
            "同顏色兩座互通",
          )}${card(
            briefIcon.zone(world.zone.accent),
            world.zone.name,
            world.zone.effect,
          )}${card(briefIcon.rock("#8aa39c"), "岩石・柱子", "擋路，也擋子彈")}
        </div>`;
    if (id === "danger")
      return /* HTML */ `<p class="gg-lead bad">
          看到這些就閃開，<b>只有蛇頭</b>會被打到。
        </p>
        <div class="gg-cards">
          ${card(
            briefIcon.head("#ff7a81"),
            "敵人的頭",
            "別用頭撞，衝刺時例外",
            "bad",
          )}${card(
            briefIcon.bullet("#ffad85"),
            "子彈",
            "橫向閃開",
            "bad",
          )}${card(
            briefIcon.circle("#ff5263"),
            "紅色圈",
            "圈填滿前離開",
            "bad",
          )}${card(
            briefIcon.line("#ff8a3d"),
            "紅色直線",
            "快爆發了，往旁邊閃",
            "bad",
          )}${card(
            briefIcon.pool("#9be37a"),
            "綠色毒霧",
            "站在裡面持續扣血",
            "bad",
          )}${card(
            briefIcon.ring("#7fe8ff"),
            "能量環",
            "按住衝刺可以穿過",
            "bad",
          )}
        </div>`;
    if (id === "items") {
      const food = ["energy", "fruit", "crystal", "heal"],
        // 食物與道具的簡短效果。
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
      // 一格道具說明。
      const tile = (id) => {
        const f = S.FOODS[id];
        return /* HTML */ `<article class="gg-tile">
          ${dot(f.color || world.crystal)}<b>${f.name}</b
          ><span>${short[id]}</span>
        </article>`;
      };
      return /* HTML */ `<p class="gg-lead">
          靠近就會自動吸過來。道具有時間限制，畫面邊緣的箭頭會指出位置。
        </p>
        <h4 class="gg-sub">食物</h4>
        <div class="gg-tiles">${food.map(tile).join("")}</div>
        <h4 class="gg-sub">道具</h4>
        <div class="gg-tiles">${S.POWER_IDS.map(tile).join("")}</div>`;
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
    return /* HTML */ `<p class="gg-lead">
        難度<b>${d.name}</b>：會遇到 ${roster.length}
        種怪物${bosses.length ? `和 ${bosses.length} 位首領` : ""}。
      </p>
      <div class="gg-tiles foes">
        ${roster
          .map(
            ([k, e]) => /* HTML */ `<article class="gg-tile">
                ${dot(e.color)}<b>${e.name}</b
                ><span>${ENEMY_TIPS[k] || ""}</span>
              </article>`,
          )
          .join("")}
      </div>
      ${
        bosses.length
          ? /* HTML */ `<h4 class="gg-sub">首領・三個階段、各四招</h4>
            <div class="gg-bosses">
              ${bosses
                .map(
                  (b) => /* HTML */ `<article style="--c:${b.color}">
                      <b>${b.name}</b><span>${b.title}</span>
                    </article>`,
                )
                .join("")}
            </div>`
          : ""
      }`;
  }
  // 打開快速說明，可以前後翻頁。
  function showGameGuide(inRun = false, fromPause = false, page = 0) {
    sound.init();
    if (inRun && game) game.paused = true;
    const mode = inRun ? game.mode : profile.mode,
      world = S.WORLDS[inRun ? game.world : profile.world];
    const id = GUIDE_PAGES[page][0],
      last = page === GUIDE_PAGES.length - 1;
    showModal(
      "briefing",
      /* HTML */ `<button
          class="icon-button modal-close"
          id="close-brief"
          aria-label="關閉說明"
        >
          ${icon("close")}
        </button>
        <p class="section-label">
          ${S.MODES[mode].name}・${world.name}${inRun ? "・遊戲已暫停" : ""}
        </p>
        <h2 id="modal-title">遊戲說明</h2>
        <nav class="gg-tabs" aria-label="說明頁">
          ${GUIDE_PAGES.map(
            ([, label], i) => /* HTML */ `<button
                data-gpage="${i}"
                class="${i === page ? "on" : ""}"
                aria-current="${i === page}"
              >
                <small>${i + 1}</small>${label}
              </button>`,
          ).join("")}
        </nav>
        <div class="gg-page">${guidePage(id, inRun)}</div>
        <div class="gg-foot">
          <button class="text-button" id="gg-full">
            ${icon("help")}看完整規則
          </button>
          <div class="gg-nav">
            <button
              class="secondary-button"
              id="gg-prev"
              ${page === 0 ? "disabled" : ""}
            >
              上一頁</button
            >${
              last
                ? /* HTML */ `<button class="primary-button" id="gg-done">
                  ${inRun ? "回到遊戲" : "我知道了"}
                </button>`
                : /* HTML */ `<button class="primary-button" id="gg-next">
                  下一頁
                </button>`
            }
          </div>
        </div>`,
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
  // 開始遊戲（按鈕用的入口）。
  function requestStart() {
    startGame();
  }
  // 這個模式的目標。
  function modeGoal(mode) {
    return S.MODES[mode].goal;
  }
  // 八步新手練習的標題與說明。
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
  // 更新練習的進度提示。
  function refreshCoach() {
    if (!tutorial || tutorial.completed) return;
    const lesson = lessons[tutorial.step];
    $("coach-step").textContent = `無傷練習 ${tutorial.step + 1} / 8`;
    $("coach-title").textContent = lesson[0];
    $("coach-detail").textContent = lesson[1];
    // 每一步的完成比例。
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
  // 完成練習。
  function completeTraining() {
    if (!tutorial?.completed || modalType === "training-done") return;
    profile.tutorialCompleted = true;
    profile.guideVersion = S.GUIDE_VERSION;
    save();
    game.paused = true;
    $("training-coach").classList.add("hidden");
    showModal(
      "training-done",
      /* HTML */ `<p class="section-label">八步練習完成</p>
        <h2 id="modal-title">你已經學會全部操作了。</h2>
        <p class="modal-subtitle">
          轉彎、吞噬、衝刺、自動咬擊、衝撞、纏繞、技能與進化，全部完成。
        </p>
        <div class="rule-callout">
          <strong>正式挑戰時，記得保護蛇頭。</strong>
          <p>
            咬擊會自動發動；被圍住就按住衝刺撞出去，或繞圈纏繞一網打盡。牆壁和岩石不會扣血，岩石還能擋子彈。
          </p>
        </div>
        <p class="brief-goal">${modeGoal(profile.mode)}</p>
        <div class="modal-actions">
          <button class="primary-button" id="training-play">
            開始${S.MODES[profile.mode].name}</button
          ><button class="secondary-button" id="training-home">返回大廳</button>
        </div>`,
      false,
      { guard: 600 },
    );
    $("training-play").onclick = () => startGame();
    $("training-home").onclick = home;
  }
  // 設定視窗。
  function settings(fromPause = false) {
    sound.init();
    const s = profile.settings;
    showModal(
      "settings",
      /* HTML */ `<button
          class="icon-button modal-close"
          id="close-settings"
          aria-label="關閉設定"
        >
          ${icon("close")}
        </button>
        <h2 id="modal-title">調整你的節奏</h2>
        <p class="modal-subtitle">設定會自動儲存，立即生效。</p>
        <div class="setting-row">
          <div>
            <strong>音樂與音效</strong>
            <p>原創合成環境音與互動音效</p>
          </div>
          <button
            id="sound-toggle"
            class="toggle ${s.sound ? "on" : ""}"
            aria-pressed="${s.sound}"
          >
            ${s.sound ? "開啟" : "關閉"}
          </button>
        </div>
        <div class="setting-row">
          <label for="volume">音量</label
          ><input
            id="volume"
            type="range"
            min="0"
            max="100"
            value="${s.volume * 100}"
            aria-label="音量"
          />
        </div>
        <div class="setting-row">
          <div>
            <label for="quality">畫面品質</label>
            <p>省電模式減少粒子、光暈與解析度</p>
          </div>
          <select id="quality">
            <option value="high" ${s.quality === "high" ? "selected" : ""}>
              精緻畫質
            </option>
            <option value="low" ${s.quality === "low" ? "selected" : ""}>
              流暢省電
            </option>
          </select>
        </div>
        <div class="setting-row">
          <div>
            <label for="control">電腦操作方式</label>
            <p>自動：最後動到的是滑鼠還是鍵盤，就用哪一個</p>
          </div>
          <select id="control">
            <option value="auto" ${s.control === "auto" ? "selected" : ""}>
              自動切換（推薦）
            </option>
            <option
              value="pointer"
              ${s.control === "pointer" ? "selected" : ""}
            >
              滑鼠跟隨為主
            </option>
            <option
              value="keyboard"
              ${s.control === "keyboard" ? "selected" : ""}
            >
              只用鍵盤
            </option>
          </select>
        </div>
        <div class="setting-row">
          <div>
            <strong>減少動態效果</strong>
            <p>關閉鏡頭震動、打擊停頓、閃爍與漂浮粒子</p>
          </div>
          <button
            id="motion-toggle"
            class="toggle ${s.reducedMotion ? "on" : ""}"
            aria-pressed="${s.reducedMotion}"
          >
            ${s.reducedMotion ? "開啟" : "關閉"}
          </button>
        </div>
        <p class="help-note">
          ${
            storageAvailable
              ? "進度保存在目前瀏覽器。清除網站資料會移除存檔。"
              : "目前瀏覽器無法寫入存檔，關閉頁面後進度可能遺失。"
          }${motionPreference.matches ? " 已依系統偏好減少動態效果。" : ""}
        </p>
        <div class="modal-actions">
          <button class="primary-button" id="settings-done">完成</button>
        </div>`,
    );
    // 音效開關。
    $("sound-toggle").onclick = () => {
      s.sound = !s.sound;
      save();
      sound.click();
      settings(fromPause);
    };
    // 減少動態。
    $("motion-toggle").onclick = () => {
      s.reducedMotion = !s.reducedMotion;
      save();
      settings(fromPause);
    };
    // 音量。
    $("volume").oninput = (e) => {
      s.volume = Number(e.target.value) / 100;
      save();
    };
    $("volume").onchange = () => sound.click();
    // 畫質。
    $("quality").onchange = (e) => {
      s.quality = e.target.value;
      if (previewRenderer) previewRenderer.quality = s.quality;
      if (gameRenderer) gameRenderer.quality = s.quality;
      save();
    };
    // 操作方式。
    $("control").onchange = (e) => {
      s.control = e.target.value;
      steer = s.control === "pointer" ? "pointer" : "keys";
      save();
      updateControlHint();
    };
    const done = () => (fromPause ? pauseMenu() : closeModal());
    $("close-settings").onclick = $("settings-done").onclick = done;
  }
  // 更新畫面下方的操作提示。
  function updateControlHint() {
    const c = profile.settings.control;
    document.querySelector(".game-tips").innerHTML =
      `${c === "keyboard" ? "WASD / 方向鍵移動" : "滑鼠或 WASD 移動"}<span>按住 Space／左鍵衝刺　E／右鍵技能　M 地圖　Esc 暫停</span>`;
  }

  // ---------- 開始、暫停與結束 ----------

  // 開始一局（或練習）：建立繪圖器與規則，重設所有畫面狀態。
  function startGame(training = false) {
    // training 是「八步無傷練習」模式；先準備音效、關掉視窗、清空按住的按鍵，切
    // 到遊戲畫面。
    training = training === true;
    sound.init();
    closeModal();
    resetInput();
    $("lobby").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    // 建立 3D 繪圖器（如果之前的壞掉了就重建）；瀏覽器不支援 WebGL 時會自動改用
    // 相容畫面。
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
    // 建立規則引擎。
    game = new S.Game({
      character: profile.selected,
      world: profile.world,
      mode: profile.mode,
      upgrades: profile.upgrades,
      training,
      difficulty: profile.difficulty,
    });
    // 練習模式另外建立教學流程；下面把上一局留下的特效、鏡頭、閃光、震動與結果
    // 全部清空。
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
    // 操作方式：滑鼠指向或鍵盤。
    steer = profile.settings.control === "pointer" ? "pointer" : "keys";
    pointerOrigin = pointer ? { ...pointer } : null;
    // 顯示或隱藏練習模式的教練提示。
    $("training-coach").classList.toggle("hidden", !training);
    $("game-screen").classList.toggle("is-training", training);
    $("damage-notice").classList.add("hidden");
    refreshCoach();
    // 更新角色名稱、技能等介面。
    const c = game.character;
    // 左上角 HUD：角色頭像、名字與技能。
    $("hud-avatar").innerHTML = avatar(c);
    $("hud-character").textContent = c.name;
    $("skill-label").textContent = c.skill;
    $("skill-button").querySelector("svg").innerHTML =
      `<use href="#i-${c.icon}"/>`;
    // 小地圖標上目前的地圖名稱，更新操作提示，把鍵盤焦點放到遊戲畫面。
    const w = S.WORLDS[game.world];
    $("minimap-label").textContent = `${w.name}`;
    updateControlHint();
    $("game-canvas").focus();
    updateHUD();
    // 開場的大字提示：練習、禪模式與一般模式各有不同。
    banner(
      training
        ? "安全練習開始 / 先試著轉彎"
        : game.mode === "zen"
          ? "沒有敵人、不會受傷 / 暫停後可結算獎勵"
          : "咬擊自動發動 / 按住衝刺撞擊 / 繞圈纏繞絞殺",
    );
    // 第一次玩時提醒可以按 Esc 暫停；瀏覽器不支援 3D 時提醒已改用相容畫面。
    if (gameRenderer.fallback) toast("已啟用相容畫面模式，遊戲玩法不受影響。");
    else if (!training && profile.runs === 0)
      toast("隨時按 Esc，可以在暫停選單打開「本局說明」。");
  }
  // 暫停選單。
  function pauseMenu() {
    // 遊戲結束、或正在選升級時，不能暫停。
    if (!game || game.over || game.needsUpgrade) return;
    game.paused = true;
    // 暫停視窗：目前狀態與「繼續、設定、規則、說明、地圖、回大廳」按鈕。
    showModal(
      "pause",
      /* HTML */ `<p class="section-label">世界與倒數已停止。</p>
        <h2 id="modal-title">${game.training ? "練習已暫停" : "冒險已暫停"}</h2>
        <p class="modal-subtitle">
          ${
            game.training
              ? "八步無傷練習 / 不計紀錄"
              : S.MODES[game.mode].name +
                " / " +
                S.WORLDS[game.world].name +
                (game.mode === "zen" ? "" : " / 難度" + game.diff.name)
          }
        </p>
        <p class="brief-goal">
          ${
            game.training ? "按繼續會接著目前的練習步驟。" : modeGoal(game.mode)
          }
        </p>
        <div class="result-meta">
          <div><strong>${number(game.score)}</strong><span>目前得分</span></div>
          <div>
            <strong>${timeString(game.time)}</strong><span>遊玩時間</span>
          </div>
          <div><strong>${game.level}</strong><span>進化等級</span></div>
        </div>
        <div class="modal-actions">
          <button class="primary-button" id="resume-button">
            ${icon("play")}繼續${game.training ? "練習" : "冒險"}</button
          ><button class="secondary-button" id="pause-map">
            戰場地圖 <kbd>M</kbd>
          </button>
        </div>
        <div class="modal-actions">
          <button class="secondary-button" id="pause-brief">本局說明</button
          ><button class="secondary-button" id="pause-rules">完整規則</button
          ><button class="secondary-button" id="pause-settings">
            遊戲設定
          </button>
        </div>
        <div class="modal-actions">
          <button class="secondary-button" id="finish-run">
            ${game.training ? "離開練習，不計紀錄" : "結算本局並領取獎勵"}
          </button>
        </div>`,
    );
    // 暫停視窗上各按鈕要做的事。
    $("resume-button").onclick = resume;
    $("pause-settings").onclick = () => settings(true);
    $("pause-rules").onclick = () => help("damage", true);
    $("pause-brief").onclick = () => showGameGuide(true, true);
    $("pause-map").onclick = () => openMap(true);
    // 結束這一局；悠遊模式也會結算。
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
  // 繼續遊戲。
  function resume() {
    if (!game || game.over) return;
    closeModal();
    game.paused = false;
    resetInput();
    accumulator = 0;
    $("game-canvas").focus();
  }
  // 打開大地圖。
  function openMap(fromPause = false) {
    if (!game || game.over || game.needsUpgrade || game.training) return;
    sound.init();
    game.paused = true;
    const w = S.WORLDS[game.world];
    // 地圖圖例。
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
      /* HTML */ `<button
          class="icon-button modal-close"
          id="close-map"
          aria-label="關閉地圖"
        >
          ${icon("close")}
        </button>
        <p class="section-label">${S.MODES[game.mode].name} / ${w.name}</p>
        <h2 id="modal-title">戰場地圖</h2>
        <p class="modal-subtitle">
          遊戲已暫停。白框是目前畫面範圍；道具 45 秒後消失，記得趁早去拿。
        </p>
        <div class="big-map-wrap">
          <canvas id="big-map" aria-label="整張戰場的地圖"></canvas>
          <ul class="map-legend">
            ${legend
              .map(
                ([k, label, color]) => /* HTML */ `<li>
                    <i class="lg-${k}" style="--c:${color}"></i>${label}
                  </li>`,
              )
              .join("")}
          </ul>
        </div>
        <p class="help-note">${w.zone.name}：${w.zone.effect}。</p>
        <div class="modal-actions">
          <button class="primary-button" id="map-done">
            ${fromPause ? "返回暫停選單" : "返回遊戲"} <kbd>M</kbd>
          </button>
        </div>`,
      true,
    );
    const done = () => (fromPause ? pauseMenu() : resume());
    $("close-map").onclick = $("map-done").onclick = done;
    $("modal").dataset.fromPause = String(fromPause);
    requestAnimationFrame(() => {
      if ($("big-map")) drawMap($("big-map"), game, true);
    });
  }
  // 升級三選一。
  function showUpgrades() {
    sound.level();
    const choices = game.choices.map((id) =>
      S.UPGRADES.find((u) => u.id === id),
    );
    showModal(
      "upgrade",
      /* HTML */ `<div class="guard-bar" aria-hidden="true"><i></i></div>
        <p class="section-label">進化等級 ${game.level}</p>
        <h2 id="modal-title">你的下一種可能。</h2>
        <p class="modal-subtitle">
          按 <kbd>1</kbd> <kbd>2</kbd>
          <kbd>3</kbd> 或點選卡片。空白鍵不會選卡，避免衝刺時誤觸；遊戲已暫停。
        </p>
        <div class="upgrade-grid">
          ${choices
            .map(
              (
                u,
                i,
              ) => /* HTML */ `<button class="upgrade-card" data-upgrade="${u.id}">
                  ${icon(u.icon)}<small
                    >${
                      game.upgrades[u.id]
                        ? `強化至 ${game.upgrades[u.id] + 1} 級`
                        : "全新進化"
                    }</small
                  >
                  <h3>${u.name}</h3>
                  <p>${u.description}</p>
                  <kbd>${i + 1}</kbd>
                </button>`,
            )
            .join("")}
        </div>`,
      true,
      { guard: 650 },
    );
    $$("[data-upgrade]").forEach(
      (b) => (b.onclick = () => choose(b.dataset.upgrade)),
    );
  }
  // 選擇一個升級。
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
  // 結算畫面：分數、死因與獎勵。
  function showResult() {
    // 結算這一局：計算晶體、成就與紀錄，並存檔。
    result = S.settle(profile, game);
    if (!result) return;
    save();
    // 播放勝利或失敗的音效，清空按住的按鍵。
    sound.end(game.won);
    resetInput();
    // died 表示是不是被打倒；damage 是最後一次受傷的原因（用來給建議）。
    const died = game.endReason === "defeated",
      damage = game.lastDamage && S.DAMAGE[game.lastDamage.cause];
    // 結束原因的說明：被打倒、主動結束、清完四波、打倒首領等。
    const reason = died
      ? `${damage?.label || "生命耗盡"}，最後扣除 ${game.lastDamage?.amount || 0} HP，生命降到 0。`
      : game.endReason === "retired"
        ? "你主動結束本局，這不是死亡。已收集的獎勵照常結算。"
        : game.endReason === "arena-cleared"
          ? "四波敵蟲全數擊敗，蟲群對戰勝利！"
          : game.endReason === "boss-cleared"
            ? "三位首領全數擊敗，首領連戰勝利！"
            : "你存活到倒數歸零，完成本次挑戰。";
    // 結算視窗：分數、時間、擊退數、獲得晶體，以及下一局的建議。
    showModal(
      "result",
      /* HTML */ `<div class="guard-bar" aria-hidden="true"><i></i></div>
        <span class="result-title"
          >${
            died
              ? "生命歸零 / 冒險結束"
              : game.endReason === "retired"
                ? "主動結算"
                : "挑戰完成"
          }${game.mode === "zen" ? "" : ` / 難度${game.diff.name}`}${
            result.record ? " / 新紀錄" : ""
          }</span
        >
        <h2 id="modal-title">
          ${
            game.mode === "zen"
              ? "帶著微光，滿載而歸。"
              : game.won
                ? "秘境，記住了你的名字。"
                : "下一次，走得更遠。"
          }
        </h2>
        <div class="result-reason ${died ? "danger" : ""}">
          <strong>${died ? "這次為什麼死亡？" : "本局結束原因"}</strong>
          <p>${reason}</p>
          ${
            died
              ? /* HTML */ `<p>
                ${
                  damage?.advice ||
                  "留意左上生命，收集粉色十字或站進治癒泉恢復。"
                }
                身體被碰到不會扣血。
              </p>`
              : ""
          }
        </div>
        <div class="result-score">${number(game.score)}</div>
        <div class="result-meta">
          <div>
            <strong>${timeString(game.time)}</strong><span>冒險時間</span>
          </div>
          <div><strong>${game.maxLength}</strong><span>最長蛇身</span></div>
          <div><strong>${game.kills}</strong><span>擊敗敵人</span></div>
          <div><strong>${game.coilKills}</strong><span>纏繞擊殺</span></div>
        </div>
        <div class="result-loot">
          ${icon("diamond")}+ ${result.reward} 進化晶體
          <span class="subtle">已存入研究所</span>
        </div>
        ${
          result.earned.length
            ? /* HTML */ `<p class="achievement-toast">
              新成就：${result.earned.join("、")}
            </p>`
            : ""
        }
        <div class="modal-actions">
          <button class="primary-button" id="again-button">
            ${icon("play")}再來一局</button
          ><button class="secondary-button" id="home-button">返回大廳</button>
        </div>`,
      false,
      { guard: 900 },
    );
    // 「再玩一次」與「回大廳」按鈕。
    $("again-button").onclick = () => startGame();
    $("home-button").onclick = home;
  }
  // 回到大廳。
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

  // ---------- 事件與畫面回饋 ----------

  // 減少動態時把震動量歸零。
  const motion = (amount) => (reduced() ? 0 : amount);
  // 在場景裡跳出一段文字，最多同時 60 個。
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
  // 處理規則引擎送來的事件，轉成音效、文字與特效。
  function processEvents() {
    // game.events 是遊戲規則這一幀發生的事情（吃到東西、受傷、升級…）；這裡把它
    // 們一次拿出來，轉成音效、文字與特效。
    if (!game) return;
    const events = game.events.splice(0),
      head = game.snake[0];
    for (const e of events) {
      // 吃到食物：播放音效，吃到晶體時跳出「+1 晶體」。
      if (e.type === "eat") {
        sound.eat(e.food);
        if (e.crystal) addText(head.x, head.z, "+1 晶體", "#e5ed8d");
      }
      // 吃到能力道具：顯示道具名稱與效果。
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
      // 玩家受傷。
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
      // 護盾擋下攻擊。
      if (e.type === "shield-break") {
        sound.shield();
        addText(head.x, head.z, "護盾抵擋！", "#8fd3ff", {
          size: 18,
          life: 1.2,
        });
        screenFlash = { color: "#8fd3ff", life: 0.3, max: 0.3 };
      }
      // 打中敵人：依來源決定文字、顏色與震動。
      if (e.type === "hit") {
        // 造成傷害：依攻擊方式（咬擊、撞擊、反擊、絞殺、爆炸）顯示不同的文字與
        // 顏色。
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
        // 纏繞傷害由纏繞事件合併顯示一次，不在每隻敵人頭上疊數字。
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
        // 撞擊、絞殺等強力攻擊時，畫面震動並短暫停格（打擊感）。
        if (e.source === "ram") {
          shake = Math.max(shake, motion(0.18));
          hitStop = Math.max(hitStop, motion(0.045));
        }
        if (e.boss && e.source !== "counter")
          shake = Math.max(shake, motion(0.1));
      }
      if (e.type === "bite") sound.bite();
      // 擊敗敵人。
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
      // 纏繞成功的光圈與傷害。
      if (e.type === "coil") {
        coilFlashes.push({ points: e.points, life: 0.7, max: 0.7 });
        sound.coil(e.count);
        // 纏繞絞殺：顯示絞了幾隻、每隻扣多少，數量越多震動越大。
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
      // 寶箱破裂。
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
      // 傳送門：鏡頭直接跳過去。
      if (e.type === "portal") {
        sound.portal();
        camera.x = head.x + Math.cos(game.angle) * 3;
        camera.z = head.z + Math.sin(game.angle) * 3;
        screenFlash = { color: "#c49bff", life: 0.4, max: 0.4 };
      }
      // 衝刺加速、連擊、受傷原因（例如被閃電打到時畫出閃電）。
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
      // 地面攻擊爆發，依原因有不同特效。
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
      // 爆炸。
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
      // 敵人破盾、暈眩、彈開、首領衝刺。
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
      // 首領施放招式的提示。
      if (e.type === "boss-cast") {
        // 首領施法時在畫面上顯示招式名稱 2.2 秒（until 是消失的時間點）。
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
      // 首領進入下一階段、施放技能、新的一波敵人出現。
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
      // 打倒首領、升級（跳出選升級的視窗）。
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
    // 處理事件時又產生新事件的話，再處理一次。
    if (game?.events.length) processEvents();
  }
  // 把鍵盤、滑鼠、搖桿整理成引擎要的輸入。
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
  // 目前最重要的一行狀態提示。
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

  // ---------- 介面與地圖 ----------

  // 更新遊戲中的所有介面數字與長條。
  function updateHUD() {
    // g 是目前這一局；先更新教練提示與目前目標（第幾波、整備倒數等）。
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
    // 只有真的需要提醒時才顯示提示。
    const hint = statusLine(g);
    // 左上角的狀態提示（生命偏低、無敵剩幾秒等），危險的提示用警告色。
    $("protection-status").textContent = hint;
    $("hud-hint").classList.toggle("show", !!hint);
    $("hud-hint").classList.toggle(
      "warn",
      /偏低|無敵剩|暈眩|能量環|女王之盾/.test(hint) && !/星環/.test(hint),
    );
    // 遊戲開始 25 秒後，畫面下方的操作提示變淡。
    $("game-tips").classList.toggle("faded", !g.training && g.time > 25);
    if (!g.lastDamage || g.time - g.lastDamage.time > 3.5)
      $("damage-notice").classList.add("hidden");
    // 分數、倒數或經過時間、波數與模式名稱。
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
    // 生命條：用 scaleX 把長條縮短；生命低於 30% 時變紅，有護盾或無敵時換顏色。
    const hp = g.health / g.maxHealth,
      track = $("health-track");
    $("health-fill").style.transform = `scaleX(${hp})`;
    track.classList.toggle("low", hp < 0.3 && g.mode !== "zen");
    track.classList.toggle("shielded", g.powers.shield > 0);
    track.classList.toggle(
      "protected",
      g.invulnerable > 0 || (g.characterIndex === 3 && g.activeSkill > 0),
    );
    // 生命數字、等級、進化經驗與晶體、長度、擊退、連擊。
    $("health-text").textContent = `${Math.ceil(g.health)} / ${g.maxHealth}`;
    $("level-label").textContent = `Lv. ${g.level}`;
    $("xp-fill").style.transform = `scaleX(${Math.min(1, g.xp / g.nextXP)})`;
    $("xp-text").textContent =
      `進化 ${Math.min(99, Math.floor((g.xp / g.nextXP) * 100))}%`;
    $("crystal-info").textContent = `晶體 ${g.crystals}`;
    $("length-info").textContent = `長度 ${g.snake.length}`;
    $("kills-info").textContent = `擊退 ${g.kills}`;
    $("combo-info").textContent = g.coilKills ? `纏繞擊殺 ${g.coilKills}` : "";
    // 衝刺能量與技能冷卻（用縱向的長條表示），冷卻好了按鈕會亮起來。
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
    // 目前生效的道具。
    const buffs = Object.entries(g.powers)
      .filter(([, v]) => v > 0)
      .map(([id, v]) => ({
        id,
        v,
        max: S.FOODS[id].duration,
        color: S.FOODS[id].color,
        name: POWER_LABEL[id],
      }));
    // 身上的增益效果（加速、技能、凍結等）做成小圖示。
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
        (b) => /* HTML */ `<span class="buff" style="--c:${b.color}"
            ><b>${b.name}</b><small>${b.v.toFixed(b.v < 10 ? 1 : 0)}s</small
            ><i style="transform:scaleX(${S.clamp(b.v / b.max, 0, 1)})"></i
          ></span>`,
      )
      .join("");
    // 連擊計數。
    const combo = g.combo,
      meter = $("combo-meter");
    // 連擊 3 次以上時顯示連擊數與分數倍率。
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
    // 首領血條。
    const boss = g.enemies.find((e) => e.boss);
    // 有首領時顯示上方的首領血條；首領有護衛時血條變成防護狀態。
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
  // ---------- 小地圖 ----------
  function mapTerrain(g, size, dpr) {
    // 小地圖：先建立一個畫布（dpr 是螢幕像素倍率，高解析度螢幕會畫得比較細）。
    const c = document.createElement("canvas");
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    // P(位置) 把遊戲裡的座標換成小地圖上的座標。
    const w = S.WORLDS[g.world],
      pad = 4,
      scale = (size - pad * 2) / (g.bound * 2),
      P = (p) => [size / 2 + p.x * scale, size / 2 + p.z * scale],
      big = size > 260;
    // 塗上背景與地面，畫出格線。
    ctx.fillStyle = w.background;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = w.floor;
    ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);
    ctx.globalAlpha = 0.9;
    // 地面花紋。
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
    // 特殊區域。
    for (const z of g.zones) {
      const [x, y] = P(z),
        r = z.r * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      // 治癒泉與其他區域。
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
    // 障礙物與地標。
    ctx.fillStyle = "#d9f77b";
    // 加速板。
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
    // 成對的傳送門用虛線相連。
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
    // 障礙物。
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
    // 外框，回傳畫好的小地圖與換算工具。
    ctx.strokeStyle = w.crystal + "aa";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);
    return { canvas: c, scale, P };
  }
  const mapCaches = { small: null, big: null };
  // 畫小地圖或大地圖；地圖很大時小地圖只畫附近。
  function drawMap(canvas, g, big = false) {
    const size = Math.round(canvas.clientWidth) || (big ? 520 : 176),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = canvas.height = Math.round(size * dpr);
    }
    // 大地圖時，角落的小地圖跟著玩家，只顯示附近約 110 公尺；按 M 的大地圖顯示
    // 全部。
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
    // 先貼上事先畫好的地形。
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
    // 寶箱。
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
    // 食物與道具。
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
    // 危險區域。
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
    // 敵人與菁英。
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
    // 首領在範圍外時，在邊緣畫箭頭。
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
    // 目前鏡頭看得到的範圍。
    if (gameRenderer && !game?.training) {
      const vh = gameRenderer.viewHeight || 43,
        vw = (vh * gameRenderer.width) / gameRenderer.height;
      const [x1, y1] = P({ x: camera.x - vw / 2, z: camera.z - vh * 0.59 }),
        [x2, y2] = P({ x: camera.x + vw / 2, z: camera.z + vh * 0.59 });
      ctx.strokeStyle = "#ffffff55";
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    // 自己的蛇身與方向。
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
  // ---------- 特效層 ----------
  const glowCache = new Map();
  // 光暈圖片，同一種顏色只畫一次。
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

  // ---------- 場景上方的特效層 ----------

  // 把危險預警、傷害文字、道具名稱等畫在 3D 畫面上方。
  function drawFX(dt) {
    // 特效畫布：疊在 3D 畫面上面，專門畫光暈、預警範圍、文字與箭頭。視窗大小改
    // 變時重設畫布大小。
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
    // 每一幀先清空；P(x, y, z) 把 3D 位置換算成螢幕上的位置，onScreen 判斷是否
    // 在畫面內。
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fdt = g.paused || g.needsUpgrade ? 0 : dt,
      ppu = h / (gameRenderer.viewHeight || 43),
      P = (x, y, z) => gameRenderer.project(x, y, z),
      high = profile.settings.quality !== "low",
      head = g.snake[0];
    const onScreen = (p, m = 60) =>
      p.x > -m && p.x < w + m && p.y > -m && p.y < h + m;
    // 畫在標示底下的霓虹光暈。
    ctx.globalCompositeOperation = "lighter";
    // 畫一團光。
    const glow = (x, y, z, radius, color, alpha) => {
      const p = P(x, y, z),
        r = radius * ppu;
      if (!onScreen(p, r)) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite(color), p.x - r, p.y - r, r * 2, r * 2);
    };
    // 各種物件的光暈：治癒泉、傳送門、跳躍板、寶箱、地標、能力道具、子彈、菁英
    // 敵人、首領與蛇頭。
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
    // 攻擊範圍用與碰撞判定相同的場景座標投影。
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
    // 場景裡一個圓的頂點。
    const circle = (x, z, r, n = 48) =>
      Array.from({ length: n }, (_, i) => ({
        x: x + Math.cos((i / n) * Math.PI * 2) * r,
        z: z + Math.sin((i / n) * Math.PI * 2) * r,
      }));
    // 顏色加上透明度。
    const hexA = (hex, a) =>
      hex +
      Math.round(S.clamp(a, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0");
    // 場景裡一條長方形路徑的四個角。
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
    // 畫一條線。
    const line = (a, b) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    // 攻擊預警範圍：圓形、直線、扇形、環形等，越接近發動顏色越深。
    const tn = performance.now() / 1000;
    // Enemy attacks: every danger shows its exact footprint before it lands.
    // 危險區域的預警，會隨時間填滿。
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
    // 敵人衝撞、瞄準與自爆的預警。
    for (const e of g.enemies) {
      // 敵人蓄力衝撞時畫出前進方向；瞄準時畫出瞄準線（鎖定時變紅）；自爆蟲倒數
      // 時畫出爆炸範圍。
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
    // 纏繞光圈。
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
    // 絞殺時的光圈。
    coilFlashes = coilFlashes.filter((c) => c.life > 0);
    // 咬擊範圍：有東西靠近時淡淡顯示，咬下去時變亮。
    const near =
      g.enemies.some((e) => S.distance(e, head) < g.biteRange + 5) ||
      g.caches.some((c) => !c.dead && S.distance(c, head) < g.biteRange + 4);
    // 咬擊範圍。
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
    // 練習的目標箭頭。
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
    // 寶箱的血條與食物的名稱標籤（標籤互相錯開，不重疊）。
    ctx.textAlign = "center";
    // 敵人血條與名稱。
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
    // 道具上方的名稱，不用記每個道具的作用。由近到遠，重疊時往上疊。
    const tags = [];
    // 道具名稱標籤；重疊時往上移。
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
    // 打擊閃光與閃電。
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
    // 閃電：從天上劈到目標圈。
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
    // 飄起來的文字（傷害、晶體等）：一開始大，慢慢變小變淡。
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
    // 開局或練習時，在蛇頭上方顯示操作提示。
    if ((g.time < 4 || g.training) && !g.over) {
      const p = P(head.x, 2.3, head.z);
      ctx.font = '12px "Microsoft JhengHei",sans-serif';
      ctx.fillStyle = "#eafbf0";
      ctx.shadowColor = "#071518";
      ctx.shadowBlur = 5;
      ctx.fillText("你的蛇頭 / 保護這裡", p.x, p.y);
      ctx.shadowBlur = 0;
    }
    // 畫面外的重要目標，在邊緣畫箭頭。
    const marks = [];
    // 畫面外的重要東西（首領、附近的能力道具、生命低時最近的治癒泉）：在畫面邊
    // 緣畫箭頭指向它。
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
    // 由近到遠，會和前面重疊的就不畫。
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
    // 受傷時畫面四周閃紅；生命低於 30% 時四周持續泛紅。
    if (hurtFlash > 0) {
      // 低血量的紅色邊緣。
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
      // 特殊狀態的邊緣光。
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
    // 全畫面閃光（例如升級、首領換階段）與衝刺時的速度線。
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

  // ---------- 主迴圈與輸入 ----------

  // 每一幀：推進規則 → 移動鏡頭 → 繪圖 → 更新介面。
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.12, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (document.hidden || portalPaused) return;
    if (game && !$("game-screen").classList.contains("hidden")) {
      // 固定步長推進規則，命中時短暫停頓。
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
      // 鏡頭稍微超前蛇頭。
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
      // 依畫質限制繪圖頻率。
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
  // 先建立按鈕再啟動繪圖，繪圖失敗時仍可操作介面。
  $("mode-list").innerHTML = Object.entries(S.MODES)
    .map(
      ([id, m]) => /* HTML */ `<button
          class="mode-card"
          data-mode="${id}"
          aria-pressed="false"
        >
          ${icon(m.icon)}<span
            ><strong>${m.name}</strong><small>${m.tag}</small></span
          ><span class="radio-mark"></span>
        </button>`,
    )
    .join("");
  $("character-roster").innerHTML = S.CHARACTERS.map(
    (c, i) => /* HTML */ `<button
        class="character-card"
        data-character="${i}"
        aria-pressed="false"
        aria-label="選擇${c.name}，${c.role}"
      >
        ${avatar(c)}<span
          ><strong>${c.name}</strong><small>${c.role}</small></span
        >
      </button>`,
  ).join("");
  $("world-grid").innerHTML = S.WORLDS.map(
    (w, i) => /* HTML */ `<button
        class="world-card"
        data-world="${i}"
        aria-pressed="false"
      >
        <span class="landscape" aria-hidden="true"></span
        ><span class="world-copy"
          ><span class="world-number">WORLD 0${i + 1}</span>
          <h3>${w.name}</h3>
          <p>${w.subtitle}</p></span
        ><span class="world-check" aria-hidden="true">✓</span>
      </button>`,
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
      ([id, d]) => /* HTML */ `<button
          class="difficulty-option"
          data-difficulty="${id}"
          aria-pressed="false"
        >
          <strong>${d.name}</strong><small>${d.tag}</small>
        </button>`,
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
  // 點標題回到大廳。
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
  // 使用技能，冷卻中就提示剩餘時間。
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
  // 滑鼠左鍵衝刺、右鍵技能。
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
  // 滑鼠移動時切換成指標操作。
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
  // 觸控衝刺鈕。
  $("dash-button").addEventListener("pointerdown", (e) => {
    if (!game || modalType) return;
    e.preventDefault();
    dashTouch = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("dash-button").addEventListener(event, () => (dashTouch = false));
  // 衝刺鈕的鍵盤操作。
  $("dash-button").addEventListener("keydown", (e) => {
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      dashTouch = true;
    }
  });
  $("dash-button").addEventListener("keyup", () => (dashTouch = false));
  $("rotate-model").onclick = () => (rotation += Math.PI / 4);
  let dragX = null;
  // 拖曳旋轉角色預覽。
  $("preview-canvas").addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  });
  // 拖曳中。
  $("preview-canvas").addEventListener("pointermove", (e) => {
    if (dragX !== null) {
      rotation += (e.clientX - dragX) * 0.009;
      dragX = e.clientX;
    }
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("preview-canvas").addEventListener(event, () => (dragX = null));
  let joystickPointer = null;
  // 搖桿移動。
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
  // 按下搖桿。
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
  // 鍵盤操作：視窗開著時先處理視窗，否則處理遊戲。
  document.addEventListener("keydown", (e) => {
    // 按著 Ctrl、Alt 或 Command 時不處理，讓瀏覽器自己的快捷鍵可以用。
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // 有視窗打開時：用鍵盤選擇按鈕、翻頁或關閉視窗（剛打開的短暫時間會忽略按鍵，
    // 避免誤按）。
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
      // 升級視窗：方向鍵選、數字鍵直接選。
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
        // 空白鍵與 Enter 只會確認玩家用 Tab 或方向鍵特地移到的卡片。
        if (
          ["Space", "Enter", "NumpadEnter"].includes(e.code) &&
          !upgradeArmed
        ) {
          e.preventDefault();
          return;
        }
      }
      // 結算畫面不接受空白鍵，避免一按就直接開新局。
      if (modalType === "result" && e.code === "Space") {
        e.preventDefault();
        return;
      }
      // Tab 只在視窗裡移動。
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
      // Esc：暫停時繼續遊戲，其他視窗就關閉。
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
      // 選升級時，按 1、2、3 直接選。
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
    // 遊戲中的按鍵。
    if (game && !game.over) {
      // 遊戲會用到的按鍵：WASD 與方向鍵移動、空白鍵衝刺、Shift、E 技能、H、Esc
      // 與 P 暫停、M 地圖。
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
  // 放開按鍵。
  document.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (
      modalType &&
      e.code === "Space" &&
      !(modalType === "upgrade" && upgradeArmed)
    )
      e.preventDefault();
  });
  // 防誤按期間，吃掉點在按鈕上的點擊。
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
  // 切到背景或失去焦點時自動暫停。
  function autoPause() {
    resetInput();
    if (game && !game.over && !game.paused && !game.needsUpgrade && !modalType)
      pauseMenu();
  }
  window.addEventListener("blur", autoPause);
  // 分頁切到背景。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) autoPause();
  });
  // 繪圖連線中斷。
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
  // 開發用：網址加上 ?debug，可以在瀏覽器主控台檢查目前的遊戲。
  if (new URLSearchParams(location.search).has("debug"))
    window.__serpent = {
      game: () => game,
      camera: () => camera,
      renderer: () => gameRenderer,
    };
  requestAnimationFrame(frame);
})();
