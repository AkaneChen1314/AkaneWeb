/* 檔案導讀：把一場對戰畫到畫布上。角色動作在 animation.js、背景在 stage.js、
   招式特效在 effects.js；這裡負責鏡頭、震動、殘影、倒影、影子、字幕，
   以及把遊戲事件轉成畫面上的反應。 */
(() => {
  const game = globalThis.Midnight;
  const { FIELD } = game;
  const { width, height, ground } = FIELD;
  const GOLD = "#ffd274";
  const ICE = "#9feaff";
  const WHITE = "#fff8e4";
  const CAPTION_FONT =
    '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
  const MAX_ZOOM = 1.4;
  const FLOOR = ground * 0.955; // 拉近時地面在畫面上的高度（讓出下方資訊列）
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
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.motion = matchMedia("(prefers-reduced-motion: reduce)");
      /* 解析度倍率：遊戲內部一律用 1280×720 的座標，畫布實際的像素可以更多。
         高解析度螢幕的電腦用 1.5 倍（1920×1080），角色與文字的邊緣比較銳利；
         手機與平板維持 1 倍，把效能留給特效。 */
      const dense = (window.devicePixelRatio || 1) >= 1.5;
      const wide = window.innerWidth * (window.devicePixelRatio || 1) >= 1600;
      const touch = matchMedia("(pointer: coarse)").matches;
      this.spriteRes = dense && wide && !touch ? 1.5 : 1;
      this.setScale(this.spriteRes);
      this.effects = new game.CombatEffects(this.motion);
      this.effects.ghost = (fighter, life, color, x) =>
        this.ghost(fighter, life, color, x);
      this.bloomLayers = this.makeBloomLayers();
      this.lite = false; // 畫面跟不上時 app.js 會打開，省掉泛光
      this.ghosts = [];
      this.reset();
      this.ready = Promise.all([
        loadImage("assets/rooftop.jpg"),
        loadImage("assets/fighters.png"),
      ]).then(([stage, atlas]) => {
        const res = this.spriteRes;
        this.animation = new game.FighterAnimation(atlas, res);
        this.stage = new game.Stage(stage);
        this.vignette = this.makeVignette();
      });
    }

    // 改變畫布實際的像素數（畫面跟不上時 app.js 會把它調回 1 倍）
    setScale(scale) {
      this.scale = scale;
      this.canvas.width = Math.round(width * scale);
      this.canvas.height = Math.round(height * scale);
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

    /* 泛光用的小畫布：一張比一張小，縮小就等於模糊。 */
    makeBloomLayers() {
      return [4, 8, 16].map((divide) => {
        const canvas = document.createElement("canvas");
        canvas.width = width / divide;
        canvas.height = height / divide;
        return canvas.getContext("2d", { alpha: false });
      });
    }

    /* 泛光：把整張畫面縮小，用相乘把暗的地方壓黑、只留下亮的，
       模糊之後加回去。特效越亮，泛光越強。 */
    bloom() {
      if (this.calm || this.lite) return;
      const [first, ...rest] = this.bloomLayers;
      const { canvas } = first;
      first.globalCompositeOperation = "copy";
      first.drawImage(this.canvas, 0, 0, canvas.width, canvas.height);
      first.globalCompositeOperation = "multiply";
      first.drawImage(canvas, 0, 0);
      let source = canvas;
      for (const layer of rest) {
        layer.drawImage(source, 0, 0, layer.canvas.width, layer.canvas.height);
        source = layer.canvas;
      }
      const { ctx } = this;
      const power = 0.1 + this.effects.skills.energy * 0.26;
      ctx.save();
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingQuality = "low";
      for (const layer of this.bloomLayers.slice(1)) {
        ctx.globalAlpha = power;
        ctx.drawImage(layer.canvas, 0, 0, width, height);
      }
      ctx.restore();
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
      this.stage?.reset();
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
      const anim = this.animation;
      if (anim) this.aimEffects(event, anim);
      this.effects.cue(event);
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
          anim?.hurt(
            fighter,
            event.finisher ? 1 : heavy ? 0.7 : 0.3,
            (event.height - fighter.y) / fighter.profile.size,
          );
          anim?.flash(fighter, "#ffffff");
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
            this.flash("#ffffff", event.action === "super" ? 0.2 : 0.08);
            this.zoomKick = 0.045;
          }
          if (event.ko) {
            this.flash("#ffffff", 0.6);
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
          anim?.flash(fighter, "#ffb08a");
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
          anim?.land(fighter, fighter.stun > 0);
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
          anim?.snapFace(fighter);
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
        case "rush":
          anim?.kick(fighter, { sx: 2.4, sy: -1.6 });
          this.ghost(fighter, 0.2, fighter.profile.color);
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

    // 把特效對準角色畫面上真正的拳頭與腳
    aimEffects(event, anim) {
      const { fighter } = event;
      if (event.type === "swing" && !event.strike.radial) {
        event.path = anim.swingPath(fighter, event.strike.at);
        // 記下這一擊的高度，打中時火花才會出現在拳頭或腳的位置
        fighter.tipHeight = null;
        if (event.path) {
          const { points } = event.path;
          fighter.tipHeight = fighter.y + points[points.length - 1][1];
        }
      }
      const tip = event.attacker?.tipHeight;
      if (event.melee && tip) {
        const top = fighter.y + fighter.profile.size * 0.88;
        event.height = Math.max(fighter.y + 24, Math.min(top, tip));
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

    // 殘影：把現在的姿勢染色存成一張圖
    ghost(fighter, life, color, x = null) {
      if (this.calm || !this.animation) return;
      // 事件比動畫早一步，先更新姿勢，殘影才會是新動作的樣子
      const state = this.animation.update(fighter, 0, true);
      this.ghosts.push({
        canvas: this.animation.snapshot(fighter, state, color),
        x: x ?? fighter.x,
        y: ground - fighter.y,
        face: fighter.face,
        ox: state.ox.x,
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
        move?.rush ||
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

    update(dt, real = dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - 55 * dt);
      this.zoomKick = Math.max(0, this.zoomKick - 0.25 * dt);
      this.screenFlash.alpha = Math.max(0, this.screenFlash.alpha - 3.2 * real);
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

    /* 鏡頭：兩人靠近就拉近、拉開就退遠，地面固定在畫面上差不多的高度；
       有人跳得高時往上讓一點，大招與 K.O. 則對準那一位。 */
    updateCamera(dt, fighters) {
      const cam = this.camera;
      const [a, b] = fighters;
      let rate = 4.5;
      let target;
      if (this.calm) target = { x: width / 2, y: height / 2, zoom: 1 };
      else if (this.focus) {
        const { x, y, zoom } = this.focus;
        target = { x, y, zoom: zoom + this.zoomKick };
        rate = 10;
      } else {
        const gap = Math.abs(a.x - b.x);
        const high = Math.max(a.y, b.y);
        const fit = width / (gap + 470 + high * 0.6);
        const zoom = Math.max(1, Math.min(MAX_ZOOM, fit));
        target = {
          x: (a.x + b.x) / 2,
          y: ground - (FLOOR - height / 2) / zoom - high * 0.3,
          zoom: zoom + this.zoomKick,
        };
        if (zoom < cam.zoom) rate = 7; // 快跑出畫面時退遠要快一點
      }
      const k = 1 - Math.exp(-rate * dt);
      cam.zoom += (target.zoom - cam.zoom) * k;
      cam.x += (target.x - cam.x) * k;
      cam.y += (target.y - cam.y) * k;
      const halfW = width / 2 / cam.zoom;
      const halfH = height / 2 / cam.zoom;
      cam.x = Math.min(width - halfW, Math.max(halfW, cam.x));
      cam.y = Math.min(height - halfH, Math.max(halfH, cam.y));
    }

    // 把畫布移到鏡頭的位置
    aimCamera(shakeX, shakeY) {
      const { ctx, camera } = this;
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(shakeX - camera.x, shakeY - camera.y);
    }

    /* alpha 是這一格落在前後兩步規則之間的位置（0～1），step 是一步的秒數。
       位置、出招進度與飛行道具都用它補間，畫面更新率比規則快也不會頓。
       real 是真正過了幾秒（K.O. 慢動作時 dt 會比較小）。 */
    draw(match, dt, alpha = 1, step = 0, real = dt) {
      const { ctx } = this;
      if (!this.animation) return;
      const frozen = match.hitStop > 0;
      const lag = frozen ? 0 : (1 - alpha) * step;
      for (const shot of match.projectiles)
        shot.drawX = shot.previousX + (shot.x - shot.previousX) * alpha;
      this.update(dt, real);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      const fighters = match.fighters.map((fighter) => {
        const state = this.animation.update(fighter, dt, frozen, match, lag);
        if (!frozen) this.trail(fighter, dt);
        return {
          ...fighter,
          animationState: state,
          x: fighter.previousX + (fighter.x - fighter.previousX) * alpha,
          y: fighter.previousY + (fighter.y - fighter.previousY) * alpha,
        };
      });
      this.effects.update(dt, fighters, match);
      this.stage.update(dt, this.calm);
      this.lightFighters(fighters);
      this.updateCamera(dt, fighters);

      const shake = this.calm ? 0 : this.shake;
      const shakeX = Math.sin(this.time * 113) * shake;
      const shakeY = Math.cos(this.time * 91) * shake * 0.5;
      ctx.save();
      this.aimCamera(shakeX, shakeY);
      this.stage.draw(ctx, this.calm);
      this.effects.behind(ctx, fighters);
      for (const fighter of fighters) this.drawShadow(fighter);
      if (!this.calm)
        for (const fighter of fighters) this.drawReflection(fighter);
      this.drawGhosts();
      // 定格時被打的人微微顫抖，打擊感比較重
      for (const fighter of fighters) {
        const tremble =
          frozen && fighter.flash > 0 && !this.calm
            ? Math.sin(this.time * 160) * 5
            : 0;
        this.drawFighter(fighter, tremble);
      }
      this.effects.front(ctx, fighters, match);
      ctx.restore();
      this.bloom();
      ctx.save();
      this.aimCamera(shakeX, shakeY);
      for (const item of this.callouts) this.drawCaption(item);
      if (match.profiles[0] === match.profiles[1]) {
        this.drawMarker(fighters[0], "1P", GOLD);
        this.drawMarker(fighters[1], match.cpu ? "CPU" : "2P", ICE);
      }
      ctx.restore();

      this.effects.skills.draw(ctx, "screen", fighters);
      // 四周永遠壓暗一點點，視線會集中在中間的兩個人
      ctx.globalAlpha = Math.max(
        0.3,
        this.vignetteAlpha,
        match.phase === "round-end" ? 0.6 : 0,
      );
      ctx.drawImage(this.vignette, 0, 0);
      ctx.globalAlpha = 1;
      if (this.screenFlash.alpha > 0) {
        ctx.globalAlpha = this.screenFlash.alpha;
        ctx.fillStyle = this.screenFlash.color;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    }

    // 場景打在角色身上的光；有人放招或打中時，雙方都會被那個顏色照亮
    lightFighters(fighters) {
      const flash = this.effects.lightSource(fighters);
      for (const fighter of fighters) {
        const light = this.stage.lightAt(fighter.x);
        if (flash) {
          // warm 是畫面左側、cool 是畫面右側的光
          const key = flash.x > fighter.x ? "cool" : "warm";
          light[key] = light[key].map(
            (value, i) => value + (flash.color[i] * 1.5 - value) * flash.power,
          );
        }
        fighter.animationState.light = light;
      }
    }

    // 腳下的影子：一大片很淡的影子，加上兩隻腳踩到的地方比較深
    drawShadow(fighter) {
      const { ctx } = this;
      const state = fighter.animationState;
      const { size } = fighter.profile;
      const lying = fighter.hp === 0 && fighter.y === 0 ? 1.6 : 1;
      const x = fighter.x + state.ox.x * fighter.face;
      ctx.save();
      ctx.fillStyle = "#05070d";
      const wide = Math.max(26, (size * 0.36 - fighter.y * 0.12) * lying);
      const fade = 0.5 - Math.min(0.34, fighter.y / 600);
      for (const [scale, alpha] of [
        [1.2, 0.35],
        [0.95, 0.5],
        [0.7, 0.6],
      ]) {
        ctx.globalAlpha = fade * alpha;
        ctx.beginPath();
        ctx.ellipse(x, ground + 4, wide * scale, 13 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (fighter.hp > 0)
        for (const [fx, fy] of this.animation.feet(fighter, state)) {
          const lift = Math.max(0, fighter.y + fy - 8);
          if (lift > 70) continue;
          ctx.globalAlpha = 0.6 * (1 - lift / 70);
          ctx.beginPath();
          ctx.ellipse(
            x + fx * fighter.face,
            ground + 3,
            25 - lift * 0.12,
            6,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      ctx.restore();
    }

    // 濕地板上的倒影：把角色上下顛倒畫在腳下，很淡、只出現在地面以下
    drawReflection(fighter) {
      const { ctx } = this;
      if (fighter.y > 260) return;
      const state = fighter.animationState;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, ground + 2, width, height - ground);
      ctx.clip();
      ctx.globalAlpha = 0.17 * (1 - fighter.y / 260);
      // 以地面線為軸上下翻轉；角色離地越高，倒影離地面線越遠
      ctx.translate(0, (ground + 4) * 2);
      ctx.scale(1, -1);
      const y = ground - fighter.y;
      this.animation.transform(ctx, fighter, state, fighter.x, y);
      this.animation.draw(ctx, fighter, state);
      ctx.restore();
    }

    drawGhosts() {
      const { ctx } = this;
      const { x: originX, y: originY } = game.FighterAnimation.ORIGIN;
      const size = game.FighterAnimation.SIZE;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const ghost of this.ghosts) {
        ctx.save();
        ctx.globalAlpha = 0.55 * (ghost.life / ghost.total) ** 1.4;
        ctx.translate(ghost.x + ghost.ox * ghost.face, ghost.y);
        ctx.scale(ghost.face, 1);
        ctx.drawImage(
          ghost.canvas,
          -originX,
          -originY,
          size.width,
          size.height,
        );
        ctx.restore();
      }
      ctx.restore();
    }

    drawFighter(fighter, tremble = 0) {
      const { ctx } = this;
      const state = fighter.animationState;
      ctx.save();
      // 落地起身的短暫無敵：一閃一閃
      if (fighter.safe > 0 && fighter.hp > 0)
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 48);
      this.animation.transform(
        ctx,
        fighter,
        state,
        fighter.x + tremble,
        ground - fighter.y,
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

    // 防禦時身前有一道淡淡的光弧，看得出正在擋
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
