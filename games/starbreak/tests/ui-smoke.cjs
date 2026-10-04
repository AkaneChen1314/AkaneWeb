const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
// This smoke check exercises DOM event wiring; it does not emulate CSS layout.
let all = [];
const viewport = { width: 960, height: 650, coarse: false, reduced: false };
const drawingCalls = [];
const context2d = new Proxy(
  { createRadialGradient: () => ({ addColorStop() {} }) },
  {
    get: (o, k) =>
      k in o
        ? o[k]
        : (...args) => {
            drawingCalls.push({ name: k, args });
          },
    set: (o, k, v) => ((o[k] = v), true),
  },
);
class Element {
  constructor(tag = "div", attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.id = attrs.id;
    this.children = [];
    this.style = {
      setProperty(k, v) {
        this[k] = v;
      },
    };
    this.value = attrs.value || "";
    this.checked = "checked" in attrs;
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs))
      if (k.startsWith("data-"))
        this.dataset[
          k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        ] = v;
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.events = {};
    this.complete = tag === "img";
    this.naturalWidth = tag === "img" ? 1254 : 0;
    all.push(this);
  }
  set innerHTML(html) {
    this._html = html;
    const old = this.descendants();
    all = all.filter((x) => !old.includes(x));
    this.children = [];
    const stack = [this];
    for (const m of html.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
      const token = m[0];
      if (token.startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const tag = token.match(/^<([\w-]+)/)[1],
        attrs = {};
      for (const a of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        if (a.index === 1) continue;
        attrs[a[1]] = a[2] || "";
      }
      const el = new Element(tag, attrs);
      stack.at(-1).children.push(el);
      if (
        !["input", "img", "br", "hr", "meta", "link"].includes(
          tag.toLowerCase(),
        ) &&
        !token.endsWith("/>")
      )
        stack.push(el);
    }
  }
  get innerHTML() {
    return this._html || "";
  }
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  matches(s) {
    if (s.startsWith("#")) return this.id === s.slice(1);
    const a = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (a)
      return (
        a[1] in this.attrs && (a[2] === undefined || this.attrs[a[1]] === a[2])
      );
    return this.tagName === s.toUpperCase();
  }
  querySelectorAll(s) {
    return this.descendants().filter((x) => x.matches(s));
  }
  querySelector(s) {
    if (s === "#joystick i")
      return this.querySelector("#joystick")?.querySelector("i");
    return this.querySelectorAll(s)[0] || null;
  }
  addEventListener(k, fn) {
    this.events[k] = fn;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  focus() {}
  setPointerCapture() {}
  getBoundingClientRect() {
    return {
      width: viewport.width,
      height: viewport.height,
      left: 0,
      top: 0,
      right: viewport.width,
      bottom: viewport.height,
    };
  }
  getContext() {
    return context2d;
  }
  click() {
    const e = { target: this, preventDefault() {} };
    this.onclick?.(e);
    this.events.click?.(e);
  }
}
const root = new Element("body");
root.innerHTML = fs.readFileSync("index.html", "utf8");
const document = {
  getElementById: (id) => all.find((x) => x.id === id) || null,
  querySelectorAll: (s) => root.querySelectorAll(s),
  querySelector: (s) => root.querySelector(s),
  addEventListener() {},
  createElement: (tag) => new Element(tag),
};
const windowEvents = {},
  documentEvents = {};
document.addEventListener = (k, fn) => (documentEvents[k] = fn);
const storage = new Map(),
  sandbox = {
    console,
    document,
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    performance: { now: () => 10 },
    Date,
    Intl,
    Math,
    JSON,
    Map,
    Set,
    Number,
    String,
    Array,
    Object,
    Blob,
    URL,
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: (fn) => {
      sandbox.frame = fn;
    },
    matchMedia: (q) => ({
      matches: q.includes("reduced-motion")
        ? viewport.reduced
        : q.includes("pointer:coarse")
          ? viewport.coarse
          : false,
    }),
  };
sandbox.window = sandbox;
sandbox.devicePixelRatio = 1;
sandbox.addEventListener = (k, fn) => (windowEvents[k] = fn);
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("game.js", "utf8"), sandbox);
function click(id) {
  const e = document.getElementById(id);
  assert(e, `missing #${id}`);
  e.click();
}
document.getElementById("wave-count").value = "7";
document.getElementById("wave-count").onchange();
document.getElementById("boss-rule").value = "none";
document.getElementById("boss-rule").onchange();
document.getElementById("kill-quota").value = "30";
document.getElementById("kill-quota").onchange();
click("launch");
assert(document.getElementById("guide-launch"));
click("guide-launch");
assert(document.getElementById("arena"));
assert.equal(sandbox.Starbreak.engine.r.config.totalWaves, 7);
assert.equal(sandbox.Starbreak.engine.r.config.bossRule, "none");
assert.equal(sandbox.Starbreak.engine.r.config.killsPerWave, 30);
sandbox.frame(10);
sandbox.frame(60);
click("pause");
assert.equal(sandbox.Starbreak.engine.r.phase, "paused");
click("resume");
assert.equal(sandbox.Starbreak.engine.r.phase, "play");
click("codex-btn");
assert(document.getElementById("dialog").open);
click("dialog-close");
assert.equal(sandbox.Starbreak.engine.r.phase, "paused");
click("resume");
sandbox.Starbreak.engine.offerUpgrades("level");
sandbox.Starbreak.engine.r.pendingLevels = 1;
document.querySelector('[data-choice="0"]').click();
assert.equal(sandbox.Starbreak.engine.r.phase, "play");
click("return");
assert(document.getElementById("continue"));
click("continue");
assert.equal(sandbox.Starbreak.engine.r.phase, "paused");
click("resume");
sandbox.frame(110);
click("return");
click("research");
click("dialog-close");
click("achievements");
click("dialog-close");
click("settings");
click("export-save");
click("dialog-close");
click("sound-btn");
assert(storage.has("starbreak-save-v1"));
assert(storage.has("starbreak-run-v1"));
console.log(
  "PASS DOM smoke: launch, tutorial, canvas draw, pause/resume, codex, upgrade, save/continue, research, achievements, settings and backup export.",
);

