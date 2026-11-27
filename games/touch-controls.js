/*
 * ============================================================
 *  games/touch-controls.js ── 手機觸控共用元件（Blue World 遊戲館）
 * ------------------------------------------------------------
 *  手機或平板（沒有滑鼠、主要用手指操作）開啟遊戲時才會啟用：
 *    左半邊：手指按下的地方就是搖桿中心，往外推就是移動；推到外圈＝衝刺
 *    右半邊：空白處滑動＝轉動視角
 *    按鈕：由各遊戲自己的轉接檔決定（射擊、跳躍、技能…），按鈕上滑動也能順便瞄準
 *  另外會在直向時提醒「把手機橫過來」（可以按「仍要直向遊玩」關掉）。
 *
 *  網址加上 ?touch=1 可以在電腦上強制開啟（測試用），?touch=0 強制關閉。
 *
 *  用法（各遊戲的轉接檔）：
 *    AkaneTouch.create({
 *      active: () => 是否顯示操作介面（通常是「對戰中」）,
 *      move: (x, y, push) => 搖桿方向（x 右正、y 上正，長度 0~1），push 是推出去的距離比例（最多 1.4）,
 *      look: (dx, dy) => 視角滑動的位移（像素）,
 *      buttons: [{
 *        label, sub（小字，可以是函式）, at: [水平距離, 垂直距離], corner（br／bl／tr／tl／bc）,
 *        big／small（大小）, aim（按住時滑動也能轉視角）,
 *        down／up（按下、放開）, on（亮起＝開啟中）, wait（變暗＝冷卻中或用完）, text（動態主文字）
 *      }],
 *    });
 * ============================================================
 */
