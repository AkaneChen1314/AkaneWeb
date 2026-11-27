"use strict";
// ===== 遊戲資料 =====
// 地圖格數、每格大小，以及地圖左上角在畫布上的位置。
const COLS = 20,
  ROWS = 14,
  TS = 64,
  MX = 20,
  MY = 80;

// 六種元素的名稱與顏色。
const ELEM = {
  fire: {
    name: "火",
    full: "烈焰",
    c: "#ff5a1f",
    c2: "#ffd23a",
    dark: "#7a1a00",
  },
  ice: {
    name: "冰",
    full: "寒冰",
    c: "#48c8ff",
    c2: "#e4f8ff",
    dark: "#0a3a6a",
  },
  thunder: {
    name: "雷",
    full: "雷霆",
    c: "#ffe03a",
    c2: "#ffffff",
    dark: "#6a5a00",
  },
  poison: {
    name: "毒",
    full: "劇毒",
    c: "#7cf03a",
    c2: "#d8ff9a",
    dark: "#1a5a10",
  },
  wind: {
    name: "風",
    full: "疾風",
    c: "#5affc8",
    c2: "#e8fff6",
    dark: "#0a5a4a",
  },
  earth: {
    name: "地",
    full: "大地",
    c: "#d8923a",
    c2: "#ffe0a8",
    dark: "#4a2a0a",
  },
};
const EK = ["fire", "ice", "thunder", "poison", "wind", "earth"];
// 相剋的元素：帶有元素光環的敵人會被相剋元素重創。
const OPP = {
  fire: "ice",
  ice: "fire",
  thunder: "earth",
  earth: "thunder",
  poison: "wind",
  wind: "poison",
};
const TIER_NAME = ["", "普通", "精良", "稀有", "史詩", "傳說", "神話"];
// 每個星級的代表顏色。
const TIER_COL = [
  "#ffffff",
  "#dfe4ee",
  "#5cff7e",
  "#4fb0ff",
  "#c868ff",
  "#ffae3c",
  "#ff3c64",
];
const MAX_TIER = 6;

// ---------- 基礎元素塔 ----------

// 六種基本元素塔的數值：dmg 傷害、rate 每秒攻擊次數、range 射程、mode 攻擊方式
// （bullet 子彈、pulse 範圍脈衝…）、speed 子彈速度、splash 爆炸範圍。
const BASE = {
  fire: {
    name: "烈焰塔",
    dmg: 15,
    rate: 1.0,
    range: 150,
    mode: "bullet",
    speed: 560,
    splash: 42,
    fx: { burn: { dps: 0.45, dur: 3 } },
    desc: "發射火球，小範圍爆炸並使敵人燃燒",
  },
  ice: {
    name: "寒霜塔",
    dmg: 9,
    rate: 1.25,
    range: 155,
    mode: "bullet",
    speed: 620,
    fx: { slow: { amt: 0.35, dur: 1.6 } },
    desc: "寒冰彈使敵人緩速",
  },
  thunder: {
    name: "雷霆塔",
    dmg: 11,
    rate: 1.3,
    range: 145,
    mode: "chain",
    chain: 3,
    fx: { shock: { chance: 0.12, dur: 0.35 } },
    desc: "閃電在敵人之間連鎖跳躍",
  },
  poison: {
    name: "毒霧塔",
    dmg: 6,
    rate: 1.15,
    range: 165,
    mode: "bullet",
    speed: 520,
    fx: { poison: { dps: 0.8, dur: 4, max: 4 } },
    desc: "可疊加的劇毒持續傷害",
  },
  wind: {
    name: "疾風塔",
    dmg: 7,
    rate: 2.3,
    range: 210,
    mode: "multi",
    shots: 2,
    speed: 900,
    fx: { knock: { dist: 7 } },
    desc: "高速多重射擊，輕微擊退",
  },
  earth: {
    name: "巨岩塔",
    dmg: 34,
    rate: 0.5,
    range: 150,
    mode: "mortar",
    splash: 78,
    fx: { stun: { chance: 0.15, dur: 0.7 } },
    desc: "拋射巨石，大範圍傷害並暈眩",
  },
};

// ---------- 雙元素融合塔（兩種元素的組合，順序依 EK） ----------

// 兩種元素合成的塔：在兩者的平均數值上乘以 mul 倍率，並換成新的攻擊方式。
const HYBRID = {
  "fire+ice": {
    name: "蒸汽爆炎塔",
    mode: "pulse",
    mul: 1.55,
    rate: 0.85,
    desc: "噴發灼熱蒸汽，範圍燃燒並緩速周圍敵人",
  },
  "fire+thunder": {
    name: "電漿光束塔",
    mode: "beam",
    mul: 1.25,
    desc: "持續電漿光束，鎖定越久傷害越高（最高 2.5 倍）",
  },
  "fire+poison": {
    name: "瘟疫之焰塔",
    mode: "bullet",
    mul: 1.7,
    add: { spread: { n: 3 } },
    desc: "敵人死亡時將燃燒與劇毒擴散給附近敵人",
  },
  "fire+wind": {
    name: "炎之颶風塔",
    mode: "multi",
    shots: 3,
    mul: 1.25,
    desc: "同時射出三道火焰旋風",
  },
  "fire+earth": {
    name: "熔岩巨砲",
    mode: "mortar",
    mul: 1.6,
    splash: 85,
    add: { pool: { dps: 0.5, dur: 3, r: 48 } },
    desc: "砲擊留下灼熱的熔岩池",
  },
  "ice+thunder": {
    name: "極光鏈塔",
    mode: "chain",
    chain: 4,
    mul: 1.5,
    add: { freeze: { chance: 0.12, dur: 1.1 } },
    desc: "連鎖閃電有機率將敵人完全冰凍",
  },
  "ice+poison": {
    name: "冥霜毒刺塔",
    mode: "bullet",
    mul: 1.65,
    add: { shred: { amt: 0.3, dur: 3 } },
    desc: "破甲：降低護甲並使敵人受到的傷害 +30%",
  },
  "ice+wind": {
    name: "暴風雪塔",
    mode: "pulse",
    mul: 1.2,
    range: 45,
    add: { slow: { amt: 0.5, dur: 2 } },
    desc: "大範圍寒風，強力緩速",
  },
  "ice+earth": {
    name: "冰晶散射塔",
    mode: "multi",
    shots: 4,
    mul: 1.3,
    desc: "一次散射四枚冰晶",
  },
  "thunder+poison": {
    name: "酸蝕雷塔",
    mode: "chain",
    chain: 5,
    mul: 1.45,
    desc: "連鎖閃電附帶劇毒",
  },
  "thunder+wind": {
    name: "風暴之怒塔",
    mode: "chain",
    chain: 7,
    mul: 1.3,
    range: 45,
    desc: "超長距離、超多目標的連鎖閃電",
  },
  "thunder+earth": {
    name: "磁軌砲",
    mode: "rail",
    mul: 3.4,
    rate: 0.42,
    range: 90,
    desc: "超高傷害，貫穿直線上的所有敵人",
  },
  "poison+wind": {
    name: "瘴氣領域塔",
    mode: "pulse",
    mul: 1.15,
    range: 25,
    desc: "周圍持續擴散劇毒瘴氣",
  },
  "poison+earth": {
    name: "孢子砲台",
    mode: "mortar",
    mul: 1.45,
    splash: 85,
    add: { pool: { dps: 0.6, dur: 3.5, r: 52 } },
    desc: "砲擊留下劇毒沼澤",
  },
  "wind+earth": {
    name: "沙塵暴塔",
    mode: "multi",
    shots: 3,
    mul: 1.4,
    add: { knock: { dist: 26 }, stun: { chance: 0.22, dur: 0.6 } },
    desc: "強力擊退並有機率暈眩",
  },
};

