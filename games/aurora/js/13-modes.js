/*
 * ============================================================
 *  13-modes.js ── 遊戲流程與五種模式
 * ------------------------------------------------------------
 *    Game       一場對戰的總管：開始、暫停、結束、每幀更新、
 *               擊殺結算、重生、出生點、聲音警戒、軌道打擊
 *    ModeBase   所有模式共用的基礎（計時、重生倒數）
 *    TeamDeathmatch  團隊死鬥    Domination  據點爭奪
 *    FreeForAll      個人亂鬥    Survival    生存波次
 *    BossRaid        首領討伐
 *
 *  每個模式要回答三個問題：
 *    1. init()      開場要生出哪些角色？
 *    2. onKill()    有人被擊殺時分數怎麼算？什麼時候分出勝負？
 *    3. botGoal()   電腦沒事做的時候應該往哪裡走？
 * ============================================================
 */

const Game = {
  state: "menu", // menu 選單｜playing 對戰中｜paused 暫停｜perk 選強化｜ended 結算
  time: 0, // 這場對戰經過的秒數（暫停時不會前進）
  difficulty: DIFFICULTIES[1],
  operator: OPERATORS[0],
  mapDef: null,
  mode: null, // 目前模式的物件
  // 模式決定的規則：
  //   regen       自動回血速度（每秒）     regenDelay  多久沒受傷才開始回血（秒）
  //   enemyDamage 敵人打玩家的傷害倍率（會再乘上難度設定）
  rules: { regen: 0, regenDelay: 6, enemyDamage: 1 },
  player: null,
  boss: null,
  bots: [],
  multiCount: 0, // 連續擊殺計數（雙殺、三連殺…）
  multiT: 0,
  lastCombatTime: -99, // 玩家最近一次交火的時間（背景音樂強度用）

  /* ---------- 載入地圖（選單預覽與對戰共用；同一張圖不會重複建造） ---------- */
  loadMap(id) {
    if (Maps.current && Maps.current.id === id && Maps.group) return;
    this.clearMatch();
    Maps.load(id);
    this.mapDef = Maps.current;
    FX.setWeather(this.mapDef.weather);
  },

  // 清掉上一場的角色、彈體、補給與特效
  clearMatch() {
    for (const b of this.bots) b.dispose();
    if (this.player) this.player.dispose();
    for (const p of this.modeObjects || []) {
      Scene3D.scene.remove(p);
      if (p.material) p.material.dispose();
    }
    this.modeObjects = [];
    this.bots = [];
    this.player = null;
    this.boss = null;
    Combat.reset();
    FX.clear();
  },

  /* ---------- 開始一場對戰 ----------
   * cfg = { operator, map, mode, difficulty, boss }（都是代號） */
  start(cfg) {
    this.difficulty =
      DIFFICULTIES.find((d) => d.id === cfg.difficulty) || DIFFICULTIES[1];
    this.operator =
      OPERATORS.find((o) => o.id === cfg.operator) || OPERATORS[0];
    const modeDef = MODES.find((m) => m.id === cfg.mode) || MODES[0];
    this.config = cfg;

    this.loadMap(cfg.map);
    this.clearMatch();
    this.time = 0;
    this.multiCount = 0;
    this.lastCombatTime = -99;
    ACTOR_ID = 1;

    Combat.spawnBarrels(Maps.runtime.barrels);
    Combat.spawnPickups(this.mapDef.pickups);

    // 玩家
    this.player = new Player(this.operator, 0);
    Combat.actors.push(this.player);

    // 模式
    const ModeClass = {
      tdm: TeamDeathmatch,
      dom: Domination,
      ffa: FreeForAll,
      survival: Survival,
      boss: BossRaid,
    }[modeDef.id];
    this.mode = new ModeClass(modeDef, cfg);
    this.mode.init();

    const sp = this.spawnPoint(this.player);
    this.player.spawnAt(sp.x, sp.y, sp.z, sp.yaw);

    HUD.reset();
    HUD.show(true);
    Sound.startMusic(this.mapDef.music.root, this.mapDef.music.tempo);
    Sound.play("uiStart");
    this.state = "playing";
    Input.clear();
    Input.lock();
    HUD.announce(
      modeDef.name,
      this.mapDef.name + " · " + this.difficulty.name,
      this.operator.look.accent,
    );
  },

  /* ---------- 每幀更新 ---------- */
  update(dt) {
    this.time += dt;
    Bot.pathBudget = 4;

    this.player.update(dt);
    for (const b of this.bots) b.update(dt);
    this._pushPlayerOut();

    Combat.update(dt);
    this.mode.update(dt);
    this._cleanup();

    // 連殺計時
    if (this.multiT > 0) {
      this.multiT -= dt;
      if (this.multiT <= 0) this.multiCount = 0;
    }

    // 畫面後製：受傷紅邊淡出、瀕死褪色、閃白淡出
    const post = Scene3D.post;
    post.hurt = Util.damp(post.hurt, 0, 2.2, dt);
    post.flash = Util.damp(post.flash, 0, 6, dt);
    const p = this.player;
    const lowHp = p.alive ? Util.clamp(1 - p.hp / (p.maxHp * 0.35), 0, 1) : 1;
    post.desat = Util.damp(post.desat, lowHp * 0.65, 4, dt);
    post.vignette = 0.5 + lowHp * 0.35;

    // 背景音樂：交火時鼓點變多
    Sound.music.intensity = Util.damp(
      Sound.music.intensity,
      this.time - this.lastCombatTime < 6 ? 1 : 0.25,
      1.5,
      dt,
    );
  },

  // 玩家不能穿過其他角色（電腦之間則靠 AI 的「保持距離」處理）
  _pushPlayerOut() {
    const p = this.player;
    if (!p.alive) return;
    for (const a of this.bots) {
      if (!a.alive) continue;
      const dx = p.pos.x - a.pos.x,
        dz = p.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = p.radius + a.radius;
      if (
        d < min &&
        d > 0.001 &&
        p.pos.y < a.pos.y + a.hover + a.height &&
        p.pos.y + p.height > a.pos.y + a.hover - 0.5
      ) {
        p.pos.x += (dx / d) * (min - d);
        p.pos.z += (dz / d) * (min - d);
      }
    }
  },

  // 移除已經消失的屍體（只有不會重生的敵人才需要）
  _cleanup() {
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (!b.alive && b.removeOnDeath && b.corpseT > (b.isBoss ? 9 : 5)) {
        b.dispose();
        this.bots.splice(i, 1);
        const k = Combat.actors.indexOf(b);
        if (k >= 0) Combat.actors.splice(k, 1);
      }
    }
  },

  /* ---------- 加入角色 ---------- */
  addBot(bot, removeOnDeath = false) {
    bot.removeOnDeath = removeOnDeath;
    this.bots.push(bot);
    Combat.actors.push(bot);
    return bot;
  },

  // 生存／首領模式用：在指定位置生出一個敵人
  spawnEnemy(typeId, x, y, z, hpScale) {
    const scale = hpScale ?? this.difficulty.enemyHp;
    const bot = Bot.fromEnemy(typeId, 1, scale);
    bot.spawnAt(
      x,
      y,
      z,
      Util.yawTo(this.player.pos.x - x, this.player.pos.z - z),
    );
    bot.invuln = 0.6;
    return this.addBot(bot, true);
  },

  /* ---------- 出生點 ----------
   * 團隊模式：在自己基地附近，挑離敵人最遠的點
   * 個人亂鬥：全地圖挑離所有人最遠的點 */
  spawnPoint(actor) {
    const base = this.mode.ffa
      ? null
      : this.mode.solo && actor.isPlayer
        ? this.mapDef.playerSpawn
        : this.mapDef.bases[actor.team] || this.mapDef.bases[1];
    let best = null,
      bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const p = base ? Nav.randomNear(base.x, base.z, 0, 7) : Nav.randomPoint();
      if (!p) continue;
      let nearest = 999;
      for (const a of Combat.actors) {
        if (a === actor || !a.alive) continue;
        const d = Util.dist2D(a.pos.x, a.pos.z, p.x, p.z);
        // 隊友只要不重疊就好；敵人越遠越好
        nearest = Math.min(
          nearest,
          a.team === actor.team ? (d < 1.5 ? 0 : 999) : d,
        );
      }
      const score = Math.min(nearest, 40) + Math.random() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) best = Nav.snap(base ? base.x : 0, base ? base.z : 0);
    return {
      x: best.x,
      y: best.y,
      z: best.z,
      yaw: Util.yawTo(-best.x, -best.z),
    }; // 面向地圖中心
  },

  // 讓角色在重生點出現。
  respawn(actor) {
    const sp = this.spawnPoint(actor);
    actor.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    if (actor.isPlayer) {
      Scene3D.post.flash = 0.25;
      HUD.toast("已重新部署・2.5 秒無敵保護");
    }
  },

  /* ---------- 擊殺結算 ---------- */
  onKill(victim, killer, info) {
    // 擊殺訊息顯示的武器名稱。
    const weaponName = WEAPONS[info.weapon]
      ? WEAPONS[info.weapon].short
      : {
          grenade: "手榴彈",
          barrel: "爆炸桶",
          melee: "近戰",
          strike: "軌道打擊",
          explosion: "爆炸",
        }[info.weapon] || "首領";
    /* 助攻：10 秒內對受害者造成 20 點以上傷害、但不是最後一擊的人（不含受害者自己的隊友） */
    // 助攻：最近造成過傷害的其他人。
    for (const [a, rec] of victim.hitBy) {
      if (
        a !== killer &&
        a !== victim &&
        (a.team !== victim.team || this.mode.ffa) &&
        this.time - rec.t < 10 &&
        rec.dmg >= 20
      )
        a.stats.assists++;
    }
    victim.hitBy.clear();
    // 更新兇手的擊殺統計與分數。
    if (killer && killer !== victim) {
      const ks = killer.stats;
      const wName = WEAPONS[info.weapon]
        ? WEAPONS[info.weapon].name
        : weaponName; // 結算顯示完整的武器名稱
      ks.weaponKills[wName] = (ks.weaponKills[wName] || 0) + 1;
      ks.killsBy[victim.name] = (ks.killsBy[victim.name] || 0) + 1;
      killer.stats.kills++;
      killer.stats.streak++;
      killer.stats.bestStreak = Math.max(
        killer.stats.bestStreak,
        killer.stats.streak,
      );
      killer.stats.score += (victim.scoreValue || 100) + (info.head ? 50 : 0);
    }
    HUD.killFeed(
      killer && killer !== victim ? killer : null,
      victim,
      weaponName,
      info.head,
      info.weapon,
    );

    // 玩家擊殺：音效、提示與連殺。
    if (killer && killer.isPlayer && killer !== victim) {
      Sound.play("kill");
      this.lastCombatTime = this.time;
      if (killer.mods.leech > 0)
        killer.hp = Math.min(killer.maxHp, killer.hp + killer.mods.leech);
      // 4 秒內連續擊殺：雙殺、三連殺…
      this.multiCount = this.multiT > 0 ? this.multiCount + 1 : 1;
      this.multiT = 4;
      const multi = ["", "", "雙殺", "三連殺", "四連殺", "五連殺", "無人能擋"][
        Math.min(this.multiCount, 6)
      ];
      const streak = { 5: "殺戮盛宴", 8: "主宰戰場", 12: "傳奇" }[
        killer.stats.streak
      ];
      if (multi)
        HUD.announce(multi, "+" + this.multiCount * 50 + " 連殺獎勵", 0xffc233);
      else if (streak)
        HUD.announce(streak, killer.stats.streak + " 連殺不死", 0xff4a5e);
      else if (info.head) HUD.announce("爆頭", victim.name, 0xfff2a0, true);
      if (multi) killer.stats.score += this.multiCount * 50;
    }
    // 玩家死亡：顯示兇手與武器。
    if (victim.isPlayer) {
      HUD.deathInfo(
        killer && killer !== victim ? killer.name : "自己",
        weaponName,
      );
      Sound.play("defeat", { vol: 0.5 });
    }
    this.mode.onKill(victim, killer, info);
  },

  /* 發出聲音：range 公尺內、不屬於 team 隊伍的電腦會前往調查。
   * team 省略時代表玩家的隊伍；傳 -1 表示所有人都會被吸引。 */
  alertSound(x, z, range, team) {
    if (team === undefined) {
      team = this.player.team;
      this.lastCombatTime = this.time;
    }
    for (const b of this.bots) {
      if (!b.alive || b.isBoss || b.team === team) continue;
      if (Util.dist2D(b.pos.x, b.pos.z, x, z) < range) b.hear(x, z);
    }
  },

  // 新星的技能：標定位置，1.4 秒後落下光束
  orbitalStrike(x, y, z, owner) {
    const color = 0xff5a8a;
    FX.mark(x, y, z, 9, color, 1.4);
    FX.beam({ x, y, z }, { x, y: y + 140, z }, 0.07, color, 1.4, false);
    Sound.play("strikeCall", { pos: { x, y, z } });
    Combat.after(1.4, () => {
      FX.beam({ x, y, z }, { x, y: y + 140, z }, 2.6, color, 0.8, true);
      FX.beam({ x, y, z }, { x, y: y + 140, z }, 1.0, 0xffffff, 0.5, true);
      FX.ring(x, y, z, 14, color, 0.7);
      Sound.play("beam", { pos: { x, y, z } });
      Combat.explode(x, y + 0.4, z, 9, 280, owner, color, "strike");
    });
  },

  /* ---------- 暫停／繼續／結束 ---------- */
  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    Input.unlock();
    Menu.showPause(true);
    if (Sound.ctx) Sound.ctx.suspend();
  },

  // 從暫停回到遊戲。
  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    Menu.showPause(false);
    Input.clear();
    Input.lock();
    if (Sound.ctx) Sound.ctx.resume();
    // 瀏覽器規定按 Esc 解除鎖定後要隔一小段時間才能再鎖定；
    // 如果這次沒鎖成功就回到暫停畫面，請玩家再按一次「繼續」
    setTimeout(() => {
      if (this.state === "playing" && !Input.locked && !Input.noLock)
        this.pause();
    }, 450);
  },

  // 滑鼠鎖定被解除（玩家按了 Esc 或切換視窗）→ 自動暫停
  onPointerUnlock() {
    if (this.state === "playing") this.pause();
  },

  // 對戰結束。result = { win, title, sub }
  end(result) {
    if (this.state === "ended") return;
    this.state = "ended";
    this.result = result;
    Sound.stopMusic();
    Sound.play(result.win ? "victory" : "defeat");
    // 慢動作收尾 1.6 秒後顯示結算畫面
    this.endT = 1.6;
  },

  // 結算畫面用的資料
  summary() {
    const s = this.player.stats;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const kd = s.deaths ? s.kills / s.deaths : s.kills;
    // 評等：綜合勝負、擊殺死亡比與命中率
    const points =
      (this.result.win ? 2 : 0) +
      Math.min(3, kd) +
      acc / 25 +
      Math.min(2, s.bestStreak / 4);
    const grade =
      points >= 7.5
        ? "S"
        : points >= 6
          ? "A"
          : points >= 4.5
            ? "B"
            : points >= 3
              ? "C"
              : "D";
    return {
      ...this.result,
      grade,
      stats: [
        ["擊殺", s.kills],
        ["死亡", s.deaths],
        ["爆頭", s.headshots],
        ["命中率", acc + "%"],
        ["最高連殺", s.bestStreak],
        ["造成傷害", Math.round(s.damage)],
        ["得分", s.score],
        ["時間", Util.formatTime(this.time)],
      ],
      extra: this.mode.summaryExtra ? this.mode.summaryExtra() : "",
      // ---- 全員戰績用的資料 ----
      kind: this.mode.ffa ? "ffa" : this.mode.solo ? "solo" : "team", // 個人亂鬥／單人（生存、首領）／團隊
      actors: Combat.actors.filter(
        (a) => !a.isBoss && (a.isPlayer || !a.removeOnDeath),
      ),
      scores: this.mode.scores ? this.mode.scores.slice() : null, // 團隊模式的比分 [我方, 敵方]
      meta: [
        this.mode.def.name,
        this.mapDef.name,
        this.difficulty.name,
        Util.formatTime(this.time),
      ],
    };
  },

  // 回到主選單
  quit() {
    this.state = "menu";
    Sound.stopMusic();
    if (Sound.ctx) Sound.ctx.resume();
    Input.unlock();
    HUD.show(false);
    this.clearMatch();
    Scene3D.post.hurt = Scene3D.post.desat = Scene3D.post.flash = 0;
    Scene3D.post.vignette = 0.55;
    Menu.showMain();
  },
};

