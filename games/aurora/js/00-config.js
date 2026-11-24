/*
 * ============================================================
 *  00-config.js ── 遊戲資料表
 * ------------------------------------------------------------
 *  這個檔案只放「數值與文字」，沒有任何邏輯。
 *  想調整武器傷害、角色血量、敵人強度、模式規則，改這裡就好。
 *
 *  目錄：
 *    1. CONFIG        基本物理與玩家參數
 *    2. WEAPONS       八把武器
 *    3. OPERATORS     五名可選幹員
 *    4. ENEMY_TYPES   生存／首領模式的敵人種類
 *    5. BOSSES        三個首領
 *    6. MODES         五種遊戲模式
 *    7. DIFFICULTIES  四種難度
 *    8. PERKS         生存模式的強化選項
 * ============================================================
 */

/* ---------- 1. 基本參數 ---------- */
const CONFIG = {
  VERSION: "1.0",

  // 玩家與電腦角色共用的身體尺寸（單位：公尺）
  BODY: {
    radius: 0.4, // 身體半徑（碰撞用的圓柱）
    height: 1.8, // 站立身高
    eye: 1.62, // 站立時眼睛高度
    crouchEye: 1.08, // 蹲下時眼睛高度
    step: 0.42, // 可以直接踏上去的最大台階高度
  },

  // 移動手感
  MOVE: {
    walk: 4.8, // 走路速度（公尺／秒）
    sprint: 7.4, // 衝刺速度
    crouch: 2.5, // 蹲走速度
    adsMult: 0.6, // 開鏡時的速度倍率
    accel: 14, // 地面加速度（越大越跟手）
    airAccel: 3.5, // 空中加速度
    jump: 6.4, // 起跳速度
    gravity: 19, // 重力加速度
  },

  // 隊伍顏色：0 = 我方（青藍）、1 = 敵方（紅橘）、其餘給個人亂鬥用
  TEAM_COLORS: [
    0x35d6ff, 0xff4a5e, 0xffc233, 0x7dff6a, 0xc77dff, 0xff8a3d, 0x5d8bff,
    0xff6ad5,
  ],

  GRENADE: {
    fuse: 2.2, // 引信時間（秒）
    speed: 17, // 投擲初速
    damage: 150, // 爆炸中心傷害
    radius: 7, // 爆炸半徑
  },

  MELEE: { damage: 75, range: 2.3, cooldown: 0.7 }, // 近戰（V 鍵）
};

/* ---------- 2. 武器 ----------
 *  kind      : "hitscan" 立即命中；"projectile" 會飛行的彈體
 *  auto      : 按住是否連發
 *  rpm       : 每分鐘射速
 *  damage    : 單發（單顆彈丸）傷害
 *  headMult  : 爆頭倍率
 *  falloff   : [開始衰減距離, 衰減結束距離, 最遠時剩餘傷害比例]
 *  mag/reserve : 彈匣容量／初始備彈
 *  reload    : 換彈秒數
 *  spreadHip / spreadAds : 腰射／開鏡的基本散布（度）
 *  bloom     : 每開一槍增加的散布（度）；spreadMax 為上限
 *  recoil    : [垂直後座, 水平後座]（度）
 *  adsFov    : 開鏡時的視野角度（越小放大越多）
 *  moveMult  : 持這把槍時的移動速度倍率
 *  botRange  : 電腦用這把槍時偏好的交戰距離 [近, 遠]
 *  botBurst  : 電腦一次連發的發數 [最少, 最多]
 */
