'use strict';
// ============================================================
//  敵人、小兵與 Boss 的模型
// ============================================================

// 小型步行機共用的逆關節雙腿；回傳髖部高度
// 參數：hips = 髖部關節、P = 塗裝、L1 / L2 = 大腿與小腿長度、fH = 腳掌高度、T = 腿的粗細、hw = 髖寬的一半
function smallLegs(hips, P, L1, L2, fH, T, hw) {
  // tb / kb：站立時大腿與膝蓋的彎曲角度（逆關節，所以彎得很深）
  const tb = -0.75, kb = 1.35;
  let s = new Seg();
  s.bev(hw * 2.2, 0.55 + T * 0.3, 1.1 + T, P.dark, 0, 0, 0, 0, 0, 0, 0.1);
  s.cyl(0.22 + T * 0.2, 0.22 + T * 0.2, hw * 2.6, P.sub, 0, 0, 0, 0, 0, PI / 2, 8);
  s.trap(hw * 1.2, hw * 0.7, 0.5, 0.2, P.main, 0, -0.2, 0.55 + T * 0.5, -0.3, 0, 0);
  s.into(hips);
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1, nm = i ? 'R' : 'L';
    // 大腿
    const thigh = grp('thigh' + nm, hips, sd * hw, 0, 0);
    s = new Seg();
    s.cyl(T * 0.7, T * 0.7, T * 1.3, P.dark, 0, 0, 0, 0, 0, PI / 2, 10);
    s.bev(T * 1.2, L1, T * 1.5, P.main, 0, -L1 * 0.5, 0, 0, 0, 0, T * 0.16);
    s.box(T * 0.5, L1 * 0.5, T * 0.4, P.sub, 0, -L1 * 0.5, T * 0.8);
    s.box(T * 1.25, T * 0.24, T * 1.55, P.accent, 0, -L1 * 0.2, 0);
    s.cyl(T * 0.12, T * 0.12, L1 * 0.7, STEEL, sd * T * 0.5, -L1 * 0.5, -T * 0.8, 0, 0, 0, 6);
    s.into(thigh);
    // 小腿
    const shin = grp('shin' + nm, thigh, 0, -L1, 0);
    s = new Seg();
    s.cyl(T * 0.65, T * 0.65, T * 1.4, P.dark, 0, 0, 0, 0, 0, PI / 2, 10);
    s.bev(T * 0.95, L2, T * 1.1, P.sub, 0, -L2 * 0.5, 0, 0, 0, 0, T * 0.14);
    s.trap(T * 0.9, T * 0.5, T * 1.2, T * 0.33, P.accent, 0, 0, -T * 0.7, 0.2, 0, 0);
    s.cyl(T * 0.14, T * 0.14, L2 * 0.8, STEEL, 0, -L2 * 0.5, T * 0.7, 0, 0, 0, 6);
    s.into(shin);
    // 腳掌
    const foot = grp('foot' + nm, shin, 0, -L2, 0);
    s = new Seg();
    s.bev(T * 1.7, fH, T * 3.2, P.dark, 0, -fH * 0.5 + 0.02, T * 0.5, 0, 0, 0, 0.06);
    s.box(T * 0.5, fH * 0.8, T * 1.2, P.main, sd * T * 0.5, -fH * 0.5, T * 2.1);
    s.box(T * 0.5, fH * 0.8, T * 1.2, P.main, -sd * T * 0.5, -fH * 0.5, T * 2.1);
    s.box(T * 0.6, fH * 0.7, T * 0.8, P.sub, 0, -fH * 0.5, -T * 1.3);
    s.into(foot);
  }
  // 算出站立時髖部離地多高，並把髖部放到那個高度
  const hipY = L1 * Math.cos(tb) + L2 * Math.cos(tb + kb) + fH;
  hips.position.y = hipY;
  return { hipY, leg: { L1, L2, fH, tb, kb, off: 0 } };
}

// 步行機的基本骨架：root（整台）→ inner（縮放用）→ hips（髖部）
function walkerBase() {
  const root = new THREE.Group(), inner = grp('inner', root), hips = grp('hips', inner);
  return { root, inner, hips };
}

// ---------- 掠奪者：雙管槍莢步行機 ----------
function buildGrunt(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.15, 1.3, 0.28, 0.42, 0.75);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.4, 0), s = new Seg();
  s.cyl(0.4, 0.5, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.bev(1.9, 1.25, 1.7, P.main, 0, 0.82, 0, 0, 0, 0, 0.2);
  s.trap(1.5, 1.0, 0.5, 1.4, P.sub, 0, 1.6, -0.05);
  s.gbox(1.0, 0.2, 0.1, P.glow, 0, 0.98, 0.86);
  s.box(1.3, 0.1, 0.14, P.dark, 0, 1.16, 0.86);
  s.box(0.5, 0.3, 0.2, P.dark, 0, 0.55, 0.86);
  s.bev(1.1, 0.9, 0.6, P.dark, 0, 0.9, -1.0, 0, 0, 0, 0.1);
  s.gbox(0.5, 0.14, 0.06, P.glow, 0, 1.0, -1.31);
  for (const sd of [-1, 1]) {
    s.bev(0.5, 0.6, 1.6, P.dark, sd * 1.25, 0.72, 0.3, 0, 0, 0, 0.08);
    s.cyl(0.1, 0.1, 1.3, GUNMETAL, sd * 1.25, 0.82, 1.6, PI / 2, 0, 0, 8);
    s.cyl(0.1, 0.1, 1.3, GUNMETAL, sd * 1.25, 0.6, 1.6, PI / 2, 0, 0, 8);
    s.bev(0.6, 0.3, 1.0, P.accent, sd * 1.25, 1.12, 0.2, 0, 0, 0, 0.06);
    s.cyl(0.24, 0.24, 0.3, P.sub, sd * 0.98, 0.75, 0.2, 0, 0, PI / 2, 8);
  }
  s.box(0.04, 1.2, 0.04, P.dark, 0.6, 2.3, -0.5);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -1.25, 0.72, 2.3);
  grp('muzzleL', waist, 1.25, 0.72, 2.3);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 2.2 };
  return root;
}

// ---------- 獵殺者：高腳長管狙擊機 ----------
function buildSniper(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.7, 1.95, 0.28, 0.3, 0.55);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.4, 0), s = new Seg();
  s.cyl(0.3, 0.4, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.bev(1.1, 1.3, 1.3, P.main, 0, 0.95, 0, 0, 0, 0, 0.14);
  s.bev(0.7, 0.5, 0.9, P.sub, 0, 1.85, 0.05, 0, 0, 0, 0.1);
  s.gsph(0.2, 0xff2020, 0, 1.85, 0.52);
  s.tor(0.26, 0.05, P.dark, 0, 1.85, 0.5);
  s.bev(0.5, 0.6, 2.0, P.dark, -0.85, 1.2, 0.2, 0, 0, 0, 0.08);
  s.cyl(0.13, 0.13, 4.6, GUNMETAL, -0.85, 1.25, 3.2, PI / 2, 0, 0, 8);
  s.bev(0.34, 0.34, 0.7, P.sub, -0.85, 1.25, 5.3, 0, 0, 0, 0.05);
  for (let j = 0; j < 3; j++) s.tor(0.2, 0.04, P.accent, -0.85, 1.25, 2.0 + j * 0.9);
  s.cyl(0.16, 0.16, 1.2, P.sub, -0.85, 1.7, 0.6, PI / 2, 0, 0, 8);
  s.gcyl(0.12, 0.12, 0.05, 0xff2020, -0.85, 1.7, 1.22, PI / 2, 0, 0, 8);
  s.bev(0.4, 1.0, 1.0, P.main, 0.75, 1.0, 0, 0, 0, 0, 0.08);
  s.poly([[0, 0], [0.8, 0], [0.1, 1.5]], 0.08, P.accent, 0.75, 1.5, -0.2, 0, PI / 2, 0);
  s.box(0.04, 1.6, 0.04, P.dark, 0.3, 2.7, -0.3);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -0.85, 1.25, 5.7);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 2.6 };
  return root;
}

// ---------- 我方步兵機 ----------
function buildTrooper(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.15, 1.3, 0.28, 0.42, 0.75);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.4, 0), s = new Seg();
  s.cyl(0.4, 0.5, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.bev(1.7, 1.2, 1.5, P.main, 0, 0.8, 0, 0, 0, 0, 0.2);
  s.sph(0.55, P.sub, 0, 1.55, 0.05, 1, 0.8, 1);
  s.gbox(0.6, 0.14, 0.1, P.glow, 0, 1.55, 0.52);
  s.bev(0.9, 0.8, 0.5, P.dark, 0, 0.9, -0.9, 0, 0, 0, 0.1);
  s.bev(0.5, 0.6, 1.5, P.dark, -1.15, 0.75, 0.3, 0, 0, 0, 0.08);
  s.cyl(0.11, 0.11, 1.5, GUNMETAL, -1.15, 0.8, 1.6, PI / 2, 0, 0, 8);
  s.cyl(0.16, 0.16, 0.3, P.accent, -1.15, 0.8, 2.3, PI / 2, 0, 0, 8);
  s.poly([[-0.6, -0.8], [0.6, -0.8], [0.7, 0.5], [0, 0.9], [-0.7, 0.5]], 0.16, P.accent, 1.2, 0.8, 0.5, 0,
      PI / 2 - 0.15, 0);
  s.gbox(0.05, 0.5, 0.5, P.glow, 1.3, 0.9, 0.52, 0, -0.15, 0);
  s.box(0.04, 1.0, 0.04, P.dark, -0.5, 2.2, -0.5);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -1.15, 0.8, 2.5);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 2.2 };
  return root;
}

// ---------- 斬擊者：雙刃近戰機 ----------
function buildRipper(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.5, 1.7, 0.26, 0.32, 0.6);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.4, 0), s = new Seg();
  s.cyl(0.3, 0.4, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.setBase(0, 0.9, 0.2, 0, 1, 0.35, 0);
  s.trap(0.9, 1.5, 1.4, 1.1, P.main, 0, 0, 0);
  s.bev(0.7, 0.5, 1.0, P.dark, 0, 0.95, 0.2, 0, 0, 0, 0.1);
  s.gsph(0.18, P.glow, 0, 0.95, 0.72);
  s.box(0.8, 0.08, 0.1, P.sub, 0, 0.95, 0.72);
  for (let j = 0; j < 3; j++) s.poly([[-0.1, 0], [0.1, 0], [0, 0.9 - j * 0.15]], 0.1, P.accent, 0,
      0.5 - j * 0.4, -0.6, -0.8, 0, 0);
  s.clearBase();
  for (const sd of [-1, 1]) {
    s.sph(0.4, P.sub, sd * 1.0, 1.35, 0.5);
    s.bev(0.3, 0.3, 1.3, P.dark, sd * 1.1, 1.0, 1.0, 0.5, 0, 0, 0.06);
    s.poly(mir([[0, 0], [0.5, 0], [0.12, 3.4], [0, 3.0]], sd), 0.1, P.sub, sd * 1.1, 0.75, 1.5, PI / 2 - 0.2, 0, 0);
    s.gpoly(mir([[0.3, 0.2], [0.44, 0.2], [0.12, 3.2], [0.06, 3.0]], sd), 0.14, P.glow, sd * 1.1, 0.75, 1.5,
        PI / 2 - 0.2, 0, 0);
  }
  s.into(waist);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 2.6 };
  return root;
}