/* ============================================================
 *  ModeBase ── 模式的共用基礎
 * ============================================================ */
class ModeBase {
  // def 是模式資料，cfg 是開局設定。
  constructor(def, cfg) {
    this.def = def;
    this.cfg = cfg;
    this.timeLeft = def.timeLimit || 0;
    this.objective = false; // 是否為「搶據點」類的模式（電腦會邊打邊往據點推進）
    // 預設規則（團隊死鬥、據點爭奪）：6 秒沒受傷後每秒回 14 生命，敵人傷害照難度
    Game.rules = { regen: 14, regenDelay: 6, enemyDamage: 1 };
  }

  init() {}

  onKill() {}

  // 電腦沒有目標時要去哪裡（預設：全地圖隨機巡邏）
  botGoal() {
    return Nav.randomPoint();
  }

  // 給 HUD 上方資訊列用的資料
  status() {
    return {};
  }

  // 處理所有角色的重生倒數
  handleRespawns(dt) {
    for (const a of Combat.actors) {
      if (a.alive || !(a.respawnT > 0)) continue;
      a.respawnT -= dt;
      if (a.respawnT <= 0) Game.respawn(a);
    }
  }

  // 倒數計時；時間到回傳 true
  tick(dt) {
    if (!this.def.timeLimit) return false;
    this.timeLeft -= dt;
    return this.timeLeft <= 0;
  }

