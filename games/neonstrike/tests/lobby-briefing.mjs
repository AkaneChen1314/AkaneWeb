/*
 * 測試：大廳的四個步驟、地圖卡片與首領設定的摘要。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// 大廳的程式與網頁；每個 id 都不能重複。
const source = readFileSync(new URL("../lobby.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(
  new Set(ids).size,
  ids.length,
  "each control and summary ID must be unique",
);

// 假的網頁元素。
function element(value = "") {
  const listeners = {},
    classes = new Set(),
    attributes = {};
  return {
    value,
    textContent: "",
    hidden: false,
    disabled: false,
    dataset: {},
    open: false,
    scrollTop: 0,
    selectedOptions: [{ textContent: "" }],
    classList: {
      // 假元素的 class 開關。
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    dispatch(type) {
      listeners[type]?.();
    },
    dispatchEvent(event) {
      listeners[event.type]?.(event);
    },
    scrollIntoView() {
      this.scrolled = true;
    },
  };
}
// 依網頁上的 id 建立假元素。
const elements = new Map(ids.map((id) => [id, element()]));
// 用 id 取得假元素。
const get = (id) => elements.get(id);
// 先填入一組已儲存的設定。
get("operatorName").textContent = "VANTA // 夜襲";
get("mapSelect").value = "1";
get("bossSelect").value = "on";
get("bossHealthSelect").value = "2000";
get("bossSpeedSelect").value = "3.2";
get("bossPowerSelect").value = "1.5";
get("enemyPowerSelect").value = "1.5";
// 四個步驟與兩張地圖卡。
const tabs = Array.from({ length: 4 }, () => element()),
  pages = Array.from({ length: 4 }, (_, i) => {
    const p = element();
    p.dataset.lobbyStep = String(i);
    return p;
  });
const mapCards = ["0", "1"].map((value) => element(value));
const mission = element(),
  content = element(),
  drawer = element();
let mode = "首領討伐 WARLORD",
  difficulty = "NIGHTMARE 煉獄";
// 假的 document。
const document = {
  getElementById: get,
  addEventListener() {},
  // 假的 querySelectorAll 與 querySelector：只支援大廳程式會用到的幾種查詢。
  querySelectorAll(q) {
    return q === "[data-step-tab]"
      ? tabs
      : q === 'input[name="arena"]'
        ? mapCards
        : pages;
  },
  querySelector(q) {
    if (q === ".mission") return mission;
    if (q === ".setup-content") return content;
    if (q === ".encounter-drawer") return drawer;
    if (q.startsWith("#modeOptions")) return { getAttribute: () => mode };
    if (q.startsWith("#difficultyOptions"))
      return { getAttribute: () => difficulty };
  },
};
// 在沙盒環境執行大廳程式。
const context = vm.createContext({
  document,
  window: {},
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  queueMicrotask: (fn) => fn(),
});
vm.runInContext(source, context);
assert.equal(get("brandMapName").textContent, "EMBER FOUNDRY");
assert.equal(get("briefSectorCount").textContent, "11");
assert.equal(mapCards[1].checked, true, "cards reflect the saved map");
assert.equal(pages[0].hidden, false);
assert.equal(pages[1].hidden, true);
// 摘要要反映實際的設定與數值。
tabs[3].dispatch("click");
assert.equal(get("summaryMap").textContent, "熔火工廠");
assert.equal(get("summaryBossCard").hidden, false);
assert.match(
  get("summaryBoss").textContent,
  /生命 3840（基礎 2000）/,
  "boss actual health includes difficulty and enemy strength",
);
assert.match(get("summaryBoss").textContent, /基礎移速 3\.2×/);
// 限時獵殺沒有首領卡片。
mode = "限時獵殺 HUNTER";
get("bossSelect").value = "off";
tabs[3].dispatch("click");
assert.equal(get("summaryBossCard").hidden, true, "hunter has no boss card");
// 捷徑會打開自訂設定。
tabs[2].dispatch("click");
get("encounterJump").dispatch("click");
assert.equal(drawer.open, true);
assert.equal(drawer.scrolled, true, "shortcut reveals the configuration");
// 從選單換地圖，卡片會跟著改變。
get("mapSelect").value = "0";
get("mapSelect").dispatch("change");
assert.equal(get("brandMapName").textContent, "RUST HARBOR");
assert.equal(get("briefSectorCount").textContent, "15");
assert.equal(
  mapCards[0].checked,
  true,
  "external map selection updates the cards",
);
// 點地圖卡，選單也會跟著改變。
mapCards[1].checked = true;
mapCards[1].dispatch("change");
assert.equal(
  get("mapSelect").value,
  "1",
  "card choice updates the actual game map control",
);
assert.equal(get("brandMapName").textContent, "EMBER FOUNDRY");
assert.equal(mapCards[0].checked, false);
console.log(
  "PASS four-step navigation, map card synchronization, boss health calculation and custom-settings shortcut",
);