// ---------- 三元素融合塔 ----------

// 三種元素合成的塔（最強的組合）：名稱與攻擊方式。
const TRINITY = {
  "fire+ice+thunder": { name: "混沌奇點", mode: "chain" },
  "fire+ice+poison": { name: "冥火寒毒", mode: "pulse" },
  "fire+ice+wind": { name: "四季輪迴", mode: "multi" },
  "fire+ice+earth": { name: "天地熔爐", mode: "mortar" },
  "fire+thunder+poison": { name: "腐雷煉獄", mode: "beam" },
  "fire+thunder+wind": { name: "雷火颶風", mode: "chain" },
  "fire+thunder+earth": { name: "火山雷神", mode: "rail" },
  "fire+poison+wind": { name: "瘟疫之息", mode: "pulse" },
  "fire+poison+earth": { name: "腐壤熔岩", mode: "mortar" },
  "fire+wind+earth": { name: "隕石天降", mode: "mortar" },
  "ice+thunder+poison": { name: "冰毒電網", mode: "chain" },
  "ice+thunder+wind": { name: "極地風暴", mode: "pulse" },
  "ice+thunder+earth": { name: "永凍磁軌", mode: "rail" },
  "ice+poison+wind": { name: "死寂冰原", mode: "pulse" },
  "ice+poison+earth": { name: "冰封墓穴", mode: "mortar" },
  "ice+wind+earth": { name: "冰河紀元", mode: "multi" },
  "thunder+poison+wind": { name: "酸雨雷雲", mode: "chain" },
  "thunder+poison+earth": { name: "腐蝕大地", mode: "beam" },
  "thunder+wind+earth": { name: "天崩地裂", mode: "rail" },
  "poison+wind+earth": { name: "荒蕪沙瘴", mode: "multi" },
};

// ===== 非元素屬性（職業塔／賭場塔使用） =====
Object.assign(ELEM, {
  phys: {
    name: "物",
    full: "物理",
    c: "#d0d8e8",
    c2: "#ffffff",
    dark: "#3a4050",
  },
  gold: {
    name: "金",
    full: "黃金",
    c: "#ffcf3a",
    c2: "#fff6c0",
    dark: "#6a4a00",
  },
  arcane: {
    name: "奧",
    full: "奧術",
    c: "#c868ff",
    c2: "#f0d8ff",
    dark: "#3a0a6a",
  },
  luck: {
    name: "運",
    full: "幸運",
    c: "#ff4ad8",
    c2: "#ffd0f0",
    dark: "#5a0040",
  },
});
// ===== 職業塔（商店販售） =====
const CLASS_T = {
  archer: {
    name: "弓箭塔",
    e: "🏹",
    el: "phys",
    dmg: 9,
    rate: 1.8,
    range: 175,
    mode: "bullet",
    speed: 850,
    desc: "便宜又快速的單體射手，前期好幫手",
  },
  sniper: {
    name: "狙擊塔",
    e: "🎯",
    el: "phys",
    dmg: 75,
    rate: 0.32,
    range: 420,
    mode: "snipe",
    desc: "超遠射程、優先打最強敵人，無視護甲",
  },
  flak: {
    name: "防空砲",
    e: "🚀",
    el: "phys",
    dmg: 10,
    rate: 1.4,
    range: 210,
    mode: "multi",
    shots: 2,
    speed: 900,
    antiAir: 2.5,
    desc: "同時射兩發，對飛行敵人造成 2.5 倍傷害",
  },
  drum: {
    name: "戰鼓塔",
    e: "🥁",
    el: "arcane",
    dmg: 0,
    rate: 0,
    range: 150,
    mode: "support",
    support: { dmg: 0.15, rate: 0.08 },
    desc: "不攻擊。範圍內的塔傷害 +15%、攻速 +8%（星級越高越強）",
  },
  clock: {
    name: "時光塔",
    e: "⏳",
    el: "arcane",
    dmg: 4,
    rate: 1,
    range: 160,
    mode: "aura",
    slow: 0.3,
    desc: "範圍內的敵人持續緩速 30%（星級越高越強）",
  },
  mine: {
    name: "金礦",
    e: "⛏️",
    el: "gold",
    dmg: 0,
    rate: 0,
    range: 0,
    mode: "eco",
    eco: 30,
    desc: "不攻擊。每波結束產出 30 金（每升一星約翻倍）",
  },
};
// ===== 賭場限定塔（只能從賭博獲得） =====
const SPECIAL_T = {
  sp_cat: {
    name: "招財貓",
    e: "🐱",
    el: "gold",
    r: 2,
    dmg: 22,
    rate: 1.3,
    range: 175,
    mode: "bullet",
    critAdd: 0.3,
    killGold: 2,
    desc: "暴擊率 +30%，擊殺時額外噴出金幣",
  },
  sp_dice: {
    name: "骰子砲",
    e: "🎲",
    el: "luck",
    r: 2,
    dmg: 22,
    rate: 0.8,
    range: 175,
    mode: "mortar",
    splash: 75,
    dice: 1,
    desc: "每發傷害隨機 ×1～×6，擲出 6 會引發超大爆炸",
  },
  sp_toad: {
    name: "金蟾",
    e: "🐸",
    el: "gold",
    r: 3,
    dmg: 18,
    rate: 1.2,
    range: 165,
    mode: "bullet",
    eco: 60,
    desc: "會攻擊也會產金：每波結束 +60 金（隨星級翻倍）",
  },
  sp_slot: {
    name: "拉霸塔",
    e: "🎰",
    el: "luck",
    r: 3,
    dmg: 26,
    rate: 1.1,
    range: 185,
    mode: "bullet",
    slotT: 1,
    desc: "每發隨機附帶火／冰／雷效果；每 10 秒觸發 777 範圍轟炸",
  },
  sp_roul: {
    name: "輪盤砲",
    e: "🎡",
    el: "luck",
    r: 3,
    dmg: 16,
    rate: 1.6,
    range: 185,
    mode: "multi",
    shots: 3,
    speed: 880,
    roul: 1,
    desc: "一次射三發，每發隨機一種元素效果",
  },
  sp_ace: {
    name: "王牌",
    e: "🃏",
    el: "phys",
    r: 4,
    dmg: 70,
    rate: 0.6,
    range: 260,
    mode: "rail",
    ace: 1,
    desc: "飛牌貫穿直線；12% 機率「同花順」造成 5 倍傷害",
  },
  sp_dragon: {
    name: "黃金龍",
    e: "🐉",
    el: "fire",
    r: 4,
    dmg: 45,
    rate: 0.9,
    range: 195,
    mode: "pulse",
    fx: { burn: { dps: 0.6, dur: 4 } },
    desc: "噴出黃金龍焰，範圍燃燒周圍所有敵人",
  },
};
// 商店的基本售價。
const SHOP_PRICE = {
  fire: 60,
  ice: 60,
  thunder: 65,
  poison: 60,
  wind: 60,
  earth: 70,
  archer: 40,
  sniper: 90,
  flak: 60,
  drum: 80,
  clock: 70,
  mine: 100,
};
const SHOP_POOL = Object.keys(SHOP_PRICE);
// 賭場限定塔的種類與稀有度。
const SP_KEYS = [...Object.keys(SPECIAL_T), "prism"];
const SP_RAR = { prism: 5 };
for (const k in SPECIAL_T) SP_RAR[k] = SPECIAL_T[k].r;
// 升星的費用：每升一星加倍。
function upgradeCost(tier) {
  return 30 * Math.pow(2, tier - 1);
}
// 融合的費用。
function fuseCost(tier) {
  return 50 * tier;
}
// 取得職業塔或賭場限定塔的資料；元素塔回傳 null。
function tDef(key) {
  return CLASS_T[key] || SPECIAL_T[key] || null;
}

