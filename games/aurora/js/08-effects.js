/*
 * ============================================================
 *  08-effects.js ── 繪圖核心與視覺特效
 * ------------------------------------------------------------
 *    Scene3D  繪圖核心：渲染器、場景、攝影機、天空、燈光，
 *             以及讓畫面「發光」的後製流程（泛光 Bloom + 色調映射）。
 *    FX       戰鬥特效：粒子、曳光彈、彈孔、彈殼、爆炸、光束、
 *             地面預警圈、天氣（雨／雪／沙塵）與畫面震動。
 *
 *  後製流程（每一幀）：
 *    1. 把場景畫到一張「高動態範圍」的暫存畫面（亮度可以超過 1）
 *    2. 把第一人稱的槍另外畫上去（先清掉深度，槍才不會插進牆裡）
 *    3. 取出很亮的部分，逐層縮小模糊，再逐層放大疊回去 → 泛光
 *    4. 合成：原畫面 + 泛光 → 色調映射 → 暗角、受傷紅邊、顆粒 → 螢幕
 * ============================================================
 */

const Scene3D = {
  renderer: null,
  scene: null, // 主場景（地圖、角色、特效）
  camera: null, // 主攝影機（玩家的眼睛）
  weaponScene: null, // 只放第一人稱槍與手臂的場景
  weaponCamera: null,
  sky: null, // 天空球
  sun: null, // 主光源（太陽或月亮，會投射陰影）
  hemi: null, // 環境光（天空色 + 地面反光色）
  sunDir: new THREE.Vector3(0.4, 0.7, 0.3),
  quality: "high",
  time: 0,

  // 後製參數（HUD 與玩家狀態會修改它們）
  post: { bloom: 0.85, exposure: 1.0, hurt: 0, desat: 0, flash: 0, aberration: 0.0035, vignette: 0.5 },

  QUALITY: {
    high: { label: "精緻", msaa: 4, shadow: 4096, ratio: 1.5, bloomLevels: 5 }, // 陰影蓋住整張地圖，所以解析度要高一點
    medium: { label: "均衡", msaa: 2, shadow: 1024, ratio: 1.0, bloomLevels: 4 },
    low: { label: "流暢", msaa: 0, shadow: 0, ratio: 0.8, bloomLevels: 3 },
  },

  /* ---------- 初始化 ---------- */
  init(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.15, 800) // 近平面 0.15：深度精準度加倍，遠處的面比較不會閃;
    this.camera.rotation.order = "YXZ"; // 先左右轉、再上下看
    this.scene.add(this.camera);

    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    // 槍的打光：固定在畫面空間，一盞主光 + 一盞補光 + 環境光
    this.weaponHemi = new THREE.HemisphereLight(0xffffff, 0x555577, 1.7);
    this.weaponKey = new THREE.DirectionalLight(0xffffff, 2.4);
    this.weaponKey.position.set(-1.2, 2.2, 1.5);
    this.weaponFlash = new THREE.PointLight(0xffc266, 0, 4, 2); // 槍口火光
    this.weaponFlash.position.set(0.2, -0.1, -1.0);
    this.weaponScene.add(this.weaponHemi, this.weaponKey, this.weaponFlash);

    // 世界燈光
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // 兩道不投影的彩色側逆光：一冷一暖從不同方向打過來，
    // 讓角色與建築的邊緣更立體、在暗處也看得清楚輪廓
    this.rimA = new THREE.DirectionalLight(0x4fd8ff, 1);
    this.rimA.position.set(-0.6, 0.45, -0.65);
    this.rimB = new THREE.DirectionalLight(0xff8a3c, 0.6);
    this.rimB.position.set(0.7, 0.3, 0.6);
    this.scene.add(this.rimA, this.rimB);
    // 選單展示幹員用的補光（對戰中亮度為 0；一直留在場景裡可避免著色器重新編譯）
    this.showLight = new THREE.PointLight(0xffffff, 0, 14, 1.6);
    this.scene.add(this.showLight);

    this._buildSky();
    this._buildPost();
    this.setQuality(Util.load("quality", "high"));
    window.addEventListener("resize", () => this.resize());
  },

  /* ---------- 畫質 ---------- */
  setQuality(name) {
    if (!this.QUALITY[name]) name = "high";
    this.quality = name;
    const q = this.QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow > 0) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      this.setShadowArea(this.shadowHalf || 50);
    }
    // 陰影開關會改變材質的著色器，全部標記為需要重新編譯
    this.scene.traverse((n) => { if (n.material) n.material.needsUpdate = true; });
    this.resize();
    Util.save("quality", name);
  },

  /* 陰影範圍：固定蓋住整張地圖（half 是地圖半寬）。
   * 以前陰影範圍會跟著攝影機移動，每移動一段距離陰影就跳一下，看起來像畫面在閃；
   * 現在固定不動，就不會再閃。 */
  setShadowArea(half) {
    this.shadowHalf = half;
    const r = half + 6;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 1;
    cam.far = 320;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.set(this.sunDir.x * 150, this.sunDir.y * 150, this.sunDir.z * 150);
    this.sun.target.updateMatrixWorld();
  },

  resize() {
    // 視窗搬到不同縮放比例的螢幕時，解析度也要跟著更新
    this.dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(this.dpr, this.QUALITY[this.quality].ratio));
    // 視窗被縮到最小時寬高會是 0；至少保留 1 像素，避免除以零與無效的畫面緩衝區
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.weaponCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.updateProjectionMatrix();
    this._resizePost();
  },

  /* ============================================================
   *  天空：一顆包住整個場景的大球，顏色由著色器即時計算
   * ============================================================ */
  _buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunDisc: { value: 1 },
      uStars: { value: 0 }, uAurora: { value: 0 }, uPlanet: { value: 0 }, uTime: { value: 0 },
      // 每張地圖的特殊天空效果（0 = 關閉）
      uCity: { value: 0 }, uDoom: { value: 0 }, uWater: { value: 0 }, uNebula: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor;
        uniform float uSunDisc, uStars, uAurora, uPlanet, uTime;
        uniform float uCity, uDoom, uWater, uNebula;
        varying vec3 vDir;

        // 簡單的雜訊函式（星星閃爍、極光飄動用）
        float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
        }
        // 多層雜訊（雲、星雲用）
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;

          // 垂直漸層：地平線 → 天頂；地平線以下漸漸變成底色
          vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.5));
          col = mix(col, uBottom, smoothstep(0.0, -0.25, h));

          // 太陽／月亮：一個亮點加上周圍的光暈
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 9.0 + pow(s, 24.0) * 0.3) * uSunDisc;

          // 星星：把方向切成小格，每格有很小的機率出現一顆
          if (uStars > 0.0 && h > 0.0) {
            vec3 g = floor(d * 240.0);
            float star = step(0.9972, hash3(g));
            float twinkle = 0.6 + 0.4 * sin(uTime * 2.5 + hash3(g + 3.0) * 40.0);
            col += star * twinkle * uStars * smoothstep(0.0, 0.25, h) * vec3(0.9, 0.95, 1.0);
          }

          // 極光：在天空中飄動的綠紫色光帶
          if (uAurora > 0.0 && h > 0.04) {
            vec2 p = d.xz / (h + 0.3);
            float band = sin(p.x * 2.4 + noise(p * 1.4 + uTime * 0.04) * 5.0 + uTime * 0.12);
            float mask = smoothstep(0.35, 1.0, band) * smoothstep(0.04, 0.3, h) * (1.0 - smoothstep(0.55, 0.95, h));
            float curtain = 0.5 + 0.5 * noise(vec2(p.x * 14.0 + uTime * 0.3, p.y * 2.0)); // 垂直條紋
            vec3 ac = mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.25, 1.0), noise(p * 0.6 + 7.0));
            col += ac * mask * curtain * uAurora * 0.9;
          }

          // 行星：畫在固定方向上的一顆有明暗的大球與光環
          if (uPlanet > 0.0) {
            vec3 pc = normalize(vec3(-0.55, 0.38, -0.74));
            float ang = acos(clamp(dot(d, pc), -1.0, 1.0));
            float R = 0.34;
            if (ang < R) {
              vec3 n = normalize(d - pc * cos(R));           // 近似的球面法線
              float light = clamp(dot(n, normalize(uSunDir)) * 1.6 + 0.35, 0.03, 1.0);
              float bands = noise(vec2(d.y * 38.0, d.x * 3.0)) * 0.5 + 0.5; // 氣體行星的條紋
              vec3 pcol = mix(vec3(0.75, 0.42, 0.25), vec3(0.95, 0.8, 0.6), bands);
              col = pcol * light * 0.7;
              col += vec3(0.4, 0.6, 1.0) * pow(ang / R, 6.0) * 0.5;  // 大氣邊緣光
            }
            // 行星環：一條斜的細帶
            vec3 up = normalize(vec3(0.25, 1.0, 0.1));
            float ringH = abs(dot(d - pc, up));
            float ringR = length(d - pc - up * dot(d - pc, up));
            if (ringH < 0.012 && ringR > R * 1.25 && ringR < R * 2.1 && ang > R) {
              col += vec3(0.8, 0.7, 0.55) * (0.25 + 0.2 * sin(ringR * 160.0));
            }
          }
          // ---- 未來城市：地平線的城市光害、低空雲被照亮、兩道掃動的探照燈 ----
          if (uCity > 0.0) {
            vec2 cp = d.xz / (max(h, 0.0) + 0.25);
            float cloud = fbm(cp * 0.7 + vec2(uTime * 0.01, 0.0));
            float low = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.1, 0.5, h));
            col += vec3(0.9, 0.25, 0.6) * pow(1.0 - clamp(h, 0.0, 1.0), 6.0) * 0.35 * uCity;   // 光害
            col += vec3(0.35, 0.1, 0.4) * cloud * low * 0.9 * uCity;                       // 被照亮的雲
            for (int i = 0; i < 2; i++) {                                                     // 探照燈
              float a = uTime * (0.21 + float(i) * 0.07) + float(i) * 2.4;
              vec3 beam = normalize(vec3(sin(a) * 0.5, 1.0, cos(a) * 0.5 - 0.3 + float(i) * 0.6));
              float side = length(cross(d, beam));
              col += vec3(0.6, 0.85, 1.0) * smoothstep(0.035, 0.0, side) * smoothstep(0.0, 0.3, h) * 0.25 * uCity;
            }
          }

          // ---- 末日：翻騰的暗紅雲層、碎裂發光的巨大月亮、流星雨 ----
          if (uDoom > 0.0) {
            vec2 cp = d.xz / (max(h, 0.0) + 0.2);
            float c1 = fbm(cp * 0.8 + vec2(uTime * 0.02, uTime * 0.01));
            float c2 = fbm(cp * 2.1 - vec2(uTime * 0.03, 0.0));
            float clouds = smoothstep(0.35, 0.85, c1 * 0.7 + c2 * 0.4);
            vec3 cloudCol = mix(vec3(0.05, 0.01, 0.01), vec3(0.9, 0.22, 0.05), pow(c2, 3.0) * 1.6);
            col = mix(col, cloudCol, clouds * smoothstep(-0.05, 0.25, h) * 0.85 * uDoom);
            // 碎裂的月亮：表面有發光的裂縫，旁邊漂著碎片
            vec3 mc = normalize(vec3(0.55, 0.32, -0.77));
            float ang = acos(clamp(dot(d, mc), -1.0, 1.0));
            float R = 0.2;
            vec2 mp = vec2(dot(d, normalize(cross(mc, vec3(0, 1, 0)))), d.y - mc.y) * 14.0;
            if (ang < R) {
              float ridge = 1.0 - abs(noise(mp * 1.3) * 2.0 - 1.0);
              float crack = smoothstep(0.97, 1.0, ridge); // 細細的裂縫
              // 暗色岩石（這裡是線性亮度，畫到螢幕時會經過 gamma 轉換變亮，所以數值要給得很低）
              vec3 rock = mix(vec3(0.012, 0.008, 0.008), vec3(0.045, 0.032, 0.028), noise(mp * 3.0));
              float rim = pow(ang / R, 4.0) * 0.25; // 邊緣被背後的火光照亮
              col = mix(col, rock + vec3(0.6, 0.15, 0.03) * rim, uDoom) + vec3(0.75, 0.2, 0.03) * crack * uDoom; // 亮度壓在泛光門檻以下，月亮才不會被光暈洗白
            }
            col += vec3(1.0, 0.3, 0.05) * pow(max(0.0, 1.0 - ang / (R * 2.2)), 3.0) * 0.6 * uDoom * step(R, ang); // 月亮周圍的紅光（只在月亮外面）
            float debris = step(0.992, hash2(floor(mp * 6.0))) * step(R * 1.05, ang) * step(ang, R * 1.9); // 漂浮的小碎片
            col += vec3(0.8, 0.35, 0.15) * debris * uDoom;
            // 流星：在天空座標上沿斜線飛過，頭亮尾長
            if (h > 0.02) {
              vec2 sp = d.xz / (h + 0.35);
              for (int i = 0; i < 6; i++) {
                float fi = float(i);
                float t = fract(uTime * (0.07 + fi * 0.013) + hash2(vec2(fi, 3.1)));
                vec2 dir = normalize(vec2(-1.0, -0.45 + fi * 0.08));
                vec2 head = vec2(hash2(vec2(fi, 1.7)) * 5.0 - 1.0, hash2(vec2(fi, 9.2)) * 4.0 - 2.0) + dir * t * 7.0;
                vec2 rel = sp - head;
                float along = dot(rel, -dir);
                float perp = abs(dot(rel, vec2(-dir.y, dir.x)));
                float tail = step(0.0, along) * (1.0 - smoothstep(0.0, 1.3, along));
                float fade = sin(t * 3.14159);
                col += vec3(1.4, 0.65, 0.25) * tail * smoothstep(0.025, 0.0, perp) * fade * uDoom;
                col += vec3(2.0, 1.2, 0.6) * smoothstep(0.06, 0.0, length(rel)) * fade * uDoom;
              }
            }
            col += vec3(0.6, 0.12, 0.02) * pow(1.0 - clamp(abs(h), 0.0, 1.0), 10.0) * uDoom;      // 地平線的火光
          }

          // ---- 海底：往上越亮的藍綠色水體、從水面灑下的光束、水面的波光 ----
          if (uWater > 0.0) {
            vec3 deep = mix(vec3(0.0, 0.03, 0.05), vec3(0.02, 0.25, 0.3), smoothstep(-0.3, 1.0, h));
            col = mix(col, deep, uWater);
            float az = atan(d.x, d.z);
            float rays = pow(max(0.0, sin(az * 9.0 + noise(vec2(az * 3.0, uTime * 0.2)) * 4.0)), 6.0);
            col += vec3(0.25, 0.7, 0.75) * rays * smoothstep(0.1, 0.9, h) * 0.35 * uWater;
            vec2 wp = d.xz / max(h, 0.05) * 3.0;
            float caustic = pow(noise(wp + uTime * 0.4) * noise(wp * 1.7 - uTime * 0.3), 2.0) * 4.0;
            col += vec3(0.5, 0.95, 1.0) * caustic * smoothstep(0.55, 0.95, h) * 0.5 * uWater;
          }

          // ---- 星雲：太空中紫藍色的雲霧 ----
          if (uNebula > 0.0) {
            vec2 np = vec2(atan(d.x, d.z) * 1.2, d.y * 2.5);
            float n1 = fbm(np * 1.6 + vec2(0.0, uTime * 0.003));
            float n2 = fbm(np * 3.3 + 4.0);
            float band = smoothstep(0.7, 0.0, abs(d.y - 0.15 + sin(np.x * 0.8) * 0.15));
            vec3 neb = mix(vec3(0.35, 0.08, 0.55), vec3(0.05, 0.4, 0.75), n2);
            col += neb * pow(n1, 2.2) * band * 1.4 * uNebula;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  },

  /* ---------- 套用地圖的天空與燈光設定 ---------- */
  setEnvironment(cfg) {
    const u = this.skyUniforms;
    u.uTop.value.setHex(cfg.top);
    u.uHorizon.value.setHex(cfg.horizon);
    u.uBottom.value.setHex(cfg.bottom);
    u.uSunColor.value.setHex(cfg.sunColor);
    u.uSunDisc.value = cfg.sunDisc;
    u.uStars.value = cfg.stars;
    u.uAurora.value = cfg.aurora;
    u.uPlanet.value = cfg.planet;
    u.uCity.value = cfg.city || 0;
    u.uDoom.value = cfg.doom || 0;
    u.uWater.value = cfg.water || 0;
    u.uNebula.value = cfg.nebula || 0;
    this.sunDir.set(...cfg.sunDir).normalize();
    u.uSunDir.value.copy(this.sunDir);

    this.sun.color.setHex(cfg.sunColor);
    this.sun.intensity = cfg.sunPower;
    this.hemi.color.setHex(cfg.hemiSky);
    this.hemi.groundColor.setHex(cfg.hemiGround);
    this.hemi.intensity = cfg.hemiPower;
    this.scene.fog = new THREE.Fog(cfg.fog, cfg.fogNear, cfg.fogFar);
    this.post.exposure = cfg.exposure;

    // 槍的打光顏色跟著地圖走
    this.weaponHemi.color.setHex(cfg.hemiSky).lerp(new THREE.Color(0xffffff), 0.5);
    this.weaponKey.color.setHex(cfg.sunColor).lerp(new THREE.Color(0xffffff), 0.4);

    // 把天空拍成「環境貼圖」，金屬表面才會有反光
    const envScene = new THREE.Scene();
    const skyCopy = this.sky.clone();
    skyCopy.position.set(0, 0, 0);
    envScene.add(skyCopy);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = pmrem.fromScene(envScene, 0.03);
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;

    // 槍用另一張「攝影棚」環境貼圖：不管地圖多暗，金屬槍身都有清楚的反光
    if (!this.studioEnv) {
      const studio = new THREE.Scene();
      studio.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(20, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x3a424e, side: THREE.BackSide })
        )
      );
      // 三片發亮的板子當作柔光箱：上方、左前、右後
      for (const [x, y, z, s, b] of [[0, 12, 0, 14, 5], [-12, 3, -6, 8, 4], [12, 2, 8, 6, 2.5]]) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(s, s),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(b, b, b), side: THREE.DoubleSide })
        );
        panel.position.set(x, y, z);
        panel.lookAt(0, 0, 0);
        studio.add(panel);
      }
      const gen = new THREE.PMREMGenerator(this.renderer);
      this.studioEnv = gen.fromScene(studio, 0.04).texture;
      gen.dispose();
    }
    this.weaponScene.environment = this.studioEnv;
    this.weaponScene.environmentIntensity = 0.85;
  },

  /* ============================================================
   *  後製流程
   * ============================================================ */
  _buildPost() {
    // 一張鋪滿畫面的三角形／方形，後製的每一步都是「拿某張圖當輸入，畫到這個方形上」
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    const make = (uniforms, fragmentShader) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });

    // 縮小：取四個點平均；uThreshold > 0 時順便只留下很亮的部分
    this.matDown = make(
      { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } },
      /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uTexel;
      uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        c *= 0.25;
        if (uThreshold > 0.0) {
          float br = max(c.r, max(c.g, c.b));
          c *= max(br - uThreshold, 0.0) / max(br, 0.0001);
          c = min(c, vec3(14.0));
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
    );
    // 放大：九點加權模糊後，疊上同尺寸的那一層
    this.matUp = make(
      { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } },
      /* glsl */ `
      uniform sampler2D tSrc, tBase;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += (texture2D(tSrc, vUv + uTexel * vec2(1, 0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1, 0)).rgb
            + texture2D(tSrc, vUv + uTexel * vec2(0, 1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0, -1)).rgb) * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb;
        gl_FragColor = vec4(texture2D(tBase, vUv).rgb + c / 16.0, 1.0);
      }`,
    );
    // 最終合成
    this.matFinal = make(
      {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 1 }, uExposure: { value: 1 }, uTime: { value: 0 },
        uHurt: { value: 0 }, uDesat: { value: 0 }, uFlash: { value: 0 }, uAberration: { value: 0 }, uVignette: { value: 0.5 },
      },
      /* glsl */ `
      uniform sampler2D tScene, tBloom;
      uniform float uBloom, uExposure, uTime, uHurt, uDesat, uFlash, uAberration, uVignette;
      varying vec2 vUv;

      // ACES 色調映射：把很大的亮度範圍壓回螢幕能顯示的 0~1，亮部會自然地「過曝」
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      void main() {
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);

        // 邊緣色散：紅藍兩色稍微錯開
        vec3 col;
        col.r = texture2D(tScene, vUv + d * uAberration * r2 * 4.0).r;
        col.g = texture2D(tScene, vUv).g;
        col.b = texture2D(tScene, vUv - d * uAberration * r2 * 4.0).b;

        col += texture2D(tBloom, vUv).rgb * uBloom;
        col = aces(col * uExposure);

        // 瀕死時畫面褪色
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lum), uDesat);

        // 暗角、受傷紅邊、閃白
        col *= mix(1.0, smoothstep(0.9, 0.2, length(d)), uVignette);
        col = mix(col, vec3(0.75, 0.03, 0.05), uHurt * smoothstep(0.2, 0.75, length(d)));
        col += uFlash;

        col = pow(max(col, 0.0), vec3(1.0 / 2.2)); // 線性 → sRGB

        // 底片顆粒（很輕微，讓漸層不會出現色階斷層）
        float n = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * 0.014;

        gl_FragColor = vec4(col, 1.0);
      }`,
    );
  },

  _resizePost() {
    if (!this.postQuad) return;
    const q = this.QUALITY[this.quality];
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = size.x, h = size.y;

    // 釋放舊的暫存畫面
    for (const t of [this.rtScene, ...(this.rtDown || []), ...(this.rtUp || [])]) if (t) t.dispose();

    const hdr = { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { ...hdr, depthBuffer: true, samples: q.msaa });
    this.rtDown = [];
    this.rtUp = [];
    let bw = Math.floor(w / 2), bh = Math.floor(h / 2);
    for (let i = 0; i < q.bloomLevels; i++) {
      this.rtDown.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), hdr));
      if (i < q.bloomLevels - 1) this.rtUp.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), hdr));
      bw = Math.floor(bw / 2);
      bh = Math.floor(bh / 2);
    }
  },

  // 用指定材質把鋪滿畫面的方形畫到 target（null = 螢幕）
  _pass(material, target) {
    this.postQuad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCamera);
  },

  /* ---------- 每一幀的繪製 ---------- */
  render(dt, drawWeapon) {
    if ((window.devicePixelRatio || 1) !== this.dpr) this.resize(); // 螢幕縮放比例改變了
    this.time += dt;
    // 視窗被縮到最小（看不到畫面）時不用畫，也避免顯示卡一直報「緩衝區大小為 0」的警告
    if (window.innerWidth < 2 || window.innerHeight < 2) return;
    const r = this.renderer;
    this.skyUniforms.uTime.value = this.time;
    this.sky.position.copy(this.camera.position);

    // （陰影範圍固定蓋住整張地圖，見 setShadowArea；不跟著攝影機移動，陰影才不會一閃一閃）

    // 1. 主場景
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);
    // 2. 第一人稱武器（清掉深度後再畫）
    if (drawWeapon) {
      r.clearDepth();
      r.render(this.weaponScene, this.weaponCamera);
    }

    // 3. 泛光：先縮小（第一層同時做亮部擷取），再放大疊回
    const down = this.rtDown, up = this.rtUp;
    let src = this.rtScene;
    for (let i = 0; i < down.length; i++) {
      this.matDown.uniforms.tSrc.value = src.texture;
      this.matDown.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
      this.matDown.uniforms.uThreshold.value = i === 0 ? 1.0 : 0;
      this._pass(this.matDown, down[i]);
      src = down[i];
    }
    let acc = down[down.length - 1];
    for (let i = down.length - 2; i >= 0; i--) {
      this.matUp.uniforms.tSrc.value = acc.texture;
      this.matUp.uniforms.tBase.value = down[i].texture;
      this.matUp.uniforms.uTexel.value.set(1 / acc.width, 1 / acc.height);
      this._pass(this.matUp, up[i]);
      acc = up[i];
    }

    // 4. 合成到螢幕
    const u = this.matFinal.uniforms;
    const p = this.post;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = acc.texture;
    u.uBloom.value = p.bloom / down.length;
    u.uExposure.value = p.exposure;
    u.uTime.value = this.time;
    u.uHurt.value = p.hurt;
    u.uDesat.value = p.desat;
    u.uFlash.value = p.flash;
    u.uAberration.value = p.aberration;
    u.uVignette.value = p.vignette;
    this._pass(this.matFinal, null);
  },
};