// ---------- 行走炸彈：頂著巨型炸彈的慢速機 ----------
function buildBomber(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.1, 1.2, 0.36, 0.62, 1.25);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.5, 0), s = new Seg();
  s.cyl(0.9, 1.1, 0.5, P.dark, 0, 0.15, 0, 0, 0, 0, 12);
  s.sph(1.95, 0x8a1a14, 0, 2.1, 0);
  s.tor(1.97, 0.14, P.dark, 0, 2.1, 0, PI / 2, 0, 0);
  s.tor(1.75, 0.12, P.dark, 0, 3.0, 0, PI / 2, 0, 0);
  s.tor(1.75, 0.12, P.dark, 0, 1.2, 0, PI / 2, 0, 0);
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU;
    s.gsph(0.16, 0xff3020, Math.sin(a) * 1.98, 2.1, Math.cos(a) * 1.98);
    s.box(0.5, 0.5, 0.1, j % 2 ? 0xe0b020 : 0x141414, Math.sin(a + 0.39) * 1.82, 2.6,
        Math.cos(a + 0.39) * 1.82, 0, a + 0.39, 0);
  }
  s.cyl(0.5, 0.7, 0.5, P.dark, 0, 4.1, 0, 0, 0, 0, 10);
  s.cyl(0.12, 0.12, 0.6, STEEL, 0, 4.5, 0, 0, 0, 0, 6);
  s.bev(1.0, 0.7, 0.6, P.dark, 0, 1.6, 1.85, 0, 0, 0, 0.1);
  s.gbox(0.6, 0.16, 0.06, 0xff3020, 0, 1.65, 2.17);
  for (const sd of [-1, 1]) {
    s.bev(0.5, 0.5, 1.2, P.sub, sd * 2.0, 1.4, 0.3, 0, 0, 0, 0.08);
    s.box(0.4, 1.0, 0.4, P.dark, sd * 2.0, 0.8, 0.8, 0.3, 0, 0);
  }
  s.into(waist);
  // 炸彈頂端的警示燈（引爆倒數時會閃爍）
  const blink = grp('blink', waist, 0, 4.9, 0), b = new Seg();
  b.gsph(0.34, 0xff2010, 0, 0, 0);
  b.into(blink);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 5.2 };
  return root;
}

// ---------- 護盾發生機 ----------
function buildShielder(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.2, 1.35, 0.28, 0.44, 0.8);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.4, 0), s = new Seg();
  s.cyl(0.45, 0.55, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.bev(1.8, 1.1, 1.6, P.main, 0, 0.8, 0, 0, 0, 0, 0.2);
  s.gbox(0.9, 0.16, 0.08, 0x40a8ff, 0, 0.9, 0.82);
  s.cyl(0.5, 0.7, 0.6, P.dark, 0, 1.6, 0, 0, 0, 0, 12);
  s.cyl(1.3, 0.3, 0.7, P.sub, 0, 2.2, 0, 0, 0, 0, 16);
  s.cyl(0.08, 0.08, 1.0, STEEL, 0, 2.7, 0, 0, 0, 0, 6);
  s.gsph(0.34, 0x40a8ff, 0, 3.3, 0);
  s.gtor(1.25, 0.05, 0x40a8ff, 0, 2.56, 0, PI / 2, 0, 0);
  for (const sd of [-1, 1]) {
    s.cyl(0.4, 0.4, 1.2, 0xb87333, sd * 1.15, 0.9, -0.3, 0, 0, 0, 10);
    for (let j = 0; j < 3; j++) s.tor(0.42, 0.06, P.dark, sd * 1.15, 0.5 + j * 0.4, -0.3, PI / 2, 0, 0);
  }
  s.bev(1.2, 1.0, 0.7, P.dark, 0, 0.9, -1.05, 0, 0, 0, 0.1);
  s.vsph(3.2, 0x40a8ff, 0, 1.0, 0);
  s.into(waist);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 3.4 };
  return root;
}

// ---------- 無人機 ----------
function buildDrone(P) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.bev(1.4, 0.6, 1.9, P.main, 0, 0, 0, 0, 0, 0, 0.2);
  s.bev(0.9, 0.4, 1.1, P.sub, 0, 0.42, -0.1, 0, 0, 0, 0.12);
  s.trap(1.0, 0.5, 0.4, 0.5, P.dark, 0, 0, 1.0, PI / 2, 0, 0);
  s.gsph(0.2, P.glow, 0, 0.05, 1.0);
  for (const ax of [-1, 1]) for (const az of [-1, 1]) {
    s.box(0.16, 0.12, 1.3, P.dark, ax * 0.85, 0.1, az * 0.85, 0, Math.atan2(ax, az), 0);
    s.tor(0.62, 0.09, P.dark, ax * 1.3, 0.2, az * 1.3, PI / 2, 0, 0);
    s.tor(0.66, 0.03, P.accent, ax * 1.3, 0.3, az * 1.3, PI / 2, 0, 0);
    s.gcyl(0.46, 0.46, 0.04, P.glow, ax * 1.3, 0.12, az * 1.3, 0, 0, 0, 12);
    s.cyl(0.1, 0.1, 0.2, P.sub, ax * 1.3, 0.2, az * 1.3, 0, 0, 0, 6);
  }
  s.box(0.3, 0.3, 0.5, P.dark, 0, -0.4, 0.3);
  s.cyl(0.09, 0.09, 1.2, GUNMETAL, 0, -0.45, 0.9, PI / 2, 0, 0, 8);
  s.box(0.04, 0.6, 0.04, P.dark, 0.3, 0.8, -0.6);
  s.into(inner);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, -0.45, 1.5);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 1.5 };
  return root;
}

// ---------- 殉爆黃蜂：三角翼自爆無人機 ----------
function buildWasp(P) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.trap(1.0, 0.3, 2.6, 0.6, P.main, 0, 0, 0.4, PI / 2, 0, 0);
  s.bev(0.6, 0.5, 1.2, P.dark, 0, 0.3, -0.5, 0, 0, 0, 0.1);
  s.gsph(0.36, 0xff3020, 0, 0, 1.75);
  s.cyl(0.4, 0.3, 0.4, P.dark, 0, 0, 1.4, PI / 2, 0, 0, 10);
  for (const sd of [-1, 1]) {
    s.poly(mir([[0, 0.8], [2.1, -1.0], [2.1, -1.5], [0, -0.9]], sd), 0.12, P.sub, sd * 0.3, 0, 0, PI / 2, 0, 0);
    s.poly(mir([[0, 0], [0.5, 0], [0.5, 0.8]], sd), 0.08, P.accent, sd * 2.2, 0.4, -1.1, 0, PI / 2, 0);
    s.cyl(0.22, 0.22, 0.8, P.dark, sd * 0.5, 0, -1.1, PI / 2, 0, 0, 8);
    s.gcyl(0.16, 0.16, 0.06, 0xffa040, sd * 0.5, 0, -1.52, PI / 2, 0, 0, 8);
    for (let j = 0; j < 2; j++) s.box(0.5, 0.14, 0.14, j ? 0x141414 : 0xe0b020, sd * (1.0 + j * 0.5), 0.07,
        -0.5 - j * 0.4);
  }
  s.into(inner);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 1.4 };
  return root;
}

// ---------- 武裝砲艇 ----------
function buildGunship(P) {
  const root = new THREE.Group(), inner = grp('inner', root, 0, 1.4, 0), s = new Seg();
  s.bev(2.2, 1.9, 6.0, P.main, 0, 0, 0, 0, 0, 0, 0.4);
  s.trap(2.0, 0.8, 2.2, 1.5, P.sub, 0, -0.1, 3.9, PI / 2, 0, 0);
  s.bev(1.5, 0.7, 1.8, BLACK, 0, 0.75, 2.2, 0.25, 0, 0, 0.2);
  s.gbox(1.3, 0.06, 1.2, P.glow, 0, 1.0, 2.3, 0.25, 0, 0);
  s.bev(0.8, 0.9, 4.5, P.dark, 0, 0.3, -4.8, 0, 0, 0, 0.2);
  s.poly([[0, 0], [1.8, 0], [0.5, 1.8], [0, 1.6]], 0.14, P.main, 0, 0.6, -5.4, 0, PI / 2, 0);
  s.box(3.0, 0.14, 0.9, P.sub, 0, 0.6, -6.6);
  for (const sd of [-1, 1]) {
    s.bev(3.2, 0.3, 1.8, P.sub, sd * 2.5, 0.1, -0.2, 0, 0, sd * 0.08, 0.1);
    s.bev(1.0, 0.9, 2.4, P.dark, sd * 2.6, -0.55, 0, 0, 0, 0, 0.12);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      s.cyl(0.18, 0.18, 0.1, BLACK, sd * (2.38 + i * 0.44), -0.36 - j * 0.4, 1.21, PI / 2, 0, 0, 8);
      s.cyl(0.13, 0.04, 0.2, 0xc03020, sd * (2.38 + i * 0.44), -0.36 - j * 0.4, 1.2, PI / 2, 0, 0, 6);
    }
    s.tor(1.25, 0.2, P.dark, sd * 4.6, 0.4, -0.2, PI / 2, 0, 0);
    s.gcyl(1.05, 1.05, 0.06, P.glow, sd * 4.6, 0.25, -0.2, 0, 0, 0, 16);
    s.cyl(0.25, 0.25, 0.5, P.sub, sd * 4.6, 0.4, -0.2, 0, 0, 0, 8);
    s.box(1.0, 0.16, 0.3, P.accent, sd * 3.6, 0.3, -0.2);
    s.gbox(0.1, 0.3, 0.6, 0xff3020, sd * 1.12, 0.1, 1.5);
  }
  s.bev(0.6, 0.5, 0.8, P.dark, 0, -1.1, 2.4, 0, 0, 0, 0.1);
  s.cyl(0.12, 0.12, 1.6, GUNMETAL, 0, -1.15, 3.4, PI / 2, 0, 0, 8);
  s.into(inner);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, -2.6, -0.55, 1.4);
  grp('muzzleL', inner, 2.6, -0.55, 1.4);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 3.2 };
  return root;
}

