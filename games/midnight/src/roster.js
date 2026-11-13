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
    light: {
      duration: 0.24,
      air: true,
      events: [strike(0.1, 137, 8, { low: 87, knock: 92, stun: 0.21 })],
    },
    heavy: {
      duration: 0.41,
      air: true,
      travel: { speed: 165, until: 0.21 },
      events: [
        strike(0.17, 179, 14, { low: 151, high: 218, knock: 215, stun: 0.34 }),
      ],
    },
    // 蹲下 + 重攻：下段掃腿，必須蹲防才擋得住，命中會把對手掃倒。
    sweep: {
      name: "掃腿",
      duration: 0.5,
      low: true,
      events: [
        strike(0.2, 168, 11, {
          low: 0,
          high: 46,
          knock: 150,
          stun: 0.5,
          launch: 300,
          lowHit: true,
        }),
      ],
    },
    // 投技：近身抓住對手，無視防禦；被抓的一方可在瞬間按投技掙脫。
    throw: {
      name: "投技",
      duration: 0.52,
      whiffDuration: 0.72,
      events: [
        { at: 0.09, grab: 122 },
        {
          at: 0.4,
          toss: strike(0.4, 0, 13, { knock: 300, stun: 0.6, launch: 520 }),
        },
      ],
    },
  };

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
      speed: 263,
      weight: 1,
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
        travel: { speed: 602, until: 0.25 },
        events: [
          strike(0.24, 180, 18, {
            low: 63,
            knock: 304,
            stun: 0.37,
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
          { at: 0.07, rise: 690, drift: 150 },
          strike(0.11, 142, 9, {
            low: 30,
            high: 250,
            knock: 70,
            stun: 0.42,
            launch: 560,
            effect: "bolt",
          }),
          strike(0.25, 150, 11, {
            low: 80,
            high: 330,
            knock: 260,
            stun: 0.45,
            launch: 420,
            effect: "bolt",
          }),
        ],
      },
      super: {
        name: "雷鳴連擊",
        description: "以三段追擊把對手逼向場邊。",
        duration: 0.92,
        travel: { speed: 495, until: 0.66 },
        events: [
          strike(0.25, 169, 11, {
            low: 54,
            knock: 90,
            stun: 0.29,
            effect: "bolt",
          }),
          strike(0.42, 183, 11, {
            low: 54,
            knock: 93,
            stun: 0.32,
            effect: "bolt",
          }),
          strike(0.63, 187, 17, {
            low: 48,
            knock: 465,
            stun: 0.48,
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
      speed: 239,
      weight: 0.96,
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
        cooldown: 2.1,
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
      speed: 202,
      weight: 1.18,
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
            speed: 550,
            height: 18,
            radius: 25,
            life: 0.77,
          }),
        ],
      },
      skill2: {
        name: "獅王衝撞",
        description: "帶霸體的肩撞，硬吃一擊也不會中斷，還能擊破防禦。",
        duration: 0.72,
        cooldown: 3.8,
        armor: [0.04, 0.5],
        travel: { speed: 560, from: 0.14, until: 0.44 },
        events: [
          strike(0.36, 152, 19, {
            low: 50,
            knock: 360,
            stun: 0.42,
            guardBreak: true,
            effect: "quake",
          }),
        ],
      },
      super: {
        name: "熔核震爆",
        description: "震爆以自身為中心，能擊飛身旁的對手。",
        duration: 0.96,
        events: [
          strike(0.39, 282, 37, {
            low: 0,
            high: 141,
            knock: 465,
            stun: 0.56,
            launch: 460,
            radial: true,
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
      speed: 302,
      weight: 0.91,
      summary: "靠靈活走位換邊，從對手背後切入。",
      frames: {
        idle: [1229, 4, 232, 363, 115],
        punch: [1213, 380, 309, 350, 124],
        crouch: [1221, 752, 224, 267, 110],
      },
      special: {
        name: "折影閃擊",
        description: "近距離穿到對手背後，閃身時短暫無敵。",
        duration: 0.48,
        cooldown: 2.75,
        invulnerable: [0.07, 0.21],
        events: [
          { at: 0.13, blink: 296 },
          strike(0.22, 167, 16, {
            low: 51,
            knock: 244,
            stun: 0.31,
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
          { at: 0.2, blink: 465 },
          strike(0.27, 158, 17, {
            low: 34,
            knock: 125,
            stun: 0.34,
            effect: "shade",
          }),
          { at: 0.47, blink: 345 },
          strike(0.55, 183, 20, {
            low: 34,
            knock: 402,
            stun: 0.47,
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
      strike(0.1, 175, 22, {
        low: 40,
        knock: 330,
        stun: 0.55,
        effect: "shade",
      }),
    ],
  };

  game.DIFFICULTY = {
    easy: {
      label: "簡單",
      think: [0.26, 0.22],
      react: 0.35,
      guard: 0.14,
      confirm: 0.1,
      aggression: 0.8,
    },
    normal: {
      label: "普通",
      think: [0.14, 0.17],
      react: 0.72,
      guard: 0.29,
      confirm: 0.45,
      aggression: 1,
    },
    hard: {
      label: "困難",
      think: [0.07, 0.08],
      react: 0.9,
      guard: 0.42,
      confirm: 0.85,
      aggression: 1.15,
    },
  };

  for (const fighter of game.FIGHTERS)
    fighter.portrait = `assets/${fighter.id}.jpg`;

  game.CONTROLS = [
    {
      action: "left",
      name: "向左",
      labels: ["A", "←"],
      codes: ["KeyA", "ArrowLeft"],
      hold: true,
    },
    {
      action: "right",
      name: "向右",
      labels: ["D", "→"],
      codes: ["KeyD", "ArrowRight"],
      hold: true,
    },
    {
      action: "jump",
      name: "跳躍",
      labels: ["W", "↑"],
      codes: ["KeyW", "ArrowUp"],
    },
    {
      action: "crouch",
      name: "下蹲",
      labels: ["S", "↓"],
      codes: ["KeyS", "ArrowDown"],
      hold: true,
    },
    {
      action: "light",
      name: "輕攻",
      labels: ["J", "1"],
      codes: ["KeyJ", "Digit1"],
    },
    {
      action: "heavy",
      name: "重攻",
      labels: ["U", "2"],
      codes: ["KeyU", "Digit2"],
    },
    {
      action: "special",
      name: "技能一",
      labels: ["K", "3"],
      codes: ["KeyK", "Digit3"],
    },
    {
      action: "skill2",
      name: "技能二",
      labels: ["I", "7"],
      codes: ["KeyI", "Digit7"],
    },
    {
      action: "super",
      name: "大招",
      labels: ["L", "4"],
      codes: ["KeyL", "Digit4"],
    },
    {
      action: "dodge",
      name: "閃避",
      labels: ["Space", "5"],
      codes: ["Space", "Digit5"],
    },
    {
      action: "guard",
      name: "防禦",
      labels: ["左 Shift", "6"],
      codes: ["ShiftLeft", "Digit6"],
      hold: true,
    },
    {
      action: "throw",
      name: "投技",
      labels: ["O", "8"],
      codes: ["KeyO", "Digit8"],
    },
  ];

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
