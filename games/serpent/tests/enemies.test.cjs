"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../engine.js");

function arena(difficulty = "normal", mode = "survival") {
  const g = new S.Game({ mode, seed: 21, difficulty });
  Object.assign(g, {
    food: [],
    obstacles: [],
    caches: [],
    cacheTarget: 0,
    zones: [],
    pads: [],
    portals: [],
    powerCap: 0,
    foodTarget: 0,
    speed: 0,
    orbitCount: 0,
    invulnerable: 0,
    spawnTimer: 1e9,
  });
  return g;
}
function foe(g, kind, x, z, extra = {}) {
  const e = g.spawnEnemy(false, 0, kind, { x, z });
  Object.assign(e, { age: 2 }, extra);
  return e;
}
function run(g, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    g.update(1 / 60, input);
    if (g.needsUpgrade) g.chooseUpgrade(g.choices[0]);
  }
}

test("difficulty changes the monster roster, enemy stats, incoming damage and arena waves", () => {
  const easy = arena("easy"),
    normal = arena("normal"),
    hard = arena("hard");
  for (const g of [easy, normal, hard]) g.wave = 4;
  assert.deepEqual(easy.enemyPool().sort(), [
    "chaser",
    "ranged",
    "serpent",
    "splitter",
    "swarm",
  ]);
  assert.ok(
    ["charger", "bomber", "shield"].every((k) =>
      normal.enemyPool().includes(k),
    ),
  );
  assert.ok(
    !normal.enemyPool().includes("sniper") &&
      !normal.enemyPool().includes("healer"),
  );
  assert.equal(hard.enemyPool().length, 10);
  const e1 = easy.spawnEnemy(false, 0, "chaser", { x: 5, z: 5 }),
    e3 = hard.spawnEnemy(false, 0, "chaser", { x: 5, z: 5 });
  assert.ok(e3.maxHp > e1.maxHp * 1.6);
  assert.ok(e3.speed > e1.speed);
  easy.hurt(18, "enemy");
  hard.hurt(18, "enemy");
  assert.equal(easy.health, easy.maxHealth - 13);
  assert.equal(hard.health, hard.maxHealth - 23);
  assert.equal(
    new S.Game({ mode: "arena", difficulty: "easy", seed: 1 }).waveRemaining,
    4,
  );
  assert.equal(
    new S.Game({ mode: "arena", difficulty: "hard", seed: 1 }).waveRemaining,
    6,
  );
  assert.ok(
    S.DIFFICULTIES.easy.warn > S.DIFFICULTIES.normal.warn &&
      S.DIFFICULTIES.normal.warn > S.DIFFICULTIES.hard.warn,
  );
});

test("new monsters are announced when a wave introduces them", () => {
  const g = arena("normal");
  assert.deepEqual(g.newKinds(2).sort(), ["分裂蟲", "群蜂", "衝鋒甲蟲"].sort());
  assert.deepEqual(g.newKinds(3).sort(), ["盾甲蟲", "自爆蟲"].sort());
});

test("swarms arrive as packs and splitters split into minis", () => {
  const g = arena("normal");
  assert.ok(g.spawnPack("swarm").length >= 4);
  for (const [difficulty, n] of [
    ["normal", 2],
    ["hard", 3],
  ]) {
    const s = arena(difficulty),
      e = foe(s, "splitter", 8, -8);
    s.damageEnemy(e, 1e4, "ram");
    assert.equal(s.enemies.filter((x) => x.kind === "mini").length, n);
  }
});

test("shield beetles block bites until a ram breaks the shield", () => {
  const g = arena(),
    e = foe(g, "shield", 0, -2.5, { hp: 500, maxHp: 500, speed: 0 });
  g.update(1 / 60);
  assert.equal(e.hp, 490);
  e.x = 0;
  e.z = -1;
  g.update(1 / 60, { dash: true });
  assert.ok(e.shieldBreak > 0);
  assert.equal(e.hp, 420);
  g.biteCooldown = 0;
  e.x = 0;
  e.z = -2.5;
  g.update(1 / 60);
  assert.equal(e.hp, 380);
});

