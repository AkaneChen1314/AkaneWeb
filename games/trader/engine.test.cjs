"use strict";
const assert = require("node:assert/strict");
require("./engine.js");
const E = globalThis.BillionEngine;
function loan(s, amount, type = "bank") {
  return E.borrow(
    s,
    amount,
    type,
    false,
    type === "bank" ? null : { id: s.fictionId, signedName: s.playerName, contacts: true },
  );
}
function chat(s) {
  while ((s.pending.turn || 0) < 3) assert(E.collectorReply(s, "answer").ok);
}
function resolve(s, style = "safe") {
  const p = s.pending;
  if (p.type === "glitch") return E.resolveGlitch(s);
  if (p.type === "survival")
    return E.choose(s, style === "shark" && E.loanLimit(s, "shark") >= 10000 ? 1 : 0);
  if (p.type === "debt") {
    chat(s);
    const l = s.loans.find((x) => x.id === p.loanId);
    return E.choose(
      s,
      s.cash >= l.balance
        ? 0
        : style === "organs" && s.organs.length < 3
          ? 2
          : style === "shark"
            ? 3
            : 1,
    );
  }
  return E.choose(s, [16, 24, 38, 48].includes(s.day) ? (s.day === 24 ? 1 : 0) : 1);
}
let count = 0;
for (let seed = 1; seed <= 100; seed++)
  for (const strat of ["cash", "spot", "short", "hundred", "option", "online", "shark", "organs"]) {
    const s = E.create(seed);
    let loops = 0;
    while (!s.ended) {
      assert(++loops < 180, "Flow did not terminate");
      if (s.pending) {
        assert(resolve(s, strat).ok);
        continue;
      }
      if (["online", "shark", "organs"].includes(strat) && s.day === 2)
        assert(loan(s, 1e8, strat === "online" ? "online" : "shark").ok);
      if (strat !== "cash" && s.cash > 1e7 && s.positions.length < 3) {
        const prod = strat === "spot" ? "spot" : strat === "option" ? "option" : "margin",
          lev = strat === "hundred" ? 100 : strat === "short" ? 2 : strat === "option" ? 10 : 1,
          a = E.ASSETS[(s.day + seed) % E.ASSETS.length];
        assert(
          E.open(s, {
            asset: a.id,
            product: prod,
            direction: strat === "short" ? "short" : "long",
            amount: (s.cash * 0.4) / (1 + E.orderFee(1, lev, prod)),
            leverage: lev,
          }).ok,
        );
      }
      assert(E.nextDay(s).ok);
      assert(E.validate(s), "Invalid state at " + strat + " day " + s.day);
      assert(s.cash >= 0 && s.debt >= 0 && Number.isFinite(E.equity(s)));
      assert(s.health >= 0 && s.health <= s.healthCap);
      assert(s.day <= 60);
    }
    assert(s.cash === 0 && s.positions.length === 0);
    assert(["beggar", "death"].includes(s.endType));
    count++;
  }
let s = E.create(3),
  eq = E.equity(s);
