"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const card = (id, name, type, ap, data = {}) => ({ id, name, type, ap, ...data });

function syncViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

syncViewportHeight();
window.addEventListener("resize", syncViewportHeight, { passive: true });
window.addEventListener("orientationchange", syncViewportHeight, { passive: true });
window.visualViewport?.addEventListener("resize", syncViewportHeight, { passive: true });

const shared = {
  strike: () =>
    card("star-slash", "星紋斬", "攻擊", 1, {
      damage: 78,
      energyGain: 12,
      icon: "✦",
      color: "#6da6ff",
      desc: "造成傷害，獲得 12 星能。",
    }),
  guard: () =>
    card("phase-wall", "相位護壁", "防禦", 1, {
      block: 88,
      icon: "◈",
      color: "#63d7ff",
      desc: "獲得護盾，數值受角色防禦影響。",
    }),
  focus: () =>
    card("astral-focus", "星脈共鳴", "術法", 0, {
      energyGain: 20,
      draw: 1,
      icon: "◇",
      color: "#a783ff",
      desc: "獲得 20 星能並抽 1 張牌。",
    }),
};

const fighters = [
  {
    id: "azure",
    name: "蒼凜",
    className: "玄劍師",
    title: "無限界的觀測者",
    image: "assets/azure.webp",
    color: "#67c8ff",
    hp: 1260,
    power: 100,
    guard: 92,
    speed: 84,
    ap: 3,
    handSize: 5,
    cardLimit: 4,
    initialEnergy: 35,
    supportSlots: 3,
    desc: "攻守平衡的御劍者，能從防禦轉入反擊，適合觀察敵方意圖後精準出牌。",
    traits: [
      { name: "觀測演算", icon: "◉", desc: "每回合第一張防禦牌額外獲得 30 護盾。" },
      { name: "劍心回流", icon: "✦", desc: "每回合第一張攻擊牌額外獲得 8 星能。" },
    ],
    cards: [
      shared.strike(),
      shared.strike(),
      shared.strike(),
      shared.guard(),
      shared.guard(),
      shared.focus(),
      card("azure-shift", "界域偏轉", "反擊", 1, {
        block: 105,
        counter: 48,
        energyGain: 8,
        icon: "⬡",
        color: "#59e0ff",
        desc: "獲得護盾；下次受擊時反擊 48。",
      }),
      card("azure-ray", "虛空折射", "術法", 2, {
        damage: 165,
        magic: true,
        vuln: 1,
        icon: "⟡",
        color: "#6c8eff",
        desc: "無視護甲造成傷害，施加 1 層破綻。",
      }),
      card("azure-draw", "全域觀測", "戰術", 1, {
        draw: 2,
        energyGain: 16,
        icon: "◎",
        color: "#8bdcff",
        desc: "抽 2 張牌並獲得 16 星能。",
      }),
      card("azure-ult", "無垠・蒼星墜落", "終結", 3, {
        damage: 350,
        energyCost: 80,
        stun: 1,
        ultimate: true,
        icon: "✵",
        color: "#ffe596",
        desc: "消耗 80 星能，造成巨額傷害並封鎖敵人一回合。",
      }),
    ],
  },
  {
    id: "ember",
    name: "燼羅",
    className: "破軍劍士",
    title: "災炎的霸者",
    image: "assets/ember.webp",
    color: "#ff6a67",
    hp: 1420,
    power: 116,
    guard: 72,
    speed: 70,
    ap: 4,
    handSize: 4,
    cardLimit: 3,
    initialEnergy: 15,
    supportSlots: 2,
    desc: "手牌少但單卡爆發極高，以生命與防禦換取火焰劍勢，適合強攻。",
    traits: [
      { name: "不滅餘燼", icon: "炎", desc: "攻擊灼燒敵人時，傷害提高 18%。" },
      { name: "逆境劍勢", icon: "▲", desc: "生命低於 50% 時，所有攻擊傷害提高 25%。" },
    ],
    cards: [
      card("ember-slash", "裂焰斬", "攻擊", 1, {
        damage: 88,
        energyGain: 10,
        icon: "╱",
        color: "#ff765e",
        desc: "造成傷害並獲得 10 星能。",
      }),
      card("ember-slash", "裂焰斬", "攻擊", 1, {
        damage: 88,
        energyGain: 10,
        icon: "╱",
        color: "#ff765e",
        desc: "造成傷害並獲得 10 星能。",
      }),
      card("ember-break", "破軍重斬", "攻擊", 2, {
        damage: 205,
        bleed: 2,
        icon: "刃",
        color: "#ff4f5f",
        desc: "高傷害並施加 2 層流血。",
      }),
      shared.guard(),
      shared.focus(),
      card("ember-burn", "災火刻印", "異常", 1, {
        damage: 35,
        burn: 3,
        icon: "♨",
        color: "#ff8a4c",
        desc: "造成傷害並施加 3 層灼燒。",
      }),
      card("ember-rage", "焚血戰意", "持續", 1, {
        strength: 20,
        selfDamage: 45,
        energyGain: 25,
        icon: "▲",
        color: "#ffad5f",
        desc: "失去 45 生命，本場攻擊提高 20 並獲得星能。",
      }),
      card("ember-counter", "赤鋼架式", "反擊", 1, {
        block: 72,
        counter: 85,
        icon: "盾",
        color: "#ff9c75",
        desc: "獲得護盾；下次受擊時強力反擊。",
      }),
      card("ember-ult", "炎界・天火葬送", "終結", 3, {
        damage: 405,
        energyCost: 85,
        burn: 3,
        ultimate: true,
        icon: "✹",
        color: "#ffe08a",
        desc: "消耗 85 星能，造成極高傷害並施加灼燒。",
      }),
    ],
  },
  {
    id: "lunar",
    name: "月璃",
    className: "星術法師",
    title: "星律的演算師",
    image: "assets/lunar.webp",
    color: "#b08dff",
    hp: 1080,
    power: 94,
    guard: 65,
    speed: 112,
    ap: 3,
    handSize: 6,
    cardLimit: 6,
    initialEnergy: 50,
    supportSlots: 3,
    desc: "初始星能與抽牌數最高，以低費術法連鎖創造單回合大量操作。",
    traits: [
      { name: "月相輪轉", icon: "☾", desc: "每使用 3 張牌，自動抽 1 張牌。" },
      { name: "法力折返", icon: "∞", desc: "每回合第一張術法牌返還 1 點行動力。" },
    ],
    cards: [
      card("lunar-string", "星弦", "術法", 1, {
        damage: 70,
        magic: true,
        energyGain: 15,
        icon: "⌁",
        color: "#b79cff",
        desc: "無視護甲造成傷害並獲得星能。",
      }),
      card("lunar-string", "星弦", "術法", 1, {
        damage: 70,
        magic: true,
        energyGain: 15,
        icon: "⌁",
        color: "#b79cff",
        desc: "無視護甲造成傷害並獲得星能。",
      }),
      card("lunar-burst", "星環爆裂", "術法", 2, {
        damage: 150,
        magic: true,
        vuln: 1,
        icon: "✧",
        color: "#8f73ff",
        desc: "無視護甲並施加破綻。",
      }),
      card("lunar-veil", "月影帷幕", "防禦", 1, {
        block: 72,
        draw: 1,
        icon: "☾",
        color: "#8ea4ff",
        desc: "獲得護盾並抽 1 張牌。",
      }),
      shared.focus(),
      shared.focus(),
      card("lunar-zero", "零時演算", "戰術", 0, {
        draw: 2,
        icon: "∞",
        color: "#d0baff",
        desc: "不消耗行動點，抽 2 張牌。",
      }),
      card("lunar-orbit", "十二星軌", "連擊", 2, {
        damage: 72,
        hits: 3,
        magic: true,
        icon: "✧",
        color: "#916cff",
        desc: "連續施放 3 次星軌攻擊。",
      }),
      card("lunar-rewind", "月輪回溯", "回復", 1, {
        heal: 115,
        energyGain: 12,
        icon: "◔",
        color: "#d7c7ff",
        desc: "恢復生命並獲得星能。",
      }),
      card("lunar-ult", "天穹・星律演算", "終結", 3, {
        damage: 325,
        draw: 2,
        magic: true,
        energyCost: 75,
        ultimate: true,
        icon: "✺",
        color: "#ffe89e",
        desc: "消耗 75 星能，造成巨額術法傷害並抽牌。",
      }),
    ],
  },
  {
    id: "jade",
    name: "青珞",
    className: "守陣坦克",
    title: "守界的靈契者",
    image: "assets/jade.webp",
    color: "#6bf0ba",
    hp: 1580,
    power: 80,
    guard: 120,
    speed: 62,
    ap: 3,
    handSize: 4,
    cardLimit: 3,
    initialEnergy: 20,
    supportSlots: 2,
    desc: "生命與防禦最高，以護盾、反擊與治療抵擋反派的爆發。",
    traits: [
      { name: "翠玉靈契", icon: "❉", desc: "回合結束後保留 35% 未消耗護盾。" },
      { name: "守界陣心", icon: "⬡", desc: "每回合開始時自動獲得 24 點護盾。" },
    ],
    cards: [
      card("jade-bash", "玄甲震擊", "盾擊", 1, {
        damage: 85,
        shieldDamage: 0.5,
        energyGain: 15,
        icon: "震",
        color: "#79e6c8",
        desc: "將目前 50% 護盾轉為額外基礎傷害，消耗該護盾；獲得 15 星能。",
      }),
      card("jade-hit", "翠靈擊", "攻擊", 1, {
        damage: 72,
        energyGain: 13,
        icon: "❈",
        color: "#67e5ae",
        desc: "造成傷害並獲得星能。",
      }),
      card("jade-wall", "青玉障", "防禦", 1, {
        block: 128,
        icon: "⬡",
        color: "#6effbd",
        desc: "獲得大量護盾。",
      }),
      card("jade-wall", "青玉障", "防禦", 1, {
        block: 128,
        icon: "⬡",
        color: "#6effbd",
        desc: "獲得大量護盾。",
      }),
      shared.focus(),
      card("jade-heal", "返生律", "回復", 1, {
        heal: 155,
        regen: 2,
        icon: "✚",
        color: "#9dffd0",
        desc: "恢復生命並獲得 2 回合再生。",
      }),
      card("jade-thorns", "玉棘反響", "反擊", 2, {
        block: 150,
        counter: 65,
        icon: "✤",
        color: "#55dca3",
        desc: "獲得護盾；下次受擊時反擊。",
      }),
      card("jade-spirit", "青鸞守護", "召喚", 2, {
        summon: { damage: 48, turns: 3 },
        icon: "鳥",
        color: "#70f1c0",
        desc: "召喚青鸞，連續 3 回合協助攻擊。",
      }),
      card("jade-seal", "封界鎖鏈", "異常", 2, {
        damage: 105,
        weak: 2,
        icon: "⌘",
        color: "#8fffd1",
        desc: "造成傷害，使敵人 2 回合弱化。",
      }),
      card("jade-ult", "萬象・翠玉封界", "終結", 3, {
        damage: 235,
        block: 195,
        energyCost: 80,
        ultimate: true,
        icon: "❉",
        color: "#ffe99f",
        desc: "消耗 80 星能，造成傷害並建立巨大護盾。",
      }),
    ],
  },
  {
    id: "frost",
    name: "應霜",
    className: "天弓射手",
    title: "逐月的破界者",
    image: "assets/frost-archer.webp",
    color: "#8de8ff",
    hp: 1160,
    power: 102,
    guard: 76,
    speed: 104,
    ap: 4,
    handSize: 5,
    cardLimit: 5,
    initialEnergy: 28,
    supportSlots: 3,
    desc: "以標記、穿甲與多段射擊持續輸出，能在單回合快速累積星能。",
    traits: [
      { name: "破空標記", icon: "◎", desc: "每回合第一張攻擊牌額外施加 1 層破綻。" },
      { name: "追月連矢", icon: "➶", desc: "每回合第二張攻擊牌追加一次 45 點傷害。" },
    ],
    cards: [
      card("frost-shot", "流霜矢", "攻擊", 1, {
        damage: 74,
        energyGain: 13,
        icon: "➶",
        color: "#8de8ff",
        desc: "造成傷害並獲得 13 星能。",
      }),
      card("frost-shot", "流霜矢", "攻擊", 1, {
        damage: 74,
        energyGain: 13,
        icon: "➶",
        color: "#8de8ff",
        desc: "造成傷害並獲得 13 星能。",
      }),
      card("frost-pierce", "貫星箭", "攻擊", 2, {
        damage: 170,
        magic: true,
        icon: "⇢",
        color: "#66bfff",
        desc: "穿透護甲造成高額傷害。",
      }),
      card("frost-rain", "星雨連射", "連擊", 2, {
        damage: 48,
        hits: 4,
        icon: "≋",
        color: "#73d4ff",
        desc: "連續射擊 4 次。",
      }),
      card("frost-step", "踏風身法", "戰術", 0, {
        draw: 1,
        apGain: 1,
        icon: "風",
        color: "#9bf3ff",
        desc: "抽 1 張牌並獲得 1 行動點。",
      }),
      shared.guard(),
      shared.focus(),
      card("frost-mark", "獵月標記", "異常", 1, {
        vuln: 2,
        energyGain: 12,
        icon: "◎",
        color: "#a7ddff",
        desc: "施加 2 層破綻並獲得星能。",
      }),
      card("frost-trap", "鎖靈箭陣", "持續", 2, {
        damage: 72,
        weak: 1,
        bleed: 2,
        icon: "陣",
        color: "#72aaff",
        desc: "造成傷害，附加弱化與流血。",
      }),
      card("frost-ult", "月墜・萬箭天穹", "終結", 3, {
        damage: 100,
        hits: 4,
        energyCost: 82,
        ultimate: true,
        icon: "☄",
        color: "#ffe49b",
        desc: "消耗 82 星能，降下四次天弓箭雨。",
      }),
    ],
  },
  {
    id: "shadow",
    name: "夜璃",
    className: "影刃刺客",
    title: "無聲的斷命者",
    image: "assets/shadow-assassin.webp",
    color: "#b078ff",
    hp: 1030,
    power: 110,
    guard: 60,
    speed: 126,
    ap: 5,
    handSize: 4,
    cardLimit: 5,
    initialEnergy: 10,
    supportSlots: 3,
    desc: "行動點最高，以低費卡連鎖、劇毒與首擊爆發在短時間結束戰鬥。",
    traits: [
      { name: "無聲先手", icon: "影", desc: "每回合第一次攻擊必定造成 60% 額外傷害。" },
      { name: "影步循環", icon: "∞", desc: "每使用 3 張牌，返還 1 點行動力。" },
    ],
    cards: [
      card("shadow-cut", "無聲刃", "攻擊", 1, {
        damage: 68,
        energyGain: 12,
        icon: "刃",
        color: "#b078ff",
        desc: "造成傷害並獲得星能。",
      }),
      card("shadow-cut", "無聲刃", "攻擊", 1, {
        damage: 68,
        energyGain: 12,
        icon: "刃",
        color: "#b078ff",
        desc: "造成傷害並獲得星能。",
      }),
      card("shadow-zero", "影閃", "攻擊", 0, {
        damage: 38,
        icon: "瞬",
        color: "#8656dc",
        desc: "不消耗行動點的快速斬擊。",
      }),
      card("shadow-poison", "蝕魂毒", "異常", 1, {
        damage: 30,
        poison: 3,
        icon: "毒",
        color: "#8cdd82",
        desc: "造成傷害並施加 3 層中毒。",
      }),
      card("shadow-chain", "夜幕連斬", "連擊", 2, {
        damage: 58,
        hits: 3,
        icon: "爪",
        color: "#9c61ff",
        desc: "連續攻擊 3 次。",
      }),
      card("shadow-counter", "鏡花替身", "反擊", 1, {
        block: 58,
        counter: 78,
        draw: 1,
        icon: "鏡",
        color: "#c696ff",
        desc: "獲得護盾與反擊並抽牌。",
      }),
      shared.focus(),
      card("shadow-steal", "奪影", "術法", 1, {
        damage: 65,
        magic: true,
        stealBlock: true,
        icon: "月",
        color: "#7146bf",
        desc: "無視護甲並奪取敵人一半護盾。",
      }),
      card("shadow-mist", "紫霧封脈", "持續", 2, {
        poison: 2,
        weak: 2,
        icon: "霧",
        color: "#8052a9",
        desc: "施加中毒與 2 回合弱化。",
      }),
      card("shadow-ult", "無月・百鬼斷界", "終結", 3, {
        damage: 92,
        hits: 5,
        poison: 2,
        energyCost: 78,
        ultimate: true,
        icon: "☾",
        color: "#ffe69d",
        desc: "消耗 78 星能，進行五次斷界斬並施毒。",
      }),
    ],
  },
];

