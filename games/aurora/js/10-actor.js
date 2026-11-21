/*
 * ============================================================
 *  10-actor.js ── 角色基礎、輸入與玩家
 * ------------------------------------------------------------
 *    Actor   所有角色（玩家、電腦、首領）共用的基礎：
 *            位置、生命、護甲、武器、受傷、撿補給、模型更新
 *    Input   鍵盤與滑鼠的狀態
 *    Player  玩家：操作、攝影機、後座力、開鏡、技能、第一人稱的槍
 *
 *  方向約定：yaw = 0 面向 -Z；往右轉 yaw 變小；pitch 為正是往上看。
 * ============================================================
 */

let ACTOR_ID = 1; // 每個角色的流水號

class Actor {
  /* opt 的欄位：
   *   name 名稱   team 隊伍   hp / armor 生命與護甲上限   speed 速度倍率
   *   weapons 武器代號陣列   scale 體型   hover 懸浮高度（無人機、核心）
   *   radius / height 碰撞尺寸（預設為一般人形） */
  constructor(opt) {
    this.id = ACTOR_ID++;
    this.name = opt.name || "UNIT";
    this.team = opt.team ?? 0;
    this.isPlayer = false;
    this.isBoss = false;

    // 身體
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.scale = opt.scale || 1;
    this.radius = opt.radius || CONFIG.BODY.radius;
    this.height = opt.height || CONFIG.BODY.height * this.scale;
    this.hover = opt.hover || 0;
    this.onGround = true;
    this.crouch = 0; // 0 站立 ～ 1 完全蹲下

    // 生命
    this.maxHp = this.hp = opt.hp || 100;
    this.maxArmor = opt.armor || 0;
    this.armor = this.maxArmor;
    this.alive = true;
    this.invuln = 0; // 無敵剩餘秒數
    this.damageTakenMult = 1;
    this.marked = 0; // 被掃描標記的剩餘秒數
    this.lastDamageTime = -99;
    this.lastAttacker = null;
    this.lastShotTime = -99;
    this.speedMult = opt.speed || 1;

    // 各種加成（生存模式的強化會修改這些數值）
    this.mods = { damage: 1, fireRate: 1, reload: 1, head: 1, leech: 0, explosive: 0, mag: 1, speed: 1, cooldown: 1 };

    // 武器
    this.weapons = (opt.weapons || ["ar"]).map((id) => new WeaponState(WEAPONS[id], this));
    this.weaponIndex = 0;
    this.grenades = this.maxGrenades = opt.grenades ?? 0;

    // 戰績
    this.stats = {
      kills: 0, deaths: 0, assists: 0, score: 0, damage: 0, headshots: 0, shots: 0, hits: 0, streak: 0, bestStreak: 0,
      bossDamage: 0, // 對首領造成的傷害
      weaponKills: {}, // 各武器的擊殺數 { 武器名稱: 次數 }
      killsBy: {}, // 擊殺各類敵人的數量 { 敵人名稱: 次數 }（生存／首領模式用）
    };
    this.hitBy = new Map(); // 最近打過我的人 → 時間（用來算助攻）

    // 命中判定的形狀：圓柱（半徑 r、高 h、底部在腳底上方 base）+ 頭部圓球
    const s = this.scale;
    this.hit = { r: 0.36 * s, h: 1.5 * s, base: 0, headY: 1.66 * s, headR: 0.17 * s };
    this.rig = null; // 3D 模型（由子類別建立）
  }

  get weapon() {
    return this.weapons[this.weaponIndex];
  }

  // 眼睛的世界高度
  eyeY() {
    if (this.eyeOffset !== undefined) return this.pos.y + this.eyeOffset; // 懸浮單位直接指定高度
    return this.pos.y + this.hover + Util.lerp(CONFIG.BODY.eye, CONFIG.BODY.crouchEye, this.crouch) * this.scale;
  }

  eyePos(out) {
    return out.set(this.pos.x, this.eyeY(), this.pos.z);
  }

  // 槍口的世界座標（有模型就用模型上的槍口點）
  muzzlePos(out) {
    if (this.rig && this.rig.muzzle) return this.rig.muzzle.getWorldPosition(out);
    return this.eyePos(out);
  }