assert(loan(s, 1e8, "online").ok);
assert(Math.abs(E.equity(s) - (eq - 8e6)) < 1);
assert.equal(E.interest(s), 4e6);
let snap = JSON.stringify(s);
assert(!loan(s, NaN).ok);
assert.equal(JSON.stringify(s), snap);
s = E.create(2);
assert(E.open(s, { asset: "sky", amount: 1e8, product: "spot" }).ok);
assert.equal(s.daily, -150000);
eq = E.equity(s);
assert(E.closeAll(s).ok);
assert(Math.abs(E.equity(s) - (eq - 150000)) < 1);
snap = JSON.stringify(s);
assert(!E.open(s, { asset: "sky", amount: NaN }).ok);
assert.equal(JSON.stringify(s), snap);
s = E.create(2);
assert(E.sellOrgan(s, "kidney_left").ok);
assert.equal(s.healthCap, 81);
snap = JSON.stringify(s);
assert(!E.sellOrgan(s, "kidney_left").ok);
assert.equal(JSON.stringify(s), snap);
assert(E.sellOrgan(s, "core").ok);
assert(s.ended && s.endType === "death");
assert.equal(s.health, 0);
s = E.create(2);
loan(s, 1e8, "shark");
while (!s.pending) E.nextDay(s);
assert.equal(s.pending.type, "debt");
const day = s.day;
snap = JSON.stringify(s);
assert(!E.nextDay(s).ok);
assert.equal(JSON.stringify(s), snap);
chat(s);
assert(E.choose(s, 1).ok);
assert.equal(s.day, day);
assert.equal(s.loans[0].due, day + 3);
assert.equal(s.loans[0].balance, 1.2e8);
s = E.create(1);
E.open(s, { asset: "sky", amount: 1e8, product: "spot" });
s.pending = { type: "glitch", shownProfit: 1 };
eq = E.equity(s);
assert(E.resolveGlitch(s).ok);
assert(E.equity(s) < eq);
snap = JSON.stringify(s);
assert(!E.resolveGlitch(s).ok);
assert.equal(JSON.stringify(s), snap);
s = E.create(2, true);
E.open(s, { asset: "sky", amount: 1e8, product: "spot" });
E.nextDay(s);
assert(!s.pending && s.daily > 0 && s.health === 100);
assert(E.closeAll(s).ok);
assert(s.cash > E.INITIAL);
console.log(
  `PASS: ${count} complete runs, guaranteed endings, healthy financial balances, loan rates/due dates, one-time body parts, death, event locking, one-time 404 settlement, and safe practice.`,
);
// 3.0 invariants: two independent kidneys, real intraday prices, retained archives and interactive work.
s = E.create(81);
assert(E.sellOrgan(s, "kidney_left").ok);
assert(!s.organs.includes("kidney_right"));
assert(E.sellOrgan(s, "kidney_right").ok);
assert.equal(s.healthCap, 22);
assert.equal(s.organs.filter((x) => x.startsWith("kidney")).length, 2);
assert(E.validate(s));
s = E.create(81);
assert(E.sellOrgan(s, "cornea_left").ok);
assert(!s.organs.includes("cornea_right"));
assert(E.sellOrgan(s, "cornea_right").ok);
assert.equal(s.organs.filter((x) => x.startsWith("cornea")).length, 2);
for (const def of E.JOBS) {
  s = E.create(203);
  const cash = s.cash;
  assert(E.work(s, def.id).ok);
  assert.equal(s.cash, cash, "Work paid before actual participation");
  assert(!E.nextDay(s).ok);
  assert(!E.tick(s).ok);
  assert(!E.open(s, { asset: "sky", amount: 1e8 }).ok);
  const wrong = s.job.task.options.find((o) => o.id !== s.job.task.answer);
  assert(!E.jobInput(s, wrong.id).ok);
  assert.equal(s.job.mistakes, 1);
  assert.equal(s.job.done, 0);
  assert.equal(s.cash, cash);
  s = JSON.parse(JSON.stringify(s));
  assert(E.validate(s), "Resumable work did not survive serialization");
  let steps = 0,
    r;
  while (s.job) {
    assert(++steps < 30);
    r = E.jobInput(s, s.job.task.answer);
    assert(r.ok);
    assert(E.validate(s));
  }
  assert(r.completed);
  assert.equal(s.cash, cash + Math.round(def.pay * 0.95));
  assert.equal(s.workIncome, Math.round(def.pay * 0.95));
  assert.equal(s.jobsDone, 1);
  assert(!E.work(s, def.id).ok, "Can earn twice in the same day");
}
s = E.create(2);
E.work(s, "cafe");
snap = JSON.stringify(s);
assert(!E.jobInput(s, "fake-option").ok);
assert.equal(JSON.stringify(s), snap);
eq = s.cash;
E.quitWork(s);
assert.equal(s.cash, eq);
assert(E.work(s, "cashier").ok);
assert.equal(s.job.done, 0);
s = E.create(22);
E.open(s, { asset: "sky", amount: 1e8 });
const original = s.markets.sky.price,
  oldValue = E.value(s, s.positions[0]),
  oldMinute = s.minute;
