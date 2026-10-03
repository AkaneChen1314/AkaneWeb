"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  pick = (a) => a[Math.floor(Math.random() * a.length)],
  chance = (n) => Math.random() < n,
  wait = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_VERSION = "1.2",
  MAX_FLOOR = 1000,
  SAVE_KEY = "abyss-adventure-v1",
  BACKUP_SAVE_KEY = "abyss-adventure-v1-backup";
const BUILD_ID = "akane-1.2-codex",
  SETTINGS_KEY = "abyss-adventure-settings";
const STATUS_TURNS = 3;
const BOSS_SPECIAL_EFFECTS = [
  "barrier",
  "weak",
  "burn",
  "drain",
  "bleed",
  "weak",
  "poison",
  "barrier",
  "weak",
  "burn",
  "drain",
  "barrier",
  "bleed",
  "drain",
  "weak",
  "drain",
  "poison",
  "weak",
  "burn",
  "drain",
];
const SIGNATURE_EFFECT_HINTS = {
  barrier: "命中生命後，Boss 取得最大生命 5% 護盾",
  weak: "命中生命後，造成 2 回合虛弱（你的攻擊降低 20%）",
  drain: "命中生命後，消耗你的 10% 最大職業資源",
  burn: "命中生命後，附加 3 回合燃燒",
  poison: "命中生命後，附加 3 回合中毒",
  bleed: "命中生命後，附加 3 回合流血",
};
const BOSS_SIGNATURES = [
  "萬根囚牢",
  "亡骨敕令",
  "龍焰墜星",
  "怒海翻覆",
  "雷霆裁決",
  "冰霜禁域",
  "沙暴毒針",
  "過載脈衝",
  "九曜幻火",
  "龍王終息",
  "深淵低語",
  "永夜鎮壓",
  "群星吞噬",
  "蒼穹風刃",
  "冥河召魂",
  "時間崩塌",
  "次元蟲潮",
  "混沌雙極",
  "天界聖裁",
  "終焉虹滅",
];
let preferences = {
    effects: true,
    sound: false,
  },
  audioContext = null;
try {
  preferences = {
    ...preferences,
    ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
  };
} catch {}
const CLASSES = {
  knight: {
    name: "守護騎士",
    icon: "⚔️",
    resource: "體力 SP",
    maxRes: 70,
    hp: 145,
    atk: 13,
    def: 6,
    crit: 7,
    speed: 7,
    gain: 14,
    desc: "高防禦，擅長格擋與穩定輸出",
    skills: [
      {
        n: "重斬",
        i: "🗡️",
        c: 24,
        d: 1.85,
        cd: 1,
        t: "強力斬擊",
      },
      {
        n: "鐵壁架勢",
        i: "🛡️",
        c: 22,
        guard: 0.32,
        cd: 2,
        t: "獲得最大生命32%的護盾",
      },
      {
        n: "騎士禱言",
        i: "✨",
        c: 38,
        heal: 0.32,
        cd: 3,
        t: "恢復32%最大生命",
      },
    ],
  },
  rogue: {
    name: "暗影盜賊",
    icon: "🗡️",
    resource: "能量 EN",
    maxRes: 100,
    hp: 100,
    atk: 15,
    def: 2,
    crit: 18,
    speed: 15,
    gain: 22,
    desc: "高暴擊與閃避，擅長毒傷",
    skills: [
      {
        n: "背刺",
        i: "🌑",
        c: 34,
        d: 1.7,
        crit: 35,
        cd: 1,
        t: "高暴擊的致命一擊",
      },
      {
        n: "淬毒飛刃",
        i: "☠️",
        c: 28,
        d: 0.65,
        poison: 7,
        cd: 2,
        t: "造成傷害並附加中毒",
      },
      {
        n: "幻影連擊",
        i: "💨",
        c: 55,
        d: 0.72,
        hits: 3,
        evade: 25,
        cd: 3,
        t: "三連擊並提升本回合閃避",
      },
    ],
  },
  mage: {
    name: "元素法師",
    icon: "🔮",
    resource: "魔力 MP",
    maxRes: 120,
    hp: 92,
    atk: 17,
    def: 1,
    crit: 11,
    speed: 9,
    gain: 12,
    desc: "消耗魔力施放元素魔法與回復術",
    skills: [
      {
        n: "烈焰彈",
        i: "🔥",
        c: 30,
        d: 1.65,
        burn: 6,
        cd: 1,
        t: "高傷害並附加燃燒",
      },
      {
        n: "冰封術",
        i: "❄️",
        c: 38,
        d: 1.1,
        stun: true,
        cd: 3,
        t: "造成傷害並讓敵人停止一次",
      },
      {
        n: "生命回復術",
        i: "💚",
        c: 42,
        heal: 0.42,
        cd: 3,
        t: "恢復42%最大生命",
      },
    ],
  },
  ranger: {
    name: "荒野獵人",
    icon: "🏹",
    resource: "專注 FP",
    maxRes: 90,
    hp: 110,
    atk: 15,
    def: 3,
    crit: 15,
    speed: 13,
    gain: 18,
    desc: "遠距離破甲、連射與野外治療",
    skills: [
      {
        n: "穿甲箭",
        i: "🎯",
        c: 27,
        d: 1.55,
        pierce: true,
        cd: 1,
        t: "無視敵人防禦與護盾",
      },
      {
        n: "疾風連射",
        i: "🏹",
        c: 44,
        d: 0.68,
        hits: 3,
        cd: 2,
        t: "連續射出三支箭",
      },
      {
        n: "野外急救",
        i: "🌿",
        c: 34,
        heal: 0.3,
        cleanse: true,
        cd: 3,
        t: "恢復30%生命並清除異常",
      },
    ],
  },
  priest: {
    name: "聖光祭司",
    icon: "🕊️",
    resource: "聖力 MP",
    maxRes: 115,
    hp: 108,
    atk: 12,
    def: 4,
    crit: 9,
    speed: 8,
    gain: 14,
    desc: "強力治療、護盾與神聖攻擊",
    skills: [
      {
        n: "聖光裁決",
        i: "☀️",
        c: 27,
        d: 1.5,
        cd: 1,
        t: "以聖光攻擊敵人",
      },
      {
        n: "大回復術",
        i: "💖",
        c: 40,
        heal: 0.48,
        cd: 3,
        t: "恢復48%最大生命",
      },
      {
        n: "神聖屏障",
        i: "🔆",
        c: 35,
        guard: 0.48,
        cd: 3,
        t: "獲得最大生命48%的護盾",
      },
    ],
  },
  berserker: {
    name: "狂戰士",
    icon: "🪓",
    resource: "怒氣 RG",
    maxRes: 100,
    hp: 132,
    atk: 18,
    def: 2,
    crit: 13,
    speed: 9,
    gain: 19,
    desc: "受傷累積怒氣，以生命換取爆發",
    skills: [
      {
        n: "血怒斬",
        i: "🩸",
        c: 28,
        d: 2,
        self: 0.06,
        cd: 1,
        t: "高傷害但消耗6%生命",
      },
      {
        n: "戰吼",
        i: "📣",
        c: 32,
        buff: 1.4,
        cd: 3,
        t: "接下來兩次攻擊提高40%",
      },
      {
        n: "狂亂風暴",
        i: "🌪️",
        c: 65,
        d: 0.88,
        hits: 3,
        leech: 0.22,
        cd: 4,
        t: "三連擊並吸取22%傷害",
      },
    ],
  },
  god: {
    name: "上帝模式",
    icon: "👁️",
    resource: "神力 GP",
    maxRes: 99999,
    hp: 99999,
    atk: 999,
    def: 50,
    crit: 50,
    speed: 50,
    gain: 99999,
    godMode: true,
    desc: "密碼限定的測試／爽玩職業，擁有壓倒性能力",
    skills: [
      {
        n: "神之裁決",
        i: "⚡",
        c: 0,
        d: 25,
        pierce: true,
        cd: 0,
        t: "造成極高傷害，無視敵人防禦與護盾",
      },
      {
        n: "創世恩典",
        i: "🌟",
        c: 0,
        heal: 1,
        cleanse: true,
        cd: 0,
        t: "完全恢復生命並解除所有異常狀態",
      },
      {
        n: "絕對領域",
        i: "🌌",
        c: 0,
        guard: 1,
        buff: 2,
        cd: 0,
        t: "獲得等同最大生命的護盾，並強化攻擊",
      },
    ],
  },
};
const MATERIALS = {
  gel: {
    n: "史萊姆凝膠",
    i: "🟢",
  },
  fang: {
    n: "野狼尖牙",
    i: "🦷",
  },
  wing: {
    n: "蝙蝠翼膜",
    i: "🦇",
  },
  cloth: {
    n: "哥布林布料",
    i: "🧵",
  },
  bone: {
    n: "不死骨片",
    i: "🦴",
  },
  silk: {
    n: "毒蛛絲",
    i: "🕸️",
  },
  ore: {
    n: "魔像礦核",
    i: "🪨",
  },
  dust: {
    n: "元素粉塵",
    i: "✨",
  },
  scale: {
    n: "飛龍鱗片",
    i: "🐉",
  },
  shell: {
    n: "魔獸甲殼",
    i: "🐚",
  },
  feather: {
    n: "幻獸靈羽",
    i: "🪶",
  },
  herb: {
    n: "深境藥草",
    i: "🌿",
  },
  crystal: {
    n: "深境水晶",
    i: "🔷",
  },
  ember: {
    n: "熔火核心",
    i: "🌋",
  },
  ice: {
    n: "永凍結晶",
    i: "🧊",
  },
  shadow: {
    n: "暗影精華",
    i: "🌑",
  },
  spirit: {
    n: "靈魂碎片",
    i: "👻",
  },
  horn: {
    n: "魔獸戰角",
    i: "🦏",
  },
  core: {
    n: "機關核心",
    i: "⚙️",
  },
  void: {
    n: "虛空殘片",
    i: "🕳️",
  },
  star: {
    n: "星界碎晶",
    i: "🌠",
  },
  celestial: {
    n: "天界聖印",
    i: "🔆",
  },
  chaos: {
    n: "混沌核心",
    i: "🌀",
  },
  crown: {
    n: "王者徽記",
    i: "👑",
  },
  stone: {
    n: "強化石",
    i: "💎",
  },
};
const GEAR_TIERS = [
  {
    id: "common",
    name: "普通",
    gold: 45,
    amount: 2,
    unlockFloor: 0,
  },
  {
    id: "rare",
    name: "稀有",
    gold: 160,
    amount: 6,
    unlockFloor: 50,
  },
  {
    id: "epic",
    name: "史詩",
    gold: 480,
    amount: 12,
    unlockFloor: 200,
  },
  {
    id: "legendary",
    name: "傳說",
    gold: 1300,
    amount: 22,
    unlockFloor: 500,
  },
  {
    id: "prismatic",
    name: "彩耀",
    gold: 3200,
    amount: 36,
    unlockFloor: 800,
  },
];
const CLASS_GEAR_BLUEPRINTS = {
  knight: {
    material: "ore",
    secondary: "fang",
    weapons: [
      "鐵衛長劍",
      "狼牙騎士劍",
      "聖銀王劍",
      "龍魂誓約劍",
      "虹耀天穹聖劍",
    ],
    weaponIcons: ["🗡️", "⚔️", "⚜️", "🐲", "🌈"],
    armors: ["鐵衛胸甲", "王城重鎧", "聖銀守護鎧", "龍魂神鎧", "虹耀永恆神鎧"],
    armorIcons: ["🥋", "🛡️", "🦾", "🐉", "💠"],
  },
  rogue: {
    material: "wing",
    secondary: "silk",
    weapons: [
      "新月匕首",
      "影翼雙匕首",
      "夜蛛暗刃",
      "虛空弒神刃",
      "幻虹萬象雙刃",
    ],
    weaponIcons: ["🔪", "🗡️", "🕷️", "🌑", "🌈"],
    armors: [
      "暗行皮甲",
      "影翼斗篷",
      "夜蛛幻影衣",
      "虛空無形甲",
      "幻虹無相夜衣",
    ],
    armorIcons: ["🥋", "🦇", "🕸️", "🌌", "🔮"],
  },
  mage: {
    material: "dust",
    secondary: "ore",
    weapons: [
      "學徒法杖",
      "元素導能杖",
      "星辰秘法杖",
      "創世大賢者杖",
      "七彩神域法杖",
    ],
    weaponIcons: ["🪄", "🔮", "🌠", "✨", "🌈"],
    armors: [
      "魔法長袍",
      "元素法衣",
      "星辰術士袍",
      "創世法神袍",
      "七彩神域星袍",
    ],
    armorIcons: ["🥻", "🔥", "🌟", "🌌", "💫"],
  },
  ranger: {
    material: "fang",
    secondary: "silk",
    weapons: ["獵人短弓", "裂牙獵弓", "蒼風穿雲弓", "龍脈星弓", "虹界破曉神弓"],
    weaponIcons: ["🏹", "🎯", "🌪️", "🌠", "🌈"],
    armors: [
      "斥候皮甲",
      "荒野獵裝",
      "蒼風遊俠甲",
      "龍脈追獵衣",
      "虹界森羅獵裝",
    ],
    armorIcons: ["🥋", "🌿", "🍃", "🐉", "🦚"],
  },
  priest: {
    material: "cloth",
    secondary: "dust",
    weapons: [
      "木製聖杖",
      "祝福權杖",
      "熾天使聖杖",
      "神諭救世權杖",
      "虹光創世聖杖",
    ],
    weaponIcons: ["🪄", "☀️", "🪽", "🕊️", "🌈"],
    armors: [
      "修士白袍",
      "祝福祭衣",
      "熾天使聖衣",
      "神諭救世聖袍",
      "虹光神恩聖袍",
    ],
    armorIcons: ["🥻", "🙏", "🪽", "🌟", "🪷"],
  },
  berserker: {
    material: "bone",
    secondary: "fang",
    weapons: [
      "粗鐵戰斧",
      "血牙巨斧",
      "煉獄狂戰斧",
      "滅世龍王斧",
      "虹滅終焉巨斧",
    ],
    weaponIcons: ["🪓", "🦷", "🔥", "🐲", "🌈"],
    armors: [
      "獸皮戰甲",
      "血骨狂鎧",
      "煉獄霸者甲",
      "滅世龍王鎧",
      "虹滅不朽戰鎧",
    ],
    armorIcons: ["🥋", "🦴", "🔥", "🐉", "🌋"],
  },
};

function gearCost(tier, primary, secondary) {
  const cost = {
    gold: tier.gold,
  };
  cost[primary] = (cost[primary] || 0) + tier.amount;
  if (tier.id !== "common")
    cost[secondary] = (cost[secondary] || 0) + Math.ceil(tier.amount * 0.55);
  if (tier.id === "epic") {
    cost.crystal = 3;
    cost.herb = 3;
    cost.stone = 2;
  }
  if (tier.id === "legendary") {
    cost.scale = (cost.scale || 0) + 9;
    cost.ember = 7;
    cost.shadow = 7;
    cost.spirit = 5;
    cost.crown = 1;
    cost.stone = 5;
  }
  if (tier.id === "prismatic") {
    cost.scale = (cost.scale || 0) + 16;
    cost.crystal = 14;
    cost.void = 12;
    cost.star = 10;
    cost.celestial = 8;
    cost.chaos = 6;
    cost.crown = 3;
    cost.stone = 12;
    cost.dust = (cost.dust || 0) + 14;
  }
  return cost;
}
const GEAR = (() => {
  const gear = {};
  const weaponAtk = [6, 16, 34, 62, 105];
  const armorHp = [24, 65, 145, 285, 500];
  const armorDef = [2, 6, 14, 27, 46];
  for (const [classId, plan] of Object.entries(CLASS_GEAR_BLUEPRINTS)) {
    GEAR_TIERS.forEach((tier, index) => {
      const weapon = {
        n: plan.weapons[index],
        i: plan.weaponIcons[index],
        slot: "weapon",
        atk: weaponAtk[index],
        crit: [0, 1, 3, 6, 11][index],
        classes: [classId, "god"],
        r: tier.id,
        unlockFloor: tier.unlockFloor,
        d: `${CLASSES[classId].name}專用的${tier.name}武器。`,
        cost: gearCost(tier, plan.material, plan.secondary),
      };
      const armor = {
        n: plan.armors[index],
        i: plan.armorIcons[index],
        slot: "armor",
        hp: armorHp[index],
        def: armorDef[index],
        speed: [0, 0, 1, 2, 4][index],
        classes: [classId, "god"],
        r: tier.id,
        unlockFloor: tier.unlockFloor,
        d: `${CLASSES[classId].name}專用的${tier.name}盔甲。`,
        cost: gearCost(tier, plan.material, plan.secondary),
      };
      if (index === 3) {
        weapon.lifesteal = 4;
        armor.poisonResist = 15;
      }
      if (index === 4) {
        weapon.lifesteal = 10;
        armor.poisonResist = 35;
        armor.damageReduce = 8;
      }
      if (classId === "knight") armor.def += index + 1;
      if (classId === "rogue") {
        weapon.crit += [2, 5, 9, 14, 21][index];
        armor.speed += [1, 2, 4, 7, 11][index];
        if (index >= 3) weapon.lifesteal += 2;
        if (index === 4) armor.poisonResist += 10;
      }
      if (classId === "mage") weapon.atk += index + 2;
      if (classId === "ranger") {
        weapon.crit += [1, 4, 7, 12, 18][index];
        armor.speed += [1, 2, 3, 6, 10][index];
      }
      if (classId === "priest") armor.hp += 15 * (index + 1);
      if (classId === "berserker") weapon.atk += 2 * (index + 1);
      gear[`${classId}_weapon_${tier.id}`] = weapon;
      gear[`${classId}_armor_${tier.id}`] = armor;
    });
  }
  return gear;
})();
const POTIONS = {
  red: {
    n: "生命藥水",
    i: "🧪",
    heal: 0.35,
    cost: {
      gold: 35,
    },
    drop: true,
    d: "恢復 35% 最大生命。怪物可能掉落，也能在商店購買。",
  },
  blue: {
    n: "資源藥水",
    i: "⚗️",
    resource: 0.45,
    cost: {
      gold: 35,
    },
    drop: true,
    d: "恢復 45% 職業資源（魔力、體力、能量等）。怪物可能掉落，也能在商店購買。",
  },
  antidote: {
    n: "解毒藥水",
    i: "🌿",
    cleanse: "poison",
    cost: {
      gold: 55,
    },
    d: "解除中毒。只能在商店購買。",
  },
  cooling: {
    n: "滅火藥水",
    i: "💧",
    cleanse: "burn",
    cost: {
      gold: 55,
    },
    d: "解除燃燒。只能在商店購買。",
  },
  bandage: {
    n: "止血藥劑",
    i: "🩹",
    cleanse: "bleed",
    cost: {
      gold: 55,
    },
    d: "解除流血。只能在商店購買。",
  },
  restore: {
    n: "活力藥劑",
    i: "🟡",
    cleanse: "weak",
    cost: {
      gold: 70,
    },
    d: "解除虛弱，恢復正常攻擊能力。只能在商店購買。",
  },
  holy: {
    n: "完全淨化藥水",
    i: "✨",
    cleanse: "all",
    cost: {
      gold: 145,
    },
    d: "一次解除中毒、燃燒、流血與虛弱。只能在商店購買。",
  },
  full: {
    n: "完全回復藥",
    i: "💖",
    heal: 1,
    resource: 1,
    cost: {
      gold: 180,
    },
    d: "完全恢復生命與職業資源。只能在商店購買。",
  },
};
const MONSTER_ARCHETYPES = {
  normal: {
    hp: 1,
    atk: 1,
    def: 2,
    trait: "均衡型：能力平均，沒有額外異常攻擊。",
  },
  swift: {
    hp: 0.78,
    atk: 1.2,
    def: 1,
    trait: "迅捷型：生命與防禦較低，但攻擊力較高。",
  },
  heavy: {
    hp: 1.28,
    atk: 1.12,
    def: 4,
    trait: "重擊型：生命與攻擊較高，行動較為沉重。",
  },
  tank: {
    hp: 1.55,
    atk: 0.86,
    def: 8,
    trait: "裝甲型：擁有厚重防禦，穿甲攻擊特別有效。",
  },
  poison: {
    hp: 0.92,
    atk: 1.08,
    def: 3,
    poison: 3,
    trait: "毒性攻擊：造成生命傷害時附加 3 回合中毒，重複命中刷新而不疊傷。",
  },
  burn: {
    hp: 0.98,
    atk: 1.16,
    def: 4,
    burn: 4,
    trait: "灼熱攻擊：造成生命傷害時附加 3 回合燃燒，重複命中刷新而不疊傷。",
  },
  bleed: {
    hp: 0.86,
    atk: 1.16,
    def: 2,
    bleed: 3,
    trait: "撕裂攻擊：造成生命傷害時附加 3 回合流血，重複命中刷新而不疊傷。",
  },
  doom: {
    hp: 1.08,
    atk: 1.04,
    def: 5,
    doomAfter: 4,
    doomPercent: 0.05,
    trait: "死亡刻印：4 次敵方行動後，每次命中追加最大生命 5% 傷害。",
  },
};
const MONSTER_DATA = [
  ["凝膠史萊姆", "🟢", "gel", "normal", 0],
  ["碎岩蟹", "🦀🪨", "ore", "tank", 0],
  ["微光小精靈", "🧚✨", "dust", "normal", 0],
  ["枯骨遊兵", "💀", "bone", "heavy", 0],
  ["森林野狼", "🐺", "fang", "swift", 0],
  ["月影蝙蝠", "🦇", "wing", "bleed", 0],
  ["哥布林斥候", "👺", "cloth", "normal", 0],
  ["苔岩龜", "🐢", "shell", "tank", 0],
  ["毒牙蛇", "🐍", "herb", "poison", 0],
  ["蜜刺蜂群", "🐝", "silk", "swift", 0],
  ["荒野野豬", "🐗", "fang", "heavy", 0],
  ["夜梟獵手", "🦉", "feather", "swift", 0],
  ["骷髏衛兵", "💀🗡️", "bone", "doom", 1],
  ["劇毒魔蛛", "🕷️☠️", "silk", "poison", 1],
  ["迷霧幽魂", "👻🌫️", "spirit", "doom", 1],
  ["岩石魔像", "🗿🪨", "ore", "tank", 2],
  ["洞窟巨蠍", "🦂🕳️", "shell", "poison", 2],
  ["晶背甲蟲", "🪲🔷", "crystal", "tank", 2],
  ["烈焰精靈", "🔥✨", "dust", "burn", 3],
  ["熔岩蜥蜴", "🦎🌋", "ember", "burn", 3],
  ["火冠鳳鳥", "🐦‍🔥👑", "feather", "burn", 3],
  ["深海巨蟹", "🦀🌊", "shell", "tank", 4],
  ["礁岩鯊魚", "🦈🪨", "fang", "heavy", 4],
  ["深淵水母", "🪼🌌", "void", "poison", 4],
  ["雷角犀牛", "🦏⚡", "horn", "heavy", 5],
  ["風暴雄鷹", "🦅🌪️", "feather", "swift", 5],
  ["金鬃戰獅", "🦁⚔️", "fang", "heavy", 5],
  ["霜牙巨熊", "🐻‍❄️❄️", "fang", "heavy", 6],
  ["冰刃企鵝", "🐧🧊", "ice", "swift", 6],
  ["雪原猛獁", "🐘❄️", "horn", "tank", 6],
  ["沙海眼鏡蛇", "🐍🏜️", "herb", "poison", 7],
  ["荒漠巨鱷", "🐊☀️", "shell", "heavy", 7],
  ["鐵尾蠍獸", "🦂⛓️", "ore", "poison", 7],
  ["機關守衛", "🤖🛡️", "core", "tank", 8],
  ["鋼鐵巨猿", "🦍⚙️", "core", "heavy", 8],
  ["失控機甲", "🦾💥", "ore", "heavy", 8],
  ["月蝕妖狐", "🦊🌘", "shadow", "swift", 9],
  ["幻夢飛蛾", "🦋💤", "dust", "poison", 9],
  ["影界黑豹", "🐈‍⬛🌑", "shadow", "bleed", 9],
  ["煉獄惡魔", "👿🔥", "ember", "burn", 10],
  ["赤鱗飛龍", "🐉🔴", "scale", "burn", 10],
  ["灰燼鳳凰", "🐦‍🔥🌋", "feather", "burn", 10],
  ["深淵觸手", "🐙🌌", "void", "poison", 11],
  ["虛空魔眼", "👁️🕳️", "void", "doom", 11],
  ["星海異獸", "👾🌠", "star", "swift", 11],
  ["永夜石像", "🗿🌑", "ore", "tank", 12],
  ["雷核魔像", "⚡🤖", "core", "tank", 12],
  ["黑曜巨人", "🦣⚫", "crystal", "heavy", 12],
  ["星砂獵犬", "🐕🌟", "star", "swift", 13],
  ["隕星甲蟲", "🪲☄️", "crystal", "tank", 13],
  ["銀河魟獸", "🐟🌌", "star", "normal", 13],
  ["蒼穹獅鷲", "🦅🦁", "feather", "heavy", 14],
  ["天羽孔雀", "🦚🔆", "celestial", "normal", 14],
  ["暴風翼龍", "🐲🌪️", "scale", "swift", 14],
  ["冥河亡靈", "👻⚰️", "spirit", "doom", 15],
  ["死神侍從", "💀🪦", "bone", "doom", 15],
  ["詛咒木乃伊", "🧟‍♂️📜", "cloth", "doom", 15],
  ["時砂蜥獸", "🦎⌛", "crystal", "swift", 16],
  ["鐘擺傀儡", "🕰️🤖", "core", "tank", 16],
  ["裂時幽靈", "👻⏳", "spirit", "doom", 16],
  ["虛空寄生蟲", "🐛🕳️", "void", "poison", 17],
  ["次元吞噬者", "👾🌀", "chaos", "heavy", 17],
  ["異界蜘蛛", "🕷️🌌", "silk", "poison", 17],
  ["混沌鬼面", "👹🌀", "chaos", "heavy", 18],
  ["陰陽靈貓", "🐈☯️", "shadow", "swift", 18],
  ["顛倒魔方", "🎲🔄", "core", "tank", 18],
  ["天界聖獸", "🦄🔆", "celestial", "heavy", 19],
  ["審判熾天使", "😇⚔️", "celestial", "burn", 19],
  ["光輪守衛", "🪽☀️", "star", "tank", 19],
];
const MONSTERS = MONSTER_DATA.map(([n, i, drop, type, tier]) => ({
  n,
  i,
  drop,
  tier,
  type,
  ...MONSTER_ARCHETYPES[type],
}));