const supportSkills = [
  card("support-sword", "劍心共鳴", "持續", 1, {
    strength: 14,
    energyGain: 10,
    icon: "劍",
    color: "#ffb25f",
    desc: "本場攻擊提高 14，並獲得 10 星能。",
    recommend: ["azure", "ember"],
  }),
  card("support-armor", "玄甲符", "防禦", 1, {
    block: 125,
    icon: "甲",
    color: "#62d8ff",
    desc: "立即獲得大量護盾。",
    recommend: ["jade", "azure"],
  }),
  card("support-heal", "回春咒", "回復", 1, {
    heal: 135,
    regen: 2,
    icon: "春",
    color: "#6af2b0",
    desc: "恢復生命並獲得 2 回合再生。",
    recommend: ["jade", "ember"],
  }),
  card("support-break", "破界符", "異常", 1, {
    damage: 55,
    magic: true,
    vuln: 2,
    icon: "破",
    color: "#73b7ff",
    desc: "造成術法傷害並施加 2 層破綻。",
    recommend: ["frost", "azure"],
  }),
  card("support-fire", "焚天印", "異常", 1, {
    burn: 4,
    icon: "炎",
    color: "#ff704f",
    desc: "對敵人施加 4 層灼燒。",
    recommend: ["ember", "lunar"],
  }),
  card("support-wind", "逐風步", "戰術", 0, {
    draw: 2,
    apGain: 1,
    icon: "風",
    color: "#79e8f4",
    desc: "不消耗行動點，抽 2 張牌並獲得 1 行動點。",
    recommend: ["frost", "shadow"],
  }),
  card("support-cleanse", "淨魂訣", "回復", 1, {
    cleanse: true,
    heal: 65,
    icon: "淨",
    color: "#e8f6ff",
    desc: "解除所有異常並恢復生命。",
    recommend: ["jade", "ember"],
  }),
  card("support-energy", "聚靈陣", "術法", 0, {
    energyGain: 38,
    icon: "靈",
    color: "#ad8dff",
    desc: "不消耗行動點，獲得 38 星能。",
    recommend: ["lunar", "azure"],
  }),
  card("support-summon", "靈獸召喚", "召喚", 2, {
    summon: { damage: 55, turns: 3 },
    icon: "獸",
    color: "#66e4b2",
    desc: "召喚靈獸，連續 3 回合協助攻擊。",
    recommend: ["jade", "lunar"],
  }),
  card("support-ward", "逆命護符", "防禦", 1, {
    block: 72,
    ward: 1,
    icon: "命",
    color: "#ffd979",
    desc: "獲得護盾；下一次致命傷害會保留 1 點生命。",
    recommend: ["ember", "shadow"],
  }),
  card("support-counter", "影遁反刃", "反擊", 1, {
    block: 50,
    counter: 105,
    icon: "影",
    color: "#b682ff",
    desc: "獲得護盾；下次受擊時造成強力反擊。",
    recommend: ["shadow", "frost"],
  }),
  card("support-star", "星落術", "術法", 2, {
    damage: 190,
    magic: true,
    energyGain: 8,
    icon: "星",
    color: "#8db4ff",
    desc: "無視護甲造成大量術法傷害。",
    recommend: ["lunar", "frost"],
  }),
  card("support-shield", "玄甲崩山", "盾擊", 2, {
    damage: 120,
    shieldDamage: 0.75,
    icon: "盾",
    color: "#6de5b7",
    desc: "消耗目前 75% 護盾，轉為額外基礎傷害。先築盾再出牌更有效。",
    recommend: ["jade", "azure"],
  }),
  card("support-siphon", "靈刃汲生", "術法", 1, {
    damage: 65,
    magic: true,
    heal: 55,
    energyGain: 8,
    icon: "汲",
    color: "#e3a3ce",
    desc: "造成 65 術法傷害，恢復 55 生命並獲得 8 星能。",
    recommend: ["ember", "lunar"],
  }),
  card("support-venom", "劍氣淬毒", "異常", 1, {
    damage: 30,
    poison: 2,
    icon: "毒",
    color: "#a2dd83",
    desc: "造成 30 基礎傷害並施加 2 層中毒，適合持續削弱反派。",
    recommend: ["shadow", "frost"],
  }),
  card("support-mind", "無念行訣", "戰術", 1, {
    draw: 3,
    cleanse: true,
    icon: "念",
    color: "#aebbf4",
    desc: "抽 3 張牌，並清除自身全部異常；仍受 9 張手牌上限限制。",
    recommend: ["lunar", "shadow"],
  }),
].map((item) => ({ ...item, source: "support" }));

