/* 檔案導讀：格鬥規則與每幀模擬；角色資料在 roster.js，電腦的思考在 ai.js，
   畫面由 renderer.js 繪製。 */
(() => {
  const game = globalThis.Midnight;
  const {
    FIELD,
    NORMALS,
    ROUND_SECONDS,
    ROUNDS_TO_WIN,
    START_METER,
    COUNTER_STRIKE,
    DIFFICULTY,
    BURST,
    BURST_COST,
  } = game;
  const GRAVITY = 1740;
  const JUMP_GRAVITY = 2120; // 自己跳的時候落得比較快，不會飄在空中
  const JUMP_SPEED = 850;
  const PUSH_DISTANCE = 110;
  const BUFFER_TIME = 0.26; // 提早按的指令保留多久
  const DODGE_TIME = 0.33;
  const DODGE_CANCEL = 0.23; // 閃避到這一刻之後，就能直接出招
  const PERFECT_GUARD = 0.14;
  const DASH_WINDOW = 0.27;
  const THROW_CHORD = 0.05; // 輕攻與重攻相差這麼短才算「同時按」
  const JUGGLE_LIMIT = 4; // 同一次浮空最多再被打幾下
  const DAMAGE_SCALE = 0.7; // 距離變長、更容易打中，單下傷害跟著調低
  const LUNGE_SPEED = 1500; // 起手跟步最快的速度
  const RUSH_SPEED = 1450; // 追擊衝步的速度
  const RUSH_TIME = 0.2; // 追擊衝步最久多久
  const AIR_ACTIVE = 0.2; // 空中的普攻，拳腳伸出去之後維持多久
  // 兩人重疊時推開的速度：重疊越多推得越快，快分開時放慢，才不會像彈開
  const PUSH = { rate: 14, min: 260, max: 1100 };
  const PULL_SPEED = 1200; // 被抓住時拉到面前的速度
  const WALL_PUSH = 0.5; // 對手貼著牆時，攻擊的人自己被震退的比例
  const SAFE_TIME = 0.4; // 被打落地後的短暫無敵
  const TECH_WINDOW = 0.25;
  const DASH = {
    forward: { time: 0.3, from: 760, to: 300 },
    back: { time: 0.26, from: 640, to: 160 },
  };
  const EMPTY_CONTROLS = {
    direction: 0,
    crouch: false,
    guard: false,
    actions: [],
  };
  // 攻擊的優先順序，大的可以取消小的。
  const RANK = {
    light: 0,
    heavy: 1,
    sweep: 1,
    special: 2,
    skill2: 2,
    super: 3,
  };
  const COOLDOWN_KEY = { special: "specialCooldown", skill2: "skill2Cooldown" };
  // 打中時畫面停頓的秒數。
  const HIT_STOP = {
    light: 0.055,
    heavy: 0.085,
    sweep: 0.07,
    throw: 0.12,
    special: 0.095,
    skill2: 0.095,
    super: 0.07,
  };

  // 小工具：限制範圍、倒數與場地邊界。
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  // decay：計時器往下數，不會變成負數。stageX：把位置限制在場地左右邊界之間。
  const decay = (value, dt) => Math.max(0, value - dt);
  const stageX = (x) => clamp(x, FIELD.left, FIELD.right);
  // 目前是否在招式的某個時間區段內。
  const within = (move, key) => {
    const window = move?.spec[key];
    return Boolean(
      window && move.elapsed >= window[0] && move.elapsed < window[1],
    );
  };
  // 有沒有預先輸入這個動作。
  const has = (fighter, action) =>
    fighter.buffer.some((entry) => entry.action === action);
  // 用掉預先輸入的動作。
  const take = (fighter, ...actions) => {
    fighter.buffer = fighter.buffer.filter(
      (entry) => !actions.includes(entry.action),
    );
  };

  // 一位鬥士的初始狀態。
  function createFighter(profile, index) {
    return {
      profile,
      index,
      x: index === 0 ? 390 : 890,
      previousX: index === 0 ? 390 : 890,
      y: 0,
      previousY: 0,
      vx: 0,
      vy: 0,
      face: index === 0 ? 1 : -1,
      hp: 100,
      meter: START_METER,
      specialCooldown: 0,
      skill2Cooldown: 0,
      dodgeCooldown: 0,
      move: null,
      dodge: null,
      dash: null,
      stun: 0,
      knock: 0,
      guard: false,
      guardDirection: 0,
      crouch: false,
      guardHeld: false,
      guardStart: -10,
      clock: 0, // 自己的時鐘，用來比較兩個按鍵相差多久
      blockStun: 0, // 剛擋下攻擊的短暫硬直
      juggle: 0, // 這次浮空已經被追打幾下
      spiked: false, // 追打到上限，正被打落地面
      safe: 0, // 落地起身的無敵時間
      lastHurt: -10,
      prevDirection: 0,
      heldDirection: 0,
      lastTap: { dir: 0, time: -10 },
      jumping: false,
      jumpCut: false,
      heldBy: null,
      techTimer: 0,
      flash: 0,
      flashColor: "#ffffff",
      walkDistance: 0,
      walking: false,
      buffer: [],
      combo: 0,
      comboDamage: 0,
      lastHit: -10,
    };
  }

  // 身體的上下範圍，蹲下時比較矮。
  function body(fighter) {
    const height = fighter.profile.size * (fighter.crouch ? 0.57 : 0.92);
    return [fighter.y + 4, fighter.y + height];
  }

  // 身體的半寬：打擊只要碰到身體邊緣就算命中
  function halfWidth(fighter) {
    return fighter.profile.size * 0.16 + (fighter.crouch ? 8 : 0);
  }

  // 一招從站定的位置最遠打得到多遠（含前衝與跟步）；飛行道具與陷阱當成全場
  function reachOf(spec, rushing = false) {
    let best = 0;
    for (const event of spec.events) {
      if (event.projectile || event.trap) return 900;
      best = Math.max(best, event.range ?? 0, event.grab ?? 0);
      if (event.blink && event.blink < 9000) best = Math.max(best, event.blink);
    }
    const travel = spec.travel
      ? spec.travel.speed * (spec.travel.until - (spec.travel.from ?? 0))
      : 0;
    const rush = rushing ? (spec.rush ?? 0) : 0;
    return best + travel * 0.7 + (spec.step ?? 0) + rush + 38;
  }

  // 拳腳剛好碰到對手身體時，兩人中心的距離（每個人手腳長短不同）
  function contactOf(fighter, spec) {
    return fighter.profile.contact?.[spec.clip] ?? spec.contact ?? 0;
  }

  // 離「剛好碰得到」還差多遠；負的代表已經夠近
  function contactGap(fighter, target, spec) {
    const ahead = (target.x - fighter.x) * fighter.face;
    return ahead - contactOf(fighter, spec);
  }

  // 最後一次會造成傷害的時間點（過了這一刻，這一招就只剩收招）
  function lastHitTime(spec) {
    let at = 0;
    for (const event of spec.events)
      if (event.damage || event.toss || event.grab) at = Math.max(at, event.at);
    return at;
  }

  // 現在打不到：無敵、閃避或招式的無敵時間。
  function invulnerable(fighter) {
    if (fighter.safe > 0) return true;
    if (fighter.dodge && fighter.dodge.elapsed < 0.205) return true;
    return within(fighter.move, "invulnerable");
  }

  // 記錄這一步的輸入。
  function recordInputs(fighter, controls) {
    for (const action of controls.actions) {
      fighter.buffer = fighter.buffer.filter(
        (entry) => entry.action !== action,
      );
      fighter.buffer.push({ action, life: BUFFER_TIME, at: fighter.clock });
    }
  }

  // 這一招最早會造成傷害的時間（判斷反擊命中、電腦的反應都會用到）
  function firstActive(spec) {
    return (
      spec.events.find((event) => event.damage || event.trap || event.toss)
        ?.at ?? spec.duration
    );
  }

  // 一場比賽的規則：移動、攻擊判定、傷害、回合與勝負。
  class Match {
    // 建立比賽；demo 是兩邊都由電腦操作。
    constructor(
      profiles,
      {
        cpu = true,
        training = false,
        demo = false,
        difficulty = "normal",
        random = Math.random,
      } = {},
    ) {
      this.profiles = profiles;
      this.cpu = cpu;
      this.training = training;
      this.demo = demo; // 觀戰：兩邊都交給電腦
      // 整場比賽的戰績（結算畫面使用）
      this.stats = profiles.map(() => ({
        damage: 0,
        hits: 0,
        maxCombo: 0,
        perfect: 0,
        throws: 0,
      }));
      this.difficulty = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
      this.random = random;
      this.score = [0, 0];
      this.round = 1;
      this.elapsed = 0;
      this.events = [];
      this.slowMo = 0;
      this.resetRound();
    }

    // 開始新的回合。
    resetRound() {
      this.fighters = this.profiles.map(createFighter);
      this.projectiles = [];
      this.traps = [];
      this.remaining = ROUND_SECONDS;
      this.phase = "intro";
      this.phaseTime = 0;
      this.hitStop = 0;
      this.result = null;
      // 每回合換一顆新的大腦，但保留它對對手習慣的印象
      const previous = this.brains ?? [];
      this.brains = this.fighters.map(
        (_, index) => new game.Brain(this, index, previous[index]?.habits),
      );
      if (this.training)
        for (const fighter of this.fighters) fighter.meter = 100;
      this.events.push({ type: "round", round: this.round });
    }

    drainEvents() {
      return this.events.splice(0);
    }

    // K.O. 之後的慢動作：回傳現在的速度倍率
    timeScale(realDt) {
      if (this.slowMo <= 0) return 1;
      this.slowMo = decay(this.slowMo, realDt);
      return 0.3;
    }

    // 推進一步。
    step(dt, playerInputs = []) {
      if (this.phase === "over") return;
      for (const fighter of this.fighters) {
        fighter.previousX = fighter.x;
        fighter.previousY = fighter.y;
      }
      for (const shot of this.projectiles) shot.previousX = shot.x;
      this.phaseTime += dt;
      // 登場。
      if (this.phase === "intro") {
        if (this.phaseTime >= 1.55) {
          this.phase = "fight";
          this.phaseTime = 0;
          this.events.push({ type: "fight" });
        }
        return;
      }

      const inputs = [
        playerInputs[0] ?? EMPTY_CONTROLS,
        playerInputs[1] ?? EMPTY_CONTROLS,
      ];
      // 回合結束後仍讓角色落地。
      if (this.phase === "round-end") {
        // 輸的人繼續倒下、滑行，雙方都不能行動
        for (const fighter of this.fighters) this.settle(fighter, dt);
        if (this.phaseTime >= 2.2) this.advanceRound();
        return;
      }
      // 打中停頓：只處理輸入。
      if (this.hitStop > 0) {
        this.hitStop = decay(this.hitStop, dt);
        this.fighters.forEach((fighter, index) =>
          recordInputs(fighter, inputs[index]),
        );
        return;
      }

      this.elapsed += dt;
      if (!this.training) this.remaining = decay(this.remaining, dt);
      if (this.cpu)
        inputs[1] = this.training
          ? EMPTY_CONTROLS
          : this.brains[1].controls(dt);
      if (this.demo) inputs[0] = this.brains[0].controls(dt);
      this.fighters.forEach((fighter, index) =>
        this.advanceFighter(
          fighter,
          this.fighters[1 - index],
          inputs[index],
          dt,
        ),
      );
      this.separateFighters(dt);

      // 先收集所有碰到的攻擊再扣血，同時打中才會互相命中
      const contacts = [];
      this.fighters.forEach((fighter, index) =>
        this.advanceAttack(fighter, this.fighters[1 - index], contacts, dt),
      );
      this.advanceProjectiles(contacts, dt);
      this.advanceTraps(contacts, dt);
      for (const contact of contacts) this.applyContact(contact);

      if (this.training) {
        this.refillTraining(dt);
        return;
      }
      const knockout = this.fighters.some((fighter) => fighter.hp <= 0);
      if (knockout || this.remaining <= 0)
        this.finishRound(knockout ? "ko" : "time");
    }

    // 練習模式自動恢復血量與能量。
    refillTraining(dt) {
      for (const fighter of this.fighters) {
        if (fighter.stun === 0 && this.elapsed - fighter.lastHurt > 1.1)
          fighter.hp = Math.min(100, fighter.hp + 70 * dt);
        if (!fighter.move || fighter.move.action !== "super")
          fighter.meter = Math.min(100, fighter.meter + 30 * dt);
      }
    }

    // 回合結束後的慣性。
    settle(fighter, dt) {
      fighter.heldBy = null;
      fighter.flash = decay(fighter.flash, dt); // 否則倒地的人會一直是整片白色
      fighter.x = stageX(fighter.x + fighter.knock * dt);
      fighter.knock *= Math.max(0, 1 - 5 * dt);
      if (fighter.y > 0 || fighter.vy > 0) {
        fighter.y = Math.max(0, fighter.y + fighter.vy * dt);
        fighter.vy = fighter.y > 0 ? fighter.vy - GRAVITY * dt : 0;
        if (fighter.y === 0)
          this.events.push({ type: "land", fighter, heavy: fighter.hp === 0 });
      }
    }

    // 被抓住：很快拉到對方面前，直到被摔出去或拆投
    advanceHeld(fighter, dt) {
      const by = fighter.heldBy;
      if (!by.move || by.move.grabbed !== fighter) {
        fighter.heldBy = null;
        return false;
      }
      fighter.techTimer = decay(fighter.techTimer, dt);
      const wantsTech =
        has(fighter, "throw") ||
        (has(fighter, "light") && has(fighter, "heavy"));
      if (wantsTech && fighter.techTimer > 0) {
        take(fighter, "throw", "light", "heavy");
        fighter.heldBy = null;
        fighter.stun = 0;
        by.move = null;
        const direction = Math.sign(fighter.x - by.x) || -by.face;
        fighter.knock = direction * 330;
        by.knock = -direction * 330;
        this.hitStop = Math.max(this.hitStop, 0.08);
        this.events.push({ type: "tech", fighter, attacker: by });
        return false;
      }
      const pull = stageX(by.x + by.face * 92) - fighter.x;
      fighter.x += clamp(pull, -PULL_SPEED * dt, PULL_SPEED * dt);
      fighter.vx = 0;
      fighter.knock = 0;
      fighter.crouch = false;
      fighter.guard = false;
      fighter.walking = false;
      return true;
    }

    // 對手正在出招、或飛行道具快到了，而且打得到我
    threatened(fighter, opponent) {
      const { move } = opponent;
      const distance = Math.abs(opponent.x - fighter.x);
      if (
        move &&
        move.action !== "throw" &&
        move.elapsed <= lastHitTime(move.spec) + 0.05 &&
        distance < reachOf(move.spec, Boolean(move.rush)) + 60
      )
        return true;
      return this.projectiles.some(
        (shot) =>
          shot.owner === opponent &&
          !shot.checked &&
          (fighter.x - shot.x) * shot.direction >= -20 &&
          Math.abs(fighter.x - shot.x) < shot.speed * 0.4 + 80,
      );
    }

    // 被連段時按閃避：付出能量，強制震開對手
    tryBurst(fighter) {
      if (
        fighter.stun === 0 ||
        fighter.blockStun > 0 ||
        fighter.meter < BURST_COST ||
        fighter.hp <= 0 ||
        !has(fighter, "dodge")
      )
        return;
      take(fighter, "dodge");
      fighter.meter -= BURST_COST;
      fighter.stun = 0;
      fighter.knock = 0;
      fighter.dash = null;
      // 爆氣中的動作。
      fighter.move = {
        spec: BURST,
        action: "burst",
        elapsed: 0,
        next: 0,
        armorHits: 0,
      };
      this.events.push({ type: "burst-start", fighter });
    }

    // 輕攻與重攻同時按 = 投技。兩個鍵要幾乎同時按下才算，
    // 連按「輕攻、重攻」接連段時才不會誤出投技。
    mergeThrow(fighter, grounded) {
      if (!grounded) return;
      const find = (action) =>
        fighter.buffer.find((entry) => entry.action === action);
      const heavy = find("heavy");
      if (!heavy) return;
      const light = find("light");
      const together = light && Math.abs(light.at - heavy.at) <= THROW_CHORD;
      const fresh =
        fighter.move?.action === "light" &&
        !fighter.move.touched &&
        fighter.move.elapsed < THROW_CHORD &&
        heavy.at - fighter.move.pressedAt <= THROW_CHORD;
      if (!fresh && !(together && !fighter.move)) return;
      take(fighter, "light", "heavy");
      fighter.buffer.unshift({
        action: "throw",
        life: BUFFER_TIME,
        at: fighter.clock,
      });
      if (fresh) fighter.move = null;
    }

    /* 打中或被擋下之後，可以取消收招直接接下一招：
         輕攻 → 輕攻第二、三段（第三段打中後再按輕攻，會自動接技能一）
         弱的招式 → 強的招式（輕攻 < 重攻 < 技能 < 大招）
       被擋下時最多只能接到重攻，技能與大招要打中才能接。 */
    tryCancel(fighter, grounded) {
      const { move } = fighter;
      // 追擊衝步還沒出手：可以改成閃避或跳躍
      if (move?.rush && (has(fighter, "dodge") || has(fighter, "jump"))) {
        fighter.move = null;
        return;
      }
      if (!move?.touched || !(move.action in RANK)) return;
      const since = move.elapsed - firstActive(move.spec);
      if (since < 0.035) return;
      for (const entry of fighter.buffer) {
        const next = entry.action;
        if (next === "light" && move.action === "light") {
          if (since < 0.05 || !grounded) continue;
          const chain = move.spec.chain;
          if (!chain && !(move.connected && this.ready(fighter, "special")))
            continue;
          if (!chain && move.spec !== NORMALS.light3) continue;
          take(fighter, "light");
          fighter.move = null;
          fighter.crouch = false;
          if (chain) this.begin(fighter, "light", NORMALS[chain]);
          else this.startAction(fighter, "special", EMPTY_CONTROLS);
          return;
        }
        if (!(next in RANK) || !this.ready(fighter, next)) continue;
        const current = RANK[move.action];
        const stronger =
          RANK[next] > current ||
          (RANK[next] === 2 && current === 2 && next !== move.action);
        if (!stronger || (!move.connected && RANK[next] > 1)) continue;
        fighter.move = null;
        // 把這個指令排到最前面，等一下就會先執行它
        fighter.buffer = [
          entry,
          ...fighter.buffer.filter((other) => other !== entry),
        ];
        return;
      }
    }

    // 執行緩衝裡的指令；現在還不能做的（例如在空中按技能）先留著
    runBuffer(fighter, controls) {
      const waiting = [];
      while (fighter.buffer.length && !fighter.move && !fighter.dodge) {
        const entry = fighter.buffer.shift();
        const done = this.startAction(
          fighter,
          entry.action,
          controls,
          entry.life,
        );
        if (done) {
          if (fighter.move) fighter.move.pressedAt ??= entry.at;
          continue;
        }
        waiting.push(entry);
      }
      fighter.buffer = [...waiting, ...fighter.buffer];
    }

    // 一位鬥士的一步：計時、閃避、移動、跳躍與重力。
    advanceFighter(fighter, opponent, controls, dt) {
      fighter.specialCooldown = decay(fighter.specialCooldown, dt);
      fighter.skill2Cooldown = decay(fighter.skill2Cooldown, dt);
      fighter.dodgeCooldown = decay(fighter.dodgeCooldown, dt);
      fighter.stun = decay(fighter.stun, dt);
      fighter.blockStun = decay(fighter.blockStun, dt);
      fighter.safe = decay(fighter.safe, dt);
      fighter.clock += dt;
      fighter.flash = decay(fighter.flash, dt);
      fighter.meter = Math.min(100, fighter.meter + 3.6 * dt);
      for (const entry of fighter.buffer) entry.life -= dt;
      fighter.buffer = fighter.buffer.filter((entry) => entry.life > 0);
      recordInputs(fighter, controls);
      fighter.heldDirection = controls.direction;
      const grounded = fighter.y === 0 && fighter.vy === 0;
      if (grounded && fighter.stun === 0) fighter.juggle = 0;

      // 按住「後退」也能防禦（玩家的輸入才有，電腦一律自己決定何時防禦）
      const back =
        controls.direction !== 0 && controls.direction === -fighter.face;
      // 電腦與觸控的自動防禦。
      const holdingBack = Boolean(controls.autoGuard && back && grounded);
      const bracing = Boolean(controls.guard || holdingBack);
      // 電腦的一般防禦（steady）不算精準防禦，要刻意抓時機才算
      if (bracing && !fighter.guardHeld)
        fighter.guardStart = controls.steady ? -10 : this.elapsed;
      fighter.guardHeld = bracing;

      if (fighter.heldBy && this.advanceHeld(fighter, dt)) return;
      this.tryBurst(fighter);
      this.mergeThrow(fighter, grounded);
      this.tryCancel(fighter, grounded);

      fighter.walking = false;
      fighter.guard = false;
      if (!controls.guard) fighter.guardDirection = 0;
      // 剛擋下一擊：還按著防禦的話，後續的攻擊也會繼續擋
      if (fighter.blockStun > 0 && grounded && bracing) {
        fighter.guard = true;
        fighter.crouch = controls.crouch;
      }

      // 閃避。
      if (fighter.dodge) {
        fighter.dodge.elapsed += dt;
        const { elapsed } = fighter.dodge;
        const wantsAct = fighter.buffer.some(
          (entry) => entry.action !== "dodge",
        );
        if (elapsed >= DODGE_TIME || (elapsed >= DODGE_CANCEL && wantsAct))
          fighter.dodge = null;
      }
      // 衝刺。
      if (fighter.dash) {
        fighter.dash.elapsed += dt;
        const { elapsed, time } = fighter.dash;
        // 衝刺中按防禦可以提早煞車
        const brake = controls.guard && elapsed > 0.12;
        if (elapsed >= time || brake || !grounded) fighter.dash = null;
      }

      let speed = 0;
      // 可以行動時才接受新動作。
      if (!fighter.move && !fighter.dodge && fighter.stun === 0) {
        if (grounded && !fighter.dash)
          fighter.face =
            fighter.guardDirection ||
            Math.sign(opponent.x - fighter.x) ||
            fighter.face;
        fighter.crouch = grounded && controls.crouch && !fighter.dash;
        const threatened = holdingBack && this.threatened(fighter, opponent);
        fighter.guard =
          grounded && !fighter.dash && (controls.guard || threatened);
        if (controls.guard && fighter.guard)
          fighter.guardDirection = fighter.face;
        this.detectDash(fighter, controls, grounded);
        this.runBuffer(fighter, controls);
        const canWalk =
          !fighter.move &&
          !fighter.dodge &&
          !fighter.crouch &&
          !fighter.guard &&
          !fighter.dash;
        const pace = grounded ? (back ? 1.02 : 1.2) : 1.14;
        speed = canWalk ? controls.direction * fighter.profile.speed * pace : 0;
        fighter.walking = grounded && speed !== 0;
      } else {
        fighter.dash = null;
      }
      fighter.prevDirection = controls.direction;

      const airborne = fighter.y > 0 || fighter.vy > 0;
      const airAttack = Boolean(fighter.move?.air && airborne);
      if (fighter.dodge) {
        speed =
          fighter.dodge.direction * (fighter.dodge.elapsed < 0.19 ? 640 : 200);
        fighter.crouch = false;
      } else if (fighter.dash && !fighter.move) {
        const { from, to, time } = fighter.dash;
        const t = fighter.dash.elapsed / time;
        speed = fighter.dash.dir * (from + (to - from) * t * t);
      } else if (airAttack) {
        // 空中出招時保留跳躍的衝力，也還能微調方向
        speed = controls.direction * fighter.profile.speed * 1.14;
      } else if (fighter.move) {
        speed = this.moveSpeed(fighter, opponent, dt);
      }

      // 小跳：提早放開跳躍鍵就跳得比較低
      if (
        fighter.jumping &&
        !fighter.jumpCut &&
        fighter.vy > 200 &&
        controls.jumpHeld === false
      ) {
        fighter.vy *= 0.5;
        fighter.jumpCut = true;
      }

      const forceMovement =
        fighter.dodge ||
        (fighter.move && !airAttack) ||
        fighter.stun > 0 ||
        fighter.dash;
      if (forceMovement) fighter.vx = speed;
      else if (airborne) {
        // 空中：沒按方向就順著原本的衝力飛，按了才慢慢轉向
        if (speed !== 0)
          fighter.vx += (speed - fighter.vx) * (1 - Math.exp(-10 * dt));
      } else fighter.vx += (speed - fighter.vx) * (1 - Math.exp(-34 * dt));
      if (Math.abs(fighter.vx) < 0.5) fighter.vx = 0;
      fighter.x = stageX(fighter.x + (fighter.vx + fighter.knock) * dt);
      if (fighter.walking || fighter.dash) {
        fighter.walkDistance += Math.abs(fighter.vx) * dt;
        if (fighter.walkDistance >= 102) {
          fighter.walkDistance %= 102;
          this.events.push({ type: "footstep", fighter });
        }
      }
      fighter.knock *= Math.max(0, 1 - 7 * dt);
      // 重力與落地。
      if (airborne) {
        const gravity =
          fighter.jumping && fighter.stun === 0 ? JUMP_GRAVITY : GRAVITY;
        fighter.y = Math.max(0, fighter.y + fighter.vy * dt);
        fighter.vy = fighter.y > 0 ? fighter.vy - gravity * dt : 0;
        if (fighter.y === 0) {
          fighter.jumping = false;
          // 空中攻擊落地就結束，馬上能接地面的動作
          if (fighter.move?.air) fighter.move = null;
          const hard = fighter.spiked;
          if (hard) {
            fighter.spiked = false;
            fighter.stun = Math.max(fighter.stun, 0.24);
            fighter.safe = SAFE_TIME;
          }
          this.events.push({ type: "land", fighter, heavy: hard });
        }
      }
    }

    /* 出招時的移動：追擊衝步 → 起手的跟步 → 招式本身的突進。
       這幾種都盯著對手，停在拳腳剛好碰得到的距離，不會衝過頭。 */
    moveSpeed(fighter, target, dt) {
      const { move } = fighter;
      const { spec, elapsed } = move;
      const gap = contactGap(fighter, target, spec);
      if (move.rush) return fighter.face * clamp(gap / dt, 0, RUSH_SPEED);
      let speed = 0;
      if (move.lunge > 0 && elapsed < move.lungeUntil) {
        const left = Math.max(dt, (move.lungeUntil - elapsed) * 0.8);
        const want = move.homing ? gap : move.lunge;
        speed = clamp(want / left, 0, Math.min(LUNGE_SPEED, move.lunge / dt));
        move.lunge -= speed * dt;
      }
      const { travel } = spec;
      if (travel && elapsed >= (travel.from ?? 0) && elapsed < travel.until) {
        // 在下一擊打出去之前追到對手面前
        const next = spec.events.find((e) => e.damage && e.at > elapsed);
        const until = Math.min(travel.until, next?.at ?? travel.until);
        const left = Math.max(dt, (until - elapsed) * 0.85);
        speed = travel.track
          ? Math.max(speed, clamp(gap / left, travel.min ?? 60, travel.speed))
          : speed + travel.speed;
      }
      if (move.drift && fighter.y > 0) speed = move.drift;
      // 衝刺的衝勁會帶進招式裡，但不會一直往對手身上擠
      if (move.carry && gap > 0)
        speed += move.carry * Math.max(0, 1 - elapsed / 0.22);
      return fighter.face * speed;
    }

    // 連按兩下方向：前衝或後撤
    detectDash(fighter, controls, grounded) {
      if (!grounded || fighter.crouch || fighter.guard || fighter.dash) return;
      let dir = controls.dash || 0;
      const pressed =
        controls.direction !== 0 &&
        controls.direction !== fighter.prevDirection;
      if (!dir && pressed) {
        const { lastTap } = fighter;
        if (
          lastTap.dir === controls.direction &&
          this.elapsed - lastTap.time < DASH_WINDOW
        )
          dir = controls.direction;
        fighter.lastTap = dir
          ? { dir: 0, time: -10 }
          : { dir: controls.direction, time: this.elapsed };
      }
      if (!dir) return;
      const forward = dir === fighter.face;
      fighter.dash = {
        dir,
        forward,
        elapsed: 0,
        ...(forward ? DASH.forward : DASH.back),
      };
      this.events.push({ type: "dash", fighter, forward });
    }

    // 招式能不能用（冷卻與能量）。
    ready(fighter, action) {
      if (action === "super") return fighter.meter >= 100;
      const key = COOLDOWN_KEY[action];
      return !key || fighter[key] === 0;
    }

    // 執行一個指令。回傳 false 代表「現在還不能做，先留在緩衝裡」
    startAction(fighter, action, controls, life = 0) {
      const grounded = fighter.y === 0 && fighter.vy === 0;
      if (action === "jump") {
        if (!grounded) return false;
        fighter.vy = JUMP_SPEED;
        fighter.jumping = true;
        fighter.jumpCut = false;
        fighter.crouch = false;
        fighter.guard = false;
        // 起跳就帶著按住的方向；衝刺跳會保留衝勁
        const speed = fighter.profile.speed * 1.14;
        if (fighter.dash) fighter.vx = fighter.dash.dir * 400;
        else if (controls.direction) fighter.vx = controls.direction * speed;
        fighter.dash = null;
        this.events.push({ type: "jump", fighter });
        return true;
      }
      if (action === "dodge") {
        if (!grounded || fighter.dodgeCooldown > 0) {
          const soon = grounded && fighter.dodgeCooldown > life;
          if (soon) this.unavailable(fighter, "閃避冷卻中");
          return soon;
        }
        fighter.dodge = {
          elapsed: 0,
          direction: controls.direction || -fighter.face,
          credited: false,
        };
        fighter.dodgeCooldown = 0.78;
        fighter.guard = false;
        fighter.dash = null;
        this.events.push({ type: "dodge", fighter });
        return true;
      }
      let name = action;
      if (grounded && fighter.crouch) {
        if (action === "heavy") name = "sweep";
        if (action === "light") name = "crouchLight";
      }
      const spec = NORMALS[name] ?? fighter.profile[name];
      if (!spec?.events) return true;
      if (!grounded && !spec.air) return false; // 落地後再出
      if (!this.ready(fighter, action)) {
        const key = COOLDOWN_KEY[action];
        if (key && fighter[key] <= life) return false; // 快好了，等一下
        const label = action === "super" ? "大招能量不足" : "技能冷卻中";
        this.unavailable(fighter, label);
        return true;
      }
      const kind = name === "crouchLight" ? "light" : name;
      this.begin(fighter, kind, spec);
      return true;
    }

    unavailable(fighter, text) {
      this.events.push({ type: "unavailable", fighter, text });
    }

    /* 出招前的靠近方式：
         跟步  只差一點點，起手的時候順便補上
         衝步  再遠一些，先快速衝到面前才出手（被打中會中斷）
       按著後退出招就站在原地，拿來牽制。 */
    approach(fighter, target, spec) {
      if (!spec.step || fighter.y > 0) return null;
      const gap = contactGap(fighter, target, spec);
      const back = fighter.heldDirection === -fighter.face;
      if (gap <= 0 || back) return null;
      const grab = spec.events.find((event) => event.grab);
      const until = grab?.at ?? firstActive(spec);
      const step = { lunge: spec.step, lungeUntil: until, homing: true };
      if (gap <= spec.step) return step;
      const flying = target.y > 110;
      if (spec.rush && gap <= spec.step + spec.rush && !flying)
        return { ...step, rush: { time: 0 } };
      // 太遠了補不到：往前踏一步，按著前進就踏大步一點
      const pressing = fighter.heldDirection === fighter.face;
      return {
        lunge: pressing ? spec.step : spec.step * 0.4,
        lungeUntil: until,
        homing: false,
      };
    }

    // 開始一個招式
    begin(fighter, action, spec) {
      const target = this.fighters[1 - fighter.index];
      const air = fighter.y > 0 || fighter.vy > 0;
      // 每一招出手前都先轉向對手，換邊之後接的招式才不會打錯方向
      fighter.face = Math.sign(target.x - fighter.x) || fighter.face;
      if (COOLDOWN_KEY[action]) fighter[COOLDOWN_KEY[action]] = spec.cooldown;
      if (action === "super") {
        fighter.meter = 0;
        // 大招發動時雙方定格，讓演出播完
        this.hitStop = Math.max(this.hitStop, 0.42);
        this.events.push({ type: "super-flash", fighter, name: spec.name });
      }
      const dashing = fighter.dash?.forward && action !== "throw";
      fighter.dash = null;
      fighter.guard = false;
      fighter.crouch = Boolean(spec.low);
      // 開始一個招式。
      fighter.move = {
        spec,
        action,
        elapsed: 0,
        next: 0,
        lowAttack: Boolean(spec.low) && action === "light",
        armorHits: 0,
        carry: dashing ? 260 : 0,
        air,
        live: [], // 還在判定中的打擊
        ...this.approach(fighter, target, spec),
      };
      this.events.push({ type: "attack", action, fighter, name: spec.name });
      if (fighter.move.rush) this.events.push({ type: "rush", fighter });
    }

    /* 兩人身體重疊時推開：這一步互相靠近的量立刻抵銷（走路推不進去），
       原本就重疊的部分（跳到頭上、穿過去）才慢慢滑開。 */
    separateFighters(dt) {
      const [first, second] = this.fighters;
      if (
        first.dodge ||
        second.dodge ||
        first.heldBy ||
        second.heldBy ||
        Math.abs(first.y - second.y) > 113
      )
        return;
      const [left, right] =
        first.x <= second.x ? [first, second] : [second, first];
      const overlap = PUSH_DISTANCE - (right.x - left.x);
      if (overlap <= 0) return;
      const before = right.x - left.x;
      const closing = Math.max(0, right.previousX - left.previousX - before);
      const slide = clamp(overlap * PUSH.rate, PUSH.min, PUSH.max) * dt;
      const push = Math.min(overlap, closing + slide);
      left.x = stageX(left.x - push / 2);
      right.x = stageX(right.x + push / 2);
      // 有一邊貼牆推不動，剩下的由另一邊退開
      const rest = push - (right.x - left.x - before);
      if (rest > 0.01) {
        if (left.x === FIELD.left) right.x = stageX(right.x + rest);
        else left.x = stageX(left.x - rest);
      }
    }

    // 推進招式，時間到就產生攻擊判定。
    advanceAttack(fighter, target, contacts, dt) {
      // move 是正在出的招式，spec 是這一招的固定資料（多長、什麼時候打出判定）。
      const move = fighter.move;
      if (!move) return;
      const { spec } = move;
      // 追擊衝步：到了面前、或衝太久還追不上，才真正出手
      if (move.rush) {
        move.rush.time += dt;
        const near = contactGap(fighter, target, spec) <= spec.step * 0.6;
        if (!near && move.rush.time < RUSH_TIME) return;
        move.rush = null;
      }
      // 累計已經出招多久。
      move.elapsed += dt;
      // 上一幀揮出去、還沒碰到人的拳腳，繼續判定
      if (move.live?.length)
        move.live = move.live.filter(
          (item) =>
            move.elapsed <= item.until &&
            !this.tryStrike(fighter, target, item.strike, move, contacts),
        );
      // 依時間依序觸發這一招的每個事件：瞬移、上升、放開被抓住的人、打出判定等。
      while (
        move.next < spec.events.length &&
        spec.events[move.next].at <= move.elapsed + 0.000001
      ) {
        const event = spec.events[move.next++];
        if (event.blink) {
          this.blink(fighter, target, event.blink);
        } else if (event.rise) {
          fighter.vy = event.rise;
          move.drift = event.drift ?? 0;
          this.events.push({ type: "rise", fighter });
        } else if (event.grab) {
          this.tryGrab(fighter, target, event.grab, move);
        } else if (event.toss) {
          if (move.grabbed === target && target.heldBy === fighter) {
            target.heldBy = null;
            contacts.push({
              attacker: fighter,
              target,
              strike: event.toss,
              direction: fighter.face,
              action: "throw",
              height: 120,
              unblockable: true,
            });
          }
        } else if (event.burst) {
          this.burst(fighter, target, event.burst);
        } else if (event.trap) {
          this.spawnTrap(fighter, target, event, move.action);
        } else if (event.projectile) {
          this.spawnProjectile(fighter, event, move.action);
        } else {
          this.swing(fighter, event, move);
          if (!this.tryStrike(fighter, target, event, move, contacts)) {
            const air = move.air && fighter.y > 0 && !event.launch;
            const active = air ? AIR_ACTIVE : (event.active ?? 0.06);
            move.live ??= [];
            move.live.push({ strike: event, until: move.elapsed + active });
          }
        }
      }
      // 招式時間到了就結束，回到一般狀態。
      if (
        fighter.move === move &&
        move.elapsed >= (move.duration ?? spec.duration)
      )
        fighter.move = null;
    }

    // 能不能抓住對手。
    tryGrab(fighter, target, range, move) {
      const free =
        target.y === 0 &&
        target.vy === 0 &&
        target.stun === 0 &&
        !target.heldBy &&
        !invulnerable(target);
      const reach = range + halfWidth(target);
      const ahead = (target.x - fighter.x) * fighter.face;
      if (free && ahead > -20 && ahead <= reach && target.hp > 0) {
        move.grabbed = target;
        target.heldBy = fighter;
        target.techTimer = TECH_WINDOW;
        target.move = null;
        target.dodge = null;
        target.dash = null;
        target.stun = 0.5;
        target.face = -fighter.face;
        this.events.push({ type: "grab", fighter, target });
      } else {
        // 摔空會有很長、容易被處罰的收招。
        move.duration = move.spec.whiffDuration ?? move.spec.duration;
        move.next = move.spec.events.length;
        this.events.push({ type: "whiff", fighter });
      }
    }

    // 爆氣把對手彈開。
    burst(fighter, target, range) {
      const direction = Math.sign(target.x - fighter.x) || fighter.face;
      if (
        Math.abs(target.x - fighter.x) < range &&
        Math.abs(target.y - fighter.y) < 200
      ) {
        target.knock = (direction * 560) / target.profile.weight;
        target.stun = Math.max(target.stun, 0.38);
        if (target.move?.action !== "super") target.move = null;
        target.heldBy = null;
        if (target.y > 0) target.vy = Math.max(target.vy, 200);
      }
      this.hitStop = Math.max(this.hitStop, 0.1);
      this.events.push({ type: "burst", fighter });
    }

    // 瞬移到對手背後。
    blink(fighter, target, range) {
      const from = fighter.x;
      const delta = target.x - from;
      const direction = Math.sign(delta) || fighter.face;
      fighter.x = stageX(
        Math.abs(delta) <= range
          ? target.x + direction * 109
          : from + direction * 162,
      );
      fighter.previousX = fighter.x;
      fighter.face = Math.sign(target.x - fighter.x) || -direction;
      this.events.push({ type: "blink", fighter, from, to: fighter.x });
    }

    // 這一擊的判定範圍：方向、上下緣，以及要站著還是蹲著防
    hitBox(fighter, target, strike) {
      const dx = target.x - fighter.x;
      const direction = strike.radial
        ? Math.sign(dx) || fighter.face
        : fighter.face;
      // 下段要蹲著防，跳躍攻擊要站著防
      const kind = strike.lowHit
        ? "low"
        : fighter.y > 30 && !strike.launch
          ? "overhead"
          : "mid";
      // 跳躍攻擊往下打，碰得到蹲著的對手
      const overhead = kind === "overhead";
      return {
        direction,
        kind,
        low: overhead ? fighter.y - 70 : fighter.y + strike.low,
        high: overhead ? fighter.y + 160 : fighter.y + strike.high,
      };
    }

    // 揮出去的那一刻（畫面與音效用，一擊只會有一次）
    swing(fighter, strike, move) {
      const target = this.fighters[1 - fighter.index];
      const { low, high, direction } = this.hitBox(fighter, target, strike);
      this.events.push({
        type: "swing",
        fighter,
        strike,
        low,
        high,
        direction,
        action: move.action,
      });
    }

    // 碰到了就記下來並回傳 true；距離算到對手身體的邊緣，不是中心點
    tryStrike(fighter, target, strike, move, contacts) {
      const box = this.hitBox(fighter, target, strike);
      const { low, high, direction, kind } = box;
      const [targetLow, targetHigh] = body(target);
      const distance = (target.x - fighter.x) * direction;
      const range = strike.range * (strike.radial ? 1 : fighter.profile.arm);
      const touching =
        distance >= -30 &&
        distance <= range + halfWidth(target) &&
        low < targetHigh &&
        high > targetLow;
      if (!touching) return false;
      contacts.push({
        attacker: fighter,
        target,
        strike,
        direction,
        action: move.action,
        kind,
        height: Math.min((low + high) / 2, targetHigh - 10),
      });
      return true;
    }

    // 發射飛行道具。
    spawnProjectile(fighter, strike, action) {
      const { speed, height, radius, shape, life } = strike.projectile;
      // 飛行道具的資料。
      const shot = {
        owner: fighter,
        strike,
        action,
        x: fighter.x + fighter.face * 68,
        previousX: fighter.x + fighter.face * 68,
        y: fighter.y + height,
        speed,
        direction: fighter.face,
        radius,
        shape,
        life,
        checked: false,
        age: 0,
      };
      this.projectiles.push(shot);
      this.events.push({ type: "projectile", shot });
    }

    // 放置陷阱。
    spawnTrap(fighter, target, event, action) {
      // 陷阱的資料。
      const trap = {
        owner: fighter,
        x: stageX(target.x),
        timer: event.trap.delay,
        total: event.trap.delay,
        spec: event.trap,
        action,
        erupted: false,
        linger: 0.5,
      };
      this.traps.push(trap);
      this.events.push({ type: "trap", fighter, trap });
    }

    // 推進陷阱。
    advanceTraps(contacts, dt) {
      for (const trap of this.traps) {
        if (trap.erupted) {
          trap.linger -= dt;
          continue;
        }
        trap.timer -= dt;
        if (trap.timer > 0) continue;
        trap.erupted = true;
        this.events.push({ type: "erupt", fighter: trap.owner, trap });
        const target = this.fighters[1 - trap.owner.index];
        const { width, height, ...strike } = trap.spec;
        if (
          Math.abs(target.x - trap.x) < width / 2 + 24 &&
          target.y < height * 0.7
        ) {
          const direction =
            Math.sign(target.x - trap.owner.x) || trap.owner.face;
          contacts.push({
            attacker: trap.owner,
            target,
            strike,
            direction,
            action: trap.action,
            height: target.y + 70,
            unblockable: true,
          });
        }
      }
      this.traps = this.traps.filter(
        (trap) => !trap.erupted || trap.linger > 0,
      );
    }

    // 推進飛行道具。
    advanceProjectiles(contacts, dt) {
      for (const shot of this.projectiles) {
        const previous = shot.x;
        shot.x += shot.speed * shot.direction * dt;
        shot.life -= dt;
        shot.age += dt;
        if (shot.checked) continue;
        const target = this.fighters[1 - shot.owner.index];
        const [targetLow, targetHigh] = body(target);
        const margin = shot.radius + 29;
        const meetsX =
          target.x >= Math.min(previous, shot.x) - margin &&
          target.x <= Math.max(previous, shot.x) + margin;
        if (
          meetsX &&
          shot.y + shot.radius > targetLow &&
          shot.y - shot.radius < targetHigh
        ) {
          shot.checked = true;
          if (!invulnerable(target)) shot.life = 0;
          contacts.push({
            attacker: shot.owner,
            target,
            strike: shot.strike,
            direction: shot.direction,
            action: shot.action,
            kind: "mid",
            height: shot.y,
          });
        }
      }
      // 雙方的飛行道具相撞就互相抵銷
      // 兩邊的飛行道具相撞就抵銷。
      for (const a of this.projectiles) {
        for (const b of this.projectiles) {
          if (a.owner === b.owner || a.life <= 0 || b.life <= 0) continue;
          if (
            Math.abs(a.x - b.x) < a.radius + b.radius + 12 &&
            Math.abs(a.y - b.y) < a.radius + b.radius
          ) {
            a.life = b.life = 0;
            this.events.push({
              type: "clash",
              x: (a.x + b.x) / 2,
              y: (a.y + b.y) / 2,
              colors: [a.owner.profile.color, b.owner.profile.color],
            });
          }
        }
      }
      this.projectiles = this.projectiles.filter(
        (shot) => shot.life > 0 && shot.x > -90 && shot.x < FIELD.width + 90,
      );
    }

    // 處理一次命中：閃避、反擊、防禦、霸體、傷害與擊退。
    applyContact(contact) {
      const { attacker, target, strike, direction, action, height } = contact;
      if (target.hp <= 0) return;
      // 浮空追打到上限時，這一下會把人打落地面，起身有短暫無敵
      const floating = target.y > 0 && target.stun > 0;
      const spike =
        floating && target.juggle >= JUGGLE_LIMIT && action !== "super";
      if (target.safe > 0) return;
      if (invulnerable(target)) {
        if (!target.dodge?.credited) {
          target.meter = Math.min(100, target.meter + 12);
          if (target.dodge) target.dodge.credited = true;
          this.events.push({ type: "evaded", fighter: target, height });
        }
        return;
      }

      // 影返: absorb the attack and retaliate from behind.
      if (
        within(target.move, "counter") &&
        !target.move.countered &&
        !contact.unblockable
      ) {
        // 反擊招的動作。
        target.move = {
          spec: COUNTER_STRIKE,
          action: "skill2",
          elapsed: 0,
          next: 0,
          countered: true,
          armorHits: 0,
        };
        target.stun = 0;
        this.hitStop = Math.max(this.hitStop, 0.24);
        this.events.push({
          type: "counter",
          fighter: target,
          attacker,
          height,
          name: COUNTER_STRIKE.name,
        });
        return;
      }

      const facing =
        target.guard && target.face === -direction && !contact.unblockable;
      // 防禦的高度不對，下段與中段攻擊就會打中
      // 防禦方向或高低不對就擋不住。
      const wrongHeight =
        facing &&
        ((contact.kind === "low" && !target.crouch) ||
          (contact.kind === "overhead" && target.crouch));
      let blocked = facing && !wrongHeight;
      if (blocked && strike.guardBreak) {
        blocked = false;
        target.guard = false;
        target.stun = Math.max(target.stun, 0.35);
        this.events.push({
          type: "guard-break",
          fighter: target,
          attacker,
          height,
        });
      }

      // 精準防禦。
      if (blocked && this.elapsed - target.guardStart < PERFECT_GUARD) {
        target.meter = Math.min(100, target.meter + 14);
        attacker.knock = (-direction * 260) / attacker.profile.weight;
        if (attacker.move && attacker.move.action !== "super")
          attacker.stun = Math.max(attacker.stun, 0.16);
        this.hitStop = Math.max(this.hitStop, 0.11);
        this.stats[target.index].perfect += 1;
        this.events.push({
          type: "perfect",
          fighter: target,
          attacker,
          height,
          direction,
        });
        return;
      }

      const armored =
        !blocked &&
        !contact.unblockable &&
        within(target.move, "armor") &&
        target.move.armorHits < 2;
      // 打斷對手出招算反擊命中。
      const counterHit =
        !blocked &&
        !armored &&
        target.move &&
        target.move.next === 0 &&
        target.move.elapsed < firstActive(target.move.spec);
      const continuingCombo =
        !blocked && target.stun > 0 && this.elapsed - attacker.lastHit < 0.66;
      const chip =
        action === "special" || action === "skill2" || action === "super";
      const { power = 1 } = attacker.profile;
      const { guts = 1 } = target.profile;
      const base = strike.damage * DAMAGE_SCALE * power * guts;
      let damage = base;
      if (blocked) damage = chip ? Math.ceil(base * 0.19) : 0;
      else {
        if (continuingCombo)
          damage *= Math.max(
            0.42,
            1 - 0.08 * attacker.combo * (action === "super" ? 0.5 : 1),
          );
        if (counterHit) damage *= 1.25;
        if (armored) damage *= 0.6;
        damage = Math.max(1, Math.round(damage));
      }
      const floor = this.training ? 1 : 0;
      target.hp = Math.max(floor, target.hp - damage);
      target.meter = Math.min(
        100,
        target.meter + (blocked ? 5 : damage * 0.43),
      );
      attacker.meter = Math.min(
        100,
        attacker.meter +
          (action === "super" ? 0 : blocked ? 3 : 8 + damage * 0.23),
      );

      if (armored) {
        target.move.armorHits += 1;
        target.flash = 0.09;
        target.flashColor = "#ffb08a";
        target.lastHurt = this.elapsed;
        this.hitStop = Math.max(this.hitStop, 0.07);
        this.events.push({
          type: "armor",
          fighter: target,
          attacker,
          melee: strike.range > 0 && !strike.projectile,
          action,
          height,
          direction,
          damage,
        });
        return;
      }

      target.knock =
        (direction * strike.knock * (blocked ? 0.85 : 1)) /
        target.profile.weight;
      const walled = target.x <= FIELD.left + 4 || target.x >= FIELD.right - 4;
      if (walled && !strike.projectile && attacker.y === 0)
        attacker.knock = -direction * strike.knock * WALL_PUSH;
      // 連擊越長，對手恢復得越快，不會有打不完的連段
      const tired = continuingCombo
        ? Math.max(0.4, 1 - 0.07 * Math.max(0, attacker.combo - 6))
        : 1;
      // 硬直時間；連段越長越短。
      target.stun = Math.max(
        target.stun,
        blocked ? 0.12 : strike.stun * tired + (counterHit ? 0.12 : 0),
      );
      if (blocked) target.blockStun = target.stun;
      if (attacker.move && !strike.projectile) attacker.move.touched = true;
      const finisher = !blocked && strike.knock >= 300;
      const ko = target.hp <= 0;
      let stop = blocked ? 0.04 : (HIT_STOP[action] ?? 0.06);
      if (finisher) stop += 0.05;
      if (counterHit) stop += 0.04;
      if (ko) stop = 0.3;
      this.hitStop = Math.max(this.hitStop, stop);

      // 沒有擋住：擊退、擊飛與連段計算。
      if (!blocked) {
        if (attacker.move)
          attacker.move.connected = attacker.move.touched = true;
        target.blockStun = 0;
        if (floating) target.juggle += 1;
        // 抓人途中被打到就放手。
        if (target.move?.grabbed) target.move.grabbed.heldBy = null;
        target.flash = 0.12;
        target.flashColor = "#ffffff";
        target.lastHurt = this.elapsed;
        target.move = null;
        target.dodge = null;
        target.dash = null;
        target.heldBy = null;
        target.crouch = false;
        target.guard = false;
        if (spike) {
          target.vy = -720;
          target.spiked = true;
        } else if (strike.launch) target.vy = strike.launch;
        else if (target.y > 0) target.vy = Math.max(target.vy, 260);
        if (ko && !strike.launch) target.vy = 520;
        attacker.combo = continuingCombo ? attacker.combo + 1 : 1;
        attacker.comboDamage =
          (continuingCombo ? attacker.comboDamage : 0) + damage;
        attacker.lastHit = this.elapsed;
        const record = this.stats[attacker.index];
        record.hits += 1;
        record.maxCombo = Math.max(record.maxCombo, attacker.combo);
        if (action === "throw") record.throws += 1;
      }
      this.stats[attacker.index].damage += damage;
      this.events.push({
        type: blocked ? "block" : "hit",
        fighter: target,
        attacker,
        melee: strike.range > 0 && !strike.projectile,
        action,
        height,
        direction,
        damage,
        combo: attacker.combo,
        counterHit,
        finisher,
        ko,
        effect: strike.effect,
        mixup: wrongHeight ? contact.kind : null,
      });
    }

    // 回合結束，判定勝負。
    finishRound(reason) {
      const [first, second] = this.fighters;
      const winner =
        first.hp === second.hp ? null : first.hp > second.hp ? 0 : 1;
      if (winner !== null) this.score[winner] += 1;
      this.result = {
        winner,
        reason,
        perfect: winner !== null && this.fighters[winner].hp >= 100,
      };
      this.phase = "round-end";
      this.phaseTime = 0;
      this.projectiles = [];
      this.traps = [];
      if (reason === "ko") this.slowMo = 1.1;
      this.events.push({
        type: "round-end",
        ...this.result,
        loser: winner === null ? null : this.fighters[1 - winner],
      });
    }

    // 下一回合或整場結束。
    advanceRound() {
      if (this.score.includes(ROUNDS_TO_WIN)) {
        this.phase = "over";
        this.events.push({ type: "match-end", ...this.result });
        return;
      }
      if (this.result.winner !== null) this.round += 1;
      this.resetRound();
    }
  }

  game.Match = Match;
  game.firstActive = firstActive;
  game.reachOf = reachOf;
  game.lastHitTime = lastHitTime;
  game.halfWidth = halfWidth;
  game.contactGap = contactGap;
})();
