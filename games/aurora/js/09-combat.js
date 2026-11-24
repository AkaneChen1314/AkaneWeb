/*
 * ============================================================
 *  09-combat.js ── 戰鬥規則
 * ------------------------------------------------------------
 *  玩家與電腦共用同一套戰鬥規則，全部集中在這裡：
 *
 *    WeaponState  一把槍目前的狀態（彈匣剩幾發、是否在換彈…）
 *    Combat       開火、命中判定、傷害、爆炸、飛行彈體、手榴彈、
 *                 爆炸桶、補給品、近戰，以及「延遲幾秒後執行」的排程
 *
 *  命中判定的做法（hitscan）：
 *    從「眼睛」沿瞄準方向射出一條射線，
 *    先算打到牆的距離，再算有沒有在更近的地方打到角色。
 *    角色的身體是一根直立圓柱，頭是一顆球（打到球就是爆頭）。
 * ============================================================
 */

class WeaponState {
  // def 是武器資料，owner 是持有者；每個人各自記錄自己的彈藥。
  constructor(def, owner) {
    this.def = def; // 武器資料（WEAPONS 裡的那一筆）
    this.owner = owner;
    this.ammo = this.magSize; // 彈匣內的子彈
    this.reserve = def.reserve; // 備用彈藥
    this.cooldown = 0; // 距離下一發還要多久
    this.reloadLeft = 0; // 換彈剩餘時間（0 = 沒在換彈）
    this.reloadTotal = 1;
    this.reloadStage = 0; // 換彈音效播到第幾段
    this.bloom = 0; // 連射累積的額外散布（度）
  }