// 攻擊方式的顯示名稱。
const MODE_NAME = {
  bullet: "單發彈",
  multi: "多重射擊",
  chain: "連鎖閃電",
  mortar: "拋射砲擊",
  pulse: "範圍脈衝",
  beam: "持續光束",
  rail: "貫穿軌道",
  snipe: "遠程狙擊",
  support: "輔助光環",
  aura: "緩速力場",
  eco: "產出金幣",
};
// 附加效果的顯示名稱。
const FX_NAME = {
  burn: "燃燒",
  slow: "緩速",
  shock: "感電",
  poison: "劇毒",
  knock: "擊退",
  stun: "暈眩",
  freeze: "冰凍",
  shred: "破甲",
  spread: "擴散",
  pool: "地面區域",
};

// 把元素依固定順序組成塔的代號，例如 fire+ice。
function keyOf(elems) {
  return [...new Set(elems)]
    .sort((a, b) => EK.indexOf(a) - EK.indexOf(b))
    .join("+");
}
// 從塔的代號取得它的元素。
function elemsOf(key) {
  if (key === "prism") return EK.slice();
  const d = tDef(key);
  return d ? [d.el] : key.split("+");
}
// 判斷塔的類型：基礎、雙元素、三元素、傳說、職業或賭場限定。
function towerKind(key) {
  if (key === "prism") return "prism";
  if (CLASS_T[key]) return "class";
  if (SPECIAL_T[key]) return "special";
  const n = key.split("+").length;
  return n === 1 ? "base" : n === 2 ? "hybrid" : "trinity";
}
// 塔的顯示名稱。
function towerName(key) {
  if (key === "prism") return "幻彩稜鏡";
  const d = tDef(key);
  if (d) return d.name;
  const k = towerKind(key);
  return k === "base"
    ? BASE[key].name
    : k === "hybrid"
      ? HYBRID[key].name
      : TRINITY[key].name;
}
// 塔的攻擊方式。
function towerMode(key) {
  const d = tDef(key);
  if (d) return d.mode;
  const k = towerKind(key);
  return k === "base"
    ? BASE[key].mode
    : k === "hybrid"
      ? HYBRID[key].mode
      : k === "trinity"
        ? TRINITY[key].mode
        : "beam";
}
// 塔的說明文字。
function towerDesc(key) {
  const d = tDef(key);
  if (d) return d.desc;
  const k = towerKind(key);
  if (k === "base") return BASE[key].desc;
  if (k === "hybrid") return HYBRID[key].desc;
  if (k === "prism")
    return "傳說之塔：同時發射三道彩虹光束，具備全部六種元素效果";
  const t = TRINITY[key];
  return `融合${elemsOf(key)
    .map((e) => ELEM[e].full)
    .join("、")}三元素之力，以${MODE_NAME[t.mode]}攻擊並附帶所有元素效果`;
}
// 塔類型的顯示名稱。
function kindName(key) {
  return {
    base: "元素塔",
    hybrid: "雙元素融合",
    trinity: "三元素融合",
    prism: "賭場傳說塔",
    class: "職業塔",
    special: "賭場限定塔",
  }[towerKind(key)];
}
// 圖鑑中的取得方式。
function recipeOf(key) {
  const k = towerKind(key);
  if (k === "base" || k === "class")
    return "商店購買（★1），兩座相同的塔可在強化工坊升星";
  if (k === "special")
    return "只能從賭場獲得（拉霸三個皇冠、刮刮樂、小瑪莉、翻倍挑戰連勝……）";
  if (k === "hybrid")
    return (
      key
        .split("+")
        .map((e) => ELEM[e].name + "塔")
        .join(" ＋ ") + "（同星級，在強化工坊融合）"
    );
  if (k === "trinity")
    return "雙元素塔 ＋ 第三元素塔，或兩座共用一元素的雙元素塔（同星級）";
  return "賭場頭獎、小瑪莉 JACKPOT，或兩座元素互補的三元素塔融合（★3 以上）";
}
// 圖鑑收錄的所有塔。
const ALL_TOWERS = [
  ...EK,
  ...Object.keys(CLASS_T),
  ...Object.keys(SPECIAL_T),
  ...Object.keys(HYBRID),
  ...Object.keys(TRINITY),
  "prism",
];

