// ============================================================
//  touch.js ── 手機觸控操作（使用 ../touch-controls.js）
// ------------------------------------------------------------
//  只有手機／平板才會啟用。把觸控轉成遊戲原本讀取的輸入：
//    搖桿 → W A S D（推到外圈＝Shift 推進）
//    右半邊滑動 → 滑鼠位移（轉動視角）
//    按鈕 → 主武器（左鍵）、副武器（右鍵）、噴射（Space）、換彈（R）
//    HUD 下方的技能格與小兵格可以直接點；每波結束的強化卡片也可以直接點
//  手機沒有「鎖定滑鼠」，暫停改按畫面左上的「暫停」。
// ============================================================
(function () {
  'use strict';
  if (!window.AkaneTouch || !AkaneTouch.enabled) return;

  window.lockPointer = function () {};
  AkaneTouch.rotateHint();

  // 介面依螢幕大小等比例縮小（搭配 css/style.css 最後一段）
  const root = document.documentElement;
  function fit() {
    const w = innerWidth, h = innerHeight;
    root.style.setProperty('--ui-s', Math.min(1, w / 1100, h / 620).toFixed(3));
    root.style.setProperty('--hud-s', Math.min(1, w / 1000, h / 560).toFixed(3));
  }
  fit();
  addEventListener('resize', fit);

  // pauseGame() 會換掉 keys 物件，所以每次都從 G.input 重新取
  const hold = (code, on) => {
    if (on && !G.input.keys[code]) G.input.pressed[code] = true;
    G.input.keys[code] = on;
  };
  const tap = code => {
    G.input.pressed[code] = true;
  };

  AkaneTouch.create({
    zIndex: 5,
    accent: '#ffb347',
    hint: '左邊拖曳移動（推到底推進）・右邊滑動轉視角・下方技能格可直接點',
    active: () => G.state === 'playing',
    move(x, y, push) {
      hold('KeyW', y > 0.38);
      hold('KeyS', y < -0.38);
      hold('KeyD', x > 0.38);
      hold('KeyA', x < -0.38);
      hold('ShiftLeft', push > 1.3);
    },
    look(dx, dy) {
      G.input.mx += dx * 1.8;
      G.input.my += dy * 1.8;
    },
    buttons: [
      {
        label: '主武器', big: true, aim: true, at: [36, 46],
        down() { G.input.lmb = true; },
        up() { G.input.lmb = false; },
      },
      {
        label: '副武器', aim: true, at: [150, 40],
        down() { G.input.rmb = true; },
        up() { G.input.rmb = false; },
      },
      { label: '噴射', sub: '長按飛', at: [58, 160], down: () => hold('Space', true), up: () => hold('Space', false) },
      { label: '換彈', small: true, at: [138, 122], down: () => tap('KeyR') },
      { label: '暫停', small: true, corner: 'tl', at: [14, 14], down: () => pauseGame() },
    ],
  });

  // 機庫：手指拖曳畫面也能旋轉機體（原本只接滑鼠，見 main.js 的 Hangar）
  let spinX = null;
  $('game').addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' && G.state === 'hangar') spinX = e.clientX;
  });
  addEventListener('pointermove', e => {
    if (spinX === null || G.state !== 'hangar') return;
    const d = (e.clientX - spinX) * 0.01;
    Hangar.rot += d;
    Hangar.spinV = clamp(d * 30, -3, 3);
    spinX = e.clientX;
  });
  addEventListener('pointerup', () => (spinX = null));
  addEventListener('pointercancel', () => (spinX = null));

  // 技能格（Q E F）與小兵格（1 2）：直接點 HUD 上的格子
  const SLOT_KEYS = { sk0: 'KeyQ', sk1: 'KeyE', sk2: 'KeyF', mn0: 'Digit1', mn1: 'Digit2' };
  $('slots').addEventListener('pointerdown', e => {
    const slot = e.target.closest('.slot');
    if (!slot || G.state !== 'playing' || !SLOT_KEYS[slot.id]) return;
    e.preventDefault();
    tap(SLOT_KEYS[slot.id]);
  });
  // 強化卡片：點第幾張就等於按 Z / X / C
  $('upg-cards').addEventListener('pointerdown', e => {
    const card = e.target.closest('.uc');
    if (!card || G.state !== 'playing') return;
    e.preventDefault();
    tap(['KeyZ', 'KeyX', 'KeyC'][[...card.parentNode.children].indexOf(card)]);
  });
})();
