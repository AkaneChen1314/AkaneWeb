"use strict";
// ===== 程序化美術：所有圖像皆以向量即時繪製，支援高解析度 =====
// 畫好的符號快取，避免每一格畫面重畫。
const SYMC = {};
// 取得一個符號的圖片；第一次會先畫好。
function getSym(id) {
  let c = SYMC[id];
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 200;
  paintSym(c.getContext("2d"), id);
  SYMC[id] = c;
  return c;
}

// ---------- 基本圖形 == ----------

function flamePath(g, cx, cy, w, h) {
  g.beginPath();
  g.moveTo(cx, cy - h * 0.5);
  g.bezierCurveTo(
    cx + w * 0.12,
    cy - h * 0.25,
    cx + w * 0.55,
    cy - h * 0.12,
    cx + w * 0.45,
    cy + h * 0.2,
  );
  g.bezierCurveTo(
    cx + w * 0.4,
    cy + h * 0.45,
    cx + w * 0.15,
    cy + h * 0.5,
    cx,
    cy + h * 0.5,
  );
  g.bezierCurveTo(
    cx - w * 0.15,
    cy + h * 0.5,
    cx - w * 0.4,
    cy + h * 0.45,
    cx - w * 0.45,
    cy + h * 0.2,
  );
  g.bezierCurveTo(
    cx - w * 0.55,
    cy - h * 0.05,
    cx - w * 0.2,
    cy - h * 0.15,
    cx,
    cy - h * 0.5,
  );
  g.closePath();
}
// 星形；n 是角數，ro、ri 是外圈與內圈半徑。
function star5(g, cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro,
      a = rot + (i * Math.PI) / n;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}
// 由座標連成的多邊形。
function poly(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
}
// 愛心形狀。
function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.85);
  g.bezierCurveTo(
    cx - s * 1.15,
    cy + s * 0.05,
    cx - s * 0.95,
    cy - s * 0.9,
    cx,
    cy - s * 0.38,
  );
  g.bezierCurveTo(
    cx + s * 0.95,
    cy - s * 0.9,
    cx + s * 1.15,
    cy + s * 0.05,
    cx,
    cy + s * 0.85,
  );
  g.closePath();
}
// 十字閃光。
function sparkle(g, x, y, r, col = "#fff") {
  g.save();
  g.fillStyle = col;
  star5(g, x, y, r, r * 0.22, 4, 0);
  g.fill();
  g.restore();
}

// ---------- 拉霸與卡片的符號 == ----------

