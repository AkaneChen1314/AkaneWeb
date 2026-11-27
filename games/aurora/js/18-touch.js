/*
 * ============================================================
 *  18-touch.js ── 手機觸控操作（使用 ../touch-controls.js）
 * ------------------------------------------------------------
 *  只有手機／平板才會啟用。把觸控轉成遊戲原本讀取的鍵盤與滑鼠輸入：
 *    搖桿 → W A S D（推到外圈往前＝Shift 衝刺）
 *    右半邊滑動 → 滑鼠位移（轉動視角）
 *    按鈕 → 左鍵射擊、右鍵開鏡、Space、R、C、G、V、Q、H、滾輪換槍
 *  手機沒有「鎖定滑鼠」，所以改用不鎖定模式，暫停改按畫面上的「暫停」。
 * ============================================================
 */
(function () {
  "use strict";
  if (!window.AkaneTouch || !AkaneTouch.enabled) return;

  // 16-main.js 啟動時會依網址重設 noLock，這裡固定成 true，避免按「繼續」後又因為「沒鎖定滑鼠」被自動暫停
  Object.defineProperty(Input, "noLock", {
    get: () => true,
    set() {},
    configurable: true,
  });
  Input.lock = function () {};
  AkaneTouch.rotateHint();

  // 選單和 HUD 是照電腦螢幕設計的：小螢幕上整個等比例縮小（搭配 css/style.css 最後一段）
  const root = document.documentElement;
  let hudScale = 1;
  // 依螢幕大小算出選單（--menu-s）與 HUD（--hud-s）的縮小倍率，最多 1 倍（不放
  // 大）。
  function fit() {
    const w = innerWidth,
      h = innerHeight;
    hudScale = Math.min(1, w / 1000, h / 560);
    root.style.setProperty(
      "--menu-s",
      Math.min(1, w / 1180, h / 680).toFixed(3),
    );
    root.style.setProperty("--hud-s", hudScale.toFixed(3));
  }
  fit();
  addEventListener("resize", fit);
  // 名牌、傷害數字這些跟著 3D 位置移動的標示，座標也要換算成縮小後的 HUD 座標
  const project = HUD._project;
  HUD._project = function (x, y, z) {
    const p = project.call(this, x, y, z);
    if (p && hudScale !== 1) {
      p.x /= hudScale;
      p.y /= hudScale;
    }
    return p;
  };

  // Input.clear() 會換掉 keys 物件，所以每次都從 Input 重新取
  const hold = (code, on) => {
    if (on && !Input.keys[code]) Input.pressed[code] = true;
    Input.keys[code] = on;
  };
  // tap(按鍵)：模擬按一下；player() 取得目前的玩家角色。
  const tap = (code) => {
    Input.pressed[code] = true;
  };
  const player = () => Game.player;

  AkaneTouch.create({
    zIndex: 15,
    accent: "#58e6ff",
    hint: "左邊拖曳移動（推到底衝刺）・右邊滑動轉視角",
    active: () => Game.state === "playing",
    // 搖桿推超過 0.38 就當作按下 W、S、A、D；推到底而且往前，就同時按住 Shift（
    // 衝刺）。
    move(x, y, push) {
      hold("KeyW", y > 0.38);
      hold("KeyS", y < -0.38);
      hold("KeyD", x > 0.38);
      hold("KeyA", x < -0.38);
      hold("ShiftLeft", push > 1.3 && y > 0.6);
    },
    // 手指滑動的距離換算成滑鼠移動，用來轉視角（1.9 是靈敏度倍率）。
    look(dx, dy) {
      Input.mouse.dx += dx * 1.9;
      Input.mouse.dy += dy * 1.9;
    },
    buttons: [
      // 右下：射擊與常用動作（射擊鈕按住時滑動也能瞄準）
      {
        label: "射擊",
        big: true,
        aim: true,
        at: [30, 42],
        // 按下射擊鈕＝按住滑鼠左鍵；放開就鬆開。
        down() {
          Input.mouse.left = true;
          Input.mouse.leftHit = true;
        },
        up() {
          Input.mouse.left = false;
        },
      },
      { label: "跳", at: [41, 171], down: () => tap("Space") },
      { label: "換彈", at: [111, 143], down: () => tap("KeyR") },
      {
        label: "開鏡",
        at: [151, 76],
        down() {
          Input.mouse.right = !Input.mouse.right;
        },
        on: () => Input.mouse.right,
      },
      {
        label: "蹲",
        at: [146, 8],
        down: () => tap("KeyC"),
        on: () => player() && player().crouchToggle,
      },
      { label: "近戰", small: true, at: [210, 134], down: () => tap("KeyV") },
      {
        label: "換槍",
        small: true,
        at: [8, 246],
        down: () => {
          Input.mouse.wheel += 1;
        },
      },
      // 下方中間：技能、手榴彈（按住瞄準、放開投擲）、醫療包，取代原本 HUD 的技能列
      {
        label: "技能",
        corner: "bc",
        at: [-70, 10],
        // 技能按鈕下方的小字：冷卻中顯示剩幾秒，好了就顯示按鍵 Q。
        sub: () =>
          player() && player().skillCd > 0
            ? Math.ceil(player().skillCd) + " 秒"
            : "Q",
        down: () => tap("KeyQ"),
        wait: () => player() && player().skillCd > 0,
      },
      {
        label: "手榴",
        corner: "bc",
        at: [0, 10],
        aim: true,
        sub: () => "×" + (player() ? player().grenades : 0),
        down: () => hold("KeyG", true),
        up: () => hold("KeyG", false),
        wait: () => !player() || player().grenades <= 0,
      },
      {
        label: "醫療",
        corner: "bc",
        at: [70, 10],
        sub: () => "×" + (player() ? player().medkits : 0),
        down: () => tap("KeyH"),
        wait: () => !player() || player().medkits <= 0,
      },
      {
        label: "暫停",
        small: true,
        corner: "tl",
        at: [12, 12],
        down: () => Game.pause(),
      },
    ],
  });
})();