const WEAPONS = {
  ar: {
    id: "ar",
    name: "VK-47 脈衝步槍",
    short: "VK-47",
    cls: "突擊步槍",
    kind: "hitscan",
    auto: true,
    rpm: 660,
    damage: 26,
    headMult: 1.8,
    falloff: [28, 65, 0.6],
    mag: 30,
    reserve: 150,
    reload: 1.9,
    pellets: 1,
    spreadHip: 1.5,
    spreadAds: 0.22,
    bloom: 0.32,
    spreadMax: 4.2,
    recoil: [0.85, 0.3],
    adsFov: 48,
    moveMult: 1.0,
    tracer: 0xffc266,
    sound: "ar",
    botRange: [9, 28],
    botBurst: [3, 6],
  },
  smg: {
    id: "smg",
    name: "蜂鳥 MP-9 衝鋒槍",
    short: "MP-9",
    cls: "衝鋒槍",
    kind: "hitscan",
    auto: true,
    rpm: 920,
    damage: 17,
    headMult: 1.6,
    falloff: [14, 38, 0.5],
    mag: 36,
    reserve: 216,
    reload: 1.55,
    pellets: 1,
    spreadHip: 1.9,
    spreadAds: 0.55,
    bloom: 0.26,
    spreadMax: 4.8,
    recoil: [0.55, 0.32],
    adsFov: 56,
    moveMult: 1.08,
    tracer: 0x8cf0ff,
    sound: "smg",
    botRange: [4, 15],
    botBurst: [5, 10],
  },
  shotgun: {
    id: "shotgun",
    name: "破城者 霰彈槍",
    short: "BREACHER",
    cls: "霰彈槍",
    kind: "hitscan",
    auto: false,
    rpm: 78,
    damage: 14,
    headMult: 1.4,
    falloff: [7, 24, 0.22],
    mag: 7,
    reserve: 42,
    reload: 2.5,
    pellets: 9,
    spreadHip: 4.6,
    spreadAds: 3.4,
    bloom: 0.8,
    spreadMax: 6.5,
    recoil: [3.6, 0.9],
    adsFov: 58,
    moveMult: 0.98,
    tracer: 0xffe9b0,
    sound: "shotgun",
    botRange: [3, 10],
    botBurst: [1, 1],
  },
  sniper: {
    id: "sniper",
    name: "極光 SR-50 狙擊槍",
    short: "SR-50",
    cls: "狙擊槍",
    kind: "hitscan",
    auto: false,
    rpm: 46,
    damage: 125,
    headMult: 2.6,
    falloff: [200, 300, 1],
    mag: 5,
    reserve: 30,
    reload: 2.9,
    pellets: 1,
    spreadHip: 5.5,
    spreadAds: 0.02,
    bloom: 1.2,
    spreadMax: 7,
    recoil: [4.2, 0.6],
    adsFov: 15,
    moveMult: 0.9,
    scope: true,
    tracer: 0xc9a2ff,
    sound: "sniper",
    botRange: [22, 60],
    botBurst: [1, 1],
  },
  lmg: {
    id: "lmg",
    name: "鐵幕 M-80 輕機槍",
    short: "M-80",
    cls: "輕機槍",
    kind: "hitscan",
    auto: true,
    rpm: 580,
    damage: 25,
    headMult: 1.6,
    falloff: [30, 70, 0.65],
    mag: 80,
    reserve: 240,
    reload: 3.7,
    pellets: 1,
    spreadHip: 2.4,
    spreadAds: 0.5,
    bloom: 0.2,
    spreadMax: 4.4,
    recoil: [0.7, 0.42],
    adsFov: 52,
    moveMult: 0.86,
    tracer: 0xff9a4d,
    sound: "lmg",
    botRange: [10, 30],
    botBurst: [8, 16],
  },
  pistol: {
    id: "pistol",
    name: "信使 P-12 手槍",
    short: "P-12",
    cls: "手槍",
    kind: "hitscan",
    auto: false,
    rpm: 400,
    damage: 31,
    headMult: 2.0,
    falloff: [16, 40, 0.5],
    mag: 12,
    reserve: Infinity,
    reload: 1.25,
    pellets: 1,
    spreadHip: 1.1,
    spreadAds: 0.2,
    bloom: 0.55,
    spreadMax: 4,
    recoil: [1.6, 0.4],
    adsFov: 58,
    moveMult: 1.1,
    tracer: 0xfff2c4,
    sound: "pistol",
    botRange: [5, 18],
    botBurst: [2, 4],
  },
  launcher: {
    id: "launcher",
    name: "流星 GL-4 榴彈砲",
    short: "GL-4",
    cls: "爆裂武器",
    kind: "projectile",
    auto: false,
    rpm: 58,
    damage: 135,
    headMult: 1,
    falloff: [999, 999, 1],
    mag: 4,
    reserve: 12,
    reload: 3.1,
    pellets: 1,
    spreadHip: 0.6,
    spreadAds: 0.2,
    bloom: 0.5,
    spreadMax: 2,
    recoil: [3.8, 0.7],
    adsFov: 58,
    moveMult: 0.9,
    // 彈體：speed 飛行速度、gravity 下墜、blast 爆炸半徑
    projectile: {
      speed: 44,
      gravity: 9,
      blast: 5.6,
      color: 0xff8a2a,
      size: 0.14,
    },
    tracer: 0xff8a2a,
    sound: "launcher",
    botRange: [12, 30],
    botBurst: [1, 1],
  },
  plasma: {
    id: "plasma",
    name: "稜鏡 PX 電漿步槍",
    short: "PRISM-PX",
    cls: "能量武器",
    kind: "projectile",
    auto: true,
    rpm: 430,
    damage: 30,
    headMult: 1.5,
    falloff: [999, 999, 1],
    mag: 40,
    reserve: 160,
    reload: 2.2,
    pellets: 1,
    spreadHip: 1.0,
    spreadAds: 0.25,
    bloom: 0.22,
    spreadMax: 3,
    recoil: [0.5, 0.25],
    adsFov: 50,
    moveMult: 1.0,
    projectile: {
      speed: 85,
      gravity: 0,
      blast: 1.3,
      color: 0x4dfcff,
      size: 0.11,
    },
    tracer: 0x4dfcff,
    sound: "plasma",
    botRange: [8, 26],
    botBurst: [3, 6],
  },
};