sandbox.Starbreak.profile.credits = 500;
click("base-shop");
document.querySelector('[data-module="scanner"]').click();
assert.equal(sandbox.Starbreak.profile.moduleEquipped, "scanner");
assert.equal(sandbox.Starbreak.profile.credits, 410);
assert.equal(
  document.getElementById("equipped-name").textContent,
  "深空打撈艙",
);
click("dialog-close");
click("boss-details");
assert(
  document.getElementById("dialog-content").innerHTML.includes("奇點斬擊"),
);
click("dialog-close");
click("continue");
click("resume");
const engine = sandbox.Starbreak.engine;
const boss = engine.spawnEnemy("boss");
sandbox.frame(300);
assert(document.getElementById("boss-portrait").getAttribute("src"));
engine.r.gold = 500;
engine.setPhase("intermission");
const before = engine.r.gold,
  cost = engine.r.shopStock[0].cost;
document.querySelector('[data-buy="0"]').click();
assert.equal(engine.r.gold, before - cost);
assert(engine.r.shopStock[0].bought);
click("shop-refresh");
assert.equal(engine.r.shopRefreshes, 1);
click("next-wave");
assert.equal(engine.r.phase, "play");
assert.equal(engine.r.wave, 2);
console.log(
  "PASS v1.1 DOM smoke: custom launch settings, module purchase/equip, Boss archive and sprite draw, live market purchase/refresh and next wave.",
);