  /* 受到傷害。回傳實際造成的傷害量。
   * 護甲會吸收 55% 的傷害，直到護甲耗盡。 */
  takeDamage(amount, attacker, info = {}) {
    if (!this.alive) return 0;
    amount *= this.damageTakenMult;
    const before = this.hp + this.armor; // 用來算「實際」扣掉多少（不含打死之後溢出的部分）
    const absorbed = Math.min(this.armor, amount * 0.55);
    this.armor -= absorbed;
    this.hp -= amount - absorbed;
    this.lastDamageTime = Game.time;
    if (attacker && attacker !== this) this.lastAttacker = attacker;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath(attacker, info);
    }
    return before - (this.hp + this.armor); // 實際造成的傷害（戰績統計用）
  }

  onDeath() {
    this.stats.deaths++;
    this.stats.streak = 0;
  }

  // 撿補給；已經滿了就回傳 false（不會浪費補給）
  usePickup(type) {
    if (type === "health") {
      if (this.hp >= this.maxHp) return false;
      this.hp = Math.min(this.maxHp, this.hp + 50);
    } else if (type === "armor") {
      // 護甲補給站：直接補滿。護甲上限低於 50 的幹員可以暫時補到 50（超出的部分不會自動恢復）
      const cap = Math.max(this.maxArmor, 50);
      if (this.armor >= cap) return false;
      this.armor = cap;
    } else if (type === "ammo") {
      let used = false;
      for (const ws of this.weapons) {
        if (ws.reserve < ws.def.reserve) {
          ws.reserve = Math.min(ws.def.reserve, ws.reserve + Math.ceil(ws.def.reserve * 0.5));
          used = true;
        }
      }
      return used;
    } else if (type === "grenade") {
      if (this.grenades >= this.maxGrenades || this.maxGrenades === 0) return false;
      this.grenades = Math.min(this.maxGrenades, this.grenades + 2);
    }
    return true;
  }

  refillAmmo() {
    for (const ws of this.weapons) ws.refill();
  }

  // 重新出生：回復生命、補滿彈藥、放到指定位置
  spawnAt(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.armor = this.maxArmor;
    this.alive = true;
    this.onGround = true;
    this.crouch = 0;
    this.hitBy.clear(); // 重生後，之前打過我的人不算助攻
    this.invuln = this.isPlayer ? 2.5 : 1.5; // 出生保護：玩家 2.5 秒（剛復活有時間看清楚狀況），電腦 1.5 秒
    this.grenades = this.maxGrenades;
    this.refillAmmo();
  }

  // 每幀共用的計時器
  tickTimers(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.marked = Math.max(0, this.marked - dt);
    for (const ws of this.weapons) Combat.tickWeapon(ws, dt);
  }

  // 把模型移到角色的位置並播放動作
  updateRig(dt) {
    if (!this.rig) return;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    // 把速度換算成「相對於面向」的前進與右移速度（側移、後退的動畫要用）
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const ws = this.weapon;
    this.rig.animate(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      fwd: -this.vel.x * sin - this.vel.z * cos,
      side: this.vel.x * cos - this.vel.z * sin,
      pitch: this.pitch,
      crouch: this.crouch,
      air: !this.onGround,
      reload: ws && ws.reloading ? 1 - ws.reloadLeft / ws.reloadTotal : 0,
      hit: Math.max(0, 1 - (Game.time - this.lastDamageTime) * 6),
      dead: !this.alive,
      deathDir: this.deathDir,
      hover: this.hover,
      fast: this.enraged,
      idle: this.target === null, // 電腦沒有交戰目標時會東張西望（玩家沒有 target 這個欄位）
    });
  }

  dispose() {
    if (this.rig) {
      Scene3D.scene.remove(this.rig.root);
      this.rig.mat.dispose();
      this.rig = null;
    }
  }
}

/* ============================================================
 *  Input ── 鍵盤滑鼠
 * ------------------------------------------------------------
 *    Input.down("KeyW")   這個鍵現在是否按著
 *    Input.hit("KeyR")    這個鍵是否「這一幀剛按下」
 *  每一幀結束要呼叫 Input.endFrame() 清掉「剛按下」的紀錄。
 * ============================================================ */
const Input = {
  keys: {},
  pressed: {},
  mouse: { dx: 0, dy: 0, left: false, right: false, leftHit: false, rightHit: false, wheel: 0 },
  locked: false, // 滑鼠是否被鎖定在遊戲畫面中
  sensitivity: 1.0,

  init(canvas) {
    this.canvas = canvas;
    this.sensitivity = Util.load("sens", 1.0);

    window.addEventListener("keydown", (e) => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      // 遊戲中擋掉瀏覽器預設行為（Tab 切換焦點、空白鍵捲動頁面）
      if (Game.state === "playing" && ["Tab", "Space", "KeyF", "Slash", "Quote"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => (this.keys[e.code] = false));
    window.addEventListener("blur", () => this.clear());

    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftHit = true;
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightHit = true;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.locked && !this.noLock) return;
      // 有些瀏覽器偶爾會回報異常巨大的位移，直接忽略
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    // 滾輪：滑鼠滾一格（一次事件）＝換一把槍；
    // 觸控板會送出很多很小的滾動量，累積到 60 才算一格，避免輕輕一滑就跳好幾把
    window.addEventListener("wheel", (e) => {
      if (Game.state === "playing") e.preventDefault(); // 遊戲中不要讓頁面捲動或縮放
      if (Math.sign(e.deltaY) !== Math.sign(this.wheelAcc || 0)) this.wheelAcc = 0; // 換方向就重新累積
      this.wheelAcc = (this.wheelAcc || 0) + (e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY);
      if (Math.abs(this.wheelAcc) >= 60) {
        this.mouse.wheel += Math.sign(this.wheelAcc);
        this.wheelAcc = 0;
      }
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) Game.onPointerUnlock();
    });
  },

  // 要求鎖定滑鼠（必須在使用者點擊後呼叫）
  lock() {
    if (document.pointerLockElement === this.canvas) return;
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {}); // 使用者太快按 Esc 時瀏覽器會拒絕，忽略即可
  },

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  },

  down(code) {
    return !!this.keys[code];
  },

  hit(code) {
    return !!this.pressed[code];
  },

  clear() {
    this.keys = {};
    this.pressed = {};
    this.mouse.left = this.mouse.right = false;
  },

  endFrame() {
    this.pressed = {};
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.mouse.leftHit = this.mouse.rightHit = false;
  },
};

/* ============================================================
 *  Player ── 玩家
 * ============================================================ */