/* ---------- 3. 幹員 ----------
 *  look 是外觀設定，會交給 05-character-models.js 的 CharModels.create() 來產生模型：
 *    suit   衣服主色     armor  護甲色     accent 發光色
 *    helmet 頭盔樣式     bulk   體型倍率   pads / pack 是否有護肩／背包
 *    gear   專屬配件：radio 通訊與攝影機、jets 推進器、cloak 披風、exo 外骨骼與彈鏈、bandolier 榴彈彈帶
 */
const OPERATORS = [
  {
    id: "vanta",
    name: "VANTA",
    cn: "凡塔",
    role: "均衡突擊",
    desc: "攻守平均的前線隊長，步槍中距離穩定，技能可在交火中快速回復。",
    hp: 100,
    armor: 50,
    speed: 1.0,
    grenades: 2,
    weapons: ["ar", "shotgun", "pistol"],
    skill: {
      id: "heal",
      name: "戰地急救",
      desc: "立刻回復 35 生命，接著 5 秒內持續回復共 45。",
      cooldown: 26,
      duration: 5,
    },
    look: {
      suit: 0x2b3a4a,
      armor: 0x1a222b,
      accent: 0x35d6ff,
      helmet: "tactical",
      bulk: 1.0,
      pads: true,
      pack: true,
      gear: "radio",
    },
    stats: { 火力: 7, 機動: 6, 防護: 6, 射程: 6 },
  },
  {
    id: "rift",
    name: "RIFT",
    cn: "裂隙",
    role: "高速游擊",
    desc: "移動最快的偵察兵，衝鋒槍貼身輸出，相位衝刺能瞬間切入或脫離戰線。",
    hp: 85,
    armor: 25,
    speed: 1.14,
    grenades: 2,
    weapons: ["smg", "plasma", "pistol"],
    skill: {
      id: "dash",
      name: "相位衝刺",
      desc: "朝移動方向瞬間位移，位移中不會受傷，並獲得 3 秒加速。",
      cooldown: 11,
      duration: 3,
    },
    look: {
      suit: 0x3a2b52,
      armor: 0x20182e,
      accent: 0xb46bff,
      helmet: "visor",
      bulk: 0.92,
      pads: false,
      pack: false,
      gear: "jets",
    },
    stats: { 火力: 6, 機動: 10, 防護: 3, 射程: 5 },
  },
  {
    id: "ghost",
    name: "GHOST",
    cn: "幽靈",
    role: "遠程狙擊",
    desc: "一槍一命的神射手，掃描脈衝能標記牆後敵人並提高對其傷害。",
    hp: 90,
    armor: 25,
    speed: 1.0,
    grenades: 1,
    weapons: ["sniper", "smg", "pistol"],
    skill: {
      id: "scan",
      name: "脈衝掃描",
      desc: "8 秒內透視標記所有敵人，對被標記目標的傷害提高 20%。",
      cooldown: 30,
      duration: 8,
    },
    look: {
      suit: 0x39403a,
      armor: 0x222722,
      accent: 0x7dff9a,
      helmet: "hood",
      bulk: 0.96,
      pads: false,
      pack: true,
      gear: "cloak",
    },
    stats: { 火力: 9, 機動: 5, 防護: 3, 射程: 10 },
  },
  {
    id: "bastion",
    name: "BASTION",
    cn: "堡壘",
    role: "重裝壓制",
    desc: "最厚的護甲與輕機槍彈幕，力場護盾開啟時可硬扛大量傷害。",
    hp: 130,
    armor: 100,
    speed: 0.9,
    grenades: 2,
    weapons: ["lmg", "launcher", "pistol"],
    skill: {
      id: "shield",
      name: "力場護盾",
      desc: "立刻補滿護甲，6 秒內受到的傷害降低 60%。",
      cooldown: 32,
      duration: 6,
    },
    look: {
      suit: 0x4a3b2b,
      armor: 0x2b2118,
      accent: 0xffa23d,
      helmet: "heavy",
      bulk: 1.16,
      pads: true,
      pack: true,
      gear: "exo",
    },
    stats: { 火力: 8, 機動: 3, 防護: 10, 射程: 6 },
  },
  {
    id: "nova",
    name: "NOVA",
    cn: "新星",
    role: "爆破專家",
    desc: "能量武器與榴彈砲雙修，軌道打擊能把一整片區域炸成火海。",
    hp: 95,
    armor: 50,
    speed: 1.02,
    grenades: 3,
    weapons: ["plasma", "launcher", "pistol"],
    skill: {
      id: "strike",
      name: "軌道打擊",
      desc: "標定準星所指位置，1.4 秒後落下高能光束，造成大範圍爆炸。",
      cooldown: 34,
      duration: 0,
    },
    look: {
      suit: 0x4a2b36,
      armor: 0x2a1820,
      accent: 0xff5a8a,
      helmet: "visor",
      bulk: 1.0,
      pads: true,
      pack: false,
      gear: "bandolier",
    },
    stats: { 火力: 10, 機動: 6, 防護: 5, 射程: 7 },
  },
];

