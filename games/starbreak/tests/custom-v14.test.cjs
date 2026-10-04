const assert = require("node:assert/strict");
const {
  Engine,
  defaultProfile,
  DIFFICULTIES,
  bossCooldown,
  bossLayers,
  normalizeConfig,
} = require("../game.js");
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
function run(difficulty = 0, config = {}) {
  const e = new Engine(defaultProfile());
  e.newRun("scout", "campaign", difficulty, 72137, {
    bossRule: "rush",
    bossDelay: 15,
    ...config,
  });
  return e;
}
const copy = (o) => JSON.parse(JSON.stringify(o));
test("shield absorbs full hit without overflow; body damage and controls require a break", () => {
  const e = run(0, { bossShield: "heavy", shieldRecovery: "none" }),
    b = e.spawnEnemy("boss"),
    hp = b.hp;
  e.hitEnemy(b, 10, "frost", { slow: 2.5, stun: 0.8 });
  assert(b.shieldHp < b.maxShield);
  assert.equal(b.hp, hp);
  assert.equal(b.slow, 0);
  assert.equal(b.stun, 0);
  e.hitEnemy(b, 1e7);
  assert.equal(b.shieldHp, 0);
  assert.equal(b.hp, hp);
  assert.equal(b.shieldBreaks, 1);
  e.hitEnemy(b, 20, "frost", { slow: 2.5, stun: 0.8 });
  assert(b.hp < hp);
  assert.equal(b.slow, 0.875);
  assert.equal(b.stun, 0.2);
  const f = run(0, { bossShield: "none" }),
    c = f.spawnEnemy("boss");
  assert.equal(c.maxShield, 0);
  f.hitEnemy(c, 10);
  assert(c.hp < c.maxHp);
});
test("shield variants, body durability, rate, density and guard pressure scale independently", () => {
  let previous = null;
  for (const d of DIFFICULTIES) {
    const e = run(d.id),
      b = e.spawnEnemy("boss");
    const row = [
      b.maxHp,
      b.maxShield,
      1 / bossCooldown(e.r, 1),
      d.bossDensity,
      d.bossPressure,
    ];
    if (previous) row.forEach((v, i) => assert(v > previous[i]));
    previous = row;
  }
  const hp = [];
  for (const key of ["none", "light", "heavy", "fortress"]) {
    const e = run(0, { bossShield: key });
    hp.push(e.spawnEnemy("boss").maxShield);
  }
  assert(hp.every((v, i) => !i || v > hp[i - 1]));
  const a = run(4, { bossFrequency: "slow", bossDensity: "sparse" }),
    b = run(4, { bossFrequency: "relentless", bossDensity: "extreme" });
  assert(bossCooldown(a.r, 1) > bossCooldown(b.r, 1));
  assert.equal(bossLayers(a.r, 1), 3);
  assert.equal(bossLayers(b.r, 2), 4);
});
test("phase recovery is optional and does not refill every frame", () => {
  for (const recovery of ["none", "phase"]) {
    const e = run(4, { shieldRecovery: recovery, bossThirdPhase: true }),
      b = e.spawnEnemy("boss");
    b.shieldHp = 0;
    b.hp = b.maxHp * 0.49;
    e.updateEnemy(b, 0.05);
    assert.equal(b.phaseLevel, 2);
    assert.equal(
      b.shieldHp,
      recovery === "none" ? 0 : Math.round(b.maxShield * 0.7),
    );
    if (b.shieldHp) b.shieldHp -= 50;
    const shield = b.shieldHp;
    e.updateEnemy(b, 0.05);
    assert.equal(b.shieldHp, shield);
    b.hp = b.maxHp * 0.29;
    e.updateEnemy(b, 0.05);
    assert.equal(b.phaseLevel, 3);
  }
  const e = run(4, { bossSecondPhase: false, bossThirdPhase: true }),
    b = e.spawnEnemy("boss");
  b.shieldHp = 0;
  b.hp = b.maxHp * 0.1;
  e.updateEnemy(b, 0.05);
  assert.equal(b.phaseLevel, 1);
  assert.equal(b.shieldHp, 0);
});
test("timed recharge is delayed, limited and saved; no endless shield regeneration", () => {
  const e = run(0, { shieldRecovery: "recharge", bossSecondPhase: false }),
    b = e.spawnEnemy("boss");
  for (let i = 0; i < 2; i++) {
    e.hitEnemy(b, 1e7);
    assert.equal(b.shieldHp, 0);
    assert.equal(b.shieldTimer, 24);
    e.updateEnemy(b, 0.05);
    assert.equal(b.shieldHp, 0);
    b.shieldTimer = 0.01;
    e.updateEnemy(b, 0.05);
    assert.equal(b.shieldRecharges, i + 1);
    assert.equal(b.shieldHp, Math.round(b.maxShield * 0.35));
  }
  e.hitEnemy(b, 1e7);
  b.shieldTimer = 0.01;
  e.updateEnemy(b, 0.05);
  assert.equal(b.shieldHp, 0);
  assert.equal(b.shieldRecharges, 2);
  const f = new Engine(e.profile);
  assert(f.loadRun(copy(e.r)));
  assert.equal(f.r.enemies.find((x) => x.type === "boss").shieldRecharges, 2);
});
test("all four Bosses overlap bullets, hazards and guards on catastrophe", () => {
  for (const roster of ["rift", "tyrant", "queen", "core"]) {
    const e = run(4, { bossRoster: roster, bossDensity: "dense" });
    e.r.p.level = 10;
    const b = e.spawnEnemy("boss");
    e.bossAttack(b, 0, 1);
    b.guardTimer = 0;
    e.updateEnemy(b, 0.25);
    assert(e.r.enemyBullets.length > 20, roster + " bullets");
    assert(e.r.hazards.length >= 3, roster + " hazards");
    assert(
      e.r.enemies.some((x) => x.bossGuard),
      roster + " guards",
    );
    assert.equal(b.activeLayers, 3);
    const names = new Set([b.currentMove]);
    for (let i = 0; i < 4; i++) {
      e.bossAttack(b, 0.3, 1);
      names.add(b.currentMove);
    }
    assert.equal(names.size, 5);
  }
});
test("sustained barrages survive save, pause and resume with exact progress", () => {
  const e = run(3),
    b = e.spawnEnemy("boss");
  e.bossAttack(b, 0.2, 1);
  e.updateEnemy(b, 0.05);
  e.r.p.inv = 999;
  const data = copy(e.r),
    f = new Engine(e.profile);
  assert(f.loadRun(copy(data)));
  const before = copy(f.r.enemies.find((x) => x.type === "boss").barrages);
  f.step(0.05);
  assert.deepEqual(f.r.enemies.find((x) => x.type === "boss").barrages, before);
  f.resume();
  e.step(0.05);
  f.step(0.05);
  assert.deepEqual(f.r.enemies, e.r.enemies);
  assert.deepEqual(f.r.enemyBullets, e.r.enemyBullets);
  assert.deepEqual(f.r.hazards, e.r.hazards);
});
test("live Boss restores reinforcement pressure after the kill target is reached", () => {
  const e = run(4);
  e.r.waveKills = e.r.killTarget;
  e.r.spawnTimer = 0;
  e.r.waveTime = 1;
  e.r.p.inv = 999;
  e.step(0.01);
  const waiting = e.r.spawnTimer;
  e.spawnEnemy("boss");
  e.r.spawnTimer = 0;
  e.step(0.01);
  assert(e.r.spawnTimer < waiting / 4);
  assert.equal(e.r.phase, "play");
});
test("dense fire cap supports overlapping attacks and still accepts valid saves", () => {
  const e = run(4, { bossDensity: "extreme", bossFrequency: "relentless" }),
    b = e.spawnEnemy("boss");
  for (let i = 0; i < 30; i++) {
    e.bossAttack(b, 0.4, 3);
    e.updateBarrages(b, 0.3);
  }
  assert.equal(e.r.enemyBullets.length, 480);
  assert(b.barrages.length <= 8);
  assert(e.r.hazards.length <= 60);
  assert(new Engine(e.profile).loadRun(copy(e.r)));
  const before = e.r.enemyBullets.length;
  e.enemyShot(0, 0, 0);
  assert.equal(e.r.enemyBullets.length, before);
  e.killEnemy(b);
  assert.equal(e.r.enemyBullets.length, 0);
  assert(!e.r.hazards.some((h) => h.bossOwner === b.id));
});
test("legacy Bosses retain health proportion; damaged new shields never refill on reload", () => {
  const e = run(),
    b = e.spawnEnemy("boss");
  b.hp = 357;
  b.maxHp = 920;
  const data = copy(e.r);
  for (const key of ["bossShield", "shieldRecovery"]) delete data.config[key];
  const old = data.enemies.find((x) => x.type === "boss");
  for (const key of [
    "maxShield",
    "shieldHp",
    "shieldTimer",
    "shieldRecharges",
    "shieldBreaks",
    "guardTimer",
    "barrages",
    "adaptive",
  ])
    delete old[key];
  const f = new Engine(e.profile);
  assert(f.loadRun(data));
  const migrated = f.r.enemies.find((x) => x.type === "boss");
  assert(Math.abs(migrated.hp / migrated.maxHp - 357 / 920) < 1e-10);
  assert(migrated.adaptive);
  assert.equal(migrated.maxHp, migrated.adaptive.body);
  assert.equal(migrated.maxShield, migrated.adaptive.shield);
  migrated.shieldHp = 27;
  const g = new Engine(e.profile);
  assert(g.loadRun(copy(f.r)));
  assert.equal(g.r.enemies.find((x) => x.type === "boss").shieldHp, 27);
});
test("corrupt shield and barrage state is rejected, invalid new options normalize", () => {
  const e = run();
  e.spawnEnemy("boss");
  for (const patch of [
    { shieldHp: -1 },
    { shieldHp: 1e10 },
    { barrages: [{ kind: "invalid" }] },
    { barrages: Array(9).fill({}) },
  ]) {
    const bad = copy(e.r);
    Object.assign(
      bad.enemies.find((x) => x.type === "boss"),
      patch,
    );
    assert(!new Engine(e.profile).loadRun(bad));
  }
  for (const key of ["bossShield", "shieldRecovery"]) {
    const bad = copy(e.r);
    bad.config[key] = "bad";
    assert(!new Engine(e.profile).loadRun(bad));
  }
  assert.equal(normalizeConfig({ bossShield: "bad" }).bossShield, "auto");
});
test("higher difficulty shortens hit protection without changing dash invulnerability", () => {
  let prior = 1;
  for (const d of DIFFICULTIES) {
    const e = run(d.id);
    e.r.p.inv = 0;
    e.hurtPlayer(1);
    assert(e.r.p.inv <= prior);
    prior = e.r.p.inv;
    e.r.p.dashCD = 0;
    e.dash(1, 0);
    assert(e.r.p.inv >= 0.55);
  }
});
console.log(checks + " v1.4 behavior checks passed.");
