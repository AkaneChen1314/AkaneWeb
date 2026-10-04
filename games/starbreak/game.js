/* 星夜突圍 v1.2 · Blue World r11 — 戰場外 Boss 狀態列與返回休息整合。 */
"use strict";
(() => {
  const VERSION = 1,
    // VERSION 是存檔格式，不是畫面版本；保留原值，避免破壞舊備份。
    KEY = "starbreak-save-v1",
    RUNKEY = "starbreak-run-v1";
  // 1. 遊戲資料：武器、星艦、敵人、難度與航行規則。
  const WEAPONS = {
    pulse: {
      name: "脈衝連射",
      evo: "雙子湮滅炮",
      icon: "⌁",
      color: "#91f5e4",
      type: "projectile",
      interval: 0.72,
      damage: 18,
      speed: 570,
      req: "fire",
      need: 2,
      desc: "自動瞄準最近敵人；升級增加傷害、射速與穿透。",
      evoDesc: "一次射出三束穿透脈衝。",
    },
    orbit: {
      name: "軌道刃",
      evo: "星環絞碎者",
      icon: "◎",
      color: "#b6a2ff",
      type: "orbit",
      interval: 0.38,
      damage: 11,
      req: "armor",
      need: 2,
      desc: "環繞星艦的能量刃；適合貼近敵群持續切割。",
      evoDesc: "雙重旋轉星環，擴大半徑並減速敵人。",
    },
    lightning: {
      name: "連鎖電弧",
      evo: "雷霆網路",
      icon: "ϟ",
      color: "#ffe38d",
      type: "lightning",
      interval: 1.85,
      damage: 24,
      req: "crit",
      need: 2,
      desc: "瞬間擊中敵人，接著跳躍至附近目標。",
      evoDesc: "連鎖次數加倍，單次電弧傷害提高。",
    },
    nova: {
      name: "震盪新星",
      evo: "零點超新星",
      icon: "✺",
      color: "#ff94c7",
      type: "nova",
      interval: 4.4,
      damage: 34,
      req: "hp",
      need: 2,
      desc: "定時釋放範圍衝擊，推開周圍的敵人。",
      evoDesc: "巨大衝擊波，範圍內敵人暈眩。",
    },
    missile: {
      name: "追獵導彈",
      evo: "蜂巢天火",
      icon: "⋈",
      color: "#ffb276",
      type: "missile",
      interval: 2.6,
      damage: 40,
      speed: 300,
      req: "damage",
      need: 2,
      desc: "發射追蹤導彈，命中時造成範圍爆炸。",
      evoDesc: "每次發射四枚導彈，爆炸留下燃燒區。",
    },
    frost: {
      name: "冰晶散射",
      evo: "永夜冰河",
      icon: "❄",
      color: "#8dcfff",
      type: "frost",
      interval: 1.85,
      damage: 12,
      speed: 370,
      req: "magnet",
      need: 2,
      desc: "扇形射出冰晶，命中時減緩敵人移動。",
      evoDesc: "環形冰晶風暴，凍結低血量敵人。",
    },
  };
  const WEAPON_LOADOUTS = {
    pulse: {
      hp: 0,
      role: "持續單點",
      advantage: "射程長、持續輸出穩定",
      cost: "早期清群較慢，需要走位拉開距離",
    },
    orbit: {
      hp: 10,
      role: "近身防守",
      advantage: "環繞傷害、生命配置 +10",
      cost: "射程短，要靠近敵群，移動時注意接觸傷害",
    },
    lightning: {
      hp: -15,
      role: "連鎖爆發",
      advantage: "瞬間命中，多目標連鎖",
      cost: "生命配置 −15；少量目標時收益下降",
    },
    nova: {
      hp: 6,
      role: "範圍震退",
      advantage: "範圍爆發與推開敵人、生命配置 +6",
      cost: "攻擊間隔較長，需等待下一次震盪",
    },
    missile: {
      hp: -10,
      role: "追蹤爆破",
      advantage: "追蹤與爆炸，單發威力高",
      cost: "生命配置 −10；發射較慢，導彈需要飛行時間",
    },
    frost: {
      hp: 5,
      role: "減速控制",
      advantage: "扇形減速、生命配置 +5",
      cost: "單發傷害較低，打高血量目標較慢",
    },
  };
  const DIFFICULTIES = [
    {
      id: -1,
      name: "休閒",
      title: "輕鬆探索",
      color: "#8ce6c1",
      hp: 0.8,
      speed: 0.9,
      damage: 0.7,
      spawn: 0.8,
      shot: 0.85,
      warning: 1.25,
      elite: 0.5,
      bossHp: 0.8,
      heal: 0.12,
      reward: 0.85,
      desc: "敵人較慢、傷害較低，預警更長，適合熟悉操作與構築。",
    },
    {
      id: 0,
      name: "標準",
      title: "均衡遠征",
      color: "#8cf5e8",
      hp: 1,
      speed: 1,
      damage: 1,
      spawn: 1,
      shot: 1,
      warning: 1,
      elite: 1,
      bossHp: 1,
      heal: 0.08,
      reward: 1,
      desc: "原始節奏與補給，適合第一次完整遠征。",
    },
    {
      id: 1,
      name: "困難",
      title: "精準走位",
      color: "#ffc087",
      hp: 1.2,
      speed: 1.07,
      damage: 1.15,
      spawn: 1.12,
      shot: 1.08,
      warning: 0.95,
      elite: 1.25,
      bossHp: 1.2,
      heal: 0.07,
      reward: 1.2,
      desc: "敵人更耐打、火網加快，需留意衝刺時機。",
    },
    {
      id: 2,
      name: "噩夢",
      title: "持續施壓",
      color: "#c5a0ff",
      hp: 1.4,
      speed: 1.13,
      damage: 1.3,
      spawn: 1.25,
      shot: 1.16,
      warning: 0.9,
      elite: 1.5,
      bossHp: 1.4,
      heal: 0.06,
      reward: 1.45,
      desc: "增援與精英增加，預警縮短，補給回復減少。",
    },
    {
      id: 3,
      name: "深淵",
      title: "高壓獵場",
      color: "#ff91a8",
      hp: 1.6,
      speed: 1.2,
      damage: 1.5,
      spawn: 1.4,
      shot: 1.24,
      warning: 0.85,
      elite: 1.8,
      bossHp: 1.6,
      heal: 0.05,
      reward: 1.7,
      desc: "高速追擊與密集火網，優先取得控制與防禦。",
    },
    {
      id: 4,
      name: "災厄",
      title: "極限生存",
      color: "#ff647d",
      hp: 1.8,
      speed: 1.28,
      damage: 1.75,
      spawn: 1.6,
      shot: 1.32,
      warning: 0.8,
      elite: 2.1,
      bossHp: 1.8,
      heal: 0.04,
      reward: 2,
      desc: "高傷害、快速彈幕與短預警，留給熟悉構築的駕駛。",
    },
  ];
  function difficultyRule(r) {
    return DIFFICULTIES.find((d) => d.id === r.difficulty) || DIFFICULTIES[1];
  }
  // 六檔難度的 Boss 基礎性格；實際耐久由出場時的等級與裝備計算。
  const BOSS_PROFILES = [
    {
      bossHp: 0.75,
      bossRate: 0.88,
      bossDensity: 0.8,
      bossLayers: 1,
      bossShield: 0.12,
      bossPressure: 1,
      bossArmor: 0,
      hitInv: 0.75,
      guardInterval: 17,
      guards: 1,
    },
    {
      bossHp: 1,
      bossRate: 1,
      bossDensity: 1,
      bossLayers: 1,
      bossShield: 0.2,
      bossPressure: 1.12,
      bossArmor: 0.03,
      hitInv: 0.72,
      guardInterval: 15,
      guards: 2,
    },
    {
      bossHp: 1.3,
      bossRate: 1.18,
      bossDensity: 1.18,
      bossLayers: 2,
      bossShield: 0.27,
      bossPressure: 1.28,
      bossArmor: 0.06,
      hitInv: 0.66,
      guardInterval: 13,
      guards: 3,
    },
    {
      bossHp: 1.65,
      bossRate: 1.4,
      bossDensity: 1.36,
      bossLayers: 2,
      bossShield: 0.34,
      bossPressure: 1.46,
      bossArmor: 0.1,
      hitInv: 0.59,
      guardInterval: 11,
      guards: 4,
    },
    {
      bossHp: 2.05,
      bossRate: 1.65,
      bossDensity: 1.55,
      bossLayers: 3,
      bossShield: 0.42,
      bossPressure: 1.68,
      bossArmor: 0.14,
      hitInv: 0.52,
      guardInterval: 9,
      guards: 5,
    },
    {
      bossHp: 2.5,
      bossRate: 1.9,
      bossDensity: 1.75,
      bossLayers: 3,
      bossShield: 0.5,
      bossPressure: 1.92,
      bossArmor: 0.18,
      hitInv: 0.45,
      guardInterval: 8,
      guards: 6,
    },
  ];
  DIFFICULTIES.forEach((d, i) => Object.assign(d, BOSS_PROFILES[i]));
  [
    "低壓單招，護盾薄，適合探索與熟悉走位。",
    "均衡耐久與護衛；狂暴後開始雙重連攻。",
    "雙重攻擊，遠程護衛考驗衝刺時機。",
    "曲線彈幕與連鎖轟炸，保持移動路線。",
    "三重火網與裝甲護衛，狂暴再加一重。",
    "高速交疊火網，強構築會遇到更多彈幕；低等級仍有成長空間。",
  ].forEach((s, i) => (DIFFICULTIES[i].desc = s));
  // 可直接調整的平衡參數：等級占 35%，裝備占 65%；火力以 0.80 次方成長。
  const BOSS_BALANCE = {
    referenceDps: 22,
    referenceSeconds: 22,
    levelGain: 0.5,
    levelWeight: 0.35,
    powerWeight: 0.65,
    powerExponent: 0.8,
  };
  const MODE_RULES = {
    campaign: {
      id: "expedition",
      name: "星域遠征",
      hp: 1,
      rate: 1,
      density: 1,
      warning: 1,
      color: "#a49bff",
      desc: "分段探索星域，Boss 依出場時的等級與構築接戰。",
    },
    endless: {
      id: "endless",
      name: "無盡壓力",
      hp: 1,
      rate: 1,
      density: 1,
      warning: 1,
      color: "#ff8ca7",
      desc: "每 8 波提升一級壓力；額外耐久最多 +30%、出招最多 +20%。",
    },
  };
  const DAILY_THEMES = [
    {
      id: "comet",
      name: "流星航道",
      hp: 1,
      rate: 1,
      density: 0.95,
      warning: 1.12,
      color: "#ffbe86",
      wave: "storm",
      desc: "離子暴雨與延遲流星轟炸，預警較長。",
    },
    {
      id: "ion",
      name: "電離星潮",
      hp: 1,
      rate: 1.05,
      density: 1,
      warning: 1.06,
      color: "#87eeff",
      wave: "normal",
      desc: "遠程編隊與微彎彈道，留意火網交叉。",
    },
    {
      id: "swarm",
      name: "蜂群潮汐",
      hp: 0.96,
      rate: 0.96,
      density: 1.05,
      warning: 1.08,
      color: "#baa7ff",
      wave: "swarm",
      desc: "更多低生命小怪與蜂群護衛，適合範圍構築。",
    },
  ];
  function modeRule(r) {
    if (r.mode === "daily")
      return DAILY_THEMES[(r.seed >>> 0) % DAILY_THEMES.length];
    if (r.mode === "endless") {
      const stage = Math.min(5, Math.floor((r.wave - 1) / 8));
      return {
        ...MODE_RULES.endless,
        stage,
        hp: 1 + stage * 0.06,
        rate: 1 + stage * 0.04,
      };
    }
    return MODE_RULES.campaign;
  }
  // 估算單體火力，只用裝備數據；不讀取目前血量，也不偷讀玩家操作。
  function estimatePlayerPower(r) {
    const stats = r.stats || {},
      research = r.research || {},
      has = (id) => (r.relics || []).includes(id);
    const crit = clamp(
      0.04 +
        (stats.crit || 0) * 0.08 +
        (r.ship === "storm" ? 0.12 : 0) +
        (has("crit") ? 0.15 : 0),
      0,
      1,
    );
    const mult =
      (1 + (stats.damage || 0) * 0.15 + (research.reactor || 0) * 0.04) *
      (has("glass") ? 1.35 : 1) *
      (REGIONS.find((x) => x.id === r.region)?.damage || 1) *
      (r.config.mutator === "glass"
        ? 1.3
        : r.config.mutator === "salvage"
          ? 0.9
          : 1) *
      (1 + crit * (has("crit") ? 1.6 : 1));
    const fire =
        (1 + (stats.fire || 0) * 0.12) *
        (r.config.mutator === "overclock" ? 1.2 : 1),
      extra = stats.projectile || 0;
    let offense = 0;
    for (const w of r.weapons) {
      const base = WEAPONS[w.id],
        lv = w.level,
        damage = base.damage * (1 + (lv - 1) * 0.24) * (w.evolved ? 1.5 : 1);
      const interval = base.interval / fire / (1 + (lv - 1) * 0.06);
      let dps = 0;
      if (w.id === "pulse")
        dps =
          (damage * ((w.evolved ? 3 : 1 + Math.floor(lv / 3)) + extra) * 0.9) /
          interval;
      if (w.id === "frost")
        dps =
          (damage *
            (w.evolved ? 2.4 : Math.min(3.5, 3 + Math.floor(lv / 2) + extra)) *
            0.82) /
          interval;
      if (w.id === "missile")
        dps =
          (damage *
            ((w.evolved ? 4 : 1 + Math.floor(lv / 3)) + extra) *
            0.85 *
            (w.evolved ? 1.7 : 1)) /
          interval;
      if (w.id === "lightning") dps = damage / interval;
      if (w.id === "nova") dps = (damage * 0.85) / interval;
      if (w.id === "orbit")
        dps =
          (base.damage *
            (1 + (lv - 1) * 0.3) *
            (w.evolved ? 1.5 : 1) *
            (2 + Math.floor(lv / 2) + (w.evolved ? 3 : 0)) *
            0.42 *
            fire) /
          0.18;
      if (has("orbit") && ["orbit", "nova"].includes(w.id)) dps *= 1.4;
      offense += dps;
    }
    if (has("frost") && r.weapons.some((w) => w.id === "frost"))
      offense *= 1.12;
    const defense =
      r.p.maxHp / Math.max(0.45, 1 - (stats.armor || 0) * 0.08) +
      (stats.regen || 0) * 10 +
      (research.repair || 0) * 3 +
      (has("shield") ? 30 : 0);
    return { offense: Math.max(5, offense * mult), defense };
  }
  // 分配「本體 + 初始護盾 + 預計階段恢復」的總耐久。
  // 等級是線性項，裝備火力採次方小於 1 的項，保留強化帶來的優勢。
  function createBossEncounter(r) {
    const d = difficultyRule(r),
      mode = modeRule(r),
      power = estimatePlayerPower(r),
      level = Math.max(1, r.p.level);
    const b = BOSS_BALANCE,
      levelScale = 1 + (level - 1) * b.levelGain;
    const weightedDps =
      b.referenceDps *
      (b.levelWeight * levelScale +
        b.powerWeight *
          Math.pow(power.offense / b.referenceDps, b.powerExponent));
    const ratio = bossShieldRatio(r),
      phaseCount = r.config.bossSecondPhase
        ? r.config.bossThirdPhase
          ? 2
          : 1
        : 0;
    const phaseRecovery = d.id >= 3 ? 0.7 : 0.55,
      recovery =
        r.config.shieldRecovery === "none" ? 0 : phaseCount * phaseRecovery;
    const timed =
      r.config.shieldRecovery === "recharge" ? 0.35 * 2 * (phaseCount + 1) : 0;
    const shieldWeight = Math.pow((1 + ratio) / (1 + d.bossShield), 0.22);
    const budget =
      b.referenceSeconds *
      d.bossHp *
      weightedDps *
      (1 + r.config.bossStrength * 0.35) *
      mode.hp *
      shieldWeight;
    const armor = d.bossArmor,
      body = Math.max(
        70,
        Math.round(budget / (1 / (1 - armor) + ratio * (1 + recovery + timed))),
      );
    const progress = clamp(
      (level - 1) / 22 + Math.log2(1 + power.offense / 22) / 4 - 0.25,
      0,
      1.8,
    );
    return {
      level,
      offense: Math.round(power.offense),
      defense: Math.round(power.defense),
      body,
      shield: Math.round(body * ratio),
      budget: Math.round(budget),
      armor,
      rate: clamp(0.82 + progress * 0.25, 0.82, 1.27) * mode.rate,
      density: clamp(0.72 + progress * 0.36, 0.72, 1.37) * mode.density,
      damage: clamp(
        0.84 + progress * 0.13 + Math.max(0, power.defense / 100 - 1) * 0.025,
        0.84,
        1.2,
      ),
      warning: clamp(1.16 - progress * 0.12, 0.94, 1.16) * mode.warning,
      projectileSpeed: clamp(0.92 + progress * 0.1, 0.92, 1.1),
      pressure: clamp(0.85 + progress * 0.18, 0.85, 1.17),
      layersPenalty: level <= 3 && power.offense < 65 ? 1 : 0,
      modeId: mode.id,
    };
  }
  function bossWarningScale(r, e) {
    return difficultyRule(r).warning * (e?.adaptive?.warning || 1);
  }
  const BOSS_SHIELDS = {
    auto: "依難度",
    none: "無護盾",
    light: "輕型護盾",
    heavy: "重型護盾",
    fortress: "堡壘護盾",
  };
  const SHIELD_RECOVERY = {
    none: "不恢復",
    phase: "換階段恢復",
    recharge: "階段＋限次充能",
  };
  function bossShieldRatio(r) {
    const key = r.config.bossShield;
    return key === "auto"
      ? difficultyRule(r).bossShield
      : ({ none: 0, light: 0.25, heavy: 0.7, fortress: 1.15 }[key] ?? 0);
  }
  function bossLayers(r, phase = 1, e = null) {
    const d = difficultyRule(r);
    return Math.min(
      4,
      Math.max(1, d.bossLayers - (e?.adaptive?.layersPenalty || 0)) +
        (phase > 1 && d.id >= 0 ? 1 : 0),
    );
  }
  function startingWeapon(ship, config) {
    return WEAPONS[config.startingWeapon] ? config.startingWeapon : ship.weapon;
  }
  function startingHp(ship, weapon) {
    return (
      ship.hp + WEAPON_LOADOUTS[weapon].hp - WEAPON_LOADOUTS[ship.weapon].hp
    );
  }
  function launchPreview(profile, ship, config) {
    const weapon = startingWeapon(ship, config),
      mod = profile.moduleOwned?.includes(profile.moduleEquipped)
        ? profile.moduleEquipped
        : "none";
    let hp = startingHp(ship, weapon) + (profile.research.hull || 0) * 8;
    if (mod === "medic") hp += 12;
    if (mod === "reactor") hp = Math.round(hp * 0.9);
    if (config.mutator === "glass") hp = Math.round(hp * 0.75);
    return {
      weapon,
      hp,
      speed: Math.round(
        ship.speed *
          (1 +
            (profile.research.thruster || 0) * 0.03 +
            (mod === "vector" ? 0.1 : 0)),
      ),
      armor: (ship.id === "bulwark" ? 8 : 0) + (mod === "aegis" ? 8 : 0),
      crit: 4 + (ship.id === "storm" ? 12 : 0),
    };
  }
  const STATS = {
    damage: {
      name: "反應爐增壓",
      icon: "✦",
      desc: "所有武器傷害 +15%",
      max: 8,
    },
    fire: { name: "超頻迴路", icon: "⌁", desc: "所有武器攻速 +12%", max: 8 },
    hp: {
      name: "裝甲擴建",
      icon: "▣",
      desc: "最大生命 +20，並回復 20 生命",
      max: 6,
    },
    armor: { name: "偏轉護盾", icon: "◇", desc: "減少受到的傷害 8%", max: 5 },
    speed: { name: "向量推進", icon: "»", desc: "移動速度 +10%", max: 5 },
    crit: {
      name: "弱點解析",
      icon: "⌖",
      desc: "暴擊機率 +8%；暴擊傷害為 2 倍",
      max: 6,
    },
    magnet: {
      name: "磁力打撈",
      icon: "⊕",
      desc: "拾取範圍 +40，經驗獲取 +5%",
      max: 5,
    },
    regen: { name: "奈米修復", icon: "♡", desc: "每 5 秒回復 3 生命", max: 5 },
    projectile: {
      name: "彈道複寫",
      icon: "⋮",
      desc: "脈衝、導彈與冰晶額外發射 1 枚",
      max: 3,
    },
  };
  const RELICS = [
    {
      id: "glass",
      name: "玻璃太陽",
      icon: "☀",
      desc: "傷害 +35%，受到的傷害 +20%。適合遠距爆發流。",
    },
    {
      id: "harvest",
      name: "拾荒者之心",
      icon: "⊕",
      desc: "所有晶礦與經驗收益 +30%。",
    },
    {
      id: "vamp",
      name: "生命虹吸",
      icon: "♡",
      desc: "每擊殺 12 個敵人回復 4 生命。",
    },
    {
      id: "second",
      name: "第二黎明",
      icon: "✧",
      desc: "本局第一次致命傷害時，以 50% 生命復活。",
    },
    {
      id: "dash",
      name: "時空羽翼",
      icon: "»",
      desc: "衝刺冷卻縮短 40%，衝刺路徑會傷害敵人。",
    },
    {
      id: "battery",
      name: "暴風蓄電池",
      icon: "ϟ",
      desc: "過載冷卻縮短 30%，傷害與範圍 +30%。",
    },
    {
      id: "orbit",
      name: "近地協定",
      icon: "◎",
      desc: "軌道刃與震盪新星傷害 +40%。",
    },
    {
      id: "crit",
      name: "獵人之眼",
      icon: "⌖",
      desc: "暴擊機率 +15%，暴擊傷害由 2 倍提高至 2.6 倍。",
    },
    {
      id: "frost",
      name: "冰封記憶",
      icon: "❄",
      desc: "對減速中的敵人造成額外 45% 傷害。",
    },
    {
      id: "shield",
      name: "守望之石",
      icon: "◇",
      desc: "每 18 秒獲得一次可抵擋傷害的護盾。",
    },
    {
      id: "nova",
      name: "死亡回聲",
      icon: "✺",
      desc: "擊殺時有 15% 機率產生小爆炸。",
    },
    {
      id: "growth",
      name: "活體金屬",
      icon: "▣",
      desc: "每完成一波，最大生命 +6 並回復 6 生命。",
    },
  ];
  const SHIPS = [
    {
      id: "scout",
      name: "游隼",
      icon: "✧",
      weapon: "pulse",
      hp: 100,
      speed: 240,
      desc: "脈衝連射，適合持續輸出。衝刺 2.4 秒；防禦與爆發均衡。",
    },
    {
      id: "bulwark",
      name: "磐石",
      icon: "◈",
      weapon: "orbit",
      hp: 145,
      speed: 195,
      desc: "軌道刃近身防守，自帶 8% 減傷。生命高，代價是移速較慢。",
    },
    {
      id: "storm",
      name: "雷隼",
      icon: "ϟ",
      weapon: "lightning",
      hp: 85,
      speed: 265,
      desc: "電弧連鎖清群，暴擊 +12%。移速高，代價是起始生命較低。",
    },
  ];
  const REGIONS = [
    {
      id: "nebula",
      name: "瑩光星雲",
      color: "#8877e7",
      desc: "經驗 +15%，敵人移速 +8%。",
      xp: 1.15,
      speed: 1.08,
    },
    {
      id: "belt",
      name: "碎星環帶",
      color: "#dc9564",
      desc: "晶礦 +25%，每隔一段時間落下隕石。",
      gold: 1.25,
      hazard: true,
    },
    {
      id: "void",
      name: "靜默深空",
      color: "#5d91c8",
      desc: "武器傷害 +10%，狙擊敵人出現更頻繁。",
      damage: 1.1,
      sniper: true,
    },
  ];
  const BOSSES = ["裂隙吞噬者", "鋼鐵暴君", "星雲女皇", "永夜核心"];
  const BOSS_DATA = [
    {
      id: "rift",
      name: BOSSES[0],
      title: "THE RIFT DEVOURER",
      color: "#cc86ff",
      image: "assets/boss-rift.png",
      desc: "扭曲航道的虛空巨獸。",
      skills: "裂隙衝鋒、連環彈環、虛空吞噬、螺旋裂流、十字裂隙",
    },
    {
      id: "tyrant",
      name: BOSSES[1],
      title: "THE IRON TYRANT",
      color: "#ffb575",
      image: "assets/boss-tyrant.png",
      desc: "以熔融反應爐驅動的重裝戰爭機器。",
      skills: "熔核齊射、天火轟炸、裝甲護衛、交錯火炮、熔核封鎖",
    },
    {
      id: "queen",
      name: BOSSES[2],
      title: "THE NEBULA QUEEN",
      color: "#83f0f0",
      image: "assets/boss-queen.png",
      desc: "冰冷而優雅的蟲群統治者。",
      skills: "蜂群召喚、結晶針雨、女皇領域、追魂針簇、冰晶螺旋",
    },
    {
      id: "core",
      name: BOSSES[3],
      title: "THE ETERNAL CORE",
      color: "#ff729c",
      image: "assets/boss-core.png",
      desc: "從永夜深處醒來的星際災厄。",
      skills: "雙旋星環、末日連鎖、奇點斬擊、反轉星潮、終焉矩陣",
    },
  ];
  const MODULES = [
    {
      id: "scanner",
      name: "深空打撈艙",
      icon: "⊕",
      cost: 90,
      desc: "出航自帶磁力打撈 Lv.1，初始晶礦 +15。",
    },
    {
      id: "medic",
      name: "生命循環艙",
      icon: "♡",
      cost: 140,
      desc: "出航自帶奈米修復 Lv.1，最大生命 +12。",
    },
    {
      id: "vector",
      name: "躍遷推進器",
      icon: "»",
      cost: 130,
      desc: "衝刺冷卻縮短 15%，出航自帶向量推進 Lv.1。",
    },
    {
      id: "reactor",
      name: "紅線反應爐",
      icon: "✦",
      cost: 180,
      desc: "出航自帶反應爐增壓 Lv.1，最大生命減少 10%。",
    },
    {
      id: "aegis",
      name: "黎明護盾",
      icon: "◇",
      cost: 160,
      desc: "出航自帶偏轉護盾 Lv.1，每波開始獲得一次護盾。",
    },
  ];
  const WAVE_TYPES = [
    {
      id: "normal",
      name: "常規敵潮",
      desc: "均衡的敵人組合。",
      density: 1,
      hp: 1,
    },
    {
      id: "swarm",
      name: "蜂群圍攻",
      desc: "敵人更多，但生命降低。",
      density: 1.35,
      hp: 0.8,
    },
    {
      id: "hunt",
      name: "精英獵場",
      desc: "精英出現率提高，擊破可取得額外晶礦。",
      density: 0.95,
      hp: 1.05,
    },
    {
      id: "rush",
      name: "高速追獵",
      desc: "高速敵人較多，保持移動。",
      density: 1.05,
      hp: 0.9,
    },
    {
      id: "storm",
      name: "離子暴雨",
      desc: "間歇出現預警轟炸，留意走位。",
      density: 0.9,
      hp: 1,
    },
  ];
  const ENEMY_AMOUNTS = {
    sparse: { name: "稀疏", rate: 0.65, cap: 40 },
    normal: { name: "適中", rate: 1, cap: 75 },
    dense: { name: "密集", rate: 1.4, cap: 115 },
    swarm: { name: "海量", rate: 1.85, cap: 160 },
  };
  const ENEMY_SETS = {
    mixed: "綜合編隊",
    mobile: "高速追擊",
    ranged: "遠程火網",
    armored: "重裝軍團",
    swarm: "分裂蜂群",
  };
  const BOSS_FREQUENCIES = { slow: 0.7, normal: 1, fast: 1.4, relentless: 1.8 };
  const BOSS_DENSITIES = { sparse: 0.65, normal: 1, dense: 1.45, extreme: 1.9 };
  const ENEMY_TYPES = [
    "scout",
    "runner",
    "tank",
    "sniper",
    "charger",
    "splitter",
    "mini",
    "shield",
    "healer",
    "bomber",
    "gunner",
    "boss",
  ];
  // waveSeconds remains only for importing old saves; waves are completed by kills.
  const DEFAULT_CONFIG = {
    totalWaves: 16,
    waveSeconds: 50,
    startingWeapon: "ship",
    killsPerWave: 24,
    quotaGrowth: "rising",
    enemyAmount: "normal",
    enemySet: "mixed",
    eliteRate: "normal",
    bossRule: "interval",
    bossEvery: 4,
    bossDelay: 45,
    bossStrength: 0,
    bossRoster: "cycle",
    bossSecondPhase: true,
    bossThirdPhase: false,
    bossFrequency: "normal",
    bossDensity: "normal",
    bossShield: "auto",
    shieldRecovery: "phase",
    finalBoss: true,
    mutator: "none",
  };
  function killQuota(config, wave) {
    return (
      config.killsPerWave +
      (config.quotaGrowth === "rising" ? Math.min(60, (wave - 1) * 3) : 0)
    );
  }
  function bossPhase(r, e) {
    if (!r.config.bossSecondPhase) return 1;
    return r.config.bossThirdPhase && e.hp / e.maxHp < 0.3
      ? 3
      : e.hp / e.maxHp < 0.5
        ? 2
        : 1;
  }
  function bossCooldown(r, phase, e = null) {
    return (
      (phase === 3 ? 2.2 : phase === 2 ? 2.9 : 4) /
      BOSS_FREQUENCIES[r.config.bossFrequency] /
      difficultyRule(r).bossRate /
      (e?.adaptive?.rate || 1)
    );
  }
  function enemyPool(r) {
    const w = r.wave,
      c = r.config,
      p = ["scout", "scout", "scout"];
    if (w >= 2) p.push("runner", "bomber");
    if (w >= 3) p.push("tank", "shield");
    if (w >= 4) p.push("healer", "gunner");
    if (w >= 5) p.push("sniper");
    if (w >= 7) p.push("charger");
    if (w >= 9) p.push("splitter");
    if (w >= 2) {
      if (c.enemySet === "mobile") p.push("runner", "runner", "charger");
      if (c.enemySet === "ranged") p.push("sniper", "gunner", "gunner");
      if (c.enemySet === "armored")
        p.push("tank", "shield", "shield", "healer");
      if (c.enemySet === "swarm") p.push("mini", "mini", "splitter");
    }
    if (waveType(r).id === "rush") p.push("runner", "runner");
    if (waveType(r).id === "swarm") p.push("scout", "mini");
    if (r.region === "void") p.push("sniper");
    if (r.mode === "daily" && modeRule(r).id === "ion" && w >= 2)
      p.push("gunner", "sniper");
    return p;
  }
  function normalizeConfig(value = {}) {
    const c = { ...DEFAULT_CONFIG, ...value },
      num = (v, a, b, d) =>
        Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), a, b) : d;
    c.totalWaves = num(c.totalWaves, 1, 80, 16);
    c.waveSeconds = num(c.waveSeconds, 30, 90, 50);
    c.bossEvery = num(c.bossEvery, 1, 12, 4);
    c.bossStrength = num(c.bossStrength, 0, 2, 0);
    if (!["ship", ...Object.keys(WEAPONS)].includes(c.startingWeapon))
      c.startingWeapon = "ship";
    c.killsPerWave = num(c.killsPerWave, 10, 160, 24);
    c.bossDelay = num(c.bossDelay, 15, 180, 45);
    for (const [key, allowed] of Object.entries({
      quotaGrowth: ["fixed", "rising"],
      enemyAmount: Object.keys(ENEMY_AMOUNTS),
      enemySet: Object.keys(ENEMY_SETS),
      eliteRate: ["none", "normal", "many"],
      bossFrequency: Object.keys(BOSS_FREQUENCIES),
      bossDensity: Object.keys(BOSS_DENSITIES),
      bossShield: Object.keys(BOSS_SHIELDS),
      shieldRecovery: Object.keys(SHIELD_RECOVERY),
    }))
      if (!allowed.includes(c[key])) c[key] = DEFAULT_CONFIG[key];
    c.bossSecondPhase = c.bossSecondPhase !== false;
    c.bossThirdPhase =
      c.bossSecondPhase &&
      (value.bossThirdPhase === undefined
        ? value.bossStrength === 2
        : !!value.bossThirdPhase);
    if (!["interval", "final", "rush", "none"].includes(c.bossRule))
      c.bossRule = "interval";
    if (
      !["cycle", "random", ...BOSS_DATA.map((x) => x.id)].includes(c.bossRoster)
    )
      c.bossRoster = "cycle";
    if (!["none", "overclock", "salvage", "glass"].includes(c.mutator))
      c.mutator = "none";
    c.finalBoss = !!c.finalBoss;
    return c;
  }
  function isBossWave(r, wave = r.wave) {
    const c = r.config || DEFAULT_CONFIG;
    if (c.bossRule === "none") return false;
    if (c.bossRule === "rush") return true;
    const last = r.mode !== "endless" && wave === c.totalWaves;
    if (c.bossRule === "final") return last;
    return wave % c.bossEvery === 0 || (last && c.finalBoss);
  }
  function rewardMultiplier(difficulty, config, mode) {
    const enabled =
      config.bossRule !== "none" &&
      (config.bossRule !== "final" || mode !== "endless");
    return (
      difficultyRule({ difficulty }).reward *
      (!enabled ? 0.85 : config.bossRule === "rush" ? 1.2 : 1)
    );
  }
  function bossRuleText(config, mode) {
    return config.bossRule === "none"
      ? "無 Boss"
      : config.bossRule === "rush"
        ? "每波 Boss"
        : config.bossRule === "final"
          ? mode === "endless"
            ? "無終點，無 Boss"
            : "最後一波 Boss"
          : `每 ${config.bossEvery} 波 Boss${mode !== "endless" && config.finalBoss ? " · 最終 Boss" : ""}`;
  }
  function waveType(r) {
    return WAVE_TYPES.find((x) => x.id === r.waveType) || WAVE_TYPES[0];
  }
  const RESEARCH = [
    { id: "hull", name: "船體強化", desc: "每級最大生命 +8", cost: 40 },
    { id: "reactor", name: "反應爐", desc: "每級武器傷害 +4%", cost: 50 },
    { id: "thruster", name: "推進器", desc: "每級移動速度 +3%", cost: 35 },
    { id: "magnet", name: "打撈艙", desc: "每級拾取範圍 +12", cost: 35 },
    {
      id: "repair",
      name: "自我修復",
      desc: "每級每秒回復 0.12 生命",
      cost: 45,
    },
    { id: "fortune", name: "資源掃描", desc: "每級晶礦收益 +5%", cost: 40 },
  ];
  const ACHIEVEMENTS = [
    {
      id: "first",
      name: "第一道火光",
      desc: "累計擊敗 50 個敵人",
      reward: 60,
      test: (p) => p.kills >= 50,
    },
    {
      id: "hundred",
      name: "星際清道夫",
      desc: "累計擊敗 500 個敵人",
      reward: 120,
      test: (p) => p.kills >= 500,
    },
    {
      id: "boss",
      name: "巨獸終結者",
      desc: "擊敗任一 Boss",
      reward: 100,
      test: (p) => p.bosses >= 1,
    },
    {
      id: "evo",
      name: "突破極限",
      desc: "完成一次武器進化",
      reward: 100,
      test: (p) => p.evolutions >= 1,
    },
    {
      id: "arsenal",
      name: "移動兵工廠",
      desc: "同時裝備六種武器",
      reward: 100,
      test: (p) => p.arsenal,
    },
    {
      id: "sector",
      name: "穿越星海",
      desc: "到達第 9 波",
      reward: 140,
      test: (p) => p.bestWave >= 9,
    },
    {
      id: "win",
      name: "看見黎明",
      desc: "通關 16 波遠征",
      reward: 250,
      test: (p) =>
        (p.longWins || 0) >= 1 || p.records.some((x) => x.win && x.wave >= 16),
    },
    {
      id: "storm",
      name: "每一種可能",
      desc: "使用全部三種星艦出航",
      reward: 100,
      test: (p) => p.ships.length >= 3,
    },
    {
      id: "endless",
      name: "永夜旅人",
      desc: "在無盡模式到達第 24 波",
      reward: 300,
      test: (p) => p.endlessWave >= 24,
    },
    {
      id: "research",
      name: "星艦工程師",
      desc: "累計完成 10 次永久研究",
      reward: 150,
      test: (p) => Object.values(p.research).reduce((a, b) => a + b, 0) >= 10,
    },
  ];
  function defaultProfile() {
    return {
      version: VERSION,
      credits: 0,
      kills: 0,
      bosses: 0,
      evolutions: 0,
      bestWave: 0,
      endlessWave: 0,
      wins: 0,
      runs: 0,
      arsenal: false,
      ships: [],
      research: {},
      achievements: [],
      records: [],
      settings: {
        sound: false,
        shake: true,
        particles: true,
        effectsLevel: "auto",
      },
      tutorial: false,
      moduleOwned: [],
      moduleEquipped: "none",
      longWins: 0,
      customWins: 0,
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function seeded(state) {
    let n = state.rng | 0;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    state.rng = n >>> 0;
    return (state.rng >>> 0) / 4294967296;
  }
  function pick(state, array) {
    return array[Math.floor(seeded(state) * array.length)];
  }
  function shuffle(state, array) {
    let a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(seeded(state) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function timeText(v) {
    const s = Math.floor(v);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  // 2. 存檔驗證：先檢查資料範圍，再進行舊版轉換。
  function validateRun(r) {
    const finite = (v) =>
      typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e15;
    const validPoint = (o) => o && finite(o.x) && finite(o.y);
    if (
      !SHIPS.some((x) => x.id === r.ship) ||
      !["campaign", "endless", "daily"].includes(r.mode) ||
      !REGIONS.some((x) => x.id === r.region)
    )
      return false;
    if (
      !Number.isInteger(r.wave) ||
      r.wave < 1 ||
      r.wave > 10000 ||
      !finite(r.time) ||
      r.time < 0 ||
      !finite(r.waveTime) ||
      r.waveTime < 0 ||
      !finite(r.rng)
    )
      return false;
    if (
      !validPoint(r.p) ||
      !finite(r.p.hp) ||
      !finite(r.p.maxHp) ||
      r.p.maxHp <= 0 ||
      r.p.hp < 0 ||
      r.p.hp > r.p.maxHp ||
      !finite(r.p.xp) ||
      !finite(r.p.xpNeed) ||
      r.p.xpNeed <= 0
    )
      return false;
    for (const k of [
      "level",
      "inv",
      "dashTime",
      "dashCD",
      "burstCD",
      "dx",
      "dy",
      "speed",
    ])
      if (!finite(r.p[k])) return false;
    for (const k of [
      "gold",
      "kills",
      "bosses",
      "evolutions",
      "pendingLevels",
      "rerolls",
      "spawnTimer",
      "hazardTimer",
      "sector",
      "difficulty",
    ])
      if (!finite(r[k])) return false;
    if (
      !r.stats ||
      Object.keys(STATS).some(
        (k) =>
          !finite(r.stats[k]) || r.stats[k] < 0 || r.stats[k] > STATS[k].max,
      )
    )
      return false;
    if (
      !Array.isArray(r.weapons) ||
      r.weapons.length < 1 ||
      r.weapons.length > 6 ||
      new Set(r.weapons.map((x) => x.id)).size !== r.weapons.length
    )
      return false;
    if (
      r.weapons.some(
        (w) =>
          !WEAPONS[w.id] ||
          !Number.isInteger(w.level) ||
          w.level < 1 ||
          w.level > 5 ||
          !finite(w.cd),
      )
    )
      return false;
    const caps = {
      enemies: 180,
      bullets: 360,
      enemyBullets: 480,
      gems: 260,
      hazards: 100,
      burns: 150,
    };
    for (const [k, cap] of Object.entries(caps)) {
      if (
        !Array.isArray(r[k]) ||
        r[k].length > cap ||
        r[k].some((o) => !validPoint(o))
      )
        return false;
    }
    if (
      r.enemies.some(
        (e) =>
          !ENEMY_TYPES.includes(e.type) ||
          !finite(e.hp) ||
          !finite(e.maxHp) ||
          e.maxHp <= 0 ||
          !finite(e.speed) ||
          !finite(e.radius) ||
          !finite(e.id) ||
          !finite(e.cd),
      )
    )
      return false;
    if (
      r.bullets.some(
        (b) =>
          !WEAPONS[b.source] ||
          !finite(b.vx) ||
          !finite(b.vy) ||
          !finite(b.damage) ||
          !finite(b.life) ||
          !Array.isArray(b.hitIds),
      )
    )
      return false;
    if (
      r.enemyBullets.some(
        (b) =>
          !finite(b.vx) ||
          !finite(b.vy) ||
          !finite(b.damage) ||
          !finite(b.life) ||
          (b.turn !== undefined && (!finite(b.turn) || Math.abs(b.turn) > 2)) ||
          (b.color !== undefined && !/^#[0-9a-f]{6}$/i.test(b.color)),
      )
    )
      return false;
    if (
      !Array.isArray(r.log) ||
      r.log.some((s) => typeof s !== "string") ||
      !Array.isArray(r.relics) ||
      r.relics.some((id) => !RELICS.some((x) => x.id === id))
    )
      return false;
    if (
      r.phase === "upgrade" &&
      (!Array.isArray(r.offers) ||
        r.offers.length < 1 ||
        r.offers.length > 3 ||
        r.offers.some(
          (c) =>
            !["weapon", "evolve", "stat", "heal"].includes(c.kind) ||
            (c.kind === "stat" && !STATS[c.id]) ||
            (["weapon", "evolve"].includes(c.kind) && !WEAPONS[c.id]),
        ))
    )
      return false;
    if (
      r.phase === "relic" &&
      (!Array.isArray(r.relicOffers) ||
        !r.relicOffers.length ||
        r.relicOffers.some((c) => !RELICS.some((x) => x.id === c.id)))
    )
      return false;
    if (
      r.phase === "route" &&
      (!Array.isArray(r.routeOffers) ||
        r.routeOffers.length !== 3 ||
        r.routeOffers.some((c) => !REGIONS.some((x) => x.id === c.id)))
    )
      return false;
    if (
      r.phase === "event" &&
      (!r.event ||
        !["wreck", "signal", "cache"].includes(r.event.id) ||
        !Array.isArray(r.event.choices) ||
        r.event.choices.length !== 3)
    )
      return false;
    if (r.config) {
      const c = r.config;
      if (
        !Number.isInteger(c.totalWaves) ||
        c.totalWaves < 1 ||
        c.totalWaves > 80 ||
        !Number.isInteger(c.waveSeconds) ||
        c.waveSeconds < 30 ||
        c.waveSeconds > 90 ||
        !Number.isInteger(c.bossEvery) ||
        c.bossEvery < 1 ||
        c.bossEvery > 12 ||
        ![0, 1, 2].includes(c.bossStrength) ||
        !["interval", "final", "rush", "none"].includes(c.bossRule) ||
        !["cycle", "random", ...BOSS_DATA.map((x) => x.id)].includes(
          c.bossRoster,
        ) ||
        !["none", "overclock", "salvage", "glass"].includes(c.mutator)
      )
        return false;
    }
    if (r.config) {
      const c = r.config,
        n = normalizeConfig(c);
      for (const key of [
        "startingWeapon",
        "killsPerWave",
        "quotaGrowth",
        "enemyAmount",
        "enemySet",
        "eliteRate",
        "bossDelay",
        "bossFrequency",
        "bossDensity",
        "bossShield",
        "shieldRecovery",
      ])
        if (c[key] !== undefined && c[key] !== n[key]) return false;
      for (const key of ["bossSecondPhase", "bossThirdPhase"])
        if (c[key] !== undefined && typeof c[key] !== "boolean") return false;
    }
    for (const key of ["waveKills", "killTarget"])
      if (
        r[key] !== undefined &&
        (!Number.isInteger(r[key]) || r[key] < 0 || r[key] > 1e7)
      )
        return false;
    if (r.killTarget !== undefined && r.killTarget < 1) return false;
    if (
      r.enemies.some(
        (e) =>
          (e.elite &&
            !["armored", "swift", "volatile", "regenerating"].includes(
              e.elite,
            )) ||
          (e.champion !== undefined && typeof e.champion !== "boolean") ||
          [
            "attackTimer",
            "charge",
            "age",
            "bossCharge",
            "phaseLevel",
            "attackCycle",
          ].some((k) => e[k] !== undefined && !finite(e[k])),
      )
    )
      return false;
    for (const e of r.enemies) {
      if (
        [
          "shieldHp",
          "maxShield",
          "shieldTimer",
          "shieldRecharges",
          "shieldBreaks",
          "guardTimer",
        ].some((k) => e[k] !== undefined && (!finite(e[k]) || e[k] < 0))
      )
        return false;
      if (
        e.shieldHp !== undefined &&
        (e.maxShield === undefined || e.shieldHp > e.maxShield)
      )
        return false;
      if (
        e.adaptive !== undefined &&
        (!e.adaptive ||
          typeof e.adaptive !== "object" ||
          [
            "level",
            "offense",
            "defense",
            "body",
            "shield",
            "budget",
            "armor",
            "rate",
            "density",
            "damage",
            "warning",
            "projectileSpeed",
            "pressure",
            "layersPenalty",
          ].some((k) => !finite(e.adaptive[k]) || e.adaptive[k] < 0) ||
          e.adaptive.body < 1 ||
          e.adaptive.rate < 0.5 ||
          e.adaptive.rate > 2 ||
          e.adaptive.warning < 0.5 ||
          e.adaptive.warning > 2 ||
          e.adaptive.armor >= 0.5 ||
          e.adaptive.density < 0.5 ||
          e.adaptive.density > 2 ||
          e.adaptive.damage < 0.5 ||
          e.adaptive.damage > 1.5 ||
          e.adaptive.pressure < 0.5 ||
          e.adaptive.pressure > 1.5 ||
          e.adaptive.projectileSpeed < 0.5 ||
          e.adaptive.projectileSpeed > 1.5 ||
          ![0, 1].includes(e.adaptive.layersPenalty) ||
          !Number.isInteger(e.adaptive.level) ||
          e.adaptive.level < 1 ||
          !["expedition", "endless", "comet", "ion", "swarm"].includes(
            e.adaptive.modeId,
          ))
      )
        return false;
      if (
        e.barrages !== undefined &&
        (!Array.isArray(e.barrages) ||
          e.barrages.length > 8 ||
          e.barrages.some(
            (b) =>
              !["ring", "spiral", "fan"].includes(b.kind) ||
              [
                "remaining",
                "timer",
                "angle",
                "step",
                "count",
                "speed",
                "interval",
                "turn",
              ].some((k) => !finite(b[k])) ||
              b.remaining < 0 ||
              b.remaining > 12 ||
              b.count < 1 ||
              b.count > 120 ||
              b.interval < 0.12 ||
              b.interval > 5 ||
              (b.color !== undefined && !/^#[0-9a-f]{6}$/i.test(b.color)),
          ))
      )
        return false;
    }
    if (r.module && !["none", ...MODULES.map((x) => x.id)].includes(r.module))
      return false;
    if (r.waveType && !WAVE_TYPES.some((x) => x.id === r.waveType))
      return false;
    if (
      r.caches &&
      (!Array.isArray(r.caches) ||
        r.caches.length > 3 ||
        r.caches.some(
          (x) => !validPoint(x) || !["gold", "heal", "magnet"].includes(x.kind),
        ))
    )
      return false;
    if (r.shopStock) {
      if (!Array.isArray(r.shopStock) || r.shopStock.length > 6) return false;
      for (const item of r.shopStock) {
        if (
          !item ||
          !finite(item.cost) ||
          item.cost < 0 ||
          !["weapon", "evolve", "stat", "relic", "shield", "reroll"].includes(
            item.kind,
          ) ||
          (["weapon", "evolve"].includes(item.kind) && !WEAPONS[item.id]) ||
          (item.kind === "stat" && !STATS[item.id]) ||
          (item.kind === "relic" && !RELICS.some((x) => x.id === item.id))
        )
          return false;
      }
    }
    if (
      r.objective &&
      (!["kills", "collect", "dash", "elite"].includes(r.objective.kind) ||
        !finite(r.objective.progress) ||
        !finite(r.objective.target) ||
        r.objective.target < 1)
    )
      return false;
    if (
      r.research &&
      RESEARCH.some(
        (x) =>
          !Number.isInteger(r.research[x.id] || 0) ||
          (r.research[x.id] || 0) < 0 ||
          (r.research[x.id] || 0) > 5,
      )
    )
      return false;
    return true;
  }
  // 3. 戰鬥引擎：只管理遊戲數據，不依賴瀏覽器畫面。
  class Engine {
    constructor(profile) {
      this.profile = profile;
      this.r = null;
      this.onPhase = () => {};
      this.onSound = () => {};
      this.onToast = () => {};
      this.viewRadius = 550;
      this.fx = [];
      this.shake = 0;
      this.zoomPulse = 0;
      this.screenPulse = 0;
      this.screenColor = "#91f5e4";
      this.lastImpact = -10;
      this.nextId = 1;
      this.hash = new Map();
    }
    applyStartingModule() {
      const r = this.r,
        p = r.p,
        id = r.module;
      if (
        !MODULES.some((x) => x.id === id) ||
        !this.profile.moduleOwned?.includes(id)
      )
        r.module = "none";
      if (r.module === "scanner") {
        r.stats.magnet++;
        r.gold += 15;
      }
      if (r.module === "medic") {
        r.stats.regen++;
        p.maxHp += 12;
        p.hp += 12;
      }
      if (r.module === "vector") r.stats.speed++;
      if (r.module === "reactor") {
        r.stats.damage++;
        p.maxHp = Math.round(p.maxHp * 0.9);
        p.hp = p.maxHp;
      }
      if (r.module === "aegis") {
        r.stats.armor++;
        p.shield = 1;
      }
      if (r.config.mutator === "glass") {
        p.maxHp = Math.round(p.maxHp * 0.75);
        p.hp = p.maxHp;
      }
    }
    // 舊 Boss 只轉換一次，保留已經造成的傷害比例。
    migrateRun(data) {
      data.config = normalizeConfig(data.config);
      data.module = data.module || "none";
      data.waveType = data.waveType || "normal";
      data.caches = data.caches || [];
      data.cacheTimer = data.cacheTimer ?? 14;
      data.combo = data.combo || 0;
      data.comboTimer = data.comboTimer || 0;
      data.maxCombo = data.maxCombo || 0;
      data.bossIntro = 0;
      data.bossIndexNext =
        data.enemies.find((e) => e.type === "boss")?.bossIndex || 0;
      data.shopStock = data.shopStock || [];
      data.shopRefreshes = data.shopRefreshes || 0;
      data.shopWave = data.shopWave || 0;
      data.shopBuys = data.shopBuys || 0;
      data.shopSpent = data.shopSpent || 0;
      data.waveKills = data.waveKills ?? 0;
      data.killTarget = data.killTarget ?? killQuota(data.config, data.wave);
      data.bossWarned = data.bossWarned || false;
      data.startWeapon = data.startWeapon || data.weapons[0].id;
      for (const e of data.enemies)
        if (e.type === "boss") {
          e.attackCycle = e.attackCycle || 0;
          e.phaseLevel = e.phaseLevel || 1;
          e.bossCharge = e.bossCharge || 0;
          if (!e.adaptive) {
            const hpRatio = clamp(e.hp / e.maxHp, 0, 1),
              shieldRatio = e.maxShield
                ? clamp(e.shieldHp / e.maxShield, 0, 1)
                : e.maxShield === 0
                  ? 0
                  : 1;
            e.adaptive = createBossEncounter(data);
            e.maxHp = e.adaptive.body;
            e.hp = e.maxHp * hpRatio;
            e.maxShield = e.adaptive.shield;
            e.shieldHp = e.maxShield * shieldRatio;
            e.contact =
              (14 + e.adaptive.level * 0.3) *
              e.adaptive.damage *
              (1 + data.config.bossStrength * 0.15);
            for (const b of data.enemyBullets)
              if (b.boss && (!b.ownerId || b.ownerId === e.id)) {
                b.ownerId = e.id;
                b.damage = (9 + e.adaptive.level * 0.45) * e.adaptive.damage;
              }
            for (const h of data.hazards)
              if (h.bossOwner === e.id)
                h.damage =
                  (13 + e.adaptive.level * 0.5) *
                  e.adaptive.damage *
                  (h.shape === "beam" ? 1.25 : 1);
          }
          this.initBossShield(e, data);
          e.barrages = e.barrages || [];
          e.guardTimer = e.guardTimer ?? 4;
        }
    }
    prepareWave() {
      const r = this.r;
      r.waveType =
        r.wave === 1 || isBossWave(r)
          ? "normal"
          : r.mode === "daily"
            ? modeRule(r).wave
            : pick(r, WAVE_TYPES).id;
      r.cacheTimer = 14;
      r.caches = [];
      r.combo = 0;
      r.comboTimer = 0;
      r.waveKills = 0;
      r.killTarget = killQuota(r.config, r.wave);
      r.bossWarned = false;
      const kind =
        r.wave === 1
          ? "kills"
          : pick(r, [
              "kills",
              "collect",
              "dash",
              ...(r.wave >= 3 && r.config.eliteRate !== "none"
                ? ["elite"]
                : []),
            ]);
      const target =
        kind === "kills"
          ? Math.max(8, Math.floor(r.killTarget * 0.65))
          : kind === "collect"
            ? Math.max(8, Math.floor(r.killTarget * 0.45))
            : kind === "dash"
              ? 3
              : 1;
      r.objective = { kind, target, progress: 0, reward: 15 + r.wave * 2 };
      this.log(`${waveType(r).name}：${waveType(r).desc}`);
    }
    spawnCache() {
      const r = this.r;
      if (r.caches.length >= 3) return;
      const a = seeded(r) * Math.PI * 2;
      r.caches.push({
        x: clamp(r.p.x + Math.cos(a) * 160, 60, 2340),
        y: clamp(r.p.y + Math.sin(a) * 160, 60, 2340),
        kind: pick(r, ["gold", "heal", "magnet"]),
        age: 0,
      });
    }
    openCache(cache) {
      if (cache.dead) return;
      cache.dead = true;
      const r = this.r;
      if (cache.kind === "gold") {
        r.gold += 18;
        this.log("打撈補給箱：晶礦 +18。");
      } else if (cache.kind === "heal") {
        r.p.hp = Math.min(r.p.maxHp, r.p.hp + r.p.maxHp * 0.15);
        this.log("打撈醫療箱：回復 15% 生命。");
      } else {
        r.magnetPulse = 3;
        this.log("磁力補給啟動：吸收遠處經驗。");
      }
      this.addFx("ring", cache.x, cache.y, { radius: 70, color: "#a0f8c9" });
      this.onSound("level");
    }
    ensureShop(force = false) {
      const r = this.r;
      if (!force && r.shopWave === r.wave && r.shopStock.length) return;
      const options = this.availableUpgrades().filter((x) => x.kind !== "heal"),
        offers = shuffle(r, options).slice(0, 3);
      r.shopStock = offers.map((c, i) => ({
        ...c,
        stockId: `${r.wave}-${r.shopRefreshes}-${i}`,
        cost:
          c.kind === "evolve"
            ? 70 + r.wave * 2
            : c.kind === "weapon"
              ? 32 + r.wave * 2
              : 25 + r.wave,
        bought: false,
      }));
      const relic = pick(
        r,
        RELICS.filter((x) => !r.relics.includes(x.id)),
      );
      if (relic && r.wave % 3 === 0)
        r.shopStock.push({
          kind: "relic",
          id: relic.id,
          label: relic.name,
          icon: relic.icon,
          desc: relic.desc,
          cost: 80 + r.wave * 3,
          stockId: `${r.wave}-${r.shopRefreshes}-relic`,
          bought: false,
        });
      else
        r.shopStock.push({
          kind: "shield",
          id: "shield",
          label: "應急護盾",
          icon: "◇",
          desc: "取得一次抵擋傷害的護盾；不能疊加。",
          cost: 18,
          stockId: `${r.wave}-${r.shopRefreshes}-shield`,
          bought: false,
        });
      r.shopStock.push({
        kind: "reroll",
        id: "reroll",
        label: "戰術重抽券",
        icon: "⟳",
        desc: "升級重抽次數 +1。",
        cost: 22,
        stockId: `${r.wave}-${r.shopRefreshes}-reroll`,
        bought: false,
      });
      r.shopWave = r.wave;
    }
    canBuy(item) {
      const r = this.r;
      if (
        !item ||
        item.bought ||
        r.gold < item.cost ||
        r.phase !== "intermission"
      )
        return false;
      if (item.kind === "weapon") {
        const w = r.weapons.find((x) => x.id === item.id);
        if (w) return w.level < 5;
        return r.weapons.length < 6;
      }
      if (item.kind === "evolve") {
        const w = r.weapons.find((x) => x.id === item.id),
          base = WEAPONS[item.id];
        return (
          !!w && w.level === 5 && !w.evolved && r.stats[base.req] >= base.need
        );
      }
      if (item.kind === "stat") return r.stats[item.id] < STATS[item.id].max;
      if (item.kind === "relic") return !r.relics.includes(item.id);
      if (item.kind === "shield") return !r.p.shield;
      return item.kind === "reroll";
    }
    buy(index) {
      const r = this.r,
        item = r.shopStock[index];
      if (!this.canBuy(item)) return false;
      r.gold -= item.cost;
      item.bought = true;
      r.shopBuys++;
      r.shopSpent += item.cost;
      if (["weapon", "evolve", "stat"].includes(item.kind))
        this.applyUpgrade(item);
      else if (item.kind === "relic") r.relics.push(item.id);
      else if (item.kind === "shield") r.p.shield = 1;
      else if (item.kind === "reroll") r.rerolls++;
      this.log(`補給商城：購入${item.label}。`);
      this.onSound("level");
      this.onPhase();
      return true;
    }
    refreshShop() {
      const r = this.r,
        cost = 12 + r.shopRefreshes * 4;
      if (r.phase !== "intermission" || r.gold < cost) return false;
      r.gold -= cost;
      r.shopSpent += cost;
      r.shopRefreshes++;
      this.ensureShop(true);
      this.onPhase();
      return true;
    }
    addHazard(x, y, radius, warning, damage, extra = {}) {
      const r = this.r;
      if (r.hazards.length >= 60) return;
      const boss = extra.bossOwner
          ? r.enemies.find((e) => e.id === extra.bossOwner)
          : null,
        scale = bossWarningScale(r, boss);
      if (boss?.adaptive) {
        damage =
          (13 + boss.adaptive.level * 0.5) *
          boss.adaptive.damage *
          (extra.shape === "beam" ? 1.25 : 1);
        extra = { color: BOSS_DATA[boss.bossIndex].color, ...extra };
      }
      r.hazards.push({
        x,
        y,
        radius,
        warning: warning > 0 ? Math.max(0.4, warning * scale) : 0,
        life: 0.4,
        damage,
        ...extra,
      });
    }
    initBossShield(e, r = this.r) {
      e.maxShield = e.maxShield ?? Math.round(e.maxHp * bossShieldRatio(r));
      e.shieldHp = e.shieldHp ?? e.maxShield;
      e.shieldTimer = e.shieldTimer ?? 0;
      e.shieldRecharges = e.shieldRecharges ?? 0;
      e.shieldBreaks = e.shieldBreaks ?? 0;
    }
    restoreBossShield(e, ratio = 0.55) {
      if (!e.maxShield) return;
      e.shieldHp = Math.round(e.maxShield * ratio);
      e.shieldTimer = 0;
      this.addFx("ring", e.x, e.y, {
        radius: 100,
        color: "#8deaff",
        life: 0.8,
      });
      this.log("Boss 防護罩重新啟動：先破盾才能傷害本體。");
    }
    bossSummon(e, n, types = ["runner", "gunner"]) {
      const r = this.r;
      if (e.adaptive?.modeId === "swarm")
        types = ["runner", "mini", "splitter"];
      for (let i = 0; i < n; i++) {
        const child = this.spawnEnemy(
          types[(i + e.attackCycle) % types.length],
          500,
        );
        if (child) {
          const a = (i / n) * Math.PI * 2 + e.age;
          child.x = clamp(e.x + Math.cos(a) * 145, 40, 2360);
          child.y = clamp(e.y + Math.sin(a) * 145, 40, 2360);
          child.bossGuard = true;
          child.cd = Math.max(child.cd, 1.5);
          this.addFx("ring", child.x, child.y, {
            radius: 28,
            color: "#8deaff",
            life: 0.5,
          });
        }
      }
    }
    queueBarrage(
      e,
      kind,
      count,
      pulses,
      interval,
      angle = 0,
      step = 0.22,
      speed = 150,
      turn = 0,
    ) {
      e.barrages = e.barrages || [];
      if (e.barrages.length >= 8) return;
      e.barrages.push({
        kind,
        count: clamp(Math.round(count), 1, 120),
        remaining: pulses,
        timer: 0.2,
        interval: Math.max(0.16, interval),
        angle,
        step,
        speed,
        turn,
        color: BOSS_DATA[e.bossIndex].color,
      });
    }
    updateBarrages(e, dt) {
      for (const b of e.barrages || []) {
        b.timer -= dt;
        if (b.timer > 0 || b.remaining <= 0) continue;
        const angle =
          b.kind === "fan"
            ? Math.atan2(this.r.p.y - e.y, this.r.p.x - e.x) + b.angle
            : b.angle;
        for (let i = 0; i < b.count; i++) {
          const a =
            angle +
            (b.kind === "fan"
              ? b.count === 1
                ? 0
                : (i / (b.count - 1) - 0.5) * 1.3
              : (i / b.count) * Math.PI * 2);
          this.enemyShot(e.x, e.y, a, b.speed, 5.5, b.kind === "fan" ? 5 : 4, {
            turn: b.turn,
            color: b.color,
            boss: true,
            ownerId: e.id,
          });
        }
        b.remaining--;
        b.timer += b.interval;
        b.angle += b.step;
      }
      e.barrages = (e.barrages || []).filter((b) => b.remaining > 0);
    }
    // 每隻 Boss 輪流施放五種主招，高難度再疊加獨立攻擊通道。
    bossAttack(e, angle, phase) {
      const r = this.r,
        p = r.p,
        d = difficultyRule(r),
        index = e.bossIndex,
        pattern = (e.attackCycle || 0) % 5,
        density =
          BOSS_DENSITIES[r.config.bossDensity] *
          d.bossDensity *
          (e.adaptive?.density || 1),
        count = (n) => Math.max(1, Math.round(n * density)),
        layers = bossLayers(r, phase, e);
      e.attackCycle = (e.attackCycle || 0) + 1;
      e.activeLayers = layers;
      const moves = [
        ["裂隙衝鋒", "噬星彈環", "虛空吞噬", "螺旋裂流", "十字裂隙"],
        ["熔核齊射", "天火轟炸", "衛隊與鎖定炮", "交錯火炮", "熔核封鎖"],
        ["蜂群降臨", "結晶針雨", "女皇領域", "追魂針簇", "冰晶螺旋"],
        ["雙旋星環", "末日連鎖", "奇點斬擊", "反轉星潮", "終焉矩陣"],
      ];
      e.currentMove =
        moves[index][pattern] + (layers > 1 ? " · " + layers + " 重連攻" : "");
      const ring = (n, speed = 145, offset = 0, turn = 0) => {
        for (let i = 0; i < count(n); i++)
          this.enemyShot(
            e.x,
            e.y,
            (i / count(n)) * Math.PI * 2 + offset,
            speed,
            5.5,
            4,
            {
              turn,
              color: BOSS_DATA[index].color,
              boss: true,
              ownerId: e.id,
            },
          );
      };
      const circles = (n, rad = 58, spread = 130) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + e.age * 0.15;
          this.addHazard(
            clamp(p.x + Math.cos(a) * spread, 30, 2370),
            clamp(p.y + Math.sin(a) * spread, 30, 2370),
            rad,
            1.2 + i * 0.1,
            24 + r.wave,
            { bossOwner: e.id },
          );
        }
      };
      const beam = (a, warning = 1.15, width = 23) =>
        this.addHazard(e.x, e.y, 0, warning, 27 + r.wave, {
          shape: "beam",
          angle: a,
          length: 720,
          width,
          bossOwner: e.id,
          life: 0.55,
        });
      if (index === 0) {
        if (pattern === 0) {
          e.angle = angle;
          e.bossCharge = Math.max(0.35, 1.05 * bossWarningScale(r, e));
          this.addHazard(e.x, e.y, 0, 1.05, 26 + r.wave, {
            shape: "beam",
            angle,
            length: 340,
            width: 30,
            bossOwner: e.id,
          });
        }
        if (pattern === 1)
          this.queueBarrage(
            e,
            "ring",
            count(18 + phase * 2),
            2 + phase,
            0.55,
            e.age * 0.15,
            0.18,
            135 + phase * 12,
          );
        if (pattern === 2) {
          this.addHazard(p.x, p.y, 85 + phase * 5, 1.25, 24 + r.wave, {
            bossOwner: e.id,
          });
          circles(Math.min(6, 2 + phase), 52, 155);
        }
        if (pattern === 3)
          this.queueBarrage(
            e,
            "spiral",
            count(9),
            5 + phase,
            0.32,
            angle,
            0.32,
            150,
            phase > 1 ? 0.2 : 0,
          );
        if (pattern === 4) {
          beam(angle - 0.38);
          beam(angle + 0.38, 1.4);
          ring(16, 150, angle + 0.15);
        }
      }
      if (index === 1) {
        if (pattern === 0) {
          const n = count(10);
          for (let i = 0; i < n; i++)
            this.enemyShot(
              e.x,
              e.y,
              angle + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.15),
              205 + phase * 12,
              5,
              6,
              { color: "#ffb575", boss: true, ownerId: e.id },
            );
        }
        if (pattern === 1) {
          circles(Math.min(8, count(3 + phase)), 60, 135);
          this.addHazard(p.x, p.y, 60, 1.6, 25 + r.wave, { bossOwner: e.id });
        }
        if (pattern === 2) {
          this.bossSummon(e, Math.min(8, count(phase + 1)), [
            "tank",
            "gunner",
            "shield",
          ]);
          beam(angle, 1.25);
        }
        if (pattern === 3) {
          this.queueBarrage(e, "fan", count(11), 3 + phase, 0.4, 0, 0.13, 205);
          beam(angle - 0.6, 1.4);
          beam(angle + 0.6, 1.4);
        }
        if (pattern === 4) {
          ring(20, 130, angle);
          circles(4 + phase, 48, 195);
        }
      }
      if (index === 2) {
        if (pattern === 0)
          this.bossSummon(e, Math.min(10, count(3 + phase)), [
            "runner",
            "mini",
            "bomber",
          ]);
        if (pattern === 1)
          this.queueBarrage(
            e,
            "fan",
            count(12),
            2 + phase,
            0.42,
            0,
            0.1,
            210 + phase * 10,
          );
        if (pattern === 2) circles(Math.min(10, count(5 + phase)), 48, 170);
        if (pattern === 3) {
          this.queueBarrage(e, "fan", count(7), 5, 0.32, 0, -0.12, 230);
          this.bossSummon(e, 2 + phase, ["runner", "gunner"]);
        }
        if (pattern === 4) {
          this.queueBarrage(
            e,
            "spiral",
            count(10),
            5 + phase,
            0.34,
            angle,
            -0.28,
            155,
            -0.18,
          );
          circles(3, 60, 120);
        }
      }
      if (index === 3) {
        if (pattern === 0) {
          ring(18 + phase * 3, 130, e.age * 0.13, 0.14);
          this.queueBarrage(
            e,
            "ring",
            count(16),
            2 + phase,
            0.5,
            -e.age * 0.13,
            -0.25,
            175,
            -0.12,
          );
        }
        if (pattern === 1) {
          for (let i = 0; i < phase + 3; i++)
            this.addHazard(
              clamp(p.x + Math.cos(angle) * (i - 1) * 95, 30, 2370),
              clamp(p.y + Math.sin(angle) * (i - 1) * 95, 30, 2370),
              58,
              1 + i * 0.18,
              26 + r.wave,
              { bossOwner: e.id },
            );
        }
        if (pattern === 2) {
          for (let i = 0; i < phase + 1; i++)
            beam(angle + (i * Math.PI) / 2, 1.2 + i * 0.12, 22);
        }
        if (pattern === 3) {
          this.queueBarrage(
            e,
            "spiral",
            count(12),
            6,
            0.3,
            angle,
            0.3,
            150,
            0.24,
          );
          this.queueBarrage(
            e,
            "spiral",
            count(8),
            4,
            0.45,
            -angle,
            -0.3,
            185,
            -0.2,
          );
        }
        if (pattern === 4) {
          circles(4 + phase, 55, 145);
          beam(angle, 1.35);
          beam(angle + Math.PI / 2, 1.65);
        }
      }
      // Independent channels overlap the primary move, including while a charge is active.
      if (layers >= 2)
        this.queueBarrage(
          e,
          d.id >= 2 ? "spiral" : "ring",
          count(10 + phase * 2),
          3 + phase,
          0.42,
          angle + 0.2,
          (e.attackCycle % 2 ? 1 : -1) * 0.23,
          150 + phase * 10,
          d.id >= 2 ? 0.15 : 0,
        );
      if (layers >= 3) {
        this.addHazard(p.x, p.y, 62, 1.15, 23 + r.wave, { bossOwner: e.id });
        circles(2 + phase, 46, 160);
      }
      if (layers >= 4) {
        beam(angle + 0.5, 1.35, 19);
        this.queueBarrage(e, "fan", count(7), 3, 0.48, 0, -0.15, 220);
      }
      if (e.adaptive?.modeId === "comet" && e.attackCycle % 2 === 0)
        this.addHazard(
          clamp(p.x - p.dx * 80, 30, 2370),
          clamp(p.y - p.dy * 80, 30, 2370),
          55,
          1.8,
          20,
          { bossOwner: e.id },
        );
      this.addFx("chargeAura", e.x, e.y, {
        radius: 75,
        color: BOSS_DATA[index].color,
        style: index,
        life: 0.55,
      });
      this.combatImpact(
        e.x,
        e.y,
        "cast",
        BOSS_DATA[index].color,
        2.2,
        index,
        angle,
      );
      this.addFx("ring", e.x, e.y, {
        radius: 105,
        color: BOSS_DATA[index].color,
        life: 0.65,
      });
    }
    // 新遠征：研究、武器配置與模組在這裡固定為本局數據。
    newRun(
      shipId = "scout",
      mode = "campaign",
      difficulty = 0,
      seed = Date.now(),
      config = {},
    ) {
      const s = SHIPS.find((s) => s.id === shipId) || SHIPS[0],
        m = this.profile.research;
      const cfg = normalizeConfig(config),
        weapon = startingWeapon(s, cfg),
        hp = startingHp(s, weapon) + (m.hull || 0) * 8;
      difficulty = clamp(Math.round(Number(difficulty) || 0), -1, 4);
      this.r = {
        version: VERSION,
        id: `${Date.now()}-${seed}`,
        rng: seed >>> 0 || 1,
        seed: seed >>> 0,
        mode,
        difficulty,
        config: cfg,
        startWeapon: weapon,
        module: this.profile.moduleEquipped || "none",
        waveType: "normal",
        objective: null,
        caches: [],
        cacheTimer: 14,
        combo: 0,
        comboTimer: 0,
        maxCombo: 0,
        bossIntro: 0,
        shopStock: [],
        shopRefreshes: 0,
        shopWave: 0,
        shopBuys: 0,
        shopSpent: 0,
        bossIndexNext: 0,
        ship: shipId,
        phase: "play",
        wave: 1,
        sector: 1,
        region: REGIONS[0].id,
        time: 0,
        waveTime: 0,
        spawnTimer: 0.6,
        hazardTimer: 12,
        bossSpawned: false,
        bossDead: false,
        research: { ...m },
        p: {
          x: 1200,
          y: 1200,
          dx: 0,
          dy: -1,
          hp,
          maxHp: hp,
          speed: s.speed,
          inv: 2,
          dashTime: 0,
          dashCD: 0,
          burstCD: 0,
          shield: 0,
          shieldTimer: 0,
          level: 1,
          xp: 0,
          xpNeed: 14,
        },
        weapons: [{ id: weapon, level: 1, evolved: false, cd: 0.1 }],
        stats: {
          damage: 0,
          fire: 0,
          hp: 0,
          armor: s.id === "bulwark" ? 1 : 0,
          speed: 0,
          crit: 0,
          magnet: 0,
          regen: 0,
          projectile: 0,
        },
        relics: [],
        enemies: [],
        bullets: [],
        enemyBullets: [],
        gems: [],
        hazards: [],
        burns: [],
        kills: 0,
        bosses: 0,
        gold: 0,
        evolutions: 0,
        rerolls: 3,
        pendingLevels: 0,
        offers: [],
        log: ["你已進入瑩光星雲。收集晶礦，尋找出口。"],
        secondUsed: false,
        stepCount: 0,
        ending: false,
        rewarded: false,
        intermissionKind: "",
        eventDone: false,
        damageTotal: 0,
      };
      this.applyStartingModule();
      this.prepareWave();
      this.fx = [];
      this.shake = 0;
      this.zoomPulse = 0;
      this.screenPulse = 0;
      this.lastImpact = -10;
      this.nextId = 1;
      this.profile.runs++;
      if (!this.profile.ships.includes(shipId)) this.profile.ships.push(shipId);
      this.spawnEnemy("scout", 400);
      this.onPhase();
      return this.r;
    }
    stat(id) {
      return this.r.stats[id] || 0;
    }
    has(id) {
      return this.r.relics.includes(id);
    }
    region() {
      return REGIONS.find((x) => x.id === this.r.region) || REGIONS[0];
    }
    damageMult(id) {
      const m = this.r.research || this.profile.research;
      return (
        (1 + this.stat("damage") * 0.15 + (m.reactor || 0) * 0.04) *
        (this.has("glass") ? 1.35 : 1) *
        (this.has("orbit") && ["orbit", "nova"].includes(id) ? 1.4 : 1) *
        (this.region().damage || 1) *
        (this.r.config.mutator === "glass"
          ? 1.3
          : this.r.config.mutator === "salvage"
            ? 0.9
            : 1)
      );
    }
    setPhase(phase) {
      this.r.phase = phase;
      if (phase === "intermission") this.ensureShop();
      this.onPhase();
    }
    log(text) {
      this.r.log.unshift(text);
      this.r.log = this.r.log.slice(0, 8);
    }
    addFx(type, x, y, opts = {}) {
      if (this.fx.length >= 220) this.fx.shift();
      this.fx.push({
        type,
        x,
        y,
        life: opts.life || 0.4,
        maxLife: opts.life || 0.4,
        ...opts,
      });
    }
    // 重要命中的鏡頭脈衝與能量波；有間隔與上限，密集彈幕不會一直抖。
    combatImpact(
      x,
      y,
      kind,
      color = "#91f5e4",
      strength = 5,
      style = 0,
      angle = 0,
    ) {
      this.addFx("shockwave", x, y, {
        radius:
          kind === "death"
            ? 280
            : kind === "phase"
              ? 190
              : kind === "shield"
                ? 140
                : 90,
        color,
        style,
        angle,
        life: kind === "death" ? 0.95 : 0.6,
      });
      if (this.r.time - this.lastImpact < 0.16) return;
      this.lastImpact = this.r.time;
      this.shake = Math.max(this.shake, Math.min(14, strength));
      this.zoomPulse = Math.max(this.zoomPulse, kind === "cast" ? 0.15 : 0.65);
      this.screenPulse = Math.max(
        this.screenPulse,
        kind === "cast" ? 0.08 : 0.3,
      );
      this.screenColor = color;
      if (["shield", "phase", "death", "blast"].includes(kind))
        this.onSound(
          kind === "shield"
            ? "shieldBreak"
            : kind === "phase"
              ? "phase"
              : "slam",
        );
    }
    // Boss 與小怪共用入口；Boss 在生成時固定自適應配置。
    spawnEnemy(type = null, radius = null) {
      const r = this.r,
        cap = ENEMY_AMOUNTS[r.config.enemyAmount].cap;
      if (r.enemies.filter((e) => !e.dead).length >= cap) {
        if (type === "boss") {
          const i = r.enemies.findIndex((e) => e.type !== "boss");
          if (i >= 0) r.enemies.splice(i, 1);
        } else return null;
      }
      const wave = r.wave,
        d = difficultyRule(r),
        variant = waveType(r);
      if (!type) type = pick(r, enemyPool(r));
      const angle = seeded(r) * Math.PI * 2,
        rad = radius || Math.min(700, this.viewRadius + 90);
      let x = clamp(r.p.x + Math.cos(angle) * rad, 30, 2370),
        y = clamp(r.p.y + Math.sin(angle) * rad, 30, 2370);
      if (Math.hypot(x - r.p.x, y - r.p.y) < 180) {
        x = clamp(r.p.x - Math.cos(angle) * rad, 30, 2370);
        y = clamp(r.p.y - Math.sin(angle) * rad, 30, 2370);
      }
      const hp = (16 + wave * 4.2) * d.hp * variant.hp,
        speed = (56 + wave * 2) * d.speed * (this.region().speed || 1);
      const e = {
        id: this.nextId++,
        type,
        x,
        y,
        hp,
        maxHp: hp,
        speed,
        radius: 13,
        contact: 9 + wave * 0.9,
        slow: 0,
        stun: 0,
        hit: 0,
        cd: 1 + seeded(r) * 2,
        attackTimer: 0,
        angle: 0,
        charge: 0,
        dx: 0,
        dy: 0,
        age: 0,
      };
      if (type === "runner") {
        e.hp *= 0.65;
        e.speed *= 1.9;
        e.radius = 10;
        e.contact *= 0.8;
      }
      if (type === "tank") {
        e.hp *= 3;
        e.speed *= 0.66;
        e.radius = 22;
        e.contact *= 1.4;
      }
      if (type === "sniper") {
        e.hp *= 0.9;
        e.speed *= 0.75;
        e.radius = 14;
      }
      if (type === "charger") {
        e.hp *= 1.65;
        e.radius = 17;
        e.speed *= 1.1;
      }
      if (type === "splitter") {
        e.hp *= 1.6;
        e.radius = 19;
      }
      if (type === "mini") {
        e.hp *= 0.4;
        e.radius = 8;
        e.speed *= 1.5;
      }
      if (type === "shield") {
        e.hp *= 1.8;
        e.speed *= 0.75;
        e.radius = 20;
      }
      if (type === "healer") {
        e.hp *= 1.2;
        e.speed *= 0.75;
        e.radius = 15;
        e.cd = 3;
      }
      if (type === "bomber") {
        e.hp *= 0.75;
        e.speed *= 1.35;
        e.radius = 12;
      }
      if (type === "gunner") {
        e.hp *= 1.15;
        e.speed *= 0.7;
        e.radius = 16;
      }
      const eliteChance =
        r.config.eliteRate === "none"
          ? 0
          : ((r.config.eliteRate === "many" ? 0.24 : 0.075) +
              (variant.id === "hunt" ? 0.12 : 0)) *
            d.elite;
      if (
        type !== "boss" &&
        type !== "mini" &&
        wave >= 3 &&
        seeded(r) < eliteChance
      ) {
        e.elite = pick(r, ["armored", "swift", "volatile", "regenerating"]);
        e.hp *= 2;
        e.contact *= 1.15;
        if (e.elite === "swift") e.speed *= 1.3;
        if (wave >= 6 && seeded(r) < 0.2) {
          e.champion = true;
          e.hp *= 1.5;
          e.radius *= 1.18;
          e.contact *= 1.15;
        }
      }
      if (type === "boss") {
        const c = r.config,
          choice = BOSS_DATA.findIndex((x) => x.id === c.bossRoster);
        e.bossIndex =
          choice >= 0
            ? choice
            : c.bossRoster === "random"
              ? Math.floor(seeded(r) * 4)
              : r.mode !== "endless" && r.wave === c.totalWaves && c.finalBoss
                ? 3
                : r.bosses % 4;
        e.adaptive = createBossEncounter(r);
        e.hp = e.adaptive.body;
        e.radius = 58;
        e.speed = (48 + wave) * d.speed;
        e.contact =
          (14 + e.adaptive.level * 0.3) *
          e.adaptive.damage *
          (1 + c.bossStrength * 0.15);
        e.cd = Math.max(2.2, bossCooldown(r, 1, e));
        e.attackCycle = 0;
        e.phaseLevel = 1;
        e.bossCharge = 0;
        e.barrages = [];
        e.guardTimer = 4;
        e.maxShield = e.adaptive.shield;
        e.shieldHp = e.maxShield;
        e.shieldTimer = 0;
        e.shieldRecharges = 0;
        e.shieldBreaks = 0;
        e.x = clamp(r.p.x + 150, 120, 2280);
        e.y = clamp(r.p.y - 240, 120, 2280);
        this.combatImpact(
          e.x,
          e.y,
          "phase",
          BOSS_DATA[e.bossIndex].color,
          11,
          e.bossIndex,
        );
        r.bossSpawned = true;
        r.bossIntro = 2.6;
        r.bossIndexNext = e.bossIndex;
        r.p.inv = Math.max(r.p.inv, 1.7);
        this.log(`${BOSSES[e.bossIndex]}接近。避開紅色預警！`);
        this.onSound("boss");
      }
      e.maxHp = e.hp;
      r.enemies.push(e);
      return e;
    }
    dash(dx = 0, dy = 0) {
      const r = this.r;
      if (!r || r.phase !== "play" || r.p.dashCD > 0) return false;
      const p = r.p,
        n = Math.hypot(dx, dy);
      if (n > 0) {
        p.dx = dx / n;
        p.dy = dy / n;
      }
      p.dashTime = 0.24;
      p.inv = Math.max(p.inv, 0.55);
      p.dashCD =
        (r.ship === "scout" ? 2.4 : 3.2) *
        (this.has("dash") ? 0.6 : 1) *
        (r.module === "vector" ? 0.85 : 1);
      if (r.objective?.kind === "dash") r.objective.progress++;
      this.addFx("ring", p.x, p.y, { color: "#91f5e4", radius: 55 });
      this.onSound("dash");
      return true;
    }
    burst() {
      const r = this.r;
      if (!r || r.phase !== "play" || r.p.burstCD > 0) return false;
      const p = r.p,
        range = this.has("battery") ? 380 : 300;
      p.burstCD = this.has("battery") ? 17.5 : 25;
      this.explode(
        p.x,
        p.y,
        range,
        (75 + r.wave * 3) * (this.has("battery") ? 1.3 : 1),
        "burst",
        true,
      );
      p.inv = Math.max(p.inv, 0.7);
      r.enemyBullets = r.enemyBullets.filter((b) => dist(b, p) > range);
      this.shake = 10;
      this.onSound("burst");
      return true;
    }
    hurtPlayer(amount) {
      const r = this.r,
        p = r.p;
      if (p.inv > 0) return;
      if (p.shield) {
        p.shield = 0;
        p.inv = 0.8;
        this.addFx("ring", p.x, p.y, { color: "#c2adff", radius: 90 });
        return;
      }
      p.hp -= Math.max(
        1,
        amount *
          difficultyRule(r).damage *
          (1 - this.stat("armor") * 0.08) *
          (this.has("glass") ? 1.2 : 1),
      );
      p.inv = difficultyRule(r).hitInv;
      this.shake = 7;
      this.addFx("ring", p.x, p.y, { color: "#ff709b", radius: 35 });
      this.onSound("hurt");
      if (p.hp <= 0) {
        if (this.has("second") && !r.secondUsed) {
          r.secondUsed = true;
          p.hp = p.maxHp * 0.5;
          p.inv = 3;
          this.log("第二黎明啟動。你獲得一次重新開始的機會。");
          this.burst();
        } else {
          p.hp = 0;
          this.finish(false);
        }
      }
    }
    // 傷害順序：武器增幅 → 暴擊 → 護盾阻擋 → 本體裝甲。
    hitEnemy(e, amount, weapon = "", effects = {}) {
      if (e.dead) return;
      const r = this.r;
      let dmg = amount * this.damageMult(weapon),
        critChance =
          0.04 +
          this.stat("crit") * 0.08 +
          (r.ship === "storm" ? 0.12 : 0) +
          (this.has("crit") ? 0.15 : 0);
      if (e.elite === "armored") dmg *= 0.8;
      if (e.type === "shield") dmg *= 0.7;
      const crit = seeded(r) < critChance;
      if (crit) dmg *= this.has("crit") ? 2.6 : 2;
      if (e.slow > 0 && this.has("frost")) dmg *= 1.45;
      if (e.type === "boss" && e.shieldHp > 0) {
        const absorbed = Math.min(e.shieldHp, dmg);
        e.shieldHp = Math.max(0, e.shieldHp - dmg);
        r.damageTotal += absorbed;
        e.hit = 0.11;
        if (e.shieldHp === 0) {
          e.shieldBreaks++;
          e.shieldTimer = 24;
          this.log("防護罩擊破！本體暴露，集中火力。");
          this.addFx("ring", e.x, e.y, {
            radius: 140,
            color: "#8deaff",
            life: 0.7,
          });
          this.combatImpact(e.x, e.y, "shield", "#8deaff", 9, e.bossIndex);
          this.onSound("electric");
        }
        if (this.fx.filter((x) => x.type === "text").length < 28)
          this.addFx("text", e.x, e.y - 25, {
            text: "◇ " + Math.round(absorbed),
            color: "#8deaff",
            life: 0.5,
          });
        return;
      }
      if (e.type === "boss")
        dmg *= 1 - (e.adaptive?.armor ?? difficultyRule(r).bossArmor);
      e.hp -= dmg;
      r.damageTotal += dmg;
      e.hit = 0.11;
      if (effects.slow)
        e.slow = Math.max(
          e.slow,
          effects.slow * (e.type === "boss" ? 0.35 : 1),
        );
      if (effects.stun)
        e.stun = Math.max(
          e.stun,
          e.type === "boss" ? Math.min(0.2, effects.stun) : effects.stun,
        );
      if (this.fx.filter((x) => x.type === "text").length < 28)
        this.addFx("text", e.x, e.y - 15, {
          text: Math.round(dmg),
          color: crit ? "#ffdf8c" : "#d4f4ff",
          life: 0.55,
          crit,
        });
      if (e.hp <= 0) this.killEnemy(e);
    }
    killEnemy(e) {
      if (e.dead) return;
      e.dead = true;
      const r = this.r;
      r.kills++;
      if (e.type !== "boss") r.waveKills++;
      r.combo = r.comboTimer > 0 ? r.combo + 1 : 1;
      r.comboTimer = 4;
      r.maxCombo = Math.max(r.maxCombo, r.combo);
      if (r.combo % 20 === 0) {
        r.gold += 8;
        this.log(`連鎖擊破 ${r.combo}！額外晶礦 +8。`);
      }
      if (
        r.objective &&
        (r.objective.kind === "kills" ||
          (r.objective.kind === "elite" && e.elite))
      )
        r.objective.progress++;
      const reward =
        e.type === "boss"
          ? 25
          : e.champion
            ? 9
            : e.elite
              ? 5
              : e.type === "tank"
                ? 3
                : 1;
      r.gold +=
        reward *
        (this.has("harvest") ? 1.3 : 1) *
        (this.region().gold || 1) *
        (1 + (r.research.fortune || 0) * 0.05) *
        (r.config.mutator === "salvage" ? 1.3 : 1);
      if (r.gems.length >= 250) {
        const g = r.gems[0];
        g.value += e.type === "boss" ? 35 : e.type === "tank" ? 4 : 2;
      } else
        r.gems.push({
          x: e.x,
          y: e.y,
          value: e.type === "boss" ? 35 : e.type === "tank" ? 4 : 2,
          kind: "xp",
        });
      if (e.elite === "volatile")
        this.addHazard(e.x, e.y, 58, 1, 12 + r.wave, { life: 0.3 });
      if (e.type === "boss") {
        r.enemyBullets = r.enemyBullets.filter((b) => !b.boss);
        r.hazards = r.hazards.filter((h) => h.bossOwner !== e.id);
        r.bossDead = true;
        r.bosses++;
        r.gold += 35;
        this.log(`${BOSSES[e.bossIndex]}已擊破。航道暫時安全。`);
        this.addFx("ring", e.x, e.y, {
          radius: 240,
          color: "#ffb479",
          life: 1,
        });
        this.combatImpact(
          e.x,
          e.y,
          "death",
          BOSS_DATA[e.bossIndex].color,
          14,
          e.bossIndex,
        );
        this.onSound("victory");
      }
      if (e.type === "splitter") {
        for (let i = 0; i < 2; i++) {
          const child = this.spawnEnemy("mini", 500);
          if (child) {
            child.x = e.x + (i ? 18 : -18);
            child.y = e.y + 10;
          }
        }
      }
      if (this.has("vamp") && r.kills % 12 === 0)
        r.p.hp = Math.min(r.p.maxHp, r.p.hp + 4);
      if (seeded(r) < 0.025 && r.gems.length < 250)
        r.gems.push({ x: e.x + 10, y: e.y, kind: "heal", value: 10 });
      this.addFx("spark", e.x, e.y, {
        color: e.type === "boss" ? "#ffb479" : "#bb9fff",
        radius: e.radius,
        life: 0.45,
      });
      if (this.has("nova") && seeded(r) < 0.15 && e.type !== "mini") {
        r.burns.push({
          x: e.x,
          y: e.y,
          radius: 60,
          life: 0.16,
          tick: 0,
          damage: 18,
          source: "echo",
        });
        this.addFx("ring", e.x, e.y, { radius: 60, color: "#ff94c7" });
      }
    }
    rebuildHash() {
      this.hash.clear();
      for (const e of this.r.enemies) {
        if (e.dead) continue;
        const k = `${Math.floor(e.x / 100)},${Math.floor(e.y / 100)}`;
        if (!this.hash.has(k)) this.hash.set(k, []);
        this.hash.get(k).push(e);
      }
    }
    nearby(x, y, radius) {
      const list = [];
      for (
        let ix = Math.floor((x - radius) / 100);
        ix <= Math.floor((x + radius) / 100);
        ix++
      )
        for (
          let iy = Math.floor((y - radius) / 100);
          iy <= Math.floor((y + radius) / 100);
          iy++
        ) {
          const a = this.hash.get(`${ix},${iy}`);
          if (a) list.push(...a);
        }
      return list;
    }
    explode(x, y, radius, damage, source, stun = false) {
      if (source === "burst" || source === "nova")
        this.combatImpact(
          x,
          y,
          "blast",
          source === "burst" ? "#91f5e4" : "#ff94c7",
          source === "burst" ? 10 : 4,
          source === "burst" ? 3 : 2,
        );
      this.addFx("ring", x, y, {
        radius,
        color:
          source === "missile"
            ? "#ffb479"
            : source === "burst"
              ? "#91f5e4"
              : "#ff94c7",
        life: 0.55,
      });
      for (const e of this.nearby(x, y, radius + 55)) {
        if (!e.dead && Math.hypot(e.x - x, e.y - y) < radius + e.radius) {
          this.hitEnemy(e, damage, source, { stun: stun ? 0.65 : 0 });
          const a = Math.atan2(e.y - y, e.x - x);
          const push = e.type === "boss" ? 4 : 25;
          e.x = clamp(e.x + Math.cos(a) * push, 0, 2400);
          e.y = clamp(e.y + Math.sin(a) * push, 0, 2400);
        }
      }
    }
    closest(x, y, max = 620, exclude = []) {
      let target = null,
        best = max;
      for (const e of this.r.enemies) {
        if (e.dead || exclude.includes(e.id)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      return target;
    }
    fireWeapon(w) {
      const r = this.r,
        p = r.p,
        base = WEAPONS[w.id],
        lv = w.level,
        extra = this.stat("projectile"),
        target = this.closest(p.x, p.y),
        damage = base.damage * (1 + (lv - 1) * 0.24) * (w.evolved ? 1.5 : 1);
      if (!target && w.id !== "nova" && w.id !== "orbit") return;
      if (w.id === "pulse" || w.id === "frost" || w.id === "missile") {
        const count =
          (w.id === "pulse"
            ? w.evolved
              ? 3
              : 1 + Math.floor(lv / 3)
            : w.id === "frost"
              ? w.evolved
                ? 10
                : 3 + Math.floor(lv / 2)
              : w.evolved
                ? 4
                : 1 + Math.floor(lv / 3)) + extra;
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        for (let i = 0; i < count; i++) {
          const a =
            w.id === "frost" && w.evolved
              ? (i / count) * Math.PI * 2
              : angle +
                (i - (count - 1) / 2) * (w.id === "frost" ? 0.19 : 0.12);
          if (r.bullets.length < 350)
            r.bullets.push({
              id: this.nextId++,
              x: p.x,
              y: p.y,
              px: p.x,
              py: p.y,
              vx: Math.cos(a) * base.speed,
              vy: Math.sin(a) * base.speed,
              damage,
              radius: w.id === "missile" ? 7 : 4,
              color: base.color,
              life: w.id === "missile" ? 4 : 1.65,
              source: w.id,
              pierce:
                w.id === "pulse"
                  ? 1 + Math.floor(lv / 2) + (w.evolved ? 3 : 0)
                  : w.id === "frost" && w.evolved
                    ? 2
                    : 1,
              hitIds: [],
              targetId: target.id,
              evolved: w.evolved,
            });
        }
        this.onSound("shot");
      } else if (w.id === "lightning") {
        let current = target,
          ids = [],
          x = p.x,
          y = p.y;
        const count = (2 + lv) * (w.evolved ? 2 : 1);
        for (let i = 0; i < count && current; i++) {
          ids.push(current.id);
          this.addFx("bolt", x, y, {
            tx: current.x,
            ty: current.y,
            color: base.color,
            life: 0.22,
          });
          this.hitEnemy(current, damage * (i ? 0.85 : 1), "lightning");
          x = current.x;
          y = current.y;
          current = this.closest(x, y, 230, ids);
        }
        this.onSound("electric");
      } else if (w.id === "nova") {
        this.explode(
          p.x,
          p.y,
          (100 + lv * 15) * (w.evolved ? 1.5 : 1),
          damage,
          "nova",
          w.evolved,
        );
        this.onSound("nova");
      }
    }
    collectGem(g) {
      const r = this.r;
      if (g.dead) return;
      if (r.objective?.kind === "collect") r.objective.progress++;
      if (g.kind === "heal") {
        r.p.hp = Math.min(r.p.maxHp, r.p.hp + g.value);
        this.addFx("text", r.p.x, r.p.y - 30, {
          text: `+${g.value} HP`,
          color: "#a0f8c9",
          life: 0.7,
        });
      } else {
        r.p.xp +=
          g.value *
          (1 + this.stat("magnet") * 0.05) *
          (this.has("harvest") ? 1.3 : 1) *
          (this.region().xp || 1);
        while (r.p.xp >= r.p.xpNeed) {
          r.p.xp -= r.p.xpNeed;
          r.p.level++;
          r.p.xpNeed = 14 + (r.p.level - 1) * 8;
          r.pendingLevels++;
        }
      }
      g.dead = true;
    }
    enemyShot(x, y, angle, speed = 160, life = 5, radius = 6, opts = {}) {
      const r = this.r;
      if (r.enemyBullets.length >= 480) return;
      const boss = opts.ownerId
          ? r.enemies.find((e) => e.id === opts.ownerId)
          : null,
        a = boss?.adaptive;
      speed *= difficultyRule(r).shot * (a?.projectileSpeed || 1);
      const damage = a
        ? (9 + a.level * 0.45) * a.damage
        : (10 + r.wave * 0.9) * (opts.boss ? 1.25 : 1);
      if (a?.modeId === "ion")
        opts = { ...opts, turn: (opts.turn || 0) + 0.035 };
      r.enemyBullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        life,
        damage,
        ...opts,
      });
    }
    updateEnemy(e, dt) {
      const r = this.r,
        p = r.p,
        warningScale = difficultyRule(r).warning;
      e.age += dt;
      e.hit = Math.max(0, e.hit - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.cd -= dt;
      const d = dist(e, p),
        angle = Math.atan2(p.y - e.y, p.x - e.x);
      let speed = e.speed * (e.slow > 0 ? (e.type === "boss" ? 0.8 : 0.48) : 1);
      if (e.stun > 0) speed = 0;
      if (e.elite === "regenerating")
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.014 * dt);
      if (e.type === "sniper") {
        if (d < 220) speed = -speed;
        if (d > 220 && d < 360) speed = 0;
        if (e.cd <= 0 && !e.attackTimer) {
          e.attackTimer = 0.7 * warningScale;
          e.angle = angle;
          this.addFx("aim", e.x, e.y, {
            tx: e.x + Math.cos(angle) * 600,
            ty: e.y + Math.sin(angle) * 600,
            color: "#ff709b",
            life: 0.7 * warningScale,
          });
        }
        if (e.attackTimer > 0) {
          e.attackTimer -= dt;
          speed = 0;
          if (e.attackTimer <= 0) {
            this.enemyShot(e.x, e.y, e.angle, 245);
            e.cd = 2.8;
          }
        }
      }
      if (e.type === "charger") {
        if (e.cd <= 0 && e.charge === 0) {
          e.charge = 0.55 * warningScale;
          e.angle = angle;
          e.cd = 4.5;
          this.addFx("aim", e.x, e.y, {
            tx: e.x + Math.cos(angle) * 330,
            ty: e.y + Math.sin(angle) * 330,
            color: "#ffb479",
            life: 0.55 * warningScale,
          });
        }
        if (e.charge > 0) {
          e.charge -= dt;
          speed = 0;
          if (e.charge <= 0) {
            e.charge = -0.65;
            e.dx = Math.cos(e.angle);
            e.dy = Math.sin(e.angle);
          }
        } else if (e.charge < 0) {
          e.x += e.dx * 440 * dt;
          e.y += e.dy * 440 * dt;
          e.charge = Math.min(0, e.charge + dt);
          speed = 0;
        }
      }
      if (e.type === "shield" && d < 150) speed *= 0.5;
      if (e.type === "healer") {
        if (d < 250) speed = -speed;
        else if (d < 380) speed = 0;
        if (e.cd <= 0) {
          const allies = r.enemies
            .filter(
              (a) =>
                !a.dead &&
                a.id !== e.id &&
                a.type !== "boss" &&
                a.hp < a.maxHp &&
                dist(a, e) < 190,
            )
            .slice(0, 3);
          for (const a of allies) {
            a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.08);
            this.addFx("bolt", e.x, e.y, {
              tx: a.x,
              ty: a.y,
              color: "#a0f8c9",
              life: 0.4,
            });
          }
          e.cd = 5;
        }
      }
      if (e.type === "gunner") {
        if (d < 210) speed = -speed;
        else if (d < 350) speed = 0;
        if (e.cd <= 0 && !e.attackTimer) {
          e.attackTimer = 0.85 * warningScale;
          e.angle = angle;
          this.addFx("aim", e.x, e.y, {
            tx: e.x + Math.cos(angle) * 500,
            ty: e.y + Math.sin(angle) * 500,
            color: "#ffdc91",
            life: 0.85 * warningScale,
          });
        }
        if (e.attackTimer > 0) {
          e.attackTimer -= dt;
          speed = 0;
          if (e.attackTimer <= 0) {
            for (let i = -1; i <= 1; i++)
              this.enemyShot(e.x, e.y, e.angle + i * 0.18, 175);
            e.cd = 3.8;
          }
        }
      }
      if (e.type === "bomber") {
        if (d < 100 && !e.detonating) {
          e.detonating = true;
          e.attackTimer = 1.25 * warningScale;
          this.addHazard(e.x, e.y, 90, 1.25, 18 + r.wave);
        }
        if (e.detonating) {
          speed = 0;
          e.attackTimer -= dt;
          if (e.attackTimer <= 0) {
            e.dead = true;
            return;
          }
        }
      }
      if (e.type === "boss") {
        if (d < 170) speed *= 0.25;
        const phase = bossPhase(r, e);
        if (phase > e.phaseLevel) {
          e.phaseLevel = phase;
          e.shieldRecharges = 0;
          if (r.config.shieldRecovery !== "none")
            this.restoreBossShield(e, difficultyRule(r).id >= 3 ? 0.7 : 0.55);
          e.cd = Math.max(1.2, bossCooldown(r, phase, e) * 0.6);
          r.bossIntro = 1.5;
          this.log(
            `${BOSSES[e.bossIndex]}進入${phase === 3 ? "終焉" : "狂暴"}階段。`,
          );
          this.combatImpact(
            e.x,
            e.y,
            "phase",
            BOSS_DATA[e.bossIndex].color,
            12,
            e.bossIndex,
          );
        }
        if (e.bossCharge > 0) {
          e.bossCharge -= dt;
          speed = 0;
          if (e.bossCharge <= 0) e.bossCharge = -0.65;
        } else if (e.bossCharge < 0) {
          e.x = clamp(e.x + Math.cos(e.angle) * 420 * dt, 60, 2340);
          e.y = clamp(e.y + Math.sin(e.angle) * 420 * dt, 60, 2340);
          e.bossCharge = Math.min(0, e.bossCharge + dt);
          speed = 0;
        }
        this.updateBarrages(e, dt);
        e.guardTimer -= dt;
        if (e.guardTimer <= 0) {
          const rule = difficultyRule(r);
          this.bossSummon(
            e,
            Math.max(
              1,
              Math.round(
                (rule.guards + (phase > 1 ? 1 : 0)) *
                  (e.adaptive?.pressure || 1),
              ),
            ),
            rule.id >= 1
              ? ["runner", "gunner", "shield", "bomber"]
              : ["scout", "runner"],
          );
          e.guardTimer =
            rule.guardInterval /
            (phase > 1 ? 1.2 : 1) /
            (e.adaptive?.pressure || 1);
        }
        if (
          e.maxShield &&
          e.shieldHp <= 0 &&
          r.config.shieldRecovery === "recharge" &&
          e.shieldRecharges < 2
        ) {
          e.shieldTimer = Math.max(0, e.shieldTimer - dt);
          if (e.shieldTimer === 0) {
            e.shieldRecharges++;
            this.restoreBossShield(e, 0.35);
          }
        }
        if (e.cd <= 0) {
          this.bossAttack(e, angle, phase);
          e.cd = bossCooldown(r, phase, e);
        }
      }
      e.x = clamp(e.x + Math.cos(angle) * speed * dt, 0, 2400);
      e.y = clamp(e.y + Math.sin(angle) * speed * dt, 0, 2400);
      if (d < e.radius + 13 && r.phase === "play") {
        if (p.dashTime > 0 && this.has("dash")) this.hitEnemy(e, 50, "burst");
        this.hurtPlayer(e.contact);
      }
    }
    // 每幀更新：移動、武器、敵人、預警與過關條件。選擇畫面不推進時間。
    step(dt, input = { x: 0, y: 0 }) {
      const r = this.r;
      if (!r || r.phase !== "play") return;
      dt = Math.min(dt, 0.05);
      const p = r.p;
      r.time += dt;
      r.waveTime += dt;
      r.stepCount++;
      r.comboTimer = Math.max(0, r.comboTimer - dt);
      if (!r.comboTimer) r.combo = 0;
      r.bossIntro = Math.max(0, r.bossIntro - dt);
      r.magnetPulse = Math.max(0, (r.magnetPulse || 0) - dt);
      for (const name of ["inv", "dashCD", "burstCD", "dashTime"])
        p[name] = Math.max(0, p[name] - dt);
      const mag = Math.hypot(input.x, input.y);
      if (mag > 0.05) {
        p.dx = input.x / mag;
        p.dy = input.y / mag;
      }
      const move = p.dashTime > 0 ? 1 : Math.min(1, mag),
        speed =
          p.dashTime > 0
            ? 880
            : p.speed *
              (1 +
                this.stat("speed") * 0.1 +
                (r.research.thruster || 0) * 0.03);
      p.x = clamp(p.x + p.dx * move * speed * dt, 22, 2378);
      p.y = clamp(p.y + p.dy * move * speed * dt, 22, 2378);
      p.hp = Math.min(
        p.maxHp,
        p.hp +
          (this.stat("regen") * 0.6 + (r.research.repair || 0) * 0.12) * dt,
      );
      if (this.has("shield")) {
        p.shieldTimer += dt;
        if (p.shieldTimer >= 18) {
          p.shield = 1;
          p.shieldTimer = 0;
        }
      }
      r.spawnTimer -= dt;
      if (r.spawnTimer <= 0) {
        this.spawnEnemy();
        if (r.wave >= 9 && seeded(r) < 0.4) this.spawnEnemy();
        r.spawnTimer =
          (Math.max(0.25, 1.15 - r.wave * 0.045) /
            difficultyRule(r).spawn /
            waveType(r).density /
            ENEMY_AMOUNTS[r.config.enemyAmount].rate /
            (r.config.mutator === "overclock" ? 1.2 : 1)) *
          (r.bossSpawned && !r.bossDead
            ? 1 /
              (difficultyRule(r).bossPressure *
                (r.enemies.find((e) => e.type === "boss" && !e.dead)?.adaptive
                  ?.pressure || 1))
            : r.waveKills >= r.killTarget
              ? 2.5
              : 1);
      }
      if (isBossWave(r) && !r.bossSpawned) {
        const left = r.config.bossDelay - r.waveTime;
        if (left <= 5 && !r.bossWarned) {
          r.bossWarned = true;
          this.log("Boss 訊號鎖定：5 秒後接戰。");
          this.onSound("boss");
        }
        if (left <= 0) this.spawnEnemy("boss");
      }
      r.hazardTimer -= dt;
      if (
        (this.region().hazard || waveType(r).id === "storm") &&
        r.hazardTimer <= 0
      ) {
        const a = seeded(r) * Math.PI * 2;
        this.addHazard(
          clamp(p.x + Math.cos(a) * 120, 40, 2360),
          clamp(p.y + Math.sin(a) * 120, 40, 2360),
          60,
          1.6,
          22,
        );
        r.hazardTimer = 7;
      }
      for (const e of r.enemies) {
        if (!e.dead) this.updateEnemy(e, dt);
        if (r.phase !== "play") return;
      }
      this.rebuildHash();
      for (const w of r.weapons) {
        w.cd -= dt;
        if (w.id === "orbit") {
          const count = 2 + Math.floor(w.level / 2) + (w.evolved ? 3 : 0),
            radius = 63 + w.level * 5 + (w.evolved ? 25 : 0);
          if (w.cd <= 0) {
            for (let i = 0; i < count; i++) {
              const a =
                  r.time * (w.evolved ? 2.8 : 2) + (i / count) * Math.PI * 2,
                x = p.x + Math.cos(a) * radius,
                y = p.y + Math.sin(a) * radius;
              for (const e of this.nearby(x, y, 40))
                if (dist({ x, y }, e) < e.radius + 19)
                  this.hitEnemy(
                    e,
                    WEAPONS.orbit.damage *
                      (1 + (w.level - 1) * 0.3) *
                      (w.evolved ? 1.5 : 1),
                    "orbit",
                    { slow: w.evolved ? 1 : 0 },
                  );
            }
            w.cd = 0.18 / (1 + this.stat("fire") * 0.12);
          }
        } else if (w.cd <= 0) {
          this.fireWeapon(w);
          w.cd =
            WEAPONS[w.id].interval /
            (1 + this.stat("fire") * 0.12) /
            (r.config.mutator === "overclock" ? 1.2 : 1) /
            (1 + (w.level - 1) * 0.06);
        }
      }
      for (const b of r.bullets) {
        if (b.dead) continue;
        b.life -= dt;
        if (b.source === "missile") {
          let t =
            r.enemies.find((e) => e.id === b.targetId && !e.dead) ||
            this.closest(b.x, b.y, 750);
          if (t) {
            b.targetId = t.id;
            const a = Math.atan2(t.y - b.y, t.x - b.x);
            b.vx +=
              (Math.cos(a) * WEAPONS.missile.speed - b.vx) *
              Math.min(1, dt * 7);
            b.vy +=
              (Math.sin(a) * WEAPONS.missile.speed - b.vy) *
              Math.min(1, dt * 7);
          }
        }
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        for (const e of this.nearby(b.x, b.y, 65)) {
          if (e.dead || b.hitIds.includes(e.id)) continue;
          const vx = b.x - b.px,
            vy = b.y - b.py,
            dd = vx * vx + vy * vy,
            t = dd
              ? clamp(((e.x - b.px) * vx + (e.y - b.py) * vy) / dd, 0, 1)
              : 0;
          if (
            Math.hypot(e.x - b.px - vx * t, e.y - b.py - vy * t) <
            e.radius + b.radius
          ) {
            b.hitIds.push(e.id);
            if (b.source === "missile") {
              this.explode(b.x, b.y, b.evolved ? 100 : 65, b.damage, "missile");
              if (b.evolved)
                r.burns.push({
                  x: b.x,
                  y: b.y,
                  radius: 80,
                  life: 2,
                  tick: 0,
                  damage: b.damage * 0.2,
                  source: "missile",
                });
              b.dead = true;
              break;
            }
            this.hitEnemy(e, b.damage, b.source, {
              slow: b.source === "frost" ? 2.5 : 0,
              stun:
                b.source === "frost" && b.evolved && e.hp < e.maxHp * 0.3
                  ? 0.4
                  : 0,
            });
            b.pierce--;
            if (b.pierce <= 0) {
              b.dead = true;
              break;
            }
          }
        }
        if (b.life <= 0) b.dead = true;
      }
      for (const b of r.enemyBullets) {
        b.life -= dt;
        if (b.turn) {
          const a = b.turn * dt,
            vx = b.vx;
          b.vx = vx * Math.cos(a) - b.vy * Math.sin(a);
          b.vy = vx * Math.sin(a) + b.vy * Math.cos(a);
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (dist(b, p) < b.radius + 12) {
          this.hurtPlayer(b.damage);
          b.life = 0;
        }
        if (r.phase !== "play") return;
      }
      for (const h of r.hazards) {
        if (h.warning > 0) {
          h.warning -= dt;
        } else {
          h.life -= dt;
          if (h.shape === "beam") {
            const vx = p.x - h.x,
              vy = p.y - h.y,
              along = vx * Math.cos(h.angle) + vy * Math.sin(h.angle),
              side = Math.abs(vx * Math.sin(h.angle) - vy * Math.cos(h.angle));
            if (along >= 0 && along <= h.length && side < h.width + 12)
              this.hurtPlayer(h.damage);
          } else if (dist(h, p) < h.radius + 12) this.hurtPlayer(h.damage);
          if (!h.fired) {
            h.fired = true;
            if (h.bossOwner) {
              const owner = r.enemies.find((e) => e.id === h.bossOwner);
              if (owner)
                this.combatImpact(
                  h.x,
                  h.y,
                  "blast",
                  h.color || "#ff709b",
                  h.shape === "beam" ? 8 : 6,
                  owner.bossIndex,
                  h.angle || 0,
                );
            }
            if (h.shape !== "beam")
              this.addFx("ring", h.x, h.y, {
                radius: h.radius,
                color: "#ff709b",
              });
            this.shake = Math.max(this.shake, 4);
          }
        }
        if (r.phase !== "play") return;
      }
      for (const a of r.burns) {
        a.life -= dt;
        a.tick -= dt;
        if (a.tick <= 0) {
          for (const e of this.nearby(a.x, a.y, a.radius + 50))
            if (!e.dead && dist(a, e) < a.radius + e.radius)
              this.hitEnemy(e, a.damage, a.source);
          a.tick = 0.35;
        }
      }
      r.cacheTimer -= dt;
      if (r.cacheTimer <= 0) {
        this.spawnCache();
        r.cacheTimer = 18;
      }
      for (const cache of r.caches) {
        if (!cache.dead && dist(cache, p) < 27) this.openCache(cache);
      }
      r.caches = r.caches.filter((x) => !x.dead);
      const pickup =
        (r.magnetPulse > 0 ? 3000 : 55) +
        this.stat("magnet") * 40 +
        (r.research.magnet || 0) * 12;
      for (const g of r.gems) {
        const d = dist(g, p);
        if (d < pickup) {
          const a = Math.atan2(p.y - g.y, p.x - g.x);
          g.x += Math.cos(a) * 430 * dt;
          g.y += Math.sin(a) * 430 * dt;
        }
        if (d < 18) this.collectGem(g);
      }
      r.enemies = r.enemies.filter(
        (e) => !e.dead && (e.type === "boss" || dist(e, p) < 1500),
      );
      r.bullets = r.bullets.filter((b) => !b.dead);
      r.enemyBullets = r.enemyBullets.filter((b) => b.life > 0);
      r.gems = r.gems.filter((g) => !g.dead);
      r.hazards = r.hazards.filter((h) => h.warning > 0 || h.life > 0);
      r.burns = r.burns.filter((a) => a.life > 0);
      for (const f of this.fx) f.life -= dt;
      this.fx = this.fx.filter((f) => f.life > 0);
      this.shake = Math.max(0, this.shake - dt * 32);
      this.zoomPulse = Math.max(0, this.zoomPulse - dt * 2.5);
      this.screenPulse = Math.max(0, this.screenPulse - dt * 2.2);
      if (r.pendingLevels > 0) {
        this.offerUpgrades("level");
        return;
      }
      if (r.waveKills >= r.killTarget && (!isBossWave(r) || r.bossDead)) {
        this.completeWave();
      }
    }
    availableUpgrades() {
      const r = this.r,
        options = [];
      for (const [id, w] of Object.entries(WEAPONS)) {
        const owned = r.weapons.find((x) => x.id === id);
        if (!owned && r.weapons.length < 6)
          options.push({
            kind: "weapon",
            id,
            label: w.name,
            icon: w.icon,
            desc: w.desc,
            tag: "新武器",
          });
        if (owned && owned.level < 5)
          options.push({
            kind: "weapon",
            id,
            label: `${w.name} Lv.${owned.level + 1}`,
            icon: w.icon,
            desc: "提升傷害，並強化數量、範圍或攻速。",
            tag: "武器升級",
          });
        if (
          owned &&
          owned.level === 5 &&
          !owned.evolved &&
          this.stat(w.req) >= w.need
        )
          options.push({
            kind: "evolve",
            id,
            label: w.evo,
            icon: w.icon,
            desc: w.evoDesc,
            tag: "武器進化",
          });
      }
      for (const [id, s] of Object.entries(STATS))
        if (this.stat(id) < s.max)
          options.push({
            kind: "stat",
            id,
            label: s.name,
            icon: s.icon,
            desc: s.desc,
            tag: `能力強化 ${this.stat(id)}/${s.max}`,
          });
      options.push({
        kind: "heal",
        id: "heal",
        label: "緊急修復",
        icon: "♡",
        desc: "回復最大生命的 35%，並獲得 8 晶礦。",
        tag: "補給",
      });
      return options;
    }
    offerUpgrades(reason) {
      const r = this.r;
      r.offerReason = reason;
      let options = this.availableUpgrades(),
        evo = options.filter((x) => x.kind === "evolve");
      r.offers = shuffle(
        r,
        options.filter((x) => x.kind !== "evolve"),
      ).slice(0, evo.length ? 2 : 3);
      if (evo.length) r.offers.unshift(pick(r, evo));
      this.setPhase("upgrade");
      this.onSound("level");
    }
    reroll() {
      const r = this.r;
      if (r.phase !== "upgrade" || r.rerolls <= 0) return;
      r.rerolls--;
      this.offerUpgrades(r.offerReason);
    }
    chooseUpgrade(index) {
      const r = this.r;
      if (r.phase !== "upgrade" || !r.offers[index]) return false;
      const c = r.offers[index];
      this.applyUpgrade(c);
      if (r.offerReason === "level") {
        r.pendingLevels--;
        if (r.pendingLevels > 0) this.offerUpgrades("level");
        else this.setPhase("play");
      } else this.afterWaveReward();
      return true;
    }
    applyUpgrade(c) {
      const r = this.r;
      if (c.kind === "weapon") {
        let w = r.weapons.find((x) => x.id === c.id);
        if (w) w.level++;
        else r.weapons.push({ id: c.id, level: 1, evolved: false, cd: 0.1 });
      }
      if (c.kind === "evolve") {
        r.weapons.find((x) => x.id === c.id).evolved = true;
        r.evolutions++;
        this.log(`${c.label}已啟動！`);
        this.onSound("victory");
      }
      if (c.kind === "stat") {
        r.stats[c.id] = (r.stats[c.id] || 0) + 1;
        if (c.id === "hp") {
          r.p.maxHp += 20;
          r.p.hp = Math.min(r.p.maxHp, r.p.hp + 20);
        }
      }
      if (c.kind === "heal") {
        r.p.hp = Math.min(r.p.maxHp, r.p.hp + r.p.maxHp * 0.35);
        r.gold += 8;
      }
    }
    completeWave() {
      const r = this.r;
      for (const g of r.gems) this.collectGem(g);
      r.gems = [];
      r.enemies = [];
      r.bullets = [];
      r.enemyBullets = [];
      r.hazards = [];
      r.burns = [];
      r.caches = [];
      this.fx = [];
      if (this.has("growth")) {
        r.p.maxHp += 6;
        r.p.hp = Math.min(r.p.maxHp, r.p.hp + 6);
      }
      r.p.hp = Math.min(r.p.maxHp, r.p.hp + r.p.maxHp * difficultyRule(r).heal);
      r.gold += 8 + r.wave;
      if (r.objective && r.objective.progress >= r.objective.target) {
        r.gold += r.objective.reward;
        this.log(`額外任務完成，晶礦 +${r.objective.reward}。`);
      }
      this.log(
        `第 ${r.wave} 波完成。補給回復了 ${Math.round(difficultyRule(r).heal * 100)}% 生命。`,
      );
      if (r.mode !== "endless" && r.wave >= r.config.totalWaves) {
        this.finish(true);
        return;
      }
      this.offerUpgrades("wave");
    }
    afterWaveReward() {
      const r = this.r;
      if (r.wave % 4 === 0) {
        r.relicOffers = shuffle(
          r,
          RELICS.filter((x) => !r.relics.includes(x.id)),
        ).slice(0, 3);
        if (r.relicOffers.length) {
          this.setPhase("relic");
          return;
        }
        this.offerRoute();
      } else if (r.wave % 2 === 0 && !r.eventDone) {
        this.offerEvent();
      } else this.setPhase("intermission");
    }
    chooseRelic(index) {
      const r = this.r;
      if (r.phase !== "relic" || !r.relicOffers[index]) return;
      const c = r.relicOffers[index];
      r.relics.push(c.id);
      this.log(`取得遺物：${c.name}。`);
      this.offerRoute();
    }
    offerRoute() {
      this.r.routeOffers = shuffle(this.r, REGIONS);
      this.setPhase("route");
    }
    chooseRoute(index) {
      const r = this.r;
      if (r.phase !== "route" || !r.routeOffers[index]) return;
      r.region = r.routeOffers[index].id;
      r.sector++;
      this.log(`航道轉向${this.region().name}。`);
      this.setPhase("intermission");
    }
    offerEvent() {
      const r = this.r;
      r.event = pick(r, [
        {
          id: "wreck",
          title: "失聯的運輸艦",
          desc: "一艘運輸艦漂浮在航道旁。艙門後的晶礦仍有能量，但打撈需要讓護盾短暫離線。",
          choices: [
            {
              label: "冒險打撈",
              desc: "消耗 15% 最大生命，獲得 45 晶礦。",
              action: "salvage",
            },
            {
              label: "拆取維修艙",
              desc: "回復 22% 最大生命。",
              action: "repair",
            },
            {
              label: "保持航線",
              desc: "安全離開，獲得 10 晶礦。",
              action: "safe",
            },
          ],
        },
        {
          id: "signal",
          title: "來自深空的訊號",
          desc: "一座古老信標願意交換一段星艦資料。它提出的條件看起來很划算。",
          choices: [
            {
              label: "交換裝甲資料",
              desc: "消耗 10% 最大生命，傷害強化 +1。",
              action: "power",
            },
            { label: "接收修復頻率", desc: "奈米修復 +1。", action: "regen" },
            { label: "出售訊號座標", desc: "獲得 25 晶礦。", action: "sell" },
          ],
        },
        {
          id: "cache",
          title: "被遺忘的補給站",
          desc: "補給站還有三個能運作的模組，但你只能帶走其中一個。",
          choices: [
            { label: "超頻模組", desc: "攻速強化 +1。", action: "fire" },
            { label: "磁力模組", desc: "拾取強化 +1。", action: "magnet" },
            { label: "修復模組", desc: "回復 35% 最大生命。", action: "heal" },
          ],
        },
      ]);
      this.setPhase("event");
    }
    chooseEvent(index) {
      const r = this.r;
      if (r.phase !== "event" || !r.event.choices[index]) return;
      const a = r.event.choices[index].action,
        p = r.p;
      if (a === "salvage") {
        p.hp = Math.max(1, p.hp - p.maxHp * 0.15);
        r.gold += 45;
      }
      if (a === "repair") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.22);
      if (a === "safe") r.gold += 10;
      if (a === "power") {
        p.hp = Math.max(1, p.hp - p.maxHp * 0.1);
        r.stats.damage = Math.min(STATS.damage.max, r.stats.damage + 1);
      }
      if (a === "regen")
        r.stats.regen = Math.min(STATS.regen.max, r.stats.regen + 1);
      if (a === "sell") r.gold += 25;
      if (a === "fire")
        r.stats.fire = Math.min(STATS.fire.max, r.stats.fire + 1);
      if (a === "magnet")
        r.stats.magnet = Math.min(STATS.magnet.max, r.stats.magnet + 1);
      if (a === "heal") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
      r.eventDone = true;
      this.log(`航道事件：${r.event.choices[index].label}。`);
      this.setPhase("intermission");
    }
    repair() {
      const r = this.r;
      if (r.phase !== "intermission" || r.gold < 25 || r.p.hp >= r.p.maxHp)
        return false;
      r.gold -= 25;
      r.p.hp = Math.min(r.p.maxHp, r.p.hp + r.p.maxHp * 0.4);
      this.onPhase();
      return true;
    }
    nextWave() {
      const r = this.r;
      if (r.phase !== "intermission") return;
      r.wave++;
      r.waveTime = 0;
      r.bossSpawned = false;
      r.bossDead = false;
      r.eventDone = false;
      r.spawnTimer = 0.5;
      r.p.inv = 1.5;
      r.p.dashCD = 0;
      if (r.module === "aegis") r.p.shield = 1;
      this.prepareWave();
      this.setPhase("play");
      if (r.pendingLevels > 0) this.offerUpgrades("level");
    }
    pause() {
      const r = this.r;
      if (r?.phase === "play") {
        r.resumePhase = "play";
        this.setPhase("paused");
      }
    }
    resume() {
      const r = this.r;
      if (r?.phase === "paused") this.setPhase(r.resumePhase || "play");
    }
    finish(win, retreat = false) {
      const r = this.r;
      if (!r || r.rewarded) return;
      r.result = {
        win,
        retreat,
        reward:
          Math.floor(
            r.gold * rewardMultiplier(r.difficulty, r.config, r.mode),
          ) +
          (win ? Math.round(120 * Math.min(2, r.config.totalWaves / 16)) : 0),
      };
      r.rewarded = true;
      r.phase = "result";
      const p = this.profile;
      p.credits += r.result.reward;
      p.kills += r.kills;
      p.bosses += r.bosses;
      p.evolutions += r.evolutions;
      p.bestWave = Math.max(p.bestWave, r.wave);
      if (r.mode === "endless") p.endlessWave = Math.max(p.endlessWave, r.wave);
      if (win) {
        p.wins++;
        if (r.wave >= 16) p.longWins = (p.longWins || 0) + 1;
        else p.customWins = (p.customWins || 0) + 1;
      }
      if (r.weapons.length >= 6) p.arsenal = true;
      p.records.unshift({
        ship: r.ship,
        wave: r.wave,
        time: r.time,
        kills: r.kills,
        win,
        mode: r.mode,
        difficulty: r.difficulty,
        totalWaves: r.config.totalWaves,
        config: r.config,
        maxCombo: r.maxCombo,
        shopBuys: r.shopBuys,
        date: new Date().toLocaleDateString("zh-TW"),
        seed: r.seed,
        reward: r.result.reward,
      });
      p.records = p.records.slice(0, 12);
      this.checkAchievements();
      this.onPhase();
    }
    checkAchievements() {
      const p = this.profile;
      for (const a of ACHIEVEMENTS) {
        if (!p.achievements.includes(a.id) && a.test(p)) {
          p.achievements.push(a.id);
          p.credits += a.reward;
          this.onToast(`成就「${a.name}」：研究晶礦 +${a.reward}`);
        }
      }
    }
    loadRun(data) {
      if (
        !data ||
        data.version !== VERSION ||
        !data.p ||
        !Array.isArray(data.weapons) ||
        !Array.isArray(data.enemies) ||
        !Number.isFinite(data.p.hp) ||
        ![
          "play",
          "paused",
          "upgrade",
          "relic",
          "route",
          "event",
          "intermission",
        ].includes(data.phase) ||
        data.rewarded
      )
        return false;
      if (!validateRun(data)) return false;
      data.research = data.research || { ...this.profile.research };
      this.migrateRun(data);
      this.r = data;
      this.fx = [];
      this.shake = 0;
      this.zoomPulse = 0;
      this.screenPulse = 0;
      this.lastImpact = -10;
      this.nextId =
        1 +
        Math.max(
          0,
          ...data.enemies.map((e) => e.id || 0),
          ...data.bullets.map((b) => b.id || 0),
        );
      if (data.phase === "play") {
        data.resumePhase = "play";
        data.phase = "paused";
      }
      this.rebuildHash();
      return true;
    }
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      Engine,
      defaultProfile,
      WEAPONS,
      STATS,
      RELICS,
      SHIPS,
      REGIONS,
      ACHIEVEMENTS,
      DEFAULT_CONFIG,
      normalizeConfig,
      isBossWave,
      BOSS_DATA,
      MODULES,
      WAVE_TYPES,
      ENEMY_AMOUNTS,
      ENEMY_SETS,
      ENEMY_TYPES,
      killQuota,
      bossPhase,
      bossCooldown,
      enemyPool,
      DIFFICULTIES,
      difficultyRule,
      estimatePlayerPower,
      createBossEncounter,
      modeRule,
      MODE_RULES,
      DAILY_THEMES,
      BOSS_BALANCE,
      BOSS_SHIELDS,
      SHIELD_RECOVERY,
      bossShieldRatio,
      bossLayers,
      WEAPON_LOADOUTS,
      startingWeapon,
      startingHp,
      launchPreview,
      rewardMultiplier,
      bossRuleText,
    };
    return;
  }
  let storageAvailable = true;
  function readJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }
  let profile = Object.assign(defaultProfile(), readJSON(KEY, {}));
  profile.research = profile.research || {};
  profile.settings = Object.assign(defaultProfile().settings, profile.settings);
  for (const k of ["ships", "achievements", "records"])
    if (!Array.isArray(profile[k])) profile[k] = [];
  let savedRun = readJSON(RUNKEY, null),
    selectedShip = SHIPS.some((x) => x.id === profile.lastConfig?.ship)
      ? profile.lastConfig.ship
      : "scout",
    selectedMode = ["campaign", "endless", "daily"].includes(
      profile.lastConfig?.mode,
    )
      ? profile.lastConfig.mode
      : "campaign",
    selectedDifficulty = clamp(
      Math.round(Number(profile.lastConfig?.difficulty) || 0),
      -1,
      4,
    ),
    selectedConfig = normalizeConfig(profile.lastConfig?.config);
  profile.moduleOwned = Array.isArray(profile.moduleOwned)
    ? profile.moduleOwned.filter((id) => MODULES.some((x) => x.id === id))
    : [];
  profile.moduleEquipped = profile.moduleOwned.includes(profile.moduleEquipped)
    ? profile.moduleEquipped
    : "none";
  const engine = new Engine(profile),
    app = document.getElementById("app"),
    dialog = document.getElementById("dialog"),
    dialogContent = document.getElementById("dialog-content");
  let canvas = null,
    ctx = null,
    screen = "home",
    input = { x: 0, y: 0 },
    keys = new Set(),
    pointer = null,
    previous = 0,
    lastSave = 0,
    lastHud = 0,
    lastHudPaint = 0,
    audioContext = null,
    toastTimer = null,
    renderedPhase = "",
    canvasWidth = 0,
    canvasHeight = 0,
    canvasDpr = 0,
    arenaObserver = null;
  const escapeHTML = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function toast(text) {
    const e = document.getElementById("toast");
    e.textContent = text;
    e.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => e.classList.remove("show"), 3500);
  }
  function writeStorage(key, data) {
    try {
      if (data === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      if (storageAvailable) {
        toast("瀏覽器目前無法儲存進度，請用「匯出備份」保留紀錄。");
        storageAvailable = false;
      }
      return false;
    }
  }
  function save() {
    const creditLabel = document.getElementById("home-credits");
    if (creditLabel)
      creditLabel.textContent = `◈ ${Math.floor(profile.credits)} 晶礦`;
    writeStorage(KEY, profile);
    if (engine.r) {
      savedRun = engine.r.rewarded ? null : engine.r;
      writeStorage(RUNKEY, savedRun);
    }
    lastSave = performance.now();
  }
  function hasActiveRun() {
    return !!(
      (engine.r && !engine.r.rewarded) ||
      (savedRun && !savedRun.rewarded)
    );
  }
  // 低音衝擊與高頻破盾使用不同包絡；節流避免密集攻擊堆疊音量。
  function sound(type) {
    if (!profile.settings.sound || window.akanePortalPaused || document.hidden)
      return;
    try {
      const now = performance.now();
      sound.lastByType = sound.lastByType || {};
      if (
        now - (sound.lastByType[type] ?? -1000) <
        (type === "shot" ? 100 : 140)
      )
        return;
      sound.lastByType[type] = now;
      if (!audioContext)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const freqs = {
        shot: [490, 270],
        electric: [950, 220],
        hurt: [130, 65],
        dash: [220, 760],
        burst: [100, 800],
        level: [440, 880],
        nova: [220, 90],
        victory: [520, 1040],
        boss: [80, 140],
        slam: [75, 32],
        phase: [65, 180],
        shieldBreak: [1350, 110],
      };
      const f = freqs[type] || [440, 660],
        heavy = ["slam", "phase", "shieldBreak"].includes(type),
        duration = heavy ? 0.36 : 0.22;
      const voice = (from, to, gain, wave, delay = 0) => {
        const o = audioContext.createOscillator(),
          g = audioContext.createGain(),
          t = audioContext.currentTime + delay;
        o.type = wave;
        o.frequency.setValueAtTime(from, t);
        o.frequency.exponentialRampToValueAtTime(to, t + duration * 0.75);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        o.connect(g);
        g.connect(audioContext.destination);
        o.start(t);
        o.stop(t + duration + 0.02);
      };
      voice(
        f[0],
        f[1],
        type === "shot" ? 0.015 : heavy ? 0.045 : 0.055,
        ["hurt", "boss", "phase"].includes(type)
          ? "sawtooth"
          : type === "shot"
            ? "triangle"
            : "sine",
      );
      if (heavy)
        voice(type === "shieldBreak" ? 220 : 130, 40, 0.025, "triangle", 0.025);
    } catch {}
  }
  engine.onSound = sound;
  engine.onToast = toast;
  engine.onPhase = () => {
    if (screen === "game") {
      renderOverlay();
      updateHUD(true);
    }
    save();
  };
  function syncSound() {
    const b = document.getElementById("sound-btn");
    b.textContent = `音效：${profile.settings.sound ? "開" : "關"}`;
    b.setAttribute("aria-pressed", String(profile.settings.sound));
  }
  // 4. 瀏覽器介面：出航設定、HUD、商城、說明與控制輸入。
  function showHome() {
    resetControls();
    arenaObserver?.disconnect();
    screen = "home";
    canvas = null;
    ctx = null;
    if (engine.r?.phase === "play") engine.pause();
    save();
    const p = profile,
      active = hasActiveRun(),
      records = p.records.slice(0, 3),
      c = selectedConfig;
    app.innerHTML = /* HTML */ `<section class="hero">
        <div
          class="hero-art"
          role="img"
          aria-label="星艦穿越紫色星雲與異星敵潮"
        ></div>
        <div class="hero-copy">
          <div class="eyebrow">FLIGHT DECK / CHAPTER 01</div>
          <h1>星夜突圍<span>STARBREAK</span></h1>
          <p>由你決定這趟航行有多遠。<br />組好火力，向星海深處出發。</p>
          <div class="hero-actions">
            <button class="primary" id="launch">開始出航</button>${active
              ? '<button id="continue">繼續上次遠征</button>'
              : ""}
          </div>
          <div class="pilot-line" id="hero-plan"></div>
        </div>
        <div class="hero-badge">ADAPTIVE ENCOUNTER · v1.2</div>
      </section>
      <div class="home-layout">
        <section class="panel flight-panel">
          <div class="panel-heading">
            <h2>出航準備</h2>
            <span class="eyebrow">FLIGHT PLAN</span>
          </div>
          <div class="ships">
            ${SHIPS.map(
              (s) =>
                /* HTML */ `<button
                  class="ship-card ${s.id === selectedShip ? "active" : ""}"
                  data-ship="${s.id}"
                  aria-pressed="${s.id === selectedShip}"
                >
                  <span class="glyph">${s.icon}</span><b>${s.name}</b
                  ><span class="ship-stats"
                    ><span>標配生命 <b>${s.hp}</b></span
                    ><span>基礎移速 <b>${s.speed}</b></span></span
                  ><small>${s.desc}</small>
                </button>`,
            ).join("")}
          </div>
          <details class="loadout-config">
            <summary>
              <span class="loadout-summary-title">
                <b>起始武器與配置</b>
                <span class="loadout-toggle-hint">
                  <span class="when-closed">點此展開</span>
                  <span class="when-open">點此收合</span>
                </span>
              </span>
              <small id="loadout-setting-summary"></small>
            </summary>
            <div class="loadout-body">
              <label
                >起始武器<select id="starting-weapon">
                  <option value="ship">使用星艦標準武器</option>
                  ${Object.entries(WEAPONS)
                    .map(
                      ([id, w]) =>
                        `<option value="${id}">${w.name} · ${WEAPON_LOADOUTS[id].role}</option>`,
                    )
                    .join("")}
                </select></label
              >
              <div class="launch-stats" id="launch-stats"></div>
              <p class="loadout-advantage" id="loadout-advantage"></p>
              <p class="loadout-cost" id="loadout-cost"></p>
              <small
                >生命配置只在出航時套用。局內取得其他武器不會扣除生命；顯示數值已包含目前研究與模組。</small
              >
            </div>
          </details>
          <div class="setup-caption">
            <b>選擇航行方案</b><small>先選喜歡的節奏，再調整細項</small>
          </div>
          <div class="preset-row" aria-label="航行方案">
            <button data-preset="quick">
              <b>輕鬆出航</b><small>8 波 · 較少敵人</small></button
            ><button data-preset="classic">
              <b>經典遠征</b><small>16 波 · 均衡編隊</small></button
            ><button data-preset="long">
              <b>星海長征</b><small>32 波 · 豐富敵潮</small></button
            ><button data-preset="boss">
              <b>巨獸試煉</b><small>8 波 · 重盾連攻 Boss</small>
            </button>
          </div>
          <div class="config-grid primary-config">
            <label
              >航行模式<select id="mode">
                <option value="campaign">自訂遠征</option>
                <option value="endless">無盡星域</option>
                <option value="daily">每日種子遠征</option>
              </select></label
            ><label
              >總波數 <span class="muted">1–80</span
              ><input
                type="number"
                id="wave-count"
                min="1"
                max="80"
                step="1"
                value="${c.totalWaves}" /></label
            ><label
              >整體難度<select id="difficulty">
                ${DIFFICULTIES.map(
                  (d) =>
                    `<option value="${d.id}">${d.name} · ${d.title}</option>`,
                ).join("")}
              </select></label
            >
          </div>
          <div class="difficulty-info" id="difficulty-info"></div>
          <div class="setup-caption advanced-caption">
            <b>自訂細項</b><small>點開一類調整，其他選擇會保留</small>
          </div>
          <details class="advanced-config" name="flight-advanced">
            <summary>
              <span
                ><b>過關條件</b><small id="quota-setting-summary"></small
              ></span>
            </summary>
            <div class="config-grid">
              <label
                >起始擊破目標<input
                  type="number"
                  id="kill-quota"
                  min="10"
                  max="160"
                  step="1"
                  value="${c.killsPerWave}" /></label
              ><label
                >目標成長<select id="quota-growth">
                  <option value="rising">逐波 +3，最多追加 60</option>
                  <option value="fixed">每波相同目標</option>
                </select></label
              >
            </div>
            <p class="setting-note">
              擊破目標達成才會過關，時間經過不會直接換波。Boss 波還要擊敗該波
              Boss。
            </p>
          </details>
          <details class="advanced-config" name="flight-advanced">
            <summary>
              <span
                ><b>小怪編隊</b><small id="enemy-setting-summary"></small
              ></span>
            </summary>
            <div class="config-grid">
              <label
                >敵人數量<select id="enemy-amount">
                  ${Object.entries(ENEMY_AMOUNTS)
                    .map(
                      ([id, x]) => `<option value="${id}">${x.name}</option>`,
                    )
                    .join("")}
                </select></label
              ><label
                >編隊風格<select id="enemy-set">
                  ${Object.entries(ENEMY_SETS)
                    .map(
                      ([id, name]) => `<option value="${id}">${name}</option>`,
                    )
                    .join("")}
                </select></label
              ><label
                >強化型出現率<select id="elite-rate">
                  <option value="none">關閉強化型</option>
                  <option value="normal">標準 · 偶爾遇見</option>
                  <option value="many">高頻 · 精英獵場</option>
                </select></label
              >
            </div>
            <p class="setting-note">
              11 種小怪逐步登場。第 3 波起可遇見裝甲、迅捷、爆裂與再生精英；第 6
              波起精英可能升格為冠軍。
            </p>
            <button class="text-button" id="enemy-details">查看小怪能力</button>
          </details>
          <details class="advanced-config" name="flight-advanced">
            <summary>
              <span
                ><b>Boss 登場</b><small id="boss-setting-summary"></small
              ></span>
            </summary>
            <div class="config-grid">
              <label
                >出現規則<select id="boss-rule">
                  <option value="interval">固定間隔</option>
                  <option value="final">只在最後一波</option>
                  <option value="rush">每波 Boss</option>
                  <option value="none">不出現 Boss</option>
                </select></label
              ><label id="boss-every-field"
                >每隔幾波出現<input
                  type="number"
                  id="boss-every"
                  min="1"
                  max="12"
                  step="1"
                  value="${c.bossEvery}" /></label
              ><label
                >登場倒數 <span class="muted">秒</span
                ><input
                  type="number"
                  id="boss-delay"
                  min="15"
                  max="180"
                  step="1"
                  value="${c.bossDelay}" /></label
              ><label
                >Boss 種類<select id="boss-roster">
                  <option value="cycle">輪流登場</option>
                  <option value="random">隨機 Boss</option>
                  ${BOSS_DATA.map(
                    (b) => `<option value="${b.id}">固定：${b.name}</option>`,
                  ).join("")}
                </select></label
              ><label class="check-label" id="final-boss-field"
                ><input
                  type="checkbox"
                  id="final-boss"
                  ${c.finalBoss ? "checked" : ""}
                />最後一波追加 Boss</label
              >
            </div>
            <p class="setting-note">
              倒數從該波開始，暫停、升級與商城期間會停止。倒數結束才生成 Boss。
            </p>
          </details>
          <details class="advanced-config" name="flight-advanced">
            <summary>
              <span
                ><b>Boss 戰鬥</b><small id="combat-setting-summary"></small
              ></span>
            </summary>
            <div class="config-grid">
              <label
                >耐久與接觸傷害<select id="boss-strength">
                  <option value="0">常規裝甲</option>
                  <option value="1">強化 · 生命 +35%</option>
                  <option value="2">霸主 · 生命 +70%</option>
                </select></label
              ><label
                >攻擊頻率<select id="boss-frequency">
                  <option value="slow">舒緩 · 間隔較長</option>
                  <option value="normal">標準</option>
                  <option value="fast">快速 · 頻率 ×1.4</option>
                  <option value="relentless">連攻 · 頻率 ×1.8</option>
                </select></label
              ><label
                >彈幕與招式密度<select id="boss-density">
                  <option value="sparse">稀疏</option>
                  <option value="normal">標準</option>
                  <option value="dense">密集</option>
                  <option value="extreme">極密</option>
                </select></label
              ><label
                >Boss 防護罩<select id="boss-shield">
                  ${Object.entries(BOSS_SHIELDS)
                    .map(
                      ([id, name]) =>
                        '<option value="' + id + '">' + name + "</option>",
                    )
                    .join("")}
                </select></label
              ><label
                >護盾恢復<select id="shield-recovery">
                  ${Object.entries(SHIELD_RECOVERY)
                    .map(
                      ([id, name]) =>
                        '<option value="' + id + '">' + name + "</option>",
                    )
                    .join("")}
                </select></label
              ><label class="check-label"
                ><input
                  type="checkbox"
                  id="boss-second"
                  ${c.bossSecondPhase ? "checked" : ""}
                />開啟二階段 · 50% 生命</label
              ><label class="check-label"
                ><input
                  type="checkbox"
                  id="boss-third"
                  ${c.bossThirdPhase ? "checked" : ""}
                />追加終焉階段 · 30% 生命</label
              >
            </div>
            <p class="setting-note">
              難度決定基礎耐久、連攻層數與節奏；頻率、密度再乘上基礎效果。護盾未破時本體免傷；恢復可關閉、換階段恢復，或再追加每階段最多
              2 次定時充能。關閉二階段只保留第一階段。
            </p>
          </details>
          <details class="advanced-config" name="flight-advanced">
            <summary>
              <span
                ><b>特殊航線</b><small id="route-setting-summary"></small
              ></span>
            </summary>
            <div class="config-grid">
              <label
                >航線效果<select id="mutator">
                  <option value="none">標準規則</option>
                  <option value="overclock">超頻：攻速 +20%，敵潮 +20%</option>
                  <option value="salvage">打撈：晶礦 +30%，傷害 −10%</option>
                  <option value="glass">紅線：傷害 +30%，生命 −25%</option>
                </select></label
              >
            </div>
          </details>
          <div class="plan-summary" id="plan-summary"></div>
          <p class="pilot-line" id="mode-note"></p>
        </section>
        <section class="panel hangar-panel">
          <div class="panel-heading">
            <h2>基地檔案</h2>
            <b class="money" id="home-credits"
              >◈ ${Math.floor(p.credits)} 晶礦</b
            >
          </div>
          <div class="stats-row">
            <div>
              <span class="stat-number">${p.bestWave}</span
              ><small>最高波數</small>
            </div>
            <div>
              <span class="stat-number">${p.kills.toLocaleString()}</span
              ><small>累計擊破</small>
            </div>
            <div>
              <span class="stat-number">${p.wins}</span><small>遠征通關</small>
            </div>
          </div>
          <div class="equipped-module">
            <span class="module-emblem" id="equipped-icon"
              >${MODULES.find((x) => x.id === p.moduleEquipped)?.icon ||
              "◇"}</span
            >
            <div>
              <small>目前出航模組</small
              ><b id="equipped-name"
                >${MODULES.find((x) => x.id === p.moduleEquipped)?.name ||
                "未裝備模組"}</b
              ><span>一個模組，搭配一種星艦。</span>
            </div>
            <button id="base-shop">模組商城</button>
          </div>
          <div class="subnav">
            <button id="research">永久研究</button
            ><button id="achievements">
              成就 ${p.achievements.length}/${ACHIEVEMENTS.length}
            </button>
          </div>
          <div class="recent-title">最近航行</div>
          ${records.length
            ? records
                .map(
                  (x) =>
                    /* HTML */ `<div class="record">
                      <span
                        >${SHIPS.find((s) => s.id === x.ship)?.name || "星艦"} ·
                        第 ${x.wave} 波${x.win ? " · 通關" : ""}</span
                      ><span>${timeText(x.time)}</span>
                    </div>`,
                )
                .join("")
            : '<p class="muted">你的第一段航行紀錄，從這裡開始。</p>'}
          <div class="base-tip">
            <b>晶礦怎麼用？</b>
            <p>
              局內商城購買本局強化；結算後可在基地研究或解鎖模組。模組解鎖後可永久使用，下一次出航生效。
            </p>
          </div>
          <button id="settings" class="full-width">設定與備份</button>
        </section>
      </div>
      <section class="boss-gallery">
        <div class="panel-heading">
          <h2>星域威脅</h2>
          <button class="text-button" id="boss-details">查看招式檔案</button>
        </div>
        <div class="boss-gallery-grid">
          ${BOSS_DATA.map(
            (b, i) =>
              /* HTML */ `<button
                class="boss-preview"
                data-boss-preview="${i}"
                style="--boss-color:${b.color}"
              >
                <img src="${b.image}" alt="${b.name}" loading="lazy" /><span
                  class="eyebrow"
                  >THREAT / 0${i + 1}</span
                ><b>${b.name}</b><small>${b.skills}</small>
              </button>`,
          ).join("")}
        </div>
      </section>
      <p class="footer-note">
        進度保存在此瀏覽器；舊版研究與存檔可繼續使用。換裝置或換本機資料夾前，請匯出備份。
      </p>`;
    const inputs = {
        "starting-weapon": "startingWeapon",
        "wave-count": "totalWaves",
        "kill-quota": "killsPerWave",
        "quota-growth": "quotaGrowth",
        "enemy-amount": "enemyAmount",
        "enemy-set": "enemySet",
        "elite-rate": "eliteRate",
        "boss-rule": "bossRule",
        "boss-every": "bossEvery",
        "boss-delay": "bossDelay",
        "boss-strength": "bossStrength",
        "boss-roster": "bossRoster",
        "boss-second": "bossSecondPhase",
        "boss-third": "bossThirdPhase",
        "boss-frequency": "bossFrequency",
        "boss-density": "bossDensity",
        "boss-shield": "bossShield",
        "shield-recovery": "shieldRecovery",
        "final-boss": "finalBoss",
        mutator: "mutator",
      },
      checks = ["final-boss", "boss-second", "boss-third"];
    for (const [id, key] of Object.entries(inputs)) {
      const el = document.getElementById(id);
      if (checks.includes(id)) el.checked = !!c[key];
      else el.value = String(c[key]);
      el.onchange = () => {
        selectedConfig[key] = checks.includes(id) ? el.checked : el.value;
        selectedConfig = normalizeConfig(selectedConfig);
        for (const [field, k] of Object.entries(inputs)) {
          const node = document.getElementById(field);
          if (checks.includes(field)) node.checked = !!selectedConfig[k];
          else node.value = String(selectedConfig[k]);
        }
        syncPlan();
      };
    }
    const sections = document.querySelectorAll('[name="flight-advanced"]');
    sections.forEach((d) =>
      d.addEventListener("toggle", () => {
        if (d.open)
          sections.forEach((other) => {
            if (other !== d) other.open = false;
          });
      }),
    );
    document.getElementById("enemy-details").onclick = showEnemyCodex;
    document.querySelectorAll("[data-ship]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedShip = b.dataset.ship;
          document.querySelectorAll("[data-ship]").forEach((x) => {
            x.classList.toggle("active", x === b);
            x.setAttribute("aria-pressed", String(x === b));
          });
          syncPlan();
        }),
    );
    document.querySelectorAll("[data-preset]").forEach(
      (b) =>
        (b.onclick = () => {
          const presets = {
            quick: {
              totalWaves: 8,
              killsPerWave: 18,
              enemyAmount: "sparse",
              bossDelay: 35,
              bossFrequency: "slow",
              bossDensity: "sparse",
            },
            classic: { ...DEFAULT_CONFIG },
            long: {
              totalWaves: 32,
              killsPerWave: 30,
              enemyAmount: "dense",
              eliteRate: "many",
              bossDelay: 60,
            },
            boss: {
              totalWaves: 8,
              killsPerWave: 14,
              quotaGrowth: "fixed",
              enemyAmount: "normal",
              eliteRate: "many",
              bossDelay: 30,
              bossRule: "rush",
              bossRoster: "cycle",
              bossStrength: 1,
              bossFrequency: "fast",
              bossDensity: "dense",
              bossShield: "fortress",
              shieldRecovery: "phase",
              bossThirdPhase: true,
              finalBoss: false,
            },
          };
          selectedMode = "campaign";
          selectedConfig = normalizeConfig({
            ...DEFAULT_CONFIG,
            ...presets[b.dataset.preset],
            startingWeapon: selectedConfig.startingWeapon,
          });
          showHome();
        }),
    );
    const mode = document.getElementById("mode"),
      diff = document.getElementById("difficulty");
    mode.value = selectedMode;
    diff.value = String(selectedDifficulty);
    mode.onchange = () => {
      selectedMode = mode.value;
      syncPlan();
    };
    diff.onchange = () => {
      selectedDifficulty = Number(diff.value);
      syncPlan();
    };
    document.getElementById("launch").onclick = requestStart;
    document.getElementById("continue")?.addEventListener("click", continueRun);
    document.getElementById("research").onclick = showResearch;
    document.getElementById("achievements").onclick = showAchievements;
    document.getElementById("settings").onclick = showSettings;
    document.getElementById("base-shop").onclick = showBaseShop;
    document.getElementById("boss-details").onclick = showBossCodex;
    document
      .querySelectorAll("[data-boss-preview]")
      .forEach(
        (b) => (b.onclick = () => showBossCodex(Number(b.dataset.bossPreview))),
      );
    syncPlan();
    syncSound();
  }
  function syncPlan() {
    const c = selectedConfig,
      mode = selectedMode,
      set = (id, text) => (document.getElementById(id).textContent = text);
    document.getElementById("wave-count").disabled = mode === "endless";
    document.getElementById("boss-every").disabled = c.bossRule !== "interval";
    document.getElementById("boss-every-field").hidden =
      c.bossRule !== "interval";
    document.getElementById("final-boss").disabled =
      mode === "endless" || c.bossRule !== "interval";
    document.getElementById("final-boss-field").hidden =
      mode === "endless" || c.bossRule !== "interval";
    for (const id of [
      "boss-strength",
      "boss-roster",
      "boss-delay",
      "boss-frequency",
      "boss-density",
      "boss-shield",
      "shield-recovery",
      "boss-second",
    ])
      document.getElementById(id).disabled = c.bossRule === "none";
    document.getElementById("boss-third").disabled =
      c.bossRule === "none" || !c.bossSecondPhase;
    document.getElementById("shield-recovery").disabled =
      c.bossRule === "none" || c.bossShield === "none";
    const bossText = bossRuleText(c, mode);
    const names = DIFFICULTIES.map((d) => d.name);
    set(
      "plan-summary",
      `擊破 ${c.killsPerWave} 隻起${c.quotaGrowth === "rising" ? " · 逐波增加" : ""} / ${ENEMY_AMOUNTS[c.enemyAmount].name}敵潮 / ${bossText}${c.bossRule !== "none" ? ` · 倒數 ${c.bossDelay} 秒登場` : ""}`,
    );
    set(
      "hero-plan",
      `${SHIPS.find((x) => x.id === selectedShip).name} · ${mode === "endless" ? "無盡遠征" : `${c.totalWaves} 波航行`} · ${names[selectedDifficulty + 1]}難度`,
    );
    set(
      "quota-setting-summary",
      `${c.killsPerWave} 隻起 · ${c.quotaGrowth === "rising" ? "逐波成長" : "固定目標"}`,
    );
    set(
      "enemy-setting-summary",
      `${ENEMY_AMOUNTS[c.enemyAmount].name} · ${ENEMY_SETS[c.enemySet]}`,
    );
    set(
      "boss-setting-summary",
      `${bossText}${c.bossRule !== "none" ? ` · ${c.bossDelay} 秒` : ""}`,
    );
    set(
      "combat-setting-summary",
      c.bossRule === "none"
        ? "Boss 已關閉"
        : `${c.bossSecondPhase ? (c.bossThirdPhase ? "三階段" : "二階段") : "單階段"} · ${BOSS_SHIELDS[c.bossShield]} · ${document.getElementById("boss-frequency").selectedOptions?.[0]?.textContent || { slow: "舒緩", normal: "標準頻率", fast: "快速", relentless: "連攻" }[c.bossFrequency]}`,
    );
    set(
      "route-setting-summary",
      {
        none: "標準航線",
        overclock: "超頻航線",
        salvage: "打撈航線",
        glass: "紅線航線",
      }[c.mutator],
    );
    set(
      "mode-note",
      mode === "daily"
        ? "每日依台灣日期輪替流星／電離／蜂群主題；相同設定與操作序列可重現敵潮。"
        : mode === "endless"
          ? "沒有最後一波。每 8 波增加壓力，Boss 額外耐久上限 +30%、出招上限 +20%；可隨時保存或結算。"
          : `分段探索星域，逐步完成航行。結算晶礦倍率 ×${rewardMultiplier(selectedDifficulty, c, mode).toFixed(2)}。`,
    );
    document.querySelectorAll("[data-preset]").forEach((b) => {
      const name = b.dataset.preset,
        active =
          selectedMode === "campaign" &&
          ((name === "classic" &&
            Object.keys(DEFAULT_CONFIG)
              .filter((k) => !["startingWeapon", "waveSeconds"].includes(k))
              .every((k) => c[k] === DEFAULT_CONFIG[k])) ||
            (name === "quick" &&
              c.totalWaves === 8 &&
              c.enemyAmount === "sparse" &&
              c.bossRule === "interval" &&
              c.killsPerWave === 18) ||
            (name === "long" &&
              c.totalWaves === 32 &&
              c.enemyAmount === "dense" &&
              c.killsPerWave === 30) ||
            (name === "boss" &&
              c.totalWaves === 8 &&
              c.bossRule === "rush" &&
              c.killsPerWave === 14 &&
              c.bossShield === "fortress" &&
              c.bossFrequency === "fast" &&
              c.enemyAmount === "normal"));
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    const ship = SHIPS.find((s) => s.id === selectedShip),
      preview = launchPreview(profile, ship, c),
      build = WEAPON_LOADOUTS[preview.weapon],
      d = DIFFICULTIES[selectedDifficulty + 1];
    set(
      "loadout-setting-summary",
      `${WEAPONS[preview.weapon].name} · ${preview.hp} 生命`,
    );
    document.getElementById("launch-stats").innerHTML =
      `<span>起始生命 <b>${preview.hp}</b></span><span>移動速度 <b>${preview.speed}</b></span><span>減傷 <b>${preview.armor}%</b></span><span>暴擊 <b>${preview.crit}%</b></span>`;
    set("loadout-advantage", `優勢：${build.advantage}`);
    set("loadout-cost", `代價：${build.cost}`);
    const info = document.getElementById("difficulty-info");
    info.style.setProperty("--difficulty-color", d.color);
    info.innerHTML = /* HTML */ `<div class="difficulty-heading">
        <b>${d.name} · ${d.title}</b
        ><span>基礎晶礦 ×${d.reward.toFixed(2)}</span>
      </div>
      <p>${d.desc}</p>
      <div class="difficulty-metrics">
        <span>敵人生命 ×${d.hp.toFixed(2)}</span
        ><span>受到傷害 ×${d.damage.toFixed(2)}</span
        ><span>增援 ×${d.spawn.toFixed(2)}</span
        ><span>彈速 ×${d.shot.toFixed(2)}</span
        ><span>預警 ×${d.warning.toFixed(2)}</span
        ><span>波間回復 ${Math.round(d.heal * 100)}%</span>
      </div>`;
    info.innerHTML +=
      '<p class="boss-difficulty-note">Boss 總耐久預算 ×' +
      d.bossHp.toFixed(2) +
      " · 出招 ×" +
      d.bossRate.toFixed(2) +
      " · 彈量 ×" +
      d.bossDensity.toFixed(2) +
      " · " +
      d.bossLayers +
      " → " +
      bossLayers({ difficulty: d.id }, c.bossSecondPhase ? 2 : 1) +
      " 重攻擊（成形構築）<br>依接戰等級／火力／防禦調整；低等級減少一重連攻。本局護盾 " +
      Math.round(bossShieldRatio({ difficulty: d.id, config: c }) * 100) +
      "% 本體生命 · 裝甲 " +
      Math.round(d.bossArmor * 100) +
      "% · 接戰增援 ×" +
      d.bossPressure.toFixed(2) +
      "（頻率／密度設定另乘）</p>";
    profile.lastConfig = {
      ship: selectedShip,
      mode: selectedMode,
      difficulty: selectedDifficulty,
      config: selectedConfig,
    };
    save();
  }
  function showEnemyCodex() {
    const enemies = [
      ["偵察機", "均衡的追蹤型敵人。"],
      ["疾行機", "高速近身，生命較少。"],
      ["重裝機", "生命高，速度較慢。"],
      ["狙擊機", "紅線鎖定後射出高速彈。"],
      ["衝鋒機", "短暫蓄力後沿預警方向突進。"],
      ["分裂體", "擊破後分成兩隻幼體。"],
      ["幼體", "體型小、生命少，容易形成包圍。"],
      ["盾衛", "承受傷害降低 30%，阻擋航道。"],
      ["修復機", "每 5 秒修復附近最多 3 名小怪；不能修復 Boss。"],
      ["自爆機", "靠近後停下，1.25 秒預警後引爆。紅圈鎖定後仍會爆炸。"],
      ["散射炮艇", "黃線蓄力後發射三方向彈幕。"],
    ];
    openDialog(
      /* HTML */ `<div class="eyebrow">ENEMY ARCHIVE</div>
        <h2>小怪與強化編隊</h2>
        <div class="modal-grid">
          ${enemies
            .map(
              ([name, desc]) =>
                /* HTML */ `<article class="codex-card">
                  <h3>${name}</h3>
                  <p>${desc}</p>
                </article>`,
            )
            .join("")}
        </div>
        <p class="effect-note">
          精英：裝甲減傷、迅捷加速、爆裂死亡留下預警、再生緩慢回血。冠軍有雙重外圈，更高生命與接觸傷害，擊破獲得更多晶礦。
        </p>`,
    );
  }
  function showBaseShop() {
    const owned = profile.moduleOwned || [],
      equipped = profile.moduleEquipped || "none";
    openDialog(
      /* HTML */ `<div class="eyebrow">HANGAR MARKET / 永久解鎖</div>
        <h2>出航模組商城</h2>
        <p class="muted">
          解鎖後永久保留。每次出航可裝備一個模組，現在的遠征維持原有配置。
        </p>
        <div class="market-wallet">
          ◈ ${Math.floor(profile.credits)} <span>基地晶礦</span>
        </div>
        <div class="module-market">
          ${MODULES.map(
            (m) =>
              /* HTML */ `<article
                class="module-card ${equipped === m.id ? "selected" : ""}"
              >
                <span class="module-emblem">${m.icon}</span>
                <h3>${m.name}</h3>
                <p>${m.desc}</p>
                <button
                  data-module="${m.id}"
                  ${equipped === m.id ||
                  (!owned.includes(m.id) && profile.credits < m.cost)
                    ? "disabled"
                    : ""}
                >
                  ${equipped === m.id
                    ? "已裝備"
                    : owned.includes(m.id)
                      ? "裝備模組"
                      : `解鎖 · ${m.cost} 晶礦`}
                </button>
              </article>`,
          ).join("")}
        </div>
        <div class="hero-actions">
          <button id="unequip" ${equipped === "none" ? "disabled" : ""}>
            卸下模組
          </button>
        </div>`,
    );
    dialogContent.querySelectorAll("[data-module]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = MODULES.find((x) => x.id === b.dataset.module);
          if (!profile.moduleOwned) profile.moduleOwned = [];
          if (!profile.moduleOwned.includes(m.id)) {
            if (profile.credits < m.cost) return;
            profile.credits -= m.cost;
            profile.moduleOwned.push(m.id);
          }
          profile.moduleEquipped = m.id;
          save();
          updateBaseModule();
          showBaseShop();
          sound("level");
        }),
    );
    document.getElementById("unequip").onclick = () => {
      profile.moduleEquipped = "none";
      save();
      updateBaseModule();
      showBaseShop();
    };
  }
  function updateBaseModule() {
    const icon = document.getElementById("equipped-icon");
    if (icon)
      icon.textContent =
        MODULES.find((x) => x.id === profile.moduleEquipped)?.icon || "◇";
    const label = document.getElementById("equipped-name");
    if (label)
      label.textContent =
        MODULES.find((x) => x.id === profile.moduleEquipped)?.name ||
        "未裝備模組";
    if (screen === "home") syncPlan();
  }
  function showBossCodex(focus = -1) {
    const list = focus >= 0 ? [BOSS_DATA[focus]] : BOSS_DATA;
    openDialog(
      /* HTML */ `<div class="eyebrow">HOSTILE ARCHIVE</div>
        <h2>星域 Boss 檔案</h2>
        <p class="muted">
          Boss
          的發光核心是碰撞與命中區域，外側裝甲和翼刃不計碰撞。紅線與紅圈會先預警再造成傷害。
        </p>
        <div class="boss-codex">
          ${list
            .map(
              (b) =>
                /* HTML */ `<article style="--boss-color:${b.color}">
                  <div class="boss-art">
                    <img src="${b.image}" alt="${b.name}" />
                  </div>
                  <div>
                    <span class="eyebrow">${b.title}</span>
                    <h3>${b.name}</h3>
                    <p>${b.desc}</p>
                    <p class="effect-note">${b.skills}</p>
                    <small
                      >出航設定可開關二階段（50% 生命）與終焉階段（30%
                      生命），也能分開調整攻擊頻率和密度。</small
                    >
                  </div>
                </article>`,
            )
            .join("")}
        </div>`,
    );
  }
  function requestStart() {
    sound("level");
    if (hasActiveRun()) {
      openDialog(
        /* HTML */ `<h2>開始新的航行？</h2>
          <p class="muted">
            目前的遠征將結算晶礦並結束；永久研究與航行紀錄會保留。
          </p>
          <div class="hero-actions">
            <button class="primary" id="confirm-new">結算並重新出航</button
            ><button id="cancel-new">繼續舊遠征</button>
          </div>`,
      );
      document.getElementById("confirm-new").onclick = () => {
        if (!engine.r && savedRun) engine.loadRun(savedRun);
        engine.finish(false, true);
        save();
        dialog.close();
        startWithGuide();
      };
      document.getElementById("cancel-new").onclick = () => {
        dialog.close();
        continueRun();
      };
    } else startWithGuide();
  }
  function startWithGuide() {
    if (!profile.tutorial) {
      showGuide(true);
    } else startRun();
  }
  function startRun() {
    profile.tutorial = true;
    let seed =
      selectedMode === "daily"
        ? Number(
            new Intl.DateTimeFormat("en", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
              .formatToParts(new Date())
              .filter((x) => ["year", "month", "day"].includes(x.type))
              .sort(
                (a, b) =>
                  ["year", "month", "day"].indexOf(a.type) -
                  ["year", "month", "day"].indexOf(b.type),
              )
              .map((x) => x.value)
              .join(""),
          )
        : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    engine.newRun(
      selectedShip,
      selectedMode,
      selectedDifficulty,
      seed,
      selectedConfig,
    );
    showGame();
    save();
  }
  function continueRun() {
    if (engine.r && !engine.r.rewarded) {
      showGame();
      return;
    }
    if (savedRun && engine.loadRun(savedRun)) {
      showGame();
    } else {
      savedRun = null;
      writeStorage(RUNKEY, null);
      toast("沒有可以繼續的遠征。");
      showHome();
    }
  }
  function showGame() {
    resetControls();
    arenaObserver?.disconnect();
    screen = "game";
    const r = engine.r;
    app.innerHTML = /* HTML */ `<div class="game-layout">
      <section class="game-main">
        <div class="hud">
          <div class="hud-left">
            <div>
              <div class="eyebrow" id="sector-label"></div>
              <h2 id="wave-title"></h2>
            </div>
            <span class="timer" id="timer">00:00</span>
          </div>
          <div class="hud-actions">
            <button id="pause">暫停</button
            ><button id="return">保存離開</button>
          </div>
        </div>
        <div class="arena-wrap" id="arena-wrap">
          <!-- Boss 狀態列在畫布之外，出現時縮小畫布，不覆蓋走位或攻擊預警。 -->
          <section class="boss-hud" id="boss-hud" aria-label="Boss 戰況" hidden>
            <img id="boss-portrait" alt="Boss" />
            <div class="boss-hud-info">
              <div class="boss-heading">
                <span id="boss-name"></span>
                <button
                  id="boss-status-details"
                  aria-label="查看完整 Boss 戰況，並暫停航行"
                >
                  戰況 ⓘ
                </button>
              </div>
              <div class="boss-vitals">
                <div class="boss-body-vital">
                  <small id="boss-body-label"></small>
                  <div class="bar"><i id="boss-fill"></i></div>
                </div>
                <div id="boss-shield-row">
                  <small id="boss-shield-label"></small>
                  <div class="bar boss-shieldbar">
                    <i id="boss-shield-fill"></i>
                  </div>
                </div>
              </div>
              <small id="boss-move"></small>
              <small id="boss-adaptation" class="boss-adaptation"></small>
            </div>
          </section>
          <div class="battle-field" id="battle-field">
            <canvas
              id="arena"
              tabindex="0"
              aria-label="星艦戰場。WASD 或方向鍵移動，空白鍵衝刺，Q 過載；手機用左側搖桿區拖曳移動，右側按鈕可同時操作。"
            ></canvas>
            <div class="arena-label" id="region-label"></div>
            <div class="arena-top">
              <div>
                <div class="hp-label" id="hp-label"></div>
                <div class="bar hpbar"><i id="hp-fill"></i></div>
              </div>
              <div class="wave-progress">
                <small id="wave-status"></small>
                <div class="bar"><i id="wave-fill"></i></div>
              </div>
            </div>
            <div class="boss-arrival" id="boss-arrival" hidden>
              <span>威脅訊號</span><b id="boss-countdown"></b
              ><small id="boss-countdown-note"></small>
            </div>
            <div class="touch-move-zone" aria-hidden="true">
              <span>拖曳移動</span>
              <div class="touch-move-ring"></div>
            </div>
            <div class="joystick" id="joystick"><i></i></div>
            <div class="floating-hint">
              ${matchMedia("(pointer:coarse)").matches
                ? "左手拖曳移動 · 右手衝刺／過載"
                : "WASD / 方向鍵移動 · 空白鍵衝刺 · Q 過載"}
            </div>
            <div class="objective-hud">
              <small id="objective-reward"></small><b id="objective-label"></b>
              <div class="bar"><i id="objective-fill"></i></div>
            </div>
            <div class="combo-hud" id="combo-label"></div>
            <div class="game-controls">
              <button class="ability" id="dash" aria-label="衝刺，電腦按空白鍵">
                <b>衝刺</b><small class="key-hint">SPACE</small
                ><span id="dash-status"></span></button
              ><button class="ability" id="burst" aria-label="過載，電腦按 Q">
                <b>過載</b><small class="key-hint">Q</small
                ><span id="burst-status"></span>
              </button>
            </div>
            <div id="game-overlay"></div>
          </div>
        </div>
        <div class="xp-row">
          <span id="level-label"></span>
          <div class="bar"><i id="xp-fill"></i></div>
          <span id="xp-label"></span>
        </div>
      </section>
      <aside class="game-side">
        <section class="panel">
          <div class="panel-heading">
            <h3>武器配置</h3>
            <small id="weapon-count"></small>
          </div>
          <div class="weapons-list" id="weapons"></div>
        </section>
        <section class="panel">
          <h3>遠征狀態</h3>
          <div class="run-stats">
            <div><b id="kill-count"></b>擊破數</div>
            <div><b class="money" id="gold-count"></b>本局晶礦</div>
            <div><b id="damage-stat"></b>武器增幅</div>
            <div><b id="armor-stat"></b>偏轉護盾</div>
          </div>
          <div id="relic-list" class="pilot-line"></div>
        </section>
        <section class="panel">
          <h3>航行通訊</h3>
          <div class="log" id="log"></div>
        </section>
      </aside>
    </div>`;
    canvas = document.getElementById("arena");
    ctx = canvas.getContext("2d", { alpha: false });
    canvasWidth = canvasHeight = canvasDpr = 0;
    renderedPhase = "";
    document.getElementById("pause").onclick = () => {
      if (engine.r.phase === "play") engine.pause();
      else if (engine.r.phase === "paused") engine.resume();
    };
    document.getElementById("return").onclick = () => {
      engine.pause();
      save();
      showHome();
    };
    document.getElementById("boss-status-details").onclick = showBossStatus;
    const useDash = () => {
        const move = keyboardInput();
        engine.dash(move.x, move.y);
      },
      useBurst = () => engine.burst();
    for (const [id, action] of [
      ["dash", useDash],
      ["burst", useBurst],
    ]) {
      const button = document.getElementById(id);
      button.onclick = action;
      button.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") {
          e.preventDefault();
          action();
        }
      });
    }
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("lostpointercapture", pointerUp);
    if (typeof ResizeObserver !== "undefined") {
      arenaObserver = new ResizeObserver(resizeCanvas);
      arenaObserver.observe(document.getElementById("battle-field"));
    }
    resizeCanvas();
    renderOverlay();
    updateHUD(true);
    // 出航設定頁可能已捲到很下面；開始或接續時回到戰場頂端。
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!rect.width || !rect.height) return;
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);
    // 同尺寸的 visualViewport 通知不重設畫布，避免清空／重畫造成閃爍。
    if (
      canvas.width === pixelWidth &&
      canvas.height === pixelHeight &&
      canvasWidth === rect.width &&
      canvasHeight === rect.height &&
      canvasDpr === dpr
    )
      return;
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    canvasDpr = dpr;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    engine.viewRadius =
      Math.hypot(canvasWidth, canvasHeight) /
      2 /
      (canvasWidth < 600 ? 0.83 : 1);
  }
  function resetControls() {
    keys.clear();
    input = { x: 0, y: 0 };
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && canvas?.hasPointerCapture?.(id))
      canvas.releasePointerCapture(id);
    const joy = document.getElementById("joystick");
    if (joy) joy.style.display = "none";
  }
  function pointerDown(e) {
    if (!engine.r || engine.r.phase !== "play" || pointer || e.button > 0)
      return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect(),
      x = clamp(e.clientX, rect.left + 56, rect.right - 56),
      y = clamp(e.clientY, rect.top + 80, rect.bottom - 56);
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, rect };
    const joy = document.getElementById("joystick");
    joy.style.display = "block";
    joy.style.left = `${x - rect.left - 56}px`;
    joy.style.top = `${y - rect.top - 56}px`;
    joy.style.bottom = "auto";
    pointerMove(e);
  }
  function pointerMove(e) {
    if (!pointer || pointer.id !== e.pointerId || engine.r.phase !== "play")
      return;
    const x = e.clientX - pointer.x,
      y = e.clientY - pointer.y,
      n = Math.hypot(x, y),
      m = Math.min(n, 45);
    input = {
      x: n > 5 ? x / Math.max(n, 45) : 0,
      y: n > 5 ? y / Math.max(n, 45) : 0,
    };
    const joy = document.querySelector("#joystick i");
    if (joy)
      joy.style.transform = `translate(${n ? (x / n) * m : 0}px,${n ? (y / n) * m : 0}px)`;
  }
  function pointerUp(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    const id = pointer.id;
    pointer = null;
    input = { x: 0, y: 0 };
    if (canvas?.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    const joy = document.getElementById("joystick");
    if (joy) joy.style.display = "none";
  }
  function card(c, i, kind = "upgrade") {
    return /* HTML */ `<button
      class="choice ${c.kind === "evolve" ? "evolution" : ""}"
      data-choice="${i}"
      data-kind="${kind}"
    >
      <span class="choice-icon">${c.icon || "✦"}</span
      ><span class="tag">${escapeHTML(c.tag || `選擇 ${i + 1}`)}</span
      ><b>${escapeHTML(c.label || c.name)}</b
      ><small>${escapeHTML(c.desc)}</small>
    </button>`;
  }
  function renderOverlay() {
    if (screen !== "game" || !engine.r) return;
    const r = engine.r,
      host = document.getElementById("game-overlay");
    renderedPhase = r.phase;
    resetControls();
    let content = "";
    if (r.phase === "upgrade") {
      content = /* HTML */ `<div class="eyebrow">
          ${r.offerReason === "wave"
            ? "WAVE CLEAR / 波次獎勵"
            : `LEVEL ${r.p.level} / 等級提升`}
        </div>
        <h2>決定下一步火力</h2>
        <p>選擇一項強化。進化條件可在武器圖鑑查看。</p>
        <div class="choice-grid">
          ${r.offers.map((c, i) => card(c, i)).join("")}
        </div>
        <div class="overlay-footer">
          <button id="reroll" ${r.rerolls <= 0 ? "disabled" : ""}>
            重抽 · 剩餘 ${r.rerolls} 次
          </button>
        </div>`;
    }
    if (r.phase === "relic") {
      content = /* HTML */ `<div class="eyebrow">SECTOR CLEAR / 星域已突破</div>
        <h2>拾取星海遺物</h2>
        <p>遺物效果持續到這次遠征結束，可以和武器組合。</p>
        <div class="choice-grid">
          ${r.relicOffers.map((c, i) => card(c, i, "relic")).join("")}
        </div>`;
    }
    if (r.phase === "route") {
      content = /* HTML */ `<div class="eyebrow">NAVIGATION / 航線選擇</div>
        <h2>下一個星域</h2>
        <p>每條航道都有自己的代價與獎勵。</p>
        <div class="choice-grid">
          ${r.routeOffers
            .map((c, i) =>
              card({ ...c, icon: "✧", tag: "星域", label: c.name }, i, "route"),
            )
            .join("")}
        </div>`;
    }
    if (r.phase === "event") {
      content = /* HTML */ `<div class="eyebrow">UNKNOWN SIGNAL / 隨機事件</div>
        <h2>${escapeHTML(r.event.title)}</h2>
        <p>${escapeHTML(r.event.desc)}</p>
        <div class="choice-grid">
          ${r.event.choices.map((c, i) => card(c, i, "event")).join("")}
        </div>`;
    }
    if (r.phase === "intermission") {
      engine.ensureShop();
      content = /* HTML */ `<div class="shop-heading">
          <div>
            <div class="eyebrow">ORBITAL MARKET / 波間補給</div>
            <h2>軌道補給站</h2>
            <p>
              第 ${r.wave + 1} 波 ·
              ${isBossWave(r, r.wave + 1)
                ? `Boss 倒數 ${r.config.bossDelay} 秒後登場`
                : "下一輪敵潮"}<br />生命 ${Math.ceil(r.p.hp)} / ${r.p.maxHp}
            </p>
          </div>
          <div class="market-wallet">
            ◈ ${Math.floor(r.gold)}<span>本局晶礦</span>
          </div>
        </div>
        <div class="shop-grid">
          ${r.shopStock
            .map(
              (item, i) =>
                /* HTML */ `<article
                  class="shop-card ${item.bought ? "sold" : ""} ${item.kind ===
                  "evolve"
                    ? "evolution"
                    : ""}"
                >
                  <span class="choice-icon">${item.icon}</span
                  ><span class="tag"
                    >${item.kind === "evolve"
                      ? "進化核心"
                      : item.kind === "relic"
                        ? "星海遺物"
                        : item.kind === "weapon"
                          ? "武器裝備"
                          : item.kind === "stat"
                            ? "能力模組"
                            : "戰術補給"}</span
                  >
                  <h3>${escapeHTML(item.label)}</h3>
                  <p>${escapeHTML(item.desc)}</p>
                  <button
                    data-buy="${i}"
                    ${engine.canBuy(item) ? "" : "disabled"}
                  >
                    ${item.bought ? "已購入" : `${item.cost} 晶礦`}
                  </button>
                </article>`,
            )
            .join("")}
        </div>
        <div class="overlay-footer shop-footer">
          <button class="primary" id="next-wave">進入第 ${r.wave + 1} 波</button
          ><button
            id="repair"
            ${r.gold < 25 || r.p.hp >= r.p.maxHp ? "disabled" : ""}
          >
            修復 40% · 25 晶礦</button
          ><button
            id="shop-refresh"
            ${r.gold < 12 + r.shopRefreshes * 4 ? "disabled" : ""}
          >
            更新商品 · ${12 + r.shopRefreshes * 4} 晶礦</button
          ><button id="safe-exit">保存離開</button>
        </div>
        <p class="shop-note">
          商城商品只在本局生效。未花完的晶礦在結算時帶回基地。
        </p>`;
    }
    if (r.phase === "paused") {
      content = /* HTML */ `<div class="eyebrow">FLIGHT PAUSED</div>
        <h2>航行暫停</h2>
        <p>你的星艦與敵潮都已暫停。</p>
        <div class="overlay-footer">
          <button class="primary" id="resume">繼續航行</button
          ><button id="safe-exit">保存離開</button
          ><button class="danger" id="retreat">結算撤退</button>
        </div>`;
    }
    if (r.phase === "result") {
      const result = r.result;
      content = /* HTML */ `<div class="eyebrow">
          ${result.win ? "MISSION COMPLETE" : "EXPEDITION LOG"}
        </div>
        <h2>
          ${result.win
            ? "你穿過了永夜"
            : result.retreat
              ? "安全撤離"
              : "星光仍會再亮起"}
        </h2>
        <p>
          ${result.win
            ? `設定的 ${r.config.totalWaves} 波航行已完成。帶著這次的經驗，再試試不同航線。`
            : "這次的晶礦已帶回基地，可以研究新裝備再出發。"}
        </p>
        <div class="result-grid">
          <div><b>${r.wave}</b><span>到達波數</span></div>
          <div><b>${r.kills}</b><span>擊破敵人</span></div>
          <div><b>${timeText(r.time)}</b><span>戰鬥時間</span></div>
          <div><b>+${result.reward}</b><span>研究晶礦</span></div>
        </div>
        <div class="overlay-footer">
          <button class="primary" id="result-home">返回基地</button
          ><button id="again">同星艦再出航</button>
        </div>
        <p>
          <small
            >武器進化 ${r.evolutions} 次 · 最長連鎖 ${r.maxCombo} · 商城購入
            ${r.shopBuys} 件 · Boss 擊破 ${r.bosses} · 種子 ${r.seed}</small
          >
        </p>`;
    }
    host.innerHTML = content
      ? /* HTML */ `<div class="overlay">
          <div class="overlay-inner">${content}</div>
        </div>`
      : "";
    host.querySelectorAll("[data-choice]").forEach(
      (b) =>
        (b.onclick = () => {
          const i = Number(b.dataset.choice);
          sound("level");
          if (b.dataset.kind === "upgrade") engine.chooseUpgrade(i);
          if (b.dataset.kind === "relic") engine.chooseRelic(i);
          if (b.dataset.kind === "route") engine.chooseRoute(i);
          if (b.dataset.kind === "event") engine.chooseEvent(i);
        }),
    );
    host
      .querySelectorAll("[data-buy]")
      .forEach((b) => (b.onclick = () => engine.buy(Number(b.dataset.buy))));
    host
      .querySelector("#shop-refresh")
      ?.addEventListener("click", () => engine.refreshShop());
    host
      .querySelector("#reroll")
      ?.addEventListener("click", () => engine.reroll());
    host
      .querySelector("#next-wave")
      ?.addEventListener("click", () => engine.nextWave());
    host
      .querySelector("#repair")
      ?.addEventListener("click", () => engine.repair());
    host
      .querySelector("#resume")
      ?.addEventListener("click", () => engine.resume());
    host.querySelector("#safe-exit")?.addEventListener("click", () => {
      save();
      showHome();
    });
    host.querySelector("#retreat")?.addEventListener("click", () => {
      openDialog(
        '<h2>結束這次遠征？</h2><p class="muted">帶回目前取得的晶礦。這次航行將無法繼續。</p><button class="primary" id="confirm-retreat">結算返回</button>',
      );
      document.getElementById("confirm-retreat").onclick = () => {
        dialog.close();
        engine.finish(false, true);
      };
    });
    host.querySelector("#result-home")?.addEventListener("click", showHome);
    host.querySelector("#again")?.addEventListener("click", () => {
      selectedShip = r.ship;
      selectedMode = r.mode;
      selectedDifficulty = r.difficulty;
      selectedConfig = normalizeConfig(r.config);
      startRun();
    });
    document.getElementById("pause").textContent =
      r.phase === "paused" ? "繼續" : "暫停";
  }
  function updateHUD(force = false) {
    if (screen !== "game" || !engine.r) return;
    const r = engine.r,
      p = r.p,
      c = r.config,
      set = (id, text) => {
        const e = document.getElementById(id);
        if (e) e.textContent = text;
      },
      fill = (id, value) => {
        const e = document.getElementById(id);
        if (e) e.style.width = `${clamp(value, 0, 100)}%`;
      };
    const mode = modeRule(r);
    set(
      "sector-label",
      `${mode.name}${r.mode === "endless" ? ` ${mode.stage}/5` : ""} / ${String(r.sector).padStart(2, "0")} · ${difficultyRule(r).name}`,
    );
    set(
      "wave-title",
      `第 ${r.wave}${r.mode === "endless" ? "" : ` / ${c.totalWaves}`} 波${isBossWave(r) ? " · Boss" : ""}`,
    );
    set("timer", timeText(r.time));
    set("region-label", `${engine.region().name} / ${waveType(r).name}`);
    set(
      "hp-label",
      `生命 ${Math.ceil(p.hp)} / ${p.maxHp}${p.shield ? " · 護盾" : ""}`,
    );
    fill("hp-fill", (p.hp / p.maxHp) * 100);
    set(
      "wave-status",
      `擊破 ${Math.min(r.waveKills, r.killTarget)} / ${r.killTarget}`,
    );
    fill("wave-fill", (r.waveKills / r.killTarget) * 100);
    set("level-label", `Lv.${p.level}`);
    set("xp-label", `${Math.floor(p.xp)} / ${p.xpNeed}`);
    fill("xp-fill", (p.xp / p.xpNeed) * 100);
    set("dash-status", p.dashCD > 0 ? `${p.dashCD.toFixed(1)}s` : "就緒");
    set("burst-status", p.burstCD > 0 ? `${Math.ceil(p.burstCD)}s` : "就緒");
    document.getElementById("dash").disabled =
      p.dashCD > 0 || r.phase !== "play";
    document.getElementById("burst").disabled =
      p.burstCD > 0 || r.phase !== "play";
    const mission = r.objective;
    const labels = {
      kills: "擊破敵人",
      collect: "拾取晶體",
      dash: "使用衝刺",
      elite: "擊破精英",
    };
    set(
      "objective-label",
      mission
        ? `${labels[mission.kind]} ${Math.min(mission.progress, mission.target)} / ${mission.target}`
        : "保護星艦",
    );
    set("objective-reward", mission ? `完成 +${mission.reward} 晶礦` : "");
    fill(
      "objective-fill",
      mission ? (mission.progress / mission.target) * 100 : 0,
    );
    set("combo-label", r.combo >= 5 ? `${r.combo} CHAIN` : "");
    set("kill-count", r.kills);
    set("gold-count", Math.floor(r.gold));
    set(
      "damage-stat",
      `${Math.round((engine.damageMult("pulse") - 1) * 100)}%`,
    );
    set("armor-stat", `${r.stats.armor * 8}%`);
    set("weapon-count", `${r.weapons.length} / 6`);
    const arrival = document.getElementById("boss-arrival"),
      waiting = isBossWave(r) && !r.bossSpawned;
    arrival.hidden = !waiting;
    if (waiting) {
      const left = Math.max(0, Math.ceil(c.bossDelay - r.waveTime));
      set("boss-countdown", `Boss 登場 ${timeText(left)}`);
      set(
        "boss-countdown-note",
        r.waveKills >= r.killTarget
          ? "擊破目標已達成 · 等待 Boss 接戰"
          : "達成擊破目標並擊敗 Boss",
      );
      arrival.classList.toggle("imminent", left <= 5);
    }
    const boss = r.enemies.find((e) => e.type === "boss" && !e.dead);
    const bossHud = document.getElementById("boss-hud");
    bossHud.hidden = !boss;
    if (boss) {
      set(
        "boss-name",
        `${BOSSES[boss.bossIndex]}${boss.phaseLevel === 3 ? " · 終焉" : boss.phaseLevel === 2 ? " · 狂暴" : ""}`,
      );
      fill("boss-fill", (boss.hp / boss.maxHp) * 100);
      set(
        "boss-body-label",
        "本體 " +
          Math.ceil(boss.hp).toLocaleString() +
          " / " +
          Math.ceil(boss.maxHp).toLocaleString() +
          (boss.shieldHp > 0 ? " · 護盾保護" : " · 可攻擊"),
      );
      document.getElementById("boss-shield-row").hidden = !boss.maxShield;
      if (boss.maxShield) {
        fill("boss-shield-fill", (boss.shieldHp / boss.maxShield) * 100);
        set(
          "boss-shield-label",
          boss.shieldHp > 0
            ? "防護罩 " +
                Math.ceil(boss.shieldHp).toLocaleString() +
                " / " +
                boss.maxShield.toLocaleString()
            : r.config.shieldRecovery === "recharge" && boss.shieldRecharges < 2
              ? "已破盾 · " + Math.ceil(boss.shieldTimer) + " 秒後充能"
              : "護盾已破 · 集中火力",
        );
      }
      const portrait = document.getElementById("boss-portrait");
      if (
        portrait &&
        portrait.getAttribute("src") !== BOSS_DATA[boss.bossIndex].image
      )
        portrait.setAttribute("src", BOSS_DATA[boss.bossIndex].image);
      set(
        "boss-move",
        `${boss.currentMove || "正在接近"}${r.waveKills >= r.killTarget ? " · 擊敗後過關" : ` · 小怪 ${Math.min(r.waveKills, r.killTarget)}/${r.killTarget}`}`,
      );
      set(
        "boss-adaptation",
        `Lv.${boss.adaptive?.level || p.level} 接戰配置 · 本體與護盾已固定`,
      );
    }
    if (force || performance.now() - lastHud > 400) {
      document.getElementById("weapons").innerHTML =
        r.weapons
          .map(
            (w) =>
              /* HTML */ `<div class="weapon-row">
                <span class="icon" style="color:${WEAPONS[w.id].color}"
                  >${WEAPONS[w.id].icon}</span
                ><span
                  >${w.evolved ? WEAPONS[w.id].evo : WEAPONS[w.id].name}<small
                    >${w.evolved
                      ? "進化完成"
                      : `${STATS[WEAPONS[w.id].req].name} ${engine.stat(WEAPONS[w.id].req)}/${WEAPONS[w.id].need} · Lv.5 可進化`}</small
                  ></span
                ><span class="lv">${w.evolved ? "★" : `Lv.${w.level}`}</span>
              </div>`,
          )
          .join("") +
        Array.from(
          { length: 6 - r.weapons.length },
          () => '<div class="empty-slot">未裝備</div>',
        ).join("");
      document.getElementById("relic-list").textContent = r.relics.length
        ? `遺物：${r.relics.map((id) => RELICS.find((x) => x.id === id)?.name).join("、")}`
        : "尚未取得遺物 · 每 4 波可選擇一件";
      document.getElementById("log").innerHTML = r.log
        .slice(0, 4)
        .map((x) => /* HTML */ `<p>${escapeHTML(x)}</p>`)
        .join("");
      lastHud = performance.now();
    }
  }
  function openDialog(html) {
    if (engine.r?.phase === "play") engine.pause();
    dialogContent.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }
  // 想看完整數值時才打開；閱讀期間暫停，關閉後由玩家決定繼續。
  function showBossStatus() {
    const r = engine.r;
    const boss = r?.enemies.find(
      (enemy) => enemy.type === "boss" && !enemy.dead,
    );
    if (!boss) return;
    const shieldState =
      boss.shieldHp > 0
        ? "防護罩保護中，先擊破護盾再攻擊本體。"
        : r.config.shieldRecovery === "recharge" && boss.shieldRecharges < 2
          ? `護盾已破，${Math.ceil(boss.shieldTimer)} 秒後充能，本階段剩 ${2 - boss.shieldRecharges} 次。`
          : "護盾已破，可以集中火力攻擊本體。";
    openDialog(/* HTML */ `
      <div class="eyebrow">BOSS STATUS / v1.2</div>
      <h2>${escapeHTML(BOSSES[boss.bossIndex])}</h2>
      <p>
        本體生命：${Math.ceil(boss.hp).toLocaleString()} /
        ${Math.ceil(boss.maxHp).toLocaleString()}
      </p>
      <p>
        防護罩：${Math.ceil(boss.shieldHp).toLocaleString()} /
        ${boss.maxShield.toLocaleString()}
      </p>
      <p>${shieldState}</p>
      <p>目前動作：${escapeHTML(boss.currentMove || "正在接近")}</p>
      <p>
        Lv.${boss.adaptive?.level || r.p.level} 接戰配置；本體與護盾數值已固定。
      </p>
      <p class="muted">閱讀時已暫停。關閉後按「繼續航行」，再回到戰場。</p>
    `);
  }
  function showGuide(launch = false) {
    openDialog(
      /* HTML */ `<div class="eyebrow">PILOT HANDBOOK / v1.2</div>
        <h2>駕駛操作手冊</h2>
        <p class="muted">先熟悉移動、衝刺與過載，再展開你需要的戰鬥說明。</p>
        <details class="handbook-section" open>
          <summary>電腦與手機操作</summary>
          <div class="guide-steps">
            <article>
              <b>電腦</b>
              <p>
                WASD 或方向鍵移動；Space 衝刺；Q 過載；P 或 Esc
                暫停／繼續。也可以用滑鼠在戰場拖曳移動。
              </p>
              <p>
                選擇強化、遺物、航線與事件時，點卡片或按
                1、2、3。商城需要點商品，數字鍵不會直接購買。
              </p>
            </article>
            <article>
              <b>手機／平板</b>
              <p>
                左手在戰場拖曳搖桿，放開停止；右手按衝刺或過載。兩根手指可同時操作，第二指不會取代移動指。
              </p>
              <p>
                星艦自動瞄準、開火，不用點敵人。衝刺沿目前移動方向；原地時沿最後朝向。切換橫直向會重新調整戰場。
              </p>
            </article>
          </div>
          <p class="handbook-note">
            技能按鈕會顯示剩餘冷卻。游隼衝刺冷卻 2.4 秒，其他星艦 3.2
            秒，基本過載冷卻 25
            秒；遺物／模組可縮短。衝刺短暫無敵，過載造成範圍傷害並清除附近敵彈。
          </p>
        </details>
        <details class="handbook-section">
          <summary>出航設定、星艦與起始武器</summary>
          <div class="guide-steps">
            <article>
              <b>星艦的取捨</b>
              <p>
                游隼：標準配置 100 生命、240 移速，衝刺較快。磐石：145 生命、195
                移速、8% 減傷，耐打但較慢。雷隼：85 生命、265 移速、額外 12%
                暴擊，靈活但較脆。
              </p>
              <p>
                這些是沒有研究／模組的標準武器配置。展開「起始武器與配置」可更換武器，並看到包含永久研究與模組的實際出航數值。
              </p>
            </article>
            <article>
              <b>武器的取捨</b>
              <p>
                脈衝偏單點；軌道刃生命配置較高但要近身；電弧多目標爆發換取較低生命；新星範圍震退但間隔長；導彈高單發換取較低生命與慢發射；冰晶偏減速控制，單發傷害較低。
              </p>
              <p>
                起始生命調整只在出航時套用，局內購買或取得其他武器不會扣生命。
              </p>
            </article>
          </div>
          <p>
            選方案後，仍可改總波數、六檔難度與五類進階規則。方案只調整航行規則，不會暗中改變你選的難度。無盡模式不使用總波數；每日種子按台灣日期固定，相同設定與操作序列才會重現相同結果。
          </p>
        </details>
        <details class="handbook-section">
          <summary>波次目標、Boss 倒數與階段</summary>
          <p>
            右上「擊破 X / Y」是本波主要門檻。時間經過不會直接換波；Boss
            波還要擊敗 Boss。先達成擊破目標也不能略過 Boss
            倒數，等待時小怪增援減緩。
          </p>
          <p>
            Boss 倒數從該波開始，15–180
            秒可調。暫停、升級、事件與商城停止計時。固定間隔模式才顯示「每隔幾波」；每波／最終／關閉模式會隱藏不適用的欄位。
          </p>
          <p>
            二階段在本體 50% 生命啟動，終焉階段在 30% 啟動，可分別設定。Boss
            接戰後恢復持續增援，不會因小怪目標達成而減速。高難度會同時施放多招，狂暴後再提高攻擊層數。低等級且火力未成形時少一重連攻，保留蒐集經驗與升級的空間。
          </p>
          <p>
            青色防護罩必須先擊破，未破時本體免傷，破盾最後一擊的多餘傷害不會穿透。護盾可以關閉；輕型
            25%、重型 70%、堡壘 115% 本體生命，「依難度」為
            12–50%。紅條是本體，青條是護盾。換階段恢復原護盾的 55%（深淵／災厄
            70%）；限次充能在破盾 24 秒後恢復 35%，每階段最多 2
            次。選不恢復即可一破到底。
          </p>
          <p>
            每個 Boss 都有五套主招式，另外會疊加彈環、螺旋、鎖定轟炸與光束。Boss
            有減速、暈眩與震退抗性；護盾會擋住控制效果。護衛圍著 Boss
            生成，遠程炮艇、自爆機與盾衛會封住走位。過載可清彈，衝刺可短暫穿越火網；地面圈線需等預警後才會傷害。
          </p>
          <p>
            Boss
            不計入小怪目標；分裂幼體、護衛、精英被你擊破時會計入，自爆機自行爆炸不計入。Boss
            的發光核心才是命中與碰撞區，翼刃只作視覺呈現。
          </p>
        </details>
        <details class="handbook-section">
          <summary>難度差異與戰場判讀</summary>
          <div class="handbook-table">
            <table>
              <thead>
                <tr>
                  <th>難度</th>
                  <th>敵人生命</th>
                  <th>受到傷害</th>
                  <th>增援</th>
                  <th>預警</th>
                  <th>波間回復</th>
                </tr>
              </thead>
              <tbody>
                ${DIFFICULTIES.map(
                  (d) =>
                    /* HTML */ `<tr>
                      <th>${d.name}</th>
                      <td>×${d.hp.toFixed(2)}</td>
                      <td>×${d.damage.toFixed(2)}</td>
                      <td>×${d.spawn.toFixed(2)}</td>
                      <td>×${d.warning.toFixed(2)}</td>
                      <td>${Math.round(d.heal * 100)}%</td>
                    </tr>`,
                ).join("")}
              </tbody>
            </table>
          </div>
          <p>
            Boss
            在出場時記錄你的等級、六種武器的等級與進化、能力、研究及遺物。等級為線性成長，裝備火力為較緩的成長；低等級不再直接套用數千生命。總耐久也包含預計恢復的護盾，堡壘與三階段不會反覆堆出天文血量。
          </p>
          <p>
            接戰後本體、護盾與攻擊倍率固定；中途升級會真正加快擊破，不會立即替
            Boss 補血。下一隻 Boss 才重新計算。防禦成形會小幅提高 Boss
            傷害，上限有限，也不依目前殘血加壓。
          </p>
          <p>
            高難度提高總耐久預算、護盾、裝甲、彈幕數量、連攻層數、攻擊頻率與接戰增援。休閒單招；標準狂暴雙招；困難第一階段雙招；噩夢曲線連攻；深淵三招；災厄狂暴四招。自訂頻率與密度在基礎難度上再乘，關閉精英仍保持關閉。受傷後保護從休閒
            0.75 秒縮至災厄 0.45 秒，衝刺無敵時間不變。
          </p>
          <p>
            紅圈／紅線是攻擊預警，黃線是散射炮艇蓄力。預警結束才判定傷害。自爆機鎖定的紅圈不因擊殺它而取消。精英上方「甲／速／爆／癒」代表裝甲、迅捷、爆裂、再生，冠軍有雙重外圈。
          </p>
          <p>
            右下／下方技能區顯示冷卻；生命條是存活狀態，經驗條是下一次升級進度。額外任務是獎勵，不是主要門檻。連鎖在
            4 秒內續接，每 20 次獲得額外晶礦。
          </p>
        </details>
        <details class="handbook-section">
          <summary>模式差異與戰鬥演出</summary>
          <p>
            自訂遠征：分段探索、航線與商城成長。無盡星域：每 8
            波提升壓力，額外耐久上限 +30%、出招上限
            +20%，不會無限倍增。每日遠征：流星航道有延遲轟炸；電離星潮有遠程編隊與微彎彈道；蜂群潮汐有更多弱小敵人與蜂群護衛。
          </p>
          <p>
            裂隙獸呈現破裂弧光；暴君是雙重熔核震波；女皇使用結晶法陣；奇點核心以反轉星環與十字脈衝演出。破盾、換階段、過載與擊破都會有衝擊效果。紅色預警邊線永遠畫在能量效果上方。
          </p>
          <p>
            設定可選自動／完整／輕量／關閉演出，另可關閉震動與粒子。自動模式在手機降低效果；系統減少動態時取消鏡頭震動與縮放。這些選擇只改畫面，不改彈幕、碰撞或遊戲速度。
          </p>
        </details>
        <details class="handbook-section">
          <summary>收集、升級與武器進化</summary>
          <p>
            靠近擊破敵人掉落的晶體，吸入後取得經驗。升級時戰鬥會暫停，選一項強化。最多同時裝備六種武器，每種最高
            Lv.5；能力有各自上限。
          </p>
          <p>
            武器 Lv.5 加上指定能力 Lv.2
            才能進化：脈衝＋超頻、軌道刃＋護盾、電弧＋暴擊、新星＋生命、導彈＋傷害、冰晶＋打撈。符合條件時升級優先提供可用進化，商城也可能出現。
          </p>
          <p>
            每 4
            波可選遺物及下一個星域，遺物維持到本局結束。補給箱可能提供晶礦、醫療或磁力吸收；靠近即可取得。
          </p>
        </details>
        <details class="handbook-section">
          <summary>商城、基地成長與結算</summary>
          <p>
            波間商城花本局晶礦買武器、能力、進化、遺物、護盾與重抽券。每件商品只能買一次，可以付費更新；更新費用逐次提高。25
            晶礦可修復 40% 最大生命。
          </p>
          <p>
            本局未使用的晶礦，死亡、通關或撤退時依設定倍率帶回基地。高難度回收較多，無
            Boss 較少，每波 Boss 較多。短局通關額外獎勵也按波數縮減。
          </p>
          <p>
            基地研究和模組使用已結算晶礦。模組解鎖永久保留，但一次裝備一個。研究與模組更動不影響已在進行的遠征，只從下次出航生效。
          </p>
        </details>
        <details class="handbook-section">
          <summary>存檔、離開與轉移進度</summary>
          <p>
            戰鬥每 10
            秒自動保存；選擇強化、暫停、保存離開立即保存。切到背景或離開焦點會暫停。重新開啟後按「繼續上次遠征」，先顯示暫停畫面。
          </p>
          <p>
            「保存離開」可稍後繼續。「結算撤退」會結束本局；開始新局也會先提示結算舊遠征。結算後不能再繼續該局。
          </p>
          <p>
            設定裡可匯出／匯入
            JSON。線上版、離線版、不同瀏覽器或裝置的進度互相獨立，沒有自動同步；換裝置、換本機資料夾、清除瀏覽器資料前先備份。
          </p>
          <p>
            舊版本的研究、裝備與玩家生命會保留。舊 Boss
            第一次讀檔會換成新版接戰配置，保留本體與護盾各自剩餘比例；破掉的護盾不會免費補滿。本整合版會
            保存接戰數值、充能次數和連發進度，再次讀檔不會重新計算。要體驗完整的新巨獸試煉，請重新選擇方案並開始新局。v1.0／v1.1
            缺少本波擊破數，升級至新版時該波目標從 0 開始；v1.2
            以後已保存的擊破進度可完整還原。
          </p>
        </details>
        ${launch
          ? '<div class="handbook-launch"><button class="primary" id="guide-launch">了解，開始出航</button><button id="guide-skip">直接出航</button></div>'
          : ""}`,
    );
    if (launch) {
      document.getElementById("guide-launch").onclick = document.getElementById(
        "guide-skip",
      ).onclick = () => {
        dialog.close();
        startRun();
      };
    }
  }
  function showCodex() {
    openDialog(
      /* HTML */ `<div class="eyebrow">ARSENAL DATABASE</div>
        <h2>武器與進化配方</h2>
        <div class="hero-actions">
          <button id="codex-boss-link">Boss 招式檔案</button
          ><button id="codex-enemy-link">小怪編隊檔案</button>
        </div>
        <p class="muted">
          生命配置只影響出航，局內取得武器不扣生命。每種武器最高
          Lv.5。具備對應能力 Lv.2 後，升級選項會優先提供可用的進化。
        </p>
        <div class="modal-grid">
          ${Object.entries(WEAPONS)
            .map(
              ([id, w]) =>
                /* HTML */ `<article class="codex-card">
                  <span class="icon" style="color:${w.color}">${w.icon}</span>
                  <h3>${w.name}</h3>
                  <p>${w.desc}</p>
                  <p class="weapon-pro">
                    優勢：${WEAPON_LOADOUTS[id].advantage}
                  </p>
                  <p class="weapon-con">代價：${WEAPON_LOADOUTS[id].cost}</p>
                  <p class="effect-note">
                    ${w.name} Lv.5 ＋ ${STATS[w.req].name} Lv.2
                  </p>
                  <b>${w.evo}</b>
                  <p>${w.evoDesc}</p>
                </article>`,
            )
            .join("")}
        </div>
        <h2 style="margin-top:25px">星海遺物</h2>
        <div class="modal-grid">
          ${RELICS.map(
            (x) =>
              /* HTML */ `<article class="codex-card">
                <h3>${x.icon} ${x.name}</h3>
                <p>${x.desc}</p>
              </article>`,
          ).join("")}
        </div>`,
    );
    document.getElementById("codex-boss-link").onclick = () => showBossCodex();
    document.getElementById("codex-enemy-link").onclick = showEnemyCodex;
  }
  function showResearch() {
    openDialog(
      /* HTML */ `<div class="eyebrow">PERMANENT RESEARCH</div>
        <h2>讓下一趟航行走得更遠</h2>
        <p class="muted">研究加成會從下一次出航生效，每項最高 5 級。</p>
        <p class="money">可用晶礦：<b>${Math.floor(profile.credits)}</b></p>
        ${RESEARCH.map((x) => {
          const lv = profile.research[x.id] || 0,
            cost = x.cost * (lv + 1);
          return /* HTML */ `<div class="research-row">
            <div>
              <b>${x.name} · ${lv}/5</b>
              <p>${x.desc}</p>
            </div>
            <button
              data-research="${x.id}"
              ${lv >= 5 || profile.credits < cost ? "disabled" : ""}
            >
              ${lv >= 5 ? "研究完成" : `${cost} 晶礦`}
            </button>
          </div>`;
        }).join("")}`,
    );
    dialogContent.querySelectorAll("[data-research]").forEach(
      (b) =>
        (b.onclick = () => {
          const x = RESEARCH.find((x) => x.id === b.dataset.research),
            lv = profile.research[x.id] || 0,
            cost = x.cost * (lv + 1);
          if (lv >= 5 || profile.credits < cost) return;
          profile.credits -= cost;
          profile.research[x.id] = lv + 1;
          engine.checkAchievements();
          save();
          if (screen === "home") syncPlan();
          showResearch();
          sound("level");
        }),
    );
  }
  function showAchievements() {
    openDialog(
      /* HTML */ `<div class="eyebrow">FLIGHT MILESTONES</div>
        <h2>
          星海成就 · ${profile.achievements.length} / ${ACHIEVEMENTS.length}
        </h2>
        <p class="muted">遠征結算時檢查成就，獎勵只領取一次。</p>
        ${ACHIEVEMENTS.map(
          (a) =>
            /* HTML */ `<article
              class="achievement ${profile.achievements.includes(a.id)
                ? "done"
                : ""}"
            >
              <span class="medal"
                >${profile.achievements.includes(a.id) ? "✦" : "◇"}</span
              >
              <div>
                <b>${a.name}</b>
                <p>
                  ${a.desc} · 獎勵 ${a.reward}
                  晶礦${profile.achievements.includes(a.id) ? " · 已取得" : ""}
                </p>
              </div>
            </article>`,
        ).join("")}`,
    );
  }
  function showSettings() {
    openDialog(
      /* HTML */ `<div class="eyebrow">SYSTEM & SAVE DATA</div>
        <h2>設定與進度備份</h2>
        <label class="settings-row"
          ><input
            type="checkbox"
            id="setting-sound"
            ${profile.settings.sound ? "checked" : ""}
          />戰鬥音效</label
        ><label class="settings-row"
          ><input
            type="checkbox"
            id="setting-shake"
            ${profile.settings.shake ? "checked" : ""}
          />畫面震動</label
        ><label class="settings-row"
          ><input
            type="checkbox"
            id="setting-particles"
            ${profile.settings.particles ? "checked" : ""}
          />粒子效果（效能較低時可關閉）</label
        ><label class="settings-row effects-setting"
          ><span>戰鬥演出</span
          ><select id="setting-effects">
            <option value="auto">自動 · 手機輕量</option>
            <option value="full">完整 · 更多能量光效</option>
            <option value="lite">輕量 · 簡化光效</option>
            <option value="none">關閉演出 · 保留攻擊預警</option>
          </select></label
        >
        <p class="muted">
          系統「減少動態」會取消鏡頭震動與縮放。效果設定只影響呈現，不改敵彈與碰撞。
        </p>
        <p class="muted">
          備份包含永久研究、成就與目前的遠征。進度只保存在目前瀏覽器，沒有跨裝置自動同步；v1.0
          備份仍可匯入。
        </p>
        <div class="hero-actions">
          <button id="export-save">匯出備份</button
          ><button id="import-save">匯入備份</button
          ><input
            type="file"
            id="save-file"
            accept="application/json,.json"
            hidden
          />
        </div>
        <p id="import-message" class="muted"></p>`,
    );
    document.getElementById("setting-effects").value =
      profile.settings.effectsLevel || "auto";
    document.getElementById("setting-effects").onchange = (e) => {
      profile.settings.effectsLevel = e.target.value;
      save();
    };
    for (const key of ["sound", "shake", "particles"])
      document.getElementById(`setting-${key}`).onchange = (e) => {
        profile.settings[key] = e.target.checked;
        save();
        syncSound();
        if (key === "sound") sound("level");
      };
    document.getElementById("export-save").onclick = () => {
      save();
      const blob = new Blob(
          [
            JSON.stringify(
              {
                version: VERSION,
                profile,
                run: engine.r && !engine.r.rewarded ? engine.r : savedRun,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `starbreak-save-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast("備份已匯出。");
    };
    document.getElementById("import-save").onclick = () =>
      document.getElementById("save-file").click();
    document.getElementById("save-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (f.size > 5000000) throw Error("備份檔案太大");
        const d = JSON.parse(await f.text());
        if (
          d.version !== VERSION ||
          !d.profile ||
          !Array.isArray(d.profile.records) ||
          !Array.isArray(d.profile.achievements) ||
          !Array.isArray(d.profile.ships) ||
          !d.profile.research ||
          !Number.isFinite(d.profile.credits) ||
          d.profile.credits < 0
        )
          throw Error("無法辨識的備份格式");
        for (const x of RESEARCH) {
          const lv = d.profile.research[x.id] || 0;
          if (!Number.isInteger(lv) || lv < 0 || lv > 5)
            throw Error("研究資料不正確");
        }
        if (d.run) {
          const test = new Engine(d.profile);
          if (!test.loadRun(d.run)) throw Error("遠征資料不完整");
        }
        openDialog(
          '<h2>使用這份備份？</h2><p class="muted">匯入會取代此瀏覽器的永久研究、紀錄與遠征進度。</p><button class="primary" id="confirm-import">取代並匯入</button>',
        );
        document.getElementById("confirm-import").onclick = () => {
          profile = Object.assign(defaultProfile(), d.profile);
          profile.settings = Object.assign(
            defaultProfile().settings,
            profile.settings,
          );
          profile.moduleOwned = Array.isArray(profile.moduleOwned)
            ? profile.moduleOwned.filter((id) =>
                MODULES.some((x) => x.id === id),
              )
            : [];
          profile.moduleEquipped = profile.moduleOwned.includes(
            profile.moduleEquipped,
          )
            ? profile.moduleEquipped
            : "none";
          engine.profile = profile;
          engine.r = null;
          savedRun = d.run;
          selectedShip = SHIPS.some((s) => s.id === profile.lastConfig?.ship)
            ? profile.lastConfig.ship
            : "scout";
          selectedMode = ["campaign", "endless", "daily"].includes(
            profile.lastConfig?.mode,
          )
            ? profile.lastConfig.mode
            : "campaign";
          selectedDifficulty = clamp(
            Math.round(Number(profile.lastConfig?.difficulty) || 0),
            -1,
            4,
          );
          selectedConfig = normalizeConfig(profile.lastConfig?.config);
          writeStorage(KEY, profile);
          writeStorage(RUNKEY, savedRun);
          dialog.close();
          showHome();
          toast("備份已匯入。");
        };
      } catch (err) {
        document.getElementById("import-message").textContent =
          `匯入失敗：${err.message}`;
      }
    };
  }
  // 5. Canvas 呈現：效果不參與命中判定，不消耗戰鬥亂數。
  const bossImages = BOSS_DATA.map((b) => {
    const img = document.createElement("img");
    img.src = b.image;
    return img;
  });
  const stars = Array.from({ length: 180 }, (_, i) => ({
    x: ((((Math.sin(i * 928.3) * 43758.5453) % 1) + 1) % 1) * 2600,
    y: ((((Math.sin(i * 517.7 + 9) * 17329.7) % 1) + 1) % 1) * 2600,
    size: i % 7 === 0 ? 1.8 : 0.8,
    alpha: 0.2 + (i % 9) / 12,
  }));
  function polygon(x, y, r, n, angle = 0, fill = "#fff", stroke = null) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle + (i / n) * Math.PI * 2,
        px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
  function circle(x, y, r, fill, stroke = null, width = 1) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  // 演出品質與戰鬥規則分開：關閉光效也不會少一顆敵彈。
  function presentationSettings() {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = matchMedia("(pointer:coarse)").matches || canvasWidth < 600;
    const choice = profile.settings.effectsLevel || "auto";
    const quality =
      choice === "none"
        ? 0
        : choice === "lite" || reduced
          ? 1
          : choice === "full"
            ? 2
            : mobile
              ? 1
              : 2;
    return { quality, motion: quality > 0 && !reduced, mobile };
  }
  function drawBeam(h, outline = false, quality = 1) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);
    const warning = h.warning > 0,
      color = h.color || "#ff709b";
    ctx.fillStyle = warning ? "#ff709b20" : color + "66";
    ctx.strokeStyle = warning ? "#ff709baa" : "#ffe2ee";
    ctx.lineWidth = outline ? 2 : 1;
    if (!outline) {
      ctx.fillRect(0, -h.width, h.length, h.width * 2);
      if (!warning && quality > 0) {
        if (quality === 2) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
        }
        ctx.fillStyle = "#ffedf3bb";
        ctx.fillRect(
          0,
          -Math.max(2, h.width * 0.15),
          h.length,
          Math.max(4, h.width * 0.3),
        );
        ctx.shadowBlur = 0;
      }
    }
    ctx.setLineDash(warning ? [10, 8] : []);
    ctx.strokeRect(0, -h.width, h.length, h.width * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }
  // 四種能量幾何呼應 Boss 招式；輪廓在最後重新繪製，預警不會被遮住。
  function drawImpact(f, frac, quality) {
    const radius = f.radius * (1 - frac * 0.88),
      segments = quality === 2 ? 10 : 6;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((f.angle || 0) + (1 - frac) * 0.3);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 1 + frac * 4;
    if (quality === 2) {
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12 * frac;
    }
    if (f.style === 0) {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          radius * (i % 2 ? 0.94 : 1),
          a,
          a + (Math.PI / segments) * 1.25,
        );
        ctx.stroke();
      }
    } else if (f.style === 1) {
      circle(0, 0, radius, null, f.color, 1 + frac * 5);
      circle(0, 0, radius * 0.72, null, f.color + "99", 1 + frac * 3);
    } else if (f.style === 2) {
      polygon(0, 0, radius, 6, (1 - frac) * 0.5, null, f.color);
      polygon(0, 0, radius * 0.7, 6, -(1 - frac) * 0.6, null, f.color + "aa");
    } else {
      circle(0, 0, radius, null, f.color, 1 + frac * 4);
      circle(0, 0, radius * 0.5, null, f.color + "99", 1 + frac * 2);
    }
    const rays = f.style === 3 ? 4 : quality === 2 ? 8 : 4;
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2,
        inner = radius * 0.7,
        outer = radius * (f.style === 3 ? 1.4 : 1.13);
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawCharge(f, frac, quality) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((1 - frac) * 2);
    const radius = f.radius * (0.7 + frac * 0.3);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 2 + frac * 3;
    const count = quality === 2 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, a, a + Math.PI / count);
      ctx.stroke();
    }
    circle(0, 0, 10 + frac * 12, f.color + "44", f.color + "aa", 1);
    ctx.restore();
  }
  function drawModeAccent(r, cam, w, h, zoom, quality) {
    if (!quality) return;
    const rule = modeRule(r);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = rule.color;
    ctx.lineWidth = 1;
    if (rule.id === "endless") {
      circle(1200, 1200, 400 + (rule.stage || 0) * 100, null, rule.color, 2);
      circle(
        1200,
        1200,
        420 + (rule.stage || 0) * 100,
        null,
        rule.color + "55",
        1,
      );
    } else if (rule.id === "comet") {
      ctx.beginPath();
      for (let i = 0; i < (quality === 2 ? 8 : 4); i++) {
        const x = cam.x + ((i * 197 + r.time * 28) % (w / zoom)),
          y = cam.y + ((i * 137 + r.time * 13) % (h / zoom));
        ctx.moveTo(x, y);
        ctx.lineTo(x - 36, y - 18);
      }
      ctx.stroke();
    } else if (rule.id === "ion") {
      for (let i = 0; i < 3; i++)
        circle(1200, 1200, 250 + i * 190, null, rule.color, 1);
    } else if (rule.id === "swarm") {
      for (let i = 0; i < 6; i++)
        polygon(
          1200 + Math.cos((i * Math.PI) / 3) * 380,
          1200 + Math.sin((i * Math.PI) / 3) * 380,
          52,
          6,
          0,
          null,
          rule.color,
        );
    }
    ctx.restore();
  }
  function draw() {
    if (!ctx || !engine.r) return;
    const r = engine.r,
      p = r.p,
      w = canvasWidth,
      h = canvasHeight,
      t = r.time,
      region = engine.region();
    const visual = presentationSettings(),
      quality = visual.quality;
    visual.motion = visual.motion && r.phase === "play";
    const zoom =
      (w < 600 ? 0.83 : 1) *
      (1 +
        (visual.motion
          ? engine.zoomPulse * (quality === 2 ? 0.025 : 0.012)
          : 0));
    ctx.save();
    ctx.fillStyle = "#080d1d";
    ctx.fillRect(0, 0, w, h);
    const gradient = ctx.createRadialGradient(
      w * 0.3,
      h * 0.25,
      0,
      w * 0.45,
      h * 0.4,
      w,
    );
    gradient.addColorStop(0, `${region.color}22`);
    gradient.addColorStop(1, "#080d1d00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    let sx = 0,
      sy = 0;
    if (visual.motion && profile.settings.shake && engine.shake) {
      const shake = Math.min(
        engine.shake,
        visual.mobile || quality === 1 ? 6 : 12,
      );
      sx = Math.sin(performance.now() * 0.09) * shake;
      sy = Math.cos(performance.now() * 0.13) * shake;
    }
    const cam = { x: p.x - w / 2 / zoom, y: p.y - h / 2 / zoom };
    ctx.translate(sx, sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    for (const s of stars) {
      const x = (s.x + 2600) % 2600,
        y = (s.y + 2600) % 2600;
      if (
        x < cam.x - 5 ||
        x > cam.x + w / zoom + 5 ||
        y < cam.y - 5 ||
        y > cam.y + h / zoom + 5
      )
        continue;
      ctx.globalAlpha = s.alpha * (0.75 + Math.sin(t + s.x) * 0.15);
      ctx.fillStyle = "#ccd9ff";
      ctx.fillRect(x, y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#556b9e15";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (
      let x = Math.floor(cam.x / 100) * 100;
      x < cam.x + w / zoom;
      x += 100
    ) {
      ctx.moveTo(x, cam.y);
      ctx.lineTo(x, cam.y + h / zoom);
    }
    for (
      let y = Math.floor(cam.y / 100) * 100;
      y < cam.y + h / zoom;
      y += 100
    ) {
      ctx.moveTo(cam.x, y);
      ctx.lineTo(cam.x + w / zoom, y);
    }
    ctx.stroke();
    drawModeAccent(r, cam, w, h, zoom, quality);
    ctx.strokeStyle = "#8396d455";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 2400, 2400);
    for (const b of r.burns) {
      circle(b.x, b.y, b.radius, "#ff8c5922", "#ffac7144");
    }
    for (const hz of r.hazards) {
      if (hz.shape === "beam") {
        drawBeam(hz, false, quality);
        continue;
      }
      const alpha =
        hz.warning > 0 ? Math.sin(hz.warning * 15) * 0.09 + 0.16 : 0.4;
      circle(hz.x, hz.y, hz.radius, `rgba(255,70,130,${alpha})`, "#ff709b", 2);
      if (hz.warning > 0) {
        circle(
          hz.x,
          hz.y,
          hz.radius * (1 - clamp(hz.warning / 1.6, 0, 1)),
          null,
          "#ff709b66",
          1,
        );
        ctx.fillStyle = "#ffd6e4";
        ctx.font = "20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("!", hz.x, hz.y + 7);
      }
    }
    for (const cache of r.caches) {
      circle(cache.x, cache.y, 25, null, "#91f5e444");
      polygon(cache.x, cache.y, 14, 4, Math.PI / 4, "#153c46", "#b0fff0");
      ctx.fillStyle = "#cefff6";
      ctx.font = "18px Akane Sans, system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        cache.kind === "heal" ? "+" : cache.kind === "gold" ? "◈" : "⊕",
        cache.x,
        cache.y + 6,
      );
    }
    for (const g of r.gems) {
      if (
        g.x < cam.x - 10 ||
        g.x > cam.x + w / zoom + 10 ||
        g.y < cam.y - 10 ||
        g.y > cam.y + h / zoom + 10
      )
        continue;
      const rad = g.kind === "heal" ? 7 : g.value > 5 ? 7 : 4;
      polygon(
        g.x,
        g.y,
        rad,
        4,
        t * 0.35,
        g.kind === "heal" ? "#b1f9c6" : "#a59aff",
      );
      if (g.value > 8) circle(g.x, g.y, rad + 5, null, "#c1b6ff55");
    }
    for (const e of r.enemies) {
      const margin = e.type === "boss" ? 160 : 80;
      if (
        e.x < cam.x - margin ||
        e.x > cam.x + w / zoom + margin ||
        e.y < cam.y - margin ||
        e.y > cam.y + h / zoom + margin
      )
        continue;
      const colors = {
          scout: "#c483d8",
          runner: "#f68cbc",
          tank: "#b694ee",
          sniper: "#ff83ae",
          charger: "#ffa169",
          splitter: "#80bfc6",
          mini: "#cd9bf3",
          boss: "#fc82b2",
        },
        c = e.hit > 0 ? "#ffffff" : e.slow > 0 ? "#8dcfff" : colors[e.type];
      if (e.type === "boss") {
        const data = BOSS_DATA[e.bossIndex],
          sprite = bossImages[e.bossIndex],
          size = 215 + e.bossIndex * 10 + (e.phaseLevel === 3 ? 15 : 0);
        circle(
          e.x,
          e.y,
          e.radius + 16,
          `${data.color}12`,
          `${data.color}66`,
          2,
        );
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2);
        ctx.shadowColor = data.color;
        ctx.shadowBlur = quality === 2 ? (e.phaseLevel > 1 ? 18 : 9) : 0;
        if (sprite.complete && sprite.naturalWidth)
          ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        else polygon(0, 0, e.radius, 8, -t * 0.25, "#442344", data.color);
        ctx.restore();
        circle(e.x, e.y, 15, `${data.color}35`);
        circle(e.x, e.y, 20 + Math.sin(t * 5) * 3, null, `${data.color}88`, 2);
        if (e.hit > 0) circle(e.x, e.y, e.radius * 0.6, "#ffffff28");
        if (e.shieldHp > 0) {
          circle(e.x, e.y, e.radius + 28, "#65d9ff0b", "#8deaff55", 2);
          ctx.strokeStyle = "#8deaff";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(
            e.x,
            e.y,
            e.radius + 28,
            -Math.PI / 2,
            -Math.PI / 2 + (Math.PI * 2 * e.shieldHp) / e.maxShield,
          );
          ctx.stroke();
          polygon(e.x, e.y - 95, 9, 4, Math.PI / 4, "#173c56", "#8deaff");
        }
      } else if (e.type === "runner") {
        polygon(
          e.x,
          e.y,
          e.radius + 3,
          3,
          Math.atan2(p.y - e.y, p.x - e.x),
          "#5b2444",
          c,
        );
        circle(e.x, e.y, 3, c);
      } else if (e.type === "tank") {
        polygon(e.x, e.y, e.radius, 6, t * 0.1, "#282340", c);
        polygon(e.x, e.y, e.radius * 0.65, 6, -t * 0.1, null, c);
        circle(e.x, e.y, 5, c);
      } else if (e.type === "sniper") {
        polygon(e.x, e.y, e.radius, 4, t * 0.5, "#46253e", c);
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - 20, e.y);
        ctx.lineTo(e.x + 20, e.y);
        ctx.moveTo(e.x, e.y - 20);
        ctx.lineTo(e.x, e.y + 20);
        ctx.stroke();
        circle(e.x, e.y, 4, c);
      } else if (e.type === "charger") {
        polygon(
          e.x,
          e.y,
          e.radius,
          5,
          Math.atan2(p.y - e.y, p.x - e.x),
          "#512c39",
          c,
        );
        polygon(e.x, e.y, 8, 3, e.angle, null, c);
      } else if (e.type === "splitter") {
        polygon(e.x, e.y, e.radius, 6, t * 0.45, "#23404b", c);
        circle(e.x - 6, e.y, 4, c);
        circle(e.x + 6, e.y, 4, c);
      } else if (e.type === "shield") {
        polygon(e.x, e.y, e.radius, 6, 0, "#183c4a", "#8cd8ff");
        ctx.strokeStyle = "#8cd8ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          e.x,
          e.y,
          e.radius + 5,
          Math.atan2(p.y - e.y, p.x - e.x) - 0.9,
          Math.atan2(p.y - e.y, p.x - e.x) + 0.9,
        );
        ctx.stroke();
        polygon(e.x, e.y, 7, 4, 0, "#8cd8ff");
      } else if (e.type === "healer") {
        polygon(e.x, e.y, e.radius, 6, t * 0.2, "#163b31", "#a0f8c9");
        ctx.fillStyle = "#a0f8c9";
        ctx.fillRect(e.x - 3, e.y - 9, 6, 18);
        ctx.fillRect(e.x - 9, e.y - 3, 18, 6);
      } else if (e.type === "bomber") {
        polygon(e.x, e.y, e.radius, 3, -Math.PI / 2, "#593223", "#ffbc7a");
        circle(
          e.x,
          e.y,
          4,
          e.detonating && Math.sin(t * 22) > 0 ? "#fff3ce" : "#ffab65",
        );
        if (e.detonating) circle(e.x, e.y, 20, null, "#ff709b", 2);
      } else if (e.type === "gunner") {
        polygon(
          e.x,
          e.y,
          e.radius,
          5,
          Math.atan2(p.y - e.y, p.x - e.x),
          "#473d27",
          "#ffdd91",
        );
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(p.y - e.y, p.x - e.x) + i * 0.35;
          circle(e.x + Math.cos(a) * 13, e.y + Math.sin(a) * 13, 3, "#ffdd91");
        }
      } else {
        polygon(e.x, e.y, e.radius, 4, t * 0.2, "#392645", c);
        polygon(e.x, e.y, e.radius * 0.48, 4, -t * 0.4, c);
      }
      if (e.elite) {
        circle(
          e.x,
          e.y,
          e.radius + 5,
          null,
          e.elite === "armored"
            ? "#ffcb78"
            : e.elite === "swift"
              ? "#8cf5e8"
              : e.elite === "regenerating"
                ? "#a0f8c9"
                : "#ff83ae",
          2,
        );
        ctx.fillStyle = "#ffd48c";
        ctx.font = "11px Akane Sans, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(
          e.champion
            ? "冠軍"
            : {
                armored: "甲",
                swift: "速",
                volatile: "爆",
                regenerating: "癒",
              }[e.elite],
          e.x,
          e.y - e.radius - 12,
        );
        if (e.champion) circle(e.x, e.y, e.radius + 10, null, "#ffdf91", 2);
      }
      if (e.bossGuard) circle(e.x, e.y, e.radius + 8, null, "#8deaff88", 1);
      if (e.hp < e.maxHp && e.type !== "boss") {
        ctx.fillStyle = "#29192d";
        ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2, 3);
        ctx.fillStyle = c;
        ctx.fillRect(
          e.x - e.radius,
          e.y - e.radius - 8,
          e.radius * 2 * clamp(e.hp / e.maxHp, 0, 1),
          3,
        );
      }
    }
    for (const b of r.bullets) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.source === "missile" ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      circle(b.x, b.y, b.radius, b.color);
    }
    for (const b of r.enemyBullets) {
      if (
        b.x < cam.x - 20 ||
        b.x > cam.x + w / zoom + 20 ||
        b.y < cam.y - 20 ||
        b.y > cam.y + h / zoom + 20
      )
        continue;
      if (b.boss && quality === 2) {
        ctx.strokeStyle = (b.color || "#ff6e96") + "66";
        ctx.lineWidth = b.radius * 1.2;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.045, b.y - b.vy * 0.045);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      circle(b.x, b.y, b.radius, b.color || "#ff7aaa");
      if (quality > 0) circle(b.x, b.y, Math.max(1, b.radius * 0.3), "#fff0f4");
      circle(b.x, b.y, b.radius + 3, null, (b.color || "#ff6e96") + "55");
    }
    const orbit = r.weapons.find((w) => w.id === "orbit");
    if (orbit) {
      const count = 2 + Math.floor(orbit.level / 2) + (orbit.evolved ? 3 : 0),
        radius = 63 + orbit.level * 5 + (orbit.evolved ? 25 : 0);
      circle(p.x, p.y, radius, null, "#b7a4ff22");
      for (let i = 0; i < count; i++) {
        const a = t * (orbit.evolved ? 2.8 : 2) + (i / count) * Math.PI * 2;
        polygon(
          p.x + Math.cos(a) * radius,
          p.y + Math.sin(a) * radius,
          13,
          4,
          a + t,
          "#dbd0ff",
          "#b6a2ff",
        );
      }
    }
    // 星艦中央是命中核心；朝向與尾焰提示衝刺方向。
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.dy, p.dx) + Math.PI / 2);
    const moving =
      Math.hypot(input.x, input.y) > 0.05 || keys.size > 0 || p.dashTime > 0;
    if (moving) {
      ctx.beginPath();
      ctx.moveTo(-7, 15);
      ctx.lineTo(0, 30 + Math.sin(t * 30) * 8 + (p.dashTime > 0 ? 35 : 0));
      ctx.lineTo(7, 15);
      ctx.fillStyle = "#88f4e680";
      ctx.fill();
    }
    ctx.globalAlpha = p.inv > 0 && Math.sin(t * 32) > 0 ? 0.55 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(16, 18);
    ctx.lineTo(0, 11);
    ctx.lineTo(-16, 18);
    ctx.closePath();
    ctx.fillStyle = "#c0fff0";
    ctx.fill();
    ctx.strokeStyle = "#63cfda";
    ctx.lineWidth = 2;
    ctx.stroke();
    polygon(0, 0, 7, 4, 0, "#2f4d72");
    ctx.restore();
    if (p.shield) circle(p.x, p.y, 31, null, "#d7c0ff", 2);
    if (p.dashTime > 0) circle(p.x, p.y, 28, null, "#8cf5e8aa", 2);
    for (const f of engine.fx) {
      const extent = (f.radius || 40) * 1.5;
      if (
        !["aim", "bolt"].includes(f.type) &&
        (f.x < cam.x - extent ||
          f.x > cam.x + w / zoom + extent ||
          f.y < cam.y - extent ||
          f.y > cam.y + h / zoom + extent)
      )
        continue;
      const frac = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = frac;
      if (f.type === "shockwave" && quality > 0) drawImpact(f, frac, quality);
      if (f.type === "chargeAura" && quality > 0) drawCharge(f, frac, quality);
      if (f.type === "ring") {
        const radius = f.radius * (1 - frac * 0.75);
        circle(f.x, f.y, radius, null, f.color, Math.max(1, frac * 4));
        if (f.maxLife > 0.5)
          circle(f.x, f.y, radius * 0.87, null, `${f.color}66`, 2);
      }
      if (f.type === "bolt") {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2 + frac * 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        for (let i = 1; i < 7; i++) {
          const u = i / 7;
          ctx.lineTo(
            f.x + (f.tx - f.x) * u + Math.sin(i * 33 + f.x) * 10,
            f.y + (f.ty - f.y) * u + Math.cos(i * 27 + f.y) * 10,
          );
        }
        ctx.lineTo(f.tx, f.ty);
        ctx.stroke();
      }
      if (f.type === "aim") {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.tx, f.ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (f.type === "text") {
        ctx.fillStyle = f.color;
        ctx.textAlign = "center";
        ctx.font = `${f.crit ? "bold 17" : "14"}px Akane Sans, system-ui`;
        ctx.fillText(f.text, f.x, f.y - (1 - frac) * 25);
      }
      if (f.type === "spark" && quality > 0 && profile.settings.particles) {
        const count = quality === 2 ? 7 : 3;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2,
            rr = (1 - frac) * f.radius * 2 + 4;
          polygon(
            f.x + Math.cos(a) * rr,
            f.y + Math.sin(a) * rr,
            frac * 3 + 1,
            4,
            a,
            f.color,
          );
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const hz of r.hazards) {
      if (hz.shape === "beam") drawBeam(hz, true, quality);
      else
        circle(
          hz.x,
          hz.y,
          hz.radius,
          null,
          hz.warning > 0 ? "#ff709b88" : "#ffbbcf",
          2,
        );
    }
    ctx.restore();
    // 邊緣脈衝只染色外圈；中央、敵彈及 HUD 保持清楚。
    if (visual.motion && quality > 0 && engine.screenPulse > 0) {
      ctx.save();
      const edge = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.27,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.72,
      );
      edge.addColorStop(0, engine.screenColor + "00");
      edge.addColorStop(1, engine.screenColor + "99");
      ctx.globalAlpha = engine.screenPulse * (quality === 2 ? 0.65 : 0.35);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    const boss = r.enemies.find((e) => e.type === "boss" && !e.dead);
    if (boss) {
      const bx = (boss.x - p.x) * zoom + w / 2,
        by = (boss.y - p.y) * zoom + h / 2;
      if (bx < 35 || bx > w - 35 || by < 110 || by > h - 35) {
        const dx = bx - w / 2,
          dy = by - h / 2,
          ratio = Math.min(
            (w / 2 - 35) / Math.max(1, Math.abs(dx)),
            (h / 2 - 110) / Math.max(1, Math.abs(dy)),
          ),
          x = w / 2 + dx * ratio,
          y = h / 2 + dy * ratio;
        polygon(x, y, 11, 3, Math.atan2(dy, dx), "#ff83b2");
        ctx.fillStyle = "#ffd3e4";
        ctx.font = "12px Akane Sans, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(
          `Boss · ${Math.round(dist(boss, p))}m`,
          clamp(x, 60, w - 60),
          clamp(y + 25, 130, h - 12),
        );
      }
    }
    if (r.bossIntro > 0 && h > 400) {
      const info = BOSS_DATA[r.bossIndexNext || 0];
      ctx.save();
      const alpha = Math.min(1, r.bossIntro);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#080d1dcc";
      ctx.fillRect(0, h - 190, w, 76);
      ctx.fillStyle = info.color;
      ctx.textAlign = "center";
      ctx.font = "11px Akane Sans, system-ui";
      ctx.fillText(info.title, w / 2, h - 166);
      ctx.font = `bold ${w < 500 ? 22 : 30}px Akane Sans, system-ui`;
      ctx.fillText(
        r.enemies.find((e) => e.type === "boss")?.phaseLevel > 1
          ? "核心狂暴 · " + info.name
          : "威脅接近 · " + info.name,
        w / 2,
        h - 134,
      );
      ctx.restore();
    }
  }
  // 6. 電腦與手機控制：釋放、暫停、切換頁面時清空輸入，避免飄移。
  function keyboardInput() {
    if (pointer) return input;
    return {
      x:
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      y:
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
        (keys.has("w") || keys.has("arrowup") ? 1 : 0),
    };
  }
  window.addEventListener("keydown", (e) => {
    if (
      screen !== "game" ||
      dialog.open ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)
    )
      return;
    const k = e.key.toLowerCase();
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
        "q",
        "p",
        "escape",
        "1",
        "2",
        "3",
      ].includes(k)
    )
      e.preventDefault();
    if (e.repeat) return;
    if (k === "p" || k === "escape") {
      if (engine.r.phase === "play") engine.pause();
      else if (engine.r.phase === "paused") engine.resume();
      return;
    }
    if (["1", "2", "3"].includes(k) && engine.r.phase !== "play") {
      const b = document.querySelector(`[data-choice="${Number(k) - 1}"]`);
      b?.click();
      return;
    }
    if (engine.r.phase !== "play") return;
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(k)
    )
      keys.add(k);
    input = keyboardInput();
    if (k === " ") engine.dash(input.x, input.y);
    if (k === "q") engine.burst();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (!pointer) input = keyboardInput();
  });
  window.addEventListener("blur", () => {
    resetControls();
    engine.pause();
    save();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resetControls();
      engine.pause();
      save();
    }
  });
  window.addEventListener("pagehide", save);
  window.addEventListener("akane-portal-pause", (event) => {
    resetControls();
    previous = 0;
    if (event.detail.paused) {
      engine.pause();
      if (audioContext?.state === "running")
        audioContext.suspend().catch(() => {});
      save();
    }
    // 再次進入保留暫停或選擇畫面，避免自動繼續後立即受傷。
  });
  window.addEventListener("resize", resizeCanvas);
  window.visualViewport?.addEventListener("resize", resizeCanvas);
  function frame(ts) {
    if (window.akanePortalPaused || document.hidden) {
      previous = 0;
      requestAnimationFrame(frame);
      return;
    }
    const dt = previous ? Math.min((ts - previous) / 1000, 0.05) : 0;
    previous = ts;
    if (screen === "game" && engine.r) {
      if (
        engine.r.phase === "play" &&
        !dialog.open &&
        !window.akanePortalPaused &&
        !document.hidden
      ) {
        input = keyboardInput();
        engine.step(dt, input);
      }
      draw();
      if (ts - lastHudPaint > 100) {
        updateHUD();
        lastHudPaint = ts;
      }
      if (ts - lastSave > 10000) save();
    }
    requestAnimationFrame(frame);
  }
  document.getElementById("home-link").onclick = (e) => {
    e.preventDefault();
    if (screen === "game") engine.pause();
    showHome();
  };
  document.getElementById("guide-btn").onclick = () => showGuide();
  document.getElementById("codex-btn").onclick = showCodex;
  document.getElementById("sound-btn").onclick = () => {
    profile.settings.sound = !profile.settings.sound;
    syncSound();
    save();
    sound("level");
  };
  document.getElementById("dialog-close").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        dialog.close();
    }
  });
  window.Starbreak = {
    engine,
    get profile() {
      return profile;
    },
    showHome,
    showGame,
  };
  showHome();
  requestAnimationFrame(frame);
})();
