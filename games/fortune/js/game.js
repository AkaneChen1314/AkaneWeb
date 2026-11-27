"use strict";
// ===== 戰場邏輯 =====
// 目前這一局的所有資料；沒有開局時是 null。
let R = null;
// 全域平衡：敵人生命倍率與擊殺金幣倍率。
let HP_GLOBAL = 0.7,
  GOLD_KILL = 1.5;
// 「我的塔」列：備戰區＋地圖上的塔全部列出來，一頁 10 種；備戰區最多 24 座
const HAND_X = 20,
  HAND_Y = 988,
  CARD_W = 106,
  CARD_H = 84,
  CARD_GAP = 6,
  HAND_PAGE = 10,
  HAND_MAX = 24;
// 翻頁按鈕的位置。
const PAGER = {
  x: HAND_X + HAND_PAGE * (CARD_W + CARD_GAP),
  y: HAND_Y,
  w: 46,
  h: CARD_H,
};
// 出售區的位置。
const TRASH = {
  x: PAGER.x + PAGER.w + 6,
  y: HAND_Y,
  w: 1300 - (PAGER.x + PAGER.w + 6),
  h: CARD_H,
};

// 目前的幸運值（含遺物加成）。
function getLuck() {
  return R ? R.luck + R.mods.luck : 0;
}
// 目前開啟的視窗。
function activeModal() {
  return R && R.modal;
}
// 右側的短訊息；最多同時五則。
function toast(text, col = "#ffffff") {
  G.toasts.push({ text, col, t: 0 });
  if (G.toasts.length > 5) G.toasts.shift();
}
// 畫面中央的大標題。
function banner(text, sub = "", col = "#ffe080") {
  G.banner = { text, sub, col, t: 0 };
}
// 「我的塔」列第 l 格的位置。
function slotPos(l) {
  return { x: HAND_X + l * (CARD_W + CARD_GAP), y: HAND_Y };
}
// 「我的塔」：備戰區＋地圖上的塔，依「種類＋星級」分組；備戰區還有的排前面
const KIND_ORDER = {
  prism: 0,
  special: 1,
  trinity: 2,
  hybrid: 3,
  class: 4,
  base: 5,
};
// 把備戰區與地圖上的塔依種類與星級分組並排序。
function myGroups() {
  const m = new Map();
  // 把一座塔加入分組（同種類、同星級的放在一起），記下它在備戰區還是地圖上。
  const add = (key, tier, src, ref) => {
    const k = key + "|" + tier;
    if (!m.has(k)) m.set(k, { key, tier, hand: [], map: [] });
    m.get(k)[src].push(ref);
  };
  R.hand.forEach((cd) => add(cd.key, cd.tier, "hand", cd));
  R.towers.forEach((tw) => add(tw.key, tw.tier, "map", tw));
  return [...m.values()].sort(
    (a, b) =>
      (b.hand.length > 0) - (a.hand.length > 0) ||
      b.tier - a.tier ||
      KIND_ORDER[towerKind(a.key)] - KIND_ORDER[towerKind(b.key)] ||
      towerName(a.key).localeCompare(towerName(b.key)),
  );
}
// 「我的塔」總共有幾頁。
function handPages() {
  return Math.max(1, Math.ceil(myGroups().length / HAND_PAGE));
}
// 第 gi 組在目前這頁的位置；不在這頁時回傳 null。
function groupSlot(gi) {
  const l = gi - (R.handPage || 0) * HAND_PAGE;
  return l >= 0 && l < HAND_PAGE ? slotPos(l) : null;
}
// 備戰區第 i 張卡所在格子的位置（不在目前這頁就回傳 null）
function handPos(i) {
  const cd = R.hand[i],
    gi = cd ? myGroups().findIndex((g) => g.hand.includes(cd)) : -1;
  return gi < 0 ? null : groupSlot(gi);
}
// 滑鼠位置上的那一組塔。
function slotAt(x, y) {
  const gs = myGroups();
  for (let gi = 0; gi < gs.length; gi++) {
    const p = groupSlot(gi);
    if (p && x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + CARD_H)
      return gs[gi];
  }
  return null;
}
// 點選一疊卡片後，再點地圖：建造／升星；同一疊還有剩就繼續選著
function placeSelected(tw, x, y) {
  const c = R.hand[R.selCard];
  if (!c) {
    R.selCard = -1;
    return;
  }
  if (tw && !fuseResult(c, tw)) {
    R.selCard = -1;
    R.sel = tw;
    AU.play("click");
    return;
  }
  const key = c.key,
    tier = c.tier,
    n0 = R.hand.length;
  dropCard(R.selCard, x, y);
  if (R.hand.length < n0) {
    const j = R.hand.findIndex(
      (q) => q.key === key && q.tier === tier && q.anim >= 1,
    );
    if (j >= 0) {
      R.selCard = j;
      R.sel = null;
    }
  }
}
// 合成／升星的費用（和強化工坊一樣）
function mergeCost(res, tier) {
  return Math.round(
    (res.type === "fuse" ? fuseCost(tier) : upgradeCost(tier)) *
      (1 - R.mods.shopDisc),
  );
}
// 支付合成或升星的費用；金幣不足時回傳 false。
function payMerge(res, tier) {
  const cost = mergeCost(res, tier);
  if (R.gold < cost) {
    toast(
      `金幣不足：${res.type === "fuse" ? "融合" : "升星"}需要 ${cost} 金`,
      "#ff8a8a",
    );
    AU.play("error");
    return false;
  }
  R.gold -= cost;
  return true;
}

// 開始新的一局；mapIdx 是地圖編號。
function newRun(mapIdx) {
  const map = MAPS[mapIdx],
    t = G.meta.talents;
  // 一局遊戲的完整資料（R）：地圖、路線、城堡生命、金幣、寶石、手牌、防禦塔、敵
  // 人、波數、遺物、統計等。
  R = {
    // 地圖、路徑與預先畫好的背景。
    mapIdx,
    map,
    path: buildPath(map),
    bg: paintMap(map),
    // 生命值。
    hp: 0,
    maxHp: 0,
    baseHp: 20 + 4 * (t.hp || 0),
    // 金幣、寶石與幸運。
    gold: 300 + 60 * (t.gold || 0),
    gems: 3 + 3 * (t.gems || 0),
    luck: 4 * (t.luck || 0),
    // 目前波次；phase 是 build（備戰）或 wave（戰鬥）。
    wave: 0,
    phase: "build",
    // 場上的塔、格子對照表、敵人、飛行物與地面區域。
    towers: [],
    grid: {},
    enemies: [],
    proj: [],
    zones: [],
    // 備戰區的塔卡、遺物與加成總表。
    hand: [],
    relics: [],
    mods: baseMods(),
    // 道具、增益、賭運加成與地面掉落。
    items: [],
    buffs: [],
    cb: [],
    drops: [],
    // 商店內容。
    shop: { offers: [], items: [], rolls: 0 },
    freeRefresh: 0,
    shopScroll: 0,
    shopTab: "up",
    // 正在選擇目標的道具。
    targeting: null,
    // 目前分頁：商店、賭場或戰場。
    tab: "shop",
    invCat: null,
    // 延遲執行的動作。
    timers: [],
    // 連殺數。
    combo: 0,
    comboT: 0,
    comboMax: 0,
    // 目前的視窗與等待顯示的視窗。
    modal: null,
    modals: [],
    // 這一波還沒出現的敵人。
    spawn: [],
    spawnT: 0,
    // 遊戲速度與自動開始下一波。
    speed: 1,
    autoNext: false,
    nextT: 0,
    // 結算用的統計。
    stats: {
      kills: 0,
      spins: 0,
      jackpots: 0,
      bestWin: 0,
      merges: 0,
      fusions: 0,
      bets: 0,
      casinoNet: 0,
      items: 0,
    },
    time: 0,
    alive: true,
    victory: false,
    endless: false,
    // 下一波的敵人預告。
    nextWave: null,
    luckBuys: 0,
    killCount: 0,
    // 選取中的塔與塔卡。
    sel: null,
    selCard: -1,
    coreFlash: 0,
    revived: false,
    uid: 0,
    // 幸運格。
    lucky: new Set(),
  };
  R.hp = R.maxHp = R.baseHp;
  recalcMods();
  addLuckyTiles(9);
  for (let i = 0; i < (t.relic || 0); i++) {
    const r = randomRelic(0, true);
    if (r) addRelic(r.id, true);
  }
  R.nextWave = genWave(1);
  casinoReset();
  // 重設賭場與商店。
  refreshShop(false);
  fxW.clear();
  fxU.clear();
  G.toasts = [];
  G.pops = [];
  G.banner = null;
  G.drag = null;
  // 開局贈送的道具。
  addItem("charm", 1, { silent: true });
  for (let i = 0; i < 2 * (t.spins || 0); i++)
    addItem(rollItem(0.3), 1, { silent: true });
  G.screen = "game";
  if (!G.meta.seenHelp) R.modals.push({ type: "help" });
  banner(map.name, "先到商店買塔 → 戰場布陣 → 開始戰鬥！");
}
// 重設所有賭場遊戲的狀態。
function casinoReset() {
  slInit();
  CZ.auto = null;
  CZ.hist = [];
  CZ.returnTo = null;
  CZ.game = "slot";
  Object.assign(MARY, {
    state: "idle",
    trail: [],
    total: 0,
    shown: 0,
    items: [],
    bonus: false,
  });
  Object.assign(RL, { state: "idle", res: null, hist: [] });
  Object.assign(DC, { state: "idle", hist: [] });
  Object.assign(DB, { state: "idle", pot: 0, round: 0 });
  PK.balls = [];
  PK.hist = [];
  SCR.card = null;
}

// 重新計算遺物、天賦與增益的加成。
function recalcMods() {
  const m = baseMods(),
    t = G.meta.talents;
  m.dmg += 0.06 * (t.dmg || 0);
  for (const id of R.relics) RELIC_BY[id].ap(m);
  applyBuffs(m);
  R.mods = m;
  R.maxHp = R.baseHp + m.maxHp;
  R.hp = Math.min(R.hp, R.maxHp);
  for (const tw of R.towers) tw.st = calcStats(tw.key, tw.tier, m);
}
// 獲得遺物並立刻套用效果。
function addRelic(id, silent) {
  const rel = RELIC_BY[id];
  R.relics.push(id);
  recalcMods();
  if (rel.once) rel.once();
  slRebuild();
  R.hp = Math.min(R.hp, R.maxHp);
  const cx = G.meta.codex;
  if (!cx.relics[id]) {
    cx.relics[id] = 1;
    if (!silent) toast(`✦ 圖鑑新增遺物：${rel.n}`, RAR_COL[rel.r]);
    saveMeta();
  }
}
// 隨機挑一個還沒擁有的遺物；幸運越高越容易拿到稀有的。
function randomRelic(boost = 0, noRare, exclude) {
  const L = getLuck();
  const owned = new Set(R.relics);
  const pool = RELICS.filter(
    (r) =>
      !owned.has(r.id) &&
      !(noRare && r.r > 1) &&
      !(exclude && exclude.has(r.id)),
  );
  if (!pool.length) return null;
  const w = (r) =>
    [62, 27, 9, 2.2][r.r] * (1 + (luckFactor(L) * 2 + boost * 0.8) * r.r);
  return wpick(pool, w);
}
// 在空地隨機放置幸運格。
function addLuckyTiles(n) {
  const cand = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) {
      const k = x + "," + y;
      if (R.path.cells.has(k) || R.lucky.has(k) || R.path.deco.has(k)) continue;
      let adj = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ])
        if (R.path.cells.has(x + dx + "," + (y + dy))) adj = true;
      if (adj) cand.push(k);
    }
  shuffle(cand);
  for (let i = 0; i < n && i < cand.length; i++) {
    R.lucky.add(cand[i]);
    const tw = R.grid[cand[i]];
    if (tw) tw.lucky = true;
  }
}
// 記錄圖鑑；第一次發現時顯示提示並給獎勵。
function discover(key) {
  const cx = G.meta.codex;
  if (!cx.towers[key]) {
    cx.towers[key] = 1;
    saveMeta();
    if (!["base", "class"].includes(towerKind(key))) {
      toast(
        `✦ 新發現：${towerName(key)}！`,
        towerKind(key) === "prism"
          ? "#ff9ad8"
          : towerKind(key) === "trinity"
            ? "#ffcf3a"
            : "#7ae0ff",
      );
      AU.play("discover");
    }
  }
}
// 把塔卡加入備戰區；備戰區已滿時回傳 false。
function addCard(key, tier, o = {}) {
  if (!o.force && R.hand.length >= HAND_MAX) {
    toast(`備戰區已滿（${HAND_MAX} 格）！先把塔放到地圖上或出售`, "#ff8a8a");
    return false;
  }
  R.hand.push({
    key,
    tier,
    id: ++R.uid,
    anim: -(o.delay || 0),
    fx: o.fx ?? 960,
    fy: o.fy ?? 540,
  });
  if (!G.drag) {
    const gi = myGroups().findIndex((g) => g.key === key && g.tier === tier);
    if (gi >= 0) R.handPage = Math.floor(gi / HAND_PAGE);
  }
  discover(key);
  return true;
}