// 合成規則：相同的塔升星；元素塔可融合
function fuseResult(a, b) {
  if (!a || !b || a.tier !== b.tier) return null;
  if (a.key === b.key)
    return a.tier < MAX_TIER
      ? { key: a.key, tier: a.tier + 1, type: "merge" }
      : null;
  const ka = towerKind(a.key),
    kb = towerKind(b.key);
  if (
    ["class", "special", "prism"].includes(ka) ||
    ["class", "special", "prism"].includes(kb)
  )
    return null;
  const ea = elemsOf(a.key),
    eb = elemsOf(b.key);
  if (ka === "base" && kb === "base")
    return { key: keyOf([a.key, b.key]), tier: a.tier, type: "fuse" };
  if (
    (ka === "hybrid" && kb === "base") ||
    (ka === "base" && kb === "hybrid")
  ) {
    const u = new Set([...ea, ...eb]);
    if (u.size !== 3) return null;
    return { key: keyOf([...u]), tier: a.tier, type: "fuse" };
  }
  if (ka === "hybrid" && kb === "hybrid") {
    const u = new Set([...ea, ...eb]);
    if (u.size === 3) return { key: keyOf([...u]), tier: a.tier, type: "fuse" };
    return null;
  }
  if (ka === "trinity" && kb === "trinity" && a.tier >= 3) {
    const u = new Set([...ea, ...eb]);
    if (u.size === 6) return { key: "prism", tier: a.tier - 1, type: "fuse" };
  }
  return null;
}

// 合併附加效果；同一種效果取較強的數值，機率與時間不受倍率影響。
function mergeFx(dst, src, sc = 1) {
  for (const k in src) {
    const v = src[k];
    if (!dst[k]) dst[k] = {};
    for (const p in v) {
      const raw = v[p];
      const val =
        p === "chance" || p === "dur" || p === "max" || p === "r" || p === "n"
          ? raw
          : raw * sc;
      dst[k][p] = Math.max(dst[k][p] || 0, val);
    }
  }
}
// 每升一星的傷害倍率。
const TIER_DMG = 2.4;
// 計算一座塔的實際數值：基本值、星級、融合與遺物加成。
function calcStats(key, tier, m) {
  const els = elemsOf(key),
    kind = towerKind(key),
    D = tDef(key);
  let dmg = 0,
    rate = 0,
    range = 0;
  const fx = {};
  // 一座塔的能力表：先放入預設值，下面再依元素、星級、遺物與天賦一項一項加上去。
  const s = {
    key,
    tier,
    els,
    kind,
    mode: "bullet",
    shots: 1,
    chain: 3,
    splash: 0,
    speed: 640,
    beams: 1,
    def: D,
  };
  // 職業塔與賭場塔直接使用自己的數值。
  if (D) {
    dmg = D.dmg;
    rate = D.rate;
    range = D.range;
    s.mode = D.mode;
    s.shots = D.shots || 1;
    s.chain = D.chain || 3;
    s.splash = D.splash || 0;
    s.speed = D.speed || 700;
    if (D.fx) mergeFx(fx, D.fx);
  } else {
    // 元素塔：取各元素的平均值。
    for (const e of els) {
      const b = BASE[e];
      dmg += b.dmg;
      rate += b.rate;
      range = Math.max(range, b.range);
    }
    dmg /= els.length;
    rate /= els.length;
    const ks =
      kind === "base"
        ? 1
        : kind === "hybrid"
          ? 1.15
          : kind === "trinity"
            ? 1.3
            : 1.45;
    for (const e of els) mergeFx(fx, BASE[e].fx, ks);
    // 單一元素。
    if (kind === "base") {
      const b = BASE[key];
      s.mode = b.mode;
      s.shots = b.shots || 1;
      s.chain = b.chain || 3;
      s.splash = b.splash || 0;
      s.speed = b.speed || 640;
    } else {
      // 多元素：把每一對元素的額外效果加進來。
      for (let i = 0; i < els.length; i++)
        for (let j = i + 1; j < els.length; j++) {
          const h = HYBRID[els[i] + "+" + els[j]];
          if (h && h.add) mergeFx(fx, h.add, ks);
        }
      if (kind === "hybrid") {
        // 雙元素融合。
        const h = HYBRID[key];
        s.mode = h.mode;
        dmg *= h.mul;
        if (h.rate) rate *= h.rate;
        range += h.range || 0;
        s.shots = h.shots || 3;
        s.chain = h.chain || 4;
        s.splash = h.splash || 0;
      } else if (kind === "trinity") {
        // 三元素融合。
        const t = TRINITY[key];
        s.mode = t.mode;
        dmg *= 2.4;
        range += 25;
        s.shots = 4;
        s.chain = 6;
        s.splash = 95;
        if (t.mode === "rail") {
          rate *= 0.6;
          dmg *= 1.8;
        }
      } else {
        // 幻彩稜鏡。
        s.mode = "beam";
        s.beams = 3;
        dmg *= 3.6;
        range += 45;
      }
      if (els.includes("fire") && s.mode === "bullet")
        s.splash = Math.max(s.splash, 45);
      s.speed = s.mode === "multi" ? 860 : 640;
    }
    // 範圍脈衝會打到所有敵人，所以傷害與射程較低。
    if (s.mode === "pulse") {
      dmg *= 0.8;
      range *= 0.82;
    }
  }
  if (s.mode === "mortar" && !s.splash) s.splash = 80;
  const tm = Math.pow(TIER_DMG, tier - 1);
  dmg *= tm;
  // 星級加成。
  if (range) range += 12 * (tier - 1);
  rate *= (1 + 0.07 * (tier - 1)) * (tier >= 2 ? 1.15 : 1);
  s.splash *= 1 + 0.1 * (tier - 1);
  // ★5 以上增加目標數。
  if (tier >= 5) {
    s.shots += 1;
    s.chain += 1;
    s.beams += 1;
  }
  if (s.mode === "chain") s.chain += Math.floor((tier - 1) / 2);
  if (s.mode === "multi") s.shots += Math.floor((tier - 1) / 3);
  // 輔助、緩速與產金塔的特殊數值。
  if (D && D.support)
    s.support = {
      dmg: D.support.dmg * (1 + 0.6 * (tier - 1)),
      rate: D.support.rate * (1 + 0.5 * (tier - 1)),
    };
  if (D && D.slow) s.slow = Math.min(0.75, D.slow + 0.08 * (tier - 1));
  if (D && D.eco) s.eco = Math.round(D.eco * Math.pow(2.2, tier - 1));
  // 遺物與增益的加成。
  if (m) {
    let em = 0;
    for (const e of els) em += m.el[e] || 0;
    em /= els.length;
    dmg *=
      (1 + m.dmg) *
      (1 + em) *
      (kind === "hybrid" || kind === "trinity" || kind === "prism"
        ? 1 + m.fused
        : 1);
    if (s.mode === "beam" || s.mode === "pulse") dmg *= 1 + m.beamPulse;
    rate *= 1 + m.rate;
    if (range) range *= Math.max(0.5, 1 + m.range);
    s.splash *= 1 + m.splash;
    if (s.mode === "chain") s.chain += m.chain;
    if (s.mode === "multi") s.shots += m.shots;
    if (fx.slow) fx.slow.amt = Math.min(0.8, fx.slow.amt * (1 + m.slow));
    if (fx.burn) fx.burn.dps *= 1 + m.burn;
    if (fx.poison) fx.poison.max += m.poisonStacks;
  }
  s.dmg = dmg;
  s.rate = rate;
  s.range = range;
  s.fx = fx;
  return s;
}
// 塔的基本價值。
function basePrice(key) {
  const k = towerKind(key);
  if (SHOP_PRICE[key]) return SHOP_PRICE[key];
  if (k === "hybrid") return 150;
  if (k === "trinity") return 320;
  if (k === "special") return 120 * SP_RAR[key];
  return 900;
}
// 塔卡的回收價格。
function cardValue(key, tier) {
  return Math.round(basePrice(key) * Math.pow(2, tier - 1) * 0.6);
}

