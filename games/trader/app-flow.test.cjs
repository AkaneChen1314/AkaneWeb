/*
 * 用模擬的 DOM 測試介面流程；不代表真正的瀏覽器畫面檢查。
 */
const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const root = require("path").resolve(__dirname);
// 建立一個假的瀏覽器環境並執行遊戲；storage 可以帶入存檔。
function env(storage = new Map(), width = 1440) {
  let doc;
  // 假的網頁元素。
  class El {
    // 建立一個假元素：記下標籤名稱、屬性、子元素與父元素，夠遊戲程式使用就好，
    // 不會真的顯示在畫面上。
    constructor(tag = "div", attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.attrs = { ...attrs };
      this.children = [];
      this.parentElement = null;
      this.listeners = [];
      this.style = {};
      this.hidden = "hidden" in attrs;
      this.disabled = "disabled" in attrs;
      this.open = false;
      this.value = attrs.value || "";
      this.dataset = {};
      for (const [k, v] of Object.entries(attrs))
        if (k.startsWith("data-"))
          this.dataset[
            k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          ] = v;
      this._text = "";
    }
    get id() {
      return this.attrs.id || "";
    }
    set id(v) {
      this.attrs.id = v;
    }
    get className() {
      return this.attrs.class || "";
    }
    set className(v) {
      this.attrs.class = v;
    }
    // classList：用 className 這串文字模擬 add、remove、toggle（和瀏覽器的用法
    // 一樣）。
    get classList() {
      let e = this;
      return {
        add(...a) {
          e.className = [
            ...new Set(e.className.split(/\s+/).filter(Boolean).concat(a)),
          ].join(" ");
        },
        remove(...a) {
          e.className = e.className
            .split(/\s+/)
            .filter((x) => !a.includes(x))
            .join(" ");
        },
        toggle(n, on) {
          if (on === undefined) on = !e.className.split(/\s+/).includes(n);
          this[on ? "add" : "remove"](n);
        },
        contains(n) {
          return e.className.split(/\s+/).includes(n);
        },
      };
    }
    get textContent() {
      return this._text + this.children.map((c) => c.textContent).join("");
    }
    // 設定 textContent 時只留下純文字。
    set textContent(t) {
      this._text = String(t);
      this.children = [];
    }
    // 設定 innerHTML 時，把 HTML 文字解析成假的子元素，測試才能找到裡面的按鈕。
    set innerHTML(html) {
      this.children = [];
      this._text = "";
      parse(String(html), this);
    }
    get innerHTML() {
      return this._html || "";
    }
    // append 把子元素加到最後面，remove 把自己從父元素拿掉。
    append(child) {
      child.parentElement = this;
      this.children.push(child);
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (x) => x !== this,
        );
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    }
    getAttribute(k) {
      return this.attrs[k];
    }
    addEventListener(type, fn, options) {
      this.listeners.push({ type, fn, once: options?.once });
    }
    // 是否符合選擇器（id、class、屬性或標籤）。
    matches(sel) {
      if (sel.startsWith("#")) return this.id === sel.slice(1);
      if (sel.startsWith("."))
        return this.className.split(/\s+/).includes(sel.slice(1));
      const m = sel.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (m)
        return (
          m[1] in this.attrs &&
          (m[2] === undefined || this.attrs[m[1]] === m[2])
        );
      return this.tagName.toLowerCase() === sel.toLowerCase();
    }
    // 往下找所有符合的元素。
    querySelectorAll(sel) {
      let out = [];
      for (const c of this.children) {
        if (c.matches(sel)) out.push(c);
        out = out.concat(c.querySelectorAll(sel));
      }
      return out;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    // 往上找第一個符合的元素。
    closest(sel) {
      for (let e = this; e; e = e.parentElement) if (e.matches(sel)) return e;
      return null;
    }
    // contains：往上找父元素，判斷某個元素是不是在自己裡面。
    contains(el) {
      for (let e = el; e; e = e.parentElement) if (e === this) return true;
      return false;
    }
    get clientWidth() {
      return 500;
    }
    // 假的位置大小；隱藏的元素高度是 0。
    getBoundingClientRect() {
      return {
        left: 50,
        top: 350,
        width: 300,
        height:
          this.hidden || (width <= 760 && this.closest(".lenders-panel"))
            ? 0
            : 45,
        bottom: 395,
        right: 350,
      };
    }
    scrollIntoView() {}
    focus() {
      doc.activeElement = this;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    click() {
      click(this);
    }
  }
  // 把 HTML 文字轉成假元素。
  function parse(html, parent) {
    const stack = [parent],
      voids = new Set(["meta", "link", "input", "br", "img", "hr"]);
    let re = /<\/?([\w-]+)\b([^>]*?)\/?\s*>|([^<]+)/g,
      m;
    while ((m = re.exec(html))) {
      if (m[3]) {
        stack.at(-1)._text += m[3];
        continue;
      }
      if (m[0].startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const tag = m[1].toLowerCase(),
        attrs = {};
      let ar = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g,
        a;
      while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? "";
      const child = new El(tag, attrs);
      stack.at(-1).append(child);
      if (!voids.has(tag) && !m[0].endsWith("/>")) stack.push(child);
    }
  }
  doc = new El("document");
  // 載入實際的 index.html。
  parse(fs.readFileSync(root + "/index.html", "utf8"), doc);
  doc.body = doc.querySelector("body");
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.querySelector("#" + id);
  doc.createElement = (tag) => new El(tag);
  const tools = [];
  doc.modelContext = { registerTool: (t) => tools.push(t) };
  const docListeners = [];
  doc.addEventListener = (type, fn, options) =>
    docListeners.push({ type, fn, capture: options === true });
  // 觸發一個事件。
  function fire(el, type, extra = {}) {
    if (typeof el === "string") el = doc.querySelector(el);
    assert(el, "Event target missing");
    const e = { target: el, preventDefault() {}, ...extra };
    for (const l of el.listeners.filter((x) => x.type === type)) l.fn(e);
  }
  // 模擬點擊；停用的按鈕不會有反應。
  function click(el) {
    if (typeof el === "string") el = doc.querySelector(el);
    assert(el, "Click target missing");
    if (el.disabled) return;
    // 模擬一次點擊事件：記錄有沒有被 preventDefault（取消預設動作）或停止傳遞。
    const e = {
      target: el,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
    };
    for (const l of docListeners.filter(
      (x) => x.type === "click" && x.capture,
    )) {
      l.fn(e);
      if (e.stopped) return;
    }
    for (const l of [...el.listeners].filter((x) => x.type === "click")) {
      l.fn(e);
      if (l.once) el.listeners = el.listeners.filter((x) => x !== l);
      if (e.stopped) return;
    }
    for (const l of docListeners.filter(
      (x) => x.type === "click" && !x.capture,
    )) {
      l.fn(e);
      if (e.stopped) return;
    }
  }
  // 排程的工作；測試可以自己決定何時執行。
  const tasks = new Map();
  let taskId = 0;
  // 假的 window：固定的視窗大小，matchMedia 一律回答「沒有符合」。
  const window = {
    document: doc,
    innerWidth: width,
    innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    scrollTo() {},
    addEventListener() {},
  };
  // 沙盒環境裡可以使用的東西。
  const sandbox = {
    window,
    document: doc,
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    // 假的 setTimeout：不真的等待，先把要做的事記下來，測試再一次執行。
    setTimeout: (fn, ms) => {
      tasks.set(++taskId, { fn, ms });
      return taskId;
    },
    clearTimeout: (id) => tasks.delete(id),
    console,
    Blob,
    URL,
    AbortController,
    Date,
    Math,
    btoa,
    atob,
  };
  // 依序執行壓縮程式、規則與介面。
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(root + "/vendor/pako.js", "utf8"), sandbox);
  window.pako = sandbox.pako || window.pako;
  vm.runInContext(fs.readFileSync(root + "/engine.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(root + "/app.js", "utf8"), sandbox);
  // 提供給測試使用的工具。
  return {
    doc,
    click,
    fire,
    storage,
    tasks,
    tools,
    state: () =>
      tools.find((t) => t.name === "read_simulated_account").execute({}),
    engine: window.BillionEngine,
  };
}
// 輸入姓名並開始教學。
function startLesson(a) {
  const input = a.doc.getElementById("character-name");
  if (input) {
    input.value = "測試新手";
    a.click('[data-action="choose-name"]');
  }
  a.click('[data-action="start-lesson"]');
}
// 勾選同意並簽約。
function signContract(a) {
  a.click('[data-contract-ack="id"]');
  a.click('[data-contract-ack="contacts"]');
  a.click('[data-action="sign-contract"]');
}
// 依序完成教學。
function finishTutorial(a) {
  a.click('[data-asset="sky"]');
  a.click('[data-budget="1"]');
  a.click('[data-direction="long"]');
  a.click("#trade-button");
  a.click("#next-button");
  a.click("[data-close]");
  a.click("#health-help");
  a.click("#work-button");
  a.click('[data-action="lesson-next"]');
  a.click("#casino-button");
  a.click('[data-action="lesson-next"]');
  a.click(
    a.doc.getElementById("loan-button").getBoundingClientRect().height === 0
      ? "#tutorial-loan-shortcut"
      : "#loan-button",
  );
  a.click('[data-action="finish-lesson"]');
}
// 新玩家：要依順序完成教學，練習不影響正式資金。
let a = env();
assert(a.doc.getElementById("modal").open);
assert(!a.storage.has("billion-to-zero-v2"));
startLesson(a);
assert(a.state().practice);
a.click("#next-button");
assert.equal(a.state().day, 1, "Tutorial allowed an out-of-order click");
finishTutorial(a);
assert(!a.state().practice);
assert.equal(a.state().day, 1);
assert.equal(a.state().cash, 1e10, "Practice touched formal cash");
assert.equal(a.state().health, 100);
assert(a.storage.has("billion-to-zero-v2"));
// 買進後前進一天。
a.click("#trade-button");
assert.equal(a.doc.getElementById("position-count").textContent, "1");
a.click("#next-button");
assert.equal(a.state().day, 2);
// 重新載入後狀態不變。
const persisted = a.storage.get("billion-to-zero-v2"),
  b = env(a.storage);
assert.equal(b.state().day, 2);
assert.equal(
  b.storage.get("billion-to-zero-v2"),
  persisted,
  "Reload changed formal state",
);
b.click("#loan-button");
b.click('[data-loan-type="online"]');
// 三種借款都能使用。
for (const type of ["bank", "online", "shark"]) {
  b.click(`[data-loan-type="${type}"]`);
  b.doc.getElementById("loan-amount").value = "100000";
  b.click('[data-action="borrow"]');
  assert(
    b.doc.getElementById("loan-amount"),
    "Over-limit amount left input screen",
  );
  assert(
    !b.doc.querySelector('[data-action="sign-contract"]'),
    "Over-limit amount opened contract",
  );
  assert(b.doc.getElementById("loan-error").textContent.includes("超過"));
  assert.equal(b.state().debt, 0);
  for (const value of ["", "-1", "0.00001", "Infinity"]) {
    b.doc.getElementById("loan-amount").value = value;
    b.click('[data-action="borrow"]');
    assert(b.doc.getElementById("loan-amount"));
    assert.equal(b.state().debt, 0);
  }
}
// 網路借款要簽約。
b.click('[data-loan-type="online"]');
b.click('[data-action="borrow"]');
signContract(b);
assert.equal(b.state().debt, 1e8);
assert.equal(
  JSON.parse(b.storage.get("billion-to-zero-v2")).loans[0].type,
  "online",
);
// 再看一次教學，不會影響正式進度。
const snapshot = b.storage.get("billion-to-zero-v2");
b.click("#help-button");
startLesson(b);
finishTutorial(b);
assert.equal(
  b.storage.get("billion-to-zero-v2"),
  snapshot,
  "Tutorial replay mutated current life",
);
// 故障畫面：重新連線後以實際價格恢復，只能按一次。
const E = b.engine,
  g = E.create(44);
E.open(g, { asset: "sky", amount: 1e8, product: "spot" });
g.pending = { type: "glitch", shownProfit: 1e7 };
E.setName(g, "故障測試員");
// 準備一份已經玩到一半的存檔與偏好設定（已看完教學、關閉特效與音效）。
const map = new Map([
  ["billion-to-zero-v2", JSON.stringify(g)],
  [
    "billion-to-zero-preferences-v2",
    JSON.stringify({ tutorialDone: true, effects: false, sound: false }),
  ],
]);
const c = env(map);
assert(!c.doc.getElementById("glitch-screen").hidden);
const before = c.state().equity;
c.click("#reconnect-button");
assert(c.state().equity < before);
assert.equal(JSON.parse(map.get("billion-to-zero-v2")).glitches, 1);
c.click("#reconnect-button");
assert.equal(
  JSON.parse(map.get("billion-to-zero-v2")).glitches,
  1,
  "404 settled twice",
);
// 賣掉核心器官會直接結束。
c.click("#organ-button");
c.click('[data-organ="core"]');
c.click('[data-confirm-organ="core"]');
assert(c.state().ended);
assert.equal(c.state().health, 0);
assert(c.doc.getElementById("modal").open);
// 手機寬度的教學流程。
const mobile = env(new Map(), 390);
startLesson(mobile);
mobile.click('[data-asset="sky"]');
mobile.click('[data-budget="1"]');
mobile.click('[data-direction="long"]');
mobile.click("#trade-button");
mobile.click("#next-button");
mobile.click("[data-close]");
mobile.click("#health-help");
mobile.click("#work-button");
mobile.click('[data-action="lesson-next"]');
mobile.click("#casino-button");
mobile.click('[data-action="lesson-next"]');
mobile.click("#tutorial-loan-shortcut");
mobile.click('[data-action="finish-lesson"]');
assert(!mobile.state().practice);
mobile.click("#tutorial-loan-shortcut");
assert(
  mobile.doc.querySelector('[data-loan-type="shark"]'),
  "Mobile borrowing unavailable",
);
console.log(
  "PASS: app/controllers initialize, ordered optional finger tutorial, practice isolation, buy/advance/sell flow, persisted reload, online-loan selection, tutorial replay isolation, restored fake 404, one-time reconnection and organ death UI.",
);

// 3.0 介面整合，包含模擬的觸控與指標操作（不檢查外觀）。
const live = env(new Map(), 390);
startLesson(live);
finishTutorial(live);
live.click("#trade-button");
// 時鐘每走一步，價格與畫面都會更新。
let previous = JSON.parse(live.storage.get("billion-to-zero-v2"));
const loop = [...live.tasks].find(([, x]) => x.fn.name === "liveLoop");
assert(loop);
live.tasks.delete(loop[0]);
loop[1].fn();
let current = JSON.parse(live.storage.get("billion-to-zero-v2"));
assert.equal(current.minute, previous.minute + 5);
assert.notEqual(current.markets.sky.price, previous.markets.sky.price);
// 圖表可以用觸控與鍵盤查看。
live.fire("#chart", "pointermove", { clientX: 180 });
assert(live.doc.querySelector(".chart-tooltip").textContent.includes("00:"));
live.fire("#chart", "keydown", { key: "ArrowLeft" });
assert(live.doc.querySelector(".chart-tooltip"));
// 暫停後時鐘不再前進。
live.click("#market-pause");
previous = live.storage.get("billion-to-zero-v2");
const pausedLoop = [...live.tasks].find(([, x]) => x.fn.name === "liveLoop");
pausedLoop[1].fn();
assert.equal(
  live.storage.get("billion-to-zero-v2"),
  previous,
  "Pause still advanced the market",
);
live.click("#market-pause");
// 工作可以中途離開，再接著做完。
live.click("#work-button");
live.click('[data-job="cafe"]');
current = JSON.parse(live.storage.get("billion-to-zero-v2"));
assert(current.job);
const cash = current.cash;
live.click('[data-action="pause-work"]');
assert(!live.doc.getElementById("modal").open);
assert(live.doc.getElementById("next-button").disabled);
assert(!live.doc.getElementById("work-button").disabled);
assert(live.doc.getElementById("tutorial-loan-shortcut").disabled);
let resumed = env(live.storage, 390);
assert(resumed.doc.getElementById("modal").open, "Reload did not resume work");
assert(resumed.doc.querySelector("[data-job-answer]"));
while (JSON.parse(resumed.storage.get("billion-to-zero-v2")).job) {
  const j = JSON.parse(resumed.storage.get("billion-to-zero-v2")).job;
  resumed.click('[data-job-answer="' + j.task.answer + '"]');
}
current = JSON.parse(resumed.storage.get("billion-to-zero-v2"));
assert.equal(current.cash, cash + 3600000);
assert.equal(current.lastWorkDay, current.day);
// 賣掉一邊眼角膜後的視力輔助。
resumed.click("#organ-button");
resumed.click('[data-organ="cornea_left"]');
resumed.click('[data-confirm-organ="cornea_left"]');
assert(resumed.doc.body.classList.contains("vision-one"));
assert(!resumed.doc.getElementById("vision-assist").hidden);
resumed.click("#vision-assist");
assert(!resumed.doc.body.classList.contains("vision-one"));
resumed.click("#settings-button");
assert(resumed.doc.querySelector('[data-setting="horror"]'));
resumed.click('[data-action="dismiss"]');
// 低血量與高負債時的氣氛設定，可以關閉。
const terror = E.create(3);
terror.health = 12;
terror.debt = 2e10;
E.setName(terror, "門外測試員");
// 準備一份「恐怖模式」的存檔，測試紅屏等特效。
const terrorMap = new Map([
  ["billion-to-zero-v2", JSON.stringify(terror)],
  [
    "billion-to-zero-preferences-v2",
    JSON.stringify({ tutorialDone: true, horror: true }),
  ],
]);
const dark = env(terrorMap, 320);
assert(dark.doc.body.classList.contains("dread-3"));
assert(!dark.doc.getElementById("dread-banner").hidden);
dark.click("#settings-button");
dark.click('[data-setting="horror"]');
assert(!dark.doc.body.classList.contains("dread-3"));
dark.click('[data-action="dismiss"]');
// 查看過去的價格。
const archiveState = E.create(8);
E.nextDay(archiveState);
E.setName(archiveState, "歷史測試員");
const archiveMap = new Map([
  ["billion-to-zero-v2", JSON.stringify(archiveState)],
  ["billion-to-zero-preferences-v2", JSON.stringify({ tutorialDone: true })],
]);
const timeline = env(archiveMap);
timeline.click("#chart-prev");
assert.equal(
  timeline.doc.getElementById("chart-day-label").textContent,
  "第 1 天",
);
timeline.click('[data-period="all"]');
assert(
  timeline.doc
    .getElementById("chart-story")
    .textContent.includes("第 1 至 2 天"),
);
timeline.click("#chart-live");
assert.equal(
  timeline.doc.getElementById("chart-day-label").textContent,
  "第 2 天",
);
console.log(
  "PASS: live timer/P&L, pointer and keyboard timestamp tooltip, pause, mobile work selection/reload/completion/locks, cornea blur and aid, scary atmosphere/settings, and historical chart navigation.",
);
// v4 介面：姓名與虛構同意、催收對話保留、所有賭桌。
// 先取名字，再進入教學。
const named = env(new Map(), 320);
assert(named.doc.getElementById("character-name"));
named.doc.getElementById("character-name").value = "星雨";
named.click('[data-action="choose-name"]');
assert.equal(named.state().playerName, "星雨");
assert(named.doc.getElementById("hero-title").textContent.includes("星雨"));
assert(named.doc.querySelector('[data-action="start-lesson"]'));
named.click('[data-action="start-lesson"]');
finishTutorial(named);
assert.equal(named.state().playerName, "星雨");
// 簽約前要勾選兩項同意。
named.click("#tutorial-loan-shortcut");
named.click('[data-loan-type="online"]');
named.click('[data-action="borrow"]');
assert.equal(named.state().debt, 0, "Loan paid before simulated agreement");
const signing = named.doc.querySelector('[data-action="sign-contract"]');
assert(signing.disabled);
named.click('[data-contract-ack="id"]');
assert(named.doc.querySelector('[data-action="sign-contract"]').disabled);
named.click('[data-contract-ack="contacts"]');
assert(!named.doc.querySelector('[data-action="sign-contract"]').disabled);
named.click('[data-action="sign-contract"]');
assert.equal(named.state().debt, 1e8);
const namedState = JSON.parse(named.storage.get("billion-to-zero-v2"));
assert.equal(namedState.contracts[0].signedName, "星雨");
assert(namedState.contracts[0].fictionId.startsWith("SIM-"));
// 逾期的催收對話，重新載入後接得上。
const dueState = E.create(98);
E.setName(dueState, "夜星");
E.borrow(dueState, 5e8, "online", false, {
  id: dueState.fictionId,
  signedName: dueState.playerName,
  contacts: true,
});
dueState.cash = 2e8;
dueState.loans[0].stage = 1;
dueState.loans[0].due = 2;
E.nextDay(dueState);
const debtMap = new Map([
  ["billion-to-zero-v2", JSON.stringify(E.pack(dueState))],
  ["billion-to-zero-preferences-v2", JSON.stringify({ tutorialDone: true })],
]);
let dialogue = env(debtMap, 390);
assert(
  !dialogue.doc.querySelector('[data-choice="1"]'),
  "Collector decision appears before dialogue",
);
assert(
  dialogue.doc.querySelector(".chat-current").textContent.includes("夜星"),
);
dialogue.click('[data-debt-reply="question"]');
assert.equal(dialogue.state().pending.turn, 1);
dialogue = env(debtMap, 390);
assert.equal(
  dialogue.state().pending.turn,
  1,
  "Reload restarted collector interaction",
);
dialogue.click('[data-debt-reply="promise"]');
dialogue.click('[data-debt-reply="answer"]');
assert(dialogue.doc.querySelector('[data-choice="4"]'));
dialogue.click('[data-choice="1"]');
assert.equal(dialogue.state().reputation, 72);
assert(dialogue.doc.querySelector(".aftermath-grid"));
// 手機裡的朋友支持。
dialogue.click('[data-action="open-phone"]');
assert(
  dialogue.doc.querySelector(".social-feed").textContent.includes("不實抹黑"),
);
dialogue.click('[data-action="friend-support"]');
assert.equal(dialogue.state().reputation, 78);
dialogue.click('[data-action="dismiss"]');
// 骰子：中途離開後可以接著完成。
const gameState = E.create(83);
E.setName(gameState, "骰子玩家");
const casinoMap = new Map([
  ["billion-to-zero-v2", JSON.stringify(E.pack(gameState))],
  ["billion-to-zero-preferences-v2", JSON.stringify({ tutorialDone: true })],
]);
let gambler = env(casinoMap, 390);
gambler.click("#casino-button");
const initial = gambler.state().cash;
gambler.click('[data-action="start-gamble"]');
assert.equal(gambler.state().cash, initial - 5e6);
assert(gambler.doc.getElementById("next-button").disabled);
gambler.click('[data-gamble-action="big"]');
gambler.click('[data-action="pause-gamble"]');
gambler = env(casinoMap, 390);
assert(
  gambler.doc.querySelector('[data-gamble-action="roll"]'),
  "Reload did not restore dice wager",
);
gambler.click('[data-gamble-action="roll"]');
assert(gambler.doc.querySelector(".gamble-receipt"));
const settled = gambler.state().cash;
gambler.click('[data-action="casino-again"]');
assert.equal(gambler.state().cash, settled, "Browsing another gamble auto-bet");
// 撲克牌與踩地雷。
gambler.click('[data-casino-mode="cards"]');
gambler.click('[data-action="start-gamble"]');
assert(gambler.doc.querySelector(".card-hand"));
gambler.click('[data-gamble-action="stand"]');
assert(gambler.doc.querySelector(".gamble-receipt"));
gambler.click('[data-action="casino-again"]');
gambler.click('[data-casino-mode="mines"]');
gambler.click('[data-action="start-gamble"]');
assert.equal(gambler.doc.querySelectorAll("[data-mine-index]").length, 9);
gambler.click('[data-gamble-action="forfeit"]');
assert(gambler.doc.querySelector(".result-board"));
gambler.click('[data-action="dismiss"]');
assert.equal(
  JSON.parse(casinoMap.get("billion-to-zero-v2")).gambleStats.rounds,
  3,
);
// 搜尋與篩選商品。
gambler.doc.getElementById("asset-search").value = "機械";
gambler.fire("#asset-search", "input");
assert.equal(gambler.doc.querySelectorAll("[data-asset]").length, 1);
assert(gambler.doc.querySelector('[data-asset="robot"]'));
gambler.doc.getElementById("asset-search").value = "";
gambler.fire("#asset-search", "input");
gambler.click('[data-filter="risk"]');
assert.equal(gambler.doc.querySelectorAll("[data-asset]").length, 12);
console.log(
  "PASS: named onboarding/tutorial, simulated ID/contract gates, personal collector dialogue/reload/choices/consequences/phone support, dice/card/mine boards and wager reload/locks/no duplicate payouts, and 24-asset search/filter.",
);

// 5.0 回歸測試：略過、查看身體、行動地點可操作、整天的計時。
// 略過教學，之後仍可重看並再次略過。
const skipping = env();
skipping.doc.getElementById("character-name").value = "跳過玩家";
skipping.click('[data-action="choose-name"]');
skipping.click('[data-action="skip-lesson"]');
assert.equal(skipping.state().playerName, "跳過玩家");
assert.equal(skipping.state().cash, 1e10);
assert(!skipping.state().practice);
assert(!skipping.doc.getElementById("modal").open);
assert(skipping.doc.getElementById("phone-button").closest(".life-actions"));
assert(skipping.doc.getElementById("casino-button").closest(".life-actions"));
skipping.click("#help-button");
skipping.click('[data-action="start-lesson"]');
skipping.click('[data-asset="sky"]');
skipping.click('[data-budget="1"]');
skipping.click('[data-direction="long"]');
skipping.click("#trade-button");
skipping.click("#tutorial-skip");
assert(!skipping.state().practice);
assert.equal(skipping.state().cash, 1e10);
assert.equal(skipping.state().day, 1);
assert.equal(skipping.state().playerName, "跳過玩家");
// 查看身體部位並賣出。
skipping.click("#avatar");
assert(skipping.doc.querySelector('[data-body-part="lung"]'));
assert(skipping.doc.querySelector('[data-body-part="lung_right"]'));
assert.equal(skipping.doc.querySelectorAll(".body-item").length, 18);
skipping.click('[data-body-part="lung"]');
assert(
  skipping.doc.getElementById("modal-content").textContent.includes("左肺"),
);
skipping.click('[data-organ="lung"]');
skipping.click('[data-confirm-organ="lung"]');
skipping.click("#body-button");
skipping.click('[data-body-part="lung"]');
assert(
  skipping.doc.getElementById("modal-content").textContent.includes("已賣出"),
);
assert(
  skipping.doc
    .getElementById("modal-content")
    .textContent.includes("第 1 天 00:00"),
);
assert(
  !skipping.doc.querySelector('[data-organ="lung"]'),
  "Lost part can still be sold",
);
skipping.click('[data-action="back-body"]');
skipping.click('[data-body-zone="chest"]');
assert.equal(skipping.doc.querySelectorAll(".body-item").length, 3);
skipping.click('[data-action="dismiss"]');
// 讓時鐘走一步。
function clockTick(app) {
  const t = [...app.tasks].find(([, x]) => x.fn.name === "liveLoop");
  assert(t);
  app.tasks.delete(t[0]);
  t[1].fn();
}
// 一整天的時鐘；開啟視窗時會暫停。
const fullDay = E.create(237);
E.setName(fullDay, "全天玩家");
fullDay.minute = 810;
const fullEnv = env(
  new Map([
    ["billion-to-zero-v2", JSON.stringify(fullDay)],
    ["billion-to-zero-preferences-v2", JSON.stringify({ tutorialDone: true })],
  ]),
);
clockTick(fullEnv);
assert.equal(JSON.parse(fullEnv.storage.get("billion-to-zero-v2")).minute, 815);
assert(
  !fullEnv.doc.getElementById("market-clock").textContent.includes("已收盤"),
);
fullEnv.click("#phone-button");
const pausedMinute = JSON.parse(
  fullEnv.storage.get("billion-to-zero-v2"),
).minute;
clockTick(fullEnv);
assert.equal(
  JSON.parse(fullEnv.storage.get("billion-to-zero-v2")).minute,
  pausedMinute,
);
assert(
  fullEnv.doc
    .getElementById("market-clock")
    .textContent.includes("閱讀視窗暫停"),
);
fullEnv.click('[data-action="dismiss"]');
clockTick(fullEnv);
assert.equal(
  JSON.parse(fullEnv.storage.get("billion-to-zero-v2")).minute,
  pausedMinute + 5,
);
const midnightState = E.create(238);
E.setName(midnightState, "午夜玩家");
midnightState.minute = 1435;
const midnight = env(
  new Map([
    ["billion-to-zero-v2", JSON.stringify(midnightState)],
    ["billion-to-zero-preferences-v2", JSON.stringify({ tutorialDone: true })],
  ]),
);
clockTick(midnight);
assert.equal(midnight.state().day, 2);
assert.equal(JSON.parse(midnight.storage.get("billion-to-zero-v2")).minute, 0);
console.log(
  "PASS: optional tutorial / mid-practice skip isolation, named life, relocated actions, 18-part body atlas, sold-part details / no resale, zone filtering, continued 13:30 ticker, readable pause reason / resume, automatic midnight.",
);
