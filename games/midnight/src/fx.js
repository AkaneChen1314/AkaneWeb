/* 檔案導讀：技能與大招的特效。共用的粒子、火花、衝擊波在 effects.js，
   這裡是每一招自己的演出。

   一段演出叫一個「場景」（scene）：有壽命、有畫法，可以跟著某位鬥士走，
   招式被打斷就提早收掉。layer 決定畫在哪一層：
     floor  地面上的裂痕、結霜（角色後面，一般混色）
     back   角色後面的光（相加混色）
     solid  角色前面的實體，例如冰棱（一般混色）
     front  角色前面的光（相加混色）
     screen 不跟著鏡頭的全畫面效果 */
(() => {
  const game = globalThis.Midnight;
  const { width: W, height: H, ground: G } = game.FIELD;
  const TAU = Math.PI * 2;
  const WHITE = "#fff8e4";
  const FIRE = ["#ffd98a", "#ffab3a", "#ff6a22", "#b8321a", "#4a1610"];
  const MAX_SCENES = 90;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const easeOut = (t) => 1 - (1 - t) ** 3;
  // 很快變亮、慢慢變暗
  const pulse = (k, peak = 0.15) =>
    k < peak ? k / peak : (1 - k) / (1 - peak);

  // ---------- 預先畫好、重複使用的小圖 ----------
  class Sprites {
    constructor() {
      this.cache = new Map();
    }

    get(key, width, height, paint) {
      let canvas = this.cache.get(key);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        paint(canvas.getContext("2d"));
        this.cache.set(key, canvas);
      }
      return canvas;
    }

    // 柔邊的光環（衝擊波）
    ring(color) {
      return this.get(`ring${color}`, 256, 256, (ctx) => {
        const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
        g.addColorStop(0, `${color}00`);
        g.addColorStop(0.5, `${color}14`);
        g.addColorStop(0.8, `${color}8c`);
        g.addColorStop(0.87, "#ffffffd0");
        g.addColorStop(0.92, `${color}60`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      });
    }

    // 橫向的鏡頭光條
    streak(color) {
      return this.get(`streak${color}`, 256, 32, (ctx) => {
        ctx.translate(128, 16);
        ctx.scale(1, 0.125);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.16, `${color}e0`);
        g.addColorStop(0.5, `${color}40`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(-128, -128, 256, 256);
      });
    }

    // 從地面往上的光柱，越高越淡
    pillar(color) {
      return this.get(`pillar${color}`, 64, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 64, 0);
        g.addColorStop(0, `${color}00`);
        g.addColorStop(0.28, `${color}66`);
        g.addColorStop(0.5, "#ffffff");
        g.addColorStop(0.72, `${color}66`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 256);
        const fade = ctx.createLinearGradient(0, 0, 0, 256);
        fade.addColorStop(0, "#0000");
        fade.addColorStop(0.5, "#0009");
        fade.addColorStop(0.94, "#000f");
        fade.addColorStop(1, "#0000");
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, 64, 256);
      });
    }

    // 新月形的刀光，凸的那一邊朝右
    crescent(color) {
      return this.get(`crescent${color}`, 256, 256, (ctx) => {
        const g = ctx.createRadialGradient(110, 128, 40, 110, 128, 126);
        g.addColorStop(0, `${color}00`);
        g.addColorStop(0.55, `${color}38`);
        g.addColorStop(0.86, `${color}ee`);
        g.addColorStop(0.95, "#ffffff");
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        const tips = ctx.createRadialGradient(236, 128, 10, 236, 128, 138);
        tips.addColorStop(0, "#000f");
        tips.addColorStop(0.55, "#000c");
        tips.addColorStop(1, "#0000");
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = tips;
        ctx.fillRect(0, 0, 256, 256);
      });
    }

    // 一團不規則的煙
    puff(color) {
      return this.get(`puff${color}`, 128, 128, (ctx) => {
        for (let i = 0; i < 9; i += 1) {
          const a = (i / 9) * TAU;
          const d = i % 3 ? 26 : 8;
          const x = 64 + Math.cos(a) * d;
          const y = 64 + Math.sin(a) * d;
          const r = 26 + (i % 4) * 5;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `${color}66`);
          g.addColorStop(1, `${color}00`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 128, 128);
        }
      });
    }

    // 六角雪花的大法陣
    snowflake(color) {
      return this.get(`snow${color}`, 320, 320, (ctx) => {
        ctx.translate(160, 160);
        ctx.lineCap = "round";
        for (const [width, style] of [
          [9, `${color}30`],
          [4, `${color}90`],
          [1.6, "#ffffff"],
        ]) {
          ctx.lineWidth = width;
          ctx.strokeStyle = style;
          for (let arm = 0; arm < 6; arm += 1) {
            ctx.save();
            ctx.rotate((arm / 6) * TAU);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(146, 0);
            for (const [at, len] of [
              [48, 26],
              [80, 40],
              [112, 26],
            ])
              for (const side of [-1, 1]) {
                ctx.moveTo(at, 0);
                ctx.lineTo(at + len * 0.6, side * len * 0.8);
              }
            ctx.stroke();
            ctx.restore();
          }
          ctx.beginPath();
          for (let i = 0; i <= 6; i += 1) {
            const a = (i / 6) * TAU + TAU / 12;
            ctx.lineTo(Math.cos(a) * 66, Math.sin(a) * 66);
          }
          ctx.stroke();
        }
      });
    }
  }

  class SkillFx {
    constructor(effects) {
      this.fx = effects;
      this.sprites = new Sprites();
      this.reset();
    }

    get calm() {
      return this.fx.calm;
    }

    reset() {
      this.scenes = [];
      this.energy = 0; // 畫面現在有多亮，決定泛光的強度
      this.marks = new WeakMap(); // 震波上一次留下火柱的位置
    }

    boost(amount) {
      this.energy = Math.max(this.energy, amount);
    }

    // ---------- 場景 ----------
    add(life, draw, options = {}) {
      const { delay = 0, layer = "front", ...rest } = options;
      const scene = { age: -delay, life, draw, layer, ...rest };
      this.scenes.push(scene);
      if (this.scenes.length > MAX_SCENES) this.scenes.shift();
      return scene;
    }

    update(dt, fighters, match) {
      this.energy = Math.max(0, this.energy - dt * 1.3);
      for (const scene of this.scenes) {
        const waiting = scene.age < 0;
        scene.age += dt;
        if (scene.age < 0) continue;
        if (waiting) scene.start?.();
        scene.step?.(dt, fighters[scene.index]);
        // 招式結束或被打斷：只留一小段收尾
        if (scene.move && fighters[scene.index]?.move !== scene.move)
          scene.age = Math.max(scene.age, scene.life * 0.8);
      }
      this.scenes = this.scenes.filter((scene) => scene.age < scene.life);
      if (match) for (const shot of match.projectiles) this.trailShot(shot);
    }

    draw(ctx, layer, fighters) {
      for (const scene of this.scenes) {
        if (scene.layer !== layer || scene.age < 0) continue;
        ctx.save();
        scene.draw(
          ctx,
          scene.age / scene.life,
          fighters[scene.index],
          scene,
        );
        ctx.restore();
      }
    }

    // ---------- 畫圖的小工具 ----------
    ring(ctx, x, y, rx, ry, color, alpha) {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.sprites.ring(color), x - rx, y - ry, rx * 2, ry * 2);
    }

    // 亮點加上橫的長光條、直的短光條
    flare(ctx, x, y, size, color, alpha) {
      if (alpha <= 0) return;
      const streak = this.sprites.streak(color);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        streak,
        x - size * 1.9,
        y - size * 0.1,
        size * 3.8,
        size * 0.2,
      );
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = alpha * 0.7;
      ctx.drawImage(
        streak,
        -size * 0.8,
        -size * 0.07,
        size * 1.6,
        size * 0.14,
      );
      ctx.restore();
      ctx.globalAlpha = 1;
      this.fx.glow(ctx, x, y, size * 0.6, color, alpha * 0.55);
      this.fx.glow(ctx, x, y, size * 0.2, "#ffffff", alpha * 0.9);
    }

    // 當下隨機扭曲的電弧（每一幀都不一樣，看起來會跳動）
    arc(ctx, x1, y1, x2, y2, color, { jag = 18, width = 2.4, alpha = 1 } = {}) {
      const length = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(3, Math.min(26, Math.round(length / 26)));
      const nx = -(y2 - y1) / (length || 1);
      const ny = (x2 - x1) / (length || 1);
      ctx.beginPath();
      for (let i = 0; i <= steps; i += 1) {
        const k = i / steps;
        const off = i && i < steps ? rand(-jag, jag) : 0;
        ctx.lineTo(
          x1 + (x2 - x1) * k + nx * off,
          y1 + (y2 - y1) * k + ny * off,
        );
      }
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.3;
      ctx.lineWidth = width * 3.4;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = width * 0.45;
      ctx.stroke();
    }

    crescent(ctx, x, y, size, angle, flip, color, alpha) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip, 1);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.sprites.crescent(color),
        -size,
        -size,
        size * 2,
        size * 2,
      );
      ctx.restore();
    }

    // ---------- 一次性的光效 ----------
    popFlare(x, y, size, color, life = 0.26, delay = 0) {
      this.add(
        life,
        (ctx, k) => {
          const fade = (1 - k) ** 1.6;
          this.flare(ctx, x, y, size * (0.75 + 0.4 * fade), color, fade);
        },
        { delay },
      );
    }

    popRing(x, y, radius, color, options = {}) {
      const { life = 0.36, stretch = 1, from = 0.2, squeeze = 1 } = options;
      this.add(
        life,
        (ctx, k) => {
          const r = radius * (from + (1 - from) * easeOut(k));
          const fade = (1 - k) ** 1.4 * (this.calm ? 0.35 : 0.7);
          this.ring(ctx, x, y, r * squeeze, r * stretch, color, fade);
        },
        options.delay ? { delay: options.delay } : {},
      );
    }

    // 一道細長的刀光：很快劃過去，再慢慢變細消失
    cut(x, y, angle, length, color, options = {}) {
      const { delay = 0, life = 0.34, width = 9 } = options;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      this.add(
        life,
        (ctx, k) => {
          const grow = easeOut(clamp01(k / 0.2));
          const thin = 1 - clamp01((k - 0.2) / 0.8);
          const tail = clamp01((k - 0.35) / 0.65) * 0.9;
          const a = -length + length * 2 * tail;
          const b = -length + length * 2 * grow;
          for (const [w, style, alpha] of [
            [width * 2.6, color, 0.22],
            [width, color, 0.85],
            [width * 0.4, "#ffffff", 1],
          ]) {
            const half = (w * thin) / 2;
            const mid = (a + b) / 2;
            ctx.globalAlpha = alpha * Math.min(1, thin * 1.6);
            ctx.fillStyle = style;
            ctx.beginPath();
            ctx.moveTo(x + dx * a, y + dy * a);
            ctx.lineTo(x + dx * mid - dy * half, y + dy * mid + dx * half);
            ctx.lineTo(x + dx * b, y + dy * b);
            ctx.lineTo(x + dx * mid + dy * half, y + dy * mid - dx * half);
            ctx.fill();
          }
        },
        { delay },
      );
    }

    // 光柱：先粗後細，腳邊一圈光
    column(x, color, options = {}) {
      const { life = 0.42, width = 90, height = 560, delay = 0 } = options;
      this.add(
        life,
        (ctx, k) => {
          const open = easeOut(clamp01(k / 0.16));
          const fade = (1 - k) ** 1.3;
          const w = width * open * (0.35 + 0.65 * fade);
          ctx.globalAlpha = fade * 0.6;
          ctx.drawImage(
            this.sprites.pillar(color),
            x - w / 2,
            G - height,
            w,
            height + 8,
          );
          this.ring(
            ctx,
            x,
            G,
            width * (0.5 + 1.1 * easeOut(k)),
            width * 0.26 * (0.5 + 1.1 * easeOut(k)),
            color,
            fade,
          );
        },
        { delay, start: options.start },
      );
    }

    // 落雷：光柱加上從天而降的閃電
    strikeDown(x, color, options = {}) {
      const { delay = 0, big = false } = options;
      const strike = () => {
        for (let i = 0; i < (big ? 3 : 2); i += 1)
          this.fx.bolt(x + rand(-70, 70), -20, x + rand(-8, 8), G, color, {
            life: 0.24,
            jag: 46,
            width: big ? 6 : 4,
            branches: 3,
          });
        this.fx.burst(x, G - 6, big ? 18 : 10, {
          colors: [color, "#ffffff"],
          speed: [160, 620],
          up: 200,
          gravity: 1100,
          life: [0.2, 0.45],
        });
      };
      if (delay === 0) strike();
      this.column(x, color, {
        delay,
        width: big ? 110 : 64,
        life: big ? 0.5 : 0.36,
        start: delay ? strike : undefined,
      });
    }

    // 角色背後的色調：只染背景，角色保持明亮
    wash(color, alpha, life, hold = 0.5) {
      this.add(
        life,
        (ctx, k) => {
          const rise = clamp01(k / 0.08);
          const fall = 1 - clamp01((k - hold) / (1 - hold));
          ctx.globalAlpha = alpha * rise * fall * (this.calm ? 0.6 : 1);
          ctx.fillStyle = color;
          ctx.fillRect(-W, -H, W * 3, H * 3);
        },
        { layer: "floor" },
      );
    }

    // 集中線：從畫面四周往中間收
    focusLines(color, alpha = 0.5, life = 0.3) {
      if (this.calm) return;
      const lines = Array.from({ length: 64 }, (_, i) => ({
        a: (i / 64) * TAU + rand(-0.03, 0.03),
        half: rand(0.005, 0.02),
        inner: rand(0.5, 0.78),
      }));
      this.add(
        life,
        (ctx, k) => {
          ctx.translate(W / 2, H * 0.55);
          ctx.globalAlpha = alpha * (1 - k) ** 1.2;
          ctx.fillStyle = color;
          ctx.beginPath();
          for (const { a, half, inner } of lines) {
            const r = 420 * (inner + k * 0.25);
            ctx.moveTo(Math.cos(a) * r * 1.35, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a - half) * 1200, Math.sin(a - half) * 900);
            ctx.lineTo(Math.cos(a + half) * 1200, Math.sin(a + half) * 900);
          }
          ctx.fill();
        },
        { layer: "screen" },
      );
    }

    /* 地面的裂痕（或結霜）：從中心往外長出去，發光之後慢慢冷掉。
       座標先算好，畫的時候只要壓扁成地面的透視。 */
    cracks(x, radius, options) {
      const { count = 9, life = 1.4, color, core, dark = "#0b0605" } = options;
      const lines = Array.from({ length: count }, (_, i) => {
        let a = (i / count) * TAU + rand(-0.2, 0.2);
        const reach = radius * rand(0.65, 1);
        const points = [[0, 0]];
        let [px, py] = [0, 0];
        for (let n = 0; n < 5; n += 1) {
          a += rand(-0.35, 0.35);
          px += (Math.cos(a) * reach) / 5;
          py += (Math.sin(a) * reach) / 5;
          points.push([px, py]);
        }
        return points;
      });
      const trace = (ctx, shown) => {
        ctx.beginPath();
        for (const points of lines)
          points.slice(0, shown + 1).forEach(([px, py], i) => {
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          });
      };
      const { delay = 0, slow = 0.12 } = options;
      this.add(
        life,
        (ctx, k) => {
          const shown = Math.ceil(clamp01(k / slow) * 5);
          const heat = (1 - k) ** 1.6;
          ctx.translate(x, G + 6);
          ctx.scale(1, 0.24);
          ctx.lineJoin = "bevel";
          ctx.lineCap = "round";
          trace(ctx, shown);
          ctx.globalAlpha = 0.7 * Math.min(1, (1 - k) * 3);
          ctx.strokeStyle = dark;
          ctx.lineWidth = 9;
          ctx.stroke();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = color;
          ctx.globalAlpha = heat * 0.45;
          ctx.lineWidth = 16;
          ctx.stroke();
          ctx.globalAlpha = heat;
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.strokeStyle = core;
          ctx.lineWidth = 2;
          ctx.stroke();
        },
        { layer: "floor", delay },
      );
    }

    // 爆炸：白熱的中心、火焰、濃煙、碎石
    explosion(x, y, scale = 1) {
      this.popFlare(x, y, 110 * scale, "#ffb52e", 0.26);
      this.popRing(x, y, 190 * scale, "#ff9a4a", { life: 0.4 });
      this.popRing(x, G, 250 * scale, "#ffb52e", { life: 0.5, stretch: 0.24 });
      this.add(0.34, (ctx, k) => {
        const r = 150 * scale * (0.4 + 0.6 * easeOut(k));
        this.fx.glow(ctx, x, y, r * 1.4, "#ff5a1a", (1 - k) * 0.6);
        this.fx.glow(ctx, x, y, r * 0.7, "#ffc04a", (1 - k) ** 2 * 0.6);
      });
      for (let i = 0; i < (this.calm ? 6 : 10 + 8 * scale); i += 1) {
        const a = rand(0, TAU);
        const v = rand(140, 460) * scale;
        const far = rand(10, 50) * scale;
        this.fire(x + Math.cos(a) * far, y + Math.sin(a) * far, {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.8 - 60,
          size: rand(20, 38) * Math.sqrt(scale),
          life: rand(0.28, 0.6),
        });
      }
      this.fx.burst(x, y, 10, {
        colors: ["#2a1712", "#3a2018", "#1c100d"],
        kind: "puff",
        speed: [40, 180 * scale],
        up: 70,
        gravity: -60,
        size: [34 * scale, 64 * scale],
        life: [0.6, 1],
      });
      this.fx.burst(x, Math.min(y, G - 10), 12, {
        colors: ["#4a3426", "#6d4b35", "#2e211b"],
        kind: "rock",
        speed: [200, 640],
        up: 320,
        gravity: 1600,
        size: [4, 11],
        life: [0.6, 1],
      });
      this.fx.burst(x, y, 18, {
        colors: ["#ffd27a", "#ff7a3d", WHITE],
        speed: [220, 760],
        up: 80,
        gravity: 700,
        life: [0.25, 0.55],
      });
    }

    fire(x, y, options = {}) {
      this.fx.emit("fire", x, y, {
        vx: rand(-30, 30),
        vy: rand(-240, -120),
        gravity: -120,
        drag: 0.15,
        size: rand(16, 30),
        life: rand(0.3, 0.55),
        spin: 0,
        ...options,
      });
    }

    // 從地面竄起來的火柱
    firePillar(x, height = 150, delay = 0) {
      this.add(
        0.5,
        (ctx, k) => {
          const tall = height * easeOut(clamp01(k / 0.22)) * (1 - k * 0.3);
          const fade = (1 - k) ** 1.2;
          ctx.globalAlpha = fade * 0.6;
          ctx.drawImage(
            this.sprites.pillar("#ff5a1a"),
            x - 36,
            G - tall,
            72,
            tall + 6,
          );
          this.fx.glow(ctx, x, G - 14, 62, "#ff8a2a", fade * 0.5);
        },
        {
          delay,
          start: () => {
            const count = this.calm ? 2 : 8;
            for (let i = 0; i < count; i += 1)
              this.fire(x + rand(-16, 16), G - rand(0, 24), {
                vy: rand(-2.8, -1.2) * height,
                size: rand(18, 34),
              });
          },
        },
      );
    }

    feathers(x, y, count) {
      for (let i = 0; i < (this.calm ? 2 : count); i += 1) {
        const a = rand(0, TAU);
        const v = rand(60, 320);
        this.fx.emit("feather", x, y, {
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 80,
          gravity: 150,
          drag: 0.12,
          size: rand(9, 18),
          color: pick(["#1c0f2c", "#2c1746", "#8a56c8"]),
          life: rand(0.6, 1.2),
          spin: rand(-4, 4),
        });
      }
    }

    mist(x, y, count, spread = 40, up = 40) {
      this.fx.burst(x, y, count, {
        colors: ["#5aa9d8", "#8fd4f5", "#3f86c0"],
        kind: "mist",
        speed: [20, spread * 3],
        up,
        gravity: -20,
        size: [24, 52],
        life: [0.5, 0.95],
      });
    }

    // ---------- 事件 ----------
    cue(event) {
      const f = event.fighter;
      switch (event.type) {
        case "super-flash":
          this.boost(1);
          this.openSuper(f);
          break;
        case "attack":
          this.start(f, event.action);
          break;
        case "swing":
          this.swing(event);
          break;
        case "rise":
          this.rise(f);
          break;
        case "projectile":
          this.launch(event.shot);
          break;
        case "trap":
          this.freezeFloor(event.trap);
          break;
        case "erupt":
          this.erupt(event.trap);
          break;
        case "blink":
          this.blink(event);
          break;
        case "counter":
          this.counter(event);
          break;
        case "rush":
          this.rush(f);
          break;
        case "perfect": {
          const x = f.x - event.direction * 30;
          this.boost(0.5);
          this.popFlare(x, G - event.height, 130, "#9ff3ff", 0.34);
          this.popRing(x, G - event.height, 120, "#9ff3ff");
          break;
        }
        case "clash":
          this.boost(0.5);
          this.popFlare(event.x, G - event.y, 150, event.colors[0], 0.36);
          this.popRing(event.x, G - event.y, 160, event.colors[1]);
          break;
        case "burst": {
          const p = this.fx.palette(f.profile.id);
          const y = G - f.y - 120;
          this.boost(0.7);
          this.popFlare(f.x, y, 220, p.main, 0.4);
          this.popRing(f.x, y, 300, p.main, { life: 0.5 });
          this.cracks(f.x, 190, { color: p.main, core: p.core, life: 0.9 });
          break;
        }
        case "round-end":
          if (event.reason === "ko") this.focusLines("#05070d", 0.6, 0.6);
          break;
      }
    }

    // 招式一開始
    start(f, action) {
      if (!["special", "skill2", "super"].includes(action)) return;
      this.boost(action === "super" ? 1 : 0.45);
      const stage = {
        "thunder:special": () => this.thunderDash(f),
        "frost:special": () => this.frostCharge(f),
        "frost:skill2": () => this.frostCharge(f),
        "frost:super": () => this.blizzard(f),
        "lion:special": () => this.fistHeat(f),
        "lion:skill2": () => this.flameCharge(f),
        "lion:super": () => this.moltenCore(f),
        "shade:skill2": () => this.shadowStance(f),
      };
      stage[`${f.profile.id}:${action}`]?.();
    }

    // 大招發動的定格：每位鬥士背後的象徵
    openSuper(f) {
      const p = this.fx.palette(f.profile.id);
      const tint = {
        thunder: "#070b20",
        frost: "#06203c",
        lion: "#260a04",
        shade: "#12041f",
      }[f.profile.id];
      this.wash(tint, 0.62, 1.7, 0.6);
      const eyes = G - f.y - f.profile.size * 0.6;
      this.popFlare(f.x + f.face * 18, eyes, 130, p.main, 0.5);
      this.popRing(f.x, G - f.y - 120, 330, p.main, { life: 0.6 });
      this.cracks(f.x, 210, { color: p.main, core: p.core, life: 1.1 });
      if (f.profile.id === "thunder") this.thunderWings(f);
      else if (f.profile.id === "frost") this.snowSigil(f);
      else if (f.profile.id === "lion") this.flameMane(f);
      else this.darkMoon(f);
    }

    // 打出去的那一瞬間
    swing({ fighter: f, strike, low, high, direction, action }) {
      if (!["special", "skill2", "super"].includes(action)) return;
      const y = G - (low + high) / 2;
      const tip = f.x + direction * strike.range * 0.7;
      if (strike.effect === "bolt") this.thunderSwing(f, tip, y, action);
      else if (strike.radial) this.eruption(f.x);
      else if (strike.effect === "shade")
        this.add(0.26, (ctx, k) => {
          const size = 130 * (0.8 + 0.4 * easeOut(k));
          const x = f.x + direction * 60;
          const turn = -0.9 + 1.3 * easeOut(k);
          this.crescent(ctx, x, y, size, turn, direction, "#c98cff", 1 - k);
        });
    }

    // 打中的瞬間（effects.js 的 impact 呼叫）
    hit(event, x, y) {
      const { type, action, effect, finisher, direction, fighter } = event;
      if (type === "armor") return;
      if (type === "block") {
        if (effect === "ice") this.iceBurst(x, y, 0.55);
        return;
      }
      const skill = ["special", "skill2", "super"].includes(action);
      const strong = skill || ["heavy", "sweep", "throw"].includes(action);
      if (!skill) {
        const color = event.counterHit ? "#ff4f6a" : "#ffe2a0";
        this.boost(strong ? 0.35 : 0.15);
        this.popFlare(x, y, strong ? 110 : 64, color, strong ? 0.24 : 0.16);
        if (strong)
          this.popRing(x, y, 110, color, { squeeze: 0.5, life: 0.28 });
        return;
      }
      this.boost(finisher ? 1 : 0.6);
      if (finisher) this.focusLines("#05070d", 0.55, 0.36);
      if (effect === "bolt") this.thunderHit(fighter, x, y, action, finisher);
      else if (effect === "ice")
        this.iceBurst(x, y, { super: 1.15, skill2: 0.6 }[action] ?? 1);
      else if (effect === "quake")
        this.explosion(x, y, 1);
      else if (effect === "shade")
        this.shadeHit(x, y, action, finisher, direction);
    }

    // 追擊衝步：身後拉出幾條風痕
    rush(f) {
      const from = f.x;
      const color = this.fx.palette(f.profile.id).main;
      const lines = Array.from({ length: 5 }, (_, i) => 24 + i * 44);
      this.add(
        0.26,
        (ctx, k, me) => {
          const fade = 1 - k;
          const length = Math.abs(me.x - from) + 40;
          const mid = (me.x + from) / 2 - me.face * 30;
          const streak = this.sprites.streak(color);
          ctx.globalAlpha = fade * 0.6;
          for (const up of lines)
            ctx.drawImage(
              streak,
              mid - length * 0.7,
              G - up - 6,
              length * 1.4,
              12,
            );
        },
        { index: f.index, layer: "back" },
      );
    }

    // ---------- 雷隼 ----------
    // 雷步突拳：地上到胸口拖著電弧，拳頭包著電光
    thunderDash(f) {
      const from = f.x;
      this.add(
        0.5,
        (ctx, k, me) => {
          const fade = 1 - clamp01((k - 0.5) / 0.5);
          const y = G - me.y;
          for (const [up, jag, width] of [
            [18, 12, 3],
            [92, 24, 1.8],
            [150, 18, 2.2],
          ])
            this.arc(ctx, from, y - up, me.x, y - up, "#ffd060", {
              jag,
              width,
              alpha: fade * 0.75,
            });
          const hx = me.x + me.face * 74;
          const size = 70 + rand(0, 18);
          this.flare(ctx, hx, y - 150, size, "#ffd060", fade * 0.75);
          for (let i = 0; i < 3; i += 1)
            this.arc(
              ctx,
              hx,
              y - 150,
              hx + rand(-70, 60),
              y - 150 + rand(-70, 70),
              "#8fd3ff",
              { jag: 10, width: 1.4, alpha: fade * 0.8 },
            );
        },
        { index: f.index, move: f.move },
      );
    }

    thunderSwing(f, tip, y, action) {
      if (action === "skill2") {
        // 升龍：跟著拳頭往上掃的弧光
        this.add(
          0.3,
          (ctx, k, me) => {
            const x = me.x + me.face * 26;
            const cy = G - me.y - 140;
            const turn = 0.5 - 1.5 * easeOut(k);
            const size = 150 * (0.85 + 0.25 * k);
            this.crescent(ctx, x, cy, size, turn, me.face, "#ffd060", 1 - k);
            this.crescent(
              ctx,
              x,
              cy,
              size * 0.8,
              turn - 0.3,
              me.face,
              "#8fd3ff",
              (1 - k) * 0.7,
            );
          },
          { index: f.index },
        );
        return;
      }
      this.popFlare(tip, y, 100, "#ffd060", 0.22);
      this.popRing(tip, y, 130, "#ffd060", { squeeze: 0.38, life: 0.3 });
      this.popRing(tip + f.face * 50, y, 90, "#8fd3ff", {
        squeeze: 0.34,
        life: 0.3,
        delay: 0.04,
      });
      // 拳風前方扇形散開的電
      for (let i = -2; i <= 2; i += 1)
        this.fx.bolt(
          tip,
          y,
          tip + f.face * rand(120, 210),
          y + i * 46 + rand(-18, 18),
          pick(["#ffd060", "#8fd3ff"]),
          { life: 0.16, jag: 22, width: 2.4, branches: 1 },
        );
      if (action === "super") this.strikeDown(tip + f.face * 30, "#ffd060");
    }

    // 升龍：兩股電流繞著身體往上旋
    rise(f) {
      this.strikeDown(f.x, "#ffd060");
      this.add(
        0.62,
        (ctx, k, me, scene) => {
          const fade = pulse(k, 0.12);
          const top = G - me.y - 250;
          const bottom = Math.min(G, G - me.y + 130);
          ctx.lineCap = "round";
          for (let strand = 0; strand < 2; strand += 1) {
            let last = null;
            for (let i = 0; i <= 26; i += 1) {
              const n = i / 26;
              const a = scene.age * 22 + strand * Math.PI + n * 8;
              const x = me.x + Math.cos(a) * (46 + 34 * n);
              const y = bottom + (top - bottom) * n + Math.sin(a) * 8;
              if (last) {
                // 繞到前面的亮、後面的暗
                const depth = 0.35 + 0.65 * clamp01(0.5 + Math.sin(a) * 0.6);
                const edge = Math.sin(n * Math.PI);
                ctx.globalAlpha = fade * depth * edge;
                ctx.strokeStyle = strand ? "#8fd3ff" : "#ffd060";
                ctx.lineWidth = 9 * depth;
                ctx.beginPath();
                ctx.moveTo(...last);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 3 * depth;
                ctx.stroke();
              }
              last = [x, y];
            }
          }
        },
        { index: f.index },
      );
    }

    thunderHit(victim, x, y, action, finisher) {
      this.popFlare(x, y, finisher ? 190 : 120, "#ffd060", 0.26);
      this.popRing(x, y, finisher ? 210 : 130, "#ffd060", { life: 0.4 });
      if (action === "super") this.strikeDown(x, "#ffd060", { big: finisher });
      if (finisher && action === "super")
        for (const [dx, delay] of [
          [-150, 0.07],
          [150, 0.12],
          [-270, 0.18],
          [270, 0.22],
        ])
          this.strikeDown(x + dx, "#8fd3ff", { delay });
      if (finisher) this.cracks(x, 240, { color: "#ffd060", core: WHITE });
      // 身上殘留的電
      this.add(
        0.5,
        (ctx, k, me) => {
          const size = me.profile.size;
          for (let i = 0; i < 4; i += 1) {
            const px = me.x + rand(-50, 50);
            const py = G - me.y - rand(0.15, 0.95) * size;
            const ex = px + rand(-60, 60);
            const ey = py + rand(-60, 60);
            const style = { jag: 10, width: 1.6, alpha: (1 - k) * 0.9 };
            this.arc(ctx, px, py, ex, ey, "#8fd3ff", style);
          }
        },
        { index: victim.index },
      );
    }

    // 大招定格：背後張開一對閃電的翅膀
    thunderWings(f) {
      for (const side of [-1, 1])
        this.strikeDown(f.x + side * 210, "#8fd3ff", {
          delay: side > 0 ? 0.08 : 0,
        });
      const feathers = Array.from({ length: 10 }, (_, i) => i / 9);
      this.add(
        0.95,
        (ctx, k, me, scene) => {
          const open = easeOut(clamp01(k / 0.28));
          const beat = 1 + 0.03 * Math.sin(scene.age * 20);
          const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          const cx = me.x - me.face * 8;
          const cy = G - me.y - me.profile.size * 0.68;
          this.fx.glow(ctx, cx, cy, 190 * open, "#ffd060", fade * 0.35);
          for (const side of [1, -1]) {
            const wx = cx + side * 120 * open;
            const wy = cy - 110 * open * beat;
            for (const n of feathers) {
              const bx = wx + (cx - wx) * n * 0.9;
              const by = wy + (cy - wy) * n * 0.9;
              const angle = -0.62 + n * 1.75;
              const length = (250 - n * 150) * (0.35 + 0.65 * open) * beat;
              const dx = Math.cos(angle) * side;
              const dy = Math.sin(angle);
              const wide = 15 - n * 5;
              const tipX = bx + dx * length;
              const tipY = by + dy * length;
              ctx.globalAlpha = fade * (0.5 - n * 0.2);
              ctx.fillStyle = n < 0.4 ? "#ffd060" : "#8fd3ff";
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.quadraticCurveTo(
                bx + dx * length * 0.5 + dy * wide * side,
                by + dy * length * 0.5 - dx * wide * side - 10,
                tipX,
                tipY,
              );
              ctx.quadraticCurveTo(
                bx + dx * length * 0.5 - dy * wide * side,
                by + dy * length * 0.5 + dx * wide * side + 8,
                bx,
                by,
              );
              ctx.fill();
              if (n < 0.75)
                this.arc(ctx, bx, by, tipX, tipY, "#ffd060", {
                  jag: 7,
                  width: 1.4,
                  alpha: fade * 0.7,
                });
            }
            this.arc(ctx, cx, cy, wx, wy, "#ffffff", {
              jag: 6,
              width: 3,
              alpha: fade * 0.8,
            });
          }
        },
        { index: f.index, layer: "back" },
      );
    }

    // ---------- 霜弦 ----------
    // 起手：寒氣與冰晶往弓前聚
    frostCharge(f) {
      this.add(
        0.24,
        (ctx, k, me) => {
          const x = me.x + me.face * 78;
          const y = G - me.y - 150;
          const pull = 1 - k;
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * TAU + k * 2;
            ctx.globalAlpha = k;
            this.fx.crystal(
              ctx,
              x + Math.cos(a) * 90 * pull,
              y + Math.sin(a) * 90 * pull,
              9,
              a + Math.PI,
              "#8fe6ff",
            );
          }
          this.flare(ctx, x, y, 40 + 70 * k, "#8fe6ff", k * 0.9);
        },
        { index: f.index, move: f.move },
      );
      this.mist(f.x, G - 8, 4, 30, 10);
    }

    launch(shot) {
      const y = G - shot.y;
      if (shot.shape === "ice") {
        this.popFlare(shot.x, y, 140, "#8fe6ff", 0.28);
        this.popRing(shot.x, y, 110, "#8fe6ff", { squeeze: 0.4 });
        this.mist(shot.x, y, 5, 40, 20);
        return;
      }
      // 裂地：重拳砸地
      this.marks.set(shot, shot.x);
      this.boost(0.6);
      this.popFlare(shot.x, G - 18, 130, "#ffb52e", 0.28);
      this.popRing(shot.x, G, 200, "#ff9a4a", { stretch: 0.24, life: 0.42 });
      this.cracks(shot.x, 170, {
        color: "#ff7a3d",
        core: "#ffe2a8",
        life: 1.2,
      });
      this.firePillar(shot.x, 190);
      this.fx.burst(shot.x, G - 4, 12, {
        colors: ["#4a3426", "#6d4b35"],
        kind: "rock",
        speed: [160, 520],
        up: 420,
        gravity: 1700,
        size: [5, 12],
        life: [0.6, 1],
      });
    }

    // 飛行道具一路留下的東西：冰霧、火柱
    trailShot(shot) {
      const last = this.marks.get(shot) ?? shot.x;
      const moved = Math.abs(shot.x - last);
      if (shot.shape === "ice") {
        if (moved < 34 && this.marks.has(shot)) return;
        this.marks.set(shot, shot.x);
        const back = shot.x - shot.direction * 20;
        if (!this.calm) this.mist(back, G - shot.y, 1, 14, 0);
        return;
      }
      if (moved < 62) return;
      this.marks.set(shot, shot.x);
      const x = shot.x - shot.direction * 34;
      this.firePillar(x, 120 + rand(0, 50));
      this.cracks(x, 70, {
        color: "#ff7a3d",
        core: "#ffe2a8",
        count: 4,
        life: 0.9,
      });
    }

    iceBurst(x, y, scale) {
      const needles = Array.from({ length: 11 }, (_, i) => ({
        a: (i / 11) * TAU + rand(-0.2, 0.2),
        length: rand(0.6, 1.15),
      }));
      this.popFlare(x, y, 150 * scale, "#8fe6ff", 0.3);
      this.popRing(x, y, 150 * scale, "#8fe6ff");
      this.add(0.42, (ctx, k) => {
        const grow = easeOut(clamp01(k / 0.25));
        const fade = 1 - clamp01((k - 0.4) / 0.6);
        for (const { a, length } of needles) {
          const r = 120 * scale * length * grow;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a);
          ctx.globalAlpha = fade * 0.85;
          ctx.fillStyle = "#bff0ff";
          ctx.beginPath();
          ctx.moveTo(r * 0.12, -5 * scale);
          ctx.lineTo(r, 0);
          ctx.lineTo(r * 0.12, 5 * scale);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(r * 0.12, -1.6);
          ctx.lineTo(r * 0.9, 0);
          ctx.lineTo(r * 0.12, 1.6);
          ctx.fill();
          ctx.restore();
        }
      });
      this.mist(x, y, Math.round(6 * scale), 50, 20);
      this.fx.burst(x, y, Math.round(14 * scale), {
        colors: ["#8fe6ff", "#f2fdff", "#4aa8ff"],
        kind: "shard",
        speed: [160, 620],
        up: 120,
        gravity: 1200,
        size: [5, 12],
        life: [0.4, 0.8],
      });
    }

    // 冰棱陣的預告：地面結霜，往外長出冰花
    freezeFloor(trap) {
      const life = trap.total + 0.1;
      this.cracks(trap.x, trap.spec.width * 0.62, {
        count: 12,
        color: "#4aa8ff",
        core: "#f2fdff",
        dark: "#0d2a40",
        life: life * 1.7,
        slow: 0.5,
      });
      this.add(
        life,
        (ctx, k) => {
          const beat = 0.75 + 0.25 * Math.sin(k * k * 60);
          ctx.globalAlpha = (0.2 + 0.4 * k) * beat;
          ctx.drawImage(
            this.sprites.pillar("#4aa8ff"),
            trap.x - trap.spec.width / 2,
            G - 60 - 130 * k,
            trap.spec.width,
            66 + 130 * k,
          );
          const size = trap.spec.width * 0.72;
          ctx.translate(trap.x, G + 4);
          ctx.scale(1, 0.26);
          ctx.globalAlpha = 1;
          this.fx.glow(ctx, 0, 0, size * 1.5, "#4aa8ff", 0.85 * beat);
          // 冰花法陣：外圈固定，六根冰枝慢慢長到外圈就會破土
          ctx.rotate(k * 1.2);
          ctx.strokeStyle = "#dffbff";
          ctx.globalAlpha = (0.5 + 0.5 * k) * beat;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, TAU);
          ctx.moveTo(size * 0.5, 0);
          ctx.arc(0, 0, size * 0.5, 0, TAU);
          for (let arm = 0; arm < 6; arm += 1) {
            const a = (arm / 6) * TAU;
            const reach = size * k;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
            for (const turn of [-0.5, 0.5]) {
              const b = a + turn;
              const mid = reach * 0.6;
              const end = reach * 0.85;
              ctx.moveTo(Math.cos(a) * mid, Math.sin(a) * mid);
              ctx.lineTo(Math.cos(b) * end, Math.sin(b) * end);
            }
          }
          ctx.stroke();
        },
        { layer: "back" },
      );
    }

    // 冰棱破土：前後兩排，有受光面與背光面，最後碎掉
    erupt(trap) {
      const { width, height } = trap.spec;
      const row = (count, scale, spread) =>
        Array.from({ length: count }, (_, i) => {
          const n = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
          return {
            dx: n * width * spread + rand(-6, 6),
            h: height * scale * (1 - Math.abs(n) * 0.5) * rand(0.8, 1.12),
            w: rand(24, 40) * (1 - Math.abs(n) * 0.3),
            tilt: n * 0.34 + rand(-0.08, 0.08),
            delay: Math.abs(n) * 0.07,
          };
        });
      const rise = (layer, spikes, dim) =>
        this.add(
          0.78,
          (ctx, k, _, scene) => {
            for (const spike of spikes)
              this.drawSpike(ctx, trap.x, spike, scene.age, k, dim);
          },
          { layer },
        );
      rise("floor", row(this.calm ? 3 : 6, 1.05, 0.62), 0.72);
      rise("solid", row(this.calm ? 3 : 7, 0.8, 0.7), 1);
      this.boost(0.6);
      this.popFlare(trap.x, G - 40, 90, "#8fe6ff", 0.26);
      this.popRing(trap.x, G, width * 1.5, "#8fe6ff", { stretch: 0.24 });
      this.mist(trap.x, G - 14, 9, 80, 50);
      this.fx.burst(trap.x, G - 20, 22, {
        colors: ["#8fe6ff", "#f2fdff", "#ffffff"],
        kind: "shard",
        speed: [200, 700],
        up: 300,
        spread: 1.6,
        angle: -Math.PI / 2,
        gravity: 1300,
        size: [4, 11],
        life: [0.4, 0.8],
      });
      // 碎裂
      this.add(0.1, () => {}, {
        delay: 0.64,
        start: () => {
          this.mist(trap.x, G - 60, 6, 60, 30);
          this.fx.burst(trap.x, G - 70, 20, {
            colors: ["#8fe6ff", "#f2fdff"],
            kind: "shard",
            speed: [80, 360],
            up: 60,
            gravity: 1100,
            size: [5, 13],
            life: [0.4, 0.7],
          });
        },
      });
    }

    drawSpike(ctx, x, spike, age, k, dim) {
      const t = Math.max(0, age - spike.delay);
      // 竄出來時稍微衝過頭再縮回來
      const over = 1 + 0.12 * Math.max(0, 1 - t / 0.16);
      const grow = Math.min(1, t / 0.07) * over;
      const h = spike.h * grow;
      if (h <= 1 || k > 0.96) return;
      const { w } = spike;
      ctx.save();
      ctx.globalAlpha = dim * (k > 0.82 ? (0.96 - k) / 0.14 : 1);
      ctx.translate(x + spike.dx, G + 8);
      ctx.rotate(spike.tilt);
      const faces = [
        [[-w / 2, 0], [-w * 0.06, -h], [w * 0.04, 0], "#2a78c4", "#9fe4ff"],
        [[w * 0.04, 0], [-w * 0.06, -h], [w / 2, 0], "#164a8a", "#5cb6ee"],
      ];
      for (const [a, top, b, low, high] of faces) {
        const g = ctx.createLinearGradient(0, 0, 0, -h);
        g.addColorStop(0, low);
        g.addColorStop(0.75, high);
        g.addColorStop(1, "#ffffff");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...top);
        ctx.lineTo(...b);
        ctx.fill();
      }
      // 稜線的反光
      ctx.strokeStyle = "#f2fdff";
      ctx.lineWidth = 1.6;
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w * 0.06, -h);
      ctx.lineTo(w * 0.04, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 大招定格：背後一面巨大的雪花法陣
    snowSigil(f) {
      const flake = this.sprites.snowflake("#8fe6ff");
      this.add(
        1.3,
        (ctx, k, me, scene) => {
          const open = easeOut(clamp01(k / 0.25));
          const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          ctx.translate(me.x, G - me.y - 140);
          for (const [size, spin, alpha] of [
            [300, 0.35, 0.75],
            [190, -0.8, 0.6],
          ]) {
            ctx.save();
            ctx.rotate(scene.age * spin);
            ctx.globalAlpha = fade * alpha;
            const r = size * open;
            ctx.drawImage(flake, -r, -r, r * 2, r * 2);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
          this.fx.glow(ctx, 0, 0, 280 * open, "#4aa8ff", fade * 0.7);
        },
        { index: f.index, layer: "back" },
      );
    }

    // 大招：橫掃全場的暴風雪
    blizzard(f) {
      const count = this.calm ? 10 : 58;
      const flakes = Array.from({ length: count }, () => ({
        x: rand(-100, W + 100),
        y: rand(0, G + 60),
        speed: rand(700, 1700),
        size: rand(0.5, 1.4),
      }));
      const dir = f.face;
      this.wash("#0a2c50", 0.45, 2.4, 0.6);
      this.add(
        2.4,
        (ctx, k) => {
          const fade = pulse(k, 0.14);
          const streak = this.sprites.streak("#bfeaff");
          for (const s of flakes) {
            ctx.globalAlpha = fade * 0.4 * s.size;
            const long = (40 + s.speed * 0.06) * s.size;
            ctx.drawImage(streak, s.x - long / 2, s.y - 3, long, 6 * s.size);
          }
        },
        {
          step: (dt) => {
            for (const s of flakes) {
              s.x += dir * s.speed * dt;
              s.y += s.speed * 0.14 * dt;
              if (s.x > W + 140) s.x = -140;
              if (s.x < -140) s.x = W + 140;
              if (s.y > G + 70) s.y = -10;
            }
          },
        },
      );
    }

    // ---------- 赤獅 ----------
    fistHeat(f) {
      this.add(
        0.28,
        (ctx, k, me) => {
          const x = me.x + me.face * (30 + 50 * k);
          const y = G - me.y - 190 + 150 * k * k;
          this.flare(ctx, x, y, 60 + 40 * k, "#ff7a3d", 0.4 + 0.5 * k);
        },
        {
          index: f.index,
          move: f.move,
          step: (dt, me) => {
            if (this.calm || Math.random() > dt * 60) return;
            this.fire(me.x + me.face * rand(20, 70), G - me.y - rand(60, 180));
          },
        },
      );
    }

    // 獅王衝撞：身前一面火焰盾，身後拖著火
    flameCharge(f) {
      this.add(
        0.56,
        (ctx, k, me, scene) => {
          const fade = pulse(k, 0.2);
          const x = me.x + me.face * 34;
          const y = G - me.y - 112;
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(me.face, 1);
          for (let i = 0; i < 4; i += 1) {
            const flick = Math.sin(scene.age * 46 + i * 2) * 6;
            ctx.globalAlpha = fade * (0.75 - i * 0.14);
            ctx.strokeStyle = [FIRE[0], FIRE[1], FIRE[2], FIRE[3]][i];
            ctx.lineWidth = 6 + i * 7;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.ellipse(
              10 - i * 9 + flick,
              0,
              62,
              118 + i * 4,
              0,
              -1.15,
              1.15,
            );
            ctx.stroke();
          }
          ctx.restore();
          this.flare(ctx, x + me.face * 70, y, 90, "#ff9a4a", fade * 0.7);
          this.fx.glow(ctx, me.x, y, 150, "#ff6a2a", fade * 0.35);
        },
        {
          index: f.index,
          move: f.move,
          step: (dt, me) => {
            if (this.calm) return;
            for (let n = dt * 90; n > 0; n -= 1) {
              if (Math.random() > n) continue;
              this.fire(me.x + me.face * rand(-40, 60), G - rand(4, 220), {
                vx: -me.face * rand(120, 380),
                vy: rand(-140, 20),
                size: rand(13, 26),
              });
            }
          },
        },
      );
    }

    // 大招定格：背後一圈火焰鬃毛
    flameMane(f) {
      this.add(
        1.05,
        (ctx, k, me, scene) => {
          const open = easeOut(clamp01(k / 0.3));
          const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          const cx = me.x;
          const cy = G - me.y - me.profile.size * 0.72;
          for (let i = 0; i < 30; i += 1) {
            const flick = 1 + 0.25 * Math.sin(scene.age * 17 + i * 2.3);
            const long = (150 + (i % 3) * 46) * open * flick;
            const sway = 0.1 * Math.sin(scene.age * 9 + i);
            const tongue = this.sprites.pillar(FIRE[1 + (i % 3)]);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((i / 30) * TAU + sway);
            ctx.globalAlpha = fade * 0.55;
            ctx.drawImage(tongue, -26, -30 - long, 52, long);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
          this.fx.glow(ctx, cx, cy, 220 * open, "#ff5a1a", fade * 0.6);
        },
        {
          index: f.index,
          layer: "back",
          step: (dt, me) => {
            if (this.calm) return;
            for (let i = 0; i < 2; i += 1)
              if (Math.random() < dt * 60)
                this.fire(me.x + rand(-120, 120), G - rand(0, 30), {
                  vy: rand(-420, -200),
                });
          },
        },
      );
    }

    // 大招蓄力：火星往胸口吸，核心越來越亮，地面先裂開
    moltenCore(f) {
      const life = 0.4;
      this.add(
        life,
        (ctx, k, me) => {
          const y = G - me.y - 120;
          this.fx.glow(ctx, me.x, y, 60 + 190 * k, "#ff7a2a", 0.3 + 0.6 * k);
          this.flare(ctx, me.x, y, 50 + 150 * k, "#ffb52e", k);
          this.ring(
            ctx,
            me.x,
            y,
            260 * (1 - k) + 20,
            260 * (1 - k) + 20,
            "#ff9a4a",
            k * 0.8,
          );
        },
        {
          index: f.index,
          move: f.move,
          step: (dt, me) => {
            if (this.calm) return;
            for (let i = 0; i < 3; i += 1) {
              if (Math.random() > dt * 60) continue;
              const a = rand(0, TAU);
              const r = rand(160, 280);
              this.fx.emit(
                "ember",
                me.x + Math.cos(a) * r,
                G - me.y - 120 + Math.sin(a) * r * 0.7,
                {
                  vx: -Math.cos(a) * r * 3.4,
                  vy: -Math.sin(a) * r * 2.4,
                  size: rand(6, 12),
                  color: pick(["#ffb52e", "#ff7a3d", "#ffe2a8"]),
                  life: 0.26,
                  drag: 0.9,
                },
              );
            }
          },
        },
      );
      this.cracks(f.x, 260, {
        count: 11,
        color: "#ff7a3d",
        core: "#ffe2a8",
        life: 0.9,
        slow: 0.45,
      });
    }

    // 熔核震爆：火焰穹頂、一圈火柱、熔岩裂縫
    eruption(x) {
      this.boost(1);
      this.wash("#3a0d02", 0.5, 1.1, 0.4);
      this.explosion(x, G - 90, 2);
      this.cracks(x, 400, {
        count: 15,
        color: "#ff6a2a",
        core: "#ffd27a",
        life: 2,
        slow: 0.08,
      });
      this.add(0.5, (ctx, k) => {
        // 半圓的火焰穹頂，貼著地面往外撐開
        const r = 360 * easeOut(k);
        ctx.beginPath();
        ctx.rect(x - 500, G - 500, 1000, 504);
        ctx.clip();
        this.ring(ctx, x, G, r, r * 0.82, "#ff8a3d", (1 - k) * 0.9);
        this.ring(ctx, x, G, r * 0.74, r * 0.6, "#ff6a22", (1 - k) * 0.6);
      });
      for (const [dx, delay] of [
        [-110, 0.02],
        [110, 0.02],
        [-210, 0.08],
        [210, 0.08],
        [-310, 0.15],
        [310, 0.15],
      ])
        this.firePillar(x + dx, 260 - Math.abs(dx) * 0.3, delay);
      this.fx.burst(x, G - 10, 26, {
        colors: ["#4a3426", "#6d4b35", "#2e211b"],
        kind: "rock",
        speed: [300, 900],
        up: 520,
        gravity: 1700,
        size: [6, 15],
        life: [0.8, 1.3],
      });
    }

    // ---------- 影燕 ----------
    // 瞬移：兩端各有一道裂縫，中間留下分身
    blink({ fighter: f, from, to }) {
      this.boost(0.5);
      for (const x of [from, to]) {
        this.add(
          0.34,
          (ctx, k) => {
            const open = Math.sin(Math.min(1, k * 1.6) * Math.PI);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 0.85 * open;
            ctx.fillStyle = "#0b0314";
            ctx.beginPath();
            ctx.ellipse(x, G - 112, 34 * open, 128, 0, 0, TAU);
            ctx.fill();
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = "#c98cff";
            ctx.lineWidth = 4;
            ctx.stroke();
            this.flare(ctx, x, G - 112, 90 * open, "#c98cff", open * 0.6);
          },
          { layer: "back" },
        );
        this.feathers(x, G - 120, 5);
      }
      if (this.calm) return;
      const steps = 4;
      for (let i = 1; i < steps; i += 1) {
        const x = from + ((to - from) * i) / steps;
        this.fx.ghost?.(f, 0.16 + i * 0.06, "#8a4be0", x);
      }
    }

    shadeHit(x, y, action, finisher, direction) {
      this.popFlare(x, y, finisher ? 160 : 110, "#c98cff", 0.26);
      const tilt = rand(0.45, 0.7) * direction;
      const length = finisher ? 360 : 220;
      this.cut(x, y, tilt, length, "#c98cff", { width: 12 });
      this.cut(x, y, Math.PI - tilt, length, "#c98cff", {
        width: 12,
        delay: 0.05,
      });
      if (action === "super") {
        const count = this.calm ? 2 : finisher ? 8 : 4;
        for (let i = 0; i < count; i += 1)
          this.cut(
            x + rand(-60, 60),
            y + rand(-60, 60),
            rand(0, Math.PI),
            rand(180, 380),
            pick(["#c98cff", "#f6e8ff", "#8a56ff"]),
            { width: rand(4, 8), delay: 0.04 + i * 0.03 },
          );
        if (finisher) {
          this.popRing(x, y, 300, "#c98cff", { life: 0.5, delay: 0.08 });
          this.popFlare(x, y, 190, "#c98cff", 0.36, 0.1);
        }
      }
      this.feathers(x, y, finisher ? 18 : 8);
    }

    // 影返架勢：繞著身體轉的影刃
    shadowStance(f) {
      this.add(
        0.6,
        (ctx, k, me, scene) => {
          const fade = pulse(k, 0.15);
          const y = G - me.y - 110;
          for (let i = 0; i < 4; i += 1) {
            const a = scene.age * 7 + (i / 4) * TAU;
            const x = me.x + Math.cos(a) * 84;
            const depth = 0.45 + 0.55 * clamp01(0.5 + Math.sin(a) * 0.7);
            this.crescent(
              ctx,
              x,
              y + Math.sin(a) * 26,
              58 * depth,
              a,
              1,
              "#c98cff",
              fade * depth,
            );
          }
          // 眼神一閃
          const eye = clamp01(1 - Math.abs(k - 0.12) / 0.12);
          this.flare(
            ctx,
            me.x + me.face * 16,
            G - me.y - me.profile.size * 0.6,
            90,
            "#e3c2ff",
            eye,
          );
        },
        { index: f.index, move: f.move },
      );
    }

    // 影返成功：畫面一暗，一道長刀光橫越全場
    counter({ fighter: f, height }) {
      this.boost(0.9);
      this.wash("#12041f", 0.75, 0.6, 0.4);
      const y = G - height;
      this.cut(W / 2, y, 0.03, W * 0.75, "#e3c2ff", { width: 12, life: 0.45 });
      this.popFlare(f.x, y, 190, "#c98cff", 0.36);
      this.feathers(f.x, y, 12);
    }

    // 大招定格：背後升起一輪黑月
    darkMoon(f) {
      const cx = f.x;
      const cy = G - 170;
      this.add(
        1.2,
        (ctx, k, _, scene) => {
          const open = easeOut(clamp01(k / 0.3));
          const fade = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
          const r = 170 * open;
          this.fx.glow(ctx, cx, cy, r * 1.9, "#8a4be0", fade * 0.6);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = fade * 0.95;
          ctx.fillStyle = "#07020d";
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = "lighter";
          this.ring(ctx, cx, cy, r * 1.16, r * 1.16, "#8a4be0", fade * 0.7);
          for (let i = 0; i < 3; i += 1)
            this.crescent(
              ctx,
              cx,
              cy,
              r * (1.15 + i * 0.2),
              scene.age * (1.2 + i * 0.5) + i * 2,
              1,
              "#c98cff",
              fade * (0.6 - i * 0.15),
            );
        },
        { layer: "back" },
      );
      this.feathers(f.x, G - 160, 16);
    }

    // ---------- 飛行道具 ----------
    drawShot(ctx, shot) {
      const x = shot.drawX ?? shot.x;
      const y = G - shot.y;
      if (shot.shape === "ice") this.drawIce(ctx, shot, x, y);
      else this.drawQuake(ctx, shot, x);
      ctx.globalAlpha = 1;
    }

    // 冰弧：新月形的冰刃包著一顆冰晶，後面拖著寒氣
    drawIce(ctx, shot, x, y) {
      const { radius, direction } = shot;
      const fx = this.fx;
      const big = shot.action === "super" ? 1.25 : 1;
      const streak = this.sprites.streak("#8fe6ff");
      const long = radius * 9;
      ctx.globalAlpha = 0.65;
      ctx.drawImage(
        streak,
        x - (direction > 0 ? long * 0.82 : long * 0.18),
        y - radius * 0.7,
        long,
        radius * 1.4,
      );
      fx.glow(ctx, x, y, radius * 3.2, "#4aa8ff", 0.5);
      fx.glow(ctx, x, y, radius * 1.3, "#f2fdff", 0.5);
      const size = radius * 3.1 * big;
      const shift = direction * radius * 0.2;
      const beat = 1 + 0.05 * Math.sin(fx.time * 40);
      this.crescent(ctx, x - shift, y, size * beat, 0, direction, "#8fe6ff", 1);
      this.crescent(
        ctx,
        x - direction * radius * 1.4,
        y,
        size * 0.78,
        0,
        direction,
        "#4aa8ff",
        0.6,
      );
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < 3; i += 1) {
        const a = fx.time * 11 + (i / 3) * TAU;
        fx.crystal(
          ctx,
          x - direction * radius * 0.5,
          y + Math.sin(a) * radius * 1.5,
          radius * (0.3 + 0.12 * Math.cos(a)),
          direction === 1 ? 0 : Math.PI,
          "#bff0ff",
        );
      }
      fx.crystal(
        ctx,
        x,
        y,
        radius * 1.35,
        direction === 1 ? 0 : Math.PI,
        "#d8f8ff",
        "#ffffff",
      );
    }

    // 裂地震波：貼地前進的火浪
    drawQuake(ctx, shot, x) {
      const fx = this.fx;
      const { direction } = shot;
      fx.glow(ctx, x, G - 24, 100, "#ff6a2a", 0.6);
      fx.glow(ctx, x, G - 12, 40, "#ffc04a", 0.7);
      for (let i = -4; i <= 4; i += 1) {
        const flick = 0.8 + 0.3 * Math.sin(fx.time * 27 + i * 2);
        const h = (150 - Math.abs(i) * 24) * flick;
        const px = x + i * 13 - direction * 8;
        ctx.save();
        ctx.translate(px, G + 4);
        // 火舌往前進的反方向倒
        ctx.transform(1, 0, direction * 0.35, 1, 0, 0);
        ctx.globalAlpha = 0.75;
        ctx.drawImage(
          this.sprites.pillar(FIRE[1 + (Math.abs(i) % 3)]),
          -20,
          -h,
          40,
          h,
        );
        ctx.restore();
      }
    }

    // ---------- 粒子 ----------
    // 一般混色的粒子：不規則的煙、羽毛
    drawSolid(ctx, p, fade) {
      if (p.kind === "puff") {
        const r = p.size * (1.7 - fade * 0.8);
        ctx.globalAlpha = Math.min(1, fade * 1.6) * 0.5;
        const puff = this.sprites.puff(p.color);
        ctx.drawImage(puff, p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.kind === "feather") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.min(1, fade * 2);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "#b78ae8";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.quadraticCurveTo(0, -p.size * 0.45, p.size, 0);
        ctx.quadraticCurveTo(0, p.size * 0.3, -p.size, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* 火焰與寒氣：不規則的煙團圖，順著移動方向拉長。
       火焰用一般混色，很多團疊在一起才不會變成一整片白。 */
    drawGlow(ctx, p, fade) {
      const fire = p.kind === "fire";
      const heat = Math.min(FIRE.length - 1, Math.floor((1 - fade) * 5));
      const color = fire ? FIRE[heat] : p.color;
      const swell = Math.sin(Math.min(1, 1.1 - fade) * 2);
      const grow = fire ? 0.6 + 0.8 * swell : 1.9 - fade;
      const r = p.size * grow;
      const speed = Math.hypot(p.vx, p.vy);
      const long = 1 + Math.min(0.7, speed / 500);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(speed > 20 ? Math.atan2(p.vy, p.vx) : p.rotation);
      ctx.scale(long, 1 / Math.sqrt(long));
      ctx.globalAlpha = fire ? Math.min(0.85, fade * 1.5) : fade * 0.32;
      if (fire) ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(this.sprites.puff(color), -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  game.SkillFx = SkillFx;
})();
