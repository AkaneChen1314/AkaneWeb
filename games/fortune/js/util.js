"use strict";
// ===== 基礎工具 =====
// 設計畫布的寬高（實際畫面會等比例縮放）與一整圈的弧度。
const W = 1920,
  H = 1080,
  TAU = Math.PI * 2;
const FONT =
  // 文字與表情符號使用的字型。
  '"Microsoft JhengHei","微軟正黑體","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';
const EMOJI_FONT =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

// 全域狀態
// 目前顯示的畫面。
const G = {
  screen: "menu",
  time: 0,
  // 滑鼠在設計畫布上的位置；px、py 是上一格的位置。
  mouse: { x: 0, y: 0, down: false, px: 0, py: 0 },
  // 畫面震動與閃光的強度。
  shake: 0,
  flash: 0,
  flashCol: "#ffffff",
  // 永久保存的資料（寶石、天賦、圖鑑、設定）。
  meta: null,
  // 右側的短訊息與畫面中央的大標題。
  toasts: [],
  banner: null,
  // 玩家設定。
  settings: { sfx: true, music: true, dmgNum: true, slotMode: "lever", bet: 1 },
  // 目前播放的背景音樂。
  musicMode: "menu",
  // 得分彈出的文字。
  pops: [],
  // 圖鑑目前的分頁與頁數。
  codexTab: 0,
  codexPage: 0,
};

// ---------- 數值與亂數 ----------

// 隨機數：rand(10) 是 0～10 之間，rand(3, 8) 是 3～8 之間。
function rand(a = 1, b) {
  return b === undefined ? Math.random() * a : a + Math.random() * (b - a);
}
// a 到 b 之間的整數（含兩端）。
function randi(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}
// 從陣列隨機挑一個。
function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
// 把數值限制在 a 到 b 之間。
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
// 線性插值：t 從 0 到 1 時，數值從 a 變成 b。
function lerp(a, b, t) {
  return a + (b - a) * t;
}
// 兩點距離的平方；只比大小時不必開根號。
function d2(ax, ay, bx, by) {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
}

// ---------- 動畫曲線 ----------

// 有一點「超過頭再彈回來」的動畫曲線（t 從 0 到 1）。
function easeOutBack(t) {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
// 先快後慢。
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
// 兩端慢、中間快。
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
// 彈簧般的晃動。
function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
}
// 依權重抽選；wf 回傳每一項的權重。
function wpick(arr, wf) {
  let s = 0;
  for (const a of arr) s += wf(a);
  let r = Math.random() * s;
  for (const a of arr) {
    r -= wf(a);
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}
// 洗牌（直接改變原本的陣列）。
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 大數字縮寫成 K、M、B 等單位。
function fmt(n) {
  n = Math.floor(n);
  if (Math.abs(n) < 10000) return "" + n;
  if (Math.abs(n) < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + "K";
  if (Math.abs(n) < 1e9) return (n / 1e6).toFixed(1) + "M";
  return (n / 1e9).toFixed(1) + "B";
}
// 數字加上千分位逗號。
function fmtComma(n) {
  return Math.floor(n).toLocaleString("en-US");
}
// 可以重現的亂數：相同的種子會得到相同的順序。
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 顏色 ----------

// 把 "#ff8800" 這種顏色碼轉成紅、綠、藍三個數字（也支援 "#f80" 這種短寫法）。
function hexRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// 十六進位顏色加上透明度。
function rgba(h, a) {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
// 兩種顏色依 t 混合。
function mixHex(a, b, t) {
  const A = hexRgb(a),
    B = hexRgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(lerp(v, B[i], t))
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
}
// HSL 轉成十六進位顏色。
function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
// 彩虹色；色相每 10 度取一階，讓光暈貼圖可以重複使用。
function rainbow(h, l = 60) {
  return hslHex(Math.round(h / 10) * 10, 100, l);
}

// ---------- 畫布工具 ----------

// 畫圓角矩形的路徑（r 是圓角半徑，不會超過寬高的一半）。
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
// 組合畫布用的字型字串，例如 "700 20px 字型名稱"。
function font(size, weight = 700) {
  return `${weight} ${size}px ${FONT}`;
}
// 畫文字；o 可以指定大小、粗細、對齊、外框與陰影。
function txt(c, s, x, y, o = {}) {
  c.font = o.font || font(o.size || 20, o.weight || 700);
  c.textAlign = o.align || "center";
  c.textBaseline = o.base || "middle";
  if (o.stroke) {
    c.lineJoin = "round";
    c.lineWidth = o.sw || 4;
    c.strokeStyle = o.stroke;
    c.strokeText(s, x, y);
  }
  c.fillStyle = o.color || "#fff";
  c.fillText(s, x, y);
}
// 依寬度自動換行，並保留原本的換行。
function wrapLines(c, text, maxW) {
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const ch of para) {
      const t = line + ch;
      if (c.measureText(t).width > maxW && line) {
        out.push(line);
        line = ch;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
const _glow = {};
// 每種顏色的光暈只畫一次，之後重複使用。
function glowSpr(col) {
  let s = _glow[col];
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 128;
  const g = s.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(col, 1));
  gr.addColorStop(0.18, rgba(col, 0.7));
  gr.addColorStop(0.45, rgba(col, 0.2));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glow[col] = s;
  return s;
}
// 畫一個柔和的光暈。
function glow(c, x, y, r, col, a = 1) {
  if (a <= 0 || r <= 0) return;
  const ga = c.globalAlpha;
  c.globalAlpha = ga * Math.min(1, a);
  c.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2);
  c.globalAlpha = ga;
}
// 震動畫面。
function shake(v) {
  G.shake = Math.max(G.shake, v);
}
// 整個畫面閃一下。
function flash(a, col = "#ffffff") {
  G.flash = Math.max(G.flash, a);
  G.flashCol = col;
}