function dialogueEffectHint(effect) {
  const parts = [];
  if (effect.shield)
    parts.push(`獲得 ${Math.round(effect.shield * 100)}% 最大生命護盾`);
  if (effect.heal)
    parts.push(`恢復 ${Math.round(effect.heal * 100)}% 最大生命`);
  if (effect.resource)
    parts.push(`恢復 ${Math.round(effect.resource * 100)}% 職業資源`);
  if (effect.firstStrike)
    parts.push(`先制削減 Boss ${Math.round(effect.firstStrike * 100)}% 生命`);
  if (effect.selfDamage)
    parts.push(`承受 ${Math.round(effect.selfDamage * 100)}% 最大生命代價`);
  if (effect.power)
    parts.push(
      `接下來 ${effect.powerHits || 2} 次攻擊提高 ${Math.round((effect.power - 1) * 100)}%`,
    );
  if (effect.enemyAtk && effect.enemyAtk < 1)
    parts.push(`Boss 攻擊降低 ${Math.round((1 - effect.enemyAtk) * 100)}%`);
  if (effect.enemyAtk && effect.enemyAtk > 1)
    parts.push(`Boss 攻擊提高 ${Math.round((effect.enemyAtk - 1) * 100)}%`);
  if (effect.enemyDef)
    parts.push(
      `Boss 防禦${effect.enemyDef < 0 ? "降低" : "提高"} ${Math.abs(effect.enemyDef)}`,
    );
  if (effect.enemyShield)
    parts.push(`Boss 獲得 ${Math.round(effect.enemyShield * 100)}% 生命護盾`);
  return parts.join("，");
}

function makeBossDialogue(theme, chapter, quote, prompt, lines) {
  return {
    theme,
    chapter,
    quote,
    prompt,
    options: lines.map(([label, reply, effect]) => ({
      label,
      reply,
      effect,
      hint: dialogueEffectHint(effect),
    })),
  };
}
const WORLD_BOSSES = [
  {
    floor: 50,
    n: "巨木守護者・尤克特拉",
    i: "🌳👁️",
    hp: 3.1,
    atk: 1.14,
    def: 8,
    drop: "feather",
    bonusDrop: "herb",
    trait: "萬年樹鎧：生命與防禦很高，會以漫長戰鬥考驗冒險者。",
    dialogue: makeBossDialogue(
      "ancient-tree",
      "第一章・古森的審判",
      "「根脈記得每一道傷痕。你踏入古森，是為掠奪，還是為守護？」",
      "枝枒封住去路。你如何回答？",
      [
        [
          "我只取旅途所需",
          "「節制並非軟弱。讓年輪看看你的意志。」",
          {
            shield: 0.18,
          },
        ],
        [
          "森林也必須讓路",
          "「傲慢的火種，就由古森親自熄滅！」",
          {
            firstStrike: 0.07,
            enemyAtk: 1.08,
          },
        ],
        [
          "願我的力量成為新芽",
          "「生命交換生命。接受祝福，也接受考驗。」",
          {
            resource: 0.3,
            enemyShield: 0.06,
          },
        ],
      ],
    ),
  },
  {
    floor: 100,
    n: "骸骨君王・莫爾迪斯",
    i: "👑💀",
    hp: 3.2,
    atk: 1.18,
    def: 10,
    drop: "bone",
    bonusDrop: "spirit",
    doomAfter: 5,
    doomPercent: 0.06,
    trait: "亡國死咒：5 次敵方行動後，每次命中追加最大生命 6% 傷害。",
    dialogue: makeBossDialogue(
      "bone-king",
      "第二章・亡國王座",
      "「跪下吧，活人。朕可以賜你一個沒有痛苦的死法。」",
      "王冠燃起幽光。你如何回應？",
      [
        [
          "你的王國早已結束",
          "「王國會滅，王威不滅。朕要以你的骨頭重築疆土！」",
          {
            power: 1.28,
            powerHits: 2,
          },
        ],
        [
          "告訴我死亡的真相",
          "「死亡沒有真相，只有等待。朕准你多活一刻。」",
          {
            enemyAtk: 0.91,
            enemyShield: 0.08,
          },
        ],
        [
          "我會讓亡魂安息",
          "「安息，只是勝者替敗者編造的謊言！」",
          {
            shield: 0.22,
            heal: 0.18,
          },
        ],
      ],
    ),
  },
  {
    floor: 150,
    n: "赤焰飛龍王・伊格尼斯",
    i: "🐉🔥",
    hp: 3.3,
    atk: 1.22,
    def: 12,
    drop: "scale",
    bonusDrop: "ember",
    burn: 5,
    trait: "王者龍焰：命中附加燃燒，堅硬龍鱗提供高防禦。",
    dialogue: makeBossDialogue(
      "flame-dragon",
      "第三章・龍焰試煉",
      "「你的盔甲能承受熔岩，你的靈魂也能承受龍焰嗎？」",
      "灼熱氣流扭曲視野。你選擇——",
      [
        [
          "我的意志比龍焰更熱",
          "「很好！唯有不怕燃燒的人，才配看見真正的龍火！」",
          {
            firstStrike: 0.06,
            selfDamage: 0.04,
          },
        ],
        [
          "我不是來當獵物的",
          "「獵物總是這麼說。拿起武器證明吧。」",
          {
            resource: 0.25,
            shield: 0.14,
          },
        ],
        [
          "真正的王不靠威嚇",
          "「放肆！本王會用利爪撕碎你的挑釁！」",
          {
            enemyDef: -4,
            enemyAtk: 1.06,
          },
        ],
      ],
    ),
  },
  {
    floor: 200,
    n: "深海霸主・克拉肯",
    i: "🐙🌊",
    hp: 3.45,
    atk: 1.21,
    def: 13,
    drop: "shell",
    bonusDrop: "void",
    poison: 5,
    trait: "深海毒腕：命中附加中毒，厚重觸腕能承受大量傷害。",
    dialogue: makeBossDialogue(
      "ocean",
      "第四章・沉沒王庭",
      "「陸地之子，你的呼吸已經屬於深海。」",
      "黑潮捲住雙腳。你如何掙脫？",
      [
        [
          "斬斷每一條觸腕",
          "「每斷一腕，深海便長出兩條復仇。」",
          {
            firstStrike: 0.08,
            selfDamage: 0.05,
          },
        ],
        [
          "順著潮流尋找破綻",
          "「你能讀懂潮汐，卻讀不懂海底的飢餓。」",
          {
            enemyAtk: 0.92,
            resource: 0.2,
          },
        ],
        [
          "以大地之名拒絕沉沒",
          "「那就抱著陸地的傲慢，一起下沉吧。」",
          {
            shield: 0.2,
            enemyShield: 0.08,
          },
        ],
      ],
    ),
  },
  {
    floor: 250,
    n: "雷霆獅王・雷古勒斯",
    i: "🦁⚡",
    hp: 3.55,
    atk: 1.28,
    def: 14,
    drop: "horn",
    bonusDrop: "feather",
    bleed: 5,
    trait: "雷牙撕裂：攻擊兇猛並附加流血，是偏重爆發的首領。",
    dialogue: makeBossDialogue(
      "thunder",
      "第五章・雷鳴王原",
      "「雷聲響起時，萬獸低頭。為何你還站著？」",
      "獅王踏碎地面等待回答。你說——",
      [
        [
          "因為雷也會被劍切開",
          "「讓本王看看，你的劍快，還是天罰更快！」",
          {
            power: 1.25,
            powerHits: 3,
            selfDamage: 0.05,
          },
        ],
        [
          "我是來贏得王者認可",
          "「認可只給活著走出雷原的人。」",
          {
            shield: 0.25,
            resource: 0.2,
          },
        ],
        [
          "你的咆哮掩飾了猶豫",
          "「激怒王者，是你最後一次聰明。」",
          {
            enemyDef: -5,
            enemyAtk: 1.07,
          },
        ],
      ],
    ),
  },
  {
    floor: 300,
    n: "永霜女皇・斯卡蒂",
    i: "👸❄️",
    hp: 3.65,
    atk: 1.25,
    def: 16,
    drop: "ice",
    bonusDrop: "crystal",
    doomAfter: 6,
    doomPercent: 0.06,
    trait: "冰封倒數：6 次敵方行動後，寒意會讓每次命中追加生命比例傷害。",
    dialogue: makeBossDialogue(
      "frost",
      "第六章・永霜宮殿",
      "「溫度、希望、記憶，都會在我的國度凍結。」",
      "冰晶王座映出你的倒影。你回答——",
      [
        [
          "傷口會痛，證明我還活著",
          "「那我便連疼痛也一同凍住。」",
          {
            heal: 0.25,
            shield: 0.18,
          },
        ],
        [
          "冰也擋不住前進的火",
          "「短暫的火花，只會讓寒夜更美。」",
          {
            firstStrike: 0.07,
            resource: 0.2,
          },
        ],
        [
          "女皇也在等待春天吧",
          "「不要用凡人的季節揣測永恆。」",
          {
            enemyAtk: 0.9,
            enemyShield: 0.1,
          },
        ],
      ],
    ),
  },
  {
    floor: 350,
    n: "沙海巨蠍・賽特",
    i: "🦂🏜️",
    hp: 3.75,
    atk: 1.3,
    def: 17,
    drop: "shell",
    bonusDrop: "horn",
    poison: 6,
    trait: "王蠍劇毒：命中附加強力中毒，甲殼則提供高額防禦。",
    dialogue: makeBossDialogue(
      "desert",
      "第七章・流沙墓域",
      "「沙海不需要墓碑，因為風會抹去所有名字。」",
      "毒針懸在頭頂。你留下哪句話？",
      [
        [
          "我的名字會刻在你的甲殼上",
          "「狂妄的刻刀，先問過流沙是否允許。」",
          {
            enemyDef: -6,
            enemyAtk: 1.06,
          },
        ],
        [
          "風能埋葬，也能帶我前進",
          "「那就看風最後把你的骨頭帶去哪裡。」",
          {
            resource: 0.32,
            shield: 0.12,
          },
        ],
        [
          "我不和毒蠍浪費時間",
          "「匆忙的人，最容易踩進看不見的陷阱。」",
          {
            firstStrike: 0.08,
            selfDamage: 0.04,
          },
        ],
      ],
    ),
  },
  {
    floor: 400,
    n: "機鋼暴君・奧米伽",
    i: "🤖⚙️",
    hp: 3.9,
    atk: 1.27,
    def: 20,
    drop: "core",
    bonusDrop: "ore",
    trait: "超合金裝甲：防禦極高，適合使用穿甲與破勢類技能。",
    dialogue: makeBossDialogue(
      "machine",
      "第八章・鋼鐵都市",
      "「判定完成：有機生命，威脅等級——可刪除。」",
      "紅色準星鎖定心臟。你輸入指令——",
      [
        [
          "執行反制：摧毀核心",
          "「反制程序已記錄。正在計算你的失敗機率。」",
          {
            enemyDef: -7,
            enemyAtk: 1.05,
          },
        ],
        [
          "申請重新判定威脅",
          "「重新判定：危險，但仍不理性。」",
          {
            enemyAtk: 0.9,
            enemyShield: 0.1,
          },
        ],
        [
          "錯誤：你才是過期機型",
          "「偵測到挑釁。解除輸出限制。」",
          {
            power: 1.3,
            powerHits: 2,
            selfDamage: 0.05,
          },
        ],
      ],
    ),
  },
  {
    floor: 450,
    n: "月蝕妖狐・九曜",
    i: "🦊🌘",
    hp: 3.8,
    atk: 1.34,
    def: 16,
    drop: "shadow",
    bonusDrop: "spirit",
    poison: 5,
    trait: "月蝕幻毒：攻擊快速並附加中毒，生命低於同階重裝首領。",
    dialogue: makeBossDialogue(
      "moon",
      "第九章・月蝕幻境",
      "「你看到的我，真的是我嗎？你握著的劍，又真的是劍嗎？」",
      "九條狐影同時微笑。你相信什麼？",
      [
        [
          "我只相信命中的一擊",
          "「那就試著命中不存在的我吧。」",
          {
            power: 1.24,
            powerHits: 3,
          },
        ],
        [
          "幻術也需要施術者維持",
          "「聰明的人，往往更容易相信自己的錯誤。」",
          {
            enemyAtk: 0.89,
            enemyShield: 0.09,
          },
        ],
        [
          "我相信走到這裡的自己",
          "「真麻煩……這種答案最難被幻象吞掉。」",
          {
            shield: 0.24,
            resource: 0.28,
          },
        ],
      ],
    ),
  },
  {
    floor: 500,
    n: "滅世古龍・巴哈姆特",
    i: "🐲🔥",
    hp: 4.15,
    atk: 1.4,
    def: 22,
    drop: "scale",
    bonusDrop: "ember",
    burn: 7,
    doomAfter: 6,
    doomPercent: 0.07,
    trait: "滅世龍焰：燃燒與倒數詛咒同時存在，是中段最大的能力檢查。",
    dialogue: makeBossDialogue(
      "bahamut",
      "第十章・滅世龍鳴",
      "「五百層的掙扎，只讓你有資格仰望吾。」",
      "天空被龍翼遮蔽。面對滅世宣告，你選擇——",
      [
        [
          "那就從我開始毀滅",
          "「如你所願。讓第一片灰燼記住自己的名字。」",
          {
            firstStrike: 0.09,
            selfDamage: 0.08,
          },
        ],
        [
          "我背後有必須守護的人",
          "「守護只會讓失去更加痛苦。」",
          {
            shield: 0.32,
            enemyAtk: 0.94,
          },
        ],
        [
          "古龍，你也害怕改變",
          "「吾不畏改變——吾就是一切改變的終點！」",
          {
            enemyDef: -7,
            enemyShield: 0.1,
          },
        ],
      ],
    ),
  },
  {
    floor: 550,
    n: "深淵魔神・阿撒托斯",
    i: "👿🌌",
    hp: 4.25,
    atk: 1.38,
    def: 23,
    drop: "void",
    bonusDrop: "dust",
    poison: 7,
    doomAfter: 6,
    doomPercent: 0.07,
    trait: "深淵低語：中毒與倒數詛咒會持續消耗回復資源。",
    dialogue: makeBossDialogue(
      "abyss-god",
      "第十一章・凝視深淵",
      "「那不是風，是你的理智正在裂開。」",
      "無數低語鑽入腦海。你抓住哪個念頭？",
      [
        [
          "記住自己的名字",
          "「名字只是脆弱的錨。鎖鏈終將斷裂。」",
          {
            resource: 0.38,
            shield: 0.12,
          },
        ],
        [
          "反過來凝視深淵",
          "「有趣……看看誰先被誰吞噬。」",
          {
            power: 1.22,
            powerHits: 3,
            selfDamage: 0.07,
          },
        ],
        [
          "你的低語動搖不了我",
          "「否認恐懼，是恐懼最甜美的聲音。」",
          {
            enemyAtk: 0.9,
            enemyShield: 0.12,
          },
        ],
      ],
    ),
  },
  {
    floor: 600,
    n: "永夜巨像・塔爾塔洛斯",
    i: "🗿⚡",
    hp: 4.45,
    atk: 1.35,
    def: 27,
    drop: "ore",
    bonusDrop: "core",
    doomAfter: 6,
    doomPercent: 0.08,
    trait: "永夜天秤：極高防禦並帶有末日倒數，拖延會越來越危險。",
    dialogue: makeBossDialogue(
      "night-titan",
      "第十二章・永夜天秤",
      "「重量、時間、死亡——凡人逃不過任何一項。」",
      "巨像令整座深境震顫。你提出什麼證明？",
      [
        [
          "用我的每一道傷痕",
          "「傷痕證明你未倒下，不能證明你會走到最後。」",
          {
            heal: 0.25,
            shield: 0.2,
          },
        ],
        [
          "用能擊碎你的力量",
          "「力量能敲響巨石，未必能留下裂痕。」",
          {
            enemyDef: -9,
            enemyAtk: 1.08,
          },
        ],
        [
          "你不移步，我便越過你",
          "「讓你的腳步成為傳說，或最後一聲回音。」",
          {
            firstStrike: 0.06,
            resource: 0.3,
          },
        ],
      ],
    ),
  },
  {
    floor: 650,
    n: "星喰巨獸・芬里爾",
    i: "🐺🌠",
    hp: 4.35,
    atk: 1.46,
    def: 22,
    drop: "star",
    bonusDrop: "fang",
    bleed: 7,
    trait: "星喰狼牙：攻擊極高並附加流血，必須掌握防禦時機。",
    dialogue: makeBossDialogue(
      "star-beast",
      "第十三章・群星墓場",
      "「我吞過的星，比你走過的道路更多。」",
      "巨狼張口，星光在獠牙間熄滅。你說——",
      [
        [
          "那就嚐嚐凡人的鋼鐵",
          "「微小，卻刺眼。讓我連同勇氣一起吞下。」",
          {
            firstStrike: 0.09,
            selfDamage: 0.06,
          },
        ],
        [
          "吃得越多，弱點也越明亮",
          "「獵物開始分析獵人了？可笑。」",
          {
            enemyDef: -8,
            enemyAtk: 1.06,
          },
        ],
        [
          "星光會在我身後重燃",
          "「希望是最甜的最後一口。」",
          {
            shield: 0.28,
            resource: 0.25,
          },
        ],
      ],
    ),
  },
  {
    floor: 700,
    n: "天空霸主・迦樓羅",
    i: "🦅🌪️",
    hp: 4.25,
    atk: 1.48,
    def: 21,
    drop: "feather",
    bonusDrop: "celestial",
    bleed: 6,
    trait: "天風裂爪：高攻擊與流血，生命較低但壓力極強。",
    dialogue: makeBossDialogue(
      "sky",
      "第十四章・無垠天牢",
      "「沒有翅膀的人，憑什麼向天空宣戰？」",
      "暴風托起你的身體。你如何回答？",
      [
        [
          "我會踩著風走上去",
          "「那就看看風是階梯，還是斷頭台。」",
          {
            resource: 0.3,
            power: 1.2,
            powerHits: 2,
          },
        ],
        [
          "天空不屬於任何王",
          "「自由？那只是弱者拒絕臣服的名字。」",
          {
            enemyAtk: 0.9,
            enemyShield: 0.08,
          },
        ],
        [
          "落地的鳥也會流血",
          "「先碰到我，再談論鮮血！」",
          {
            firstStrike: 0.08,
            enemyAtk: 1.05,
          },
        ],
      ],
    ),
  },
  {
    floor: 750,
    n: "冥河死神・安庫",
    i: "💀⚰️",
    hp: 4.45,
    atk: 1.43,
    def: 25,
    drop: "spirit",
    bonusDrop: "bone",
    doomAfter: 5,
    doomPercent: 0.09,
    trait: "冥河名冊：倒數很短，發動後每次命中追加最大生命 9% 傷害。",
    dialogue: makeBossDialogue(
      "death",
      "第十五章・冥河名冊",
      "「你的名字已寫在最後一頁，只差死亡簽名。」",
      "死神翻開名冊。你打算如何改寫？",
      [
        [
          "撕掉寫著我的那一頁",
          "「紙能撕，命運不能。」",
          {
            power: 1.3,
            powerHits: 2,
          },
        ],
        [
          "先替你寫下敗北",
          "「死神沒有敗北，只有延後的收割。」",
          {
            enemyDef: -8,
            enemyAtk: 1.07,
          },
        ],
        [
          "我會帶所有名字回去",
          "「你背不起那麼多亡魂。」",
          {
            shield: 0.3,
            heal: 0.18,
          },
        ],
      ],
    ),
  },
  {
    floor: 800,
    n: "時間守衛・克羅諾斯",
    i: "⏳👁️",
    hp: 4.55,
    atk: 1.44,
    def: 27,
    drop: "crystal",
    bonusDrop: "core",
    doomAfter: 5,
    doomPercent: 0.08,
    trait: "時間收束：高防禦與倒數傷害，越晚結束越不利。",
    dialogue: makeBossDialogue(
      "time",
      "第十六章・破碎時鐘",
      "「我看過你一千種結局，其中沒有一種抵達終點。」",
      "時間在你身邊停止。你選擇哪個未來？",
      [
        [
          "創造你沒看過的第一千零一種",
          "「未知只是尚未被時間殺死的已知。」",
          {
            power: 1.25,
            powerHits: 3,
          },
        ],
        [
          "既然看過，就告訴我你的破綻",
          "「每個答案，都會製造新的錯誤。」",
          {
            enemyDef: -10,
            enemyShield: 0.1,
          },
        ],
        [
          "我不需要未來，只要現在",
          "「短視，有時確實最難預測。」",
          {
            resource: 0.4,
            shield: 0.15,
          },
        ],
      ],
    ),
  },
  {
    floor: 850,
    n: "虛空母蟲・涅墨西斯",
    i: "🐛🕳️",
    hp: 4.75,
    atk: 1.42,
    def: 29,
    drop: "void",
    bonusDrop: "silk",
    poison: 8,
    trait: "虛空孢毒：高生命與強力中毒，考驗抗毒裝備和藥水規劃。",
    dialogue: makeBossDialogue(
      "void",
      "第十七章・孵化虛空",
      "「你的世界只是卵殼，裂開後才是真正的出生。」",
      "虛空卵群開始脈動。你要阻止什麼？",
      [
        [
          "在孵化前燒光一切",
          "「火焰也是養分，憤怒也是。」",
          {
            firstStrike: 0.1,
            selfDamage: 0.07,
          },
        ],
        [
          "切斷母體與虛空的連結",
          "「你碰到的每一條線，都連著你的恐懼。」",
          {
            enemyAtk: 0.88,
            enemyShield: 0.12,
          },
        ],
        [
          "讓你的子嗣看見失敗",
          "「牠們第一眼看見的，會是你的遺骸。」",
          {
            shield: 0.26,
            power: 1.18,
            powerHits: 3,
          },
        ],
      ],
    ),
  },
  {
    floor: 900,
    n: "混沌雙生・陰陽",
    i: "☯️👹",
    hp: 4.85,
    atk: 1.5,
    def: 28,
    drop: "chaos",
    bonusDrop: "shadow",
    burn: 6,
    poison: 6,
    trait: "陰陽逆轉：命中同時帶來燃燒與中毒，必須準備淨化手段。",
    dialogue: makeBossDialogue(
      "chaos",
      "第十八章・逆轉天地",
      "「光說你該前進，影說你早已回頭。你相信哪一邊？」",
      "兩個聲音同時進入腦海。你回答——",
      [
        [
          "我走的路不由你們定義",
          "「那就讓矛盾把你的道路撕成兩半。」",
          {
            shield: 0.22,
            resource: 0.3,
          },
        ],
        [
          "光與影都只是我的武器",
          "「想同時握住兩端的人，通常先被自己割傷。」",
          {
            power: 1.32,
            powerHits: 2,
            selfDamage: 0.08,
          },
        ],
        [
          "先讓你們彼此爭論",
          "「我們的分歧，遠比你的團結更加完整。」",
          {
            enemyAtk: 0.88,
            enemyShield: 0.1,
          },
        ],
      ],
    ),
  },
  {
    floor: 950,
    n: "天界審判者・米迦勒",
    i: "😇⚔️",
    hp: 5,
    atk: 1.52,
    def: 31,
    drop: "celestial",
    bonusDrop: "star",
    burn: 7,
    trait: "天罰聖焰：高攻擊、高防禦並附加燃燒，是終點前的最後審判。",
    dialogue: makeBossDialogue(
      "heaven",
      "第十九章・天界審判",
      "「凡人的罪不是弱小，而是明知弱小仍妄圖抵達神座。」",
      "審判之劍落下前，你為自己辯護——",
      [
        [
          "前進不是罪，是選擇",
          "「選擇必須承擔代價。這一劍就是代價。」",
          {
            shield: 0.32,
            enemyAtk: 0.94,
          },
        ],
        [
          "如果神座害怕凡人，那就讓位",
          "「褻瀆者，你會在聖焰中理解秩序。」",
          {
            firstStrike: 0.1,
            enemyAtk: 1.08,
          },
        ],
        [
          "審判我之前，先證明你更強",
          "「很好。力量將成為唯一證詞。」",
          {
            enemyDef: -11,
            power: 1.2,
            powerHits: 2,
          },
        ],
      ],
    ),
  },
  {
    floor: 1000,
    n: "深境終焉・無名王",
    i: "👑🌌",
    hp: 5.35,
    atk: 1.6,
    def: 34,
    drop: "chaos",
    bonusDrop: "crown",
    burn: 8,
    poison: 8,
    doomAfter: 5,
    doomPercent: 0.1,
    trait: "千層終焉：燃燒、中毒與死亡倒數同時存在；擊敗後即完成 1000 層冒險。",
    dialogue: makeBossDialogue(
      "final",
      "最終章・第一千層",
      "「你走過九百九十九層，只為發現終點一直在等你成為新的王。」",
      "王座前沒有退路。你留下最後一句話——",
      [
        [
          "我不是來繼承，是來終結",
          "「那就用最後一戰，證明終結不是另一種開始。」",
          {
            firstStrike: 0.12,
            selfDamage: 0.1,
          },
        ],
        [
          "千層的每一步都站在我身後",
          "「背負眾多意志的人，也會承受眾多失去。」",
          {
            shield: 0.38,
            resource: 0.35,
          },
        ],
        [
          "無名王，記住擊敗你的名字",
          "「若你獲勝，我會讓整座深境替我記住。」",
          {
            power: 1.35,
            powerHits: 3,
            enemyAtk: 1.06,
          },
        ],
      ],
    ),
  },
];
const BOSS_DIALOGUES = Object.fromEntries(
  WORLD_BOSSES.map((boss) => [boss.n, boss.dialogue]),
);
const BOSS_ARENA_COLORS = {
  "ancient-tree": ["#72f5a95c", "#28774758", "#08291f", "#163b28"],
  "bone-king": ["#d4b7ff58", "#69449c55", "#1d1233", "#2b1742"],
  "flame-dragon": ["#ffb14f60", "#e83f2d55", "#3a100e", "#4a1d0d"],
  ocean: ["#58e6ff5c", "#146d9c58", "#061d34", "#0a3850"],
  thunder: ["#ffe76a60", "#7c5eff4d", "#1d1738", "#413613"],
  frost: ["#d6f6ff63", "#5bb8ed55", "#09283d", "#164a66"],
  desert: ["#ffc86a60", "#ca693c52", "#381b0c", "#533016"],
  machine: ["#62ffe75d", "#377ea358", "#061f2c", "#123d45"],
  moon: ["#f09bff5d", "#584ed258", "#1d1037", "#43204e"],
  bahamut: ["#ffd25f68", "#ff304f5c", "#420812", "#4a1b06"],
  "abyss-god": ["#bd68ff65", "#4620805c", "#11061f", "#321044"],
  "night-titan": ["#69cfff58", "#273e8155", "#071426", "#142d4b"],
  "star-beast": ["#9eb9ff60", "#5b42d858", "#100d35", "#242053"],
  sky: ["#aff6ff60", "#3c8ec658", "#08263c", "#19536c"],
  death: ["#c7b0dc59", "#51376f5b", "#110d1c", "#30223d"],
  time: ["#ffe09462", "#3f9b9a50", "#16242a", "#514116"],
  void: ["#c25dff65", "#28104f61", "#07030d", "#260b38"],
  chaos: ["#ff77c263", "#396cff55", "#210a2f", "#3d174a"],
  heaven: ["#fff3ae68", "#80c9ff55", "#18314a", "#5a4b18"],
  final: ["#ff7cdb70", "#8b36ff63", "#170522", "#4c0c40"],
};
const DIFF = {
    easy: {
      hp: 0.82,
      atk: 0.75,
      reward: 1.1,
    },
    normal: {
      hp: 1,
      atk: 1,
      reward: 1,
    },
    hard: {
      hp: 1.22,
      atk: 1.28,
      reward: 1.25,
    },
  },
  ZONES = [
    "翠葉古森",
    "亡國墓域",
    "赤焰龍谷",
    "沉沒王庭",
    "雷鳴王原",
    "永霜宮殿",
    "流沙墓域",
    "鋼鐵都市",
    "月蝕幻境",
    "滅世龍巢",
    "深淵裂界",
    "永夜天秤",
    "群星墓場",
    "無垠天牢",
    "冥河彼岸",
    "破碎時鐘",
    "孵化虛空",
    "逆轉天地",
    "天界審判庭",
    "終焉王座",
  ],
  RARITY = {
    common: "普通",
    rare: "稀有",
    epic: "史詩",
    legendary: "傳說",
    prismatic: "彩耀",
  };