function paintSym(g, id) {
  g.save();
  g.translate(100, 100);
  // 背後的光暈。
  const glowBg = (col, r = 80, a = 0.55) => {
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = a;
    g.drawImage(glowSpr(col), -r, -r, r * 2, r * 2);
    g.restore();
  };
  // 描邊。
  const outline = (w, col) => {
    g.lineJoin = "round";
    g.lineCap = "round";
    g.lineWidth = w;
    g.strokeStyle = col;
    g.stroke();
  };
  let gr;
  switch (id) {
    // 火焰。
    case "fire": {
      glowBg("#ff4a10", 92, 0.7);
      flamePath(g, -38, 22, 44, 70);
      g.fillStyle = "#e83a08";
      g.fill();
      flamePath(g, 40, 26, 40, 60);
      g.fillStyle = "#e83a08";
      g.fill();
      flamePath(g, 0, 0, 128, 160);
      outline(9, "#4a0800");
      gr = g.createLinearGradient(0, -80, 0, 80);
      gr.addColorStop(0, "#ffcf3a");
      gr.addColorStop(0.35, "#ff6a12");
      gr.addColorStop(1, "#b81800");
      g.fillStyle = gr;
      g.fill();
      flamePath(g, 0, 18, 86, 116);
      gr = g.createLinearGradient(0, -40, 0, 76);
      gr.addColorStop(0, "#fff2a0");
      gr.addColorStop(1, "#ff9a10");
      g.fillStyle = gr;
      g.fill();
      flamePath(g, 0, 34, 42, 66);
      gr = g.createLinearGradient(0, 0, 0, 66);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(1, "#fff0a0");
      g.fillStyle = gr;
      g.fill();
      break;
    }
    // 雪花。
    case "ice": {
      glowBg("#48c8ff", 90, 0.6);
      const arm = () => {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -74);
        g.moveTo(0, -28);
        g.lineTo(-20, -48);
        g.moveTo(0, -28);
        g.lineTo(20, -48);
        g.moveTo(0, -52);
        g.lineTo(-13, -66);
        g.moveTo(0, -52);
        g.lineTo(13, -66);
      };
      g.lineCap = "round";
      for (let k = 0; k < 6; k++) {
        g.save();
        g.rotate((k * TAU) / 6);
        arm();
        g.lineWidth = 17;
        g.strokeStyle = "#0a3a7a";
        g.stroke();
        g.restore();
      }
      for (let k = 0; k < 6; k++) {
        g.save();
        g.rotate((k * TAU) / 6);
        arm();
        gr = g.createLinearGradient(0, 0, 0, -74);
        gr.addColorStop(0, "#ffffff");
        gr.addColorStop(1, "#5ad0ff");
        g.lineWidth = 9;
        g.strokeStyle = gr;
        g.stroke();
        g.restore();
      }
      poly(
        g,
        [0, 1, 2, 3, 4, 5].map((i) => [
          Math.cos((i * TAU) / 6) * 24,
          Math.sin((i * TAU) / 6) * 24,
        ]),
      );
      outline(6, "#0a3a7a");
      gr = g.createRadialGradient(-6, -6, 2, 0, 0, 26);
      gr.addColorStop(0, "#fff");
      gr.addColorStop(1, "#7ad8ff");
      g.fillStyle = gr;
      g.fill();
      sparkle(g, 40, -48, 14);
      break;
    }
    // 閃電。
    case "thunder": {
      glowBg("#ffe03a", 92, 0.65);
      const P = [
        [18, -84],
        [-44, 10],
        [-6, 10],
        [-28, 84],
        [48, -16],
        [8, -16],
        [36, -84],
      ];
      poly(g, P);
      outline(13, "#4a3000");
      gr = g.createLinearGradient(-40, -80, 40, 80);
      gr.addColorStop(0, "#fffde0");
      gr.addColorStop(0.45, "#ffe03a");
      gr.addColorStop(1, "#ff8a00");
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.moveTo(18, -76);
      g.lineTo(-30, 4);
      g.lineWidth = 5;
      g.strokeStyle = "rgba(255,255,255,.85)";
      g.stroke();
      sparkle(g, -48, -50, 12);
      sparkle(g, 56, 50, 10);
      break;
    }
    // 毒液。
    case "poison": {
      glowBg("#7cf03a", 90, 0.55);
      g.beginPath();
      g.moveTo(0, -84);
      g.bezierCurveTo(28, -44, 62, -8, 62, 26);
      g.arc(0, 26, 62, 0, Math.PI, false);
      g.bezierCurveTo(-62, -8, -28, -44, 0, -84);
      g.closePath();
      outline(10, "#0a3a06");
      gr = g.createRadialGradient(-22, -6, 4, 0, 20, 80);
      gr.addColorStop(0, "#eaffb0");
      gr.addColorStop(0.45, "#6ae02a");
      gr.addColorStop(1, "#1a6a10");
      g.fillStyle = gr;
      g.fill();
      // 骷髏
      g.fillStyle = "rgba(240,255,230,.95)";
      g.beginPath();
      g.ellipse(0, 26, 28, 25, 0, 0, TAU);
      g.fill();
      rr(g, -16, 40, 32, 18, 5);
      g.fill();
      g.fillStyle = "#123a0a";
      g.beginPath();
      g.arc(-11, 24, 8, 0, TAU);
      g.arc(11, 24, 8, 0, TAU);
      g.fill();
      poly(g, [
        [0, 34],
        [-4, 41],
        [4, 41],
      ]);
      g.fill();
      g.fillRect(-7, 48, 3, 9);
      g.fillRect(-1, 48, 3, 9);
      g.fillRect(5, 48, 3, 9);
      g.fillStyle = "rgba(255,255,255,.75)";
      g.beginPath();
      g.ellipse(-26, -14, 8, 14, -0.4, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(34, -30, 7, 0, TAU);
      g.arc(46, -50, 4, 0, TAU);
      g.fillStyle = "rgba(200,255,150,.85)";
      g.fill();
      break;
    }
    // 旋風。
    case "wind": {
      glowBg("#5affc8", 90, 0.5);
      g.lineCap = "round";
      const arm = () => {
        g.beginPath();
        for (let a = 0; a <= 4.4; a += 0.08) {
          const r = 76 - a * 13;
          const x = Math.cos(a) * r,
            y = Math.sin(a) * r;
          a ? g.lineTo(x, y) : g.moveTo(x, y);
        }
      };
      for (let k = 0; k < 3; k++) {
        g.save();
        g.rotate((k * TAU) / 3);
        arm();
        g.lineWidth = 22;
        g.strokeStyle = "#063a30";
        g.stroke();
        g.restore();
      }
      for (let k = 0; k < 3; k++) {
        g.save();
        g.rotate((k * TAU) / 3);
        arm();
        gr = g.createLinearGradient(76, 0, -20, 0);
        gr.addColorStop(0, "#e8fff8");
        gr.addColorStop(1, "#2ad8a8");
        g.lineWidth = 12;
        g.strokeStyle = gr;
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.arc(0, 0, 14, 0, TAU);
      g.fillStyle = "#fff";
      g.fill();
      outline(4, "#063a30");
      break;
    }
    // 岩石。
    case "earth": {
      glowBg("#d8923a", 86, 0.45);
      const P = [
        [-72, 40],
        [-60, -18],
        [-22, -64],
        [30, -60],
        [70, -12],
        [64, 48],
        [12, 72],
        [-42, 66],
      ];
      poly(g, P);
      outline(11, "#2a1404");
      gr = g.createLinearGradient(-60, -60, 60, 70);
      gr.addColorStop(0, "#e8b070");
      gr.addColorStop(0.5, "#a8682a");
      gr.addColorStop(1, "#5a3010");
      g.fillStyle = gr;
      g.fill();
      const C = [6, 2];
      for (let i = 0; i < P.length; i++) {
        const a = P[i],
          b = P[(i + 1) % P.length];
        poly(g, [C, a, b]);
        g.fillStyle = `rgba(${i < 3 ? "255,230,190" : "40,20,0"},${i < 3 ? 0.18 + i * 0.05 : 0.1 + (i - 3) * 0.05})`;
        g.fill();
      }
      g.beginPath();
      g.moveTo(-40, -30);
      g.lineTo(-10, -6);
      g.lineTo(-20, 20);
      g.lineTo(18, 30);
      g.lineTo(30, 56);
      g.lineWidth = 6;
      g.strokeStyle = "#ffd04a";
      g.shadowColor = "#ffb020";
      g.shadowBlur = 12;
      g.stroke();
      g.shadowBlur = 0;
      break;
    }
    // 金幣。
    case "coin":
    case "coin_plain": {
      if (id === "coin") glowBg("#ffcf3a", 92, 0.6);
      g.beginPath();
      g.arc(0, 0, 74, 0, TAU);
      outline(10, "#5a2a00");
      gr = g.createRadialGradient(-24, -28, 6, 0, 0, 78);
      gr.addColorStop(0, "#fff8c0");
      gr.addColorStop(0.5, "#ffcf3a");
      gr.addColorStop(1, "#c87a0a");
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.arc(0, 0, 57, 0, TAU);
      g.lineWidth = 6;
      g.strokeStyle = "#d8901a";
      g.stroke();
      g.font = `900 76px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#fff6c0";
      g.fillText("金", -2, 2);
      g.fillStyle = "#a8600a";
      g.fillText("金", 1, 5);
      g.beginPath();
      g.ellipse(-30, -36, 16, 8, -0.6, 0, TAU);
      g.fillStyle = "rgba(255,255,255,.6)";
      g.fill();
      break;
    }
    // 寶石。
    case "gem":
    case "diamond": {
      glowBg("#5ab8ff", 92, 0.6);
      const out = [
        [-72, -20],
        [-42, -60],
        [42, -60],
        [72, -20],
        [0, 80],
      ];
      poly(g, out);
      outline(10, "#0a2060");
      const F = [
        [
          [
            [-42, -60],
            [42, -60],
            [24, -20],
            [-24, -20],
          ],
          "#d8f4ff",
        ],
        [
          [
            [-72, -20],
            [-42, -60],
            [-24, -20],
          ],
          "#8ad8ff",
        ],
        [
          [
            [72, -20],
            [42, -60],
            [24, -20],
          ],
          "#3a8ae8",
        ],
        [
          [
            [-72, -20],
            [-24, -20],
            [0, 80],
          ],
          "#4aa8ff",
        ],
        [
          [
            [-24, -20],
            [24, -20],
            [0, 80],
          ],
          "#9ae0ff",
        ],
        [
          [
            [24, -20],
            [72, -20],
            [0, 80],
          ],
          "#2a5ad0",
        ],
      ];
      for (const [p, c] of F) {
        poly(g, p);
        g.fillStyle = c;
        g.fill();
      }
      g.globalAlpha = 0.5;
      poly(g, [
        [-42, -60],
        [-24, -20],
        [-30, -20],
        [-50, -50],
      ]);
      g.fillStyle = "#fff";
      g.fill();
      g.globalAlpha = 1;
      sparkle(g, 30, -44, 18);
      sparkle(g, -50, 30, 9);
      break;
    }
    // 愛心。
    case "heart": {
      glowBg("#ff3a6a", 90, 0.6);
      heartPath(g, 0, 0, 78);
      outline(10, "#4a0010");
      gr = g.createRadialGradient(-26, -30, 4, 0, 0, 90);
      gr.addColorStop(0, "#ffc0d0");
      gr.addColorStop(0.45, "#ff3050");
      gr.addColorStop(1, "#a0001a");
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.ellipse(-32, -30, 18, 11, -0.6, 0, TAU);
      g.fillStyle = "rgba(255,255,255,.7)";
      g.fill();
      break;
    }
    // 寶箱。
    case "chest": {
      glowBg("#ffcf3a", 92, 0.6);
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.8;
      g.drawImage(glowSpr("#fff2a0"), -70, -50, 140, 50);
      g.restore();
      rr(g, -72, -6, 144, 72, 8);
      outline(9, "#2a1404");
      gr = g.createLinearGradient(0, -6, 0, 66);
      gr.addColorStop(0, "#b8743a");
      gr.addColorStop(1, "#5a3010");
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.moveTo(-72, -6);
      g.lineTo(-72, -34);
      g.quadraticCurveTo(0, -84, 72, -34);
      g.lineTo(72, -6);
      g.closePath();
      outline(9, "#2a1404");
      gr = g.createLinearGradient(0, -70, 0, -6);
      gr.addColorStop(0, "#d8904a");
      gr.addColorStop(1, "#7a4418");
      g.fillStyle = gr;
      g.fill();
      const gold = g.createLinearGradient(0, -70, 0, 66);
      gold.addColorStop(0, "#fff2a0");
      gold.addColorStop(0.5, "#ffbf2a");
      gold.addColorStop(1, "#a86a0a");
      g.fillStyle = gold;
      g.fillRect(-56, -54, 14, 120);
      g.fillRect(42, -54, 14, 120);
      g.fillRect(-72, -12, 144, 12);
      rr(g, -15, -16, 30, 34, 6);
      g.fill();
      outline(4, "#5a3000");
      g.fillStyle = "#2a1404";
      g.beginPath();
      g.arc(0, -2, 5, 0, TAU);
      g.fill();
      g.fillRect(-2, 0, 4, 10);
      sparkle(g, 50, -60, 14);
      sparkle(g, -40, -64, 9);
      break;
    }
    // 轉盤。
    case "wheel": {
      glowBg("#ff4ad8", 94, 0.55);
      const cols = [
        "#ff3a5a",
        "#ffcf3a",
        "#3ad8ff",
        "#7cff3a",
        "#c45aff",
        "#ff8a1a",
        "#3a7aff",
        "#ff4ad8",
      ];
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(0, -6);
        g.arc(0, -6, 66, (i * TAU) / 8, ((i + 1) * TAU) / 8);
        g.closePath();
        g.fillStyle = cols[i];
        g.fill();
        g.strokeStyle = "rgba(255,255,255,.6)";
        g.lineWidth = 2;
        g.stroke();
      }
      g.beginPath();
      g.arc(0, -6, 70, 0, TAU);
      g.lineWidth = 12;
      g.strokeStyle = "#ffcf3a";
      g.stroke();
      g.beginPath();
      g.arc(0, -6, 76, 0, TAU);
      g.lineWidth = 4;
      g.strokeStyle = "#6a3a00";
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        g.beginPath();
        g.arc(Math.cos(a) * 70, -6 + Math.sin(a) * 70, 3.5, 0, TAU);
        g.fillStyle = "#fff";
        g.fill();
      }
      g.beginPath();
      g.arc(0, -6, 14, 0, TAU);
      g.fillStyle = "#ffe080";
      g.fill();
      outline(4, "#6a3a00");
      poly(g, [
        [-12, -86],
        [12, -86],
        [0, -64],
      ]);
      g.fillStyle = "#ff2a3a";
      g.fill();
      outline(3, "#4a0000");
      rr(g, -64, 44, 128, 34, 12);
      g.fillStyle = "#2a0a4a";
      g.fill();
      outline(4, "#ffcf3a");
      g.font = `900 26px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffe080";
      g.fillText("BONUS", 0, 62);
      break;
    }
    // 彩色球（百搭）。
    case "wild": {
      // 彩色百搭球：可以變成任何圖案
      glowBg("#ffffff", 100, 0.6);
      g.beginPath();
      g.arc(0, -8, 70, 0, TAU);
      outline(12, "#2a0a4a");
      gr = g.createConicGradient
        ? g.createConicGradient(-0.6, 0, -8)
        : g.createLinearGradient(-70, 0, 70, 0);
      for (let k = 0; k <= 7; k++)
        gr.addColorStop(k / 7, hslHex((k * 360) / 7, 100, 60));
      g.fillStyle = gr;
      g.fill();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.ellipse(0, -8, 70, 18 + k * 18, -0.5 + k * 0.5, 0, TAU);
        g.strokeStyle = "rgba(255,255,255,.28)";
        g.lineWidth = 3;
        g.stroke();
      }
      gr = g.createRadialGradient(-24, -34, 4, 0, -8, 70);
      gr.addColorStop(0, "rgba(255,255,255,.95)");
      gr.addColorStop(0.3, "rgba(255,255,255,.2)");
      gr.addColorStop(1, "rgba(30,0,60,.45)");
      g.beginPath();
      g.arc(0, -8, 70, 0, TAU);
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = "#ffffff";
      g.stroke();
      g.beginPath();
      g.ellipse(-26, -36, 20, 11, -0.6, 0, TAU);
      g.fillStyle = "rgba(255,255,255,.85)";
      g.fill();
      for (const [sx, sy, sr] of [
        [58, -64, 12],
        [-62, 34, 9],
        [66, 22, 7],
      ]) {
        star5(g, sx, sy, sr, sr * 0.4);
        g.fillStyle = "#ffffff";
        g.fill();
      }
      rr(g, -54, 44, 108, 38, 16);
      g.fillStyle = "#3a0a6a";
      g.fill();
      outline(4, "#ffffff");
      g.font = `900 28px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 5;
      g.strokeStyle = "#8a2aff";
      g.strokeText("百搭", 0, 64);
      g.fillStyle = "#fff";
      g.fillText("百搭", 0, 64);
      break;
    }
    // 倍率球。
    case "mult": {
      glowBg("#ff6aff", 96, 0.7);
      g.beginPath();
      g.arc(0, 0, 66, 0, TAU);
      gr = g.createConicGradient
        ? g.createConicGradient(0, 0, 0)
        : g.createLinearGradient(-66, 0, 66, 0);
      for (let k = 0; k <= 6; k++)
        gr.addColorStop(k / 6, hslHex(k * 60, 100, 60));
      g.fillStyle = gr;
      g.fill();
      gr = g.createRadialGradient(-22, -26, 4, 0, 0, 66);
      gr.addColorStop(0, "rgba(255,255,255,.95)");
      gr.addColorStop(0.35, "rgba(255,255,255,.15)");
      gr.addColorStop(1, "rgba(40,0,60,.55)");
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = "#fff";
      g.stroke();
      g.font = `900 64px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 10;
      g.strokeStyle = "#5a0080";
      g.strokeText("×", 0, 4);
      g.fillStyle = "#fff";
      g.fillText("×", 0, 4);
      break;
    }
    // 塔。
    case "tower": {
      glowBg("#5ab8ff", 92, 0.55);
      g.fillStyle = "rgba(0,0,0,.3)";
      g.beginPath();
      g.ellipse(0, 78, 56, 12, 0, 0, TAU);
      g.fill();
      rr(g, -40, -30, 80, 106, 6);
      outline(9, "#1a1a2a");
      let tg = g.createLinearGradient(-40, 0, 40, 0);
      tg.addColorStop(0, "#6a7088");
      tg.addColorStop(0.45, "#c8d0e8");
      tg.addColorStop(1, "#4a5068");
      g.fillStyle = tg;
      g.fill();
      g.strokeStyle = "rgba(30,30,50,.5)";
      g.lineWidth = 2;
      for (let yy = -14; yy < 74; yy += 16) {
        g.beginPath();
        g.moveTo(-40, yy);
        g.lineTo(40, yy);
        g.stroke();
        for (let xx = (yy / 16) % 2 ? -20 : 0; xx < 40; xx += 40) {
          g.beginPath();
          g.moveTo(xx, yy);
          g.lineTo(xx, yy + 16);
          g.stroke();
        }
      }
      for (let k = 0; k < 4; k++) {
        rr(g, -46 + k * 25, -52, 17, 24, 3);
        g.fillStyle = "#b8c0d8";
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = "#1a1a2a";
        g.stroke();
      }
      rr(g, -48, -32, 96, 10, 3);
      g.fillStyle = "#8890a8";
      g.fill();
      g.lineWidth = 4;
      g.stroke();
      g.beginPath();
      g.moveTo(-12, 74);
      g.lineTo(-12, 46);
      g.arc(0, 46, 12, Math.PI, 0);
      g.lineTo(12, 74);
      g.closePath();
      g.fillStyle = "#3a2410";
      g.fill();
      rr(g, -9, -4, 18, 24, 9);
      g.fillStyle = "#ffe080";
      g.fill();
      g.save();
      g.globalCompositeOperation = "lighter";
      g.drawImage(glowSpr("#ffcf3a"), -30, -22, 60, 60);
      g.restore();
      g.strokeStyle = "#3a2a1a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, -52);
      g.lineTo(0, -92);
      g.stroke();
      g.beginPath();
      g.moveTo(2, -92);
      g.quadraticCurveTo(26, -86, 40, -90);
      g.lineTo(34, -78);
      g.quadraticCurveTo(22, -74, 2, -76);
      g.closePath();
      g.fillStyle = "#ff3a4a";
      g.fill();
      outline(3, "#5a0010");
      sparkle(g, 52, -40, 12);
      break;
    }
    // 劍。
    case "sword": {
      glowBg("#9ad8ff", 92, 0.6);
      g.save();
      g.rotate(-Math.PI / 4);
      poly(g, [
        [-9, -78],
        [0, -96],
        [9, -78],
        [9, 30],
        [-9, 30],
      ]);
      outline(9, "#1a2a4a");
      let sg = g.createLinearGradient(-9, 0, 9, 0);
      sg.addColorStop(0, "#9aa8c8");
      sg.addColorStop(0.45, "#ffffff");
      sg.addColorStop(1, "#6a7898");
      g.fillStyle = sg;
      g.fill();
      g.strokeStyle = "rgba(120,200,255,.8)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -88);
      g.lineTo(0, 26);
      g.stroke();
      rr(g, -34, 28, 68, 14, 6);
      g.fillStyle = "#ffcf3a";
      g.fill();
      outline(5, "#5a3000");
      rr(g, -7, 42, 14, 34, 4);
      g.fillStyle = "#6a3a1a";
      g.fill();
      outline(4, "#2a1404");
      g.beginPath();
      g.arc(0, 84, 10, 0, TAU);
      g.fillStyle = "#ff3a5a";
      g.fill();
      outline(4, "#5a0010");
      g.restore();
      sparkle(g, -40, -48, 16);
      sparkle(g, 50, 40, 9);
      break;
    }
    // 櫻桃。
    case "cherry": {
      glowBg("#ff3a5a", 90, 0.55);
      g.strokeStyle = "#3a6a1a";
      g.lineWidth = 7;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-28, 20);
      g.quadraticCurveTo(-10, -50, 22, -70);
      g.stroke();
      g.beginPath();
      g.moveTo(32, 26);
      g.quadraticCurveTo(28, -30, 22, -70);
      g.stroke();
      g.beginPath();
      g.ellipse(36, -64, 26, 12, -0.4, 0, TAU);
      g.fillStyle = "#5ac83a";
      g.fill();
      outline(4, "#1a4a0a");
      for (const [x, y] of [
        [-30, 36],
        [32, 42],
      ]) {
        g.beginPath();
        g.arc(x, y, 36, 0, TAU);
        outline(9, "#4a0010");
        gr = g.createRadialGradient(x - 12, y - 14, 3, x, y, 38);
        gr.addColorStop(0, "#ffb0c0");
        gr.addColorStop(0.45, "#ff2a4a");
        gr.addColorStop(1, "#8a0018");
        g.fillStyle = gr;
        g.fill();
        g.beginPath();
        g.ellipse(x - 12, y - 14, 10, 6, -0.6, 0, TAU);
        g.fillStyle = "rgba(255,255,255,.75)";
        g.fill();
      }
      break;
    }
    // 鈴鐺。
    case "bell": {
      glowBg("#ffcf3a", 92, 0.6);
      g.beginPath();
      g.moveTo(-64, 46);
      g.quadraticCurveTo(-60, -60, 0, -66);
      g.quadraticCurveTo(60, -60, 64, 46);
      g.lineTo(76, 58);
      g.lineTo(-76, 58);
      g.closePath();
      outline(10, "#5a3000");
      gr = g.createLinearGradient(-60, -60, 60, 60);
      gr.addColorStop(0, "#fff6b0");
      gr.addColorStop(0.45, "#ffcf3a");
      gr.addColorStop(1, "#b8700a");
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.arc(0, 66, 16, 0, TAU);
      g.fillStyle = "#ffb020";
      g.fill();
      outline(5, "#5a3000");
      g.beginPath();
      g.arc(0, -72, 12, 0, TAU);
      g.fillStyle = "#ffe080";
      g.fill();
      outline(5, "#5a3000");
      g.beginPath();
      g.ellipse(-26, -20, 10, 26, 0.3, 0, TAU);
      g.fillStyle = "rgba(255,255,255,.6)";
      g.fill();
      sparkle(g, 56, -50, 14);
      break;
    }
    // BAR。
    case "bar": {
      glowBg("#ff8a3a", 90, 0.5);
      for (let k = 0; k < 3; k++) {
        const y = -56 + k * 40;
        rr(g, -78, y, 156, 34, 8);
        outline(7, "#2a1404");
        gr = g.createLinearGradient(0, y, 0, y + 34);
        gr.addColorStop(0, "#ffb060");
        gr.addColorStop(1, "#c8400a");
        g.fillStyle = gr;
        g.fill();
        g.font = `900 26px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#fff";
        g.fillText("BAR", 0, y + 18);
      }
      break;
    }
    // 藥水。
    case "potion": {
      glowBg("#7cff3a", 90, 0.55);
      g.beginPath();
      g.moveTo(-14, -70);
      g.lineTo(14, -70);
      g.lineTo(14, -30);
      g.quadraticCurveTo(66, -10, 62, 34);
      g.quadraticCurveTo(56, 80, 0, 80);
      g.quadraticCurveTo(-56, 80, -62, 34);
      g.quadraticCurveTo(-66, -10, -14, -30);
      g.closePath();
      outline(9, "#0a3a1a");
      gr = g.createLinearGradient(0, -70, 0, 80);
      gr.addColorStop(0, "rgba(220,255,240,.9)");
      gr.addColorStop(0.35, "#c8fff0");
      gr.addColorStop(0.36, "#7cff3a");
      gr.addColorStop(1, "#1a8a2a");
      g.fillStyle = gr;
      g.fill();
      rr(g, -20, -84, 40, 18, 5);
      g.fillStyle = "#a86a3a";
      g.fill();
      outline(5, "#3a1a04");
      for (const [x, y, r] of [
        [-18, 30, 8],
        [12, 50, 6],
        [20, 18, 5],
      ]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fillStyle = "rgba(255,255,255,.75)";
        g.fill();
      }
      sparkle(g, 50, -50, 14);
      break;
    }
    // 皇冠。
    case "crown": {
      glowBg("#ffe060", 96, 0.7);
      poly(g, [
        [-78, 50],
        [-84, -40],
        [-40, 0],
        [0, -66],
        [40, 0],
        [84, -40],
        [78, 50],
      ]);
      outline(10, "#5a3000");
      gr = g.createLinearGradient(0, -66, 0, 50);
      gr.addColorStop(0, "#fff6b0");
      gr.addColorStop(0.5, "#ffcf3a");
      gr.addColorStop(1, "#b8700a");
      g.fillStyle = gr;
      g.fill();
      rr(g, -80, 44, 160, 24, 8);
      g.fillStyle = "#e8a020";
      g.fill();
      outline(6, "#5a3000");
      for (const [x, y, col] of [
        [0, 18, "#ff2a4a"],
        [-46, 26, "#3a8aff"],
        [46, 26, "#3aff8a"],
      ]) {
        g.beginPath();
        g.arc(x, y, 11, 0, TAU);
        g.fillStyle = col;
        g.fill();
        outline(3, "#5a3000");
      }
      for (const [x, y] of [
        [-84, -40],
        [0, -66],
        [84, -40],
      ]) {
        g.beginPath();
        g.arc(x, y, 9, 0, TAU);
        g.fillStyle = "#fff";
        g.fill();
      }
      sparkle(g, 60, -64, 16);
      break;
    }
    // 幸運 7。
    case "seven": {
      glowBg("#ff2a2a", 96, 0.75);
      g.font = '900 190px Impact, "Arial Black", sans-serif';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = 24;
      g.strokeStyle = "#3a0000";
      g.strokeText("7", 0, 10);
      g.lineWidth = 12;
      g.strokeStyle = "#ffcf3a";
      g.strokeText("7", 0, 10);
      gr = g.createLinearGradient(0, -80, 0, 90);
      gr.addColorStop(0, "#ffe0e0");
      gr.addColorStop(0.35, "#ff3a3a");
      gr.addColorStop(1, "#8a0000");
      g.fillStyle = gr;
      g.fillText("7", 0, 10);
      sparkle(g, -58, -60, 16);
      sparkle(g, 62, 54, 12);
      sparkle(g, 54, -66, 8);
      break;
    }
  }
  g.restore();
}

// 畫一枚金幣；rot 是旋轉角度，側面會變窄。
function drawCoin(c, x, y, r, rot = 0) {
  const sx = Math.abs(Math.cos(rot)) * 0.9 + 0.1;
  c.save();
  c.translate(x, y);
  c.scale(sx, 1);
  c.drawImage(getSym("coin_plain"), -r * 1.35, -r * 1.35, r * 2.7, r * 2.7);
  c.restore();
}
// 畫一個遺物圖示；稀有度越高光芒越強。
function drawRelic(c, rel, x, y, s, o = {}) {
  const col = RAR_COL[rel.r];
  c.save();
  if (rel.r >= 2) {
    c.globalCompositeOperation = "lighter";
    glow(c, x, y, s * 0.9, col, 0.45 + 0.15 * Math.sin(G.time * 3));
    c.globalCompositeOperation = "source-over";
  }
  c.beginPath();
  c.arc(x, y, s / 2, 0, TAU);
  const gr = c.createRadialGradient(x - s * 0.15, y - s * 0.2, 1, x, y, s / 2);
  gr.addColorStop(0, mixHex(col, "#ffffff", 0.2));
  gr.addColorStop(0.6, mixHex(col, "#1a1030", 0.55));
  gr.addColorStop(1, mixHex(col, "#000000", 0.7));
  c.fillStyle = gr;
  c.fill();
  c.lineWidth = Math.max(2, s * 0.06);
  c.strokeStyle = col;
  c.stroke();
  c.font = `${Math.round(s * 0.52)}px ${EMOJI_FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#fff";
  c.fillText(rel.e, x, y + s * 0.04);
  if (o.count > 1)
    txt(c, "×" + o.count, x + s * 0.38, y + s * 0.38, {
      size: Math.round(s * 0.3),
      stroke: "#000",
      sw: 3,
    });
  c.restore();
}

// ===== 塔（星級差異：基座、魔法陣、水晶、方尖碑、翅膀、光環、光柱） =====
// 各星級的材質：a 主色、b 暗色、e 亮色。
const TIER_MAT = [
  null,
  { a: "#8e949e", b: "#3a3e48", e: "#c8ccd6" },
  { a: "#d0965a", b: "#5a3418", e: "#ffd8a8" },
  { a: "#b8d4f0", b: "#3a5878", e: "#f0f8ff" },
  { a: "#b47af0", b: "#3a1a6a", e: "#ecd4ff" },
  { a: "#ffd858", b: "#8a5a0a", e: "#fff6c8" },
  { a: "#ff5a78", b: "#5a0820", e: "#ffd8e0" },
];
// 各星級的大小倍率。
const TIER_SCALE = [0, 0.72, 0.85, 0.98, 1.1, 1.22, 1.36];
// 塔的第 i 個元素顏色；幻彩稜鏡會不斷變色。
function elemCol(key, i, time) {
  return key === "prism"
    ? rainbow(time * 140 + i * 60)
    : ELEM[elemsOf(key)[i % elemsOf(key).length]].c;
}
// 畫一層圓柱底座。
function cyl(c, rx, ry, h, y, M, rim) {
  let g = c.createLinearGradient(-rx, 0, rx, 0);
  g.addColorStop(0, M.b);
  g.addColorStop(0.4, M.a);
  g.addColorStop(1, M.b);
  c.beginPath();
  c.ellipse(0, y, rx, ry, 0, 0, Math.PI);
  c.lineTo(-rx, y - h);
  c.ellipse(0, y - h, rx, ry, 0, Math.PI, 0, true);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = "rgba(0,0,0,.55)";
  c.stroke();
  c.beginPath();
  c.ellipse(0, y - h, rx, ry, 0, 0, TAU);
  g = c.createRadialGradient(-rx * 0.3, y - h - ry * 0.5, 1, 0, y - h, rx);
  g.addColorStop(0, M.e);
  g.addColorStop(1, M.a);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = rim || M.e;
  c.lineWidth = 1.3;
  c.stroke();
}
// 地面的魔法陣（★3 以上）；星級越高越華麗。
function magicCircle(c, tier, col, tc, t) {
  const R1 = 26 + tier * 5,
    hc = tier >= 6 ? rainbow(t * 90) : tc;
  c.save();
  c.translate(0, 12);
  c.scale(1, 0.42);
  c.globalCompositeOperation = "lighter";
  glow(c, 0, 0, R1 * 1.6, hc, 0.25 + 0.1 * Math.sin(t * 3));
  c.lineWidth = 2.4;
  c.strokeStyle = rgba(hc, 0.9);
  c.beginPath();
  c.arc(0, 0, R1, 0, TAU);
  c.stroke();
  c.save();
  c.rotate(t * 0.6);
  c.setLineDash([10, 7]);
  c.lineWidth = 2;
  c.strokeStyle = rgba(col, 0.85);
  c.beginPath();
  c.arc(0, 0, R1 - 7, 0, TAU);
  c.stroke();
  c.restore();
  // ★4：反向旋轉的內圈。
  if (tier >= 4) {
    c.save();
    c.rotate(-t * 0.4);
    c.strokeStyle = rgba(hc, 0.85);
    c.lineWidth = 1.8;
    const pts = tier >= 6 ? 12 : tier >= 5 ? 8 : 6,
      skip = tier >= 6 ? 5 : tier >= 5 ? 3 : 2;
    c.beginPath();
    for (let j = 0; j <= pts; j++) {
      const a = (((j * skip) % pts) * TAU) / pts - Math.PI / 2,
        px = Math.cos(a) * (R1 - 10),
        py = Math.sin(a) * (R1 - 10);
      j ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
    c.restore();
  }
  // ★5：外圈的符文。
  if (tier >= 5) {
    c.save();
    c.rotate(t * 0.3);
    c.fillStyle = rgba(hc, 0.95);
    c.strokeStyle = rgba(hc, 0.95);
    c.lineWidth = 1.6;
    for (let k = 0; k < 12; k++) {
      c.save();
      c.rotate((k * TAU) / 12);
      c.translate(0, -(R1 + 9));
      c.beginPath();
      if (k % 3 === 0) {
        c.moveTo(-4, 3);
        c.lineTo(0, -4);
        c.lineTo(4, 3);
        c.closePath();
        c.stroke();
      } else if (k % 3 === 1) {
        c.moveTo(0, -4);
        c.lineTo(0, 4);
        c.moveTo(-3, -1);
        c.lineTo(3, 1);
        c.stroke();
      } else {
        c.arc(0, 0, 2.5, 0, TAU);
        c.fill();
      }
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, R1 + 17, 0, TAU);
    c.lineWidth = 1.6;
    c.stroke();
    c.restore();
  }
  // ★6：再加一圈光紋。
  if (tier >= 6) {
    c.save();
    c.rotate(-t * 0.9);
    c.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      c.arc(0, 0, R1 + 28, (k * TAU) / 6, (k * TAU) / 6 + 0.7);
      c.strokeStyle = rainbow(k * 60 + t * 100);
      c.stroke();
    }
    c.restore();
  }
  c.restore();
}
// 水晶尖刺（★4）。
function crystalSpike(c, x, y, h, col) {
  c.beginPath();
  c.moveTo(x - 4, y);
  c.lineTo(x - 1, y - h);
  c.lineTo(x + 1.5, y - h - 3);
  c.lineTo(x + 4, y);
  c.closePath();
  const g = c.createLinearGradient(x - 4, 0, x + 4, 0);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, col);
  g.addColorStop(1, mixHex(col, "#000000", 0.5));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(255,255,255,.6)";
  c.lineWidth = 0.8;
  c.stroke();
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, x, y - h, 9, col, 0.7);
  c.restore();
}
// 方尖碑（★5）。
function obelisk(c, x, y, h, M, gem, t) {
  c.beginPath();
  c.moveTo(x - 4, y);
  c.lineTo(x - 2.5, y - h);
  c.lineTo(x, y - h - 5);
  c.lineTo(x + 2.5, y - h);
  c.lineTo(x + 4, y);
  c.closePath();
  const g = c.createLinearGradient(x - 4, 0, x + 4, 0);
  g.addColorStop(0, M.b);
  g.addColorStop(0.4, M.e);
  g.addColorStop(1, M.b);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(0,0,0,.4)";
  c.lineWidth = 0.8;
  c.stroke();
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, x, y - h - 4, 10 + 2 * Math.sin(t * 5 + x), gem, 1);
  c.restore();
}
// 翅膀；★4 一對、★5 兩對、★6 三對。
function wings(c, tier, col, col2, t) {
  const n = tier >= 6 ? 3 : tier >= 5 ? 2 : 1,
    flap = Math.sin(t * 3) * 0.12;
  c.save();
  if (tier >= 6) c.globalCompositeOperation = "lighter";
  for (const sd of [-1, 1])
    for (let k = n - 1; k >= 0; k--) {
      c.save();
      c.translate(sd * 5, -12);
      c.rotate(sd * (k * 0.38 + flap));
      const L = 20 + tier * 3.2 - k * 5;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(sd * L * 0.25, -L * 1.05, sd * L * 0.95, -L * 0.85);
      c.quadraticCurveTo(sd * L * 0.6, -L * 0.3, 0, 0);
      c.closePath();
      const g = c.createLinearGradient(0, 0, sd * L, -L);
      g.addColorStop(0, rgba(col2, 0.95));
      g.addColorStop(1, rgba(col, tier >= 6 ? 0.7 : 0.9));
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.7)";
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(sd * L * 0.4, -L * 0.65, sd * L * 0.85, -L * 0.8);
      c.strokeStyle = "rgba(255,255,255,.4)";
      c.stroke();
      c.restore();
    }
  c.restore();
}

