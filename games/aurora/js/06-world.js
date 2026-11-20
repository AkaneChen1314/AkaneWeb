/*
 * ============================================================
 *  06-world.js ── 碰撞世界與尋路
 * ------------------------------------------------------------
 *  畫面上看到的模型只是「外觀」，真正決定能不能走過去、子彈會不會
 *  被擋住的是這裡的「碰撞方塊」。地圖建造時，每放一個實體物件就會
 *  同時登記一個方塊（樓梯則是一階一個方塊）。
 *
 *    World  碰撞：移動推擠、地面高度、射線（子彈／視線）
 *    Nav    尋路：把地圖切成 1 公尺的格子，用 A* 演算法找路
 *
 *  所有方塊都是「軸對齊」的（不旋轉），所以計算非常快也不容易出錯。
 * ============================================================
 */

const World = {
  boxes: [], // 所有碰撞方塊
  half: 50, // 地圖半寬（地圖範圍是 -half ~ +half）

  // 重設世界（換地圖時呼叫）
  reset(half) {
    this.boxes = [];
    this.half = half;
  },

  /* 登記一個方塊。(cx, cy, cz) 是中心點，(w, h, d) 是寬高深。
   * opt.noWalk = true 表示電腦不會把它的頂面當成可以走的地面（例如牆頂）。 */
  addBox(cx, cy, cz, w, h, d, opt = {}) {
    const box = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: cy - h / 2, maxY: cy + h / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      noWalk: !!opt.noWalk,
      tag: opt.tag || null,
    };
    this.boxes.push(box);
    return box;
  },

  removeBox(box) {
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
  },

  /* ---------- 地面高度 ----------
   * 回傳 (x, z) 位置上「腳踩得到的最高表面」。
   * 只考慮不高於 腳底 y + 台階高度 的表面，所以矮台階會自動踏上去。 */
  groundAt(x, z, y, r = 0.26) {
    const limit = y + CONFIG.BODY.step + 0.001;
    let ground = 0;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY <= ground || b.maxY > limit) continue;
      // 圓形腳掌與方塊的俯視重疊判斷
      const dx = x - Util.clamp(x, b.minX, b.maxX);
      const dz = z - Util.clamp(z, b.minZ, b.maxZ);
      if (dx * dx + dz * dz < r * r) ground = b.maxY;
    }
    return ground;
  },

  // 頭頂上方最近的天花板高度（跳躍撞頭用）；沒有就回傳 Infinity
  ceilingAt(x, z, headY, r = 0.3) {
    let ceil = Infinity;
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.minY < headY - 0.1 || b.minY >= ceil) continue;
      const dx = x - Util.clamp(x, b.minX, b.maxX);
      const dz = z - Util.clamp(z, b.minZ, b.maxZ);
      if (dx * dx + dz * dz < r * r) ceil = b.minY;
    }
    return ceil;
  },

  /* ---------- 水平碰撞 ----------
   * 把圓柱形的身體從所有重疊的方塊裡「推出來」。
   * pos 會被直接修改；回傳是否發生碰撞。 */
  collide(pos, r, h) {
    const stepTop = pos.y + CONFIG.BODY.step; // 低於這個高度的方塊可以直接踏上去，不擋路
    const headTop = pos.y + h;
    let hit = false;
    const boxes = this.boxes;

    for (let pass = 0; pass < 2; pass++) { // 做兩輪，處理同時卡到兩面牆的轉角
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.maxY <= stepTop || b.minY >= headTop) continue;

        const cx = Util.clamp(pos.x, b.minX, b.maxX);
        const cz = Util.clamp(pos.z, b.minZ, b.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;

        if (d2 > 1e-8) {
          // 圓心在方塊外：沿著最近點的方向推開
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          // 圓心在方塊內：從最近的一面推出去
          const toMinX = pos.x - b.minX, toMaxX = b.maxX - pos.x;
          const toMinZ = pos.z - b.minZ, toMaxZ = b.maxZ - pos.z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) pos.x = b.minX - r;
          else if (m === toMaxX) pos.x = b.maxX + r;
          else if (m === toMinZ) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
    }

    // 地圖邊界
    const lim = this.half - r;
    pos.x = Util.clamp(pos.x, -lim, lim);
    pos.z = Util.clamp(pos.z, -lim, lim);
    return hit;
  },

  /* ---------- 身體物理（玩家與電腦共用） ----------
   * body 需要有：pos、vel（THREE.Vector3）、radius、height、onGround
   * 回傳這一步發生的事件："land"（落地）或 null */
  stepBody(body, dt) {
    const pos = body.pos;
    const vel = body.vel;
    let event = null;

    // 水平移動：切成小步，避免高速時穿過薄牆
    const dist = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.18));
    body.hitWall = false;
    for (let i = 0; i < steps; i++) {
      pos.x += (vel.x * dt) / steps;
      pos.z += (vel.z * dt) / steps;
      if (this.collide(pos, body.radius, body.height)) body.hitWall = true;
    }

    // 垂直移動
    const ground = this.groundAt(pos.x, pos.z, pos.y);
    if (body.onGround) {
      if (ground >= pos.y - 0.45) {
        pos.y = ground; // 貼著地面（上下樓梯）
        vel.y = 0;
      } else {
        body.onGround = false; // 走出平台邊緣，開始下墜
      }
    }
    if (!body.onGround) {
      vel.y -= CONFIG.MOVE.gravity * dt;
      pos.y += vel.y * dt;
      if (vel.y > 0) {
        // 上升中：撞到天花板就停止上升
        const ceil = this.ceilingAt(pos.x, pos.z, pos.y + body.height - vel.y * dt);
        if (pos.y + body.height > ceil) {
          pos.y = ceil - body.height;
          vel.y = 0;
        }
      } else {
        const g2 = this.groundAt(pos.x, pos.z, pos.y);
        if (pos.y <= g2) {
          pos.y = g2;
          if (vel.y < -4) event = "land";
          vel.y = 0;
          body.onGround = true;
        }
      }
    }
    return event;
  },

  /* ---------- 射線 ----------
   * 從 (ox,oy,oz) 沿方向 (dx,dy,dz) 射出，最遠 maxDist。
   * 打到東西時回傳距離並把詳細資料寫進 out：
   *   out.x/y/z 命中點   out.nx/ny/nz 表面法線   out.box 命中的方塊（地面為 null）
   * 沒打到回傳 Infinity。 */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out) {
    // 避免除以零
    if (Math.abs(dx) < 1e-9) dx = 1e-9;
    if (Math.abs(dy) < 1e-9) dy = 1e-9;
    if (Math.abs(dz) < 1e-9) dz = 1e-9;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;

    let best = maxDist;
    let bestBox = null;
    let bestAxis = -1;
    const boxes = this.boxes;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      // 「平板法」：分別算射線進出 X、Y、Z 三組平面的時間
      let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      let axis = 0;

      t1 = (b.minY - oy) * iy;
      t2 = (b.maxY - oy) * iy;
      const tyMin = Math.min(t1, t2), tyMax = Math.max(t1, t2);
      if (tyMin > tmin) {
        tmin = tyMin;
        axis = 1;
      }
      if (tyMax < tmax) tmax = tyMax;
      if (tmin > tmax) continue;

      t1 = (b.minZ - oz) * iz;
      t2 = (b.maxZ - oz) * iz;
      const tzMin = Math.min(t1, t2), tzMax = Math.max(t1, t2);
      if (tzMin > tmin) {
        tmin = tzMin;
        axis = 2;
      }
      if (tzMax < tmax) tmax = tzMax;
      if (tmin > tmax) continue;

      // tmin <= 0 表示起點在方塊裡面或方塊在背後，忽略
      if (tmin > 0 && tmin < best) {
        best = tmin;
        bestBox = b;
        bestAxis = axis;
      }
    }

    // 地面（y = 0 的平面）
    if (dy < 0) {
      const t = -oy * iy;
      if (t > 0 && t < best) {
        best = t;
        bestBox = null;
        bestAxis = 3;
      }
    }

    if (bestAxis < 0) return Infinity;
    if (out) {
      out.x = ox + dx * best;
      out.y = oy + dy * best;
      out.z = oz + dz * best;
      out.nx = bestAxis === 0 ? -Math.sign(dx) : 0;
      out.ny = bestAxis === 1 ? -Math.sign(dy) : bestAxis === 3 ? 1 : 0;
      out.nz = bestAxis === 2 ? -Math.sign(dz) : 0;
      out.box = bestBox;
      out.dist = best;
    }
    return best;
  },

  // 兩點之間有沒有被擋住（true = 看得到對方）
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.01) return true;
    return this.raycast(ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.05, null) === Infinity;
  },
};

