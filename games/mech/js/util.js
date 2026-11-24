"use strict";
// ============================================================
//  通用工具
// ============================================================
// 常用的圓周率常數：PI = 180 度、TAU = 360 度（弧度）
const PI = Math.PI,
  TAU = Math.PI * 2;
// clamp：把 v 限制在 a ~ b 之間
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// lerp：線性內插，t = 0 得到 a、t = 1 得到 b
const lerp = (a, b, t) => a + (b - a) * t;
// rand()：0~1 的亂數；rand(a)：0~a；rand(a, b)：a~b
const rand = (a = 1, b) =>
  b === undefined ? Math.random() * a : a + Math.random() * (b - a);
// randi：a ~ b 之間的整數亂數（含頭尾）
const randi = (a, b) => Math.floor(rand(a, b + 1));
// pick：從陣列裡隨機挑一個
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// $：用 id 取得網頁元素的簡寫
const $ = (id) => document.getElementById(id);

// 從角度 a 轉到角度 b 的最短差距（結果在 -180 ~ +180 度之間）
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
}
// 把角度 cur 朝 target 轉，每次最多轉 maxStep（用來做平滑轉向）
function turnTo(cur, target, maxStep) {
  return cur + clamp(angDiff(cur, target), -maxStep, maxStep);
}
// 平滑靠近：cur 逐漸趨近 target，k 越大越快；和每秒幾格（FPS）無關
function damp(cur, target, k, dt) {
  return lerp(cur, target, 1 - Math.exp(-k * dt));
}

// 固定種子的亂數產生器：同一個種子永遠產生同一串亂數（地圖生成用，確保每次地圖相同）
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sRGB 十六進位色 → 線性空間 THREE.Color（快取）
const _colCache = {};
// 把網頁色碼換成 Three.js 的線性顏色；算過的會記住，不重複建立。
function C(hex) {
  let c = _colCache[hex];
  if (!c) {
    c = new THREE.Color(hex).convertSRGBToLinear();
    _colCache[hex] = c;
  }
  return c;
}

// ============================================================
//  GeoBatch：把大量零件合併成單一幾何（降低 draw call）
// ============================================================
// 轉換法線用的暫存矩陣（重複使用，避免一直配置記憶體）
const _nm3 = new THREE.Matrix3();
// 幾何批次：把大量小形狀合併成一個網格，減少繪製次數。
class GeoBatch {
  // p = 頂點位置、n = 法線、u = 貼圖座標、c = 頂點顏色（全部是攤平的數字陣列）
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = [];
  }
  // 目前累積的頂點數
  get count() {
    return this.p.length / 3;
  }

  // 把一個 three.js 幾何體 geo 經過矩陣 m 變換後加進來，並塗上顏色 col
  addGeo(geo, m, col) {
    let g = geo;
    // 有索引的幾何體先展開成「每三個頂點一個三角形」，結果快取在 userData 裡
    if (geo.index)
      g = geo.userData.ni || (geo.userData.ni = geo.toNonIndexed());
    const pa = g.attributes.position.array,
      na = g.attributes.normal.array;
    const ua = g.attributes.uv ? g.attributes.uv.array : null;
    const e = m.elements;
    _nm3.getNormalMatrix(m);
    const ne = _nm3.elements;
    const cnt = pa.length / 3,
      P = this.p,
      N = this.n,
      U = this.u,
      Cc = this.c;
    // 逐一把頂點位置乘上矩陣、法線乘上法線矩陣後存起來
    for (let i = 0; i < cnt; i++) {
      const x = pa[i * 3],
        y = pa[i * 3 + 1],
        z = pa[i * 3 + 2];
      P.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
      const nx = na[i * 3],
        ny = na[i * 3 + 1],
        nz = na[i * 3 + 2];
      const ax = ne[0] * nx + ne[3] * ny + ne[6] * nz,
        ay = ne[1] * nx + ne[4] * ny + ne[7] * nz,
        az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      N.push(ax / l, ay / l, az / l);
      if (ua) U.push(ua[i * 2], ua[i * 2 + 1]);
      else U.push(0, 0);
      Cc.push(col.r, col.g, col.b);
    }
  }

  // 四邊形：p0→p1→p2→p3 逆時針；uv 為矩形 (u0,v0)-(u1,v1)
  quad(p0, p1, p2, p3, nx, ny, nz, u0, v0, u1, v1, col) {
    const P = this.p,
      N = this.n,
      U = this.u,
      Cc = this.c;
    P.push(
      p0[0],
      p0[1],
      p0[2],
      p1[0],
      p1[1],
      p1[2],
      p2[0],
      p2[1],
      p2[2],
      p0[0],
      p0[1],
      p0[2],
      p2[0],
      p2[1],
      p2[2],
      p3[0],
      p3[1],
      p3[2],
    );
    U.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    for (let i = 0; i < 6; i++) {
      N.push(nx, ny, nz);
      Cc.push(col.r, col.g, col.b);
    }
  }

  // 把累積的資料做成真正的 BufferGeometry（做完後這個批次就不能再加東西）
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(this.p), 3),
    );
    g.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(this.n), 3),
    );
    g.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(this.u), 2),
    );
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(this.c), 3),
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.p = this.n = this.u = this.c = null;
    return g;
  }
}

