/*
 * 檔案導讀：兩張地圖新增的區塊配置（v8 DISTRICTS）。座標：x 向東、z 向南，玩家從 (0, 65) 出生。
 * 每個區塊都放在原本量測出的大片空地；新增的牆、櫃與掩體會自動加入碰撞與敵人導航格子。
 */
import {
  createDistrictBuilder,
  wallRun,
  wallRunZ,
  warehouse,
  rack,
  palletStack,
  truck,
  sandbags,
  jerseyRow,
  lamp,
  drums,
  watchtower,
  gantryCrane,
  storageTank,
  generator,
  scaffold,
} from "./districts.js";

function wallMaterial(kit, ctx, key, color, tile = 4) {
  const material = kit.standard(key, color, 0.82, 0.08);
  if (!material.map) {
    const texture = ctx.createWallTexture();
    texture.repeat.set(1, 1);
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = 0.02;
    material.userData.worldTile = tile;
  }
  return material;
}

function paintHelpers(g, px, pz, s) {
  const rect = (x1, z1, x2, z2) =>
    g.strokeRect(px(x1), pz(z1), (x2 - x1) * s, (z2 - z1) * s);
  const hatch = (x1, z1, x2, z2, color) => {
    g.save();
    g.beginPath();
    g.rect(px(x1), pz(z1), (x2 - x1) * s, (z2 - z1) * s);
    g.clip();
    g.strokeStyle = color;
    g.lineWidth = 0.22 * s;
    for (let k = -40; k < 60; k += 0.9) {
      g.beginPath();
      g.moveTo(px(x1 + k), pz(z1));
      g.lineTo(px(x1 + k - (z2 - z1)), pz(z2));
      g.stroke();
    }
    g.restore();
    g.strokeStyle = color;
    g.lineWidth = 0.12 * s;
    rect(x1, z1, x2, z2);
  };
  const stain = (x, z, r, alpha) => {
    const gradient = g.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), r * s);
    gradient.addColorStop(0, `rgba(8,10,12,${alpha})`);
    gradient.addColorStop(1, "rgba(8,10,12,0)");
    g.fillStyle = gradient;
    g.beginPath();
    g.ellipse(px(x), pz(z), r * s, r * 0.7 * s, 0.4, 0, Math.PI * 2);
    g.fill();
  };
  const line = (x1, z1, x2, z2) => {
    g.beginPath();
    g.moveTo(px(x1), pz(z1));
    g.lineTo(px(x2), pz(z2));
    g.stroke();
  };
  return { rect, hatch, stain, line };
}

/* ------------------------------------------------------------------------ */
/* RUST HARBOR                                                                */
/* ------------------------------------------------------------------------ */

const STACK_SLOTS = [
  [-66, -60],
  [-66, -48],
  [-58.5, -60],
  [-58.5, -48],
  [-51, -60],
  [-51, -48],
];