// 畫一座塔；sc 是大小，ang 是瞄準角度，o 是其他選項。
function drawTower(c, key, tier, x, y, sc, time, ang, o = {}) {
  const els = elemsOf(key),
    kind = towerKind(key),
    M = TIER_MAT[tier] || TIER_MAT[1];
  const mode = o.mode || towerMode(key),
    col = elemCol(key, 0, time),
    col2 = elemCol(key, 1, time),
    tc = TIER_COL[tier];
  const S = sc * (o.noTierScale ? 1 : TIER_SCALE[tier]);
  c.save();
  c.translate(x, y);
  c.scale(S, S);
  if (tier >= 3 && !o.flat) magicCircle(c, tier, col, tc, time);
  if (tier >= 4 && !o.flat) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(
      c,
      0,
      -10,
      40 + tier * 6,
      tier >= 6 ? rainbow(time * 60) : tc,
      0.22 + 0.1 * Math.sin(time * 3),
    );
    c.restore();
  }
  // 地面陰影。
  c.fillStyle = "rgba(0,0,0,.38)";
  c.beginPath();
  c.ellipse(0, 17, 26 + tier, 9, 0, 0, TAU);
  c.fill();
  // 神話塔會微微上下漂浮。
  const bob = tier >= 6 ? Math.sin(time * 2) * 2.5 - 3 : 0;
  // 環繞底座的裝飾：水晶、方尖碑或漂浮碎片。
  const orn = [];
  if (tier === 4)
    for (let k = 0; k < 5; k++)
      orn.push({ a: (k * TAU) / 5 + 0.3, f: "spike" });
  if (tier === 5)
    for (let k = 0; k < 4; k++)
      orn.push({ a: (k * TAU) / 4 + Math.PI / 4, f: "obelisk" });
  if (tier >= 6)
    for (let k = 0; k < 4; k++)
      orn.push({ a: time * 0.8 + (k * TAU) / 4, f: "shard" });
  // 先畫後方的裝飾，最後再畫前方的裝飾。
  const drawOrn = (front) => {
    for (const q of orn) {
      const sn = Math.sin(q.a);
      if (sn >= 0 !== front) continue;
      const rx = q.f === "shard" ? 34 : 29,
        px = Math.cos(q.a) * rx,
        py = 10 + sn * 11;
      if (q.f === "spike") crystalSpike(c, px, py, 16 + ((q.a * 7) % 6), tc);
      else if (q.f === "obelisk") obelisk(c, px, py, 24, M, col, time);
      else {
        const fy = py - 22 + Math.sin(time * 3 + q.a) * 4,
          hc = rainbow(q.a * 57 + time * 80);
        c.save();
        c.translate(px, fy);
        c.rotate(time + q.a);
        poly(c, [
          [0, -7],
          [5, 0],
          [0, 7],
          [-5, 0],
        ]);
        c.fillStyle = hc;
        c.fill();
        c.strokeStyle = "#fff";
        c.lineWidth = 1;
        c.stroke();
        c.restore();
        c.save();
        c.globalCompositeOperation = "lighter";
        glow(c, px, fy, 14, hc, 0.8);
        c.restore();
      }
    }
  };
  drawOrn(false);
  c.save();
  c.translate(0, bob);
  if (tier >= 6) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, 0, 14 - bob, 30, "#ff3c64", 0.7);
    c.restore();
  }
  // 底座：★1～2 是石座，★3 以上是多層的台座。
  if (tier <= 2) {
    cyl(c, 21 + tier * 2, 9 + tier * 0.5, 8 + tier, 10, M);
    if (tier === 2) {
      c.beginPath();
      c.ellipse(0, 6, 23, 9.5, 0, 0, Math.PI);
      c.strokeStyle = M.e;
      c.lineWidth = 2;
      c.stroke();
      for (let k = 0; k < 5; k++) {
        const a = 0.3 + k * 0.63;
        c.beginPath();
        c.arc(Math.cos(a) * 22, 7 + Math.sin(a) * 9, 1.5, 0, TAU);
        c.fillStyle = "#fff2c0";
        c.fill();
      }
    }
  } else {
    cyl(c, 27, 11, 6, 12, M);
    cyl(c, 21, 8.5, tier >= 5 ? 6 : 8, 6, M, tier >= 5 ? "#fff6c8" : null);
    if (tier >= 5) cyl(c, 15, 6, 5, 0, M, "#ffffff");
  }
  const topY = tier <= 2 ? 10 - (8 + tier) : tier >= 5 ? -5 : -2;
  const ringR = tier <= 2 ? 17 + tier * 2 : tier >= 5 ? 12 : 17;
  const segs = kind === "prism" ? 6 : els.length;
  c.save();
  if (tier >= 3) c.globalCompositeOperation = "lighter";
  // 圓環上的分段刻紋。
  for (let i = 0; i < segs; i++) {
    c.beginPath();
    c.ellipse(
      0,
      topY,
      ringR,
      ringR * 0.4,
      0,
      (i * TAU) / segs + time * 0.6,
      ((i + 1) * TAU) / segs + time * 0.6 - 0.1,
    );
    c.strokeStyle = elemCol(key, i, time);
    c.lineWidth = tier >= 3 ? 3 : 2.4;
    c.stroke();
  }
  c.restore();
  // 底座前方的星級標記。
  for (let i = 0; i < tier; i++) {
    const px = (i - (tier - 1) / 2) * 7.5,
      py = 15;
    c.fillStyle = tc;
    c.beginPath();
    c.moveTo(px, py - 3.8);
    c.lineTo(px + 3, py);
    c.lineTo(px, py + 3.8);
    c.lineTo(px - 3, py);
    c.closePath();
    c.fill();
    if (tier >= 4) {
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, px, py, 7, tc, 0.8);
      c.restore();
    }
  }
  c.translate(0, topY - 2 - tier * 0.8);
  if (tier >= 4) wings(c, tier, col, tier >= 6 ? "#ffffff" : col2, time);
  // 神話塔的光柱。
  if (tier >= 6 && !o.flat) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const bw = 10 + 4 * Math.sin(time * 4),
      lg = c.createLinearGradient(0, -10, 0, -150);
    lg.addColorStop(0, rgba(rainbow(time * 120), 0.55));
    lg.addColorStop(1, rgba("#ffffff", 0));
    c.fillStyle = lg;
    c.fillRect(-bw, -150, bw * 2, 140);
    c.fillStyle = "rgba(255,255,255,.3)";
    c.fillRect(-bw * 0.3, -140, bw * 0.6, 130);
    c.restore();
  }
  const ws = 0.82 + tier * 0.08;
  c.save();
  c.scale(ws, ws);
  // 畫一段金屬砲管。
  const metal = (x0, y0, w, h, r = 3) => {
    const g2 = c.createLinearGradient(0, y0, 0, y0 + h);
    g2.addColorStop(0, M.e);
    g2.addColorStop(0.5, M.a);
    g2.addColorStop(1, M.b);
    rr(c, x0, y0, w, h, r);
    c.fillStyle = g2;
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = "rgba(0,0,0,.55)";
    c.stroke();
  };
  // 會朝目標轉動的攻擊方式。
  const rotModes = {
    bullet: 1,
    multi: 1,
    mortar: 1,
    rail: 1,
    beam: 1,
    snipe: 1,
  };
  if (rotModes[mode]) {
    c.save();
    c.rotate(ang);
    // 開火時往後退一點。
    const recoil = o.recoil ? -o.recoil * 5 : 0,
      L = 20 + tier * 2;
    if (mode === "snipe") {
      // 狙擊：細長砲管與瞄準鏡。
      metal(2 + recoil, -4, L + 30, 8, 3);
      metal(10 + recoil, -9, 16, 6, 2);
      c.fillStyle = "#ff3a3a";
      c.beginPath();
      c.arc(L + 30 + recoil, 0, 3, 0, TAU);
      c.fill();
    } else if (mode === "bullet") {
      // 單發彈。
      metal(4 + recoil, -5, L, 10);
      c.fillStyle = col;
      c.fillRect(L + recoil, -5.5, 4, 11);
      if (tier >= 3) {
        metal(6 + recoil, -8, L * 0.5, 3, 1.5);
        metal(6 + recoil, 5, L * 0.5, 3, 1.5);
      }
    } else if (mode === "multi") {
      // 多重射擊。
      const k = Math.min(6, o.shots || 3);
      for (let i = 0; i < k; i++) {
        c.save();
        c.rotate((i - (k - 1) / 2) * 0.3);
        metal(4 + recoil, -3, L - 2, 6, 2);
        c.fillStyle = elemCol(key, i, time);
        c.fillRect(L - 2 + recoil, -3.5, 3, 7);
        c.restore();
      }
    } else if (mode === "mortar") {
      // 拋射砲。
      metal(-2 + recoil, -10, L, 20, 6);
      c.fillStyle = col;
      c.fillRect(L - 8 + recoil, -11, 4, 22);
      if (tier >= 3) c.fillRect(L - 16 + recoil, -11, 3, 22);
      c.fillStyle = "rgba(0,0,0,.7)";
      c.beginPath();
      c.ellipse(L - 2 + recoil, 0, 3, 7, 0, 0, TAU);
      c.fill();
    } else if (mode === "rail") {
      // 貫穿軌道砲。
      metal(-4 + recoil, -10, L + 16, 5, 2);
      metal(-4 + recoil, 5, L + 16, 5, 2);
      c.globalCompositeOperation = "lighter";
      c.fillStyle = rgba(col, 0.6 + 0.3 * Math.sin(time * 10));
      c.fillRect(2 + recoil, -4, L + 8, 8);
      glow(c, L + 12, 0, 12 + tier * 2, col, 0.9);
      c.globalCompositeOperation = "source-over";
    } else if (mode === "beam") {
      // 持續光束。
      metal(2, -6, L - 2, 12, 6);
      c.beginPath();
      c.moveTo(L, -7);
      c.lineTo(L + 10, 0);
      c.lineTo(L, 7);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.globalCompositeOperation = "lighter";
      glow(c, L + 6, 0, 14 + tier * 2, col, 0.9);
      c.globalCompositeOperation = "source-over";
    }
    c.restore();
  } else if (mode === "chain") {
    // 連鎖閃電：線圈與電弧。
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(0, 4 - i * 7, 17 - i * 3, 6 - i, 0, 0, TAU);
      c.lineWidth = 4;
      c.strokeStyle = i % 2 ? M.a : "#c8783a";
      c.stroke();
      c.lineWidth = 1;
      c.strokeStyle = "rgba(0,0,0,.4)";
      c.stroke();
    }
    c.save();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = col2;
    c.lineWidth = 1.2 + tier * 0.3;
    const sd = Math.floor(time * 12);
    for (let k = 0; k < 1 + Math.ceil(tier / 2); k++) {
      const rnd = mulberry32(sd * 7 + k);
      c.beginPath();
      let a = rnd() * TAU;
      c.moveTo(Math.cos(a) * 12, -14 + Math.sin(a) * 5);
      for (let j = 0; j < 4; j++) {
        a += (rnd() - 0.5) * 1.2;
        c.lineTo(
          Math.cos(a) * (12 + j * 4 + tier),
          -16 - j * 3 + (rnd() - 0.5) * 6,
        );
      }
      c.stroke();
    }
    c.restore();
  } else if (mode === "pulse") {
    // 範圍脈衝：一圈圈向外擴散。
    c.beginPath();
    c.ellipse(0, 2, 20, 7, 0, 0, TAU);
    c.fillStyle = M.b;
    c.fill();
    c.strokeStyle = M.e;
    c.lineWidth = 2;
    c.stroke();
    c.save();
    c.globalCompositeOperation = "lighter";
    const nr = 1 + Math.ceil(tier / 2);
    for (let i = 0; i < nr; i++) {
      const k = (time * 0.8 + i / nr) % 1;
      c.beginPath();
      c.ellipse(0, 2, 16 + k * (18 + tier * 3), 6 + k * 8, 0, 0, TAU);
      c.strokeStyle = rgba(elemCol(key, i, time), (1 - k) * 0.75);
      c.lineWidth = 2;
      c.stroke();
    }
    c.restore();
  }
  c.restore();
  drawCoreOrb(c, key, els, kind, tier, time, mode === "chain" ? -18 : -5);
  // ★2 以上：環繞的光點。
  if (tier >= 2) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const cnt = tier - 1;
    for (let i = 0; i < cnt; i++) {
      const a = time * (1.4 + tier * 0.15) + (i * TAU) / cnt;
      glow(
        c,
        Math.cos(a) * (20 + tier * 2),
        -6 + Math.sin(a) * 8,
        5 + tier * 0.6,
        tier >= 6 ? rainbow(i * 60 + time * 100) : tc,
        0.95,
      );
    }
    c.restore();
  }
  // ★5 以上：頂端的王冠。
  if (tier >= 5) {
    const hy = -36 - tier * 1.5 + Math.sin(time * 2) * 2,
      hcol = tier === 6 ? "#ffb0c0" : "#ffe080";
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, 0, hy, 22, tier >= 6 ? "#ff6a8a" : "#ffcf3a", 0.55);
    c.restore();
    c.beginPath();
    c.ellipse(0, hy, 14, 4.5, 0, 0, TAU);
    c.lineWidth = 2.5;
    c.strokeStyle = hcol;
    c.stroke();
    c.fillStyle = hcol;
    for (let k = 0; k < 5; k++) {
      const a = Math.PI + (k * Math.PI) / 4,
        px = Math.cos(a) * 14,
        py = hy + Math.sin(a) * 4.5;
      poly(c, [
        [px - 2.2, py],
        [px, py - 7 - (k === 2 ? 3 : 0)],
        [px + 2.2, py],
      ]);
      c.fill();
    }
    // 神話塔的彩虹光環。
    if (tier >= 6) {
      for (const [sp, off] of [
        [1.2, 0],
        [-0.9, 180],
      ]) {
        c.save();
        c.translate(0, hy - 2);
        c.rotate(time * sp + off);
        c.beginPath();
        c.ellipse(0, 0, 23, 5.5, 0, 0, TAU);
        c.strokeStyle = rgba(rainbow(time * 150 + off), 0.85);
        c.lineWidth = 1.6;
        c.stroke();
        c.restore();
      }
    }
  }
  c.restore();
  drawOrn(true);
  c.restore();
}

