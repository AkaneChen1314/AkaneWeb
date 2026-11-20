'use strict';
// ============================================================
//  廢墟城市：程序化地圖、碰撞、射線、導航流場
// ============================================================
// WORLD：地圖的所有資料
//   size = 地圖邊長 800 公尺（座標範圍 -400 ~ +400）　half = 一半　ext = 包含邊界外圍的範圍
//   cs = 碰撞網格每一格 20 公尺　gw = 網格每邊 44 格
//   colliders = 所有碰撞方塊　grid = 碰撞網格（每一格記錄有哪些方塊，查詢時只要看附近幾格）
//   nav = 敵人尋路用的網格　fires = 火堆位置　barrelSpots = 油桶位置　wrecks = 殘骸
//   mapCanvas = 小地圖的底圖　group = 整張地圖的 3D 物件
const WORLD = {
  size: 800, half: 400, ext: 440, cs: 20, gw: 44,
  colliders: [], grid: [], stamp: 0, nav: null,
  fires: [], barrelSpots: [], wrecks: [], mapCanvas: null, group: null, seed: 0,
};

// 新增一個碰撞方塊（用最小角與最大角表示的「軸對齊方塊」，簡稱 AABB），並登記到它佔到的每一個網格
function addCollider(minX, minY, minZ, maxX, maxY, maxZ) {
  const c = { minX, minY, minZ, maxX, maxY, maxZ, stamp: 0 };
  WORLD.colliders.push(c);
  const { cs, ext, gw } = WORLD;
  const x0 = clamp(Math.floor((minX + ext) / cs), 0, gw - 1), x1 = clamp(Math.floor((maxX + ext) / cs), 0, gw - 1);
  const z0 = clamp(Math.floor((minZ + ext) / cs), 0, gw - 1), z1 = clamp(Math.floor((maxZ + ext) / cs), 0, gw - 1);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) WORLD.grid[z * gw + x].push(c);
  return c;
}
// 同上，但用「底面中心 + 長寬高」來指定（比較好寫）
function addBoxCol(cx, y0, cz, sx, sy, sz) {
  return addCollider(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2);
}

// ---------- 圓柱體 vs AABB 水平推出 ----------
// 把單位 e（圓柱體：位置 x z、半徑 r、高度 h）從牆壁裡推出來；有撞到就回傳 true
// step = 可以直接跨上去的高度（比這個矮的障礙不算撞到）
function collideXZ(e, step) {
  const { cs, ext, gw, grid } = WORLD, r = e.r;
  const x0 = clamp(Math.floor((e.x - r + ext) / cs), 0, gw - 1),
      x1 = clamp(Math.floor((e.x + r + ext) / cs), 0, gw - 1);
  const z0 = clamp(Math.floor((e.z - r + ext) / cs), 0, gw - 1),
      z1 = clamp(Math.floor((e.z + r + ext) / cs), 0, gw - 1);
  // 只檢查高度範圍有重疊的方塊
  const lo = e.y + step, hi = e.y + e.h;
  let hit = false;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const cell = grid[cz * gw + cx];
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.maxY <= lo || c.minY >= hi) continue;
      // 找出方塊上離圓心最近的點；距離小於半徑就是撞到了，沿著那個方向推出去
      const qx = clamp(e.x, c.minX, c.maxX), qz = clamp(e.z, c.minZ, c.maxZ);
      const dx = e.x - qx, dz = e.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), p = (r - d) / d;
        e.x += dx * p;
        e.z += dz * p;
      }
      else {
        // 圓心已經在方塊裡面：從最近的那一面推出去
        const l = e.x - c.minX, rr = c.maxX - e.x, t = e.z - c.minZ, b = c.maxZ - e.z, m = Math.min(l, rr, t, b);
        if (m === l) e.x = c.minX - r;
        else if (m === rr) e.x = c.maxX + r;
        else if (m === t) e.z = c.minZ - r;
        else e.z = c.maxZ + r;
      }
    }
  }
  return hit;
}

// 腳下可站立的最高面
// 參數：y = 目前腳底高度、step = 最多可以跨上多高。回傳可以站的高度（0 = 地面）
function groundAt(x, z, r, y, step) {
  const { cs, ext, gw, grid } = WORLD, rr = r * 0.55;
  const x0 = clamp(Math.floor((x - rr + ext) / cs), 0, gw - 1), x1 = clamp(Math.floor((x + rr + ext) / cs), 0, gw - 1);
  const z0 = clamp(Math.floor((z - rr + ext) / cs), 0, gw - 1), z1 = clamp(Math.floor((z + rr + ext) / cs), 0, gw - 1);
  let g = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const cell = grid[cz * gw + cx];
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.maxY > g && c.maxY <= y + step && x > c.minX - rr && x < c.maxX + rr && z > c.minZ - rr &&
          z < c.maxZ + rr) g = c.maxY;
    }
  }
  return g;
}

// 頭頂上最低的障礙底面（跳躍撞天花板用）
function ceilingAt(x, z, r, y0, y1) {
  const { cs, ext, gw, grid } = WORLD, rr = r * 0.85;
  const x0 = clamp(Math.floor((x - rr + ext) / cs), 0, gw - 1), x1 = clamp(Math.floor((x + rr + ext) / cs), 0, gw - 1);
  const z0 = clamp(Math.floor((z - rr + ext) / cs), 0, gw - 1), z1 = clamp(Math.floor((z + rr + ext) / cs), 0, gw - 1);
  let m = Infinity;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const cell = grid[cz * gw + cx];
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.minY >= y0 && c.minY < y1 && c.minY < m && x > c.minX - rr && x < c.maxX + rr && z > c.minZ - rr &&
          z < c.maxZ + rr) m = c.minY;
    }
  }
  return m;
}

// ---------- 射線 ----------
// 一條射線和一個方塊的交點距離（沒打到回傳 -1）。ix iy iz 是方向的倒數，預先算好比較快
function rayAABB(c, ox, oy, oz, ix, iy, iz, maxT) {
  let t1 = (c.minX - ox) * ix, t2 = (c.maxX - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (c.minY - oy) * iy;
  t2 = (c.maxY - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (c.minZ - oz) * iz;
  t2 = (c.maxZ - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax >= Math.max(tmin, 0) && tmin < maxT) return Math.max(tmin, 0);
  return -1;
}

// 回傳射線打到世界（建築或地面）的距離；沒打到則回傳 maxT
function rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  // 射線朝下時，先算打到地面（y = 0）的距離
  if (dy < 0) {
    const tg = -oy / dy;
    if (tg >= 0 && tg < best) best = tg;
  }
  const { cs, ext, gw, grid } = WORLD;
  // 沿著射線一格一格走過碰撞網格（只檢查射線經過的格子，不用檢查全地圖）
  let cx = Math.floor((ox + ext) / cs), cz = Math.floor((oz + ext) / cs);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
  let tMaxX = ((cx + (dx > 0 ? 1 : 0)) * cs - ext - ox) * ix, tMaxZ = ((cz + (dz > 0 ? 1 : 0)) * cs - ext - oz) * iz;
  const tDX = Math.abs(cs * ix), tDZ = Math.abs(cs * iz);
  // stamp：同一個方塊可能跨好幾格，用編號記住「這次已經檢查過」避免重複計算
  const stamp = ++WORLD.stamp;
  for (let iter = 0; iter < 160; iter++) {
    if (cx >= 0 && cx < gw && cz >= 0 && cz < gw) {
      const cell = grid[cz * gw + cx];
      for (let i = 0; i < cell.length; i++) {
        const c = cell[i];
        if (c.stamp === stamp) continue;
        c.stamp = stamp;
        const h = rayAABB(c, ox, oy, oz, ix, iy, iz, best);
        if (h >= 0 && h < best) best = h;
      }
    }
    // 下一格已經比目前找到的交點還遠，可以停了
    if (Math.min(tMaxX, tMaxZ) > best) break;
    if (tMaxX < tMaxZ) {
      cx += sx;
      tMaxX += tDX;
    } else {
      cz += sz;
      tMaxZ += tDZ;
    }
  }
  return best;
}

// A 點和 B 點之間有沒有被建築擋住（true = 看得到，敵人才會開火）
function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
  if (l < 0.01) return true;
  return rayWorld(ax, ay, az, dx / l, dy / l, dz / l, l) >= l - 0.05;
}

