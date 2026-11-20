/*
 * ============================================================
 *  12-boss.js ── 首領
 * ------------------------------------------------------------
 *  首領繼承自 Bot（沿用感知、瞄準、尋路），但攻擊方式完全不同：
 *  不是拿槍射擊，而是輪流施放「招式」。
 *
 *  每個招式都分成兩段：
 *    預警（畫面上會出現提示圈、提示線或蓄力光）→ 發動
 *  玩家只要看懂預警就躲得掉，這是首領戰好玩的關鍵。
 *
 *  招式一覽（寫在 Boss.PATTERNS）：
 *    minigun   機砲掃射：槍口緩慢追蹤，橫向跑動可以甩開
 *    rockets   火箭彈幕：地上出現多個落點圈，離開圈圈即可
 *    shockwave 震地波  ：往外擴散的衝擊環，跳起來躲
 *    charge    衝撞    ：沿提示線直衝；撞牆會暈眩（輸出機會）
 *    blades    能量刃  ：扇形彈幕，找縫隙或側移
 *    blink     瞬移斬  ：瞬移到身邊後範圍斬擊，立刻離開提示圈
 *    orbs      螺旋彈幕：旋轉發射的光球，保持移動穿過縫隙
 *    laser     旋轉雷射：掃過來時跳躍，或躲到掩體後
 *    summon    召喚    ：叫出小兵
 *    slam      近身重擊：玩家貼太近時自動使用
 *
 *  生命每降到一個門檻就進入下一階段：會怒吼、召喚小兵，之後出招更快。
 * ============================================================
 */

class Boss extends Bot {
  constructor(def, team) {
    const color = def.color;
    super({
      type: def.id, name: def.name, hp: Math.round(def.hp * Game.difficulty.enemyHp), armor: 0,
      speed: def.speed / 4.6, weapon: "lmg", role: "boss", aim: 1.2, score: 5000,
      scale: def.scale, hover: def.hover, grenades: 0, look: { accent: color },
      makeRig: () => {
        if (def.id === "titan") {
          const r = CharModels.titan(color);
          r.root.scale.setScalar(def.scale);
          return r;
        }
        if (def.id === "hydra") return CharModels.hydra(color);
        return CharModels.create(
          { suit: 0x16121f, armor: 0x0c0d12, accent: color, helmet: "wraith", bulk: 0.95, pads: true, pack: false },
          { scale: def.scale }
        );
      },
    }, team);

    this.def = def;
    this.isBoss = true;
    this.noPickup = true;
    this.wide = true; // 體型大，只走寬敞的路
    this.radius = def.radius;
    this.height = def.height;
    this.color = color;
    if (def.id === "hydra") {
      // 核心：圓柱包住球體，弱點是正面的巨眼
      this.hit = { r: 1.15, h: 2.2, base: def.hover - 1.1, headY: 1.1, headR: 0.5, headFwd: 0.75 };
      this.eyeOffset = def.hover;
    }

    this.phase = 0; // 目前階段（0 開始）
    this.enraged = false; // 最後階段
    this.atk = null; // 正在施放的招式
    this.atkCd = 3; // 距離下一招的時間
    this.lastPattern = "";
    this.stunT = 0; // 暈眩（破綻）剩餘時間
    this.introT = 2.2; // 登場演出
    this.deathFx = 0;
    this.minions = [];
  }

  /* 首領專屬的動作（在一般動畫之後再加上去）：
   *   泰坦：沉重的腳步，每一步揚起塵土、地面微微震動
   *   幽影：離地懸浮、移動時身體前傾，高速時留下發光的殘影
   *   九頭蛇：往移動方向傾斜 */
  updateRig(dt) {
    super.updateRig(dt);
    const rig = this.rig;
    if (!rig || !this.alive) return;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fwd = -this.vel.x * sin - this.vel.z * cos;
    const side = this.vel.x * cos - this.vel.z * sin;

    if (this.def.id === "titan") {
      // 腳步：步伐相位每過半圈就是一隻腳踩地
      const step = Math.sin(rig.phase) > 0;
      if (speed > 0.6 && step !== this.lastStep) {
        const foot = step ? 1 : -1;
        const fx = this.pos.x + cos * foot * 0.7, fz = this.pos.z - sin * foot * 0.7;
        FX.puff(fx, this.pos.y + 0.1, fz, 5, 1.0, 0x6a5a4a, 1.6);
        FX.addShake(fx, this.pos.y, fz, 0.18);
        Sound.play("stomp", { pos: this.pos, vol: 0.35 });
      }
      this.lastStep = step;
      rig.torso.rotation.z += Math.sin(rig.phase) * 0.05 * Math.min(1, speed / 2); // 走路時左右搖晃
    } else if (this.def.id === "wraith") {
      rig.tilt.position.y = 0.25 + Math.sin(Scene3D.time * 2.2) * 0.07; // 離地懸浮
      rig.torso.rotation.x -= Math.min(1, speed / 5) * 0.4; // 移動時身體前傾
      rig.legL.rotation.x *= 0.4; // 懸浮時腳幾乎不擺動
      rig.legR.rotation.x *= 0.4;
      if (speed > 3.5) FX.dissolve(this.pos.x, this.pos.y + 0.3, this.pos.z, this.height * 0.9, this.color, 3); // 殘影
    } else if (this.def.id === "hydra") {
      rig.body.rotation.z = Util.damp(rig.body.rotation.z, -side * 0.06, 4, dt);
      rig.body.rotation.x += Util.clamp(fwd, -4, 4) * 0.04;
    }
  }

