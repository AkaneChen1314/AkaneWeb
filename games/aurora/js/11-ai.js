/*
 * ============================================================
 *  11-ai.js ── 電腦角色的 AI
 * ------------------------------------------------------------
 *  每個電腦角色（Bot）每一幀做四件事：
 *
 *    1. 感知 perceive：我看得到誰？（視野角度 + 射線檢查有沒有被牆擋住）
 *    2. 決策 decide ：依狀態決定要去哪裡
 *         - 交戰：在偏好距離內左右走位、找看得到敵人的射擊位置
 *         - 換彈／重傷：躲到敵人看不到的掩體後面，或去撿補血
 *         - 失去目標：到最後看到敵人的位置搜索
 *         - 沒事：依模式的指示前進（敵方基地、據點、玩家附近）
 *    3. 瞄準與射擊 aim / shoot：轉身需要時間、有反應時間、有瞄準誤差、
 *         會分段連發；只有真的看得到目標時才會開槍
 *    4. 移動 steer：沿著 A* 算出的路徑走；卡住會重新找路
 *
 *  「感知」與「決策」比較花時間，所以每 0.2 秒左右才做一次，
 *  而且每個 Bot 錯開時間，避免同一幀全部一起算。
 *
 *  團隊配合（讓電腦看起來像一支隊伍，而不是各打各的）：
 *    - 分散火力：已經有很多隊友在打的敵人，會被排到比較後面
 *    - 不誤擊：隊友擋在槍口前面時不開槍，改成往旁邊移一步
 *    - 包抄：隊友已經正面牽制住目標時，突擊型會繞到側面
 *    - 壓制：目標剛躲進掩體時，重裝型會朝他消失的位置再掃幾發
 *    - 空檔：沒有敵人時先換好彈匣、護甲或生命不夠就去撿補給
 * ============================================================
 */

class Bot extends Actor {
  /* profile 的欄位（由 Bot.fromOperator / Bot.fromEnemy 產生）：
   *   name, hp, armor, speed, weapon, role, aim, look, scale, hover, score, type, grenades */
  constructor(profile, team) {
    super({
      name: profile.name,
      team,
      hp: profile.hp,
      armor: profile.armor,
      speed: profile.speed,
      weapons: [profile.weapon],
      scale: profile.scale,
      hover: profile.hover,
      grenades: profile.grenades ?? 1,
    });
    // 角色定位：assault 突擊、rusher 衝鋒、sniper 狙擊、
    // heavy 重裝、drone 無人機。
    this.profile = profile;
    this.role = profile.role;
    this.aimSkill = profile.aim || 1;
    this.damageMult = profile.damageMult || 1;
    this.scoreValue = profile.score || 100;
    this.weapon.reserve = Infinity; // 電腦的備彈無限，但還是要換彈匣

    // 模型（首領會透過 profile.makeRig 提供自己的模型）
    // 建立外觀：首領與無人機有自己的模型。
    if (profile.makeRig) {
      this.rig = profile.makeRig();
    } else if (this.role === "drone") {
      this.eyeOffset = this.hover; // 無人機的「眼睛」就在機身中心
      this.rig = CharModels.drone(profile.look.accent);
      this.hit = { r: 0.5, h: 0.8, base: this.hover - 0.4, headY: 0, headR: 0 }; // 無人機沒有頭
      this.noPickup = true;
    } else {
      this.rig = CharModels.create(profile.look, { scale: this.scale });
      CharModels.setWeapon(this.rig, profile.weapon, profile.look.accent);
    }
    Scene3D.scene.add(this.rig.root);
    // 輪廓光：對玩家來說是敵人就發紅光、隊友發藍光（隊友較淡）
    if (team === 0) this.rig.rim.setRGB(0.12, 0.45, 0.65);
    else this.rig.rim.setRGB(1.0, 0.16, 0.2);

    // 感知
    this.target = null; // 目前鎖定的敵人
    this.visible = false; // 這一刻是否看得到目標
    this.seenFor = 0; // 已經連續看到目標多久（用來模擬反應時間）
    this.lastSeen = new THREE.Vector3(); // 最後看到目標的位置
    this.lastSeenTime = -99;
    this.viewRange = this.role === "sniper" ? 85 : 60;
    this.reaction = Game.difficulty.reaction * Util.rand(0.8, 1.3);
    this.thinkT = Math.random() * 0.25; // 下次思考的倒數（每個 Bot 起始值不同）

    // 瞄準
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aimOff = 9; // 目前槍口離目標還差多少（弧度）
    // 緩慢飄動的瞄準誤差
    this.errYaw = 0;
    this.errPitch = 0;
    this.errYawTo = 0;
    this.errPitchTo = 0;
    this.errT = 0;
    this.headAim = false; // 這一輪是否瞄頭
    this.burstLeft = Util.randInt(...this.weapon.def.botBurst);
    this.burstPause = 0;
    this.chargeT = 0; // 狙擊手的瞄準蓄力
    this.laser = null; // 狙擊手的瞄準雷射線

    // 移動
    this.path = null;
    this.pathIndex = 0;
    this.dest = null; // 路徑的終點
    this.pendingMove = null; // 這一幀尋路額度用完時，留到下一幀
    this.moveMode = "run";
    this.stuckT = 0;
    this.stuckCount = 0;
    this.stuckPos = new THREE.Vector3();
    this.wide = false; // 是否使用寬路徑（首領）

    // 決策
    this.goal = null;
    this.goalT = 0;
    this.combatMoveT = 0;
    this.coverT = 0;
    this.repathT = 0;
    this.evadeT = 0;
    this.searchT = 0;
    this.searchStops = 0;
    this.lookYaw = null;
    this.lookT = 0;
    this.crouchWant = false;
    this.grenadeCd = Util.rand(4, 10);
    this.flankT = Util.rand(3, 8); // 下次可以包抄的倒數
    this.flankUntil = 0; // 包抄移動進行到什麼時候（Game.time）
    this.spotCrouch = false; // 到了這個射擊位置之後要不要蹲著打
    this.canSuppress = false; // 目標剛躲起來，而且我還看得到他消失的位置
    this.skipT = 0; // 下次檢查「能不能抄近路」的倒數
    this.respawnT = 0; // 重生倒數（由模式設定）
    this.corpseT = 0;
  }