  // 彈匣容量（生存模式的「擴充彈匣」會放大它）
  get magSize() {
    return Math.round(
      this.def.mag * (this.owner.mods ? this.owner.mods.mag : 1),
    );
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  // 補滿彈匣與備彈
  refill() {
    this.ammo = this.magSize;
    this.reserve = this.def.reserve;
    this.reloadLeft = 0;
  }
}

const Combat = {
  actors: [], // 場上所有角色（由 Game 管理增減）
  projectiles: [], // 飛行中的彈體（榴彈、電漿、首領光球）
  grenades: [],
  barrels: [],
  pickups: [],
  timers: [], // 延遲執行的工作
  _hit: {}, // 射線結果暫存
  _dir: new THREE.Vector3(),
  _v: new THREE.Vector3(),
  _origin: new THREE.Vector3(),
  _aim: new THREE.Vector3(),

  // 換地圖或離開對戰時，清除所有飛行物、手榴彈、油桶與補給。
  reset() {
    for (const p of this.projectiles) this._removeProjectile(p);
    for (const g of this.grenades) Scene3D.scene.remove(g.mesh);
    for (const b of this.barrels) {
      Scene3D.scene.remove(b.mesh);
      // 還沒爆的桶子要把碰撞與導航格還原
      if (!b.gone) {
        World.removeBox(b.box);
        Nav.ok[b.cell] = 1;
      }
    }
    for (const p of this.pickups) Scene3D.scene.remove(p.mesh);
    this.projectiles = [];
    this.grenades = [];
    this.barrels = [];
    this.pickups = [];
    this.timers = [];
    this.actors = [];
  },

  // seconds 秒後執行 fn（以遊戲時間計算，暫停時不會前進）
  after(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  },

  // 每一格畫面更新延遲事件、飛行物、手榴彈與補給。
  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      timer.t -= dt;
      if (timer.t <= 0) {
        this.timers.splice(i, 1);
        timer.fn();
      }
    }
    this._updateProjectiles(dt);
    this._updateGrenades(dt);
    this._updatePickups(dt);
  },

  /* ============================================================
   *  武器：冷卻、換彈、開火
   * ============================================================ */

  // 每幀更新一把槍的計時器
  tickWeapon(ws, dt) {
    ws.cooldown = Math.max(0, ws.cooldown - dt);
    ws.bloom = Math.max(0, ws.bloom - dt * (ws.def.spreadMax * 1.6)); // 散布會慢慢收回來
    if (ws.reloadLeft > 0) {
      ws.reloadLeft -= dt;
      const progress = 1 - ws.reloadLeft / ws.reloadTotal;
      const pos = ws.owner.isPlayer ? null : ws.owner.pos;
      // 換彈分三段音效：退彈匣 → 插彈匣 → 上膛
      if (ws.reloadStage === 0) {
        Sound.play("magOut", { pos });
        ws.reloadStage = 1;
      }
      if (ws.reloadStage === 1 && progress > 0.55) {
        Sound.play("magIn", { pos });
        ws.reloadStage = 2;
      }
      if (ws.reloadStage === 2 && progress > 0.86) {
        Sound.play("bolt", { pos });
        ws.reloadStage = 3;
      }
      if (ws.reloadLeft <= 0) {
        const need = ws.magSize - ws.ammo;
        const take = Math.min(need, ws.reserve);
        ws.ammo += take;
        ws.reserve -= take; // Infinity - n 仍是 Infinity，所以手槍備彈無限
        ws.reloadLeft = 0;
      }
    }
  },

  // 開始換彈；彈匣已滿或沒有備彈時不動作。
  startReload(actor, ws = actor.weapon) {
    if (ws.reloading || ws.ammo >= ws.magSize || ws.reserve <= 0) return false;
    ws.reloadTotal = ws.reloadLeft =
      ws.def.reload / (actor.mods ? actor.mods.reload : 1);
    ws.reloadStage = 0;
    return true;
  },

  /* 嘗試開一槍。
   *   origin    射線起點（眼睛位置）
   *   dir       瞄準方向（單位向量）
   *   spreadDeg 呼叫者算好的姿勢散布（腰射／開鏡／移動中），這裡會再加上連射散布
   * 成功開火回傳 true。 */
  tryFire(actor, origin, dir, spreadDeg) {
    const ws = actor.weapon;
    const def = ws.def;
    if (ws.cooldown > 0 || ws.reloading) return false;
    if (ws.ammo <= 0) {
      if (!this.startReload(actor) && actor.isPlayer && ws.cooldown <= 0) {
        Sound.play("empty");
        ws.cooldown = 0.25;
      }
      return false;
    }

    // 先把起點與方向複製一份：呼叫者傳進來的可能是共用的暫存向量，
    // 途中產生特效時會被覆寫（霰彈槍一次射很多顆，後面幾顆就會算錯）
    origin = this._origin.copy(origin);
    dir = this._aim.copy(dir);

    ws.ammo--;
    ws.cooldown = 60 / (def.rpm * (actor.mods ? actor.mods.fireRate : 1));
    const spread = Math.min(def.spreadMax + spreadDeg, spreadDeg + ws.bloom);
    ws.bloom = Math.min(def.spreadMax, ws.bloom + def.bloom);
    actor.stats.shots++;

    // 槍口位置：曳光彈和火光從這裡出現（命中判定仍然從眼睛算）
    const muzzle = actor.muzzlePos(TMP.v4);
    const mx = muzzle.x,
      my = muzzle.y,
      mz = muzzle.z;
    if (!actor.isPlayer)
      FX.muzzle(
        mx,
        my,
        mz,
        def.tracer,
        def.id === "shotgun" || def.id === "sniper",
      );
    if (def.kind === "hitscan" && Math.random() < 0.6)
      FX.muzzleSmoke(mx, my, mz); // 槍口冒出的白煙
    Sound.play(def.sound, {
      pos: actor.isPlayer ? null : actor.pos,
      vol: actor.isPlayer ? 0.9 : 1,
    });
    if (actor.rig) actor.rig.recoil = 1;
    actor.lastShotTime = Game.time;

    let hitSomeone = false;
    for (let i = 0; i < def.pellets; i++) {
      const d = this._spreadDir(dir, spread, this._dir);
      if (def.kind === "projectile") {
        this.spawnProjectile(actor, mx, my, mz, origin, d, def);
      } else if (this._hitscan(actor, origin, d, def, mx, my, mz)) {
        hitSomeone = true;
      }
    }
    if (hitSomeone) actor.stats.hits++;
    return true;
  },

  // 在 dir 周圍 deg 度的圓錐內隨機偏移，結果寫入 out
  _spreadDir(dir, deg, out) {
    if (deg <= 0.001) return out.copy(dir);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.tan((deg * Math.PI) / 180) * Math.sqrt(Math.random());
    // 找出與 dir 垂直的兩個方向（右、上）
    const right = TMP.v1.set(-dir.z, 0, dir.x);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = TMP.v2.crossVectors(right, dir);
    return out
      .copy(dir)
      .addScaledVector(right, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius)
      .normalize();
  },

  // 距離衰減：falloff = [開始衰減, 衰減結束, 最低比例]
  _falloff(def, dist) {
    const [a, b, min] = def.falloff;
    if (dist <= a) return 1;
    if (dist >= b) return min;
    return Util.lerp(1, min, (dist - a) / (b - a));
  },

  // 立即命中的一發子彈；打到敵人回傳 true
  _hitscan(actor, origin, d, def, mx, my, mz) {
    const hit = this._hit;
    const wallDist = World.raycast(
      origin.x,
      origin.y,
      origin.z,
      d.x,
      d.y,
      d.z,
      320,
      hit,
    );
    const target = this.rayActors(
      origin.x,
      origin.y,
      origin.z,
      d.x,
      d.y,
      d.z,
      Math.min(wallDist, 320),
      actor,
    );

    let ex, ey, ez; // 子彈終點
    let result = false;
    // 打中人：計算距離衰減與爆頭倍率。
    if (target) {
      ex = origin.x + d.x * target.dist;
      ey = origin.y + d.y * target.dist;
      ez = origin.z + d.z * target.dist;
      let dmg = def.damage * this._falloff(def, target.dist);
      if (target.head) dmg *= def.headMult * (actor.mods ? actor.mods.head : 1);
      this.damage(target.actor, dmg, actor, {
        head: target.head,
        weapon: def.id,
        x: ex,
        y: ey,
        z: ez,
      });
      if (actor.mods && actor.mods.explosive > 0)
        this.explode(
          ex,
          ey,
          ez,
          2.2,
          actor.mods.explosive,
          actor,
          0xffc266,
          def.id,
          true,
        );
      result = true;
    } else if (wallDist < Infinity) {
      ex = hit.x;
      ey = hit.y;
      ez = hit.z;
      FX.impact(hit, def.tracer);
      if (Math.random() < 0.35) Sound.play("impact", { pos: hit });
      if (hit.box && hit.box.tag && hit.box.tag.barrel)
        this.damageBarrel(hit.box.tag.barrel, def.damage, actor);
      if (actor.mods && actor.mods.explosive > 0)
        this.explode(
          ex,
          ey,
          ez,
          2.2,
          actor.mods.explosive,
          actor,
          0xffc266,
          def.id,
          true,
        );
    } else {
      ex = origin.x + d.x * 150;
      ey = origin.y + d.y * 150;
      ez = origin.z + d.z * 150;
    }
    FX.tracer(
      mx,
      my,
      mz,
      ex,
      ey,
      ez,
      def.tracer,
      def.id === "sniper" ? 0.05 : 0.022,
    );

    // 敵人的子彈從玩家耳邊飛過時播放呼嘯聲
    const player = Game.player;
    // 子彈從玩家身邊飛過時，播放呼嘯聲。
    if (
      !actor.isPlayer &&
      player &&
      player.alive &&
      !result &&
      Math.random() < 0.5
    ) {
      const px = player.pos.x - origin.x,
        py = player.pos.y + 1.5 - origin.y,
        pz = player.pos.z - origin.z;
      const along = px * d.x + py * d.y + pz * d.z; // 玩家在彈道上的投影距離
      if (along > 2 && along < Math.min(wallDist, 320)) {
        const miss = Math.hypot(
          px - d.x * along,
          py - d.y * along,
          pz - d.z * along,
        );
        if (miss < 1.6) Sound.play("whiz", { vol: 0.7 });
      }
    }
    return result;
  },

  /* ---------- 射線 vs 角色 ----------
   * 回傳最近被打到的角色 { actor, dist, head }，沒有則回傳 null。
   * 同隊的角色會被忽略（沒有隊友傷害）。 */
  rayActors(ox, oy, oz, dx, dy, dz, maxDist, shooter) {
    let best = null;
    let bestDist = maxDist;
    // 逐一檢查每個角色的頭部與身體。
    for (const a of this.actors) {
      if (!a.alive || a === shooter || (shooter && a.team === shooter.team))
        continue;
      const h = a.hit;
      const cx = a.pos.x,
        cz = a.pos.z;
      const base = a.pos.y + h.base;

      // 粗略篩選：離彈道太遠的直接跳過
      const tx = cx - ox,
        ty = base + h.h * 0.5 - oy,
        tz = cz - oz;
      const along = tx * dx + ty * dy + tz * dz;
      if (along < -2 || along > bestDist + 3) continue;
      const off2 = tx * tx + ty * ty + tz * tz - along * along;
      const reach = h.h * 0.6 + h.r + 0.5;
      if (off2 > reach * reach) continue;

      // 頭：射線與球的交點
      let tHead = Infinity;
      // 頭部：用球體判斷。
      if (h.headR > 0) {
        // headFwd：弱點往角色正面突出的距離（九頭蛇核心的巨眼）
        const fwd = h.headFwd || 0;
        const hx = cx - Math.sin(a.yaw) * fwd - ox,
          hy = base + h.headY - oy,
          hz = cz - Math.cos(a.yaw) * fwd - oz;
        const b = hx * dx + hy * dy + hz * dz;
        const c = hx * hx + hy * hy + hz * hz - h.headR * h.headR;
        const disc = b * b - c;
        if (disc >= 0) {
          const t = b - Math.sqrt(disc);
          if (t > 0) tHead = t;
        }
      }

      // 身體：射線與直立圓柱的交點（先解俯視圖的圓，再檢查高度）
      // 身體：用直立的圓柱判斷。
      let tBody = Infinity;
      const A = dx * dx + dz * dz;
      if (A > 1e-8) {
        const fx = ox - cx,
          fz = oz - cz;
        const B = fx * dx + fz * dz;
        const C = fx * fx + fz * fz - h.r * h.r;
        const disc = B * B - A * C;
        if (disc >= 0) {
          const t = (-B - Math.sqrt(disc)) / A;
          const y = oy + dy * t;
          if (t > 0 && y >= base && y <= base + h.h) tBody = t;
        }
      }

      const t = Math.min(tHead, tBody);
      if (t < bestDist) {
        bestDist = t;
        best = { actor: a, dist: t, head: tHead <= tBody + 0.06 }; // 同時打到時優先算爆頭
      }
    }
    return best;
  },

  /* ============================================================
   *  傷害與擊殺
   * ============================================================ */
  damage(target, amount, attacker, info = {}) {
    if (!target.alive || target.invuln > 0) return 0;

    // 難度：電腦打玩家的傷害倍率；電腦互打時降低一些，讓戰線不會瞬間崩潰
    if (attacker && !attacker.isPlayer) {
      amount *= target.isPlayer
        ? Game.difficulty.botDamage *
          (attacker.damageMult || 1) *
          (Game.rules.enemyDamage ?? 1) *
          (attacker.isBoss ? 1 : (Game.rules.minionDamage ?? 1)) // 首領戰：小兵的傷害另外打折
        : 0.34;
    }
    if (attacker && attacker.isPlayer) {
      amount *= attacker.mods.damage;
      if (target.marked > 0) amount *= 1.2; // 被「脈衝掃描」標記的目標
    }

    const dealt = target.takeDamage(amount, attacker, info);
    if (dealt <= 0) return 0;
    if (attacker) attacker.stats.damage += dealt;
    if (attacker && attacker !== target) {
      // 記下「誰在最近 10 秒內打了我多少」：之後別人擊殺我時，打超過 20 點的人算助攻
      const rec = target.hitBy.get(attacker);
      if (rec && Game.time - rec.t < 10) {
        rec.dmg += dealt;
        rec.t = Game.time;
      } else target.hitBy.set(attacker, { t: Game.time, dmg: dealt });
      if (target.isBoss) attacker.stats.bossDamage += dealt;
      if (info.head) attacker.stats.headshots++; // 爆頭命中（所有人都記錄，結算畫面要用）
    }
    if (attacker && attacker.isPlayer) target.lastHitByPlayer = Game.time; // HUD 用：最近被玩家打到的敵人會顯示血條

    // 命中特效（打在護甲上是藍白色火花）
    if (info.x !== undefined) {
      FX.hitFlesh(
        info.x,
        info.y,
        info.z,
        target.armor > 0 ? 0x9fd8ff : 0xff6a5a,
        info.head,
      );
    }
    if (target.rig) target.rig.flashT = 1;

    const killed = !target.alive;
    if (attacker && attacker.isPlayer && target !== attacker) {
      HUD.hitMarker(killed, info.head);
      HUD.damageNumber(
        info.x ?? target.pos.x,
        (info.y ?? target.pos.y + 1.5) + 0.2,
        info.z ?? target.pos.z,
        dealt,
        info.head,
      );
      Sound.play(info.head ? "headshot" : "hit");
    }
    if (killed) Game.onKill(target, attacker, info);
    return dealt;
  },

  /* 爆炸：對半徑內所有「沒被牆擋住」的角色造成傷害。
   * small = true 是爆裂彈那種小爆炸，特效與震動較小。 */
  explode(
    x,
    y,
    z,
    radius,
    damage,
    attacker,
    colorHex = 0xff8a2a,
    weaponId = "explosion",
    small = false,
  ) {
    if (small) {
      FX.flash(x, y, z, colorHex, radius * 0.9, 0.15, 1.8);
      FX.sparks(x, y, z, 0, 1, 0, colorHex, 10, 6);
    } else {
      FX.explosion(x, y, z, radius, colorHex);
      Sound.play("explosion", { pos: { x, y, z } });
      Game.alertSound(x, z, 45, -1); // 爆炸聲會引來附近所有電腦
    }

    let hitCount = 0; // 炸到幾個人（不含自己），回傳給呼叫的人
    for (const a of this.actors) {
      if (!a.alive) continue;
      // 不會炸到隊友，但會炸到自己
      if (attacker && a !== attacker && a.team === attacker.team) continue;
      const cy = a.pos.y + a.hit.base + a.hit.h * 0.55;
      const dist = Math.hypot(a.pos.x - x, cy - y, a.pos.z - z) - a.hit.r;
      if (dist > radius) continue;
      if (!World.los(x, y + 0.3, z, a.pos.x, cy, a.pos.z)) continue; // 被厚牆擋住

      const k = 1 - Util.clamp(dist / radius, 0, 1);
      let dmg = damage * (0.25 + 0.75 * k);
      if (a === attacker) dmg *= 0.5; // 自傷減半
      this.damage(a, dmg, attacker, { weapon: weaponId, explosive: true });
      if (a !== attacker) hitCount++;

      // 把人炸飛
      if (!small && a.alive && !a.isBoss) {
        const push = 7 * k;
        const d = Math.max(0.5, Math.hypot(a.pos.x - x, a.pos.z - z));
        a.vel.x += ((a.pos.x - x) / d) * push;
        a.vel.z += ((a.pos.z - z) / d) * push;
        if (a.onGround) {
          a.vel.y = 3 + 3 * k;
          a.onGround = false;
        }
      }
    }

    // 連鎖引爆附近的爆炸桶
    if (!small) {
      for (const b of this.barrels) {
        if (b.alive && Math.hypot(b.x - x, b.z - z) < radius + 0.5)
          this.damageBarrel(b, 999, attacker, 0.12 + Math.random() * 0.15);
      }
    }
    return hitCount;
  },

  /* ============================================================
   *  飛行彈體（榴彈、電漿彈、首領的光球與火箭）
   * ============================================================ */
  spawnProjectile(actor, mx, my, mz, origin, dir, def) {
    const p = def.projectile;
    // 從槍口出發，但方向修正為「瞄準線 60 公尺處」，子彈才會飛向準星
    const tx = origin.x + dir.x * 60,
      ty = origin.y + dir.y * 60,
      tz = origin.z + dir.z * 60;
    const d = this._v.set(tx - mx, ty - my, tz - mz).normalize();
    this.addProjectile({
      owner: actor,
      x: mx,
      y: my,
      z: mz,
      vx: d.x * p.speed,
      vy: d.y * p.speed + (p.gravity ? 2.2 : 0),
      vz: d.z * p.speed,
      gravity: p.gravity,
      damage: def.damage,
      blast: p.blast,
      color: p.color,
      size: p.size,
      weapon: def.id,
      rocket: def.id === "launcher",
      direct: def.id !== "launcher",
    });
  },

  /* 加入一顆彈體。o 的欄位：
   *   owner 發射者   x,y,z 位置   vx,vy,vz 速度   gravity 下墜
   *   damage 傷害    blast 爆炸半徑   color 顏色   size 大小
   *   rocket 是否顯示火箭模型   direct 直接命中才有全額傷害（電漿）
   *   life 最長存活秒數 */
  addProjectile(o) {
    const p = { life: 6, ...o };
    /* 防穿牆：彈體的出生點（槍口、首領身邊的光球）如果隔著一面牆，
     * 就改從發射者身體中央出發。射線檢查會忽略「起點就在牆裡」的情況，
     * 所以不這樣做的話，貼著牆開火時子彈會直接出現在牆的另一邊。 */
    const ow = p.owner;
    if (ow && ow.pos) {
      const hd = Math.hypot(p.x - ow.pos.x, p.z - ow.pos.z);
      if (
        hd > 0.05 &&
        hd < 4 &&
        !World.los(ow.pos.x, p.y, ow.pos.z, p.x, p.y, p.z)
      ) {
        p.x = ow.pos.x;
        p.z = ow.pos.z;
      }
    }
    if (p.rocket) {
      p.mesh = WeaponModels.rocket(p.color);
      Scene3D.scene.add(p.mesh);
    }
    const mat = new THREE.SpriteMaterial({
      map: Tex.glowSprite(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    mat.color.setHex(p.color).multiplyScalar(3);
    p.sprite = new THREE.Sprite(mat);
    p.sprite.scale.setScalar(p.size * 7);
    Scene3D.scene.add(p.sprite);
    /* 玩家自己射出的彈體：剛離開槍口時離眼睛太近，一顆發光球會塞滿整個畫面、很刺眼。
     * 所以先隱藏，飛出 2 公尺後才在 1.5 公尺內慢慢淡入（光球與尾跡都是）。 */
    p.travel = 0;
    p.fadeIn = o.owner && o.owner.isPlayer ? 2 : 0;
    if (p.fadeIn) {
      p.sprite.visible = false;
      if (p.mesh) p.mesh.visible = false;
    }
    this.projectiles.push(p);
    return p;
  },

  // 移除一個飛行物與它的外觀。
  _removeProjectile(p) {
    if (p.mesh) {
      Builder.dispose(p.mesh);
      p.mesh = null;
    }
    if (p.sprite) {
      Scene3D.scene.remove(p.sprite);
      p.sprite.material.dispose();
      p.sprite = null;
    }
  },

  // 更新所有飛行物：移動、重力、碰撞與尾焰。
  _updateProjectiles(dt) {
    const hit = this._hit;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vy -= p.gravity * dt;
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      const step = speed * dt;
      const dx = p.vx / speed,
        dy = p.vy / speed,
        dz = p.vz / speed;

      // 這一小段路徑上有沒有撞到牆或敵人
      const wallDist = World.raycast(
        p.x,
        p.y,
        p.z,
        dx,
        dy,
        dz,
        step + 0.1,
        hit,
      );
      const target = this.rayActors(
        p.x,
        p.y,
        p.z,
        dx,
        dy,
        dz,
        Math.min(wallDist, step + 0.1),
        p.owner,
      );
      let impact = null;
      if (target)
        impact = {
          x: p.x + dx * target.dist,
          y: p.y + dy * target.dist,
          z: p.z + dz * target.dist,
        };
      else if (wallDist < Infinity)
        impact = {
          x: hit.x - dx * 0.05,
          y: hit.y - dy * 0.05,
          z: hit.z - dz * 0.05,
        };

      // 命中或時間到：造成傷害、爆炸，然後移除。
      if (impact || p.life <= 0) {
        const at = impact || p;
        if (p.direct && target) {
          // 電漿／光球：直接命中造成全額傷害
          this.damage(target.actor, p.damage, p.owner, {
            head: target.head,
            weapon: p.weapon,
            x: at.x,
            y: at.y,
            z: at.z,
          });
          if (p.owner && WEAPONS[p.weapon]) p.owner.stats.hits++; // 電漿彈直接命中
          FX.flash(at.x, at.y, at.z, p.color, 1.2, 0.14, 1.8);
        } else if (p.direct) {
          FX.flash(at.x, at.y, at.z, p.color, 1.0, 0.14, 1.8);
          FX.sparks(
            at.x,
            at.y,
            at.z,
            hit.nx || 0,
            hit.ny || 1,
            hit.nz || 0,
            p.color,
            8,
            5,
          );
          if (wallDist < Infinity) FX.scorch(hit, p.color); // 打在牆上留下發光的灼痕
          if (
            wallDist < Infinity &&
            hit.box &&
            hit.box.tag &&
            hit.box.tag.barrel
          )
            this.damageBarrel(hit.box.tag.barrel, p.damage, p.owner);
        } else {
          const n = this.explode(
            at.x,
            at.y,
            at.z,
            p.blast,
            p.damage,
            p.owner,
            p.color,
            p.weapon,
          );
          if (n > 0 && p.owner && WEAPONS[p.weapon]) p.owner.stats.hits++; // 火箭炸到人也算命中
        }
        if (p.onHit) p.onHit(at);
        this._removeProjectile(p);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.travel += step;
      // 淡入比例：0（還在槍口附近，看不到）→ 1（完全顯示）
      let show = p.fadeIn ? Util.clamp((p.travel - p.fadeIn) / 1.5, 0, 1) : 1;
      // 任何光彈（包含敵人射來的）貼近鏡頭 3 公尺內都會變小變淡，從臉旁飛過時畫面才不會被整片染色
      const cam = Scene3D.camera.position;
      const camDist = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      show *= Util.clamp((camDist - 0.6) / 2.4, 0, 1);
      p.sprite.visible = show > 0;
      p.sprite.scale.setScalar(p.size * 7 * show);
      if (p.mesh) p.mesh.visible = show > 0;
      p.sprite.position.set(p.x, p.y, p.z);
      // 有模型的飛行物（火箭、飛刃）朝飛行方向轉動。
      if (p.mesh) {
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.lookAt(p.x + dx, p.y + dy, p.z + dz);
        if (show > 0)
          FX.puff(
            p.x - dx * 0.3,
            p.y - dy * 0.3,
            p.z - dz * 0.3,
            1,
            0.35,
            0x8a8a8a,
            0.2,
          ); // 火箭尾煙
      }
      if (show <= 0) continue; // 還在槍口附近：不畫尾跡
      // 發光尾跡
      FX.glow.emit({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0.22,
        size: p.size * 2.4 * show,
        size1: 0.01,
        color: FX._c.setHex(p.color),
        bright: 2.5,
      });
    }
  },

  /* ============================================================
   *  手榴彈
   * ============================================================ */
  throwGrenade(actor, origin, dir) {
    const mesh = WeaponModels.grenade();
    Scene3D.scene.add(mesh);
    const G = CONFIG.GRENADE;
    this.grenades.push({
      owner: actor,
      mesh,
      fuse: G.fuse,
      pos: new THREE.Vector3(
        origin.x + dir.x * 0.5,
        origin.y - 0.15,
        origin.z + dir.z * 0.5,
      ),
      vel: new THREE.Vector3(
        dir.x * G.speed + actor.vel.x * 0.5,
        dir.y * G.speed + 3.2,
        dir.z * G.speed + actor.vel.z * 0.5,
      ),
    });
    Sound.play("throw", { pos: actor.isPlayer ? null : actor.pos });
  },

  /* 模擬手榴彈的一小步（投擲預覽線也用同一個函式，所以預覽和實際落點一致）。
   * 回傳是否發生反彈。 */
  stepGrenade(pos, vel, dt) {
    const hit = this._hit;
    vel.y -= 16 * dt;
    const speed = vel.length();
    if (speed < 0.01) return false;
    const dist = World.raycast(
      pos.x,
      pos.y,
      pos.z,
      vel.x / speed,
      vel.y / speed,
      vel.z / speed,
      speed * dt + 0.08,
      hit,
    );
    if (dist < Infinity) {
      // 反彈：把速度沿表面法線反射，並損失大部分能量
      const dot = vel.x * hit.nx + vel.y * hit.ny + vel.z * hit.nz;
      vel.x = (vel.x - 2 * dot * hit.nx) * 0.42;
      vel.y = (vel.y - 2 * dot * hit.ny) * 0.42;
      vel.z = (vel.z - 2 * dot * hit.nz) * 0.42;
      pos.set(
        hit.x + hit.nx * 0.09,
        hit.y + hit.ny * 0.09,
        hit.z + hit.nz * 0.09,
      );
      // 落在地上：滾動摩擦
      if (hit.ny > 0.5) {
        vel.x *= 0.7;
        vel.z *= 0.7;
        if (Math.abs(vel.y) < 1.2) vel.y = 0;
      }
      return true;
    }
    pos.addScaledVector(vel, dt);
    return false;
  },

  // 更新飛行中的手榴彈：彈跳、倒數與爆炸。
  _updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      const bounced = this.stepGrenade(g.pos, g.vel, dt);
      if (bounced && g.vel.length() > 1.5) Sound.play("bounce", { pos: g.pos });
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * g.vel.length() * 1.5;
      g.mesh.rotation.z += dt * 3;
      // 快爆炸時閃紅光
      if (g.fuse < 0.8 && Math.floor(g.fuse * 12) % 2 === 0)
        FX.flash(g.pos.x, g.pos.y + 0.1, g.pos.z, 0xff3030, 0.5, 0.05, 1);
      if (g.fuse <= 0) {
        this.explode(
          g.pos.x,
          g.pos.y + 0.1,
          g.pos.z,
          CONFIG.GRENADE.radius,
          CONFIG.GRENADE.damage,
          g.owner,
          0xff8a2a,
          "grenade",
        );
        Builder.dispose(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  },

  /* ============================================================
   *  近戰
   * ============================================================ */
  melee(actor, origin, dir) {
    const M = CONFIG.MELEE;
    Sound.play("melee", { pos: actor.isPlayer ? null : actor.pos });
    // 找出正前方範圍內最近的敵人
    let best = null,
      bestDist = M.range;
    for (const a of this.actors) {
      if (!a.alive || a === actor || a.team === actor.team) continue;
      const dx = a.pos.x - origin.x,
        dy = a.pos.y + a.hit.base + a.hit.h * 0.6 - origin.y,
        dz = a.pos.z - origin.z;
      const dist = Math.hypot(dx, dy, dz) - a.hit.r;
      if (dist > bestDist) continue;
      const facing =
        (dx * dir.x + dy * dir.y + dz * dir.z) /
        Math.max(0.1, Math.hypot(dx, dy, dz));
      if (facing < 0.55) continue; // 不在正面扇形內
      if (
        !World.los(
          origin.x,
          origin.y,
          origin.z,
          a.pos.x,
          a.pos.y + a.hit.base + a.hit.h * 0.6,
          a.pos.z,
        )
      )
        continue; // 隔著牆打不到
      best = a;
      bestDist = dist;
    }
    if (best) {
      const y = best.pos.y + best.hit.base + best.hit.h * 0.7;
      this.damage(best, M.damage, actor, {
        weapon: "melee",
        x: best.pos.x,
        y,
        z: best.pos.z,
      });
      FX.sparks(
        best.pos.x,
        y,
        best.pos.z,
        -dir.x,
        0.4,
        -dir.z,
        0xffffff,
        10,
        5,
      );
      return true;
    }
    return false;
  },

  /* ============================================================
   *  爆炸桶
   * ============================================================ */
  spawnBarrels(list) {
    for (const spot of list) {
      const p = Nav.snap(spot.x, spot.z);
      const b = new Builder();
      b.cyl(0.42, 0.42, 1.15, {
        p: [0, 0.575, 0],
        c: 0xb02a2a,
        m: "metal",
        seg: 16,
      });
      for (const y of [0.1, 0.58, 1.06])
        b.torus(0.43, 0.035, {
          p: [0, y, 0],
          r: [Math.PI / 2, 0, 0],
          c: 0x7a1a1a,
          m: "metal",
          seg: 18,
        });
      b.cyl(0.432, 0.432, 0.22, {
        p: [0, 0.75, 0],
        c: 0xffc233,
        m: "glow",
        e: 0.5,
        seg: 16,
        open: true,
      }); // 警示帶
      b.cyl(0.08, 0.08, 0.05, {
        p: [0.18, 1.17, 0],
        c: 0x2a2d33,
        m: "metal",
        seg: 8,
      });
      const mesh = b.build();
      mesh.position.set(p.x, p.y, p.z);
      Scene3D.scene.add(mesh);
      const barrel = { x: p.x, y: p.y, z: p.z, mesh, hp: 35, alive: true };
      barrel.box = World.addBox(p.x, p.y + 0.575, p.z, 0.8, 1.15, 0.8, {
        tag: { barrel },
        noWalk: true,
      });
      // 桶子佔住的那一格暫時標成不可走，電腦尋路時就會繞開；爆炸後再還原
      barrel.cell = Nav.idx(p.x, p.z);
      Nav.ok[barrel.cell] = 0;
      this.barrels.push(barrel);
    }
  },

  // delay > 0 用於連鎖爆炸：稍微錯開時間，看起來更有層次
  damageBarrel(barrel, amount, attacker, delay = 0) {
    if (!barrel.alive) return;
    barrel.hp -= amount;
    if (barrel.hp > 0) {
      FX.sparks(barrel.x, barrel.y + 0.8, barrel.z, 0, 1, 0, 0xffc233, 5, 3);
      return;
    }
    barrel.alive = false;
    // 實際爆炸；也會引爆附近其他的油桶。
    const boom = () => {
      barrel.gone = true;
      World.removeBox(barrel.box);
      Nav.ok[barrel.cell] = 1;
      barrel.mesh.visible = false;
      this.explode(
        barrel.x,
        barrel.y + 0.6,
        barrel.z,
        6.5,
        150,
        attacker,
        0xff6a1a,
        "barrel",
      );
    };
    if (delay > 0) this.after(delay, boom);
    else boom();
  },

  /* ============================================================
   *  補給品
   * ============================================================ */
  spawnPickups(defs) {
    for (const [type, x, z] of defs) {
      const p = Nav.snap(x, z);
      const mesh = WeaponModels.pickup(type);
      mesh.position.set(p.x, p.y, p.z);
      Scene3D.scene.add(mesh);
      this.pickups.push({
        type,
        x: p.x,
        y: p.y,
        z: p.z,
        mesh,
        item: mesh.userData.item,
        active: true,
        timer: 0,
      });
    }
  },

  // 補給：等待重新出現、漂浮旋轉，以及玩家靠近時撿取。
  _updatePickups(dt) {
    for (const p of this.pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.active = true;
          p.item.visible = true;
          FX.ring(p.x, p.y + 0.1, p.z, 1.6, 0xffffff, 0.4); // 重新出現時閃一下
        }
        continue;
      }
      p.item.rotation.y += dt * 1.2;
      for (const a of this.actors) {
        if (!a.alive || a.isBoss || a.noPickup) continue;
        if (
          Math.abs(a.pos.y - p.y) > 1.2 ||
          Util.dist2D(a.pos.x, a.pos.z, p.x, p.z) > 1.2
        )
          continue;
        if (!a.usePickup(p.type)) continue; // 已經滿了就不會撿
        p.active = false;
        p.item.visible = false; // 只藏起物品，底座留著（上面會顯示重生倒數）
        p.timer = p.maxTimer = { ammo: 18, armor: 30, health: 26, grenade: 26 }[
          p.type
        ];
        if (a.isPlayer) {
          Sound.play("pickup");
          HUD.toast(
            {
              health: "醫療包 +1（按 H 使用）",
              armor: "護盾已補滿",
              ammo: "彈藥補給",
              grenade: "手榴彈 +2",
            }[p.type],
          );
        }
        break;
      }
    }
  },
};
