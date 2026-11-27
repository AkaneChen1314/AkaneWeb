/* 檔案導讀：共用的戰鬥特效——粒子、火花、衝擊波、刀光、閃電、飄雨。
   技能與大招自己的演出在 fx.js（this.skills），這裡在適當的時機呼叫它。 */
(() => {
  const { FIELD } = Midnight;
  const { width: W, height: H, ground: G } = FIELD;
  const TAU = Math.PI * 2;
  const WHITE = "#fff8e4";
  // 亂數小工具。
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // 每位鬥士的代表色：main 主色、core 最亮的中心、alt 點綴
  const PALETTE = {
    thunder: { main: "#ffd060", core: "#fffbe6", alt: "#8fd3ff" },
    frost: { main: "#8fe6ff", core: "#f2fdff", alt: "#4aa8ff" },
    lion: { main: "#ff7a3d", core: "#ffe2a8", alt: "#ffb52e" },
    shade: { main: "#c98cff", core: "#f6e8ff", alt: "#6b2fd1" },
  };
  const EFFECT_ID = {
    bolt: "thunder",
    quake: "lion",
    shade: "shade",
    ice: "frost",
  };

  // 共用的戰鬥特效，依比賽事件產生並繪製。
  class CombatEffects {
    // 建立雨滴與技能特效。
    constructor(motion) {
      this.motion = motion;
      this.lights = new Map();
      this.rain = Array.from({ length: 120 }, () => this.raindrop(true));
      this.skills = new Midnight.SkillFx(this);
      this.ghost = null; // renderer.js 提供：在指定位置留下一個殘影
      this.reset();
    }

    get calm() {
      return this.motion.matches;
    }

    // 清空所有特效。
    reset() {
      this.time = 0;
      this.casts = [];
      this.impacts = [];
      this.particles = [];
      this.paths = [];
      this.slashes = [];
      this.bolts = [];
      this.waves = [];
      this.superFlash = null;
      this.skills.reset();
    }

    // 一張放射狀的光暈（每種顏色只畫一次，之後重複使用）
    light(color) {
      let canvas = this.lights.get(color);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.2, color + "aa");
        gradient.addColorStop(0.55, color + "33");
        gradient.addColorStop(1, color + "00");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        this.lights.set(color, canvas);
      }
      return canvas;
    }

    // 畫一團光。
    glow(ctx, x, y, radius, color, alpha = 1) {
      if (radius <= 0 || alpha <= 0) return;
      const previous = ctx.globalAlpha;
      ctx.globalAlpha = previous * alpha;
      ctx.drawImage(
        this.light(color),
        x - radius,
        y - radius,
        radius * 2,
        radius * 2,
      );
      ctx.globalAlpha = previous;
    }

    // 鬥士或屬性的代表色。
    palette(idOrEffect) {
      return (
        PALETTE[EFFECT_ID[idOrEffect] ?? idOrEffect] ?? {
          main: "#ffffff",
          core: WHITE,
          alt: "#cccccc",
        }
      );
    }

    // ---------- 產生特效的小工具 ----------
    emit(kind, x, y, options = {}) {
      const max = this.calm ? 90 : 620;
      if (this.particles.length >= max) this.particles.shift();
      const life = options.life ?? rand(0.25, 0.5);
      this.particles.push({
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        gravity: 0,
        drag: 1,
        size: 3,
        color: WHITE,
        rotation: rand(0, TAU),
        spin: rand(-8, 8),
        ...options,
        life,
        total: life,
      });
    }

    // 一次噴出很多粒子。
    burst(
      x,
      y,
      count,
      {
        colors = [WHITE],
        speed = [120, 620],
        kind = "spark",
        direction = 0,
        up = 60,
        gravity = 900,
        size = [1.4, 4],
        life = [0.15, 0.42],
        spread = TAU,
        angle = 0,
      } = {},
    ) {
      const total = this.calm ? Math.min(4, count) : count;
      for (let i = 0; i < total; i += 1) {
        const a = angle + rand(-spread / 2, spread / 2);
        const v = rand(speed[0], speed[1]);
        this.emit(kind, x, y, {
          vx: Math.cos(a) * v + direction * 180,
          vy: Math.sin(a) * v - up,
          gravity,
          size: rand(size[0], size[1]),
          color: pick(colors),
          life: rand(life[0], life[1]),
          drag: ["ember", "smoke", "puff", "mist"].includes(kind) ? 0.2 : 0.6,
        });
      }
    }

    // 擴散的圓環。
    wave(
      x,
      y,
      radius,
      color,
      life = 0.35,
      stretch = 0.3,
      widthPx = 6,
      from = 0.15,
    ) {
      this.waves.push({
        x,
        y,
        radius,
        color,
        life,
        total: life,
        stretch,
        width: widthPx,
        from,
      });
    }

    // 閃電：主幹加上分岔。
    bolt(
      x1,
      y1,
      x2,
      y2,
      color,
      { life = 0.16, jag = 26, width = 3, branches = 2 } = {},
    ) {
      // 把一段折線反覆切半並隨機偏移。
      const make = (ax, ay, bx, by, depth, rough) => {
        let points = [
          [ax, ay],
          [bx, by],
        ];
        for (let d = 0; d < depth; d += 1) {
          const next = [points[0]];
          for (let i = 1; i < points.length; i += 1) {
            const [px, py] = points[i - 1];
            const [qx, qy] = points[i];
            const len = Math.hypot(qx - px, qy - py) || 1;
            const offset = rand(-rough, rough) * (len / 120);
            next.push(
              [
                (px + qx) / 2 - ((qy - py) / len) * offset,
                (py + qy) / 2 + ((qx - px) / len) * offset,
              ],
              [qx, qy],
            );
          }
          points = next;
          rough *= 0.58;
        }
        return points;
      };
      const main = make(x1, y1, x2, y2, 5, jag);
      const forks = [];
      for (let b = 0; b < (this.calm ? 0 : branches); b += 1) {
        const [sx, sy] = main[Math.floor(rand(0.2, 0.7) * main.length)];
        const len = Math.hypot(x2 - x1, y2 - y1) * rand(0.25, 0.45);
        const a = Math.atan2(y2 - y1, x2 - x1) + rand(-0.9, 0.9);
        forks.push(
          make(
            sx,
            sy,
            sx + Math.cos(a) * len,
            sy + Math.sin(a) * len,
            4,
            jag * 0.6,
          ),
        );
      }
      this.bolts.push({
        lines: [main, ...forks],
        color,
        life,
        total: life,
        width,
      });
      if (this.bolts.length > 40) this.bolts.shift();
    }

    // ---------- 遊戲事件 ----------
    cue(event) {
      // f 是發生這件事的鬥士；先交給招式特效（fx.js）處理各鬥士自己的演出，下面
      // 再處理共用的效果。
      const f = event.fighter;
      this.skills.cue(event);
      switch (event.type) {
        // 出招。
        case "attack": {
          if (!event.name || ["sweep", "throw"].includes(event.action)) break;
          const ultimate = event.action === "super";
          this.casts.push({
            index: f.index,
            color: f.profile.color,
            id: f.profile.id,
            action: event.action,
            ultimate,
            age: 0,
            life: ultimate ? 1.15 : 0.6,
          });
          if (this.casts.length > 6) this.casts.shift();
          const p = this.palette(f.profile.id);
          this.wave(
            f.x,
            G - 4,
            ultimate ? 240 : 140,
            p.main,
            ultimate ? 0.6 : 0.4,
            0.22,
            ultimate ? 7 : 4,
          );
          this.burst(f.x, G - 30, ultimate ? 26 : 12, {
            colors: [p.main, p.core],
            kind: "ember",
            speed: [60, 240],
            up: 160,
            gravity: -120,
            size: [5, 12],
            life: [0.4, 0.8],
          });
          break;
        }
        // 大招開場。
        case "super-flash": {
          const p = this.palette(f.profile.id);
          // 記下大招開場的閃光：哪一位、顏色，持續 0.62 秒。
          this.superFlash = {
            index: f.index,
            color: f.profile.color,
            palette: p,
            id: f.profile.id,
            age: 0,
            life: 0.62,
          };
          if (f.profile.id === "thunder") {
            for (let i = 0; i < 3; i += 1)
              this.bolt(
                f.x + rand(-60, 60),
                0,
                f.x + rand(-20, 20),
                G - 120,
                p.main,
                { life: 0.35, jag: 60, width: 5, branches: 4 },
              );
          }
          this.wave(f.x, G - 130, 260, p.core, 0.5, 1, 5, 0.05);
          this.wave(f.x, G - 4, 380, p.main, 0.7, 0.2, 8);
          break;
        }
        case "swing":
          this.swing(event);
          break;
        case "hit":
        case "block":
        case "armor":
          this.impact(event);
          break;
        // 打在護盾或霸體上。
        case "perfect": {
          const x = f.x - event.direction * 30;
          const y = G - event.height;
          this.impacts.push({
            kind: "perfect",
            x,
            y,
            color: "#9ff3ff",
            size: 90,
            age: 0,
            life: 0.4,
            spikes: this.spikesFor(8),
            rot: 0,
          });
          this.wave(x, y, 120, "#dffbff", 0.35, 1, 5, 0.1);
          this.burst(x, y, 18, {
            colors: ["#ffffff", "#9ff3ff"],
            speed: [200, 700],
            gravity: 300,
          });
          break;
        }
        // 破防。
        case "guard-break": {
          const y = G - event.height;
          this.impacts.push({
            kind: "break",
            x: f.x,
            y,
            color: "#ff9d6b",
            size: 120,
            age: 0,
            life: 0.45,
            spikes: this.spikesFor(14),
            rot: rand(0, TAU),
          });
          this.burst(f.x, y, 26, {
            colors: ["#bfefff", "#ffffff", "#ff9d6b"],
            kind: "shard",
            speed: [200, 650],
            size: [6, 13],
            gravity: 1100,
            life: [0.4, 0.8],
          });
          break;
        }
        // 反擊成功。
        case "counter": {
          const p = this.palette("shade");
          const y = G - event.height;
          this.impacts.push({
            kind: "counter",
            x: f.x,
            y,
            color: p.main,
            size: 110,
            age: 0,
            life: 0.45,
            spikes: this.spikesFor(6),
            rot: 0,
          });
          this.burst(f.x, y, 18, {
            colors: [p.alt, p.main],
            kind: "smoke",
            speed: [40, 160],
            up: 30,
            gravity: -60,
            size: [24, 46],
            life: [0.4, 0.7],
          });
          break;
        }
        // 瞬移。
        case "blink": {
          const p = this.palette(f.profile.id);
          this.paths.push({
            from: event.from,
            to: event.to,
            age: 0,
            life: 0.32,
            color: p.main,
          });
          for (const x of [event.from, event.to]) {
            this.burst(x, G - 110, 12, {
              colors: [p.alt, p.main, "#2a1640"],
              kind: "smoke",
              speed: [30, 150],
              up: 20,
              gravity: -50,
              size: [26, 50],
              life: [0.35, 0.6],
            });
          }
          this.wave(event.to, G - 110, 90, p.main, 0.3, 1.4, 4);
          break;
        }
        case "dash":
          // 衝刺：腳下揚起塵土（往前衝時比較多）。
          this.burst(f.x, G - 6, event.forward ? 12 : 8, {
            colors: ["#c9d3e6", "#8b93a8"],
            kind: "smoke",
            speed: [60, 220],
            up: 10,
            gravity: -20,
            size: [10, 22],
            life: [0.25, 0.45],
            angle: event.forward
              ? f.face > 0
                ? Math.PI
                : 0
              : f.face > 0
                ? 0
                : Math.PI,
            spread: 1.2,
          });
          this.wave(f.x, G - 4, 70, "#e6e9f3", 0.25, 0.2, 3);
          break;
        // 抓住對手。
        case "grab": {
          const x = (f.x + event.target.x) / 2;
          this.impacts.push({
            kind: "hit",
            x,
            y: G - 140,
            color: "#ffffff",
            size: 46,
            age: 0,
            life: 0.2,
            spikes: this.spikesFor(6),
            rot: 0,
          });
          break;
        }
        // 精準防禦。
        case "tech": {
          const x = (f.x + event.attacker.x) / 2;
          this.impacts.push({
            kind: "perfect",
            x,
            y: G - 130,
            color: "#9ff3ff",
            size: 80,
            age: 0,
            life: 0.35,
            spikes: this.spikesFor(8),
            rot: 0,
          });
          this.burst(x, G - 130, 16, {
            colors: ["#ffffff", "#9ff3ff"],
            speed: [200, 600],
            gravity: 300,
          });
          break;
        }
        // 爆氣。
        case "burst": {
          const p = this.palette(f.profile.id);
          const y = G - f.y - 120;
          for (let i = 0; i < 3; i += 1)
            this.wave(
              f.x,
              y,
              200 + i * 70,
              i ? p.main : p.core,
              0.45 + i * 0.1,
              1,
              9 - i * 2,
              0.05,
            );
          this.wave(f.x, G - 4, 300, p.main, 0.5, 0.22, 7);
          this.burst(f.x, y, 36, {
            colors: [p.main, p.core, WHITE],
            speed: [250, 900],
            gravity: 300,
            life: [0.3, 0.6],
          });
          this.burst(f.x, y, 14, {
            colors: [p.main, p.alt],
            kind: "ember",
            speed: [120, 420],
            up: 100,
            gravity: -60,
            size: [6, 12],
            life: [0.4, 0.8],
          });
          break;
        }
        case "dodge":
          // 閃避：腳下的塵土。
          this.burst(f.x, G - 6, 10, {
            colors: ["#c9d3e6", "#8b93a8"],
            kind: "smoke",
            speed: [40, 180],
            up: 10,
            gravity: -20,
            size: [10, 22],
            life: [0.25, 0.45],
            angle: Math.PI,
            spread: 1.4,
          });
          break;
        case "land":
          // 落地：揚起塵土（重落地比較多）。
          this.burst(f.x, G - 4, event.heavy ? 20 : 8, {
            colors: ["#c9d3e6", "#8b93a8"],
            kind: "smoke",
            speed: [60, 220],
            up: 0,
            gravity: -30,
            size: [10, event.heavy ? 34 : 20],
            life: [0.25, 0.5],
            angle: -Math.PI / 2,
            spread: Math.PI * 1.1,
          });
          if (event.heavy) this.wave(f.x, G - 4, 200, "#e6e9f3", 0.45, 0.18, 5);
          break;
        case "jump":
          // 起跳：腳下一點塵土。
          this.burst(f.x, G - 4, 6, {
            colors: ["#c9d3e6"],
            kind: "smoke",
            speed: [40, 120],
            up: 0,
            gravity: -20,
            size: [8, 16],
            life: [0.2, 0.35],
          });
          break;
        // 開始蓄力。
        case "rise": {
          const p = this.palette(f.profile.id);
          this.bolt(f.x, G, f.x + f.face * 40, G - 300, p.main, {
            life: 0.3,
            jag: 30,
            width: 4,
            branches: 3,
          });
          this.wave(f.x, G - 4, 130, p.main, 0.35, 0.22, 5);
          break;
        }
        // 發射飛行道具。
        case "projectile": {
          const { shot } = event;
          const p = this.palette(shot.shape === "quake" ? "lion" : "frost");
          this.burst(shot.x, G - shot.y, 12, {
            colors: [p.main, p.core],
            speed: [100, 420],
            direction: shot.direction,
            up: 0,
            gravity: 200,
            life: [0.12, 0.3],
          });
          this.wave(shot.x, G - shot.y, shot.radius * 3, p.core, 0.25, 1, 4);
          break;
        }
        // 飛行道具相撞。
        case "clash": {
          this.impacts.push({
            kind: "hit",
            x: event.x,
            y: G - event.y,
            color: event.colors[0],
            size: 110,
            age: 0,
            life: 0.4,
            spikes: this.spikesFor(12),
            rot: rand(0, TAU),
          });
          this.burst(event.x, G - event.y, 30, {
            colors: [...event.colors, WHITE],
            speed: [150, 760],
          });
          this.wave(event.x, G - event.y, 150, WHITE, 0.4, 1, 6);
          break;
        }
        case "round-end":
          // 回合結束：K.O. 時從被打倒的一方放出白色衝擊波。
          if (event.reason === "ko" && event.loser) {
            const l = event.loser;
            this.wave(l.x, G - 120, 420, WHITE, 0.7, 1, 10, 0.05);
            this.burst(l.x, G - 120, 40, {
              colors: [WHITE, "#ffd274", "#ff8a5c"],
              speed: [250, 950],
              gravity: 500,
              life: [0.3, 0.7],
            });
          }
          break;
      }
    }

    // 放射狀的刺，用在打擊特效。
    spikesFor(count) {
      return Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * TAU + rand(-0.18, 0.18),
        length: rand(0.55, 1.15),
      }));
    }

    /* 現在照亮場景的招式（大招、技能、剛打中的火花），沒有就回傳 null。
       給 renderer.js 用來把角色的邊緣光染成那個顏色。 */
    lightSource(fighters) {
      const flash = this.superFlash;
      if (flash)
        return this.lightOf(
          flash.palette.main,
          fighters[flash.index].x,
          1 - flash.age / flash.life,
        );
      const cast = this.casts.find((c) => c.ultimate) ?? this.casts[0];
      if (cast) {
        const caster = fighters[cast.index];
        return this.lightOf(
          this.palette(cast.id).main,
          caster.x + caster.face * 50,
          0.6 * Math.sin((cast.age / cast.life) * Math.PI),
        );
      }
      const impact = this.impacts[this.impacts.length - 1];
      if (!impact) return null;
      const power = 0.7 * (1 - impact.age / impact.life);
      return this.lightOf(impact.color, impact.x, power);
    }

    // 一盞臨時燈光，給角色的邊緣光用。
    lightOf(color, x, power) {
      const part = (i) => parseInt(color.slice(i, i + 2), 16) / 255;
      return {
        color: [part(1), part(3), part(5)],
        x,
        power: Math.max(0, Math.min(1, power)) * (this.calm ? 0.3 : 1),
      };
    }

    // 揮擊：拳腳路線的光帶與屬性附加效果。
    swing({ fighter: f, strike, low, high, direction, action, path }) {
      // 這一擊的特效配色：輕攻用白色，有專屬特效的招式用該鬥士的配色。y 是刀光
      // 的高度（手腳經過的高度中間）。
      const id = EFFECT_ID[strike.effect] ?? null;
      const p = id ? this.palette(id) : null;
      const color = action === "light" ? WHITE : p ? p.main : f.profile.color;
      const y = G - (high + low) / 2;
      // 往四周的震波。
      if (strike.radial) {
        const pal = this.palette("lion");
        // 依招式附加的特效：震波是一圈一圈往外的波紋，火焰招式噴出火星，大地招
        // 式彈起碎石。
        for (let i = 0; i < 3; i += 1)
          this.wave(
            f.x,
            G - 8,
            strike.range * (1 - i * 0.18),
            i ? pal.alt : pal.core,
            0.45 + i * 0.08,
            0.26,
            9 - i * 2,
          );
        this.burst(f.x, G - 20, 34, {
          colors: [pal.main, pal.alt, pal.core],
          kind: "ember",
          speed: [200, 700],
          up: 260,
          gravity: 700,
          size: [4, 10],
          life: [0.4, 0.8],
        });
        this.burst(f.x, G - 4, 18, {
          colors: ["#4a3426", "#6d4b35"],
          kind: "rock",
          speed: [200, 600],
          up: 380,
          gravity: 1600,
          size: [5, 11],
          life: [0.6, 1],
        });
        return;
      }
      // 刀光：沿著手腳真正經過的軌跡畫出一道弧線，重攻比較粗、留得比較久。
      const big = action !== "light";
      this.slashes.push({
        points: this.slashPoints(f, strike, path, y, direction),
        color,
        core: p ? p.core : WHITE,
        life: big ? 0.24 : 0.16,
        total: big ? 0.24 : 0.16,
        thick: (big ? 34 : 20) * (path?.foot ? 1.2 : 1),
        double: strike.effect === "shade",
      });
      // 雷系招式加一道閃電，大地招式在落點揚起碎石。
      if (strike.effect === "bolt") {
        const reach = strike.range * 0.9;
        this.bolt(
          f.x + direction * 40,
          y,
          f.x + direction * reach,
          y + rand(-25, 25),
          p.main,
          { life: 0.14, jag: 22, width: 3, branches: 2 },
        );
      }
      if (strike.effect === "quake") {
        this.burst(f.x + direction * 90, G - 4, 10, {
          colors: ["#4a3426", "#6d4b35"],
          kind: "rock",
          speed: [150, 420],
          up: 300,
          gravity: 1600,
          size: [4, 9],
          life: [0.5, 0.9],
          direction,
        });
      }
    }

    /* 揮擊光帶的路線（場地座標）：拳腳掃過的路線，再往前延伸到招式的攻擊距離。
       沒有骨架資料時就用一條水平的直線。 */
    slashPoints(f, strike, path, y, direction) {
      const local = (path?.points ?? []).map(([x, up]) => [
        f.x + x * direction,
        G - f.y - up,
      ]);
      if (local.length < 2)
        return [
          [f.x + 40 * direction, y],
          [f.x + (strike.range * 0.6 + 20) * direction, y],
          [f.x + strike.range * direction, y],
        ];
      const [x1, y1] = local[local.length - 1];
      const [x0, y0] = local[local.length - 2];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const reach = f.x + strike.range * direction;
      const extra = Math.max(26, Math.min(95, (reach - x1) * direction));
      // 尾端順著出招的方向，慢慢轉成往前
      for (let i = 1; i <= 4; i += 1) {
        const k = i / 4;
        const dx = ((x1 - x0) / len) * (1 - k) + direction * k;
        const dy = ((y1 - y0) / len) * (1 - k);
        const last = local[local.length - 1];
        local.push([last[0] + (dx * extra) / 4, last[1] + (dy * extra) / 4]);
      }
      return local;
    }

    // 打中：依攻擊輕重與屬性產生特效。
    impact(event) {
      const {
        type,
        fighter,
        attacker,
        action,
        height,
        direction,
        effect,
        counterHit,
        finisher,
      } = event;
      const x = fighter.x - direction * 26;
      const y = G - height;
      this.skills.hit(event, x, y);
      // 被擋下。
      if (type === "block") {
        this.impacts.push({
          kind: "block",
          x: x - direction * 10,
          y,
          color: "#8fe6ff",
          size: 62,
          age: 0,
          life: 0.28,
          spikes: [],
          rot: 0,
          direction,
        });
        this.burst(x, y, 8, {
          colors: ["#bff4ff", WHITE],
          speed: [120, 420],
          direction: -direction,
          gravity: 600,
        });
        return;
      }
      // 打在霸體上。
      if (type === "armor") {
        this.impacts.push({
          kind: "hit",
          x,
          y,
          color: "#ffb08a",
          size: 60,
          age: 0,
          life: 0.25,
          spikes: this.spikesFor(8),
          rot: rand(0, TAU),
        });
        this.wave(fighter.x, G - 120, 110, "#ff9d6b", 0.3, 1.3, 5);
        return;
      }
      const p = this.palette(EFFECT_ID[effect] ?? attacker.profile.id);
      // 打擊特效的大小。
      const size =
        action === "super"
          ? finisher
            ? 150
            : 110
          : action === "special" || action === "skill2"
            ? 95
            : action === "heavy"
              ? 72
              : 52;
      const rot = rand(0, TAU);
      this.impacts.push({
        kind: "hit",
        x,
        y,
        color: effect ? p.main : attacker.profile.color,
        size,
        soft: Boolean(effect), // 技能另有演出，火花淡一點才看得到人
        age: 0,
        life: size > 90 ? 0.38 : 0.26,
        spikes: this.spikesFor(size > 90 ? 14 : 10),
        rot,
      });
      if (counterHit)
        this.impacts.push({
          kind: "hit",
          x,
          y,
          color: "#ff4f6a",
          size: size * 1.25,
          age: 0,
          life: 0.3,
          spikes: this.spikesFor(6),
          rot: rot + 0.3,
        });
      this.wave(x, y, size * 1.3, p.core, 0.28, 1, size > 90 ? 6 : 3);
      const sparks = size > 90 ? 26 : size > 60 ? 16 : 10;
      this.burst(x, y, sparks, {
        colors: [p.main, p.core, WHITE],
        speed: [180, 820],
        direction: -direction,
        up: 40,
        gravity: 800,
        size: [1.5, 4.5],
      });
      // 各屬性的碎屑
      const id = EFFECT_ID[effect];
      // 各屬性的附加效果。
      if (id === "thunder") {
        for (let i = 0; i < (size > 90 ? 3 : 2); i += 1) {
          const a = rand(0, TAU);
          const r = rand(70, 150);
          this.bolt(
            x,
            y,
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            pick([p.main, p.alt]),
            { life: 0.14, jag: 20, width: 2.5, branches: 1 },
          );
        }
      } else if (id === "lion") {
        this.burst(x, y, 12, {
          colors: [p.main, p.alt],
          kind: "ember",
          speed: [150, 500],
          up: 140,
          gravity: 300,
          size: [4, 9],
          life: [0.35, 0.7],
        });
      } else if (id === "shade") {
        this.burst(x, y, 8, {
          colors: [p.alt, p.main],
          kind: "smoke",
          speed: [40, 160],
          gravity: -40,
          size: [20, 40],
          life: [0.3, 0.55],
        });
      }
    }

    // ---------- 每一幀的更新 ----------
    raindrop(anywhere = false) {
      return {
        x: rand(-100, W + 60),
        y: anywhere ? rand(-50, G) : rand(-120, -10),
        len: rand(14, 30),
        speed: rand(900, 1300),
        depth: rand(0.3, 1),
      };
    }

    // 推進所有特效。
    update(dt, fighters = [], match = null) {
      this.time += dt;
      for (const collection of [this.casts, this.impacts, this.paths])
        for (const item of collection) item.age += dt;
      for (const collection of [this.slashes, this.bolts, this.waves])
        for (const item of collection) item.life -= dt;
      this.casts = this.casts.filter((c) => c.age < c.life);
      this.impacts = this.impacts.filter((c) => c.age < c.life);
      this.paths = this.paths.filter((c) => c.age < c.life);
      this.slashes = this.slashes.filter((c) => c.life > 0);
      this.bolts = this.bolts.filter((c) => c.life > 0);
      this.waves = this.waves.filter((c) => c.life > 0);
      if (this.superFlash) {
        this.superFlash.age += dt;
        if (this.superFlash.age >= this.superFlash.life) this.superFlash = null;
      }

      // 粒子的移動與空氣阻力。
      for (const p of this.particles) {
        p.life -= dt;
        p.vx *= p.drag ** dt;
        p.vy *= p.drag ** dt;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        if ((p.kind === "rock" || p.kind === "shard") && p.y > G && p.vy > 0) {
          p.y = G;
          p.vy *= -0.32;
          p.vx *= 0.55;
        }
      }
      this.particles = this.particles.filter((p) => p.life > 0);

      // 雨滴。
      for (const drop of this.rain) {
        drop.y += drop.speed * drop.depth * dt;
        drop.x += drop.speed * drop.depth * dt * 0.18;
        if (drop.y > G + 40 * drop.depth) {
          if (!this.calm && drop.depth > 0.7 && Math.random() < 0.4) {
            this.emit("drip", drop.x, G + 10 * drop.depth, {
              vx: rand(-60, 60),
              vy: rand(-140, -60),
              gravity: 900,
              size: 1.4,
              color: "#a9c2e8",
              life: 0.2,
            });
          }
          Object.assign(drop, this.raindrop());
        }
      }

      this.ambient(dt, fighters, match);
      this.skills.update(dt, fighters, match);
    }

    // 持續冒出來的粒子：施招的氣、飛行道具的尾巴、集氣滿的光點
    ambient(dt, fighters, match) {
      // 「減少動態」設定下不播放環境特效；chance(rate) 依每秒的頻率決定這一幀要
      // 不要產生一顆粒子。
      if (this.calm) return;
      const chance = (rate) => Math.random() < rate * dt;
      // 蓄力中的鬥士。
      for (const cast of this.casts) {
        const f = fighters[cast.index];
        if (!f) continue;
        const p = this.palette(cast.id);
        const strength = Math.sin((cast.age / cast.life) * Math.PI);
        const rate = (cast.ultimate ? 90 : 45) * strength;
        // 蓄力中的鬥士身邊冒出各自屬性的粒子：雷隼放電、霜弦飄雪、赤獅噴火星、
        // 影燕冒黑煙。
        if (cast.id === "thunder" && chance(rate * 0.25)) {
          const a = rand(0, TAU);
          const cy = G - f.y - 120;
          this.bolt(
            f.x + Math.cos(a) * 30,
            cy + Math.sin(a) * 50,
            f.x + Math.cos(a) * rand(90, 160),
            cy + Math.sin(a) * rand(90, 150),
            pick([p.main, p.alt]),
            { life: 0.1, jag: 18, width: 2, branches: 1 },
          );
        }
        if (cast.id === "frost" && chance(rate)) {
          this.emit("flake", f.x + rand(-110, 110), G - f.y - rand(20, 240), {
            vx: rand(-30, 30),
            vy: rand(-60, 20),
            size: rand(3, 7),
            color: pick([p.main, p.core]),
            life: rand(0.5, 1),
            gravity: 40,
            drag: 0.5,
          });
        }
        if (cast.id === "lion") {
          for (let n = rate * dt; n > 0; n -= 1)
            if (Math.random() < n)
              this.skills.fire(f.x + rand(-95, 95), G - rand(-6, 14), {
                size: rand(14, 30) * (cast.ultimate ? 1.3 : 1),
              });
        }
        if (cast.id === "lion" && chance(rate * 0.5)) {
          this.emit("ember", f.x + rand(-90, 90), G - rand(0, 40), {
            vx: rand(-40, 40),
            vy: rand(-320, -160),
            size: rand(4, 9),
            color: pick([p.main, p.alt, p.core]),
            life: rand(0.4, 0.9),
            gravity: -80,
            drag: 0.5,
          });
        }
        if (cast.id === "shade" && chance(rate * 0.6)) {
          this.emit("smoke", f.x + rand(-70, 70), G - f.y - rand(10, 200), {
            vx: rand(-40, 40),
            vy: rand(-80, -20),
            size: rand(18, 36),
            color: pick([p.alt, "#2a1640"]),
            life: rand(0.4, 0.7),
            gravity: -20,
            drag: 0.4,
          });
        }
      }
      // 能量滿了的鬥士。
      for (const f of fighters) {
        if (f.meter >= 100 && f.hp > 0 && chance(14)) {
          const p = this.palette(f.profile.id);
          this.emit("ember", f.x + rand(-60, 60), G - f.y - rand(10, 220), {
            vx: rand(-20, 20),
            vy: rand(-140, -60),
            size: rand(3, 6),
            color: pick([p.main, p.core]),
            life: rand(0.4, 0.8),
            gravity: -40,
            drag: 0.5,
          });
        }
      }
      if (!match) return;
      // 飛行道具的尾跡。
      for (const shot of match.projectiles) {
        const y = G - shot.y;
        const back = shot.x - shot.direction * shot.radius;
        // 飛行道具後面拖著尾跡：冰彈飄雪花，岩石彈掉碎石，火球噴火星。
        if (shot.shape === "ice") {
          if (chance(70))
            this.emit(
              "flake",
              back + rand(-10, 10),
              y + rand(-shot.radius, shot.radius),
              {
                vx: -shot.direction * rand(30, 120),
                vy: rand(-40, 40),
                size: rand(3, 6),
                color: pick(["#bff4ff", "#ffffff", "#8fe6ff"]),
                life: rand(0.3, 0.6),
                gravity: 60,
                drag: 0.3,
              },
            );
        } else if (chance(55)) {
          this.emit("rock", shot.x + rand(-20, 20), G - 6, {
            vx: rand(-80, 80) - shot.direction * 60,
            vy: rand(-520, -260),
            size: rand(4, 9),
            color: pick(["#4a3426", "#6d4b35", "#2e211b"]),
            life: rand(0.5, 0.9),
            gravity: 1600,
            drag: 0.8,
          });
          if (chance(30))
            this.emit("ember", shot.x, G - 10, {
              vx: rand(-60, 60),
              vy: rand(-260, -120),
              size: rand(4, 8),
              color: pick(["#ff7a3d", "#ffb52e"]),
              life: rand(0.3, 0.6),
              gravity: 200,
              drag: 0.5,
            });
        }
      }
      // 還沒爆發的陷阱。
      for (const trap of match.traps) {
        if (!trap.erupted && chance(35)) {
          this.emit(
            "flake",
            trap.x + rand(-trap.spec.width / 2, trap.spec.width / 2),
            G - rand(0, 20),
            {
              vx: rand(-15, 15),
              vy: rand(-140, -60),
              size: rand(3, 6),
              color: pick(["#bff4ff", "#ffffff"]),
              life: rand(0.4, 0.7),
              gravity: -20,
              drag: 0.5,
            },
          );
        }
      }
    }

    // ---------- 繪圖 ----------
    behind(ctx, fighters) {
      ctx.save();
      // 雨畫在背景與角色之間
      ctx.strokeStyle = "#a9c2e8";
      ctx.lineCap = "round";
      // 雨。
      for (const drop of this.rain) {
        ctx.globalAlpha = 0.1 + drop.depth * 0.16;
        ctx.lineWidth = 0.6 + drop.depth;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(
          drop.x - drop.len * 0.18 * drop.depth,
          drop.y - drop.len * drop.depth,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const flash = this.superFlash;
      const superCast = this.casts.find((c) => c.ultimate);
      let dim = 0;
      // 大招時把場景變暗。
      if (flash) dim = Math.min(1, flash.age / 0.08) * 0.62;
      else if (superCast)
        dim = Math.sin((superCast.age / superCast.life) * Math.PI) * 0.3;
      if (dim > 0) {
        ctx.fillStyle = "#04060f";
        ctx.globalAlpha = dim;
        ctx.fillRect(-W, -H, W * 3, H * 3);
        ctx.globalAlpha = 1;
      }

      this.skills.draw(ctx, "floor", fighters);
      ctx.globalCompositeOperation = "lighter";
      // 大招開場的放射光。
      if (flash) {
        const f = fighters[flash.index];
        const progress = flash.age / flash.life;
        const cx = f.x;
        const cy = G - f.y - 130;
        // 施放者背後旋轉的光芒
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.time * 0.8);
        const rays = 14;
        for (let i = 0; i < rays; i += 1) {
          ctx.globalAlpha = (1 - progress) * (0.18 + (i % 2) * 0.12);
          ctx.fillStyle = i % 2 ? flash.palette.main : flash.palette.core;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const a = (i / rays) * TAU;
          ctx.arc(0, 0, 900, a, a + 0.09 + (i % 3) * 0.03);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        this.glow(
          ctx,
          cx,
          cy,
          260 + progress * 120,
          flash.palette.main,
          (1 - progress) * 0.5,
        );
      }

      // 蓄力的光圈。
      for (const cast of this.casts) {
        const f = fighters[cast.index];
        if (!f) continue;
        const progress = cast.age / cast.life;
        const strength = Math.sin(progress * Math.PI);
        const p = this.palette(cast.id);
        const radius = (cast.ultimate ? 260 : 140) * (0.65 + progress * 0.5);
        this.glow(
          ctx,
          f.x,
          G - 30,
          radius,
          p.main,
          strength * (this.calm ? 0.35 : 0.75),
        );
        ctx.save();
        ctx.translate(f.x, G - 4);
        ctx.scale(1, 0.22);
        ctx.strokeStyle = p.main;
        for (let ring = 0; ring < 3; ring += 1) {
          ctx.lineWidth = 4 - ring;
          ctx.globalAlpha = strength * (1 - ring * 0.22);
          ctx.beginPath();
          ctx.arc(
            0,
            0,
            radius * (0.5 + ring * 0.23),
            0.25 + progress * (2 + ring),
            TAU - 0.25 + progress * (2 + ring),
          );
          ctx.stroke();
        }
        if (cast.ultimate)
          this.sigil(ctx, cast.id, radius * 0.95, progress, strength, p);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      this.skills.draw(ctx, "back", fighters);
      ctx.restore();
    }

    // 大招腳下的法陣，每位鬥士的圖案不一樣
    sigil(ctx, id, radius, progress, strength, p) {
      ctx.save();
      ctx.globalAlpha = strength * 0.8;
      ctx.strokeStyle = p.core;
      ctx.lineWidth = 3;
      ctx.rotate(progress * (id === "shade" ? -3 : 3));
      ctx.beginPath();
      const points =
        id === "frost" ? 6 : id === "lion" ? 8 : id === "thunder" ? 5 : 3;
      const step = id === "thunder" ? 2 : 1;
      for (let i = 0; i <= points; i += 1) {
        const a = ((i * step) / points) * TAU;
        const r = radius * (i % 2 && id === "lion" ? 0.72 : 1);
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.62, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 一塊冰晶。
    crystal(ctx, x, y, radius, rotation, color, edge = "#eaffff") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = color;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(-radius * 0.35, -radius * 0.3);
      ctx.lineTo(-radius, 0);
      ctx.lineTo(-radius * 0.35, radius * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 畫在角色前面的特效。
    front(ctx, fighters, match) {
      ctx.save();
      // 碎石與煙用一般混色才看得清楚
      for (const p of this.particles) {
        const fade = p.life / p.total;
        if (p.kind === "rock") {
          ctx.globalAlpha = Math.min(1, fade * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.75);
          ctx.restore();
        } else if (p.kind === "smoke") {
          const r = p.size * (1.6 - fade * 0.6);
          ctx.globalAlpha = fade * 0.55;
          ctx.drawImage(this.light(p.color), p.x - r, p.y - r, r * 2, r * 2);
        } else this.skills.drawSolid(ctx, p, fade);
      }
      ctx.globalAlpha = 1;
      this.skills.draw(ctx, "solid", fighters);
      ctx.globalCompositeOperation = "lighter";
      const calmScale = this.calm ? 0.45 : 1;

      for (const cast of this.casts)
        this.drawCast(ctx, cast, fighters[cast.index], calmScale);
      if (match)
        for (const shot of match.projectiles) this.skills.drawShot(ctx, shot);
      this.skills.draw(ctx, "front", fighters);

      // 瞬移的路線。
      for (const path of this.paths) {
        const fade = 1 - path.age / path.life;
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = path.color;
        for (let i = 0; i < 5; i += 1) {
          const y = G - 50 - i * 34;
          ctx.lineWidth = (5 - i * 0.6) * fade;
          ctx.beginPath();
          ctx.moveTo(path.from, y);
          ctx.lineTo(path.to, y + Math.sin(i * 2.1) * 8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      for (const s of this.slashes) this.drawSlash(ctx, s, calmScale);
      // 擴散的圓環。
      for (const w of this.waves) {
        const progress = 1 - w.life / w.total;
        const r =
          w.radius * (w.from + (1 - w.from) * (1 - (1 - progress) ** 3));
        // 柔邊的光環，加上一條細線當邊緣
        const soft = (1 - progress) * calmScale * Math.min(0.6, w.width / 12);
        this.skills.ring(ctx, w.x, w.y, r, r * w.stretch, w.color, soft);
        ctx.globalAlpha = (1 - progress) * calmScale * 0.7;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.width * 0.6 * (1 - progress) + 0.5;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y, r, r * w.stretch, 0, 0, TAU);
        ctx.stroke();
      }
      for (const b of this.bolts) this.drawBolt(ctx, b);
      for (const impact of this.impacts)
        this.drawImpact(ctx, impact, calmScale);

      // 粒子。
      for (const p of this.particles) {
        const fade = p.life / p.total;
        if (p.kind === "spark") {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (0.4 + fade * 0.6);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
          ctx.stroke();
        } else if (p.kind === "ember") {
          ctx.globalAlpha = 1;
          this.glow(ctx, p.x, p.y, p.size * (0.6 + fade), p.color, fade);
        } else if (p.kind === "fire" || p.kind === "mist") {
          this.skills.drawGlow(ctx, p, fade);
        } else if (p.kind === "shard") {
          ctx.globalAlpha = Math.min(1, fade * 1.6);
          this.crystal(ctx, p.x, p.y, p.size, p.rotation, p.color);
        } else if (p.kind === "flake") {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.2;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.beginPath();
          for (let i = 0; i < 3; i += 1) {
            const a = (i / 3) * Math.PI;
            ctx.moveTo(-Math.cos(a) * p.size, -Math.sin(a) * p.size);
            ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
          }
          ctx.stroke();
          ctx.restore();
        } else if (p.kind === "drip") {
          ctx.globalAlpha = fade * 0.6;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
      }

      // 大招定格時，往施放者收的速度線
      const flash = this.superFlash;
      if (flash && !this.calm) {
        const f = fighters[flash.index];
        const cx = f.x;
        const cy = G - f.y - 130;
        const fade = 1 - flash.age / flash.life;
        ctx.strokeStyle = flash.palette.core;
        for (let i = 0; i < 26; i += 1) {
          const a = rand(0, TAU);
          const r0 = rand(260, 420);
          const r1 = r0 + rand(160, 420);
          ctx.globalAlpha = fade * rand(0.25, 0.7);
          ctx.lineWidth = rand(1, 3.5);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 蓄力時手上的光。
    drawCast(ctx, cast, f, calmScale) {
      if (!f) return;
      const progress = cast.age / cast.life;
      const amount = Math.sin(progress * Math.PI) * calmScale;
      const scale = cast.ultimate ? 1.5 : 1;
      const p = this.palette(cast.id);
      const x = f.x + f.face * 50;
      const y = G - f.y - 140;
      ctx.globalAlpha = amount;
      this.glow(ctx, x, y, 80 * scale, p.main, 0.45);
      if (cast.id === "frost") {
        for (let i = 0; i < 10; i += 1) {
          const angle = (i / 10) * TAU + progress * 3;
          ctx.globalAlpha = amount * 0.9;
          this.crystal(
            ctx,
            f.x + Math.cos(angle) * 85 * scale,
            y + 20 + Math.sin(angle) * 70 * scale,
            14 * scale,
            angle,
            p.main,
          );
        }
      } else if (cast.id === "shade") {
        ctx.strokeStyle = p.main;
        for (let i = 0; i < 3; i += 1) {
          ctx.globalAlpha = amount * (0.9 - i * 0.2);
          ctx.lineWidth = 7 - i * 2;
          ctx.beginPath();
          ctx.ellipse(
            f.x,
            y + 30,
            110 * scale,
            45 * scale,
            -0.7 + i * 0.6,
            progress * 4 + i,
            progress * 4 + i + 3.8,
          );
          ctx.stroke();
        }
        if (cast.ultimate) this.glow(ctx, f.x, y - 40, 150, "#3a1466", amount);
      } else if (cast.id === "thunder") {
        ctx.strokeStyle = p.main;
        ctx.globalAlpha = amount * 0.8;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.ellipse(
            f.x,
            y + 40,
            (70 + i * 20) * scale,
            (110 + i * 10) * scale,
            0,
            this.time * (6 + i) + i,
            this.time * (6 + i) + i + 1.8,
          );
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // 揮擊的光帶：沿著拳腳的路線，前面粗、後面細，尾巴很快追上來
    drawSlash(ctx, s, calmScale) {
      const progress = 1 - s.life / s.total;
      const fade = (1 - progress) ** 1.3 * calmScale;
      const { points } = s;
      const n = points.length;
      const tail = Math.min(0.8, progress * 1.1) * (n - 1);
      // 光帶的輪廓，thick 是粗細、shift 是偏移。
      const ribbon = (thick, shift) => {
        const left = [];
        const right = [];
        for (let i = 0; i < n; i += 1) {
          const a = points[Math.max(0, i - 1)];
          const b = points[Math.min(n - 1, i + 1)];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / len;
          const ny = (b[0] - a[0]) / len;
          const k = Math.max(0, (i - tail) / (n - 1 - tail));
          // 從 0 慢慢變粗，到末端再收尖
          const w = thick * k ** 0.8 * (k > 0.72 ? (1 - k) / 0.28 : 1);
          const [x, y] = points[i];
          const px = x + nx * shift;
          const py = y + ny * shift;
          left.push([px + nx * w, py + ny * w]);
          right.push([px - nx * w, py - ny * w]);
        }
        ctx.beginPath();
        for (const [x, y] of left) ctx.lineTo(x, y);
        for (const [x, y] of right.reverse()) ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
      };
      ctx.save();
      for (let layer = 0; layer < (s.double ? 2 : 1); layer += 1) {
        const shift = layer * 20;
        const scale = (1 - layer * 0.35) / 2;
        ctx.fillStyle = s.color;
        ctx.globalAlpha = fade * 0.28;
        ribbon(s.thick * 1.9 * scale, shift);
        ctx.globalAlpha = fade * 0.75;
        ribbon(s.thick * scale, shift);
        ctx.fillStyle = s.core;
        ctx.globalAlpha = fade;
        ribbon(s.thick * 0.45 * scale, shift);
      }
      ctx.restore();
    }

    // 畫一道閃電。
    drawBolt(ctx, b) {
      const fade = b.life / b.total;
      const flicker = 0.6 + Math.random() * 0.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const [layer, width, color, alpha] of [
        [0, b.width * 4, b.color, 0.25],
        [1, b.width * 1.6, b.color, 0.85],
        [2, b.width * 0.6, "#ffffff", 1],
      ]) {
        ctx.globalAlpha = fade * flicker * alpha;
        ctx.strokeStyle = color;
        b.lines.forEach((line, index) => {
          ctx.lineWidth = width * (index ? 0.55 : 1);
          ctx.beginPath();
          line.forEach(([x, y], i) =>
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
          );
          ctx.stroke();
        });
        if (layer === 0)
          this.glow(
            ctx,
            b.lines[0][0][0],
            b.lines[0][0][1],
            40,
            b.color,
            fade * 0.16,
          );
      }
      ctx.globalAlpha = 1;
    }

    // 畫一個打擊特效。
    drawImpact(ctx, impact, calmScale) {
      const progress = impact.age / impact.life;
      const strength = impact.soft ? 0.5 : 1;
      const fade = (1 - progress) ** 1.5 * calmScale * strength;
      const { x, y, size, color } = impact;
      ctx.globalAlpha = 1;
      this.glow(ctx, x, y, size * (1 + progress * 0.5), color, fade * 0.7);
      this.glow(ctx, x, y, size * 0.35, "#fff7dc", fade * 0.8);
      // 擋下的弧形。
      if (impact.kind === "block") {
        // 防守者面前的六角護盾
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.45, 1);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = fade * 0.25;
        ctx.beginPath();
        for (let i = 0; i <= 6; i += 1) {
          const a = (i / 6) * TAU + Math.PI / 6;
          const r = size * (1 + progress * 0.3);
          if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.fill();
        ctx.globalAlpha = fade;
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      // 精準防禦與反擊的環。
      if (impact.kind === "perfect" || impact.kind === "counter") {
        ctx.strokeStyle = impact.kind === "perfect" ? "#ffffff" : color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = fade;
        const r = size * (0.4 + progress * 1.2);
        for (let i = 0; i < 2; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x - r * 1.6, y + (i ? 1 : -1) * r * 0.15);
          ctx.lineTo(x + r * 1.6, y - (i ? 1 : -1) * r * 0.15);
          ctx.stroke();
        }
      }
      // 星形的打擊火花：一出現最銳利，接著擴大變淡
      const grow = 0.55 + Math.min(1, progress * 4) * 0.6;
      // 打中的尖刺。
      for (const [scale, fill, alpha] of [
        [1, color, 0.9],
        [0.42, "#ffffff", 0.9],
      ]) {
        ctx.globalAlpha = fade * alpha;
        ctx.fillStyle = fill;
        ctx.beginPath();
        impact.spikes.forEach((spike, i) => {
          const a = spike.angle + impact.rot;
          const outer = size * spike.length * grow * scale;
          const inner = size * 0.18 * scale;
          const half = Math.PI / impact.spikes.length;
          const ox = x + Math.cos(a) * outer;
          const oy = y + Math.sin(a) * outer;
          const ix = x + Math.cos(a + half) * inner;
          const iy = y + Math.sin(a + half) * inner;
          if (i) ctx.lineTo(ox, oy);
          else ctx.moveTo(ox, oy);
          ctx.lineTo(ix, iy);
        });
        ctx.closePath();
        if (impact.spikes.length) ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  CombatEffects.PALETTE = PALETTE;
  Midnight.CombatEffects = CombatEffects;
})();
