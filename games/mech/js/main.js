'use strict';
// ============================================================
//  主程式：渲染器、機庫場景、輸入、主迴圈
// ============================================================
// APP：和「畫面繪製」有關的全域物件
//   renderer = three.js 繪圖器　composer / renderPass / bloom = 光暈後製
//   sky = 天空球　lights = 戰場的燈光　locked = 滑鼠是否已鎖定在畫面內
//   last = 上一格的時間　musT = 距離下次檢查背景音樂還有幾秒
const APP = { renderer: null, composer: null, renderPass: null, bloom: null, sky: null, lights: null,
    locked: false, last: 0, fps: 60, musT: 0 };

// ---------------- 機庫（選裝畫面的 3D 展示）----------------
const Hangar = {
  // rig = 展示中的機體　proto = 機體的原型（幾何資料）　rot = 目前旋轉角度　drag = 是否正在用滑鼠拖曳
  // minis = 兩側展示的小兵　t = 經過的時間　spinV = 自動旋轉的速度
  scene: null, camera: null, rig: null, proto: null, rot: 0.5, drag: false, minis: [], t: 0, spinV: 0.25,

  // 建立機庫場景：燈光、展示台、後方龍門架、地板，以及滑鼠拖曳旋轉（只呼叫一次）
  init(env) {
    const sc = this.scene = new THREE.Scene();
    sc.background = C(0x070b10).clone();
    sc.fog = new THREE.Fog(sc.background, 45, 140);
    sc.environment = env;
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 400);
    this.camera.position.set(0, 8.5, 34);
    this.camera.lookAt(0, 5.6, 0);
    // 燈光：一盞柔和的環境光 + 一盞會產生影子的主光 + 兩盞從背後打的輪廓光（藍、橘）
    sc.add(new THREE.HemisphereLight(C(0x9fc4e8), C(0x1a1410), 0.55));
    const key = new THREE.DirectionalLight(new THREE.Color(1, 0.94, 0.86), 1.7);
    key.position.set(14, 26, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    // 影子涵蓋的範圍（改完一定要 updateProjectionMatrix 才會生效）
    const k = key.shadow.camera;
    k.left = -22;
    k.right = 22;
    k.top = 30;
    k.bottom = -6;
    k.near = 5;
    k.far = 80;
    k.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.05;
    sc.add(key);
    const rim = new THREE.DirectionalLight(C(0x4fd8ff), 1.3);
    rim.position.set(-18, 12, -22);
    sc.add(rim);
    const rim2 = new THREE.DirectionalLight(C(0xff8a3c), 0.7);
    rim2.position.set(20, 6, -18);
    sc.add(rim2);
    // 地板與展示台
    const s = new Seg();
    s.cyl(11, 11.6, 0.7, 0x23282e, 0, 0.35, 0, 0, 0, 0, 48);
    s.cyl(12.6, 12.6, 0.24, 0x14181c, 0, 0.12, 0, 0, 0, 0, 48);
    // 展示台外圈的 12 個固定座與藍色燈條
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      s.bev(1.6, 0.5, 0.9, 0x39414a, Math.sin(a) * 11.4, 0.5, Math.cos(a) * 11.4, 0, a, 0, 0.1);
      s.gbox(0.9, 0.12, 0.12, 0x4fd8ff, Math.sin(a) * 11.9, 0.62, Math.cos(a) * 11.9, 0, a, 0);
    }
    // 展示台上的一圈發光刻度
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU;
      s.gbox(1.0, 0.06, 0.16, 0x2aa8d8, Math.sin(a) * 9.6, 0.72, Math.cos(a) * 9.6, 0, a, 0);
    }
    // 後方龍門架
    for (const sd of [-1, 1]) {
      s.bev(2.4, 30, 2.4, 0x1c2127, sd * 17, 15, -12, 0, 0, 0, 0.2);
      s.gbox(0.2, 26, 0.2, 0xffb23c, sd * 15.7, 14, -10.7);
      s.bev(1.2, 1.2, 10, 0x2a3038, sd * 17, 20, -7, 0, 0, 0, 0.1);
      s.bev(3, 1.6, 3, 0x39414a, sd * 17, 20, -2, 0, 0, 0, 0.2);
      for (let j = 0; j < 5; j++) s.box(2.6, 0.3, 2.6, 0xc8a020, sd * 17, 3 + j * 6, -12);
      s.bev(8, 5, 6, 0x232a31, sd * 30, 2.5, -4 - sd * 2, 0, 0.3 * sd, 0, 0.2);
      s.bev(6, 3, 5, 0x2f3740, sd * 29, 6.5, -4, 0, 0.3 * sd, 0, 0.2);
    }
    // 龍門架頂部的橫樑與燈
    s.bev(38, 2.4, 2.4, 0x1c2127, 0, 29, -12, 0, 0, 0, 0.2);
    for (let i = -3; i <= 3; i++) s.gbox(3, 0.2, 0.3, 0x9be2ff, i * 5, 27.7, -11.5);
    // 把上面所有零件合併成一個模型加進場景
    s.into(sc, MAT.prop);
    // 地板：乾淨的霧面格線地板（不反射環境，才不會出現一條一條的模糊反光）
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ map: TEX.hangar, roughness: 0.95, metalness: 0, envMapIntensity: 0 }));
    // 把貼圖座標放大 40 倍 = 地板貼圖重複鋪 40 x 40 次
    fl.geometry.attributes.uv.array.forEach((v, i, a) => {
      a[i] = v * 40;
    });
    fl.rotation.x = -PI / 2;
    fl.receiveShadow = true;
    sc.add(fl);
    // 滑鼠拖曳旋轉
    const cv = $('game');
    cv.addEventListener('mousedown', e => {
      if (G.state === 'hangar') {
        this.drag = true;
        this.lx = e.clientX;
      }
    });
    addEventListener('mouseup', () => {
      this.drag = false;
    });
    addEventListener('mousemove', e => {
      if (this.drag && G.state === 'hangar') {
        const d = (e.clientX - this.lx) * 0.01;
        this.rot += d;
        this.spinV = clamp(d * 30, -3, 3);
        this.lx = e.clientX;
      }
    });
  },

  // 依照目前選的機體、塗裝、武器、小兵，重新建立展示用的模型（每次更換選項都會呼叫）
  refresh() {
    const sc = this.scene;
    // 先把舊的模型釋放掉，避免佔用顯示卡記憶體
    if (this.rig) {
      disposeRig(this.rig);
      this.proto.traverse(o => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
    for (const m of this.minis) disposeRig(m);
    this.minis = [];
    // 建立新的機體並放到展示台上
    const ch = byId(CHASSIS, LOADOUT.chassis), paint = byId(PAINTS, LOADOUT.paint);
    this.proto = MECH_BUILDERS[ch.id](paint, LOADOUT.pri, LOADOUT.sec);
    const rig = this.rig = instRig(this.proto);
    rig.root.position.set(0, 0.7, 0);
    sc.add(rig.root);
    rig.shoulder[0].rotation.x = 0.12;
    rig.shoulder[1].rotation.x = 0.12;
    // 依機體的高度與體型調整鏡頭，讓大型機體也能完整入鏡
    this.camera.position.set(0, 8.5 + (rig.height - 10) * 0.3, 34 * Math.max(1, ch.cam * 0.96));
    this.camera.lookAt(0, 5.6 + (rig.height - 10) * 0.3, 0);
    // 把選好的兩種小兵放在機體左右兩側
    LOADOUT.minions.forEach((id, i) => {
      if (!id) return;                     // 這一格還沒選小兵
      const d = byId(MINIONS, id), m = makeUnit(id, paint), sd = i ? 1 : -1;
      m.root.position.set(sd * 13.5, d.fly ? 3.2 : 0.24, 6.5);
      m.root.rotation.y = -sd * 0.5;
      m.baseY = m.root.position.y;
      m.fly = !!d.fly;
      sc.add(m.root);
      this.minis.push(m);
    });
  },

  // 每一格更新：自動慢慢旋轉、待機動作（腰部與頭部微微擺動、光翼開合、小兵上下飄浮）
  update(dt) {
    this.t += dt;
    if (!this.drag) {
      this.spinV = damp(this.spinV, 0.25, 2, dt);
      this.rot += this.spinV * dt;
    }
    const rig = this.rig;
    if (!rig) return;
    rig.root.rotation.y = this.rot;
    animRig(rig, dt, 0);
    rig.waist.rotation.y = Math.sin(this.t * 0.6) * 0.12;
    if (rig.head) rig.head.rotation.y = Math.sin(this.t * 0.9 + 1) * 0.25;
    if (rig.spin) rig.spin.rotation.z += dt * 2;
    if (rig.wings[0]) {
      const o = 0.5 + 0.5 * Math.sin(this.t * 0.8);
      rig.wings[0].rotation.z = -0.4 * o;
      rig.wings[1].rotation.z = 0.4 * o;
      rig.wings[0].rotation.x = rig.wings[1].rotation.x = -0.2 * o;
    }
    for (const m of this.minis) {
      if (m.fly) m.root.position.y = m.baseY + Math.sin(this.t * 2 + m.phase) * 0.3;
      if (m.waist) m.waist.rotation.y = Math.sin(this.t * 0.8 + m.phase) * 0.4;
      animRig(m, dt, 0);
    }
  },
};

// ---------------- 畫質 ----------------
// 套用畫質設定（0 低 / 1 中 / 2 高）：解析度、是否開啟光暈與影子、影子的精細度
function applyQuality() {
  const q = LOADOUT.quality, r = APP.renderer;
  // 中、高畫質都以螢幕原生解析度繪製（之前中畫質會被放大而變糊）
  r.setPixelRatio(q === 0 ? Math.min(devicePixelRatio, 1) : q === 1 ? Math.min(devicePixelRatio,
      1.5) : Math.min(devicePixelRatio, 2));
  APP.useComposer = q > 0 && !!APP.composer;
  const sun = APP.lights.sun;
  sun.castShadow = q > 0;
  // 影子貼圖的解析度；有改變時要把舊的丟掉重建
  const ms = q === 2 ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== ms) {
    sun.shadow.mapSize.set(ms, ms);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  onResize();
}

// 建立光暈後製（讓發光的東西周圍有一圈光暈）。瀏覽器不支援時回傳 null，改用一般繪製
function makeComposer() {
  const T = THREE;
  if (!T.EffectComposer || !T.RenderPass || !T.ShaderPass || !T.UnrealBloomPass ||
      !T.GammaCorrectionShader) return null;
  try {
    const sz = APP.renderer.getDrawingBufferSize(new T.Vector2());
    const rt = new T.WebGLRenderTarget(sz.x, sz.y, { type: T.HalfFloatType, samples: 4 });
    const comp = new T.EffectComposer(APP.renderer, rt);
    APP.renderPass = new T.RenderPass(G.scene, G.camera);
    comp.addPass(APP.renderPass);
    // 光暈的三個數字：強度 0.6、擴散半徑 0.4、亮度門檻 0.98（只有很亮的地方才會發光）
    APP.bloom = new T.UnrealBloomPass(new T.Vector2(sz.x, sz.y), 0.6, 0.4, 0.98);
    comp.addPass(APP.bloom);
    comp.addPass(new T.ShaderPass(T.GammaCorrectionShader));
    return comp;
  } catch (e) {
    console.warn('後製初始化失敗，改用一般渲染', e);
    return null;
  }
}

// 視窗大小改變時，同步調整繪圖器、兩台攝影機、後製與覆蓋層畫布的尺寸
function onResize() {
  const r = APP.renderer, w = innerWidth, h = innerHeight;
  r.setSize(w, h, false);
  G.camera.aspect = Hangar.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  Hangar.camera.updateProjectionMatrix();
  if (APP.composer) {
    const sz = r.getDrawingBufferSize(new THREE.Vector2());
    APP.composer.setSize(sz.x, sz.y);
  }
  const ov = $('overlay');
  ov.width = w;
  ov.height = h;
}

// 把指定的場景畫到螢幕上
function renderScene(scene, camera) {
  // 機庫一律直接繪製、不經過光暈後製，發光處周圍才不會糊成一片；戰鬥場景才使用光暈
  if (APP.useComposer && scene !== Hangar.scene) {
    APP.renderPass.scene = scene;
    APP.renderPass.camera = camera;
    APP.composer.render();
  }
  else APP.renderer.render(scene, camera);
}

// ---------------- 畫面切換 ----------------
// 顯示或隱藏某個介面區塊（加上或拿掉 hidden 這個 CSS 類別）
function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

// 回到機庫：結束戰鬥、切換介面、回到第一個分頁、換回機庫音樂
function gotoHangar() {
  if (document.exitPointerLock) document.exitPointerLock();
  clearBattle();
  G.state = 'hangar';
  // 清掉戰鬥時畫在覆蓋層上的血條與道具標籤，不然它們會殘留在機庫畫面上
  UI.ovx.clearRect(0, 0, UI.ov.width, UI.ov.height);
  show('hangar', true);
  show('hud', false);
  show('pause', false);
  show('result', false);
  UI.tab = TABS[0].id;
  UI.renderTab();
  UI.renderSide();
  SND.setDuck(1);
  MUSIC.set('hangar');
  Hangar.refresh();
}

// 出擊：切換到戰鬥介面，依目前的配置開始一場戰鬥
function launch() {
  SND.init();
  SND.play('select');
  show('hangar', false);
  show('pause', false);
  show('result', false);
  show('hud', true);
  // 傳一份配置的複本進去，戰鬥中就算修改也不會影響機庫的選擇
  startBattle(JSON.parse(JSON.stringify(LOADOUT)));
  UI.buildHud();
  SND.setDuck(1);
  MUSIC.set('battle', null, 1);
  APP.musT = 0;
  lockPointer();
}

// 把滑鼠鎖定在畫面內（之後移動滑鼠就是轉動視角）
function lockPointer() {
  const c = $('game');
  if (c.requestPointerLock) {
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* 忽略 */
    }
  }
}
// 暫停：清掉所有按住的按鍵、顯示暫停選單、把音樂壓低
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.keys = {};
  G.input.lmb = G.input.rmb = false;
  show('pause', true);
  SND.setDuck(0.35);
}
// 繼續遊戲
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  show('pause', false);
  lockPointer();
  APP.last = performance.now();
  SND.setDuck(1);
}

