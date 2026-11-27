"use strict";
// ============================================================
//  程序化建模（核心工具 + 武器 + 五種玩家機體）
//  每個可動關節是一個 Group，零件合併成單一 Mesh 以維持效能
// ============================================================
// MAT = 共用材質；GEO = 共用的基本形狀（方塊、球、二十面體、十二面體）
const MAT = {},
  GEO = {};
// 三種常用的金屬色：鋼灰、槍鐵色、近黑色
const STEEL = 0x8a9097,
  GUNMETAL = 0x2c3036,
  BLACK = 0x0b0c0f;

// 建立共用的形狀與材質（啟動時呼叫一次）
//   MAT.body = 機體裝甲（金屬感強、會反光）　MAT.prop = 地圖道具（比較粗糙）
//   MAT.glow = 發光零件（不受光照影響，亮度 2.6 倍，會觸發光暈）
//   MAT.veil = 半透明的光膜（光翼、護盾）
function initMaterials() {
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.sph = new THREE.SphereGeometry(1, 16, 12);
  GEO.ico = new THREE.IcosahedronGeometry(1, 0);
  GEO.dod = new THREE.DodecahedronGeometry(1, 0);
  MAT.body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: TEX.metal,
    metalness: 0.62,
    roughness: 0.42,
    envMapIntensity: 1.0,
  });
  MAT.prop = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: TEX.metal,
    metalness: 0.3,
    roughness: 0.82,
    envMapIntensity: 0.45,
  });
  MAT.glow = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
  MAT.glow.color.setScalar(2.6);
  MAT.veil = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

// ---------- 幾何快取 ----------
// 同樣尺寸的形狀只建立一次，之後直接重複使用
const _bevCache = {},
  _trapCache = {},
  _cylCache = {},
  _polyCache = {},
  _torCache = {};
// 把一個 2D 輪廓 sh 沿 Z 方向擠出成厚度 d 的立體，並讓它前後置中。b = 邊緣倒角的大小
function extrudeCentered(sh, d, b) {
  const g =
    b > 0
      ? new THREE.ExtrudeGeometry(sh, {
          depth: d - 2 * b,
          bevelEnabled: true,
          bevelThickness: b,
          bevelSize: b,
          bevelSegments: 1,
          steps: 1,
        })
      : new THREE.ExtrudeGeometry(sh, {
          depth: d,
          bevelEnabled: false,
          steps: 1,
        });
  g.translate(0, 0, -(b > 0 ? d - 2 * b : d) / 2);
  return g;
}
// 有倒角（邊緣削掉一點）的方塊：寬 w、高 h、深 d、倒角 b。比純方塊看起來更像機械零件
function bevelBoxGeo(w, h, d, b) {
  b = Math.min(b, w * 0.45, h * 0.45, d * 0.45);
  const key =
    w.toFixed(3) + "_" + h.toFixed(3) + "_" + d.toFixed(3) + "_" + b.toFixed(3);
  if (_bevCache[key]) return _bevCache[key];
  const x = w / 2 - b,
    y = h / 2 - b,
    sh = new THREE.Shape();
  sh.moveTo(-x, -y);
  sh.lineTo(x, -y);
  sh.lineTo(x, y);
  sh.lineTo(-x, y);
  sh.closePath();
  return (_bevCache[key] = extrudeCentered(sh, d, b));
}
// 梯形板：底寬 wb、頂寬 wt、高 h、厚 d（做胸甲、護板這類上下不等寬的零件）
function trapGeo(wb, wt, h, d) {
  const key =
    wb.toFixed(3) +
    "_" +
    wt.toFixed(3) +
    "_" +
    h.toFixed(3) +
    "_" +
    d.toFixed(3);
  if (_trapCache[key]) return _trapCache[key];
  const b = Math.min(0.07, d * 0.3, h * 0.3, Math.min(wb, wt) * 0.3),
    sh = new THREE.Shape();
  sh.moveTo(-wb / 2 + b, -h / 2 + b);
  sh.lineTo(wb / 2 - b, -h / 2 + b);
  sh.lineTo(wt / 2 - b, h / 2 - b);
  sh.lineTo(-wt / 2 + b, h / 2 - b);
  sh.closePath();
  return (_trapCache[key] = extrudeCentered(sh, d, b));
}
// 圓柱 / 圓錐台：頂半徑 rt、底半徑 rb、seg = 圓周分成幾段（只記錄比例，實際大小靠縮放）
function cylGeo(rt, rb, seg) {
  const rm = Math.max(rt, rb),
    a = +(rt / rm).toFixed(2),
    b = +(rb / rm).toFixed(2),
    key = a + "_" + b + "_" + seg;
  return (
    _cylCache[key] ||
    (_cylCache[key] = new THREE.CylinderGeometry(a, b, 1, seg))
  );
}
// 任意多邊形板（在 XY 平面，沿 Z 擠出並置中）
function polyGeo(pts, d) {
  const key =
    pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(";") +
    "|" +
    d.toFixed(2);
  if (_polyCache[key]) return _polyCache[key];
  const sh = new THREE.Shape();
  pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
  sh.closePath();
  return (_polyCache[key] = extrudeCentered(sh, d, d >= 0.3 ? 0.05 : 0));
}
// 圓環（甜甜圈形）：R = 環的半徑、r = 管子的粗細
function torGeo(R, r) {
  const key = (r / R).toFixed(3);
  return (
    _torCache[key] ||
    (_torCache[key] = new THREE.TorusGeometry(1, r / R, 8, 32))
  );
}
// mir：左右鏡射一個輪廓（sd = 1 不變、sd = -1 翻到另一邊），讓左右兩側的零件對稱
const mir = (pts, sd) => (sd > 0 ? pts : pts.map((p) => [-p[0], p[1]]));

// ---------- Seg：一個剛體節段的零件收集器 ----------
// 計算用的暫存物件（重複使用）
const _m4 = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v1 = new THREE.Vector3(),
  _v2 = new THREE.Vector3();