test("bombers arm near you, explode after the fuse and also hurt nearby enemies", () => {
  const g = arena();
  g.biteCooldown = 1e9;
  const b = foe(g, "bomber", 2, 0, { speed: 0 }),
    other = foe(g, "chaser", 3.5, 0, { speed: 0, hp: 500, maxHp: 500 });
  g.update(1 / 60);
  assert.ok(b.fuse > 0);
  run(g, 1.1);
  assert.equal(b.dead, true);
  assert.equal(g.lastDamage.cause, "explosion");
  assert.equal(g.health, g.maxHealth - 24);
  assert.ok(other.hp <= 440);
  const k = arena();
  k.biteCooldown = 1e9;
  const b2 = foe(k, "bomber", 2, 0, { speed: 0 });
  k.update(1 / 60);
  k.damageEnemy(b2, 999, "ram");
  run(k, 1.2);
  assert.equal(k.health, k.maxHealth);
});

test("chargers telegraph, charge in a locked line, then stay stunned and take extra damage", () => {
  const g = arena();
  g.biteCooldown = 1e9;
  g.invulnerable = 1e9;
  const c = foe(g, "charger", 0, -8, { cooldown: 0, hp: 500, maxHp: 500 });
  g.update(1 / 60);
  assert.ok(c.windup > 0);
  const lock = c.chargeAngle;
  run(g, 0.95);
  assert.ok(c.charge > 0);
  assert.equal(c.chargeAngle, lock);
  run(g, 0.7);
  assert.ok(c.stunned > 0);
  const hp = c.hp;
  g.damageEnemy(c, 40, "ram");
  assert.equal(hp - c.hp, 60);
});

test("healers restore nearby allies", () => {
  const g = arena();
  g.biteCooldown = 1e9;
  foe(g, "healer", 0, -11, { special: 0 });
  const ally = foe(g, "chaser", 1, -12, { speed: 0 });
  ally.hp = 1;
  g.update(1 / 60);
  assert.ok(ally.hp > ally.maxHp * 0.29);
});

test("snipers aim with a laser before firing a fast shot", () => {
  const g = arena("hard");
  g.biteCooldown = 1e9;
  const s = foe(g, "sniper", 0, -14, { cooldown: 0 });
  g.update(1 / 60);
  assert.ok(s.aim > 0);
  assert.equal(g.projectiles.length, 0);
  run(g, s.aimMax + 0.05);
  const shot = g.projectiles.find((p) => p.kind === "snipe");
  assert.ok(shot);
  assert.ok(Math.hypot(shot.vx, shot.vz) > 20);
});

test("bosses have three phases, roar invulnerably between them and keep fighting", () => {
  const g = arena(),
    b = g.spawnEnemy(true, 0);
  Object.assign(b, { x: 0, z: -12, age: 2 });
  b.hp = b.maxHp * 0.6;
  g.update(1 / 60);
  assert.equal(b.phase, 2);
  assert.ok(b.roar > 0);
  assert.ok(g.hazards.some((h) => h.type === "ring"));
  assert.equal(g.damageEnemy(b, 10, "bite"), false);
  b.roar = 0;
  b.hp = b.maxHp * 0.3;
  g.update(1 / 60);
  assert.equal(b.phase, 3);
});

test("every boss move produces its own attack", () => {
  const check = {
    quake: (g) => g.hazards.some((h) => h.cause === "shockwave"),
    fissure: (g) => g.hazards.some((h) => h.type === "line"),
    rockfall: (g) =>
      g.hazards.filter((h) => h.cause === "rockfall").length >= 4,
    magma: (g) => g.hazards.some((h) => h.type === "ring"),
    brood: (g) => g.enemies.some((e) => e.minion),
    miasma: (g) => g.hazards.some((h) => h.type === "pool"),
    spiral: (g) => g.projectiles.length > 10,
    guard: (g, b) => b.guard > 0 && g.enemies.some((e) => e.minion),
    charge: (g, b) => b.windup > 0 || b.charge > 0 || b.stunned > 0,
    thunder: (g) => g.hazards.some((h) => h.cause === "lightning"),
    laser: (g) => g.hazards.some((h) => h.type === "beam"),
    pulse: (g) => g.hazards.some((h) => h.type === "ring"),
  };
  S.BOSSES.forEach((def, v) =>
    def.moves.forEach((move) => {
      const g = arena();
      g.invulnerable = 1e9;
      const b = g.spawnEnemy(true, v);
      Object.assign(b, {
        x: 0,
        z: -12,
        age: 2,
        phase: 3,
        special: 99,
        shot: 99,
      });
      g.startCast(b, g.snake[0], move);
      run(g, 0.5);
      assert.ok(check[move](g, b), `${def.name} ${move}`);
    }),
  );
});