const villains = [
  {
    id: "prison",
    name: "獄骸",
    title: "天災級異相",
    realm: "第七觀測界域",
    image: "assets/enemy.webp",
    background: "assets/arena.webp",
    color: "#d56cff",
    hp: 1780,
    armor: 0.05,
    trait: "骸骨侵蝕：每 3 回合提高自身攻擊。",
    moves: [
      { name: "黑棘撕裂", icon: "⚔", damage: 116, text: "攻擊 116" },
      { name: "腐蝕吐息", icon: "♨", damage: 76, burn: 2, text: "攻擊＋灼燒" },
      { name: "骸骨屏障", icon: "⬡", block: 125, strength: 6, text: "護盾＋強化" },
      { name: "終末崩落", icon: "☄", damage: 225, text: "致命重擊" },
    ],
  },
  {
    id: "bloodmoon",
    name: "血月魔尊",
    title: "魔道至尊",
    realm: "血月天宮",
    image: "assets/villain-bloodmoon.webp",
    background: "assets/arena-demonic.webp",
    color: "#ff4f67",
    hp: 2050,
    armor: 0.08,
    trait: "血月魔相：生命低於 50% 時攻擊永久提高。",
    moves: [
      { name: "血刃橫空", icon: "刃", damage: 132, bleed: 2, text: "攻擊＋流血" },
      { name: "魔血祭", icon: "血", heal: 105, strength: 10, text: "治療＋強化" },
      { name: "紅蓮斷界", icon: "炎", damage: 178, burn: 2, text: "強攻＋灼燒" },
      { name: "血月降臨", icon: "月", damage: 245, text: "毀滅重擊" },
    ],
  },
  {
    id: "fox",
    name: "九尾妖皇",
    title: "萬妖之主",
    realm: "青丘幻境",
    image: "assets/villain-fox.webp",
    background: "assets/arena-celestial.webp",
    color: "#68ead8",
    hp: 1880,
    armor: 0.04,
    trait: "魅惑幻術：會封鎖下一回合的抽牌與出牌數。",
    moves: [
      { name: "狐火流螢", icon: "狐", damage: 92, burn: 3, text: "攻擊＋狐火" },
      {
        name: "九尾魅惑",
        icon: "魅",
        damage: 58,
        drawPenalty: 1,
        limitPenalty: 1,
        text: "封鎖抽牌與出牌",
      },
      { name: "妖皇靈幕", icon: "扇", block: 155, heal: 45, text: "護盾＋治療" },
      { name: "青丘葬月", icon: "月", damage: 210, weak: 1, text: "重擊＋弱化" },
    ],
  },
  {
    id: "fallen",
    name: "墮星劍仙",
    title: "失道真仙",
    realm: "墜星劍塚",
    image: "assets/villain-fallen.webp",
    background: "assets/arena.webp",
    color: "#a991ff",
    hp: 1980,
    armor: 0.12,
    trait: "劍仙殘心：護甲極高，並會對無護盾目標造成額外傷害。",
    moves: [
      { name: "斷星一劍", icon: "劍", damage: 145, bonusUnblocked: 45, text: "斬擊；無盾增傷" },
      { name: "萬劍歸墟", icon: "陣", damage: 72, hits: 2, text: "二連劍陣" },
      { name: "劍意護體", icon: "界", block: 145, strength: 8, text: "護盾＋劍意" },
      { name: "仙隕", icon: "星", damage: 235, vuln: 1, text: "重擊＋破綻" },
    ],
  },
  {
    id: "dragon",
    name: "燭龍君",
    title: "遠古龍君",
    realm: "焚天龍門",
    image: "assets/villain-dragon.webp",
    background: "assets/arena-demonic.webp",
    color: "#ff8a45",
    hp: 2250,
    armor: 0.14,
    trait: "燭龍逆鱗：生命與護甲最高，龍焰會持續累積。",
    moves: [
      { name: "龍爪裂地", icon: "爪", damage: 142, text: "龍爪攻擊" },
      { name: "燭世龍息", icon: "炎", damage: 85, burn: 4, text: "攻擊＋大量灼燒" },
      { name: "逆鱗天甲", icon: "鱗", block: 175, strength: 7, text: "護盾＋強化" },
      { name: "日蝕焚天", icon: "日", damage: 260, burn: 2, text: "毀滅龍焰" },
    ],
  },
  {
    id: "void",
    name: "無相天魔",
    title: "域外禁忌",
    realm: "倒懸無相塔",
    image: "assets/villain-void.webp",
    background: "assets/arena-celestial.webp",
    color: "#9d62ff",
    hp: 2120,
    armor: 0.09,
    trait: "無相禁法：會抽走星能、施加中毒並壓縮你的卡牌上限。",
    moves: [
      { name: "無相魔手", icon: "掌", damage: 110, poison: 2, text: "攻擊＋中毒" },
      { name: "吞靈禁式", icon: "禁", damage: 72, energyDrain: 24, text: "攻擊＋吸收星能" },
      { name: "倒懸法界", icon: "界", block: 150, limitPenalty: 1, text: "護盾＋壓制出牌" },
      { name: "萬相俱滅", icon: "滅", damage: 238, poison: 2, text: "重擊＋中毒" },
    ],
  },
];

const difficulties = {
  easy: { label: "簡單", hp: 0.78, damage: 0.78, block: 0.8, reward: 0.8 },
  normal: { label: "普通", hp: 1, damage: 1, block: 1, reward: 1 },
  hard: { label: "困難", hp: 1.3, damage: 1.24, block: 1.18, reward: 1.3 },
};

let selectedFighter = null;
let selectedSupports = [];
let selectedVillain = null;
let selectedDifficulty = "normal";
let player, enemy, drawPile, discardPile, hand, currentIntent;
let round = 1;
let ap = 3;
let battleOver = false;
let busy = false;
let cardsPlayed = 0;
let cardsThisTurn = 0;
let attacksThisTurn = 0;
let totalDamage = 0;
let firstDefenseUsed = false;
let firstSpellUsed = false;
let phaseTriggered = false;
let supportFilter = "all";
let selectedMode = "duel";
let trial = null;
let currentField = null;
let rewardOptions = [];
let selectedReward = null;
let detailIndex = null;
let battleGeneration = 0;

const fields = [
  { id: "spring", name: "靈泉守陣", desc: "開戰獲得 70 護盾。", icon: "泉" },
  { id: "stars", name: "星潮湧動", desc: "每回合額外恢復 8 星能。", icon: "星" },
  { id: "fire", name: "焚天劍域", desc: "雙方攻擊提高 12 點。", icon: "炎" },
  { id: "mist", name: "雲海悟道", desc: "每回合手牌上限增加 1 張。", icon: "雲" },
  { id: "iron", name: "玄鐵堡壘", desc: "敵方開戰獲得 90 護盾；你的防禦提高 20。", icon: "盾" },
];

const rewardCatalog = [
  { id: "heal", icon: "泉", name: "靈泉補給", desc: "恢復最大生命的 40%。", kind: "補給" },
  { id: "power", icon: "劍", name: "破軍劍印", desc: "往後每一戰，攻擊基礎值 +12。", kind: "秘寶" },
  { id: "guard", icon: "盾", name: "玄武甲片", desc: "往後每一戰，防禦基礎值 +18。", kind: "秘寶" },
  {
    id: "vital",
    icon: "命",
    name: "長生玉露",
    desc: "最大生命 +150，立即恢復 150 生命。",
    kind: "秘寶",
  },
  {
    id: "energy",
    icon: "星",
    name: "聚星靈石",
    desc: "後續每戰開局額外獲得 25 星能。",
    kind: "秘寶",
  },
  {
    id: "ap",
    icon: "●",
    name: "疾行符",
    desc: "後續每戰的第一回合，額外 +1 行動力。",
    kind: "秘寶",
  },
  {
    id: "chain",
    icon: "雷",
    name: "雷霆連鎖",
    desc: "新卡：2 AP，術法傷害 80 × 3，施加 1 層弱化。",
    kind: "新卡",
    card: card("loot-chain", "雷霆連鎖", "連擊", 2, {
      damage: 80,
      hits: 3,
      magic: true,
      weak: 1,
      icon: "雷",
      color: "#b5a1ff",
      desc: "三連術法傷害，無視護甲，施加 1 層弱化。",
    }),
  },
  {
    id: "springcard",
    icon: "蓮",
    name: "蓮華護生",
    desc: "新卡：1 AP，恢復 110 生命並獲得 65 基礎護盾。",
    kind: "新卡",
    card: card("loot-spring", "蓮華護生", "回復", 1, {
      heal: 110,
      block: 65,
      icon: "蓮",
      color: "#77efc3",
      desc: "恢復 110 生命並獲得 65 基礎護盾。",
    }),
  },
  {
    id: "flow",
    icon: "流",
    name: "乾坤流轉",
    desc: "新卡：0 AP，抽 2 張牌並獲得 15 星能；使用後移除。",
    kind: "新卡",
    card: card("loot-flow", "乾坤流轉", "戰術", 0, {
      draw: 2,
      energyGain: 15,
      exhaust: true,
      icon: "流",
      color: "#85d8ff",
      desc: "抽 2 張牌，獲得 15 星能；本場戰鬥使用後移除。",
    }),
  },
];

function scheduleBattle(action, delay) {
  const generation = battleGeneration;
  setTimeout(() => {
    if (generation === battleGeneration) action();
  }, delay);
}