  /* ---------- 由幹員或敵人種類產生 profile ---------- */

  static NAMES = [
    "KITE",
    "ONYX",
    "FANG",
    "EMBER",
    "JINX",
    "ROOK",
    "VIPER",
    "ECHO",
    "NOVA-2",
    "DRIFT",
    "HALO",
    "SABLE",
    "PIKE",
    "WREN",
    "ZERO",
    "MOTH",
    "RAZE",
    "CINDER",
    "FLUX",
    "IVORY",
  ];

  // 團隊模式的電腦：使用某位幹員的裝備與外觀，發光色換成隊伍顏色
  static fromOperator(op, team, nameIndex, colorHex) {
    const weapon = op.weapons[0];
    const role =
      { sniper: "sniper", smg: "rusher", shotgun: "rusher", lmg: "heavy" }[
        weapon
      ] || "assault";
    const bot = new Bot(
      {
        type: op.id,
        name: Bot.NAMES[nameIndex % Bot.NAMES.length],
        hp: op.hp,
        armor: Math.round(op.armor * 0.5),
        speed: op.speed * 0.95,
        weapon,
        role,
        aim: 1,
        score: 100,
        grenades: 1,
        look: { ...op.look, accent: colorHex },
      },
      team,
    );
    bot.operator = op; // 結算畫面會顯示每個人用的幹員
    return bot;
  }

  // 生存／首領模式的敵人：hpScale 是難度與波次帶來的生命倍率
  static fromEnemy(typeId, team, hpScale = 1) {
    const t = ENEMY_TYPES[typeId];
    return new Bot(
      {
        type: t.id,
        name: t.name,
        hp: Math.round(t.hp * hpScale),
        armor: t.armor,
        speed: t.speed,
        weapon: t.weapon,
        role: t.role,
        aim: t.aim,
        damageMult: t.damageMult,
        score: t.score,
        scale: t.scale,
        hover: t.hover,
        look: t.look,
        grenades: t.role === "assault" || t.role === "heavy" ? 1 : 0,
      },
      team,
    );
  }

  // 移除模型與瞄準雷射。
  dispose() {
    super.dispose();
    if (this.laser) {
      Scene3D.scene.remove(this.laser);
      this.laser.geometry.dispose();
      this.laser.material.dispose();
      this.laser = null;
    }
  }

  // 重生：清除目標、路徑與所有決策狀態。
  spawnAt(x, y, z, yaw) {
    super.spawnAt(x, y, z, yaw);
    this.aimYaw = yaw;
    this.target = null;
    this.visible = false;
    this.lastSeenTime = -99;
    this.path = null;
    this.goal = null;
    this.evadeT = 0;
    this.flankUntil = 0;
    this.canSuppress = false;
    this.corpseT = 0;
    this.rig.reset();
    this.rig.root.visible = true;
    this.updateRig(0);
  }

  /* ============================================================
   *  每幀更新
   * ============================================================ */
  update(dt) {
    if (!this.alive) {
      // 屍體倒地後停留幾秒，接著化成光點、慢慢沉下去消失
      this.corpseT += dt;
      this.vel.set(0, 0, 0);
      if (this.corpseT > 3.8 && this.corpseT < 5 && this.rig.root.visible) {
        this.pos.y -= dt * 0.45;
        FX.dissolve(
          this.pos.x,
          this.pos.y,
          this.pos.z,
          0.6,
          this.team === 0 ? 0x35d6ff : 0xff4a5e,
          2,
        );
      }
      if (this.corpseT > 5) this.rig.root.visible = false;
      this.updateRig(dt);
      if (this.laser) this.laser.visible = false;
      return;
    }
    this.tickTimers(dt);
    this.combatMoveT -= dt;
    this.coverT -= dt;
    this.repathT -= dt;
    this.evadeT -= dt;
    this.grenadeCd -= dt;
    this.goalT -= dt;
    this.lookT -= dt;
    this.flankT -= dt;
    this.skipT -= dt;

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      const interval = 0.17 + Math.random() * 0.08;
      this.thinkT = interval;
      this.perceive(interval);
      this.decide(interval);
    }
    // 上一幀沒排到的尋路要求
    if (this.pendingMove && Bot.pathBudget > 0) {
      const m = this.pendingMove;
      this.pendingMove = null;
      this.moveTo(m.x, m.z, m.mode);
    }

    this.aim(dt);
    this.shoot(dt);
    this.steer(dt);

