/*
 * ============================================================
 *  07b-map-details.js ── 地圖細節
 * ------------------------------------------------------------
 *  07-maps.js 負責每張地圖的「大結構」（建築、橋、掩體）。
 *  這個檔案在大結構蓋好之後，再補上讓場景看起來有人生活過的小東西：
 *
 *    牆面    門、鐵捲門、通風口、冷氣外機、水管、線槽、直立招牌、爬梯、壁燈
 *    地面    人孔蓋、排水格柵、箭頭、污漬、招牌映在地上的光
 *    街道    護柱、長椅、垃圾桶、消防栓、配電箱、資訊站、路牌、紅綠燈
 *    廢墟    油桶、輪胎堆、枯樹、水泥管、棧板、鋼骨架
 *    太空站  屋頂桁架、貨艙、植栽艙、全像桌、氣瓶
 *    海底    海葵、海星、管蟲、海扇、腦珊瑚、浮標、熱泉
 *    空中    掛著燈籠的纜線
 *
 *  兩個原則：
 *    1. 有體積、會擋路的東西一律用 prop() 放：它會先檢查那塊地是不是空的
 *       （不壓到牆、補給、據點、出生點），確定沒問題才登記碰撞。
 *    2. 只有外觀的裝飾（貼在牆上、鋪在地上、掛在頭頂）不登記碰撞，
 *       所以厚度都很薄，或是高過頭頂。
 *
 *  用法：Maps.load() 蓋完大結構後會呼叫 MapDetails[地圖代號](kit)。
 * ============================================================
 */