/* ---------- 4. 敵人種類（生存模式、首領的小兵） ----------
 *  role 決定 AI 的戰術（見 11-ai.js）：
 *    assault 中距離走位射擊   rusher 貼身衝鋒   sniper 遠距離狙擊
 *    heavy   緩慢推進壓制     drone  懸浮無人機
 *  aim 是瞄準能力倍率（越大越準），score 是擊殺得分。
 */
const ENEMY_TYPES = {
  grunt: {
    id: "grunt",
    name: "步兵",
    hp: 90,
    armor: 0,
    speed: 0.92,
    weapon: "ar",
    role: "assault",
    aim: 1.0,
    score: 100,
    look: {
      suit: 0x4b2a2a,
      armor: 0x251718,
      accent: 0xff4a5e,
      helmet: "tactical",
      bulk: 1.0,
      pads: false,
      pack: false,
    },
  },
  rusher: {
    id: "rusher",
    name: "突擊兵",
    hp: 70,
    armor: 0,
    speed: 1.2,
    weapon: "smg",
    role: "rusher",
    aim: 0.85,
    score: 120,
    look: {
      suit: 0x53361f,
      armor: 0x2a1c12,
      accent: 0xff8a3d,
      helmet: "visor",
      bulk: 0.92,
      pads: false,
      pack: false,
    },
  },
  breacher: {
    id: "breacher",
    name: "破門手",
    hp: 110,
    armor: 30,
    speed: 1.1,
    weapon: "shotgun",
    role: "rusher",
    aim: 0.9,
    score: 150,
    look: {
      suit: 0x3f3f22,
      armor: 0x222212,
      accent: 0xffd23d,
      helmet: "heavy",
      bulk: 1.05,
      pads: true,
      pack: false,
    },
  },
  sniper: {
    id: "sniper",
    name: "狙擊手",
    hp: 70,
    armor: 0,
    speed: 0.9,
    weapon: "sniper",
    role: "sniper",
    aim: 1.25,
    score: 180,
    look: {
      suit: 0x2e3b2a,
      armor: 0x181f16,
      accent: 0xc9a2ff,
      helmet: "hood",
      bulk: 0.95,
      pads: false,
      pack: true,
    },
  },
  heavy: {
    id: "heavy",
    name: "重裝兵",
    hp: 240,
    armor: 100,
    speed: 0.72,
    weapon: "lmg",
    role: "heavy",
    aim: 0.9,
    score: 300,
    scale: 1.18,
    look: {
      suit: 0x3a3030,
      armor: 0x1b1616,
      accent: 0xff3030,
      helmet: "heavy",
      bulk: 1.22,
      pads: true,
      pack: true,
      gear: "exo",
    },
  },
  elite: {
    id: "elite",
    name: "菁英獵兵",
    hp: 170,
    armor: 70,
    speed: 1.05,
    weapon: "plasma",
    role: "assault",
    aim: 1.3,
    score: 260,
    scale: 1.05,
    look: {
      suit: 0x1c2b3d,
      armor: 0x101822,
      accent: 0x4dfcff,
      helmet: "visor",
      bulk: 1.05,
      pads: true,
      pack: true,
      gear: "jets",
    },
  },
  drone: {
    id: "drone",
    name: "獵殺無人機",
    hp: 45,
    armor: 0,
    speed: 1.15,
    weapon: "plasma",
    role: "drone",
    aim: 0.95,
    score: 90,
    hover: 2.3,
    // 無人機懸浮在空中、很難打中，所以武器傷害只有一般的 55%
    damageMult: 0.55,
    look: { accent: 0xff4a5e },
  },
};