// ===== 路徑 =====
// 把地圖路徑換成線段，方便計算敵人的位置。
function buildPath(map) {
  const pts = map.path.map(([c, r]) => ({
    x: MX + c * TS + TS / 2,
    y: MY + r * TS + TS / 2,
  }));
  const segs = [];
  let cum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1],
      len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, cum, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
    cum += len;
  }
  const lay = mapLayout(map),
    cells = lay.cells;
  const last = map.path[map.path.length - 1],
    first = map.path.find((p) => p[0] >= 0) || map.path[0];
  return {
    pts,
    segs,
    len: cum,
    cells,
    deco: lay.decoSet,
    core: pts[pts.length - 1],
    portal: { x: MX + 6, y: MY + first[1] * TS + TS / 2 },
  };
}
// 路徑上距離起點 d 的位置與方向。
function posAt(d) {
  const S = R.path.segs;
  let s = S[S.length - 1];
  for (const q of S)
    if (d < q.cum + q.len) {
      s = q;
      break;
    }
  const k = clamp(d - s.cum, 0, s.len);
  return {
    x: s.a.x + s.dx * k,
    y: s.a.y + s.dy * k,
    nx: -s.dy,
    ny: s.dx,
    ang: Math.atan2(s.dy, s.dx),
  };
}

// ===== 波次 =====
// 第 n 波敵人的生命倍率。
function hpScale(n) {
  const k = n - 1;
  return (
    (1 + 0.25 * k + 0.03 * k * k) *
    Math.pow(1.04, k) *
    (1 + 1.6 * Math.min(1, k / 15)) *
    (n > 30 ? Math.pow(1.06, n - 30) : 1)
  );
}
// 決定第 n 波的敵人種類、數量與出現間隔。
function genWave(n) {
  const pool = ENEMY_UNLOCK.filter((p) => n >= p[1]).map((p) => p[0]);
  const nt = Math.min(pool.length, n < 3 ? 1 : randi(1, 3));
  const types = shuffle(pool.slice()).slice(0, nt);
  const newest = ENEMY_UNLOCK.find((p) => p[1] === n);
  if (newest && !types.includes(newest[0])) types[0] = newest[0];
  const cnt = Math.min(70, Math.floor(8 + n * 1.6));
  const hpS = hpScale(n) * R.map.hp * HP_GLOBAL;
  const aff = n >= 7 && Math.random() < 0.55 ? pick(EK) : null;
  const gap = Math.max(0.3, 0.95 - n * 0.018);
  const list = [];
  for (let i = 0; i < cnt; i++) {
    const tp = types[i % types.length];
    list.push({
      type: tp,
      hpS,
      aff: aff && Math.random() < 0.7 ? aff : null,
      gap: tp === "runner" ? gap * 0.6 : tp === "brute" ? gap * 1.4 : gap,
    });
  }
  let boss = null,
    elite = null;
  if (n % 10 === 0) {
    boss = ["boss_golem", "boss_lich", "boss_dragon"][(n / 10 - 1) % 3];
    list.push({
      type: boss,
      hpS: hpS * (n <= 10 ? 0.6 : 0.75),
      gap: 2,
      aff: null,
    });
  } else if (n % 5 === 0) {
    elite = pick(pool);
    list.push({ type: elite, hpS, gap: 1.5, elite: true, aff });
  }
  const counts = {};
  list.forEach((s) => {
    if (!ENEMY[s.type].boss && !s.elite)
      counts[s.type] = (counts[s.type] || 0) + 1;
  });
  return { n, list, counts, aff, boss, elite };
}
// 開始下一波。
function startWave() {
  if (R.phase !== "build" || activeModal() || !R.alive) return;
  R.wave++;
  const w = R.nextWave;
  R.tab = "battle";
  R.targeting = null;
  R.nextWaveTotal = w.list.length;
  R.spawn = w.list.slice();
  R.spawnT = 0.5;
  R.phase = "wave";
  R.waveT = 0;
  R.enraged = false;
  R.nextT = 0;
  banner(
    `第 ${R.wave} 波`,
    w.boss
      ? `⚠ 首領來襲：${ENEMY[w.boss].name}`
      : w.elite
        ? `精英出現：${ENEMY[w.elite].name}`
        : w.aff
          ? `敵人抗性：${ELEM[w.aff].full}（弱點：${ELEM[OPP[w.aff]].full}）`
          : "",
    w.boss ? "#ff6a6a" : "#ffe080",
  );
  AU.play("wave");
}
// 這一波清空：利息、獎金、寶石、道具與首領獎勵。
function waveClear() {
  R.phase = "build";
  const bonus = 50 + 15 * R.wave;
  R.gold += bonus;
  let interest = 0,
    eco = 0;
  // 利息：依目前的金幣計算，有上限。
  if (R.mods.interest > 0) {
    interest = Math.min(150, Math.floor(R.gold * R.mods.interest));
    R.gold += interest;
  }
  // 產金塔。
  for (const t of R.towers)
    if (t.st.eco) {
      eco += t.st.eco;
      R.gold += t.st.eco;
      floatText(fxW, t.x, t.y - 40, "+" + t.st.eco + " 金", "#ffcf3a", 22, {
        life: 1.6,
        force: true,
      });
      burst(fxW, t.x, t.y - 20, 12, { col: ["#ffcf3a", "#fff6c0"], smax: 200 });
    }
  R.gems += R.mods.gemWave;
  for (const d of R.drops) collectDrop(d);
  R.drops = [];
  for (let i = 0; i < R.mods.itemsWave; i++)
    addItem(rollItem(R.wave / 15 + (R.mods.itemsWave >= 2 ? 0.4 : 0)));
  tickBuffs();
  R.shop.rolls = 0;
  refreshShop(false);
  banner(
    `第 ${R.wave} 波完成！`,
    `獎金 +${bonus}${eco ? ` · 產金 +${eco}` : ""}${interest ? ` · 利息 +${interest}` : ""} · 商店已更新`,
    "#7affb0",
  );
  AU.play("clear");
  if (R.wave % 10 === 0) R.modals.push({ type: "wheel", mult: 1 });
  // 每 5 波開一次寶箱，每 10 波還有首領轉盤。
  if (R.wave % 5 === 0)
    R.modals.push({
      type: "chest",
      boost: R.wave % 10 === 0 ? 1 : 0,
      title: R.wave % 10 === 0 ? "首領寶藏" : "精英寶藏",
    });
  if (R.wave === WIN_WAVE && !R.endless)
    R.modals.push({ type: "victory", t: 0 });
  R.nextWave = genWave(R.wave + 1);
  if (R.autoNext) R.nextT = 4;
}
// 產生一個敵人；s 是種類、是否精英或首領等設定。
function spawnEnemy(s) {
  // d 是這種敵人的基本資料，el 表示是不是菁英；菁英生命是 6 倍。
  const d = ENEMY[s.type],
    el = !!s.elite;
  const hp = d.hp * s.hpS * (el ? 6 : 1);
  // 敵人的所有狀態。
  const e = {
    type: s.type,
    def: d,
    hp,
    maxHp: hp,
    spd:
      d.spd * R.map.spd * (1 + Math.min(0.3, R.wave * 0.006)) * (s.spdMul || 1),
    r: d.r * (el ? 1.35 : 1),
    gold: Math.round(d.gold * (1 + R.wave * 0.05) * (el ? 6 : 1)),
    armor: (d.armor || 0) * (1 + R.wave * 0.04),
    shield: d.shield ? hp * d.shield : 0,
    shieldMax: d.shield ? hp * d.shield : 0,
    shieldCd: 0,
    d: s.d || 0,
    off: d.boss ? 0 : rand(-12, 12),
    elite: el,
    boss: !!d.boss,
    fly: !!d.fly,
    resist: s.aff || null,
    weak: s.aff ? OPP[s.aff] : null,
    t: rand(10),
    burnT: 0,
    burnDps: 0,
    psn: 0,
    psnDps: 0,
    psnT: 0,
    slowT: 0,
    slowAmt: 0,
    stun: 0,
    frozen: 0,
    shred: 0,
    shredAmt: 0,
    phased: false,
    phaseT: rand(2, 4),
    healT: 2,
    ccCd: 0,
    knockTotal: 0,
    abT: 4,
    dash: 0,
    flash: 0,
    x: 0,
    y: 0,
    dir: 0,
    dead: false,
    hpS: s.hpS,
  };
  // 把敵人放到路線上的起點，面向前進方向，加入場上的敵人清單。
  const p = posAt(e.d);
  e.x = p.x;
  e.y = p.y;
  e.dir = p.ang;
  R.enemies.push(e);
  // 第一次遇到的敵人記錄到圖鑑。
  if (!G.meta.codex.enemies[s.type]) {
    G.meta.codex.enemies[s.type] = 1;
    saveMeta();
  }
  // 首領出場時畫面震動、播放腳步聲。
  if (e.boss) {
    shake(10);
    AU.play("stomp");
  }
  return e;
}

// ===== 主更新 =====
// 每一格更新；遊戲速度越快就多跑幾次。
function updateGame(dt) {
  if (!R) return;
  casinoUpdate(dt);
  for (const c of R.hand)
    if (c.anim < 1) c.anim = Math.min(1, c.anim + dt * 2.2);
  if (activeModal() || !R.alive) return;
  updDrops(dt);
  for (let s = 0; s < R.speed; s++) step(dt);
  if (R.phase === "build" && R.autoNext && R.nextT > 0) {
    R.nextT -= dt;
    if (R.nextT <= 0) startWave();
  }
}
// 更新戰場一次。
function step(dt) {
  R.time += dt;
  if (R.coreFlash > 0) R.coreFlash -= dt * 2;
  if (R.comboT > 0) {
    R.comboT -= dt;
    if (R.comboT <= 0) R.combo = 0;
  }
  // 延遲執行的動作。
  if (R.timers.length) {
    for (const tm of R.timers) {
      tm.t -= dt;
      if (tm.t <= 0 && !tm.done) {
        tm.done = true;
        tm.fn();
      }
    }
    R.timers = R.timers.filter((tm) => !tm.done);
  }
  // 戰鬥中：產生敵人；拖太久時敵人會進入狂暴狀態。
  if (R.phase === "wave") {
    R.waveT += dt;
    if (R.waveT > 150 + R.path.len / 30 && !R.enraged) {
      R.enraged = true;
      toast("敵人狂暴化！移動加速且免疫控制", "#ff6a6a");
    }
    R.spawnT -= dt;
    while (R.spawnT <= 0 && R.spawn.length) {
      const s = R.spawn.shift();
      spawnEnemy(s);
      R.spawnT += s.gap;
    }
  }
  for (const e of R.enemies) if (!e.dead) updEnemy(e, dt);
  for (const t of R.towers) {
    t.bD = 0;
    t.bR = 0;
  }
  // 輔助塔替範圍內的塔加成。
  for (const d of R.towers)
    if (d.st.support && d.disabled <= 0)
      for (const t of R.towers)
        if (t !== d && d2(t.x, t.y, d.x, d.y) <= d.st.range * d.st.range) {
          t.bD += d.st.support.dmg;
          t.bR += d.st.support.rate;
        }
  for (const t of R.towers) updTower(t, dt);
  updProj(dt);
  updZones(dt);
  if (R.enemies.some((e) => e.dead))
    R.enemies = R.enemies.filter((e) => !e.dead);
  fxW.update(dt);
  ambient(dt);
  if (R.phase === "wave" && !R.spawn.length && !R.enemies.length && R.alive)
    waveClear();
}
// 地圖的環境粒子。
function ambient(dt) {
  const th = R.map.theme;
  if (Math.random() < dt * 6) {
    const x = MX + rand(COLS * TS),
      y = MY + rand(ROWS * TS);
    if (th === "meadow")
      fxW.add({
        kind: "glow",
        x,
        y,
        vx: rand(-10, 10),
        vy: rand(-14, -4),
        life: rand(2, 4),
        size: rand(4, 7),
        col: "#e8ff9a",
        a: 0.7,
        fadeIn: 0.8,
      });
    else if (th === "lava")
      fxW.add({
        kind: "glow",
        x,
        y: MY + ROWS * TS,
        vx: rand(-15, 15),
        vy: rand(-80, -40),
        life: rand(2, 5),
        size: rand(3, 6),
        col: "#ff7a1a",
        a: 0.9,
      });
    else
      fxW.add({
        kind: "star",
        x,
        y,
        life: rand(1, 2.5),
        size: rand(3, 6),
        col: pick(["#ffffff", "#9ad8ff", "#ff9af0"]),
        twinkle: true,
        fadeIn: 0.5,
      });
  }
}