const GOD_PASSWORDS = new Set(["940516", "971201"]);
const TACTICS = {
  heavy: {
    n: "猛力重擊",
    i: "💢",
    key: "Q",
    cost: 0.28,
    cooldown: 1,
    d: 1.7,
    t: "高傷害攻擊，適合把握安全回合",
  },
  interrupt: {
    n: "破勢斬",
    i: "⚡",
    key: "W",
    cost: 0.22,
    cooldown: 2,
    d: 1.1,
    pierce: true,
    t: "穿透防禦，可中斷蓄力與防禦",
  },
  guard: {
    n: "防禦架勢",
    i: "🛡️",
    key: "E",
    cooldown: 2,
    t: "獲得護盾並回復少量職業資源",
  },
  focus: {
    n: "集中蓄力",
    i: "🎯",
    key: "R",
    cooldown: 3,
    t: "大量回復資源，強化接下來兩次攻擊",
  },
};
let difficulty = "normal",
  busy = false,
  selected = null,
  godUnlocked = false;
let potionMode = false,
  selectedBattlePotions = [];
let activeBossDialogue = null;
let S = {
  started: false,
  classId: "knight",
  floor: 0,
  kills: 0,
  gold: 0,
  level: 1,
  xp: 0,
  xpNext: 100,
  hp: 100,
  res: 0,
  baseHp: 100,
  baseAtk: 10,
  baseDef: 2,
  crit: 5,
  speed: 8,
  shield: 0,
  buffs: {},
  debuffs: {},
  cooldowns: [0, 0, 0],
  tacticCooldowns: {},
  combo: 0,
  materials: {},
  potions: {},
  gear: [],
  equipped: {
    weapon: null,
    armor: null,
  },
  enemy: null,
  lastRest: 0,
  nextEliteAt: 3,
  nextEventAt: 5,
  lastEventType: null,
  pendingEvent: null,
  highestFloor: 0,
  discoveredMonsters: [],
  debuffTurns: {},
  completed: false,
  logs: [],
  difficulty: "normal",
  uid: 1,
};

function baseClass() {
  return CLASSES[S.classId];
}

function gearByUid(uid) {
  return S.gear.find((g) => g.uid === uid);
}
const GEAR_VALUE_LABELS = {
  atk: "攻擊",
  hp: "生命",
  def: "防禦",
  crit: "暴擊",
  speed: "速度",
  lifesteal: "吸血",
  poisonResist: "抗毒機率",
  damageReduce: "傷害減免",
};
const GEAR_PERCENT_VALUES = new Set([
  "crit",
  "lifesteal",
  "poisonResist",
  "damageReduce",
]);

function enhancedGearValue(g, key, level = 0) {
  const base = g[key] || 0;
  if (!base) return 0;
  if (
    ["crit", "speed", "lifesteal", "poisonResist", "damageReduce"].includes(key)
  )
    return base + level;
  return Math.round(base * (1 + level * 0.14));
}

function stats() {
  const out = {
    maxHp: S.baseHp,
    atk: S.baseAtk,
    def: S.baseDef,
    crit: S.crit,
    speed: S.speed,
    lifesteal: 0,
    poisonResist: 0,
    damageReduce: 0,
  };
  for (const uid of Object.values(S.equipped)) {
    const inst = gearByUid(uid),
      g = inst && GEAR[inst.id];
    if (!g) continue;
    out.atk += enhancedGearValue(g, "atk", inst.level);
    out.maxHp += enhancedGearValue(g, "hp", inst.level);
    out.def += enhancedGearValue(g, "def", inst.level);
    out.crit += enhancedGearValue(g, "crit", inst.level);
    out.speed += enhancedGearValue(g, "speed", inst.level);
    out.lifesteal += enhancedGearValue(g, "lifesteal", inst.level);
    out.poisonResist += enhancedGearValue(g, "poisonResist", inst.level);
    out.damageReduce += enhancedGearValue(g, "damageReduce", inst.level);
  }
  out.crit = clamp(out.crit, 0, 85);
  out.poisonResist = clamp(out.poisonResist, 0, 80);
  out.damageReduce = clamp(out.damageReduce, 0, 60);
  return out;
}

function save(force = false) {
  // Do not persist half-finished attack/potion transactions on pagehide.
  if (!S.started || (busy && force !== true)) return;
  try {
    const next = JSON.stringify(S),
      previous = localStorage.getItem(SAVE_KEY);
    if (previous && previous !== next) {
      try {
        if (JSON.parse(previous)?.started)
          localStorage.setItem(BACKUP_SAVE_KEY, previous);
      } catch {}
    }
    localStorage.setItem(SAVE_KEY, next);
  } catch (error) {
    reportRuntimeError("存檔失敗，請確認瀏覽器沒有封鎖網站儲存空間。", error);
  }
}

function migrateGearId(id, classId) {
  if (GEAR[id]) return id;
  const playable = CLASS_GEAR_BLUEPRINTS[classId] ? classId : "knight";
  const legacy = {
    ironSword: "knight_weapon_rare",
    shadowDaggers: "rogue_weapon_rare",
    emberStaff: `${["mage", "priest"].includes(playable) ? playable : "mage"}_weapon_rare`,
    hunterBow: "ranger_weapon_rare",
    dragonBlade: `${["knight", "rogue", "berserker"].includes(playable) ? playable : "knight"}_weapon_legendary`,
    archStaff: `${["mage", "priest"].includes(playable) ? playable : "mage"}_weapon_legendary`,
    dragonBow: "ranger_weapon_legendary",
    hideArmor: `${playable}_armor_rare`,
    boneArmor: `${playable}_armor_epic`,
    spiderCloak: `${playable}_armor_epic`,
    dragonArmor: `${playable}_armor_legendary`,
  };
  return legacy[id] || null;
}

function load() {
  try {
    let raw =
        localStorage.getItem(SAVE_KEY) || localStorage.getItem(BACKUP_SAVE_KEY),
      v = null;
    try {
      v = raw ? JSON.parse(raw) : null;
    } catch {
      raw = localStorage.getItem(BACKUP_SAVE_KEY);
      v = raw ? JSON.parse(raw) : null;
      if (v) toast("主要存檔損壞，已自動載入備份");
    }
    if (!v || !CLASSES[v.classId]) return false;
    S = {
      ...S,
      ...v,
      buffs: v.buffs || {},
      debuffs: v.debuffs || {},
      tacticCooldowns: v.tacticCooldowns || {},
      combo: Number.isFinite(v.combo) ? v.combo : 0,
      materials: v.materials || {},
      potions: v.potions || {},
      logs: Array.isArray(v.logs) ? v.logs.slice(0, 60) : [],
      gear: Array.isArray(v.gear) ? v.gear : [],
      equipped: v.equipped || {
        weapon: null,
        armor: null,
      },
      debuffTurns: v.debuffTurns || {},
      highestFloor: Math.max(v.highestFloor || 0, v.floor || 0),
      discoveredMonsters: normalizeDiscoveredMonsters(v.discoveredMonsters),
    };
    for (const entry of S.logs) {
      if (typeof entry?.msg !== "string") continue;
      for (const monster of MONSTERS) {
        if (entry.msg.includes(`「${monster.n}」出現！`))
          discoverMonster(monster);
      }
    }
    if (S.enemy) discoverMonster(S.enemy);
    // Older saves may contain a discontinued side hunt: return safely without rewards.
    if (S.enemy?.hunt) {
      S.enemy = null;
      toast("舊版追獵已結束，已返回原樓層整備；進度與持有物品保留。");
    }
    S.gear = S.gear
      .map((item) => ({
        ...item,
        id: migrateGearId(item.id, S.classId),
      }))
      .filter((item) => item.id && GEAR[item.id]);
    if (S.classId === "god") {
      S.baseHp = CLASSES.god.hp;
      S.baseAtk = CLASSES.god.atk;
      S.hp = CLASSES.god.hp;
      S.res = CLASSES.god.maxRes;
    }
    if (!Number.isFinite(S.nextEliteAt)) S.nextEliteAt = Math.max(3, S.floor);
    if (!Number.isFinite(S.nextEventAt))
      S.nextEventAt = S.floor + 5 + Math.floor(Math.random() * 6);
    if (typeof S.completed !== "boolean") S.completed = S.floor >= MAX_FLOOR;
    S.floor = clamp(Math.floor(S.floor || 0), 0, MAX_FLOOR);
    S.highestFloor = Number.isFinite(S.highestFloor)
      ? clamp(S.highestFloor, 0, MAX_FLOOR)
      : S.floor;
    if (S.floor === MAX_FLOOR && !S.completed && !S.enemy) {
      S.floor = MAX_FLOOR - 1;
      toast("已修復未完成的終焉戰進度，請重新挑戰最終 Boss");
    }
    if (!DIFF[S.difficulty]) S.difficulty = "normal";
    S.cooldowns = Array.isArray(S.cooldowns)
      ? S.cooldowns.slice(0, 3)
      : [0, 0, 0];
    while (S.cooldowns.length < 3) S.cooldowns.push(0);
    S.cooldowns = S.cooldowns.map((value) =>
      Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    );
    S.gear.forEach(
      (item) => (item.level = clamp(Math.floor(item.level || 0), 0, 9)),
    );
    for (const key of ["poison", "burn", "bleed"])
      if (S.debuffs[key])
        S.debuffTurns[key] = clamp(
          S.debuffTurns[key] || STATUS_TURNS,
          1,
          STATUS_TURNS,
        );
    if (S.enemy) {
      S.enemy.effects = S.enemy.effects || {};
      S.enemy.effectTurns = S.enemy.effectTurns || {};
      S.enemy.phase = S.enemy.phase || 1;
      S.enemy.intent = S.enemy.intent || {
        type: "attack",
        icon: "⚔️",
        mult: 1,
      };
      for (const key of ["poison", "burn"])
        if (S.enemy.effects[key])
          S.enemy.effectTurns[key] = clamp(
            S.enemy.effectTurns[key] || STATUS_TURNS,
            1,
            STATUS_TURNS,
          );
      // Floor 1000 is not cleared merely because the final encounter was saved.
      if (S.enemy.worldBoss && S.floor === MAX_FLOOR) S.completed = false;
    }
    difficulty = S.difficulty;
    return true;
  } catch {
    return false;
  }
}