// ===== 命運拉霸符號（每個滾輪上的數量） =====
const SYM = {
  cherry: { n: "櫻桃", c: 11 },
  bell: { n: "鈴鐺", c: 7 },
  bar: { n: "BAR", c: 7 },
  diamond: { n: "鑽石", c: 3 },
  seven: { n: "幸運7", c: 2 },
  chest: { n: "道具箱", c: 1 },
  potion: { n: "藥水", c: 1 },
  crown: { n: "皇冠", c: 1 },
  wild: { n: "彩色球", c: 4 },
};
const SYM_KEYS = Object.keys(SYM);

// ===== 敵人 =====
const ENEMY = {
  slime: {
    name: "史萊姆",
    hp: 40,
    spd: 52,
    gold: 3,
    r: 15,
    col: "#5ce07a",
    shape: "blob",
    desc: "最基本的敵人",
  },
  runner: {
    name: "疾行鼠",
    hp: 26,
    spd: 108,
    gold: 3,
    r: 12,
    col: "#ffcf4a",
    shape: "runner",
    desc: "移動速度極快",
  },
  brute: {
    name: "鐵甲獸",
    hp: 170,
    spd: 36,
    gold: 8,
    r: 22,
    armor: 4,
    col: "#9aa6bc",
    shape: "brute",
    desc: "厚重護甲減少每次受到的傷害",
  },
  flyer: {
    name: "夜蝠",
    hp: 48,
    spd: 80,
    gold: 4,
    r: 14,
    fly: 1,
    col: "#b07aff",
    shape: "bat",
    desc: "飛行：免疫擊退與地面區域",
  },
  splitter: {
    name: "分裂體",
    hp: 95,
    spd: 46,
    gold: 5,
    r: 19,
    split: 1,
    col: "#3ad8c8",
    shape: "splitter",
    desc: "死亡時分裂成兩隻小分裂體",
  },
  mini: {
    name: "小分裂體",
    hp: 30,
    spd: 72,
    gold: 1,
    r: 10,
    col: "#3ad8c8",
    shape: "blob",
    desc: "分裂體的碎片",
  },
  healer: {
    name: "治癒祭司",
    hp: 80,
    spd: 48,
    gold: 7,
    r: 16,
    heal: 1,
    col: "#ff8ad0",
    shape: "healer",
    desc: "定期治療周圍的敵人",
  },
  shield: {
    name: "盾衛",
    hp: 80,
    shield: 1.1,
    spd: 44,
    gold: 7,
    r: 18,
    col: "#5aa8ff",
    shape: "shield",
    desc: "護盾在未受傷時會再生",
  },
  ghost: {
    name: "幽魂",
    hp: 65,
    spd: 62,
    gold: 6,
    r: 15,
    ghost: 1,
    col: "#d8e4ff",
    shape: "ghost",
    desc: "週期性隱形，無法被鎖定",
  },
  boss_golem: {
    name: "岩石巨像",
    hp: 3200,
    spd: 24,
    gold: 160,
    r: 40,
    armor: 14,
    boss: 1,
    col: "#a8845a",
    shape: "golem",
    desc: "首領：踐踏使附近的塔暫時失效",
  },
  boss_lich: {
    name: "巫妖王",
    hp: 2700,
    spd: 28,
    gold: 160,
    r: 34,
    boss: 1,
    col: "#8a5aff",
    shape: "lich",
    desc: "首領：不斷召喚亡靈",
  },
  boss_dragon: {
    name: "虛空巨龍",
    hp: 2500,
    spd: 38,
    gold: 160,
    r: 38,
    boss: 1,
    fly: 1,
    col: "#ff3a5a",
    shape: "dragon",
    desc: "首領：飛行並週期性衝刺",
  },
};
// 各種敵人從第幾波開始出現。
const ENEMY_UNLOCK = [
  ["slime", 1],
  ["runner", 2],
  ["brute", 4],
  ["flyer", 6],
  ["splitter", 8],
  ["healer", 10],
  ["shield", 12],
  ["ghost", 14],
];