// ===== 敵人 =====
function updEnemy(e, dt) {
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  // 燃燒。
  if (e.burnT > 0) {
    e.burnT -= dt;
    dealDamage(e, e.burnDps * dt, e.burnSrc, { dot: true });
    if (Math.random() < dt * 10)
      fxW.add({
        kind: "glow",
        x: e.x + rand(-e.r, e.r) * 0.6,
        y: e.y - rand(e.r),
        vy: -50,
        life: 0.45,
        size: rand(5, 9),
        col: "#ff6a1a",
      });
  }
  if (e.dead) return;
  // 中毒。
  if (e.psnT > 0) {
    e.psnT -= dt;
    dealDamage(e, e.psn * e.psnDps * dt, e.psnSrc, { dot: true });
    if (Math.random() < dt * 4)
      fxW.add({
        kind: "dot",
        x: e.x + rand(-e.r, e.r) * 0.6,
        y: e.y,
        vy: -30,
        life: 0.6,
        size: rand(2, 4),
        col: "#9aff5a",
        add: true,
      });
  } else e.psn = 0;
  if (e.dead) return;
  if (e.slowT > 0) e.slowT -= dt;
  else e.slowAmt = 0;
  if (e.ccCd > 0) e.ccCd -= dt;
  if (e.shred > 0) e.shred -= dt;
  // 護盾一段時間沒受傷就恢復。
  if (e.shieldMax) {
    e.shieldCd -= dt;
    if (e.shieldCd <= 0)
      e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.35 * dt);
  }
  const d = e.def;
  // 幽靈會週期性隱形，隱形時無法被攻擊。
  if (d.ghost) {
    e.phaseT -= dt;
    if (e.phaseT <= 0) {
      e.phased = !e.phased;
      e.phaseT = e.phased ? 1.4 : 3.2;
    }
  }
  // 治療者會替附近的敵人回復生命。
  if (d.heal) {
    e.healT -= dt;
    if (e.healT <= 0) {
      e.healT = 2.2;
      for (const o of R.enemies)
        if (!o.dead && o !== e && d2(o.x, o.y, e.x, e.y) < 110 * 110) {
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.08);
        }
      fxW.add({
        kind: "ring",
        x: e.x,
        y: e.y,
        r0: 5,
        r1: 110,
        size: 4,
        col: "#ff9ad8",
        life: 0.6,
      });
    }
  }
  // 首領技能。
  if (e.boss) {
    e.abT -= dt;
    if (e.abT <= 0) {
      if (d.shape === "golem") {
        // 石魔像：踩踏使附近的塔暫時失效。
        e.abT = 7;
        shake(8);
        AU.play("stomp");
        fxW.add({
          kind: "ring",
          x: e.x,
          y: e.y,
          r0: 10,
          r1: 170,
          size: 10,
          col: "#d8a060",
          life: 0.7,
          flat: true,
        });
        burst(fxW, e.x, e.y, 30, {
          kind: "shard",
          col: ["#a8845a", "#6a4a2a"],
          add: false,
          g: 400,
          smax: 300,
          szmin: 3,
          szmax: 6,
        });
        for (const t of R.towers)
          if (d2(t.x, t.y, e.x, e.y) < 170 * 170) {
            t.disabled = 2.5;
          }
      } else if (d.shape === "lich") {
        // 巫妖：召喚三隻史萊姆。
        e.abT = 5;
        for (let i = 0; i < 3; i++)
          spawnEnemy({
            type: "slime",
            hpS: e.hpS * 0.7,
            gap: 0,
            d: Math.max(0, e.d - 20 - i * 18),
            aff: null,
          });
        fxW.add({
          kind: "ring",
          x: e.x,
          y: e.y,
          r0: 5,
          r1: 80,
          size: 6,
          col: "#8a5aff",
          life: 0.6,
        });
      } else if (d.shape === "dragon") {
        // 巨龍：短時間衝刺。
        e.abT = 6;
        e.dash = 1.3;
      }
    }
  }
  let sp = e.spd * (1 - e.slowAmt) * (1 - R.mods.enemySlow);
  // 巨龍衝刺。
  if (e.dash > 0) {
    e.dash -= dt;
    sp *= 2.6;
    if (Math.random() < dt * 30)
      fxW.add({
        kind: "glow",
        x: e.x,
        y: e.y,
        life: 0.4,
        size: 20,
        col: "#ff3a5a",
      });
  }
  // 狂暴：加速並免疫控制。
  if (R.enraged) {
    sp *= 1.6;
    e.frozen = 0;
    e.stun = 0;
  }
  // 冰凍與暈眩時不動，緩速時變慢。
  if (e.frozen > 0) {
    e.frozen -= dt;
    sp = 0;
  }
  if (e.stun > 0) {
    e.stun -= dt;
    sp = 0;
  }
  e.d += sp * dt;
  // 走到終點。
  if (e.d >= R.path.len) {
    reachCore(e);
    return;
  }
  const p = posAt(e.d);
  e.x = p.x + p.nx * e.off;
  e.y = p.y + p.ny * e.off;
  e.dir = p.ang;
}
// 敵人抵達主堡：扣生命；生命歸零時結束或復活。
function reachCore(e) {
  e.dead = true;
  const dmg = e.boss ? 6 : e.elite ? 3 : 1;
  R.hp -= dmg;
  R.coreFlash = 1;
  shake(e.boss ? 16 : 7);
  flash(0.25, "#ff2a2a");
  AU.play("hurt");
  floatText(fxW, R.path.core.x, R.path.core.y - 40, `-${dmg} ❤`, "#ff5a5a", 30);
  if (R.hp <= 0) {
    if (R.mods.revive && !R.revived) {
      R.revived = true;
      R.hp = R.maxHp;
      banner("鳳凰涅槃！", "城堡復活並回滿生命", "#ffae3c");
      flash(0.8, "#ffae3c");
      AU.play("fever");
      for (const o of R.enemies)
        if (!o.dead && !o.boss) {
          o.dead = true;
          burst(fxW, o.x, o.y, 8, { col: ["#ffae3c", "#ff5a1f"] });
        }
    } else {
      R.hp = 0;
      R.alive = false;
      R.modals.length = 0;
      R.modal = null;
      R.modals.push({ type: "gameover", t: 0 });
    }
  }
}
// 這個敵人能不能被攻擊。
function targetable(e) {
  return !e.dead && !e.phased;
}
// 暴擊機率。
function critChance(tw) {
  return (
    R.mods.crit +
    luckFactor(getLuck()) * 0.15 +
    (tw && tw.lucky ? 0.15 * R.mods.tileMul : 0) +
    ((tw && tw.st.def && tw.st.def.critAdd) || 0)
  );
}
// 造成傷害；o.dot 是持續傷害，o.pierce 會無視護甲。
function dealDamage(e, amount, tw, o = {}) {
  if (e.dead || amount <= 0) return 0;
  let dmg = amount;
  const st = tw && tw.st;
  // 元素抗性與弱點。
  if (st) {
    let m = 0;
    for (const el of st.els)
      m += e.resist === el ? 0.4 : e.weak === el ? 1.6 : 1;
    dmg *= m / st.els.length;
    if (st.def && st.def.antiAir && e.fly) dmg *= st.def.antiAir;
  }
  if (e.boss || e.elite) dmg *= 1 + R.mods.bossDmg;
  if (e.shred > 0) dmg *= 1 + e.shredAmt;
  let crit = false;
  // 暴擊；有點金手時額外掉金幣。
  if (!o.dot && Math.random() < critChance(tw)) {
    dmg *= 1 + R.mods.critDmg;
    crit = true;
    if (R.mods.midas && Math.random() < R.mods.midas) {
      R.gold += 1;
      fxW.add({
        kind: "coin",
        x: e.x,
        y: e.y,
        vy: -120,
        g: 300,
        life: 0.8,
        size: 7,
        add: false,
        vr: 10,
      });
    }
  }
  // 護甲減傷。
  if (!o.dot && !o.pierce) {
    const armor = e.armor * (e.shred > 0 ? 0.4 : 1);
    dmg = Math.max(dmg * 0.25, dmg - armor);
  }
  // 護盾先吸收傷害。
  if (e.shield > 0) {
    const a = Math.min(e.shield, dmg);
    e.shield -= a;
    dmg -= a;
  }
  e.shieldCd = 3;
  e.hp -= dmg;
  if (!o.dot) e.flash = 0.07;
  if (tw) tw.dmg += dmg;
  if (G.settings.dmgNum && !o.dot && fxW.p.length < 2200 && (crit || dmg > 5)) {
    floatText(
      fxW,
      e.x + rand(-8, 8),
      e.y - e.r - 6,
      fmt(dmg),
      crit ? "#ffe03a" : "rgba(255,255,255,.9)",
      crit ? 24 : 15,
      { life: crit ? 0.9 : 0.6, vy: -70 },
    );
  }
  // 處決：血量低於門檻直接擊殺。
  if (
    R.mods.execute &&
    !e.boss &&
    e.hp > 0 &&
    e.hp < e.maxHp * R.mods.execute
  ) {
    e.hp = 0;
    floatText(fxW, e.x, e.y - 20, "斬殺", "#ff5a5a", 22);
  }
  if (e.hp <= 0) killEnemy(e, tw);
  return dmg;
}
// 擊殺敵人：連殺、金幣、掉落、分裂與死亡效果。
function killEnemy(e, tw) {
  e.dead = true;
  R.stats.kills++;
  R.killCount++;
  R.combo++;
  R.comboT = 2.5;
  R.comboMax = Math.max(R.comboMax, R.combo);
  if (R.combo % 25 === 0) {
    floatText(
      fxW,
      MX + 640,
      MY + 120,
      `${R.combo} 連殺！`,
      rainbow(R.combo * 7),
      46,
      { life: 1.4, vy: -20, force: true },
    );
    AU.play("win", Math.min(8, R.combo / 25));
  }
  const g = Math.max(
    1,
    Math.round(e.gold * GOLD_KILL * (1 + R.mods.gold) * comboMul()),
  );
  // 掉落道具袋。
  if (e.boss || (e.elite && Math.random() < 0.7) || Math.random() < 0.025)
    dropBag(e);
  R.gold += g;
  // 招財貓等塔的額外金幣。
  if (tw && tw.st.def && tw.st.def.killGold) {
    const kg = Math.round(tw.st.def.killGold * tw.tier * (1 + R.wave * 0.05));
    R.gold += kg;
    for (let k = 0; k < 3; k++)
      fxW.add({
        kind: "coin",
        x: e.x,
        y: e.y,
        vx: rand(-90, 90),
        vy: rand(-220, -120),
        g: 500,
        life: 0.8,
        size: 8,
        add: false,
        vr: 12,
      });
  }
  if (tw) tw.kills++;
  const big = e.boss || e.elite;
  burst(fxW, e.x, e.y, big ? 50 : 10, {
    col: [e.def.col, "#ffffff"],
    smax: big ? 420 : 200,
    lmax: big ? 1 : 0.5,
  });
  fxW.add({
    kind: "glow",
    x: e.x,
    y: e.y,
    size: e.r * 2.5,
    col: e.def.col,
    life: 0.3,
  });
  fxW.add({
    kind: "coin",
    x: e.x,
    y: e.y,
    vy: -160,
    g: 420,
    life: 0.7,
    size: big ? 12 : 7,
    add: false,
    vr: 12,
    rot: rand(TAU),
  });
  if (big || g >= 10)
    floatText(fxW, e.x, e.y - 18, "+" + g, "#ffcf3a", big ? 30 : 18);
  if (big) {
    AU.play("bigdie");
    shake(e.boss ? 18 : 8);
    flash(0.3, "#fff2c0");
    if (e.boss) {
      R.gems += 5;
      toast("擊敗首領！+5 💎", "#ffcf3a");
    }
  } else AU.play("die");
  // 分裂者死亡時分成兩個小怪。
  if (e.def.split)
    for (let i = 0; i < 2; i++)
      spawnEnemy({
        type: "mini",
        hpS: e.hpS * (e.elite ? 3 : 1),
        gap: 0,
        d: Math.max(0, e.d + (i ? 10 : -10)),
        aff: e.resist,
      });
  // 擴散：把身上的燃燒與中毒傳給附近的敵人。
  if (e.spread && (e.burnT > 0 || e.psn > 0)) {
    const near = R.enemies
      .filter((o) => !o.dead && o !== e && d2(o.x, o.y, e.x, e.y) < 110 * 110)
      .slice(0, 3);
    for (const o of near) {
      if (e.burnT > 0) {
        o.burnT = Math.max(o.burnT, 2.5);
        o.burnDps = Math.max(o.burnDps, e.burnDps);
        o.burnSrc = e.burnSrc;
      }
      if (e.psn > 0) {
        o.psn = Math.max(o.psn, e.psn);
        o.psnDps = Math.max(o.psnDps, e.psnDps);
        o.psnT = 3;
        o.psnSrc = e.psnSrc;
      }
      o.spread = e.spread;
      fxW.add({
        kind: "bolt",
        pts: boltPts(e.x, e.y, o.x, o.y, 6),
        col: "#9aff3a",
        size: 1.5,
        life: 0.3,
      });
    }
  }
  // 吸血：每擊殺 40 個敵人回復 1 生命。
  if (R.mods.vamp && R.killCount % 40 === 0 && R.hp < R.maxHp) {
    R.hp++;
    floatText(fxW, R.path.core.x, R.path.core.y - 50, "+1 ❤", "#ff8aa8", 24);
  }
}
// 套用附加效果：燃燒、中毒、緩速、控制、擊退與破甲。
function applyFx(e, tw, dmg, fxo) {
  if (e.dead) return;
  const fx = fxo || tw.st.fx,
    bk = e.boss ? 0.3 : e.elite ? 0.6 : 1;
  if (fx.burn) {
    const dps = dmg * fx.burn.dps;
    if (dps >= e.burnDps || e.burnT <= 0) {
      e.burnDps = dps;
      e.burnSrc = tw;
    }
    e.burnT = fx.burn.dur;
  }
  if (fx.poison) {
    e.psn = Math.min(e.psn + 1, Math.round(fx.poison.max));
    e.psnDps = Math.max(e.psnT > 0 ? e.psnDps : 0, dmg * fx.poison.dps * 0.5);
    e.psnT = fx.poison.dur;
    e.psnSrc = tw;
  }
  if (fx.slow) {
    const a = Math.min(0.8, fx.slow.amt) * (e.boss ? 0.6 : 1);
    if (a >= e.slowAmt || e.slowT <= 0) e.slowAmt = a;
    e.slowT = fx.slow.dur;
  }
  // 控制效果有冷卻時間，避免一直被定住。
  if (e.ccCd <= 0 && !R.enraged) {
    let cc = 0;
    if (fx.stun && Math.random() < fx.stun.chance)
      cc = Math.max(cc, fx.stun.dur * bk);
    if (fx.shock && Math.random() < fx.shock.chance)
      cc = Math.max(cc, fx.shock.dur * bk);
    if (cc > 0) {
      e.stun = Math.max(e.stun, cc);
      e.ccCd = cc + 0.7;
    }
    if (fx.freeze && Math.random() < fx.freeze.chance && e.frozen <= 0) {
      e.frozen = fx.freeze.dur * bk;
      e.ccCd = e.frozen + 0.7;
      burst(fxW, e.x, e.y, 8, {
        kind: "shard",
        col: ["#bfefff", "#ffffff"],
        add: false,
        smax: 140,
      });
    }
  }
  if (fx.knock && !e.fly && !e.boss && !R.enraged && e.knockTotal < 200) {
    const k = Math.min(200 - e.knockTotal, fx.knock.dist * (e.elite ? 0.5 : 1));
    e.knockTotal += k;
    e.d = Math.max(0, e.d - k);
  }
  if (fx.shred) {
    e.shred = fx.shred.dur;
    e.shredAmt = Math.max(e.shredAmt, fx.shred.amt);
  }
  if (fx.spread) e.spread = tw;
}
// 塔命中敵人：計算幸運格與輔助加成後造成傷害。
function hitEnemy(e, tw, dmg, fxo, o) {
  if (tw.lucky) dmg *= 1 + 0.2 * R.mods.tileMul;
  if (tw.bD) dmg *= 1 + tw.bD;
  dealDamage(e, dmg, tw, o || {});
  applyFx(e, tw, dmg, fxo);
}