function startGame(id) {
  if (id === "god" && !godUnlocked) {
    requestGodMode();
    return;
  }
  const c = CLASSES[id];
  busy = false;
  activeBossDialogue = null;
  S = {
    started: true,
    classId: id,
    floor: 0,
    kills: 0,
    gold: 45,
    level: 1,
    xp: 0,
    xpNext: 100,
    hp: c.hp,
    res: c.maxRes,
    baseHp: c.hp,
    baseAtk: c.atk,
    baseDef: c.def,
    crit: c.crit,
    speed: c.speed,
    shield: 0,
    buffs: {},
    debuffs: {},
    cooldowns: [0, 0, 0],
    tacticCooldowns: {},
    combo: 0,
    materials: {
      gel: 1,
    },
    potions: {
      red: 2,
      blue: 1,
    },
    gear: [],
    equipped: {
      weapon: null,
      armor: null,
    },
    enemy: null,
    lastRest: 0,
    nextEliteAt: 3,
    nextEventAt: 5 + Math.floor(Math.random() * 6),
    lastEventType: null,
    pendingEvent: null,
    highestFloor: 0,
    discoveredMonsters: [],
    debuffTurns: {},
    completed: false,
    logs: [],
    difficulty,
    uid: 1,
  };
  if (c.godMode) {
    S.level = 99;
    S.gold = 999999;
    S.xpNext = 999999;
    S.materials = Object.fromEntries(
      Object.keys(MATERIALS).map((key) => [key, 999]),
    );
    S.potions = Object.fromEntries(
      Object.keys(POTIONS).map((key) => [key, 99]),
    );
  }
  closeModal("startModal");
  log(`你以「${c.name}」開始了冒險。`, true);
  showExplore();
  render();
  save();
}

function requestGodMode() {
  $("#godPassword").value = "";
  $("#godError").textContent = "";
  openModal("godModal");
  setTimeout(() => $("#godPassword").focus(), 50);
}

function unlockGodMode() {
  const password = $("#godPassword").value.trim();
  if (!GOD_PASSWORDS.has(password)) {
    $("#godError").textContent = "密碼錯誤，無法啟用上帝模式。";
    $("#godPassword").select();
    return;
  }
  godUnlocked = true;
  closeModal("godModal");
  startGame("god");
  toast("上帝模式已解鎖");
}

function continueGame() {
  if (load()) {
    busy = false;
    activeBossDialogue = null;
    closeModal("startModal");
    if (S.enemy) {
      showBattle();
      if (S.enemy.worldBoss && !S.enemy.dialogueResolved) {
        busy = true;
        showBossDialogue();
      }
    } else {
      showExplore();
      if (S.pendingEvent) resumePendingEvent();
    }
    log("已繼續上次冒險。", true);
    render();
  }
}

function monsterPoolForFloor(floor) {
  const chapter = Math.min(19, Math.floor((Math.max(1, floor) - 1) / 50)),
    unlocked = MONSTERS.filter((monster) => monster.tier <= chapter);
  return unlocked.slice(Math.max(0, unlocked.length - 12));
}

function bossForFloor(floor) {
  return WORLD_BOSSES[Math.floor(floor / 50) - 1];
}

function createEnemy(elite = false) {
  if (S.completed || S.floor >= MAX_FLOOR) {
    toast("你已完成 1000 層深境冒險！");
    return;
  }
  S.floor++;
  const encounterFloor = Math.max(1, S.floor),
    worldBoss = S.floor % 50 === 0,
    boss = worldBoss,
    actualElite = elite && !worldBoss,
    m = worldBoss ? bossForFloor(S.floor) : pick(monsterPoolForFloor(S.floor)),
    d = DIFF[S.difficulty],
    growth =
      1 + 0.025 * (encounterFloor - 1) + 0.00004 * (encounterFloor - 1) ** 2,
    attackGrowth =
      1 + 0.018 * (encounterFloor - 1) + 0.000015 * (encounterFloor - 1) ** 2,
    statusScale = 1 + encounterFloor / 120,
    eliteM = actualElite ? 1.38 : 1;
  const maxHp = Math.round(43 * growth * m.hp * d.hp * eliteM),
    atk = Math.max(
      3,
      Math.round(7 * attackGrowth * m.atk * d.atk * (actualElite ? 1.16 : 1)),
    );
  if (actualElite) S.nextEliteAt = S.floor + 3 + Math.floor(Math.random() * 3);
  const enemyTemplate = {
    ...m,
  };
  delete enemyTemplate.dialogue;
  S.enemy = {
    ...enemyTemplate,
    poison: m.poison ? Math.max(1, Math.round(m.poison * statusScale)) : 0,
    burn: m.burn ? Math.max(1, Math.round(m.burn * statusScale)) : 0,
    bleed: m.bleed ? Math.max(1, Math.round(m.bleed * statusScale)) : 0,
    maxHp,
    hp: maxHp,
    atk,
    shield: 0,
    phase: 1,
    signature: worldBoss ? BOSS_SIGNATURES[Math.floor(S.floor / 50) - 1] : null,
    signatureEffect: worldBoss
      ? BOSS_SPECIAL_EFFECTS[Math.floor(S.floor / 50) - 1]
      : null,
    effectTurns: {},
    effects: {
      burn: 0,
      poison: 0,
      weak: 0,
    },
    worldBoss,
    boss,
    elite: actualElite,
    dialogueResolved: !boss,
    intent: null,
    turns: 0,
  };
  discoverMonster(m);
  S.shield = 0;
  S.buffs = {};
  S.debuffs = {};
  S.debuffTurns = {};
  S.cooldowns = [0, 0, 0];
  S.tacticCooldowns = {};
  S.combo = 0;
  rollIntent();
  busy = worldBoss;
  showBattle();
  log(
    `${worldBoss ? `第 ${S.floor} 層大型 Boss` : actualElite ? "菁英小兵" : "魔物"}「${m.n}」出現！`,
    true,
  );
  render();
  save(true);
  if (worldBoss) showBossDialogue();
  else busy = false;
}

function updateArenaTheme() {
  const arena = $("#arena"),
    themes = [
      "zone-forest",
      "zone-cavern",
      "zone-wasteland",
      "zone-volcano",
      "zone-abyss",
    ],
    zoneIndex = Math.floor(Math.max(0, S.floor - 1) / 50) % themes.length;
  arena.classList.remove(...themes);
  arena.classList.add(themes[zoneIndex]);
}

function bossEffectSummary(effect) {
  const parts = [],
    st = stats(),
    c = baseClass(),
    e = S.enemy;
  if (effect.shield)
    parts.push(`你獲得 ${Math.round(st.maxHp * effect.shield)} 點護盾`);
  if (effect.heal)
    parts.push(`恢復 ${Math.round(st.maxHp * effect.heal)} 點生命`);
  if (effect.resource)
    parts.push(
      `恢復 ${Math.round(c.maxRes * effect.resource)} 點${c.resource}`,
    );
  if (effect.firstStrike)
    parts.push(
      `先制造成 ${Math.max(1, Math.round(e.maxHp * effect.firstStrike))} 點傷害`,
    );
  if (effect.selfDamage)
    parts.push(
      `你承受 ${Math.max(1, Math.round(st.maxHp * effect.selfDamage))} 點代價`,
    );
  if (effect.power)
    parts.push(
      `接下來 ${effect.powerHits || 2} 次攻擊傷害提高 ${Math.round((effect.power - 1) * 100)}%`,
    );
  if (effect.enemyAtk && effect.enemyAtk < 1)
    parts.push(`Boss 攻擊降低 ${Math.round((1 - effect.enemyAtk) * 100)}%`);
  if (effect.enemyAtk && effect.enemyAtk > 1)
    parts.push(`Boss 攻擊提高 ${Math.round((effect.enemyAtk - 1) * 100)}%`);
  if (effect.enemyDef)
    parts.push(
      `Boss 防禦${effect.enemyDef < 0 ? "降低" : "提高"} ${Math.abs(effect.enemyDef)}`,
    );
  if (effect.enemyShield)
    parts.push(`Boss 獲得 ${Math.round(e.maxHp * effect.enemyShield)} 點護盾`);
  return parts.join("；");
}

function applyBossDialogueEffect(effect) {
  const st = stats(),
    c = baseClass(),
    e = S.enemy;
  if (!e) return;
  if (effect.shield) S.shield += Math.round(st.maxHp * effect.shield);
  if (effect.heal)
    S.hp = Math.min(st.maxHp, S.hp + Math.round(st.maxHp * effect.heal));
  if (effect.resource)
    S.res = Math.min(c.maxRes, S.res + Math.round(c.maxRes * effect.resource));
  if (effect.firstStrike)
    e.hp = Math.max(
      1,
      e.hp - Math.max(1, Math.round(e.maxHp * effect.firstStrike)),
    );
  if (effect.selfDamage)
    S.hp = Math.max(
      1,
      S.hp - Math.max(1, Math.round(st.maxHp * effect.selfDamage)),
    );
  if (effect.power)
    S.buffs.power = {
      mult: effect.power,
      hits: effect.powerHits || 2,
    };
  if (effect.enemyAtk) e.atk = Math.max(1, Math.round(e.atk * effect.enemyAtk));
  if (effect.enemyDef) e.def = Math.max(0, e.def + effect.enemyDef);
  if (effect.enemyShield) e.shield += Math.round(e.maxHp * effect.enemyShield);
}

function showBossDialogue() {
  const e = S.enemy,
    dialogue = e && BOSS_DIALOGUES[e.n];
  if (!e || !e.boss || e.dialogueResolved || !dialogue) {
    busy = false;
    render();
    return;
  }
  activeBossDialogue = dialogue;
  const modal = $("#bossDialogueModal"),
    card = $("#bossDialogueCard");
  modal.className = `modal boss-dialogue-modal theme-${dialogue.theme}`;
  card.className = `boss-dialogue-card theme-${dialogue.theme}${e.worldBoss ? " world-dialogue" : ""}`;
  $("#bossDialogueRank").textContent = e.worldBoss
    ? `第 ${S.floor} 層 · 傳說級大型 BOSS`
    : `第 ${S.floor} 層 · 深境首領`;
  $("#bossDialogueChapter").textContent = dialogue.chapter;
  $("#bossDialogueSprite").textContent = e.i;
  $("#bossDialogueName").textContent = e.n;
  $("#bossDialogueQuote").textContent = dialogue.quote;
  $("#bossDialoguePrompt").textContent = dialogue.prompt;
  $("#bossDialogueOptions").innerHTML = dialogue.options
    .map(
      (option, index) =>
        `<button class="boss-dialogue-option" data-boss-choice="${index}"><span>${index + 1}</span><div><b>${option.label}</b><small>${option.hint}</small></div><em>選擇</em></button>`,
    )
    .join("");
  $("#bossDialogueReaction").classList.add("hidden");
  $("#bossDialogueContinue").classList.add("hidden");
  modal.classList.add("open");
  document.body.classList.add("modal-active");
  requestAnimationFrame(() => modal.classList.add("dialogue-entered"));
  setTimeout(() => $("#bossDialogueOptions button")?.focus(), 180);
}

function chooseBossDialogue(index) {
  const e = S.enemy,
    dialogue = activeBossDialogue,
    option = dialogue?.options[index];
  if (!e || !e.boss || e.dialogueResolved || !option) return;
  e.dialogueResolved = true;
  applyBossDialogueEffect(option.effect);
  const summary = bossEffectSummary(option.effect);
  $$("#bossDialogueOptions button").forEach((button, buttonIndex) => {
    button.disabled = true;
    button.classList.toggle("chosen", buttonIndex === index);
  });
  $("#bossDialoguePrompt").textContent = `你選擇：「${option.label}」`;
  $("#bossDialogueReply").textContent = option.reply;
  $("#bossDialogueResult").textContent = summary;
  $("#bossDialogueReaction").classList.remove("hidden");
  $("#bossDialogueContinue").classList.remove("hidden");
  log(`Boss 對話「${option.label}」：${summary}。`, true);
  render();
  save(true);
  setTimeout(() => $("#bossDialogueContinue")?.focus(), 120);
}

function beginBossBattle() {
  if (!S.enemy?.dialogueResolved) return;
  const modal = $("#bossDialogueModal");
  modal.classList.remove("dialogue-entered", "open");
  document.body.classList.toggle("modal-active", !!$(".modal.open"));
  busy = false;
  activeBossDialogue = null;
  battleFX("arrival");
  announce(`${S.enemy.n}`, "王座決戰 · 第一階段");
  log(`與「${S.enemy.n}」的決戰正式開始！`, true);
  render();
  save();
}

function rollIntent() {
  if (!S.enemy) return;
  const e = S.enemy,
    r = Math.random(),
    attackCut =
      e.type === "swift"
        ? 0.74
        : e.type === "heavy"
          ? 0.35
          : e.type === "tank"
            ? 0.4
            : 0.58,
    heavyCut = e.type === "tank" ? 0.6 : e.type === "heavy" ? 0.9 : 0.8;
  if (e.worldBoss && e.turns > 0 && e.turns % 4 === 3) {
    e.intent = {
      type: "signature",
      icon: "🌌",
      mult: e.phase === 2 ? 1.85 : 1.6,
      name: e.signature || BOSS_SIGNATURES[Math.floor(S.floor / 50) - 1],
    };
    return;
  }
  if (r < attackCut)
    e.intent = {
      type: "attack",
      icon: "⚔️",
      mult: 1,
    };
  else if (r < heavyCut)
    e.intent = {
      type: "heavy",
      icon: "💥",
      mult: 1.55,
    };
  else
    e.intent = {
      type: "guard",
      icon: "🛡️",
      value: Math.round(e.maxHp * 0.13),
    };
}

function intentText() {
  const e = S.enemy,
    x = e?.intent;
  if (!x) return "";
  if (x.type === "guard") return `防禦：護盾 ${x.value}`;
  const n = Math.round(e.atk * x.mult);
  return x.type === "signature"
    ? `${x.name}：約 ${n}`
    : x.type === "heavy"
      ? `蓄力重擊：約 ${n}`
      : `普通攻擊：約 ${n}`;
}

function intentTooltip() {
  const x = S.enemy?.intent;
  if (!x) return "";
  if (x.type === "guard")
    return `防禦：敵人這回合不攻擊，並獲得 ${x.value} 點護盾。`;
  if (x.type === "signature")
    return `Boss 專屬招式「${x.name}」：下次行動造成約 ${Math.round(S.enemy.atk * x.mult)} 基礎傷害。${signatureEffectHint(S.enemy)}。可用破勢斬中斷；防禦、減傷、護盾與閃避都有效。`;
  if (x.type === "heavy")
    return "蓄力重擊：造成約 1.55 倍傷害，可以用護盾、治療或閃避應對。";
  return "普通攻擊：依敵人攻擊力計算傷害，再扣除你的防禦與護盾。";
}

function intentAdvice() {
  const type = S.enemy?.intent?.type;
  if (["heavy", "signature"].includes(type)) return "推薦：破勢斬或防禦";
  if (type === "guard") return "推薦：破勢斬中斷";
  return "推薦：防禦或蓄力";
}

function enemyNoteText(e) {
  const defense =
      e.def > 0
        ? `<span>🛡️ 防禦 ${e.def}：每次受到非穿甲攻擊時減少 ${e.def} 點傷害。</span>`
        : `<span>🛡️ 防禦 0：沒有傷害減免。</span>`,
    trait = e.trait ? `<span>ℹ️ ${e.trait}</span>` : "",
    doom = e.doomAfter
      ? e.turns >= e.doomAfter
        ? `<span class="danger">☠️ 詛咒已發動：敵人命中時追加約 ${Math.round(stats().maxHp * e.doomPercent)} 傷害。</span>`
        : `<span class="warning">⏳ 擊殺倒數：還剩 ${e.doomAfter - e.turns} 次敵方行動。</span>`
      : "";
  const bossTip = e.worldBoss
    ? `低於 50% 生命進入第二階段，攻擊提升 15%。每 4 次行動準備「${e.signature || BOSS_SIGNATURES[Math.floor(S.floor / 50) - 1]}」，破勢斬可中斷。${signatureEffectHint(e)}；完全格擋可阻止附加效果。`
    : "";
  const mechanics = e.worldBoss
    ? `<span class="status-tip boss-mechanic" tabindex="0" data-tooltip="${escapeHtml(bossTip)}">👑 ${e.phase === 2 ? "第二階段" : "第一階段"} · 招式 ${(e.turns % 4) + 1}/4 ⓘ</span>`
    : "";
  const status = [
    e.poison ? "中毒" : "",
    e.burn ? "燃燒" : "",
    e.bleed ? "流血" : "",
  ].filter(Boolean);
  return (
    defense +
    trait +
    doom +
    mechanics +
    (status.length
      ? `<span class="status-tip" tabindex="0" data-tooltip="${status.join("／")}最多持續 3 回合，重複命中不疊傷，完全格擋可阻止附加。">🧪 異常 ${status.join("／")} ⓘ</span>`
      : "")
  );
}
// One exit point for every player turn: unlock, render, then persist.
// If an action fails midway, restore its pre-turn snapshot rather than leaving
// potions/resources consumed and the controls permanently disabled.
async function runCombatAction(action) {
  if (busy || !S.enemy) return;
  const snapshot = JSON.stringify(S);
  try {
    await action();
  } catch (error) {
    S = JSON.parse(snapshot);
    busy = false;
    potionMode = false;
    selectedBattlePotions = [];
    closeModal("eventModal");
    if (S.enemy) showBattle();
    else showExplore();
    reportRuntimeError("本回合未完成，已恢復行動前的狀態，請重新選擇。", error);
  } finally {
    busy = false;
    render();
    save();
  }
}
async function useSkill(key) {
  if (potionMode) return;
  return runCombatAction(() => performSkill(key));
}
async function performSkill(key) {
  if (busy || !S.enemy || potionMode) return;
  const c = baseClass(),
    skill = key === "basic" ? null : c.skills[+key];
  if (key !== "basic" && !skill) return;
  if (skill && (S.res < skill.c || S.cooldowns[+key] > 0)) {
    toast(
      S.cooldowns[+key] > 0
        ? `技能還需等待 ${S.cooldowns[+key]} 回合`
        : "職業資源不足",
    );
    return;
  }
  busy = true;
  render();
  battleFX(
    key === "basic"
      ? "slash"
      : ["mage", "priest"].includes(S.classId)
        ? "magic"
        : "slash",
  );
  let total = 0;
  if (!skill) {
    S.res = Math.min(c.maxRes, S.res + c.gain);
    total = await dealDamage({
      d: 1,
    });
    log(`普通攻擊造成 ${total} 傷害，恢復 ${c.gain} 點資源。`);
  } else {
    S.res -= skill.c;
    S.cooldowns[+key] = skill.cd + 1;
    if (skill.d) {
      for (let i = 0; i < (skill.hits || 1); i++) {
        total += await dealDamage(skill);
        if (S.enemy.hp <= 0) break;
        await wait(80);
      }
    }
    if (skill.guard) {
      const n = Math.round(stats().maxHp * skill.guard);
      S.shield += n;
      floatText(`護盾 +${n}`, "block", 30, 53);
    }
    if (skill.heal) {
      const n = Math.round(stats().maxHp * skill.heal),
        before = S.hp;
      S.hp = Math.min(stats().maxHp, S.hp + n);
      floatText(`+${S.hp - before}`, "heal", 30, 53);
    }
    if (skill.burn) setEnemyStatus("burn", skill.burn);
    if (skill.poison) setEnemyStatus("poison", skill.poison);
    if (skill.stun) S.enemy.stunned = true;
    if (skill.cleanse) {
      S.debuffs = {};
      S.debuffTurns = {};
    }
    if (skill.evade) S.buffs.evade = skill.evade;
    if (skill.buff)
      S.buffs.power = {
        mult: skill.buff,
        hits: 2,
      };
    if (skill.self)
      S.hp = Math.max(1, S.hp - Math.round(stats().maxHp * skill.self));
    if (skill.leech && total)
      S.hp = Math.min(stats().maxHp, S.hp + Math.round(total * skill.leech));
    log(
      `施放「${skill.n}」${
        total
          ? `，造成 ${total}
    傷害`
          : ""
      }。`,
      true,
    );
  }
  if (total) advanceCombo();
  render();
  if (S.enemy.hp <= 0) {
    await victory();
    busy = false;
    return;
  }
  await wait(280);
  await enemyTurn();
  busy = false;
  render();
  save();
}

function tacticCost(tactic) {
  return tactic.cost ? Math.ceil(baseClass().maxRes * tactic.cost) : 0;
}