// Touch and keyboard events run through the same handlers used by the live UI.
const arena = document.getElementById("arena");
const pointer = (id, x, y) => ({
  pointerId: id,
  clientX: x,
  clientY: y,
  button: 0,
  pointerType: "touch",
  preventDefault() {},
});
engine.r.enemies = [];
engine.r.enemyBullets = [];
engine.r.hazards = [];
engine.r.p.inv = 999;
arena.events.pointerdown(pointer(1, 160, 460));
arena.events.pointermove(pointer(1, 205, 460));
const anchor = document.getElementById("joystick").style.left;
arena.events.pointerdown(pointer(2, 600, 200));
assert.equal(document.getElementById("joystick").style.left, anchor);
arena.events.pointercancel(pointer(2, 600, 200));
const startX = engine.r.p.x;
sandbox.frame(350);
assert(engine.r.p.x > startX);
document.getElementById("dash").events.pointerdown(pointer(3, 850, 600));
assert(engine.r.p.dashCD > 0);
assert(engine.r.p.dx > 0);
document.getElementById("burst").events.pointerdown(pointer(4, 850, 540));
assert(engine.r.p.burstCD > 0);
arena.events.pointercancel(pointer(1, 205, 460));
engine.r.p.dashTime = 0;
const stopX = engine.r.p.x;
sandbox.frame(400);
assert.equal(engine.r.p.x, stopX);
const key = (k) => ({
  key: k,
  target: arena,
  repeat: false,
  preventDefault() {},
});
windowEvents.keydown(key("d"));
sandbox.frame(450);
assert(engine.r.p.x > stopX);
click("pause");
click("resume");
const pausedX = engine.r.p.x;
sandbox.frame(500);
assert.equal(engine.r.p.x, pausedX);
windowEvents.keydown(key("a"));
engine.r.pendingLevels = 1;
engine.offerUpgrades("level");
document.querySelector('[data-choice="0"]').click();
const upgradeX = engine.r.p.x;
sandbox.frame(550);
assert.equal(engine.r.p.x, upgradeX);
engine.r.config.bossRule = "rush";
engine.r.config.bossDelay = 90;
engine.r.bossSpawned = false;
engine.r.waveTime = 21;
engine.r.waveKills = 5;
sandbox.frame(700);
assert.equal(document.getElementById("boss-arrival").hidden, false);
assert(document.getElementById("boss-countdown").textContent.includes("01:09"));
assert(
  document.getElementById("wave-status").textContent.startsWith("擊破 5 /"),
);
assert(!document.getElementById("wave-status").textContent.includes("秒"));
console.log(
  "PASS v1.2 input/HUD smoke: two-finger movement plus skills, pointer cancel, keyboard movement, no drift after pause/upgrade, Boss countdown and kill progress.",
);
click("return");
const sections = document.querySelectorAll('[name="flight-advanced"]');
assert.equal(sections.length, 5);
assert(sections.every((x) => !("open" in x.attrs)));
const bossSecond = document.getElementById("boss-second");
bossSecond.checked = false;
bossSecond.onchange();
assert(document.getElementById("boss-third").disabled);
document.getElementById("boss-frequency").value = "relentless";
document.getElementById("boss-frequency").onchange();
document.getElementById("enemy-amount").value = "swarm";
document.getElementById("enemy-amount").onchange();
assert.equal(
  sandbox.Starbreak.profile.lastConfig.config.bossFrequency,
  "relentless",
);
assert.equal(sandbox.Starbreak.profile.lastConfig.config.enemyAmount, "swarm");
sections[1].open = true;
sections[1].events.toggle();
sections[2].open = true;
sections[2].events.toggle();
assert.equal(sections[1].open, false);
click("enemy-details");
assert(document.getElementById("dialog-content").innerHTML.includes("修復機"));
click("dialog-close");
console.log(
  "PASS v1.2 setup smoke: five collapsed categories, exclusive expansion, dependent phase options, independent frequency/enemy quantity persistence and enemy archive.",
);

