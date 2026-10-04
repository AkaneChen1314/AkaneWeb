"use strict";
const assert = require("node:assert/strict");
const {
  Engine,
  defaultProfile,
  SHIPS,
  WEAPONS,
  WEAPON_LOADOUTS,
  DIFFICULTIES,
  startingHp,
  launchPreview,
  rewardMultiplier,
  bossRuleText,
  bossCooldown,
} = require("../game.js");
let checks = 0;
function test(n, fn) {
  fn();
  checks++;
  console.log("PASS", n);
}
function run(difficulty = 0, config = {}) {
  const e = new Engine(defaultProfile());
  e.newRun("scout", "campaign", difficulty, 21222, config);
  return e;
}
test("Boss summaries and actual schedules agree in all four rules", () => {
  for (const rule of ["interval", "rush", "final", "none"]) {
    const e = run(0, { bossRule: rule, totalWaves: 8, bossEvery: 4 });
    const text = bossRuleText(e.r.config, "campaign");
    if (rule === "rush") assert.equal(text, "每波 Boss");
    if (rule === "none") assert.equal(text, "無 Boss");
    if (rule === "final") assert.equal(text, "最後一波 Boss");
    if (rule === "interval") assert(text.startsWith("每 4 波 Boss"));
  }
});
test("all six starting weapons apply actual health tradeoffs", () => {
  for (const ship of SHIPS)
    for (const weapon of Object.keys(WEAPONS)) {
      const e = new Engine(defaultProfile());
      e.newRun(ship.id, "campaign", 0, 14, { startingWeapon: weapon });
      assert.equal(e.r.weapons[0].id, weapon);
      assert.equal(e.r.startWeapon, weapon);
      assert.equal(e.r.p.maxHp, startingHp(ship, weapon));
      assert.equal(e.r.p.hp, e.r.p.maxHp);
      assert.equal(e.r.p.maxHp, launchPreview(e.profile, ship, e.r.config).hp);
    }
  const e = run(0, { startingWeapon: "lightning" });
  assert(e.r.p.maxHp < 100);
  const before = e.r.p.maxHp;
  e.applyUpgrade({ kind: "weapon", id: "missile" });
  assert.equal(e.r.p.maxHp, before);
});
test("standard ship health is preserved while custom loadouts change it", () => {
  for (const ship of SHIPS) {
    const e = new Engine(defaultProfile());
    e.newRun(ship.id);
    assert.equal(e.r.p.maxHp, ship.hp);
  }
});
test("launch preview includes research, real equipped module and mutator", () => {
  for (const mod of ["medic", "reactor", "vector", "aegis"]) {
    const p = defaultProfile();
    p.moduleOwned = [mod];
    p.moduleEquipped = mod;
    p.research = { hull: 3, thruster: 2 };
    const e = new Engine(p),
      ship = SHIPS[1];
    e.newRun(ship.id, "campaign", 0, 17, {
      startingWeapon: "missile",
      mutator: "glass",
    });
    const preview = launchPreview(p, ship, e.r.config);
    assert.equal(e.r.p.hp, preview.hp);
    assert.equal(
      Math.round(
        e.r.p.speed *
          (1 + e.r.stats.speed * 0.1 + e.r.research.thruster * 0.03),
      ),
      preview.speed,
    );
    assert.equal(e.r.stats.armor * 8, preview.armor);
  }
});
test("difficulty changes actual enemies, incoming damage and projectile speed", () => {
  const hp = [],
    speed = [],
    damage = [],
    shots = [];
  for (const d of DIFFICULTIES) {
    const e = run(d.id),
      enemy = e.r.enemies[0];
    hp.push(enemy.maxHp);
    speed.push(enemy.speed);
    e.r.p.inv = 0;
    e.hurtPlayer(10);
    damage.push(e.r.p.maxHp - e.r.p.hp);
    e.enemyShot(0, 0, 0, 100);
    shots.push(e.r.enemyBullets[0].vx);
    assert.equal(enemy.maxHp, (16 + 4.2) * d.hp);
    assert.equal(e.r.enemyBullets[0].vx, 100 * d.shot);
  }
  for (const values of [hp, speed, damage, shots])
    assert(values.every((v, i) => i === 0 || v > values[i - 1]));
});
test("difficulty scales spawn pressure and warning windows independently", () => {
  const times = [],
    warnings = [];
  for (const d of DIFFICULTIES) {
    const e = run(d.id, { bossRule: "none" });
    e.r.spawnTimer = 0;
    e.step(0.01);
    times.push(e.r.spawnTimer);
    e.addHazard(100, 100, 30, 1, 20);
    warnings.push(e.r.hazards[0].warning);
    assert.equal(warnings.at(-1), d.warning);
  }
  assert(times.every((v, i) => i === 0 || v < times[i - 1]));
  assert(warnings.every((v, i) => i === 0 || v < warnings[i - 1]));
});
test("elite off remains off and Boss interval/frequency choices stay independent", () => {
  for (const d of DIFFICULTIES) {
    const e = run(d.id, {
      eliteRate: "none",
      bossEvery: 7,
      bossDelay: 90,
      bossFrequency: "slow",
      bossDensity: "sparse",
    });
    e.r.wave = 8;
    e.r.waveType = "hunt";
    for (let i = 0; i < 20; i++) e.spawnEnemy("scout");
    assert(!e.r.enemies.some((x) => x.elite));
    assert.equal(e.r.config.bossDelay, 90);
    assert.equal(e.r.config.bossEvery, 7);
    assert.equal(bossCooldown(e.r, 1), 4 / 0.7 / d.bossRate);
  }
});
test("difficulty controls wave healing and reward, once per settlement", () => {
  for (const d of DIFFICULTIES) {
    const e = run(d.id, { bossRule: "none" });
    e.r.p.hp = 10;
    e.completeWave();
    assert.equal(e.r.p.hp, 10 + e.r.p.maxHp * d.heal);
    assert.equal(
      rewardMultiplier(d.id, e.r.config, "campaign"),
      d.reward * 0.85,
    );
    e.r.gold = 100;
    e.finish(false);
    const credit = e.profile.credits;
    e.finish(false);
    assert.equal(e.profile.credits, credit);
  }
});
test("new saves preserve custom starting choice; old runs keep existing health", () => {
  const e = run(0, { startingWeapon: "missile" }),
    old = JSON.parse(JSON.stringify(e.r));
  delete old.config.startingWeapon;
  delete old.startWeapon;
  const f = new Engine(defaultProfile());
  assert(f.loadRun(old));
  assert.equal(f.r.p.hp, 90);
  assert.equal(f.r.startWeapon, "missile");
  assert.equal(f.r.config.startingWeapon, "ship");
  const bad = JSON.parse(JSON.stringify(e.r));
  bad.config.startingWeapon = "bad";
  assert(!new Engine(defaultProfile()).loadRun(bad));
});
console.log(`${checks} v1.3 behavior checks passed.`);
