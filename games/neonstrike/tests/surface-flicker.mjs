/*
 * 測試：貼得太近的表面不會互相閃爍。
 */
import assert from "node:assert/strict";
import { createHarness, THREE } from "./test-harness.mjs";

// 鐵路區的護欄條紋要略高於護欄，但不能浮空。
const harbor = createHarness();
harbor.run(`
  buildSelectedArena(0);
  scene.updateMatrixWorld(true);
`);
const barriers = harbor.run(
  "scene.children.filter(object=>object.name==='rail-yard-barrier')",
);
const stripes = harbor.run(
  "scene.children.filter(object=>object.name==='rail-yard-barrier-stripe')",
);
assert.equal(barriers.length, 2);
assert.equal(stripes.length, 2);
for (const barrier of barriers) {
  const stripe = stripes.find((item) => item.position.x === barrier.position.x);
  assert.ok(stripe, "each barrier has its stripe");
  const baseBounds = new THREE.Box3().setFromObject(barrier),
    stripeBounds = new THREE.Box3().setFromObject(stripe);
  const separation = stripeBounds.max.y - baseBounds.max.y;
  assert.ok(
    separation >= 0.01 && separation < 0.03,
    "paint lies slightly above the top instead of sharing its depth",
  );
  assert.ok(
    stripeBounds.min.y < baseBounds.max.y,
    "paint is attached rather than floating",
  );
}

// 每個木箱只有一條綁帶，不會重疊。
for (const map of [0, 1]) {
  const h = createHarness();
  h.run(`buildSelectedArena(${map});`);
  const bands = h.run(
    "scene.children.filter(object=>object.name==='crate-band')",
  );
  assert.ok(bands.length > 0, "arena has crate detail");
  const locations = new Set(
    bands.map(
      (band) => `${band.position.x},${band.position.y},${band.position.z}`,
    ),
  );
  assert.equal(
    locations.size,
    bands.length,
    "each crate has one band instead of coincident rotated duplicates",
  );
}
console.log(
  "PASS rail-yard stripes are separated from their supporting surface",
);
console.log("PASS crate bands do not overlap on either map");
