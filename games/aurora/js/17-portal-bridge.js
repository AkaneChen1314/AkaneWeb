/*
 * ============================================================
 *  17-portal-bridge.js ── 網站橋接（Blue World 遊戲館）
 * ------------------------------------------------------------
 *  由遊戲館開啟時，外層會用 shared/portal.js 送來 akane-portal-pause：
 *    paused = true  → 對戰中就打開暫停選單、解除滑鼠鎖定、停住聲音，並停止 3D 繪製
 *    paused = false → 只恢復選單的聲音；對戰要由玩家按「繼續」接續
 *  另外在對戰中加上 body.portal-in-battle，讓獨立開啟時的返回鈕不擋住 HUD。
 * ============================================================
 */
(function () {
  "use strict";

  // 遊戲館通知暫停時：對戰中就暫停，放開滑鼠鎖定與所有按鍵，聲音也暫停。
  window.addEventListener("akane-portal-pause", (event) => {
    if (event.detail.paused) {
      if (Game.state === "playing") Game.pause();
      Input.unlock();
      Input.clear();
      if (Sound.ctx && Sound.ctx.state === "running") Sound.ctx.suspend();
      return;
    }
    // 暫停中的對戰維持靜音，等玩家按「繼續」時由 Game.resume() 恢復
    if (Sound.ctx && Sound.ctx.state === "suspended" && Game.state !== "paused")
      Sound.ctx.resume();
    Main.last = performance.now();
  });

  // 遊戲館隱藏這個 iframe 時不必再繪製 3D 場景（第一次開啟正在拍地圖預覽時除外）。
  const draw = Scene3D.render.bind(Scene3D);
  Scene3D.render = function (dt, alive) {
    if (window.akanePortalPaused && !Menu.capturing) return;
    draw(dt, alive);
  };

  setInterval(() => {
    document.body.classList.toggle(
      "portal-in-battle",
      typeof Game !== "undefined" && Game.state !== "menu",
    );
  }, 300);
})();
