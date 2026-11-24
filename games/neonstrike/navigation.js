/*
 * 檔案導讀：敵人導航網格：把碰撞箱轉成 0.5 公尺的格子，提供 A* 尋路、路徑拉直、
 * 最近可走點與連通區域查詢。main.js 在每張地圖建好後呼叫 buildNavigation()。
 *
 * 每格存一個通行等級：0 = 大型角色（首領）也能通過、1 = 只有一般敵人能通過、2 = 阻擋。
 */
export const NAV_OPEN = 0;
export const NAV_NARROW = 1;
export const NAV_BLOCKED = 2;

const SQRT2 = Math.SQRT2;
// 八個方向與距離。
const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

// 建立導航格；格子大小 0.5 公尺。
export function createNavGrid({ half = 72, cell = 0.5, limit = half } = {}) {
  const size = Math.ceil((half * 2) / cell);
  const count = size * size;
  return {
    half,
    cell,
    size,
    limit,
    cls: new Uint8Array(count),
    comp: new Int32Array(count).fill(-1),
    componentSizes: [],
    mainComponent: -1,
    // A* 的暫存陣列重複使用，長時間遊玩也不會一直配置記憶體。
    g: new Float32Array(count),
    parent: new Int32Array(count),
    seen: new Uint32Array(count),
    closed: new Uint32Array(count),
    // 延後刪除會讓同一格放進去不只一次，所以佇列要留空間。
    heap: new Int32Array(count * 4),
    heapF: new Float32Array(count * 4),
    stamp: 0,
  };
}

// 場景座標換成格子編號。
export function cellIndex(grid, x, z) {
  const ix = Math.floor((x + grid.half) / grid.cell),
    iz = Math.floor((z + grid.half) / grid.cell);
  if (ix < 0 || iz < 0 || ix >= grid.size || iz >= grid.size) return -1;
  return iz * grid.size + ix;
}

// 格子編號換成中心座標。
export function cellCenter(grid, index) {
  const ix = index % grid.size,
    iz = (index - ix) / grid.size;
  return {
    x: -grid.half + (ix + 0.5) * grid.cell,
    z: -grid.half + (iz + 0.5) * grid.cell,
  };
}

// 這一格能不能走；大型敵人需要更寬的空間。
function passable(grid, index, large) {
  return index >= 0 && grid.cls[index] <= (large ? NAV_OPEN : NAV_NARROW);
}

// 這個位置能不能走。
export function isWalkable(grid, x, z, large = false) {
  return passable(grid, cellIndex(grid, x, z), large);
}