  update(dt) {
    this.handleRespawns(dt);
  }

  // 建立團隊模式的電腦：我方 allies 人、敵方 enemies 人
  makeTeams(allies, enemies) {
    const pool = Util.shuffle(OPERATORS);
    let n = 0;
    for (let i = 0; i < allies; i++)
      this._addTeamBot(pool[n % pool.length], 0, n++);
    for (let i = 0; i < enemies; i++)
      this._addTeamBot(pool[n % pool.length], 1, n++);
  }

  // 建立一名電腦隊員並放到重生點。
  _addTeamBot(op, team, index, color) {
    const bot = Bot.fromOperator(
      op,
      team,
      index,
      color ?? CONFIG.TEAM_COLORS[team],
    );
    Game.addBot(bot);
    const sp = Game.spawnPoint(bot);
    bot.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    return bot;
  }
}

/* ============================================================
 *  團隊死鬥
 * ============================================================ */
class TeamDeathmatch extends ModeBase {
  // 建立兩隊；玩家也占一個名額。
  init() {
    this.scores = [0, 0];
    this.makeTeams(this.def.teamSize - 1, this.def.teamSize);
  }

  // 擊殺敵隊得一分；自殺或擊殺隊友則由對方得分。
  onKill(victim, killer) {
    victim.respawnT = this.def.respawn;
    if (killer && killer.team !== victim.team) this.scores[killer.team]++;
    else this.scores[1 - victim.team]++; // 自殺算對方得分
    if (
      this.scores[0] >= this.def.scoreLimit ||
      this.scores[1] >= this.def.scoreLimit
    )
      this.finish();
  }

