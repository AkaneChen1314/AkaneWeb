(() => {
  const game = globalThis.Midnight;
  const { FIELD } = game;
  const { width, height, ground } = FIELD;
  const GOLD = "#ffd274";
  const ICE = "#9feaff";
  const WHITE = "#fff8e4";
  const CAPTION_FONT =
    '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
  const SHAKE = { light: 3, heavy: 6, special: 8, skill2: 8, super: 9 };

  function loadImage(url) {
    const image = new Image();
    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`無法載入 ${url}`));
      image.src = url;
    });
  }

  class Renderer {
    constructor(canvas) {
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.motion = matchMedia("(prefers-reduced-motion: reduce)");
      this.effects = new game.CombatEffects(this.motion);
      this.ghosts = [];
      this.reset();
      this.ready = Promise.all([
        loadImage("assets/rooftop.jpg"),
        loadImage("assets/fighters.png"),
        loadImage("assets/walk.png"),
      ]).then(([stage, atlas, walkAtlas]) => {
        this.animation = new game.FighterAnimation(atlas, walkAtlas);
        this.background = document.createElement("canvas");
        this.background.width = width;
        this.background.height = height;
        this.background.getContext("2d").drawImage(stage, 0, 0, width, height);
        this.vignette = this.makeVignette();
      });
    }

    makeVignette() {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.35,
        width / 2,
        height / 2,
        width * 0.7,
      );
      gradient.addColorStop(0, "#00000000");
      gradient.addColorStop(1, "#000000d0");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return canvas;
    }

    reset() {
      this.effects.reset();
      this.time = 0;
      this.shake = 0;
      for (const ghost of this.ghosts) this.animation?.release(ghost.canvas);
      this.ghosts = [];
      this.callouts = [];
      this.camera = { x: width / 2, y: height / 2, zoom: 1 };
      this.focus = null;
      this.zoomKick = 0;
      this.screenFlash = { alpha: 0, color: "#ffffff" };
      this.vignetteAlpha = 0;
    }

    get calm() {
      return this.motion.matches;
    }

    flash(color, alpha) {
      const limited = this.calm ? Math.min(alpha, 0.15) : alpha;
      if (limited >= this.screenFlash.alpha)
        this.screenFlash = { color, alpha: limited };
    }

    focusOn(x, y, zoom, duration) {
      this.focus = { x, y, zoom, time: duration };
    }

    cue(event) {
      const { fighter } = event;
      this.effects.cue(event);
      const anim = this.animation;
      switch (event.type) {
        case "round":
          this.reset();
          break;
        case "attack":
          if (
            event.name &&
            event.action !== "super" &&
            !["sweep", "throw"].includes(event.action)
          )
            this.caption(
              fighter.x,
              ground - fighter.profile.size - 40,
              event.name,
              fighter.profile.color,
              26,
              0.7,
              "name",
            );
          break;
        case "super-flash":
          this.focusOn(fighter.x, ground - fighter.y - 140, 1.22, 0.5);
          this.flash(fighter.profile.color, 0.35);
          this.vignetteAlpha = 1;
          break;
        case "hit": {
          const heavy = event.action !== "light";
          this.shake = Math.max(
            this.shake,
            (SHAKE[event.action] ?? 4) +
              (event.finisher ? 5 : 0) +
              (event.counterHit ? 3 : 0),
          );
          this.number(
            fighter.x - event.direction * 10,
            ground - event.height - 40,
            event.damage,
            event.attacker.profile.color,
            event.damage >= 15,
          );
          anim?.kick(fighter, {
            ox: -(heavy ? 520 : 320),
            rot: -(heavy ? 9 : 5),
            sx: -1.5,
            sy: -1.2,
          });
          if (event.counterHit)
            this.caption(
              fighter.x,
              ground - fighter.profile.size - 70,
              "反擊！",
              "#ff6b7f",
              36,
              0.8,
              "big",
            );
          if (event.mixup)
            this.caption(
              fighter.x,
              ground - fighter.profile.size - 30,
              event.mixup === "low" ? "下段！" : "中段！",
              "#ffb36b",
              30,
              0.7,
              "big",
            );
          if (event.action === "throw") this.shake = Math.max(this.shake, 9);
          if (event.finisher) {
            this.flash("#ffffff", 0.28);
            this.zoomKick = 0.045;
          }
          if (event.ko) {
            this.flash("#ffffff", 0.85);
            this.shake = 16;
            this.focusOn(fighter.x, ground - 150, 1.28, 1.25);
          }
          break;
        }
        case "block":
          this.caption(
            fighter.x,
            ground - event.height - 54,
            "防禦",
            ICE,
            23,
            0.42,
          );
          anim?.kick(fighter, { ox: -260, rot: -3 });
          this.shake = Math.max(this.shake, 1.5);
          break;
        case "armor":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 40,
            "霸體",
            "#ffb08a",
            26,
            0.5,
            "big",
          );
          this.number(
            fighter.x,
            ground - event.height - 40,
            event.damage,
            event.attacker.profile.color,
            false,
          );
          anim?.kick(fighter, { ox: -120, sx: 1.2, sy: -1 });
          this.shake = Math.max(this.shake, 4);
          break;
        case "perfect":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 50,
            "精準防禦！",
            "#bff4ff",
            32,
            0.8,
            "big",
          );
          this.flash("#bff4ff", 0.22);
          anim?.kick(fighter, { sx: 1.5, sy: 1 });
          break;
        case "guard-break":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 70,
            "破防！",
            "#ff9d6b",
            38,
            0.8,
            "big",
          );
          this.flash("#ff9d6b", 0.25);
          this.shake = Math.max(this.shake, 9);
          break;
        case "counter":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 50,
            "影返！",
            "#e3c2ff",
            40,
            0.9,
            "big",
          );
          this.flash("#c98cff", 0.4);
          this.focusOn(fighter.x, ground - 140, 1.15, 0.32);
          this.ghost(fighter, 0.35, "#c98cff");
          break;
        case "land":
          anim?.kick(fighter, {
            sy: event.heavy ? -6 : -3.6,
            sx: event.heavy ? 4 : 2.6,
          });
          if (event.heavy) this.shake = Math.max(this.shake, 8);
          break;
        case "jump":
          anim?.kick(fighter, { sy: 3, sx: -1.8 });
          break;
        case "rise":
          anim?.kick(fighter, { sy: 3.5, sx: -2 });
          break;
        case "dodge":
          this.ghost(fighter, 0.25, ICE);
          break;
        case "blink":
          this.ghost(fighter, 0.34, fighter.profile.color, event.from);
          break;
        case "evaded":
          this.caption(
            fighter.x,
            ground - event.height - 62,
            "閃過",
            ICE,
            25,
            0.5,
            "big",
          );
          break;
        case "unavailable":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 24,
            event.text,
            WHITE,
            19,
            0.52,
          );
          break;
        case "dash":
          anim?.kick(fighter, { sx: event.forward ? 2.2 : -1, sy: -1.4 });
          break;
        case "grab":
          anim?.kick(event.target, { ox: 160, rot: -4 });
          this.shake = Math.max(this.shake, 3);
          break;
        case "tech":
          this.caption(
            (fighter.x + event.attacker.x) / 2,
            ground - fighter.profile.size - 40,
            "拆投！",
            ICE,
            34,
            0.7,
            "big",
          );
          this.flash("#bff4ff", 0.18);
          anim?.kick(fighter, { ox: -300, rot: -4 });
          anim?.kick(event.attacker, { ox: -300, rot: -4 });
          break;
        case "burst":
          this.caption(
            fighter.x,
            ground - fighter.profile.size - 50,
            "爆氣！",
            fighter.profile.color,
            40,
            0.8,
            "big",
          );
          this.flash(fighter.profile.color, 0.35);
          this.shake = Math.max(this.shake, 8);
          this.focusOn(fighter.x, ground - 140, 1.1, 0.25);
          break;
        case "clash":
          this.shake = Math.max(this.shake, 5);
          this.flash("#ffffff", 0.18);
          break;
        case "erupt":
          this.shake = Math.max(this.shake, 5);
          break;
      }
    }

    caption(x, y, text, color, size, life, style = "plain") {
      this.callouts = this.callouts.filter(
        (item) => item.text !== text || Math.abs(item.x - x) > 80,
      );
      this.callouts.push({
        x,
        y,
        text,
        color,
        size,
        life,
        total: life,
        style,
        drift: style === "number" ? 70 : 34,
      });
      if (this.callouts.length > 18) this.callouts.shift();
    }

    number(x, y, value, color, big) {
      if (!value) return;
      this.callouts.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        text: String(value),
        color: big ? GOLD : WHITE,
        edge: color,
        size: big ? 34 : 24,
        life: 0.7,
        total: 0.7,
        style: "number",
        drift: 80,
      });
    }

    // Afterimage: a tinted snapshot of the fighter's current pose.
    ghost(fighter, life, color, x = null) {
      if (this.calm || !this.animation) return;
      // Events fire before the next animation update; sync the pose so the snapshot
      // shows the new action (e.g. the dodge crouch) instead of the previous stance.
      const state = this.animation.update(fighter, 0, true);
      this.ghosts.push({
        canvas: this.animation.snapshot(fighter, state, color),
        x: x ?? fighter.x,
        y: ground - fighter.y,
        face: fighter.face,
        ox: state.ox.x,
        oy: state.oy.x,
        rot: state.rot.x,
        sx: state.sx.x,
        sy: state.sy.x,
        life,
        total: life,
      });
      if (this.ghosts.length > 16)
        this.animation.release(this.ghosts.shift().canvas);
    }

    trail(fighter, dt) {
      const move = fighter.move;
      const travel = move?.spec.travel;
      const dashing =
        fighter.dodge ||
        fighter.dash ||
        (travel &&
          move.elapsed >= (travel.from ?? 0) &&
          move.elapsed < travel.until) ||
        (move?.drift && fighter.y > 0) ||
        (move?.action === "super" && move.next > 0) ||
        (fighter.stun > 0 && Math.abs(fighter.knock) > 250);
      const state = this.animation.state(fighter);
      if (!dashing) {
        state.ghostTimer = 0;
        return;
      }
      state.ghostTimer -= dt;
      if (state.ghostTimer <= 0) {
        state.ghostTimer = 0.035;
        this.ghost(fighter, 0.22, fighter.dodge ? ICE : fighter.profile.color);
      }
    }

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - 55 * dt);
      this.zoomKick = Math.max(0, this.zoomKick - 0.25 * dt);
      this.screenFlash.alpha = Math.max(0, this.screenFlash.alpha - 3.2 * dt);
      this.vignetteAlpha = Math.max(0, this.vignetteAlpha - 1.6 * dt);
      for (const item of this.ghosts) item.life -= dt;
      for (const item of this.callouts) item.life -= dt;
      for (const ghost of this.ghosts)
        if (ghost.life <= 0) this.animation.release(ghost.canvas);
      this.ghosts = this.ghosts.filter((item) => item.life > 0);
      this.callouts = this.callouts.filter((item) => item.life > 0);
      if (this.focus) this.focus.time -= dt;
      if (this.focus?.time <= 0) this.focus = null;
    }

    updateCamera(dt, fighters) {
      const cam = this.camera;
      let target = { x: width / 2, y: height / 2, zoom: 1 + this.zoomKick };
      if (this.calm) target.zoom = 1;
      else if (this.focus)
        target = {
          x: this.focus.x,
          y: this.focus.y,
          zoom: this.focus.zoom + this.zoomKick,
        };
      else {
        // Lean slightly toward the action and tighten when fighters are close.
        const mid = (fighters[0].x + fighters[1].x) / 2;
        const gap = Math.abs(fighters[0].x - fighters[1].x);
        target.zoom += Math.max(0, (420 - gap) / 420) * 0.05;
        target.x = width / 2 + (mid - width / 2) * 0.35;
        target.y = height / 2 + 20;
      }
      const rate = 1 - Math.exp(-(target.zoom > cam.zoom ? 10 : 4) * dt);
      cam.zoom += (target.zoom - cam.zoom) * rate;
      cam.x += (target.x - cam.x) * rate;
      cam.y += (target.y - cam.y) * rate;
      const halfW = width / 2 / cam.zoom;
      const halfH = height / 2 / cam.zoom;
      cam.x = Math.min(width - halfW, Math.max(halfW, cam.x));
      cam.y = Math.min(height - halfH, Math.max(halfH, cam.y));
    }

    draw(match, dt, alpha = 1) {
      const { ctx } = this;
      if (!this.animation) return;
      const frozen = match.hitStop > 0;
      this.update(dt);
      const fighters = match.fighters.map((fighter) => {
        const state = this.animation.update(fighter, dt, frozen);
        if (!frozen) this.trail(fighter, dt);
        return {
          ...fighter,
          animationState: state,
          x: fighter.previousX + (fighter.x - fighter.previousX) * alpha,
          y: fighter.previousY + (fighter.y - fighter.previousY) * alpha,
        };
      });
      this.effects.update(dt, fighters, match);
      this.updateCamera(dt, fighters);

      const cam = this.camera;
      const shake = this.calm ? 0 : this.shake;
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(
        -cam.x + Math.sin(this.time * 113) * shake,
        -cam.y + Math.cos(this.time * 91) * shake * 0.5,
      );
      ctx.drawImage(this.background, 0, 0);
      this.effects.behind(ctx, fighters, match);
      for (const fighter of fighters) this.drawShadow(fighter);
      this.drawGhosts();
      // The victim trembles during hit-stop to sell the impact.
      for (const fighter of fighters) {
        const tremble =
          frozen && fighter.flash > 0 && !this.calm
            ? Math.sin(this.time * 160) * 4
            : 0;
        this.drawFighter(fighter, tremble);
      }
      this.effects.front(ctx, fighters, match);
      for (const item of this.callouts) this.drawCaption(item);
      if (match.profiles[0] === match.profiles[1]) {
        this.drawMarker(fighters[0], "1P", GOLD);
        this.drawMarker(fighters[1], match.cpu ? "CPU" : "2P", ICE);
      }
      ctx.restore();

      if (this.vignetteAlpha > 0 || match.phase === "round-end") {
        ctx.globalAlpha = Math.max(
          this.vignetteAlpha,
          match.phase === "round-end" ? 0.6 : 0,
        );
        ctx.drawImage(this.vignette, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (this.screenFlash.alpha > 0) {
        ctx.globalAlpha = this.screenFlash.alpha;
        ctx.fillStyle = this.screenFlash.color;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    }

    drawShadow(fighter) {
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.72 - Math.min(0.5, fighter.y / 350);
      ctx.fillStyle = "#070911";
      ctx.beginPath();
      const lying = fighter.hp === 0 && fighter.y === 0 ? 1.5 : 1;
      ctx.ellipse(
        fighter.x,
        ground + 3,
        Math.max(20, (fighter.profile.size * 0.33 - fighter.y * 0.13) * lying),
        10,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    drawGhosts() {
      const { ctx } = this;
      const { x: originX, y: originY } = game.FighterAnimation.ORIGIN;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const ghost of this.ghosts) {
        ctx.save();
        ctx.globalAlpha = 0.55 * (ghost.life / ghost.total) ** 1.4;
        ctx.translate(ghost.x + ghost.ox * ghost.face, ghost.y + ghost.oy);
        ctx.scale(ghost.face * ghost.sx, ghost.sy);
        ctx.rotate(ghost.rot);
        ctx.drawImage(ghost.canvas, -originX, -originY);
        ctx.restore();
      }
      ctx.restore();
    }

    drawFighter(fighter, tremble = 0) {
      const { ctx } = this;
      const state = fighter.animationState;
      const bob =
        this.calm || fighter.y > 0
          ? 0
          : -Math.abs(Math.sin(state.gait * 2)) * 2 * state.walk;
      ctx.save();
      this.animation.transform(
        ctx,
        fighter,
        state,
        fighter.x + tremble,
        ground - fighter.y + bob,
      );
      let glow = null;
      let glowSize = 0;
      if (state.aura > 0.02 && fighter.hp > 0) {
        glow = fighter.profile.color;
        glowSize = state.aura * (14 + Math.sin(this.time * 7) * 6);
      }
      if (
        fighter.move?.spec.armor &&
        fighter.move.elapsed < fighter.move.spec.armor[1]
      ) {
        glow = "#ff9d6b";
        glowSize = 18;
      }
      if (fighter.move?.spec.counter) {
        glow = "#c98cff";
        glowSize = 16 + Math.sin(this.time * 30) * 6;
      }
      this.animation.draw(ctx, fighter, state, { glow, glowSize });
      ctx.restore();
      if (fighter.guard && fighter.hp > 0) this.drawGuard(fighter);
    }

    // Guard no longer uses the crouch sprite, so show a faint barrier to keep it readable.
    drawGuard(fighter) {
      const { ctx } = this;
      const x = fighter.x + fighter.face * 52;
      const y = ground - fighter.y - fighter.profile.size * 0.5;
      const pulse = 0.75 + Math.sin(this.time * 12) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(x, y);
      ctx.scale(fighter.face, 1);
      ctx.strokeStyle = ICE;
      ctx.lineCap = "round";
      for (const [width, alpha] of [
        [9, 0.12],
        [3, 0.55],
      ]) {
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha * pulse;
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, fighter.profile.size * 0.44, 0, -1.25, 1.25);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCaption({ x, y, text, color, edge, size, life, total, style, drift }) {
      const { ctx } = this;
      const age = total - life;
      const pop = this.calm
        ? 1
        : style === "plain"
          ? 1
          : 1 +
            (Math.max(0, 0.12 - age) / 0.12) * (style === "big" ? 0.8 : 0.5);
      ctx.save();
      ctx.font = `${style === "number" ? "italic " : ""}900 ${size}px ${CAPTION_FONT}`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      const half = ctx.measureText(text).width / 2 + 12;
      const px = Math.min(width - half, Math.max(half, x));
      const py = Math.max(
        110,
        y - (this.calm ? 0 : (1 - (life / total) ** 2) * drift),
      );
      ctx.translate(px, py);
      ctx.scale(pop, pop);
      if (style === "big") ctx.rotate(-0.06);
      ctx.globalAlpha = Math.min(1, life * 5);
      ctx.lineWidth = style === "big" ? 9 : 7;
      ctx.strokeStyle = "#101017";
      ctx.strokeText(text, 0, 0);
      if (edge) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = edge;
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    drawMarker(fighter, label, color) {
      const { ctx } = this;
      if (fighter.hp === 0) return;
      ctx.save();
      ctx.font = "900 15px sans-serif";
      ctx.textAlign = "center";
      const y = ground - fighter.y - fighter.profile.size - 12;
      ctx.fillStyle = "#111016";
      ctx.fillRect(fighter.x - 23, y - 17, 46, 22);
      ctx.fillStyle = color;
      ctx.fillText(label, fighter.x, y);
      ctx.restore();
    }
  }

  game.Renderer = Renderer;
})();
