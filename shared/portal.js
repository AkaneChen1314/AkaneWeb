/*
 * 檔案導讀：網站與遊戲的共用橋接：接收父頁的暫停通知，或在獨立開啟時加上返回導覽。
 * 訊息來源檢查用來確認通知確實來自父頁，修改外觀時應保留這段驗證。
 */
/*
 * 各款遊戲共用的返回與休息狀態。
 * 由遊戲館內開啟時使用外層導覽列；直接打開遊戲時顯示返回連結。
 */
(function () {
  "use strict";
  window.akanePortalPaused = false;
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (location.protocol !== "file:" && event.origin !== location.origin)
      return;
    if (event.data?.type !== "akane-portal-state") return;
    window.akanePortalPaused = event.data.paused === true;
    window.dispatchEvent(
      new CustomEvent("akane-portal-pause", {
        detail: {
          paused: window.akanePortalPaused,
        },
      }),
    );
  });
  if (window.parent !== window) return;
  document.addEventListener("DOMContentLoaded", () => {
    const nav = document.createElement("nav");
    nav.className = "standalone-portal-nav";
    nav.setAttribute("aria-label", "遊戲館導覽");
    const back = document.createElement("a");
    back.href = "../../index.html#games";
    back.textContent = "‹ 返回 Blue World 遊戲館";
    const version = document.createElement("span");
    version.textContent = "整合版 1.2";
    nav.append(back, version);
    document.body.prepend(nav);
    document.body.classList.add("standalone-portal-game");
  });
})();
