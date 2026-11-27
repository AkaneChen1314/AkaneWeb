"use strict";
// ===== 粒子特效系統 =====
class FX {
  // max 是同時存在的粒子上限。
  constructor(max) {
    this.p = [];
    this.max = max;
  }
  // 加入一個粒子；數量已滿時忽略（除非指定 force）。
  add(o) {
    if (this.p.length >= this.max && !o.force) return null;
    // 建立一個粒子：沒有指定的屬性用預設值。x、y 位置，vx、vy 速度，g 重力，
    // drag 空氣阻力，life 存活秒數，size 大小，col 顏色，a 透明度，rot 旋轉角度。
    const p = Object.assign(
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        g: 0,
        drag: 1,
        life: 1,
        t: 0,
        size: 4,
        col: "#ffffff",
        a: 1,
        rot: 0,
        vr: 0,
        add: true,
        kind: "glow",
      },
      o,
    );
    this.p.push(p);
    return p;
  }
  // 更新所有粒子：移動、重力、阻力與旋轉。
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      if (p.drag !== 1) {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  // 先畫一般粒子，再畫發光粒子。
  draw(c) {
    for (let pass = 0; pass < 2; pass++) {
      c.globalCompositeOperation = pass ? "lighter" : "source-over";
      for (const p of this.p) if (!!p.add === !!pass) drawParticle(c, p);
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
  }
  clear() {
    this.p.length = 0;
  }
}
// 依種類畫出一個粒子。
function drawParticle(c, p) {
  const k = p.t / p.life,
    a =
      p.a *
      (p.fadeIn ? Math.min(1, p.t / p.fadeIn) : 1) *
      (p.noFade ? 1 : 1 - k);
  if (a <= 0.01) return;
  switch (p.kind) {
    // 光暈。
    case "glow":
      glow(
        c,
        p.x,
        p.y,
        p.size * (p.grow ? 1 + k * p.grow : 1 - k * 0.5),
        p.col,
        a,
      );
      break;
    // 往移動方向拉長的火花。
    case "spark": {
      c.globalAlpha = a;
      c.strokeStyle = p.col;
      c.lineWidth = p.size;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      c.stroke();
      c.globalAlpha = 1;
      break;
    }
    // 實心圓點。
    case "dot":
      c.globalAlpha = a;
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU);
      c.fill();
      c.globalAlpha = 1;
      break;
    // 旋轉的金幣。
    case "coin":
      c.globalAlpha = Math.min(1, a * 2);
      drawCoin(c, p.x, p.y, p.size, p.rot);
      c.globalAlpha = 1;
      break;
    // 彩紙。
    case "confetti": {
      c.save();
      c.globalAlpha = Math.min(1, a * 2);
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(1, Math.cos(p.rot * 2.3));
      c.fillStyle = p.col;
      c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      c.restore();
      break;
    }
    // 文字；pop 會先放大再縮回。
    case "text": {
      const s = p.pop
        ? k < 0.15
          ? lerp(0.4, 1.25, k / 0.15)
          : k < 0.25
            ? lerp(1.25, 1, (k - 0.15) / 0.1)
            : 1
        : 1;
      c.save();
      c.globalAlpha = Math.min(1, a * 1.8);
      c.translate(p.x, p.y);
      c.scale(s, s);
      txt(c, p.text, 0, 0, {
        size: p.size,
        color: p.col,
        stroke: p.stroke || "rgba(0,0,0,.85)",
        sw: p.sw || Math.max(3, p.size / 6),
        weight: 900,
      });
      c.restore();
      break;
    }
    // 向外擴散的圓環。
    case "ring": {
      const r = lerp(p.r0 || 0, p.r1 || 60, easeOutCubic(k));
      c.globalAlpha = a;
      c.strokeStyle = p.col;
      c.lineWidth = Math.max(0.5, p.size * (1 - k));
      c.beginPath();
      if (p.flat) c.ellipse(p.x, p.y, r, r * 0.45, 0, 0, TAU);
      else c.arc(p.x, p.y, r, 0, TAU);
      c.stroke();
      c.globalAlpha = 1;
      break;
    }
    // 星星。
    case "star": {
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      const s = p.size * (p.twinkle ? 0.6 + 0.4 * Math.sin(p.t * 20) : 1);
      c.fillStyle = p.col;
      star5(c, 0, 0, s, s * 0.22, 4, 0);
      c.fill();
      c.restore();
      break;
    }
    // 閃電。
    case "bolt": {
      c.globalAlpha = a;
      c.strokeStyle = p.col;
      c.lineJoin = "round";
      c.lineCap = "round";
      for (const [w, col] of [
        [p.size * 3, p.col],
        [p.size, "#ffffff"],
      ]) {
        c.lineWidth = w;
        c.strokeStyle = col;
        c.beginPath();
        p.pts.forEach((q, i) =>
          i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]),
        );
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
    // 光線。
    case "line": {
      c.globalAlpha = a;
      c.lineCap = "round";
      c.lineWidth = p.size * (1 - k * 0.6) * 2.4;
      c.strokeStyle = p.col;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x2, p.y2);
      c.stroke();
      c.lineWidth = p.size * (1 - k * 0.6) * 0.8;
      c.strokeStyle = "#ffffff";
      c.stroke();
      c.globalAlpha = 1;
      break;
    }
    // 碎片。
    case "shard": {
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.col;
      c.beginPath();
      c.moveTo(0, -p.size);
      c.lineTo(p.size * 0.6, p.size * 0.5);
      c.lineTo(-p.size * 0.6, p.size * 0.5);
      c.closePath();
      c.fill();
      c.restore();
      break;
    }
    // 光柱。
    case "pillar": {
      const hh = p.h * Math.min(1, k * 4 + 0.2),
        ww = p.size * (1 - k * 0.6);
      const g = c.createLinearGradient(0, p.y, 0, p.y - hh);
      g.addColorStop(0, rgba(p.col, a));
      g.addColorStop(0.6, rgba(p.col, a * 0.5));
      g.addColorStop(1, rgba(p.col, 0));
      c.fillStyle = g;
      c.fillRect(p.x - ww, p.y - hh, ww * 2, hh);
      c.fillStyle = `rgba(255,255,255,${a * 0.7})`;
      c.fillRect(p.x - ww * 0.25, p.y - hh, ww * 0.5, hh);
      glow(c, p.x, p.y, ww * 4, p.col, a);
      break;
    }
    // 圖片。
    case "img": {
      const s = p.size * (p.grow ? 1 + k * p.grow : 1);
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.drawImage(p.img, -s / 2, -s / 2, s, s);
      c.restore();
      break;
    }
  }
}