// 用法：const s = new Seg(); s.box(...); s.cyl(...); ...; s.into(某個關節);
// 每個零件的參數大多是：尺寸、顏色、位置 x y z、旋轉 rx ry rz
// 名稱開頭 g 的（gbox、gcyl…）是發光零件；開頭 v 的（vsph、vpoly）是半透明光膜
class Seg {
  // b = 一般零件、g = 發光零件、t = 半透明零件；base = 目前的基準座標
  constructor() {
    this.b = new GeoBatch();
    this.g = new GeoBatch();
    this.t = new GeoBatch();
    this.base = null;
  }
  // 設定子組件的基準座標（先自轉 rx/rz 再水平旋轉 ry）；用完呼叫 clearBase()
  setBase(x, y, z, ry = 0, sc = 1, rx = 0, rz = 0) {
    this.base = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
      new THREE.Vector3(sc, sc, sc),
    );
    return this;
  }
  // 取消基準座標
  clearBase() {
    this.base = null;
    return this;
  }
  // 所有零件最後都會走到這裡：算出變換矩陣（位置、旋轉、縮放），把形狀加進指定的批次
  put(
    batch,
    geo,
    col,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m4.compose(_v1.set(x, y, z), _q, _v2.set(sx, sy, sz));
    if (this.base) _m4.premultiply(this.base);
    batch.addGeo(geo, _m4, C(col));
    return this;
  }
  // 方塊
  box(w, h, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.b, GEO.box, col, x, y, z, rx, ry, rz, w, h, d);
  }
  // 倒角方塊（最常用）
  bev(w, h, d, col, x, y, z, rx, ry, rz, b = 0.12) {
    return this.put(this.b, bevelBoxGeo(w, h, d, b), col, x, y, z, rx, ry, rz);
  }
  // 梯形板
  trap(wb, wt, h, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.b, trapGeo(wb, wt, h, d), col, x, y, z, rx, ry, rz);
  }
  // 圓柱（預設直立；rx = PI/2 會變成朝前）
  cyl(rt, rb, h, col, x, y, z, rx, ry, rz, seg = 12) {
    const rm = Math.max(rt, rb);
    return this.put(
      this.b,
      cylGeo(rt, rb, seg),
      col,
      x,
      y,
      z,
      rx,
      ry,
      rz,
      rm,
      h,
      rm,
    );
  }
  // 球（sx sy sz 可以把它壓扁或拉長）
  sph(r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
    return this.put(
      this.b,
      GEO.sph,
      col,
      x,
      y,
      z,
      0,
      0,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  // 二十面體（有稜角的球）
  ico(r, col, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
    return this.put(
      this.b,
      GEO.ico,
      col,
      x,
      y,
      z,
      0,
      ry,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  // 任意多邊形板
  poly(pts, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.b, polyGeo(pts, d), col, x, y, z, rx, ry, rz);
  }
  // 圓環
  tor(R, r, col, x, y, z, rx, ry, rz) {
    return this.put(this.b, torGeo(R, r), col, x, y, z, rx, ry, rz, R, R, R);
  }
  // 以下是發光版本
  gbox(w, h, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.g, GEO.box, col, x, y, z, rx, ry, rz, w, h, d);
  }
  // 會發光的圓柱。
  gcyl(rt, rb, h, col, x, y, z, rx, ry, rz, seg = 12) {
    const rm = Math.max(rt, rb);
    return this.put(
      this.g,
      cylGeo(rt, rb, seg),
      col,
      x,
      y,
      z,
      rx,
      ry,
      rz,
      rm,
      h,
      rm,
    );
  }
  // 會發光的球。
  gsph(r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
    return this.put(
      this.g,
      GEO.sph,
      col,
      x,
      y,
      z,
      0,
      0,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  gpoly(pts, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.g, polyGeo(pts, d), col, x, y, z, rx, ry, rz);
  }
  gtor(R, r, col, x, y, z, rx, ry, rz) {
    return this.put(this.g, torGeo(R, r), col, x, y, z, rx, ry, rz, R, R, R);
  }
  // 以下是半透明版本
  vsph(r, col, x, y, z, sx = 1, sy = 1, sz = 1) {
    return this.put(
      this.t,
      GEO.sph,
      col,
      x,
      y,
      z,
      0,
      0,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  vpoly(pts, d, col, x, y, z, rx, ry, rz) {
    return this.put(this.t, polyGeo(pts, d), col, x, y, z, rx, ry, rz);
  }
  // 把收集到的零件合併成最多三個 Mesh（一般 / 發光 / 半透明），掛到 parent 底下
  into(parent, mat = MAT.body, shadow = true) {
    if (this.b.count) {
      const m = new THREE.Mesh(this.b.build(), mat);
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      parent.add(m);
    }
    if (this.g.count) parent.add(new THREE.Mesh(this.g.build(), MAT.glow));
    if (this.t.count) {
      const m = new THREE.Mesh(this.t.build(), MAT.veil);
      m.renderOrder = 4;
      parent.add(m);
    }
    return parent;
  }
}
// 建立一個「關節」（空的群組）。之後動畫就是旋轉這些關節；name 讓 instRig 可以用名字找到它
function grp(name, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// ============================================================
//  武器模型（沿 +Z 方向建構，回傳槍口位置）
// ============================================================
// 每個函式的參數：m = 武器要掛上去的關節、P = 塗裝、sd = 左手(1) 或右手(-1)
// 回傳值是槍口的位置 [x, y, z]，開火時子彈與火光會從那裡出現
const WMODEL = {
  // 突擊機砲：方形機匣 + 側面彈匣 + 帶散熱環的長槍管
  autocannon(m, P, sd) {
    const s = new Seg();
    s.bev(0.9, 1.0, 2.4, P.dark, 0, 0, 0.5, 0, 0, 0, 0.1);
    s.bev(0.5, 0.4, 1.4, P.sub, 0, 0.66, 0.4, 0, 0, 0, 0.06);
    s.box(0.1, 0.3, 0.1, P.accent, 0, 0.98, 0.9);
    s.gbox(0.18, 0.12, 0.05, P.glow, 0, 0.72, 1.12);
    s.bev(0.7, 0.95, 1.0, P.sub, -sd * 0.75, -0.15, 0.3, 0, 0, 0, 0.1);
    s.box(0.72, 0.12, 1.02, P.accent, -sd * 0.75, 0.1, 0.3);
    s.cyl(0.3, 0.3, 1.7, P.sub, 0, 0.05, 2.5, PI / 2, 0, 0, 12);
    for (let j = 0; j < 4; j++)
      s.cyl(0.36, 0.36, 0.12, P.dark, 0, 0.05, 1.9 + j * 0.4, PI / 2, 0, 0, 12);
    s.cyl(0.15, 0.15, 2.0, GUNMETAL, 0, 0.05, 4.2, PI / 2, 0, 0, 10);
    s.bev(0.5, 0.42, 0.6, P.dark, 0, 0.05, 5.1, 0, 0, 0, 0.06);
    s.box(0.62, 0.1, 0.14, BLACK, 0, 0.05, 5.1);
    s.box(0.1, 0.5, 0.14, BLACK, 0, 0.05, 5.1);
    s.cyl(0.06, 0.06, 1.6, STEEL, sd * 0.3, -0.35, 1.2, PI / 2, 0, 0, 6);
    s.into(m);
    return [0, 0.05, 5.5];
  },
  // 霰彈重砲：粗短的雙管 + 側面的紅色彈殼
  shotgun(m, P, sd) {
    const s = new Seg();
    s.bev(1.2, 1.0, 2.0, P.dark, 0, 0, 0.4, 0, 0, 0, 0.12);
    s.bev(1.0, 0.35, 1.2, P.sub, 0, 0.62, 0.4, 0, 0, 0, 0.06);
    for (const o of [-0.32, 0.32]) {
      s.cyl(0.3, 0.3, 2.4, GUNMETAL, o, 0.08, 2.5, PI / 2, 0, 0, 12);
      s.cyl(0.36, 0.36, 0.2, P.sub, o, 0.08, 3.65, PI / 2, 0, 0, 12);
      s.cyl(0.22, 0.22, 0.22, BLACK, o, 0.08, 3.68, PI / 2, 0, 0, 10);
    }
    s.bev(1.0, 0.5, 1.1, P.main, 0, -0.5, 2.0, 0, 0, 0, 0.08);
    s.box(1.3, 0.14, 0.3, P.accent, 0, 0.08, 1.5);
    s.box(1.3, 0.14, 0.3, P.accent, 0, 0.08, 3.0);
    for (let j = 0; j < 4; j++)
      s.cyl(
        0.11,
        0.11,
        0.5,
        0xb0452a,
        sd * 0.68,
        0.25 - j * 0.24,
        0.3,
        0,
        0,
        0,
        8,
      );
    s.into(m);
    return [0, 0.08, 3.9];
  },
  // 電漿步槍：槍管外面套著紫色發光的線圈
  plasma(m, P, sd) {
    const s = new Seg();
    s.bev(1.0, 1.1, 2.0, P.dark, 0, 0, 0.4, 0, 0, 0, 0.14);
    s.bev(0.6, 0.5, 1.2, P.main, 0, 0.7, 0.2, 0, 0, 0, 0.08);
    s.cyl(0.2, 0.2, 2.6, GUNMETAL, 0, 0.05, 2.6, PI / 2, 0, 0, 10);
    s.gcyl(0.13, 0.13, 2.7, 0xb070ff, 0, 0.05, 2.6, PI / 2, 0, 0, 8);
    for (let j = 0; j < 4; j++) {
      s.tor(0.44, 0.09, P.sub, 0, 0.05, 1.7 + j * 0.55);
      s.gtor(0.44, 0.03, 0xb070ff, 0, 0.05, 1.78 + j * 0.55);
    }
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * TAU + PI / 2;
      s.box(
        0.12,
        0.12,
        0.9,
        P.sub,
        Math.cos(a) * 0.38,
        0.05 + Math.sin(a) * 0.38,
        4.1,
      );
    }
    s.gsph(0.24, 0xd0a0ff, 0, 0.05, 4.2);
    s.cyl(0.3, 0.3, 0.9, P.accent, -sd * 0.7, -0.1, 0.3, 0, 0, 0, 10);
    s.gcyl(0.2, 0.2, 0.92, 0xb070ff, -sd * 0.7, -0.1, 0.3, 0, 0, 0, 8);
    s.into(m);
    return [0, 0.05, 4.6];
  },
  // 磁軌砲：上下兩條長軌道，中間夾著藍色光條
  railgun(m, P, sd) {
    const s = new Seg();
    s.bev(1.0, 1.2, 2.4, P.dark, 0, 0, 0.5, 0, 0, 0, 0.12);
    s.bev(0.7, 0.4, 1.6, P.main, 0, 0.78, 0.4, 0, 0, 0, 0.06);
    s.box(0.26, 0.42, 5.4, P.sub, 0, 0.5, 4.2);
    s.box(0.26, 0.42, 5.4, P.sub, 0, -0.4, 4.2);
    s.box(0.34, 0.1, 5.4, P.dark, 0, 0.74, 4.2);
    s.box(0.34, 0.1, 5.4, P.dark, 0, -0.64, 4.2);
    s.gbox(0.1, 0.34, 5.2, 0x66e0ff, 0, 0.05, 4.2);
    for (let j = 0; j < 5; j++)
      s.bev(0.5, 1.3, 0.22, P.dark, 0, 0.05, 2.0 + j * 1.05, 0, 0, 0, 0.05);
    for (const o of [-1, 1])
      for (let j = 0; j < 2; j++) {
        s.cyl(
          0.24,
          0.24,
          0.9,
          P.accent,
          o * 0.62,
          0.3 - j * 0.6,
          0.2,
          PI / 2,
          0,
          0,
          10,
        );
        s.gcyl(
          0.14,
          0.14,
          0.06,
          0x66e0ff,
          o * 0.62,
          0.3 - j * 0.6,
          0.68,
          PI / 2,
          0,
          0,
          8,
        );
      }
    s.bev(0.5, 0.5, 0.6, GUNMETAL, 0, 1.15, 0.6, 0, 0, 0, 0.06);
    s.gbox(0.3, 0.3, 0.05, 0xff4040, 0, 1.15, 0.92);
    s.into(m);
    return [0, 0.05, 7.0];
  },
  // 雷射加特林：六根槍管裝在會旋轉的 spin 關節上
  gatling(m, P, sd) {
    const s = new Seg();
    s.bev(1.1, 1.1, 1.8, P.dark, 0, 0, 0.3, 0, 0, 0, 0.14);
    s.cyl(0.6, 0.6, 1.0, P.main, 0, 0.05, 1.4, PI / 2, 0, 0, 14);
    s.bev(0.8, 1.2, 1.2, P.sub, -sd * 0.85, -0.3, 0.2, 0, 0, 0, 0.1);
    s.box(0.4, 0.14, 1.0, P.accent, -sd * 0.5, 0.35, 0.8, 0, 0, sd * 0.5);
    s.into(m);
    const spin = grp("spin", m, 0, 0.05, 0),
      r = new Seg();
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU;
      r.cyl(
        0.1,
        0.1,
        3.2,
        GUNMETAL,
        Math.cos(a) * 0.36,
        Math.sin(a) * 0.36,
        3.4,
        PI / 2,
        0,
        0,
        8,
      );
    }
    r.cyl(0.5, 0.5, 0.14, P.sub, 0, 0, 2.6, PI / 2, 0, 0, 14);
    r.cyl(0.5, 0.5, 0.14, P.sub, 0, 0, 4.0, PI / 2, 0, 0, 14);
    r.cyl(0.52, 0.52, 0.2, P.dark, 0, 0, 4.95, PI / 2, 0, 0, 14);
    r.cyl(0.14, 0.14, 3.2, P.dark, 0, 0, 3.4, PI / 2, 0, 0, 8);
    r.gcyl(0.2, 0.2, 0.05, 0xff5a5a, 0, 0, 5.07, PI / 2, 0, 0, 8);
    r.into(spin);
    return [0, 0.05, 5.3];
  },
  // 烈焰噴射器：下方兩個紅色燃料罐 + 喇叭狀噴口
  flamer(m, P, sd) {
    const s = new Seg();
    s.bev(0.9, 1.0, 2.0, P.dark, 0, 0, 0.4, 0, 0, 0, 0.12);
    for (const o of [-0.34, 0.34]) {
      s.cyl(0.36, 0.36, 2.0, 0xa23a22, o, -0.75, 0.9, PI / 2, 0, 0, 12);
      s.sph(0.36, 0xa23a22, o, -0.75, 1.9);
      s.sph(0.36, 0xa23a22, o, -0.75, -0.1);
    }
    s.box(0.9, 0.1, 0.25, P.accent, 0, -0.75, 0.5);
    s.box(0.9, 0.1, 0.25, P.accent, 0, -0.75, 1.3);
    s.cyl(0.2, 0.2, 2.2, GUNMETAL, 0, 0.1, 2.4, PI / 2, 0, 0, 10);
    s.cyl(0.38, 0.26, 0.8, P.sub, 0, 0.1, 3.7, PI / 2, 0, 0, 12);
    s.cyl(0.4, 0.4, 0.1, BLACK, 0, 0.1, 4.1, PI / 2, 0, 0, 12);
    for (let j = 0; j < 3; j++)
      s.cyl(0.3, 0.3, 0.08, P.sub, 0, 0.1, 2.0 + j * 0.4, PI / 2, 0, 0, 12);
    s.cyl(0.05, 0.05, 1.2, STEEL, 0, 0.45, 3.4, PI / 2, 0, 0, 6);
    s.gsph(0.1, 0xff8a30, 0, 0.45, 4.05);
    s.cyl(0.07, 0.07, 1.4, BLACK, sd * 0.3, -0.3, 1.6, 0.9, 0, 0, 6);
    s.into(m);
    return [0, 0.1, 4.3];
  },
  // ---- 副武器 ----
  // 追蹤飛彈：手上只有小型發射器，真正的六管飛彈莢艙掛在肩膀上（pod）
  missile(m, P, sd, shoulder, k) {
    const s = new Seg();
    s.bev(0.7, 0.7, 1.0, P.dark, 0, 0, 0.3, 0, 0, 0, 0.1);
    s.cyl(0.16, 0.16, 0.8, GUNMETAL, 0, 0, 1.0, PI / 2, 0, 0, 8);
    s.bev(0.24, 1.2, 1.8, P.main, sd * 0.56, 0.1, -0.5, 0, 0, 0, 0.08);
    s.box(0.26, 0.2, 1.82, P.accent, sd * 0.56, 0.1, -0.5);
    s.into(m);
    // 發射莢艙。
    const pod = grp("pod", shoulder, sd * 0.25, 1.75 * k, -0.1),
      p = new Seg();
    p.bev(2.0, 1.3, 2.4, P.dark, 0, 0, 0, 0, 0, 0, 0.14);
    p.bev(2.1, 0.3, 2.0, P.main, 0, 0.7, 0, 0, 0, 0, 0.08);
    p.box(2.04, 0.2, 2.42, P.accent, 0, -0.35, 0);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const px = (i - 1) * 0.6,
          py = (j - 0.5) * 0.55;
        p.cyl(0.22, 0.22, 0.1, BLACK, px, py, 1.21, PI / 2, 0, 0, 10);
        p.cyl(0.17, 0.05, 0.3, 0xc03020, px, py, 1.18, PI / 2, 0, 0, 8);
      }
    p.cyl(0.3, 0.3, 0.5, P.sub, 0, -0.85, 0, 0, 0, 0, 10);
    p.into(pod);
    grp("podMuzzle", pod, 0, 0, 1.5);
    return [0, 0, 1.5];
  },
  // 榴彈發射器：左輪式彈鼓 + 粗砲管
  grenade(m, P, sd) {
    const s = new Seg();
    s.bev(0.9, 1.0, 1.6, P.dark, 0, 0, 0.3, 0, 0, 0, 0.12);
    s.cyl(0.62, 0.62, 1.0, P.sub, 0, -0.1, 1.4, PI / 2, 0, 0, 12);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU;
      s.cyl(
        0.15,
        0.15,
        1.04,
        BLACK,
        Math.cos(a) * 0.38,
        -0.1 + Math.sin(a) * 0.38,
        1.4,
        PI / 2,
        0,
        0,
        8,
      );
    }
    s.cyl(0.34, 0.34, 1.6, GUNMETAL, 0, 0.1, 2.6, PI / 2, 0, 0, 12);
    s.cyl(0.4, 0.4, 0.25, P.accent, 0, 0.1, 3.3, PI / 2, 0, 0, 12);
    s.bev(0.4, 0.4, 1.0, P.main, 0, 0.7, 0.6, 0, 0, 0, 0.06);
    s.into(m);
    return [0, 0.1, 3.5];
  },
  // 光束軍刀：握柄 + 平常隱藏的光刃（blade，揮砍時才顯示）
  saber(m, P, sd) {
    const s = new Seg();
    s.cyl(0.26, 0.26, 1.4, P.dark, 0, 0, 0.5, PI / 2, 0, 0, 10);
    s.cyl(0.34, 0.34, 0.2, P.accent, 0, 0, 1.2, PI / 2, 0, 0, 10);
    s.cyl(0.3, 0.2, 0.3, P.sub, 0, 0, 1.4, PI / 2, 0, 0, 10);
    s.poly(
      [
        [-0.9, 0],
        [0.9, 0],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
      0.16,
      P.main,
      0,
      0,
      1.1,
      PI / 2,
      0,
      0,
    );
    s.gcyl(0.12, 0.12, 0.1, 0x6dff9a, 0, 0, 1.56, PI / 2, 0, 0, 8);
    s.into(m);
    const blade = grp("blade", m, 0, 0, 1.5),
      b = new Seg();
    b.gcyl(0.2, 0.08, 9, 0x6dff9a, 0, 0, 4.5, -PI / 2, 0, 0, 8);
    b.gcyl(0.34, 0.2, 0.6, 0xd0ffe0, 0, 0, 0.3, -PI / 2, 0, 0, 8);
    b.into(blade);
    blade.visible = false;
    return [0, 0, 2];
  },
  // 連鎖電弧砲：銅線圈 + 前端三根放電叉
  arc(m, P, sd) {
    const s = new Seg();
    s.bev(1.0, 1.0, 1.8, P.dark, 0, 0, 0.3, 0, 0, 0, 0.12);
    for (let j = 0; j < 4; j++) s.tor(0.44, 0.1, 0xb87333, 0, 0, 1.4 + j * 0.3);
    s.cyl(0.3, 0.3, 1.4, P.sub, 0, 0, 1.8, PI / 2, 0, 0, 10);
    for (const o of [-1, 1]) {
      s.box(0.14, 0.14, 1.8, P.sub, o * 0.45, 0, 3.2, 0, -o * 0.12, 0);
      s.sph(0.16, STEEL, o * 0.34, 0, 4.1);
    }
    s.box(0.14, 0.14, 1.8, P.sub, 0, 0.45, 3.2, 0.12, 0, 0);
    s.sph(0.16, STEEL, 0, 0.34, 4.1);
    s.gsph(0.22, 0x8ad8ff, 0, 0.05, 3.6);
    s.into(m);
    return [0, 0.05, 4.2];
  },
};

// ============================================================
//  共用組件
// ============================================================
// 雙足機體的骨盆
function pelvis(hips, P, g) {
  // k = 體型倍率、hw = 髖部寬度的一半、T = 腿的粗細
  const k = g.bulk,
    hw = g.hipW,
    T = g.legT,
    s = new Seg();
  s.bev(hw * 1.7, 0.95 * k, 1.5 * k, P.dark, 0, 0, 0, 0, 0, 0, 0.15);
  // 前裙甲。
  s.trap(
    hw * 1.2,
    hw * 0.7,
    1.1 * k,
    0.45 * k,
    P.main,
    0,
    -0.25 * k,
    0.8 * k,
    -0.25,
    0,
    0,
  );
  // 後裙甲。
  s.trap(
    hw * 1.0,
    hw * 0.6,
    0.9 * k,
    0.4 * k,
    P.sub,
    0,
    -0.2 * k,
    -0.8 * k,
    0.25,
    0,
    0,
  );
  s.box(
    hw * 0.35,
    0.5 * k,
    0.12 * k,
    P.accent,
    0,
    -0.1 * k,
    1.07 * k,
    -0.25,
    0,
    0,
  );
  s.cyl(0.42 * k, 0.42 * k, hw * 2.3, P.dark, 0, -0.1 * k, 0, 0, 0, PI / 2, 14);
  // 左右兩片側裙甲
  // 兩側的裙甲、螺栓與燈。
  for (const sd of [-1, 1]) {
    s.bev(
      0.28 * k,
      1.3 * k,
      1.6 * k,
      P.main,
      sd * (hw + 0.7 * T + 0.38 * k),
      -0.3 * k,
      0,
      0,
      0,
      sd * 0.18,
      0.08,
    );
    s.box(
      0.3 * k,
      0.3 * k,
      1.1 * k,
      P.accent,
      sd * (hw + 0.7 * T + 0.34 * k),
      0.12 * k,
      0,
      0,
      0,
      sd * 0.18,
    );
    s.cyl(
      0.14 * k,
      0.14 * k,
      0.36 * k,
      STEEL,
      sd * (hw + 0.7 * T + 0.3 * k),
      0.3 * k,
      0,
      0,
      0,
      PI / 2,
      8,
    );
    s.gbox(
      0.08 * k,
      0.5 * k,
      0.5 * k,
      P.glow,
      sd * (hw + 0.7 * T + 0.5 * k),
      -0.5 * k,
      0,
      0,
      0,
      sd * 0.18,
    );
  }
  s.cyl(0.75 * k, 0.95 * k, 0.5 * k, P.dark, 0, 0.6 * k, 0, 0, 0, 0, 16);
  s.cyl(0.6 * k, 0.6 * k, 0.35 * k, P.sub, 0, 0.92 * k, 0, 0, 0, 0, 16);
  s.into(hips);
}

// 雙足腿部；style：hero（英雄機）、heavy（重型）、raptor（逆關節）
function bipedLegs(hips, P, g, style) {
  // L1 = 大腿長、L2 = 小腿長、fH = 腳掌高度；rap = 逆關節、hv = 重型
  const T = g.legT,
    hw = g.hipW,
    L1 = g.thigh,
    L2 = g.shin,
    fH = g.footH,
    k = g.bulk,
    rap = style === "raptor",
    hv = style === "heavy";
  // 左右兩條腿。
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1,
      nm = i ? "R" : "L";
    // ── 大腿（關節在髖部）──
    const thigh = grp("thigh" + nm, hips, sd * hw, -0.1 * k, 0);
    let s = new Seg();
    s.cyl(T * 0.72, T * 0.72, T * 1.5, P.dark, 0, 0, 0, 0, 0, PI / 2, 14);
    s.cyl(T * 0.4, T * 0.4, T * 1.7, P.accent, 0, 0, 0, 0, 0, PI / 2, 10);
    // 大腿：外殼、側面裝甲、後面的液壓桿與關節。
    s.bev(
      T * 1.25,
      L1 * 0.8,
      T * 1.45,
      P.main,
      0,
      -L1 * 0.5,
      0,
      0,
      0,
      0,
      T * 0.17,
    );
    s.trap(
      T * 1.15,
      T * 0.75,
      L1 * 0.62,
      T * 0.38,
      P.sub,
      0,
      -L1 * 0.45,
      T * 0.78,
    );
    s.box(T * 0.55, L1 * 0.06, T * 0.45, P.dark, 0, -L1 * 0.36, T * 0.8);
    s.box(T * 0.55, L1 * 0.06, T * 0.45, P.dark, 0, -L1 * 0.46, T * 0.8);
    s.box(T * 0.55, L1 * 0.06, T * 0.45, P.dark, 0, -L1 * 0.56, T * 0.8);
    s.bev(
      T * 0.35,
      L1 * 0.7,
      T * 0.9,
      P.dark,
      sd * T * 0.72,
      -L1 * 0.5,
      0,
      0,
      0,
      0,
      T * 0.07,
    );
    s.gbox(T * 0.08, L1 * 0.3, T * 0.3, P.glow, sd * T * 0.92, -L1 * 0.5, 0);
    s.cyl(
      0.11 * k,
      0.11 * k,
      L1 * 0.85,
      STEEL,
      0,
      -L1 * 0.5,
      -T * 0.85,
      0,
      0,
      0,
      8,
    );
    s.cyl(
      0.18 * k,
      0.18 * k,
      L1 * 0.4,
      P.dark,
      0,
      -L1 * 0.3,
      -T * 0.85,
      0,
      0,
      0,
      8,
    );
    // 重裝型：多一層前裝甲。
    if (hv) {
      s.bev(
        T * 1.5,
        L1 * 0.5,
        T * 0.4,
        P.sub,
        0,
        -L1 * 0.3,
        T * 0.95,
        -0.1,
        0,
        0,
        T * 0.08,
      );
      s.box(
        T * 1.52,
        L1 * 0.08,
        T * 0.42,
        P.accent,
        0,
        -L1 * 0.48,
        T * 0.98,
        -0.1,
        0,
        0,
      );
    }
    s.into(thigh);

    // ── 小腿（關節在膝蓋）──
    const shin = grp("shin" + nm, thigh, 0, -L1, 0);
    s = new Seg();
    s.cyl(T * 0.68, T * 0.68, T * 1.55, P.dark, 0, 0, 0, 0, 0, PI / 2, 14);
    s.cyl(T * 0.3, T * 0.3, T * 1.75, STEEL, 0, 0, 0, 0, 0, PI / 2, 8);
    // 護膝：逆關節機體的膝蓋朝後，所以護膝裝在後面
    const kz = rap ? -1 : 1;
    // 膝蓋護板。
    s.trap(
      T * 1.0,
      T * 0.6,
      T * 1.3,
      T * 0.44,
      P.accent,
      0,
      T * 0.12,
      kz * T * 0.78,
      -0.15 * kz,
      0,
      0,
    );
    s.trap(T * 1.55, T * 1.05, L2 * 0.85, T * 1.4, P.main, 0, -L2 * 0.52, 0);
    s.trap(T * 0.9, T * 0.5, L2 * 0.7, T * 0.38, P.sub, 0, -L2 * 0.5, T * 0.78);
    // 小腿：外殼、推進器噴口與液壓桿。
    s.bev(
      T * 0.9,
      L2 * 0.5,
      T * 0.7,
      P.dark,
      0,
      -L2 * 0.4,
      -T * 0.85,
      0.12,
      0,
      0,
      T * 0.1,
    );
    s.cyl(
      T * 0.3,
      T * 0.4,
      T * 0.5,
      P.sub,
      0,
      -L2 * 0.7,
      -T * 0.98,
      0,
      0,
      0,
      10,
    );
    s.gcyl(
      T * 0.27,
      T * 0.27,
      T * 0.08,
      P.glow,
      0,
      -L2 * 0.7 - T * 0.25,
      -T * 0.98,
      0,
      0,
      0,
      10,
    );
    s.box(T * 1.62, T * 0.15, T * 1.46, P.accent, 0, -L2 * 0.86, 0);
    s.cyl(
      0.08 * k,
      0.08 * k,
      L2 * 0.7,
      STEEL,
      sd * T * 0.8,
      -L2 * 0.5,
      T * 0.1,
      0,
      0,
      0,
      6,
    );
    s.gbox(T * 0.3, L2 * 0.25, T * 0.06, P.glow, 0, -L2 * 0.3, T * 0.98);
    // 英雄型：膝蓋旁的尖刺。
    if (style === "hero")
      s.poly(
        mir(
          [
            [0, 0],
            [0.9, 0.3],
            [0.2, 1.6],
            [0, 1.3],
          ],
          sd,
        ).map((p) => [p[0] * T, p[1] * T]),
        T * 0.14,
        P.main,
        sd * T * 0.8,
        -L2 * 0.5,
        -T * 0.4,
        0,
        PI / 2,
        0,
      );
    // 反關節型：小腿後的刀片。
    if (rap)
      s.poly(
        [
          [0, 0],
          [T * 0.6, 0],
          [0, T * 2.6],
        ],
        T * 0.14,
        P.accent,
        0,
        -L2 * 0.2,
        -T * 0.9,
        PI,
        PI / 2,
        0,
      );
    s.into(shin);

    // ── 腳掌（關節在腳踝）──
    const foot = grp("foot" + nm, shin, 0, -L2, 0);
    s = new Seg();
    s.cyl(T * 0.55, T * 0.55, T * 1.3, P.dark, 0, 0, 0, 0, 0, PI / 2, 12);
    // 腳掌：腳底、腳尖、腳跟與兩側的腳趾。
    s.bev(
      T * 1.7,
      fH,
      T * 2.6,
      P.dark,
      0,
      -fH * 0.5,
      T * 0.35,
      0,
      0,
      0,
      fH * 0.16,
    );
    s.bev(
      T * 1.5,
      fH * 0.8,
      T * 1.3,
      P.main,
      0,
      -fH * 0.5,
      T * 1.75,
      0.18,
      0,
      0,
      fH * 0.16,
    );
    s.bev(
      T * 1.1,
      fH * 0.7,
      T * 0.9,
      P.sub,
      0,
      -fH * 0.6,
      -T * 1.05,
      -0.2,
      0,
      0,
      fH * 0.12,
    );
    s.box(T * 1.72, fH * 0.25, T * 0.5, P.accent, 0, -fH * 0.2, T * 0.9);
    // 反關節型：三根腳爪。
    if (rap)
      for (const o of [-1, 0, 1])
        s.poly(
          [
            [-T * 0.22, 0],
            [T * 0.22, 0],
            [0, T * 1.6],
          ],
          T * 0.3,
          P.sub,
          o * T * 0.55,
          -fH * 0.6,
          T * 2.3,
          PI / 2 + 0.12,
          0,
          0,
        );
    // 重裝型：加寬的腳掌。
    if (hv) {
      for (const o of [-1, 1])
        s.bev(
          T * 0.5,
          fH * 0.9,
          T * 1.6,
          P.sub,
          o * T * 1.0,
          -fH * 0.55,
          T * 0.3,
          0,
          o * 0.25,
          0,
          fH * 0.1,
        );
      s.bev(
        T * 1.3,
        fH * 1.2,
        T * 0.4,
        P.dark,
        0,
        -fH * 0.4,
        -T * 1.6,
        -0.5,
        0,
        0,
        fH * 0.1,
      );
    }
    s.into(foot);
  }
  // 回傳「站立時髖部離地面多高」，用來把整台機體放在正確的高度
  // 腿伸直後的總長度，用來決定髖部高度。
  const ext = L1 * Math.cos(g.tb) + L2 * Math.cos(g.tb + g.kb);
  // 回傳腿的總長度（用來決定腰部離地多高）。
  return ext + fH + 0.1 * k;
}

// 多足步行機的一條腿（鐵壁、蛛后共用）；回傳動畫用的資料
function multiLeg(hips, P, i, x, y, z, yaw, o) {
  // 腿根的轉盤（可以水平轉動，走路時前後擺）
  const T = o.T,
    lr = grp("leg" + i, hips, x, y, z);
  lr.rotation.y = yaw;
  let s = new Seg();
  s.cyl(T * 0.9, T * 0.9, T * 1.3, P.dark, 0, 0, 0, 0, 0, 0, 14);
  s.cyl(T, T, T * 0.3, P.accent, 0, T * 0.5, 0, 0, 0, 0, 14);
  s.sph(T * 0.7, P.sub, 0, T * 0.7, 0, 1, 0.6, 1);
  s.into(lr);
  // 上節：從身體往外上方伸出去
  const up = grp("up" + i, lr);
  up.rotation.x = -o.upAng;
  s = new Seg();
  s.bev(T * 1.3, T * 1.2, o.up, P.main, 0, 0, o.up / 2, 0, 0, 0, T * 0.15);
  s.trap(T * 1.1, T * 0.7, T * 0.4, o.up * 0.75, P.sub, 0, T * 0.75, o.up / 2);
  s.box(T * 1.34, T * 0.3, T * 0.5, P.accent, 0, 0, o.up * 0.3);
  s.cyl(
    T * 0.12,
    T * 0.12,
    o.up * 0.8,
    STEEL,
    0,
    -T * 0.7,
    o.up * 0.5,
    PI / 2,
    0,
    0,
    6,
  );
  s.cyl(
    T * 0.2,
    T * 0.2,
    o.up * 0.35,
    P.dark,
    0,
    -T * 0.7,
    o.up * 0.3,
    PI / 2,
    0,
    0,
    8,
  );
  s.cyl(T * 0.85, T * 0.85, T * 1.5, P.dark, 0, 0, o.up, 0, 0, PI / 2, 14);
  s.cyl(T * 0.4, T * 0.4, T * 1.7, P.accent, 0, 0, o.up, 0, 0, PI / 2, 8);
  s.into(up);
  // 下節：從關節往下折到地面
  const rot = PI / 2 - o.loAng + o.upAng,
    lo = grp("lo" + i, up, 0, 0, o.up);
  lo.rotation.x = rot;
  s = new Seg();
  s.bev(T, T, o.lo * 0.9, P.dark, 0, 0, o.lo * 0.48, 0, 0, 0, T * 0.12);
  s.trap(
    T * 1.5,
    T * 0.9,
    T * 0.5,
    o.lo * 0.72,
    P.main,
    0,
    T * 0.6,
    o.lo * 0.45,
  );
  s.box(T * 1.55, T * 0.14, T * 0.5, P.accent, 0, T * 0.86, o.lo * 0.25);
  s.cyl(
    T * 0.1,
    T * 0.1,
    o.lo * 0.6,
    STEEL,
    T * 0.4,
    -T * 0.5,
    o.lo * 0.45,
    PI / 2,
    0,
    0,
    6,
  );
  s.gbox(T * 0.2, T * 0.1, o.lo * 0.3, P.glow, 0, T * 0.87, o.lo * 0.6);
  if (o.blade)
    s.cyl(0.02, T * 0.6, T * 2.4, P.sub, 0, 0, o.lo + T * 0.7, PI / 2, 0, 0, 8);
  s.into(lo);
  // 腳掌（刀刃型的腿沒有腳掌，直接用尖端著地）
  // 沒有刀刃的腿：加上腳掌。
  if (!o.blade) {
    const ft = grp("ft" + i, lo, 0, 0, o.lo);
    ft.rotation.x = -(rot - o.upAng);
    s = new Seg();
    s.cyl(T * 0.6, T * 0.6, T * 1.2, P.dark, 0, T * 0.35, 0, 0, 0, PI / 2, 10);
    s.bev(T * 1.9, T * 0.6, T * 2.4, P.dark, 0, 0, T * 0.2, 0, 0, 0, T * 0.15);
    s.bev(
      T * 1.5,
      T * 0.4,
      T * 1.0,
      P.main,
      0,
      T * 0.1,
      T * 1.3,
      0.2,
      0,
      0,
      T * 0.1,
    );
    for (const c of [-1, 1])
      s.poly(
        [
          [-T * 0.25, 0],
          [T * 0.25, 0],
          [0, T * 1.2],
        ],
        T * 0.3,
        P.sub,
        c * T * 0.6,
        -T * 0.1,
        T * 1.6,
        PI / 2,
        0,
        0,
      );
    s.into(ft);
  }
  // 回傳走路動畫需要的資料：phase = 這條腿的節奏差、sweep = 前後擺動幅度、lift = 抬腳高度
  return {
    root: "leg" + i,
    up: "up" + i,
    yaw,
    upBase: -o.upAng,
    phase: o.phase,
    sweep: o.sweep || 0.3,
    lift: o.lift || 0.32,
    sign: Math.sin(yaw) > 0 ? -1 : 1,
  };
}

// 手臂（肩甲 + 上臂 + 前臂 + 武器）；style 決定肩甲造型
function buildArms(waist, P, o) {
  // k = 體型倍率、ul = 上臂長度
  const k = o.k,
    ul = o.len || 1.9;
  // 左右兩隻手臂。
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1,
      nm = i ? "R" : "L";
    // ── 肩膀（整隻手臂的根部）──
    const sh = grp("shoulder" + nm, waist, sd * o.x, o.y, o.z || 0);
    let s = new Seg();
    // 肩甲造型依機體風格而不同。
    switch (o.style) {
      // 英雄機：方形肩甲 + 向上的尖角
      case "hero":
        // 肩膀：外殼、上蓋、彩色飾條、螺栓與肩甲尖角。
        s.bev(
          1.5 * k,
          1.25 * k,
          1.9 * k,
          P.main,
          sd * 0.2,
          0.3 * k,
          0,
          0,
          0,
          -sd * 0.12,
          0.2,
        );
        s.trap(
          1.3 * k,
          0.8 * k,
          0.5 * k,
          1.6 * k,
          P.sub,
          sd * 0.2,
          1.1 * k,
          0,
          0,
          0,
          -sd * 0.12,
        );
        s.box(
          0.1,
          0.9 * k,
          1.94 * k,
          P.accent,
          sd * (0.2 + 0.52 * k),
          0.3 * k,
          0,
          0,
          0,
          -sd * 0.12,
        );
        s.gbox(0.5 * k, 0.12, 0.08, P.glow, sd * 0.2, 0.55 * k, 0.97 * k);
        s.gbox(0.5 * k, 0.12, 0.08, P.glow, sd * 0.2, 0.55 * k, -0.97 * k);
        s.cyl(
          0.14,
          0.14,
          0.2,
          STEEL,
          sd * 0.2,
          0.1 * k,
          0.97 * k,
          PI / 2,
          0,
          0,
          8,
        );
        s.poly(
          mir(
            [
              [0, 0],
              [0.7, 0.2],
              [0.1, 1.8],
              [0, 1.5],
            ],
            sd,
          ),
          0.12,
          P.accent,
          sd * 0.85 * k,
          0.9 * k,
          0,
          0,
          0,
          -sd * 0.5,
        );
        break;
      // 重型：超大的箱型肩甲
      case "heavy":
        // 重型肩甲：比較大、比較厚，前面有一排散熱片。
        s.bev(
          2.0 * k,
          1.9 * k,
          2.3 * k,
          P.main,
          sd * 0.3,
          0.35 * k,
          0,
          0,
          0,
          0,
          0.25,
        );
        s.bev(
          2.2 * k,
          0.5 * k,
          2.5 * k,
          P.sub,
          sd * 0.3,
          1.3 * k,
          0,
          0,
          0,
          0,
          0.12,
        );
        s.box(2.04 * k, 0.3 * k, 2.34 * k, P.accent, sd * 0.3, -0.2 * k, 0);
        for (const a of [-1, 1])
          for (const b of [-1, 1])
            s.cyl(
              0.12 * k,
              0.12 * k,
              0.1,
              STEEL,
              sd * 0.3 + a * 0.7 * k,
              0.35 * k + b * 0.6 * k,
              1.16 * k,
              PI / 2,
              0,
              0,
              6,
            );
        for (let j = 0; j < 4; j++)
          s.box(
            0.1,
            0.1 * k,
            1.4 * k,
            P.dark,
            sd * (0.3 + 1.02 * k),
            0.75 * k - j * 0.26 * k,
            0,
          );
        s.gbox(0.6 * k, 0.2 * k, 0.08, P.glow, sd * 0.3, 0.9 * k, 1.17 * k);
        break;
      // 輕型：圓肩 + 向後的長刃
      case "slim":
        s.sph(0.8 * k, P.main, sd * 0.1, 0.2 * k, 0, 1, 0.9, 1.25);
        s.bev(
          0.5 * k,
          0.5 * k,
          1.9 * k,
          P.sub,
          sd * 0.4 * k,
          0.5 * k,
          -0.2 * k,
          0,
          0,
          0,
          0.08,
        );
        s.poly(
          mir(
            [
              [0, 0],
              [0.6, 0],
              [0.15, 2.6],
              [0, 2.1],
            ],
            sd,
          ),
          0.1,
          P.accent,
          sd * 0.6 * k,
          0.5 * k,
          -0.6 * k,
          -1.0,
          0,
          -sd * 0.45,
        );
        s.gpoly(
          mir(
            [
              [0.3, 0.3],
              [0.45, 0.3],
              [0.15, 2.3],
              [0.1, 2.1],
            ],
            sd,
          ),
          0.14,
          P.glow,
          sd * 0.6 * k,
          0.5 * k,
          -0.6 * k,
          -1.0,
          0,
          -sd * 0.45,
        );
        break;
      // 圓球型肩甲
      case "round":
        s.sph(1.25 * k, P.main, sd * 0.25, 0.3 * k, 0, 1, 0.95, 1.05);
        // 圓形肩甲：環形外框與中間發光的核心。
        s.tor(
          1.22 * k,
          0.12 * k,
          P.accent,
          sd * 0.25,
          0.3 * k,
          0,
          0,
          PI / 2,
          0,
        );
        s.cyl(
          0.55 * k,
          0.55 * k,
          0.3,
          P.dark,
          sd * (0.25 + 1.2 * k),
          0.3 * k,
          0,
          0,
          0,
          PI / 2,
          12,
        );
        s.gcyl(
          0.3 * k,
          0.3 * k,
          0.34,
          P.glow,
          sd * (0.25 + 1.2 * k),
          0.3 * k,
          0,
          0,
          0,
          PI / 2,
          10,
        );
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * TAU;
          s.cyl(
            0.1 * k,
            0.1 * k,
            0.12,
            STEEL,
            sd * 0.25 + Math.cos(a) * 0.9 * k * 0,
            0.3 * k + Math.sin(a) * 0.85 * k,
            Math.cos(a) * 0.9 * k + 0,
            0,
            0,
            PI / 2,
            6,
          );
        }
        // 盾形肩甲：多邊形的盾牌與發光的紋路。
        s.bev(
          1.6 * k,
          0.4 * k,
          1.8 * k,
          P.sub,
          sd * 0.25,
          1.35 * k,
          0,
          0,
          0,
          0,
          0.1,
        );
        break;
      // 浮游型：肩膀外側懸浮著一片盾形裝甲
      case "float":
        s.sph(0.55 * k, P.dark, 0, 0.1 * k, 0);
        s.setBase(sd * 1.1 * k, 0.5 * k, 0, (sd * PI) / 2, 1, 0, 0);
        s.poly(
          [
            [-0.8, -1.3],
            [0.8, -1.3],
            [1.0, 0.6],
            [0, 1.9],
            [-1.0, 0.6],
          ].map((p) => [p[0] * k, p[1] * k]),
          0.36 * k,
          P.main,
        );
        s.poly(
          [
            [-0.5, -0.9],
            [0.5, -0.9],
            [0.6, 0.4],
            [0, 1.2],
            [-0.6, 0.4],
          ].map((p) => [p[0] * k, p[1] * k]),
          0.2 * k,
          P.sub,
          0,
          0,
          0.26 * k,
        );
        s.gpoly(
          [
            [-0.12, -0.6],
            [0.12, -0.6],
            [0.12, 0.6],
            [0, 0.85],
            [-0.12, 0.6],
          ].map((p) => [p[0] * k, p[1] * k]),
          0.1,
          P.glow,
          0,
          0,
          0.4 * k,
        );
        s.clearBase();
        s.gtor(0.5 * k, 0.05, P.glow, sd * 0.6 * k, 0.3 * k, 0, 0, PI / 2, 0);
        break;
    }
    // 上臂與手肘關節（所有樣式共用）
    s.bev(
      0.8 * k,
      (ul - 0.4) * k,
      0.9 * k,
      P.dark,
      0,
      -ul * 0.52 * k,
      0,
      0,
      0,
      0,
      0.1,
    );
    // 上臂與手肘。
    s.bev(
      0.94 * k,
      0.8 * k,
      1.04 * k,
      P.sub,
      0,
      -ul * 0.47 * k,
      0,
      0,
      0,
      0,
      0.08,
    );
    s.cyl(
      0.09 * k,
      0.09 * k,
      ul * 0.7 * k,
      STEEL,
      0,
      -ul * 0.5 * k,
      -0.52 * k,
      0,
      0,
      0,
      6,
    );
    s.cyl(0.5 * k, 0.5 * k, 1.0 * k, P.dark, 0, -ul * k, 0, 0, 0, PI / 2, 12);
    s.cyl(
      0.26 * k,
      0.26 * k,
      1.12 * k,
      P.accent,
      0,
      -ul * k,
      0,
      0,
      0,
      PI / 2,
      8,
    );
    s.into(sh);
    // ── 前臂 ──
    const fa = grp("forearm" + nm, sh, 0, -ul * k, 0);
    s = new Seg();
    s.bev(0.95 * k, 0.95 * k, 2.0 * k, P.main, 0, 0, 1.0 * k, 0, 0, 0, 0.12);
    s.trap(0.8 * k, 0.5 * k, 0.3 * k, 1.6 * k, P.sub, 0, 0.55 * k, 1.0 * k);
    s.box(1.0 * k, 0.3 * k, 0.3 * k, P.accent, 0, 0, 0.5 * k);
    s.box(1.0 * k, 0.1 * k, 0.1 * k, P.dark, 0, 0.3 * k, 1.6 * k);
    s.box(1.0 * k, 0.1 * k, 0.1 * k, P.dark, 0, -0.3 * k, 1.6 * k);
    s.cyl(0.4 * k, 0.4 * k, 0.3 * k, P.dark, 0, 0, 2.1 * k, PI / 2, 0, 0, 10);
    // 手臂的液壓桿。
    s.cyl(
      0.07 * k,
      0.07 * k,
      1.6 * k,
      STEEL,
      sd * 0.5 * k,
      -0.3 * k,
      1.0 * k,
      PI / 2,
      0,
      0,
      6,
    );
    s.gbox(0.08, 0.14 * k, 0.7 * k, P.glow, sd * 0.49 * k, 0.2 * k, 1.0 * k);
    s.into(fa);
    // ── 武器掛點：右手拿主武器、左手拿副武器；最後在槍口位置放一個 muzzle 關節 ──
    const mount = grp("mount" + nm, fa, 0, 0, 2.2 * k);
    const wid = i ? o.pri : o.sec;
    const mz = WMODEL[wid] ? WMODEL[wid](mount, P, sd, sh, k) : [0, 0, 1];
    grp("muzzle" + nm, mount, mz[0], mz[1], mz[2]);
  }
}