// ===== 塔 =====
function makeTower(key, tier, gx, gy) {
  // 一座防禦塔的資料：種類、星級、格子位置、畫面位置、冷卻與朝向等。
  const t = {
    key,
    tier,
    gx,
    gy,
    x: MX + gx * TS + TS / 2,
    y: MY + gy * TS + TS / 2,
    cd: rand(0.3),
    ang: -Math.PI / 2,
    kills: 0,
    dmg: 0,
    target: "first",
    lucky: R.lucky.has(gx + "," + gy),
    beams: [],
    beamT: 0,
    fxT: 0,
    disabled: 0,
    pop: 1,
    recoil: 0,
    id: ++R.uid,
  };
  t.st = calcStats(key, tier, R.mods);
  discover(key);
  return t;
}
// 在格子上放置一座塔。
function placeTower(key, tier, gx, gy) {
  const t = makeTower(key, tier, gx, gy);
  R.towers.push(t);
  R.grid[gx + "," + gy] = t;
  AU.play("place");
  burst(fxW, t.x, t.y + 10, 16, {
    kind: "dot",
    col: ["#ffffff", ELEM[elemsOf(key)[0]].c],
    smax: 160,
    add: true,
  });
  fxW.add({
    kind: "ring",
    x: t.x,
    y: t.y + 8,
    r0: 10,
    r1: 40,
    size: 4,
    col: "#ffffff",
    life: 0.4,
    flat: true,
  });
  return t;
}
// 移除一座塔。
function removeTower(t) {
  R.towers = R.towers.filter((o) => o !== t);
  delete R.grid[t.gx + "," + t.gy];
  if (R.sel === t) R.sel = null;
}
// 範圍內可以攻擊的敵人。
function enemiesInRange(x, y, r) {
  const out = [];
  for (const e of R.enemies)
    if (targetable(e) && d2(x, y, e.x, e.y) < (r + e.r) * (r + e.r))
      out.push(e);
  return out;
}
// 依設定的優先順序排序：最前面、最後面、血量高低等。
function prioritize(t, list) {
  const m = t.target;
  if (m === "first") list.sort((a, b) => b.d - a.d);
  else if (m === "last") list.sort((a, b) => a.d - b.d);
  else if (m === "strong") list.sort((a, b) => b.hp - a.hp);
  else list.sort((a, b) => d2(t.x, t.y, a.x, a.y) - d2(t.x, t.y, b.x, b.y));
  return list;
}
// 更新一座塔：冷卻、瞄準與攻擊。
function updTower(t, dt) {
  // 開火後的放大與後座力慢慢恢復；四星以上的塔周圍偶爾冒出星光。
  if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 2.5);
  if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
  // 被首領踩踏後暫時失效。
  if (t.disabled > 0) {
    t.disabled -= dt;
    t.beams = [];
    return;
  }
  if (t.tier >= 4 && Math.random() < dt * (t.tier - 3) * 3)
    fxW.add({
      kind: "star",
      x: t.x + rand(-22, 22),
      y: t.y + rand(-10, 14),
      vy: rand(-60, -25),
      life: rand(0.7, 1.3),
      size: rand(3, 4 + t.tier),
      col: t.tier >= 6 ? rainbow(rand(360)) : TIER_COL[t.tier],
      twinkle: true,
    });
  // s 是這座塔的能力表；冷卻時間往下數（有戰鼓加成時數得更快）。四星以上有額外
  // 技能。
  const s = t.st;
  t.cd -= dt * (1 + (t.bR || 0));
  if (t.tier >= 4 && s.mode !== "eco" && s.mode !== "support")
    towerSkills(t, dt);
  // 經濟塔不攻擊（只產生金幣）。
  if (s.mode === "eco") return;
  // 輔助塔與產金塔不會攻擊。
  if (s.mode === "support") {
    if (Math.random() < dt * 2)
      fxW.add({
        kind: "ring",
        x: t.x,
        y: t.y,
        r0: 10,
        r1: s.range,
        size: 3,
        col: "#c868ff",
        life: 0.9,
        flat: true,
        a: 0.5,
      });
    return;
  }
  // 緩速力場：範圍內的敵人持續減速。
  if (s.mode === "aura") {
    for (const e of enemiesInRange(t.x, t.y, s.range)) {
      const a = s.slow * (e.boss ? 0.5 : 1);
      if (a >= e.slowAmt || e.slowT <= 0) e.slowAmt = a;
      e.slowT = Math.max(e.slowT, 0.25);
    }
    if (t.cd <= 0) {
      t.cd = 1 / s.rate;
      for (const e of enemiesInRange(t.x, t.y, s.range)) hitEnemy(e, t, s.dmg);
    }
    return;
  }
  // 拉霸塔：每 10 秒開一次獎，攻擊範圍內所有敵人。
  if (s.def && s.def.slotT) {
    t.jpT = (t.jpT ?? 10) - dt;
    // 拉霸塔：每 10 秒對範圍內所有敵人打出 6 倍傷害（777！）。
    if (t.jpT <= 0) {
      const hs = enemiesInRange(t.x, t.y, s.range);
      if (hs.length) {
        t.jpT = 10;
        for (const e of hs) hitEnemy(e, t, s.dmg * 6);
        floatText(fxW, t.x, t.y - 60, "777!!", "#ff3a3a", 34, { force: true });
        fxW.add({
          kind: "ring",
          x: t.x,
          y: t.y,
          r0: 10,
          r1: s.range,
          size: 14,
          col: "#ffcf3a",
          life: 0.6,
          force: true,
        });
        fxW.add({
          kind: "pillar",
          x: t.x,
          y: t.y + 10,
          size: 30,
          h: 400,
          col: "#ff3a3a",
          life: 0.7,
          force: true,
        });
        shake(6);
        AU.play("lottoHit");
      } else t.jpT = 0.5;
    }
  }
  // 範圍脈衝。
  if (s.mode === "pulse") {
    // 範圍脈衝塔：冷卻好了就對射程內所有敵人造成傷害。
    if (t.cd <= 0) {
      const hits = enemiesInRange(t.x, t.y, s.range);
      if (hits.length) {
        t.cd = 1 / s.rate;
        for (const e of hits) hitEnemy(e, t, s.dmg);
        const cols = s.els.map((e) => ELEM[e].c);
        fxW.add({
          kind: "ring",
          x: t.x,
          y: t.y,
          r0: 10,
          r1: s.range,
          size: 6 + t.tier * 2,
          col: cols[0],
          life: 0.5,
        });
        fxW.add({
          kind: "ring",
          x: t.x,
          y: t.y,
          r0: 5,
          r1: s.range * 0.8,
          size: 6,
          col: cols[cols.length - 1],
          life: 0.6,
        });
        fxW.add({
          kind: "glow",
          x: t.x,
          y: t.y,
          size: s.range * 0.7,
          col: cols[0],
          life: 0.35,
          a: 0.5,
        });
        AU.play("shoot", "pulse");
      }
    }
    return;
  }
  // 持續光束：照越久傷害越高。
  if (s.mode === "beam") {
    const R2 = s.range;
    // 光束塔：保持鎖定射程內的敵人，持續造成傷害；鎖定越久傷害越高（ramp）。
    t.beams = t.beams.filter(
      (e) => targetable(e) && d2(t.x, t.y, e.x, e.y) < (R2 + e.r) ** 2,
    );
    if (t.beams.length < s.beams) {
      const cand = prioritize(
        t,
        enemiesInRange(t.x, t.y, R2).filter((e) => !t.beams.includes(e)),
      );
      while (t.beams.length < s.beams && cand.length)
        t.beams.push(cand.shift());
    }
    if (!t.beams.length) {
      t.beamT = Math.max(0, t.beamT - dt * 3);
      return;
    }
    t.beamT += dt;
    const ramp = 1 + Math.min(t.beamT, 3) * 0.5;
    t.fxT -= dt;
    const doFx = t.fxT <= 0;
    if (doFx) t.fxT = 0.5;
    for (const e of t.beams) {
      let dmg = s.dmg * s.rate * dt * ramp;
      if (t.lucky) dmg *= 1 + 0.2 * R.mods.tileMul;
      dealDamage(e, dmg, t, { dot: !doFx });
      if (doFx) applyFx(e, t, s.dmg * 0.5);
      if (Math.random() < dt * 20)
        fxW.add({
          kind: "glow",
          x: e.x + rand(-6, 6),
          y: e.y + rand(-6, 6),
          size: rand(8, 14),
          col: elemCol(t.key, randi(0, 2), G.time),
          life: 0.25,
        });
    }
    t.ang = Math.atan2(t.beams[0].y - t.y, t.beams[0].x - t.x);
    AU.play("shoot", "beam");
    return;
  }
  // 一般塔：找出射程內的敵人，依優先順序挑第一個當目標，慢慢轉向它。
  const cand = enemiesInRange(t.x, t.y, s.range);
  if (!cand.length) return;
  prioritize(t, cand);
  const tg = cand[0];
  const ta = Math.atan2(tg.y - t.y, tg.x - t.x);
  let da = ((ta - t.ang + Math.PI * 3) % TAU) - Math.PI;
  t.ang += da * Math.min(1, dt * 14);
  // 冷卻好了就開火，產生後座力與槍口閃光。
  if (t.cd > 0) return;
  t.cd = 1 / s.rate;
  t.recoil = 1;
  // ★3 以上有機率連續攻擊。
  if (t.tier >= 3 && Math.random() < 0.25) {
    t.cd = 0.09;
    if (Math.random() < 0.3)
      floatText(fxW, t.x, t.y - 46, "連擊", TIER_COL[t.tier], 16, {
        life: 0.5,
      });
  }
  const col = elemCol(t.key, 0, G.time),
    mx = t.x + Math.cos(t.ang) * 22,
    my = t.y - 14 + Math.sin(t.ang) * 22;
  fxW.add({ kind: "glow", x: mx, y: my, size: 16, col, life: 0.12 });
  // 依攻擊方式發射：狙擊（打血最多的）、子彈、拋物線砲彈、連鎖閃電、雷射等。
  if (s.mode === "snipe") {
    // 狙擊：全場優先攻擊血量最高的敵人。
    const tgt =
      R.enemies
        .filter(
          (e) => targetable(e) && d2(t.x, t.y, e.x, e.y) < (s.range + e.r) ** 2,
        )
        .sort((a, b) => b.hp - a.hp)[0] || tg;
    t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
    hitEnemy(tgt, t, s.dmg, null, { pierce: true });
    fxW.add({
      kind: "line",
      x: mx,
      y: my,
      x2: tgt.x,
      y2: tgt.y,
      col: "#ffffff",
      size: 2 + t.tier * 0.6,
      life: 0.18,
    });
    fxW.add({
      kind: "glow",
      x: tgt.x,
      y: tgt.y,
      size: 30,
      col: "#ffe080",
      life: 0.2,
    });
    AU.play("shoot", "rail");
  } else if (s.mode === "bullet") {
    // 單發彈。
    let fxo = null,
      c2 = col;
    if (s.def && s.def.slotT) {
      const el = pick(["fire", "ice", "thunder"]);
      fxo = BASE[el].fx;
      c2 = ELEM[el].c;
    }
    shoot(t, tg, mx, my, c2, 0, fxo);
    AU.play("shoot", s.els[0]);
  } else if (s.mode === "multi") {
    // 多重射擊。
    for (let i = 0; i < s.shots; i++) {
      let fxo = null,
        c2 = elemCol(t.key, i, G.time);
      if (s.def && s.def.roul) {
        const el = pick(EK);
        fxo = BASE[el].fx;
        c2 = ELEM[el].c;
      }
      shoot(
        t,
        cand[i % cand.length],
        mx,
        my,
        c2,
        (i - (s.shots - 1) / 2) * 0.25,
        fxo,
      );
    }
    AU.play("shoot", s.els.includes("wind") ? "wind" : s.els[0]);
  } else if (s.mode === "mortar") {
    // 拋射砲：預判敵人的位置。
    const lead = posAt(
      Math.min(
        R.path.len,
        tg.d +
          tg.spd *
            (1 - tg.slowAmt) *
            0.7 *
            (tg.stun > 0 || tg.frozen > 0 ? 0 : 1),
      ),
    );
    const dv = s.def && s.def.dice ? randi(1, 6) : 0;
    if (dv)
      floatText(
        fxW,
        t.x,
        t.y - 50,
        "🎲 " + dv,
        dv === 6 ? "#ff3a3a" : "#ffffff",
        dv === 6 ? 28 : 20,
        { life: 0.7 },
      );
    R.proj.push({
      kind: "shell",
      x0: mx,
      y0: my,
      x: mx,
      y: my,
      tx: lead.x + tg.off * lead.nx,
      ty: lead.y + tg.off * lead.ny,
      t: 0,
      T: 0.75,
      tw: t,
      dmg: s.dmg * (dv || 1),
      dice: dv,
      col,
      h: 120 + rand(40) + t.tier * 15,
      tier: t.tier,
    });
    AU.play("shoot", "earth");
  } else if (s.mode === "chain") {
    // 連鎖閃電。
    const hit = [tg];
    let cur = tg;
    // 連鎖閃電：從第一個目標跳到最近的下一個，最多跳 chain 次。
    for (let k = 1; k < s.chain; k++) {
      let best = null,
        bd = 130 * 130 * (s.range > 170 ? 1.6 : 1);
      for (const e of R.enemies) {
        if (!targetable(e) || hit.includes(e)) continue;
        const dd = d2(cur.x, cur.y, e.x, e.y);
        if (dd < bd) {
          bd = dd;
          best = e;
        }
      }
      if (!best) break;
      hit.push(best);
      cur = best;
    }
    let px = t.x,
      py = t.y - 26;
    hit.forEach((e, i) => {
      fxW.add({
        kind: "bolt",
        pts: boltPts(px, py, e.x, e.y, 10 + t.tier * 2),
        col: elemCol(t.key, i, G.time),
        size: 1.2 + t.tier * 0.45,
        life: 0.16 + t.tier * 0.02,
      });
      fxW.add({
        kind: "glow",
        x: e.x,
        y: e.y,
        size: 22,
        col: elemCol(t.key, 0, G.time),
        life: 0.2,
      });
      hitEnemy(e, t, s.dmg * Math.pow(0.85, i));
      px = e.x;
      py = e.y;
    });
    AU.play("shoot", "thunder");
  } else if (s.mode === "rail") {
    // 貫穿軌道砲。
    const L = s.range * 1.6,
      dx = Math.cos(t.ang),
      dy = Math.sin(t.ang);
    // 雷射：一直線打穿路上的所有敵人。
    const x1 = t.x + dx * 20,
      y1 = t.y - 14 + dy * 20,
      x2 = x1 + dx * L,
      y2 = y1 + dy * L;
    for (const e of R.enemies) {
      if (e.dead) continue;
      const px = e.x - x1,
        py = e.y - y1,
        proj = px * dx + py * dy;
      if (proj < 0 || proj > L) continue;
      const perp = Math.abs(px * dy - py * dx);
      if (perp < e.r + 12) hitEnemy(e, t, s.dmg * (t.flush ? 5 : 1));
    }
    if (s.def && s.def.ace) {
      t.flush = Math.random() < 0.12;
      if (t.flush) {
        floatText(fxW, t.x, t.y - 60, "同花順！×5", "#ffcf3a", 26, {
          force: true,
        });
        flash(0.15, "#ffcf3a");
      }
    }
    fxW.add({
      kind: "line",
      x: x1,
      y: y1,
      x2,
      y2,
      col,
      size: 4 + t.tier * 1.6,
      life: 0.3 + t.tier * 0.04,
    });
    for (let i = 0; i < 12; i++) {
      const k = Math.random();
      fxW.add({
        kind: "glow",
        x: lerp(x1, x2, k),
        y: lerp(y1, y2, k),
        size: rand(8, 16),
        col,
        life: 0.4,
        vx: rand(-30, 30),
        vy: rand(-30, 30),
      });
    }
    shake(3);
    AU.play("shoot", "rail");
  }
}
// 射出一發子彈。
function shoot(t, tg, x, y, col, spread = 0, fxo = null) {
  R.proj.push({
    kind: "bullet",
    fxo,
    x,
    y,
    tg,
    tx: tg.x,
    ty: tg.y,
    spd: t.st.speed,
    tw: t,
    dmg: t.st.dmg,
    col,
    life: 2.5,
    splash: t.st.splash,
    vx: 0,
    vy: 0,
    spread,
    trail: 0,
    tier: t.tier,
  });
}
// 範圍傷害；src 是已經被直接命中的敵人。
function splashAt(x, y, r, tw, dmg, src) {
  for (const e of R.enemies)
    if (!e.dead && e !== src && d2(x, y, e.x, e.y) < (r + e.r) ** 2)
      hitEnemy(e, tw, dmg);
}
// 更新所有飛行物。
function updProj(dt) {
  // 更新每一顆投射物：子彈會追著目標飛，砲彈依拋物線落地後爆炸。
  for (const p of R.proj) {
    if (p.kind === "bullet") {
      p.life -= dt;
      if (p.tg && !p.tg.dead) {
        p.tx = p.tg.x;
        p.ty = p.tg.y;
      }
      // dx、dy 是到目標的距離；夠近就算打中。
      const dx = p.tx - p.x,
        dy = p.ty - p.y,
        dist = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx);
      // 散射的子彈先偏開，再逐漸轉回目標。
      if (p.spread) {
        a += p.spread * Math.min(1, dist / 200);
      }
      p.vx = Math.cos(a) * p.spd;
      p.vy = Math.sin(a) * p.spd;
      const st = p.spd * dt;
      p.trail -= dt;
      // 飛行中留下光點尾巴。
      if (p.trail <= 0) {
        p.trail = 0.03 - p.tier * 0.003;
        fxW.add({
          kind: "glow",
          x: p.x,
          y: p.y,
          size: 5 + p.tier * 2,
          col: p.tier >= 6 ? rainbow(G.time * 400) : p.col,
          life: 0.18 + p.tier * 0.04,
        });
      }
      // 命中：造成傷害與爆炸。
      if (dist <= st + (p.tg && !p.tg.dead ? p.tg.r * 0.5 : 2)) {
        p.dead = true;
        const alive = p.tg && !p.tg.dead;
        if (alive) hitEnemy(p.tg, p.tw, p.dmg, p.fxo);
        if (p.splash) {
          splashAt(
            p.tx,
            p.ty,
            p.splash,
            p.tw,
            p.dmg * 0.5,
            alive ? p.tg : null,
          );
          fxW.add({
            kind: "glow",
            x: p.tx,
            y: p.ty,
            size: p.splash * (1 + p.tier * 0.1),
            col: p.col,
            life: 0.25,
          });
          burst(fxW, p.tx, p.ty, 4 + p.tier * 2, {
            col: [p.col, "#ffffff"],
            smax: 140 + p.tier * 30,
            lmax: 0.35,
          });
        } else {
          fxW.add({
            kind: "glow",
            x: p.tx,
            y: p.ty,
            size: 12 + p.tier * 4,
            col: p.col,
            life: 0.15,
          });
          if (p.tier >= 3)
            burst(fxW, p.tx, p.ty, p.tier, {
              col: [p.col, "#ffffff"],
              smax: 160,
              lmax: 0.3,
            });
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.life <= 0) p.dead = true;
    } else if (p.kind === "shell") {
      p.t += dt;
      const k = Math.min(1, p.t / p.T);
      p.x = lerp(p.x0, p.tx, k);
      p.y = lerp(p.y0, p.ty, k) - Math.sin(k * Math.PI) * p.h;
      if (k >= 1) {
        p.dead = true;
        const s = p.tw.st,
          big = p.dice === 6;
        splashAt(p.tx, p.ty, s.splash * (big ? 2 : 1), p.tw, p.dmg, null);
        if (big) {
          fxW.add({
            kind: "ring",
            x: p.tx,
            y: p.ty,
            r0: 10,
            r1: s.splash * 2,
            size: 12,
            col: "#ff3a3a",
            life: 0.5,
            force: true,
          });
          shake(6);
        }
        fxW.add({
          kind: "glow",
          x: p.tx,
          y: p.ty,
          size: s.splash * 1.4,
          col: p.col,
          life: 0.35,
        });
        fxW.add({
          kind: "ring",
          x: p.tx,
          y: p.ty,
          r0: 8,
          r1: s.splash,
          size: 6,
          col: "#ffffff",
          life: 0.35,
          flat: true,
        });
        burst(fxW, p.tx, p.ty, 14, {
          kind: "shard",
          col: ["#8a6a4a", "#5a4030", p.col],
          add: false,
          g: 500,
          smin: 80,
          smax: 260,
          szmin: 2,
          szmax: 5,
        });
        if (s.fx.pool)
          R.zones.push({
            x: p.tx,
            y: p.ty,
            r: s.fx.pool.r * (1 + R.mods.splash),
            t: s.fx.pool.dur,
            T: s.fx.pool.dur,
            dps: p.dmg * s.fx.pool.dps,
            tw: p.tw,
            col: p.tw.st.els.includes("poison") ? "#7cf03a" : "#ff6a1a",
            tick: 0,
          });
        shake(2);
        AU.play("boom");
      }
    }
  }
  // 移除已經打中或消失的投射物。
  if (R.proj.some((p) => p.dead)) R.proj = R.proj.filter((p) => !p.dead);
}
// 地面區域：站在上面的敵人持續受傷。
function updZones(dt) {
  for (const z of R.zones) {
    z.t -= dt;
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.5;
      for (const e of R.enemies)
        if (!e.dead && !e.fly && d2(z.x, z.y, e.x, e.y) < (z.r + e.r) ** 2) {
          dealDamage(e, z.dps * 0.5, z.tw, { dot: true });
          const fx = z.tw.st.fx;
          if (fx.burn) {
            e.burnT = Math.max(e.burnT, 1);
            e.burnDps = Math.max(e.burnDps, z.dps * 0.3);
            e.burnSrc = z.tw;
          }
          if (fx.poison) {
            e.psn = Math.min(Math.round(fx.poison.max), e.psn + 1);
            e.psnDps = Math.max(e.psnDps, z.dps * 0.2);
            e.psnT = 2;
            e.psnSrc = z.tw;
          }
          if (fx.slow) {
            e.slowAmt = Math.max(e.slowAmt, fx.slow.amt * 0.7);
            e.slowT = 0.6;
          }
        }
    }
    if (Math.random() < dt * 8)
      fxW.add({
        kind: "glow",
        x: z.x + rand(-z.r, z.r) * 0.7,
        y: z.y + rand(-z.r, z.r) * 0.4,
        vy: -30,
        size: rand(6, 12),
        col: z.col,
        life: 0.6,
      });
  }
  if (R.zones.some((z) => z.t <= 0)) R.zones = R.zones.filter((z) => z.t > 0);
}