// ---------- 履帶戰車 ----------
function buildTank(P) {
  // hull = 車體（底盤與履帶），不會跟著砲塔一起轉
  const root = new THREE.Group(), inner = grp('inner', root), hull = grp('hull', inner);
  let s = new Seg();
  s.bev(4.6, 1.3, 7.2, P.main, 0, 1.55, 0, 0, 0, 0, 0.25);
  s.trap(4.4, 3.6, 0.9, 2.0, P.sub, 0, 1.6, 3.6, PI / 2 - 0.5, 0, 0);
  s.bev(3.6, 0.5, 2.6, P.dark, 0, 2.3, -2.0, 0, 0, 0, 0.1);
  for (const sd of [-1, 1]) {
    s.bev(1.3, 1.5, 7.8, P.dark, sd * 2.7, 0.75, 0, 0, 0, 0, 0.35);
    for (let j = 0; j < 5; j++) {
      s.cyl(0.55, 0.55, 1.4, P.sub, sd * 2.7, 0.62, -2.8 + j * 1.4, 0, 0, PI / 2, 10);
      s.cyl(0.2, 0.2, 1.46, P.accent, sd * 2.7, 0.62, -2.8 + j * 1.4, 0, 0, PI / 2, 6);
    }
    s.bev(0.16, 0.9, 7.2, P.main, sd * 3.4, 1.35, 0, 0, 0, 0, 0.05);
    s.box(0.2, 0.3, 7.22, P.accent, sd * 3.4, 1.6, 0);
    s.cyl(0.2, 0.2, 1.6, GUNMETAL, sd * 1.6, 2.6, -3.0, 0.3, 0, 0, 8);
    s.gbox(0.5, 0.25, 0.08, P.glow, sd * 1.6, 1.7, 3.62);
    s.bev(1.0, 0.5, 1.4, P.dark, sd * 1.5, 2.45, -1.6, 0, 0, 0, 0.08);
  }
  s.into(hull);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', inner, 0, 2.3, -0.3);
  s = new Seg();
  s.cyl(1.5, 1.7, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 14);
  s.bev(3.0, 1.2, 3.6, P.main, 0, 0.8, 0, 0, 0, 0, 0.3);
  s.trap(2.6, 1.6, 0.9, 1.2, P.sub, 0, 0.8, 2.1, PI / 2, 0, 0);
  s.cyl(0.6, 0.7, 0.5, P.dark, 0.7, 1.6, -0.6, 0, 0, 0, 10);
  s.gsph(0.18, P.glow, 0.7, 1.9, -0.3);
  s.cyl(0.3, 0.3, 5.0, GUNMETAL, 0, 0.8, 4.6, PI / 2, 0, 0, 10);
  s.cyl(0.4, 0.4, 1.4, P.sub, 0, 0.8, 3.0, PI / 2, 0, 0, 10);
  s.bev(0.9, 0.7, 1.0, P.dark, 0, 0.8, 7.2, 0, 0, 0, 0.08);
  for (const sd of [-1, 1]) {
    s.bev(0.7, 0.8, 1.6, P.dark, sd * 1.9, 1.0, -0.4, 0, 0, 0, 0.08);
    for (let j = 0; j < 2; j++) s.cyl(0.16, 0.16, 0.1, 0xc03020, sd * 1.9, 0.82 + j * 0.36, 0.42, PI / 2, 0, 0, 8);
  }
  s.box(0.05, 1.8, 0.05, P.dark, -1.0, 2.2, -1.4);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, 0, 0.8, 7.8);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'tank', height: 4.2 };
  return root;
}

// ---------- 自爆蜘蛛 ----------
function buildSpider(P, glowCol) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.ico(0.9, P.main, 0, 1.0, 0, 1, 0.75, 1);
  s.cyl(0.5, 0.7, 0.3, P.dark, 0, 0.55, 0, 0, 0, 0, 10);
  s.gsph(0.42, glowCol, 0, 1.5, 0);
  for (let j = 0; j < 4; j++) {
    const a = j / 4 * TAU + PI / 4;
    s.gbox(0.12, 0.3, 0.12, glowCol, Math.cos(a) * 0.75, 1.0, Math.sin(a) * 0.75);
  }
  for (const ax of [-1, 1]) for (const az of [-1, 1]) {
    s.setBase(ax * 0.5, 1.1, az * 0.5, Math.atan2(ax, az), 1, 0, 0);
    s.box(0.2, 0.2, 1.3, P.dark, 0, 0.3, 0.7, -0.5, 0, 0);
    s.sph(0.2, P.accent, 0, 0.62, 1.25);
    s.box(0.16, 1.7, 0.16, P.sub, 0, -0.2, 1.45, -0.18, 0, 0);
    s.clearBase();
  }
  s.into(inner);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'crawler', height: 1.8 };
  return root;
}

// ---------- 迫擊砲蟹 ----------
function buildMortar(P) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.bev(2.6, 1.0, 3.0, P.main, 0, 1.3, 0, 0, 0, 0, 0.25);
  s.trap(2.4, 1.6, 0.5, 2.4, P.sub, 0, 2.0, 0);
  s.gbox(0.8, 0.18, 0.08, P.glow, 0, 1.4, 1.52);
  for (const ax of [-1, 1]) for (const az of [-1, 1]) {
    s.setBase(ax * 1.1, 1.2, az * 1.1, Math.atan2(ax, az), 1, 0, 0);
    s.bev(0.4, 0.4, 1.5, P.dark, 0, 0.25, 0.8, -0.45, 0, 0, 0.08);
    s.sph(0.3, P.accent, 0, 0.6, 1.45);
    s.bev(0.32, 1.7, 0.32, P.sub, 0, -0.25, 1.7, -0.2, 0, 0, 0.06);
    s.bev(0.7, 0.2, 0.9, P.dark, 0, -1.1, 1.9, 0, 0, 0, 0.05);
    s.clearBase();
  }
  s.cyl(0.9, 1.0, 0.4, P.dark, 0, 2.4, -0.2, 0, 0, 0, 12);
  s.setBase(0, 2.6, -0.2, 0, 1, -0.95, 0);
  s.cyl(0.5, 0.5, 2.8, GUNMETAL, 0, 0, 1.4, PI / 2, 0, 0, 12);
  s.tor(0.54, 0.08, P.accent, 0, 0, 2.7);
  s.tor(0.54, 0.08, P.accent, 0, 0, 1.2);
  s.cyl(0.34, 0.34, 0.1, BLACK, 0, 0, 2.82, PI / 2, 0, 0, 10);
  s.clearBase();
  for (let j = 0; j < 3; j++) s.cyl(0.2, 0.08, 0.7, 0xc08020, -0.9 + j * 0.9, 2.2, -1.3, 0, 0, 0, 8);
  s.into(inner);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, 4.9, 1.4);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'crawler', height: 3.2 };
  return root;
}

// ---------- 哨戒砲塔 ----------
function buildTurret(P) {
  const root = new THREE.Group(), inner = grp('inner', root);
  let s = new Seg();
  for (let j = 0; j < 3; j++) {
    const a = j / 3 * TAU;
    s.setBase(0, 0.9, 0, a, 1, 0, 0);
    s.box(0.3, 0.3, 2.0, P.dark, 0, -0.4, 0.9, 0.45, 0, 0);
    s.bev(0.6, 0.2, 0.8, P.sub, 0, -0.8, 1.7, 0, 0, 0, 0.05);
    s.clearBase();
  }
  s.cyl(0.4, 0.55, 1.5, P.dark, 0, 1.1, 0, 0, 0, 0, 12);
  s.cyl(0.7, 0.7, 0.2, P.accent, 0, 1.85, 0, 0, 0, 0, 12);
  s.into(inner);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', inner, 0, 1.95, 0);
  s = new Seg();
  s.bev(1.5, 1.0, 1.9, P.main, 0, 0.6, 0, 0, 0, 0, 0.16);
  s.trap(1.3, 0.8, 0.4, 1.5, P.sub, 0, 1.25, 0);
  s.gbox(0.5, 0.2, 0.08, P.glow, 0, 0.75, 0.97);
  for (const sd of [-1, 1]) {
    s.bev(0.5, 0.6, 1.4, P.dark, sd * 1.0, 0.55, 0.2, 0, 0, 0, 0.08);
    s.cyl(0.13, 0.13, 2.2, GUNMETAL, sd * 1.0, 0.55, 1.8, PI / 2, 0, 0, 8);
    s.cyl(0.2, 0.2, 0.3, P.accent, sd * 1.0, 0.55, 2.8, PI / 2, 0, 0, 8);
    s.cyl(0.36, 0.36, 0.5, P.sub, sd * 1.0, 0.0, 0, 0, 0, PI / 2, 10);
  }
  s.box(0.04, 1.1, 0.04, P.dark, 0.4, 1.9, -0.6);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -1.0, 0.55, 3.0);
  grp('muzzleL', waist, 1.0, 0.55, 3.0);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'static', height: 3.4 };
  return root;
}

// ---------- 修護機 ----------
function buildMedic(P, col = 0x5dff8a) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.sph(0.8, P.sub, 0, 0, 0, 1, 0.85, 1);
  s.tor(1.2, 0.1, P.main, 0, 0, 0, PI / 2, 0, 0);
  s.gtor(1.32, 0.03, col, 0, 0, 0, PI / 2, 0, 0);
  s.gbox(0.5, 0.16, 0.08, col, 0, 0.25, 0.78, -0.3, 0, 0);
  s.gbox(0.16, 0.5, 0.08, col, 0, 0.25, 0.78, -0.3, 0, 0);
  s.gcyl(0.4, 0.4, 0.05, col, 0, -0.72, 0, 0, 0, 0, 12);
  for (const sd of [-1, 1]) {
    s.box(0.12, 0.12, 0.9, P.dark, sd * 0.8, -0.35, 0.5, 0.4, 0, 0);
    s.gsph(0.12, col, sd * 0.8, -0.55, 0.95);
  }
  s.box(0.04, 0.7, 0.04, P.dark, 0, 1.0, -0.3);
  s.into(inner);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, -0.5, 1.0);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 1.6 };
  return root;
}

