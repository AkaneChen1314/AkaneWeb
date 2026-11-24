/*
 * 測試：地標的細節（車廂文字、油桶警示與管橋）。
 */
import assert from "node:assert/strict";
import { createHarness, THREE } from "./test-harness.mjs";

// 港區車廂兩側都要有看得清楚的文字。
const harbor = createHarness();
harbor.run(`
  buildSelectedArena(0);
  scene.updateMatrixWorld(true);
`);
const labels = [];
harbor.run("scene").traverse((item) => {
  if (item.name === "harbor-rail-label") labels.push(item);
});
assert.equal(
  labels.length,
  4,
  "both rail cars need a readable label on each side",
);
// 文字貼在貨櫃上，不重疊閃爍，也不增加射線目標。
for (const label of labels) {
  assert.equal(
    label.parent.userData.container,
    true,
    "the label is attached to its container",
  );
  assert.ok(
    Math.abs(label.position.x) >
      label.parent.geometry.parameters.width / 2 + 0.04,
    "the label clears the ribs and cannot z-fight",
  );
  assert.ok(
    !harbor.run("worldRayTargets()").includes(label),
    "decorative lettering does not add a second shot collider",
  );
}
// 兩張地圖的油桶警示要貼著桶身，並避開金屬箍。
for (const map of [0, 1]) {
  const h = createHarness();
  h.run(`
    buildSelectedArena(${map});
    scene.updateMatrixWorld(true);
  `);
  const barrels = Array.from(h.run("explosiveBarrels"));
  assert.ok(barrels.length > 0);
  for (const barrel of barrels) {
    const warning = barrel.getObjectByName("barrel-warning");
    assert.ok(warning);
    const p = warning.geometry.parameters;
    assert.equal(warning.geometry.type, "CylinderGeometry");
    assert.ok(
      p.radiusTop > 0.43 && p.radiusTop < 0.46 && p.openEnded,
      "warning follows the barrel without protruding",
    );
    assert.ok(
      warning.position.y - p.height / 2 > 0.64 + 0.035 &&
        warning.position.y + p.height / 2 < 1.12 - 0.035,
      "marking clears the metal hoops",
    );
  }
}
// 熔火工廠的管橋：有柱子支撐，底下可以通行。
const foundry = createHarness();
foundry.run(`
  buildSelectedArena(1);
  scene.updateMatrixWorld(true);
`);
const bridges = foundry.run(
  "scene.children.filter(item=>item.name==='foundry-pipe-bridge')",
);
assert.equal(bridges.length, 2);
for (const bridge of bridges) {
  const bounds = new THREE.Box3().setFromObject(bridge);
  for (const x of [-11, 11]) {
    const support = foundry.run(
      `
        worldMeshes.find(
          (item) =>
            Math.abs(item.position.x - ${x}) < 0.001 &&
            Math.abs(item.position.z - ${bridge.position.z}) < 0.001 &&
            Math.abs(item.position.y - 2.6) < 0.001,
        );
      `,
    );
    assert.ok(
      support &&
        bounds
          .clone()
          .expandByScalar(0.01)
          .intersectsBox(new THREE.Box3().setFromObject(support)),
      "each pipe meets its columns",
    );
  }
  assert.equal(
    foundry.run(`isPositionBlocked(0,${bridge.position.z})`),
    false,
    "pipe does not obstruct walking under it",
  );
  assert.ok(
    foundry.run(
      `
        collisionBoxes.some(
          (box) =>
            box.min.y > 4 &&
            bodyOverlapsCollider(box, 0, ${bridge.position.z}, 0.1, 4.5, 4.8),
        );
      `,
    ),
    "pipe can block projectiles at its height",
  );
}
console.log(
  "PASS harbor rail labels are attached and readable from both sides",
);
console.log(
  "PASS barrel warnings follow the surface and clear its hoops on both maps",
);
console.log(
  "PASS foundry pipe bridges have supports and preserve the lane beneath",
);