/* ---------- 5. 首領 ----------
 *  patterns : 這個首領會用的招式（招式本體寫在 12-boss.js）
 *  phases   : 生命比例低於這些數值時進入下一階段，攻擊更快
 */
const BOSSES = {
  titan: {
    id: "titan",
    name: "TITAN-9",
    cn: "泰坦機甲",
    title: "鋼鐵壓制者",
    desc: "雙足重型機甲。轉輪機砲、火箭彈幕與震地衝擊波，正面火力極強但轉身較慢。",
    hp: 4200,
    speed: 2.6,
    scale: 2.3,
    radius: 1.3,
    height: 4.0,
    hover: 0,
    patterns: ["minigun", "rockets", "shockwave", "charge"],
    phases: [0.6, 0.3],
    minions: ["grunt", "heavy"],
    color: 0xff7a2a,
  },
  wraith: {
    id: "wraith",
    name: "WRAITH",
    cn: "幽影刺客",
    title: "相位獵手",
    desc: "高速近戰型首領。瞬移閃現、扇形能量刃與分身突襲，必須不停移動才能躲開。",
    hp: 3600,
    speed: 5.2,
    scale: 1.45,
    radius: 0.8,
    height: 2.7,
    hover: 0,
    patterns: ["blades", "blink", "charge", "orbs"],
    phases: [0.65, 0.33],
    minions: ["rusher", "sniper"],
    color: 0xb46bff,
  },
  hydra: {
    id: "hydra",
    name: "HYDRA CORE",
    cn: "九頭蛇核心",
    title: "失控的戰爭 AI",
    desc: "懸浮的巨型核心。螺旋彈幕、旋轉雷射與無人機群，注意雷射掃過時要跳躍或找掩體。",
    hp: 3600,
    speed: 2.0,
    scale: 1.0,
    radius: 1.7,
    height: 3.4,
    hover: 2.6,
    patterns: ["orbs", "laser", "summon", "rockets"],
    phases: [0.66, 0.33],
    minions: ["drone", "drone", "elite"],
    color: 0x4dfcff,
  },
};

