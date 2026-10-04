const assert = require("node:assert/strict");
const {
  Engine,
  defaultProfile,
  DIFFICULTIES,
  WEAPONS,
  STATS,
  createBossEncounter,
  estimatePlayerPower,
  bossCooldown,
  bossLayers,
  modeRule,
  enemyPool,
} = require("../game.js");
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
const copy = (value) => JSON.parse(JSON.stringify(value));
function run(difficulty = 0, config = {}, mode = "campaign", seed = 81237) {
  const e = new Engine(defaultProfile());
  e.newRun("scout", mode, difficulty, seed, {
    bossRule: "rush",
    bossDelay: 15,
    ...config,
  });
  return e;
}
function equipEndgame(e) {
  e.r.p.level = 25;
  e.r.weapons = Object.keys(WEAPONS).map((id) => ({
    id,
    level: 5,
    evolved: true,
    cd: 0,
  }));
  for (const [id, stat] of Object.entries(STATS)) e.r.stats[id] = stat.max;
  e.r.p.maxHp += 120;
  e.r.relics = ["crit", "frost", "battery", "shield", "second", "vamp"];
}
function totalDurability(b, r) {
  const phases = r.config.bossSecondPhase
    ? r.config.bossThirdPhase
      ? 2
      : 1
    : 0;
  const recovery =
    r.config.shieldRecovery === "none"
      ? 0
      : phases * (r.difficulty >= 3 ? 0.7 : 0.55);
  const recharge =
    r.config.shieldRecovery === "recharge" ? 2 * 0.35 * (phases + 1) : 0;
  return b.body / (1 - b.armor) + b.shield * (1 + recovery + recharge);
}