/* ============================================================
 *  粒子系統：一次繪製呼叫畫出上千顆粒子
 * ------------------------------------------------------------
 *  每顆粒子有位置、速度、壽命、顏色與大小。資料都放在固定長度的
 *  陣列裡，用「環狀」方式重複使用（新的粒子覆蓋最舊的）。
 * ============================================================ */
class ParticleSystem {
  constructor(max, additive) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.data = new Float32Array(max * 2); // [大小, 透明度]
    this.life = new Float32Array(max); // 剩餘壽命
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("data", new THREE.BufferAttribute(this.data, 2));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute vec2 data;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = data.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = data.x * uScale / max(0.1, -mv.z);   // 越遠越小
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;        // 中心實、邊緣柔
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  /* 產生一顆粒子。o 的欄位：
   *   x,y,z 位置   vx,vy,vz 速度   life 壽命   size / size1 起始／結束大小
   *   color (THREE.Color)   bright 亮度倍率   gravity 重力   drag 阻力 */
  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    const b = o.bright ?? 1;
    this.col[i * 3] = o.color.r * b; this.col[i * 3 + 1] = o.color.g * b; this.col[i * 3 + 2] = o.color.b * b;
    this.life[i] = this.maxLife[i] = o.life;
    this.size0[i] = o.size;
    this.size1[i] = o.size1 ?? o.size * 0.2;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt) {
    const { pos, vel, life, maxLife, data } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { data[i * 2 + 1] = 0; continue; }
      life[i] -= dt;
      const k = i * 3;
      const dragF = Math.max(0, 1 - this.drag[i] * dt);
      vel[k] *= dragF; vel[k + 1] = vel[k + 1] * dragF - this.grav[i] * dt; vel[k + 2] *= dragF;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      if (pos[k + 1] < 0.02 && this.grav[i] > 0) { pos[k + 1] = 0.02; vel[k + 1] *= -0.35; vel[k] *= 0.6; vel[k + 2] *= 0.6; } // 落地彈一下
      const t = Math.max(0, life[i] / maxLife[i]); // 1 剛出生 → 0 消失
      data[i * 2] = this.size1[i] + (this.size0[i] - this.size1[i]) * t;
      data[i * 2 + 1] = Math.min(1, t * 2.2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.data.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
  }
}