/* ---------- 6. 遊戲模式 ---------- */
const MODES = [
  {
    id: "tdm",
    name: "團隊死鬥",
    en: "TEAM DEATHMATCH",
    icon: "⚔",
    desc: "5 對 5。與四名電腦隊友並肩作戰，率先取得 40 次擊殺的隊伍獲勝。",
    notes: [
      "隊友會分散敵人火力，適合新手熟悉操作",
      "陣亡 3 秒後重生；6 秒沒受傷開始回血",
    ],
    teamSize: 5,
    scoreLimit: 40,
    timeLimit: 600,
    respawn: 3,
  },
  {
    id: "dom",
    name: "據點爭奪",
    en: "DOMINATION",
    icon: "⚑",
    desc: "佔領 A、B、C 三個據點並守住，佔越多得分越快，先到 200 分獲勝。",
    notes: [
      "站在圈內約 3.6 秒佔領，人越多越快；敵方據點佔滿直接變成我方的",
      "兩隊都在圈內時進度凍結；陣亡 4 秒後重生",
    ],
    teamSize: 5,
    scoreLimit: 200,
    timeLimit: 600,
    respawn: 4,
  },
  {
    id: "ffa",
    name: "個人亂鬥",
    en: "FREE FOR ALL",
    icon: "☠",
    desc: "8 人大混戰，沒有隊友，所有人都是敵人。先拿到 20 殺的人獲勝。",
    notes: [
      "常被多人同時攻擊，所以敵人傷害降為 85%",
      "5 秒沒受傷就開始快速回血；陣亡 2.5 秒後重生",
    ],
    players: 8,
    scoreLimit: 20,
    timeLimit: 480,
    respawn: 2.5,
  },
  {
    id: "survival",
    name: "生存波次",
    en: "SURVIVAL",
    icon: "∞",
    desc: "獨自對抗無盡的敵潮。每撐過一波可三選一強化，每 5 波出現首領。",
    notes: [
      "只有一條命，難度逐波上升：敵人數量、槍法與傷害（46% → 第 10 波 100%）",
      "每撐過一波補滿生命與護甲、醫療包 +1、補充彈藥",
    ],
    respawn: 0,
  },
  {
    id: "boss",
    name: "首領討伐",
    en: "BOSS RAID",
    icon: "♛",
    desc: "挑戰三名風格完全不同的首領。看清預警、抓住破綻，把血條打空。",
    notes: [
      "每一招都有預警：紅圈＝落點、黃圈＝震波（跳躍）、紅線＝衝撞路徑",
      "可復活次數依難度：新兵 3 次、戰士 2 次、老兵 1 次、煉獄 0 次",
    ],
    respawn: 0,
  },
];

/* ---------- 7. 難度 ----------
 *  botSpread  : 電腦的瞄準誤差倍率（越大越不準）
 *  reaction   : 電腦看到目標到開槍的反應時間（秒）
 *  botDamage  : 電腦對玩家造成的傷害倍率
 *  enemyHp    : 敵人生命倍率
 *  lives      : 首領模式可復活次數
 */