function abortBattle() {
  Spectacle.reset();
  battleGeneration++;
  busy = true;
  battleOver = true;
  trial = null;
  $("#logPanel").classList.remove("open");
  $("#logToggle").setAttribute("aria-expanded", "false");
  closeCardDetail();
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function showScreen(id) {
  if (id !== "battleScreen") Spectacle.reset();
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $("#" + id).classList.add("active");
  document.body.classList.toggle("battle-mode", id === "battleScreen");
  document.body.classList.toggle(
    "setup-mode",
    ["selectScreen", "supportScreen", "challengeScreen", "rewardScreen"].includes(id),
  );
  syncViewportHeight();
  window.scrollTo(0, 0);
}

function renderFighters() {
  $("#fighterGrid").innerHTML = fighters
    .map(
      (fighter) => `
    <article class="fighter-card ${selectedFighter?.id === fighter.id ? "selected" : ""}" data-id="${fighter.id}" role="button" tabindex="0" aria-pressed="${selectedFighter?.id === fighter.id}" aria-label="選擇${fighter.name}，${fighter.className}" style="--accent:${fighter.color}">
      <img src="${fighter.image}" alt="${fighter.name}">
      <span class="class-pill">${fighter.className}</span>
      <div class="fighter-copy">
        <small>${fighter.title}</small><h3>${fighter.name}</h3><p>${fighter.desc}</p>
        <div class="stats">
          <span><b>${fighter.hp}</b>生命</span><span><b>${fighter.power}</b>攻擊</span><span><b>${fighter.guard}</b>防禦</span><span><b>${fighter.initialEnergy}</b>初始星能</span>
        </div>
        <div class="turn-profile">
          <span tabindex="0" title="每回合可花費的行動點"><i>每回合行動力</i><b>${fighter.ap} 點</b><small>支付卡牌費用</small></span>
          <span tabindex="0" title="新回合會補牌到這個數量"><i>每回合手牌</i><b>${fighter.handSize} 張</b><small>回合開始補牌</small></span>
          <span tabindex="0" title="每回合最多能使用的卡牌張數"><i>出牌上限</i><b>${fighter.cardLimit} 張</b><small>0 費牌也計算</small></span>
          <span tabindex="0" title="開戰時直接擁有的星能"><i>初始星能</i><b>${fighter.initialEnergy} EN</b><small>終結牌的資源</small></span>
          <span tabindex="0" title="必須自行選滿的支援牌數量"><i>支援容量</i><b>${fighter.supportSlots} 張</b><small>額外加入牌組</small></span>
        </div>
        <div class="trait-list">${fighter.traits.map((trait) => `<span title="${trait.desc}"><i>${trait.icon}</i><b>${trait.name}</b><em>${trait.desc}</em></span>`).join("")}</div>
      </div>
    </article>`,
    )
    .join("");
  $$(".fighter-card").forEach(
    (node) =>
      (node.onclick = () => {
        const fighter = fighters.find((fighter) => fighter.id === node.dataset.id);
        if (selectedFighter?.id !== fighter.id) {
          selectedSupports = [];
          selectedVillain = null;
        }
        selectedFighter = fighter;
        $("#selectedFighterName").textContent =
          `${selectedFighter.name}｜${selectedFighter.className}｜每回合 ${selectedFighter.ap} 行動力、最多出 ${selectedFighter.cardLimit} 張牌`;
        $("#toSupportBtn").disabled = false;
        renderFighters();
      }),
  );
}

function renderSupports() {
  if (!selectedFighter) return;
  const slots = selectedFighter.supportSlots;
  const visibleSkills = supportSkills.filter((skill) =>
    supportFilter === "recommended"
      ? skill.recommend.includes(selectedFighter.id)
      : supportFilter === "selected"
        ? selectedSupports.includes(skill.id)
        : true,
  );
  $("#supportGrid").innerHTML =
    visibleSkills
      .map((skill) => {
        const chosen = selectedSupports.includes(skill.id);
        const recommended = skill.recommend.includes(selectedFighter.id);
        const disabled = !chosen && selectedSupports.length >= slots;
        const recommendedNames = skill.recommend
          .map((id) => fighters.find((fighter) => fighter.id === id)?.className)
          .filter(Boolean)
          .join("、");
        return `<article class="support-card glass ${chosen ? "selected" : ""} ${recommended ? "recommended" : ""} ${disabled ? "disabled" : ""}" data-id="${skill.id}" role="button" tabindex="0" aria-pressed="${chosen}" aria-label="${chosen ? "卸下" : "裝備"}${skill.name}" style="--accent:${skill.color}">
      <div class="sigil">${skill.icon}</div><div class="support-copy"><small>${recommended ? `★ 很適合目前的${selectedFighter.className}` : skill.type}</small><h3>${skill.name}</h3><p>${skill.desc}</p><div class="skill-effects">${cardEffectBadges(
        skill,
      )
        .slice(0, 3)
        .map((effect) => `<span>${effect.label} <b>${effect.value}</b></span>`)
        .join(
          "",
        )}</div><footer><b>${skill.ap} AP</b><span>推薦職業：${recommendedNames}</span></footer></div>
      <span class="select-state">${chosen ? "✓ 已裝備" : "＋ 裝備"}</span>
    </article>`;
      })
      .join("") ||
    '<p class="empty-list">還沒有裝備技能。切換「全部技能」或「職業推薦」來挑選。</p>';
  $$(".support-card").forEach(
    (node) =>
      (node.onclick = () => {
        const id = node.dataset.id;
        const index = selectedSupports.indexOf(id);
        if (index >= 0) selectedSupports.splice(index, 1);
        else if (selectedSupports.length < slots) selectedSupports.push(id);
        else return toast("容量已滿，先卸下一張技能即可更換。");
        renderSupports();
        updateSetupState();
      }),
  );
  $("#supportSlotText").textContent = `已選 ${selectedSupports.length} / ${slots}`;
  $("#selectedSkillChips").innerHTML = selectedSupports.length
    ? selectedSupports
        .map((id, index) => {
          const skill = supportSkills.find((item) => item.id === id);
          return `<button type="button" data-remove-support="${id}" aria-label="卸下${skill.name}">${skill.name}<b>×</b></button>`;
        })
        .join("")
    : `<small>尚未選擇；請從上方 ${supportSkills.length} 張牌自行搭配</small>`;
  $("#selectedSupportSummary").textContent = selectedSupports.length
    ? `${selectedSupports.length} / ${slots}：${selectedSupports.map((id) => supportSkills.find((skill) => skill.id === id).name).join("、")}`
    : `尚未選擇（需要 ${slots} 張）`;
  $("#toChallengeBtn").disabled = selectedSupports.length !== slots;
  $("#toChallengeBtn").textContent =
    selectedSupports.length === slots ? "確認技能 →" : `再選 ${slots - selectedSupports.length} 張`;
  $$("[data-remove-support]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedSupports = selectedSupports.filter((id) => id !== button.dataset.removeSupport);
        renderSupports();
        updateSetupState();
      }),
  );
}

function renderVillains() {
  $("#villainGrid").innerHTML = villains
    .map(
      (villain) => `
    <article class="villain-card ${selectedVillain?.id === villain.id ? "selected" : ""}" data-id="${villain.id}" role="button" tabindex="0" aria-pressed="${selectedVillain?.id === villain.id}" aria-label="選擇${villain.name}" style="--boss:${villain.color}">
      <img src="${villain.image}" alt="${villain.name}"><div><small>${villain.title}</small><h3>${villain.name}</h3><p>${villain.trait}</p><span class="boss-stats"><em>♥ 生命 <b>${villain.hp}</b></em><em>◆ 護甲 <b>${Math.round(villain.armor * 100)}%</b></em></span></div>
    </article>`,
    )
    .join("");
  $$(".villain-card").forEach(
    (node) =>
      (node.onclick = () => {
        selectedVillain = villains.find((villain) => villain.id === node.dataset.id);
        renderVillains();
        updateSetupState();
      }),
  );
}

function renderDifficulty() {
  $$(".difficulty-card").forEach((node) => {
    node.classList.toggle("selected", node.dataset.difficulty === selectedDifficulty);
    node.onclick = () => {
      selectedDifficulty = node.dataset.difficulty;
      renderDifficulty();
    };
  });
}

function updateSetupState() {
  const slots = selectedFighter?.supportSlots || 0;
  $("#selectedBossName").textContent = selectedVillain
    ? `${selectedMode === "trial" ? "三連戰首關" : "討伐"}：${selectedVillain.name} · ${difficulties[selectedDifficulty].label}`
    : "尚未選擇反派";
  $("#battleBtn").disabled =
    !selectedFighter || !selectedVillain || selectedSupports.length !== slots;
  $("#battleBtn").textContent = selectedMode === "trial" ? "開始試煉 →" : "開始討伐 →";
}