// 標出會讓身體卡進障礙的格子。overlaps(box, x, z, radius) 必須和角色用同一套身
// 體判定；radii = [大型半徑, 一般半徑]，已含安全距離。
export function rasterizeColliders(grid, colliders, overlaps, radii, area) {
  const [largeRadius, smallRadius] = radii;
  const { cell, half, size, cls, limit } = grid;
  const minI = area ? Math.max(0, Math.floor((area.minX + half) / cell)) : 0,
    maxI = area
      ? Math.min(size - 1, Math.floor((area.maxX + half) / cell))
      : size - 1,
    minJ = area ? Math.max(0, Math.floor((area.minZ + half) / cell)) : 0,
    maxJ = area
      ? Math.min(size - 1, Math.floor((area.maxZ + half) / cell))
      : size - 1;
  for (let j = minJ; j <= maxJ; j++)
    for (let i = minI; i <= maxI; i++) {
      const x = -half + (i + 0.5) * cell,
        z = -half + (j + 0.5) * cell,
        edge = Math.max(Math.abs(x), Math.abs(z));
      cls[j * size + i] =
        edge > limit - smallRadius
          ? NAV_BLOCKED
          : edge > limit - largeRadius
            ? NAV_NARROW
            : NAV_OPEN;
    }
  for (const box of colliders) {
    if (
      area &&
      (box.max.x < area.minX - largeRadius ||
        box.min.x > area.maxX + largeRadius ||
        box.max.z < area.minZ - largeRadius ||
        box.min.z > area.maxZ + largeRadius)
    )
      continue;
    const i0 = Math.max(
        minI,
        Math.floor((box.min.x - largeRadius + half) / cell),
      ),
      i1 = Math.min(maxI, Math.floor((box.max.x + largeRadius + half) / cell)),
      j0 = Math.max(minJ, Math.floor((box.min.z - largeRadius + half) / cell)),
      j1 = Math.min(maxJ, Math.floor((box.max.z + largeRadius + half) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const index = j * size + i;
        if (cls[index] === NAV_BLOCKED) continue;
        const x = -half + (i + 0.5) * cell,
          z = -half + (j + 0.5) * cell;
        if (overlaps(box, x, z, smallRadius)) cls[index] = NAV_BLOCKED;
        else if (cls[index] === NAV_OPEN && overlaps(box, x, z, largeRadius))
          cls[index] = NAV_NARROW;
      }
  }
}

// 把相連的區域編號，巡邏目標不會選到孤島。
export function labelComponents(grid) {
  const { size, cls, comp } = grid,
    queue = grid.heap;
  comp.fill(-1);
  grid.componentSizes = [];
  let best = -1,
    bestSize = 0;
  for (let start = 0; start < cls.length; start++) {
    if (cls[start] === NAV_BLOCKED || comp[start] >= 0) continue;
    const id = grid.componentSizes.length;
    let head = 0,
      tail = 0,
      total = 0;
    queue[tail++] = start;
    comp[start] = id;
    while (head < tail) {
      const index = queue[head++];
      total++;
      const ix = index % size,
        iz = (index - ix) / size;
      for (const [dx, dz] of NEIGHBORS) {
        const nx = ix + dx,
          nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const next = nz * size + nx;
        if (cls[next] === NAV_BLOCKED || comp[next] >= 0) continue;
        // 不可以從兩個擋住的角之間斜穿。
        if (
          dx &&
          dz &&
          (cls[iz * size + nx] === NAV_BLOCKED ||
            cls[nz * size + ix] === NAV_BLOCKED)
        )
          continue;
        comp[next] = id;
        queue[tail++] = next;
      }
    }
    grid.componentSizes.push(total);
    if (total > bestSize) {
      bestSize = total;
      best = id;
    }
  }
  grid.mainComponent = best;
}

// 這個位置屬於哪個區域。
export function componentAt(grid, x, z) {
  const index = cellIndex(grid, x, z);
  return index < 0 ? -1 : grid.comp[index];
}

// 一圈一圈往外找最近的可用格；找不到回傳 -1。
export function nearestWalkableIndex(
  grid,
  x,
  z,
  maxDistance = 4,
  large = false,
) {
  const start = cellIndex(grid, x, z);
  if (passable(grid, start, large)) return start;
  const { size, half, cell } = grid,
    cx = Math.floor((x + half) / cell),
    cz = Math.floor((z + half) / cell),
    rings = Math.ceil(maxDistance / cell);
  let best = -1,
    bestDistance = Infinity;
  for (let r = 1; r <= rings; r++) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = cx + dx,
          iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= size || iz >= size) continue;
        const index = iz * size + ix;
        if (!passable(grid, index, large)) continue;
        const distance = dx * dx + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}

// 最近可以站的位置。
export function nearestWalkable(grid, x, z, maxDistance = 4, large = false) {
  const index = nearestWalkableIndex(grid, x, z, maxDistance, large);
  return index < 0 ? null : cellCenter(grid, index);
}

// 保守的直線檢查，每 0.2 公尺取樣一次。
export function lineClear(grid, ax, az, bx, bz, large = false) {
  const dx = bx - ax,
    dz = bz - az,
    length = Math.hypot(dx, dz),
    steps = Math.max(1, Math.ceil(length / (grid.cell * 0.4)));
  let previous = -2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      index = cellIndex(grid, ax + dx * t, az + dz * t);
    if (index === previous) continue;
    previous = index;
    if (!passable(grid, index, large)) return false;
  }
  return true;
}

// 放進最小堆積。
function heapPush(grid, size, index, f) {
  const heap = grid.heap,
    heapF = grid.heapF;
  let i = size;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heapF[parent] <= f) break;
    heap[i] = heap[parent];
    heapF[i] = heapF[parent];
    i = parent;
  }
  heap[i] = index;
  heapF[i] = f;
  return size + 1;
}

// 取出最小的一個。
function heapPop(grid, size) {
  const heap = grid.heap,
    heapF = grid.heapF,
    top = heap[0],
    last = heap[size - 1],
    lastF = heapF[size - 1];
  size--;
  let i = 0;
  while (true) {
    let child = i * 2 + 1;
    if (child >= size) break;
    if (child + 1 < size && heapF[child + 1] < heapF[child]) child++;
    if (heapF[child] >= lastF) break;
    heap[i] = heap[child];
    heapF[i] = heapF[child];
    i = child;
  }
  heap[i] = last;
  heapF[i] = lastF;
  return top;
}