// ===== 放置 / 合成 / 出售 =====
// 畫布座標換成格子座標；不在地圖上時回傳 null。
function tileAt(x, y) {
  const gx = Math.floor((x - MX) / TS),
    gy = Math.floor((y - MY) / TS);
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return null;
  return { gx, gy };
}
// 這一格能不能建造。
function canBuild(gx, gy) {
  const k = gx + "," + gy;
  return !R.path.cells.has(k) && !R.path.deco.has(k) && !R.grid[k];
}
// 是否在出售區裡。
function inTrash(x, y) {
  return (
    x >= TRASH.x &&
    x <= TRASH.x + TRASH.w &&
    y >= TRASH.y &&
    y <= TRASH.y + TRASH.h
  );
}
// 滑鼠位置上的塔卡編號；沒有則回傳 -1。
function handIndexAt(x, y) {
  const g = slotAt(x, y);
  if (!g) return -1;
  const cd = g.hand.find((q) => q.anim >= 1);
  return cd ? R.hand.indexOf(cd) : -1;
}
// 把備戰區的卡合進地圖上的塔（升星或融合，付費）
function mergeIntoTower(idx, tw) {
  const c = R.hand[idx],
    res = fuseResult(c, tw);
  if (!res) {
    toast(
      tw.tier !== c.tier
        ? "星級不同，無法合成（要同星級）"
        : "這個組合無法合成",
      "#ff8a8a",
    );
    AU.play("error");
    return false;
  }
  if (!payMerge(res, c.tier)) return false;
  const k0 = [c.key, tw.key],
    t0 = c.tier;
  const f = applyFuse(tw, res);
  tw.key = f.key;
  tw.tier = f.tier;
  tw.st = calcStats(tw.key, tw.tier, R.mods);
  tw.pop = 1;
  tw.beams = [];
  discover(f.key);
  fuseFx(tw.x, tw.y, f.key, f.type, f.tier);
  R.hand.splice(idx, 1);
  R.selCard = -1;
  if (R.tab === "battle") R.sel = tw;
  else if (R.phase !== "wave")
    R.modals.push(
      f.type === "fuse"
        ? { type: "tierup", key: f.key, from: t0, to: f.tier, fuse: k0, t: 0 }
        : { type: "tierup", key: f.key, from: t0, to: f.tier, t: 0 },
    );
  return true;
}
// 套用合成結果；有賢者之石時可能再多升一星。
function applyFuse(target, res) {
  let tier = res.tier;
  if (R.mods.stone && Math.random() < R.mods.stone && tier < MAX_TIER) {
    tier++;
    toast("💎 賢者之石發動！額外升一星", "#c868ff");
  }
  return { key: res.key, tier, type: res.type };
}
// 合成與升星的特效。
function fuseFx(x, y, key, type, tier = 2) {
  // 合成或升星時的特效：cols 是元素顏色，tc 是星級顏色；放出碎片、光環、光柱與
  // 星星。
  const cols = elemsOf(key).map((e) => ELEM[e].c),
    tc = TIER_COL[tier];
  burst(fxW, x, y, 24 + tier * 10, {
    col: [...cols, "#ffffff", tc],
    smax: 220 + tier * 50,
    lmax: 0.9,
    force: true,
  });
  fxW.add({
    kind: "ring",
    x,
    y,
    r0: 5,
    r1: 60 + tier * 15,
    size: 6 + tier,
    col: tc,
    life: 0.55,
    force: true,
  });
  fxW.add({
    kind: "ring",
    x,
    y: y + 10,
    r0: 5,
    r1: 80 + tier * 18,
    size: 5,
    col: "#ffffff",
    life: 0.7,
    flat: true,
    force: true,
  });
  fxW.add({
    kind: "glow",
    x,
    y,
    size: 90 + tier * 15,
    col: cols[0],
    life: 0.5,
    force: true,
  });
  fxW.add({
    kind: "pillar",
    x,
    y: y + 14,
    size: 14 + tier * 4,
    h: 200 + tier * 60,
    col: tier >= 6 ? "#ff6aff" : tc,
    life: 0.7 + tier * 0.12,
    force: true,
  });
  for (let i = 0; i < 4 + tier * 2; i++)
    fxW.add({
      kind: "star",
      x: x + rand(-30, 30),
      y: y + rand(-50, 10),
      vy: rand(-140, -50),
      life: rand(0.6, 1.2),
      size: rand(6, 10 + tier),
      col: "#fff",
      twinkle: true,
      force: true,
    });
  // 跳出「融合！」或「★幾 稱號！」的文字，播放音效；五星以上畫面震動並閃光。
  const label =
    type === "fuse"
      ? `融合！${towerName(key)}`
      : `★${tier} ${TIER_NAME[tier]}！`;
  floatText(
    fxW,
    x,
    y - 56,
    label,
    type === "fuse" ? "#ff9af0" : tc,
    22 + tier * 3,
    { life: 1.4, vy: -40, force: true },
  );
  AU.play(type === "fuse" ? "fuse" : "merge");
  AU.play("tierUp", tier);
  if (tier >= 5) {
    shake(4 + tier);
    flash(0.25, tc);
  }
  // 記錄合成與升星次數（結算時顯示）。
  if (type === "fuse") {
    R.stats.fusions++;
    shake(4);
  } else R.stats.merges++;
}
// 放開塔卡：出售、合成或放到地圖上。
function dropCard(idx, x, y) {
  // 把手牌拖放到某個位置：拖到垃圾桶就賣掉。
  const c = R.hand[idx];
  if (!c) return;
  if (inTrash(x, y)) {
    sellCard(idx);
    return;
  }
  // 放到備戰區的格子：空格就放進去，有同樣的塔就嘗試合成（要同星級）。
  const g = slotAt(x, y);
  // 放在另一張塔卡上：嘗試合成。
  if (g) {
    if (g.key === c.key && g.tier === c.tier) return;
    const o = g.hand.find((q) => q.anim >= 1);
    if (!o) {
      if (g.map.length) mergeIntoTower(idx, g.map[0]);
      return;
    }
    const res = fuseResult(c, o);
    if (!res) {
      toast(
        c.tier !== o.tier
          ? "星級不同，無法合成（要同星級）"
          : "這兩張塔卡無法合成（要同一種塔，或可以融合的元素塔）",
        "#ff8a8a",
      );
      AU.play("error");
      return;
    }
    if (!payMerge(res, c.tier)) return;
    const k0 = [c.key, o.key],
      t0 = c.tier;
    const f = applyFuse(o, res);
    o.key = f.key;
    o.tier = f.tier;
    o.anim = 0.6;
    R.hand.splice(idx, 1);
    const p = handPos(R.hand.indexOf(o));
    discover(f.key);
    if (p)
      burst(fxU, p.x + CARD_W / 2, p.y + CARD_H / 2, 30, {
        col: ["#ffffff", TIER_COL[f.tier]],
        smax: 260,
      });
    AU.play(f.type === "fuse" ? "fuse" : "merge");
    if (f.type === "fuse") R.stats.fusions++;
    else R.stats.merges++;
    if (R.phase === "wave")
      toast(
        `${f.type === "fuse" ? "融合" : "升星"}：${towerName(f.key)} ★${f.tier}`,
        TIER_COL[f.tier],
      );
    else
      R.modals.push(
        f.type === "fuse"
          ? { type: "tierup", key: f.key, from: t0, to: f.tier, fuse: k0, t: 0 }
          : { type: "tierup", key: f.key, from: t0, to: f.tier, t: 0 },
      );
    R.selCard = -1;
    return;
  }
  // 放到戰場上：空地就蓋塔，上面已經有塔就嘗試合成。
  if (R.tab !== "battle") return;
  const tl = tileAt(x, y);
  if (!tl) return;
  const tw = R.grid[tl.gx + "," + tl.gy];
  if (tw) mergeIntoTower(idx, tw);
  else if (canBuild(tl.gx, tl.gy)) {
    R.sel = placeTower(c.key, c.tier, tl.gx, tl.gy);
    R.hand.splice(idx, 1);
    R.selCard = -1;
  } else {
    toast("道路上不能建造", "#ff8a8a");
    AU.play("error");
  }
}
// 放開地圖上的塔：出售、合成或移動。
function dropTower(t, x, y) {
  if (inTrash(x, y)) {
    sellTower(t);
    return;
  }
  const tl = tileAt(x, y);
  if (!tl || (tl.gx === t.gx && tl.gy === t.gy)) return;
  const o = R.grid[tl.gx + "," + tl.gy];
  if (o) {
    const res = fuseResult(t, o);
    if (!res) {
      toast(
        o.tier !== t.tier ? "星級不同，無法合成" : "這個組合無法合成",
        "#ff8a8a",
      );
      AU.play("error");
      return;
    }
    if (!payMerge(res, t.tier)) return;
    const f = applyFuse(o, res);
    removeTower(t);
    o.key = f.key;
    o.tier = f.tier;
    o.st = calcStats(o.key, o.tier, R.mods);
    o.pop = 1;
    o.beams = [];
    o.kills += t.kills;
    o.dmg += t.dmg;
    discover(f.key);
    fuseFx(o.x, o.y, f.key, f.type, f.tier);
    R.sel = o;
  } else if (canBuild(tl.gx, tl.gy)) {
    delete R.grid[t.gx + "," + t.gy];
    t.gx = tl.gx;
    t.gy = tl.gy;
    t.x = MX + t.gx * TS + TS / 2;
    t.y = MY + t.gy * TS + TS / 2;
    t.lucky = R.lucky.has(t.gx + "," + t.gy);
    R.grid[t.gx + "," + t.gy] = t;
    t.pop = 0.6;
    t.beams = [];
    AU.play("place");
  }
}
// 出售一座塔。
function sellTower(t) {
  const v = Math.round(cardValue(t.key, t.tier) * 0.8);
  R.gold += v;
  removeTower(t);
  floatText(fxW, t.x, t.y - 20, "+" + v, "#ffcf3a", 26);
  burst(fxW, t.x, t.y, 20, { col: ["#ffcf3a", "#ffffff"] });
  AU.play("sell");
}
// 出售一張塔卡。
function sellCard(idx) {
  const c = R.hand[idx];
  const v = cardValue(c.key, c.tier);
  R.gold += v;
  R.hand.splice(idx, 1);
  R.selCard = -1;
  floatText(fxU, TRASH.x + TRASH.w / 2, TRASH.y - 10, "+" + v, "#ffcf3a", 26);
  AU.play("sell");
}
// 花金幣購買幸運。
function buyLuck() {
  const cost = luckCost();
  if (R.gold < cost) {
    toast("金幣不足", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.gold -= cost;
  R.luck += 3;
  R.luckBuys++;
  AU.play("gem");
  floatText(fxU, 1810, 1000, "幸運 +3", "#5affaa", 24);
}
// 購買幸運的費用；買越多越貴。
function luckCost() {
  return 40 + R.luckBuys * 30 + R.wave * 4;
}

// ===== 繪製戰場 =====
function drawWorld(c) {
  const t = G.time;
  c.save();
  c.beginPath();
  c.rect(MX, MY, COLS * TS, ROWS * TS);
  c.clip();
  c.drawImage(R.bg, MX, MY, COLS * TS, ROWS * TS);
  drawMapFX(c, t);
  // 幸運格
  // 幸運格。
  for (const k of R.lucky) {
    const [gx, gy] = k.split(",").map(Number),
      x = MX + gx * TS,
      y = MY + gy * TS;
    const p = 0.5 + 0.5 * Math.sin(t * 2 + gx + gy);
    rr(c, x + 4, y + 4, TS - 8, TS - 8, 8);
    c.fillStyle = rgba("#ffcf3a", 0.1 + p * 0.08);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = rgba("#ffe080", 0.45 + p * 0.3);
    c.stroke();
    if (!R.grid[k])
      txt(c, "☘", x + TS / 2, y + TS / 2, {
        size: 22,
        color: rgba("#ffe080", 0.5 + p * 0.3),
      });
    c.globalCompositeOperation = "lighter";
    glow(c, x + TS / 2, y + TS / 2, 36, "#ffcf3a", 0.12 + p * 0.1);
    c.globalCompositeOperation = "source-over";
  }
  // 拖曳時格線
  // 正在拖曳或放置的塔。
  const drag = G.drag && G.drag.moved ? G.drag : null;
  const placing = drag
    ? drag.kind === "card"
      ? R.hand[drag.idx]
      : null
    : R.tab === "battle" && R.selCard >= 0
      ? R.hand[R.selCard]
      : null;
  if (placing) drawPlaceHints(c, placing, false);
  if (drag) {
    for (let gx = 0; gx < COLS; gx++)
      for (let gy = 0; gy < ROWS; gy++) {
        if (R.path.cells.has(gx + "," + gy)) continue;
        c.strokeStyle = "rgba(255,255,255,.08)";
        c.lineWidth = 1;
        c.strokeRect(MX + gx * TS + 0.5, MY + gy * TS + 0.5, TS - 1, TS - 1);
      }
  }
  // 區域
  // 地面區域。
  for (const z of R.zones) {
    const a = Math.min(1, z.t / 0.5) * 0.55;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.beginPath();
    c.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU);
    const g = c.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
    g.addColorStop(0, rgba(z.col, a));
    g.addColorStop(1, rgba(z.col, 0));
    c.fillStyle = g;
    c.fill();
    c.restore();
  }
  drawPortal(
    c,
    R.path.portal.x,
    R.path.portal.y,
    t,
    R.map.theme === "lava" ? "#ff5a1a" : "#b05aff",
  );
  drawCore(
    c,
    R.path.core.x,
    R.path.core.y - 6,
    t,
    R.hp / R.maxHp,
    Math.max(0, R.coreFlash),
  );
  // 選中塔的射程
  const showRange = (tw) => {
    c.save();
    c.beginPath();
    c.arc(tw.x, tw.y, tw.st.range, 0, TAU);
    c.fillStyle = "rgba(255,255,255,.06)";
    c.fill();
    c.setLineDash([8, 6]);
    c.lineDashOffset = -t * 20;
    c.lineWidth = 2;
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.stroke();
    c.restore();
  };
  if (R.sel && !drag) showRange(R.sel);
  const hv = hoverTower();
  if (hv && hv !== R.sel && !drag) showRange(hv);
  // 物件依 Y 排序繪製
  const objs = [];
  // 塔與敵人依前後順序一起畫。
  for (const tw of R.towers) objs.push([tw.y, 0, tw]);
  for (const e of R.enemies) objs.push([e.y + (e.fly ? 40 : 0), 1, e]);
  objs.sort((a, b) => a[0] - b[0]);
  for (const [, k, o] of objs) {
    if (k === 0) {
      if (drag && drag.kind === "tower" && drag.tw === o) {
        c.globalAlpha = 0.35;
      }
      const sc = 1 + o.pop * 0.25 * Math.sin(o.pop * Math.PI);
      drawTower(c, o.key, o.tier, o.x, o.y + 2, sc, t + o.id, o.ang, {
        shots: o.st.shots,
        recoil: o.recoil,
        disabled: o.disabled > 0,
        mode: o.st.mode,
      });
      if (o.disabled > 0) {
        c.save();
        c.fillStyle = "rgba(30,30,45,.5)";
        c.beginPath();
        c.ellipse(o.x, o.y - 6, 30, 34, 0, 0, TAU);
        c.fill();
        c.restore();
        txt(c, "暈", o.x, o.y - 40, {
          size: 16,
          color: "#ffcf3a",
          stroke: "#000",
          sw: 3,
        });
      }
      c.globalAlpha = 1;
    } else drawEnemy(c, o, t);
  }
  // 光束
  c.save();
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";
  for (const tw of R.towers) {
    if (!tw.beams.length) continue;
    const ramp = Math.min(tw.beamT, 3) / 3;
    const sx = tw.x + Math.cos(tw.ang) * 26,
      sy = tw.y - 16 + Math.sin(tw.ang) * 26;
    tw.beams.forEach((e, i) => {
      const col = elemCol(tw.key, i, t);
      const wv =
        (2 + tw.tier * 0.9 + ramp * 5) * (1 + 0.2 * Math.sin(t * 40 + i));
      c.strokeStyle = rgba(col, 0.35);
      c.lineWidth = wv * 2.6;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(e.x, e.y);
      c.stroke();
      c.strokeStyle = rgba(col, 0.9);
      c.lineWidth = wv;
      c.stroke();
      c.strokeStyle = "#ffffff";
      c.lineWidth = wv * 0.35;
      c.stroke();
      glow(c, e.x, e.y, 18 + ramp * 14, col, 0.9);
      glow(c, sx, sy, 14, col, 0.9);
    });
  }
  c.restore();
  // 子彈
  c.save();
  c.globalCompositeOperation = "lighter";
  // 子彈。
  for (const p of R.proj) {
    if (p.kind === "bullet") {
      glow(
        c,
        p.x,
        p.y,
        9 + p.tier * 3,
        p.tier >= 6 ? rainbow(G.time * 500) : p.col,
        1,
      );
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(p.x, p.y, 1.8 + p.tier * 0.5, 0, TAU);
      c.fill();
    }
  }
  c.restore();
  // 拋射中的砲彈與地上的落點。
  for (const p of R.proj) {
    if (p.kind === "shell") {
      const k = p.t / p.T,
        gx = lerp(p.x0, p.tx, k),
        gy = lerp(p.y0, p.ty, k);
      c.fillStyle = "rgba(0,0,0,.3)";
      c.beginPath();
      c.ellipse(gx, gy, 9, 4, 0, 0, TAU);
      c.fill();
      const pr = 6 + (p.tier || 1) * 1.6;
      c.beginPath();
      c.arc(p.x, p.y, pr, 0, TAU);
      const g = c.createRadialGradient(p.x - 3, p.y - 3, 1, p.x, p.y, pr + 1);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, p.col);
      g.addColorStop(
        1,
        mixHex(p.col.length === 7 ? p.col : "#888888", "#000", 0.5),
      );
      c.fillStyle = g;
      c.fill();
      c.globalCompositeOperation = "lighter";
      glow(c, p.x, p.y, 22, p.col, 0.7);
      c.globalCompositeOperation = "source-over";
    }
  }
  drawDrops(c);
  drawAuras(c);
  fxW.draw(c);
  drawCombo(c);
  // 拖曳／點選預覽
  if (placing) drawPlaceHints(c, placing, true);
  if (drag) drawDragPreview(c, drag);
  else if (placing) drawDragPreview(c, { kind: "card", idx: R.selCard });
  c.restore();
  // 放置中的提示文字。
  if (placing && !drag) {
    const left = R.hand.filter(
      (q) => q.key === placing.key && q.tier === placing.tier,
    ).length;
    const msg = `已選擇 ${towerName(placing.key)} ★${placing.tier}（備戰區 ×${left}）・點地圖空地建造・點相同的塔升星・右鍵或 ESC 取消`;
    c.font = font(17, 800);
    const w = c.measureText(msg).width + 36,
      bx = MX + (COLS * TS) / 2 - w / 2;
    rr(c, bx, MY + 10, w, 36, 18);
    c.fillStyle = "rgba(10,6,20,.88)";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = TIER_COL[placing.tier];
    c.stroke();
    txt(c, msg, bx + w / 2, MY + 28, {
      size: 17,
      color: "#ffffff",
      weight: 800,
    });
  }
  // 地圖邊框
  rr(c, MX - 3, MY - 3, COLS * TS + 6, ROWS * TS + 6, 6);
  c.lineWidth = 3;
  c.strokeStyle = "rgba(255,220,150,.35)";
  c.stroke();
}
// 放塔提示：可以建造的空地（淡綠色）、可以升星／融合的塔（閃爍外框）
function drawPlaceHints(c, card, towers) {
  const t = G.time;
  for (let gy = 0; gy < ROWS; gy++)
    for (let gx = 0; gx < COLS; gx++) {
      const k = gx + "," + gy,
        x = MX + gx * TS,
        y = MY + gy * TS,
        tw = R.grid[k];
      if (towers) {
        if (!tw) continue;
        const res = fuseResult(card, tw);
        if (!res) continue;
        const col = res.type === "fuse" ? "#ff9af0" : "#7affb0";
        rr(c, x + 3, y + 3, TS - 6, TS - 6, 10);
        c.lineWidth = 3;
        c.strokeStyle = rgba(col, 0.55 + 0.35 * Math.sin(t * 6));
        c.stroke();
        rr(c, x + TS - 26, y + 2, 24, 22, 8);
        c.fillStyle = col;
        c.fill();
        txt(c, res.type === "fuse" ? "⚗" : "⬆", x + TS - 14, y + 13, {
          size: 14,
          color: "#10301a",
          weight: 900,
        });
      } else if (!tw && canBuild(gx, gy)) {
        rr(c, x + 7, y + 7, TS - 14, TS - 14, 10);
        c.fillStyle = "rgba(122,255,176,.09)";
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = "rgba(122,255,176,.24)";
        c.stroke();
      }
    }
}
// 拖曳中的塔或塔卡。
function dragItem(drag) {
  return drag.kind === "card" ? R.hand[drag.idx] : drag.tw;
}
// 拖曳時的格子預覽：可以放置、合成或不能放。
function drawDragPreview(c, drag) {
  // 拖曳時在地圖上預覽：可以放的格子顯示綠色，不能放的顯示紅色並說明原因。
  const it = dragItem(drag);
  if (!it) return;
  const m = G.mouse,
    tl = tileAt(m.x, m.y);
  if (tl) {
    const k = tl.gx + "," + tl.gy,
      x = MX + tl.gx * TS,
      y = MY + tl.gy * TS;
    const o = R.grid[k];
    let ok = false,
      label = "",
      col = "#ff5a5a";
    // 拖到另一座塔上：顯示合成後的結果與費用。
    if (o && o !== it) {
      const res = fuseResult(it, o);
      ok = !!res;
      const mc = res ? mergeCost(res, it.tier) : 0;
      label = res
        ? `${res.type === "fuse" ? "融合" : "升星"} → ${towerName(res.key)} ★${res.tier}・💰${mc} 金`
        : "無法合成";
      col = ok
        ? R.gold < mc
          ? "#ffb05a"
          : res.type === "fuse"
            ? "#ff9af0"
            : "#7affb0"
        : "#ff5a5a";
    } else if (!o && canBuild(tl.gx, tl.gy)) {
      ok = true;
      col = "#7affb0";
      label = R.lucky.has(k) ? "☘ 幸運格：傷害 +20%、暴擊 +15%" : "";
    } else if (o === it) {
      ok = true;
      col = "#ffffff";
    }
    rr(c, x + 2, y + 2, TS - 4, TS - 4, 8);
    c.fillStyle = rgba(col, 0.22);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = col;
    c.stroke();
    const st = calcStats(it.key, it.tier, R.mods);
    c.beginPath();
    c.arc(x + TS / 2, y + TS / 2, st.range, 0, TAU);
    c.strokeStyle = rgba(col, 0.5);
    c.lineWidth = 2;
    c.setLineDash([6, 6]);
    c.stroke();
    c.setLineDash([]);
    if (label) {
      c.font = font(18, 800);
      const w = c.measureText(label).width + 24;
      const lx = clamp(x + TS / 2 - w / 2, MX + 4, MX + COLS * TS - w - 4),
        ly = y - 34 < MY ? y + TS + 6 : y - 34;
      rr(c, lx, ly, w, 30, 8);
      c.fillStyle = "rgba(10,6,20,.9)";
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.stroke();
      txt(c, label, lx + w / 2, ly + 15, { size: 18, color: col, weight: 800 });
    }
  }
}

