"use strict";
// ===== 道具系統：6 種稀有度、戰鬥／增益／賭運／塔／財富 五大類 =====
// 六種稀有度的名稱與顏色。
const IRAR = [
  { n: "普通", c: "#e0e4ec" },
  { n: "優良", c: "#5cff7e" },
  { n: "稀有", c: "#4fb0ff" },
  { n: "史詩", c: "#c868ff" },
  { n: "傳說", c: "#ffae3c" },
  { n: "神話", c: "#ff4ad8" },
];
// 稀有度的顏色；神話會不斷變色。
function rarCol(r, t = G.time) {
  return r >= 5 ? rainbow(t * 140) : IRAR[r].c;
}
// 道具的五大類。
const ICAT = {
  battle: { n: "戰鬥", e: "⚔️" },
  buff: { n: "增益", e: "✨" },
  casino: { n: "賭運", e: "🍀" },
  tower: { n: "塔", e: "🏰" },
  econ: { n: "財富", e: "💰" },
};
// 所有道具；wave 表示只能在戰鬥中使用，target 表示要選一座塔。
const ITEMS = [
  // 戰鬥（波次中使用）
  {
    id: "bomb",
    e: "💣",
    n: "炸彈",
    r: 0,
    cat: "battle",
    wave: 1,
    d: "對全場敵人造成傷害",
  },
  {
    id: "heal",
    e: "💊",
    n: "修復包",
    r: 0,
    cat: "battle",
    d: "城堡回復 5 點生命",
  },
  {
    id: "freeze",
    e: "🧊",
    n: "冰凍卷軸",
    r: 1,
    cat: "battle",
    wave: 1,
    d: "凍結全場敵人 3 秒",
  },
  {
    id: "meteor",
    e: "☄️",
    n: "隕石卷軸",
    r: 2,
    cat: "battle",
    wave: 1,
    d: "施放隕石雨，轟炸敵人",
  },
  {
    id: "storm",
    e: "🌩️",
    n: "雷霆卷軸",
    r: 2,
    cat: "battle",
    wave: 1,
    d: "召喚落雷連續劈擊敵人",
  },
  {
    id: "quake",
    e: "🌋",
    n: "地震卷軸",
    r: 3,
    cat: "battle",
    wave: 1,
    d: "全場暈眩並造成大量傷害",
  },
  {
    id: "aegis",
    e: "🛡️",
    n: "聖盾",
    r: 3,
    cat: "battle",
    d: "最大生命 +5 並回滿生命",
  },
  {
    id: "doom",
    e: "💀",
    n: "末日審判",
    r: 4,
    cat: "battle",
    wave: 1,
    d: "消滅全場非首領敵人，首領受到 30% 傷害",
  },
  // 增益（持續數波）
  {
    id: "eagle",
    e: "🦅",
    n: "鷹眼藥水",
    r: 0,
    cat: "buff",
    buff: { range: 0.15 },
    waves: 3,
    d: "射程 +15%，持續 3 波",
  },
  {
    id: "rage",
    e: "🔥",
    n: "狂暴藥水",
    r: 1,
    cat: "buff",
    buff: { dmg: 0.3 },
    waves: 2,
    d: "全塔傷害 +30%，持續 2 波",
  },
  {
    id: "haste",
    e: "💨",
    n: "急速藥水",
    r: 1,
    cat: "buff",
    buff: { rate: 0.25 },
    waves: 2,
    d: "攻擊速度 +25%，持續 2 波",
  },
  {
    id: "focus",
    e: "🎯",
    n: "會心藥水",
    r: 2,
    cat: "buff",
    buff: { crit: 0.2 },
    waves: 3,
    d: "暴擊率 +20%，持續 3 波",
  },
  {
    id: "midasP",
    e: "💰",
    n: "點金藥水",
    r: 2,
    cat: "buff",
    buff: { gold: 0.6 },
    waves: 3,
    d: "擊殺金幣 +60%，持續 3 波",
  },
  {
    id: "berserk",
    e: "😤",
    n: "狂戰士之血",
    r: 3,
    cat: "buff",
    buff: { dmg: 0.6, rate: 0.15 },
    waves: 3,
    d: "傷害 +60%、攻速 +15%，持續 3 波",
  },
  {
    id: "titan",
    e: "🗿",
    n: "巨神祝福",
    r: 4,
    cat: "buff",
    buff: { dmg: 1, rate: 0.25, range: 0.1 },
    waves: 4,
    d: "傷害 +100%、攻速 +25%、射程 +10%，持續 4 波",
  },
  {
    id: "godp",
    e: "🌈",
    n: "眾神之力",
    r: 5,
    cat: "buff",
    buff: { dmg: 2, rate: 0.5, crit: 0.25 },
    waves: 5,
    d: "傷害 +200%、攻速 +50%、暴擊 +25%，持續 5 波",
  },
  // 賭運
  {
    id: "charm",
    e: "🍀",
    n: "幸運符",
    r: 1,
    cat: "casino",
    boost: { t: "luck", v: 0.12, games: 5 },
    d: "接下來 5 局賭博：輸的時候有 12% 機率「幸運重來」",
  },
  {
    id: "insure",
    e: "☂️",
    n: "保險卡",
    r: 1,
    cat: "casino",
    boost: { t: "insure", v: 0.5, games: 3 },
    d: "接下來 3 局輸掉時，退還 50% 賭注",
  },
  {
    id: "dbl",
    e: "✖️",
    n: "雙倍券",
    r: 2,
    cat: "casino",
    boost: { t: "dbl", v: 1, games: 1 },
    d: "下一次賭贏時，獎金 ×2",
  },
  {
    id: "shoe",
    e: "🧲",
    n: "黃金馬蹄",
    r: 3,
    cat: "casino",
    boost: { t: "luck", v: 0.25, games: 8 },
    d: "接下來 8 局賭博：輸的時候有 25% 機率重來",
  },
  {
    id: "golden",
    e: "🎟️",
    n: "黃金彩券",
    r: 3,
    cat: "casino",
    d: "立刻進入小瑪莉大抽獎 5 回合（押注 200）",
  },
  {
    id: "triple",
    e: "🔱",
    n: "三倍券",
    r: 4,
    cat: "casino",
    boost: { t: "dbl", v: 2, games: 1 },
    d: "下一次賭贏時，獎金 ×3",
  },
  // 塔
  {
    id: "ticket",
    e: "🎫",
    n: "塔券",
    r: 1,
    cat: "tower",
    d: "免費獲得一座隨機商店塔 ★1",
  },
  {
    id: "star",
    e: "⭐",
    n: "升星石",
    r: 3,
    cat: "tower",
    target: 1,
    d: "點選地圖上的一座塔，直接升一星（不需要第二座）",
  },
  {
    id: "spbox",
    e: "🎁",
    n: "神秘禮盒",
    r: 4,
    cat: "tower",
    d: "獲得一座賭場限定特殊塔",
  },
  // 財富
  {
    id: "coinbag",
    e: "👛",
    n: "金幣袋",
    r: 0,
    cat: "econ",
    d: "獲得金幣（波數越後面越多）",
  },
  {
    id: "refresh",
    e: "🔄",
    n: "刷新券",
    r: 0,
    cat: "econ",
    d: "下一次商店刷新免費",
  },
  { id: "gembag", e: "💠", n: "寶石袋", r: 1, cat: "econ", d: "獲得 5 顆寶石" },
  {
    id: "treasure",
    e: "💎",
    n: "寶藏箱",
    r: 3,
    cat: "econ",
    d: "獲得大量金幣",
  },
];
// 用代號查道具。
const ITEM_BY = {};
ITEMS.forEach((i) => (ITEM_BY[i.id] = i));