  // 首領招式造成傷害的統一入口
  /* 範圍攻擊用：首領和目標之間有沒有牆擋住。
   * h 是檢查的高度（離腳底幾公尺）；被牆或掩體擋住就打不到。 */
  canReach(e, h = 1.0) {
    return World.los(this.pos.x, this.pos.y + h, this.pos.z, e.pos.x, e.pos.y + Math.min(h, 1.2), e.pos.z);
  }

  hurt(target, amount, weapon) {
    Combat.damage(target, amount, this, { weapon });
  }

  // 首領身體中心的高度（特效、彈幕從這裡出發）
  centerY() {
    return this.pos.y + this.hover + (this.hover ? 0 : this.height * 0.55);
  }

  /* ============================================================
   *  每幀更新
   * ============================================================ */
  update(dt) {
    if (!this.alive) return this.updateDeath(dt);
    this.tickTimers(dt);
    this.combatMoveT -= dt;
    this.repathT -= dt;
    if (this.pendingMove && Bot.pathBudget > 0) {
      const m = this.pendingMove;
      this.pendingMove = null;
      this.moveTo(m.x, m.z, m.mode);
    }

    // 首領永遠知道玩家在哪（不需要搜索），但「看不看得到」仍然用射線判斷
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.2;
      this.pickTarget();
    }
    const t = this.target;

    // 登場演出：站在原地怒吼
    if (this.introT > 0) {
      this.introT -= dt;
      this.invuln = 0.2;
      this.vel.x = this.vel.z = 0;
      this.aim(dt);
      World.stepBody(this, dt);
      this.updateRig(dt);
      return;
    }

    this.checkPhase();

