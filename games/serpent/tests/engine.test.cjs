"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine.js");
const make = (opts) => new S.Game({ seed: 2026, ...opts });
function step(g, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    g.update(1 / 60, input);
    if (g.needsUpgrade) g.chooseUpgrade(g.choices[0]);
  }
}

test("seeded worlds are reproducible and food avoids obstacles", () => {
  const a = make(),
    b = make();
  assert.deepEqual(a.obstacles, b.obstacles);
  assert.deepEqual(a.food, b.food);
  for (const f of a.food)
    assert.ok(a.obstacles.every((o) => S.distance(o, f) >= o.r + 0.6));
});
test("moving and growing preserves finite, connected segments", () => {
  const g = make({ mode: "zen" });
  step(g, 30, { angle: -Math.PI / 2 });
  assert.ok(g.foodEaten > 0);
  assert.ok(g.maxLength > 14);
  for (let i = 1; i < g.snake.length; i++) {
    assert.ok(Number.isFinite(g.snake[i].x));
    assert.ok(S.distance(g.snake[i], g.snake[i - 1]) <= 0.531);
  }
});
test("pause and evolution stop the clock and movement", () => {
  const g = make();
  g.paused = true;
  const initial = JSON.stringify(g.snake);
  g.update(0.05, { angle: 1 });
  assert.equal(g.time, 0);
  assert.equal(JSON.stringify(g.snake), initial);
  g.paused = false;
  g.xp = g.nextXP;
  g.checkLevel();
  assert.ok(g.needsUpgrade);
  assert.equal(new Set(g.choices).size, 3);
  g.update(0.05);
  assert.equal(g.time, 0);
  assert.equal(g.chooseUpgrade("not-an-offer"), false);
  assert.equal(g.chooseUpgrade(g.choices[0]), true);
  g.update(0.02);
  assert.ok(g.time > 0);
});
test("collection applies combo bonus, healing, crystals and XP", () => {
  const g = make();
  g.health = 30;
  g.collect({ x: 0, z: 0, type: "heal" });
  assert.equal(g.health, 50);
  g.collect({ x: 0, z: 0, type: "crystal" });
  assert.equal(g.crystals, 1);
  assert.equal(g.xp, 7);
  // Eating never touches the combo, and food score ignores it.
  g.combo = 19;
  g.comboTimer = 1;
  const score = g.score;
  g.collect({ x: 0, z: 0, type: "energy" });
  assert.equal(g.score - score, 10);
  assert.equal(g.combo, 19);
  const fresh = make();
  fresh.collect({ x: 0, z: 0, type: "energy" });
  fresh.collect({ x: 0, z: 0, type: "fruit" });
  assert.equal(fresh.combo, 0);
});
test("dash drains, locks at zero and recharges on release", () => {
  const g = make({ mode: "zen" });
  g.food = [];
  g.obstacles = [];
  g.pads = [];
  g.portals = [];
  g.zones = [];
  step(g, 3, { dash: true, angle: 0 });
  assert.ok(g.dashLocked);
  assert.equal(g.dashing, false);
  step(g, 2, { dash: false, angle: Math.PI / 2 });
  assert.equal(g.dashLocked, false);
  assert.ok(g.dash > 0);
});
test("all four special abilities differ and respect cooldowns", () => {
  for (let i = 0; i < 4; i++) {
    const g = make({ character: i });
    g.health = 40;
    g.enemies = [{ x: 1, z: 1, r: 0.6, hp: 50, maxHp: 50 }];
    assert.equal(g.useSkill(), true);
    assert.equal(g.useSkill(), false);
    assert.ok(g.cooldown > 0);
    if (i === 0) assert.equal(g.health, 52);
    if (i === 1) assert.ok(g.enemies[0].dead);
    if (i === 2) assert.equal(g.frozen, 5);
    if (i === 3) {
      g.invulnerable = 0;
      g.hurt(100);
      assert.equal(g.health, 40);
    }
  }
});
test("damage has immunity frames and zen never takes damage", () => {
  const g = make();
  g.invulnerable = 0;
  g.hurt(18);
  assert.equal(g.health, 82);
  g.hurt(18);
  assert.equal(g.health, 82);
  g.invulnerable = 0;
  g.hurt(100);
  assert.equal(g.over, true);
  assert.equal(g.won, false);
  const z = make({ mode: "zen" });
  z.invulnerable = 0;
  z.hurt(9999);
  assert.equal(z.health, z.maxHealth);
  assert.equal(z.over, false);
});
test("survival boss appears at 120 seconds and victory at 180", () => {
  const g = make();
  g.time = 119.99;
  g.update(1 / 60);
  assert.equal(g.bossSpawned, true);
  assert.ok(g.enemies.some((e) => e.boss));
  g.time = 179.99;
  g.update(1 / 60);
  assert.equal(g.over, true);
  assert.equal(g.won, true);
});
test("blitz ends at 120 seconds and has denser food", () => {
  const g = make({ mode: "blitz" }),
    s = make();
  assert.equal(g.foodTarget, Math.round((g.bound * 2) ** 2 * 0.019));
  assert.equal(g.bound, 126);
  assert.ok(
    g.food.length >= g.foodTarget && g.food.length <= g.foodTarget + 20,
  );
  assert.ok(g.foodTarget > s.foodTarget);
  g.time = 119.99;
  g.update(1 / 60);
  assert.ok(g.won);
});
test("frozen enemies and projectiles do not move", () => {
  const g = make({ character: 2 });
  g.food = [];
  g.spawnEnemy();
  const e = g.enemies[0];
  e.age = 2;
  const pos = { x: e.x, z: e.z };
  g.projectiles = [{ x: 20, z: 20, vx: 3, vz: 3, life: 7 }];
  g.useSkill();
  g.update(0.05);
  assert.equal(e.x, pos.x);
  assert.equal(e.z, pos.z);
  assert.equal(g.projectiles[0].x, 20);
});
test("boss death awards loot exactly once", () => {
  const g = make();
  g.spawnEnemy(true);
  const boss = g.enemies[0];
  g.kill(boss);
  assert.equal(g.bossKilled, true);
  assert.equal(g.kills, 1);
  assert.equal(g.crystals, 20);
  const score = g.score;
  g.kill(boss);
  assert.equal(g.score, score);
  assert.equal(g.kills, 1);
});
test("permanent upgrades charge once and enforce funds and cap", () => {
  const p = S.defaultProfile();
  assert.equal(S.buyUpgrade(p, "vitality"), false);
  p.crystals = 1000;
  for (let i = 0; i < 5; i++) assert.equal(S.buyUpgrade(p, "vitality"), true);
  assert.equal(S.buyUpgrade(p, "vitality"), false);
  assert.equal(p.crystals, 550);
  assert.equal(make({ upgrades: p.upgrades }).maxHealth, 150);
});
test("settlement is idempotent and persists history and achievements", () => {
  const p = S.defaultProfile(),
    g = make();
  g.score = 900;
  g.crystals = 7;
  g.end(true);
  const r = S.settle(p, g);
  assert.equal(r.reward, 50);
  assert.equal(p.crystals, 50);
  assert.equal(p.runs, 1);
  assert.ok(p.achievements.includes("first"));
  assert.ok(p.achievements.includes("survivor"));
  assert.equal(S.settle(p, g), null);
  assert.equal(p.runs, 1);
});
test("malformed profile and stored text are sanitized", () => {
  const p = S.sanitizeProfile({
    crystals: -100,
    selected: Infinity,
    world: 80,
    mode: "x",
    upgrades: { vitality: 99 },
    history: [{ score: 10, mode: "<script>", character: 0, world: 0 }],
    settings: { volume: 20, quality: "bad" },
    achievements: ["first", "<script>", "first"],
  });
  assert.equal(p.crystals, 0);
  assert.equal(p.selected, 3);
  assert.equal(p.world, 2);
  assert.equal(p.mode, "survival");
  assert.equal(p.upgrades.vitality, 5);
  assert.equal(p.history.length, 0);
  assert.deepEqual(p.achievements, ["first"]);
  assert.equal(p.settings.volume, 1);
});
test("long simulated sessions keep collections bounded and state finite", () => {
  const g = make({ mode: "zen" });
  for (let i = 0; i < 60 * 600; i++) {
    g.update(1 / 60, {
      angle: Math.sin(i / 300) * Math.PI,
      dash: i % 180 < 60,
    });
    if (g.needsUpgrade) g.chooseUpgrade(g.choices[0]);
    if (i % 1000 === 0) g.useSkill();
    g.events.length = 0;
  }
  assert.ok(g.time > 599);
  assert.equal(g.over, false);
  assert.ok(g.snake.length <= 160);
  assert.ok(g.particles.length <= 360);
  assert.ok(g.food.length <= g.foodLimit);
  assert.ok(Number.isFinite(g.score));
  assert.ok(g.snake.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)));
});