  // 時間到或達到目標分數就結束。
  update(dt) {
    super.update(dt);
    if (this.tick(dt)) this.finish();
  }

  // 結算勝負。
  finish() {
    const win = this.scores[0] > this.scores[1];
    const draw = this.scores[0] === this.scores[1];
    Game.end({
      win,
      title: draw ? "平手" : win ? "勝利" : "戰敗",
      sub: `我方 ${this.scores[0]} : ${this.scores[1]} 敵方`,
    });
  }

  // 往敵人可能在的地方推進：敵方基地、地圖中央，或隨機巡邏
  botGoal(bot) {
    const roll = Math.random();
    const enemyBase = Game.mapDef.bases[1 - bot.team];
    if (roll < 0.3)
      return (
        Nav.randomNear(enemyBase.x, enemyBase.z, 0, 14) || Nav.randomPoint()
      );
    if (roll < 0.55) return Nav.randomNear(0, 0, 0, 16) || Nav.randomPoint();
    return Nav.randomPoint(); // 其餘時間全地圖巡邏，戰線才不會永遠卡在中路
  }

  // 上方計分板的內容。
  status() {
    return {
      left: { name: "我方", score: this.scores[0], max: this.def.scoreLimit },
      right: { name: "敵方", score: this.scores[1], max: this.def.scoreLimit },
      timer: this.timeLeft,
      text: "率先取得 " + this.def.scoreLimit + " 次擊殺",
    };
  }
}