assert(E.tick(s).ok);
assert.equal(s.minute, oldMinute + 5);
assert.notEqual(s.markets.sky.price, original);
assert.notEqual(E.value(s, s.positions[0]), oldValue, "Live chart is not connected to holdings");
eq = s.cash;
const current = E.value(s, s.positions[0]);
E.closeAll(s);
assert(Math.abs(s.cash - (eq + current - 150000)) < 1, "Sale did not use live price");
while (s.minute < 810) E.tick(s);
const archive = JSON.stringify(s.markets.sky.series),
  middayPrice = s.markets.sky.price;
assert(E.tick(s).ok, "13:30 must not freeze");
assert.equal(s.minute, 815);
assert.notEqual(s.markets.sky.price, middayPrice);
assert.equal(JSON.stringify(s.markets.sky.series.slice(0, 163)), archive);
while (s.minute < 1435) E.tick(s);
const living = s.totalLiving;
assert(E.tick(s).ok);
assert.equal(s.day, 2);
assert.equal(s.minute, 0);
assert(s.totalLiving > living);
const paid = s.totalLiving;
E.tick(s);
assert.equal(s.totalLiving, paid, "Daily charge repeated after midnight");
assert.equal(s.minute, 5);
// Before-entry price extremes must not liquidate a newly purchased position.
s = E.create(4);
s.markets.sky.bars.at(-1).low = 1;
E.open(s, { asset: "sky", amount: 1e8, product: "margin", leverage: 2 });
E.tick(s);
assert.equal(s.positions.length, 1);
// Preserve old save identity without fabricating unavailable historical ticks.
const old = E.create(2);
old.version = 2;
old.organs = ["kidney", "eye"];
delete old.minute;
delete old.job;
delete old.jobsDone;
delete old.workIncome;
delete old.equityTape;
for (const m of Object.values(old.markets)) delete m.series;
const upgraded = E.migrate(old);
assert(E.validate(upgraded));
assert.deepEqual(upgraded.organs, ["kidney_left", "cornea_left"]);
assert(upgraded.archiveNotice);
// Force a 60-day survivor: verify that no data is sliced away, including day-60 closing data.
s = E.create(102);
while (!s.ended) {
  if (s.pending) {
    resolve(s);
    continue;
  }
  s.cash = E.INITIAL;
  s.health = 100;
  s.healthCap = 100;
  s.stress = 0;
  E.nextDay(s);
}
assert.equal(s.day, 60);
assert.equal(s.minute, 1440);
assert.equal(s.markets.sky.series.length, 17340);
assert.equal(s.markets.sky.bars.length, 92);
assert.equal(s.markets.sky.series[0].day, 1);
assert.equal(s.markets.sky.series.at(-1).day, 60);
assert.equal(s.markets.sky.series.at(-1).minute, 1440);
assert(E.validate(s));
assert(JSON.stringify(E.pack(s)).length * 2 < 4.8e6, "Packed history exceeds storage budget");
const packedSave = JSON.stringify(E.pack(s)),
  restored = E.unpack(JSON.parse(packedSave));