function collisionGame() {
  const g = make();
  g.invulnerable = 0;
  g.speed = 0;
  g.food = [];
  g.obstacles = [];
  g.portals = [];
  g.pads = [];
  g.zones = [];
  g.caches = [];
  return g;
}
test("enemy touching player body does not hurt the player", () => {
  const g = collisionGame();
  g.spawnEnemy(false, 0, "chaser");
  const e = g.enemies[0];
  Object.assign(e, { x: g.snake[7].x, z: g.snake[7].z, speed: 0, age: 2 });
  g.update(0.01);
  assert.equal(g.health, g.maxHealth);
  assert.equal(g.lastDamage, null);
});
test("head-to-head collision reports damage, source and lost segments", () => {
  const g = collisionGame();
  g.spawnEnemy(false, 0, "chaser");
  Object.assign(g.enemies[0], {
    x: 0,
    z: 0,
    speed: 0,
    age: 2,
    hp: 500,
    maxHp: 500,
  });
  g.update(0.01);
  assert.equal(g.health, g.maxHealth - S.DAMAGE.enemy.amount);
  assert.equal(g.lastDamage.cause, "enemy");
  assert.equal(g.lastDamage.lostSegments, 3);
  assert.equal(g.events.find((e) => e.type === "hurt").amount, 18);
});
test("own body and enemy tail can cross the player head safely", () => {
  const g = collisionGame();
  g.snake[6] = { ...g.snake[0] };
  g.spawnEnemy(false, 0, "chaser");
  Object.assign(g.enemies[0], {
    x: 10,
    z: 10,
    speed: 0,
    age: 2,
    serpent: true,
    body: Array.from({ length: 9 }, () => ({ x: 0, z: 0 })),
  });
  g.update(0.01);
  assert.equal(g.health, g.maxHealth);
});
test("enemy projectiles only damage the player head", () => {
  const g = collisionGame();
  g.projectiles = [{ x: 0, z: 4, vx: 0, vz: 0, life: 4 }];
  g.update(0.01);
  assert.equal(g.health, g.maxHealth);
  g.projectiles.push({ x: 0, z: 0, vx: 0, vz: 0, life: 4 });
  g.update(0.01);
  assert.equal(g.health, g.maxHealth - S.DAMAGE.projectile.amount);
  assert.equal(g.lastDamage.cause, "projectile");
});
test("fatal damage is distinguished from voluntary settlement", () => {
  const g = collisionGame();
  g.health = 5;
  g.hurt(17, "projectile");
  assert.equal(g.endReason, "defeated");
  assert.equal(g.lastDamage.amount, 5);
  const quit = make();
  quit.end(false, "retired");
  assert.equal(quit.endReason, "retired");
  assert.equal(quit.lastDamage, null);
});
test("immunity never overwrites the last real damage explanation", () => {
  const g = collisionGame();
  g.hurt(17, "projectile");
  g.hurt(30, "boss");
  assert.equal(g.lastDamage.cause, "projectile");
  assert.equal(g.lastDamage.amount, 17);
  assert.equal(g.events.filter((e) => e.type === "hurt").length, 1);
});
test("obstacle centre collision resolves without trapping the head or costing health", () => {
  const g = collisionGame();
  g.obstacles = [{ x: 0, z: 0, r: 1 }];
  g.update(0.01);
  assert.ok(Math.hypot(g.snake[0].x, g.snake[0].z) > 1.5);
  assert.equal(g.lastDamage, null);
  assert.equal(g.health, g.maxHealth);
});
test("eight-step tutorial requires real actions and finishes without rewards", () => {
  const g = make({ training: true, mode: "survival" }),
    t = new S.Tutorial(g);
  assert.equal(g.mode, "zen");
  assert.equal(g.food.length, 0);
  assert.equal(g.obstacles.length, 0);
  const tick = (input) => {
    g.update(1 / 60, input);
    t.update(1 / 60, input);
  };
  for (let i = 0; i < 60 && t.step === 0; i++) tick({ angle: 0 });
  assert.equal(t.step, 1);
  for (let i = 0; i < 240 && t.step === 1; i++) tick({ angle: g.angle });
  assert.equal(t.step, 2);
  for (let i = 0; i < 40 && t.step === 2; i++) tick({ dash: true });
  assert.equal(t.step, 3);
  t.action("skill");
  assert.equal(t.step, 3);
  // Step 3 has no attack input at all: approaching is enough because biting is automatic.
  for (let i = 0; i < 180 && t.step === 3; i++) tick({ angle: g.angle });
  assert.equal(t.step, 4);
  for (let i = 0; i < 180 && t.step === 4; i++) {
    const e = t.target;
    tick({
      dash: true,
      angle: Math.atan2(e.z - g.snake[0].z, e.x - g.snake[0].x),
    });
  }
  assert.equal(t.step, 5);
  // Step 5: orbit the target until the head crosses its own body.
  for (let i = 0; i < 900 && t.step === 5; i++) {
    const e = t.target,
      h = g.snake[0],
      r = Math.hypot(h.x - e.x, h.z - e.z),
      out = Math.atan2(h.z - e.z, h.x - e.x);
    tick({ angle: out + Math.PI / 2 + (r - 2) * 0.6 });
  }
  assert.equal(t.step, 6);
  assert.equal(g.useSkill(), true);
  t.action("skill");
  assert.equal(t.step, 7);
  assert.equal(g.needsUpgrade, true);
  assert.equal(g.chooseUpgrade(g.choices[0]), true);
  t.action("upgrade");
  assert.equal(t.completed, true);
  assert.equal(g.paused, true);
  const profile = S.defaultProfile();
  g.end(true);
  assert.equal(S.settle(profile, g), null);
  assert.equal(profile.runs, 0);
  assert.equal(profile.crystals, 0);
});
test("tutorial does not skip tasks due to unrelated actions or elapsed time", () => {
  const g = make({ training: true }),
    t = new S.Tutorial(g);
  t.action("skill");
  t.action("upgrade");
  for (let i = 0; i < 120; i++) {
    g.update(1 / 60);
    t.update(1 / 60, {});
  }
  assert.equal(t.step, 0);
  g.paused = true;
  t.update(1, { angle: 0 });
  assert.equal(t.step, 0);
});
test("old saves retain currency, achievements and upgrades with new guide fields", () => {
  const p = S.sanitizeProfile({
    version: 1,
    crystals: 123,
    runs: 4,
    upgrades: { vitality: 2 },
    achievements: ["first"],
    settings: { control: "keyboard" },
  });
  assert.equal(p.settings.control, "auto");
  assert.equal(p.crystals, 123);
  assert.equal(p.upgrades.vitality, 2);
  assert.deepEqual(p.achievements, ["first"]);
  assert.equal(p.guideVersion, 0);
  assert.equal(p.tutorialCompleted, false);
  p.guideVersion = 2;
  p.tutorialCompleted = true;
  assert.equal(
    S.sanitizeProfile(JSON.parse(JSON.stringify(p))).tutorialCompleted,
    true,
  );
});