// ---------------- 輸入 ----------------
// 註冊所有鍵盤、滑鼠與按鈕事件（只呼叫一次）
function initInput() {
  const I = G.input, cv = $('game');
  // 按下按鍵：keys 記錄「目前按住」，pressed 記錄「這一格剛按下」（技能這類只觸發一次的用 pressed）
  addEventListener('keydown', e => {
    if (G.state === 'playing') {
      if (!e.repeat) I.pressed[e.code] = true;
      I.keys[e.code] = true;
      if (e.code === 'Escape' && !APP.locked) pauseGame();
      // 阻止瀏覽器對這些按鍵的預設行為（例如空白鍵捲動頁面）
      if (['Space', 'Tab', 'KeyQ', 'KeyE', 'KeyF', 'KeyR', 'Digit1', 'Digit2', 'ShiftLeft'].includes(e.code) ||
          e.ctrlKey) e.preventDefault();
    } else if (G.state === 'paused' && e.code === 'Escape') resumeGame();
  });
  addEventListener('keyup', e => {
    I.keys[e.code] = false;
  });
  // 視窗失去焦點（切到別的視窗）：放開所有按鍵並自動暫停
  addEventListener('blur', () => {
    I.keys = {};
    I.lmb = I.rmb = false;
    if (G.state === 'playing') pauseGame();
  });
  // 滑鼠按下：左鍵 = 主武器、右鍵 = 副武器；滑鼠還沒鎖定時，這一下先用來鎖定
  document.addEventListener('mousedown', e => {
    if (G.state !== 'playing') return;
    if (!APP.locked) {
      lockPointer();
      return;
    }
    if (e.button === 0) I.lmb = true;
    else if (e.button === 2) I.rmb = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) I.lmb = false;
    else if (e.button === 2) I.rmb = false;
  });
  // 不要跳出右鍵選單
  document.addEventListener('contextmenu', e => e.preventDefault());
  // 累積滑鼠移動量，game.js 每一格讀取後用來轉動視角
  document.addEventListener('mousemove', e => {
    if (APP.locked && G.state === 'playing') {
      I.mx += e.movementX || 0;
      I.my += e.movementY || 0;
    }
  });
  // 按 Esc 會解除滑鼠鎖定：戰鬥中解除就自動暫停
  document.addEventListener('pointerlockchange', () => {
    const was = APP.locked;
    APP.locked = document.pointerLockElement === cv;
    if (was && !APP.locked && G.state === 'playing') pauseGame();
  });
  addEventListener('resize', onResize);
  // 瀏覽器規定要使用者先點一下才能出聲：第一次點擊時啟動音訊並播放機庫音樂
  document.addEventListener('pointerdown', () => {
    SND.init();
    if (G.state === 'hangar') MUSIC.set('hangar');
  }, { once: true });
  // 機庫底部的大按鈕：前六步是「下一步」，最後一步才是「出擊」
  $('launch').onclick = () => {
    if (!UI.isLastStep()) {
      UI.nextStep();
      return;
    }
    // 技能或小兵還沒選滿：跳回那個分頁並提示，不直接出擊
    const miss = UI.missing();
    if (miss) {
      const n = LOADOUT[miss.id].filter(i => i === null).length;
      UI.gotoTab(miss.id);
      SND.play('deny', 0.4);
      UI.flashPicks(`還少 ${n} 個${miss.name}，選滿才能出擊`);
      return;
    }
    launch();
  };
  // 其餘按鈕：上一步、繼續、退出、再次出擊、返回機庫
  $('prev').onclick = () => UI.prevStep();
  $('btn-resume').onclick = resumeGame;
  $('btn-quit').onclick = gotoHangar;
  $('btn-again').onclick = launch;
  $('btn-back').onclick = gotoHangar;
}