Object.assign(MapKit.prototype, {
  /* ============================================================
   *  小工具
   * ============================================================ */

  // 四個方向的單位向量：0 = 往 -Z、1 = 往 +X、2 = 往 +Z、3 = 往 -X
  _dir(dir) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]][dir & 3];
  },

  // 讓圓柱的軸對準 dir 方向所需的旋轉（圓柱原本是直立的）
  _axisRot(dir) {
    return dir % 2 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  },

  /* 牆面畫筆。(x, z) 是牆面上的一點，dir 是牆面朝向。
   * 回傳的函式 put(寬, 高, 厚, 沿牆位移, 中心高度, 離牆距離, 選項) 會貼著牆放一個方塊：
   * 「寬」沿著牆面、「厚」是凸出牆面的深度，不必自己換算 X 與 Z。 */
  onWall(x, z, dir) {
    const [vx, vz] = this._dir(dir);
    const alongX = vx === 0; // 牆面朝 ±Z 時，寬度沿 X
    return (w, h, t, along, y, out, opt) => {
      const px = x + vx * (out + t / 2) + (alongX ? along : 0);
      const pz = z + vz * (out + t / 2) + (alongX ? 0 : along);
      this.b.box(alongX ? w : t, h, alongX ? t : w, { p: [px, y, pz], ...opt });
    };
  },

  // 牆面上的一點往外 out、沿牆 along 之後的世界座標 [x, z]
  _wallPoint(x, z, dir, along, out) {
    const [vx, vz] = this._dir(dir);
    return vx === 0 ? [x + along, z + vz * out] : [x + vx * out, z + along];
  },

  /* 這塊地（中心 x, z、寬 w、深 d）能不能放新的實體道具：
   * 不能碰到現有的碰撞方塊，也不能壓到補給、據點中心、出生點、跳躍板與爆炸桶。 */
  canPlace(x, z, w, d, margin = 0.5) {
    const hw = w / 2 + margin, hd = d / 2 + margin;
    if (Math.abs(x) + hw > World.half - 1 || Math.abs(z) + hd > World.half - 1) return false;
    for (const b of World.boxes) {
      if (b.minY > 2.2) continue; // 頭頂上的東西（橋面、棚頂）不影響
      if (b.maxX > x - hw && b.minX < x + hw && b.maxZ > z - hd && b.minZ < z + hd) return false;
    }
    const near = (px, pz, r) => Math.abs(px - x) < r + w / 2 && Math.abs(pz - z) < r + d / 2;
    const def = this.def;
    for (const [, px, pz] of def.pickups) if (near(px, pz, 1.6)) return false;
    for (const p of def.points || []) if (near(p.x, p.z, 2.5)) return false;
    for (const p of [def.bases[0], def.bases[1], def.bossSpawn, def.playerSpawn]) if (near(p.x, p.z, 5)) return false;
    for (const p of this.pads) if (near(p.x, p.z, 2)) return false;
    for (const p of this.barrels) if (near(p.x, p.z, 1.5)) return false;
    return true;
  },

  /* 放一個實體道具：佔地 w × d、高 h。draw() 負責畫外觀。
   * 位置不適合就整個不放（回傳 false），所以不會出現卡在牆裡或擋住補給的東西。 */
  prop(x, z, w, d, h, draw, margin) {
    if (!this.canPlace(x, z, w, d, margin)) {
      (this.skipped ||= []).push([x, z]); // 記下來，方便檢查哪些位置被略過
      return false;
    }
    draw();
    World.addBox(x, h / 2, z, w, h, d, { noWalk: true });
    return true;
  },

  // 文字牌（真正的文字貼圖由 Maps.load 統一建立）
  label(x, y, z, dir, w, h, text, color) {
    this.signs.push({ x, y, z, dir, w, h, text, color });
  },

  /* ============================================================
   *  牆面
   * ============================================================ */

  // 門：門板、中縫、門框、門楣上的燈條、門邊的感應面板、兩扇小窗與門檻
  door(x, z, dir, color, w = 1.5, h = 2.2) {
    const put = this.onWall(x, z, dir);
    const dk = this.pal.dark;
    put(w, h, 0.1, 0, h / 2, 0, { c: 0x1a1f28, m: "metal" });
    put(0.04, h - 0.1, 0.115, 0, h / 2, 0, { c: dk, m: "trim" });
    for (const s of [-1, 1]) {
      put(0.14, h + 0.1, 0.16, s * (w / 2 + 0.07), (h + 0.1) / 2, 0, { c: dk, m: "trim" });
      put(0.26, 0.5, 0.012, s * w * 0.25, h * 0.68, 0.1, { c: 0x0c1218, m: "metal" });
    }
    put(w + 0.28, 0.16, 0.18, 0, h + 0.13, 0, { c: dk, m: "trim" });
    put(w * 0.7, 0.05, 0.03, 0, h + 0.13, 0.18, { c: color, m: "glow", e: 1.8 });
    put(0.12, 0.18, 0.03, w / 2 + 0.07, 1.25, 0.16, { c: color, m: "glow", e: 1.2 });
    put(w, 0.03, 0.5, 0, 0.03, 0, { c: dk, m: "trim" });
  },

  // 鐵捲門：一條一條的橫葉片、兩側軌道、上方的捲箱與底部的把手燈
  shutter(x, z, dir, w, h, color) {
    const put = this.onWall(x, z, dir);
    const dk = this.pal.dark;
    put(w, h, 0.08, 0, h / 2, 0, { c: 0x39404c, m: "trim" });
    for (let y = 0.25; y < h - 0.1; y += 0.22) put(w - 0.06, 0.05, 0.1, 0, y, 0, { c: 0x2a303a, m: "trim" });
    for (const s of [-1, 1]) put(0.12, h, 0.14, s * (w / 2 + 0.06), h / 2, 0, { c: dk, m: "metal" });
    put(w + 0.3, 0.3, 0.22, 0, h + 0.15, 0, { c: dk, m: "trim" });
    put(w * 0.5, 0.04, 0.02, 0, 0.12, 0.1, { c: color, m: "glow", e: 1.2 });
  },

  // 通風口：外框與一排斜葉片
  wallVent(x, y, z, dir, w = 1.0, h = 0.6) {
    const put = this.onWall(x, z, dir);
    put(w, h, 0.07, 0, y, 0, { c: this.pal.dark, m: "trim" });
    for (let i = 0; i < 4; i++) {
      put(w - 0.12, 0.04, 0.09, 0, y - h / 2 + (i + 0.5) * (h / 4), 0, { c: 0x5a6270, m: "metal" });
    }
  },

  // 冷氣外機：掛在牆上（請放在頭頂以上），正面有風扇、底下兩支托架
  wallUnit(x, y, z, dir) {
    const put = this.onWall(x, z, dir);
    put(0.9, 0.6, 0.4, 0, y, 0, { c: 0x6a7078, m: "trim" });
    put(0.86, 0.04, 0.42, 0, y + 0.31, 0, { c: this.pal.dark, m: "trim" });
    const [fx, fz] = this._wallPoint(x, z, dir, -0.12, 0.41);
    this.b.cyl(0.22, 0.22, 0.02, { p: [fx, y, fz], r: this._axisRot(dir), c: 0x14161a, seg: 12 });
    this.b.torus(0.23, 0.02, { p: [fx, y, fz], r: dir % 2 ? [0, Math.PI / 2, 0] : [0, 0, 0], c: 0x2c3038, seg: 12 });
    for (const s of [-1, 1]) put(0.05, 0.3, 0.36, s * 0.35, y - 0.42, 0, { c: this.pal.dark, m: "metal" });
  },

  // 一排直立的水管：n 根並排，上下各一道管夾，頂端接進一個接線盒
  wallPipes(x, z, dir, h, n = 3, color = 0x8a9099) {
    const put = this.onWall(x, z, dir);
    const width = (n - 1) * 0.16;
    for (let i = 0; i < n; i++) {
      const [px, pz] = this._wallPoint(x, z, dir, i * 0.16 - width / 2, 0.09);
      this.b.cyl(0.05, 0.05, h, { p: [px, h / 2, pz], c: i % 2 ? color : 0x5a6270, m: "metal", seg: 8 });
    }
    for (const y of [0.6, h - 0.5]) put(width + 0.2, 0.06, 0.15, 0, y, 0, { c: this.pal.dark, m: "metal" });
    put(width + 0.26, 0.26, 0.2, 0, h + 0.12, 0, { c: this.pal.dark, m: "trim" });
  },

  // 橫向的線槽：長 len，每隔兩公尺一個固定夾
  conduit(x, y, z, dir, len) {
    const put = this.onWall(x, z, dir);
    put(len, 0.07, 0.07, 0, y, 0, { c: 0x5a6270, m: "metal" });
    for (let t = -len / 2 + 1; t < len / 2; t += 2) put(0.08, 0.11, 0.09, t, y, 0, { c: this.pal.dark, m: "metal" });
  },

  // 直立招牌：從牆面往外伸出的燈箱（請放在頭頂以上），兩面發光、上面有幾道橫條
  bladeSign(x, y, z, dir, h, color) {
    const put = this.onWall(x, z, dir);
    put(0.12, h, 0.8, 0, y, 0.15, { c: 0x0c0d10 });
    for (const s of [-1, 1]) {
      put(0.02, h - 0.2, 0.6, s * 0.07, y, 0.25, { c: color, m: "glow", e: 1.3 });
      for (let k = 0; k < 3; k++) put(0.025, 0.07, 0.6, s * 0.072, y + (k - 1) * (h * 0.26), 0.25, { c: 0x0c0d10 });
    }
    for (const dy of [-h / 2 + 0.15, h / 2 - 0.15]) {
      put(0.05, 0.05, 0.15, 0, y + dy, 0, { c: this.pal.dark, m: "metal" });
    }
  },

  // 爬梯：兩根直桿與一階一階的橫桿，從 y0 往上 h 公尺
  ladder(x, z, dir, h, y0 = 0) {
    const put = this.onWall(x, z, dir);
    for (const s of [-1, 1]) put(0.05, h, 0.05, s * 0.22, y0 + h / 2, 0.1, { c: this.pal.dark, m: "metal" });
    for (let y = y0 + 0.3; y < y0 + h; y += 0.3) put(0.44, 0.03, 0.03, 0, y, 0.11, { c: 0x8a9099, m: "metal" });
  },

  // 壁燈：一個小燈座，底下一條發光燈管
  wallLight(x, y, z, dir, color) {
    const put = this.onWall(x, z, dir);
    put(0.5, 0.1, 0.12, 0, y, 0, { c: this.pal.dark, m: "metal" });
    put(0.44, 0.04, 0.05, 0, y - 0.07, 0.04, { c: color, m: "glow", e: 2 });
  },

  /* 探照燈：牆上伸出的支臂、U 形支架、斜著的燈筒，以及照到地上的光錐與光斑。
   * (x, y, z) 是燈筒轉軸的位置，dir 是往哪一邊照（0~3），tilt 是燈筒偏離正下方的角度。
   * 燈筒和光錐用的是同一個方向向量 axis，所以燈往哪裡歪、光就往哪裡照。 */
  spotlight(x, y, z, dir, color, tilt = 0.6) {
    const [vx, vz] = this._dir(dir);
    const dk = this.pal.dark;
    const axis = new THREE.Vector3(vx * Math.sin(tilt), -Math.cos(tilt), vz * Math.sin(tilt));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
    const at = (d) => [x + axis.x * d, y + axis.y * d, z + axis.z * d]; // 沿光軸前進 d 公尺的位置

    // 支臂與 U 形支架（sx, sz 是與照射方向垂直的水平方向）
    const sx = -vz, sz = vx;
    this.b.box(vx ? 0.7 : 0.16, 0.1, vx ? 0.16 : 0.7, { p: [x - vx * 0.3, y + 0.33, z - vz * 0.3], c: dk, m: "metal" });
    this.b.box(sx ? 0.6 : 0.08, 0.06, sx ? 0.08 : 0.6, { p: [x, y + 0.27, z], c: dk, m: "metal" });
    for (const s of [-1, 1]) {
      this.b.box(0.05, 0.3, 0.08, { p: [x + sx * s * 0.28, y + 0.12, z + sz * s * 0.28], c: dk, m: "metal" });
    }
    // 燈筒：後蓋、前寬後窄的筒身、前框與發光的鏡片
    this.b.cyl(0.13, 0.13, 0.08, { p: at(-0.2), q, c: 0x1a1f28, m: "metal", seg: 10 });
    this.b.cyl(0.15, 0.23, 0.4, { p: at(0.04), q, c: dk, m: "metal", seg: 12 });
    this.b.cyl(0.26, 0.26, 0.05, { p: at(0.25), q, c: 0x1a1f28, m: "metal", seg: 12 });
    this.b.cyl(0.21, 0.21, 0.02, { p: at(0.285), q, c: 0xe8ffff, m: "glow", e: 2.6, seg: 12 });

    this._spotBeam(at(0.3), axis, 0.2, 0.3, color);
  },

  /* 光錐：從 from 沿 axis 射出、照到地面為止。r0 是出口半徑，spread 是張開的半角（弧度）。
   * 因為光軸是斜的，照到地上會是一個橢圓，所以每條邊線都各自算出落地點。
   * 同一張地圖的所有光錐合併成一個網格（一次繪製），越遠越淡。 */
  _spotBeam(from, axis, r0, spread, color) {
    const beams = (this._beams ||= { pos: [], col: [], idx: [], mesh: null });
    const N = 24, GROUND = 0.035;
    const c = new THREE.Color(color);
    const origin = new THREE.Vector3(...from);
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(u, axis).normalize();
    const base = beams.pos.length / 3;
    const push = (p, k) => {
      beams.pos.push(p.x, p.y, p.z);
      beams.col.push(c.r * k, c.g * k, c.b * k);
    };

    // 每條邊線三個點：出口（最亮）、三分之一處、落地點（最淡）
    const radial = new THREE.Vector3(), ray = new THREE.Vector3(), top = new THREE.Vector3();
    const land = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      radial.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      top.copy(origin).addScaledVector(radial, r0);
      ray.copy(axis).addScaledVector(radial, Math.tan(spread)).normalize();
      const t = (top.y - GROUND) / Math.max(0.2, -ray.y); // 這條邊線走多遠會碰到地面
      const end = top.clone().addScaledVector(ray, t);
      push(top, 0.9);
      push(top.clone().lerp(end, 0.33), 0.42);
      push(end, 0.06);
      land.push(end);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 3, b = base + ((i + 1) % N) * 3;
      beams.idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }

    // 地上的光斑：中心亮、邊緣淡出的橢圓（中心點是所有落地點的平均）
    const center = new THREE.Vector3();
    for (const p of land) center.add(p);
    center.multiplyScalar(1 / N);
    const spot = beams.pos.length / 3;
    push(center, 1.0);
    for (const p of land) push(center.clone().lerp(p, 0.5), 0.75);
    for (const p of land) push(p, 0);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const in0 = spot + 1 + i, in1 = spot + 1 + j, out0 = spot + 1 + N + i, out1 = spot + 1 + N + j;
      beams.idx.push(spot, in1, in0, in0, in1, out0, in1, out1, out0);
    }

    // 第一次呼叫時建立網格；之後每加一道光錐就換上新的幾何
    if (!beams.mesh) {
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      });
      beams.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      beams.mesh.userData.ownMaterial = true;
      this.dynamic(beams.mesh, () => {});
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(beams.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(beams.col, 3));
    geo.setIndex(beams.idx);
    beams.mesh.geometry.dispose();
    beams.mesh.geometry = geo;
  },

  // 告示牌：深色底板加上一行發光文字
  poster(x, y, z, dir, w, h, text, color) {
    const put = this.onWall(x, z, dir);
    put(w + 0.12, h + 0.12, 0.05, 0, y, 0, { c: 0x0c0d10 });
    const [px, pz] = this._wallPoint(x, z, dir, 0, 0.07);
    this.label(px, y, pz, dir, w, h * 0.85, text, color);
  },

  /* ============================================================
   *  地面（全部是很薄的貼片，不登記碰撞）
   * ============================================================ */

  // 人孔蓋：圓蓋、外圈與十字紋
  manhole(x, z) {
    this.b.cyl(0.5, 0.5, 0.03, { p: [x, 0.02, z], c: 0x2a2e36, m: "metal", seg: 16 });
    this.b.torus(0.5, 0.03, { p: [x, 0.03, z], r: [Math.PI / 2, 0, 0], c: this.pal.dark, m: "metal", seg: 16 });
    this.b.box(0.7, 0.012, 0.06, { p: [x, 0.04, z], c: this.pal.dark, m: "metal" });
    this.b.box(0.06, 0.01, 0.7, { p: [x, 0.04, z], c: this.pal.dark, m: "metal" });
  },

  // 排水格柵：外框與一條條的柵條
  grate(x, z, w, d) {
    this.b.box(w, 0.03, d, { p: [x, 0.018, z], c: this.pal.dark, m: "metal" });
    const alongX = w > d;
    const n = Math.round((alongX ? w : d) / 0.16);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      this.b.box(alongX ? 0.06 : w - 0.1, 0.012, alongX ? d - 0.1 : 0.06, {
        p: [x + (alongX ? t * w : 0), 0.038, z + (alongX ? 0 : t * d)], c: 0x5a6270, m: "metal",
      });
    }
  },

  // 地上的箭頭，指向 dir
  arrow(x, z, dir, color) {
    const b = this.b;
    b.push(x, 0.03, z, [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir & 3]);
    b.box(0.26, 0.012, 1.8, { p: [0, 0, 0.15], c: color, m: "paint" }); // 箭身
    // 箭頭的兩撇：從尖端往後、往兩側張開
    for (const s of [-1, 1]) {
      b.box(0.26, 0.012, 0.9, { p: [s * 0.27, 0, -0.55], r: [0, s * 0.7, 0], c: color, m: "paint" });
    }
    b.pop();
  },

  // 污漬／焦痕：一片深色圓斑
  stain(x, z, r, color = 0x0b0b0e) {
    this.b.cyl(r, r, 0.012, { p: [x, 0.008, z], c: color, m: "matte", seg: 14 });
  },

  // 招牌映在濕地面上的光：一片很淡的發光色塊（亮度低，不會被泛光暈開）
  glowPatch(x, z, w, d, color, e = 0.3) {
    this.b.box(w, 0.01, d, { p: [x, 0.009, z], c: color, m: "glow", e });
  },

  /* ============================================================
   *  街道上的道具（有碰撞）
   * ============================================================ */

  // 護柱：矮圓柱，腰間一圈燈
  bollard(x, z, color) {
    return this.prop(x, z, 0.3, 0.3, 0.95, () => {
      this.b.cyl(0.11, 0.13, 0.9, { p: [x, 0.45, z], c: this.pal.dark, m: "metal", seg: 10 });
      this.b.cyl(0.135, 0.135, 0.06, { p: [x, 0.68, z], c: color, m: "glow", e: 1.6, seg: 10 });
      this.b.sphere(0.11, { p: [x, 0.9, z], s: [1, 0.5, 1], c: this.pal.dark, m: "metal", seg: 8 });
    });
  },

  // 長椅：椅面、椅背、兩支椅腳。dir 偶數沿 X 擺放
  bench(x, z, dir) {
    const alongX = dir % 2 === 0;
    return this.prop(x, z, alongX ? 1.8 : 0.6, alongX ? 0.6 : 1.8, 0.95, () => {
      const b = this.b;
      b.push(x, 0, z, alongX ? 0 : Math.PI / 2);
      b.box(1.8, 0.07, 0.5, { p: [0, 0.45, 0], c: 0x4a5262, m: "trim" });
      b.box(1.8, 0.45, 0.06, { p: [0, 0.74, 0.24], r: [-0.15, 0, 0], c: 0x4a5262, m: "trim" });
      for (const s of [-1, 1]) {
        b.box(0.08, 0.45, 0.46, { p: [s * 0.75, 0.225, 0], c: this.pal.dark, m: "metal" });
        b.box(0.08, 0.06, 0.5, { p: [s * 0.75, 0.6, 0.02], c: this.pal.dark, m: "metal" });
      }
      b.pop();
    }, 0.3);
  },

  // 垃圾桶：圓桶、桶蓋與一道投入口的燈
  bin(x, z, color) {
    return this.prop(x, z, 0.6, 0.6, 1.0, () => {
      this.b.cyl(0.27, 0.24, 0.85, { p: [x, 0.43, z], c: 0x39404c, m: "trim", seg: 12 });
      this.b.cyl(0.3, 0.3, 0.08, { p: [x, 0.9, z], c: this.pal.dark, m: "metal", seg: 12 });
      this.b.cyl(0.275, 0.275, 0.05, { p: [x, 0.62, z], c: color, m: "glow", e: 0.9, seg: 12 });
    }, 0.3);
  },

  // 消防栓
  hydrant(x, z) {
    return this.prop(x, z, 0.4, 0.4, 0.85, () => {
      const b = this.b;
      b.cyl(0.12, 0.14, 0.62, { p: [x, 0.31, z], c: 0xa82a2a, seg: 10 });
      b.sphere(0.13, { p: [x, 0.64, z], s: [1, 0.8, 1], c: 0xa82a2a, seg: 8 });
      b.cyl(0.05, 0.05, 0.4, { p: [x, 0.42, z], r: [0, 0, Math.PI / 2], c: 0x8a9099, m: "metal", seg: 8 });
      b.cyl(0.17, 0.17, 0.05, { p: [x, 0.03, z], c: 0x5a1a1a, seg: 10 });
    }, 0.3);
  },

  // 配電箱：箱體、兩扇門的門縫、散熱孔與狀態燈。dir 是正面朝向
  utilBox(x, z, dir, color) {
    const alongX = dir % 2 === 0;
    return this.prop(x, z, alongX ? 1.0 : 0.5, alongX ? 0.5 : 1.0, 1.4, () => {
      this.b.box(alongX ? 1.0 : 0.5, 1.4, alongX ? 0.5 : 1.0, { p: [x, 0.7, z], c: 0x4a5262, m: "trim", ao: 0.3 });
      const [vx, vz] = this._dir(dir);
      const put = this.onWall(x + vx * 0.25, z + vz * 0.25, dir);
      put(0.03, 1.2, 0.012, 0, 0.72, 0, { c: this.pal.dark });
      for (let i = 0; i < 3; i++) put(0.3, 0.03, 0.012, -0.25, 1.1 - i * 0.08, 0, { c: this.pal.dark });
      put(0.1, 0.05, 0.012, 0.28, 1.15, 0, { c: color, m: "glow", e: 1.6 });
      put(1.04, 0.06, 0.012, 0, 0.2, 0, { c: this.pal.hazard ?? 0xd9a520 });
    }, 0.2);
  },

  // 資訊站：底座、斜放的發光螢幕與頂端的燈
  terminal(x, z, dir, color) {
    const alongX = dir % 2 === 0;
    return this.prop(x, z, alongX ? 0.8 : 0.5, alongX ? 0.5 : 0.8, 1.5, () => {
      const b = this.b;
      b.push(x, 0, z, [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir & 3]);
      b.rbox(0.8, 1.05, 0.5, 0.06, { p: [0, 0.52, 0], c: 0x2a3140, m: "trim" });
      b.box(0.7, 0.5, 0.04, { p: [0, 1.22, -0.12], r: [0.35, 0, 0], c: 0x0c0d10 });
      b.box(0.62, 0.42, 0.012, { p: [0, 1.225, -0.145], r: [0.35, 0, 0], c: color, m: "glow", e: 0.9 });
      b.box(0.8, 0.04, 0.3, { p: [0, 1.5, 0.06], c: this.pal.dark, m: "metal" });
      b.box(0.5, 0.03, 0.03, { p: [0, 1.47, -0.08], c: color, m: "glow", e: 1.8 });
      b.box(0.5, 0.03, 0.2, { p: [0, 1.02, -0.3], r: [0.5, 0, 0], c: 0x1a1f28, m: "metal" }); // 鍵盤檯
      b.pop();
    }, 0.3);
  },

  // 路牌：一根細桿，頂端一塊牌子（可以加文字）。dir 是牌面朝向
  signPost(x, z, dir, color, text) {
    return this.prop(x, z, 0.2, 0.2, 2.7, () => {
      this.b.cyl(0.04, 0.05, 2.7, { p: [x, 1.35, z], c: this.pal.dark, m: "metal", seg: 6 });
      const [vx, vz] = this._dir(dir);
      const put = this.onWall(x + vx * 0.05, z + vz * 0.05, dir);
      put(0.9, 0.5, 0.04, 0, 2.35, 0, { c: 0x0c0d10 });
      put(0.94, 0.03, 0.05, 0, 2.61, 0, { c: color, m: "glow", e: 1.4 });
      if (text) this.label(x + vx * 0.11, 2.35, z + vz * 0.11, dir, 0.84, 0.42, text, color);
    }, 0.3);
  },

  // 紅綠燈：燈桿、橫臂、三顆燈
  trafficLight(x, z, dir) {
    return this.prop(x, z, 0.25, 0.25, 4.4, () => {
      const [vx, vz] = this._dir(dir);
      const b = this.b;
      b.cyl(0.07, 0.1, 4.4, { p: [x, 2.2, z], c: this.pal.dark, m: "metal", seg: 8 });
      b.limb([x, 4.2, z], [x + vx * 1.6, 4.3, z + vz * 1.6], 0.045, {
        c: this.pal.dark, m: "metal", flat: true, seg: 6,
      });
      const hx = x + vx * 1.6, hz = z + vz * 1.6;
      b.rbox(0.3, 0.9, 0.3, 0.05, { p: [hx, 3.82, hz], c: 0x0c0d10 });
      const lamps = [[0xff2030, 0.5], [0xffc233, 0.4], [0x30ff7a, 2.2]]; // 只有綠燈是亮的
      lamps.forEach(([c, e], i) => {
        for (const s of [-1, 1]) {
          b.sphere(0.09, {
            p: [hx + (vx ? 0 : s * 0.13), 4.08 - i * 0.26, hz + (vx ? s * 0.13 : 0)], c, m: "glow", e, seg: 8,
          });
        }
      });
    }, 0.3);
  },

  /* ============================================================
   *  廢墟的道具
   * ============================================================ */

  // 油桶：桶身、兩道桶箍、桶蓋。倒在旁邊的不另外做，站著的才有碰撞
  drum(x, z, color = 0x4a5a3a) {
    return this.prop(x, z, 0.62, 0.62, 0.92, () => {
      const b = this.b;
      b.cyl(0.3, 0.3, 0.9, { p: [x, 0.45, z], c: color, m: "trim", seg: 12 });
      for (const y of [0.28, 0.64]) {
        b.torus(0.305, 0.02, { p: [x, y, z], r: [Math.PI / 2, 0, 0], c: this.pal.dark, m: "metal", seg: 12 });
      }
      b.cyl(0.27, 0.27, 0.02, { p: [x, 0.905, z], c: this.pal.dark, m: "metal", seg: 12 });
    }, 0.2);
  },

  // 輪胎堆：三顆疊在一起，每顆歪一點
  tireStack(x, z) {
    return this.prop(x, z, 0.9, 0.9, 0.8, () => {
      for (let i = 0; i < 3; i++) {
        this.b.torus(0.3, 0.13, {
          p: [x + (this.rnd() - 0.5) * 0.12, 0.13 + i * 0.26, z + (this.rnd() - 0.5) * 0.12],
          r: [Math.PI / 2, 0, 0], c: 0x0c0c0d, m: "matte", seg: 12,
        });
      }
    }, 0.3);
  },

  // 枯樹：焦黑的樹幹與幾根往上岔開的枝幹（只有樹幹有碰撞）
  deadTree(x, z, h = 4) {
    return this.prop(x, z, 0.5, 0.5, 3, () => {
      const b = this.b;
      const bark = 0x1c1612;
      b.cyl(0.11, 0.22, h * 0.6, { p: [x, h * 0.3, z], c: bark, m: "matte", seg: 7 });
      b.cyl(0.3, 0.36, 0.2, { p: [x, 0.1, z], c: bark, m: "matte", seg: 7 }); // 樹根
      for (let i = 0; i < 5; i++) {
        const a = this.rnd() * 6.28, y0 = h * (0.34 + this.rnd() * 0.24);
        const len = h * (0.26 + this.rnd() * 0.22);
        const tip = [x + Math.cos(a) * len * 0.7, y0 + len * 0.75, z + Math.sin(a) * len * 0.7];
        b.limb([x, y0, z], tip, 0.055, { c: bark, m: "matte", flat: true, seg: 5 });
        // 枝幹末端再岔出一根細枝
        const a2 = a + (this.rnd() - 0.5) * 1.6;
        b.limb(tip, [tip[0] + Math.cos(a2) * len * 0.4, tip[1] + len * 0.35, tip[2] + Math.sin(a2) * len * 0.4], 0.028, {
          c: bark, m: "matte", flat: true, seg: 5,
        });
      }
    }, 0.4);
  },

  // 水泥涵管：橫躺的大圓管，可以當掩體。dir 偶數沿 X
  pipeSection(x, z, dir) {
    const alongX = dir % 2 === 0;
    return this.prop(x, z, alongX ? 2.4 : 1.6, alongX ? 1.6 : 2.4, 1.6, () => {
      const rot = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
      this.b.cyl(0.8, 0.8, 2.4, { p: [x, 0.8, z], r: rot, c: 0x6a625a, m: "wall", seg: 16 });
      for (const s of [-1, 1]) { // 兩端的管口：一圈厚邊與黑色的管內
        const ex = x + (alongX ? s * 1.2 : 0), ez = z + (alongX ? 0 : s * 1.2);
        this.b.torus(0.76, 0.07, {
          p: [ex, 0.8, ez], r: alongX ? [0, Math.PI / 2, 0] : [0, 0, 0], c: 0x4a443e, m: "wall", seg: 16,
        });
        this.b.cyl(0.68, 0.68, 0.02, {
          p: [ex + (alongX ? s * 0.005 : 0), 0.8, ez + (alongX ? 0 : s * 0.005)], r: rot, c: 0x050505, m: "matte",
          seg: 16,
        });
      }
    }, 0.5);
  },

  // 棧板與上面的貨箱（用防水布蓋著）
  pallet(x, z, color = 0x4a5a4a) {
    return this.prop(x, z, 1.3, 1.1, 1.05, () => {
      const b = this.b;
      for (const dz of [-0.4, 0, 0.4]) b.box(1.3, 0.05, 0.14, { p: [x, 0.12, z + dz], c: 0x6a5238, m: "matte" });
      for (const dx of [-0.5, 0, 0.5]) b.box(0.12, 0.09, 1.1, { p: [x + dx, 0.05, z], c: 0x5a4630, m: "matte" });
      b.rbox(1.15, 0.85, 0.95, 0.08, { p: [x, 0.58, z], c: color, m: "matte" });
      // 綑帶
      for (const dx of [-0.3, 0.3]) b.box(0.05, 0.87, 0.97, { p: [x + dx, 0.58, z], c: this.pal.dark, m: "matte" });
    }, 0.3);
  },

  /* 鋼骨架：只剩骨架的建築。四根 H 型鋼柱（有碰撞）加上頭頂的橫樑與斜撐（沒有碰撞）。
   * (x, z) 中心、w × d 範圍、h 高度。底下可以自由走動，柱子可以當掩體。 */
  beamFrame(x, z, w, d, h) {
    const rust = 0x4a3226, b = this.b;
    let placed = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = x + sx * w / 2, pz = z + sz * d / 2;
      const ok = this.prop(px, pz, 0.4, 0.4, h, () => {
        b.box(0.34, h, 0.08, { p: [px, h / 2, pz], c: rust, m: "trim", ao: 0.25 });
        for (const s of [-1, 1]) b.box(0.08, h, 0.36, { p: [px + s * 0.17, h / 2, pz], c: rust, m: "trim", ao: 0.25 });
        b.box(0.6, 0.06, 0.6, { p: [px, 0.03, pz], c: this.pal.dark, m: "metal" }); // 柱腳鋼板
      }, 0.3);
      if (ok) placed++;
    }
    if (placed < 3) return; // 柱子放不下就不蓋橫樑，免得樑懸在半空中
    for (const y of [h - 0.15, h * 0.58]) {
      for (const sz of [-1, 1]) b.box(w + 0.5, 0.3, 0.16, { p: [x, y, z + sz * d / 2], c: rust, m: "trim" });
      for (const sx of [-1, 1]) b.box(0.16, 0.28, d + 0.5, { p: [x + sx * w / 2, y - 0.01, z], c: rust, m: "trim" });
    }
    // 頂層的斜撐與幾根垂下來的鋼筋
    b.limb([x - w / 2, h - 0.15, z - d / 2], [x + w / 2, h - 0.15, z + d / 2], 0.05, {
      c: rust, m: "metal", flat: true, seg: 5,
    });
    b.limb([x + w / 2, h - 0.15, z - d / 2], [x - w / 2, h - 0.15, z + d / 2], 0.05, {
      c: rust, m: "metal", flat: true, seg: 5,
    });
    for (let i = 0; i < 4; i++) {
      const rx = x + (this.rnd() - 0.5) * w, rz = z + (i % 2 ? 1 : -1) * d / 2;
      b.limb([rx, h * 0.58, rz], [rx + (this.rnd() - 0.5) * 0.5, h * 0.58 - 0.8 - this.rnd(), rz], 0.02, {
        c: 0x5a3a2a, m: "metal", flat: true, seg: 5,
      });
    }
  },

  // 散落一地的碎磚（很小、只有外觀）：在半徑 r 內撒 n 塊
  bricks(x, z, r, n, color = 0x6a4a3a) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.28, d = Math.sqrt(this.rnd()) * r;
      this.b.box(0.22, 0.09, 0.11, {
        p: [x + Math.cos(a) * d, 0.045 + (i % 3) * 0.002, z + Math.sin(a) * d], r: [0, this.rnd() * 3, 0], c: color, m: "wall",
      });
    }
  },

  /* ============================================================
   *  太空站的道具
   * ============================================================ */

  // 貨艙：白色的貨物模組，四角有固定扣、側面一條狀態燈。dir 偶數沿 X
  cargoPod(x, z, dir, color) {
    const alongX = dir % 2 === 0;
    const w = alongX ? 2.2 : 1.4, d = alongX ? 1.4 : 2.2;
    return this.prop(x, z, w, d, 1.5, () => {
      const b = this.b;
      b.rbox(w, 1.4, d, 0.12, { p: [x, 0.75, z], c: this.pal.crate, m: "trim" });
      b.box(w + 0.02, 0.1, d + 0.02, { p: [x, 0.42, z], c: this.pal.dark, m: "trim" });
      b.box(w + 0.03, 0.06, d + 0.03, { p: [x, 1.1, z], c: color, m: "glow", e: 1.2 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.box(0.18, 0.12, 0.18, {
          p: [x + sx * (w / 2 - 0.12), 0.06, z + sz * (d / 2 - 0.12)], c: this.pal.dark, m: "metal",
        });
      }
      b.box(w * 0.4, 0.3, 0.02, { p: [x, 0.78, z + d / 2 + 0.005], c: this.pal.dark, m: "metal" });
    }, 0.3);
  },

  // 植栽艙：一根玻璃圓筒，裡面種著發光的植物
  plantTube(x, z, color) {
    return this.prop(x, z, 1.0, 1.0, 2.6, () => {
      const b = this.b;
      b.cyl(0.5, 0.56, 0.4, { p: [x, 0.2, z], c: this.pal.wall2, m: "trim", seg: 14 });
      b.cyl(0.44, 0.44, 1.8, { p: [x, 1.3, z], c: 0x9fe8ff, m: "pane", seg: 14 });
      b.cyl(0.52, 0.5, 0.3, { p: [x, 2.35, z], c: this.pal.wall2, m: "trim", seg: 14 });
      b.cyl(0.4, 0.4, 0.04, { p: [x, 2.18, z], c: color, m: "glow", e: 1.6, seg: 14 }); // 頂端的植物燈
      b.cyl(0.4, 0.4, 0.06, { p: [x, 0.43, z], c: 0x2a2018, m: "matte", seg: 14 }); // 土
      for (let i = 0; i < 5; i++) { // 幾株往上長的植物
        const a = this.rnd() * 6.28, r = this.rnd() * 0.24;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, top = 0.9 + this.rnd() * 0.8;
        b.limb([px, 0.45, pz], [px, top, pz], 0.018, { c: 0x2a6a3a, m: "matte", flat: true, seg: 5 });
        b.sphere(0.12 + this.rnd() * 0.06, {
          p: [px, top, pz], s: [1, 0.7, 1], c: this.pal.plant ?? 0x3a8a5a, m: "matte", seg: 6,
        });
      }
    }, 0.3);
  },

  // 全像桌：圓桌上方浮著一個慢慢旋轉的全像投影
  holoTable(x, z, color) {
    const ok = this.prop(x, z, 1.7, 1.7, 1.0, () => {
      const b = this.b;
      b.cyl(0.85, 0.7, 0.2, { p: [x, 0.9, z], c: this.pal.wall2, m: "trim", seg: 16 });
      b.cyl(0.3, 0.5, 0.8, { p: [x, 0.4, z], c: this.pal.dark, m: "metal", seg: 12 });
      b.cyl(0.7, 0.7, 0.02, { p: [x, 1.01, z], c: color, m: "glow", e: 0.9, seg: 16 });
      b.torus(0.86, 0.03, { p: [x, 0.98, z], r: [Math.PI / 2, 0, 0], c: color, m: "glow", e: 1.6, seg: 20 });
    }, 0.4);
    if (!ok) return;
    // 投影：一顆線框星球與一圈軌道，獨立成一個會轉動的物件
    const hb = new Builder();
    for (let i = 0; i < 3; i++) {
      hb.torus(0.42, 0.012, { r: [0, (i * Math.PI) / 3, 0], c: color, m: "glow", e: 1.6, seg: 20 });
    }
    hb.torus(0.42, 0.012, { r: [Math.PI / 2, 0, 0], c: color, m: "glow", e: 1.6, seg: 20 });
    hb.torus(0.66, 0.008, { r: [Math.PI / 2 - 0.35, 0, 0.2], c: color, m: "glow", e: 1.2, seg: 24 });
    const g = hb.build({ cast: false });
    g.position.set(x, 1.75, z);
    this.dynamic(g, (dt, t) => {
      g.rotation.y += dt * 0.5;
      g.position.y = 1.75 + Math.sin(t * 1.3) * 0.05;
    });
  },

  // 氣瓶組：兩支並排的高壓氣瓶，靠牆擺放
  gasTanks(x, z, color = 0xd8dee8) {
    return this.prop(x, z, 1.1, 0.6, 1.9, () => {
      const b = this.b;
      for (const s of [-1, 1]) {
        b.capsule(0.24, 1.3, { p: [x + s * 0.27, 0.95, z], c: color, m: "paint", seg: 10 });
        b.cyl(0.07, 0.07, 0.16, { p: [x + s * 0.27, 1.9, z], c: this.pal.dark, m: "metal", seg: 6 });
        b.torus(0.245, 0.02, {
          p: [x + s * 0.27, 1.25, z], r: [Math.PI / 2, 0, 0], c: this.pal.hazard ?? 0xffb347, seg: 10,
        });
      }
      b.box(1.1, 0.08, 0.6, { p: [x, 0.04, z], c: this.pal.dark, m: "metal" });
      b.box(1.14, 0.06, 0.08, { p: [x, 0.9, z + 0.26], c: this.pal.dark, m: "metal" }); // 固定架
    }, 0.1);
  },

  /* ============================================================
   *  海底的生物與設備
   * ============================================================ */

  // 海葵：一圈往外彎的發光觸手（很矮，只有外觀）
  anemone(x, z, color) {
    this.b.sphere(0.16, { p: [x, 0.08, z], s: [1, 0.6, 1], c: 0x5a2a4a, m: "matte", seg: 8 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + this.rnd() * 0.3, len = 0.22 + this.rnd() * 0.16;
      const root = [x + Math.cos(a) * 0.08, 0.1, z + Math.sin(a) * 0.08];
      const tip = [x + Math.cos(a) * len, 0.16 + len * 0.7, z + Math.sin(a) * len];
      this.b.limb(root, tip, 0.018, { c: color, m: "glow", e: 0.9, seg: 5 });
    }
  },

  // 海星：五隻腳貼在海床上
  starfish(x, z, color) {
    const rot = this.rnd() * 6.28;
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      this.b.box(0.07, 0.035, 0.3, {
        p: [x + Math.sin(a) * 0.13, 0.02, z + Math.cos(a) * 0.13], r: [0, a, 0], c: color, m: "matte",
      });
    }
    this.b.sphere(0.07, { p: [x, 0.025, z], s: [1, 0.5, 1], c: color, m: "matte", seg: 6 });
  },

  // 管蟲群：一叢高低不同的白色細管，頂端是紅色的鰓冠
  tubeWorms(x, z) {
    return this.prop(x, z, 0.8, 0.8, 0.9, () => {
      for (let i = 0; i < 8; i++) {
        const a = this.rnd() * 6.28, r = this.rnd() * 0.28, h = 0.4 + this.rnd() * 0.6;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        this.b.cyl(0.035, 0.045, h, { p: [px, h / 2, pz], c: 0xd8d2c4, m: "matte", seg: 6 });
        this.b.sphere(0.05, { p: [px, h + 0.03, pz], s: [1, 1.4, 1], c: 0xff4a4a, m: "glow", e: 1.1, seg: 6 });
      }
    }, 0.3);
  },

  // 海扇：一片扇形的珊瑚，立在一根短柄上。dir 偶數時扇面朝 Z
  seaFan(x, z, dir, color) {
    const alongX = dir % 2 === 0;
    return this.prop(x, z, alongX ? 1.3 : 0.3, alongX ? 0.3 : 1.3, 1.5, () => {
      const b = this.b;
      b.cyl(0.05, 0.08, 0.5, { p: [x, 0.25, z], c: 0x5a2a3a, m: "matte", seg: 6 });
      for (let i = -3; i <= 3; i++) { // 七根往外張開的扇骨
        const a = i * 0.24, len = 1.0 - Math.abs(i) * 0.06;
        const tx = Math.sin(a) * len, ty = 0.45 + Math.cos(a) * len;
        b.limb([x, 0.45, z], [x + (alongX ? tx : 0), ty, z + (alongX ? 0 : tx)], 0.022, {
          c: color, m: "matte", flat: true, seg: 5,
        });
      }
      for (const r of [0.45, 0.75]) { // 兩圈橫向的網紋
        b.torus(r, 0.014, {
          p: [x, 0.45, z], r: alongX ? [0, 0, Math.PI / 2 - 0.72] : [0, Math.PI / 2, Math.PI / 2 - 0.72], c: color,
          m: "matte", seg: 10, arc: 1.44,
        });
      }
    }, 0.3);
  },

  // 腦珊瑚：一顆有溝紋的半球
  brainCoral(x, z, r, color = 0x8a6a7a) {
    return this.prop(x, z, r * 1.7, r * 1.7, r * 0.95, () => {
      this.b.sphere(r, { p: [x, r * 0.05, z], s: [1, 0.95, 1], c: color, m: "matte", seg: 12 });
      for (let i = 0; i < 4; i++) { // 表面的溝紋
        this.b.torus(r * (0.94 - i * 0.2), 0.03, {
          p: [x, r * (0.24 + i * 0.2), z], r: [Math.PI / 2, 0, 0], c: 0x5a4250, m: "matte", seg: 12,
        });
      }
    }, 0.3);
  },

  /* 浮標：用鐵鍊拴在海床上的發光球，會跟著水流慢慢搖。
   * 沉在海床上的錨塊有碰撞，鐵鍊與浮球沒有。 */
  buoy(x, z, h, color) {
    const ok = this.prop(x, z, 0.8, 0.8, 0.7, () => {
      this.b.rbox(0.8, 0.7, 0.8, 0.1, { p: [x, 0.35, z], c: 0x3a4446, m: "wall" });
      this.b.torus(0.14, 0.03, { p: [x, 0.76, z], c: this.pal.dark, m: "metal", seg: 8 });
    }, 0.3);
    if (!ok) return;
    const fb = new Builder();
    for (let y = 0.2; y < h - 0.5; y += 0.34) { // 鐵鍊：一節橫、一節直
      fb.torus(0.07, 0.016, {
        p: [0, y, 0], r: [0, (Math.round(y / 0.34) % 2) * (Math.PI / 2), 0], c: 0x3a4446, m: "metal", seg: 6,
      });
    }
    fb.sphere(0.38, { p: [0, h, 0], c: 0xd8a030, m: "paint", seg: 12 });
    fb.torus(0.385, 0.04, { p: [0, h, 0], r: [Math.PI / 2, 0, 0], c: this.pal.dark, m: "metal", seg: 14 });
    fb.sphere(0.13, { p: [0, h + 0.46, 0], c: color, m: "glow", e: 2.6, seg: 8 });
    fb.cyl(0.03, 0.03, 0.2, { p: [0, h + 0.36, 0], c: this.pal.dark, m: "metal", seg: 6 });
    const g = fb.build({ cast: false });
    g.position.set(x, 0.8, z);
    const ph = this.rnd() * 6;
    this.dynamic(g, (dt, t) => {
      g.rotation.x = Math.sin(t * 0.5 + ph) * 0.08;
      g.rotation.z = Math.cos(t * 0.37 + ph) * 0.08;
    });
  },

  // 熱泉：一座小石煙囪，不斷冒出一串往上升的氣泡
  thermalVent(x, z) {
    const ok = this.prop(x, z, 1.1, 1.1, 1.3, () => {
      this.b.cone(0.6, 1.3, { p: [x, 0.65, z], c: 0x2a2826, m: "matte", seg: 7 });
      this.b.cyl(0.16, 0.2, 0.12, { p: [x, 1.3, z], c: 0x1a1816, m: "matte", seg: 7 });
      this.b.cyl(0.11, 0.11, 0.02, { p: [x, 1.365, z], c: 0xff8a3a, m: "glow", e: 1.6, seg: 7 });
    }, 0.4);
    if (ok) this.bubbles(x, 1.4, z, 7);
  },

  /* ============================================================
   *  空中與粒子
   * ============================================================ */

  // 細長的桿子（掛纜線用）；貼著牆放，不登記碰撞
  mast(x, z, h) {
    this.b.cyl(0.05, 0.07, h, { p: [x, h / 2, z], c: this.pal.dark, m: "metal", seg: 6 });
    this.b.sphere(0.08, { p: [x, h, z], c: this.pal.dark, m: "metal", seg: 6 });
  },

  /* 垂掛的纜線：從 a 到 b（[x, y, z]），中間下垂 sag 公尺。
   * colors 有給的話，每個節點掛一盞燈籠，顏色依序輪流。 */
  cableRun(a, b2, sag, colors, n = 10) {
    const pt = (t) => [
      a[0] + (b2[0] - a[0]) * t,
      a[1] + (b2[1] - a[1]) * t - Math.sin(t * Math.PI) * sag,
      a[2] + (b2[2] - a[2]) * t,
    ];
    for (let i = 0; i < n; i++) {
      this.b.limb(pt(i / n), pt((i + 1) / n), 0.018, { c: 0x0c0d10, m: "metal", flat: true, seg: 5 });
      if (!colors || i === 0) continue;
      const p = pt(i / n);
      const c = colors[i % colors.length];
      this.b.cyl(0.006, 0.006, 0.2, { p: [p[0], p[1] - 0.1, p[2]], c: 0x0c0d10, seg: 4 });
      this.b.rbox(0.26, 0.34, 0.26, 0.08, { p: [p[0], p[1] - 0.37, p[2]], c, m: "glow", e: 1.5 });
      this.b.box(0.3, 0.04, 0.3, { p: [p[0], p[1] - 0.2, p[2]], c: 0x0c0d10 });
    }
  },

  // 蒸氣：從 (x, y, z) 持續冒出白煙（離鏡頭太遠時不冒）
  steam(x, y, z, rate = 5) {
    let acc = this.rnd();
    const col = new THREE.Color(0x9aa4b8);
    this.anim((dt) => {
      if (!this._near(x, z, 55)) return;
      for (acc += dt * rate; acc > 1; acc--) {
        FX.smoke.emit({
          x: x + Util.rand(-0.15, 0.15), y, z: z + Util.rand(-0.15, 0.15),
          vx: Util.rand(-0.2, 0.2), vy: Util.rand(0.8, 1.6), vz: Util.rand(-0.2, 0.2),
          life: Util.rand(1.6, 2.6), size: 0.3, size1: 1.6, color: col, bright: 0.35, drag: 0.4,
        });
      }
    });
  },

  // 氣泡：從 (x, y, z) 持續冒出一串往上升的小氣泡
  bubbles(x, y, z, rate = 5) {
    let acc = this.rnd();
    const col = new THREE.Color(0xbff8ff);
    this.anim((dt) => {
      if (!this._near(x, z, 45)) return;
      for (acc += dt * rate; acc > 1; acc--) {
        FX.glow.emit({
          x: x + Util.rand(-0.1, 0.1), y, z: z + Util.rand(-0.1, 0.1),
          vx: Util.rand(-0.15, 0.15), vy: Util.rand(1.1, 2.0), vz: Util.rand(-0.15, 0.15),
          life: Util.rand(2.2, 3.6), size: Util.rand(0.04, 0.09), size1: 0.03, color: col, bright: 0.7, drag: 0.05,
        });
      }
    });
  },
});

