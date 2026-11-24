/*
 * 測試：兩張地圖各自的任務、指揮官與勝利文字。
 */
import assert from "node:assert/strict";
import { createHarness } from "./test-harness.mjs";

// 每張地圖：代號、區域名稱、指揮官名稱。
for (const [map, zone, commander] of [
  [0, "港區", "港區指揮官"],
  [1, "工廠", "工廠指揮官"],
]) {
  const h = createHarness();
  h.run(
    `
      builtMap = ${map};
      gameState = "playing";
      selectedMode = 0;
      matchTotalEnemies = 12;
      defeatedEnemies = 2;
      updateMissionStatus(2000, true);
    `,
  );
  assert.match(
    h.nodes.get("#objectiveText").textContent,
    new RegExp(`肅清${zone}`),
  );
  h.run(`
    createEnemy(15, 15, 0x556677, 0, "boss");
    updateBossHUD();
  `);
  assert.equal(h.run("enemies[0].userData.state.rankLabel"), commander);
  assert.equal(h.nodes.get("#bossName").textContent, `WARLORD // ${commander}`);
  h.run("endGame(true);");
  assert.equal(h.nodes.get("#resultTitle").textContent, `${zone}已肅清`);
}
console.log(
  "PASS both maps use their own objective, commander and victory names",
);