// ---------------- 主迴圈 ----------------
// 每一格（通常每秒 60 次）由瀏覽器呼叫一次：更新遊戲邏輯，然後畫出畫面
function frame(now) {
  requestAnimationFrame(frame);
  // dt = 距離上一格過了幾秒（限制在 0.001 ~ 0.05 之間，避免卡頓後東西瞬間飛很遠）
  let dt = Math.min(0.05, Math.max(0.001, (now - APP.last) / 1000));
  APP.last = now;
  if (G.slow > 0) {
    G.slow -= dt;
    dt *= 0.3;
  }  // 擊破 Boss 時的慢動作
  // 機庫畫面：只更新並繪製機庫場景
  if (G.state === 'hangar') {
    Hangar.update(dt);
    renderScene(Hangar.scene, Hangar.camera);
    return;
  }
  if (G.state === 'boot' || !G.player) return;
  // 只有在戰鬥中、陣亡動畫中、勝利演出中才更新遊戲邏輯（暫停時不更新，但畫面照畫）
  const running = G.state === 'playing' || G.state === 'dying' || G.state === 'won';
  if (running) {
    updateGame(dt);
    FX.update(dt, G.camera, APP.renderer.domElement.height);
    // 每半秒檢查一次該播哪首音樂：有 Boss 就播該 Boss 的專屬曲，否則播一般戰鬥曲
    APP.musT -= dt;
    if (APP.musT <= 0 && G.state === 'playing') {
      APP.musT = 0.5;
      if (G.boss) MUSIC.set('boss', G.boss.kind);
      else MUSIC.set('battle', null, G.wave);
    }
  }
  const P = G.player;
  if (!P) return;
  // 天空球永遠跟著鏡頭，看起來才會無限遠
  APP.sky.position.copy(G.camera.position);
  // 太陽光的影子範圍跟著玩家移動（每 4 公尺對齊一次，影子邊緣才不會抖動）
  const sun = APP.lights.sun, tx = Math.round(P.x / 4) * 4, tz = Math.round(P.z / 4) * 4;
  sun.target.position.set(tx, 0, tz);
  sun.position.set(tx + SKY.sunDir.x * 260, SKY.sunDir.y * 260, tz + SKY.sunDir.z * 260);
  // 更新介面：血條等 HUD、畫在覆蓋層上的血條與標籤、「點擊畫面鎖定滑鼠」提示
  if (running) UI.updateHud(dt);
  UI.drawOverlay();
  show('lockhint', G.state === 'playing' && !APP.locked);
  renderScene(G.scene, G.camera);
}