function advanceCombo() {
  S.combo = Math.min(5, (S.combo || 0) + 1);
  if (S.combo >= 3) toast(`連擊 ×${S.combo}：傷害加成 ${S.combo * 4}%`);
}
async function useTactic(id) {
  if (potionMode) return;
  return runCombatAction(() => performTactic(id));
}
async function performTactic(id) {
  if (busy || !S.enemy || potionMode) return;
  const tactic = TACTICS[id];
  if (!tactic) return;
  const cost = tacticCost(tactic),
    cooldown = S.tacticCooldowns[id] || 0;
  if (cooldown > 0) {
    toast(`「${tactic.n}」還需等待 ${cooldown} 回合`);
    return;
  }
  if (S.res < cost) {
    toast("職業資源不足");
    return;
  }
  busy = true;
  render();
  battleFX(id === "guard" ? "guard" : id === "focus" ? "magic" : "slash");
  S.res -= cost;
  S.tacticCooldowns[id] = tactic.cooldown + 1;
  let total = 0;
  if (tactic.d) {
    total = await dealDamage(tactic);
    advanceCombo();
  }
  if (id === "interrupt") {
    if (["heavy", "guard", "signature"].includes(S.enemy.intent.type)) {
      S.enemy.stunned = true;
      log(`破勢成功！中斷了「${intentText()}」。`, true);
      floatText("中斷！", "block", 63, 35);
    } else log("破勢斬命中，但敵人目前沒有可中斷的動作。");
  }
  if (id === "guard") {
    const shield = Math.round(stats().maxHp * 0.28),
      gain = Math.ceil(baseClass().maxRes * 0.1);
    S.shield += shield;
    S.res = Math.min(baseClass().maxRes, S.res + gain);
    floatText(`護盾 +${shield}`, "block", 30, 52);
    log(`進入防禦架勢，獲得 ${shield} 護盾並回復 ${gain} 點資源。`, true);
  }
  if (id === "focus") {
    const gain = Math.ceil(baseClass().maxRes * 0.38);
    S.res = Math.min(baseClass().maxRes, S.res + gain);
    S.buffs.power = {
      mult: 1.3,
      hits: 2,
    };
    floatText(`資源 +${gain}`, "block", 30, 52);
    log("集中蓄力：接下來兩次攻擊提高 30% 傷害。", true);
  }
  if (total) log(`使用「${tactic.n}」，造成 ${total} 傷害。`, true);
  render();
  if (S.enemy.hp <= 0) {
    await victory();
    busy = false;
    return;
  }
  await wait(280);
  await enemyTurn();
  busy = false;
  render();
  save();
}
async function dealDamage(skill) {
  const st = stats(),
    crit = chance((st.crit + (skill.crit || 0)) / 100),
    power = S.buffs.power?.mult || 1,
    weak = S.debuffs.weak ? 0.8 : 1,
    combo = 1 + (S.combo || 0) * 0.04;
  let raw = Math.round(
    st.atk *
      skill.d *
      power *
      weak *
      combo *
      (crit ? 1.65 : 1) *
      (0.93 + Math.random() * 0.14),
  );
  if (!skill.pierce) {
    raw = Math.max(1, raw - S.enemy.def);
    const blocked = Math.min(S.enemy.shield, raw);
    S.enemy.shield -= blocked;
    raw = Math.max(0, raw - blocked);
  }
  const actualDamage = Math.min(Math.max(0, S.enemy.hp), raw);
  S.enemy.hp = Math.max(0, S.enemy.hp - actualDamage);
  if (st.lifesteal && actualDamage > 0) {
    const before = S.hp,
      healing = Math.max(1, Math.round((actualDamage * st.lifesteal) / 100));
    S.hp = Math.min(st.maxHp, S.hp + healing);
    if (S.hp > before) floatText(`吸血 +${S.hp - before}`, "heal", 31, 48);
  }
  if (S.buffs.power && --S.buffs.power.hits <= 0) delete S.buffs.power;
  checkBossPhase();
  if (crit) battleFX("critical");
  floatText(
    raw ? `${crit ? "暴擊 " : ""}-${actualDamage}` : "護盾格擋",
    raw ? "damage" : "block",
    62,
    43,
  );
  animateEnemy("hit");
  return actualDamage;
}

function applyEnemyDebuff(type, amount) {
  const resistance = type === "poison" ? stats().poisonResist : 0;
  if (resistance && chance(resistance / 100)) {
    floatText("抗毒成功", "block", 30, 48);
    log(`裝備效果發動：抵抗了中毒（${resistance}%）。`, true);
    return false;
  }
  S.debuffs[type] = Math.max(S.debuffs[type] || 0, amount);
  S.debuffTurns[type] = STATUS_TURNS;
  return true;
}

function setEnemyStatus(type, amount) {
  const e = S.enemy;
  if (!e) return;
  e.effects[type] = Math.max(e.effects[type] || 0, amount);
  e.effectTurns[type] = STATUS_TURNS;
}

function tickEnemyStatus(type) {
  const e = S.enemy,
    amount = e.effects[type] || 0;
  if (!amount) return;
  e.hp -= amount;
  e.effects[type] = Math.max(0, amount - 1);
  e.effectTurns[type] = Math.max(0, (e.effectTurns[type] || STATUS_TURNS) - 1);
  if (!e.effectTurns[type]) e.effects[type] = 0;
  floatText(
    `${type === "burn" ? "燃燒" : "中毒"} -${amount}`,
    "damage",
    64,
    38,
  );
  checkBossPhase();
}

function checkBossPhase() {
  const e = S.enemy;
  if (!e?.worldBoss || e.phase === 2 || e.hp <= 0 || e.hp / e.maxHp > 0.5)
    return;
  e.phase = 2;
  e.atk = Math.round(e.atk * 1.15);
  if (e.intent?.type === "signature") e.intent.mult = 1.85;
  $("#arena").classList.add("boss-awakened");
  battleFX("awakening");
  announce("第二階段 · 王座覺醒", "攻擊提升 15% · 注意下一步意圖");
  log(
    `${e.n} 進入第二階段！攻擊提高 15%，專屬招式更強；仍可破勢中斷與防禦。`,
    true,
  );
}
async function enemyTurn() {
  const e = S.enemy;
  if (!e) return;
  if (e.effects.poison) {
    tickEnemyStatus("poison");
    if (e.hp <= 0) {
      await victory();
      return;
    }
  }
  if (e.stunned) {
    e.stunned = false;
    log(`${e.n} 被控制或破勢，無法行動！`);
    playTone("guard");
  } else if (e.intent.type === "guard") {
    e.shield += e.intent.value;
    battleFX("guard");
    log(`${e.n} 獲得 ${e.intent.value} 護盾。`);
  } else {
    animateEnemy("attack");
    if (e.intent.type === "signature") {
      battleFX("signature");
      announce(e.intent.name, "Boss 專屬招式");
    }
    await wait(220);
    const st = stats();
    let raw = Math.max(
      1,
      Math.round(
        (Math.round(e.atk * e.intent.mult) - st.def) *
          (1 - st.damageReduce / 100),
      ),
    );
    const dodge = clamp(
      (st.speed * 0.55 + (S.buffs.evade || 0)) / 100,
      0,
      0.45,
    );
    if (chance(dodge)) {
      floatText("閃避", "block", 30, 52);
      log("你閃開了攻擊！");
    } else {
      const block = Math.min(S.shield, raw),
        damage = raw - block;
      S.shield -= block;
      S.hp -= damage;
      if (damage > 0) S.combo = 0;
      if (S.classId === "berserker")
        S.res = Math.min(baseClass().maxRes, S.res + Math.round(damage * 0.8));
      floatText(damage ? `-${damage}` : "完全格擋", "damage", 30, 52);
      playTone(damage ? "hurt" : "guard");
      log(`${e.n} 造成 ${damage} 傷害。`);
      if (damage > 0) {
        const signatureEffect =
          e.intent.type === "signature"
            ? e.signatureEffect ||
              BOSS_SPECIAL_EFFECTS[Math.floor(S.floor / 50) - 1]
            : null;
        if (e.poison && signatureEffect !== "poison")
          applyEnemyDebuff("poison", e.poison);
        if (e.burn && signatureEffect !== "burn")
          applyEnemyDebuff("burn", e.burn);
        if (e.bleed && signatureEffect !== "bleed")
          applyEnemyDebuff("bleed", e.bleed);
        if (e.intent.type === "signature") applyBossSpecial(e);
      }
      if (damage > 0 && e.doomAfter && e.turns >= e.doomAfter) {
        const doomRaw = Math.max(
            1,
            Math.round(
              stats().maxHp * e.doomPercent * (1 - st.damageReduce / 100),
            ),
          ),
          doomBlock = Math.min(S.shield, doomRaw),
          doomDamage = doomRaw - doomBlock;
        S.shield -= doomBlock;
        S.hp -= doomDamage;
        floatText(`死咒 -${doomDamage}`, "damage", 30, 45);
        log(`倒數詛咒追加 ${doomDamage} 傷害！`, true);
      }
    }
  }
  e.turns = (e.turns || 0) + 1;
  if (e.doomAfter && e.turns === e.doomAfter)
    log(`☠️ ${e.n} 的倒數詛咒已發動！從下一次命中開始追加傷害。`, true);
  if (e.effects.burn) {
    tickEnemyStatus("burn");
  }
  for (const [type, label] of [
    ["poison", "中毒"],
    ["burn", "燃燒"],
    ["bleed", "流血"],
  ]) {
    if (S.debuffs[type]) {
      const n = S.debuffs[type];
      S.hp -= n;
      S.debuffs[type] = Math.max(0, n - 1);
      S.debuffTurns[type] = Math.max(
        0,
        (S.debuffTurns[type] || STATUS_TURNS) - 1,
      );
      if (!S.debuffTurns[type]) S.debuffs[type] = 0;
      S.combo = 0;
      log(`${label}造成 ${n} 點持續傷害。`);
    }
  }
  S.cooldowns = S.cooldowns.map((x) => Math.max(0, x - 1));
  for (const id of Object.keys(TACTICS))
    S.tacticCooldowns[id] = Math.max(0, (S.tacticCooldowns[id] || 0) - 1);
  S.buffs.evade = 0;
  if (S.debuffs.weak > 0) S.debuffs.weak--;
  if (S.hp <= 0) {
    defeat();
    return;
  }
  if (e.hp <= 0) {
    await victory();
    return;
  }
  rollIntent();
}

function signatureEffectHint(enemy) {
  const effect =
    enemy.signatureEffect || BOSS_SPECIAL_EFFECTS[Math.floor(S.floor / 50) - 1];
  return SIGNATURE_EFFECT_HINTS[effect] || "只造成直接傷害";
}

function applyBossSpecial(enemy) {
  const effect =
    enemy.signatureEffect || BOSS_SPECIAL_EFFECTS[Math.floor(S.floor / 50) - 1];
  if (effect === "barrier") enemy.shield += Math.round(enemy.maxHp * 0.05);
  else if (effect === "weak") S.debuffs.weak = Math.max(S.debuffs.weak || 0, 3);
  else if (effect === "drain")
    S.res = Math.max(0, S.res - Math.ceil(baseClass().maxRes * 0.1));
  else if (["burn", "poison", "bleed"].includes(effect))
    applyEnemyDebuff(
      effect,
      enemy[effect] || Math.max(2, Math.round(3 + S.floor / 120)),
    );
  log(
    `「${enemy.intent.name}」追加效果：${signatureEffectHint(enemy)}。`,
    true,
  );
}
async function victory() {
  const e = S.enemy;
  if (!e) return;
  const d = DIFF[S.difficulty],
    rankGold = e.worldBoss ? 5 : e.boss ? 2.7 : e.elite ? 1.7 : 1,
    rankXp = e.worldBoss ? 4.5 : e.boss ? 2.2 : e.elite ? 1.55 : 1,
    gold = Math.round((14 + S.floor * 2.7) * rankGold * d.reward),
    xp = Math.round((30 + S.floor * 3.5) * rankXp);
  S.gold += gold;
  S.xp += xp;
  S.kills++;
  S.highestFloor = Math.max(S.highestFloor, S.floor);
  const dropN =
    (e.worldBoss ? 10 : e.boss ? 4 : e.elite ? 2 : 1) +
    Math.floor(Math.random() * 2);
  const rewards = {};
  const grantMaterial = (id, amount) => {
    if (!id || !MATERIALS[id] || amount <= 0) return;
    rewards[id] = (rewards[id] || 0) + amount;
    addMaterial(id, amount);
  };
  grantMaterial(e.drop, dropN);
  if (e.worldBoss) {
    grantMaterial(e.bonusDrop, 3 + Math.floor(S.floor / 200));
    grantMaterial(
      "crown",
      1 + (S.floor >= 500 ? 1 : 0) + (S.floor === MAX_FLOOR ? 1 : 0),
    );
  }
  if (e.elite || e.boss || chance(0.16))
    grantMaterial("stone", e.worldBoss ? 8 : e.boss ? 3 : 1);
  let potionDrop = "";
  if (chance(e.worldBoss ? 0.85 : 0.18)) {
    const potionId = chance(0.5) ? "red" : "blue";
    S.potions[potionId] = (S.potions[potionId] || 0) + 1;
    potionDrop = `、${POTIONS[potionId].n}×1`;
  }
  const materialText = Object.entries(rewards)
    .map(([id, amount]) => `${MATERIALS[id].n}×${amount}`)
    .join("、");
  log(
    `討伐成功：獲得 ${gold} 金幣、${xp} EXP、${materialText}${potionDrop}。`,
    true,
  );
  battleFX("victory");
  S.lastVictory = {
    gold,
    xp,
    text: materialText + potionDrop,
    boss: e.worldBoss,
    name: e.n,
  };
  toast(`${e.worldBoss ? "傳說 Boss 討伐成功" : "討伐成功"} · +${xp} EXP`);
  S.enemy = null;
  S.shield = 0;
  await wait(350);
  while (S.xp >= S.xpNext) {
    S.xp -= S.xpNext;
    S.level++;
    S.xpNext = Math.round(100 * Math.pow(S.level, 1.3));
    S.baseHp += 11;
    S.baseAtk += 2;
    S.baseDef += S.level % 2;
    S.hp = stats().maxHp;
    S.res = baseClass().maxRes;
    toast(`升級！目前 Lv.${S.level}`);
    log(`升到 Lv.${S.level}，能力提升並完全恢復。`, true);
  }
  if (e.worldBoss && S.floor === MAX_FLOOR) {
    S.completed = true;
    showExplore();
    render();
    save(true);
    openEvent(
      "🏆",
      "深境完全制霸",
      `你擊敗了最終 Boss「${e.n}」，完成全部 ${MAX_FLOOR} 層！最終等級 Lv.${S.level}，共討伐 ${S.kills} 隻敵人。`,
      [
        {
          label: "站上終焉王座",
          hint: "存檔會保留，可繼續查看裝備與戰報",
          primary: true,
          run: () => {
            closeModal("eventModal");
            showExplore();
            render();
            save();
          },
        },
      ],
    );
    return;
  }
  showExplore();
  render();
  save(true);
}

function defeat() {
  S.enemy = null;
  S.gold = Math.floor(S.gold * 0.75);
  S.floor = Math.max(0, S.floor - 2);
  S.shield = 0;
  S.debuffs = {};
  S.debuffTurns = {};
  S.hp = stats().maxHp;
  S.res = baseClass().maxRes;
  showExplore();
  render();
  save(true);
  openEvent("☠️", "冒險失敗", "你被送回兩區前，損失25%金幣；素材與裝備保留。", [
    {
      label: "重新整備",
      run: () => {
        closeModal("eventModal");
        showExplore();
        render();
        save();
      },
    },
  ]);
}

async function tryFlee() {
  if (potionMode) return;
  return runCombatAction(performFlee);
}
async function performFlee() {
  if (!S.enemy || busy) return;
  busy = true;
  const rate = clamp(0.45 + (stats().speed - S.floor) * 0.015, 0.25, 0.8);
  if (chance(rate)) {
    log("成功逃離戰鬥。", true);
    S.enemy = null;
    S.floor = Math.max(0, S.floor - 1);
    showExplore();
    busy = false;
    render();
    save();
  } else {
    toast("逃跑失敗");
    await enemyTurn();
  }
}

function chooseRoute(type) {
  if (busy || S.enemy || S.pendingEvent) return;
  if (S.completed || S.floor >= MAX_FLOOR) {
    toast("你已完成 1000 層冒險，可以整理裝備與查看戰報。");
    return;
  }
  if (type === "rest") {
    rest();
    return;
  }
  if (type === "elite") {
    if (S.floor < S.nextEliteAt) {
      toast(`菁英挑戰還需前進 ${S.nextEliteAt - S.floor} 區`);
      return;
    }
    if ((S.floor + 1) % 50 !== 0 && S.floor + 1 >= S.nextEventAt) {
      toast("前方出現特殊事件，處理後仍可挑戰菁英");
      event();
      return;
    }
    createEnemy(true);
    return;
  }
  const next = S.floor + 1;
  if (next % 50 === 0) {
    createEnemy(false);
    return;
  }
  if (next >= S.nextEventAt) event();
  else createEnemy(false);
}

function rest() {
  if (S.floor - S.lastRest < 3) {
    toast(`再前進 ${3 - (S.floor - S.lastRest)} 區才能休息`);
    return;
  }
  S.lastRest = S.floor;
  S.hp = Math.min(stats().maxHp, S.hp + Math.round(stats().maxHp * 0.45));
  S.res = baseClass().maxRes;
  S.potions.red = (S.potions.red || 0) + 1;
  log("營地休息：恢復生命、職業資源並獲得生命藥水。", true);
  render();
  save();
}

function treasure() {
  const reward = S.pendingEvent?.reward || {
    gold: 25 + S.floor * 3,
    mat: pick(eventMaterialPool()),
    amount: 2 + Math.floor(S.floor / 250),
  };
  if (S.pendingEvent) S.pendingEvent.reward = reward;
  openEvent(
    "🎁",
    "遺失的補給箱",
    `找到 ${reward.gold} 金幣與 ${MATERIALS[reward.mat].n}×${reward.amount}。`,
    [
      {
        label: "收下補給",
        run: () => {
          S.gold += reward.gold;
          addMaterial(reward.mat, reward.amount);
          finishEvent(
            `補給箱帶來 ${reward.gold} 金幣與 ${MATERIALS[reward.mat].n}×${reward.amount}。`,
          );
        },
      },
    ],
  );
}

function scheduleNextEventFloor(fromFloor) {
  const gap = 5 + Math.floor(Math.random() * 6);
  let target = fromFloor + gap;
  if (target % 50 === 0) target += gap === 5 ? 1 : -1;
  return target;
}

function event() {
  S.floor++;
  S.nextEventAt = scheduleNextEventFloor(S.floor);
  const types = [
      "fountain",
      "gamble",
      "caravan",
      "altar",
      "forge",
      "meteor",
      "treasure",
    ].filter((type) => type !== S.lastEventType),
    type = pick(types);
  S.lastEventType = type;
  S.pendingEvent = {
    type,
    good: chance(0.5),
  };
  S.highestFloor = Math.max(S.highestFloor, S.floor);
  resumePendingEvent();
  render();
  save();
}

function resumePendingEvent() {
  if (S.pendingEvent?.type === "result") {
    showEventResult();
    return;
  }
  const handlers = {
    fountain: eventFountain,
    gamble: eventGambleChest,
    caravan: eventCaravan,
    altar: eventAltar,
    forge: eventForge,
    meteor: eventMeteor,
    treasure,
  };
  const handler = handlers[S.pendingEvent?.type];
  if (handler) handler();
  else S.pendingEvent = null;
}

function eventMaterialPool() {
  const chapter = Math.min(19, Math.floor(Math.max(0, S.floor - 1) / 50)),
    drops = MONSTERS.filter((monster) => monster.tier <= chapter).map(
      (monster) => monster.drop,
    );
  return [...new Set(drops)].filter(
    (id) => MATERIALS[id] && !["crown", "stone"].includes(id),
  );
}

function eventFountain() {
  const heal = Math.round(stats().maxHp * 0.35);
  openEvent("⛲", "古老泉水", "泉水散發柔和光芒，你可以恢復生命或汲取能量。", [
    {
      label: "恢復生命",
      hint: `恢復 ${heal} HP`,
      run: () => {
        S.hp = Math.min(stats().maxHp, S.hp + heal);
        finishEvent("傷口逐漸癒合。");
      },
    },
    {
      label: "汲取能量",
      hint: "職業資源全滿",
      run: () => {
        S.res = baseClass().maxRes;
        finishEvent("力量重新充滿全身。");
      },
    },
  ]);
}

function eventGambleChest() {
  const good = S.pendingEvent?.good ?? chance(0.5);
  openEvent(
    "🎰",
    "命運賭博箱",
    "箱蓋刻著「好運與災禍各占一半」。開啟時有 50% 獲得珍貴物資、50% 遭受陷阱。",
    [
      {
        label: "賭一把",
        hint: "50% 大獎／50% 陷阱",
        primary: true,
        run: () => {
          if (good) {
            const gold = 80 + S.floor * 4,
              mat = pick(eventMaterialPool()),
              amount = 4 + Math.floor(S.floor / 200);
            S.gold += gold;
            addMaterial(mat, amount);
            addMaterial("stone", 2);
            finishEvent(
              `幸運大獎！獲得 ${gold} 金幣、${MATERIALS[mat].n}×${amount}與強化石×2。`,
            );
          } else {
            const damage = Math.max(1, Math.round(stats().maxHp * 0.15)),
              lost = Math.min(S.gold, Math.round(S.gold * 0.12));
            const actualDamage = Math.min(S.hp - 1, damage);
            S.hp = Math.max(1, S.hp - damage);
            S.gold -= lost;
            finishEvent(
              `箱內噴出詛咒煙霧！受到 ${actualDamage} 傷害並遺失 ${lost} 金幣。`,
            );
          }
        },
      },
      {
        label: "保持理智並離開",
        hint: "不承擔任何風險",
        run: () => finishEvent("你沒有讓命運替自己做決定。"),
      },
    ],
  );
}