/* ============================================================
 *  據點爭奪
 * ------------------------------------------------------------
 *  每個據點記錄三件事：
 *    owner    目前擁有者（-1 中立、0 我方、1 敵方）
 *    capTeam  正在佔領它的隊伍
 *    cap      佔領進度 0 ～ 1，滿了就「直接」變成 capTeam 的（不會先變回中立）
 *  規則：
 *    - 圈內只有一隊、而且不是擁有者 → 進度往上加（人越多越快）
 *    - 如果圈內換成另一隊，要先把對方累積的進度「磨回 0」，再開始累積自己的
 *    - 兩隊都在圈內 → 爭奪中，進度凍結
 *    - 沒人或只有擁有者在 → 進度慢慢消退
 * ============================================================ */
class Domination extends ModeBase {
  // 建立據點與記號。
  init() {
    this.objective = true;
    this.scores = [0, 0];
    this.scoreT = 0;
    this.points = Game.mapDef.points.map((p) => {
      const pos = Nav.snap(p.x, p.z);
      return {
        name: p.name,
        x: p.x,
        z: p.z,
        y: pos.y,
        r: p.r,
        owner: -1,
        capTeam: -1,
        cap: 0,
        contested: false,
        ...this._makeMarker(p, pos.y),
      };
    });
    this.makeTeams(this.def.teamSize - 1, this.def.teamSize);
  }

  // 據點的外觀：地上的光圈 + 一道光柱
  _makeMarker(p, y) {
    const ringGeo = new THREE.RingGeometry(p.r - 0.25, p.r, 56);
    ringGeo.rotateX(-Math.PI / 2);
    // 據點光圈的材質。
    const mat = () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
    const ring = new THREE.Mesh(ringGeo, mat());
    ring.position.set(p.x, y + 0.08, p.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 30, 12, 1, true),
      mat(),
    );
    beam.material.opacity = 0.22;
    beam.position.set(p.x, y + 15, p.z);
    // 圈內整片地面的半透明底色（佔領後整個圈都會變成那一隊的顏色）
    const discGeo = new THREE.CircleGeometry(p.r - 0.25, 48);
    discGeo.rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, mat());
    disc.material.opacity = 0.16;
    disc.position.set(p.x, y + 0.06, p.z);
    Scene3D.scene.add(ring, beam, disc);
    Game.modeObjects.push(ring, beam, disc);
    return { ring, beam, disc };
  }

  onKill(victim) {
    victim.respawnT = this.def.respawn;
  }

  // 更新每個據點的佔領進度，並定時加分。
  update(dt) {
    super.update(dt);

    for (const p of this.points) {
      // 數一數圈內兩隊各有幾人
      // 計算據點內雙方的人數。
      const count = [0, 0];
      for (const a of Combat.actors) {
        if (
          a.alive &&
          a.team < 2 &&
          Math.abs(a.pos.y - p.y) < 3.5 &&
          Util.dist2D(a.pos.x, a.pos.z, p.x, p.z) < p.r
        )
          count[a.team]++;
      }
      p.contested = count[0] > 0 && count[1] > 0;
      const solo = p.contested ? -1 : count[0] ? 0 : count[1] ? 1 : -1; // 圈內唯一的隊伍

      // 只有一隊在場才會推進；人越多越快。
      if (solo >= 0 && solo !== p.owner) {
        const speed = 0.2 + 0.08 * Math.min(3, count[solo]); // 人越多佔越快（一人約 3.6 秒）
        if (p.capTeam !== solo && p.cap > 0) {
          p.cap = Math.max(0, p.cap - speed * 1.5 * dt); // 先把對方的進度磨掉
        } else {
          p.capTeam = solo;
          p.cap += speed * dt;
          if (p.cap >= 1) {
            // 佔領完成：直接變成這一隊的
            p.owner = solo;
            p.cap = 0;
            p.capTeam = -1;
            Sound.play(solo === 0 ? "capture" : "warning");
            HUD.announce(
              "據點 " + p.name,
              solo === 0 ? "我方已佔領" : "被敵方奪走",
              CONFIG.TEAM_COLORS[solo],
              true,
            );
            FX.ring(
              p.x,
              p.y + 0.1,
              p.z,
              p.r * 1.4,
              CONFIG.TEAM_COLORS[solo],
              0.8,
            );
          }
        }
      } else if (!p.contested && p.cap > 0) {
        p.cap = Math.max(0, p.cap - 0.12 * dt); // 沒人在搶：進度慢慢消退
        if (p.cap === 0) p.capTeam = -1;
      }

      // 顏色：我方青、敵方紅、中立白；正在被佔領時閃爍成佔領方的顏色
      const own = p.owner >= 0 ? CONFIG.TEAM_COLORS[p.owner] : 0xdddddd;
      let color = own;
      let pulse = 1.6;
      // 依狀態改變光圈的亮度。
      if (p.contested) {
        pulse = 1.2 + Math.sin(Game.time * 12) * 0.8;
      } else if (p.cap > 0 && p.capTeam >= 0 && Math.sin(Game.time * 10) > 0) {
        color = CONFIG.TEAM_COLORS[p.capTeam];
      }
      p.ring.material.color.setHex(color).multiplyScalar(pulse);
      p.beam.material.color.setHex(own).multiplyScalar(1.4);
      p.disc.material.color
        .setHex(own)
        .multiplyScalar(p.owner >= 0 ? 1.2 : 0.35);
    }

    // 每秒依佔領的據點數加分
    this.scoreT += dt;
    // 每秒依據點數量加分。
    if (this.scoreT >= 1) {
      this.scoreT -= 1;
      for (const p of this.points) if (p.owner >= 0) this.scores[p.owner]++;
      if (
        this.scores[0] >= this.def.scoreLimit ||
        this.scores[1] >= this.def.scoreLimit
      )
        this.finish();
    }
    if (this.tick(dt)) this.finish();
  }

  // 結算勝負。
  finish() {
    const win = this.scores[0] > this.scores[1];
    Game.end({
      win,
      title: this.scores[0] === this.scores[1] ? "平手" : win ? "勝利" : "戰敗",
      sub: `我方 ${this.scores[0]} : ${this.scores[1]} 敵方`,
    });
  }

  /* 電腦選據點：優先去「還不是我方的」「離我近的」「隊友還沒去的」；
   * 已經到了自己佔領的據點就在圈內巡守。 */
  botGoal(bot) {
    let best = null,
      bestScore = Infinity;
    for (const p of this.points) {
      let score = Util.dist2D(bot.pos.x, bot.pos.z, p.x, p.z) / 12;
      if (p.owner === bot.team && !p.contested) score += 3.5;
      for (const a of Game.bots) {
        if (
          a !== bot &&
          a.alive &&
          a.team === bot.team &&
          a.goal &&
          a.goal.point === p
        )
          score += 1.3;
      }
      score += Math.random() * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const spot =
      Nav.randomNear(best.x, best.z, 0, best.r - 1) || Nav.snap(best.x, best.z);
    return { x: spot.x, z: spot.z, point: best };
  }

  // 上方計分板與據點狀態。
  status() {
    return {
      left: { name: "我方", score: this.scores[0], max: this.def.scoreLimit },
      right: { name: "敵方", score: this.scores[1], max: this.def.scoreLimit },
      timer: this.timeLeft,
      text: "佔領並守住據點",
      points: this.points,
    };
  }
}