// ---------- 兩組粒子：地圖與介面各一組 ----------

const fxW = new FX(2600); // 戰場
const fxU = new FX(2200); // 介面 / 慶祝

// 往四周噴出一群粒子。
function burst(fx, x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a =
      o.ang !== undefined
        ? o.ang + (Math.random() - 0.5) * (o.spread || 1)
        : Math.random() * TAU;
    const sp = rand(o.smin || 40, o.smax || 220);
    fx.add({
      kind: o.kind || "spark",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp + (o.vy || 0),
      g: o.g || 0,
      drag: o.drag || 0.92,
      life: rand(o.lmin || 0.3, o.lmax || 0.7),
      size: rand(o.szmin || 1.5, o.szmax || 3.5),
      col: Array.isArray(o.col) ? pick(o.col) : o.col || "#fff",
      add: o.add !== false,
      rot: rand(TAU),
      vr: rand(-10, 10),
      force: o.force,
    });
  }
}
// 往上飄的文字。
function floatText(fx, x, y, text, col = "#fff", size = 22, o = {}) {
  return fx.add(
    Object.assign(
      {
        kind: "text",
        x,
        y,
        vy: -60,
        drag: 0.94,
        life: 1.1,
        text,
        col,
        size,
        add: false,
        pop: true,
      },
      o,
    ),
  );
}
// 產生閃電的折線；jit 是抖動幅度。
function boltPts(x1, y1, x2, y2, jit = 14) {
  const pts = [[x1, y1]],
    n = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 18));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([
      lerp(x1, x2, t) + rand(-jit, jit),
      lerp(y1, y2, t) + rand(-jit, jit),
    ]);
  }
  pts.push([x2, y2]);
  return pts;
}
// 煙火；big 是大小倍率。
function fireworks(x, y, big = 1) {
  // 煙火的顏色從這幾種裡隨機挑。
  const col = pick([
    "#ff3a5a",
    "#ffcf3a",
    "#3ad8ff",
    "#7cff3a",
    "#ff4ad8",
    "#ffffff",
    "#c868ff",
  ]);
  const n = Math.floor(46 * big);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU,
      sp = rand(180, 360) * big;
    fxU.add({
      kind: "spark",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: 160,
      drag: 0.95,
      life: rand(0.9, 1.4),
      size: 3,
      col,
      force: true,
    });
  }
  fxU.add({ kind: "glow", x, y, size: 120 * big, col, life: 0.5, force: true });
  fxU.add({
    kind: "ring",
    x,
    y,
    r0: 10,
    r1: 160 * big,
    size: 6,
    col: "#ffffff",
    life: 0.5,
    force: true,
  });
}
// 金幣噴泉。
function coinShower(x, y, n, o = {}) {
  for (let i = 0; i < n; i++) {
    fxU.add({
      kind: "coin",
      x: x + rand(-(o.w || 20), o.w || 20),
      y,
      vx: rand(-(o.sx || 260), o.sx || 260),
      vy: rand(-(o.vy1 || 900), -(o.vy0 || 500)),
      g: 1300,
      drag: 0.995,
      life: rand(1.6, 2.6),
      size: rand(10, 18),
      rot: rand(TAU),
      vr: rand(-14, 14),
      add: false,
      force: o.force,
    });
  }
}