/* ============================================================
 *  MapDetails ── 四張地圖各自的細節
 * ------------------------------------------------------------
 *  地圖大多是「中心對稱」的（(x, z) 和 (-x, -z) 各有一份），
 *  所以這裡常用 for (const s of [-1, 1]) 一次放兩邊。
 * ============================================================ */
const MapDetails = {
  /* ------------------------------------------------------------------
   *  新東京・霓虹天際
   * ------------------------------------------------------------------ */
  neo(k) {
    const P = k.pal;
    const A1 = P.accent1, A2 = P.accent2, GOLD = 0xffc233;

    for (const sx of [-1, 1]) {
      const fx = sx * 25; // 商業平台面向大道的那面牆
      const face = sx < 0 ? 1 : 3;
      const tint = sx < 0 ? A1 : A2;

      // ---- 平台前的人行道與路緣的排水格柵 ----
      k.b.box(1.7, 0.02, 44, { p: [sx * 24.15, 0.011, 0], c: P.floor, m: "floor" });
      k.b.box(0.08, 0.024, 44, { p: [sx * 23.3, 0.013, 0], c: tint, m: "glow", e: 0.7 });
      for (const z of [-19, -14, -5, 5, 14, 19]) k.grate(sx * 23.7, z, 0.5, 1.2);

      // ---- 店面：大門、鐵捲門、冷氣外機、水管、線槽、壁燈 ----
      k.door(fx, 0, face, tint, 1.7, 2.25);
      k.shutter(fx, sx * 15.2, face, 2.6, 2.3, GOLD);
      k.shutter(fx, sx * -18.6, face, 2.6, 2.3, tint);
      for (const z of [-13.2, 13.2, 20.6]) k.wallUnit(fx, 2.72, sx * z, face);
      k.wallPipes(fx, 10.2, face, 3.0, 3);
      k.wallPipes(fx, -10.2, face, 3.0, 2, 0x6a5a4a);
      k.wallPipes(fx, sx * -21.4, face, 3.0, 4);
      k.conduit(fx, 2.95, sx * -15.5, face, 9);
      k.wallVent(fx, 0.75, sx * 17.6, face, 1.2, 0.5);
      k.wallVent(fx, 0.75, sx * -5.6, face, 1.0, 0.5);
      for (const z of [-1.6, 1.6]) k.wallLight(fx, 2.75, z, face, tint);
      k.poster(fx, 1.75, sx * -13.4, face, 1.5, 0.7, sx < 0 ? "24H 營業" : "招募義體技師", GOLD);
      // 招牌、販賣機與大門映在濕地面上的光
      k.glowPatch(sx * 23.2, -3.6, 2.6, 3.4, A2, 0.28);
      k.glowPatch(sx * 23.2, 3.6, 2.6, 3.4, GOLD, 0.24);
      k.glowPatch(sx * 23.4, 0, 2.0, 1.6, tint, 0.3);
      k.glowPatch(sx * 22.9, sx * -11.5, 1.8, 1.4, sx < 0 ? A1 : A2, 0.3);
      k.glowPatch(sx * 22.9, sx * 11.5, 1.8, 1.4, sx < 0 ? GOLD : A1, 0.3);

      // ---- 門口的垃圾桶、消防栓與配電箱 ----
      k.bin(sx * 24.4, 1.9, tint);
      k.hydrant(sx * 24.2, sx * -16.2);
      k.utilBox(sx * 24.6, sx * 19.6, face, tint);

      // ---- 平台後方的摩天大樓：亮著燈的窗、直立招牌、屋頂邊的天線 ----
      for (const [tz, th, tc] of [[-12, 34, sx < 0 ? A2 : A1], [12, 26, sx < 0 ? A1 : A2]]) {
        const inner = sx * 32; // 大樓面向大道的那面
        for (let fy = 3.2 + 4.6; fy + 0.8 < 3.2 + th - 1; fy += 3.2) {
          for (let i = -2; i <= 2; i++) { // 面向大道：一層五格
            if (k.rnd() > 0.4) continue;
            const c = [tc, GOLD, 0xd8e4ff][Math.floor(k.rnd() * 3)];
            k.b.box(0.04, 1.5, 0.9, {
              p: [inner - sx * 0.03, fy, tz + i * 1.4], c, m: "glow", e: 0.35 + k.rnd() * 0.5,
            });
          }
          for (const sz of [-1, 1]) { // 南北兩側：一層三格
            for (let i = -1; i <= 1; i++) {
              if (k.rnd() > 0.35) continue;
              const c = [tc, GOLD, 0xd8e4ff][Math.floor(k.rnd() * 3)];
              k.b.box(0.9, 1.5, 0.04, {
                p: [sx * 34.5 + i * 1.4, fy, tz + sz * 4.03], c, m: "glow", e: 0.35 + k.rnd() * 0.5,
              });
            }
          }
        }
        k.bladeSign(inner, 6.6, tz + 3.3, face, 2.6, tc);
        k.bladeSign(inner, 7.4, tz - 3.3, face, 3.4, GOLD);
      }
      for (const z of [-21.6, 21.6]) { // 平台四個角落的女兒牆上各一根天線
        k.b.cyl(0.03, 0.04, 2.2, { p: [sx * 25.3, 5.3, z], c: P.dark, m: "metal", seg: 5 });
        k.b.sphere(0.07, { p: [sx * 25.3, 6.4, z], c: 0xff3030, m: "glow", e: 2.4, seg: 6 });
      }
      // 平台屋頂的天窗（貼在屋頂上、微微透光）
      for (const z of [-15, -3, 9]) {
        k.b.box(2.2, 0.03, 3.4, { p: [sx * 30, 3.275, sx * z], c: tint, m: "glow", e: 0.22 });
      }
    }

    // ---- 橫跨大道的纜線與燈籠：兩端掛在貼著平台牆面的細桿上 ----
    for (const z of [-28, -6, 6, 28]) {
      k.mast(-24.86, z, 6.2);
      k.mast(24.86, z, 6.2);
      k.cableRun([-24.86, 6.15, z], [24.86, 6.15, z], 1.5, [A1, A2, GOLD], 12);
    }

    // ---- 磁浮軌道：支柱上的警示帶、纜線束、爬梯，軌道底下的橫樑與燈 ----
    for (const x of [-12, 12]) {
      k.b.box(1.7, 0.5, 1.7, { p: [x, 0.25, 0], c: P.dark, m: "trim" });
      k.b.box(1.46, 0.22, 1.46, { p: [x, 1.3, 0], c: P.hazard, m: "glow", e: 0.55 });
      for (const y of [5.5, 8.5, 11.2]) k.b.box(1.5, 0.16, 1.5, { p: [x, y, 0], c: P.dark, m: "trim" });
      for (const sz of [-1, 1]) {
        k.b.cyl(0.05, 0.05, 11.6, { p: [x + 0.4, 6.3, sz * 0.74], c: 0x5a6478, m: "metal", seg: 6 });
      }
      k.ladder(x + (x < 0 ? -0.7 : 0.7), 0, x < 0 ? 3 : 1, 9, 2.6);
      k.b.sphere(0.12, { p: [x, 10.2, 0.76], c: 0xff3030, m: "glow", e: 2.6, seg: 6 });
    }
    for (let x = -42; x <= 42; x += 6) {
      k.b.box(0.4, 0.3, 3.2, { p: [x, 12.76, 0], c: 0x10131a, m: "metal" });
      k.b.box(0.2, 0.06, 0.5, { p: [x, 12.6, 0], c: A1, m: "glow", e: 1.6 });
    }

    // ---- 街道：斑馬線旁的護柱、紅綠燈、路牌、花台旁的長椅、資訊站 ----
    for (const s of [-1, 1]) {
      for (const x of [-8.2, 8.2]) for (const dz of [-1.7, 1.7]) k.bollard(x, s * 21 + dz, s < 0 ? A1 : A2);
      k.trafficLight(s * 8.6, s * -18.2, s < 0 ? 1 : 3);
      k.signPost(s * -8.6, s * -24.2, s < 0 ? 2 : 0, GOLD, "限速 60");
      k.bench(s * -8, s * -8.9, 0);
      k.bench(s * -9.9, s * 7, 1);
      k.terminal(s * 15.5, s * -1.5, s < 0 ? 1 : 3, s < 0 ? A1 : A2);
      k.bin(s * 6.6, s * 34.6, GOLD);
      k.utilBox(s * 20.6, s * 36.6, s < 0 ? 2 : 0, A1);
    }

    // ---- 地面：人孔蓋（其中兩個冒著蒸氣）、車道箭頭、輪胎留下的污漬 ----
    for (const [x, z] of [[-18, 4], [18, -4], [0, 34], [0, -34], [-1.5, 15], [1.5, -15]]) k.manhole(x, z);
    k.steam(-18, 0.1, 4, 4);
    k.steam(18, 0.1, -4, 4);
    for (const z of [-27, 27]) {
      k.arrow(-1.5, z, 0, 0x8a90a0);
      k.arrow(1.5, z, 2, 0x8a90a0);
    }
    for (const [x, z, r] of [[-5, 18, 1.4], [5, -18, 1.4], [-14, -26, 1.1], [14, 26, 1.1], [-20, 0, 1.6], [20, 0, 1.6]]) {
      k.stain(x, z, r);
    }

    // ---- 路邊攤：棚下的燈籠與櫃台上的菜單燈箱 ----
    for (const [x, z, s] of [[-12, -34, 1], [12, 34, -1]]) {
      for (let i = -2; i <= 2; i++) {
        k.b.cyl(0.005, 0.005, 0.2, { p: [x + i * 1.0, 2.6, z + s * 1.45], c: 0x0c0d10, seg: 4 });
        k.b.rbox(0.22, 0.3, 0.22, 0.07, {
          p: [x + i * 1.0, 2.36, z + s * 1.45], c: i % 2 ? 0xff5a3a : GOLD, m: "glow", e: 1.4,
        });
      }
      k.b.box(1.4, 0.36, 0.06, { p: [x - 1.2, 1.3, z + s * 0.9], r: [s * -0.25, 0, 0], c: A2, m: "glow", e: 0.8 });
      // 碗
      for (const dx of [0.4, 1.0, 1.6]) {
        k.b.cyl(0.09, 0.07, 0.12, { p: [x + dx, 1.16, z + s * 0.9], c: 0xd8dee8, seg: 8 });
      }
    }

    // ---- 南北車站：棚下垂掛的月台牌與候車長椅 ----
    for (const s of [-1, 1]) {
      for (const dx of [-3.4, 3.4]) {
        k.b.box(1.6, 0.4, 0.08, { p: [dx, 2.62, s * 39], c: 0x0c0d10 });
        k.b.box(1.5, 0.05, 0.1, { p: [dx, 2.38, s * 39], c: dx < 0 ? A1 : A2, m: "glow", e: 1.6 });
        k.b.cyl(0.012, 0.012, 0.22, { p: [dx - 0.6, 2.92, s * 39], c: 0x0c0d10, seg: 4 });
        k.b.cyl(0.012, 0.012, 0.22, { p: [dx + 0.6, 2.92, s * 39], c: 0x0c0d10, seg: 4 });
      }
    }
  },

  /* ------------------------------------------------------------------
   *  焦土・末日之城
   * ------------------------------------------------------------------ */
  ruin(k) {
    const P = k.pal;
    const FIRE = P.accent1, EMBER = P.accent2;
    const s0 = World.half;

    // ---- 圍牆：每隔一段的扶壁、牆頂的鐵絲網柱、牆上的警告標語 ----
    for (const side of [0, 1, 2, 3]) {
      const [vx, vz] = k._dir(side); // 牆面朝向（朝地圖內）
      const wx = -vx * (s0 - 1), wz = -vz * (s0 - 1); // 這面牆內側表面的中心
      const put = k.onWall(wx, wz, side);
      for (let t = -36; t <= 36; t += 9) {
        put(0.9, 5.2, 0.45, t, 2.6, 0, { c: 0x332b26, m: "wall", ao: 0.35 });
        put(1.0, 0.25, 0.55, t, 5.3, 0, { c: P.dark, m: "trim" });
        const [bx, bz] = k._wallPoint(wx, wz, side, t, 0.225);
        World.addBox(bx, 2.7, bz, vx ? 0.45 : 0.9, 5.4, vx ? 0.9 : 0.45, { noWalk: true });
      }
      for (let t = -42; t <= 42; t += 4) put(0.08, 1.3, 0.08, t, 6.9, -0.5, { c: 0x2a221c, m: "metal" }); // 鐵絲網柱
      for (const y of [6.8, 7.3]) put(86, 0.025, 0.025, 0, y, -0.47, { c: 0x4a4038, m: "metal" }); // 兩道鐵絲
      put(84, 0.4, 0.02, 0, 1.0, 0, { c: P.hazard, m: "paint" }); // 牆腳的警示色帶
    }
    k.poster(-20, 3.4, -s0 + 1, 2, 6, 1.1, "撤離區 EVAC ▶", EMBER);
    k.poster(22, 3.4, s0 - 1, 0, 6, 1.1, "◀ 撤離區 EVAC", EMBER);
    k.poster(-s0 + 1, 3.4, 20, 1, 5, 1.1, "危險 DANGER", 0xff3a2a);
    k.poster(s0 - 1, 3.4, -20, 3, 5, 1.1, "危險 DANGER", 0xff3a2a);

    // ---- 只剩鋼骨的建築與枯樹 ----
    k.beamFrame(-9, -18.5, 5, 4, 5.2);
    k.beamFrame(9, 18.5, 5, 4, 5.2);
    k.beamFrame(-33, -38, 5, 4, 4.4);
    k.beamFrame(33, 38, 5, 4, 4.4);
    for (const [x, z, h] of [
      [-34, 12, 4.4], [34, -12, 4.4], [-10, 39, 3.6], [10, -39, 3.6], [-27, -34, 4.8], [27, 34, 4.8],
      [-17, 17, 3.8], [17, -17, 3.8], [-41, -12, 4.2], [41, 12, 4.2],
    ]) k.deadTree(x, z, h);

    // ---- 路障與堆積物：油桶、輪胎、水泥涵管、蓋著防水布的物資 ----
    for (const s of [-1, 1]) {
      k.drum(s * -22, s * 12);
      k.drum(s * -22.7, s * 12.5, 0x6a3a2a);
      k.drum(s * -4, s * 32.4, 0x3a4a5a);
      k.tireStack(s * -12, s * 26.5);
      k.tireStack(s * -32, s * -10);
      k.pipeSection(s * -30, s * -15, 0);
      k.pipeSection(s * 15, s * -6, 1);
      k.pallet(s * -36, s * 24, 0x4a5a4a);
      k.pallet(s * -4.5, s * -34, 0x5a4a3a);
      k.signPost(s * -13, s * 20.6, s < 0 ? 2 : 0, 0xff3a2a, "封鎖");
    }

    // ---- 地面：碎磚、焦痕、褪色的車道線、遠處還沒熄的餘燼 ----
    for (const [x, z] of [
      [-26, 2], [26, -2], [-9, -20], [9, 20], [-30, -24], [30, 24], [-16, 34], [16, -34], [-36, 20], [36, -20],
    ]) {
      k.bricks(x, z, 2.6, 16, k.rnd() < 0.5 ? 0x6a4a3a : 0x5a5048);
    }
    for (const [x, z, r] of [[-12, -2, 2.2], [12, 2, 2.2], [-28, 18, 1.8], [28, -18, 1.8], [-4, 38, 2.4], [4, -38, 2.4]]) {
      k.stain(x, z, r, 0x0e0a08);
    }
    for (let z = -40; z <= 40; z += 5) { // 中線：斷斷續續、有些已經磨掉
      if (Math.abs(z) < 14 || k.rnd() < 0.3) continue;
      k.b.box(0.2, 0.012, 2.2, {
        p: [(k.rnd() - 0.5) * 0.3, 0.012, z], r: [0, (k.rnd() - 0.5) * 0.08, 0], c: 0x8a8274, m: "paint",
      });
    }
    for (const [x, z] of [[-17.5, -12.6], [17.5, 12.6], [-8.4, 21.4], [9.4, -20.6], [-5, 33.4], [7.4, -35.4]]) {
      for (let i = 0; i < 4; i++) { // 殘骸旁的餘燼
        k.b.box(0.12, 0.05, 0.1, {
          p: [x + (k.rnd() - 0.5) * 1.6, 0.03, z + (k.rnd() - 0.5) * 1.6],
          r: [0, k.rnd() * 3, 0], c: FIRE, m: "glow", e: 1.2 + k.rnd(),
        });
      }
    }

    // ---- 公車殘骸：腰線、輪子、保險桿、車頂冷氣、擋風玻璃與還亮著一點的路線牌 ----
    k.b.push(-6, 1.3, 33, 0, 0.08, 0); // 和車身一樣微微側傾；以下座標以車身中心為原點
    k.b.box(10.02, 0.26, 2.86, { p: [0, -0.3, 0], c: 0x8a6a4a, m: "trim" });
    for (const wx of [-3.2, 3.0]) for (const sz of [-1, 1]) {
      k.b.cyl(0.52, 0.52, 0.3, { p: [wx, -0.86, sz * 1.3], r: [Math.PI / 2, 0, 0], c: 0x0c0a08, m: "matte", seg: 12 });
      k.b.cyl(0.24, 0.24, 0.32, { p: [wx, -0.86, sz * 1.3], r: [Math.PI / 2, 0, 0], c: 0x3a3028, m: "metal", seg: 8 });
      k.b.box(1.3, 0.12, 0.06, { p: [wx, -0.3, sz * 1.44], c: 0x2a221c, m: "metal" }); // 輪拱
    }
    for (const ex of [-1, 1]) k.b.box(0.2, 0.36, 2.7, { p: [ex * 5.06, -0.82, 0], c: 0x2a221c, m: "metal" });
    k.b.rbox(2.6, 0.3, 1.7, 0.08, { p: [0.4, 1.44, 0], c: 0x3a2e24, m: "trim" });
    k.b.box(0.06, 1.0, 2.3, { p: [5.0, 0.45, 0], c: 0x0a0806, m: "matte" });
    k.b.box(0.07, 0.3, 1.7, { p: [5.0, 1.08, 0], c: EMBER, m: "glow", e: 0.45 });
    k.b.box(0.06, 0.8, 2.3, { p: [-5.0, 0.5, 0], c: 0x0a0806, m: "matte" });
    for (const sz of [-1, 1]) k.b.box(1.0, 1.9, 0.05, { p: [3.6, -0.2, sz * 1.42], c: 0x4a2a14, m: "trim" }); // 車門
    k.b.pop();

    // ---- 戰車殘骸：履帶、路輪、擋泥板、砲塔艙蓋與引擎蓋的散熱格柵 ----
    for (const sz of [-1, 1]) {
      const tz = -36 + sz * 1.55;
      k.b.rbox(6.6, 0.9, 0.62, 0.2, { p: [8, 0.46, tz], c: 0x1c1a14, m: "matte" });
      for (let i = 0; i < 5; i++) {
        k.b.cyl(0.34, 0.34, 0.66, { p: [5.6 + i * 1.2, 0.42, tz], r: [Math.PI / 2, 0, 0], c: 0x2a2a20, m: "metal", seg: 10 });
      }
      k.b.box(6.5, 0.07, 0.8, { p: [8, 0.98, tz], c: 0x34342a, m: "trim" });
    }
    k.b.cyl(0.42, 0.42, 0.1, { p: [8.3, 2.3, -36.5], r: [0, 0, 0.15], c: 0x2a2a20, m: "metal", seg: 10 });
    for (let i = 0; i < 4; i++) k.b.box(1.4, 0.05, 0.12, { p: [5.8, 1.43, -36.6 + i * 0.4], c: 0x1c1a14, m: "metal" });
    k.b.box(0.5, 0.3, 0.9, { p: [4.72, 0.9, -36], c: 0x2a2a20, m: "metal" }); // 車尾的工具箱

    // ---- 倒塌大樓的斷口：露出來的鋼筋 ----
    for (const [x, z, sx] of [[40.6, -24, 1], [-40.6, 24, -1]]) {
      for (let i = 0; i < 9; i++) {
        const oz = (i - 4) * 0.7;
        k.b.limb([x, 6.2, z + oz], [x + sx * (0.5 + k.rnd() * 0.9), 6.3 + k.rnd() * 1.6, z + oz + (k.rnd() - 0.5) * 0.6], 0.03, {
          c: 0x5a3a2a, m: "metal", flat: true, seg: 5,
        });
      }
    }

    // ---- 隕石坑：坑邊多幾塊發光的隕石碎片 ----
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3, r = 4.2 + (i % 3) * 0.5;
      const size = 0.16 + k.rnd() * 0.18;
      k.b.sphere(size, {
        p: [Math.cos(a) * r, size * 0.6, Math.sin(a) * r], s: [1.2, 0.8, 1], r: [0, a, 0.4], c: 0x1a1412, m: "matte",
        seg: 6,
      });
      k.b.box(size * 0.5, 0.03, size * 0.5, {
        p: [Math.cos(a) * r, size * 1.1, Math.sin(a) * r], r: [0.3, a, 0.2], c: EMBER, m: "glow", e: 2,
      });
    }

    // ---- 圍牆外：只剩骨架的高樓剪影，讓廢墟往遠處延伸 ----
    const skeleton = (x, z, w, floors) => {
      const h = floors * 3.6, dark = 0x1a1412;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.b.box(0.6, h, 0.6, { p: [x + sx * w / 2, h / 2, z + sz * w / 2], c: dark, m: "matte" });
      }
      for (let f = 1; f <= floors; f++) {
        if (f > floors - 2 && k.rnd() < 0.5) continue; // 頂上幾層有的已經塌了
        const y = f * 3.6;
        for (const sz of [-1, 1]) k.b.box(w + 0.6, 0.4, 0.4, { p: [x, y, z + sz * w / 2], c: dark, m: "matte" });
        for (const sx of [-1, 1]) {
          k.b.box(0.4, 0.38, w + 0.6, { p: [x + sx * w / 2, y - 0.01, z], c: dark, m: "matte" });
        }
      }
    };
    for (const [x, z, w, f] of [
      [-60, -30, 9, 7], [62, 18, 10, 9], [-30, 62, 9, 6], [26, -64, 11, 8], [-64, 30, 8, 5], [58, -44, 9, 6],
    ]) {
      skeleton(x, z, w, f);
    }
  },

  /* ------------------------------------------------------------------
   *  天穹・軌道環站
   * ------------------------------------------------------------------ */
  orbit(k) {
    const P = k.pal;
    const A1 = P.accent1, A2 = P.accent2;
    const s0 = World.half;

    // ---- 頭頂的桁架拱：五道橫跨站體的鋼拱，拱與拱之間用縱樑相連 ----
    // 拱從玻璃外殼的頂框（高 8.6）起跳，一離開牆邊就很快拉高，最高點約 24 公尺，
    // 比反應爐頂（12.7）高出一大截，站在大廳裡抬頭才不會覺得壓在頭上。
    const archX = (t) => -s0 + 1 + t * (s0 * 2 - 2);
    const archY = (t) => 8.6 + Math.pow(Math.sin(t * Math.PI), 0.75) * 15.5; // t = 0~1，兩端低、中間高
    const DEPTH = 1.5; // 上弦與下弦的距離
    // 下弦的位置：從上弦沿著「垂直於拱」的方向往內退 DEPTH，桁架在斜的地方才不會變薄
    const inner = (t) => {
      const e = 0.002;
      const tx = archX(t + e) - archX(t - e);
      const ty = archY(Math.min(1, t + e)) - archY(Math.max(0, t - e));
      const len = Math.hypot(tx, ty);
      return [archX(t) + (ty / len) * DEPTH, archY(t) - (tx / len) * DEPTH];
    };
    const N = 20;
    for (const z of [-30, -15, 0, 15, 30]) {
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        const a0 = [archX(t0), archY(t0), z], a1 = [archX(t1), archY(t1), z];
        const [bx0, by0] = inner(t0), [bx1, by1] = inner(t1);
        k.b.limb(a0, a1, 0.2, { c: P.wall2, m: "trim", flat: true, seg: 6 }); // 上弦
        k.b.limb([bx0, by0, z], [bx1, by1, z], 0.14, { c: P.wall2, m: "trim", flat: true, seg: 6 }); // 下弦
        k.b.limb([bx0, by0, z], a1, 0.08, { c: P.dark, m: "metal", flat: true, seg: 5 }); // 斜腹桿
        // 桁架底下的燈（離地更遠了，所以做得比較大）
        if (i % 2 === 0 && i > 0) {
          k.b.box(0.8, 0.1, 0.8, { p: [bx0, by0 - 0.2, z], c: i % 4 ? A2 : A1, m: "glow", e: 2.2 });
        }
      }
    }
    for (const t of [0.25, 0.5, 0.75]) { // 三道縱樑，夾在上下弦之間
      const [bx, by] = inner(t);
      k.b.box(0.3, 0.3, 61, { p: [(archX(t) + bx) / 2, (archY(t) + by) / 2, 0], c: P.wall2, m: "trim" });
    }

    // ---- 地板：面板接縫、反應爐樓梯口的警示斜紋、反應爐周圍的一圈地燈 ----
    for (let t = -36; t <= 36; t += 6) {
      if (t === 0) continue;
      k.b.box(s0 * 2 - 2.4, 0.012, 0.07, { p: [0, 0.008, t], c: P.dark, m: "paint" });
      k.b.box(0.07, 0.01, s0 * 2 - 2.4, { p: [t, 0.007, 0], c: P.dark, m: "paint" });
    }
    for (const [x, z] of [[0, 9.9], [0, -9.9], [9.9, 0], [-9.9, 0]]) {
      for (let i = -3; i <= 3; i++) {
        const along = i * 0.56;
        k.b.box(0.22, 0.012, 0.9, {
          p: [x + (x ? 0 : along), 0.02, z + (z ? 0 : along)], r: [0, 0.6, 0], c: P.hazard, m: "paint",
        });
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.cos(a)) > 0.93 || Math.abs(Math.sin(a)) > 0.93) continue; // 讓開四面的樓梯
      k.b.cyl(0.16, 0.16, 0.03, {
        p: [Math.cos(a) * 9.2, 0.018, Math.sin(a) * 9.2], c: i % 2 ? A1 : A2, m: "glow", e: 1.4, seg: 10,
      });
    }
    // 反應爐高台上：從爐心通往四角的冷卻管與爐體上的警示燈
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.b.box(0.34, 0.08, 3.4, { p: [sx * 3.2, 1.54, sz * 3.2], r: [0, sx * sz * -0.785, 0], c: P.dark, m: "metal" });
      k.b.box(0.1, 0.03, 3.2, { p: [sx * 3.2, 1.59, sz * 3.2], r: [0, sx * sz * -0.785, 0], c: A1, m: "glow", e: 1.3 });
      for (const y of [4.2, 8.2]) {
        k.b.box(0.56, 0.2, 0.56, { p: [sx * 1.75, y, sz * 1.75], c: P.hazard, m: "glow", e: 0.7 });
      }
    }

    // ---- 外殼下緣：沿著白色牆板的控制台與儲物櫃 ----
    for (const side of [0, 1, 2, 3]) {
      const [vx, vz] = k._dir(side);
      const put = k.onWall(-vx * (s0 - 1), -vz * (s0 - 1), side);
      const len = (side % 2 ? s0 * 2 - 2 : s0 * 2) / 2;
      for (let t = -len + 7; t < len - 3; t += 7) {
        put(2.4, 0.9, 0.28, t, 0.55, 0, { c: P.wall2, m: "trim" });
        put(2.0, 0.3, 0.02, t, 0.72, 0.28, { c: (t / 7) % 2 ? A1 : A2, m: "glow", e: 0.8 });
        put(2.4, 0.06, 0.32, t, 1.02, 0, { c: P.dark, m: "trim" });
        for (let i = -1; i <= 1; i++) put(0.5, 0.03, 0.02, t + i * 0.7, 0.3, 0.28, { c: P.dark, m: "metal" });
      }
    }

    // ---- 四個艙體：橋下的氣密門、朝大廳的貨物閘門、爬梯、氣瓶與橋頭的發射器 ----
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 24, cz = sz * 22;
      const tint = sx * sz > 0 ? A1 : A2;
      k.door(cx - sx * 5, cz, sx < 0 ? 1 : 3, tint, 1.6, 2.3);
      k.shutter(cx + sx * 1.2, cz - sz * 4, sz < 0 ? 2 : 0, 2.8, 2.4, tint);
      k.ladder(cx - sx * 3.4, cz - sz * 4, sz < 0 ? 2 : 0, 3.3);
      k.wallLight(cx + sx * 1.2, 2.95, cz - sz * 4, sz < 0 ? 2 : 0, tint);
      k.wallPipes(cx + sx * 5, cz + sz * 1.6, sx < 0 ? 3 : 1, 3.2, 3, 0xb8c0cc);
      k.wallVent(cx + sx * 5, 2.4, cz - sz * 1.8, sx < 0 ? 3 : 1, 1.4, 0.6);
      k.gasTanks(cx + sx * 3.4, cz - sz * 4.5);
      for (const dz of [-1.95, 1.95]) { // 硬光橋兩端的發射器
        k.b.box(0.26, 1.25, 0.26, { p: [cx - sx * 4.87, 3.4 + 0.625, cz + dz], c: P.dark, m: "metal" });
        k.b.box(0.3, 0.1, 0.3, { p: [cx - sx * 4.87, 4.7, cz + dz], c: sz < 0 ? A2 : A1, m: "glow", e: 2.2 });
      }
    }

    // ---- 穿梭機：機翼燈、機身編號條、輪子、加油管與地面的加油口 ----
    for (const sx of [-1, 1]) {
      const x = sx * 33;
      for (const wx of [-1, 1]) {
        // 翼尖燈
        k.b.sphere(0.12, {
          p: [x + wx * 5.95, 3.15, 2.2], c: wx * sx > 0 ? 0x30ff7a : 0xff2030, m: "glow", e: 2.6, seg: 6,
        });
        // 前輪
        k.b.cyl(0.26, 0.26, 0.2, {
          p: [x + wx * 1.4, 0.26, -4], r: [0, 0, Math.PI / 2], c: 0x0b0b0c, m: "matte", seg: 10,
        });
        // 後輪
        k.b.cyl(0.3, 0.3, 0.24, {
          p: [x + wx * 1.5, 0.3, 4.2], r: [0, 0, Math.PI / 2], c: 0x0b0b0c, m: "matte", seg: 10,
        });
        k.b.box(0.2, 0.9, 0.2, { p: [x + wx * 1.5, 0.75, 4.2], c: P.dark, m: "metal" });
      }
      k.b.box(0.03, 0.5, 5, { p: [x - sx * 2.115, 2.3, -0.5], c: P.dark, m: "paint" }); // 朝大廳那一側的編號條
      k.b.box(0.035, 0.12, 4.6, { p: [x - sx * 2.12, 2.3, -0.5], c: A1, m: "glow", e: 1.1 });
      k.b.box(2.2, 0.06, 0.9, { p: [x, 3.24, -1.2], c: P.dark, m: "trim" }); // 機背的艙蓋
      // 機鼻：往前收尖的圓頭（原本機身是切平的），前端一顆感測器；機鼻也登記碰撞
      k.b.sphere(1, { p: [x, 1.75, -6.0], s: [1.95, 1.3, 1.7], c: P.wall, m: "paint", seg: 16 });
      k.b.sphere(0.22, { p: [x, 1.6, -7.62], c: P.dark, m: "metal", seg: 8 });
      World.addBox(x, 1.6, -7.0, 3.0, 2.4, 1.2, { noWalk: true });
      // 垂直尾翼與翼緣的燈
      k.b.box(0.24, 2.3, 2.8, { p: [x, 4.0, 4.5], r: [-0.32, 0, 0], c: P.wall2, m: "wall" });
      k.b.box(0.26, 0.1, 2.6, { p: [x, 5.02, 4.94], r: [-0.32, 0, 0], c: A2, m: "glow", e: 1.6 });
      // 機身兩側的一排舷窗
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          k.b.box(0.03, 0.4, 0.62, { p: [x + side * 2.108, 1.9, -2.2 + i * 1.05], c: 0x10223a, m: "metal" });
        }
      }
      // 加油管：從機腹垂到地面的加油口
      const port = [x - sx * 3.6, 0.1, -5.2];
      k.b.limb([x - sx * 1.6, 0.9, -3.2], [x - sx * 2.8, 0.25, -4.6], 0.07, {
        c: 0x2a3242, m: "matte", flat: true, seg: 6,
      });
      k.b.limb([x - sx * 2.8, 0.25, -4.6], port, 0.07, { c: 0x2a3242, m: "matte", flat: true, seg: 6 });
      k.b.cyl(0.3, 0.34, 0.14, { p: [port[0], 0.07, port[2]], c: P.dark, m: "metal", seg: 10 });
      k.b.cyl(0.2, 0.2, 0.02, { p: [port[0], 0.15, port[2]], c: P.hazard, m: "glow", e: 1.2, seg: 10 });
      k.cargoPod(sx * 27.6, sx * -8.4, 1, A1);
      k.cargoPod(sx * 37.4, sx * 9.6, 0, A2);
    }

    // ---- 大廳：植栽艙、全像桌、資訊站、休息長椅 ----
    for (const s of [-1, 1]) {
      k.plantTube(s * -10, s * 13, A1);
      k.plantTube(s * 28, s * 9, A2);
      k.plantTube(s * 8.6, s * 31.5, A1);
      k.holoTable(s * -14, s * -10.4, s < 0 ? A2 : A1);
      k.terminal(s * 8, s * -26.5, s < 0 ? 2 : 0, A1);
      k.bench(s * -39.4, s * -8, 1);
      k.bench(s * -39.4, s * 22, 1);
      k.cargoPod(s * -31, s * 30, 0, A2);
    }

    // ---- 艙體之間的告示 ----
    k.poster(-19, 2.75, -19.2, 1, 2.2, 0.5, "艙段 A-1", A1);
    k.poster(19, 2.75, 19.2, 3, 2.2, 0.5, "艙段 B-2", A1);
  },

  /* ------------------------------------------------------------------
   *  深淵・海底研究站
   * ------------------------------------------------------------------ */
  abyss(k) {
    const P = k.pal;
    const AQ = P.accent1, SODIUM = P.accent2, PINK = 0xff5aa8;

    // ---- 圓頂實驗室裡面：中央的控制台與三座發光的標本槽（隔著玻璃看得到） ----
    k.b.cyl(1.0, 1.2, 0.9, { p: [0, 1.65, 0], c: P.wall2, m: "trim", seg: 12 });
    k.b.cyl(0.9, 0.9, 0.04, { p: [0, 2.12, 0], c: AQ, m: "glow", e: 1.0, seg: 12 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const x = Math.cos(a) * 2.7, z = Math.sin(a) * 2.7;
      k.b.cyl(0.42, 0.48, 0.3, { p: [x, 1.35, z], c: P.dark, m: "metal", seg: 10 });
      k.b.cyl(0.34, 0.34, 1.5, { p: [x, 2.25, z], c: [AQ, PINK, SODIUM][i], m: "glow", e: 0.55, seg: 10 });
      k.b.cyl(0.42, 0.42, 0.14, { p: [x, 3.05, z], c: P.dark, m: "metal", seg: 10 });
    }
    // 圓頂底座四面的艙門與告示
    for (const side of [0, 1, 2, 3]) {
      const [vx, vz] = k._dir(side);
      const put = k.onWall(vx * 4.86, vz * 4.86, side);
      put(1.3, 0.95, 0.1, 0, 0.62, 0, { c: P.dark, m: "metal" });
      put(1.0, 0.06, 0.03, 0, 1.0, 0.1, { c: SODIUM, m: "glow", e: 1.4 });
      for (const s of [-1, 1]) put(0.1, 1.05, 0.14, s * 0.72, 0.6, 0, { c: P.wall2, m: "trim" });
    }

    // ---- 玻璃隧道：出入口的門框、地板兩側的導引燈、出口指示 ----
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const [a, b] of [[18.6, 22.44], [31.4, 34.6]]) { // 兩個出入口的左右邊
          for (const x of [a, b]) {
            k.b.box(0.24, 3.3, 0.34, { p: [sx * x, 1.65, sz * 2.4], c: P.wall2, m: "trim", ao: 0.3 });
            k.b.box(0.08, 2.6, 0.38, { p: [sx * x, 1.5, sz * 2.4], c: AQ, m: "glow", e: 1.2 });
          }
          k.b.box(b - a + 0.24, 0.24, 0.36, { p: [sx * (a + b) / 2, 3.2, sz * 2.4], c: P.wall2, m: "trim" });
          k.b.box(b - a - 0.4, 0.06, 0.4, { p: [sx * (a + b) / 2, 3.04, sz * 2.4], c: SODIUM, m: "glow", e: 1.6 });
        }
        k.b.box(31.6, 0.02, 0.08, { p: [sx * 25, 0.075, sz * 2.05], c: AQ, m: "glow", e: 1.1 }); // 地板導引燈
      }
      k.label(sx * 20.5, 2.6, 0, sx < 0 ? 1 : 3, 2.4, 0.5, sx < 0 ? "A 區 ▶" : "◀ C 區", AQ);
    }

    // ---- 實驗大樓：門、探照燈與照到海床上的光錐、屋頂通往圓頂的架空管線 ----
    for (const sd of [-1, 1]) {
      const cx = sd * -26, cz = sd * 18;
      k.door(cx + sd * 6, cz - sd * 2.4, sd > 0 ? 1 : 3, AQ, 1.6, 2.3);
      k.shutter(cx - sd * 1.5, cz - sd * 4.5, sd > 0 ? 0 : 2, 3.0, 2.4, SODIUM);
      k.wallPipes(cx - sd * 4.6, cz - sd * 4.5, sd > 0 ? 0 : 2, 3.2, 3, 0x7a8a8a);
      k.wallVent(cx + sd * 3.6, 2.5, cz - sd * 4.5, sd > 0 ? 0 : 2, 1.4, 0.6);
      k.ladder(cx - sd * 6, cz + sd * 1.5, sd > 0 ? 3 : 1, 3.3);
      // 屋頂邊緣的探照燈：斜著往外照，光錐跟著燈筒的方向落在海床上
      for (const dz of [-3, 3]) {
        k.spotlight(cx + sd * 6.6, 3.3, cz + dz, sd > 0 ? 1 : 3, 0x9ff8ff);
      }
      // 架空管線：從大樓屋頂拉到圓頂旁，中間用兩根支柱撐著
      const y = 3.9, pz = cz - sd * 2;
      k.pipe([cx + sd * 6, y, pz], [sd * -9, y, pz], 0.2, 0x6a7880);
      k.b.limb([sd * -9, y, pz], [sd * -9, 0.2, pz], 0.2, { c: 0x6a7880, m: "metal", flat: true });
      k.prop(sd * -9, pz, 0.6, 0.6, 4, () => { // 管線入地的地方：一圈基座
        k.b.cyl(0.34, 0.4, 0.3, { p: [sd * -9, 0.15, pz], c: P.dark, m: "metal", seg: 10 });
      }, 0.2);
      for (const px of [-16, -12.4]) {
        k.prop(sd * px, pz, 0.4, 0.4, y, () => {
          k.b.box(0.24, y - 0.2, 0.24, { p: [sd * px, (y - 0.2) / 2, pz], c: P.wall2, m: "trim", ao: 0.3 });
          k.b.box(0.7, 0.14, 0.5, { p: [sd * px, y - 0.27, pz], c: P.dark, m: "metal" });
        }, 0.2);
      }
    }

    // ---- 居住艙：艙門、托架與艙頂的出入口 ----
    for (const sd of [-1, 1]) {
      const cx = sd * 24, cz = sd * 20;
      for (const ex of [-1, 1]) {
        k.b.cyl(0.8, 0.8, 0.1, {
          p: [cx + ex * 6.86, 2.4, cz], r: [0, 0, Math.PI / 2], c: P.dark, m: "metal", seg: 14,
        });
        k.b.torus(0.6, 0.06, {
          p: [cx + ex * 6.93, 2.4, cz], r: [0, Math.PI / 2, 0], c: AQ, m: "glow", e: 1.4, seg: 16,
        });
        k.b.box(0.06, 0.12, 0.9, { p: [cx + ex * 6.94, 2.4, cz], c: 0x8a9099, m: "metal" }); // 門上的轉盤把手
        k.b.box(0.06, 0.9, 0.12, { p: [cx + ex * 6.94, 2.4, cz], c: 0x8a9099, m: "metal" });
      }
      for (const lx of [-4, 0, 4]) { // 三組托架
        k.b.box(0.5, 0.7, 4.3, { p: [cx + lx, 0.35, cz], c: P.wall2, m: "trim", ao: 0.3 });
        for (const sz of [-1, 1]) {
          k.b.box(0.4, 1.6, 0.4, { p: [cx + lx, 1.0, cz + sz * 2.0], r: [sz * 0.35, 0, 0], c: P.wall2, m: "trim" });
        }
      }
      k.b.cyl(0.7, 0.8, 0.5, { p: [cx - 2, 4.7, cz], c: P.dark, m: "metal", seg: 12 });
      k.b.cyl(0.62, 0.62, 0.08, { p: [cx - 2, 4.98, cz], c: 0xd8b060, m: "paint", seg: 12 });
      k.b.box(3.4, 0.5, 0.03, { p: [cx + 1.5, 3.3, cz + 1.64], r: [-0.84, 0, 0], c: P.dark, m: "paint" }); // 艙身上的編號底板
    }

    // ---- 沉沒的潛艇：螺旋槳、魚雷管口、甲板欄杆、藤壺與拖在海床上的錨鍊 ----
    k.b.push(0, 2.2, -28, 0, 0.12, 0);
    for (let i = 0; i < 4; i++) {
      k.b.box(0.1, 1.9, 0.5, { p: [11.75, 0, 0], r: [(i / 4) * Math.PI, 0, 0.25], c: 0x7a6a3a, m: "trim" });
    }
    k.b.cyl(0.3, 0.2, 0.7, { p: [11.9, 0, 0], r: [0, 0, -Math.PI / 2], c: 0x7a6a3a, m: "trim", seg: 8 });
    for (const sz of [-0.7, 0.7]) {
      k.b.cyl(0.42, 0.42, 0.06, { p: [-11.2, 0.3, sz], r: [0, 0, Math.PI / 2], c: 0x0a0e10, m: "matte", seg: 10 });
      k.b.torus(0.44, 0.05, { p: [-11.22, 0.3, sz], r: [0, Math.PI / 2, 0], c: 0x26302e, m: "trim", seg: 10 });
    }
    for (let x = -7; x <= 7; x += 1.4) k.b.cyl(0.03, 0.03, 0.7, { p: [x, 2.7, 0.9], c: 0x3a4446, m: "metal", seg: 5 });
    k.b.box(14.2, 0.04, 0.04, { p: [0, 3.02, 0.9], c: 0x3a4446, m: "metal" });
    k.b.rbox(1.2, 0.2, 1.2, 0.06, { p: [-2, 4.55, 0], c: 0x1e2826, m: "trim" }); // 指揮塔頂的艙蓋
    for (let i = 0; i < 26; i++) { // 藤壺：長在船身上的小疙瘩
      const a = k.rnd() * Math.PI - Math.PI / 2, x = (k.rnd() - 0.5) * 17;
      k.b.sphere(0.07 + k.rnd() * 0.07, {
        p: [x, Math.sin(a) * 2.38, Math.cos(a) * 2.38], s: [1, 0.7, 1], c: 0x8a8672, m: "matte", seg: 5,
      });
    }
    k.b.pop();
    for (let i = 0; i < 12; i++) { // 錨鍊：從船頭垂到海床再拖出去
      const t = i / 11;
      k.b.torus(0.12, 0.03, {
        p: [-11.6 - t * 3.4, Math.max(0.12, 1.6 * (1 - t * 1.6)), -26.2 + t * 2.2],
        r: [i % 2 ? Math.PI / 2 : 0, 0.5, 0], c: 0x2a2a26, m: "metal", seg: 6,
      });
    }
    k.prop(-15.6, -23.6, 1.0, 1.4, 0.8, () => { // 錨
      k.b.box(0.14, 0.14, 1.5, { p: [-15.6, 0.34, -23.6], r: [0.3, 0.6, 0], c: 0x2a2a26, m: "metal" });
      k.b.torus(0.5, 0.07, {
        p: [-15.9, 0.14, -23.1], r: [Math.PI / 2, 0, 0.6], c: 0x2a2a26, m: "metal", seg: 10, arc: Math.PI,
      });
    }, 0.3);

    // ---- 海床上的生物：海葵、海星、管蟲、海扇、腦珊瑚 ----
    for (const [x, z, c] of [
      [-12, 6, PINK], [12, -6, AQ], [-22, -12, SODIUM], [22, 12, PINK], [-4, 30, AQ], [4, -22, PINK],
      [-30, 2, AQ], [30, -3, SODIUM], [-16, 30, PINK], [16, -30, AQ], [-38, 12, SODIUM], [38, -12, PINK],
      [-8, -9, AQ], [8, 9, SODIUM],
    ]) k.anemone(x, z, c);
    for (let i = 0; i < 18; i++) {
      const x = Util.lerp(-38, 38, k.rnd()), z = Util.lerp(-38, 38, k.rnd());
      if (k.canPlace(x, z, 0.5, 0.5, 0.2)) k.starfish(x, z, [0xff7a4a, 0xd84a6a, 0xffb060][i % 3]);
    }
    for (const s of [-1, 1]) {
      k.tubeWorms(s * -17, s * -22);
      k.tubeWorms(s * 33, s * -11);
      k.seaFan(s * -34, s * 22, 0, PINK);
      k.seaFan(s * 14, s * 31, 1, 0xffa060);
      k.seaFan(s * -3, s * 13.4, 0, 0xc86aff);
      k.brainCoral(s * -29, s * -4.5, 0.9);
      k.brainCoral(s * 10, s * 21, 0.75, 0x7a8a6a);
      k.brainCoral(s * 37, s * 29, 1.0, 0x8a6a5a);
    }
    for (const [x, z] of [
      [-20, 6], [20, -6], [-6, -34], [6, 34], [-34, -30], [34, 30], [-26, 30], [26, -30], [-14, -4], [14, 4],
    ]) {
      k.rubble(x, z, 1.6, 5, 0x2a3432);
    }

    // ---- 浮標、熱泉與沉在海底的探測器 ----
    for (const s of [-1, 1]) {
      k.buoy(s * -14, s * 25, 5.5, s < 0 ? AQ : SODIUM);
      k.buoy(s * 33, s * 9, 6.5, PINK);
      k.thermalVent(s * -37, s * -25);
      k.thermalVent(s * 15, s * -20.5);
    }
    k.prop(11.5, 23.5, 2.0, 1.3, 1.2, () => { // 黃色的遙控探測器，側躺在海床上
      const b = k.b;
      b.push(11.5, 0, 23.5, 0.4, 0, 0.12);
      b.rbox(1.9, 0.8, 1.2, 0.12, { p: [0, 0.6, 0], c: 0xd8a030, m: "paint" });
      b.box(1.7, 0.18, 1.3, { p: [0, 0.14, 0], c: P.dark, m: "metal" });
      for (const sz of [-1, 1]) {
        b.cyl(0.2, 0.2, 0.5, { p: [0.6, 0.6, sz * 0.72], r: [0, 0, Math.PI / 2], c: P.dark, m: "metal", seg: 8 });
      }
      b.sphere(0.2, { p: [-0.98, 0.66, 0], c: 0x9ff4ff, m: "glow", e: 1.2, seg: 8 });
      b.limb([-0.9, 0.3, 0.3], [-1.6, 0.1, 0.5], 0.04, { c: P.dark, m: "metal", flat: true, seg: 5 }); // 機械手臂
      b.pop();
    }, 0.3);

    // ---- 貨櫃堆與沙包旁：散落的補給箱 ----
    k.pallet(9.6, 30.6, 0x3a5a5a);
    k.pallet(-9.6, -32.6, 0x3a5a5a);
  },
};
