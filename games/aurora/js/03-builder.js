/*
 * ============================================================
 *  03-builder.js ── 貼圖、材質與模型建構器
 * ------------------------------------------------------------
 *  遊戲裡所有 3D 物件（槍、角色、建築）都是用程式「堆積木」做出來的，
 *  沒有使用任何外部模型檔。這個檔案提供三樣工具：
 *
 *    Tex      用畫布（canvas）即時畫出水泥、金屬、沙地等貼圖與法線貼圖
 *    Mats     共用材質庫（烤漆、金屬、發光、玻璃、地面、牆面…）
 *    Builder  積木建構器：加入很多方塊／圓柱／球，最後合併成少數幾個網格
 *
 *  為什麼要合併？一把槍有上百個零件，如果每個零件各畫一次會非常慢；
 *  合併後同一種材質只需要畫一次，效能好很多。
 * ============================================================
 */

/* ============================================================
 *  Tex ── 程序化貼圖
 * ============================================================ */
const Tex = {
  cache: {}, // 已經產生過的貼圖（名稱 → { map, normalMap }）

  /* ---------- 雜訊基礎 ---------- */

  // 整數座標 → 0~1 的固定亂數
  hash(ix, iy, seed) {
    let h =
      Math.imul(ix, 374761393) +
      Math.imul(iy, 668265263) +
      Math.imul(seed, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },

  // 可無縫拼接的平滑雜訊（period 是重複週期）
  noise(x, y, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = this.hash(x0, y0, seed);
    const b = this.hash(x1, y0, seed);
    const c = this.hash(x0, y1, seed);
    const d = this.hash(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  },

  // 多層雜訊疊加（看起來更自然）；u、v 是 0~1 的貼圖座標
  fbm(u, v, baseCells, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let cells = baseCells;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(u * cells, v * cells, cells, seed + i * 17);
      amp *= 0.5;
      cells *= 2;
    }
    return sum;
  },

  /* ---------- 畫布工具 ---------- */

  // 逐像素填色：fn(u, v) 回傳 0~1 的亮度
  _paint(size, fn) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const g = Util.clamp(fn(x / size, y / size), 0, 1) * 255;
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = g;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, ctx };
  },

  // 從亮度圖推算法線貼圖（亮的地方凸、暗的地方凹）
  _normalFrom(canvas, strength) {
    const size = canvas.width;
    const src = canvas.getContext("2d").getImageData(0, 0, size, size).data;
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const octx = out.getContext("2d");
    const img = octx.createImageData(size, size);
    const dst = img.data;
    const h = (x, y) =>
      src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
        const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        dst[i] = ((dx / len) * 0.5 + 0.5) * 255;
        dst[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
        dst[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        dst[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  },

  // 畫布 → Three.js 貼圖（設定成可重複拼接）
  _toTexture(canvas, isColor) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  /* ---------- 各種貼圖的畫法 ----------
   * 每個函式回傳 { canvas, ctx }；貼圖都是偏亮的灰階，
   * 實際顏色由模型的「頂點顏色」決定，所以同一張貼圖可以染成各種顏色。 */
  PAINTERS: {
    // 水泥：斑駁 + 細裂紋 + 板塊接縫
    concrete(T, size) {
      const p = T._paint(size, (u, v) => {
        const big = T.fbm(u, v, 4, 4, 11);
        const fine = T.fbm(u, v, 48, 2, 23);
        return 0.72 + (big - 0.5) * 0.3 + (fine - 0.5) * 0.14;
      });
      const c = p.ctx;
      c.strokeStyle = "rgba(0,0,0,0.28)";
      c.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        // 接縫
        c.beginPath();
        c.moveTo(0, (i * size) / 2);
        c.lineTo(size, (i * size) / 2);
        c.stroke();
        c.beginPath();
        c.moveTo((i * size) / 2, 0);
        c.lineTo((i * size) / 2, size);
        c.stroke();
      }
      const rnd = Util.seeded(5);
      c.strokeStyle = "rgba(0,0,0,0.22)";
      c.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        // 裂紋
        let x = rnd() * size,
          y = rnd() * size;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 7; k++) {
          x += (rnd() - 0.5) * 50;
          y += (rnd() - 0.5) * 50;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      return p;
    },

    // 柏油：細顆粒、深淺不一的色塊、修補過的方形補丁、填縫的瀝青線與幾道細裂紋
    asphalt(T, size) {
      const p = T._paint(size, (u, v) => {
        const big = T.fbm(u, v, 3, 3, 31); // 大片的深淺
        const mid = T.fbm(u, v, 14, 2, 37); // 中等大小的斑駁
        const grain = T.hash(Math.floor(u * size), Math.floor(v * size), 7); // 一顆一顆的石子
        return (
          0.6 + (big - 0.5) * 0.22 + (mid - 0.5) * 0.1 + (grain - 0.5) * 0.14
        );
      });
      const c = p.ctx;
      const rnd = Util.seeded(71);
      for (let i = 0; i < 3; i++) {
        // 補丁：顏色略深的方塊，邊緣一圈填縫
        const w = 70 + rnd() * 90,
          h = 50 + rnd() * 70;
        const x = rnd() * (size - w),
          y = rnd() * (size - h);
        c.fillStyle = `rgba(0,0,0,${0.07 + rnd() * 0.06})`;
        c.fillRect(x, y, w, h);
        c.strokeStyle = "rgba(0,0,0,0.3)";
        c.lineWidth = 2;
        c.strokeRect(x, y, w, h);
      }
      for (let i = 0; i < 5; i++) {
        // 填縫的瀝青線：彎彎曲曲的深色粗線
        let x = rnd() * size,
          y = rnd() * size,
          a = rnd() * 6.28;
        c.strokeStyle = "rgba(0,0,0,0.32)";
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 9; k++) {
          a += (rnd() - 0.5) * 0.7;
          x += Math.cos(a) * 24;
          y += Math.sin(a) * 24;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.strokeStyle = "rgba(0,0,0,0.22)";
      c.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        // 細裂紋
        let x = rnd() * size,
          y = rnd() * size;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (rnd() - 0.5) * 40;
          y += (rnd() - 0.5) * 40;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      return p;
    },

    // 金屬板：板塊分割線 + 鉚釘 + 刮痕
    metal(T, size) {
      const p = T._paint(size, (u, v) => {
        const streak = T.fbm(u * 0.25, v, 24, 3, 41); // 橫向拉絲
        return 0.74 + (streak - 0.5) * 0.18;
      });
      const c = p.ctx;
      const half = size / 2;
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          c.strokeStyle = "rgba(0,0,0,0.45)";
          c.lineWidth = 3;
          c.strokeRect(i * half + 1.5, j * half + 1.5, half - 3, half - 3);
          c.strokeStyle = "rgba(255,255,255,0.18)";
          c.lineWidth = 1;
          c.strokeRect(i * half + 5, j * half + 5, half - 10, half - 10);
          c.fillStyle = "rgba(0,0,0,0.5)";
          for (const [rx, ry] of [
            [14, 14],
            [half - 14, 14],
            [14, half - 14],
            [half - 14, half - 14],
          ]) {
            // 鉚釘
            c.beginPath();
            c.arc(i * half + rx, j * half + ry, 3, 0, 7);
            c.fill();
          }
        }
      const rnd = Util.seeded(9);
      c.strokeStyle = "rgba(255,255,255,0.14)";
      for (let i = 0; i < 40; i++) {
        // 刮痕
        const x = rnd() * size,
          y = rnd() * size;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 14);
        c.stroke();
      }
      return p;
    },

    // 科技地磚：格線 + 內框
    tiles(T, size) {
      const p = T._paint(
        size,
        (u, v) => 0.7 + (T.fbm(u, v, 12, 3, 51) - 0.5) * 0.16,
      );
      const c = p.ctx;
      const cell = size / 4;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          c.strokeStyle = "rgba(0,0,0,0.5)";
          c.lineWidth = 3;
          c.strokeRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
          c.fillStyle = "rgba(255,255,255,0.06)";
          if ((i + j) % 2 === 0)
            c.fillRect(i * cell + 8, j * cell + 8, cell - 16, cell - 16);
        }
      return p;
    },

    // 沙地：風吹出的波紋
    sand(T, size) {
      return T._paint(size, (u, v) => {
        const dune = T.fbm(u, v, 3, 4, 61);
        const ripple = Math.sin((v + dune * 0.35) * Math.PI * 2 * 22) * 0.04;
        const grain = T.hash(Math.floor(u * size), Math.floor(v * size), 3);
        return 0.76 + (dune - 0.5) * 0.22 + ripple + (grain - 0.5) * 0.1;
      });
    },

    // 雪地：柔和起伏 + 零星亮點
    snow(T, size) {
      return T._paint(size, (u, v) => {
        const soft = T.fbm(u, v, 5, 4, 71);
        const spark =
          T.hash(Math.floor(u * size), Math.floor(v * size), 13) > 0.985
            ? 0.12
            : 0;
        return 0.84 + (soft - 0.5) * 0.2 + spark;
      });
    },

    // 砂岩磚牆：錯位的磚塊
    brick(T, size) {
      const p = T._paint(
        size,
        (u, v) => 0.74 + (T.fbm(u, v, 8, 4, 81) - 0.5) * 0.26,
      );
      const c = p.ctx;
      const rows = 8;
      const rh = size / rows;
      c.strokeStyle = "rgba(0,0,0,0.3)";
      c.lineWidth = 3;
      for (let r = 0; r < rows; r++) {
        c.beginPath();
        c.moveTo(0, r * rh);
        c.lineTo(size, r * rh);
        c.stroke();
        const offset = r % 2 ? size / 8 : 0;
        for (let k = 0; k < 4; k++) {
          const x = offset + (k * size) / 4;
          c.beginPath();
          c.moveTo(x, r * rh);
          c.lineTo(x, (r + 1) * rh);
          c.stroke();
        }
      }
      return p;
    },

    // 貨櫃波浪板：直向凹凸
    // 使用痕跡：淡淡的髒污、細顆粒與刮痕。槍枝、角色、道具共用，
    // 讓表面看起來像真的被用過，而不是乾淨的塑膠（參考寫實風格的做法）
    wear(T, size) {
      const p = T._paint(size, (u, v) => {
        const grime = T.fbm(u, v, 3, 4, 101); // 大片的髒污
        const fine = T.fbm(u, v, 48, 2, 113); // 細顆粒
        return 0.93 + (fine - 0.5) * 0.12 - Math.max(0, grime - 0.52) * 0.85;
      });
      const c = p.ctx;
      const rnd = Util.seeded(17);
      for (let i = 0; i < 140; i++) {
        // 刮痕：亮的細線（磨掉漆露出底材）
        const x = rnd() * size,
          y = rnd() * size;
        const len = 6 + rnd() * 34,
          a = rnd() * Math.PI;
        c.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.18})`;
        c.lineWidth = rnd() < 0.8 ? 1 : 2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
      }
      for (let i = 0; i < 24; i++) {
        // 小凹痕與污點
        c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
        c.beginPath();
        c.arc(rnd() * size, rnd() * size, 2 + rnd() * 6, 0, 7);
        c.fill();
      }
      return p;
    },

    // 科幻面板：大片平整的白色面板、凹槽接縫、小散熱孔與編號條
    panel(T, size) {
      const p = T._paint(
        size,
        (u, v) => 0.86 + (T.fbm(u, v, 6, 3, 121) - 0.5) * 0.06,
      );
      const c = p.ctx;
      const rnd = Util.seeded(33);
      const cells = [
        [0, 0, 0.62, 0.5],
        [0.62, 0, 0.38, 0.5],
        [0, 0.5, 0.38, 0.5],
        [0.38, 0.5, 0.62, 0.5],
      ];
      for (const [x, y, w, h] of cells) {
        const X = x * size,
          Y = y * size,
          W = w * size,
          H = h * size;
        c.strokeStyle = "rgba(0,0,0,0.5)"; // 凹槽
        c.lineWidth = 4;
        c.strokeRect(X + 2, Y + 2, W - 4, H - 4);
        c.strokeStyle = "rgba(255,255,255,0.35)"; // 凹槽邊緣的反光
        c.lineWidth = 1;
        c.strokeRect(X + 5, Y + 5, W - 10, H - 10);
        if (rnd() < 0.6) {
          // 散熱孔
          for (let i = 0; i < 6; i++) {
            c.fillStyle = "rgba(0,0,0,0.45)";
            c.fillRect(X + 18, Y + 18 + i * 9, W * 0.3, 4);
          }
        }
        c.fillStyle = "rgba(0,0,0,0.25)"; // 編號條
        c.fillRect(X + W - 46, Y + H - 22, 30, 8);
      }
      return p;
    },

    // 生鏽金屬：大片鏽斑、往下流的鏽痕、凹痕
    rust(T, size) {
      const p = T._paint(size, (u, v) => {
        const blotch = T.fbm(u, v, 5, 5, 131);
        const streak = T.fbm(u * 0.15, v * 2, 16, 3, 137); // 垂直的鏽水痕
        return 0.62 + (blotch - 0.5) * 0.5 - Math.max(0, streak - 0.55) * 0.6;
      });
      const c = p.ctx;
      const rnd = Util.seeded(41);
      for (let i = 0; i < 30; i++) {
        // 坑洞
        c.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.25})`;
        c.beginPath();
        c.arc(rnd() * size, rnd() * size, 2 + rnd() * 7, 0, 7);
        c.fill();
      }
      return p;
    },

    // 焦裂的水泥：大裂縫、碎塊、燒焦的黑斑
    cracked(T, size) {
      const p = T._paint(size, (u, v) => {
        const base = T.fbm(u, v, 4, 4, 141);
        const burn = T.fbm(u, v, 2, 3, 149);
        return 0.66 + (base - 0.5) * 0.3 - Math.max(0, burn - 0.55) * 1.0;
      });
      const c = p.ctx;
      const rnd = Util.seeded(57);
      for (let i = 0; i < 16; i++) {
        // 會分岔的大裂縫
        let x = rnd() * size,
          y = rnd() * size,
          a = rnd() * 6.28;
        c.strokeStyle = "rgba(0,0,0,0.6)";
        c.lineWidth = 1 + rnd() * 2.5;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          a += (rnd() - 0.5) * 1.2;
          x += Math.cos(a) * 18;
          y += Math.sin(a) * 18;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      return p;
    },

    // 海床：細沙、柔和的沙紋、散落的小石頭
    seabed(T, size) {
      const p = T._paint(size, (u, v) => {
        const dune = T.fbm(u, v, 3, 4, 161);
        const ripple = Math.sin((u + dune * 0.6) * Math.PI * 2 * 14) * 0.05;
        return (
          0.7 +
          (dune - 0.5) * 0.25 +
          ripple +
          (T.hash(Math.floor(u * size), Math.floor(v * size), 5) - 0.5) * 0.08
        );
      });
      const c = p.ctx;
      const rnd = Util.seeded(63);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.2})`;
        c.beginPath();
        c.ellipse(
          rnd() * size,
          rnd() * size,
          1.5 + rnd() * 4,
          1 + rnd() * 3,
          rnd() * 3,
          0,
          7,
        );
        c.fill();
      }
      return p;
    },

    // 六角形裝甲板
    hex(T, size) {
      const p = T._paint(
        size,
        (u, v) => 0.8 + (T.fbm(u, v, 8, 3, 171) - 0.5) * 0.1,
      );
      const c = p.ctx;
      const r = size / 8;
      const hw = r * Math.sqrt(3);
      c.lineWidth = 3;
      for (let row = -1; row < 10; row++) {
        for (let col = -1; col < 6; col++) {
          const x = col * hw + (row % 2 ? hw / 2 : 0);
          const y = row * r * 1.5;
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 6 + (k * Math.PI) / 3;
            c.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
          }
          c.closePath();
          c.strokeStyle = "rgba(0,0,0,0.45)";
          c.stroke();
        }
      }
      return p;
    },

    // 浪板：等距的直條紋加上髒污。
    ribbed(T, size) {
      return T._paint(size, (u, v) => {
        const rib = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
        const dirt = T.fbm(u, v, 6, 3, 91);
        return 0.56 + rib * 0.3 + (dirt - 0.5) * 0.16;
      });
    },
  },

  // 取得貼圖（第一次呼叫時才產生，之後直接用快取）
  get(name) {
    if (this.cache[name]) return this.cache[name];
    const size = 512;
    const painted = this.PAINTERS[name](this, size);
    const strength =
      {
        metal: 2.2,
        tiles: 2.4,
        ribbed: 4.5,
        brick: 3,
        sand: 2.2,
        wear: 1.4,
        panel: 2.6,
        rust: 2.4,
        cracked: 3.2,
        seabed: 2.4,
        hex: 2.6,
      }[name] || 3;
    const entry = {
      map: this._toTexture(painted.canvas, true),
      normalMap: this._toTexture(
        this._normalFrom(painted.canvas, strength),
        false,
      ),
    };
    this.cache[name] = entry;
    return entry;
  },

  // 發光圓點貼圖（粒子、槍口火光、光暈都用它）
  glowSprite() {
    if (this.cache._glow) return this.cache._glow;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.75)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    this.cache._glow = tex;
    return tex;
  },

  // 把文字畫成貼圖（霓虹招牌、區域標示用）
  text(label, color = "#ffffff", bg = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 128);
    }
    ctx.font = "900 78px 'Segoe UI', 'Microsoft JhengHei', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(label, 256, 68, 480);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },
};

/* ============================================================
 *  Mats ── 共用材質庫
 * ------------------------------------------------------------
 *  所有材質都開啟「頂點顏色」，顏色由 Builder 寫在每個零件上。
 *    paint  烤漆／塑膠      matte  布料／粗糙表面
 *    metal  裸露金屬        glow   自發光（會被泛光特效暈開）
 *    glass  很淡的玻璃（槍上的鏡片、水母這類小東西）
 *    pane   建築用的玻璃板：帶一點顏色，上面有斜向的反光條，一眼看得出那裡有玻璃
 *    ground / wall / floor / trim  有貼圖的地圖材質（每張地圖會換貼圖）
 * ============================================================ */
const Mats = {
  kinds: {},
  uvScale: {}, // 貼圖重複一次代表幾公尺（0 表示不使用世界座標貼圖）

  init() {
    const std = (opt) =>
      new THREE.MeshStandardMaterial({ vertexColors: true, ...opt });
    this.kinds.paint = std({ roughness: 0.52, metalness: 0.3 });
    this.kinds.matte = std({ roughness: 0.92, metalness: 0.0 });
    this.kinds.metal = std({ roughness: 0.34, metalness: 0.8 });
    // 玻璃：很淡，紅點鏡的鏡片才不會霧霧的擋住視線
    this.kinds.glass = std({
      roughness: 0.05,
      metalness: 0.25,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    // 建築玻璃：不受燈光影響（在很暗的地圖也看得到），透明度由反光條貼圖決定，
    // 沒有反光的地方約兩成不透明、反光條約四成。
    this.kinds.pane = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      alphaMap: this._paneTexture(),
    });
    this.uvScale.pane = 3; // 反光條每 3 公尺重複一次
    // 發光材質不受燈光影響，顏色可以超過 1（越大越亮、光暈越強）
    this.kinds.glow = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });
    // 模型材質加上「使用痕跡」貼圖與微小的表面起伏
    const wear = Tex.get("wear");
    for (const k of ["paint", "matte", "metal"]) {
      this.kinds[k].map = wear.map;
      this.kinds[k].normalMap = wear.normalMap;
      this.kinds[k].normalScale.set(0.35, 0.35);
    }
    // 地圖用的貼圖材質，貼圖稍後由 applyTheme 指定
    for (const k of ["ground", "wall", "floor", "trim"]) {
      this.kinds[k] = std({ roughness: 0.85, metalness: 0.05 });
      this.uvScale[k] = 4;
    }
  },

  get(kind) {
    return this.kinds[kind] || this.kinds.paint;
  },

  /* 玻璃板的透明度貼圖：底色是灰的（比較透明），上面有幾道 45 度的亮條（比較不透明）。
   * 亮度只跟 (x + y) 有關，所以貼圖上下左右都能無縫接起來。 */
  _paneTexture() {
    const SIZE = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(SIZE, SIZE);
    // 每道反光條：[位置 0~1, 寬度, 亮度]。一道寬而淡，兩道細而亮
    const streaks = [
      [0.3, 0.07, 0.3],
      [0.44, 0.012, 0.5],
      [0.8, 0.018, 0.32],
    ];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = ((x + y) % SIZE) / SIZE;
        let a = 0.46;
        for (const [at, width, gain] of streaks) {
          let d = Math.abs(v - at);
          d = Math.min(d, 1 - d); // 繞一圈回來也算距離，接縫才不會斷
          a += gain * Math.exp(-(d * d) / (width * width));
        }
        const g = Math.min(255, Math.round(a * 255));
        const i = (y * SIZE + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },

  /* 套用地圖主題。theme 例如：
   *   { ground: { tex: "asphalt", scale: 8, rough: 0.9, metal: 0 }, wall: {...}, ... }
   * theme.pane 是玻璃板的亮度（預設 1）：玻璃不受燈光影響，所以比較暗的地圖要自己調低，
   * 不然在夜裡或海底會像一片發白的毛玻璃。 */
  applyTheme(theme) {
    this.kinds.pane.color.setScalar(theme.pane ?? 1);
    for (const k of ["ground", "wall", "floor", "trim"]) {
      const cfg = theme[k];
      const mat = this.kinds[k];
      const tex = Tex.get(cfg.tex);
      mat.map = tex.map;
      mat.normalMap = tex.normalMap;
      mat.normalScale.set(cfg.bump ?? 1, cfg.bump ?? 1);
      mat.roughness = cfg.rough ?? 0.85;
      mat.metalness = cfg.metal ?? 0.05;
      mat.needsUpdate = true;
      this.uvScale[k] = cfg.scale ?? 4;
    }
  },
};

/* ============================================================
 *  Builder ── 積木建構器
 * ------------------------------------------------------------
 *  用法：
 *    const b = new Builder();
 *    b.box(1, 2, 1, { p: [0, 1, 0], c: 0x808080, m: "metal" });
 *    b.cyl(0.2, 0.2, 1, { p: [0, 2.5, 0], c: 0xff0000 });
 *    const group = b.build();   // 合併後的 THREE.Group
 *
 *  每個零件的選項 o：
 *    p : [x, y, z] 位置          r : [rx, ry, rz] 旋轉（弧度）
 *    s : 縮放（數字或 [x,y,z]）  c : 顏色（十六進位）
 *    m : 材質種類（預設 paint）  e : 亮度倍率（發光材質用）
 *    ao: 底部加深的程度 0~1（牆腳比牆頂暗，像地面反射不到光的陰影）
 *
 *  push()/pop() 可以暫時移動「原點」，方便把一整組零件放到別的位置。
 * ============================================================ */
class Builder {
  constructor() {
    this.buckets = {}; // 材質種類 → 累積中的頂點資料
    this.stack = [new THREE.Matrix4()]; // 原點變換堆疊
  }

  /* ---------- 原點變換 ---------- */

  get matrix() {
    return this.stack[this.stack.length - 1];
  }

  // 把原點移到 (x, y, z) 並繞 Y 軸轉 ry；之後加入的零件都以這裡為準
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1) {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
      new THREE.Vector3(scale, scale, scale),
    );
    this.stack.push(new THREE.Matrix4().multiplyMatrices(this.matrix, local));
    return this;
  }

  // 還原到上一個原點。
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  // 在指定位置執行一段建造程式，結束後自動還原原點
  at(x, y, z, ry, fn) {
    this.push(x, y, z, ry);
    fn(this);
    this.pop();
    return this;
  }

  /* ---------- 核心：把一個幾何體加入對應材質的資料桶 ---------- */
  add(geometry, o = {}) {
    // 同一種材質的零件收在同一個桶子裡，最後合併成一個模型。
    const kind = o.m || "paint";
    const bucket = (this.buckets[kind] ||= {
      pos: [],
      nor: [],
      uv: [],
      col: [],
      idx: [],
      count: 0,
    });

    // 這個零件自己的位置／旋轉／縮放
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    const s =
      o.s === undefined
        ? [1, 1, 1]
        : typeof o.s === "number"
          ? [o.s, o.s, o.s]
          : o.s;
    // o.q 可直接給四元數（limb() 用它把零件對準任意方向），否則用 o.r 的尤拉角
    const rotation =
      o.q || Builder._q1.setFromEuler(Builder._e1.set(r[0], r[1], r[2], "XYZ"));
    // 先套用零件自己的位置、旋轉、縮放，再套用目前的原點。
    const local = Builder._m1.compose(
      Builder._v1.set(p[0], p[1], p[2]),
      rotation,
      Builder._v2.set(s[0], s[1], s[2]),
    );
    const world = Builder._m2.multiplyMatrices(this.matrix, local);
    const normalMatrix = Builder._n1.getNormalMatrix(world);

    // 顏色（轉成線性色彩空間）；發光材質預設更亮
    const color = Builder._c1.setHex(o.c ?? 0x808080);
    const bright = o.e ?? (kind === "glow" ? 1.8 : 1);
    const cr = color.r * bright,
      cg = color.g * bright,
      cb = color.b * bright;

    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const v = Builder._v3;

    // o.ao：依頂點在零件裡的高度調整亮度，最底下暗 ao、最上面不變
    // ao：讓零件下緣稍微變暗，看起來更有份量。
    const ao = o.ao || 0;
    let minY = 0,
      spanY = 1;
    if (ao) {
      geometry.computeBoundingBox();
      minY = geometry.boundingBox.min.y;
      spanY = Math.max(1e-6, geometry.boundingBox.max.y - minY);
    }

    // 逐點加入位置、法線與頂點顏色。
    for (let i = 0; i < pos.count; i++) {
      const shade = ao ? 1 - ao * (1 - (pos.getY(i) - minY) / spanY) : 1;
      v.fromBufferAttribute(pos, i).applyMatrix4(world);
      bucket.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      bucket.nor.push(v.x, v.y, v.z);
      bucket.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      bucket.col.push(cr * shade, cg * shade, cb * shade);
    }

    // 三角形索引要加上目前已有的頂點數
    // 加入三角形索引；沒有索引的幾何體就依序編號。
    const index = geometry.index;
    if (index) {
      for (let i = 0; i < index.count; i++)
        bucket.idx.push(index.getX(i) + bucket.count);
    } else {
      for (let i = 0; i < pos.count; i++) bucket.idx.push(i + bucket.count);
    }
    bucket.count += pos.count;
    geometry.dispose();
    return this;
  }

  /* ---------- 各種積木 ---------- */

  // 方塊。若材質有貼圖，會依實際尺寸計算貼圖座標，貼圖才不會被拉伸
  box(w, h, d, o = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const scale = o.uvScale ?? Mats.uvScale[o.m]; // o.uvScale 可以讓單一零件用不同的貼圖大小
    if (scale) {
      // BoxGeometry 六個面的順序：+x -x +y -y +z -z，每面 4 個頂點
      const uv = geo.attributes.uv;
      const dims = [
        [d, h],
        [d, h],
        [w, d],
        [w, d],
        [w, h],
        [w, h],
      ];
      for (let f = 0; f < 6; f++) {
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(
            i,
            (uv.getX(i) * dims[f][0]) / scale,
            (uv.getY(i) * dims[f][1]) / scale,
          );
        }
      }
    }
    return this.add(geo, o);
  }

  // 圓角方塊（邊緣有倒角，受光時更有質感；槍枝與角色大量使用）
  rbox(w, h, d, radius, o = {}) {
    const r = Math.min(radius, w / 2, h / 2, d / 2);
    const geo = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const half = [w / 2, h / 2, d / 2];
    const p = [0, 0, 0];
    const inner = [0, 0, 0];

    for (let i = 0; i < pos.count; i++) {
      p[0] = pos.getX(i);
      p[1] = pos.getY(i);
      p[2] = pos.getZ(i);
      for (let a = 0; a < 3; a++) {
        // 把均勻分布的格點重新排到「平面邊界」上：±half/2 → ±(half - r)
        const t = p[a] / half[a]; // -1, -0.5, 0, 0.5, 1
        if (Math.abs(Math.abs(t) - 0.5) < 0.01)
          p[a] = Math.sign(t) * (half[a] - r);
        inner[a] = Util.clamp(p[a], -(half[a] - r), half[a] - r);
      }
      // 從內縮的方塊往外推 r，轉角就會變圓
      const dx = p[0] - inner[0],
        dy = p[1] - inner[1],
        dz = p[2] - inner[2];
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-6) {
        pos.setXYZ(
          i,
          inner[0] + (dx / len) * r,
          inner[1] + (dy / len) * r,
          inner[2] + (dz / len) * r,
        );
        nor.setXYZ(i, dx / len, dy / len, dz / len);
      }
    }
    return this.add(geo, o);
  }

  // 圓柱（rTop ≠ rBot 時是圓錐台）；o.seg 是圓周分段數
  cyl(rTop, rBot, h, o = {}) {
    return this.add(
      new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 14, 1, !!o.open),
      o,
    );
  }

  // 球體。
  sphere(r, o = {}) {
    return this.add(
      new THREE.SphereGeometry(
        r,
        o.seg || 14,
        Math.max(6, Math.round((o.seg || 14) * 0.7)),
      ),
      o,
    );
  }

  cone(r, h, o = {}) {
    return this.add(new THREE.ConeGeometry(r, h, o.seg || 14), o);
  }

  // 圓環：R 環半徑、tube 管粗；o.arc 可以只做一段弧
  torus(R, tube, o = {}) {
    return this.add(
      new THREE.TorusGeometry(R, tube, 8, o.seg || 20, o.arc || Math.PI * 2),
      o,
    );
  }

  // 膠囊（兩端圓頭的圓柱），len 是中段長度
  capsule(r, len, o = {}) {
    return this.add(new THREE.CapsuleGeometry(r, len, 5, o.seg || 12), o);
  }

  // 多邊形柱體：points 是 [[x,y],...] 的輪廓，沿 Z 軸拉出 depth 厚度（置中）
  // 用來做槍托、握把這類不規則側面形狀
  prism(points, depth, o = {}) {
    const shape = new THREE.Shape(
      points.map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -depth / 2);
    return this.add(geo, o);
  }

  // 肢體／管線：從 a 點連到 b 點的膠囊（a、b 是 [x,y,z]）
  limb(a, b, radius, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (o.flat) return this.cyl(radius, radius, len, { ...o, p: mid, q }); // 平頭（管線）
    return this.capsule(radius, len, { ...o, p: mid, q });
  }

  /* ---------- 完成：把每個資料桶變成一個網格 ----------
   * opt.materials : { 種類: 自訂材質 } 可覆蓋預設材質（角色受擊閃光用）
   * opt.cast / opt.receive : 是否投射／接收陰影（預設都是 true）
   */
  build(opt = {}) {
    const group = new THREE.Group();
    for (const kind of Object.keys(this.buckets)) {
      const b = this.buckets[kind];
      if (!b.count) continue;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();

      const material = (opt.materials && opt.materials[kind]) || Mats.get(kind);
      const mesh = new THREE.Mesh(geo, material);
      const lit = kind !== "glow" && kind !== "glass" && kind !== "pane"; // 發光與玻璃不參與陰影
      mesh.castShadow = lit && opt.cast !== false;
      mesh.receiveShadow = lit && opt.receive !== false;
      mesh.userData.kind = kind;
      group.add(mesh);
    }
    this.buckets = {};
    return group;
  }

  // 釋放一個群組佔用的顯示卡記憶體（換地圖時使用）
  static dispose(object) {
    object.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
    });
    if (object.parent) object.parent.remove(object);
  }
}

// Builder.add() 內部重複使用的暫存物件（避免大量建立新物件）
Builder._m1 = new THREE.Matrix4();
Builder._m2 = new THREE.Matrix4();
Builder._n1 = new THREE.Matrix3();
Builder._v1 = new THREE.Vector3();
Builder._v2 = new THREE.Vector3();
Builder._v3 = new THREE.Vector3();
Builder._q1 = new THREE.Quaternion();
Builder._e1 = new THREE.Euler();
Builder._c1 = new THREE.Color();