// 背部推進器（雙噴口）
function backThrusters(s, P, x, y, z, k) {
  for (const sd of [-1, 1]) {
    s.cyl(0.32 * k, 0.5 * k, 1.0 * k, P.sub, sd * x, y, z, 0.5, 0, 0, 12);
    s.cyl(
      0.52 * k,
      0.52 * k,
      0.12 * k,
      P.dark,
      sd * x,
      y - 0.4 * k,
      z - 0.22 * k,
      0.5,
      0,
      0,
      12,
    );
    s.gcyl(
      0.42 * k,
      0.42 * k,
      0.06,
      P.glow,
      sd * x,
      y - 0.46 * k,
      z - 0.25 * k,
      0.5,
      0,
      0,
      12,
    );
  }
}

// ============================================================
//  機體 1：烈風 ─ 人型英雄機 + 大型光翼
// ============================================================
function buildVanguard(P, pri, sec) {
  // 腿部比例：大腿長、小腿長、腳掌高、髖寬、腿粗、體型倍率、tb / kb = 站立時大腿與膝蓋的彎曲角度
  const g = {
    thigh: 2.2,
    shin: 2.4,
    footH: 0.6,
    hipW: 1.15,
    legT: 0.8,
    bulk: 1,
    tb: -0.22,
    kb: 0.5,
  };
  // 骨架階層：root（整台）→ inner（縮放用）→ hips（髖部）→ waist（上半身，可以獨立轉動瞄準）
  const root = new THREE.Group(),
    inner = grp("inner", root),
    hips = grp("hips", inner);
  pelvis(hips, P, g);
  const hipY = bipedLegs(hips, P, g, "hero");
  // 上半身：tw / th / td = 軀幹的寬、高、深；cy = 軀幹中心的高度
  const waist = grp("waist", hips, 0, 1.05, 0),
    tw = 3.5,
    th = 2.5,
    td = 2.1,
    cy = 0.45 + th / 2;
  let s = new Seg();
  s.cyl(0.7, 0.82, 0.5, P.dark, 0, 0.15, 0, 0, 0, 0, 16);
  for (let j = 0; j < 3; j++)
    s.cyl(
      0.82 + j * 0.08,
      0.78 + j * 0.08,
      0.17,
      j % 2 ? P.dark : P.sub,
      0,
      0.42 + j * 0.2,
      0,
      0,
      0,
      0,
      16,
    );
  s.trap(2.1, tw, th * 0.82, td, P.main, 0, cy + th * 0.1, 0); // V 字胸
  s.trap(
    1.4,
    2.5,
    th * 0.56,
    0.5,
    P.sub,
    0,
    cy + th * 0.16,
    td * 0.5 + 0.05,
    -0.12,
    0,
    0,
  );
  s.gbox(
    0.95,
    0.36,
    0.12,
    P.glow,
    0,
    cy + th * 0.27,
    td * 0.5 + 0.3,
    -0.12,
    0,
    0,
  ); // 駕駛艙
  s.box(1.1, 0.1, 0.16, P.dark, 0, cy + th * 0.36, td * 0.5 + 0.3, -0.12, 0, 0);
  s.poly(
    [
      [0, -0.5],
      [0.34, 0],
      [0, 0.42],
      [-0.34, 0],
    ],
    0.2,
    P.accent,
    0,
    cy - th * 0.08,
    td * 0.5 + 0.3,
    -0.12,
    0,
    0,
  );
  // 胸口兩側的進氣口、燈與側板。
  for (const sd of [-1, 1]) {
    s.bev(
      0.8,
      1.0,
      0.9,
      P.dark,
      sd * 1.28,
      cy + th * 0.28,
      td * 0.5 - 0.15,
      0,
      0,
      0,
      0.1,
    ); // 進氣口
    s.gbox(0.5, 0.56, 0.06, P.glow, sd * 1.28, cy + th * 0.28, td * 0.5 + 0.31);
    for (let j = 0; j < 3; j++)
      s.box(
        0.56,
        0.07,
        0.12,
        P.sub,
        sd * 1.28,
        cy + th * 0.14 + j * 0.2,
        td * 0.5 + 0.34,
      );
    s.cyl(
      0.58,
      0.58,
      0.8,
      P.dark,
      sd * (tw / 2 + 0.25),
      cy + th * 0.24,
      0,
      0,
      0,
      PI / 2,
      14,
    );
    s.bev(
      0.2,
      th * 0.5,
      td * 0.6,
      P.sub,
      sd * 1.15,
      cy - th * 0.2,
      0,
      0,
      0,
      sd * 0.3,
      0.06,
    );
    s.gbox(0.16, 0.16, 0.08, P.glow, sd * 0.6, cy - th * 0.22, td * 0.5 - 0.02);
  }
  s.bev(1.9, 0.5, 1.5, P.dark, 0, cy + th * 0.5 + 0.12, 0, 0, 0, 0, 0.1);
  s.trap(0.9, 1.6, 0.5, 0.3, P.main, 0, cy + th * 0.5 + 0.2, 0.8, -0.5, 0, 0);
  s.bev(
    2.2,
    2.0,
    1.0,
    P.dark,
    0,
    cy + th * 0.14,
    -td * 0.5 - 0.45,
    0,
    0,
    0,
    0.15,
  );
  s.bev(1.0, 1.1, 0.4, P.sub, 0, cy + th * 0.2, -td * 0.5 - 1.0, 0, 0, 0, 0.08);
  s.box(1.6, 0.1, 0.5, P.accent, 0, cy + th * 0.52, -td * 0.5 - 0.5);
  // 背包與推進器
  backThrusters(s, P, 0.62, cy - th * 0.3, -td * 0.5 - 0.6, 0.9);
  s.into(waist);

  // 光翼：左右各四片翼刃，推進時會展開
  // 背後的光翼。
  for (const sd of [-1, 1]) {
    // 背後的翅膀（左右各一）：grp 建立一個可以單獨轉動的部件。
    const wing = grp(
      sd > 0 ? "wingL" : "wingR",
      waist,
      sd * 1.0,
      cy + 0.85,
      -td * 0.5 - 0.95,
    );
    s = new Seg();
    s.bev(0.9, 1.3, 1.1, P.dark, 0, 0, 0, 0, 0, 0, 0.12);
    s.cyl(0.42, 0.42, 1.0, P.accent, 0, 0, 0, 0, 0, PI / 2, 10);
    s.gbox(0.5, 0.5, 0.08, P.glow, 0, 0, -0.57);
    // 四片翼片，由上往下越來越短。
    for (let j = 0; j < 4; j++) {
      const ang = 0.22 + j * 0.27,
        len = 6.8 - j * 1.05,
        ox = sd * (0.3 + j * 0.2),
        oy = 0.3 - j * 0.32,
        oz = -0.25 - j * 0.15;
      s.poly(
        mir(
          [
            [-0.34, 0],
            [0.34, 0],
            [0.52, len * 0.66],
            [0.05, len],
            [-0.2, len * 0.72],
          ],
          sd,
        ),
        0.14,
        j % 2 ? P.sub : P.main,
        ox,
        oy,
        oz,
        -0.28,
        0,
        -sd * ang,
      );
      s.gpoly(
        mir(
          [
            [0.2, 0.5],
            [0.34, 0.5],
            [0.48, len * 0.64],
            [0.34, len * 0.66],
          ],
          sd,
        ),
        0.2,
        P.glow,
        ox,
        oy,
        oz,
        -0.28,
        0,
        -sd * ang,
      );
      s.poly(
        mir(
          [
            [-0.3, 0.3],
            [-0.12, 0.3],
            [-0.14, len * 0.5],
            [-0.26, len * 0.5],
          ],
          sd,
        ),
        0.22,
        P.accent,
        ox,
        oy,
        oz,
        -0.28,
        0,
        -sd * ang,
      );
      s.vpoly(
        mir(
          [
            [0.34, 0.6],
            [1.5, len * 0.5],
            [0.5, len * 0.64],
          ],
          sd,
        ),
        0.02,
        P.glow,
        ox,
        oy,
        oz - 0.05,
        -0.28,
        0,
        -sd * ang,
      );
    }
    s.into(wing);
  }

  // 頭部：雙眼 + V 型天線
  const head = grp("head", waist, 0, cy + th * 0.5 + 0.3, 0.15);
  s = new Seg();
  s.cyl(0.35, 0.42, 0.3, P.dark, 0, 0, 0, 0, 0, 0, 12);
  s.bev(1.0, 0.85, 1.15, P.sub, 0, 0.52, 0, 0, 0, 0, 0.16);
  s.bev(1.12, 0.32, 1.0, P.main, 0, 0.9, -0.08, 0, 0, 0, 0.1);
  s.trap(0.5, 0.9, 0.4, 0.5, P.main, 0, 0.76, 0.42, -0.3, 0, 0);
  s.gbox(0.34, 0.13, 0.1, P.glow, -0.24, 0.56, 0.56, 0, 0, -0.2);
  s.gbox(0.34, 0.13, 0.1, P.glow, 0.24, 0.56, 0.56, 0, 0, 0.2);
  s.box(0.5, 0.3, 0.3, P.dark, 0, 0.24, 0.46);
  s.box(0.12, 0.26, 0.36, P.accent, 0, 0.24, 0.46);
  s.gbox(0.16, 0.16, 0.08, 0xff3030, 0, 0.96, 0.5);
  s.poly(
    [
      [0, 0],
      [0.9, 0],
      [0.25, 0.9],
    ],
    0.1,
    P.main,
    0,
    0.95,
    -0.2,
    0,
    PI / 2,
    0,
  );
  // 頭部兩側的裝甲。
  for (const sd of [-1, 1]) {
    s.box(0.16, 0.2, 0.3, P.dark, sd * 0.36, 0.3, 0.44);
    s.cyl(0.2, 0.2, 0.26, P.dark, sd * 0.6, 0.52, 0, 0, 0, PI / 2, 10);
    s.box(0.05, 0.9, 0.05, P.dark, sd * 0.64, 1.05, -0.3);
    s.poly(
      mir(
        [
          [0, 0],
          [0.28, 0],
          [0.08, 1.6],
          [0, 1.4],
        ],
        sd,
      ),
      0.08,
      P.accent,
      sd * 0.07,
      0.98,
      0.5,
      -0.25,
      0,
      -sd * 0.62,
    );
  }
  s.into(head);

  // 手臂與武器
  buildArms(waist, P, {
    x: tw / 2 + 0.85,
    y: cy + th * 0.24,
    k: 1,
    style: "hero",
    pri,
    sec,
  });
  // 記錄動畫需要的資料：骨架類型、腿的長度與角度、髖部高度、整台的高度
  root.userData = {
    type: "biped",
    leg: { L1: g.thigh, L2: g.shin, fH: g.footH, tb: g.tb, kb: g.kb, off: 0.1 },
    hipY,
    height: hipY + 1.05 + cy + th * 0.5 + 0.3 + 1.4,
  };
  hips.position.y = hipY;
  return root;
}