// 塔頂的核心：依類型與元素畫出不同外觀。
function drawCoreOrb(c, key, els, kind, tier, time, oy) {
  const r = 7 + tier * 1.6;
  c.save();
  c.translate(0, oy);
  const col = elemCol(key, 0, time);
  c.globalCompositeOperation = "lighter";
  glow(c, 0, 0, r * 2.6, col, 0.55 + 0.15 * Math.sin(time * 4));
  c.globalCompositeOperation = "source-over";
  // 職業塔與賭場塔：表情符號圖示與各自的特效。
  if (kind === "class" || kind === "special") {
    const D = tDef(key),
      sz = r * (kind === "special" ? 2.6 : 2.3);
    if (kind === "special") {
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, 0, 0, r * 3.4, rainbow(time * 80), 0.4);
      c.restore();
    }
    // 緩速力場的旋轉圓環。
    if (D.mode === "aura") {
      c.save();
      c.rotate(time * 1.5);
      c.setLineDash([5, 5]);
      c.beginPath();
      c.arc(0, 0, r * 1.7, 0, TAU);
      c.strokeStyle = "#7ad0ff";
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }
    // 輔助塔的聲波。
    if (D.mode === "support") {
      for (const sd of [-1, 1]) {
        c.save();
        c.translate(sd * r * 1.3, -r * 0.2);
        c.rotate(sd * 0.2 + Math.sin(time * 3) * 0.1);
        c.fillStyle = "#ff3a4a";
        c.beginPath();
        c.moveTo(0, -r * 1.6);
        c.lineTo(sd * r * 0.9, -r * 1.3);
        c.lineTo(0, -r);
        c.fill();
        c.strokeStyle = "#d8b060";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, -r * 1.7);
        c.lineTo(0, r * 0.5);
        c.stroke();
        c.restore();
      }
    }
    // 產金塔的環繞金幣。
    if (D.mode === "eco") {
      for (let k = 0; k < 3; k++) {
        const a = time * 2 + (k * TAU) / 3;
        drawCoin(
          c,
          Math.cos(a) * r * 1.6,
          Math.sin(a) * r * 0.6 - r * 0.4,
          r * 0.35,
          time * 5 + k,
        );
      }
    }
    const bob = Math.sin(time * 3) * 1.5;
    c.font = `${Math.round(sz)}px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#fff";
    c.fillText(D.e, 0, bob);
  } else if (kind === "base") {
    // 單一元素：每種元素有自己的核心造型。
    const e = els[0],
      E = ELEM[e];
    if (e === "fire") {
      const f = 1 + 0.08 * Math.sin(time * 14);
      flamePath(c, 0, -2, r * 1.6, r * 2.4 * f);
      c.fillStyle = "#ff4a10";
      c.fill();
      flamePath(c, 0, 2, r * 1, r * 1.6 * f);
      c.fillStyle = "#ffd23a";
      c.fill();
      flamePath(c, 0, 5, r * 0.5, r * 0.9);
      c.fillStyle = "#fff";
      c.fill();
    } else if (e === "ice") {
      poly(c, [
        [0, -r * 1.5],
        [r * 0.75, 0],
        [0, r * 1.1],
        [-r * 0.75, 0],
      ]);
      const g = c.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#7ad8ff");
      g.addColorStop(1, "#1a6ab8");
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "#e8f8ff";
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath();
      c.moveTo(0, -r * 1.5);
      c.lineTo(0, r * 1.1);
      c.strokeStyle = "rgba(255,255,255,.6)";
      c.stroke();
    } else if (e === "earth") {
      c.save();
      c.rotate(time * 0.3);
      poly(
        c,
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const a = (i * TAU) / 7;
          const rr2 = r * (1 + (i % 2 ? 0.1 : -0.08));
          return [Math.cos(a) * rr2, Math.sin(a) * rr2];
        }),
      );
      const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, "#f0c080");
      g.addColorStop(1, "#6a3a10");
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "#2a1404";
      c.lineWidth = 1.2;
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.5, -r * 0.3);
      c.lineTo(0, 0);
      c.lineTo(r * 0.3, r * 0.6);
      c.strokeStyle = "#ffb030";
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    } else if (e === "wind") {
      c.save();
      c.rotate(time * 9);
      for (let i = 0; i < 3; i++) {
        c.rotate(TAU / 3);
        c.beginPath();
        c.ellipse(r * 0.6, 0, r * 0.75, r * 0.3, 0.3, 0, TAU);
        c.fillStyle = i % 2 ? "#bfffee" : "#5affc8";
        c.fill();
      }
      c.restore();
      c.beginPath();
      c.arc(0, 0, r * 0.35, 0, TAU);
      c.fillStyle = "#fff";
      c.fill();
    } else {
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      const g = c.createRadialGradient(-r * 0.35, -r * 0.35, 1, 0, 0, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, E.c2);
      g.addColorStop(1, E.dark);
      c.fillStyle = g;
      c.fill();
      if (e === "poison") {
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.7 + i / 3) % 1;
          c.beginPath();
          c.arc(
            Math.sin(i * 2 + time) * r * 0.4,
            r * 0.6 - k * r * 1.8,
            2 * (1 - k) + 1,
            0,
            TAU,
          );
          c.fillStyle = rgba("#d8ff9a", 1 - k);
          c.fill();
        }
      } else {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = "#fff";
        c.lineWidth = 1.2;
        const rnd = mulberry32(Math.floor(time * 15));
        c.beginPath();
        for (let k = 0; k < 3; k++) {
          let a = rnd() * TAU;
          c.moveTo(0, 0);
          c.lineTo(
            Math.cos(a) * r * 0.6 + (rnd() - 0.5) * 4,
            Math.sin(a) * r * 0.6,
          );
          c.lineTo(Math.cos(a + 0.3) * r * 1.2, Math.sin(a + 0.3) * r * 1.2);
        }
        c.stroke();
        c.restore();
      }
    }
  } else if (kind === "hybrid") {
    // 雙元素：兩種顏色交融。
    c.save();
    c.rotate(time * 1.5);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI);
    c.fillStyle = ELEM[els[0]].c;
    c.fill();
    c.beginPath();
    c.arc(0, 0, r, Math.PI, TAU);
    c.fillStyle = ELEM[els[1]].c;
    c.fill();
    c.beginPath();
    c.arc(r / 2, 0, r / 2, 0, TAU);
    c.fillStyle = ELEM[els[0]].c;
    c.fill();
    c.beginPath();
    c.arc(-r / 2, 0, r / 2, 0, TAU);
    c.fillStyle = ELEM[els[1]].c;
    c.fill();
    c.beginPath();
    c.arc(r / 2, 0, r / 6, 0, TAU);
    c.fillStyle = ELEM[els[1]].c2;
    c.fill();
    c.beginPath();
    c.arc(-r / 2, 0, r / 6, 0, TAU);
    c.fillStyle = ELEM[els[0]].c2;
    c.fill();
    c.restore();
    const g = c.createRadialGradient(-r * 0.4, -r * 0.4, 1, 0, 0, r);
    g.addColorStop(0, "rgba(255,255,255,.7)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(0,0,0,.35)");
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    c.ellipse(0, 0, r * 1.7, r * 0.5, -0.3, 0, TAU);
    c.strokeStyle = rgba(ELEM[els[1]].c2, 0.7);
    c.lineWidth = 1.3;
    c.stroke();
    const a = time * 3;
    c.beginPath();
    c.arc(
      Math.cos(a) * r * 1.7 * Math.cos(-0.3) -
        Math.sin(a) * r * 0.5 * Math.sin(-0.3),
      Math.cos(a) * r * 1.7 * Math.sin(-0.3) +
        Math.sin(a) * r * 0.5 * Math.cos(-0.3),
      2.2,
      0,
      TAU,
    );
    c.fillStyle = "#fff";
    c.fill();
  } else if (kind === "trinity") {
    // 三元素：三種顏色旋轉。
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    let g;
    if (c.createConicGradient) {
      g = c.createConicGradient(time * 2, 0, 0);
      els.forEach((e, i) => g.addColorStop(i / 3, ELEM[e].c));
      g.addColorStop(1, ELEM[els[0]].c);
    } else {
      g = c.createRadialGradient(0, 0, 1, 0, 0, r);
      g.addColorStop(0, ELEM[els[0]].c);
      g.addColorStop(1, ELEM[els[2]].c);
    }
    c.fillStyle = g;
    c.fill();
    const g2 = c.createRadialGradient(-r * 0.4, -r * 0.4, 1, 0, 0, r);
    g2.addColorStop(0, "rgba(255,255,255,.85)");
    g2.addColorStop(0.5, "rgba(255,255,255,0)");
    g2.addColorStop(1, "rgba(0,0,0,.3)");
    c.fillStyle = g2;
    c.fill();
    for (let i = 0; i < 3; i++) {
      const a = time * 2.2 + (i * TAU) / 3,
        px = Math.cos(a) * r * 1.8,
        py = Math.sin(a) * r * 0.8;
      c.save();
      c.translate(px, py);
      c.rotate(a);
      poly(c, [
        [0, -4.5],
        [3.5, 0],
        [0, 4.5],
        [-3.5, 0],
      ]);
      c.fillStyle = ELEM[els[i]].c;
      c.fill();
      c.strokeStyle = "#fff";
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    }
  } else {
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const a = time * 0.8 + (i * TAU) / 6;
      c.save();
      c.rotate(a);
      const g = c.createLinearGradient(0, 0, r * 3.2, 0);
      g.addColorStop(0, rgba(rainbow(i * 60), 0.7));
      g.addColorStop(1, rgba(rainbow(i * 60), 0));
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(r * 3.2, -3);
      c.lineTo(r * 3.2, 3);
      c.closePath();
      c.fillStyle = g;
      c.fill();
      c.restore();
    }
    c.restore();
    c.save();
    c.rotate(time * 1.2);
    poly(c, [
      [0, -r * 1.5],
      [r * 1.1, 0],
      [0, r * 1.5],
      [-r * 1.1, 0],
    ]);
    let g;
    if (c.createConicGradient) {
      g = c.createConicGradient(time * 3, 0, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, rainbow(i * 60));
    } else {
      g = c.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, "#ff3a5a");
      g.addColorStop(0.5, "#3ad8ff");
      g.addColorStop(1, "#c45aff");
    }
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 1.5;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -r * 1.5);
    c.lineTo(0, r * 1.5);
    c.moveTo(-r * 1.1, 0);
    c.lineTo(r * 1.1, 0);
    c.strokeStyle = "rgba(255,255,255,.6)";
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
  c.restore();
}

// ===== 敵人 =====
function drawEnemy(c, e, time) {
  // 敵人的資料、半徑與動畫時間。
  const d = e.def,
    r = e.r,
    t = e.t;
  const bob = e.fly ? Math.sin(t * 5) * 4 - 10 : 0;
  c.save();
  c.translate(e.x, e.y + (e.def && !e.icon ? 6 : 0));
  // 陰影
  c.fillStyle = "rgba(0,0,0,.35)";
  c.beginPath();
  c.ellipse(0, r * 0.7, r * (e.fly ? 0.7 : 1), r * 0.32, 0, 0, TAU);
  c.fill();
  // 元素親和光環
  // 元素抗性的光環。
  if (e.resist) {
    c.save();
    c.rotate(time * 1.5);
    c.setLineDash([6, 5]);
    c.lineWidth = 2.5;
    c.strokeStyle = ELEM[e.resist].c;
    c.beginPath();
    c.ellipse(0, r * 0.55, r * 1.25, r * 0.5, 0, 0, TAU);
    c.stroke();
    c.restore();
  }
  c.translate(0, bob);
  if (e.phased) c.globalAlpha = 0.28;
  const dir = Math.cos(e.dir || 0) >= 0 ? 1 : -1;
  // 身體的漸層；lt 可以指定亮部顏色。
  const body = (col, lt) => {
    const g = c.createRadialGradient(
      -r * 0.35,
      -r * 0.45,
      r * 0.1,
      0,
      0,
      r * 1.15,
    );
    g.addColorStop(0, lt || mixHex(col, "#ffffff", 0.55));
    g.addColorStop(0.55, col);
    g.addColorStop(1, mixHex(col, "#000000", 0.55));
    return g;
  };
  // 一雙眼睛。
  const eyes = (ex, ey, s, col = "#1a0a20") => {
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.ellipse(ex + sx * s * 1.1, ey, s, s * 1.15, 0, 0, TAU);
      c.fillStyle = "#fff";
      c.fill();
      c.beginPath();
      c.arc(ex + sx * s * 1.1 + dir * s * 0.35, ey + s * 0.1, s * 0.55, 0, TAU);
      c.fillStyle = col;
      c.fill();
    }
  };
  const col = e.elite ? mixHex(d.col, "#ffcf3a", 0.25) : d.col;
  // 依外型畫出身體。
  switch (d.shape) {
    // 史萊姆。
    case "blob": {
      const sq = 1 + Math.sin(t * 8) * 0.08;
      c.save();
      c.scale(1 / sq, sq);
      c.beginPath();
      c.moveTo(-r, r * 0.6);
      c.bezierCurveTo(-r * 1.1, -r * 0.6, -r * 0.5, -r * 1.1, 0, -r * 1.05);
      c.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.1, -r * 0.6, r, r * 0.6);
      c.closePath();
      c.fillStyle = body(col);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = mixHex(col, "#000", 0.6);
      c.stroke();
      c.restore();
      c.beginPath();
      c.ellipse(-r * 0.4, -r * 0.55, r * 0.22, r * 0.12, -0.5, 0, TAU);
      c.fillStyle = "rgba(255,255,255,.7)";
      c.fill();
      eyes(dir * r * 0.15, -r * 0.15, r * 0.22);
      break;
    }
    // 疾行者。
    case "runner": {
      c.save();
      c.scale(dir, 1);
      c.strokeStyle = mixHex(col, "#000", 0.5);
      c.lineWidth = 3;
      c.lineCap = "round";
      for (let i = 0; i < 2; i++) {
        const a = Math.sin(t * 22 + i * Math.PI) * 0.7;
        c.beginPath();
        c.moveTo(-r * 0.2 + i * r * 0.4, r * 0.4);
        c.lineTo(-r * 0.2 + i * r * 0.4 + Math.sin(a) * r * 0.5, r * 0.95);
        c.stroke();
      }
      c.beginPath();
      c.ellipse(0, 0, r * 1.25, r * 0.8, 0, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.beginPath();
      c.moveTo(r * 0.2, -r * 0.6);
      c.lineTo(r * 0.5, -r * 1.5);
      c.lineTo(r * 0.75, -r * 0.5);
      c.fillStyle = col;
      c.fill();
      c.beginPath();
      c.moveTo(-r * 1.2, 0);
      c.quadraticCurveTo(-r * 2, -r * 0.4, -r * 2.1, r * 0.2);
      c.lineWidth = 2;
      c.strokeStyle = col;
      c.stroke();
      c.restore();
      c.beginPath();
      c.arc(dir * r * 0.6, -r * 0.15, r * 0.22, 0, TAU);
      c.fillStyle = "#fff";
      c.fill();
      c.beginPath();
      c.arc(dir * r * 0.7, -r * 0.12, r * 0.12, 0, TAU);
      c.fillStyle = "#200";
      c.fill();
      break;
    }
    // 巨漢。
    case "brute": {
      rr(c, -r, -r * 0.95, r * 2, r * 1.8, r * 0.45);
      c.fillStyle = body(col);
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#2a2e38";
      c.stroke();
      c.fillStyle = "rgba(255,255,255,.18)";
      rr(c, -r * 0.8, -r * 0.8, r * 1.6, r * 0.5, r * 0.2);
      c.fill();
      c.fillStyle = "#dde3ee";
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * r * 0.7, -r * 0.8);
        c.lineTo(sx * r * 1.15, -r * 1.45);
        c.lineTo(sx * r * 0.35, -r * 0.9);
        c.fill();
      }
      c.fillStyle = "#4a505e";
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(-r * 0.6 + i * r * 0.4, r * 0.45, r * 0.08, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#ff3a2a";
      c.beginPath();
      c.arc(-r * 0.3 + dir * r * 0.1, -r * 0.2, r * 0.13, 0, TAU);
      c.arc(r * 0.3 + dir * r * 0.1, -r * 0.2, r * 0.13, 0, TAU);
      c.fill();
      break;
    }
    // 飛行的蝙蝠。
    case "bat": {
      const f = Math.sin(t * 18);
      c.fillStyle = mixHex(col, "#000", 0.3);
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * r * 0.4, -r * 0.2);
        c.quadraticCurveTo(
          sx * r * 1.6,
          -r * (1.2 + f * 0.6),
          sx * r * 2.2,
          -r * (0.1 + f * 0.5),
        );
        c.quadraticCurveTo(sx * r * 1.6, r * 0.1, sx * r * 1.3, r * 0.3);
        c.quadraticCurveTo(sx * r * 0.9, r * 0.1, sx * r * 0.4, r * 0.4);
        c.closePath();
        c.fill();
      }
      c.beginPath();
      c.arc(0, 0, r * 0.75, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.beginPath();
      c.moveTo(-r * 0.5, -r * 0.5);
      c.lineTo(-r * 0.3, -r * 1.1);
      c.lineTo(-r * 0.1, -r * 0.6);
      c.moveTo(r * 0.5, -r * 0.5);
      c.lineTo(r * 0.3, -r * 1.1);
      c.lineTo(r * 0.1, -r * 0.6);
      c.fillStyle = col;
      c.fill();
      c.fillStyle = "#ffe03a";
      c.beginPath();
      c.arc(-r * 0.25, -r * 0.1, r * 0.14, 0, TAU);
      c.arc(r * 0.25, -r * 0.1, r * 0.14, 0, TAU);
      c.fill();
      break;
    }
    // 治療者。
    case "healer": {
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, 0, -r * 1.2, r * 0.9, "#ffd0f0", 0.6);
      c.restore();
      c.beginPath();
      c.ellipse(0, -r * 1.25, r * 0.5, r * 0.16, 0, 0, TAU);
      c.strokeStyle = "#ffe680";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(0, -r * 1.05);
      c.quadraticCurveTo(r * 1.1, -r * 0.2, r * 0.95, r * 0.9);
      c.lineTo(-r * 0.95, r * 0.9);
      c.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 1.05);
      c.closePath();
      c.fillStyle = body(col);
      c.fill();
      c.strokeStyle = mixHex(col, "#000", 0.5);
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "#fff";
      c.fillRect(-r * 0.12, -r * 0.1, r * 0.24, r * 0.75);
      c.fillRect(-r * 0.35, r * 0.12, r * 0.7, r * 0.22);
      eyes(dir * r * 0.1, -r * 0.45, r * 0.15);
      break;
    }
    // 分裂者。
    case "splitter": {
      const p = Math.sin(t * 4) * 0.12;
      c.beginPath();
      c.arc(-r * (0.4 + p), 0, r * 0.78, 0, TAU);
      c.arc(r * (0.4 + p), 0, r * 0.78, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = mixHex(col, "#000", 0.55);
      c.stroke();
      c.fillStyle = rgba("#ffffff", 0.35);
      c.beginPath();
      c.arc(-r * 0.4, 0, r * 0.3, 0, TAU);
      c.arc(r * 0.4, 0, r * 0.3, 0, TAU);
      c.fill();
      eyes(dir * r * 0.05, -r * 0.25, r * 0.17);
      break;
    }
    // 持盾者。
    case "shield": {
      c.beginPath();
      c.arc(0, 0, r * 0.9, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = "#1a2a5a";
      c.stroke();
      eyes(dir * r * 0.15, -r * 0.2, r * 0.18);
      c.save();
      c.translate(dir * r * 0.8, 0);
      poly(c, [
        [0, -r * 0.9],
        [r * 0.45, -r * 0.55],
        [r * 0.45, r * 0.4],
        [0, r * 0.9],
        [-r * 0.45, r * 0.4],
        [-r * 0.45, -r * 0.55],
      ]);
      c.fillStyle = "#c8d8ff";
      c.fill();
      c.strokeStyle = "#3a5aaa";
      c.lineWidth = 2;
      c.stroke();
      c.restore();
      if (e.shield > 0) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.beginPath();
        c.arc(0, 0, r * 1.35, 0, TAU);
        c.fillStyle = rgba("#5aa8ff", 0.12 + (0.2 * e.shield) / e.shieldMax);
        c.fill();
        c.strokeStyle = rgba("#a8d8ff", 0.6);
        c.lineWidth = 1.5;
        c.stroke();
        c.restore();
      }
      break;
    }
    // 幽靈。
    case "ghost": {
      c.beginPath();
      c.moveTo(-r, r * 0.9);
      c.lineTo(-r, -r * 0.1);
      c.arc(0, -r * 0.1, r, Math.PI, 0);
      c.lineTo(r, r * 0.9);
      for (let i = 0; i < 4; i++) {
        const x0 = r - (i * r) / 2;
        c.quadraticCurveTo(
          x0 - r / 4,
          r * (0.5 + 0.3 * Math.sin(t * 6 + i)),
          x0 - r / 2,
          r * 0.9,
        );
      }
      c.closePath();
      c.fillStyle = body(col, "#ffffff");
      c.globalAlpha *= 0.9;
      c.fill();
      c.fillStyle = "#1a1a3a";
      c.beginPath();
      c.ellipse(-r * 0.35, -r * 0.2, r * 0.17, r * 0.25, 0, 0, TAU);
      c.ellipse(r * 0.35, -r * 0.2, r * 0.17, r * 0.25, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.ellipse(0, r * 0.25, r * 0.15, r * 0.2, 0, 0, TAU);
      c.fill();
      break;
    }
    // 首領：石魔像。
    case "golem": {
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i * TAU) / 9;
        const rr2 = r * (1 + 0.1 * Math.sin(i * 3.7));
        c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2 * 0.9);
      }
      c.closePath();
      c.fillStyle = body(col);
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = "#2a1a0a";
      c.stroke();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = rgba("#ff8a2a", 0.7 + 0.3 * Math.sin(t * 4));
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-r * 0.6, -r * 0.5);
      c.lineTo(-r * 0.2, -r * 0.1);
      c.lineTo(-r * 0.4, r * 0.4);
      c.moveTo(r * 0.5, -r * 0.6);
      c.lineTo(r * 0.2, 0);
      c.lineTo(r * 0.55, r * 0.5);
      c.stroke();
      glow(c, -r * 0.3 + dir * r * 0.1, -r * 0.3, r * 0.35, "#ff6a1a", 0.9);
      glow(c, r * 0.3 + dir * r * 0.1, -r * 0.3, r * 0.35, "#ff6a1a", 0.9);
      c.restore();
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.arc(
          sx * r * 1.05,
          r * 0.2 + Math.sin(t * 3 + sx) * 4,
          r * 0.38,
          0,
          TAU,
        );
        c.fillStyle = body(col);
        c.fill();
        c.strokeStyle = "#2a1a0a";
        c.lineWidth = 2;
        c.stroke();
      }
      break;
    }
    // 首領：巫妖。
    case "lich": {
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, 0, 0, r * 2, "#8a5aff", 0.45 + 0.2 * Math.sin(t * 3));
      c.restore();
      c.beginPath();
      c.moveTo(0, -r * 0.9);
      c.quadraticCurveTo(r * 1.3, -r * 0.1, r * 1, r * 1);
      c.lineTo(-r * 1, r * 1);
      c.quadraticCurveTo(-r * 1.3, -r * 0.1, 0, -r * 0.9);
      c.closePath();
      c.fillStyle = body("#4a2a8a");
      c.fill();
      c.strokeStyle = "#1a0a3a";
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(0, -r * 0.65, r * 0.45, 0, TAU);
      c.fillStyle = "#e8e0d0";
      c.fill();
      c.fillStyle = "#7aff6a";
      c.beginPath();
      c.arc(-r * 0.17, -r * 0.68, r * 0.1, 0, TAU);
      c.arc(r * 0.17, -r * 0.68, r * 0.1, 0, TAU);
      c.fill();
      c.fillStyle = "#ffcf3a";
      poly(c, [
        [-r * 0.45, -r * 1.0],
        [-r * 0.3, -r * 1.4],
        [-r * 0.15, -r * 1.1],
        [0, -r * 1.5],
        [r * 0.15, -r * 1.1],
        [r * 0.3, -r * 1.4],
        [r * 0.45, -r * 1.0],
      ]);
      c.fill();
      c.strokeStyle = "#a87a4a";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(r * 1, r * 0.9);
      c.lineTo(r * 1.2, -r * 1.2);
      c.stroke();
      c.save();
      c.globalCompositeOperation = "lighter";
      glow(c, r * 1.2, -r * 1.3, r * 0.5, "#7aff6a", 1);
      c.restore();
      break;
    }
    // 首領：巨龍。
    case "dragon": {
      const f = Math.sin(t * 7);
      c.save();
      c.scale(dir, 1);
      c.fillStyle = mixHex(col, "#000", 0.35);
      for (const sy of [-1]) {
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.2);
        c.quadraticCurveTo(
          -r * 0.4,
          -r * (1.8 + f * 0.5),
          r * 0.6,
          -r * (1.6 + f * 0.6),
        );
        c.quadraticCurveTo(r * 0.3, -r * 0.8, r * 0.4, -r * 0.1);
        c.closePath();
        c.fill();
      }
      c.beginPath();
      c.moveTo(-r * 1, 0);
      c.quadraticCurveTo(-r * 1.8, r * 0.3 + f * 5, -r * 2.2, -r * 0.2);
      c.lineWidth = r * 0.25;
      c.strokeStyle = col;
      c.lineCap = "round";
      c.stroke();
      c.beginPath();
      c.ellipse(0, 0, r * 1.05, r * 0.62, 0, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.beginPath();
      c.ellipse(r * 0.95, -r * 0.3, r * 0.5, r * 0.35, -0.3, 0, TAU);
      c.fillStyle = body(col);
      c.fill();
      c.fillStyle = "#ffe03a";
      c.beginPath();
      c.arc(r * 1.1, -r * 0.4, r * 0.09, 0, TAU);
      c.fill();
      c.fillStyle = "#fff";
      poly(c, [
        [r * 0.8, -r * 0.6],
        [r * 0.7, -r * 1],
        [r * 0.95, -r * 0.65],
      ]);
      c.fill();
      c.restore();
      break;
    }
  }
  c.globalAlpha = 1;
  // 受擊閃白
  // 受擊閃白。
  if (e.flash > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, 0, 0, r * 1.4, "#ffffff", e.flash * 6);
    c.restore();
  }
  // 狀態
  // 冰凍。
  if (e.frozen > 0) {
    c.save();
    c.globalAlpha = 0.55;
    rr(c, -r * 1.1, -r * 1.1, r * 2.2, r * 2, 4);
    c.fillStyle = "#9ae0ff";
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 1.5;
    c.stroke();
    c.restore();
  } else if (e.slowAmt > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, 0, r * 0.5, r * 1.1, "#48c8ff", 0.45);
    c.restore();
  }
  // 中毒。
  if (e.psn > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, 0, 0, r * 1.2, "#7cf03a", 0.25 + e.psn * 0.06);
    c.restore();
  }
  // 破甲。
  if (e.shred > 0) {
    c.save();
    c.strokeStyle = "#c868ff";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-r * 0.6, -r * 0.6);
    c.lineTo(r * 0.6, r * 0.6);
    c.moveTo(r * 0.6, -r * 0.6);
    c.lineTo(-r * 0.6, r * 0.6);
    c.globalAlpha = 0.6;
    c.stroke();
    c.restore();
  }
  // 暈眩的星星。
  if (e.stun > 0 && e.frozen <= 0) {
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + (i * TAU) / 3;
      sparkle(
        c,
        Math.cos(a) * r * 0.8,
        -r * 1.25 + Math.sin(a) * r * 0.25,
        4,
        "#ffe03a",
      );
    }
  }
  // 菁英的小皇冠。
  if (e.elite && !e.boss) {
    c.fillStyle = "#ffcf3a";
    poly(c, [
      [-r * 0.5, -r * 1.05],
      [-r * 0.5, -r * 1.5],
      [-r * 0.25, -r * 1.25],
      [0, -r * 1.6],
      [r * 0.25, -r * 1.25],
      [r * 0.5, -r * 1.5],
      [r * 0.5, -r * 1.05],
    ]);
    c.fill();
    c.strokeStyle = "#6a3a00";
    c.lineWidth = 1.5;
    c.stroke();
  }
  c.restore();
  // 血條
  // 血條與護盾。
  if (e.hp < e.maxHp || e.boss || e.elite || e.shield > 0) {
    const bw = e.boss ? 90 : Math.max(26, r * 2.2),
      bx = e.x - bw / 2,
      byy = e.y + bob - r * (e.boss ? 1.9 : 1.55) - 6;
    c.fillStyle = "rgba(0,0,0,.7)";
    c.fillRect(bx - 1, byy - 1, bw + 2, e.boss ? 8 : 6);
    const k = clamp(e.hp / e.maxHp, 0, 1);
    c.fillStyle = k > 0.5 ? "#5cff6a" : k > 0.25 ? "#ffcf3a" : "#ff4a3a";
    c.fillRect(bx, byy, bw * k, e.boss ? 6 : 4);
    if (e.shield > 0) {
      c.fillStyle = "#8ad0ff";
      c.fillRect(bx, byy - 3, bw * clamp(e.shield / e.shieldMax, 0, 1), 2.5);
    }
  }
}

// ===== 主堡與傳送門 =====
function drawCore(c, x, y, time, ratio, hitFlash) {
  c.save();
  c.translate(x, y);
  const col = ratio > 0.5 ? "#5ae0ff" : ratio > 0.25 ? "#ffcf3a" : "#ff4a4a";
  c.fillStyle = "rgba(0,0,0,.4)";
  c.beginPath();
  c.ellipse(0, 22, 34, 11, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.ellipse(0, 16, 30, 11, 0, 0, TAU);
  c.fillStyle = "#3a3050";
  c.fill();
  c.strokeStyle = "#8a80b0";
  c.lineWidth = 2;
  c.stroke();
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, 0, -10, 60, col, 0.6 + 0.2 * Math.sin(time * 3) + hitFlash);
  c.restore();
  for (let i = 0; i < 4; i++) {
    const a = time * 1.2 + (i * TAU) / 4;
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, Math.cos(a) * 30, -10 + Math.sin(a) * 10, 7, col, 0.9);
    c.restore();
  }
  const fy = -14 + Math.sin(time * 2) * 3;
  poly(c, [
    [0, fy - 34],
    [14, fy - 8],
    [10, fy + 18],
    [0, fy + 26],
    [-10, fy + 18],
    [-14, fy - 8],
  ]);
  const g = c.createLinearGradient(-14, fy - 34, 14, fy + 26);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, col);
  g.addColorStop(1, mixHex(col, "#000", 0.5));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "#fff";
  c.lineWidth = 1.5;
  c.stroke();
  c.beginPath();
  c.moveTo(0, fy - 34);
  c.lineTo(0, fy + 26);
  c.moveTo(-14, fy - 8);
  c.lineTo(0, fy - 2);
  c.lineTo(14, fy - 8);
  c.strokeStyle = "rgba(255,255,255,.5)";
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}
// 敵人出現的傳送門。
function drawPortal(c, x, y, time, col = "#b05aff") {
  c.save();
  c.translate(x, y);
  c.globalCompositeOperation = "lighter";
  glow(c, 0, 0, 56, col, 0.7);
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate(time * (1.5 + i * 0.3) * (i % 2 ? -1 : 1));
    c.beginPath();
    c.ellipse(0, 0, 14 + i * 4, 28 + i * 3, 0, i, i + 4.2);
    c.strokeStyle = rgba(i % 2 ? "#ffffff" : col, 0.65 - i * 0.08);
    c.lineWidth = 3;
    c.stroke();
    c.restore();
  }
  c.restore();
}

// ===== 地圖（版面、裝飾物、高解析度預繪、動態光效） =====
// 把路徑的格子座標換成畫布座標。
function pathPoints(map) {
  return map.path.map(([cx, cy]) => [cx * TS + TS / 2, cy * TS + TS / 2]);
}
// 計算路徑經過的格子，並在空地隨機擺放裝飾物。
function mapLayout(map) {
  if (map._layout) return map._layout;
  const cells = new Set();
  for (let i = 0; i < map.path.length - 1; i++) {
    let [x, y] = map.path[i];
    const [x2, y2] = map.path[i + 1];
    const sx = Math.sign(x2 - x),
      sy = Math.sign(y2 - y);
    while (true) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) cells.add(x + "," + y);
      if (x === x2 && y === y2) break;
      x += sx;
      y += sy;
    }
  }
  const rnd = mulberry32(map.seed * 7 + 3);
  // 這一格附近是否有道路。
  const near = (x, y) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (cells.has(x + dx + "," + (y + dy))) return true;
    return false;
  };
  const cand = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++)
      if (!cells.has(x + "," + y) && !near(x, y)) cand.push([x, y]);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const types = {
    meadow: ["tree", "tree", "pine", "pine", "rock", "bush", "pond"],
    lava: ["spire", "spire", "vent", "rock", "lavapool"],
    astral: ["crystal", "crystal", "planet", "obelisk", "crystal"],
  }[map.theme];
  const deco = cand.slice(0, 13).map(([x, y]) => ({
    x,
    y,
    type: types[Math.floor(rnd() * types.length)],
    v: rnd(),
  }));
  map._layout = {
    cells,
    deco,
    decoSet: new Set(deco.map((d) => d.x + "," + d.y)),
  };
  return map._layout;
}
// 沿著路徑每隔一段距離取一個點。
function samplePath(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i],
      [bx, by] = pts[i + 1],
      L = Math.hypot(bx - ax, by - ay),
      n = Math.max(1, Math.floor(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([
        lerp(ax, bx, t),
        lerp(ay, by, t),
        (bx - ax) / L,
        (by - ay) / L,
      ]);
    }
  }
  return out;
}
// 畫一個裝飾物。
function drawDeco(g, d, th, rnd) {
  const cx = d.x * TS + TS / 2,
    cy = d.y * TS + TS / 2,
    v = d.v;
  g.save();
  g.fillStyle = "rgba(0,0,0,.3)";
  g.beginPath();
  g.ellipse(cx + 4, cy + 18, 26, 10, 0, 0, TAU);
  g.fill();
  switch (d.type) {
    // 闊葉樹。
    case "tree": {
      g.fillStyle = "#5a3418";
      rr(g, cx - 5, cy + 2, 10, 18, 3);
      g.fill();
      const blobs = [
        [0, -8, 24],
        [-14, 0, 17],
        [14, -1, 18],
        [0, -24, 17],
        [-8, -16, 15],
        [10, -16, 15],
      ];
      for (const [dx, dy, r] of blobs) {
        g.beginPath();
        g.arc(cx + dx, cy + dy + 2, r, 0, TAU);
        g.fillStyle = "#1e4a1e";
        g.fill();
      }
      for (const [dx, dy, r] of blobs) {
        const gr = g.createRadialGradient(
          cx + dx - r * 0.4,
          cy + dy - r * 0.5,
          2,
          cx + dx,
          cy + dy,
          r,
        );
        gr.addColorStop(0, v > 0.5 ? "#9ae06a" : "#b0e870");
        gr.addColorStop(0.6, "#3e8a34");
        gr.addColorStop(1, "#245a22");
        g.beginPath();
        g.arc(cx + dx, cy + dy, r - 1, 0, TAU);
        g.fillStyle = gr;
        g.fill();
      }
      if (v > 0.6)
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(
            cx + (rnd() - 0.5) * 34,
            cy - 10 + (rnd() - 0.5) * 26,
            3,
            0,
            TAU,
          );
          g.fillStyle = "#ff5a6a";
          g.fill();
        }
      break;
    }
    // 松樹。
    case "pine": {
      g.fillStyle = "#4a2a10";
      g.fillRect(cx - 4, cy + 6, 8, 14);
      for (let k = 0; k < 3; k++) {
        const w = 26 - k * 6,
          yy = cy + 10 - k * 14;
        g.beginPath();
        g.moveTo(cx - w, yy);
        g.lineTo(cx, yy - 26);
        g.lineTo(cx + w, yy);
        g.closePath();
        const gr = g.createLinearGradient(cx - w, 0, cx + w, 0);
        gr.addColorStop(0, "#2e6a3a");
        gr.addColorStop(0.5, "#4a9a50");
        gr.addColorStop(1, "#1e4a28");
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = "#163a1e";
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,.7)";
      g.beginPath();
      g.moveTo(cx - 6, cy - 32);
      g.lineTo(cx, cy - 40);
      g.lineTo(cx + 6, cy - 32);
      g.closePath();
      g.fill();
      break;
    }
    // 岩石。
    case "rock": {
      const col =
        th === "lava" ? ["#4a3a3a", "#2a1e20"] : ["#a8a8b0", "#5a5a66"];
      poly(g, [
        [cx - 24, cy + 14],
        [cx - 18, cy - 6],
        [cx - 4, cy - 16],
        [cx + 14, cy - 12],
        [cx + 24, cy + 4],
        [cx + 18, cy + 16],
      ]);
      const gr = g.createLinearGradient(cx - 20, cy - 16, cx + 20, cy + 16);
      gr.addColorStop(0, col[0]);
      gr.addColorStop(1, col[1]);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.5)";
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 4, cy - 16);
      g.lineTo(cx - 2, cy + 2);
      g.lineTo(cx + 24, cy + 4);
      g.strokeStyle = "rgba(255,255,255,.25)";
      g.stroke();
      if (th === "meadow") {
        g.fillStyle = "rgba(110,170,80,.7)";
        g.beginPath();
        g.ellipse(cx - 10, cy - 6, 8, 4, -0.4, 0, TAU);
        g.fill();
      }
      break;
    }
    // 灌木。
    case "bush": {
      for (const [dx, dy, r] of [
        [-12, 4, 13],
        [10, 4, 14],
        [0, -6, 15],
      ]) {
        const gr = g.createRadialGradient(
          cx + dx - 4,
          cy + dy - 5,
          2,
          cx + dx,
          cy + dy,
          r,
        );
        gr.addColorStop(0, "#8ad860");
        gr.addColorStop(1, "#2e7030");
        g.beginPath();
        g.arc(cx + dx, cy + dy, r, 0, TAU);
        g.fillStyle = gr;
        g.fill();
      }
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 18, 2.5, 0, TAU);
        g.fillStyle = pick(["#ffffff", "#ffe060", "#ff9ad0"]);
        g.fill();
      }
      break;
    }
    // 水池。
    case "pond": {
      g.beginPath();
      g.ellipse(cx, cy + 4, 28, 20, 0, 0, TAU);
      g.fillStyle = "#6a5a3a";
      g.fill();
      const gr = g.createRadialGradient(cx - 8, cy - 2, 2, cx, cy + 4, 26);
      gr.addColorStop(0, "#9ae8ff");
      gr.addColorStop(0.6, "#3a98d0");
      gr.addColorStop(1, "#1a5a90");
      g.beginPath();
      g.ellipse(cx, cy + 4, 24, 16, 0, 0, TAU);
      g.fillStyle = gr;
      g.fill();
      g.fillStyle = "#3a9a40";
      g.beginPath();
      g.ellipse(cx + 8, cy + 8, 6, 4, 0.3, 0, TAU);
      g.fill();
      g.fillStyle = "#ff9ad0";
      g.beginPath();
      g.arc(cx + 9, cy + 6, 2.2, 0, TAU);
      g.fill();
      break;
    }
    // 尖岩。
    case "spire": {
      poly(g, [
        [cx - 18, cy + 18],
        [cx - 8, cy - 30],
        [cx - 2, cy - 38],
        [cx + 6, cy - 26],
        [cx + 18, cy + 18],
      ]);
      const gr = g.createLinearGradient(cx - 18, 0, cx + 18, 0);
      gr.addColorStop(0, "#3a2a2e");
      gr.addColorStop(0.5, "#1e1418");
      gr.addColorStop(1, "#100a0c");
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#000";
      g.lineWidth = 1.5;
      g.stroke();
      g.save();
      g.shadowColor = "#ff6a1a";
      g.shadowBlur = 10;
      g.strokeStyle = "#ff8a2a";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 2, cy - 34);
      g.lineTo(cx - 6, cy - 12);
      g.lineTo(cx + 2, cy);
      g.lineTo(cx - 4, cy + 16);
      g.stroke();
      g.restore();
      break;
    }
    // 噴氣口。
    case "vent": {
      g.beginPath();
      g.ellipse(cx, cy + 6, 26, 14, 0, 0, TAU);
      g.fillStyle = "#2a1a1c";
      g.fill();
      g.beginPath();
      g.ellipse(cx, cy + 2, 18, 9, 0, 0, TAU);
      const gr = g.createRadialGradient(cx, cy + 2, 1, cx, cy + 2, 18);
      gr.addColorStop(0, "#fff0a0");
      gr.addColorStop(0.4, "#ff7a1a");
      gr.addColorStop(1, "#5a1000");
      g.fillStyle = gr;
      g.fill();
      break;
    }
    // 熔岩池。
    case "lavapool": {
      g.beginPath();
      g.ellipse(cx, cy + 4, 28, 20, 0, 0, TAU);
      g.fillStyle = "#1a0e0e";
      g.fill();
      const gr = g.createRadialGradient(cx - 6, cy, 2, cx, cy + 4, 24);
      gr.addColorStop(0, "#fff2a0");
      gr.addColorStop(0.35, "#ffa020");
      gr.addColorStop(0.8, "#d03000");
      gr.addColorStop(1, "#5a0a00");
      g.beginPath();
      g.ellipse(cx, cy + 4, 23, 15, 0, 0, TAU);
      g.fillStyle = gr;
      g.fill();
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(
          cx + (rnd() - 0.5) * 26,
          cy + 4 + (rnd() - 0.5) * 14,
          5,
          2.5,
          0,
          0,
          TAU,
        );
        g.fillStyle = "rgba(60,10,0,.6)";
        g.fill();
      }
      break;
    }
    // 水晶。
    case "crystal": {
      const cols = v > 0.5 ? ["#7af0ff", "#2a6aff"] : ["#ff9af0", "#8a2aff"];
      for (const [dx, h, a] of [
        [-12, 30, -0.35],
        [12, 26, 0.35],
        [0, 44, 0],
        [-4, 20, -0.15],
        [8, 18, 0.2],
      ]) {
        g.save();
        g.translate(cx + dx, cy + 16);
        g.rotate(a);
        poly(g, [
          [-6, 0],
          [-6, -h + 8],
          [0, -h],
          [6, -h + 8],
          [6, 0],
        ]);
        const gr = g.createLinearGradient(-6, 0, 6, 0);
        gr.addColorStop(0, "#ffffff");
        gr.addColorStop(0.35, cols[0]);
        gr.addColorStop(1, cols[1]);
        g.fillStyle = gr;
        g.globalAlpha = 0.9;
        g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(255,255,255,.7)";
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
      break;
    }
    // 小行星。
    case "planet": {
      const gr = g.createRadialGradient(cx - 6, cy - 12, 2, cx, cy - 6, 20);
      gr.addColorStop(0, "#ffd8a0");
      gr.addColorStop(0.6, "#d0603a");
      gr.addColorStop(1, "#3a1030");
      g.beginPath();
      g.arc(cx, cy - 6, 18, 0, TAU);
      g.fillStyle = gr;
      g.fill();
      g.beginPath();
      g.ellipse(cx, cy - 6, 30, 7, -0.3, 0, TAU);
      g.strokeStyle = "rgba(255,220,160,.8)";
      g.lineWidth = 2.5;
      g.stroke();
      break;
    }
    // 方尖碑。
    case "obelisk": {
      poly(g, [
        [cx - 9, cy + 18],
        [cx - 6, cy - 30],
        [cx, cy - 40],
        [cx + 6, cy - 30],
        [cx + 9, cy + 18],
      ]);
      const gr = g.createLinearGradient(cx - 9, 0, cx + 9, 0);
      gr.addColorStop(0, "#2a2060");
      gr.addColorStop(0.5, "#5a4ab0");
      gr.addColorStop(1, "#1a1040");
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#9ad8ff";
      g.lineWidth = 1.2;
      g.stroke();
      g.save();
      g.shadowColor = "#5ae8ff";
      g.shadowBlur = 8;
      g.fillStyle = "#9af0ff";
      for (let k = 0; k < 3; k++) g.fillRect(cx - 2, cy - 22 + k * 12, 4, 6);
      g.restore();
      break;
    }
  }
  g.restore();
}
// 預先畫好整張地圖（兩倍解析度），遊戲中直接貼上。
function paintMap(map) {
  const S = 2,
    w = COLS * TS,
    h = ROWS * TS;
  const cv = document.createElement("canvas");
  cv.width = w * S;
  cv.height = h * S;
  const g = cv.getContext("2d");
  g.scale(S, S);
  const rnd = mulberry32(map.seed);
  const pts = pathPoints(map),
    lay = mapLayout(map),
    th = map.theme;
  // 地面
  if (th === "meadow") {
    // 草原：草地、花朵與明暗色塊。
    let gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#5aa848");
    gr.addColorStop(0.5, "#459a3e");
    gr.addColorStop(1, "#2f6e32");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        r = 60 + rnd() * 120;
      g.globalAlpha = 0.12;
      g.drawImage(
        glowSpr(rnd() < 0.5 ? "#c8f080" : "#1a5a1a"),
        x - r,
        y - r,
        r * 2,
        r * 2,
      );
      g.globalAlpha = 1;
    }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (lay.cells.has(x + "," + y)) continue;
        rr(g, x * TS + 2, y * TS + 2, TS - 4, TS - 4, 8);
        g.fillStyle =
          (x + y) % 2 ? "rgba(255,255,210,.045)" : "rgba(0,40,0,.045)";
        g.fill();
        g.strokeStyle = "rgba(255,255,255,.05)";
        g.lineWidth = 1;
        g.stroke();
      }
    for (let i = 0; i < 3600; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        l = 4 + rnd() * 7;
      g.strokeStyle =
        rnd() < 0.5 ? "rgba(150,220,100,.45)" : "rgba(20,70,20,.38)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(
        x + (rnd() - 0.5) * 4,
        y - l * 0.6,
        x + (rnd() - 0.5) * 5,
        y - l,
      );
      g.stroke();
    }
    for (let i = 0; i < 130; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        col = pick(["#ffe680", "#ff9ad0", "#ffffff", "#a8c8ff", "#ffb060"]);
      for (let k = 0; k < 5; k++) {
        const a = (k * TAU) / 5;
        g.beginPath();
        g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, 0, TAU);
        g.fillStyle = col;
        g.fill();
      }
      g.beginPath();
      g.arc(x, y, 1.6, 0, TAU);
      g.fillStyle = "#ffb020";
      g.fill();
    }
  } else if (th === "lava") {
    // 熔岩：岩地與發光的裂縫。
    let gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "#2e1c20");
    gr.addColorStop(1, "#140a0e");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const v = rnd();
        rr(g, x * TS + 3, y * TS + 3, TS - 6, TS - 6, 7);
        const tg = g.createLinearGradient(
          x * TS,
          y * TS,
          x * TS + TS,
          y * TS + TS,
        );
        tg.addColorStop(0, `rgba(${100 + v * 30},${56 + v * 20},${56},.32)`);
        tg.addColorStop(1, "rgba(20,10,12,.4)");
        g.fillStyle = tg;
        g.fill();
        g.strokeStyle = "rgba(0,0,0,.5)";
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = "rgba(255,140,80,.06)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x * TS + 6, y * TS + 5);
        g.lineTo(x * TS + TS - 6, y * TS + 5);
        g.stroke();
      }
    g.save();
    g.shadowColor = "#ff5a10";
    g.shadowBlur = 12;
    for (let i = 0; i < 90; i++) {
      let x = rnd() * w,
        y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.strokeStyle = rgba(rnd() < 0.5 ? "#ff6a1a" : "#ffae3a", 0.6);
      g.lineWidth = 1 + rnd() * 2.2;
      g.stroke();
    }
    g.restore();
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w,
        y = rnd() * h;
      g.globalAlpha = 0.2;
      g.drawImage(glowSpr("#ff4a10"), x - 70, y - 70, 140, 140);
      g.globalAlpha = 1;
    }
  } else {
    let gr = g.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, "#24186a");
    gr.addColorStop(1, "#06041a");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        r = 80 + rnd() * 180;
      g.globalAlpha = 0.24;
      g.drawImage(
        glowSpr(pick(["#7a3aff", "#2a6aff", "#ff3aa8", "#3ad8ff"])),
        x - r,
        y - r,
        r * 2,
        r * 2,
      );
      g.globalAlpha = 1;
    }
    for (let i = 0; i < 1200; i++) {
      const x = rnd() * w,
        y = rnd() * h,
        s = rnd() * 1.6 + 0.3;
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 30; i++)
      sparkle(g, rnd() * w, rnd() * h, 3 + rnd() * 6, rgba("#ffffff", 0.85));
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (lay.cells.has(x + "," + y)) continue;
        rr(g, x * TS + 4, y * TS + 4, TS - 8, TS - 8, 10);
        g.strokeStyle = "rgba(120,180,255,.1)";
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = "rgba(120,160,255,.025)";
        g.fill();
      }
  }
  // 格子斜角（立體石板）
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const k = x + "," + y;
      if (lay.cells.has(k)) continue;
      const x0 = x * TS + 3,
        y0 = y * TS + 3,
        s2 = TS - 6;
      g.strokeStyle =
        th === "astral" ? "rgba(150,200,255,.12)" : "rgba(255,255,255,.12)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y0 + s2);
      g.lineTo(x0, y0);
      g.lineTo(x0 + s2, y0);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,.18)";
      g.beginPath();
      g.moveTo(x0 + s2, y0);
      g.lineTo(x0 + s2, y0 + s2);
      g.lineTo(x0, y0 + s2);
      g.stroke();
    }
  const groundCopy = document.createElement("canvas");
  // 保留一份地面，之後用來蓋回道路以外的部分。
  groundCopy.width = cv.width;
  groundCopy.height = cv.height;
  groundCopy.getContext("2d").drawImage(cv, 0, 0);
  // 道路
  const pc = document.createElement("canvas");
  pc.width = w * S;
  pc.height = h * S;
  const p = pc.getContext("2d");
  p.scale(S, S);
  p.lineJoin = "round";
  p.lineCap = "round";
  // 沿著路徑畫線。
  const line = () => {
    p.beginPath();
    pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  };
  // 道路的三層顏色。
  const PC =
    th === "meadow"
      ? ["#4a3018", "#9a7448", "#b8905e"]
      : th === "lava"
        ? ["#ff6a10", "#241616", "#341f20"]
        : ["#5ad8ff", "#221a6a", "#2e2490"];
  line();
  p.lineWidth = 62;
  p.strokeStyle = PC[0];
  p.stroke();
  line();
  p.lineWidth = 54;
  p.strokeStyle = PC[1];
  p.stroke();
  const samples = samplePath(pts, 9);
  // 道路表面的細節：石子、熔岩塊或格線。
  if (th === "meadow") {
    for (const [sx, sy, dx, dy] of samples)
      for (let k = 0; k < 3; k++) {
        const off = (rnd() - 0.5) * 44,
          x = sx - dy * off + (rnd() - 0.5) * 6,
          y = sy + dx * off + (rnd() - 0.5) * 6,
          r = 5 + rnd() * 4;
        const gr = p.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
        const base = 150 + rnd() * 40;
        gr.addColorStop(0, `rgb(${base + 50},${base + 30},${base})`);
        gr.addColorStop(1, `rgb(${base - 50},${base - 70},${base - 90})`);
        p.beginPath();
        p.ellipse(x, y, r, r * 0.78, rnd() * 3, 0, TAU);
        p.fillStyle = gr;
        p.fill();
        p.strokeStyle = "rgba(60,40,20,.55)";
        p.lineWidth = 1;
        p.stroke();
      }
  } else if (th === "lava") {
    for (const [sx, sy, dx, dy] of samples) {
      if (rnd() < 0.5) continue;
      const off = (rnd() - 0.5) * 40,
        x = sx - dy * off,
        y = sy + dx * off,
        r = 6 + rnd() * 6;
      p.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6 + rnd() * 0.3;
        p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      p.closePath();
      p.fillStyle = `rgba(${50 + rnd() * 20},${30 + rnd() * 10},${32},.9)`;
      p.fill();
      p.strokeStyle = "rgba(255,110,30,.55)";
      p.lineWidth = 1.2;
      p.stroke();
    }
  } else {
    p.globalCompositeOperation = "source-atop";
    p.strokeStyle = "rgba(120,220,255,.28)";
    p.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      p.beginPath();
      p.moveTo(x, 0);
      p.lineTo(x, h);
      p.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      p.beginPath();
      p.moveTo(0, y);
      p.lineTo(w, y);
      p.stroke();
    }
    p.globalCompositeOperation = "source-over";
    line();
    p.lineWidth = 3;
    p.strokeStyle = "rgba(160,240,255,.5)";
    p.setLineDash([14, 10]);
    p.stroke();
    p.setLineDash([]);
  }
  // 道路內緣陰影
  p.globalCompositeOperation = "source-atop";
  line();
  p.lineWidth = 54;
  p.strokeStyle = "rgba(0,0,0,.18)";
  p.stroke();
  line();
  p.lineWidth = 40;
  p.strokeStyle = "rgba(0,0,0,0)";
  p.stroke();
  p.globalCompositeOperation = "source-over";
  // 懸崖壁（道路下沉 10px）
  const DROP = 10;
  g.save();
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
  const wallCol =
    th === "meadow" ? "#5a3c22" : th === "lava" ? "#1a0a0a" : "#120c3a";
  g.lineWidth = 64;
  g.strokeStyle = wallCol;
  g.stroke();
  g.restore();
  g.save();
  g.shadowColor =
    th === "meadow" ? "rgba(0,0,0,.55)" : th === "lava" ? "#ff5a10" : "#5ad8ff";
  g.shadowBlur = th === "meadow" ? 10 : 22;
  g.drawImage(pc, 0, DROP, w, h);
  g.restore();
  // 地面蓋回（只露出北側的懸崖）
  const gm = document.createElement("canvas");
  gm.width = cv.width;
  gm.height = cv.height;
  const gmc = gm.getContext("2d");
  gmc.drawImage(groundCopy, 0, 0);
  gmc.scale(S, S);
  gmc.globalCompositeOperation = "destination-out";
  gmc.lineJoin = "round";
  gmc.lineCap = "round";
  gmc.beginPath();
  pts.forEach((q, i) => (i ? gmc.lineTo(q[0], q[1]) : gmc.moveTo(q[0], q[1])));
  gmc.lineWidth = 62;
  gmc.stroke();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.shadowColor = "rgba(0,0,0,.6)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  g.drawImage(gm, 0, 0);
  g.restore();
  // 崖邊亮線
  const rim = document.createElement("canvas");
  rim.width = cv.width;
  rim.height = cv.height;
  const rc = rim.getContext("2d");
  rc.scale(S, S);
  rc.lineJoin = "round";
  rc.lineCap = "round";
  // 沿著路徑畫線。
  const pl = () => {
    rc.beginPath();
    pts.forEach((q, i) => (i ? rc.lineTo(q[0], q[1]) : rc.moveTo(q[0], q[1])));
  };
  pl();
  rc.lineWidth = 66;
  rc.strokeStyle =
    th === "meadow"
      ? "rgba(220,255,170,.5)"
      : th === "lava"
        ? "rgba(255,140,60,.7)"
        : "rgba(140,230,255,.7)";
  rc.stroke();
  rc.globalCompositeOperation = "destination-out";
  pl();
  rc.lineWidth = 61;
  rc.stroke();
  g.drawImage(rim, 0, 0, w, h);
  // 草原道路邊緣的小草。
  if (th === "meadow") {
    for (const [sx, sy, dx, dy] of samples)
      for (const sd of [-1, 1]) {
        if (rnd() < 0.4) continue;
        const x = sx - dy * sd * 29,
          y = sy + dx * sd * 29;
        for (let k = 0; k < 3; k++) {
          g.strokeStyle =
            rnd() < 0.5 ? "rgba(120,200,90,.85)" : "rgba(60,130,50,.8)";
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x + (rnd() - 0.5) * 8, y + 3);
          g.lineTo(x + (rnd() - 0.5) * 10, y - 4 - rnd() * 5);
          g.stroke();
        }
      }
  }
  // 裝飾物
  for (const d of lay.deco) drawDeco(g, d, th, rnd);
  // 四周的暗角。
  const vg = g.createRadialGradient(
    w / 2,
    h / 2,
    h * 0.4,
    w / 2,
    h / 2,
    w * 0.62,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,.38)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return cv;
}
// 動態地圖光效（每幀）
function drawMapFX(c, t) {
  const th = R.map.theme,
    lay = mapLayout(R.map),
    P = R.path;
  c.save();
  if (th === "meadow") {
    // 草原：雲影、蝴蝶、光束與水面反光。
    for (let k = 0; k < 3; k++) {
      const x = MX + ((t * 14 + k * 520) % (COLS * TS + 600)) - 300,
        y = MY + 150 + k * 300;
      c.globalAlpha = 0.07;
      c.drawImage(glowSpr("#000000"), x - 260, y - 140, 520, 280);
    }
    c.globalAlpha = 1;
    for (let k = 0; k < 6; k++) {
      const bx = MX + ((t * (18 + k * 4) + k * 230) % (COLS * TS)),
        by = MY + 120 + k * 130 + Math.sin(t * 1.3 + k) * 40,
        f = Math.abs(Math.sin(t * 14 + k));
      c.fillStyle = [
        "#ffe680",
        "#ff9ad0",
        "#9ad8ff",
        "#ffffff",
        "#ffb060",
        "#c8a0ff",
      ][k];
      c.beginPath();
      c.ellipse(bx - 4 * f, by, 5 * f + 1, 4, -0.4, 0, TAU);
      c.ellipse(bx + 4 * f, by, 5 * f + 1, 4, 0.4, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const p = (t * 0.05 + k / 3) % 1;
      c.save();
      c.translate(MX + p * 1600 - 200, MY);
      c.rotate(0.5);
      const lg = c.createLinearGradient(-60, 0, 60, 0);
      lg.addColorStop(0, "rgba(255,255,220,0)");
      lg.addColorStop(0.5, "rgba(255,255,220,.05)");
      lg.addColorStop(1, "rgba(255,255,220,0)");
      c.fillStyle = lg;
      c.fillRect(-60, -200, 120, 1400);
      c.restore();
    }
    for (const d of lay.deco)
      if (d.type === "pond")
        glow(
          c,
          MX + d.x * TS + TS / 2 + Math.sin(t * 2 + d.v * 9) * 6,
          MY + d.y * TS + TS / 2 + 2,
          14,
          "#ffffff",
          0.35 + 0.2 * Math.sin(t * 3 + d.v * 7),
        );
  } else if (th === "lava") {
    // 熔岩：火星、熱氣與黑煙。
    c.globalCompositeOperation = "lighter";
    c.lineJoin = "round";
    c.lineCap = "round";
    c.beginPath();
    P.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.lineWidth = 62;
    c.strokeStyle = rgba("#ff4a10", 0.06 + 0.05 * Math.sin(t * 2));
    c.stroke();
    c.setLineDash([4, 40]);
    c.lineDashOffset = -t * 60;
    c.lineWidth = 50;
    c.strokeStyle = rgba("#ff9a3a", 0.12);
    c.stroke();
    c.setLineDash([]);
    for (const d of lay.deco) {
      const x = MX + d.x * TS + TS / 2,
        y = MY + d.y * TS + TS / 2;
      if (d.type === "lavapool" || d.type === "vent")
        glow(c, x, y + 2, 40 + 6 * Math.sin(t * 3 + d.v * 9), "#ff7a1a", 0.45);
      if (d.type === "vent" && (t + d.v * 7) % 5 < 0.5) {
        for (let k = 0; k < 2; k++)
          fxW.add({
            kind: "glow",
            x: x + rand(-6, 6),
            y,
            vx: rand(-30, 30),
            vy: rand(-320, -200),
            g: 300,
            life: 1,
            size: rand(8, 14),
            col: pick(["#ffcf3a", "#ff6a1a"]),
          });
      }
      if (d.type === "vent" && Math.random() < 0.04)
        fxW.add({
          kind: "glow",
          x: x + rand(-6, 6),
          y,
          vy: -50,
          vx: rand(-10, 10),
          life: 1.6,
          size: rand(10, 18),
          col: "#5a3a3a",
          add: false,
          a: 0.5,
          grow: 1.5,
        });
    }
  } else {
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const ag = c.createLinearGradient(0, MY, 0, MY + 260);
      const hc = rainbow(150 + k * 60 + Math.sin(t * 0.3 + k) * 40);
      ag.addColorStop(0, rgba(hc, 0.1));
      ag.addColorStop(1, rgba(hc, 0));
      c.fillStyle = ag;
      c.beginPath();
      c.moveTo(MX, MY);
      for (let x = 0; x <= COLS * TS; x += 40)
        c.lineTo(
          MX + x,
          MY + 140 + Math.sin(x / 140 + t * 0.7 + k * 2) * 60 + k * 30,
        );
      c.lineTo(MX + COLS * TS, MY);
      c.closePath();
      c.fill();
    }
    const sp = (t * 0.35) % 1;
    if (sp < 0.25) {
      const sx = MX + 200 + ((Math.floor(t * 0.35) * 377) % 900),
        sy = MY + 60 + ((Math.floor(t * 0.35) * 211) % 300);
      const q = sp / 0.25;
      c.strokeStyle = rgba("#ffffff", 1 - q);
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(sx + q * 400, sy + q * 160);
      c.lineTo(sx + q * 400 - 80, sy + q * 160 - 32);
      c.stroke();
      glow(c, sx + q * 400, sy + q * 160, 14, "#ffffff", 1 - q);
    }
    const L = P.len,
      gap = 130;
    for (let d = (t * 120) % gap; d < L; d += gap) {
      const q = posAt(d);
      glow(c, q.x, q.y, 22, "#7af0ff", 0.55);
      glow(c, q.x, q.y, 6, "#ffffff", 0.9);
    }
    for (const d of lay.deco)
      if (d.type === "crystal" || d.type === "obelisk")
        glow(
          c,
          MX + d.x * TS + TS / 2,
          MY + d.y * TS + TS / 2 - 8,
          46,
          d.v > 0.5 ? "#5ae8ff" : "#ff6af0",
          0.3 + 0.18 * Math.sin(t * 2 + d.v * 9),
        );
  }
  c.restore();
}
