/*
 * 網站橋接（鋼鐵廢墟 ─ 機甲戰線）
 * 由 Blue World 遊戲館開啟時，外層會用 shared/portal.js 送來 akane-portal-pause：
 *   paused = true  → 戰鬥中就打開暫停選單、解除滑鼠鎖定、停住音樂與音效，並停止 3D 繪製
 *   paused = false → 只恢復聲音；戰鬥要由玩家按「繼續戰鬥」接續（和其他遊戲一致）
 * 也負責在戰鬥中加上 body.portal-in-battle，讓獨立開啟時的返回鈕不擋住 HUD。
 */
(function () {
  "use strict";
  let musicWasPlaying = false;

  // 暫停或恢復：由外層遊戲館通知。
  function setPortalPaused(paused) {
    if (paused) {
      if (G.state === "playing") pauseGame();
      if (document.pointerLockElement && document.exitPointerLock)
        document.exitPointerLock();
      G.input.keys = {};
      G.input.lmb = G.input.rmb = false;
      if (MUSIC.el && !MUSIC.el.paused) {
        musicWasPlaying = true;
        MUSIC.el.pause();
      }
      if (SND.ctx && SND.ctx.state === "running")
        SND.ctx.suspend().catch(() => {});
      return;
    }
    if (SND.ctx && SND.ctx.state === "suspended")
      SND.ctx.resume().catch(() => {});
    if (musicWasPlaying && MUSIC.el) {
      const played = MUSIC.el.play();
      if (played && played.catch) played.catch(() => {});
    }
    musicWasPlaying = false;
    // 避免回來的第一格把離開的時間當成一大步
    APP.last = performance.now();
  }

  // 外層送來的暫停通知。
  window.addEventListener("akane-portal-pause", (event) =>
    setPortalPaused(event.detail.paused),
  );

  // 遊戲館隱藏這個 iframe 時不必再繪製 3D 場景，省下顯示卡與電量。
  const drawScene = window.renderScene;
  // 遊戲館暫停時不畫 3D 畫面（節省電力），回來再繼續畫。
  window.renderScene = function (scene, camera) {
    if (window.akanePortalPaused) return;
    drawScene(scene, camera);
  };

  // 戰鬥中（含暫停與結算）隱藏獨立開啟時的返回鈕。
  setInterval(() => {
    document.body.classList.toggle(
      "portal-in-battle",
      G.state !== "hangar" && G.state !== "boot",
    );
  }, 300);
})();
