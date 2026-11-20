'use strict';
// ===== 網站橋接（Blue World 遊戲館）=====
// 由遊戲館開啟時，外層會用 shared/portal.js 送來 akane-portal-pause：
//   paused = true  → 對局中打開暫停視窗、放開拖曳中的塔、停住音樂與音效，並停止繪製
//   paused = false → 恢復聲音；對局要由玩家在暫停視窗按繼續
(function () {
  addEventListener('akane-portal-pause', e => {
    if (e.detail.paused) {
      // 視窗失焦時遊戲自己也會排一個暫停視窗（下一幀才打開），已經排了就不要再排第二個
      const queued = R && R.modals.some(m => m.type === 'pause');
      if (R && G.screen === 'game' && !activeModal() && !queued && R.alive) R.modals.unshift({ type: 'pause' });
      G.drag = null; G.mouse.down = false; UI.press = null;
      if (AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend();
      return;
    }
    AU.resume();
    lastT = performance.now();
  });

  // 遊戲館隱藏這個 iframe 時不必繪製畫面。
  const draw = window.render;
  window.render = function (dt) {
    if (window.akanePortalPaused) return;
    draw(dt);
  };

  setInterval(() => {
    document.body.classList.toggle('portal-in-battle', G.screen === 'game');
  }, 300);
})();