// 世界座標方塊（側面走外牆貼圖批次 bs、頂面走混凝土批次 bt；UV 以世界尺寸鋪貼）
function wbox(
  bs,
  bt,
  cx,
  cy,
  cz,
  sx,
  sy,
  sz,
  col,
  rot = 0,
  tile = 14,
  uoff = 0,
) {
  // hx/hy/hz：半長寬高；c、s：旋轉角的 cos / sin
  const hx = sx / 2,
    hy = sy / 2,
    hz = sz / 2,
    c = Math.cos(rot),
    s = Math.sin(rot);
  // P：把方塊自己的座標（已旋轉）換成世界座標
  const P = (lx, ly, lz) => [
    cx + lx * c + lz * s,
    cy + ly,
    cz - lx * s + lz * c,
  ];
  const v0 = (cy - hy) / tile,
    v1 = (cy + hy) / tile;
  // 四個側面（前、後、右、左）；uoff 讓每一面的貼圖起點錯開，看起來不會重複
  // 前面。
  bs.quad(
    P(-hx, -hy, hz),
    P(hx, -hy, hz),
    P(hx, hy, hz),
    P(-hx, hy, hz),
    s,
    0,
    c,
    uoff,
    v0,
    uoff + sx / tile,
    v1,
    col,
  );
  // 後面。
  bs.quad(
    P(hx, -hy, -hz),
    P(-hx, -hy, -hz),
    P(-hx, hy, -hz),
    P(hx, hy, -hz),
    -s,
    0,
    -c,
    uoff + 0.37,
    v0,
    uoff + 0.37 + sx / tile,
    v1,
    col,
  );
  // 右面。
  bs.quad(
    P(hx, -hy, hz),
    P(hx, -hy, -hz),
    P(hx, hy, -hz),
    P(hx, hy, hz),
    c,
    0,
    -s,
    uoff + 0.61,
    v0,
    uoff + 0.61 + sz / tile,
    v1,
    col,
  );
  // 左面。
  bs.quad(
    P(-hx, -hy, -hz),
    P(-hx, -hy, hz),
    P(-hx, hy, hz),
    P(-hx, hy, -hz),
    -c,
    0,
    s,
    uoff + 0.83,
    v0,
    uoff + 0.83 + sz / tile,
    v1,
    col,
  );
  // 頂面
  bt.quad(
    P(-hx, hy, hz),
    P(hx, hy, hz),
    P(hx, hy, -hz),
    P(-hx, hy, -hz),
    0,
    1,
    0,
    cx / 9,
    cz / 9,
    cx / 9 + sx / 9,
    cz / 9 + sz / 9,
    col,
  );
}
