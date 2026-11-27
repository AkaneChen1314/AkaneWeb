/*
 * 測試共用的工具：用假的瀏覽器環境執行遊戲主程式。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as THREE from "../vendor/three.module.min.js";
import {
  createGrenadeMotion,
  advanceGrenadeMotion,
  predictGrenadePath,
  GRENADE_FUSE,
  GRENADE_BLAST_RADIUS,
} from "../grenade-trajectory.js";
import * as spatialCollision from "../spatial-collision.js";

// 使用實際的 Three.js 幾何與最精簡的假瀏覽器來執行遊戲程式。
const sourcePath = fileURLToPath(new URL("../main.js", import.meta.url));
// 原始碼排版後 import 可能跨行；只移除靜態匯入，保留被測試的遊戲實作。
const source = readFileSync(sourcePath, "utf8")
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\r?\n/gm, "")
  .replace(/\r?\ninitLoadout\(\);\s*init3D\(\);[\s\S]*$/, "");

// 建立一份獨立的遊戲環境；run(程式) 會在裡面執行並回傳結果。
export function createHarness() {
  const nodes = new Map(),
    documentListeners = new Map(),
    globalListeners = new Map(),
    scheduled = new Map();
  let now = 1000,
    nextTimer = 0;
  const noop = () => {},
    gradient = { addColorStop: noop };
  // 假的畫布；沒有定義的函式都當成什麼都不做。
  const canvasContext = new Proxy(
    {
      measureText: (text) => ({ width: String(text).length * 10 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
    },
    {
      get: (target, key) => target[key] ?? noop,
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  // 假的網頁元素。
  function makeNode() {
    const classes = new Set(),
      children = new Map(),
      attributes = new Map(),
      listeners = new Map();
    return {
      textContent: "",
      style: { setProperty: noop },
      children: [],
      dataset: {},
      value: "",
      disabled: false,
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        // 假元素的 class 開關。
        toggle: (name, force) => {
          const add = force ?? !classes.has(name);
          if (add) classes.add(name);
          else classes.delete(name);
          return add;
        },
      },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
      addEventListener: (type, listener) => listeners.set(type, listener),
      dispatch(type, event = {}) {
        listeners.get(type)?.(event);
      },
      // 加入、移除、替換子元素。
      appendChild(child) {
        this.children.push(child);
        child.parent = this;
        return child;
      },
      remove() {
        if (this.parent)
          this.parent.children = this.parent.children.filter(
            (child) => child !== this,
          );
      },
      replaceChildren(...items) {
        this.children = items;
        items.forEach((child) => (child.parent = this));
      },
      getContext: () => canvasContext,
      // 在假元素裡找子元素（找不到就建立一個新的，讓程式不會出錯）。
      querySelector: (selector) => {
        if (!children.has(selector)) children.set(selector, makeNode());
        return children.get(selector);
      },
    };
  }
  // 假的 document。
  const document = {
    pointerLockElement: null,
    documentElement: makeNode(),
    body: makeNode(),
    // 假的 document.querySelector：找不到就建立一個新的假元素。
    querySelector: (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, makeNode());
      return nodes.get(selector);
    },
    querySelectorAll: () => [],
    createElement: makeNode,
    addEventListener: (type, listener) => documentListeners.set(type, listener),
    exitPointerLock: noop,
  };
  const storage = new Map();
  // 沙盒環境裡可以使用的東西。
  const context = vm.createContext({
    THREE,
    ...spatialCollision,
    createGrenadeMotion,
    advanceGrenadeMotion,
    predictGrenadePath,
    GRENADE_FUSE,
    GRENADE_BLAST_RADIUS,
    document,
    console,
    performance: { now: () => now },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    // 假的 setTimeout：先記下來，測試再決定什麼時候執行。
    setTimeout: (callback) => {
      scheduled.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id) => scheduled.delete(id),
    requestAnimationFrame: noop,
    addEventListener: (type, listener) => globalListeners.set(type, listener),
  });
  // 執行遊戲主程式。
  vm.runInContext(source, context, { filename: sourcePath });
  const run = (expression) => vm.runInContext(expression, context);
  // 準備最基本的場景與玩家。
  run(
    `
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera();
      yaw = new THREE.Group();
      yaw.position.set(0, 1.68, 64);
      renderer = {
        domElement: {},
        clear() {},
        clearDepth() {},
        shadowMap: { autoUpdate: true },
        render() {},
      };
    `,
  );
  // 提供給測試使用的工具。
  return {
    run,
    nodes,
    document,
    scheduled,
    storage,
    setNow: (value) => {
      now = value;
    },
    // 觸發登記在 document 上的事件。
    dispatchDocument: (type) => {
      assert.ok(documentListeners.has(type), `Missing ${type} handler`);
      documentListeners.get(type)();
    },
    // 觸發登記在 window 上的事件。
    dispatchGlobal: (type, event) => {
      assert.ok(globalListeners.has(type), `Missing ${type} handler`);
      globalListeners.get(type)(event);
    },
    // 把每一幀會呼叫的更新函式換成什麼都不做，只測試想測的部分。
    installFrameStubs: () =>
      run(
        `
          clock = {
            getDelta() {
              return 0.05;
            },
          };
          updateRain = () => {};
          updateEffects = () => {};
          updatePlayer = () => {};
          updateEnemies = () => {};
          updateGrenades = () => {};
          updatePickups = () => {};
          updateCompass = () => {};
          updateMissionStatus = () => {};
          drawMinimap = () => {};
        `,
      ),
  };
}

export { THREE };