// The screenshot regression: an irrelevant interval must not remain visible.
for (const rule of ["rush", "final", "none"]) {
  document.getElementById("boss-rule").value = rule;
  document.getElementById("boss-rule").onchange();
  assert(document.getElementById("boss-every-field").hidden);
  assert(document.getElementById("final-boss-field").hidden);
  assert(
    !document
      .getElementById("boss-setting-summary")
      .textContent.includes("每 4 波"),
  );
}
document.getElementById("boss-rule").value = "interval";
document.getElementById("boss-rule").onchange();
assert.equal(document.getElementById("boss-every-field").hidden, false);
assert.equal(document.getElementById("boss-every").value, "4");
document.getElementById("starting-weapon").value = "lightning";
document.getElementById("starting-weapon").onchange();
assert(
  document
    .getElementById("loadout-setting-summary")
    .textContent.includes("85 生命"),
);
assert(document.getElementById("loadout-cost").textContent.includes("−15"));
document.getElementById("difficulty").value = "4";
document.getElementById("difficulty").onchange();
assert(
  document
    .getElementById("difficulty-info")
    .innerHTML.includes("受到傷害 ×1.75"),
);
assert.equal(
  sandbox.Starbreak.profile.lastConfig.config.startingWeapon,
  "lightning",
);
click("guide-btn");
assert(
  document
    .getElementById("dialog-content")
    .innerHTML.includes("存檔、離開與轉移進度"),
);
assert(
  document
    .getElementById("dialog-content")
    .innerHTML.includes("商城需要點商品"),
);
click("dialog-close");
console.log(
  "PASS v1.3 setup/handbook smoke: hidden inactive interval, restored interval value, weapon health preview, difficulty effects, saved choice and detailed handbook.",
);
document.querySelector('[data-preset="classic"]').click();
assert.equal(document.getElementById("starting-weapon").value, "lightning");
assert.equal(document.getElementById("difficulty").value, "4");
assert.equal(
  document
    .querySelector('[data-preset="classic"]')
    .getAttribute("aria-pressed"),
  "true",
);
click("launch");
click("confirm-new");
assert.equal(engine.r.startWeapon, "lightning");
assert.equal(engine.r.p.maxHp, 85);
assert.equal(engine.r.difficulty, 4);
console.log(
  "PASS v1.3 launch smoke: presets preserve independent weapon/difficulty choices and confirmed new run receives the shown loadout.",
);

click("return");
document.querySelector('[data-preset="boss"]').click();
assert.equal(document.getElementById("difficulty").value, "4");
assert.equal(document.getElementById("boss-shield").value, "fortress");
assert.equal(document.getElementById("boss-frequency").value, "fast");
assert.equal(document.getElementById("enemy-amount").value, "normal");
assert(
  document
    .getElementById("difficulty-info")
    .innerHTML.includes("Boss 總耐久預算 ×2.50"),
);
assert(
  document.getElementById("difficulty-info").innerHTML.includes("3 → 4 重攻擊"),
);
document.getElementById("boss-shield").value = "none";
document.getElementById("boss-shield").onchange();
assert(document.getElementById("shield-recovery").disabled);
document.getElementById("boss-rule").value = "none";
document.getElementById("boss-rule").onchange();
assert(document.getElementById("boss-shield").disabled);
document.querySelector('[data-preset="boss"]').click();
click("launch");
click("confirm-new");
assert.equal(engine.r.config.bossShield, "fortress");
assert.equal(engine.r.config.bossThirdPhase, true);
const shieldBoss = engine.spawnEnemy("boss");
sandbox.frame(900);
assert.equal(document.getElementById("boss-shield-row").hidden, false);
assert(
  document.getElementById("boss-body-label").textContent.includes("護盾保護"),
);
assert(
  document.getElementById("boss-shield-label").textContent.includes("防護罩"),
);
engine.hitEnemy(shieldBoss, 1e7);
sandbox.frame(1050);
assert(
  document.getElementById("boss-body-label").textContent.includes("可攻擊"),
);
assert(
  document.getElementById("boss-shield-label").textContent.includes("護盾已破"),
);
click("guide-btn");
assert(
  document.getElementById("dialog-content").innerHTML.includes("破盾最後一擊"),
);
click("dialog-close");
console.log(
  "PASS v1.4 shield/setup/HUD smoke: trial preset, shown Boss multipliers, preserved difficulty, shield dependencies, body gate, break feedback and handbook.",
);