/* ============================================================
 *  個人亂鬥：每個人自成一隊
 * ============================================================ */
class FreeForAll extends ModeBase {
  // 建立所有對手；每個人各自為一隊。
  init() {
    this.ffa = true;
    // 亂鬥裡每個人都是敵人，常常同時被兩三個人打，所以傷害調低、回血加快
    Game.rules = { regen: 16, regenDelay: 5, enemyDamage: 0.85 };
    const pool = Util.shuffle(OPERATORS);
    for (let i = 1; i < this.def.players; i++) {
      this._addTeamBot(
        pool[i % pool.length],
        i,
        i,
        CONFIG.TEAM_COLORS[i % CONFIG.TEAM_COLORS.length],
      );
    }
  }

  // 達到目標擊殺數就結束。
  onKill(victim, killer) {
    victim.respawnT = this.def.respawn;
    if (
      killer &&
      killer !== victim &&
      killer.stats.kills >= this.def.scoreLimit
    )
      this.finish();
  }

  // 時間到就結束。
  update(dt) {
    super.update(dt);
    if (this.tick(dt)) this.finish();
  }

  // 依擊殺數排名
  ranking() {
    return Combat.actors
      .slice()
      .sort(
        (a, b) =>
          b.stats.kills - a.stats.kills || a.stats.deaths - b.stats.deaths,
      );
  }

  // 依名次結算。
  finish() {
    const rank = this.ranking();
    const place = rank.indexOf(Game.player) + 1;
    Game.end({
      win: place === 1,
      title: place === 1 ? "冠軍" : "第 " + place + " 名",
      sub: "第一名：" + rank[0].name + "（" + rank[0].stats.kills + " 殺）",
    });
  }

  // 亂鬥時往地圖中央一帶移動，比較容易遇到人
  botGoal() {
    return Math.random() < 0.6
      ? Nav.randomNear(0, 0, 4, 26) || Nav.randomPoint()
      : Nav.randomPoint();
  }

  /* 頂部的資訊：不顯示左右比分，改成一條「賽道」（race）：
   *   每個人是賽道上的一個點，位置 = 目前擊殺數 ÷ 獲勝擊殺數
   *   下面一行重點：你的名次、擊殺數，以及和第一名（或第二名）差幾殺 */
  status() {
    const rank = this.ranking();
    const me = Game.player;
    const place = rank.indexOf(me) + 1;
    const k = me.stats.kills;
    const first = rank[0],
      second = rank[1];
    let text;
    if (place === 1) {
      const lead = k - (second ? second.stats.kills : 0);
      text =
        lead > 0 ? `第 1 名・${k} 殺・領先 ${lead} 殺` : `並列第 1 名・${k} 殺`;
    } else {
      const behind = first.stats.kills - k;
      text =
        behind > 0
          ? `第 ${place} 名・${k} 殺・落後 ${first.name} ${behind} 殺`
          : `並列第 1 名・${k} 殺`;
    }
    return {
      timer: this.timeLeft,
      text,
      race: {
        limit: this.def.scoreLimit,
        list: rank.map((a, i) => ({
          id: a.id,
          name: a.name,
          kills: a.stats.kills,
          me: a === me,
          place: i + 1,
          color:
            a === me
              ? "#7dffb0"
              : Util.cssColor(
                  CONFIG.TEAM_COLORS[a.team % CONFIG.TEAM_COLORS.length],
                ),
        })),
      },
    };
  }
}

/* ============================================================
 *  生存波次
 * ------------------------------------------------------------
 *  一波一波的敵人，越後面種類越多、數量越多、血越厚。
 *  每清完一波可以從三個強化裡選一個；每 5 波會出現一個弱化版首領。
 * ============================================================ */