function eventCaravan() {
  const aidCost = 40 + Math.floor(S.floor * 0.35),
    mat = pick(eventMaterialPool());
  openEvent("🛒", "迷途商隊", "受困的商隊請求協助，也願意分享部分補給。", [
    {
      label: "護送商隊",
      hint: `支付 ${aidCost} 金幣，獲得素材與藥水`,
      run: () => {
        if (S.gold < aidCost) {
          toast("金幣不足，無法準備護送物資");
          return;
        }
        S.gold -= aidCost;
        addMaterial(mat, 5);
        S.potions.red = (S.potions.red || 0) + 1;
        S.potions.blue = (S.potions.blue || 0) + 1;
        finishEvent(
          `護送成功，獲得 ${MATERIALS[mat].n}×5、生命藥水與資源藥水。`,
        );
      },
    },
    {
      label: "交換情報",
      hint: "免費恢復 25% 生命與資源",
      run: () => {
        S.hp = Math.min(stats().maxHp, S.hp + Math.round(stats().maxHp * 0.25));
        S.res = Math.min(
          baseClass().maxRes,
          S.res + Math.round(baseClass().maxRes * 0.25),
        );
        finishEvent("商隊分享安全路線，你也完成了短暫休整。");
      },
    },
  ]);
}

function eventAltar() {
  const sacrifice = Math.max(1, Math.round(stats().maxHp * 0.18));
  openEvent(
    "🗿",
    "低語祭壇",
    "古老祭壇願意以力量交換生命，也可以替你淨化傷勢。",
    [
      {
        label: "獻上生命換取力量",
        hint: `失去 ${sacrifice} HP，永久攻擊＋1並獲得強化石`,
        run: () => {
          S.hp = Math.max(1, S.hp - sacrifice);
          S.baseAtk += 1;
          addMaterial("stone", 2);
          finishEvent("祭壇吞下鮮血，你感到武器變得更加銳利。");
        },
      },
      {
        label: "請求淨化",
        hint: "解除全部異常並恢復 20% 生命",
        run: () => {
          S.debuffs = {};
          S.hp = Math.min(
            stats().maxHp,
            S.hp + Math.round(stats().maxHp * 0.2),
          );
          finishEvent("陰冷低語消失，纏繞身體的異常狀態被清除。");
        },
      },
    ],
  );
}

function eventForge() {
  const cost = 55 + Math.floor(S.floor * 0.5),
    mat = pick(eventMaterialPool());
  openEvent(
    "🔥",
    "失落鍛造爐",
    "爐火仍在燃燒。投入金幣可以鍛出強化石，也能直接搜索附近殘料。",
    [
      {
        label: "重新點燃爐心",
        hint: `花費 ${cost} 金幣，獲得強化石×4`,
        run: () => {
          if (S.gold < cost) {
            toast("金幣不足，無法啟動鍛造爐");
            return;
          }
          S.gold -= cost;
          addMaterial("stone", 4);
          finishEvent("鍛造爐重新轟鳴，四顆完整的強化石落入手中。");
        },
      },
      {
        label: "搜索冷卻殘料",
        hint: `免費獲得隨機素材`,
        run: () => {
          addMaterial(mat, 3);
          finishEvent(`你從灰燼中找到 ${MATERIALS[mat].n}×3。`);
        },
      },
    ],
  );
}

function eventMeteor() {
  const mat =
    S.floor >= 800
      ? pick(["star", "celestial", "chaos", "void"])
      : S.floor >= 400
        ? pick(["crystal", "ember", "shadow", "spirit"])
        : pick(eventMaterialPool());
  openEvent(
    "☄️",
    "深境流星",
    `一顆流星墜落附近，核心散發著${MATERIALS[mat].n}的氣息。`,
    [
      {
        label: "徒手取出核心",
        hint: "受到 10% 最大生命傷害，獲得大量稀有素材",
        run: () => {
          const damage = Math.max(1, Math.round(stats().maxHp * 0.1));
          S.hp = Math.max(1, S.hp - damage);
          addMaterial(mat, 6);
          finishEvent(`你承受灼傷並取出 ${MATERIALS[mat].n}×6。`);
        },
      },
      {
        label: "等待核心冷卻",
        hint: "安全獲得少量素材並回滿資源",
        run: () => {
          addMaterial(mat, 2);
          S.res = baseClass().maxRes;
          finishEvent(`耐心帶來 ${MATERIALS[mat].n}×2，職業資源也完全恢復。`);
        },
      },
    ],
  );
}

// 選項執行前記下數值，結果卡顯示「實際」增減（含回復上限）。
let eventBefore = null;
function eventResources() {
  return {
    gold: S.gold,
    hp: S.hp,
    res: S.res,
    atk: S.baseAtk,
    materials: { ...S.materials },
    potions: { ...S.potions },
    debuffs: { ...S.debuffs },
  };
}
function eventChanges(before) {
  if (!before) return [];
  const changes = [];
  const add = (label, oldValue, newValue) => {
    const delta = newValue - oldValue;
    if (delta) changes.push({ label, delta });
  };
  for (const [key, label] of Object.entries({
    gold: "金幣",
    hp: "生命 HP",
    res: baseClass().resource,
    atk: "永久攻擊",
  }))
    add(label, before[key], eventResources()[key]);
  for (const [key, value] of Object.entries(S.materials))
    add(MATERIALS[key]?.n || key, before.materials[key] || 0, value);
  for (const [key, value] of Object.entries(S.potions))
    add(POTIONS[key]?.n || key, before.potions[key] || 0, value);
  for (const key of Object.keys(before.debuffs))
    if (before.debuffs[key] && !S.debuffs[key])
      changes.push({
        label: `${{ poison: "中毒", burn: "燃燒", bleed: "流血", weak: "虛弱" }[key] || key}已解除`,
        delta: null,
      });
  return changes;
}
function finishEvent(msg) {
  // 結果本身也存檔，重開只會再顯示結果，不會重新扣款或領獎。
  if (S.pendingEvent?.type === "result") return;
  S.pendingEvent = {
    type: "result",
    title: $("#eventTitle").textContent,
    icon: $("#eventIcon").textContent,
    message: msg,
    changes: eventChanges(eventBefore),
  };
  eventBefore = null;
  log(msg, true);
  showExplore();
  render();
  save();
  showEventResult();
}
function showEventResult() {
  const result = S.pendingEvent;
  if (result?.type !== "result") return;
  openEvent(result.icon, `${result.title} · 結果`, result.message, [
    { label: "看完了，繼續探索", primary: true, run: acknowledgeEventResult },
  ]);
  $("#eventKicker").textContent = "本次事件已結算";
  $("#eventResult").innerHTML = result.changes.length
    ? result.changes
        .map(
          ({ label, delta }) =>
            `<div class="event-change ${delta < 0 ? "loss" : "gain"}"><span>${escapeHtml(label)}</span><b>${delta === null ? "✓" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}</b></div>`,
        )
        .join("")
    : '<p class="muted">持有金幣、生命、資源與物品沒有變化。</p>';
  $("#eventResult").classList.remove("hidden");
  $("#eventDismiss").classList.remove("hidden");
}
function acknowledgeEventResult() {
  if (S.pendingEvent?.type !== "result") return;
  S.pendingEvent = null;
  closeModal("eventModal");
  render();
  save();
}

function addMaterial(id, n) {
  S.materials[id] = (S.materials[id] || 0) + n;
}

function buyGear(id) {
  if (S.enemy) {
    toast("戰鬥中無法製作裝備");
    return;
  }
  const g = GEAR[id];
  if (S.classId !== "god" && S.highestFloor < (g.unlockFloor || 0)) {
    toast(`此裝備需抵達第 ${g.unlockFloor} 層才能製作`);
    return;
  }
  if (g.classes && !g.classes.includes(S.classId)) {
    toast("目前職業無法使用這把武器");
    return;
  }
  if (!canPay(g.cost)) {
    toast("金幣或素材不足");
    return;
  }
  pay(g.cost);
  S.gear.push({
    uid: S.uid++,
    id,
    level: 0,
  });
  log(`製作完成：「${g.n}」。`, true);
  toast(`獲得裝備：${g.n}`);
  render();
  save();
}

function buyPotion(id) {
  const p = POTIONS[id];
  if (S.enemy) {
    toast("戰鬥中無法購買藥水");
    return;
  }
  if (!p || !canPay(p.cost)) {
    toast("金幣不足");
    return;
  }
  pay(p.cost);
  S.potions[id] = (S.potions[id] || 0) + 1;
  log(`在商店購買「${p.n}」。`);
  toast(`購買完成：${p.n}`);
  render();
  save();
}

function canPay(cost) {
  return Object.entries(cost).every(([k, v]) =>
    k === "gold" ? S.gold >= v : (S.materials[k] || 0) >= v,
  );
}

function pay(cost) {
  for (const [k, v] of Object.entries(cost))
    k === "gold" ? (S.gold -= v) : (S.materials[k] -= v);
}

function enhanceCost(level) {
  const next = level + 1;
  return {
    gold: 30 * next * next,
    stone: Math.max(1, Math.ceil(next / 2)),
  };
}

function enhanceRate(level) {
  return [100, 100, 95, 90, 82, 72, 62, 52, 42][level] || 0;
}

function enhance(uid) {
  if (S.enemy) {
    toast("戰鬥中無法強化");
    return;
  }
  const inst = gearByUid(uid);
  if (!inst || inst.level >= 9) return;
  const cost = enhanceCost(inst.level);
  if (!canPay(cost)) {
    toast("強化石或金幣不足");
    return;
  }
  pay(cost);
  if (chance(enhanceRate(inst.level) / 100)) {
    inst.level++;
    toast(`強化成功：＋${inst.level}`);
    log(`${GEAR[inst.id].n} 強化至＋${inst.level}。`, true);
  } else {
    toast("強化失敗，裝備沒有損壞");
    log(`${GEAR[inst.id].n} 強化失敗，等級維持。`);
  }
  render();
  save();
}

function equip(uid) {
  if (S.enemy) {
    toast("戰鬥中無法更換裝備");
    return;
  }
  const inst = gearByUid(uid),
    g = inst && GEAR[inst.id];
  if (!g) return;
  if (g.classes && !g.classes.includes(S.classId)) {
    toast("目前職業不能裝備");
    return;
  }
  S.equipped[g.slot] = S.equipped[g.slot] === uid ? null : uid;
  S.hp = Math.min(S.hp, stats().maxHp);
  closeModal("itemModal");
  log(
    `${S.equipped[g.slot] ? "裝備" : "卸下"}「${g.n}${
      inst.level
        ? `＋${inst.level}
  `
        : ""
    }」。`,
  );
  render();
  save();
}

function potionUseful(id) {
  const p = POTIONS[id];
  if (!p) return false;
  if (p.heal && S.hp < stats().maxHp) return true;
  if (p.resource && S.res < baseClass().maxRes) return true;
  if (p.cleanse === "all")
    return ["poison", "burn", "bleed", "weak"].some((x) => S.debuffs[x] > 0);
  if (p.cleanse) return S.debuffs[p.cleanse] > 0;
  return false;
}

function consumePotion(id) {
  const p = POTIONS[id],
    beforeHp = S.hp,
    beforeRes = S.res;
  S.potions[id]--;
  if (p.heal)
    S.hp = Math.min(stats().maxHp, S.hp + Math.round(stats().maxHp * p.heal));
  if (p.resource)
    S.res = Math.min(
      baseClass().maxRes,
      S.res + Math.round(baseClass().maxRes * p.resource),
    );
  if (p.cleanse === "all") {
    for (const type of ["poison", "burn", "bleed", "weak"]) {
      delete S.debuffs[type];
      delete S.debuffTurns[type];
    }
  } else if (p.cleanse) {
    delete S.debuffs[p.cleanse];
    delete S.debuffTurns[p.cleanse];
  }
  const hpGain = S.hp - beforeHp,
    resGain = S.res - beforeRes;
  if (hpGain) floatText(`HP +${hpGain}`, "heal", 30, 53);
  else if (resGain) floatText(`資源 +${resGain}`, "block", 30, 53);
  else floatText("異常解除", "heal", 30, 53);
  return {
    p,
    hpGain,
    resGain,
  };
}
async function usePotion(id) {
  if (S.enemy) {
    toast("戰鬥中請使用「使用藥水」按鈕");
    return;
  }
  if (busy || !(S.potions[id] > 0) || !potionUseful(id)) return;
  const { p } = consumePotion(id);
  closeModal("itemModal");
  log(`使用「${p.n}」。`);
  render();
  save();
}

function openBattlePotionMode() {
  if (busy || !S.enemy) return;
  potionMode = true;
  selectedBattlePotions = [];
  renderBattleControlMode();
  renderPotionMode();
  $("#potionModePanel")
    .querySelector("[data-select-potion]:not(:disabled)")
    ?.focus();
}

function closeBattlePotionMode() {
  potionMode = false;
  selectedBattlePotions = [];
  renderBattleControlMode();
  renderPotionMode();
  $("#openPotionMode").focus();
}

function toggleBattlePotion(id) {
  if (busy || !S.enemy || !potionMode || !POTIONS[id]) return;
  const index = selectedBattlePotions.indexOf(id);
  if (index >= 0) {
    selectedBattlePotions.splice(index, 1);
    renderPotionMode();
    return;
  }
  if ((S.potions[id] || 0) <= 0) {
    toast("目前沒有這種藥水");
    return;
  }
  if (!potionUseful(id)) {
    toast("目前沒有可由這瓶藥水回復或解除的效果");
    return;
  }
  if (selectedBattlePotions.length >= 3) {
    toast("每回合最多選擇 3 瓶藥水");
    return;
  }
  selectedBattlePotions.push(id);
  renderPotionMode();
}
async function confirmBattlePotions() {
  if (!potionMode) return;
  return runCombatAction(performBattlePotions);
}
async function performBattlePotions() {
  if (busy || !S.enemy || !potionMode) return;
  const ids = [...new Set(selectedBattlePotions)]
    .slice(0, 3)
    .filter((id) => (S.potions[id] || 0) > 0);
  if (!ids.length) {
    toast("請先選擇至少 1 瓶藥水");
    return;
  }
  busy = true;
  const used = ids.map((id) => consumePotion(id).p.n);
  potionMode = false;
  selectedBattlePotions = [];
  log(`本回合使用「${used.join("、")}」，共 ${used.length} 瓶藥水。`, true);
  render();
  await wait(280);
  await enemyTurn();
  busy = false;
  render();
  save();
}

function renderBattleControlMode() {
  const inBattle = !!S.enemy,
    selecting = inBattle && potionMode;
  $("#skillBar").classList.toggle("hidden", !inBattle || selecting);
  $("#tacticPanel").classList.toggle("hidden", !inBattle || selecting);
  $("#openPotionMode").classList.toggle("hidden", !inBattle || selecting);
  $("#potionModeBackdrop").classList.toggle("hidden", !selecting);
  $("#potionModePanel").classList.toggle("hidden", !selecting);
  if (inBattle) {
    $("#turnText").textContent = selecting
      ? "選擇 1～3 種藥水，確認後敵人會行動"
      : "觀察敵人意圖，選擇技能、戰術或使用藥水";
  }
}

function showExplore() {
  const arena = $("#arena"),
    next = S.floor + 1;
  arena.classList.remove(
    "elite-battle",
    "boss-battle",
    "world-boss-battle",
    "boss-awakened",
    "in-combat",
  );
  for (const property of [
    "--boss-glow",
    "--boss-mid",
    "--boss-top",
    "--boss-bottom",
  ])
    arena.style.removeProperty(property);
  updateArenaTheme();
  $("#weatherText").textContent = "探索狀態";
  $("#sceneCopy").classList.remove("hidden");
  if (S.completed) {
    $("#sceneCopy").innerHTML =
      `<p class="eyebrow">深境完全制霸</p><h2>🏆 你已完成全部 ${MAX_FLOOR} 層</h2><p>終焉王座已留下你的名字。現在可以整理裝備、查看素材與回顧戰報。</p>`;
  } else {
    const nextBossFloor = Math.ceil(next / 50) * 50,
      nextBoss = bossForFloor(nextBossFloor),
      eventRemain = Math.max(0, S.nextEventAt - next);
    $("#sceneCopy").innerHTML =
      `<p class="eyebrow">第 ${next} / ${MAX_FLOOR} 層</p><h2>${next % 50 === 0 ? `⚠ ${nextBoss.n} 正在前方等待` : "冒險道路延伸至迷霧深處"}</h2><p>${next % 50 === 0 ? "每 50 層只會出現一次大型 Boss，開戰前會觸發專屬對話。" : `距離下一隻大型 Boss 還有 ${nextBossFloor - next} 層；特殊事件${eventRemain ? `最快 ${eventRemain} 層後出現` : "將在下一層觸發"}。`}</p>`;
  }
  $("#enemyWrap").classList.remove("active");
  $("#enemyCard").classList.add("hidden");
  $("#enemyIntent").classList.add("hidden");
  potionMode = false;
  selectedBattlePotions = [];
  renderBattleControlMode();
  $("#exploreActions").classList.remove("hidden");
  $("#fleeBtn").classList.add("hidden");
  $("#turnKicker").textContent = "探索階段";
  $("#turnText").textContent = "選擇下一步";
}

function showBattle() {
  const arena = $("#arena"),
    e = S.enemy;
  updateArenaTheme();
  arena.classList.toggle("elite-battle", !!e.elite);
  arena.classList.toggle("boss-battle", !!e.boss && !e.worldBoss);
  arena.classList.toggle("world-boss-battle", !!e.worldBoss);
  arena.classList.toggle("boss-awakened", e.phase === 2);
  const theme = BOSS_DIALOGUES[e.n]?.theme,
    palette = theme && BOSS_ARENA_COLORS[theme];
  if (e.worldBoss && palette) {
    ["--boss-glow", "--boss-mid", "--boss-top", "--boss-bottom"].forEach(
      (property, index) => arena.style.setProperty(property, palette[index]),
    );
  }
  $("#weatherText").textContent = e.worldBoss
    ? "⚠ 災厄級威壓"
    : e.boss
      ? "⚔ 首領領域"
      : e.elite
        ? "✦ 菁英魔力場"
        : "戰鬥狀態";
  $("#sceneCopy").classList.add("hidden");
  $("#enemyWrap").classList.add("active");
  $("#enemyCard").classList.remove("hidden");
  $("#enemyIntent").classList.remove("hidden");
  potionMode = false;
  selectedBattlePotions = [];
  renderBattleControlMode();
  $("#exploreActions").classList.add("hidden");
  $("#fleeBtn").classList.remove("hidden");
  $("#turnKicker").textContent = e.worldBoss
    ? "傳說級 Boss 戰"
    : e.boss
      ? "Boss 戰"
      : e.elite
        ? "菁英戰鬥"
        : "戰鬥中";
  $("#turnText").textContent = "觀察敵人意圖，選擇技能、戰術或使用藥水";
}

function render() {
  const c = baseClass(),
    st = stats();
  S.hp = clamp(S.hp, 0, st.maxHp);
  S.res = clamp(S.res, 0, c.maxRes);
  $("#floorText").textContent = `${S.floor} / ${MAX_FLOOR}`;
  $("#goldText").textContent = S.gold;
  $("#killText").textContent = S.kills;
  $("#levelText").textContent = S.level;
  $("#classText").textContent = c.name;
  $("#playerPortrait").textContent = c.icon;
  setMeter("hp", S.hp, st.maxHp);
  $("#resourceName").textContent = c.resource;
  $("#resourceLabel").textContent = `${Math.ceil(S.res)} / ${c.maxRes}`;
  $("#resourceBar").style.width = `${(S.res / c.maxRes) * 100}%`;
  setMeter("xp", S.xp, S.xpNext);
  $("#xpAway").textContent = `距離升級還差 ${S.xpNext - S.xp} EXP`;
  $("#atkText").textContent = st.atk;
  $("#defText").textContent = st.def;
  $("#critText").textContent = `${st.crit}%`;
  $("#speedText").textContent = st.speed;
  const chapterIndex = Math.min(
    ZONES.length - 1,
    Math.floor(Math.max(0, S.floor - 1) / 50),
  );
  $("#zoneText").textContent =
    `第 ${chapterIndex + 1} 章 · ${ZONES[chapterIndex]}`;
  $("#arena").classList.toggle("low-hp", S.hp / st.maxHp < 0.28);
  const filled = Math.ceil((S.res / c.maxRes) * 5);
  $("#resourcePips").innerHTML = Array.from(
    {
      length: 5,
    },
    (_, i) => `<i class="${i < filled ? "full" : ""}"></i>`,
  ).join("");
  $("#comboBadge").classList.toggle("active", S.combo > 0);
  $("#comboBadge").textContent = S.combo
    ? `連擊 ×${S.combo} · +${S.combo * 4}%`
    : "連擊未啟動";
  $("#codexBtn").disabled = false;
  $("#fleeBtn").disabled = busy || potionMode;
  $("#openPotionMode").disabled = busy;
  renderEquipment();
  renderSkills();
  renderTactics();
  renderBattleControlMode();
  renderPotionMode();
  renderEnemy();
  renderBag();
  renderShop();
  renderUpgrade();
  renderEffects();
  renderRoutes();
}