function scaleIntent(move) {
  const difficulty = difficulties[selectedDifficulty];
  const scaled = clone(move);
  if (scaled.damage) scaled.damage = Math.round(scaled.damage * difficulty.damage);
  if (scaled.block) scaled.block = Math.round(scaled.block * difficulty.block);
  scaled.text = [
    scaled.damage ? `基礎攻擊 ${scaled.damage}${scaled.hits ? ` × ${scaled.hits}` : ""}` : "",
    scaled.block ? `護盾 ${scaled.block}` : "",
    scaled.heal ? `治療 ${scaled.heal}` : "",
    scaled.strength ? `劍勢 +${scaled.strength}` : "",
    scaled.burn ? `灼燒 ${scaled.burn}` : "",
    scaled.poison ? `中毒 ${scaled.poison}` : "",
    scaled.bleed ? `流血 ${scaled.bleed}` : "",
    scaled.weak ? `弱化 ${scaled.weak}` : "",
    scaled.vuln ? `破綻 ${scaled.vuln}` : "",
    scaled.drawPenalty ? `抽牌 -${scaled.drawPenalty}` : "",
    scaled.limitPenalty ? `出牌上限 -${scaled.limitPenalty}` : "",
    scaled.energyDrain ? `星能 -${scaled.energyDrain}` : "",
    scaled.bonusUnblocked ? `無盾增傷 ${scaled.bonusUnblocked}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return scaled;
}

function chooseIntent() {
  const moves = selectedVillain.moves;
  if (round % 5 === 0) return scaleIntent(moves[moves.length - 1]);
  if (round > 2 && round % 3 === 0) return scaleIntent(moves[2] || moves[0]);
  return scaleIntent(pick(moves.slice(0, Math.min(3, moves.length))));
}

function startBattle(continuingTrial = false) {
  if (
    !selectedFighter ||
    !selectedVillain ||
    selectedSupports.length !== selectedFighter.supportSlots
  )
    return;
  battleGeneration++;
  if (!continuingTrial) {
    trial =
      selectedMode === "trial"
        ? {
            stage: 0,
            route: [
              selectedVillain,
              ...shuffle(villains.filter((v) => v.id !== selectedVillain.id)).slice(0, 2),
            ],
            fields: shuffle([...fields]).slice(0, 3),
            hp: selectedFighter.hp,
            energy: selectedFighter.initialEnergy,
            powerBonus: 0,
            guardBonus: 0,
            maxHpBonus: 0,
            startEnergyBonus: 0,
            openingAp: 0,
            cards: [],
            rewards: [],
            rounds: 0,
            damage: 0,
            played: 0,
          }
        : null;
  }
  if (trial) selectedVillain = trial.route[trial.stage];
  currentField = trial ? trial.fields[trial.stage] : null;
  const maxHp = selectedFighter.hp + (trial?.maxHpBonus || 0);
  player = {
    ...clone(selectedFighter),
    maxHp,
    hp: trial ? trial.hp : maxHp,
    power: selectedFighter.power + (trial?.powerBonus || 0),
    guard: selectedFighter.guard + (trial?.guardBonus || 0),
    energy: trial
      ? clamp(trial.energy + trial.startEnergyBonus, 0, 100)
      : selectedFighter.initialEnergy,
    block: 0,
    burn: 0,
    poison: 0,
    bleed: 0,
    vulnerable: 0,
    weak: 0,
    strength: 0,
    counter: 0,
    summon: null,
    regen: 0,
    ward: 0,
    drawPenalty: 0,
    limitPenalty: 0,
    played: 0,
  };
  const difficulty = difficulties[selectedDifficulty];
  enemy = {
    ...clone(selectedVillain),
    maxHp: Math.round(selectedVillain.hp * difficulty.hp),
    hp: Math.round(selectedVillain.hp * difficulty.hp),
    block: 0,
    burn: 0,
    poison: 0,
    bleed: 0,
    vulnerable: 0,
    weak: 0,
    strength: 0,
    counter: 0,
    stunned: 0,
  };
  const supportCards = selectedSupports.map((id) =>
    clone(supportSkills.find((skill) => skill.id === id)),
  );
  drawPile = shuffle([
    ...clone(selectedFighter.cards),
    ...supportCards,
    ...clone(trial?.cards || []),
  ]);
  discardPile = [];
  hand = [];
  round = 1;
  ap = player.ap + (trial?.openingAp || 0);
  if (player.id === "jade") player.block += 24;
  if (currentField?.id === "spring") player.block += 70;
  if (currentField?.id === "fire") {
    player.strength += 12;
    enemy.strength += 12;
  }
  if (currentField?.id === "mist") player.handSize = Math.min(9, player.handSize + 1);
  if (currentField?.id === "iron") {
    enemy.block = 90;
    player.guard += 20;
  }
  battleOver = false;
  busy = false;
  cardsPlayed = 0;
  cardsThisTurn = 0;
  attacksThisTurn = 0;
  totalDamage = 0;
  firstDefenseUsed = false;
  firstSpellUsed = false;
  phaseTriggered = false;
  $("#battleLog").innerHTML = "";
  $("#logPanel").classList.remove("open");
  $("#logToggle").setAttribute("aria-expanded", "false");
  $("#turnLabel").textContent = "你的回合";
  $("#encounterInfo").hidden = !trial;
  $("#encounterInfo").textContent = trial
    ? `試煉 ${trial.stage + 1} / 3 · ${currentField.name} ⓘ`
    : "";
  $("#encounterInfo").title = currentField?.desc || "";
  $("#playerPortrait").src = player.image;
  $("#playerName").textContent = player.name;
  $("#playerTitle").textContent = `${player.className}｜${player.title}`;
  $("#enemyPortrait").src = enemy.image;
  $("#enemyName").textContent = enemy.name;
  $("#enemyTitle").textContent = enemy.title;
  $("#battleTitle").textContent = enemy.realm;
  $("#battleScreen .battle-bg").style.backgroundImage = `url("${enemy.background}")`;
  currentIntent = chooseIntent();
  addLog(
    `${player.name} 進入「${enemy.realm}」，挑戰 ${enemy.name}｜${difficulty.label}難度。`,
    "system",
  );
  addLog(
    `角色規則：${player.ap} 行動點、每回合抽 ${player.handSize} 張、最多使用 ${player.cardLimit} 張、初始星能 ${player.initialEnergy}。`,
    "system",
  );
  if (currentField) addLog(`場地「${currentField.name}」：${currentField.desc}`, "system");
  if (trial?.rewards.length) addLog(`攜帶秘寶與獎勵：${trial.rewards.join("、")}`, "system");
  drawTo(player.handSize);
  renderBattle();
  showScreen("battleScreen");
  Spectacle.start();
}

function drawOne() {
  if (!drawPile.length) {
    if (!discardPile.length) return;
    drawPile = shuffle(discardPile.splice(0));
    addLog("棄牌堆重新洗入牌庫。", "system");
  }
  if (hand.length < 9) hand.push(drawPile.pop());
}

function drawCards(amount) {
  for (let i = 0; i < amount; i++) drawOne();
}

function drawTo(amount) {
  while (hand.length < amount && (drawPile.length || discardPile.length)) drawOne();
}

function renderBattle() {
  const hpRatio = player.hp / player.maxHp;
  $("#battleScreen").classList.toggle("danger-low", hpRatio <= 0.5 && hpRatio > 0.25);
  $("#battleScreen").classList.toggle("danger-critical", hpRatio <= 0.25);
  $("#difficultyChip").textContent = difficulties[selectedDifficulty].label;
  $("#roundNum").textContent = round;
  $("#apValue").textContent = ap;
  $("#turnRule").textContent =
    `本回合 ${cardsThisTurn} / ${Math.max(1, player.cardLimit - player.limitPenalty)} 張｜手牌 ${hand.length}`;
  $("#deckCount").textContent = drawPile.length;
  $("#discardCount").textContent = discardPile.length;
  $("#playerHpText").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  $("#enemyHpText").textContent = `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;
  $("#playerEnergyText").textContent = `${Math.floor(player.energy)} / 100`;
  $("#playerHpBar").style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
  $("#enemyHpBar").style.width = `${clamp((enemy.hp / enemy.maxHp) * 100, 0, 100)}%`;
  $("#playerEnergyBar").style.width = `${clamp(player.energy, 0, 100)}%`;
  $("#intentName").textContent = currentIntent.name;
  $("#intentValue").textContent = `${currentIntent.icon} ${currentIntent.text}`;
  $("#playerStatus").textContent = player.block
    ? `護盾 ${Math.ceil(player.block)}`
    : `${player.className} · ${cardsThisTurn}/${Math.max(1, player.cardLimit - player.limitPenalty)}`;
  $("#enemyStatus").textContent = enemy.stunned
    ? "封鎖"
    : enemy.burn
      ? `灼燒 ${enemy.burn}`
      : enemy.poison
        ? `中毒 ${enemy.poison}`
        : enemy.block
          ? `護盾 ${Math.ceil(enemy.block)}`
          : "敵意";
  $("#playerBuffs").innerHTML = buffMarkup(player);
  $("#enemyBuffs").innerHTML = buffMarkup(enemy);
  $("#supportMini").innerHTML =
    `支援牌：${selectedSupports.map((id) => supportSkills.find((skill) => skill.id === id).icon).join(" ")} <b>${selectedSupports.length}</b>`;
  $("#endTurnBtn").disabled = busy || battleOver;
  renderHand();
}

function buffMarkup(unit) {
  const buffs = [];
  if (unit.block)
    buffs.push({
      icon: "⬡",
      name: "護盾",
      value: Math.ceil(unit.block),
      type: "positive",
      tip: "優先吸收下一次傷害",
    });
  if (unit.strength)
    buffs.push({
      icon: "▲",
      name: "劍勢",
      value: `+${unit.strength}`,
      type: "positive",
      tip: "提高每次攻擊的傷害",
    });
  if (unit.counter)
    buffs.push({
      icon: "↶",
      name: "反擊",
      value: unit.counter,
      type: "positive",
      tip: "下次受擊後反擊",
    });
  if (unit.summon)
    buffs.push({
      icon: "獸",
      name: "召喚",
      value: unit.summon.turns,
      type: "positive",
      tip: "回合開始時自動攻擊",
    });
  if (unit.regen)
    buffs.push({
      icon: "春",
      name: "再生",
      value: unit.regen,
      type: "positive",
      tip: "回合開始時恢復生命",
    });
  if (unit.ward)
    buffs.push({
      icon: "命",
      name: "逆命",
      value: unit.ward,
      type: "positive",
      tip: "抵擋一次致命傷害",
    });
  if (unit.burn)
    buffs.push({
      icon: "♨",
      name: "灼燒",
      value: unit.burn,
      type: "negative",
      tip: "每回合受到持續傷害並衰減",
    });
  if (unit.poison)
    buffs.push({
      icon: "毒",
      name: "中毒",
      value: unit.poison,
      type: "negative",
      tip: "每回合受到持續傷害，不易衰減",
    });
  if (unit.bleed)
    buffs.push({
      icon: "血",
      name: "流血",
      value: unit.bleed,
      type: "negative",
      tip: "使用卡牌時受到傷害",
    });
  if (unit.vulnerable)
    buffs.push({
      icon: "◇",
      name: "破綻",
      value: unit.vulnerable,
      type: "negative",
      tip: "受到的傷害提高 22%",
    });
  if (unit.weak)
    buffs.push({
      icon: "▽",
      name: "弱化",
      value: unit.weak,
      type: "negative",
      tip: "造成的傷害降低 28%",
    });
  return buffs
    .map(
      (buff) =>
        `<span class="buff ${buff.type}" title="${buff.tip}"><i>${buff.icon}</i><b>${buff.name}</b><em>${buff.value}</em></span>`,
    )
    .join("");
}

const cardTypeMeta = {
  攻擊: { slug: "attack", icon: "⚔" },
  盾擊: { slug: "shield-strike", icon: "盾" },
  防禦: { slug: "defense", icon: "⬡" },
  術法: { slug: "spell", icon: "✦" },
  持續: { slug: "aura", icon: "∞" },
  反擊: { slug: "counter", icon: "↶" },
  召喚: { slug: "summon", icon: "獸" },
  回復: { slug: "heal", icon: "✚" },
  異常: { slug: "status", icon: "◇" },
  連擊: { slug: "combo", icon: "≋" },
  戰術: { slug: "tactic", icon: "◎" },
  終結: { slug: "ultimate", icon: "☄" },
};

function cardEffectBadges(item) {
  const effects = [];
  if (item.damage)
    effects.push({
      icon: "⚔",
      value: item.hits ? `${item.damage} × ${item.hits}` : item.damage,
      label: item.magic ? "術法傷害" : "基礎傷害",
    });
  if (item.shieldDamage)
    effects.push({
      icon: "盾",
      value: `${Math.round(item.shieldDamage * 100)}%`,
      label: "護盾轉傷",
    });
  if (item.block) effects.push({ icon: "⬡", value: item.block, label: "基礎護盾" });
  if (item.heal) effects.push({ icon: "♥", value: item.heal, label: "生命回復" });
  if (item.energyGain) effects.push({ icon: "✦", value: `+${item.energyGain}`, label: "獲得星能" });
  if (item.energyCost) effects.push({ icon: "✦", value: `-${item.energyCost}`, label: "消耗星能" });
  if (item.draw) effects.push({ icon: "▣", value: `+${item.draw}`, label: "抽取卡牌" });
  if (item.apGain) effects.push({ icon: "●", value: `+${item.apGain}`, label: "獲得行動力" });
  if (item.burn) effects.push({ icon: "炎", value: item.burn, label: "施加灼燒" });
  if (item.poison) effects.push({ icon: "毒", value: item.poison, label: "施加中毒" });
  if (item.bleed) effects.push({ icon: "血", value: item.bleed, label: "施加流血" });
  if (item.vuln) effects.push({ icon: "破", value: item.vuln, label: "施加破綻" });
  if (item.weak) effects.push({ icon: "弱", value: item.weak, label: "施加弱化" });
  if (item.counter) effects.push({ icon: "↶", value: item.counter, label: "反擊傷害" });
  if (item.summon)
    effects.push({ icon: "獸", value: `${item.summon.turns} 回合`, label: "召喚持續" });
  if (item.regen) effects.push({ icon: "春", value: `${item.regen} 回合`, label: "再生持續" });
  if (item.strength) effects.push({ icon: "▲", value: `+${item.strength}`, label: "永久攻擊" });
  if (item.stun) effects.push({ icon: "封", value: item.stun, label: "封鎖回合" });
  if (item.cleanse) effects.push({ icon: "淨", value: "全部", label: "清除異常" });
  if (item.ward) effects.push({ icon: "命", value: item.ward, label: "抵擋致命傷" });
  return effects.slice(0, 4);
}

function renderHand() {
  const limit = Math.max(1, player.cardLimit - player.limitPenalty);
  $("#hand").innerHTML = hand
    .map((item, index) => {
      const noEnergy = (item.energyCost || 0) > player.energy;
      const resolving = busy && !battleOver && $("#turnLabel").textContent === "你的回合";
      const reason = battleOver
        ? "戰鬥已結束"
        : busy
          ? resolving
            ? "術式施放中"
            : "等待敵方行動"
          : cardsThisTurn >= limit
            ? `已達本回合 ${limit} 張上限`
            : item.ap > ap
              ? `還需要 ${item.ap - ap} 行動力`
              : noEnergy
                ? `還需要 ${item.energyCost - player.energy} 星能`
                : "";
      const disabled = Boolean(reason);
      const footer = item.energyCost
        ? `需要 ${item.energyCost} 星能`
        : item.energyGain
          ? `獲得 ${item.energyGain} 星能`
          : item.source === "support"
            ? "支援術式"
            : "立即生效";
      const meta = cardTypeMeta[item.type] || { slug: "tactic", icon: "✦" };
      const effects = cardEffectBadges(item);
      return `<article class="battle-card card-kind-${meta.slug} ${item.ultimate ? "ultimate" : ""} ${item.source === "support" ? "support-card-in-hand" : ""} ${disabled ? "disabled" : ""} ${resolving ? "resolving" : ""}" data-index="${index}" data-type="${item.type}" role="button" tabindex="0" aria-label="使用${item.name}，${item.ap} AP${reason ? `，${reason}` : ""}" style="--card:${item.color}">
      <header class="card-head"><span class="card-type"><i>${meta.icon}</i>${item.type}</span><b class="card-cost" title="行動力消耗"><span>${item.ap}</span><small>AP</small></b></header>
      <div class="card-visual"><span class="card-rune">${item.icon}</span><i></i><i></i></div>
      <div class="card-name"><h4>${item.name}</h4>${item.source === "support" ? "<em>支援</em>" : ""}</div>
      <div class="card-effect-grid">${effects.map((effect) => `<span title="${effect.label}"><i>${effect.icon}</i><b>${effect.value}</b><small>${effect.label}</small></span>`).join("")}</div>
      <p>${item.desc}</p><footer>${footer}<button class="card-info-btn" data-card-info="${index}" aria-label="查看${item.name}說明">ⓘ</button></footer>
      ${reason ? `<div class="card-lock"><b>暫時無法使用</b><small>${reason}</small></div>` : ""}
    </article>`;
    })
    .join("");
  $$(".battle-card").forEach((node) => (node.onclick = () => playCard(Number(node.dataset.index))));
  $$("[data-card-info]").forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        openCardDetail(Number(button.dataset.cardInfo));
      }),
  );
}

