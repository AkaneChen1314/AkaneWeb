'use strict';
// ===== 基礎工具 =====
const W = 1920, H = 1080, TAU = Math.PI * 2;
const FONT = '"Microsoft JhengHei","微軟正黑體","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

// 全域狀態
const G = {
  screen: 'menu', time: 0, mouse: { x: 0, y: 0, down: false, px: 0, py: 0 },
  shake: 0, flash: 0, flashCol: '#ffffff', meta: null, toasts: [], banner: null,
  settings: { sfx: true, music: true, dmgNum: true, slotMode: 'lever', bet: 1 }, musicMode: 'menu', pops: [], codexTab: 0, codexPage: 0,
};

function rand(a = 1, b) { return b === undefined ? Math.random() * a : a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function d2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutElastic(t) { if (t <= 0) return 0; if (t >= 1) return 1; return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1; }
function wpick(arr, wf) { let s = 0; for (const a of arr) s += wf(a); let r = Math.random() * s; for (const a of arr) { r -= wf(a); if (r <= 0) return a; } return arr[arr.length - 1]; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fmt(n) {
  n = Math.floor(n);
  if (Math.abs(n) < 10000) return '' + n;
  if (Math.abs(n) < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + 'K';
  if (Math.abs(n) < 1e9) return (n / 1e6).toFixed(1) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}
function fmtComma(n) { return Math.floor(n).toLocaleString('en-US'); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function rainbow(h, l = 60) { return hslHex(Math.round(h / 10) * 10, 100, l); }

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function font(size, weight = 700) { return `${weight} ${size}px ${FONT}`; }
function txt(c, s, x, y, o = {}) {
  c.font = o.font || font(o.size || 20, o.weight || 700);
  c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
  if (o.stroke) { c.lineJoin = 'round'; c.lineWidth = o.sw || 4; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
  c.fillStyle = o.color || '#fff'; c.fillText(s, x, y);
}
function wrapLines(c, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      const t = line + ch;
      if (c.measureText(t).width > maxW && line) { out.push(line); line = ch; } else line = t;
    }
    out.push(line);
  }
  return out;
}
const _glow = {};
function glowSpr(col) {
  let s = _glow[col]; if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 128;
  const g = s.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(.18, rgba(col, .7)); gr.addColorStop(.45, rgba(col, .2)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _glow[col] = s; return s;
}
function glow(c, x, y, r, col, a = 1) {
  if (a <= 0 || r <= 0) return;
  const ga = c.globalAlpha; c.globalAlpha = ga * Math.min(1, a);
  c.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = ga;
}
function shake(v) { G.shake = Math.max(G.shake, v); }
function flash(a, col = '#ffffff') { G.flash = Math.max(G.flash, a); G.flashCol = col; }
