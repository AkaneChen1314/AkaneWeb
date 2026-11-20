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
      vertexColors: true, roughness: 0.62, metalness: 0.12,
      map: wear.map, normalMap: wear.normalMap, ...matOpt,
    });
    mat.normalScale.set(0.3, 0.3);

    /* 輪廓光（Rim Light）：角色邊緣會發出一圈顏色（敵人紅、隊友藍），
     * 在暗的地圖上也能一眼看出人的輪廓。做法是在材質的著色器最後，
     * 依「表面法線與視線的夾角」加上一點顏色：越接近邊緣（夾角越大）越亮。 */
    const rim = { value: new THREE.Color(0, 0, 0) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = rim;
      shader.uniforms.uRimGain = CharModels.rimGain; // 整張地圖共用的強度（亮的地圖調弱）
      shader.fragmentShader = `uniform vec3 uRim;
uniform float uRimGain;
` + shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
         outgoingLight += uRim * uRimGain * (pow(rimF, 2.6) * 1.5 + 0.04);
         #include <opaque_fragment>`,
      );
    };
    mat.customProgramCacheKey = () => "rim-v1"; // 所有角色共用同一個著色器程式
    root.traverse((node) => {
      if (node.isMesh && node.userData.kind !== "glow" && node.userData.kind !== "glass") node.material = mat;
    });
    const rig = { root, mat, rim: rim.value, flashT: 0, phase: Math.random() * 6, deathT: 0, recoil: 0 };
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
    const rig = this._instance(
      this.protos[key],
      ["tilt", "hips", "torso", "head", "arms", "gun", "muzzle", "legL", "legR", "shinL", "shinR"]
    );
    rig.kind = "humanoid";
    rig.animate = (dt, s) => this._animateBiped(rig, dt, s);
    if (opt.scale) rig.root.scale.setScalar(opt.scale);
    return rig;
  },

  _buildHumanoid(look) {
    const k = look.bulk || 1; // 體型倍率
    const SUIT = look.suit, ARMOR = look.armor, ACC = look.accent;
    const SKIN = 0x9a735c, DARK = 0x15171b, BOOT = 0x101114;
    const part = (b) => b.build(); // 把建構器的零件合併成網格
    const J = this._joint;

    const root = new THREE.Group();
    const tilt = J("tilt", root, 0, 0, 0);
    const hips = J("hips", tilt, 0, 0.95, 0);

    /* ---- 骨盆與腰帶 ---- */
    let b = new Builder();
    b.rbox(0.34 * k, 0.18, 0.22 * k, 0.06, { c: SUIT });
    b.rbox(0.36 * k, 0.05, 0.24 * k, 0.012, { p: [0, 0.075, 0], c: DARK }); // 腰帶
    b.rbox(0.05, 0.04, 0.02, 0.006, { p: [0, 0.075, -0.125 * k], c: 0x8a9099 }); // 皮帶扣
    b.rbox(0.07, 0.11, 0.06, 0.012, { p: [0.19 * k, 0.01, 0.02], c: ARMOR }); // 右側腰包
    b.rbox(0.07, 0.11, 0.06, 0.012, { p: [-0.19 * k, 0.01, 0.02], c: ARMOR });
    b.rbox(0.16, 0.1, 0.06, 0.015, { p: [0, 0.02, 0.13 * k], c: ARMOR }); // 後腰包
    b.rbox(0.13, 0.11, 0.05, 0.02, { p: [0, -0.06, -0.1 * k], c: ARMOR }); // 護襠
    hips.add(part(b));

    /* ---- 上半身 ---- */
    const torso = J("torso", hips, 0, 0.08, 0);
    b = new Builder();
    b.rbox(0.34 * k, 0.22, 0.21 * k, 0.07, { p: [0, 0.08, 0], c: SUIT }); // 腹部
    b.rbox(0.43 * k, 0.36, 0.26 * k, 0.09, { p: [0, 0.31, 0], c: SUIT }); // 胸腔
    b.rbox(0.35 * k, 0.3, 0.06, 0.02, { p: [0, 0.3, -0.125 * k], c: ARMOR }); // 前護板
    b.rbox(0.35 * k, 0.32, 0.05, 0.02, { p: [0, 0.3, 0.125 * k], c: ARMOR }); // 後護板
    b.rbox(0.25 * k, 0.1, 0.03, 0.01, { p: [0, 0.39, -0.155 * k], c: DARK }); // 胸前魔鬼氈條
    for (let i = 0; i < 3; i++) { // 三個彈匣袋
      b.rbox(0.078, 0.12, 0.05, 0.012, { p: [-0.09 + i * 0.09, 0.2, -0.165 * k], c: DARK });
      b.box(0.08, 0.025, 0.052, { p: [-0.09 + i * 0.09, 0.25, -0.165 * k], c: ARMOR });
    }
    b.box(0.09, 0.022, 0.008, { p: [0.09, 0.41, -0.173 * k], c: ACC, m: "glow" }); // 胸前識別燈
    b.box(0.03, 0.022, 0.008, { p: [-0.11, 0.41, -0.173 * k], c: ACC, m: "glow" });
    for (const sx of [-1, 1]) { // 肩帶
      b.rbox(0.07, 0.05, 0.3 * k, 0.015, { p: [sx * 0.13 * k, 0.47, 0], c: ARMOR });
    }
    b.rbox(0.045, 0.09, 0.035, 0.008, { p: [-0.15 * k, 0.4, -0.15 * k], c: DARK }); // 肩掛無線電
    b.cyl(0.004, 0.004, 0.14, { p: [-0.16 * k, 0.5, -0.15 * k], c: DARK, seg: 6 });
    b.cyl(0.078, 0.09, 0.07, { p: [0, 0.5, 0], c: SUIT, seg: 12 }); // 領口
    if (look.pads) {
      for (const sx of [-1, 1]) { // 護肩
        b.rbox(0.16, 0.09, 0.19, 0.04, { p: [sx * 0.265 * k, 0.45, 0], r: [0, 0, sx * -0.25], c: ARMOR });
        b.box(0.1, 0.012, 0.192, { p: [sx * 0.275 * k, 0.48, 0], r: [0, 0, sx * -0.25], c: ACC, m: "glow", e: 1.2 });
      }
    }
    if (look.pack) {
      b.rbox(0.3 * k, 0.34, 0.15, 0.04, { p: [0, 0.3, 0.215 * k], c: ARMOR }); // 背包
      b.rbox(0.22 * k, 0.12, 0.05, 0.015, { p: [0, 0.22, 0.3 * k], c: DARK });
      b.rbox(0.08, 0.2, 0.08, 0.03, { p: [0.17 * k, 0.28, 0.22 * k], c: DARK }); // 側掛水壺
      b.cyl(0.005, 0.005, 0.3, { p: [-0.12 * k, 0.6, 0.24 * k], c: DARK, seg: 6 }); // 天線
      b.sphere(0.012, { p: [-0.12 * k, 0.75, 0.24 * k], c: ACC, m: "glow", seg: 6 });
      b.box(0.12, 0.015, 0.006, { p: [0, 0.4, 0.293 * k], c: ACC, m: "glow" });
    }
    if (look.helmet === "wraith") { // 首領：背後的能量翼
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32;
        b.box(0.03, 0.7, 0.015, { p: [Math.sin(a) * 0.38, 0.5 + Math.cos(a) * 0.2, 0.2], r: [0.5, 0, -a], c: 0x0c0d12 });
        b.box(
          0.012,
          0.5,
          0.012,
          { p: [Math.sin(a) * 0.42, 0.55 + Math.cos(a) * 0.24, 0.24], r: [0.5, 0, -a], c: ACC, m: "glow", e: 2 }
        );
      }
      b.sphere(0.07, { p: [0, 0.3, -0.14], c: ACC, m: "glow", e: 2.4, seg: 12 }); // 胸口核心
    }
    torso.add(part(b));

    /* ---- 頭與頭盔 ---- */
    const head = J("head", torso, 0, 0.56, 0);
    b = new Builder();
    b.cyl(0.05, 0.058, 0.09, { p: [0, 0.02, 0], c: SKIN, seg: 10 }); // 脖子
    b.sphere(0.1, { p: [0, 0.13, 0], s: [0.95, 1.1, 1.02], c: SKIN });
    this._helmet(b, look.helmet, ARMOR, SUIT, ACC, DARK);
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
    b.limb(shoulderR, elbowR, 0.062 * k, { c: SUIT });
    b.limb(elbowR, handR, 0.052 * k, { c: SUIT });
    b.limb(shoulderL, elbowL, 0.062 * k, { c: SUIT });
    b.limb(elbowL, handL, 0.052 * k, { c: SUIT });
    for (const [e, h] of [[elbowR, handR], [elbowL, handL]]) {
      b.sphere(0.066 * k, { p: e, c: ARMOR, seg: 10 }); // 護肘
      b.rbox(0.085, 0.085, 0.1, 0.03, { p: h, c: DARK }); // 手套
    }
    if (blades) { // 首領「幽影」：雙手的能量刃
      b.box(0.02, 0.05, 0.95, { p: [handR[0] + 0.05, handR[1], handR[2] - 0.5], c: ACC, m: "glow", e: 3 });
      b.box(0.02, 0.05, 0.95, { p: [handL[0] - 0.05, handL[1], handL[2] - 0.3], c: ACC, m: "glow", e: 3 });
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
      b.rbox(0.13 * k, 0.2, 0.04, 0.015, { p: [0, -0.2, -0.085 * k], c: ARMOR }); // 大腿護板
      if (side === "R") { // 右腿槍套
        b.rbox(0.045, 0.16, 0.1, 0.012, { p: [0.105 * k, -0.2, 0], c: DARK });
        b.rbox(0.03, 0.06, 0.05, 0.01, { p: [0.11 * k, -0.1, 0.03], c: 0x2c3038 });
      } else { // 左腿彈匣袋
        b.rbox(0.04, 0.12, 0.08, 0.01, { p: [-0.105 * k, -0.2, 0], c: DARK });
      }
      b.rbox(0.19 * k, 0.03, 0.19 * k, 0.01, { p: [0, -0.12, 0], c: DARK }); // 腿帶
      leg.add(part(b));

      const shin = J("shin" + side, leg, 0, -0.44, 0);
      b = new Builder();
      b.rbox(0.12 * k, 0.11, 0.07, 0.03, { p: [0, 0, -0.075 * k], c: ARMOR }); // 護膝
      b.limb([0, 0, 0], [0, -0.36, 0], 0.068 * k, { c: SUIT }); // 小腿
      b.rbox(0.095 * k, 0.24, 0.035, 0.012, { p: [0, -0.2, -0.066 * k], c: ARMOR }); // 護脛
      b.box(0.03, 0.1, 0.006, { p: [0, -0.2, -0.086 * k], c: ACC, m: "glow", e: 0.9 });
      b.rbox(0.115 * k, 0.13, 0.29, 0.04, { p: [0, -0.4, -0.05], c: BOOT }); // 靴子
      b.box(0.12 * k, 0.03, 0.3, { p: [0, -0.465, -0.05], c: 0x08090a }); // 鞋底
      b.rbox(0.118 * k, 0.05, 0.1, 0.015, { p: [0, -0.33, 0.02], c: DARK }); // 靴筒束帶
      shin.add(part(b));
    }
    return root;
  },

  // 四種頭盔（加上首領專用的 wraith）；零件座標以脖子底部為原點，臉朝 -Z
  _helmet(b, style, ARMOR, SUIT, ACC, DARK) {
    const HP = Math.PI / 2;
    if (style === "tactical") {
      b.sphere(0.12, { p: [0, 0.155, 0.006], s: [1, 0.88, 1.1], c: ARMOR }); // 盔體
      b.rbox(0.02, 0.03, 0.13, 0.006, { p: [0.116, 0.14, 0], c: DARK }); // 側導軌
      b.rbox(0.02, 0.03, 0.13, 0.006, { p: [-0.116, 0.14, 0], c: DARK });
      b.cyl(0.046, 0.046, 0.04, { p: [0.105, 0.105, 0.01], r: [0, 0, HP], c: DARK, seg: 12 }); // 耳機
      b.cyl(0.046, 0.046, 0.04, { p: [-0.105, 0.105, 0.01], r: [0, 0, HP], c: DARK, seg: 12 });
      b.rbox(0.18, 0.055, 0.045, 0.018, { p: [0, 0.135, -0.09], c: DARK }); // 護目鏡框
      b.box(0.155, 0.03, 0.01, { p: [0, 0.135, -0.115], c: ACC, m: "glow", e: 1.5 }); // 鏡片
      b.rbox(0.13, 0.075, 0.06, 0.02, { p: [0, 0.07, -0.07], c: DARK }); // 面罩
      b.rbox(0.05, 0.035, 0.05, 0.01, { p: [0, 0.225, -0.085], c: DARK }); // 夜視鏡座
      b.limb([-0.1, 0.09, -0.02], [-0.04, 0.06, -0.11], 0.005, { c: DARK, flat: true }); // 麥克風桿
    } else if (style === "visor") {
      b.sphere(0.128, { p: [0, 0.135, 0], s: [1, 1.06, 1.1], c: ARMOR }); // 全罩頭盔
      b.sphere(0.105, { p: [0, 0.135, -0.045], s: [0.95, 0.58, 1], c: ACC, m: "glow", e: 1.3 }); // 大片發光面罩
      b.rbox(0.14, 0.06, 0.08, 0.02, { p: [0, 0.055, -0.07], c: DARK }); // 下顎
      b.box(0.012, 0.09, 0.12, { p: [0.128, 0.14, 0.02], c: DARK }); // 側鰭
      b.box(0.012, 0.09, 0.12, { p: [-0.128, 0.14, 0.02], c: DARK });
      b.box(0.02, 0.03, 0.16, { p: [0, 0.265, 0.01], c: DARK }); // 頂鰭
      b.cyl(0.004, 0.004, 0.12, { p: [0.11, 0.26, 0.05], c: DARK, seg: 6 });
    } else if (style === "hood") {
      b.sphere(0.132, { p: [0, 0.14, 0.022], s: [1, 1.06, 1.1], c: SUIT, m: "paint" }); // 兜帽
      b.sphere(0.098, { p: [0, 0.125, -0.035], c: 0x0b0c0e }); // 帽內陰影面罩
      b.cyl(0.02, 0.02, 0.03, { p: [0.04, 0.14, -0.125], r: [HP, 0, 0], c: DARK, seg: 10 }); // 單眼鏡
      b.cyl(0.015, 0.015, 0.005, { p: [0.04, 0.14, -0.142], r: [HP, 0, 0], c: ACC, m: "glow", e: 3, seg: 10 });
      b.sphere(0.008, { p: [-0.035, 0.14, -0.128], c: ACC, m: "glow", e: 2, seg: 6 });
      b.torus(0.085, 0.035, { p: [0, 0.03, 0], r: [HP, 0, 0], c: SUIT, seg: 14 }); // 圍巾
    } else if (style === "heavy") {
      b.rbox(0.25, 0.25, 0.27, 0.06, { p: [0, 0.135, 0], c: ARMOR }); // 方形重盔
      b.box(0.17, 0.024, 0.01, { p: [0, 0.155, -0.137], c: ACC, m: "glow", e: 2 }); // 觀察縫
      b.rbox(0.19, 0.06, 0.03, 0.01, { p: [0, 0.2, -0.135], c: DARK }); // 眉甲
      b.cyl(0.03, 0.03, 0.06, { p: [0.055, 0.06, -0.135], r: [HP, 0, 0], c: DARK, seg: 10 }); // 濾毒罐
      b.cyl(0.03, 0.03, 0.06, { p: [-0.055, 0.06, -0.135], r: [HP, 0, 0], c: DARK, seg: 10 });
      b.rbox(0.03, 0.05, 0.22, 0.01, { p: [0, 0.27, 0], c: DARK }); // 盔頂稜線
      b.rbox(0.03, 0.16, 0.2, 0.01, { p: [0.13, 0.12, 0.01], c: DARK });
      b.rbox(0.03, 0.16, 0.2, 0.01, { p: [-0.13, 0.12, 0.01], c: DARK });
    } else if (style === "wraith") {
      b.sphere(0.125, { p: [0, 0.14, 0], s: [0.92, 1.15, 1.1], c: 0x0c0d12 }); // 尖長的頭
      for (const sx of [-1, 1]) { // 一對角
        b.cone(0.03, 0.26, { p: [sx * 0.09, 0.3, 0.03], r: [0.25, 0, sx * -0.35], c: 0x0c0d12, seg: 8 });
        b.cone(0.012, 0.1, { p: [sx * 0.135, 0.42, 0.06], r: [0.25, 0, sx * -0.35], c: ACC, m: "glow", e: 2.5, seg: 6 });
      }
      for (let i = 0; i < 3; i++) { // 六隻發光的眼
        b.sphere(
          0.014 - i * 0.003,
          { p: [0.03 + i * 0.022, 0.15 - i * 0.03, -0.118 + i * 0.012], c: ACC, m: "glow", e: 3.5, seg: 6 }
        );
        b.sphere(
          0.014 - i * 0.003,
          { p: [-0.03 - i * 0.022, 0.15 - i * 0.03, -0.118 + i * 0.012], c: ACC, m: "glow", e: 3.5, seg: 6 }
        );
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
   *   speed  水平速度（公尺／秒）   pitch  瞄準仰角
   *   crouch 蹲下程度 0~1           dead   是否已死亡
   */
  /* s（狀態）可包含：
   *   speed 水平速度   fwd / side 相對於面向的前進／右移速度（後退、往左是負的）
   *   pitch 瞄準仰角   crouch 蹲下程度   air 是否在空中   reload 換彈進度 0~1
   *   hit 受擊強度 0~1（剛被打到時是 1）   dead 是否死亡   deathDir 倒下的方向 */
  _animateBiped(rig, dt, s) {
    this._updateFlash(rig, dt);

    // ---- 死亡：先膝蓋一軟往下沉，再依中彈方向倒下（往後、往前或往側邊），落地時輕輕彈一下 ----
    if (s.dead) {
      rig.deathT += dt;
      const d = s.deathDir || { x: 1, z: 0 };
      const buckle = Util.smooth(rig.deathT / 0.2); // 前 0.2 秒：膝蓋彎曲、身體下沉
      const fall = Util.smooth((rig.deathT - 0.12) / 0.5); // 接著倒下
      const bounce = rig.deathT > 0.62 ? Math.sin(Math.min(1, (rig.deathT - 0.62) / 0.25) * Math.PI) * 0.06 : 0;
      rig.tilt.rotation.x = fall * (Math.PI / 2 - 0.1) * d.x - bounce * d.x;
      rig.tilt.rotation.z = fall * (Math.PI / 2 - 0.1) * d.z - bounce * d.z;
      rig.tilt.position.y = fall * 0.16;
      rig.hips.position.y = 0.95 - buckle * 0.25 * (1 - fall);
      rig.legL.rotation.x = Util.lerp(rig.legL.rotation.x, 0.5 * buckle - 0.2 * fall, 0.2);
      rig.legR.rotation.x = Util.lerp(rig.legR.rotation.x, 0.2 * buckle, 0.2);
      rig.shinL.rotation.x = Util.lerp(rig.shinL.rotation.x, -0.9 * buckle * (1 - fall * 0.7), 0.2);
      rig.shinR.rotation.x = Util.lerp(rig.shinR.rotation.x, -0.6 * buckle, 0.2);
      rig.arms.rotation.x = Util.lerp(rig.arms.rotation.x, 0.9 * d.x + 0.5, fall);
      rig.arms.rotation.z = Util.lerp(rig.arms.rotation.z, 0.6 * d.z, fall);
      rig.head.rotation.x = Util.lerp(rig.head.rotation.x, -0.4 * d.x, fall);
      return;
    }

    const speed = s.speed || 0;
    const fwd = s.fwd ?? speed;
    const side = s.side || 0;
    const crouch = s.crouch || 0;
    const move = Math.min(1, speed / 4); // 0 靜止 ～ 1 全速
    rig.t = (rig.t || 0) + dt;

    // ---- 側移：骨盆轉向移動方向、上半身轉回來繼續面對前方（像真人一樣邊走邊瞄準） ----
    const strafeYaw = speed > 0.4 ? Util.clamp(Math.atan2(-side, Math.abs(fwd) + 0.3), -0.85, 0.85) : 0;
    rig.hipYaw = Util.damp(rig.hipYaw || 0, strafeYaw, 8, dt);
    rig.hips.rotation.y = rig.hipYaw;

    // ---- 步伐：走越快擺動越快；往後退時腳的擺動方向相反 ----
    const back = fwd < -0.3 ? -1 : 1;
    rig.phase += dt * (3 + speed * 1.6) * (move > 0.05 ? 1 : 0);
    const swing = Math.sin(rig.phase) * move * 0.75 * back;
    rig.legL.rotation.x = swing + crouch * 0.95;
    rig.legR.rotation.x = -swing + crouch * 0.95;
    rig.shinL.rotation.x = -(Math.max(0, -Math.sin(rig.phase - 0.5 * back)) * move * 1.2 + crouch * 1.65);
    rig.shinR.rotation.x = -(Math.max(0, Math.sin(rig.phase - 0.5 * back)) * move * 1.2 + crouch * 1.65);

    // ---- 跳躍／落下：雙腿收起 ----
    rig.airT = Util.damp(rig.airT || 0, s.air ? 1 : 0, 10, dt);
    if (rig.airT > 0.01) {
      rig.legL.rotation.x = Util.lerp(rig.legL.rotation.x, 0.75, rig.airT);
      rig.legR.rotation.x = Util.lerp(rig.legR.rotation.x, -0.15, rig.airT);
      rig.shinL.rotation.x = Util.lerp(rig.shinL.rotation.x, -1.2, rig.airT);
      rig.shinR.rotation.x = Util.lerp(rig.shinR.rotation.x, -0.5, rig.airT);
    }

    // ---- 骨盆高度：蹲下降低、走路時上下起伏、站著不動時輕微呼吸 ----
    rig.hips.position.y = 0.95 - crouch * 0.3 + Math.abs(Math.sin(rig.phase)) * 0.035 * move;
    rig.torso.position.y = 0.08 + Math.sin(rig.t * 2.2 + rig.phase) * 0.006 * (1 - move);

    // ---- 受擊：被打到時上半身往後一縮、頭往旁邊一甩 ----
    rig.hitT = Math.max(rig.hitT || 0, s.hit || 0);
    rig.hitT = Math.max(0, rig.hitT - dt * 5);
    if (s.hit > 0.9) rig.hitSide = Math.random() < 0.5 ? -1 : 1;

    // ---- 上半身：往前跑時前傾、後退時後仰、側移時往移動方向傾斜 ----
    rig.torso.rotation.x = -Util.clamp(fwd, -4, 6) * 0.025 - crouch * 0.18 + rig.hitT * 0.28;
    rig.torso.rotation.z = Util.clamp(-side, -5, 5) * 0.03 + rig.hitT * 0.12 * (rig.hitSide || 1);
    rig.torso.rotation.y = -rig.hipYaw + Math.sin(rig.phase) * 0.06 * move;

    // ---- 槍與手臂：跟著仰角瞄準、開槍後座、換彈時把槍放低轉一下 ----
    rig.recoil = Math.max(0, rig.recoil - dt * 9);
    const pitch = s.pitch || 0;
    const rl = s.reload > 0 ? Math.sin(Math.min(1, s.reload * 1.15) * Math.PI) : 0;
    rig.arms.rotation.x = pitch - rig.torso.rotation.x + rig.recoil * 0.07 - rl * 0.6;
    rig.arms.rotation.z = rl * 0.45;
    rig.arms.position.z = rig.recoil * 0.035;
    rig.head.rotation.x = pitch * 0.5 - rl * 0.35;
    rig.head.rotation.z = rig.hitT * 0.3 * (rig.hitSide || 1);
  },

  /* ============================================================
   *  無人機
   * ============================================================ */
  drone(color = 0xff4a5e) {
    if (!this.protos.drone) {
      const root = new THREE.Group();
      const body = this._joint("body", root, 0, 0, 0);
      const b = new Builder();
      b.sphere(0.28, { c: 0x23262c, s: [1, 0.72, 1.15], seg: 18 }); // 機身
      b.torus(0.3, 0.025, { r: [Math.PI / 2, 0, 0], c: 0x14161a, seg: 24 });
      b.sphere(0.1, { p: [0, 0.02, -0.26], c: color, m: "glow", e: 2.6, seg: 12 }); // 主眼
      b.torus(0.115, 0.015, { p: [0, 0.02, -0.275], c: 0x14161a, seg: 16 });
      for (const sx of [-1, 1]) {
        b.rbox(0.09, 0.09, 0.3, 0.025, { p: [sx * 0.3, -0.08, -0.05], c: 0x2c3038 }); // 兩側武器艙
        b.cyl(0.018, 0.018, 0.2, { p: [sx * 0.3, -0.08, -0.28], r: [Math.PI / 2, 0, 0], c: 0x14161a, m: "metal", seg: 8 });
        b.box(0.092, 0.012, 0.2, { p: [sx * 0.3, -0.03, -0.05], c: color, m: "glow" });
        // 四根旋翼臂
        for (const sz of [-1, 1]) {
          b.limb([sx * 0.2, 0.08, sz * 0.2], [sx * 0.46, 0.12, sz * 0.46], 0.02, { c: 0x2c3038, flat: true });
          b.cyl(0.04, 0.04, 0.05, { p: [sx * 0.46, 0.13, sz * 0.46], c: 0x14161a, seg: 10 });
          b.cyl(0.2, 0.2, 0.008, { p: [sx * 0.46, 0.165, sz * 0.46], c: 0x9fd8ff, m: "glass", seg: 16 }); // 轉動中的槳盤
        }
      }
      b.cone(0.07, 0.14, { p: [0, -0.24, 0], r: [Math.PI, 0, 0], c: color, m: "glow", e: 1.2, seg: 10 }); // 底部推進光
      body.add(b.build());
      this._joint("muzzle", body, 0, -0.08, -0.4);
      this.protos.drone = root;
    }
    const rig = this._instance(this.protos.drone, ["body", "muzzle"], { metalness: 0.6, roughness: 0.4 });
    rig.kind = "drone";
    rig.animate = (dt, s) => {
      this._updateFlash(rig, dt);
      rig.phase += dt;
      if (s.dead) { // 被擊落：旋轉墜地
        rig.deathT += dt;
        rig.body.position.y = Math.max(0.25, (s.hover || 2.3) - rig.deathT * rig.deathT * 9);
        rig.body.rotation.z += dt * 7;
        rig.body.rotation.x += dt * 4;
        return;
      }
      rig.body.position.y = (s.hover || 2.3) + Math.sin(rig.phase * 2.2) * 0.12; // 上下飄浮
      rig.body.rotation.x = (s.pitch || 0) * 0.6 - Math.min(0.3, (s.speed || 0) * 0.05);
      rig.body.rotation.z = Math.sin(rig.phase * 1.3) * 0.06;
    };
    return rig;
  },

  /* ============================================================
   *  首領一：泰坦機甲
   *  同樣是雙足骨架，但零件全部換成厚重的裝甲與武器臂。
   * ============================================================ */
  titan(color = 0xff7a2a) {
    if (!this.protos.titan) {
      const HP = Math.PI / 2;
      const STEEL = 0x3a3f46, DARKS = 0x1b1d21, PLATE = 0x54483a, WARN = 0xc9a227;
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
      b.rbox(0.5, 0.3, 0.1, 0.03, { p: [0, 0.4, -0.28], r: [0.25, 0, 0], c: DARKS }); // 前斜裝甲
      b.sphere(0.11, { p: [0, 0.3, -0.27], c: color, m: "glow", e: 3, seg: 14 }); // 反應爐核心
      b.torus(0.13, 0.025, { p: [0, 0.3, -0.275], c: STEEL, seg: 16 });
      for (let i = 0; i < 4; i++) b.box(0.3, 0.02, 0.02, { p: [0, 0.5 - i * 0.03, -0.3 + i * 0.008], c: DARKS }); // 散熱柵
      for (const sx of [-1, 1]) {
        // 肩部火箭艙：一個方盒加六個發射孔
        b.rbox(0.3, 0.28, 0.34, 0.04, { p: [sx * 0.54, 0.6, 0.02], c: STEEL });
        for (let i = 0; i < 6; i++) {
          b.cyl(
            0.035,
            0.035,
            0.02,
            {
              p: [sx * 0.54 - 0.08 + (i % 3) * 0.08, 0.66 - Math.floor(i / 3) * 0.11, -0.155],
              r: [HP, 0, 0],
              c: color,
              m: "glow",
              e: 0.6,
              seg: 8
            }
          );
        }
        b.box(0.3, 0.03, 0.34, { p: [sx * 0.54, 0.47, 0.02], c: WARN }); // 黃黑警示帶
        b.cyl(0.05, 0.05, 0.3, { p: [sx * 0.2, 0.72, 0.24], c: DARKS, seg: 8 }); // 排氣管
        b.cyl(0.04, 0.04, 0.02, { p: [sx * 0.2, 0.88, 0.24], c: color, m: "glow", e: 1, seg: 8 });
      }
      b.rbox(0.5, 0.36, 0.2, 0.04, { p: [0, 0.4, 0.34], c: DARKS }); // 背部引擎
      torso.add(b.build());

      const head = J("head", torso, 0, 0.62, -0.05);
      b = new Builder();
      b.rbox(0.24, 0.15, 0.24, 0.04, { p: [0, 0.08, 0], c: STEEL }); // 感測頭
      b.box(0.2, 0.03, 0.01, { p: [0, 0.09, -0.122], c: color, m: "glow", e: 3 });
      b.cyl(0.006, 0.006, 0.3, { p: [0.1, 0.3, 0.05], c: DARKS, seg: 6 });
      head.add(b.build());

      const arms = J("arms", torso, 0, 0.42, 0);
      b = new Builder();
      // 右臂：六管轉輪機砲
      b.rbox(0.2, 0.22, 0.4, 0.04, { p: [0.62, -0.12, -0.15], c: STEEL });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(
          0.022,
          0.022,
          0.6,
          { p: [0.62 + Math.cos(a) * 0.06, -0.12 + Math.sin(a) * 0.06, -0.62], r: [HP, 0, 0], c: DARKS, m: "metal", seg: 8 }
        );
      }
      b.cyl(0.095, 0.095, 0.05, { p: [0.62, -0.12, -0.5], r: [HP, 0, 0], c: STEEL, seg: 14 });
      b.cyl(0.095, 0.095, 0.05, { p: [0.62, -0.12, -0.85], r: [HP, 0, 0], c: STEEL, seg: 14 });
      // 左臂：重型加農砲
      b.rbox(0.22, 0.24, 0.44, 0.04, { p: [-0.62, -0.12, -0.15], c: STEEL });
      b.cyl(0.08, 0.08, 0.55, { p: [-0.62, -0.12, -0.6], r: [HP, 0, 0], c: DARKS, m: "metal", seg: 14 });
      b.cyl(0.1, 0.1, 0.1, { p: [-0.62, -0.12, -0.86], r: [HP, 0, 0], c: STEEL, seg: 14 });
      b.cyl(0.06, 0.06, 0.02, { p: [-0.62, -0.12, -0.915], r: [HP, 0, 0], c: color, m: "glow", e: 1.5, seg: 12 });
      for (const sx of [-1, 1]) b.limb([sx * 0.4, 0, 0], [sx * 0.62, -0.08, -0.05], 0.08, { c: DARKS }); // 上臂
      arms.add(b.build());
      J("muzzle", arms, 0.62, -0.12, -0.95); // 機砲砲口
      J("muzzle2", arms, -0.62, -0.12, -0.95); // 加農砲砲口

      for (const side of ["L", "R"]) {
        const sx = side === "L" ? -1 : 1;
        const leg = J("leg" + side, hips, sx * 0.3, -0.03, 0);
        b = new Builder();
        b.rbox(0.22, 0.46, 0.26, 0.05, { p: [0, -0.2, 0], c: PLATE }); // 大腿裝甲
        b.limb([0, -0.05, 0.1], [0, -0.38, 0.12], 0.035, { c: STEEL, m: "metal", flat: true }); // 液壓桿
        b.box(0.224, 0.03, 0.264, { p: [0, -0.08, 0], c: WARN });
        leg.add(b.build());
        const shin = J("shin" + side, leg, 0, -0.44, 0);
        b = new Builder();
        b.cyl(0.11, 0.11, 0.26, { r: [0, 0, HP], c: STEEL, seg: 12 }); // 膝關節
        b.rbox(0.2, 0.4, 0.24, 0.05, { p: [0, -0.2, 0], c: STEEL });
        b.rbox(0.16, 0.26, 0.06, 0.02, { p: [0, -0.18, -0.14], c: PLATE });
        b.box(0.05, 0.14, 0.01, { p: [0, -0.18, -0.172], c: color, m: "glow" });
        b.rbox(0.28, 0.1, 0.46, 0.03, { p: [0, -0.43, -0.06], c: DARKS }); // 腳掌
        for (const tx of [-0.09, 0, 0.09]) b.rbox(0.07, 0.07, 0.14, 0.02, { p: [tx, -0.445, -0.32], c: STEEL }); // 腳趾
        shin.add(b.build());
      }
      this.protos.titan = root;
    }
    const rig = this._instance(
      this.protos.titan,
      ["tilt", "hips", "torso", "head", "arms", "muzzle", "muzzle2", "legL", "legR", "shinL", "shinR"],
      { metalness: 0.7, roughness: 0.42 }
    );
    rig.kind = "titan";
    rig.animate = (dt, s) => this._animateBiped(rig, dt, { ...s, speed: (s.speed || 0) * 0.8 });
    return rig;
  },

  /* ============================================================
   *  首領三：九頭蛇核心（懸浮球體 + 三圈旋轉光環）
   * ============================================================ */
  hydra(color = 0x4dfcff) {
    if (!this.protos.hydra) {
      const root = new THREE.Group();
      const body = this._joint("body", root, 0, 0, 0);
      let b = new Builder();
      b.sphere(1.0, { c: 0x23262c, seg: 28 }); // 核心球
      for (let i = 0; i < 3; i++) { // 球面上的裝甲接縫
        b.torus(
          1.005,
          0.03,
          { r: [Math.PI / 2, 0, 0], p: [0, -0.5 + i * 0.5, 0], s: i === 1 ? 1 : 0.87, c: 0x0e0f12, seg: 32 }
        );
      }
      b.sphere(0.4, { p: [0, 0, -0.74], c: color, m: "glow", e: 3, seg: 18 }); // 巨眼
      b.torus(0.46, 0.06, { p: [0, 0, -0.84], c: 0x14161a, seg: 24 });
      b.sphere(0.14, { p: [0, 0, -1.1], c: 0x050506, seg: 12 }); // 瞳孔
      for (let i = 0; i < 6; i++) { // 六根尖刺與發光尖端
        const a = (i / 6) * Math.PI * 2;
        b.cone(
          0.16,
          0.7,
          { p: [Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.1], r: [0, 0, a - Math.PI / 2], c: 0x3a3f46, seg: 8 }
        );
        b.sphere(0.07, { p: [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.1], c: color, m: "glow", e: 2.5, seg: 8 });
      }
      b.cone(0.4, 0.9, { p: [0, -1.3, 0], r: [Math.PI, 0, 0], c: color, m: "glow", e: 1.0, seg: 14 }); // 底部推進光
      body.add(b.build());

      // 三圈光環，各自是一個關節，動畫時分別旋轉
      for (let i = 0; i < 3; i++) {
        const ring = this._joint("ring" + i, body, 0, 0, 0);
        b = new Builder();
        const R = 1.5 + i * 0.22;
        b.torus(R, 0.045, { c: 0x2c3038, seg: 48 });
        for (let s = 0; s < 4; s++) { // 光環上的四段發光弧
          b.torus(R, 0.055, { r: [0, 0, s * (Math.PI / 2)], c: color, m: "glow", e: 2, seg: 10, arc: 0.5 });
        }
        ring.add(b.build());
      }
      this._joint("muzzle", body, 0, 0, -1.2);
      this.protos.hydra = root;
    }
    const rig = this._instance(
      this.protos.hydra,
      ["body", "muzzle", "ring0", "ring1", "ring2"],
      { metalness: 0.75, roughness: 0.35 }
    );
    rig.kind = "hydra";
    rig.animate = (dt, s) => {
      this._updateFlash(rig, dt);
      rig.phase += dt;
      const spin = s.fast ? 3 : 1; // 進入後期階段時光環轉更快
      rig.ring0.rotation.x += dt * 0.9 * spin;
      rig.ring1.rotation.y += dt * 1.2 * spin;
      rig.ring2.rotation.x -= dt * 0.7 * spin;
      rig.ring2.rotation.z += dt * 0.5 * spin;
      if (s.dead) { // 死亡：下墜並縮小
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