test("all six starter weapons at level 1 avoid the previous 5000+ durability trap", () => {
  for (const difficulty of DIFFICULTIES)
    for (const startingWeapon of Object.keys(WEAPONS)) {
      const e = run(difficulty.id, {
        startingWeapon,
        bossStrength: 2,
        bossShield: "fortress",
        bossThirdPhase: true,
      });
      const b = createBossEncounter(e.r);
      assert(b.body + b.shield < 2500, `${difficulty.name}/${startingWeapon}`);
      assert(
        totalDurability(b, e.r) < 5000,
        `${difficulty.name}/${startingWeapon}/all phases`,
      );
      assert.equal(b.level, 1);
    }
});
test("level scaling is linear with unchanged equipment and monotonic in all difficulties", () => {
  for (const d of DIFFICULTIES) {
    const e = run(d.id),
      values = [1, 5, 9, 25].map((level) => {
        e.r.p.level = level;
        return createBossEncounter(e.r);
      });
    values.forEach((v, i) => {
      if (i) assert(v.budget > values[i - 1].budget);
    });
    assert(
      Math.abs(
        values[2].budget -
          values[1].budget -
          (values[1].budget - values[0].budget),
      ) <= 2,
    );
  }
});
test("equipment increases next encounter durability and pressure while retaining a DPS advantage", () => {
  for (const d of DIFFICULTIES) {
    const e = run(d.id),
      weak = createBossEncounter(e.r);
    equipEndgame(e);
    const strong = createBossEncounter(e.r);
    assert(strong.body > weak.body);
    assert(strong.budget > weak.budget);
    for (const key of ["rate", "density", "damage", "projectileSpeed"])
      assert(strong[key] > weak[key]);
    assert(strong.warning < weak.warning);
    assert(
      strong.offense / weak.offense > strong.budget / weak.budget,
      "upgrades remain rewarding",
    );
  }
});
test("actual gear is considered even at the same player level", () => {
  const e = run(2),
    weak = createBossEncounter(e.r);
  equipEndgame(e);
  e.r.p.level = 1;
  const strong = createBossEncounter(e.r);
  assert(strong.body > weak.body * 3);
  assert(strong.layersPenalty < weak.layersPenalty);
});
test("current health never affects scaling; defensive upgrades only apply bounded damage pressure", () => {
  const e = run(4),
    weak = createBossEncounter(e.r);
  e.r.p.hp = 1;
  assert.deepEqual(createBossEncounter(e.r), weak);
  e.r.p.maxHp = 260;
  e.r.stats.armor = 5;
  e.r.stats.regen = 5;
  e.r.relics.push("shield");
  const defensive = createBossEncounter(e.r);
  assert.equal(defensive.body, weak.body);
  assert(defensive.damage > weak.damage);
  assert(defensive.damage <= 1.2);
});
test("phase and limited recharge shields share the durability budget instead of multiplying it", () => {
  const e = run(4, { bossShield: "fortress", bossThirdPhase: true });
  for (const recovery of ["none", "phase", "recharge"]) {
    e.r.config.shieldRecovery = recovery;
    const b = createBossEncounter(e.r);
    assert(Math.abs(totalDurability(b, e.r) - b.budget) < 8);
  }
  e.r.config.shieldRecovery = "none";
  const oneBreak = createBossEncounter(e.r).body;
  e.r.config.shieldRecovery = "phase";
  assert(createBossEncounter(e.r).body < oneBreak);
});
test("upgrading during an active fight does not increase current Boss health or attack multipliers", () => {
  const e = run(4),
    b = e.spawnEnemy("boss"),
    original = copy(b.adaptive),
    hp = b.hp,
    shield = b.shieldHp;
  equipEndgame(e);
  e.updateEnemy(b, 0.05);
  assert.deepEqual(b.adaptive, original);
  assert.equal(b.hp, hp);
  assert.equal(b.shieldHp, shield);
  const next = e.spawnEnemy("boss");
  assert(next.maxHp > b.maxHp);
  assert(next.adaptive.rate > original.rate);
});
test("level 1 keeps catastrophe overlap but stronger builds unlock a third and fourth attack channel", () => {
  const e = run(4),
    low = e.spawnEnemy("boss");
  assert.equal(bossLayers(e.r, 1, low), 2);
  assert.equal(bossLayers(e.r, 2, low), 3);
  equipEndgame(e);
  const high = e.spawnEnemy("boss");
  assert.equal(bossLayers(e.r, 1, high), 3);
  assert.equal(bossLayers(e.r, 2, high), 4);
  assert(bossCooldown(e.r, 1, high) < bossCooldown(e.r, 1, low));
});
test("Boss projectiles and ground attacks use the saved player-level snapshot", () => {
  const e = run(2),
    low = e.spawnEnemy("boss");
  e.enemyShot(low.x, low.y, 0, 150, 5, 4, { boss: true, ownerId: low.id });
  e.addHazard(1000, 1000, 50, 1.2, 9999, { bossOwner: low.id });
  const shot = copy(e.r.enemyBullets.at(-1)),
    ground = copy(e.r.hazards.at(-1));
  equipEndgame(e);
  e.enemyShot(low.x, low.y, 0, 150, 5, 4, { boss: true, ownerId: low.id });
  assert.equal(e.r.enemyBullets.at(-1).damage, shot.damage);
  const high = e.spawnEnemy("boss");
  e.enemyShot(high.x, high.y, 0, 150, 5, 4, { boss: true, ownerId: high.id });
  e.addHazard(1000, 1000, 50, 1.2, 1, { bossOwner: high.id });
  assert(e.r.enemyBullets.at(-1).damage > shot.damage);
  assert(e.r.enemyBullets.at(-1).vx > shot.vx);
  assert(e.r.hazards.at(-1).damage > ground.damage);
  assert(e.r.hazards.at(-1).warning < ground.warning);
});
test("new encounter snapshots and broken shields survive reload without recomputing", () => {
  const e = run(4),
    b = e.spawnEnemy("boss");
  b.hp *= 0.7;
  b.shieldHp = 0;
  equipEndgame(e);
  const data = copy(e.r),
    f = new Engine(defaultProfile());
  assert(f.loadRun(data));
  const saved = f.r.enemies.find((x) => x.id === b.id);
  assert.equal(saved.hp, b.hp);
  assert.equal(saved.shieldHp, 0);
  assert.deepEqual(saved.adaptive, b.adaptive);
  assert.equal(f.zoomPulse, 0);
  assert.equal(f.screenPulse, 0);
});
test("legacy encounter rebases both remaining fractions once and preserves player progress", () => {
  const e = run(4),
    b = e.spawnEnemy("boss");
  b.maxHp = 5500;
  b.hp = 1650;
  b.maxShield = 6000;
  b.shieldHp = 1200;
  delete b.adaptive;
  const f = new Engine(defaultProfile());
  assert(f.loadRun(copy(e.r)));
  const saved = f.r.enemies.find((x) => x.id === b.id);
  assert(Math.abs(saved.hp / saved.maxHp - 0.3) < 1e-10);
  assert(Math.abs(saved.shieldHp / saved.maxShield - 0.2) < 1e-10);
  assert(saved.maxHp < 5500);
  assert.equal(f.r.p.hp, e.r.p.hp);
  assert.deepEqual(f.r.weapons, e.r.weapons);
  const g = new Engine(defaultProfile());
  assert(g.loadRun(copy(f.r)));
  assert.deepEqual(g.r.enemies, f.r.enemies);
});
test("all difficulties are ordered at both initial and complete builds", () => {
  for (const endgame of [false, true]) {
    let prev = null;
    for (const d of DIFFICULTIES) {
      const e = run(d.id);
      if (endgame) equipEndgame(e);
      const b = createBossEncounter(e.r);
      const row = [
        b.budget,
        b.body,
        d.bossRate * b.rate,
        d.bossDensity * b.density,
      ];
      if (prev) row.forEach((v, i) => assert(v > prev[i]));
      prev = row;
    }
  }
});
test("daily theme rotates deterministically and creates distinct combat rules", () => {
  const themes = new Set();
  for (const seed of [20261004, 20261005, 20261006]) {
    const e = run(
      1,
      { bossRoster: "tyrant", bossRule: "final", totalWaves: 8 },
      "daily",
      seed,
    );
    const theme = modeRule(e.r);
    themes.add(theme.id);
    assert.equal(modeRule(copy(e.r)).id, theme.id);
    e.r.wave = 2;
    e.prepareWave();
    assert.equal(e.r.waveType, theme.wave);
    const b = e.spawnEnemy("boss");
    if (theme.id === "ion") {
      assert(enemyPool(e.r).includes("gunner"));
      e.enemyShot(b.x, b.y, 0, 150, 5, 4, { boss: true, ownerId: b.id });
      assert(e.r.enemyBullets.at(-1).turn > 0);
    }
    if (theme.id === "swarm") {
      e.bossSummon(b, 3);
      assert(e.r.enemies.some((x) => x.bossGuard && x.type === "splitter"));
    }
    if (theme.id === "comet") {
      b.attackCycle = 1;
      e.bossAttack(b, 0, 1);
      assert(e.r.hazards.some((x) => x.warning >= 1.8));
    }
  }
  assert.equal(themes.size, 3);
});
test("endless pressure grows every eight waves and has an explicit ceiling", () => {
  const e = run(0, {}, "endless");
  const initial = createBossEncounter(e.r);
  e.r.wave = 9;
  const stageOne = createBossEncounter(e.r);
  assert(stageOne.budget > initial.budget);
  assert(stageOne.rate > initial.rate);
  e.r.wave = 41;
  const ceiling = createBossEncounter(e.r);
  e.r.wave = 401;
  assert.deepEqual(createBossEncounter(e.r), ceiling);
  assert.equal(modeRule(e.r).stage, 5);
  assert(ceiling.budget / initial.budget <= 1.301);
  assert(ceiling.rate / initial.rate <= 1.201);
});
test("cinematic events are bounded, rate-limited and do not consume RNG or alter the game clock", () => {
  const e = run(4),
    b = e.spawnEnemy("boss");
  const rng = e.r.rng,
    time = e.r.time;
  for (let i = 0; i < 800; i++)
    e.combatImpact(b.x, b.y, "blast", "#ff94c7", 99, i % 4);
  assert(e.fx.length <= 220);
  assert(e.shake <= 14);
  assert(e.zoomPulse <= 0.65);
  assert(e.screenPulse <= 0.3);
  assert.equal(e.r.rng, rng);
  assert.equal(e.r.time, time);
  e.r.time += 1;
  e.hitEnemy(b, 1e7);
  assert(e.fx.some((f) => f.type === "shockwave"));
  assert(e.shake >= 9);
  b.hp = b.maxHp * 0.49;
  e.r.time += 1;
  e.updateEnemy(b, 0.05);
  assert(e.shake >= 12);
});
test("effect preferences cannot change deterministic combat results", () => {
  const a = run(3, { bossDelay: 15 }),
    b = run(3, { bossDelay: 15 });
  a.profile.settings.effectsLevel = "full";
  b.profile.settings.effectsLevel = "none";
  b.profile.settings.shake = false;
  b.profile.settings.particles = false;
  for (let i = 0; i < 600; i++) {
    const input = { x: Math.sin(i * 0.01), y: Math.cos(i * 0.01) };
    a.step(0.05, input);
    b.step(0.05, input);
  }
  assert.deepEqual(a.r, b.r);
});
test("corrupt adaptive snapshots reject invalid pressure and non-integer level values", () => {
  const e = run(4);
  e.spawnEnemy("boss");
  for (const patch of [
    { density: 999 },
    { pressure: 0 },
    { damage: 5 },
    { level: 1.5 },
    { layersPenalty: 5 },
    { modeId: "bad" },
  ]) {
    const data = copy(e.r);
    Object.assign(data.enemies.find((x) => x.type === "boss").adaptive, patch);
    assert.equal(new Engine(defaultProfile()).loadRun(data), false);
  }
});
console.log(`${checks} v1.5 behavior checks passed.`);