// ============================================================
//  Boss 1：巨像・毀滅者 ─ 猩猩體型的陸戰巨兵
// ============================================================
function buildColossus(P) {
  const g = { thigh: 4.6, shin: 5.0, footH: 1.6, hipW: 3.3, legT: 2.2, bulk: 2.6, tb: -0.25, kb: 0.55 };
  const root = new THREE.Group(), inner = grp('inner', root), hips = grp('hips', inner);
  pelvis(hips, P, g);
  const hipY = bipedLegs(hips, P, g, 'heavy');
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 2.7, 0), tw = 10, th = 6.4, td = 6.6, cy = 1.0 + th / 2;
  let s = new Seg();
  s.cyl(2.2, 2.6, 1.4, P.dark, 0, 0.5, 0, 0, 0, 0, 16);
  for (let j = 0; j < 3; j++) s.tor(2.5 + j * 0.2, 0.2, P.sub, 0, 0.3 + j * 0.5, 0, PI / 2, 0, 0);
  s.setBase(0, cy + 0.4, 0.3, 0, 1, 0.15, 0);  // 前傾的巨大胸腔
  s.bev(tw, th * 0.8, td, P.main, 0, 0, 0, 0, 0, 0, 0.7);
  s.trap(tw * 0.6, tw * 0.9, th * 0.34, td * 0.9, P.dark, 0, -th * 0.5, 0);
  s.gsph(1.5, P.glow, 0, -0.2, td / 2 - 0.1);
  s.tor(1.9, 0.3, P.dark, 0, -0.2, td / 2 + 0.3);
  for (let j = 0; j < 4; j++) {
    const a = j / 4 * TAU + PI / 4;
    s.bev(0.5, 1.6, 0.5, P.accent, Math.cos(a) * 1.9, -0.2 + Math.sin(a) * 1.9, td / 2 + 0.4, 0, 0, a - PI / 2, 0.1);
  }
  for (const sd of [-1, 1]) {
    for (let j = 0; j < 3; j++) s.bev(2.6, 0.7, 0.7, P.sub, sd * 3.1, -1.6 + j * 1.1, td / 2 + 0.2, 0, 0,
        sd * 0.2, 0.12);
    s.gbox(1.4, 0.3, 0.1, P.glow, sd * 3.0, 1.9, td / 2 + 0.05);
    s.sph(2.9, P.main, sd * (tw / 2 + 0.6), 1.8, -0.2, 1, 0.85, 1.1);
    s.tor(2.6, 0.3, P.accent, sd * (tw / 2 + 0.6), 1.8, -0.2, 0, PI / 2, 0);
    for (let j = 0; j < 3; j++) s.cyl(0.03, 0.55, 2.8, P.accent, sd * (tw / 2 + 0.8 + j * 0.9), 4.2 - j * 0.5,
        -0.2, 0, 0, -sd * (0.2 + j * 0.45), 8);
    for (let j = 0; j < 2; j++) {  // 背部煙囪
      s.cyl(0.7, 0.85, 5.0, P.sub, sd * (1.6 + j * 1.9), 4.4 - j * 0.6, -td / 2 - 0.4, -0.2, 0, 0, 12);
      s.gcyl(0.5, 0.5, 0.1, 0xff7a20, sd * (1.6 + j * 1.9), 6.85 - j * 0.6, -td / 2 - 0.9, -0.2, 0, 0, 10);
    }
  }
  for (let j = 0; j < 5; j++) s.poly([[-0.3, 0], [0.3, 0], [0, 2.2 - j * 0.2]], 0.5, P.accent, 0,
      2.6 - j * 1.2, -td / 2 - 0.2, -0.9, 0, 0);
  s.clearBase();
  s.into(waist);

  // 頭部
  const head = grp('head', waist, 0, cy + th * 0.5 - 0.3, 3.2);
  s = new Seg();
  s.bev(2.4, 1.9, 2.6, P.dark, 0, 0.8, 0, 0.1, 0, 0, 0.3);
  s.trap(2.6, 1.6, 0.9, 2.4, P.main, 0, 1.9, -0.2);
  s.trap(1.8, 1.2, 0.9, 0.8, P.sub, 0, -0.1, 1.0, 0.2, 0, 0);
  for (const sd of [-1, 1]) {
    s.gbox(0.6, 0.2, 0.1, P.glow, sd * 0.6, 1.0, 1.34, 0, 0, sd * 0.25);
    s.gbox(0.4, 0.14, 0.1, P.glow, sd * 0.8, 0.6, 1.3, 0, 0, sd * 0.25);
    s.poly(mir([[0, 0], [0.8, 0], [2.2, 2.6], [1.6, 3.4], [1.3, 2.4]], sd), 0.5, P.accent, sd * 0.9, 1.6, 0.2,
        -0.2, 0, 0);
    for (let j = 0; j < 3; j++) s.box(0.14, 0.5, 0.2, STEEL, sd * (0.3 + j * 0.3), -0.3, 1.36);
  }
  s.into(head);

  // 長臂 + 前臂三管機砲
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1, nm = i ? 'R' : 'L';
    // 肩膀與上臂
    const sh = grp('shoulder' + nm, waist, sd * (tw / 2 + 1.4), cy + 1.6, 0.3);
    s = new Seg();
    s.bev(2.4, 5.2, 2.6, P.dark, 0, -3.0, 0, 0, 0, 0, 0.3);
    s.bev(2.7, 2.2, 2.9, P.sub, 0, -2.4, 0, 0, 0, 0, 0.2);
    s.cyl(0.3, 0.3, 4.0, STEEL, 0, -3.0, -1.5, 0, 0, 0, 8);
    s.cyl(1.5, 1.5, 3.0, P.dark, 0, -5.8, 0, 0, 0, PI / 2, 14);
    s.cyl(0.8, 0.8, 3.2, P.accent, 0, -5.8, 0, 0, 0, PI / 2, 10);
    s.into(sh);
    // 前臂
    const fa = grp('forearm' + nm, sh, 0, -5.8, 0);
    s = new Seg();
    s.bev(3.0, 3.0, 5.4, P.main, 0, 0, 2.8, 0, 0, 0, 0.4);
    s.bev(0.6, 3.6, 4.6, P.sub, sd * 1.7, 0.2, 2.6, 0, 0, 0, 0.15);
    s.box(0.64, 0.5, 4.62, P.accent, sd * 1.7, 0.2, 2.6);
    s.cyl(1.3, 1.3, 1.2, P.dark, 0, 0, 5.8, PI / 2, 0, 0, 14);
    for (let j = 0; j < 3; j++) {
      const a = j / 3 * TAU + PI / 2;
      s.cyl(0.45, 0.45, 4.6, GUNMETAL, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 8.4, PI / 2, 0, 0, 10);
      s.cyl(0.3, 0.3, 0.1, BLACK, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 10.72, PI / 2, 0, 0, 8);
    }
    s.cyl(1.35, 1.35, 0.4, P.sub, 0, 0, 10.0, PI / 2, 0, 0, 14);
    s.gbox(0.2, 0.4, 3.0, P.glow, -sd * 1.52, 0.6, 2.8);
    s.into(fa);
    // 槍口位置（左右手各一個）
    grp('muzzle' + nm, fa, 0, 0, 11);
  }
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: { L1: g.thigh, L2: g.shin, fH: g.footH, tb: g.tb, kb: g.kb, off: 0.26 }, hipY,
      height: hipY + 2.7 + cy + th * 0.5 + 3.4 };
  hips.position.y = hipY;
  return root;
}

// ============================================================
//  Boss 2：天災・暴風之翼 ─ 巨型飛翼砲艇
// ============================================================
function buildTempest(P) {
  const root = new THREE.Group(), inner = grp('inner', root, 0, 3, 0), s = new Seg();
  s.bev(4.4, 2.6, 15, P.main, 0, 0, 0, 0, 0, 0, 0.7);
  s.trap(4.0, 1.2, 5.2, 2.0, P.sub, 0, -0.1, 9.8, PI / 2, 0, 0);
  s.bev(2.0, 0.9, 3.6, BLACK, 0, 1.2, 6.3, 0.12, 0, 0, 0.3);
  s.gbox(1.7, 0.08, 2.6, P.glow, 0, 1.56, 6.4, 0.12, 0, 0);
  s.bev(1.0, 0.8, 11, P.dark, 0, 1.5, -1.0, 0, 0, 0, 0.2);
  s.gbox(0.3, 0.1, 9, P.glow, 0, 1.92, -1.0);
  for (let j = 0; j < 6; j++) s.box(4.44, 0.2, 0.3, P.accent, 0, -0.4, -6 + j * 2.2);
  for (const sd of [-1, 1]) {
    s.poly(mir([[0, 5.5], [16, -3.5], [16, -6], [6, -7], [0, -6.5]], sd), 0.6, P.main, sd * 2.0, 0.2, 0, PI / 2, 0, 0);
    s.poly(mir([[0.5, 2.5], [10, -4], [10, -5.5], [0.5, -5]], sd), 0.3, P.sub, sd * 2.2, 0.56, 0, PI / 2, 0, 0);
    s.gpoly(mir([[0.3, 5.3], [16, -3.5], [16, -3.9], [0.3, 4.7]], sd), 0.7, P.glow, sd * 2.0, 0.2, 0, PI / 2, 0, 0);
    s.poly(mir([[0, 0], [2.4, 0], [0.6, 2.8], [0, 2.4]], sd), 0.2, P.sub, sd * 18.0, 1.6, -4.4, 0, PI / 2, 0);
    for (const ex of [6.5, 11.5]) {
      s.cyl(1.15, 1.15, 5.4, P.dark, sd * ex, -0.7, -2.2 - (ex - 6.5) * 0.4, PI / 2, 0, 0, 14);
      s.tor(1.2, 0.16, P.accent, sd * ex, -0.7, 0.5 - (ex - 6.5) * 0.4);
      s.cyl(0.5, 0.02, 1.0, P.sub, sd * ex, -0.7, 0.9 - (ex - 6.5) * 0.4, -PI / 2, 0, 0, 10);
      s.gcyl(0.9, 0.9, 0.1, 0xffb040, sd * ex, -0.7, -4.95 - (ex - 6.5) * 0.4, PI / 2, 0, 0, 14);
      for (let j = 0; j < 2; j++) {
        s.bev(0.5, 0.5, 2.6, P.dark, sd * (ex + 2.2), -0.6, -1 - j * 0.8, 0, 0, 0, 0.08);
        s.cyl(0.2, 0.04, 0.5, 0xc03020, sd * (ex + 2.2), -0.6, 0.5 - j * 0.8, PI / 2, 0, 0, 8);
      }
    }
    s.poly(mir([[0, 0], [3.2, 0], [1.0, 3.6], [0, 3.2]], sd), 0.2, P.main, sd * 1.9, 1.2, -8.0, 0,
        PI / 2 + sd * 0.25, 0);
    s.gbox(0.2, 0.4, 1.0, 0xff3020, sd * 2.25, 0.2, 5.5);
  }
  s.poly([[-5, 0], [5, 0], [3, 1.6], [-3, 1.6]], 0.3, P.sub, 0, 0.2, -8.6, -PI / 2, 0, 0);
  s.bev(3.0, 0.8, 6.0, P.dark, 0, -1.5, -1.5, 0, 0, 0, 0.2);
  for (let j = 0; j < 4; j++) s.gbox(2.0, 0.06, 0.2, 0xffb040, 0, -1.92, -3.5 + j * 1.3);
  s.into(inner);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', inner, 0, -1.9, 4.0), t = new Seg();
  t.cyl(1.4, 1.2, 0.8, P.dark, 0, 0, 0, 0, 0, 0, 14);
  t.bev(2.6, 1.3, 3.0, P.sub, 0, -0.8, 0.3, 0, 0, 0, 0.3);
  for (const sd of [-1, 1]) {
    t.cyl(0.35, 0.35, 6.0, GUNMETAL, sd * 0.8, -0.9, 4.2, PI / 2, 0, 0, 10);
    t.bev(0.9, 0.7, 0.9, P.dark, sd * 0.8, -0.9, 7.0, 0, 0, 0, 0.08);
    t.cyl(0.5, 0.5, 1.6, P.main, sd * 0.8, -0.9, 2.0, PI / 2, 0, 0, 10);
  }
  t.gsph(0.3, 0xff3020, 0, -1.2, 1.8);
  t.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -0.8, -0.9, 7.6);
  grp('muzzleL', waist, 0.8, -0.9, 7.6);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 6 };
  return root;
}