function openCardDetail(index) {
  const item = hand[index];
  if (!item) return;
  detailIndex = index;
  $("#playDetailCard").hidden = false;
  $("#cardDetailName").textContent = item.name;
  const badges = cardEffectBadges(item);
  $("#cardDetailBody").innerHTML =
    `<p class="detail-type">${item.type} · ${item.ap} AP${item.energyCost ? ` · ${item.energyCost} 星能` : ""}</p><p>${item.desc}</p><div class="detail-effects">${badges.map((e) => `<span>${e.icon} ${e.label} <b>${e.value}</b></span>`).join("")}</div><small>傷害與護盾的實際數值，會受角色數值、敵方護甲及狀態影響。</small>`;
  $("#playDetailCard").disabled =
    busy ||
    battleOver ||
    item.ap > ap ||
    (item.energyCost || 0) > player.energy ||
    cardsThisTurn >= Math.max(1, player.cardLimit - player.limitPenalty);
  $("#cardDetailModal").classList.add("open");
  $("#cardDetailModal").setAttribute("aria-hidden", "false");
  $("#closeCardDetail").focus();
}

function closeCardDetail() {
  $("#cardDetailModal").classList.remove("open");
  $("#cardDetailModal").setAttribute("aria-hidden", "true");
  const index = detailIndex;
  detailIndex = null;
  if (index !== null) $(`#hand [data-index="${index}"]`)?.focus();
}

function dealDamage(target, amount, source, options = {}) {
  let damage = amount;
  if (source === player) {
    damage = Math.round((damage * player.power) / 100);
    damage += player.strength;
    if (player.weak) damage = Math.round(damage * 0.72);
    if (enemy.vulnerable) damage = Math.round(damage * 1.22);
    if (player.id === "ember" && enemy.burn) damage = Math.round(damage * 1.18);
    if (player.id === "ember" && player.hp / player.maxHp < 0.5) damage = Math.round(damage * 1.25);
    if (player.id === "shadow" && attacksThisTurn === 0) damage = Math.round(damage * 1.6);
    if (!options.magic) damage = Math.max(1, Math.round(damage * (1 - enemy.armor)));
  } else {
    damage += enemy.strength;
    if (enemy.weak) damage = Math.round(damage * 0.72);
    if (player.vulnerable) damage = Math.round(damage * 1.22);
    if (options.bonusUnblocked && player.block <= 0) damage += options.bonusUnblocked;
  }
  const absorbed = Math.min(target.block, damage);
  target.block -= absorbed;
  let actual = damage - absorbed;
  if (target === player && actual >= player.hp && player.ward) {
    actual = Math.max(0, player.hp - 1);
    player.ward--;
    addLog("逆命護符碎裂，抵擋了致命傷害！", "system");
  }
  target.hp = clamp(target.hp - actual, 0, target.maxHp);
  if (absorbed) Spectacle.absorb(target === enemy ? "enemy" : "player", absorbed);
  if (target === player && damage > 0 && player.counter) {
    const counter = player.counter;
    player.counter = 0;
    enemy.hp = clamp(enemy.hp - counter, 0, enemy.maxHp);
    totalDamage += counter;
    animateUnit(".enemy-unit .unit-art", "hit", counter);
    addLog(`反擊造成 ${counter} 點傷害。`, "player");
  }
  animateUnit(
    target === enemy ? ".enemy-unit .unit-art" : ".player-unit .unit-art",
    "hit",
    actual || `盾-${absorbed}`,
  );
  return { actual, absorbed };
}