// ===== 地圖 =====
const MAPS = [
  {
    id: "meadow",
    name: "翠綠草原",
    sub: "一切的起點",
    hp: 1,
    spd: 1,
    star: 1,
    theme: "meadow",
    seed: 11,
    path: [
      [-1, 2],
      [5, 2],
      [5, 10],
      [10, 10],
      [10, 3],
      [15, 3],
      [15, 11],
      [19, 11],
    ],
  },
  {
    id: "lava",
    name: "熔岩峽谷",
    sub: "敵人生命 ×1.6・速度 +5%",
    hp: 1.6,
    spd: 1.05,
    star: 1.5,
    theme: "lava",
    seed: 23,
    need: ["meadow", 15],
    path: [
      [-1, 11],
      [3, 11],
      [3, 2],
      [8, 2],
      [8, 12],
      [12, 12],
      [12, 5],
      [17, 5],
      [17, 11],
      [19, 11],
    ],
  },
  {
    id: "astral",
    name: "星界迴廊",
    sub: "敵人生命 ×2.3・速度 +10%",
    hp: 2.3,
    spd: 1.1,
    star: 2.2,
    theme: "astral",
    seed: 37,
    need: ["lava", 15],
    path: [
      [-1, 1],
      [18, 1],
      [18, 12],
      [1, 12],
      [1, 4],
      [15, 4],
      [15, 9],
      [5, 9],
      [5, 7],
      [11, 7],
    ],
  },
];
// 撐過幾波算獲勝。
const WIN_WAVE = 30;