// ============================================================
//  Boss 3：蛛后・織網者 ─ 六足孵化母體
// ============================================================
function buildArachne(P) {
  const H = 6.4, root = new THREE.Group(), inner = grp('inner', root), hips = grp('hips', inner, 0, H, 0);
  let s = new Seg();
  s.ico(1, P.main, 0, 0, 2, 4.4, 2.7, 4.8);
  s.bev(5.4, 0.9, 5.4, P.sub, 0, 2.2, 1.8, 0.12, 0, 0, 0.3);
  s.sph(1, P.dark, 0, 2.6, -7.5, 6.2, 4.8, 7.6);
  for (let j = 0; j < 4; j++) s.tor(5.6 - j * j * 0.25, 0.35, P.accent, 0, 2.6 + j * 0.2, -4.5 - j * 2.2, 0, 0, 0);
  for (let j = 0; j < 5; j++) s.cyl(0.04, 0.6, 2.6, P.sub, 0, 7.0 - j * 0.3 - (j > 2 ? (j - 2) * 0.9 : 0),
      -4.2 - j * 1.8, -0.4 - j * 0.15, 0, 0, 8);
  for (const sd of [-1, 1]) {
    for (let j = 0; j < 4; j++) s.gsph(1.15 - j * 0.1, P.glow, sd * (4.6 + (j % 2) * 0.9), 1.6 + (j % 2) * 1.6,
        -4.5 - j * 1.9);  // 卵囊
    s.gsph(0.9, P.glow, sd * 2.0, 6.3, -8.5);
    s.bev(1.6, 0.8, 3.0, P.sub, sd * 3.2, 1.4, 2.0, 0, 0, sd * 0.4, 0.2);
  }
  s.gsph(1.2, P.glow, 0, 1.6, -14.6);
  s.cyl(1.3, 0.8, 1.2, P.dark, 0, 1.6, -14.0, PI / 2, 0, 0, 12);
  s.cyl(1.6, 1.2, 1.6, P.dark, 0, -1.6, 1.0, 0, 0, 0, 12);
  s.gcyl(0.9, 0.9, 0.1, P.glow, 0, -2.42, 1.0, 0, 0, 0, 12);
  s.into(hips);
  const mlegs = [];
  [[1, 4.6, 0.9], [-1, 4.6, 0.9], [1, 2.0, 0.1], [-1, 2.0, 0.1], [1, -0.6, -0.7],
      [-1, -0.6, -0.7]].forEach(([sx, z, zd], i) => {
    const tripodA = i === 0 || i === 3 || i === 4;
    mlegs.push(multiLeg(hips, P, i, sx * 3.7, 0.3, z, Math.atan2(sx, zd),
        { T: 0.9, up: 7, upAng: 0.8, lo: 11.6, loAng: 0.2, phase: tripodA ? 0 : PI, blade: true, sweep: 0.22,
        lift: 0.22 }));
  });
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.2, 5.8);
  s = new Seg();
  s.bev(3.4, 2.4, 2.8, P.dark, 0, 0, 0.6, 0, 0, 0, 0.4);
  s.trap(3.0, 2.0, 1.0, 2.4, P.main, 0, 1.5, 0.4);
  for (const sd of [-1, 1]) {
    s.gsph(0.42, 0xff2020, sd * 0.7, 0.5, 2.0);
    s.gsph(0.26, 0xff2020, sd * 1.3, 0.9, 1.7);
    s.gsph(0.2, 0xff2020, sd * 0.4, 1.1, 1.9);
    s.setBase(sd * 1.6, -0.7, 1.6, -sd * 0.22, 1, 0, 0);
    s.bev(1.0, 1.0, 3.6, P.sub, 0, 0, 1.6, 0, 0, 0, 0.14);
    s.cyl(0.36, 0.36, 2.4, GUNMETAL, 0, 0, 4.2, PI / 2, 0, 0, 10);
    s.tor(0.5, 0.1, P.accent, 0, 0, 3.4);
    s.clearBase();
    s.poly(mir([[0, 0], [0.7, 0], [0.2, 2.6]], sd), 0.4, P.accent, sd * 0.6, -1.0, 2.2, PI / 2 + 0.6, 0, 0);
  }
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -2.4, -0.7, 6.6);
  grp('muzzleL', waist, 2.4, -0.7, 6.6);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'quad', mlegs, hipY: H, height: 11 };
  return root;
}

// ============================================================
//  Boss 4：鋼鐵要塞・不落城 ─ 履帶式陸上戰艦
// ============================================================
function buildCitadel(P) {
  // hull = 車體（底盤與履帶），不會跟著砲塔一起轉
  const root = new THREE.Group(), inner = grp('inner', root), hull = grp('hull', inner);
  let s = new Seg();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    s.bev(3.4, 3.2, 8.6, P.dark, sx * 6.4, 1.6, sz * 5.8, 0, 0, 0, 0.7);
    for (let j = 0; j < 4; j++) {
      s.cyl(1.1, 1.1, 3.6, P.sub, sx * 6.4, 1.2, sz * 5.8 - 3 + j * 2, 0, 0, PI / 2, 12);
      s.cyl(0.4, 0.4, 3.7, P.accent, sx * 6.4, 1.2, sz * 5.8 - 3 + j * 2, 0, 0, PI / 2, 8);
    }
    s.bev(3.6, 0.5, 8.8, P.main, sx * 6.4, 3.4, sz * 5.8, 0, 0, 0, 0.15);
    s.gbox(0.5, 0.4, 0.1, 0xfff0c0, sx * 6.4, 2.6, sz * 10.15);
  }
  s.bev(11, 3.4, 21, P.main, 0, 3.8, 0, 0, 0, 0, 0.5);
  s.trap(12.5, 10, 3.2, 1.0, P.sub, 0, 2.6, 11.2, -0.3, 0, 0);
  for (let j = -3; j <= 3; j++) s.box(0.9, 2.8, 0.12, j % 2 ? 0x141414 : 0xe0b020, j * 1.5, 2.6, 11.72, -0.3, 0, 0.5);
  s.bev(9, 2.4, 13, P.sub, 0, 6.7, -1.5, 0, 0, 0, 0.4);
  s.box(11.04, 0.4, 21.04, P.accent, 0, 4.6, 0);
  s.bev(4.2, 4.2, 4.2, P.dark, 0, 9.9, -6.5, 0, 0, 0, 0.4);
  s.gbox(3.6, 0.5, 0.1, P.glow, 0, 10.8, -4.38);
  s.gbox(0.1, 0.5, 3.4, P.glow, 2.12, 10.8, -6.5);
  s.gbox(0.1, 0.5, 3.4, P.glow, -2.12, 10.8, -6.5);
  s.bev(4.6, 0.5, 4.6, P.main, 0, 12.2, -6.5, 0, 0, 0, 0.15);
  s.cyl(0.2, 0.2, 2.4, STEEL, 0, 13.6, -6.5, 0, 0, 0, 8);
  for (let j = 0; j < 3; j++) {
    s.cyl(0.7, 0.85, 3.6, P.dark, -3 + j * 3, 8.6, -9.5, -0.15, 0, 0, 12);
    s.gcyl(0.5, 0.5, 0.1, 0xff7a20, -3 + j * 3, 10.4, -9.8, -0.15, 0, 0, 10);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {  // 側舷砲座
    s.setBase(sx * 5.4, 6.0, sz * 5.4 - 1.5, Math.atan2(sx, sz * 0.4), 1, 0, 0);
    s.cyl(1.2, 1.4, 0.8, P.dark, 0, 0, 0, 0, 0, 0, 12);
    s.bev(1.8, 1.2, 2.0, P.main, 0, 0.9, 0.2, 0, 0, 0, 0.2);
    s.cyl(0.18, 0.18, 2.6, GUNMETAL, -0.4, 0.9, 2.2, PI / 2, 0, 0, 8);
    s.cyl(0.18, 0.18, 2.6, GUNMETAL, 0.4, 0.9, 2.2, PI / 2, 0, 0, 8);
    s.gsph(0.22, 0xff3020, 0, 1.3, 1.1);
    s.clearBase();
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    s.bev(1.2, 0.3, 1.2, P.dark, -1.6 + i * 1.6, 8.0, -1.0 + j * 1.7, 0, 0, 0, 0.08);
    s.cyl(0.36, 0.36, 0.1, 0xc03020, -1.6 + i * 1.6, 8.2, -1.0 + j * 1.7, 0, 0, 0, 10);
  }
  s.into(hull);
  // 持續旋轉的雷達天線
  const dish = grp('spinA', hull, 0, 14.8, -6.5), ds = new Seg();
  ds.poly([[-2.4, 0], [2.4, 0], [1.8, 1.4], [-1.8, 1.4]], 0.2, P.sub, 0, 0, 0.3, -0.3, 0, 0);
  ds.cyl(0.3, 0.3, 0.6, P.dark, 0, -0.2, 0, 0, 0, 0, 8);
  ds.gbox(0.3, 0.3, 0.2, P.glow, 0, 0.7, 0.5);
  ds.into(dish);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', inner, 0, 8.0, 4.2);
  s = new Seg();
  s.cyl(3.0, 3.3, 0.6, P.dark, 0, 0.1, 0, 0, 0, 0, 20);
  s.bev(7, 2.8, 7.6, P.main, 0, 1.8, 0, 0, 0, 0, 0.6);
  s.trap(6.2, 4.4, 2.0, 2.4, P.sub, 0, 1.8, 4.4, PI / 2, 0, 0);
  s.box(7.04, 0.4, 7.64, P.accent, 0, 1.0, 0);
  for (const sd of [-1, 1]) {
    s.cyl(0.65, 0.65, 10.5, GUNMETAL, sd * 1.4, 1.9, 9.0, PI / 2, 0, 0, 12);
    s.cyl(0.95, 0.95, 3.0, P.sub, sd * 1.4, 1.9, 5.2, PI / 2, 0, 0, 12);
    s.bev(1.7, 1.3, 1.8, P.dark, sd * 1.4, 1.9, 14.4, 0, 0, 0, 0.14);
    s.bev(1.2, 1.0, 2.0, P.dark, sd * 4.0, 2.4, -0.5, 0, 0, 0, 0.14);
    s.gcyl(0.36, 0.36, 0.1, 0xff3020, sd * 4.0, 2.4, 0.56, PI / 2, 0, 0, 10);
  }
  s.cyl(1.0, 1.2, 0.9, P.dark, 1.6, 3.6, -1.8, 0, 0, 0, 12);
  s.gsph(0.3, P.glow, 1.6, 4.2, -1.3);
  s.box(0.08, 3.0, 0.08, P.dark, -2.4, 4.6, -3.0);
  s.into(waist);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', waist, -1.4, 1.9, 15.4);
  grp('muzzleL', waist, 1.4, 1.9, 15.4);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'tank', height: 14, spins: [{ name: 'spinA', axis: 'y', speed: 1.2 }] };
  return root;
}

