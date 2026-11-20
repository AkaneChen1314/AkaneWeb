'use strict';
// ===== 幸運賭場：三大區、七種遊戲 =====
const CZ = { game: 'slot', bet: {}, auto: null, autoT: 0, hist: [], returnTo: null };
const STG = { x: 392, y: 150, w: 1512, h: 706 };
const BET_OPTS = [10, 25, 50, 100, 250, 500, 1000, 2500];
const CZONES = [
  { id: 'slots', n: '老虎機區', e: '🎰', col: '#ff4ad8' },
  { id: 'table', n: '桌台區', e: '🎲', col: '#3ae8ff' },
  { id: 'luck', n: '運氣挑戰區', e: '🍀', col: '#ffcf3a' },
];
const CGAMES = [
  { id: 'slot', z: 'slots', e: '🎰', n: '命運拉霸', d: '3 輪 5 線・777 進大抽獎' },
  { id: 'mary', z: 'slots', e: '💡', n: '小瑪莉', d: '燈光繞圈・停哪拿哪' },
  { id: 'roul', z: 'table', e: '🎡', n: '幸運輪盤', d: '押紅黑、單雙或號碼' },
  { id: 'dice', z: 'table', e: '🎲', n: '骰寶大小', d: '三顆骰子猜大小' },
  { id: 'double', z: 'luck', e: '🃏', n: '翻倍挑戰', d: '猜紅黑・贏了翻兩倍' },
  { id: 'plinko', z: 'luck', e: '🔮', n: '彈珠台', d: '彈珠落下・倍率隨機' },
  { id: 'scratch', z: 'luck', e: '🎫', n: '刮刮樂', d: '用滑鼠刮開・三個一樣就中' },
];
function curBet(id = CZ.game) { return CZ.bet[id] || 50; }
function betQual(b) { return Math.max(0, Math.log10(b / 10)) * .55; }
function qualStars(b) { const q = betQual(b); return q >= 1.2 ? 5 : q >= .9 ? 4 : q >= .6 ? 3 : q >= .3 ? 2 : 1; }
function unitGold() { return 6 + 2 * R.wave; }
function pct(p) { const v = p * 100, d = v >= 1 ? 1 : v >= .1 ? 2 : 3; let t = v.toFixed(d); if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, ''); return t + '%'; }
function luckFactor(L) { return Math.max(0, L) / (Math.max(0, L) + 70); }
function payBet(b) {
  if (R.gold < b) { toast('金幣不足！到戰場打怪賺錢，或降低押注', '#ff8a8a'); AU.play('error'); stopAuto(); return false; }
  R.gold -= b; R.stats.bets = (R.stats.bets || 0) + 1; return true;
}
// 結算：payout 為含本金的總回收
function settle(gid, bet, payout, o = {}) {
  const won = payout > bet;
  const mul = casinoAfterGame(won, bet);
  let gain = won ? bet + (payout - bet) * mul * (1 + R.mods.casinoWin) : payout;
  gain = Math.round(gain);
  R.gold += gain;
  R.stats.casinoNet = (R.stats.casinoNet || 0) + gain - bet;
  CZ.hist.unshift({ g: gid, v: gain - bet }); if (CZ.hist.length > 7) CZ.hist.pop();
  const x = o.x ?? STG.x + STG.w / 2, y = o.y ?? STG.y + STG.h / 2;
  if (gain > 0) {
    floatText(fxU, x, y - 20, (won ? '+' : '') + fmtComma(gain) + ' 金', won ? '#ffcf3a' : '#e0d0ff', won ? 40 : 28, { life: 1.6, vy: -50, force: true });
    if (won) coinShower(x, y + 40, Math.min(40, 6 + Math.round(gain / Math.max(1, bet)) * 2), { force: true });
  }
  const ratio = gain / Math.max(1, bet || 1);
  if (bet > 0 && ratio >= 10 && !o.noCele) R.modals.push({ type: 'celebrate', level: ratio >= 100 ? 4 : ratio >= 30 ? 3 : 2, gold: gain });
  if (o.item != null) for (let k = 0; k < (o.items || 1); k++) { addItem(rollItem(o.item)); if (Math.random() < R.mods.mirror) addItem(rollItem(o.item)); }
  if (o.buff != null) giveBuff(o.buff);
  if (o.sp != null) giveSpecial(o.sp);
  if (!o.quiet) { if (won) AU.play(ratio >= 10 ? 'bigwin' : 'win', 2); else if (gain < bet) AU.play('lose'); }
  if (CZ.auto && ratio >= 30) stopAuto('大獎！自動暫停');
  return gain;
}
function giveBuff(qual) {
  const r = rollRarity(qual);
  let c = ITEMS.filter(i => i.cat === 'buff' && i.r <= r); const top = Math.max(...c.map(i => i.r));
  addBuff(pick(c.filter(i => i.r === top)));
}
function giveSpecial(qual) {
  const k = rollSpecial(qual);
  if (R.hand.length >= HAND_MAX) { const v = cardValue(k, 1); R.gold += v; toast(`備戰區已滿，${towerName(k)} 換成 ${v} 金`, '#ffcf3a'); }
  else addCard(k, 1, { fx: STG.x + STG.w / 2, fy: STG.y + STG.h / 2 });
  bigReward(k);
}
function stopAuto(msg) { if (CZ.auto) { CZ.auto = null; if (msg) toast(msg, '#ffe080'); } }
function startAuto(n) { CZ.auto = { gid: CZ.game, left: n }; CZ.autoT = .2; }
function casinoUpdate(dt) {
  for (const id in GM) if (GM[id].update) GM[id].update(dt);
  if (CZ.auto && R.tab === 'casino' && !activeModal()) {
    const g = GM[CZ.auto.gid];
    if (CZ.game !== CZ.auto.gid) { stopAuto(); return; }
    if (!g.busy()) {
      CZ.autoT -= dt;
      if (CZ.autoT <= 0) {
        if (R.gold < curBet(CZ.auto.gid)) { stopAuto('金幣不足，自動停止'); return; }
        CZ.autoT = .45; g.play(true); CZ.auto.left--; if (CZ.auto.left <= 0) stopAuto();
      }
    }
  }
}
function casinoAction() { const g = GM[CZ.game]; const a = g.action(); if (a && a.enabled !== false) a.fn(); }

// ===== 霓虹工具 =====
function neonText(c, s, x, y, size, col, o = {}) {
  c.save(); c.font = font(size, 900); c.textAlign = o.align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.globalAlpha = o.flicker && Math.sin(G.time * 37) > .93 ? .4 : 1;
  c.globalCompositeOperation = 'lighter';
  c.shadowColor = col; c.shadowBlur = size * .6; c.lineWidth = size * .14; c.strokeStyle = col; c.strokeText(s, x, y);
  c.shadowBlur = size * .25; c.lineWidth = size * .07; c.strokeText(s, x, y);
  c.shadowBlur = 0; c.globalCompositeOperation = 'source-over';
  c.fillStyle = o.core || mixHex(col, '#ffffff', .75); c.fillText(s, x, y);
  c.restore();
}
function rainbowGrad(c, cx, cy, rot) {
  if (c.createConicGradient) { const g = c.createConicGradient(rot, cx, cy); for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, hslHex(k * 60, 100, 60)); return g; }
  const g = c.createLinearGradient(cx - 300, cy, cx + 300, cy); for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, hslHex(k * 60, 100, 60)); return g;
}
function neonRR(c, x, y, w, h, r, o = {}) {
  const g = o.col || rainbowGrad(c, x + w / 2, y + h / 2, G.time * (o.speed || 1.2));
  const lw = o.w || 4, A = o.a || 1;
  c.save(); c.globalCompositeOperation = 'lighter';
  rr(c, x, y, w, h, r);
  c.strokeStyle = g; c.globalAlpha = .18 * A; c.lineWidth = lw * 4.5; c.stroke();
  c.globalAlpha = .45 * A; c.lineWidth = lw * 2; c.stroke();
  c.globalAlpha = A; c.lineWidth = lw; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = Math.max(1, lw * .35); c.stroke();
  c.restore();
}
function bulbs(c, X, Y, Wd, Hd, n, speed, hot) {
  const per = 2 * (Wd + Hd), t = G.time;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    let d = i / n * per, bx, by;
    if (d < Wd) { bx = X + d; by = Y; } else if ((d -= Wd) < Hd) { bx = X + Wd; by = Y + d; } else if ((d -= Hd) < Wd) { bx = X + Wd - d; by = Y + Hd; } else { d -= Wd; bx = X; by = Y + Hd - d; }
    const on = (i + Math.floor(t * speed)) % 4 < 2, col = rainbow(i * (360 / n) + t * (hot ? 500 : 120));
    c.beginPath(); c.arc(bx, by, 3.6, 0, TAU); c.fillStyle = on ? '#ffffff' : rgba(col, .35); c.fill();
    if (on) glow(c, bx, by, 15, col, .95);
  }
  c.restore();
}
function chip(c, x, y, r, val, sel, dis) {
  const cols = { 10: '#e8e8f0', 25: '#3ad86a', 50: '#ff4a4a', 100: '#3a8aff', 250: '#c868ff', 500: '#ff9a20', 1000: '#202030', 2500: '#ffcf3a' };
  const col = cols[val] || '#888';
  c.save(); if (dis) c.globalAlpha = .35;
  if (sel) { c.globalCompositeOperation = 'lighter'; glow(c, x, y, r * 2.2, '#ffe080', .7 + .2 * Math.sin(G.time * 6)); c.globalCompositeOperation = 'source-over'; }
  c.translate(x, y - (sel ? 6 : 0));
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, r * .9 + (sel ? 6 : 0), r, r * .3, 0, 0, TAU); c.fill();
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = col; c.fill();
  c.lineWidth = r * .22; c.setLineDash([r * .42, r * .36]); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r * .86, 0, TAU); c.stroke(); c.setLineDash([]);
  c.beginPath(); c.arc(0, 0, r * .62, 0, TAU); c.fillStyle = mixHex(col, '#000000', .25); c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
  txt(c, val >= 1000 ? (val / 1000) + 'K' : '' + val, 0, 1, { size: Math.round(r * .5), weight: 900, color: val === 1000 ? '#ffe080' : '#ffffff', stroke: 'rgba(0,0,0,.6)', sw: 3 });
  c.restore();
}

// ===== 賭場主畫面 =====
function drawCasino(c, dt) {
  const t = G.time;
  // 背景：舞台燈光
  let g = c.createLinearGradient(0, 70, 0, H); g.addColorStop(0, '#1a0634'); g.addColorStop(1, '#06020e'); c.fillStyle = g; c.fillRect(0, 70, W, H - 70);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    const a = Math.sin(t * .5 + k * 1.7) * .5, bx = 300 + k * 450, col = ['#ff4ad8', '#3ae8ff', '#ffcf3a', '#7cff3a'][k];
    c.save(); c.translate(bx, 70); c.rotate(a); const lg = c.createLinearGradient(0, 0, 0, 1000); lg.addColorStop(0, rgba(col, .16)); lg.addColorStop(1, rgba(col, 0));
    c.fillStyle = lg; c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.lineTo(260, 1000); c.lineTo(-260, 1000); c.closePath(); c.fill(); c.restore();
  }
  c.restore();
  drawCasinoSidebar(c);
  const gm = CGAMES.find(q => q.id === CZ.game), zone = CZONES.find(z => z.id === gm.z);
  // 標題列
  rr(c, STG.x, 84, STG.w, 58, 14); c.fillStyle = 'rgba(10,4,24,.7)'; c.fill();
  neonRR(c, STG.x, 84, STG.w, 58, 14, { col: zone.col, w: 2 });
  neonText(c, `${gm.e} ${gm.n}`, STG.x + 30, 113, 30, zone.col, { align: 'left', core: '#ffffff' });
  const info = GM[CZ.game].headline ? GM[CZ.game].headline() : gm.d;
  c.font = font(16, 700); const tw = c.measureText(info).width;
  txt(c, info, STG.x + STG.w - 24, 113, { size: tw > 900 ? 14 : 16, align: 'right', color: '#e0d0ff', weight: 700 });
  // 遊戲舞台
  c.save(); c.beginPath(); c.rect(STG.x, STG.y, STG.w, STG.h); c.clip();
  GM[CZ.game].draw(c, dt);
  c.restore();
  drawBetBar(c);
}
function drawCasinoSidebar(c) {
  const x = 16, w = 362, t = G.time;
  rr(c, x, 84, w, 984, 18); c.fillStyle = 'rgba(12,4,26,.88)'; c.fill();
  neonRR(c, x, 84, w, 984, 18, { w: 2, speed: .8, a: .7 });
  neonText(c, '幸運賭場', x + w / 2, 118, 34, '#ff4ad8', { flicker: true, core: '#ffffff' });
  txt(c, '贏金幣・抽道具・拿限定塔', x + w / 2, 150, { size: 14, color: 'rgba(255,220,255,.7)', weight: 700 });
  let y = 172;
  for (const z of CZONES) {
    txt(c, `${z.e} ${z.n}`, x + 18, y + 14, { size: 17, align: 'left', color: z.col, weight: 900 });
    c.fillStyle = rgba(z.col, .4); c.fillRect(x + 120, y + 14, w - 140, 2);
    y += 32;
    for (const gm of CGAMES.filter(q => q.z === z.id)) {
      const sel = CZ.game === gm.id, hov = !UI.noHover && hit(x + 12, y, w - 24, 76);
      const busy = GM[CZ.game].busy();
      rr(c, x + 12, y, w - 24, 76, 14);
      const gg = c.createLinearGradient(x, y, x + w, y + 76); gg.addColorStop(0, sel ? mixHex(z.col, '#1a0830', .55) : 'rgba(40,20,70,.7)'); gg.addColorStop(1, sel ? mixHex(z.col, '#0a0418', .75) : 'rgba(20,10,40,.7)');
      c.fillStyle = gg; c.fill();
      if (sel) neonRR(c, x + 12, y, w - 24, 76, 14, { col: z.col, w: 2.5 });
      else { c.lineWidth = 1.5; c.strokeStyle = hov ? rgba(z.col, .8) : 'rgba(255,255,255,.12)'; c.stroke(); }
      c.font = `40px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
      c.save(); if (sel) { c.translate(x + 52, y + 38); c.rotate(Math.sin(t * 4) * .12); c.fillText(gm.e, 0, 0); } else c.fillText(gm.e, x + 52, y + 38); c.restore();
      txt(c, gm.n, x + 92, y + 20, { size: 20, align: 'left', color: sel ? '#ffffff' : '#e8dcff', weight: 900 });
      txt(c, gm.d, x + 92, y + 42, { size: 13, align: 'left', color: 'rgba(230,215,255,.7)', weight: 600 });
      txt(c, GM[gm.id].odds(), x + 92, y + 62, { size: 13, align: 'left', color: '#7affb0', weight: 800 });
      if (!sel) UI.nh.push({ id: 'cg_' + gm.id, x: x + 12, y, w: w - 24, h: 76, fn: () => { if (busy) { toast('目前這局還沒結束', '#ff8a8a'); return; } CZ.game = gm.id; stopAuto(); } });
      y += 84;
    }
    y += 6;
  }
  // 賭運狀態與戰績
  y = Math.max(y, 860);
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 16, y - 6, w - 32, 1);
  txt(c, '🍀 賭運加成', x + 18, y + 12, { size: 16, align: 'left', color: '#7affb0', weight: 900 });
  const n = drawCasinoBoosts(c, x + 18, y + 38);
  if (!n) txt(c, `幸運重來機率 ${Math.round(casinoLuck() * 100)}%（使用幸運符可提升）`, x + 18, y + 38, { size: 13, align: 'left', color: 'rgba(255,255,255,.5)', weight: 600 });
  const hy = Math.max(y + 46 + n * 22, 960);
  txt(c, '最近戰績', x + 18, hy, { size: 15, align: 'left', color: '#ffe080', weight: 900 });
  CZ.hist.slice(0, 7).forEach((h, i) => {
    const hx = x + 18 + i * 48, gm = CGAMES.find(q => q.id === h.g);
    rr(c, hx, hy + 16, 42, 58, 8); c.fillStyle = h.v > 0 ? 'rgba(60,200,100,.25)' : h.v < 0 ? 'rgba(255,60,60,.2)' : 'rgba(255,255,255,.08)'; c.fill();
    c.font = `20px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(gm.e, hx + 21, hy + 34);
    txt(c, (h.v > 0 ? '+' : '') + fmt(h.v), hx + 21, hy + 60, { size: 11, color: h.v > 0 ? '#7affb0' : h.v < 0 ? '#ff8a8a' : '#ccc', weight: 800 });
  });
}
function drawBetBar(c) {
  const X = STG.x, Y = 864, Wd = STG.w, Hd = 204, gid = CZ.game, g = GM[gid];
  rr(c, X, Y, Wd, Hd, 18); const bg = c.createLinearGradient(0, Y, 0, Y + Hd); bg.addColorStop(0, 'rgba(30,10,56,.95)'); bg.addColorStop(1, 'rgba(10,4,24,.95)'); c.fillStyle = bg; c.fill();
  neonRR(c, X, Y, Wd, Hd, 18, { col: '#ffcf3a', w: 2, a: .8 });
  const busy = g.busy(), bet = curBet(gid), opts = g.betOpts || BET_OPTS;
  txt(c, '選擇押注', X + 28, Y + 26, { size: 17, align: 'left', color: '#ffe080', weight: 900 });
  opts.forEach((v, i) => {
    const cx = X + 60 + i * 84, cy = Y + 82, dis = v > R.gold && v !== bet;
    chip(c, cx, cy, 33, v, v === bet, dis);
    if (!busy) UI.nh.push({ id: 'chip' + v, x: cx - 36, y: cy - 40, w: 72, h: 80, fn: () => { CZ.bet[gid] = v; AU.play('coin'); } });
  });
  const stars = qualStars(bet);
  txt(c, `目前押注 ${fmtComma(bet)} 金`, X + 28, Y + 140, { size: 20, align: 'left', color: '#ffffff', weight: 900 });
  txt(c, '道具品質 ' + '★'.repeat(stars) + '☆'.repeat(5 - stars), X + 260, Y + 140, { size: 17, align: 'left', color: rarCol(stars - 1), weight: 900 });
  const inf = g.betInfo ? g.betInfo(bet) : '';
  c.font = font(15, 700); const lines = wrapLines(c, inf, 640).slice(0, 2);
  lines.forEach((l, i) => txt(c, l, X + 28, Y + 170 + i * 20, { size: 15, align: 'left', color: '#c8f0ff', weight: 700 }));
  // 自動
  const ax = X + 740;
  txt(c, '全自動', ax, Y + 26, { size: 17, align: 'left', color: '#7affb0', weight: 900 });
  if (g.noAuto) txt(c, '這個遊戲需要手動操作', ax, Y + 70, { size: 15, align: 'left', color: 'rgba(255,255,255,.5)', weight: 600 });
  else if (CZ.auto) {
    button('autoStop', ax, Y + 46, 300, 56, `⏹ 停止自動（剩 ${CZ.auto.left} 局）`, { style: 'red', size: 18, fn: () => stopAuto() });
    txt(c, '大獎（30 倍以上）或金幣不足時會自動暫停', ax, Y + 124, { size: 13, align: 'left', color: 'rgba(255,255,255,.55)', weight: 600 });
  } else {
    [10, 25, 50].forEach((n, i) => button('auto' + n, ax + i * 104, Y + 46, 96, 56, `自動 ×${n}`, { style: 'green', size: 17, disabled: busy, fn: () => startAuto(n), tip: `自動連續玩 ${n} 局（每局押注 ${bet}）` }));
    txt(c, '大獎或金幣不足時會自動暫停', ax, Y + 124, { size: 13, align: 'left', color: 'rgba(255,255,255,.55)', weight: 600 });
  }
  // 主要按鈕
  const a = g.action();
  if (a) {
    const bx = X + Wd - 400, by = Y + 30, bw = 372, bh = 144, ok = a.enabled !== false;
    c.save();
    if (ok) { c.globalCompositeOperation = 'lighter'; glow(c, bx + bw / 2, by + bh / 2, 260, a.glow || '#ffaa30', .3 + .1 * Math.sin(G.time * 5)); c.globalCompositeOperation = 'source-over'; }
    button('cMain', bx, by, bw, bh, '', { style: a.style || 'gold', disabled: !ok, fn: a.fn, r: 28 });
    txt(c, a.label, bx + bw / 2, by + (a.sub ? 58 : 72), { size: 44, weight: 900, color: '#ffffff', stroke: 'rgba(60,0,20,.8)', sw: 7 });
    if (a.sub) txt(c, a.sub, bx + bw / 2, by + 108, { size: 18, color: '#fff8e0', weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 3 });
    c.restore();
    if (a.second) button('cSecond', bx - 200, by + 30, 184, 84, a.second.label, { style: a.second.style || 'dark', size: 20, disabled: a.second.enabled === false, fn: a.second.fn });
  }
}