// 依品質抽稀有度；qual 越高越容易抽到好的。
function rollRarity(qual = 0) {
  const w = [52, 27, 13, 5.5, 2, 0.5].map(
    (v, r) => v * Math.pow(1 + qual * 0.6, r),
  );
  return wpick([0, 1, 2, 3, 4, 5], (r) => w[r]);
}
// 抽一個道具；cat 可以限定類別。
function rollItem(qual = 0, cat = null) {
  let r = rollRarity(qual);
  while (r >= 0) {
    const c = ITEMS.filter((i) => i.r === r && (!cat || i.cat === cat));
    if (c.length) return pick(c).id;
    r--;
  }
  return "coinbag";
}
// 抽一種賭場限定塔。
function rollSpecial(qual = 0) {
  const r = Math.max(2, rollRarity(qual + 1));
  const c = SP_KEYS.filter((k) => SP_RAR[k] <= r);
  return wpick(c, (k) => (SP_RAR[k] === r ? 3 : 1));
}
// 背包裡有幾個。
function itemCount(id) {
  const it = R.items.find((i) => i.id === id);
  return it ? it.n : 0;
}
// 把道具加進背包，並顯示獲得訊息。
function addItem(id, n = 1, o = {}) {
  const def = ITEM_BY[id];
  if (!def) return;
  let it = R.items.find((i) => i.id === id);
  if (!it) {
    it = { id, n: 0 };
    R.items.push(it);
    R.items.sort((a, b) => ITEM_BY[b.id].r - ITEM_BY[a.id].r);
  }
  it.n += n;
  if (!o.silent)
    rewardPop(
      def.e,
      def.n + (n > 1 ? " ×" + n : ""),
      def.r,
      IRAR[def.r].n + "道具",
    );
  if (def.r >= 4 && !o.silent) {
    flash(0.35, rarCol(def.r));
    AU.play("discover");
  }
}
// 獲得獎品的彈出訊息。
function rewardPop(e, name, r, sub) {
  G.pops.push({ e, name, r, sub, t: 0 });
  if (G.pops.length > 6) G.pops.shift();
  AU.play("reveal", Math.min(3, r));
}
// ===== 增益 =====
function addBuff(def) {
  const ex = R.buffs.find((b) => b.id === def.id);
  if (ex) ex.waves += def.waves;
  else
    R.buffs.push({
      id: def.id,
      e: def.e,
      n: def.n,
      r: def.r,
      buff: def.buff,
      waves: def.waves,
    });
  recalcMods();
  rewardPop(def.e, def.n, def.r, `增益 · 持續 ${def.waves} 波`);
}
// 把增益加進加成總表。
function applyBuffs(m) {
  for (const b of R.buffs) {
    const f = b.buff;
    if (f.dmg) m.dmg += f.dmg;
    if (f.rate) m.rate += f.rate;
    if (f.range) m.range += f.range;
    if (f.crit) m.crit += f.crit;
    if (f.gold) m.gold += f.gold;
  }
}
// 每波結束時，增益的剩餘波數減一。
function tickBuffs() {
  for (const b of R.buffs) b.waves--;
  const gone = R.buffs.filter((b) => b.waves <= 0);
  R.buffs = R.buffs.filter((b) => b.waves > 0);
  if (gone.length) {
    toast(`增益結束：${gone.map((b) => b.n).join("、")}`, "#c8b8e8");
    recalcMods();
  }
}
// ===== 賭運加成 =====
function casinoLuck() {
  let v = luckFactor(getLuck()) * 0.08 + 0.03 * (G.meta.talents.heat || 0);
  for (const b of R.cb) if (b.t === "luck") v += b.v;
  return Math.min(0.6, v);
}
// 賭輸時有機率重來一次。
function casinoTryLuck() {
  if (Math.random() < casinoLuck()) {
    toast("🍀 幸運重來！", "#7affb0");
    AU.play("nudge");
    return true;
  }
  return false;
}
// 一局結束後計算倍券與保險，並回傳獎金倍率。
function casinoAfterGame(won, bet) {
  let mul = 1,
    refund = 0;
  if (won) {
    const d = R.cb.find((b) => b.t === "dbl");
    if (d) {
      mul = 1 + d.v;
      d.games = 0;
      toast(`${d.v >= 2 ? "三" : "雙"}倍券發動！獎金 ×${1 + d.v}`, "#ffcf3a");
    }
  } else {
    const ins = R.cb.find((b) => b.t === "insure");
    if (ins && bet > 0) {
      refund = Math.round(bet * ins.v);
      R.gold += refund;
      toast(`保險卡退還 ${refund} 金`, "#7ae0ff");
    }
  }
  for (const b of R.cb) if (b.t !== "dbl") b.games--;
  R.cb = R.cb.filter((b) => b.games > 0);
  return mul;
}
// ===== 使用道具 =====
// 戰鬥道具的傷害；隨波次成長。
function itemPower() {
  return (
    22 *
    hpScale(Math.max(1, R.wave)) *
    R.map.hp *
    (1 + R.mods.dmg) *
    (1 + R.mods.spellDmg)
  );
}
// 使用一個道具。
function useItem(id) {
  const def = ITEM_BY[id],
    it = R.items.find((i) => i.id === id);
  if (!def || !it || it.n <= 0) return;
  if (def.wave && R.phase !== "wave") {
    toast("這個道具要在戰鬥中（敵人出現時）使用", "#ff8a8a");
    AU.play("error");
    return;
  }
  // 需要選擇目標的道具：先切換到戰場。
  if (def.target) {
    R.targeting = id;
    R.tab = "battle";
    toast("點選地圖上的一座塔來使用" + def.n, "#ffe080");
    return;
  }
  let ok = true;
  // 場上還活著的敵人。
  const live = () => R.enemies.filter((e) => !e.dead);
  switch (id) {
    // 炸彈。
    case "bomb": {
      const pw = itemPower() * 1.2;
      for (const e of live()) {
        dealDamage(e, e.boss ? pw * 0.3 : pw, null, {});
        burst(fxW, e.x, e.y, 10, { col: ["#ff8a3a", "#ffffff"], smax: 260 });
      }
      shake(10);
      flash(0.4, "#ffaa50");
      AU.play("boom");
      break;
    }
    // 回復生命。
    case "heal":
      R.hp = Math.min(R.maxHp, R.hp + 5);
      AU.play("heal");
      break;
    // 冰凍全場。
    case "freeze":
      for (const e of live()) e.frozen = Math.max(e.frozen, e.boss ? 1 : 3);
      flash(0.5, "#9ae0ff");
      AU.play("spell", "ice");
      break;
    // 隕石雨。
    case "meteor":
      ok = castSpell("fire", 4);
      break;
    // 雷暴。
    case "storm":
      ok = castSpell("thunder", 4);
      break;
    // 大地震。
    case "quake":
      ok = castSpell("earth", 6);
      break;
    // 增加生命上限並補滿。
    case "aegis":
      R.baseHp += 5;
      recalcMods();
      R.hp = R.maxHp;
      AU.play("heal");
      flash(0.3, "#ffe080");
      break;
    // 毀滅：一般敵人直接擊殺，首領扣三成生命。
    case "doom": {
      for (const e of live()) {
        if (e.boss) dealDamage(e, e.maxHp * 0.3, null, { dot: true });
        else killEnemy(e, null);
        fxW.add({
          kind: "pillar",
          x: e.x,
          y: e.y + 10,
          size: 18,
          h: 300,
          col: "#ff4ad8",
          life: 0.8,
          force: true,
        });
      }
      flash(0.7, "#ffffff");
      shake(16);
      AU.play("ult");
      break;
    }
    // 黃金彩券：免費玩小瑪莉。
    case "golden":
      R.tab = "casino";
      CZ.game = "mary";
      maryStartBonus(200, 5, "黃金彩券");
      break;
    // 隨機塔券。
    case "ticket":
      ok = addCard(pick(SHOP_POOL), 1, { fx: 960, fy: 540 }) !== false;
      break;
    // 賭場限定塔禮盒。
    case "spbox": {
      const k = rollSpecial(1);
      ok = addCard(k, 1, { fx: 960, fy: 540 }) !== false;
      if (ok) bigReward(k);
      break;
    }
    // 金幣袋。
    case "coinbag": {
      const g = 60 + 15 * R.wave;
      R.gold += g;
      floatText(fxU, 960, 500, "+" + g + " 金", "#ffcf3a", 36);
      AU.play("coin");
      break;
    }
    // 寶藏。
    case "treasure": {
      const g = 400 + 60 * R.wave;
      R.gold += g;
      coinShower(960, 600, 30, { force: true });
      floatText(fxU, 960, 500, "+" + g + " 金", "#ffcf3a", 44);
      break;
    }
    // 免費刷新商店。
    case "refresh":
      R.freeRefresh = (R.freeRefresh || 0) + 1;
      toast("下一次商店刷新免費", "#7ae0ff");
      break;
    // 寶石袋。
    case "gembag":
      R.gems += 5;
      AU.play("gem");
      break;
    // 其他：增益或賭運加成。
    default:
      if (def.buff) addBuff(def);
      else if (def.boost) {
        R.cb.push({ ...def.boost, name: def.n, e: def.e });
        toast(`${def.e} ${def.n} 生效！`, rarCol(def.r));
        AU.play("gem");
      }
  }
  if (!ok) {
    toast("現在無法使用", "#ff8a8a");
    return;
  }
  it.n--;
  if (it.n <= 0) R.items = R.items.filter((i) => i !== it);
  R.stats.items = (R.stats.items || 0) + 1;
}
// 對一座塔使用升星道具。
function useStarOn(tw) {
  if (tw.tier >= MAX_TIER) {
    toast("已經是最高星級", "#ff8a8a");
    return;
  }
  const it = R.items.find((i) => i.id === "star");
  if (!it) return;
  it.n--;
  if (it.n <= 0) R.items = R.items.filter((i) => i !== it);
  R.targeting = null;
  tw.tier++;
  tw.st = calcStats(tw.key, tw.tier, R.mods);
  tw.pop = 1;
  discover(tw.key);
  fuseFx(tw.x, tw.y, tw.key, "merge", tw.tier);
}
// 顯示大獎視窗。
function bigReward(key) {
  R.modals.push({ type: "reward", key, t: 0 });
}