class Survival extends ModeBase {
  // 生存模式的起始設定。
  init() {
    this.solo = true;
    // 生存：敵人傷害從 46% 開始，每一波增加，第 10 波達到 100%（見 startWave）
    Game.rules = { regen: 12, regenDelay: 4.5, enemyDamage: 0.46 };
    this.wave = 0;
    this.queue = []; // 這一波還沒出場的敵人種類
    this.spawnT = 0;
    this.breakT = 3; // 距離下一波開始的秒數
    this.waiting = false; // 是否正在等玩家選強化
  }

  /* 難度曲線（第 n 波）：
   *   敵人數量    4 + 1.7n（第 1 波 6 人、第 5 波 13 人、第 10 波 21 人）
   *   同時在場    2 + n/2，最多 8 人（第 1、2 波最多 3 人一起打你）
   *   敵人生命    每波 +4.5%
   *   敵人傷害    46% → 第 10 波 100%
   *   出兵間隔    前幾波比較慢，讓你有時間各個擊破 */
  maxAlive() {
    return Math.min(8, 2 + Math.ceil(this.wave / 2));
  }

  // 第 n 波的敵人名單
  composition(n) {
    const list = [];
    // 首領波次的小兵數量減半，專心對付首領
    const count = Math.round((4 + n * 1.7) * (n % 5 === 0 ? 0.5 : 1));
    // 種類隨波次解鎖；後面的數字是出現的權重
    const table = [
      ["grunt", 1, 6],
      ["rusher", 2, 4],
      ["drone", 3, 3],
      ["breacher", 3, 3],
      ["sniper", 4, 2],
      ["heavy", 5, 1.5],
      ["elite", 6, 2],
    ];
    const open = table.filter((t) => n >= t[1]);
    const total = open.reduce((s, t) => s + t[2], 0);
    for (let i = 0; i < count; i++) {
      let roll = Math.random() * total;
      for (const t of open) {
        roll -= t[2];
        if (roll <= 0) {
          list.push(t[0]);
          break;
        }
      }
    }
    return list;
  }

  // 開始下一波：決定敵人組合並提高傷害。
  startWave() {
    this.wave++;
    this.queue = this.composition(this.wave);
    Game.rules.enemyDamage = Math.min(1, 0.4 + this.wave * 0.06);
    this.spawnT = 0.5;
    this.bossWave = this.wave % 5 === 0;
    HUD.announce(
      "第 " + this.wave + " 波",
      this.bossWave ? "首領來襲" : "敵軍 " + this.queue.length + " 名",
      this.bossWave ? 0xff4a5e : 0x35d6ff,
    );
    Sound.play(this.bossWave ? "bossRoar" : "announce");
    if (this.bossWave) {
      // 每 5 波的首領：三種輪流出現，生命是正式版的 45%
      const def = Object.values(BOSSES)[(this.wave / 5 - 1) % 3];
      const p = Nav.snap(
        Game.mapDef.bossSpawn.x,
        Game.mapDef.bossSpawn.z,
        true,
      );
      const boss = new Boss(
        { ...def, hp: def.hp * (0.38 + this.wave * 0.015) },
        1,
      );
      boss.spawnAt(p.x, p.y, p.z, 0);
      boss.damageMult = 0.7; // 生存模式的首領是「關卡王」，攻擊比正式首領戰溫和
      Game.addBot(boss, true);
      Game.boss = boss;
    }
  }

  // 目前場上還活著的敵人數
  aliveEnemies() {
    let n = 0;
    for (const b of Game.bots) if (b.alive) n++;
    return n;
  }

  // 依序生成敵人，清空後讓玩家選擇強化。
  update(dt) {
    if (this.waiting) return;
    const alive = this.aliveEnemies();

    // 兩波之間的休息時間
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave();
      return;
    }

