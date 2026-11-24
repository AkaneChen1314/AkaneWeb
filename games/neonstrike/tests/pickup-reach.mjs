/*
 * 測試：補給要在同一高度、沒有牆擋住才撿得到。
 */
import assert from "node:assert/strict";
import { createHarness } from "./test-harness.mjs";

// 隔著牆撿不到。
const h = createHarness();
h.run(`
  gameState = "playing";
  health = 50;
  yaw.position.set(0, eyeHeight, 0);
  createPickup("medkit", 1, 0, 0);
  collisionBoxes.push(
    new THREE.Box3(
      new THREE.Vector3(0.45, 0, -1),
      new THREE.Vector3(0.55, 2, 1),
    ),
  );
  updatePickups(0.05, 1000);
`);
assert.equal(
  h.run("health"),
  50,
  "a nearby wall prevents collecting through cover",
);
assert.equal(h.run("pickups[0].active"), true);
assert.match(
  h.run("ui.pickupPrompt.querySelector('b').textContent"),
  /前往補給所在位置/,
);
// 高度差太多也撿不到。
h.run(
  `
    collisionBoxes.length = 0;
    yaw.position.y = eyeHeight + 2;
    updatePickups(0.05, 1050);
  `,
);
assert.equal(
  h.run("health"),
  50,
  "a pickup far below the player is not automatically collected",
);
assert.equal(h.run("pickups[0].active"), true);
// 走得到就能正常回復。
h.run(`
  yaw.position.y = eyeHeight;
  updatePickups(0.05, 1100);
`);
assert.equal(h.run("health"), 95, "an accessible pickup still heals normally");
assert.equal(h.run("pickups[0].active"), false);
console.log("PASS pickups require a reachable height and an unobstructed path");