// 滑鼠指著的塔。
function hoverTower() {
  if (!R || G.drag || activeModal() || R.selCard >= 0) return null;
  const tl = tileAt(G.mouse.x, G.mouse.y);
  if (!tl) return null;
  return R.grid[tl.gx + "," + tl.gy] || null;
}

// ===== 星級技能：覺醒新星（★4~5）與神話天罰（★6） =====
function towerSkills(t, dt) {
  // 四星以上的塔技能：s 是能力表。
  const s = t.st;
  // 覺醒新星：倒數結束後攻擊範圍內所有敵人。
  t.novaT = (t.novaT ?? rand(2, 5)) - dt;
  // 新星：每隔一段時間對射程內所有敵人造成 3 倍（五星 5 倍）傷害，並放出大光環。
  if (t.novaT <= 0) {
    const R2 = s.range * 1.1,
      hits = enemiesInRange(t.x, t.y, R2);
    if (hits.length) {
      t.novaT = t.tier >= 5 ? 5 : 7;
      const mul = t.tier >= 5 ? 5 : 3,
        cols = s.els.map((e) => ELEM[e].c);
      for (const e of hits) {
        hitEnemy(e, t, s.dmg * mul);
      }
      fxW.add({
        kind: "ring",
        x: t.x,
        y: t.y,
        r0: 20,
        r1: R2,
        size: 16,
        col: cols[0],
        life: 0.6,
        force: true,
      });
      fxW.add({
        kind: "ring",
        x: t.x,
        y: t.y + 6,
        r0: 10,
        r1: R2 * 1.1,
        size: 8,
        col: "#ffffff",
        life: 0.7,
        flat: true,
        force: true,
      });
      fxW.add({
        kind: "glow",
        x: t.x,
        y: t.y,
        size: R2 * 1.2,
        col: cols[cols.length - 1],
        life: 0.45,
        a: 0.7,
        force: true,
      });
      burst(fxW, t.x, t.y, 30, {
        col: [...cols, "#ffffff"],
        smin: 200,
        smax: 500,
        lmax: 0.6,
        force: true,
      });
      floatText(
        fxW,
        t.x,
        t.y - 60,
        t.tier >= 5 ? "傳說新星！" : "覺醒新星！",
        TIER_COL[t.tier],
        22,
        { life: 0.9, force: true },
      );
      AU.play("nova");
      shake(3);
    } else t.novaT = 0.5;
  }
  // 神話天罰：隨機轟擊全場最多 12 個敵人。
  if (t.tier >= 6) {
    t.ultT = (t.ultT ?? 6) - dt;
    // 終極技能：每 12 秒隨機打擊最多 12 個敵人。
    if (t.ultT <= 0) {
      const es = R.enemies.filter((e) => targetable(e));
      if (es.length) {
        t.ultT = 12;
        shuffle(es)
          .slice(0, 12)
          .forEach((e, k) =>
            R.timers.push({
              t: k * 0.07,
              // 一道天罰光柱。
              fn: () => {
                if (e.dead) return;
                hitEnemy(e, t, s.dmg * 10);
                fxW.add({
                  kind: "pillar",
                  x: e.x,
                  y: e.y + 12,
                  size: 22,
                  h: 520,
                  col: elemCol(t.key, k, G.time),
                  life: 0.7,
                  force: true,
                });
                burst(fxW, e.x, e.y, 18, {
                  col: ["#ffffff", TIER_COL[6], elemCol(t.key, k, G.time)],
                  smax: 380,
                  force: true,
                });
              },
            }),
          );
        fxW.add({
          kind: "pillar",
          x: t.x,
          y: t.y + 10,
          size: 40,
          h: 700,
          col: "#ff6aff",
          life: 1,
          force: true,
        });
        floatText(fxW, t.x, t.y - 80, "神話・天罰！", "#ffffff", 34, {
          life: 1.4,
          stroke: "#a0006a",
          sw: 7,
          force: true,
        });
        flash(0.35, "#ff9aff");
        shake(10);
        AU.play("ult");
      } else t.ultT = 1;
    }
  }
}
// 連殺帶來的金幣倍率，最多 +50%。
function comboMul() {
  return 1 + Math.min(0.5, R.combo * 0.01);
}

