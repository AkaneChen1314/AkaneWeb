"use strict";
// ============================================================
//  程序化貼圖（全部用 Canvas 即時產生，不需要任何圖片檔）
// ============================================================
// 所有做好的貼圖都放在 TEX 裡，例如 TEX.ground、TEX.metal
const TEX = {};

// 建立一張指定大小的空白畫布
function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// 在整張畫布上加入隨機雜訊（讓表面有顆粒感，不會太平滑），amp = 雜訊強度
function noiseFill(ctx, w, h, amp) {
  const id = ctx.getImageData(0, 0, w, h),
    d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(id, 0, 0);
}

// 畫 n 個邊緣模糊的色塊（髒污、水漬、沙塵）。rgb = 顏色、rMin~rMax = 半徑範圍、alpha = 濃度
function blotches(ctx, w, h, n, rgb, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w,
      y = Math.random() * h,
      r = rand(rMin, rMax);
    // 同一個色塊在上下左右各多畫一次，這樣貼圖重複鋪貼時接縫才會連續
    for (const ox of [-w, 0, w])
      for (const oy of [-h, 0, h]) {
        if (
          x + ox + r < 0 ||
          x + ox - r > w ||
          y + oy + r < 0 ||
          y + oy - r > h
        )
          continue;
        // 邊緣漸漸變淡的圓形汙漬。
        const g = ctx.createRadialGradient(
          x + ox,
          y + oy,
          0,
          x + ox,
          y + oy,
          r,
        );
        g.addColorStop(0, `rgba(${rgb},${alpha})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
}

// 畫 n 條彎彎曲曲的裂縫。len = 大約長度、lw = 線寬
function cracks(ctx, w, h, n, color, len, lw = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w,
      y = Math.random() * h,
      a = Math.random() * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = randi(4, 10);
    for (let j = 0; j < steps; j++) {
      a += rand(-0.7, 0.7);
      x += ((Math.cos(a) * len) / steps) * rand(0.5, 1.5);
      y += ((Math.sin(a) * len) / steps) * rand(0.5, 1.5);
      ctx.lineTo(x, y);
      if (Math.random() < 0.2) {
        // 分岔
        const b = a + rand(-1.2, 1.2);
        ctx.lineTo(x + Math.cos(b) * len * 0.2, y + Math.sin(b) * len * 0.2);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
}

// 把畫布轉成 three.js 貼圖（可以重複鋪貼）。srgb = 這張圖是不是顏色圖
function toTex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  return t;
}

// ---- 建築外牆（4x4 格窗戶；一張貼圖 = 14 x 14 公尺）----
function drawFacade(style) {
  const S = 512,
    c = mkCanvas(S, S),
    x = c.getContext("2d"),
    cell = S / 4;
  // style 0 = 水泥外牆、style 1 = 紅磚外牆
  const brick = style === 1;
  x.fillStyle = brick ? "#7d6257" : "#9a968d";
  x.fillRect(0, 0, S, S);
  // 磚牆的磚縫。
  if (brick) {
    // 磚縫
    x.strokeStyle = "rgba(40,28,24,.45)";
    x.lineWidth = 1;
    for (let y = 0; y < S; y += 8) {
      x.beginPath();
      x.moveTo(0, y + 0.5);
      x.lineTo(S, y + 0.5);
      x.stroke();
      for (let bx = ((y / 8) % 2) * 10; bx < S; bx += 20) {
        x.beginPath();
        x.moveTo(bx + 0.5, y);
        x.lineTo(bx + 0.5, y + 8);
        x.stroke();
      }
    }
  }
  // 整面牆的髒污與褪色
  blotches(x, S, S, 26, "40,36,30", 30, 110, 0.22);
  blotches(x, S, S, 14, "190,180,160", 20, 80, 0.12);
  // 4 x 4 = 16 格，每一格是一層樓的一扇窗
  for (let r = 0; r < 4; r++)
    for (let q = 0; q < 4; q++) {
      const cx = q * cell,
        cy = r * cell;
      // 樓板線
      x.fillStyle = "rgba(30,28,26,.55)";
      x.fillRect(cx, cy + cell - 5, cell, 5);
      x.fillStyle = "rgba(255,255,255,.10)";
      x.fillRect(cx, cy + cell - 7, cell, 2);
      const wx = cx + (brick ? 34 : 20),
        wy = cy + 22,
        ww = cell - (brick ? 68 : 40),
        wh = cell - 52;
      // k 決定這扇窗的狀態：破玻璃 / 用木板封住 / 炸開的大洞 / 完好
      const k = Math.random();
      // 窗框與玻璃
      x.fillStyle = "#3d3b38";
      x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      const g = x.createLinearGradient(wx, wy, wx, wy + wh);
      g.addColorStop(0, "#0a0d11");
      g.addColorStop(1, "#161c22");
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      if (k < 0.4) {
        // 殘留的破玻璃
        x.fillStyle = "rgba(120,150,165,.5)";
        for (let i = 0; i < 3; i++) {
          x.beginPath();
          const sx = wx + Math.random() * ww;
          x.moveTo(sx, wy + wh);
          x.lineTo(sx + rand(-14, 14), wy + wh - rand(10, wh * 0.8));
          x.lineTo(sx + rand(8, 22), wy + wh);
          x.fill();
        }
      } else if (k < 0.55) {
        // 木板封窗
        x.fillStyle = "#5a4a38";
        for (let i = 0; i < 4; i++)
          x.fillRect(wx - 2, wy + 4 + i * (wh / 4), ww + 4, wh / 4 - 5);
      } else if (k < 0.7) {
        // 炸開的大洞
        x.fillStyle = "#07080a";
        x.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * TAU,
            rr = rand(0.36, 0.58);
          const px = wx + ww / 2 + Math.cos(a) * ww * rr,
            py = wy + wh / 2 + Math.sin(a) * wh * rr;
          i ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.fill();
      }
      // 水泥大樓的窗戶中間多一根直框
      if (!brick) {
        x.fillStyle = "#4a4844";
        x.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      }
      // 窗台與煙燻痕
      x.fillStyle = "rgba(255,255,255,.14)";
      x.fillRect(wx - 6, wy + wh + 4, ww + 12, 3);
      if (Math.random() < 0.45) {
        const sg = x.createLinearGradient(0, wy - 46, 0, wy);
        sg.addColorStop(0, "rgba(10,8,6,0)");
        sg.addColorStop(1, "rgba(10,8,6,.75)");
        x.fillStyle = sg;
        x.fillRect(wx - 6, wy - 46, ww + 12, 44);
      }
      // 雨水垂流
      if (Math.random() < 0.6) {
        const dg = x.createLinearGradient(0, wy + wh, 0, wy + wh + 40);
        dg.addColorStop(0, "rgba(30,26,20,.45)");
        dg.addColorStop(1, "rgba(30,26,20,0)");
        x.fillStyle = dg;
        const dx = wx + Math.random() * ww;
        x.fillRect(dx, wy + wh + 6, rand(4, 12), 40);
      }
    }
  // 最後加上牆面裂縫與雜訊
  cracks(x, S, S, 14, "rgba(20,18,16,.65)", 120, 1.2);
  noiseFill(x, S, S, 26);
  return toTex(c);
}

// 混凝土（建築頂面、斷面、碎塊用）
function drawConcrete() {
  const S = 256,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#8f8b84";
  x.fillRect(0, 0, S, S);
  blotches(x, S, S, 30, "50,46,40", 14, 60, 0.25);
  blotches(x, S, S, 18, "200,195,180", 10, 40, 0.15);
  cracks(x, S, S, 10, "rgba(25,22,20,.7)", 90, 1.1);
  noiseFill(x, S, S, 38);
  return toTex(c);
}

// 柏油路面（整張地圖的地板）
function drawGround() {
  const S = 512,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#4b4944";
  x.fillRect(0, 0, S, S);
  blotches(x, S, S, 40, "110,98,78", 20, 90, 0.22); // 沙塵
  blotches(x, S, S, 30, "20,20,20", 14, 70, 0.3); // 油污焦痕
  cracks(x, S, S, 26, "rgba(12,12,12,.8)", 150, 1.4);
  for (let i = 0; i < 500; i++) {
    // 碎石
    const g = randi(70, 150);
    x.fillStyle = `rgb(${g},${g - 4},${g - 10})`;
    x.fillRect(
      Math.random() * S,
      Math.random() * S,
      rand(1, 3.5),
      rand(1, 3.5),
    );
  }
  noiseFill(x, S, S, 34);
  return toTex(c);
}

// 人行道地磚
function drawSidewalk() {
  const S = 256,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#77736c";
  x.fillRect(0, 0, S, S);
  blotches(x, S, S, 22, "40,36,30", 14, 60, 0.25);
  x.strokeStyle = "rgba(30,28,26,.6)";
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath();
    x.moveTo(i * 64, 0);
    x.lineTo(i * 64, S);
    x.moveTo(0, i * 64);
    x.lineTo(S, i * 64);
    x.stroke();
  }
  for (let i = 0; i < 5; i++) {
    x.fillStyle = "rgba(25,22,20,.2)";
    x.fillRect(randi(0, 3) * 64 + 2, randi(0, 3) * 64 + 2, 60, 60);
  }
  cracks(x, S, S, 8, "rgba(15,14,12,.7)", 100, 1.2);
  noiseFill(x, S, S, 30);
  return toTex(c);
}

// 道路標線（透明底）
function drawRoadLines() {
  const W = 128,
    H = 256,
    c = mkCanvas(W, H),
    x = c.getContext("2d");
  x.clearRect(0, 0, W, H);
  // 兩側的白色邊線
  x.fillStyle = "rgba(215,210,195,.75)";
  x.fillRect(7, 0, 3, H);
  x.fillRect(W - 10, 0, 3, H);
  // 中央的雙黃線
  x.fillStyle = "rgba(214,170,60,.8)";
  x.fillRect(W / 2 - 4, 0, 2.5, H);
  x.fillRect(W / 2 + 1.5, 0, 2.5, H);
  // 白色虛線（車道線）
  x.fillStyle = "rgba(215,210,195,.7)";
  for (let y = 0; y < H; y += 64) {
    x.fillRect(W * 0.27, y + 8, 3, 34);
    x.fillRect(W * 0.73 - 3, y + 8, 3, 34);
  }
  x.globalCompositeOperation = "destination-out"; // 磨損
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(0,0,0,${rand(0.4, 1)})`;
    x.beginPath();
    x.ellipse(
      Math.random() * W,
      Math.random() * H,
      rand(2, 9),
      rand(3, 16),
      rand(TAU),
      0,
      TAU,
    );
    x.fill();
  }
  const t = toTex(c);
  return t;
}

// 機甲金屬面板（偏白，讓頂點色決定顏色；每個面一格）
function drawMetal() {
  const S = 256,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#dcdcdc";
  x.fillRect(0, 0, S, S);
  blotches(x, S, S, 16, "120,120,120", 20, 80, 0.16);
  // 四周稍微變暗。
  const vg = x.createRadialGradient(
    S / 2,
    S / 2,
    S * 0.3,
    S / 2,
    S / 2,
    S * 0.75,
  ); // 邊緣加深
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.32)");
  x.fillStyle = vg;
  x.fillRect(0, 0, S, S);
  // 畫一條面板接縫：一條深色凹線 + 旁邊一條淺色反光
  const line = (x0, y0, x1, y1) => {
    x.strokeStyle = "rgba(20,20,20,.55)";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(x0, y0);
    x.lineTo(x1, y1);
    x.stroke();
    x.strokeStyle = "rgba(255,255,255,.35)";
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(x0 + 1.5, y0 + 1.5);
    x.lineTo(x1 + 1.5, y1 + 1.5);
    x.stroke();
  };
  x.strokeStyle = "rgba(20,20,20,.5)";
  x.lineWidth = 2;
  x.strokeRect(10, 10, S - 20, S - 20);
  // 面板分割線
  line(10, 92, 150, 92);
  line(150, 92, 180, 62);
  line(180, 62, 246, 62);
  line(96, 92, 96, 246);
  line(96, 170, 246, 170);
  line(200, 170, 200, 246);
  // 鉚釘
  x.fillStyle = "rgba(15,15,15,.6)";
  // 螺絲。
  for (const [rx, ry] of [
    [22, 22],
    [234, 22],
    [22, 234],
    [234, 234],
    [110, 104],
    [234, 182],
    [84, 234],
  ]) {
    x.beginPath();
    x.arc(rx, ry, 3.2, 0, TAU);
    x.fill();
  }
  for (let i = 0; i < 5; i++) x.fillRect(30 + i * 9, 40, 5, 26); // 散熱孔
  x.strokeStyle = "rgba(255,255,255,.4)";
  x.lineWidth = 1; // 刮痕
  // 刮痕。
  for (let i = 0; i < 26; i++) {
    const sx = Math.random() * S,
      sy = Math.random() * S,
      a = rand(TAU),
      l = rand(6, 34);
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    x.stroke();
  }
  // 深色的髒污刮痕
  x.strokeStyle = "rgba(30,25,20,.35)";
  // 刮痕旁的深色陰影。
  for (let i = 0; i < 14; i++) {
    const sx = Math.random() * S,
      sy = Math.random() * S,
      a = rand(TAU),
      l = rand(6, 24);
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    x.stroke();
  }
  noiseFill(x, S, S, 14);
  return toTex(c);
}