// ============================================================
//  Boss 5：審判之眼 ─ 浮游幾何核心
// ============================================================
function buildOculus(P) {
  const root = new THREE.Group(), inner = grp('inner', root, 0, 6, 0);
  let s = new Seg();
  s.sph(3.6, P.dark, 0, 0, 0);
  s.setBase(0, 2.3, 1.2, 0, 1, 0.5, 0);
  s.bev(6.4, 1.3, 4.6, P.main, 0, 0, 0, 0, 0, 0, 0.4);
  s.box(6.44, 0.3, 4.64, P.sub, 0, -0.3, 0);
  s.clearBase();
  s.setBase(0, -2.3, 1.2, 0, 1, -0.5, 0);
  s.bev(5.6, 1.1, 4.2, P.main, 0, 0, 0, 0, 0, 0, 0.4);
  s.box(5.64, 0.3, 4.24, P.sub, 0, 0.3, 0);
  s.clearBase();
  s.gcyl(2.3, 2.3, 0.2, P.glow, 0, 0, 3.2, PI / 2, 0, 0, 28);
  s.tor(2.45, 0.22, P.sub, 0, 0, 3.2);
  s.cyl(1.0, 1.0, 0.3, BLACK, 0, 0, 3.4, PI / 2, 0, 0, 20);
  s.gcyl(0.36, 0.36, 0.34, 0xffffff, 0, 0, 3.4, PI / 2, 0, 0, 12);
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU;
    s.box(0.2, 0.9, 0.2, P.sub, Math.cos(a) * 1.75, Math.sin(a) * 1.75, 3.3, 0, 0, a - PI / 2);
  }
  for (let j = 0; j < 5; j++) s.poly([[-0.5, 0], [0.5, 0], [0, 3.0 - j * 0.3]], 0.4, P.main, 0, 2.6 - j * 1.3,
      -3.2, -1.2, 0, 0);
  for (let j = 0; j < 3; j++) {
    const a = j / 3 * TAU;
    s.cyl(0.9 - j * 0.1, 0.03, 4.0, P.sub, Math.sin(a) * 1.6, -5.2, Math.cos(a) * 1.6, 0, 0, 0, 8);
    s.gsph(0.3, P.glow, Math.sin(a) * 1.6, -3.3, Math.cos(a) * 1.6);
  }
  s.vsph(4.6, P.glow, 0, 0, 0);
  s.into(inner);
  // 以下幾個 spin 關節是會持續旋轉的外環（轉速與轉軸寫在最後的 userData.spins）
  const a = grp('spinA', inner), sa = new Seg();
  sa.tor(6.0, 0.36, P.sub, 0, 0, 0, 0, PI / 2, 0);
  sa.gtor(6.0, 0.08, P.glow, 0.4, 0, 0, 0, PI / 2, 0);
  for (let j = 0; j < 4; j++) {
    const an = j / 4 * TAU;
    sa.bev(1.0, 1.0, 1.0, P.main, 0, Math.cos(an) * 6, Math.sin(an) * 6, an, 0, 0, 0.2);
    sa.gbox(1.1, 0.3, 0.3, P.glow, 0, Math.cos(an) * 6, Math.sin(an) * 6, an, 0, 0);
  }
  sa.into(a);
  const b = grp('spinB', inner), sb = new Seg();
  sb.tor(7.4, 0.3, P.main);
  sb.gtor(7.4, 0.07, P.glow, 0, 0, 0.36);
  for (let j = 0; j < 6; j++) {
    const an = j / 6 * TAU;
    sb.poly([[-0.5, 0], [0.5, 0], [0, 1.8]], 0.3, P.accent, Math.sin(an) * 7.6, Math.cos(an) * 7.6, 0, 0, 0, -an);
  }
  sb.into(b);
  const c = grp('spinC', inner), sc = new Seg();
  sc.tor(8.8, 0.22, P.sub, 0, 0, 0, PI / 2, 0, 0);
  for (let j = 0; j < 8; j++) {
    const an = j / 8 * TAU, x = Math.sin(an) * 8.8, z = Math.cos(an) * 8.8;
    sc.bev(1.0, 3.4, 1.0, j % 2 ? P.main : P.sub, x, 0, z, 0, an, 0, 0.3);
    sc.cyl(0.03, 0.6, 1.4, P.accent, x, 2.4, z, 0, 0, 0, 4);
    sc.cyl(0.6, 0.03, 1.4, P.accent, x, -2.4, z, 0, 0, 0, 4);
    sc.gbox(0.3, 2.2, 0.3, P.glow, Math.sin(an) * 9.3, 0, Math.cos(an) * 9.3, 0, an, 0);
  }
  sc.into(c);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, 0, 3.8);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 12,
      spins: [{ name: 'spinA', axis: 'y', speed: 0.9 }, { name: 'spinB', axis: 'x', speed: -0.6 },
          { name: 'spinC', axis: 'y', speed: -0.35 }] };
  return root;
}

// ---------- 跳躍獵兵：粗腿 + 背部跳躍推進器 ----------
function buildLeaper(P) {
  // 骨架與雙腿（smallLegs 後面五個數字：大腿長、小腿長、腳掌高、腿粗、髖寬）
  const { root, hips } = walkerBase(), L = smallLegs(hips, P, 1.5, 1.6, 0.4, 0.56, 0.95);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 0.5, 0), s = new Seg();
  s.cyl(0.5, 0.6, 0.3, P.dark, 0, 0.1, 0, 0, 0, 0, 10);
  s.bev(2.0, 1.3, 2.2, P.main, 0, 0.85, 0.1, 0, 0, 0, 0.3);
  s.trap(1.8, 1.0, 0.7, 1.6, P.sub, 0, 1.75, -0.3);
  s.tor(0.34, 0.07, P.accent, 0, 0.95, 1.22);
  s.gsph(0.26, P.glow, 0, 0.95, 1.2);
  for (const sd of [-1, 1]) {
    s.cyl(0.52, 0.4, 1.5, P.dark, sd * 1.4, 1.1, -0.5, 0.4, 0, 0, 10);
    s.tor(0.54, 0.07, P.accent, sd * 1.4, 1.5, -0.33, PI / 2 - 0.4, 0, 0);
    s.gcyl(0.3, 0.3, 0.06, P.glow, sd * 1.4, 0.42, -0.8, 0.4, 0, 0, 10);
    s.bev(0.4, 0.5, 1.2, P.sub, sd * 1.05, 0.5, 0.6, 0, 0, 0, 0.08);
    s.cyl(0.08, 0.08, 1.2, STEEL, sd * 0.7, 0.3, -0.4, 0.5, 0, 0, 6);
  }
  for (let j = 0; j < 3; j++) s.poly([[-0.14, 0], [0.14, 0], [0, 0.8 - j * 0.15]], 0.14, P.accent, 0, 2.1,
      -0.1 - j * 0.45, -0.5, 0, 0);
  s.into(waist);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: L.leg, hipY: L.hipY, height: L.hipY + 2.6 };
  return root;
}

// ---------- 護盾節點（天頂母艦的護衛）----------
function buildNode(P) {
  const root = new THREE.Group(), inner = grp('inner', root, 0, 2, 0), s = new Seg();
  s.cyl(0.03, 1.3, 1.9, P.main, 0, 1.5, 0, 0, 0, 0, 4);
  s.cyl(1.3, 0.03, 1.9, P.main, 0, -1.5, 0, 0, 0, 0, 4);
  s.cyl(0.03, 0.9, 1.2, P.sub, 0, 1.2, 0, 0, PI / 4, 0, 4);
  s.cyl(0.9, 0.03, 1.2, P.sub, 0, -1.2, 0, 0, PI / 4, 0, 4);
  s.gsph(0.7, P.glow, 0, 0, 0);
  s.tor(1.9, 0.1, P.accent, 0, 0, 0, PI / 2, 0, 0);
  s.gtor(2.2, 0.04, P.glow, 0, 0, 0, PI / 2, 0, 0);
  s.vsph(2.8, P.glow, 0, 0, 0);
  s.into(inner);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, 0, 1);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 4 };
  return root;
}

// ============================================================
//  Boss 7：掘地巨蟲・利維坦（頭部與體節）
// ============================================================
function buildWyrmHead(P) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.cyl(3.2, 2.9, 6, P.main, 0, 0, 0, PI / 2, 0, 0, 16);
  for (let j = 0; j < 3; j++) s.tor(3.25 - j * 0.1, 0.42, P.sub, 0, 0, 2 - j * 2);
  s.tor(3.0, 0.55, P.dark, 0, 0, 3.1);
  s.gsph(1.9, P.glow, 0, 0, 2.4);
  for (let j = 0; j < 12; j++) {  // 一圈鑽牙
    s.setBase(0, 0, 0, 0, 1, 0, j / 12 * TAU);
    s.cyl(0.03, 0.5, 2.4, P.accent, 0, 2.5, 4.0, PI / 2 + 0.25, 0, 0, 6);
    s.clearBase();
  }
  for (let j = 0; j < 4; j++) {  // 四片大顎
    s.setBase(0, 0, 0, 0, 1, 0, j / 4 * TAU + PI / 4);
    s.poly([[-1.3, 0], [1.3, 0], [0.5, 4.6], [0, 5.2], [-0.5, 4.6]], 0.6, P.sub, 0, 3.2, 2.6, PI / 2 - 0.3, 0, 0);
    s.gpoly([[-0.2, 0.5], [0.2, 0.5], [0, 4.2]], 0.7, P.glow, 0, 3.2, 2.6, PI / 2 - 0.3, 0, 0);
    s.gsph(0.42, 0xff2020, 0.9, 3.0, 0.6);
    s.gsph(0.42, 0xff2020, -0.9, 3.0, 0.6);
    s.cyl(0.03, 0.6, 2.6, P.accent, 0, 4.2, -1.5, -0.5, 0, 0, 6);
    s.clearBase();
  }
  s.into(inner);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'static', height: 6.4 };
  return root;
}
function buildWyrmSeg(P) {
  const root = new THREE.Group(), inner = grp('inner', root), s = new Seg();
  s.cyl(2.9, 2.9, 4.4, P.main, 0, 0, 0, PI / 2, 0, 0, 14);
  s.tor(3.0, 0.38, P.sub, 0, 0, 1.4);
  s.tor(3.0, 0.38, P.sub, 0, 0, -1.4);
  s.sph(2.5, P.dark, 0, 0, 2.4);
  s.sph(2.5, P.dark, 0, 0, -2.4);
  s.cyl(0.03, 0.7, 3.0, P.accent, 0, 3.9, 0, 0, 0, 0, 6);
  for (const sd of [-1, 1]) {
    s.gsph(0.5, P.glow, sd * 2.85, 0.4, 0);
    s.cyl(0.03, 0.45, 1.8, P.accent, sd * 3.4, -0.8, 0, 0, 0, -sd * 1.3, 6);
    s.gbox(0.1, 0.3, 2.6, P.glow, sd * 2.0, 2.2, 0);
  }
  s.bev(2.6, 0.5, 3.6, P.dark, 0, -2.75, 0, 0, 0, 0, 0.15);
  s.into(inner);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'static', height: 5.8 };
  return root;
}