// ======================================================================
// 1. 命運拉霸
// ======================================================================
const SL_LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const SL_LCOL = ['#ffcf3a', '#ff4ad8', '#3ae8ff', '#7cff3a', '#ff8a3a'];
const SL_SPECIAL = { seven: 1, chest: 1, potion: 1, crown: 1 };
// 每條線的賠率（每線押注 = 總押注 ÷ 5）
const SL_PAY = { cherry: 5, bell: 5, bar: 6, diamond: 10, seven: 20, wild: 40, chest: 2, potion: 2, crown: 5, cherry2: 1 };
const SL_BONUS = { seven: 3, wild: 5 };
const SL_COL = { cherry: '#ff3a5a', bell: '#ffcf3a', bar: '#ff8a3a', diamond: '#5ab8ff', seven: '#ff2a2a', chest: '#ffb030', potion: '#7cff3a', crown: '#ffe060', wild: '#ffffff' };
const SL = { reels: [], spinning: false, phase: 'idle', t: 0, wins: [], winT: 9, msg: '選好押注，拉下拉桿！', msgCol: '#ffe6a0', reach: null, lever: 0, nudge: null, bet: 0, winGold: 0, shown: 0, lastLevel: 0, mode: 'lever', ver: 0, stat: null, statKey: '' };
const SLG = { cx: 830, x: 533, y: 302, cw: 190, ch: 138, gap: 12 };
function slMode() { return G.settings.slotMode || 'lever'; }
// 遺物加的符號只放在中間滾輪，避免機率失控
function slStrip(i) {
  const m = R.mods, cnt = {};
  for (const k of SYM_KEYS) cnt[k] = SYM[k].c;
  if (i === 1) { cnt.seven += Math.round(m.sevenW); cnt.wild += Math.round(m.wildW); cnt.chest += Math.round(m.bonusW); cnt.potion += Math.round(m.bonusW); }
  const arr = []; for (const k in cnt) for (let n = 0; n < cnt[k]; n++) arr.push(k);
  shuffle(arr);
  for (let n = 0; n < arr.length; n++) if (SL_SPECIAL[arr[n]] && arr[n] === arr[(n + 1) % arr.length]) { const j = (n + 4) % arr.length; [arr[n], arr[j]] = [arr[j], arr[n]]; }
  return arr;
}
function slInit() { SL.reels = [0, 1, 2].map(i => ({ strip: slStrip(i), pos: randi(0, 20), spd: 0, state: 'idle', from: 0, to: 0, t: 0, dur: .3, ant: false, bounce: 0, stopAt: 0, target: 0 })); SL.spinning = false; SL.phase = 'idle'; SL.wins = []; SL.ver++; }
function slRebuild() { if (!R || SL.spinning || !SL.reels.length) return; SL.reels.forEach((r, i) => { r.strip = slStrip(i); r.pos = Math.round(r.pos) % r.strip.length; }); SL.ver++; }
const md = (k, L) => ((k % L) + L) % L;
function slSym(r, k) { return r.strip[md(k, r.strip.length)]; }
function slVis(r, pos) { const c = Math.round(pos ?? r.pos); return [slSym(r, c + 1), slSym(r, c), slSym(r, c - 1)]; }
// 一條線的結果：彩色球（wild）可以變成任何圖案
function slLine(a, b, c) {
  if (a === 'wild' && b === 'wild' && c === 'wild') return 'wild';
  const real = [a, b, c].filter(s => s !== 'wild');
  if (real.every(s => s === real[0])) return real[0];
  if ((a === 'cherry' || a === 'wild') && (b === 'cherry' || b === 'wild') && (a === 'cherry' || b === 'cherry')) return 'cherry2';
  return null;
}
function slEval(vis) {
  const wins = [];
  SL_LINES.forEach((ln, li) => { const s = slLine(vis[0][ln[0]], vis[1][ln[1]], vis[2][ln[2]]); if (s) wins.push({ s, li, n: s === 'cherry2' ? 2 : 3 }); });
  return wins;
}
const slBig = w => w.some(q => SL_SPECIAL[q.s] || q.s === 'wild');
function slNudgeChance() { return Math.min(.9, .1 + .25 * luckFactor(getLuck()) + R.mods.nudge); }
// 依目前三條滾輪「逐一列舉所有停輪位置」算出精確機率（自動停輪時）
function slStats() {
  if (!SL.reels.length) return { hit: 0, win: 0, rtp: 0, bonus: 0, sym: {} };
  const ch = slNudgeChance(), mr = maryRoundEV(), key = SL.ver + '|' + ch.toFixed(3) + '|' + R.mods.lottoRounds + '|' + mr.toFixed(3);
  if (SL.stat && SL.statKey === key) return SL.stat;
  const S = SL.reels.map(r => r.strip), L = S.map(s => s.length), sym = {};
  const v3 = (i, p) => { const s = S[i], n = L[i]; return [s[md(p + 1, n)], s[md(p, n)], s[md(p - 1, n)]]; };
  let N = 0, hit = 0, win = 0, rtp = 0, bonus = 0;
  for (let a = 0; a < L[0]; a++) for (let b = 0; b < L[1]; b++) for (let c = 0; c < L[2]; c++) {
    N++;
    const P = [a, b, c], v = [v3(0, a), v3(1, b), v3(2, c)], w = slEval(v);
    if (!w.length) {
      const cand = [];
      for (let i = 0; i < 3; i++) for (const d of [1, -1]) { const v2 = v.slice(); v2[i] = v3(i, P[i] + d); const w2 = slEval(v2); if (w2.length && !slBig(w2)) cand.push(w2); }
      if (!cand.length) continue;
      hit += ch;
      for (const w2 of cand) { const f = ch / cand.length, pay = w2.reduce((t, q) => t + SL_PAY[q.s] / 5, 0); rtp += f * pay; if (pay >= 1) win += f; for (const s of new Set(w2.map(q => q.s))) sym[s] = (sym[s] || 0) + f; }
      continue;
    }
    hit++;
    let pay = 0, rounds = 0, prize = false;
    for (const q of w) { pay += SL_PAY[q.s] / 5; if (SL_BONUS[q.s]) rounds += SL_BONUS[q.s] + R.mods.lottoRounds; if (q.s === 'chest' || q.s === 'potion' || q.s === 'crown') prize = true; }
    for (const s of new Set(w.map(q => q.s))) sym[s] = (sym[s] || 0) + 1;
    if (rounds) bonus++;
    if (pay >= 1 || rounds || prize) win++;
    rtp += pay + rounds * mr;
  }
  for (const k in sym) sym[k] /= N;
  SL.stat = { hit: hit / N, win: win / N, rtp: rtp / N, bonus: bonus / N, sym }; SL.statKey = key;
  return SL.stat;
}
function slSpin(fromAuto) {
  if (SL.spinning) { if (slMode() === 'slot' && !fromAuto) slStopNext(); return; }
  const bet = curBet('slot');
  if (!payBet(bet)) return;
  SL.bet = bet; SL.wins = []; SL.reach = null; SL.nudge = null; SL.winGold = 0; SL.shown = 0; SL.msg = ''; SL.lastLevel = 0;
  SL.spinning = true; SL.phase = 'spin'; SL.t = 0; SL.manual = slMode() === 'slot' && !fromAuto && !CZ.auto;
  SL.reels.forEach((r, i) => { r.state = 'spin'; r.spd = 0; r.ant = false; r.stopAt = SL.manual ? 9 + i * .4 : .6 + i * .32; r.target = randi(0, r.strip.length - 1); });
  if (!SL.manual) { SL.lever = 1; AU.play('lever'); }
  AU.play('spin');
}
function slStopNext() { const i = SL.reels.findIndex(r => r.state === 'spin'); if (i >= 0) slStop(i); }
function slStop(i) {
  const r = SL.reels[i];
  if (!SL.spinning || r.state !== 'spin' || SL.t < .35) return;
  if (SL.manual) { const slip = Math.random() < .55 ? 0 : 1; r.to = Math.ceil(r.pos + .12) + slip; r.dur = .16 + slip * .06; }
  else { const L = r.strip.length; let T = Math.ceil(r.pos) + 3; while (md(T, L) !== r.target) T++; r.to = T; r.dur = r.ant ? .9 : .38; }
  r.from = r.pos; r.t = 0; r.state = 'stop';
}
function slReach() {
  const st = SL.reels.map(r => r.state === 'idle');
  if (st.filter(Boolean).length !== 2) return null;
  const vis = SL.reels.map(r => slVis(r));
  let best = null;
  for (const ln of SL_LINES) {
    const real = [0, 1, 2].filter(i => st[i]).map(i => vis[i][ln[i]]).filter(s => s !== 'wild');
    if (!real.length) return { s: 'wild', big: true };
    if (!real.every(s => s === real[0])) continue;
    if (real[0] === 'seven') return { s: 'seven', big: true };
    if (SL_SPECIAL[real[0]]) { if (!best || !best.big) best = { s: real[0], big: true }; }
    else if (!best) best = { s: real[0], big: false };
  }
  return best;
}
function slUpdate(dt) {
  if (SL.lever > 0) SL.lever = Math.max(0, SL.lever - dt * 2.2);
  SL.winT += dt;
  if (SL.shown < SL.winGold) SL.shown = Math.min(SL.winGold, SL.shown + Math.max(1, SL.winGold * dt * 2.2));
  for (const r of SL.reels) if (r.bounce > 0) r.bounce = Math.max(0, r.bounce - dt * 4);
  if (!SL.spinning) return;
  SL.t += dt;
  if (SL.phase === 'nudge') {
    const n = SL.nudge; n.t += dt; const r = SL.reels[n.i], k = Math.min(1, n.t / .55);
    r.pos = lerp(n.from, n.to, easeOutBack(k)); if (k >= 1) { r.pos = n.to; slFinish(); }
    return;
  }
  SL.reels.forEach((r, i) => {
    if (r.state === 'spin') {
      const V = SL.manual ? 8.5 : (r.ant ? 26 : 20);
      r.spd = Math.min(V, r.spd + dt * 70);
      const b = Math.floor(r.pos); r.pos += r.spd * dt; if (Math.floor(r.pos) !== b) AU.play('tick');
      if (SL.t >= r.stopAt) slStop(i);
    } else if (r.state === 'stop') {
      r.t += dt; const k = Math.min(1, r.t / r.dur); r.pos = lerp(r.from, r.to, easeOutBack(k));
      if (k >= 1) {
        r.pos = r.to; r.state = 'idle'; r.bounce = 1; AU.play('stop', i);
        const rc = slReach();
        if (rc && !SL.reach) { SL.reach = rc; if (rc.big) { AU.play('reach'); const last = SL.reels.find(q => q.state === 'spin'); if (last) { last.ant = true; if (!SL.manual) last.stopAt = SL.t + 1.8; } flash(.2, SL_COL[rc.s] || '#fff'); shake(4); } }
      }
    }
  });
  if (SL.phase === 'spin' && SL.reels.every(r => r.state === 'idle')) {
    const wins = slEval(SL.reels.map(r => slVis(r)));
    // 幸運微調：沒中獎時依「微調機率」把某一輪推一格（只會推出一般獎，不會推出大獎）
    if (!wins.length && Math.random() < slNudgeChance()) {
      const cand = [];
      for (let i = 0; i < 3; i++) for (const d of [1, -1]) {
        const w2 = slEval(SL.reels.map((r, j) => slVis(r, j === i ? r.pos + d : r.pos)));
        if (w2.length && !slBig(w2)) cand.push({ i, d });
      }
      if (cand.length) {
        const c0 = pick(cand), r = SL.reels[c0.i];
        SL.nudge = { i: c0.i, from: r.pos, to: r.pos + c0.d, t: 0 }; SL.phase = 'nudge'; AU.play('nudge');
        floatText(fxU, SLG.x + c0.i * (SLG.cw + SLG.gap) + SLG.cw / 2, SLG.y - 10, '幸運微調！', '#7affb0', 30, { life: 1.4, vy: -30, stroke: '#003a1a', sw: 6, force: true });
        return;
      }
    }
    slFinish();
  }
}
function slFinish() {
  SL.spinning = false; SL.phase = 'idle'; SL.winT = 0;
  const wins = slEval(SL.reels.map(r => slVis(r))), bet = SL.bet, lb = bet / 5, q = betQual(bet);
  let pay = 0; const o = { x: SLG.cx, y: SLG.y + 210 }; const msgs = [];
  let bonus = 0, sup = false;
  for (const w of wins) {
    pay += SL_PAY[w.s] * lb;
    if (w.s === 'diamond') R.gems += 1;
    if (w.s === 'chest') { o.item = q + .3; o.items = (o.items || 0) + 1; msgs.push('道具'); }
    if (w.s === 'potion') { o.buff = q + .3; msgs.push('增益'); }
    if (w.s === 'crown') { o.sp = q + .5; msgs.push('限定塔'); }
    if (SL_BONUS[w.s]) { bonus += SL_BONUS[w.s] + R.mods.lottoRounds; if (w.s === 'wild') sup = true; }
  }
  if (o.items && o.item == null) o.item = q;
  if (!wins.length && casinoTryLuck()) { R.gold += bet; SL.msg = '幸運重來！免費再轉一次'; SL.msgCol = '#7affb0'; slSpin(true); return; }
  SL.wins = wins;
  if (bonus) o.noCele = true;
  const gain = settle('slot', bet, pay, o);
  SL.winGold = gain; SL.lastLevel = gain >= bet * 10 ? 2 : wins.length ? 1 : 0;
  const usedBall = wins.some(w => w.s !== 'wild' && SL_LINES[w.li].slice(0, w.n).some((row, i) => slVis(SL.reels[i])[row] === 'wild'));
  SL.msg = wins.length ? (wins.length >= 2 ? `${wins.length} 線連線！` : '中獎！') + (usedBall ? ' 🌈彩球變身' : '') + (msgs.length ? ' ' + msgs.join('・') : '') : '可惜！差一點點……';
  SL.msgCol = wins.length ? '#ffe080' : '#a8a0c8';
  for (const w of wins) SL_LINES[w.li].forEach((row, i) => { const [x, y] = slCell(i, row); burst(fxU, x, y, 14, { col: [SL_LCOL[w.li], SL_COL[w.s] || '#fff', '#fff'], smax: 360, force: true }); });
  if (bonus) { stopAuto(); CZ.returnTo = 'slot'; setTimeout(() => { if (R) { CZ.game = 'mary'; maryStartBonus(bet, bonus, sup ? 'SUPER BONUS' : 'BIG BONUS'); } }, 900); flash(.6, '#ffffff'); AU.play('jackpot'); }
}
// 彩色球在這一格代表了哪些圖案
function slBallAs(i, row) {
  const out = [];
  for (const w of SL.wins) {
    if (w.s === 'wild' || SL_LINES[w.li][i] !== row || (w.n === 2 && i >= 2)) continue;
    const s = w.s === 'cherry2' ? 'cherry' : w.s;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
function slCell(i, row) { return [SLG.x + i * (SLG.cw + SLG.gap) + SLG.cw / 2, SLG.y + row * SLG.ch + SLG.ch / 2]; }
function slDraw(c) {
  const t = G.time, manual = slMode() === 'slot', hot = SL.reach && SL.reach.big && SL.spinning;
  const X = 440, Y = 160, Wd = 780, Hd = 690;
  c.save(); c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 30;
  rr(c, X, Y, Wd, Hd, 34); let g = c.createLinearGradient(0, Y, 0, Y + Hd);
  if (hot) { g.addColorStop(0, '#5a0a2a'); g.addColorStop(1, '#2a0410'); } else { g.addColorStop(0, '#3a0a5a'); g.addColorStop(.5, '#14042a'); g.addColorStop(1, '#2a0840'); }
  c.fillStyle = g; c.fill(); c.restore();
  neonRR(c, X, Y, Wd, Hd, 34, { w: 5, speed: hot ? 6 : 1.4 });
  bulbs(c, X + 10, Y + 10, Wd - 20, Hd - 20, 60, SL.spinning ? (hot ? 50 : 26) : SL.winT < 3 && SL.lastLevel ? 12 : 5, hot);
  neonText(c, manual ? '命運 SLOT' : '命運拉霸', SLG.cx, Y + 48, 44, manual ? '#3ae8ff' : '#ff4ad8', { flicker: true, core: '#ffffff' });
  button('slModeL', X + 40, Y + 82, 150, 40, '🎰 拉霸機', { size: 17, style: !manual ? 'gold' : 'dark', disabled: SL.spinning, fn: () => { G.settings.slotMode = 'lever'; saveMeta(); }, tip: '拉下拉桿，滾輪自動依序停下' });
  button('slModeS', X + 198, Y + 82, 150, 40, '🎮 SLOT 目押', { size: 17, style: manual ? 'blue' : 'dark', disabled: SL.spinning, fn: () => { G.settings.slotMode = 'slot'; saveMeta(); }, tip: '自己按 STOP（或 ← ↓ →）停輪，抓準時機！' });
  txt(c, '每條線押注 = 總押注 ÷ 5', X + Wd - 44, Y + 102, { size: 15, align: 'right', color: '#e0d0ff', weight: 700 });
  const rx = SLG.x, ry = SLG.y, RW = SLG.cw * 3 + SLG.gap * 2, RH = SLG.ch * 3;
  rr(c, rx - 16, ry - 16, RW + 32, RH + 32, 20); c.fillStyle = '#06020e'; c.fill();
  neonRR(c, rx - 16, ry - 16, RW + 32, RH + 32, 20, { w: 3, speed: -2, col: hot ? null : '#c89aff' });
  SL_LINES.forEach((ln, li) => {
    const lit = !SL.spinning && SL.wins.some(w => w.li === li);
    const ly = ry + ln[0] * SLG.ch + SLG.ch / 2 + (li >= 3 ? (li === 3 ? -26 : 26) : 0);
    c.beginPath(); c.arc(rx - 36, ly, 12, 0, TAU); c.fillStyle = lit ? SL_LCOL[li] : rgba(SL_LCOL[li], .25); c.fill();
    if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, rx - 36, ly, 30, SL_LCOL[li], 1); c.restore(); }
    txt(c, '' + (li + 1), rx - 36, ly + 1, { size: 13, color: lit ? '#000' : '#fff', weight: 900 });
  });
  SL.reels.forEach((r, i) => {
    const x = rx + i * (SLG.cw + SLG.gap);
    c.save(); c.beginPath(); c.rect(x, ry, SLG.cw, RH); c.clip();
    g = c.createLinearGradient(x, 0, x + SLG.cw, 0); g.addColorStop(0, '#d8d0e8'); g.addColorStop(.5, '#ffffff'); g.addColorStop(1, '#c8c0d8');
    c.fillStyle = g; c.fillRect(x, ry, SLG.cw, RH);
    const fast = r.state === 'spin' && r.spd > 12, base = Math.floor(r.pos), bo = r.bounce > 0 ? Math.sin(r.bounce * Math.PI) * 6 : 0;
    for (let k = base - 2; k <= base + 2; k++) {
      const y = ry + (r.pos - k + 1) * SLG.ch + bo; if (y < ry - SLG.ch || y > ry + RH) continue;
      const s = slSym(r, k), img = getSym(s), row = Math.round(r.pos) - k + 1;
      const win = !SL.spinning && r.state === 'idle' && SL.wins.some(w => SL_LINES[w.li][i] === row && (w.n === 3 || i < 2));
      const sz = SLG.ch - 12;
      if (fast) { c.globalAlpha = .55; c.drawImage(img, x + SLG.cw / 2 - sz / 2, y - 10, sz, sz + 16); c.globalAlpha = .3; c.drawImage(img, x + SLG.cw / 2 - sz / 2, y + 16, sz, sz - 10); c.globalAlpha = 1; }
      else if (win) {
        const p = .5 + .5 * Math.sin(SL.winT * 9), s2 = sz * (1.04 + .08 * p); c.fillStyle = rgba(SL_COL[s] || '#ffcf3a', .25 + .2 * p); c.fillRect(x, y, SLG.cw, SLG.ch); c.drawImage(img, x + SLG.cw / 2 - s2 / 2, y + SLG.ch / 2 - s2 / 2, s2, s2);
        if (s === 'wild') {
          const as = slBallAs(i, row);
          if (as.length) {
            const bw = as.length * 40 + 30, bx = x + SLG.cw - bw - 4, by = y + SLG.ch - 46;
            rr(c, bx, by, bw, 42, 21); c.fillStyle = 'rgba(20,0,40,.88)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = rainbow(t * 300); c.stroke();
            txt(c, '=', bx + 14, by + 21, { size: 20, weight: 900, color: '#ffffff' });
            as.forEach((q, k) => c.drawImage(getSym(q), bx + 26 + k * 40, by + 2, 38, 38));
          }
        }
      }
      else { if (!SL.spinning && SL.wins.length && SL.winT < 4) c.globalAlpha = .4; c.drawImage(img, x + SLG.cw / 2 - sz / 2, y + 6, sz, sz); c.globalAlpha = 1; }
    }
    g = c.createLinearGradient(0, ry, 0, ry + RH); g.addColorStop(0, 'rgba(20,0,40,.75)'); g.addColorStop(.22, 'rgba(0,0,0,0)'); g.addColorStop(.78, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,0,40,.75)');
    c.fillStyle = g; c.fillRect(x, ry, SLG.cw, RH);
    if (r.ant && r.state !== 'idle') { c.globalCompositeOperation = 'lighter'; const col = SL_COL[SL.reach ? SL.reach.s : 'seven'] || '#f22'; c.fillStyle = rgba(col, .25 + .2 * Math.sin(t * 30)); c.fillRect(x, ry, SLG.cw, RH); for (let k = 0; k < 4; k++) glow(c, x + SLG.cw / 2, ry + ((t * 900 + k * 110) % RH), 70, col, .6); c.globalCompositeOperation = 'source-over'; }
    c.restore();
    if (r.ant && r.state !== 'idle') neonRR(c, x - 3, ry - 3, SLG.cw + 6, RH + 6, 8, { w: 4, speed: 8 });
    if (i > 0) { c.fillStyle = 'rgba(80,40,120,.85)'; c.fillRect(x - SLG.gap, ry, SLG.gap, RH); }
    if (SL.manual && SL.spinning) {
      const can = r.state === 'spin' && SL.t >= .35;
      button('slStop' + i, x + 14, ry + RH + 22, SLG.cw - 28, 52, can ? 'STOP' : '—', { size: 24, style: can ? 'red' : 'dark', disabled: !can, fn: () => slStop(i), tip: ['快捷鍵 ←', '快捷鍵 ↓', '快捷鍵 →'][i] });
    }
  });
  if (!SL.spinning && SL.wins.length) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const w of SL.wins) {
      const pts = SL_LINES[w.li].map((row, i) => slCell(i, row)).slice(0, w.n), col = SL_LCOL[w.li];
      for (const [lw, a] of [[18, .18], [8, .5], [3, 1]]) { c.strokeStyle = rgba(col, a * (.6 + .4 * Math.sin(SL.winT * 8))); c.lineWidth = lw; c.beginPath(); c.moveTo(rx - 8, pts[0][1]); pts.forEach(p => c.lineTo(p[0], p[1])); c.stroke(); }
    }
    c.restore();
  }
  if (SL.spinning && SL.reach) { const s = 1 + .08 * Math.sin(t * 14); c.save(); c.translate(SLG.cx, ry - 30); c.scale(s, s); neonText(c, SL.reach.big ? (SL.reach.s === 'seven' ? '7 REACH!!' : SL.reach.s === 'wild' ? '彩球 REACH!!' : 'BONUS REACH!!') : 'REACH!', 0, 0, SL.reach.big ? 40 : 28, SL.reach.big ? rainbow(t * 600) : '#ffe080', { core: '#ffffff' }); c.restore(); }
  // 拉桿
  if (!manual) {
    const lx = X + Wd - 40, ly0 = ry + 30, pull = SL.lever > 0 ? Math.sin(Math.min(1, SL.lever) * Math.PI) : 0, ky = ly0 + pull * 200;
    rr(c, lx - 12, ry + 170, 24, 80, 8); c.fillStyle = '#6a6a7a'; c.fill();
    c.strokeStyle = '#c8c8d8'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx, ry + 210); c.lineTo(lx, ky); c.stroke();
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, lx, ky, 46, '#ff2a4a', .6 + .2 * Math.sin(t * 5)); c.restore();
    c.beginPath(); c.arc(lx, ky, 20, 0, TAU); const kg = c.createRadialGradient(lx - 6, ky - 7, 2, lx, ky, 20); kg.addColorStop(0, '#ffd0d8'); kg.addColorStop(.5, '#ff2a3a'); kg.addColorStop(1, '#6a0010'); c.fillStyle = kg; c.fill();
    if (!SL.spinning) UI.nh.push({ id: 'slLever', x: lx - 30, y: ly0 - 30, w: 60, h: 250, fn: () => slSpin() });
  }
  // 中獎顯示
  const wy = ry + RH + 86;
  rr(c, rx - 16, wy, RW + 32, 54, 27); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill(); neonRR(c, rx - 16, wy, RW + 32, 54, 27, { col: '#ffcf3a', w: 2 });
  if (SL.winGold > 0 && !SL.spinning) { txt(c, 'WIN', rx + 30, wy + 27, { size: 20, color: '#ffe080', weight: 900 }); goldText(c, fmtComma(SL.shown), SLG.cx + 20, wy + 28, 36, { glow: '#ffcf3a' }); }
  else txt(c, SL.spinning ? (SL.manual ? '按下 STOP 停輪！' : '轉動中……') : SL.msg, SLG.cx, wy + 27, { size: 20, color: SL.spinning ? '#ffffff' : SL.msgCol, weight: 800 });
  // 賠率與機率
  const px = 1250, py = 160, pw = 640, ph = 690, st = slStats();
  rr(c, px, py, pw, ph, 22); c.fillStyle = 'rgba(10,4,24,.85)'; c.fill(); neonRR(c, px, py, pw, ph, 22, { col: '#ffcf3a', w: 2 });
  neonText(c, '賠率與機率', px + pw / 2, py + 32, 28, '#ffcf3a', { core: '#ffffff' });
  const lb = curBet('slot') / 5;
  txt(c, `押注 ${fmtComma(curBet('slot'))}（每條線 ${fmt(lb)}）・同一條線三個一樣就中`, px + pw / 2, py + 64, { size: 15, color: '#e0d0ff', weight: 700 });
  txt(c, '每次轉動出現的機率', px + pw - 22, py + 88, { size: 12, align: 'right', color: '#7affb0', weight: 800 });
  const rows = [
    ['wild', '×' + SL_PAY.wild, `${fmtComma(lb * SL_PAY.wild)} 金＋超級大抽獎 ${SL_BONUS.wild + R.mods.lottoRounds} 回合`],
    ['seven', '×' + SL_PAY.seven, `${fmtComma(lb * SL_PAY.seven)} 金＋小瑪莉大抽獎 ${SL_BONUS.seven + R.mods.lottoRounds} 回合`],
    ['diamond', '×' + SL_PAY.diamond, `${fmtComma(lb * SL_PAY.diamond)} 金＋1 寶石`],
    ['bar', '×' + SL_PAY.bar, `${fmtComma(lb * SL_PAY.bar)} 金`],
    ['bell', '×' + SL_PAY.bell, `${fmtComma(lb * SL_PAY.bell)} 金`],
    ['cherry', '×' + SL_PAY.cherry, `${fmtComma(lb * SL_PAY.cherry)} 金（只有前兩個櫻桃 = ${fmt(lb * SL_PAY.cherry2)} 金）`],
    ['crown', '★', `賭場限定塔＋${fmt(lb * 5)} 金`],
    ['chest', '★', '隨機道具（押越多品質越好）'],
    ['potion', '★', '隨機增益 Buff（持續數波）'],
  ];
  rows.forEach(([s, m, d], i) => {
    const yy = py + 98 + i * 58, act = !SL.spinning && SL.wins.some(w => w.s === s || (s === 'cherry' && w.s === 'cherry2'));
    if (act) { rr(c, px + 12, yy - 3, pw - 24, 54, 12); c.fillStyle = rgba(SL_COL[s], .25); c.fill(); }
    for (let k = 0; k < 3; k++) c.drawImage(getSym(s), px + 18 + k * 42, yy + 2, 44, 44);
    txt(c, m, px + 156, yy + 24, { size: 21, color: SL_COL[s], weight: 900, align: 'left', stroke: 'rgba(0,0,0,.6)', sw: 4 });
    c.font = font(15, 700); const dl = wrapLines(c, d, 300);
    dl.slice(0, 2).forEach((l, k) => txt(c, l, px + 222, yy + 24 + (k - (Math.min(2, dl.length) - 1) / 2) * 19, { size: 15, align: 'left', color: '#ffffff', weight: 700 }));
    txt(c, pct(st.sym[s] || 0), px + pw - 22, yy + 24, { size: 16, align: 'right', color: '#7affb0', weight: 900 });
  });
  const sy = py + ph - 66;
  rr(c, px + 12, sy, pw - 24, 56, 12); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
  txt(c, `中獎率 ${pct(st.hit)}・贏回押注以上 ${pct(st.win)}・長期回收約 ${Math.round(st.rtp * 100)}%`, px + pw / 2, sy + 17, { size: 15, color: '#ffe080', weight: 900 });
  txt(c, '🌈 彩色球可以變成任何圖案，還能同時在不同連線變成不同圖案！', px + pw / 2, sy + 41, { size: 14, color: '#ffffff', weight: 700 });
  if (!UI.noHover && hit(px + 12, sy, pw - 24, 56)) UI.tip = { title: '機率怎麼算的？', col: '#7affb0', lines: ['把三條滾輪「所有停輪位置」全部列舉一遍算出的精確機率（自動停輪時）', `已包含「幸運微調」：沒中獎時有 ${pct(slNudgeChance())} 會推一格變成一般獎`, 'SLOT 目押模式看你按的時機，抓得準可以更高', '長期回收 = 平均每押 100 金能拿回多少金幣（不含道具、增益）'] };
}