// 焦痕 / 彈坑貼花
function drawScorch() {
  const S = 128,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  // 中央最黑、往外漸淡的圓形焦痕
  const g = x.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,.92)");
  g.addColorStop(0.45, "rgba(8,6,4,.7)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = "rgba(0,0,0,.6)";
  x.lineWidth = 1.5;
  // 向外放射的裂紋
  for (let i = 0; i < 14; i++) {
    const a = rand(TAU);
    x.beginPath();
    x.moveTo(S / 2 + Math.cos(a) * 10, S / 2 + Math.sin(a) * 10);
    x.lineTo(
      S / 2 + Math.cos(a) * rand(30, 60),
      S / 2 + Math.sin(a) * rand(30, 60),
    );
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// 機庫地板：乾淨的深色格線
function drawHangarFloor() {
  const S = 256,
    c = mkCanvas(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#141a20";
  x.fillRect(0, 0, S, S);
  x.fillStyle = "#19212a";
  x.fillRect(6, 6, S - 12, S - 12);
  x.strokeStyle = "#2a3642";
  x.lineWidth = 2;
  x.strokeRect(1, 1, S - 2, S - 2);
  x.strokeStyle = "#222c36";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(S / 2, 6);
  x.lineTo(S / 2, S - 6);
  x.moveTo(6, S / 2);
  x.lineTo(S - 6, S / 2);
  x.stroke();
  x.fillStyle = "#35424e";
  for (const [px, py] of [
    [14, 14],
    [S - 14, 14],
    [14, S - 14],
    [S - 14, S - 14],
  ])
    x.fillRect(px - 2, py - 2, 4, 4);
  return toTex(c);
}

// 遊戲啟動時呼叫一次，把所有貼圖畫好
function initTextures() {
  TEX.hangar = drawHangarFloor();
  TEX.facadeA = drawFacade(0);
  TEX.facadeB = drawFacade(1);
  TEX.concrete = drawConcrete();
  TEX.ground = drawGround();
  TEX.sidewalk = drawSidewalk();
  TEX.roadLines = drawRoadLines();
  TEX.metal = drawMetal();
  TEX.scorch = drawScorch();
}