// ===== 遺物 =====
// 稀有度的名稱與顏色。
const RAR_NAME = ["普通", "稀有", "史詩", "傳說"];
const RAR_COL = ["#cfd6e0", "#4fb0ff", "#c868ff", "#ffae3c"];
// 遺物與增益的加成總表；每一局重新計算。
function baseMods() {
  return {
    // 戰鬥：傷害、各元素傷害、攻速、射程與暴擊。
    dmg: 0,
    el: { fire: 0, ice: 0, thunder: 0, poison: 0, wind: 0, earth: 0 },
    rate: 0,
    range: 0,
    crit: 0.05,
    critDmg: 1,
    // 經濟與賭運：擊殺金幣、幸運、拉霸費用與特殊符號的數量。
    gold: 0,
    luck: 0,
    spinCost: 0,
    sevenW: 0,
    wildW: 0,
    bonusW: 0,
    // 金幣與寶石的倍率。
    coinMul: 1,
    gemMul: 1,
    // 元素效果：緩速、燃燒、毒層數、連鎖、多重射擊與爆炸範圍。
    slow: 0,
    burn: 0,
    poisonStacks: 0,
    chain: 0,
    shots: 0,
    splash: 0,
    // 每波利息、免費拉霸、復活次數。
    interest: 0,
    freeSpins: 0,
    revive: 0,
    // 複製道具的機率、升星時額外再升一星的機率。
    mirror: 0,
    stone: 0,
    // 吸血、敵人減速、對首領的傷害。
    vamp: 0,
    enemySlow: 0,
    bossDmg: 0,
    // 賭場中獎倍率、熱度倍率。
    winMul: 1,
    heatMul: 1,
    // 融合塔的傷害、處決門檻、暴擊掉金的機率、幸運格的效果倍率。
    fused: 0,
    execute: 0,
    midas: 0,
    tileMul: 1,
    // 每波寶石、生命上限、光束與脈衝的傷害。
    gemWave: 0,
    maxHp: 0,
    beamPulse: 0,
    // 拉霸補推機率、大抽獎額外回合、法術傷害。
    nudge: 0,
    lottoRounds: 0,
    spellDmg: 0,
    // 賭場贏錢加成、商店折扣、每波贈送的道具。
    casinoWin: 0,
    shopDisc: 0,
    itemsWave: 0,
  };
}
// 所有遺物；r 是稀有度，ap 會修改上面的加成總表。
const RELICS = [
  {
    id: "clover",
    e: "🍀",
    n: "四葉草",
    r: 0,
    d: "幸運 +8",
    ap: (m) => {
      m.luck += 8;
    },
  },
  {
    id: "cat",
    e: "🐱",
    n: "招財貓",
    r: 1,
    d: "擊殺獲得的金幣 +30%",
    ap: (m) => {
      m.gold += 0.3;
    },
  },
  {
    id: "dice",
    e: "🎲",
    n: "灌鉛骰子",
    r: 0,
    d: "暴擊率 +8%",
    ap: (m) => {
      m.crit += 0.08;
    },
  },
  {
    id: "skull",
    e: "💀",
    n: "暴君頭骨",
    r: 1,
    d: "暴擊傷害 +75%",
    ap: (m) => {
      m.critDmg += 0.75;
    },
  },
  {
    id: "ember",
    e: "🔥",
    n: "不滅餘燼",
    r: 0,
    d: "火系傷害 +30%，燃燒傷害 +40%",
    // 六個元素遺物：各自提高該元素的傷害 30%，並加強該元素的特性（燃燒、減速、
    // 連鎖、毒層、多發、爆炸範圍）。
    ap: (m) => {
      m.el.fire += 0.3;
      m.burn += 0.4;
    },
  },
  {
    id: "frost",
    e: "❄️",
    n: "霜之核心",
    r: 0,
    d: "冰系傷害 +30%，緩速效果 +20%",
    ap: (m) => {
      m.el.ice += 0.3;
      m.slow += 0.2;
    },
  },
  {
    id: "storm",
    e: "⚡",
    n: "風暴寶珠",
    r: 0,
    d: "雷系傷害 +30%，連鎖 +1",
    ap: (m) => {
      m.el.thunder += 0.3;
      m.chain += 1;
    },
  },
  {
    id: "venom",
    e: "🧪",
    n: "毒囊",
    r: 0,
    d: "毒系傷害 +30%，劇毒層數上限 +2",
    ap: (m) => {
      m.el.poison += 0.3;
      m.poisonStacks += 2;
    },
  },
  {
    id: "feather",
    e: "🪶",
    n: "鷹羽",
    r: 0,
    d: "風系傷害 +30%，多重射擊 +1",
    ap: (m) => {
      m.el.wind += 0.3;
      m.shots += 1;
    },
  },
  {
    id: "bedrock",
    e: "🪨",
    n: "基岩之心",
    r: 0,
    d: "地系傷害 +30%，濺射範圍 +25%",
    ap: (m) => {
      m.el.earth += 0.3;
      m.splash += 0.25;
    },
  },
  {
    id: "drum",
    e: "🥁",
    n: "戰鼓",
    r: 1,
    d: "攻擊速度 +15%",
    ap: (m) => {
      m.rate += 0.15;
    },
  },
  {
    id: "scope",
    e: "🔭",
    n: "望遠鏡",
    r: 0,
    d: "射程 +12%",
    ap: (m) => {
      m.range += 0.12;
    },
  },
  {
    id: "whet",
    e: "🗡️",
    n: "磨刀石",
    r: 0,
    d: "全傷害 +12%",
    ap: (m) => {
      m.dmg += 0.12;
    },
  },
  {
    id: "crown",
    e: "👑",
    n: "王者之冠",
    r: 3,
    d: "全傷害 +45%",
    ap: (m) => {
      m.dmg += 0.45;
    },
  },
  {
    id: "gear",
    e: "⚙️",
    n: "黃金齒輪",
    r: 1,
    d: "商店價格 -15%",
    ap: (m) => {
      m.shopDisc += 0.15;
    },
  },
  {
    id: "magnet",
    e: "🧲",
    n: "金幣磁鐵",
    r: 0,
    d: "賭場贏錢 +15%",
    ap: (m) => {
      m.casinoWin += 0.15;
    },
  },
  {
    id: "seal7",
    e: "🎰",
    n: "七之封印",
    r: 2,
    d: "命運拉霸中間滾輪多一個幸運 7",
    ap: (m) => {
      m.sevenW += 1;
    },
  },
  {
    id: "mask",
    e: "🎭",
    n: "百搭面具",
    r: 1,
    d: "命運拉霸中間滾輪多一顆彩色百搭球",
    ap: (m) => {
      m.wildW += 1;
    },
  },
  {
    id: "tmap",
    e: "🗺️",
    n: "藏寶圖",
    r: 1,
    d: "命運拉霸中間滾輪多一個道具箱與藥水",
    ap: (m) => {
      m.bonusW += 1;
    },
  },
  {
    id: "mirror",
    e: "🪞",
    n: "雙生鏡",
    r: 2,
    d: "賭場獲得道具時有 20% 機率多拿一個",
    ap: (m) => {
      m.mirror += 0.2;
    },
  },
  {
    id: "stone",
    e: "💎",
    n: "賢者之石",
    r: 2,
    d: "升星時有 15% 機率額外再升一星",
    ap: (m) => {
      m.stone += 0.15;
    },
  },
  {
    id: "piggy",
    e: "🐷",
    n: "存錢筒",
    r: 0,
    d: "每波結束獲得持有金幣 10% 的利息（上限 150）",
    ap: (m) => {
      m.interest += 0.1;
    },
  },
  {
    id: "ticket",
    e: "🎟️",
    n: "彩券",
    r: 0,
    d: "每波結束額外獲得 1 個隨機道具",
    ap: (m) => {
      m.itemsWave += 1;
    },
  },
  {
    id: "ticket2",
    e: "🎫",
    n: "黃金彩券",
    r: 2,
    d: "每波結束額外獲得 2 個隨機道具（品質較好）",
    ap: (m) => {
      m.itemsWave += 2;
    },
  },
  {
    id: "phoenix",
    e: "🐦",
    n: "鳳凰羽毛",
    r: 3,
    d: "城堡被摧毀時復活一次並回滿生命",
    ap: (m) => {
      m.revive = 1;
    },
  },
  {
    id: "giant",
    e: "❤️",
    n: "巨人之心",
    r: 0,
    d: "最大生命 +5（立即回復）",
    ap: (m) => {
      m.maxHp += 5;
    },
    once: () => {
      R.hp += 5;
    },
  },
  {
    id: "fang",
    e: "🦷",
    n: "吸血鬼之牙",
    r: 1,
    d: "每擊殺 40 個敵人回復 1 生命",
    ap: (m) => {
      m.vamp = 1;
    },
  },
  {
    id: "glass",
    e: "⏳",
    n: "時之沙漏",
    r: 1,
    d: "所有敵人移動速度 -10%",
    ap: (m) => {
      m.enemySlow += 0.1;
    },
  },
  {
    id: "hole",
    e: "🌀",
    n: "黑洞碎片",
    r: 2,
    d: "對首領與精英傷害 +60%",
    ap: (m) => {
      m.bossDmg += 0.6;
    },
  },
  {
    id: "gambler",
    e: "🃏",
    n: "賭徒之心",
    r: 2,
    d: "賭場贏錢 +40%，但商店價格 +15%",
    // 賭場贏得更多，商店也打折。
    ap: (m) => {
      m.casinoWin += 0.4;
      m.shopDisc -= 0.15;
    },
  },
  {
    id: "potion",
    e: "🍷",
    n: "狂歡香檳",
    r: 1,
    d: "777 觸發的小瑪莉大抽獎回合 +2",
    ap: (m) => {
      m.lottoRounds += 2;
    },
  },
  {
    id: "shard",
    e: "🔮",
    n: "稜鏡碎片",
    r: 3,
    d: "融合塔（雙元素以上）傷害 +35%",
    ap: (m) => {
      m.fused += 0.35;
    },
  },
  {
    id: "chain",
    e: "🔗",
    n: "連鎖符文",
    r: 1,
    d: "連鎖 +2，多重射擊 +1",
    // 連鎖多 2 次、每次多射 1 發。
    ap: (m) => {
      m.chain += 2;
      m.shots += 1;
    },
  },
  {
    id: "jeweler",
    e: "💍",
    n: "寶石匠",
    r: 0,
    d: "每波結束 +1 寶石",
    ap: (m) => {
      m.gemWave += 1;
    },
  },
  {
    id: "stars7",
    e: "🌟",
    n: "幸運七星",
    r: 3,
    d: "幸運 +25",
    ap: (m) => {
      m.luck += 25;
    },
  },
  {
    id: "axe",
    e: "🪓",
    n: "處刑者",
    r: 2,
    d: "直接斬殺生命低於 12% 的非首領敵人",
    ap: (m) => {
      m.execute = 0.12;
    },
  },
  {
    id: "midas",
    e: "✋",
    n: "點金手",
    r: 1,
    d: "暴擊時有 15% 機率額外掉落金幣",
    ap: (m) => {
      m.midas += 0.15;
    },
  },
  {
    id: "chip",
    e: "💾",
    n: "超頻晶片",
    r: 2,
    d: "攻擊速度 +28%，射程 -5%",
    // 攻速 +28%，但射程 -5%。
    ap: (m) => {
      m.rate += 0.28;
      m.range -= 0.05;
    },
  },
  {
    id: "compass",
    e: "🧭",
    n: "風水羅盤",
    r: 1,
    d: "幸運格加成翻倍，並新增 4 個幸運格",
    ap: (m) => {
      m.tileMul += 1;
    },
    once: () => {
      addLuckyTiles(4);
    },
  },
  {
    id: "battery",
    e: "🔋",
    n: "蓄能電池",
    r: 1,
    d: "光束與脈衝塔傷害 +40%",
    ap: (m) => {
      m.beamPulse += 0.4;
    },
  },
  {
    id: "rainbow",
    e: "🌈",
    n: "彩虹棱晶",
    r: 2,
    d: "命運拉霸「幸運微調」機率 +25%",
    ap: (m) => {
      m.nudge += 0.25;
    },
  },
  {
    id: "tome",
    e: "📖",
    n: "禁咒之書",
    r: 1,
    d: "法術類道具傷害 +60%",
    ap: (m) => {
      m.spellDmg += 0.6;
    },
  },
  {
    id: "amulet",
    e: "🧿",
    n: "護身符",
    r: 0,
    d: "最大生命 +3，幸運 +4",
    // 城堡生命 +3、幸運 +4。
    ap: (m) => {
      m.maxHp += 3;
      m.luck += 4;
    },
    once: () => {
      R.hp += 3;
    },
  },
];
const RELIC_BY = {};
RELICS.forEach((r) => (RELIC_BY[r.id] = r));