class Player extends Actor {
  constructor(operator, team) {
    super({
      name: operator.name, team, hp: operator.hp, armor: operator.armor,
      speed: operator.speed, weapons: operator.weapons, grenades: operator.grenades,
    });
    this.isPlayer = true;
    this.operator = operator;

    // 視角
    this.recoilPitch = 0; // 後座力造成的額外仰角（會自動回正）
    this.recoilYaw = 0;
    this.ads = 0; // 開鏡程度 0~1
    this.camY = 0; // 平滑後的攝影機高度
    this.fov = 78;
    this.baseFov = Util.load("fov", 78);
    this.walkPhase = 0;
    this.landDip = 0; // 落地時鏡頭下沉
    this.deathT = 0;

    // 動作狀態
    this.swapT = 0; // 換槍動畫剩餘時間
    this.swapTo = -1;
    this.meleeT = 0;
    this.jumpBuffer = 0; // 提早按跳的緩衝時間
    this.coyote = 0; // 離開平台後仍可起跳的寬限時間
    this.sprinting = false;
    this.aimingGrenade = false;

    // 技能
    this.skillCd = 0;
    this.skillActive = 0; // 技能效果剩餘時間
    this.healLeft = 0; // 急救的持續回復量
    this.boostT = 0; // 衝刺後的加速時間

    // 隨身醫療包（H 鍵使用）：地圖上的紅色醫療箱改成補充醫療包
    this.maxMedkits = 3;
    this.medkits = 2;
    this.medkitT = 0; // 正在使用醫療包的剩餘秒數（期間會把槍放低）
    this.medHealLeft = 0; // 醫療包還沒回復完的量

    // 蹲下改成「切換」：按一下蹲、再按一下站起來
    this.crouchToggle = false;

    this._fireOrigin = new THREE.Vector3(); // 開火用的專屬暫存向量
    this._fireDir = new THREE.Vector3();

    this._buildViewModels();
    this._buildGrenadePreview();
  }