// ============================================================
//  機體 2：鐵壁 ─ 四足底盤 + 雙塔盾
// ============================================================
function buildBastion(P, pri, sec) {
  // H = 機身離地高度（四足底盤把身體撐高）
  const H = 3.5,
    root = new THREE.Group(),
    inner = grp("inner", root),
    hips = grp("hips", inner, 0, H, 0);
  let s = new Seg();
  s.bev(5.4, 1.5, 5.8, P.dark, 0, 0, 0, 0, 0, 0, 0.3);
  s.bev(4.4, 0.7, 4.8, P.main, 0, 0.95, 0, 0, 0, 0, 0.2);
  s.trap(4.6, 3.6, 1.1, 0.5, P.main, 0, -0.05, 3.0, -0.3, 0, 0);
  s.trap(4.2, 3.2, 1.0, 0.5, P.sub, 0, -0.05, -3.0, 0.3, 0, 0);
  s.box(1.6, 0.36, 0.14, P.accent, 0, 0.05, 3.3, -0.3, 0, 0);
  // 車身兩側的裙板。
  for (const sd of [-1, 1]) {
    s.bev(0.4, 1.3, 4.4, P.main, sd * 2.85, -0.2, 0, 0, 0, sd * 0.15, 0.1);
    s.box(0.44, 0.24, 4.42, P.accent, sd * 2.9, 0.2, 0, 0, 0, sd * 0.15);
    s.gbox(0.6, 0.22, 0.08, P.glow, sd * 1.6, 0.15, 3.28, -0.3, 0, 0);
    s.cyl(0.24, 0.24, 1.6, GUNMETAL, sd * 1.9, 1.0, -2.6, 0.5, 0, 0, 8);
    for (let j = 0; j < 4; j++)
      s.cyl(0.12, 0.12, 0.1, STEEL, sd * 3.08, 0.25, -1.5 + j, 0, 0, PI / 2, 6);
  }
  s.cyl(1.9, 2.1, 0.5, P.sub, 0, 1.3, 0, 0, 0, 0, 20);
  s.cyl(1.6, 1.6, 0.3, P.dark, 0, 1.6, 0, 0, 0, 0, 20);
  s.cyl(1.2, 0.8, 0.8, P.dark, 0, -1.0, 0, 0, 0, 0, 12);
  s.gcyl(0.6, 0.6, 0.06, P.glow, 0, -1.42, 0, 0, 0, 0, 12);
  s.into(hips);
  const mlegs = [];
  // 四條腿的位置。
  [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ].forEach(([sx, sz], i) => {
    // 四條腿：分別裝在底盤的四個角，朝外斜向伸出
    mlegs.push(
      multiLeg(hips, P, i, sx * 2.3, -0.1, sz * 2.4, Math.atan2(sx, sz * 0.9), {
        T: 0.95,
        up: 2.9,
        upAng: 0.5,
        lo: 4.75,
        loAng: 0.25,
        phase: i === 0 || i === 3 ? 0 : PI,
      }),
    );
  });

  // 上半身（砲塔式，可以旋轉）
  const waist = grp("waist", hips, 0, 1.75, 0),
    tw = 4.6,
    th = 3.0,
    td = 3.4,
    cy = 0.2 + th / 2;
  s = new Seg();
  s.bev(tw, th, td, P.main, 0, cy, 0, 0, 0, 0, 0.3);
  s.trap(3.4, 4.3, 1.5, 0.5, P.sub, 0, cy + 0.55, td / 2 + 0.1, -0.1, 0, 0);
  s.trap(4.3, 3.2, 1.2, 0.5, P.dark, 0, cy - 0.85, td / 2 + 0.05, 0.12, 0, 0);
  s.bev(1.5, 1.1, 0.24, P.main, 0, cy + 0.5, td / 2 + 0.4, -0.1, 0, 0, 0.06);
  // 胸甲的警示條紋。
  for (let j = -2; j <= 2; j++)
    s.box(
      0.16,
      0.9,
      0.08,
      j % 2 ? P.dark : P.accent,
      j * 0.26,
      cy + 0.5,
      td / 2 + 0.54,
      -0.1,
      0,
      0.5,
    );
  // 胸口的燈、管線與背後的煙囪。
  for (const sd of [-1, 1]) {
    s.gcyl(
      0.28,
      0.28,
      0.1,
      0xfff0c0,
      sd * 1.7,
      cy - 0.8,
      td / 2 + 0.36,
      PI / 2,
      0,
      0,
      10,
    );
    s.cyl(
      0.36,
      0.36,
      0.2,
      P.dark,
      sd * 1.7,
      cy - 0.8,
      td / 2 + 0.3,
      PI / 2,
      0,
      0,
      10,
    );
    s.cyl(
      0.14,
      0.14,
      0.5,
      STEEL,
      sd * 0.9,
      cy - 1.3,
      td / 2 + 0.3,
      PI / 2,
      0,
      0,
      8,
    );
    s.cyl(
      0.7,
      0.7,
      1.0,
      P.dark,
      sd * (tw / 2 + 0.2),
      cy + 0.5,
      0,
      0,
      0,
      PI / 2,
      14,
    );
    s.bev(
      0.3,
      th * 0.8,
      td * 0.8,
      P.sub,
      sd * (tw / 2 + 0.05),
      cy - 0.2,
      0,
      0,
      0,
      0,
      0.08,
    );
    // 背部排氣管
    s.cyl(
      0.42,
      0.5,
      2.8,
      P.sub,
      sd * 1.2,
      cy + 2.0,
      -td / 2 - 0.9,
      0.12,
      0,
      0,
      12,
    );
    s.cyl(
      0.52,
      0.52,
      0.3,
      P.dark,
      sd * 1.2,
      cy + 3.3,
      -td / 2 - 0.74,
      0.12,
      0,
      0,
      12,
    );
    s.gcyl(
      0.34,
      0.34,
      0.08,
      0xff8a30,
      sd * 1.2,
      cy + 3.46,
      -td / 2 - 0.72,
      0.12,
      0,
      0,
      10,
    );
  }
  s.bev(3.6, 2.5, 1.5, P.dark, 0, cy, -td / 2 - 0.65, 0, 0, 0, 0.2);
  for (let j = -2; j <= 2; j++)
    s.box(0.14, 2.0, 0.5, P.sub, j * 0.36, cy, -td / 2 - 1.5);
  s.gbox(1.2, 0.3, 0.08, P.glow, 0, cy + 0.9, -td / 2 - 1.42);
  s.bev(3.8, 0.5, 3.0, P.dark, 0, cy + th / 2 + 0.2, 0, 0, 0, 0, 0.14);
  // 雙塔盾
  // 兩面大盾。
  for (const sd of [-1, 1]) {
    s.setBase(sd * (tw / 2 + 3.1), cy - 1.3, 1.3, sd * 0.42, 1, 0, 0);
    s.poly(
      [
        [-1.6, -3.7],
        [1.6, -3.7],
        [2.1, 2.2],
        [1.2, 3.8],
        [-1.2, 3.8],
        [-2.1, 2.2],
      ],
      0.45,
      P.main,
    );
    s.poly(
      [
        [-1.1, -3.0],
        [1.1, -3.0],
        [1.5, 1.9],
        [0.8, 3.0],
        [-0.8, 3.0],
        [-1.5, 1.9],
      ],
      0.3,
      P.sub,
      0,
      0,
      0.3,
    );
    s.poly(
      [
        [-1.7, -3.7],
        [1.7, -3.7],
        [1.5, -3.0],
        [-1.5, -3.0],
      ],
      0.56,
      P.dark,
      0,
      0,
      0.02,
    );
    s.gbox(0.22, 3.4, 0.1, P.glow, 0, -0.2, 0.47);
    // 盾上的箭頭標誌。
    for (let j = 0; j < 3; j++) {
      s.poly(
        [
          [-0.9, 0],
          [0, 0.5],
          [0.9, 0],
          [0.9, 0.3],
          [0, 0.8],
          [-0.9, 0.3],
        ],
        0.12,
        P.accent,
        0,
        1.5 - j * 1.5,
        0.47,
      );
    }
    for (const [bx, by] of [
      [-1.7, 2.0],
      [1.7, 2.0],
      [-1.35, -3.3],
      [1.35, -3.3],
      [-1.85, -0.6],
      [1.85, -0.6],
    ])
      s.cyl(0.14, 0.14, 0.12, STEEL, bx, by, 0.26, PI / 2, 0, 0, 6);
    s.poly(
      [
        [-0.3, 0],
        [0.3, 0],
        [0, 1.3],
      ],
      0.3,
      P.accent,
      0,
      3.8,
      0,
    );
    s.bev(0.6, 0.6, 2.6, P.dark, -sd * 1.5, 1.4, -1.0, 0, sd * 0.5, 0, 0.08);
    s.cyl(0.5, 0.5, 0.7, P.dark, -sd * 0.9, 1.4, -0.4, 0, 0, 0, 10);
    s.clearBase();
  }
  s.into(waist);

  // 頭部：低矮砲塔 + 觀察縫中的獨眼
  const head = grp("head", waist, 0, cy + th / 2 + 0.45, 0.3);
  s = new Seg();
  s.bev(2.7, 0.95, 2.5, P.dark, 0, 0.45, 0, 0, 0, 0, 0.2);
  s.trap(2.4, 1.6, 0.5, 2.0, P.main, 0, 1.1, -0.1);
  s.box(2.3, 0.3, 0.2, BLACK, 0, 0.5, 1.2);
  s.gsph(0.2, P.glow, 0.45, 0.5, 1.26);
  s.gbox(2.0, 0.05, 0.06, P.glow, 0, 0.5, 1.3);
  s.cyl(0.5, 0.56, 0.3, P.sub, -0.6, 1.4, -0.4, 0, 0, 0, 12);
  s.box(0.05, 1.5, 0.05, P.dark, 0.9, 1.9, -0.8);
  s.box(0.05, 1.0, 0.05, P.dark, 0.7, 1.65, -0.8);
  // 頭部兩側的護板。
  for (const sd of [-1, 1]) {
    s.bev(0.4, 0.8, 1.8, P.sub, sd * 1.5, 0.5, 0, 0, 0, 0, 0.08);
    for (let j = 0; j < 3; j++)
      s.cyl(
        0.14,
        0.14,
        0.7,
        GUNMETAL,
        sd * 1.5,
        1.05,
        -0.5 + j * 0.4,
        -0.7,
        0,
        0,
        8,
      );
  }
  s.into(head);

  // 手臂與武器
  buildArms(waist, P, {
    x: tw / 2 + 1.0,
    y: cy + 0.5,
    k: 1.2,
    len: 1.7,
    style: "heavy",
    pri,
    sec,
  });
  // 四足骨架：記錄四條腿的動畫資料
  root.userData = {
    type: "quad",
    mlegs,
    hipY: H,
    height: H + 1.75 + cy + th / 2 + 0.45 + 1.5,
  };
  return root;
}