const DIFFICULTIES = [
  {
    id: "easy",
    name: "新兵",
    desc: "敵人反應慢、準度低，適合熟悉操作。",
    botSpread: 2.1,
    reaction: 0.75,
    botDamage: 0.4,
    enemyHp: 0.85,
    lives: 3,
    color: "#7dff9a",
  },
  {
    id: "normal",
    name: "戰士",
    desc: "標準體驗，敵人會走位、找掩體與包抄。",
    botSpread: 1.4,
    reaction: 0.48,
    botDamage: 0.6,
    enemyHp: 1.0,
    lives: 2,
    color: "#35d6ff",
  },
  {
    id: "hard",
    name: "老兵",
    desc: "敵人更準、更兇，會積極丟手榴彈。",
    botSpread: 1.0,
    reaction: 0.32,
    botDamage: 0.82,
    enemyHp: 1.15,
    lives: 1,
    color: "#ffc233",
  },
  {
    id: "hell",
    name: "煉獄",
    desc: "幾乎不失誤的敵人。只給真正的高手。",
    botSpread: 0.7,
    reaction: 0.2,
    botDamage: 1.05,
    enemyHp: 1.35,
    lives: 0,
    color: "#ff4a5e",
  },
];

/* ---------- 8. 生存模式強化 ----------
 *  每個強化的 apply(player) 會直接修改玩家的加成數值（player.mods）。
 */
const PERKS = [
  {
    id: "dmg",
    name: "穿甲彈頭",
    icon: "✦",
    desc: "所有武器傷害 +15%",
    apply: (p) => (p.mods.damage *= 1.15),
  },
  {
    id: "rof",
    name: "輕量槍機",
    icon: "≫",
    desc: "射速 +12%",
    apply: (p) => (p.mods.fireRate *= 1.12),
  },
  {
    id: "reload",
    name: "快手彈匣",
    icon: "↻",
    desc: "換彈速度 +25%",
    apply: (p) => (p.mods.reload *= 1.25),
  },
  {
    id: "hp",
    name: "強化體質",
    icon: "✚",
    desc: "最大生命 +25 並立即補滿",
    // 增加生命值上限，並同時補滿生命值。
    apply: (p) => {
      p.maxHp += 25;
      p.hp = p.maxHp;
    },
  },
  {
    id: "armor",
    name: "複合護甲",
    icon: "⛨",
    desc: "最大護甲 +40 並立即補滿",
    // 增加護甲上限，並同時補滿護甲。
    apply: (p) => {
      p.maxArmor += 40;
      p.armor = p.maxArmor;
    },
  },
  {
    id: "speed",
    name: "外骨骼",
    icon: "➤",
    desc: "移動速度 +10%",
    apply: (p) => (p.mods.speed *= 1.1),
  },
  {
    id: "leech",
    name: "奈米修復",
    icon: "❤",
    desc: "每次擊殺回復 12 生命",
    apply: (p) => (p.mods.leech += 12),
  },
  {
    id: "boom",
    name: "爆裂彈",
    icon: "✹",
    desc: "子彈命中時產生小範圍爆炸（20 傷害）",
    apply: (p) => (p.mods.explosive += 20),
  },
  {
    id: "mag",
    name: "擴充彈匣",
    icon: "▤",
    desc: "彈匣容量 +30%，並補滿所有彈藥",
    // 彈匣加大後立刻把彈藥補滿。
    apply: (p) => {
      p.mods.mag *= 1.3;
      p.refillAmmo();
    },
  },
  {
    id: "crit",
    name: "弱點分析",
    icon: "◎",
    desc: "爆頭傷害 +35%",
    apply: (p) => (p.mods.head *= 1.35),
  },
  {
    id: "skill",
    name: "超頻核心",
    icon: "⚡",
    desc: "技能冷卻時間 -25%",
    apply: (p) => (p.mods.cooldown *= 0.75),
  },
  {
    id: "nade",
    name: "爆破背帶",
    icon: "●",
    desc: "手榴彈上限 +2 並補滿",
    // 手榴彈上限增加 2 顆，並同時補滿。
    apply: (p) => {
      p.maxGrenades += 2;
      p.grenades = p.maxGrenades;
    },
  },
];
