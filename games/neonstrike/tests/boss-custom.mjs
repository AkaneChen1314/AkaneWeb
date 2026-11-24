/*
 * 測試：自訂首領的血量、移速與攻擊力。
 */
import assert from "node:assert/strict";
import { createHarness } from "./test-harness.mjs";

const tests = [];
// 登記一項測試。
const test = (name, run) => tests.push({ name, run });

// 三項設定各自影響首領的實際數值。
test("Boss health, speed and attack power settings independently affect its actual stats", () => {
  const h = createHarness();
  h.run(`
    Math.random = () => 0.5;
    gameState = "lobby";
    missionSettings = {
      ...missionSettings,
      bossHealth: 1200,
      bossSpeed: 3.2,
      bossPower: 2,
    };
    const custom = createEnemy(0, 0, 0x555555, 0, "boss");
    missionSettings = {
      ...missionSettings,
      bossHealth: 700,
      bossSpeed: 1,
      bossPower: 1,
    };
    const normal = createEnemy(10, 0, 0x555555, 1, "boss");
    const soldier = createEnemy(20, 0, 0x555555, 2, "standard");
  `);
  assert.equal(h.run("custom.userData.state.maxHealth"), 1200);
  assert.equal(h.run("normal.userData.state.maxHealth"), 700);
  assert.ok(
    Math.abs(
      h.run("custom.userData.state.speed / normal.userData.state.speed") - 3.2,
    ) < 1e-8,
  );
  assert.equal(h.run("custom.userData.state.damageMultiplier"), 2.48);
  assert.equal(h.run("soldier.userData.state.maxHealth"), 100);
});

// 攻擊力只套用一次。
test("boss attack power scales telegraphed blast damage and applies only once", () => {
  const h = createHarness();
  h.run(`
    gameState = "lobby";
    missionSettings = { ...missionSettings, bossPower: 2 };
    const boss = createEnemy(0, 0, 0x555555, 0, "boss");
    gameState = "playing";
    yaw.position.set(4, 1.68, 0);
    let damage = 0;
    takeDamage = (amount) => (damage += amount);
    blastReaches = () => true;
    const zone = { radius: 5, hitPlayer: false },
      attack = { owner: boss },
      point = new THREE.Vector3(4, 1.18, 0);
    applyBossZoneDamage(attack, zone, point, 30);
    applyBossZoneDamage(attack, zone, point, 30);
  `);
  assert.equal(h.run("damage"), 60);
  assert.equal(h.run("zone.hitPlayer"), true);
});

// 高速首領在低畫面更新率下也不會穿過薄牆。
test("high-speed boss cannot cross a thin wall at low frame rates", () => {
  const h = createHarness();
  h.run(`
    gameState = "lobby";
    missionSettings = { ...missionSettings, bossSpeed: 3.2 };
    const boss = createEnemy(0, 0, 0x555555, 0, "boss");
    yaw.position.set(40, 1.68, 40);
    addBox(0, 2, -1, 80, 4, 0.04, 0x555555);
    moveBot(boss, 0, -1, 0.5);
  `);
  assert.ok(
    h.run("boss.position.z") >= -0.43,
    "the boss must remain on the near side of the wall",
  );
});

// 使用這一場開始時的設定。
test("custom settings are taken from the active match snapshot", () => {
  const h = createHarness();
  h.run(`
    missionSettings = {
      ...missionSettings,
      bossHealth: 2000,
      bossSpeed: 1.75,
      bossPower: 1.5,
    };
    activeEncounter = { settings: { ...missionSettings } };
    gameState = "playing";
    missionSettings.bossHealth = 350;
    missionSettings.bossSpeed = 0.75;
    missionSettings.bossPower = 0.75;
    const boss = createEnemy(0, 0, 0x555555, 0, "boss");
  `);
  assert.equal(h.run("boss.userData.state.maxHealth"), 2000);
  assert.equal(h.run("boss.userData.state.bossPower"), 1.5);
});

// 首領的粒子特效有數量上限，也會消失。
test("boss burst effects respect the particle budget and expire", () => {
  const h = createHarness();
  h.run(`
    qualityIndex = 1;
    createBossBurst(new THREE.Vector3(), 2);
  `);
  assert.equal(h.run("particles.length"), 8);
  h.run("updateEffects(.5);");
  assert.equal(h.run("particles.length"), 0);
});

for (const item of tests) {
  item.run();
  console.log(`PASS ${item.name}`);
}
console.log(`\n${tests.length}/${tests.length} custom boss checks passed.`);