// ===== 寶劍法術：連線三把劍時施放全場法術 =====
function castSpell(el, B) {
  // 施放元素法術：場上沒有敵人或不在戰鬥中就不能放。
  const es = R.enemies.filter((e) => !e.dead);
  if (!es.length || R.phase !== "wave") return false;
  // 法術傷害：依波次、遺物與 B（強度）計算。
  const pw =
    18 *
    hpScale(Math.max(1, R.wave)) *
    R.map.hp *
    B *
    (1 + R.mods.dmg) *
    (1 + R.mods.spellDmg);
  // 顯示法術名稱、畫面閃光並播放音效。
  const col = ELEM[el].c,
    name = SPELL_NAME[el];
  floatText(fxW, MX + 640, MY + 360, name + "！", col, 72, {
    life: 1.8,
    vy: -20,
    stroke: "#1a0030",
    sw: 10,
    force: true,
  });
  flash(0.3, col);
  AU.play("spell", el);
  // 對首領的傷害較低。
  const hit = (e, mul) => {
    if (e.dead) return;
    dealDamage(e, pw * mul * (e.boss ? 0.35 : 1), null, {});
  };
  // 依元素產生不同效果：火（連續落下火球）、冰（全場冰凍）、雷（隨機落雷）、毒
  // （路線上毒霧）、風（把敵人吹回去）、土（地面碎石）。
  if (el === "fire") {
    // 隕石雨。
    for (let k = 0; k < 10 + B * 2; k++)
      R.timers.push({
        t: k * 0.1,
        // 每隔一段時間隨機挑一個敵人打下火球，爆炸範圍內的敵人都受傷。
        fn: () => {
          const live = R.enemies.filter((e) => !e.dead);
          const tg = live.length ? pick(live) : null;
          const x = tg ? tg.x : MX + rand(1280),
            y = tg ? tg.y : MY + rand(896);
          fxW.add({
            kind: "spark",
            x: x - 140,
            y: y - 420,
            vx: 700,
            vy: 2100,
            life: 0.2,
            size: 10,
            col: "#ffae3a",
            force: true,
          });
          R.timers.push({
            t: 0.2,
            // 火球落地：80 範圍內的敵人受到傷害。
            fn: () => {
              for (const e of R.enemies)
                if (!e.dead && d2(x, y, e.x, e.y) < 80 * 80) {
                  hit(e, 0.9);
                  e.burnT = 3;
                  e.burnDps = Math.max(e.burnDps, pw * 0.1);
                }
              fxW.add({
                kind: "glow",
                x,
                y,
                size: 140,
                col: "#ff6a1a",
                life: 0.5,
                force: true,
              });
              fxW.add({
                kind: "ring",
                x,
                y,
                r0: 10,
                r1: 90,
                size: 8,
                col: "#ffcf3a",
                life: 0.4,
                flat: true,
                force: true,
              });
              burst(fxW, x, y, 16, {
                kind: "shard",
                col: ["#ff6a1a", "#5a2a10"],
                add: false,
                g: 600,
                smax: 300,
                force: true,
              });
              shake(5);
              AU.play("boom");
            },
          });
        },
      });
  } else if (el === "ice") {
    // 暴風雪：冰凍全場。
    for (const e of es) {
      hit(e, 0.7);
      e.frozen = Math.max(e.frozen, e.boss ? 0.8 : 2.5);
    }
    for (let k = 0; k < 120; k++)
      fxW.add({
        kind: "dot",
        x: MX + rand(1280),
        y: MY + rand(-100, 600),
        vx: rand(-40, 40),
        vy: rand(120, 260),
        life: rand(1.5, 2.5),
        size: rand(2, 4),
        col: "#e8f8ff",
        force: true,
      });
    flash(0.5, "#9ae0ff");
  } else if (el === "thunder") {
    // 雷霆萬鈞：連續閃電。
    for (let k = 0; k < 12 + B * 2; k++)
      R.timers.push({
        t: k * 0.08,
        // 隨機挑一個敵人打下落雷。
        fn: () => {
          const live = R.enemies.filter((e) => !e.dead);
          if (!live.length) return;
          const e = pick(live);
          fxW.add({
            kind: "bolt",
            pts: boltPts(e.x + rand(-60, 60), MY, e.x, e.y, 30),
            col: "#ffe03a",
            size: 4,
            life: 0.25,
            force: true,
          });
          fxW.add({
            kind: "glow",
            x: e.x,
            y: e.y,
            size: 80,
            col: "#fff6a0",
            life: 0.25,
            force: true,
          });
          hit(e, 1.1);
          e.stun = Math.max(e.stun, 0.5);
          AU.play("shoot", "thunder");
        },
      });
  } else if (el === "poison") {
    // 瘟疫毒霧。
    for (const e of es) {
      hit(e, 0.4);
      e.psn = Math.max(e.psn, 8);
      e.psnDps = Math.max(e.psnDps, pw * 0.06);
      e.psnT = 5;
    }
    for (let k = 0; k < 40; k++) {
      const q = posAt(rand(R.path.len));
      fxW.add({
        kind: "glow",
        x: q.x + rand(-30, 30),
        y: q.y + rand(-20, 20),
        vy: -10,
        life: rand(1.5, 3),
        size: rand(40, 70),
        col: "#5ad02a",
        a: 0.5,
        force: true,
      });
    }
  } else if (el === "wind") {
    // 龍捲風：把敵人往後吹。
    for (const e of es) {
      hit(e, 0.8);
      if (!e.boss) e.d = Math.max(0, e.d - 140);
    }
    for (let k = 0; k < 30; k++) {
      const q = posAt(rand(R.path.len));
      fxW.add({
        kind: "ring",
        x: q.x,
        y: q.y,
        r0: 5,
        r1: 60,
        size: 4,
        col: "#c8fff0",
        life: rand(0.4, 0.9),
        flat: true,
        force: true,
      });
    }
  } else if (el === "earth") {
    // 大地震：暈眩全場。
    for (const e of es) {
      hit(e, 1);
      e.stun = Math.max(e.stun, e.boss ? 0.5 : 1.6);
    }
    shake(18);
    AU.play("stomp");
    for (let k = 0; k < 40; k++)
      fxW.add({
        kind: "shard",
        x: MX + rand(1280),
        y: MY + rand(896),
        vx: rand(-80, 80),
        vy: rand(-300, -100),
        g: 700,
        life: 1,
        size: rand(4, 8),
        col: pick(["#8a6a4a", "#5a4030"]),
        add: false,
        force: true,
      });
  }
  return true;
}

