/* 檔案導讀：管理選角、對戰 UI 與輸入；網站返回暫停搜尋 akane-portal-state。 */
(() => {
  const {
    FIGHTERS,
    CONTROLS,
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
  };
  const ARCADE_LEVELS = ["easy", "normal", "hard"];
  // Multi-input commands shown in the help dialog.
  const COMMANDS = [
    ["衝刺／後撤", "連按兩下 → 或 ←", "衝刺中出招會帶著衝勁向前突進"],
    ["短跳", "輕點跳躍", "按住跳得高，輕點跳得低"],
    ["掃腿", "蹲下＋重攻", "下段攻擊，只能蹲著防禦，命中會掃倒對手"],
    [
      "投技",
      "輕攻＋重攻同時按（或 O / 8）",
      "無視防禦；被抓瞬間按投技可以拆投",
    ],
    ["上下段防禦", "防禦／蹲下＋防禦", "站防擋跳躍攻擊，蹲防擋掃腿與蹲踢"],
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
      <span class="choice-art"><img src="${fighter.portrait}" width="384" height="768" alt=""></span>
      <span><strong class="choice-name">${fighter.name}</strong><span class="choice-role">${fighter.role}</span></span>
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
    entry.codes.forEach((code, index) => keyMap.set(code, { index, ...entry }));
  const keyboard = [new Set(), new Set()];
  const queued = [[], []];
  const pointers = new Map();
  const touchControls = get("touch-controls");
  const pads = [
    { held: new Set(), pressed: [] },
    { held: new Set(), pressed: [] },
  ];
  let padCount = 0;

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
    get("difficulty").hidden = mode !== "solo";

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
    const keys = {
      "special-key": ["K", "3"],
      "skill2-key": ["I", "7"],
      "super-key": ["L", "4"],
    };
    for (const [id, labels] of Object.entries(keys)) {
      const key = get(id);
      key.hidden = cpuPreview;
      text(key, labels[seat]);
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
    const rows = CONTROLS.map(
      ({ action, name, labels }) =>
        `<tr><th scope="row">${name}</th><td><kbd>${labels[0]}</kbd></td><td><kbd>${labels[1]}</kbd></td><td><kbd>${padLabel(action)}</kbd></td></tr>`,
    );
    get("help-keys").innerHTML =
      `<thead><tr><th scope="col">動作</th><th scope="col">玩家 1</th><th scope="col">玩家 2</th><th scope="col">手把</th></tr></thead><tbody>${rows.join("")}</tbody>`;
    get("help-commands").innerHTML =
      `<thead><tr><th scope="col">指令</th><th scope="col">操作</th><th scope="col">效果</th></tr></thead><tbody>${COMMANDS.map(
        ([name, input, effect]) =>
          `<tr><th scope="row">${name}</th><td>${input}</td><td>${effect}</td></tr>`,
      ).join("")}</tbody>`;
  }

  function buildBattleControls() {
    const desktop = get("battle-keys");
    const keys = CONTROLS.slice(4)
      .map(({ name, labels }) => `<span><kbd>${labels[0]}</kbd>${name}</span>`)
      .join("");
    const padNote = padCount
      ? '<span class="pad-note">🎮 手把已連線</span>'
      : "";
    desktop.innerHTML =
      mode !== "versus"
        ? `<span><kbd>A</kbd><kbd>D</kbd>移動（連按衝刺）</span><span><kbd>W</kbd>跳躍</span><span><kbd>S</kbd>下蹲</span>${keys}<span><kbd>S</kbd>+<kbd>U</kbd>掃腿</span>${padNote}<button type="button" class="utility" id="battle-help">指令表</button>`
        : `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>玩家 1 移動</span><span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>玩家 2 移動</span>${padNote}<button type="button" class="utility" id="battle-help">查看攻擊按鍵</button>`;
    get("battle-help")?.addEventListener("click", openHelp);

    const players = mode === "versus" ? [0, 1] : [0];
    touchControls.innerHTML = players
      .map((index) => {
        const button = ({ action, name }) =>
          `<button type="button" class="utility touch-button" data-action="${action}">${name}</button>`;
        const heading = index === 0 ? "玩家 1" : "玩家 2";
        return `<div class="touch-pad" data-player="${index}" aria-label="${heading}" role="group">
        ${mode === "versus" ? `<p>${heading}</p>` : ""}
        <div class="touch-group">${CONTROLS.slice(0, 4).map(button).join("")}</div>
        <div class="touch-group actions">${CONTROLS.slice(4).map(button).join("")}</div>
      </div>`;
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
    const cooldowns = document.createElement("div");
    cooldowns.className = "cooldowns";
    cooldowns.innerHTML =
      '<span class="skill-name"></span><span class="skill2-name"></span><div class="cooldown-track"><i></i></div><div class="cooldown-track"><i></i></div><span class="dodge-status"></span>';
    power.append(cooldowns);
    const combo = document.createElement("div");
    combo.className = "combo-display" + (index ? " right" : "");
    combo.hidden = true;
    arena.append(combo);
    const cutin = document.createElement("div");
    cutin.className = "skill-cutin" + (index ? " right" : "");
    cutin.hidden = true;
    cutin.setAttribute("role", "status");
    cutin.innerHTML =
      '<img alt=""><div><small>大招發動</small><strong></strong></div><i class="cutin-streaks" aria-hidden="true"></i>';
    arena.append(cutin);
    return {
      combo,
      cutin,
      cutinRemaining: 0,
      comboShown: 0,
      cooldownFill: cooldowns.querySelectorAll(".cooldown-track i")[0],
      cooldown2Fill: cooldowns.querySelectorAll(".cooldown-track i")[1],
      skillName: cooldowns.querySelector(".skill-name"),
      skill2Name: cooldowns.querySelector(".skill2-name"),
      dodgeStatus: cooldowns.querySelector(".dodge-status"),
      portrait: hud.querySelector("img"),
      name: hud.querySelector(".hud-name"),
      side: hud.querySelector(".hud-side"),
      pips: [...hud.querySelectorAll(".hud-rounds span")],
      health: hud.querySelector(".health"),
      healthFill: hud.querySelector(".gauge-fill"),
      lag: hud.querySelector(".gauge-lag"),
      lagValue: 100,
      skill: power.querySelector(".skill-status"),
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
        panel.combo.innerHTML = `<b>${fighter.combo}</b> 連擊<small>${fighter.comboDamage} 傷害</small>`;
        panel.combo.classList.remove("pop");
        void panel.combo.offsetWidth;
        panel.combo.classList.add("pop");
        stats[index].maxCombo = Math.max(stats[index].maxCombo, fighter.combo);
      }
      if (!comboVisible) panel.comboShown = 0;
      panel.cooldownFill.style.setProperty(
        "--amount",
        1 - fighter.specialCooldown / fighter.profile.special.cooldown,
      );
      panel.cooldown2Fill.style.setProperty(
        "--amount",
        1 - fighter.skill2Cooldown / fighter.profile.skill2.cooldown,
      );
      text(
        panel.dodgeStatus,
        fighter.dodgeCooldown > 0
          ? "閃避 " + fighter.dodgeCooldown.toFixed(1) + "s"
          : "閃避就緒",
      );
      panel.lagValue = Math.max(fighter.hp, panel.lagValue - 52 * dt);
      panel.lag.style.setProperty("--amount", panel.lagValue / 100);
      setGauge(panel.health, panel.healthFill, fighter.hp);
      panel.health.dataset.low = fighter.hp > 0 && fighter.hp <= 25;
      setGauge(panel.meter, panel.meterFill, fighter.meter);
      const skillReady = fighter.specialCooldown <= 0;
      const skill2Ready = fighter.skill2Cooldown <= 0;
      const profile = fighter.profile;
      panel.skill.dataset.ready = skillReady && skill2Ready;
      text(
        panel.skill,
        skillReady && skill2Ready
          ? "技能就緒"
          : skillReady || skill2Ready
            ? "技能部分就緒"
            : "技能冷卻中",
      );
      text(
        panel.skillName,
        skillReady
          ? profile.special.name
          : `${profile.special.name} ${fighter.specialCooldown.toFixed(1)}s`,
      );
      text(
        panel.skill2Name,
        skill2Ready
          ? profile.skill2.name
          : `${profile.skill2.name} ${fighter.skill2Cooldown.toFixed(1)}s`,
      );
      panel.power.dataset.ready = fighter.meter >= 100;
      if (panel.touchSkill) {
        text(
          panel.touchSkill,
          skillReady
            ? "技能一"
            : `技能一 ${fighter.specialCooldown.toFixed(1)}`,
        );
        text(
          panel.touchSkill2,
          fighter.skill2Cooldown <= 0
            ? "技能二"
            : `技能二 ${fighter.skill2Cooldown.toFixed(1)}`,
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
        fighter.meter >= 100
          ? "大招就緒"
          : `大招 ${Math.floor(fighter.meter)}%`,
      );
      for (const [pipIndex, pip] of panel.pips.entries())
        pip.classList.toggle("won", match.score[index] > pipIndex);
    }
  }

  function playerLabel(index) {
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
          `${arcade ? `街機第 ${arcade.stage + 1} 戰・` : ""}${match.profiles[0].name} 對 ${match.profiles[1].name}`,
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
    let label = match.cpu
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
      `回合比分 ${match.score[0]} 比 ${match.score[1]}・最高連擊 ${stats[0].maxCombo} / ${stats[1].maxCombo}`,
    );
    pauseButton.disabled = true;
    result.hidden = false;
    get("result-title").focus({ preventScroll: true });
    clearInputs();
  }

  function closeDialogs() {
    if (pauseDialog.open) pauseDialog.close();
    if (helpDialog.open) helpDialog.close();
  }

  // Arcade: beat the other three fighters in a row, each tougher than the last.
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
      mode === "solo"
        ? `${MODE_LABEL.solo}・${DIFFICULTY[difficulty].label}`
        : mode === "arcade"
          ? `${MODE_LABEL.arcade}・第 ${arcade.stage + 1} / ${arcade.order.length} 戰・${DIFFICULTY[level].label}`
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
      text(panel.skillName, match.profiles[index].special.name);
      text(panel.skill2Name, match.profiles[index].skill2.name);
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

  // Gamepads are polled every frame; presses are detected on the rising edge.
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
      renderer.cue(event);
      audio.cue(event);
      if (event.type === "round") for (const panel of hud) panel.lagValue = 100;
      if (event.type === "match-end") showResult();
    }
  }

  const STEP = 1 / 60;
  let lastTime = performance.now();
  let accumulator = 0;

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
      renderer.draw(match, scaled, Math.min(1, accumulator / STEP));
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

  document.addEventListener("keydown", (event) => {
    if (!acceptsInput() || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.code === "Escape") {
      event.preventDefault();
      openPause();
      return;
    }
    const binding = keyMap.get(event.code);
    if (!binding || (binding.index === 1 && match.cpu)) return;
    if (event.code === "Space" && event.target instanceof HTMLButtonElement)
      return;
    event.preventDefault();
    // Non-hold keys are queued once, but still tracked as held (jump height depends on it).
    if (!binding.hold && !event.repeat)
      queued[binding.index].push(binding.action);
    keyboard[binding.index].add(binding.action);
  });

  document.addEventListener("keyup", (event) => {
    const binding = keyMap.get(event.code);
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
    } else if (audio.context?.state === "suspended") {
      audio.context.resume().catch(() => {});
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