// v1.5 presentation controls are exercised through the actual DOM and draw loop.
click("return");
click("settings");
const effects = document.getElementById("setting-effects");
assert(effects);
effects.value = "lite";
effects.onchange({ target: effects });
assert.equal(sandbox.Starbreak.profile.settings.effectsLevel, "lite");
assert.equal(
  JSON.parse(storage.get("starbreak-save-v1")).settings.effectsLevel,
  "lite",
);
click("dialog-close");
click("continue");
click("resume");
engine.r.p.inv = 0;
for (const roster of ["rift", "tyrant", "queen", "core"]) {
  engine.r.enemies = [];
  engine.r.hazards = [];
  engine.r.enemyBullets = [];
  engine.r.config.bossRoster = roster;
  engine.r.time += 1;
  const b = engine.spawnEnemy("boss");
  engine.bossAttack(b, 0, 1);
  engine.hitEnemy(b, 1e7);
  b.hp = b.maxHp * 0.49;
  engine.updateEnemy(b, 0.05);
  sandbox.frame(1200);
  assert(
    document.getElementById("boss-adaptation").textContent.includes("接戰配置"),
  );
  assert(
    engine.fx.some((f) => f.type === "shockwave" && f.style === b.bossIndex),
  );
}
function lastDrawScale() {
  return drawingCalls.filter((c) => c.name === "scale").at(-1)?.args[0];
}
engine.zoomPulse = 0.65;
engine.screenPulse = 0.3;
engine.shake = 14;
sandbox.Starbreak.profile.settings.effectsLevel = "full";
drawingCalls.length = 0;
sandbox.frame(1200);
assert(lastDrawScale() > 1);
sandbox.Starbreak.profile.settings.effectsLevel = "none";
drawingCalls.length = 0;
sandbox.frame(1200);
assert.equal(lastDrawScale(), 1);
assert.equal(engine.r.enemyBullets.length > 0, true);
viewport.reduced = true;
sandbox.Starbreak.profile.settings.effectsLevel = "full";
drawingCalls.length = 0;
sandbox.frame(1200);
assert.equal(lastDrawScale(), 1);
assert(
  drawingCalls.some((c) => c.name === "arc"),
  "basic attack geometry remains visible",
);
viewport.reduced = false;
viewport.coarse = true;
viewport.width = 390;
viewport.height = 650;
windowEvents.resize();
sandbox.Starbreak.profile.settings.effectsLevel = "auto";
drawingCalls.length = 0;
sandbox.frame(1200);
assert(lastDrawScale() > 0.83 && lastDrawScale() < 0.84);
engine.pause();
drawingCalls.length = 0;
sandbox.frame(1200);
assert.equal(lastDrawScale(), 0.83);
viewport.coarse = false;
viewport.width = 960;
windowEvents.resize();
console.log(
  "PASS v1.5 presentation/HUD smoke: effect preference save, four Boss effects, snapshot label, full/off/reduced/mobile draw and paused camera stability.",
);

// Blue World r11：精簡 HUD 的完整資訊與返回休息必須保留原戰鬥。
click("boss-status-details");
assert(document.getElementById("dialog").open);
assert.equal(engine.r.phase, "paused");
for (const text of ["本體生命", "防護罩", "接戰配置", "閱讀時已暫停"])
  assert(document.getElementById("dialog-content").innerHTML.includes(text));
click("dialog-close");
assert.equal(
  engine.r.phase,
  "paused",
  "closing status must not resume without consent",
);
click("resume");
assert.equal(engine.r.phase, "play");

sandbox.akanePortalPaused = true;
windowEvents["akane-portal-pause"]({ detail: { paused: true } });
assert.equal(engine.r.phase, "paused");
assert.equal(JSON.parse(storage.get("starbreak-run-v1")).phase, "paused");
const pausedTime = engine.r.time;
drawingCalls.length = 0;
sandbox.frame(1300);
sandbox.frame(1800);
assert.equal(engine.r.time, pausedTime);
assert.equal(drawingCalls.length, 0, "hidden game must not draw or step");
sandbox.akanePortalPaused = false;
windowEvents["akane-portal-pause"]({ detail: { paused: false } });
assert.equal(
  engine.r.phase,
  "paused",
  "returning must retain the pause screen",
);
click("resume");
sandbox.frame(2000);
sandbox.frame(2100);
assert(engine.r.time > pausedTime);
console.log(
  "PASS Blue World r11: Boss details, safe close, portal pause/save, no hidden draw/time, manual resume and original save keys.",
);