// 右上角的連殺數。
function drawCombo(c) {
  if (R.combo < 5) return;
  const k = Math.min(1, R.comboT / 2.5),
    x = MX + COLS * TS - 20,
    y = MY + 40;
  c.save();
  c.globalAlpha = 0.4 + 0.6 * k;
  neonText(
    c,
    `${R.combo} COMBO`,
    x,
    y,
    30 + Math.min(20, R.combo / 5),
    rainbow(R.combo * 8),
    { align: "right", core: "#ffffff" },
  );
  txt(c, `金幣 ×${comboMul().toFixed(2)}`, x, y + 32, {
    size: 16,
    align: "right",
    color: "#ffe080",
    weight: 800,
    stroke: "rgba(0,0,0,.7)",
    sw: 3,
  });
  rr(c, x - 160, y + 46, 160 * k, 5, 2);
  c.fillStyle = rainbow(R.combo * 8);
  c.fill();
  c.restore();
}

// 緩速力場與輔助塔的範圍光圈。
function drawAuras(c) {
  const t = G.time;
  for (const tw of R.towers) {
    if (tw.st.mode === "aura") {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.beginPath();
      c.arc(tw.x, tw.y, tw.st.range, 0, TAU);
      c.fillStyle = rgba("#7ad0ff", 0.05 + 0.02 * Math.sin(t * 2));
      c.fill();
      c.setLineDash([10, 10]);
      c.lineDashOffset = t * 30;
      c.strokeStyle = rgba("#7ad0ff", 0.35);
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
    if (tw.st.support) {
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const o of R.towers)
        if (o !== tw && d2(o.x, o.y, tw.x, tw.y) <= tw.st.range * tw.st.range) {
          const k = (t * 0.8 + o.id * 0.13) % 1;
          glow(
            c,
            lerp(tw.x, o.x, k),
            lerp(tw.y - 20, o.y - 20, k),
            10,
            "#c868ff",
            0.7,
          );
        }
      c.restore();
    }
  }
}