function renderRoutes() {
  const rest = $("[data-route=rest]"),
    elite = $("[data-route=elite]"),
    explore = $("[data-route=explore]"),
    remain = Math.max(0, S.nextEliteAt - S.floor);
  explore.disabled = busy || !!S.pendingEvent || !!S.completed;
  rest.disabled =
    busy || !!S.pendingEvent || S.completed || S.floor - S.lastRest < 3;
  elite.disabled = busy || !!S.pendingEvent || !!S.completed || remain > 0;
  const small = elite.querySelector?.("small"),
    desc = elite.querySelector?.("p");
  if (S.completed) {
    explore.querySelector("small").textContent = "冒險已完成";
    explore.querySelector("b").textContent = "1000 層制霸";
    explore.querySelector("p").textContent = "終焉王座已留下你的名字";
  } else {
    explore.querySelector("small").textContent = "主要冒險";
    explore.querySelector("b").textContent = "繼續探索";
    explore.querySelector("p").textContent = "前進一區並觸發遭遇";
  }
  if (small)
    small.textContent = S.completed
      ? "冒險已完成"
      : remain
        ? `再前進 ${remain} 區開放`
        : "菁英小兵已出現";
  if (desc)
    desc.textContent = S.completed
      ? "完成後不再出現敵人"
      : remain
        ? "目前無法連續挑戰"
        : "可選擇挑戰，戰後再冷卻 3～5 區";
}

function setMeter(id, v, m) {
  $(`#${id}Label`).textContent = `${Math.ceil(v)} / ${m}`;
  $(`#${id}Bar`).style.width = `${clamp((v / m) * 100, 0, 100)}%`;
}

function renderSkills() {
  const c = baseClass();
  $("#classSkills").innerHTML = c.skills
    .map(
      (s, i) =>
        `<button class="skill-command" data-skill="${i}" ${!S.enemy || busy || S.res < s.c || S.cooldowns[i] > 0 ? "disabled" : ""}><em class="command-key">${i + 2}</em><span>${s.i}</span><div><small>${
          S.cooldowns[i]
            ? `冷卻 ${S.cooldowns[i]}
  回合`
            : `消耗 ${s.c}
  `
        }</small><b>${s.n}</b><p>${s.t}</p></div></button>`,
    )
    .join("");
  const basic = $("[data-skill=basic]");
  if (basic) basic.disabled = !S.enemy || busy;
}

function renderTactics() {
  $("#tacticBar").innerHTML = Object.entries(TACTICS)
    .map(([id, tactic]) => {
      const cost = tacticCost(tactic),
        cd = S.tacticCooldowns[id] || 0,
        unavailable = !S.enemy || busy || S.res < cost || cd > 0,
        status = cd ? `冷卻 ${cd} 回合` : cost ? `消耗 ${cost}` : "不消耗資源";
      return `<button class="tactic-command tactic-${id}" data-tactic="${id}" ${unavailable ? "disabled" : ""}><span class="tactic-key">${tactic.key}</span><span class="tactic-icon">${tactic.i}</span><div><small>${status}</small><b>${tactic.n}</b><p>${tactic.t}</p></div></button>`;
    })
    .join("");
}

function renderPotionMode() {
  const priority = [
    "red",
    "blue",
    "antidote",
    "cooling",
    "bandage",
    "restore",
    "holy",
    "full",
  ];
  $("#potionSelectionCount").textContent =
    `已選 ${selectedBattlePotions.length} / 3`;
  $("#potionSelectionGrid").innerHTML = priority
    .map((id) => {
      const p = POTIONS[id],
        count = S.potions[id] || 0,
        isSelected = selectedBattlePotions.includes(id),
        useful = potionUseful(id),
        disabled = busy || count <= 0 || (!useful && !isSelected),
        state = isSelected
          ? "✓ 本回合已選"
          : count <= 0
            ? "未持有"
            : useful
              ? "點擊加入"
              : "目前無可作用效果";
      return `<button class="potion-select-card ${isSelected ? "selected" : ""}" data-select-potion="${id}" ${disabled ? "disabled" : ""} aria-pressed="${isSelected}"><span class="potion-select-icon">${p.i}</span><div><span class="potion-select-title"><b>${p.n}</b><em>持有 ${count}</em></span><p>${p.d}</p><small>${state}</small></div></button>`;
    })
    .join("");
  $("#confirmPotions").disabled = busy || selectedBattlePotions.length === 0;
}

function renderEnemy() {
  const e = S.enemy;
  if (!e) return;
  $("#enemySprite").textContent = e.i;
  $("#enemyName").textContent = e.n;
  $("#enemyRank").textContent = e.worldBoss
    ? "⚠ 傳說級大型 Boss"
    : e.boss
      ? "深境首領"
      : e.elite
        ? "菁英魔物"
        : "普通魔物";
  $("#enemyLevel").textContent = `Lv.${S.floor}`;
  $("#enemyHpLabel").textContent = `${Math.max(0, e.hp)} / ${e.maxHp}${
    e.shield
      ? ` 🛡️${e.shield}
  `
      : ""
  }`;
  $("#enemyHpBar").style.width = `${clamp((e.hp / e.maxHp) * 100, 0, 100)}%`;
  $("#intentIcon").textContent = e.intent.icon;
  $("#intentText").textContent = intentText();
  $("#intentAdvice").textContent = intentAdvice();
  $("#enemyIntent").className = `enemy-intent intent-${e.intent.type}`;
  $("#enemyIntent").dataset.tooltip = intentTooltip();
  $("#enemyIntent").tabIndex = 0;
  const effects = [];
  if (e.effects.burn)
    effects.push({
      label: `🔥 ${e.effects.burn} · ${e.effectTurns.burn || STATUS_TURNS}回`,
      tip: "燃燒：敵人行動後扣除目前數值的生命，數值每回合減少 1，最多 3 回合。再次施加只刷新，不疊傷。",
    });
  if (e.effects.poison)
    effects.push({
      label: `☠️ ${e.effects.poison} · ${e.effectTurns.poison || STATUS_TURNS}回`,
      tip: "中毒：敵人行動前扣除目前數值的生命，數值每回合減少 1，最多 3 回合。再次施加只刷新，不疊傷。",
    });
  $("#enemyEffects").innerHTML = effects
    .map(
      (x) =>
        `<span class="status-tip" tabindex="0" data-tooltip="${x.tip}">${x.label}</span>`,
    )
    .join("");
  $("#enemyNote").innerHTML = enemyNoteText(e);
}

function renderEquipment() {
  for (const slot of ["weapon", "armor"]) {
    const inst = gearByUid(S.equipped[slot]),
      g = inst && GEAR[inst.id],
      element = $(`[data-equip-slot="${slot}"]`),
      slotLabel = slot === "weapon" ? "武器" : "盔甲";
    element.classList.remove(
      "rarity-common",
      "rarity-rare",
      "rarity-epic",
      "rarity-legendary",
      "rarity-prismatic",
    );
    if (g) element.classList.add(`rarity-${g.r}`);
    element.querySelector("small").textContent = g
      ? `${slotLabel} · ${RARITY[g.r]}`
      : slotLabel;
    $(`#${slot}Icon`).textContent =
      g?.i || (slot === "weapon" ? baseClass().icon : "🧥");
    $(`#${slot}Name`).textContent = g
      ? `${g.n}${
          inst.level
            ? `＋${inst.level}
    `
            : ""
        }`
      : slot === "weapon"
        ? "新手武器"
        : "旅人布衣";
  }
}

function renderEffects() {
  const a = [],
    st = stats();
  if (st.lifesteal)
    a.push({
      label: `🩸 吸血 ${st.lifesteal}%`,
      tip: `吸血：每次造成傷害時，恢復實際傷害 ${st.lifesteal}% 的生命。強化裝備可提高比例。`,
    });
  if (st.poisonResist)
    a.push({
      label: `🌿 抗毒 ${st.poisonResist}%`,
      tip: `抗毒：敵人施加中毒時，有 ${st.poisonResist}% 機率完全抵抗。強化裝備可提高機率。`,
    });
  if (st.damageReduce)
    a.push({
      label: `🛡️ 減傷 ${st.damageReduce}%`,
      tip: `傷害減免：敵人的直接攻擊在扣除防禦後，再降低 ${st.damageReduce}% 傷害。`,
    });
  if (S.shield)
    a.push({
      label: `🛡️ 護盾 ${S.shield}`,
      tip: "護盾：優先吸收敵人造成的傷害，直到護盾耗盡為止。",
    });
  if (S.buffs.power)
    a.push({
      label: `📣 強攻 ${S.buffs.power.hits}`,
      tip: `強攻：接下來 ${S.buffs.power.hits} 次攻擊提高 ${Math.round((S.buffs.power.mult - 1) * 100)}% 傷害。`,
    });
  if (S.combo)
    a.push({
      label: `⚔️ 連擊 ×${S.combo}`,
      tip: `連擊：目前所有攻擊提高 ${S.combo * 4}% 傷害；受到實際傷害後歸零，最高累積 5 層。`,
    });
  if (S.debuffs.poison)
    a.push({
      label: `☠️ 中毒 ${S.debuffs.poison} · ${S.debuffTurns.poison || STATUS_TURNS}回`,
      tip: "中毒：每回合扣除目前數值的生命，數值減少 1，最多 3 回合。重複命中刷新不疊傷；可用解毒藥水解除。",
    });
  if (S.debuffs.burn)
    a.push({
      label: `🔥 燃燒 ${S.debuffs.burn} · ${S.debuffTurns.burn || STATUS_TURNS}回`,
      tip: "燃燒：每回合扣除目前數值的生命，數值減少 1，最多 3 回合。重複命中刷新不疊傷；可用滅火藥水解除。",
    });
  if (S.debuffs.bleed)
    a.push({
      label: `🩸 流血 ${S.debuffs.bleed} · ${S.debuffTurns.bleed || STATUS_TURNS}回`,
      tip: "流血：每回合扣除目前數值的生命，數值減少 1，最多 3 回合。重複命中刷新不疊傷；可用止血藥劑解除。",
    });
  if (S.debuffs.weak)
    a.push({
      label: `🔨 虛弱 ${S.debuffs.weak}`,
      tip: "虛弱：你的攻擊傷害降低 20%，剩餘回合數每回合減少 1。可用活力藥劑解除。",
    });
  $("#playerEffects").innerHTML = a
    .map(
      (x) =>
        `<span class="effect-chip status-tip" tabindex="0" data-tooltip="${x.tip}">${x.label}</span>`,
    )
    .join("");
}

function bagEntries() {
  const f = $(".filter.active")?.dataset.filter || "all",
    arr = [];
  for (const [id, n] of Object.entries(S.potions))
    if (n && ["all", "potion"].includes(f))
      arr.push({
        kind: "potion",
        id,
        n,
        name: POTIONS[id].n,
        icon: POTIONS[id].i,
        sub: "藥品",
      });
  for (const [id, n] of Object.entries(S.materials))
    if (n && ["all", "material"].includes(f))
      arr.push({
        kind: "material",
        id,
        n,
        name: MATERIALS[id].n,
        icon: MATERIALS[id].i,
        sub: "素材",
      });
  for (const g of S.gear) {
    const x = GEAR[g.id];
    if (!x || (f !== "all" && f !== x.slot)) continue;
    arr.push({
      kind: "gear",
      id: g.uid,
      n: 1,
      rarity: x.r,
      name: `${x.n}${
        g.level
          ? `＋${g.level}
      `
          : ""
      }`,
      icon: x.i,
      sub: `${x.slot === "weapon" ? "武器" : "盔甲"} · ${RARITY[x.r]}`,
    });
  }
  return arr;
}

function renderBag() {
  const a = bagEntries();
  const total =
    Object.values(S.potions).reduce((a, b) => a + b, 0) +
    Object.values(S.materials).reduce((a, b) => a + b, 0) +
    S.gear.length;
  $("#bagCount").textContent = total > 999 ? "999+" : total;
  $("#bagCount").title = `實際持有總數：${total}`;
  $("#inventoryList").innerHTML = a.length
    ? a
        .map(
          (x) =>
            `<button class="item-row ${x.rarity ? `rarity-${x.rarity}` : ""}" data-kind="${x.kind}" data-id="${x.id}"><span class="item-icon">${x.icon}</span><span class="item-copy"><b>${x.name}</b><small>${x.sub}</small></span><span class="item-count">×${x.n}</span></button>`,
        )
        .join("")
    : `<div class="inventory-empty">目前沒有這類物品</div>`;
}

function costText(cost) {
  return Object.entries(cost)
    .map(([k, v]) => {
      const owned = k === "gold" ? S.gold : S.materials[k] || 0,
        label = k === "gold" ? `🪙${v}` : `${MATERIALS[k].i}${v}`;
      return k === "gold"
        ? `<span class="${owned < v ? "cost-missing" : ""}">${label}</span>`
        : `<span class="cost-material ${owned < v ? "cost-missing" : ""}" tabindex="0" data-tooltip="${escapeHtml(`${MATERIALS[k].n}：持有 ${owned}／需要 ${v}。${materialSourceText(k)}`)}">${label}</span>`;
    })
    .join(" ");
}

function gearEffect(g, level = 0) {
  const parts = [];
  for (const key of [
    "atk",
    "hp",
    "def",
    "crit",
    "speed",
    "lifesteal",
    "poisonResist",
    "damageReduce",
  ]) {
    const value = enhancedGearValue(g, key, level);
    if (!value) continue;
    parts.push(
      `${GEAR_VALUE_LABELS[key]}＋${value}${GEAR_PERCENT_VALUES.has(key) ? "%" : ""}`,
    );
  }
  return parts.join("、");
}

function battleLockedHtml(feature) {
  return `<div class="battle-locked"><span>⚔️</span><b>戰鬥中無法使用${feature}</b><p>請先擊敗或逃離目前的怪物；回到探索休息區後，此功能會自動恢復。</p></div>`;
}

function renderShop() {
  $("#shopFilters").classList.toggle("hidden", !!S.enemy);
  if (S.enemy) {
    $("#shopList").innerHTML = battleLockedHtml("商店");
    return;
  }
  const filter = $("[data-shop-filter].active")?.dataset.shopFilter || "all";
  const potions = Object.entries(POTIONS)
    .map(
      ([id, p]) =>
        `<div class="shop-row potion-shop"><span>${p.i}</span><div class="shop-copy"><b>${p.n}${p.drop ? ' <em class="drop-tag">怪物可掉落</em>' : ' <em class="shop-tag">商店限定</em>'}</b><span class="effect-line">${p.d}</span><small><span class="cost-line">價格：${costText(p.cost)}</span> · 持有 ${S.potions[id] || 0}</small></div><button data-buy-potion="${id}" ${!canPay(p.cost) || S.enemy ? "disabled" : ""}>購買</button></div>`,
    )
    .join("");
  const gearRows = (slot) =>
    Object.entries(GEAR)
      .filter(([, g]) => g.slot === slot && g.classes.includes(S.classId))
      .map(([id, g]) => {
        const locked =
          S.classId !== "god" && S.highestFloor < (g.unlockFloor || 0);
        return `<div class="shop-row rarity-${g.r} ${locked ? "gear-locked" : ""}"><span>${g.i}</span><div class="shop-copy"><b>${g.n} <em class="rarity-tag ${g.r}">${RARITY[g.r]}</em></b><span class="effect-line">${gearEffect(g)}</span><small>${g.d}<br>${locked ? `<span class="unlock-line">🔒 第 ${g.unlockFloor} 層解鎖</span><br>` : ""}<span class="cost-line">需要：${costText(g.cost)}</span></small></div><button data-buy="${id}" ${locked || !canPay(g.cost) || S.enemy ? "disabled" : ""}>${locked ? "未解鎖" : "製作"}</button></div>`;
      })
      .join("");
  const potionSection = `<div class="shop-section-title"><b>🧪 藥水補給</b><small>異常解除藥只能在這裡購買</small></div>${potions}`;
  const weaponSection = `<div class="shop-section-title"><b>⚔️ 武器製作</b><small>普通至彩耀五階；高階武器附帶吸血</small></div>${gearRows("weapon")}`;
  const armorSection = `<div class="shop-section-title"><b>🛡️ 盔甲製作</b><small>普通至彩耀五階；高階盔甲附帶抗毒與減傷</small></div>${gearRows("armor")}`;
  const sections = {
    potion: potionSection,
    weapon: weaponSection,
    armor: armorSection,
  };
  $("#shopList").innerHTML =
    filter === "all"
      ? potionSection + weaponSection + armorSection
      : sections[filter] || potionSection;
}

function renderUpgrade() {
  if (S.enemy) {
    $("#upgradeList").innerHTML = battleLockedHtml("裝備強化");
    return;
  }
  const list = S.gear.filter((x) => GEAR[x.id]);
  $("#upgradeList").innerHTML = list.length
    ? list
        .map((x) => {
          const g = GEAR[x.id],
            next = x.level + 1,
            cost = enhanceCost(x.level),
            rate = enhanceRate(x.level);
          return `<div class="upgrade-row rarity-${g.r}"><span>${g.i}</span><div class="shop-copy"><b>${g.n} <em class="rarity-tag ${g.r}">${RARITY[g.r]}</em> <span class="enhance-level">＋${x.level}</span></b>${
            x.level >= 9
              ? `<span class="effect-line">最終效果：${gearEffect(g, 9)}
    </span><small>已達最高強化等級</small>`
              : `<span class="upgrade-preview"><em>${gearEffect(g, x.level)}
    </em><strong>→</strong><em>${gearEffect(g, next)}
    </em></span><small><span class="rate-line">成功率 ${rate}
    %</span> · 需要：${costText(cost)}
    <br>失敗不降級、不損壞</small>`
          }</div><button data-enhance="${x.uid}" ${x.level >= 9 || !canPay(cost) || S.enemy ? "disabled" : ""}>${x.level >= 9 ? "已滿級" : "強化"}</button></div>`;
        })
        .join("")
    : `<div class="inventory-empty">先在商店製作一件裝備</div>`;
}

function openItem(kind, id) {
  selected = {
    kind,
    id,
  };
  let name,
    icon,
    desc,
    statsHtml = "",
    primary = null;
  if (kind === "potion") {
    const p = POTIONS[id];
    name = p.n;
    icon = p.i;
    desc =
      p.d + (S.enemy ? " 戰鬥中請從戰鬥畫面的「使用藥水」按鈕開啟選單。" : "");
    primary = {
      label: S.enemy ? "請從戰鬥介面使用" : "使用",
      run: () => usePotion(id),
      disabled: !!S.enemy || !potionUseful(id),
    };
  } else if (kind === "material") {
    const m = MATERIALS[id];
    name = m.n;
    icon = m.i;
    desc = materialSourceText(id);
    statsHtml = `<div>持有<br><b>${S.materials[id] || 0}</b></div>`;
    primary = {
      label: "查看來源圖鑑",
      run: () => {
        closeModal("itemModal");
        openCodex(id);
      },
    };
  } else {
    const inst = gearByUid(+id),
      g = inst && GEAR[inst.id];
    if (!g) return;
    name = `${g.n}${
      inst.level
        ? `＋${inst.level}
    `
        : ""
    }`;
    icon = g.i;
    desc = g.d;
    statsHtml = [
      "atk",
      "hp",
      "def",
      "crit",
      "speed",
      "lifesteal",
      "poisonResist",
      "damageReduce",
    ]
      .map((key) => {
        const value = enhancedGearValue(g, key, inst.level);
        if (!value) return "";
        return `<div>${GEAR_VALUE_LABELS[key]}<br><b>＋${value}${GEAR_PERCENT_VALUES.has(key) ? "%" : ""}</b></div>`;
      })
      .join("");
    primary = {
      label: S.equipped[g.slot] === inst.uid ? "卸下" : "裝備",
      run: () => equip(inst.uid),
    };
  }
  $("#itemIcon").textContent = icon;
  $("#itemTitle").textContent = name;
  $("#itemRarity").textContent =
    kind === "gear"
      ? RARITY[GEAR[gearByUid(+id).id].r]
      : kind === "material"
        ? "素材"
        : "消耗品";
  $("#itemDescription").textContent = desc;
  $("#itemStats").innerHTML = statsHtml;
  const box = $("#itemActions");
  box.innerHTML = "";
  box.append(button("關閉", () => closeModal("itemModal")));
  if (primary) {
    const b = button(primary.label, primary.run, "primary");
    b.disabled = primary.disabled || false;
    box.append(b);
  }
  openModal("itemModal");
}

