const { Engine, defaultProfile, WEAPONS, DIFFICULTIES, STATS } = require(
  process.env.STARBREAK_ENGINE || "../game.js",
);
const scenario = process.argv[2] || "ships";
const mode = process.env.STARBREAK_MODE || "campaign";
const trial =
  scenario === "boss-legacy"
    ? {
        totalWaves: 8,
        killsPerWave: 14,
        quotaGrowth: "fixed",
        enemyAmount: "sparse",
        bossDelay: 30,
        bossRule: "rush",
        bossRoster: "cycle",
        finalBoss: false,
      }
    : {
        totalWaves: 8,
        killsPerWave: 14,
        quotaGrowth: "fixed",
        enemyAmount: "normal",
        eliteRate: "many",
        bossDelay: 30,
        bossRule: "rush",
        bossRoster: "cycle",
        bossStrength: 1,
        bossFrequency: "fast",
        bossDensity: "dense",
        bossShield: "fortress",
        shieldRecovery: "phase",
        bossThirdPhase: true,
        finalBoss: false,
      };
const cases =
  scenario === "boss-endgame"
    ? ["rift", "tyrant", "queen", "core"].map((roster) => ({
        ship: "scout",
        difficulty: 4,
        config: { ...trial, bossRoster: roster, totalWaves: 8 },
      }))
    : scenario.startsWith("boss-")
      ? DIFFICULTIES.map((d) => ({
          ship: "scout",
          difficulty: d.id,
          config: trial,
        }))
      : scenario === "loadouts"
        ? Object.keys(WEAPONS).map((weapon) => ({
            ship: "scout",
            difficulty: 0,
            config: { startingWeapon: weapon },
          }))
        : scenario === "difficulties"
          ? DIFFICULTIES.map((d) => ({
              ship: "scout",
              difficulty: d.id,
              config: {},
            }))
          : ["scout", "bulwark", "storm"].map((ship) => ({
              ship,
              difficulty: 0,
              config: {},
            }));
