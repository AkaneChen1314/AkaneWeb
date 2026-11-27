/* 檔案導讀：與畫面獨立的遊戲規則、敵人、成長與存檔資料；修改後可執行 tests/*.test.cjs。 */
// 霓虹吞噬者的規則引擎：同樣的輸入會得到同樣的結果，不依賴畫面與網頁。
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Serpent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const TAU = Math.PI * 2,
    SEG = 0.53;

  // ---------- 數學工具 ----------

  // 限制在範圍內。
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // 兩點的平面距離。
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // 固定種子的亂數，同一個種子每次結果相同。
  function seeded(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let n = Math.imul(t ^ (t >>> 15), 1 | t);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 多邊形面積（判斷纏繞圈夠不夠大）。
  function polygonArea(points) {
    let a = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++)
      a += (points[j].x + points[i].x) * (points[j].z - points[i].z);
    return Math.abs(a / 2);
  }
  // 點是否在多邊形裡面。
  function insidePolygon(p, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (
        a.z > p.z !== b.z > p.z &&
        p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
      )
        hit = !hit;
    }
    return hit;
  }
  // 點 p 到一條線段的距離；線段從 (x, z) 出發，沿 angle 延伸 length。
  function segmentDistance(p, x, z, angle, length) {
    const dx = Math.cos(angle),
      dz = Math.sin(angle),
      t = clamp((p.x - x) * dx + (p.z - z) * dz, 0, length);
    return Math.hypot(p.x - (x + dx * t), p.z - (z + dz * t));
  }

  // ---------- 遊戲資料：角色、模式、敵人、首領、道具 ----------

  // 四位角色的名稱、配色、能力與技能。
  const CHARACTERS = [
    {
      id: "verdant",
      name: "翡翠",
      english: "VERDANT",
      role: "靈巧型",
      title: "森林守護者",
      color: "#87eab1",
      accent: "#d5f875",
      dark: "#237054",
      speed: 7.4,
      health: 100,
      magnet: 2.8,
      stats: [85, 65, 95],
      skill: "森之引力",
      icon: "leaf",
      cooldown: 16,
      description: "展開 6 秒磁力場，大幅吸附能量並恢復生命。",
      flavor: "循著微光前行，讓整座森林為你甦醒。",
    },
    {
      id: "ember",
      name: "赤焰",
      english: "EMBER",
      role: "爆發型",
      title: "熔岩漫遊者",
      color: "#f38b64",
      accent: "#ffe084",
      dark: "#963b36",
      speed: 7.8,
      health: 85,
      magnet: 2.1,
      stats: [95, 50, 70],
      skill: "熾焰爆破",
      icon: "bolt",
      cooldown: 13,
      description: "釋放大範圍爆破，傷害敵人並讓蛇身燃燒 6 秒。",
      flavor: "把膽量點燃，讓每一道尾跡都成為傳說。",
    },
    {
      id: "glacier",
      name: "霜嵐",
      english: "GLACIER",
      role: "控制型",
      title: "極光編織者",
      color: "#83d6ed",
      accent: "#e5fcff",
      dark: "#356a9d",
      speed: 6.8,
      health: 110,
      magnet: 2.5,
      stats: [70, 80, 85],
      skill: "絕對零度",
      icon: "hex",
      cooldown: 18,
      description: "凍結全場敵人 5 秒，並釋放冰霜衝擊波。",
      flavor: "世界安靜下來時，正是你出發的時候。",
    },
    {
      id: "nova",
      name: "曜金",
      english: "NOVA",
      role: "防禦型",
      title: "星環領航員",
      color: "#ebca69",
      accent: "#fff3c0",
      dark: "#98723b",
      speed: 6.5,
      health: 140,
      magnet: 2.3,
      stats: [60, 100, 75],
      skill: "星環護盾",
      icon: "shield",
      cooldown: 19,
      description: "啟動 6 秒無敵護盾，碰撞敵人造成反擊傷害。",
      flavor: "帶著星辰的重量，穩穩走向下一場勝利。",
    },
  ];
  // 每個戰場有自己的特殊地形，玩法不同，不只是外觀不同。
  const WORLDS = [
    {
      name: "螢光森境",
      subtitle: "螢光蘑菇 / 巨木遺跡 / 泥沼",
      color: "#87eab1",
      floor: "#15282a",
      grid: "#25423f",
      rock: "#314f44",
      crystal: "#91edb5",
      background: "#0b171c",
      patches: ["#183430", "#1c3226", "#13302f"],
      zone: {
        name: "泥沼",
        effect: "移動減速 40%，敵人進入同樣變慢",
        color: "#26301f",
        accent: "#6f8a3c",
      },
      landmark: "巨木",
    },
    {
      name: "極光冰原",
      subtitle: "冰晶尖塔 / 雪丘 / 冰面",
      color: "#83d6ed",
      floor: "#172936",
      grid: "#2a4558",
      rock: "#46647b",
      crystal: "#a1e1ef",
      background: "#0c1825",
      patches: ["#1b3142", "#1d2f3d", "#20384a"],
      zone: {
        name: "冰面",
        effect: "速度 +15%，但轉向變得滑溜",
        color: "#3f7891",
        accent: "#d8f6ff",
      },
      landmark: "冰晶尖塔",
    },
    {
      name: "赤沙遺境",
      subtitle: "遠古方碑 / 沙丘 / 流沙",
      color: "#efab72",
      floor: "#302821",
      grid: "#504031",
      rock: "#76533d",
      crystal: "#f3ba69",
      background: "#201b19",
      patches: ["#372c22", "#3a2f25", "#2e251e"],
      zone: {
        name: "流沙",
        effect: "移動減速 45%，並被慢慢拉向中心",
        color: "#5c4128",
        accent: "#d39a5b",
      },
      landmark: "遠古方碑",
    },
  ];
  // 遊戲模式：時間、目標與說明。
  const MODES = {
    arena: {
      name: "蟲群對戰",
      duration: Infinity,
      tag: "4 波殲滅 / 主動出擊",
      icon: "bolt",
      goal: "擊敗四波全部敵蟲才獲勝。波次之間恢復 20 HP，獲得一次進化。",
    },
    boss: {
      name: "首領連戰",
      duration: Infinity,
      tag: "3 位首領 / 招式攻略",
      icon: "hex",
      goal: "依序擊敗三位首領才獲勝。每位首領有三個階段與四種招式；戰鬥之間恢復 35 HP，獲得一次進化。",
    },
    endless: {
      name: "無盡狂潮",
      duration: Infinity,
      tag: "難度遞增 / 挑戰極限",
      icon: "target",
      goal: "敵潮持續增強，每 60 秒加入一位首領。沒有通關倒數，直到生命歸零或主動結算。",
    },
    survival: {
      name: "荒野生存",
      duration: 180,
      tag: "180 秒 / 生存挑戰",
      icon: "shield",
      goal: "存活 180 秒即可過關。120 秒時首領出現，不必擊敗首領。",
    },
    blitz: {
      name: "極速獵食",
      duration: 120,
      tag: "120 秒 / 得分 ×1.5",
      icon: "diamond",
      goal: "在 120 秒內盡量得分。食物較多、吞噬得分 1.5 倍，仍會受傷死亡。",
    },
    zen: {
      name: "悠遊秘境",
      duration: Infinity,
      tag: "無敵探索 / 輕鬆收集",
      icon: "leaf",
      goal: "沒有敵人、不會受傷。從暫停選單結算，才能保存本局獎勵。",
    },
  };
  // 難度會影響敵人種類、傷害、行動速度與預警時間。
  const DIFFICULTIES = {
    easy: {
      name: "普通",
      tag: "輕鬆上手",
      desc: "5 種基本怪物。敵人較慢、較脆，攻擊間隔較長，紅色預警多 35% 時間；首領招式較少。得分 ×0.85。",
      hp: 0.8,
      speed: 0.85,
      damage: 0.7,
      spawn: 1.3,
      rate: 0.75,
      bullet: 0.8,
      warn: 1.35,
      bossHp: 0.8,
      elite: 0,
      extra: -1,
      score: 0.85,
      win: 15,
      tier: 1,
      waves: [4, 6, 8, 10],
    },
    normal: {
      name: "中等",
      tag: "標準挑戰",
      desc: "8 種怪物，加入衝鋒甲蟲、自爆蟲與盾甲蟲；偶爾出現精英怪。首領三階段、四種招式全開。",
      hp: 1,
      speed: 1,
      damage: 1,
      spawn: 1,
      rate: 1,
      bullet: 1,
      warn: 1,
      bossHp: 1,
      elite: 0.06,
      extra: 0,
      score: 1,
      win: 20,
      tier: 2,
      waves: [5, 7, 9, 12],
    },
    hard: {
      name: "困難",
      tag: "高手限定",
      desc: "全部 10 種怪物，加入巫蟲與狙擊蟲。敵人更快更硬、攻擊更密，預警縮短，精英怪常見；首領提早使出大招且數量更多。得分 ×1.5。",
      hp: 1.35,
      speed: 1.12,
      damage: 1.3,
      spawn: 0.78,
      rate: 1.3,
      bullet: 1.08,
      warn: 0.8,
      bossHp: 1.4,
      elite: 0.18,
      extra: 1,
      score: 1.5,
      win: 30,
      tier: 3,
      waves: [6, 8, 11, 14],
    },
  };
  // tier: lowest difficulty that uses the monster (1 普通 / 2 中等 / 3 困難). wave: earliest wave it can appear.
  const ENEMIES = {
    chaser: {
      name: "斥候蟲",
      color: "#ff8c91",
      hp: 32,
      speed: 2.8,
      r: 0.65,
      tier: 1,
      wave: 1,
      weight: 24,
      desc: "紅色核心，直線追著你跑。最基本的敵人。",
    },
    serpent: {
      name: "追獵蟲",
      color: "#ff8c91",
      hp: 55,
      speed: 3.8,
      r: 0.8,
      tier: 1,
      wave: 1,
      weight: 20,
      desc: "有長身體的敵蛇，頭和身體都能咬。",
    },
    ranged: {
      name: "砲擊蟲",
      color: "#db94ef",
      hp: 34,
      speed: 2.8,
      r: 0.65,
      tier: 1,
      wave: 1,
      weight: 15,
      desc: "保持距離繞著你射擊；困難時一次三發。",
    },
    swarm: {
      name: "群蜂",
      color: "#ffd45c",
      hp: 12,
      speed: 4.6,
      r: 0.42,
      tier: 1,
      wave: 2,
      weight: 12,
      pack: [4, 6],
      contact: 0.55,
      desc: "一次 4–6 隻成群出現，很脆但很快、會蛇行。一圈就能全部絞殺。",
    },
    splitter: {
      name: "分裂蟲",
      color: "#9be37a",
      hp: 48,
      speed: 2.4,
      r: 0.8,
      tier: 1,
      wave: 2,
      weight: 12,
      desc: "被打倒時分裂成 2 隻小分裂蟲（困難 3 隻）。",
    },
    charger: {
      name: "衝鋒甲蟲",
      color: "#ff9a5a",
      hp: 60,
      speed: 2.6,
      r: 0.75,
      tier: 2,
      wave: 2,
      weight: 12,
      desc: "蓄力 0.9 秒後直線衝鋒，路徑先亮紅色；衝完會暈眩，暈眩時多受 50% 傷害。",
    },
    bomber: {
      name: "自爆蟲",
      color: "#ff5d5d",
      hp: 26,
      speed: 4.1,
      r: 0.6,
      tier: 2,
      wave: 3,
      weight: 10,
      desc: "靠近後點燃引信，1 秒後爆炸。爆炸也會炸傷附近的其他敵人。",
    },
    shield: {
      name: "盾甲蟲",
      color: "#7fb4ff",
      hp: 70,
      speed: 2.4,
      r: 0.8,
      tier: 2,
      wave: 3,
      weight: 9,
      desc: "正面護盾讓咬擊、反擊與光刃只剩 25% 傷害。用衝撞破盾，或直接纏繞。",
    },
    healer: {
      name: "巫蟲",
      color: "#b8ffcf",
      hp: 40,
      speed: 2.6,
      r: 0.65,
      tier: 3,
      wave: 3,
      weight: 7,
      desc: "躲在後方，每 3 秒替周圍敵人回復 30% 生命。優先擊破。",
    },
    sniper: {
      name: "狙擊蟲",
      color: "#c58bff",
      hp: 36,
      speed: 2.2,
      r: 0.65,
      tier: 3,
      wave: 4,
      weight: 7,
      desc: "在遠處瞄準 1.2 秒（紅色雷射），鎖定後射出高速子彈。看到雷射就轉向。",
    },
    mini: {
      name: "小分裂蟲",
      color: "#c4f59e",
      hp: 16,
      speed: 3.6,
      r: 0.45,
      tier: 99,
      wave: 99,
      weight: 0,
      contact: 0.6,
      desc: "分裂蟲死後留下的小蟲。",
    },
  };
  // 攻擊：咬擊自動觸發、衝撞要按住衝刺、纏繞要用身體圍成一圈。
  const COMBAT = {
    bite: 40,
    biteRange: 3.8,
    biteCooldown: 0.5,
    ram: 70,
    ramCooldown: 0.7,
    counter: 25,
    counterCooldown: 0.9,
    coil: 120,
    coilPerSegment: 3,
    coilCooldown: 0.8,
    coilMinLength: 14,
  };
  // phase: first boss phase that uses the move (困難 unlocks every move one phase earlier).
  const BOSS_MOVES = {
    quake: {
      name: "震地",
      phase: 1,
      desc: "在你的位置與前進路線上放置紅圈，填滿後震地。",
    },
    fissure: {
      name: "地裂",
      phase: 1,
      desc: "從首領身上裂出數道直線，亮起 1 秒後爆發；第三階段改成全方位。",
    },
    rockfall: {
      name: "落石雨",
      phase: 2,
      desc: "你周圍落下大量石塊，每顆都有預警圈。",
    },
    magma: {
      name: "熔岩怒吼",
      phase: 3,
      desc: "擴散的熔岩環，按住衝刺可以直接穿過。",
    },
    brood: { name: "召喚蟲群", phase: 1, desc: "在身邊召喚多組小怪。" },
    miasma: {
      name: "毒霧",
      phase: 1,
      desc: "在你附近留下持續 6 秒的毒霧池，站在裡面會持續受傷。",
    },
    spiral: {
      name: "螺旋彈幕",
      phase: 2,
      desc: "原地旋轉射出螺旋狀子彈，找縫隙鑽過去。",
    },
    guard: {
      name: "女王之盾",
      phase: 2,
      desc: "只要她召喚的小蟲還活著，女王只受 35% 傷害。",
    },
    charge: {
      name: "雷霆突進",
      phase: 1,
      desc: "亮出紅色路徑後高速突進，第二、三階段連續 2–3 次；結束後暈眩。",
    },
    thunder: { name: "落雷", phase: 1, desc: "一連串落雷砸向你的位置。" },
    laser: {
      name: "雷射掃射",
      phase: 2,
      desc: "射出雷射並橫掃 120 度，第三階段兩道同時掃。",
    },
    pulse: {
      name: "電磁環",
      phase: 2,
      desc: "連續放出擴散的電磁環，按住衝刺可以直接穿過。",
    },
  };
  // 三位首領：血量、招式與各階段名稱。
  const BOSSES = [
    {
      name: "裂地守衛",
      title: "熔岩巨像",
      hp: 950,
      color: "#f1b267",
      moves: ["quake", "fissure", "rockfall", "magma"],
      phases: ["岩殼", "熔核外露", "熔岩怒吼"],
      tip: "紅圈和地裂線亮起後才會爆發；看清預警再走位，岩石能擋子彈。",
    },
    {
      name: "孵巢女王",
      title: "萬蟲之母",
      hp: 1250,
      color: "#db94ef",
      moves: ["brood", "miasma", "spiral", "guard"],
      phases: ["巢穴甦醒", "女王之盾", "狂亂繁殖"],
      tip: "小蟲活著時女王會減傷：繞圈把蟲群一網打盡，再攻擊女王。",
    },
    {
      name: "雷霆暴君",
      title: "風暴君王",
      hp: 1600,
      color: "#83d6ed",
      moves: ["charge", "thunder", "laser", "pulse"],
      phases: ["雷雲聚集", "超載", "風暴之眼"],
      tip: "突進結束會暈眩，趁機衝撞；電磁環按住衝刺就能穿過。",
    },
  ];
  // Base damage at 中等. 普通 ×0.7, 困難 ×1.3. Terrain never damages you.
  const DAMAGE = {
    enemy: {
      amount: 18,
      label: "蛇頭撞到敵人頭部／核心",
      advice: "靠近時蛇頭會自動咬擊；被包圍時按住衝刺撞開，或繞圈纏繞絞殺。",
    },
    boss: {
      amount: 30,
      label: "蛇頭撞到首領核心",
      advice: "繞著首領轉圈，讓光刃與蛇身反擊削血，趁首領暈眩時衝撞。",
    },
    charge: {
      amount: 22,
      label: "被衝鋒甲蟲撞到",
      advice: "甲蟲身前亮出紅色路徑時橫向閃開，衝完牠會暈眩。",
    },
    projectile: {
      amount: 14,
      label: "蛇頭被敵方子彈擊中",
      advice: "橫向閃避彈幕；岩石和柱子能擋下子彈。看到紅色雷射瞄準線就轉向。",
    },
    explosion: {
      amount: 24,
      label: "自爆蟲爆炸",
      advice: "自爆蟲閃爍時立刻遠離；也可以把牠引到其他敵人旁邊。",
    },
    shockwave: {
      amount: 26,
      label: "蛇頭被紅圈震地擊中",
      advice: "紅圈填滿前移出範圍；衝刺可以快速離開。",
    },
    fissure: {
      amount: 24,
      label: "被地裂線擊中",
      advice: "地裂線亮起約 1 秒才爆發，往兩條線之間的空隙移動。",
    },
    rockfall: {
      amount: 20,
      label: "被落石砸中",
      advice: "落石圈越來越亮就要落下了，持續移動不要停。",
    },
    poison: {
      amount: 10,
      label: "待在毒霧池裡",
      advice: "綠色毒霧會持續 6 秒，繞開它，或快速穿過。",
    },
    lightning: {
      amount: 24,
      label: "被落雷劈中",
      advice: "落雷會連續砸向你的位置，保持移動並改變方向。",
    },
    laser: {
      amount: 20,
      label: "被雷射掃到",
      advice: "雷射會朝一個方向橫掃，往掃射的反方向繞到首領身後。",
    },
    ring: {
      amount: 20,
      label: "被擴散的能量環擊中",
      advice: "能量環按住衝刺就能直接穿過。",
    },
  };
  // 食物與道具：分數、經驗、成長與效果。
  const FOODS = {
    energy: {
      name: "能量球",
      score: 10,
      xp: 2,
      growth: 1,
      color: "",
      desc: "最常見的能量，顏色隨戰場改變。",
    },
    fruit: {
      name: "星光果",
      score: 30,
      xp: 5,
      growth: 3,
      color: "#ffd27a",
      desc: "較大的果實，成長與經驗更多。",
    },
    crystal: {
      name: "進化晶體",
      score: 50,
      xp: 5,
      growth: 2,
      crystal: 1,
      color: "#e5ed8d",
      desc: "金色鑽石，+1 局外晶體。",
    },
    heal: {
      name: "生命十字",
      score: 10,
      xp: 2,
      growth: 1,
      heal: 20,
      color: "#ffb8bc",
      desc: "恢復 20 HP；生命低於一半時出現得更多。",
    },
    speed: {
      name: "疾風羽",
      power: true,
      duration: 6,
      score: 20,
      xp: 3,
      growth: 1,
      color: "#7ff5e4",
      desc: "6 秒內速度 +30%，衝刺不耗能量。",
    },
    magnet: {
      name: "磁暴核",
      power: true,
      duration: 8,
      score: 20,
      xp: 3,
      growth: 1,
      color: "#b79cff",
      desc: "8 秒內吸附範圍 +9。",
    },
    fury: {
      name: "怒焰椒",
      power: true,
      duration: 8,
      score: 20,
      xp: 3,
      growth: 1,
      color: "#ff6f59",
      desc: "8 秒內所有傷害 ×1.8，咬擊速度加倍。",
    },
    shield: {
      name: "護盾泡",
      power: true,
      duration: 25,
      score: 20,
      xp: 3,
      growth: 1,
      color: "#8fd3ff",
      desc: "抵擋下一次傷害，25 秒內有效。",
    },
    bomb: {
      name: "爆裂果",
      power: true,
      duration: 0,
      score: 20,
      xp: 3,
      growth: 1,
      color: "#ffb347",
      desc: "吃下立刻爆炸，周圍敵人受到 90 傷害。",
    },
    rainbow: {
      name: "彩虹果",
      power: true,
      duration: 0,
      score: 250,
      xp: 14,
      growth: 4,
      color: "#f7a8ff",
      desc: "+250 分、+14 經驗，蛇身也長得更多。",
    },
  };
  const POWER_IDS = ["speed", "magnet", "fury", "shield", "bomb", "rainbow"],
    POWER_WEIGHTS = [18, 17, 18, 16, 18, 10];
  // 地圖上的特殊設施說明。
  const FEATURES = {
    spring: {
      name: "治癒泉",
      desc: "蛇頭停在泉中每秒恢復 9 HP；泉水用完會慢慢回滿。",
      color: "#7ef0c8",
    },
    pad: {
      name: "加速板",
      desc: "經過時 1.6 秒內速度 ×1.5，並補充 25 衝刺能量。",
      color: "#d9f77b",
    },
    portal: {
      name: "傳送門",
      desc: "成對出現，進入後從另一端出來，整條蛇一起傳送。",
      color: "#c49bff",
    },
    cache: {
      name: "晶簇寶箱",
      desc: "咬擊、衝撞或纏繞打破，掉落能量、晶體或道具。",
      color: "#ffd27a",
    },
    rock: {
      name: "岩石／地標",
      desc: "不會扣血，只會擋路並讓蛇頭沿邊滑開；也會擋下敵方子彈。",
      color: "#7a8f8a",
    },
  };
  // 升級三選一的內容；apply 直接修改這一局的數值。
  const UPGRADES = [
    {
      id: "magnet",
      name: "引力核心",
      icon: "target",
      description: "吸附範圍 +35%，遠處能量也不錯過。",
      max: 5,
      apply: (g) => (g.magnet *= 1.35),
    },
    {
      id: "orbit",
      name: "星環護衛",
      icon: "hex",
      description: "增加一顆環繞光刃，自動攻擊靠近的敵人。",
      max: 4,
      apply: (g) => g.orbitCount++,
    },
    {
      id: "power",
      name: "能量增幅",
      icon: "bolt",
      description: "所有攻擊與技能傷害 +30%。",
      max: 5,
      apply: (g) => (g.damage *= 1.3),
    },
    {
      id: "fang",
      name: "銳利獠牙",
      icon: "target",
      description: "自動咬擊範圍 +20%，咬擊間隔縮短 15%。",
      max: 3,
      // 效果：咬擊範圍變大 20%，咬擊間隔縮短 15%（*= 是「乘上」的意思）。
      apply: (g) => {
        g.biteRange *= 1.2;
        g.biteRate *= 0.85;
      },
    },
    {
      id: "coil",
      name: "纏繞之鱗",
      icon: "snake",
      description: "纏繞絞殺傷害 +40%，圈得越大越痛。",
      max: 3,
      apply: (g) => (g.coilPower *= 1.4),
    },
    {
      id: "haste",
      name: "輕盈鱗片",
      icon: "leaf",
      description: "移動速度 +10%，衝刺恢復更快。",
      max: 4,
      // 效果：移動速度 +10%，衝刺能量回得更快。
      apply: (g) => {
        g.speed *= 1.1;
        g.dashRegen += 4;
      },
    },
    {
      id: "health",
      name: "生命綻放",
      icon: "shield",
      description: "生命上限 +25，立即恢復 40 點生命。",
      max: 5,
      // 效果：最大生命 +25，並立刻回復 40 點（不超過上限）。
      apply: (g) => {
        g.maxHealth += 25;
        g.health = Math.min(g.maxHealth, g.health + 40);
      },
    },
    {
      id: "pulse",
      name: "共鳴脈衝",
      icon: "diamond",
      description: "每隔 4 秒發出衝擊波，自動清除身邊威脅。",
      max: 3,
      apply: (g) => g.pulseLevel++,
    },
    {
      id: "cooldown",
      name: "時間迴路",
      icon: "hex",
      description: "專屬技能冷卻縮短 18%。",
      max: 4,
      apply: (g) => (g.cooldownMax *= 0.82),
    },
    {
      id: "fortune",
      name: "璀璨之心",
      icon: "diamond",
      description: "得分與成長能量 +25%。",
      max: 4,
      apply: (g) => (g.bonus += 0.25),
    },
    {
      id: "regen",
      name: "自然癒合",
      icon: "leaf",
      description: "每秒恢復 1.5 點生命，穩定探索更遠。",
      max: 3,
      apply: (g) => (g.regen += 1.5),
    },
    {
      id: "repair",
      name: "生命補給",
      icon: "shield",
      description: "立即恢復全部生命，並獲得 5 枚晶體。",
      max: Infinity,
      // 效果：生命補滿，再加 5 個晶體。
      apply: (g) => {
        g.health = g.maxHealth;
        g.crystals += 5;
      },
    },
  ];
  // 研究所的永久強化。
  const META = [
    {
      id: "vitality",
      name: "生命源核",
      icon: "shield",
      description: "每級增加 10 點初始生命，讓冒險更加從容。",
      base: 30,
    },
    {
      id: "magnet",
      name: "引力共振",
      icon: "target",
      description: "每級增加 8% 初始吸附距離，更快開始進化。",
      base: 25,
    },
    {
      id: "fortune",
      name: "能量親和",
      icon: "diamond",
      description: "每級增加 5% 得分與成長能量，持續突破極限。",
      base: 35,
    },
  ];
  // 成就與達成條件。
  const ACHIEVEMENTS = [
    {
      id: "first",
      name: "旅程的開始",
      desc: "完成第一場冒險",
      test: (p) => p.runs >= 1,
    },
    {
      id: "collector",
      name: "微光收藏家",
      desc: "單局吞噬 100 份食物",
      test: (_, g) => g.foodEaten >= 100,
    },
    {
      id: "long",
      name: "蜿蜒星河",
      desc: "單局長度達到 60",
      test: (_, g) => g.maxLength >= 60,
    },
    {
      id: "hunter",
      name: "秘境獵手",
      desc: "單局擊退 25 名敵人",
      test: (_, g) => g.kills >= 25,
    },
    {
      id: "coil",
      name: "絞殺大師",
      desc: "單局以纏繞擊敗 10 名敵人",
      test: (_, g) => g.coilKills >= 10,
    },
    {
      id: "boss",
      name: "弒星者",
      desc: "擊敗秘境守衛",
      test: (_, g) => g.bossKilled,
    },
    {
      id: "hard",
      name: "無畏挑戰者",
      desc: "在困難難度完成一次挑戰",
      test: (_, g) => g.difficulty === "hard" && g.won && g.mode !== "zen",
    },
    {
      id: "survivor",
      name: "黎明之後",
      desc: "完成一次荒野生存",
      test: (_, g) => g.mode === "survival" && g.won,
    },
    {
      id: "evolve",
      name: "超越本能",
      desc: "單局進化至等級 10",
      test: (_, g) => g.level >= 10,
    },
    {
      id: "explorer",
      name: "世界漫遊者",
      desc: "在三座戰場完成冒險",
      test: (p) => p.worlds.length === 3,
    },
    {
      id: "family",
      name: "蛇靈契約",
      desc: "使用四位角色完成冒險",
      test: (p) => p.characters.length === 4,
    },
  ];
  const GUIDE_VERSION = 5;

  // ---------- 存檔 ----------

  // 全新的個人檔案。
  function defaultProfile() {
    return {
      version: 2,
      guideVersion: 0,
      tutorialCompleted: false,
      crystals: 0,
      runs: 0,
      best: 0,
      totalKills: 0,
      wins: 0,
      upgrades: { vitality: 0, magnet: 0, fortune: 0 },
      achievements: [],
      history: [],
      worlds: [],
      characters: [],
      settings: {
        sound: true,
        volume: 0.35,
        quality: "high",
        reducedMotion: false,
        control: "auto",
        briefing: true,
      },
      selected: 0,
      world: 0,
      mode: "arena",
      difficulty: "normal",
    };
  }
  // 檢查並修正讀到的存檔，缺漏或不合理的值改回預設。
  function sanitizeProfile(raw) {
    // 先建立一份全新的預設資料；讀到的存檔不是物件（壞掉或空的）就直接用預設值。
    const p = defaultProfile();
    if (!raw || typeof raw !== "object") return p;
    // 下面逐項把存檔裡的數字「洗乾淨」：不是數字、是負數或太大都會被修正到合理
    // 範圍（clamp），避免被改壞的存檔讓遊戲出錯。
    p.guideVersion = clamp(
      Math.floor(Number(raw.guideVersion) || 0),
      0,
      GUIDE_VERSION,
    );
    p.tutorialCompleted = raw.tutorialCompleted === true;
    for (const key of ["crystals", "runs", "best", "totalKills", "wins"])
      p[key] = clamp(Math.floor(Number(raw[key]) || 0), 0, 1e9);
    // 永久升級每項 0～5 級。
    for (const key of Object.keys(p.upgrades))
      p.upgrades[key] = clamp(
        Math.floor(Number(raw.upgrades?.[key]) || 0),
        0,
        5,
      );
    // 已達成的成就、已解鎖的地圖（0～2）與角色（0～3）：只保留遊戲裡真的存在的，
    // 並去掉重複（new Set）。
    p.achievements = [
      ...new Set(
        Array.isArray(raw.achievements)
          ? raw.achievements.filter((x) => ACHIEVEMENTS.some((a) => a.id === x))
          : [],
      ),
    ];
    p.worlds = [
      ...new Set(
        Array.isArray(raw.worlds)
          ? raw.worlds.filter((x) => Number.isInteger(x) && x >= 0 && x < 3)
          : [],
      ),
    ];
    p.characters = [
      ...new Set(
        Array.isArray(raw.characters)
          ? raw.characters.filter((x) => Number.isInteger(x) && x >= 0 && x < 4)
          : [],
      ),
    ];
    // 歷史紀錄只留最近幾筆。
    if (Array.isArray(raw.history))
      p.history = raw.history
        .filter(
          (x) =>
            x &&
            typeof x === "object" &&
            Number.isFinite(x.score) &&
            MODES[x.mode] &&
            CHARACTERS[x.character] &&
            WORLDS[x.world],
        )
        .slice(0, 15)
        .map((x) => ({
          score: clamp(Math.floor(x.score), 0, 1e9),
          time: clamp(Number(x.time) || 0, 0, 1e7),
          mode: x.mode,
          character: x.character,
          world: x.world,
          won: !!x.won,
          date: Number(x.date) || 0,
          difficulty: DIFFICULTIES[x.difficulty] ? x.difficulty : "normal",
        }));
    // 設定值逐項檢查型別。
    if (raw.settings) {
      const s = raw.settings;
      for (const k of ["sound", "reducedMotion", "briefing"])
        if (typeof s[k] === "boolean") p.settings[k] = s[k];
      p.settings.volume = Number.isFinite(s.volume)
        ? clamp(s.volume, 0, 1)
        : 0.35;
      p.settings.quality = ["high", "low"].includes(s.quality)
        ? s.quality
        : "high";
      // 第一版存檔預設是「鍵盤」，幫那些玩家改成自動判斷鍵盤與滑鼠。
      p.settings.control =
        s.control === "pointer"
          ? "pointer"
          : s.control === "keyboard" && Number(raw.version) >= 2
            ? "keyboard"
            : "auto";
    }
    // 上次選的角色、地圖、模式與難度；不合理就用預設值。
    p.selected = clamp(Math.floor(Number(raw.selected) || 0), 0, 3);
    p.world = clamp(Math.floor(Number(raw.world) || 0), 0, 2);
    p.mode = MODES[raw.mode] ? raw.mode : "survival";
    p.difficulty = DIFFICULTIES[raw.difficulty] ? raw.difficulty : "normal";
    return p;
  }
  // 花晶體買永久強化，最多五級。
  function buyUpgrade(p, id) {
    const def = META.find((x) => x.id === id);
    if (!def || p.upgrades[id] >= 5) return false;
    const price = def.base * (p.upgrades[id] + 1);
    if (p.crystals < price) return false;
    p.crystals -= price;
    p.upgrades[id]++;
    return true;
  }
  // 一局結束後結算獎勵、紀錄與成就，只會結算一次。
  function settle(p, g) {
    if (g.training || g.settled || !g.over) return null;
    g.settled = true;
    const reward =
      g.crystals +
      Math.floor(g.score / 300) +
      (g.won && g.mode !== "zen" ? g.diff.win : 0);
    const record = g.score > p.best;
    p.crystals += reward;
    p.runs++;
    p.best = Math.max(p.best, g.score);
    p.totalKills += g.kills;
    if (g.won && g.mode !== "zen") p.wins++;
    if (!p.worlds.includes(g.world)) p.worlds.push(g.world);
    if (!p.characters.includes(g.characterIndex))
      p.characters.push(g.characterIndex);
    const earned = [];
    for (const a of ACHIEVEMENTS)
      if (!p.achievements.includes(a.id) && a.test(p, g)) {
        p.achievements.push(a.id);
        earned.push(a.name);
        p.crystals += 10;
      }
    p.history.unshift({
      score: g.score,
      time: g.time,
      mode: g.mode,
      character: g.characterIndex,
      world: g.world,
      won: g.won,
      date: Date.now(),
      difficulty: g.difficulty,
    });
    p.history = p.history.slice(0, 15);
    return { reward: reward + earned.length * 10, earned, record };
  }

  // ---------- 遊戲規則 ----------

  // 一局遊戲的所有狀態與規則；不碰畫面，可以單獨測試。
  class Game {
    // 依角色、戰場、模式與永久強化建立一局。
    constructor({
      character = 0,
      world = 0,
      mode = "survival",
      upgrades = {},
      seed = Date.now(),
      training = false,
      difficulty = "normal",
    } = {}) {
      // 練習模式固定用「禪模式＋簡單難度」（沒有敵人、不會受傷）。
      this.training = training;
      if (training) {
        mode = "zen";
        difficulty = "easy";
      }
      // 難度、隨機數產生器（同一個 seed 會產生同一組隨機結果）、角色、地圖與模
      // 式。
      this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "normal";
      this.diff = DIFFICULTIES[this.difficulty];
      this.random = seeded(seed);
      this.characterIndex = character;
      this.character = CHARACTERS[character];
      this.world = world;
      this.mode = mode;
      this.duration = MODES[mode].duration;
      this.compact = mode === "arena" || mode === "boss";
      // 正式地圖長寬都是以前的兩倍（面積四倍）；新手練習維持小地圖。
      this.bound = training ? 42 : this.compact ? 84 : 126;
      // 本局的統計：時間、分數、晶體、擊退數、絞殺數、吃了多少、等級與經驗。
      this.time = 0;
      this.score = 0;
      this.crystals = 0;
      this.kills = 0;
      this.coilKills = 0;
      this.coils = 0;
      this.foodEaten = 0;
      this.level = 1;
      this.xp = 0;
      this.nextXP = 25;
      // 角色能力：生命（加上永久升級）、速度、吸取範圍、獎勵加成、傷害、回血。
      this.maxHealth = this.character.health + (upgrades.vitality || 0) * 10;
      this.health = this.maxHealth;
      this.speed = this.character.speed;
      this.magnet = this.character.magnet * (1 + (upgrades.magnet || 0) * 0.08);
      this.bonus = 1 + (upgrades.fortune || 0) * 0.05;
      this.damage = character === 1 ? 1.2 : 1;
      this.regen = 0;
      // 環繞光球、脈衝、咬擊範圍與間隔、絞殺威力。
      this.orbitCount = 1;
      this.pulseLevel = 0;
      this.pulseTimer = 4;
      this.biteRange = COMBAT.biteRange;
      this.biteRate = COMBAT.biteCooldown;
      this.coilPower = 1;
      // 技能冷卻、技能持續、凍結、開場 2 秒無敵。
      this.cooldown = 0;
      this.cooldownMax = this.character.cooldown;
      this.activeSkill = 0;
      this.frozen = 0;
      this.invulnerable = 2;
      // 衝刺能量（滿 100）、回復速度與狀態。
      this.dash = 100;
      this.dashRegen = 24;
      this.dashing = false;
      this.dashLocked = false;
      // 前進方向與速度。
      this.angle = -Math.PI / 2;
      this.targetAngle = this.angle;
      this.currentSpeed = this.speed;
      // 蛇的身體：14 節，從頭往後排成一直線；SEG 是每節的間距。
      this.snake = Array.from({ length: 14 }, (_, i) => ({ x: 0, z: i * SEG }));
      this.maxLength = 14;
      this.targetLength = 14;
      this.growth = 0;
      // 場上的東西：食物、敵人、子彈、粒子、光圈、事件、障礙物、裝飾、區域、跳
      // 躍板、傳送門、寶箱、地面花紋與危險區。
      this.food = [];
      this.enemies = [];
      this.projectiles = [];
      this.particles = [];
      this.rings = [];
      this.events = [];
      this.obstacles = [];
      this.decorations = [];
      this.zones = [];
      this.pads = [];
      this.portals = [];
      this.caches = [];
      this.patches = [];
      this.hazards = [];
      // 能力道具的剩餘時間：加速、磁吸、狂暴、護盾。
      this.powers = { speed: 0, magnet: 0, fury: 0, shield: 0 };
      this.boost = 0;
      this.portalCooldown = 0;
      this.coilCooldown = 0;
      this.zone = null;
      this.inSpring = false;
      // 升級選項、暫停與結束狀態、首領是否出現或被打倒。
      this.upgrades = {};
      this.choices = [];
      this.needsUpgrade = false;
      this.paused = false;
      this.over = false;
      this.won = false;
      this.bossSpawned = false;
      this.bossKilled = false;
      // 各種計時器：多久生一次敵人、食物、道具與寶箱。
      this.spawnTimer = 4;
      this.foodTimer = 0;
      this.powerTimer = 8;
      this.cacheTimer = 12;
      // 連擊數、波數、環繞角度、最後一次受傷的原因與結束原因。
      this.combo = 0;
      this.comboTimer = 0;
      this.maxCombo = 0;
      this.wave = 1;
      this.orbitAngle = 0;
      this.trailTimer = 0;
      this.lastDamage = null;
      this.endReason = null;
      this.lastNotice = {};
      // 咬擊冷卻、這一波還剩幾隻、波與波之間的整備時間、首領關卡的進度。
      this.biteCooldown = 0;
      this.biteVisual = 0;
      this.waveRemaining = this.diff.waves[0];
      this.stageGap = 0;
      this.bossesDefeated = 0;
      this.bossStageRewarded = 0;
      this.nextBossAt = 60;
      // 食物刻意放得少一點，讓每次撿到都有感覺。
      const area = (this.bound * 2) ** 2,
        density = mode === "blitz" ? 0.019 : mode === "zen" ? 0.014 : 0.012;
      // 地圖上食物的目標數量（依面積與密度），以及最多同時幾份。
      this.foodTarget = training ? 0 : Math.round(area * density);
      this.foodLimit =
        this.foodTarget + Math.round(this.foodTarget * 0.15) + 60;
      // 道具會出現在玩家附近，所以上限看附近密度，不看地圖大小。
      this.powerCap = training ? 0 : this.compact ? 3 : 5;
      // 寶箱數量；練習模式沒有寶箱，速度也放慢，然後直接結束設定。
      this.cacheTarget = training ? 0 : this.compact ? 10 : 24;
      if (training) {
        this.speed = 5;
        return;
      }
      // 蓋出地圖，放滿食物、寶箱與能力道具。
      this.buildMap();
      while (this.food.length < this.foodTarget) this.spawnAmbientFood();
      // 開場在前方放一小排食物，馬上學會移動與撿取。
      for (let i = 2; i <= 10; i++) {
        const p = { x: Math.sin(i * 0.32) * 2, z: -i * 1.3 };
        if (!this.obstacles.some((o) => distance(o, p) < o.r + 0.6))
          this.food.push({
            ...p,
            type: i === 10 ? "fruit" : "energy",
            phase: i,
          });
      }
      for (let i = 0; i < this.cacheTarget; i++) this.spawnCache();
      for (let i = 0; i < Math.min(2, this.powerCap); i++) this.spawnPower();
      // 競技場模式馬上開始第一波；首領模式一開始就出現首領。
      if (mode === "arena") this.spawnTimer = 0.3;
      if (mode === "boss") {
        const e = this.spawnEnemy(true, 0);
        e.x = 0;
        e.z = -13;
        this.emitBoss(e);
      }
    }
    // 這個位置是否已經有障礙或設施。
    occupied(p, clearance) {
      return (
        this.obstacles.some((o) => distance(o, p) < o.r + clearance) ||
        this.zones.some((z) => distance(z, p) < z.r + clearance) ||
        this.pads.some((o) => distance(o, p) < 1.8 + clearance) ||
        this.portals.some((o) => distance(o, p) < 1.8 + clearance) ||
        this.caches.some((o) => distance(o, p) < 1.2 + clearance)
      );
    }
    // 找一個放設施的空位，最多試 80 次。
    featurePosition(minCenter = 8, clearance = 2, margin = 6) {
      let p;
      for (let n = 0; n < 80; n++) {
        p = {
          x: (this.random() * 2 - 1) * (this.bound - margin),
          z: (this.random() * 2 - 1) * (this.bound - margin),
        };
        if (Math.hypot(p.x, p.z) >= minCenter && !this.occupied(p, clearance))
          return p;
      }
      return p;
    }
    // 建立地圖：障礙、特殊區域、加速板、傳送門與裝飾。
    buildMap() {
      const R = this.random,
        big = !this.compact,
        b = this.bound;
      // 大地圖：外圍八個區塊各放一組，再散佈小障礙。
      if (big) {
        // 在 3×3 格子上放八個地標（中間留空），大地圖每一區都有目標可以靠近。
        for (const gx of [-1, 0, 1])
          for (const gz of [-1, 0, 1]) {
            if (!gx && !gz) continue;
            this.obstacles.push({
              x: gx * b * 0.58 + (R() - 0.5) * 14,
              z: gz * b * 0.58 + (R() - 0.5) * 14,
              r: 3 + R() * 0.9,
              height: 7 + R() * 3,
              rotation: R() * TAU,
              landmark: true,
            });
          }
        for (let i = 0; i < 110; i++) {
          const p = this.featurePosition(10, 2.5, 4);
          this.obstacles.push({
            ...p,
            r: 0.9 + R() * 1.2,
            height: 1 + R() * 2.7,
            rotation: R() * TAU,
          });
        }
      } else {
        // Two rings of pillars give cover across the larger arena, plus a few scattered rocks.
        // 兩圈環狀的大型障礙。
        for (const [ring, offset] of [
          [0.3, 0.4],
          [0.64, 0.4 + Math.PI / 4],
        ])
          for (let i = 0; i < 4; i++) {
            const a = offset + (i * TAU) / 4;
            this.obstacles.push({
              x: Math.cos(a) * b * ring,
              z: Math.sin(a) * b * ring,
              r: 1.5,
              height: 3.6,
              rotation: a,
              pillar: true,
            });
          }
        for (let i = 0; i < 14; i++) {
          const p = this.featurePosition(16, 3, 5);
          this.obstacles.push({
            ...p,
            r: 0.8 + R() * 0.8,
            height: 1 + R() * 1.8,
            rotation: R() * TAU,
          });
        }
      }
      // 治癒泉。
      for (let i = 0; i < (big ? 9 : 3); i++)
        this.zones.push({
          type: "spring",
          ...this.featurePosition(14, 4),
          r: 3,
          charge: 60,
          max: 60,
        });
      // 減速或滑行的特殊區域。
      for (let i = 0; i < (big ? 20 : 6); i++) {
        const r = 4.5 + R() * 3;
        this.zones.push({
          type: "slow",
          ...this.featurePosition(12, r + 2),
          r,
        });
      }
      // 加速板。
      for (let i = 0; i < (big ? 40 : 16); i++)
        this.pads.push({
          ...this.featurePosition(8, 3),
          angle: R() * TAU,
          cooldown: 0,
        });
      // Portals matter more on a big map: they are the fast lanes between distant regions.
      // 成對的傳送門，兩端要離得夠遠。
      for (let k = 0; k < (big ? 5 : 2); k++) {
        let a,
          c,
          tries = 0;
        do {
          a = this.featurePosition(10, 3);
          c = this.featurePosition(10, 3);
        } while (distance(a, c) < b * 0.9 && ++tries < 40);
        const i = this.portals.length;
        this.portals.push(
          { ...a, link: i + 1, pair: k },
          { ...c, link: i, pair: k },
        );
      }
      // 地面花紋。
      for (let i = 0; i < (big ? 100 : 44); i++)
        this.patches.push({
          ...this.randomPosition(),
          r: 4 + R() * 7,
          tint: i % 3,
          rotation: R() * TAU,
        });
      // 不影響規則的小裝飾。
      for (let i = 0; i < (big ? 900 : 420); i++) {
        const p = this.randomPosition();
        if (this.zones.some((z) => distance(z, p) < z.r)) continue;
        this.decorations.push({
          ...p,
          size: 0.3 + R() * 0.8,
          type: i % 5,
          phase: R() * TAU,
        });
      }
    }
    // 隨機找一個不撞到障礙的位置。
    randomPosition(minCenter = 0) {
      let p;
      for (let n = 0; n < 60; n++) {
        p = {
          x: (this.random() * 2 - 1) * (this.bound - 3),
          z: (this.random() * 2 - 1) * (this.bound - 3),
        };
        if (
          Math.hypot(p.x, p.z) >= minCenter &&
          !this.obstacles.some((o) => distance(o, p) < o.r + 1.5)
        )
          break;
      }
      return p;
    }
    // 決定一般食物的種類；血少時比較容易出現治療。
    basicFoodType() {
      const r = this.random(),
        heal = this.health < this.maxHealth * 0.5 ? 0.07 : 0.035;
      return r < 0.06
        ? "crystal"
        : r < 0.18
          ? "fruit"
          : r < 0.18 + heal
            ? "heal"
            : "energy";
    }
    // 放一份食物，數量有上限。
    spawnFood(position, type) {
      if (this.food.length >= this.foodLimit) return null;
      const pos = position
        ? {
            x: clamp(position.x, -this.bound + 1, this.bound - 1),
            z: clamp(position.z, -this.bound + 1, this.bound - 1),
          }
        : this.randomPosition();
      const f = {
        ...pos,
        type: type || this.basicFoodType(),
        phase: this.random() * TAU,
      };
      if (FOODS[f.type].power) f.life = 45;
      this.food.push(f);
      return f;
    }
    // 地圖上自然出現的食物，有時一次一小群。
    spawnAmbientFood() {
      if (this.random() < 0.45) {
        // 一小群食物比平均散布更有掃過去的快感。
        const c = this.randomPosition(),
          n = 4 + Math.floor(this.random() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.random(),
            r = i ? 0.9 + this.random() * 0.8 : 0,
            p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
          if (!this.obstacles.some((o) => distance(o, p) < o.r + 0.6))
            this.spawnFood(
              p,
              i === 0 && this.random() < 0.35 ? "fruit" : "energy",
            );
        }
      } else this.spawnFood();
    }
    powerCount() {
      return this.food.reduce((n, f) => n + (FOODS[f.type].power ? 1 : 0), 0);
    }
    // 放一個道具，沒指定就依權重抽。
    spawnPower(position, id) {
      if (!id) {
        let r = this.random() * POWER_WEIGHTS.reduce((a, b) => a + b, 0);
        id = POWER_IDS.find((_, i) => (r -= POWER_WEIGHTS[i]) < 0) || "speed";
      }
      let pos = position;
      if (!pos) {
        const h = this.snake[0];
        for (let n = 0; n < 30; n++) {
          const a = this.random() * TAU,
            d = 12 + this.random() * 22;
          pos = {
            x: clamp(h.x + Math.cos(a) * d, -this.bound + 4, this.bound - 4),
            z: clamp(h.z + Math.sin(a) * d, -this.bound + 4, this.bound - 4),
          };
          if (!this.obstacles.some((o) => distance(o, pos) < o.r + 1.5)) break;
        }
      }
      const f = this.spawnFood(pos, id);
      if (f) f.life = 45;
      return f;
    }
    // 放一個寶箱。
    spawnCache() {
      const p = this.featurePosition(10, 2, 5);
      const c = {
        ...p,
        r: 1,
        hp: 60,
        maxHp: 60,
        flash: 0,
        ramAt: -9,
        phase: this.random() * TAU,
      };
      this.caches.push(c);
      return c;
    }
    emit(type, data = {}) {
      this.events.push({ type, ...data });
    }
    // 同一種提示在 gap 秒內只送一次。
    notice(type, data, gap = 0.5) {
      if (this.time - (this.lastNotice[type] ?? -9) < gap) return;
      this.lastNotice[type] = this.time;
      this.emit(type, data);
    }
    // 噴出一團粒子。
    burst(x, z, color, count = 10, power = 5) {
      for (let i = 0; i < count; i++) {
        const a = this.random() * TAU,
          speed = 1 + this.random() * power;
        this.particles.push({
          x,
          z,
          y: 0.5,
          vx: Math.cos(a) * speed,
          vz: Math.sin(a) * speed,
          vy: 2 + this.random() * 4,
          life: 0.6 + this.random() * 0.5,
          maxLife: 1.1,
          color,
          size: 0.04 + this.random() * 0.1,
        });
      }
      if (this.particles.length > 380)
        this.particles.splice(0, this.particles.length - 380);
    }
    ring(x, z, radius, color, life = 0.65) {
      this.rings.push({ x, z, radius, age: 0, life, color });
    }
    power() {
      return this.damage * (this.powers.fury > 0 ? 1.8 : 1);
    }
    // 使用角色技能。
    useSkill() {
      if (this.over || this.paused || this.needsUpgrade || this.cooldown > 0)
        return false;
      this.cooldown = this.cooldownMax;
      this.activeSkill = 6;
      const h = this.snake[0];
      this.ring(
        h.x,
        h.z,
        this.characterIndex === 1 ? 12 : 9,
        this.character.color,
      );
      this.burst(h.x, h.z, this.character.color, 28);
      if (this.characterIndex === 0)
        this.health = Math.min(this.maxHealth, this.health + 12);
      if (this.characterIndex === 1)
        this.areaDamage(h, 12, 65 * this.power(), "skill");
      if (this.characterIndex === 2) {
        this.frozen = 5;
        this.areaDamage(h, 9, 25 * this.power(), "skill");
      }
      this.emit("skill", { name: this.character.skill, id: this.character.id });
      return true;
    }
    // 對敵人造成傷害，處理護盾、無敵與來源限制。
    damageEnemy(e, amount, source = "passive") {
      if (e.dead || (e.requiredAttack && e.requiredAttack !== source))
        return false;
      // 首領換階段時會吼叫，吼叫期間不會受傷。
      if (e.boss && e.roar > 0) {
        if (source !== "passive") this.notice("immune", { x: e.x, z: e.z });
        return false;
      }
      let blocked = false;
      if (
        e.kind === "shield" &&
        !(e.shieldBreak > 0) &&
        (source === "bite" || source === "counter" || source === "passive")
      ) {
        amount *= 0.25;
        blocked = true;
      }
      if (
        e.boss &&
        e.guard > 0 &&
        this.enemies.some((o) => o.minion && !o.dead)
      ) {
        amount *= 0.35;
        blocked = true;
      }
      if (e.stunned > 0) amount *= 1.5;
      const dealt = Math.min(e.hp, amount);
      e.hp -= amount;
      e.flash = 0.14;
      if (source !== "passive" && !e.dummy) this.addCombo();
      if (source !== "passive")
        this.emit("hit", {
          x: e.x,
          z: e.z,
          amount: Math.ceil(dealt),
          source,
          boss: e.boss,
          blocked,
        });
      else if (blocked && e.kind === "shield")
        this.notice("block", { x: e.x, z: e.z }, 1.2);
      if (e.hp <= 0) this.kill(e, source);
      return true;
    }
    // 對寶箱造成傷害。
    damageCache(c, amount, source = "passive") {
      if (c.dead) return false;
      c.hp -= amount;
      c.flash = 0.12;
      if (source !== "passive")
        this.emit("hit", {
          x: c.x,
          z: c.z,
          amount: Math.ceil(Math.min(amount, c.hp + amount)),
          source,
          cache: true,
        });
      if (c.hp <= 0) this.breakCache(c);
      return true;
    }
    // 寶箱破裂，掉出食物與道具。
    breakCache(c) {
      if (c.dead) return;
      c.dead = true;
      this.score += Math.round(40 * this.bonus * this.diff.score);
      this.xp += 6 * this.bonus;
      this.burst(c.x, c.z, "#ffd27a", 24, 7);
      this.ring(c.x, c.z, 3, "#ffd27a");
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        this.spawnFood(
          { x: c.x + Math.cos(a) * 1.6, z: c.z + Math.sin(a) * 1.6 },
          i === 0 ? "fruit" : "energy",
        );
      }
      const roll = this.random();
      if (roll < 0.4) this.spawnPower({ x: c.x, z: c.z });
      else if (roll < 0.75) this.spawnFood({ x: c.x, z: c.z }, "crystal");
      this.emit("cache", { x: c.x, z: c.z });
    }
    // 目標是否在咬擊的距離與角度內。
    biteHits(p, r) {
      const h = this.snake[0],
        d = distance(h, p);
      if (d > this.biteRange + r) return false;
      if (d < r + 0.7) return true;
      return Math.cos(Math.atan2(p.z - h.z, p.x - h.x) - this.angle) >= 0.5;
    }
    // 目前咬得到的敵人與寶箱。
    biteTargets() {
      const enemies = this.enemies.filter(
        (e) =>
          !e.dead &&
          (e.serpent ? [e, ...e.body] : [e]).some((p) => this.biteHits(p, e.r)),
      );
      const caches = this.caches.filter(
        (c) => !c.dead && this.biteHits(c, c.r),
      );
      return { enemies, caches };
    }
    // 咬擊自動進行：前方扇形內有目標、而且冷卻好了就咬。
    autoBite() {
      if (this.biteCooldown > 0) return false;
      const t = this.biteTargets();
      return t.enemies.length || t.caches.length ? this.bite(t) : false;
    }
    // 咬一口，對所有目標造成傷害。
    bite(targets = this.biteTargets()) {
      if (
        this.over ||
        this.paused ||
        this.needsUpgrade ||
        this.biteCooldown > 0
      )
        return false;
      this.biteCooldown = this.biteRate * (this.powers.fury > 0 ? 0.5 : 1);
      this.biteVisual = 0.2;
      this.emit("bite");
      for (const e of targets.enemies)
        this.damageEnemy(e, COMBAT.bite * this.power(), "bite");
      for (const c of targets.caches)
        this.damageCache(c, COMBAT.bite * this.power(), "bite");
      return true;
    }
    // 範圍傷害。
    areaDamage(pos, radius, damage, source = "passive") {
      for (const e of this.enemies)
        if (!e.dead && distance(e, pos) < radius + e.r)
          this.damageEnemy(e, damage, source);
      for (const c of this.caches)
        if (!c.dead && distance(c, pos) < radius + c.r)
          this.damageCache(c, damage, source);
    }
    // 偵測蛇頭是否碰到自己的身體，圍成一圈就觸發纏繞。
    detectCoil() {
      if (this.coilCooldown > 0 || this.snake.length < COMBAT.coilMinLength)
        return false;
      const h = this.snake[0];
      for (let i = 10; i < this.snake.length; i++) {
        if (distance(h, this.snake[i]) > 0.9) continue;
        const poly = this.snake.slice(0, i + 1);
        if (polygonArea(poly) < 2.5) continue;
        return this.triggerCoil(poly);
      }
      return false;
    }
    // 纏繞成功：圈內的敵人、寶箱受傷，食物直接吃掉。
    triggerCoil(poly) {
      const enemies = this.enemies.filter(
          (e) => !e.dead && insidePolygon(e, poly),
        ),
        caches = this.caches.filter((c) => !c.dead && insidePolygon(c, poly)),
        food = this.food.filter((f) => insidePolygon(f, poly));
      if (!enemies.length && !caches.length && !food.length) {
        this.coilCooldown = 0.25;
        return false;
      }
      this.coilCooldown = COMBAT.coilCooldown;
      this.coils++;
      const damage =
        (COMBAT.coil + poly.length * COMBAT.coilPerSegment) *
        this.power() *
        this.coilPower;
      for (const e of enemies) this.damageEnemy(e, damage, "coil");
      for (const c of caches) this.damageCache(c, 999, "coil");
      const eaten = new Set(food);
      for (const f of food) this.collect(f);
      this.food = this.food.filter((f) => !eaten.has(f));
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length,
        cz = poly.reduce((s, p) => s + p.z, 0) / poly.length,
        radius = Math.max(...poly.map((p) => distance(p, { x: cx, z: cz })));
      if (enemies.length >= 2)
        this.score += Math.round(
          enemies.length * 60 * this.bonus * this.diff.score,
        );
      this.ring(cx, cz, radius + 1, "#fff3a8", 0.8);
      this.burst(cx, cz, "#fff3a8", 18 + enemies.length * 6, 6);
      this.emit("coil", {
        points: poly.map((p) => ({ x: p.x, z: p.z })),
        count: enemies.length,
        food: food.length,
        caches: caches.length,
        x: cx,
        z: cz,
        damage: Math.round(damage),
      });
      return true;
    }
    // 連擊：3 秒內再次打中敵人就累積；吃食物不算。
    comboMultiplier() {
      return 1 + Math.min(1, Math.floor(this.combo / 10) * 0.1);
    }
    // 累積連擊。
    addCombo() {
      this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
      this.comboTimer = 3;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.combo >= 10 && this.combo % 10 === 0)
        this.emit("combo", { combo: this.combo });
    }
    // 擊敗敵人：計分、經驗、掉落物與首領獎勵。
    kill(e, source = "passive") {
      // 已經被打倒的不再處理；計入擊退數（用身體纏繞打倒的另外計算）。
      if (e.dead) return;
      e.dead = true;
      this.kills++;
      if (source === "coil") this.coilKills++;
      // 加分：首領 1500、菁英 200、一般 80，再乘上獎勵、難度與連擊倍率。
      this.score += Math.round(
        (e.boss ? 1500 : e.elite ? 200 : 80) *
          this.bonus *
          this.diff.score *
          this.comboMultiplier(),
      );
      // 加經驗，並在敵人位置放出碎片與光圈。
      this.xp += (e.boss ? 30 : e.elite ? 10 : 4) * this.bonus;
      this.burst(
        e.x,
        e.z,
        e.boss ? "#f6d981" : e.color || "#ff8c91",
        e.boss ? 60 : 16,
        e.boss ? 9 : 6,
      );
      this.ring(e.x, e.z, e.boss ? 8 : 2.6, "#f6cf85");
      // 練習用的假人只發出「擊退」事件，不掉東西。
      if (e.dummy) {
        this.emit("kill", {
          x: e.x,
          z: e.z,
          boss: false,
          color: e.color,
          source,
        });
        return;
      }
      // 首領：掉一圈食物，清掉它留下的攻擊。
      if (e.boss) {
        // 首領：掉一圈 16 份食物與晶體。
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          this.spawnFood(
            {
              x: e.x + Math.cos(a) * (2 + (i % 3)),
              z: e.z + Math.sin(a) * (2 + (i % 3)),
            },
            i % 4 === 0 ? "crystal" : i % 4 === 1 ? "fruit" : "energy",
          );
        }
        this.spawnPower({ x: e.x + 1.5, z: e.z });
        this.spawnFood({ x: e.x - 1.5, z: e.z }, "heal");
        this.hazards = this.hazards.filter((hz) => hz.owner !== e);
        for (const m of this.enemies) if (m.minion && !m.dead) m.minion = false;
        this.bossKilled = true;
        this.bossesDefeated++;
        this.crystals += 20;
        this.emit("boss-killed", { name: e.name });
      } else {
        // 分裂蟲死後變成幾隻小蟲。
        if (e.kind === "splitter") {
          const n = this.diff.tier >= 3 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + e.angle;
            const m = this.spawnEnemy(false, 0, "mini", {
              x: e.x + Math.cos(a) * 1.1,
              z: e.z + Math.sin(a) * 1.1,
            });
            if (m) {
              m.age = 0.5;
              m.minion = e.minion;
            }
          }
          this.emit("split", { x: e.x, z: e.z, count: n });
        }
        // 一般敵人掉 1～2 份食物；菁英一定掉晶體或能量；有小機率掉能力道具。
        for (
          let i = 0;
          i < (e.kind === "swarm" || e.kind === "mini" ? 1 : 2);
          i++
        )
          this.spawnFood(
            {
              x: e.x + (this.random() - 0.5) * 2.4,
              z: e.z + (this.random() - 0.5) * 2.4,
            },
            "energy",
          );
        if (this.random() < (e.elite ? 1 : 0.3))
          this.spawnFood(
            { x: e.x, z: e.z },
            this.random() < 0.3 ? "crystal" : "fruit",
          );
        if (
          this.random() < (e.elite ? 0.45 : 0.07) &&
          this.powerCount() < this.powerCap + 1
        )
          this.spawnPower({ x: e.x, z: e.z });
      }
      // 發出「擊退」事件，畫面那邊會播放音效與特效。
      this.emit("kill", {
        x: e.x,
        z: e.z,
        boss: e.boss,
        elite: e.elite,
        color: e.color,
        source,
        kind: e.kind,
      });
    }
    // 玩家受傷：先看無敵、技能與護盾，再扣血。
    hurt(amount, cause = "enemy") {
      if (
        this.mode === "zen" ||
        this.invulnerable > 0 ||
        (this.characterIndex === 3 && this.activeSkill > 0) ||
        this.over
      )
        return false;
      if (this.powers.shield > 0) {
        this.powers.shield = 0;
        this.invulnerable = 0.8;
        const h = this.snake[0];
        this.ring(h.x, h.z, 3, "#8fd3ff");
        this.burst(h.x, h.z, "#8fd3ff", 18);
        this.emit("shield-break", { cause });
        return false;
      }
      amount = Math.max(1, Math.round(amount * this.diff.damage));
      const before = this.health,
        lengthBefore = this.targetLength;
      this.health = Math.max(0, this.health - amount);
      this.invulnerable = 1.25;
      this.combo = 0;
      this.targetLength = Math.max(8, this.targetLength - 3);
      this.lastDamage = {
        cause,
        amount: before - this.health,
        lostSegments: lengthBefore - this.targetLength,
        time: this.time,
      };
      this.emit("hurt", this.lastDamage);
      this.burst(this.snake[0].x, this.snake[0].z, "#ff7a81", 15);
      if (this.health <= 0) this.end(false, "defeated");
      return true;
    }
    // 累積成長，每 3 點身體加長一節。
    addGrowth(n) {
      this.growth += n;
      while (this.growth >= 3) {
        this.growth -= 3;
        this.targetLength = Math.min(160, this.targetLength + 1);
      }
    }
    // 吃到一份食物或道具。
    collect(f) {
      const def = FOODS[f.type] || FOODS.energy;
      this.foodEaten++;
      this.score += Math.round(
        def.score *
          this.bonus *
          (this.mode === "blitz" ? 1.5 : 1) *
          this.diff.score,
      );
      this.xp += def.xp * this.bonus;
      this.addGrowth(def.growth || 1);
      if (def.crystal) this.crystals += def.crystal;
      if (def.heal)
        this.health = Math.min(this.maxHealth, this.health + def.heal);
      if (def.power) this.applyPower(f.type);
      this.burst(
        f.x,
        f.z,
        def.color || this.character.color,
        def.power ? 14 : 4,
      );
      this.emit("eat", {
        food: f.type,
        crystal: f.type === "crystal",
        x: f.x,
        z: f.z,
      });
    }
    // 套用道具效果。
    applyPower(id) {
      const def = FOODS[id],
        h = this.snake[0];
      if (id === "bomb") {
        this.ring(h.x, h.z, 7, def.color, 0.7);
        this.burst(h.x, h.z, def.color, 34, 9);
        this.areaDamage(h, 7, 90 * this.power(), "bomb");
        this.emit("bomb", { x: h.x, z: h.z, r: 7 });
      } else this.powers[id] = def.duration;
      if (id === "speed") {
        this.dash = 100;
        this.dashLocked = false;
      }
      this.ring(h.x, h.z, 2.5, def.color);
      this.emit("power", {
        id,
        name: def.name,
        desc: def.desc,
        color: def.color,
      });
    }
    // 經驗夠了就升級，抽出三個選項。
    checkLevel() {
      if (this.xp < this.nextXP || this.over || this.needsUpgrade) return;
      // 後面的等級需要明顯更多經驗，升級選單才不會一直跳出來。
      this.xp -= this.nextXP;
      this.level++;
      this.nextXP = Math.round(
        22 + this.level * 11 + this.level * this.level * 0.6,
      );
      this.needsUpgrade = true;
      const pool = UPGRADES.filter(
        (u) => (this.upgrades[u.id] || 0) < u.max && u.id !== "repair",
      );
      if (pool.length < 3) pool.push(UPGRADES.find((u) => u.id === "repair"));
      this.choices = [];
      while (this.choices.length < 3 && pool.length)
        this.choices.push(
          pool.splice(Math.floor(this.random() * pool.length), 1)[0].id,
        );
      this.emit("level");
    }
    // 套用選到的升級。
    chooseUpgrade(id) {
      if (!this.needsUpgrade || !this.choices.includes(id)) return false;
      const u = UPGRADES.find((u) => u.id === id);
      u.apply(this);
      this.upgrades[id] = (this.upgrades[id] || 0) + 1;
      this.needsUpgrade = false;
      this.choices = [];
      return true;
    }
    // ---------- 敵人 ----------
    enemyPool(wave = this.wave) {
      return Object.keys(ENEMIES).filter(
        (k) =>
          ENEMIES[k].weight &&
          ENEMIES[k].tier <= this.diff.tier &&
          ENEMIES[k].wave <= wave,
      );
    }
    // 依權重抽一種敵人。
    pickKind(pool = this.enemyPool()) {
      let r = this.random() * pool.reduce((s, k) => s + ENEMIES[k].weight, 0);
      return (
        pool.find((k) => (r -= ENEMIES[k].weight) < 0) || pool[0] || "chaser"
      );
    }
    // 生一群敵人（群聚型會一次多隻）。
    spawnPack(kind = this.pickKind(), at = null) {
      const t = ENEMIES[kind],
        first = this.spawnEnemy(false, 0, kind, at);
      if (!first) return [];
      const list = [first];
      if (t.pack) {
        const n =
          t.pack[0] +
          Math.floor(this.random() * (t.pack[1] - t.pack[0] + 1)) +
          (this.diff.tier >= 3 ? 1 : 0);
        for (let i = 1; i < n; i++) {
          const a = (i / n) * TAU;
          const m = this.spawnEnemy(false, 0, kind, {
            x: first.x + Math.cos(a) * 1.3,
            z: first.z + Math.sin(a) * 1.3,
          });
          if (m) list.push(m);
        }
      }
      return list;
    }
    // 生一隻敵人或首領，依難度與波數調整數值。
    spawnEnemy(boss = false, variant = 0, kind = null, at = null) {
      // 場上最多 45 隻敵人。
      if (this.enemies.filter((e) => !e.dead).length >= 45) return null;
      // h 是蛇頭；在地圖邊緣附近、離蛇頭夠遠的地方找出生位置。
      const h = this.snake[0],
        edge = this.bound - 3,
        D = this.diff;
      let x, z;
      // 位置：指定處，或離玩家一段距離的地方。
      if (at) {
        x = clamp(at.x, -edge, edge);
        z = clamp(at.z, -edge, edge);
      } else {
        const a = this.random() * TAU;
        x = clamp(h.x + Math.cos(a) * 18, -edge, edge);
        z = clamp(h.z + Math.sin(a) * 18, -edge, edge);
        if (Math.hypot(x - h.x, z - h.z) < 10) {
          const inward = Math.atan2(-h.z, -h.x);
          x = clamp(h.x + Math.cos(inward) * 18, -edge, edge);
          z = clamp(h.z + Math.sin(inward) * 18, -edge, edge);
        }
      }
      // 每隻敵人共用的基本資料：位置、方向、計時器，以及 9 節身體（蛇形敵人用）。
      const base = {
        x,
        z,
        angle: 0,
        age: 0,
        flash: 0,
        ramAt: -10,
        counterAt: -10,
        stunned: 0,
        windup: 0,
        charge: 0,
        body: Array.from({ length: 9 }, () => ({ x, z })),
      };
      let e;
      // 首領的數值。
      if (boss) {
        // 首領：依種類決定生命（無盡模式越後面越強）。
        const def = BOSSES[variant % 3],
          hp =
            def.hp *
            D.bossHp *
            (this.mode === "endless" ? 1 + this.wave * 0.06 : 1);
        // 年齡先設成負數，讓登場介紹播兩秒後首領才行動。
        e = {
          ...base,
          r: 2.4,
          hp,
          maxHp: hp,
          speed: 2 * D.speed,
          boss: true,
          kind: "boss",
          serpent: false,
          variant: variant % 3,
          name: def.name,
          title: def.title,
          color: def.color,
          age: -1.2,
          shot: 2.2,
          special: 3,
          phase: 1,
          roar: 0,
          cast: null,
          moveIndex: 0,
          spin: 0,
          guard: 0,
        };
      } else {
        kind = kind || this.pickKind();
        // 一般敵人：依種類決定能力；第 2 波以後有機會變成菁英（比較大、比較強）。
        const t = ENEMIES[kind] || ENEMIES.chaser,
          elite =
            !at && kind !== "mini" && this.wave >= 2 && this.random() < D.elite,
          waveScale = 1 + (this.wave - 1) * 0.12;
        const hp = t.hp * waveScale * D.hp * (elite ? 2.2 : 1);
        // 一般敵人的完整資料：種類、是否菁英、大小、生命、速度、攻擊等。
        e = {
          ...base,
          kind,
          serpent: kind === "serpent",
          boss: false,
          elite,
          r: t.r * (elite ? 1.25 : 1),
          hp,
          maxHp: hp,
          speed:
            (t.speed +
              Math.min(2, this.wave * 0.18) * (kind === "swarm" ? 0.5 : 1)) *
            D.speed *
            (elite ? 1.1 : 1),
          name: (elite ? "精英" : "") + t.name,
          color: t.color,
          shot: 1.5 + this.random() * 1.5,
          special: 2 + this.random() * 2,
          cooldown: 1 + this.random() * 2,
          seed: this.random() * TAU,
          strafe: this.random() < 0.5 ? -1 : 1,
          fuse: 0,
          aim: 0,
          shieldBreak: 0,
          state: "",
        };
      }
      // 放進場上的敵人清單。
      this.enemies.push(e);
      return e;
    }
    // 通知畫面首領登場。
    emitBoss(e) {
      const def = BOSSES[e.variant];
      this.emit("boss", {
        name: e.name,
        title: def.title,
        tip: def.tip,
        color: def.color,
      });
    }
    // 發射子彈：扇形，或 radial 時往四周一圈。
    shoot(e, count, spread, radial = false, opts = {}) {
      const speed = (opts.speed || 8) * this.diff.bullet;
      for (let i = 0; i < count && this.projectiles.length < 160; i++) {
        const a = radial
          ? (i / count) * TAU + (opts.offset ?? e.angle)
          : (opts.angle ?? e.angle) + (i - (count - 1) / 2) * spread;
        this.projectiles.push({
          x: e.x,
          z: e.z,
          vx: Math.cos(a) * speed,
          vz: Math.sin(a) * speed,
          life: opts.life || 7,
          r: opts.r || 0.25,
          damage: opts.damage,
          kind: opts.kind || "bullet",
          color: opts.color || "#ffad85",
          homing: opts.homing || 0,
        });
      }
    }
    // 過關獎勵：補血、清掉子彈並給經驗。
    stageReward(heal) {
      this.health = Math.min(this.maxHealth, this.health + heal);
      this.projectiles = [];
      this.hazards = [];
      this.stageGap = 3;
      this.xp = Math.max(this.xp, this.nextXP);
      this.checkLevel();
      this.emit("intermission", { heal });
    }
    // 各模式的進度：生怪、換波與勝利條件。
    updateMode(dt) {
      // 禪模式沒有敵人；整備時間中也不生敵人。
      if (this.mode === "zen") return;
      const living = this.enemies.filter((e) => !e.dead);
      if (this.stageGap > 0) {
        this.stageGap = Math.max(0, this.stageGap - dt);
        return;
      }
      // 競技場模式：一波打完才出下一波，打完第 4 波就勝利。
      this.spawnTimer -= dt;
      // 蟲群對戰：四波全部清完才獲勝。
      if (this.mode === "arena") {
        if (!this.waveRemaining && !living.length) {
          if (this.wave === 4) {
            this.end(true, "arena-cleared");
            return;
          }
          this.wave++;
          this.waveRemaining = this.diff.waves[this.wave - 1];
          this.stageReward(20);
          this.emit("wave", {
            wave: this.wave,
            kinds: this.newKinds(this.wave),
          });
          return;
        }
        if (this.waveRemaining > 0 && this.spawnTimer <= 0) {
          this.spawnPack();
          this.waveRemaining--;
          this.spawnTimer = 1.1 * this.diff.spawn;
        }
      } else if (this.mode === "boss") {
        // 首領模式：打倒一隻後出下一隻，三隻都打倒就勝利。
        if (!living.some((e) => e.boss)) {
          if (this.bossesDefeated === 3) {
            this.end(true, "boss-cleared");
            return;
          }
          if (this.bossesDefeated > this.bossStageRewarded) {
            this.bossStageRewarded = this.bossesDefeated;
            this.enemies = [];
            this.stageReward(35);
            return;
          }
          const e = this.spawnEnemy(true, this.bossesDefeated);
          this.emitBoss(e);
        }
      } else {
        const wave = Math.floor(this.time / 30) + 1;
        // 生存與無盡模式：依時間增加波數，生怪速度越來越快。
        if (wave > this.wave) {
          this.wave = wave;
          this.emit("wave", { wave, kinds: this.newKinds(wave) });
          this.spawnTimer = 0;
        }
        if (this.spawnTimer <= 0 && living.length < 44) {
          this.spawnTimer =
            Math.max(0.85, 4.5 - this.wave * 0.45) *
            this.diff.spawn *
            (this.mode === "blitz" ? 1.6 : 1);
          this.spawnPack();
          if (this.wave >= (this.diff.tier >= 3 ? 2 : 3)) this.spawnPack();
        }
        // 生存模式 120 秒時出現首領；無盡模式每隔一段時間出現首領。
        if (this.mode === "survival" && this.time >= 120 && !this.bossSpawned) {
          this.bossSpawned = true;
          const e = this.spawnEnemy(true);
          if (e) this.emitBoss(e);
        }
        if (
          this.mode === "endless" &&
          this.time >= this.nextBossAt &&
          !living.some((e) => e.boss)
        ) {
          const e = this.spawnEnemy(true, Math.floor(this.nextBossAt / 60 - 1));
          if (e) {
            this.nextBossAt += 60;
            this.emitBoss(e);
          }
        }
      }
    }
    // 這一波新出現的敵人種類。
    newKinds(wave) {
      const before = new Set(this.enemyPool(wave - 1));
      return this.enemyPool(wave)
        .filter((k) => !before.has(k))
        .map((k) => ENEMIES[k].name);
    }
    // 蟲子之間會輕輕推開，一大群看起來仍是一隻一隻。
    separateEnemies() {
      const list = this.enemies;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead || a.dummy) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b.dead || b.dummy) continue;
          const dx = b.x - a.x,
            dz = b.z - a.z,
            min = (a.r + b.r) * 1.05,
            d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-8) continue;
          const d = Math.sqrt(d2),
            overlap = (min - d) * 0.35,
            nx = dx / d,
            nz = dz / d,
            wa = a.boss ? 0 : b.boss ? 1 : 0.5,
            wb = 1 - wa;
          a.x -= nx * overlap * wa * 2;
          a.z -= nz * overlap * wa * 2;
          b.x += nx * overlap * wb * 2;
          b.z += nz * overlap * wb * 2;
        }
      }
    }
    // 目前位置所在的減速區。
    slowZoneAt(p) {
      return (
        this.zones.find((z) => z.type === "slow" && distance(z, p) < z.r) ||
        null
      );
    }
    // 一隻普通敵人的行動。
    updateEnemy(e, dt) {
      // h 是蛇頭、d 是敵人與蛇頭的距離；敵人一律面向蛇頭。
      const h = this.snake[0],
        d = distance(h, e);
      e.angle = Math.atan2(h.z - e.z, h.x - e.x);
      // 假人、被凍結、剛出生 0.8 秒內的敵人不行動；首領另外處理。
      if (e.dummy || this.frozen > 0 || e.age <= 0.8) return;
      if (e.boss) {
        this.updateBoss(e, dt, h, d);
        return;
      }
      // 破盾計時與暈眩：暈眩中不行動。
      e.shieldBreak = Math.max(0, e.shieldBreak - dt);
      if (e.stunned > 0) {
        e.stunned -= dt;
        return;
      }
      // 這一步要走多遠（踩在減速區裡會變慢）。
      const D = this.diff,
        step =
          e.speed * dt * (this.world !== 1 && this.slowZoneAt(e) ? 0.55 : 1);
      // 往指定方向移動。
      const move = (a, k = 1) => {
        e.x += Math.cos(a) * step * k;
        e.z += Math.sin(a) * step * k;
      };
      // 遠程敵人保持一段距離，並繞著玩家走。
      const keep = (near, far) => {
        if (d > far) move(e.angle);
        else if (d < near) move(e.angle, -1);
        else move(e.angle + (Math.PI / 2) * e.strafe, 0.6);
      };
      // 各種敵人不同的行動方式。
      switch (e.kind) {
        case "ranged":
          keep(6, 10);
          e.shot -= dt * D.rate;
          // 射手：每 2.8 秒射一次（高難度一次三發）。
          if (e.shot <= 0) {
            e.shot = 2.8;
            this.shoot(e, D.tier >= 3 ? 3 : 1, 0.22, false, {
              speed: 8,
              color: "#e6a6ff",
            });
          }
          break;
        case "swarm":
          move(e.angle + Math.sin(this.time * 7 + e.seed) * 0.7);
          break;
        case "charger":
          this.updateCharger(e, dt, d, move);
          break;
        case "bomber":
          // 自爆蟲：靠近蛇頭後開始倒數，時間到就爆炸。
          if (e.fuse > 0) {
            e.fuse -= dt;
            if (e.fuse <= 0) this.explodeBomber(e);
          } else {
            move(e.angle);
            if (d < 2.4) {
              e.fuse = e.fuseMax = 1 * D.warn;
              this.emit("fuse", { x: e.x, z: e.z });
            }
          }
          break;
        case "healer":
          keep(9, 13);
          e.special -= dt * D.rate;
          // 治療者：每 3.2 秒替附近的同伴回血。
          if (e.special <= 0) {
            e.special = 3.2;
            this.healAllies(e);
          }
          break;
        case "sniper":
          // 狙擊手：先瞄準（地上出現瞄準線），快發射前鎖定方向，時間到就射出高
          // 速子彈。
          if (e.aim > 0) {
            e.aim -= dt;
            if (e.aim > 0.3 * D.warn) e.aimAngle = e.angle;
            if (e.aim <= 0) {
              this.shoot(e, 1, 0, false, {
                angle: e.aimAngle,
                speed: 22,
                damage: 22,
                kind: "snipe",
                r: 0.3,
                color: "#ff6fd8",
                life: 3,
              });
              e.cooldown = 3.8;
              this.emit("snipe", { x: e.x, z: e.z });
            }
          } else {
            keep(12, 16);
            e.cooldown -= dt * D.rate;
            if (e.cooldown <= 0 && d < 24) {
              e.aim = e.aimMax = 1.2 * D.warn;
              e.aimAngle = e.angle;
            }
          }
          break;
        default:
          move(e.angle);
      }
      // 敵人不能走出地圖邊界。
      e.x = clamp(e.x, -this.bound + 2, this.bound - 2);
      e.z = clamp(e.z, -this.bound + 2, this.bound - 2);
    }
    // 衝撞型：蓄力 → 衝刺 → 休息。
    updateCharger(e, dt, d, move) {
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          e.charge = 0.55;
          e.state = "charge";
        }
        return;
      }
      if (e.charge > 0) {
        e.charge -= dt;
        const v = 15 * this.diff.speed * dt;
        e.x += Math.cos(e.chargeAngle) * v;
        e.z += Math.sin(e.chargeAngle) * v;
        if (e.charge <= 0) {
          e.state = "";
          e.stunned = 1.1;
          e.cooldown = 2.4;
          this.emit("stun", { x: e.x, z: e.z });
        }
        return;
      }
      e.cooldown -= dt;
      move(e.angle);
      if (d < 10 && e.cooldown <= 0) {
        e.windup = e.windupMax = 0.9 * this.diff.warn;
        e.chargeAngle = e.angle;
        e.chargeLen = 15 * this.diff.speed * 0.55;
        e.state = "windup";
      }
    }
    // 自爆型爆炸。
    explodeBomber(e) {
      const h = this.snake[0],
        r = 3;
      e.dead = true;
      this.ring(e.x, e.z, r, "#ff5d5d", 0.6);
      this.burst(e.x, e.z, "#ff8a5a", 30, 8);
      this.emit("explode", { x: e.x, z: e.z, r });
      if (distance(h, e) < r + 0.4)
        this.hurt(DAMAGE.explosion.amount, "explosion");
      for (const o of this.enemies)
        if (o !== e && !o.dead && distance(o, e) < r + o.r)
          this.damageEnemy(o, 60, "blast");
    }
    // 治療型幫附近同伴補血。
    healAllies(e) {
      let n = 0;
      for (const o of this.enemies)
        if (!o.dead && !o.boss && distance(o, e) < 6 && o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
          n++;
        }
      this.ring(e.x, e.z, 6, "#b8ffcf", 0.7);
      if (n) this.emit("heal", { x: e.x, z: e.z, count: n });
    }
    // ---------- 首領：三個階段，各有四個招牌招式 ----------
    updateBoss(e, dt, h, d) {
      const def = BOSSES[e.variant];
      const want = e.hp <= e.maxHp * 0.33 ? 3 : e.hp <= e.maxHp * 0.66 ? 2 : 1;
      if (want > e.phase) {
        e.phase = want;
        e.roar = 1.3;
        e.cast = null;
        e.windup = 0;
        e.charge = 0;
        e.stunned = 0;
        this.ring(e.x, e.z, 7, e.color, 0.9);
        this.burst(e.x, e.z, e.color, 40, 9);
        this.hazards.push({
          type: "ring",
          owner: e,
          x: e.x,
          z: e.z,
          radius: e.r,
          speed: 12,
          maxR: 15,
          width: 0.8,
          damage: 14,
          cause: "ring",
          color: e.color,
        });
        this.emit("phase", {
          name: e.name,
          phase: want,
          label: def.phases[want - 1],
          color: e.color,
        });
      }
      if (e.roar > 0) {
        e.roar -= dt;
        return;
      }
      if (e.stunned > 0) {
        e.stunned -= dt;
        return;
      }
      e.guard = Math.max(0, e.guard - dt);
      const rate = this.diff.rate * (1 + (e.phase - 1) * 0.22);
      if (e.cast) this.continueCast(e, dt, rate);
      else {
        this.moveBoss(e, dt, d);
        e.special -= dt * rate;
        if (e.special <= 0) this.startCast(e, h);
      }
      // 一般射擊加快得比招式慢，子彈不會變成一面牆。
      if (!e.cast || !e.cast.still) {
        e.shot -=
          dt * (1 + (this.diff.rate - 1) * 0.5) * (1 + (e.phase - 1) * 0.12);
        if (e.shot <= 0) this.bossShot(e);
      }
      e.x = clamp(e.x, -this.bound + 3, this.bound - 3);
      e.z = clamp(e.z, -this.bound + 3, this.bound - 3);
    }
    // 首領的移動方式。
    moveBoss(e, dt, d) {
      const step = e.speed * dt,
        // 往指定方向移動。
        move = (a, k = 1) => {
          e.x += Math.cos(a) * step * k;
          e.z += Math.sin(a) * step * k;
        };
      if (e.variant === 1) {
        if (d > 11) move(e.angle);
        else if (d < 7) move(e.angle, -1);
        else move(e.angle + Math.PI / 2, 0.9);
      } else if (d > (e.variant === 0 ? 7 : 6))
        move(e.angle, e.variant === 2 ? 1.15 : 1);
    }
    // 首領的一般射擊，依階段變強。
    bossShot(e) {
      const p = e.phase,
        x = this.diff.extra;
      // 扇形彈幕一定留有可以側身閃過的空隙。
      if (e.variant === 0) {
        e.shot = [2.4, 2.0, 1.7][p - 1];
        this.shoot(e, Math.max(3, [5, 5, 7][p - 1] + x), 0.3, false, {
          speed: 8,
          color: "#ffb36b",
        });
      } else if (e.variant === 1) {
        e.shot = [2.6, 2.2, 1.9][p - 1];
        e.spin += 0.2;
        this.shoot(e, Math.max(8, [10, 12, 14][p - 1] + x * 2), 0, true, {
          speed: 7,
          offset: e.spin,
          color: "#e6a6ff",
        });
      } else {
        e.shot = [2.0, 1.7, 1.4][p - 1];
        this.shoot(e, 3, 0.18, false, { speed: 11, color: "#9be8ff" });
        if (p >= 3 || (p >= 2 && x > 0))
          this.shoot(e, 2, 1.2, false, {
            speed: 4.5,
            homing: 1.6,
            life: 6,
            r: 0.45,
            damage: 20,
            kind: "orb",
            color: "#c9f6ff",
          });
      }
    }
    // 目前階段可以用的招式。
    bossMoves(e) {
      const def = BOSSES[e.variant];
      return def.moves.filter(
        (m) => BOSS_MOVES[m].phase <= e.phase + (this.diff.extra > 0 ? 1 : 0),
      );
    }
    // 首領開始一個招式；warn 是預警時間的倍率。
    startCast(e, h, forced) {
      // 這隻首領能用的招式清單；forced 是指定要出的招式（沒有就輪流出，避免連續
      // 兩次同一招）。
      const list = this.bossMoves(e);
      let move = forced;
      if (!move) {
        move = list[e.moveIndex % list.length];
        e.moveIndex++;
        if (move === e.lastMove && list.length > 1) {
          move = list[e.moveIndex % list.length];
          e.moveIndex++;
        }
      }
      e.lastMove = move;
      // 下一次出招的間隔：階段越後面越短。
      e.special = [4.2, 3.4, 2.7][e.phase - 1];
      // p 是首領目前階段，warn 是預警時間倍率，n([…]) 依階段與難度決定次數，
      // at() 把位置限制在地圖裡。
      const p = e.phase,
        D = this.diff,
        warn = D.warn,
        n = (a) => Math.max(1, a[p - 1] + D.extra),
        R = this.random,
        lim = this.bound - 2;
      const at = (x, z) => ({ x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) });
      // 通知畫面顯示招式名稱。
      this.emit("boss-cast", {
        name: BOSS_MOVES[move].name,
        move,
        x: e.x,
        z: e.z,
        color: e.color,
      });
      // 依招式種類放出攻擊：地震（一圈一圈的圓形範圍）、熔岩環、衝撞、彈幕、雷
      // 射等。
      switch (move) {
        // 震波：在玩家前方連續落下。
        case "quake": {
          const k = n([1, 3, 5]);
          for (let i = 0; i < k; i++) {
            const lead = i * 2.6,
              t = (1.1 + i * 0.18) * warn;
            this.hazards.push({
              type: "circle",
              owner: e,
              ...at(
                h.x + Math.cos(this.angle) * lead,
                h.z + Math.sin(this.angle) * lead,
              ),
              r: p >= 3 ? 2.8 : 3.3,
              timer: t,
              duration: t,
              damage: 26,
              cause: "shockwave",
              color: "#ff5263",
            });
          }
          break;
        }
        // 裂地：直線裂縫，第三階段往四周。
        case "fissure": {
          const k = n([3, 5, 8]),
            radial = p >= 3;
          for (let i = 0; i < k; i++) {
            const a = radial
              ? e.angle + (i / k) * TAU
              : e.angle + (i - (k - 1) / 2) * 0.32;
            this.hazards.push({
              type: "line",
              owner: e,
              x: e.x + Math.cos(a) * e.r,
              z: e.z + Math.sin(a) * e.r,
              angle: a,
              length: 17,
              width: 1.3,
              timer: 1 * warn,
              duration: 1 * warn,
              damage: 24,
              cause: "fissure",
              color: "#ff8a3d",
            });
          }
          break;
        }
        // 落石。
        case "rockfall": {
          const k = n([4, 6, 10]);
          for (let i = 0; i < k; i++) {
            const a = R() * TAU,
              off = i ? 2 + R() * 5 : 0,
              t = (0.8 + i * 0.09) * warn;
            this.hazards.push({
              type: "circle",
              owner: e,
              ...at(h.x + Math.cos(a) * off, h.z + Math.sin(a) * off),
              r: 1.7,
              timer: t,
              duration: t,
              damage: 20,
              cause: "rockfall",
              color: "#ffb36b",
            });
          }
          break;
        }
        case "magma":
          // 熔岩環：原地連續放出 1～2 圈往外擴散的火環。
          e.cast = {
            move,
            t: 0,
            count: 0,
            max: n([1, 1, 2]),
            gap: 0.8,
            speed: 9,
            damage: 22,
            still: true,
          };
          break;
        case "pulse":
          // 脈衝：邊移動邊放出 1～3 圈光環。
          e.cast = {
            move,
            t: 0,
            count: 0,
            max: n([1, 2, 3]),
            gap: 0.7,
            speed: 11,
            damage: 20,
            still: false,
          };
          break;
        // 召喚小怪。
        case "brood": {
          const k = n([3, 4, 5]);
          for (let i = 0; i < k; i++) this.summon(e, (i / k) * TAU);
          this.ring(e.x, e.z, 5, e.color);
          break;
        }
        // 圓形落點攻擊。
        case "miasma": {
          const k = n([2, 3, 4]);
          for (let i = 0; i < k; i++) {
            const a = R() * TAU,
              off = i ? 2.5 + R() * 3 : 0,
              t = 0.6 * warn;
            this.hazards.push({
              type: "pool",
              owner: e,
              ...at(h.x + Math.cos(a) * off, h.z + Math.sin(a) * off),
              r: 2.4,
              timer: t,
              duration: t,
              active: 6,
              damage: 10,
              cause: "poison",
              color: "#9be37a",
            });
          }
          break;
        }
        case "spiral":
          // 螺旋彈幕：原地旋轉，朝 2～3 個方向持續發射。
          e.cast = {
            move,
            t: 0,
            dur: 2.6,
            emit: 0,
            arms: Math.max(2, n([2, 2, 3])),
            still: true,
          };
          break;
        // 護衛：有小怪在場時自己受到保護。
        case "guard": {
          e.guard = 7;
          if (!this.enemies.some((o) => o.minion && !o.dead))
            for (let i = 0; i < 2 + Math.max(0, D.extra); i++)
              this.summon(e, i * Math.PI);
          this.emit("guard", { x: e.x, z: e.z });
          break;
        }
        case "charge":
          e.cast = { move, left: Math.min(4, n([1, 2, 3])), still: true };
          this.beginCharge(e);
          break;
        // 隨機落點攻擊。
        case "thunder": {
          const k = n([4, 6, 8]);
          for (let i = 0; i < k; i++) {
            const a = R() * TAU,
              off = i ? 1.5 + R() * 4 : 0,
              t = (0.8 + i * 0.12) * warn;
            this.hazards.push({
              type: "circle",
              owner: e,
              ...at(h.x + Math.cos(a) * off, h.z + Math.sin(a) * off),
              r: 1.6,
              timer: t,
              duration: t,
              damage: 24,
              cause: "lightning",
              color: "#9be8ff",
            });
          }
          break;
        }
        // 旋轉光束。
        case "laser": {
          const beams = p >= 3 ? 2 : 1,
            dir = R() < 0.5 ? 1 : -1,
            t = 1 * warn;
          for (let b = 0; b < beams; b++)
            this.hazards.push({
              type: "beam",
              owner: e,
              x: e.x,
              z: e.z,
              start: e.angle + b * Math.PI - dir * 1.05,
              sweep: dir * 2.1,
              angle: e.angle + b * Math.PI - dir * 1.05,
              length: 24,
              width: 1.1,
              timer: t,
              duration: t,
              active: 2.4,
              activeMax: 2.4,
              damage: 20,
              cause: "laser",
              color: "#7fe8ff",
            });
          e.cast = { move, t: 0, dur: t + 2.4, still: true };
          break;
        }
      }
    }
    // 首領召喚一群小怪。
    summon(e, a) {
      // 可以召喚的種類，難度越高越多。
      const pool = [
        "swarm",
        "chaser",
        "splitter",
        ...(this.diff.tier >= 2 ? ["bomber"] : []),
        ...(this.diff.tier >= 3 ? ["healer"] : []),
      ];
      const kind = pool[Math.floor(this.random() * pool.length)];
      const list = this.spawnPack(kind, {
        x: e.x + Math.cos(a) * 3.5,
        z: e.z + Math.sin(a) * 3.5,
      });
      for (const m of list) {
        m.minion = true;
        m.age = 0.3;
      }
      return list;
    }
    // 開始衝撞的蓄力。
    beginCharge(e) {
      e.windup = e.windupMax = 0.9 * this.diff.warn;
      e.chargeAngle = e.angle;
      e.chargeLen = 21 * this.diff.speed * 0.6;
      e.charge = 0;
    }
    // 持續中的招式每一步要做的事。
    continueCast(e, dt, rate) {
      // c 是首領正在進行中的招式；t 累計已經過了多久。
      const c = e.cast;
      c.t = (c.t || 0) + dt;
      // 熔岩環與脈衝：每隔一段時間（gap）放出一圈，直到次數用完。
      if (c.move === "magma" || c.move === "pulse") {
        if (c.count < c.max && c.t >= c.count * c.gap) {
          this.hazards.push({
            type: "ring",
            owner: e,
            x: e.x,
            z: e.z,
            radius: e.r,
            speed: c.speed,
            maxR: 22,
            width: 0.85,
            damage: c.damage,
            cause: "ring",
            color: c.move === "magma" ? "#ff8a3d" : "#7fe8ff",
          });
          this.ring(e.x, e.z, 4, e.color, 0.4);
          c.count++;
        }
        if (c.count >= c.max && c.t >= c.max * c.gap) e.cast = null;
      } else if (c.move === "spiral") {
        c.emit -= dt * rate;
        // 螺旋彈幕：每 0.09 秒朝每個方向各射一發，並慢慢旋轉。
        while (c.emit <= 0) {
          c.emit += 0.09;
          e.spin += 0.33;
          for (let a = 0; a < c.arms; a++)
            this.shoot(e, 1, 0, false, {
              angle: e.spin + (a * TAU) / c.arms,
              speed: 7,
              color: "#f2c4ff",
            });
        }
        if (c.t >= c.dur) e.cast = null;
      } else if (c.move === "laser") {
        if (c.t >= c.dur) e.cast = null;
      } else if (c.move === "charge") {
        // 衝撞：先蓄力（windup），然後朝鎖定的方向高速衝刺（charge）。
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) {
            e.charge = 0.6;
            this.emit("boss-dash", { x: e.x, z: e.z });
          }
          return;
        }
        if (e.charge > 0) {
          e.charge -= dt;
          const v = 21 * this.diff.speed * dt;
          e.x += Math.cos(e.chargeAngle) * v;
          e.z += Math.sin(e.chargeAngle) * v;
          if (e.charge <= 0) {
            c.left--;
            if (c.left > 0) c.pause = 0.3;
            else {
              e.cast = null;
              e.stunned = 1.3;
              this.emit("stun", { x: e.x, z: e.z, boss: true });
            }
          }
          return;
        }
        // 連續衝撞之間的短暫停頓。
        if (c.pause > 0) {
          c.pause -= dt;
          if (c.pause <= 0) this.beginCharge(e);
        }
      }
    }
    // 環繞玩家的光球位置。
    orbits() {
      const h = this.snake[0];
      return Array.from({ length: this.orbitCount }, (_, i) => {
        const a = this.orbitAngle + (TAU * i) / this.orbitCount;
        return { x: h.x + Math.cos(a) * 2.7, z: h.z + Math.sin(a) * 2.7 };
      });
    }
    // 結束這一局。
    end(won = false, reason) {
      if (this.over) return;
      this.over = true;
      this.won = won;
      this.endReason =
        reason ||
        (won ? "completed" : this.health <= 0 ? "defeated" : "retired");
      this.emit("end");
    }
    // 牆與石頭會擋住蛇頭並讓它沿表面滑開，不會扣血。
    resolveTerrain(h) {
      const lim = this.bound - 0.7;
      if (Math.abs(h.x) > lim) {
        const side = Math.sign(h.x);
        h.x = side * lim;
        if (Math.cos(this.angle) * side > 0)
          this.angle = Math.sin(this.angle) >= 0 ? Math.PI / 2 : -Math.PI / 2;
        this.emit("bump");
      }
      if (Math.abs(h.z) > lim) {
        const side = Math.sign(h.z);
        h.z = side * lim;
        if (Math.sin(this.angle) * side > 0)
          this.angle =
            (Math.abs(h.x) >= lim - 0.01
              ? -Math.sign(h.x)
              : Math.cos(this.angle)) >= 0
              ? 0
              : Math.PI;
        this.emit("bump");
      }
      for (const o of this.obstacles) {
        const d = distance(h, o),
          min = o.r + 0.55;
        if (d >= min) continue;
        const nx = d > 0.001 ? (h.x - o.x) / d : -Math.cos(this.angle),
          nz = d > 0.001 ? (h.z - o.z) / d : -Math.sin(this.angle);
        h.x = o.x + nx * min;
        h.z = o.z + nz * min;
        const c = Math.cos(this.angle),
          s = Math.sin(this.angle);
        if (c * nx + s * nz < 0) {
          const tx = -nz,
            tz = nx,
            along = c * tx + s * tz >= 0 ? 1 : -1;
          this.angle = Math.atan2(tz * along, tx * along);
        }
        this.emit("bump");
      }
    }
    // 踩到加速板或傳送門。
    useTerrain(h) {
      for (const p of this.pads)
        if (p.cooldown <= 0 && distance(h, p) < 1.6) {
          p.cooldown = 1;
          this.boost = 1.6;
          this.dash = Math.min(100, this.dash + 25);
          this.dashLocked = false;
          this.ring(p.x, p.z, 2.4, "#d9f77b", 0.5);
          this.emit("boost", { x: p.x, z: p.z });
        }
      if (this.portalCooldown > 0) return;
      for (const p of this.portals) {
        if (distance(h, p) > 1.3) continue;
        const t = this.portals[p.link],
          lim = this.bound - 1.5;
        const ex = clamp(t.x + Math.cos(this.angle) * 2.2, -lim, lim),
          ez = clamp(t.z + Math.sin(this.angle) * 2.2, -lim, lim),
          dx = ex - h.x,
          dz = ez - h.z;
        for (const s of this.snake) {
          s.x = clamp(s.x + dx, -this.bound + 0.7, this.bound - 0.7);
          s.z = clamp(s.z + dz, -this.bound + 0.7, this.bound - 0.7);
        }
        this.portalCooldown = 1.5;
        this.ring(p.x, p.z, 3, "#c49bff");
        this.ring(t.x, t.z, 3, "#c49bff");
        this.burst(t.x, t.z, "#c49bff", 20);
        this.emit("portal", {
          from: { x: p.x, z: p.z },
          to: { x: t.x, z: t.z },
        });
        return;
      }
    }
    // 危險區域：圓形與直線預警後爆一次；光束與毒池會持續；圓環往外擴。
    updateHazards(dt, h) {
      // 逐一處理場上的危險區：damage 是傷害、cause 是受傷原因（顯示在畫面上）。
      for (const hz of this.hazards) {
        const type = hz.type || "circle",
          damage = hz.damage ?? DAMAGE.shockwave.amount,
          cause = hz.cause || "shockwave";
        if (this.frozen > 0) continue;
        // 擴散環：半徑越來越大，碰到蛇頭就受傷（衝刺中可以穿過去）。
        if (type === "ring") {
          hz.radius += hz.speed * dt;
          // 衝刺可以跳過擴散的圓環。
          if (
            !hz.hit &&
            !this.dashing &&
            Math.abs(distance(h, hz) - hz.radius) < hz.width + 0.45
          ) {
            hz.hit = true;
            this.hurt(damage, cause);
          }
          if (hz.radius >= hz.maxR) hz.done = true;
          continue;
        }
        // 雷射跟著首領移動。
        if (type === "beam" && hz.owner && !hz.owner.dead) {
          hz.x = hz.owner.x;
          hz.z = hz.owner.z;
        }
        // 預警倒數：時間到才真的生效。圓形範圍生效時對範圍內的蛇頭造成傷害。
        if (hz.timer > 0) {
          hz.timer -= dt;
          if (hz.timer > 0) continue;
          if (type === "circle") {
            hz.done = true;
            this.ring(hz.x, hz.z, hz.r, hz.color || "#ff6579");
            this.burst(hz.x, hz.z, hz.color || "#ff6579", 20);
            this.emit("erupt", { cause, x: hz.x, z: hz.z, r: hz.r });
            if (distance(h, hz) < hz.r + 0.55) this.hurt(damage, cause);
          } else if (type === "line") {
            hz.done = true;
            this.emit("erupt", {
              cause,
              x: hz.x,
              z: hz.z,
              angle: hz.angle,
              length: hz.length,
              width: hz.width,
            });
            for (let k = 2; k < hz.length; k += 2.5)
              this.burst(
                hz.x + Math.cos(hz.angle) * k,
                hz.z + Math.sin(hz.angle) * k,
                hz.color,
                3,
                4,
              );
            if (
              segmentDistance(h, hz.x, hz.z, hz.angle, hz.length) <
              hz.width + 0.5
            )
              this.hurt(damage, cause);
          } else this.emit("erupt", { cause, x: hz.x, z: hz.z });
          continue;
        }
        // 掃射雷射：在持續時間內從起始角度轉到結束角度。
        if (type === "beam") {
          hz.active -= dt;
          hz.angle =
            hz.start + hz.sweep * (1 - Math.max(0, hz.active) / hz.activeMax);
          if (
            segmentDistance(h, hz.x, hz.z, hz.angle, hz.length) <
            hz.width + 0.45
          )
            this.hurt(damage, cause);
          if (hz.active <= 0 || !hz.owner || hz.owner.dead) hz.done = true;
        } else if (type === "pool") {
          hz.active -= dt;
          if (distance(h, hz) < hz.r + 0.3) this.hurt(damage, cause);
          if (hz.active <= 0) hz.done = true;
        }
      }
      // 移除已經結束的危險區。
      this.hazards = this.hazards.filter((x) => !x.done);
    }
    // 一步更新：計時 → 轉向移動 → 地形 → 吃東西 → 技能 → 敵人 → 子彈。
    update(dt, input = {}) {
      if (this.over || this.paused || this.needsUpgrade) return;
      dt = clamp(dt, 0, 0.05);
      this.time += dt;
      // 往 0 倒數的小工具。
      const tick = (v) => Math.max(0, v - dt);
      this.biteCooldown = tick(this.biteCooldown);
      this.biteVisual = tick(this.biteVisual);
      this.cooldown = tick(this.cooldown);
      this.activeSkill = tick(this.activeSkill);
      this.frozen = tick(this.frozen);
      this.invulnerable = tick(this.invulnerable);
      this.coilCooldown = tick(this.coilCooldown);
      this.boost = tick(this.boost);
      this.portalCooldown = tick(this.portalCooldown);
      for (const k of Object.keys(this.powers))
        this.powers[k] = tick(this.powers[k]);
      for (const p of this.pads) p.cooldown = tick(p.cooldown);
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
      this.health = Math.min(this.maxHealth, this.health + this.regen * dt);
      const h = this.snake[0],
        slow = this.slowZoneAt(h),
        ice = !!slow && this.world === 1;
      this.zone = slow ? "slow" : null;
      if (Number.isFinite(input.angle)) this.targetAngle = input.angle;
      // 轉向有角速度上限，走最短的方向。
      const diff = Math.atan2(
          Math.sin(this.targetAngle - this.angle),
          Math.cos(this.targetAngle - this.angle),
        ),
        turn = 6.5 * (ice ? 0.4 : 1) * dt;
      this.angle += clamp(diff, -turn, turn);
      if (!input.dash) this.dashLocked = false;
      this.dashing = !!input.dash && !this.dashLocked && this.dash > 0;
      const free = this.powers.speed > 0;
      // 衝刺消耗與恢復；耗盡後要放開按鍵才能再用。
      this.dash = clamp(
        this.dash + dt * (this.dashing ? (free ? 0 : -38) : this.dashRegen),
        0,
        100,
      );
      if (this.dash === 0) this.dashLocked = true;
      let speed =
        this.speed *
        (this.dashing ? 1.9 : 1) *
        (this.boost > 0 ? 1.5 : 1) *
        (free ? 1.3 : 1);
      if (slow) speed *= ice ? 1.15 : this.world === 2 ? 0.55 : 0.6;
      this.currentSpeed = speed;
      h.x += Math.cos(this.angle) * speed * dt;
      h.z += Math.sin(this.angle) * speed * dt;
      // 漩渦區會把蛇頭往中心拉。
      if (slow && this.world === 2) {
        const d = distance(slow, h);
        if (d > 0.3) {
          h.x += ((slow.x - h.x) / d) * 1.4 * dt;
          h.z += ((slow.z - h.z) / d) * 1.4 * dt;
        }
      }
      this.resolveTerrain(h);
      this.useTerrain(h);
      // 身體長度補到目標值。
      while (this.snake.length < this.targetLength)
        this.snake.push({ ...this.snake[this.snake.length - 1] });
      if (this.snake.length > this.targetLength)
        this.snake.length = this.targetLength;
      // 每一節跟著前一節，保持固定間距。
      for (let i = 1; i < this.snake.length; i++) {
        const prev = this.snake[i - 1],
          s = this.snake[i],
          d = distance(prev, s);
        if (d > SEG) {
          s.x = prev.x + ((s.x - prev.x) / d) * SEG;
          s.z = prev.z + ((s.z - prev.z) / d) * SEG;
        }
      }
      this.maxLength = Math.max(this.maxLength, this.snake.length);
      if (this.over) return;
      this.inSpring = false;
      // 治癒泉。
      for (const z of this.zones)
        if (z.type === "spring") {
          z.charge = Math.min(z.max, z.charge + 1.5 * dt);
          if (distance(z, h) < z.r) {
            this.inSpring = true;
            const heal = Math.min(
              9 * dt,
              z.charge,
              this.maxHealth - this.health,
            );
            if (heal > 0) {
              this.health += heal;
              z.charge -= heal;
            }
          }
        }
      // 吸附範圍，把附近食物吸過來。
      const radius =
        this.magnet +
        (this.characterIndex === 0 && this.activeSkill > 0 ? 11 : 0) +
        (this.powers.magnet > 0 ? 9 : 0);
      // 食物的壽命、吸附與吃下。
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i];
        if (f.life !== undefined) {
          f.life -= dt;
          if (f.life <= 0) {
            this.food.splice(i, 1);
            continue;
          }
        }
        let d = distance(f, h);
        const reach = FOODS[f.type].power ? Math.max(radius, 2.4) : radius;
        if (d < reach && d > 0.7) {
          const move = Math.min(d, (6 + (reach - d) * 4) * dt);
          f.x += ((h.x - f.x) / d) * move;
          f.z += ((h.z - f.z) / d) * move;
          d -= move;
        }
        if (d < 0.85) {
          this.collect(f);
          this.food.splice(i, 1);
        }
      }
      if (!this.training) this.detectCoil();
      // 定時補充食物、道具與寶箱。
      if (!this.training) {
        this.foodTimer -= dt;
        if (this.foodTimer <= 0) {
          this.foodTimer = 0.3;
          for (let n = 0; n < 2 && this.food.length < this.foodTarget; n++)
            this.spawnAmbientFood();
        }
        this.powerTimer -= dt;
        if (this.powerTimer <= 0) {
          this.powerTimer = 9 + this.random() * 6;
          if (this.powerCount() < this.powerCap) this.spawnPower();
        }
        this.caches = this.caches.filter((c) => !c.dead);
        if (this.caches.length < this.cacheTarget) {
          this.cacheTimer -= dt;
          if (this.cacheTimer <= 0) {
            this.cacheTimer = 12;
            this.spawnCache();
          }
        }
      } else if (this.coilTraining) this.detectCoil();
      this.orbitAngle += dt * 2.8;
      const orbits = this.orbits();
      this.pulseTimer -= dt;
      // 脈衝強化定時放出一圈傷害。
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 4;
        if (this.pulseLevel > 0) {
          this.ring(h.x, h.z, 5 + this.pulseLevel, this.character.color);
          this.areaDamage(
            h,
            5 + this.pulseLevel,
            18 * this.pulseLevel * this.power(),
          );
        }
      }
      // 衝刺時的尾跡粒子。
      this.trailTimer -= dt;
      if ((this.dashing || this.boost > 0) && this.trailTimer <= 0) {
        this.trailTimer = 0.05;
        this.burst(
          h.x,
          h.z,
          this.boost > 0 ? "#d9f77b" : this.character.accent,
          1,
        );
      }
      this.updateMode(dt);
      if (this.over || this.needsUpgrade) return;
      this.autoBite();
      const power = this.power();
      // 每隻敵人的計時、行動與碰撞。
      for (const e of [...this.enemies]) {
        if (e.dead) continue;
        e.age += dt;
        e.flash = Math.max(0, e.flash - dt);
        this.updateEnemy(e, dt);
        if (e.dead) continue;
        if (e.serpent) {
          e.body[0] = { x: e.x, z: e.z };
          for (let j = 1; j < e.body.length; j++) {
            const p = e.body[j - 1],
              s = e.body[j],
              dd = distance(p, s);
            if (dd > 0.6) {
              s.x = p.x + ((s.x - p.x) / dd) * 0.6;
              s.z = p.z + ((s.z - p.z) / dd) * 0.6;
            }
          }
        }
        for (const o of orbits)
          if (distance(e, o) < e.r + 0.65) this.damageEnemy(e, 45 * power * dt);
        if (
          this.characterIndex === 1 &&
          this.activeSkill > 0 &&
          this.snake.some((s, i) => i % 3 === 0 && distance(s, e) < e.r + 1.2)
        )
          this.damageEnemy(e, 32 * power * dt);
        const contact = distance(h, e) < e.r + 0.65;
        const bodyContact =
          e.serpent && e.body.some((p) => distance(h, p) < 1.2);
        if (!e.dead && e.age > 0.8) {
          if (
            this.dashing &&
            (contact || bodyContact) &&
            this.time - e.ramAt >= COMBAT.ramCooldown
          ) {
            e.ramAt = this.time;
            if (e.kind === "shield" && !(e.shieldBreak > 0)) {
              e.shieldBreak = 2.5;
              this.emit("shield-down", { x: e.x, z: e.z });
            }
            if (
              this.damageEnemy(e, COMBAT.ram * power, "ram") &&
              !e.boss &&
              !e.dummy &&
              !e.dead
            ) {
              e.x = clamp(
                e.x + Math.cos(this.angle) * 2.2,
                -this.bound + 2,
                this.bound - 2,
              );
              e.z = clamp(
                e.z + Math.sin(this.angle) * 2.2,
                -this.bound + 2,
                this.bound - 2,
              );
            }
            // 衝撞首領會彈開並有短暫保護，撞得好不會反而受傷。
            if (e.boss && !e.dead && contact) {
              const d = distance(h, e) || 0.001,
                nx = (h.x - e.x) / d,
                nz = (h.z - e.z) / d;
              h.x = e.x + nx * (e.r + 1);
              h.z = e.z + nz * (e.r + 1);
              this.angle = Math.atan2(nz, nx);
              this.invulnerable = Math.max(this.invulnerable, 0.5);
              this.emit("bounce", { x: e.x, z: e.z });
            }
            this.burst(e.x, e.z, "#d5f875", 12);
          }
          if (!e.dead && contact && !this.dashing) {
            if (this.characterIndex === 3 && this.activeSkill > 0)
              this.damageEnemy(e, 100 * power * dt);
            else if (e.boss) this.hurt(DAMAGE.boss.amount, "boss");
            else if (e.charge > 0) this.hurt(DAMAGE.charge.amount, "charge");
            else
              this.hurt(
                DAMAGE.enemy.amount *
                  (ENEMIES[e.kind]?.contact || 1) *
                  (e.elite ? 1.2 : 1),
                "enemy",
              );
          }
          if (
            !e.dead &&
            this.time - e.counterAt >= COMBAT.counterCooldown &&
            this.snake.slice(5).some((p) => distance(e, p) < e.r + 0.5)
          ) {
            e.counterAt = this.time;
            this.damageEnemy(e, COMBAT.counter * power, "counter");
          }
        }
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.frozen <= 0) this.separateEnemies();
      for (const c of this.caches) {
        c.flash = Math.max(0, c.flash - dt);
        if (c.dead) continue;
        for (const o of orbits)
          if (distance(c, o) < c.r + 0.65) this.damageCache(c, 45 * power * dt);
        if (
          this.dashing &&
          distance(h, c) < c.r + 0.7 &&
          this.time - c.ramAt >= 0.5
        ) {
          c.ramAt = this.time;
          this.damageCache(c, COMBAT.ram * power, "ram");
        }
      }
      this.updateHazards(dt, h);
      for (const p of this.projectiles) {
        if (this.frozen <= 0) {
          if (p.homing) {
            const want = Math.atan2(h.z - p.z, h.x - p.x),
              cur = Math.atan2(p.vz, p.vx),
              sp = Math.hypot(p.vx, p.vz),
              turn = clamp(
                Math.atan2(Math.sin(want - cur), Math.cos(want - cur)),
                -p.homing * dt,
                p.homing * dt,
              );
            p.vx = Math.cos(cur + turn) * sp;
            p.vz = Math.sin(cur + turn) * sp;
          }
          p.x += p.vx * dt;
          p.z += p.vz * dt;
        }
        p.life -= dt;
        if (distance(p, h) < 0.65 + (p.r || 0.25)) {
          this.hurt(p.damage || DAMAGE.projectile.amount, "projectile");
          p.life = 0;
          continue;
        }
        // 石頭、柱子與地標可以當掩護，會擋下敵人的子彈。
        for (const o of this.obstacles)
          if (Math.abs(p.x - o.x) < o.r + 0.3 && distance(p, o) < o.r + 0.2) {
            p.life = 0;
            this.burst(p.x, p.z, p.color || "#ffad85", 3, 2);
            break;
          }
      }
      this.projectiles = this.projectiles.filter(
        (p) =>
          p.life > 0 &&
          Math.abs(p.x) < this.bound + 3 &&
          Math.abs(p.z) < this.bound + 3,
      );
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        p.vy -= 12 * dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0 && p.y > 0);
      for (const r of this.rings) r.age += dt;
      this.rings = this.rings.filter((r) => r.age < r.life);
      if (this.time >= this.duration) this.end(true);
      else if (!this.training) this.checkLevel();
    }
  }

  // ---------- 新手練習 ----------

  // 八步練習：轉向、衝刺、吃食物、咬擊、纏繞、技能、升級。
  class Tutorial {
    // 只能搭配練習用的一局。
    constructor(game) {
      if (!game.training) throw new Error("Tutorial requires a training game");
      this.game = game;
      this.step = 0;
      this.progress = 0;
      this.completed = false;
      this.lastAngle = game.angle;
    }
    // 進到下一步，並準備那一步需要的東西。
    advance() {
      this.step++;
      this.progress = 0;
      const g = this.game;
      if (this.step === 1) {
        this.foodStart = g.foodEaten;
        this.placeFood();
      }
      if (this.step === 5) {
        g.targetLength = Math.max(g.targetLength, 30);
        g.coilTraining = true;
      }
      if (this.step >= 3 && this.step <= 5) this.placeTarget();
      if (this.step === 6) {
        g.enemies = [];
        g.cooldown = 0;
        g.coilTraining = false;
      }
      if (this.step === 7) {
        g.xp = g.nextXP;
        g.checkLevel();
      }
      if (this.step >= 8) {
        this.completed = true;
        g.paused = true;
      }
    }
    // 在玩家前方放一隻練習用的敵人。
    placeTarget() {
      const g = this.game,
        h = g.snake[0],
        range = this.step === 5 ? 5 : 7;
      g.enemies = [];
      const e = g.spawnEnemy(false, 0, "chaser");
      e.x = clamp(h.x + Math.cos(g.angle) * range, -g.bound + 5, g.bound - 5);
      e.z = clamp(h.z + Math.sin(g.angle) * range, -g.bound + 5, g.bound - 5);
      e.dummy = true;
      e.serpent = false;
      e.age = 1;
      e.hp = e.maxHp = 1;
      e.requiredAttack = ["bite", "ram", "coil"][this.step - 3];
      e.name = ["咬擊練習靶", "衝撞練習靶", "纏繞練習靶"][this.step - 3];
      this.target = e;
      g.dash = 100;
      g.dashLocked = false;
    }
    // 在玩家前方排一列食物。
    placeFood() {
      const g = this.game,
        h = g.snake[0];
      g.food = [];
      for (let i = 1; i <= 8; i++)
        g.spawnFood(
          {
            x: clamp(
              h.x + Math.cos(g.angle) * i * 1.1,
              -g.bound + 3,
              g.bound - 3,
            ),
            z: clamp(
              h.z + Math.sin(g.angle) * i * 1.1,
              -g.bound + 3,
              g.bound - 3,
            ),
          },
          "energy",
        );
      this.placedAt = g.time;
    }
    // 檢查目前這一步是否完成。
    update(dt, input) {
      const g = this.game;
      if (g.paused || g.over || g.needsUpgrade || this.completed) return;
      if (this.step === 0 && Number.isFinite(input.angle)) {
        this.progress += Math.abs(
          Math.atan2(
            Math.sin(g.angle - this.lastAngle),
            Math.cos(g.angle - this.lastAngle),
          ),
        );
        if (this.progress >= 0.65) this.advance();
      } else if (this.step === 1) {
        this.progress = g.foodEaten - this.foodStart;
        if (this.progress >= 5) this.advance();
        else if (g.time - this.placedAt > 7) this.placeFood();
      } else if (this.step === 2 && g.dashing) {
        this.progress += dt;
        if (this.progress >= 0.5) this.advance();
      } else if (this.step >= 3 && this.step <= 5) {
        if (this.target.dead) this.advance();
        else if (distance(g.snake[0], this.target) > 16) this.placeTarget();
      }
      this.lastAngle = g.angle;
    }
    // 玩家做了技能或升級的動作。
    action(type) {
      if (
        (this.step === 6 && type === "skill") ||
        (this.step === 7 && type === "upgrade")
      )
        this.advance();
    }
  }
  return {
    Game,
    Tutorial,
    COMBAT,
    BOSSES,
    BOSS_MOVES,
    DAMAGE,
    DIFFICULTIES,
    ENEMIES,
    FOODS,
    POWER_IDS,
    FEATURES,
    CHARACTERS,
    WORLDS,
    MODES,
    UPGRADES,
    META,
    ACHIEVEMENTS,
    GUIDE_VERSION,
    defaultProfile,
    sanitizeProfile,
    buyUpgrade,
    settle,
    clamp,
    distance,
    seeded,
    polygonArea,
    insidePolygon,
    segmentDistance,
  };
});
