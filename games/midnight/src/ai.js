/* 檔案導讀：電腦對手的「大腦」。match.js 每一幀呼叫 controls(dt)，
   回傳和玩家按鍵相同格式的輸入，所以電腦用的規則和玩家完全一樣。

   思考分成三層，越上面越優先：
     1. 反射   被抓住時拆投、被連段時爆氣、打中後接連段
     2. 反應   看到對手出招或飛行道具後，隔一段「反應時間」才防禦、閃避或反擊
     3. 戰術   每隔一小段時間決定接下來要做什麼（懲罰破綻、對空、拉近或拉開距離、
               投技破防、上下段擇一…）

   難度（roster.js 的 DIFFICULTY）決定反應時間、防禦與懲罰的成功率、多常想一次。
   另外會記住對手的習慣（常跳、常防、常丟飛行道具、常投），慢慢調整對策。 */
(() => {
  const game = globalThis.Midnight;
  const { FIELD, BURST_COST } = game;
  const NONE = { direction: 0, crouch: false, guard: false, actions: [] };

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
        light: ["heavy"],
        heavy: ["special", "skill2"],
        special: ["super"],
        skill2: ["super"],
      },
      lunge: "special",
      lungeReach: 320,
      antiAir: "skill2",
      superReach: 300,
    },
    frost: {
      zone: true,
      chain: { light: ["heavy"], heavy: ["special"], special: ["super"] },
      superReach: 900,
    },
    lion: {
      chain: {
        light: ["heavy"],
        heavy: ["skill2", "special"],
        skill2: ["super"],
        special: ["super"],
      },
      lunge: "skill2",
      lungeReach: 300,
      shot: "special",
      superReach: 250,
    },
    shade: {
      chain: { light: ["heavy"], heavy: ["special"], special: ["super"] },
      lunge: "special",
      lungeReach: 330,
      counter: "skill2",
      superReach: 380,
    },
  };

  // 一招最遠打得到多遠（含出招時往前衝的距離）；飛行道具與陷阱當成全場
  function reach(spec) {
    let best = 0;
    for (const event of spec.events) {
      if (event.projectile || event.trap) return 900;
      best = Math.max(best, event.range ?? 0, event.grab ?? 0);
      if (event.blink && event.blink < 9000) best = Math.max(best, event.blink);
    }
    const travel = spec.travel
      ? spec.travel.speed * (spec.travel.until - (spec.travel.from ?? 0))
      : 0;
    return best + travel * 0.8;
  }

  // 最後一次會造成傷害的時間點（過了這一刻，這一招就只剩收招）
  function lastHit(spec) {
    let at = 0;
    for (const event of spec.events)
      if (event.damage || event.toss || event.grab) at = Math.max(at, event.at);
    return at;
  }

  class Brain {
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
        rival.crouch ||
          rival.move?.action === "sweep" ||
          rival.move?.lowAttack,
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
      if (rival.jumping && !this.sawJump) habits.jump += 1;
      this.sawJump = rival.jumping;

      const move = rival.move;
      if (!move) this.seenMove = null;
      else if (move !== this.seenMove) {
        this.seenMove = move;
        if (move.action === "throw") habits.throw += 1;
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

    reactDelay() {
      const [min, max] = this.level.reactTime;
      return min + (max - min) * this.roll();
    }

    // 對手出招了：打得到我的話，擲骰決定要不要反應、多久之後反應
    noticeMove(move, now) {
      const { level } = this;
      const { spec } = move;
      if (spec.events.some((event) => event.projectile || event.trap)) return;
      if (this.distance() > reach(spec) + 90) return;
      const block = Math.min(0.95, level.guard * 1.9 + 0.08);
      if (this.roll() > block) return;
      const impact = game.firstActive(spec) - move.elapsed;
      let delay = this.reactDelay();
      // 高難度偶爾會抓準時機，在攻擊到來的前一刻才舉手，打出精準防禦
      if (this.roll() < level.perfect && impact - 0.1 > delay)
        delay = impact - 0.1;
      this.reaction = { at: now + delay, move };
    }

    /* ---------- 反應：時間到了就防禦、閃避或反擊 ---------- */
    react(now) {
      const r = this.reaction;
      if (!r || now < r.at) return null;
      this.reaction = null;
      const { me, rival, kit, level } = this;
      const busy =
        me.move || me.dodge || me.stun > 0 || me.y > 0 || me.heldBy;
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
      if (move.elapsed > lastHit(move.spec) + 0.02) return null;
      const close = this.distance() < 150;

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
      return { ...NONE, guard: true, crouch: this.guardLow() };
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
      const options = [...(kit.chain[move.action] ?? [])];
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

      const reflex = this.react(now);
      if (reflex) return reflex;

      // 防禦中：對手收招、也沒有飛行道具了，就提早放下
      if (this.guardUntil > now) {
        if (!rival.move && !this.incoming(0.3))
          this.guardUntil = Math.min(this.guardUntil, now + 0.05);
        return { ...NONE, guard: true, crouch: this.guardLow() };
      }

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
      const c = { direction: 0, crouch: false, guard: false, actions: [] };
      if (me.move || me.dodge || me.stun > 0) return c;

      const d = this.distance();
      const toward = this.toward();
      const roll = this.roll();
      const aggression = level.aggression;
      const press = (action) => {
        c.actions.push(action);
        return c;
      };

      // 人在空中：靠近了就出腳
      if (me.y > 0) {
        if (d < 190 && me.vy < 150 && roll < 0.65 * aggression)
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
      if (recovering > 0.1 && roll < level.punish)
        return this.punish(c, d, toward, recovering);

      // 2. 對手還在硬直：追打，把連段接下去
      if (rival.stun > 0.12 && roll < level.confirm + 0.25) {
        if (me.meter >= 100 && d < kit.superReach && rival.stun > 0.2)
          return press("super");
        if (d <= 140) return press("light");
        if (d <= 205) return press("heavy");
      }

      // 3. 對空：對手從空中壓過來
      if (rival.y > 40 && rival.vy < 220 && d < 250) {
        const wary = level.antiAir + Math.min(0.2, habits.jump * 0.05);
        if (roll < wary) {
          if (kit.antiAir && this.ready(kit.antiAir) && d < 175)
            return press(kit.antiAir);
          if (d < 190 && rival.y < 180) return press("heavy");
          c.guard = true; // 來不及打下來就站著防（跳躍攻擊不能蹲防）
          this.guardUntil = now + 0.32;
          return c;
        }
      }

      // 4. 大招：有把握才放，不亂丟
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
      if (rival.guard && d < 118 && !rm) {
        if (roll < 0.3 + level.confirm * 0.3 + habits.guard * 0.3)
          return press("throw");
        if (!rival.crouch && roll < 0.75) {
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
      if (d <= 140) {
        const big = me.meter >= 100 && time > 0.3 && d < kit.superReach;
        const sure = big && this.roll() < this.level.confirm;
        c.actions.push(sure ? "super" : "light");
      } else if (d <= 205 && time > 0.2) c.actions.push("heavy");
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
      if (d < 230) {
        if (grounded && this.ready("skill2") && roll < 0.4)
          c.actions.push("skill2"); // 在對手腳下放陷阱，逼他離開
        else if (d < 165 && roll < 0.4 + 0.25 * aggression)
          c.actions.push(d < 137 && roll < 0.25 ? "light" : "heavy");
        else if (!cornered) {
          c.direction = -toward;
          if (roll > 0.6) c.dash = -toward;
        } else c.guard = true;
        return c;
      }
      if (grounded && this.ready("special") && roll < 0.55 * aggression + 0.2)
        c.actions.push("special");
      else if (this.ready("skill2") && roll > 0.55) c.actions.push("skill2");
      else if (d < 420 && !cornered) c.direction = -toward;
      else if (d > 780) c.direction = toward;
      return c;
    }

    // 近戰型：拉近距離，在中距離試探，貼身後用輕重攻擊、下段與投技混著打
    brawl(c, d, toward, roll) {
      const { me, rival, kit, level, habits } = this;
      const aggression = level.aggression;
      const press = (action) => {
        c.actions.push(action);
        return c;
      };

      if (d > 215) {
        // 遠距離：貼地飛行道具、突進技，或是走過去
        const grounded = rival.y === 0;
        const canShoot = kit.shot && this.ready(kit.shot) && grounded;
        if (canShoot && d < 420 && roll > 0.55) return press(kit.shot);
        // 高難度比較不會亂衝
        const rash = 0.3 * aggression * (1 - level.punish * 0.4);
        const canLunge = kit.lunge && this.ready(kit.lunge);
        if (canLunge && d < kit.lungeReach && roll < rash)
          return press(kit.lunge);
        c.direction = toward;
        // 對手愛丟飛行道具就多跳，否則用衝刺拉近
        const hop = 0.06 + Math.min(0.25, habits.shot * 0.08);
        if (d > 235 && d < 420 && roll > 1 - hop) press("jump");
        else if (d > 330 && roll < 0.3 * aggression) c.dash = toward;
        return c;
      }

      if (d > 150) {
        // 中距離：用重攻的尖端試探，或進一步、退一步引對手揮空
        if (roll < 0.34 * aggression) return press("heavy");
        if (d < 168 && roll < 0.42) {
          c.crouch = true;
          return press("heavy"); // 掃腿
        }
        if (roll < 0.66) c.direction = toward;
        else if (roll < 0.86) c.direction = -toward;
        else c.guard = true;
        return c;
      }

      // 貼身
      if (roll < 0.4 * aggression) return press("light");
      if (roll < 0.55 * aggression) return press("heavy");
      if (roll < 0.66) {
        c.crouch = true;
        return press(roll < 0.6 ? "light" : "heavy"); // 蹲踢或掃腿
      }
      if (roll < 0.74 && !rival.move) return press("throw");
      if (roll < 0.86) {
        c.direction = -toward; // 退一步，引對手出手
        if (roll > 0.82) c.dash = -toward;
      } else c.guard = me.hp < rival.hp || roll > 0.93;
      return c;
    }
  }

  game.Brain = Brain;
})();