(function () {
  "use strict";

  const query = new URLSearchParams(location.search).get("touch");
  const coarse = !!(
    window.matchMedia &&
    matchMedia("(hover: none) and (pointer: coarse)").matches
  );
  const enabled = query === "1" || (query !== "0" && coarse);
  if (enabled) document.documentElement.classList.add("akane-touch");

  // 建立一個元素並放進父層的小工具。
  function el(tag, cls, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  // 直向提示：手機直拿時畫面太窄，請玩家橫過來
  function rotateHint(text) {
    if (!enabled || document.querySelector(".akane-rotate")) return;
    const box = el("div", "akane-rotate", document.body);
    el("div", "akane-rotate-phone", box);
    el("p", "", box).textContent = text || "把手機橫過來玩，畫面更大、更好操作";
    const keep = el("button", "akane-rotate-keep", box);
    keep.type = "button";
    keep.textContent = "仍要直向遊玩";
    keep.addEventListener("click", () => box.remove());
  }

  // 建立整套觸控介面：左半邊的搖桿、右半邊的視角滑動區，以及各遊戲指定的按鈕。
  // 電腦（不是觸控裝置）上會直接回傳 null，什麼都不建立。回傳的 layer 是整個觸
  // 控層，releaseAll() 會放開所有按著的手指。
  function create(opt) {
    if (!enabled) return null;
    const layer = el("div", "akane-touch-layer", document.body);
    layer.hidden = true;
    if (opt.zIndex != null) layer.style.zIndex = opt.zIndex;
    if (opt.accent) layer.style.setProperty("--tc-accent", opt.accent);

    const base = el("div", "akane-stick", layer);
    const knob = el("div", "akane-stick-knob", base);
    const hint = el("div", "akane-touch-hint", layer);
    hint.textContent = opt.hint || "左邊拖曳移動・右邊滑動轉視角";

    // 建立按鈕：at = [離右邊, 離下面] 的距離（以 1 倍大小計算，會跟著螢幕大小縮放）
    const buttons = (opt.buttons || []).map((b) => {
      const node = el(
        "button",
        "akane-tbtn" + (b.big ? " is-big" : "") + (b.small ? " is-small" : ""),
        layer,
      );
      node.type = "button";
      node.tabIndex = -1;
      node.setAttribute("aria-label", b.aria || b.label);
      node.innerHTML = "<b></b>" + (b.sub ? "<small></small>" : "");
      node.firstChild.textContent = b.label;
      // corner：br 右下（預設）、bl 左下、tr 右上、tl 左上、bc 下方置中（at[0] 是離中線的距離）
      const corner = b.corner || "br";
      const [h, v] = b.at;
      if (corner[1] === "c") {
        node.classList.add("is-center");
        node.style.left = `calc(50% + ${h}px * var(--tc-scale))`;
      } else {
        node.style[corner[1] === "r" ? "right" : "left"] =
          `calc(${h}px * var(--tc-scale) + var(--tc-safe-${corner[1]}))`;
      }
      node.style[corner[0] === "b" ? "bottom" : "top"] =
        `calc(${v}px * var(--tc-scale) + var(--tc-safe-${corner[0]}))`;
      return Object.assign({ node, shownText: b.label, shownSub: null }, b);
    });

    // 依螢幕大小縮放：手機橫放（高度約 360~430）大約 0.9 倍，平板會放大一點
    let scale = 1;
    // 依螢幕大小調整按鈕與搖桿的縮放。
    function fit() {
      scale = Math.min(
        1.25,
        Math.max(0.7, Math.min(innerHeight / 420, innerWidth / 860)),
      );
      layer.style.setProperty("--tc-scale", scale.toFixed(3));
    }
    // 建立時先算一次，之後跟著視窗大小更新。
    fit();
    addEventListener("resize", fit);

    // 搖桿半徑，以及目前按著的每一根手指。
    const RADIUS = 58; // 搖桿半徑（1 倍大小）
    const touches = new Map(); // 每根手指（pointerId）正在做什麼
    let stick = null;

    // 搖桿跟著手指移動；拉太遠時底座也會被拖著走。
    function moveStick(x, y) {
      const r = RADIUS * scale;
      let dx = x - stick.ox,
        dy = y - stick.oy;
      let d = Math.hypot(dx, dy);
      // 手指拉太遠時，搖桿中心跟著手指走，不會「拉不動」
      const far = r * 1.4;
      if (d > far) {
        const k = (d - far) / d;
        stick.ox += dx * k;
        stick.oy += dy * k;
        base.style.left = stick.ox + "px";
        base.style.top = stick.oy + "px";
        dx = x - stick.ox;
        dy = y - stick.oy;
        d = far;
      }
      const len = Math.min(1, d / r);
      const ang = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(ang) * len * r}px, ${Math.sin(ang) * len * r}px)`;
      base.classList.toggle("is-push", d / r > 1.3);
      opt.move(Math.cos(ang) * len, -Math.sin(ang) * len, d / r);
    }

    // 手指放開：依這根手指原本在做什麼，歸位搖桿或放開按鈕。
    function release(id) {
      const t = touches.get(id);
      if (!t) return;
      touches.delete(id);
      if (t.kind === "stick") {
        stick = null;
        base.classList.remove("is-on", "is-push");
        base.style.left = base.style.top = "";
        knob.style.transform = "";
        opt.move(0, 0, 0);
      } else if (t.kind === "button") {
        t.b.node.classList.remove("is-down");
        if (t.b.up) t.b.up();
      }
    }
    function releaseAll() {
      for (const id of [...touches.keys()]) release(id);
    }

    // 手指按下：按到按鈕、左半邊當搖桿、右半邊當轉視角。
    layer.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault(); // 不要再產生滑鼠事件，也不要讓頁面捲動或縮放
        const node = e.target.closest(".akane-tbtn");
        if (node) {
          const b = buttons.find((x) => x.node === node);
          touches.set(e.pointerId, {
            kind: "button",
            b,
            x: e.clientX,
            y: e.clientY,
          });
          node.classList.add("is-down");
          if (b.down) b.down();
          return;
        }
        if (!stick && e.clientX < innerWidth * 0.45) {
          stick = { ox: e.clientX, oy: e.clientY };
          touches.set(e.pointerId, { kind: "stick" });
          base.style.left = e.clientX + "px";
          base.style.top = e.clientY + "px";
          base.classList.add("is-on");
          moveStick(e.clientX, e.clientY);
          return;
        }
        touches.set(e.pointerId, { kind: "look", x: e.clientX, y: e.clientY });
      },
      { passive: false },
    );

    // 手指移動：搖桿移動，或轉動視角。
    addEventListener(
      "pointermove",
      (e) => {
        const t = touches.get(e.pointerId);
        if (!t) return;
        if (t.kind === "stick") return moveStick(e.clientX, e.clientY);
        if (t.kind === "look" || t.b.aim) {
          opt.look(e.clientX - t.x, e.clientY - t.y);
          t.x = e.clientX;
          t.y = e.clientY;
        }
      },
      { passive: true },
    );
    // 手指離開、被系統取消或視窗失去焦點，都要放開。
    addEventListener("pointerup", (e) => release(e.pointerId));
    addEventListener("pointercancel", (e) => release(e.pointerId));
    addEventListener("blur", releaseAll);
    layer.addEventListener("contextmenu", (e) => e.preventDefault());

    // 每 0.1 秒同步一次：要不要顯示、按鈕的開關狀態與文字
    let shown = false,
      hintShown = false;
    // 定時檢查遊戲是否在進行中，決定要不要顯示觸控按鈕。
    setInterval(() => {
      const active = !!opt.active();
      if (active !== shown) {
        shown = active;
        layer.hidden = !active;
        document.documentElement.classList.toggle(
          "akane-touch-playing",
          active,
        );
        if (!active) releaseAll();
        if (active && !hintShown) {
          hintShown = true;
          hint.classList.add("is-on");
          setTimeout(() => hint.classList.remove("is-on"), 4500);
        }
      }
      if (!active) return;
      for (const b of buttons) {
        if (b.on) b.node.classList.toggle("is-on", !!b.on());
        if (b.wait) b.node.classList.toggle("is-wait", !!b.wait());
        if (b.text) {
          const text = b.text();
          if (text !== b.shownText) {
            b.shownText = text;
            b.node.firstChild.textContent = text;
          }
        }
        if (b.sub) {
          // sub 可以是固定文字，也可以是函式（例如剩餘數量、冷卻秒數）
          const sub = typeof b.sub === "function" ? b.sub() : b.sub;
          if (sub !== b.shownSub) {
            b.shownSub = sub;
            b.node.lastChild.textContent = sub;
          }
        }
      }
    }, 100);

    return { layer, releaseAll };
  }

  window.AkaneTouch = { enabled, create, rotateHint };
})();
