/* 檔案導讀：鬥士、招式、按鍵與電腦難度的資料。規則在 match.js。

   招式的時間單位是秒、距離單位是場地像素（場地寬 1280）。
   strike 的 range 是「出招者中心到對手身體邊緣」的距離：
   判定時會再加上對手的身體半寬，所以拳頭碰到身體就算打中；
   active 是拳腳伸出去之後，判定維持幾秒。
   每一招靠近對手的方式（match.js 的 approach 與 moveSpeed）：
     contact 拳腳剛好碰到對手時，兩人中心的距離（鬥士的 contact 可以個別指定）
     step    跟步：差這麼多以內，起手時自動往前補上
     rush    衝步：再遠這麼多以內，先衝到面前才出手
     travel  招式本身的突進；track 代表會盯著對手，停在 contact 的距離 */
(() => {
  const game = (globalThis.Midnight = {});

  game.FIELD = { width: 1280, height: 720, ground: 600, left: 53, right: 1227 };
  game.ROUND_SECONDS = 60;
  game.ROUNDS_TO_WIN = 2;
  game.START_METER = 32;

  function strike(at, range, damage, options = {}) {
    return {
      at,
      range,
      damage,
      low: 90,
      high: 181,
      knock: 170,
      stun: 0.23,
      active: 0.06,
      ...options,
    };
  }

  function projectile(at, damage, shape, options) {
    return {
      at,
      damage,
      projectile: { shape, ...options },
      knock: 210,
      stun: 0.27,
      effect: shape === "ice" ? "ice" : "quake",
    };
  }

  game.NORMALS = {
    // 輕攻：打中或被擋下後再按一次，依序接第二、第三段
    light: {
      duration: 0.28,
      air: true,
      contact: 190,
      step: 74,
      rush: 150,
      chain: "light2",
      events: [strike(0.08, 188, 7, { low: 80, knock: 96, stun: 0.26 })],
    },
    light2: {
      duration: 0.31,
      contact: 200,
      step: 96,
      rush: 130,
      chain: "light3",
      events: [strike(0.09, 198, 7, { low: 80, knock: 104, stun: 0.28 })],
    },
    light3: {
      duration: 0.48,
      contact: 194,
      step: 124,
      rush: 130,
      events: [
        strike(0.13, 200, 9, {
          low: 50,
          high: 200,
          knock: 300,
          stun: 0.37,
          active: 0.08,
        }),
      ],
    },
    heavy: {
      duration: 0.47,
      air: true,
      contact: 216,
      step: 140,
      rush: 170,
      events: [
        strike(0.17, 222, 14, {
          low: 100,
          high: 224,
          knock: 290,
          stun: 0.38,
          active: 0.08,
        }),
      ],
    },
    // 蹲下 + 輕攻：快速的下段踢
    crouchLight: {
      chain: "light2",
      duration: 0.28,
      contact: 166,
      step: 66,
      low: true,
      events: [
        strike(0.085, 168, 6, {
          low: 10,
          high: 104,
          knock: 90,
          stun: 0.26,
          lowHit: true,
        }),
      ],
    },
    // 蹲下 + 重攻：下段掃腿，必須蹲防才擋得住，命中會把對手掃倒。
    sweep: {
      name: "掃腿",
      duration: 0.56,
      low: true,
      contact: 190,
      step: 120,
      events: [
        strike(0.18, 200, 11, {
          low: 0,
          high: 50,
          knock: 190,
          stun: 0.46,
          launch: 300,
          lowHit: true,
          active: 0.09,
        }),
      ],
    },
    // 投技：近身抓住對手，無視防禦；被抓的一方可在瞬間按投技掙脫。
    throw: {
      name: "投技",
      duration: 0.52,
      whiffDuration: 0.62,
      contact: 112,
      step: 84,
      events: [
        { at: 0.09, grab: 108 },
        {
          at: 0.4,
          toss: strike(0.4, 0, 13, { knock: 340, stun: 0.6, launch: 540 }),
        },
      ],
    },
  };

  // clip：動畫要播的動作名稱（animation.js 用）
  for (const [key, spec] of Object.entries(game.NORMALS)) spec.clip = key;

  // 爆氣：受擊硬直中按閃避，消耗 50% 能量強制脫離連段並震開對手。
  game.BURST = {
    name: "爆氣",
    duration: 0.42,
    invulnerable: [0, 0.38],
    burstMove: true,
    events: [{ at: 0.05, burst: 270 }],
  };
  game.BURST_COST = 50;

  game.FIGHTERS = [
    {
      id: "thunder",
      name: "雷隼",
      role: "突進型",
      color: "#ffc44c",
      size: 238,
      speed: 278,
      weight: 1,
      arm: 1, // 手長的倍率，影響攻擊距離
      // 每種普攻要停在多遠，拳腳才剛好碰到人（配合 animation.js 的姿勢量出來的）
      contact: {
        light: 192,
        light2: 208,
        light3: 188,
        heavy: 220,
        crouchLight: 146,
        sweep: 174,
      },
      power: 1.06, // 傷害倍率
      guts: 0.98, // 受到的傷害倍率（越低越耐打）
      summary: "快速拉近距離，用連擊壓制對手。",
      frames: {
        idle: [77, 6, 235, 362, 114],
        punch: [39, 383, 333, 347, 135],
        crouch: [69, 753, 225, 266, 111],
      },
      special: {
        name: "雷步突拳",
        description: "向前衝刺，打出一道帶電重拳。",
        duration: 0.49,
        cooldown: 2.6,
        contact: 204,
        travel: { speed: 1150, until: 0.24, track: true, min: 160 },
        events: [
          strike(0.24, 212, 18, {
            low: 50,
            high: 200,
            knock: 380,
            stun: 0.34,
            active: 0.09,
            effect: "bolt",
          }),
        ],
      },
      skill2: {
        name: "雷霆升龍",
        description: "起手無敵的升空雷拳，專門對付跳躍與近身壓制。",
        duration: 0.66,
        cooldown: 3.4,
        invulnerable: [0, 0.17],
        key: "rise",
        events: [
          { at: 0.07, rise: 700, drift: 170 },
          strike(0.11, 168, 9, {
            low: 20,
            high: 260,
            knock: 70,
            stun: 0.42,
            launch: 580,
            active: 0.1,
            effect: "bolt",
          }),
          strike(0.25, 184, 11, {
            low: 60,
            high: 350,
            knock: 280,
            stun: 0.45,
            launch: 440,
            active: 0.12,
            effect: "bolt",
          }),
        ],
      },
      super: {
        name: "雷鳴連擊",
        description: "以三段追擊把對手逼向場邊。",
        duration: 0.92,
        contact: 190,
        travel: { speed: 1300, until: 0.64, track: true, min: 80 },
        events: [
          strike(0.25, 206, 11, {
            low: 44,
            high: 220,
            knock: 90,
            stun: 0.34,
            active: 0.12,
            effect: "bolt",
          }),
          strike(0.42, 214, 11, {
            low: 44,
            high: 230,
            knock: 93,
            stun: 0.36,
            active: 0.14,
            effect: "bolt",
          }),
          strike(0.63, 224, 17, {
            low: 30,
            high: 240,
            knock: 520,
            stun: 0.5,
            launch: 360,
            active: 0.12,
            effect: "bolt",
          }),
        ],
      },
    },
    {
      id: "frost",
      name: "霜弦",
      role: "遠攻型",
      color: "#79d9f7",
      size: 230,
      speed: 252,
      weight: 0.96,
      arm: 0.95,
      contact: {
        light: 182,
        light2: 197,
        light3: 178,
        heavy: 176,
        crouchLight: 141,
        sweep: 170,
      },
      power: 1.02,
      guts: 0.96,
      summary: "拉開距離，以不同高度的冰彈牽制。",
      frames: {
        idle: [462, 11, 224, 357, 102],
        punch: [424, 386, 313, 344, 128],
        crouch: [453, 756, 206, 263, 96],
      },
      special: {
        name: "冰弧",
        description: "射出高速冰彈。對手可以蹲低躲過。",
        duration: 0.44,
        cooldown: 1.9,
        events: [
          projectile(0.19, 15, "ice", {
            speed: 740,
            height: 173,
            radius: 21,
            life: 1.65,
          }),
        ],
      },
      skill2: {
        name: "冰棱陣",
        description: "在對手腳下埋下冰棱，片刻後破土而出。移動或閃避可以躲開。",
        duration: 0.5,
        cooldown: 3.6,
        events: [
          {
            at: 0.22,
            trap: {
              delay: 0.55,
              width: 132,
              height: 190,
              damage: 16,
              knock: 120,
              stun: 0.5,
              launch: 470,
              effect: "ice",
            },
          },
        ],
      },
      super: {
        name: "極地風暴",
        description: "發射三道不同高度的冰刃封鎖去路。",
        duration: 0.79,
        events: [
          projectile(0.21, 11, "ice", {
            speed: 606,
            height: 58,
            radius: 31,
            life: 1.9,
          }),
          projectile(0.35, 12, "ice", {
            speed: 655,
            height: 135,
            radius: 30,
            life: 1.9,
          }),
          projectile(0.5, 15, "ice", {
            speed: 715,
            height: 202,
            radius: 33,
            life: 1.9,
          }),
        ],
      },
    },
    {
      id: "lion",
      name: "赤獅",
      role: "重擊型",
      color: "#ff895f",
      size: 259,
      speed: 226,
      weight: 1.18,
      arm: 1.12,
      contact: {
        light: 220,
        light2: 238,
        light3: 226,
        heavy: 238,
        crouchLight: 160,
        sweep: 194,
      },
      power: 1.14,
      guts: 0.91,
      summary: "步伐沉穩，擅長用重拳和地面震波逼退對手。",
      frames: {
        idle: [817, 10, 264, 360, 128],
        punch: [791, 384, 359, 348, 143],
        crouch: [813, 760, 256, 261, 125],
      },
      special: {
        name: "裂地震波",
        description: "貼地震波會打中蹲著的對手，可以跳過。",
        duration: 0.61,
        cooldown: 2.8,
        events: [
          projectile(0.27, 19, "quake", {
            speed: 600,
            height: 18,
            radius: 27,
            life: 1.1,
          }),
        ],
      },
      skill2: {
        name: "獅王衝撞",
        description: "帶霸體的肩撞，硬吃一擊也不會中斷，還能擊破防禦。",
        duration: 0.72,
        cooldown: 3.8,
        armor: [0.04, 0.5],
        contact: 138,
        travel: { speed: 1150, from: 0.12, until: 0.4, track: true, min: 260 },
        events: [
          strike(0.36, 168, 19, {
            low: 30,
            high: 200,
            knock: 430,
            stun: 0.42,
            guardBreak: true,
            active: 0.12,
            effect: "quake",
          }),
        ],
      },
      super: {
        name: "熔核震爆",
        description: "震爆以自身為中心，能擊飛身旁的對手。",
        duration: 0.96,
        contact: 170,
        travel: { speed: 620, from: 0.06, until: 0.36, track: true, min: 0 },
        events: [
          strike(0.39, 340, 37, {
            low: 0,
            high: 190,
            knock: 500,
            stun: 0.58,
            launch: 520,
            radial: true,
            active: 0.14,
            effect: "quake",
          }),
        ],
      },
    },
    {
      id: "shade",
      name: "影燕",
      role: "反擊型",
      color: "#d5a0fb",
      size: 231,
      speed: 306,
      weight: 0.91,
      arm: 0.94,
      contact: {
        light: 175,
        light2: 191,
        light3: 176,
        heavy: 178,
        crouchLight: 144,
        sweep: 171,
      },
      power: 1.0,
      guts: 0.99,
      summary: "靠靈活走位換邊，從對手背後切入。",
      frames: {
        idle: [1229, 4, 232, 363, 115],
        punch: [1213, 380, 309, 350, 124],
        crouch: [1221, 752, 224, 267, 110],
      },
      special: {
        name: "折影閃擊",
        description: "穿到對手背後出手，閃身時短暫無敵。",
        duration: 0.48,
        cooldown: 2.75,
        invulnerable: [0.07, 0.21],
        events: [
          { at: 0.13, blink: 440 },
          strike(0.22, 190, 16, {
            low: 40,
            high: 200,
            knock: 300,
            stun: 0.33,
            active: 0.09,
            effect: "shade",
          }),
        ],
      },
      skill2: {
        name: "影返",
        description:
          "架起反擊架勢，被打中瞬間瞬移到對手背後重擊，連飛行道具也能反制。",
        duration: 0.6,
        cooldown: 3.2,
        counter: [0.04, 0.44],
        events: [],
      },
      super: {
        name: "雙影夾擊",
        description: "兩次高速換邊，從不同方向發動追擊。",
        duration: 0.87,
        invulnerable: [0.13, 0.34],
        events: [
          { at: 0.2, blink: 760 },
          strike(0.27, 190, 17, {
            low: 24,
            high: 220,
            knock: 125,
            stun: 0.4,
            active: 0.12,
            effect: "shade",
          }),
          { at: 0.47, blink: 560 },
          strike(0.55, 208, 20, {
            low: 24,
            high: 230,
            knock: 450,
            stun: 0.5,
            active: 0.12,
            effect: "shade",
          }),
        ],
      },
    },
  ];

  // Follow-up performed automatically when 影返 catches an attack.
  game.COUNTER_STRIKE = {
    name: "影返・斷影",
    duration: 0.46,
    invulnerable: [0, 0.2],
    events: [
      { at: 0.02, blink: 9999 },
      strike(0.1, 196, 22, {
        low: 30,
        high: 220,
        knock: 360,
        stun: 0.55,
        active: 0.1,
        effect: "shade",
      }),
    ],
  };

  /* 電腦難度（ai.js 使用）：
       think      多久想一次：[最短, 額外的隨機範圍] 秒
       reactTime  看到對手出招後，隔多久才反應：[最快, 最慢] 秒
       react      注意到飛行道具、陷阱、被投與被連段的機率
       guard      願意防禦的程度（實際防禦機率約為它的兩倍）
       wary       對手連續進攻時，決定守到他停手的機率
       confirm    打中後接連段的機率
       punish     看到對手揮空會懲罰的機率
       antiAir    對手跳進來時會對空的機率
       perfect    抓準時機打出精準防禦的機率
       rush       在遠一點的距離直接衝步出手的機率
       aggression 主動進攻的程度 */
  game.DIFFICULTY = {
    easy: {
      label: "簡單",
      think: [0.22, 0.24],
      reactTime: [0.28, 0.46],
      react: 0.35,
      guard: 0.16,
      wary: 0.54,
      confirm: 0.4,
      punish: 0.44,
      antiAir: 0.12,
      perfect: 0,
      rush: 0.1,
      aggression: 0.7,
    },
    normal: {
      label: "普通",
      think: [0.12, 0.15],
      reactTime: [0.17, 0.29],
      react: 0.75,
      guard: 0.36,
      wary: 0.66,
      confirm: 0.62,
      punish: 0.68,
      antiAir: 0.5,
      perfect: 0.05,
      rush: 0.22,
      aggression: 1,
    },
    hard: {
      label: "困難",
      think: [0.07, 0.08],
      reactTime: [0.11, 0.2],
      react: 0.9,
      guard: 0.45,
      wary: 0.78,
      confirm: 0.88,
      punish: 0.85,
      antiAir: 0.8,
      perfect: 0.18,
      rush: 0.26,
      aggression: 1.12,
    },
  };

  for (const fighter of game.FIGHTERS)
    fighter.portrait = `assets/${fighter.id}.jpg`;

  /* 按鍵：codes 的第一組是玩家 1、第二組是玩家 2，同一個動作可以有好幾個鍵。
     攻擊鍵排成上下兩排，由左到右越來越強：
       J 輕攻　K 重攻　L 技能一　／　U 投技　I 技能二　O 大招
     玩家 2 用數字鍵盤（或上排數字）照同樣的順序排。
     防禦預設是 F；左 Shift 也可以，但連按五下會跳出 Windows 的相黏鍵。 */
  game.CONTROLS = [
    {
      action: "left",
      name: "向左",
      labels: ["A", "←"],
      codes: [["KeyA"], ["ArrowLeft"]],
      hold: true,
    },
    {
      action: "right",
      name: "向右",
      labels: ["D", "→"],
      codes: [["KeyD"], ["ArrowRight"]],
      hold: true,
    },
    {
      action: "jump",
      name: "跳躍",
      labels: ["W", "↑"],
      codes: [["KeyW"], ["ArrowUp"]],
    },
    {
      action: "crouch",
      name: "下蹲",
      labels: ["S", "↓"],
      codes: [["KeyS"], ["ArrowDown"]],
      hold: true,
    },
    {
      action: "light",
      name: "輕攻",
      labels: ["J", "1"],
      codes: [["KeyJ"], ["Numpad1", "Digit1"]],
    },
    {
      action: "heavy",
      name: "重攻",
      labels: ["K", "2"],
      codes: [["KeyK"], ["Numpad2", "Digit2"]],
    },
    {
      action: "special",
      name: "技能一",
      labels: ["L", "3"],
      codes: [["KeyL"], ["Numpad3", "Digit3"]],
    },
    {
      action: "throw",
      name: "投技",
      labels: ["U", "4"],
      codes: [["KeyU"], ["Numpad4", "Digit4"]],
    },
    {
      action: "skill2",
      name: "技能二",
      labels: ["I", "5"],
      codes: [["KeyI"], ["Numpad5", "Digit5"]],
    },
    {
      action: "super",
      name: "大招",
      labels: ["O", "6"],
      codes: [["KeyO"], ["Numpad6", "Digit6"]],
    },
    {
      action: "dodge",
      name: "閃避",
      labels: ["Space", "0"],
      codes: [["Space"], ["Numpad0", "Digit0"]],
    },
    {
      action: "guard",
      name: "防禦",
      labels: ["F", "7"],
      codes: [["KeyF", "ShiftLeft"], ["Numpad7", "Digit7"]],
      hold: true,
    },
  ];

  /* 玩家 1 的第二套按鍵：右手方向鍵、左手 Z X C V B。
     本機雙人時方向鍵是玩家 2 的，所以只有其他模式才有。 */
  game.SOLO_KEYS = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "jump",
    ArrowDown: "crouch",
    KeyZ: "light",
    KeyX: "heavy",
    KeyC: "special",
    KeyV: "skill2",
    KeyB: "super",
    KeyG: "throw",
  };

  // 標準手把配置（Xbox 排列）。方向可用十字鍵或左搖桿。
  game.PAD_BUTTONS = {
    0: "jump",
    2: "light",
    3: "heavy",
    1: "special",
    5: "skill2",
    7: "super",
    4: "dodge",
    6: "guard",
  };
  game.PAD_LABELS = {
    jump: "A",
    light: "X",
    heavy: "Y",
    special: "B",
    skill2: "RB",
    super: "RT",
    dodge: "LB",
    guard: "LT",
    throw: "X+Y",
  };
})();