// ---------- 導航流場（敵人用來繞過建築找到玩家）----------
// 兩張導航網格：nav 給一般單位；navBig 給大型 Boss（障礙多膨脹一圈、會跨過矮障礙），
// 這樣大型 Boss 只會走牠真的過得去的路，不會擠進大樓或卡在柱子之間
// 建立導航網格：每格 4 公尺，把被建築佔住的格子標成「不能走」
function buildNav() {
  const cs = 4, n = WORLD.size / cs, half = WORLD.half;
  const mk = () => ({ cs, n, blocked: new Uint8Array(n * n), dist: new Uint16Array(n * n).fill(65535),
      q: new Int32Array(n * n) });
  const nav = WORLD.nav = mk(), big = WORLD.navBig = mk();
  // mark：把方塊 c 往外膨脹 inf 公尺後蓋到的格子全部標成不能走
  const mark = (nv, c, inf) => {
    const x0 = Math.max(0, Math.floor((c.minX - inf + half) / cs)),
        x1 = Math.min(n - 1, Math.floor((c.maxX + inf + half) / cs));
    const z0 = Math.max(0, Math.floor((c.minZ - inf + half) / cs)),
        z1 = Math.min(n - 1, Math.floor((c.maxZ + inf + half) / cs));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * cs - half, pz = (z + 0.5) * cs - half;
      if (px > c.minX - inf && px < c.maxX + inf && pz > c.minZ - inf && pz < c.maxZ + inf) nv.blocked[z * n + x] = 1;
    }
  };
  // 懸空的東西（底部高於 4.5）不擋路；一般單位避開高於 0.6 的障礙；大型 Boss 只避開高於 6 的（矮的直接跨過）
  for (const c of WORLD.colliders) {
    if (c.minY > 4.5) continue;
    if (c.maxY >= 0.6) mark(nav, c, 2.4);
    if (c.maxY > 6) mark(big, c, 9.5);
  }
}

// 圓形範圍內最高的建築頂面（飛行單位用來飛越屋頂，不會穿進大樓）
function roofAt(x, z, r) {
  const { cs, ext, gw, grid } = WORLD;
  const x0 = clamp(Math.floor((x - r + ext) / cs), 0, gw - 1), x1 = clamp(Math.floor((x + r + ext) / cs), 0, gw - 1);
  const z0 = clamp(Math.floor((z - r + ext) / cs), 0, gw - 1), z1 = clamp(Math.floor((z + r + ext) / cs), 0, gw - 1);
  let top = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const cell = grid[cz * gw + cx];
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i];
      if (c.maxY > top && c.maxY < 300 && x > c.minX - r && x < c.maxX + r && z > c.minZ - r &&
          z < c.maxZ + r) top = c.maxY;
    }
  }
  return top;
}

// 離 (x,z) 最近、且走得到玩家的導航格中心（單位被擠進死角時用來脫困）
function nearestOpen(nav, x, z, maxR = 16) {
  const n = nav.n, half = WORLD.half, cs = nav.cs, d = nav.dist;
  const ix = clamp(Math.floor((x + half) / cs), 0, n - 1), iz = clamp(Math.floor((z + half) / cs), 0, n - 1);
  for (let r = 0; r <= maxR; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const xx = ix + dx, zz = iz + dz;
    if (xx < 0 || zz < 0 || xx >= n || zz >= n || d[zz * n + xx] === 65535) continue;
    return { x: (xx + 0.5) * cs - half, z: (zz + 0.5) * cs - half };
  }
  return null;
}

// (x, z) 位於導航網格的第幾格（編號）
function navCell(x, z) {
  const nav = WORLD.nav, n = nav.n;
  return clamp(Math.floor((z + WORLD.half) / nav.cs), 0, n - 1) * n +
      clamp(Math.floor((x + WORLD.half) / nav.cs), 0, n - 1);
}

// 更新流場：從玩家所在的格子開始往外擴散（廣度優先搜尋），算出每一格「走到玩家要幾步」
// 之後敵人只要一直往步數比較小的鄰格走，就會自動繞過建築找到玩家
function updateFlow(px, pz, nav = WORLD.nav) {
  const n = nav.n, d = nav.dist, b = nav.blocked, q = nav.q, half = WORLD.half;
  d.fill(65535);
  let sx = clamp(Math.floor((px + half) / nav.cs), 0, n - 1), sz = clamp(Math.floor((pz + half) / nav.cs), 0, n - 1);
  // 玩家剛好站在不能走的格子（例如屋頂上）：改從最近的可走格開始
  if (b[sz * n + sx]) {
    let found = false;
    for (let r = 1; r < 30 && !found; r++) for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = sx + dx, z = sz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n || b[z * n + x]) continue;
      sx = x;
      sz = z;
      found = true;
      break;
    }
  }
  let head = 0, tail = 0;
  q[tail++] = sz * n + sx;
  d[sz * n + sx] = 0;
  // q 是待處理的格子佇列：取出一格，把它上下左右與斜角的鄰格設成「步數 + 1」再放進佇列
  while (head < tail) {
    const i = q[head++], x = i % n, z = (i / n) | 0, nd = d[i] + 1;
    const L = x > 0 && !b[i - 1], R = x < n - 1 && !b[i + 1], U = z > 0 && !b[i - n], D = z < n - 1 && !b[i + n];
    if (L && d[i - 1] > nd) {
      d[i - 1] = nd;
      q[tail++] = i - 1;
    }
    if (R && d[i + 1] > nd) {
      d[i + 1] = nd;
      q[tail++] = i + 1;
    }
    if (U && d[i - n] > nd) {
      d[i - n] = nd;
      q[tail++] = i - n;
    }
    if (D && d[i + n] > nd) {
      d[i + n] = nd;
      q[tail++] = i + n;
    }
    // 斜向移動：兩側都沒有障礙時才允許（避免切過牆角）
    if (L && U && !b[i - n - 1] && d[i - n - 1] > nd) {
      d[i - n - 1] = nd;
      q[tail++] = i - n - 1;
    }
    if (R && U && !b[i - n + 1] && d[i - n + 1] > nd) {
      d[i - n + 1] = nd;
      q[tail++] = i - n + 1;
    }
    if (L && D && !b[i + n - 1] && d[i + n - 1] > nd) {
      d[i + n - 1] = nd;
      q[tail++] = i + n - 1;
    }
    if (R && D && !b[i + n + 1] && d[i + n + 1] > nd) {
      d[i + n + 1] = nd;
      q[tail++] = i + n + 1;
    }
  }
}

// 取得 (x,z) 處朝玩家前進的方向；回傳 false 表示應直接走向目標
const _flow = { x: 0, z: 0 };
function flowDir(x, z, nav = WORLD.nav) {
  const n = nav.n, d = nav.dist, half = WORLD.half, cs = nav.cs;
  const ix = clamp(Math.floor((x + half) / cs), 0, n - 1), iz = clamp(Math.floor((z + half) / cs), 0, n - 1);
  // here = 目前這格到玩家的步數；0 代表已經和玩家在同一格
  const here = d[iz * n + ix];
  if (here === 0) return false;
  let best = here, bx = ix, bz = iz;
  // 在周圍八格裡找步數最小的那一格
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const xx = ix + dx, zz = iz + dz;
    if (xx < 0 || zz < 0 || xx >= n || zz >= n) continue;
    const v = d[zz * n + xx];
    if (v < best || (v === best && v < here && !(dx && dz))) {
      if (dx && dz && here !== 65535 && (d[iz * n + xx] === 65535 || d[zz * n + ix] === 65535)) continue;
      best = v;
      bx = xx;
      bz = zz;
    }
  }
  if (best === 65535 || (bx === ix && bz === iz)) return false;
  const tx = (bx + 0.5) * cs - half - x, tz = (bz + 0.5) * cs - half - z, l = Math.hypot(tx, tz) || 1;
  _flow.x = tx / l;
  _flow.z = tz / l;
  return true;
}

