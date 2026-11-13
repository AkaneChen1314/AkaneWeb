const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine.js");
function game(mode = "survival") {
  const g = new S.Game({ mode, seed: 12 });
  g.food = [];
  g.obstacles = [];
  g.caches = [];
  g.cacheTarget = 0;
  g.zones = [];
  g.pads = [];
  g.portals = [];
  g.powerCap = 0;
  g.foodTarget = 0;
  g.speed = 0;
  g.orbitCount = 0;
  g.invulnerable = 0;
  return g;
}
function enemy(g, x, z, extra = {}) {
  const e = g.spawnEnemy();
  Object.assign(
    e,
    {
      x,
      z,
      age: 2,
      speed: 0,
      hp: 500,
      maxHp: 500,
      serpent: false,
      kind: "chaser",
    },
    extra,
  );
  return e;
}
function tick(g, n = 1, input = {}) {
  for (let i = 0; i < n; i++) {
    if (g.needsUpgrade) g.chooseUpgrade(g.choices[0]);
    g.update(0.05, input);
    g.events = [];
  }
}
test("bite is directional, bounded, deduplicates snake segments and obeys cooldown", () => {
  const g = game(),
    front = enemy(g, 0, -3, {
      serpent: true,
      body: [
        { x: 0, z: -2 },
        { x: 0, z: -3 },
      ],
    }),
    behind = enemy(g, 0, 3),
    far = enemy(g, 0, -9),
    side = enemy(g, 3, 0);
  assert.equal(g.bite(), true);
  assert.equal(front.hp, 460);
  assert.equal(behind.hp, 500);
  assert.equal(far.hp, 500);
  assert.equal(side.hp, 500);
  assert.equal(g.bite(), false);
  assert.equal(front.hp, 460);
  g.biteCooldown = 0;
  g.paused = true;
  assert.equal(g.bite(), false);
  g.paused = false;
  g.needsUpgrade = true;
  assert.equal(g.bite(), false);
});
test("ram damages an enemy, blocks contact only, and respects per-target cooldown", () => {
  const g = game(),
    e = enemy(g, 0, 0);
  g.biteCooldown = 99;
  g.update(0.01, { dash: true });
  assert.equal(e.hp, 430);
  assert.equal(g.health, 100);
  g.update(0.01, { dash: true });
  assert.equal(e.hp, 430);
  g.projectiles.push({ x: 0, z: 0, vx: 0, vz: 0, life: 1 });
  g.update(0.01, { dash: true });
  assert.equal(g.health, 86);
  assert.equal(g.lastDamage.cause, "projectile");
});
test("ram can damage a serpent tail without touching its head", () => {
  const g = game(),
    e = enemy(g, 0, -3, {
      serpent: true,
      body: Array.from({ length: 9 }, (_, i) => ({ x: 0, z: -3 + i * 0.6 })),
    });
  g.biteCooldown = 99;
  g.update(0.01, { dash: true });
  assert.equal(e.hp, 430);
  assert.equal(g.health, 100);
});
test("body counter hurts enemy once per cooldown without hurting player", () => {
  const g = game(),
    e = enemy(g, 0, 3.7);
  g.update(0.01);
  assert.equal(e.hp, 475);
  assert.equal(g.health, 100);
  g.update(0.01);
  assert.equal(e.hp, 475);
  g.time += 0.91;
  g.update(0.01);
  assert.equal(e.hp, 450);
});
test("exhausted dash loses contact protection", () => {
  const g = game();
  enemy(g, 0, 0);
  g.dash = 0;
  g.dashLocked = true;
  g.update(0.01, { dash: true });
  assert.equal(g.dashing, false);
  assert.equal(g.health, 82);
});
test("arena requires clearing four finite waves, rewards between waves, and wins once", () => {
  const g = game("arena");
  g.health = 40;
  g.invulnerable = 1e6;
  g.autoBite = () => false;
  tick(g, 160);
  assert.equal(g.wave, 1);
  assert.equal(g.waveRemaining, 0);
  assert.equal(g.enemies.length, 5);
  assert.equal(g.over, false);
  for (let i = 0; i < 1200 && !g.over; i++) {
    for (const e of g.enemies) g.damageEnemy(e, 1e5, "bite");
    tick(g);
  }
  assert.equal(g.endReason, "arena-cleared");
  assert.equal(g.won, true);
  assert.ok(g.kills >= 33);
  assert.equal(g.wave, 4);
  assert.ok(g.level >= 4);
});
test("boss mode starts immediately and requires all three named bosses", () => {
  const g = game("boss");
  g.invulnerable = 1e6;
  assert.equal(g.enemies[0].name, S.BOSSES[0].name);
  const names = [];
  for (let i = 0; i < 600 && !g.over; i++) {
    const e = g.enemies.find((e) => e.boss && !e.dead);
    if (e) {
      names.push(e.name);
      g.damageEnemy(e, 1e5, "bite");
    }
    tick(g);
  }
  assert.deepEqual(
    names,
    S.BOSSES.map((b) => b.name),
  );
  assert.equal(g.bossesDefeated, 3);
  assert.equal(g.endReason, "boss-cleared");
  assert.equal(g.won, true);
  assert.ok(g.level >= 3);
});
test("boss basic shots differ and a low-health boss jumps to its final phase", () => {
  for (let v = 0; v < 3; v++) {
    const g = game();
    const e = g.spawnEnemy(true, v);
    Object.assign(e, { age: 2, special: 99, shot: 0, x: 0, z: -10 });
    g.updateEnemy(e, 0.05);
    assert.equal(g.projectiles.length, [5, 10, 3][v]);
    e.hp = 1;
    g.updateEnemy(e, 0.05);
    assert.equal(e.phase, 3);
    assert.ok(e.roar > 0);
  }
});
test("red ground hazard waits for its warning, pauses when frozen, and hurts through dash", () => {
  const g = game();
  g.hazards = [{ x: 0, z: 0, r: 3, timer: 0.1, duration: 1.1 }];
  g.frozen = 1;
  tick(g, 2, { dash: true });
  assert.equal(g.health, 100);
  assert.equal(g.hazards[0].timer, 0.1);
  g.frozen = 0;
  tick(g, 3, { dash: true });
  assert.equal(g.health, 74);
  assert.equal(g.lastDamage.cause, "shockwave");
  assert.equal(g.hazards.length, 0);
});
test("endless continues past 180s and caps enemies, projectiles and food", () => {
  const g = game("endless");
  g.invulnerable = 1e6;
  g.time = 180;
  tick(g);
  assert.equal(g.over, false);
  assert.ok(g.enemies.some((e) => e.boss));
  for (let i = 0; i < 200; i++) g.spawnEnemy();
  assert.ok(g.enemies.length <= 45);
  for (let i = 0; i < 100; i++) g.shoot(g.enemies[0], 12, 0.2, true);
  assert.ok(g.projectiles.length <= 160);
  for (let i = 0; i < 1000; i++) g.spawnFood();
  assert.ok(g.food.length <= g.foodLimit);
});
test("training targets cannot be cleared by passive damage or the wrong action", () => {
  const g = new S.Game({ training: true, seed: 3 }),
    t = new S.Tutorial(g);
  t.step = 3;
  t.placeTarget();
  const e = t.target;
  g.areaDamage(e, 99, 999);
  assert.equal(e.dead, undefined);
  g.damageEnemy(e, 999, "ram");
  assert.equal(e.dead, undefined);
  g.damageEnemy(e, 40, "bite");
  t.update(0.01, {});
  assert.equal(t.step, 4);
});
test("new modes survive profile serialization and old saves preserve progress", () => {
  for (const mode of ["arena", "boss", "endless"]) {
    const p = S.sanitizeProfile({
      mode,
      crystals: 400,
      guideVersion: 3,
      upgrades: { vitality: 2 },
    });
    assert.equal(p.mode, mode);
    assert.equal(p.crystals, 400);
    assert.equal(p.guideVersion, 3);
    assert.equal(p.upgrades.vitality, 2);
  }
});
test("bite fires automatically when a target is in front, never behind", () => {
  const g = game(),
    front = enemy(g, 0, -3),
    behind = enemy(g, 2.2, 1.5);
  g.update(0.01);
  assert.equal(front.hp, 460);
  assert.equal(behind.hp, 500);
  const empty = game();
  empty.update(0.01);
  assert.equal(empty.biteCooldown, 0);
  assert.equal(empty.events.filter((e) => e.type === "bite").length, 0);
});
test("ram knocks small enemies back", () => {
  const g = game(),
    e = enemy(g, 0, 0);
  g.biteCooldown = 99;
  g.update(0.01, { dash: true });
  assert.ok(Math.hypot(e.x, e.z) > 2);
});
test("coil damages only enclosed enemies, eats enclosed food and needs a long enough body", () => {
  const g = game();
  g.biteCooldown = 99;
  const loop = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x: Math.cos(a) * 2, z: Math.sin(a) * 2 };
  });
  g.snake = [
    ...loop,
    ...Array.from({ length: 6 }, (_, i) => ({ x: 2 + (i + 1) * 0.5, z: 0 })),
  ];
  g.targetLength = g.snake.length;
  const inside = enemy(g, 0, 0),
    outside = enemy(g, 8, 8);
  g.food = [{ x: 0.5, z: 0.4, type: "energy", phase: 0 }];
  assert.equal(g.detectCoil(), true);
  assert.ok(inside.hp < 500 - S.COMBAT.coil);
  assert.equal(outside.hp, 500);
  assert.equal(g.food.length, 0);
  assert.equal(g.coils, 1);
  assert.equal(g.detectCoil(), false);
  const s = game();
  s.snake = loop.slice(0, 12);
  s.targetLength = 12;
  enemy(s, 0, 0);
  assert.equal(s.detectCoil(), false);
});
test("coil kills are counted for the achievement", () => {
  const g = game();
  const loop = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x: Math.cos(a) * 2, z: Math.sin(a) * 2 };
  });
  g.snake = [...loop];
  g.targetLength = 24;
  enemy(g, 0, 0, { hp: 10, maxHp: 10 });
  g.detectCoil();
  assert.equal(g.coilKills, 1);
  assert.equal(g.kills, 1);
});
test("walls and rocks never cost health and the head slides along walls", () => {
  const g = game();
  g.speed = 7;
  g.snake[0] = { x: 0, z: -g.bound + 1 };
  g.angle = g.targetAngle = -Math.PI / 2 + 0.3;
  for (let i = 0; i < 30; i++) g.update(1 / 60, { angle: -Math.PI / 2 });
  assert.equal(g.health, g.maxHealth);
  assert.ok(g.snake[0].z >= -g.bound);
  assert.ok(Math.abs(g.snake[0].x) > 0.5);
  const r = game();
  r.speed = 7;
  r.obstacles = [{ x: 0, z: -2, r: 1 }];
  for (let i = 0; i < 40; i++) r.update(1 / 60, { angle: -Math.PI / 2 });
  assert.equal(r.health, r.maxHealth);
  assert.ok(
    r.obstacles.every(
      (o) => Math.hypot(r.snake[0].x - o.x, r.snake[0].z - o.z) >= o.r + 0.5,
    ),
  );
});
test("rocks block enemy bullets", () => {
  const g = game();
  g.obstacles = [{ x: 0, z: -5, r: 1.2 }];
  g.projectiles = [{ x: 0, z: -8, vx: 0, vz: 8, life: 5 }];
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.health, g.maxHealth);
});
test("power-ups: fury, shield, speed, bomb and rainbow", () => {
  const g = game();
  g.collect({ x: 0, z: 0, type: "fury" });
  const e = enemy(g, 0, -2);
  g.update(0.01);
  assert.ok(Math.abs(e.hp - (500 - S.COMBAT.bite * 1.8)) < 1e-9);
  assert.ok(g.biteCooldown <= S.COMBAT.biteCooldown * 0.5);
  g.collect({ x: 0, z: 0, type: "shield" });
  assert.equal(g.hurt(17, "projectile"), false);
  assert.equal(g.health, g.maxHealth);
  assert.equal(g.powers.shield, 0);
  const s = game();
  s.collect({ x: 0, z: 0, type: "speed" });
  for (let i = 0; i < 30; i++) s.update(1 / 60, { dash: true });
  assert.equal(s.dash, 100);
  assert.equal(s.dashing, true);
  const b = game(),
    near = enemy(b, 3, 3),
    far = enemy(b, 20, 20);
  b.collect({ x: 0, z: 0, type: "bomb" });
  assert.equal(near.hp, 410);
  assert.equal(far.hp, 500);
  const r = game();
  r.combo = 2;
  r.comboTimer = 1;
  r.collect({ x: 0, z: 0, type: "rainbow" });
  assert.equal(r.combo, 2);
  assert.ok(r.score >= 250);
});
test("springs heal, pads boost, portals carry the whole snake", () => {
  const g = game();
  g.health = 40;
  g.zones = [{ type: "spring", x: 0, z: 0, r: 3, charge: 60, max: 60 }];
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert.ok(g.health >= 48 && g.health <= 50, g.health);
  assert.ok(g.zones[0].charge < 60);
  const p = game();
  p.speed = 5;
  p.pads = [{ x: 0, z: 0, angle: 0, cooldown: 0 }];
  p.dash = 10;
  p.update(1 / 60);
  assert.ok(p.boost > 0);
  assert.ok(p.dash >= 35);
  const t = game();
  t.portals = [
    { x: 0, z: 0, link: 1, pair: 0 },
    { x: 30, z: 30, link: 0, pair: 0 },
  ];
  const before = t.snake.map((s) => ({ ...s }));
  t.update(1 / 60);
  assert.ok(Math.hypot(t.snake[0].x - 30, t.snake[0].z - 30) < 3);
  for (let i = 1; i < t.snake.length; i++)
    assert.ok(
      Math.abs(
        S.distance(t.snake[i], t.snake[i - 1]) -
          S.distance(before[i], before[i - 1]),
      ) < 0.01,
    );
  t.update(1 / 60);
  assert.ok(Math.hypot(t.snake[0].x - 30, t.snake[0].z - 30) < 3);
});
test("caches break from automatic bites and drop loot", () => {
  const g = game();
  g.caches = [
    { x: 0, z: -2.5, r: 1, hp: 60, maxHp: 60, flash: 0, ramAt: -9, phase: 0 },
  ];
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  assert.equal(g.caches.length, 0);
  assert.ok(g.food.length + g.foodEaten >= 5);
});
test("slow ground differs per world", () => {
  const speeds = [0, 1, 2].map((world) => {
    const g = new S.Game({ world, mode: "zen", seed: 5 });
    g.obstacles = [];
    g.pads = [];
    g.portals = [];
    g.zones = [{ type: "slow", x: 0, z: 0, r: 6 }];
    g.update(1 / 60, {});
    return g.currentSpeed / g.speed;
  });
  assert.ok(Math.abs(speeds[0] - 0.6) < 1e-9);
  assert.ok(Math.abs(speeds[1] - 1.15) < 1e-9);
  assert.ok(Math.abs(speeds[2] - 0.55) < 1e-9);
});
test("combo only grows from attacks that land on monsters, and boosts kill score", () => {
  const g = game();
  g.biteCooldown = 99;
  const a = enemy(g, 5, 5),
    b = enemy(g, -5, 5);
  g.damageEnemy(a, 10, "bite");
  g.damageEnemy(b, 10, "ram");
  g.damageEnemy(a, 10, "coil");
  assert.equal(g.combo, 3);
  g.damageEnemy(a, 10);
  assert.equal(g.combo, 3);
  g.caches = [
    { x: 9, z: 9, r: 1, hp: 60, maxHp: 60, flash: 0, ramAt: -9, phase: 0 },
  ];
  g.damageCache(g.caches[0], 10, "bite");
  assert.equal(g.combo, 3);
  for (let i = 0; i < 7; i++) g.damageEnemy(b, 1, "bite");
  assert.equal(g.combo, 10);
  const before = g.score;
  g.kill(enemy(g, 9, -9), "bite");
  assert.equal(g.score - before, Math.round(80 * 1.1));
  g.comboTimer = 0;
  g.update(0.01);
  assert.equal(g.combo, 0);
  g.damageEnemy(a, 1, "bite");
  assert.equal(g.combo, 1);
  g.invulnerable = 0;
  g.hurt(5, "enemy");
  assert.equal(g.combo, 0);
});