function playCard(index) {
  if (busy || battleOver) return;
  const item = hand[index];
  if (!item) return;
  const limit = Math.max(1, player.cardLimit - player.limitPenalty);
  if (cardsThisTurn >= limit) return toast(`${player.name} 本回合最多使用 ${limit} 張牌`);
  if (item.ap > ap) return toast("行動點不足");
  if ((item.energyCost || 0) > player.energy) return toast(`需要 ${item.energyCost} 星能`);

  const visualBefore = Spectacle.attack(item, player);
  ap -= item.ap;
  player.energy = clamp(player.energy - (item.energyCost || 0) + (item.energyGain || 0), 0, 100);
  animateUnit(".player-unit .unit-art", "cast", item.icon);
  let dealt = 0;
  const isAttack = Boolean(item.damage);
  const hits = item.hits || 1;
  const shieldDamage = item.shieldDamage ? Math.ceil(player.block * item.shieldDamage) : 0;
  if (shieldDamage) {
    player.block -= shieldDamage;
    addLog(`玄甲震擊：消耗 ${shieldDamage} 護盾，轉為額外基礎傷害。`, "player");
  }
  if (item.damage) {
    for (let i = 0; i < hits; i++)
      dealt += dealDamage(enemy, item.damage + shieldDamage, player, { magic: item.magic }).actual;
  }
  if (item.block) {
    let block = Math.round((item.block * player.guard) / 100);
    if (player.id === "azure" && !firstDefenseUsed) {
      block += 30;
      firstDefenseUsed = true;
      addLog("觀測演算生效：額外獲得 30 護盾。", "system");
    }
    player.block += block;
  }
  if (item.heal)
    player.hp = clamp(
      player.hp + Math.round(item.heal * (player.id === "jade" ? 1.15 : 1)),
      0,
      player.maxHp,
    );
  if (item.selfDamage) player.hp = clamp(player.hp - item.selfDamage, 1, player.maxHp);
  if (item.strength) player.strength += item.strength;
  if (item.counter) player.counter += item.counter;
  if (item.regen) player.regen = Math.max(player.regen, item.regen);
  if (item.ward) player.ward += item.ward;
  if (item.summon) player.summon = clone(item.summon);
  if (item.cleanse) {
    player.burn = player.poison = player.bleed = player.vulnerable = player.weak = 0;
  }
  if (item.burn) enemy.burn += item.burn;
  if (item.poison) enemy.poison += item.poison;
  if (item.bleed) enemy.bleed += item.bleed;
  if (item.vuln) enemy.vulnerable += item.vuln;
  if (item.weak) enemy.weak += item.weak;
  if (item.stun) enemy.stunned += item.stun;
  if (item.stealBlock && enemy.block) {
    const stolen = Math.ceil(enemy.block * 0.5);
    enemy.block -= stolen;
    player.block += stolen;
  }
  if (item.apGain) ap += item.apGain;
  if (item.draw) drawCards(item.draw);

  if (player.id === "azure" && isAttack && attacksThisTurn === 0)
    player.energy = clamp(player.energy + 8, 0, 100);
  if (player.id === "frost" && isAttack && attacksThisTurn === 0) enemy.vulnerable += 1;
  if (isAttack) attacksThisTurn++;
  if (player.id === "frost" && isAttack && attacksThisTurn === 2) {
    const bonus = dealDamage(enemy, 45, player, {}).actual;
    dealt += bonus;
    addLog(`追月連矢追加 ${bonus} 點傷害。`, "player");
  }
  if (player.id === "lunar" && item.type === "術法" && !firstSpellUsed) {
    ap += 1;
    firstSpellUsed = true;
    addLog("法力折返：返還 1 點行動力。", "system");
  }

  const played = hand.splice(index, 1)[0];
  if (!played.exhaust) discardPile.push(played);
  cardsPlayed++;
  cardsThisTurn++;
  player.played++;
  if (player.bleed) {
    const bleedDamage = player.bleed * 10;
    player.hp = clamp(player.hp - bleedDamage, 0, player.maxHp);
    animateUnit(".player-unit .unit-art", "hit", bleedDamage);
    addLog(`流血使你在出牌後受到 ${bleedDamage} 傷害。`, "enemy");
  }
  if (player.id === "lunar" && player.played % 3 === 0) {
    drawCards(1);
    addLog("月相輪轉：自動抽 1 張牌。", "system");
  }
  if (player.id === "shadow" && cardsThisTurn % 3 === 0) {
    ap += 1;
    addLog("影步循環：返還 1 點行動力。", "system");
  }
  addLog(`${player.name} 使用「${item.name}」${dealt ? `，造成 ${dealt} 傷害` : ""}。`, "player");
  totalDamage += dealt;
  Spectacle.outcome(visualBefore, player, "player", item, dealt);
  busy = true;
  renderBattle();
  if (!checkEnd())
    scheduleBattle(
      () => {
        busy = false;
        renderBattle();
      },
      Spectacle.calm() ? 180 : item.ultimate ? 1050 : 520,
    );
}

function endPlayerTurn() {
  if (busy || battleOver) return;
  busy = true;
  closeCardDetail();
  player.limitPenalty = 0;
  if (player.weak) player.weak--;
  if (player.vulnerable) player.vulnerable--;
  if (player.bleed) player.bleed--;
  $("#turnLabel").textContent = `${enemy.name} 行動`;
  discardPile.push(...hand.splice(0));
  renderBattle();
  scheduleBattle(enemyTurn, 500);
}

function enemyTurn() {
  if (battleOver) return;
  if (enemy.stunned) {
    enemy.stunned--;
    addLog(`${enemy.name} 被封鎖，本回合無法行動。`, "enemy");
    Spectacle.announce("敵方行動", "封印生效", `${enemy.name} 無法行動。`, "#b3a6df", true);
  } else {
    const visualBefore = Spectacle.attack(currentIntent, enemy, "enemy");
    const hits = currentIntent.hits || 1;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      if (currentIntent.damage)
        total += dealDamage(player, currentIntent.damage, enemy, {
          bonusUnblocked: currentIntent.bonusUnblocked,
        }).actual;
    }
    if (currentIntent.block) enemy.block += currentIntent.block;
    if (currentIntent.heal) enemy.hp = clamp(enemy.hp + currentIntent.heal, 0, enemy.maxHp);
    if (currentIntent.strength) enemy.strength += currentIntent.strength;
    if (currentIntent.burn) player.burn += currentIntent.burn;
    if (currentIntent.poison) player.poison += currentIntent.poison;
    if (currentIntent.bleed) player.bleed += currentIntent.bleed;
    if (currentIntent.weak) player.weak += currentIntent.weak;
    if (currentIntent.vuln) player.vulnerable += currentIntent.vuln;
    if (currentIntent.energyDrain)
      player.energy = Math.max(0, player.energy - currentIntent.energyDrain);
    if (currentIntent.drawPenalty)
      player.drawPenalty = Math.max(player.drawPenalty, currentIntent.drawPenalty);
    if (currentIntent.limitPenalty)
      player.limitPenalty = Math.max(player.limitPenalty, currentIntent.limitPenalty);
    addLog(
      `${enemy.name} 使用「${currentIntent.name}」${total ? `，造成 ${total} 傷害` : ""}。`,
      "enemy",
    );
    Spectacle.outcome(visualBefore, enemy, "enemy", currentIntent, total);
    if (enemy.bleed) {
      const amount = enemy.bleed * 10;
      enemy.hp = clamp(enemy.hp - amount, 0, enemy.maxHp);
      totalDamage += amount;
      addLog(`流血使 ${enemy.name} 在行動後受到 ${amount} 傷害。`, "player");
    }
  }
  if (selectedVillain.id === "prison" && round % 3 === 0) enemy.strength += 7;
  if (selectedVillain.id === "bloodmoon" && enemy.hp / enemy.maxHp < 0.5 && !phaseTriggered) {
    enemy.strength += 24;
    phaseTriggered = true;
    Spectacle.queue("nova", "enemy", "#ee819d", 0, 1.5);
    Spectacle.announce("魔相覺醒", "血月魔尊", "攻擊永久提高，留意下一回合意圖！", "#ee819d", true);
    addLog("血月魔相覺醒：血月魔尊的攻擊永久提高！", "enemy");
  }
  applyDots(enemy, "enemy");
  applyDots(player, "player");
  if (checkEnd()) return;
  scheduleBattle(nextRound, 540);
}

function applyDots(unit, side) {
  let damage = 0;
  if (unit.burn) {
    damage += unit.burn * 22;
    unit.burn = Math.max(0, unit.burn - 1);
  }
  if (unit.poison) damage += unit.poison * 16;
  if (damage) {
    unit.hp = clamp(unit.hp - damage, 0, unit.maxHp);
    animateUnit(
      side === "player" ? ".player-unit .unit-art" : ".enemy-unit .unit-art",
      "hit",
      damage,
    );
    Spectacle.queue("impact", side, unit.poison ? "#9ad78a" : "#f3a06c", 0, 0.75);
    addLog(`${unit.name} 受到 ${damage} 點持續傷害。`, side === "player" ? "enemy" : "player");
  }
}

function nextRound() {
  if (battleOver) return;
  if (player.id === "jade") player.block = Math.round(player.block * 0.35);
  else player.block = 0;
  enemy.block = 0;
  if (enemy.vulnerable) enemy.vulnerable--;
  if (enemy.weak) enemy.weak--;
  if (enemy.bleed) enemy.bleed = Math.max(0, enemy.bleed - 1);
  round++;
  ap = player.ap;
  cardsThisTurn = 0;
  attacksThisTurn = 0;
  firstDefenseUsed = false;
  firstSpellUsed = false;
  player.energy = clamp(player.energy + 7 + (currentField?.id === "stars" ? 8 : 0), 0, 100);
  if (player.id === "jade") player.block += 24;
  if (player.regen) {
    const amount = Math.round(player.maxHp * 0.06);
    player.hp = clamp(player.hp + amount, 0, player.maxHp);
    player.regen--;
    animateUnit(".player-unit .unit-art", "heal", amount);
    Spectacle.queue("heal", "player", "#91e6b5");
    addLog(`再生恢復 ${amount} 生命。`, "system");
  }
  if (player.summon) {
    Spectacle.queue("spell", "enemy", "#8de9c1");
    const damage = dealDamage(enemy, player.summon.damage, player, { magic: true }).actual;
    totalDamage += damage;
    player.summon.turns--;
    addLog(`召喚靈獸造成 ${damage} 點傷害。`, "player");
    if (player.summon.turns <= 0) player.summon = null;
    if (checkEnd()) return;
  }
  const drawAmount = Math.max(1, player.handSize - player.drawPenalty);
  drawTo(drawAmount);
  player.drawPenalty = 0;
  currentIntent = chooseIntent();
  busy = false;
  $("#turnLabel").textContent = "你的回合";
  Spectacle.announce(
    `第 ${round} 回合`,
    "你的回合",
    `行動力 ${ap} · 最多出 ${Math.max(1, player.cardLimit - player.limitPenalty)} 張牌`,
    "#a2d9e8",
  );
  renderBattle();
}

