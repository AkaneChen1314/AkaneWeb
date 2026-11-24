/*
 * 測試：在遊戲館關閉遊戲時會暫停、停止繪製，回來後由玩家手動繼續。
 */
import assert from "node:assert/strict";
import { createHarness } from "./test-harness.mjs";

// 進行中的戰鬥，並按著按鍵。
const h = createHarness();
h.run(
  `
    setupEvents();
    clock = {
      getDelta() {
        return 0.05;
      },
    };
    gameState = "playing";
    gameStart = 100;
    keys.KeyW = true;
    mouseDown = true;
    grenades.length = 0;
    let framesRendered = 0;
    renderFrame = () => {
      framesRendered++;
    };
    audioContext = {
      suspend() {
        return Promise.resolve();
      },
    };
  `,
);
// 外層通知暫停。
h.dispatchGlobal("akane-portal-pause", { detail: { paused: true } });
assert.equal(h.run("gameState"), "paused");
assert.equal(h.run("portalPaused"), true);
assert.equal(h.run("keys.KeyW"), false);
assert.equal(h.run("mouseDown"), false);
// 隱藏時不再繪製。
for (let i = 0; i < 10; i++) h.run("animate(2000);");
assert.equal(h.run("framesRendered"), 0, "hidden game must stop rendering");
h.run("resumeGame();");
assert.equal(h.run("gameState"), "paused", "hidden game must not resume");
// 回來後仍要等玩家按繼續。
h.dispatchGlobal("akane-portal-pause", { detail: { paused: false } });
assert.equal(
  h.run("gameState"),
  "paused",
  "returning must await a user gesture",
);
// 離開的時間不算在任務時間裡。
h.setNow(6000);
h.run("resumeGame();");
assert.equal(h.run("gameState"), "playing");
assert.equal(h.run("gameStart"), 5100, "portal pause time must be excluded");
console.log(
  "PASS portal return pauses combat, clears input, stops rendering and waits for manual resume",
);
