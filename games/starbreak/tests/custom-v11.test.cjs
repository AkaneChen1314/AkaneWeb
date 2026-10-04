const assert = require("node:assert/strict");
const {
  Engine,
  defaultProfile,
  normalizeConfig,
  isBossWave,
  MODULES,
} = require("../game.js");
const test = (n, f) => {
  f();
  console.log("PASS", n);
};
function run(config, mode = "campaign") {
  const e = new Engine(defaultProfile());
  e.newRun("scout", mode, 0, 1138, config);
  return e;
}
test("arbitrary final wave and final-only/none/interval rules", () => {
  for (const n of [1, 3, 7, 16, 25, 80]) {
    const e = run({ totalWaves: n, bossEvery: 3 });
    assert(isBossWave(e.r, n));
    assert.equal(isBossWave(e.r, 2), n === 2);
  }
  const none = run({ totalWaves: 7, bossRule: "none" });
  for (let w = 1; w <= 7; w++) assert.equal(isBossWave(none.r, w), false);
  const final = run({ totalWaves: 7, bossRule: "final" });
  for (let w = 1; w < 7; w++) assert.equal(isBossWave(final.r, w), false);
  assert(isBossWave(final.r, 7));
  const endless = run({ totalWaves: 7, bossRule: "final" }, "endless");
  assert.equal(isBossWave(endless.r, 7), false);
});
test("legacy wave duration no longer governs completion", () => {
  for (const seconds of [30, 90]) {
    const e = run({ totalWaves: 3, waveSeconds: seconds, bossRule: "none" });
    e.r.p.inv = 100;
    e.r.waveTime = seconds;
    e.step(0.05);
    assert.equal(e.r.phase, "play");
    e.r.waveKills = e.r.killTarget;
    e.step(0.05);
    assert.equal(e.r.phase, "upgrade");
  }
});
test("one-wave and seven-wave expeditions finish at the selected wave", () => {
  for (const n of [1, 7]) {
    const e = run({ totalWaves: n, waveSeconds: 30, bossRule: "none" });
    let count = 0;
    while (e.r.phase !== "result" && count++ < 30000) {
      const r = e.r;
      if (r.phase === "play") {
        r.p.inv = 999;
        e.step(0.05);
      } else if (r.phase === "upgrade") e.chooseUpgrade(0);
      else if (r.phase === "relic") e.chooseRelic(0);
      else if (r.phase === "route") e.chooseRoute(0);
      else if (r.phase === "event") e.chooseEvent(0);
      else if (r.phase === "intermission") e.nextWave();
    }
    assert.equal(e.r.wave, n);
    assert(e.r.result.win);
    assert.equal(e.profile.longWins, 0);
  }
});
test("market purchases cannot repeat, overspend, or vanish on reload", () => {
  const e = run({});
  e.setPhase("intermission");
  e.r.gold = 200;
  const before = e.r.gold,
    item = e.r.shopStock[0];
  assert(e.buy(0));
  assert.equal(e.r.gold, before - item.cost);
  const after = e.r.gold;
  assert.equal(e.buy(0), false);
  assert.equal(e.r.gold, after);
  const f = new Engine(e.profile);
  assert(f.loadRun(JSON.parse(JSON.stringify(e.r))));
  assert(f.r.shopStock[0].bought);
  assert.equal(f.buy(0), false);
  e.r.gold = 0;
  assert.equal(e.refreshShop(), false);
});
test("full arsenal hides unpurchasable weapons and capped stats", () => {
  const e = run({});
  e.r.stats.damage = 8;
  e.setPhase("intermission");
  e.r.gold = 500;
  assert.equal(e.canBuy({ kind: "stat", id: "damage", cost: 1 }), false);
  const w = e.r.weapons[0];
  w.level = 5;
  assert.equal(e.canBuy({ kind: "weapon", id: w.id, cost: 1 }), false);
});
test("module unlock snapshot and mutators apply only to new launches", () => {
  const p = defaultProfile();
  p.moduleOwned = MODULES.map((x) => x.id);
  p.moduleEquipped = "medic";
  const e = new Engine(p);
  e.newRun("scout", "campaign", 0, 8, {});
  assert.equal(e.r.p.maxHp, 112);
  assert.equal(e.r.stats.regen, 1);
  p.moduleEquipped = "reactor";
  assert.equal(e.r.module, "medic");
  e.newRun("scout", "campaign", 0, 8, { mutator: "glass" });
  assert.equal(e.r.module, "reactor");
  assert.equal(e.r.p.maxHp, 68);
  assert.equal(e.r.stats.damage, 1);
});
test("v1.0 run data migrates without losing health or weapon levels", () => {
  const e = run({}),
    old = JSON.parse(JSON.stringify(e.r));
  for (const k of [
    "config",
    "module",
    "waveType",
    "objective",
    "caches",
    "cacheTimer",
    "combo",
    "comboTimer",
    "maxCombo",
    "bossIntro",
    "shopStock",
    "shopRefreshes",
    "shopWave",
    "shopBuys",
    "shopSpent",
  ])
    delete old[k];
  const f = new Engine(e.profile);
  assert(f.loadRun(old));
  assert.equal(f.r.config.totalWaves, 16);
  assert.equal(f.r.p.hp, e.r.p.hp);
  assert.deepEqual(f.r.weapons, e.r.weapons);
  assert.equal(f.r.phase, "paused");
});
test("four Bosses have distinct attacks and apex has third phase", () => {
  const signatures = [];
  for (let i = 0; i < 4; i++) {
    const e = run({
      bossRoster: ["rift", "tyrant", "queen", "core"][i],
      bossRule: "rush",
      bossStrength: 2,
    });
    const b = e.spawnEnemy("boss");
    assert.equal(b.bossIndex, i);
    e.bossAttack(b, 0, 1);
    signatures.push(
      [e.r.hazards.length, e.r.enemyBullets.length, e.r.enemies.length].join(
        "/",
      ),
    );
    b.hp = b.maxHp * 0.29;
    e.r.p.inv = 100;
    e.updateEnemy(b, 0.02);
    assert.equal(b.phaseLevel, 3);
  }
  assert.equal(new Set(signatures).size, 4);
});
test("beam collision hurts only inside the warned corridor", () => {
  const e = run({});
  e.r.enemies = [];
  e.r.p.x = 1200;
  e.r.p.y = 1200;
  e.r.p.inv = 0;
  e.addHazard(1150, 1200, 0, 0, 20, {
    shape: "beam",
    angle: 0,
    length: 200,
    width: 15,
  });
  e.step(0.02);
  assert(e.r.p.hp < e.r.p.maxHp);
  const hp = e.r.p.hp;
  e.r.p.y = 1300;
  e.r.p.inv = 0;
  e.step(0.02);
  assert.equal(e.r.p.hp, hp);
});
test("objectives, supply caches and combo rewards are real", () => {
  const e = run({});
  e.r.p.dashCD = 0;
  e.r.objective = { kind: "dash", target: 1, progress: 0, reward: 20 };
  e.dash(1, 0);
  assert.equal(e.r.objective.progress, 1);
  const before = e.r.gold;
  e.openCache({ x: 0, y: 0, kind: "gold" });
  assert.equal(e.r.gold, before + 18);
  e.r.combo = 19;
  e.r.comboTimer = 3;
  const x = e.spawnEnemy("scout");
  e.killEnemy(x);
  assert.equal(e.r.maxCombo, 20);
  assert(e.r.gold >= before + 27);
});
console.log("10 v1.1 behavior checks passed.");