assert(E.validate(restored));
assert.equal(restored.markets.sky.series.length, 17340);
assert.equal(
  restored.markets.sky.price,
  s.markets.sky.price,
  "Snapshot packing must not round trading quotes",
);
for (let i = 0; i < s.markets.sky.series.length; i++) {
  const oldPoint = s.markets.sky.series[i],
    newPoint = restored.markets.sky.series[i];
  assert.equal(newPoint.minute, oldPoint.minute);
  assert.equal(newPoint.day, oldPoint.day);
  assert(
    Math.abs(newPoint.price - oldPoint.price) <= Math.max(1e-8, Math.abs(oldPoint.price) * 1e-7),
  );
}
console.log("60-day compressed save:", Math.round((packedSave.length * 2) / 1024), "KiB UTF-16");
console.log(
  "PASS: both kidneys/corneas, all 3 participatory jobs, no premature/double wages, wrong answers, resumable work, job locking, actual live P&L/sale prices, prior-wick isolation, 24-hour continuation / midnight rollover, v2 migration, and all 17,340 price points per asset through day 60.",
);
// 4.0: identity, consent, escalating collector conversations, and all interactive gambling paths.
s = E.create(6);
snap = JSON.stringify(s);
assert(!E.setName(s, " ").ok);
assert.equal(JSON.stringify(s), snap);
assert(E.setName(s, "幻影旅人").ok);
assert.equal(s.playerName, "幻影旅人");
assert(!E.setName(s, "第二個名字").ok);
assert(s.fictionId.startsWith("SIM-"));
snap = JSON.stringify(s);
assert(!E.borrow(s, 1e8, "online").ok);
assert.equal(JSON.stringify(s), snap, "Unsigned loan changed money");
assert(
  !E.borrow(s, 1e8, "online", false, { id: "REAL-ID", signedName: s.playerName, contacts: true })
    .ok,
);
assert(loan(s, 1e8, "online").ok);
assert.equal(s.contracts[0].signedName, "幻影旅人");
assert.equal(s.contracts[0].fictionId, s.fictionId);
function overdue(s) {
  assert(!s.pending && !s.ended);
  s.loans[0].due = s.day + 1;
  assert(E.nextDay(s).ok);
  assert.equal(s.pending.type, "debt");
  snap = JSON.stringify(s);
  assert(!E.choose(s, 1).ok, "Can skip conversation");
  assert.equal(JSON.stringify(s), snap);
  assert(E.collectionScene(s).lines[0].includes(s.playerName));
  chat(s);
  assert(E.validate(s));
}
s = E.create(7);
E.setName(s, "夜班測試員");
assert(loan(s, 5e8, "online").ok);
s.cash = 2e8;
overdue(s);
assert.equal(s.loans[0].stage, 1);
assert(E.choose(s, 1).ok);
assert.equal(s.reputation, 100);
s.cash = 3e8;
overdue(s);
assert.equal(s.loans[0].stage, 2);
assert(E.choose(s, 1).ok);
assert.equal(s.reputation, 72);
assert(s.social.some((x) => x.text.includes("夜班測試員") && x.text.includes("不實抹黑")));
assert(Math.abs(E.loanRate(s.loans[0]) - 0.06) < 1e-12);
assert(E.validate(s));
s = E.create(8);
E.setName(s, "红門測試員");
assert(loan(s, 1e9, "shark").ok);
s.cash = 3e8;
overdue(s);
E.choose(s, 1);
s.cash = 3e8;
overdue(s);
let hp = s.health;
E.choose(s, 1);
assert(
  Math.abs(s.health - (hp - 24)) < 1e-9,
  "Second shark visit should cause immediate injury plus extension cost",
);
assert(Math.abs(E.loanRate(s.loans[0]) - 0.13) < 1e-12);
s.cash = 3e8;
s.health = 100;
s.stress = 0;
overdue(s);
const oldCash = s.cash,
  oldDebt = s.debt,
  oldBalance = s.loans[0].balance;
