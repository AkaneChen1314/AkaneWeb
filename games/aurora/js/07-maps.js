/*
 * ============================================================
 *  07-maps.js ── 地圖
 * ------------------------------------------------------------
 *    MapKit  場景零件庫：建築、樓梯、貨櫃、車輛、掩體、路燈、招牌…
 *            每個零件「畫出外觀」的同時也「登記碰撞方塊」。
 *    Maps    四張地圖的資料與建造程式，以及天空、燈光的設定。
 *
 *  重要規則（改地圖時請遵守，電腦才不會卡住）：
 *    1. 所有實體都是不旋轉的方塊，座標盡量用整數（對齊 1 公尺導航格）。
 *    2. 樓梯每階高 0.25、深 0.5；要上屋頂請用 roofStairs()，它會讓樓梯垂直靠著牆、
 *       最上面一階剛好接到屋頂。offset 不要太靠近轉角（屋頂四個角落有女兒牆會擋住）。
 *    3. 不要放高度介於 0.42～0.65 的矮物件（玩家跨不上去、電腦卻以為能走）。
 *    4. 隊伍 0 的基地在 +Z（南），隊伍 1 在 -Z（北）。
 *    5. 不要讓兩個方塊的面落在同一個平面上互相重疊（畫面會一閃一閃），錯開幾公分即可。
 * ============================================================
 */

class MapKit {
  constructor(pal, seed) {
    this.b = new Builder(); // 所有靜態外觀都加進這個建構器，最後合併
    this.pal = pal; // 這張地圖的色盤
    this.rnd = Util.seeded(seed);
    this.lights = []; // 點光源 { x, y, z, color, power }
    this.signs = []; // 文字招牌 { x, y, z, dir, w, h, text, color }
    this.barrels = []; // 爆炸桶位置 { x, z }
    this.extras = []; // 會動的物件與動畫 { obj, update(dt, t) }
    this.pads = []; // 跳躍板 { x, y, z, tx, ty, tz }
  }

  /* ---------- 基本實體 ---------- */

  // 實體方塊：(x, z) 是中心、y0 是底部高度。o.ghost = true 表示只有外觀沒有碰撞
  solid(x, y0, z, w, h, d, o = {}) {
    const m = o.m || "wall";
    // 牆面和飾板的底部稍微加深，牆腳才有「貼著地面」的陰影感（玻璃、發光體與矮平台不加）
    const ao = o.ao ?? ((m === "wall" || m === "trim") && h >= 1 ? 0.3 : 0);
    this.b.box(w, h, d, { p: [x, y0 + h / 2, z], c: o.c ?? this.pal.wall, m, e: o.e, ao });
    if (!o.ghost) World.addBox(x, y0 + h / 2, z, w, h, d, { noWalk: o.noWalk });
  }

  // 牆：頂端加一條壓頂、底部加一條踢腳，看起來比較不像單純的方塊
  wall(x, z, w, d, h, o = {}) {
    this.solid(x, 0, z, w, h, d, { noWalk: true, ...o });
    this.b.box(w + 0.12, 0.14, d + 0.12, { p: [x, h + 0.07, z], c: this.pal.dark, m: "trim" });
    this.b.box(w + 0.06, 0.3, d + 0.06, { p: [x, 0.15, z], c: this.pal.dark, m: "trim" });
  }

  // 地圖四周的圍牆
  perimeter(h, color) {
    const s = World.half;
    // 左右兩面比前後兩面短 2 公尺，四個角落才不會有兩面牆重疊（重疊的面會閃爍）
    for (const [x, z, w, d] of [[0, -s + 0.5, s * 2, 1], [0, s - 0.5, s * 2, 1], [-s + 0.5, 0, 1, s * 2 - 2], [s - 0.5, 0, 1, s * 2 - 2]]) {
      this.solid(x, 0, z, w, h, d, { c: color ?? this.pal.wall2, noWalk: true });
      // 牆頂壓條：左右兩面的稍微高 1 公分，跟前後兩面錯開
      const side = w < d; // 左右兩面
      this.b.box(w + (side ? 0.16 : 0.2), 0.3, d + (side ? 0 : 0.2), { p: [x, h + 0.15 + (side ? 0.01 : 0), z], c: this.pal.dark, m: "trim" });
      // 牆頂的發光線
      this.b.box(
        w > d ? w : 0.08,
        0.06,
        w > d ? 0.08 : d,
        {
          p: [x + (w > d ? 0 : Math.sign(-x) * 0.56), h - 0.5, z + (w > d ? Math.sign(-z) * 0.56 : 0)],
          c: this.pal.accent1,
          m: "glow",
          e: 1.2
        }
      );
    }
  }

  /* ---------- 樓梯 ----------
   * 從 (x, z) 出發往 dir 方向上升到高度 h。
   * dir：0 = 往 -Z、1 = 往 +X、2 = 往 +Z、3 = 往 -X。width 是樓梯寬度。 */
  stairs(x, z, dir, width, h, y0 = 0) {
    const [vx, vz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    const steps = Math.round(h / 0.25);
    for (let i = 0; i < steps; i++) {
      const cx = x + vx * (i + 0.5) * 0.5;
      const cz = z + vz * (i + 0.5) * 0.5;
      const sh = (i + 1) * 0.25;
      const w = vx ? 0.5 : width;
      const d = vx ? width : 0.5;
      this.solid(cx, y0, cz, w, sh, d, { c: this.pal.floor, m: "floor" });
      // 扶手的碰撞：每一階的兩側各一道和扶手一樣高（1 公尺）的隱形牆，不能從側面穿過扶手
      for (const side of [-1, 1]) {
        const rx = vx ? cx : x + side * (width / 2 - 0.04);
        const rz = vx ? z + side * (width / 2 - 0.04) : cz;
        World.addBox(rx, y0 + sh + 0.5, rz, vx ? 0.5 : 0.08, 1.0, vx ? 0.08 : 0.5, { noWalk: true });
      }
      // 每階前緣的防滑條：比階面窄一點、稍微內縮，才不會和階面的邊重疊而閃爍
      this.b.box(
        vx ? 0.06 : width - 0.08,
        0.02,
        vx ? width - 0.08 : 0.06,
        { p: [cx - vx * 0.2, y0 + sh + 0.01, cz - vz * 0.2], c: this.pal.dark, m: "trim" }
      );
    }
    // 外側扶手（純裝飾）：斜的欄杆加上幾根立柱
    const len = steps * 0.5;
    for (const side of [-1, 1]) {
      const ox = vx ? 0 : side * (width / 2 - 0.05);
      const oz = vx ? side * (width / 2 - 0.05) : 0;
      this.b.limb(
        [x + ox, y0 + 1.0, z + oz],
        [x + vx * len + ox, y0 + h + 1.0, z + vz * len + oz],
        0.035,
        { c: this.pal.dark, m: "metal", flat: true }
      );
      for (let t = 0; t <= 1.001; t += 0.5) {
        const px = x + vx * len * t + ox, pz = z + vz * len * t + oz;
        this.b.cyl(0.03, 0.03, 1.0, { p: [px, y0 + h * t + 0.5, pz], c: this.pal.dark, m: "metal", seg: 6 });
      }
    }
  }

  /* ---------- 通往屋頂的樓梯 ----------
   * 樓梯「垂直」靠在建築的某一面，最上面一階剛好貼著屋頂邊緣，
   * 走到頂就能直接往前走上屋頂（不必側身跨過去）。
   *   (bx, bz, w, d, h)  建築的中心、寬、深、高（和 building() 用同一組數字）
   *   side    "n" 北面(-Z)、"s" 南面(+Z)、"w" 西面(-X)、"e" 東面(+X)
   *   offset  沿著牆面離中心多遠（不要太靠近轉角，轉角有女兒牆會擋住） */
  roofStairs(bx, bz, w, d, h, side, offset = 0, width = 2.4) {
    const len = Math.round(h / 0.25) * 0.5; // 樓梯水平長度（每階 0.5 公尺）
    if (side === "s") this.stairs(bx + offset, bz + d / 2 + len, 0, width, h);
    if (side === "n") this.stairs(bx + offset, bz - d / 2 - len, 2, width, h);
    if (side === "e") this.stairs(bx + w / 2 + len, bz + offset, 3, width, h);
    if (side === "w") this.stairs(bx - w / 2 - len, bz + offset, 1, width, h);
  }

  /* ---------- 建築 ----------
   * 一棟可以上屋頂的實心建築：牆面、窗戶、屋頂女兒牆與霓虹飾條。
   * (x, z) 中心、w × d 佔地、h 高度。o.windows 是窗戶可能的發光色。 */
  building(x, z, w, d, h, o = {}) {
    const pal = this.pal;
    const rnd = this.rnd;
    this.solid(x, 0, z, w, h, d, { c: o.c ?? pal.wall });
    this.b.box(w + 0.16, 0.5, d + 0.16, { p: [x, 0.25, z], c: pal.dark, m: "trim" }); // 基座
    // 屋簷比屋頂高 3 公分、屋頂鋪面再高 3 公分，三個面錯開才不會互相閃爍
    this.b.box(w + 0.1, 0.15, d + 0.1, { p: [x, h - 0.045, z], c: pal.dark, m: "trim" }); // 屋簷
    this.b.box(w - 0.3, 0.06, d - 0.3, { p: [x, h + 0.03, z], c: pal.floor, m: "floor" }); // 屋頂鋪面

    // 屋頂四個角落的女兒牆（屋頂上的掩體）
    const pl = Math.min(3, w / 4, d / 4);
    // 每個角落是一個「L」形：一段沿 X、一段沿 Z。沿 Z 那段扣掉轉角的 0.4 公尺，
    // 兩段才不會重疊（重疊的面在同一平面上會一閃一閃）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const zRun = z + sz * (d / 2 - 0.4 - (pl - 0.4) / 2); // 沿 Z 那一段的中心
      this.solid(x + sx * (w / 2 - pl / 2), h, z + sz * (d / 2 - 0.2), pl, 1.0, 0.4, { c: pal.wall2, noWalk: true });
      this.solid(x + sx * (w / 2 - 0.2), h, zRun, 0.4, 1.0, pl - 0.4, { c: pal.wall2, noWalk: true });
      // 女兒牆的壓頂：兩段的高度與寬度都錯開一點，轉角處的面才不會疊在同一平面
      this.b.box(pl + 0.06, 0.06, 0.46, {
        p: [x + sx * (w / 2 - pl / 2), h + 1.03, z + sz * (d / 2 - 0.2)], c: pal.dark, m: "trim",
      });
      this.b.box(0.44, 0.05, pl - 0.4, { p: [x + sx * (w / 2 - 0.2), h + 1.025, zRun], c: pal.dark, m: "trim" });
      // 轉角的壁柱：比牆面凸出 4 公分，從基座一路到屋簷下
      this.b.box(0.5, h - 0.14, 0.5, {
        p: [x + sx * (w / 2 - 0.21), (h - 0.14) / 2, z + sz * (d / 2 - 0.21)], c: pal.wall2, m: "wall", ao: 0.3,
      });
    }
    this.b.box(w + 0.05, 0.1, d + 0.05, { p: [x, 1.05, z], c: pal.dark, m: "trim" }); // 窗台下的腰線
    // 屋頂設備：冷氣外機
    if (w > 8 && d > 8) {
      const ax = x + (rnd() - 0.5) * (w - 7), az = z + (rnd() - 0.5) * (d - 7);
      this.solid(ax, h, az, 1.6, 1.0, 1.2, { c: 0x6a7078, m: "trim" });
      this.b.cyl(0.4, 0.4, 0.04, { p: [ax, h + 1.02, az], c: 0x1a1c20, seg: 12 });
      this.b.torus(0.42, 0.04, { p: [ax, h + 1.03, az], r: [Math.PI / 2, 0, 0], c: 0x2c3038, seg: 14 });
    }

    // 四面的窗戶：亮的用發光材質，暗的用玻璃
    const colors = o.windows || [pal.accent1, pal.accent2, 0xffd9a0];
    const faces = [
      { ax: "x", fixed: z - d / 2 - 0.03, len: w, center: x },
      { ax: "x", fixed: z + d / 2 + 0.03, len: w, center: x },
      { ax: "z", fixed: x - w / 2 - 0.03, len: d, center: z },
      { ax: "z", fixed: x + w / 2 + 0.03, len: d, center: z },
    ];
    for (const f of faces) {
      const count = Math.floor((f.len - 1.6) / 2.4);
      for (let row = 0; 1.9 + row * 2.2 < h - 0.5; row++) {
        for (let i = 0; i < count; i++) {
          const t = f.center - ((count - 1) * 2.4) / 2 + i * 2.4;
          const y = 1.9 + row * 2.2;
          const lit = rnd() < (o.litRate ?? 0.45);
          const opt = lit
            ? { c: colors[Math.floor(rnd() * colors.length)], m: "glow", e: 0.55 + rnd() * 0.6 }
            : { c: 0x10161c, m: "metal" };
          const p = f.ax === "x" ? [t, y, f.fixed] : [f.fixed, y, t];
          const size = f.ax === "x" ? [1.3, 1.0, 0.06] : [0.06, 1.0, 1.3];
          this.b.box(size[0], size[1], size[2], { p, ...opt });
          // 窗框：下緣窗台、上緣窗楣、左右邊框（每一件凸出的深度都不同，面才不會重疊）
          const alongX = f.ax === "x";
          const bar = (len, tall, deep, dt, dy) => {
            const bp = alongX ? [p[0] + dt, y + dy, p[2]] : [p[0], y + dy, p[2] + dt];
            this.b.box(alongX ? len : deep, tall, alongX ? deep : len, { p: bp, c: pal.dark, m: "trim" });
          };
          bar(1.46, 0.08, 0.1, 0, -0.55);
          bar(1.42, 0.07, 0.09, 0, 0.54);
          bar(0.07, 1.02, 0.08, -0.69, 0);
          bar(0.07, 1.02, 0.08, 0.69, 0);
          if (lit) bar(1.3, 0.04, 0.07, 0, 0.22); // 亮著的窗：半拉下來的百葉窗
          else bar(0.05, 1.0, 0.075, 0, 0); // 暗著的窗：中間一條直框
        }
      }
    }
    // 屋簷下的霓虹飾條
    if (o.neon !== false) {
      const c = o.neon ?? pal.accent1;
      this.b.box(w + 0.2, 0.07, 0.07, { p: [x, h - 0.3, z - d / 2 - 0.1], c, m: "glow", e: 1.6 });
      this.b.box(w + 0.2, 0.07, 0.07, { p: [x, h - 0.3, z + d / 2 + 0.1], c, m: "glow", e: 1.6 });
      this.b.box(0.07, 0.07, d + 0.2, { p: [x - w / 2 - 0.1, h - 0.3, z], c, m: "glow", e: 1.6 });
      this.b.box(0.07, 0.07, d + 0.2, { p: [x + w / 2 + 0.1, h - 0.3, z], c, m: "glow", e: 1.6 });
    }
  }

  /* ---------- 掩體與小物件 ---------- */

