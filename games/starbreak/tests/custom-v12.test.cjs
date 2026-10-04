"use strict";
const assert = require("node:assert/strict");
const {
  Engine,
  defaultProfile,
  bossCooldown,
  enemyPool,
  normalizeConfig,
  difficultyRule,
} = require("../game.js");
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS", name);
}
function run(config = {}) {
  const e = new Engine(defaultProfile());
  e.newRun("scout", "campaign", 0, 31717, config);
  e.r.p.inv = 1e6;
  return e;
}
function activeStep(e, seconds) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    if (e.r.phase === "upgrade") e.chooseUpgrade(0);
    e.step(0.05);
  }
}
test("Boss appears only when its selected countdown reaches zero", () => {
  for (const delay of [15, 45, 90, 180]) {
    const e = run({ bossRule: "rush", bossDelay: delay });
    e.r.waveTime = delay - 0.1;
    e.step(0.05);
    assert(!e.r.bossSpawned);
    e.r.waveTime = delay;
    e.step(0.05);
    assert(e.r.bossSpawned);
    assert.equal(e.r.enemies.filter((x) => x.type === "boss").length, 1);
    e.step(0.05);
    assert.equal(e.r.enemies.filter((x) => x.type === "boss").length, 1);
  }
});
test("pause, rewards and reload preserve the active countdown and kills", () => {
  const e = run({ bossRule: "rush", bossDelay: 90 });
  e.r.waveTime = 19.5;
  e.r.waveKills = 7;
  const data = JSON.parse(JSON.stringify(e.r)),
    f = new Engine(e.profile);
  assert(f.loadRun(data));
  f.step(0.05);
  assert.equal(f.r.waveTime, 19.5);
  assert.equal(f.r.waveKills, 7);
  f.resume();
  f.step(0.05);
  assert.equal(f.r.waveTime, 19.55);
  f.pause();
  f.step(0.05);
  assert.equal(f.r.waveTime, 19.55);
  f.offerUpgrades("level");
  f.r.pendingLevels = 1;
  f.step(0.05);
  assert.equal(f.r.waveTime, 19.55);
});
test("kill quota can finish early; elapsed time never finishes a wave", () => {
  const e = run({ bossRule: "none", killsPerWave: 10 });
  e.r.waveTime = 10000;
  e.step(0.05);
  assert.equal(e.r.phase, "play");
  for (let i = 0; i < 10; i++) {
    const enemy = e.spawnEnemy("scout");
    e.killEnemy(enemy);
  }
  e.r.waveTime = 0.2;
  e.step(0.05);
  assert.equal(e.r.phase, "upgrade");
});
test("quota reached before countdown cannot skip the scheduled Boss", () => {
  const e = run({ bossRule: "rush", bossDelay: 45, killsPerWave: 10 });
  e.r.waveKills = 10;
  e.r.waveTime = 1;
  e.step(0.05);
  assert.equal(e.r.phase, "play");
  assert(!e.r.bossSpawned);
  e.r.waveTime = 45;
  e.step(0.05);
  assert(e.r.bossSpawned);
  assert.equal(e.r.phase, "play");
  e.killEnemy(e.r.enemies.find((x) => x.type === "boss"));
  e.step(0.05);
  assert.equal(e.r.phase, "upgrade");
  assert.equal(e.r.waveKills, 10);
});
test("killing Boss before the quota still requires the missing small enemies", () => {
  const e = run({ bossRule: "rush", killsPerWave: 10 });
  e.killEnemy(e.spawnEnemy("boss"));
  e.step(0.05);
  assert.equal(e.r.phase, "play");
  assert.equal(e.r.waveKills, 0);
  for (let i = 0; i < 10; i++) e.killEnemy(e.spawnEnemy("scout"));
  e.step(0.05);
  assert.equal(e.r.phase, "upgrade");
});
test("phase toggles work separately from Boss durability", () => {
  for (const strength of [0, 1, 2]) {
    const e = run({
      bossStrength: strength,
      bossSecondPhase: false,
      bossThirdPhase: true,
    });
    const b = e.spawnEnemy("boss");
    b.hp = b.maxHp * 0.1;
    e.updateEnemy(b, 0.02);
    assert.equal(b.phaseLevel, 1);
  }
  const e = run({ bossSecondPhase: true, bossThirdPhase: false }),
    b = e.spawnEnemy("boss");
  b.hp = b.maxHp * 0.1;
  e.updateEnemy(b, 0.02);
  assert.equal(b.phaseLevel, 2);
  const f = run({
      bossStrength: 0,
      bossSecondPhase: true,
      bossThirdPhase: true,
    }),
    c = f.spawnEnemy("boss");
  c.hp = c.maxHp * 0.29;
  f.updateEnemy(c, 0.02);
  assert.equal(c.phaseLevel, 3);
});
test("frequency changes attack intervals while density changes shot counts", () => {
  const e = run({
      bossRoster: "tyrant",
      bossFrequency: "slow",
      bossDensity: "sparse",
    }),
    b = e.spawnEnemy("boss");
  e.bossAttack(b, 0, 1);
  const sparse = e.r.enemyBullets.length,
    slow = bossCooldown(e.r, 1);
  const f = run({
      bossRoster: "tyrant",
      bossFrequency: "relentless",
      bossDensity: "extreme",
    }),
    c = f.spawnEnemy("boss");
  f.bossAttack(c, 0, 1);
  assert(f.r.enemyBullets.length > sparse);
  assert(bossCooldown(f.r, 1) < slow);
  f.r.config.bossDensity = "sparse";
  assert.equal(bossCooldown(f.r, 1), 4 / 1.8 / difficultyRule(f.r).bossRate);
  f.r.config.bossStrength = 2;
  assert.equal(bossCooldown(f.r, 1), 4 / 1.8 / difficultyRule(f.r).bossRate);
});
test("quantity modes change actual spawn pressure and honor active caps", () => {
  const totals = [];
  for (const amount of ["sparse", "normal", "dense", "swarm"]) {
    const e = run({ bossRule: "none", enemyAmount: amount });
    e.fireWeapon = () => {};
    e.r.weapons[0].cd = 1e6;
    activeStep(e, 20);
    totals.push(e.r.enemies.length);
  }
  assert(
    totals.every((v, i) => i === 0 || v > totals[i - 1]),
    JSON.stringify(totals),
  );
  const e = run({ enemyAmount: "sparse", bossRule: "rush" });
  for (let i = 0; i < 80; i++) e.spawnEnemy("scout");
  assert.equal(e.r.enemies.length, 40);
  e.spawnEnemy("boss");
  assert.equal(e.r.enemies.length, 40);
  assert(e.r.bossSpawned);
});
test("selected formations add distinct enemies before late-wave unlocks", () => {
  const e = run();
  e.r.wave = 2;
  const pools = {};
  for (const set of ["mobile", "ranged", "armored", "swarm"]) {
    e.r.config.enemySet = set;
    pools[set] = enemyPool(e.r);
  }
  assert(pools.mobile.includes("charger"));
  assert(pools.ranged.includes("gunner"));
  assert(pools.armored.includes("shield"));
  assert(pools.swarm.includes("splitter"));
});
test("healers restore nearby small enemies without healing Bosses", () => {
  const e = run(),
    h = e.spawnEnemy("healer"),
    ally = e.spawnEnemy("tank"),
    boss = e.spawnEnemy("boss");
  h.x = ally.x = boss.x = 900;
  h.y = ally.y = boss.y = 900;
  ally.hp = 1;
  boss.hp = 100;
  h.cd = 0;
  e.updateEnemy(h, 0.05);
  assert(ally.hp > 1);
  assert.equal(boss.hp, 100);
});
test("new ranged and suicide enemies give warning before attack", () => {
  const e = run(),
    g = e.spawnEnemy("gunner");
  g.cd = 0;
  e.updateEnemy(g, 0.05);
  assert.equal(e.r.enemyBullets.length, 0);
  for (let i = 0; i < 18; i++) e.updateEnemy(g, 0.05);
  assert.equal(e.r.enemyBullets.length, 3);
  const b = e.spawnEnemy("bomber");
  b.x = e.r.p.x + 50;
  b.y = e.r.p.y;
  e.updateEnemy(b, 0.05);
  assert(b.detonating);
  assert(!b.dead);
  assert(e.r.hazards.at(-1).warning > 1);
  const k = e.r.waveKills;
  for (let i = 0; i < 25; i++) e.updateEnemy(b, 0.05);
  assert(b.dead);
  assert.equal(e.r.waveKills, k);
});
test("elite off stays off in hunting waves; high mode produces champions", () => {
  const e = run({ eliteRate: "none", enemyAmount: "swarm" });
  e.r.wave = 8;
  e.r.waveType = "hunt";
  for (let i = 0; i < 100; i++) e.spawnEnemy("scout");
  assert(!e.r.enemies.some((x) => x.elite));
  const f = run({ eliteRate: "many", enemyAmount: "swarm" });
  f.r.wave = 8;
  for (let i = 0; i < 150; i++) f.spawnEnemy("scout");
  assert(f.r.enemies.some((x) => x.elite === "regenerating"));
  assert(f.r.enemies.some((x) => x.champion));
});
test("fixed and growing quotas reset correctly on each wave", () => {
  for (const growth of ["fixed", "rising"]) {
    const e = run({ quotaGrowth: growth, killsPerWave: 20 });
    e.r.waveKills = 99;
    e.setPhase("intermission");
    e.nextWave();
    assert.equal(e.r.waveKills, 0);
    assert.equal(e.r.killTarget, growth === "fixed" ? 20 : 23);
  }
});
test("v1.1 migration preserves equipment and new saves reject invalid controls", () => {
  const e = run(),
    data = JSON.parse(JSON.stringify(e.r));
  for (const key of [
    "killsPerWave",
    "quotaGrowth",
    "enemyAmount",
    "enemySet",
    "eliteRate",
    "bossDelay",
    "bossFrequency",
    "bossDensity",
    "bossSecondPhase",
    "bossThirdPhase",
  ])
    delete data.config[key];
  delete data.waveKills;
  delete data.killTarget;
  const f = new Engine(e.profile);
  assert(f.loadRun(data));
  assert.equal(f.r.p.hp, e.r.p.hp);
  assert.equal(f.r.killTarget, 24);
  assert.equal(f.r.waveKills, 0);
  assert.equal(f.r.config.bossDelay, 45);
  for (const [key, value] of [
    ["bossDelay", 0],
    ["bossFrequency", "bad"],
    ["enemyAmount", "bad"],
  ]) {
    const bad = JSON.parse(JSON.stringify(e.r));
    bad.config[key] = value;
    assert(!new Engine(e.profile).loadRun(bad));
  }
});
console.log(`${count} v1.2 behavior checks passed.`);