function log(msg, important = false) {
  S.logs.unshift({
    msg,
    important,
    t: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  S.logs = S.logs.slice(0, 60);
  renderLog();
}

function renderLog() {
  const page = $("#logPage");
  page.innerHTML = S.logs
    .map(
      (x) =>
        `<div class="log-row ${x.important ? "important" : ""}"><small>${escapeHtml(x.t)}</small>　${escapeHtml(x.msg)}</div>`,
    )
    .join("");
  page.scrollTop = 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

// 圖鑑只讀取遭遇紀錄，沒有戰鬥、獎勵或指定刷怪入口。
function normalizeDiscoveredMonsters(value) {
  const validNames = new Set(MONSTERS.map((monster) => monster.n));
  return [...new Set(Array.isArray(value) ? value : [])].filter((name) =>
    validNames.has(name),
  );
}

function discoverMonster(monster) {
  if (!monster || !MONSTERS.some((entry) => entry.n === monster.n)) return;
  if (!Array.isArray(S.discoveredMonsters)) S.discoveredMonsters = [];
  if (!S.discoveredMonsters.includes(monster.n))
    S.discoveredMonsters.push(monster.n);
}

function isMonsterDiscovered(monster) {
  return S.discoveredMonsters.includes(monster.n);
}

function materialSourceText(id) {
  if (id === "crown") return "王冠碎片：每 50 層大型 Boss 固定掉落。";
  if (id === "stone")
    return "強化石：菁英／Boss 固定掉落、小兵有 16% 機率掉落；鍛造爐與賭博箱也可取得。";
  const sources = MONSTERS.filter(
    (monster) => monster.drop === id && isMonsterDiscovered(monster),
  );
  const names = sources.map((monster) => monster.n).join("、");
  return `${MATERIALS[id].n}：${names || "尚未發現來源魔物，探索遭遇後會更新圖鑑"}。點擊可查看來源圖鑑。`;
}

function openCodex(material = "all") {
  $("#codexMaterial").innerHTML =
    `<option value="all">全部魔物 · ${MONSTERS.length} 種</option>` +
    Object.entries(MATERIALS)
      .map(
        ([id, material]) =>
          `<option value="${id}">${material.i} ${material.n} · 持有 ${S.materials[id] || 0}</option>`,
      )
      .join("");
  $("#codexMaterial").value = MATERIALS[material] ? material : "all";
  renderCodex();
  openModal("codexModal");
}

function renderCodex() {
  const filter = $("#codexMaterial").value || "all";
  const list = MONSTERS.filter(
    (monster) => filter === "all" || monster.drop === filter,
  ).sort(
    (a, b) => Number(isMonsterDiscovered(b)) - Number(isMonsterDiscovered(a)),
  );
  $("#codexProgress").textContent =
    `已發現 ${S.discoveredMonsters.length} / ${MONSTERS.length} 種魔物`;
  $("#codexList").innerHTML = list.length
    ? list
        .map((monster) => {
          if (!isMonsterDiscovered(monster)) {
            return `<article class="codex-entry locked"><span aria-hidden="true">?</span><div><b>未發現的魔物</b><small>尚未遭遇，探索發現後解鎖</small></div></article>`;
          }
          const material = MATERIALS[monster.drop];
          return `<article class="codex-entry"><span aria-hidden="true">${monster.i}</span><div><b>${monster.n}</b><small>掉落素材：${material.i} ${material.n}</small><p>${monster.trait}</p></div></article>`;
        })
        .join("")
    : `<div class="source-empty"><span>${MATERIALS[filter]?.i || "📖"}</span><b>${MATERIALS[filter]?.n || "素材"}</b><p>${materialSourceText(filter)}</p></div>`;
}

function motionEnabled() {
  return (
    preferences.effects &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function applyPreferences() {
  document.body.classList.toggle("effects-off", !motionEnabled());
  $("#effectsToggle").checked = preferences.effects;
  $("#soundToggle").checked = preferences.sound;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch {}
}

function playTone(type) {
  if (!preferences.sound) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext = audioContext || new AudioCtor();
    if (audioContext.state === "suspended")
      audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      now = audioContext.currentTime,
      pitch =
        {
          slash: 330,
          magic: 520,
          guard: 220,
          critical: 740,
          hurt: 110,
          victory: 660,
          signature: 150,
          arrival: 190,
          awakening: 170,
        }[type] || 330;
    oscillator.type = type === "hurt" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      pitch * (type === "victory" ? 1.5 : 0.7),
      now + 0.17,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch (error) {
    console.warn("音效不可用，遊戲不受影響", error);
  }
}

function battleFX(type) {
  playTone(type);
  if (!motionEnabled()) return;
  const layer = $("#floatLayer"),
    effect = document.createElement("div");
  effect.className = `battle-fx fx-${type}${S.floor >= 500 ? " late-boss-fx" : ""}`;
  for (let index = 0; index < 8; index++) {
    const spark = document.createElement("i");
    spark.style.setProperty("--angle", `${index * 45}deg`);
    spark.style.setProperty("--distance", `${55 + (index % 3) * 28}px`);
    effect.append(spark);
  }
  layer.append(effect);
  // Limit transient DOM even during very fast God-mode play.
  const effects = [...layer.children].filter((node) =>
    node.classList.contains("battle-fx"),
  );
  while (effects.length > 3) effects.shift().remove();
  setTimeout(() => effect.remove(), 1300);
}

function announce(title, subtitle) {
  toast(`${subtitle} · ${title}`);
}

function floatText(t, c, x, y) {
  const n = document.createElement("span");
  n.className = `float-text ${c}`;
  n.textContent = t;
  n.style.left = x + "%";
  n.style.top = y + "%";
  $("#floatLayer").append(n);
  setTimeout(() => n.remove(), 1050);
}

function animateEnemy(c) {
  const e = $("#enemyWrap");
  e.classList.remove(c);
  void e.offsetWidth;
  e.classList.add(c);
  setTimeout(() => e.classList.remove(c), 380);
}

function toast(t, type = "") {
  const n = document.createElement("div");
  n.className = `toast${type ? ` ${type}` : ""}`;
  n.textContent = t;
  const stack = $("#toastStack");
  if (!stack) {
    console.warn(t);
    return;
  }
  stack.append(n);
  setTimeout(() => n.remove(), 2600);
}
let currentTooltipTarget = null;
const modalReturnFocus = new Map();

function usesTouchTooltip() {
  return window.matchMedia(
    "(hover: none), (pointer: coarse), (max-width: 740px)",
  ).matches;
}

function positionGlobalTooltip(target, tooltip, mobile) {
  const viewport = window.visualViewport,
    viewLeft = viewport?.offsetLeft || 0,
    viewTop = viewport?.offsetTop || 0,
    viewWidth = viewport?.width || window.innerWidth,
    viewHeight = viewport?.height || window.innerHeight,
    margin = 10,
    gap = mobile ? 9 : 10,
    preferredWidth = mobile
      ? Math.min(238, viewWidth - margin * 2)
      : Math.min(300, viewWidth - margin * 2),
    rect = target.getBoundingClientRect();
  tooltip.style.left = "0px";
  tooltip.style.right = "auto";
  tooltip.style.top = "0px";
  tooltip.style.bottom = "auto";
  tooltip.style.width = `${preferredWidth}px`;
  tooltip.style.maxHeight = `${Math.max(120, Math.min(260, viewHeight - margin * 2))}px`;
  const width = tooltip.offsetWidth || preferredWidth,
    height = tooltip.offsetHeight || 80,
    minX = viewLeft + margin,
    maxX = viewLeft + viewWidth - width - margin,
    minY = viewTop + margin,
    maxY = viewTop + viewHeight - height - margin,
    centerX = rect.left + rect.width / 2 - width / 2,
    centerY = rect.top + rect.height / 2 - height / 2,
    candidates = mobile
      ? [
          {
            placement: "right",
            x: rect.right + gap,
            y: centerY,
          },
          {
            placement: "left",
            x: rect.left - width - gap,
            y: centerY,
          },
          {
            placement: "top",
            x: centerX,
            y: rect.top - height - gap,
          },
          {
            placement: "bottom",
            x: centerX,
            y: rect.bottom + gap,
          },
        ]
      : [
          {
            placement: "top",
            x: centerX,
            y: rect.top - height - gap,
          },
          {
            placement: "bottom",
            x: centerX,
            y: rect.bottom + gap,
          },
          {
            placement: "right",
            x: rect.right + gap,
            y: centerY,
          },
          {
            placement: "left",
            x: rect.left - width - gap,
            y: centerY,
          },
        ];
  let chosen = candidates.find(
    (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
  );
  if (!chosen) {
    const sideSpace = {
        right: viewLeft + viewWidth - rect.right,
        left: rect.left - viewLeft,
        bottom: viewTop + viewHeight - rect.bottom,
        top: rect.top - viewTop,
      },
      placement = Object.entries(sideSpace).sort((a, b) => b[1] - a[1])[0][0];
    chosen = candidates.find((p) => p.placement === placement) || candidates[0];
  }
  tooltip.dataset.placement = chosen.placement;
  tooltip.style.left = `${clamp(chosen.x, minX, Math.max(minX, maxX))}px`;
  tooltip.style.top = `${clamp(chosen.y, minY, Math.max(minY, maxY))}px`;
}

function showGlobalTooltip(target) {
  const text = target?.dataset?.tooltip;
  if (!text) return;
  const tooltip = $("#globalTooltip"),
    mobile = usesTouchTooltip();
  currentTooltipTarget = target;
  tooltip.textContent = text;
  tooltip.classList.add("open");
  tooltip.classList.toggle("mobile", mobile);
  target.setAttribute("aria-describedby", "globalTooltip");
  positionGlobalTooltip(target, tooltip, mobile);
}

function hideGlobalTooltip() {
  currentTooltipTarget?.removeAttribute("aria-describedby");
  currentTooltipTarget = null;
  const tooltip = $("#globalTooltip");
  tooltip.classList.remove("open");
  delete tooltip.dataset.placement;
}
let runtimeErrorShown = false;

function reportRuntimeError(message, error) {
  console.error(`[深境冒險 v${APP_VERSION}] ${message}`, error || "");
  try {
    localStorage.setItem(
      "abyss-adventure-last-error",
      JSON.stringify({
        version: APP_VERSION,
        message: String(error?.message || message),
        time: new Date().toISOString(),
      }),
    );
  } catch {}
  if (!runtimeErrorShown) {
    runtimeErrorShown = true;
    toast(message, "error");
  }
}

function button(t, run, c = "") {
  const b = document.createElement("button");
  b.textContent = t;
  b.className = c;
  b.onclick = run;
  return b;
}

function openModal(id) {
  const modal = $("#" + id);
  modalReturnFocus.set(id, document.activeElement);
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.classList.add("open");
  document.body.classList.add("modal-active");
  requestAnimationFrame(() =>
    modal.querySelector("button:not(:disabled), input, select")?.focus(),
  );
}

function closeModal(id) {
  $("#" + id).classList.remove("open");
  document.body.classList.toggle("modal-active", !!$(".modal.open"));
  modalReturnFocus.get(id)?.focus?.();
  modalReturnFocus.delete(id);
}

function openEvent(i, t, d, opts) {
  $("#eventKicker").textContent = "特殊事件";
  $("#eventResult").innerHTML = "";
  $("#eventResult").classList.add("hidden");
  $("#eventDismiss").classList.add("hidden");
  $("#eventIcon").textContent = i;
  $("#eventTitle").textContent = t;
  $("#eventDescription").textContent = d;
  const b = $("#eventOptions");
  b.innerHTML = "";
  for (const o of opts) {
    const x = button(
      o.label,
      () => {
        if (x.disabled) return;
        x.disabled = true;
        eventBefore = eventResources();
        o.run();
        if (
          [...b.children].includes(x) &&
          $("#eventModal").classList.contains("open")
        )
          x.disabled = false;
      },
      o.primary ? "primary" : "",
    );
    if (o.hint) x.innerHTML = `${o.label}<small>${o.hint}</small>`;
    b.append(x);
  }
  openModal("eventModal");
}
document.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close]");
  if (close) {
    closeModal(close.dataset.close);
    return;
  }
  const tooltipTarget = e.target.closest("[data-tooltip]");
  if (tooltipTarget && usesTouchTooltip()) {
    if (currentTooltipTarget === tooltipTarget) hideGlobalTooltip();
    else showGlobalTooltip(tooltipTarget);
  } else if (!e.target.closest("#globalTooltip")) hideGlobalTooltip();
  const bossChoice = e.target.closest("[data-boss-choice]");
  if (bossChoice) chooseBossDialogue(+bossChoice.dataset.bossChoice);
  const source = e.target.closest("[data-find-material]");
  if (source) openCodex(source.dataset.findMaterial);
  const sk = e.target.closest("[data-skill]");
  if (sk) useSkill(sk.dataset.skill);
  const tactic = e.target.closest("[data-tactic]");
  if (tactic) useTactic(tactic.dataset.tactic);
  const battlePotion = e.target.closest("[data-select-potion]");
  if (battlePotion) toggleBattlePotion(battlePotion.dataset.selectPotion);
  const r = e.target.closest("[data-route]");
  if (r) chooseRoute(r.dataset.route);
  const it = e.target.closest("[data-kind]");
  if (it) openItem(it.dataset.kind, it.dataset.id);
  const buy = e.target.closest("[data-buy]");
  if (buy) buyGear(buy.dataset.buy);
  const potion = e.target.closest("[data-buy-potion]");
  if (potion) buyPotion(potion.dataset.buyPotion);
  const up = e.target.closest("[data-enhance]");
  if (up) enhance(+up.dataset.enhance);
  const sl = e.target.closest("[data-equip-slot]");
  if (sl && S.equipped[sl.dataset.equipSlot])
    openItem("gear", S.equipped[sl.dataset.equipSlot]);
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    $$("[data-tab]").forEach((x) => x.classList.toggle("active", x === tab));
    $$(".tab-page").forEach((x) => x.classList.remove("active"));
    $("#" + tab.dataset.tab + "Page").classList.add("active");
  }
  const f = e.target.closest("[data-filter]");
  if (f) {
    $$("[data-filter]").forEach((x) => x.classList.toggle("active", x === f));
    renderBag();
  }
  const sf = e.target.closest("[data-shop-filter]");
  if (sf) {
    $$("[data-shop-filter]").forEach((x) =>
      x.classList.toggle("active", x === sf),
    );
    renderShop();
  }
});
document.addEventListener("pointerover", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (target && !usesTouchTooltip()) showGlobalTooltip(target);
});
document.addEventListener("pointerout", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (target && !target.contains(e.relatedTarget) && !usesTouchTooltip())
    hideGlobalTooltip();
});
document.addEventListener("focusin", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (target && !usesTouchTooltip()) showGlobalTooltip(target);
});
document.addEventListener("focusout", (e) => {
  if (e.target.closest("[data-tooltip]") && !usesTouchTooltip())
    hideGlobalTooltip();
});

function refreshTooltipPosition() {
  if (currentTooltipTarget?.isConnected === false) hideGlobalTooltip();
  else if (currentTooltipTarget) showGlobalTooltip(currentTooltipTarget);
}
let tooltipPositionFrame = 0;
function scheduleTooltipPosition() {
  if (!currentTooltipTarget || tooltipPositionFrame) return;
  tooltipPositionFrame = requestAnimationFrame(() => {
    tooltipPositionFrame = 0;
    refreshTooltipPosition();
  });
}

// 遊戲館的雙指縮放發生在外層視窗；直接開遊戲也使用相同保護。
let zoomViewport = window.visualViewport;
try {
  zoomViewport = window.parent?.visualViewport || zoomViewport;
} catch (_) {
  // 外部網站嵌入時，改用遊戲自己的 viewport。
}
function syncZoomEffects() {
  const zoomed = (zoomViewport?.scale || 1) > 1.01;
  if (document.body.classList.contains("viewport-zoomed") === zoomed) return;
  document.body.classList.toggle("viewport-zoomed", zoomed);
  if (zoomed) hideGlobalTooltip();
}
syncZoomEffects();
zoomViewport?.addEventListener("resize", syncZoomEffects, { passive: true });
window.addEventListener("resize", scheduleTooltipPosition, {
  passive: true,
});
window.addEventListener("scroll", scheduleTooltipPosition, {
  passive: true,
  capture: true,
});
window.addEventListener("orientationchange", scheduleTooltipPosition, {
  passive: true,
});
window.visualViewport?.addEventListener("resize", scheduleTooltipPosition, {
  passive: true,
});
window.visualViewport?.addEventListener("scroll", scheduleTooltipPosition, {
  passive: true,
});
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});
window.addEventListener("error", (e) => {
  reportRuntimeError(
    "遊戲發生錯誤，已保留目前存檔；重新整理後仍可繼續。",
    e.error || e.message,
  );
});
window.addEventListener("unhandledrejection", (e) => {
  reportRuntimeError("遊戲操作未完成，請再試一次。", e.reason);
});

function validateGameBuild() {
  const requiredIds = [
      "arena",
      "skillBar",
      "tacticPanel",
      "openPotionMode",
      "potionModePanel",
      "inventoryList",
      "shopList",
      "upgradeList",
      "globalTooltip",
      "toastStack",
      "bossDialogueModal",
      "bossDialogueOptions",
      "bossDialogueContinue",
      "codexModal",
      "codexList",
      "settingsModal",
    ],
    missing = requiredIds.filter((id) => !$("#" + id)),
    playableClasses = Object.keys(CLASS_GEAR_BLUEPRINTS),
    invalidGear = playableClasses.filter(
      (classId) =>
        Object.values(GEAR).filter((g) => g.classes[0] === classId).length !==
        10,
    ),
    invalidBosses = WORLD_BOSSES.filter(
      (boss, index) =>
        boss.floor !== (index + 1) * 50 ||
        !BOSS_DIALOGUES[boss.n] ||
        BOSS_DIALOGUES[boss.n].options.length !== 3,
    ),
    invalidMonsters = MONSTERS.filter((monster) => !MATERIALS[monster.drop]);
  if (missing.length) throw new Error(`缺少介面元件：${missing.join(", ")}`);
  if (Object.keys(GEAR).length !== 60 || invalidGear.length)
    throw new Error("裝備資料不完整");
  if (WORLD_BOSSES.length !== 20 || invalidBosses.length)
    throw new Error("1000 層 Boss 或對話資料不完整");
  if (MONSTERS.length < 60 || invalidMonsters.length)
    throw new Error("魔物或素材資料不完整");
  console.info(
    `[深境冒險] v${APP_VERSION} 啟動完成 · ${MONSTERS.length} 種魔物 · ${WORLD_BOSSES.length} 隻大型 Boss · ${Object.keys(GEAR).length} 件裝備`,
  );
}
try {
  validateGameBuild();
} catch (error) {
  reportRuntimeError("遊戲檔案可能沒有完整上傳，請重新部署全部檔案。", error);
}
$("#classGrid").innerHTML = Object.entries(CLASSES)
  .map(
    ([id, c]) =>
      `<button class="class-card${c.godMode ? " god-class" : ""}" data-class="${id}"><span>${c.icon}</span><b>${c.name}</b><small>${c.desc}</small>${c.godMode ? '<em class="god-lock">🔒 密碼限定</em>' : ""}<div class="class-stats"><i>HP <strong>${c.hp}</strong></i><i>攻擊 <strong>${c.atk}</strong></i><i>防禦 <strong>${c.def}</strong></i><i>爆擊 <strong>${c.crit}%</strong></i><i>速度 <strong>${c.speed}</strong></i><i>${c.resource} <strong>${c.maxRes}</strong></i></div></button>`,
  )
  .join("");
$("#classGrid").onclick = (e) => {
  const b = e.target.closest("[data-class]");
  if (b) startGame(b.dataset.class);
};
$("#difficultyButtons").onclick = (e) => {
  const b = e.target.closest("[data-difficulty]");
  if (b) {
    difficulty = b.dataset.difficulty;
    $$("[data-difficulty]").forEach((x) =>
      x.classList.toggle("active", x === b),
    );
  }
};
$("#continueBtn").onclick = continueGame;
$("#fleeBtn").onclick = tryFlee;
$("#openPotionMode").onclick = openBattlePotionMode;
$("#potionModeBackdrop").onclick = closeBattlePotionMode;
$("#cancelPotionMode").onclick = closeBattlePotionMode;
$("#confirmPotions").onclick = confirmBattlePotions;
$("#bossDialogueContinue").onclick = beginBossBattle;
$("#eventDismiss").onclick = acknowledgeEventResult;
$("#introBtn").onclick = () => openModal("introModal");
$("#helpBtn").onclick = () => openModal("helpModal");
$("#codexBtn").onclick = () => openCodex();
$("#codexMaterial").onchange = renderCodex;
$("#settingsBtn").onclick = () => openModal("settingsModal");
$("#effectsToggle").onchange = (e) => {
  preferences.effects = e.target.checked;
  applyPreferences();
};
$("#soundToggle").onchange = (e) => {
  preferences.sound = e.target.checked;
  applyPreferences();
  if (preferences.sound) playTone("magic");
};
window
  .matchMedia("(prefers-reduced-motion: reduce)")
  .addEventListener?.("change", applyPreferences);
$("#godUnlockBtn").onclick = unlockGodMode;
$("#godPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockGodMode();
});
document.addEventListener("keydown", (e) => {
  if (
    e.repeat ||
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.target.matches("input, textarea") ||
    $(".modal.open")
  )
    return;
  if (e.key === "Escape" && potionMode) {
    e.preventDefault();
    closeBattlePotionMode();
    return;
  }
  const skillKeys = {
    1: "basic",
    2: "0",
    3: "1",
    4: "2",
  };
  const tacticKeys = {
    q: "heavy",
    w: "interrupt",
    e: "guard",
    r: "focus",
  };
  const key = e.key.toLowerCase();
  if (skillKeys[key] !== undefined) {
    e.preventDefault();
    useSkill(skillKeys[key]);
  } else if (tacticKeys[key]) {
    e.preventDefault();
    useTactic(tacticKeys[key]);
  }
});
$("#resetBtn").onclick = () => {
  if (busy) {
    toast("請等本回合結束後再重新開始");
    return;
  }
  if (confirm("確定刪除存檔並重新選擇職業嗎？")) {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_SAVE_KEY);
    location.reload();
  }
};
try {
  if (localStorage.getItem(SAVE_KEY) || localStorage.getItem(BACKUP_SAVE_KEY))
    $("#continueBtn").classList.remove("hidden");
} catch (error) {
  reportRuntimeError(
    "瀏覽器封鎖了存檔讀取，遊戲仍可遊玩但可能無法保存進度。",
    error,
  );
}
applyPreferences();
render();
document.body.classList.add("modal-active");
document.addEventListener("keydown", (event) => {
  const modal = $$(".modal.open").at(-1),
    dialog = modal || (potionMode ? $("#potionModePanel") : null);
  if (!dialog) return;
  if (event.key === "Escape") {
    if (dialog.id === "eventModal" && S.pendingEvent?.type === "result") {
      event.preventDefault();
      acknowledgeEventResult();
      return;
    }
    const close = dialog.querySelector("[data-close]");
    if (close) {
      event.preventDefault();
      closeModal(close.dataset.close);
    }
  }
  if (event.key !== "Tab") return;
  const focusable = [
      ...dialog.querySelectorAll(
        "button:not(:disabled), input, select, [tabindex='0']",
      ),
    ].filter(
      (node) => !node.closest(".hidden") && node.getClientRects().length,
    ),
    first = focusable[0],
    last = focusable.at(-1);
  if (!first) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
