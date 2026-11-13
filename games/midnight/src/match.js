/* 檔案導讀：格鬥規則與每幀模擬；角色資料在 roster.js，畫面由 renderer.js 繪製。 */
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
  const JUMP_SPEED = 743;
  const PUSH_DISTANCE = 116;
  const BUFFER_TIME = 0.23;
  const DODGE_TIME = 0.33;
  const PERFECT_GUARD = 0.16;
  const DASH_WINDOW = 0.24;
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
  const RANK = {
    light: 0,
    heavy: 1,
    sweep: 1,
    special: 2,
    skill2: 2,
    super: 3,
  };
  const COOLDOWN_KEY = { special: "specialCooldown", skill2: "skill2Cooldown" };
  const HIT_STOP = {
    light: 0.055,
    heavy: 0.085,
    sweep: 0.07,
    throw: 0.12,
    special: 0.095,
    skill2: 0.095,
    super: 0.07,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const decay = (value, dt) => Math.max(0, value - dt);
  const stageX = (x) => clamp(x, FIELD.left, FIELD.right);
  const within = (move, key) => {
    const window = move?.spec[key];
    return Boolean(
      window && move.elapsed >= window[0] && move.elapsed < window[1],
    );
  };
  const has = (fighter, action) =>
    fighter.buffer.some((entry) => entry.action === action);
  const take = (fighter, ...actions) => {
    fighter.buffer = fighter.buffer.filter(
      (entry) => !actions.includes(entry.action),
    );
  };

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
      lastHurt: -10,
      prevDirection: 0,
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

  function body(fighter) {
    const height = fighter.profile.size * (fighter.crouch ? 0.57 : 0.92);
    return [fighter.y + 4, fighter.y + height];
  }

  function invulnerable(fighter) {
    if (fighter.dodge && fighter.dodge.elapsed < 0.205) return true;
    return within(fighter.move, "invulnerable");
  }

  function recordInputs(fighter, controls) {
    for (const action of controls.actions) {
      fighter.buffer = fighter.buffer.filter(
        (entry) => entry.action !== action,
      );
      fighter.buffer.push({ action, life: BUFFER_TIME });
    }
  }

  // First moment a move can hurt: used for counter-hit detection and animation timing.
  function firstActive(spec) {
    return (
      spec.events.find((event) => event.damage || event.trap || event.toss)
        ?.at ?? spec.duration
    );
  }

  class Match {
    constructor(
      profiles,
      {
        cpu = true,
        training = false,
        difficulty = "normal",
        random = Math.random,
      } = {},
    ) {
      this.profiles = profiles;
      this.cpu = cpu;
      this.training = training;
      this.difficulty = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
      this.random = random;
      this.score = [0, 0];
      this.round = 1;
      this.elapsed = 0;
      this.events = [];
      this.slowMo = 0;
      this.resetRound();
    }

    resetRound() {
      this.fighters = this.profiles.map(createFighter);
      this.projectiles = [];
      this.traps = [];
      this.remaining = ROUND_SECONDS;
      this.phase = "intro";
      this.phaseTime = 0;
      this.hitStop = 0;
      this.result = null;
      this.ai = { controls: EMPTY_CONTROLS, nextDecision: 0.16 };
      if (this.training)
        for (const fighter of this.fighters) fighter.meter = 100;
      this.events.push({ type: "round", round: this.round });
    }

    drainEvents() {
      return this.events.splice(0);
    }

    // Real-time slow motion after a knockout; returns the simulation speed factor.
    timeScale(realDt) {
      if (this.slowMo <= 0) return 1;
      this.slowMo = decay(this.slowMo, realDt);
      return 0.3;
    }

    step(dt, playerInputs = []) {
      if (this.phase === "over") return;
      for (const fighter of this.fighters) {
        fighter.previousX = fighter.x;
        fighter.previousY = fighter.y;
      }
      this.phaseTime += dt;
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
      if (this.phase === "round-end") {
        // The loser keeps falling and sliding; nobody can act.
        for (const fighter of this.fighters) this.settle(fighter, dt);
        if (this.phaseTime >= 2.2) this.advanceRound();
        return;
      }
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
        inputs[1] = this.training ? EMPTY_CONTROLS : this.computerControls(dt);
      this.fighters.forEach((fighter, index) =>
        this.advanceFighter(
          fighter,
          this.fighters[1 - index],
          inputs[index],
          dt,
        ),
      );
      this.separateFighters();

      // Collect contacts before applying damage so simultaneous attacks can trade.
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

    refillTraining(dt) {
      for (const fighter of this.fighters) {
        if (fighter.stun === 0 && this.elapsed - fighter.lastHurt > 1.1)
          fighter.hp = Math.min(100, fighter.hp + 70 * dt);
        if (!fighter.move || fighter.move.action !== "super")
          fighter.meter = Math.min(100, fighter.meter + 30 * dt);
      }
    }

    settle(fighter, dt) {
      fighter.heldBy = null;
      fighter.x = stageX(fighter.x + fighter.knock * dt);
      fighter.knock *= Math.max(0, 1 - 5 * dt);
      if (fighter.y > 0 || fighter.vy > 0) {
        fighter.y = Math.max(0, fighter.y + fighter.vy * dt);
        fighter.vy = fighter.y > 0 ? fighter.vy - GRAVITY * dt : 0;
        if (fighter.y === 0)
          this.events.push({ type: "land", fighter, heavy: fighter.hp === 0 });
      }
    }

    // Being held by a throw: pinned in front of the thrower until tossed or teched.
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
      fighter.x = stageX(by.x + by.face * 92);
      fighter.vx = 0;
      fighter.knock = 0;
      fighter.crouch = false;
      fighter.guard = false;
      fighter.walking = false;
      return true;
    }

    advanceFighter(fighter, opponent, controls, dt) {
      fighter.specialCooldown = decay(fighter.specialCooldown, dt);
      fighter.skill2Cooldown = decay(fighter.skill2Cooldown, dt);
      fighter.dodgeCooldown = decay(fighter.dodgeCooldown, dt);
      fighter.stun = decay(fighter.stun, dt);
      fighter.flash = decay(fighter.flash, dt);
      fighter.meter = Math.min(100, fighter.meter + 3.6 * dt);
      for (const entry of fighter.buffer) entry.life -= dt;
      fighter.buffer = fighter.buffer.filter((entry) => entry.life > 0);
      recordInputs(fighter, controls);
      if (controls.guard && !fighter.guardHeld)
        fighter.guardStart = this.elapsed;
      fighter.guardHeld = controls.guard;
      const grounded = fighter.y === 0 && fighter.vy === 0;

      if (fighter.heldBy && this.advanceHeld(fighter, dt)) return;

      // 爆氣: escape a combo while in hit-stun by paying meter.
      if (
        fighter.stun > 0 &&
        has(fighter, "dodge") &&
        fighter.meter >= BURST_COST &&
        fighter.hp > 0
      ) {
        take(fighter, "dodge");
        fighter.meter -= BURST_COST;
        fighter.stun = 0;
        fighter.knock = 0;
        fighter.dash = null;
        fighter.move = {
          spec: BURST,
          action: "burst",
          elapsed: 0,
          next: 0,
          armorHits: 0,
        };
        this.events.push({ type: "burst-start", fighter });
      }

      // Light + heavy pressed together (or heavy right after a fresh light) becomes a throw.
      const lightFresh =
        fighter.move?.action === "light" &&
        fighter.move.elapsed < 0.07 &&
        !fighter.move.connected;
      if (
        grounded &&
        has(fighter, "heavy") &&
        (has(fighter, "light") || lightFresh) &&
        (!fighter.move || lightFresh)
      ) {
        take(fighter, "light", "heavy");
        fighter.buffer.unshift({ action: "throw", life: BUFFER_TIME });
        if (lightFresh) fighter.move = null;
      }

      // A confirmed hit permits a stronger follow-up during recovery.
      const next = fighter.buffer[0]?.action;
      const move = fighter.move;
      if (
        move?.connected &&
        next in RANK &&
        move.action in RANK &&
        move.elapsed >= firstActive(move.spec) + 0.035 &&
        this.ready(fighter, next)
      ) {
        const current = RANK[move.action];
        const upgrade =
          RANK[next] > current ||
          (RANK[next] === 2 && current === 2 && next !== move.action);
        if (upgrade) fighter.move = null;
      }
      fighter.walking = false;
      fighter.guard = false;
      if (!controls.guard) fighter.guardDirection = 0;

      if (fighter.dodge) {
        fighter.dodge.elapsed += dt;
        if (fighter.dodge.elapsed >= DODGE_TIME) fighter.dodge = null;
      }
      if (fighter.dash) {
        fighter.dash.elapsed += dt;
        if (fighter.dash.elapsed >= fighter.dash.time || !grounded)
          fighter.dash = null;
      }

      let speed = 0;
      if (!fighter.move && !fighter.dodge && fighter.stun === 0) {
        if (grounded && !fighter.dash)
          fighter.face =
            fighter.guardDirection ||
            Math.sign(opponent.x - fighter.x) ||
            fighter.face;
        fighter.crouch = grounded && controls.crouch && !fighter.dash;
        fighter.guard = grounded && controls.guard && !fighter.dash;
        if (fighter.guard) fighter.guardDirection = fighter.face;
        this.detectDash(fighter, controls, grounded);
        while (fighter.buffer.length && !fighter.move && !fighter.dodge) {
          const { action } = fighter.buffer.shift();
          this.startAction(fighter, action, controls);
        }
        const canWalk =
          !fighter.move &&
          !fighter.dodge &&
          !fighter.crouch &&
          !fighter.guard &&
          !fighter.dash;
        speed = canWalk
          ? controls.direction * fighter.profile.speed * (grounded ? 1.14 : 1)
          : 0;
        fighter.walking = grounded && speed !== 0;
      } else {
        fighter.dash = null;
      }
      fighter.prevDirection = controls.direction;

      if (fighter.dodge) {
        speed =
          fighter.dodge.direction * (fighter.dodge.elapsed < 0.19 ? 610 : 190);
        fighter.crouch = false;
      } else if (fighter.dash && !fighter.move) {
        const { from, to, time } = fighter.dash;
        const t = fighter.dash.elapsed / time;
        speed = fighter.dash.dir * (from + (to - from) * t * t);
      } else if (fighter.move) {
        const { spec, elapsed } = fighter.move;
        const travel = spec.travel;
        if (travel && elapsed >= (travel.from ?? 0) && elapsed < travel.until)
          speed = fighter.face * travel.speed;
        if (fighter.move.drift && fighter.y > 0)
          speed = fighter.face * fighter.move.drift;
        // Momentum from a dash carries into the attack for a lunging strike.
        if (fighter.move.carry)
          speed +=
            fighter.face * fighter.move.carry * Math.max(0, 1 - elapsed / 0.22);
      }

      // Short hop: letting go of jump early cuts the rise.
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
        fighter.dodge || fighter.move || fighter.stun > 0 || fighter.dash;
      fighter.vx = forceMovement
        ? speed
        : fighter.vx + (speed - fighter.vx) * (1 - Math.exp(-32 * dt));
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
      if (fighter.y > 0 || fighter.vy > 0) {
        fighter.y = Math.max(0, fighter.y + fighter.vy * dt);
        fighter.vy = fighter.y > 0 ? fighter.vy - GRAVITY * dt : 0;
        if (fighter.y === 0) {
          fighter.jumping = false;
          this.events.push({ type: "land", fighter });
        }
      }
    }

    // Double-tap a direction to dash forward or back-step.
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

    ready(fighter, action) {
      if (action === "super") return fighter.meter >= 100;
      const key = COOLDOWN_KEY[action];
      return !key || fighter[key] === 0;
    }

    startAction(fighter, action, controls) {
      const grounded = fighter.y === 0 && fighter.vy === 0;
      if (action === "jump") {
        if (grounded && !fighter.guard) {
          fighter.vy = JUMP_SPEED;
          fighter.jumping = true;
          fighter.jumpCut = false;
          fighter.crouch = false;
          // Dash jumps keep their momentum.
          if (fighter.dash) fighter.vx = fighter.dash.dir * 380;
          fighter.dash = null;
          this.events.push({ type: "jump", fighter });
        }
        return;
      }
      if (action === "dodge") {
        if (!grounded || fighter.dodgeCooldown > 0) return;
        fighter.dodge = {
          elapsed: 0,
          direction: controls.direction || -fighter.face,
          credited: false,
        };
        fighter.dodgeCooldown = 0.81;
        fighter.guard = false;
        fighter.dash = null;
        this.events.push({ type: "dodge", fighter });
        return;
      }
      let name = action;
      if (action === "heavy" && fighter.crouch && grounded) name = "sweep";
      const spec = NORMALS[name] ?? fighter.profile[name];
      if (!spec?.events || fighter.guard || (!grounded && !spec.air)) return;
      if (!this.ready(fighter, name)) {
        this.events.push({
          type: "unavailable",
          fighter,
          text: name === "super" ? "大招能量不足" : "技能冷卻中",
        });
        return;
      }
      if (COOLDOWN_KEY[name]) fighter[COOLDOWN_KEY[name]] = spec.cooldown;
      if (name === "super") {
        fighter.meter = 0;
        // Freeze both fighters for the cinematic super flash.
        this.hitStop = Math.max(this.hitStop, 0.42);
        this.events.push({ type: "super-flash", fighter, name: spec.name });
      }
      const carry = fighter.dash?.forward && name !== "throw" ? 260 : 0;
      fighter.dash = null;
      const lowAttack = fighter.crouch && name === "light";
      fighter.crouch = lowAttack || name === "sweep";
      fighter.move = {
        spec,
        action: name,
        elapsed: 0,
        next: 0,
        lowAttack,
        armorHits: 0,
        carry,
      };
      this.events.push({
        type: "attack",
        action: name,
        fighter,
        name: spec.name,
      });
    }

    separateFighters() {
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
      left.x = stageX(left.x - overlap / 2);
      right.x = stageX(right.x + overlap / 2);
      if (right.x - left.x < PUSH_DISTANCE) {
        if (left.x === FIELD.left) right.x = left.x + PUSH_DISTANCE;
        else left.x = right.x - PUSH_DISTANCE;
      }
    }

    advanceAttack(fighter, target, contacts, dt) {
      const move = fighter.move;
      if (!move) return;
      move.elapsed += dt;
      const { spec } = move;
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
          this.tryStrike(fighter, target, event, move, contacts);
        }
      }
      if (
        fighter.move === move &&
        move.elapsed >= (move.duration ?? spec.duration)
      )
        fighter.move = null;
    }

    tryGrab(fighter, target, range, move) {
      const free =
        target.y === 0 &&
        target.vy === 0 &&
        target.stun === 0 &&
        !target.heldBy &&
        !invulnerable(target);
      if (free && Math.abs(target.x - fighter.x) <= range && target.hp > 0) {
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
        // A missed throw leaves a long, punishable recovery.
        move.duration = move.spec.whiffDuration ?? move.spec.duration;
        move.next = move.spec.events.length;
        this.events.push({ type: "whiff", fighter });
      }
    }

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

    tryStrike(fighter, target, strike, move, contacts) {
      const dx = target.x - fighter.x;
      const direction = strike.radial
        ? Math.sign(dx) || fighter.face
        : fighter.face;
      // Lows must be blocked crouching; jump-ins must be blocked standing.
      const kind =
        move.lowAttack || strike.lowHit
          ? "low"
          : fighter.y > 30 && !strike.launch
            ? "overhead"
            : "mid";
      // Jump-in normals strike downward so they can reach crouching opponents.
      const low =
        kind === "overhead"
          ? fighter.y - 40
          : fighter.y + (move.lowAttack ? 16 : strike.low);
      const high =
        kind === "overhead"
          ? fighter.y + 160
          : fighter.y + (move.lowAttack ? 104 : strike.high);
      const [targetLow, targetHigh] = body(target);
      this.events.push({
        type: "swing",
        fighter,
        strike,
        low,
        high,
        direction,
        action: move.action,
      });
      const distance = dx * direction;
      if (
        distance >= -12 &&
        distance <= strike.range &&
        low < targetHigh &&
        high > targetLow
      ) {
        contacts.push({
          attacker: fighter,
          target,
          strike,
          direction,
          action: move.action,
          kind,
          height: Math.min((low + high) / 2, targetHigh - 10),
        });
      }
    }

    spawnProjectile(fighter, strike, action) {
      const { speed, height, radius, shape, life } = strike.projectile;
      const shot = {
        owner: fighter,
        strike,
        action,
        x: fighter.x + fighter.face * 68,
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

    spawnTrap(fighter, target, event, action) {
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
      // Opposing projectiles cancel each other out.
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

    applyContact(contact) {
      const { attacker, target, strike, direction, action, height } = contact;
      if (target.hp <= 0) return;
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
      // Guarding at the wrong height lets low and overhead attacks through.
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

      if (blocked && this.elapsed - target.guardStart < PERFECT_GUARD) {
        target.meter = Math.min(100, target.meter + 14);
        attacker.knock = (-direction * 260) / attacker.profile.weight;
        if (attacker.move && attacker.move.action !== "super")
          attacker.stun = Math.max(attacker.stun, 0.16);
        this.hitStop = Math.max(this.hitStop, 0.11);
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
      let damage = strike.damage;
      if (blocked) damage = chip ? Math.ceil(strike.damage * 0.19) : 0;
      else {
        if (continuingCombo)
          damage *= Math.max(
            0.5,
            1 - 0.07 * attacker.combo * (action === "super" ? 0.5 : 1),
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
          action,
          height,
          direction,
          damage,
        });
        return;
      }

      target.knock =
        (direction * strike.knock * (blocked ? 0.31 : 1)) /
        target.profile.weight;
      target.stun = Math.max(
        target.stun,
        blocked ? 0.105 : strike.stun + (counterHit ? 0.12 : 0),
      );
      const finisher = !blocked && strike.knock >= 300;
      const ko = target.hp <= 0;
      let stop = blocked ? 0.04 : (HIT_STOP[action] ?? 0.06);
      if (finisher) stop += 0.05;
      if (counterHit) stop += 0.04;
      if (ko) stop = 0.3;
      this.hitStop = Math.max(this.hitStop, stop);

      if (!blocked) {
        if (attacker.move) attacker.move.connected = true;
        // A thrower hit mid-grab lets go.
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
        if (strike.launch) target.vy = strike.launch;
        else if (target.y > 0) target.vy = Math.max(target.vy, 260);
        if (ko && !strike.launch) target.vy = 520;
        attacker.combo = continuingCombo ? attacker.combo + 1 : 1;
        attacker.comboDamage =
          (continuingCombo ? attacker.comboDamage : 0) + damage;
        attacker.lastHit = this.elapsed;
      }
      this.events.push({
        type: blocked ? "block" : "hit",
        fighter: target,
        attacker,
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

    advanceRound() {
      if (this.score.includes(ROUNDS_TO_WIN)) {
        this.phase = "over";
        this.events.push({ type: "match-end", ...this.result });
        return;
      }
      if (this.result.winner !== null) this.round += 1;
      this.resetRound();
    }

    computerControls(dt) {
      const [rival, cpu] = this.fighters;
      const level = this.difficulty;
      this.ai.nextDecision -= dt;

      // Defensive reflexes that cut through the decision timer.
      if (cpu.heldBy) {
        if (!this.ai.techTried) {
          this.ai.techTried = true;
          if (this.random() < level.react * 0.55)
            return { ...EMPTY_CONTROLS, actions: ["throw"] };
        }
        return EMPTY_CONTROLS;
      }
      this.ai.techTried = false;
      if (
        cpu.stun > 0 &&
        cpu.meter >= BURST_COST &&
        rival.combo >= 3 &&
        !this.ai.burstTried
      ) {
        this.ai.burstTried = true;
        if (this.random() < level.react * 0.35)
          return { ...EMPTY_CONTROLS, actions: ["dodge"] };
      }
      if (cpu.stun === 0) this.ai.burstTried = false;

      // Combo confirm: chain into a stronger move as soon as a hit lands.
      if (cpu.move?.connected && !this.ai.confirmed) {
        this.ai.confirmed = true;
        if (this.random() < level.confirm) {
          const chain =
            cpu.move.action === "light"
              ? "heavy"
              : cpu.move.action === "heavy"
                ? cpu.meter >= 100 && this.random() < 0.5
                  ? "super"
                  : this.ready(cpu, "special")
                    ? "special"
                    : "skill2"
                : (cpu.move.action === "special" ||
                      cpu.move.action === "skill2") &&
                    cpu.meter >= 100
                  ? "super"
                  : null;
          if (chain && this.ready(cpu, chain))
            return { ...EMPTY_CONTROLS, actions: [chain] };
        }
      }
      if (!cpu.move) this.ai.confirmed = false;

      // Hold guard at the right height while still guarding.
      const held = this.ai.controls;
      if (held.guard)
        held.crouch =
          (rival.crouch || rival.move?.action === "sweep") && rival.y === 0;
      if (this.ai.nextDecision > 0) return held;

      const controls = {
        direction: 0,
        crouch: false,
        guard: false,
        actions: [],
      };
      this.ai.controls = controls;
      const roll = this.random();
      this.ai.nextDecision = level.think[0] + this.random() * level.think[1];
      if (cpu.move || cpu.dodge || cpu.stun > 0) return controls;

      const distance = Math.abs(rival.x - cpu.x);
      const toward = Math.sign(rival.x - cpu.x) || cpu.face;
      const id = cpu.profile.id;
      const ranged = id === "frost";
      const incoming = this.projectiles.find(
        (shot) =>
          shot.owner === rival &&
          !shot.checked &&
          (cpu.x - shot.x) * shot.direction >= 0 &&
          Math.abs(shot.x - cpu.x) < 220,
      );
      const trap = this.traps.find(
        (item) =>
          item.owner === rival &&
          !item.erupted &&
          Math.abs(item.x - cpu.x) < 110,
      );
      const rivalStartup =
        rival.move && rival.move.next === 0 && distance < 260;
      const aggression = level.aggression;
      const guardLow =
        (rival.crouch || rival.move?.action === "sweep") && rival.y === 0;

      if (trap && roll < level.react) {
        controls.direction = Math.sign(cpu.x - trap.x) || -toward;
        if (cpu.dodgeCooldown === 0 && roll < level.react * 0.5)
          controls.actions.push("dodge");
      } else if (incoming && roll < level.react) {
        if (id === "shade" && this.ready(cpu, "skill2") && roll < 0.4)
          controls.actions.push("skill2");
        else if (incoming.shape === "quake") controls.actions.push("jump");
        else if (incoming.y >= 166) controls.crouch = true;
        else controls.guard = true;
      } else if (
        rival.y > 70 &&
        distance < 230 &&
        id === "thunder" &&
        this.ready(cpu, "skill2") &&
        roll < level.react
      ) {
        controls.actions.push("skill2");
      } else if (rivalStartup && roll < level.guard + 0.1) {
        if (id === "shade" && this.ready(cpu, "skill2"))
          controls.actions.push("skill2");
        else if (roll < level.guard * 0.4 && cpu.dodgeCooldown === 0)
          controls.actions.push("dodge");
        else {
          controls.guard = true;
          controls.crouch = guardLow;
        }
      } else if (rival.move && distance < 230 && roll < level.guard) {
        if (roll < 0.12 && cpu.dodgeCooldown === 0)
          controls.actions.push("dodge");
        else {
          controls.guard = true;
          controls.crouch = guardLow;
        }
      } else if (
        rival.guard &&
        distance < 120 &&
        roll < 0.35 + level.confirm * 0.4
      ) {
        controls.actions.push("throw");
      } else if (
        cpu.meter >= 100 &&
        distance < (ranged ? 850 : 330) &&
        roll > 0.42 / aggression
      ) {
        controls.actions.push("super");
      } else if (
        rival.guard &&
        id === "lion" &&
        distance < 330 &&
        this.ready(cpu, "skill2") &&
        roll > 0.4
      ) {
        controls.actions.push("skill2");
      } else if (
        ranged &&
        this.ready(cpu, "skill2") &&
        distance > 260 &&
        roll > 0.7 / aggression
      ) {
        controls.actions.push("skill2");
      } else if (
        this.ready(cpu, "special") &&
        distance < (ranged ? 900 : 346) &&
        roll > 0.59 / aggression
      ) {
        controls.actions.push("special");
      } else if (distance <= 163 && roll > 0.17 / aggression) {
        if (roll > 0.86) {
          controls.crouch = true;
          controls.actions.push("heavy");
        } else
          controls.actions.push(
            distance < 137 && roll < 0.66 ? "light" : "heavy",
          );
      } else if (distance > (ranged ? 375 : 139)) {
        controls.direction = toward;
        if (!ranged && distance > 330 && roll < 0.25 * aggression)
          controls.dash = toward;
        else if (distance > 235 && roll < 0.08) controls.actions.push("jump");
      } else if (roll < 0.39) {
        controls.direction = -toward;
        if (roll < 0.1) controls.dash = -toward;
      }

      // Keep the held inputs until the next decision and deliver each press once.
      this.ai.controls = { ...controls, actions: [], dash: 0 };
      return controls;
    }
  }

  game.Match = Match;
  game.firstActive = firstActive;
})();