/* ============================================================
 *  Nav ── 導航格與 A* 尋路
 * ------------------------------------------------------------
 *  build() 會掃過整張地圖，替每一格記錄：
 *    h[i]    這一格的地面高度（可以是屋頂或樓梯）
 *    ok[i]   能不能站人，而且從出生點走得到
 *    wide[i] 周圍一圈都能站（給體型大的首領用）
 *  相鄰兩格高度差小於 0.65 公尺才算相通，所以電腦會乖乖走樓梯。
 * ============================================================ */
const Nav = {
  cols: 0,
  rows: 0,
  origin: 0, // 第 0 格的世界座標（= -half）
  h: null,
  ok: null,
  wide: null,
  coverCells: [], // 緊鄰障礙物的格子（找掩體用）
  openCells: [], // 所有可走格子的清單（隨機選點用）
  highCells: [], // 走得到的高處（屋頂、平台），狙擊手會優先佔領
  MAX_STEP: 0.65,

  // A* 用的工作陣列（重複使用，不必每次配置）
  _g: null, _parent: null, _stamp: null, _stampId: 0,

  // 世界座標 → 格子編號（超出地圖回傳 -1）
  idx(x, z) {
    const c = Math.floor(x - this.origin);
    const r = Math.floor(z - this.origin);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  },

  cellX(i) {
    return this.origin + (i % this.cols) + 0.5;
  },
  cellZ(i) {
    return this.origin + Math.floor(i / this.cols) + 0.5;
  },

  // 這個世界座標能不能走
  walkable(x, z) {
    const i = this.idx(x, z);
    return i >= 0 && this.ok[i] === 1;
  },

  /* ---------- 建立導航格 ----------
   * seeds：一定走得到的起點（例如出生點）。從這些點「淹水」出去，
   * 淹不到的格子（封閉屋頂、箱子頂）就標記為不可走。 */
  build(seeds) {
    const half = World.half;
    this.origin = -half;
    this.cols = this.rows = half * 2;
    const n = this.cols * this.rows;
    this.h = new Float32Array(n);
    this.ok = new Uint8Array(n);
    this.wide = new Uint8Array(n);
    this._g = new Float32Array(n);
    this._parent = new Int32Array(n);
    this._stamp = new Uint32Array(n);
    const standable = new Uint8Array(n);
    const boxes = World.boxes;
    const R = 0.42; // 檢查身體淨空用的半徑

    // 第一步：每一格找「最高、且上方有足夠空間站人」的表面
    for (let i = 0; i < n; i++) {
      const x = this.cellX(i), z = this.cellZ(i);
      // 候選高度：地面 0，加上蓋住格子中心的方塊頂面
      const tops = [0];
      for (const b of boxes) {
        if (b.noWalk || b.maxY > 9) continue;
        if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) tops.push(b.maxY);
      }
      tops.sort((a, b2) => b2 - a); // 由高到低試
      for (const top of tops) {
        let clear = true;
        for (const b of boxes) {
          // 會擋到身體（腳踝以上、頭頂以下）的方塊
          if (b.maxY <= top + 0.45 || b.minY >= top + 1.75) continue;
          const dx = x - Util.clamp(x, b.minX, b.maxX);
          const dz = z - Util.clamp(z, b.minZ, b.maxZ);
          if (dx * dx + dz * dz < R * R) {
            clear = false;
            break;
          }
        }
        if (clear) {
          this.h[i] = top;
          standable[i] = 1;
          break;
        }
      }
    }
    // 貼著地圖邊界的格子不可走
    for (let i = 0; i < n; i++) {
      const c = i % this.cols, r = Math.floor(i / this.cols);
      if (c < 1 || r < 1 || c >= this.cols - 1 || r >= this.rows - 1) standable[i] = 0;
    }

    // 第二步：從起點淹水，只有走得到的格子才算 ok
    const queue = [];
    for (const s of seeds) {
      const i = this._nearestIn(standable, s.x, s.z, 8);
      if (i >= 0 && !this.ok[i]) {
        this.ok[i] = 1;
        queue.push(i);
      }
    }
    while (queue.length) {
      const i = queue.pop();
      const c = i % this.cols;
      for (const j of [i - 1, i + 1, i - this.cols, i + this.cols]) {
        if (j < 0 || j >= n || this.ok[j] || !standable[j]) continue;
        if (Math.abs((j % this.cols) - c) > 1) continue; // 不能從最右邊繞到下一列最左邊
        if (Math.abs(this.h[j] - this.h[i]) > this.MAX_STEP) continue;
        this.ok[j] = 1;
        queue.push(j);
      }
    }

    // 第三步：整理輔助清單
    this.coverCells = [];
    this.openCells = [];
    this.highCells = [];
    for (let i = 0; i < n; i++) {
      if (!this.ok[i]) continue;
      this.openCells.push(i);
      if (this.h[i] >= 2.5) this.highCells.push(i);
      let allOpen = true;
      let nearWall = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const j = i + dr * this.cols + dc;
          const blocked = !this.ok[j] || Math.abs(this.h[j] - this.h[i]) > 0.3;
          if (blocked) allOpen = false;
          if (!this.ok[j] && (dr === 0 || dc === 0)) nearWall = true;
        }
      }
      if (allOpen) this.wide[i] = 1;
      if (nearWall) this.coverCells.push(i);
    }
  },

  // 在指定的格子陣列裡，找離 (x, z) 最近的「可用」格子
  _nearestIn(layer, x, z, maxR) {
    const start = this.idx(
      Util.clamp(x, this.origin + 1, -this.origin - 1),
      Util.clamp(z, this.origin + 1, -this.origin - 1)
    );
    if (start < 0) return -1;
    if (layer[start]) return start;
    const c0 = start % this.cols, r0 = Math.floor(start / this.cols);
    let best = -1, bestD = Infinity;
    for (let ring = 1; ring <= maxR && best < 0; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue; // 只看這一圈的外框
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const j = r * this.cols + c;
          if (!layer[j]) continue;
          const d = dr * dr + dc * dc;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    return best;
  },

  // 離 (x, z) 最近的可走格子；wide = true 時找首領能走的寬格
  nearest(x, z, wide = false, maxR = 10) {
    return this._nearestIn(wide ? this.wide : this.ok, x, z, maxR);
  },

  /* ---------- 直線可走判斷 ----------
   * 沿著直線每 0.35 公尺取樣，中線加左右各一條（等於身體寬度），
   * 全部都落在可走格子上、而且高度連續，才算可以直接走過去。 */
  lineClear(x0, z0, x1, z1, wide = false) {
    const layer = wide ? this.wide : this.ok;
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;
    const steps = Math.ceil(dist / 0.35);
    const px = (-dz / dist) * 0.3, pz = (dx / dist) * 0.3; // 垂直方向的偏移

    for (let side = -1; side <= 1; side++) {
      let prevH = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const i = this.idx(x0 + dx * t + px * side, z0 + dz * t + pz * side);
        if (i < 0 || !layer[i]) return false;
        if (prevH !== null && Math.abs(this.h[i] - prevH) > this.MAX_STEP) return false;
        prevH = this.h[i];
      }
    }
    return true;
  },

  /* ---------- A* 尋路 ----------
   * 回傳從起點到終點的路徑點陣列 [{x, y, z}, ...]（已拉直簡化）；
   * 找不到路回傳 null。 */
  findPath(sx, sz, gx, gz, wide = false) {
    const layer = wide ? this.wide : this.ok;
    const start = this._nearestIn(layer, sx, sz, 6);
    const goal = this._nearestIn(layer, gx, gz, 12);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: gx, y: this.h[goal], z: gz }];

    const cols = this.cols;
    const g = this._g, parent = this._parent, stamp = this._stamp;
    const id = ++this._stampId; // 用「這次搜尋的編號」取代每次清空陣列
    const gc = goal % cols, gr = Math.floor(goal / cols);
    const heuristic = (i) => {
      const dc = Math.abs((i % cols) - gc), dr = Math.abs(Math.floor(i / cols) - gr);
      return Math.max(dc, dr) + 0.41 * Math.min(dc, dr); // 八方向距離
    };

    // 簡單的二元堆積：每次取出「預估總成本最低」的格子
    const heap = [];
    const heapF = [];
    const push = (i, f) => {
      let k = heap.length;
      heap.push(i);
      heapF.push(f);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= heapF[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        [heapF[p], heapF[k]] = [heapF[k], heapF[p]];
        k = p;
      }
    };
    const popMin = () => {
      const top = heap[0];
      const lastI = heap.pop(), lastF = heapF.pop();
      if (heap.length) {
        heap[0] = lastI;
        heapF[0] = lastF;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heapF[l] < heapF[m]) m = l;
          if (r < heap.length && heapF[r] < heapF[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          [heapF[m], heapF[k]] = [heapF[k], heapF[m]];
          k = m;
        }
      }
      return top;
    };

    stamp[start] = id;
    g[start] = 0;
    parent[start] = -1;
    push(start, heuristic(start));
    let found = false;
    let iterations = 0;

    while (heap.length && iterations++ < 9000) {
      const cur = popMin();
      if (cur === goal) {
        found = true;
        break;
      }
      const cc = cur % cols;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          if (nc < 0 || nc >= cols) continue;
          const nb = cur + dr * cols + dc;
          if (nb < 0 || nb >= layer.length || !layer[nb]) continue;
          if (Math.abs(this.h[nb] - this.h[cur]) > this.MAX_STEP) continue;
          // 斜走時兩個相鄰的直向格子都必須可走，避免切過牆角
          if (dr && dc) {
            const a = cur + dc, b = cur + dr * cols;
            if (!layer[a] || !layer[b]) continue;
            if (Math.abs(this.h[a] - this.h[cur]) > this.MAX_STEP || Math.abs(this.h[b] - this.h[cur]) > this.MAX_STEP)
              continue;
          }
          const cost = g[cur] + (dr && dc ? 1.414 : 1) + (this.wide[nb] ? 0 : 0.6); // 稍微偏好寬敞的路
          if (stamp[nb] === id && cost >= g[nb]) continue;
          stamp[nb] = id;
          g[nb] = cost;
          parent[nb] = cur;
          push(nb, cost + heuristic(nb));
        }
      }
    }
    if (!found) return null;

    // 從終點沿 parent 走回起點，得到完整的格子路徑
    const cells = [];
    for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();

    // 拉直：從目前的點出發，盡量直接連到最遠看得到的點
    const path = [];
    let at = 0;
    while (at < cells.length - 1) {
      let next = at + 1;
      for (let j = Math.min(cells.length - 1, at + 14); j > at + 1; j--) {
        if (this.lineClear(this.cellX(cells[at]), this.cellZ(cells[at]), this.cellX(cells[j]), this.cellZ(cells[j]), wide)) {
          next = j;
          break;
        }
      }
      const c = cells[next];
      path.push({ x: this.cellX(c), y: this.h[c], z: this.cellZ(c) });
      at = next;
    }
    return path;
  },

  /* ---------- 隨機選點 ---------- */

  // 在 (x, z) 周圍 minR~maxR 之間隨機找一個可走的點；找不到回傳 null
  randomNear(x, z, minR, maxR, wide = false) {
    const layer = wide ? this.wide : this.ok;
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Util.rand(minR, maxR);
      const i = this.idx(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (i >= 0 && layer[i]) return { x: this.cellX(i), y: this.h[i], z: this.cellZ(i) };
    }
    return null;
  },

  // 全地圖隨機一個可走的點
  randomPoint(wide = false) {
    for (let tries = 0; tries < 40; tries++) {
      const i = Util.pick(this.openCells);
      if (!wide || this.wide[i]) return { x: this.cellX(i), y: this.h[i], z: this.cellZ(i) };
    }
    const i = this.openCells[0];
    return { x: this.cellX(i), y: this.h[i], z: this.cellZ(i) };
  },

  // 把任意座標修正到最近的可走點（放補給、出生點時用）
  snap(x, z, wide = false) {
    const i = this.nearest(x, z, wide, 14);
    if (i < 0) return { x, y: 0, z };
    return { x: this.cellX(i), y: this.h[i], z: this.cellZ(i) };
  },
};
