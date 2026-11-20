'use strict';
// ===== 主程式：畫布、迴圈、輸入、存檔 =====
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let DPR = 1, SC = 1, OX = 0, OY = 0, lastT = performance.now(), lastW = 0, lastH = 0, lastD = 0;
const SAVE_KEY = 'fortune_siege_save_v1';

function defaultMeta() {
  return { stars: 0, talents: {}, best: {}, runs: 0, jackpots: 0, seenHelp: false, codex: { towers: {}, relics: {}, enemies: {} }, settings: { sfx: true, music: true, dmgNum: true, slotMode: 'lever', bet: 1 } };
}
function loadMeta() {
  let m = defaultMeta();
  try { const s = localStorage.getItem(SAVE_KEY); if (s) { const o = JSON.parse(s); m = Object.assign(m, o); m.codex = Object.assign(defaultMeta().codex, o.codex || {}); m.settings = Object.assign(defaultMeta().settings, o.settings || {}); } } catch (e) { }
  G.meta = m; G.settings = m.settings;
}
function saveMeta() { try { G.meta.settings = G.settings; localStorage.setItem(SAVE_KEY, JSON.stringify(G.meta)); } catch (e) { } }

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = innerWidth, h = innerHeight; lastW = w; lastH = h; lastD = window.devicePixelRatio || 1;
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  SC = Math.min(w / W, h / H); OX = (w - W * SC) / 2; OY = (h - H * SC) / 2;
  ctx.imageSmoothingQuality = 'high';
}
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - OX) / SC, y: (e.clientY - r.top - OY) / SC }; }

