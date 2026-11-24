/*
 * ============================================================
 *  05-character-models.js ── 角色、無人機與首領模型
 * ------------------------------------------------------------
 *  角色是有「關節」的：每個關節是一個 THREE.Group，轉動它就能讓
 *  底下的零件一起動（例如轉動大腿，小腿和靴子會跟著動）。
 *
 *  人形骨架（由上到下是父子關係）：
 *    root（腳底，負責整體位置與面向）
 *     └ tilt（倒地時整個人傾倒用）
 *        └ hips（骨盆，高度 0.95）
 *           ├ torso（上半身）
 *           │   ├ head（頭）
 *           │   └ arms（雙臂 + 槍，瞄準時上下轉動）
 *           │        └ gun（槍的掛點）→ muzzle（槍口）
 *           ├ legL → shinL（左大腿 → 左小腿）
 *           └ legR → shinR
 *
 *  模型一律面向 -Z，和「yaw = 0 時面向 -Z」的方向約定一致。
 *
 *  對外使用：
 *    const rig = CharModels.create(look);     // 人形
 *    const rig = CharModels.drone(color);     // 無人機
 *    const rig = CharModels.titan(color);     // 泰坦機甲
 *    const rig = CharModels.hydra(color);     // 九頭蛇核心
 *    CharModels.setWeapon(rig, "ar", accent); // 換槍
 *    rig.animate(dt, 狀態);                   // 每一幀更新動作
 * ============================================================
 */