// ===== 天賦（永久成長） =====
const TALENTS = [
  {
    id: "gold",
    e: "💰",
    name: "初始資金",
    desc: "開局金幣 +60",
    max: 5,
    cost: (l) => 3 + l * 2,
  },
  {
    id: "luck",
    e: "🍀",
    name: "天生好運",
    desc: "幸運 +4",
    max: 5,
    cost: (l) => 4 + l * 3,
  },
  {
    id: "spins",
    e: "🎁",
    name: "開局道具",
    desc: "開局多拿 2 個隨機道具",
    max: 3,
    cost: (l) => 5 + l * 4,
  },
  {
    id: "hp",
    e: "🏰",
    name: "堅固城堡",
    desc: "最大生命 +4",
    max: 5,
    cost: (l) => 3 + l * 2,
  },
  {
    id: "dmg",
    e: "⚔️",
    name: "武器大師",
    desc: "全傷害 +6%",
    max: 5,
    cost: (l) => 5 + l * 3,
  },
  {
    id: "heat",
    e: "🎯",
    name: "賭神之手",
    desc: "所有賭博輸的時候 +3% 機率重來",
    max: 3,
    cost: (l) => 6 + l * 4,
  },
  {
    id: "relic",
    e: "🏺",
    name: "祖傳遺物",
    desc: "開局獲得一個隨機遺物",
    max: 2,
    cost: (l) => 10 + l * 10,
  },
  {
    id: "gems",
    e: "💎",
    name: "寶石礦脈",
    desc: "開局寶石 +3",
    max: 3,
    cost: (l) => 4 + l * 3,
  },
];

// ===== 首領轉盤（擊敗首領後轉一次） =====
const WHEEL = [
  { t: "金幣 ×10", col: "#ffcf3a", w: 14, k: "gold", v: 10 },
  { t: "道具", col: "#5cff7e", w: 14, k: "item", v: 0 },
  { t: "增益 Buff", col: "#ff7a3a", w: 11, k: "buff", v: 1 },
  { t: "寶石 +3", col: "#4ab8ff", w: 10, k: "gems", v: 3 },
  { t: "金幣 ×25", col: "#ffa020", w: 9, k: "gold", v: 25 },
  { t: "稀有道具", col: "#4f8aff", w: 8, k: "item", v: 0.8 },
  { t: "遺物", col: "#c868ff", w: 7, k: "relic", v: 1 },
  { t: "再轉一次", col: "#ff4ad8", w: 8, k: "again", v: 1 },
  { t: "幸運 +5", col: "#3affaa", w: 8, k: "luck", v: 5 },
  { t: "特殊塔", col: "#ff3a6a", w: 4, k: "sp", v: 0 },
  { t: "傳說道具", col: "#ffae3c", w: 4, k: "item", v: 2 },
  { t: "JACKPOT", col: "#ffffff", w: 2.5, k: "jackpot", v: 1 },
];

// 主選單輪播的提示。
const TIPS = [
  "流程：🎰 賭場贏錢與道具 → 🏪 商店買塔、升星 → ⚔ 戰場布陣開打！",
  "兩座相同、同星級的塔，就能在強化工坊升星，攻擊力大幅提升。",
  "賭場限定塔只能靠賭博拿到：拉霸三個皇冠、刮刮樂、小瑪莉、翻倍挑戰連勝……",
  "戰鼓塔能強化周圍的塔，時光塔能讓範圍內敵人變慢，金礦每波產金。",
  "不同元素同星級的兩座塔可以在強化工坊融合成雙元素塔。",
  "打怪會掉道具袋，用滑鼠掃過就能撿起來。",
  "幸運符、黃金馬蹄這類賭運道具，能讓賭輸的時候有機會重來！",
  "★3 以上的塔會解鎖連擊，★4 覺醒新星，★6 神話天罰！",
  "帶有元素光環的敵人會抵抗該元素，但會被相剋元素重創。",
  "每 5 波會出現精英，每 10 波會出現首領，擊敗首領還能轉首領轉盤。",
  "押注越高，賭場給的道具品質越好！",
];

// ===== 星級技能 =====
const TIER_PERK = [
  "",
  "基礎型態",
  "強化：攻速 +15%、外觀升級為青銅",
  "連擊：25% 機率連續攻擊、地面出現魔法陣",
  "覺醒：每 7 秒釋放新星（3 倍傷害）、長出翅膀",
  "傳說：新星每 5 秒、5 倍傷害；攻擊目標 +1、黃金王冠",
  "神話：每 12 秒降下天罰，轟擊全場 12 個敵人、光柱與三對翅膀",
];
// 元素法術的名稱。
const SPELL_NAME = {
  fire: "隕石雨",
  ice: "暴風雪",
  thunder: "雷霆萬鈞",
  poison: "瘟疫毒霧",
  wind: "龍捲風",
  earth: "大地震",
};
