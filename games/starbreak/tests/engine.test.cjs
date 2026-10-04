const assert = require("node:assert/strict");
const { Engine, defaultProfile, WEAPONS, STATS } = require("../game.js");
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
check("fixed seeds reproduce enemy layout and upgrade draws", () => {
  const a = new Engine(defaultProfile()),
    b = new Engine(defaultProfile());
  a.newRun("scout", "daily", 0, 20261004);
  b.newRun("scout", "daily", 0, 20261004);
  assert.deepEqual(a.r.enemies, b.r.enemies);
  a.offerUpgrades("wave");
  b.offerUpgrades("wave");
  assert.deepEqual(a.r.offers, b.r.offers);
});
check("all six evolution recipes are attainable and actionable", () => {
  for (const [id, w] of Object.entries(WEAPONS)) {
    const e = new Engine(defaultProfile());
    e.newRun();
    e.r.weapons = [{ id, level: 5, evolved: false, cd: 0 }];
    e.r.stats[w.req] = 2;
    e.offerUpgrades("level");
    e.r.pendingLevels = 1;
    const i = e.r.offers.findIndex((c) => c.kind === "evolve" && c.id === id);
    assert(i >= 0);
    e.chooseUpgrade(i);
    assert.equal(e.r.weapons[0].evolved, true);
    assert.equal(e.r.phase, "play");
  }
});
check("a boss wave cannot advance just because its timer expires", () => {
  const e = new Engine(defaultProfile());
  e.newRun();
  e.r.wave = 4;
  e.r.waveTime = 51;
  e.r.p.inv = 100;
  e.step(0.02);
  assert.equal(e.r.phase, "play");
  assert(e.r.enemies.some((x) => x.type === "boss"));
  e.r.waveKills = e.r.killTarget;
  const boss = e.r.enemies.find((x) => x.type === "boss");
  e.hitEnemy(boss, 1e7);
  e.hitEnemy(boss, 1e7);
  e.step(0.02);
  assert.equal(e.r.phase, "upgrade");
  assert.equal(e.r.bosses, 1);
});
check("paused and reward screens do not advance active battle time", () => {
  const e = new Engine(defaultProfile());
  e.newRun();
  e.pause();
  const t = e.r.time;
  e.step(0.05, { x: 1, y: 0 });
  assert.equal(e.r.time, t);
  e.resume();
  e.offerUpgrades("wave");
  e.step(0.05);
  assert.equal(e.r.time, t);
});
check("death, retreat and achievements settle exactly once", () => {
  const p = defaultProfile(),
    e = new Engine(p);
  e.newRun();
  e.r.kills = 100;
  e.r.gold = 88;
  e.finish(false);
  const total = p.credits;
  e.finish(false);
  assert.equal(p.credits, total);
  assert.equal(p.kills, 100);
  assert(p.achievements.includes("first"));
  assert.equal(p.records.length, 1);
});
check("research is snapshotted at launch", () => {
  const p = defaultProfile(),
    e = new Engine(p);
  e.newRun();
  const mult = e.damageMult("pulse");
  p.research.reactor = 5;
  assert.equal(e.damageMult("pulse"), mult);
  e.newRun();
  assert(e.damageMult("pulse") > mult);
});
check("valid saves resume paused and reject corrupt weapon data", () => {
  const e = new Engine(defaultProfile());
  e.newRun();
  for (let i = 0; i < 100; i++) e.step(0.02, { x: 1, y: 0 });
  const data = JSON.parse(JSON.stringify(e.r)),
    f = new Engine(defaultProfile());
  assert(f.loadRun(data));
  assert.equal(f.r.phase, "paused");
  f.resume();
  assert.equal(f.r.phase, "play");
  data.weapons[0].id = "unknown";
  assert.equal(new Engine(defaultProfile()).loadRun(data), false);
});
check("intermission repair cannot overspend", () => {
  const e = new Engine(defaultProfile());
  e.newRun();
  e.r.phase = "intermission";
  e.r.gold = 10;
  e.r.p.hp = 1;
  assert.equal(e.repair(), false);
  e.r.gold = 25;
  assert.equal(e.repair(), true);
  assert.equal(e.r.gold, 0);
  assert(e.r.p.hp > 1);
});
check(
  "complete 16-wave campaign transitions and save each choice phase",
  () => {
    const p = defaultProfile(),
      e = new Engine(p);
    e.newRun("storm", "campaign", 0, 1234567);
    const phases = new Set();
    let steps = 0;
    while (e.r.phase !== "result" && steps++ < 75000) {
      const r = e.r;
      phases.add(r.phase);
      if (r.phase !== "play") {
        const saved = JSON.parse(JSON.stringify(r)),
          f = new Engine(p);
        assert(f.loadRun(saved), `load phase ${r.phase}`);
      }
      if (r.phase === "upgrade") {
        let i = r.offers.findIndex((x) => x.kind === "evolve");
        if (i < 0) i = r.offers.findIndex((x) => x.kind === "weapon");
        e.chooseUpgrade(i >= 0 ? i : 0);
      } else if (r.phase === "relic") e.chooseRelic(0);
      else if (r.phase === "route") e.chooseRoute(0);
      else if (r.phase === "event") e.chooseEvent(1);
      else if (r.phase === "intermission") e.nextWave();
      else if (r.phase === "play") {
        r.p.inv = 99;
        const angle = r.time * 0.2;
        e.step(0.05, { x: Math.cos(angle), y: Math.sin(angle) });
        if (r.wave % 4 === 0 && r.waveTime > 48) {
          const boss = r.enemies.find((x) => x.type === "boss");
          if (boss) e.hitEnemy(boss, 1e7);
        }
      }
    }
    assert.equal(e.r.phase, "result");
    assert.equal(e.r.result.win, true);
    assert.equal(e.r.wave, 16);
    assert.equal(e.r.bosses, 4);
    assert.equal(p.wins, 1);
    for (const phase of ["upgrade", "relic", "route", "event", "intermission"])
      assert(phases.has(phase));
    console.log(
      "Campaign simulation:",
      JSON.stringify({
        seconds: e.r.time,
        kills: e.r.kills,
        phases: [...phases],
        steps,
      }),
    );
  },
);
console.log(`${checks} meaningful engine checks passed.`);
check("maxed-out endless runs still offer a valid saveable reward", () => {
  const e = new Engine(defaultProfile());
  e.newRun("scout", "endless", 0, 72);
  e.r.weapons = Object.keys(WEAPONS).map((id) => ({
    id,
    level: 5,
    evolved: true,
    cd: 0,
  }));
  for (const [k, s] of Object.entries(STATS)) e.r.stats[k] = s.max;
  e.r.pendingLevels = 1;
  e.offerUpgrades("level");
  assert.equal(e.r.offers.length, 1);
  assert(new Engine(defaultProfile()).loadRun(JSON.parse(JSON.stringify(e.r))));
  e.chooseUpgrade(0);
  assert.equal(e.r.phase, "play");
});