// ======================================================================
// 2. 小瑪莉（也是 777 的大抽獎）
// ======================================================================
// 每格的機率（%）——開獎時完全照這張表抽，加總 = 100%
const MARY_TILES = [
  { t: 'JACKPOT ×100', k: 'mul', v: 100, p: .05, col: '#ffffff', ic: 'wild' },
  { t: '×1.2', k: 'mul', v: 1.2, p: 15, col: '#f0e0a0', ic: 'coin' },
  { t: '銘謝惠顧', k: 'mul', v: 0, p: 21.7, col: '#6a6a8a', ic: '😢' },
  { t: '×5', k: 'mul', v: 5, p: 1.5, col: '#ff8a1a', ic: 'coin' },
  { t: '道具', k: 'item', p: 7, col: '#5cff7e', ic: 'chest' },
  { t: '×1 退回', k: 'mul', v: 1, p: 6, col: '#e0e4ec', ic: 'coin' },
  { t: '×10', k: 'mul', v: 10, p: .6, col: '#ff4ad8', ic: 'bell' },
  { t: '×1.5', k: 'mul', v: 1.5, p: 8, col: '#ffe9a0', ic: 'coin' },
  { t: '限定塔', k: 'sp', p: .6, col: '#ff3a6a', ic: 'crown' },
  { t: '×3', k: 'mul', v: 3, p: 3.5, col: '#ffb030', ic: 'coin' },
  { t: '銘謝惠顧', k: 'mul', v: 0, p: 21.7, col: '#6a6a8a', ic: '😢' },
  { t: '+2 回合', k: 'rounds', v: 2, p: 2, col: '#3ae8ff', ic: '🔁' },
  { t: '×20', k: 'mul', v: 20, p: .25, col: '#c868ff', ic: 'bar' },
  { t: '×2', k: 'mul', v: 2, p: 7, col: '#ffcf3a', ic: 'coin' },
  { t: '×50', k: 'mul', v: 50, p: .1, col: '#ff2a2a', ic: 'seven' },
  { t: '增益', k: 'buff', p: 5, col: '#ff6a3a', ic: 'potion' },
];
const MARY_ORDER = ['JACKPOT ×100', '×50', '×20', '×10', '限定塔', '×5', '×3', '×2', '×1.5', '×1.2', '道具', '增益', '+2 回合', '×1 退回', '銘謝惠顧'];
// 幸運值只會提高 ×20 以上大獎的權重（顯示的機率會跟著變）
function maryW(p) { return p.p * (p.k === 'mul' && p.v >= 20 ? 1 + luckFactor(getLuck()) : 1); }
function maryProbs() { const ws = MARY_TILES.map(maryW), tot = ws.reduce((a, b) => a + b, 0); return ws.map(w => w / tot); }
function maryWinP() { const ps = maryProbs(); return MARY_TILES.reduce((a, p, i) => a + (p.k !== 'mul' || p.v > 1 ? ps[i] : 0), 0); }
function maryRoundEV() { const ps = maryProbs(); let ev = 0, ex = 0; MARY_TILES.forEach((p, i) => { if (p.k === 'mul') ev += ps[i] * p.v; if (p.k === 'rounds') ex += ps[i] * p.v; }); return ev / Math.max(.2, 1 - ex); }
const MB = { cx: 1148, cy: 503, size: 660 };
const MARY = { state: 'idle', pos: 0, trail: [], rounds: 0, round: 0, total: 0, shown: 0, bet: 0, bonus: false, title: '', items: [], lastHit: -1, hitT: 0 };
function maryRect(i) {
  const cs = MB.size / 5, x0 = MB.cx - MB.size / 2, y0 = MB.cy - MB.size / 2;
  let gx, gy;
  if (i < 5) { gx = i; gy = 0; } else if (i < 8) { gx = 4; gy = i - 4; } else if (i < 13) { gx = 4 - (i - 8); gy = 4; } else { gx = 0; gy = 4 - (i - 12); }
  return { x: x0 + gx * cs + 5, y: y0 + gy * cs + 5, w: cs - 10, h: cs - 10 };
}
function maryPlay() {
  if (MARY.state !== 'idle' && MARY.state !== 'end') return;
  const bet = curBet('mary'); if (!payBet(bet)) return;
  Object.assign(MARY, { state: 'intro', t: .9, bet, bonus: false, rounds: 1, round: 0, total: 0, shown: 0, items: [], title: '小瑪莉', trail: [] });
  maryNext();
}
function maryStartBonus(bet, rounds, title) {
  Object.assign(MARY, { state: 'intro', t: 0, bet, bonus: true, rounds, round: 0, total: 0, shown: 0, items: [], title, trail: [] });
  R.stats.jackpots++; flash(.6, '#ffffff'); shake(10);
}
function maryNext() {
  const ps = maryProbs(); let r = Math.random(), idx = 0;
  for (; idx < ps.length - 1; idx++) { r -= ps[idx]; if (r < 0) break; }
  const d = (idx - MARY.pos + 16) % 16;
  MARY.steps = 16 * (MARY.round === 0 ? 2 : 1) + d; MARY.done = 0; MARY.stepT = 0; MARY.target = idx; MARY.state = 'run'; MARY.round++;
}
function maryIv() { const k = MARY.done / MARY.steps; return k < .55 ? .035 : lerp(.035, .3, Math.pow((k - .55) / .45, 2)); }
function maryUpdate(dt) {
  MARY.t += dt;
  if (MARY.shown < MARY.total) MARY.shown = Math.min(MARY.total, MARY.shown + Math.max(1, MARY.total * dt * 2));
  for (const tr of MARY.trail) tr.a -= dt * 3; MARY.trail = MARY.trail.filter(tr => tr.a > 0);
  if (MARY.state === 'intro') { if (MARY.t > 1.6) maryNext(); }
  else if (MARY.state === 'run') {
    MARY.stepT += dt; let iv = maryIv();
    while (MARY.stepT >= iv && MARY.done < MARY.steps) { MARY.stepT -= iv; MARY.pos = (MARY.pos + 1) % 16; MARY.done++; MARY.trail.unshift({ i: MARY.pos, a: 1 }); if (MARY.trail.length > 8) MARY.trail.pop(); AU.play('lottoTick', MARY.done / MARY.steps); iv = maryIv(); }
    if (MARY.done >= MARY.steps) { MARY.state = 'hit'; MARY.hitT = 0; maryPrize(MARY.target); }
  } else if (MARY.state === 'hit') {
    MARY.hitT += dt;
    if (MARY.hitT > (MARY.bonus ? 1.1 : .8)) {
      if (MARY.round < MARY.rounds) maryNext();
      else if (!MARY.bonus && MARY.total === 0 && !MARY.items.some(q => q.k !== 'mul') && casinoTryLuck()) { MARY.rounds++; maryNext(); }
      else maryEnd();
    }
  }
}
function maryPrize(i) {
  const p = MARY_TILES[i], r = maryRect(i), cx = r.x + r.w / 2, cy = r.y + r.h / 2, q = betQual(MARY.bet);
  MARY.lastHit = i;
  burst(fxU, cx, cy, 40, { col: [p.col, '#ffffff', rainbow(rand(360))], smax: 500, force: true });
  fxU.add({ kind: 'pillar', x: cx, y: cy + r.h / 2, size: 34, h: 360, col: p.col, life: .8, force: true });
  AU.play(p.v === 0 && p.k === 'mul' ? 'lose' : 'lottoHit');
  let label = p.t;
  if (p.k === 'mul') { const g = Math.round(MARY.bet * p.v); MARY.total += g; label = p.v ? `+${fmtComma(g)} 金` : '銘謝惠顧'; if (p.v >= 50) { flash(.6, '#ffffff'); for (let k = 0; k < 4; k++) fireworks(STG.x + rand(100, 1400), STG.y + rand(80, 500), 1.2); } }
  else if (p.k === 'item') { addItem(rollItem(q + .3)); }
  else if (p.k === 'buff') giveBuff(q + .3);
  else if (p.k === 'sp') giveSpecial(q + .5);
  else if (p.k === 'rounds') { MARY.rounds += p.v; label = '再抽 2 回合！'; }
  MARY.items.push({ i, label, k: p.k });
  floatText(fxU, cx, cy - 30, label, '#ffffff', 30, { life: 1.4, vy: -50, stroke: p.col, sw: 7, force: true });
}
function maryEnd() {
  MARY.state = 'end'; MARY.t = 0;
  settle('mary', MARY.bonus ? 0 : MARY.bet, MARY.total, { x: MB.cx, y: MB.cy, noCele: !MARY.bonus && MARY.total < MARY.bet * 10 });
  if (MARY.bonus && MARY.total > 0) R.modals.push({ type: 'celebrate', level: MARY.total >= MARY.bet * 60 ? 4 : MARY.total >= MARY.bet * 25 ? 3 : 2, gold: MARY.total, title: MARY.title + ' 總獎金' });
  if (MARY.bonus && CZ.returnTo) { const back = CZ.returnTo; CZ.returnTo = null; setTimeout(() => { if (R && MARY.state === 'end') CZ.game = back; }, 1800); }
}
function maryDraw(c) {
  const t = G.time, run = MARY.state === 'run' || MARY.state === 'intro', PS = maryProbs();
  if (MARY.bonus && MARY.state !== 'idle') godRays(c, MB.cx, MB.cy, t * 1.5, [rainbow(t * 100), rainbow(t * 100 + 120), rainbow(t * 100 + 240)], 24, 1100, .1);
  const bx = MB.cx - MB.size / 2 - 18, byy = MB.cy - MB.size / 2 - 18, bs = MB.size + 36;
  rr(c, bx, byy, bs, bs, 26); c.fillStyle = 'rgba(10,2,20,.9)'; c.fill();
  neonRR(c, bx, byy, bs, bs, 26, { w: 6, speed: run ? 5 : 1.5 });
  bulbs(c, bx, byy, bs, bs, 56, run ? 30 : 6, MARY.bonus);
  MARY_TILES.forEach((p, i) => {
    const r = maryRect(i), tr = MARY.trail.find(q => q.i === i), lit = i === MARY.pos && MARY.state !== 'idle';
    const pul = MARY.state === 'hit' && i === MARY.lastHit ? 1 + .08 * Math.sin(MARY.hitT * 30) : 1;
    c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(pul, pul); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    rr(c, r.x, r.y, r.w, r.h, 14); const g = c.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, mixHex(p.col, '#1a0830', .55)); g.addColorStop(1, mixHex(p.col, '#05010a', .8)); c.fillStyle = g; c.fill();
    if (lit || tr) { const a = lit ? 1 : tr.a * .8; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(lit ? '#ffffff' : p.col, .35 * a); c.fill(); glow(c, r.x + r.w / 2, r.y + r.h / 2, r.w * .9, p.col, a); c.restore(); neonRR(c, r.x, r.y, r.w, r.h, 14, { col: lit ? '#ffffff' : p.col, w: 4, a }); }
    else { c.lineWidth = 2; c.strokeStyle = rgba(p.col, .5); c.stroke(); }
    if (p.ic.length > 2) c.drawImage(getSym(p.ic), r.x + r.w / 2 - 38, r.y + 8, 76, 76);
    else { c.font = `52px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(p.ic, r.x + r.w / 2, r.y + 48); }
    c.font = font(18, 900); const fs = c.measureText(p.t).width > r.w - 12 ? 14 : 18;
    txt(c, p.t, r.x + r.w / 2, r.y + r.h - 18, { size: fs, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.85)', sw: 4 });
    rr(c, r.x + 4, r.y + 4, 50, 20, 10); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill();
    txt(c, pct(PS[i]), r.x + 29, r.y + 14, { size: 12, color: '#7affb0', weight: 900 });
    c.restore();
  });
  const cs = MB.size / 5, cx0 = MB.cx - cs * 1.5 + 8, cy0 = MB.cy - cs * 1.5 + 8, cw = cs * 3 - 16;
  rr(c, cx0, cy0, cw, cw, 22); let g = c.createLinearGradient(0, cy0, 0, cy0 + cw); g.addColorStop(0, '#2a0a4a'); g.addColorStop(1, '#0a0218'); c.fillStyle = g; c.fill();
  neonRR(c, cx0, cy0, cw, cw, 22, { w: 3, speed: -3 });
  neonText(c, MARY.bonus ? MARY.title : '小瑪莉', MB.cx, cy0 + 50, MARY.bonus ? 40 : 46, MARY.bonus ? rainbow(t * 300) : '#ff4ad8', { core: '#ffffff' });
  if (MARY.state === 'idle') {
    txt(c, '押注後燈光開始繞圈', MB.cx, cy0 + 130, { size: 20, color: '#e0d0ff', weight: 800 });
    txt(c, '停在哪一格就拿哪個獎！', MB.cx, cy0 + 162, { size: 20, color: '#e0d0ff', weight: 800 });
    txt(c, `×100 JACKPOT = ${fmtComma(curBet('mary') * 100)} 金`, MB.cx, cy0 + 220, { size: 20, color: '#ffe080', weight: 900 });
    txt(c, `每回合中獎率 ${pct(maryWinP())}`, MB.cx, cy0 + 262, { size: 20, color: '#7affb0', weight: 900 });
    txt(c, '每一格左上角都寫著機率', MB.cx, cy0 + 292, { size: 15, color: 'rgba(255,255,255,.6)', weight: 700 });
  } else {
    for (let k = 0; k < MARY.rounds; k++) { const px = MB.cx + (k - (MARY.rounds - 1) / 2) * Math.min(32, (cw - 40) / MARY.rounds), on = k < MARY.round; c.beginPath(); c.arc(px, cy0 + 96, 10, 0, TAU); c.fillStyle = on ? '#ff4ad8' : 'rgba(255,255,255,.15)'; c.fill(); }
    txt(c, `第 ${Math.min(MARY.round, MARY.rounds)} / ${MARY.rounds} 回合・押注 ${fmtComma(MARY.bet)}`, MB.cx, cy0 + 124, { size: 17, color: '#e0d0ff', weight: 700 });
    txt(c, '本局獎金', MB.cx, cy0 + 168, { size: 20, color: '#ffe080', weight: 900 });
    goldText(c, fmtComma(MARY.shown), MB.cx, cy0 + 220, 56, { glow: '#ffcf3a' });
    MARY.items.slice(-3).forEach((q, k) => txt(c, q.label, MB.cx, cy0 + 270 + k * 24, { size: 16, color: MARY_TILES[q.i].col, weight: 800 }));
  }
  if (MARY.state === 'intro' && MARY.bonus) { const s = easeOutElastic(Math.min(1, MARY.t / .9)); c.save(); c.translate(MB.cx, MB.cy); c.scale(s, s); goldText(c, MARY.title + '!!', 0, 0, 96, { cols: ['#ffffff', rainbow(t * 400), rainbow(t * 400 + 90, 40)], glow: '#ffffff', stroke: '#1a0030' }); c.restore(); }
  // 左：獎品與機率
  const lx = STG.x + 20, ly = STG.y + 20, b = curBet('mary');
  rr(c, lx, ly, 380, 666, 18); c.fillStyle = 'rgba(10,4,24,.82)'; c.fill(); neonRR(c, lx, ly, 380, 666, 18, { col: '#ff4ad8', w: 2 });
  neonText(c, '獎品與機率', lx + 190, ly + 30, 24, '#ff4ad8', { core: '#ffffff' });
  txt(c, '獎品', lx + 22, ly + 60, { size: 12, align: 'left', color: 'rgba(255,255,255,.5)', weight: 800 });
  txt(c, '每回合機率', lx + 358, ly + 60, { size: 12, align: 'right', color: '#7affb0', weight: 800 });
  const grp = {};
  MARY_TILES.forEach((p, i) => { if (!grp[p.t]) grp[p.t] = { p: 0, tile: p }; grp[p.t].p += PS[i]; });
  const lastT = MARY.lastHit >= 0 && MARY.state !== 'idle' ? MARY_TILES[MARY.lastHit].t : null;
  MARY_ORDER.forEach((name, i) => {
    const gq = grp[name], p = gq.tile, yy = ly + 84 + i * 34;
    if (name === lastT) { rr(c, lx + 10, yy - 15, 360, 30, 8); c.fillStyle = rgba(p.col, .3); c.fill(); }
    txt(c, name, lx + 22, yy, { size: 16, align: 'left', color: p.v === 0 && p.k === 'mul' ? '#a0a0c0' : p.col, weight: 900 });
    const v = p.k === 'mul' ? (p.v ? fmtComma(Math.round(b * p.v)) + ' 金' : '沒有獎') : { sp: '賭場限定塔', item: '隨機道具', buff: '增益 Buff', rounds: '再抽 2 次' }[p.k];
    txt(c, v, lx + 268, yy, { size: 15, align: 'right', color: '#ffffff', weight: 700 });
    txt(c, pct(gq.p), lx + 358, yy, { size: 15, align: 'right', color: '#7affb0', weight: 900 });
  });
  c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(lx + 16, ly + 596, 348, 1);
  txt(c, `中獎率 ${pct(maryWinP())}（拿到比押注多，或拿到道具）`, lx + 190, ly + 616, { size: 14, color: '#ffe080', weight: 900 });
  txt(c, '拉霸 777 或 3 顆彩色球 → 免費大抽獎！', lx + 190, ly + 644, { size: 14, color: '#e0d0ff', weight: 700 });
}

// ======================================================================
// 3. 幸運輪盤
// ======================================================================
const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RL_BETS = [
  { id: 'red', n: '紅', m: 2, col: '#e8283a', p: 18 / 37 }, { id: 'black', n: '黑', m: 2, col: '#202030', p: 18 / 37 }, { id: 'odd', n: '單', m: 2, col: '#6a3aaa', p: 18 / 37 },
  { id: 'even', n: '雙', m: 2, col: '#3a6aaa', p: 18 / 37 }, { id: 'low', n: '小 1-18', m: 2, col: '#2a8a5a', p: 18 / 37 }, { id: 'high', n: '大 19-36', m: 2, col: '#aa6a2a', p: 18 / 37 },
  { id: 'd1', n: '1-12', m: 3, col: '#5a3a8a', p: 12 / 37 }, { id: 'd2', n: '13-24', m: 3, col: '#5a3a8a', p: 12 / 37 }, { id: 'd3', n: '25-36', m: 3, col: '#5a3a8a', p: 12 / 37 },
  { id: 'num', n: '號碼', m: 36, col: '#c8901a', p: 1 / 37 },
];
const RL = { state: 'idle', t: 0, T: 5.2, wa: 0, ba: 0, res: null, sel: 'red', num: 17, hist: [], bet: 0, br: 1 };
const RLG = { cx: 830, cy: 500, R: 300 };
function rlPays(sel, num, r) {
  switch (sel) {
    case 'red': return r && RL_RED.has(r) ? 2 : 0; case 'black': return r && !RL_RED.has(r) ? 2 : 0;
    case 'odd': return r % 2 === 1 ? 2 : 0; case 'even': return r && r % 2 === 0 ? 2 : 0;
    case 'low': return r >= 1 && r <= 18 ? 2 : 0; case 'high': return r >= 19 ? 2 : 0;
    case 'd1': return r >= 1 && r <= 12 ? 3 : 0; case 'd2': return r >= 13 && r <= 24 ? 3 : 0; case 'd3': return r >= 25 ? 3 : 0;
    case 'num': return r === num ? 36 : 0;
  }
  return 0;
}
function rlPlay(free) {
  if (RL.state === 'spin') return;
  const bet = curBet('roul'); if (!free && !payBet(bet)) return;
  RL.bet = bet; RL.res = randi(0, 36); RL.state = 'spin'; RL.t = 0;
  const seg = TAU / 37, idx = RL_ORDER.indexOf(RL.res);
  RL.wa0 = RL.wa; RL.waT = RL.wa + TAU * 1.5 + rand(TAU);
  RL.ba0 = RL.ba; let target = RL.waT + idx * seg + seg / 2; while (target > RL.ba0 - TAU * 5) target -= TAU; RL.baT = target;
  AU.play('spin');
}
function rlUpdate(dt) {
  if (RL.state !== 'spin') return;
  RL.t += dt; const k = Math.min(1, RL.t / RL.T), e = 1 - Math.pow(1 - k, 3);
  const prev = RL.ba; RL.wa = lerp(RL.wa0, RL.waT, e); RL.ba = lerp(RL.ba0, RL.baT, 1 - Math.pow(1 - k, 2.4));
  RL.br = k < .72 ? 1 : 1 - (k - .72) / .28;
  if (Math.floor(prev / (TAU / 37)) !== Math.floor(RL.ba / (TAU / 37)) && k > .5) AU.play('wtick');
  if (k >= 1) {
    RL.state = 'idle'; const r = RL.res, pay = rlPays(RL.sel, RL.num, r);
    RL.hist.unshift(r); if (RL.hist.length > 12) RL.hist.pop();
    if (!pay && casinoTryLuck()) { R.gold += 0; floatText(fxU, RLG.cx, RLG.cy, '幸運重來！', '#7affb0', 40, { force: true }); setTimeout(() => R && rlPlay(true), 600); return; }
    const o = { x: RLG.cx, y: RLG.cy };
    if (pay && RL.sel === 'num') o.item = betQual(RL.bet) + .8;
    settle('roul', RL.bet, RL.bet * pay, o);
    burst(fxU, RLG.cx, RLG.cy, 30, { col: [r === 0 ? '#2aff7a' : RL_RED.has(r) ? '#ff3a4a' : '#ffffff', '#ffcf3a'], smax: 400, force: true });
  }
}
function rlDraw(c) {
  const { cx, cy } = RLG, Rr = RLG.R, seg = TAU / 37, t = G.time;
  c.save(); c.globalCompositeOperation = 'lighter'; glow(c, cx, cy, Rr * 1.6, '#ffcf3a', .2); c.restore();
  c.beginPath(); c.arc(cx, cy, Rr + 34, 0, TAU); let g = c.createRadialGradient(cx, cy, Rr, cx, cy, Rr + 34); g.addColorStop(0, '#5a3010'); g.addColorStop(1, '#2a1404'); c.fillStyle = g; c.fill();
  neonRR(c, cx - Rr - 34, cy - Rr - 34, (Rr + 34) * 2, (Rr + 34) * 2, Rr + 34, { col: '#ffcf3a', w: 3 });
  c.save(); c.translate(cx, cy); c.rotate(RL.wa);
  RL_ORDER.forEach((n, i) => {
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, Rr, i * seg, (i + 1) * seg); c.closePath();
    c.fillStyle = n === 0 ? '#1a9a4a' : RL_RED.has(n) ? '#c8182a' : '#14141e'; c.fill(); c.strokeStyle = '#d8b060'; c.lineWidth = 1.5; c.stroke();
    c.save(); c.rotate((i + .5) * seg); c.translate(Rr - 26, 0); c.rotate(Math.PI / 2); txt(c, '' + n, 0, 0, { size: 17, weight: 900, color: '#ffffff' }); c.restore();
  });
  c.beginPath(); c.arc(0, 0, Rr - 52, 0, TAU); g = c.createRadialGradient(-30, -30, 10, 0, 0, Rr - 52); g.addColorStop(0, '#8a5a2a'); g.addColorStop(1, '#3a1a08'); c.fillStyle = g; c.fill();
  for (let k = 0; k < 8; k++) { c.rotate(TAU / 8); c.fillStyle = '#ffcf3a'; c.fillRect(0, -4, Rr - 70, 8); }
  c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fillStyle = '#ffe080'; c.fill();
  c.restore();
  const br = lerp(Rr - 40, Rr + 16, RL.br), bx = cx + Math.cos(RL.ba) * br, by = cy + Math.sin(RL.ba) * br;
  c.save(); c.globalCompositeOperation = 'lighter'; glow(c, bx, by, 26, '#ffffff', .8); c.restore();
  c.beginPath(); c.arc(bx, by, 10, 0, TAU); g = c.createRadialGradient(bx - 3, by - 3, 1, bx, by, 10); g.addColorStop(0, '#fff'); g.addColorStop(1, '#a0a0b0'); c.fillStyle = g; c.fill();
  if (RL.state === 'idle' && RL.res !== null) {
    const r = RL.res, col = r === 0 ? '#2aff7a' : RL_RED.has(r) ? '#ff3a4a' : '#e0e0f0';
    rr(c, cx - 70, cy - 46, 140, 92, 20); c.fillStyle = 'rgba(0,0,0,.75)'; c.fill(); neonRR(c, cx - 70, cy - 46, 140, 92, 20, { col, w: 3 });
    txt(c, '' + r, cx, cy + 2, { size: 56, weight: 900, color: col, stroke: '#000', sw: 6 });
  }
  // 押注板：兩個分頁（押顏色／大小、選我的號碼）
  const px = 1250, py = 160, bet = curBet('roul'), lock = RL.state === 'spin';
  rr(c, px, py, 640, 690, 22); c.fillStyle = 'rgba(10,30,20,.88)'; c.fill(); neonRR(c, px, py, 640, 690, 22, { col: '#2aff7a', w: 2 });
  RL.view = RL.view || 'out';
  button('rlvOut', px + 24, py + 18, 290, 56, '🎨 押顏色／大小', { style: RL.view === 'out' ? 'green' : 'dark', size: 20, disabled: lock, fn: () => { RL.view = 'out'; if (RL.sel === 'num') RL.sel = RL.lastOut || 'red'; AU.play('coin'); } });
  button('rlvNum', px + 326, py + 18, 290, 56, '🔢 選我的號碼', { style: RL.view === 'num' ? 'gold' : 'dark', size: 20, disabled: lock, fn: () => { RL.view = 'num'; RL.sel = 'num'; AU.play('coin'); } });
  if (RL.view === 'out') {
    txt(c, '點一個押注目標（押中拿回 = 押注 × 倍率）', px + 320, py + 98, { size: 16, color: '#c8ffd8', weight: 800 });
    RL_BETS.filter(q => q.id !== 'num').forEach((b, i) => {
      const col = i % 3, row = Math.floor(i / 3), bx2 = px + 24 + col * 200, by2 = py + 120 + row * 116, sel = RL.sel === b.id;
      const hov = !lock && !UI.noHover && hit(bx2, by2, 192, 106);
      rr(c, bx2, by2, 192, 106, 16); c.fillStyle = hov ? mixHex(b.col, '#ffffff', .15) : b.col; c.fill();
      if (sel) neonRR(c, bx2, by2, 192, 106, 16, { col: '#ffe080', w: 4 }); else { c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke(); }
      txt(c, b.n, bx2 + 96, by2 + 32, { size: 28, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.5)', sw: 4 });
      txt(c, `×${b.m}・贏 ${fmtComma(bet * b.m)} 金`, bx2 + 96, by2 + 66, { size: 15, weight: 800, color: '#ffe080' });
      txt(c, `機率 ${pct(b.p)}`, bx2 + 96, by2 + 89, { size: 14, weight: 800, color: '#b8ffd0' });
      if (!lock) UI.nh.push({ id: 'rl_' + b.id, x: bx2, y: by2, w: 192, h: 106, fn: () => { RL.sel = b.id; RL.lastOut = b.id; AU.play('coin'); } });
    });
  } else {
    txt(c, '點一下你想押的號碼（1～36 由左到右排列）・押中 ×36', px + 320, py + 98, { size: 16, color: '#ffe080', weight: 800 });
    const cell = (n, x, y, w, h) => {
      const sel = RL.sel === 'num' && RL.num === n, last = !lock && RL.res === n && RL.hist.length, hov = !lock && !UI.noHover && hit(x, y, w, h);
      rr(c, x, y, w, h, 10); c.fillStyle = n === 0 ? '#1a9a4a' : RL_RED.has(n) ? '#c8182a' : '#1c1c2a'; c.fill();
      if (hov) { c.fillStyle = 'rgba(255,255,255,.18)'; c.fill(); }
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,220,140,.45)'; c.stroke();
      if (last && !sel) { c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke(); }
      if (sel) {
        neonRR(c, x - 1, y - 1, w + 2, h + 2, 11, { col: '#ffe080', w: 3 });
        c.beginPath(); c.arc(x + w / 2, y + h / 2, h * .42, 0, TAU); c.fillStyle = '#ffcf3a'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#ffffff'; c.stroke();
      }
      txt(c, n === 0 ? '0（綠）' : '' + n, x + w / 2, y + h / 2 + 1, { size: 22, weight: 900, color: sel ? '#3a1a00' : '#ffffff', stroke: sel ? null : 'rgba(0,0,0,.5)', sw: 3 });
      if (!lock) UI.nh.push({ id: 'rln' + n, x, y, w, h, fn: () => { RL.sel = 'num'; RL.num = n; AU.play('coin'); } });
    };
    const gx = px + 24, gy = py + 116, cw = 93, ch = 45, gap = 7;
    cell(0, gx, gy, 592, ch);
    for (let n = 1; n <= 36; n++) { const col = (n - 1) % 6, row = Math.floor((n - 1) / 6); cell(n, gx + col * (cw + gap), gy + (row + 1) * (ch + gap), cw, ch); }
  }
  const cur = RL_BETS.find(q => q.id === RL.sel), lbl = cur.id === 'num' ? `號碼 ${RL.num}` : cur.n;
  rr(c, px + 24, py + 500, 592, 44, 12); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,224,128,.5)'; c.stroke();
  txt(c, `你押的是「${lbl}」・機率 ${pct(cur.p)}・押中拿回 ${fmtComma(bet * cur.m)} 金`, px + 320, py + 522, { size: 17, color: '#ffffff', weight: 900 });
  txt(c, '開出紀錄', px + 24, py + 566, { size: 16, align: 'left', color: '#ffe080', weight: 900 });
  RL.hist.forEach((r, i) => { const hx = px + 40 + i * 48, hy = py + 606; c.beginPath(); c.arc(hx, hy, 20, 0, TAU); c.fillStyle = r === 0 ? '#1a9a4a' : RL_RED.has(r) ? '#c8182a' : '#202030'; c.fill(); c.strokeStyle = '#ffcf3a'; c.lineWidth = 2; c.stroke(); txt(c, '' + r, hx, hy + 1, { size: 15, weight: 900 }); });
  txt(c, '押中號碼（包含綠色 0）還會額外送道具！每一局都可以重新選', px + 320, py + 664, { size: 14, color: 'rgba(255,255,255,.65)', weight: 700 });
}

// ======================================================================
// 4. 骰寶大小
// ======================================================================
const DC_BETS = [
  { id: 'small', n: '小', s: '總和 4～10', m: 2, col: '#2a7aff', p: 105 / 216 }, { id: 'big', n: '大', s: '總和 11～17', m: 2, col: '#ff3a4a', p: 105 / 216 },
  { id: 'triple', n: '豹子', s: '三顆一樣', m: 31, col: '#c868ff', p: 6 / 216 }, { id: 'num', n: '點數', s: '選的點數出現就中', m: 4, col: '#ffb030', p: 91 / 216 },
];
const DC = { state: 'idle', t: 0, dice: [3, 5, 6], sel: 'big', num: 6, hist: [], bet: 0 };
function dcPays(sel, num, d) {
  const s = d[0] + d[1] + d[2], tri = d[0] === d[1] && d[1] === d[2];
  if (sel === 'small') return !tri && s <= 10 ? 2 : 0;
  if (sel === 'big') return !tri && s >= 11 ? 2 : 0;
  if (sel === 'triple') return tri ? 31 : 0;
  const m = d.filter(v => v === num).length; return m ? 1 + m : 0;
}
function dcPlay(free) {
  if (DC.state !== 'idle') return;
  const bet = curBet('dice'); if (!free && !payBet(bet)) return;
  DC.bet = bet; DC.res = [randi(1, 6), randi(1, 6), randi(1, 6)]; DC.state = 'shake'; DC.t = 0; AU.play('dice');
}
function dcUpdate(dt) {
  if (DC.state === 'idle') return;
  DC.t += dt;
  if (DC.state === 'shake') { if (Math.random() < dt * 20) AU.play('tick'); DC.dice = DC.dice.map(() => randi(1, 6)); if (DC.t > 1.2) { DC.state = 'lift'; DC.t = 0; DC.dice = DC.res; AU.play('flip'); } }
  else if (DC.state === 'lift' && DC.t > .5) {
    DC.state = 'idle'; const pay = dcPays(DC.sel, DC.num, DC.dice);
    DC.hist.unshift(DC.dice.slice()); if (DC.hist.length > 8) DC.hist.pop();
    if (!pay && casinoTryLuck()) { floatText(fxU, 830, 480, '幸運重來！', '#7affb0', 40, { force: true }); setTimeout(() => R && dcPlay(true), 600); return; }
    const o = { x: 830, y: 460 }; if (pay && DC.sel === 'triple') o.item = betQual(DC.bet) + 1;
    settle('dice', DC.bet, DC.bet * pay, o);
  }
}
function drawDie(c, x, y, s, v, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -s / 2 + 6, -s / 2 + 8, s, s, s * .2); c.fill();
  rr(c, -s / 2, -s / 2, s, s, s * .2); const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d0c8e0'); c.fillStyle = g; c.fill();
  c.lineWidth = 2; c.strokeStyle = '#8a80a0'; c.stroke();
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v];
  for (const [px, py] of P) { c.beginPath(); c.arc(px * s * .26, py * s * .26, s * (v === 1 ? .13 : .09), 0, TAU); c.fillStyle = v === 1 || v === 4 ? '#e8182a' : '#14141e'; c.fill(); }
  c.restore();
}
function dcDraw(c) {
  const cx = 830, cy = 480, t = G.time;
  c.beginPath(); c.ellipse(cx, cy + 40, 330, 150, 0, 0, TAU); let g = c.createRadialGradient(cx, cy + 20, 40, cx, cy + 40, 330); g.addColorStop(0, '#1a6a4a'); g.addColorStop(1, '#063a26'); c.fillStyle = g; c.fill();
  c.lineWidth = 14; c.strokeStyle = '#8a5a2a'; c.stroke(); neonRR(c, cx - 344, cy - 124, 688, 328, 164, { col: '#3ae8ff', w: 2, a: .6 });
  const sh = DC.state === 'shake';
  DC.dice.forEach((v, i) => drawDie(c, cx + (i - 1) * 120 + (sh ? rand(-6, 6) : 0), cy + 40 + (i === 1 ? -30 : 10), 96, v, sh ? rand(-.3, .3) : (i - 1) * .12));
  if (DC.state === 'shake' || DC.state === 'lift') {
    const lift = DC.state === 'lift' ? easeOutCubic(Math.min(1, DC.t / .4)) * 260 : 0, wob = sh ? Math.sin(t * 40) * 18 : 0;
    c.save(); c.translate(cx + wob, cy - 30 - lift); c.rotate(sh ? Math.sin(t * 30) * .08 : 0);
    c.beginPath(); c.moveTo(-210, 120); c.quadraticCurveTo(-200, -150, 0, -170); c.quadraticCurveTo(200, -150, 210, 120); c.closePath();
    g = c.createLinearGradient(-200, 0, 200, 0); g.addColorStop(0, '#5a0a1a'); g.addColorStop(.45, '#c8283a'); g.addColorStop(1, '#4a0814'); c.fillStyle = g; c.fill();
    c.lineWidth = 8; c.strokeStyle = '#ffcf3a'; c.stroke(); txt(c, '骰', 0, -30, { size: 90, weight: 900, color: '#ffe080', stroke: '#5a0010', sw: 8 });
    c.restore();
  } else if (DC.hist.length) {
    const d = DC.dice, s = d[0] + d[1] + d[2], tri = d[0] === d[1] && d[1] === d[2];
    neonText(c, tri ? `豹子！${d[0]}${d[0]}${d[0]}` : `${s} 點・${s >= 11 ? '大' : '小'}`, cx, cy - 190, 52, tri ? '#c868ff' : s >= 11 ? '#ff3a4a' : '#2a7aff', { core: '#ffffff' });
  } else neonText(c, '押大還是押小？', cx, cy - 190, 46, '#3ae8ff', { core: '#ffffff' });
  const px = 1250, py = 160, bet = curBet('dice');
  rr(c, px, py, 640, 690, 22); c.fillStyle = 'rgba(10,20,40,.88)'; c.fill(); neonRR(c, px, py, 640, 690, 22, { col: '#3ae8ff', w: 2 });
  neonText(c, '選擇押注', px + 320, py + 36, 28, '#3ae8ff', { core: '#ffffff' });
  DC_BETS.forEach((b, i) => {
    const bx = px + 24 + (i % 2) * 300, by = py + 80 + Math.floor(i / 2) * 170, sel = DC.sel === b.id;
    rr(c, bx, by, 290, 156, 18); g = c.createLinearGradient(0, by, 0, by + 156); g.addColorStop(0, b.col); g.addColorStop(1, mixHex(b.col, '#000000', .5)); c.fillStyle = g; c.fill();
    if (sel) neonRR(c, bx, by, 290, 156, 18, { col: '#ffe080', w: 4 }); else { c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke(); }
    txt(c, b.id === 'num' ? `點數 ${DC.num}` : b.n, bx + 145, by + 54, { size: 38, weight: 900, color: '#fff', stroke: 'rgba(0,0,0,.5)', sw: 5 });
    rr(c, bx + 8, by + 8, 108, 24, 12); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
    txt(c, '機率 ' + pct(b.p), bx + 62, by + 20, { size: 13, weight: 900, color: '#7affb0' });
    txt(c, b.s, bx + 145, by + 94, { size: 17, weight: 700, color: '#ffffff' });
    txt(c, b.id === 'num' ? `中 1/2/3 顆：贏 ${fmt(bet * 2)}/${fmt(bet * 3)}/${fmt(bet * 4)}` : `×${b.m}・贏 ${fmtComma(bet * b.m)}`, bx + 145, by + 128, { size: 16, weight: 800, color: '#ffe080' });
    if (DC.state === 'idle') UI.nh.push({ id: 'dc_' + b.id, x: bx, y: by, w: 290, h: 156, fn: () => { DC.sel = b.id; AU.play('coin'); } });
  });
  for (let n = 1; n <= 6; n++) {
    const bx = px + 34 + (n - 1) * 98, by = py + 432;
    drawDie(c, bx + 34, by + 34, 58, n);
    if (DC.sel === 'num' && DC.num === n) neonRR(c, bx + 2, by + 2, 64, 64, 12, { col: '#ffe080', w: 3 });
    if (DC.state === 'idle') UI.nh.push({ id: 'dcn' + n, x: bx, y: by, w: 68, h: 68, fn: () => { DC.num = n; DC.sel = 'num'; } });
  }
  txt(c, '押點數：出現 1 顆 34.7%・2 顆 6.9%・3 顆 0.46%（任一顆 42.1%）', px + 320, py + 516, { size: 14, color: '#ffe0a0', weight: 800 });
  txt(c, '開出紀錄', px + 24, py + 548, { size: 17, align: 'left', color: '#ffe080', weight: 900 });
  DC.hist.forEach((d, i) => { const hx = px + 30 + i * 74, hy = py + 576; rr(c, hx, hy, 66, 56, 10); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); txt(c, d.join(''), hx + 33, hy + 18, { size: 15, weight: 800 }); const s = d[0] + d[1] + d[2]; txt(c, s + (d[0] === d[1] && d[1] === d[2] ? ' 豹' : s >= 11 ? ' 大' : ' 小'), hx + 33, hy + 40, { size: 14, weight: 900, color: s >= 11 ? '#ff8a8a' : '#8ab8ff' }); });
  txt(c, '開出豹子時，押大／押小都算輸；押中豹子還送史詩級道具！', px + 320, py + 664, { size: 14, color: 'rgba(255,255,255,.65)', weight: 700 });
}

// ======================================================================
// 5. 翻倍挑戰
// ======================================================================
const DB_MS = { 3: { item: .6, t: '優良道具' }, 5: { item: 1, buff: .6, t: '稀有道具＋增益' }, 7: { item: 1.6, t: '史詩道具' }, 10: { item: 2.6, sp: 2, t: '神話道具＋限定塔' } };
const DB = { state: 'idle', pot: 0, bet: 0, round: 0, t: 0, pick: null, red: true, flipT: 0, maxR: 10 };
function dbStart() { if (DB.state !== 'idle') return; const bet = curBet('double'); if (!payBet(bet)) return; Object.assign(DB, { state: 'choose', pot: bet, bet, round: 0, pick: null }); AU.play('flip'); }
function dbPick(red) {
  if (DB.state !== 'choose') return;
  DB.pick = red; DB.red = Math.random() < .48 ? red : !red;
  if (DB.red !== red && casinoTryLuck()) DB.red = red;
  DB.state = 'flip'; DB.t = 0; AU.play('flip');
}
function dbCash() {
  if (DB.state !== 'choose' || DB.round === 0) return;
  DB.state = 'idle'; settle('double', DB.bet, DB.pot, { x: 830, y: 460 });
}
function dbUpdate(dt) {
  if (DB.state === 'flip') {
    DB.t += dt;
    if (DB.t > .9) {
      if (DB.red === DB.pick) {
        DB.round++; DB.pot *= 2; AU.play('win', DB.round);
        burst(fxU, 830, 460, 40, { col: [DB.red ? '#ff3a4a' : '#ffffff', '#ffcf3a'], smax: 500, force: true });
        const ms = DB_MS[DB.round];
        if (ms) { if (ms.item) addItem(rollItem(ms.item + betQual(DB.bet) * .5)); if (ms.buff) giveBuff(ms.buff); if (ms.sp) giveSpecial(ms.sp); flash(.4, '#ffcf3a'); }
        if (DB.round >= DB.maxR) { DB.state = 'idle'; settle('double', DB.bet, DB.pot, { x: 830, y: 460 }); }
        else DB.state = 'choose';
      } else {
        DB.state = 'lost'; DB.t = 0; settle('double', DB.bet, 0, { x: 830, y: 460 }); shake(10); flash(.4, '#ff2a2a');
        for (let k = 0; k < 40; k++) fxU.add({ kind: 'shard', x: 830 + rand(-120, 120), y: 460 + rand(-160, 160), vx: rand(-500, 500), vy: rand(-500, 100), g: 1200, life: 1.2, size: rand(6, 14), col: pick(['#ffffff', '#c8c8ff', '#ff6a6a']), add: false, force: true });
      }
    }
  } else if (DB.state === 'lost') { DB.t += dt; if (DB.t > 1.6) { DB.state = 'idle'; DB.pot = 0; } }
}
function dbDraw(c) {
  const cx = 830, cy = 470, t = G.time;
  godRays(c, cx, cy, t * .8, ['#ff2a4a', '#ffffff'], 12, 900, DB.state === 'choose' ? .07 : .04);
  const cw = 260, ch = 380;
  let sx = 1, face = false;
  if (DB.state === 'flip') { const k = Math.min(1, DB.t / .9); sx = Math.abs(Math.cos(k * Math.PI)); face = k > .5; }
  else if (DB.state === 'lost' || (DB.state === 'choose' && DB.round > 0)) face = true;
  c.save(); c.translate(cx, cy); c.scale(Math.max(.03, sx), 1);
  if (DB.state === 'lost') c.rotate(Math.sin(DB.t * 30) * .05 * (1 - DB.t / 1.6));
  rr(c, -cw / 2, -ch / 2, cw, ch, 22);
  if (!face) { const g = c.createLinearGradient(0, -ch / 2, 0, ch / 2); g.addColorStop(0, '#3a0a6a'); g.addColorStop(1, '#14042a'); c.fillStyle = g; c.fill(); c.lineWidth = 6; c.strokeStyle = '#ffcf3a'; c.stroke(); c.save(); c.rotate(t * .5); star5(c, 0, 0, 90, 40, 8, 0); c.fillStyle = 'rgba(255,207,58,.2)'; c.fill(); c.restore(); goldText(c, '?', 0, 6, 150); }
  else { c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 6; c.strokeStyle = DB.red ? '#e8182a' : '#14141e'; c.stroke(); txt(c, DB.red ? '♥' : '♠', 0, 0, { size: 190, color: DB.red ? '#e8182a' : '#14141e', weight: 900 }); txt(c, DB.red ? '紅' : '黑', -cw / 2 + 36, -ch / 2 + 40, { size: 34, color: DB.red ? '#e8182a' : '#14141e', weight: 900 }); }
  c.restore();
  if (DB.state === 'lost') neonText(c, '全部歸零……', cx, cy - 250, 52, '#ff2a2a', { core: '#ffffff' });
  else if (DB.state === 'idle') neonText(c, '押注後猜紅或黑！', cx, cy - 250, 44, '#ff4ad8', { core: '#ffffff' });
  else neonText(c, DB.round ? `連勝 ${DB.round}！要繼續嗎？` : '猜猜看：紅還是黑？', cx, cy - 250, 42, DB.round ? '#ffcf3a' : '#ff4ad8', { core: '#ffffff' });
  // 彩池
  rr(c, cx - 260, cy + 210, 520, 84, 42); c.fillStyle = 'rgba(0,0,0,.65)'; c.fill(); neonRR(c, cx - 260, cy + 210, 520, 84, 42, { col: '#ffcf3a', w: 3 });
  txt(c, '彩池', cx - 200, cy + 252, { size: 22, color: '#ffe080', weight: 900 });
  goldText(c, fmtComma(DB.pot), cx + 30, cy + 254, 46, { glow: DB.pot ? '#ffcf3a' : null });
  if (DB.state === 'choose') {
    button('dbRed', cx - 420, cy - 70, 140, 140, '♥ 紅', { style: 'red', size: 32, fn: () => dbPick(true), tip: '猜紅色（勝率約 48%）' });
    button('dbBlack', cx + 280, cy - 70, 140, 140, '♠ 黑', { style: 'dark', size: 32, fn: () => dbPick(false), tip: '猜黑色（勝率約 48%）' });
  }
  // 倍率階梯
  const lx = 1290, ly = 168;
  rr(c, lx, ly, 590, 676, 22); c.fillStyle = 'rgba(10,4,24,.85)'; c.fill(); neonRR(c, lx, ly, 590, 676, 22, { col: '#ffcf3a', w: 2 });
  neonText(c, '翻倍階梯（每次猜中 48%）', lx + 295, ly + 32, 24, '#ffcf3a', { core: '#ffffff' });
  const base = DB.state === 'idle' ? curBet('double') : DB.bet;
  for (let k = 10; k >= 1; k--) {
    const yy = ly + 64 + (10 - k) * 60, done = DB.round >= k, next = DB.round + 1 === k && DB.state !== 'idle', ms = DB_MS[k];
    rr(c, lx + 18, yy, 554, 52, 12); c.fillStyle = done ? 'rgba(255,207,58,.3)' : next ? `rgba(255,74,216,${.2 + .15 * Math.sin(t * 8)})` : 'rgba(255,255,255,.05)'; c.fill();
    if (next) neonRR(c, lx + 18, yy, 554, 52, 12, { col: '#ff4ad8', w: 2 });
    txt(c, `第 ${k} 勝`, lx + 40, yy + 18, { size: 17, align: 'left', color: done ? '#ffe080' : '#e0d0ff', weight: 900 });
    txt(c, `連中機率 ${pct(Math.pow(.48, k))}`, lx + 40, yy + 39, { size: 12, align: 'left', color: '#7affb0', weight: 800 });
    txt(c, `×${Math.pow(2, k)}`, lx + 170, yy + 26, { size: 20, align: 'left', color: '#ffffff', weight: 900 });
    txt(c, fmtComma(base * Math.pow(2, k)) + ' 金', lx + 270, yy + 26, { size: 18, align: 'left', color: '#ffcf3a', weight: 800 });
    if (ms) txt(c, '🎁 ' + ms.t, lx + 555, yy + 26, { size: 14, align: 'right', color: '#7affb0', weight: 800 });
  }
}

// ======================================================================
// 6. 彈珠台
// ======================================================================
const PK_MUL = {
  low: [3, 1.6, 1.3, 1.2, 1.1, 1.1, .2, 1.1, 1.1, 1.2, 1.3, 1.6, 3],
  mid: [25, 8, 3, 1.5, 1.2, .6, .3, .6, 1.2, 1.5, 3, 8, 25],
  high: [170, 24, 8, 1.8, .6, .2, .2, .2, .6, 1.8, 8, 24, 170],
};
const PK_RISK = { low: '低風險', mid: '中風險', high: '高風險' };
const PK = { balls: [], risk: 'mid', hist: [], hitT: new Array(13).fill(0) };
// 12 排釘子、每排左右各 50%：掉到第 k 格的機率 = C(12,k) / 4096
function pkProbs() { const out = []; let cmb = 1; for (let k = 0; k <= 12; k++) { out.push(cmb / 4096); cmb = cmb * (12 - k) / (k + 1); } return out; }
const PKG = { cx: 830, top: 200, sp: 46, rows: 12 };
function pkPlay(free) {
  if (PK.balls.length >= 15) return;
  const bet = curBet('plinko'); if (!free && !payBet(bet)) return;
  const bits = []; for (let r = 0; r < PKG.rows; r++) bits.push(Math.random() < .5 ? 1 : 0);
  PK.balls.push({ bits, row: -1, t: 0, k: 0, bet, risk: PK.risk, x: PKG.cx + rand(-4, 4), y: PKG.top - 40, trail: [] });
  AU.play('tick');
}
function pkUpdate(dt) {
  for (const b of PK.balls) {
    b.t += dt; const RT = .085;
    while (b.t >= RT && b.row < PKG.rows) { b.t -= RT; b.row++; if (b.row > 0) b.k += b.bits[b.row - 1]; AU.play('pkTick', b.row); }
    const r = b.row, k = Math.min(1, b.t / RT);
    const xA = PKG.cx + (b.k - Math.max(0, r) / 2) * PKG.sp, yA = PKG.top + Math.max(0, r) * PKG.sp * .9 - (r < 0 ? 40 : 0);
    if (r < PKG.rows) {
      const nb = b.bits[r] ?? 0, xB = PKG.cx + (b.k + nb - (r + 1) / 2) * PKG.sp, yB = PKG.top + (r + 1) * PKG.sp * .9;
      b.x = lerp(xA, xB, k); b.y = lerp(yA, yB, k) - Math.sin(k * Math.PI) * 18;
    } else if (!b.done) {
      b.done = true; const m = PK_MUL[b.risk][b.k]; PK.hitT[b.k] = 1;
      PK.hist.unshift(m); if (PK.hist.length > 10) PK.hist.pop();
      const o = { x: b.x, y: b.y - 40, noCele: m < 10, quiet: m < 2 };
      if (b.k === 0 || b.k === 12) { if (b.risk === 'high') { o.item = 2; o.sp = 1; } else if (b.risk === 'mid') o.item = 1.2; }
      if (m < 1 && casinoTryLuck()) { pkPlayFree(b.bet, b.risk); }
      else settle('plinko', b.bet, Math.round(b.bet * m), o);
    }
    b.trail.unshift([b.x, b.y]); if (b.trail.length > 8) b.trail.pop();
  }
  PK.balls = PK.balls.filter(b => !b.done);
  for (let i = 0; i < 13; i++) PK.hitT[i] = Math.max(0, PK.hitT[i] - dt * 2);
}
function pkPlayFree(bet, risk) { const r0 = PK.risk; PK.risk = risk; const b0 = CZ.bet.plinko; CZ.bet.plinko = bet; pkPlay(true); PK.risk = r0; CZ.bet.plinko = b0; floatText(fxU, PKG.cx, PKG.top - 30, '幸運重來！', '#7affb0', 30, { force: true }); }
function pkDraw(c) {
  const t = G.time, sp = PKG.sp;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let r = 0; r < PKG.rows; r++) for (let j = 0; j < r + 3; j++) {
    const x = PKG.cx + (j - (r + 2) / 2) * sp, y = PKG.top + r * sp * .9 + sp * .45;
    glow(c, x, y, 12, rainbow(r * 25 + t * 60), .5);
    c.beginPath(); c.arc(x, y, 4.5, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  }
  c.restore();
  const mul = PK_MUL[PK.risk];
  mul.forEach((m, k) => {
    const x = PKG.cx + (k - 6) * sp - sp / 2 + 3, y = PKG.top + PKG.rows * sp * .9 + 24, h = PK.hitT[k];
    const col = m >= 10 ? '#ff2a4a' : m >= 3 ? '#ff8a1a' : m >= 1 ? '#ffcf3a' : '#5a6a9a';
    rr(c, x, y + h * 8, sp - 6, 46, 8); c.fillStyle = col; c.fill(); if (h) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x + sp / 2, y + 23, 50, col, h); c.restore(); }
    txt(c, (m >= 10 ? m : m) + '×', x + (sp - 6) / 2, y + 23 + h * 8, { size: m >= 100 ? 13 : 15, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.5)', sw: 3 });
  });
  for (const b of PK.balls) {
    c.save(); c.globalCompositeOperation = 'lighter';
    b.trail.forEach(([x, y], i) => glow(c, x, y, 16 - i, '#ff4ad8', .5 - i * .05));
    glow(c, b.x, b.y, 26, '#ffffff', .8); c.restore();
    c.beginPath(); c.arc(b.x, b.y, 10, 0, TAU); const g = c.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, 10); g.addColorStop(0, '#fff'); g.addColorStop(1, '#ff4ad8'); c.fillStyle = g; c.fill();
  }
  const px = 1290, py = 168, bet = curBet('plinko');
  rr(c, px, py, 590, 676, 22); c.fillStyle = 'rgba(10,4,24,.85)'; c.fill(); neonRR(c, px, py, 590, 676, 22, { col: '#ff4ad8', w: 2 });
  neonText(c, '選擇風險', px + 295, py + 32, 28, '#ff4ad8', { core: '#ffffff' });
  ['low', 'mid', 'high'].forEach((r, i) => button('pk_' + r, px + 24 + i * 186, py + 64, 176, 64, PK_RISK[r], { style: PK.risk === r ? (r === 'high' ? 'red' : r === 'mid' ? 'purple' : 'green') : 'dark', size: 20, disabled: PK.balls.length > 0, fn: () => { PK.risk = r; } }));
  const m = PK_MUL[PK.risk], PB = pkProbs();
  txt(c, '落點', px + 30, py + 152, { size: 13, align: 'left', color: 'rgba(255,255,255,.5)', weight: 800 });
  txt(c, '倍率（拿回）', px + 300, py + 152, { size: 13, align: 'right', color: 'rgba(255,255,255,.5)', weight: 800 });
  txt(c, '機率', px + 560, py + 152, { size: 13, align: 'right', color: '#7affb0', weight: 800 });
  for (let j = 0; j <= 6; j++) {
    const yy = py + 180 + j * 30, pr = j < 6 ? PB[j] * 2 : PB[6];
    if (j % 2 === 0) { rr(c, px + 20, yy - 14, 550, 28, 6); c.fillStyle = 'rgba(255,255,255,.05)'; c.fill(); }
    txt(c, j === 0 ? '最邊邊（左右）' : j === 6 ? '正中間' : `往內第 ${j} 格（左右）`, px + 30, yy, { size: 15, align: 'left', color: '#e0d0ff', weight: 700 });
    txt(c, `×${m[j]}（${fmtComma(Math.round(bet * m[j]))}）`, px + 300, yy, { size: 15, align: 'right', color: m[j] >= 10 ? '#ff8a8a' : m[j] >= 1 ? '#ffe080' : '#a0a8c8', weight: 900 });
    txt(c, pct(pr), px + 560, yy, { size: 15, align: 'right', color: '#7affb0', weight: 900 });
  }
  const back = m.reduce((a, v, k) => a + (v >= 1 ? PB[k] : 0), 0), gain = m.reduce((a, v, k) => a + (v > 1 ? PB[k] : 0), 0);
  txt(c, `賺到（超過 ×1）${pct(gain)}・不虧本（×1 以上）${pct(back)}`, px + 30, py + 404, { size: 15, align: 'left', color: '#ffe080', weight: 900 });
  const ex = PK.risk === 'high' ? '高風險掉到最邊邊：送傳說級道具＋限定塔！' : PK.risk === 'mid' ? '中風險掉到最邊邊：送稀有以上道具' : '低風險：77% 會小贏，只有正中間會輸';
  txt(c, ex, px + 30, py + 432, { size: 15, align: 'left', color: '#7affb0', weight: 700 });
  txt(c, '最近倍率', px + 30, py + 474, { size: 16, align: 'left', color: '#ffe080', weight: 900 });
  PK.hist.forEach((v, i) => { const hx = px + 30 + (i % 5) * 108, hy = py + 494 + Math.floor(i / 5) * 58; rr(c, hx, hy, 98, 48, 10); c.fillStyle = v >= 3 ? 'rgba(255,90,60,.35)' : v >= 1 ? 'rgba(255,207,58,.25)' : 'rgba(90,100,150,.3)'; c.fill(); txt(c, v + '×', hx + 49, hy + 24, { size: 19, weight: 900 }); });
}

// ======================================================================
// 7. 刮刮樂
// ======================================================================
// 每張卡的開獎機率（%）——買卡當下就照這張表抽出結果，剩下的是「沒中」
const SCS = {
  money: { e: '💰', m: 50, p: .2 }, seven: { e: '7️⃣', m: 20, p: .5 }, diamond: { e: '💎', m: 5, p: 2 }, star: { e: '⭐', m: 3, p: 4 },
  bell: { e: '🔔', m: 2, p: 8 }, cherry: { e: '🍒', m: 1.5, p: 15 }, lemon: { e: '🍋', m: 1, p: 6 }, crown: { e: '👑', sp: .8, p: .6 }, gift: { e: '🎁', item: .6, p: 10 }, potion: { e: '🧪', buff: .5, p: 8 },
};
function scLoseP() { return 1 - Object.values(SCS).reduce((a, d) => a + d.p, 0) / 100; }
function scWinP() { return Object.values(SCS).reduce((a, d) => a + (d.m === 1 ? 0 : d.p), 0) / 100; }
const SCR = { card: null, bet: 0 };
const SCG = { x: 830 - 240, y: 300, cs: 150, gap: 15, sub: 8 };
function scPlay(auto) {
  if (SCR.card && !SCR.card.done) { scRevealAll(); return; }
  const bet = curBet('scratch'); if (!payBet(bet)) return;
  SCR.bet = bet;
  const outs = Object.keys(SCS);
  let r = Math.random() * 100, win = null;
  for (const k of outs) { r -= SCS[k].p; if (r < 0) { win = k; break; } }
  const syms = []; if (win) syms.push(win, win, win);
  const cnt = {}; if (win) cnt[win] = 3;
  while (syms.length < 9) { const s = pick(outs); if ((cnt[s] || 0) >= 2 || s === win) continue; cnt[s] = (cnt[s] || 0) + 1; syms.push(s); }
  shuffle(syms);
  SCR.card = { cells: syms.map(s => ({ s, cov: new Uint8Array(SCG.sub * SCG.sub), shown: false, pop: 0 })), win, done: false, auto };
  AU.play('flip');
  if (auto) setTimeout(() => SCR.card && scRevealAll(), 300);
}
function scRevealAll() { if (!SCR.card) return; for (const c of SCR.card.cells) if (!c.shown) { c.shown = true; c.pop = 1; } AU.play('flip'); scCheck(); }
function scCell(i) { return { x: SCG.x + (i % 3) * (SCG.cs + SCG.gap), y: SCG.y + Math.floor(i / 3) * (SCG.cs + SCG.gap) }; }
function scUpdate(dt) {
  const cd = SCR.card; if (!cd) return;
  for (const c of cd.cells) if (c.pop > 0) c.pop = Math.max(0, c.pop - dt * 3);
  if (cd.done || R.tab !== 'casino' || CZ.game !== 'scratch' || activeModal()) return;
  const m = G.mouse;
  if (m.down) {
    let any = false;
    cd.cells.forEach((cell, i) => {
      if (cell.shown) return;
      const p = scCell(i), ss = SCG.cs / SCG.sub;
      if (m.x < p.x - 20 || m.x > p.x + SCG.cs + 20 || m.y < p.y - 20 || m.y > p.y + SCG.cs + 20) return;
      for (let a = 0; a < SCG.sub; a++) for (let b = 0; b < SCG.sub; b++) {
        const cx = p.x + (a + .5) * ss, cy = p.y + (b + .5) * ss;
        if (!cell.cov[a + b * SCG.sub] && d2(m.x, m.y, cx, cy) < 30 * 30) { cell.cov[a + b * SCG.sub] = 1; any = true; if (Math.random() < .3) fxU.add({ kind: 'dot', x: cx, y: cy, vx: rand(-60, 60), vy: rand(-40, 80), g: 400, life: .5, size: rand(1.5, 3), col: '#c8c8d8', add: false }); }
      }
      const f = cell.cov.reduce((s, v) => s + v, 0) / cell.cov.length;
      if (f > .5) { cell.shown = true; cell.pop = 1; AU.play('chip'); scCheck(); }
    });
    if (any && AU.thr('scr', 60)) AU.noise(.05, { ft: 'bandpass', f: 3000, vol: .05 });
  }
}
function scCheck() {
  const cd = SCR.card; if (!cd || cd.done || !cd.cells.every(c => c.shown)) return;
  cd.done = true; const w = cd.win;
  if (!w && casinoTryLuck()) { floatText(fxU, 830, 470, '幸運重來！免費再刮一張', '#7affb0', 34, { force: true }); setTimeout(() => { if (!R) return; R.gold += SCR.bet; scPlay(cd.auto); }, 700); return; }
  const q = betQual(SCR.bet), o = { x: 830, y: 470 };
  let pay = 0;
  if (w) { const d = SCS[w]; pay = Math.round(SCR.bet * (d.m || 0)); if (d.item) o.item = q + d.item; if (d.buff) o.buff = q + d.buff; if (d.sp) o.sp = q + d.sp; if (!d.m) pay = 0; }
  settle('scratch', SCR.bet, pay, o);
}
function scDraw(c) {
  const t = G.time, cd = SCR.card;
  const cx = 830, x0 = cx - 300, y0 = 172;
  rr(c, x0, y0, 600, 660, 26); let g = c.createLinearGradient(x0, y0, x0 + 600, y0 + 660); g.addColorStop(0, '#ffcf3a'); g.addColorStop(.5, '#ff6a3a'); g.addColorStop(1, '#ff3aa8'); c.fillStyle = g; c.fill();
  neonRR(c, x0, y0, 600, 660, 26, { w: 4, speed: 2 });
  goldText(c, '幸運刮刮樂', cx, y0 + 52, 48, { cols: ['#ffffff', '#fff2a0', '#ffcf3a'], stroke: '#6a0a2a' });
  txt(c, '刮開九格，三個一樣就中獎！', cx, y0 + 96, { size: 20, color: '#ffffff', weight: 900, stroke: 'rgba(80,0,40,.6)', sw: 4 });
  for (let i = 0; i < 9; i++) {
    const p = scCell(i), cell = cd ? cd.cells[i] : null;
    rr(c, p.x, p.y, SCG.cs, SCG.cs, 16); c.fillStyle = '#fff8e8'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#a8601a'; c.stroke();
    if (cell) {
      const win = cd.done && cd.win === cell.s, s = 1 + cell.pop * .3 + (win ? .06 * Math.sin(t * 10) : 0);
      if (win) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, p.x + SCG.cs / 2, p.y + SCG.cs / 2, 110, '#ffcf3a', .6); c.restore(); }
      c.save(); c.translate(p.x + SCG.cs / 2, p.y + SCG.cs / 2); c.scale(s, s); c.font = `84px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(SCS[cell.s].e, 0, 4); c.restore();
      if (!cell.shown) {
        const ss = SCG.cs / SCG.sub;
        c.save(); rr(c, p.x, p.y, SCG.cs, SCG.cs, 16); c.clip();
        for (let a = 0; a < SCG.sub; a++) for (let b = 0; b < SCG.sub; b++) if (!cell.cov[a + b * SCG.sub]) {
          const gx = p.x + a * ss, gy = p.y + b * ss; c.fillStyle = (a + b) % 2 ? '#b8b8c8' : '#c8c8d8'; c.fillRect(gx - .5, gy - .5, ss + 1, ss + 1);
        }
        c.restore();
        if (cell.cov.every(v => !v)) txt(c, '刮', p.x + SCG.cs / 2, p.y + SCG.cs / 2, { size: 44, color: 'rgba(90,90,110,.6)', weight: 900 });
      }
    } else { c.save(); rr(c, p.x, p.y, SCG.cs, SCG.cs, 16); c.fillStyle = '#c0c0d0'; c.fill(); c.restore(); txt(c, '?', p.x + SCG.cs / 2, p.y + SCG.cs / 2, { size: 54, color: 'rgba(90,90,110,.5)', weight: 900 }); }
  }
  if (cd && cd.done) txt(c, cd.win ? `${SCS[cd.win].e} 三連！中獎！` : '沒有中……再來一張？', cx, y0 + 626, { size: 30, color: '#ffffff', weight: 900, stroke: cd.win ? '#a0004a' : 'rgba(60,0,30,.8)', sw: 6 });
  else if (cd) txt(c, '按住滑鼠在格子上來回刮！', cx, y0 + 626, { size: 22, color: '#ffffff', weight: 900, stroke: 'rgba(80,0,40,.6)', sw: 4 });
  const px = 1290, py = 168, bet = curBet('scratch');
  rr(c, px, py, 590, 676, 22); c.fillStyle = 'rgba(10,4,24,.85)'; c.fill(); neonRR(c, px, py, 590, 676, 22, { col: '#ffcf3a', w: 2 });
  neonText(c, '中獎一覽與機率', px + 295, py + 30, 26, '#ffcf3a', { core: '#ffffff' });
  txt(c, '每張卡的機率', px + 566, py + 60, { size: 12, align: 'right', color: '#7affb0', weight: 800 });
  const rows = [['money', `×50 = ${fmtComma(bet * 50)} 金`], ['seven', `×20 = ${fmtComma(bet * 20)} 金`], ['diamond', `×5 = ${fmtComma(bet * 5)} 金`], ['star', `×3 = ${fmtComma(bet * 3)} 金`], ['bell', `×2 = ${fmtComma(bet * 2)} 金`], ['cherry', `×1.5 = ${fmtComma(bet * 1.5)} 金`], ['lemon', `×1 = 退回 ${fmtComma(bet)} 金`], ['crown', '賭場限定特殊塔！'], ['gift', '隨機道具（押越多越好）'], ['potion', '隨機增益 Buff']];
  rows.forEach(([s, d], i) => {
    const yy = py + 70 + i * 53, act = cd && cd.done && cd.win === s;
    if (act) { rr(c, px + 14, yy - 2, 562, 50, 10); c.fillStyle = 'rgba(255,207,58,.25)'; c.fill(); }
    c.font = `34px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; for (let k = 0; k < 3; k++) c.fillText(SCS[s].e, px + 46 + k * 40, yy + 24);
    txt(c, d, px + 180, yy + 24, { size: 18, align: 'left', color: '#ffffff', weight: 800 });
    txt(c, pct(SCS[s].p / 100), px + 566, yy + 24, { size: 17, align: 'right', color: '#7affb0', weight: 900 });
  });
  rr(c, px + 14, py + 604, 562, 56, 12); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
  txt(c, `中獎率 ${pct(scWinP())}・退回 ${pct(SCS.lemon.p / 100)}・沒中 ${pct(scLoseP())}`, px + 295, py + 622, { size: 16, color: '#ffe080', weight: 900 });
  txt(c, '買卡當下就照上表抽出結果・卡片價格 = 目前押注', px + 295, py + 646, { size: 13, color: 'rgba(255,255,255,.6)', weight: 700 });
}

// ===== 遊戲登記 =====
const GM = {
  slot: {
    busy: () => SL.spinning, play: a => slSpin(a), update: slUpdate, draw: slDraw,
    headline: () => '同一條線三個一樣就中獎・🌈 彩色球可以變成任何圖案・三個皇冠拿限定塔',
    betInfo: b => `777 = ${fmtComma(b / 5 * SL_PAY.seven)} 金＋大抽獎 ${SL_BONUS.seven + R.mods.lottoRounds} 回合；彩色球×3 = ${fmtComma(b / 5 * SL_PAY.wild)} 金＋${SL_BONUS.wild + R.mods.lottoRounds} 回合`,
    odds: () => { const st = slStats(); return `中獎率 ${pct(st.hit)}・大抽獎 ${pct(st.bonus)}`; },
    action: () => SL.spinning ? (SL.manual ? { label: 'STOP', sub: '依序停輪（空白鍵）', fn: () => slStopNext(), style: 'red', glow: '#ff3a3a' } : { label: '轉動中', enabled: false }) : { label: slMode() === 'slot' ? 'SPIN' : '拉霸！', sub: `押注 ${fmtComma(curBet('slot'))} 金`, fn: () => slSpin(), enabled: R.gold >= curBet('slot') },
  },
  mary: {
    busy: () => MARY.state !== 'idle' && MARY.state !== 'end', play: maryPlay, update: maryUpdate, draw: maryDraw,
    headline: () => '燈光繞一圈停在哪就拿哪・每一格的機率都寫在格子上和左邊的表',
    betInfo: b => `最大 JACKPOT ×100 = ${fmtComma(b * 100)} 金；每回合中獎率 ${pct(maryWinP())}`,
    odds: () => `中獎率 ${pct(maryWinP())}・最高 ×100`,
    action: () => (MARY.state === 'idle' || MARY.state === 'end') ? { label: '開始！', sub: `押注 ${fmtComma(curBet('mary'))} 金`, fn: maryPlay, enabled: R.gold >= curBet('mary') } : { label: '抽獎中', enabled: false },
  },
  roul: {
    busy: () => RL.state === 'spin', play: () => rlPlay(), update: rlUpdate, draw: rlDraw,
    headline: () => '右邊選「押顏色／大小」或「選我的號碼」，選好後按「轉動」',
    betInfo: b => { const x = RL_BETS.find(q => q.id === RL.sel); return `押「${x.id === 'num' ? '號碼 ' + RL.num : x.n}」：機率 ${pct(x.p)}，押中拿回 ${fmtComma(b * x.m)} 金${x.id === 'num' ? '＋道具' : ''}`; },
    odds: () => '紅黑 48.6%・號碼 2.7%',
    action: () => RL.state === 'spin' ? { label: '轉動中', enabled: false } : { label: '轉動！', sub: `押注 ${fmtComma(curBet('roul'))} 金`, fn: () => rlPlay(), enabled: R.gold >= curBet('roul') },
  },
  dice: {
    busy: () => DC.state !== 'idle', play: () => dcPlay(), update: dcUpdate, draw: dcDraw,
    headline: () => '大：11～17　小：4～10　豹子：三顆一樣',
    betInfo: b => { const x = DC_BETS.find(q => q.id === DC.sel); return x.id === 'num' ? `押點數 ${DC.num}（機率 42.1%）：出現 1/2/3 顆分別拿回 ${fmtComma(b * 2)}／${fmtComma(b * 3)}／${fmtComma(b * 4)}` : `押「${x.n}」：機率 ${pct(x.p)}，押中拿回 ${fmtComma(b * x.m)} 金`; },
    odds: () => '大小 48.6%・豹子 2.8%',
    action: () => DC.state !== 'idle' ? { label: '開骰中', enabled: false } : { label: '搖骰！', sub: `押注 ${fmtComma(curBet('dice'))} 金`, fn: () => dcPlay(), enabled: R.gold >= curBet('dice') },
  },
  double: {
    busy: () => DB.state !== 'idle', play: dbStart, update: dbUpdate, draw: dbDraw, noAuto: true,
    headline: () => '每猜中一次彩池 ×2，隨時可以收手；猜錯就全部歸零！',
    betInfo: b => `每次猜中機率 48%；連勝 10 次 = ${fmtComma(b * 1024)} 金！第 3、5、7、10 勝送道具`,
    odds: () => '每次猜中 48%・最高 ×1024',
    action: () => DB.state === 'idle' ? { label: '開始挑戰', sub: `押注 ${fmtComma(curBet('double'))} 金`, fn: dbStart, enabled: R.gold >= curBet('double') }
      : DB.state === 'choose' ? (DB.round ? { label: '💰 收手', sub: `拿走 ${fmtComma(DB.pot)} 金`, fn: dbCash, style: 'green', glow: '#3aff9a' } : { label: '猜紅或黑', sub: '點左右兩邊的按鈕', enabled: false }) : { label: '翻牌中', enabled: false },
  },
  plinko: {
    busy: () => PK.balls.length > 0, play: () => pkPlay(), update: pkUpdate, draw: pkDraw,
    headline: () => '彈珠落下會隨機左右彈，最後掉進哪一格就拿那一格的倍率',
    betInfo: b => `每顆彈珠 ${fmtComma(b)} 金；${PK_RISK[PK.risk]}最高 ×${PK_MUL[PK.risk][0]} = ${fmtComma(b * PK_MUL[PK.risk][0])} 金（機率 0.05%）`,
    odds: () => { const m = PK_MUL[PK.risk], PB = pkProbs(); return `賺到 ${pct(m.reduce((a, v, k) => a + (v > 1 ? PB[k] : 0), 0))}・最高 ×${m[0]}`; },
    action: () => ({ label: '投彈珠！', sub: `每顆 ${fmtComma(curBet('plinko'))} 金`, fn: () => pkPlay(), enabled: R.gold >= curBet('plinko') && PK.balls.length < 15, glow: '#ff4ad8', style: 'purple' }),
  },
  scratch: {
    busy: () => !!(SCR.card && !SCR.card.done), play: a => scPlay(a), update: scUpdate, draw: scDraw,
    headline: () => '按住滑鼠刮開九格，三個一樣就中獎・每種獎的機率寫在右邊',
    betInfo: b => `一張 ${fmtComma(b)} 金；中獎率 ${pct(scWinP())}；三個 💰 = ${fmtComma(b * 50)} 金，三個 👑 = 限定塔`,
    odds: () => `中獎率 ${pct(scWinP())}・最高 ×50`,
    action: () => SCR.card && !SCR.card.done ? { label: '全部刮開', sub: '懶得刮就按這裡', fn: scRevealAll, style: 'blue', glow: '#3ae8ff' } : { label: '買一張！', sub: `${fmtComma(curBet('scratch'))} 金`, fn: () => scPlay(), enabled: R.gold >= curBet('scratch') },
  },
};