// ============================================================
//  機體 3：影刃 ─ 逆關節獵食者 + 平衡尾
// ============================================================
function buildPhantom(P, pri, sec) {
  // 腿部比例（tb、kb 很大 = 平常就彎得很厲害的逆關節）
  const g = {
    thigh: 2.4,
    shin: 2.9,
    footH: 0.5,
    hipW: 0.95,
    legT: 0.6,
    bulk: 0.8,
    tb: -0.85,
    kb: 1.5,
  };
  const root = new THREE.Group(),
    inner = grp("inner", root),
    hips = grp("hips", inner);
  pelvis(hips, P, g);
  const hipY = bipedLegs(hips, P, g, "raptor");
  // 上半身：往前伸的流線型軀幹
  const waist = grp("waist", hips, 0, 0.8, 0),
    cy = 1.15;
  let s = new Seg();
  s.cyl(0.5, 0.6, 0.5, P.dark, 0, 0.2, 0, 0, 0, 0, 12);
  s.setBase(0, cy, 0.5, 0, 1, -0.14, 0); // 前傾的流線機身
  s.bev(2.0, 1.5, 4.0, P.main, 0, 0, 0, 0, 0, 0, 0.3);
  s.trap(1.9, 0.7, 1.7, 1.2, P.sub, 0, 0.05, 2.8, PI / 2, 0, 0);
  s.trap(1.6, 0.8, 1.2, 1.0, P.dark, 0, -0.05, -2.5, -PI / 2, 0, 0);
  s.bev(0.5, 0.4, 3.4, P.dark, 0, 0.85, -0.2, 0, 0, 0, 0.1);
  s.gbox(0.2, 0.1, 2.6, P.glow, 0, 1.07, -0.2);
  s.gbox(1.0, 0.2, 0.08, P.glow, 0, 0.3, 2.02);
  for (let j = 0; j < 4; j++)
    s.box(1.3, 0.08, 0.2, P.dark, 0, -0.78, 0.9 - j * 0.45);
  // 背鰭與推進器。
  for (const sd of [-1, 1]) {
    s.bev(0.3, 1.0, 2.6, P.sub, sd * 1.05, 0, 0.1, 0, 0, sd * 0.2, 0.08);
    s.box(0.34, 0.14, 2.62, P.accent, sd * 1.1, 0.3, 0.1, 0, 0, sd * 0.2);
    s.cyl(0.45, 0.45, 2.2, P.dark, sd * 1.5, -0.3, -1.0, PI / 2, 0, 0, 12);
    s.cyl(0.5, 0.36, 0.5, P.sub, sd * 1.5, -0.3, 0.3, PI / 2, 0, 0, 12);
    s.gcyl(0.34, 0.34, 0.08, P.glow, sd * 1.5, -0.3, -2.14, PI / 2, 0, 0, 12);
    s.cyl(0.4, 0.4, 0.6, P.dark, sd * 1.25, 0.3, 1.0, 0, 0, PI / 2, 12);
    // 背刃
    s.poly(
      mir(
        [
          [0, 0],
          [0.8, 0],
          [0.25, 5.4],
          [0, 4.6],
        ],
        sd,
      ),
      0.1,
      P.main,
      sd * 0.7,
      0.7,
      -0.9,
      -1.0,
      0,
      -sd * 0.42,
    );
    s.gpoly(
      mir(
        [
          [0.45, 0.3],
          [0.62, 0.3],
          [0.24, 5.0],
          [0.16, 4.8],
        ],
        sd,
      ),
      0.14,
      P.glow,
      sd * 0.7,
      0.7,
      -0.9,
      -1.0,
      0,
      -sd * 0.42,
    );
    s.poly(
      mir(
        [
          [0, 0],
          [0.6, 0],
          [0.2, 3.4],
          [0, 2.9],
        ],
        sd,
      ),
      0.1,
      P.sub,
      sd * 0.9,
      0.3,
      -1.2,
      -1.35,
      0,
      -sd * 0.75,
    );
  }
  s.cyl(0.26, 0.34, 1.6, P.dark, 0, 1.0, 2.2, 0.75, 0, 0, 10); // 脖子
  s.clearBase();
  s.into(waist);

  // 尾巴：六節越來越細的平衡尾，會自動左右擺動
  const tail = grp("tail", waist, 0, cy - 0.25, -1.9);
  s = new Seg();
  // 尾巴：六節，越往後越細。
  for (let j = 0; j < 6; j++) {
    const w = 0.95 - j * 0.13,
      z = -0.5 - j * 1.0,
      y = -j * j * 0.045;
    s.bev(
      w,
      w * 0.8,
      1.05,
      j % 2 ? P.sub : P.main,
      0,
      y,
      z,
      -0.09 * j,
      0,
      0,
      0.08,
    );
    s.cyl(w * 0.3, w * 0.3, w * 1.1, P.dark, 0, y, z + 0.5, 0, 0, PI / 2, 8);
    s.poly(
      [
        [-0.1, 0],
        [0.1, 0],
        [0, 0.7 - j * 0.07],
      ],
      0.1,
      P.accent,
      0,
      y + w * 0.4,
      z,
      0,
      PI / 2,
      0,
    );
  }
  s.poly(
    [
      [-0.3, 0],
      [0.3, 0],
      [0, 2.4],
    ],
    0.14,
    P.accent,
    0,
    -1.5,
    -6.6,
    -PI / 2 - 0.5,
    0,
    0,
  );
  s.gpoly(
    [
      [-0.12, 0.2],
      [0.12, 0.2],
      [0, 2.1],
    ],
    0.2,
    P.glow,
    0,
    -1.5,
    -6.6,
    -PI / 2 - 0.5,
    0,
    0,
  );
  s.into(tail);

  // 頭部：長吻三眼感測頭
  const head = grp("head", waist, 0, cy + 1.75, 3.25);
  s = new Seg();
  s.bev(0.9, 0.7, 2.2, P.main, 0, 0, 0.5, 0.1, 0, 0, 0.16);
  s.trap(0.8, 0.3, 1.0, 0.5, P.sub, 0, -0.1, 1.9, PI / 2 + 0.1, 0, 0);
  s.bev(0.6, 0.34, 1.2, P.dark, 0, 0.44, 0.1, 0.1, 0, 0, 0.08);
  s.gsph(0.13, P.glow, -0.26, 0.05, 1.5);
  s.gsph(0.13, P.glow, 0.26, 0.05, 1.5);
  s.gsph(0.17, 0xff4040, 0, 0.2, 1.46);
  s.box(0.7, 0.14, 1.2, P.dark, 0, -0.4, 0.9, 0.1, 0, 0);
  s.poly(
    [
      [0, 0],
      [1.6, 0],
      [0.2, 0.9],
    ],
    0.1,
    P.accent,
    0,
    0.55,
    0.3,
    0,
    PI / 2,
    0,
  );
  // 觸角。
  for (const sd of [-1, 1]) {
    s.box(0.05, 0.05, 2.4, P.dark, sd * 0.42, 0.5, -1.2, 0.35, 0, 0);
    s.bev(0.2, 0.4, 0.8, P.accent, sd * 0.52, 0, 0.2, 0, 0, 0, 0.05);
  }
  s.into(head);

  // 手臂與武器
  buildArms(waist, P, {
    x: 1.55,
    y: cy + 0.25,
    z: 1.0,
    k: 0.8,
    len: 1.6,
    style: "slim",
    pri,
    sec,
  });
  // 這台機體的骨架資料：腿的長度、關節彎曲方向等，給走路動畫使用。
  root.userData = {
    type: "biped",
    leg: {
      L1: g.thigh,
      L2: g.shin,
      fH: g.footH,
      tb: g.tb,
      kb: g.kb,
      off: 0.08,
    },
    hipY,
    height: hipY + 0.8 + cy + 2.6,
  };
  hips.position.y = hipY;
  return root;
}