for (const { ship, difficulty, config } of cases) {
  const profile = defaultProfile();
  if (process.env.STARBREAK_RESEARCH === "max")
    profile.research = {
      hull: 5,
      reactor: 5,
      thruster: 5,
      magnet: 5,
      repair: 5,
      fortune: 5,
    };
  const e = new Engine(profile);
  e.newRun(
    ship,
    mode,
    difficulty,
    Number(process.env.STARBREAK_SEED) || 81237,
    config,
  );
  if (scenario === "boss-endgame") {
    const r = e.r;
    r.p.level = 25;
    r.wave = 8;
    e.prepareWave();
    r.waveTime = r.config.bossDelay;
    r.weapons = Object.keys(WEAPONS).map((id) => ({
      id,
      level: 5,
      evolved: true,
      cd: 0,
    }));
    for (const [key, stat] of Object.entries(STATS)) r.stats[key] = stat.max;
    r.p.maxHp += 120;
    r.p.hp = r.p.maxHp;
    r.relics = ["crit", "frost", "battery", "shield", "second", "vamp"];
    r.p.xpNeed = 1e7;
    e.spawnEnemy("boss");
  }
  let count = 0,
    peakBullets = 0,
    peakHazards = 0,
    peakEnemies = 0;
  const fights = [],
    observed = new Set();
  while (e.r.phase !== "result" && count++ < 36000) {
    const r = e.r,
      p = r.p;
    peakBullets = Math.max(peakBullets, r.enemyBullets.length);
    peakHazards = Math.max(peakHazards, r.hazards.length);
    peakEnemies = Math.max(peakEnemies, r.enemies.length);
    for (const b of r.enemies.filter((x) => x.type === "boss"))
      if (!observed.has(b.id)) {
        observed.add(b.id);
        fights.push({ b, wave: r.wave, start: r.time, duration: null });
      }
    for (const fight of fights)
      if (fight.b.dead && fight.duration === null)
        fight.duration = +(r.time - fight.start).toFixed(1);
    if (r.phase === "upgrade") {
      const scored = r.offers.map((c, i) => {
        let n =
          c.kind === "evolve"
            ? 100
            : c.kind === "weapon"
              ? 45
              : c.kind === "heal"
                ? 5
                : 20;
        const owned = r.weapons.find((w) => w.id === c.id);
        if (owned) n += 15 + owned.level * 2;
        if (c.id === "regen") n += 15;
        if (c.id === "armor") n += 10;
        if (c.id === "fire" || c.id === "damage") n += 12;
        if (c.id === "hp") n += p.hp / p.maxHp < 0.5 ? 50 : 15;
        if (c.kind === "heal" && p.hp / p.maxHp < 0.35) n = 98;
        return { i, n };
      });
      scored.sort((a, b) => b.n - a.n);
      e.chooseUpgrade(scored[0].i);
      continue;
    }
    if (r.phase === "relic") {
      const preference = ["vamp", "shield", "second", "harvest", "growth"];
      let i = r.relicOffers.findIndex((x) => preference.includes(x.id));
      e.chooseRelic(i < 0 ? 0 : i);
      continue;
    }
    if (r.phase === "route") {
      let i = r.routeOffers.findIndex((x) => x.id === "nebula");
      e.chooseRoute(i < 0 ? 0 : i);
      continue;
    }
    if (r.phase === "event") {
      e.chooseEvent(1);
      continue;
    }
    if (r.phase === "intermission") {
      if (p.hp < p.maxHp * 0.55) e.repair();
      e.nextWave();
      continue;
    }
    let tx = 1200,
      ty = 1200;
    const gems = r.gems
      .filter((g) => Math.hypot(g.x - p.x, g.y - p.y) < 350)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      );
    if (gems[0]) {
      tx = gems[0].x;
      ty = gems[0].y;
    } else {
      const target = e.closest(p.x, p.y, 1200);
      if (target) {
        const a = Math.atan2(p.y - target.y, p.x - target.x) + 0.45;
        const range =
          r.weapons.length === 1
            ? r.weapons[0].id === "orbit"
              ? 75
              : r.weapons[0].id === "nova"
                ? 100
                : 200
            : 200;
        tx = target.x + Math.cos(a) * range;
        ty = target.y + Math.sin(a) * range;
      } else {
        tx = p.x + Math.cos(r.time * 0.35) * 100;
        ty = p.y + Math.sin(r.time * 0.35) * 100;
      }
    }
    let dx = tx - p.x,
      dy = ty - p.y;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    let danger = false;
    for (const z of [...r.enemies, ...r.enemyBullets]) {
      const d = Math.hypot(p.x - z.x, p.y - z.y),
        radius = z.type === "boss" ? 115 : 65;
      if (d < radius && d > 0) {
        const force = ((radius - d) / radius) * 3;
        dx += ((p.x - z.x) / d) * force;
        dy += ((p.y - z.y) / d) * force;
        if (d < z.radius + 30) danger = true;
      }
    }
    for (const z of r.hazards) {
      if (z.shape === "beam") {
        const vx = p.x - z.x,
          vy = p.y - z.y,
          along = vx * Math.cos(z.angle) + vy * Math.sin(z.angle),
          side = vx * Math.sin(z.angle) - vy * Math.cos(z.angle);
        if (
          along >= -40 &&
          along < z.length + 40 &&
          Math.abs(side) < z.width + 70
        ) {
          const sign = side >= 0 ? 1 : -1;
          dx += Math.sin(z.angle) * sign * 4;
          dy -= Math.cos(z.angle) * sign * 4;
          danger = true;
        }
      } else {
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < z.radius + 55 && d > 0) {
          dx += ((p.x - z.x) / d) * 4;
          dy += ((p.y - z.y) / d) * 4;
          danger = true;
        }
      }
    }
    if (p.x < 100) dx += 2;
    if (p.x > 2300) dx -= 2;
    if (p.y < 100) dy += 2;
    if (p.y > 2300) dy -= 2;
    if (danger) e.dash(dx, dy);
    if (
      r.enemies.filter((z) => Math.hypot(z.x - p.x, z.y - p.y) < 280).length >
        7 ||
      p.hp < p.maxHp * 0.35
    )
      e.burst();
    e.step(0.05, { x: dx, y: dy });
  }
  for (const fight of fights)
    if (fight.b.dead && fight.duration === null)
      fight.duration = +(e.r.time - fight.start).toFixed(1);
  console.log(
    JSON.stringify({
      ship,
      mode,
      difficulty,
      bossRoster: e.r.config.bossRoster,
      startingWeapon: e.r.startWeapon,
      wave: e.r.wave,
      win: e.r.result?.win ?? null,
      status: e.r.result ? "finished" : "timeout",
      bosses: e.r.bosses,
      peakBullets,
      peakHazards,
      peakEnemies,
      bossSeconds: fights.map(
        (f) => f.duration ?? "alive:" + Math.round(e.r.time - f.start),
      ),
      time: Math.round(e.r.time),
      kills: e.r.kills,
      hp: Math.round(e.r.p.hp),
      level: e.r.p.level,
      evolved: e.r.evolutions,
      weapons: e.r.weapons.map((x) => x.id + ":" + x.level),
      stats: e.r.stats,
    }),
  );
}
