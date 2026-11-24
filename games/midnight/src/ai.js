/* 檔案導讀：電腦對手的「大腦」。match.js 每一幀呼叫 controls(dt)，
   回傳和玩家按鍵相同格式的輸入，所以電腦用的規則和玩家完全一樣。

   思考分成四層，越上面越優先：
     1. 反射   被抓住時拆投、被連段時爆氣、打中後接連段
     2. 被壓制 剛恢復行動時決定反擊、繼續防禦或脫身；看到對手連續進攻就守到他停手
     3. 反應   看到對手出招或飛行道具後，隔一段「反應時間」才防禦、閃避或反擊
     4. 戰術   每隔一小段時間決定接下來要做什麼（懲罰破綻、對空、拉近或拉開距離、
               投技破防、上下段擇一…）

   難度（roster.js 的 DIFFICULTY）決定反應時間、防禦與懲罰的成功率、多常想一次。
   另外會記住對手的習慣（常跳、常防、常丟飛行道具、常投），慢慢調整對策。 */
(() => {
  const game = globalThis.Midnight;
  const { FIELD, NORMALS, BURST_COST } = game;
  // 什麼都不做的輸入。
  const NONE = {
    direction: 0,
    crouch: false,
    guard: false,
    steady: true, // 一般的防禦，不觸發精準防禦
    actions: [],
  };

  /* 每個鬥士的打法：
       chain        打中之後可以接的下一招（依序嘗試）
       lunge        能從中距離突進的招式與它的有效距離
       antiAir      專門對付跳躍的招式
       counter      當身技（被打到才發動）
       shot         貼地的飛行道具
       zone         true 表示遠攻型：保持距離、用飛行道具牽制
       superReach   大招打得到的距離 */
  const KITS = {
    thunder: {
      chain: {
        light: ["light", "heavy"],
        heavy: ["special", "skill2"],
        special: ["super"],
        skill2: ["super"],
      },
      lunge: "special",
      lungeReach: 450,
      antiAir: "skill2",
      superReach: 500,
    },
    frost: {
      zone: true,
      chain: {
        light: ["light", "heavy"],
        heavy: ["special"],
        special: ["super"],
      },
      superReach: 900,
    },
    lion: {
      chain: {
        light: ["light", "heavy"],
        heavy: ["skill2", "special"],
        skill2: ["super"],
        special: ["super"],
      },
      lunge: "skill2",
      lungeReach: 430,
      shot: "special",
      superReach: 420,
    },
    shade: {
      chain: {
        light: ["light", "heavy"],
        heavy: ["special"],
        special: ["super"],
      },
      lunge: "special",
      lungeReach: 430,
      counter: "skill2",
      superReach: 560,
    },
  };

  const THROW_REACH = 186; // 投技抓得到（含跟步）
  const LOW_REACH = 205; // 蹲踢打得到（含跟步）
  // 對手兩招相隔不到這麼久，就視為同一波進攻
  const WAVE_GAP = 0.55;

  // 一位電腦對手；每一步由 controls() 回傳按鍵。
  class Brain {
    // 記下自己、對手、難度與對手的習慣。
    constructor(match, index, habits) {
      this.match = match;
      this.index = index;
      this.level = match.difficulty;
      // 對手的習慣：跨回合保留，所以越打到後面越懂得應付
      this.habits = habits ?? { jump: 0, guard: 0, throw: 0, shot: 0 };
      this.held = NONE; // 兩次決定之間持續按住的方向與防禦
      this.nextDecision = 0.16;
      this.reaction = null; // 排定中的反應 { at, move }
      this.guardUntil = 0; // 防禦要撐到什麼時候
      this.seenMove = null;
      this.seenShots = new WeakSet();
      this.sawJump = false;
      this.confirmed = null;
      this.techTried = false;
      this.burstTried = false;
      this.lastThreat = -10; // 對手上一次在打得到我的距離出招的時間
      this.wary = false; // 決定守到對手停手
      this.wasStunned = false;
      this.tempo = 0; // 對手最近出招的頻率
      this.punishTried = null;
    }

    get me() {
      return this.match.fighters[this.index];
    }

    get rival() {
      return this.match.fighters[1 - this.index];
    }

    get kit() {
      return KITS[this.me.profile.id] ?? KITS.thunder;
    }

    /* 這位鬥士的攻擊距離（兩人中心的距離）。
       near 用跟步就打得到，far 要先衝步過去才打得到。 */
    reach(action) {
      const spec = NORMALS[action];
      const contact = this.me.profile.contact?.[action] ?? spec.contact;
      const near = contact + spec.step - 8;
      return { near, far: near + spec.rush };
    }

    get lightReach() {
      return this.reach("light").near;
    }

    get heavyReach() {
      return this.reach("heavy").near;
    }

    roll() {
      return this.match.random();
    }

    ready(action) {
      return this.match.ready(this.me, action);
    }

    distance() {
      return Math.abs(this.rival.x - this.me.x);
    }

    toward() {
      return Math.sign(this.rival.x - this.me.x) || this.me.face;
    }

    // 對手這一招要蹲著防（掃腿、蹲踢）還是站著防（跳躍攻擊）
    guardLow() {
      const { rival } = this;
      if (rival.y > 0) return false;
      return Boolean(
        rival.crouch || rival.move?.action === "sweep" || rival.move?.lowAttack,
      );
    }

    // 正朝我飛來、而且快要打到的飛行道具
    incoming(seconds = 0.4) {
      const { me, rival } = this;
      return this.match.projectiles.find(
        (shot) =>
          shot.owner === rival &&
          !shot.checked &&
          (me.x - shot.x) * shot.direction >= 0 &&
          Math.abs(shot.x - me.x) < shot.speed * seconds + 40,
      );
    }

    /* ---------- 觀察：記錄對手的習慣，並對新的威脅排定反應 ---------- */
    observe(dt) {
      const { rival, habits, level } = this;
      const now = this.match.elapsed;
      const fade = Math.exp(-dt / 25); // 舊的印象慢慢淡掉
      habits.jump *= fade;
      habits.throw *= fade;
      habits.shot *= fade;
      habits.guard +=
        ((rival.guard ? 1 : 0) - habits.guard) * (1 - Math.exp(-dt / 3));
      this.tempo *= Math.exp(-dt / 1.6);
      if (rival.jumping && !this.sawJump) habits.jump += 1;
      this.sawJump = rival.jumping;

      const move = rival.move;
      if (!move) this.seenMove = null;
      else if (move !== this.seenMove) {
        this.seenMove = move;
        if (move.action === "throw") habits.throw += 1;
        this.tempo += 1;
        if (move.spec.events.some((event) => event.projectile))
          habits.shot += 1;
        this.noticeMove(move, now);
      }

      for (const shot of this.match.projectiles) {
        if (shot.owner !== rival || this.seenShots.has(shot)) continue;
        if (!this.incoming(0.45)) continue; // 還很遠，先不管
        this.seenShots.add(shot);
        if (this.roll() < level.react)
          this.reaction = { at: now + this.reactDelay() * 0.5, shot };
      }
    }

    // 依難度隨機的反應時間。
    reactDelay() {
      const [min, max] = this.level.reactTime;
      return min + (max - min) * this.roll();
    }

    // 對手出招了：打得到我的話，擲骰決定要不要反應、多久之後反應
    noticeMove(move, now) {
      const { level } = this;
      const { spec } = move;
      if (spec.events.some((event) => event.projectile || event.trap)) return;
      if (this.distance() > game.reachOf(spec) + 40) return;
      /* 第一下刺拳太快，誰都擋不住；但看到對手開始連續出招之後，
         會把手舉著不放。一波進攻只決定一次要不要守到底。 */
      if (now - this.lastThreat > WAVE_GAP) this.wary = false;
      else if (!this.wary) this.wary = this.roll() < level.wary;
      this.lastThreat = now;
      const block = Math.min(0.95, level.guard * 1.9 + 0.08);
      if (this.roll() > block) return;
      const impact = game.firstActive(spec) - move.elapsed;
      let delay = this.reactDelay();
      // 高難度偶爾會抓準時機，在攻擊到來的前一刻才舉手，打出精準防禦
      const sharp = this.roll() < level.perfect && impact - 0.1 > delay;
      if (sharp) delay = impact - 0.1;
      this.reaction = { at: now + delay, move, sharp };
    }

    /* ---------- 反應：時間到了就防禦、閃避或反擊 ---------- */
    react(now) {
      const r = this.reaction;
      if (!r || now < r.at) return null;
      this.reaction = null;
      const { me, rival, kit, level } = this;
      const busy = me.move || me.dodge || me.stun > 0 || me.y > 0 || me.heldBy;
      if (busy) return null;
      const roll = this.roll();
      const away = -this.toward();

      if (r.shot) {
        const shot = r.shot;
        if (shot.life <= 0 || shot.checked) return null;
        if (kit.counter && this.ready(kit.counter) && roll < 0.4)
          return { ...NONE, actions: [kit.counter] };
        if (shot.shape === "quake") return { ...NONE, actions: ["jump"] };
        if (shot.y >= 166) {
          // 高的冰彈：蹲下讓它從頭上飛過
          this.held = { ...NONE, crouch: true };
          this.nextDecision = Math.max(this.nextDecision, 0.3);
          return this.held;
        }
        if (me.dodgeCooldown === 0 && roll < level.guard * 0.5)
          return { ...NONE, direction: this.toward(), actions: ["dodge"] };
        this.guardUntil = now + 0.45;
        return { ...NONE, guard: true };
      }

      const move = rival.move;
      if (move !== r.move) return null; // 那一招已經結束了
      if (move.elapsed > game.lastHitTime(move.spec) + 0.02) return null;
      const close = this.distance() < 190;

      // 當身技：故意讓對手打到再反擊
      if (kit.counter && this.ready(kit.counter) && roll < 0.45)
        return { ...NONE, actions: [kit.counter] };
      // 無敵對空技也能拿來硬擋近身攻擊
      if (kit.antiAir && this.ready(kit.antiAir) && close && roll < 0.22)
        return { ...NONE, actions: [kit.antiAir] };
      // 投技與破防技不能用防禦擋：後閃或跳開
      const unblockable =
        move.action === "throw" ||
        move.spec.events.some((event) => event.guardBreak);
      if (unblockable) {
        if (me.dodgeCooldown === 0)
          return { ...NONE, direction: away, actions: ["dodge"] };
        return { ...NONE, direction: away, actions: ["jump"] };
      }
      if (me.dodgeCooldown === 0 && roll < level.guard * 0.3)
        return { ...NONE, direction: away, actions: ["dodge"] };

      const left = (move.duration ?? move.spec.duration) - move.elapsed;
      this.guardUntil = now + left + 0.06;
      return {
        ...NONE,
        guard: true,
        crouch: this.guardLow(),
        steady: !r.sharp,
      };
    }

    // 對手正在收招、而且還有一段時間不能動：回傳剩下的秒數（沒有破綻就是 0）
    opening() {
      const move = this.rival.move;
      const far = this.distance() > this.heavyReach + 60;
      if (!move || move.grabbed || far) return 0;
      const { spec } = move;
      if (spec.events.some((event) => event.projectile || event.trap)) return 0;
      if (move.elapsed < game.lastHitTime(spec) + 0.03) return 0;
      // 輕攻第一、二段隨時能接下一段，不算破綻
      if (spec.chain && move.touched) return 0;
      const left = (move.duration ?? spec.duration) - move.elapsed;
      return left > 0.14 ? left : 0;
    }

    /* ---------- 被壓制：剛恢復行動時怎麼辦 ---------- */
    recover(now) {
      const { me, rival, kit, level } = this;
      const d = this.distance();
      const move = rival.move;
      const roll = this.roll();
      // 對手的招已經打完、還在收招：打回去
      if (move && !move.grabbed && d < this.heavyReach) {
        const spent = move.elapsed > game.lastHitTime(move.spec) + 0.03;
        const left = (move.duration ?? move.spec.duration) - move.elapsed;
        const shot = move.spec.events.some((e) => e.projectile || e.trap);
        if (spent && left > 0.13 && !shot && roll < level.punish) {
          const c = { ...NONE, actions: [] };
          return this.punish(c, d, this.toward(), left);
        }
      }
      if (d > this.lightReach + 60) return null;
      const escape = kit.antiAir ?? kit.counter;
      // 無敵技或當身技：把主動權搶回來
      if (escape && this.ready(escape) && roll < level.punish * 0.24)
        return { ...NONE, actions: [escape] };
      if (roll < level.wary + 0.16) {
        this.guardUntil = now + 0.24 + this.roll() * 0.2;
        this.wary = true;
        this.lastThreat = now;
        return { ...NONE, guard: true, crouch: this.guardLow() };
      }
      if (me.dodgeCooldown === 0 && roll > 0.86)
        return { ...NONE, direction: -this.toward(), actions: ["dodge"] };
      return null;
    }

    /* ---------- 打中之後接連段 ---------- */
    confirm() {
      const { me, kit, level } = this;
      const move = me.move;
      if (!move) {
        this.confirmed = null;
        return null;
      }
      if (!move.connected || this.confirmed === move) return null;
      this.confirmed = move;
      if (this.roll() >= level.confirm) return null;
      // 輕攻接到第三段後，改接重攻或技能
      const options = [...(kit.chain[move.action] ?? [])].filter(
        (action) => action !== "light" || move.spec.chain,
      );
      if (move.action === "light" && !move.spec.chain)
        options.push(...(kit.chain.heavy ?? []));
      // 能量滿了：重攻或技能打中後有機會直接接大招
      const inReach = this.distance() < kit.superReach;
      if (move.action !== "light" && inReach && this.roll() < 0.6)
        options.unshift("super");
      return options.find((action) => this.ready(action)) ?? null;
    }

    /* ---------- 每一幀的入口 ---------- */
    controls(dt) {
      const { me, rival, level } = this;
      const now = this.match.elapsed;
      this.observe(dt);

      // 被抓住：有機會拆投
      if (me.heldBy) {
        if (!this.techTried) {
          this.techTried = true;
          // 對手越常用投技，越有防備
          const wary = Math.min(0.3, this.habits.throw * 0.1);
          if (this.roll() < level.react * (0.5 + wary))
            return { ...NONE, actions: ["throw"] };
        }
        return NONE;
      }
      this.techTried = false;

      // 被連段連到第三下以上：有能量就爆氣脫身
      if (me.stun > 0 && me.meter >= BURST_COST && rival.combo >= 3) {
        if (!this.burstTried) {
          this.burstTried = true;
          if (this.roll() < level.react * 0.4)
            return { ...NONE, actions: ["dodge"] };
        }
      }
      if (me.stun === 0) this.burstTried = false;

      const chain = this.confirm();
      if (chain) return { ...NONE, actions: [chain] };

      // 剛從受擊或防禦的硬直恢復：立刻決定怎麼應對
      const stunned = me.stun > 0;
      const freed = this.wasStunned && !stunned;
      this.wasStunned = stunned;
      // 剛恢復行動：看要怎麼應對壓制。
      const grounded = me.y === 0 && me.vy === 0;
      if (freed && grounded && !me.move) {
        const answer = this.recover(now);
        if (answer) {
          this.nextDecision = Math.max(this.nextDecision, 0.2);
          return answer;
        }
      }
      // 剛擋下一擊：繼續守著，等對手打完這一串
      if (me.blockStun > 0 && this.roll() < 0.9)
        this.guardUntil = Math.max(this.guardUntil, now + 0.12);

      const reflex = this.react(now);
      if (reflex) return reflex;

      // 對手正在連續進攻，而且決定守到底
      if (now - this.lastThreat > WAVE_GAP) this.wary = false;
      if (this.wary && grounded && !me.move && !me.dodge && !stunned) {
        const open = this.opening();
        if (open && this.punishTried !== rival.move) {
          this.punishTried = rival.move;
          if (this.roll() < level.punish) {
            this.wary = false;
            const c = { ...NONE, actions: [] };
            return this.punish(c, this.distance(), this.toward(), open);
          }
        }
        // 手一直舉著；太遠、或對手改用投技時才放下來
        const grabbing = rival.move?.action === "throw";
        if (!grabbing && this.distance() < this.heavyReach + 60)
          return { ...NONE, guard: true, crouch: this.guardLow() };
      }

      // 防禦中：對手收招、也沒有飛行道具了，就提早放下
      if (this.guardUntil > now) {
        // 對手露出破綻（招式打完、還在收招）：放下防禦打回去
        const open = this.opening();
        if (open && !stunned && this.punishTried !== rival.move) {
          this.punishTried = rival.move;
          if (this.roll() < level.punish) {
            this.guardUntil = 0;
            const c = { ...NONE, actions: [] };
            return this.punish(c, this.distance(), this.toward(), open);
          }
        }
        if (!rival.move && !this.incoming(0.3))
          this.guardUntil = Math.min(this.guardUntil, now + 0.05);
        return { ...NONE, guard: true, crouch: this.guardLow() };
      }

      // 一段時間才重新決定，平常維持上一個動作。
      this.nextDecision -= dt;
      if (this.nextDecision > 0) return this.held;
      this.nextDecision = level.think[0] + this.roll() * level.think[1];
      const controls = this.decide(now);
      // 方向與下蹲會一直按到下次決定；出招與衝刺只送出一次
      this.held = { ...controls, actions: [], dash: 0 };
      return controls;
    }

    /* ---------- 戰術：現在該做什麼 ---------- */
    decide(now) {
      const { me, rival, kit, level, habits } = this;
      const c = { ...NONE, actions: [] };
      if (me.move || me.dodge || me.stun > 0) return c;

      const d = this.distance();
      const toward = this.toward();
      const roll = this.roll();
      const aggression = level.aggression;
      const light = this.reach("light");
      const heavy = this.reach("heavy");
      // 加入一個按鍵。
      const press = (action) => {
        c.actions.push(action);
        return c;
      };

      // 人在空中：靠近了就出腳
      if (me.y > 0) {
        if (d < 225 && me.vy < 150 && roll < 0.65 * aggression)
          press(roll < 0.3 ? "light" : "heavy");
        else c.direction = this.held.direction;
        return c;
      }

      // 腳下有冰棱陣：先離開
      const trap = this.match.traps.find(
        (item) =>
          item.owner === rival &&
          !item.erupted &&
          Math.abs(item.x - me.x) < 110,
      );
      // 快踩到對手的陷阱就離開。
      if (trap && roll < level.react) {
        c.direction = Math.sign(me.x - trap.x) || -toward;
        if (me.dodgeCooldown === 0 && roll < level.react * 0.5) press("dodge");
        return c;
      }

      // 1. 懲罰破綻：對手揮空或被擋，還在收招
      const rm = rival.move;
      const spent = rm && rm.next >= rm.spec.events.length && !rm.grabbed;
      const recovering = spent
        ? (rm.duration ?? rm.spec.duration) - rm.elapsed
        : 0;
      // 對手收招的空檔。
      if (recovering > 0.1 && roll < level.punish)
        return this.punish(c, d, toward, recovering);

      // 2. 對手還在硬直：追打，把連段接下去
      if (rival.stun > 0.12 && roll < level.confirm + 0.25) {
        if (me.meter >= 100 && d < kit.superReach && rival.stun > 0.2)
          return press("super");
        if (d <= light.near) return press("light");
        if (d <= heavy.near) return press("heavy");
        // 對手硬直還夠久：衝步追上去
        if (d <= light.far && rival.stun > 0.3 && roll < level.confirm)
          return press("light");
      }

      // 對手一直猛攻：搶在他打得到之前用重攻截擊，靠近了就先守住
      const rush = Math.max(0, Math.min(1, (this.tempo - 1.4) / 2.6));
      // 對手正在衝過來，搶先打斷。
      if (rush > 0.15 && rival.y === 0 && !rival.guard) {
        const intercept = level.punish * (0.25 + 0.55 * rush);
        if (d > light.near - 12 && d < heavy.near + 20 && roll < intercept)
          return press("heavy");
        const brace = level.wary * (0.35 + 0.65 * rush);
        if (d <= light.near + 50 && this.roll() < brace) {
          this.guardUntil = now + 0.28 + 0.25 * roll;
          c.guard = true;
          return c;
        }
      }

      // 3. 對空：對手從空中壓過來
      // 對空。
      if (rival.y > 40 && rival.vy < 220 && d < 250) {
        const wary = level.antiAir + Math.min(0.2, habits.jump * 0.05);
        if (roll < wary) {
          if (kit.antiAir && this.ready(kit.antiAir) && d < 195)
            return press(kit.antiAir);
          if (d < 240 && rival.y < 180) return press("heavy");
          c.guard = true; // 來不及打下來就站著防（跳躍攻擊不能蹲防）
          this.guardUntil = now + 0.32;
          return c;
        }
      }

      // 4. 大招：有把握才放，不亂丟
      // 能量滿了就找機會放大招。
      if (me.meter >= 100) {
        const careless = (1 - level.confirm) * 0.45 + 0.06; // 難度越低越常亂放
        if (kit.zone && d > 250 && !rival.guard && roll < 0.45 * aggression)
          return press("super");
        const close = d < kit.superReach * 0.7;
        if (!kit.zone && close && !rival.guard && roll < careless)
          return press("super");
      }

      // 5. 對手一直防禦：投技或破防
      const turtle = rival.guard || habits.guard > 0.45;
      // 對手一直防禦就改用摔。
      if (rival.guard && d < light.near && !rm) {
        const grab = 0.3 + level.confirm * 0.3 + habits.guard * 0.3;
        if (d < THROW_REACH && roll < grab) return press("throw");
        if (!rival.crouch && d < LOW_REACH && roll < 0.75) {
          c.crouch = true; // 蹲踢是下段，站著防擋不住
          return press("light");
        }
      }
      if (turtle && kit.lunge === "skill2" && this.ready("skill2") && d < 300)
        if (roll > 0.45) return press("skill2");

      // 被逼到角落：翻過去或穿過去
      const cornered = me.x < FIELD.left + 120 || me.x > FIELD.right - 120;
      if (cornered && d < 220 && roll < 0.3) {
        c.direction = toward;
        return press(me.dodgeCooldown === 0 ? "dodge" : "jump");
      }

      if (kit.zone) return this.zone(c, d, toward, roll, cornered);
      return this.brawl(c, d, toward, roll);
    }

    // 懲罰：依距離與剩下的時間，選打得到的最痛的一招
    punish(c, d, toward, time) {
      const { me, kit } = this;
      const light = this.reach("light");
      const heavy = this.reach("heavy");
      if (d <= light.near) {
        const big = me.meter >= 100 && time > 0.3 && d < kit.superReach;
        const sure = big && this.roll() < this.level.confirm;
        c.actions.push(sure ? "super" : time > 0.26 ? "heavy" : "light");
      } else if (d <= heavy.near && time > 0.2) c.actions.push("heavy");
      else if (d <= light.far && time > 0.3) c.actions.push("light");
      else if (kit.zone && this.ready("special") && d / 740 < time)
        c.actions.push("special");
      else if (
        kit.lunge &&
        this.ready(kit.lunge) &&
        d < kit.lungeReach &&
        time > 0.28
      )
        c.actions.push(kit.lunge);
      else if (d < 430 && time > 0.3) {
        c.direction = toward;
        c.dash = toward;
      }
      return c;
    }

    // 遠攻型：保持距離，用飛行道具與陷阱牽制；被貼身就想辦法拉開
    zone(c, d, toward, roll, cornered) {
      const { rival } = this;
      const aggression = this.level.aggression;
      const grounded = rival.y === 0;
      if (d < 330) {
        if (grounded && this.ready("skill2") && roll < 0.3)
          c.actions.push("skill2"); // 在對手腳下放陷阱，逼他離開
        else if (roll < 0.3 + 0.2 * aggression)
          c.actions.push(
            d < this.lightReach && roll < 0.42 ? "light" : "heavy",
          );
        else if (!cornered) {
          c.direction = -toward;
          if (roll > 0.6) c.dash = -toward;
        } else c.guard = true;
        return c;
      }
      if (grounded && this.ready("special") && roll < 0.55 * aggression + 0.2)
        c.actions.push("special");
      else if (this.ready("skill2") && roll > 0.55) c.actions.push("skill2");
      else if (d < 480 && !cornered) c.direction = -toward;
      else if (d > 780) c.direction = toward;
      return c;
    }

    // 近戰型：拉近距離，在中距離試探，貼身後用輕重攻擊、下段與投技混著打
    // 沒有特別情況時的一般攻防：拉開、靠近與連段。
    brawl(c, d, toward, roll) {
      const { me, rival, kit, level, habits } = this;
      const aggression = level.aggression;
      const light = this.reach("light");
      const heavy = this.reach("heavy");
      // 加入一個按鍵。
      const press = (action) => {
        c.actions.push(action);
        return c;
      };

      if (d > heavy.near) {
        // 遠距離：貼地飛行道具、突進技，或是走過去
        const grounded = rival.y === 0;
        const canShoot = kit.shot && this.ready(kit.shot) && grounded;
        if (canShoot && d < 420 && roll > 0.55) return press(kit.shot);
        // 高難度比較不會亂衝
        const rash = 0.3 * aggression * (1 - level.punish * 0.4);
        const canLunge = kit.lunge && this.ready(kit.lunge);
        if (canLunge && d < kit.lungeReach && roll < rash)
          return press(kit.lunge);
        // 對手沒有舉手防禦時，偶爾直接衝步出手
        const dive = level.rush * aggression * (rival.guard ? 0.3 : 1);
        if (grounded && d < light.far && this.roll() < dive)
          return press(d < light.far - 40 ? "light" : "heavy");
        if (grounded && d < heavy.far && this.roll() < dive * 0.5)
          return press("heavy");
        c.direction = toward;
        // 對手愛丟飛行道具就多跳，否則用衝刺拉近
        const hop = 0.06 + Math.min(0.25, habits.shot * 0.08);
        if (d < 480 && roll > 1 - hop) press("jump");
        else if (d > 400 && roll < 0.3 * aggression) c.dash = toward;
        return c;
      }

      if (d > light.near) {
        // 中距離：用重攻的尖端試探，或進一步、退一步引對手揮空
        if (roll < 0.4 * aggression) return press("heavy");
        if (d < 300 && roll < 0.5) {
          c.crouch = true;
          return press("heavy"); // 掃腿
        }
        if (roll < 0.78) c.direction = toward;
        else if (roll < 0.9) c.direction = -toward;
        else c.guard = true;
        return c;
      }

      // 貼身
      if (roll < 0.4 * aggression) return press("light");
      if (roll < 0.55 * aggression) return press("heavy");
      if (roll < 0.66) {
        c.crouch = true;
        const low = roll < 0.6 && d < LOW_REACH;
        return press(low ? "light" : "heavy"); // 蹲踢或掃腿
      }
      if (roll < 0.74 && !rival.move) {
        if (d < THROW_REACH) return press("throw");
        c.direction = toward;
        return c;
      }
      if (roll < 0.86) {
        c.direction = -toward; // 退一步，引對手出手
        if (roll > 0.82) c.dash = -toward;
      } else c.guard = me.hp < rival.hp || roll > 0.93;
      return c;
    }
  }

  game.Brain = Brain;
})();
