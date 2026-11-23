/* 檔案導讀：管理選角、對戰 UI 與輸入；網站返回暫停搜尋 akane-portal-state。 */
(() => {
  const {
    FIGHTERS,
    CONTROLS,
    SOLO_KEYS,
    DIFFICULTY,
    PAD_BUTTONS,
    PAD_LABELS,
    Match,
    Renderer,
    ArcadeAudio,
  } = globalThis.Midnight;
  const MODE_LABEL = {
    solo: "單人對電腦",
    versus: "本機雙人",
    training: "練習模式",
    arcade: "街機挑戰",
    watch: "電腦對打",
  };
  // 觸控鈕的字要短，直式手機才不會斷行
  const TOUCH_LABEL = {
    left: "←",
    right: "→",
    jump: "跳",
    crouch: "蹲",
    special: "技一",
    skill2: "技二",
  };
  const DODGE_COOLDOWN = 0.78; // 和 match.js 的閃避冷卻一致（畫進度條用）
  const ARCADE_LEVELS = ["easy", "normal", "hard"];
  // 操作說明裡的組合指令
  const COMMANDS = [
    ["衝刺／後撤", "連按兩下 → 或 ←", "衝刺中出招會帶著衝勁向前突進"],
    ["三段連擊", "連按輕攻 J", "最後再按一下會接技能一"],
    ["前進重攻", "按住前＋重攻 K", "往前跨一大步，打得最遠"],
    ["自動防禦", "按住後退", "對手打過來時自動擋住；蹲下＋後退是蹲防"],
    ["掃腿", "蹲下＋重攻 K", "下段攻擊，只能蹲著防禦，命中會掃倒對手"],
    [
      "投技",
      "U（或輕攻＋重攻同時按）",
      "無視防禦；被抓瞬間按投技可以拆投",
    ],
    ["上下段防禦", "防禦／蹲下＋防禦", "站防擋跳躍攻擊，蹲防擋掃腿與蹲踢"],
    ["短跳", "輕點跳躍", "按住跳得高，輕點跳得低"],
    ["爆氣", "被連段時按閃避", "消耗 50% 大招能量，強制脫離並震開對手"],
    ["精準防禦", "攻擊到來的前一刻按防禦", "不削血、彈開對手並獲得能量"],
  ];
  const get = (id) => document.getElementById(id);
  const selectScreen = get("select-screen");
  const battleScreen = get("battle-screen");
  const helpDialog = get("help-dialog");
  const pauseDialog = get("pause-dialog");
  const arena = get("arena");
  const startButton = get("start-button");
  const pauseButton = get("pause-button");
  const roster = get("roster");
  const showcase = get("showcase");
  const portrait = get("fighter-art");
  const announcement = get("announcement");
  const result = get("match-result");
  const clock = get("round-clock");
  const roundLabel = get("round-label");
  const audio = new ArcadeAudio();
  const renderer = new Renderer(get("fight-canvas"));
  const selection = [FIGHTERS[0], FIGHTERS[1]];
  let mode = "solo";
  let difficulty = "normal";
  let seat = 0;
  let match = null;
  let portalPaused = false;
  let arcade = null;
  const stats = [{ maxCombo: 0 }, { maxCombo: 0 }];

  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const seatButtons = [...document.querySelectorAll("[data-seat]")];
  const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
  try {
    const saved = localStorage.getItem("midnight-circuit-difficulty");
    if (saved in DIFFICULTY) difficulty = saved;
  } catch {
    /* Storage can be disabled. */
  }
  const choiceButtons = FIGHTERS.map((fighter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fighter-choice";
    button.dataset.fighter = fighter.id;
    button.innerHTML = `
      <span class="choice-art">
        <img src="${fighter.portrait}" width="384" height="768" alt="">
      </span>
      <span>
        <strong class="choice-name">${fighter.name}</strong>
        <span class="choice-role">${fighter.role}</span>
      </span>
      <span class="choice-seats" aria-hidden="true"></span>`;
    button.addEventListener("click", () => {
      selection[seat] = fighter;
      selectionSound();
      renderSelection();
    });
    roster.append(button);
    return button;
  });

  const keyMap = new Map();
  for (const entry of CONTROLS)
    entry.codes.forEach((codes, index) => {
      for (const code of codes) keyMap.set(code, { index, ...entry });
    });
  const keyboard = [new Set(), new Set()];
  const queued = [[], []];
  const pointers = new Map();
  const touchControls = get("touch-controls");
  const pads = [
    { held: new Set(), pressed: [] },
    { held: new Set(), pressed: [] },
  ];
  let padCount = 0;

  // 某個動作在玩家 index 的鍵盤上是哪一個鍵
  function keyLabel(action, index) {
    return CONTROLS.find((entry) => entry.action === action).labels[index];
  }

  function selectionSound() {
    audio.activate();
    audio.cue({ type: "select" });
  }

  function text(element, value) {
    const next = String(value);
    if (element.textContent !== next) element.textContent = next;
  }

  function renderSelection() {
    const fighter = selection[seat];
    if (mode === "arcade") seat = 0;
    const rival =
      mode === "versus"
        ? "玩家 2"
        : mode === "training"
          ? "木樁"
          : mode === "arcade"
            ? "街機挑戰"
            : mode === "watch"
              ? "電腦 2"
              : "電腦";
    text(get("opponent-seat"), rival);
    text(get("matchup-opponent"), rival);
    text(get("matchup-left"), selection[0].name);
    text(
      get("matchup-right"),
      mode === "arcade" ? "連戰其他 3 名鬥士" : selection[1].name,
    );
    get("seat-picker").hidden = mode === "arcade";
    for (const button of modeButtons)
      button.setAttribute("aria-pressed", button.dataset.mode === mode);
    for (const button of seatButtons)
      button.setAttribute("aria-pressed", Number(button.dataset.seat) === seat);
    for (const button of difficultyButtons)
      button.setAttribute(
        "aria-pressed",
        button.dataset.difficulty === difficulty,
      );
    get("difficulty").hidden = mode !== "solo" && mode !== "watch";

    if (showcase.dataset.fighter !== fighter.id) {
      showcase.dataset.fighter = fighter.id;
      portrait.src = fighter.portrait;
    }
    text(get("fighter-role"), fighter.role);
    text(get("fighter-name"), fighter.name);
    text(get("fighter-summary"), fighter.summary);
    text(get("special-name"), fighter.special.name);
    text(get("special-description"), fighter.special.description);
    text(get("skill2-name"), fighter.skill2.name);
    text(get("skill2-description"), fighter.skill2.description);
    text(get("super-name"), fighter.super.name);
    text(get("super-description"), fighter.super.description);
    const cpuPreview = seat === 1 && mode !== "versus";
    for (const action of ["special", "skill2", "super"]) {
      const key = get(`${action}-key`);
      key.hidden = cpuPreview;
      text(key, keyLabel(action, seat));
    }

    for (const [index, button] of choiceButtons.entries()) {
      const option = FIGHTERS[index];
      const badges = [];
      const label = [option.name, option.role];
      if (option === selection[0]) {
        badges.push('<span class="choice-badge">1P</span>');
        label.push("玩家 1 已選");
      }
      if (option === selection[1] && mode !== "arcade") {
        if (mode !== "arcade")
          badges.push(
            `<span class="choice-badge opponent">${mode === "versus" ? "2P" : "CPU"}</span>`,
          );
        label.push(`${rival}已選`);
      }
      button.setAttribute("aria-pressed", option === fighter);
      button.setAttribute("aria-label", label.join("，"));
      button.querySelector(".choice-seats").innerHTML = badges.join("");
    }
  }

  function buildHelp() {
    const padLabel = (action) =>
      PAD_LABELS[action] ?? { left: "←", right: "→", crouch: "↓" }[action];
    // 表頭與一列的共用寫法，兩張表才不用各寫一長串標籤
    const head = (names) =>
      `<thead><tr>${names
        .map((name) => `<th scope="col">${name}</th>`)
        .join("")}</tr></thead>`;
    const row = (name, cells) =>
      `<tr><th scope="row">${name}</th>` +
      `${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    const key = (label) => `<kbd>${label}</kbd>`;
    get("help-keys").innerHTML =
      head(["動作", "玩家 1", "玩家 2", "手把"]) +
      `<tbody>${CONTROLS.map(({ action, name, labels }) =>
        row(name, [key(labels[0]), key(labels[1]), key(padLabel(action))]),
      ).join("")}</tbody>`;
    get("help-commands").innerHTML =
      head(["指令", "操作", "效果"]) +
      `<tbody>${COMMANDS.map(([name, ...cells]) => row(name, cells)).join(
        "",
      )}</tbody>`;
  }

  function buildBattleControls() {
    const desktop = get("battle-keys");
    const hint = (labels, name) =>
      `<span>${labels.map((key) => `<kbd>${key}</kbd>`).join("")}${name}</span>`;
    const pad = padCount
      ? '<span class="pad-note">🎮 手把已連線</span>'
      : "";
    const help = (label) =>
      '<button type="button" class="utility" id="battle-help">' +
      `${label}</button>`;
    if (mode === "versus")
      desktop.innerHTML =
        hint(["W", "A", "S", "D"], "玩家 1 移動") +
        hint(["↑", "←", "↓", "→"], "玩家 2 移動") +
        pad +
        help("查看攻擊按鍵");
    else if (mode === "watch")
      desktop.innerHTML =
        "<span>兩邊都由電腦操作，坐著看就好。</span>" + help("指令表");
    else
      desktop.innerHTML =
        hint(["A", "D"], "移動・連按衝刺") +
        hint(["W"], "跳躍") +
        hint(["S"], "下蹲") +
        CONTROLS.slice(4)
          .map(({ name, labels }) => hint([labels[0]], name))
          .join("") +
        pad +
        help("指令表");
    get("battle-help")?.addEventListener("click", openHelp);

    const players = mode === "versus" ? [0, 1] : [0];
    touchControls.innerHTML = players
      .map((index) => {
        const button = ({ action, name }) =>
          '<button type="button" class="utility touch-button" ' +
          `data-action="${action}" aria-label="${name}">` +
          `${TOUCH_LABEL[action] ?? name}</button>`;
        const heading = index === 0 ? "玩家 1" : "玩家 2";
        // 方向鍵排成十字（跳在上、蹲在下），手指可以在上面滑動換方向
        const group = (name, list) =>
          `<div class="touch-group ${name}">${list.map(button).join("")}</div>`;
        return (
          `<div class="touch-pad" data-player="${index}" ` +
          `aria-label="${heading}" role="group">` +
          (mode === "versus" ? `<p>${heading}</p>` : "") +
          group("move", CONTROLS.slice(0, 4)) +
          group("actions", CONTROLS.slice(4)) +
          "</div>"
        );
      })
      .join("");
    for (const [index, panel] of hud.entries()) {
      const pad = touchControls.querySelector(`[data-player="${index}"]`);
      panel.touchSkill = pad?.querySelector('[data-action="special"]');
      panel.touchSkill2 = pad?.querySelector('[data-action="skill2"]');
      panel.touchSuper = pad?.querySelector('[data-action="super"]');
      panel.touchDodge = pad?.querySelector('[data-action="dodge"]');
    }
  }

  function renderSound() {
    get("sound-button").setAttribute("aria-pressed", audio.enabled);
    text(get("sound-label"), audio.enabled ? "音效開啟" : "音效關閉");
    get("music-button").setAttribute("aria-pressed", audio.musicEnabled);
    text(get("music-button"), audio.musicEnabled ? "配樂開啟" : "配樂關閉");
  }

  function collectHud(id, powerId) {
    const hud = get(id);
    const power = get(powerId);
    const index = id === "left-hud" ? 0 : 1;
    // 技能一、技能二、閃避：底色就是冷卻進度，冷卻中顯示剩餘秒數
    const row = document.createElement("div");
    row.className = "skills";
    const chips = {};
    for (const action of ["special", "skill2", "dodge"]) {
      const root = document.createElement("span");
      root.className = "skill-chip";
      root.innerHTML = "<i></i><kbd></kbd><b></b><em></em>";
      row.append(root);
      chips[action] = {
        root,
        key: root.querySelector("kbd"),
        name: root.querySelector("b"),
        time: root.querySelector("em"),
      };
    }
    text(chips.dodge.name, "閃避");
    power.append(row);
    const combo = document.createElement("div");
    combo.className = "combo-display" + (index ? " right" : "");
    combo.hidden = true;
    arena.append(combo);
    const cutin = document.createElement("div");
    cutin.className = "skill-cutin" + (index ? " right" : "");
    cutin.hidden = true;
    cutin.setAttribute("role", "status");
    cutin.innerHTML =
      '<img alt="">' +
      "<div><small>大招發動</small><strong></strong></div>" +
      '<i class="cutin-streaks" aria-hidden="true"></i>';
    arena.append(cutin);
    return {
      root: hud,
      combo,
      cutin,
      cutinRemaining: 0,
      comboShown: 0,
      chips,
      portrait: hud.querySelector("img"),
      name: hud.querySelector(".hud-name"),
      side: hud.querySelector(".hud-side"),
      pips: [...hud.querySelectorAll(".hud-rounds span")],
      health: hud.querySelector(".health"),
      healthFill: hud.querySelector(".gauge-fill"),
      lag: hud.querySelector(".gauge-lag"),
      lagValue: 100,
      burst: power.querySelector(".burst-status"),
      superKey: power.querySelector(".super-name kbd"),
      meterText: power.querySelector(".super-value"),
      meter: power.querySelector(".power-gauge"),
      meterFill: power.querySelector(".gauge-fill"),
      power,
    };
  }

  const hud = [
    collectHud("left-hud", "left-power"),
    collectHud("right-hud", "right-power"),
  ];

  function setGauge(element, fill, value) {
    const displayed = String(Math.floor(value));
    if (element.getAttribute("aria-valuenow") !== displayed)
      element.setAttribute("aria-valuenow", displayed);
    fill.style.setProperty("--amount", value / 100);
  }

  function setChip({ root, time }, remaining, total) {
    root.style.setProperty("--amount", 1 - remaining / total);
    const ready = String(remaining <= 0);
    if (root.dataset.ready !== ready) root.dataset.ready = ready;
    text(time, remaining > 0 ? remaining.toFixed(1) : "");
  }

  function renderHud(dt) {
    const seconds = Math.ceil(match.remaining);
    const shown = match.training ? "∞" : String(seconds);
    if (clock.textContent !== shown) {
      clock.textContent = shown;
      clock.dateTime = `PT${seconds}S`;
    }
    clock.dataset.urgent = !match.training && seconds <= 10;
    text(roundLabel, `第 ${match.round} 回合`);
    for (const [index, panel] of hud.entries()) {
      const fighter = match.fighters[index];
      panel.cutinRemaining = Math.max(0, panel.cutinRemaining - dt);
      panel.cutin.hidden = panel.cutinRemaining === 0;
      const comboVisible =
        fighter.combo >= 2 &&
        match.elapsed - fighter.lastHit <= 1.15 &&
        match.phase !== "intro";
      panel.combo.hidden = !comboVisible;
      if (comboVisible && panel.comboShown !== fighter.combo) {
        panel.comboShown = fighter.combo;
        panel.combo.innerHTML =
          `<b>${fighter.combo}</b> 連擊` +
          `<small>${fighter.comboDamage} 傷害</small>`;
        panel.combo.classList.remove("pop");
        void panel.combo.offsetWidth;
        panel.combo.classList.add("pop");
        stats[index].maxCombo = Math.max(stats[index].maxCombo, fighter.combo);
      }
      if (!comboVisible) panel.comboShown = 0;
      const { profile } = fighter;
      setChip(
        panel.chips.special,
        fighter.specialCooldown,
        profile.special.cooldown,
      );
      setChip(
        panel.chips.skill2,
        fighter.skill2Cooldown,
        profile.skill2.cooldown,
      );
      setChip(panel.chips.dodge, fighter.dodgeCooldown, DODGE_COOLDOWN);
      panel.burst.dataset.ready = fighter.meter >= 50;
      panel.lagValue = Math.max(fighter.hp, panel.lagValue - 52 * dt);
      panel.lag.style.setProperty("--amount", panel.lagValue / 100);
      setGauge(panel.health, panel.healthFill, fighter.hp);
      panel.health.dataset.low = fighter.hp > 0 && fighter.hp <= 25;
      setGauge(panel.meter, panel.meterFill, fighter.meter);
      const skillReady = fighter.specialCooldown <= 0;
      panel.power.dataset.ready = fighter.meter >= 100;
      if (panel.touchSkill) {
        text(
          panel.touchSkill,
          skillReady
            ? "技一"
            : `技一 ${fighter.specialCooldown.toFixed(1)}`,
        );
        text(
          panel.touchSkill2,
          fighter.skill2Cooldown <= 0
            ? "技二"
            : `技二 ${fighter.skill2Cooldown.toFixed(1)}`,
        );
        text(
          panel.touchSuper,
          fighter.meter >= 100
            ? "大招就緒"
            : `大招 ${Math.floor(fighter.meter)}%`,
        );
        text(
          panel.touchDodge,
          fighter.dodgeCooldown > 0
            ? `閃避 ${fighter.dodgeCooldown.toFixed(1)}`
            : "閃避",
        );
        panel.touchSuper.dataset.ready = fighter.meter >= 100;
      }
      text(
        panel.meterText,
        fighter.meter >= 100 ? "就緒" : `${Math.floor(fighter.meter)}%`,
      );
      for (const [pipIndex, pip] of panel.pips.entries())
        pip.classList.toggle("won", match.score[index] > pipIndex);
    }
  }

  function playerLabel(index) {
    if (match.demo) return index === 0 ? "電腦 1" : "電腦 2";
    return index === 0
      ? "玩家 1"
      : match.training
        ? "木樁"
        : match.cpu
          ? "電腦"
          : "玩家 2";
  }

  function showAnnouncement(heading, subtitle, tone) {
    if (!heading) {
      announcement.hidden = true;
      return;
    }
    announcement.dataset.tone = tone;
    text(announcement.querySelector("strong"), heading);
    text(announcement.querySelector("span"), subtitle);
    announcement.hidden = false;
  }

  function renderAnnouncement() {
    if (match.phase === "intro") {
      if (match.training)
        showAnnouncement(
          "練習模式",
          `${match.profiles[0].name} 對 木樁`,
          "round",
        );
      else
        showAnnouncement(
          `第 ${match.round} 回合`,
          (arcade ? `街機第 ${arcade.stage + 1} 戰・` : "") +
            `${match.profiles[0].name} 對 ${match.profiles[1].name}`,
          "round",
        );
    } else if (
      match.phase === "fight" &&
      match.phaseTime < 0.52 &&
      !hud.some((panel) => panel.cutinRemaining > 0)
    ) {
      showAnnouncement("開戰", "", "fight");
    } else if (match.phase === "round-end") {
      const { winner, reason } = match.result;
      let label =
        winner === null ? "本回合重打" : `${playerLabel(winner)} 拿下回合`;
      if (match.result.perfect) label += "・完美勝利";
      const heading =
        winner === null ? "平手" : reason === "ko" ? "K.O." : "時間到";
      showAnnouncement(heading, label, "end");
    } else {
      showAnnouncement();
    }
  }

  function showResult() {
    audio.setBattle(false);
    const { winner } = match.result;
    let label =
      match.cpu && !match.demo
        ? winner === 0
          ? "你贏了"
          : "電腦獲勝"
        : `${playerLabel(winner)} 獲勝`;
    let next = "再戰一場";
    if (arcade) {
      arcade.won = winner === 0;
      const last = arcade.stage === arcade.order.length - 1;
      if (!arcade.won)
        [label, next] = [`第 ${arcade.stage + 1} 戰落敗`, "重新挑戰本戰"];
      else if (last) [label, next] = ["街機挑戰制霸！", "再挑戰一次"];
      else [label, next] = [`第 ${arcade.stage + 1} 戰勝利！`, "下一戰"];
    }
    get("rematch-button").innerHTML =
      `${next}<span class="chevron" aria-hidden="true"></span>`;
    text(get("result-title"), label);
    text(
      get("result-score"),
      `回合比分 ${match.score[0]} 比 ${match.score[1]}`,
    );
    // 整場的戰績：左右兩欄是雙方，中間是項目名稱
    const [a, b] = match.stats;
    const rows = [
      ["造成傷害", a.damage, b.damage],
      ["命中次數", a.hits, b.hits],
      ["最高連擊", a.maxCombo, b.maxCombo],
      ["精準防禦", a.perfect, b.perfect],
      ["投技成功", a.throws, b.throws],
    ];
    const names = match.profiles.map(
      ({ name }) => `<th scope="col">${name}</th>`,
    );
    const cell = (mine, other) => `<td data-best="${mine > other}">${mine}</td>`;
    get("result-stats").innerHTML =
      `<thead><tr>${names.join("<td></td>")}</tr></thead>` +
      `<tbody>${rows
        .map(
          ([name, left, right]) =>
            `<tr>${cell(left, right)}` +
            `<th scope="row">${name}</th>${cell(right, left)}</tr>`,
        )
        .join("")}</tbody>`;
    pauseButton.disabled = true;
    result.hidden = false;
    get("result-title").focus({ preventScroll: true });
    clearInputs();
  }

  function closeDialogs() {
    if (pauseDialog.open) pauseDialog.close();
    if (helpDialog.open) helpDialog.close();
  }

  // 街機挑戰：連續打敗另外三位，一位比一位強
  function opponentFor() {
    if (mode !== "arcade") return { rival: selection[1], level: difficulty };
    if (!arcade) {
      const order = FIGHTERS.filter((fighter) => fighter !== selection[0]).sort(
        () => Math.random() - 0.5,
      );
      arcade = { order, stage: 0, won: false };
    }
    return {
      rival: arcade.order[arcade.stage],
      level: ARCADE_LEVELS[Math.min(arcade.stage, ARCADE_LEVELS.length - 1)],
    };
  }

  function newRun() {
    arcade = null;
    startMatch();
  }

  function rematch() {
    if (arcade?.won) {
      if (arcade.stage < arcade.order.length - 1) arcade.stage += 1;
      else arcade = null;
    }
    startMatch();
  }

  function startMatch() {
    closeDialogs();
    clearInputs();
    audio.activate();
    if (mode !== "arcade") arcade = null;
    const { rival, level } = opponentFor();
    match = new Match(
      [selection[0], mode === "arcade" ? rival : selection[1]],
      {
        cpu: mode !== "versus",
        training: mode === "training",
        demo: mode === "watch",
        difficulty: level,
      },
    );
    for (const entry of stats) entry.maxCombo = 0;
    accumulator = 0;
    result.hidden = true;
    pauseButton.disabled = false;
    buildBattleControls();
    text(
      get("battle-mode"),
      mode === "solo" || mode === "watch"
        ? `${MODE_LABEL[mode]}・${DIFFICULTY[difficulty].label}`
        : mode === "arcade"
          ? [
              MODE_LABEL.arcade,
              `第 ${arcade.stage + 1} / ${arcade.order.length} 戰`,
              DIFFICULTY[level].label,
            ].join("・")
          : MODE_LABEL[mode],
    );
    for (const [index, panel] of hud.entries()) {
      panel.portrait.src = match.profiles[index].portrait;
      text(panel.name, match.profiles[index].name);
      text(panel.side, playerLabel(index));
      panel.lagValue = 100;
      panel.cutinRemaining = 0;
      panel.cutin.hidden = true;
      panel.power.dataset.fighter = match.profiles[index].id;
      panel.cutin.dataset.fighter = match.profiles[index].id;
      text(panel.chips.special.name, match.profiles[index].special.name);
      text(panel.chips.skill2.name, match.profiles[index].skill2.name);
      // 電腦操作的一方不用顯示按鍵
      const human = !match.demo && (index === 0 || !match.cpu);
      for (const [action, chip] of Object.entries(panel.chips)) {
        chip.key.hidden = !human;
        text(chip.key, keyLabel(action, index));
      }
      panel.superKey.hidden = !human;
      text(panel.superKey, keyLabel("super", index));
      panel.comboShown = 0;
      panel.combo.hidden = true;
    }
    selectScreen.hidden = true;
    battleScreen.hidden = false;
    window.scrollTo(0, 0);
    arena.focus({ preventScroll: true });
    handleEvents();
    renderHud(0);
    renderAnnouncement();
    renderer.draw(match, 0);
  }

  function backToSelection() {
    audio.setBattle(false);
    match = null;
    closeDialogs();
    clearInputs();
    battleScreen.hidden = true;
    selectScreen.hidden = false;
    get("select-title").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function openHelp() {
    audio.setBattle(false);
    clearInputs();
    if (!helpDialog.open) helpDialog.showModal();
  }

  function openPause() {
    audio.setBattle(false);
    if (!match || match.phase === "over" || pauseDialog.open || helpDialog.open)
      return;
    clearInputs();
    pauseDialog.showModal();
  }

  // 手把每一幀讀一次，由放開變成按下才算按一次
  function pollPads() {
    const list = navigator.getGamepads
      ? [...navigator.getGamepads()].filter((pad) => pad?.connected)
      : [];
    if (list.length !== padCount) {
      padCount = list.length;
      if (match) buildBattleControls();
    }
    pads.forEach((state, index) => {
      const pad = list[index];
      const now = new Set();
      if (pad) {
        for (const [button, action] of Object.entries(PAD_BUTTONS))
          if (pad.buttons[button]?.pressed) now.add(action);
        const [x = 0, y = 0] = pad.axes;
        if (pad.buttons[14]?.pressed || x < -0.45) now.add("left");
        if (pad.buttons[15]?.pressed || x > 0.45) now.add("right");
        if (pad.buttons[13]?.pressed || y > 0.55) now.add("crouch");
        if (pad.buttons[12]?.pressed || y < -0.7) now.add("jump");
        if (pad.buttons[9]?.pressed) now.add("start");
      }
      for (const action of now)
        if (!state.held.has(action)) state.pressed.push(action);
      state.held = now;
    });
    for (const [index, state] of pads.entries()) {
      for (const action of state.pressed.splice(0)) {
        if (action === "start") handleStart();
        else if (
          acceptsInput() &&
          !(index === 1 && match.cpu) &&
          !CONTROLS.find((entry) => entry.action === action)?.hold
        )
          queued[index].push(action);
      }
    }
  }

  function handleStart() {
    if (!selectScreen.hidden && !startButton.disabled) newRun();
    else if (pauseDialog.open) pauseDialog.close();
    else if (!result.hidden) rematch();
    else if (match) openPause();
  }

  function clearInputs() {
    for (const held of keyboard) held.clear();
    for (const actions of queued) actions.length = 0;
    for (const { button } of pointers.values())
      button.removeAttribute("data-held");
    pointers.clear();
  }

  function acceptsInput() {
    return (
      match && match.phase !== "over" && !pauseDialog.open && !helpDialog.open
    );
  }

  function pullInputs() {
    return keyboard.map((held, index) => {
      const pad = pads[index].held;
      const active = (action) =>
        held.has(action) ||
        pad.has(action) ||
        [...pointers.values()].some(
          (pointer) => pointer.index === index && pointer.action === action,
        );
      return {
        direction: Number(active("right")) - Number(active("left")),
        crouch: active("crouch"),
        guard: active("guard"),
        jumpHeld: active("jump"),
        autoGuard: true, // 按住後退就會防禦
        actions: queued[index].splice(0),
      };
    });
  }

  function handleEvents() {
    for (const event of match.drainEvents()) {
      if (event.type === "super-flash") {
        const panel = hud[event.fighter.index];
        panel.cutinRemaining = 1.05;
        panel.cutin.querySelector("img").src = event.fighter.profile.portrait;
        text(panel.cutin.querySelector("strong"), event.name);
        panel.cutin.classList.remove("play");
        void panel.cutin.offsetWidth;
        panel.cutin.classList.add("play");
      }
      // 被打中：那一邊的頭像與血條閃一下、抖一下
      if (event.type === "hit" || event.type === "armor") {
        const root = hud[event.fighter.index].root;
        root.classList.remove("hurt");
        void root.offsetWidth;
        root.classList.add("hurt");
      }
      renderer.cue(event);
      audio.cue(event);
      if (event.type === "round") for (const panel of hud) panel.lagValue = 100;
      if (event.type === "match-end") showResult();
    }
  }

  const STEP = 1 / 120; // 規則每秒跑 120 次，高更新率的螢幕才不會一頓一頓
  let lastTime = performance.now();
  let accumulator = 0;
  // 畫面順不順：累計最近的幀間隔，太慢就先把畫布調回 1 倍解析度，再關掉泛光
  const pace = { sum: 0, frames: 0 };

  function watchPace(dt) {
    if (renderer.lite || dt <= 0) return;
    pace.sum += dt;
    pace.frames += 1;
    if (pace.frames < 90) return;
    if (pace.sum / pace.frames > 0.021) {
      if (renderer.scale > 1) renderer.setScale(1);
      else renderer.lite = true;
    }
    pace.sum = pace.frames = 0;
  }

  function frame(now) {
    const dt = Math.max(0, Math.min(0.065, (now - lastTime) / 1000));
    lastTime = now;
    if (portalPaused || document.hidden) {
      accumulator = 0;
      requestAnimationFrame(frame);
      return;
    }
    pollPads();
    audio.setBattle(Boolean(acceptsInput()));
    audio.intense = Boolean(
      match && (match.remaining < 16 || match.fighters.some((f) => f.hp < 30)),
    );
    if (acceptsInput()) {
      const scaled = dt * match.timeScale(dt);
      accumulator += scaled;
      while (accumulator >= STEP) {
        match.step(STEP, pullInputs());
        accumulator -= STEP;
        handleEvents();
      }
      renderHud(dt);
      renderAnnouncement();
      const alpha = Math.min(1, accumulator / STEP);
      renderer.draw(match, scaled, alpha, STEP, dt);
      watchPace(dt);
    } else {
      accumulator = 0;
    }
    requestAnimationFrame(frame);
  }

  for (const button of modeButtons)
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      selectionSound();
      renderSelection();
    });
  for (const button of difficultyButtons)
    button.addEventListener("click", () => {
      difficulty = button.dataset.difficulty;
      try {
        localStorage.setItem("midnight-circuit-difficulty", difficulty);
      } catch {
        /* Storage can be disabled. */
      }
      selectionSound();
      renderSelection();
    });
  for (const button of seatButtons)
    button.addEventListener("click", () => {
      seat = Number(button.dataset.seat);
      selectionSound();
      renderSelection();
    });

  roster.addEventListener("keydown", (event) => {
    const index = choiceButtons.indexOf(event.target);
    if (
      index === -1 ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)
    )
      return;
    event.preventDefault();
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[
      event.code
    ];
    choiceButtons[
      (index + delta + choiceButtons.length) % choiceButtons.length
    ].focus();
  });

  // 這個鍵現在屬於誰、做什麼；對手是電腦時，方向鍵與 Z X C V B 也歸玩家 1
  function bindingFor(code) {
    const binding = keyMap.get(code);
    if (binding && !(binding.index === 1 && match?.cpu)) return binding;
    const action = match?.cpu && SOLO_KEYS[code];
    if (!action) return null;
    const { hold } = CONTROLS.find((entry) => entry.action === action);
    return { index: 0, action, hold };
  }

  document.addEventListener("keydown", (event) => {
    if (!acceptsInput() || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.code === "Escape") {
      event.preventDefault();
      openPause();
      return;
    }
    const binding = bindingFor(event.code);
    if (!binding) return;
    if (event.code === "Space" && event.target instanceof HTMLButtonElement)
      return;
    event.preventDefault();
    // 出招鍵只送出一次，但仍記住有沒有按著（跳躍高度會用到）
    if (!binding.hold && !event.repeat)
      queued[binding.index].push(binding.action);
    keyboard[binding.index].add(binding.action);
  });

  document.addEventListener("keyup", (event) => {
    const binding = bindingFor(event.code);
    if (binding) keyboard[binding.index].delete(binding.action);
  });

  touchControls.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !acceptsInput() || event.button !== 0) return;
    event.preventDefault();
    const action = button.dataset.action;
    const index = Number(button.closest("[data-player]").dataset.player);
    button.setPointerCapture(event.pointerId);
    button.dataset.held = "true";
    pointers.set(event.pointerId, { action, index, button });
    if (!CONTROLS.find((entry) => entry.action === action).hold)
      queued[index].push(action);
  });

  // 在方向鍵上滑動：手指移到另一顆方向鍵就換成那個方向，不必放開再按
  touchControls.addEventListener("pointermove", (event) => {
    const held = pointers.get(event.pointerId);
    if (!held || !held.button.closest(".touch-group.move")) return;
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-action]");
    if (!under || under === held.button) return;
    if (under.closest("[data-player]") !== held.button.closest("[data-player]"))
      return;
    if (!under.closest(".touch-group.move")) return;
    held.button.removeAttribute("data-held");
    under.dataset.held = "true";
    held.button = under;
    held.action = under.dataset.action;
    if (!CONTROLS.find((entry) => entry.action === held.action).hold)
      queued[held.index].push(held.action);
  });

  function releasePointer(event) {
    const held = pointers.get(event.pointerId);
    if (!held) return;
    pointers.delete(event.pointerId);
    if (![...pointers.values()].some(({ button }) => held.button === button))
      held.button.removeAttribute("data-held");
  }

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    touchControls.addEventListener(type, releasePointer);

  // 僅接受同來源網站父頁的訊息；返回專區後不自動恢復戰鬥。
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== location.origin ||
      event.data?.type !== "akane-portal-state"
    )
      return;
    portalPaused = event.data.paused === true;
    clearInputs();
    if (portalPaused) {
      openPause();
      audio.setBattle(false);
      audio.context?.suspend().catch(() => {});
    } else {
      if (audio.context?.state === "suspended")
        audio.context.resume().catch(() => {});
      // 暫停視窗是在畫面藏起來時打開的，回來後把焦點放到「繼續對戰」
      if (pauseDialog.open) get("resume-button").focus();
    }
  });
  window.addEventListener("blur", clearInputs);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) openPause();
  });
  get("help-button").addEventListener("click", openHelp);
  get("music-button").addEventListener("click", () => {
    audio.setMusicEnabled(!audio.musicEnabled);
    renderSound();
  });
  get("sound-button").addEventListener("click", () => {
    audio.setEnabled(!audio.enabled);
    renderSound();
  });
  get("help-dialog")
    .querySelector("[data-close]")
    .addEventListener("click", () => helpDialog.close());
  for (const dialog of [helpDialog, pauseDialog])
    dialog.addEventListener("close", () => {
      if (acceptsInput()) arena.focus({ preventScroll: true });
    });
  startButton.addEventListener("click", newRun);
  pauseButton.addEventListener("click", openPause);
  get("resume-button").addEventListener("click", () => pauseDialog.close());
  get("pause-back").addEventListener("click", backToSelection);
  get("restart-button").addEventListener("click", startMatch);
  get("result-back").addEventListener("click", backToSelection);
  get("rematch-button").addEventListener("click", rematch);
  window.addEventListener("gamepadconnected", () => pollPads());
  window.addEventListener("gamepaddisconnected", () => pollPads());

  renderSelection();
  renderSound();
  buildHelp();
  renderer.ready
    .then(() => {
      startButton.disabled = false;
    })
    .catch((error) => {
      text(startButton, "素材載入失敗");
      startButton.title = error.message;
    });
  requestAnimationFrame(frame);
})();