// ============================================================
//  Boss 8：天頂母艦・方舟 ─ 巨型飛碟航母
// ============================================================
function buildCarrier(P) {
  const root = new THREE.Group(), inner = grp('inner', root, 0, 4, 0);
  let s = new Seg();
  s.cyl(13, 10.5, 1.5, P.main, 0, 0, 0, 0, 0, 0, 32);
  s.cyl(10.5, 13, 1.2, P.sub, 0, 1.35, 0, 0, 0, 0, 32);
  s.cyl(7, 9.6, 1.2, P.main, 0, 2.5, 0, 0, 0, 0, 24);
  s.cyl(4, 6.6, 1.2, P.dark, 0, 3.6, 0, 0, 0, 0, 20);
  s.bev(3.2, 1.3, 3.2, P.sub, 0, 4.7, 0, 0, PI / 4, 0, 0.3);
  s.gtor(2.5, 0.12, P.glow, 0, 4.7, 0, PI / 2, 0, 0);
  s.tor(13.2, 0.5, P.accent, 0, 0.7, 0, PI / 2, 0, 0);
  for (let j = 0; j < 16; j++) {
    const a = j / 16 * TAU;
    s.gsph(0.36, j % 2 ? P.glow : 0xff3040, Math.sin(a) * 13.5, 0.7, Math.cos(a) * 13.5);
    if (j % 2 === 0) s.box(0.3, 0.12, 5.2, P.dark, Math.sin(a) * 9.6, 2.02, Math.cos(a) * 9.6, 0, a, 0);
  }
  for (let j = 0; j < 4; j++) {
    const a = j / 4 * TAU + PI / 4;
    s.bev(3.4, 1.0, 2.2, BLACK, Math.sin(a) * 8, -0.95, Math.cos(a) * 8, 0, a, 0, 0.2);
    s.gbox(2.6, 0.12, 0.2, P.glow, Math.sin(a) * 9.1, -0.95, Math.cos(a) * 9.1, 0, a, 0);
    s.box(0.12, 2.6, 0.12, P.dark, Math.sin(a) * 2.4, 6.4, Math.cos(a) * 2.4);
  }
  s.cyl(3.4, 1.3, 2.8, P.dark, 0, -2.1, 0, 0, 0, 0, 16);
  s.tor(2.4, 0.22, P.accent, 0, -2.6, 0, PI / 2, 0, 0);
  s.gsph(1.4, P.glow, 0, -3.6, 0);
  s.into(inner);
  // 以下幾個 spin 關節是會持續旋轉的外環（轉速與轉軸寫在最後的 userData.spins）
  const a = grp('spinA', inner, 0, -0.5, 0), sa = new Seg();
  sa.tor(16.6, 0.32, P.sub, 0, 0, 0, PI / 2, 0, 0);
  sa.gtor(16.6, 0.07, P.glow, 0, 0.36, 0, PI / 2, 0, 0);
  for (let j = 0; j < 6; j++) {
    const an = j / 6 * TAU, x = Math.sin(an) * 16.6, z = Math.cos(an) * 16.6;
    sa.bev(1.3, 2.8, 1.3, P.main, x, 0, z, 0, an, 0, 0.3);
    sa.gbox(0.3, 1.8, 0.3, P.glow, Math.sin(an) * 17.3, 0, Math.cos(an) * 17.3);
    sa.box(0.2, 0.2, 3.4, P.dark, Math.sin(an) * 14.9, 0, Math.cos(an) * 14.9, 0, an, 0);
  }
  sa.into(a);
  const b = grp('spinB', inner, 0, -1.4, 0), sb = new Seg();
  sb.gtor(6.5, 0.1, P.glow, 0, 0, 0, PI / 2, 0, 0);
  for (let j = 0; j < 8; j++) {
    const an = j / 8 * TAU;
    sb.poly([[-0.4, 0], [0.4, 0], [0, 1.6]], 0.2, P.accent, Math.sin(an) * 6.5, -0.2, Math.cos(an) * 6.5, PI, an, 0);
  }
  sb.into(b);
  // 槍口位置（開火時子彈與火光從這裡出現）
  grp('muzzleR', inner, 0, -3.8, 0);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'fly', height: 8, spins: [{ name: 'spinA', axis: 'y', speed: 0.45 },
      { name: 'spinB', axis: 'y', speed: -1.1 }] };
  return root;
}

// ============================================================
//  Boss 9：斷罪劍皇・亞修拉 ─ 持巨劍的騎士型決鬥機
// ============================================================
function buildKnight(P) {
  const g = { thigh: 3.7, shin: 4.0, footH: 1.0, hipW: 1.9, legT: 1.3, bulk: 1.7, tb: -0.22, kb: 0.5 };
  const root = new THREE.Group(), inner = grp('inner', root), hips = grp('hips', inner);
  pelvis(hips, P, g);
  const hipY = bipedLegs(hips, P, g, 'hero');
  let s = new Seg();  // 裙甲與前後垂布
  for (const sd of [-1, 1]) s.poly([[-1.1, 0], [1.1, 0], [0.7, -3.6], [0, -4.4], [-0.7, -3.6]], 0.24, P.main,
      sd * 3.3, -0.3, 0, 0, sd * PI / 2, 0);
  s.poly([[-0.9, 0], [0.9, 0], [0.9, -4.2], [0, -5.2], [-0.9, -4.2]], 0.16, P.sub, 0, -0.6, 1.5, -0.12, 0, 0);
  s.gpoly([[-0.12, -0.6], [0.12, -0.6], [0.12, -3.6], [0, -4.2], [-0.12, -3.6]], 0.2, P.accent, 0, -0.6, 1.5,
      -0.12, 0, 0);
  s.poly([[-1.3, 0], [1.3, 0], [1.1, -4.6], [-1.1, -4.6]], 0.16, P.sub, 0, -0.6, -1.5, 0.12, 0, 0);
  s.into(hips);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 1.8, 0), tw = 6.2, th = 4.2, td = 3.6, cy = 0.7 + th / 2;
  s = new Seg();
  s.cyl(1.2, 1.4, 0.9, P.dark, 0, 0.25, 0, 0, 0, 0, 16);
  for (let j = 0; j < 3; j++) s.tor(1.35 + j * 0.12, 0.14, P.accent, 0, 0.5 + j * 0.3, 0, PI / 2, 0, 0);
  s.trap(3.4, tw, th * 0.85, td, P.main, 0, cy + 0.2, 0);
  s.trap(2.4, 4.4, th * 0.6, 0.6, P.sub, 0, cy + 0.4, td / 2 + 0.1, -0.1, 0, 0);
  s.gpoly([[0, -0.9], [0.6, 0], [0, 0.8], [-0.6, 0]], 0.3, P.glow, 0, cy + 0.5, td / 2 + 0.42, -0.1, 0, 0);
  s.tor(0.9, 0.1, P.accent, 0, cy + 0.5, td / 2 + 0.46, -0.1, 0, 0);
  s.bev(4.4, 0.9, 3.0, P.dark, 0, cy + th / 2 + 0.2, 0, 0, 0, 0, 0.25);
  s.poly([[-2.0, 0], [2.0, 0], [1.4, 1.2], [-1.4, 1.2]], 0.5, P.main, 0, cy + th / 2 + 0.3, 1.4, -0.5, 0, 0);
  for (let j = -2; j <= 2; j++) {  // 披風甲片
    s.poly([[-0.85, 0], [0.85, 0], [1.05, -9.5], [0, -11.2], [-1.05, -9.5]], 0.16, j % 2 ? P.main : P.sub, j * 1.55,
        cy + 1.6, -td / 2 - 0.7 - Math.abs(j) * 0.1, 0.2, 0, j * 0.07);
    s.gpoly([[-0.08, -1], [0.08, -1], [0.08, -8.6], [-0.08, -8.6]], 0.2, P.accent, j * 1.55, cy + 1.6,
        -td / 2 - 0.82 - Math.abs(j) * 0.1, 0.2, 0, j * 0.07);
  }
  for (const sd of [-1, 1]) {
    s.cyl(1.0, 1.0, 1.4, P.dark, sd * (tw / 2 + 0.4), cy + 1.1, 0, 0, 0, PI / 2, 14);
    s.gbox(0.5, 0.16, 0.1, P.glow, sd * 1.9, cy + 1.5, td / 2 + 0.05);
  }
  s.into(waist);

  // 頭部
  const head = grp('head', waist, 0, cy + th / 2 + 0.6, 0.2);
  s = new Seg();
  s.cyl(0.7, 0.8, 0.5, P.dark, 0, 0, 0, 0, 0, 0, 12);
  s.bev(2.0, 2.3, 2.1, P.main, 0, 1.3, 0, 0, 0, 0, 0.35);
  s.gbox(1.4, 0.22, 0.12, P.glow, 0, 1.6, 1.06);
  s.gbox(0.22, 1.0, 0.12, P.glow, 0, 1.05, 1.06);
  s.poly([[-1.1, 0], [1.1, 0], [0.7, 0.7], [-0.7, 0.7]], 0.4, P.sub, 0, 2.2, 0.9, -0.4, 0, 0);
  s.poly([[0, 0], [2.8, 0], [2.0, 2.8], [0.2, 2.0]], 0.2, P.sub, 0, 2.4, 0.9, 0, PI / 2, 0);
  s.gpoly([[0.4, 0.4], [2.2, 0.4], [1.7, 2.2], [0.5, 1.7]], 0.26, P.glow, 0, 2.4, 0.9, 0, PI / 2, 0);
  for (const sd of [-1, 1]) {
    s.poly(mir([[0, 0], [0.5, 0], [1.6, 2.2], [1.3, 2.4]], sd), 0.2, P.accent, sd * 0.9, 1.9, 0.2, -0.3, 0, 0);
    s.bev(0.3, 1.4, 1.6, P.sub, sd * 1.1, 1.0, 0.1, 0, 0, 0, 0.08);
  }
  s.into(head);

  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1, nm = i ? 'R' : 'L';
    // 肩膀與上臂
    const sh = grp('shoulder' + nm, waist, sd * (tw / 2 + 1.5), cy + 1.1, 0);
    s = new Seg();
    s.sph(2.1, P.main, sd * 0.3, 0.5, 0, 1, 0.8, 1.15);
    s.tor(2.0, 0.16, P.accent, sd * 0.3, 0.5, 0, 0, PI / 2, 0);
    s.poly(mir([[0, 0], [1.6, 0.3], [2.6, 2.6], [0.4, 1.4]], sd), 0.3, P.sub, sd * 0.8, 1.4, 0, 0, 0, 0);
    for (let j = 0; j < 2; j++) s.cyl(0.03, 0.4, 2.0, P.accent, sd * (1.4 + j * 0.9), 2.2 - j * 0.5, 0, 0, 0,
        -sd * (0.5 + j * 0.4), 6);
    s.bev(1.4, 3.3, 1.5, P.dark, 0, -2.1, 0, 0, 0, 0, 0.2);
    s.bev(1.7, 1.4, 1.8, P.sub, 0, -1.8, 0, 0, 0, 0, 0.14);
    s.cyl(0.9, 0.9, 1.9, P.dark, 0, -3.8, 0, 0, 0, PI / 2, 12);
    s.cyl(0.45, 0.45, 2.1, P.accent, 0, -3.8, 0, 0, 0, PI / 2, 8);
    s.into(sh);
    // 前臂
    const fa = grp('forearm' + nm, sh, 0, -3.8, 0);
    s = new Seg();
    s.bev(1.7, 1.7, 3.6, P.main, 0, 0, 1.8, 0, 0, 0, 0.25);
    s.trap(1.5, 0.9, 0.5, 3.0, P.sub, 0, 1.0, 1.8);
    s.box(1.76, 0.4, 0.5, P.accent, 0, 0, 0.8);
    s.cyl(0.7, 0.7, 0.5, P.dark, 0, 0, 3.8, PI / 2, 0, 0, 10);
    if (i) {  // 右手：斷罪巨劍
      s.setBase(0, 0.2, 3.6, 0, 1, -1.15, 0);
      s.cyl(0.3, 0.3, 2.6, P.dark, 0, 0, -0.4, PI / 2, 0, 0, 8);
      s.sph(0.5, P.accent, 0, 0, -1.8);
      s.poly([[-2.2, -0.3], [2.2, -0.3], [2.8, 0.5], [-2.8, 0.5]], 0.7, P.accent, 0, 0, 1.2, PI / 2, 0, 0);
      s.poly([[-1.0, 0], [1.0, 0], [1.2, 11], [0, 15], [-1.2, 11]], 0.34, 0xd8dde4, 0, 0, 1.6, PI / 2, 0, 0);
      s.gpoly([[-0.2, 0.6], [0.2, 0.6], [0.2, 10.5], [0, 13.6], [-0.2, 10.5]], 0.42, P.glow, 0, 0, 1.6, PI / 2, 0, 0);
      for (let j = 0; j < 4; j++) s.gbox(1.4, 0.44, 0.14, P.glow, 0, 0, 4 + j * 2.4);
      s.clearBase();
      s.into(fa);
      // 槍口位置（開火時子彈與火光從這裡出現）
      grp('muzzleR', fa, 0, 15.3, 10.4);
    } else {  // 左手：鳶型盾
      s.setBase(sd * 1.3, 0, 2.0, sd * 0.9, 1, 0, 0);
      s.poly([[-2.0, 2.6], [2.0, 2.6], [2.2, 0], [0, -4.6], [-2.2, 0]], 0.4, P.main, 0, 0, 0);
      s.poly([[-1.4, 2.0], [1.4, 2.0], [1.6, 0], [0, -3.6], [-1.6, 0]], 0.3, P.sub, 0, 0, 0.2);
      s.gpoly([[-0.2, 1.6], [0.2, 1.6], [0.2, -2.4], [0, -3.0], [-0.2, -2.4]], 0.2, P.glow, 0, 0, 0.4);
      s.gbox(2.0, 0.34, 0.2, P.glow, 0, 0.6, 0.4);
      s.clearBase();
      s.into(fa);
      grp('muzzleL', fa, 0, 0, 4);
    }
  }
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'biped', leg: { L1: g.thigh, L2: g.shin, fH: g.footH, tb: g.tb, kb: g.kb, off: 0.17 }, hipY,
      height: hipY + 1.8 + cy + th / 2 + 0.6 + 4.6 };
  hips.position.y = hipY;
  return root;
}