// ============================================================
//  地圖生成
// ============================================================
// 移除舊地圖並釋放它佔用的顯示卡記憶體
function disposeWorld(scene) {
  if (!WORLD.group) return;
  scene.remove(WORLD.group);
  WORLD.group.traverse(o => {
    if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose();
  });
  WORLD.group = null;
}

// 生成整張地圖。seed = 亂數種子：同一個種子會生成一模一樣的地圖
function genWorld(scene, seed) {
  disposeWorld(scene);
  WORLD.seed = seed;
  WORLD.colliders = [];
  WORLD.fires = [];
  WORLD.barrelSpots = [];
  WORLD.wrecks = [];
  WORLD.grid = Array.from({ length: WORLD.gw * WORLD.gw }, () => []);
  // 地圖專用的亂數：R() 0~1、rr(a, b) 範圍內的小數、ri(a, b) 範圍內的整數、rp(陣列) 隨機挑一個
  const R = seeded(seed), rr = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1)),
      rp = arr => arr[Math.floor(R() * arr.length)];
  // 各種材質的幾何批次：fa / fb = 兩種外牆、con = 混凝土、side = 人行道、lines = 道路標線、dec = 地面焦痕
  const fa = new GeoBatch(), fb = new GeoBatch(), con = new GeoBatch(), side = new GeoBatch(),
      lines = new GeoBatch(), dec = new GeoBatch();
  // props = 所有道具的零件；rocks = 碎石清單（最後一次畫出來）
  const props = new Seg(), rocks = [];
  // 配色表：水泥大樓、磚造建築、車輛、貨櫃
  const TINTS = [0xc4beb2, 0xa8a398, 0xb4aa9a, 0x969696, 0xbcb49c, 0x8b9194, 0xaf9f8e];
  const BRICKS = [0xc09a88, 0xaa8878, 0xb8a090, 0x9a8a80];
  const CARS = [0x6b3a2a, 0x4a4f55, 0x7a6a4a, 0x3d4a5a, 0x5a2a2a, 0x8a8a80, 0x2f3a2f, 0x77601f];
  const BOXES = [0x8a3a2a, 0x2a5a7a, 0x3a6a4a, 0x8a7a3a, 0x555a60, 0x7a4a2a];
  const REBAR = C(0x2a2018), WHITE = C(0xffffff), DUST = C(0xb0a898);

  // rock：放一顆碎石（大小 s）；scorch：在地上貼一塊焦痕；fire：放一個火堆
  const rock = (x, z, s, y = 0) => rocks.push({ x, y: y + s * 0.25, z, s, a: R() * 6, b: R() * 6, c: R() * 6,
      f: rr(0.5, 1) });
  const scorch = (x, z, s) => {
    const y = 0.06 + R() * 0.03;
    dec.quad([x - s, y, z + s], [x + s, y, z + s], [x + s, y, z - s], [x - s, y, z - s], 0, 1, 0, 0, 0, 1, 1, WHITE);
  };
  const fire = (x, y, z, s) => WORLD.fires.push({ x, y, z, s });
  // 在建築四周撒一圈碎石與掉落的樓板
  function rubbleRing(cx, cz, w, d, n) {
    for (let i = 0; i < n; i++) {
      const t = R() * 2 * (w + d);
      let x, z;
      if (t < w) {
        x = cx - w / 2 + t;
        z = cz - d / 2 - rr(0.5, 4);
      } else if (t < 2 * w) {
        x = cx - w / 2 + t - w;
        z = cz + d / 2 + rr(0.5, 4);
      }
      else if (t < 2 * w + d) {
        x = cx - w / 2 - rr(0.5, 4);
        z = cz - d / 2 + t - 2 * w;
      } else {
        x = cx + w / 2 + rr(0.5, 4);
        z = cz - d / 2 + t - 2 * w - d;
      }
      rock(x, z, rr(0.5, 1.7));
    }
    for (let i = 0; i < 3; i++) {  // 掉落的樓板碎片
      const a = R() * TAU, x = cx + Math.cos(a) * (w / 2 + rr(2, 5)), z = cz + Math.sin(a) * (d / 2 + rr(2, 5));
      wbox(con, con, x, 0.25 + i * 0.1, z, rr(2.5, 5.5), 0.5, rr(2.5, 5.5), DUST, R() * 3, 9);
    }
  }
  // 一堆碎石 + 焦痕（爆炸坑）
  function rubblePile(cx, cz, rad, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * rad;
      rock(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rr(0.6, 2.2) * (1 - d / rad * 0.5));
    }
    scorch(cx, cz, rad * 0.9);
  }

  // ---------------- 建築類型 ----------------
  function bJagged(cx, cz, w, d, h, bs, tint) {  // 上半部被炸成鋸齒狀
    const hb = h * rr(0.5, 0.8), uo = Math.floor(R() * 4) / 4;
    wbox(bs, con, cx, hb / 2, cz, w, hb, d, tint, 0, 14, uo);
    addBoxCol(cx, 0, cz, w, hb, d);
    const nx = w > 26 ? 3 : 2, nz = d > 26 ? 3 : 2, cw = w / nx, cd = d / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (R() < 0.35) continue;
      const eh = (h - hb) * rr(0.15, 1), x = cx - w / 2 + cw * (i + 0.5), z = cz - d / 2 + cd * (j + 0.5);
      wbox(bs, con, x, hb + eh / 2, z, cw, eh, cd, tint, 0, 14, uo + i * cw / 14);
      addBoxCol(x, hb, z, cw, eh, cd);
      if (R() < 0.6) for (let k = 0; k < 3; k++) wbox(con, con, x + rr(-cw / 2.2, cw / 2.2), hb + eh + rr(0.5, 1.5),
          z + rr(-cd / 2.2, cd / 2.2), 0.16, rr(1.5, 4.5), 0.16, REBAR, R() * 3);
    }
  }
  function bSliced(cx, cz, w, d, h, bs, tint) {  // 被斜切的階梯狀殘骸
    const n = ri(3, 5), ax = R() < 0.5, flip = R() < 0.5 ? -1 : 1, uo = Math.floor(R() * 4) / 4;
    for (let i = 0; i < n; i++) {
      const hh = Math.max(3.5, h * Math.pow(1 - i / n, 1.4) * rr(0.85, 1)), off = ((i + 0.5) / n - 0.5) * flip;
      const sx = ax ? w / n : w, sz = ax ? d : d / n, x = cx + (ax ? off * w : 0), z = cz + (ax ? 0 : off * d);
      wbox(bs, con, x, hh / 2, z, sx, hh, sz, tint, 0, 14, uo + (ax ? i * sx / 14 : 0));
      addBoxCol(x, 0, z, sx, hh, sz);
      for (let k = 0; k < 2; k++) wbox(con, con, x + rr(-sx / 2.4, sx / 2.4), hh + rr(0.6, 1.8),
          z + rr(-sz / 2.4, sz / 2.4), 0.16, rr(2, 5), 0.16, REBAR, R() * 3);
      for (let y = 7; y < hh - 2; y += 3.5) if (R() < 0.22) {  // 外露樓板
        const ox = ax ? flip * (sx / 2 + 1.2) : rr(-sx / 3, sx / 3),
            oz = ax ? rr(-sz / 3, sz / 3) : flip * (sz / 2 + 1.2);
        wbox(con, con, x + ox, y, z + oz, ax ? 3 : sx * 0.3, 0.4, ax ? sz * 0.3 : 3, tint, 0, 9);
      }
    }
  }
  // 被炸成一塊塊的殘骸建築：把地基切成九宮格，每一格是一整塊「厚實的實心樓體」或被炸空的缺口
  // （取代舊版只有薄薄外牆的空殼建築，看起來才像真的大樓殘骸；缺口仍然可以走進去當掩體）
  function bRuin(cx, cz, w, d, h, bs, tint) {
    const cw = w / 3, cd = d / 3, uo = Math.floor(R() * 4) / 4;
    // 先決定九格各自的高度（0 = 整格被炸空）
    const hs = [];
    for (let k = 0; k < 9; k++) hs.push(R() < 0.3 ? 0 : h * rr(0.3, 1));
    if (R() < 0.6) hs[4] = 0;                              // 中央常常是塌陷的天井
    if (hs.filter(v => v > 0).length < 5) {                // 太空曠的話，至少保留四個角
      for (const k of [0, 2, 6, 8]) hs[k] = hs[k] || h * rr(0.4, 1);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const hh = hs[j * 3 + i], x = cx - w / 2 + cw * (i + 0.5), z = cz - d / 2 + cd * (j + 0.5);
      if (hh <= 0) {
        // 炸空的格子：留下瓦礫與倒塌的樓板
        for (let k = 0; k < 5; k++) rock(x + rr(-cw / 2.4, cw / 2.4), z + rr(-cd / 2.4, cd / 2.4), rr(0.6, 2.0));
        wbox(con, con, x + rr(-2, 2), 0.3, z + rr(-2, 2), rr(3, 6), 0.6, rr(3, 6), DUST, R() * 3, 9);
        continue;
      }
      wbox(bs, con, x, hh / 2, z, cw, hh, cd, tint, 0, 14, uo + i * cw / 14);
      addBoxCol(x, 0, z, cw, hh, cd);
      if (R() < 0.5) {
        // 頂部再疊一塊較小的殘塊，輪廓才不會太方正
        const eh = rr(2, 6), ew = cw * rr(0.45, 0.75), ed = cd * rr(0.45, 0.75);
        const ex = x + rr(-1, 1) * (cw - ew) / 2, ez = z + rr(-1, 1) * (cd - ed) / 2;
        wbox(bs, con, ex, hh + eh / 2, ez, ew, eh, ed, tint, 0, 14, uo);
        addBoxCol(ex, hh, ez, ew, eh, ed);
      }
      if (R() < 0.6) {
        for (let k = 0; k < 2; k++) wbox(con, con, x + rr(-cw / 2.4, cw / 2.4), hh + rr(0.6, 1.6),
            z + rr(-cd / 2.4, cd / 2.4), 0.16, rr(2, 4.5), 0.16, REBAR, R() * 3);
      }
    }
    scorch(cx, cz, Math.min(w, d) * 0.45);
  }
  function bFrame(cx, cz, w, d, h, tint, bs) {  // 鋼筋混凝土骨架（樓板可以站上去）
    const nx = Math.max(2, Math.round(w / 10)), nz = Math.max(2, Math.round(d / 10)), sx = w / nx, sz = d / nz,
        floors = Math.max(1, Math.floor(h / 12));
    const top = floors * 12 + 2, CT = 2.2;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const hh = top + rr(0, 5), x = cx - w / 2 + i * sx, z = cz - d / 2 + j * sz;
      wbox(con, con, x, hh / 2, z, CT, hh, CT, tint, 0, 9);
      addBoxCol(x, 0, z, CT, hh, CT);
    }
    for (let f = 1; f <= floors; f++) {
      const y = f * 12 + 2;
      for (let i = 0; i <= nx; i++) {
        const x = cx - w / 2 + i * sx;
        wbox(con, con, x, y - 0.5, cz, 1.1, 1.0, d, tint, 0, 9);
        addBoxCol(x, y - 1, cz, 1.1, 1.0, d);
      }
      for (let j = 0; j <= nz; j++) {
        const z = cz - d / 2 + j * sz;
        wbox(con, con, cx, y - 0.5, z, w, 1.0, 1.1, tint, 0, 9);
        addBoxCol(cx, y - 1, z, w, 1.0, 1.1);
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (R() < 0.3 + f * 0.14) continue;
        const x = cx - w / 2 + (i + 0.5) * sx, z = cz - d / 2 + (j + 0.5) * sz;
        wbox(con, con, x, y - 0.35, z, sx, 0.7, sz, tint, 0, 9);
        addBoxCol(x, y - 0.7, z, sx, 0.7, sz);
      }
    }
    // 一樓柱子之間的殘牆：和柱子一樣厚的純混凝土牆（不是薄薄一片的窗戶牆）
    for (let i = 0; i < nx; i++) for (const sd of [-1, 1]) if (R() < 0.5) {  // 南北面
      const x = cx - w / 2 + (i + 0.5) * sx, z = cz + sd * d / 2, hh = rr(3, 8);
      wbox(con, con, x, hh / 2, z, sx - CT, hh, CT, tint, 0, 9);
      addBoxCol(x, 0, z, sx - CT, hh, CT);
    }
    for (let j = 0; j < nz; j++) for (const sd of [-1, 1]) if (R() < 0.5) {  // 東西面
      const z = cz - d / 2 + (j + 0.5) * sz, x = cx + sd * w / 2, hh = rr(3, 8);
      wbox(con, con, x, hh / 2, z, CT, hh, sz - CT, tint, 0, 9);
      addBoxCol(x, 0, z, CT, hh, sz - CT);
    }
  }
  // 隨機挑一種建築類型蓋在指定位置
  function building(cx, cz, w, d, h) {
    const brick = R() < 0.35, bs = brick ? fb : fa, tint = C(rp(brick ? BRICKS : TINTS)), m = R();
    if (m < 0.4) bJagged(cx, cz, w, d, h, bs, tint);
    else if (m < 0.64) bSliced(cx, cz, w, d, h, bs, tint);
    else if (m < 0.84) {
      if (w >= 30 && d >= 30) bRuin(cx, cz, w, d, Math.min(h, 46), bs, tint);
      else bJagged(cx, cz, w, d, h, bs, tint);
    }
    else bFrame(cx, cz, w, d, Math.min(h, 62), tint, bs);
    rubbleRing(cx, cz, w, d, 14);
  }
  function brokenWall(x, z, len, hz, h, tint) {  // 斷牆殘骸：厚實的純混凝土、階梯狀缺口（當掩體用）
    const sl = len / 3, hs = [1, rr(0.45, 0.75), rr(0.2, 0.4)];
    if (R() < 0.5) hs.reverse();
    for (let k = 0; k < 3; k++) {
      const hh = Math.max(1.6, h * hs[k]), t = -len / 2 + sl * (k + 0.5), px = hz ? x + t : x, pz = hz ? z : z + t,
          sx = hz ? sl : 2.6, sz = hz ? 2.6 : sl;
      wbox(con, con, px, hh / 2, pz, sx, hh, sz, tint, 0, 9);
      addBoxCol(px, 0, pz, sx, hh, sz);
      if (R() < 0.6) wbox(con, con, px + rr(-sx / 3, sx / 3), hh + 1, pz + rr(-sz / 3, sz / 3), 0.16,
          rr(1.5, 3), 0.16, REBAR, R() * 3);
    }
    for (let i = 0; i < 4; i++) rock(x + rr(-4, 4) + (hz ? rr(-len / 2, len / 2) : 0),
        z + rr(-4, 4) + (hz ? 0 : rr(-len / 2, len / 2)), rr(0.4, 1.3));
  }

  // ---------------- 道具 ----------------
  // 廢棄車輛（bus = true 是公車）
  function car(x, z, rot, bus) {
    const col = rp(CARS), sc = 1.25;
    props.setBase(x, 0, z, rot, sc, 0, rr(-0.04, 0.04));
    const L = bus ? 9.5 : 4.7, W = bus ? 2.5 : 2.1, H = bus ? 2.9 : 1.7;
    if (bus) {
      props.bev(W, 2.3, L, col, 0, 1.75, 0, 0, 0, 0, 0.2);
      props.box(W + 0.04, 0.8, L * 0.86, 0x0c0e10, 0, 2.2, 0);
      props.box(W + 0.06, 0.2, L, 0xb0b0a0, 0, 1.2, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.cyl(0.5, 0.5, 0.35, 0x141414, sx * 1.1, 0.5,
          sz * L * 0.32, 0, 0, PI / 2, 10);
    } else {
      props.bev(W, 0.75, L, col, 0, 0.78, 0, 0, 0, 0, 0.15);
      props.trap(W * 0.95, W * 0.76, 0.7, 2.3, col, 0, 1.48, -0.2);
      props.box(W * 0.8, 0.42, 2.34, 0x0c0e10, 0, 1.5, -0.2);
      props.box(W * 0.97, 0.42, 1.5, 0x0c0e10, 0, 1.42, -0.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (R() < 0.8) props.cyl(0.4, 0.4, 0.3, 0x141414,
          sx * 1.0, 0.4,
          sz * 1.5, 0, 0, PI / 2, 10);
      props.box(W + 0.1, 0.2, 0.2, 0x333333, 0, 0.5, L / 2);
      props.box(W + 0.1, 0.2, 0.2, 0x333333, 0, 0.5, -L / 2);
    }
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), ex = (c * W + s * L) * sc * 0.5,
        ez = (s * W + c * L) * sc * 0.5;
    addCollider(x - ex, 0, z - ez, x + ex, Math.min(H * sc, bus ? 3.6 : 1.75), z + ez);
    if (R() < 0.12) fire(x, 1.6, z, 1.2);
  }
  // 貨櫃（y > 0 可以疊在另一個上面）
  function container(x, z, alongX, y = 0) {
    const col = rp(BOXES);
    props.setBase(x, y, z, alongX ? PI / 2 : 0, 1);
    props.bev(5, 5.2, 12, col, 0, 2.6, 0, 0, 0, 0, 0.12);
    for (let i = -4; i <= 4; i++) {
      props.box(5.16, 4.6, 0.3, col, 0, 2.6, i * 1.3);
    }
    props.box(5.2, 0.3, 12.1, 0x2a2a2a, 0, 0.2, 0);
    // 頂框要比箱體頂面低一點；之前兩個面剛好同高（都在 5.2），重疊在一起才會一直閃爍
    props.box(5.2, 0.3, 12.1, 0x2a2a2a, 0, 4.97, 0);
    props.box(0.12, 4.4, 0.12, 0x9a9a9a, -1.0, 2.6, 6.05);
    props.box(0.12, 4.4, 0.12, 0x9a9a9a, 1.0, 2.6, 6.05);
    if (alongX) addBoxCol(x, y, z, 12, 5.2, 5);
    else addBoxCol(x, y, z, 5, 5.2, 12);
  }
  // 水泥護欄
  function barrier(x, z, alongX) {
    props.setBase(x, 0, z, alongX ? PI / 2 : 0, 1);
    props.trap(1.0, 0.4, 1.2, 4, 0x9a968e, 0, 0.6, 0);
    props.box(0.5, 0.3, 3.6, 0xc8a020, 0, 0.9, 0);
    if (alongX) addBoxCol(x, 0, z, 4, 1.2, 1);
    else addBoxCol(x, 0, z, 1, 1.2, 4);
  }
  // 路燈
  function lamp(x, z, rot) {
    const bent = R() < 0.4;
    props.setBase(x, 0, z, rot, 1, bent ? rr(0.15, 0.5) : 0, bent ? rr(-0.3, 0.3) : 0);
    props.cyl(0.14, 0.2, 9, 0x3a3d40, 0, 4.5, 0, 0, 0, 0, 8);
    props.cyl(0.35, 0.4, 0.6, 0x3a3d40, 0, 0.3, 0, 0, 0, 0, 8);
    props.box(0.14, 0.14, 2.6, 0x3a3d40, 0, 8.9, 1.2);
    props.bev(0.5, 0.2, 0.9, 0x55595c, 0, 8.8, 2.4, 0, 0, 0, 0.05);
  }
  // 工業儲槽
  function silo(x, z, r, h) {
    props.setBase(x, 0, z, R() * 6, 1);
    const col = rp([0xa8a49a, 0x7a6a5a, 0x8a4a3a, 0x6a7a80]);
    props.cyl(r, r, h, col, 0, h / 2, 0, 0, 0, 0, 20);
    props.cyl(r * 0.3, r, r * 0.35, col, 0, h + r * 0.17, 0, 0, 0, 0, 20);
    for (let i = 1; i < 4; i++) props.cyl(r + 0.1, r + 0.1, 0.3, 0x3a3a3a, 0, h * i / 4, 0, 0, 0, 0, 20);
    props.box(0.8, h, 0.2, 0x4a4a4a, 0, h / 2, r + 0.15);
    props.cyl(0.5, 0.5, r * 2.6, 0x55595c, 0, 1.2, 0, 0, 0, PI / 2, 10);
    addBoxCol(x, 0, z, r * 1.8, h, r * 1.8);
  }
  function hedgehog(x, z) {  // 反戰車拒馬
    props.setBase(x, 0, z, R() * 6, 1);
    props.box(0.4, 0.4, 4.4, 0x4a3a30, 0, 1.3, 0, 0.62, 0, 0);
    props.box(0.4, 0.4, 4.4, 0x4a3a30, 0, 1.3, 0, -0.62, 1.05, 0);
    props.box(0.4, 0.4, 4.4, 0x4a3a30, 0, 1.3, 0, -0.62, -1.05, 0);
    props.clearBase();
    addBoxCol(x, 0, z, 2.6, 2.2, 2.6);
  }
  function bunker(x, z, q) {  // 沙包碉堡
    props.setBase(x, 0, z, q * PI / 2, 1);
    props.bev(5.4, 2.6, 4.2, 0x8a8a80, 0, 1.3, 0, 0, 0, 0, 0.3);
    props.bev(6.0, 0.5, 4.8, 0x6e6e66, 0, 2.8, 0, 0, 0, 0, 0.15);
    props.box(3.6, 0.5, 0.3, 0x0a0a0a, 0, 1.7, 2.1);
    for (let i = -3; i <= 3; i++) for (let j = 0; j < 2; j++) props.sph(0.62, j ? 0x9a8a62 : 0x8a7a56,
        i * 0.95 + j * 0.45, 0.35 + j * 0.55, 3.0, 1, 0.6, 0.8);
    props.clearBase();
    if (q % 2) addBoxCol(x, 0, z, 6.6, 3.1, 6.0);
    else addBoxCol(x, 0, z, 6.0, 3.1, 6.6);
  }
  function billboard(x, z, alongX) {  // 破損的大型廣告看板
    props.setBase(x, 0, z, alongX ? 0 : PI / 2, 1, 0, rr(-0.05, 0.05));
    for (const o of [-3.6, 3.6]) props.cyl(0.3, 0.36, 12, 0x3a3d40, o, 6, 0, 0, 0, 0, 8);
    props.bev(11, 5.4, 0.5, 0x2a2e33, 0, 12.5, 0, 0, 0, 0, 0.1);
    const ad = rp([[0x2a7a8a, 0xe0b040], [0x8a2a3a, 0xe8e0d0], [0x3a6a3a, 0xf0c060]]);
    props.box(10.2, 4.6, 0.1, ad[0], 0, 12.5, 0.28);
    props.box(10.2, 1.2, 0.12, ad[1], 0, 11.6, 0.3);
    props.box(3.0, 2.2, 0.12, ad[1], -3.0, 13.3, 0.3);
    props.box(4, 3, 0.14, 0x15171a, 3.4, 13.4, 0.3, 0, 0, 0.3);
    for (let i = -2; i <= 2; i++) props.gbox(0.5, 0.16, 0.2, 0xfff0c0, i * 2.2, 15.5, 0.5);
    props.clearBase();
    for (const o of [-3.6, 3.6]) {
      if (alongX) addBoxCol(x + o, 0, z, 1, 10, 1);
      else addBoxCol(x, 0, z + o, 1, 10, 1);
    }
    if (alongX) addBoxCol(x, 9.8, z, 11, 5.4, 0.8);
    else addBoxCol(x, 9.8, z, 0.8, 5.4, 11);
  }
  function waterTower(x, z) {  // 水塔
    props.setBase(x, 0, z, R() * 6, 1);
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.box(0.45, 13, 0.45, 0x4a4038, ax * 2.6, 6.5,
        az * 2.6, az * 0.06, 0, -ax * 0.06);
    for (let j = 0; j < 3; j++) {
      props.box(5.4, 0.25, 0.25, 0x3a322c, 0, 3 + j * 4, 2.5);
      props.box(5.4, 0.25, 0.25, 0x3a322c, 0, 3 + j * 4, -2.5);
      props.box(0.25, 0.25, 5.4, 0x3a322c, 2.5, 3 + j * 4, 0);
      props.box(0.25, 0.25, 5.4, 0x3a322c, -2.5, 3 + j * 4, 0);
    }
    props.cyl(3.8, 3.8, 5.2, 0x7a4a3a, 0, 15.6, 0, 0, 0, 0, 16);
    props.cyl(0.4, 3.9, 1.8, 0x5a3a2e, 0, 19.1, 0, 0, 0, 0, 16);
    for (let j = 0; j < 3; j++) props.cyl(3.9, 3.9, 0.3, 0x3a2a22, 0, 13.6 + j * 2, 0, 0, 0, 0, 16);
    props.cyl(0.3, 0.3, 13, 0x55595c, 0, 6.5, 0, 0, 0, 0, 8);
    props.clearBase();
    addBoxCol(x, 0, z, 6.4, 13, 6.4);
    addBoxCol(x, 13, z, 7.8, 7, 7.8);
  }
  function pylon(x, z) {  // 高壓電塔
    props.setBase(x, 0, z, R() < 0.5 ? 0 : PI / 2, 1, 0, rr(-0.04, 0.04));
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.box(0.4, 30, 0.4, 0x5a5e62, ax * 1.5,
        15, az * 1.5, az * 0.04, 0, -ax * 0.04);
    for (let j = 1; j < 7; j++) {
      const w2 = 3.4 - j * 0.3;
      props.box(w2, 0.2, 0.2, 0x4a4e52, 0, j * 4.2, w2 / 2);
      props.box(w2, 0.2, 0.2, 0x4a4e52, 0, j * 4.2, -w2 / 2);
      props.box(0.2, 0.2, w2, 0x4a4e52, w2 / 2, j * 4.2, 0);
      props.box(0.2, 0.2, w2, 0x4a4e52, -w2 / 2, j * 4.2, 0);
    }
    [20, 25, 29.5].forEach((y, k) => {
      const w2 = 13 - k * 3;
      props.box(w2, 0.4, 0.4, 0x5a5e62, 0, y, 0);
      for (const o of [-1, 1]) props.cyl(0.18, 0.18, 1.6, 0x2a4a5a, o * (w2 / 2 - 0.4), y - 1, 0, 0, 0, 0, 6);
    });
    props.clearBase();
    addBoxCol(x, 0, z, 3.6, 30, 3.6);
  }
  // 塔式起重機（遠處就看得到的地標）
  // 先只記下位置；等整張地圖都蓋完，再由 buildCrane 挑一個吊臂不會插進大樓的方向
  const cranes = [];
  function crane(x, z) {
    cranes.push({ x, z });
  }
  function buildCrane(x, z) {
    if (roofAt(x, z, 3.6) > 0.5) return;                  // 基座位置已經有別的東西：不放
    // 從隨機方向開始試 16 個角度，找吊臂、配重臂、吊鉤都碰不到建築的方向
    const start = R() * TAU;
    let rot = null;
    for (let k = 0; k < 16 && rot === null; k++) {
      const a = start + k / 16 * TAU, s = Math.sin(a), c = Math.cos(a);
      let ok = true;
      // 吊臂（往前 37 公尺）：下方建築不能高過 46；吊鉤附近要更空（不能高過 24）
      for (let t = 3; t <= 37 && ok; t += 3) {
        if (roofAt(x + s * t, z + c * t, 2.5) > (Math.abs(t - 26) < 4 ? 24 : 46)) ok = false;
      }
      // 配重臂（往後 16 公尺）
      for (let t = 3; t <= 16 && ok; t += 3) {
        if (roofAt(x - s * t, z - c * t, 3) > 46) ok = false;
      }
      if (ok) rot = a;
    }
    if (rot === null) return;                              // 四周都被高樓擋住：這裡不放吊車
    props.setBase(x, 0, z, rot, 1);
    props.bev(6, 1.2, 6, 0x4a4a48, 0, 0.6, 0, 0, 0, 0, 0.2);
    props.box(2.2, 48, 2.2, 0xc8a020, 0, 24.6, 0);
    for (let j = 0; j < 12; j++) props.box(2.4, 0.3, 2.4, 0x6a5810, 0, 2.5 + j * 4, 0);
    props.bev(3.2, 2.6, 3.6, 0xd8d0c0, 0, 49.5, 0, 0, 0, 0, 0.2);
    props.box(2.6, 1.2, 0.1, 0x0c0e10, 0, 49.8, 1.82);
    props.box(1.4, 1.6, 40, 0xc8a020, 0, 51.6, 16);
    props.box(1.4, 1.6, 12, 0xc8a020, 0, 51.6, -9);
    props.bev(3, 2.4, 3.4, 0x55595c, 0, 50.8, -13.5, 0, 0, 0, 0.2);
    for (let j = 0; j < 9; j++) props.box(1.5, 0.3, 0.3, 0x6a5810, 0, 52.4, 1 + j * 4.2);
    props.box(0.5, 6, 0.5, 0xc8a020, 0, 54.5, 0);
    props.box(0.12, 0.12, 20, 0x2a2a2a, 0, 56, 9, -0.26, 0, 0);
    props.box(0.1, 22, 0.1, 0x1a1a1a, 0, 40, 26);
    props.bev(1.2, 1.6, 1.2, 0x3a3a3a, 0, 28.5, 26, 0, 0, 0, 0.1);
    props.clearBase();
    // 碰撞：塔身一根、吊臂與配重臂沿線排一串小方塊（吊臂是斜的，用小方塊近似）、吊鉤一塊
    addBoxCol(x, 0, z, 2.8, 52, 2.8);
    const s = Math.sin(rot), c = Math.cos(rot);
    for (let t = -15; t <= 36; t += 2.5) addBoxCol(x + s * t, 50.4, z + c * t, 3, 2.8, 3);
    addBoxCol(x + s * 26, 27.4, z + c * 26, 1.8, 2.4, 1.8);
  }
  // 記下一個油桶的位置（油桶本身由 game.js 建立，因為它會爆炸）
  const barrelAt = (x, z) => WORLD.barrelSpots.push({ x, z });

  // ---------------- 街區 ----------------
  // 高樓街區：幾棟高樓
  function blockTowers(cx, cz) {
    for (const ox of [-21.5, 21.5]) for (const oz of [-21.5, 21.5]) {
      if (R() < 0.16) {
        rubblePile(cx + ox, cz + oz, 12, 22);
        if (R() < 0.5) barrelAt(cx + ox + rr(-4, 4), cz + oz + rr(-4, 4));
        continue;
      }
      building(cx + ox + rr(-1, 1), cz + oz + rr(-1, 1), rr(22, 31), rr(22, 31), rr(22, 98));
    }
  }
  // 混合街區：中矮建築 + 街道雜物
  function blockMixed(cx, cz) {
    const w = rr(40, 54), d = rr(40, 54), ox = (76 - w) / 2 * (R() < 0.5 ? -1 : 1) * 0.9,
        oz = (76 - d) / 2 * (R() < 0.5 ? -1 : 1) * 0.9;
    building(cx + ox, cz + oz, w, d, rr(18, 64));
    const fx = cx - Math.sign(ox) * 28, fz = cz - Math.sign(oz) * 28;
    if (R() < 0.5) container(fx, cz + rr(-20, 20), false);
    else car(fx, cz + rr(-20, 20), R() * 6);
    if (R() < 0.5) container(cx + rr(-20, 20), fz, true);
    else brokenWall(cx + rr(-10, 10), fz, rr(10, 18), true, rr(3, 7), C(rp(TINTS)));
    if (R() < 0.35) waterTower(fx, fz);
    else if (R() < 0.4) billboard(fx, fz, R() < 0.5);
    for (let i = 0; i < 2; i++) barrelAt(fx + rr(-4, 4), fz + rr(-4, 4));
  }
  // 廢墟街區：殘骸建築、斷牆、瓦礫
  function blockRuin(cx, cz) {
    const tint = C(rp(TINTS)), bs = R() < 0.4 ? fb : fa;
    // 街區中央一定有一棟被炸成塊狀的殘骸建築
    const w = rr(34, 46), d = rr(34, 46);
    bRuin(cx, cz, w, d, rr(12, 28), bs, tint);
    rubbleRing(cx, cz, w, d, 16);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + R(), dd = rr(28, 33), x = cx + clamp(Math.cos(a) * dd, -32, 32),
          z = cz + clamp(Math.sin(a) * dd, -32, 32), q = R();
      if (q < 0.4) brokenWall(x, z, rr(8, 15), R() < 0.5, rr(3, 7), tint);
      else if (q < 0.6) bunker(x, z, ri(0, 3));
      else if (q < 0.86) {
        hedgehog(x, z);
        hedgehog(x + rr(3, 5), z + rr(-2, 2));
      }
      else billboard(x, z, R() < 0.5);
    }
    rubblePile(cx + rr(-20, 20), cz + rr(-20, 20), 9, 14);
    if (R() < 0.6) barrelAt(cx + rr(-25, 25), cz + rr(-25, 25));
  }
  // 工業區：儲槽、貨櫃、起重機
  function blockIndustrial(cx, cz) {
    const ns = ri(2, 3);
    for (let i = 0; i < ns; i++) silo(cx - 24 + i * 20, cz - 24, rr(6, 8), rr(10, 17));
    bFrame(cx + 16, cz + 14, 34, 34, rr(26, 50), C(rp(TINTS)), fa);
    const nc = ri(3, 6);
    for (let i = 0; i < nc; i++) {
      const x = cx - 28 + (i % 3) * 7, z = cz + 6 + Math.floor(i / 3) * 15;
      container(x, z, false);
      if (R() < 0.3) container(x, z, false, 5.2);
    }
    for (let i = 0; i < 5; i++) barrelAt(cx + rr(-30, -8), cz + rr(-8, 30));
    if (R() < 0.6) fire(cx - 24, 16, cz - 24, 2);
    if (R() < 0.7) crane(cx - 33, cz - 6);
  }
  // 廣場：開闊的空地（central = 地圖正中央的出生點）
  function blockPlaza(cx, cz, central) {
    scorch(cx, cz, 22);
    scorch(cx + rr(-6, 6), cz + rr(-6, 6), 12);
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, d = rr(11, 17);
      rock(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rr(0.7, 2.4));
    }
    WORLD.wrecks.push({ x: cx + rr(-4, 4), z: cz + rr(-4, 4), rot: R() * TAU });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.6, d = 30;
      barrier(cx + Math.cos(a) * d, cz + Math.sin(a) * d, R() < 0.5);
    }
    if (!central) {
      container(cx + 26, cz - 26, R() < 0.5);
      if (R() < 0.6) container(cx - 26, cz + 22, R() < 0.5);
    }
    for (let i = 0; i < 3; i++) barrelAt(cx + rr(-30, 30), cz + rr(-30, 30));
    for (const [lx, lz] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) lamp(cx + lx, cz + lz, R() * 6);
    if (!central) {
      pylon(cx - 30, cz - 30);
      for (let i = 0; i < 3; i++) hedgehog(cx + rr(-26, 26), cz + rr(18, 30));
    }
  }

  // 把地圖切成 8 x 8 = 64 個街區，每格 100 公尺（中間 76 公尺是街區，其餘是馬路）
  // 正中央四格固定是出生廣場與比較低矮的街區，其他格依機率隨機挑一種街區
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) {
    const cx = -350 + bx * 100, cz = -350 + bz * 100, y = 0.1, h = 38;
    side.quad([cx - h, y, cz + h], [cx + h, y, cz + h], [cx + h, y, cz - h], [cx - h, y, cz - h], 0, 1, 0, 0,
        0, 9.5, 9.5, WHITE);
    const central = (bx === 3 || bx === 4) && (bz === 3 || bz === 4), t = R();
    if (central) {
      if (bx === 3 && bz === 3) blockPlaza(cx, cz, true);
      else if (t < 0.5) blockRuin(cx, cz);
      else blockMixed(cx, cz);
    }
    else if (t < 0.36) blockTowers(cx, cz);
    else if (t < 0.58) blockMixed(cx, cz);
    else if (t < 0.75) blockRuin(cx, cz);
    else if (t < 0.88) blockIndustrial(cx, cz);
    else blockPlaza(cx, cz, false);
  }

  // ---------------- 道路 ----------------
  for (let k = -3; k <= 3; k++) for (let i = 0; i < 8; i++) {
    const rc = k * 100, sc = -350 + i * 100, y = 0.04, hw = 10, hl = 38;
    // 南北向（沿 Z）
    lines.quad([rc - hw, y, sc + hl], [rc + hw, y, sc + hl], [rc + hw, y, sc - hl], [rc - hw, y, sc - hl], 0,
        1, 0, 0, 0, 1, 3, WHITE);
    // 東西向（沿 X）
    lines.quad([sc - hl, y, rc - hw], [sc - hl, y, rc + hw], [sc + hl, y, rc + hw], [sc + hl, y, rc - hw], 0,
        1, 0, 0, 0, 1, 3, WHITE);
    for (const vertical of [true, false]) {
      const n = ri(0, 3);
      for (let j = 0; j < n; j++) {
        const along = sc + rr(-30, 30), across = rc + rr(-8, 8), x = vertical ? across : along,
            z = vertical ? along : across;
        if (Math.hypot(x, z) < 26) continue;
        const q = R();
        if (q < 0.62) car(x, z, (vertical ? 0 : PI / 2) + rr(-0.5, 0.5) + (R() < 0.5 ? PI : 0), false);
        else if (q < 0.72) car(x, z, (vertical ? 0 : PI / 2) + rr(-0.3, 0.3), true);
        else if (q < 0.86) barrier(x, z, !vertical === (R() < 0.7));
        else {
          rubblePile(x, z, 5, 9);
        }
      }
      if (R() < 0.7) {
        const a = sc + rr(-30, 30), o = rc + (R() < 0.5 ? -11.5 : 11.5);
        lamp(vertical ? o : a, vertical ? a : o, vertical ? (o > rc ? -PI / 2 : PI / 2) : (o > rc ? PI : 0));
      }
      if (R() < 0.35) {
        const a = sc + rr(-30, 30), o = rc + rr(-6, 6);
        scorch(vertical ? o : a, vertical ? a : o, rr(4, 9));
      }
      if (R() < 0.18) {
        const a = sc + rr(-28, 28), o = rc + rr(-7, 7);
        barrelAt(vertical ? o : a, vertical ? a : o);
      }
    }
  }
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (R() < 0.3 &&
      (i || j)) scorch(i * 100 + rr(-5, 5), j * 100 + rr(-5, 5), rr(6, 12));

  // ---------------- 邊界：遠景高樓與空氣牆 ----------------
  for (let s = 0; s < 4; s++) {
    let t = -440;
    while (t < 440) {
      const w = rr(40, 72), h = rr(35, 130), dep = rr(34, 50), tint = C(rp(TINTS)), bs = R() < 0.4 ? fb : fa,
          m = t + w / 2, off = 398 + dep / 2 + 4;
      const x = s === 0 ? m : s === 1 ? m : s === 2 ? -off : off, z = s === 0 ? -off : s === 1 ? off : m;
      const sx = s < 2 ? w : dep, sz = s < 2 ? dep : w;
      wbox(bs, con, x, h / 2, z, sx, h, sz, tint, 0, 14, R());
      if (R() < 0.6) {
        const eh = rr(8, 30);
        wbox(bs, con, x + rr(-sx / 5, sx / 5), h + eh / 2, z + rr(-sz / 5, sz / 5), sx * rr(0.3, 0.6), eh,
            sz * rr(0.3, 0.6), tint, 0, 14, R());
      }
      t += w + rr(0, 6);
    }
  }
  addCollider(-440, 0, -440, 440, 400, -398);
  addCollider(-440, 0, 398, 440, 400, 440);
  addCollider(-440, 0, -440, -398, 400, 440);
  addCollider(398, 0, -440, 440, 400, 440);

  // 所有建築都蓋好了，現在才放吊車（這時才知道哪個方向是空的）
  for (const k of cranes) buildCrane(k.x, k.z);

  // ---------------- 組合成場景 ----------------
  const grp0 = WORLD.group = new THREE.Group();
  // mk：把一個幾何批次做成 Mesh 加進地圖
  const mk = (batch, mat, cast = true) => {
    if (!batch.count) return;
    const m = new THREE.Mesh(batch.build(), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    grp0.add(m);
    return m;
  };
  const M = WORLD.mats || (WORLD.mats = {
    fa: new THREE.MeshStandardMaterial({ map: TEX.facadeA, bumpMap: TEX.facadeA, bumpScale: 0.35,
        vertexColors: true, roughness: 0.93, metalness: 0 }),
    fb: new THREE.MeshStandardMaterial({ map: TEX.facadeB, bumpMap: TEX.facadeB, bumpScale: 0.35,
        vertexColors: true, roughness: 0.95, metalness: 0 }),
    con: new THREE.MeshStandardMaterial({ map: TEX.concrete, vertexColors: true, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ map: TEX.concrete, color: C(0x8a857c), roughness: 1, metalness: 0,
        flatShading: true }),
    ground: new THREE.MeshStandardMaterial({ map: TEX.ground, roughness: 0.96, metalness: 0 }),
    side: new THREE.MeshStandardMaterial({ map: TEX.sidewalk, vertexColors: true, roughness: 0.95,
        metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    lines: new THREE.MeshBasicMaterial({ map: TEX.roadLines, transparent: true, opacity: 0.5,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    dec: new THREE.MeshBasicMaterial({ map: TEX.scorch, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  });
  for (const m of Object.values(M)) if (m.map && m !== M.dec) m.envMapIntensity = 0.35;
  TEX.ground.repeat.set(40, 40);
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), M.ground);
  gm.rotation.x = -PI / 2;
  gm.receiveShadow = true;
  grp0.add(gm);
  mk(fa, M.fa);
  mk(fb, M.fb);
  mk(con, M.con);
  mk(side, M.side, false);
  mk(lines, M.lines, false);
  mk(dec, M.dec, false);
  props.into(grp0, MAT.prop);
  // 碎石（InstancedMesh）
  const im = new THREE.InstancedMesh(GEO.dod, M.rock, rocks.length), o = new THREE.Object3D();
  im.userData.shared = true;
  rocks.forEach((k, i) => {
    o.position.set(k.x, k.y, k.z);
    o.rotation.set(k.a, k.b, k.c);
    o.scale.set(k.s, k.s * k.f, k.s);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  grp0.add(im);
  // 墜毀的巨型機甲殘骸（地標）
  for (const w of WORLD.wrecks) {
    const rig = makeMech(pick(CHASSIS), WRECK_PAINT, pick(PRIMARIES).id, pick(SECONDARIES).id, 1.25);
    rig.mat.roughness = 0.9;
    rig.mat.metalness = 0.35;
    rig.root.rotation.order = 'YXZ';
    rig.root.rotation.set(-PI / 2 + 0.06, w.rot, 0.1);
    rig.root.position.set(w.x, 2.1, w.z);
    rig.shoulder[0].rotation.x = -1.2;
    rig.shoulder[1].rotation.x = 0.4;
    rig.waist.rotation.y = 0.3;
    if (rig.thigh[0]) rig.thigh[0].rotation.x = -0.6;
    if (rig.mlegs[0]) rig.mlegs[0].up.rotation.x = -1.1;
    rig.root.traverse(q => {
      if (q.isMesh) q.userData.shared = true;
    });
    grp0.add(rig.root);
    const dx = -Math.sin(w.rot) * 6.5, dz = -Math.cos(w.rot) * 6.5;
    addBoxCol(w.x + dx, 0, w.z + dz, 9, 3.2, 9);
    fire(w.x + dx, 3.5, w.z + dz, 1.6);
  }
  scene.add(grp0);

  buildNav();
  drawMapCanvas();
}

// 小地圖底圖（1 像素 = 1 公尺）
// 把所有碰撞方塊由上往下畫成一張圖：越高的建築顏色越亮
function drawMapCanvas() {
  const S = 880, c = WORLD.mapCanvas || (WORLD.mapCanvas = mkCanvas(S, S)), x = c.getContext('2d'), o = WORLD.ext;
  x.fillStyle = '#0d1216';
  x.fillRect(0, 0, S, S);
  x.fillStyle = '#20272c';
  x.fillRect(o - 400, o - 400, 800, 800);
  x.fillStyle = '#161c20';
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) x.fillRect(o - 350 + bx * 100 - 38,
      o - 350 + bz * 100 - 38, 76, 76);
  for (const k of WORLD.colliders) {
    if (k.maxY < 2.4 || k.minY > 1 || k.maxY > 300) continue;
    const v = Math.round(clamp(70 + k.maxY * 1.6, 70, 190));
    x.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
    x.fillRect(o + k.minX, o + k.minZ, k.maxX - k.minX, k.maxZ - k.minZ);
  }
}

// ============================================================
//  天空、光照、霧
// ============================================================
// 太陽的方向（影子與天空上的太陽位置都用它）
const SKY = { sunDir: new THREE.Vector3(-0.55, 0.42, -0.35).normalize() };
// 天空球：一顆很大的球，內側用著色器畫出漸層天空、太陽與霧霾
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(0x2c3a4c).clone() }, hor: { value: C(0xc9a27a).clone() }, sunDir: { value: SKY.sunDir },
        sunCol: { value: new THREE.Color(1.0, 0.72, 0.42) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(hor, top, pow(h, 0.45));
        c = mix(c, hor * 0.55, clamp(-d.y * 4.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 4.0 + pow(s, 40.0) * 0.45 + pow(s, 5.0) * 0.22);
        // 簡易雲霧帶
        float b = sin(d.x * 9.0 + d.z * 5.0) * sin(d.z * 7.0 - d.x * 3.0);
        c *= 1.0 - 0.10 * smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.25, 0.7, h)) * (0.5 + 0.5 * b);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// 戰場的燈光：太陽光（會產生影子）+ 環境光 + 霧
function setupLights(scene) {
  const hemi = new THREE.HemisphereLight(C(0xbfcfe6), C(0x5a4a3a), 0.85);
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.68), 1.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -130;
  sc.right = 130;
  sc.top = 130;
  sc.bottom = -130;
  sc.near = 10;
  sc.far = 520;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.35;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.FogExp2(C(0xb39474).clone().multiplyScalar(0.8), 0.0031);
  return { hemi, sun };
}