// 在格子上做 A* 搜尋，回傳平滑後的路徑點（不含起點）；到不了或搜尋太久就回傳
// null。
export function findPath(grid, sx, sz, tx, tz, options = {}) {
  const large = options.large === true,
    maxNodes = options.maxNodes ?? 30000;
  const start = nearestWalkableIndex(grid, sx, sz, 2.5, large);
  const goal = nearestWalkableIndex(grid, tx, tz, options.goalSnap ?? 5, large);
  if (start < 0 || goal < 0) return null;
  if (!large && grid.comp[start] !== grid.comp[goal]) return null;
  if (start === goal) return [cellCenter(grid, goal)];
  const { size, cls, g, parent, seen, closed } = grid,
    limitClass = large ? NAV_OPEN : NAV_NARROW;
  const stamp = ++grid.stamp;
  const gx = goal % size,
    gz = (goal - gx) / size;
  // 到終點的估計距離。
  const heuristic = (index) => {
    const ix = index % size,
      iz = (index - ix) / size,
      dx = Math.abs(ix - gx),
      dz = Math.abs(iz - gz);
    // 稍微高估，空曠地方的搜尋比較短。
    return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * 1.08;
  };
  let open = 0,
    expanded = 0;
  g[start] = 0;
  seen[start] = stamp;
  parent[start] = -1;
  open = heapPush(grid, open, start, heuristic(start));
  let found = false;
  while (open > 0) {
    const current = heapPop(grid, open);
    open--;
    if (closed[current] === stamp) continue;
    closed[current] = stamp;
    if (current === goal) {
      found = true;
      break;
    }
    if (++expanded > maxNodes) break;
    const ix = current % size,
      iz = (current - ix) / size,
      base = g[current];
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = ix + dx,
        nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const next = nz * size + nx;
      if (cls[next] > limitClass || closed[next] === stamp) continue;
      if (
        dx &&
        dz &&
        (cls[iz * size + nx] > limitClass || cls[nz * size + ix] > limitClass)
      )
        continue;
      // 只容得下瘦身體的格子成本高一點，路徑不會貼著牆。
      const score = base + cost + (cls[next] === NAV_NARROW ? 0.35 : 0);
      if (seen[next] === stamp && score >= g[next]) continue;
      seen[next] = stamp;
      g[next] = score;
      parent[next] = current;
      if (open < grid.heap.length)
        open = heapPush(grid, open, next, score + heuristic(next));
    }
  }
  if (!found) return null;
  const raw = [];
  for (let index = goal; index >= 0; index = parent[index]) {
    raw.push(index);
    if (index === start) break;
  }
  raw.reverse();
  // 拉直路徑：只保留打斷直線的轉角。
  const points = raw.map((index) => cellCenter(grid, index));
  const smooth = [];
  let anchor = { x: sx, z: sz },
    i = 1;
  while (i < points.length) {
    let far = i;
    while (
      far + 1 < points.length &&
      lineClear(
        grid,
        anchor.x,
        anchor.z,
        points[far + 1].x,
        points[far + 1].z,
        large,
      )
    )
      far++;
    smooth.push(points[far]);
    anchor = points[far];
    i = far + 1;
  }
  return smooth.length ? smooth : [points[points.length - 1]];
}

// 主要區域上平均分布的巡邏點。
export function samplePatrolPoints(grid, spacing = 7, random = Math.random) {
  const points = [],
    steps = Math.floor((grid.limit * 2) / spacing);
  for (let a = 0; a <= steps; a++)
    for (let b = 0; b <= steps; b++) {
      const x = -grid.limit + spacing * (a + 0.2 + random() * 0.6),
        z = -grid.limit + spacing * (b + 0.2 + random() * 0.6);
      const index = nearestWalkableIndex(grid, x, z, spacing * 0.45, false);
      if (index < 0 || grid.comp[index] !== grid.mainComponent) continue;
      const center = cellCenter(grid, index);
      points.push({
        x: center.x,
        z: center.z,
        open: grid.cls[index] === NAV_OPEN,
      });
    }
  return points;
}

// 在 (x, z) 周圍一圈、同一區域裡隨機找一點。
export function randomPointNear(
  grid,
  x,
  z,
  minRadius,
  maxRadius,
  component,
  random = Math.random,
  tries = 14,
) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const angle = random() * Math.PI * 2,
      distance = minRadius + random() * (maxRadius - minRadius);
    const index = nearestWalkableIndex(
      grid,
      x + Math.cos(angle) * distance,
      z + Math.sin(angle) * distance,
      1.5,
    );
    if (index < 0) continue;
    if (component >= 0 && grid.comp[index] !== component) continue;
    return cellCenter(grid, index);
  }
  return null;
}