    // 陸續出兵：同時在場的人數有上限，前幾波出兵也比較慢
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && alive < this.maxAlive()) {
      this.spawnT = Util.rand(1.0, 1.8) - Math.min(0.6, this.wave * 0.05);
      const p = this.pickSpawn();
      const hpScale = Game.difficulty.enemyHp * (1 + (this.wave - 1) * 0.045);
      const bot = Game.spawnEnemy(this.queue.pop(), p.x, p.y, p.z, hpScale);
      // 生存模式所有敵人都只打你一個人，所以槍法與反應從比較弱開始，逐波變強：
      //   槍法：第 1 波 72% → 第 10 波以後 100%
      //   反應：第 1 波慢 50% → 第 6 波以後正常
      bot.aimSkill *= Math.min(1, 0.69 + this.wave * 0.031);
      bot.reaction *= 1 + Math.max(0, 6 - this.wave) * 0.1;
      FX.flash(p.x, p.y + 1.2, p.z, 0xff4a5e, 2.5, 0.35, 0.3);
    }

    // 全部清光 → 選強化
    // 這一波清空：選擇強化後進入休息時間。
    if (!this.queue.length && alive === 0) {
      Game.boss = null;
      this.waiting = true;
      Game.player.stats.score += this.wave * 100;
      const perks = Util.shuffle(PERKS).slice(0, 3);
      Game.state = "perk";
      Input.unlock();
      Menu.showPerks(this.wave, perks, (perk) => {
        perk.apply(Game.player);
        // 每撐過一波的獎勵：補滿生命與護甲、醫療包 +1、補充彈藥與手榴彈
        const p = Game.player;
        p.hp = p.maxHp;
        p.armor = Math.max(p.armor, p.maxArmor);
        p.medkits = Math.min(p.maxMedkits, p.medkits + 1);
        for (const ws of p.weapons)
          ws.reserve = Math.min(
            ws.def.reserve,
            ws.reserve + Math.ceil(ws.def.reserve * 0.4),
          );
        p.grenades = Math.min(p.maxGrenades, p.grenades + 1);
        this.waiting = false;
        this.breakT = 3.5;
        Game.state = "playing";
        Input.clear();
        Input.lock();
      });
    }
  }

  // 出兵位置：離玩家 18 公尺以上，而且玩家看不到的地方
  pickSpawn() {
    const pl = Game.player;
    let fallback = null;
    for (let i = 0; i < 24; i++) {
      const p = Nav.randomPoint();
      const d = Util.dist2D(p.x, p.z, pl.pos.x, pl.pos.z);
      if (d < 18) continue;
      fallback = p;
      if (!World.los(p.x, p.y + 1.5, p.z, pl.pos.x, pl.eyeY(), pl.pos.z))
        return p;
    }
    return fallback || Nav.randomPoint();
  }

  // 玩家陣亡就結束。
  onKill(victim) {
    if (victim.isPlayer) {
      Game.end({
        win: false,
        title: "陣亡",
        sub: "撐到第 " + this.wave + " 波",
      });
    }
  }

  /* 敵人知道玩家「大概」在哪一區，但不知道精確位置：
   * 會在玩家周圍 8～22 公尺的範圍裡搜索前進，看到人才交戰。
   * 波次越後面，搜索範圍越小（越快找到你）。 */
  botGoal() {
    const p = Game.player.pos;
    const spread = Math.max(6, 22 - this.wave);
    return Nav.randomNear(p.x, p.z, 4, spread) || { x: p.x, z: p.z };
  }

  // 上方顯示波次與剩餘敵人。
  status() {
    return {
      left: { name: "波次", score: this.wave, max: 0 },
      right: {
        name: "剩餘敵人",
        score: this.aliveEnemies() + this.queue.length,
        max: 0,
      },
      timer: null,
      text:
        this.breakT > 0 && !this.waiting
          ? "下一波 " + Math.ceil(this.breakT) + " 秒後開始"
          : "消滅所有敵人",
    };
  }

  summaryExtra() {
    return "撐過 " + Math.max(0, this.wave - 1) + " 波";
  }
}

/* ============================================================
 *  首領討伐
 * ============================================================ */
class BossRaid extends ModeBase {
  // 建立首領戰；玩家有固定的復活次數。
  init() {
    this.solo = true;
    // 首領戰：首領招式的傷害照難度；回血稍快，鼓勵「躲招 → 喘口氣 → 反擊」的節奏
    // minionDamage：小兵的傷害只有平常的 18%（只是干擾、拖慢你），主要的威脅留給首領本身
    Game.rules = {
      regen: 10,
      regenDelay: 5,
      enemyDamage: 0.9,
      minionDamage: 0.18,
    };
    this.lives = Game.difficulty.lives;
    const def = BOSSES[this.cfg.boss] || BOSSES.titan;
    const p = Nav.snap(Game.mapDef.bossSpawn.x, Game.mapDef.bossSpawn.z, true);
    const boss = new Boss(def, 1);
    boss.spawnAt(p.x, p.y, p.z, 0);
    Game.addBot(boss, true);
    Game.boss = boss;
    this.introT = 0.4;
  }

  // 登場倒數結束後，首領開始行動。
  update(dt) {
    super.update(dt);
    if (this.introT > 0) {
      this.introT -= dt;
      if (this.introT <= 0) {
        Sound.play("bossRoar");
        HUD.announce(
          Game.boss.def.name,
          Game.boss.def.cn + " — " + Game.boss.def.title,
          Game.boss.def.color,
        );
      }
    }
  }

  // 擊倒首領獲勝；復活次數用完則失敗。
  onKill(victim) {
    if (victim.isBoss) {
      Game.player.invuln = 99;
      Combat.after(2.6, () =>
        Game.end({
          win: true,
          title: "討伐成功",
          sub: victim.def.name + " 已被擊破",
        }),
      );
    } else if (victim.isPlayer) {
      if (this.lives > 0) {
        this.lives--;
        victim.respawnT = 3;
        HUD.toast("剩餘復活次數：" + this.lives);
      } else {
        const boss = Game.boss;
        Game.end({
          win: false,
          title: "討伐失敗",
          sub:
            boss.def.name +
            " 剩餘 " +
            Math.ceil((boss.hp / boss.maxHp) * 100) +
            "% 生命",
        });
      }
    }
  }

  // 小兵往玩家附近移動。
  botGoal() {
    const p = Game.player.pos;
    return Nav.randomNear(p.x, p.z, 3, 12) || { x: p.x, z: p.z };
  }

  // 上方顯示復活次數與小兵數量。
  status() {
    return {
      left: { name: "復活次數", score: this.lives, max: 0 },
      right: {
        name: "小兵",
        score: Game.bots.filter((b) => b.alive && !b.isBoss).length,
        max: 0,
      },
      timer: null,
      text: "擊破 " + Game.boss.def.name,
    };
  }
}
