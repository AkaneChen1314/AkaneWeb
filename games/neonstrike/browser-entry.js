/*
 * 檔案導讀：瀏覽器打包入口：收集遊戲模組與音效，交給 build.mjs 產生 browser.js。
 * 閱讀玩法請從 main.js 開始；不要直接編輯發布用的 browser.js。
 */
import rifle0 from "./assets/audio/rifle-0.wav";
import rifle1 from "./assets/audio/rifle-1.wav";
import tail from "./assets/audio/rifle-tail.mp3";
import explosion from "./assets/audio/explosion-crunch.ogg";
import explosionLow from "./assets/audio/explosion-low.ogg";
import shell from "./assets/audio/shell.ogg";
import step0 from "./assets/audio/step-0.wav";
import step1 from "./assets/audio/step-1.wav";

// 打包成一般腳本並內嵌音效，直接從檔案開啟也能玩。
globalThis.neonAudioAssets = Object.freeze({
  rifle0,
  rifle1,
  tail,
  explosion,
  explosionLow,
  shell,
  step0,
  step1,
});
import("./main.js").catch((error) => {
  document.getElementById("loadError").hidden = false;
  console.error("Game initialization failed", error);
});