const CharModels = {
  protos: {}, // 已建好的原型，同樣外觀只建一次
  // 輪廓光的整體強度：暗的地圖 1（看得清楚），亮的地圖調低（才不會整個人變成一片紅）
  rimGain: { value: 1 },

  /* ---------- 小工具 ---------- */

  // 建立一個有名字的關節，並掛到 parent 底下
  _joint(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  },

  // 把複製出來的模型換上「這個角色專用」的材質（受擊閃光才不會影響別人），
  // 並用名字把各關節找出來
  _instance(proto, jointNames, matOpt = {}) {
    const root = proto.clone(true);
    const wear = Tex.get("wear");
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.12,
      map: wear.map,
      normalMap: wear.normalMap,
      ...matOpt,
    });
    mat.normalScale.set(0.3, 0.3);

    /* 輪廓光（Rim Light）：角色邊緣會發出一圈顏色（敵人紅、隊友藍），
     * 在暗的地圖上也能一眼看出人的輪廓。做法是在材質的著色器最後，
     * 依「表面法線與視線的夾角」加上一點顏色：越接近邊緣（夾角越大）越亮。 */
    const rim = { value: new THREE.Color(0, 0, 0) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = rim;
      shader.uniforms.uRimGain = CharModels.rimGain; // 整張地圖共用的強度（亮的地圖調弱）
      shader.fragmentShader =
        `uniform vec3 uRim;
uniform float uRimGain;
` +
        shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
         outgoingLight += uRim * uRimGain * (pow(rimF, 2.6) * 1.5 + 0.04);
         #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => "rim-v1"; // 所有角色共用同一個著色器程式
    root.traverse((node) => {
      if (
        node.isMesh &&
        node.userData.kind !== "glow" &&
        node.userData.kind !== "glass"
      )
        node.material = mat;
    });
    // seed：每個角色自己的隨機相位（呼吸、張望的節奏才不會全部同步）
    const rig = {
      root,
      mat,
      rim: rim.value,
      flashT: 0,
      deathT: 0,
      recoil: 0,
      phase: Math.random() * 6,
      seed: Math.random() * 6,
    };
    for (const n of jointNames) rig[n] = root.getObjectByName(n);
    // 重生時把倒地／墜毀的姿勢還原
    rig.reset = () => {
      rig.deathT = 0;
      rig.flashT = 0;
      rig.mat.emissive.setRGB(0, 0, 0);
      if (rig.tilt) {
        rig.tilt.rotation.set(0, 0, 0);
        rig.tilt.position.y = 0;
      }
      if (rig.arms) rig.arms.rotation.z = 0;
      if (rig.head) rig.head.rotation.set(0, 0, 0);
      if (rig.hips) rig.hips.rotation.z = 0;
      rig.landT = 0;
      rig.wasAir = false;
      if (rig.body) {
        rig.body.rotation.set(0, 0, 0);
        rig.body.scale.setScalar(1);
      }
    };
    return rig;
  },

  // 受擊閃光：讓整個角色短暫泛白（amount 0~1）
  _updateFlash(rig, dt) {
    if (rig.flashT > 0) {
      rig.flashT = Math.max(0, rig.flashT - dt * 5);
      const f = rig.flashT * 0.8;
      rig.mat.emissive.setRGB(f, f * 0.7, f * 0.6);
    }
  },

  /* ============================================================
   *  人形角色
   * ============================================================ */
  create(look, opt = {}) {
    const key = JSON.stringify(look);
    if (!this.protos[key]) this.protos[key] = this._buildHumanoid(look);
    const rig = this._instance(this.protos[key], [
      "tilt",
      "hips",
      "torso",
      "head",
      "arms",
      "gun",
      "muzzle",
      "legL",
      "legR",
      "shinL",
      "shinR",
    ]);
    rig.kind = "humanoid";
    rig.animate = (dt, s) => this._animateBiped(rig, dt, s);
    if (opt.scale) rig.root.scale.setScalar(opt.scale);
    return rig;
  },

  /* ---------- 顏色小工具 ----------
   * 角色只有三個基本色（衣服、護甲、發光色）。這裡把它們調出深淺，
   * 讓護甲有亮面、布料有暗面，細節才看得出層次。 */

  // 把顏色 a 往顏色 b 混合 t（0 = 全是 a，1 = 全是 b）
  _mix(a, b, t) {
    const ch = (shift) =>
      Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  },

  // 兩點之間的內插（做「手臂上的護甲」這類沿著肢體的零件用）
  _between(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  },

  /* 建造人形角色的原型。look 的欄位：
   *   suit / armor / accent  衣服、護甲、發光色
   *   helmet  頭盔樣式（tactical / visor / hood / heavy / wraith）
   *   bulk    體型倍率        pads / pack  是否有護肩／背包
   *   gear    專屬配件（radio 通訊、jets 推進器、cloak 披風、exo 外骨骼、bandolier 彈帶） */
  _buildHumanoid(look) {
    const k = look.bulk || 1; // 體型倍率
    const SUIT = look.suit,
      ARMOR = look.armor,
      ACC = look.accent;
    const SKIN = 0x9a735c,
      DARK = 0x15171b,
      BOOT = 0x101114;
    // 同色系的深淺：護甲亮面、金屬邊條與扣具、布料暗面
    const ARMOR_L = this._mix(ARMOR, 0xffffff, 0.14);
    const TRIM = this._mix(ARMOR, 0x9aa4b2, 0.5);
    const SUIT_D = this._mix(SUIT, 0x000000, 0.35);
    const BRASS = 0xb8963a; // 彈殼的黃銅色
    const C = { SUIT, ARMOR, ACC, DARK, ARMOR_L, TRIM, SUIT_D };
    const gear = look.gear || "";
    const HP = Math.PI / 2;
    const part = (b) => b.build(); // 把建構器的零件合併成網格
    const J = this._joint;
    const mid = this._between;

    const root = new THREE.Group();
    const tilt = J("tilt", root, 0, 0, 0);
    const hips = J("hips", tilt, 0, 0.95, 0);

    /* ---- 骨盆與腰帶 ---- */
    let b = new Builder();
    b.rbox(0.34 * k, 0.18, 0.22 * k, 0.06, { c: SUIT });
    b.rbox(0.36 * k, 0.05, 0.24 * k, 0.012, { p: [0, 0.075, 0], c: DARK }); // 腰帶
    b.box(0.05, 0.04, 0.02, { p: [0, 0.075, -0.125 * k], c: TRIM }); // 皮帶扣
    for (const sx of [-1, 1]) {
      b.rbox(0.07, 0.11, 0.06, 0.012, {
        p: [sx * 0.19 * k, 0.01, 0.02],
        c: ARMOR,
      }); // 兩側腰包
      b.box(0.074, 0.03, 0.064, {
        p: [sx * 0.19 * k, 0.052, 0.02],
        c: ARMOR_L,
      }); // 腰包的袋蓋
      b.box(0.012, 0.02, 0.014, {
        p: [sx * (0.19 * k + 0.04), 0.03, 0.02],
        c: TRIM,
      }); // 袋扣
      // 髖部護板：掛在腰帶下，蓋住大腿外側上緣，外側有一條識別燈
      b.rbox(0.03, 0.15, 0.12 * k, 0.01, {
        p: [sx * 0.212 * k, -0.11, -0.07],
        r: [0, 0, sx * 0.1],
        c: ARMOR,
      });
      b.box(0.008, 0.1, 0.018, {
        p: [sx * (0.212 * k + 0.019), -0.11, -0.07],
        r: [0, 0, sx * 0.1],
        c: ACC,
        m: "glow",
        e: 0.8,
      });
    }
    b.rbox(0.16, 0.1, 0.06, 0.015, { p: [0, 0.02, 0.13 * k], c: ARMOR }); // 後腰包
    b.box(0.164, 0.028, 0.064, { p: [0, 0.058, 0.13 * k], c: ARMOR_L });
    b.rbox(0.13, 0.11, 0.05, 0.02, { p: [0, -0.06, -0.1 * k], c: ARMOR }); // 護襠
    for (let i = 0; i < 2; i++) {
      // 腰帶左前方掛著兩顆手榴彈
      const gx = -0.08 * k - i * 0.058;
      b.sphere(0.027, {
        p: [gx, 0.0, -0.13 * k],
        s: [1, 1.2, 1],
        c: 0x2c3327,
        seg: 8,
      });
      b.cyl(0.011, 0.011, 0.024, {
        p: [gx, 0.042, -0.13 * k],
        c: TRIM,
        seg: 6,
      });
    }
    if (gear === "radio") {
      // 凡塔：左腰包上的醫療十字（技能是戰地急救）
      b.box(0.006, 0.05, 0.016, {
        p: [-0.19 * k - 0.037, 0.0, 0.02],
        c: 0x5dff9a,
        m: "glow",
        e: 1.2,
      });
      b.box(0.006, 0.016, 0.05, {
        p: [-0.19 * k - 0.037, 0.0, 0.02],
        c: 0x5dff9a,
        m: "glow",
        e: 1.2,
      });
    }
    hips.add(part(b));

    /* ---- 上半身 ---- */
    const torso = J("torso", hips, 0, 0.08, 0);
    b = new Builder();
    b.rbox(0.34 * k, 0.22, 0.21 * k, 0.07, { p: [0, 0.08, 0], c: SUIT }); // 腹部
    b.rbox(0.43 * k, 0.36, 0.26 * k, 0.09, { p: [0, 0.31, 0], c: SUIT }); // 胸腔
    for (let i = 0; i < 2; i++) {
      // 腹部的兩片護板（一片疊一片）
      b.box((0.24 - i * 0.03) * k, 0.05, 0.02, {
        p: [0, 0.075 - i * 0.055, -0.112 * k],
        c: i ? ARMOR : ARMOR_L,
      });
    }
    b.rbox(0.35 * k, 0.3, 0.06, 0.02, { p: [0, 0.3, -0.125 * k], c: ARMOR }); // 前護板
    b.rbox(0.35 * k, 0.32, 0.05, 0.02, { p: [0, 0.3, 0.125 * k], c: ARMOR }); // 後護板
    for (const sx of [-1, 1]) {
      b.rbox(0.15 * k, 0.07, 0.03, 0.012, {
        p: [sx * 0.09 * k, 0.425, -0.152 * k],
        c: ARMOR_L,
      }); // 鎖骨護板
      b.rbox(0.035, 0.2, 0.2 * k, 0.012, {
        p: [sx * 0.212 * k, 0.24, 0],
        c: DARK,
      }); // 側腹束帶
      for (const y of [0.2, 0.3])
        b.box(0.012, 0.03, 0.05, {
          p: [sx * (0.212 * k + 0.02), y, -0.03],
          c: TRIM,
        }); // 束帶扣具
      b.rbox(0.07, 0.05, 0.3 * k, 0.015, {
        p: [sx * 0.13 * k, 0.47, 0],
        c: ARMOR,
      }); // 肩帶
      b.box(0.074, 0.012, 0.03, {
        p: [sx * 0.13 * k, 0.5, -0.08 * k],
        c: TRIM,
      }); // 肩帶調節扣
    }
    for (let i = 0; i < 3; i++) {
      // 三個彈匣袋：袋身、袋蓋、露出來的彈匣底
      const px = -0.09 + i * 0.09;
      b.rbox(0.078, 0.12, 0.05, 0.012, { p: [px, 0.2, -0.165 * k], c: DARK });
      b.box(0.08, 0.025, 0.052, { p: [px, 0.25, -0.165 * k], c: ARMOR });
      b.box(0.05, 0.02, 0.03, { p: [px, 0.272, -0.165 * k], c: TRIM });
    }
    b.box(0.09, 0.022, 0.008, {
      p: [0.09, 0.41, -0.173 * k],
      c: ACC,
      m: "glow",
    }); // 胸前識別燈
    b.box(0.03, 0.022, 0.008, {
      p: [-0.11, 0.41, -0.173 * k],
      c: ACC,
      m: "glow",
    });
    // 右胸倒掛的戰術刀：刀鞘在上、刀柄朝下
    b.box(0.03, 0.12, 0.018, { p: [0.168 * k, 0.33, -0.166 * k], c: DARK });
    b.box(0.024, 0.07, 0.022, { p: [0.168 * k, 0.236, -0.166 * k], c: TRIM });
    b.rbox(0.045, 0.09, 0.035, 0.008, {
      p: [-0.15 * k, 0.4, -0.15 * k],
      c: DARK,
    }); // 肩掛無線電
    b.cyl(0.004, 0.004, 0.14, {
      p: [-0.16 * k, 0.5, -0.15 * k],
      c: DARK,
      seg: 6,
    });
    b.cyl(0.078, 0.09, 0.07, { p: [0, 0.5, 0], c: SUIT, seg: 12 }); // 領口

    if (gear === "cloak") {
      // 幽靈：名條換成一排備用子彈
      for (let i = 0; i < 5; i++) {
        b.cyl(0.008, 0.008, 0.05, {
          p: [-0.06 + i * 0.03, 0.345, -0.16 * k],
          c: BRASS,
          seg: 6,
        });
      }
    } else if (gear === "exo") {
      // 堡壘：胸口的護盾產生器（技能是力場護盾）
      b.torus(0.042, 0.011, { p: [0, 0.345, -0.158 * k], c: TRIM, seg: 14 });
      b.cyl(0.03, 0.03, 0.012, {
        p: [0, 0.345, -0.16 * k],
        r: [HP, 0, 0],
        c: ACC,
        m: "glow",
        e: 1.8,
        seg: 12,
      });
    } else {
      b.rbox(0.16 * k, 0.06, 0.03, 0.01, {
        p: [0, 0.345, -0.155 * k],
        c: DARK,
      }); // 胸前名條
    }

    if (look.pads) {
      for (const sx of [-1, 1]) {
        // 護肩：兩層甲片，上層嵌著一條燈
        const rz = sx * -0.25;
        b.rbox(0.16, 0.09, 0.19, 0.04, {
          p: [sx * 0.265 * k, 0.45, 0],
          r: [0, 0, rz],
          c: ARMOR,
        });
        b.rbox(0.13, 0.05, 0.16, 0.02, {
          p: [sx * 0.262 * k, 0.492, 0],
          r: [0, 0, rz],
          c: ARMOR_L,
        });
        b.box(0.06, 0.01, 0.12, {
          p: [sx * 0.268 * k, 0.52, 0],
          r: [0, 0, rz],
          c: ACC,
          m: "glow",
          e: 1.2,
        });
      }
    }
    if (look.pack) {
      b.rbox(0.3 * k, 0.34, 0.15, 0.04, { p: [0, 0.3, 0.215 * k], c: ARMOR }); // 背包
      b.rbox(0.22 * k, 0.12, 0.05, 0.015, { p: [0, 0.22, 0.3 * k], c: DARK }); // 背包前袋
      b.box(0.2 * k, 0.012, 0.054, { p: [0, 0.285, 0.3 * k], c: ARMOR_L }); // 前袋的袋蓋
      b.cyl(0.05, 0.05, 0.3 * k, {
        p: [0, 0.5, 0.21 * k],
        r: [0, 0, HP],
        c: SUIT_D,
        seg: 10,
      }); // 頂端捲起的雨布
      for (const sx of [-1, 1])
        b.box(0.018, 0.105, 0.105, {
          p: [sx * 0.07 * k, 0.5, 0.21 * k],
          c: DARK,
        }); // 雨布束帶
      b.rbox(0.08, 0.2, 0.08, 0.03, { p: [0.17 * k, 0.28, 0.22 * k], c: DARK }); // 側掛水壺
      b.cyl(0.02, 0.02, 0.03, {
        p: [0.17 * k, 0.395, 0.22 * k],
        c: TRIM,
        seg: 8,
      }); // 壺蓋
      b.rbox(0.06, 0.16, 0.1, 0.02, {
        p: [-0.17 * k, 0.26, 0.22 * k],
        c: ARMOR_L,
      }); // 另一側的工具袋
      b.cyl(0.005, 0.005, 0.3, {
        p: [-0.12 * k, 0.6, 0.24 * k],
        c: DARK,
        seg: 6,
      }); // 天線
      b.sphere(0.012, {
        p: [-0.12 * k, 0.75, 0.24 * k],
        c: ACC,
        m: "glow",
        seg: 6,
      });
      b.box(0.12, 0.015, 0.006, { p: [0, 0.4, 0.293 * k], c: ACC, m: "glow" });
      for (let i = 0; i < 3; i++) {
        // 背包上的三顆狀態燈
        b.box(0.014, 0.014, 0.006, {
          p: [-0.03 + i * 0.03, 0.36, 0.293 * k],
          c: i ? ACC : 0x5dff9a,
          m: "glow",
          e: 1.4,
        });
      }
    } else {
      // 沒背包的角色：露出背部的脊椎護條與一個小電池匣
      for (let i = 0; i < 4; i++) {
        b.box(0.05, 0.05, 0.02, {
          p: [0, 0.18 + i * 0.07, 0.155 * k],
          c: i % 2 ? ARMOR_L : TRIM,
        });
      }
      b.rbox(0.13 * k, 0.1, 0.04, 0.012, {
        p: [0, 0.4, 0.168 * k],
        c: ARMOR_L,
      });
      for (const sx of [-1, 1]) {
        b.box(0.03, 0.06, 0.008, {
          p: [sx * 0.033 * k, 0.4, 0.19 * k],
          c: ACC,
          m: "glow",
          e: 1,
        });
      }
    }
    if (look.helmet === "wraith") {
      // 首領：背後的能量翼
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32;
        b.box(0.03, 0.7, 0.015, {
          p: [Math.sin(a) * 0.38, 0.5 + Math.cos(a) * 0.2, 0.2],
          r: [0.5, 0, -a],
          c: 0x0c0d12,
        });
        b.box(0.012, 0.5, 0.012, {
          p: [Math.sin(a) * 0.42, 0.55 + Math.cos(a) * 0.24, 0.24],
          r: [0.5, 0, -a],
          c: ACC,
          m: "glow",
          e: 2,
        });
      }
      b.sphere(0.07, {
        p: [0, 0.3, -0.14],
        c: ACC,
        m: "glow",
        e: 2.4,
        seg: 12,
      }); // 胸口核心
    }
    this._gearTorso(b, gear, k, C);
    torso.add(part(b));

    /* ---- 頭與頭盔 ---- */
    const head = J("head", torso, 0, 0.56, 0);
    b = new Builder();
    b.cyl(0.05, 0.058, 0.09, { p: [0, 0.02, 0], c: SKIN, seg: 10 }); // 脖子
    b.cyl(0.062, 0.07, 0.05, { p: [0, 0.0, 0], c: SUIT_D, seg: 10 }); // 圍在脖子上的頸套
    b.sphere(0.1, { p: [0, 0.13, 0], s: [0.95, 1.1, 1.02], c: SKIN });
    this._helmet(b, look.helmet, C);
    head.add(part(b));

    /* ---- 雙臂（固定成據槍姿勢）與槍的掛點 ---- */
    const arms = J("arms", torso, 0, 0.44, 0);
    b = new Builder();
    const blades = look.helmet === "wraith";
    const GUN = [0.08, -0.14, -0.2]; // 槍的原點（相對肩線）
    const shoulderR = [0.24 * k, 0, 0];
    const shoulderL = [-0.24 * k, 0, 0];
    const elbowR = [0.27 * k, -0.25, -0.05];
    const handR = [GUN[0], GUN[1] - 0.06, GUN[2] + 0.05];
    const elbowL = [-0.21 * k, -0.25, -0.24];
    const handL = [GUN[0] - 0.02, GUN[1] - 0.04, GUN[2] - 0.32];
    for (const [sh, el, hd, sx] of [
      [shoulderR, elbowR, handR, 1],
      [shoulderL, elbowL, handL, -1],
    ]) {
      b.sphere(0.074 * k, { p: sh, c: SUIT, seg: 10 }); // 肩關節
      b.limb(sh, el, 0.062 * k, { c: SUIT }); // 上臂
      b.limb(el, hd, 0.052 * k, { c: SUIT }); // 前臂
      b.limb(mid(sh, el, 0.35), mid(sh, el, 0.8), 0.07 * k, {
        c: ARMOR,
        flat: true,
        seg: 10,
      }); // 上臂護甲
      b.limb(mid(el, hd, 0.2), mid(el, hd, 0.72), 0.06 * k, {
        c: ARMOR,
        flat: true,
        seg: 10,
      }); // 前臂護甲
      b.limb(mid(el, hd, 0.76), mid(el, hd, 0.84), 0.058 * k, {
        c: TRIM,
        flat: true,
        seg: 10,
      }); // 手套束口
      // 前臂外側的一條發光細線
      const a0 = mid(el, hd, 0.25),
        a1 = mid(el, hd, 0.68);
      const off = sx * 0.062 * k;
      b.limb(
        [a0[0] + off, a0[1] + 0.01, a0[2]],
        [a1[0] + off, a1[1] + 0.01, a1[2]],
        0.007,
        {
          c: ACC,
          m: "glow",
          e: 1.1,
          flat: true,
          seg: 6,
        },
      );
      b.sphere(0.066 * k, { p: el, c: ARMOR, seg: 10 }); // 護肘
      b.rbox(0.085, 0.085, 0.1, 0.03, { p: hd, c: DARK }); // 手套
      b.box(0.07, 0.02, 0.07, {
        p: [hd[0], hd[1] + 0.047, hd[2] - 0.005],
        c: ARMOR_L,
      }); // 指節護片
    }
    if (blades) {
      // 首領「幽影」：雙手的能量刃
      b.box(0.02, 0.05, 0.95, {
        p: [handR[0] + 0.05, handR[1], handR[2] - 0.5],
        c: ACC,
        m: "glow",
        e: 3,
      });
      b.box(0.02, 0.05, 0.95, {
        p: [handL[0] - 0.05, handL[1], handL[2] - 0.3],
        c: ACC,
        m: "glow",
        e: 3,
      });
    }
    if (gear === "jets") {
      // 裂隙：雙肩的相位發射環
      for (const sh of [shoulderR, shoulderL]) {
        b.torus(0.055, 0.012, {
          p: [sh[0], sh[1] + 0.085, sh[2]],
          r: [HP, 0, 0],
          c: ACC,
          m: "glow",
          e: 1.6,
          seg: 14,
        });
      }
    }
    arms.add(part(b));
    const gun = J("gun", arms, GUN[0], GUN[1], GUN[2]);
    J("muzzle", gun, 0, 0.04, blades ? -0.4 : -0.8);

    /* ---- 雙腿 ---- */
    for (const side of ["L", "R"]) {
      const sx = side === "L" ? -1 : 1;
      const leg = J("leg" + side, hips, sx * 0.1 * k, -0.03, 0);
      b = new Builder();
      b.limb([0, 0, 0], [0, -0.42, 0], 0.088 * k, { c: SUIT }); // 大腿
      b.limb([0, 0.0, 0], [0, -0.16, 0], 0.097 * k, { c: SUIT }); // 大腿上半比較粗
      b.rbox(0.13 * k, 0.2, 0.04, 0.015, {
        p: [0, -0.2, -0.085 * k],
        c: ARMOR,
      }); // 大腿護板
      b.box(0.07 * k, 0.012, 0.012, { p: [0, -0.12, -0.108 * k], c: ARMOR_L }); // 護板上緣的橫條
      b.box(0.008, 0.2, 0.016, {
        p: [sx * 0.094 * k, -0.24, 0.01],
        c: ACC,
        m: "glow",
        e: 0.7,
      }); // 褲縫的識別燈條
      if (side === "R") {
        // 右腿槍套：套身、露出的握把、固定扣
        b.rbox(0.045, 0.16, 0.1, 0.012, { p: [0.105 * k, -0.2, 0], c: DARK });
        b.rbox(0.03, 0.06, 0.05, 0.01, {
          p: [0.11 * k, -0.1, 0.03],
          c: 0x2c3038,
        });
        b.box(0.05, 0.016, 0.03, { p: [0.107 * k, -0.135, -0.03], c: TRIM });
      } else {
        // 左腿彈匣袋：兩格
        b.rbox(0.04, 0.12, 0.08, 0.01, { p: [-0.105 * k, -0.2, 0], c: DARK });
        b.box(0.044, 0.02, 0.084, { p: [-0.105 * k, -0.15, 0], c: ARMOR });
        b.box(0.044, 0.1, 0.006, { p: [-0.105 * k, -0.2, 0], c: TRIM });
      }
      for (const y of [-0.12, -0.3])
        b.rbox(0.19 * k, 0.03, 0.19 * k, 0.01, { p: [0, y, 0], c: DARK }); // 兩條腿帶
      if (gear === "exo") {
        // 堡壘：大腿外側的外骨骼支架與髖關節圓盤
        b.limb(
          [sx * 0.125 * k, 0.0, 0.03],
          [sx * 0.125 * k, -0.43, 0.03],
          0.014,
          { c: TRIM, flat: true, seg: 6 },
        );
        b.cyl(0.04, 0.04, 0.03, {
          p: [sx * 0.125 * k, 0.0, 0.03],
          r: [0, 0, HP],
          c: TRIM,
          seg: 10,
        });
      }
      leg.add(part(b));

      const shin = J("shin" + side, leg, 0, -0.44, 0);
      b = new Builder();
      b.rbox(0.12 * k, 0.11, 0.07, 0.03, { p: [0, 0, -0.075 * k], c: ARMOR }); // 護膝
      b.sphere(0.045 * k, {
        p: [0, 0.0, -0.108 * k],
        s: [1.1, 1, 0.5],
        c: ARMOR_L,
        seg: 8,
      }); // 護膝中央的凸蓋
      b.limb([0, 0, 0], [0, -0.36, 0], 0.068 * k, { c: SUIT }); // 小腿
      b.sphere(0.07 * k, {
        p: [0, -0.13, 0.022],
        s: [1, 1.5, 1],
        c: SUIT,
        seg: 8,
      }); // 小腿肚
      b.rbox(0.095 * k, 0.24, 0.035, 0.012, {
        p: [0, -0.2, -0.066 * k],
        c: ARMOR,
      }); // 護脛
      b.box(0.018, 0.22, 0.012, { p: [0, -0.2, -0.087 * k], c: ARMOR_L }); // 護脛中央的稜線
      b.box(0.012, 0.1, 0.006, {
        p: [0.03 * k, -0.2, -0.086 * k],
        c: ACC,
        m: "glow",
        e: 0.9,
      }); // 護脛上的兩條燈
      b.box(0.012, 0.1, 0.006, {
        p: [-0.03 * k, -0.2, -0.086 * k],
        c: ACC,
        m: "glow",
        e: 0.9,
      });
      b.cyl(0.076 * k, 0.08 * k, 0.045, { p: [0, -0.3, 0], c: DARK, seg: 10 }); // 靴筒上緣
      b.rbox(0.115 * k, 0.13, 0.29, 0.04, { p: [0, -0.4, -0.05], c: BOOT }); // 靴子
      b.rbox(0.12 * k, 0.085, 0.09, 0.03, { p: [0, -0.42, -0.165], c: ARMOR }); // 鋼頭
      b.box(0.122 * k, 0.06, 0.07, { p: [0, -0.43, 0.07], c: DARK }); // 後跟
      b.box(0.12 * k, 0.03, 0.3, { p: [0, -0.465, -0.05], c: 0x08090a }); // 鞋底
      for (let i = 0; i < 3; i++)
        b.box(0.07 * k, 0.008, 0.012, {
          p: [0, -0.333, -0.07 - i * 0.032],
          c: TRIM,
        }); // 鞋帶
      b.rbox(0.118 * k, 0.05, 0.1, 0.015, { p: [0, -0.33, 0.02], c: DARK }); // 靴筒束帶
      if (gear === "exo") {
        // 堡壘：小腿外側的支架與膝關節圓盤
        b.limb(
          [sx * 0.105 * k, 0.0, 0.03],
          [sx * 0.105 * k, -0.34, 0.03],
          0.014,
          { c: TRIM, flat: true, seg: 6 },
        );
        b.cyl(0.04, 0.04, 0.03, {
          p: [sx * 0.105 * k, 0.0, 0.03],
          r: [0, 0, HP],
          c: TRIM,
          seg: 10,
        });
      } else if (gear === "jets") {
        // 裂隙：小腿後方的推進器與噴口
        b.cyl(0.032, 0.026, 0.15, {
          p: [0, -0.17, 0.085 * k],
          c: ARMOR_L,
          seg: 8,
        });
        b.cyl(0.02, 0.02, 0.012, {
          p: [0, -0.252, 0.085 * k],
          c: ACC,
          m: "glow",
          e: 2,
          seg: 8,
        });
      }
      shin.add(part(b));
    }
    return root;
  },

  /* 幹員的專屬配件（裝在上半身）。b 是上半身的建構器，座標以腰部為原點、臉朝 -Z。
   *   radio      凡塔：肩上的攝影機與長天線
   *   jets       裂隙：背後的雙推進器
   *   cloak      幽靈：披在背後的偽裝披風與肩上的碎布條
   *   exo        堡壘：背後的彈鼓、繞到腰側的彈鏈、加大的肩盾
   *   bandolier  新星：斜背的榴彈彈帶、背後的炸藥包、肩上的雷射標定器 */
  _gearTorso(b, gear, k, C) {
    // 取出這套角色的配色。
    const { ARMOR, ACC, DARK, ARMOR_L, TRIM, SUIT, SUIT_D } = C;
    const HP = Math.PI / 2;
    if (gear === "radio") {
      b.rbox(0.05, 0.05, 0.09, 0.012, { p: [0.2 * k, 0.535, -0.02], c: DARK }); // 肩上攝影機
      b.cyl(0.016, 0.016, 0.012, {
        p: [0.2 * k, 0.535, -0.07],
        r: [HP, 0, 0],
        c: ACC,
        m: "glow",
        e: 1.8,
        seg: 8,
      });
      b.cyl(0.004, 0.006, 0.5, {
        p: [0.12 * k, 0.72, 0.25 * k],
        r: [0.12, 0, 0],
        c: DARK,
        seg: 6,
      }); // 長鞭天線
      b.sphere(0.01, {
        p: [0.12 * k, 0.97, 0.28 * k],
        c: ACC,
        m: "glow",
        seg: 6,
      });
    } else if (gear === "jets") {
      for (const sx of [-1, 1]) {
        b.cyl(0.045, 0.05, 0.22, {
          p: [sx * 0.085 * k, 0.3, 0.19 * k],
          c: ARMOR_L,
          seg: 10,
        }); // 推進器筒身
        b.cone(0.045, 0.06, {
          p: [sx * 0.085 * k, 0.44, 0.19 * k],
          c: ARMOR,
          seg: 10,
        }); // 進氣錐
        b.cyl(0.036, 0.036, 0.012, {
          p: [sx * 0.085 * k, 0.186, 0.19 * k],
          c: ACC,
          m: "glow",
          e: 2.2,
          seg: 10,
        }); // 噴口
        b.box(0.012, 0.14, 0.07, {
          p: [sx * 0.14 * k, 0.3, 0.21 * k],
          c: ARMOR,
        }); // 穩定翼
      }
    } else if (gear === "cloak") {
      for (let i = -2; i <= 2; i++) {
        // 披風：五條布，每條分上下兩段，下段往外飄、長短不一
        const x = i * 0.085 * k;
        const tone = i % 2 ? SUIT_D : SUIT;
        const long = 0.34 + ((i + 2) % 3) * 0.05;
        b.box(0.082 * k, 0.4, 0.012, {
          p: [x, 0.3, 0.305 * k - Math.abs(i) * 0.012],
          c: tone,
        });
        b.box(0.088 * k, long, 0.012, {
          p: [x * 1.12, 0.1 - long / 2, 0.325 * k],
          r: [0.14, 0, i * -0.03],
          c: tone,
        });
      }
      for (const sx of [-1, 1]) {
        // 肩上的偽裝碎布
        for (let i = 0; i < 3; i++) {
          b.box(0.03, 0.012, 0.1, {
            p: [sx * (0.2 + i * 0.03) * k, 0.5 - i * 0.012, -0.02 + i * 0.03],
            r: [0.2, i * 0.5, sx * -0.3],
            c: i % 2 ? SUIT : SUIT_D,
          });
        }
      }
    } else if (gear === "exo") {
      b.cyl(0.09, 0.09, 0.22, {
        p: [0, 0.1, 0.35 * k],
        r: [0, 0, HP],
        c: DARK,
        seg: 12,
      }); // 背後的彈鼓
      for (const sx of [-1, 1]) {
        b.cyl(0.095, 0.095, 0.02, {
          p: [sx * 0.1, 0.1, 0.35 * k],
          r: [0, 0, HP],
          c: TRIM,
          seg: 12,
        });
      }
      for (let i = 0; i < 7; i++) {
        // 彈鏈：從彈鼓繞過右腰到身前
        const t = i / 6;
        const a = t * Math.PI * 0.75;
        b.box(0.03, 0.045, 0.02, {
          p: [
            0.12 * k + Math.sin(a) * 0.14 * k,
            0.1 - t * 0.06,
            0.3 * k * Math.cos(a) - t * 0.06,
          ],
          r: [0, -a, 0],
          c: 0xb8963a,
        });
      }
      for (const sx of [-1, 1]) {
        // 加大的肩盾，邊緣一條燈
        b.rbox(0.05, 0.2, 0.25, 0.02, {
          p: [sx * 0.37 * k, 0.4, 0],
          r: [0, 0, sx * -0.12],
          c: ARMOR_L,
        });
        b.box(0.008, 0.16, 0.02, {
          p: [sx * (0.37 * k + 0.03), 0.4, -0.1],
          r: [0, 0, sx * -0.12],
          c: ACC,
          m: "glow",
          e: 1.2,
        });
      }
    } else if (gear === "bandolier") {
      const top = [-0.16 * k, 0.45, -0.165 * k],
        bottom = [0.17 * k, 0.1, -0.15 * k];
      b.limb(top, bottom, 0.014, { c: DARK, flat: true, seg: 6 }); // 斜背帶
      for (let i = 0; i < 5; i++) {
        // 彈帶上的五發榴彈
        const p = this._between(top, bottom, 0.14 + i * 0.18);
        b.cyl(0.02, 0.02, 0.06, {
          p: [p[0], p[1], p[2] - 0.022],
          c: TRIM,
          seg: 8,
        });
        b.sphere(0.017, {
          p: [p[0], p[1] + 0.034, p[2] - 0.022],
          c: ACC,
          m: "glow",
          e: 1.4,
          seg: 6,
        });
      }
      for (const sx of [-1, 1]) {
        // 背後的兩塊炸藥包與指示燈
        b.rbox(0.11, 0.15, 0.05, 0.012, {
          p: [sx * 0.08 * k, 0.26, 0.175 * k],
          c: ARMOR,
        });
        b.box(0.02, 0.02, 0.008, {
          p: [sx * 0.08 * k, 0.3, 0.203 * k],
          c: 0xff3030,
          m: "glow",
          e: 2,
        });
        b.box(0.08, 0.012, 0.054, {
          p: [sx * 0.08 * k, 0.22, 0.175 * k],
          c: 0xc9a227,
        });
      }
      b.cyl(0.024, 0.024, 0.12, {
        p: [-0.2 * k, 0.54, -0.02],
        r: [HP, 0, 0],
        c: DARK,
        seg: 8,
      }); // 肩上的雷射標定器
      b.cyl(0.016, 0.016, 0.01, {
        p: [-0.2 * k, 0.54, -0.083],
        r: [HP, 0, 0],
        c: 0xff3030,
        m: "glow",
        e: 2.4,
        seg: 8,
      });
    }
  },

  // 四種頭盔（加上首領專用的 wraith）；零件座標以脖子底部為原點，臉朝 -Z。C 是角色的色盤
  _helmet(b, style, C) {
    // 取出這套角色的配色。
    const { ARMOR, SUIT, ACC, DARK, ARMOR_L, TRIM, SUIT_D } = C;
    const HP = Math.PI / 2;
    if (style === "tactical") {
      b.sphere(0.12, { p: [0, 0.155, 0.006], s: [1, 0.88, 1.1], c: ARMOR }); // 盔體
      b.torus(0.119, 0.01, {
        p: [0, 0.118, 0.006],
        r: [HP, 0, 0],
        s: [1, 1.1, 1],
        c: ARMOR_L,
        seg: 16,
      }); // 盔緣
      for (const sx of [-1, 1]) {
        b.rbox(0.02, 0.03, 0.13, 0.006, { p: [sx * 0.116, 0.14, 0], c: DARK }); // 側導軌
        b.cyl(0.046, 0.046, 0.04, {
          p: [sx * 0.105, 0.105, 0.01],
          r: [0, 0, HP],
          c: DARK,
          seg: 12,
        }); // 耳機
        b.cyl(0.03, 0.03, 0.012, {
          p: [sx * 0.127, 0.105, 0.01],
          r: [0, 0, HP],
          c: TRIM,
          seg: 10,
        }); // 耳機外蓋
        b.box(0.012, 0.1, 0.012, {
          p: [sx * 0.092, 0.058, -0.035],
          r: [0.35, 0, 0],
          c: DARK,
        }); // 下巴帶
        // 翻到頭上的夜視鏡：兩支鏡筒，前端有鏡片
        b.cyl(0.02, 0.022, 0.075, {
          p: [sx * 0.028, 0.272, -0.135],
          r: [-1.1, 0, 0],
          c: DARK,
          seg: 8,
        });
        b.cyl(0.015, 0.015, 0.008, {
          p: [sx * 0.028, 0.29, -0.17],
          r: [-1.1, 0, 0],
          c: ACC,
          m: "glow",
          e: 1.2,
          seg: 8,
        });
      }
      b.rbox(0.18, 0.055, 0.045, 0.018, { p: [0, 0.135, -0.09], c: DARK }); // 護目鏡框
      b.box(0.155, 0.03, 0.01, {
        p: [0, 0.135, -0.115],
        c: ACC,
        m: "glow",
        e: 1.5,
      }); // 鏡片
      b.rbox(0.13, 0.075, 0.06, 0.02, { p: [0, 0.07, -0.07], c: DARK }); // 面罩
      for (let i = 0; i < 3; i++)
        b.box(0.05, 0.006, 0.008, {
          p: [0, 0.052 + i * 0.016, -0.102],
          c: TRIM,
        }); // 面罩的呼吸格柵
      b.rbox(0.05, 0.035, 0.05, 0.01, { p: [0, 0.225, -0.085], c: DARK }); // 夜視鏡座
      b.box(0.02, 0.02, 0.05, { p: [0, 0.25, -0.115], c: DARK }); // 夜視鏡支臂
      b.limb([-0.1, 0.09, -0.02], [-0.04, 0.06, -0.11], 0.005, {
        c: DARK,
        flat: true,
      }); // 麥克風桿
      b.rbox(0.08, 0.05, 0.03, 0.01, { p: [0, 0.13, 0.136], c: DARK }); // 盔後的電池盒
      b.box(0.02, 0.02, 0.036, { p: [0.134, 0.168, -0.03], c: DARK }); // 側導軌上的小燈
      b.box(0.012, 0.012, 0.006, {
        p: [0.134, 0.168, -0.05],
        c: ACC,
        m: "glow",
        e: 2,
      });
    } else if (style === "visor") {
      b.sphere(0.128, { p: [0, 0.135, 0], s: [1, 1.06, 1.1], c: ARMOR }); // 全罩頭盔
      b.sphere(0.105, {
        p: [0, 0.135, -0.045],
        s: [0.95, 0.58, 1],
        c: ACC,
        m: "glow",
        e: 1.3,
      }); // 大片發光面罩
      b.rbox(0.17, 0.028, 0.06, 0.012, { p: [0, 0.205, -0.098], c: ARMOR_L }); // 眉脊
      b.rbox(0.14, 0.06, 0.08, 0.02, { p: [0, 0.055, -0.07], c: DARK }); // 下顎
      b.box(0.02, 0.03, 0.16, { p: [0, 0.265, 0.01], c: DARK }); // 頂鰭
      b.box(0.008, 0.008, 0.14, {
        p: [0, 0.284, 0.01],
        c: ACC,
        m: "glow",
        e: 1.2,
      }); // 頂鰭上的燈條
      b.cyl(0.004, 0.004, 0.12, { p: [0.11, 0.26, 0.05], c: DARK, seg: 6 });
      for (const sx of [-1, 1]) {
        b.box(0.012, 0.09, 0.12, { p: [sx * 0.128, 0.14, 0.02], c: DARK }); // 側鰭
        b.cyl(0.034, 0.034, 0.02, {
          p: [sx * 0.136, 0.11, -0.01],
          r: [0, 0, HP],
          c: ARMOR_L,
          seg: 10,
        }); // 耳部圓蓋
        b.cyl(0.013, 0.013, 0.024, {
          p: [sx * 0.137, 0.11, -0.01],
          r: [0, 0, HP],
          c: ACC,
          m: "glow",
          e: 1.4,
          seg: 8,
        });
        for (let i = 0; i < 3; i++) {
          // 臉頰的三道散熱縫
          b.box(0.008, 0.008, 0.04, {
            p: [sx * 0.076, 0.045 + i * 0.016, -0.085],
            r: [0, sx * 0.5, 0],
            c: TRIM,
          });
        }
        b.limb([sx * 0.06, 0.06, 0.09], [sx * 0.09, -0.03, 0.115], 0.013, {
          c: DARK,
          flat: true,
          seg: 6,
        }); // 接到背後的管線
      }
    } else if (style === "hood") {
      b.sphere(0.132, {
        p: [0, 0.14, 0.022],
        s: [1, 1.06, 1.1],
        c: SUIT,
        m: "paint",
      }); // 兜帽
      b.sphere(0.075, { p: [0, 0.1, 0.12], s: [1.25, 1.3, 1], c: SUIT }); // 垂在腦後的帽兜
      b.torus(0.098, 0.016, {
        p: [0, 0.128, -0.078],
        s: [1, 1.12, 1],
        c: SUIT_D,
        seg: 16,
      }); // 帽緣
      b.sphere(0.098, { p: [0, 0.125, -0.035], c: 0x0b0c0e }); // 帽內陰影面罩
      b.cyl(0.02, 0.02, 0.03, {
        p: [0.04, 0.14, -0.125],
        r: [HP, 0, 0],
        c: DARK,
        seg: 10,
      }); // 單眼鏡
      b.cyl(0.015, 0.015, 0.005, {
        p: [0.04, 0.14, -0.142],
        r: [HP, 0, 0],
        c: ACC,
        m: "glow",
        e: 3,
        seg: 10,
      });
      b.sphere(0.008, {
        p: [-0.035, 0.14, -0.128],
        c: ACC,
        m: "glow",
        e: 2,
        seg: 6,
      });
      b.cyl(0.028, 0.03, 0.04, {
        p: [0, 0.075, -0.125],
        r: [HP, 0, 0],
        c: DARK,
        seg: 10,
      }); // 面罩的濾嘴
      b.torus(0.085, 0.035, {
        p: [0, 0.03, 0],
        r: [HP, 0, 0],
        c: SUIT,
        seg: 14,
      }); // 圍巾
      b.box(0.05, 0.16, 0.012, {
        p: [0.05, -0.05, -0.1],
        r: [-0.12, 0, 0.1],
        c: SUIT,
      }); // 圍巾垂在胸前的一端
      b.box(0.045, 0.2, 0.012, {
        p: [-0.04, -0.07, 0.105],
        r: [0.1, 0, 0.06],
        c: SUIT_D,
      }); // 垂在背後的另一端
      b.box(0.03, 0.03, 0.06, { p: [-0.118, 0.17, -0.05], c: DARK }); // 頭側的測距儀
      b.box(0.018, 0.018, 0.006, {
        p: [-0.118, 0.17, -0.083],
        c: ACC,
        m: "glow",
        e: 2,
      });
    } else if (style === "heavy") {
      b.rbox(0.25, 0.25, 0.27, 0.06, { p: [0, 0.135, 0], c: ARMOR }); // 方形重盔
      b.cyl(0.15, 0.17, 0.06, { p: [0, 0.01, 0.01], c: ARMOR_L, seg: 12 }); // 護頸環
      b.box(0.17, 0.024, 0.01, {
        p: [0, 0.155, -0.137],
        c: ACC,
        m: "glow",
        e: 2,
      }); // 觀察縫
      b.rbox(0.19, 0.06, 0.03, 0.01, { p: [0, 0.2, -0.135], c: DARK }); // 眉甲
      b.rbox(0.03, 0.05, 0.22, 0.01, { p: [0, 0.27, 0], c: DARK }); // 盔頂稜線
      for (const sx of [-1, 1]) {
        b.cyl(0.03, 0.03, 0.06, {
          p: [sx * 0.055, 0.06, -0.135],
          r: [HP, 0, 0],
          c: DARK,
          seg: 10,
        }); // 濾毒罐
        b.cyl(0.022, 0.022, 0.008, {
          p: [sx * 0.055, 0.06, -0.168],
          r: [HP, 0, 0],
          c: TRIM,
          seg: 8,
        }); // 濾毒罐的蓋子
        b.rbox(0.03, 0.16, 0.2, 0.01, { p: [sx * 0.13, 0.12, 0.01], c: DARK }); // 側甲
        // 鉚釘
        for (const y of [0.07, 0.17]) {
          b.cyl(0.01, 0.01, 0.008, {
            p: [sx * 0.147, y, -0.05],
            r: [0, 0, HP],
            c: TRIM,
            seg: 6,
          });
        }
        b.limb([sx * 0.075, 0.045, -0.12], [sx * 0.135, -0.03, 0.0], 0.015, {
          c: DARK,
          flat: true,
          seg: 6,
        }); // 呼吸管
        b.sphere(0.008, {
          p: [sx * 0.1, 0.225, -0.128],
          c: ACC,
          m: "glow",
          e: 2,
          seg: 6,
        }); // 眉甲兩端的小燈
      }
      for (let i = 0; i < 3; i++)
        b.box(0.14, 0.012, 0.01, { p: [0, 0.09 + i * 0.04, 0.138], c: DARK }); // 盔後的散熱縫
      b.cyl(0.005, 0.005, 0.12, { p: [0.1, 0.31, 0.08], c: DARK, seg: 6 }); // 短天線
    } else if (style === "wraith") {
      b.sphere(0.125, { p: [0, 0.14, 0], s: [0.92, 1.15, 1.1], c: 0x0c0d12 }); // 尖長的頭
      for (const sx of [-1, 1]) {
        // 一對角
        b.cone(0.03, 0.26, {
          p: [sx * 0.09, 0.3, 0.03],
          r: [0.25, 0, sx * -0.35],
          c: 0x0c0d12,
          seg: 8,
        });
        b.cone(0.012, 0.1, {
          p: [sx * 0.135, 0.42, 0.06],
          r: [0.25, 0, sx * -0.35],
          c: ACC,
          m: "glow",
          e: 2.5,
          seg: 6,
        });
      }
      for (let i = 0; i < 3; i++) {
        // 六隻發光的眼
        for (const sx of [-1, 1]) {
          b.sphere(0.014 - i * 0.003, {
            p: [sx * (0.03 + i * 0.022), 0.15 - i * 0.03, -0.118 + i * 0.012],
            c: ACC,
            m: "glow",
            e: 3.5,
            seg: 6,
          });
        }
      }
    }
  },

  /* ---------- 換槍 ---------- */
  setWeapon(rig, weaponId, accent) {
    if (!rig.gun) return;
    if (rig.gunModel) rig.gun.remove(rig.gunModel);
    const model = WeaponModels.build(weaponId, accent);
    rig.gunModel = model.group;
    rig.gun.add(model.group);
    rig.muzzle.position.copy(model.muzzle);
  },

  /* ---------- 雙足動畫 ----------
   * s（狀態）可包含：
   *   speed 水平速度   fwd / side 相對於面向的前進／右移速度（後退、往左是負的）
   *   pitch 瞄準仰角   crouch 蹲下程度   air 是否在空中   reload 換彈進度 0~1
   *   hit 受擊強度 0~1（剛被打到時是 1）   dead 是否死亡   deathDir 倒下的方向
   *   idle 沒有交戰目標（會東張西望，看起來像在警戒） */
  _animateBiped(rig, dt, s) {
    this._updateFlash(rig, dt);

    // ---- 死亡：先膝蓋一軟往下沉，再依中彈方向倒下（往後、往前或往側邊），落地時輕輕彈一下 ----
    // 倒地：先跪下，再往受擊的方向倒下並輕輕彈一下。
    if (s.dead) {
      rig.deathT += dt;
      const d = s.deathDir || { x: 1, z: 0 };
      const buckle = Util.smooth(rig.deathT / 0.2); // 前 0.2 秒：膝蓋彎曲、身體下沉
      const fall = Util.smooth((rig.deathT - 0.12) / 0.5); // 接著倒下
      const bounce =
        rig.deathT > 0.62
          ? Math.sin(Math.min(1, (rig.deathT - 0.62) / 0.25) * Math.PI) * 0.06
          : 0;
      rig.tilt.rotation.x = fall * (Math.PI / 2 - 0.1) * d.x - bounce * d.x;
      rig.tilt.rotation.z = fall * (Math.PI / 2 - 0.1) * d.z - bounce * d.z;
      rig.tilt.position.y = fall * 0.16;
      rig.hips.position.y = 0.95 - buckle * 0.25 * (1 - fall);
      rig.legL.rotation.x = Util.lerp(
        rig.legL.rotation.x,
        0.5 * buckle - 0.2 * fall,
        0.2,
      );
      rig.legR.rotation.x = Util.lerp(rig.legR.rotation.x, 0.2 * buckle, 0.2);
      rig.shinL.rotation.x = Util.lerp(
        rig.shinL.rotation.x,
        -0.9 * buckle * (1 - fall * 0.7),
        0.2,
      );
      rig.shinR.rotation.x = Util.lerp(
        rig.shinR.rotation.x,
        -0.6 * buckle,
        0.2,
      );
      rig.arms.rotation.x = Util.lerp(
        rig.arms.rotation.x,
        0.9 * d.x + 0.5,
        fall,
      );
      rig.arms.rotation.z = Util.lerp(rig.arms.rotation.z, 0.6 * d.z, fall);
      rig.head.rotation.x = Util.lerp(rig.head.rotation.x, -0.4 * d.x, fall);
      return;
    }

    const speed = s.speed || 0;
    const fwd = s.fwd ?? speed;
    // 依移動方向決定跨步與側移的身體角度。
    const side = s.side || 0;
    const crouch = s.crouch || 0;
    const move = Math.min(1, speed / 4); // 0 靜止 ～ 1 全速
    rig.t = (rig.t || 0) + dt;

    // ---- 側移：骨盆轉向移動方向、上半身轉回來繼續面對前方（像真人一樣邊走邊瞄準） ----
    const strafeYaw =
      speed > 0.4
        ? Util.clamp(Math.atan2(-side, Math.abs(fwd) + 0.3), -0.85, 0.85)
        : 0;
    rig.hipYaw = Util.damp(rig.hipYaw || 0, strafeYaw, 8, dt);
    rig.hips.rotation.y = rig.hipYaw;

    // ---- 步伐：走越快擺動越快；往後退時腳的擺動方向相反 ----
    const back = fwd < -0.3 ? -1 : 1;
    rig.phase += dt * (3 + speed * 1.6) * (move > 0.05 ? 1 : 0);
    const swing = Math.sin(rig.phase) * move * 0.75 * back;
    rig.legL.rotation.x = swing + crouch * 0.95;
    rig.legR.rotation.x = -swing + crouch * 0.95;
    rig.shinL.rotation.x = -(
      Math.max(0, -Math.sin(rig.phase - 0.5 * back)) * move * 1.2 +
      crouch * 1.65
    );
    rig.shinR.rotation.x = -(
      Math.max(0, Math.sin(rig.phase - 0.5 * back)) * move * 1.2 +
      crouch * 1.65
    );

    // ---- 跳躍／落下：雙腿收起 ----
    rig.airT = Util.damp(rig.airT || 0, s.air ? 1 : 0, 10, dt);
    if (rig.airT > 0.01) {
      rig.legL.rotation.x = Util.lerp(rig.legL.rotation.x, 0.75, rig.airT);
      rig.legR.rotation.x = Util.lerp(rig.legR.rotation.x, -0.15, rig.airT);
      rig.shinL.rotation.x = Util.lerp(rig.shinL.rotation.x, -1.2, rig.airT);
      rig.shinR.rotation.x = Util.lerp(rig.shinR.rotation.x, -0.5, rig.airT);
    }

    // ---- 落地：剛著地的一瞬間膝蓋一彎、身體往下沉，接著彈回來 ----
    if (rig.wasAir && !s.air) rig.landT = 1;
    rig.wasAir = !!s.air;
    rig.landT = Math.max(0, (rig.landT || 0) - dt * 4.5);
    const land = rig.landT * rig.landT;
    if (land > 0.001) {
      rig.legL.rotation.x += land * 0.35;
      rig.legR.rotation.x += land * 0.35;
      rig.shinL.rotation.x -= land * 0.6;
      rig.shinR.rotation.x -= land * 0.6;
    }

    // ---- 骨盆高度：蹲下降低、走路時上下起伏、站著不動時輕微呼吸 ----
    const still = 1 - move;
    rig.hips.position.y =
      0.95 -
      crouch * 0.3 +
      Math.abs(Math.sin(rig.phase)) * 0.035 * move -
      land * 0.14;
    rig.hips.rotation.z = Math.sin(rig.t * 0.9 + rig.seed) * 0.02 * still; // 站著時重心慢慢左右換
    rig.torso.position.y =
      0.08 + Math.sin(rig.t * 2.2 + rig.seed) * 0.006 * still;

    // ---- 受擊：被打到時上半身往後一縮、頭往旁邊一甩 ----
    rig.hitT = Math.max(rig.hitT || 0, s.hit || 0);
    rig.hitT = Math.max(0, rig.hitT - dt * 5);
    if (s.hit > 0.9) rig.hitSide = Math.random() < 0.5 ? -1 : 1;

    // ---- 上半身：往前跑時前傾、後退時後仰、側移時往移動方向傾斜 ----
    rig.torso.rotation.x =
      -Util.clamp(fwd, -4, 6) * 0.025 - crouch * 0.18 + rig.hitT * 0.28;
    const roll = Math.sin(rig.phase) * 0.025 * move; // 跑步時上半身跟著步伐左右晃
    rig.torso.rotation.z =
      Util.clamp(-side, -5, 5) * 0.03 +
      rig.hitT * 0.12 * (rig.hitSide || 1) +
      roll;
    rig.torso.rotation.y = -rig.hipYaw + Math.sin(rig.phase) * 0.06 * move;

    // ---- 槍與手臂：跟著仰角瞄準、開槍後座、換彈時把槍放低轉一下 ----
    rig.recoil = Math.max(0, rig.recoil - dt * 9);
    const pitch = s.pitch || 0;
    const rl =
      s.reload > 0 ? Math.sin(Math.min(1, s.reload * 1.15) * Math.PI) : 0;
    rig.arms.rotation.x =
      pitch - rig.torso.rotation.x + rig.recoil * 0.07 - rl * 0.6;
    rig.arms.rotation.z = rl * 0.45;
    rig.arms.position.z = rig.recoil * 0.035;
    // 槍跟著呼吸與步伐微微起伏（0.44 是肩線原本的高度）
    rig.arms.position.y =
      0.44 +
      Math.sin(rig.t * 2.2 + rig.seed) * 0.004 * still +
      Math.abs(Math.sin(rig.phase)) * 0.012 * move;

    // ---- 頭：跟著瞄準抬頭低頭；沒有交戰目標時左右張望；身體晃動時頭保持水平 ----
    const scan = s.idle
      ? Math.sin(rig.t * 0.7 + rig.seed) * (0.38 * still + 0.14 * move)
      : 0;
    rig.headYaw = Util.damp(rig.headYaw || 0, scan, 4, dt);
    rig.head.rotation.x = pitch * 0.5 - rl * 0.35;
    rig.head.rotation.y = rig.headYaw;
    rig.head.rotation.z = rig.hitT * 0.3 * (rig.hitSide || 1) - roll;
  },

  /* ============================================================
   *  無人機
   * ============================================================ */
  drone(color = 0xff4a5e) {
    // 模型只在第一次需要時建立，之後都複製同一份。
    if (!this.protos.drone) {
      const root = new THREE.Group();
      const body = this._joint("body", root, 0, 0, 0);
      const b = new Builder();
      b.sphere(0.28, { c: 0x23262c, s: [1, 0.72, 1.15], seg: 18 }); // 機身
      b.torus(0.3, 0.025, { r: [Math.PI / 2, 0, 0], c: 0x14161a, seg: 24 });
      b.sphere(0.1, {
        p: [0, 0.02, -0.26],
        c: color,
        m: "glow",
        e: 2.6,
        seg: 12,
      }); // 主眼
      b.torus(0.115, 0.015, { p: [0, 0.02, -0.275], c: 0x14161a, seg: 16 });
      for (const sx of [-1, 1]) {
        b.rbox(0.09, 0.09, 0.3, 0.025, {
          p: [sx * 0.3, -0.08, -0.05],
          c: 0x2c3038,
        }); // 兩側武器艙
        b.cyl(0.018, 0.018, 0.2, {
          p: [sx * 0.3, -0.08, -0.28],
          r: [Math.PI / 2, 0, 0],
          c: 0x14161a,
          m: "metal",
          seg: 8,
        });
        b.box(0.092, 0.012, 0.2, {
          p: [sx * 0.3, -0.03, -0.05],
          c: color,
          m: "glow",
        });
        // 四根旋翼臂
        for (const sz of [-1, 1]) {
          b.limb(
            [sx * 0.2, 0.08, sz * 0.2],
            [sx * 0.46, 0.12, sz * 0.46],
            0.02,
            { c: 0x2c3038, flat: true },
          );
          b.cyl(0.04, 0.04, 0.05, {
            p: [sx * 0.46, 0.13, sz * 0.46],
            c: 0x14161a,
            seg: 10,
          });
          b.cyl(0.2, 0.2, 0.008, {
            p: [sx * 0.46, 0.165, sz * 0.46],
            c: 0x9fd8ff,
            m: "glass",
            seg: 16,
          }); // 轉動中的槳盤
        }
      }
      b.cone(0.07, 0.14, {
        p: [0, -0.24, 0],
        r: [Math.PI, 0, 0],
        c: color,
        m: "glow",
        e: 1.2,
        seg: 10,
      }); // 底部推進光
      // 機身上半的裝甲殼與接縫
      b.sphere(0.2, {
        p: [0, 0.07, 0.03],
        s: [1, 0.5, 1.15],
        c: 0x2c3038,
        seg: 14,
      });
      b.box(0.012, 0.03, 0.42, { p: [0, 0.165, 0.03], c: 0x14161a });
      // 主眼周圍的三顆輔助感測器
      for (const [sx, sy] of [
        [-0.13, 0.08],
        [0.13, 0.08],
        [0, -0.1],
      ]) {
        b.cyl(0.022, 0.022, 0.02, {
          p: [sx, 0.02 + sy, -0.29],
          r: [Math.PI / 2, 0, 0],
          c: 0x14161a,
          seg: 8,
        });
        b.cyl(0.012, 0.012, 0.024, {
          p: [sx, 0.02 + sy, -0.29],
          r: [Math.PI / 2, 0, 0],
          c: color,
          m: "glow",
          e: 1.6,
          seg: 6,
        });
      }
      // 機尾：垂直尾翼與警示燈、兩根天線
      b.box(0.014, 0.16, 0.14, {
        p: [0, 0.12, 0.3],
        r: [-0.3, 0, 0],
        c: 0x2c3038,
      });
      b.sphere(0.018, {
        p: [0, 0.2, 0.34],
        c: color,
        m: "glow",
        e: 2.4,
        seg: 6,
      });
      for (const sx of [-1, 1]) {
        b.cyl(0.003, 0.003, 0.2, {
          p: [sx * 0.1, 0.24, 0.16],
          r: [-0.3, 0, sx * 0.25],
          c: 0x14161a,
          seg: 5,
        });
      }
      // 機腹：兩道散熱鰭片與起落橇
      for (const sx of [-1, 1]) {
        b.box(0.02, 0.05, 0.22, { p: [sx * 0.12, -0.19, 0.02], c: 0x14161a });
        b.limb([sx * 0.2, -0.14, -0.14], [sx * 0.22, -0.26, -0.18], 0.012, {
          c: 0x2c3038,
          flat: true,
          seg: 6,
        });
        b.limb([sx * 0.2, -0.14, 0.14], [sx * 0.22, -0.26, 0.18], 0.012, {
          c: 0x2c3038,
          flat: true,
          seg: 6,
        });
        b.limb([sx * 0.22, -0.26, -0.2], [sx * 0.22, -0.26, 0.2], 0.014, {
          c: 0x14161a,
          flat: true,
          seg: 6,
        });
      }
      body.add(b.build());
      this._joint("muzzle", body, 0, -0.08, -0.4);
      this.protos.drone = root;
    }
    const rig = this._instance(this.protos.drone, ["body", "muzzle"], {
      metalness: 0.6,
      roughness: 0.4,
    });
    rig.kind = "drone";
    // 待機漂浮、移動傾斜、蓄力與死亡墜落的動作。
    rig.animate = (dt, s) => {
      this._updateFlash(rig, dt);
      rig.phase += dt;
      if (s.dead) {
        // 被擊落：旋轉墜地
        rig.deathT += dt;
        rig.body.position.y = Math.max(
          0.25,
          (s.hover || 2.3) - rig.deathT * rig.deathT * 9,
        );
        rig.body.rotation.z += dt * 7;
        rig.body.rotation.x += dt * 4;
        return;
      }
      rig.body.position.y = (s.hover || 2.3) + Math.sin(rig.phase * 2.2) * 0.12; // 上下飄浮
      rig.body.rotation.x =
        (s.pitch || 0) * 0.6 - Math.min(0.3, (s.speed || 0) * 0.05);
      rig.body.rotation.z = Math.sin(rig.phase * 1.3) * 0.06;
    };
    return rig;
  },

  /* ============================================================
   *  首領一：泰坦機甲
   *  同樣是雙足骨架，但零件全部換成厚重的裝甲與武器臂。
   * ============================================================ */
  titan(color = 0xff7a2a) {
    // 模型只在第一次需要時建立，之後都複製同一份。
    if (!this.protos.titan) {
      const HP = Math.PI / 2;
      const STEEL = 0x3a3f46,
        DARKS = 0x1b1d21,
        PLATE = 0x54483a,
        WARN = 0xc9a227;
      const J = this._joint;
      const root = new THREE.Group();
      const tilt = J("tilt", root, 0, 0, 0);
      const hips = J("hips", tilt, 0, 0.95, 0);

      let b = new Builder();
      b.rbox(0.5, 0.22, 0.36, 0.05, { c: DARKS }); // 骨盆
      b.cyl(0.09, 0.09, 0.62, { r: [0, 0, HP], c: STEEL, seg: 12 }); // 髖關節軸
      b.rbox(0.2, 0.16, 0.1, 0.03, { p: [0, -0.02, -0.2], c: PLATE });
      b.box(0.12, 0.02, 0.01, { p: [0, 0.0, -0.252], c: color, m: "glow" });
      hips.add(b.build());

      const torso = J("torso", hips, 0, 0.1, 0);
      b = new Builder();
      b.cyl(0.14, 0.18, 0.12, { p: [0, 0.03, 0], c: STEEL, seg: 14 }); // 腰部轉盤
      b.rbox(0.74, 0.5, 0.54, 0.08, { p: [0, 0.36, 0], c: PLATE }); // 駕駛艙
      b.rbox(0.5, 0.3, 0.1, 0.03, {
        p: [0, 0.4, -0.28],
        r: [0.25, 0, 0],
        c: DARKS,
      }); // 前斜裝甲
      b.sphere(0.11, {
        p: [0, 0.3, -0.27],
        c: color,
        m: "glow",
        e: 3,
        seg: 14,
      }); // 反應爐核心
      b.torus(0.13, 0.025, { p: [0, 0.3, -0.275], c: STEEL, seg: 16 });
      for (let i = 0; i < 4; i++)
        b.box(0.3, 0.02, 0.02, {
          p: [0, 0.5 - i * 0.03, -0.3 + i * 0.008],
          c: DARKS,
        }); // 散熱柵
      for (const sx of [-1, 1]) {
        // 肩部火箭艙：一個方盒加六個發射孔
        b.rbox(0.3, 0.28, 0.34, 0.04, { p: [sx * 0.54, 0.6, 0.02], c: STEEL });
        for (let i = 0; i < 6; i++) {
          b.cyl(0.035, 0.035, 0.02, {
            p: [
              sx * 0.54 - 0.08 + (i % 3) * 0.08,
              0.66 - Math.floor(i / 3) * 0.11,
              -0.155,
            ],
            r: [HP, 0, 0],
            c: color,
            m: "glow",
            e: 0.6,
            seg: 8,
          });
        }
        b.box(0.3, 0.03, 0.34, { p: [sx * 0.54, 0.47, 0.02], c: WARN }); // 黃黑警示帶
        b.cyl(0.05, 0.05, 0.3, { p: [sx * 0.2, 0.72, 0.24], c: DARKS, seg: 8 }); // 排氣管
        b.cyl(0.04, 0.04, 0.02, {
          p: [sx * 0.2, 0.88, 0.24],
          c: color,
          m: "glow",
          e: 1,
          seg: 8,
        });
      }
      b.rbox(0.5, 0.36, 0.2, 0.04, { p: [0, 0.4, 0.34], c: DARKS }); // 背部引擎
      for (let i = 0; i < 4; i++)
        b.box(0.4, 0.02, 0.02, { p: [0, 0.28 + i * 0.07, 0.445], c: STEEL }); // 引擎散熱片
      for (const sx of [-1, 1]) {
        b.cyl(0.07, 0.06, 0.05, {
          p: [sx * 0.14, 0.2, 0.36],
          c: STEEL,
          seg: 10,
        }); // 引擎下方的兩個噴口
        b.cyl(0.05, 0.05, 0.012, {
          p: [sx * 0.14, 0.172, 0.36],
          c: color,
          m: "glow",
          e: 1.4,
          seg: 10,
        });
        // 駕駛艙兩側的裝甲肋板與鉚釘
        b.rbox(0.04, 0.42, 0.36, 0.012, { p: [sx * 0.39, 0.36, 0], c: STEEL });
        for (const y of [0.22, 0.36, 0.5]) {
          b.cyl(0.016, 0.016, 0.012, {
            p: [sx * 0.413, y, -0.12],
            r: [0, 0, HP],
            c: DARKS,
            seg: 6,
          });
        }
        // 肩上的探照燈
        b.rbox(0.1, 0.08, 0.1, 0.02, { p: [sx * 0.3, 0.68, -0.2], c: DARKS });
        b.cyl(0.036, 0.036, 0.012, {
          p: [sx * 0.3, 0.68, -0.256],
          r: [HP, 0, 0],
          c: 0xfff2c4,
          m: "glow",
          e: 2.2,
          seg: 10,
        });
        // 連接身體與手臂的液壓管
        b.limb([sx * 0.36, 0.2, 0.12], [sx * 0.5, 0.42, 0.16], 0.022, {
          c: DARKS,
          flat: true,
          seg: 6,
        });
      }
      b.box(0.34, 0.07, 0.012, {
        p: [0, 0.515, -0.3],
        r: [0.25, 0, 0],
        c: 0x0c1218,
        m: "metal",
      }); // 前斜裝甲上的觀察窗
      b.box(0.5, 0.03, 0.012, { p: [0, 0.2, -0.275], c: WARN }); // 駕駛艙下緣的警示帶
      torso.add(b.build());

      const head = J("head", torso, 0, 0.62, -0.05);
      b = new Builder();
      b.rbox(0.24, 0.15, 0.24, 0.04, { p: [0, 0.08, 0], c: STEEL }); // 感測頭
      b.box(0.2, 0.03, 0.01, {
        p: [0, 0.09, -0.122],
        c: color,
        m: "glow",
        e: 3,
      });
      b.cyl(0.006, 0.006, 0.3, { p: [0.1, 0.3, 0.05], c: DARKS, seg: 6 });
      b.cyl(0.004, 0.004, 0.2, { p: [-0.09, 0.25, 0.07], c: DARKS, seg: 6 }); // 第二根天線
      b.sphere(0.012, {
        p: [0.1, 0.45, 0.05],
        c: color,
        m: "glow",
        e: 2,
        seg: 6,
      });
      for (const sx of [-1, 1]) {
        // 感測頭兩側的副鏡頭
        b.cyl(0.03, 0.03, 0.03, {
          p: [sx * 0.13, 0.08, -0.06],
          r: [0, 0, HP],
          c: DARKS,
          seg: 8,
        });
        b.cyl(0.018, 0.018, 0.012, {
          p: [sx * 0.09, 0.045, -0.122],
          r: [HP, 0, 0],
          c: color,
          m: "glow",
          e: 2,
          seg: 8,
        });
      }
      b.rbox(0.26, 0.03, 0.1, 0.01, { p: [0, 0.17, -0.09], c: DARKS }); // 感測頭上方的遮簷
      head.add(b.build());

      const arms = J("arms", torso, 0, 0.42, 0);
      b = new Builder();
      // 右臂：六管轉輪機砲
      b.rbox(0.2, 0.22, 0.4, 0.04, { p: [0.62, -0.12, -0.15], c: STEEL });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.022, 0.022, 0.6, {
          p: [0.62 + Math.cos(a) * 0.06, -0.12 + Math.sin(a) * 0.06, -0.62],
          r: [HP, 0, 0],
          c: DARKS,
          m: "metal",
          seg: 8,
        });
      }
      b.cyl(0.095, 0.095, 0.05, {
        p: [0.62, -0.12, -0.5],
        r: [HP, 0, 0],
        c: STEEL,
        seg: 14,
      });
      b.cyl(0.095, 0.095, 0.05, {
        p: [0.62, -0.12, -0.85],
        r: [HP, 0, 0],
        c: STEEL,
        seg: 14,
      });
      // 左臂：重型加農砲
      b.rbox(0.22, 0.24, 0.44, 0.04, { p: [-0.62, -0.12, -0.15], c: STEEL });
      b.cyl(0.08, 0.08, 0.55, {
        p: [-0.62, -0.12, -0.6],
        r: [HP, 0, 0],
        c: DARKS,
        m: "metal",
        seg: 14,
      });
      b.cyl(0.1, 0.1, 0.1, {
        p: [-0.62, -0.12, -0.86],
        r: [HP, 0, 0],
        c: STEEL,
        seg: 14,
      });
      b.cyl(0.06, 0.06, 0.02, {
        p: [-0.62, -0.12, -0.915],
        r: [HP, 0, 0],
        c: color,
        m: "glow",
        e: 1.5,
        seg: 12,
      });
      for (const sx of [-1, 1]) {
        b.limb([sx * 0.4, 0, 0], [sx * 0.62, -0.08, -0.05], 0.08, { c: DARKS }); // 上臂
        b.sphere(0.11, { p: [sx * 0.42, 0, 0], c: STEEL, seg: 10 }); // 肩關節球
        b.rbox(0.24, 0.05, 0.3, 0.015, {
          p: [sx * 0.62, 0.02, -0.15],
          c: PLATE,
        }); // 武器臂上方的裝甲蓋
        b.box(0.2, 0.012, 0.03, { p: [sx * 0.62, 0.05, -0.28], c: WARN });
      }
      // 機砲的彈鏈：從背後一路餵進右臂
      for (let i = 0; i < 6; i++) {
        b.box(0.05, 0.06, 0.03, {
          p: [0.5 + i * 0.02, -0.02 - i * 0.012, 0.3 - i * 0.07],
          r: [0.5, 0, 0],
          c: 0xb8963a,
        });
      }
      b.rbox(0.1, 0.12, 0.16, 0.02, { p: [-0.62, 0.05, 0.04], c: DARKS }); // 加農砲的彈匣
      arms.add(b.build());
      J("muzzle", arms, 0.62, -0.12, -0.95); // 機砲砲口
      J("muzzle2", arms, -0.62, -0.12, -0.95); // 加農砲砲口

      for (const side of ["L", "R"]) {
        const sx = side === "L" ? -1 : 1;
        const leg = J("leg" + side, hips, sx * 0.3, -0.03, 0);
        b = new Builder();
        b.rbox(0.22, 0.46, 0.26, 0.05, { p: [0, -0.2, 0], c: PLATE }); // 大腿裝甲
        b.limb([0, -0.05, 0.1], [0, -0.38, 0.12], 0.035, {
          c: STEEL,
          m: "metal",
          flat: true,
        }); // 液壓桿
        b.box(0.224, 0.03, 0.264, { p: [0, -0.08, 0], c: WARN });
        b.rbox(0.18, 0.3, 0.05, 0.015, { p: [0, -0.22, -0.15], c: STEEL }); // 大腿前方的加厚甲板
        b.box(0.06, 0.012, 0.012, {
          p: [0, -0.1, -0.178],
          c: color,
          m: "glow",
        });
        b.cyl(0.13, 0.13, 0.05, {
          p: [sx * 0.13, 0.0, 0],
          r: [0, 0, HP],
          c: STEEL,
          seg: 12,
        }); // 髖關節外蓋
        leg.add(b.build());
        const shin = J("shin" + side, leg, 0, -0.44, 0);
        b = new Builder();
        b.cyl(0.11, 0.11, 0.26, { r: [0, 0, HP], c: STEEL, seg: 12 }); // 膝關節
        b.rbox(0.2, 0.4, 0.24, 0.05, { p: [0, -0.2, 0], c: STEEL });
        b.rbox(0.16, 0.26, 0.06, 0.02, { p: [0, -0.18, -0.14], c: PLATE });
        b.box(0.05, 0.14, 0.01, { p: [0, -0.18, -0.172], c: color, m: "glow" });
        b.rbox(0.28, 0.1, 0.46, 0.03, { p: [0, -0.43, -0.06], c: DARKS }); // 腳掌
        for (const tx of [-0.09, 0, 0.09])
          b.rbox(0.07, 0.07, 0.14, 0.02, { p: [tx, -0.445, -0.32], c: STEEL }); // 腳趾
        b.rbox(0.16, 0.08, 0.1, 0.02, { p: [0, -0.44, 0.2], c: STEEL }); // 後跟的穩定爪
        b.limb([0, -0.06, 0.13], [0, -0.36, 0.15], 0.03, {
          c: STEEL,
          m: "metal",
          flat: true,
          seg: 8,
        }); // 小腿後方的液壓桿
        b.rbox(0.24, 0.12, 0.08, 0.02, { p: [0, 0.02, -0.13], c: PLATE }); // 護膝
        // 護膝的螺栓
        for (const bx of [-0.07, 0.07]) {
          b.cyl(0.014, 0.014, 0.012, {
            p: [bx, 0.02, -0.172],
            r: [HP, 0, 0],
            c: DARKS,
            seg: 6,
          });
        }
        shin.add(b.build());
      }
      this.protos.titan = root;
    }
    const rig = this._instance(
      this.protos.titan,
      [
        "tilt",
        "hips",
        "torso",
        "head",
        "arms",
        "muzzle",
        "muzzle2",
        "legL",
        "legR",
        "shinL",
        "shinR",
      ],
      { metalness: 0.7, roughness: 0.42 },
    );
    rig.kind = "titan";
    rig.animate = (dt, s) =>
      this._animateBiped(rig, dt, { ...s, speed: (s.speed || 0) * 0.8 });
    return rig;
  },

  /* ============================================================
   *  首領三：九頭蛇核心（懸浮球體 + 三圈旋轉光環）
   * ============================================================ */
  hydra(color = 0x4dfcff) {
    // 模型只在第一次需要時建立，之後都複製同一份。
    if (!this.protos.hydra) {
      const root = new THREE.Group();
      const body = this._joint("body", root, 0, 0, 0);
      let b = new Builder();
      b.sphere(1.0, { c: 0x23262c, seg: 28 }); // 核心球
      for (let i = 0; i < 3; i++) {
        // 球面上的裝甲接縫
        b.torus(1.005, 0.03, {
          r: [Math.PI / 2, 0, 0],
          p: [0, -0.5 + i * 0.5, 0],
          s: i === 1 ? 1 : 0.87,
          c: 0x0e0f12,
          seg: 32,
        });
      }
      b.sphere(0.4, { p: [0, 0, -0.74], c: color, m: "glow", e: 3, seg: 18 }); // 巨眼
      b.torus(0.46, 0.06, { p: [0, 0, -0.84], c: 0x14161a, seg: 24 });
      b.sphere(0.14, { p: [0, 0, -1.1], c: 0x050506, seg: 12 }); // 瞳孔
      for (let i = 0; i < 6; i++) {
        // 六根尖刺與發光尖端
        const a = (i / 6) * Math.PI * 2;
        b.cone(0.16, 0.7, {
          p: [Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.1],
          r: [0, 0, a - Math.PI / 2],
          c: 0x3a3f46,
          seg: 8,
        });
        b.sphere(0.07, {
          p: [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.1],
          c: color,
          m: "glow",
          e: 2.5,
          seg: 8,
        });
      }
      b.cone(0.4, 0.9, {
        p: [0, -1.3, 0],
        r: [Math.PI, 0, 0],
        c: color,
        m: "glow",
        e: 1.0,
        seg: 14,
      }); // 底部推進光
      for (let i = 0; i < 8; i++) {
        // 球面後半的八片裝甲與散熱縫
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * 0.86,
          py = Math.sin(a) * 0.86;
        b.rbox(0.34, 0.5, 0.08, 0.03, {
          p: [px, py, 0.5],
          r: [0, 0, a - Math.PI / 2],
          c: 0x2c3038,
        });
        b.box(0.2, 0.03, 0.02, {
          p: [px * 1.02, py * 1.02, 0.55],
          r: [0, 0, a - Math.PI / 2],
          c: color,
          m: "glow",
          e: 0.9,
        });
      }
      for (let i = 0; i < 5; i++) {
        // 巨眼上方的一排小眼
        const a = Math.PI * 0.3 + (i / 4) * Math.PI * 0.4;
        b.sphere(0.05, {
          p: [Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.78],
          c: color,
          m: "glow",
          e: 2.2,
          seg: 8,
        });
      }
      b.cyl(0.5, 0.36, 0.3, { p: [0, -1.02, 0], c: 0x14161a, seg: 16 }); // 推進器的外環
      b.sphere(0.22, { p: [0, 0, 1.0], s: [1, 1, 0.5], c: 0x3a3f46, seg: 12 }); // 背後的動力核心蓋
      body.add(b.build());

      // 三圈光環，各自是一個關節，動畫時分別旋轉
      for (let i = 0; i < 3; i++) {
        const ring = this._joint("ring" + i, body, 0, 0, 0);
        b = new Builder();
        const R = 1.5 + i * 0.22;
        b.torus(R, 0.045, { c: 0x2c3038, seg: 48 });
        for (let s = 0; s < 4; s++) {
          // 光環上的四段發光弧
          b.torus(R, 0.055, {
            r: [0, 0, s * (Math.PI / 2)],
            c: color,
            m: "glow",
            e: 2,
            seg: 10,
            arc: 0.5,
          });
        }
        ring.add(b.build());
      }
      this._joint("muzzle", body, 0, 0, -1.2);
      this.protos.hydra = root;
    }
    const rig = this._instance(
      this.protos.hydra,
      ["body", "muzzle", "ring0", "ring1", "ring2"],
      { metalness: 0.75, roughness: 0.35 },
    );
    rig.kind = "hydra";
    // 光環旋轉、核心浮動與死亡墜落的動作。
    rig.animate = (dt, s) => {
      this._updateFlash(rig, dt);
      rig.phase += dt;
      const spin = s.fast ? 3 : 1; // 進入後期階段時光環轉更快
      rig.ring0.rotation.x += dt * 0.9 * spin;
      rig.ring1.rotation.y += dt * 1.2 * spin;
      rig.ring2.rotation.x -= dt * 0.7 * spin;
      rig.ring2.rotation.z += dt * 0.5 * spin;
      if (s.dead) {
        // 死亡：下墜並縮小
        rig.deathT += dt;
        rig.body.position.y = Math.max(1, (s.hover || 2.6) - rig.deathT * 1.4);
        rig.body.scale.setScalar(Math.max(0.01, 1 - rig.deathT * 0.4));
        return;
      }
      rig.body.position.y = (s.hover || 2.6) + Math.sin(rig.phase * 1.4) * 0.2;
      rig.body.rotation.x = s.pitch || 0;
    };
    return rig;
  },
};
