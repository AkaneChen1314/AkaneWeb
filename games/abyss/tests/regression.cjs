const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.env.GAME_TEST_ROOT || path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "duplicate HTML id");
const eventListeners = new Map();
class Element {
  constructor(name = "") {
    this.name = name;
    this.dataset = {};
    this.disabled = false;
    this.children = [];
    this.style = {
      setProperty() {},
      removeProperty() {},
    };
    const classes = new Set();
    this._classes = classes;
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    };
  }
  set className(value) {
    this._classes.clear();
    for (const name of value.split(/\s+/).filter(Boolean)) this._classes.add(name);
  }
  get className() {
    return [...this._classes].join(" ");
  }
  set innerHTML(value) {
    this.markup = value;
    this.children = [];
  }
  get innerHTML() {
    return this.markup || "";
  }
  append(child) {
    this.children.push(child);
    child.parent = this;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  get firstElementChild() {
    return this.children[0];
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  focus() {
    document.activeElement = this;
  }
  select() {}
  querySelector(selector) {
    return getNode(this.name + " " + selector);
  }
  querySelectorAll() {
    return this.children;
  }
  closest(selector) {
    if (selector.startsWith("#")) return this.name === selector.slice(1) ? this : null;
    const data = selector.match(/^\[data-([\w-]+)\]$/);
    if (data) {
      const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return key in this.dataset ? this : null;
    }
    return null;
  }
  click() {
    if (this.disabled) return;
    this.onclick?.();
    for (const listener of eventListeners.get("click") || [])
      listener({
        target: this,
      });
  }
  getClientRects() {
    return [{}];
  }
}
const nodes = new Map(ids.map((id) => ["#" + id, new Element(id)]));
const getNode = (selector) => {
  if (selector === ".modal.open")
    return [...nodes.values()].find((node) => node.classList.contains("open")) || null;
  if (/^#[\w-]+$/.test(selector) && !nodes.has(selector)) return null;
  if (!nodes.has(selector)) {
    const node = new Element(selector);
    const data = selector.match(/^\[data-([\w-]+)=["']?([^\]"']+)["']?\]$/);
    if (data) node.dataset[data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = data[2];
    nodes.set(selector, node);
  }
  return nodes.get(selector);
};
const document = {
  querySelector: getNode,
  querySelectorAll: (selector) =>
    selector === ".modal.open"
      ? [...nodes.values()].filter((node) => node.classList.contains("open"))
      : [],
  createElement: () => new Element(),
  addEventListener(type, listener) {
    if (!eventListeners.has(type)) eventListeners.set(type, []);
    eventListeners.get(type).push(listener);
  },
  body: new Element("body"),
};
const storage = new Map();
const sandbox = {
  document,
  console,
  Math: Object.create(Math),
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  window: {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
    }),
    addEventListener() {},
  },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: () => 1,
  clearTimeout() {},
  location: {
    reload() {},
  },
  confirm: () => false,
};
vm.createContext(sandbox);
const runtimeSource = source.replace(
  /wait\s*=\s*\(?ms\)?\s*=>\s*new Promise\(\(?r\)?\s*=>\s*setTimeout\(r,\s*ms\)\)/,
  "wait = ms => Promise.resolve()",
);
assert.notEqual(runtimeSource, source, "animation wait stub was applied");
vm.runInContext(runtimeSource, sandbox);
const run = (code) => vm.runInContext(code, sandbox);
// Real game functions and rendering execute against an instrumented minimal DOM.
// Animation waits are removed, not gameplay logic.
getNode(".filter.active").dataset.filter = "all";
getNode("[data-shop-filter].active").dataset.shopFilter = "all";
async function main() {
  // Sequential tests: all cases share the actual game state.
  const check = async (name, action) => {
    await action();
    console.log("PASS", name);
  };
  await check("actual action victory unlocks the next-floor button", async () => {
    for (const action of ['useSkill("basic")', 'useTactic("heavy")']) {
      run('startGame("knight"); createEnemy(); S.enemy.hp=1; S.nextEventAt=9999;');
      await run(action);
      assert.equal(run("busy"), false);
      assert.equal(run("S.enemy"), null);
      assert.equal(
        getNode("[data-route=explore]").disabled,
        false,
        "visible explore button must be enabled after victory",
      );
      const floor = run("S.floor");
      getNode("[data-route=explore]").click();
      assert.equal(run("S.floor"), floor + 1);
      assert.ok(run("S.enemy"));
    }
  });
  await check("poison/burn kills, fleeing and defeat all release controls", async () => {
    for (const effect of ["poison", "burn"]) {
      run(
        `startGame("knight"); createEnemy(); S.enemy.hp=1; S.enemy.effects.${effect}=2; S.enemy.effectTurns.${effect}=3; S.enemy.intent={type:"guard",value:0};`,
      );
      await run('useTactic("guard")');
      assert.equal(run("S.enemy"), null);
      assert.equal(getNode("[data-route=explore]").disabled, false);
      assert.equal(getNode("#exploreActions").classList.contains("hidden"), false);
    }
    run('startGame("knight"); createEnemy();');
    sandbox.Math.random = () => 0;
    await run("tryFlee()");
    assert.equal(run("S.enemy"), null);
    assert.equal(getNode("[data-route=explore]").disabled, false);
    run('createEnemy(); S.hp=1; S.enemy.atk=999; S.enemy.intent={type:"attack",mult:1};');
    sandbox.Math.random = () => 0.99;
    await run('useSkill("basic")');
    assert.equal(run("busy"), false);
    assert.equal(run("S.enemy"), null);
    getNode("#eventOptions").children[0].onclick();
    assert.equal(getNode("[data-route=explore]").disabled, false);
    sandbox.Math.random = Math.random;
  });
  await check("failed turn rolls back and can be retried without losing potions", async () => {
    run(
      'startGame("knight"); createEnemy(); S.hp=30; S.potions.red=2; openBattlePotionMode(); toggleBattlePotion("red"); const originalEnemyTurn=enemyTurn; enemyTurn=async()=>{throw Error("Injected turn failure")};',
    );
    const hp = run("S.hp"),
      resource = run("S.res");
    await run("confirmBattlePotions()");
    assert.equal(run("S.potions.red"), 2);
    assert.equal(run("S.hp"), hp);
    assert.equal(run("S.res"), resource);
    assert.equal(run("busy"), false);
    assert.equal(getNode("[data-skill=basic]").disabled, false);
    run("enemyTurn=originalEnemyTurn;");
    await run('useSkill("basic")');
    assert.equal(run("S.enemy.turns"), 1);
  });
  await check(
    "enemy shields block all HP damage; poison signatures roll resistance once",
    async () => {
      run('startGame("knight"); createEnemy(); S.enemy.shield=9999;');
      const hp = run("S.enemy.hp");
      assert.equal(await run("dealDamage({d:1})"), 0);
      assert.equal(run("S.enemy.hp"), hp);
      run(
        'godUnlocked=true; startGame("god"); buyGear("knight_armor_prismatic"); equip(S.gear[0].uid); S.floor=349; createEnemy(); chooseBossDialogue(0); beginBossBattle(); S.enemy.signatureEffect="poison"; S.enemy.poison=5; S.enemy.atk=100; S.enemy.turns=3; rollIntent(); S.shield=0; S.hp=stats().maxHp;',
      );
      assert.ok(run("stats().poisonResist") > 0);
      let rolls = 0;
      sandbox.Math.random = () => {
        rolls++;
        return 0.99;
      };
      await run("enemyTurn()");
      // One damage variance roll, one poison resistance roll, one next-intent roll.
      assert.equal(rolls, 3);
      assert.equal(run("S.debuffs.poison"), 4);
      sandbox.Math.random = Math.random;
    },
  );
  await check(
    "rapid inputs, unavailable skills and potion cancellation do not spend extra turns",
    async () => {
      run(
        'startGame("knight"); createEnemy(); S.enemy.hp=S.enemy.maxHp=99999; S.enemy.atk=1; S.enemy.poison=0; S.res=0;',
      );
      await run('useSkill("0")');
      assert.equal(run("busy"), false);
      assert.equal(run("S.enemy.turns"), 0);
      assert.equal(getNode("[data-skill=basic]").disabled, false);
      await run('Promise.all([useSkill("basic"),useSkill("basic")])');
      assert.equal(run("S.enemy.turns"), 1);
      run('S.hp=30; openBattlePotionMode(); toggleBattlePotion("red");');
      const count = run("S.potions.red");
      run("closeBattlePotionMode()");
      assert.equal(run("S.potions.red"), count);
      assert.equal(run("S.enemy.turns"), 1);
      assert.equal(run("potionMode"), false);
      const floor = run("S.floor");
      getNode("[data-route=explore]").click();
      assert.equal(run("S.floor"), floor);
    },
  );
  await check("static data, assets and all DOM ids", () => {
    const refs = [...source.matchAll(/\$\("#([\w-]+)"\)/g)].map((match) => match[1]);
    assert.deepEqual(
      refs.filter((ref) => !ids.includes(ref)),
      [],
    );
    for (const match of html.matchAll(/(?:href|src)="\.\/([^?" ]+)/g))
      assert.ok(fs.existsSync(path.join(root, match[1])));
    assert.equal(run("MONSTERS.length"), 69);
    assert.equal(run("WORLD_BOSSES.length"), 20);
    assert.equal(run("Object.keys(GEAR).length"), 60);
    assert.equal(run("new Set(BOSS_SIGNATURES).size"), 20);
  });
  await check("six classes, God values, gear enhancement cap", () => {
    for (const id of ["knight", "rogue", "mage", "ranger", "priest", "berserker"]) {
      run(`startGame('${id}')`);
      assert.ok(run("S.hp > 0 && S.res === baseClass().maxRes"));
    }
    run('godUnlocked = true; startGame("god")');
    assert.equal(run("S.baseHp"), 99999);
    assert.equal(run("S.res"), 99999);
    assert.equal(run("S.baseAtk"), 999);
    run('buyGear("knight_weapon_prismatic")');
    run("S.gear[0].level = 9; const beforeGold = S.gold; enhance(S.gear[0].uid);");
    assert.equal(run("S.gear[0].level"), 9);
    assert.equal(run("S.gold === beforeGold"), true);
  });
  await check("no mini Boss, all 20 fixed Bosses and their signatures", () => {
    for (let floor = 1; floor <= 1000; floor++) {
      run(`S.floor=${floor - 1}; S.completed=false; createEnemy(false);`);
      assert.equal(run("S.enemy.worldBoss"), floor % 50 === 0);
      if (floor % 50 === 0) {
        assert.equal(run("S.enemy.n"), run(`WORLD_BOSSES[${floor / 50 - 1}].n`));
        assert.ok(run("S.enemy.signature && !S.enemy.dialogueResolved"));
        run("chooseBossDialogue(0); beginBossBattle();");
      }
    }
  });
  await check("save resumes enemy, HP, shields and cooldowns; no half-turn writes", () => {
    run(
      "busy=false; S.floor=499; S.completed=false; createEnemy(); chooseBossDialogue(1); beginBossBattle(); S.enemy.hp-=123; S.shield=77; S.cooldowns=[2,1,0]; save();",
    );
    const hp = run("S.enemy.hp");
    run("S.enemy=null; continueGame();");
    assert.equal(run("S.enemy.hp"), hp);
    assert.equal(run("S.shield"), 77);
    assert.equal(run("S.cooldowns[0]"), 2);
    const stable = storage.get("abyss-adventure-v1");
    run('busy=true; S.hp=1; save(); save({type:"pagehide"});');
    assert.equal(storage.get("abyss-adventure-v1"), stable);
    run("busy=false; continueGame()");
    assert.notEqual(run("S.hp"), 1);
  });
  await check("unanswered Boss dialogue cannot be skipped by reload", () => {
    run("S.floor=49; createEnemy(); continueGame();");
    assert.equal(run("busy"), true);
    assert.equal(run("S.enemy.worldBoss && !S.enemy.dialogueResolved"), true);
    run("chooseBossDialogue(0); beginBossBattle();");
  });
  await check(
    "three different potions cost one enemy turn; duplicate and fourth are blocked",
    async () => {
      run(
        'startGame("knight"); createEnemy(); S.enemy.atk=1; S.enemy.poison=0; S.hp=30; S.res=0; S.debuffs.poison=4; S.debuffs.burn=4; S.debuffTurns={poison:3,burn:3}; S.potions={red:5,blue:5,antidote:5,cooling:5}; openBattlePotionMode(); toggleBattlePotion("red"); toggleBattlePotion("blue"); toggleBattlePotion("antidote"); toggleBattlePotion("cooling");',
      );
      assert.equal(run("selectedBattlePotions.length"), 3);
      run('toggleBattlePotion("red"); toggleBattlePotion("red");');
      assert.equal(run("new Set(selectedBattlePotions).size"), 3);
      await run("confirmBattlePotions()");
      assert.equal(run("S.enemy.turns"), 1);
      assert.equal(run("S.potions.red"), 4);
      assert.equal(run("S.potions.blue"), 4);
      assert.equal(run("S.potions.antidote"), 4);
      assert.equal(run("S.potions.cooling"), 5);
      assert.equal(run("S.debuffs.poison || 0"), 0);
    },
  );
  await check("debuff refresh, finite duration and fully blocked hits", async () => {
    run('S.debuffs={}; S.debuffTurns={}; applyEnemyDebuff("burn",8); applyEnemyDebuff("burn",8);');
    assert.equal(run("S.debuffs.burn"), 8);
    run('S.enemy.intent={type:"guard",value:1};');
    for (let turn = 0; turn < 3; turn++) {
      run('S.enemy.intent={type:"guard",value:1};');
      await run("enemyTurn()");
    }
    assert.equal(run("S.debuffs.burn"), 0);
    run('S.enemy.poison=5; S.enemy.intent={type:"attack",mult:1}; S.shield=999;');
    const hp = run("S.hp");
    sandbox.Math.random = () => 0.99;
    await run("enemyTurn()");
    assert.equal(run("S.hp"), hp);
    assert.equal(run("S.debuffs.poison || 0"), 0);
    sandbox.Math.random = Math.random;
  });
  await check("Boss phase activates once, signature is interruptible", async () => {
    run("S.floor=549; createEnemy(); chooseBossDialogue(0); beginBossBattle();");
    const atk = run("S.enemy.atk");
    run("S.enemy.hp=Math.floor(S.enemy.maxHp*.49); checkBossPhase(); checkBossPhase();");
    assert.equal(run("S.enemy.atk"), Math.round(atk * 1.15));
    run("S.enemy.turns=3; rollIntent(); S.res=baseClass().maxRes; S.enemy.hp=S.enemy.maxHp;");
    assert.equal(run("S.enemy.intent.type"), "signature");
    const hp = run("S.hp");
    await run('useTactic("interrupt")');
    assert.equal(run("S.hp"), hp);
    assert.equal(run("S.enemy.turns"), 4);
  });
  await check("Boss special effects are advertised and blocked by full shields", async () => {
    run(
      "S.floor=199; createEnemy(); chooseBossDialogue(0); beginBossBattle(); S.enemy.turns=3; rollIntent(); S.enemy.poison=0; S.res=baseClass().maxRes; S.shield=999999;",
    );
    sandbox.Math.random = () => 0.99;
    const resource = run("S.res");
    assert.ok(run('intentTooltip().includes("10%")'));
    await run("enemyTurn()");
    assert.equal(run("S.res"), resource);
    run("S.enemy.turns=3; rollIntent(); S.shield=0; S.hp=stats().maxHp;");
    await run("enemyTurn()");
    assert.equal(run("S.res"), resource - Math.ceil(resource * 0.1));
    run(
      'S.enemy.signatureEffect="weak"; S.enemy.intent.name="測試招式"; applyBossSpecial(S.enemy);',
    );
    assert.equal(run("S.debuffs.weak"), 3);
    sandbox.Math.random = Math.random;
  });
  await check("each class can use all three skills and take one turn", async () => {
    for (const id of ["knight", "rogue", "mage", "ranger", "priest", "berserker"]) {
      for (let skill = 0; skill < 3; skill++) {
        run(
          `startGame('${id}'); createEnemy(); S.enemy.hp=S.enemy.maxHp=99999; S.enemy.atk=1; S.enemy.poison=0; S.hp=30;`,
        );
        await run(`useSkill('${skill}')`);
        assert.equal(run("busy"), false);
        assert.equal(run("S.enemy.turns"), 1);
        assert.ok(Number.isFinite(run("S.hp")) && Number.isFinite(run("S.res")));
      }
    }
  });
  await check(
    "read-only codex requires actual encounters, persists discoveries and blocks hidden spawns",
    () => {
      run('startGame("knight"); S.floor=800; S.highestFloor=800; openCodex()');
      assert.equal(run("S.discoveredMonsters.length"), 0);
      assert.ok(getNode("#codexList").innerHTML.includes("未發現的魔物"));
      for (const monster of run("MONSTERS")) {
        assert.ok(!getNode("#codexList").innerHTML.includes(monster.n));
        assert.ok(!getNode("#codexList").innerHTML.includes(monster.trait));
      }
      assert.equal(run("typeof startHunt"), "undefined");
      run("S.floor=0; createEnemy()");
      const name = run("S.enemy.n");
      assert.equal(run("S.discoveredMonsters.length"), 1);
      assert.equal(run("S.discoveredMonsters[0]"), name);
      const stateBefore = run("JSON.stringify(S)");
      run("openCodex(); renderCodex()");
      assert.equal(run("JSON.stringify(S)"), stateBefore, "Viewing codex changed progress/rewards");
      assert.ok(getNode("#codexList").innerHTML.includes(name));
      assert.ok(getNode("#codexList").innerHTML.includes(run("S.enemy.trait")));
      assert.ok(getNode("#codexList").innerHTML.includes("掉落素材"));
      assert.ok(!getNode("#codexList").innerHTML.includes("data-hunt"));
      assert.ok(!getNode("#codexList").innerHTML.includes("<button"));
      run("busy=false; save(); S.discoveredMonsters=[]; load()");
      assert.equal(run("S.discoveredMonsters[0]"), name);
      run("openCodex(S.enemy.drop)");
      assert.ok(getNode("#codexList").innerHTML.includes(name));
      // New adventure clears discoveries. Floor and test class do not grant entries.
      run('godUnlocked=true; startGame("god"); S.floor=999; S.highestFloor=999; openCodex()');
      assert.equal(run("S.discoveredMonsters.length"), 0);
      assert.ok(!getNode("#codexList").innerHTML.includes(name));
      assert.ok(!getNode("#codexBtn").disabled);
    },
  );
  await check("legacy codex recovery uses evidence only and retires old side hunts safely", () => {
    run('startGame("knight"); S.floor=30; createEnemy(); busy=false; save()');
    const expected = run("S.enemy.n");
    run(`let legacy=JSON.parse(localStorage.getItem(SAVE_KEY)); delete legacy.discoveredMonsters;
      legacy.enemy.hunt=true; localStorage.setItem(SAVE_KEY,JSON.stringify(legacy));`);
    const before = run("JSON.parse(localStorage.getItem(SAVE_KEY))");
    assert.equal(run("load()"), true);
    assert.equal(run("S.enemy"), null);
    assert.equal(run("S.floor"), before.floor);
    assert.equal(run("S.gold"), before.gold);
    assert.equal(run("JSON.stringify(S.materials)"), JSON.stringify(before.materials));
    assert.ok(run("S.discoveredMonsters").includes(expected));
    run(`let old=JSON.parse(localStorage.getItem(SAVE_KEY)); delete old.discoveredMonsters;
      old.enemy=null; old.logs=[]; old.floor=old.highestFloor=800;
      localStorage.setItem(SAVE_KEY,JSON.stringify(old)); load();`);
    assert.equal(run("S.discoveredMonsters.length"), 0);
    run(`let logSave=JSON.parse(localStorage.getItem(SAVE_KEY)); logSave.enemy=null;
      logSave.logs=[{msg:'魔物「'+MONSTERS[1].n+'」出現！'}];
      logSave.discoveredMonsters=['not a real monster',MONSTERS[1].n,MONSTERS[1].n];
      localStorage.setItem(SAVE_KEY,JSON.stringify(logSave)); load();`);
    assert.equal(run("S.discoveredMonsters.length"), 1);
    assert.equal(run("S.discoveredMonsters[0]"), run("MONSTERS[1].n"));
  });
  await check("all event gaps remain 5-10, including 991-999; no event on Boss floor", () => {
    for (let floor = 1; floor <= 999; floor++) {
      for (const fraction of [0.0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
        sandbox.Math.random = () => fraction;
        const target = run(`scheduleNextEventFloor(${floor})`);
        assert.ok(target - floor >= 5 && target - floor <= 10, `${floor} -> ${target}`);
        assert.notEqual(target % 50, 0);
      }
    }
    sandbox.Math.random = Math.random;
  });
  await check("pending events resume; treasure does not duplicate on refresh", async () => {
    run('S.floor=230; S.lastEventType="fountain"; event();');
    const type = run("S.pendingEvent.type");
    run("continueGame()");
    assert.equal(run("S.pendingEvent.type"), type);
    run('S.pendingEvent={type:"treasure"}; treasure(); save();');
    const gold = run("S.gold");
    run("continueGame(); continueGame();");
    assert.equal(run("S.gold"), gold);
    const reward = run("S.pendingEvent.reward.gold");
    const options = getNode("#eventOptions");
    options.children[0].onclick();
    options.children[0].onclick();
    assert.equal(run("S.gold"), gold + reward);
    assert.equal(run("S.pendingEvent"), null);
  });
  await check("shop filters contain only matching equipment or potions", () => {
    run('startGame("knight"); S.highestFloor=1000; S.floor=1000;');
    for (const filter of ["potion", "weapon", "armor"]) {
      getNode("[data-shop-filter].active").dataset.shopFilter = filter;
      run("renderShop()");
      const markup = getNode("#shopList").innerHTML;
      assert.equal(markup.includes("data-buy-potion"), filter === "potion");
      assert.equal(markup.includes('data-buy="knight_weapon'), filter === "weapon");
      assert.equal(markup.includes('data-buy="knight_armor'), filter === "armor");
    }
  });
  await check("log size, animation cap, zero-stat enhancements and rarity colors", () => {
    for (let index = 0; index < 100; index++) run(`log('紀錄 ${index}')`);
    assert.equal(run("S.logs.length"), 60);
    assert.equal(run("S.logs[0].msg"), "紀錄 99");
    for (let index = 0; index < 10; index++) run('battleFX("magic")');
    assert.ok(
      getNode("#floatLayer").children.filter((node) => node.classList.contains("battle-fx"))
        .length <= 3,
    );
    assert.equal(run('enhancedGearValue(GEAR.knight_weapon_common,"lifesteal",9)'), 0);
    run(
      'S.gold=999999; S.materials=Object.fromEntries(Object.keys(MATERIALS).map(id=>[id,999])); buyGear("knight_armor_prismatic"); equip(S.gear[0].uid);',
    );
    assert.equal(getNode('[data-equip-slot="armor"]').classList.contains("rarity-prismatic"), true);
  });
  await check("corrupted save uses backup and preserves it until valid recovery", () => {
    run("S.enemy=null; save()");
    const valid = storage.get("abyss-adventure-v1");
    storage.set("abyss-adventure-v1-backup", valid);
    storage.set("abyss-adventure-v1", "{broken");
    assert.equal(run("load()"), true);
    run("save()");
    assert.equal(storage.get("abyss-adventure-v1-backup"), valid);
    storage.delete("abyss-adventure-v1");
    assert.equal(run("load()"), true);
  });
  await check("1000-floor save is not premature clear; final victory is clear", async () => {
    run("S.completed=false; S.floor=999; createEnemy();");
    run("continueGame()");
    assert.equal(run("S.completed"), false);
    run("chooseBossDialogue(0); beginBossBattle();");
    await run("victory()");
    assert.equal(run("S.completed"), true);
    assert.equal(run("S.floor"), 1000);
    run('busy=false; continueGame(); chooseRoute("explore")');
    assert.equal(run("S.enemy"), null);
  });
  await check("complete 1000-floor route/action/event chain does not get stuck", async () => {
    run('godUnlocked=true; startGame("god");');
    const seenBosses = new Set();
    let actions = 0,
      events = 0;
    while (!run("S.completed")) {
      if (run("S.pendingEvent")) {
        getNode("#eventOptions").children[0].onclick();
        events++;
        assert.equal(run("S.pendingEvent"), null);
      } else if (run("S.enemy")) {
        if (run("S.enemy.worldBoss && !S.enemy.dialogueResolved")) {
          seenBosses.add(run("S.enemy.n"));
          run("chooseBossDialogue(0); beginBossBattle();");
        }
        await run('useSkill("0")');
        actions++;
        assert.equal(run("busy"), false);
      } else {
        assert.equal(
          getNode("[data-route=explore]").disabled,
          false,
          `stuck at floor ${run("S.floor")}`,
        );
        const oldFloor = run("S.floor");
        getNode("[data-route=explore]").click();
        assert.equal(run("S.floor"), oldFloor + 1);
      }
      assert.ok(actions < 6000 && events < 250, "progress loop must terminate");
    }
    assert.equal(run("S.floor"), 1000);
    assert.equal(seenBosses.size, 20);
    assert.ok(events > 50);
    assert.equal(getNode("[data-route=explore]").disabled, true);
    console.log(
      `CHAIN floors=1000 bosses=${seenBosses.size} events=${events} combatActions=${actions}`,
    );
  });
  console.log(
    JSON.stringify({
      version: run("APP_VERSION"),
      build: run("BUILD_ID"),
      monsters: run("MONSTERS.length"),
      bosses: 20,
      gear: 60,
      assertions: "passed",
      visualDeviceTest: "not available in this runtime",
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
