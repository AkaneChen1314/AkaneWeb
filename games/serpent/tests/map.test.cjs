const test = require("node:test");
const assert = require("node:assert/strict");
const { Game, MODES, distance } = require("../engine.js");

test("formal maps are twice as wide and tall as v4, with food spread through the new area", () => {
  for (const mode of Object.keys(MODES)) {
    const g = new Game({ mode, seed: 42 });
    const oldBound = ["arena", "boss"].includes(mode) ? 42 : 63;
    assert.equal(g.bound, oldBound * 2);
    assert.ok(g.food.some((f) => Math.abs(f.x) > oldBound));
    assert.ok(g.food.some((f) => Math.abs(f.z) > oldBound));
    assert.ok(
      g.food.every((f) => Math.abs(f.x) < g.bound && Math.abs(f.z) < g.bound),
    );
    assert.equal(
      g.foodTarget,
      Math.round(
        (g.bound * 2) ** 2 *
          (mode === "blitz" ? 0.019 : mode === "zen" ? 0.014 : 0.012),
      ),
    );
  }
});

test("new outer region supports movement and bullets until the actual boundary", () => {
  const g = new Game({ mode: "endless", seed: 9 });
  g.obstacles = [];
  g.food = [];
  g.portals = [];
  g.pads = [];
  g.zones = [];
  g.caches = [];
  g.speed = 0;
  g.spawnTimer = 100;
  g.foodTarget = 0;
  g.powerCap = 0;
  g.cacheTarget = 0;
  g.snake[0] = { x: 50, z: 50 };
  g.invulnerable = 0;
  g.projectiles = [{ x: 52, z: 50, vx: 1, vz: 0, life: 5 }];
  g.update(0.05);
  assert.equal(g.health, g.maxHealth);
  assert.equal(g.snake[0].x, 50);
  assert.equal(g.projectiles.length, 1);
  g.snake[0].x = g.bound + 1;
  g.update(0.05);
  assert.equal(g.lastDamage, null);
  assert.equal(g.health, g.maxHealth);
  assert.ok(g.snake[0].x < g.bound);
  g.projectiles[0].x = g.bound + 4;
  g.update(0.05);
  assert.equal(g.projectiles.length, 0);
});

test("spawns near map corners stay nearby and loot stays reachable", () => {
  const g = new Game({ mode: "endless", seed: 73 });
  for (const x of [-62, 62])
    for (const z of [-62, 62]) {
      g.snake[0] = { x, z };
      g.enemies = [];
      for (let i = 0; i < 30; i++) {
        const e = g.spawnEnemy();
        assert.ok(distance(e, g.snake[0]) >= 10);
        assert.ok(distance(e, g.snake[0]) <= 19);
        assert.ok(Math.abs(e.x) <= g.bound - 3 && Math.abs(e.z) <= g.bound - 3);
      }
    }
  g.food = [];
  g.spawnFood({ x: g.bound + 2, z: -g.bound - 2 });
  assert.ok(Math.abs(g.food[0].x) < g.bound && Math.abs(g.food[0].z) < g.bound);
});

test("maps contain springs, pads, portal pairs, caches and landmarks inside the walls", () => {
  for (const mode of ["survival", "arena"]) {
    const g = new Game({ mode, seed: 11 }),
      big = mode === "survival";
    assert.equal(
      g.zones.filter((z) => z.type === "spring").length,
      big ? 9 : 3,
    );
    assert.equal(g.pads.length, big ? 40 : 16);
    assert.equal(g.portals.length, big ? 10 : 4);
    g.portals.forEach((p, i) => assert.equal(g.portals[p.link].link, i));
    assert.equal(g.caches.length, big ? 24 : 10);
    assert.equal(g.obstacles.filter((o) => o.landmark).length, big ? 8 : 0);
    assert.equal(g.obstacles.filter((o) => o.pillar).length, big ? 0 : 8);
    for (const list of [g.zones, g.pads, g.portals, g.caches, g.obstacles])
      for (const o of list)
        assert.ok(Math.abs(o.x) < g.bound && Math.abs(o.z) < g.bound);
    assert.ok(g.decorations.length > (big ? 600 : 250));
  }
});

test("food is leaner than before and power-ups stay capped over time", () => {
  const g = new Game({ mode: "zen", seed: 4 });
  const s = new Game({ mode: "survival", seed: 4 });
  assert.ok(s.foodTarget / (s.bound * 2) ** 2 <= 0.0125);
  g.speed = 0;
  for (let i = 0; i < 60 * 120; i++) {
    g.update(1 / 60, {});
    if (g.needsUpgrade) g.chooseUpgrade(g.choices[0]);
    g.events.length = 0;
  }
  assert.ok(g.powerCount() <= g.powerCap);
  assert.ok(g.food.length <= g.foodLimit);
});