export function createHarborDistricts(ctx) {
  const kit = createDistrictBuilder(ctx);
  const { createContainer, placeZoneSign } = ctx;
  const steel = kit.standard("h-steel", 0x2a3539, 0.55, 0.6),
    trimDark = kit.standard("h-trim", 0x1b2326, 0.65, 0.45),
    roof = kit.standard("h-roof", 0x1d2528, 0.75, 0.35),
    concrete = kit.standard("h-concrete", 0x7d8587, 0.88, 0.04),
    hazard = kit.standard("hazard-yellow", 0xd8b52a, 0.55, 0.2),
    counter = kit.standard("counter", 0x45545a, 0.6, 0.3),
    teal = kit.standard("h-teal-clad", 0x3c6670, 0.6, 0.45);
  const props = new kit.Batch("harbor-props");

  // ── WAREHOUSE—B: cold-chain store between the fuel depot and the rail yard.
  warehouse(kit, {
    name: "warehouse-b",
    x: 35.5,
    z: 40,
    w: 19,
    d: 13,
    h: 4.8,
    palette: {
      wall: wallMaterial(kit, ctx, "wh-b-wall", 0x8d989a),
      trim: trimDark,
      roof,
      rib: teal,
      window: 0x8fe8ff,
      ceiling: 0xdff6ff,
    },
    doors: [
      { side: "n", at: -4.5, width: 5, height: 3.6 },
      { side: "n", at: 6.5, width: 1.6, height: 2.5, shutter: false },
      { side: "w", at: 2, width: 2.6, height: 3 },
      { side: "s", at: 2.5, width: 3.4, height: 3.4 },
      { side: "e", at: -2, width: 2.4, height: 3, shutter: false },
    ],
    interior(b, detail, f) {
      rack(kit, b, detail, f, -1.5, -2.6, 9);
      rack(kit, b, detail, f, -1.5, 1.7, 9);
      palletStack(kit, detail, f.x(5.6, -4.6), f.z(5.6, -4.6), 0, 2);
      palletStack(kit, detail, f.x(7.4, -4.4), f.z(7.4, -4.4), 0.1, 1);
      palletStack(kit, detail, f.x(-7.8, -4.8), f.z(-7.8, -4.8), 0, 2);
      // Dispatch counter: waist-high cover in the open east bay.
      b.box(f.x(6.2, 2.7), 0.5, f.z(6.2, 2.7), 3.2, 1, 0.7, counter, { rot: f.rot });
      b.box(f.x(8.2, 3.9), 0.5, f.z(8.2, 3.9), 0.7, 1, 1.7, counter, { rot: f.rot });
      detail.box(f.x(6, 2.6), 1.25, f.z(6, 2.6), 0.75, 0.48, 0.05, kit.glow("screen", 0x6fe9ff), { rot: f.rot, collide: false, shadow: false });
      drums(kit, detail, f.x(-8, 4.4), f.z(-8, 4.4), [[0, 0], [0.65, 0.1], [0.3, 0.6]], 0x2f5f86);
    },
  });
  // Between the two north doors, below the clerestory windows and clear of the door lamps.
  placeZoneSign("WAREHOUSE—B", "COLD CHAIN LOGISTICS", 37.5, 3, 33.17, Math.PI, 0x7ce9ff, { mount: "wall", depth: 0.28 });

  // ── LOADING SHED: open-front freight shed with a dock and a parked trailer.
  {
    const b = new kit.Batch("loading-shed"),
      wall = wallMaterial(kit, ctx, "shed-wall", 0x7a8486);
    const x1 = -7,
      x2 = 11,
      zBack = -45.5,
      zFront = -34.5,
      h = 5.6;
    const back = kit.frame(2, zBack + 0.2, 0),
      dockTop = 1.1,
      rise = dockTop / 6,
      tread = 0.34,
      doorTop = dockTop + 3.2;
    // Rear loading door opens at dock height (it used to start at ground level
    // behind the dock and looked half buried).
    wallRun(b, back, x1 - 2, -1.5, 0, 0.4, h, wall);
    wallRun(b, back, 1.5, x2 - 2, 0, 0.4, h, wall);
    b.box(2, dockTop / 2, zBack + 0.2, 3, dockTop, 0.4, wall);
    b.box(2, (doorTop + h) / 2, zBack + 0.2, 3, h - doorTop, 0.4, wall);
    for (const x of [0.42, 3.58])
      b.box(x, (dockTop + doorTop) / 2, zBack - 0.08, 0.16, doorTop - dockTop, 0.16, hazard);
    b.box(2, doorTop + 0.35, zBack - 0.3, 0.9, 0.14, 0.18, kit.glow("lamp-warm", 0xffe2a8), { collide: false, shadow: false });
    kit.pool(2, zBack - 2.6, 3, 0xffd59a, 0.8);
    // Side walls start behind the back wall so their outer faces never overlap it.
    for (const x of [x1 + 0.2, x2 - 0.2]) b.box(x, h / 2, -42.5, 0.4, h, 5.2, wall);
    for (const x of [x1 + 0.2, -2.5, 2, 6.5, x2 - 0.2])
      b.box(x, h / 2, zFront + 0.2, 0.45, h, 0.45, steel);
    b.box((x1 + x2) / 2, h + 0.15, (zBack + zFront) / 2 + 0.5, x2 - x1 + 0.8, 0.3, zFront - zBack + 2, roof);
    b.box((x1 + x2) / 2, h - 0.26, zFront + 0.2, x2 - x1, 0.5, 0.5, steel);
    // Raised loading dock with walkable stairs at both ends (18 cm risers sit
    // within the automatic step-up height, so no jump is needed).
    b.box(2, dockTop / 2, -43.85, 16, dockTop, 2.5, concrete);
    // Painted edge line (thin enough to stay decoration, so no lip to trip on).
    b.box(2, dockTop + 0.006, -42.66, 16, 0.012, 0.12, hazard, { collide: false, shadow: false });
    const stairs = (x, width, edgeZ, direction) => {
      for (let i = 0; i < 6; i++) {
        const height = rise * (i + 1),
          z = edgeZ + direction * (tread / 2 + (5 - i) * tread);
        b.box(x, height / 2, z, width, height, tread, concrete);
        // Yellow nosing on the edge you step onto.
        b.box(x, height + 0.005, z + direction * (tread / 2 - 0.04), width, 0.01, 0.06, hazard, { collide: false, shadow: false });
      }
    };
    stairs(-5.3, 1.4, -42.6, 1);
    stairs(9.3, 1.4, -42.6, 1);
    // Outside the rear door: a landing and a matching flight down to the yard.
    b.box(2, dockTop / 2, zBack - 0.7, 3.2, dockTop, 1.4, concrete);
    stairs(2, 3.2, zBack - 1.4, -1);
    for (const x of [-3, 4, 7.5])
      b.box(x, 0.35, -42.52, 0.5, 0.5, 0.18, kit.standard("bumper", 0x15191b, 0.9, 0.05));
    palletStack(kit, b, -1, -44.2, 0, 2, true, dockTop);
    palletStack(kit, b, -2.6, -44.3, 0.08, 1, true, dockTop);
    palletStack(kit, b, 6.5, -44.2, 0, 2, true, dockTop);
    truck(kit, b, 2.6, -37.6, Math.PI / 2, 0x2f6b8a, true);
    for (const x of [-3, 2, 7]) {
      b.box(x, h - 0.08, -40, 2.6, 0.06, 0.32, kit.glow("lamp-cool", 0xdff6ff), { collide: false, shadow: false });
      kit.pool(x, -40, 3, 0xdff6ff, 0.6);
    }
    kit.light(2, h - 0.8, -39.5, 0xdff6ff, 6, 15);
    placeZoneSign("LOADING SHED", "NORTH FREIGHT // DOCK 3", 2, 4.25, -34.05, 0, 0xc8ff2e, { mount: "suspended", anchorY: h - 0.5 });
  }

  // ── STACK YARD (north-west): container canyons under a gantry crane.
  {
    const colors = [0x8a3f35, 0x2f5f74, 0x56693a, 0x7d5a32, 0x3e4f6b, 0x6b3446];
    // Nine-metre boxes keep clear of the corner light tower and breaker lamps.
    STACK_SLOTS.forEach(([x, z], i) => createContainer(x, 1.6, z, 4.8, 3.2, 9, colors[i % colors.length], 0));
    for (const [x, z, c] of [
      [-66, -60, 0x2f5f74],
      [-51, -48, 0x8a3f35],
      [-58.5, -48, 0x7d5a32],
    ])
      createContainer(x, 4.8, z, 4.8, 3.2, 9, c, 0, false);
    const crane = new kit.Batch("stack-crane");
    gantryCrane(kit, crane, -70.2, -46.4, -68.6, -39.4, 15);
    lamp(kit, props, -62.25, -54, 0, 0xffd59a);
    lamp(kit, props, -54.75, -54, Math.PI, 0xffd59a);
    placeZoneSign("STACK YARD", "BAY A // REEFER ROW", -58.5, 2.4, -40.6, 0, 0xffb34d);
  }

  // ── ARMORY—NE: bunker, sandbag line, guard tower and generator.
  warehouse(kit, {
    name: "armory",
    x: 56,
    z: -50,
    w: 8,
    d: 6,
    h: 3.4,
    palette: {
      wall: wallMaterial(kit, ctx, "armory-wall", 0x6f7a72),
      trim: trimDark,
      roof,
      rib: kit.standard("armory-rib", 0x48564d, 0.7, 0.35),
      window: 0xffb15c,
      ceiling: 0xffe1b0,
    },
    doors: [
      { side: "w", at: 0.5, width: 2.2, height: 2.5, shutter: false },
      { side: "s", at: 2, width: 2.2, height: 2.5, shutter: false },
    ],
    interior(b, detail, f) {
      const ammo = kit.standard("ammo-crate", 0x4d5b3a, 0.8, 0.1);
      b.box(f.x(0.5, -2.2), 0.55, f.z(0.5, -2.2), 5, 1.1, 0.8, ammo, { rot: f.rot });
      b.box(f.x(3, 0.4), 0.45, f.z(3, 0.4), 0.9, 0.9, 2.2, ammo, { rot: f.rot });
      for (let i = -2; i <= 2; i++)
        detail.box(f.x(i * 0.9, -2.75), 1.7, f.z(i * 0.9, -2.75), 0.12, 1.1, 0.12, steel, { rot: f.rot, collide: false });
    },
  });
  sandbags(kit, 49, -44.5, 5.2, 0.08);
  sandbags(kit, 46.4, -48, 4, Math.PI / 2 - 0.1);
  watchtower(kit, props, 48.6, -58.2, 0.2);
  generator(kit, props, 60.5, -42.5, 0);
  drums(kit, props, 63, -55.5, [[0, 0], [0.65, 0], [0.32, 0.58], [1.1, 0.5]], 0x6b7d3a);
  lamp(kit, props, 50, -39.8, Math.PI / 2, 0xffc98a);
  placeZoneSign("ARMORY—NE", "RESTRICTED // SECURITY", 54, 2.3, -46.68, 0, 0xff485c, { mount: "wall", depth: 0.28, bracketSpacing: 1.2 });

  // ── NORTH QUAY containers along the container row.
  createContainer(4, 1.6, -62, 4.8, 3.2, 11, 0x6b3446, Math.PI / 2);
  createContainer(4, 4.8, -62, 4.8, 3.2, 11, 0x2f5f74, Math.PI / 2, false);
  createContainer(18, 1.6, -62.5, 4.8, 3.2, 11, 0x56693a, Math.PI / 2);
  createContainer(33, 1.6, -65.5, 4.8, 3.2, 11, 0x7d5a32, Math.PI / 2);
  palletStack(kit, props, 11, -57.5, 0.3, 2);
  palletStack(kit, props, 25.5, -58, -0.2, 1);
  lamp(kit, props, 11, -66, Math.PI / 2, 0x9fe4ff);

  // ── CREW QUARTERS: two-room barracks with an interior doorway.
  const crewWall = wallMaterial(kit, ctx, "crew-wall", 0x9a8f80);
  warehouse(kit, {
    name: "crew-quarters",
    x: -35,
    z: 36,
    w: 14,
    d: 10,
    h: 3.6,
    palette: {
      wall: crewWall,
      trim: trimDark,
      roof,
      rib: kit.standard("crew-rib", 0x6f4a3a, 0.7, 0.3),
      window: 0xffcf86,
      ceiling: 0xffe6bf,
    },
    doors: [
      { side: "e", at: -1, width: 2.4, height: 2.6, shutter: false },
      { side: "s", at: -3, width: 2.4, height: 2.6, shutter: false },
      { side: "n", at: 4, width: 2.2, height: 2.6, shutter: false },
    ],
    interior(b, detail, f) {
      wallRunZ(b, f, -4.6, 4.6, 1, 0.25, 3.6, crewWall, [{ at: 2.2, width: 1.8, height: 2.4 }]);
      const bunk = kit.standard("bunk", 0x3d4a52, 0.6, 0.5),
        mattress = kit.standard("mattress", 0x6f7f86, 0.95, 0);
      for (const lz of [-2.6, 1.4]) {
        b.box(f.x(-5.6, lz), 0.8, f.z(-5.6, lz), 2.1, 1.6, 0.95, bunk, { rot: f.rot, solid: false });
        for (const y of [0.45, 1.35])
          detail.box(f.x(-5.6, lz), y, f.z(-5.6, lz), 2, 0.16, 0.9, mattress, { rot: f.rot, collide: false, solid: true });
      }
      b.box(f.x(-2.6, -4.3), 0.95, f.z(-2.6, -4.3), 3, 1.9, 0.55, kit.standard("locker", 0x5c6f7b, 0.45, 0.6), { rot: f.rot });
      b.box(f.x(4, -0.8), 0.4, f.z(4, -0.8), 2.2, 0.8, 1.2, kit.standard("table", 0x6a5236, 0.8, 0.05), { rot: f.rot });
      b.box(f.x(4.6, 4.25), 0.48, f.z(4.6, 4.25), 3.6, 0.95, 0.65, counter, { rot: f.rot });
    },
  });
  placeZoneSign("CREW QUARTERS", "HARBOR STAFF ONLY", -27.68, 2.15, 38.7, Math.PI / 2, 0xffb34d, { mount: "wall", depth: 0.28 });

  // ── SOUTH-EAST REEFER STACK.
  createContainer(52, 1.6, 58, 4.8, 3.2, 11, 0x2f5f74, 0);
  createContainer(60, 1.6, 58.5, 4.8, 3.2, 11, 0x8a3f35, 0);
  createContainer(60, 4.8, 58.5, 4.8, 3.2, 11, 0x56693a, 0, false);
  drums(kit, props, 66, 50.5, [[0, 0], [0.65, 0], [0, 0.65]], 0x8a3f35);
  lamp(kit, props, 56, 49, Math.PI / 2, 0xffd59a);

  // ── WEST CHECKPOINT: sandbag nest, scaffold and generator west of the hangar.
  sandbags(kit, -19.5, -1.5, 5, 0.3);
  sandbags(kit, -23.5, 4.5, 4, Math.PI / 2 + 0.2);
  sandbags(kit, -15.5, 7, 3.4, -0.45);
  scaffold(kit, props, -24, -5, 4, 1.6, 2, 0);
  generator(kit, props, -26.5, 10, Math.PI / 2);

  // ── SOUTH LANE: jersey chicane and parked trucks near Gate A.
  jerseyRow(kit, props, 8.5, 17.5, 2, 0, 0.08, true);
  jerseyRow(kit, props, -7.5, 24, 2, 0.2, 0.08, false);
  jerseyRow(kit, props, 10.5, 28, 2, Math.PI / 2, 0.08, true);
  truck(kit, props, 16, 19, Math.PI / 2, 0x9c3b31, false);
  truck(kit, props, -17, 29.5, 0.12, 0x3f5f7a, true);

  // ── SOUTH-WEST TANK FARM.
  storageTank(kit, props, -60, 61.5, 3.2, 7, 0x7d8a8f);
  storageTank(kit, props, -51.5, 64.5, 2.4, 5.5, 0x8f8a7a);
  props.cylinder(-55.8, 3.2, 63, 0.16, 6, steel, { axis: "x", rot: -0.35, collide: false, solid: true });
  props.box(-64.5, 1.3, 53.5, 3, 2.6, 3, kit.standard("pump-house", 0x55636a, 0.7, 0.3));
  props.box(-64.5, 2.7, 53.5, 3.3, 0.2, 3.3, roof);

  // ── PUMP STATION and east utility pieces.
  warehouse(kit, {
    name: "pump-station",
    x: 41,
    z: -10,
    w: 5,
    d: 4,
    h: 3.2,
    palette: {
      wall: wallMaterial(kit, ctx, "pump-wall", 0x7b8a8c),
      trim: trimDark,
      roof,
      rib: teal,
      window: 0x8fe8ff,
      ceiling: 0xdff6ff,
    },
    doors: [{ side: "w", at: 0, width: 1.8, height: 2.4, shutter: false }],
  });
  generator(kit, props, 40, -26, 0, 0x7d5a32);
  for (const x of [38, 44]) props.box(x, 2.1, -4.6, 0.25, 4.2, 0.25, steel);
  props.cylinder(41, 4.1, -4.6, 0.14, 7, kit.standard("pipe", 0x4b6269, 0.42, 0.68), { axis: "x", collide: false, solid: true });

  // ── Small set dressing in the remaining gaps.
  palletStack(kit, props, -25, -39, 0.2, 2);
  palletStack(kit, props, -26.6, -38.6, -0.1, 1);
  drums(kit, props, -15, -37.5, [[0, 0], [0.65, 0.1], [0.3, 0.62]], 0x2f5f86);
  watchtower(kit, props, -56.5, 12, -0.15, 0xffb34d);
  sandbags(kit, -52.5, 15, 3.6, Math.PI / 2);
  drums(kit, props, -57, -9, [[0, 0], [0.62, 0.2], [0.1, 0.66], [0.75, 0.82]], 0x6b7d3a);
  palletStack(kit, props, -55, 27, 0.4, 2);

  // ── Street lamps along the main lanes (skipped where something already stands).
  [
    [-4.6, 52, 0],
    [4.6, 44, Math.PI],
    [-4.6, 22, 0],
    [-30, -24, 0],
    [24, -24, Math.PI],
    [-30, 22, 0],
    [24, 30, Math.PI],
    [-44, -5, 0],
    [46, 2, Math.PI],
    [-12, -48, -Math.PI / 2],
    [14, 48, Math.PI / 2],
    [-40, 52, 0],
  ].forEach(([x, z, r], i) => {
    if (ctx.isFree(x, z, 0.6) && ctx.isFree(x + Math.cos(r) * 1.45, z - Math.sin(r) * 1.45, 0.4))
      lamp(kit, props, x, z, r, i % 2 ? 0xffd59a : 0xbfe9ff);
  });

  // ── Ground paint: bays, hatching, slot codes, crossings and stains.
  kit.paint((g, px, pz, s) => {
    const { rect, hatch, stain, line } = paintHelpers(g, px, pz, s);
    hatch(28.5, 30.4, 33.5, 33.3, "rgba(226,190,48,.55)");
    hatch(36.3, 46.7, 39.7, 48.8, "rgba(226,190,48,.55)");
    g.strokeStyle = "rgba(230,236,226,.42)";
    g.lineWidth = 0.14 * s;
    for (let x = 26; x <= 45; x += 3.8) line(x, 25.5, x, 30);
    for (let x = -7; x <= 11; x += 4.5) line(x, -34.2, x, -28.5);
    hatch(-6.8, -42.5, 10.8, -41.6, "rgba(226,190,48,.5)");
    g.setLineDash([0.9 * s, 0.6 * s]);
    g.strokeStyle = "rgba(230,236,226,.35)";
    for (const [x, z] of STACK_SLOTS) rect(x - 2.7, z - 4.8, x + 2.7, z + 4.8);
    g.setLineDash([]);
    g.fillStyle = "rgba(240,240,232,.5)";
    g.font = `800 ${1.4 * s}px Arial`;
    g.textAlign = "center";
    g.fillText("ROW A", px(-62.25), pz(-40.6));
    g.fillText("ROW B", px(-54.75), pz(-40.6));
    g.fillText("DOCK 3", px(2), pz(-30));
    g.fillText("BAY B-1", px(30.5), pz(28.4));
    g.fillStyle = "rgba(235,238,230,.45)";
    for (let i = 0; i < 7; i++) g.fillRect(px(-3.2 + i * 0.95), pz(45.6), 0.5 * s, 2.4 * s);
    g.fillStyle = "rgba(96,200,120,.28)";
    g.fillRect(px(-27.6), pz(34.4), 6 * s, 1.4 * s);
    [
      [16, 19, 2.4, 0.45],
      [-17, 31, 2.6, 0.4],
      [3, -38.5, 3, 0.42],
      [40, -26, 1.6, 0.5],
      [-26.5, 10, 1.5, 0.45],
      [8, 25, 2, 0.25],
      [-58.5, -54, 3.2, 0.3],
    ].forEach(([x, z, r, a]) => stain(x, z, r, a));
    g.strokeStyle = "rgba(10,12,14,.32)";
    g.lineWidth = 0.28 * s;
    for (const [x, z, r, a0, a1] of [
      [10, 12, 9, 0.2, 1.3],
      [10.6, 12.4, 9, 0.2, 1.25],
      [-10, -30, 11, 3.6, 4.6],
      [-10.6, -30.3, 11, 3.6, 4.55],
    ]) {
      g.beginPath();
      g.arc(px(x), pz(z), r * s, a0, a1);
      g.stroke();
    }
    for (const [x, z] of [
      [-8, 36],
      [20, -8],
      [-38, -14],
      [30, 52],
    ]) {
      g.fillStyle = "rgba(20,24,26,.55)";
      g.beginPath();
      g.arc(px(x), pz(z), 0.45 * s, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(160,170,170,.35)";
      g.lineWidth = 0.06 * s;
      g.stroke();
    }
  });

  kit.finish({ paintResolution: ctx.paintResolution });
}

/* ------------------------------------------------------------------------ */
/* EMBER FOUNDRY                                                              */
/* ------------------------------------------------------------------------ */

function moltenMaterial(kit) {
  return kit.glow("molten", 0xff7a1f);
}

/** Tapered cooling tower; one round collider at the base. */
function coolingTower(kit, b, x, z, radius, height) {
  const shell = kit.standard("tower-shell", 0x8d877c, 0.92, 0.04),
    band = kit.standard("tower-band", 0x5a554d, 0.9, 0.05),
    vapour = kit.glow("tower-glow", 0xffb070, 0.35),
    intake = kit.standard("intake", 0x1a1c1e, 0.8, 0.2);
  const top = radius * 0.78,
    waist = radius * 0.7;
  b.cylinder(x, height * 0.3, z, radius, height * 0.6, shell, { top: waist, segments: 28, colliderRadius: radius * 0.96 });
  b.cylinder(x, height * 0.8, z, waist, height * 0.4, shell, { top, segments: 28, collide: false, solid: true });
  b.cylinder(x, height + 0.15, z, top + 0.05, 0.3, band, { segments: 28, collide: false, solid: true, open: true, shadow: false });
  b.cylinder(x, 0.9, z, radius + 0.06, 0.25, band, { segments: 28, collide: false, solid: true, shadow: false });
  b.cylinder(x, height + 0.05, z, top - 0.1, 0.05, vapour, { segments: 24, collide: false, shadow: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(x + Math.cos(a) * (radius + 0.02), 0.45, z + Math.sin(a) * (radius + 0.02), 0.9, 0.7, 0.1, intake, { rot: -a + Math.PI / 2, collide: false, shadow: false });
  }
}

/** Torpedo-style ladle car on a short rail spur. */
function ladleCar(kit, b, x, z, rot = 0) {
  const f = kit.frame(x, z, rot),
    frameMat = kit.standard("ladle-frame", 0x3a3430, 0.6, 0.55),
    shell = kit.standard("ladle-shell", 0x55483e, 0.75, 0.4),
    rail = kit.standard("rail-steel", 0x6c6f70, 0.4, 0.8);
  for (const s of [-0.75, 0.75])
    b.box(f.x(0, s), 0.06, f.z(0, s), 16, 0.12, 0.12, rail, { rot, collide: false, shadow: false });
  b.box(f.x(0, 0), 0.55, f.z(0, 0), 7, 0.5, 2.2, frameMat, { rot, collide: false, solid: true });
  for (const lx of [-2.6, -1.6, 1.6, 2.6])
    for (const s of [-0.75, 0.75])
      b.cylinder(f.x(lx, s), 0.38, f.z(lx, s), 0.36, 0.2, frameMat, { axis: "z", rot, collide: false, segments: 12 });
  b.cylinder(f.x(0, 0), 2.05, f.z(0, 0), 1.25, 5.6, shell, { axis: "x", rot, segments: 20, collide: false, solid: true });
  for (const lx of [-2.9, 2.9])
    b.cylinder(f.x(lx, 0), 2.05, f.z(lx, 0), 0.75, 0.9, shell, { axis: "x", rot, top: 1.2, segments: 16, collide: false, solid: true });
  b.cylinder(f.x(0, 0), 3.32, f.z(0, 0), 0.5, 0.12, moltenMaterial(kit), { collide: false, shadow: false, segments: 14 });
  kit.collider(f.x(0, 0), 1.9, f.z(0, 0), 7, 3.6, 2.5, rot);
  kit.pool(f.x(0, 0), f.z(0, 0), 3.4, 0xff8a3a, 0.9);
}

/** Low conveyor with rollers; vaultable cover. */
function conveyor(kit, b, x1, x2, z, height = 1.05) {
  const frameMat = kit.standard("conveyor-frame", 0x3b4246, 0.55, 0.55),
    belt = kit.standard("conveyor-belt", 0x141618, 0.9, 0.1),
    roller = kit.standard("conveyor-roller", 0x8d9396, 0.35, 0.8),
    hazard = kit.standard("hazard-yellow", 0xd8b52a, 0.55, 0.2);
  const length = x2 - x1,
    mid = (x1 + x2) / 2;
  b.box(mid, height - 0.08, z, length, 0.12, 1.3, belt, { collide: false, solid: true });
  b.box(mid, height / 2 - 0.1, z, length, height - 0.3, 0.12, frameMat, { collide: false, solid: true });
  for (const s of [-0.68, 0.68])
    b.box(mid, height - 0.02, z + s, length, 0.16, 0.08, hazard, { collide: false, shadow: false });
  for (let x = x1 + 0.6; x < x2; x += 1.8)
    for (const s of [-0.6, 0.6])
      b.box(x, (height - 0.15) / 2, z + s, 0.1, height - 0.15, 0.1, frameMat, { collide: false, solid: true });
  for (let x = x1 + 0.3; x < x2; x += 0.45)
    b.cylinder(x, height + 0.02, z, 0.06, 1.2, roller, { axis: "z", collide: false, segments: 8, shadow: false });
  kit.collider(mid, height / 2, z, length, height, 1.4, 0);
}

/** Row of steel coils on cradles (eye facing ±z). */
function coilRow(kit, b, x, z, count, spacing = 2.3) {
  const coil = kit.standard("steel-coil", 0x9aa3a6, 0.32, 0.85),
    eye = kit.standard("coil-eye", 0x2b2f31, 0.6, 0.6),
    cradle = kit.standard("coil-cradle", 0x5b3c2c, 0.85, 0.1);
  const length = (count - 1) * spacing + 1.8;
  for (let i = 0; i < count; i++) {
    const cx = x - ((count - 1) * spacing) / 2 + i * spacing;
    b.cylinder(cx, 0.95, z, 0.85, 1.45, coil, { axis: "z", collide: false, solid: true, segments: 22 });
    b.cylinder(cx, 0.95, z, 0.34, 1.47, eye, { axis: "z", collide: false, segments: 14, shadow: false });
    b.box(cx, 0.14, z, 1.7, 0.28, 1.5, cradle, { collide: false, solid: true });
  }
  kit.collider(x, 0.9, z, length, 1.8, 1.55, 0);
}

/** Stack of I-beams on timber bearers. */
function beamStack(kit, b, x, z, rot = 0, layers = 3) {
  const f = kit.frame(x, z, rot),
    beam = kit.standard("i-beam", 0x7b4a32, 0.6, 0.55),
    timber = kit.standard("bearer", 0x5d4630, 0.9, 0.02);
  for (const lx of [-2, 0, 2])
    b.box(f.x(lx, 0), 0.08, f.z(lx, 0), 0.25, 0.16, 1.8, timber, { rot, collide: false, solid: true });
  for (let layer = 0; layer < layers; layer++)
    for (let i = 0; i < 4; i++) {
      const lz = -0.6 + i * 0.4 + (layer % 2) * 0.1,
        y = 0.31 + layer * 0.3;
      b.box(f.x(0, lz), y, f.z(0, lz), 5.6, 0.04, 0.3, beam, { rot, collide: false, solid: true, shadow: false });
      b.box(f.x(0, lz), y - 0.13, f.z(0, lz), 5.6, 0.04, 0.3, beam, { rot, collide: false, solid: true, shadow: false });
      b.box(f.x(0, lz), y - 0.065, f.z(0, lz), 5.6, 0.24, 0.04, beam, { rot, collide: false, solid: true });
    }
  const height = 0.16 + layers * 0.3;
  kit.collider(x, height / 2, z, 5.6, height, 1.8, rot);
}

/** Wire cage with gas cylinders. */
function gasCage(kit, b, x, z, rot = 0) {
  const f = kit.frame(x, z, rot),
    mesh = kit.standard("cage-mesh", 0x8c9496, 0.5, 0.6, { transparent: true, opacity: 0.45 }),
    post = kit.standard("cage-post", 0x2a3539, 0.55, 0.6),
    colors = [0x2c6e4a, 0x8a2f2a, 0x2c4f8a, 0xd0d0c8];
  b.box(f.x(0, 0), 1.1, f.z(0, 0), 3, 2.2, 1.3, mesh, { rot, collide: false, shadow: false });
  for (const [lx, lz] of [[-1.5, -0.65], [1.5, -0.65], [-1.5, 0.65], [1.5, 0.65]])
    b.box(f.x(lx, lz), 1.1, f.z(lx, lz), 0.07, 2.2, 0.07, post, { rot, collide: false, solid: true });
  b.box(f.x(0, 0), 2.24, f.z(0, 0), 3.1, 0.08, 1.4, post, { rot, collide: false, solid: true });
  for (let i = 0; i < 9; i++) {
    const lx = -1.2 + (i % 5) * 0.6,
      lz = i < 5 ? -0.28 : 0.3,
      color = colors[i % 4];
    b.cylinder(f.x(lx, lz), 0.75, f.z(lx, lz), 0.13, 1.5, kit.standard(`gas-${color}`, color, 0.4, 0.5), { collide: false, solid: true, segments: 10 });
  }
  kit.collider(x, 1.1, z, 3, 2.2, 1.3, rot);
}

/** Electric arc furnace with glowing tap door, chimney and duct. */
function arcFurnace(kit, b, x, z) {
  const shell = kit.standard("furnace-shell", 0x4a3f38, 0.7, 0.45),
    roofMat = kit.standard("furnace-roof", 0x2b2826, 0.6, 0.5),
    electrode = kit.standard("electrode", 0x1b1b1b, 0.5, 0.3),
    stack = kit.standard("chimney", 0x5b5048, 0.88, 0.1),
    red = kit.glow("chimney-beacon", 0xff3344),
    molten = moltenMaterial(kit);
  b.cylinder(x, 2, z, 2.8, 4, shell, { segments: 26 });
  b.cylinder(x, 4.25, z, 2.5, 0.5, roofMat, { top: 1.6, segments: 26, collide: false, solid: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.cylinder(x + Math.cos(a) * 0.7, 5.6, z + Math.sin(a) * 0.7, 0.18, 2.6, electrode, { collide: false, solid: true, segments: 8 });
  }
  b.box(x - 2.82, 1.2, z, 0.08, 1.1, 1.6, molten, { collide: false, shadow: false });
  b.box(x - 3.5, 0.06, z, 1.4, 0.04, 1.4, molten, { collide: false, shadow: false });
  kit.pool(x - 4, z, 4.5, 0xff7a2a, 1.2);
  kit.light(x - 3.6, 1.6, z, 0xff8a3a, 6, 14);
  const cx = x + 3.6,
    cz = z - 2.4;
  b.cylinder(cx, 8, cz, 0.75, 16, stack, { top: 0.6, segments: 18 });
  for (const y of [4, 8, 12])
    b.cylinder(cx, y, cz, 0.82, 0.18, roofMat, { collide: false, solid: true, segments: 18, shadow: false });
  b.box(cx, 16.2, cz, 0.25, 0.25, 0.25, red, { collide: false, shadow: false });
  const duct = Math.hypot(cx - x, cz - z);
  b.box((x + cx) / 2, 4.6, (z + cz) / 2, duct, 0.6, 0.6, stack, { rot: -Math.atan2(cz - z, cx - x), collide: false, solid: true });
}

/** Overhead pipe rack: columns collide, pipes are overhead. */
function pipeRack(kit, b, x1, x2, z, height = 4.6, walkway = false) {
  const steel = kit.standard("rack-steel", 0x3d3936, 0.55, 0.6),
    pipes = [
      kit.standard("pipe-copper", 0x9b6a45, 0.45, 0.7),
      kit.standard("pipe-grey", 0x6f7477, 0.42, 0.68),
      kit.standard("pipe-red", 0x8a2f2a, 0.5, 0.5),
    ];
  for (let x = x1; x <= x2 + 0.01; x += 6) {
    for (const s of [-0.9, 0.9]) b.box(x, height / 2, z + s, 0.3, height, 0.3, steel);
    b.box(x, height, z, 0.32, 0.3, 2.14, steel, { collide: false, solid: true });
  }
  [-0.55, 0, 0.55].forEach((s, i) =>
    b.cylinder((x1 + x2) / 2, height + 0.32, z + s, i === 1 ? 0.22 : 0.15, x2 - x1 + 1, pipes[i], { axis: "x", collide: false, solid: true, segments: 10 }),
  );
  if (!walkway) return;
  // Maintenance catwalk over the pipes, reached by a ladder at the west end
  // (or a running jump from the sorter roof).
  const grate = kit.standard("rack-grate", 0x4a4541, 0.7, 0.55),
    deckTop = height + 0.66,
    mid = (x1 + x2) / 2;
  b.box(mid, deckTop - 0.04, z, x2 - x1 + 0.6, 0.08, 1.9, grate);
  for (const s of [-0.97, 0.97])
    b.box(mid, deckTop - 0.1, z + s, x2 - x1 + 0.6, 0.14, 0.06, kit.standard("hazard-yellow", 0xd8b52a, 0.55, 0.2), { collide: false, shadow: false });
  const lx = x1 - 0.35;
  for (const s of [-0.25, 0.25])
    b.box(lx, deckTop / 2 + 0.3, z + s, 0.05, deckTop + 0.6, 0.05, steel, { collide: false, solid: true, shadow: false });
  for (let y = 0.35; y < deckTop; y += 0.38)
    b.box(lx, y, z, 0.04, 0.04, 0.5, steel, { collide: false, solid: true, shadow: false });
  kit.ladder({
    climbX: x1 - 0.79,
    climbZ: z,
    nx: -1,
    nz: 0,
    top: deckTop,
    exitX: x1 + 0.7,
    exitZ: z,
  });
}

export function createFoundryDistricts(ctx) {
  const kit = createDistrictBuilder(ctx);
  const { placeZoneSign } = ctx;
  const trimDark = kit.standard("f-trim", 0x221c19, 0.65, 0.45),
    roof = kit.standard("f-roof", 0x231f1d, 0.75, 0.35),
    rust = kit.standard("f-rust-clad", 0x7a4630, 0.65, 0.4),
    bench = kit.standard("workbench", 0x5a4a3a, 0.8, 0.15),
    concrete = kit.standard("f-concrete", 0x8a8178, 0.9, 0.04),
    runway = kit.standard("runway", 0xc99a2e, 0.55, 0.45),
    molten = moltenMaterial(kit),
    props = new kit.Batch("foundry-props");

  // ── CASTING HALL (north-west): moulds, crucible and an overhead runway.
  warehouse(kit, {
    name: "casting-hall",
    x: -42,
    z: -56,
    w: 20,
    d: 13,
    h: 5.4,
    palette: {
      wall: wallMaterial(kit, ctx, "casting-wall", 0x8c7c6c),
      trim: trimDark,
      roof,
      rib: rust,
      window: 0xffa45a,
      ceiling: 0xffc58a,
    },
    doors: [
      { side: "s", at: -2, width: 4.5, height: 3.8 },
      { side: "e", at: 0, width: 2.6, height: 3 },
      { side: "n", at: 6, width: 2.2, height: 2.6, shutter: false },
    ],
    interior(b, detail, f) {
      for (const lz of [-3, 2.4]) {
        b.box(f.x(-5, lz), 0.4, f.z(-5, lz), 3.4, 0.8, 2, kit.standard("mould", 0x3a3532, 0.85, 0.3), { rot: f.rot });
        detail.box(f.x(-5, lz), 0.81, f.z(-5, lz), 2.8, 0.02, 1.4, molten, { rot: f.rot, collide: false, shadow: false });
        kit.pool(f.x(-5, lz), f.z(-5, lz), 2.4, 0xff8a3a, 0.8);
      }
      b.cylinder(f.x(4, -2.5), 1, f.z(4, -2.5), 1.15, 2, kit.standard("crucible", 0x4b3e36, 0.7, 0.5), { segments: 20 });
      detail.cylinder(f.x(4, -2.5), 2.01, f.z(4, -2.5), 0.9, 0.04, molten, { segments: 18, collide: false, shadow: false });
      kit.light(f.x(4, -2.5), 3, f.z(4, -2.5), 0xff8a3a, 4, 10);
      beamStack(kit, detail, f.x(5, 3.3), f.z(5, 3.3), f.rot, 3);
      for (const lz of [-4.5, 4.5])
        detail.box(f.x(0, lz), 4.6, f.z(0, lz), 19, 0.4, 0.35, runway, { rot: f.rot, collide: false, solid: true });
      detail.box(f.x(1.5, 0), 4.3, f.z(1.5, 0), 0.8, 0.5, 9.4, runway, { rot: f.rot, collide: false, solid: true });
    },
  });
  placeZoneSign("CASTING HALL", "MOLTEN METAL // PPE ONLY", -48.5, 4.75, -49.18, Math.PI, 0xffa343, { mount: "wall", depth: 0.28 });

  // ── PATTERN SHOP (south-west): workbenches, racks and pallets.
  warehouse(kit, {
    name: "pattern-shop",
    x: -40,
    z: 55,
    w: 16,
    d: 11,
    h: 4.4,
    palette: {
      wall: wallMaterial(kit, ctx, "pattern-wall", 0x9a8c78),
      trim: trimDark,
      roof,
      rib: kit.standard("pattern-rib", 0x5a4a3c, 0.7, 0.35),
      window: 0xffcf86,
      ceiling: 0xffe1b0,
    },
    doors: [
      { side: "n", at: 3, width: 3.2, height: 3.2 },
      { side: "e", at: -2.5, width: 2.4, height: 2.8, shutter: false },
      { side: "w", at: -2, width: 2.2, height: 2.6, shutter: false },
    ],
    interior(b, detail, f) {
      rack(kit, b, detail, f, -2, 3.6, 7.5, 1.1, 2.8);
      for (const [lx, lz] of [
        [-4.5, -1.5],
        [1, -1.5],
      ]) {
        b.box(f.x(lx, lz), 0.48, f.z(lx, lz), 3, 0.95, 1.1, bench, { rot: f.rot });
        detail.box(f.x(lx, lz), 1.0, f.z(lx, lz), 0.6, 0.12, 0.4, kit.standard("vice", 0x2f5f86, 0.5, 0.5), { rot: f.rot, collide: false });
      }
      palletStack(kit, detail, f.x(4.6, -4.2), f.z(4.6, -4.2), 0, 2);
      palletStack(kit, detail, f.x(5.6, 3.6), f.z(5.6, 3.6), 0.1, 1);
    },
  });
  placeZoneSign("PATTERN SHOP", "MOULDS & TOOLING", -31.68, 2.6, 58.2, Math.PI / 2, 0xffb34d, { mount: "wall", depth: 0.28 });

  // ── COOLING TOWERS and the quench pool (north-east).
  coolingTower(kit, props, 36, -58, 4.2, 11);
  coolingTower(kit, props, 48.5, -62, 3.4, 9);
  props.box(45, 0.45, -48.4, 8.4, 0.9, 0.4, concrete);
  props.box(45, 0.45, -43.6, 8.4, 0.9, 0.4, concrete);
  props.box(41, 0.45, -46, 0.4, 0.9, 4.4, concrete);
  props.box(49, 0.45, -46, 0.4, 0.9, 4.4, concrete);
  props.box(45, 0.55, -46, 7.6, 0.04, 4.4, kit.glow("quench-water", 0x2fb7d6, 0.55), { collide: false, shadow: false });
  kit.pool(45, -46, 5, 0x6fe9ff, 0.7);
  pipeRack(kit, props, 38, 62, -51.5, 5.2);
  placeZoneSign("QUENCH", "COOLING TOWERS", 45, 2.4, -41.6, 0, 0x7ce9ff);

  // ── SLAG YARD (south-east): ladle car, slag heaps and a beam stack.
  ladleCar(kit, props, 38, 58, 0);
  for (const [x, z, r] of [
    [50, 63, 3],
    [29, 64.5, 2.4],
  ]) {
    props.cylinder(x, 0.9, z, r, 1.8, kit.standard("slag", 0x2c2826, 0.95, 0.05), { top: r * 0.25, segments: 14, collide: false, solid: true });
    kit.roundCollider(x, z, r * 0.9, 0, 0.6);
    kit.roundCollider(x, z, r * 0.65, 0.6, 1.2);
    kit.roundCollider(x, z, r * 0.4, 1.2, 1.8);
    props.cylinder(x, 0.25, z, r * 0.95, 0.06, kit.glow("slag-glow", 0xff5a1a, 0.6), { top: r * 0.9, segments: 14, collide: false, shadow: false });
  }
  beamStack(kit, props, 47, 50.5, 0.1, 3);
  drums(kit, props, 56, 52, [[0, 0], [0.62, 0.15], [0.25, 0.65]], 0x7a4630);

  // ── WEST LINE: conveyor with a sorting machine and an overhead pipe rack.
  conveyor(kit, props, -56, -48.6, 1.5);
  conveyor(kit, props, -45.4, -38, 1.5);
  props.box(-47, 1.4, 1.5, 2.8, 2.8, 2.6, kit.standard("sorter", 0x8a5a2e, 0.6, 0.45));
  props.box(-47, 1.9, 2.81, 1.2, 0.5, 0.04, kit.glow("sorter-panel", 0x58ff8a), { collide: false, shadow: false });
  // Catwalk at 4 m: ladder at the west end, or jump across from the sorter roof.
  pipeRack(kit, props, -56, -38, -2.6, 3.4, true);
  placeZoneSign("ASSEMBLY LINE", "WEST SORTING", -52, 2.4, 6.4, Math.PI, 0xffa343);

  // ── ARC FURNACE (east) with heat shields.
  arcFurnace(kit, props, 51, -4);
  props.box(43.5, 1.1, -9, 4.2, 2.2, 0.35, rust, { rot: 0.35 });
  props.box(43.5, 1.1, 1.5, 4.2, 2.2, 0.35, rust, { rot: -0.35 });

  // ── COIL BAY (north centre) under a small gantry.
  coilRow(kit, props, 0, -60.5, 5);
  coilRow(kit, props, 0, -55, 4);
  gantryCrane(kit, new kit.Batch("coil-crane"), -9.5, 9.5, -65.5, -50.5, 8.5);

  // ── Mid-field cover: cages, beam stacks, trucks and concrete blocks.
  gasCage(kit, props, 30, -24, 0.3);
  beamStack(kit, props, 24.5, -18, -0.2, 2);
  truck(kit, props, -17, -31, 0.4, 0xb8662e, false);
  truck(kit, props, 19, 32, -Math.PI / 2 + 0.2, 0x8a5a2e, false);
  beamStack(kit, props, -36, 23, 0.25, 3);
  gasCage(kit, props, -31, 28.5, -0.2);
  jerseyRow(kit, props, 5.5, 26.5, 2, 0, 0.08, true);
  jerseyRow(kit, props, -6.5, -25.5, 2, 0, 0.08, true);
  jerseyRow(kit, props, -22, 11.5, 2, 0.5, 0.08, false);
  jerseyRow(kit, props, 21, 9, 2, -0.5, 0.08, false);
  drums(kit, props, -23, -10, [[0, 0], [0.62, 0.2], [0.2, 0.68]], 0x7a4630);

  // ── Sodium lamps along the lanes (skipped where something already stands).
  [
    [-4.6, 50, 0],
    [4.6, 38, Math.PI],
    [-4.6, -40, 0],
    [4.6, -48, Math.PI],
    [-38, -20, 0],
    [38, 20, Math.PI],
    [-40, 40, 0],
    [40, -36, Math.PI],
    [-60, 10, 0],
    [60, 10, Math.PI],
    [24, 46, Math.PI / 2],
    [-26, -46, -Math.PI / 2],
  ].forEach(([x, z, r]) => {
    if (ctx.isFree(x, z, 0.6) && ctx.isFree(x + Math.cos(r) * 1.45, z - Math.sin(r) * 1.45, 0.4))
      lamp(kit, props, x, z, r, 0xffb066);
  });

  // ── Ground paint: walkways, hot-zone hatching and bay labels.
  kit.paint((g, px, pz, s) => {
    const { rect, hatch, stain, line } = paintHelpers(g, px, pz, s);
    hatch(-46.5, -49.2, -41.5, -46.8, "rgba(255,150,40,.5)");
    hatch(45.8, -7.5, 48.6, -0.5, "rgba(255,90,30,.45)");
    g.strokeStyle = "rgba(240,200,60,.45)";
    g.lineWidth = 0.16 * s;
    line(-56, -1.2, -38, -1.2);
    line(-56, 4.2, -38, 4.2);
    line(-9.5, -51.8, 9.5, -51.8);
    line(-9.5, -64.2, 9.5, -64.2);
    g.setLineDash([0.9 * s, 0.6 * s]);
    g.strokeStyle = "rgba(230,230,220,.35)";
    rect(30, 56.2, 46, 59.8);
    rect(40.6, -48.8, 49.4, -43.2);
    g.setLineDash([]);
    g.fillStyle = "rgba(245,235,220,.5)";
    g.font = "800 " + 1.5 * s + "px Arial";
    g.textAlign = "center";
    g.fillText("COIL BAY", px(0), pz(-48.6));
    g.fillText("SLAG YARD", px(38), pz(53.5));
    g.fillStyle = "rgba(255,120,40,.55)";
    g.font = "800 " + 1.1 * s + "px Arial";
    g.fillText("HOT METAL", px(-44), pz(-45.4));
    [
      [-17, -31, 2.3, 0.4],
      [19, 32, 2.3, 0.4],
      [38, 58, 3.4, 0.45],
      [51, -4, 4, 0.45],
      [-47, 1.5, 2.6, 0.3],
      [36, -58, 5.2, 0.25],
    ].forEach(([x, z, r, a]) => stain(x, z, r, a));
  });

  kit.finish({ paintResolution: ctx.paintResolution });
}
