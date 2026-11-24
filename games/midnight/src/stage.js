/* 檔案導讀：雨夜天台的背景。底圖是 assets/rooftop.jpg，這裡再補上會動的部分：
   路燈與招牌的光、飄過的霧、高架橋上的電車、遠處的閃電、積水的閃光。
   座標一律是場地座標（1280×720），燈的位置對著底圖上畫好的燈。 */
(() => {
  const game = globalThis.Midnight;
  const { FIELD } = game;
  const { width: W, height: H, ground: G } = FIELD;

  // 路燈：x y 位置、size 光暈大小、faulty 會接觸不良
  const LAMPS = [
    { x: 142, y: 505, size: 120 },
    { x: 655, y: 505, size: 120, faulty: true },
    { x: 1151, y: 505, size: 120 },
  ];
  const WALL_LAMP = { x: 157, y: 234, size: 150 };
  // 大樓上的紅色招牌：[中心 x, 中心 y, 光暈半徑, 閃爍的快慢]
  const SIGNS = [
    [1109, 142, 170, 0.6],
    [638, 211, 80, 0.9],
    [986, 78, 80, 1.3],
    [919, 145, 62, 0.8],
    [933, 252, 72, 1.1],
  ];
  // 高架橋：電車從這一點開到那一點
  const RAIL = { from: [878, 251], to: [672, 262], every: 13, time: 3.4 };
  // 地上的積水反光：[x, y, 寬, 顏色]
  const PUDDLES = [
    [325, 642, 150, "#8fc7ff"],
    [455, 660, 210, "#9fc4ff"],
    [845, 655, 190, "#58c8ff"],
    [1105, 660, 170, "#ff4a4a"],
    [165, 660, 150, "#ffb04a"],
  ];
  const MISTS = Array.from({ length: 5 }, (_, i) => ({
    x: (i / 5) * (W + 500) - 250,
    y: 392 + (i % 3) * 26,
    size: 190 + (i % 2) * 70,
    speed: 9 + (i % 3) * 5,
  }));

  // 雨夜天台：底圖、燈光、閃電與霧。
  class Stage {
    // 記下底圖。
    constructor(image) {
      this.image = image;
      this.sprites = new Map();
      this.reset();
    }

    // 重設時間與燈光。
    reset() {
      this.time = 0;
      this.nextBolt = 6 + Math.random() * 6;
      this.bolt = null;
      this.flicker = 1;
    }

    // 一張放射狀的光暈（快取起來重複使用）
    light(color) {
      let canvas = this.sprites.get(color);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, `${color}ff`);
        gradient.addColorStop(0.3, `${color}77`);
        gradient.addColorStop(0.65, `${color}1e`);
        gradient.addColorStop(1, `${color}00`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        this.sprites.set(color, canvas);
      }
      return canvas;
    }

    // 畫一團光。
    glow(ctx, color, x, y, rx, ry, alpha) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.light(color), x - rx, y - ry, rx * 2, ry * 2);
    }

    /* 場景打在角色身上的光（給 rig.js 的邊緣光用）：
       靠近路燈就比較暖，右邊靠近大招牌時帶一點紅。 */
    lightAt(x) {
      let warm = 0;
      for (const lamp of LAMPS)
        warm = Math.max(warm, Math.exp(-(((x - lamp.x) / 150) ** 2)));
      const red = Math.max(0, Math.min(1, (x - 860) / 260));
      return {
        warm: [0.5 + warm * 0.5, 0.33 + warm * 0.28, 0.18 + warm * 0.13],
        cool: [0.28 + red * 0.36, 0.58 - red * 0.28, 0.82 - red * 0.34],
      };
    }

    // 推進燈光閃爍與閃電。
    update(dt, calm) {
      this.time += dt;
      const t = this.time;
      // 接觸不良的路燈：大部分時間正常，偶爾閃兩下
      const cycle = t % 7.3;
      const off = cycle > 5.6 && cycle < 6.4 && Math.sin(t * 46) > 0.1;
      this.flicker = calm || !off ? 1 : 0.35;
      if (this.bolt) {
        this.bolt.age += dt;
        if (this.bolt.age > 0.9) this.bolt = null;
      }
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 11 + Math.random() * 10;
        if (!calm) this.bolt = this.makeBolt();
      }
    }

    // 一道閃電：從雲裡往下彎彎曲曲的折線
    makeBolt() {
      // 只落在沒有大樓擋住的兩塊天空
      const left = Math.random() < 0.5;
      let x = (left ? 440 : 700) + Math.random() * 100;
      let y = -10;
      const points = [[x, y]];
      const end = 110 + Math.random() * 50;
      while (y < end) {
        x += (Math.random() - 0.5) * 46;
        y += 14 + Math.random() * 18;
        points.push([x, y]);
      }
      return { age: 0, points };
    }

    // 畫出整個背景。
    draw(ctx, calm) {
      const { time: t } = this;
      ctx.drawImage(this.image, 0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (this.bolt) this.drawBolt(ctx);

      // 招牌慢慢地一亮一暗
      for (const [i, [x, y, size, speed]] of SIGNS.entries()) {
        const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * speed + i * 1.9);
        this.glow(ctx, "#ff3040", x, y, size, size, 0.1 + pulse * 0.13);
      }

      // 高架橋上的電車
      const run = (t % RAIL.every) / RAIL.time;
      if (run < 1 && !calm) {
        ctx.fillStyle = "#bff2ff";
        for (let i = 0; i < 7; i += 1) {
          const k = run * 1.25 - i * 0.034;
          if (k < 0 || k > 1) continue;
          const x = RAIL.from[0] + (RAIL.to[0] - RAIL.from[0]) * k;
          const y = RAIL.from[1] + (RAIL.to[1] - RAIL.from[1]) * k;
          ctx.globalAlpha = 0.75 * Math.sin(k * Math.PI) ** 0.4;
          ctx.fillRect(x, y - 1.6, 5.4, 2.6);
        }
      }

      // 霧在欄杆後面慢慢飄
      // 飄過的霧。
      for (const mist of MISTS) {
        const span = W + 2 * mist.size + 100;
        const x = ((mist.x + t * mist.speed) % span) - mist.size;
        this.glow(
          ctx,
          "#5c88b0",
          x,
          mist.y,
          mist.size,
          mist.size * 0.26,
          0.085,
        );
      }

      // 路燈：光暈、照在牆上與地上的光
      const breath = calm ? 1 : 0.94 + 0.06 * Math.sin(t * 2.3);
      // 路燈。
      for (const lamp of LAMPS) {
        const power = breath * (lamp.faulty ? this.flicker : 1);
        const { x, y, size } = lamp;
        this.glow(ctx, "#ffa63c", x, y, size, size * 0.62, 0.3 * power);
        this.glow(ctx, "#ffdf9a", x, y, 46, 15, 0.5 * power);
        this.glow(ctx, "#ff9a30", x, G - 24, 120, 46, 0.2 * power);
        this.glow(ctx, "#ff9a30", x, G + 62, 70, 62, 0.14 * power);
      }
      const wall = WALL_LAMP;
      this.glow(
        ctx,
        "#ffb04a",
        wall.x,
        wall.y,
        wall.size,
        wall.size * 1.2,
        0.2 * breath,
      );

      // 積水的波光
      // 地上的積水反光。
      if (!calm)
        for (const [i, [x, y, size, color]] of PUDDLES.entries()) {
          const a = 0.05 + 0.045 * Math.sin(t * 1.7 + i * 2.1);
          const sway = Math.sin(t * 0.9 + i) * 8;
          this.glow(ctx, color, x + sway, y, size * 0.6, 17, a);
        }
      ctx.restore();
    }

    // 閃電：先亮一下、暗掉、再亮一下。雲層的亮度壓得很低，不會刺眼
    drawBolt(ctx) {
      const { age, points } = this.bolt;
      const pulse =
        Math.max(0, 1 - age / 0.14) * 0.7 +
        Math.max(0, 1 - Math.abs(age - 0.26) / 0.16);
      const fade = Math.min(1, pulse);
      if (fade <= 0) return;
      const sky = ctx.createLinearGradient(0, 0, 0, 340);
      sky.addColorStop(0, "#6f8fc8");
      sky.addColorStop(1, "#6f8fc800");
      ctx.globalAlpha = fade * 0.17;
      ctx.fillStyle = sky;
      ctx.fillRect(400, 0, W - 400, 340);
      const [x, y] = points[points.length - 1];
      this.glow(ctx, "#9fc0ff", x, y * 0.6, 260, 170, fade * 0.16);
      ctx.strokeStyle = "#dbe8ff";
      ctx.lineJoin = "round";
      ctx.globalAlpha = fade * 0.42;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      points.forEach(([px, py], i) =>
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py),
      );
      ctx.stroke();
    }
  }

  game.Stage = Stage;
})();