assert(E.choose(s, 1).ok);
assert(s.organs.includes("kidney_left"));
assert.equal(s.seizedCount, 1);
assert.equal(s.cash, oldCash, "Forced organ seizure gives cash");
assert(Math.abs(s.loans[0].balance - (oldBalance * 1.2 - 2.5e8 * 0.35)) < 1);
assert(Math.abs(s.debt - (oldDebt + oldBalance * 0.2 - 2.5e8 * 0.35)) < 1);
assert(E.validate(s));
s = E.create(9);
assert(loan(s, 1e9, "shark").ok);
s.cash = 3e8;
overdue(s);
E.choose(s, 1);
s.cash = 3e8;
overdue(s);
hp = s.health;
const oldOrgans = s.organs.length;
assert(E.choose(s, 4).ok);
assert(s.health >= hp);
assert.equal(s.organs.length, oldOrgans);
assert.equal(s.loans[0].due, s.day + 3, "Aid did not grant breathing room");
s = E.create(10);
assert(loan(s, 5e8, "online").ok);
s.cash = 0;
s.loans[0].due = s.day + 1;
E.nextDay(s);
assert.equal(s.pending.type, "debt", "Empty pocket incorrectly bypassed due collector");
assert(E.validate(s));
s = E.create(11);
assert(E.sellOrgan(s, "lung_right").ok);
assert(!s.ended);
assert(E.sellOrgan(s, "lung").ok);
assert(s.ended && s.endType === "death");
s = E.create(12);
E.sellOrgan(s, "liver_whole");
assert(s.ended);
assert(
  !E.organAvailable(
    s,
    E.ORGANS.find((o) => o.id === "liver"),
  ),
);
for (let seed = 1; seed <= 150; seed++)
  for (const mode of E.CASINO) {
    s = E.create(seed);
    s.day = (seed % 55) + 1;
    s.history = Array(s.day).fill(E.INITIAL);
    const startCash = s.cash;
    assert(E.startGamble(s, mode.id, 1e7).ok);
    assert.equal(s.cash, startCash - 1e7);
    assert(!E.tick(s).ok);
    assert(!E.work(s).ok);
    assert(!E.nextDay(s).ok);
    s = E.unpack(JSON.parse(JSON.stringify(E.pack(s))));
    assert(E.validate(s));
    let r,
      steps = 0;
    while (s.gamble) {
      assert(++steps < 30);
      if (mode.id === "dice") {
        assert(E.gambleAction(s, seed % 2 ? "big" : "small").ok);
        r = E.gambleAction(s, "roll");
      } else if (mode.id === "cards") {
        r = E.gambleAction(s, E.handScore(s.gamble.player) < 16 ? "hit" : "stand");
      } else {
        if (seed % 3 === 0 && s.gamble.revealed.length) r = E.gambleAction(s, "cashout");
        else {
          const index = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => !s.gamble.revealed.includes(n));
          r = E.gambleAction(s, "reveal", index);
        }
      }
      assert(r.ok);
      assert(E.validate(s));
    }
    assert(r.completed);
    assert.equal(s.cash, startCash - 1e7 + r.payout);
    assert.equal(s.gambleStats.rounds, 1);
    assert.equal(s.gambleStats.net, r.net);
    snap = JSON.stringify(s);
    assert(!E.gambleAction(s, "roll").ok);
    assert.equal(JSON.stringify(s), snap, "Gamble settled twice");
  }