// ============================================================
//  機體 4：雷神 ─ 獨眼 + 雙肩重砲
// ============================================================
function buildThor(P, pri, sec) {
  // 腿部比例（粗短的重型腿）
  const g = {
    thigh: 2.0,
    shin: 2.2,
    footH: 0.75,
    hipW: 1.5,
    legT: 1.0,
    bulk: 1.15,
    tb: -0.2,
    kb: 0.45,
  };
  const root = new THREE.Group(),
    inner = grp("inner", root),
    hips = grp("hips", inner);
  pelvis(hips, P, g);
  const hipY = bipedLegs(hips, P, g, "heavy");
  // 上半身：厚重的箱型軀幹
  const waist = grp("waist", hips, 0, 1.2, 0),
    tw = 4.2,
    th = 2.9,
    td = 2.9,
    cy = 0.4 + th / 2;
  let s = new Seg();
  s.cyl(0.9, 1.05, 0.6, P.dark, 0, 0.2, 0, 0, 0, 0, 16);
  s.bev(tw, th * 0.85, td, P.main, 0, cy + 0.12, 0, 0, 0, 0, 0.3);
  s.trap(
    tw * 0.68,
    tw * 0.95,
    th * 0.3,
    td * 0.9,
    P.dark,
    0,
    cy - th * 0.42,
    0,
  );
  // 前胸的飛彈莢艙。
  for (let i = -1; i <= 1; i++)
    for (let j = 0; j < 2; j++) {
      // 胸前飛彈艙門
      s.bev(
        0.8,
        0.66,
        0.22,
        P.sub,
        i * 1.0,
        cy + 0.05 + j * 0.8,
        td / 2 + 0.06,
        0,
        0,
        0,
        0.06,
      );
      s.cyl(
        0.2,
        0.2,
        0.1,
        BLACK,
        i * 1.0,
        cy + 0.05 + j * 0.8,
        td / 2 + 0.18,
        PI / 2,
        0,
        0,
        10,
      );
      s.cyl(
        0.14,
        0.04,
        0.2,
        0xc03020,
        i * 1.0,
        cy + 0.05 + j * 0.8,
        td / 2 + 0.2,
        PI / 2,
        0,
        0,
        8,
      );
    }
  for (let j = 0; j < 4; j++)
    s.box(2.4, 0.08, 0.14, P.dark, 0, cy - 0.75 - j * 0.16, td / 2 + 0.04);
  s.box(tw + 0.04, 0.3, td + 0.04, P.accent, 0, cy - th * 0.22, 0);
  s.bev(
    tw * 0.82,
    0.8,
    td * 0.8,
    P.dark,
    0,
    cy + th * 0.5 + 0.1,
    -0.1,
    0,
    0,
    0,
    0.16,
  );
  s.bev(
    tw * 0.7,
    th * 0.7,
    1.2,
    P.dark,
    0,
    cy + 0.1,
    -td / 2 - 0.5,
    0,
    0,
    0,
    0.15,
  );
  for (let j = -2; j <= 2; j++)
    s.box(0.16, th * 0.6, 0.5, P.sub, j * 0.5, cy + 0.1, -td / 2 - 1.1);
  backThrusters(s, P, 1.1, cy - th * 0.3, -td / 2 - 0.7, 1.1);
  // 肩關節與背上的雙管砲。
  for (const sd of [-1, 1]) {
    s.cyl(
      0.66,
      0.66,
      0.9,
      P.dark,
      sd * (tw / 2 + 0.25),
      cy + th * 0.16,
      0,
      0,
      0,
      PI / 2,
      14,
    );
    s.gbox(0.2, 0.2, 0.08, P.glow, sd * 1.7, cy + 1.0, td / 2 + 0.02);
    // 雙肩重砲
    const cx = sd * 1.6,
      cyy = cy + th * 0.5 + 1.15;
    s.bev(1.5, 0.7, 1.7, P.dark, cx, cy + th * 0.5 + 0.55, -0.5, 0, 0, 0, 0.1);
    s.cyl(0.14, 0.14, 1.2, STEEL, cx, cy + th * 0.5 + 0.7, 0.8, 0.9, 0, 0, 8);
    s.setBase(cx, cyy, -0.5, 0, 1, -0.07, 0);
    s.bev(1.35, 1.35, 2.7, P.main, 0, 0, 0, 0, 0, 0, 0.16);
    s.bev(1.45, 0.3, 2.0, P.sub, 0, 0.72, 0, 0, 0, 0, 0.08);
    s.box(1.39, 0.2, 2.74, P.accent, 0, -0.3, 0);
    s.cyl(0.6, 0.6, 2.2, P.sub, 0, 0, 2.3, PI / 2, 0, 0, 14);
    for (let j = 0; j < 3; j++)
      s.cyl(0.68, 0.68, 0.16, P.dark, 0, 0, 1.6 + j * 0.7, PI / 2, 0, 0, 14);
    s.cyl(0.4, 0.4, 5.6, GUNMETAL, 0, 0, 5.4, PI / 2, 0, 0, 12);
    s.bev(1.1, 0.9, 1.3, P.dark, 0, 0, 8.3, 0, 0, 0, 0.1);
    s.box(1.14, 0.2, 0.3, BLACK, 0, 0, 8.1);
    s.box(1.14, 0.2, 0.3, BLACK, 0, 0, 8.6);
    s.cyl(0.3, 0.3, 0.1, BLACK, 0, 0, 8.96, PI / 2, 0, 0, 10);
    s.cyl(0.85, 0.85, 1.3, P.sub, sd * 0.3, -0.1, -2.0, 0, 0, PI / 2, 14);
    s.tor(0.87, 0.07, P.accent, sd * 0.3, -0.1, -2.0, 0, PI / 2, 0);
    s.bev(0.4, 0.4, 1.0, GUNMETAL, 0, 0.95, 0.4, 0, 0, 0, 0.06);
    s.gbox(0.26, 0.26, 0.06, 0xff4040, 0, 0.95, 0.92);
    s.clearBase();
    // 砲口位置（自動砲擊時砲彈從這裡射出）
    const cm = grp(sd > 0 ? "cannonL" : "cannonR", waist, cx, cyy + 0.6, 8.6);
    cm.userData.k = 1;
  }
  s.into(waist);

  // 頭部：獨眼穹頂
  const head = grp("head", waist, 0, cy + th * 0.5 + 0.5, 0.75);
  s = new Seg();
  s.cyl(0.7, 0.8, 0.3, P.dark, 0, 0, 0, 0, 0, 0, 14);
  s.sph(0.95, P.dark, 0, 0.45, 0, 1, 0.8, 1);
  s.trap(1.5, 0.9, 0.5, 1.5, P.main, 0, 1.0, -0.15);
  s.poly(
    [
      [-1.0, 0],
      [1.0, 0],
      [0.7, 0.4],
      [-0.7, 0.4],
    ],
    0.5,
    P.main,
    0,
    0.7,
    0.72,
    -0.3,
    0,
    0,
  );
  s.tor(0.42, 0.1, P.accent, 0, 0.42, 0.86);
  s.gsph(0.32, P.glow, 0, 0.42, 0.84);
  s.sph(0.14, BLACK, 0, 0.42, 1.1);
  s.box(1.5, 0.16, 0.3, P.sub, 0, 0.1, 0.72);
  // 頭部兩側的護板。
  for (const sd of [-1, 1]) {
    s.bev(0.34, 0.7, 1.0, P.sub, sd * 0.95, 0.4, 0, 0, 0, 0, 0.08);
    s.cyl(0.1, 0.1, 0.7, STEEL, sd * 0.7, 0.15, 0.6, 0.6, 0, 0, 6);
  }
  s.box(0.05, 1.0, 0.05, P.dark, -0.7, 1.6, -0.5);
  s.into(head);

  // 手臂與武器
  buildArms(waist, P, {
    x: tw / 2 + 1.0,
    y: cy + th * 0.16,
    k: 1.1,
    len: 1.8,
    style: "round",
    pri,
    sec,
  });
  // 這台機體的骨架資料（給走路動畫使用）。
  root.userData = {
    type: "biped",
    leg: {
      L1: g.thigh,
      L2: g.shin,
      fH: g.footH,
      tb: g.tb,
      kb: g.kb,
      off: 0.115,
    },
    hipY,
    height: hipY + 1.2 + cy + th * 0.5 + 0.5 + 1.9,
  };
  hips.position.y = hipY;
  return root;
}