// ===== 戰場掉落的道具袋 =====
function dropBag(e) {
  const qual = R.wave / 18 + (e.boss ? 1.2 : e.elite ? 0.6 : 0);
  const n = e.boss ? 2 : 1;
  for (let k = 0; k < n; k++)
    R.drops.push({
      x: e.x + rand(-16, 16),
      y: e.y + rand(-10, 10),
      t: 0,
      item: rollItem(qual),
    });
}
// 更新掉落物；滑鼠掃過就撿起來。
function updDrops(dt) {
  const m = G.mouse;
  for (const d of R.drops) {
    d.t += dt;
    if (!d.got && R.tab === "battle" && d2(m.x, m.y, d.x, d.y) < 50 * 50)
      collectDrop(d);
  }
  R.drops = R.drops.filter((d) => !d.got);
}
// 撿起一個道具袋。
function collectDrop(d) {
  d.got = true;
  addItem(d.item);
  burst(fxW, d.x, d.y, 18, {
    col: [rarCol(ITEM_BY[d.item].r), "#ffffff"],
    smax: 300,
    force: true,
  });
  AU.play("chip");
}
// 畫出地上的道具袋。
function drawDrops(c) {
  for (const d of R.drops) {
    const def = ITEM_BY[d.item],
      col = rarCol(def.r),
      by = Math.sin(d.t * 4) * 4;
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, d.x, d.y + by, 34 + def.r * 4, col, 0.6 + 0.25 * Math.sin(d.t * 6));
    c.restore();
    c.save();
    c.translate(d.x, d.y - 6 + by);
    rr(c, -14, -10, 28, 24, 7);
    c.fillStyle = "#6a3a1a";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = col;
    c.stroke();
    c.beginPath();
    c.moveTo(-8, -10);
    c.quadraticCurveTo(0, -24, 8, -10);
    c.strokeStyle = col;
    c.stroke();
    c.font = `14px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(def.e, 0, 2);
    c.restore();
  }
}

// ===== 道具圖示與背包 =====
function drawItemIcon(c, def, x, y, s, n) {
  const col = rarCol(def.r);
  c.save();
  if (def.r >= 3) {
    c.globalCompositeOperation = "lighter";
    glow(
      c,
      x + s / 2,
      y + s / 2,
      s * 0.8,
      col,
      0.35 + 0.15 * Math.sin(G.time * 3),
    );
    c.globalCompositeOperation = "source-over";
  }
  rr(c, x, y, s, s, s * 0.18);
  const g = c.createLinearGradient(x, y, x, y + s);
  g.addColorStop(
    0,
    mixHex(def.r >= 5 ? "#ff4ad8" : IRAR[def.r].c, "#1a0a30", 0.6),
  );
  g.addColorStop(1, "#0a0418");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = def.r >= 4 ? 3 : 2;
  c.strokeStyle =
    def.r >= 5 ? rainbowGrad(c, x + s / 2, y + s / 2, G.time * 2) : col;
  c.stroke();
  c.font = `${Math.round(s * 0.55)}px ${EMOJI_FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#fff";
  c.fillText(def.e, x + s / 2, y + s * 0.53);
  if (n > 1)
    txt(c, "×" + n, x + s - 4, y + s - 8, {
      size: Math.round(s * 0.26),
      align: "right",
      weight: 900,
      stroke: "#000",
      sw: 3,
    });
  c.restore();
}
// 道具的提示內容。
function itemTip(def) {
  return {
    title: `${def.e} ${def.n}`,
    col: rarCol(def.r),
    lines: [
      `${IRAR[def.r].n} · ${ICAT[def.cat].n}類`,
      def.d,
      (def.wave ? "（戰鬥中才能使用）" : "") + "點一下會先問你要不要使用",
    ],
  };
}
// 點背包道具：先跳出確認視窗，按「確定使用」才真的用掉
function askUseItem(id) {
  const def = ITEM_BY[id];
  if (!def || itemCount(id) <= 0 || activeModal()) return;
  if (def.wave && R.phase !== "wave") {
    toast("這個道具要在戰鬥中（敵人出現時）使用", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.modal = { type: "useitem", id };
  modalBegin(R.modal);
}
// 確認是否使用道具的視窗。
function drawUseItem(c, m) {
  // def 是道具資料，n 是還剩幾個；用完了就直接關閉視窗。
  const def = ITEM_BY[m.id],
    n = itemCount(m.id);
  if (!def || n <= 0) {
    closeModal();
    return;
  }
  // 視窗的顏色（依稀有度）、大小與位置（畫面正中央稍微偏上）。
  const col = rarCol(def.r),
    pw = 640,
    ph = 420,
    px = W / 2 - pw / 2,
    py = H / 2 - ph / 2 - 30;
  // 背景慢慢變暗；點視窗外面就取消。
  dim(c, Math.min(0.62, m.t * 5));
  // 點視窗外面＝取消
  button("uiBg", 0, 0, W, H, "", {
    invisible: true,
    // 點到視窗外面時關閉。
    fn: () => {
      const p = G.mouse;
      if (p.x < px || p.x > px + pw || p.y < py || p.y > py + ph) closeModal();
    },
  });
  c.save();
  // 視窗後面的光暈、外框與標題。
  c.globalCompositeOperation = "lighter";
  glow(c, W / 2, py + ph / 2, 420, col, 0.22);
  c.restore();
  panel(c, px, py, pw, ph, { r: 24, border: col, lw: 3 });
  goldText(c, "要使用這個道具嗎？", W / 2, py + 50, 34);
  // 道具圖示、名稱、稀有度、分類與說明。
  drawItemIcon(c, def, px + 40, py + 100, 128, n);
  txt(c, `${def.e} ${def.n}`, px + 196, py + 118, {
    size: 30,
    align: "left",
    color: col,
    weight: 900,
    stroke: "#000",
    sw: 3,
  });
  txt(
    c,
    `${IRAR[def.r].n} · ${ICAT[def.cat].n}類　持有 ×${n}`,
    px + 196,
    py + 156,
    { size: 17, align: "left", color: "rgba(255,255,255,.7)", weight: 700 },
  );
  c.font = font(19, 600);
  wrapLines(c, def.d, pw - 236)
    .slice(0, 3)
    .forEach((l, i) =>
      txt(c, l, px + 196, py + 192 + i * 28, {
        size: 19,
        align: "left",
        color: "#ffffff",
        weight: 600,
      }),
    );
  // 提示：需要指定目標的道具，確定後還要再點一座塔。
  txt(
    c,
    def.target ? "確定後，再點地圖上的一座塔" : "確定後會用掉 1 個",
    W / 2,
    py + ph - 116,
    { size: 16, color: "rgba(255,255,255,.55)", weight: 600 },
  );
  // 「取消」與「確定使用」按鈕。
  const by = py + ph - 96;
  button("uiNo", px + 40, by, 260, 72, "✖ 取消", { size: 26, fn: closeModal });
  button("uiYes", px + pw - 300, by, 260, 72, "✔ 確定使用", {
    style: "green",
    size: 26,
    // 確定使用：關閉視窗並使用道具。
    fn: () => {
      closeModal();
      useItem(m.id);
    },
  });
}
// 背包的格子；filter 可以只顯示某一類。
function drawInventory(c, x, y, w, h, filter, id = "inv") {
  const list = R.items.filter((i) => !filter || ITEM_BY[i.id].cat === filter);
  const s = 60,
    gap = 8,
    cols = Math.max(1, Math.floor((w + gap) / (s + gap)));
  if (!list.length) {
    txt(c, "還沒有道具。賭場、首領、打怪掉落都能獲得！", x + w / 2, y + 30, {
      size: 15,
      color: "rgba(255,255,255,.45)",
      weight: 600,
    });
    return;
  }
  list.forEach((it, i) => {
    const cx = x + (i % cols) * (s + gap),
      cy = y + Math.floor(i / cols) * (s + gap);
    if (cy + s > y + h) return;
    const def = ITEM_BY[it.id];
    const hov = !UI.noHover && hit(cx, cy, s, s);
    c.save();
    if (hov) {
      c.translate(cx + s / 2, cy + s / 2);
      c.scale(1.08, 1.08);
      c.translate(-(cx + s / 2), -(cy + s / 2));
    }
    drawItemIcon(c, def, cx, cy, s, it.n);
    c.restore();
    UI.nh.push({
      id: id + it.id,
      x: cx,
      y: cy,
      w: s,
      h: s,
      fn: () => askUseItem(it.id),
    });
    if (hov) UI.tip = itemTip(def);
  });
}
// 目前生效的賭運加成。
function drawCasinoBoosts(c, x, y) {
  let k = 0;
  for (const b of R.cb) {
    const label =
      b.t === "luck"
        ? `${b.e} 重來機率 ${Math.round(b.v * 100)}%（剩 ${b.games} 局）`
        : b.t === "insure"
          ? `${b.e} 保險 ${Math.round(b.v * 100)}%（剩 ${b.games} 局）`
          : `${b.e} 下一次贏 ×${1 + b.v}`;
    txt(c, label, x, y + k * 22, {
      size: 14,
      align: "left",
      color: "#7affb0",
      weight: 700,
    });
    k++;
  }
  return k;
}
// ===== 獎勵飛入提示（不中斷遊戲） =====
function drawPops(c, dt) {
  G.pops.forEach((p, i) => {
    p.t += dt;
    const T = 2.8,
      a =
        p.t < 0.25
          ? p.t / 0.25
          : p.t > T - 0.4
            ? Math.max(0, (T - p.t) / 0.4)
            : 1;
    const x = W / 2 - 200,
      y = 150 + i * 74 - (1 - Math.min(1, p.t / 0.25)) * 30;
    c.save();
    c.globalAlpha = a;
    const col = rarCol(p.r);
    if (p.r >= 3) {
      c.globalCompositeOperation = "lighter";
      glow(c, x + 200, y + 30, 220, col, 0.3);
      c.globalCompositeOperation = "source-over";
    }
    rr(c, x, y, 400, 62, 31);
    const g = c.createLinearGradient(x, 0, x + 400, 0);
    g.addColorStop(0, "rgba(20,8,40,.95)");
    g.addColorStop(
      1,
      mixHex(p.r >= 5 ? "#ff4ad8" : IRAR[p.r].c, "#140828", 0.75),
    );
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = col;
    c.stroke();
    c.font = `34px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#fff";
    c.fillText(p.e, x + 38, y + 32);
    txt(c, p.name, x + 74, y + 22, {
      size: 20,
      align: "left",
      color: col,
      weight: 900,
      stroke: "rgba(0,0,0,.7)",
      sw: 3,
    });
    txt(c, p.sub || "", x + 74, y + 45, {
      size: 14,
      align: "left",
      color: "#e0d0ff",
      weight: 600,
    });
    c.restore();
  });
  G.pops = G.pops.filter((p) => p.t < 2.8);
}