test("the queen guard reduces damage while her minions live", () => {
  const g = arena(),
    b = g.spawnEnemy(true, 1);
  Object.assign(b, { x: 0, z: -12, age: 2, hp: 1000, maxHp: 1000 });
  g.startCast(b, g.snake[0], "guard");
  g.damageEnemy(b, 100, "ram");
  assert.equal(b.hp, 965);
  for (let k = 0; k < 5; k++)
    for (const m of g.enemies.filter((e) => e.minion && !e.dead))
      g.damageEnemy(m, 1e5, "ram");
  g.damageEnemy(b, 100, "ram");
  assert.equal(b.hp, 865);
});

test("rings can be dashed through, lasers sweep and poison pools tick", () => {
  const ring = () => ({
    type: "ring",
    x: 0,
    z: -5,
    radius: 4.6,
    speed: 6,
    maxR: 20,
    width: 0.85,
    damage: 20,
    cause: "ring",
  });
  const g = arena();
  g.hazards.push(ring());
  run(g, 0.3, { dash: true });
  assert.equal(g.health, g.maxHealth);
  const h = arena();
  h.hazards.push(ring());
  run(h, 0.3);
  assert.equal(h.lastDamage.cause, "ring");
  const b = arena(),
    owner = { x: 0, z: -6, dead: false };
  b.hazards.push({
    type: "beam",
    owner,
    x: 0,
    z: -6,
    start: Math.PI / 2 - 1,
    sweep: 2,
    angle: Math.PI / 2 - 1,
    length: 24,
    width: 1.1,
    timer: 0,
    duration: 1,
    active: 2,
    activeMax: 2,
    damage: 20,
    cause: "laser",
  });
  run(b, 1.2);
  assert.equal(b.lastDamage.cause, "laser");
  const p = arena();
  p.hazards.push({
    type: "pool",
    x: 0,
    z: 0,
    r: 2.4,
    timer: 0,
    duration: 0.6,
    active: 3,
    damage: 10,
    cause: "poison",
  });
  run(p, 1.5);
  assert.equal(p.health, p.maxHealth - 20);
});

test("hard bosses unlock their big moves one phase earlier and have more health", () => {
  const n = new S.Game({ seed: 3, difficulty: "normal" }),
    h = new S.Game({ seed: 3, difficulty: "hard" });
  const bn = n.spawnEnemy(true, 2),
    bh = h.spawnEnemy(true, 2);
  assert.deepEqual(n.bossMoves(bn), ["charge", "thunder"]);
  assert.deepEqual(h.bossMoves(bh), ["charge", "thunder", "laser", "pulse"]);
  assert.ok(bh.maxHp > bn.maxHp);
});

test("difficulty is saved with the profile and run history", () => {
  const p = S.sanitizeProfile({
    difficulty: "hard",
    history: [
      {
        score: 10,
        time: 5,
        mode: "arena",
        character: 0,
        world: 0,
        difficulty: "easy",
      },
    ],
  });
  assert.equal(p.difficulty, "hard");
  assert.equal(p.history[0].difficulty, "easy");
  assert.equal(
    S.sanitizeProfile({ difficulty: "nightmare" }).difficulty,
    "normal",
  );
  const g = new S.Game({ mode: "arena", difficulty: "hard", seed: 2 });
  g.end(true, "arena-cleared");
  const prof = S.defaultProfile(),
    r = S.settle(prof, g);
  assert.equal(prof.history[0].difficulty, "hard");
  assert.ok(prof.achievements.includes("hard"));
  assert.ok(r.reward >= 30);
});