// ============================================================
//  機體 5：天穹 ─ 無足浮游機 + 背部光環
// ============================================================
function buildSeraph(P, pri, sec) {
  // H = 懸浮高度（沒有腳，整台飄在空中）
  const H = 3.9,
    root = new THREE.Group(),
    inner = grp("inner", root),
    hips = grp("hips", inner, 0, H, 0);
  let s = new Seg();
  s.cyl(1.0, 1.3, 1.0, P.dark, 0, 0, 0, 0, 0, 0, 14);
  s.cyl(1.5, 0.45, 2.6, P.main, 0, -1.6, 0, 0, 0, 0, 12);
  s.tor(1.55, 0.12, P.accent, 0, -0.4, 0, PI / 2, 0, 0);
  s.tor(1.0, 0.08, P.accent, 0, -1.9, 0, PI / 2, 0, 0);
  s.gsph(0.42, P.glow, 0, -3.0, 0);
  s.cyl(0.5, 0.3, 0.3, P.dark, 0, -2.85, 0, 0, 0, 0, 10);
  s.gtor(1.9, 0.05, P.glow, 0, -0.9, 0, PI / 2, 0, 0);
  // 裙擺狀的浮空翼片。
  for (let j = 0; j < 6; j++) {
    // 裙甲花瓣
    const a = (j / 6) * TAU;
    s.setBase(Math.sin(a) * 1.45, -0.3, Math.cos(a) * 1.45, a, 1, 0.32, 0);
    s.poly(
      [
        [-0.62, 0],
        [0.62, 0],
        [0.36, -3.1],
        [0, -3.6],
        [-0.36, -3.1],
      ],
      0.16,
      j % 2 ? P.sub : P.main,
    );
    s.gpoly(
      [
        [-0.08, -0.5],
        [0.08, -0.5],
        [0.08, -2.7],
        [0, -3.1],
        [-0.08, -2.7],
      ],
      0.2,
      P.glow,
    );
    s.box(1.26, 0.14, 0.2, P.accent, 0, -0.1, 0);
    s.clearBase();
  }
  // 環繞的三顆浮游水晶。
  for (let j = 0; j < 3; j++) {
    // 三具反重力推進莢艙
    const a = (j / 3) * TAU + PI / 3,
      x = Math.sin(a) * 2.5,
      z = Math.cos(a) * 2.5;
    s.box(
      0.2,
      0.2,
      1.3,
      P.dark,
      Math.sin(a) * 1.7,
      -0.1,
      Math.cos(a) * 1.7,
      0,
      a,
      0,
    );
    s.cyl(0.5, 0.38, 1.5, P.sub, x, -0.5, z, 0, 0, 0, 12);
    s.tor(0.52, 0.06, P.accent, x, 0.1, z, PI / 2, 0, 0);
    s.gcyl(0.3, 0.3, 0.08, P.glow, x, -1.28, z, 0, 0, 0, 12);
  }
  s.into(hips);

  // 上半身：纖細的軀幹
  const waist = grp("waist", hips, 0, 0.8, 0),
    th = 2.3,
    td = 1.8,
    cy = 0.3 + th / 2;
  s = new Seg();
  s.cyl(0.6, 0.75, 0.6, P.dark, 0, 0.1, 0, 0, 0, 0, 14);
  s.trap(1.5, 3.1, th, td, P.main, 0, cy, 0);
  s.trap(
    1.0,
    2.2,
    th * 0.7,
    0.4,
    P.sub,
    0,
    cy + 0.15,
    td / 2 + 0.05,
    -0.1,
    0,
    0,
  );
  s.gpoly(
    [
      [0, -0.7],
      [0.4, 0],
      [0, 0.6],
      [-0.4, 0],
    ],
    0.2,
    P.glow,
    0,
    cy + 0.2,
    td / 2 + 0.26,
    -0.1,
    0,
    0,
  );
  s.tor(0.56, 0.07, P.accent, 0, cy + 0.2, td / 2 + 0.3, -0.1, 0, 0);
  s.bev(1.6, 0.4, 1.2, P.dark, 0, cy + th / 2 + 0.1, 0, 0, 0, 0, 0.1);
  s.bev(1.4, 1.6, 0.7, P.dark, 0, cy + 0.2, -td / 2 - 0.3, 0, 0, 0, 0.12);
  // 肩部、翼片與背後的噴口。
  for (const sd of [-1, 1]) {
    s.cyl(0.45, 0.45, 0.7, P.dark, sd * 1.7, cy + 0.65, 0, 0, 0, PI / 2, 12);
    s.poly(
      mir(
        [
          [0, 0],
          [0.5, 0],
          [0.9, 1.9],
          [0.55, 2.3],
        ],
        sd,
      ),
      0.14,
      P.sub,
      sd * 0.75,
      cy + th / 2,
      -0.1,
      -0.2,
      0,
      0,
    ); // 高領
    s.gbox(0.4, 0.1, 0.08, P.glow, sd * 0.85, cy - 0.4, td / 2 - 0.1);
    s.cyl(
      0.26,
      0.2,
      0.9,
      P.sub,
      sd * 0.45,
      cy - 0.3,
      -td / 2 - 0.7,
      0.6,
      0,
      0,
      10,
    );
    s.gcyl(
      0.18,
      0.18,
      0.06,
      P.glow,
      sd * 0.45,
      cy - 0.68,
      -td / 2 - 0.96,
      0.6,
      0,
      0,
      10,
    );
  }
  s.into(waist);

  // 光環：背後旋轉的環與放射翼片
  const halo = grp("halo", waist, 0, cy + 1.5, -1.9);
  s = new Seg();
  s.tor(2.6, 0.15, P.accent);
  s.gtor(2.3, 0.05, P.glow);
  s.gtor(2.9, 0.04, P.glow);
  // 背後的光環：八片長短交錯的尖板。
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * TAU,
      len = j % 2 ? 1.0 : 1.6;
    s.poly(
      [
        [-0.34, 0],
        [0.34, 0],
        [0, len],
      ],
      0.12,
      j % 2 ? P.sub : P.main,
      Math.sin(a) * 2.7,
      Math.cos(a) * 2.7,
      0,
      0,
      0,
      -a,
    );
    s.gpoly(
      [
        [-0.08, 0.3],
        [0.08, 0.3],
        [0, len * 0.9],
      ],
      0.16,
      P.glow,
      Math.sin(a) * 2.7,
      Math.cos(a) * 2.7,
      0,
      0,
      0,
      -a,
    );
    s.bev(
      0.45,
      0.45,
      0.3,
      P.dark,
      Math.sin(a) * 2.6,
      Math.cos(a) * 2.6,
      0,
      0,
      0,
      -a,
      0.08,
    );
  }
  s.vsph(2.3, P.glow, 0, 0, 0, 1, 1, 0.03);
  s.into(halo);
  s = new Seg();
  s.box(0.3, 0.3, 1.6, P.dark, 0, cy + 1.5, -1.3);
  s.cyl(0.5, 0.5, 0.4, P.sub, 0, cy + 1.5, -1.8, PI / 2, 0, 0, 12);
  s.into(waist);

  // 頭部：高冠 + 垂直光縫
  const head = grp("head", waist, 0, cy + th / 2 + 0.3, 0.05);
  s = new Seg();
  s.cyl(0.26, 0.32, 0.3, P.dark, 0, 0, 0, 0, 0, 0, 10);
  s.bev(0.85, 1.15, 0.95, P.sub, 0, 0.65, 0, 0, 0, 0, 0.16);
  s.gbox(0.14, 0.66, 0.1, P.glow, 0, 0.65, 0.47);
  s.poly(
    [
      [-0.42, 0],
      [0.42, 0],
      [0.2, 0.5],
      [-0.2, 0.5],
    ],
    0.3,
    P.main,
    0,
    0.2,
    0.42,
    -0.2,
    0,
    0,
  );
  s.poly(
    [
      [0, 0],
      [1.0, 0],
      [0.5, 1.7],
      [0.1, 1.2],
    ],
    0.12,
    P.main,
    0,
    1.15,
    0.35,
    0,
    PI / 2,
    0,
  );
  // 頭上的角。
  for (const sd of [-1, 1]) {
    s.poly(
      mir(
        [
          [0, 0],
          [0.3, 0],
          [0.9, 1.6],
          [0.7, 1.7],
        ],
        sd,
      ),
      0.1,
      P.accent,
      sd * 0.4,
      0.8,
      -0.1,
      -0.5,
      0,
      0,
    );
    s.bev(0.16, 0.7, 0.7, P.main, sd * 0.48, 0.6, 0.05, 0, 0, 0, 0.05);
  }
  s.into(head);

  // 手臂與武器
  buildArms(waist, P, {
    x: 2.15,
    y: cy + 0.65,
    k: 0.85,
    len: 1.7,
    style: "float",
    pri,
    sec,
  });
  // 懸浮骨架：沒有腿的動畫，只會上下飄動；spins 記錄會持續旋轉的零件（光環）
  root.userData = {
    type: "hover",
    hipY: H,
    height: H + 0.8 + cy + th / 2 + 0.3 + 2.4,
    spins: [{ name: "halo", axis: "z", speed: 0.5 }],
  };
  return root;
}