    // 蹲下：命中範圍也會跟著變矮
    if (this.role !== "drone") {
      this.crouch = Util.damp(this.crouch, this.crouchWant ? 1 : 0, 8, dt);
      this.hit.h = Util.lerp(1.5, 1.2, this.crouch) * this.scale;
      this.hit.headY = Util.lerp(1.66, 1.34, this.crouch) * this.scale;
    }
    this.updateRig(dt);
  }

  /* ============================================================
   *  1. 感知
   * ============================================================ */
  perceive(interval) {
    const eye = this.eyePos(Bot._v1);
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw); // 我面向的方向
    let best = null;
    let bestScore = Infinity;

    // 逐一檢查敵人，選出最值得攻擊的目標。
    for (const a of Combat.actors) {
      if (!a.alive || a.team === this.team) continue;
      const dx = a.pos.x - this.pos.x,
        dz = a.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.viewRange) continue;

      // 「注意到」的條件：在視野內、很近、剛打過我、剛開過槍，或本來就在追他
      const facing = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      const noticed =
        facing > 0.26 ||
        dist < 8 ||
        a === this.target ||
        (a === this.lastAttacker && Game.time - this.lastDamageTime < 4) ||
        (Game.time - a.lastShotTime < 1.2 && dist < 42);
      if (!noticed) continue;

      // 視線檢查：先看胸口，被擋住再看頭（敵人只露出頭也算看得到）
      const base = a.pos.y + a.hit.base;
      const seen =
        World.los(
          eye.x,
          eye.y,
          eye.z,
          a.pos.x,
          base + a.hit.h * 0.65,
          a.pos.z,
        ) ||
        (a.hit.headR > 0 &&
          World.los(eye.x, eye.y, eye.z, a.pos.x, base + a.hit.headY, a.pos.z));
      if (!seen) continue;

      // 偏好原本的目標（不會一直換人打），也略微偏好玩家；
      // 已經有隊友在打的敵人排後面一點，火力才會分散（每多一個隊友，距離當成遠 22%）
      const crowd =
        a === this.target ? 0 : Math.min(3, this.alliesTargeting(a));
      const score =
        dist *
        (a === this.target ? 0.6 : 1) *
        (a.isPlayer ? 0.9 : 1) *
        (1 + crowd * 0.22);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }

    // 發現或更換目標時，重新累積反應時間並決定這一輪是否瞄頭。
    if (best) {
      if (best !== this.target) {
        this.seenFor = 0;
        this.headAim = Math.random() < 0.18 * this.aimSkill;
        this.callForHelp(best);
      }
      this.target = best;
      this.visible = true;
      this.seenFor += interval;
      this.lastSeen.copy(best.pos);
      this.lastSeenTime = Game.time;
      this.canSuppress = false;
    } else {
      this.visible = false;
      if (this.target && !this.target.alive) {
        this.target = null;
        this.lastSeenTime = -99;
      }
      if (Game.time - this.lastSeenTime > 1.5) this.seenFor = 0;
      // 壓制射擊的條件：目標剛消失不到 0.9 秒，而且我和他消失的位置之間沒有東西擋著
      const t = this.target;
      const aimY = t ? this.lastSeen.y + t.hit.base + t.hit.h * 0.6 : 0;
      this.canSuppress =
        !!t &&
        Game.time - this.lastSeenTime < 0.9 &&
        World.los(eye.x, eye.y, eye.z, this.lastSeen.x, aimY, this.lastSeen.z);
    }
  }

  // 有幾個隊友正看著這個敵人（分散火力與決定要不要包抄時使用）
  alliesTargeting(enemy) {
    let n = 0;
    for (const a of Combat.actors) {
      if (
        a !== this &&
        a.alive &&
        a.team === this.team &&
        a.target === enemy &&
        a.visible
      )
        n++;
    }
    return n;
  }

  // 發現敵人時通知 22 公尺內還沒有目標的隊友
  callForHelp(enemy) {
    for (const a of Combat.actors) {
      if (
        a === this ||
        !a.alive ||
        a.team !== this.team ||
        !(a instanceof Bot) ||
        a.target
      )
        continue;
      if (Util.dist2D(a.pos.x, a.pos.z, this.pos.x, this.pos.z) < 22)
        a.hear(enemy.pos.x, enemy.pos.z);
    }
  }

  // 聽到聲音（槍聲、爆炸）：沒有目標時前往調查
  hear(x, z) {
    if (this.target && (this.visible || Game.time - this.lastSeenTime < 3))
      return;
    this.lastSeen.set(x + Util.rand(-2, 2), 0, z + Util.rand(-2, 2));
    this.lastSeenTime = Game.time - 1.6; // 設成「不久前看過」，會進入搜索狀態
    this.searchT = 0;
    this.searchStops = 0;
  }

  // 被打到：立刻知道是誰打的並轉身反擊
  takeDamage(amount, attacker, info) {
    const dealt = super.takeDamage(amount, attacker, info);
    if (
      this.alive &&
      attacker &&
      attacker !== this &&
      attacker.team !== this.team
    ) {
      const curDist = this.target
        ? Util.dist2D(
            this.target.pos.x,
            this.target.pos.z,
            this.pos.x,
            this.pos.z,
          )
        : Infinity;
      const newDist = Util.dist2D(
        attacker.pos.x,
        attacker.pos.z,
        this.pos.x,
        this.pos.z,
      );
      if (!this.target || !this.visible || newDist < curDist * 0.7) {
        this.target = attacker;
        this.lastSeen.copy(attacker.pos);
        this.lastSeenTime = Game.time;
        this.seenFor = Math.max(this.seenFor, this.reaction * 0.5); // 被打後反應更快
      }
      this.combatMoveT = Math.min(this.combatMoveT, 0.15); // 馬上換位置，不要站著挨打
    }
    return dealt;
  }

  // 死亡：記錄倒下的方向。
  onDeath(attacker, info) {
    super.onDeath(attacker, info);
    this.corpseT = 0;
    // 倒下的方向：被正面打中往後倒、從背後打中往前倒、從側面打中往側邊倒
    this.deathDir = { x: 1, z: 0 };
    if (attacker && attacker !== this) {
      const toA = Util.angleDiff(
        this.yaw,
        Util.yawTo(attacker.pos.x - this.pos.x, attacker.pos.z - this.pos.z),
      );
      if (Math.abs(toA) > 2.1) this.deathDir = { x: -1, z: 0 };
      else if (Math.abs(toA) > 1.0)
        this.deathDir = { x: 0, z: toA > 0 ? -1 : 1 };
    }
    this.path = null;
    this.chargeT = 0;
  }

  /* ============================================================
   *  2. 決策
   * ============================================================ */
  decide(interval) {
    // 最優先：附近有快爆炸的手榴彈就先逃
    if (this.evadeT > 0) return;
    const nade = this.dangerousGrenade();
    if (nade) return this.evade(nade);

    const t = this.target;
    const sinceSeen = Game.time - this.lastSeenTime;
    if (t && t.alive && (this.visible || sinceSeen < 1.2))
      return this.combat(t);
    // 沒在交戰的空檔：彈匣剩不到一半就先換好，下次遇敵才不會打到一半沒子彈
    const ws = this.weapon;
    if (!ws.reloading && ws.ammo < ws.magSize * 0.5 && sinceSeen > 2.5)
      Combat.startReload(this);
    if (sinceSeen < 9) return this.search(interval);
    this.target = null;
    this.crouchWant = false;
    this.roam();
  }

  /* ---------- 交戰 ---------- */
  combat(t) {
    const ws = this.weapon;
    const [near, far] = ws.def.botRange;
    const dist = Util.dist2D(t.pos.x, t.pos.z, this.pos.x, this.pos.z);
    this.searchT = 0;
    this.searchStops = 0;

    // 換彈中或重傷：找掩體（衝鋒型與重裝型不退）
    const fragile =
      this.role !== "rusher" && this.role !== "heavy" && this.role !== "drone";
    const hurt = fragile && this.hp < this.maxHp * 0.35;
    // 正在換彈或受傷很重：先找掩體。
    if ((ws.reloading && this.role !== "drone") || hurt) {
      if (this.coverT <= 0) {
        this.coverT = 1.4;
        if (!(hurt && this.seekHealth())) this.seekCover(t);
      }
      this.crouchWant = this.arrived() && ws.reloading;
      return;
    }
    this.crouchWant = false;
    this.maybeThrowGrenade(dist);

    // 正在繞到側面：先把這段路走完（邊走還是會邊瞄準開槍）；被打到就放棄包抄
    // 包抄途中繼續移動。
    if (this.flankUntil > Game.time) {
      if (!this.arrived() && Game.time - this.lastDamageTime > 0.4) return;
      this.flankUntil = 0;
    }

    // 據點模式：敵人還遠的時候邊打邊往據點推進，不要停在半路上對射
    // 目標模式：優先守住或搶下據點。
    if (Game.mode.objective && this.role !== "sniper") {
      if (!this.goal || !this.goal.point) this.goal = Game.mode.botGoal(this);
      const g = this.goal;
      const toPoint = Util.dist2D(g.point.x, g.point.z, this.pos.x, this.pos.z);
      if (dist > 12 && toPoint > g.point.r - 1.5) {
        if (this.repathT <= 0 || this.arrived()) {
          this.repathT = 1.5;
          this.moveTo(g.x, g.z, "run");
        }
        return;
      }
    }

    // 目標剛躲到牆後：往最後看到的位置推進
    // 看不到目標：往最後看到的位置追。
    if (!this.visible) {
      if (this.repathT <= 0) {
        this.repathT = 0.6;
        this.moveTo(this.lastSeen.x, this.lastSeen.z, "run");
      }
      return;
    }
    // 太遠：先靠近（衝鋒型會一路貼上去）
    const tooFar = this.role === "rusher" ? dist > far : dist > far * 1.25;
    // 太遠：靠近一點。
    if (tooFar) {
      if (this.repathT <= 0) {
        this.repathT = 0.5;
        this.moveTo(t.pos.x, t.pos.z, "run");
      }
      return;
    }

    // 狙擊手：位置好就蹲著不動專心瞄準；被打到才換位置
    // 狙擊手在安全距離外就站定射擊。
    if (
      this.role === "sniper" &&
      dist >= near &&
      Game.time - this.lastDamageTime > 1.5
    ) {
      if (this.arrived() || this.moveMode !== "combat") {
        this.stop();
        this.crouchWant = true;
      }
      if (this.combatMoveT > 0 || Math.random() < 0.9) return;
    }

    // 隊友已經從正面牽制住目標：突擊型與衝鋒型有機會繞到側面
    if (this.tryFlank(t, dist, near, far)) return;

    // 到了射擊位置而且決定蹲著打：壓低身體，比較不容易被打中
    this.crouchWant =
      this.spotCrouch &&
      this.arrived() &&
      this.role !== "rusher" &&
      this.role !== "drone";

    // 定期換一個射擊位置（走位）
    // 定時更換射擊位置。
    if (this.combatMoveT <= 0 || this.arrived()) {
      this.pickCombatSpot(t, dist, near, far);
      const pause = { sniper: [2.5, 4], heavy: [1.4, 2.4] }[this.role] || [
        0.6, 1.5,
      ];
      this.combatMoveT = Util.rand(pause[0], pause[1]);
      // 中距離以上有三成機率蹲著打（蹲著會在原地多待一下）
      this.spotCrouch = dist > 10 && Math.random() < 0.3;
      if (this.spotCrouch) this.combatMoveT += 0.8;
    }
  }

  /* 包抄：以目標為圓心，從我現在的方位轉 60～100 度，走到那個位置再打。
   * 只有「至少一個隊友正看著同一個目標」時才做，否則等於放著目標不管。
   * 回傳 true 表示已經開始包抄。 */
  tryFlank(t, dist, near, far) {
    if (this.flankT > 0 || (this.role !== "assault" && this.role !== "rusher"))
      return false;
    this.flankT = Util.rand(2, 4); // 不管成不成功，過一下再考慮
    const level = DIFFICULTIES.indexOf(Game.difficulty); // 難度越高越常包抄
    if (dist < near || dist > far * 1.3 || Math.random() > 0.25 + level * 0.12)
      return false;
    if (this.alliesTargeting(t) < 1) return false;

    const side = Math.random() < 0.5 ? -1 : 1;
    const base = Math.atan2(this.pos.z - t.pos.z, this.pos.x - t.pos.x); // 目標 → 我 的方位
    const r = Util.clamp(dist * 0.8, near + 1, far);
    for (const turn of [side, -side]) {
      // 一邊走不通就試另一邊
      const a = base + turn * Util.rand(1.05, 1.75);
      const p = Nav.randomNear(
        t.pos.x + Math.cos(a) * r,
        t.pos.z + Math.sin(a) * r,
        0,
        3,
        this.wide,
      );
      if (!p || Math.abs(p.y - this.pos.y) > 2) continue;
      if (!this.moveTo(p.x, p.z, "run")) continue;
      this.flankUntil = Game.time + 5;
      this.flankT = Util.rand(9, 15);
      this.spotCrouch = false;
      return true;
    }
    return false;
  }

  /* 挑選射擊位置：在周圍隨機取幾個點，替每個點打分數，選最高的。
   * 加分：看得到目標、距離接近偏好值、相對目標是橫向移動（比較難被打中）、佔高處
   * 扣分：離隊友太近、看不到目標 */
  pickCombatSpot(t, dist, near, far) {
    const pref =
      this.role === "rusher"
        ? near + 1
        : this.role === "sniper"
          ? far * 0.75
          : (near + far) * 0.45;
    const ty = t.pos.y + t.hit.base + t.hit.h * 0.65;
    const toX = (t.pos.x - this.pos.x) / Math.max(dist, 0.1),
      toZ = (t.pos.z - this.pos.z) / Math.max(dist, 0.1);
    const eyeH = this.eyeY() - this.pos.y; // 我的眼睛離腳底多高
    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 10; i++) {
      const p = Nav.randomNear(this.pos.x, this.pos.z, 1.5, 6.5, this.wide);
      if (!p || Math.abs(p.y - this.pos.y) > 1.3) continue;
      if (!Nav.lineClear(this.pos.x, this.pos.z, p.x, p.z, this.wide)) continue; // 必須能直線走到

      const d = Util.dist2D(p.x, p.z, t.pos.x, t.pos.z);
      let score = -Math.abs(d - pref) * 0.35;
      score += World.los(p.x, p.y + eyeH, p.z, t.pos.x, ty, t.pos.z) ? 2.2 : -3;
      const lateral = Math.abs(
        (p.x - this.pos.x) * toZ - (p.z - this.pos.z) * toX,
      ); // 橫向位移量
      score += Math.min(lateral, 4) * 0.35;
      score += Util.clamp((p.y - t.pos.y) * 0.2, -0.4, 0.6);
      for (const a of Combat.actors) {
        if (
          a !== this &&
          a.alive &&
          a.team === this.team &&
          Util.dist2D(a.pos.x, a.pos.z, p.x, p.z) < 2.5
        )
          score -= 1.5;
      }
      score += Math.random() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      this.moveDirect(best, "combat");
    } else {
      // 找不到能直線走到的點（例如被炸飛到箱子上）：改用尋路走到附近
      const p = Nav.randomNear(this.pos.x, this.pos.z, 2, 6, this.wide);
      if (p) this.moveTo(p.x, p.z, "combat");
    }
  }

  /* 找掩體：從附近「緊鄰障礙物」的格子裡，挑一個敵人看不到、而且離我最近的 */
  seekCover(threat) {
    const tx = threat.pos.x,
      tz = threat.pos.z;
    const tEye = threat.eyeY();
    const near = []; // 最近的 14 個候選格
    for (const i of Nav.coverCells) {
      const x = Nav.cellX(i),
        z = Nav.cellZ(i);
      const d = Math.abs(x - this.pos.x) + Math.abs(z - this.pos.z);
      if (d > 16 || Math.abs(Nav.h[i] - this.pos.y) > 1.5) continue;
      if (near.length < 14) near.push({ i, d });
      else {
        let worst = 0;
        for (let k = 1; k < near.length; k++)
          if (near[k].d > near[worst].d) worst = k;
        if (d < near[worst].d) near[worst] = { i, d };
      }
    }
    let best = null,
      bestScore = Infinity;
    for (const c of near) {
      const x = Nav.cellX(c.i),
        z = Nav.cellZ(c.i),
        y = Nav.h[c.i];
      if (World.los(x, y + 1.25, z, tx, tEye, tz)) continue; // 蹲著還是會被看到，不算掩體
      const score = c.d + (Util.dist2D(x, z, tx, tz) < 6 ? 10 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    if (best) return this.moveTo(best.x, best.z, "sprint");
    // 找不到掩體：至少往遠離敵人的方向退
    const away = Nav.randomNear(
      this.pos.x + (this.pos.x - tx) * 0.5,
      this.pos.z + (this.pos.z - tz) * 0.5,
      0,
      5,
    );
    if (away) this.moveTo(away.x, away.z, "sprint");
    return false;
  }

  // 重傷時如果附近有補血就去撿
  seekHealth() {
    let best = null,
      bestD = 24;
    for (const p of Combat.pickups) {
      if (!p.active || p.type !== "health") continue;
      const d = Util.dist2D(p.x, p.z, this.pos.x, this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? this.moveTo(best.x, best.z, "sprint") : false;
  }

  /* ---------- 搜索 ---------- */
  search(interval) {
    this.crouchWant = false;
    if (this.searchT <= 0) {
      // 剛進入搜索：前往最後看到的位置
      this.searchT = Util.rand(7, 10);
      this.searchStops = 0;
      this.moveTo(this.lastSeen.x, this.lastSeen.z, "run");
      return;
    }
    this.searchT -= interval;
    this.maybeThrowGrenade(
      Util.dist2D(this.lastSeen.x, this.lastSeen.z, this.pos.x, this.pos.z),
    );
    if (this.arrived()) {
      // 到了：四處張望，再去附近另一個點看看
      if (this.lookT <= 0) {
        this.lookYaw = Util.rand(-Math.PI, Math.PI);
        this.lookT = 0.9;
        this.searchStops++;
      }
      if (this.searchStops >= 2 && this.searchStops < 5) {
        const p = Nav.randomNear(this.lastSeen.x, this.lastSeen.z, 4, 11);
        if (p) this.moveTo(p.x, p.z, "walk");
      }
    }
    if (this.searchT <= 0.2 || this.searchStops >= 5) {
      // 放棄搜索
      this.target = null;
      this.lastSeenTime = -99;
      this.searchT = 0;
      this.lookYaw = null;
    }
  }

  /* ---------- 平時：依模式指示前進 ---------- */
  roam() {
    this.lookYaw = null;
    if (!this.goal || this.goalT <= 0 || this.arrived()) {
      // 護甲或生命不夠、附近又剛好有補給：先繞過去撿
      const supply = this.seekSupply();
      if (supply) {
        this.goal = { x: supply.x, z: supply.z, supply: true };
        this.goalT = Util.rand(6, 9);
        this.moveTo(supply.x, supply.z, "run");
        return;
      }
      this.goal = Game.mode.botGoal(this);
      this.goalT = Util.rand(8, 14);
      // 狙擊手喜歡佔領高處：有六成機率改去屋頂或平台
      if (
        this.role === "sniper" &&
        Nav.highCells.length &&
        !Game.mode.solo &&
        Math.random() < 0.6
      ) {
        const i = Util.pick(Nav.highCells);
        this.goal = { x: Nav.cellX(i), z: Nav.cellZ(i) };
        this.goalT = Util.rand(16, 24);
      }
      if (this.goal)
        this.moveTo(this.goal.x, this.goal.z, this.goal.mode || "run");
    }
  }

  // 找 26 公尺內用得到的補給：生命低於七成找醫療箱，護甲低於四成找護甲站
  seekSupply() {
    if (this.noPickup || this.isBoss) return null;
    const needHp = this.hp < this.maxHp * 0.7;
    const needArmor = this.maxArmor > 0 && this.armor < this.maxArmor * 0.4;
    if (!needHp && !needArmor) return null;
    let best = null,
      bestD = 26;
    for (const p of Combat.pickups) {
      if (
        !p.active ||
        !((p.type === "health" && needHp) || (p.type === "armor" && needArmor))
      )
        continue;
      const d = Util.dist2D(p.x, p.z, this.pos.x, this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /* ---------- 手榴彈 ---------- */

  // 目標躲在牆後、距離適中時，往他最後出現的位置丟手榴彈
  maybeThrowGrenade(dist) {
    if (this.grenades <= 0 || this.grenadeCd > 0 || this.role === "drone")
      return;
    const sinceSeen = Game.time - this.lastSeenTime;
    const hiding = !this.visible && sinceSeen > 0.8 && sinceSeen < 5;
    const level = DIFFICULTIES.indexOf(Game.difficulty); // 難度越高越愛丟
    if (!hiding || dist < 9 || dist > 26 || Math.random() > 0.12 + level * 0.1)
      return;
    // 落點 6 公尺內有隊友就不丟（隊友可能正要衝進去）
    for (const a of Combat.actors) {
      if (a === this || !a.alive || a.team !== this.team) continue;
      if (Util.dist2D(a.pos.x, a.pos.z, this.lastSeen.x, this.lastSeen.z) < 6)
        return;
    }

    const eye = this.eyePos(Bot._v1);
    const yaw = Util.yawTo(
      this.lastSeen.x - this.pos.x,
      this.lastSeen.z - this.pos.z,
    );
    // 拋射角：由「射程 = 速度² × sin(2θ) ÷ 重力」反推，再扣掉投擲時額外的上拋量
    const v = CONFIG.GRENADE.speed;
    const pitch = Util.clamp(
      0.5 * Math.asin(Util.clamp((dist * 16) / (v * v), 0, 1)) - 0.1,
      0.05,
      0.75,
    );
    const dir = Util.aimDir(yaw, pitch, Bot._v2);
    // 面前 3 公尺內有牆就不丟，免得彈回來炸到自己
    if (
      World.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3, null) <
      Infinity
    )
      return;

    this.grenades--;
    this.grenadeCd = Util.rand(9, 15);
    Combat.throwGrenade(this, eye, dir);
  }

  // 回傳會炸到我、而且快爆炸的手榴彈
  dangerousGrenade() {
    for (const g of Combat.grenades) {
      if (g.owner !== this && g.owner.team === this.team) continue; // 隊友的手榴彈不會傷到我
      if (
        g.fuse < 1.7 &&
        Util.dist2D(g.pos.x, g.pos.z, this.pos.x, this.pos.z) < 7.5
      )
        return g;
    }
    return null;
  }

  // 逃離手榴彈：挑一個離它最遠、而且能直線跑過去的點
  evade(g) {
    let best = null,
      bestD = 0;
    for (let i = 0; i < 10; i++) {
      const p = Nav.randomNear(this.pos.x, this.pos.z, 4, 10, this.wide);
      if (!p || !Nav.lineClear(this.pos.x, this.pos.z, p.x, p.z, this.wide))
        continue;
      const d = Util.dist2D(p.x, p.z, g.pos.x, g.pos.z);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) this.moveDirect(best, "sprint");
    this.evadeT = g.fuse + 0.25;
    this.crouchWant = false;
  }

  /* ============================================================
   *  3. 瞄準與射擊
   * ============================================================ */
  aim(dt) {
    const t = this.target;
    const tracking =
      t && t.alive && (this.visible || Game.time - this.lastSeenTime < 1.0);

    // 有目標：算出該瞄準的方向，加上誤差後轉過去。
    if (tracking) {
      // 瞄準點：看得到就瞄本人，否則瞄他最後出現的位置
      const tp = this.visible ? t.pos : this.lastSeen;
      let ax = tp.x,
        az = tp.z;
      let ay =
        tp.y +
        t.hit.base +
        (this.headAim && t.hit.headR > 0 ? t.hit.headY : t.hit.h * 0.62);
      const eyeY = this.eyeY();
      const dist = Math.hypot(ax - this.pos.x, az - this.pos.z);

      // 會飛行的彈體要預判：瞄準目標「子彈飛到時」會在的位置
      const proj = this.weapon.def.projectile;
      // 飛行物武器：預測目標的位置。
      if (proj && this.visible) {
        const time = dist / proj.speed;
        ax += t.vel.x * time;
        az += t.vel.z * time;
        if (proj.gravity) ay += 0.5 * proj.gravity * time * time - 2.2 * time; // 補償下墜
      }

      const wantYaw = Util.yawTo(ax - this.pos.x, az - this.pos.z);
      const wantPitch = Math.atan2(ay - eyeY, Math.max(0.5, dist));

      // 瞄準誤差：每隔一小段時間換一個偏移目標，再平滑地飄過去（像人手在抖）
      this.errT -= dt;
      // 定時更換瞄準誤差；目標移動越快誤差越大。
      if (this.errT <= 0) {
        this.errT = Util.rand(0.3, 0.7);
        const speedPenalty = 1 + Math.hypot(t.vel.x, t.vel.z) * 0.1; // 目標在跑比較難瞄
        const focus = 1.6 - Math.min(1, this.seenFor / 2) * 0.8; // 盯越久越準
        const e =
          (0.026 * Game.difficulty.botSpread * speedPenalty * focus) /
          this.aimSkill;
        this.errYawTo = Util.rand(-e, e);
        this.errPitchTo = Util.rand(-e, e) * 0.6;
      }
      this.errYaw = Util.damp(this.errYaw, this.errYawTo, 5, dt);
      this.errPitch = Util.damp(this.errPitch, this.errPitchTo, 5, dt);

      // 轉身有速度上限（不會瞬間鎖定）
      const turn = (this.isBoss ? 2.6 : 7.5) * dt;
      this.aimYaw = Util.turnToward(this.aimYaw, wantYaw + this.errYaw, turn);
      this.aimPitch += Util.clamp(
        wantPitch + this.errPitch - this.aimPitch,
        -turn,
        turn,
      );
      this.aimOff =
        Math.abs(Util.angleDiff(this.aimYaw, wantYaw)) +
        Math.abs(this.aimPitch - wantPitch);
      this.yaw = this.aimYaw;
      this.pitch = this.aimPitch;
    } else {
      // 沒有目標：面向移動方向；搜索時原地張望
      this.aimOff = 9;
      let wantYaw = this.yaw;
      if (Math.hypot(this.vel.x, this.vel.z) > 0.6)
        wantYaw = Util.yawTo(this.vel.x, this.vel.z);
      else if (this.lookYaw !== null) wantYaw = this.lookYaw;
      this.yaw = Util.turnToward(this.yaw, wantYaw, 6 * dt);
      this.pitch = Util.damp(this.pitch, 0, 6, dt);
      this.aimYaw = this.yaw;
      this.aimPitch = this.pitch;
    }
  }

  // 開火：確認看得到、反應時間已到而且槍口對準。
  shoot(dt) {
    const t = this.target;
    this.burstPause -= dt;
    if (this.calmT > 0) this.calmT -= dt; // 首領剛召喚出的小兵：這段時間內不開槍
    // 壓制射擊：目標剛躲進掩體時，重裝型（以及高難度的突擊型）會朝他消失的位置再打幾發
    const level = DIFFICULTIES.indexOf(Game.difficulty);
    const suppress =
      !this.visible &&
      this.canSuppress &&
      (this.role === "heavy" || (this.role === "assault" && level >= 2));
    const sees = this.visible || suppress;
    const canShoot =
      t &&
      t.alive &&
      sees &&
      this.seenFor >= this.reaction &&
      this.evadeT <= 0 &&
      !(this.calmT > 0);
    if (!canShoot) {
      this.chargeT = 0;
      if (this.laser) this.laser.visible = false;
      return;
    }
    const ws = this.weapon;
    if (ws.ammo <= 0) {
      Combat.startReload(this);
      return;
    }
    if (ws.reloading || this.burstPause > 0 || this.aimOff > 0.14) {
      if (this.laser && (ws.reloading || this.aimOff > 0.3)) {
        this.laser.visible = false;
        this.chargeT = 0;
      }
      return;
    }

    // 狙擊手開槍前會先瞄準一小段時間，並射出一道紅色雷射讓玩家有機會閃躲
    if (this.role === "sniper") {
      this.chargeT += dt;
      this.showLaser(t);
      if (this.chargeT < 0.45 + Game.difficulty.reaction) return;
    }
    if (ws.cooldown > 0) return;

    // 隊友擋在槍口前面：不開槍，馬上往旁邊換個位置
    if (this.allyInLine(t)) {
      this.combatMoveT = Math.min(this.combatMoveT, 0.1);
      this.flankUntil = 0;
      return;
    }

    const origin = this.eyePos(Bot._v1);
    const dir = Util.aimDir(this.aimYaw, this.aimPitch, Bot._v2);
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1.5;
    const spread =
      this.role === "sniper"
        ? 0.12
        : ws.def.spreadHip * 0.55 + (moving ? 0.6 : 0);

    if (Combat.tryFire(this, origin, dir, spread)) {
      Game.alertSound(this.pos.x, this.pos.z, 34, this.team);
      this.burstLeft--;
      if (this.burstLeft <= 0) {
        // 打完一輪連發：停頓一下再打下一輪
        this.burstLeft = Util.randInt(...ws.def.botBurst);
        this.burstPause =
          this.role === "sniper"
            ? Util.rand(0.9, 1.6)
            : this.role === "heavy"
              ? Util.rand(0.25, 0.6)
              : Util.rand(0.3, 0.85);
        this.chargeT = 0;
        if (this.laser) this.laser.visible = false;
        this.headAim = Math.random() < 0.18 * this.aimSkill;
      }
    }
  }

  /* 我和目標之間有沒有隊友擋著（俯視圖上，隊友離「我 → 目標」這條線不到 0.6 公尺）。
   * 高低差超過 1.6 公尺的不算（例如我在屋頂、隊友在樓下）。 */
  allyInLine(t) {
    const dx = t.pos.x - this.pos.x,
      dz = t.pos.z - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 1.5) return false;
    const ux = dx / len,
      uz = dz / len;
    for (const a of Combat.actors) {
      if (a === this || !a.alive || a.team !== this.team) continue;
      const ax = a.pos.x - this.pos.x,
        az = a.pos.z - this.pos.z;
      const along = ax * ux + az * uz; // 隊友沿著射線方向離我多遠
      if (along < 0.4 || along > len - 0.3) continue;
      if (Math.abs(ax * uz - az * ux) > 0.6 + a.radius * 0.5) continue; // 離射線太遠，不會打到
      if (Math.abs(a.pos.y - this.pos.y) > 1.6) continue;
      return true;
    }
    return false;
  }

  // 狙擊手的瞄準雷射（第一次使用時才建立）
  showLaser(t) {
    if (!this.laser) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6), 3),
      );
      this.laser = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(0xff2030).multiplyScalar(3),
          toneMapped: false,
          transparent: true,
          opacity: 0.85,
        }),
      );
      this.laser.frustumCulled = false;
      Scene3D.scene.add(this.laser);
    }
    const m = this.muzzlePos(Bot._v3);
    const p = this.laser.geometry.attributes.position;
    p.setXYZ(0, m.x, m.y, m.z);
    p.setXYZ(1, t.pos.x, t.pos.y + t.hit.base + t.hit.h * 0.7, t.pos.z);
    p.needsUpdate = true;
    this.laser.visible = true;
  }

  /* ============================================================
   *  4. 移動
   * ============================================================ */

  // 用 A* 找路前往 (x, z)。每一幀全體 Bot 共用有限的尋路次數，用完就排到下一幀
  moveTo(x, z, mode = "run") {
    if (Bot.pathBudget <= 0) {
      this.pendingMove = { x, z, mode };
      return true;
    }
    Bot.pathBudget--;
    const path = Nav.findPath(this.pos.x, this.pos.z, x, z, this.wide);
    if (!path) {
      this.path = null;
      return false;
    }
    this.path = path;
    this.pathIndex = 0;
    this.dest = { x, z };
    this.moveMode = mode;
    return true;
  }

  // 直線走到附近的點（呼叫前已確認中間沒有障礙）
  moveDirect(p, mode) {
    this.path = [p];
    this.pathIndex = 0;
    this.dest = null;
    this.moveMode = mode;
  }

  stop() {
    this.path = null;
  }

  arrived() {
    return !this.path || this.pathIndex >= this.path.length;
  }

  // 依路徑移動，並避開其他角色與障礙物。
  steer(dt) {
    const speeds = { walk: 2.8, combat: 3.5, run: 4.6, sprint: 6.0 };
    const speed = speeds[this.moveMode] * this.speedMult;
    let wx = 0,
      wz = 0;

    // 朝目前的路徑點前進；夠近就換下一個點
    // 走到路徑點就往下一個。
    if (this.path && this.pathIndex < this.path.length) {
      let wp = this.path[this.pathIndex];
      let dx = wp.x - this.pos.x,
        dz = wp.z - this.pos.z;
      let d = Math.hypot(dx, dz);
      if (d < 0.5) {
        this.pathIndex++;
        if (this.pathIndex < this.path.length) {
          wp = this.path[this.pathIndex];
          dx = wp.x - this.pos.x;
          dz = wp.z - this.pos.z;
          d = Math.hypot(dx, dz);
        }
      }
      if (this.pathIndex < this.path.length && d > 0.01) {
        wx = dx / d;
        wz = dz / d;
      }
    }
    const wantMove = wx !== 0 || wz !== 0;

    /* 抄近路：路徑是事先算好的折線，走到一半時常常已經可以直接走向「下一個」轉折點。
     * 每 0.3 秒檢查一次，能直線走到就跳過目前這一點，路線會比較圓滑、不會貼著牆角轉直角。 */
    if (this.skipT <= 0 && this.path && this.pathIndex + 1 < this.path.length) {
      this.skipT = 0.3;
      const next = this.path[this.pathIndex + 1];
      const flat = Math.abs(next.y - this.pos.y) < 0.5;
      if (
        flat &&
        Nav.lineClear(this.pos.x, this.pos.z, next.x, next.z, this.wide)
      )
        this.pathIndex++;
    }

    // 和其他角色保持距離，才不會擠成一團或卡在門口
    const personal = this.radius + 0.6;
    // 與其他角色保持距離。
    for (const a of Combat.actors) {
      if (a === this || !a.alive) continue;
      const dx = this.pos.x - a.pos.x,
        dz = this.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = personal + (a.isBoss ? a.radius : 0);
      if (d < min && d > 0.01 && Math.abs(a.pos.y - this.pos.y) < 1.5) {
        const push = ((min - d) / min) * 1.6;
        wx += (dx / d) * push;
        wz += (dz / d) * push;
      }
    }

    // 平滑加速到目標速度，再交給物理處理碰撞
    if (this.onGround) {
      this.vel.x = Util.damp(this.vel.x, wx * speed, 10, dt);
      this.vel.z = Util.damp(this.vel.z, wz * speed, 10, dt);
    }
    World.stepBody(this, dt);

    // 卡住偵測：想走卻幾乎沒動 → 重新找路；連續三次就放棄這個目的地
    this.stuckT += dt;
    // 卡住時依序嘗試：跳躍、繞開、重新尋路。
    if (this.stuckT > 0.7) {
      const moved = Util.dist2D(
        this.pos.x,
        this.pos.z,
        this.stuckPos.x,
        this.stuckPos.z,
      );
      if (wantMove && moved < 0.3) {
        this.stuckCount++;
        // 第一次卡住先跳一下：常常只是被矮碎石或台階邊緣絆住
        if (
          this.stuckCount === 1 &&
          this.onGround &&
          this.role !== "drone" &&
          !this.isBoss
        ) {
          this.vel.y = CONFIG.MOVE.jump;
          this.onGround = false;
        }
        if (this.stuckCount >= 3 || !this.dest) {
          this.path = null;
          this.goal = null;
          this.combatMoveT = 0;
          this.stuckCount = 0;
        } else {
          this.moveTo(
            this.dest.x + Util.rand(-1.2, 1.2),
            this.dest.z + Util.rand(-1.2, 1.2),
            this.moveMode,
          );
        }
      } else {
        this.stuckCount = 0;
      }
      this.stuckPos.copy(this.pos);
      this.stuckT = 0;
    }
  }
}

// 每一幀全體 Bot 可以做幾次 A* 尋路（由 Game 在每幀開頭重設）
Bot.pathBudget = 4;
// Bot 專用的暫存向量（不和其他系統共用，避免互相覆寫）
Bot._v1 = new THREE.Vector3();
Bot._v2 = new THREE.Vector3();
Bot._v3 = new THREE.Vector3();
