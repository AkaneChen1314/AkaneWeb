/*
 * 測試：切換地圖時，場景、碰撞、補給、區域與敵人都會重建。
 */
import assert from "node:assert/strict";
import { createHarness } from "./test-harness.mjs";

// 先建立港區。
const h = createHarness();
h.run("buildSelectedArena(0);");
assert.equal(h.run("builtMap"), 0);
assert.equal(h.run("pickups.length"), 16);
assert.ok(h.run("scene.children.some(item=>item.name==='harbor-wayfinding')"));
// 換成熔火工廠；舊地圖要移除。
const old = h.run("arenaObjects[0]");
assert.equal(h.run("setSelectedMap(1)"), true);
assert.equal(h.storage.get("neonMap"), "1");
h.run("prepareSelectedMap();");
assert.equal(h.run("builtMap"), 1);
assert.equal(old.parent, null, "the previous map is removed");
assert.equal(
  h.run("scene.children.some(item=>item.name==='harbor-wayfinding')"),
  false,
);
assert.equal(h.run("pickups.length"), 16);
assert.equal(h.run("explosiveBarrels.length"), 6);
assert.match(h.run("getZoneName(0,0)"), /REACTOR/);
assert.equal(h.run("isPositionBlocked(0,0)"), true, "the reactor is solid");
assert.equal(
  h.run("isPositionBlocked(0,65)"),
  false,
  "the deployment point remains open",
);
assert.equal(
  h.run(
    `
      pickups.every(
        (item) =>
          !collisionBoxes.some((box) =>
            bodyOverlapsCollider(
              box,
              item.root.position.x,
              item.root.position.z,
              0.35,
              0.15,
              1.4,
            ),
          ),
      );
    `,
  ),
  true,
  "all supply placements remain accessible",
);
// 來回切換不會留下舊資料。
h.run("setSelectedMap(0);prepareSelectedMap();");
assert.equal(h.run("builtMap"), 0);
assert.ok(h.run("scene.children.some(item=>item.name==='harbor-wayfinding')"));
h.run("setSelectedMap(1);prepareSelectedMap();");
assert.equal(h.run("pickups.length"), 16);
assert.equal(h.run("explosiveBarrels.length"), 6);
// 敵人出生在可以走的位置。
h.run("matchTotalEnemies=12;spawnEnemies(12);");
assert.equal(h.run("enemies.length"), 12);
assert.equal(
  h.run(
    "enemies.every(enemy=>!isBotBlocked(enemy.position.x,enemy.position.z,enemy))",
  ),
  true,
);
assert.equal(h.run("setSelectedMap(99)"), false);
// 戰鬥中不能換地圖。
h.run("gameState='playing';");
assert.equal(
  h.run("setSelectedMap(0)"),
  false,
  "active matches retain their map",
);
console.log(
  "PASS map switching rebuilds the arena, collisions, supplies, zones and enemy spawns",
);