// 機體代號 → 建模函式的對照表
const MECH_BUILDERS = {
  vanguard: buildVanguard,
  bastion: buildBastion,
  phantom: buildPhantom,
  thor: buildThor,
  seraph: buildSeraph,
};

// ============================================================
//  骨架實體化與動畫
// ============================================================
// 「原型」快取：同樣的機體 + 塗裝 + 武器只建模一次，之後每一台都是複製原型（建模很花時間）
const _protoCache = {};
// 模型原型只建立一次，之後都用複製的。
function getProto(key, fn) {
  return _protoCache[key] || (_protoCache[key] = fn());
}

// own = true 時連發光與半透明材質也各自複製一份（玩家機體要能整台淡化）
// 從原型複製出一台可以動的實體，並把所有關節找出來整理成 rig 物件
// 每一台有自己的材質，所以可以單獨改變透明度或閃白光
function instRig(p, own) {
  const root = p.clone(true),
    mat = MAT.body.clone(),
    u = p.userData;
  const glow = own ? MAT.glow.clone() : null,
    veil = own ? MAT.veil.clone() : null;
  if (glow) glow.transparent = true;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === MAT.body) o.material = mat;
    else if (glow && o.material === MAT.glow) o.material = glow;
    else if (veil && o.material === MAT.veil) o.material = veil;
  });
  // f：用名字找關節，找不到就是 null（不是每種機體都有翅膀或尾巴）
  const f = (n) => root.getObjectByName(n) || null;
  return {
    root,
    mat,
    glowMat: glow,
    veilMat: veil,
    type: u.type || "static",
    inner: f("inner"),
    hips: f("hips"),
    waist: f("waist"),
    head: f("head"),
    hull: f("hull"),
    thigh: [f("thighL"), f("thighR")],
    shin: [f("shinL"), f("shinR")],
    foot: [f("footL"), f("footR")],
    shoulder: [f("shoulderL"), f("shoulderR")],
    forearm: [f("forearmL"), f("forearmR")],
    muzzleR: f("muzzleR"),
    muzzleL: f("muzzleL"),
    spin: f("spin"),
    blade: f("blade"),
    pod: f("podMuzzle"),
    wings: [f("wingL"), f("wingR")],
    tail: f("tail"),
    blink: f("blink"),
    cannons: [f("cannonL"), f("cannonR")],
    mlegs: (u.mlegs || []).map((L) =>
      Object.assign({}, L, { root: f(L.root), up: f(L.up) }),
    ),
    spins: (u.spins || [])
      .map((sp) => ({ o: f(sp.name), axis: sp.axis, speed: sp.speed }))
      .filter((sp) => sp.o),
    leg: u.leg || null,
    height: u.height,
    hipY: u.hipY || 0,
    phase: Math.random() * TAU,
    amp: 0,
    lastStep: 0,
    scale: 1,
    t: Math.random() * 10,
  };
}

// 把塗裝轉成一段文字，當作快取的鍵值
function paintKey(P) {
  return P.main.toString(16) + P.sub.toString(16) + P.glow.toString(16);
}

// 建立一台機甲（玩家與精英敵人共用）。scale = 縮放、own = 是否需要整台淡化
function makeMech(ch, paint, pri, sec, scale = 1, own = false) {
  const p = getProto(["mech", ch.id, paintKey(paint), pri, sec].join("|"), () =>
    MECH_BUILDERS[ch.id](paint, pri, sec),
  );
  const rig = instRig(p, own);
  rig.inner.scale.setScalar(scale);
  rig.scale = scale;
  rig.height *= scale;
  return rig;
}

// 把一台機體從場景移除並釋放它的材質
function disposeRig(rig) {
  if (rig.root.parent) rig.root.parent.remove(rig.root);
  rig.mat.dispose();
  if (rig.glowMat) rig.glowMat.dispose();
  if (rig.veilMat) rig.veilMat.dispose();
}

// 骨架動畫（依骨架類型）；回傳 true 表示這一幀有腳掌落地
// 參數：move = 移動速度比例（0 = 站著不動）、dir = 1 前進 / -1 後退、rate = 步伐頻率
function animRig(rig, dt, move, dir = 1, rate = 7) {
  rig.t += dt;
  // 持續旋轉的零件與自動擺動的尾巴
  // 持續旋轉的零件。
  for (const sp of rig.spins) sp.o.rotation[sp.axis] += sp.speed * dt;
  // 自動擺動的尾巴。
  if (rig.tail) {
    rig.tail.rotation.y =
      Math.sin(rig.t * 2.2) * (0.12 + Math.min(move, 1) * 0.16);
    rig.tail.rotation.x = Math.sin(rig.t * 1.3) * 0.05;
  }
  switch (rig.type) {
    // 雙足：兩條腿相差半個週期，交替往前擺並抬腳
    case "biped": {
      const L = rig.leg;
      rig.amp = damp(rig.amp, Math.min(move, 1.4), 10, dt);
      if (move > 0.02) rig.phase += dt * rate * (0.4 + move * 0.6) * dir;
      const a = rig.amp;
      let ext = 0;
      for (let i = 0; i < 2; i++) {
        const ph = rig.phase + i * PI;
        // sw = 腿前後擺的角度、lift = 抬腳時膝蓋多彎的量
        const sw = Math.sin(ph) * 0.5 * a,
          lift = Math.max(0, -Math.cos(ph)) * 0.75 * a;
        const t = L.tb + sw - lift * 0.45,
          kn = L.kb + lift;
        rig.thigh[i].rotation.x = t;
        rig.shin[i].rotation.x = kn;
        if (rig.foot[i]) rig.foot[i].rotation.x = -(t + kn);
        ext = Math.max(ext, L.L1 * Math.cos(t) + L.L2 * Math.cos(t + kn));
      }
      // 依照比較直的那條腿決定髖部高度，腳才會剛好踩在地上
      rig.hips.position.y = ext + L.fH + L.off;
      // 每跨過半個週期就算踩了一步（外面會播放腳步聲與揚塵）
      const st = Math.floor(rig.phase / PI);
      if (st !== rig.lastStep) {
        rig.lastStep = st;
        return a > 0.3;
      }
      return false;
    }
    // 多足：每條腿依自己的節奏前後擺動與抬腳
    case "quad": {
      rig.amp = damp(rig.amp, Math.min(move, 1.4), 8, dt);
      if (move > 0.02) rig.phase += dt * rate * (0.4 + move * 0.6) * dir;
      const a = rig.amp;
      for (const L of rig.mlegs) {
        const ph = rig.phase + L.phase;
        L.root.rotation.y = L.yaw + Math.sin(ph) * L.sweep * a * L.sign;
        L.up.rotation.x = L.upBase - Math.max(0, Math.cos(ph)) * L.lift * a;
      }
      rig.hips.position.y =
        rig.hipY +
        Math.sin(rig.phase * 2) * 0.07 * a +
        Math.sin(rig.t * 1.5) * 0.03;
      const st = Math.floor(rig.phase / PI);
      if (st !== rig.lastStep) {
        rig.lastStep = st;
        return a > 0.3;
      }
      return false;
    }
    // 懸浮：上下飄動，移動時身體往前傾
    case "hover":
      rig.hips.position.y = rig.hipY + Math.sin(rig.t * 2) * 0.22;
      rig.inner.rotation.x = damp(
        rig.inner.rotation.x,
        Math.min(move, 1.5) * 0.15 * dir,
        5,
        dt,
      );
      return false;
  }
  return false;
}