/* ============================================================
 *  FX ── 戰鬥特效總管
 * ============================================================ */
const FX = {
  shake: 0, // 目前的畫面震動強度（玩家的攝影機會讀取）
  _c: new THREE.Color(),

  init() {
    const scene = Scene3D.scene;
    this.glow = new ParticleSystem(2600, true); // 發光粒子：火花、能量
    this.smoke = new ParticleSystem(700, false); // 不發光粒子：煙、塵
    scene.add(this.glow.points, this.smoke.points);

    /* ---- 曳光彈：最多 140 條，全部用同一個「實例化網格」畫 ---- */
    const tracerMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tracerMat, 140);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.tracers = [];
    scene.add(this.tracerMesh);

    /* ---- 彈孔：160 個貼在牆上的小圓片，環狀重複使用 ---- */
    const holeCanvas = document.createElement("canvas");
    holeCanvas.width = holeCanvas.height = 64;
    const hc = holeCanvas.getContext("2d");
    const grad = hc.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.95)");
    grad.addColorStop(0.35, "rgba(10,8,6,0.8)");
    grad.addColorStop(0.7, "rgba(30,25,20,0.3)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    hc.fillStyle = grad;
    hc.fillRect(0, 0, 64, 64);
    const holeMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(holeCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), holeMat, 160);
    this.holeMesh.frustumCulled = false;
    this.holeMesh.count = 0;
    this.holeCursor = 0;
    scene.add(this.holeMesh);

    /* ---- 彈殼：40 顆會掉在地上彈跳的黃銅小圓柱 ---- */
    const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.9, roughness: 0.3 });
    this.shellMesh = new THREE.InstancedMesh(shellGeo, shellMat, 40);
    this.shellMesh.frustumCulled = false;
    this.shellMesh.count = 40;
    this.shells = [];
    for (let i = 0; i < 40; i++) {
      this.shells.push({ life: 0, pos: new THREE.Vector3(0, -50, 0), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: 0 });
    }
    this.shellCursor = 0;
    scene.add(this.shellMesh);

    /* ---- 光暈貼片（槍口火光、爆炸閃光）：30 個可重複使用的 Sprite ---- */
    this.sprites = [];
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.SpriteMaterial({ map: Tex.glowSprite(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      this.sprites.push({ sprite, life: 0, maxLife: 1, size0: 1, size1: 1 });
    }

    /* ---- 動態光源：6 盞（槍口火光、爆炸）。固定數量可避免著色器重新編譯 ---- */
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 18, 2);
      scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 1, power: 0 });
    }

    /* ---- 衝擊波圓環與地面預警圈 ---- */
    this.rings = []; // 往外擴散的環
    this.marks = []; // 預警圈（招式落點）
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.discGeo.rotateX(-Math.PI / 2);

    /* ---- 光束（雷射、軌道打擊）---- */
    this.beams = [];
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);

    this._buildWeather();
  },

  /* ---------- 每幀更新 ---------- */
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this._updateTracers(dt);
    this._updateShells(dt);

    for (const s of this.sprites) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const t = Math.max(0, s.life / s.maxLife);
      s.sprite.scale.setScalar(Util.lerp(s.size1, s.size0, t));
      s.sprite.material.opacity = t;
      if (s.life <= 0) s.sprite.visible = false;
    }
    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.light.intensity = l.power * Math.max(0, l.life / l.maxLife);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - Math.max(0, r.life / r.maxLife); // 0 → 1
      r.mesh.scale.setScalar(Util.lerp(0.2, r.radius, t));
      r.mesh.material.opacity = (1 - t) * 0.9;
      if (r.life <= 0) { this._drop(r.mesh); this.rings.splice(i, 1); }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.life -= dt;
      const t = 1 - Math.max(0, m.life / m.maxLife);
      m.fill.scale.setScalar(Math.max(0.001, m.radius * t)); // 內圈逐漸填滿 = 倒數
      m.ring.material.opacity = 0.55 + 0.4 * Math.sin(Scene3D.time * 18);
      if (m.life <= 0) { this._drop(m.ring); this._drop(m.fill); this.marks.splice(i, 1); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      const t = Math.max(0, b.life / b.maxLife);
      b.mesh.scale.x = b.mesh.scale.z = b.radius * (b.fade ? t : 1);
      b.mesh.material.opacity = b.fade ? t : 1;
      if (b.life <= 0) { this._drop(b.mesh); this.beams.splice(i, 1); }
    }
    this._updateWeather(dt);
  },

  // 移除一個臨時網格並釋放它的材質
  _drop(mesh) {
    Scene3D.scene.remove(mesh);
    mesh.material.dispose();
  },

  // 清掉所有進行中的特效（重新開始一局時呼叫）
  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.tracers.length = 0;
    this.tracerMesh.count = 0;
    this.holeMesh.count = 0;
    this.holeCursor = 0;
    for (const s of this.shells) { s.life = 0; s.pos.set(0, -50, 0); }
    for (const s of this.sprites) { s.life = 0; s.sprite.visible = false; }
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
    for (const r of this.rings) this._drop(r.mesh);
    for (const m of this.marks) { this._drop(m.ring); this._drop(m.fill); }
    for (const b of this.beams) this._drop(b.mesh);
    this.rings.length = this.marks.length = this.beams.length = 0;
    this.shake = 0;
  },

  /* ============================================================
   *  各種特效的產生函式
   * ============================================================ */

  // 火花：從 (x,y,z) 沿法線方向噴出
  sparks(x, y, z, nx, ny, nz, colorHex, count = 8, speed = 5) {
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      this.glow.emit({
        x, y, z,
        vx: nx * speed * Math.random() + Util.rand(-1, 1) * speed * 0.5,
        vy: ny * speed * Math.random() + Util.rand(-0.2, 1) * speed * 0.5,
        vz: nz * speed * Math.random() + Util.rand(-1, 1) * speed * 0.5,
        life: Util.rand(0.15, 0.45), size: Util.rand(0.04, 0.09), size1: 0.01,
        color, bright: 3, gravity: 12, drag: 1.5,
      });
    }
  },

  // 煙塵：慢慢上升擴散的灰色煙
  puff(x, y, z, count = 4, size = 0.5, colorHex = 0x8a8a8a, spread = 0.6) {
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      this.smoke.emit({
        x: x + Util.rand(-0.1, 0.1), y: y + Util.rand(-0.05, 0.1), z: z + Util.rand(-0.1, 0.1),
        vx: Util.rand(-spread, spread), vy: Util.rand(0.2, 1.0), vz: Util.rand(-spread, spread),
        life: Util.rand(0.5, 1.2), size: size * 0.4, size1: size * Util.rand(1.2, 2),
        color, bright: 0.5, drag: 1.2,
      });
    }
  },

  // 子彈打到牆：火花 + 一小團灰塵 + 彈孔
  impact(hit, colorHex = 0xffd9a0) {
    this.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, colorHex, 6, 4);
    this.puff(hit.x + hit.nx * 0.05, hit.y + hit.ny * 0.05, hit.z + hit.nz * 0.05, 3, 0.35, 0x9a948a, 0.5);
    this.debris(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 5, 0x3a3634);
    this.hole(hit, 0.11);
  },

  // 碎屑：被子彈打下來的小碎塊，往外噴出後受重力掉落、在地上彈一下
  debris(x, y, z, nx, ny, nz, count, colorHex) {
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const sp = Util.rand(1.5, 4.5);
      this.smoke.emit({
        x, y, z,
        vx: nx * sp + Util.rand(-1.2, 1.2), vy: ny * sp + Util.rand(0.5, 2.5), vz: nz * sp + Util.rand(-1.2, 1.2),
        life: Util.rand(0.6, 1.2), size: Util.rand(0.035, 0.07), size1: 0.03, color, bright: 0.8, gravity: 13, drag: 0.6,
      });
    }
  },

  // 能量彈打在牆上：發光的灼痕與慢慢熄滅的火星
  scorch(hit, colorHex) {
    this.flash(hit.x + hit.nx * 0.05, hit.y + hit.ny * 0.05, hit.z + hit.nz * 0.05, colorHex, 0.7, 0.35, 0.8);
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < 4; i++) {
      this.glow.emit({
        x: hit.x + hit.nx * 0.04, y: hit.y + hit.ny * 0.04, z: hit.z + hit.nz * 0.04,
        vx: Util.rand(-0.2, 0.2), vy: Util.rand(0, 0.3), vz: Util.rand(-0.2, 0.2),
        life: Util.rand(0.6, 1.2), size: 0.08, size1: 0.01, color, bright: 2.5,
      });
    }
    this.hole(hit, 0.16);
  },

  // 槍口冒出的一小縷白煙
  muzzleSmoke(x, y, z) {
    const color = this._c.setHex(0xbcbcbc);
    for (let i = 0; i < 2; i++) {
      this.smoke.emit({
        x, y, z, vx: Util.rand(-0.2, 0.2), vy: Util.rand(0.3, 0.7), vz: Util.rand(-0.2, 0.2),
        life: Util.rand(0.5, 0.9), size: 0.05, size1: 0.25, color, bright: 0.35, drag: 1.5,
      });
    }
  },

  // 角色分解消失：屍體化成一顆顆往上飄的光點
  dissolve(x, y, z, h, colorHex, count = 6) {
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      this.glow.emit({
        x: x + Util.rand(-0.5, 0.5), y: y + Util.rand(0, h), z: z + Util.rand(-0.5, 0.5),
        vx: Util.rand(-0.3, 0.3), vy: Util.rand(0.6, 1.8), vz: Util.rand(-0.3, 0.3),
        life: Util.rand(0.6, 1.2), size: 0.07, size1: 0.01, color, bright: 2.2, drag: 0.8,
      });
    }
  },

  // 彈孔／焦痕
  hole(hit, size) {
    const i = this.holeCursor;
    this.holeCursor = (this.holeCursor + 1) % 160;
    this.holeMesh.count = Math.max(this.holeMesh.count, i + 1);
    const m = TMP.m1;
    const q = TMP.q1.setFromUnitVectors(TMP.v1.set(0, 0, 1), TMP.v2.set(hit.nx, hit.ny, hit.nz));
    m.compose(TMP.v3.set(hit.x + hit.nx * 0.012, hit.y + hit.ny * 0.012, hit.z + hit.nz * 0.012), q, TMP.v4.set(size, size, 1));
    this.holeMesh.setMatrixAt(i, m);
    this.holeMesh.instanceMatrix.needsUpdate = true;
  },

  // 擊中角色：能量護甲碎裂般的亮點
  hitFlesh(x, y, z, colorHex, crit) {
    this.sparks(x, y, z, 0, 0.3, 0, crit ? 0xfff2a0 : colorHex, crit ? 14 : 7, crit ? 5 : 3.5);
    // 噴濺：幾滴發光的能量液往外噴出後落下，爆頭時更多
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < (crit ? 10 : 5); i++) {
      this.glow.emit({
        x, y, z, vx: Util.rand(-2.5, 2.5), vy: Util.rand(0.5, 3), vz: Util.rand(-2.5, 2.5),
        life: Util.rand(0.4, 0.8), size: Util.rand(0.04, 0.08), size1: 0.02, color, bright: 1.6, gravity: 11, drag: 0.8,
      });
    }
    if (crit) this.flash(x, y, z, 0xfff2a0, 0.9, 0.12, 1.6); // 爆頭的閃光
  },

  // 曳光彈：從 a 飛到 b 的一道光
  tracer(ax, ay, az, bx, by, bz, colorHex, width = 0.022) {
    if (this.tracers.length >= 140) this.tracers.shift();
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.5) return;
    this.tracers.push({ ax, ay, az, dx: (bx - ax) / len, dy: (by - ay) / len, dz: (bz - az) / len, len, head: Math.min(len, 6), color: colorHex, width });
  },

  _updateTracers(dt) {
    const SPEED = 380; // 光條前進的速度（公尺／秒）
    const STREAK = 9; // 光條長度
    const mesh = this.tracerMesh;
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.head += SPEED * dt;
      const tail = Math.max(0, t.head - STREAK);
      if (tail >= t.len) { this.tracers.splice(i, 1); continue; }
      const head = Math.min(t.head, t.len);
      const mid = (head + tail) / 2;
      const q = TMP.q1.setFromUnitVectors(TMP.v1.set(0, 0, 1), TMP.v2.set(t.dx, t.dy, t.dz));
      TMP.m1.compose(TMP.v3.set(t.ax + t.dx * mid, t.ay + t.dy * mid, t.az + t.dz * mid), q, TMP.v4.set(t.width, t.width, head - tail));
      mesh.setMatrixAt(n, TMP.m1);
      mesh.setColorAt(n, TMP.c1.setHex(t.color).multiplyScalar(3));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  },

  // 拋出一顆彈殼
  shell(pos, vel) {
    const s = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;
    s.pos.copy(pos);
    s.vel.copy(vel);
    s.life = 2.5;
    s.spin = Util.rand(10, 25);
    s.ground = World.groundAt(pos.x, pos.z, pos.y);
  },

  _updateShells(dt) {
    const mesh = this.shellMesh;
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 14 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.rot.x += s.spin * dt;
        s.rot.z += s.spin * 0.7 * dt;
        if (s.pos.y < s.ground + 0.01) { // 碰到地面：反彈並減速
          s.pos.y = s.ground + 0.01;
          s.vel.y *= -0.4;
          s.vel.x *= 0.5; s.vel.z *= 0.5;
          s.spin *= 0.5;
        }
        if (s.life <= 0) s.pos.set(0, -50, 0);
      }
      TMP.m1.compose(s.pos, TMP.q1.setFromEuler(s.rot), TMP.v1.set(1, 1, 1));
      mesh.setMatrixAt(i, TMP.m1);
    }
    mesh.instanceMatrix.needsUpdate = true;
  },

  // 一閃即逝的光暈貼片
  flash(x, y, z, colorHex, size, life = 0.08, grow = 1.6) {
    let slot = this.sprites.find((s) => s.life <= 0) || this.sprites[0];
    slot.sprite.position.set(x, y, z);
    slot.sprite.material.color.setHex(colorHex).multiplyScalar(2.5);
    slot.sprite.material.opacity = 1;
    slot.sprite.material.rotation = Math.random() * 6.28;
    slot.sprite.visible = true;
    slot.life = slot.maxLife = life;
    slot.size0 = size;
    slot.size1 = size * grow;
    slot.sprite.scale.setScalar(size);
  },

  // 短暫的點光源
  light(x, y, z, colorHex, power, life = 0.1) {
    let slot = this.lights.find((l) => l.life <= 0);
    if (!slot) slot = this.lights.reduce((a, b) => (a.life < b.life ? a : b)); // 都在用就搶最快結束的
    slot.light.position.set(x, y, z);
    slot.light.color.setHex(colorHex);
    slot.power = power;
    slot.life = slot.maxLife = life;
    slot.light.intensity = power;
  },

  // 槍口火光
  muzzle(x, y, z, colorHex, big) {
    this.flash(x, y, z, colorHex, big ? 0.9 : 0.5, 0.06, 1.5);
    this.light(x, y, z, colorHex, big ? 40 : 22, 0.07);
  },

  // 往外擴散的衝擊波環
  ring(x, y, z, radius, colorHex, life = 0.5) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, y + 0.06, z);
    Scene3D.scene.add(mesh);
    this.rings.push({ mesh, radius, life, maxLife: life });
  },

  /* 地面預警圈：告訴玩家「這裡 duration 秒後會爆炸」。
   * 外框固定，內圈由小變大，填滿的瞬間就是命中時間。 */
  mark(x, y, z, radius, colorHex, duration) {
    const color = new THREE.Color(colorHex).multiplyScalar(2);
    const base = { transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending };
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ ...base, color }));
    ring.position.set(x, y + 0.07, z);
    ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ ...base, color, opacity: 0.28 }));
    fill.position.set(x, y + 0.05, z);
    Scene3D.scene.add(ring, fill);
    this.marks.push({ ring, fill, radius, life: duration, maxLife: duration });
  },

  // 光束：從 a 到 b 的發光圓柱。fade = true 會逐漸變細消失
  beam(a, b, radius, colorHex, life, fade = true) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    const dir = TMP.v1.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length();
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(TMP.v2.set(0, 1, 0), dir.normalize());
    mesh.scale.set(radius, len, radius);
    Scene3D.scene.add(mesh);
    const beam = { mesh, radius, life, maxLife: life, fade };
    this.beams.push(beam);
    return beam;
  },

  // 重新設定一道光束的兩端（旋轉雷射每一幀都要更新位置）
  setBeam(beam, a, b) {
    const dir = TMP.v1.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = Math.max(0.01, dir.length());
    beam.mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    beam.mesh.quaternion.setFromUnitVectors(TMP.v2.set(0, 1, 0), dir.normalize());
    beam.mesh.scale.y = len;
  },

  // 爆炸：閃光 + 光源 + 衝擊波 + 火花 + 濃煙 + 焦痕 + 震動
  explosion(x, y, z, radius, colorHex = 0xff8a2a) {
    this.flash(x, y + 0.3, z, colorHex, radius * 1.3, 0.28, 2.2);
    this.flash(x, y + 0.3, z, 0xffffff, radius * 0.6, 0.12, 1.5);
    this.light(x, y + 1, z, colorHex, 220, 0.4);
    this.ring(x, y, z, radius, colorHex, 0.45);
    const color = this._c.setHex(colorHex);
    for (let i = 0; i < 46; i++) { // 四散的火花
      const a = Math.random() * 6.28, up = Math.random();
      const sp = Util.rand(4, 15);
      this.glow.emit({
        x, y: y + 0.2, z,
        vx: Math.cos(a) * sp * (1 - up * 0.5), vy: up * sp * 0.9 + 1, vz: Math.sin(a) * sp * (1 - up * 0.5),
        life: Util.rand(0.3, 0.9), size: Util.rand(0.08, 0.2), size1: 0.01, color, bright: 3.5, gravity: 13, drag: 1.2,
      });
    }
    for (let i = 0; i < 14; i++) { // 火球核心
      this.glow.emit({
        x: x + Util.rand(-0.4, 0.4), y: y + Util.rand(0.1, 0.8), z: z + Util.rand(-0.4, 0.4),
        vx: Util.rand(-2, 2), vy: Util.rand(1, 4), vz: Util.rand(-2, 2),
        life: Util.rand(0.25, 0.5), size: radius * 0.35, size1: radius * 0.6, color, bright: 2.2, drag: 3,
      });
    }
    this.puff(x, y + 0.4, z, 16, radius * 0.6, 0x3a3836, 2.2);
    this.debris(x, y + 0.3, z, 0, 1, 0, 22, 0x2a2624); // 被炸飛的碎塊
    for (let i = 0; i < 8; i++) { // 往上衝的濃煙柱
      this.smoke.emit({
        x: x + Util.rand(-0.6, 0.6), y: y + 0.5, z: z + Util.rand(-0.6, 0.6),
        vx: Util.rand(-0.5, 0.5), vy: Util.rand(2.5, 5), vz: Util.rand(-0.5, 0.5),
        life: Util.rand(1.8, 3), size: radius * 0.3, size1: radius * 0.9, color: this._c.setHex(0x2a2826), bright: 0.5, drag: 1.2,
      });
    }
    // 焦痕：只有在靠近地面爆炸時才留在地上
    const ground = World.groundAt(x, z, y + 0.3);
    if (y - ground < 1.5) this.hole({ x, y: ground, z, nx: 0, ny: 1, nz: 0 }, radius * 0.9);
    this.addShake(x, y, z, radius * 0.12);
  },

  // 依照與玩家的距離增加畫面震動
  addShake(x, y, z, amount) {
    const c = Scene3D.camera.position;
    const d = Math.hypot(c.x - x, c.y - y, c.z - z);
    this.shake = Math.min(1.2, this.shake + amount * Math.max(0, 1 - d / 45));
  },

  /* ============================================================
   *  天氣：跟著攝影機移動的一團粒子
   * ============================================================ */
  _buildWeather() {
    const N = 1800;
    this.weatherN = N;
    this.weatherPos = new Float32Array(N * 3);
    this.weatherSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.weatherPos[i * 3] = Util.rand(-30, 30);
      this.weatherPos[i * 3 + 1] = Util.rand(0, 24);
      this.weatherPos[i * 3 + 2] = Util.rand(-30, 30);
      this.weatherSeed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.weatherPos, 3));
    this.weatherMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: 1 }, uStreak: { value: 0 }, uAlpha: { value: 0.5 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uSize;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * 300.0 / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStreak, uAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          // uStreak = 1 時把圓點壓成細長的直線（雨絲）
          float d = mix(length(p), max(abs(p.x) * 9.0, abs(p.y)), uStreak);
          float a = smoothstep(0.5, 0.1, d) * uAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.weather = new THREE.Points(geo, this.weatherMat);
    this.weather.frustumCulled = false;
    this.weather.visible = false;
    Scene3D.scene.add(this.weather);
    this.weatherType = "none";
  },

  // type：rain 雨、snow 雪、dust 沙塵、motes 漂浮光點、ash 灰燼、bubbles 氣泡、none 無
  setWeather(type) {
    this.weatherType = type;
    const u = this.weatherMat.uniforms;
    const presets = {
      rain: { color: 0x8fb0ff, size: 0.5, streak: 1, alpha: 0.35, vy: -26, drift: 1.5 },
      snow: { color: 0xffffff, size: 0.11, streak: 0, alpha: 0.75, vy: -1.8, drift: 1.2 },
      dust: { color: 0xffd9a0, size: 0.08, streak: 0, alpha: 0.4, vy: -0.15, drift: 3.5 },
      motes: { color: 0x9fc0ff, size: 0.05, streak: 0, alpha: 0.6, vy: 0.12, drift: 0.3 },
      ash: { color: 0xffa070, size: 0.07, streak: 0, alpha: 0.55, vy: -0.9, drift: 1.6 }, // 灰燼與火星
      bubbles: { color: 0x9ff4ff, size: 0.09, streak: 0, alpha: 0.45, vy: 1.6, drift: 0.4 }, // 往上冒的氣泡
    };
    const p = presets[type];
    this.weather.visible = !!p;
    this.weatherCfg = p;
    if (!p) return;
    u.uColor.value.setHex(p.color);
    u.uSize.value = p.size;
    u.uStreak.value = p.streak;
    u.uAlpha.value = p.alpha;
  },

  _updateWeather(dt) {
    const p = this.weatherCfg;
    if (!p || !this.weather.visible) return;
    const pos = this.weatherPos;
    const cam = Scene3D.camera.position;
    const t = Scene3D.time;
    for (let i = 0; i < this.weatherN; i++) {
      const k = i * 3;
      const seed = this.weatherSeed[i];
      pos[k + 1] += p.vy * (0.7 + seed * 0.6) * dt;
      pos[k] += Math.sin(t * 0.7 + seed * 30) * p.drift * dt + p.drift * 0.4 * dt;
      pos[k + 2] += Math.cos(t * 0.5 + seed * 17) * p.drift * dt;
      // 超出攝影機周圍的方塊範圍就繞回另一邊（看起來像無限的雨）
      if (pos[k + 1] < 0) pos[k + 1] += 24;
      if (pos[k + 1] > 24) pos[k + 1] -= 24;
      if (pos[k] - cam.x > 30) pos[k] -= 60; else if (pos[k] - cam.x < -30) pos[k] += 60;
      if (pos[k + 2] - cam.z > 30) pos[k + 2] -= 60; else if (pos[k + 2] - cam.z < -30) pos[k + 2] += 60;
    }
    this.weather.geometry.attributes.position.needsUpdate = true;
  },
};
