/*
 * ============================================================
 *  16-main.js ── 啟動與主迴圈
 * ------------------------------------------------------------
 *  這是最後載入的檔案，負責兩件事：
 *    1. boot()   依序初始化所有系統，完成後關掉載入畫面
 *    2. frame()  每一幀執行一次：依目前狀態更新遊戲 → 畫出畫面
 *
 *  整個遊戲的檔案載入順序（見 index.html）：
 *    00 資料表 → 01 工具 → 02 音效 → 03 建構器 → 04 槍枝模型 → 05 角色模型
 *    → 06 碰撞與尋路 → 07 地圖 → 08 特效 → 09 戰鬥規則 → 10 角色與玩家
 *    → 11 電腦 AI → 12 首領 → 13 模式 → 14 HUD → 15 選單 → 16 主迴圈
 * ============================================================
 */

const Main = {
  last: 0, // 上一幀的時間戳
  resultShown: false,

  /* ---------- 啟動 ---------- */
  // 啟動分成幾段，每段之間讓瀏覽器喘口氣：
  // 在 Blue World 遊戲館裡，遊戲和網站共用同一條執行緒，一口氣做完會讓整個網站卡住將近一秒。
  async boot() {
    const pause = (text) =>
      new Promise((resolve) => {
        if (text) document.getElementById("loading-text").textContent = text;
        setTimeout(resolve, 0);
      });
    try {
      const canvas = document.getElementById("game");
      // 網址加上 ?nolock 可以不鎖定滑鼠（自動化測試或瀏覽器不支援時使用）
      Input.noLock = location.search.includes("nolock");

      Mats.init();
      await pause("正在準備材質…");
      Scene3D.init(canvas);
      FX.init();
      Input.init(canvas);
      HUD.init();
      await pause("正在整備武器…");
      WeaponModels.makeIcons(); // 拍武器剪影圖示
      await pause("正在拍攝地圖預覽…");
      await Menu.buildPreviews(); // 拍地圖預覽圖（第一次開啟才需要，之後會記住）
      await pause("正在建構戰場…");
      Menu.init(); // 會載入預設地圖當作選單背景

      // 對戰中點擊畫面：如果滑鼠還沒鎖定就鎖定它
      canvas.addEventListener("click", () => {
        if (Game.state === "playing" && !Input.locked) Input.lock();
      });
      // 切到別的分頁或視窗時自動暫停
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && Game.state === "playing") Game.pause();
      });

      document.getElementById("loading").classList.add("hidden");
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    } catch (err) {
      this.fail(err);
    }
  },

  // 發生錯誤時把訊息顯示在載入畫面上，方便找出問題
  fail(err) {
    console.error(err);
    const loading = document.getElementById("loading");
    loading.classList.remove("hidden");
    loading.classList.add("error");
    document.getElementById("loading-text").textContent = "發生錯誤：" + (err && err.message ? err.message : err);
  },

  /* ---------- 主迴圈 ---------- */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    // dt = 距離上一幀經過幾秒。限制在 0.05 秒以內，避免卡頓後角色一口氣瞬移
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;

    try {
      this.step(dt);
    } catch (err) {
      this.fail(err);
      Game.state = "menu";
      return;
    }
    Input.endFrame();
  },

  step(dt) {
    const state = Game.state;

    if (state === "playing") {
      // 沒有鎖定滑鼠的模式下，用 P 或 Esc 暫停
      if (Input.noLock && (Input.hit("KeyP") || Input.hit("Escape"))) return Game.pause();
      Game.update(dt);
      Maps.tick(dt); // 地圖上的動畫（列車、光環、火焰…）
      FX.update(dt);
      HUD.update(dt);
      this.resultShown = false;
      Scene3D.render(dt, Game.player.alive);
    } else if (state === "ended") {
      // 分出勝負後先用慢動作演一小段，再跳出結算畫面
      if (Game.endT > 0) {
        Game.endT -= dt;
        const slow = dt * 0.3;
        Game.update(slow);
        Maps.tick(slow);
        FX.update(slow);
        HUD.update(slow);
        Scene3D.render(slow, Game.player.alive);
      } else {
        if (!this.resultShown) {
          this.resultShown = true;
          Menu.showResult(Game.summary());
        }
        Scene3D.render(0, false);
      }
    } else if (state === "paused" || state === "perk") {
      // 暫停／選強化：畫面凍結，只繼續繪製
      if (state === "perk" && Menu._perkKeys) {
        if (Input.hit("Digit1")) Menu._perkKeys(0);
        else if (Input.hit("Digit2")) Menu._perkKeys(1);
        else if (Input.hit("Digit3")) Menu._perkKeys(2);
      }
      Scene3D.render(0, Game.player && Game.player.alive);
    } else {
      // 選單：背景的 3D 展示
      Menu.updateShowcase(dt);
      Maps.tick(dt);
      FX.update(dt);
      Scene3D.render(dt, false);
    }
  },
};

window.addEventListener("load", () => {
  // 先讓瀏覽器把載入畫面畫出來，再開始初始化（建地圖需要一點時間）
  setTimeout(() => Main.boot(), 30);
});