function animateUnit(selector, type, value) {
  const art = $(selector);
  art.classList.remove("hit", "cast", "heal");
  void art.offsetWidth;
  art.classList.add(type);
  Spectacle.pop(selector.includes("enemy") ? "enemy" : "player", value, type);
  const generation = battleGeneration;
  setTimeout(() => {
    if (generation === battleGeneration) art.classList.remove(type);
  }, 720);
}

function addLog(text, type = "system") {
  const row = document.createElement("div");
  row.className = `log-entry ${type}`;
  const turn = document.createElement("small");
  turn.className = "log-round";
  turn.textContent = `R${String(round).padStart(2, "0")}`;
  const message = document.createElement("span");
  message.textContent = text;
  row.append(turn, message);
  $("#battleLog").prepend(row);
  if ($("#battleLog").childElementCount > 160) $("#battleLog").lastElementChild.remove();
}

function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 1500);
}

function checkEnd() {
  if (battleOver) return true;
  if (player.hp > 0 && enemy.hp > 0) return false;
  battleOver = true;
  busy = true;
  renderBattle();
  scheduleBattle(() => finishBattle(enemy.hp <= 0 && player.hp > 0), Spectacle.finishDelay());
  return true;
}

function finishBattle(win) {
  closeCardDetail();
  if (trial) {
    trial.rounds += round;
    trial.damage += totalDamage;
    trial.played += cardsPlayed;
    trial.hp = player.hp;
    trial.energy = player.energy;
    if (win && trial.stage < 2) return showTrialRewards();
  }
  const rank = !win ? "D" : round <= 4 ? "S" : round <= 7 ? "A" : "B";
  $("#resultPortrait").src = win ? player.image : enemy.image;
  $("#resultRank").textContent = rank;
  $("#resultTitle").textContent = win
    ? trial
      ? "三界試煉・突破完成"
      : `${enemy.name}・討伐完成`
    : "契約者墜落";
  $("#resultText").textContent = trial
    ? `${win ? "你成功突破三連戰！" : `止步於第 ${trial.stage + 1} 關。`} ${trial.route.map((v) => v.name).join(" → ")}。取得獎勵：${trial.rewards.join("、") || "尚未取得"}。`
    : win
      ? `${player.name} 以 ${player.className} 的牌組淨化了「${enemy.realm}」。你可以更換術式、難度或反派再次挑戰。`
      : `${enemy.name} 擊破了牌陣。重新調整支援術式與出牌順序，再次挑戰。`;
  $("#resultStats").innerHTML =
    `<div><b>${difficulties[selectedDifficulty].label}</b><span>挑戰難度</span></div><div><b>${trial ? trial.rounds : round}</b><span>戰鬥回合</span></div><div><b>${trial ? trial.damage : totalDamage}</b><span>總傷害</span></div><div><b>${trial ? trial.played : cardsPlayed}</b><span>使用卡牌</span></div>`;
  showScreen("resultScreen");
}

function showTrialRewards() {
  selectedReward = null;
  rewardOptions = [
    rewardCatalog[0],
    ...shuffle(rewardCatalog.slice(1).filter((r) => !trial.rewards.includes(r.name))).slice(0, 2),
  ];
  $("#rewardTitle").textContent = `第 ${trial.stage + 1} 關突破 · 選擇獎勵`;
  $("#trialProgress").innerHTML =
    `<div><b>生命 ${Math.ceil(player.hp)} / ${player.maxHp}</b><span>星能 ${Math.floor(player.energy)} / 100</span></div><p>${trial.route.map((v, i) => `<span class="${i <= trial.stage ? "cleared" : ""}">${i + 1}. ${v.name}${i <= trial.stage ? " ✓" : ""}</span>`).join(" ")}</p><small>下一關：${trial.fields[trial.stage + 1].name} · ${trial.fields[trial.stage + 1].desc}</small>`;
  $("#rewardGrid").innerHTML = rewardOptions
    .map(
      (r) =>
        `<button class="reward-card glass" data-reward="${r.id}" aria-pressed="false"><span class="reward-icon">${r.icon}</span><small>${r.kind}</small><h3>${r.name}</h3><p>${r.desc}</p></button>`,
    )
    .join("");
  $("#rewardSummary").textContent = "請選擇一項獎勵";
  $("#nextTrialBtn").disabled = true;
  $$("[data-reward]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedReward = rewardOptions.find((r) => r.id === button.dataset.reward);
        $$("[data-reward]").forEach((node) => {
          node.classList.toggle("selected", node === button);
          node.setAttribute("aria-pressed", String(node === button));
        });
        $("#rewardSummary").textContent = selectedReward.name;
        $("#nextTrialBtn").disabled = false;
      }),
  );
  showScreen("rewardScreen");
}

function continueTrial() {
  if (!trial || !selectedReward || trial.stage >= 2) return;
  const r = selectedReward;
  const maxHp = selectedFighter.hp + trial.maxHpBonus;
  if (r.id === "heal") trial.hp = Math.min(maxHp, trial.hp + Math.round(maxHp * 0.4));
  if (r.id === "power") trial.powerBonus += 12;
  if (r.id === "guard") trial.guardBonus += 18;
  if (r.id === "vital") {
    trial.maxHpBonus += 150;
    trial.hp += 150;
  }
  if (r.id === "energy") trial.startEnergyBonus += 25;
  if (r.id === "ap") trial.openingAp += 1;
  if (r.card) trial.cards.push(clone(r.card));
  trial.rewards.push(r.name);
  trial.stage++;
  selectedReward = null;
  startBattle(true);
}

$("#startBtn").onclick = () => {
  renderFighters();
  showScreen("selectScreen");
};
function closeRules() {
  $("#rulesModal").classList.remove("open");
  $("#rulesModal").setAttribute("aria-hidden", "true");
}
$("#rulesBtn").onclick = () => {
  $("#rulesModal").classList.add("open");
  $("#rulesModal").setAttribute("aria-hidden", "false");
  $("#closeRules").focus();
};
$("#closeRules").onclick = () => {
  closeRules();
  $("#rulesBtn").focus();
};
$("#rulesModal").onclick = (event) => {
  if (event.target === $("#rulesModal")) closeRules();
};
$$("[data-back]").forEach((button) => (button.onclick = () => showScreen(button.dataset.back)));
$("#toSupportBtn").onclick = () => {
  supportFilter = "all";
  updateSupportFilters();
  renderSupports();
  showScreen("supportScreen");
};
$("#toChallengeBtn").onclick = () => {
  if (!selectedFighter || selectedSupports.length !== selectedFighter.supportSlots) return;
  renderVillains();
  renderDifficulty();
  updateSetupState();
  showScreen("challengeScreen");
};
$("#randomBossBtn").onclick = () => {
  selectedVillain = pick(villains);
  renderVillains();
  updateSetupState();
};
$("#battleBtn").onclick = () => startBattle();
$("#endTurnBtn").onclick = endPlayerTurn;
$("#quitBtn").onclick = () => {
  abortBattle();
  showScreen("startScreen");
};
$("#againBtn").onclick = () => {
  renderVillains();
  renderDifficulty();
  updateSetupState();
  showScreen("challengeScreen");
};
$("#homeBtn").onclick = () => {
  abortBattle();
  showScreen("startScreen");
};
function setLogOpen(open) {
  $("#logPanel").classList.toggle("open", open);
  $("#logToggle").setAttribute("aria-expanded", String(open));
  if (open) {
    $("#battleLog").scrollTop = 0;
    $("#closeLog").focus();
  }
}
$("#logToggle").onclick = () => setLogOpen(!$("#logPanel").classList.contains("open"));
$("#closeLog").onclick = () => {
  setLogOpen(false);
  $("#logToggle").focus();
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#logPanel").classList.contains("open")) {
    setLogOpen(false);
    $("#logToggle").focus();
  }
});
$("#encounterInfo").onclick = () => {
  if (!trial || !currentField) return;
  detailIndex = null;
  $("#cardDetailName").textContent = currentField.name;
  $("#cardDetailBody").innerHTML =
    `<p>${currentField.desc}</p><p>本次路線：${trial.route.map((v) => v.name).join(" → ")}</p><p>已取得：${trial.rewards.join("、") || "尚未取得獎勵"}</p><small>生命與星能會延續到下一關；新戰鬥會清除異常、劍勢、護盾及召喚狀態。秘寶則持續整場試煉。</small>`;
  $("#playDetailCard").hidden = true;
  $("#cardDetailModal").classList.add("open");
  $("#cardDetailModal").setAttribute("aria-hidden", "false");
  $("#closeCardDetail").focus();
};

function updateSupportFilters() {
  $$("[data-support-filter]").forEach((button) => {
    const active = button.dataset.supportFilter === supportFilter;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

$$("[data-support-filter]").forEach(
  (button) =>
    (button.onclick = () => {
      supportFilter = button.dataset.supportFilter;
      updateSupportFilters();
      renderSupports();
      $("#supportGrid").scrollTop = 0;
    }),
);
$("#clearSupportsBtn").onclick = () => {
  selectedSupports = [];
  renderSupports();
  updateSetupState();
};
$$("[data-mode]").forEach(
  (button) =>
    (button.onclick = () => {
      selectedMode = button.dataset.mode;
      $$("[data-mode]").forEach((node) => {
        node.classList.toggle("selected", node === button);
        node.setAttribute("aria-pressed", String(node === button));
      });
      updateSetupState();
    }),
);
$("#nextTrialBtn").onclick = continueTrial;
$("#closeCardDetail").onclick = closeCardDetail;
$("#cardDetailModal").onclick = (event) => {
  if (event.target.id === "cardDetailModal") closeCardDetail();
};
$("#playDetailCard").onclick = () => {
  const index = detailIndex;
  closeCardDetail();
  if (index !== null) playCard(index);
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCardDetail();
    closeRules();
    $("#logPanel").classList.remove("open");
  }
  const modal = $(".modal.open");
  if (modal && event.key === "Tab") {
    const targets = [...modal.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(
      (node) => node.getClientRects().length,
    );
    const first = targets[0],
      last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches('article[role="button"]')
  ) {
    event.preventDefault();
    const target = event.target;
    const selector = target.dataset.id
      ? `.${target.classList[0]}[data-id="${target.dataset.id}"]`
      : `.battle-card[data-index="${target.dataset.index}"]`;
    target.click();
    $(selector)?.focus();
  }
});

renderFighters();
renderDifficulty();
