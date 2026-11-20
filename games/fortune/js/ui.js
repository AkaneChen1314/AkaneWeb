'use strict';
// ===== 介面（即時模式按鈕）、畫面、彈出視窗 =====
const UI = { hits: [], nh: [], press: null, tip: null, noHover: false, lastHover: null };
const BTN_STYLE = {
  gold: ['#fff0a0', '#f0b030', '#a8620a', '#fff6c8'],
  green: ['#a0ffb8', '#28c860', '#0a6a2a', '#d8ffe4'],
  red: ['#ffa080', '#e83a2a', '#7a0a14', '#ffd8c8'],
  blue: ['#a8dcff', '#2a8ae8', '#0a3a8a', '#d8f0ff'],
  purple: ['#e0b0ff', '#9a4ae8', '#3a0a7a', '#f0e0ff'],
  dark: ['#4a4066', '#2a2240', '#140e22', 'rgba(255,255,255,.28)'],
};
function hit(x, y, w, h) { const m = G.mouse; return m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h; }
function button(id, x, y, w, h, label, o = {}) {
  const hov = !UI.noHover && hit(x, y, w, h);
  if (!o.invisible) {
    const st = BTN_STYLE[o.style || 'dark'], c = ctx, r = o.r ?? 12;
    c.save();
    if (o.disabled) c.globalAlpha = .45;
    rr(c, x, y + 3, w, h, r); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
    rr(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, st[0]); g.addColorStop(.45, st[1]); g.addColorStop(1, st[2]);
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = st[3]; c.stroke();
    rr(c, x + 3, y + 2, w - 6, h * .42, r * .8); c.fillStyle = 'rgba(255,255,255,.16)'; c.fill();
    if (hov && !o.disabled) { rr(c, x, y, w, h, r); c.fillStyle = UI.press === id ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.13)'; c.fill(); }
    if (o.active) { rr(c, x - 2, y - 2, w + 4, h + 4, r + 2); c.lineWidth = 3; c.strokeStyle = '#ffe080'; c.stroke(); }
    if (label) {
      const lines = String(label).split('\n'); let sz = o.size || 22;
      for (const l of lines) { c.font = font(sz, o.weight || 800); while (sz > 10 && c.measureText(l).width > w - 14) { sz--; c.font = font(sz, o.weight || 800); } }
      lines.forEach((l, i) => txt(c, l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * sz * 1.15 + 1, { size: sz, weight: o.weight || 800, color: o.color || '#ffffff', stroke: 'rgba(0,0,0,.45)', sw: 3 }));
    }
    c.restore();
  }
  if (!o.disabled && o.fn) UI.nh.push({ id, x, y, w, h, fn: o.fn });
  if (hov && o.tip) UI.tip = { lines: [o.tip] };
  return hov;
}
function findHit(x, y) { for (let i = UI.hits.length - 1; i >= 0; i--) { const b = UI.hits[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }
function panel(c, x, y, w, h, o = {}) {
  c.save();
  rr(c, x, y, w, h, o.r ?? 16);
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, o.top || 'rgba(40,24,70,.92)'); g.addColorStop(1, o.bot || 'rgba(16,8,30,.94)');
  c.fillStyle = g; c.fill(); c.lineWidth = o.lw || 2; c.strokeStyle = o.border || 'rgba(255,210,140,.35)'; c.stroke();
  c.restore();
}
function goldText(c, s, x, y, size, o = {}) {
  c.save(); c.font = font(size, 900); c.textAlign = o.align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (o.glow) { c.globalCompositeOperation = 'lighter'; glow(c, x, y, size * 2.2, o.glow, .35); c.globalCompositeOperation = 'source-over'; }
  c.lineWidth = size * .16; c.strokeStyle = o.stroke || '#3a0a0a'; c.strokeText(s, x, y);
  const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  (o.cols || ['#fffbe0', '#ffd23a', '#e07a0a']).forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  c.fillStyle = g; c.fillText(s, x, y); c.restore();
}

// ===== 主畫面 =====
let MENU_SYMS = null;
function menuBg(c, dt) {
  const t = G.time;
  const g = c.createRadialGradient(W / 2, H * .42, 50, W / 2, H / 2, W * .75);
  g.addColorStop(0, '#3a1260'); g.addColorStop(.5, '#1a0838'); g.addColorStop(1, '#05020e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H * .36); c.rotate(t * .05); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    c.rotate(TAU / 18);
    const gr = c.createLinearGradient(0, 0, 1100, 0); gr.addColorStop(0, 'rgba(255,200,120,.10)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    c.beginPath(); c.moveTo(0, 0); c.lineTo(1100, -70); c.lineTo(1100, 70); c.closePath(); c.fillStyle = gr; c.fill();
  }
  c.restore();
  if (!MENU_SYMS) { MENU_SYMS = []; for (let i = 0; i < 26; i++) MENU_SYMS.push({ id: pick(SYM_KEYS), x: rand(W), y: rand(H), v: rand(20, 60), r: rand(TAU), vr: rand(-.6, .6), s: rand(50, 110), a: rand(.15, .45) }); }
  for (const s of MENU_SYMS) {
    s.y -= s.v * dt; s.r += s.vr * dt; if (s.y < -80) { s.y = H + 80; s.x = rand(W); s.id = pick(SYM_KEYS); }
    c.save(); c.globalAlpha = s.a; c.translate(s.x, s.y); c.rotate(s.r); c.drawImage(getSym(s.id), -s.s / 2, -s.s / 2, s.s, s.s); c.restore();
  }
  if (Math.random() < dt * 20) fxU.add({ kind: 'star', x: rand(W), y: rand(H), life: rand(.8, 1.6), size: rand(3, 8), col: pick(['#ffe080', '#ffffff', '#ff9af0']), twinkle: true, fadeIn: .3 });
}
function drawTitle(c, y) {
  const t = G.time;
  c.save(); c.globalCompositeOperation = 'lighter'; glow(c, W / 2, y, 420, '#ff4ad8', .25); glow(c, W / 2, y, 260, '#ffcf3a', .25); c.restore();
  goldText(c, '運氣戰鬥', W / 2, y, 150, { stroke: '#2a0618' });
  // 光澤掃過
  c.save(); c.font = font(150, 900); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.globalCompositeOperation = 'lighter';
  const sx = ((t * 500) % 2400) - 600;
  const g = c.createLinearGradient(sx, 0, sx + 200, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillText('運氣戰鬥', W / 2, y); c.restore();
  txt(c, 'FORTUNE SIEGE  ·  命運轉輪 × 塔防 × 合成 × 寶藏', W / 2, y + 100, { size: 28, color: '#ffe6c0', weight: 700, stroke: 'rgba(0,0,0,.6)', sw: 5 });
}
function drawMenu(c, dt) {
  menuBg(c, dt);
  drawTitle(c, 230);
  const ids = ['seven', 'wild', 'chest', 'wheel', 'seven'];
  ids.forEach((id, i) => { const x = W / 2 + (i - 2) * 130, y = 430 + Math.sin(G.time * 3 + i) * 10; c.drawImage(getSym(id), x - 55, y - 55, 110, 110); });
  const bx = W / 2 - 180;
  button('play', bx, 530, 360, 84, '開始遊戲', { style: 'gold', size: 36, fn: () => { G.screen = 'maps'; AU.play('click'); } });
  button('talent', bx, 632, 360, 68, `天賦樹  ⭐ ${G.meta.stars}`, { style: 'purple', size: 26, fn: () => { G.screen = 'talents'; AU.play('click'); } });
  button('codex', bx, 716, 360, 68, `圖鑑  ${codexPct()}%`, { style: 'blue', size: 26, fn: () => { G.screen = 'codex'; AU.play('click'); } });
  button('howto', bx, 800, 175, 60, '遊戲說明', { size: 22, fn: () => { G.menuHelp = true; AU.play('click'); } });
  button('snd', bx + 185, 800, 175, 60, G.settings.music ? '🎵 音樂 開' : '🎵 音樂 關', { size: 22, fn: () => { G.settings.music = !G.settings.music; saveMeta(); } });
  const t = G.time;
  // 左：賭場展示（迷你轉輪）
  {
    const x = 120, y = 470, w = 520, h = 440;
    rr(c, x, y, w, h, 26); c.fillStyle = 'rgba(20,6,40,.85)'; c.fill(); neonRR(c, x, y, w, h, 26, { w: 3, speed: 2 });
    neonText(c, '🎰 幸運賭場', x + w / 2, y + 44, 34, '#ff4ad8', { core: '#ffffff' });
    const syms = ['seven', 'cherry', 'bell', 'bar', 'diamond', 'crown', 'wild', 'chest'];
    for (let i = 0; i < 3; i++) {
      const rx = x + 70 + i * 132, ry = y + 82, rw = 118, rh = 200;
      c.save(); rr(c, rx, ry, rw, rh, 12); c.clip(); c.fillStyle = '#f4f0fa'; c.fillRect(rx, ry, rw, rh);
      const sp = t * (3 + i * .7), base = Math.floor(sp);
      for (let k = -1; k <= 2; k++) { const s2 = syms[((base + k) * (i + 3)) % syms.length], yy = ry + (k - (sp - base)) * 92 + 4; c.drawImage(getSym(s2), rx + 14, yy + 40, 90, 90); }
      const g2 = c.createLinearGradient(0, ry, 0, ry + rh); g2.addColorStop(0, 'rgba(20,0,40,.6)'); g2.addColorStop(.3, 'rgba(0,0,0,0)'); g2.addColorStop(.7, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(20,0,40,.6)'); c.fillStyle = g2; c.fillRect(rx, ry, rw, rh);
      c.restore();
    }
    ['拉霸・小瑪莉・輪盤・骰寶', '翻倍挑戰・彈珠台・刮刮樂', '贏金幣、抽道具、拿限定塔！'].forEach((l, i) => txt(c, l, x + w / 2, y + 318 + i * 34, { size: i === 2 ? 22 : 20, color: i === 2 ? '#ffe080' : '#f0e0ff', weight: 800 }));
  }
  // 右：塔的升星展示
  {
    const x = 1280, y = 470, w = 520, h = 440;
    rr(c, x, y, w, h, 26); c.fillStyle = 'rgba(10,20,40,.85)'; c.fill(); neonRR(c, x, y, w, h, 26, { w: 3, speed: -2 });
    neonText(c, '⚔ 55 種防禦塔', x + w / 2, y + 44, 34, '#3ae8ff', { core: '#ffffff' });
    const keys = ['fire', 'sp_dragon', 'thunder+earth', 'sp_cat', 'ice+thunder+earth', 'prism', 'sniper', 'sp_slot'];
    const cyc = Math.floor(t / 7) % keys.length, tier = 1 + Math.floor((t % 7) / 7 * 6);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x + w / 2, y + 210, 170, TIER_COL[tier], .35); c.restore();
    drawTower(c, keys[cyc], tier, x + w / 2, y + 250, 2.2, t, -Math.PI / 4, { noTierScale: true });
    txt(c, towerName(keys[cyc]), x + w / 2, y + 330, { size: 28, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.6)', sw: 5 });
    txt(c, '★'.repeat(tier) + '  ' + TIER_NAME[tier], x + w / 2, y + 366, { size: 22, weight: 900, color: TIER_COL[tier] });
    txt(c, '商店買塔・升星解鎖新技能・融合發現新塔', x + w / 2, y + 404, { size: 18, color: '#c8f0ff', weight: 700 });
  }
  const m = G.meta;
  txt(c, `遊玩次數 ${m.runs}  ·  頭獎次數 ${m.jackpots}  ·  最高波數 ${Math.max(0, ...Object.values(m.best))}`, W / 2, 900, { size: 20, color: 'rgba(255,230,200,.7)', weight: 600 });
  txt(c, 'Q 賭場 · W 商店 · E 戰場 · 空白鍵 開始／轉動 · ESC 暫停 · 1/2/3 戰鬥速度', W / 2, 1040, { size: 17, color: 'rgba(255,255,255,.4)', weight: 500 });
  fxU.update(dt); fxU.draw(c);
  if (G.menuHelp) { UI.nh.length = 0; UI.tip = null; drawHelpBox(c, () => { G.menuHelp = false; }); }
}
function codexPct() {
  const cx = G.meta.codex;
  const n = ALL_TOWERS.filter(k => cx.towers[k]).length + RELICS.filter(r => cx.relics[r.id]).length + Object.keys(ENEMY).filter(k => cx.enemies[k]).length;
  return Math.floor(n / (ALL_TOWERS.length + RELICS.length + Object.keys(ENEMY).length) * 100);
}

// ===== 地圖選擇 =====
const MAP_THUMB = [];
function mapUnlocked(i) { const m = MAPS[i]; return !m.need || (G.meta.best[m.need[0]] || 0) >= m.need[1]; }
function drawMaps(c, dt) {
  menuBg(c, dt);
  goldText(c, '選擇戰場', W / 2, 110, 72);
  MAPS.forEach((m, i) => {
    const w = 520, h = 600, x = W / 2 - 810 + i * 560, y = 200;
    const un = mapUnlocked(i), hov = hit(x, y, w, h) && un;
    c.save(); if (hov) { c.translate(x + w / 2, y + h / 2); c.scale(1.03, 1.03); c.translate(-(x + w / 2), -(y + h / 2)); }
    panel(c, x, y, w, h, { border: hov ? '#ffe080' : 'rgba(255,210,140,.4)', lw: hov ? 4 : 2 });
    if (!MAP_THUMB[i]) MAP_THUMB[i] = paintMap(m);
    c.save(); rr(c, x + 20, y + 20, w - 40, 336, 12); c.clip(); c.drawImage(MAP_THUMB[i], x + 20, y + 20, w - 40, 336);
    if (!un) { c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x + 20, y + 20, w - 40, 336); txt(c, '🔒', x + w / 2, y + 188, { size: 80 }); }
    c.restore();
    goldText(c, m.name, x + w / 2, y + 400, 44);
    txt(c, m.sub, x + w / 2, y + 450, { size: 22, color: '#ffe0c0', weight: 600 });
    txt(c, `最佳紀錄：第 ${G.meta.best[m.id] || 0} 波`, x + w / 2, y + 490, { size: 20, color: '#a8f0ff', weight: 600 });
    txt(c, `星星獎勵 ×${m.star}`, x + w / 2, y + 522, { size: 18, color: '#ffcf3a', weight: 600 });
    if (!un) txt(c, `解鎖條件：${MAPS.find(q => q.id === m.need[0]).name} 達到第 ${m.need[1]} 波`, x + w / 2, y + 562, { size: 18, color: '#ff9a9a', weight: 700 });
    else txt(c, '點擊出發 ▶', x + w / 2, y + 562, { size: 22, color: hov ? '#ffffff' : '#ffe080', weight: 800 });
    c.restore();
    if (un) UI.nh.push({ id: 'map' + i, x, y, w, h, fn: () => { AU.play('click'); newRun(i); } });
  });
  button('back', 60, 960, 200, 70, '← 返回', { size: 26, fn: () => { G.screen = 'menu'; } });
  fxU.update(dt); fxU.draw(c);
}

// ===== 天賦樹 =====
function drawTalents(c, dt) {
  menuBg(c, dt);
  goldText(c, '天賦樹', W / 2, 100, 72);
  txt(c, `⭐ 星星：${G.meta.stars}　（每局結束時依照到達的波數與頭獎次數獲得）`, W / 2, 170, { size: 24, color: '#ffe080', weight: 700 });
  TALENTS.forEach((tl, i) => {
    const col = i % 4, row = Math.floor(i / 4), w = 400, h = 300, x = W / 2 - 830 + col * 420, y = 230 + row * 330;
    const lv = G.meta.talents[tl.id] || 0, max = lv >= tl.max, cost = tl.cost(lv);
    panel(c, x, y, w, h, { border: max ? '#ffcf3a' : 'rgba(200,160,255,.45)' });
    c.font = `64px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tl.e, x + w / 2, y + 62);
    goldText(c, tl.name, x + w / 2, y + 128, 32);
    txt(c, tl.desc, x + w / 2, y + 168, { size: 20, color: '#e8e0ff', weight: 600 });
    for (let k = 0; k < tl.max; k++) {
      const px = x + w / 2 + (k - (tl.max - 1) / 2) * 34;
      c.beginPath(); c.arc(px, y + 206, 11, 0, TAU); c.fillStyle = k < lv ? '#ffcf3a' : 'rgba(255,255,255,.12)'; c.fill(); c.strokeStyle = '#ffe080'; c.lineWidth = 1.5; c.stroke();
    }
    button('tal' + i, x + 70, y + 230, w - 140, 54, max ? '已滿級' : `升級  ⭐ ${cost}`, {
      style: max ? 'dark' : G.meta.stars >= cost ? 'gold' : 'dark', size: 22, disabled: max,
      fn: () => {
        if (G.meta.stars < cost) { AU.play('error'); return; }
        G.meta.stars -= cost; G.meta.talents[tl.id] = lv + 1; saveMeta(); AU.play('merge');
        burst(fxU, x + w / 2, y + 206, 30, { col: ['#ffcf3a', '#ffffff'], smax: 300 });
      },
    });
  });
  button('back', 60, 960, 200, 70, '← 返回', { size: 26, fn: () => { G.screen = 'menu'; } });
  fxU.update(dt); fxU.draw(c);
}

// ===== 圖鑑 =====
function fakeEnemy(type, r) {
  const d = ENEMY[type];
  return { def: d, r: r || d.r, t: G.time + type.length, x: 0, y: 0, fly: !!d.fly, resist: null, phased: false, dir: 0, flash: 0, frozen: 0, slowAmt: 0, psn: 0, shred: 0, stun: 0, elite: false, boss: false, hp: 1, maxHp: 1, shield: d.shield ? 1 : 0, shieldMax: 1 };
}
// 圖鑑裡還沒發現的東西畫成黑影：只在第一次產生、之後重複使用
// （以前每一幀都用 Canvas 濾鏡畫上百個黑影，在一般顯示下會慢到像當機）
const SIL = new Map();
function silhouette(id, size, draw) {
  let cv = SIL.get(id);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    try { draw(g); } catch (e) { console.error(e); }
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000000'; g.fillRect(0, 0, size, size);
    SIL.set(id, cv);
  }
  return cv;
}
function drawCodex(c, dt) {
  menuBg(c, dt);
  c.fillStyle = 'rgba(5,2,14,.55)'; c.fillRect(0, 0, W, H);
  goldText(c, '圖鑑', W / 2, 70, 60);
  const cx = G.meta.codex;
  const tabs = [`防禦塔 ${ALL_TOWERS.filter(k => cx.towers[k]).length}/${ALL_TOWERS.length}`, `遺物 ${RELICS.filter(r => cx.relics[r.id]).length}/${RELICS.length}`, `敵人 ${Object.keys(ENEMY).filter(k => cx.enemies[k]).length}/${Object.keys(ENEMY).length}`];
  tabs.forEach((tb, i) => button('tab' + i, W / 2 - 480 + i * 330, 120, 300, 56, tb, { style: G.codexTab === i ? 'gold' : 'dark', size: 22, fn: () => { G.codexTab = i; AU.play('click'); } }));
  if (G.codexTab === 0) {
    ALL_TOWERS.forEach((key, i) => {
      const col = i % 8, row = Math.floor(i / 8), w = 222, h = 112, x = 36 + col * 232, y = 192 + row * 118;
      const known = !!cx.towers[key], kind = towerKind(key);
      panel(c, x, y, w, h, { r: 12, border: known ? (kind === 'prism' ? '#ff9af0' : kind === 'trinity' ? '#ffcf3a' : kind === 'hybrid' ? '#7ae0ff' : 'rgba(255,255,255,.3)') : 'rgba(255,255,255,.12)' });
      if (known) drawTower(c, key, Math.min(3, kind === 'base' || kind === 'class' ? 1 : 2), x + 46, y + 70, .95, G.time + i, -Math.PI / 4, { flat: true, noTierScale: true });
      else { c.save(); c.globalAlpha = .55; c.drawImage(silhouette('t_' + key, 240, g => drawTower(g, key, 1, 120, 150, 1.9, 0, -Math.PI / 4, { flat: true, noTierScale: true })), x + 46 - 60, y + 70 - 75, 120, 120); c.restore(); }
      txt(c, known ? towerName(key) : '？？？', x + 144, y + 24, { size: 18, color: known ? '#fff' : '#8a80a0', weight: 800 });
      txt(c, kindName(key), x + 144, y + 46, { size: 13, color: '#c8b8e8', weight: 600 });
      const els = elemsOf(key);
      els.forEach((e, k) => { const ex = x + 144 + (k - (els.length - 1) / 2) * 20; c.beginPath(); c.arc(ex, y + 68, 7, 0, TAU); c.fillStyle = ELEM[e].c; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); });
      txt(c, known ? MODE_NAME[towerMode(key)] : (kind === 'special' ? '賭場限定' : '尚未發現'), x + 144, y + 92, { size: 13, color: '#a8f0ff', weight: 600 });
      if (hit(x, y, w, h)) UI.tip = { title: known ? towerName(key) : '？？？', col: known ? '#ffe080' : '#aaa', lines: [known ? towerDesc(key) : '尚未發現這座塔', '配方：' + ((known || kind === 'base' || kind === 'hybrid' || kind === 'class' || kind === 'special') ? recipeOf(key) : '？？？')] };
    });
  } else if (G.codexTab === 1) {
    RELICS.forEach((rel, i) => {
      const col = i % 8, row = Math.floor(i / 8), w = 222, h = 112, x = 36 + col * 232, y = 192 + row * 118;
      const known = !!cx.relics[rel.id];
      panel(c, x, y, w, h, { r: 12, border: known ? RAR_COL[rel.r] : 'rgba(255,255,255,.12)' });
      if (known) drawRelic(c, rel, x + 42, y + 56, 56);
      else { c.save(); c.globalAlpha = .5; c.drawImage(silhouette('r_' + rel.id, 160, g => drawRelic(g, rel, 80, 80, 112)), x + 42 - 40, y + 56 - 40, 80, 80); c.restore(); }
      txt(c, known ? rel.n : '？？？', x + 144, y + 22, { size: 18, color: known ? RAR_COL[rel.r] : '#8a80a0', weight: 800 });
      txt(c, RAR_NAME[rel.r], x + 144, y + 44, { size: 13, color: '#c8b8e8', weight: 600 });
      if (known) { c.font = font(12, 500); wrapLines(c, rel.d, 140).slice(0, 3).forEach((l, k) => txt(c, l, x + 144, y + 64 + k * 15, { size: 12, color: '#e8e0ff', weight: 500 })); }
      if (hit(x, y, w, h) && known) UI.tip = { title: rel.n, col: RAR_COL[rel.r], lines: [rel.d] };
    });
  } else {
    Object.keys(ENEMY).forEach((type, i) => {
      const col = i % 4, row = Math.floor(i / 4), w = 430, h = 220, x = 60 + col * 450, y = 200 + row * 240;
      const known = !!cx.enemies[type], d = ENEMY[type];
      panel(c, x, y, w, h, { r: 14, border: known ? (d.boss ? '#ff6a6a' : 'rgba(255,255,255,.35)') : 'rgba(255,255,255,.12)' });
      if (known) { const fe = fakeEnemy(type, d.boss ? 40 : 30); fe.x = x + 100; fe.y = y + 115; drawEnemy(c, fe, G.time); }
      else { c.save(); c.globalAlpha = .55; c.drawImage(silhouette('e_' + type, 400, g => { const fe = fakeEnemy(type, (d.boss ? 40 : 30) * 2); fe.x = 200; fe.y = 230; drawEnemy(g, fe, 0); }), x, y, 200, 200); c.restore(); }
      txt(c, known ? d.name : '？？？', x + 300, y + 50, { size: 28, color: d.boss ? '#ff8a8a' : '#fff', weight: 900 });
      if (known) {
        txt(c, `生命 ${d.hp}  ·  速度 ${d.spd}${d.armor ? '  ·  護甲 ' + d.armor : ''}`, x + 300, y + 92, { size: 16, color: '#c8e8ff', weight: 600 });
        c.font = font(16, 500); wrapLines(c, d.desc, 230).forEach((l, k) => txt(c, l, x + 300, y + 128 + k * 22, { size: 16, color: '#e8e0ff', weight: 500 }));
      }
    });
  }
  button('back', 40, 40, 180, 60, '← 返回', { size: 24, fn: () => { G.screen = 'menu'; } });
}

// ===== 結算畫面 =====
function drawResult(c, dt) {
  menuBg(c, dt);
  const r = G.result;
  goldText(c, r.victory ? '凱旋歸來！' : '城堡淪陷', W / 2, 170, 110, r.victory ? {} : { cols: ['#ffd0d0', '#ff5a5a', '#8a0a0a'] });
  txt(c, `${r.mapName} · 到達第 ${r.wave} 波`, W / 2, 270, { size: 34, color: '#ffe6c0', weight: 800 });
  panel(c, W / 2 - 420, 320, 840, 420);
  const rows = [['擊敗敵人', fmtComma(r.stats.kills)], ['賭局次數', r.stats.bets || 0], ['賭場盈虧', ((r.stats.casinoNet || 0) >= 0 ? '+' : '') + fmtComma(r.stats.casinoNet || 0) + ' 金'], ['單次最大獎', fmtComma(r.stats.bestWin) + ' 金'], ['升星次數', r.stats.merges], ['融合次數', r.stats.fusions], ['收集遺物', r.relics]];
  rows.forEach(([k, v], i) => { txt(c, k, W / 2 - 340, 370 + i * 50, { size: 26, align: 'left', color: '#d8c8f8', weight: 600 }); txt(c, '' + v, W / 2 + 340, 370 + i * 50, { size: 28, align: 'right', color: '#fff', weight: 800 }); });
  const k = Math.min(1, (G.time - r.t0) / 1.5);
  goldText(c, `+ ${Math.floor(r.stars * easeOutCubic(k))} ⭐`, W / 2, 800, 64, { glow: '#ffcf3a' });
  if (r.newBest) txt(c, '★ 新紀錄！', W / 2, 860, { size: 28, color: '#7affb0', weight: 900 });
  button('again', W / 2 - 380, 920, 360, 80, '再玩一局', { style: 'gold', size: 32, fn: () => { G.screen = 'maps'; } });
  button('tomenu', W / 2 + 20, 920, 360, 80, '主選單', { size: 32, fn: () => { G.screen = 'menu'; } });
  fxU.update(dt); fxU.draw(c);
}
function endRun(victory) {
  const m = R.map;
  const stars = Math.max(1, Math.round((Math.floor(R.wave * .6) + (R.victory ? 15 : 0) + R.stats.jackpots * 2) * m.star));
  const prev = G.meta.best[m.id] || 0;
  G.meta.stars += stars; G.meta.best[m.id] = Math.max(prev, R.wave); G.meta.runs++; G.meta.jackpots += R.stats.jackpots;
  saveMeta();
  G.result = { victory: R.victory || victory, wave: R.wave, stars, stats: R.stats, relics: R.relics.length, mapName: m.name, t0: G.time, newBest: R.wave > prev };
  G.screen = 'result'; R = null; fxU.clear();
  if (G.result.victory) for (let i = 0; i < 6; i++) setTimeout(() => fireworks(rand(400, 1500), rand(150, 500), 1.2), i * 300);
}

// ===== 遊戲中 HUD =====
function drawGameScreen(c, dt) {
  c.fillStyle = '#0a0614'; c.fillRect(0, 0, W, H);
  const modal = activeModal();
  UI.noHover = !!modal;
  if (R.phase === 'wave' && R.tab !== 'battle') R.tab = 'battle';
  if (R.tab === 'casino') drawCasino(c, dt);
  else if (R.tab === 'shop') { drawShop(c, dt); drawHand(c); }
  else {
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a0e30'); bg.addColorStop(1, '#0a0614'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    drawWorld(c); drawBattlePanel(c); drawHand(c); drawTowerCards(c);
  }
  drawTopBar(c);
  drawToasts(c, dt);
  if (R.tab === 'battle') drawBanner(c, dt); else if (G.banner) { G.banner.t += dt; if (G.banner.t > 2.6) G.banner = null; }
  drawPops(c, dt);
  fxU.update(dt);
  if (!modal) fxU.draw(c);
  if (G.drag && G.drag.moved) drawDragGhost(c);
  if (modal) { UI.nh.length = 0; UI.noHover = false; UI.tip = null; drawModal(c, modal, dt); fxU.draw(c); if (modal.type === 'celebrate') drawCelebrateTop(c, modal); }
}
function statIcon(c, id, x, y, s) { c.drawImage(getSym(id), x - s / 2, y - s / 2, s, s); }
const TABS = [{ id: 'casino', e: '🎰', n: '賭場', k: 'Q', col: '#ff4ad8' }, { id: 'shop', e: '🏪', n: '商店', k: 'W', col: '#ffae3c' }, { id: 'battle', e: '⚔', n: '戰場', k: 'E', col: '#3ae8ff' }];
function switchTab(id) {
  if (!R || R.tab === id) return;
  if (R.phase === 'wave' && id !== 'battle') { toast('戰鬥中不能離開戰場！', '#ff8a8a'); AU.play('error'); return; }
  if (R.tab === 'casino' && GM[CZ.game].busy()) { toast('這局還沒結束', '#ff8a8a'); AU.play('error'); return; }
  R.tab = id; R.targeting = null; G.drag = null; stopAuto(); AU.play('click');
}
function drawTopBar(c) {
  const g = c.createLinearGradient(0, 0, 0, 72); g.addColorStop(0, '#2e1450'); g.addColorStop(1, '#140828'); c.fillStyle = g; c.fillRect(0, 0, W, 72);
  const lg = c.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, '#ff4ad8'); lg.addColorStop(.5, '#ffcf3a'); lg.addColorStop(1, '#3ae8ff'); c.fillStyle = lg; c.fillRect(0, 70, W, 3);
  goldText(c, '運氣戰鬥', 86, 37, 30);
  statIcon(c, 'heart', 190, 36, 44);
  const hk = R.hp / R.maxHp;
  rr(c, 214, 24, 126, 24, 8); c.fillStyle = 'rgba(0,0,0,.5)'; c.fill();
  rr(c, 214, 24, 126 * hk, 24, 8); c.fillStyle = hk > .5 ? '#ff4a6a' : hk > .25 ? '#ff8a3a' : '#ff2a2a'; c.fill();
  txt(c, `${R.hp}/${R.maxHp}`, 277, 37, { size: 16, weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 3 });
  statIcon(c, 'coin', 372, 36, 44); txt(c, fmtComma(R.gold), 396, 37, { size: 24, align: 'left', color: '#ffe080', weight: 900, stroke: 'rgba(0,0,0,.6)', sw: 4 });
  statIcon(c, 'gem', 540, 36, 40); txt(c, '' + R.gems, 562, 37, { size: 22, align: 'left', color: '#a8e0ff', weight: 900, stroke: 'rgba(0,0,0,.6)', sw: 4 });
  txt(c, '🍀', 628, 37, { font: `26px ${EMOJI_FONT}` }); txt(c, '' + Math.round(getLuck()), 646, 37, { size: 22, align: 'left', color: '#7affb0', weight: 900, stroke: 'rgba(0,0,0,.6)', sw: 4 });
  if (hit(610, 10, 80, 50)) UI.tip = { title: '幸運值', col: '#7affb0', lines: [`暴擊率 +${(luckFactor(getLuck()) * 15).toFixed(1)}%`, `賭輸時重來機率 +${(luckFactor(getLuck()) * 8).toFixed(1)}%`, '也會提高遺物、小瑪莉大獎的機率'] };
  TABS.forEach((tb, i) => {
    const x = 720 + i * 190, y = 8, w = 180, h = 56, act = R.tab === tb.id, lock = R.phase === 'wave' && tb.id !== 'battle';
    const hov = !UI.noHover && hit(x, y, w, h);
    rr(c, x, y, w, h, 14);
    const tg = c.createLinearGradient(0, y, 0, y + h);
    if (act) { tg.addColorStop(0, mixHex(tb.col, '#ffffff', .2)); tg.addColorStop(1, mixHex(tb.col, '#1a0830', .5)); } else { tg.addColorStop(0, 'rgba(70,50,110,.9)'); tg.addColorStop(1, 'rgba(30,18,50,.9)'); }
    c.fillStyle = tg; c.fill();
    if (act) neonRR(c, x, y, w, h, 14, { col: tb.col, w: 2.5 }); else { c.lineWidth = 1.5; c.strokeStyle = hov ? tb.col : 'rgba(255,255,255,.2)'; c.stroke(); }
    c.font = `26px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(tb.e, x + 40, y + 29);
    txt(c, tb.n, x + 102, y + 26, { size: 24, weight: 900, color: lock ? 'rgba(255,255,255,.4)' : '#ffffff', stroke: 'rgba(0,0,0,.5)', sw: 3 });
    txt(c, lock ? '🔒 戰鬥中' : '快捷鍵 ' + tb.k, x + 102, y + 46, { size: 11, weight: 700, color: 'rgba(255,255,255,.6)' });
    UI.nh.push({ id: 'tab' + tb.id, x, y, w, h, fn: () => switchTab(tb.id) });
  });
  const wv = R.endless ? `無盡 第 ${R.wave} 波` : `第 ${R.wave} / ${WIN_WAVE} 波`;
  txt(c, wv, 1400, 26, { size: 22, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.6)', sw: 4 });
  txt(c, R.phase === 'wave' ? `⚔ 戰鬥中・剩 ${R.spawn.length + R.enemies.length}` : '🛠 備戰中', 1400, 52, { size: 15, weight: 800, color: R.phase === 'wave' ? '#ff9a9a' : '#7affb0' });
  txt(c, R.map.name, 1580, 37, { size: 18, color: '#e0d0ff', weight: 700 });
  button('mute', 1690, 12, 90, 46, G.settings.sfx ? '🔊' : '🔇', { size: 22, fn: () => { G.settings.sfx = !G.settings.sfx; saveMeta(); } });
  button('pause', 1790, 12, 110, 46, '⏸ 暫停', { size: 20, fn: () => { R.modals.unshift({ type: 'pause' }); } });
}
function drawBattlePanel(c) {
  const x = 1318, w = 584, t = G.time;
  // 波次
  panel(c, x, 84, w, 132, { r: 14 });
  if (R.phase === 'wave') {
    txt(c, `⚔ 第 ${R.wave} 波戰鬥中`, x + 20, 112, { size: 22, align: 'left', color: '#ff9a9a', weight: 900 });
    const tot = R.nextWaveTotal || 1, left = R.spawn.length + R.enemies.length;
    rr(c, x + 20, 140, w - 40, 18, 9); c.fillStyle = 'rgba(0,0,0,.5)'; c.fill();
    rr(c, x + 20, 140, (w - 40) * clamp(1 - left / tot, 0, 1), 18, 9); c.fillStyle = '#ff6a6a'; c.fill();
    txt(c, `剩餘敵人 ${left}${R.enraged ? '・狂暴化！' : ''}　🎒 掉落的道具袋用滑鼠掃過就能撿`, x + 20, 186, { size: 14, align: 'left', color: '#e0d0ff', weight: 600 });
  } else {
    const wv = R.nextWave;
    txt(c, `下一波：第 ${wv.n} 波`, x + 20, 110, { size: 22, align: 'left', color: '#ffe080', weight: 900 });
    txt(c, wv.aff ? `敵人抗${ELEM[wv.aff].name}、弱${ELEM[OPP[wv.aff]].name}` : '無元素親和', x + w - 20, 110, { size: 15, align: 'right', color: wv.aff ? ELEM[wv.aff].c : 'rgba(255,255,255,.5)', weight: 800 });
    let ex = x + 44;
    for (const [type, cnt] of Object.entries(wv.counts)) { const fe = fakeEnemy(type, 16); fe.x = ex; fe.y = 160; drawEnemy(c, fe, t); txt(c, '×' + cnt, ex + 34, 166, { size: 16, weight: 800 }); ex += 92; }
    if (wv.boss || wv.elite) { const fe = fakeEnemy(wv.boss || wv.elite, wv.boss ? 22 : 18); fe.x = ex + 6; fe.y = 156; drawEnemy(c, fe, t); txt(c, wv.boss ? '首領！' : '精英', ex + 50, 166, { size: 16, weight: 900, color: '#ff8a8a' }); }
  }
  // Buff
  panel(c, x, 224, w, 84, { r: 14 });
  txt(c, '✨ 增益', x + 20, 246, { size: 17, align: 'left', color: '#ffae3c', weight: 900 });
  if (!R.buffs.length) txt(c, '沒有啟用中的增益（賭場或道具可以獲得）', x + 20, 280, { size: 14, align: 'left', color: 'rgba(255,255,255,.45)', weight: 600 });
  R.buffs.slice(0, 4).forEach((b, i) => {
    const bx = x + 16 + i * 140, by = 262;
    rr(c, bx, by, 132, 38, 10); c.fillStyle = rgba(rarCol(b.r), .2); c.fill(); c.lineWidth = 1.5; c.strokeStyle = rarCol(b.r); c.stroke();
    c.font = `20px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.e, bx + 20, by + 19);
    txt(c, b.n, bx + 38, by + 12, { size: 12, align: 'left', weight: 800, color: '#fff' }); txt(c, `剩 ${b.waves} 波`, bx + 38, by + 28, { size: 12, align: 'left', weight: 700, color: '#ffe080' });
    if (hit(bx, by, 132, 38)) UI.tip = { title: b.e + ' ' + b.n, col: rarCol(b.r), lines: [ITEM_BY[b.id] ? ITEM_BY[b.id].d : '', `剩下 ${b.waves} 波`] };
  });
  // 道具背包
  panel(c, x, 316, w, 380, { r: 14 });
  txt(c, '🎒 道具背包', x + 20, 340, { size: 18, align: 'left', color: '#7ae0ff', weight: 900 });
  txt(c, '點一下會先確認，不會直接用掉', x + 150, 341, { size: 13, align: 'left', color: 'rgba(255,255,255,.5)', weight: 600 });
  const cats = [[null, '全部'], ...Object.entries(ICAT).map(([k, v]) => [k, v.e + v.n])];
  cats.forEach(([k, n], i) => button('ic' + i, x + 16 + i * 92, 360, 86, 34, n, { size: 14, style: R.invCat === k ? 'blue' : 'dark', fn: () => { R.invCat = k; } }));
  drawInventory(c, x + 18, 406, w - 36, 280, R.invCat, 'binv');
  // 遺物
  panel(c, x, 704, w, 92, { r: 14 });
  txt(c, '🏺 遺物', x + 20, 726, { size: 17, align: 'left', color: '#ffe080', weight: 900 });
  const counts = {}; R.relics.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const ids = Object.keys(counts);
  if (!ids.length) txt(c, '擊敗精英、首領，或在寶箱中獲得', x + 20, 762, { size: 14, align: 'left', color: 'rgba(255,255,255,.45)', weight: 600 });
  const rs = Math.min(44, (w - 40) / Math.max(1, ids.length) - 4);
  ids.forEach((id, i) => { const rel = RELIC_BY[id], cx = x + 20 + rs / 2 + i * (rs + 4), cy = 766; drawRelic(c, rel, cx, cy, rs, { count: counts[id] }); if (Math.hypot(G.mouse.x - cx, G.mouse.y - cy) < rs / 2) UI.tip = { title: rel.n, col: RAR_COL[rel.r], lines: [RAR_NAME[rel.r] + '遺物', rel.d] }; });
  // 提示
  panel(c, x, 804, w, 76, { r: 14 });
  if (R.targeting === 'star') { neonText(c, '⭐ 點選地圖上的一座塔來升星', x + w / 2, 832, 22, '#ffcf3a', { core: '#ffffff' }); button('cancelT', x + w / 2 - 60, 848, 120, 28, '取消', { size: 14, fn: () => { R.targeting = null; } }); }
  else { const tip = TIPS[Math.floor(t / 8) % TIPS.length]; c.font = font(15, 600); wrapLines(c, '💡 ' + tip, w - 40).slice(0, 2).forEach((l, i) => txt(c, l, x + 20, 828 + i * 24, { size: 15, align: 'left', color: '#e0d0ff', weight: 600 })); }
  // 控制
  const y = 888;
  if (R.phase === 'build') {
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, x + 190, y + 50, 200, '#ff5a3a', .2 + .12 * Math.sin(t * 4)); c.restore();
    button('next', x, y, 380, 100, R.autoNext && R.nextT > 0 ? `⚔ 第 ${R.wave + 1} 波（${Math.ceil(R.nextT)}）` : `⚔ 開始第 ${R.wave + 1} 波`, { style: 'red', size: 30, fn: startWave, tip: R.towers.length ? '快捷鍵：N' : '先把備戰區的塔拖到地圖上！' });
  } else button('next', x, y, 380, 100, `第 ${R.wave} 波戰鬥中…`, { size: 24, disabled: true });
  button('autonext', x + 392, y, 92, 100, R.autoNext ? '自動\n波次\n開' : '自動\n波次\n關', { style: R.autoNext ? 'green' : 'dark', size: 16, fn: () => { R.autoNext = !R.autoNext; if (R.autoNext && R.phase === 'build') R.nextT = 4; } });
  button('speed', x + 492, y, 92, 100, ['', '▶\n1倍速', '▶▶\n2倍速', '▶▶▶\n3倍速'][R.speed], { style: R.speed > 1 ? 'blue' : 'dark', size: 16, fn: () => { R.speed = R.speed % 3 + 1; }, tip: '快捷鍵：1 / 2 / 3' });
  txt(c, R.phase === 'build' ? '準備好就開戰！還想加強可以先去 🎰 賭場 或 🏪 商店' : '戰鬥中：可以使用背包裡的戰鬥道具', x + w / 2, 1010, { size: 14, color: 'rgba(255,255,255,.55)', weight: 600 });
  txt(c, `場上 ${R.towers.length} 座塔・備戰區 ${R.hand.length}/${HAND_MAX}`, x + w / 2, 1040, { size: 15, color: '#c8f0ff', weight: 700 });
}
function towerDps(st) {
  if (st.mode === 'multi') return st.dmg * st.rate * st.shots;
  if (st.mode === 'beam') return st.dmg * st.rate * st.beams;
  if (st.mode === 'chain') { let s = 0; for (let k = 0; k < st.chain; k++) s += Math.pow(.85, k); return st.dmg * st.rate * s; }
  return st.dmg * st.rate;
}
const FX_COL = { burn: '#ff6a1a', slow: '#48c8ff', shock: '#ffe03a', poison: '#7cf03a', knock: '#5affc8', stun: '#ffcf3a', freeze: '#bfefff', shred: '#c868ff', spread: '#9aff3a', pool: '#ff8a3a' };
function fxDesc(k, v) {
  switch (k) {
    case 'burn': return `燃燒 ${Math.round(v.dps * 100)}%/秒`;
    case 'slow': return `緩速 ${Math.round(v.amt * 100)}%`;
    case 'poison': return `劇毒 ×${Math.round(v.max)}層`;
    case 'stun': return `暈眩 ${Math.round(v.chance * 100)}%`;
    case 'shock': return `感電 ${Math.round(v.chance * 100)}%`;
    case 'freeze': return `冰凍 ${Math.round(v.chance * 100)}%`;
    case 'knock': return `擊退 ${Math.round(v.dist)}`;
    case 'shred': return `破甲 +${Math.round(v.amt * 100)}%`;
    default: return FX_NAME[k];
  }
}
function drawTowerCards(c) {
  if (G.drag && G.drag.moved) return;
  const hv = hoverTower();
  if (hv && hv !== R.sel) drawTowerCard(c, hv, false);
  else if (R.sel && R.towers.includes(R.sel)) drawTowerCard(c, R.sel, true);
}
function drawTowerCard(c, tw, pinned) {
  const st = tw.st, w = 380, h = pinned ? 384 : 288, tc = TIER_COL[tw.tier];
  let x = tw.x + 44, y = tw.y - h / 2;
  if (x + w > MX + COLS * TS - 6) x = tw.x - 44 - w;
  y = clamp(y, MY + 6, MY + ROWS * TS - h - 6);
  c.save();
  c.globalAlpha = .9; c.strokeStyle = tc; c.lineWidth = 2; c.setLineDash([4, 4]);
  c.beginPath(); c.moveTo(tw.x, tw.y - 10); c.lineTo(x < tw.x ? x + w : x, clamp(tw.y - 10, y + 20, y + h - 20)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 20;
  rr(c, x, y, w, h, 16); const bg = c.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, 'rgba(30,14,56,.97)'); bg.addColorStop(1, 'rgba(10,4,22,.97)'); c.fillStyle = bg; c.fill();
  c.shadowBlur = 0;
  neonRR(c, x, y, w, h, 16, { col: tw.tier >= 6 ? null : tc, w: 2, speed: 2 });
  c.save(); c.beginPath(); rr(c, x, y, w, 96, 16); c.clip();
  c.globalCompositeOperation = 'lighter'; glow(c, x + 52, y + 56, 90, tw.tier >= 6 ? rainbow(G.time * 100) : tc, .35); c.restore();
  drawTower(c, tw.key, tw.tier, x + 52, y + 64, .95, G.time, -Math.PI / 4, { flat: true, noTierScale: true, mode: st.mode, shots: st.shots });
  txt(c, towerName(tw.key), x + 104, y + 26, { size: 22, align: 'left', color: tc, weight: 900, stroke: 'rgba(0,0,0,.7)', sw: 4 });
  txt(c, '★'.repeat(tw.tier) + '☆'.repeat(MAX_TIER - tw.tier) + '  ' + TIER_NAME[tw.tier], x + 104, y + 52, { size: 16, align: 'left', color: tc, weight: 800 });
  txt(c, `${kindName(tw.key)} · ${MODE_NAME[st.mode]}${tw.lucky ? ' · ☘幸運格' : ''}`, x + 104, y + 76, { size: 14, align: 'left', color: '#d8c8f8', weight: 600 });
  const rows = [
    ['傷害', fmt(st.dmg) + (st.mode === 'beam' ? '/秒' : '')], ['攻速', st.rate.toFixed(2) + '/秒'], ['射程', Math.round(st.range)],
    ['每秒傷害', fmt(towerDps(st))], [st.mode === 'chain' ? '連鎖' : st.mode === 'multi' ? '彈數' : st.mode === 'beam' ? '光束' : '濺射', st.mode === 'chain' ? st.chain : st.mode === 'multi' ? st.shots : st.mode === 'beam' ? st.beams : (st.splash ? Math.round(st.splash) : '—')],
    ['擊殺 / 總傷', `${tw.kills} / ${fmt(tw.dmg)}`],
  ];
  if (['eco', 'support', 'aura'].includes(st.mode)) { rows.length = 0; statPairs(tw.key, tw.tier).forEach(([n, a]) => rows.push([n, a])); rows.push(['模式', MODE_NAME[st.mode]]); }
  if (tw.bD) rows.push(['戰鼓加成', '+' + Math.round(tw.bD * 100) + '%']);
  rows.forEach(([k, v], i) => {
    const cx = x + 18 + (i % 2) * 170, cy = y + 112 + Math.floor(i / 2) * 26;
    txt(c, k, cx, cy, { size: 14, align: 'left', color: '#a898c8', weight: 600 });
    txt(c, '' + v, cx + 156, cy, { size: 16, align: 'right', color: '#ffffff', weight: 800 });
  });
  let px = x + 16; const py = y + 192;
  for (const k of Object.keys(st.fx)) {
    const label = fxDesc(k, st.fx[k]); c.font = font(13, 800); const pw = c.measureText(label).width + 16;
    if (px + pw > x + w - 12) break;
    rr(c, px, py - 11, pw, 22, 11); c.fillStyle = rgba(FX_COL[k] || '#ffffff', .22); c.fill(); c.strokeStyle = FX_COL[k] || '#fff'; c.lineWidth = 1.2; c.stroke();
    txt(c, label, px + pw / 2, py, { size: 13, color: '#ffffff', weight: 800 }); px += pw + 6;
  }
  txt(c, `★${tw.tier} 技能：${TIER_PERK[tw.tier]}`, x + 16, y + 222, { size: 14, align: 'left', color: tc, weight: 800 });
  if (tw.tier < MAX_TIER) {
    const sp = statPairs(tw.key, tw.tier)[0];
    txt(c, `下一星 ★${tw.tier + 1}：${sp[0]} ${sp[1]} → ${sp[2]}`, x + 16, y + 246, { size: 14, align: 'left', color: TIER_COL[tw.tier + 1], weight: 700 });
    c.font = font(13, 600); const pl = wrapLines(c, '解鎖：' + TIER_PERK[tw.tier + 1], w - 32)[0];
    txt(c, pl, x + 16, y + 266, { size: 13, align: 'left', color: 'rgba(255,255,255,.75)', weight: 600 });
  } else txt(c, '已達最高星級 ★6 神話！', x + 16, y + 250, { size: 16, align: 'left', color: rainbow(G.time * 200), weight: 900 });
  c.restore();
  if (pinned) {
    if (tw.tier < MAX_TIER) {
      const g = ownedGroups().find(q => q.key === tw.key && q.tier === tw.tier), can = !!g && g.list.length >= 2, cost = Math.round(upgradeCost(tw.tier) * (1 - R.mods.shopDisc));
      const other = can ? g.list.find(e => e.ref !== tw) : null;
      button('twUp', x + 14, y + h - 96, w - 28, 40, can ? `⬆ 升到 ★${tw.tier + 1}（💰 ${cost} 金）` : `還差 1 座 ★${tw.tier} ${towerName(tw.key)} 才能升星`, { style: can && R.gold >= cost ? 'green' : 'dark', size: 16, disabled: !can, fn: () => doUpgrade(g, false, tw), tip: can ? `用${other.src === 'hand' ? '備戰區' : '地圖上'}的另一座 ${towerName(tw.key)} ★${tw.tier} 合成，這座塔會原地升級` : '到 🏪 商店買一座相同的塔，或在賭場抽到' });
    }
    const TN = { first: '最前方', last: '最後方', strong: '最強', close: '最近' }, order = ['first', 'last', 'strong', 'close'];
    if (st.mode !== 'pulse') button('tgt', x + 14, y + h - 48, 150, 36, '目標：' + TN[tw.target], { size: 15, fn: () => { tw.target = order[(order.indexOf(tw.target) + 1) % 4]; } });
    button('sell', x + 172, y + h - 48, 128, 36, `出售 +${Math.round(cardValue(tw.key, tw.tier) * .8)}`, { style: 'red', size: 15, fn: () => sellTower(tw) });
    button('closecard', x + w - 48, y + h - 48, 36, 36, '✕', { size: 16, fn: () => { R.sel = null; } });
  } else txt(c, '點一下塔：固定面板、升星、出售', x + w / 2, y + h - 12, { size: 12, color: 'rgba(255,255,255,.4)', weight: 500 });
}
// 「我的塔」小卡片：塔、名字、星級、數量、在地圖上的數量
function drawSlotCard(c, key, tier, x, y, o = {}) {
  const w = CARD_W, h = CARD_H, tc = TIER_COL[tier], els = elemsOf(key), t = G.time;
  c.save();
  if (o.alpha != null) c.globalAlpha = o.alpha;
  if (o.sel) { c.globalCompositeOperation = 'lighter'; glow(c, x + w / 2, y + h / 2, w * .85, tc, .4); c.globalCompositeOperation = 'source-over'; }
  rr(c, x, y, w, h, 10);
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, mixHex(key === 'prism' ? rainbow(t * 100) : ELEM[els[0]].c, '#140a24', .7));
  g.addColorStop(1, mixHex(key === 'prism' ? rainbow(t * 100 + 180) : ELEM[els[els.length - 1]].c, '#0a0614', .82));
  c.fillStyle = g; c.fill(); c.lineWidth = 2.5; c.strokeStyle = tc; c.stroke();
  if (tier >= 4) { c.save(); c.clip(); c.globalCompositeOperation = 'lighter'; const sx = x + ((t * 120 + (o.seed || 0) * 37) % (w * 2.5)) - w * .5; const sg = c.createLinearGradient(sx, 0, sx + 30, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, rgba(tc, .35)); sg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sg; c.fillRect(x, y, w, h); c.restore(); }
  drawTower(c, key, tier, x + w / 2, y + 34, .68, t + (o.seed || 0), -Math.PI / 4, { flat: true, noTierScale: true });
  const nm = towerName(key);
  txt(c, nm, x + w / 2, y + h - 22, { size: nm.length > 5 ? 12 : 14, color: '#ffffff', weight: 900, stroke: 'rgba(0,0,0,.8)', sw: 3 });
  txt(c, '★'.repeat(tier), x + w / 2, y + h - 8, { size: 10, color: tc, weight: 900, stroke: 'rgba(0,0,0,.8)', sw: 3 });
  if (o.nMap) {
    const lbl = o.nHand ? `備戰${o.nHand}・📍地圖${o.nMap}` : '📍 在地圖上';
    rr(c, x + 4, y + h - 44, w - 8, 15, 7); c.fillStyle = 'rgba(16,80,110,.9)'; c.fill();
    txt(c, lbl, x + w / 2, y + h - 36, { size: 10, color: '#c8f6ff', weight: 800 });
  }
  if (o.sel) neonRR(c, x - 2, y - 2, w + 4, h + 4, 12, { col: '#ffe080', w: 3 });
  const total = (o.nHand || 0) + (o.nMap || 0);
  if (total >= 2) { rr(c, x + w - 36, y - 9, 42, 22, 11); c.fillStyle = '#ffcf3a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke(); txt(c, '×' + total, x + w - 15, y + 2, { size: 14, weight: 900, color: '#3a1a00' }); }
  c.restore();
}
function drawHand(c) {
  const gs = myGroups(), pages = Math.max(1, Math.ceil(gs.length / HAND_PAGE)), t = G.time;
  R.handPage = clamp(R.handPage || 0, 0, pages - 1);
  rr(c, 12, HAND_Y - 8, 1296, CARD_H + 16, 14); c.fillStyle = 'rgba(10,6,20,.8)'; c.fill(); c.strokeStyle = 'rgba(255,210,140,.25)'; c.lineWidth = 1.5; c.stroke();
  for (let l = 0; l < HAND_PAGE; l++) {
    const p = slotPos(l); rr(c, p.x, p.y, CARD_W, CARD_H, 10); c.setLineDash([5, 5]); c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
  }
  if (!gs.length) txt(c, R.tab === 'shop' ? '在上面的商店買塔，買到的塔會出現在這裡' : '到 🏪 商店買塔 → 點一下這裡的塔，再點地圖空地就能建造', 580, HAND_Y + CARD_H / 2, { size: 20, color: 'rgba(255,255,255,.35)', weight: 600 });
  const dragging = G.drag && G.drag.moved && G.drag.kind === 'card' ? R.hand[G.drag.idx] : null;
  const badges = [], flying = [];
  gs.forEach((g, gi) => {
    const p = groupSlot(gi);
    for (const cd of g.hand) if (cd.anim >= 0 && cd.anim < 1) flying.push({ cd, p: p || slotPos(HAND_PAGE - 1) });
    if (!p) return;
    const nHand = g.hand.length, nMap = g.map.length, total = nHand + nMap;
    const sel = g.hand.includes(R.hand[R.selCard]) || (R.tab === 'battle' && g.map.includes(R.sel));
    const hov = !UI.noHover && hit(p.x, p.y, CARD_W, CARD_H), lift = (hov && !G.drag) || sel ? 5 : 0;
    const from = dragging && g.hand.includes(dragging);
    drawSlotCard(c, g.key, g.tier, p.x, p.y - lift, { nHand, nMap, sel, seed: gi, alpha: from ? .45 : !nHand ? .82 : 1 });
    if (hov && !G.drag) {
      const how = R.tab === 'battle' ? (nHand ? '點一下選取 → 再點地圖空地建造；也可以直接拖到地圖上' : '點一下可以在地圖上找到這座塔') : (nHand ? '拖到別的塔上可以融合；到 ⚔ 戰場就能放到地圖上' : '已經全部放在地圖上了');
      UI.tip = { title: `${towerName(g.key)} ★${g.tier}${total >= 2 ? `　×${total}` : ''}`, col: TIER_COL[g.tier], lines: [kindName(g.key) + '・' + MODE_NAME[towerMode(g.key)], towerDesc(g.key), `備戰區 ${nHand} 座・地圖上 ${nMap} 座`, how, total >= 2 && g.tier < MAX_TIER ? '有兩座以上：點左上角 ⬆ 就能升星' : '再一座相同的就能升星'] };
    }
    if (g.tier < MAX_TIER && total >= 2 && !dragging) badges.push({ g, x: p.x - 6, y: p.y - lift - 11 });
  });
  // 剛買到、正在飛進來的卡片
  for (const { cd, p } of flying) {
    const k = easeOutCubic(Math.min(1, cd.anim));
    const x = lerp(cd.fx - CARD_W / 2, p.x, k), yy = lerp(cd.fy - CARD_H / 2, p.y, k) - Math.sin(k * Math.PI) * 80;
    drawSlotCard(c, cd.key, cd.tier, x, yy, { seed: cd.id });
    if (cd.anim > .02 && Math.random() < .5) fxU.add({ kind: 'glow', x: x + CARD_W / 2, y: yy + CARD_H / 2, size: 30, col: TIER_COL[cd.tier], life: .3 });
  }
  // 有兩座以上：左上角 ⬆ 升星（地圖上的也算）
  for (const bd of badges) {
    const { g } = bd, cost = Math.round(upgradeCost(g.tier) * (1 - R.mods.shopDisc)), ok = R.gold >= cost, hv = !UI.noHover && hit(bd.x, bd.y, 50, 24);
    c.save(); c.globalCompositeOperation = 'lighter'; glow(c, bd.x + 25, bd.y + 12, 32, ok ? '#5aff9a' : '#ffaa5a', .45 + .25 * Math.sin(t * 6)); c.restore();
    rr(c, bd.x, bd.y, 50, 24, 12); c.fillStyle = ok ? (hv ? '#3ad87a' : '#22a85a') : '#7a5a4a'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
    txt(c, '⬆★' + (g.tier + 1), bd.x + 25, bd.y + 12, { size: 13, weight: 900, color: '#ffffff', stroke: 'rgba(0,0,0,.4)', sw: 3 });
    UI.nh.push({ id: 'hup' + g.key + g.tier, x: bd.x - 2, y: bd.y - 2, w: 54, h: 28, fn: () => { doUpgrade(ownedGroups().find(q => q.key === g.key && q.tier === g.tier), false, R.tab === 'battle' && g.map.includes(R.sel) ? R.sel : null); } });
    if (hv) {
      const sp = statPairs(g.key, g.tier).slice(0, 3).map(([nm, a2, b2]) => `${nm} ${a2} → ${b2}`);
      UI.tip = { title: `⬆ 升星 ★${g.tier} → ★${g.tier + 1}`, col: '#7affb0', lines: [`花 ${cost} 金，把兩座 ${towerName(g.key)} ★${g.tier} 合成一座 ★${g.tier + 1}`, g.map.length ? '地圖上的塔會原地升級，不用拿下來' : '升級後留在備戰區', ...sp, ok ? '點一下就升星！' : '金幣不足'] };
    }
  }
  // 換頁（塔的種類超過 10 種時才需要；拖著卡片停在 ◀▶ 上也會換頁）
  const pg = PAGER, dragCard = G.drag && G.drag.moved && G.drag.kind === 'card';
  rr(c, pg.x, pg.y, pg.w, pg.h, 10); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill();
  button('hpUp', pg.x + 3, pg.y + 2, pg.w - 6, 26, '◀', { size: 14, disabled: R.handPage <= 0, fn: () => { R.handPage--; }, tip: '上一頁' });
  txt(c, `${R.handPage + 1}/${pages}`, pg.x + pg.w / 2, pg.y + 42, { size: 14, weight: 900, color: '#ffe080' });
  button('hpDn', pg.x + 3, pg.y + 56, pg.w - 6, 26, '▶', { size: 14, disabled: R.handPage >= pages - 1, fn: () => { R.handPage++; }, tip: '下一頁' });
  if (dragCard && hit(pg.x, pg.y, pg.w, pg.h)) {
    if (!R.pgHov) R.pgHov = t;
    else if (t - R.pgHov > .45) { R.pgHov = t; const up = G.mouse.y < pg.y + pg.h / 2; R.handPage = clamp(R.handPage + (up ? -1 : 1), 0, pages - 1); }
  } else R.pgHov = 0;
  // 出售區
  const hovT = G.drag && G.drag.moved && inTrash(G.mouse.x, G.mouse.y);
  rr(c, TRASH.x, TRASH.y, TRASH.w, TRASH.h, 10); c.fillStyle = hovT ? 'rgba(255,90,90,.35)' : 'rgba(255,90,90,.1)'; c.fill();
  c.strokeStyle = hovT ? '#ff8a8a' : 'rgba(255,120,120,.4)'; c.lineWidth = 2; c.stroke();
  txt(c, '💰', TRASH.x + TRASH.w / 2, TRASH.y + 28, { font: `26px ${EMOJI_FONT}` });
  txt(c, '拖到這裡出售', TRASH.x + TRASH.w / 2, TRASH.y + 62, { size: 13, color: '#ffb0b0', weight: 800 });
}
function drawDragGhost(c) {
  const d = G.drag, m = G.mouse;
  if (d.kind === 'card') { const card = R.hand[d.idx]; if (card) drawTower(c, card.key, card.tier, m.x, m.y + 8, 1.05, G.time, -Math.PI / 2); }
  else drawTower(c, d.tw.key, d.tw.tier, m.x, m.y + 8, 1.05, G.time, d.tw.ang);
  if (d.kind === 'card') {
    const g = slotAt(m.x, m.y), it = R.hand[d.idx];
    const tgt = g && it && !(g.key === it.key && g.tier === it.tier) ? (g.hand.find(q => q.anim >= 1) || g.map[0]) : null;
    if (tgt) {
      const res = fuseResult(it, tgt), mc = res ? mergeCost(res, it.tier) : 0;
      const label = res ? `${res.type === 'fuse' ? '融合' : '升星'} → ${towerName(res.key)} ★${res.tier}・💰${mc} 金` : (tgt.tier !== it.tier ? '星級不同，無法合成' : '無法合成');
      const col = res ? (R.gold < mc ? '#ffb05a' : '#7affb0') : '#ff5a5a';
      c.font = font(18, 800); const w = c.measureText(label).width + 24;
      rr(c, m.x - w / 2, m.y - 84, w, 32, 8); c.fillStyle = 'rgba(10,6,20,.92)'; c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      txt(c, label, m.x, m.y - 68, { size: 18, color: col, weight: 800 });
    }
  }
  if (inTrash(m.x, m.y)) { const it = dragItem(d); const v = d.kind === 'card' ? cardValue(it.key, it.tier) : Math.round(cardValue(it.key, it.tier) * .8); txt(c, `出售 +${v} 金`, m.x, m.y - 50, { size: 20, color: '#ffcf3a', stroke: '#000', sw: 4, weight: 900 }); }
}
function drawToasts(c, dt) {
  G.toasts.forEach((t, i) => {
    t.t += dt; const a = t.t < .2 ? t.t / .2 : t.t > 2.8 ? Math.max(0, (3.3 - t.t) / .5) : 1;
    const y = 100 + i * 42;
    c.save(); c.globalAlpha = a; c.font = font(20, 800); const w = c.measureText(t.text).width + 40;
    rr(c, 660 - w / 2, y - 17, w, 34, 17); c.fillStyle = 'rgba(10,6,24,.88)'; c.fill(); c.strokeStyle = t.col; c.lineWidth = 1.5; c.stroke();
    txt(c, t.text, 660, y, { size: 20, color: t.col, weight: 800 }); c.restore();
  });
  G.toasts = G.toasts.filter(t => t.t < 3.3);
}
function drawBanner(c, dt) {
  const b = G.banner; if (!b) return;
  b.t += dt; const T = 2.6; if (b.t > T) { G.banner = null; return; }
  const a = b.t < .25 ? b.t / .25 : b.t > T - .5 ? (T - b.t) / .5 : 1;
  const s = b.t < .25 ? lerp(1.4, 1, b.t / .25) : 1;
  c.save(); c.globalAlpha = a;
  const gy = 420; const g = c.createLinearGradient(MX, 0, MX + COLS * TS, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.2, 'rgba(10,4,24,.75)'); g.addColorStop(.8, 'rgba(10,4,24,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(MX, gy - 70, COLS * TS, b.sub ? 150 : 120);
  c.translate(660, gy); c.scale(s, s);
  goldText(c, b.text, 0, 0, 72, { cols: ['#ffffff', b.col, mixHex(b.col, '#000000', .4)], stroke: '#1a0a20' });
  if (b.sub) txt(c, b.sub, 0, 58, { size: 24, color: '#ffffff', weight: 700, stroke: 'rgba(0,0,0,.7)', sw: 4 });
  c.restore();
}
function drawTooltip(c) {
  const t = UI.tip; if (!t) return;
  c.font = font(17, 600);
  const maxW = 380; let lines = [];
  for (const l of t.lines) lines.push(...wrapLines(c, l, maxW));
  const w = Math.min(maxW, Math.max(t.title ? (c.font = font(20, 900), c.measureText(t.title).width) : 0, ...lines.map(l => (c.font = font(17, 600), c.measureText(l).width)))) + 32;
  const h = lines.length * 24 + (t.title ? 36 : 0) + 18;
  let x = G.mouse.x + 18, y = G.mouse.y + 18;
  if (x + w > W - 8) x = G.mouse.x - w - 12; if (y + h > H - 8) y = G.mouse.y - h - 12;
  c.save(); rr(c, x, y, w, h, 10); c.fillStyle = 'rgba(12,6,26,.96)'; c.fill(); c.strokeStyle = t.col || 'rgba(255,220,150,.6)'; c.lineWidth = 2; c.stroke();
  let yy = y + 14;
  if (t.title) { txt(c, t.title, x + 16, yy + 10, { size: 20, align: 'left', color: t.col || '#ffe080', weight: 900 }); yy += 36; }
  lines.forEach(l => { txt(c, l, x + 16, yy + 10, { size: 17, align: 'left', color: '#ece4ff', weight: 600 }); yy += 24; });
  c.restore();
}

// ===== 彈出視窗 =====
function modalBegin(m) {
  m.t = 0;
  switch (m.type) {
    case 'celebrate':
      AU.play(['', '', 'bigwin', 'megawin', 'jackpot'][m.level]); m.dur = [0, 0, 3.2, 4.6, 7][m.level];
      flash(m.level >= 4 ? .6 : .4, m.level >= 4 ? '#ffffff' : '#fff2c0'); shake(m.level * 5); m.spawn = 0; m.fw = 0;
      break;
    case 'fever': AU.play('fever'); m.dur = 2.8; flash(.6, '#ff6a1a'); break;
    case 'wheel': m.ang = -Math.PI / 2 - TAU / 24; m.spinning = false; m.done = false; m.res = null; m.mult = m.mult || 1; break;
    case 'chest': setupChest(m); break;
    case 'tierup': AU.play('tierUp', m.to); AU.play('merge'); flash(.3, TIER_COL[m.to]); break;
    case 'reward': AU.play('jackpot'); flash(.5, '#ffffff'); for (let k = 0; k < 4; k++) fireworks(rand(300, 1600), rand(150, 500), 1.2); break;
    case 'gameover': AU.play('hurt'); break;
    case 'victory': R.victory = true; AU.play('jackpot'); m.fw = 0; break;
  }
}
function updateModals(dt) {
  if (!R) return;
  if (!R.modal && R.modals.length && !SL.spinning) { R.modal = R.modals.shift(); modalBegin(R.modal); }
  const m = R.modal; if (!m) return;
  m.t += dt;
  if (m.type === 'celebrate') {
    const L = m.level, U = unitGold();
    m.spawn += dt * [0, 0, 26, 50, 80][L];
    while (m.spawn > 1) { m.spawn--; fxU.add({ kind: 'coin', x: W / 2 + rand(-220, 220), y: H + 20, vx: rand(-420, 420), vy: rand(-1350, -800), g: 1300, drag: .995, life: rand(1.6, 2.4), size: rand(13, 22), rot: rand(TAU), vr: rand(-14, 14), add: false }); }
    if (L >= 3) {
      m.fw -= dt; if (m.fw <= 0) { m.fw = L >= 4 ? .22 : .45; fireworks(rand(200, W - 200), rand(120, 520), L >= 4 ? 1.3 : 1); AU.play('boom'); }
      if (Math.random() < dt * 40) fxU.add({ kind: 'confetti', x: rand(W), y: -20, vx: rand(-60, 60), vy: rand(150, 300), g: 60, life: rand(3, 5), size: rand(5, 9), col: pick(['#ff3a5a', '#ffcf3a', '#3ad8ff', '#7cff3a', '#ff4ad8', '#ffffff']), rot: rand(TAU), vr: rand(-8, 8), add: false });
    }
    if (L >= 4 && Math.random() < dt * 30) fxU.add({ kind: 'coin', x: rand(W), y: -30, vx: rand(-50, 50), vy: rand(200, 500), g: 600, life: 2.5, size: rand(12, 20), rot: rand(TAU), vr: rand(-10, 10), add: false });
    if (Math.random() < dt * 30) fxU.add({ kind: 'star', x: W / 2 + rand(-450, 450), y: 430 + rand(-120, 120), life: rand(.4, .9), size: rand(8, 18), col: '#ffffff', twinkle: true });
    if (m.t < m.dur * .7) AU.play('coin');
    if (m.t >= m.dur) closeModal();
  } else if (m.type === 'fever') {
    if (Math.random() < dt * 60) fxU.add({ kind: 'glow', x: rand(W), y: H + 10, vx: rand(-30, 30), vy: rand(-500, -250), life: rand(1, 2), size: rand(20, 50), col: pick(['#ff4a10', '#ffae3a', '#ff2a4a']) });
    if (m.t >= m.dur) closeModal();
  } else if (m.type === 'wheel' && m.spinning) {
    const k = Math.min(1, m.t / m.T), e = 1 - Math.pow(1 - k, 4);
    const prev = m.ang; m.ang = lerp(m.from, m.to, e);
    if (Math.floor(prev / (TAU / 12)) !== Math.floor(m.ang / (TAU / 12))) AU.play('wtick');
    if (k >= 1) { m.spinning = false; m.done = true; wheelReward(m); }
  } else if (m.type === 'victory') {
    m.fw -= dt; if (m.fw <= 0) { m.fw = .5; fireworks(rand(200, W - 200), rand(120, 500)); }
  }
}
function closeModal() {
  const m = R.modal; R.modal = null;
  if (m && m.type === 'help') { G.meta.seenHelp = true; saveMeta(); }
}
function drawModal(c, m, dt) {
  switch (m.type) {
    case 'celebrate': return drawCelebrate(c, m);
    case 'fever': return drawFever(c, m);
    case 'tierup': return drawTierUp(c, m);
    case 'reward': return drawRewardModal(c, m);
    case 'wheel': return drawWheel(c, m);
    case 'chest': return drawChest(c, m);
    case 'help': return drawHelpBox(c, closeModal);
    case 'paytable': return drawPaytable(c);
    case 'pause': return drawPause(c);
    case 'useitem': return drawUseItem(c, m);
    case 'gameover': return drawGameOver(c, m);
    case 'victory': return drawVictory(c, m);
  }
}
function dim(c, a = .65) { c.fillStyle = `rgba(4,2,10,${a})`; c.fillRect(0, 0, W, H); }
function godRays(c, x, y, t, cols, n = 16, len = 1300, a = .16) {
  c.save(); c.translate(x, y); c.rotate(t * .35); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    c.rotate(TAU / n); const col = cols[i % cols.length];
    const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.beginPath(); c.moveTo(0, 0); c.lineTo(len, -90); c.lineTo(len, 90); c.closePath(); c.fillStyle = g; c.fill();
  }
  c.restore();
}
function drawCelebrate(c, m) {
  const L = m.level, t = m.t;
  dim(c, Math.min(.72, t * 3));
  const cols = L >= 4 ? [rainbow(t * 200), rainbow(t * 200 + 120), rainbow(t * 200 + 240)] : L === 3 ? ['#ff6ad8', '#ffcf3a'] : ['#ffcf3a', '#fff2a0'];
  godRays(c, W / 2, 420, t, cols, L >= 4 ? 20 : 16, 1400, L >= 4 ? .15 : .14);
  c.save(); c.globalCompositeOperation = 'lighter'; glow(c, W / 2, 420, 520, L >= 4 ? rainbow(t * 150) : '#ffb030', .45); c.restore();
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const nl = L >= 4 ? 8 : L >= 3 ? 6 : 4;
  for (let k = 0; k < nl; k++) {
    const side = k % 2 ? 1 : -1, bx = side > 0 ? W - 40 : 40, ang = -Math.PI / 2 + side * (-.2 - .5 * (.5 + .5 * Math.sin(t * (1.3 + k * .2) + k)));
    const col = rainbow(k * 47 + t * 180), ex = bx + Math.cos(ang) * 1600, ey = H + Math.sin(ang) * 1600;
    for (const [lw, a] of [[16, .1], [6, .35], [2, .9]]) { c.strokeStyle = rgba(col, a); c.lineWidth = lw; c.beginPath(); c.moveTo(bx, H); c.lineTo(ex, ey); c.stroke(); }
  }
  c.restore();
  if (L >= 3) neonRR(c, 14, 14, W - 28, H - 28, 30, { w: 6, speed: 5 });
  const T = [['', ''], ['', ''], ['大獎', 'BIG WIN'], ['超級大獎', 'MEGA WIN'], ['傳說頭獎', 'JACKPOT']][L];
  const k = Math.min(1, t / .9), s = easeOutElastic(k) * (1 + .03 * Math.sin(t * 9));
  if (m.title) neonText(c, m.title, W / 2, 150, 60, rainbow(t * 200), { core: '#ffffff' });
  c.save(); c.translate(W / 2, 400); c.scale(s, s); c.rotate(Math.sin(t * 3) * .02);
  const cs = L >= 4 ? ['#ffffff', rainbow(t * 300), rainbow(t * 300 + 90, 40)] : L === 3 ? ['#ffe0ff', '#ff5ad8', '#8a0a8a'] : undefined;
  goldText(c, T[1], 0, -80, L >= 4 ? 170 : 140, { cols: cs, stroke: '#1a0410', glow: L >= 4 ? '#ffffff' : '#ffcf3a' });
  goldText(c, T[0], 0, 60, 80, { stroke: '#2a0a0a' });
  if (m.combo) neonText(c, `連鎖 ×${m.chain || 3} COMBO！`, 0, 140, 40, '#3affff', { core: '#ffffff' });
  if (m.mult > 1) neonText(c, `倍率 ×${m.mult}`, 0, m.combo ? 196 : 146, 46, '#ff6aff', { core: '#ffffff' });
  c.restore();
  button('cel', 0, 0, W, H, '', { invisible: true, fn: () => { if (m.t < m.dur * .6) m.t = m.dur * .6; else closeModal(); } });
}
function drawCelebrateTop(c, m) {
  const t = m.t;
  if (m.gold > 0) {
    const k2 = Math.min(1, t / (m.dur * .6));
    const v = Math.floor(m.gold * easeOutCubic(k2));
    const pop = k2 >= 1 ? 1 + .12 * Math.max(0, 1 - (t - m.dur * .6) * 4) : 1;
    c.save(); c.translate(W / 2, 700); c.scale(pop, pop);
    rr(c, -380, -70, 760, 140, 70); c.fillStyle = 'rgba(20,6,30,.75)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffcf3a'; c.stroke();
    statIcon(c, 'coin', -260, 0, 100);
    goldText(c, '+' + fmtComma(v), 50, 4, 100, { glow: '#ffcf3a' });
    c.restore();
  }
  if (t > 1) txt(c, '點擊任意處繼續', W / 2, 1010, { size: 22, color: `rgba(255,255,255,${.4 + .3 * Math.sin(t * 5)})`, weight: 700, stroke: 'rgba(0,0,0,.7)', sw: 4 });
}
function drawFever(c, m) {
  const t = m.t; dim(c, Math.min(.6, t * 3));
  godRays(c, W / 2, 480, t * 2, ['#ff4a10', '#ffcf3a'], 18, 1300, .2);
  const s = easeOutElastic(Math.min(1, t / .8));
  c.save(); c.translate(W / 2, 450); c.scale(s, s);
  goldText(c, 'FEVER!!', 0, 0, 200, { cols: ['#fff6b0', '#ff8a1a', '#c8100a'], stroke: '#2a0400', glow: '#ff4a10' });
  c.restore();
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let k = 0; k < 6; k++) { const side = k % 2 ? 1 : -1, bx = side > 0 ? W - 60 : 60, ang = -Math.PI / 2 + side * (-.3 - .4 * (.5 + .5 * Math.sin(t * 2 + k))); const col = rainbow(k * 60 + t * 200); c.strokeStyle = rgba(col, .5); c.lineWidth = 5; c.beginPath(); c.moveTo(bx, H); c.lineTo(bx + Math.cos(ang) * 1500, H + Math.sin(ang) * 1500); c.stroke(); }
  c.restore();
  neonRR(c, 14, 14, W - 28, H - 28, 30, { w: 6, speed: 6 });
  neonText(c, m.retrigger ? `再加 ${m.n} 次免費遊戲！` : `免費遊戲 × ${m.n || 8} 次`, W / 2, 640, 56, '#ff4ad8', { core: '#ffffff' });
  txt(c, '倍率球出現率大增 · 倍率會一路累積到 FEVER 結束 · 自動轉動', W / 2, 715, { size: 28, color: '#ffffff', weight: 900, stroke: '#3a0a00', sw: 6 });
  button('fev', 0, 0, W, H, '', { invisible: true, fn: () => { if (m.t > .6) closeModal(); } });
}
// --- 轉盤 ---
function drawWheel(c, m) {
  const t = G.time, cx = W / 2, cy = 540, Rr = 330, seg = TAU / 12;
  dim(c, .75);
  godRays(c, cx, cy, t, ['#ff4ad8', '#ffcf3a', '#3ad8ff'], 18, 1200, .1);
  goldText(c, '首領轉盤', cx, 90, 64, { glow: '#ff4ad8' });
  c.save(); c.globalCompositeOperation = 'lighter'; glow(c, cx, cy, Rr * 1.5, '#ff4ad8', .35); c.restore();
  c.save(); c.translate(cx, cy); c.rotate(m.ang);
  WHEEL.forEach((s, i) => {
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, Rr, i * seg, (i + 1) * seg); c.closePath();
    const g = c.createRadialGradient(0, 0, 30, 0, 0, Rr); g.addColorStop(0, mixHex(s.col, '#ffffff', .35)); g.addColorStop(1, s.k === 'jackpot' ? '#ff3aa8' : mixHex(s.col, '#000000', .25));
    c.fillStyle = s.k === 'jackpot' ? (c.createConicGradient ? (() => { const cg = c.createConicGradient(t * 3, 0, 0); for (let k = 0; k <= 6; k++) cg.addColorStop(k / 6, rainbow(k * 60)); return cg; })() : '#ff3aa8') : g;
    c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.stroke();
    c.save(); c.rotate((i + .5) * seg); c.translate(Rr * .6, 0);
    txt(c, s.t, 0, 0, { size: s.k === 'jackpot' ? 30 : 26, weight: 900, color: s.k === 'jackpot' ? '#ffffff' : '#1a0a20', stroke: s.k === 'jackpot' ? '#6a006a' : 'rgba(255,255,255,.6)', sw: 4 });
    c.restore();
  });
  c.restore();
  c.beginPath(); c.arc(cx, cy, Rr + 14, 0, TAU); c.lineWidth = 26; c.strokeStyle = '#c8901a'; c.stroke();
  c.beginPath(); c.arc(cx, cy, Rr + 14, 0, TAU); c.lineWidth = 3; c.strokeStyle = '#fff2a0'; c.stroke();
  for (let i = 0; i < 24; i++) {
    const a = i * TAU / 24, on = (i + Math.floor(t * (m.spinning ? 16 : 4))) % 2 === 0;
    const bx = cx + Math.cos(a) * (Rr + 14), by = cy + Math.sin(a) * (Rr + 14);
    c.beginPath(); c.arc(bx, by, 6, 0, TAU); c.fillStyle = on ? '#fffbe0' : '#6a4a10'; c.fill();
    if (on) { c.globalCompositeOperation = 'lighter'; glow(c, bx, by, 18, '#ffe080', .9); c.globalCompositeOperation = 'source-over'; }
  }
  c.beginPath(); c.arc(cx, cy, 52, 0, TAU); const hg = c.createRadialGradient(cx - 14, cy - 14, 4, cx, cy, 52); hg.addColorStop(0, '#fff6c0'); hg.addColorStop(1, '#c8801a'); c.fillStyle = hg; c.fill(); c.lineWidth = 4; c.strokeStyle = '#6a3a00'; c.stroke();
  txt(c, '命運', cx, cy, { size: 26, weight: 900, color: '#6a2a00' });
  c.save(); c.translate(cx, cy - Rr - 30); poly(c, [[-26, -20], [26, -20], [0, 34]]); c.fillStyle = '#ff2a3a'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#fff'; c.stroke(); c.restore();
  if (!m.spinning && !m.done) button('wspin', cx - 160, 950, 320, 80, '轉動！', { style: 'gold', size: 36, fn: () => spinWheel(m) });
  if (m.done && m.res) {
    const s = WHEEL[m.res];
    txt(c, `獲得：${s.t}${m.mult > 1 ? ' ×2' : ''}`, cx, 925, { size: 40, weight: 900, color: '#ffe080', stroke: '#2a0a0a', sw: 6 });
    if (m.again) button('wagain', cx - 160, 970, 320, 76, '再轉一次！', { style: 'red', size: 32, fn: () => { m.done = false; m.again = false; spinWheel(m); } });
    else button('wok', cx - 160, 970, 320, 76, '收下', { style: 'green', size: 32, fn: closeModal });
  }
}
function spinWheel(m) {
  const idx = WHEEL.indexOf(wpick(WHEEL, s => s.w * (s.k === 'jackpot' ? 1 + getLuck() / 60 : 1)));
  const seg = TAU / 12, jit = rand(-.35, .35) * seg;
  const desired = -Math.PI / 2 - (idx + .5) * seg + jit;
  const base = m.ang;
  let delta = ((desired - base) % TAU + TAU) % TAU;
  m.from = base; m.to = base + TAU * 6 + delta; m.t = 0; m.T = 4.6; m.spinning = true; m.res = idx; m.done = false;
  AU.play('spin');
}
function wheelReward(m) {
  const s = WHEEL[m.res], k = m.mult, U = unitGold();
  AU.play('win');
  burst(fxU, W / 2, 540, 60, { col: [s.col, '#ffffff', '#ffcf3a'], smax: 600, lmax: 1.1 });
  switch (s.k) {
    case 'gold': { const g = U * s.v * k; R.gold += g; coinShower(W / 2, 700, 40, { force: true }); floatText(fxU, W / 2, 820, '+' + fmtComma(g) + ' 金', '#ffcf3a', 50, { life: 2 }); AU.play('coin'); break; }
    case 'item': for (let i = 0; i < k; i++) addItem(rollItem(R.wave / 15 + s.v)); break;
    case 'buff': giveBuff(.6); break;
    case 'gems': R.gems += s.v * k; AU.play('gem'); break;
    case 'relic': R.modals.unshift({ type: 'chest', boost: k - 1 }); break;
    case 'again': m.again = true; break;
    case 'luck': R.luck += s.v * k; break;
    case 'sp': giveSpecial(1); break;
    case 'jackpot': { const g = U * 100 * k; R.gold += g; addItem(rollItem(2)); giveSpecial(1.5); R.stats.jackpots++; R.modals.unshift({ type: 'celebrate', level: 4, gold: g, combo: false, t: 0 }); break; }
  }
}
// --- 寶箱（命運之牌） ---
function setupChest(m) {
  const set = new Set(); m.cards = [];
  for (let i = 0; i < 3; i++) { const r = randomRelic(m.boost || 0, false, set); if (!r) break; set.add(r.id); m.cards.push(r); }
  m.picked = -1; m.flip = [0, 0, 0]; m.pt = 0;
  if (!m.cards.length) { const g = unitGold() * 20; R.gold += g; R.gems += 5; toast(`遺物已全部收集！改為獲得 ${g} 金與 5 寶石`, '#ffcf3a'); m.empty = true; }
}
function drawChest(c, m) {
  if (m.empty) { closeModal(); return; }
  const t = G.time, NC = m.cards.length; dim(c, .78);
  godRays(c, W / 2, 520, t, ['#c868ff', '#ffcf3a'], 14, 1200, .08);
  goldText(c, m.title || '命運寶箱', W / 2, 110, 72, { glow: '#c868ff' });
  txt(c, m.picked < 0 ? '選擇一張命運之牌 —— 看看你的運氣！' : '其他牌原本是……', W / 2, 185, { size: 28, color: '#f0e0ff', weight: 700 });
  if (m.picked >= 0) {
    m.pt += G.dt;
    m.flip[m.picked] = Math.min(1, m.flip[m.picked] + G.dt * 3);
    if (m.pt > .9) for (let i = 0; i < m.cards.length; i++) if (i !== m.picked) m.flip[i] = Math.min(1, m.flip[i] + G.dt * 3);
  }
  for (let i = 0; i < NC; i++) {
    const cw = 300, ch = 420, x = W / 2 + (i - (NC - 1) / 2) * 380 - cw / 2, y = 250;
    const hov = m.picked < 0 && hit(x, y, cw, ch);
    const f = m.flip[i], sx = Math.abs(Math.cos(f * Math.PI)), faceUp = f > .5;
    const lift = hov ? -16 : 0;
    c.save(); c.translate(x + cw / 2, y + ch / 2 + lift + Math.sin(t * 2 + i) * 5); c.scale(Math.max(.02, sx), 1);
    if (m.picked >= 0 && i !== m.picked && faceUp) c.globalAlpha = .55;
    if (!faceUp) {
      if (hov) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 280, '#c868ff', .5); c.restore(); }
      rr(c, -cw / 2, -ch / 2, cw, ch, 20);
      const g = c.createLinearGradient(0, -ch / 2, 0, ch / 2); g.addColorStop(0, '#5a1a8a'); g.addColorStop(1, '#1a0634'); c.fillStyle = g; c.fill();
      c.lineWidth = 5; c.strokeStyle = '#ffcf3a'; c.stroke();
      rr(c, -cw / 2 + 16, -ch / 2 + 16, cw - 32, ch - 32, 14); c.lineWidth = 2; c.strokeStyle = 'rgba(255,220,140,.5)'; c.stroke();
      c.save(); c.rotate(t * .5); star5(c, 0, 0, 90, 40, 8, 0); c.fillStyle = 'rgba(255,207,58,.15)'; c.fill(); c.restore();
      c.drawImage(getSym('chest'), -80, -110, 160, 160);
      goldText(c, '?', 0, 110, 90);
    } else {
      const rel = m.cards[i], col = RAR_COL[rel.r];
      c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 0, 0, 260 + rel.r * 40, col, .5 + (i === m.picked ? .3 : 0)); c.restore();
      rr(c, -cw / 2, -ch / 2, cw, ch, 20);
      const g = c.createLinearGradient(0, -ch / 2, 0, ch / 2); g.addColorStop(0, mixHex(col, '#1a0a30', .55)); g.addColorStop(1, '#0e061c'); c.fillStyle = g; c.fill();
      c.lineWidth = 6; c.strokeStyle = col; c.stroke();
      drawRelic(c, rel, 0, -70, 140);
      txt(c, RAR_NAME[rel.r], 0, -180, { size: 22, color: col, weight: 900 });
      txt(c, rel.n, 0, 40, { size: 34, color: '#ffffff', weight: 900, stroke: 'rgba(0,0,0,.6)', sw: 5 });
      c.font = font(20, 600); wrapLines(c, rel.d, cw - 50).forEach((l, k) => txt(c, l, 0, 90 + k * 28, { size: 20, color: '#ece0ff', weight: 600 }));
      if (i === m.picked) txt(c, '✔ 你的選擇', 0, ch / 2 - 30, { size: 22, color: '#7affb0', weight: 900 });
    }
    c.restore();
    if (m.picked < 0) UI.nh.push({ id: 'card' + i, x, y, w: cw, h: ch, fn: () => pickChest(m, i) });
  }
  if (m.picked >= 0 && m.pt > 1.3) {
    button('take', W / 2 - 340, 920, 320, 80, '收下遺物', { style: 'green', size: 32, fn: () => { addRelic(m.cards[m.picked].id); AU.play('gem'); closeModal(); } });
    button('reroll', W / 2 + 20, 920, 320, 80, `💎 5 重新洗牌`, { style: R.gems >= 5 ? 'purple' : 'dark', size: 28, disabled: R.gems < 5, fn: () => { R.gems -= 5; setupChest(m); AU.play('flip'); }, tip: '放棄這次的結果，用 5 顆寶石重新抽三張牌' });
  }
}
function pickChest(m, i) {
  m.picked = i; m.pt = 0; AU.play('flip');
  const rel = m.cards[i];
  setTimeout(() => {
    AU.play('reveal', rel.r);
    const px = W / 2 + (i - (m.cards.length - 1) / 2) * 380;
    if (rel.r >= 2) { fireworks(px, 400, 1.2); flash(.4, RAR_COL[rel.r]); }
    burst(fxU, px, 460, 40 + rel.r * 30, { col: [RAR_COL[rel.r], '#ffffff'], smax: 500, lmax: 1 });
  }, 260);
}
// --- 說明 / 賠率 / 暫停 / 結束 ---
function drawHelpBox(c, onClose) {
  dim(c, .8);
  panel(c, 260, 70, 1400, 940, { r: 24, border: '#ffcf3a', lw: 3 });
  goldText(c, '遊戲說明', W / 2, 140, 60);
  const L = [
    ['🔁 遊戲流程', '每一波之間：🎰 賭場贏錢、道具和限定塔 → 🏪 商店買塔、升星 → ⚔ 戰場把塔拖到地圖上布陣 → 開始戰鬥！上方分頁可以隨時切換（快捷鍵 Q / W / E）。'],
    ['🎰 幸運賭場', '三大區、七種遊戲：命運拉霸（拉霸機／SLOT 目押）、小瑪莉、幸運輪盤、骰寶大小、翻倍挑戰、彈珠台、刮刮樂。押注越高，贏的金幣越多、道具品質越好，還能自動連玩。每個遊戲都寫出中獎機率，開獎完全照機率表。'],
    ['🏪 商店與強化', '商店只賣 ★1 塔（元素塔＋職業塔）。兩座相同、同星級的塔可以在強化工坊升星，數值會大幅提升，還會解鎖新技能；不同元素可以融合成雙元素塔。'],
    ['👑 賭場限定塔', '招財貓、骰子砲、金蟾、拉霸塔、輪盤砲、王牌、黃金龍、幻彩稜鏡……只能靠賭博獲得！'],
    ['🎒 道具', '道具分成普通～神話六種稀有度：戰鬥卷軸、增益藥水、幸運符、升星石……打怪會掉道具袋，用滑鼠掃過就能撿。'],
    ['⭐ 星級技能', '★2 攻速提升 → ★3 連擊 → ★4 覺醒新星 → ★5 傳說 → ★6 神話天罰，外觀也會一路變華麗。'],
    ['🏆 目標', '守住 30 波即可勝利，之後還有無盡模式。每局結束獲得星星，可在天賦樹永久強化。'],
  ];
  L.forEach(([h, d], i) => {
    const y = 220 + i * 108;
    txt(c, h, 320, y, { size: 26, align: 'left', color: '#ffe080', weight: 900 });
    c.font = font(19, 500); wrapLines(c, d, 1240).forEach((l, k) => txt(c, l, 320, y + 36 + k * 26, { size: 19, align: 'left', color: '#ece4ff', weight: 500 }));
  });
  button('helpok', W / 2 - 160, 960 - 30, 320, 70, '開始冒險！', { style: 'gold', size: 30, fn: () => { AU.init(); onClose(); } });
}
function drawPaytable(c) {
  dim(c, .82);
  panel(c, 300, 50, 1320, 980, { r: 24, border: '#ffcf3a', lw: 3 });
  neonRR(c, 300, 50, 1320, 980, 24, { w: 3 });
  neonText(c, '命運轉輪 · 賠率表', W / 2, 105, 48, '#ff6aff');
  const rows = [
    [['tower'], '塔 ×3', '獲得一張隨機元素塔卡：押注 ×1 → ★1、×2 → ★2、×4 → ★3、×8 → ★4'],
    [['coin'], '金幣 ×3', '獲得 3 倍下注額的金幣（多條連線再加成）'],
    [['sword'], '寶劍 ×3', '戰鬥中施放全場元素法術（隕石、暴風雪、雷霆、毒霧、龍捲風、地震）；沒有敵人時換成金幣'],
    [['gem', 'heart'], '寶石 / 愛心 ×3', '獲得寶石 / 回復城堡生命'],
    [['wild'], 'WILD', '可替代塔、金幣、寶劍、寶石、愛心；三個 WILD = SUPER BONUS 大抽獎 8 回合！'],
    [['seven'], '幸運 7 ×3', 'BIG BONUS！地圖變成小瑪莉抽獎機，抽 5 回合，最後結算總獎金'],
    [['chest', 'wheel'], '寶箱 / 轉盤 ×3', '命運寶箱（遺物三選一）／獎勵轉盤'],
  ];
  rows.forEach(([ids, name, desc], i) => {
    const y = 190 + i * 104;
    ids.slice(0, 6).forEach((id, k) => { const sx = 360 + k * (ids.length > 2 ? 36 : 70); if (id === 'mult') drawMultOrb(c, sx + 34, y, 30, 25, G.time); else c.drawImage(getSym(id), sx, y - 34, 68, 68); });
    txt(c, name, 640, y - 16, { size: 25, align: 'left', color: '#ffe080', weight: 900 });
    c.font = font(18, 500); wrapLines(c, desc, 920).forEach((l, k) => txt(c, l, 640, y + 16 + k * 24, { size: 18, align: 'left', color: '#ece4ff', weight: 500 }));
  });
  txt(c, '5 條連線：上、中、下三橫線與兩條斜線。沒中獎時有機率觸發「幸運微調」幫你推一格！', W / 2, 920, { size: 19, color: '#a8f0ff', weight: 700 });
  button('payok', W / 2 - 120, 950, 240, 60, '了解', { style: 'gold', size: 26, fn: closeModal });
}
function drawPause(c) {
  dim(c, .75);
  panel(c, W / 2 - 300, 220, 600, 640, { r: 24, border: '#ffcf3a', lw: 3 });
  goldText(c, '暫停', W / 2, 300, 64);
  const bx = W / 2 - 220;
  button('resume', bx, 370, 440, 76, '繼續遊戲', { style: 'gold', size: 30, fn: closeModal });
  button('psfx', bx, 466, 440, 64, G.settings.sfx ? '🔊 音效：開' : '🔇 音效：關', { size: 24, fn: () => { G.settings.sfx = !G.settings.sfx; saveMeta(); } });
  button('pmus', bx, 546, 440, 64, G.settings.music ? '🎵 音樂：開' : '🎵 音樂：關', { size: 24, fn: () => { G.settings.music = !G.settings.music; saveMeta(); } });
  button('pdmg', bx, 626, 440, 64, G.settings.dmgNum ? '傷害數字：開' : '傷害數字：關', { size: 24, fn: () => { G.settings.dmgNum = !G.settings.dmgNum; saveMeta(); } });
  button('quit', bx, 730, 440, 70, '放棄並結算', { style: 'red', size: 26, fn: () => { R.modal = null; endRun(false); } });
}
function drawGameOver(c, m) {
  dim(c, Math.min(.85, m.t * 1.5));
  const s = easeOutBack(Math.min(1, m.t / .6));
  c.save(); c.translate(W / 2, 400); c.scale(s, s);
  goldText(c, '城堡淪陷', 0, 0, 140, { cols: ['#ffd0d0', '#ff4a4a', '#6a0000'], glow: '#ff2a2a' });
  c.restore();
  txt(c, `你守住了 ${R.wave - 1} 波`, W / 2, 540, { size: 36, color: '#ffffff', weight: 800 });
  if (m.t > .8) button('goend', W / 2 - 180, 640, 360, 84, '查看結算', { style: 'gold', size: 32, fn: () => { R.modal = null; endRun(false); } });
}
function drawVictory(c, m) {
  dim(c, .7);
  godRays(c, W / 2, 400, m.t, ['#ffcf3a', '#ffffff', '#7affb0'], 20, 1400, .14);
  const s = easeOutElastic(Math.min(1, m.t / 1));
  c.save(); c.translate(W / 2, 380); c.scale(s, s);
  goldText(c, '勝利！', 0, 0, 180, { glow: '#ffcf3a' }); c.restore();
  txt(c, `你守住了 ${WIN_WAVE} 波！${R.map.name} 已征服`, W / 2, 540, { size: 36, color: '#ffffff', weight: 800 });
  txt(c, '勝利獎勵：+15 ⭐（結算時乘以地圖倍率）', W / 2, 600, { size: 26, color: '#ffe080', weight: 700 });
  if (m.t > 1) {
    button('endless', W / 2 - 380, 680, 360, 84, '挑戰無盡模式', { style: 'purple', size: 30, fn: () => { R.endless = true; closeModal(); toast('無盡模式開始！敵人會越來越強', '#c868ff'); } });
    button('vend', W / 2 + 20, 680, 360, 84, '凱旋結算', { style: 'gold', size: 30, fn: () => { R.modal = null; endRun(true); } });
  }
}