  // 木箱／貨箱（s 是邊長）；y0 > 0 可以疊在別的箱子上
  crate(x, z, s = 1.2, o = {}) {
    const y0 = o.y0 || 0;
    const c = o.c ?? this.pal.crate;
    this.solid(x, y0, z, s, s, s, { c, m: "trim" });
    const e = 0.09; // 邊框粗細
    const dk = this.pal.dark;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // 四根直角柱（比橫邊框高 1 公分，避免轉角處的面重疊閃爍）
      this.b.box(
        e + 0.004,
        s + 0.04,
        e + 0.004,
        { p: [x + sx * (s / 2 - e / 2 + 0.012), y0 + s / 2, z + sz * (s / 2 - e / 2 + 0.012)], c: dk, m: "trim" }
      );
    }
    for (const sy of [0, 1]) for (const sd of [-1, 1]) {
      const y = y0 + (sy ? s - e / 2 + 0.01 : e / 2);
      // 上下橫邊框：X 方向和 Z 方向的稍微錯開 4 公釐
      this.b.box(s + 0.02, e, e, { p: [x, y, z + sd * (s / 2 - e / 2 + 0.01)], c: dk, m: "trim" });
      this.b.box(e - 0.008, e - 0.008, s + 0.01, { p: [x + sd * (s / 2 - e / 2 + 0.01), y, z], c: dk, m: "trim" });
    }
    // 四個側面各兩道橫板縫，其中一面貼一張淺色的貨運標籤；箱蓋上一道十字束帶
    for (const sd of [-1, 1]) {
      for (const fy of [0.36, 0.66]) {
        this.b.box(s - 2 * e, 0.025, 0.012, { p: [x, y0 + s * fy, z + sd * (s / 2 + 0.004)], c: dk, m: "trim" });
        this.b.box(0.012, 0.025, s - 2 * e, { p: [x + sd * (s / 2 + 0.004), y0 + s * fy, z], c: dk, m: "trim" });
      }
    }
    this.b.box(0.012, s * 0.2, s * 0.26, { p: [x + s / 2 + 0.006, y0 + s * 0.5, z - s * 0.12], c: 0xc9c2b0, m: "matte" });
    this.b.box(s - 2 * e, 0.012, 0.07, { p: [x, y0 + s + 0.006, z], c: dk, m: "trim" });
    this.b.box(0.07, 0.01, s - 2 * e, { p: [x, y0 + s + 0.005, z], c: dk, m: "trim" });
    if (o.glow) this.b.box(s * 0.4, 0.06, 0.02, { p: [x, y0 + s * 0.6, z + s / 2 + 0.012], c: o.glow, m: "glow" });
  }

  // 一堆箱子：兩個在下、一個疊在上面
  crateStack(x, z, dir = 0) {
    const [vx, vz] = dir % 2 ? [0, 1] : [1, 0];
    this.crate(x - vx * 0.65, z - vz * 0.65, 1.2);
    this.crate(x + vx * 0.65, z + vz * 0.65, 1.2, { c: this.pal.crate2 });
    this.crate(x - vx * 0.3, z - vz * 0.3, 1.0, { y0: 1.2, c: this.pal.crate2 });
  }

  // 水泥護欄（紐澤西護欄）：長 2.6、高 1.05
  barrier(x, z, dir = 0) {
    const along = dir % 2 === 0; // true = 沿 X 軸擺放
    const [w, d] = along ? [2.6, 0.6] : [0.6, 2.6];
    World.addBox(x, 0.525, z, w, 1.05, d);
    this.b.box(w, 0.35, d, { p: [x, 0.175, z], c: 0x9a9da1, m: "wall", ao: 0.35 });
    // 底座與上半之間的斜肩（比底座窄、比上半寬，看起來不會像兩塊積木疊在一起）
    this.b.box(along ? w - 0.02 : 0.47, 0.12, along ? 0.47 : d - 0.02, { p: [x, 0.4, z], c: 0xa2a5a9, m: "wall" });
    this.b.box(along ? w : 0.34, 0.7, along ? 0.34 : d, { p: [x, 0.7, z], c: 0xa9acb0, m: "wall" });
    // 警示色帶
    this.b.box(along ? w + 0.01 : 0.36, 0.14, along ? 0.36 : d + 0.01, { p: [x, 0.86, z], c: this.pal.hazard ?? 0xd9a520 });
    for (const s of [-1, 1]) {
      // 兩面各兩顆反光片，底座兩端各一個吊掛孔
      for (const t of [-0.7, 0.7]) {
        const px = along ? x + t : x + s * 0.176, pz = along ? z + s * 0.176 : z + t;
        this.b.box(along ? 0.16 : 0.012, 0.08, along ? 0.012 : 0.16, { p: [px, 0.62, pz], c: 0xff5a2a, m: "glow", e: 0.9 });
      }
      const hx = along ? x + s * 0.9 : x, hz = along ? z : z + s * 0.9;
      this.b.box(along ? 0.3 : d + 0.012, 0.1, along ? d + 0.012 : 0.3, { p: [hx, 0.06, hz], c: 0x2a2c30, m: "matte" });
    }
  }

  // 沙包牆：沿 dir 方向排 len 公尺
  sandbags(x, z, dir, len) {
    const along = dir % 2 === 0;
    World.addBox(x, 0.5, z, along ? len : 0.8, 1.0, along ? 0.8 : len);
    const n = Math.round(len / 0.7);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n - (row % 2); i++) {
        const t = -len / 2 + 0.35 + i * 0.7 + (row % 2) * 0.35;
        const tint = 0x8a7a55 + (Math.floor(this.rnd() * 3) << 16);
        this.b.rbox(
          along ? 0.68 : 0.5,
          0.3,
          along ? 0.5 : 0.68,
          0.12,
          { p: [x + (along ? t : 0), 0.17 + row * 0.31, z + (along ? 0 : t)], c: tint, m: "matte" }
        );
      }
    }
  }

  /* 貨櫃（6 × 2.6 × 2.4 公尺）；dir 偶數沿 X、奇數沿 Z；y0 > 0 可疊第二層。
   * 疊第二層時請放在「同一個位置」（或整個落在下層上面），不要只搭一半，否則看起來會懸空。
   * 外觀：烤漆箱體、兩個長邊的波浪板、八個角件、上下邊框、門端的兩扇門與鎖桿、側面的小編號牌。 */
  container(x, z, dir, color, y0 = 0) {
    const along = dir % 2 === 0;
    const [w, d] = along ? [6, 2.4] : [2.4, 6];
    const h = 2.6;
    const b = this.b;
    const dk = this.pal.dark;
    // 波浪板的凹槽色：比箱體暗一點
    const shade = ((((color >> 16) & 255) * 0.72) << 16) | ((((color >> 8) & 255) * 0.72) << 8) | ((color & 255) * 0.72);
    this.solid(x, y0, z, w, h, d, { c: color, m: "paint", ao: 0.35 });

    // 長邊的波浪板：一條一條凸起的直肋（只凸出 2.5 公分，不影響碰撞）
    const len = along ? w : d;
    for (let t = -len / 2 + 0.45; t < len / 2 - 0.3; t += 0.3) {
      for (const s of [-1, 1]) {
        const px = along ? x + t : x + s * (w / 2 + 0.012);
        const pz = along ? z + s * (d / 2 + 0.012) : z + t;
        b.box(along ? 0.14 : 0.025, h - 0.36, along ? 0.025 : 0.14, { p: [px, y0 + h / 2, pz], c: shade, m: "paint", ao: 0.3 });
      }
    }
    // 四根角柱：外緣和上下框錯開 5 公釐（在同一平面疊在一起會閃爍）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = x + sx * (w / 2 - 0.06), cz = z + sz * (d / 2 - 0.06);
      b.box(0.17, h + 0.04, 0.17, { p: [cx, y0 + h / 2, cz], c: dk, m: "metal" });
      // 上下各一個角件（吊掛與堆疊用的方塊）
      for (const y of [0.11, h - 0.11]) b.box(0.24, 0.2, 0.24, { p: [cx, y0 + y, cz], c: 0x8a9099, m: "metal" });
    }
    // 下框比上框窄 2 公分：疊兩層時，下層的上框和上層的下框才不會在同一平面閃爍
    b.box(w + 0.04, 0.14, d + 0.04, { p: [x, y0 + 0.06, z], c: dk, m: "metal" });
    b.box(w + 0.06, 0.14, d + 0.06, { p: [x, y0 + h - 0.06, z], c: dk, m: "metal" });

    // 門端：中間的門縫、四根鎖桿與把手、門框下緣的警示帶
    const ex = along ? w / 2 + 0.02 : 0, ez = along ? 0 : d / 2 + 0.02;
    b.box(along ? 0.03 : 0.05, h - 0.3, along ? 0.05 : 0.03, { p: [x + ex, y0 + h / 2, z + ez], c: dk, m: "metal" });
    for (const t of [-0.75, -0.25, 0.25, 0.75]) {
      const px = x + ex + (along ? 0.02 : t), pz = z + ez + (along ? t : 0.02);
      b.cyl(0.03, 0.03, h - 0.4, { p: [px, y0 + h / 2, pz], c: 0xb0b4b8, m: "metal", seg: 6 });
      b.box(along ? 0.05 : 0.22, 0.05, along ? 0.22 : 0.05, { p: [px, y0 + 1.15, pz], c: 0x8a9099, m: "metal" });
    }
    b.box(along ? 0.03 : d - 0.3, 0.14, along ? d - 0.3 : 0.03, {
      p: [x + ex, y0 + 0.24, z + ez], c: this.pal.hazard ?? 0xd9a520, m: "paint",
    });

    // 側面右上角的編號牌：深色底板加一小條識別燈（不再是一大塊發光的黃色）
    const tx = x + (along ? w / 2 - 1.0 : w / 2 + 0.03), tz = z + (along ? d / 2 + 0.03 : d / 2 - 1.0);
    b.box(along ? 1.1 : 0.03, 0.42, along ? 0.03 : 1.1, { p: [tx, y0 + h - 0.55, tz], c: 0x0c0d10 });
    b.box(along ? 0.8 : 0.036, 0.07, along ? 0.036 : 0.8, { p: [tx, y0 + h - 0.47, tz], c: this.pal.accent2, m: "glow", e: 1.1 });
    b.box(along ? 0.5 : 0.036, 0.05, along ? 0.036 : 0.5, { p: [tx, y0 + h - 0.62, tz], c: 0xd8dee8, m: "paint" });
  }

  // 柱子：方形實體 + 發光環
  pillar(x, z, s, h, glow) {
    this.solid(x, 0, z, s, h, s, { c: this.pal.wall2, noWalk: true });
    this.b.box(s + 0.3, 0.4, s + 0.3, { p: [x, 0.2, z], c: this.pal.dark, m: "trim" });
    this.b.box(s + 0.3, 0.4, s + 0.3, { p: [x, h - 0.22, z], c: this.pal.dark, m: "trim" }); // 頂部飾環比柱頂低 2 公分
    if (glow) {
      for (const y of [1.4, 2.6]) this.b.box(s + 0.06, 0.1, s + 0.06, { p: [x, y, z], c: glow, m: "glow", e: 1.6 });
    }
  }

  // 路燈：燈桿 + 燈臂 + 發光燈頭。light = true 時真的會照亮周圍
  lamp(x, z, h, color, light = true, dir = 0) {
    const [vx, vz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    World.addBox(x, h / 2, z, 0.3, h, 0.3, { noWalk: true });
    this.b.cyl(0.07, 0.11, h, { p: [x, h / 2, z], c: this.pal.dark, m: "metal", seg: 8 });
    this.b.cyl(0.18, 0.22, 0.3, { p: [x, 0.15, z], c: this.pal.dark, m: "metal", seg: 8 });
    this.b.limb([x, h - 0.1, z], [x + vx * 1.2, h + 0.1, z + vz * 1.2], 0.05, { c: this.pal.dark, m: "metal", flat: true });
    this.b.rbox(vx ? 0.7 : 0.3, 0.1, vx ? 0.3 : 0.7, 0.04, { p: [x + vx * 1.3, h + 0.1, z + vz * 1.3], c: this.pal.dark });
    this.b.box(
      vx ? 0.6 : 0.22,
      0.03,
      vx ? 0.22 : 0.6,
      { p: [x + vx * 1.3, h + 0.04, z + vz * 1.3], c: color, m: "glow", e: 3 }
    );
    if (light) this.lights.push({ x: x + vx * 1.3, y: h - 0.3, z: z + vz * 1.3, color, power: 60 });
  }

  // 霓虹招牌：貼在牆上的發光框，可以加文字。dir 是招牌面向的方向
  neon(x, y, z, dir, w, h, color, text) {
    const [vx, vz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    const along = vx === 0; // 面向 ±Z 時，招牌寬度沿 X
    this.b.box(along ? w + 0.2 : 0.12, h + 0.2, along ? 0.12 : w + 0.2, { p: [x, y, z], c: 0x0c0d10 });
    // 四邊的霓虹燈管
    const fx = x + vx * 0.08, fz = z + vz * 0.08;
    for (const sy of [-1, 1]) {
      this.b.box(along ? w : 0.05, 0.06, along ? 0.05 : w, { p: [fx, y + sy * (h / 2), fz], c: color, m: "glow", e: 2.2 });
    }
    for (const s of [-1, 1]) {
      this.b.box(
        along ? 0.06 : 0.05,
        h,
        along ? 0.05 : 0.06,
        { p: [fx + (along ? s * (w / 2) : 0), y, fz + (along ? 0 : s * (w / 2))], c: color, m: "glow", e: 2.2 }
      );
    }
    if (text) this.signs.push({ x: x + vx * 0.1, y, z: z + vz * 0.1, dir, w: w * 0.92, h: h * 0.8, text, color });
  }

  // 車輛：dir 偶數車頭朝 X、奇數朝 Z
  car(x, z, dir, color) {
    const along = dir % 2 === 0;
    World.addBox(x, 0.7, z, along ? 4.4 : 1.9, 1.4, along ? 1.9 : 4.4);
    const b = this.b;
    b.push(x, 0, z, along ? 0 : Math.PI / 2);
    b.rbox(4.4, 0.62, 1.9, 0.16, { p: [0, 0.6, 0], c: color }); // 車身
    b.rbox(2.3, 0.56, 1.7, 0.2, { p: [-0.2, 1.14, 0], c: color }); // 車艙
    b.box(2.1, 0.4, 1.72, { p: [-0.2, 1.16, 0], c: 0x0c1218, m: "metal" }); // 車窗（側面）
    b.box(2.32, 0.36, 1.5, { p: [-0.2, 1.16, 0], c: 0x0c1218, m: "metal" }); // 車窗（前後）
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.88, 0.88]) { // 四個輪子
      b.cyl(0.36, 0.36, 0.26, { p: [sx, 0.36, sz], r: [Math.PI / 2, 0, 0], c: 0x0b0b0c, m: "matte", seg: 14 });
      b.cyl(0.2, 0.2, 0.28, { p: [sx, 0.36, sz], r: [Math.PI / 2, 0, 0], c: 0x8a9099, m: "metal", seg: 10 });
    }
    for (const sz of [-0.6, 0.6]) { // 頭燈與尾燈
      b.box(0.05, 0.14, 0.4, { p: [2.2, 0.66, sz], c: 0xfff2c4, m: "glow", e: 2 });
      b.box(0.05, 0.12, 0.4, { p: [-2.2, 0.7, sz], c: 0xff2030, m: "glow", e: 2 });
    }
    b.box(4.42, 0.05, 1.92, { p: [0, 0.34, 0], c: this.pal.accent1, m: "glow", e: 0.7 }); // 底盤光
    b.pop();
  }

  // 卡車／雪地車：車頭 + 貨斗
  truck(x, z, dir, color) {
    const along = dir % 2 === 0;
    World.addBox(x, 1.3, z, along ? 6.6 : 2.5, 2.6, along ? 2.5 : 6.6);
    const b = this.b;
    b.push(x, 0, z, along ? 0 : Math.PI / 2);
    b.rbox(2.0, 1.9, 2.4, 0.15, { p: [2.2, 1.45, 0], c: color }); // 車頭
    b.box(0.06, 0.7, 1.9, { p: [3.21, 1.85, 0], c: 0x0c1218, m: "metal" }); // 擋風玻璃
    b.rbox(4.4, 1.9, 2.5, 0.08, { p: [-1.0, 1.55, 0], c: 0x3a4138 }); // 貨斗
    for (let i = 0; i < 5; i++) b.box(0.08, 1.8, 2.54, { p: [-2.8 + i * 0.9, 1.55, 0], c: 0x2a3028 }); // 貨斗肋條
    b.box(6.4, 0.3, 2.2, { p: [0, 0.6, 0], c: 0x1a1c20, m: "metal" }); // 底盤
    for (const sx of [-2.2, -0.9, 2.2]) for (const sz of [-1.1, 1.1]) {
      b.cyl(0.5, 0.5, 0.36, { p: [sx, 0.5, sz], r: [Math.PI / 2, 0, 0], c: 0x0b0b0c, m: "matte", seg: 14 });
    }
    for (const sz of [-0.8, 0.8]) b.box(0.05, 0.18, 0.4, { p: [3.22, 0.95, sz], c: 0xfff2c4, m: "glow", e: 2 });
    b.pop();
  }

  // 圓形儲槽：外觀是圓柱，碰撞是方塊
  tank(x, z, r, h, color) {
    World.addBox(x, h / 2, z, r * 1.8, h, r * 1.8, { noWalk: true });
    this.b.cyl(r, r, h, { p: [x, h / 2, z], c: color ?? 0xb9bfc6, m: "metal", seg: 20 });
    this.b.sphere(r, { p: [x, h, z], s: [1, 0.35, 1], c: color ?? 0xb9bfc6, m: "metal", seg: 20 });
    for (const y of [0.5, h * 0.5, h - 0.4])
      this.b.torus(r + 0.02, 0.05, { p: [x, y, z], r: [Math.PI / 2, 0, 0], c: this.pal.dark, m: "metal", seg: 24 });
    this.b.box(0.5, 0.5, 0.04, { p: [x, h * 0.6, z + r + 0.01], c: this.pal.hazard ?? 0xd9a520, m: "glow", e: 0.5 });
  }

  // 花台：矮牆裡種了灌木
  planter(x, z, w, d) {
    this.solid(x, 0, z, w, 1.1, d, { c: this.pal.wall2 });
    this.b.box(w - 0.3, 0.1, d - 0.3, { p: [x, 1.12, z], c: 0x2a2018, m: "matte" });
    const n = Math.max(2, Math.round(Math.max(w, d) / 0.9));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      this.b.sphere(
        0.42 + this.rnd() * 0.15,
        {
          p: [x + (w > d ? t * (w - 0.6) : 0), 1.4, z + (w > d ? 0 : t * (d - 0.6))],
          c: this.pal.plant ?? 0x1f5a34,
          m: "matte",
          seg: 8
        }
      );
    }
    this.b.box(w + 0.04, 0.05, d + 0.04, { p: [x, 0.5, z], c: this.pal.accent2, m: "glow", e: 0.8 });
    // 灌木的碰撞：站上花台時不會穿過灌木（也能當掩體擋子彈）
    World.addBox(x, 1.55, z, Math.max(0.5, w - 0.3), 0.9, Math.max(0.5, d - 0.3), { noWalk: true });
  }

  // 棚子：四根柱子撐起的頂棚，底下可以走
  canopy(x, z, w, d, h, color) {
    World.addBox(x, h + 0.1, z, w, 0.2, d, { noWalk: true });
    this.b.box(w, 0.16, d, { p: [x, h + 0.1, z], c: color ?? this.pal.crate2, m: "trim" });
    // 棚緣的一圈細燈條
    for (const s of [-1, 1]) {
      this.b.box(w + 0.1, 0.06, 0.06, { p: [x, h, z + s * (d / 2)], c: this.pal.accent1, m: "glow", e: 1.2 });
      this.b.box(0.06, 0.06, d + 0.1, { p: [x + s * (w / 2), h, z], c: this.pal.accent1, m: "glow", e: 1.2 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * (w / 2 - 0.2), pz = z + sz * (d / 2 - 0.2);
      World.addBox(px, h / 2, pz, 0.3, h, 0.3, { noWalk: true });
      this.b.cyl(0.07, 0.07, h, { p: [px, h / 2, pz], c: this.pal.dark, m: "metal", seg: 8 });
    }
  }

  // 能量屏障：半透明的實體牆（擋子彈也擋人）
  energyWall(x, z, w, d, h, color) {
    World.addBox(x, h / 2, z, w, h, d, { noWalk: true });
    this.b.box(w, h, d, { p: [x, h / 2, z], c: color, m: "pane" });
    this.b.box(w + 0.1, 0.25, d + 0.1, { p: [x, 0.125, z], c: this.pal.dark, m: "metal" });
    this.b.box(w + 0.04, 0.06, d + 0.04, { p: [x, 0.28, z], c: color, m: "glow", e: 2 });
    this.b.box(w + 0.04, 0.06, d + 0.04, { p: [x, h, z], c: color, m: "glow", e: 2 });
  }

  // 地面標線（貼在地上的薄片，純裝飾）
  mark(x, z, w, d, color, glow = false) {
    // 每多畫一條就高 4 公釐（最多錯開 4.8 公分），交叉的標線才不會在同一平面閃爍
    this.markLayer = ((this.markLayer || 0) + 1) % 12;
    const y = 0.012 + this.markLayer * 0.004;
    this.b.box(w, 0.02, d, { p: [x, y, z], c: color, m: glow ? "glow" : "paint", e: glow ? 1.1 : 1 });
  }

  // 架高的管線（純裝飾）：從 a 到 b，並在兩端加支架
  pipe(a, b2, r, color) {
    this.b.limb(a, b2, r, { c: color ?? 0x8a9099, m: "metal", flat: true });
    for (const p of [a, b2])
      this.b.torus(
        r + 0.03,
        0.04,
        { p, r: a[0] === b2[0] ? [0, 0, 0] : [0, Math.PI / 2, 0], c: this.pal.dark, m: "metal", seg: 12 }
      );
  }

  /* ============================================================
   *  動態場景：會動的物件、粒子特效
   * ------------------------------------------------------------
   *  dynamic(obj, update)：obj 會加進場景，update(dt, t) 每一幀被呼叫一次
   *  anim(update)        ：只有動畫、沒有物件（例如持續噴火）
   * ============================================================ */
  dynamic(obj, update) {
    this.extras.push({ obj, update });
    return obj;
  }

  anim(update) {
    this.extras.push({ obj: null, update });
  }

  // 只有離鏡頭夠近時才噴粒子（遠處看不到，省效能）
  _near(x, z, range = 85) {
    const c = Scene3D.camera.position;
    return Math.abs(c.x - x) + Math.abs(c.z - z) < range;
  }

  // 火焰：持續噴出火焰粒子、往上飄的黑煙與火星；會加一盞閃爍的火光
  fire(x, y, z, scale = 1, light = true) {
    let flame = this.rnd(), smoke = 0, ember = 0;
    const fc = new THREE.Color(0xff6a1a), ec = new THREE.Color(0xffb347), sc = new THREE.Color(0x231c18);
    this.anim((dt) => {
      if (!this._near(x, z)) return;
      flame += dt * 30 * scale;
      smoke += dt * 4 * scale;
      ember += dt * 6 * scale;
      for (; flame > 1; flame--) {
        FX.glow.emit({
          x: x + Util.rand(-0.4, 0.4) * scale, y: y + Util.rand(0, 0.25), z: z + Util.rand(-0.4, 0.4) * scale,
          vx: Util.rand(-0.3, 0.3), vy: Util.rand(1.4, 2.8) * scale, vz: Util.rand(-0.3, 0.3),
          life: Util.rand(0.35, 0.75), size: 0.55 * scale, size1: 0.06, color: fc, bright: 2.2, drag: 0.6,
        });
      }
      for (; smoke > 1; smoke--) {
        FX.smoke.emit({
          x: x + Util.rand(-0.3, 0.3), y: y + 1.2 * scale, z: z + Util.rand(-0.3, 0.3),
          vx: Util.rand(-0.3, 0.3) + 0.4, vy: Util.rand(1.2, 2.0), vz: Util.rand(-0.3, 0.3),
          life: Util.rand(2.5, 4), size: 0.8 * scale, size1: 3.2 * scale, color: sc, bright: 0.6, drag: 0.15,
        });
      }
      for (; ember > 1; ember--) {
        FX.glow.emit({
          x: x + Util.rand(-0.5, 0.5), y: y + 0.6, z: z + Util.rand(-0.5, 0.5),
          vx: Util.rand(-1, 1), vy: Util.rand(2, 4.5), vz: Util.rand(-1, 1),
          life: Util.rand(1, 2), size: 0.06, size1: 0.01, color: ec, bright: 3, drag: 0.4,
        });
      }
    });
    if (light) this.lights.push({ x, y: y + 1.2, z, color: 0xff7a2a, power: 34 * scale, flicker: true });
  }

  // 全像光環：發光的圓環，會繞著 Y 軸旋轉（tilt 讓它斜一點）
  holoRing(x, y, z, r, color, speed = 0.5, tilt = 0) {
    const b = new Builder();
    b.torus(r, 0.05, { r: [Math.PI / 2, 0, 0], c: color, m: "glow", e: 2, seg: 64 });
    for (let i = 0; i < 12; i++) { // 環上的刻度
      const a = (i / 12) * Math.PI * 2;
      b.box(0.08, 0.25, 0.5, { p: [Math.cos(a) * r, 0, Math.sin(a) * r], r: [0, -a, 0], c: color, m: "glow", e: 1.4 });
    }
    const g = b.build({ cast: false });
    g.position.set(x, y, z);
    g.rotation.z = tilt;
    return this.dynamic(g, (dt) => (g.rotation.y += dt * speed));
  }

  // 全像看板：發光的文字面板，顏色會在幾個顏色之間慢慢變換，偶爾閃一下
  billboard(x, y, z, dir, w, h, text, colors) {
    const [vx, vz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    const along = vx === 0;
    this.b.box(along ? w + 0.3 : 0.15, h + 0.3, along ? 0.15 : w + 0.3, { p: [x, y, z], c: 0x0a0c12, m: "metal" });
    const mat = new THREE.MeshBasicMaterial({
      map: Tex.text(text, "#ffffff"), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x + vx * 0.1, y, z + vz * 0.1);
    mesh.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
    mesh.userData.ownMaterial = true;
    const cols = colors.map((c) => new THREE.Color(c));
    const phase = this.rnd() * 10;
    this.dynamic(mesh, (dt, t) => {
      const k = (t * 0.15 + phase) % cols.length;
      const i = Math.floor(k);
      mat.color.copy(cols[i]).lerp(cols[(i + 1) % cols.length], Util.smooth((k - i) * 3 - 2)).multiplyScalar(2.2);
      mat.opacity = Math.sin(t * 23 + phase) > 0.97 ? 0.4 : 1; // 偶爾閃一下，像訊號不穩
    });
  }

  // 飛行車流：一群發光的小飛車沿著橢圓軌道在天空中來回
  traffic(count, rMin, rMax, yMin, yMax, colors, speed = 16) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.35, 2.4), new THREE.MeshBasicMaterial({ toneMapped: false }), count,
    );
    mesh.userData.ownMaterial = true;
    mesh.frustumCulled = false;
    const cars = [];
    for (let i = 0; i < count; i++) {
      cars.push({
        r: Util.lerp(rMin, rMax, this.rnd()), y: Util.lerp(yMin, yMax, this.rnd()),
        a: this.rnd() * 6.28, dir: this.rnd() < 0.5 ? 1 : -1, v: speed * (0.7 + this.rnd() * 0.6),
      });
      mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]).multiplyScalar(2.5));
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    this.dynamic(mesh, (dt) => {
      for (let i = 0; i < count; i++) {
        const c = cars[i];
        c.a += (c.dir * c.v * dt) / c.r;
        pos.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r * 0.85);
        e.set(0, -c.a + (c.dir > 0 ? 0 : Math.PI), 0);
        m.compose(pos, q.setFromEuler(e), one);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // 磁浮列車：沿著 X 軸高速通過的發光車廂（每隔一段時間來一班）
  train(y, z, color) {
    const b = new Builder();
    for (let i = 0; i < 4; i++) {
      const cx = i * 10.6;
      b.rbox(10.2, 2.2, 2.6, 0.6, { p: [cx, 0, 0], c: 0xd8dee8, m: "paint" });
      b.box(9.4, 0.5, 2.62, { p: [cx, 0.3, 0], c: 0x0c1824, m: "metal" }); // 車窗帶
      b.box(9.36, 0.12, 2.64, { p: [cx, 0.3, 0], c: color, m: "glow", e: 1.6 });
      b.box(10.2, 0.1, 2.64, { p: [cx, -0.95, 0], c: color, m: "glow", e: 2 });
    }
    b.cone(1.2, 3, { p: [-6.6, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.9], c: 0xd8dee8, seg: 12 }); // 車頭
    b.box(0.1, 0.6, 1.6, { p: [-8.1, 0.1, 0], c: 0xfff2c4, m: "glow", e: 3 });
    const g = b.build({ cast: false });
    let t = this.rnd() * 20, passed = false;
    return this.dynamic(g, (dt) => {
      t += dt;
      const k = (t % 26) / 5; // 每 26 秒來一班，用 5 秒通過整張地圖
      g.visible = k < 1;
      g.position.set(Util.lerp(160, -200, Math.min(k, 1)), y, z);
      if (k < 1 && !passed && Math.abs(g.position.x) < 60) {
        passed = true;
        Sound.play("dash", { pos: g.position, vol: 1.5 });
      }
      if (k >= 1) passed = false;
    });
  }

  // 地上的發光裂縫（熔岩、能量）：一條彎彎曲曲的折線
  crack(x, z, len, color, width = 0.12) {
    let a = this.rnd() * 6.28;
    let px = x, pz = z;
    for (let i = 0; i < len; i++) {
      a += (this.rnd() - 0.5) * 1.1;
      const nx = px + Math.cos(a) * 1.2, nz = pz + Math.sin(a) * 1.2;
      this.b.box(width * (1 - (i / len) * 0.6), 0.03, 1.3, {
        p: [(px + nx) / 2, 0.02 + i * 0.002, (pz + nz) / 2], r: [0, -a + Math.PI / 2, 0], c: color, m: "glow", e: 2.2,
      });
      px = nx;
      pz = nz;
    }
  }

  /* 碎石堆：一堆大小不一的石塊。
   * 石塊都比台階矮（最高約 0.4 公尺），可以直接踩上去，但有碰撞、腳不會陷進石頭裡。
   * 這裡只先「記下」每塊石頭；等整張地圖的牆、樓板都登記好之後，
   * 才在 _flushRubble() 檢查會不會插進別的東西裡（插進去的就不放）。 */
  rubble(x, z, r, n, color) {
    this.pendingRubble ||= [];
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.28, d = this.rnd() * r, s = 0.2 + this.rnd() * 0.5;
      const rot = [this.rnd() * 0.25, this.rnd() * 3, this.rnd() * 0.25];
      this.pendingRubble.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, s, rot, color: color ?? this.pal.wall2 });
    }
  }

  /* 把記下來的碎石真正放進地圖：
   *   - 石塊（含旋轉後的範圍）碰到牆、樓板、倒塌大樓 → 不放，避免穿模
   *   - 整塊落在很矮的平台上（例如隕石坑邊的土堆）→ 放在平台頂面上，不會陷進去 */
  _flushRubble() {
    const list = this.pendingRubble || [];
    this.pendingRubble = [];
    const solids = World.boxes.slice(); // 只跟地圖本身比；碎石彼此堆疊是正常的
    for (const r of list) {
      const half = r.s * 0.87; // 旋轉後石塊在水平方向的最大半徑
      const top = r.s * 0.55; // 石塊的高度
      let baseY = 0, ok = true;
      for (const b of solids) {
        if (b.maxX < r.x - half || b.minX > r.x + half || b.maxZ < r.z - half || b.minZ > r.z + half) continue;
        if (b.minY > top + 0.6) continue; // 在頭頂上方（例如橋面），不影響
        const inside = r.x - half >= b.minX && r.x + half <= b.maxX && r.z - half >= b.minZ && r.z + half <= b.maxZ;
        if (b.maxY <= 0.6 && inside) baseY = Math.max(baseY, b.maxY);
        else { ok = false; break; }
      }
      if (!ok) continue;
      this.b.box(r.s * 1.4, r.s * 0.6, r.s, { p: [r.x, baseY + r.s * 0.25, r.z], r: r.rot, c: r.color, m: "wall" });
      if (top > 0.2) World.addBox(r.x, baseY + top / 2, r.z, r.s * 1.15, top, r.s * 1.15, { noWalk: true });
    }
  }

  // 收尾：整張地圖的實體都登記完之後才做的事（Maps.load 會呼叫）
  finish() {
    this._flushRubble();
    if (this.kelpList) this._buildKelp();
  }

  // 殘破的牆：一段一段高低不同、頂端參差不齊，偶爾露出鋼筋
  ruinWall(x, z, len, along, hMin, hMax) {
    const n = Math.max(1, Math.round(len / 1.5));
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + seg * (i + 0.5);
      const h = Util.lerp(hMin, hMax, this.rnd()) + i * 0.006; // 加一點點，相鄰兩段就不會剛好一樣高
      const cx = x + (along ? t : 0), cz = z + (along ? 0 : t);
      const th = i % 2 ? 0.54 : 0.5; // 相鄰兩段厚度錯開，接縫處才不會閃爍
      this.solid(cx, 0, cz, along ? seg + 0.02 : th, h, along ? th : seg + 0.02, { noWalk: true, c: this.pal.wall });
      // 頂端的斷口碎塊
      this.b.box(along ? seg * 0.6 : 0.52, 0.3, along ? 0.52 : seg * 0.6, {
        p: [cx, h + 0.1, cz], r: [0, 0, (this.rnd() - 0.5) * 0.6], c: this.pal.wall2, m: "wall",
      });
      if (this.rnd() < 0.5) { // 露出的鋼筋
        for (let k = 0; k < 3; k++) {
          const o = (k - 1) * 0.3;
          this.b.limb(
            [cx + (along ? o : 0), h, cz + (along ? 0 : o)],
            [cx + (along ? o * 1.2 : (this.rnd() - 0.5) * 0.4), h + 0.5 + this.rnd() * 0.6, cz + (along ? (this.rnd() - 0.5) * 0.4 : o * 1.2)],
            0.025, { c: 0x5a3a2a, m: "metal", flat: true },
          );
        }
      }
    }
  }

  // 反坦克拒馬（三根交叉的鋼樑）
  hedgehog(x, z) {
    for (const r of [[0.78, 0, 0], [0, 0, 0.78], [0.78, Math.PI / 2, 0.78]]) {
      this.b.box(0.18, 2.0, 0.18, { p: [x, 0.7, z], r, c: 0x3a3430, m: "metal" });
    }
    World.addBox(x, 0.6, z, 1.2, 1.2, 1.2, { noWalk: true });
  }

  // 燒毀的車：焦黑的車身、破掉的車窗，可以選擇是否還在燃燒
  wreck(x, z, dir, burning) {
    const along = dir % 2 === 0;
    World.addBox(x, 0.6, z, along ? 4.4 : 1.9, 1.2, along ? 1.9 : 4.4);
    const b = this.b;
    b.push(x, 0, z, along ? 0 : Math.PI / 2, 0, (this.rnd() - 0.5) * 0.08);
    b.rbox(4.4, 0.6, 1.9, 0.12, { p: [0, 0.55, 0], c: 0x2a2420, m: "metal" }); // 焦黑車身
    b.rbox(2.2, 0.5, 1.7, 0.18, { p: [-0.2, 1.05, 0], c: 0x241e1a, m: "metal" });
    b.box(2.0, 0.36, 1.72, { p: [-0.2, 1.05, 0], c: 0x050505, m: "matte" });
    b.box(1.5, 0.08, 1.95, { p: [1.3, 0.88, 0], r: [0, 0, 0.4], c: 0x3a2a20, m: "metal" }); // 翹起的引擎蓋
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.88, 0.88]) {
      b.cyl(0.3, 0.3, 0.22, { p: [sx, 0.22, sz], r: [Math.PI / 2, 0, 0], c: 0x0c0a08, m: "matte", seg: 10 });
    }
    b.pop();
    if (burning) this.fire(x, 0.9, z, 0.9);
  }

  /* 倒塌的高樓：一棟傾斜躺在地上的大樓。
   * 碰撞做成一公尺一階、非常緩的斜坡，玩家和電腦都可以沿著它走上去。 */
  fallenTower(x0, z, len, w, hEnd, color, reverse = false) {
    // reverse = true：高的一端在 x0（左邊），低的一端在右邊
    const slope = Math.atan2(hEnd, len) * (reverse ? -1 : 1);
    const b = this.b;
    b.push(x0 + len / 2, hEnd / 2, z, 0, 0, slope);
    b.box(len + 2, 2.2, w, { p: [0, -0.95, 0], c: color, m: "wall" }); // 樓板上緣剛好是走路的高度，腳不會陷進去
    for (let i = 0; i < len / 2.4; i++) {
      for (const side of [-1, 1]) {
        const lit = this.rnd() < 0.25; // 少數窗戶裡還有火光
        b.box(1.4, 0.9, 0.06, {
          p: [-len / 2 + 1.2 + i * 2.4, -0.6, side * (w / 2 + 0.03)], c: lit ? 0xff6a1a : 0x0a0a0a, m: lit ? "glow" : "matte", e: 0.8,
        });
      }
    }
    b.pop();
    // 高的那端底下原本是空的（看起來像懸在空中），補上坍塌的瓦礫堆把它撐住
    for (let i = 0; i < len; i += 2) {
      const k = reverse ? len - i - 1 : i + 1;
      const under = (k / len) * hEnd + 0.15 - 2.1; // 這一段樓板底面的高度
      if (under > 0.1) {
        const fw = (i / 2) % 2 ? w - 0.9 : w - 0.8; // 相鄰兩塊寬度錯開，接縫才不會閃爍
        this.b.box(2.05, under + 0.15, fw, { p: [x0 + i + 1, (under + 0.15) / 2, z], c: 0x2e2622, m: "wall" });
        this.rubble(x0 + i + 1, z + (this.rnd() < 0.5 ? -1 : 1) * (w / 2 + 0.3), 1.0, 3, 0x3a302a);
      }
    }
    for (let i = 0; i < len; i++) {
      const k = reverse ? len - i : i + 1; // 第幾階（越大越高）
      const top = (k / len) * hEnd + 0.15; // 第一階只有 0.42 公尺，可以直接踏上去
      World.addBox(x0 + i + 0.5, top / 2, z, 1.0, top, w + 0.1); // 寬度含兩側窗框
    }
  }

  // 圓頂艙（海底）：金屬底座＋玻璃圓頂＋肋條，碰撞是一個方塊
  dome(x, z, r, color) {
    const b = this.b;
    b.cyl(r, r + 0.3, 1.2, { p: [x, 0.6, z], c: this.pal.wall2, m: "metal", seg: 24 });
    b.sphere(r * 0.98, { p: [x, 1.2, z], s: [1, 0.8, 1], c: 0x9ff4ff, m: "pane", seg: 28 });
    for (let i = 0; i < 4; i++) {
      b.torus(r, 0.07, { p: [x, 1.2, z], r: [0, (i / 4) * Math.PI, 0], s: [1, 0.8, 1], c: this.pal.dark, m: "metal", seg: 28, arc: Math.PI });
    }
    b.torus(r + 0.05, 0.08, { p: [x, 1.25, z], r: [Math.PI / 2, 0, 0], c: color, m: "glow", e: 1.6, seg: 32 });
    World.addBox(x, (1.2 + r * 0.8) / 2, z, r * 1.6, 1.2 + r * 0.8, r * 1.6, { noWalk: true });
    this.lights.push({ x, y: 1.6, z, color, power: 45 });
  }

  // 海草：一叢會隨水流搖擺的長條
  /* 海草（巨藻）：一叢 n 株，高度約 h 公尺。
   * 這裡只記下位置，等地圖的牆與石頭都登記好後，才在 _buildKelp() 一次做出來，
   * 這樣才能避開石頭與建築（不會長進石頭裡、也不會穿過頭頂的管道）。 */
  kelp(x, z, h, n = 5) {
    (this.kelpList ||= []).push({ x, z, h, n });
  }

  /* 把所有海草做成「一個」網格（只有一次繪製，效能好）。每一株包含：
   *   莖   ：一圈一圈的圓環串成的連續管子，根部粗、越往上越細，微微彎曲
   *   葉片 ：沿著莖螺旋排列的長葉，兩頭窄中間寬、尖尾，葉緣有波浪皺褶、中肋微微隆起
   *   氣囊 ：每片葉子根部的小圓球（真的巨藻就是靠它浮起來）
   *   顏色 ：根部深橄欖綠 → 葉尖帶金黃的嫩綠
   * 擺動在顯示卡上計算（頂點著色器）：越高擺得越大，整株是一起彎的，
   * 葉片另外有快速的小抖動。 */
  _buildKelp() {
    const rnd = Util.seeded(4242); // 海草用自己的亂數，不影響地圖其他東西的位置
    const pos = [], col = [], phase = [], flex = [], leaf = [], idx = [];
    const stalks = []; // 長好的每一株（位置與高度），最後用來登記碰撞
    // 加入一個頂點：位置、顏色、所屬那株的擺動相位、擺動權重（越高越大）、葉片抖動權重
    const vert = (x, y, z, c, ph, fl, lf) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      phase.push(ph);
      flex.push(fl);
      leaf.push(lf);
      return pos.length / 3 - 1;
    };
    for (const clump of this.kelpList) {
      for (let i = 0; i < clump.n; i++) {
        // 在叢的範圍內找一個有足夠空間的位置；找不到就少長一株
        for (let tries = 0; tries < 6; tries++) {
          const x = clump.x + (rnd() - 0.5) * 2, z = clump.z + (rnd() - 0.5) * 2;
          const H = this._kelpRoom(x, z, clump.h * (0.6 + rnd() * 0.5));
          if (H >= 2.5) {
            this._kelpStalk(x, z, H, rnd, vert, idx);
            stalks.push({ x, z, H });
            break;
          }
        }
      }
    }
    if (!pos.length) return;
    /* 碰撞：每株海草的莖（含葉片根部）一個細長的方塊，人走不過去、電腦也會繞開。
     * 等全部長好才一起登記，否則同一叢裡後面那幾株會被前面的碰撞擋住長不出來。 */
    for (const st of stalks) World.addBox(st.x, st.H / 2, st.z, 0.6, st.H, 0.6, { noWalk: true });

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute("aFlex", new THREE.Float32BufferAttribute(flex, 1));
    g.setAttribute("aLeaf", new THREE.Float32BufferAttribute(leaf, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1; // 擺動會超出原本的範圍一點

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide,
      emissive: 0x0b1a08, // 一點點自發光：像光線透過薄薄的葉片
    });
    const uTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = "attribute float aPhase;\nattribute float aFlex;\nattribute float aLeaf;\nuniform float uTime;\n" +
        sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          // 整株隨水流擺動：越高（aFlex 越大）擺得越多；加上高度相位，看起來像波浪往上傳
          float sw = aFlex * aFlex;
          transformed.x += (sin(uTime * 0.7 + aPhase + position.y * 0.25) * 0.5
                          + sin(uTime * 1.7 + aPhase * 2.0 + position.y * 0.8) * 0.1) * sw;
          transformed.z += cos(uTime * 0.55 + aPhase * 1.3 + position.y * 0.2) * 0.4 * sw;
          // 葉片的小抖動（沿著葉面法線，葉尖抖得最多）
          transformed += objectNormal * sin(uTime * 2.6 + aPhase * 3.0 + aLeaf * 5.0) * 0.045 * aLeaf;`);
    };
    mat.customProgramCacheKey = () => "kelp";
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.userData.ownMaterial = true;
    this.dynamic(mesh, (dt, t) => (uTime.value = t));
  }

  /* 這個位置最多能長多高：從下往上檢查一圈範圍（越高範圍越大，因為擺動幅度大），
   * 碰到牆、建築、珊瑚或石頭就停在那之下。太低就回傳 0（不長）。 */
  _kelpRoom(x, z, H) {
    if (Math.abs(x) > World.half - 1.5 || Math.abs(z) > World.half - 1.5) return 0;
    for (let y = 0.3; y <= H; y += 0.4) {
      const rr = 0.9 + 0.8 * (y / H) ** 2; // 葉片伸展範圍＋擺動幅度
      let blocked = false;
      for (const b of World.boxes) {
        if (b.minY < y + 0.2 && b.maxY > y - 0.2 && b.minX < x + rr && b.maxX > x - rr && b.minZ < z + rr && b.maxZ > z - rr) {
          blocked = true;
          break;
        }
      }
      // 外圍的大礁石是橢球，比它的碰撞方塊大一圈，要另外檢查
      for (const r of this.rocks || []) {
        if (blocked) break;
        const dy = (y - r.y) / (r.R * r.sy);
        if (Math.abs(dy) >= 1) continue;
        if (Math.hypot(x - r.x, z - r.z) < r.R * Math.sqrt(1 - dy * dy) + rr) blocked = true;
      }
      if (blocked) return y < 1.5 ? 0 : y - 0.6;
    }
    return H;
  }

  // 一株海草：莖＋螺旋排列的葉片＋頂端的嫩葉
  _kelpStalk(bx, bz, H, rnd, vert, idx) {
    const ph = rnd() * 6.28; // 這株的擺動相位（每株不同步）
    const wob = 0.12 + rnd() * 0.2; // 莖的彎曲程度
    const shade = 0.85 + rnd() * 0.3; // 每株顏色深淺略有不同
    const stemA = new THREE.Color(0x2c3c16).multiplyScalar(shade), stemB = new THREE.Color(0x66722a).multiplyScalar(shade);
    const bladeA = new THREE.Color(0x3a561a).multiplyScalar(shade), bladeB = new THREE.Color(0xa8b848).multiplyScalar(shade);
    const C = new THREE.Color();
    // 莖的中心線：t = 0（根）～ 1（頂）
    const center = (t) => [bx + Math.sin(t * 2.3 + ph) * wob * t, H * t, bz + Math.cos(t * 1.9 + ph) * wob * t];

    // ---- 莖：一圈圈 6 邊形的圓環接成一根管子 ----
    const RINGS = Math.max(10, Math.round(H * 2.5)), SIDES = 6;
    let prev = null;
    for (let k = 0; k <= RINGS; k++) {
      const t = k / RINGS;
      const [cx, cy, cz] = center(t);
      const r = k === 0 ? 0.12 : 0.05 * (1 - 0.55 * t) + 0.012; // 根部張開成固著器，往上越來越細
      C.copy(stemA).lerp(stemB, t);
      const ring = [];
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        ring.push(vert(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, C, ph, t, 0));
      }
      if (prev) {
        for (let s = 0; s < SIDES; s++) {
          const a0 = prev[s], a1 = prev[(s + 1) % SIDES], b0 = ring[s], b1 = ring[(s + 1) % SIDES];
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
      prev = ring;
    }

    // ---- 葉片：每隔約 0.4～0.6 公尺一片，以「黃金角」繞著莖螺旋排列 ----
    let ang = rnd() * 6.28;
    for (let y = 0.45; y < H - 0.4; y += 0.3 + rnd() * 0.18) {
      ang += 2.4;
      const L = (1.1 + rnd() * 0.6) * (1 - 0.3 * (y / H)); // 長長的帶狀葉，上面的短一點
      this._kelpBlade(center(y / H), ang, L, 0.085 + rnd() * 0.04, 0.5 + rnd() * 0.3, ph, H, bladeA, bladeB, vert, idx, rnd);
    }
    // 頂端：幾片幾乎直立的嫩葉
    for (let j = 0; j < 3; j++) this._kelpBlade(center(1), ang + j * 2.1, 0.55 + rnd() * 0.2, 0.09, 2.2, ph, H, bladeA, bladeB, vert, idx, rnd);
  }

  /* 一片葉子。at 是長在莖上的位置，ang 是往外伸的方向，L 長、W 最寬處的半寬，
   * up 越大葉子越往上豎（巨藻的葉子靠氣囊浮力往上飄）。
   * 葉片橫切面是「左緣－中肋－右緣」三個點，中肋微微隆起，所以不是一張平板。 */
  _kelpBlade(at, ang, L, W, up, ph, H, cA, cB, vert, idx, rnd) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const dir = new THREE.Vector3(dx * 0.6, up, dz * 0.6).normalize(); // 葉片長的方向
    const side = new THREE.Vector3(-dz, 0, dx); // 葉片的寬度方向（水平）
    const nrm = new THREE.Vector3().crossVectors(dir, side).normalize(); // 葉面的法線
    const curl = (rnd() - 0.5) * 0.6; // 葉尖往左或往右捲
    const C = new THREE.Color(), D = new THREE.Color();

    // 氣囊：葉柄上的小圓球（金黃色）
    const bladder = new THREE.SphereGeometry(0.042, 6, 4);
    const bp = bladder.attributes.position;
    const ox = at[0] + dir.x * 0.05, oy = at[1] + dir.y * 0.05, oz = at[2] + dir.z * 0.05;
    C.setHex(0x9a8a2a);
    const ids = [];
    for (let i = 0; i < bp.count; i++) {
      const vy = oy + bp.getY(i);
      ids.push(vert(ox + bp.getX(i), vy, oz + bp.getZ(i), C, ph, Math.min(1, vy / H), 0));
    }
    const bi = bladder.index;
    for (let i = 0; i < bi.count; i++) idx.push(ids[bi.getX(i)]);
    bladder.dispose();

    // 葉身：12 段，每段一排三個點（左緣、中肋、右緣）
    const SEG = 12;
    let prevRow = null;
    for (let k = 0; k <= SEG; k++) {
      const s = k / SEG;
      const ls = 0.09 + s * L; // 從氣囊後面開始長
      const cx = at[0] + dir.x * ls + dx * 0.14 * s * s + side.x * curl * s * s;
      const cy = at[1] + dir.y * ls - 0.3 * s * s; // 葉身往外飄、葉尖下垂成弧形
      const cz = at[2] + dir.z * ls + dz * 0.14 * s * s + side.z * curl * s * s;
      const w = W * Math.sin(Math.PI * Math.pow(s, 0.55)) + 0.006; // 兩頭窄、中間寬、尖尾
      const ruffle = Math.sin(s * 22 + ph + ang) * 0.04 * Math.min(1, s * 3); // 葉緣的波浪皺褶
      const rib = 0.022 * (1 - s); // 中肋隆起
      const fl = Math.min(1, cy / H); // 擺動權重跟莖同一個高度，所以葉片跟著莖一起擺
      C.copy(cA).lerp(cB, 0.2 + 0.8 * s);
      D.copy(C).multiplyScalar(0.78); // 中肋顏色深一點
      const l = vert(cx - side.x * w + nrm.x * ruffle, cy + nrm.y * ruffle, cz - side.z * w + nrm.z * ruffle, C, ph, fl, s);
      const m = vert(cx + nrm.x * rib, cy + nrm.y * rib, cz + nrm.z * rib, D, ph, fl, s);
      const r = vert(cx + side.x * w - nrm.x * ruffle, cy - nrm.y * ruffle, cz + side.z * w - nrm.z * ruffle, C, ph, fl, s);
      if (prevRow) {
        const [pl, pm, pr] = prevRow;
        idx.push(pl, l, pm, pm, l, m, pm, m, pr, pr, m, r);
      }
      prevRow = [l, m, r];
    }
  }

  // 珊瑚：一叢分枝，尖端會發光
  coral(x, z, color) {
    const b = this.b;
    for (let i = 0; i < 6; i++) {
      const a = this.rnd() * 6.28, d = this.rnd() * 0.7;
      const h = 0.4 + this.rnd() * 0.9;
      const tip = [x + Math.cos(a) * (d + 0.3), h, z + Math.sin(a) * (d + 0.3)];
      b.limb([x + Math.cos(a) * d, 0, z + Math.sin(a) * d], tip, 0.06 + this.rnd() * 0.05, { c: 0x6a2a4a, m: "matte" });
      b.sphere(0.1, { p: tip, c: color, m: "glow", e: 1.8, seg: 6 });
    }
    World.addBox(x, 0.6, z, 1.8, 1.2, 1.8, { noWalk: true }); // 珊瑚叢的碰撞
  }

  // 水母：半透明的傘狀身體與觸手，緩慢漂浮、一縮一放
  jelly(x, y, z, color) {
    const b = new Builder();
    b.sphere(0.6, { s: [1, 0.6, 1], c: color, m: "glass", seg: 16 });
    b.sphere(0.4, { p: [0, 0.05, 0], s: [1, 0.5, 1], c: color, m: "glow", e: 1.2, seg: 12 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.limb([Math.cos(a) * 0.4, -0.1, Math.sin(a) * 0.4], [Math.cos(a) * 0.3, -1.8 - (i % 3) * 0.4, Math.sin(a) * 0.3], 0.02, {
        c: color, m: "glow", e: 0.8, flat: true,
      });
    }
    const g = b.build({ cast: false });
    const ph = this.rnd() * 6;
    return this.dynamic(g, (dt, t) => {
      g.position.set(x + Math.sin(t * 0.13 + ph) * 3, y + Math.sin(t * 0.5 + ph) * 1.2, z + Math.cos(t * 0.11 + ph) * 3);
      const pulse = 1 + Math.sin(t * 2 + ph) * 0.12;
      g.scale.set(pulse, 2 - pulse, pulse);
    });
  }

  // 巨鯨：在地圖外圍緩慢繞圈游動，尾巴上下擺動
  whale(radius, y) {
    const root = new THREE.Group();
    let b = new Builder();
    b.sphere(1, { s: [3.2, 2.6, 13], c: 0x1a2a3a, m: "matte", seg: 20 }); // 身體
    b.sphere(1, { p: [0, -0.6, -1], s: [2.9, 1.8, 11], c: 0x8a9aa8, m: "matte", seg: 20 }); // 白色腹部
    b.box(4.5, 0.25, 1.6, { p: [3.2, -1, -4], r: [0, 0.4, -0.4], c: 0x1a2a3a, m: "matte" }); // 胸鰭
    b.box(4.5, 0.25, 1.6, { p: [-3.2, -1, -4], r: [0, -0.4, 0.4], c: 0x1a2a3a, m: "matte" });
    b.sphere(0.25, { p: [1.6, 0.4, -9], c: 0x9ff4ff, m: "glow", e: 1.5, seg: 8 }); // 發光的眼睛
    b.sphere(0.25, { p: [-1.6, 0.4, -9], c: 0x9ff4ff, m: "glow", e: 1.5, seg: 8 });
    root.add(b.build({ cast: false }));
    const tail = new THREE.Group(); // 尾巴是獨立的關節，才能單獨擺動
    tail.position.set(0, 0, 11);
    b = new Builder();
    b.sphere(1, { p: [0, 0, 3], s: [1.4, 1.2, 5], c: 0x1a2a3a, m: "matte", seg: 14 });
    b.box(9, 0.3, 2.8, { p: [0, 0, 7.5], c: 0x1a2a3a, m: "matte" }); // 尾鰭
    tail.add(b.build({ cast: false }));
    root.add(tail);
    root.scale.setScalar(1.6);
    return this.dynamic(root, (dt, t) => {
      const a = t * 0.035;
      root.position.set(Math.cos(a) * radius, y + Math.sin(t * 0.2) * 3, Math.sin(a) * radius);
      root.rotation.y = -a + Math.PI; // 面向前進方向
      tail.rotation.x = Math.sin(t * 0.9) * 0.25;
    });
  }

  // 從上方照下來的光束（半透明的發光圓錐），亮度會慢慢起伏
  lightShaft(x, z, r, h, color) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, vertexColors: true,
    });
    const geo = new THREE.CylinderGeometry(r * 0.5, r, h, 20, 1, true);
    // 頂點顏色：上面亮、靠近海床的那一圈只剩兩成，光束才不會在地上切出一圈硬邊
    const pos = geo.attributes.position, shade = [];
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getY(i) > 0 ? 1 : 0.2;
      shade.push(k, k, k);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(shade, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.z = (this.rnd() - 0.5) * 0.25;
    mesh.userData.ownMaterial = true;
    const ph = this.rnd() * 6;
    return this.dynamic(mesh, (dt, t) => (mat.opacity = 0.045 + Math.sin(t * 0.4 + ph) * 0.025));
  }

  // 魚群：一群小魚繞著中心點游
  fishSchool(cx, cy, cz, count, color) {
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.08, 0.4, 5).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }),
      count,
    );
    mesh.userData.ownMaterial = true;
    mesh.frustumCulled = false;
    const fish = [];
    for (let i = 0; i < count; i++) fish.push({ r: 3 + this.rnd() * 4, y: (this.rnd() - 0.5) * 3, a: this.rnd() * 6.28, v: 0.5 + this.rnd() * 0.3 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    return this.dynamic(mesh, (dt, t) => {
      for (let i = 0; i < count; i++) {
        const f = fish[i];
        f.a += f.v * dt;
        pos.set(cx + Math.cos(f.a) * f.r, cy + f.y + Math.sin(t + i) * 0.3, cz + Math.sin(f.a) * f.r);
        m.compose(pos, q.setFromEuler(e.set(0, -f.a, 0)), one);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /* 跳躍板：踩上去會把玩家彈到 (tx, ty, tz)（例如屋頂）。
   * 電腦不會使用跳躍板（它們走樓梯），這是給玩家的捷徑。 */
  jumpPad(x, z, tx, ty, tz, color) {
    const b = new Builder();
    b.cyl(0.95, 1.05, 0.16, { p: [0, 0.08, 0], c: this.pal.dark, m: "metal", seg: 20 });
    for (let i = 0; i < 3; i++) b.torus(0.3 + i * 0.25, 0.04, { p: [0, 0.18, 0], r: [Math.PI / 2, 0, 0], c: color, m: "glow", e: 2, seg: 24 });
    b.cone(0.18, 0.3, { p: [0, 0.3, 0], c: color, m: "glow", e: 2, seg: 8 });
    const g = b.build({ cast: false });
    g.position.set(x, 0, z);
    this.dynamic(g, (dt, t) => (g.position.y = Math.abs(Math.sin(t * 3)) * 0.04));
    this.pads.push({ x, y: 0, z, tx, ty, tz, color });
  }

  // 地圖內的高樓（不能上去，只當作遮蔽與造景）：深色帷幕、發光的樓層線、頂端的天線
  tower(x, z, w, d, h, color, y0 = 0) {
    this.solid(x, y0, z, w, h, d, { noWalk: true, c: 0x1a2030, m: "metal" });
    for (let y = y0 + 3; y < y0 + h - 1; y += 3.2) {
      this.b.box(w + 0.08, 0.12, d + 0.08, { p: [x, y, z], c: color, m: "glow", e: 0.5 + this.rnd() * 0.8 });
    }
    for (const sx of [-1, 1]) { // 轉角的直向光條
      this.b.box(0.15, h * 0.98, 0.15, { p: [x + sx * (w / 2 + 0.05), y0 + h / 2, z - d / 2 - 0.05], c: color, m: "glow", e: 0.9 });
      this.b.box(0.15, h * 0.98, 0.15, { p: [x + sx * (w / 2 + 0.05), y0 + h / 2, z + d / 2 + 0.05], c: color, m: "glow", e: 0.9 });
    }
    this.b.cyl(0.08, 0.12, 6, { p: [x, y0 + h + 3, z], c: this.pal.dark, m: "metal", seg: 6 });
    this.b.sphere(0.25, { p: [x, y0 + h + 6, z], c: 0xff3030, m: "glow", e: 3, seg: 6 });
  }

  /* 架空的橋：玩家可以走上去，底下的地面也能正常通行。
   * 為了不讓電腦的導航搞混，橋面標記成「電腦不使用」（電腦會從橋下走）。
   * along：true 沿 X、false 沿 Z。兩側有玻璃欄杆（有碰撞）。 */
  bridge(x, z, len, along, width, h, color) {
    const w = along ? len : width, d = along ? width : len;
    World.addBox(x, h - 0.15, z, w, 0.3, d, { noWalk: true });
    this.b.box(w, 0.3, d, { p: [x, h - 0.15, z], c: this.pal.floor, m: "floor" });
    // 橋底：深色底板，兩側各一條細光條、中間一條更細的導引燈，每 4 公尺一道橫肋。
    // （原本整片橋底都在發光，從橋下往上看是一大塊刺眼的色塊）
    this.b.box(w + 0.02, 0.06, d + 0.02, { p: [x, h - 0.33, z], c: this.pal.dark, m: "trim" });
    this.b.box(along ? len - 0.4 : 0.08, 0.03, along ? 0.08 : len - 0.4, {
      p: [x, h - 0.465, z], c: color, m: "glow", e: 1.1,
    });
    for (const s of [-1, 1]) {
      const off = s * (width / 2 - 0.06);
      this.b.box(along ? len : 0.16, 0.04, along ? 0.16 : len, {
        p: [along ? x : x + off, h - 0.37, along ? z + off : z], c: color, m: "glow", e: 1.6,
      });
    }
    for (let t = -len / 2 + 2; t < len / 2; t += 4) {
      this.b.box(along ? 0.2 : width, 0.1, along ? width : 0.2, {
        p: [along ? x + t : x, h - 0.4, along ? z + t : z], c: this.pal.dark, m: "metal",
      });
    }
    for (const s of [-1, 1]) {
      const rx = along ? x : x + s * (width / 2 - 0.06), rz = along ? z + s * (width / 2 - 0.06) : z;
      World.addBox(rx, h + 0.55, rz, along ? len : 0.1, 1.1, along ? 0.1 : len, { noWalk: true });
      this.b.box(along ? len : 0.05, 1.0, along ? 0.05 : len, { p: [rx, h + 0.5, rz], c: 0x9fd8ff, m: "pane" });
      // 每 3.8 公尺左右一根立柱，把整面玻璃分成一片一片的欄板
      const posts = Math.max(2, Math.round(len / 3.8));
      for (let i = 0; i <= posts; i++) {
        const t = -len / 2 + 0.04 + (i / posts) * (len - 0.08);
        this.b.box(0.07, 1.02, 0.07, {
          p: [along ? x + t : rx, h + 0.51, along ? rz : z + t], c: this.pal.dark, m: "metal",
        });
      }
      this.b.box(along ? len : 0.1, 0.06, along ? 0.1 : len, { p: [rx, h + 1.05, rz], c: color, m: "glow", e: 1.6 });
    }
  }

  // 牆外的遠景大樓（沒有碰撞，只為了讓天際線有層次）
  skyline(count, minH, maxH, colors) {
    const s = World.half;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rnd() * 0.2;
      const dist = s + 14 + this.rnd() * 30;
      // 把圓上的點推到方形地圖外
      const k = dist / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) / 1.2;
      const x = Math.cos(a) * k, z = Math.sin(a) * k;
      const w = 8 + this.rnd() * 10, d = 8 + this.rnd() * 10;
      const h = minH + this.rnd() * (maxH - minH);
      this.b.box(w, h, d, { p: [x, h / 2, z], c: 0x0d1016, m: "matte" });
      const color = colors[Math.floor(this.rnd() * colors.length)];
      // 幾條橫向的窗光
      // 每棟的第一條窗光高度都不同，相鄰大樓的光帶才不會疊在同一平面閃爍
      for (let y = 3 + this.rnd() * 2; y < h - 2; y += 3 + this.rnd() * 4) {
        this.b.box(w + 0.1, 0.5, d + 0.1, { p: [x, y, z], c: color, m: "glow", e: 0.25 + this.rnd() * 0.5 });
      }
      this.b.box(0.3, 3, 0.3, { p: [x, h + 1.5, z], c: 0x0d1016 });
      this.b.sphere(0.3, { p: [x, h + 3, z], c: 0xff3030, m: "glow", e: 2, seg: 6 }); // 航空警示燈
    }
  }
}

/* ============================================================
 *  Maps ── 四張地圖
 * ------------------------------------------------------------
 *  每張地圖的欄位：
 *    half      地圖半寬          theme   四種貼圖材質的設定
 *    pal       色盤              sky     天空、太陽、霧與環境光
 *    bases     兩隊基地位置      points  據點爭奪的 A/B/C
 *    bossSpawn / playerSpawn     首領與玩家（單人模式）的出生點
 *    pickups   補給位置          build   建造程式
 * ============================================================ */
const Maps = {
  current: null, // 目前載入的地圖資料
  group: null, // 目前地圖的所有 3D 物件
  runtime: null, // 載入後的執行期資料（爆炸桶位置等）

  list: [
    /* ==================================================================
     *  地圖一：新東京・霓虹天際（未來科技城市）
     * ------------------------------------------------------------------
     *  兩側是高架的商業平台（屋頂可以上去），中間是寬闊的大道與全像光塔，
     *  兩座空中走廊連接左右平台。頭頂有磁浮列車呼嘯而過、天空滿是飛行車流。
     * ================================================================== */
    {
      id: "neo", name: "新東京・霓虹天際", en: "NEO SKYLINE", tag: "未來都市 · 立體巷戰",
      desc: "雨夜中的未來城市。兩側商業平台由空中走廊相連，頭頂磁浮列車呼嘯而過，中央全像光塔是兵家必爭之地。",
      half: 46, weather: "rain", music: { root: 55, tempo: 118 },
      theme: {
        ground: { tex: "asphalt", scale: 7, rough: 0.5, metal: 0.15, bump: 0.6 },
        wall: { tex: "panel", scale: 5, rough: 0.45, metal: 0.4 },
        floor: { tex: "hex", scale: 3, rough: 0.5, metal: 0.35 },
        trim: { tex: "metal", scale: 3, rough: 0.4, metal: 0.7 },
        pane: 0.7,
      },
      pal: {
        ground: 0x262a36, wall: 0x2a3244, wall2: 0x222838, floor: 0x48526a, dark: 0x10131a,
        crate: 0x2e3a52, crate2: 0x52304a, accent1: 0x00e5ff, accent2: 0xff2bd6, plant: 0x1f5a5a, hazard: 0xffc233,
      },
      sky: {
        top: 0x04030c, horizon: 0x241040, bottom: 0x080612, stars: 0.3, aurora: 0, planet: 0, city: 1,
        sunDir: [0.3, 0.8, 0.4], sunColor: 0x9aa8ff, sunPower: 2.0, sunDisc: 0.3,
        hemiSky: 0x7a80d0, hemiGround: 0x3a2a4a, hemiPower: 2.4,
        fog: 0x1a0f2e, fogNear: 35, fogFar: 170, exposure: 1.25,
      },
      bases: [{ x: 0, z: 40 }, { x: 0, z: -40 }],
      points: [{ name: "A", x: -16, z: 0, r: 6 }, { name: "B", x: 0, z: 0, r: 7 }, { name: "C", x: 16, z: 0, r: 6 }],
      shot: { pos: [30, 16, 38], look: [-2, 4, -4] }, // 選單預覽圖的拍攝位置
      bossSpawn: { x: 0, z: -16 }, playerSpawn: { x: 0, z: 36 },
      pickups: [
        ["health", -20, 8], ["health", 20, -8], ["armor", -29, 0], ["armor", 29, 0], ["armor", -9, -30], ["armor", 9, 30],
        ["ammo", 0, 24], ["ammo", 0, -24], ["ammo", -41, 0], ["ammo", 41, 0], ["grenade", -10, 0], ["grenade", 10, 0],
      ],
      build(k) {
        const P = k.pal;
        const A1 = P.accent1, A2 = P.accent2, GOLD = 0xffc233;
        k.perimeter(8);

        // ---- 懸浮車：沒有輪子、底部發光、離地 0.35 公尺 ----
        const hoverCar = (x, z, dir, color) => {
          const along = dir % 2 === 0;
          World.addBox(x, 0.75, z, along ? 4.6 : 2.0, 1.5, along ? 2.0 : 4.6);
          const b = k.b;
          b.push(x, 0.35, z, along ? 0 : Math.PI / 2);
          b.rbox(4.6, 0.55, 2.0, 0.25, { p: [0, 0.35, 0], c: color }); // 流線型車身
          b.rbox(2.6, 0.5, 1.7, 0.25, { p: [-0.3, 0.85, 0], c: 0x0c1220, m: "metal" }); // 黑色玻璃車艙
          b.box(4.62, 0.05, 2.02, { p: [0, 0.22, 0], c: A1, m: "glow", e: 1.6 }); // 腰線燈
          b.box(0.05, 0.12, 1.6, { p: [2.31, 0.4, 0], c: 0xfff2c4, m: "glow", e: 3 }); // 頭燈
          b.box(0.05, 0.1, 1.7, { p: [-2.31, 0.45, 0], c: 0xff2040, m: "glow", e: 3 }); // 尾燈
          b.box(0.9, 0.035, 1.5, { p: [0.72, 1.0, 0], r: [0, 0, -0.42], c: 0x1e2a44, m: "metal" }); // 擋風玻璃的反光
          b.box(0.5, 0.05, 1.9, { p: [-2.0, 0.78, 0], c: 0x0c1220, m: "metal" }); // 尾翼
          for (const sz of [-1, 1]) {
            b.box(0.5, 0.2, 0.06, { p: [-1.9, 0.68, sz * 0.86], c: 0x0c1220, m: "metal" }); // 尾翼支架
            b.box(0.03, 0.42, 0.012, { p: [0.15, 0.4, sz * 1.004], c: 0x0c1220 }); // 車門縫
            b.box(1.1, 0.03, 0.012, { p: [-0.42, 0.56, sz * 1.004], c: 0x0c1220 });
            b.rbox(0.16, 0.08, 0.14, 0.03, { p: [0.95, 0.72, sz * 1.02], c: color }); // 後視鏡
          }
          b.box(0.6, 0.05, 0.9, { p: [-0.3, 1.12, 0], c: 0x1a1e28, m: "metal" }); // 車頂的感測器蓋
          for (const sx of [-1.5, 1.5]) for (const sz of [-0.75, 0.75]) { // 四個懸浮推進器
            b.cyl(0.28, 0.32, 0.12, { p: [sx, 0.04, sz], c: 0x1a1e28, m: "metal", seg: 12 });
            b.cyl(0.2, 0.2, 0.02, { p: [sx, -0.03, sz], c: A1, m: "glow", e: 3, seg: 12 });
          }
          b.pop();
        };

        // ---- 販賣機：發光的正面與商品格 ----
        const vending = (x, z, dir, color) => {
          const along = dir % 2 === 0;
          k.solid(x, 0, z, along ? 1.0 : 0.8, 2.0, along ? 0.8 : 1.0, { c: 0x1a2030, m: "trim", noWalk: true });
          const [vx, vz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
          const fx = x + vx * 0.41, fz = z + vz * 0.41;
          k.b.box(along ? 0.8 : 0.03, 1.2, along ? 0.03 : 0.8, { p: [fx, 1.2, fz], c: color, m: "glow", e: 0.9 });
          for (let r = 0; r < 4; r++) k.b.box(along ? 0.82 : 0.04, 0.03, along ? 0.04 : 0.82, { p: [fx, 0.7 + r * 0.3, fz], c: 0x0a0a10 });
        };

        // ---- 兩側的商業平台（高 3.2，屋頂可以走）與上面的摩天大樓 ----
        for (const sx of [-1, 1]) {
          const cx = sx * 31;
          k.building(cx, 0, 12, 44, 3.2, { neon: sx < 0 ? A1 : A2, windows: [A1, A2, 0xffd9a0], litRate: 0.6 });
          k.roofStairs(cx, 0, 12, 44, 3.2, sx < 0 ? "e" : "w", -8);
          k.roofStairs(cx, 0, 12, 44, 3.2, sx < 0 ? "e" : "w", 8);
          k.tower(sx * 34.5, -12, 5, 8, 34, sx < 0 ? A2 : A1, 3.2);
          k.tower(sx * 34.5, 12, 5, 8, 26, sx < 0 ? A1 : A2, 3.2);
          // 摩天大樓面向大道的巨型全像廣告
          const face = sx < 0 ? 1 : 3;
          k.billboard(sx * 31.9, 14, -12, face, 7, 3.4, sx < 0 ? "神經連結 NEURAL" : "零時差 ZERO-LAG", [A1, A2, GOLD]);
          k.billboard(sx * 31.9, 11, 12, face, 7, 3.4, sx < 0 ? "合成夢境 DREAM" : "極光重工 AURORA", [A2, GOLD, A1]);
          // 平台一樓的店面招牌
          k.neon(sx * 24.95, 2.2, -3.6, face, 3.6, 1.0, A2, sx < 0 ? "拉麵 RAMEN" : "義體診所");
          k.neon(sx * 24.95, 2.2, 3.6, face, 3.6, 1.0, GOLD, sx < 0 ? "電子茶屋" : "BAR 2099");
          // 平台外側的小巷：垃圾箱、管線、箱子
          k.solid(sx * 41, 0, -14, 1.4, 1.3, 2.6, { c: 0x2a4a3a, m: "trim" });
          k.crateStack(sx * 40.5, 10, 1);
          k.pipe([sx * 37.1, 2.6, -20], [sx * 37.1, 2.6, 20], 0.18, 0x5a6478);
          k.lamp(sx * 41, 0, 5, sx < 0 ? A1 : A2, false, sx < 0 ? 1 : 3);
        }

        // ---- 兩座空中走廊：連接左右平台的屋頂 ----
        k.bridge(0, -16, 50, true, 4, 3.2, A1);
        k.bridge(0, 16, 50, true, 4, 3.2, A2);

        // ---- 中央：全像光塔 ----
        k.solid(0, 0, 0, 7, 0.35, 7, { c: P.floor, m: "floor" }); // 光塔底座（很矮，可以直接走上去）
        k.solid(0, 0.35, 0, 2.6, 7.5, 2.6, { c: 0x141a26, m: "metal", noWalk: true });
        for (let i = 0; i < 5; i++) { // 一節一節的玻璃與發光環
          k.b.box(3.0, 0.9, 3.0, { p: [0, 1.4 + i * 1.4, 0], c: 0x9fe8ff, m: "pane" });
          k.b.box(3.05, 0.08, 3.05, { p: [0, 1.95 + i * 1.4, 0], c: i % 2 ? A2 : A1, m: "glow", e: 2 });
        }
        k.b.cone(1.4, 3, { p: [0, 9.4, 0], c: 0x141a26, m: "metal", seg: 4 });
        k.b.sphere(0.45, { p: [0, 11.2, 0], c: A1, m: "glow", e: 4, seg: 12 });
        k.holoRing(0, 4.2, 0, 4.6, A1, 0.35);
        k.holoRing(0, 7.0, 0, 3.4, A2, -0.5, 0.15);
        k.holoRing(0, 9.6, 0, 2.2, GOLD, 0.8, -0.2);
        for (const r of [6.6, 7.0]) k.b.torus(r, 0.05, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0], c: A2, m: "glow", e: 1.2, seg: 64 });
        k.lights.push({ x: 0, y: 5, z: 0, color: A1, power: 110 });

        // ---- 頭頂的磁浮軌道與列車 ----
        k.b.box(260, 0.6, 2.4, { p: [0, 13.2, 0], c: 0x1c2230, m: "metal" });
        for (const s of [-1, 1]) k.b.box(260, 0.08, 0.1, { p: [0, 13.55, s * 1.1], c: A1, m: "glow", e: 1.8 });
        for (const x of [-12, 12]) { // 軌道支柱（有碰撞，也是大道上的掩體）
          k.solid(x, 0, 0, 1.4, 12.9, 1.4, { c: 0x2a3244, m: "trim", noWalk: true });
          k.b.box(1.5, 0.1, 1.5, { p: [x, 2.5, 0], c: A1, m: "glow", e: 1.5 });
          k.b.box(4, 0.8, 2.6, { p: [x, 12.6, 0], c: 0x2a3244, m: "trim" });
        }
        k.train(14.5, 0, A1);

        // ---- 大道上的掩體與街景 ----
        hoverCar(-8, -27, 0, 0x8a1a3a); hoverCar(8, 27, 0, 0x1a3a8a);
        hoverCar(-6, 12, 1, 0xd8dee8); hoverCar(6, -12, 1, 0x2a2a34);
        hoverCar(-19, -30, 1, 0xb8923a); hoverCar(19, 30, 1, 0x3a8a6a);
        vending(-24.2, -11.5, 1, A1); vending(24.2, 11.5, 3, A2);
        vending(-24.2, 11.5, 1, GOLD); vending(24.2, -11.5, 3, A1);
        // 路邊攤：棚子＋櫃台
        for (const [x, z, s] of [[-12, -34, 1], [12, 34, -1]]) {
          k.canopy(x, z, 5, 3, 2.7, 0x3a2050);
          k.solid(x, 0, z + s * 0.9, 4.4, 1.1, 0.7, { c: 0x2a2030, m: "trim" });
          k.neon(x, 2.3, z + s * 1.55, s > 0 ? 2 : 0, 3.2, 0.6, GOLD, "屋台");
        }
        k.barrier(-5, 31, 0); k.barrier(5, 31, 0); k.barrier(-5, -31, 0); k.barrier(5, -31, 0);
        k.crateStack(-17, -20, 0); k.crateStack(17, 20, 0);
        k.crate(-13, 6, 1.2, { glow: A1 }); k.crate(13, -6, 1.2, { glow: A2 });
        k.planter(-8, -7, 4, 1.2); k.planter(8, 7, 4, 1.2);
        k.planter(-8, 7, 1.2, 4); k.planter(8, -7, 1.2, 4);
        // 南北兩端的車站
        for (const s of [-1, 1]) {
          k.canopy(0, s * 39, 10, 4, 3, 0x1c2232);
          k.billboard(0, 3.6, s * 37.95, s > 0 ? 0 : 2, 6, 0.9, s > 0 ? "南站 SOUTH" : "北站 NORTH", [A1, A2]);
        }
        // 地面：發光的車道線與斑馬線
        for (let z = -42; z <= 42; z += 6) if (Math.abs(z) > 9) k.mark(-3, z, 0.18, 3, A1, true), k.mark(3, z, 0.18, 3, A2, true);
        for (const z of [-21, 21]) for (let i = -4; i <= 4; i++) k.mark(i * 1.5, z, 0.8, 2.6, 0x8a90a0);
        k.lamp(-10, -21, 6, A1, true, 1); k.lamp(10, 21, 6, A2, true, 3);
        k.barrels.push({ x: -15, z: -12 }, { x: 15, z: 12 }, { x: -20, z: 26 }, { x: 20, z: -26 }, { x: -41, z: 20 }, { x: 41, z: -20 });

        // ---- 遠景：巨型摩天大樓與天空中的飛行車流 ----
        k.skyline(40, 40, 160, [A1, A2, GOLD, 0x8a6aff]);
        k.traffic(48, 60, 115, 22, 48, [0xff3b5c, 0xffd9a0, A1, A2], 18);
      },
    },

    /* ==================================================================
     *  地圖二：焦土・末日之城（世界將要毀滅）
     * ------------------------------------------------------------------
     *  隕石撞擊後的城市廢墟。中央是還在燃燒的隕石坑，兩棟倒塌的大樓斜躺在地上
     *  （可以沿著它走到高處），四周是燒毀的車輛、殘破的建築與防線。
     *  天空是翻騰的血紅雲層、碎裂的月亮與不斷落下的流星。
     * ================================================================== */
    {
      id: "ruin", name: "焦土・末日之城", en: "LAST DAY", tag: "末日廢墟 · 高低落差",
      desc: "隕石雨摧毀的城市。月亮已經碎裂、天空不斷落下流星，燃燒的殘骸與倒塌的大樓構成危險的戰場。",
      half: 46, weather: "ash", music: { root: 46, tempo: 96 },
      theme: {
        ground: { tex: "cracked", scale: 8, rough: 0.95, metal: 0, bump: 1.1 },
        wall: { tex: "concrete", scale: 5, rough: 0.9, metal: 0.02 },
        floor: { tex: "cracked", scale: 5, rough: 0.9, metal: 0.02 },
        trim: { tex: "rust", scale: 3, rough: 0.7, metal: 0.4 },
      },
      pal: {
        ground: 0x4a4038, wall: 0x5a5048, wall2: 0x463d36, floor: 0x5a5048, dark: 0x1c1612,
        crate: 0x4a3a2a, crate2: 0x3a3630, accent1: 0xff6a1a, accent2: 0xffb347, plant: 0x3a3020, hazard: 0xc9a020,
      },
      sky: {
        top: 0x030001, horizon: 0x3a0c04, bottom: 0x0a0202, stars: 0, aurora: 0, planet: 0, doom: 1,
        sunDir: [-0.4, 0.35, -0.85], sunColor: 0xff8a50, sunPower: 2.4, sunDisc: 0.6,
        hemiSky: 0xb06a48, hemiGround: 0x4a2a1e, hemiPower: 2.3,
        fog: 0x2e1008, fogNear: 34, fogFar: 175, exposure: 1.3,
      },
      bases: [{ x: 0, z: 40 }, { x: 0, z: -40 }],
      points: [{ name: "A", x: -28, z: 6, r: 6 }, { name: "B", x: 0, z: 0, r: 8 }, { name: "C", x: 28, z: -6, r: 6 }],
      shot: { pos: [-30, 8, 32], look: [8, 6, -18] }, // 從西南往東北拍，讓碎裂的月亮入鏡
      bossSpawn: { x: 0, z: -16 }, playerSpawn: { x: 0, z: 36 },
      pickups: [
        ["health", -14, 18], ["health", 14, -18], ["armor", -30, 6], ["armor", 30, -6], ["armor", 0, 26], ["armor", 0, -26],
        ["ammo", -38, -14], ["ammo", 38, 14], ["ammo", -12, -6], ["ammo", 12, 6], ["grenade", -20, -30], ["grenade", 20, 30],
      ],
      build(k) {
        const P = k.pal;
        const FIRE = P.accent1, EMBER = P.accent2;
        k.perimeter(6, 0x3a322c);

        // ---- 中央：仍在燃燒的隕石與撞擊坑 ----
        k.b.sphere(1, { p: [0, 1.1, 0], s: [3.0, 2.3, 2.6], r: [0.3, 0.6, 0.2], c: 0x1a1412, m: "matte", seg: 10 });
        k.b.sphere(1, { p: [0.6, 2.4, -0.4], s: [1.8, 1.4, 1.6], r: [0.8, 0.2, 0.4], c: 0x221a16, m: "matte", seg: 8 });
        for (let i = 0; i < 9; i++) { // 隕石表面發光的裂縫
          const a = (i / 9) * Math.PI * 2;
          k.b.box(0.12, 2.2, 0.12, { p: [Math.cos(a) * 2.2, 1.4, Math.sin(a) * 1.9], r: [Math.sin(a) * 0.8, a, 0.5], c: FIRE, m: "glow", e: 3 });
        }
        World.addBox(0, 1.9, 0, 6.2, 3.8, 5.4, { noWalk: true }); // 隕石的碰撞（包含上面那塊）
        k.fire(0, 2.8, 0, 1.6);
        for (let i = 0; i < 10; i++) k.crack(Math.cos(i * 0.63) * 3, Math.sin(i * 0.63) * 3, 6 + (i % 3) * 2, i % 2 ? FIRE : EMBER, 0.14);
        // 撞擊坑邊緣：一圈矮土堆（可以直接走上去）與幾塊大碎石（掩體）
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          k.solid(Math.cos(a) * 10, 0, Math.sin(a) * 10, 3.2, 0.35, 3.2, { c: 0x3a302a, m: "floor" });
          k.rubble(Math.cos(a) * 10, Math.sin(a) * 10, 1.6, 4, 0x4a3e36);
        }
        for (const a of [0.3, 1.9, 3.4, 5.0]) {
          const x = Math.cos(a) * 6.5, z = Math.sin(a) * 6.5;
          k.solid(x, 0, z, 2.0, 1.4, 1.6, { c: 0x3a2e28, m: "wall" });
          /* 疊在上面的一塊斜石頭：先算出它旋轉後「一半的高度」，
           * 讓最低的那個角剛好落在下面石頭的頂面（1.4 公尺），不會陷進去也不會浮空 */
          const rot = [0.12, a, 0.18];
          const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], "XYZ")).elements;
          const halfY = Math.abs(m[1]) * 0.6 + Math.abs(m[5]) * 0.4 + Math.abs(m[9]) * 0.5;
          k.b.box(1.2, 0.8, 1.0, { p: [x, 1.4 + halfY - 0.04, z], r: rot, c: 0x2a221e, m: "wall" });
          World.addBox(x, 1.4 + halfY, z, 1.3, halfY * 2, 1.3, { noWalk: true }); // 上面那塊石頭的碰撞
        }

        // ---- 兩棟倒塌的大樓：斜躺在地上，可以一路走到 7 公尺高 ----
        k.fallenTower(14, -24, 26, 7, 7, 0x4a4440, false);
        k.fallenTower(-40, 24, 26, 7, 7, 0x4a4440, true);
        k.fire(37, 7.6, -24, 0.8); k.fire(-37, 7.6, 24, 0.8);

        // ---- 殘破的建築：只剩外牆，裡面有一座坍塌形成的高台（狙擊點） ----
        for (const s of [-1, 1]) {
          const cx = s * 26, cz = s * 6;
          const z0 = cz - 5, z1 = cz + 5;
          k.ruinWall(cx - s * 3.75, z0, 4.5, true, 2.2, 4.4); k.ruinWall(cx + s * 3.75, z0, 4.5, true, 1.4, 3.2);
          k.ruinWall(cx - s * 3.75, z1, 4.5, true, 2.2, 4.4); k.ruinWall(cx + s * 3.75, z1, 4.5, true, 1.4, 3.2);
          k.ruinWall(cx + s * 6, cz, 10, false, 3.2, 5.2); // 外側（靠地圖邊緣）整面牆
          // 內側（面向中央）的牆中間留一個 3 公尺寬的入口
          k.ruinWall(cx - s * 6, cz - 3.25, 3.5, false, 1.2, 2.6); k.ruinWall(cx - s * 6, cz + 3.25, 3.5, false, 1.2, 2.6);
          // 坍塌的樓板：靠外牆的一塊 3 公尺高台，前面一座碎石樓梯
          k.solid(cx + s * 4, 0, cz, 3.5, 3, 8.5, { c: P.wall2, m: "floor" });
          k.rubble(cx, cz + 3, 1.2, 6);
          // 從入口往外牆方向爬上高台的碎石樓梯
          k.stairs(cx - s * 3.75, cz, s < 0 ? 3 : 1, 2.4, 3);
          k.lights.push({ x: cx, y: 2.5, z: cz, color: EMBER, power: 30, flicker: true });
        }

        // ---- 北邊斷掉的高架橋：兩根巨柱、斷裂的橋面與垂下的鋼筋 ----
        for (const x of [-12, 12]) {
          k.solid(x, 0, -30, 2.2, 8.6, 2.2, { c: 0x5a5048, m: "wall", noWalk: true });
          k.b.box(2.6, 0.6, 2.6, { p: [x, 8.33, -30], c: 0x3a322c, m: "trim" });
        }
        k.b.box(30, 0.8, 7, { p: [0, 9, -30], c: 0x5a5048, m: "wall" });
        // 塌下來的兩段橋面：一端搭在完整橋面的斷口（高 9 公尺），另一端插進地面
        const slab = (xHigh, xLow, width) => {
          const len = Math.hypot(xLow - xHigh, 9);
          const ang = Math.atan2(9, xHigh - xLow); // 高的一端在 xHigh
          k.b.box(len, 0.8, width, { p: [(xHigh + xLow) / 2, 4.5, -30.3], r: [0, 0, ang], c: 0x5a5048, m: "wall" });
          k.rubble(xLow, -30.3, 2.2, 10); // 插進地面處的碎石
          // 碰撞：沿著斜面每 1 公尺一塊（只有低處會擋到人）
          const n = Math.ceil(Math.abs(xHigh - xLow));
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const x = Util.lerp(xLow, xHigh, t), y = 9 * t;
            World.addBox(x, y, -30.3, Math.abs(xHigh - xLow) / n + 0.02, 1.0, width, { noWalk: true });
          }
        };
        slab(-15, -28, 5.6);
        slab(15, 24, 5.0);
        for (let i = 0; i < 8; i++) k.b.limb([-14 + i * 4, 8.6, -27], [-14 + i * 4 + (k.rnd() - 0.5), 5.5 + k.rnd() * 2, -27 + (k.rnd() - 0.5)], 0.03, { c: 0x5a3a2a, m: "metal", flat: true });
        World.addBox(0, 9, -30, 30, 0.8, 7, { noWalk: true });

        // ---- 燒毀的車輛、公車與戰車殘骸 ----
        k.wreck(-8, 22, 0, true); k.wreck(9, -21, 1, true); k.wreck(-17, -12, 1, false); k.wreck(17, 12, 0, false);
        k.wreck(-34, -30, 0, true); k.wreck(34, 30, 0, false);
        // 公車殘骸（側躺）
        World.addBox(-6, 1.3, 33, 10, 2.6, 2.8);
        k.b.rbox(10, 2.6, 2.8, 0.25, { p: [-6, 1.3, 33], r: [0.08, 0, 0], c: 0x6a3a1a, m: "trim" });
        for (let i = 0; i < 6; i++) k.b.box(1.2, 0.8, 2.84, { p: [-9.5 + i * 1.5, 1.8, 33], c: 0x0a0806, m: "matte" });
        k.fire(-3, 2.6, 33, 0.7, false);
        // 戰車殘骸：砲塔歪掉、砲管斷裂
        World.addBox(8, 0.85, -36, 6.4, 1.7, 3.4);
        k.b.rbox(6.4, 1.3, 3.4, 0.2, { p: [8, 0.75, -36], c: 0x3a3a2a, m: "trim" });
        k.b.rbox(2.8, 0.9, 2.4, 0.2, { p: [8.6, 1.8, -36.3], r: [0, 0.5, 0.15], c: 0x34342a, m: "trim" });
        k.b.limb([9.4, 1.9, -35.6], [11.6, 2.4, -34.2], 0.13, { c: 0x2a2a20, m: "metal", flat: true });
        k.fire(7, 1.8, -36, 0.6, false);

        // ---- 防線：沙包、拒馬、刺絲網、水泥護欄 ----
        k.sandbags(0, 28, 0, 6); k.sandbags(0, -24, 0, 6);
        k.sandbags(-20, -2, 1, 5); k.sandbags(20, 2, 1, 5);
        for (const [x, z] of [[-14, 30], [14, -30], [-24, -18], [24, 18], [-38, 6], [38, -6]]) k.hedgehog(x, z);
        for (const [x, z] of [[-30, -22], [30, 22]]) { // 刺絲網（純裝飾，矮）
          for (let i = 0; i < 6; i++) k.b.torus(0.45, 0.02, { p: [x + i * 0.9 - 2.25, 0.45, z], r: [0, Math.PI / 2, 0], c: 0x6a6a6a, m: "metal", seg: 12 });
          World.addBox(x, 0.45, z, 5.4, 0.9, 0.9, { noWalk: true }); // 碰撞：不能直接走過去，但跳得過
        }
        k.barrier(-38, -36, 1); k.barrier(38, 36, 1); k.barrier(-22, 36, 0); k.barrier(22, -36, 0);
        k.crateStack(-38, 18, 1); k.crateStack(38, -18, 1);

        // ---- 地上的熔岩裂縫與彈坑 ----
        for (const [x, z] of [[-22, 30], [22, -30], [-36, -4], [36, 4], [-6, -16], [6, 16]]) {
          k.crack(x, z, 7, FIRE, 0.1);
          k.b.torus(2.2, 0.35, { p: [x, 0.05, z], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.4], c: 0x2a221c, m: "matte", seg: 18 });
        }
        k.fire(-22, 0.1, 30, 0.5, false); k.fire(36, 0.1, 4, 0.5, false);
        k.barrels.push({ x: -10, z: 28 }, { x: 10, z: -28 }, { x: -28, z: -10 }, { x: 28, z: 10 }, { x: -40, z: 34 }, { x: 40, z: -34 });

        // ---- 更多廢墟細節：散落的殘牆、倒下的電線桿與電線、碎石堆 ----
        k.ruinWall(-16, -34, 6, true, 0.8, 2.4); k.ruinWall(16, 34, 6, true, 0.8, 2.4);
        k.ruinWall(-40, -24, 6, false, 1.2, 3.2); k.ruinWall(40, 24, 6, false, 1.2, 3.2);
        k.ruinWall(-6, -10, 3, true, 1.0, 1.6); k.ruinWall(6, 10, 3, true, 1.0, 1.6);
        for (const [x, z, ry] of [[-30, 36, 0.4], [30, -36, -0.6], [-41, 0, 1.2], [41, 2, -1.0]]) {
          /* 倒下的電線桿：低的一端貼地，高的一端靠在一塊碎石上（傾斜 0.1 弧度）。
           * 先把原點移到電線桿中央並轉向 ry，柱子沿著自己的 X 軸躺著。 */
          const tilt = 0.1, half = 4.5, r = 0.17;
          const yHigh = r + 2 * half * Math.sin(tilt); // 高的一端（-X 那端）的中心高度
          k.b.push(x, 0, z, ry);
          k.b.cyl(0.14, 0.18, 9, { p: [0, r + half * Math.sin(tilt), 0], r: [0, 0, Math.PI / 2 - tilt], c: 0x2a221c, m: "trim", seg: 8 });
          k.b.box(0.9, yHigh - r + 0.05, 0.9, { p: [-half + 0.4, (yHigh - r + 0.05) / 2, 0], r: [0, 0.4, 0], c: 0x3a302a, m: "wall" }); // 撐著它的碎石
          k.b.box(0.15, 0.15, 2.2, { p: [-half + 0.3, yHigh + 0.12, 0], c: 0x2a221c, m: "trim" }); // 橫擔
          for (const sz of [-1, 1]) k.b.limb([-half + 0.3, yHigh + 0.12, sz * 1.05], [-1.5, 0.02, sz * 2.6], 0.02, { c: 0x111111, m: "metal", flat: true }); // 垂到地上的電線
          k.b.pop();
          // 碰撞：撐住電線桿的那塊碎石
          World.addBox(x - Math.cos(ry) * (half - 0.4), (yHigh + 0.1) / 2, z + Math.sin(ry) * (half - 0.4), 0.9, yHigh + 0.1, 0.9, { noWalk: true });
          /* 碰撞：桿身本身。沿著桿子每 0.5 公尺放一個方塊，高度跟著桿子的斜度：
           *   貼地的那端很矮（可以直接跨過），越靠近碎石越高（要繞過去或跳過去）。
           *   lx 是沿著桿子的位置（-half 是高的一端），換算成世界座標要套用旋轉 ry。 */
          const c = Math.cos(ry), sn = Math.sin(ry);
          for (let lx = -half + 0.25; lx < half; lx += 0.5) {
            const top = r + (half - lx) * Math.sin(tilt) + 0.18; // 這一段桿子的頂端高度
            World.addBox(x + lx * c, top / 2, z - lx * sn, Math.abs(c) * 0.5 + 0.34, top, Math.abs(sn) * 0.5 + 0.34, { noWalk: true });
          }
        }
        for (const [x, z] of [[-24, 22], [24, -22], [-36, 16], [36, -16], [-12, 12], [12, -12], [-20, -24], [20, 24]]) k.rubble(x, z, 2, 9);
        // 地面的焦黑痕跡
        for (const [x, z] of [[-18, 8], [18, -8], [0, 20], [0, -20]]) k.b.cyl(3, 3, 0.02, { p: [x, 0.015, z], c: 0x0e0a08, m: "matte", seg: 18 });

        // ---- 遠景：斷裂、燃燒的摩天大樓 ----
        const s = World.half;
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2 + k.rnd() * 0.15;
          const dist = s + 40 + k.rnd() * 50;
          const kk = dist / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
          const x = Math.cos(a) * kk, z = Math.sin(a) * kk;
          const w = 6 + k.rnd() * 7, h = 25 + k.rnd() * 55;
          const tilt = (k.rnd() - 0.5) * 0.25;
          k.b.box(w, h, w * 0.9, { p: [x, h / 2, z], r: [tilt * 0.3, k.rnd() * 3, tilt], c: 0x1a1412, m: "matte" });
          k.b.box(w * 0.7, w * 0.5, w * 0.6, { p: [x + w * 0.2, h + 1, z], r: [0.4, 0, 0.7], c: 0x1a1412, m: "matte" }); // 斷掉的頂端
          for (let y = 4; y < h - 4; y += 4 + k.rnd() * 6) {
            if (k.rnd() < 0.5) k.b.box(w * 0.4, 1.2, 0.3, { p: [x, y, z + w * 0.46], c: FIRE, m: "glow", e: 0.4 + k.rnd() * 1.2 });
          }
        }
      },
    },

    /* ==================================================================
     *  地圖三：天穹・軌道環站（潔白的太空科技站）
     * ------------------------------------------------------------------
     *  四周是整面玻璃的外殼，可以直接看到星雲、行星與繞著站體旋轉的巨大環。
     *  中央是能量反應爐，四個白色艙體由兩座「硬光橋」相連，跳躍板可以直接
     *  把你彈上艙頂；東西兩側停著穿梭機。
     * ================================================================== */
    {
      id: "orbit", name: "天穹・軌道環站", en: "ORBITAL HALO", tag: "太空站 · 跳躍板與硬光橋",
      desc: "環繞行星的白色太空站。整面玻璃外殼外是星雲與巨大的旋轉環；用跳躍板與硬光橋在艙體之間快速移動。",
      half: 42, weather: "motes", music: { root: 58, tempo: 124 },
      theme: {
        ground: { tex: "hex", scale: 5, rough: 0.35, metal: 0.5, bump: 0.7 },
        wall: { tex: "panel", scale: 4, rough: 0.35, metal: 0.3 },
        floor: { tex: "panel", scale: 3, rough: 0.4, metal: 0.4 },
        trim: { tex: "metal", scale: 3, rough: 0.35, metal: 0.8 },
      },
      pal: {
        ground: 0x9aa3b3, wall: 0xe2e8f0, wall2: 0xc2cad6, floor: 0xa8b2c2, dark: 0x2a3242,
        crate: 0xd0d6e0, crate2: 0x5a6a8a, accent1: 0x3ad6ff, accent2: 0xb46bff, plant: 0x3a8a8a, hazard: 0xffb347,
      },
      sky: {
        top: 0x010208, horizon: 0x0a0a28, bottom: 0x010208, stars: 1.6, aurora: 0, planet: 1, nebula: 1,
        sunDir: [0.55, 0.6, -0.4], sunColor: 0xffffff, sunPower: 3.0, sunDisc: 1.3,
        hemiSky: 0xb0c0f0, hemiGround: 0x606a8a, hemiPower: 1.5,
        fog: 0x05061a, fogNear: 70, fogFar: 300, exposure: 1.0,
      },
      bases: [{ x: 0, z: 36 }, { x: 0, z: -36 }],
      points: [{ name: "A", x: -20, z: 0, r: 6 }, { name: "B", x: 0, z: 0, r: 7 }, { name: "C", x: 20, z: 0, r: 6 }],
      shot: { pos: [-26, 13, 34], look: [4, 3, -6] },
      bossSpawn: { x: 0, z: -15 }, playerSpawn: { x: 0, z: 32 },
      pickups: [
        ["health", -14, 12], ["health", 14, -12], ["armor", -3, 3], ["armor", -24, -22], ["armor", 24, 22], ["armor", -34, 14], ["armor", 34, -14],
        ["ammo", 0, 22], ["ammo", 0, -22], ["ammo", -30, 0], ["ammo", 30, 0], ["grenade", -12, -26], ["grenade", 12, 26],
      ],
      build(k) {
        const P = k.pal;
        const A1 = P.accent1, A2 = P.accent2;
        const s = World.half;

        // ---- 玻璃外殼：下半段白色牆板，上面整片玻璃，每 7 公尺一根發光的肋條 ----
        for (const [x, z, w, d] of [[0, -s + 0.5, s * 2, 1], [0, s - 0.5, s * 2, 1], [-s + 0.5, 0, 1, s * 2 - 2], [s - 0.5, 0, 1, s * 2 - 2]]) {
          World.addBox(x, 4, z, w, 8, d, { noWalk: true });
          k.b.box(w, 1.2, d, { p: [x, 0.6, z], c: P.wall, m: "wall" });
          k.b.box(w > d ? w - 0.04 : 0.3, 6.8, w > d ? 0.3 : d - 0.04, { p: [x, 4.6, z], c: 0x9fd8ff, m: "pane", uvScale: 9 });
          const side = w < d; // 左右兩面的頂框稍微窄一點，四個角落才不會重疊
          k.b.box(w + (side ? 0.06 : 0.1), 0.3, d + (side ? 0 : 0.1), { p: [x, 8.1 + (side ? 0.01 : 0), z], c: P.wall2, m: "trim" });
          k.b.box(w > d ? w - 0.1 : 1.04, 0.08, w > d ? 1.04 : d - 0.1, { p: [x, 1.25, z], c: A1, m: "glow", e: 1.6 });
          const len = Math.max(w, d);
          for (let t = -len / 2 + 3.5; t < len / 2; t += 7) {
            const rx = w > d ? x + t : x, rz = w > d ? z : z + t;
            // 肋條：厚度 1.03（牆板 1.0、發光帶 1.04、頂框 1.06 之間），上緣比玻璃低，彼此都不在同一平面
            k.b.box(w > d ? 0.35 : 1.03, 6.78, w > d ? 1.03 : 0.35, { p: [rx, 4.5, rz], c: P.wall2, m: "trim" });
            k.b.box(w > d ? 0.08 : 1.12, 6, w > d ? 1.12 : 0.08, { p: [rx, 4.6, rz], c: A2, m: "glow", e: 1.2 });
          }
        }

        // ---- 中央反應爐：高台、四面樓梯、能量核心與三圈旋轉光環 ----
        k.solid(0, 0, 0, 12, 1.5, 12, { c: P.floor, m: "floor" });
        k.b.box(12.1, 0.1, 12.1, { p: [0, 1.25, 0], c: A1, m: "glow", e: 1.3 });
        k.stairs(0, -9, 2, 4, 1.5); k.stairs(0, 9, 0, 4, 1.5);
        k.stairs(-9, 0, 1, 4, 1.5); k.stairs(9, 0, 3, 4, 1.5);
        k.solid(0, 1.5, 0, 3.2, 10, 3.2, { c: P.dark, m: "trim", noWalk: true });
        World.addBox(0, 6.6, 0, 4.1, 10.2, 4.1, { noWalk: true }); // 外框四根柱子也算在碰撞裡
        k.b.cyl(1.2, 1.2, 9.4, { p: [0, 6.4, 0], c: A1, m: "glow", e: 2.4, seg: 16 }); // 發光的能量柱（從框架縫隙看得到）
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          k.b.box(0.5, 10.2, 0.5, { p: [sx * 1.75, 6.6, sz * 1.75], c: P.wall, m: "wall" });
        }
        k.b.cyl(2.4, 1.6, 1.2, { p: [0, 12.1, 0], c: P.wall, m: "wall", seg: 12 });
        k.holoRing(0, 5, 0, 4.2, A1, 0.6);
        k.holoRing(0, 7.6, 0, 3.4, A2, -0.8, 0.3);
        k.holoRing(0, 10.2, 0, 2.6, A1, 1.1, -0.25);
        k.anim((dt, t) => { // 能量核心偶爾放出電弧火花
          if (Math.sin(t * 3.1) > 0.96 && k._near(0, 0, 60)) FX.sparks(Util.rand(-1.6, 1.6), Util.rand(3, 11), 1.8, 0, 0, 1, A1, 6, 4);
        });
        k.lights.push({ x: 3, y: 4, z: 3, color: A1, power: 80 }, { x: -3, y: 4, z: -3, color: A2, power: 60 });
        // 高台四角的矮玻璃掩體
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          k.solid(sx * 4.5, 1.5, sz * 4.5, 2.4, 1.0, 0.4, { c: 0x9fe8ff, m: "pane", noWalk: true });
          k.b.box(2.44, 0.06, 0.44, { p: [sx * 4.5, 2.52, sz * 4.5], c: A1, m: "glow", e: 2 });
        }

        // ---- 四個白色艙體（屋頂可以上去），兩兩之間有硬光橋 ----
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const cx = sx * 24, cz = sz * 22;
          k.building(cx, cz, 10, 8, 3.4, { c: P.wall, neon: sx * sz > 0 ? A1 : A2, windows: [A1, A2], litRate: 0.7 });
          k.roofStairs(cx, cz, 10, 8, 3.4, sz < 0 ? "n" : "s", 0); // 樓梯在外側，避開中間的硬光橋
          // 屋頂的通訊碟
          k.b.cyl(0.12, 0.18, 1.6, { p: [cx + sx * 2.5, 4.2, cz], c: P.dark, m: "metal", seg: 8 });
          k.b.sphere(1.2, { p: [cx + sx * 2.5, 5.2, cz], s: [1, 0.3, 1], r: [0.5, 0, sx * 0.4], c: P.wall, m: "paint", seg: 16 });
          World.addBox(cx + sx * 2.5, 4.3, cz, 0.45, 1.8, 0.45, { noWalk: true }); // 支柱
          World.addBox(cx + sx * 2.5, 5.2, cz, 2.2, 0.9, 2.2, { noWalk: true }); // 碟面
          // 跳躍板：從大廳直接彈上艙頂
          k.jumpPad(sx * 13, sz * 31, cx, 3.4, cz, sx * sz > 0 ? A1 : A2);
        }
        k.bridge(0, -22, 38, true, 3.5, 3.4, A2);
        k.bridge(0, 22, 38, true, 3.5, 3.4, A1);

        // ---- 東西兩側停泊的穿梭機（大型掩體） ----
        for (const sx of [-1, 1]) {
          const x = sx * 33;
          World.addBox(x, 1.6, 0, 4.2, 3.2, 13, { noWalk: true });
          const b = k.b;
          b.rbox(4.2, 2.8, 12, 1.0, { p: [x, 1.8, 0], c: P.wall }); // 機身
          b.rbox(3.0, 1.2, 3, 0.5, { p: [x, 3.3, -3.5], c: 0x10223a, m: "pane" }); // 駕駛艙玻璃
          b.box(12, 0.3, 4, { p: [x, 1.6, 1.5], r: [0, 0, sx * 0.05], c: P.wall2, m: "wall" }); // 機翼
          World.addBox(x, 1.6, 1.5, 12, 0.6, 4, { noWalk: true }); // 機翼與尾翼的碰撞
          for (const wx of [-1, 1]) World.addBox(x + wx * 5.8, 2.3, 2.2, 0.4, 1.6, 2.4, { noWalk: true });
          for (const wx of [-1, 1]) b.box(0.3, 1.6, 2.4, { p: [x + wx * 5.8, 2.3, 2.2], c: P.wall2, m: "wall" });
          for (const ex of [-0.9, 0.9]) { // 引擎與藍色尾焰
            b.cyl(0.7, 0.8, 1.4, { p: [x + ex, 1.8, 6.4], r: [Math.PI / 2, 0, 0], c: P.dark, m: "metal", seg: 14 });
            b.cyl(0.55, 0.55, 0.05, { p: [x + ex, 1.8, 7.12], r: [Math.PI / 2, 0, 0], c: A1, m: "glow", e: 3, seg: 14 });
          }
          b.box(4.22, 0.12, 12, { p: [x, 1.2, 0], c: A2, m: "glow", e: 1.4 });
          b.box(0.3, 1.2, 0.3, { p: [x - 1.4, 0.6, -4], c: P.dark, m: "metal" }); // 起落架
          b.box(0.3, 1.2, 0.3, { p: [x + 1.4, 0.6, -4], c: P.dark, m: "metal" });
          k.mark(x, 0, 7, 16, A1, true); // 停機坪框線
          k.mark(x, 0, 6.6, 15.6, P.ground);
        }

        // ---- 掩體：白色貨箱、控制台、能量屏障 ----
        const panel = (x, z, dir) => {
          const along = dir % 2 === 0;
          k.solid(x, 0, z, along ? 2.2 : 0.9, 1.05, along ? 0.9 : 2.2, { c: P.wall2, m: "trim" });
          k.b.box(along ? 2.0 : 0.6, 0.04, along ? 0.6 : 2.0, { p: [x, 1.08, z], r: along ? [0.35, 0, 0] : [0, 0, 0.35], c: A1, m: "glow", e: 1.2 });
        };
        panel(-14, 6, 0); panel(14, -6, 0); panel(-6, 16, 1); panel(6, -16, 1);
        k.crateStack(-10, -18, 0); k.crateStack(10, 18, 0);
        k.crate(-20, 8, 1.3, { glow: A1 }); k.crate(20, -8, 1.3, { glow: A2 });
        k.energyWall(-20, -6, 4, 0.5, 2.2, A2); k.energyWall(20, 6, 4, 0.5, 2.2, A2);
        k.barrier(-5, 30, 0); k.barrier(5, 30, 0); k.barrier(-5, -30, 0); k.barrier(5, -30, 0);
        // 地板上的導引光帶
        for (const sd of [-1, 1]) {
          k.mark(sd * 7.5, 0, 0.12, 60, A1, true);
          k.mark(0, sd * 7.5, 60, 0.12, A1, true);
        }
        k.barrels.push({ x: 16, z: 16 }, { x: -16, z: -16 }, { x: -30, z: 18 }, { x: 30, z: -18 });

        // ---- 站體外：繞著站體緩慢旋轉的巨環、來往的太空船 ----
        const ring = new Builder();
        ring.torus(110, 2.2, { r: [Math.PI / 2, 0, 0], c: 0xc2cad6, m: "paint", seg: 96 });
        for (let i = 0; i < 24; i++) { // 環上的燈與艙段
          const a = (i / 24) * Math.PI * 2;
          ring.box(6, 5, 6, { p: [Math.cos(a) * 110, 0, Math.sin(a) * 110], r: [0, -a, 0], c: 0xb0b8c4, m: "paint" });
          ring.box(6.1, 0.4, 6.1, { p: [Math.cos(a) * 110, 1.5, Math.sin(a) * 110], r: [0, -a, 0], c: i % 2 ? A1 : A2, m: "glow", e: 2 });
        }
        const rg = ring.build({ cast: false });
        rg.position.set(0, -10, 0);
        rg.rotation.x = 0.35;
        k.dynamic(rg, (dt) => (rg.rotation.y += dt * 0.02));
        k.traffic(10, 130, 190, -10, 50, [A1, 0xffffff, A2], 34);
      },
    },

    /* ==================================================================
     *  地圖四：深淵・海底研究站
     * ------------------------------------------------------------------
     *  深海裡的研究基地。光束從遙遠的海面灑下、氣泡不斷往上冒，
     *  發光的水母在頭頂漂浮，巨大的鯨魚在外圍緩緩游過。
     *  中央是玻璃圓頂實驗室，北邊有一艘沉沒的潛艇，東西向的玻璃隧道
     *  是安全的移動路線。
     * ================================================================== */
    {
      id: "abyss", name: "深淵・海底研究站", en: "ABYSS STATION", tag: "深海基地 · 隧道與暗礁",
      desc: "深海中的研究站。光束從海面灑下、水母在頭頂漂浮、巨鯨在外圍游過；能見度低，善用玻璃隧道與暗礁掩護。",
      half: 44, weather: "bubbles", music: { root: 52, tempo: 92 },
      theme: {
        ground: { tex: "seabed", scale: 9, rough: 0.95, metal: 0, bump: 1.2 },
        wall: { tex: "metal", scale: 4, rough: 0.5, metal: 0.55 },
        floor: { tex: "hex", scale: 3, rough: 0.5, metal: 0.4 },
        trim: { tex: "rust", scale: 3, rough: 0.65, metal: 0.45 },
        pane: 0.5,
      },
      pal: {
        ground: 0x3e5a58, wall: 0x6a7880, wall2: 0x4a565e, floor: 0x5a6a72, dark: 0x121c1e,
        crate: 0x8a6a3a, crate2: 0x3a5a5a, accent1: 0x2affd5, accent2: 0xffb030, plant: 0x1a6a4a, hazard: 0xffb030,
      },
      sky: {
        top: 0x0a5a66, horizon: 0x03323c, bottom: 0x010a0e, stars: 0, aurora: 0, planet: 0, water: 1,
        sunDir: [0.15, 1, 0.2], sunColor: 0x8aeaff, sunPower: 1.6, sunDisc: 0,
        hemiSky: 0x3ac8d0, hemiGround: 0x0a2a2a, hemiPower: 1.8,
        fog: 0x04313b, fogNear: 10, fogFar: 80, exposure: 1.25,
      },
      bases: [{ x: 0, z: 38 }, { x: 0, z: -38 }],
      points: [{ name: "A", x: -22, z: -6, r: 6 }, { name: "B", x: 0, z: 0, r: 8 }, { name: "C", x: 22, z: 6, r: 6 }],
      shot: { pos: [24, 9, 32], look: [-2, 3, -6] },
      bossSpawn: { x: 0, z: -14 }, playerSpawn: { x: 0, z: 34 },
      pickups: [
        ["health", -10, 14], ["health", 10, -14], ["armor", -26, 18], ["armor", 26, -18], ["armor", -34, -2], ["armor", 34, 2],
        ["ammo", 0, 22], ["ammo", 0, -22], ["ammo", -18, 0], ["ammo", 18, 0], ["grenade", -36, 24], ["grenade", 36, -24],
      ],
      build(k) {
        const P = k.pal;
        const AQ = P.accent1, SODIUM = P.accent2;
        k.perimeter(9, 0x2a3a3c);

        // ---- 外圍的暗礁岩壁（貼著圍牆的大石塊） ----
        const s = World.half;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const kk = (s - 0.5) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
          const R = 2.5 + k.rnd() * 3;
          const cy = Math.min(1 + k.rnd() * 4, R * 1.4 - 0.3); // 石頭底部一定碰到地面
          const rx = Math.cos(a) * kk, rz = Math.sin(a) * kk;
          k.b.sphere(R, { p: [rx, cy, rz], s: [1, 1.4, 1], c: 0x1e2a2a, m: "matte", seg: 7 });
          // 碰撞：取石頭內部的方塊（寬 1.4R），玩家走到石頭邊就會被擋住
          const top = cy + R * 1.4 * 0.7;
          World.addBox(rx, top / 2, rz, R * 1.4, top, R * 1.4, { noWalk: true });
          (k.rocks ||= []).push({ x: rx, y: cy, z: rz, R, sy: 1.4 }); // 記下來，海草會避開
        }

        // ---- 中央：玻璃圓頂實驗室 ----
        k.dome(0, 0, 4.6, AQ);
        k.solid(0, 0, 0, 10, 0.3, 10, { c: P.floor, m: "floor" }); // 圓頂周圍的平台（很矮）
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          k.b.cyl(0.25, 0.3, 3, { p: [Math.cos(a) * 6.4, 1.5, Math.sin(a) * 6.4], c: P.dark, m: "metal", seg: 8 });
          World.addBox(Math.cos(a) * 6.4, 1.5, Math.sin(a) * 6.4, 0.6, 3, 0.6, { noWalk: true });
          k.b.sphere(0.35, { p: [Math.cos(a) * 6.4, 3.2, Math.sin(a) * 6.4], c: SODIUM, m: "glow", e: 2.5, seg: 10 });
        }

        // ---- 東西向的玻璃隧道：兩側玻璃牆（有碰撞），每隔一段有出入口，頂上是拱形肋條 ----
        for (const sx of [-1, 1]) {
          const x0 = sx * 9, x1 = sx * 41; // 隧道從圓頂旁一路通到圍牆
          const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
          for (const sz of [-1, 1]) {
            // 一面牆分成三段，中間留兩個 3 公尺寬的出入口
            const segs = [[0, 0.3], [0.42, 0.7], [0.8, 1]];
            for (const [a, b] of segs) {
              const sx0 = Util.lerp(x0, x1, a), sx1 = Util.lerp(x0, x1, b);
              const w = Math.abs(sx1 - sx0), mx = (sx0 + sx1) / 2;
              World.addBox(mx, 1.6, sz * 2.4, w, 3.2, 0.2, { noWalk: true });
              k.b.box(w, 3.0, 0.08, { p: [mx, 1.6, sz * 2.4], c: 0x9ff4ff, m: "pane" });
              k.b.box(w - 0.04, 0.25, 0.3, { p: [mx, 0.125, sz * 2.4], c: P.wall2, m: "trim" });
            }
          }
          for (let t = 0; t <= len; t += 3) { // 拱形肋條與燈
            const x = x0 + sx * t;
            k.b.torus(2.45, 0.08, { p: [x, 1.6, 0], r: [0, Math.PI / 2, 0], c: P.wall2, m: "metal", seg: 20, arc: Math.PI });
            for (const sz of [-1, 1]) {
              k.b.box(0.14, 1.62, 0.14, { p: [x, 0.8, sz * 2.45], c: P.wall2, m: "metal" }); // 肋條的立柱（站在地上）
              World.addBox(x, 0.8, sz * 2.45, 0.2, 1.6, 0.2, { noWalk: true });
            }
            if (t % 9 === 0) k.b.box(0.3, 0.05, 1.2, { p: [x, 3.98, 0], c: AQ, m: "glow", e: 2 });
          }
          k.b.box(len - 0.1, 0.06, 4.6, { p: [cx, 0.03, 0], c: P.floor, m: "floor" }); // 隧道地板
          k.lights.push({ x: sx * 25, y: 3, z: 0, color: AQ, power: 40 });
        }

        // ---- 兩座實驗大樓（屋頂可以上去） ----
        for (const sd of [-1, 1]) {
          const cx = sd * -26, cz = sd * 18;
          k.building(cx, cz, 12, 9, 3.4, { neon: AQ, windows: [AQ, SODIUM], litRate: 0.6, c: P.wall });
          k.roofStairs(cx, cz, 12, 9, 3.4, sd > 0 ? "e" : "w", 0);
          k.neon(cx + sd * 6.05, 2.4, cz + sd * 3.0, sd > 0 ? 1 : 3, 3.2, 0.7, AQ, sd > 0 ? "生物實驗室" : "深海動力");
        }

        // ---- 兩座橫躺的居住艙（大型圓筒，有舷窗） ----
        for (const sd of [-1, 1]) {
          const cx = sd * 24, cz = sd * 20;
          World.addBox(cx, 2.3, cz, 12, 4.6, 4.6, { noWalk: true });
          const b = k.b;
          b.cyl(2.2, 2.2, 12, { p: [cx, 2.4, cz], r: [0, 0, Math.PI / 2], c: 0xd8b060, m: "paint", seg: 20 }); // 黃色艙體
          for (const ex of [-1, 1]) b.sphere(2.2, { p: [cx + ex * 6, 2.4, cz], s: [0.4, 1, 1], c: 0xd8b060, m: "paint", seg: 16 });
          for (let i = 0; i < 4; i++) {
            const x = cx - 4.5 + i * 3;
            b.torus(2.25, 0.1, { p: [x, 2.4, cz], r: [0, Math.PI / 2, 0], c: P.dark, m: "metal", seg: 24 });
            for (const side of [-1, 1]) {
              b.cyl(0.42, 0.42, 0.12, { p: [x + 1.5, 2.6, cz + side * 2.18], r: [Math.PI / 2, 0, 0], c: P.dark, m: "metal", seg: 12 });
              b.cyl(0.32, 0.32, 0.14, { p: [x + 1.5, 2.6, cz + side * 2.2], r: [Math.PI / 2, 0, 0], c: AQ, m: "glow", e: 1.6, seg: 12 });
            }
          }
          for (const lx of [-4, 4]) for (const lz of [-1.4, 1.4]) b.box(0.3, 0.6, 0.3, { p: [cx + lx, 0.3, cz + lz], c: P.dark, m: "metal" });
        }

        // ---- 北邊：沉沒的潛艇殘骸（長條形的大掩體，身上長滿珊瑚） ----
        World.addBox(0, 2.1, -28, 22, 4.2, 4.6, { noWalk: true });
        k.b.push(0, 2.2, -28, 0, 0.12, 0);
        k.b.capsule(2.4, 18, { r: [0, 0, Math.PI / 2], c: 0x2a3436, m: "trim", seg: 18 });
        k.b.rbox(4, 3, 2.4, 0.6, { p: [-2, 3, 0], c: 0x26302e, m: "trim" }); // 指揮塔
        k.b.box(0.15, 2, 0.15, { p: [-2, 5.2, 0], c: P.dark, m: "metal" }); // 潛望鏡
        k.b.box(3, 0.2, 5, { p: [10.5, 0.4, 0], r: [0.4, 0, 0], c: 0x26302e, m: "trim" }); // 尾翼
        k.b.pop();
        for (const x of [-8, -3, 4, 9]) k.coral(x, -25.2, [AQ, 0xff5aa8, SODIUM][Math.abs(x) % 3]);
        // 南邊：沉在海底的貨櫃堆
        // 左邊疊兩層（上層和下層對齊），右邊單獨一個；中間留一條通道
        k.container(-6, 27, 0, 0x8a4a34);
        k.container(-6, 27, 0, 0x5a7a4a, 2.6);
        k.container(6, 27.5, 0, 0x34647a);
        k.coral(-10, 25, 0xff5aa8); k.coral(10, 30, AQ);

        // ---- 暗礁、礦石與照明 ----
        const rock = (x, z, r) => {
          k.b.sphere(r, { p: [x, r * 0.55, z], s: [1.2, 0.9, 1], r: [0, k.rnd() * 3, 0], c: 0x26302e, m: "matte", seg: 10 });
          // 頂上長著一層顏色較淺的藻，旁邊靠著一顆小石頭，輪廓比較不像一顆球
          k.b.sphere(r * 0.8, { p: [x, r * 1.02, z], s: [1.15, 0.42, 0.95], c: 0x2e4a40, m: "matte", seg: 9 });
          k.b.sphere(r * 0.45, { p: [x + r * 0.95, r * 0.26, z + r * 0.3], s: [1.1, 0.8, 1], c: 0x222c2a, m: "matte", seg: 7 });
          World.addBox(x, r * 0.6, z, r * 2.1, r * 1.2, r * 2.0); // 碰撞範圍包住整顆礁石（它會被隨機轉向）
        };
        rock(-14, -12, 1.6); rock(14, 12, 1.6); rock(-30, 8, 1.4); rock(30, -8, 1.4);
        rock(-12, 32, 1.2); rock(12, -32, 1.2); rock(-38, -20, 1.8); rock(38, 20, 1.8);
        for (const [x, z] of [[-18, 26], [18, -26], [-36, 30], [36, -30]]) {
          k.lamp(x, z, 5, SODIUM, false, 1);
        }
        k.crateStack(-16, 10, 1); k.crateStack(16, -10, 1);
        k.sandbags(-6, 34, 0, 5); k.sandbags(6, -34, 0, 5);
        k.barrels.push({ x: -20, z: -14 }, { x: 20, z: 14 }, { x: -32, z: 32 }, { x: 32, z: -32 });

        // ---- 海底生態：海草、珊瑚、水母、魚群、巨鯨、從上方灑下的光束 ----
        for (const [x, z] of [[-36, 14], [36, -14], [-30, -30], [30, 30], [-12, -36], [12, 36], [-40, -10], [40, 10], [-20, 34], [20, -34], [-6, 18], [6, -18]]) {
          k.kelp(x, z, 5 + k.rnd() * 5, 5);
        }
        for (const [x, z, c] of [[-24, 4, AQ], [24, -4, 0xff5aa8], [-8, -16, SODIUM], [8, 16, AQ], [-34, 24, 0xff5aa8], [34, -24, AQ]]) k.coral(x, z, c);
        for (let i = 0; i < 8; i++) k.jelly(Util.lerp(-30, 30, k.rnd()), 7 + k.rnd() * 8, Util.lerp(-30, 30, k.rnd()), [AQ, 0xff7ad8, 0x9ab0ff][i % 3]);
        k.fishSchool(-20, 6, 20, 26, 0xbff8ff);
        k.fishSchool(22, 8, -16, 22, 0xffe0a0);
        k.fishSchool(0, 12, 0, 18, 0x9ff4ff);
        k.whale(95, 32);
        for (const [x, z] of [[-18, -8], [16, 10], [-4, 24], [6, -24], [-30, 26], [30, -26]]) k.lightShaft(x, z, 3 + k.rnd() * 2, 40, 0x9ff8ff);
        k.lights.push({ x: 0, y: 3, z: 9, color: AQ, power: 50 });
      },
    },
  ],

  get(id) {
    return this.list.find((m) => m.id === id) || this.list[0];
  },

  /* ---------- 載入地圖 ----------
   * 建造外觀與碰撞、建立導航格、設定天空與燈光。
   * 回傳執行期資料 { def, barrels, lights }。 */
  load(id) {
    this.unload();
    const def = this.get(id);
    this.current = def;
    const scene = Scene3D.scene;
    const group = new THREE.Group();
    this.group = group;

    Mats.applyTheme(def.theme);
    World.reset(def.half);

    const kit = new MapKit(def.pal, 1234 + this.list.indexOf(def) * 77);
    // 地面：一大片薄板（頂面在 y = 0）
    const s = def.half;
    kit.b.box(s * 2 + 240, 1, s * 2 + 240, { p: [0, -0.5, 0], c: def.pal.ground, m: "ground" });
    kit.def = def; // 細節零件要知道補給、據點與出生點的位置，才能避開它們
    def.build(kit);
    // 大結構蓋好之後再補細節（門、管線、街道家具、海底生物…），見 07b-map-details.js
    if (MapDetails[def.id]) MapDetails[def.id](kit);
    kit.finish(); // 碎石與海草要等所有實體都登記好，才能避開它們
    group.add(kit.b.build());

    // 文字招牌：一片貼著發光文字的平面
    for (const sg of kit.signs) {
      const mat = new THREE.MeshBasicMaterial({
        map: Tex.text(sg.text, "#ffffff"),
        transparent: true,
        toneMapped: false,
        depthWrite: false
      });
      mat.color.setHex(sg.color).multiplyScalar(2.2);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
      mesh.position.set(sg.x, sg.y, sg.z);
      mesh.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][sg.dir];
      mesh.userData.ownMaterial = true;
      group.add(mesh);
    }

    // 會動的物件（列車、光環、水母…）加進場景，並記下它們每幀要做的動畫
    const anims = [];
    for (const ex of kit.extras) {
      if (ex.obj) group.add(ex.obj);
      anims.push(ex.update);
    }

    // 點光源（數量有限制，太多會拖慢畫面）：最多 10 盞，從最亮的開始排，
    // 實際點亮幾盞由畫質決定（見 applyLightBudget）；火光會隨機閃爍
    const lights = [];
    for (const L of kit.lights.slice().sort((a, b) => b.power - a.power).slice(0, 10)) {
      const light = new THREE.PointLight(L.color, L.power, 26, 1.8);
      light.position.set(L.x, L.y, L.z);
      group.add(light);
      lights.push(light);
      if (L.flicker) {
        const ph = Math.random() * 10;
        anims.push((dt, t) => (light.intensity = L.power * (0.75 + Math.sin(t * 17 + ph) * 0.12 + Math.sin(t * 7.3 + ph) * 0.13)));
      }
    }

    scene.add(group);
    Scene3D.setEnvironment(def.sky);
    Scene3D.setShadowArea(def.half); // 陰影範圍固定蓋住整張地圖
    CharModels.rimGain.value = def.sky.sunPower >= 2.8 ? 0.35 : 1; // 亮的地圖把角色輪廓光調弱
    // 側逆光顏色跟著地圖色盤；白天的地圖本來就夠亮，所以調弱
    const night = def.sky.sunPower < 3;
    Scene3D.rimA.color.setHex(def.pal.accent1);
    Scene3D.rimA.intensity = night ? 0.5 : 0.25;
    Scene3D.rimB.color.setHex(def.pal.accent2);
    Scene3D.rimB.intensity = night ? 0.35 : 0.15;

    // 導航格：從兩個基地與首領出生點開始淹水
    Nav.build([def.bases[0], def.bases[1], def.bossSpawn, def.playerSpawn]);

    this.runtime = { def, barrels: kit.barrels, anims, pads: kit.pads, lights, t: 0 };
    this.applyLightBudget();
    Scene3D.renderer.shadowMap.needsUpdate = true; // 換了地圖，陰影馬上重畫一次
    return this.runtime;
  },

  /* 依畫質決定點亮幾盞點光源（清單已經從最亮排到最暗，所以關掉的是最不重要的）。
   * 每多一盞燈，畫面上每個像素都要多算一次光照，對手機的影響特別大。 */
  applyLightBudget() {
    if (!this.runtime || !this.runtime.lights) return;
    const max = Scene3D.QUALITY[Scene3D.quality].lights;
    this.runtime.lights.forEach((light, i) => (light.visible = i < max));
  },

  // 每一幀播放地圖上的動畫（選單背景、對戰中都會呼叫）
  tick(dt) {
    const rt = this.runtime;
    if (!rt || !this.group) return;
    rt.t += dt;
    for (const f of rt.anims) f(dt, rt.t);
  },

  unload() {
    if (!this.group) return;
    this.group.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.userData.ownMaterial) {
        if (node.material.map) node.material.map.dispose();
        node.material.dispose();
      }
    });
    Scene3D.scene.remove(this.group);
    this.group = null;
  },
};