// ============================================================
//  Boss 10：終焉機神・歐米茄 ─ 無足的漂浮機神，背負劍環
// ============================================================
function buildOmega(P) {
  const H = 7.5, root = new THREE.Group(), inner = grp('inner', root), hips = grp('hips', inner, 0, H, 0);
  let s = new Seg();
  s.gsph(2.2, P.glow, 0, -0.6, 0);
  s.tor(2.9, 0.3, P.dark, 0, 0.5, 0, PI / 2, 0, 0);
  s.tor(2.7, 0.3, P.dark, 0, -1.7, 0, PI / 2, 0, 0);
  s.cyl(3.8, 2.7, 1.7, P.main, 0, 1.3, 0, 0, 0, 0, 10);
  s.tor(3.8, 0.2, P.accent, 0, 2.1, 0, PI / 2, 0, 0);
  for (let j = 0; j < 8; j++) {
    const a = j / 8 * TAU;
    s.setBase(Math.sin(a) * 3.2, -0.4, Math.cos(a) * 3.2, a, 1, 0.28, 0);
    s.poly([[-1.0, 0], [1.0, 0], [0.55, -5.2], [0, -6.9], [-0.55, -5.2]], 0.34, j % 2 ? P.sub : P.main);
    s.gpoly([[-0.1, -0.8], [0.1, -0.8], [0.1, -4.8], [0, -5.8], [-0.1, -4.8]], 0.42, P.glow);
    s.box(2.0, 0.3, 0.4, P.accent, 0, -0.2, 0);
    s.clearBase();
  }
  s.into(hips);
  // 上半身 / 砲塔：這個關節會獨立轉向，用來瞄準目標
  const waist = grp('waist', hips, 0, 2.2, 0), tw = 11, th = 6.5, td = 6, cy = 0.6 + th / 2;
  s = new Seg();
  s.cyl(2.0, 2.5, 1.0, P.dark, 0, 0.3, 0, 0, 0, 0, 14);
  s.trap(6, tw, th * 0.85, td, P.main, 0, cy + 0.3, 0);
  s.gsph(1.9, P.glow, 0, cy + 0.4, td / 2 - 0.4);
  s.tor(2.4, 0.3, P.accent, 0, cy + 0.4, td / 2 + 0.3);
  for (let j = -2; j <= 2; j++) s.box(0.3, 4.4, 0.4, P.dark, j * 0.85, cy + 0.4, td / 2 + 0.3);
  for (const sd of [-1, 1]) {
    for (let j = 0; j < 3; j++) s.bev(3.3, 0.8, 0.8, P.sub, sd * 3.5, cy - 1.5 + j * 1.3, td / 2 + 0.1, 0, 0,
        sd * 0.25, 0.14);
    s.gbox(1.6, 0.3, 0.12, P.glow, sd * 3.4, cy + 2.5, td / 2 + 0.05);
    s.cyl(1.2, 1.2, 1.6, P.dark, sd * (tw / 2 + 0.5), cy + 1.5, 0, 0, 0, PI / 2, 14);
  }
  s.bev(7, 1.0, 4.4, P.dark, 0, cy + th / 2 + 0.3, 0, 0, 0, 0, 0.3);
  for (let j = 0; j < 6; j++) s.poly([[-0.4, 0], [0.4, 0], [0, 2.6 - j * 0.25]], 0.5, P.accent, 0,
      cy + 2.8 - j * 1.1, -td / 2 - 0.2, -1.0, 0, 0);
  s.into(waist);

  // 頭部
  const head = grp('head', waist, 0, cy + th / 2 + 0.9, 0.8);
  s = new Seg();
  s.cyl(0.9, 1.1, 0.6, P.dark, 0, 0, 0, 0, 0, 0, 12);
  s.poly([[-1.3, 0], [1.3, 0], [1.7, 2.1], [0.9, 3.2], [-0.9, 3.2], [-1.7, 2.1]], 1.6, P.sub, 0, 0.3, 0.2);
  s.gbox(0.9, 0.2, 0.14, P.glow, -0.75, 2.0, 1.06, 0, 0, -0.35);
  s.gbox(0.9, 0.2, 0.14, P.glow, 0.75, 2.0, 1.06, 0, 0, 0.35);
  s.gsph(0.3, P.glow, 0, 2.8, 1.0);
  for (let j = 0; j < 4; j++) s.box(1.2, 0.1, 0.16, P.dark, 0, 0.7 + j * 0.24, 1.04);
  for (let j = -2; j <= 2; j++) s.poly([[-0.34, 0], [0.34, 0], [0, 3.4 - Math.abs(j) * 0.7]], 0.3, P.accent,
      j * 0.8, 3.4, -0.1, -0.15, 0, -j * 0.22);
  s.into(head);

  for (let i = 0; i < 2; i++) {  // 漂浮的肩甲與巨拳砲
    const sd = i ? -1 : 1, nm = i ? 'R' : 'L';
    // 肩膀與上臂
    const sh = grp('shoulder' + nm, waist, sd * (tw / 2 + 3.6), cy + 1.5, 0);
    s = new Seg();
    s.setBase(sd * 1.6, 1.2, 0, sd * PI / 2, 1, 0, 0);
    s.poly([[-2.2, -3.2], [2.2, -3.2], [2.8, 1.4], [0, 4.6], [-2.8, 1.4]], 0.9, P.main);
    s.poly([[-1.4, -2.2], [1.4, -2.2], [1.8, 1.0], [0, 3.0], [-1.8, 1.0]], 0.5, P.sub, 0, 0, 0.6);
    s.gpoly([[-0.3, -1.6], [0.3, -1.6], [0.3, 1.2], [0, 2.0], [-0.3, 1.2]], 0.3, P.glow, 0, 0, 1.0);
    s.clearBase();
    s.gtor(1.4, 0.1, P.glow, 0, -1.6, 0, PI / 2, 0, 0);
    s.gtor(1.1, 0.08, P.glow, 0, -2.8, 0, PI / 2, 0, 0);
    s.into(sh);
    // 前臂
    const fa = grp('forearm' + nm, sh, 0, -4.8, 0);
    s = new Seg();
    s.bev(3.4, 3.4, 5.0, P.main, 0, 0, 2.5, 0, 0, 0, 0.5);
    s.bev(3.8, 1.2, 3.0, P.sub, 0, 1.6, 2.2, 0, 0, 0, 0.2);
    s.box(3.44, 0.5, 5.04, P.accent, 0, -0.6, 2.5);
    for (let j = -1; j <= 1; j++) s.bev(0.9, 1.0, 1.8, P.dark, j * 1.1, 1.3, 5.2, 0.3, 0, 0, 0.14);
    s.cyl(1.5, 1.5, 0.4, P.dark, 0, -0.2, 5.1, PI / 2, 0, 0, 14);
    s.gcyl(1.15, 1.15, 0.2, P.glow, 0, -0.2, 5.3, PI / 2, 0, 0, 14);
    s.gtor(2.2, 0.1, P.glow, 0, 0, 0.2);
    s.gtor(2.0, 0.08, P.glow, 0, 0, -0.6);
    s.into(fa);
    // 槍口位置（左右手各一個）
    grp('muzzle' + nm, fa, 0, -0.2, 5.8);
  }

  // 背後的劍環
  const halo = grp('halo', waist, 0, cy + 3.5, -4.4);
  s = new Seg();
  s.tor(5.6, 0.3, P.accent);
  s.gtor(5.0, 0.09, P.glow);
  s.gtor(6.2, 0.06, P.glow);
  for (let j = 0; j < 10; j++) {
    const a = j / 10 * TAU, x = Math.sin(a) * 6.0, y = Math.cos(a) * 6.0;
    s.poly([[-0.5, 0], [0.5, 0], [0.6, 3.0], [0, 4.3], [-0.6, 3.0]], 0.22, P.sub, x, y, 0, 0, 0, -a);
    s.gpoly([[-0.1, 0.4], [0.1, 0.4], [0.1, 2.8], [0, 3.8], [-0.1, 2.8]], 0.3, P.glow, x, y, 0, 0, 0, -a);
    s.poly([[-1.2, -0.4], [1.2, -0.4], [0.8, 0.3], [-0.8, 0.3]], 0.4, P.accent, x, y, 0, 0, 0, -a);
  }
  s.vsph(5.0, P.glow, 0, 0, 0, 1, 1, 0.02);
  s.into(halo);
  s = new Seg();
  s.box(0.6, 0.6, 3.0, P.dark, 0, cy + 3.5, -3.0);
  s.into(waist);
  // 動畫用資料：type = 骨架類型（決定怎麼走路）、height = 整體高度（頭上血條的位置）
  root.userData = { type: 'hover', hipY: H, height: H + 2.2 + cy + th / 2 + 0.9 + 4.4,
      spins: [{ name: 'halo', axis: 'z', speed: 0.35 }] };
  return root;
}

// ============================================================
//  建立單位
// ============================================================
// 單位代號 → 建模函式的對照表
// 同一個函式可以換顏色重複使用：例如 ehealer（敵方維修機）就是粉紅色的修護機
const UNIT_BUILDERS = {
  grunt: buildGrunt, sniper: buildSniper, trooper: buildTrooper, ripper: buildRipper, bomber: buildBomber,
      shielder: buildShielder, leaper: buildLeaper,
  drone: buildDrone, wasp: buildWasp, gunship: buildGunship, tank: buildTank, mortar: buildMortar,
      turret: buildTurret, medic: buildMedic,
  ehealer: P => buildMedic(P, 0xff40a0), node: buildNode,
  kamikaze: P => buildSpider(P, 0xff3a20), spider: P => buildSpider(P, P.glow),
  colossus: buildColossus, tempest: buildTempest, arachne: buildArachne, citadel: buildCitadel, oculus: buildOculus,
  wyrm: buildWyrmHead, wyrmseg: buildWyrmSeg, carrier: buildCarrier, knight: buildKnight, omega: buildOmega,
};
// 建立一個單位的實體（敵人、小兵、Boss 共用）。同樣「種類 + 塗裝」的模型只會建模一次，之後都是複製
function makeUnit(kind, paint) {
  return instRig(getProto(kind + '|' + paintKey(paint), () => UNIT_BUILDERS[kind](paint)));
}
