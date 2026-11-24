/*
 * ============================================================
 *  04-weapon-models.js ── 槍枝、手臂與道具模型
 * ------------------------------------------------------------
 *  每把槍都是用 Builder 一個零件一個零件組起來的。
 *
 *  座標約定（所有槍都一樣）：
 *    - 原點在「握把上方、扳機附近」
 *    - 槍口朝 -Z（往前），+Y 是上方，+X 是槍的右側
 *    - 單位是公尺，一把步槍大約 0.85 公尺長
 *
 *  WeaponModels.build(id, accent) 回傳：
 *    group   可以直接放進場景的模型
 *    muzzle  槍口位置（槍口火光、曳光彈從這裡出發）
 *    eject   拋殼口位置
 *    fore    前握位置（左手扶的地方）
 *    sightY  瞄具高度（開鏡時把這個高度對準畫面中心）
 * ============================================================
 */

const WeaponModels = {
  protos: {}, // 已經建好的原型（同一把槍同一個顏色只建一次）

  // 共用顏色
  C: {
    gun: 0x4a515e, // 槍身金屬灰
    dark: 0x24272e, // 深色零件
    poly: 0x30343c, // 聚合物（塑膠）
    steel: 0x8a9099, // 亮面鋼
    brass: 0xb8923a, // 黃銅（彈殼）
  },

  /* ---------- 對外入口 ---------- */
  build(id, accent = 0x35d6ff) {
    const key = id + ":" + accent;
    if (!this.protos[key]) {
      const b = new Builder();
      const meta = this.RECIPES[id].call(this, b, this._kit(b), accent);
      this.protos[key] = { group: b.build(), meta };
    }
    const proto = this.protos[key];
    return {
      group: proto.group.clone(), // 複製品共用同一份幾何資料，很省記憶體
      muzzle: new THREE.Vector3(...proto.meta.muzzle),
      eject: new THREE.Vector3(...proto.meta.eject),
      fore: new THREE.Vector3(...proto.meta.fore),
      sightY: proto.meta.sightY,
    };
  },

  /* ---------- 零件工具箱 ----------
   * 這些小函式把常見的槍械零件包起來，讓下面每把槍的配方更好讀。 */
  _kit(b) {
    const C = this.C;
    const HALF_PI = Math.PI / 2;
    const kit = {
      // 沿槍管方向（Z 軸）的圓柱：前端半徑 r、長度 len、中心在 (0, y, z)
      // o.r2 可指定後端半徑（做出喇叭口、物鏡這類前後粗細不同的形狀）
      tube(r, len, z, y = 0.04, o = {}) {
        b.cyl(o.r2 ?? r, r, len, {
          p: [o.x || 0, y, z],
          r: [HALF_PI, 0, 0],
          c: C.dark,
          m: "metal",
          seg: 14,
          ...o,
        });
      },

      // 側面輪廓零件：pts 是 [往前, 往上] 的點，thick 是左右厚度
      side(pts, thick, o = {}) {
        b.prism(pts, thick, { r: [0, HALF_PI, 0], c: C.poly, ...o });
      },

      // 皮卡汀尼導軌：一條底板加上一排小齒
      rail(zFront, zBack, y, x = 0) {
        const len = zBack - zFront;
        b.box(0.022, 0.006, len, {
          p: [x, y, (zFront + zBack) / 2],
          c: C.dark,
          m: "metal",
        });
        for (let z = zFront + 0.008; z < zBack; z += 0.02) {
          b.box(0.026, 0.006, 0.01, {
            p: [x, y + 0.006, z],
            c: C.dark,
            m: "metal",
          });
        }
      },

      // 紅點瞄準鏡：底座、鏡框、鏡片與中心紅點
      // 全像式紅點鏡：大窗口、細鏡框，中間是發光的圓圈加中心點
      redDot(z, y, accent) {
        const top = y + 0.062; // 鏡框頂部高度
        const mid = y + 0.034; // 窗口中心（瞄準線）高度
        b.rbox(0.04, 0.014, 0.078, 0.004, { p: [0, y, z], c: C.dark }); // 底座
        b.rbox(0.03, 0.01, 0.03, 0.003, {
          p: [0, y - 0.01, z + 0.012],
          c: C.gun,
          m: "metal",
        }); // 導軌夾
        b.box(0.004, 0.056, 0.05, { p: [0.031, mid, z], c: C.dark }); // 左右鏡框（細，才不擋視野）
        b.box(0.004, 0.056, 0.05, { p: [-0.031, mid, z], c: C.dark });
        b.rbox(0.066, 0.006, 0.05, 0.002, { p: [0, top, z], c: C.dark }); // 上鏡框
        b.box(0.058, 0.05, 0.0015, {
          p: [0, mid, z - 0.014],
          c: 0x9fd8ff,
          m: "glass",
        }); // 鏡片
        // 準心：中心點 + 外圈（發光，開鏡時正好在畫面中央）
        b.sphere(0.0018, {
          p: [0, mid, z - 0.014],
          c: accent,
          m: "glow",
          e: 4,
          seg: 6,
        });
        b.torus(0.0075, 0.0006, {
          p: [0, mid, z - 0.014],
          c: accent,
          m: "glow",
          e: 3,
          seg: 24,
        });
        // 側邊的亮度旋鈕（放在鏡框外側）
        b.cyl(0.006, 0.006, 0.01, {
          p: [0.038, y + 0.012, z + 0.012],
          r: [0, 0, HALF_PI],
          c: C.steel,
          m: "metal",
          seg: 8,
        });
        return mid; // 瞄準線高度
      },

      // 狙擊鏡：鏡筒、物鏡、目鏡、調整鈕與鏡環
      scope(z, y, accent) {
        kit.tube(0.02, 0.2, z, y, { c: C.dark });
        kit.tube(0.031, 0.09, z - 0.14, y, { c: C.dark, r2: 0.022 }); // 物鏡（前端較粗）
        kit.tube(0.022, 0.06, z + 0.125, y, { c: C.dark, r2: 0.027 }); // 目鏡
        b.cyl(0.012, 0.012, 0.03, {
          p: [0, y + 0.028, z],
          c: C.dark,
          m: "metal",
          seg: 10,
        }); // 上調整鈕
        b.cyl(0.012, 0.012, 0.03, {
          p: [0.028, y, z],
          r: [0, 0, HALF_PI],
          c: C.dark,
          m: "metal",
          seg: 10,
        });
        b.cyl(0.029, 0.029, 0.003, {
          p: [0, y, z - 0.186],
          r: [HALF_PI, 0, 0],
          c: accent,
          m: "glow",
          e: 0.9,
          seg: 16,
        });
        b.cyl(0.024, 0.024, 0.003, {
          p: [0, y, z + 0.156],
          r: [HALF_PI, 0, 0],
          c: 0x223344,
          m: "glass",
          seg: 16,
        });
        for (const dz of [-0.06, 0.06]) {
          // 兩個鏡環
          b.rbox(0.05, 0.055, 0.018, 0.006, {
            p: [0, y - 0.006, z + dz],
            c: C.gun,
            m: "metal",
          });
        }
        return y;
      },

      // 一顆小螺絲
      screw(x, y, z) {
        b.cyl(0.004, 0.004, 0.004, {
          p: [x, y, z],
          r: [0, 0, HALF_PI],
          c: C.steel,
          m: "metal",
          seg: 6,
        });
      },

      // 扳機與護弓
      trigger(z, y) {
        b.box(0.008, 0.004, 0.075, { p: [0, y - 0.042, z], c: C.dark });
        b.box(0.008, 0.042, 0.004, { p: [0, y - 0.022, z - 0.036], c: C.dark });
        b.box(0.005, 0.024, 0.006, {
          p: [0, y - 0.016, z + 0.005],
          r: [0.3, 0, 0],
          c: C.steel,
          m: "metal",
        });
      },

      // 手槍式握把
      grip(z, y, color = C.poly) {
        kit.side(
          [
            [0.012, 0],
            [-0.04, 0],
            [-0.078, -0.115],
            [-0.03, -0.126],
            [0.004, -0.03],
          ],
          0.036,
          { p: [0, y, z], c: color },
        );
        for (let i = 0; i < 4; i++) {
          // 握把防滑紋
          b.box(0.038, 0.004, 0.03, {
            p: [0, y - 0.035 - i * 0.02, z + 0.03 + i * 0.007],
            r: [0.3, 0, 0],
            c: C.dark,
          });
        }
      },
    };
    return kit;
  },

  /* ============================================================
   *  八把槍的配方
   * ============================================================ */
  RECIPES: {
    /* ---------- VK-47 脈衝步槍 ---------- */
    ar(b, k, accent) {
      const C = this.C;
      b.rbox(0.052, 0.062, 0.36, 0.012, {
        p: [0, 0.045, -0.06],
        c: C.gun,
        m: "metal",
      }); // 上機匣
      b.rbox(0.046, 0.052, 0.2, 0.01, { p: [0, -0.004, -0.02], c: C.poly }); // 下機匣
      b.box(0.054, 0.02, 0.07, { p: [0.001, 0.05, -0.08], c: C.dark }); // 拋殼口
      b.rbox(0.058, 0.06, 0.3, 0.014, { p: [0, 0.043, -0.39], c: C.poly }); // 護木
      for (let i = 0; i < 5; i++) {
        // 護木散熱孔
        b.box(0.06, 0.012, 0.034, {
          p: [0, 0.05, -0.28 - i * 0.055],
          c: C.dark,
        });
      }
      b.box(0.0605, 0.004, 0.25, {
        p: [0, 0.024, -0.39],
        c: accent,
        m: "glow",
      }); // 側面發光條
      k.tube(0.011, 0.27, -0.66); // 槍管
      b.rbox(0.03, 0.036, 0.04, 0.006, {
        p: [0, 0.052, -0.57],
        c: C.dark,
        m: "metal",
      }); // 導氣箍
      k.tube(0.019, 0.075, -0.8, 0.04, { c: C.gun }); // 制退器
      for (let i = 0; i < 3; i++)
        b.box(0.04, 0.006, 0.01, {
          p: [0, 0.04, -0.775 - i * 0.02],
          c: C.dark,
        });
      k.rail(-0.53, 0.1, 0.079);
      const sightY = k.redDot(-0.02, 0.092, accent);
      b.rbox(0.036, 0.19, 0.062, 0.008, {
        p: [0, -0.125, -0.105],
        r: [0.2, 0, 0],
        c: C.dark,
      }); // 彈匣
      b.box(0.038, 0.012, 0.064, {
        p: [0, -0.215, -0.123],
        r: [0.2, 0, 0],
        c: accent,
        m: "glow",
        e: 0.7,
      });
      k.trigger(0.0, 0);
      k.grip(0.06, -0.026);
      k.tube(0.014, 0.2, 0.2, 0.045, { c: C.gun }); // 槍托緩衝管
      k.side(
        [
          [-0.14, 0.065],
          [-0.345, 0.065],
          [-0.36, -0.07],
          [-0.3, -0.082],
          [-0.24, 0.0],
          [-0.14, 0.012],
        ],
        0.04,
        { p: [0, 0.005, 0], c: C.poly },
      );
      b.rbox(0.044, 0.14, 0.014, 0.005, { p: [0, 0.0, 0.357], c: C.dark }); // 托底板
      b.rbox(0.012, 0.016, 0.05, 0.004, { p: [-0.03, 0.062, 0.05], c: C.dark }); // 拉柄
      k.screw(0.027, 0.03, -0.12);
      k.screw(0.027, 0.03, 0.04);
      k.screw(0.024, -0.01, -0.02);
      b.rbox(0.03, 0.07, 0.035, 0.008, { p: [0, -0.02, -0.36], c: C.dark }); // 前握把
      return {
        muzzle: [0, 0.04, -0.85],
        eject: [0.04, 0.05, -0.08],
        fore: [0, -0.01, -0.36],
        sightY,
      };
    },

    /* ---------- 蜂鳥 MP-9 衝鋒槍 ---------- */
    smg(b, k, accent) {
      const C = this.C;
      b.rbox(0.05, 0.078, 0.3, 0.012, {
        p: [0, 0.035, -0.08],
        c: C.gun,
        m: "metal",
      }); // 機匣
      b.box(0.052, 0.018, 0.06, { p: [0.001, 0.05, -0.06], c: C.dark });
      b.rbox(0.046, 0.05, 0.12, 0.012, { p: [0, 0.03, -0.27], c: C.poly }); // 前護蓋
      k.tube(0.024, 0.13, -0.33, 0.045, { c: C.gun }); // 槍管護套
      for (let i = 0; i < 4; i++) {
        // 護套上的散熱環
        k.tube(0.0255, 0.008, -0.285 - i * 0.03, 0.045, { c: C.dark });
      }
      k.tube(0.009, 0.06, -0.42, 0.045);
      b.box(0.051, 0.004, 0.2, { p: [0, 0.012, -0.1], c: accent, m: "glow" });
      k.rail(-0.2, 0.06, 0.077);
      const sightY = k.redDot(-0.03, 0.09, accent);
      b.rbox(0.03, 0.21, 0.042, 0.006, {
        p: [0, -0.13, -0.11],
        r: [0.06, 0, 0],
        c: C.dark,
      }); // 長直彈匣
      b.box(0.032, 0.01, 0.044, {
        p: [0, -0.23, -0.116],
        c: accent,
        m: "glow",
        e: 0.7,
      });
      k.trigger(-0.01, 0);
      k.grip(0.05, -0.02);
      b.rbox(0.028, 0.08, 0.03, 0.008, {
        p: [0, -0.04, -0.27],
        r: [-0.15, 0, 0],
        c: C.dark,
      }); // 垂直前握把
      // 折疊槍托：上下兩根桿子 + 托底
      k.tube(0.006, 0.24, 0.19, 0.06, { c: C.steel });
      k.tube(0.006, 0.24, 0.19, 0.0, { c: C.steel });
      b.rbox(0.03, 0.11, 0.016, 0.005, { p: [0, 0.03, 0.315], c: C.dark });
      k.screw(0.026, 0.04, -0.15);
      k.screw(0.026, 0.02, 0.02);
      return {
        muzzle: [0, 0.045, -0.46],
        eject: [0.04, 0.05, -0.06],
        fore: [0, -0.03, -0.27],
        sightY,
      };
    },

    /* ---------- 破城者 霰彈槍 ---------- */
    shotgun(b, k, accent) {
      const C = this.C;
      b.rbox(0.05, 0.082, 0.27, 0.012, {
        p: [0, 0.03, -0.07],
        c: C.gun,
        m: "metal",
      }); // 機匣
      b.box(0.052, 0.022, 0.08, { p: [0.001, 0.04, -0.08], c: C.dark }); // 拋殼口
      k.tube(0.017, 0.58, -0.49, 0.052, { c: C.gun }); // 槍管
      k.tube(0.015, 0.46, -0.43, 0.014, { c: C.dark }); // 管狀彈倉
      b.rbox(0.03, 0.02, 0.3, 0.005, { p: [0, 0.074, -0.42], c: C.dark }); // 槍管隔熱罩
      for (let i = 0; i < 6; i++)
        b.box(0.032, 0.006, 0.02, { p: [0, 0.08, -0.3 - i * 0.045], c: C.gun });
      b.rbox(0.058, 0.052, 0.17, 0.014, { p: [0, 0.018, -0.4], c: C.poly }); // 泵動護木
      for (let i = 0; i < 6; i++)
        b.box(0.06, 0.03, 0.008, {
          p: [0, 0.018, -0.34 - i * 0.025],
          c: C.dark,
        });
      b.rbox(0.03, 0.03, 0.03, 0.005, {
        p: [0, 0.034, -0.66],
        c: C.dark,
        m: "metal",
      }); // 槍管固定環
      // 側掛備用彈：四顆紅色霰彈
      b.rbox(0.008, 0.05, 0.13, 0.003, { p: [-0.03, 0.03, -0.07], c: C.dark });
      for (let i = 0; i < 4; i++) {
        b.cyl(0.0095, 0.0095, 0.05, {
          p: [-0.04, 0.03, -0.115 + i * 0.03],
          c: 0xb02a2a,
          seg: 10,
        });
        b.cyl(0.0098, 0.0098, 0.012, {
          p: [-0.04, 0.012, -0.115 + i * 0.03],
          c: C.brass,
          m: "metal",
          seg: 10,
        });
      }
      b.box(0.051, 0.004, 0.2, { p: [0, 0.0, -0.07], c: accent, m: "glow" });
      // 機匣上的短導軌與紅點鏡（原本的鐵製準星會在開鏡時擋住畫面中央）
      k.rail(-0.13, 0.03, 0.072);
      const sightY = k.redDot(-0.05, 0.085, accent);
      k.trigger(0.02, -0.005);
      k.grip(0.08, -0.03);
      k.side(
        [
          [-0.1, 0.06],
          [-0.37, 0.045],
          [-0.38, -0.08],
          [-0.32, -0.085],
          [-0.2, -0.02],
          [-0.1, -0.01],
        ],
        0.042,
        { p: [0, 0.01, 0], c: C.poly },
      );
      b.rbox(0.046, 0.13, 0.018, 0.006, {
        p: [0, -0.012, 0.385],
        c: 0x2a1c16,
        m: "matte",
      }); // 橡膠托墊
      return {
        muzzle: [0, 0.052, -0.79],
        eject: [0.04, 0.04, -0.08],
        fore: [0, -0.015, -0.4],
        sightY,
      };
    },

    /* ---------- 極光 SR-50 狙擊槍 ---------- */
    sniper(b, k, accent) {
      const C = this.C;
      b.rbox(0.05, 0.066, 0.42, 0.012, {
        p: [0, 0.04, -0.1],
        c: C.gun,
        m: "metal",
      }); // 機匣
      b.rbox(0.052, 0.05, 0.34, 0.014, { p: [0, 0.02, -0.44], c: C.poly }); // 護木
      k.tube(0.013, 0.66, -0.8, 0.05, { c: C.gun }); // 長槍管
      for (let i = 0; i < 5; i++)
        k.tube(0.0155, 0.02, -0.66 - i * 0.05, 0.05, { c: C.dark }); // 槍管凹槽
      b.rbox(0.05, 0.034, 0.1, 0.008, {
        p: [0, 0.05, -1.17],
        c: C.dark,
        m: "metal",
      }); // 大型制退器
      for (let i = 0; i < 3; i++)
        b.box(0.052, 0.014, 0.012, {
          p: [0, 0.05, -1.14 - i * 0.03],
          c: 0x050506,
        });
      k.rail(-0.3, 0.08, 0.077);
      const sightY = k.scope(-0.1, 0.13, accent);
      // 槍機拉柄：一根桿子加一顆球
      b.cyl(0.006, 0.006, 0.05, {
        p: [0.045, 0.045, 0.05],
        r: [0, 0, 1.2],
        c: C.steel,
        m: "metal",
        seg: 8,
      });
      b.sphere(0.012, { p: [0.068, 0.036, 0.05], c: C.dark, seg: 10 });
      b.rbox(0.036, 0.09, 0.08, 0.006, { p: [0, -0.04, -0.12], c: C.dark }); // 彈匣
      b.box(0.051, 0.004, 0.3, { p: [0, 0.012, -0.12], c: accent, m: "glow" });
      k.trigger(0.02, 0.005);
      // 拇指孔槍托 + 貼腮墊
      k.side(
        [
          [0.0, 0.01],
          [-0.12, 0.05],
          [-0.42, 0.05],
          [-0.43, -0.1],
          [-0.36, -0.105],
          [-0.3, -0.03],
          [-0.16, -0.03],
          [-0.1, -0.13],
          [-0.05, -0.13],
          [0.0, -0.04],
        ],
        0.044,
        { p: [0, 0.0, 0.04], c: C.poly },
      );
      b.rbox(0.05, 0.03, 0.16, 0.012, { p: [0, 0.068, 0.3], c: C.dark }); // 貼腮墊
      b.rbox(0.048, 0.15, 0.02, 0.006, {
        p: [0, -0.02, 0.48],
        c: 0x2a1c16,
        m: "matte",
      });
      // 收起的兩腳架
      b.limb([0.02, 0.0, -0.58], [0.03, -0.005, -0.34], 0.006, {
        c: C.steel,
        m: "metal",
        flat: true,
      });
      b.limb([-0.02, 0.0, -0.58], [-0.03, -0.005, -0.34], 0.006, {
        c: C.steel,
        m: "metal",
        flat: true,
      });
      b.rbox(0.05, 0.02, 0.03, 0.005, { p: [0, 0.0, -0.59], c: C.dark });
      k.screw(0.026, 0.04, -0.2);
      k.screw(0.026, 0.04, 0.0);
      return {
        muzzle: [0, 0.05, -1.23],
        eject: [0.04, 0.05, -0.06],
        fore: [0, -0.01, -0.42],
        sightY,
      };
    },

    /* ---------- 鐵幕 M-80 輕機槍 ---------- */
    lmg(b, k, accent) {
      const C = this.C;
      b.rbox(0.062, 0.092, 0.42, 0.012, {
        p: [0, 0.035, -0.1],
        c: C.gun,
        m: "metal",
      }); // 機匣
      b.rbox(0.058, 0.02, 0.3, 0.006, { p: [0, 0.088, -0.12], c: C.dark }); // 上蓋（進彈蓋）
      b.rbox(0.056, 0.05, 0.26, 0.012, { p: [0, 0.02, -0.44], c: C.poly }); // 護木
      k.tube(0.017, 0.46, -0.6, 0.055, { c: C.gun }); // 重槍管
      for (let i = 0; i < 7; i++)
        k.tube(0.025, 0.012, -0.42 - i * 0.04, 0.055, { c: C.dark }); // 散熱鰭片
      k.tube(0.028, 0.06, -0.86, 0.055, { c: C.dark, r2: 0.02 }); // 喇叭口消焰器
      k.tube(0.008, 0.36, -0.52, 0.018, { c: C.steel }); // 導氣管
      // 提把：掛在槍身左側（放在正上方會在開鏡時擋住準心）
      b.limb([-0.034, 0.06, -0.3], [-0.06, 0.09, -0.26], 0.006, {
        c: C.dark,
        m: "metal",
        flat: true,
      });
      b.limb([-0.06, 0.09, -0.26], [-0.06, 0.09, -0.12], 0.008, {
        c: C.dark,
        m: "metal",
        flat: true,
      });
      b.limb([-0.06, 0.09, -0.12], [-0.034, 0.06, -0.08], 0.006, {
        c: C.dark,
        m: "metal",
        flat: true,
      });
      // 彈箱（掛在左下方）與露出的彈鏈
      b.rbox(0.1, 0.13, 0.15, 0.012, {
        p: [-0.03, -0.085, -0.14],
        c: 0x2f3a2a,
      });
      b.box(0.102, 0.012, 0.152, {
        p: [-0.03, -0.06, -0.14],
        c: accent,
        m: "glow",
        e: 0.6,
      });
      for (let i = 0; i < 5; i++) {
        b.cyl(0.006, 0.006, 0.05, {
          p: [-0.045 + i * 0.012, 0.075 - i * 0.004, -0.14],
          r: [Math.PI / 2, 0, 0],
          c: this.C.brass,
          m: "metal",
          seg: 8,
        });
      }
      k.rail(-0.24, 0.02, 0.1);
      const sightY = k.redDot(-0.06, 0.112, accent);
      b.box(0.063, 0.004, 0.3, { p: [0, 0.0, -0.1], c: accent, m: "glow" });
      k.trigger(0.02, -0.01);
      k.grip(0.08, -0.035);
      // 骨架式槍托
      k.tube(0.012, 0.26, 0.24, 0.06, { c: C.gun });
      k.tube(0.01, 0.24, 0.24, -0.03, { c: C.gun });
      b.rbox(0.046, 0.15, 0.02, 0.006, { p: [0, 0.015, 0.375], c: C.dark });
      // 收起的兩腳架
      b.limb([0.025, 0.0, -0.56], [0.035, -0.01, -0.3], 0.007, {
        c: C.steel,
        m: "metal",
        flat: true,
      });
      b.limb([-0.025, 0.0, -0.56], [-0.035, -0.01, -0.3], 0.007, {
        c: C.steel,
        m: "metal",
        flat: true,
      });
      return {
        muzzle: [0, 0.055, -0.9],
        eject: [0.045, 0.04, -0.1],
        fore: [0, -0.02, -0.42],
        sightY,
      };
    },

    /* ---------- 信使 P-12 手槍 ---------- */
    pistol(b, k, accent) {
      const C = this.C;
      b.rbox(0.03, 0.04, 0.2, 0.008, {
        p: [0, 0.045, -0.06],
        c: C.gun,
        m: "metal",
      }); // 滑套
      for (let i = 0; i < 5; i++)
        b.box(0.032, 0.03, 0.004, {
          p: [0, 0.045, 0.01 + i * 0.008],
          c: C.dark,
        }); // 滑套防滑紋
      b.box(0.031, 0.014, 0.05, { p: [0.001, 0.055, -0.07], c: C.dark }); // 拋殼口
      b.rbox(0.028, 0.03, 0.17, 0.006, { p: [0, 0.012, -0.06], c: C.poly }); // 槍身
      k.tube(0.007, 0.02, -0.165, 0.048, { c: C.steel });
      // 握把
      k.side(
        [
          [0.012, 0],
          [-0.04, 0],
          [-0.062, -0.11],
          [-0.02, -0.118],
          [0.006, -0.03],
        ],
        0.03,
        { p: [0, 0.0, 0.035], c: C.poly },
      );
      b.box(0.031, 0.006, 0.04, {
        p: [0, -0.115, 0.075],
        c: accent,
        m: "glow",
        e: 0.7,
      }); // 彈匣底板
      k.trigger(-0.03, 0.012);
      // 夜光瞄具：後兩點、前一點
      b.box(0.006, 0.008, 0.006, {
        p: [0.008, 0.069, 0.03],
        c: accent,
        m: "glow",
      });
      b.box(0.006, 0.008, 0.006, {
        p: [-0.008, 0.069, 0.03],
        c: accent,
        m: "glow",
      });
      b.box(0.005, 0.008, 0.006, {
        p: [0, 0.069, -0.15],
        c: accent,
        m: "glow",
      });
      // 槍管下方的雷射模組
      b.rbox(0.024, 0.024, 0.06, 0.005, { p: [0, -0.012, -0.11], c: C.dark });
      b.cyl(0.005, 0.005, 0.003, {
        p: [0, -0.012, -0.141],
        r: [Math.PI / 2, 0, 0],
        c: 0xff3030,
        m: "glow",
        e: 3,
        seg: 8,
      });
      return {
        muzzle: [0, 0.048, -0.18],
        eject: [0.03, 0.055, -0.07],
        fore: [0.0, -0.06, 0.04],
        sightY: 0.072,
      };
    },

    /* ---------- 流星 GL-4 榴彈砲 ---------- */
    launcher(b, k, accent) {
      const C = this.C;
      b.rbox(0.056, 0.08, 0.2, 0.012, {
        p: [0, 0.03, 0.02],
        c: C.gun,
        m: "metal",
      }); // 機匣
      // 轉輪彈巢：外筒 + 六個彈膛孔
      k.tube(0.07, 0.13, -0.16, 0.035, { c: 0x3a3f36, seg: 18 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.02, 0.02, 0.004, {
          p: [Math.cos(a) * 0.042, 0.035 + Math.sin(a) * 0.042, -0.227],
          r: [Math.PI / 2, 0, 0],
          c: 0x050506,
          seg: 10,
        });
        b.box(0.008, 0.008, 0.11, {
          p: [
            Math.cos(a + 0.52) * 0.07,
            0.035 + Math.sin(a + 0.52) * 0.07,
            -0.16,
          ],
          c: C.dark,
        });
      }
      k.tube(0.012, 0.16, -0.16, 0.035, { c: C.steel }); // 轉軸
      k.tube(0.034, 0.32, -0.4, 0.077, { c: C.gun, seg: 16 }); // 粗砲管
      k.tube(0.038, 0.03, -0.55, 0.077, { c: C.dark, seg: 16 });
      k.tube(0.038, 0.02, -0.27, 0.077, { c: C.dark, seg: 16 });
      // 砲口內的微光
      b.cyl(0.03, 0.03, 0.004, {
        p: [0, 0.077, -0.563],
        r: [Math.PI / 2, 0, 0],
        c: accent,
        m: "glow",
        e: 0.5,
        seg: 16,
      });
      b.rbox(0.03, 0.08, 0.034, 0.008, { p: [0, -0.02, -0.36], c: C.dark }); // 前握把
      b.rbox(0.04, 0.03, 0.2, 0.008, { p: [0, 0.025, -0.36], c: C.poly });
      b.box(0.057, 0.004, 0.14, { p: [0, 0.0, 0.02], c: accent, m: "glow" });
      // 墊高座＋紅點鏡（砲管很粗，瞄具要架高才看得到前方）
      b.rbox(0.03, 0.055, 0.07, 0.006, {
        p: [0, 0.098, 0.0],
        c: C.dark,
        m: "metal",
      });
      const sightY = k.redDot(0.0, 0.132, accent);
      k.trigger(0.04, -0.005);
      k.grip(0.1, -0.03);
      k.tube(0.012, 0.22, 0.24, 0.04, { c: C.gun });
      b.rbox(0.044, 0.13, 0.02, 0.006, { p: [0, 0.01, 0.36], c: C.dark });
      return {
        muzzle: [0, 0.077, -0.58],
        eject: [0.05, 0.04, -0.1],
        fore: [0, -0.02, -0.36],
        sightY,
      };
    },

    /* ---------- 稜鏡 PX 電漿步槍 ---------- */
    plasma(b, k, accent) {
      const C = this.C;
      const shell = 0xd9dde4; // 白色外殼
      b.rbox(0.064, 0.09, 0.42, 0.02, { p: [0, 0.035, -0.1], c: shell }); // 主體外殼
      b.rbox(0.05, 0.06, 0.3, 0.014, { p: [0, 0.02, -0.14], c: C.dark }); // 內層機體
      b.rbox(0.03, 0.03, 0.28, 0.01, { p: [0, 0.093, -0.08], c: C.poly }); // 頂部背鰭
      // 上下兩根導引叉，中間是發光的能量核心
      b.rbox(0.03, 0.02, 0.3, 0.006, { p: [0, 0.07, -0.44], c: shell });
      b.rbox(0.03, 0.02, 0.3, 0.006, { p: [0, 0.0, -0.44], c: shell });
      k.tube(0.008, 0.3, -0.44, 0.035, { c: accent, m: "glow", e: 2.6 });
      for (let i = 0; i < 4; i++) {
        // 加速線圈
        b.torus(0.022, 0.004, {
          p: [0, 0.035, -0.33 - i * 0.07],
          c: accent,
          m: "glow",
          e: 1.6,
          seg: 14,
        });
      }
      b.rbox(0.04, 0.09, 0.03, 0.006, { p: [0, 0.035, -0.6], c: C.dark }); // 槍口框
      // 能量電池（發光圓筒，取代彈匣）
      b.cyl(0.026, 0.026, 0.13, { p: [0, -0.07, -0.1], c: C.dark, seg: 14 });
      b.cyl(0.0265, 0.0265, 0.07, {
        p: [0, -0.07, -0.1],
        c: accent,
        m: "glow",
        e: 1.4,
        seg: 14,
      });
      // 側面散熱孔與發光線
      for (let i = 0; i < 4; i++)
        b.box(0.066, 0.008, 0.03, {
          p: [0, 0.05, -0.02 + i * 0.045],
          r: [0.5, 0, 0],
          c: C.dark,
        });
      b.box(0.0655, 0.005, 0.3, { p: [0, 0.008, -0.14], c: accent, m: "glow" });
      const sightY = k.redDot(-0.1, 0.112, accent);
      k.trigger(0.0, -0.005);
      k.grip(0.07, -0.03, 0x2a2c32);
      k.side(
        [
          [-0.1, 0.07],
          [-0.33, 0.055],
          [-0.34, -0.06],
          [-0.28, -0.07],
          [-0.22, 0.0],
          [-0.1, 0.0],
        ],
        0.046,
        { p: [0, 0.0, 0.0], c: shell },
      );
      b.rbox(0.048, 0.12, 0.016, 0.005, { p: [0, 0.0, 0.345], c: C.dark });
      return {
        muzzle: [0, 0.035, -0.63],
        eject: [0.04, 0.05, -0.05],
        fore: [0, -0.03, -0.36],
        sightY,
      };
    },
  },

  /* ============================================================
   *  武器圖示：把每把槍的 3D 模型從側面拍成一張去背的剪影圖
   *  （HUD 武器欄與幹員介紹都用它）。啟動時做一次就好。
   * ============================================================ */
  icons: {},

  makeIcons() {
    // 借用遊戲的渲染器，畫到另一張畫布上，再轉成武器圖示。
    const r = Scene3D.renderer;
    const W = 640,
      H = 224; // 先用兩倍大小拍，再縮小，邊緣才會平滑
    const rt = new THREE.WebGLRenderTarget(W, H);
    rt.texture.colorSpace = THREE.SRGBColorSpace;

    // 拍照用的小場景：統一的淺灰材質 + 一盞從上方打的光，做出有立體感的剪影
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 3, 0.5);
    scene.add(key);
    scene.overrideMaterial = new THREE.MeshLambertMaterial({ color: 0xe6eef7 });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);

    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0); // 透明背景

    const pixels = new Uint8Array(W * H * 4);
    const big = document.createElement("canvas");
    big.width = W;
    big.height = H;
    const bctx = big.getContext("2d");
    const small = document.createElement("canvas");
    small.width = W / 2;
    small.height = H / 2;
    const sctx = small.getContext("2d");

    // 每把武器從側面拍一張圖。
    for (const id of Object.keys(WEAPONS)) {
      const m = this.build(id, 0xffffff);
      scene.add(m.group);
      m.group.updateMatrixWorld(true);
      // 依模型大小調整相機範圍，讓槍剛好填滿畫面
      const box = new THREE.Box3().setFromObject(m.group);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      let hw = (size.z / 2) * 1.06,
        hh = (size.y / 2) * 1.06;
      if (hw / hh > W / H) hh = (hw * H) / W;
      else hw = (hh * W) / H;
      cam.left = -hw;
      cam.right = hw;
      cam.top = hh;
      cam.bottom = -hh;
      cam.position.set(c.x + 5, c.y, c.z); // 從右側看：槍口朝畫面右邊
      cam.lookAt(c);
      cam.updateProjectionMatrix();

      r.setRenderTarget(rt);
      r.clear();
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
      // 顯示卡的畫面是上下顛倒的，逐列翻轉後放進畫布
      const img = bctx.createImageData(W, H);
      for (let y = 0; y < H; y++)
        img.data.set(
          pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4),
          y * W * 4,
        );
      bctx.putImageData(img, 0, 0);
      sctx.clearRect(0, 0, W / 2, H / 2);
      sctx.drawImage(big, 0, 0, W / 2, H / 2);
      this.icons[id] = small.toDataURL("image/png");
      scene.remove(m.group);
    }

    r.setRenderTarget(null);
    r.setClearColor(prevColor, prevAlpha);
    rt.dispose();
    scene.overrideMaterial.dispose();
  },

  /* ============================================================
   *  第一人稱手臂
   *  rightHand 握在握把（原點附近），leftHand 扶在 fore 位置。
   * ============================================================ */
  arms(fore, look) {
    const b = new Builder();
    const sleeve = look.suit;
    const glove = 0x17191d;

    // 手掌：一個圓角方塊加四根手指
    const hand = (x, y, z, flip) => {
      b.rbox(0.075, 0.05, 0.095, 0.018, { p: [x, y, z], c: glove, m: "matte" });
      for (let i = 0; i < 4; i++) {
        b.rbox(0.018, 0.028, 0.06, 0.008, {
          p: [x - 0.03 + i * 0.02, y + 0.03, z - 0.03],
          r: [0.9, 0, 0],
          c: glove,
          m: "matte",
        });
      }
      b.rbox(0.06, 0.012, 0.05, 0.004, {
        p: [x, y - 0.028, z + 0.01],
        c: look.armor,
      }); // 手背護板
      b.box(0.04, 0.004, 0.012, {
        p: [x, y - 0.036, z + 0.01],
        c: look.accent,
        m: "glow",
        e: 1.2,
      });
      b.rbox(0.022, 0.03, 0.06, 0.008, {
        p: [x + 0.04 * flip, y + 0.01, z - 0.02],
        c: glove,
        m: "matte",
      }); // 拇指
    };

    // 右手：握住握把，前臂往右後下方延伸出畫面
    hand(0.0, -0.085, 0.07, 1);
    b.limb([0.01, -0.1, 0.11], [0.13, -0.26, 0.5], 0.046, {
      c: sleeve,
      m: "matte",
    });
    b.limb([0.015, -0.105, 0.13], [0.04, -0.14, 0.21], 0.05, { c: look.armor }); // 護腕

    // 左手：托住前握位置，前臂往左後下方
    hand(fore.x, fore.y - 0.035, fore.z, -1);
    b.limb(
      [fore.x - 0.02, fore.y - 0.06, fore.z + 0.04],
      [-0.26, -0.3, fore.z + 0.5],
      0.046,
      { c: sleeve, m: "matte" },
    );
    b.limb(
      [fore.x - 0.025, fore.y - 0.065, fore.z + 0.06],
      [fore.x - 0.07, fore.y - 0.11, fore.z + 0.15],
      0.05,
      { c: look.armor },
    );

    return b.build({ cast: false, receive: false });
  },

  /* ============================================================
   *  道具模型
   * ============================================================ */

  // 手榴彈（丟出去的那顆，也用在 HUD 以外的任何展示）
  grenade(color = 0xff8a2a) {
    const b = new Builder();
    b.sphere(0.07, { c: 0x2c3a2c, s: [1, 1.15, 1] });
    for (let i = 0; i < 3; i++)
      b.torus(0.07, 0.006, {
        p: [0, -0.04 + i * 0.04, 0],
        r: [Math.PI / 2, 0, 0],
        c: 0x1a221a,
        seg: 16,
      });
    b.cyl(0.025, 0.03, 0.04, {
      p: [0, 0.09, 0],
      c: 0x8a9099,
      m: "metal",
      seg: 10,
    });
    b.box(0.012, 0.09, 0.02, {
      p: [0.035, 0.06, 0],
      r: [0, 0, -0.2],
      c: 0x8a9099,
      m: "metal",
    });
    b.torus(0.07, 0.008, {
      p: [0, 0, 0],
      r: [Math.PI / 2, 0, 0],
      c: color,
      m: "glow",
      seg: 16,
    });
    return b.build();
  },

  // 飛行中的榴彈／火箭
  rocket(color = 0xff8a2a) {
    const b = new Builder();
    b.cyl(0.05, 0.05, 0.26, {
      r: [Math.PI / 2, 0, 0],
      c: 0x3a3f46,
      m: "metal",
      seg: 12,
    });
    b.cone(0.05, 0.12, {
      p: [0, 0, -0.19],
      r: [-Math.PI / 2, 0, 0],
      c: 0xb02a2a,
      seg: 12,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.box(0.004, 0.07, 0.08, {
        p: [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.1],
        r: [0, 0, a - Math.PI / 2],
        c: 0x2a2d33,
      });
    }
    b.cyl(0.035, 0.035, 0.02, {
      p: [0, 0, 0.14],
      r: [Math.PI / 2, 0, 0],
      c: color,
      m: "glow",
      e: 3,
      seg: 10,
    });
    return b.build({ cast: false });
  },

  // 補給品：type = health / armor / ammo / grenade
  pickup(type) {
    const b = new Builder();
    const colors = {
      health: 0xff4a6a,
      armor: 0x35a8ff,
      ammo: 0xffc233,
      grenade: 0xff8a2a,
    };
    const glow = colors[type];

    // 不同種類的補給各有自己的外觀。
    if (type === "health") {
      b.rbox(0.5, 0.3, 0.36, 0.05, { p: [0, 0.15, 0], c: 0xe9edf2 }); // 白色醫療箱
      b.box(0.502, 0.05, 0.362, { p: [0, 0.2, 0], c: 0xb02a2a });
      b.box(0.2, 0.06, 0.004, { p: [0, 0.15, 0.181], c: glow, m: "glow" }); // 紅十字
      b.box(0.06, 0.2, 0.004, { p: [0, 0.15, 0.181], c: glow, m: "glow" });
      b.box(0.2, 0.004, 0.06, { p: [0, 0.301, 0], c: glow, m: "glow" });
      b.box(0.06, 0.004, 0.2, { p: [0, 0.301, 0], c: glow, m: "glow" });
      b.rbox(0.16, 0.03, 0.04, 0.01, { p: [0, 0.33, 0], c: 0x2a2d33 }); // 提把
    } else if (type === "armor") {
      b.rbox(0.44, 0.5, 0.1, 0.04, {
        p: [0, 0.3, 0],
        r: [-0.2, 0, 0],
        c: 0x26384a,
      }); // 護甲板
      b.rbox(0.34, 0.36, 0.04, 0.02, {
        p: [0, 0.31, 0.06],
        r: [-0.2, 0, 0],
        c: 0x1a2733,
        m: "metal",
      });
      b.box(0.24, 0.03, 0.01, {
        p: [0, 0.36, 0.085],
        r: [-0.2, 0, 0],
        c: glow,
        m: "glow",
      });
      b.box(0.14, 0.03, 0.01, {
        p: [0, 0.28, 0.1],
        r: [-0.2, 0, 0],
        c: glow,
        m: "glow",
      });
      b.rbox(0.08, 0.3, 0.06, 0.02, {
        p: [0.2, 0.2, -0.12],
        r: [0.5, 0, 0],
        c: 0x1a2733,
      }); // 支架
    } else if (type === "ammo") {
      b.rbox(0.5, 0.26, 0.3, 0.03, {
        p: [0, 0.13, 0],
        c: 0x4a5231,
        m: "metal",
      }); // 軍綠彈藥箱
      b.rbox(0.52, 0.05, 0.32, 0.02, {
        p: [0, 0.27, 0],
        c: 0x3a4126,
        m: "metal",
      });
      b.box(0.3, 0.05, 0.004, { p: [0, 0.14, 0.151], c: glow, m: "glow" });
      for (let i = 0; i < 5; i++) {
        // 箱頂露出的一排子彈
        b.cyl(0.014, 0.014, 0.1, {
          p: [-0.12 + i * 0.06, 0.32, 0],
          r: [Math.PI / 2, 0, 0],
          c: 0xb8923a,
          m: "metal",
          seg: 8,
        });
        b.cone(0.014, 0.04, {
          p: [-0.12 + i * 0.06, 0.32, -0.07],
          r: [-Math.PI / 2, 0, 0],
          c: 0xb86a3a,
          m: "metal",
          seg: 8,
        });
      }
      b.rbox(0.03, 0.06, 0.1, 0.01, { p: [0.26, 0.2, 0], c: 0x2a2d33 });
    } else {
      // 手榴彈補給：一個箱子上放三顆
      b.rbox(0.46, 0.14, 0.3, 0.02, { p: [0, 0.07, 0], c: 0x3a2f24 });
      for (let i = 0; i < 3; i++) {
        b.sphere(0.07, {
          p: [-0.14 + i * 0.14, 0.22, 0],
          c: 0x2c3a2c,
          s: [1, 1.15, 1],
        });
        b.cyl(0.022, 0.026, 0.035, {
          p: [-0.14 + i * 0.14, 0.31, 0],
          c: 0x8a9099,
          m: "metal",
          seg: 8,
        });
        b.torus(0.07, 0.007, {
          p: [-0.14 + i * 0.14, 0.22, 0],
          r: [Math.PI / 2, 0, 0],
          c: glow,
          m: "glow",
          seg: 14,
        });
      }
    }

    // 物品本體（被撿走後隱藏）與底座（一直留在原地，上面會顯示重生倒數）分開建立
    const item = b.build();
    const base = new Builder();
    // 地面上的發光底座：護甲用六角形，其他用圓形。
    if (type === "armor") {
      // 護甲補給站：六角形平台、四根短柱與發光邊框，在遠處也認得出來
      base.cyl(0.8, 0.9, 0.12, {
        p: [0, 0.06, 0],
        c: 0x1a2733,
        m: "metal",
        seg: 6,
      });
      base.cyl(0.78, 0.78, 0.02, { p: [0, 0.13, 0], c: 0x101820, seg: 6 });
      base.torus(0.8, 0.025, {
        p: [0, 0.13, 0],
        r: [Math.PI / 2, 0, 0],
        c: glow,
        m: "glow",
        e: 1.6,
        seg: 6,
      });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        base.rbox(0.1, 0.5, 0.1, 0.02, {
          p: [Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7],
          c: 0x26384a,
          m: "metal",
        });
        base.box(0.104, 0.18, 0.02, {
          p: [Math.cos(a) * 0.7, 0.45, Math.sin(a) * 0.7],
          r: [0, -a, 0],
          c: glow,
          m: "glow",
        });
      }
      item.position.y = 0.14; // 護甲板放在平台上
    } else {
      // 其他補給：底部的發光圓環
      base.torus(0.48, 0.02, {
        p: [0, 0.03, 0],
        r: [Math.PI / 2, 0, 0],
        c: glow,
        m: "glow",
        e: 1.4,
        seg: 28,
      });
      base.cyl(0.46, 0.46, 0.02, { p: [0, 0.01, 0], c: 0x101216, seg: 24 });
    }
    const group = new THREE.Group();
    group.add(item, base.build());
    group.userData.item = item;
    return group;
  },
};