function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  G.time += dt; G.dt = dt;
  if (innerWidth !== lastW || innerHeight !== lastH || (window.devicePixelRatio || 1) !== lastD) resize();
  try {
    if (R && G.screen === 'game') { updateGame(dt); updateModals(dt); }
    G.musicMode = !R || G.screen !== 'game' ? 'menu' : R.tab === 'casino' ? (MARY.bonus && MARY.state !== 'idle' && MARY.state !== 'end' ? 'bonus' : 'casino') : R.tab === 'shop' ? 'shop' : R.phase === 'wave' ? (R.enemies.some(e => e.boss) ? 'boss' : 'wave') : 'build';
    G.shake *= Math.pow(.004, dt); if (G.shake < .3) G.shake = 0;
    G.flash = Math.max(0, G.flash - dt * 1.8);
    render(dt);
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
function render(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#05030c'; ctx.fillRect(0, 0, cv.width, cv.height);
  const sx = G.shake ? rand(-G.shake, G.shake) : 0, sy = G.shake ? rand(-G.shake, G.shake) : 0;
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * (OX + sx * SC), DPR * (OY + sy * SC));
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  UI.nh = []; UI.tip = null;
  switch (G.screen) {
    case 'menu': drawMenu(ctx, dt); break;
    case 'maps': drawMaps(ctx, dt); break;
    case 'talents': drawTalents(ctx, dt); break;
    case 'codex': drawCodex(ctx, dt); break;
    case 'result': drawResult(ctx, dt); break;
    case 'game': if (R) drawGameScreen(ctx, dt); break;
  }
  drawTooltip(ctx);
  if (G.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(G.flashCol, Math.min(.8, G.flash)); ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  UI.hits = UI.nh;
  const over = findHit(G.mouse.x, G.mouse.y);
  const grab = G.screen === 'game' && R && R.tab !== 'casino' && !activeModal() && (handIndexAt(G.mouse.x, G.mouse.y) >= 0 || (() => { const t = tileAt(G.mouse.x, G.mouse.y); return t && R.grid[t.gx + ',' + t.gy]; })());
  cv.style.cursor = G.drag && G.drag.moved ? 'grabbing' : over ? 'pointer' : grab ? 'grab' : 'default';
}

// ===== 輸入 =====
function worldDown(x, y) {
  if (R.tab === 'casino') return;
  const g = slotAt(x, y);
  if (g) {
    const cd = g.hand.find(q => q.anim >= 1);
    if (cd) { G.drag = { kind: 'card', idx: R.hand.indexOf(cd), sx: x, sy: y, moved: false }; return; }
    if (g.map.length) {
      if (R.tab === 'battle') {
        const tw = g.map[(g.map.indexOf(R.sel) + 1) % g.map.length];
        R.sel = tw; R.selCard = -1; AU.play('click');
        fxW.add({ kind: 'ring', x: tw.x, y: tw.y, r0: 10, r1: 80, size: 6, col: '#7affd8', life: .7, force: true });
      } else toast(`${towerName(g.key)} ★${g.tier} 已經放在地圖上了（到 ⚔ 戰場可以看到）；點 ⬆ 一樣可以升星`, '#c8f0ff');
    }
    return;
  }
  const tl = tileAt(x, y);
  if (tl) {
    if (R.tab !== 'battle') return;
    const tw = R.grid[tl.gx + ',' + tl.gy];
    if (tw && R.targeting === 'star') { useStarOn(tw); return; }
    if (R.selCard >= 0 && R.hand[R.selCard]) { placeSelected(tw, x, y); return; }
    if (tw) { G.drag = { kind: 'tower', tw, sx: x, sy: y, moved: false, wasSel: R.sel === tw }; R.sel = tw; R.selCard = -1; AU.play('click'); return; }
    R.sel = null; R.selCard = -1;
  }
}
cv.addEventListener('pointerdown', e => {
  AU.init();
  const p = toLogical(e); G.mouse.x = p.x; G.mouse.y = p.y;
  if (e.button === 2) { if (R && R.selCard >= 0) { R.selCard = -1; AU.play('click'); } G.drag = null; return; }
  G.mouse.down = true;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  const b = findHit(p.x, p.y);
  if (b) { UI.press = b.id; return; }
  if (G.screen === 'game' && R && !activeModal()) worldDown(p.x, p.y);
});
cv.addEventListener('pointermove', e => {
  const p = toLogical(e); G.mouse.x = p.x; G.mouse.y = p.y;
  if (G.drag && !G.drag.moved && Math.hypot(p.x - G.drag.sx, p.y - G.drag.sy) > 8) G.drag.moved = true;
});
cv.addEventListener('pointerup', e => {
  const p = toLogical(e); G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.down = false;
  if (UI.press) {
    const b = findHit(p.x, p.y), id = UI.press; UI.press = null;
    if (b && b.id === id) { if (!/^(cel|fev|card\d)$/.test(id)) AU.play('click'); b.fn(); }
    return;
  }
  const d = G.drag; G.drag = null;
  if (!d || !R || G.screen !== 'game') return;
  if (d.moved) { if (d.kind === 'card') dropCard(d.idx, p.x, p.y); else dropTower(d.tw, p.x, p.y); }
  else if (d.kind === 'card') { R.selCard = R.selCard === d.idx ? -1 : d.idx; R.sel = null; AU.play('click'); }
  else if (d.kind === 'tower' && d.wasSel) R.sel = null;
});
cv.addEventListener('pointercancel', () => { G.drag = null; UI.press = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (G.screen !== 'game' || !R) return;
  const m = activeModal();
  if (!m && R.tab === 'casino' && CZ.game === 'slot' && SL.spinning && SL.manual) {
    const k = { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2, KeyA: 0, KeyS: 1, KeyD: 2 }[e.code];
    if (k !== undefined) { e.preventDefault(); slStop(k); return; }
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (m && m.type === 'celebrate') { if (m.t < m.dur * .6) m.t = m.dur * .6; else closeModal(); }
    else if (!m && R.tab === 'casino') casinoAction();
    else if (!m && R.tab === 'battle') startWave();
    return;
  }
  if (e.code === 'Escape') { if (!m && R.selCard >= 0) { R.selCard = -1; return; } if (m && (m.type === 'pause' || m.type === 'paytable' || m.type === 'useitem')) closeModal(); else if (!m) R.modals.unshift({ type: 'pause' }); return; }
  if (m) return;
  if (e.code === 'KeyQ') switchTab('casino');
  if (e.code === 'KeyW') switchTab('shop');
  if (e.code === 'KeyE') switchTab('battle');
  if (R.tab === 'battle' && (e.key === '1' || e.key === '2' || e.key === '3')) R.speed = +e.key;
  if (R.tab === 'battle' && (e.code === 'KeyN' || e.code === 'Enter')) startWave();
});
cv.addEventListener('wheel', e => {
  if (!R || G.screen !== 'game' || R.tab !== 'shop') return;
  e.preventDefault(); R.shopScroll = Math.max(0, (R.shopScroll || 0) + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });
addEventListener('resize', resize);
addEventListener('blur', () => { if (R && G.screen === 'game' && !activeModal() && R.alive) R.modals.unshift({ type: 'pause' }); });

loadMeta(); resize();
requestAnimationFrame(frame);