// ---------------- 啟動 ----------------
// 網頁載入後立刻執行：建立繪圖器、貼圖、材質、場景、特效、機庫與介面，然後開始主迴圈
(function boot() {
  if (!window.THREE) {
    $('ld-msg').textContent = '無法載入 3D 引擎（Three.js）。請確認網路連線後重新整理。';
    return;
  }
  try {
    // 建立繪圖器並設定顏色空間與影子
    const r = APP.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true,
        powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    initTextures();
    initMaterials();
    // 戰場的場景與攝影機（視角 62 度，最遠看到 1800 公尺）
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 1800);
    APP.sky = buildSky();
    G.scene.add(APP.sky);
    APP.lights = setupLights(G.scene);
    // 用天空產生環境反射貼圖，讓金屬機身有反光
    const pm = new THREE.PMREMGenerator(r), es = new THREE.Scene();
    es.add(buildSky());
    const env = pm.fromScene(es, 0.03, 1, 2000).texture;
    pm.dispose();
    G.scene.environment = env;
    // 依序初始化各個系統
    FX.init(G.scene);
    initGameObjects();
    Hangar.init(env);
    APP.composer = makeComposer();
    UI.init();
    // 機庫裡更換選項時重建展示模型；更換畫質時立即套用
    UI.onChange = () => Hangar.refresh();
    UI.onQuality = applyQuality;
    initInput();
    applyQuality();
    gotoHangar();
    // 全部準備好了：隱藏載入畫面，開始主迴圈
    $('loading').classList.add('hidden');
    APP.last = performance.now();
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    $('ld-msg').textContent = '啟動失敗：' + err.message;
  }
})();