  /* ---------- 第一人稱的槍與手臂 ---------- */
  _buildViewModels() {
    this.view = new THREE.Group(); // 掛在武器場景裡，位置會隨動作晃動
    Scene3D.weaponScene.add(this.view);
    this.viewModels = this.weapons.map((ws) => {
      const model = WeaponModels.build(ws.def.id, this.operator.look.accent);
      const group = new THREE.Group();
      group.add(model.group);
      group.add(WeaponModels.arms(model.fore, this.operator.look));
      group.traverse((n) => { n.frustumCulled = false; n.castShadow = false; n.receiveShadow = false; });
      group.visible = false;
      this.view.add(group);
      return { group, muzzle: model.muzzle, eject: model.eject, sightY: model.sightY };
    });
    this.viewModels[0].group.visible = true;

    // 槍口火光（畫在武器場景，才不會被牆擋住）
    const mat = new THREE.SpriteMaterial({
      map: Tex.glowSprite(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      toneMapped: false
    });
    this.flashSprite = new THREE.Sprite(mat);
    this.flashSprite.visible = false;
    this.view.add(this.flashSprite);
    this.flashT = 0;

    // 持槍位置的動態偏移
    this.viewKick = 0; // 後座力把槍往後推
    this.viewSwayX = 0;
    this.viewSwayY = 0;
  }

  /* ---------- 手榴彈拋物線預覽 ---------- */
  _buildGrenadePreview() {
    const N = 48;
    this.previewPos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.previewPos, 3));
    this.previewLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(0xff8a2a).multiplyScalar(2.5),
        toneMapped: false,
        transparent: true,
        opacity: 0.9
      })
    );
    this.previewLine.frustumCulled = false;
    this.previewLine.visible = false;
    const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.previewRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff8a2a).multiplyScalar(2.5),
        toneMapped: false,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.previewRing.visible = false;
    Scene3D.scene.add(this.previewLine, this.previewRing);
  }

  dispose() {
    Scene3D.weaponScene.remove(this.view);
    Scene3D.scene.remove(this.previewLine, this.previewRing);
    this.previewLine.geometry.dispose();
    this.previewRing.geometry.dispose();
    this.flashSprite.material.dispose();
  }

  spawnAt(x, y, z, yaw) {
    super.spawnAt(x, y, z, yaw);
    this.camY = this.eyeY();
    this.recoilPitch = this.recoilYaw = 0;
    this.deathT = 0;
    this.ads = 0;
    this.swapT = 0;
    this.height = CONFIG.BODY.height;
    this.aimingGrenade = false;
    this.crouchToggle = false;
    this.medkits = Math.max(this.medkits, 2);
    this.medkitT = this.medHealLeft = 0;
  }

  // 玩家撿到醫療箱：補充一個隨身醫療包（滿了就不撿）
  usePickup(type) {
    if (type === "health") {
      if (this.medkits >= this.maxMedkits) return false;
      this.medkits++;
      return true;
    }
    return super.usePickup(type);
  }

  // 使用隨身醫療包：1 秒內把生命回復 60
  useMedkit() {
    if (this.medkits <= 0 || this.medkitT > 0 || this.hp >= this.maxHp) {
      if (this.medkits <= 0) HUD.toast("沒有醫療包了 — 去撿紅色醫療箱");
      return;
    }
    this.medkits--;
    this.medkitT = 1.0;
    this.medHealLeft = 60;
    this.aimingGrenade = false;
    Sound.play("pickup");
    Scene3D.post.flash = 0.08;
  }

  // 目前的瞄準方向（包含後座力）
  aimDir(out) {
    return Util.aimDir(this.yaw + this.recoilYaw, this.pitch + this.recoilPitch, out);
  }

  // 第一人稱槍口的世界座標（曳光彈起點）
  muzzlePos(out) {
    const cam = Scene3D.camera;
    const vm = this.viewModels[this.weaponIndex];
    // 槍口在「武器攝影機」裡的位置，換算到主攝影機的視野比例後再轉成世界座標
    out.copy(vm.muzzle).applyMatrix4(vm.group.matrixWorld);
    const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((Scene3D.weaponCamera.fov * Math.PI) / 360);
    out.x *= k;
    out.y *= k;
    return cam.localToWorld(out);
  }

  /* ============================================================
   *  每幀更新
   * ============================================================ */
  update(dt) {
    if (!this.alive) {
      this._updateDeathCamera(dt);
      return;
    }
    this.tickTimers(dt);
    this._look();
    this._move(dt);
    this._weapons(dt);
    this._skills(dt);
    this._updateCamera(dt);
    this._updateViewModel(dt);
  }

  /* ---------- 視角 ---------- */
  _look() {
    // 開鏡時依放大倍率降低靈敏度，準星才不會太飄
    const zoom = this.fov / this.baseFov;
    const sens = 0.0022 * Input.sensitivity * zoom;
    this.yaw -= Input.mouse.dx * sens;
    this.pitch = Util.clamp(this.pitch - Input.mouse.dy * sens, -1.5, 1.5);
    this.yaw = Util.wrapAngle(this.yaw);
    // 槍會稍微跟不上滑鼠（搖晃感）
    this.viewSwayX = Util.clamp(this.viewSwayX - Input.mouse.dx * 0.00018, -0.03, 0.03);
    this.viewSwayY = Util.clamp(this.viewSwayY + Input.mouse.dy * 0.00018, -0.03, 0.03);
  }

  /* ---------- 移動 ---------- */
  _move(dt) {
    const M = CONFIG.MOVE;
    const fwd = (Input.down("KeyW") ? 1 : 0) - (Input.down("KeyS") ? 1 : 0);
    const side = (Input.down("KeyD") ? 1 : 0) - (Input.down("KeyA") ? 1 : 0);

    // 蹲下：按 C 切換蹲／站；跳躍或衝刺會自動站起來。頭上有東西時不能站起來
    if (Input.hit("KeyC")) this.crouchToggle = !this.crouchToggle;
    if (this.crouchToggle && (Input.hit("Space") || (Input.down("ShiftLeft") && fwd > 0))) this.crouchToggle = false;
    const wantCrouch = this.crouchToggle;
    const canStand = World.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 1.2) > this.pos.y + CONFIG.BODY.height + 0.05;
    const crouchTarget = wantCrouch || !canStand ? 1 : 0;
    this.crouch = Util.damp(this.crouch, crouchTarget, 12, dt);
    this.height = Util.lerp(CONFIG.BODY.height, 1.25, this.crouch);
    // 蹲下時被打到的範圍也跟著變矮
    this.hit.h = Util.lerp(1.5, 1.0, this.crouch);
    this.hit.headY = Util.lerp(1.66, 1.14, this.crouch);

    // 衝刺：只能往前、不能開鏡、不能在換彈以外的射擊中
    this.sprinting = Input.down("ShiftLeft")
      && fwd > 0
      && this.crouch < 0.3
      && this.ads < 0.2
      && !Input.mouse.left
      && !this.aimingGrenade;

    let speed = this.sprinting ? M.sprint : M.walk;
    if (this.crouch > 0.5) speed = M.crouch;
    speed *= Util.lerp(1, M.adsMult, this.ads);
    speed *= this.speedMult * this.mods.speed * this.weapon.def.moveMult;
    if (this.boostT > 0) speed *= 1.3;

    // 把「前後左右」轉成世界座標的方向
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * side;
    let wz = -cos * fwd - sin * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    // 往目標速度加速（地面很快、空中很慢）
    const accel = (this.onGround ? M.accel : M.airAccel) * dt;
    const tx = wx * speed, tz = wz * speed;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dv = Math.hypot(dvx, dvz);
    if (dv > 0) {
      const k = Math.min(1, (accel * speed) / dv);
      // 空中沒按方向鍵時保留慣性
      if (this.onGround || len > 0) {
        this.vel.x += dvx * k;
        this.vel.z += dvz * k;
      }
    }

    // 跳躍：提早按（緩衝）或剛走出平台邊緣（寬限）都算數
    this.jumpBuffer = Input.hit("Space") ? 0.14 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canStand) {
      this.vel.y = M.jump;
      this.onGround = false;
      this.jumpBuffer = this.coyote = 0;
      Sound.play("jump");
    }

    this._jumpPads(dt);
    const event = World.stepBody(this, dt);
    if (event === "land") {
      Sound.play("land");
      this.landDip = 0.12;
    }

    // 腳步聲：依實際移動距離累積
    const moved = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moved > 1.5) {
      const before = Math.floor(this.walkPhase / Math.PI);
      this.walkPhase += dt * (4.5 + moved * 1.1);
      if (Math.floor(this.walkPhase / Math.PI) !== before) {
        Sound.play("step", { vol: this.sprinting ? 0.9 : this.crouch > 0.5 ? 0.25 : 0.55 });
        if (this.sprinting) Game.alertSound(this.pos.x, this.pos.z, 12);
      }
    }

    /* 自動恢復：
     *   護盾（護甲）  4 秒沒被打就開始恢復，每秒 10 點；一被打就重新計時
     *   生命          護盾回滿之後才會「很慢」地回一點（主要靠醫療包），速度由模式決定 */
    const safe = Game.time - this.lastDamageTime;
    this.armorRegen = safe > 4 && this.armor < this.maxArmor;
    if (this.armorRegen) {
      this.armor = Math.min(this.maxArmor, this.armor + 10 * dt);
    } else if (Game.rules.regen && safe > Game.rules.regenDelay && this.armor >= this.maxArmor && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + Game.rules.regen * 0.35 * dt);
    }
  }

  /* 跳躍板：站上去時，算出「剛好落在目標點」需要的速度，把玩家彈過去。
   * 往上的初速固定，飛行時間 = 上升 + 下降的時間，水平速度 = 水平距離 ÷ 飛行時間。 */
  _jumpPads(dt) {
    this.padCd = Math.max(0, (this.padCd || 0) - dt);
    const pads = Maps.runtime && Maps.runtime.pads;
    if (!pads || this.padCd > 0 || !this.onGround) return;
    for (const pad of pads) {
      if (Util.dist2D(this.pos.x, this.pos.z, pad.x, pad.z) > 0.95 || Math.abs(this.pos.y - pad.y) > 0.4) continue;
      const g = CONFIG.MOVE.gravity;
      const vy = Math.sqrt(2 * g * Math.max(1, pad.ty - pad.y + 2.2)); // 最高點比目標高 2.2 公尺
      const up = vy / g;
      const down = Math.sqrt((2 * (pad.ty - pad.y + 2.2 - (pad.ty - pad.y))) / g);
      const time = up + down;
      this.vel.set((pad.tx - this.pos.x) / time, vy, (pad.tz - this.pos.z) / time);
      this.onGround = false;
      this.padCd = 1;
      this.crouchToggle = false;
      Sound.play("dash");
      FX.ring(pad.x, pad.y + 0.1, pad.z, 2.5, pad.color, 0.4);
      FX.sparks(pad.x, pad.y + 0.3, pad.z, 0, 1, 0, pad.color, 16, 6);
      break;
    }
  }

  /* ---------- 武器操作 ---------- */
  _weapons(dt) {
    const ws = this.weapon;
    const def = ws.def;
    this.meleeT = Math.max(0, this.meleeT - dt);

    // 換槍：數字鍵或滾輪。滾輪的輸入先存起來，換槍動畫中滾動也不會被吃掉
    this.wheelQueue = Util.clamp((this.wheelQueue || 0) + Input.mouse.wheel, -2, 2);
    if (this.swapT > 0) {
      this.swapT -= dt;
      if (this.swapT <= 0.16 && this.swapTo >= 0) { // 動畫過半時真正切換
        this.viewModels[this.weaponIndex].group.visible = false;
        this.weaponIndex = this.swapTo;
        this.viewModels[this.weaponIndex].group.visible = true;
        this.swapTo = -1;
      }
    } else {
      let want = -1;
      if (Input.hit("Digit1")) want = 0;
      if (Input.hit("Digit2")) want = 1;
      if (Input.hit("Digit3")) want = 2;
      if (want < 0 && this.wheelQueue !== 0) {
        // 往下滾 → 下一把、往上滾 → 上一把（循環）
        const step = Math.sign(this.wheelQueue);
        this.wheelQueue -= step;
        want = (this.weaponIndex + step + this.weapons.length) % this.weapons.length;
      }
      if (want >= 0 && want !== this.weaponIndex && want < this.weapons.length) {
        this.swapTo = want;
        this.swapT = 0.34;
        HUD.slotFlash(want);
        ws.reloadLeft = 0; // 換槍會中斷換彈
        Sound.play("swap");
      }
    }
    // 換槍、近戰、使用醫療包時不能開槍
    const busy = this.swapT > 0 || this.meleeT > 0.25 || this.medkitT > 0;

    // 開鏡（右鍵）
    const wantAds = Input.mouse.right && !busy && !ws.reloading && !this.sprinting && !this.aimingGrenade;
    this.ads = Util.clamp(this.ads + (wantAds ? 1 : -1) * dt * 7, 0, 1);

    // 換彈
    if (Input.hit("KeyR") && !busy) Combat.startReload(this);

    // 手榴彈：按住 G 預覽拋物線，放開投擲，預覽中按左鍵取消
    if (Input.hit("KeyG") && this.grenades > 0 && !busy) this.aimingGrenade = true;
    if (this.aimingGrenade) {
      if (Input.mouse.leftHit) {
        this.aimingGrenade = false; // 取消
      } else if (!Input.down("KeyG")) {
        this.aimingGrenade = false;
        this.grenades--;
        Combat.throwGrenade(this, this.eyePos(TMP.v3), this.aimDir(TMP.v4));
        this.meleeT = 0.35;
      }
    }
    this._updateGrenadePreview();

    // 近戰（V 或 F）
    if ((Input.hit("KeyV") || Input.hit("KeyF")) && this.meleeT <= 0 && !this.aimingGrenade) {
      this.meleeT = CONFIG.MELEE.cooldown;
      Combat.melee(this, this.eyePos(TMP.v3), this.aimDir(TMP.v4));
    }

    // 射擊：連發槍按住就打，單發槍每次按下打一發
    const trigger = def.auto ? Input.mouse.left : Input.mouse.leftHit;
    if (trigger && !busy && !this.aimingGrenade) {
      const origin = this.eyePos(this._fireOrigin);
      const dir = this.aimDir(this._fireDir);
      // 姿勢散布：開鏡最準；移動、跳躍會變差；蹲下稍微變準
      let spread = Util.lerp(def.spreadHip, def.spreadAds, this.ads);
      const moving = Math.hypot(this.vel.x, this.vel.z) / CONFIG.MOVE.walk;
      spread += moving * (def.scope ? 2.5 : 0.9) * (1 - this.ads * 0.6);
      if (!this.onGround) spread += 2.5;
      if (this.crouch > 0.5) spread *= 0.75;

      if (Combat.tryFire(this, origin, dir, spread)) this._onFired(def);
    }

    // 後座力回正
    this.recoilPitch = Util.damp(this.recoilPitch, 0, 6.5, dt);
    this.recoilYaw = Util.damp(this.recoilYaw, 0, 6.5, dt);
  }

  // 成功開火後的回饋：後座力、火光、彈殼
  _onFired(def) {
    const k = Util.lerp(1, 0.62, this.ads) * (this.crouch > 0.5 ? 0.8 : 1);
    this.recoilPitch += ((def.recoil[0] * Math.PI) / 180) * k;
    this.recoilYaw += ((Util.rand(-1, 1) * def.recoil[1] * Math.PI) / 180) * k;
    this.viewKick = Math.min(1.4, this.viewKick + (def.recoil[0] > 2 ? 1.2 : 0.55));
    this.flashT = 0.05;
    Scene3D.weaponFlash.color.setHex(def.tracer);
    FX.shake = Math.min(1, FX.shake + def.recoil[0] * 0.035);
    HUD.crosshairKick(def.bloom);
    Game.alertSound(this.pos.x, this.pos.z, 38); // 槍聲會引來敵人

    // 彈殼：從拋殼口往右上方彈出（能量武器沒有彈殼）
    if (def.kind === "hitscan") {
      const cam = Scene3D.camera;
      const p = TMP.v1.set(0.16, -0.1, -0.5).applyMatrix4(cam.matrixWorld);
      const right = TMP.v2.set(1, 0.6, 0).applyQuaternion(cam.quaternion).multiplyScalar(2.6);
      right.x += this.vel.x;
      right.z += this.vel.z;
      FX.shell(p, right);
    }
    const m = this.muzzlePos(TMP.v1);
    // 槍口照亮周圍的光：能量武器與榴彈砲是連續的光彈，光太強會一直閃眼睛，所以調弱
    FX.light(m.x, m.y, m.z, def.tracer, def.kind === "projectile" ? 5 : 18, 0.06);
  }

  _updateGrenadePreview() {
    const show = this.aimingGrenade;
    this.previewLine.visible = this.previewRing.visible = show;
    if (!show) return;
    const G = CONFIG.GRENADE;
    const dir = this.aimDir(TMP.v4);
    const origin = this.eyePos(TMP.v3);
    const pos = new THREE.Vector3(origin.x + dir.x * 0.5, origin.y - 0.15, origin.z + dir.z * 0.5);
    const vel = new THREE.Vector3(
      dir.x * G.speed + this.vel.x * 0.5,
      dir.y * G.speed + 3.2,
      dir.z * G.speed + this.vel.z * 0.5
    );
    // 用和真的手榴彈完全相同的物理往後模擬，把經過的點連成線
    const N = this.previewPos.length / 3;
    const stepDt = G.fuse / (N - 1) / 2;
    for (let i = 0; i < N; i++) {
      this.previewPos[i * 3] = pos.x;
      this.previewPos[i * 3 + 1] = pos.y;
      this.previewPos[i * 3 + 2] = pos.z;
      Combat.stepGrenade(pos, vel, stepDt);
      Combat.stepGrenade(pos, vel, stepDt);
    }
    this.previewLine.geometry.attributes.position.needsUpdate = true;
    this.previewRing.position.set(pos.x, pos.y + 0.05, pos.z);
    this.previewRing.scale.setScalar(G.radius);
  }

  /* ---------- 技能（Q） ---------- */
  _skills(dt) {
    // 隨身醫療包：按 H 使用，持續回復
    if (Input.hit("KeyH") || Input.hit("Digit4")) this.useMedkit();
    if (this.medkitT > 0) this.medkitT -= dt;
    if (this.medHealLeft > 0) {
      const heal = Math.min(this.medHealLeft, 60 * dt);
      this.medHealLeft -= heal;
      this.hp = Math.min(this.maxHp, this.hp + heal);
    }

    this.skillCd = Math.max(0, this.skillCd - dt);
    this.boostT = Math.max(0, this.boostT - dt);

    // 持續效果
    if (this.skillActive > 0) {
      this.skillActive -= dt;
      if (this.skillActive <= 0) this.damageTakenMult = 1; // 護盾結束
    }
    if (this.healLeft > 0) {
      const heal = Math.min(this.healLeft, 9 * dt);
      this.healLeft -= heal;
      this.hp = Math.min(this.maxHp, this.hp + heal);
    }

    if (!Input.hit("KeyQ") || this.skillCd > 0) return;
    const skill = this.operator.skill;
    this.skillCd = skill.cooldown * this.mods.cooldown;
    this.skillActive = skill.duration;
    Sound.play(skill.id === "dash" ? "dash" : "skill");
    HUD.announce(skill.name, "技能啟動", this.operator.look.accent);

    if (skill.id === "heal") {
      this.hp = Math.min(this.maxHp, this.hp + 35);
      this.healLeft = 45;
      Scene3D.post.flash = 0.12;
    } else if (skill.id === "dash") {
      // 往目前移動方向衝；沒在移動就往前衝
      let dx = this.vel.x, dz = this.vel.z;
      if (Math.hypot(dx, dz) < 1) {
        dx = -Math.sin(this.yaw);
        dz = -Math.cos(this.yaw);
      }
      const len = Math.hypot(dx, dz);
      this.vel.x = (dx / len) * 26;
      this.vel.z = (dz / len) * 26;
      this.invuln = 0.3;
      this.boostT = skill.duration;
      this.fov += 14; // 瞬間拉寬視野，強調速度感
    } else if (skill.id === "scan") {
      for (const a of Combat.actors) if (a.alive && a.team !== this.team) a.marked = skill.duration;
      FX.ring(this.pos.x, this.pos.y + 0.2, this.pos.z, 60, 0x7dff9a, 1.2);
    } else if (skill.id === "shield") {
      this.armor = this.maxArmor;
      this.damageTakenMult = 0.4;
      FX.ring(this.pos.x, this.pos.y + 0.2, this.pos.z, 4, 0xffa23d, 0.5);
    } else if (skill.id === "strike") {
      // 找出準星指到的位置
      const o = this.eyePos(TMP.v3);
      const d = this.aimDir(TMP.v4);
      const hit = {};
      let dist = World.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 90, hit);
      const target = Combat.rayActors(o.x, o.y, o.z, d.x, d.y, d.z, Math.min(dist, 90), this);
      if (target) dist = target.dist;
      if (dist === Infinity) dist = 40;
      const x = o.x + d.x * dist, z = o.z + d.z * dist;
      const y = World.groundAt(x, z, o.y + d.y * dist + 0.5);
      Game.orbitalStrike(x, y, z, this);
    }
  }

  /* ---------- 攝影機 ---------- */
  _updateCamera(dt) {
    const cam = Scene3D.camera;
    const def = this.weapon.def;

    // 高度平滑：上下樓梯時不會一階一階地跳
    const eye = this.eyeY();
    this.camY = this.onGround ? Util.damp(this.camY, eye, 20, dt) : eye;
    if (Math.abs(this.camY - eye) > 0.6) this.camY = eye;
    this.landDip = Util.damp(this.landDip, 0, 9, dt);

    // 走路時的鏡頭晃動
    const moveAmt = this.onGround ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / CONFIG.MOVE.sprint) : 0;
    const bobY = Math.sin(this.walkPhase * 2) * 0.028 * moveAmt * (1 - this.ads * 0.8);
    const bobX = Math.cos(this.walkPhase) * 0.02 * moveAmt * (1 - this.ads * 0.8);

    cam.position.set(this.pos.x, this.camY - this.landDip + bobY, this.pos.z);
    const sh = FX.shake * 0.02;
    cam.rotation.set(
      this.pitch + this.recoilPitch + Util.rand(-sh, sh),
      this.yaw + this.recoilYaw + Util.rand(-sh, sh),
      bobX * 0.4 + Util.rand(-sh, sh) * 0.6,
    );

    // 視野：開鏡縮小、衝刺放大
    const targetFov = Util.lerp(this.baseFov + (this.sprinting ? 6 : 0), def.adsFov, Util.smooth(this.ads));
    this.fov = Util.damp(this.fov, targetFov, 14, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // 讓音效系統知道玩家在哪裡、面向哪邊
    Sound.listener.x = this.pos.x;
    Sound.listener.y = this.camY;
    Sound.listener.z = this.pos.z;
    Sound.listener.yaw = this.yaw;
  }

  // 死亡時攝影機倒向地面
  /* 擊殺鏡頭：陣亡後鏡頭從倒下的位置往上、往後拉開，
   * 轉向擊殺你的人，讓你看清楚是誰、從哪裡打你。
   * 鏡頭往後拉時會用射線檢查，碰到牆就停在牆前，不會穿進建築物。 */
  _updateDeathCamera(dt) {
    this.deathT += dt;
    this.previewLine.visible = this.previewRing.visible = false;
    const cam = Scene3D.camera;
    const t = Util.smooth(this.deathT / 0.9);

    // 要看的目標：擊殺者（還在場上的話），否則看自己倒下的位置
    const k = this.killer && this.killer !== this && this.killer.rig ? this.killer : null;
    const target = TMP.v1.set(this.pos.x, this.pos.y + 0.8, this.pos.z);
    if (k) target.set(k.pos.x, k.pos.y + k.hover + k.height * 0.6, k.pos.z);

    // 鏡頭位置：在自己上方 2.4 公尺，往「遠離擊殺者」的方向後退 3.5 公尺
    let bx = this.pos.x - target.x, bz = this.pos.z - target.z;
    const len = Math.hypot(bx, bz);
    if (len < 0.1) {
      bx = Math.sin(this.yaw);
      bz = Math.cos(this.yaw);
    } else {
      bx /= len;
      bz /= len;
    }
    const ox = this.pos.x, oy = this.pos.y + 1.0, oz = this.pos.z;
    const dir = TMP.v2.set(bx * 3.5, 1.4, bz * 3.5);
    const want = dir.length();
    dir.normalize();
    const hit = World.raycast(ox, oy, oz, dir.x, dir.y, dir.z, want, null);
    const dist = Math.min(want, hit - 0.3) * t; // 碰到牆就停在牆前
    const wantPos = TMP.v3.set(ox + dir.x * dist, oy + dir.y * dist + (this.camY - oy) * (1 - t), oz + dir.z * dist);
    cam.position.copy(wantPos);
    cam.rotation.set(0, 0, 0);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  }

  /* ---------- 第一人稱持槍動畫 ---------- */
  _updateViewModel(dt) {
    const vm = this.viewModels[this.weaponIndex];
    const ws = this.weapon;
    const def = ws.def;
    const a = Util.smooth(this.ads);
    const pistol = def.id === "pistol";

    // 腰射位置 → 開鏡位置（把瞄具中心對準畫面中央）
    let x = Util.lerp(0.19, 0, a);
    let y = Util.lerp(-0.2, -vm.sightY, a);
    let z = Util.lerp(pistol ? -0.5 : -0.36, pistol ? -0.4 : -0.24, a);
    let rx = 0, ry = 0, rz = 0;

    // 走路晃動
    const moveAmt = this.onGround ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / CONFIG.MOVE.walk) : 0;
    const bobScale = (1 - a * 0.85) * moveAmt;
    x += Math.cos(this.walkPhase) * 0.012 * bobScale;
    y += Math.abs(Math.sin(this.walkPhase)) * 0.014 * bobScale;

    // 視角拖曳、後座力
    this.viewSwayX = Util.damp(this.viewSwayX, 0, 8, dt);
    this.viewSwayY = Util.damp(this.viewSwayY, 0, 8, dt);
    this.viewKick = Util.damp(this.viewKick, 0, 13, dt);
    x += this.viewSwayX * (1 - a * 0.7);
    y += this.viewSwayY * (1 - a * 0.7);
    ry += this.viewSwayX * 1.5;
    z += this.viewKick * 0.045;
    rx += this.viewKick * 0.05 * (1 - a * 0.5);

    // 衝刺：槍斜放到一旁
    const sprintPose = this._sprintPose = Util.damp(this._sprintPose || 0, this.sprinting ? 1 : 0, 9, dt);
    x -= sprintPose * 0.06;
    y -= sprintPose * 0.06;
    ry += sprintPose * 0.7;
    rx -= sprintPose * 0.25;

    // 換彈：槍往下收、傾斜，再拉回來
    if (ws.reloading) {
      const p = 1 - ws.reloadLeft / ws.reloadTotal; // 0 → 1
      const dip = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      y -= dip * 0.16;
      rx += dip * 0.5;
      rz += dip * 0.5;
      x -= dip * 0.04;
      if (p > 0.84) z += Math.sin(((p - 0.84) / 0.16) * Math.PI) * 0.05; // 上膛的小抽動
    }
    // 換槍：整把槍先降下去，再升上來
    if (this.swapT > 0) {
      const p = Math.abs(this.swapT - 0.17) / 0.17; // 1 → 0 → 1
      y -= (1 - p) * 0.3;
      rx -= (1 - p) * 0.6;
    }
    // 近戰／投擲：往前揮一下
    if (this.meleeT > 0) {
      const p = Math.sin(Util.clamp(this.meleeT / CONFIG.MELEE.cooldown, 0, 1) * Math.PI);
      z -= p * 0.16;
      ry += p * 0.9;
      x -= p * 0.12;
      rz -= p * 0.4;
    }
    // 跳躍與落地：槍跟著慣性上下
    y += Util.clamp(-this.vel.y * 0.004, -0.03, 0.03) - this.landDip * 0.3;
    // 預覽手榴彈或使用醫療包時把槍放低，視野才清楚
    const low = this._lowPose = Util.damp(this._lowPose || 0, this.aimingGrenade || this.medkitT > 0 ? 1 : 0, 10, dt);
    y -= low * 0.16;
    rx -= low * 0.3;

    this.view.position.set(x, y, z);
    this.view.rotation.set(rx, ry, rz);
    this.view.updateMatrixWorld(true);

    // 狙擊鏡全開時隱藏槍身（改由 HUD 顯示瞄準鏡畫面）
    vm.group.visible = !(def.scope && this.ads > 0.9);

    // 槍口火光
    this.flashT -= dt;
    const flashing = this.flashT > 0 && vm.group.visible;
    this.flashSprite.visible = flashing;
    // 能量武器：槍口只有柔和的小光暈（沒有火藥爆炸），開鏡時更小，眼睛才不會一直被閃到
    const energy = def.id === "plasma";
    Scene3D.weaponFlash.intensity = flashing ? (energy ? 4 : 14) : 0;
    if (flashing) {
      this.flashSprite.position.copy(vm.muzzle).add(TMP.v1.set(0, 0, -0.05));
      const big = def.id === "shotgun" || def.id === "sniper" || def.id === "launcher";
      const size = energy ? 0.13 : big ? 0.42 : 0.24;
      this.flashSprite.scale.setScalar(size * Util.rand(0.8, 1.2) * (1 - a * 0.6));
      this.flashSprite.material.color.setHex(def.tracer).multiplyScalar(energy ? 1.4 : 3);
      this.flashSprite.material.rotation = Math.random() * 6.28;
      Scene3D.weaponFlash.position.copy(this.flashSprite.position).add(this.view.position);
    }
  }

  /* ---------- 受傷回饋 ---------- */
  takeDamage(amount, attacker, info) {
    const hadArmor = this.armor > 0;
    const dealt = super.takeDamage(amount, attacker, info);
    if (dealt > 0) {
      Scene3D.post.hurt = Math.min(0.9, Scene3D.post.hurt + dealt / 60);
      FX.shake = Math.min(1, FX.shake + dealt / 90);
      Sound.play(hadArmor ? "armorHit" : "hurt", { vol: 0.8 });
      if (attacker && attacker !== this) HUD.damageFrom(attacker.pos.x, attacker.pos.z);
    }
    return dealt;
  }

  onDeath(attacker, info) {
    super.onDeath(attacker, info);
    this.killer = attacker; // 擊殺鏡頭要看向這個人
    this.deathT = 0;
    this.aimingGrenade = false;
    this.healLeft = 0;
    this.damageTakenMult = 1;
  }
}