s = E.create(4);
E.startGamble(s, "mines", 1e7);
snap = JSON.stringify(s);
assert(!E.gambleAction(s, "reveal", -1).ok);
assert.equal(JSON.stringify(s), snap);
const safe = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((n) => !s.gamble.bombs.includes(n));
E.gambleAction(s, "reveal", safe);
snap = JSON.stringify(s);
assert(!E.gambleAction(s, "reveal", safe).ok);
assert.equal(JSON.stringify(s), snap);
assert(E.gambleAction(s, "cashout").completed);
s = E.create(5);
for (let i = 0; i < 12; i++) {
  assert(E.startGamble(s, "dice", 10000).ok);
  assert(E.gambleAction(s, "forfeit").completed);
}
assert(!E.startGamble(s, "dice", 10000).ok);
assert.equal(s.gambleStats.rounds, 12);
const previousV3 = E.create(99);
previousV3.version = 3;
for (const a of E.ASSETS.slice(8)) delete previousV3.markets[a.id];
const migrated = E.migrate(previousV3);
assert(E.validate(migrated));
assert.equal(Object.keys(migrated.markets).length, 24);
assert.equal(migrated.markets.robot.series[0].day, migrated.day);
const roundTrip = E.unpack(JSON.parse(JSON.stringify(E.pack(migrated))));
assert(E.validate(roundTrip));
assert.equal(roundTrip.cash, migrated.cash);
assert.equal(roundTrip.markets.sky.price, migrated.markets.sky.price);
console.log(
  "PASS: v4 character/fictional identity consent, named collector chats, graded online exposure/reputation/rates, shark violence and low-value seizure without cash, help branch, zero-cash due priority, fatal organ rules, 450 gambling sessions/reloads/single settlement, invalid inputs/daily cap, and v3 upgrades.",
);

// 5.0: full-day automatic and manual paths agree; final day is playable, not skipped.
let automatic = E.create(232),
  manual = E.create(232);
for (let i = 0; i < 288; i++) assert(E.tick(automatic).ok);
assert(E.nextDay(manual).ok);
assert.equal(
  JSON.stringify(automatic),
  JSON.stringify(manual),
  "Automatic/manual day settlement differs",
);
s = E.create(233);
s.day = 59;
s.history = Array(59).fill(E.INITIAL);
s.markets.sky.bars.at(-1).day = 59;
assert(E.nextDay(s).ok);
assert.equal(s.day, 60);
assert.equal(s.minute, 0);
assert(!s.ended, "Day 60 ended before its 24 hours");
s.health = 100;
s.cash = E.INITIAL;
for (let i = 0; i < 287; i++) assert(E.tick(s).ok);
assert.equal(s.minute, 1435);
assert(!s.ended);
assert(E.tick(s).ok);
assert.equal(s.day, 60);
assert.equal(s.minute, 1440);
assert(s.ended);
snap = JSON.stringify(s);
assert(!E.tick(s).ok);
assert.equal(JSON.stringify(s), snap);
let legacy = E.create(234);
legacy.version = 4;
legacy.minute = 810;
legacy.playerName = "延續角色";
legacy.named = true;
legacy.organs = ["lung"];
delete legacy.organRecords;
const converted = E.migrate(legacy);
assert.equal(converted.playerName, "延續角色");
assert.equal(converted.minute, 810);
assert(E.validate(converted));
assert(E.tick(converted).ok);
assert.equal(converted.minute, 815);
assert.equal(converted.organRecords[0].cause, "legacy");
s = E.create(235);
E.sellOrgan(s, "lung");
assert.equal(s.organRecords[0].cause, "sold");
assert.equal(s.organRecords[0].cash, 3e8);
assert.equal(s.organRecords[0].minute, 0);
for (const id of ["gallbladder", "intestine", "thyroid", "bone"])
  assert(E.ORGANS.some((o) => o.id === id));
s = E.create(236);
s.pending = { type: "glitch", shownProfit: 1 };
E.resolveGlitch(s);
const glitchRoundTrip = E.unpack(JSON.parse(JSON.stringify(E.pack(s))));
assert.equal(glitchRoundTrip.markets.sky.series.at(-1).kind, "故障恢復");
console.log(
  "PASS: 24-hour auto/manual parity, once-daily costs, playable day 60, terminal midnight, v4 continuity, body provenance, additional parts, retained fault timestamps.",
);

// Health exhaustion takes precedence over the final-day platform ending.
s = E.create(240);
s.day = 60;
s.minute = 1435;
s.health = 0;
assert(E.tick(s).ok);
assert.equal(s.endType, "death");