    // 暈眩中：不能動，受到的傷害提高（玩家的輸出時機）
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.damageTakenMult = 1.5;
      this.vel.x = Util.damp(this.vel.x, 0, 8, dt);
      this.vel.z = Util.damp(this.vel.z, 0, 8, dt);
      if (Math.random() < 0.3)
        FX.sparks(
          this.pos.x + Util.rand(-1, 1),
          this.centerY() + Util.rand(-0.5, 1),
          this.pos.z + Util.rand(-1, 1),
          0,
          1,
          0,
          0xfff2a0,
          2,
          3
        );
      World.stepBody(this, dt);
      this.updateRig(dt);
      return;
    }
    this.damageTakenMult = 1;

    if (this.atk) {
      // 施放招式中：招式自己決定首領要不要移動、轉身
      this.atk.t += dt;
      const done = Boss.PATTERNS[this.atk.name].update(this, this.atk, dt, t);
      if (done) {
        this.atk = null;
        this.atkCd = (this.def.id === "wraith" ? 1.3 : 2.0) * [1, 0.8, 0.6][this.phase] * Util.rand(0.8, 1.2);
      }
    } else if (t) {
      this.positioning(t);
      this.aim(dt);
      this.steer(dt);
      this.atkCd -= dt;
      if (this.atkCd <= 0) this.startAttack(t);
    } else {
      this.steer(dt);
    }
    // 大部分招式首領站著不動，仍要套用重力與碰撞；會自己移動的招式（衝撞）已在招式內處理
    if (this.atk && !Boss.PATTERNS[this.atk.name].selfMove) World.stepBody(this, dt);
    this.updateRig(dt);
  }

  // 選最近的敵人當目標
  pickTarget() {
    let best = null, bestD = Infinity;
    for (const a of Combat.actors) {
      if (!a.alive || a.team === this.team) continue;
      const d = Util.dist2D(a.pos.x, a.pos.z, this.pos.x, this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    this.target = best;
    if (best) {
      const eye = this.eyePos(Bot._v1);
      this.visible = World.los(eye.x, eye.y, eye.z, best.pos.x, best.pos.y + 1.2, best.pos.z);
      this.lastSeen.copy(best.pos);
      this.lastSeenTime = Game.time;
      this.seenFor = 9;
    }
  }

  // 沒在出招時的走位：太遠就靠近，否則在偏好距離內繞著玩家移動
  positioning(t) {
    const dist = Util.dist2D(t.pos.x, t.pos.z, this.pos.x, this.pos.z);
    const [near, far] = this.def.id === "wraith" ? [7, 14] : this.def.id === "hydra" ? [13, 24] : [9, 20];
    if (dist > far || !this.visible) {
      if (this.repathT <= 0) {
        this.repathT = 0.8;
        this.moveTo(t.pos.x, t.pos.z, "run");
      }
    } else if (this.combatMoveT <= 0 || this.arrived()) {
      this.pickCombatSpot(t, dist, near, far);
      this.combatMoveT = Util.rand(1.2, 2.6);
    }
  }

  /* ---------- 階段轉換 ---------- */
  checkPhase() {
    const ratio = this.hp / this.maxHp;
    const next = this.def.phases[this.phase];
    if (next === undefined || ratio > next) return;
    this.phase++;
    this.enraged = this.phase >= this.def.phases.length;
    this.atk = null;
    this.atkCd = 1.6;
    this.invuln = 1.6;
    Sound.play("bossRoar", { pos: this.pos });
    FX.ring(this.pos.x, this.pos.y + 0.1, this.pos.z, 16, this.color, 0.8);
    FX.explosion(this.pos.x, this.centerY(), this.pos.z, 4, this.color);
    HUD.announce(this.enraged ? "狂暴化" : "第 " + (this.phase + 1) + " 階段", this.def.name + " 的攻擊變得更猛烈", this.color);
    // 把貼太近的玩家震開
    for (const a of Combat.actors) {
      if (!a.alive || a.team === this.team) continue;
      const d = Util.dist2D(a.pos.x, a.pos.z, this.pos.x, this.pos.z);
      if (d < 9 && this.canReach(a)) {
        a.vel.x += ((a.pos.x - this.pos.x) / Math.max(d, 0.5)) * 12;
        a.vel.z += ((a.pos.z - this.pos.z) / Math.max(d, 0.5)) * 12;
        a.vel.y = 5;
        a.onGround = false;
      }
    }
    this.summon(1 + this.phase); // 第 2 階段 2 隻、第 3 階段 3 隻（仍受難度上限限制）
  }

  /* 場上小兵的上限：依難度。新兵 2、戰士 3、老兵 4、煉獄 6。
   * 首領戰的主角是首領，小兵只是干擾，所以不讓它們多到把玩家淹沒。 */
  maxMinions() {
    return { easy: 2, normal: 3, hard: 4 }[Game.difficulty.id] ?? 6;
  }

  // 在首領附近召喚小兵
  summon(count) {
    this.minions = this.minions.filter((m) => m.alive);
    const cap = this.maxMinions();
    for (let i = 0; i < count && this.minions.length < cap; i++) {
      const p = Nav.randomNear(this.pos.x, this.pos.z, 6, 14) || Nav.randomPoint();
      const type = Util.pick(this.def.minions);
      const minion = Game.spawnEnemy(type, p.x, p.y, p.z);
      minion.calmT = 1.8; // 剛被叫出來：先觀察 1.8 秒才開槍，讓玩家有時間反應
      minion.aimSkill *= 0.8; // 小兵槍法比一般敵人差一點（它們是來干擾的，不是主角）
      this.minions.push(minion);
      FX.flash(p.x, p.y + 1.2, p.z, this.color, 3, 0.4, 0.3);
      FX.ring(p.x, p.y, p.z, 2.5, this.color, 0.5);
    }
    Sound.play("blink", { pos: this.pos });
  }

  /* ---------- 選招 ---------- */
  startAttack(t) {
    const dist = Util.dist2D(t.pos.x, t.pos.z, this.pos.x, this.pos.z);
    let name;
    if (dist < this.radius + 3 && this.lastPattern !== "slam") {
      name = "slam"; // 貼太近：直接重擊
    } else {
      // 從自己的招式表裡挑一個「條件符合、而且不是上一招」的
      const options = this.def.patterns.filter((p) => {
        if (p === this.lastPattern) return false;
        const need = Boss.PATTERNS[p];
        if (need.needSight && !this.visible) return false;
        if (need.maxDist && dist > need.maxDist) return false;
        if (p === "summon" && this.minions.filter((m) => m.alive).length >= this.maxMinions() - 1) return false;
        return true;
      });
      name = options.length ? Util.pick(options) : "rockets";
    }
    this.lastPattern = name;
    this.atk = { name, t: 0, stage: 0, tick: 0 };
    this.stop();
    this.vel.x = this.vel.z = 0;
    Boss.PATTERNS[name].start(this, this.atk, t);
    HUD.bossWarning(Boss.PATTERNS[name].label);
  }

  // 出招時讓首領面向玩家（rate 是轉身速度，機砲掃射時故意放慢）
  face(t, rate, dt) {
    if (!t) return;
    const wantYaw = Util.yawTo(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    const wantPitch = Math.atan2(
      t.pos.y + 1.1 - this.eyeY(),
      Math.max(1, Util.dist2D(t.pos.x, t.pos.z, this.pos.x, this.pos.z))
    );
    this.aimYaw = this.yaw = Util.turnToward(this.yaw, wantYaw, rate * dt);
    this.aimPitch = this.pitch = this.pitch + Util.clamp(wantPitch - this.pitch, -rate * dt, rate * dt);
  }

  /* ---------- 死亡演出：連續爆炸 ---------- */
  updateDeath(dt) {
    this.corpseT += dt;
    this.vel.set(0, 0, 0);
    this.deathFx -= dt;
    if (this.corpseT < 2.4 && this.deathFx <= 0) {
      this.deathFx = 0.22;
      FX.explosion(
        this.pos.x + Util.rand(-1.5, 1.5),
        this.centerY() + Util.rand(-1, 1.5),
        this.pos.z + Util.rand(-1.5, 1.5),
        3.5,
        Math.random() < 0.5 ? this.color : 0xff8a2a
      );
      Sound.play("explosion", { pos: this.pos, vol: 0.7 });
    }
    this.updateRig(dt);
  }

  onDeath(attacker, info) {
    super.onDeath(attacker, info);
    this.atk = null;
    for (const m of this.minions) if (m.alive) Combat.damage(m, 9999, null, {}); // 首領倒下，小兵一起消滅
  }
}

/* ============================================================
 *  招式表
 * ------------------------------------------------------------
 *  每個招式有：
 *    label      畫面上顯示的警告文字
 *    needSight  是否需要看得到玩家才會使用
 *    maxDist    超過這個距離就不使用
 *    start(b, a, t)        開始時呼叫一次（b 首領、a 招式狀態、t 目標）
 *    update(b, a, dt, t)   每幀呼叫；回傳 true 表示招式結束
 *  a.t 是招式已經進行的秒數，a.stage / a.tick 可自由運用。
 * ============================================================ */
Boss.PATTERNS = {
  /* ---------- 機砲掃射 ---------- */
  minigun: {
    label: "機砲掃射 — 橫向移動！", needSight: true,
    start(b) {
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt, t) {
      const windup = 0.8;
      const duration = b.enraged ? 3.6 : 2.8;
      if (a.t < windup) {
        b.face(t, 3, dt);
        const m = b.muzzlePos(Bot._v3);
        FX.flash(m.x, m.y, m.z, b.color, 0.5 + a.t, 0.05, 1); // 砲口蓄力光
        return false;
      }
      b.face(t, b.enraged ? 1.5 : 1.15, dt); // 轉得慢，所以橫向跑得掉
      a.tick -= dt;
      while (a.tick <= 0) {
        a.tick += 0.055;
        const origin = b.eyePos(Bot._v1);
        const m = b.muzzlePos(Bot._v3);
        const dir = Combat._spreadDir(Util.aimDir(b.yaw, b.pitch, Bot._v2), 2.4, Combat._dir);
        Combat._hitscan(b, origin, dir, Boss.GUN, m.x, m.y, m.z);
        FX.muzzle(m.x, m.y, m.z, b.color, false);
        if (Math.random() < 0.5) Sound.play("lmg", { pos: b.pos, vol: 0.8 });
      }
      b.rig.recoil = 1;
      return a.t > windup + duration;
    },
  },

  /* ---------- 火箭彈幕 ---------- */
  rockets: {
    label: "火箭彈幕 — 離開紅圈！",
    start(b, a, t) {
      a.count = b.enraged ? 9 : 6 + b.phase;
      a.fired = 0;
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt, t) {
      b.face(t, 3, dt);
      // 每 0.16 秒標記一個落點：第一發瞄準玩家腳下，其餘散在周圍與行進方向上
      while (t && a.fired < a.count && a.t > 0.5 + a.fired * 0.16) {
        const lead = a.fired === 0 ? 0 : Util.rand(0.2, 1.0);
        const spread = a.fired === 0 ? 0 : Util.rand(1, 7);
        const ang = Math.random() * Math.PI * 2;
        const x = t.pos.x + t.vel.x * lead + Math.cos(ang) * spread;
        const z = t.pos.z + t.vel.z * lead + Math.sin(ang) * spread;
        const y = World.groundAt(x, z, t.pos.y + 1);
        const delay = 1.25;
        FX.mark(x, y, z, 3.6, 0xff3030, delay);
        // 火箭從高空垂直落下，剛好在預警結束時命中
        Combat.after(delay - 0.6, () => {
          if (!b.alive) return;
          Combat.addProjectile({
            owner: b, x, y: y + 30, z, vx: 0, vy: -50, vz: 0, gravity: 0, damage: 55, blast: 3.8,
            color: b.color, size: 0.2, weapon: "boss", rocket: true
          });
        });
        Sound.play("launcher", { pos: b.pos, vol: 0.6 });
        const m = b.muzzlePos(Bot._v3);
        FX.flash(m.x, m.y + 1.2, m.z, b.color, 1.5, 0.15, 1.5);
        a.fired++;
      }
      return a.t > 0.5 + a.count * 0.16 + 0.7;
    },
  },

  /* ---------- 震地波 ---------- */
  shockwave: {
    label: "震地波 — 跳躍閃避！", maxDist: 26,
    start(b, a) {
      a.waves = b.enraged ? 3 : b.phase >= 1 ? 2 : 1;
      a.wave = 0;
      a.radius = -1;
      FX.mark(b.pos.x, b.pos.y, b.pos.z, 5, 0xffc233, 0.9);
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt) {
      const windup = 0.9;
      const speed = 17, maxR = 30;
      b.crouch = a.radius < 0 ? Math.min(1, a.t / windup) * 0.8 : 0; // 蓄力時蹲低
      if (a.radius < 0) {
        if (a.t < windup) return false;
        // 發動：從腳下放出一圈衝擊波
        a.radius = 0;
        Sound.play("stomp", { pos: b.pos });
        FX.addShake(b.pos.x, b.pos.y, b.pos.z, 1);
        FX.ring(b.pos.x, b.pos.y, b.pos.z, maxR, 0xffc233, maxR / speed);
        FX.puff(b.pos.x, b.pos.y + 0.3, b.pos.z, 14, 2, 0x8a7a6a, 5);
      }
      const prev = a.radius;
      a.radius += speed * dt;
      // 衝擊環「掃過」站在地上的敵人時造成傷害；跳在空中就不會中
      for (const e of Combat.actors) {
        if (!e.alive || e.team === b.team) continue;
        const d = Util.dist2D(e.pos.x, e.pos.z, b.pos.x, b.pos.z);
        if (d > prev && d <= a.radius && e.onGround && Math.abs(e.pos.y - b.pos.y) < 1.2 && b.canReach(e, 0.5)) {
          b.hurt(e, 34, "shockwave");
          e.vel.y = 6;
          e.onGround = false;
          e.vel.x += ((e.pos.x - b.pos.x) / Math.max(d, 1)) * 6;
          e.vel.z += ((e.pos.z - b.pos.z) / Math.max(d, 1)) * 6;
        }
      }
      if (a.radius >= maxR) {
        a.wave++;
        if (a.wave >= a.waves) {
          b.crouch = 0;
          return true;
        }
        // 下一波的蓄力較短
        a.radius = -1;
        a.t = 0.35;
        FX.mark(b.pos.x, b.pos.y, b.pos.z, 5, 0xffc233, 0.55);
      }
      return false;
    },
  },

  /* ---------- 衝撞 ---------- */
  charge: {
    label: "衝撞 — 離開提示線！", needSight: true, maxDist: 34, selfMove: true,
    start(b, a, t) {
      a.dir = new THREE.Vector3(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z).normalize();
      a.len = Math.min(32, Util.dist2D(t.pos.x, t.pos.z, b.pos.x, b.pos.z) + 7);
      a.travelled = 0;
      a.hitSet = new Set();
      // 地上的提示線
      const y = b.pos.y + 0.12;
      FX.beam({ x: b.pos.x, y, z: b.pos.z }, { x: b.pos.x + a.dir.x * a.len, y, z: b.pos.z + a.dir.z * a.len }, b.radius * 0.9, 0xff3030, 0.85, false).mesh.material.opacity = 0.35;
      Sound.play("charge", { pos: b.pos });
      b.yaw = b.aimYaw = Util.yawTo(a.dir.x, a.dir.z);
    },
    update(b, a, dt) {
      if (a.t < 0.85) { // 預警：原地蓄力
        b.vel.x = b.vel.z = 0;
        World.stepBody(b, dt);
        return false;
      }
      const speed = b.def.id === "wraith" ? 30 : 22;
      b.vel.x = a.dir.x * speed;
      b.vel.z = a.dir.z * speed;
      World.stepBody(b, dt);
      a.travelled += speed * dt;
      FX.puff(b.pos.x, b.pos.y + 0.3, b.pos.z, 1, 1.2, 0x8a7a6a, 1.5);
      if (b.def.id === "wraith") FX.flash(b.pos.x, b.centerY(), b.pos.z, b.color, 2.5, 0.2, 0.5); // 殘影
      // 撞到路徑上的敵人
      for (const e of Combat.actors) {
        if (!e.alive || e.team === b.team || a.hitSet.has(e)) continue;
        if (Util.dist2D(e.pos.x, e.pos.z, b.pos.x, b.pos.z) < b.radius + 1.0 && Math.abs(e.pos.y - b.pos.y) < 2.5 && b.canReach(e)) {
          a.hitSet.add(e);
          b.hurt(e, 48, "charge");
          e.vel.x += a.dir.x * 12;
          e.vel.z += a.dir.z * 12;
          e.vel.y = 6;
          e.onGround = false;
        }
      }
      // 撞牆：自己暈眩，露出破綻
      if (b.hitWall && a.travelled > 2) {
        b.vel.x = b.vel.z = 0;
        b.stunT = 2.2;
        FX.explosion(b.pos.x + a.dir.x * b.radius, b.centerY(), b.pos.z + a.dir.z * b.radius, 3, 0xffc233);
        Sound.play("stomp", { pos: b.pos });
        HUD.announce("破綻！", "首領暈眩中，全力輸出", 0xfff2a0);
        return true;
      }
      if (a.travelled >= a.len) {
        b.vel.x = b.vel.z = 0;
        return true;
      }
      return false;
    },
  },

  /* ---------- 能量刃 ---------- */
  blades: {
    label: "能量刃 — 找縫隙閃避！", needSight: true,
    start(b, a) {
      a.volleys = b.enraged ? 5 : 3;
      a.fired = 0;
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt, t) {
      b.face(t, 6, dt);
      while (a.fired < a.volleys && a.t > 0.6 + a.fired * 0.42) {
        // 一次射出一排扇形光刃；每一波的角度錯開，上一波的縫隙會被下一波補上
        const n = 6;
        const offset = a.fired % 2 ? 0.5 : 0;
        const y = b.pos.y + 1.15;
        for (let i = 0; i < n; i++) {
          const ang = b.yaw + (i - (n - 1) / 2 + offset) * 0.17;
          Combat.addProjectile({
            owner: b, x: b.pos.x - Math.sin(ang) * 1.2, y, z: b.pos.z - Math.cos(ang) * 1.2,
            vx: -Math.sin(ang) * 24, vy: 0, vz: -Math.cos(ang) * 24,
            gravity: 0, damage: 20, blast: 0, color: b.color, size: 0.22, weapon: "boss", direct: true, life: 2.2,
          });
        }
        Sound.play("plasma", { pos: b.pos });
        a.fired++;
      }
      return a.t > 0.6 + a.volleys * 0.42 + 0.4;
    },
  },

  /* ---------- 瞬移斬 ---------- */
  blink: {
    label: "瞬移斬 — 離開提示圈！",
    start(b, a) {
      a.jumps = b.enraged ? 4 : 2 + b.phase;
      a.done = 0;
      a.stage = 0;
      a.t = 0;
    },
    update(b, a, dt, t) {
      if (!t) return true;
      b.vel.x = b.vel.z = 0;
      if (a.stage === 0 && a.t > 0.35) {
        // 消失，並在玩家身邊（優先挑背後）重新出現
        FX.flash(b.pos.x, b.centerY(), b.pos.z, b.color, 5, 0.3, 0.2);
        Sound.play("blink", { pos: b.pos });
        let spot = null;
        for (let i = 0; i < 12 && !spot; i++) {
          const behind = t.yaw + Math.PI + Util.rand(-1.4, 1.4);
          const r = Util.rand(3.5, 5.5);
          const idx = Nav.nearest(t.pos.x - Math.sin(behind) * r, t.pos.z - Math.cos(behind) * r, true, 3);
          if (idx >= 0 && Math.abs(Nav.h[idx] - t.pos.y) < 1.5)
            spot = { x: Nav.cellX(idx), y: Nav.h[idx], z: Nav.cellZ(idx) };
        }
        if (spot) b.pos.set(spot.x, spot.y, spot.z);
        b.yaw = b.aimYaw = Util.yawTo(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
        FX.flash(b.pos.x, b.centerY(), b.pos.z, b.color, 5, 0.3, 0.2);
        FX.mark(b.pos.x, b.pos.y, b.pos.z, 4.6, 0xff3030, 0.62); // 斬擊範圍預警
        a.stage = 1;
        a.t = 0;
      } else if (a.stage === 1 && a.t > 0.62) {
        // 斬擊
        FX.ring(b.pos.x, b.pos.y + 0.8, b.pos.z, 4.6, b.color, 0.25);
        FX.flash(b.pos.x, b.pos.y + 1.2, b.pos.z, b.color, 7, 0.18, 1.2);
        Sound.play("melee", { pos: b.pos, vol: 1.5 });
        for (const e of Combat.actors) {
          if (
            e.alive
              && e.team !== b.team
              && Util.dist2D(e.pos.x, e.pos.z, b.pos.x, b.pos.z) < 4.6 + e.radius
              && Math.abs(e.pos.y - b.pos.y) < 2.5
              && b.canReach(e)
          )
            b.hurt(e, 40, "slash");
        }
        b.rig.recoil = 1;
        a.done++;
        a.stage = 0;
        a.t = 0;
        if (a.done >= a.jumps) return true;
      }
      return false;
    },
  },

  /* ---------- 螺旋彈幕 ---------- */
  orbs: {
    label: "螺旋彈幕 — 保持移動！",
    start(b, a) {
      a.angle = Math.random() * 6.28;
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt, t) {
      b.face(t, 2, dt);
      const arms = b.enraged ? 4 : 3; // 同時幾條旋臂
      const duration = b.enraged ? 4.2 : 3.2;
      if (a.t < 0.7) return false;
      a.tick -= dt;
      a.angle += dt * (b.enraged ? 1.5 : 1.15);
      while (a.tick <= 0) {
        a.tick += 0.14;
        const y = b.pos.y + 1.1;
        for (let i = 0; i < arms; i++) {
          const ang = a.angle + (i / arms) * Math.PI * 2;
          Combat.addProjectile({
            owner: b, x: b.pos.x + Math.cos(ang) * (b.radius + 0.3), y, z: b.pos.z + Math.sin(ang) * (b.radius + 0.3),
            vx: Math.cos(ang) * 11, vy: 0, vz: Math.sin(ang) * 11,
            gravity: 0, damage: 15, blast: 0, color: b.color, size: 0.26, weapon: "boss", direct: true, life: 4,
          });
        }
        if (Math.random() < 0.4) Sound.play("plasma", { pos: b.pos, vol: 0.5 });
      }
      return a.t > 0.7 + duration;
    },
  },

  /* ---------- 旋轉雷射 ---------- */
  laser: {
    label: "旋轉雷射 — 跳躍或找掩體！",
    start(b, a, t) {
      a.angle = Math.atan2(t.pos.z - b.pos.z, t.pos.x - b.pos.x) + 1.2; // 從玩家側邊開始掃
      a.dirSign = Math.random() < 0.5 ? 1 : -1;
      a.beams = [];
      a.count = b.enraged ? 3 : 2; // 幾道雷射同時旋轉
      Sound.play("charge", { pos: b.pos });
    },
    update(b, a, dt) {
      const windup = 1.0, duration = 4.2;
      const y = b.pos.y + 0.75; // 雷射高度：跳起來可以越過
      const firing = a.t >= windup;
      if (firing && !a.beams.length) {
        for (let i = 0; i < a.count; i++) a.beams.push(FX.beam(b.pos, b.pos, 0.16, b.color, duration, false));
        Sound.play("laser", { pos: b.pos });
      }
      if (firing) a.angle += a.dirSign * dt * (b.enraged ? 1.25 : 0.95);
      a.tick -= dt;
      const doDamage = firing && a.tick <= 0;
      if (doDamage) {
        a.tick = 0.1;
        if (Math.random() < 0.3) Sound.play("laser", { pos: b.pos, vol: 0.4 });
      }

      for (let i = 0; i < a.count; i++) {
        const ang = a.angle + (i / a.count) * Math.PI * 2;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        // 雷射會被牆擋住，所以躲在掩體後是安全的
        const len = Math.min(45, World.raycast(b.pos.x, y, b.pos.z, dx, 0, dz, 45, Combat._hit));
        const end = { x: b.pos.x + dx * len, y, z: b.pos.z + dz * len };
        const start = { x: b.pos.x + dx * b.radius, y, z: b.pos.z + dz * b.radius };
        if (!firing) {
          // 預警：一閃一閃的細線
          if (Math.floor(a.t * 14) % 2 === 0) FX.tracer(start.x, y, start.z, end.x, y, end.z, 0xff3030, 0.03);
          continue;
        }
        FX.setBeam(a.beams[i], start, end);
        FX.sparks(end.x, y, end.z, -dx, 0.5, -dz, b.color, 1, 4);
        if (!doDamage) continue;
        for (const e of Combat.actors) {
          if (!e.alive || e.team === b.team) continue;
          const ex = e.pos.x - b.pos.x, ez = e.pos.z - b.pos.z;
          const along = ex * dx + ez * dz; // 敵人沿雷射方向的距離
          const side = Math.abs(ex * dz - ez * dx); // 敵人離雷射的橫向距離
          const feet = e.pos.y, head = e.pos.y + e.height;
          if (along > 0 && along < len && side < e.radius + 0.2 && feet < y && head > y) b.hurt(e, 9, "laser");
        }
      }
      return a.t > windup + duration;
    },
  },

  /* ---------- 召喚 ---------- */
  summon: {
    label: "召喚增援",
    start(b) {
      Sound.play("charge", { pos: b.pos });
      FX.ring(b.pos.x, b.pos.y + 0.1, b.pos.z, 10, b.color, 0.9);
    },
    update(b, a) {
      if (a.t > 0.9 && a.stage === 0) {
        a.stage = 1;
        b.summon(Game.difficulty.id === "easy" ? 2 : 3);
      }
      return a.t > 1.4;
    },
  },

  /* ---------- 近身重擊 ---------- */
  slam: {
    label: "近身重擊 — 後退！",
    start(b) {
      FX.mark(b.pos.x, b.pos.y, b.pos.z, b.radius + 4, 0xff3030, 0.7);
      Sound.play("charge", { pos: b.pos, vol: 0.7 });
    },
    update(b, a) {
      if (a.t > 0.7 && a.stage === 0) {
        a.stage = 1;
        const r = b.radius + 4;
        FX.ring(b.pos.x, b.pos.y + 0.2, b.pos.z, r, b.color, 0.3);
        FX.puff(b.pos.x, b.pos.y + 0.3, b.pos.z, 10, 1.6, 0x8a7a6a, 4);
        FX.addShake(b.pos.x, b.pos.y, b.pos.z, 0.8);
        Sound.play("stomp", { pos: b.pos });
        for (const e of Combat.actors) {
          if (!e.alive || e.team === b.team) continue;
          const d = Util.dist2D(e.pos.x, e.pos.z, b.pos.x, b.pos.z);
          if (d < r + e.radius && Math.abs(e.pos.y - b.pos.y) < 2.5 && b.canReach(e)) {
            b.hurt(e, 36, "slam");
            e.vel.x += ((e.pos.x - b.pos.x) / Math.max(d, 0.5)) * 13;
            e.vel.z += ((e.pos.z - b.pos.z) / Math.max(d, 0.5)) * 13;
            e.vel.y = 5.5;
            e.onGround = false;
          }
        }
      }
      return a.t > 1.2;
    },
  },
};

// 機砲掃射使用的虛擬武器資料（傷害、衰減、曳光顏色）
Boss.GUN = { id: "boss", damage: 9, headMult: 1, falloff: [60, 120, 0.7], tracer: 0xff9a4d };
