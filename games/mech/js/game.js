'use strict';
// ============================================================
//  戰鬥核心：玩家、武器、技能、小兵、敵人 AI、Boss 技能、道具、模式與波次
// ============================================================
// G：一場戰鬥的所有狀態（全域物件，其他檔案也會讀它）
const G = {
  // state = 目前畫面：boot 啟動中 / hangar 機庫 / playing 戰鬥中 / paused 暫停 / dying 陣亡動畫 / won 勝利演出 / result 結算
  // time = 這場戰鬥經過的秒數　slow = 慢動作還剩幾秒
  state: 'boot', scene: null, camera: null, time: 0, slow: 0,
  // player 玩家　enemies 敵人　allies 我方小兵　friends = 玩家 + 小兵（敵人的攻擊目標）
  // projs 飛行中的子彈　pickups 道具　barrels 油桶　timers 延遲執行的動作　zones 持續性的範圍效果（砲擊預警、重力井…）
  player: null, enemies: [], allies: [], friends: [], projs: [], pickups: [], barrels: [], timers: [], zones: [],
  // wave 目前第幾波　waveState 波次狀態（break 休息 / active 戰鬥中 / upgrade 選強化）　waveT 倒數秒數
  // spawnQ 還沒出場的敵人清單　spawnT 距離下一隻出場的秒數　flowT / fireT = 尋路與火堆的更新計時
  // hunt = 剩沒幾隻時敵人主動來找玩家　waveBoss = 這一波有沒有 Boss
  wave: 0, waveState: 'idle', waveT: 0, spawnQ: [], spawnT: 0, flowT: 0, fireT: 0, hunt: false, waveBoss: false,
  // score 分數　kills 擊墜數　deployed 派出過幾台小兵　dieT 陣亡動畫倒數　boss 目前的 Boss
  // diff 難度設定　loadout 這場使用的配置
  score: 0, kills: 0, deployed: 0, dieT: 0, boss: null, diff: DIFFS[1], loadout: null,
  // mode 模式與目標波數　bossOrder Boss 出場順序　bossCycle 十隻 Boss 已經輪過幾輪
  // scale 這一波敵人的強度倍率（血量 / 傷害 / 攻擊頻率）　upg 目前可選的強化　upgT 選強化的倒數　dmgDirs 受擊方向指示
  mode: { id: 'campaign', total: 10 }, bossOrder: BOSS_IDS.slice(), bossCycle: 0,
      scale: { hp: 1, dmg: 1, rate: 1 }, upg: null, upgT: 0, dmgDirs: [],
  // input：鍵盤與滑鼠狀態（main.js 負責寫入）。keys 按住中、pressed 這一格剛按下、mx / my 滑鼠移動量、lmb / rmb 左右鍵
  input: { keys: {}, pressed: {}, mx: 0, my: 0, lmb: false, rmb: false },
  // aim 準星指到的世界座標　aimDir 瞄準方向　camO 鏡頭位置　aimEnt 準星指到的敵人　camY / camDist 鏡頭高度與距離
  aim: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1), camO: new THREE.Vector3(), aimEnt: null,
      camY: 0, camDist: 15,
  // hitMark 命中提示的剩餘時間　hurt 受傷紅光的強度　shieldMesh 護盾球模型　_tp 傷害數字要顯示在哪個部位
  hitMark: 0, hurt: 0, shieldMesh: null, _tp: null,
};
// 計算用的暫存向量（重複使用，避免每一格都配置新物件）
const _v = new THREE.Vector3(), _v2b = new THREE.Vector3(), _dir = new THREE.Vector3(), _dir2 = new THREE.Vector3();
// 巨蟲體節共用的假資料（體節本身沒有獨立的敵人設定）
const PART_DEF = { name: '巨蟲體節', fly: 1, speed: 0, score: 0 };

// 場上真正算數的敵人數（不含巨蟲體節與護盾節點）
function liveCount() {
  let n = 0;
  for (const e of G.enemies) if (e.alive && !e.isPart && !e.def.node) n++;
  return n;
}
// 場上所有活著的 Boss 本體
function bossList() {
  return G.enemies.filter(e => e.alive && e.def.boss && !e.isPart);
}
// 給 HUD 用的 Boss 血條資訊（雙子等多隻 Boss 會合併顯示）
function bossInfo() {
  const l = bossList();
  if (!l.length) return null;
  let hp = 0, max = 0;
  for (const b of l) {
    hp += b.hp;
    max += b.maxHp;
  }
  // shield：母艦的護盾節點是否還有活著的
  const d = l[0].def, shield = l.some(b => b.def.nodes && G.enemies.some(o => o.alive && o.def.node && o.owner === b));
  // 玩家物件的欄位（很多，依類別分行）
  return { name: d.name + (d.form ? '（' + d.form + '）' : ''), title: d.title, hp, max,
      enraged: l.some(b => b.enraged), shield };
}

// ------------------------------------------------------------
//  線段 vs 實體（直立膠囊近似）
// ------------------------------------------------------------
// 一段線（子彈這一格走過的路徑 A→B）有沒有打到單位 e。
// 回傳命中點在線段上的比例 0~1（越小越靠近 A），沒打到回傳 -1。pad = 額外放寬的命中範圍
function segHitEnt(ax, ay, az, bx, by, bz, e, pad) {
  const cx = e.x, cy = e.y + e.h * 0.5, cz = e.z;
  const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1e-9;
  // t：線段上最靠近單位中心的那一點
  const t = clamp(((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2, 0, 1);
  const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t, hx = px - cx, hz = pz - cz, rr = e.r + pad;
  return (hx * hx + hz * hz < rr * rr && py > e.y - pad && py < e.y + e.h + pad) ? t : -1;
}
// 把方向 dir 隨機偏一點（s = 散布大小），模擬武器的不準度
function spread(dir, s) {
  if (s > 0) {
    dir.x += rand(-s, s);
    dir.y += rand(-s, s);
    dir.z += rand(-s, s);
    dir.normalize();
  }
  return dir;
}
// 依照每一項的權重 w 隨機挑一個（w 越大越容易被挑中）
function weighted(list) {
  let r = Math.random() * list.reduce((s, o) => s + o.w, 0);
  for (const o of list) {
    r -= o.w;
    if (r <= 0) return o;
  }
  return list[0];
}

// ------------------------------------------------------------
//  子彈
// ------------------------------------------------------------
// 子彈模型的物件池：用過的模型不丟掉，放回 pools 下次再用（子彈數量很多，一直新建會卡）
const PROJ = { pools: {}, geos: null };
// 取得一個子彈模型：kind 決定形狀（bullet 長條 / bolt 光彈 / plasma 與 shell 圓球 / missile 飛彈 / grenade 榴彈）
function projMesh(kind, color) {
  if (!PROJ.geos) {
    const mg = new THREE.CylinderGeometry(0.2, 0.28, 1.9, 8);
    mg.rotateX(PI / 2);
    PROJ.geos = { bullet: new THREE.BoxGeometry(0.17, 0.17, 3.4), bolt: new THREE.BoxGeometry(0.34, 0.34, 2.4),
        plasma: new THREE.SphereGeometry(0.62, 10, 8),
      shell: new THREE.SphereGeometry(0.75, 10, 8), missile: mg, grenade: new THREE.SphereGeometry(0.5, 8, 6) };
  }
  const pool = PROJ.pools[kind] || (PROJ.pools[kind] = []);
  let m = pool.pop();
  if (!m) {
    m = new THREE.Mesh(PROJ.geos[kind], new THREE.MeshBasicMaterial({ toneMapped: false }));
    m.frustumCulled = false;
  }
  m.material.color.copy(C(color)).multiplyScalar(kind === 'missile' || kind === 'grenade' ? 1.4 : 3);
  G.scene.add(m);
  return m;
}
// 發射一發子彈。o 裡面要有：kind 種類、team 陣營（0 我方 / 1 敵方）、位置 x y z、方向 dx dy dz、
// speed 速度、dmg 傷害、life 最多飛幾秒、color 顏色；可選：splash 爆炸半徑、grav 重力、target 追蹤目標、turn 轉彎速度
function spawnProj(o) {
  const p = Object.assign({ splash: 0, grav: 0, target: null, turn: 0, trail: 0, accel: 0, maxSpeed: 0 }, o);
  p.vx = o.dx * o.speed;
  p.vy = o.dy * o.speed;
  p.vz = o.dz * o.speed;
  p.ox = o.x;
  p.oz = o.z;
  p.mesh = projMesh(p.kind, p.color);
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
  G.projs.push(p);
  return p;
}
// 回收一發子彈的模型
function freeProj(p) {
  G.scene.remove(p.mesh);
  PROJ.pools[p.kind].push(p.mesh);
}

// 發射一枚追蹤飛彈。fast = true 是玩家用的高速版本
function launchMissile(team, x, y, z, dx, dy, dz, target, dmg, splash, color, fast) {
  spawnProj({ kind: 'missile', team, x, y, z, dx, dy, dz, speed: fast ? 45 : 26, accel: fast ? 150 : 40,
      maxSpeed: fast ? 135 : 70, turn: fast ? 6 : 1.6, target, dmg, splash, life: fast ? 5 : 7, color, trail: 1 });
  SND.at('missile', x, z, 0.5, 0.05);
}

// 每一格更新所有子彈：追蹤、移動、判斷有沒有打到東西
function updateProjs(dt) {
  const list = G.projs;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    // 追蹤彈：把速度方向慢慢轉向目標，並逐漸加速
    if (p.target) {
      const t = p.target;
      if (!t.alive) p.target = null;
      else {
        const tx = t.x - p.x, ty = t.y + t.h * 0.5 - p.y, tz = t.z - p.z, l = Math.hypot(tx, ty, tz) || 1;
        let sp = Math.hypot(p.vx, p.vy, p.vz);
        const k = Math.min(1, p.turn * dt);
        p.vx = lerp(p.vx, tx / l * sp, k);
        p.vy = lerp(p.vy, ty / l * sp, k);
        p.vz = lerp(p.vz, tz / l * sp, k);
        const s2 = Math.hypot(p.vx, p.vy, p.vz) || 1;
        sp = Math.min(p.maxSpeed || sp, sp + p.accel * dt);
        p.vx *= sp / s2;
        p.vy *= sp / s2;
        p.vz *= sp / s2;
      }
    } else if (p.accel) {
      const s2 = Math.hypot(p.vx, p.vy, p.vz) || 1, sp = Math.min(p.maxSpeed, s2 + p.accel * dt);
      p.vx *= sp / s2;
      p.vy *= sp / s2;
      p.vz *= sp / s2;
    }
    if (p.grav) p.vy -= p.grav * dt;
    // 這一格要移動的量；先用射線檢查這段路上有沒有撞到建築或地面
    const mx = p.vx * dt, my = p.vy * dt, mz = p.vz * dt, len = Math.hypot(mx, my, mz) || 1e-6;
    let hitT = 1, hit = null;
    const tw = rayWorld(p.x, p.y, p.z, mx / len, my / len, mz / len, len);
    if (tw < len) {
      hitT = tw / len;
      hit = 'world';
    }
    const nx = p.x + mx, ny = p.y + my, nz = p.z + mz;
    // 再檢查有沒有打到敵對陣營的單位（取最先碰到的那一個）
    const targets = p.team === 0 ? G.enemies : G.friends;
    for (let j = 0; j < targets.length; j++) {
      const e = targets[j];
      if (!e.alive) continue;
      const t = segHitEnt(p.x, p.y, p.z, nx, ny, nz, e, 0.15);
      if (t >= 0 && t <= hitT) {
        hitT = t;
        hit = e;
      }
    }
    // 油桶也可以被打中
    for (let j = 0; j < G.barrels.length; j++) {
      const e = G.barrels[j];
      if (!e.alive) continue;
      const t = segHitEnt(p.x, p.y, p.z, nx, ny, nz, e, 0.2);
      if (t >= 0 && t <= hitT) {
        hitT = t;
        hit = e;
      }
    }
    // 打到東西或壽命到了：會爆炸的就爆炸，否則對命中的單位造成傷害，然後回收這發子彈
    if (hit || p.life <= 0) {
      const hx = p.x + mx * hitT, hy = p.y + my * hitT, hz = p.z + mz * hitT;
      if (p.splash > 0) explode(hx, hy, hz, p.splash, p.dmg, p.team, p.color);
      else if (hit && hit !== 'world') {
        damageEnt(hit, p.dmg, p.team, hx, hy, hz, p.ox, p.oz);
        FX.hit(hx, hy, hz, p.color);
        if (p.team === 0) SND.at('clank', hx, hz, 0.4, 0.05);
      }
      else if (hit) FX.dustHit(hx, hy, hz);
      freeProj(p);
      list.splice(i, 1);
      continue;
    }
    // 沒打到東西：移動到新位置
    p.x = nx;
    p.y = ny;
    p.z = nz;
    p.mesh.position.set(nx, ny, nz);
    p.mesh.lookAt(nx + p.vx, ny + p.vy, nz + p.vz);
    // 飛彈拖著火焰與白煙；其他發光的子彈拖一條光尾
    if (p.trail) {
      FX.add.emit(nx, ny, nz, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.18, 1.3, 0.2, 1, 0.6, 0.2, 1.4);
      if (Math.random() < 0.6) {
        const g = rand(0.35, 0.5);
        FX.smoke.emit(nx, ny, nz, rand(-1, 1), rand(0, 1.5), rand(-1, 1), rand(0.6, 1.1), 0.7, 2.2, g, g, g,
            0.4, 0, 0.5);
      }
    } else if (p.kind !== 'bullet') {
      const c = C(p.color);
      FX.add.emit(nx, ny, nz, 0, 0, 0, 0.14, p.kind === 'bolt' ? 1.2 : 1.7, 0.2, c.r, c.g, c.b, 0.9);
    }
  }
}

// ------------------------------------------------------------
//  傷害與爆炸
// ------------------------------------------------------------
// 對單位 e 造成傷害。from = 攻擊方陣營（0 我方 / 1 敵方 / 2 中立爆炸）
// hx hy hz = 命中位置（顯示傷害數字用）、sx sz = 攻擊來源的位置（顯示受擊方向用）
function damageEnt(e, dmg, from, hx, hy, hz, sx, sz) {
  if (!e.alive || dmg <= 0) return;
  const P = G.player;
  // ── 玩家受傷：套用機體減傷與難度倍率，先扣護盾再扣裝甲 ──
  if (e === P) {
    if (P.invuln > 0 || G.state !== 'playing') return;
    dmg *= (1 - P.ch.armor) * G.diff.dmg * (from === 1 ? G.scale.dmg : 1);
    if (sx !== undefined && G.dmgDirs.length < 8) G.dmgDirs.push({ a: Math.atan2(sx - P.x, sz - P.z), t: 1 });
    if (P.shield > 0) {
      const a = Math.min(P.shield, dmg);
      P.shield -= a;
      dmg -= a;
      P.shieldFlash = 0.25;
      if (P.shield <= 0) {
        P.shieldT = 0;
        UI.log('護盾已被擊破');
      }
    }
    if (dmg > 0) {
      P.hp -= dmg;
      G.hurt = Math.min(1, G.hurt + dmg / 110);
      SND.play('hurt', 0.6, 0.12);
      FX.shake(0.22);
    }
    if (P.hp <= 0) playerDie();
    return;
  }
  // ── 油桶 ──
  if (e.isBarrel) {
    e.hp -= dmg;
    if (e.hp <= 0) barrelBoom(e);
    return;
  }
  if (e.isPart) {  // 巨蟲體節：傷害轉給本體
    e.flash = 0.12;
    G._tp = e;
    damageEnt(e.owner, dmg * 0.7, from, hx, hy, hz, sx, sz);
    G._tp = null;
    return;
  }
  // ── 敵人或我方小兵 ──　blue = 傷害被減免（數字顯示成藍色）
  let blue = false;
  if (e.team === 0) dmg *= G.diff.dmg * (from === 1 ? G.scale.dmg : 1);
  else {
    // 敵人的三種減傷：自身裝甲、護盾發生機的保護（只受四成傷害）、母艦的護盾節點（只受一成）
    if (e.def.armor) dmg *= 1 - e.def.armor;
    if (e.guardT > 0 && !e.def.aura) {
      dmg *= 0.4;
      blue = true;
    }
    if (e.def.nodes && G.enemies.some(o => o.alive && o.def.node && o.owner === e)) {
      dmg *= 0.1;
      blue = true;
    }
  }
  e.hp -= dmg;
  e.flash = 0.12;
  // 我方打中敵人：顯示命中標記與傷害數字
  if (from === 0 && e.team === 1) {
    G.hitMark = 0.18;
    if (hx !== undefined) {
      const big = dmg >= 100, tp = G._tp || e;
      FX.text(tp.x, tp.y + tp.h + 1, tp.z, String(Math.max(1, Math.round(dmg))),
          blue ? '#6ab8ff' : big ? '#ffd24a' : '#ffffff', big ? 20 : 14);
      SND.play('hit', 0.5, 0.05);
    }
    // Boss 血量每掉 25% 掉一次補給；低於一半時進入狂暴
    if (e.def.boss && e.hp > 0) {
      while (e.dropN < 3 && e.hp / e.maxHp < 0.75 - e.dropN * 0.25) {
        e.dropN++;
        bossDrop(e);
      }
      if (!e.enraged && e.hp < e.maxHp * 0.5) enrage(e);
    }
  }
  if (e.hp <= 0) killEnt(e, from);
}

// Boss 血量每掉 25% 就在玩家附近掉一個回復道具（Boss 連戰固定是修復模組）
function bossDrop(e) {
  const P = G.player, p = findSpawn(8, 24, false, true) || { x: P.x, z: P.z };
  spawnPickup(p.x, p.z, G.mode.id === 'boss' ? 'hp' : pick(['hp', 'hp', 'cp', 'shield']));
  if (G.mode.id === 'boss' && e.dropN === 2) spawnPickup(clamp(p.x + 6, -385, 385), p.z, 'cp');
  FX.beam(p.x, 0, p.z, p.x, 120, p.z, 0x5dff8a, 1.2, 0.6, 2);
  UI.log('Boss 受創 ─ 附近掉出了補給道具');
}

// 雙子：變形成第二形態（換模型、換行為，血量延續）
function morph(e) {
  // nd = 新形態的資料；建立新模型並放出變身特效
  const nd = ENEMIES[e.def.next], old = e.rig, cy = e.y + e.h * 0.5;
  const rig = makeMech(byId(CHASSIS, nd.mech), G.bossCycle > 0 ? BOSS_ALT_PAINT : nd.paint, nd.pri, nd.sec, nd.sc);
  FX.sphere(e.x, cy, e.z, 0xffffff, 2, 30, 0.7, 2.5);
  FX.ring(e.x, 0.5, e.z, nd.paint.glow, 2, 40, 0.8, 3);
  for (let i = 0; i < 8; i++) FX.bolt(e.x + rand(-10, 10), 120, e.z + rand(-10, 10), e.x + rand(-3, 3),
      cy + rand(-4, 4), e.z + rand(-3, 3), nd.paint.glow, 0.8, 0.4);
  // 換掉模型，並把這隻敵人的各項數值改成新形態的
  disposeRig(old);
  rig.root.position.set(e.x, e.y, e.z);
  G.scene.add(rig.root);
  e.rig = rig;
  e.def = nd;
  e.h = rig.height;
  e.r = nd.r;
  e.ab = nd.abil.map(a => a.cd * rand(0.5, 0.9));
  e.chargeT = 0;
  e.slamT = 0;
  e.busy = 0;
  e.swingT = 0;
  e.stun = 1.2;
  e.big = (nd.cr || nd.r) >= 4.5;
  e.fireCd = 2;
  UI.banner('形態變換', nd.name + ' ─ ' + nd.form);
  SND.play('alarm');
  FX.shake(1.2);
}

// Boss 血量低於一半時觸發：有第二形態的就變形，否則進入狂暴（招式冷卻變短）
function enrage(e) {
  if (e.def.next) {
    e.enraged = true;
    morph(e);
    return;
  }
  e.enraged = true;
  UI.banner('狂暴化', e.def.name + ' 的攻勢變得更猛烈了');
  SND.play('alarm');
  const cy = e.y + e.h * 0.5, col = e.def.paint.glow;
  FX.sphere(e.x, cy, e.z, 0xff3020, e.r, e.r * 6, 0.7, 2.5);
  FX.ring(e.x, 0.5, e.z, col, e.r, e.r * 8, 0.8, 3);
  FX.light(e.x, cy, e.z, 0xff3020, 8, 160, 0.8);
  for (let i = 0; i < 6; i++) FX.bolt(e.x + rand(-8, 8), 110, e.z + rand(-8, 8), e.x + rand(-3, 3), cy + rand(-3, 3),
      e.z + rand(-3, 3), col, 0.7, 0.35);
  FX.shake(1);
  if (e.def.nodes) ABIL.nodes(e);
}

// 爆炸：對半徑 r 內的單位造成傷害（離中心越遠傷害越低，最低 35%）
// team = 引爆方：0 只傷敵人、1 只傷我方、2 敵我都傷。big = 大型爆炸（音效與震動更強）
function explode(x, y, z, r, dmg, team, color = 0xff8a30, big = false) {
  const P = G.player;
  FX.explosion(x, y, z, r, color);
  SND.at(big ? 'bigboom' : 'boom', x, z, big ? 1 : clamp(r / 10, 0.35, 1), 0.05);
  const dp = Math.hypot(x - P.x, z - P.z);
  if (dp < r * 7) FX.shake(clamp(r / (dp + 6), 0, big ? 1.8 : 1.0));
  // seen：記錄已經受過傷的對象，避免同一隻被算兩次
  const seen = new Set();
  const hurt = list => {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, clamp(y, e.y, e.y + e.h) - y, e.z - z) - e.r;
      if (d >= r) continue;
      const key = e.isPart ? e.owner : e;
      if (seen.has(key)) continue;
      seen.add(key);  // 多節身體只算一次
      damageEnt(e, dmg * (d <= 0 ? 1 : lerp(1, 0.35, d / r)), team, e.x, e.y + e.h * 0.6, e.z, x, z);
    }
  };
  if (team !== 1) hurt(G.enemies);
  if (team !== 0) hurt(G.friends);
  // 爆炸也會引爆附近的油桶（連鎖爆炸）
  for (const b of G.barrels) if (b.alive && Math.hypot(b.x - x, b.z - z) < r + 1 &&
      Math.abs(y - 1) < r + 2) barrelBoom(b);
}

// 油桶爆炸（稍微延遲一下，連鎖時才有先後順序）
function barrelBoom(b) {
  if (!b.alive) return;
  b.alive = false;
  G.scene.remove(b.mesh);
  G.timers.push({ t: rand(0.06, 0.22), fn: () => explode(b.x, 1.3, b.z, 13, 180, 2, 0xff7a20) });
}

// 無聲移除（護衛自毀、節點隨母艦消失等）
function vanish(e, fx) {
  if (!e.alive) return;
  e.alive = false;
  if (fx) FX.explosion(e.x, e.y + e.h * 0.5, e.z, Math.max(3, e.r * 2), 0xffa040);
  if (e.parts) for (const p of e.parts) {
    p.alive = false;
    disposeRig(p.rig);
  }
  disposeRig(e.rig);
}

// 單位死亡：加分、掉落道具、爆炸特效，以及各種死亡時的特殊效果
function killEnt(e, from) {
  e.alive = false;
  const P = G.player, cy = e.y + e.h * 0.5, d = e.def;
  // ── 敵人被擊毀 ──
  if (e.team === 1) {
    G.kills++;
    G.score += Math.round(d.score * (1 + G.bossCycle * (d.boss ? 0.5 : 0)));
    P.cp = Math.min(100, P.cp + 4);
    if (P.mod.leech && P.alive) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * P.mod.leech);
    // 爆炸大小依體型而定
    const boss = !!d.boss, big = e.r > 2;
    FX.explosion(e.x, cy, e.z, boss ? 22 : big ? 9 : 4.5, 0xff8a30);
    if (big) {
      FX.explosion(e.x + rand(-3, 3), cy + 3, e.z + rand(-3, 3), 6);
      FX.sphere(e.x, cy, e.z, 0xffc070, 1, boss ? 34 : 12, 0.4);
    }
    SND.at(big ? 'bigboom' : 'boom', e.x, e.z, big ? 1 : 0.6, 0.04);
    if (boss) {
      FX.shake(2);
      G.slow = 1.3;  // 擊破 Boss：慢動作 + 連環爆炸
      FX.sphere(e.x, cy, e.z, 0xffffff, 2, 60, 0.9, 2);
      FX.ring(e.x, 0.6, e.z, d.paint.glow, 3, 70, 1.0, 3);
      FX.light(e.x, cy, e.z, 0xffe0a0, 10, 260, 1.0);
      for (let i = 0; i < 9; i++) G.timers.push({ t: 0.12 + i * 0.16,
          fn: () => FX.explosion(e.x + rand(-e.r, e.r) * 1.6, cy + rand(-4, 7), e.z + rand(-e.r, e.r) * 1.6,
          rand(6, 13), i % 2 ? 0xff8a30 : d.paint.glow) });
      if (e.parts) e.parts.forEach((p, i) => {
        p.alive = false;
        G.timers.push({ t: 0.08 * i, fn: () => {
          FX.explosion(p.x, p.y + 3, p.z, 8, 0xff8a30);
          disposeRig(p.rig);
        } });
      });
      // Boss 死亡：護盾節點一起消失，並在原地掉落四種道具
      for (const o of G.enemies) if (o.alive && o.def.node && o.owner === e) vanish(o, true);
      ['hp', 'shield', 'weapon',
          'cp'].forEach((t, i) => spawnPickup(clamp(e.x + Math.cos(i * 1.57) * 7, -385, 385),
              clamp(e.z + Math.sin(i * 1.57) * 7, -385, 385), t));
      UI.log('★ ' + d.name + ' 已被擊毀！');
      UI.banner('目標擊破', d.name);
    // 一般敵人依機率掉落道具（大型敵人 50%、小型 14%，再乘上幸運加成）
    } else if (!d.node && d.cost && Math.random() < (big ? 0.5 : 0.14) * P.mod.luck) spawnPickup(e.x, e.z,
        randomPickup());
    if (d.boom && d.boom.death) {  // 行走炸彈被打爆：延遲殉爆，敵我都會被炸到
      const x = e.x, z = e.z, b = d.boom;
      FX.ring(x, 0.4, z, 0xff3020, b.radius * 0.8, 2, 0.45, 2.5);
      G.timers.push({ t: 0.45, fn: () => explode(x, 2, z, b.radius * 0.8, b.dmg * 0.6, 2, 0xff5a20, true) });
    }
    if (d.split) for (let i = 0; i < d.split.n; i++) {  // 分裂母體：裂成數隻幼體
      const a = i / d.split.n * TAU, s = spawnEnemy(d.split.kind, clamp(e.x + Math.cos(a) * 2.5, -388, 388),
          clamp(e.z + Math.sin(a) * 2.5, -388, 388), null, true);
      s.vx = Math.cos(a) * 14;
      s.vz = Math.sin(a) * 14;
    }
  } else {
    // ── 我方小兵被擊毀 ──
    FX.explosion(e.x, cy, e.z, 4, 0x8ad8ff);
    SND.at('boom', e.x, e.z, 0.5, 0.04);
    UI.log('我方' + d.name + '被擊毀');
  }
  disposeRig(e.rig);
}

// ------------------------------------------------------------
//  玩家
// ------------------------------------------------------------
// 依照配置 lo 建立玩家機體，回傳玩家物件
function createPlayer(lo) {
  const ch = byId(CHASSIS, lo.chassis), paint = byId(PAINTS, lo.paint), pd = byId(PRIMARIES, lo.pri);
  const rig = makeMech(ch, paint, lo.pri, lo.sec, 1, true);
  G.scene.add(rig.root);
  // 碰撞點 = 機體預設的凸出部位 + 兩把武器的槍身與槍口（[x, z, 半徑, 離地高度, 高度]，以軀幹朝向為準）
  rig.root.updateMatrixWorld(true);
  const probes = (ch.probes || []).map(q => q.slice());
  for (const m of [rig.muzzleR, rig.muzzleL]) {
    if (!m) continue;
    const w = m.getWorldPosition(new THREE.Vector3());
    if (w.z > ch.r + 1) probes.push([w.x, w.z * 0.55, 0.9, w.y - 2, 4], [w.x, w.z - 0.4, 0.8, w.y - 2, 4]);
  }
  return {
    probes,
    // 基本：位置 x y z、速度 vx vy vz、碰撞半徑 r、高度 h
    kind: 'player', team: 0, alive: true, ch, paint, rig, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: ch.r, h: rig.height,
    // yaw 下半身朝向　aimYaw / aimPitch 瞄準的水平與垂直角度　hp 裝甲　shield 護盾量　shieldT 護盾剩餘秒數
    // energy 能量　eDelay 能量開始回復前的延遲　cp 指揮點數
    yaw: 0, aimYaw: 0, aimPitch: 0.04, hp: ch.hp, maxHp: ch.hp, shield: 0, shieldT: 0, shieldMax: 500, shieldFlash: 0,
        energy: ch.energy, eDelay: 0, cp: 60,
    // pri 主武器（ammo 彈藥、cd 射擊間隔、reload 換彈倒數、spin 加特林預熱）　sec 副武器　temp 限時武器
    pri: { def: pd, ammo: pd.mag, cd: 0, reload: 0, spin: 0 }, sec: { def: byId(SECONDARIES, lo.sec), cd: 0 },
        temp: null,
    // 三個技能與兩種小兵（各自記錄設定與冷卻）
    skills: lo.skills.map(id => ({ def: byId(SKILLS, id), cd: 0 })),
        minions: lo.minions.map(id => ({ def: byId(MINIONS, id) })),
    // mod：強化累積的倍率（每波選的強化都加在這裡）　ups：已取得的強化清單
    mod: { dmg: 1, rate: 1, speed: 1, cd: 1, eRegen: 1, cp: 1, minion: 1, wshield: 0, leech: 0, sec: 1,
        luck: 1 }, ups: [],
    // buff 道具增益的剩餘秒數　cannonCd 雙肩重砲冷卻　wingOpen 光翼展開程度　fade 機體透明度
    buff: { dmg: 0, haste: 0 }, cannonCd: 3, wingOpen: 0, fade: 1,
    // invuln 無敵剩餘秒數　dashT 突進剩餘秒數與方向　overT 超載模式　repairT 奈米修復
    // onGround 是否在地面　recoil 後座力　saberT 揮刀動畫　boosting 推進中　jetting 噴射飛行中
    invuln: 0, dashT: 0, dashX: 0, dashZ: 1, dashHit: null, overT: 0, repairT: 0, onGround: true, moveDir: 1, recoil: 0,
        saberT: 0, boosting: false, jetting: false, mvx: 0, mvz: 0,
  };
}
// 檢查凸出部位有沒有插進牆裡；有的話把整台機體推開
const _probe = { x: 0, y: 0, z: 0, r: 1, h: 1 };
function collideProbes(P) {
  // 把每個碰撞點從「機體座標」轉到世界座標，各自做一次牆壁碰撞；被推開多少，整台機體就跟著移多少
  const s = Math.sin(P.aimYaw), c = Math.cos(P.aimYaw);
  for (const q of P.probes) {
    const wx = P.x + q[0] * c + q[1] * s, wz = P.z - q[0] * s + q[1] * c;
    _probe.x = wx;
    _probe.z = wz;
    _probe.r = q[2];
    _probe.y = P.y + q[3];
    _probe.h = q[4];
    if (collideXZ(_probe, 0)) {
      P.x += _probe.x - wx;
      P.z += _probe.z - wz;
    }
  }
}

// 玩家目前的總傷害倍率 = 機體倍率 × 強化倍率 × 火力超載道具（2 倍）
function pdm() {
  const P = G.player;
  return P.ch.dmgMul * P.mod.dmg * (P.buff.dmg > 0 ? 2 : 1);
}

// 玩家陣亡：播放爆炸，進入 2.6 秒的陣亡演出後才顯示結算
function playerDie() {
  const P = G.player;
  if (!P.alive) return;
  P.alive = false;
  P.hp = 0;
  G.state = 'dying';
  G.dieT = 2.6;
  FX.explosion(P.x, P.y + 5, P.z, 16, 0xff8a30);
  FX.explosion(P.x + 2, P.y + 3, P.z - 1, 9);
  FX.sphere(P.x, P.y + 5, P.z, 0xffd090, 1, 24, 0.5);
  FX.shake(2);
  SND.play('bigboom');
  SND.play('lose');
  P.rig.root.visible = false;
  G.shieldMesh.visible = false;
}

// 每一格更新玩家：各種倒數、視角、移動、跳躍與噴射、碰撞、動畫、特效
function updatePlayer(dt) {
  const P = G.player, I = G.input, K = I.keys, ch = P.ch, rig = P.rig, B = P.buff;
  // ── 各種持續效果的倒數 ──
  P.invuln = Math.max(0, P.invuln - dt);
  if (P.overT > 0) P.overT -= dt;
  if (B.dmg > 0) B.dmg -= dt;
  if (B.haste > 0) B.haste -= dt;
  if (P.repairT > 0) {
    P.repairT -= dt;
    P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.08 * dt);
    if (Math.random() < dt * 16) FX.add.emit(P.x + rand(-2.5, 2.5), P.y + rand(1, P.h), P.z + rand(-2.5, 2.5), 0, 5, 0,
        0.7, 0.7, 0.1, 0.25, 1, 0.45, 1.6);
  }
  if (P.shieldT > 0) {
    P.shieldT -= dt;
    if (P.shieldT <= 0) P.shield = 0;
  }
  // 技能冷卻倒數、指揮點數自動回復
  for (const s of P.skills) if (s.cd > 0) s.cd -= dt;
  P.cp = Math.min(100, P.cp + 1.6 * P.mod.cp * dt);
  // over = 超載模式中、haste = 推進燃料作用中；free = 這段期間推進與飛行不耗能量
  const over = P.overT > 0, haste = B.haste > 0, free = over || haste;

  // ── 滑鼠轉動視角 ──（垂直角度有上下限，不能翻過頭）
  P.aimYaw -= I.mx * 0.0022;
  P.aimPitch = clamp(P.aimPitch - I.my * 0.0022, -0.95, 1.15);
  I.mx = I.my = 0;

  // ── WASD 移動 ──　f = 前後、r = 左右；再依視角方向換算成世界座標的移動方向 (mx, mz)
  const f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), r = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
  const sy = Math.sin(P.aimYaw), cy = Math.cos(P.aimYaw);
  let mx = sy * f - cy * r, mz = cy * f + sy * r;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) {
    mx /= ml;
    mz /= ml;
  }
  // 移動速度 = 機體速度 × 強化 ×（超載 1.35）×（推進燃料 1.4）
  const base = ch.speed * P.mod.speed;
  let sp = base * (over ? 1.35 : 1) * (haste ? 1.4 : 1);
  P.boosting = false;
  // 按住 Shift 推進：速度再乘上機體的推進倍率，每秒消耗 20 能量
  if ((K.ShiftLeft || K.ShiftRight) && ml > 0 && (P.energy > 1 || free)) {
    sp *= ch.boost;
    P.boosting = true;
    if (!free) {
      P.energy -= 20 * dt;
      P.eDelay = 0.7;
    }
  }
  P.mvx = mx;
  P.mvz = mz;
  // 突進中：以固定高速往突進方向衝，撞到的敵人各受一次傷害；否則依輸入平滑加速（空中比較難轉向）
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vx = P.dashX * 80;
    P.vz = P.dashZ * 80;
    if (P.vy < 0) P.vy = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.isPart || P.dashHit.has(e)) continue;
      if (Math.hypot(e.x - P.x, e.z - P.z) < P.r + e.r + 2.5 && Math.abs(e.y - P.y) < 12) {
        P.dashHit.add(e);
        damageEnt(e, 150 * pdm(), 0, e.x, e.y, e.z);
        FX.hit(e.x, e.y + e.h * 0.5, e.z, P.paint.glow);
        FX.shake(0.4);
      }
    }
    if (P.dashT <= 0) {
      P.vx *= 0.3;
      P.vz *= 0.3;
    }
  } else {
    const k = P.onGround ? 10 : 3.5;
    P.vx = damp(P.vx, mx * sp, k, dt);
    P.vz = damp(P.vz, mz * sp, k, dt);
  }

  // ── 空白鍵噴射飛行：有能量就持續往上推 ──
  P.jetting = false;
  if (K.Space && (P.energy > 1 || free)) {
    P.vy = Math.min(P.vy + 75 * dt, 17);
    P.jetting = true;
    P.onGround = false;
    if (!free) {
      P.energy -= 24 * ch.jet * dt;
      P.eDelay = 0.7;
    }
  }
  // 重力
  P.vy -= 34 * dt;
  // ── 水平移動 + 牆壁碰撞 ──　突進時速度很快，拆成三小步移動才不會直接穿過薄牆
  const steps = P.dashT > 0 ? 3 : 1;
  for (let i = 0; i < steps; i++) {
    P.x += P.vx * dt / steps;
    P.z += P.vz * dt / steps;
    collideXZ(P, 1.8);
  }
  for (let k = 0; k < 2; k++) {
    collideProbes(P);
    collideXZ(P, 1.8);
  }  // 兩輪：先推開凸出部位，再確保機身本體不在牆裡
  // 不能走出地圖邊界
  P.x = clamp(P.x, -394, 394);
  P.z = clamp(P.z, -394, 394);
  // ── 垂直移動：往上會撞天花板，往下會落在地面或屋頂上 ──
  let ny = P.y + P.vy * dt;
  if (P.vy > 0) {
    const c = ceilingAt(P.x, P.z, P.r, P.y + P.h - 0.5, ny + P.h);
    if (c < Infinity) {
      ny = c - P.h;
      P.vy = 0;
    }
  }
  const gy = groundAt(P.x, P.z, P.r, P.y, P.vy <= 0 ? 1.8 : 0.2);
  if (ny <= gy) {
    // 從高處重重落地：揚塵、衝擊波、震動
    if (P.vy < -20) {
      FX.puff(P.x, gy + 0.5, P.z, 8, 3, 1.2, 0.4, 2, 7, 0.45);
      FX.ring(P.x, gy + 0.3, P.z, 0xd0b090, 1, 8, 0.4, 0.6);
      FX.shake(0.5);
      SND.play('land', 0.7);
    }
    ny = gy;
    if (P.vy < 0) P.vy = 0;
    P.onGround = true;
  } else P.onGround = ny - gy < 0.15 && P.vy <= 0;
  P.y = Math.min(ny, 160);
  // 能量回復（剛用過能量後要等 0.7 秒才開始回）
  if (P.eDelay > 0) P.eDelay -= dt;
  else P.energy = Math.min(ch.energy, P.energy + ch.eRegen * P.mod.eRegen * dt);
  if (P.energy < 0) P.energy = 0;

  // ── 下半身朝向 ──　移動時腳朝移動方向；如果是往後退（和瞄準方向差很多）就倒著走
  const hs = Math.hypot(P.vx, P.vz);
  if (hs > 1) {
    let want = Math.atan2(P.vx, P.vz);
    P.moveDir = 1;
    if (Math.abs(angDiff(P.aimYaw, want)) > 1.9) {
      want += PI;
      P.moveDir = -1;
    }
    P.yaw = turnTo(P.yaw, want, 7 * dt);
  } else if (Math.abs(angDiff(P.yaw, P.aimYaw)) > 0.9) P.yaw = turnTo(P.yaw, P.aimYaw, 3 * dt);
  // ── 套用到模型並播放走路動畫 ──
  rig.root.position.set(P.x, P.y, P.z);
  rig.root.rotation.y = P.yaw;
  const grounded = P.onGround || rig.type === 'hover';
  const stepped = animRig(rig, dt, grounded ? Math.min(hs / base, 1.6) : 0, P.moveDir, rig.type === 'quad' ? 9 : 7);
  // 踩到地面的那一格：腳步聲、輕微震動、揚塵
  if (stepped && P.onGround) {
    SND.play('step', rig.type === 'quad' ? 0.42 : 0.32, 0.1);
    FX.shake(rig.type === 'quad' ? 0.08 : 0.05);
    FX.puff(P.x, P.y + 0.3, P.z, 1, 1.6, 0.7, 0.42, 1, 1.5, 0.28);
  }
  // 在空中時兩腿擺成一前一後的姿勢
  if (!P.onGround && rig.type === 'biped') {
    rig.thigh[0].rotation.x = damp(rig.thigh[0].rotation.x, rig.leg.tb - 0.25, 8, dt);
    rig.thigh[1].rotation.x = damp(rig.thigh[1].rotation.x, rig.leg.tb + 0.2, 8, dt);
  }
  // 上半身轉向瞄準方向；右手（主武器）跟著抬高或壓低，並加上後座力
  rig.waist.rotation.y = angDiff(P.yaw, P.aimYaw);
  P.recoil = damp(P.recoil, 0, 12, dt);
  rig.shoulder[1].rotation.x = -P.aimPitch - P.recoil * 0.12;
  // 揮刀動畫：左手在 0.32 秒內從一側橫掃到另一側
  if (P.saberT > 0) {
    P.saberT -= dt;
    const k = 1 - P.saberT / 0.32;
    rig.shoulder[0].rotation.x = -P.aimPitch - 0.4;
    rig.shoulder[0].rotation.y = lerp(1.3, -1.3, k);
    if (P.saberT <= 0) {
      rig.shoulder[0].rotation.y = 0;
      if (rig.blade) rig.blade.visible = false;
    }
  } else rig.shoulder[0].rotation.x = -P.aimPitch;
  rig.forearm[1].position.z = -P.recoil * 0.45;
  if (rig.head) rig.head.rotation.x = -P.aimPitch * 0.4;
  // 推進、飛行或突進時光翼會展開
  const thrust = P.boosting || P.jetting || P.dashT > 0;
  if (rig.wings[0]) {
    P.wingOpen = damp(P.wingOpen, thrust ? 1 : 0, 6, dt);
    rig.wings[0].rotation.z = -0.5 * P.wingOpen;
    rig.wings[1].rotation.z = 0.5 * P.wingOpen;
    rig.wings[0].rotation.x = rig.wings[1].rotation.x = -0.3 * P.wingOpen + Math.sin(G.time * 1.4) * 0.02;
  }

  // ── 特效：推進器火焰、增益光點、突進殘光 ──
  if (thrust || rig.type === 'hover') {
    const bx = P.x - sy * 2.2, bz = P.z - cy * 2.2, by = P.y + rig.hipY + 2.2, glow = P.paint.glow;
    if (thrust) for (let i = 0; i < 2; i++) FX.thruster(bx + rand(-1.2, 1.2), by, bz + rand(-1.2, 1.2), -P.vx * 0.3,
        P.jetting ? -22 : -10, -P.vz * 0.3, glow, 1.4);
    if (P.jetting) for (let i = 0; i < 2; i++) FX.thruster(P.x + rand(-1.5, 1.5), P.y + 1.5,
        P.z + rand(-1.5, 1.5), 0, -18, 0, glow, 1.1);
    if (rig.type === 'hover' && Math.random() < 0.7) FX.thruster(P.x + rand(-1.6, 1.6), P.y + 0.9,
        P.z + rand(-1.6, 1.6), 0, -9, 0, glow, 0.9);
  }
  if ((over || B.dmg > 0) && Math.random() < dt * 22) FX.add.emit(P.x + rand(-2, 2), P.y + rand(1, P.h),
      P.z + rand(-2, 2), 0, 6, 0, 0.5, 0.6, 0.1, 1, B.dmg > 0 ? 0.3 : 0.7, 0.2, 1.6);
  if (haste && Math.random() < dt * 22) FX.add.emit(P.x + rand(-2, 2), P.y + rand(0.5, 3), P.z + rand(-2, 2),
      -P.vx * 0.2, 2, -P.vz * 0.2, 0.5, 0.6, 0.1, 1, 0.95, 0.4, 1.4);
  if (P.dashT > 0) {
    const c = C(P.paint.glow);
    for (let i = 0; i < 3; i++) FX.add.emit(P.x + rand(-2, 2), P.y + rand(1, P.h), P.z + rand(-2, 2), 0, 0, 0,
        0.3, 2.2, 0.3, c.r, c.g, c.b, 1.0);
  }

  // ── 護盾球：有護盾時顯示；被打中會閃一下，快消失時會閃爍 ──
  const sm = G.shieldMesh;
  sm.visible = P.shield > 0;
  if (sm.visible) {
    P.shieldFlash = Math.max(0, P.shieldFlash - dt);
    sm.position.set(P.x, P.y + P.h * 0.5, P.z);
    sm.scale.setScalar(Math.max(P.h * 0.72, P.r * 2.4));
    sm.material.uniforms.col.value.setRGB(P.shieldMax > 600 ? 1.0 : 0.25, P.shieldMax > 600 ? 0.78 : 0.7,
        P.shieldMax > 600 ? 0.3 : 1.0);
    sm.material.uniforms.amp.value = (0.7 + P.shieldFlash * 6 +
        Math.sin(G.time * 5) * 0.1 - (P.shieldT < 1.5 ? 0.35 * (1 + Math.sin(G.time * 22)) : 0)) * (0.35 +
        0.65 * P.fade);
  }
}

// 鏡頭：機體放在畫面左下、準星周圍保持淨空；機體若還是擋到準星就自動淡化
function updateCamera(dt) {
  const P = G.player, cam = G.camera, ch = P.ch, k = ch.cam;
  // d = 瞄準方向（由水平角與垂直角算出）；(rx, rz) = 朝右的方向
  const cp = Math.cos(P.aimPitch), d = G.aimDir.set(Math.sin(P.aimYaw) * cp, Math.sin(P.aimPitch),
      Math.cos(P.aimYaw) * cp);
  const rx = -Math.cos(P.aimYaw), rz = Math.sin(P.aimYaw);
  // 鏡頭的高度會平滑跟隨（跳躍時畫面才不會上下猛晃）
  G.camY = Math.abs(G.camY - P.y) > 30 ? P.y : damp(G.camY, P.y, 12, dt);
  const hx = P.x, hy = G.camY + P.h * 0.92, hz = P.z, side = ch.camSide;
  // 鏡頭的支點從機體頭部往右、往上偏移；偏移方向上有牆的話就縮短，避免鏡頭穿牆
  const off = Math.max(0, Math.min(side, rayWorld(hx, hy, hz, rx, 0, rz, side + 0.9) - 0.9));
  const px = hx + rx * off, py = hy + Math.max(0, Math.min(ch.camUp,
      rayWorld(hx, hy, hz, 0, 1, 0, ch.camUp + 0.8) - 0.8)), pz = hz + rz * off;
  // 從支點往後拉鏡頭；後面有牆就拉近（拉近很快，拉遠比較慢）
  const want = Math.max(1.5, Math.min(21 * k, rayWorld(px, py, pz, -d.x, -d.y, -d.z, 21 * k + 1) - 0.9));
  G.camDist = damp(G.camDist, want, want < G.camDist ? 30 : 5, dt);
  // 鏡頭的最終位置，加上畫面震動
  const cd = G.camDist, ox = px - d.x * cd, oy = Math.max(0.6, py - d.y * cd), oz = pz - d.z * cd,
      sh = FX.shakeAmt * 0.6;
  G.camO.set(ox, oy, oz);
  cam.position.set(ox + rand(-sh, sh), oy + rand(-sh, sh), oz + rand(-sh, sh));
  cam.lookAt(cam.position.x + d.x, cam.position.y + d.y, cam.position.z + d.z);
  // 準星瞄準點
  // 從鏡頭往前射一條線，找出準星實際指到的地方（建築、地面或敵人）
  const t0 = cd + 2, sx = ox + d.x * t0, sy = oy + d.y * t0, sz = oz + d.z * t0;
  let at = rayWorld(sx, sy, sz, d.x, d.y, d.z, 480);
  G.aimEnt = null;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const tt = segHitEnt(sx, sy, sz, sx + d.x * at, sy + d.y * at, sz + d.z * at, e, 0.5);
    if (tt >= 0) {
      at *= tt;
      G.aimEnt = e.isPart ? e.owner : e;
    }
  }
  G.aim.set(sx + d.x * at, sy + d.y * at, sz + d.z * at);
  // 機體到準星視線的距離太近 → 淡化機體
  const cx = P.x - ox, cy = P.y + P.h * 0.6 - oy, cz = P.z - oz, al = cx * d.x + cy * d.y + cz * d.z;
  const miss = Math.hypot(cx - d.x * al, cy - d.y * al, cz - d.z * al);
  let op = al > 0 ? clamp((miss - ch.vis * 0.42) / (ch.vis * 0.45), 0.14, 1) : 1;
  if (cd < 9) op = Math.min(op, clamp((cd - 2) / 7, 0.14, 1));
  P.fade = damp(P.fade, op, 12, dt);
  const rg = P.rig, f = P.fade, tr = f < 0.985;
  if (rg.mat.transparent !== tr) {
    rg.mat.transparent = tr;
    rg.mat.needsUpdate = true;
  }
  rg.mat.opacity = tr ? f : 1;
  rg.glowMat.opacity = f;
  rg.veilMat.opacity = 0.3 * f;
}

// 從槍口 m 指向準星目標的方向（目標太近時直接用鏡頭方向，避免槍口往奇怪的角度射）
function aimFrom(m, out) {
  const dx = G.aim.x - m.x, dy = G.aim.y - m.y, dz = G.aim.z - m.z, l = Math.hypot(dx, dy, dz);
  if (l < 8) return out.copy(G.aimDir);
  return out.set(dx / l, dy / l, dz / l);
}

// ------------------------------------------------------------
//  武器
// ------------------------------------------------------------
// 每一格處理主武器、副武器，以及雷神的自動雙肩砲
function updateWeapons(dt) {
  const P = G.player, I = G.input, w = P.pri, over = P.overT > 0, dm = pdm();
  // 限時武器的倒數
  if (P.temp) {
    P.temp.t -= dt;
    if (P.temp.t <= 0) {
      P.temp = null;
      UI.toast('⌛', '試作武器能量耗盡', '已換回 ' + w.def.name);
    }
  }
  // d = 目前實際使用的武器設定（有限時武器就用它）
  const d = P.temp ? P.temp.def : w.def;
  if (w.cd > 0) w.cd -= dt;
  // 換彈：倒數結束補滿彈匣；按 R 或彈匣打空時開始換彈
  if (w.reload > 0) {
    w.reload -= dt;
    if (w.reload <= 0) w.ammo = w.def.mag;
  }
  else if (!P.temp && ((I.pressed.KeyR && w.ammo < w.def.mag) || w.ammo <= 0)) {
    w.reload = w.def.reload * (over ? 0.6 : 1);
    SND.play('reload', 0.7);
  }
  // 加特林要先轉到一定轉速才會開火
  const ready = P.temp || (w.reload <= 0 && w.ammo > 0);
  if (d.type === 'gatling') w.spin = damp(w.spin, I.lmb && ready ? 1 : 0, I.lmb ? 4.5 : 2, dt);
  if (P.rig.spin) P.rig.spin.rotation.z += (d.type === 'gatling' ? w.spin : 0) * 32 * dt;
  // ── 左鍵：主武器開火 ──
  if (I.lmb && ready && w.cd <= 0 && (d.type !== 'gatling' || w.spin > 0.85)) {
    w.cd = 1 / (d.rate * P.mod.rate * (over ? 1.6 : 1));
    if (!P.temp) w.ammo--;
    const m = P.rig.muzzleR.getWorldPosition(_v), dir = aimFrom(m, _dir);
    firePrimary(P, d, m, dir, dm);
  }
  // ── 右鍵：副武器 ──
  const s = P.sec;
  if (s.cd > 0) s.cd -= dt;
  if (I.rmb && s.cd <= 0) {
    s.cd = s.def.cd * P.mod.sec * (over ? 0.7 : 1);
    fireSecondary(P, s.def, dm);
  }

  if (P.ch.cannons && P.rig.cannons[0]) {  // 雷神的雙肩重砲：自動砲擊準星目標
    P.cannonCd -= dt;
    if (P.cannonCd <= 0 && (G.aimEnt || (I.lmb && G.enemies.length))) {
      P.cannonCd = 5 * P.mod.sec;
      for (let i = 0; i < 2; i++) G.timers.push({ t: i * 0.22, fn: () => {
        if (!P.alive) return;
        P.rig.root.updateMatrixWorld(true);
        const m = P.rig.cannons[i].getWorldPosition(_v), dir = aimFrom(m, _dir);
        spawnProj({ kind: 'shell', team: 0, x: m.x, y: m.y, z: m.z, dx: dir.x, dy: dir.y, dz: dir.z,
            speed: 210, dmg: 95 * pdm(), splash: 7, life: 2.2, color: 0xffb050 });
        FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, 0xffb050, 3.2);
        FX.puff(m.x, m.y, m.z, 3, 2, 0.7, 0.5, 1, 4, 0.4);
        SND.play('cannon', 0.9, 0.05);
        FX.shake(0.35);
        P.recoil += 1.2;
      } });
    }
  }
}

// 即時命中的貫穿射線（磁軌砲、光束砲共用）
// 參數：m = 槍口、dir = 方向、d = 武器設定、heavy = 磁軌砲等級的粗光束
function hitscan(m, dir, d, dmg, heavy) {
  const tW = rayWorld(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.range), ex = m.x + dir.x * tW, ey = m.y + dir.y * tW,
      ez = m.z + dir.z * tW, seen = new Set();
  // 線上所有敵人都會受傷（貫穿）；多節的巨蟲只算一次
  for (const e of G.enemies) if (e.alive && segHitEnt(m.x, m.y, m.z, ex, ey, ez, e, heavy ? 0.9 : 0.6) >= 0) {
    const key = e.isPart ? e.owner : e;
    if (seen.has(key)) continue;
    seen.add(key);
    damageEnt(e, dmg, 0, e.x, e.y, e.z);
    FX.hit(e.x, e.y + e.h * 0.55, e.z, d.color);
    if (heavy) FX.sparks(e.x, e.y + e.h * 0.55, e.z, 10, d.color, 20, 0.5);
  }
  for (const b of G.barrels) if (b.alive && segHitEnt(m.x, m.y, m.z, ex, ey, ez, b, 0.6) >= 0) barrelBoom(b);
  FX.beam(m.x, m.y, m.z, ex, ey, ez, d.color, heavy ? 1.0 : 0.5, heavy ? 0.4 : 0.1, 2.5);
  FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xffffff, heavy ? 0.35 : 0.18, heavy ? 0.3 : 0.08, 4);
  if (heavy) {
    const c = C(d.color), n = Math.min(40, Math.floor(tW / 5));
    for (let i = 0; i < n; i++) {
      const t = (i + Math.random()) / n * tW;
      FX.add.emit(m.x + dir.x * t, m.y + dir.y * t, m.z + dir.z * t, rand(-2, 2), rand(-2, 2), rand(-2, 2),
          rand(0.4, 0.8),
          1.4, 0.1, c.r, c.g, c.b, 1.2);
    }
    FX.explosion(ex, ey, ez, 3, d.color);
  } else FX.hit(ex, ey, ez, d.color);
}

// 主武器開火：依武器類型產生子彈、火光、音效與後座力
function firePrimary(P, d, m, dir, dm) {
  switch (d.type) {
    // 子彈類：突擊機砲、加特林
    case 'bullet':
    case 'gatling':
      spread(dir, d.spread);
      spawnProj({ kind: 'bullet', team: 0, x: m.x, y: m.y, z: m.z, dx: dir.x, dy: dir.y, dz: dir.z,
          speed: d.speed, dmg: d.dmg * dm, life: d.range / d.speed, color: d.color });
      FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, d.type === 'gatling' ? 0.7 : 1);
      SND.play(d.snd, 0.55, 0.03);
      P.recoil += d.type === 'gatling' ? 0.12 : 0.3;
      break;
    // 霰彈類：一次射出多發，每發各自散開
    case 'pellet':
    case 'nova':
      for (let i = 0; i < d.pellets; i++) {
        _dir2.copy(dir);
        spread(_dir2, d.spread);
        spawnProj({ kind: d.type === 'nova' ? 'plasma' : 'bullet', team: 0, x: m.x, y: m.y, z: m.z,
            dx: _dir2.x, dy: _dir2.y, dz: _dir2.z, speed: d.speed * rand(0.9, 1.1), dmg: d.dmg * dm,
            splash: d.splash || 0, life: d.range / d.speed, color: d.color });
      }
      FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, 2.2);
      FX.puff(m.x, m.y, m.z, 2, 1.5, 0.5, 0.5, 1, 3, 0.3);
      SND.play(d.snd, 0.8);
      P.recoil += 1.6;
      FX.shake(0.22);
      break;
    // 電漿：命中後會小範圍爆炸
    case 'plasma':
      spread(dir, d.spread);
      spawnProj({ kind: 'plasma', team: 0, x: m.x, y: m.y, z: m.z, dx: dir.x, dy: dir.y, dz: dir.z,
          speed: d.speed, dmg: d.dmg * dm, splash: d.splash, life: d.range / d.speed, color: d.color });
      FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, 1.3);
      SND.play(d.snd, 0.6);
      P.recoil += 0.5;
      break;
    // 磁軌砲：瞬間命中並貫穿
    case 'rail':
      hitscan(m, dir, d, d.dmg * dm, true);
      FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, 3);
      SND.play(d.snd, 0.9);
      P.recoil += 2.6;
      FX.shake(0.45);
      break;
    // 限時武器：毀滅者光束砲
    case 'beamgun':
      hitscan(m, dir, d, d.dmg * dm, false);
      FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, 1.2);
      SND.play(d.snd, 0.5, 0.05);
      P.recoil += 0.15;
      break;
    // 限時武器：蜂群飛彈（往斜上方射出後自動追蹤）
    case 'swarm': {
        const t = pickTargets(3, 220, 0.8);
        _dir2.set(dir.x + rand(-0.3, 0.3), dir.y + rand(0.05, 0.4), dir.z + rand(-0.3, 0.3)).normalize();
        launchMissile(0, m.x, m.y, m.z, _dir2.x, _dir2.y, _dir2.z, t.length ? pick(t) : null, d.dmg * dm,
            d.splash, d.color, true);
        FX.muzzle(m.x, m.y, m.z, dir.x, dir.y, dir.z, d.color, 1.2);
        P.recoil += 0.3;
        break;
      }
    // 火焰噴射器：不產生子彈，直接對前方錐形範圍內、沒被牆擋住的敵人造成傷害並點燃
    case 'flame': {
        for (let i = 0; i < 3; i++) {
          _dir2.copy(dir);
          spread(_dir2, 0.13);
          const v = rand(42, 60);
          FX.flame(m.x, m.y, m.z, _dir2.x * v + P.vx, _dir2.y * v, _dir2.z * v + P.vz, 1);
        }
        if (Math.random() < 0.3) FX.light(m.x + dir.x * 8, m.y + dir.y * 8, m.z + dir.z * 8, 0xff7a20, 2.5, 40, 0.12);
        // hitCone：敵人是否在火焰的錐形範圍內
        const hitCone = e => {
          const ex = e.x - m.x, ey = e.y + e.h * 0.5 - m.y, ez = e.z - m.z, dist = Math.hypot(ex, ey, ez);
          if (dist > d.range + e.r) return false;
          return dist < e.r + 4 || (ex * dir.x + ey * dir.y + ez * dir.z) / dist > 0.94 - e.r / dist * 0.5;
        };
        const seen = new Set();
        for (const e of G.enemies) if (e.alive && hitCone(e) && losClear(m.x, m.y, m.z, e.x, e.y + e.h * 0.6, e.z)) {
          const key = e.isPart ? e.owner : e;
          if (seen.has(key)) continue;
          seen.add(key);
          damageEnt(e, d.dmg * dm, 0);
          key.burn = 3;
        }
        for (const b of G.barrels) if (b.alive && hitCone(b)) damageEnt(b, d.dmg, 0);
        SND.play(d.snd, 0.5, 0.12);
        break;
      }
  }
}

// 以準星為中心挑選鎖定目標
function pickTargets(n, maxDist = 230, cone = 0.86) {
  // 參數：n = 最多幾個、maxDist = 最遠距離、cone = 多靠近準星才算（越接近 1 越嚴格）
  const o = G.camO, d = G.aimDir, list = [];
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const ex = e.x - o.x, ey = e.y + e.h * 0.5 - o.y, ez = e.z - o.z, dist = Math.hypot(ex, ey, ez);
    if (dist > maxDist || e.y + e.h < -1) continue;
    const dot = (ex * d.x + ey * d.y + ez * d.z) / dist;
    if (dot > cone) list.push({ e, s: dot - dist * 0.0006 });
  }
  // 越靠近準星、距離越近的排越前面；準星直接指到的敵人永遠排第一
  list.sort((a, b) => b.s - a.s);
  if (G.aimEnt) {
    const i = list.findIndex(q => q.e === G.aimEnt);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
  }
  return list.slice(0, n).map(q => q.e);
}

// 副武器開火
function fireSecondary(P, d, dm) {
  const rig = P.rig;
  switch (d.type) {
    // 追蹤飛彈：鎖定準星附近的敵人，每 0.09 秒射出一枚
    case 'missile': {
        const tg = pickTargets(d.count);
        for (let i = 0; i < d.count; i++) G.timers.push({ t: i * 0.09, fn: () => {
          if (!P.alive) return;
          rig.root.updateMatrixWorld(true);
          const m = (rig.pod || rig.muzzleL).getWorldPosition(_v), a = G.aimDir;
          _dir.set(a.x + rand(-0.25, 0.25), a.y + 0.35 + rand(0, 0.25), a.z + rand(-0.25, 0.25)).normalize();
          const t = tg.length ? tg[i % tg.length] : null;
          if (!t) aimFrom(m, _dir);
          launchMissile(0, m.x, m.y, m.z, _dir.x, _dir.y, _dir.z, t && t.alive ? t : null, d.dmg * dm,
              d.splash, d.color, true);
          FX.puff(m.x, m.y, m.z, 2, 1.4, 0.6, 0.6, 1, 3, 0.4);
        } });
        break;
      }
    // 榴彈：依準星位置算出拋物線的初速，讓榴彈剛好落在準星指的地方
    case 'grenade': {
        const m = rig.muzzleL.getWorldPosition(_v), v = 85, g = 42;
        const dx = G.aim.x - m.x, dz = G.aim.z - m.z, D = Math.hypot(dx, dz) || 1, H = G.aim.y - m.y,
            t = Math.max(0.2, Math.min(D, 190) / v);
        let vx = dx / D * v, vz = dz / D * v, vy = H / t + 0.5 * g * t;
        if (D < 6) {
          vx = G.aimDir.x * v;
          vz = G.aimDir.z * v;
          vy = G.aimDir.y * v;
        }
        const sp = Math.hypot(vx, vy, vz);
        spawnProj({ kind: 'grenade', team: 0, x: m.x, y: m.y, z: m.z, dx: vx / sp, dy: vy / sp, dz: vz / sp,
            speed: sp, dmg: d.dmg * dm, splash: d.splash, grav: g, life: 6, color: d.color, trail: 1 });
        FX.muzzle(m.x, m.y, m.z, vx / sp, vy / sp, vz / sp, d.color, 1.8);
        SND.play('gren', 0.8);
        FX.shake(0.15);
        break;
      }
    // 光束軍刀：對前方扇形範圍內的敵人造成傷害，並消除範圍內的敵方子彈
    case 'saber': {
        P.saberT = 0.32;
        if (rig.blade) rig.blade.visible = true;
        SND.play('saber', 0.9);
        const cy = P.y + P.h * 0.6, col = d.color, seen = new Set();
        for (let i = 0; i < 7; i++) {
          const a = P.aimYaw + (i - 3) * 0.3;
          FX.beam(P.x + Math.sin(a) * 3, cy, P.z + Math.cos(a) * 3, P.x + Math.sin(a) * d.range,
              cy + G.aimDir.y * d.range * 0.6, P.z + Math.cos(a) * d.range, col, 0.5, 0.22, 2);
        }
        FX.light(P.x + G.aimDir.x * 6, cy, P.z + G.aimDir.z * 6, col, 3, 40, 0.2);
        // inArc：某個位置是否在揮砍的扇形範圍內
        const inArc = (x, z, r) => {
          const dx = x - P.x, dz = z - P.z, dist = Math.hypot(dx, dz);
          return dist < d.range + r && (dist < r + 4 || Math.abs(angDiff(P.aimYaw, Math.atan2(dx, dz))) < 1.15);
        };
        for (const e of G.enemies) if (e.alive && inArc(e.x, e.z, e.r) && e.y < P.y + P.h + 8 && e.y + e.h > P.y - 4) {
          const key = e.isPart ? e.owner : e;
          if (seen.has(key)) continue;
          seen.add(key);
          damageEnt(e, d.dmg * dm, 0, e.x, e.y, e.z);
          FX.sparks(e.x, e.y + e.h * 0.5, e.z, 12, col, 18, 0.5);
          FX.shake(0.35);
        }
        for (const b of G.barrels) if (b.alive && inArc(b.x, b.z, 1)) barrelBoom(b);
        for (let i = G.projs.length - 1; i >= 0; i--) {
          const p = G.projs[i];
          if (p.team === 1 && inArc(p.x, p.z, 0)) {
            FX.hit(p.x, p.y, p.z, col);
            freeProj(p);
            G.projs.splice(i, 1);
          }
        }
        break;
      }
    // 連鎖電弧：打中第一個目標後，跳到 30 公尺內最近的下一個敵人，每跳一次傷害剩八成
    case 'arc': {
        const m = rig.muzzleL.getWorldPosition(_v);
        let t = pickTargets(1, d.range, 0.93)[0], px = m.x, py = m.y, pz = m.z, dmg = d.dmg * dm;
        SND.play('arc', 0.9);
        FX.light(m.x, m.y, m.z, d.color, 3, 40, 0.2);
        if (!t) {
          FX.bolt(m.x, m.y, m.z, G.aim.x, G.aim.y, G.aim.z, d.color, 0.3, 0.2);
          FX.sparks(G.aim.x, G.aim.y, G.aim.z, 8, d.color, 12, 0.4);
          break;
        }
        const done = new Set();
        for (let i = 0; i <= d.chain && t; i++) {
          done.add(t);
          done.add(t.isPart ? t.owner : t);
          const tx = t.x, ty = t.y + t.h * 0.6, tz = t.z;
          FX.bolt(px, py, pz, tx, ty, tz, d.color, 0.32, 0.22);
          FX.sparks(tx, ty, tz, 8, d.color, 14, 0.4);
          damageEnt(t, dmg, 0, tx, ty, tz);
          if (t.alive && !t.isPart && !t.def.boss) t.stun = Math.max(t.stun, 0.7);
          px = tx;
          py = ty;
          pz = tz;
          dmg *= 0.8;
          let nb = null, nd = 30;
          for (const e of G.enemies) {
            if (!e.alive || done.has(e) || (e.isPart && done.has(e.owner))) continue;
            const dd = Math.hypot(e.x - px, e.z - pz);
            if (dd < nd) {
              nd = dd;
              nb = e;
            }
          }
          t = nb;
        }
        break;
      }
  }
}

// ------------------------------------------------------------
//  技能
// ------------------------------------------------------------
// 每個技能的實際效果；函式名稱對應 data.js 裡 SKILLS 的 id
const SKILL_FN = {
  // 噴射突擊：朝移動方向（沒按方向鍵就朝正前方）突進 0.32 秒，期間無敵
  dash(P) {
    let dx = P.mvx, dz = P.mvz;
    if (!dx && !dz) {
      dx = Math.sin(P.aimYaw);
      dz = Math.cos(P.aimYaw);
    }
    P.dashT = 0.32;
    P.dashX = dx;
    P.dashZ = dz;
    P.invuln = Math.max(P.invuln, 0.5);
    P.dashHit = new Set();
    SND.play('dash');
    FX.ring(P.x, P.y + 1, P.z, P.paint.glow, 1, 9, 0.35);
  },
  // 能量護盾：500 點護盾，持續 8 秒
  shield(P) {
    P.shield = Math.max(P.shield, 500);
    P.shieldMax = Math.max(500, P.shield);
    P.shieldT = Math.max(P.shieldT, 8);
    SND.play('shield');
    FX.sphere(P.x, P.y + P.h * 0.5, P.z, 0x66ccff, 1, P.h * 0.9, 0.35);
  },
  // 飛彈彈幕：從背後輪流發射 14 枚追蹤飛彈
  barrage(P) {
    const tg = pickTargets(8, 240, 0.2);
    for (let i = 0; i < 14; i++) G.timers.push({ t: i * 0.07, fn: () => {
      if (!P.alive) return;
      const sy = Math.sin(P.aimYaw), cy = Math.cos(P.aimYaw), sd = i % 2 ? 1 : -1;
      const x = P.x - sy * 2 - cy * sd * 1.6, y = P.y + P.h * 0.85, z = P.z - cy * 2 + sy * sd * 1.6;
      _dir.set(rand(-0.4, 0.4) + sy * 0.2, 1, rand(-0.4, 0.4) + cy * 0.2).normalize();
      const t = tg.length ? tg[i % tg.length] : null;
      launchMissile(0, x, y, z, _dir.x, _dir.y, _dir.z, t &&
          t.alive ? t : (G.enemies.find(e => e.alive) || null), 60 * pdm(), 6, 0xffa040, true);
    } });
  },
  // EMP 衝擊波：癱瘓範圍內的敵人（Boss 只癱瘓 1.5 秒），並清除敵方子彈
  emp(P) {
    const R = 42, y = P.y + P.h * 0.5;
    FX.sphere(P.x, y, P.z, 0x66ccff, 2, R, 0.55, 1.2);
    FX.ring(P.x, P.y + 0.5, P.z, 0x9be2ff, 2, R, 0.55, 3);
    FX.light(P.x, y, P.z, 0x66ccff, 6, 120, 0.5);
    SND.play('emp');
    FX.shake(0.7);
    for (const e of G.enemies) if (e.alive && !e.isPart && Math.hypot(e.x - P.x, e.z - P.z) < R + e.r) {
      damageEnt(e, 60, 0, e.x, e.y, e.z);
      if (e.alive) e.stun = e.def.boss ? 1.5 : 4;
    }
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const p = G.projs[i];
      if (p.team === 1 && Math.hypot(p.x - P.x, p.z - P.z) < R) {
        FX.hit(p.x, p.y, p.z, 0x66ccff);
        freeProj(p);
        G.projs.splice(i, 1);
      }
    }
  },
  // 軌道砲擊：在準星位置放一個 1.5 秒後落下的砲擊區域（實際效果在 updateZones）
  orbital(P) {
    G.zones.push({ type: 'orbital', x: G.aim.x, z: G.aim.z, t: 1.5, tick: 0 });
    SND.play('orbital');
    UI.log('軌道砲擊已標定目標');
  },
  // 奈米修復：5 秒內持續回血（回血寫在 updatePlayer）
  repair(P) {
    P.repairT = 5;
    SND.play('heal');
    FX.ring(P.x, P.y + 0.5, P.z, 0x5dff8a, 1, 7, 0.5);
  },
  // 超載模式：8 秒內射速、移速提升且不耗能量（實際加成寫在 updatePlayer / updateWeapons）
  overdrive(P) {
    P.overT = 8;
    SND.play('over');
    FX.sphere(P.x, P.y + P.h * 0.5, P.z, 0xffa030, 1, P.h, 0.4);
    FX.shake(0.3);
  },
  // 重力奇點：在準星位置放一個持續 4 秒的重力井（實際效果在 updateZones）
  gravity(P) {
    G.zones.push({ type: 'gravity', x: G.aim.x, y: Math.max(G.aim.y, 4), z: G.aim.z, t: 4, tick: 0 });
    SND.play('gravity');
  },
};

// 施放第 i 個技能（冷卻中就播放錯誤音效）；冷卻時間 = 技能冷卻 × 機體倍率 × 強化倍率
function castSkill(i) {
  const P = G.player, s = P.skills[i];
  if (!s) return;
  if (s.cd > 0) {
    SND.play('deny', 0.5);
    return;
  }
  SKILL_FN[s.def.id](P);
  s.cd = s.def.cd * P.ch.cdMul * P.mod.cd;
}

// ------------------------------------------------------------
//  區域效果（技能與敵方的持續性攻擊）
// ------------------------------------------------------------
// zone = 一個會持續一段時間的範圍效果。t 是剩餘秒數，tick 用來控制「每隔多久做一次」（特效或傷害）
function updateZones(dt) {
  const P = G.player;
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i];
    z.t -= dt;
    z.tick -= dt;
    switch (z.type) {
      // 玩家的軌道砲擊：先顯示紅色瞄準光束與縮小的圓圈，時間到後降下巨大光束並爆炸
      case 'orbital':
        if (z.tick <= 0) {
          z.tick = 0.12;
          FX.beam(z.x, 0, z.z, z.x, 260, z.z, 0xff3020, 0.25, 0.14, 2);
          FX.ring(z.x, 0.4, z.z, 0xff4020, 17, 2, 0.3, 2);
        }
        if (z.t <= 0) {
          FX.beam(z.x, 0, z.z, z.x, 320, z.z, 0xffd090, 11, 0.8, 3);
          FX.beam(z.x, 0, z.z, z.x, 320, z.z, 0xffffff, 5, 0.6, 4);
          FX.sphere(z.x, 2, z.z, 0xffc070, 2, 30, 0.6, 2);
          explode(z.x, 2, z.z, 18, 800 * pdm(), 0, 0xffb050, true);
          for (let k = 0; k < 5; k++) FX.explosion(z.x + rand(-9, 9), rand(1, 6), z.z + rand(-9, 9),
              rand(5, 9), 0xff9040);
          G.zones.splice(i, 1);
        }
        break;
      // 玩家的重力奇點：把範圍內的敵人往中心吸（Boss 吸不動、大型敵人吸得慢），每 0.25 秒傷害一次，結束時內爆
      case 'gravity': {
          const R = 32;
          // 被吸進去的紫色光點
          for (let k = 0; k < 3; k++) {
            const a = rand(TAU), r = rand(8, R), h = rand(-4, 8);
            FX.add.emit(z.x + Math.cos(a) * r, z.y + h, z.z + Math.sin(a) * r, -Math.cos(a) * r * 1.6 - Math.sin(a) * 9,
                -h * 1.5, -Math.sin(a) * r * 1.6 + Math.cos(a) * 9, 0.6, 1.4, 0.2, 0.6, 0.25, 1, 1.4);
          }
          FX.add.emit(z.x, z.y, z.z, 0, 0, 0, 0.1, 9, 7, 0.35, 0.1, 0.8, 0.9);
          const hitNow = z.tick <= 0;
          if (hitNow) z.tick = 0.25;
          for (const e of G.enemies) {
            if (!e.alive || e.isPart) continue;
            const dx = z.x - e.x, dz = z.z - e.z, d = Math.hypot(dx, dz);
            if (d > R) continue;
            const pull = (e.def.boss || e.def.node ? 0 : e.r > 2 ? 10 : 24) * dt;
            if (d > 2.5 && pull) {
              e.x += dx / d * pull;
              e.z += dz / d * pull;
              if (!e.def.fly) collideXZ(e, 0.5);
            }
            if (hitNow) damageEnt(e, 12 * pdm(), 0);
          }
          if (z.t <= 0) {
            explode(z.x, z.y, z.z, 15, 190 * pdm(), 0, 0xb060ff);
            FX.sphere(z.x, z.y, z.z, 0xb060ff, 10, 1, 0.3, 2);
            G.zones.splice(i, 1);
          }
          break;
        }
      case 'mortar':  // 敵方砲擊 / 光柱落點：預警圈 → 爆炸
        if (z.tick <= 0) {
          z.tick = 0.26;
          FX.ring(z.x, 0.35, z.z, z.color, z.r, z.r * 0.25, 0.28, 1.8);
          if (z.pillar) FX.beam(z.x, 0, z.z, z.x, 200, z.z, z.color, 0.14, 0.27, 1.2);
        }
        // 落地前一瞬間畫出砲彈從天而降的軌跡
        if (z.t < 0.35 && !z.fall && !z.pillar) {
          z.fall = true;
          FX.beam(z.x + 8, 80, z.z + 4, z.x, 0, z.z, z.color, 0.8, 0.36, 2.5);
        }
        if (z.t <= 0) {
          if (z.pillar) {
            FX.beam(z.x, 0, z.z, z.x, 240, z.z, z.color, z.r * 0.9, 0.45, 2.6);
            FX.beam(z.x, 0, z.z, z.x, 240, z.z, 0xffffff, z.r * 0.35, 0.35, 4);
          }
          explode(z.x, 1, z.z, z.r, z.dmg, 1, z.color);
          G.zones.splice(i, 1);
        }
        break;
      case 'wave': {  // 貼地擴散的衝擊光牆：跳起來就能躲過
          z.r += z.speed * dt;
          if (z.tick <= 0) {
            z.tick = 0.07;
            FX.ring(z.x, 0.5, z.z, z.color, z.r, z.r + 2.5, 0.16, 2.6);
            FX.ring(z.x, 2.4, z.z, z.color, z.r, z.r + 1.5, 0.12, 1.2);
          }
          // 光牆掃到的玩家與小兵各受傷一次；離地超過 3.2 公尺（跳起來）就不會被打到
          for (const f of G.friends) {
            if (!f.alive || z.hit.has(f)) continue;
            const dd = Math.hypot(f.x - z.x, f.z - z.z);
            if (Math.abs(dd - z.r) < 2.2 + f.r * 0.5) {
              z.hit.add(f);
              if (f.y - groundAt(f.x, f.z, f.r, f.y, 0.5) < 3.2) {
                damageEnt(f, z.dmg, 1, undefined, 0, 0, z.x, z.z);
                FX.sparks(f.x, f.y + 2, f.z, 10, z.color, 16, 0.5);
              }
            }
          }
          if (z.r > z.max) G.zones.splice(i, 1);
          break;
        }
      case 'ebeam': {  // Boss 死光掃射
          const e = z.owner;
          if (!e.alive || e.stun > 0) {
            e.lockAim = false;
            e.busy = 0;
            G.zones.splice(i, 1);
            break;
          }
          // warm = 還在預熱：只顯示細細的瞄準線、轉得比較快；正式發射後光束很粗、但轉動很慢（繞到側面就躲得掉）
          const m = unitMuzzle(e, _v), warm = z.t > z.dur;
          z.yaw = turnTo(z.yaw, Math.atan2(P.x - m.x, P.z - m.z), (warm ? 2.6 : e.enraged ? 0.75 : 0.52) * dt);
          e.aimYaw = z.yaw;
          const pitch = Math.atan2(P.y + P.h * 0.5 - m.y, Math.max(10, Math.hypot(P.x - m.x, P.z - m.z))),
              cp = Math.cos(pitch);
          const dx = Math.sin(z.yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(z.yaw) * cp;
          // 光束打到建築就會被擋住
          const len = rayWorld(m.x, m.y, m.z, dx, dy, dz, 260), ex = m.x + dx * len, ey = m.y + dy * len,
              ez = m.z + dz * len;
          if (warm) {
            FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xff3060, 0.16, 0.05, 1.6);
            if (z.tick <= 0) {
              z.tick = 0.2;
              FX.sparks(m.x, m.y, m.z, 3, z.color, 10, 0.4, 0.5);
            }
          }
          else {
            FX.beam(m.x, m.y, m.z, ex, ey, ez, z.color, 2.0, 0.07, 2.6);
            FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xffffff, 0.7, 0.06, 4);
            FX.sparks(ex, ey, ez, 2, z.color, 16, 0.5, 0.5);
            if (Math.random() < 0.4) FX.puff(ex, ey + 0.5, ez, 1, 2.5, 1, 0.2, 3, 3, 0.5);
            FX.light(ex, ey + 2, ez, z.color, 4, 50, 0.08);
            SND.at('laser', e.x, e.z, 0.8, 0.07);
            if (z.tick <= 0) {
              z.tick = 0.1;
              for (const f of G.friends) if (f.alive && segHitEnt(m.x, m.y, m.z, ex, ey, ez, f, 1.0) >= 0) damageEnt(f,
                  z.dmg * 0.1, 1, undefined, 0, 0, e.x, e.z);
            }
          }
          if (z.t <= 0) {
            e.lockAim = false;
            G.zones.splice(i, 1);
          }
          break;
        }
      case 'spiral': {  // Boss 旋轉彈幕（貼地，跳起來可閃）
          const e = z.owner;
          if (!e.alive || e.stun > 0) {
            G.zones.splice(i, 1);
            break;
          }
          // 發射角度持續旋轉，每 0.1 秒朝三個方向各射一發，形成螺旋
          z.ang += dt * (e.enraged ? 2.9 : 2.2);
          if (z.tick <= 0) {
            z.tick = 0.1;
            if (e.y > 6) FX.beam(e.x, e.y + e.h * 0.35, e.z, e.x, 4, e.z, z.color, 0.4, 0.12, 1.6);
            for (let k = 0; k < 3; k++) {
              const a = z.ang + k * TAU / 3;
              spawnProj({ kind: 'bolt', team: 1, x: e.x + Math.sin(a) * 2, y: 4, z: e.z + Math.cos(a) * 2,
                  dx: Math.sin(a), dy: 0, dz: Math.cos(a), speed: z.speed, dmg: z.dmg, life: 5, color: z.color });
            }
            SND.at('eshot', e.x, e.z, 0.4, 0.08);
          }
          if (z.t <= 0) G.zones.splice(i, 1);
          break;
        }
    }
  }
}

// ------------------------------------------------------------
//  小兵（我方）
// ------------------------------------------------------------
// 派出小兵。slot = 第幾種（0 / 1）；free = 免費增援（道具給的，不扣點數也不顯示錯誤）
function deployMinion(slot, free) {
  const P = G.player, m = P.minions[slot];
  if (!m) return;
  // n = 這次實際能派出幾台（不能超過場上數量上限）
  const d = m.def, alive = G.allies.filter(a => a.alive && a.def === d).length, n = Math.min(d.count, d.max - alive);
  if (n <= 0) {
    if (!free) {
      UI.log(d.name + '已達部署上限（' + d.max + '）');
      SND.play('deny', 0.5);
    }
    return;
  }
  if (!free) {
    if (P.cp < d.cost) {
      UI.log('指揮點數不足');
      SND.play('deny', 0.5);
      return;
    }
    P.cp -= d.cost;
  }
  G.deployed += n;
  // 在玩家前方排成扇形空降
  for (let i = 0; i < n; i++) {
    const a = P.aimYaw + (i - (n - 1) / 2) * 0.55 + (free ? slot - 0.5 : 0),
        dist = d.id === 'turret' ? 8 : 7 + (i % 2) * 2;
    spawnAlly(d, clamp(P.x + Math.sin(a) * dist, -390, 390), clamp(P.z + Math.cos(a) * dist, -390, 390));
  }
  SND.play('deploy');
  UI.log('已派出 ' + d.name + ' ×' + n);
}

// 建立一台我方小兵（空降光柱 + 加入友軍清單）
function spawnAlly(d, x, z) {
  const P = G.player, rig = makeUnit(d.id, P.paint), hp = d.hp * P.mod.minion;
  const a = { kind: d.id, def: d, team: 0, alive: true, x, y: d.fly ? P.y + d.fly : 0, z, vx: 0, vz: 0, r: d.r,
      h: d.h, hp, maxHp: hp, rig,
    yaw: P.aimYaw, aimYaw: P.aimYaw, fireCd: rand(0.2, 0.6), think: 0, target: null, orbit: rand(TAU), flash: 0,
        life: d.id === 'spider' ? 30 : 0, seed: rand(10), alt: 0, healT: 0, stun: 0 };
  collideXZ(a, 0.5);
  rig.root.position.set(a.x, a.y, a.z);
  G.scene.add(rig.root);
  G.allies.push(a);
  FX.spawnBeam(a.x, a.z, P.paint.glow);
  return a;
}

// 找出 range 範圍內離 a 最近的敵人；los = true 時還要「看得到」（中間沒有建築擋住）
function nearestEnemy(a, range, los) {
  let best = null, bd = range;
  const ax = a.x, ay = a.y + a.h * 0.75, az = a.z;
  for (const e of G.enemies) {
    if (!e.alive || e.y + e.h < 0) continue;
    const d = Math.hypot(e.x - ax, e.z - az) - e.r;
    if (d < bd && (!los || losClear(ax, ay, az, e.x, e.y + e.h * 0.6, e.z))) {
      bd = d;
      best = e;
    }
  }
  return best;
}

// 取得某個單位槍口的世界座標；alt = true 時用左邊的槍口（左右輪流開火）；沒有槍口就用身體上方
function unitMuzzle(u, out, alt) {
  const m = (alt && u.rig.muzzleL) || u.rig.muzzleR;
  if (!m) return out.set(u.x, u.y + u.h * 0.7, u.z);
  u.rig.root.updateMatrixWorld(true);
  return m.getWorldPosition(out);
}

// 每一格更新一台我方小兵：找目標、移動、攻擊或治療
function updateAlly(a, dt) {
  const d = a.def, P = G.player, rig = a.rig;
  // 被打中時閃白一下
  if (a.flash > 0) {
    a.flash -= dt;
    rig.mat.emissive.setScalar(a.flash > 0 ? 0.2 : 0);
  }
  // 每 0.25 秒左右才重新找一次目標（不用每一格都找，省效能）
  a.think -= dt;
  if (a.think <= 0) {
    a.think = 0.25 + rand(0.12);
    a.target = d.heal ? null : nearestEnemy(a, d.range, a.kind !== 'spider');
  }
  const t = a.target && a.target.alive ? a.target : null;
  let mx = 0, mz = 0;
  const pdx = P.x - a.x, pdz = P.z - a.z, dp = Math.hypot(pdx, pdz) || 0.01;
  // follow：離玩家超過 near 公尺就跟上來（優先沿著尋路流場走，才不會被建築卡住）
  const follow = (near) => {
    if (dp > near) {
      if (flowDir(a.x, a.z)) {
        mx = _flow.x;
        mz = _flow.z;
      } else {
        mx = pdx / dp;
        mz = pdz / dp;
      }
    }
  };
  let tdx = 0, tdz = 0, td = 0;
  if (t) {
    tdx = t.x - a.x;
    tdz = t.z - a.z;
    td = Math.hypot(tdx, tdz) || 0.01;
  }

  // ── 各種小兵的移動方式 ──
  switch (a.kind) {
    // 步兵：有目標時保持在射程內、太近就後退；沒目標就跟著玩家
    case 'trooper':
      if (t) {
        if (td > d.range * 0.75) {
          mx = tdx / td;
          mz = tdz / td;
        } else if (td < 12) {
          mx = -tdx / td;
          mz = -tdz / td;
        } else if (dp > 45) follow(20);
      }
      else follow(13);
      break;
    // 無人機與修護機：在玩家前方繞圈飛行，高度跟著玩家並且會飛越屋頂
    case 'drone':
    case 'medic': {
        a.orbit += dt * (a.kind === 'drone' ? 0.9 : 0.5);
        const rad = a.kind === 'drone' ? 9 : 6, fwd = a.kind === 'drone' ? 12 : 9;  // 在玩家前方盤旋，不擋鏡頭
        const gx = P.x + Math.sin(P.aimYaw) * fwd + Math.cos(a.orbit) * rad - a.x,
            gz = P.z + Math.cos(P.aimYaw) * fwd + Math.sin(a.orbit) * rad - a.z, gd = Math.hypot(gx, gz);
        if (gd > 1.5) {
          const k = Math.min(1, gd / 8);
          mx = gx / gd * k;
          mz = gz / gd * k;
        }
        a.y = damp(a.y, Math.max(P.y + d.fly, roofAt(a.x, a.z, 2) + 2) + Math.sin(G.time * 2 + a.seed) * 0.8, 3, dt);
        break;
      }
    // 蜘蛛雷：直衝最近的敵人，碰到就引爆；30 秒內沒找到目標也會自爆
    case 'spider':
      a.life -= dt;
      if (t) {
        mx = tdx / td;
        mz = tdz / td;
        if (td < t.r + a.r + 2 || a.life <= 0) {
          a.alive = false;
          explode(a.x, 1, a.z, d.boomR, d.boom * pdm() * P.mod.minion, 0, P.paint.glow);
          disposeRig(rig);
          return;
        }
      } else {
        follow(10);
        if (a.life <= 0) {
          a.alive = false;
          explode(a.x, 1, a.z, d.boomR, d.boom, 0, P.paint.glow);
          disposeRig(rig);
          return;
        }
      }
      break;
  }
  // ── 實際移動與碰撞 ──
  if (d.speed > 0) {
    a.vx = damp(a.vx, mx * d.speed, 6, dt);
    a.vz = damp(a.vz, mz * d.speed, 6, dt);
    a.x = clamp(a.x + a.vx * dt, -392, 392);
    a.z = clamp(a.z + a.vz * dt, -392, 392);
    collideXZ(a, d.fly ? 0 : 0.5);
  }
  const hs = Math.hypot(a.vx, a.vz);
  if (hs > 0.5) a.yaw = turnTo(a.yaw, Math.atan2(a.vx, a.vz), 6 * dt);
  a.aimYaw = turnTo(a.aimYaw, t ? Math.atan2(tdx, tdz) : (d.speed > 0 ? a.yaw : a.aimYaw + dt * 0.4), 6 * dt);
  placeRig(a, dt, d.speed > 0 ? hs / d.speed : 0);

  // ── 攻擊 / 治療 ──
  a.fireCd -= dt;
  // 修護機：治療範圍內的玩家與其他小兵，並畫出綠色的治療光束
  if (d.heal) {
    a.healT -= dt;
    let healing = false;
    if (dp < d.range && P.hp < P.maxHp && P.alive) {
      P.hp = Math.min(P.maxHp, P.hp + d.heal * P.mod.minion * dt);
      healing = true;
      if (a.healT <= 0) FX.beam(a.x, a.y, a.z, P.x, P.y + P.h * 0.6, P.z, 0x5dff8a, 0.22, 0.2, 1.6);
    }
    for (const o of G.allies) if (o !== a && o.alive && o.hp < o.maxHp && Math.hypot(o.x - a.x, o.z - a.z) < d.range) {
      o.hp = Math.min(o.maxHp, o.hp + d.heal * 0.6 * dt);
      if (a.healT <= 0) FX.beam(a.x, a.y, a.z, o.x, o.y + o.h * 0.6, o.z, 0x5dff8a, 0.14, 0.2, 1.2);
      healing = true;
    }
    if (a.healT <= 0) {
      a.healT = 0.18;
      if (healing) SND.at('heal', a.x, a.z, 0.12, 0.5);
    }
  // 其他小兵：槍口對準目標後開火。無人機用瞬間命中的雷射；步兵與砲塔射子彈（會預判目標移動）
  } else if (t && d.dmg && a.fireCd <= 0 && Math.abs(angDiff(a.aimYaw, Math.atan2(tdx, tdz))) < 0.4) {
    a.fireCd = 1 / d.rate;
    a.alt ^= 1;
    const m = unitMuzzle(a, _v, a.alt), ty = t.y + t.h * 0.55, dmg = d.dmg * pdm() * P.mod.minion;
    if (a.kind === 'drone') {
      FX.beam(m.x, m.y, m.z, t.x, ty, t.z, P.paint.glow, 0.22, 0.12, 3);
      FX.hit(t.x, ty, t.z, P.paint.glow);
      damageEnt(t, dmg, 0);
      SND.at('laser', a.x, a.z, 0.5, 0.05);
    } else {
      const tt = td / 220;
      _dir.set(t.x + (t.vx || 0) * tt - m.x, ty - m.y, t.z + (t.vz || 0) * tt - m.z).normalize();
      spread(_dir, 0.02);
      spawnProj({ kind: 'bullet', team: 0, x: m.x, y: m.y, z: m.z, dx: _dir.x, dy: _dir.y, dz: _dir.z,
          speed: 220, dmg, life: 0.6, color: 0xffe0a0 });
      FX.muzzle(m.x, m.y, m.z, _dir.x, _dir.y, _dir.z, 0xffd27a, 0.6);
      SND.at('mg', a.x, a.z, 0.3, 0.05);
    }
  }
}

// ============================================================
//  敵人
// ============================================================
// 十隻 Boss 都打過一輪後，第二輪起的「強化型」Boss 改用這套黑紅配色
const BOSS_ALT_PAINT = { main: 0x141418, sub: 0x5a0f1a, dark: 0x060608, accent: 0xffffff, glow: 0xff2060 };

// 在 (x, z) 生成一隻敵人。owner = 召喚它的 Boss（護盾節點用）；quiet = 不顯示空降光柱
function spawnEnemy(kind, x, z, owner, quiet) {
  const d = ENEMIES[kind], boss = !!d.boss;
  // 決定配色：Boss 用專屬配色、護盾節點跟著母艦、其他依階級
  const paint = boss ? (G.bossCycle > 0 ? BOSS_ALT_PAINT : d.paint) : d.node &&
      owner ? owner.def.paint : TIER_PAINT[d.tier || 1];
  // 建立模型：精英機甲隨機挑一台玩家機體與武器；雙子直接用玩家機體的模型；其他用 units.js 的模型
  let rig;
  if (kind === 'elite') rig = makeMech(pick(CHASSIS), TIER_PAINT[G.wave >= 13 ? 3 : G.wave >= 9 ? 2 : 1],
      pick(PRIMARIES).id, pick(SECONDARIES).id);
  else if (d.mech) {
    rig = makeMech(byId(CHASSIS, d.mech), paint, d.pri, d.sec, d.sc);
    if (rig.blade) rig.blade.visible = true;
  }
  else {
    rig = makeUnit(d.model || kind, paint);
    if (d.sc) rig.inner.scale.setScalar(d.sc);
  }
  // 血量倍率 = 難度 × 這一波的強度 ×（強化型 Boss 每輪 +50%）
  const hpMul = G.diff.hp * G.scale.hp * (boss ? 1 + G.bossCycle * 0.5 : 1);
  const mech = kind === 'elite' || d.mech;
  // 敵人物件的欄位很多，大致分成：
  //   基本：位置、速度、半徑、高度、血量、模型
  //   瞄準與射擊：yaw / aimYaw 朝向、fireCd 射擊冷卻、burstLeft 連射還剩幾發、target 目標、los 是否看得到目標
  //   狀態：stun 癱瘓、flash 閃白、burn 燃燒、guardT 受護盾保護、fuse 自爆倒數
  //   各種攻擊的冷卻：snCd 狙擊、misCd 飛彈、morCd 迫擊砲、meleeCd 近戰、leapCd 跳躍
  //   Boss 招式：ab 各招的冷卻、slamT 砸地、chargeT 衝撞、busy 出招中、enraged 狂暴
  //   尋路：big 是否大型、stuck 卡住多久、noLos 多久沒看到目標、relocCd 重新投放冷卻、slotAng 包圍玩家時站的角度
  const e = { kind, def: d, team: 1, alive: true, x, y: d.wyrm ? -12 : d.fly || 0, z, vx: 0, vz: 0, r: d.r,
      h: mech ? rig.height : d.h, hp: d.hp * hpMul, maxHp: d.hp * hpMul, rig, owner: owner || null,
    yaw: rand(TAU), aimYaw: 0, fireCd: rand(1, 2.5), burstLeft: 0, burstT: 0, think: rand(0.3), target: null,
        los: false,
    stun: 0, flash: 0, burn: 0, burnTick: 0, charge: 0, snCd: rand(1, 3), misCd: rand(3, 6), morCd: rand(2, 4),
        meleeCd: 0, fuse: 0, beepT: 0, guardT: 0, leapCd: rand(1.5, 4), leapT: 0,
    slamT: 0, slamA: null, chargeT: 0, cdx: 0, cdz: 0, chargeHit: null, busy: 0, lockAim: false,
        enraged: false, latV: 0, swingT: 0, liftT: 0,
    big: !d.fly && (d.cr || d.r) >= 4.5, dropN: 0, stuck: 0, noLos: 0, relocCd: 0, slotAng: rand(TAU),
        slotT: rand(4, 8),
        buddy: null, healT: 0, orb: rand(TAU), linkT: 0, hadPartner: false,
    ab: d.abil ? d.abil.map(a => a.cd * rand(0.4, 0.9)) : null, seed: rand(10), px: x, pz: z, flowT: 0, wantMove: false,
        lockX: 0, lockY: 0, lockZ: 0 };
  e.aimYaw = e.yaw;
  rig.root.position.set(x, e.y, z);
  G.scene.add(rig.root);
  G.enemies.push(e);
  if (d.wyrm) {  // 巨蟲：建立跟隨頭部的體節
    e.hy = -9;
    e.hist = [];
    e.parts = [];
    e.wv = rand(TAU);
    e.passT = 0;
    e.biteCd = 0;
    for (let i = 0; i < d.wyrm.segs; i++) {
      const sc = 1 - i / d.wyrm.segs * 0.55, pr = makeUnit('wyrmseg', paint);
      pr.inner.scale.setScalar(sc);
      pr.root.position.set(x, -20, z);
      G.scene.add(pr.root);
      const p = { kind: 'wyrmseg', def: PART_DEF, isPart: true, owner: e, team: 1, alive: true, x, y: -20, z,
          r: 3.0 * sc,
          h: 5.8 * sc, hp: 1, maxHp: 1, rig: pr, flash: 0, stun: 0, guardT: 0 };
      e.parts.push(p);
      G.enemies.push(p);
    }
  }
  if (!quiet) {
    FX.spawnBeam(x, z, boss ? 0xff2060 : 0xff3a20);
    SND.at('deploy', x, z, 0.4, 0.1);
  }
  // （Boss 登場時還會把這一波標記為 Boss 波，並生成母艦的護盾節點）
  if (boss) {  // Boss 登場演出
    const col = paint.glow, cy = Math.max(4, e.y + e.h * 0.5);
    for (let i = 0; i < 7; i++) G.timers.push({ t: i * 0.11,
        fn: () => FX.bolt(x + rand(-14, 14), 130, z + rand(-14, 14), x + rand(-e.r, e.r), cy + rand(-4, 6),
        z + rand(-e.r, e.r), col, 0.9, 0.3) });
    FX.ring(x, 0.5, z, col, 2, e.r * 7, 0.9, 3);
    FX.ring(x, 0.5, z, 0xffffff, 1, e.r * 4, 0.6, 2);
    FX.sphere(x, cy, z, col, 2, e.r * 4.5, 0.8, 2);
    FX.light(x, cy, z, col, 9, 180, 0.9);
    FX.shake(1.1);
    SND.at('bigboom', x, z, 0.9);
    G.waveBoss = true;
    if (d.nodes) ABIL.nodes(e);
  }
  return e;
}

// 幫敵人 e 挑選目標：射程內、看得到、最近的（玩家的距離打七折 = 比較優先打玩家）；都看不到就先鎖定玩家
function acquire(e) {
  const P = G.player, ex = e.x, ey = e.y + e.h * 0.75, ez = e.z, lim = Math.max(e.def.range, 60) * 1.3;
  let best = null, bd = 1e9;
  for (const f of G.friends) {
    if (!f.alive) continue;
    const dd = Math.hypot(f.x - ex, f.z - ez) * (f === P ? 0.7 : 1);
    if (dd < bd && dd < lim && losClear(ex, ey, ez, f.x, f.y + f.h * 0.6, f.z)) {
      best = f;
      bd = dd;
    }
  }
  e.los = !!best;
  e.target = best || P;
}

// 把單位的位置與朝向套用到模型上，並依骨架類型播放動畫。mv = 移動速度比例
function placeRig(e, dt, mv) {
  const rig = e.rig, r = rig.root;
  r.position.set(e.x, e.y, e.z);
  switch (rig.type) {
    // 飛行：整台朝向目標；前進時機頭壓低，橫移時機身傾斜
    case 'fly':
      r.rotation.y = e.aimYaw;
      rig.inner.rotation.x = clamp(mv, 0, 1) * 0.18;
      rig.inner.rotation.z = damp(rig.inner.rotation.z, clamp(-(e.latV || 0) * 0.035, -0.45, 0.45), 3, dt);
      animRig(rig, dt, 0);
      break;
    // 戰車：車體朝移動方向，砲塔獨立轉向目標
    case 'tank':
      r.rotation.y = e.yaw;
      rig.waist.rotation.y = angDiff(e.yaw, e.aimYaw);
      animRig(rig, dt, 0);
      break;
    // 爬行（蜘蛛、砲蟹）：移動時身體上下左右晃動
    case 'crawler': {
        r.rotation.y = e.def.mortar ? e.aimYaw : e.yaw;
        const w = Math.sin(G.time * 16 + e.seed);
        rig.inner.position.y = Math.abs(w) * 0.3 * mv;
        rig.inner.rotation.z = w * 0.14 * mv;
        break;
      }
    // 固定式（砲塔）：只有上半部會轉
    case 'static':
      if (rig.waist) rig.waist.rotation.y = e.aimYaw;
      break;
    // 步行類：下半身朝移動方向、上半身轉向目標；大型單位踩地時有腳步聲，Boss 還會震動畫面
    default: {
        r.rotation.y = e.yaw;
        if (rig.waist) rig.waist.rotation.y = angDiff(e.yaw, e.aimYaw);
        const boss = !!e.def.boss;
        if (animRig(rig, dt, mv, 1, e.def.gait || (e.r > 2 ? 6.5 : 9)) && e.r > 2) {
          SND.at('step', e.x, e.z, boss ? 1 : 0.4, 0.1);
          if (boss) {
            const dd = Math.hypot(e.x - G.player.x, e.z - G.player.z);
            if (dd < 120) FX.shake(0.35 * (1 - dd / 120));
            FX.puff(e.x + rand(-e.r, e.r), 0.5, e.z + rand(-e.r, e.r), 3, 3, 1, 0.4, 2, 5, 0.35);
          }
        }
      }
  }
}

// 敵人朝目標 t 射出一發。f = 這隻敵人的 fire 設定
function enemyShoot(e, t, f) {
  const m = unitMuzzle(e, _v, e.burstLeft % 2 === 1);
  // tt = 子彈飛到目標要幾秒；lead = 預判程度（高階敵人與 Boss 會更準地瞄準你移動的前方）
  const tt = Math.hypot(t.x - m.x, t.z - m.z) / f.speed, lead = e.def.tier > 1 || e.def.boss ? 0.7 : 0.35;
  let dx = t.x + (t.vx || 0) * tt * lead - m.x, dy = t.y + t.h * 0.55 - m.y, dz = t.z + (t.vz || 0) * tt * lead - m.z;
  // 砲彈會受重力往下掉，所以要瞄高一點
  if (f.shell) dy += 0.5 * 20 * tt * tt;
  const l = Math.hypot(dx, dy, dz) || 1;
  _dir.set(dx / l, dy / l, dz / l);
  spread(_dir, f.spread);
  spawnProj({ kind: f.rocket ? 'missile' : f.shell ? 'shell' : f.plasma ? 'plasma' : 'bolt', team: 1, x: m.x,
      y: m.y, z: m.z, dx: _dir.x, dy: _dir.y, dz: _dir.z, speed: f.speed, dmg: f.dmg, splash: f.splash || 0,
      grav: f.shell ? 20 : 0, life: 4.5, color: f.color, trail: f.rocket ? 1 : 0 });
  FX.muzzle(m.x, m.y, m.z, _dir.x, _dir.y, _dir.z, f.color, f.shell ? 2.2 : 0.8);
  SND.at(f.shell ? 'cannon' : f.rocket ? 'missile' : 'eshot', e.x, e.z, 0.6, 0.06);
}

// 敵人的各種遠程攻擊：連射、狙擊、迫擊砲、飛彈。dist = 和目標的距離
function enemyAttack(e, t, dist, dt) {
  // face = 槍口是否已經大致對準目標（對準了才會開火）
  const d = e.def, f = d.fire, ty = t.y + t.h * 0.55,
      face = Math.abs(angDiff(e.aimYaw, Math.atan2(t.x - e.x, t.z - e.z))) < 0.35;
  // 有手臂的敵人把雙手抬到瞄準的角度
  if (e.rig.shoulder[0] && e.swingT <= 0) {
    const p = Math.atan2(ty - (e.y + e.h * 0.7), dist);
    e.rig.shoulder[0].rotation.x = e.rig.shoulder[1].rotation.x = -p;
  }
  // ── 一般射擊：冷卻結束後開始一輪連射，每隔 gap 秒射一發 ──
  if (f && e.busy <= 0) {
    e.fireCd -= dt * (e.enraged ? 1.4 : 1) * (d.boss ? G.scale.rate : 1);
    if (e.burstLeft > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = f.gap;
        e.burstLeft--;
        enemyShoot(e, t, f);
      }
    }
    else if (e.fireCd <= 0 && face) {
      e.fireCd = (1 / f.rate) * rand(0.8, 1.3);
      e.burstLeft = f.burst;
      e.burstT = 0;
    }
  }
  // ── 狙擊：先用紅色雷射瞄準並蓄力；發射前 0.35 秒鎖定位置不再跟隨（這時候移動就能躲開）──
  if (d.snipe) {
    const s = d.snipe;
    if (e.snCd > 0) e.snCd -= dt;
    else if (face || e.charge > 0) {
      if (e.charge === 0) SND.at('charge', e.x, e.z, 0.5, 0.2);
      e.charge += dt;
      const m = unitMuzzle(e, _v);
      if (e.charge < s.charge - 0.35) {
        e.lockX = t.x;
        e.lockY = ty;
        e.lockZ = t.z;
      }
      FX.beam(m.x, m.y, m.z, e.lockX, e.lockY, e.lockZ, 0xff2020, 0.08 + e.charge * 0.07, 0.05, 1.6);
      if (e.charge >= s.charge) {
        e.charge = 0;
        e.snCd = s.cd * rand(0.8, 1.2);
        let dx = e.lockX - m.x, dy = e.lockY - m.y, dz = e.lockZ - m.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const tw = rayWorld(m.x, m.y, m.z, dx, dy, dz, l * 1.3), ex = m.x + dx * tw, ey = m.y + dy * tw,
            ez = m.z + dz * tw;
        for (const fr of G.friends) if (fr.alive && segHitEnt(m.x, m.y, m.z, ex, ey, ez, fr,
            0.2) >= 0) damageEnt(fr, s.dmg,
            1, undefined, 0, 0, e.x, e.z);
        FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xff4030, 0.55, 0.28, 3);
        FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xffffff, 0.2, 0.2, 3);
        FX.hit(ex, ey, ez, 0xff4030);
        FX.muzzle(m.x, m.y, m.z, dx, dy, dz, 0xff4030, 2);
        SND.at('snipe', e.x, e.z, 0.9);
      }
    }
  }
  // ── 迫擊砲：在目標預計會走到的位置放一個砲擊區域（地上會有預警圈）──
  if (d.mortar) {
    e.morCd -= dt;
    if (e.morCd <= 0 && face) {
      const s = d.mortar, m = unitMuzzle(e, _v);
      e.morCd = s.cd * rand(0.85, 1.2);
      for (let i = 0; i < (s.n || 1); i++) G.zones.push({ type: 'mortar',
          x: t.x + (t.vx || 0) * s.delay * 0.6 + rand(-3, 3) + (i ? rand(-12, 12) : 0),
          z: t.z + (t.vz || 0) * s.delay * 0.6 + rand(-3, 3) + (i ? rand(-12, 12) : 0), t: s.delay + i * 0.3,
          tick: 0, r: s.radius, dmg: s.dmg, color: 0xff7030 });
      FX.muzzle(m.x, m.y, m.z, 0, 1, 0, 0xff9040, 2.4);
      FX.beam(m.x, m.y, m.z, m.x + rand(-4, 4), m.y + 70, m.z + rand(-4, 4), 0xff9040, 0.5, 0.3, 2);
      FX.puff(m.x, m.y, m.z, 3, 2, 0.8, 0.5, 2, 3, 0.4);
      SND.at('cannon', e.x, e.z, 0.7, 0.06);
    }
  }
  // ── 追蹤飛彈（精英機甲）──
  if (d.missiles) {
    e.misCd -= dt;
    if (e.misCd <= 0) {
      e.misCd = d.missiles.cd * rand(0.8, 1.2);
      volley(e, t, d.missiles.n, d.missiles.dmg);
    }
  }
}

// 從頭頂往上連續發射 n 枚追蹤飛彈（敵人與 Boss 共用）
function volley(e, t, n, dmg) {
  for (let i = 0; i < n; i++) G.timers.push({ t: i * 0.14, fn: () => {
    if (!e.alive) return;
    _dir.set(rand(-0.5, 0.5), 1, rand(-0.5, 0.5)).normalize();
    launchMissile(1, e.x + rand(-1, 1) * e.r * 0.5, Math.max(2, e.y + e.h * 0.95),
        e.z + rand(-1, 1) * e.r * 0.5, _dir.x,
        _dir.y, _dir.z, t.alive ? t : G.player, dmg, 5.5, 0xff4030, false);
  } });
}

// 自爆型敵人引爆
function detonate(e) {
  const b = e.def.boom;
  e.alive = false;
  explode(e.x, e.y + e.h * 0.4, e.z, b.radius, b.dmg, 1, 0xff5a20, b.radius > 12);
  disposeRig(e.rig);
}

// 把卡死或找不到路的敵人重新投放到玩家附近（一般敵人是空投，Boss 是躍遷）
function relocate(e, near) {
  if (e.relocCd > 0 || e.busy > 0 || e.chargeT > 0) return false;
  // 找一個玩家附近、站得下的位置（near = 放得更近）；剛被投放過的 7 秒內不會再投放
  const p = findSpawn(near ? 32 : 48, near ? 68 : 100, e.big, near);
  if (!p) return false;
  const boss = !!e.def.boss, col = boss ? e.def.paint.glow : 0xff3a20;
  FX.sphere(e.x, e.y + e.h * 0.5, e.z, col, e.r * 1.6, 0.4, 0.3, 1.5);
  e.x = e.px = p.x;
  e.z = e.pz = p.z;
  e.vx = e.vz = 0;
  e.stuck = 0;
  e.noLos = 0;
  e.flowT = 0;
  e.relocCd = 7;
  FX.spawnBeam(p.x, p.z, col);
  if (boss) {
    FX.ring(p.x, 0.5, p.z, col, 2, e.r * 5, 0.6, 2.5);
    FX.shake(0.6);
    SND.at('bigboom', p.x, p.z, 0.8);
    UI.log('⚠ ' + e.def.name + ' 躍遷到你附近！');
  }
  return true;
}

// ---- Boss 技能 ----
// 每個函式的參數：e = Boss、a = 這一招的設定（來自 data.js 的 abil）、t = 目標、dist = 距離
// 回傳 false 代表這次條件不符沒有施放（1.2 秒後會再試）；狂暴（enraged）時大多數招式會變強
const ABIL = {
  // 追蹤飛彈
  missiles(e, a, t) {
    volley(e, t, a.n + (e.enraged ? 2 : 0), a.dmg);
  },
  // 震地衝擊：玩家夠近才用。先顯示紅圈蓄力 1.1 秒，然後傷害圈內所有站在地上的單位（實際傷害在 updateEnemy）
  slam(e, a, t, dist) {
    if (dist > a.radius * 0.85) return false;
    e.slamT = 1.1;
    e.slamA = a;
    e.swingT = 1.1;
    FX.ring(e.x, 0.5, e.z, 0xff2020, a.radius, 3, 1.1, 2.5);
    SND.at('charge', e.x, e.z, 1);
    UI.log('⚠ 震地衝擊 ─ 快噴射跳躍！');
  },
  // 衝擊光牆：從 Boss 腳下往外擴散的一圈光牆（實際效果在 updateZones 的 wave）
  wave(e, a) {
    const col = e.def.paint.glow;
    G.zones.push({ type: 'wave', x: e.x, z: e.z, r: e.r, speed: a.speed * (e.enraged ? 1.2 : 1), max: 110,
        dmg: a.dmg, color: col, hit: new Set(), t: 9, tick: 0 });
    FX.sphere(e.x, 3, e.z, col, e.r, e.r * 2.2, 0.4, 2);
    FX.shake(0.8);
    SND.at('bigboom', e.x, e.z, 0.8);
    UI.log('⚠ 衝擊光牆 ─ 用噴射跳過去！');
  },
  // 召喚小怪：場上已經超過 20 隻就不召喚；生成後確保它不是卡在牆裡或走不到玩家的地方
  summon(e, a) {
    if (liveCount() >= 20) return false;
    for (let i = 0; i < a.n; i++) {
      const an = rand(TAU), s = spawnEnemy(pick(a.kinds), clamp(e.x + Math.cos(an) * (e.r + 6), -385, 385),
          clamp(e.z + Math.sin(an) * (e.r + 6), -385, 385));
      if (!s.def.fly) {
        collideXZ(s, 0.5);
        const o = nearestOpen(WORLD.nav, s.x, s.z, 8);
        if (o && WORLD.nav.dist[navCell(s.x, s.z)] === 65535) {
          s.x = o.x;
          s.z = o.z;
        }
      }
    }
    UI.log(e.def.name + ' 召喚了增援！');
  },
  // 護盾節點（母艦專用）：節點全滅後才會重新展開
  nodes(e) {
    if (G.enemies.some(o => o.alive && o.def.node && o.owner === e)) return false;
    for (let i = 0; i < e.def.nodes; i++) {
      const n = spawnEnemy('node', e.x, e.z, e, true);
      n.orb = i / e.def.nodes * TAU;
      n.y = 30;
    }
    UI.log('⚠ 護盾節點已展開 ─ 先擊破節點！');
    SND.at('shield', e.x, e.z, 1);
  },
  // 拋射砲擊：第一發瞄準玩家預計走到的位置，其餘散落在周圍
  mortar(e, a, t) {
    const col = a.color || 0xff7030;
    for (let i = 0; i < a.n; i++) G.zones.push({ type: 'mortar',
        x: t.x + (i ? rand(-a.spread, a.spread) : (t.vx || 0) * 1.2),
        z: t.z + (i ? rand(-a.spread, a.spread) : (t.vz || 0) * 1.2), t: 1.7 + i * 0.22, tick: 0, r: a.radius,
        dmg: a.dmg, color: col });
    const m = unitMuzzle(e, _v);
    FX.muzzle(m.x, Math.max(1, m.y), m.z, 0, 1, 0, col, 3);
    SND.at('cannon', e.x, e.z, 1);
  },
  pillars(e, a, t) {  // 從天而降的光柱雨
    const col = e.def.paint.glow;
    for (let i = 0; i < a.n + (e.enraged ? 3 : 0); i++) G.zones.push({ type: 'mortar', pillar: true,
        x: t.x + (i ? rand(-a.spread, a.spread) : (t.vx || 0)),
        z: t.z + (i ? rand(-a.spread, a.spread) : (t.vz || 0)), t: 1.3 + i * 0.17, tick: 0, r: a.radius,
        dmg: a.dmg, color: col });
    SND.at('orbital', e.x, e.z, 1);
    UI.log('⚠ 光柱雨 ─ 離開地上的光圈！');
  },
  // 地毯式轟炸：沿著「Boss → 玩家」的直線排一列落點，所以往側邊移動就能躲開
  bombs(e, a, t) {
    let dx = t.x - e.x, dz = t.z - e.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    for (let i = 0; i < a.n; i++) {
      const o = (i - (a.n - 1) / 2) * 9;
      G.zones.push({ type: 'mortar', x: t.x + dx * o + rand(-2, 2), z: t.z + dz * o + rand(-2, 2),
          t: 1.3 + i * 0.16, tick: 0, r: a.radius, dmg: a.dmg, color: 0x40c0ff });
    }
    UI.log('⚠ 地毯式轟炸 ─ 往側邊閃避！');
    SND.at('alarm', e.x, e.z, 0.8);
  },
  // 環狀彈幕：朝四面八方各射一發貼地的光彈（高度 4，跳起來可以躲）
  ring(e, a) {
    const n = a.n + (e.enraged ? 6 : 0), off = rand(TAU), col = e.def.paint.glow;
    for (let i = 0; i < n; i++) {
      const an = off + i / n * TAU;
      spawnProj({ kind: 'bolt', team: 1, x: e.x + Math.sin(an) * e.r * 0.8, y: 4,
          z: e.z + Math.cos(an) * e.r * 0.8, dx: Math.sin(an), dy: 0, dz: Math.cos(an), speed: a.speed,
          dmg: a.dmg, life: 5, color: col });
    }
    FX.ring(e.x, 4, e.z, col, e.r, e.r * 3, 0.4, 2);
    if (e.def.fly) FX.beam(e.x, e.y + e.h * 0.35, e.z, e.x, 4, e.z, col, 0.6, 0.25, 2);
    SND.at('emp', e.x, e.z, 0.6);
  },
  crescent(e, a, t, dist) {  // 劍氣：一排橫向光刃貼地飛向目標
    if (dist > 130) return false;
    const dx = (t.x - e.x) / dist, dz = (t.z - e.z) / dist, col = e.def.paint.glow, n = a.n + (e.enraged ? 4 : 0);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 2.2, back = Math.abs(o) * 0.35;
      spawnProj({ kind: 'bolt', team: 1, x: e.x + dx * (e.r + 2 - back) - dz * o, y: 4.2,
          z: e.z + dz * (e.r + 2 - back) + dx * o, dx, dy: 0, dz, speed: a.speed, dmg: a.dmg, life: 3.5, color: col });
    }
    e.swingT = 0.45;
    FX.beam(e.x - dz * 12, 5, e.z + dx * 12, e.x + dz * 12, 5, e.z - dx * 12, col, 1.2, 0.25, 3);
    SND.at('saber', e.x, e.z, 1);
    SND.at('slash', e.x, e.z, 1);
  },
  // 掃射死光：先預熱 1.3 秒再發射（實際效果在 updateZones 的 ebeam）；期間 Boss 不會做別的事
  beam(e, a, t) {
    const warm = 1.3;
    G.zones.push({ type: 'ebeam', owner: e, t: a.dur + warm, dur: a.dur, yaw: e.aimYaw, dmg: a.dmg,
        color: e.def.paint.glow, tick: 0 });
    e.busy = a.dur + warm;
    e.lockAim = true;
    SND.at('charge', e.x, e.z, 1);
    UI.log('⚠ 死光充能中 ─ 快離開它的正面！');
  },
  // 螺旋彈幕（實際效果在 updateZones 的 spiral）
  spiral(e, a) {
    G.zones.push({ type: 'spiral', owner: e, t: a.dur, ang: rand(TAU), tick: 0, dmg: a.dmg, speed: a.speed,
        color: e.def.paint.glow });
  },
  // 衝撞：距離適中且看得到玩家才用；記下當下的方向後直線衝過去（實際移動在 updateEnemy）
  charge(e, a, t, dist) {
    if (dist < 18 || dist > 110 || !e.los) return false;
    e.chargeT = a.dur;
    e.cdx = (t.x - e.x) / dist;
    e.cdz = (t.z - e.z) / dist;
    e.chargeHit = new Set();
    e.chargeA = a;
    e.swingT = a.dur;
    FX.ring(e.x, 0.5, e.z, 0xff2020, e.r * 2, e.r, 0.4, 2.5);
    SND.at('dash', e.x, e.z, 1);
    UI.log('⚠ 衝撞 ─ 往側邊閃！');
  },
  // 瞬間移動：飛行 Boss 挑一個不會卡進大樓的空中位置；地面 Boss 挑玩家附近站得下的地方
  blink(e, a, t) {
    const col = e.def.paint.glow;
    let x = 0, z = 0, ok = false;
    if (e.def.fly) {
      for (let i = 0; i < 12 && !ok; i++) {
        const an = rand(TAU), dd = rand(40, 62);
        x = clamp(t.x + Math.cos(an) * dd, -380, 380);
        z = clamp(t.z + Math.sin(an) * dd, -380, 380);
        ok = roofAt(x, z, e.def.vr || e.r + 2) < e.y - 1;
      }
    } else {
      const p = findSpawn(16, 34, e.big, true);
      if (p) {
        x = p.x;
        z = p.z;
        ok = true;
      }
    }
    if (!ok) return false;
    FX.sphere(e.x, e.y + e.h * 0.5, e.z, col, e.r * 1.6, 0.5, 0.35, 2);
    FX.sparks(e.x, e.y + e.h * 0.5, e.z, 20, col, 22, 0.6, 0.5);
    e.x = e.px = x;
    e.z = e.pz = z;
    e.vx = e.vz = 0;
    FX.sphere(e.x, e.y + e.h * 0.5, e.z, col, 0.5, e.r * 2.2, 0.4, 2);
    FX.beam(e.x, 0, e.z, e.x, 200, e.z, col, 2, 0.4, 2);
    SND.at('emp', e.x, e.z, 0.7);
  },
};

// Boss 招式的排程：每一招各自倒數冷卻，輪到的就施放；一次只放一招
// 狂暴時冷卻快 1.5 倍；G.scale.rate 是 Boss 連戰前期用來放慢出招頻率的倍率
function runAbilities(e, t, dist, dt) {
  if (!e.ab || e.busy > 0 || e.chargeT > 0 || e.slamT > 0) return;
  const d = e.def;
  for (let i = 0; i < e.ab.length; i++) {
    e.ab[i] -= dt * (e.enraged ? 1.5 : 1) * G.scale.rate;
    if (e.ab[i] <= 0) {
      const a = d.abil[i];
      if (ABIL[a.type](e, a, t, dist) === false) e.ab[i] = 1.2;
      else {
        e.ab[i] = a.cd * rand(0.85, 1.15);
        break;
      }
    }
  }
}

// ---- 跳躍獵兵的跳躍 ----
// 開始跳躍：瞄準目標預計走到的位置，並在落點顯示紅圈預警
function startLeap(e, t) {
  const L = e.def.leap;
  e.leapCd = L.cd * rand(0.9, 1.3);
  e.leapT = e.leapDur = 1.15;
  e.lx0 = e.x;
  e.lz0 = e.z;
  e.lx1 = clamp(t.x + (t.vx || 0) * 0.7 + rand(-3, 3), -388, 388);
  e.lz1 = clamp(t.z + (t.vz || 0) * 0.7 + rand(-3, 3), -388, 388);
  FX.ring(e.lx1, 0.4, e.lz1, 0xff3020, L.radius, 1.5, 1.15, 2);
  FX.puff(e.x, 0.5, e.z, 5, 2.5, 0.8, 0.4, 2, 6, 0.4);
  SND.at('dash', e.x, e.z, 0.7, 0.1);
}
// 跳躍中：沿拋物線飛向落點，落地時對範圍內站在地上的單位造成傷害
function updateLeap(e, dt) {
  e.leapT -= dt;
  const k = clamp(1 - e.leapT / e.leapDur, 0, 1), L = e.def.leap;
  e.x = lerp(e.lx0, e.lx1, k);
  e.z = lerp(e.lz0, e.lz1, k);
  e.y = Math.sin(k * PI) * 19;
  e.yaw = e.aimYaw = Math.atan2(e.lx1 - e.lx0, e.lz1 - e.lz0);
  placeRig(e, dt, 0);
  FX.thruster(e.x, e.y + 1.5, e.z, 0, -14, 0, e.rig.root ? 0xffa020 : 0xffa020, 1.2);
  if (e.leapT <= 0) {
    e.y = 0;
    collideXZ(e, 0.5);
    FX.ring(e.x, 0.4, e.z, 0xff5a20, 1, L.radius, 0.35, 2.5);
    FX.puff(e.x, 0.6, e.z, 8, 3, 1.1, 0.4, 2, 8, 0.45);
    SND.at('land', e.x, e.z, 0.9, 0.05);
    const dp = Math.hypot(e.x - G.player.x, e.z - G.player.z);
    if (dp < 40) FX.shake(0.5 * (1 - dp / 40));
    for (const f of G.friends) if (f.alive && f.y < 4 && Math.hypot(f.x - e.x, f.z - e.z) < L.radius + f.r) damageEnt(f,
        L.dmg, 1, undefined, 0, 0, e.x, e.z);
  }
}

// ---- 護盾節點：繞著母艦轉 ----
function updateNode(e, dt) {
  // 母艦死了，節點也跟著消失
  const o = e.owner, P = G.player, d = e.def;
  if (!o || !o.alive) {
    vanish(e, true);
    return;
  }
  // 繞著母艦轉圈，高度會避開屋頂
  e.orb += dt * 0.6;
  const R = o.r + 9;
  e.x = clamp(o.x + Math.cos(e.orb) * R, -390, 390);
  e.z = clamp(o.z + Math.sin(e.orb) * R, -390, 390);
  e.y = damp(e.y, Math.max(d.fly, roofAt(e.x, e.z, 3) + 3) + Math.sin(G.time * 2 + e.seed), 3, dt);
  e.think -= dt;
  if (e.think <= 0) {
    e.think = 0.3;
    acquire(e);
  }
  const t = e.target || P, dx = t.x - e.x, dz = t.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
  e.aimYaw = turnTo(e.aimYaw, Math.atan2(dx, dz), d.turn * dt);
  placeRig(e, dt, 0);
  // 每 0.25 秒畫一條連到母艦的光束（表示正在提供護盾）
  e.linkT -= dt;
  if (e.linkT <= 0) {
    e.linkT = 0.25;
    FX.beam(e.x, e.y + 2, e.z, o.x, o.y + 1, o.z, o.def.paint.glow, 0.3, 0.28, 1.3);
  }
  if (e.stun > 0) {
    e.stun -= dt;
    return;
  }
  if (e.los && dist < d.range) enemyAttack(e, t, dist, dt);
}

// ---- 掘地巨蟲：頭部帶著一串體節，遇到建築就潛入地下 ----
function updateWyrm(e, dt) {
  // ── 頭部的移動：一直朝玩家游過去，轉彎很慢 ──
  const d = e.def, W = d.wyrm, P = G.player, rig = e.rig;
  const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
  if (e.stun > 0) e.stun -= dt;
  else {
    if (dist < 12) e.passT = 1.7;  // 穿過玩家後先直衝一段再回頭
    if (e.passT > 0) e.passT -= dt;
    else e.yaw = turnTo(e.yaw, Math.atan2(dx, dz), d.turn * (e.enraged ? 1.3 : 1) * dt);
    const sp = d.speed * (e.enraged ? 1.25 : 1);
    e.x = clamp(e.x + Math.sin(e.yaw) * sp * dt, -386, 386);
    e.z = clamp(e.z + Math.cos(e.yaw) * sp * dt, -386, 386);
    if (Math.abs(e.x) > 385 || Math.abs(e.z) > 385) e.passT = 0;
    e.wv += dt * 1.45;
  }
  // open = 這個位置是空地（沒有建築）。空地上會像海豚一樣上下起伏躍出地面；遇到建築就潛到地底
  const open = !WORLD.nav.blocked[navCell(e.x, e.z)] && roofAt(e.x, e.z, 8) < 2;
  const ty = open ? -6 + (Math.sin(e.wv) * 0.5 + 0.5) * 17 : -10, prev = e.hy;
  e.hy = damp(e.hy, ty, 2.6, dt);
  e.y = e.hy - 3.2;
  e.aimYaw = e.yaw;
  e.vx = Math.sin(e.yaw) * d.speed;
  e.vz = Math.cos(e.yaw) * d.speed;
  if ((prev < 0.5) !== (e.hy < 0.5)) {  // 鑽出或鑽入地面
    FX.puff(e.x, 1, e.z, 12, 5, 1.6, 0.36, 5, 14, 0.55);
    FX.ring(e.x, 0.5, e.z, 0xd0a060, 2, 13, 0.5, 1.4);
    FX.sparks(e.x, 1, e.z, 16, 0xffc070, 26, 0.9, 0.5);
    SND.at('bigboom', e.x, e.z, 0.6, 0.2);
    if (dist < 80) FX.shake(0.7 * (1 - dist / 80));
    if (e.hy >= 0.5) for (const f of G.friends) if (f.alive && f.y < 5 &&
        Math.hypot(f.x - e.x, f.z - e.z) < 10 + f.r) damageEnt(f,
        70, 1, undefined, 0, 0, e.x, e.z);
  }
  // 身體路徑
  const H = e.hist;
  // 每移動 0.8 公尺就把頭的位置記到 hist 裡；每一節身體就放在頭「之前走過」的位置上，看起來就像一條蟲
  if (!H.length || Math.hypot(e.x - H[0].x, e.hy - H[0].y, e.z - H[0].z) > 0.8) {
    H.unshift({ x: e.x, y: e.hy, z: e.z });
    if (H.length > W.segs * 6 + 8) H.pop();
  }
  const fl = e.flash > 0 ? 0.2 : 0;
  rig.root.position.set(e.x, e.hy, e.z);
  if (H.length > 1) rig.root.lookAt(e.x * 2 - H[1].x, e.hy * 2 - H[1].y, e.z * 2 - H[1].z);
  rig.inner.rotation.z += dt * 2.2;  // 鑽頭旋轉
  const step = Math.round(W.gap / 0.8);
  // 更新每一節身體的位置與朝向
  e.parts.forEach((p, i) => {
    const a = H[Math.min(H.length - 1, (i + 1) * step)], b = H[Math.min(H.length - 1, Math.max(0, (i + 1) * step - 2))];
    if (!a) return;
    p.x = a.x;
    p.z = a.z;
    p.y = a.y - p.h * 0.5;
    p.rig.root.position.set(a.x, a.y, a.z);
    if (b && b !== a) p.rig.root.lookAt(b.x, b.y, b.z);
    if (p.flash > 0) p.flash -= dt;
    p.rig.mat.emissive.setScalar(p.flash > 0 ? 0.25 : fl);
  });
  if (e.hy > -1 && Math.random() < dt * 14) FX.add.emit(e.x + rand(-3, 3), e.hy + rand(-2, 2), e.z + rand(-3, 3),
      rand(-2, 2), rand(1, 5), rand(-2, 2), 0.5, 1.6, 0.2, 1, 0.5, 0.15, 1.2);
  // 咬擊
  e.biteCd -= dt;
  if (e.biteCd <= 0 && e.hy > -1 && e.stun <= 0) for (const f of G.friends) if (f.alive &&
      Math.hypot(f.x - e.x, f.z - e.z) < e.r + f.r + 0.8 && f.y < e.y + e.h && f.y + f.h > e.y) {
    e.biteCd = 0.9;
    damageEnt(f, W.bite, 1, undefined, 0, 0, e.x, e.z);
    FX.sparks(f.x, f.y + 3, f.z, 12, 0xff8020, 18, 0.5);
    FX.shake(0.8);
  }
  if (e.hy > 1 && e.stun <= 0) runAbilities(e, P, dist, dt);
}

// 每一格更新一隻敵人。流程：狀態倒數 → 特殊單位（巨蟲 / 節點 / 跳躍中）→ 思考 → 決定怎麼移動 → 移動與碰撞 → 攻擊
function updateEnemy(e, dt) {
  if (e.isPart) return;
  const d = e.def, P = G.player, rig = e.rig;
  // 被打中時閃白一下
  if (e.flash > 0) {
    e.flash -= dt;
    if (!d.wyrm) rig.mat.emissive.setScalar(e.flash > 0 ? 0.2 : 0);
  }
  if (e.guardT > 0) e.guardT -= dt;
  if (e.busy > 0) e.busy -= dt;
  if (e.relocCd > 0) e.relocCd -= dt;
  // 燃燒中（被火焰噴射器點燃）：每 0.25 秒受一次傷害
  if (e.burn > 0) {
    e.burn -= dt;
    e.burnTick -= dt;
    if (e.burnTick <= 0) {
      e.burnTick = 0.25;
      damageEnt(e, 6 * pdm(), 0);
      if (!e.alive) return;
    }
    if (Math.random() < dt * 12) FX.flame(e.x + rand(-e.r, e.r), e.y + rand(0.5, e.h), e.z + rand(-e.r, e.r),
        0, 4, 0, 0.5);
  }
  // Boss 身上持續冒出發光粒子
  if (d.boss && Math.random() < dt * 10) {
    const c = C(d.paint.glow);
    FX.add.emit(e.x + rand(-e.r, e.r), Math.max(0.5, e.y + rand(0, e.h)), e.z + rand(-e.r, e.r), rand(-1, 1),
        rand(2, 6),
        rand(-1, 1), 0.8, 1.3, 0.1, c.r, c.g, c.b, 0.9);
  }
  if (d.wyrm) {
    updateWyrm(e, dt);
    return;
  }
  if (d.node) {
    updateNode(e, dt);
    return;
  }
  if (e.leapT > 0) {
    updateLeap(e, dt);
    return;
  }
  // 癱瘓中：不能動也不能攻擊，蓄力中的招式全部中斷
  if (e.stun > 0) {
    e.stun -= dt;
    e.vx = e.vz = 0;
    e.charge = 0;
    e.burstLeft = 0;
    e.chargeT = 0;
    e.slamT = 0;
    if (Math.random() < dt * 9) FX.sparks(e.x + rand(-e.r, e.r), e.y + e.h * rand(0.3, 0.9),
        e.z + rand(-e.r, e.r), 2, 0x8ad8ff, 8, 0.3, 0.25);
    placeRig(e, dt, 0);
    return;
  }
  // hunt = 獵殺模式（這一波剩沒幾隻時，小怪會加速主動來找玩家，不讓玩家到處找）
  const hunt = G.hunt && !d.boss;

  // ── 思考（約每 0.3 秒一次）：找目標、判斷是否卡住、挑選站位 ──
  e.think -= dt;
  if (e.think <= 0) {
    const tk = 0.22 + rand(0.12);
    e.think = tk;
    acquire(e);
    // 判斷有沒有卡住：想移動卻幾乎沒移動，stuck 就累積
    const moved = Math.hypot(e.x - e.px, e.z - e.pz);
    e.px = e.x;
    e.pz = e.z;
    if (e.wantMove && moved < d.speed * tk * 0.25) e.stuck += tk;
    else e.stuck = Math.max(0, e.stuck - tk * 2);
    e.noLos = e.los ? 0 : e.noLos + tk;
    // 卡住快一秒：強制改走尋路流場、換一個站位角度；飛行單位則往上拉高
    if (e.stuck > 0.9) {
      e.flowT = 1.8;
      e.slotAng = rand(TAU);
      if (d.fly) e.liftT = 2.5;
    }
    // 卡太久、或太久看不到玩家又離得很遠：直接重新投放到玩家附近
    const far = Math.hypot(P.x - e.x, P.z - e.z);
    if (e.stuck > 3.2 || (hunt && e.noLos > 6 && far > 55) ||
        (!d.boss && e.noLos > 25 && far > 150)) relocate(e, hunt || e.noLos > 20);
    // 每隔 5~9 秒換一個站位角度（敵人會散開包圍玩家，而不是擠在同一邊）
    e.slotT -= tk;
    if (e.slotT <= 0) {
      e.slotT = rand(5, 9);
      e.slotAng = rand(TAU);
    }
    if (G.aimEnt === e && !d.boss && e.r < 2.5 && Math.random() < 0.3) e.slotAng = Math.atan2(e.x - P.x,
        e.z - P.z) + pick([-1, 1]) * rand(0.7, 1.3);  // 被瞄準時橫移閃避
    if (d.aura || d.heal) {  // 支援型：跟著最需要的友軍
      let best = null, bs = 1e9;
      for (const o of G.enemies) {
        if (o === e || !o.alive || o.isPart || o.def.aura || o.def.heal || o.def.node) continue;
        const dd = Math.hypot(o.x - e.x, o.z - e.z);
        if (dd > 90) continue;
        const sc = d.heal ? o.hp / o.maxHp * 100 + dd * 0.3 : dd - (o.def.boss ? 60 : o.r * 6);
        if (sc < bs) {
          bs = sc;
          best = o;
        }
      }
      e.buddy = best;
      // 護盾發生機：讓範圍內的友軍獲得減傷，並畫出藍色連線
      if (d.aura) {
        let n = 0;
        for (const o of G.enemies) if (o !== e && o.alive && !o.def.aura && !o.isPart &&
            Math.hypot(o.x - e.x, o.z - e.z) < d.aura.radius) {
          o.guardT = 0.6;
          if (n++ < 6) FX.beam(e.x, e.y + 4.6, e.z, o.x, o.y + o.h * 0.6, o.z, 0x40a8ff, 0.14, 0.3, 1.2);
        }
      }
    }
  }

  const t = e.target || P, dx = t.x - e.x, dz = t.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
  // keep = 想和目標保持的距離：獵殺模式會靠更近；玩家血少時逼近、自己血少時拉遠
  let keep = d.keep;
  if (keep > 0) {
    if (hunt) keep = Math.min(keep, 26);
    else {
      if (P.hp < P.maxHp * 0.35) keep *= 0.75;
      if (!d.boss && e.hp < e.maxHp * 0.3) keep *= 1.35;
    }
  }
  // (mx, mz) = 這一格想移動的方向；spMul = 速度倍率
  let mx = 0, mz = 0, spMul = (e.enraged ? 1.2 : 1) * (hunt ? 1.3 : 1);
  if (e.flowT > 0) e.flowT -= dt;
  // 大型單位用另一張比較保守的導航網格
  const nav = e.big ? WORLD.navBig : WORLD.nav;
  // direct：直線走向目標
  const direct = () => {
    mx = dx / dist;
    mz = dz / dist;
  };
  // 朝目標前進：看得到就直線，看不到就沿導航流場繞路；被擠到死角就先走回路上
  e.atGoal = false;
  const approach = () => {
    if (d.fly || d.noclip) return direct();
    if (e.big && nav.dist[navCell(e.x, e.z)] <= 1) {  // 已經走到大型單位能到的最近處
      e.atGoal = true;
      if (e.los && dist < 34) direct();
      return;
    }
    if (e.los && e.flowT <= 0 && (!e.big || dist < 30)) return direct();
    if (flowDir(e.x, e.z, nav)) {
      mx = _flow.x;
      mz = _flow.z;
      return;
    }
    if (nav.dist[navCell(e.x, e.z)] === 0) return direct();
    const o = nearestOpen(nav, e.x, e.z);
    if (o) {
      const ox = o.x - e.x, oz = o.z - e.z, ol = Math.hypot(ox, oz) || 1;
      mx = ox / ol;
      mz = oz / ol;
    } else direct();
  };
  // touching = 已經碰到目標
  const touching = dist < t.r + e.r + 1.8 && e.y < t.y + t.h + 2 && e.y + e.h > t.y - 2;

  if (e.chargeT > 0) {  // Boss 衝撞中
    e.chargeT -= dt;
    mx = e.cdx;
    mz = e.cdz;
    spMul = e.chargeA.speed / d.speed;
    FX.puff(e.x + rand(-e.r, e.r), 1, e.z + rand(-e.r, e.r), 1, 4, 1, 0.4, 2, 5, 0.4);
    for (const f of G.friends) if (f.alive && !e.chargeHit.has(f) &&
        Math.hypot(f.x - e.x, f.z - e.z) < e.r + f.r + 1.5 && f.y < e.y + e.h) {
      e.chargeHit.add(f);
      damageEnt(f, e.chargeA.dmg, 1, undefined, 0, 0, e.x, e.z);
      FX.shake(1);
    }
  } else if (e.slamT > 0) {  // Boss 震地蓄力
    spMul = 0;
    e.slamT -= dt;
    if (e.slamT <= 0) {
      const a = e.slamA;
      FX.ring(e.x, 0.5, e.z, 0xff5a20, 3, a.radius, 0.5, 3);
      FX.puff(e.x, 1, e.z, 14, 5, 1.6, 0.4, 3, 16, 0.5);
      FX.shake(1.4);
      SND.at('bigboom', e.x, e.z, 1);
      for (const f of G.friends) if (f.alive && f.y < 5 &&
          Math.hypot(f.x - e.x, f.z - e.z) < a.radius + f.r) damageEnt(f,
          a.dmg, 1, undefined, 0, 0, e.x, e.z);
    }
  } else if (d.boom) {  // 自爆型
    approach();
    const b = d.boom;
    // 有引信的（行走炸彈）：靠近後開始倒數，越接近爆炸嗶聲越急；玩家跑遠了可以取消。沒引信的碰到就爆
    if (b.fuse) {
      if (e.fuse > 0 || dist < b.trigger + t.r) {
        if (e.fuse === 0) UI.log('⚠ 行走炸彈啟動引信 ─ 打爆它或趕快遠離！');
        e.fuse += dt;
        spMul = 0.25;
        e.beepT -= dt;
        if (e.beepT <= 0) {
          e.beepT = Math.max(0.07, 0.3 * (1 - e.fuse / b.fuse));
          SND.at('beep', e.x, e.z, 0.9, 0.04);
          FX.ring(e.x, 0.4, e.z, 0xff2020, b.radius, b.radius * 0.9, 0.2, 1.6);
        }
        if (e.fuse >= b.fuse) {
          detonate(e);
          return;
        }
        if (dist > (b.trigger + t.r) * 2.4 && e.fuse < b.fuse * 0.6) e.fuse = 0;
      }
    } else if (touching) {
      detonate(e);
      return;
    }
  } else if (d.melee) {  // 近戰型
    approach();
    if (d.leap) {
      e.leapCd -= dt;
      if (e.leapCd <= 0 && dist > 14 && dist < 80) {
        startLeap(e, t);
        return;
      }
    }
    // 蛇行接近（斬擊者）：讓玩家比較難瞄準
    if (d.zig && dist > 12 && e.los) {
      const a = Math.sin(G.time * 3 + e.seed) * 0.7, c = Math.cos(a), s = Math.sin(a), ox = mx;
      mx = mx * c - mz * s;
      mz = ox * s + mz * c;
    }
    e.meleeCd -= dt;
    // 進入攻擊距離：停下來揮砍
    if (dist < d.melee.range + t.r + e.r && e.y < t.y + t.h) {
      mx = mz = 0;
      if (e.meleeCd <= 0) {
        e.meleeCd = d.melee.cd * (e.enraged ? 0.75 : 1);
        e.swingT = 0.4;
        damageEnt(t, d.melee.dmg, 1, undefined, 0, 0, e.x, e.z);
        FX.sparks(t.x, t.y + Math.min(t.h * 0.4, 4), t.z, 8, 0xff5a30, 14, 0.4);
        SND.at('slash', e.x, e.z, 0.8, 0.05);
        FX.beam(e.x, e.y + Math.min(e.h * 0.6, 6), e.z, t.x, t.y + 3, t.z, d.boss ? d.paint.glow : 0xff5a30,
            d.boss ? 1.2 : 0.5, 0.12, 2);
      }
    }
  } else if ((d.aura || d.heal) && e.buddy && e.buddy.alive) {  // 支援型：待在友軍身邊、躲在玩家視線後方
    const b = e.buddy, bx = b.x - e.x, bz = b.z - e.z, bd = Math.hypot(bx, bz) || 0.01, want = b.r + (d.heal ? 9 : 7);
    if (bd > want + 4) {
      mx = bx / bd;
      mz = bz / bd;
    } else if (bd < want - 3) {
      mx = -bx / bd;
      mz = -bz / bd;
    }
    else if (dist < 22) {
      mx = -dx / dist;
      mz = -dz / dist;
    }
  } else if (d.speed > 0) {  // 射擊型：保持距離並繞到自己的站位（包圍玩家）
    if (!e.los || dist > keep * 1.25) approach();
    else if (dist < keep * 0.55) {
      mx = -dx / dist;
      mz = -dz / dist;
    }
    else {
      // 距離剛好：繞著玩家橫向移動到自己的站位角度
      const df = angDiff(Math.atan2(-dx, -dz), e.slotAng), sg = Math.abs(df) > 0.3 ? Math.sign(df) : 0;
      mx = -dz / dist * sg * 0.75;
      mz = dx / dist * sg * 0.75;
    }
  }
  if (e.busy > 0) spMul *= 0.25;
  // 記錄「這一格是否真的想移動」，給上面的卡住判斷使用
  e.wantMove = !!(mx || mz) && !e.atGoal && !(e.los && dist <= keep * 1.25 && !d.melee && !d.boom);
  if (e.los && (d.melee || d.boom) && dist < 30) e.wantMove = false;
  const sp = d.speed * spMul;
  e.vx = damp(e.vx, mx * sp, 5, dt);
  e.vz = damp(e.vz, mz * sp, 5, dt);
  // 移動（高速時分段，避免穿過薄牆）+ 碰撞
  const hs0 = Math.hypot(e.vx, e.vz), n = Math.max(1, Math.ceil(hs0 * dt / 1.2)), x0 = e.x, z0 = e.z;
  for (let i = 0; i < n; i++) {
    e.x = clamp(e.x + e.vx * dt / n, -392, 392);
    e.z = clamp(e.z + e.vz * dt / n, -392, 392);
    // Boss 用比較大的碰撞半徑 cr 來擋牆，龐大的身體才不會穿進建築
    if (d.cr) {
      const r0 = e.r;
      e.r = d.cr;
      collideXZ(e, d.fly ? 0 : d.step || 0.5);
      e.r = r0;
    } else collideXZ(e, d.fly ? 0 : d.step || 0.5);
  }
  if (e.chargeT > 0 && hs0 > 20 && Math.hypot(e.x - x0, e.z - z0) < hs0 * dt * 0.45) {  // 衝撞撞牆 → 暈眩
    e.chargeT = 0;
    e.stun = 1.4;
    e.vx = e.vz = 0;
    FX.puff(e.x, 2, e.z, 10, 4, 1.2, 0.4, 3, 10, 0.5);
    FX.sparks(e.x, 3, e.z, 20, 0xffc070, 22, 0.7, 0.5);
    FX.shake(0.9);
    SND.at('bigboom', e.x, e.z, 0.8);
    UI.log(d.name + ' 撞上障礙物，陷入暈眩！');
  }
  if (d.fly) {  // 飛行：遇到建築就爬升飛越，不會穿進大樓
    // 目標高度 alt：俯衝中 = 目標的高度；平常 = 設定的飛行高度；前方有建築就提高到屋頂之上
    const diving = d.dive && dist < 45, hs = hs0 || 1, vr = d.vr || e.r + 2, look = vr + 8;
    let alt = diving ? t.y + t.h * 0.5 - e.h * 0.5 : d.boss ? d.fly : Math.max(d.fly, t.y + 5);
    const roof = Math.max(roofAt(e.x, e.z, vr), roofAt(e.x + e.vx / hs * look, e.z + e.vz / hs * look, vr));
    if (roof + 3 > alt) alt = roof + 3;
    if (e.liftT > 0) {
      e.liftT -= dt;
      alt += 24;
    }
    alt += d.boss ? Math.sin(G.time * 0.8 + e.seed) * 1.5 : Math.sin(G.time * 2 + e.seed) * 1.3;
    e.y = damp(e.y, alt, alt > e.y + 2 ? 5 : diving ? 4 : 2, dt);
  }
  // ── 朝向與模型 ──　下半身朝移動方向；瞄準方向朝目標（施放死光時鎖住不轉）
  const hs = Math.hypot(e.vx, e.vz);
  if (hs > 0.5) e.yaw = turnTo(e.yaw, Math.atan2(e.vx, e.vz), 5 * dt);
  if (!e.lockAim) e.aimYaw = turnTo(e.aimYaw, e.los || d.boss ? Math.atan2(dx, dz) : e.yaw, d.turn * dt);
  e.latV = e.vx * Math.cos(e.aimYaw) - e.vz * Math.sin(e.aimYaw);
  placeRig(e, dt, d.speed > 0 ? hs / d.speed : 0);
  if (d.boom && Math.random() < dt * 6) FX.add.emit(e.x, e.y + e.h * 0.8, e.z, 0, 0, 0, 0.12, 2.2, 0.4, 1, 0.2,
      0.1, 1.2);
  if (rig.blink) rig.blink.scale.setScalar(1 + 0.6 * Math.abs(Math.sin(G.time * (e.fuse > 0 ? 22 : 4))));

  // ── 攻擊 ──　看得到目標且在射程內才會攻擊
  if (e.los && dist < d.range) enemyAttack(e, t, dist, dt);
  else e.charge = 0;
  // 近戰揮擊的手臂動畫
  if (e.swingT > 0) {
    e.swingT -= dt;
    if (rig.shoulder[1]) rig.shoulder[1].rotation.x = lerp(0.5, -2.1, clamp(e.swingT / 0.4, 0, 1));
  }

  if (d.heal) {  // 維修無人機：修復附近的敵軍
    e.healT -= dt;
    const show = e.healT <= 0;
    if (show) e.healT = 0.25;
    for (const o of G.enemies) if (o !== e && o.alive && !o.isPart && o.hp < o.maxHp &&
        Math.hypot(o.x - e.x, o.z - e.z) < d.heal.radius) {
      o.hp = Math.min(o.maxHp, o.hp + d.heal.hps * (o.def.boss ? 3 : 1) * dt);
      if (show) FX.beam(e.x, e.y, e.z, o.x, o.y + o.h * 0.6, o.z, 0xff40a0, 0.2, 0.26, 1.5);
    }
  }
  // 最後處理 Boss 的招式
  runAbilities(e, t, dist, dt);
}

// 把互相重疊的單位推開（敵人之間、小兵之間各做一次）。地面與飛行單位不會互推；Boss 與固定式單位不會被推動
function separate(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.isPart || a.leapT > 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.isPart || b.leapT > 0 || (!!a.def.fly) !== (!!b.def.fly)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      // wa / wb：兩邊各自要被推開多少（體型小的被推得比較多）
      const d = Math.sqrt(d2), p = (rr - d) / d * 0.5, wa = a.def.speed > 0 && !a.def.boss ? (b.r / rr) : 0,
          wb = b.def.speed > 0 && !b.def.boss ? (a.r / rr) : 0;
      a.x -= dx * p * wa * 2;
      a.z -= dz * p * wa * 2;
      b.x += dx * p * wb * 2;
      b.z += dz * p * wb * 2;
    }
  }
}
// 玩家和地面敵人不能重疊：小型敵人會被玩家擠開；大型敵人與 Boss 則是把玩家擠開
function pushFromPlayer(list) {
  const P = G.player;
  for (const e of list) {
    if (!e.alive || e.def.fly || e.isPart || e.leapT > 0 || Math.abs(e.y - P.y) > 6) continue;
    const dx = e.x - P.x, dz = e.z - P.z, rr = e.r + P.r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), p = (rr - d) / d;
    if (e.def.speed > 0 && e.r < 3.3) {
      e.x += dx * p;
      e.z += dz * p;
    } else {
      P.x -= dx * p;
      P.z -= dz * p;
    }
  }
}

// ------------------------------------------------------------
//  道具
// ------------------------------------------------------------
// 道具模型共用的形狀與材質（第一次用到時才建立）
const PICK = { geo: null, crate: null, ring: null, mats: {} };
// 依權重隨機挑一種道具
function randomPickup() {
  return weighted(Object.keys(PICKUPS).map(k => ({ k, w: PICKUPS[k].w }))).k;
}
// 在 (x, z) 放一個道具。supply = true 是空投補給（底下多一個箱子、有光柱、存在時間較長）
function spawnPickup(x, z, type, supply) {
  if (!PICK.geo) {
    PICK.geo = new THREE.OctahedronGeometry(1.1, 0);
    PICK.crate = new THREE.BoxGeometry(2.4, 1.8, 2.4);
    PICK.ring = new THREE.TorusGeometry(1.9, 0.09, 6, 28);
    PICK.ring.rotateX(PI / 2);
  }
  const def = PICKUPS[type];
  const mat = PICK.mats[type] ||
      (PICK.mats[type] = new THREE.MeshBasicMaterial({ color: C(def.color).clone().multiplyScalar(2.2),
      toneMapped: false }));
  const mesh = new THREE.Group(), core = new THREE.Mesh(PICK.geo, mat), ring = new THREE.Mesh(PICK.ring, mat);
  mesh.add(core, ring);
  if (supply) {
    const c = new THREE.Mesh(PICK.crate, MAT.prop);
    c.position.y = -1.3;
    c.castShadow = true;
    mesh.add(c);
    core.position.y = 1.2;
    ring.position.y = 1.2;
    ring.scale.setScalar(1.3);
  }
  mesh.position.set(x, 2.2, z);
  mesh.userData = { core, ring };
  G.scene.add(mesh);
  // t = 還會存在幾秒（一般 32 秒、補給 90 秒）
  G.pickups.push({ x, z, type, mesh, t: supply ? 90 : 32, supply: !!supply, beamT: 0 });
}

// 玩家撿到道具時的效果
function applyPickup(type) {
  const P = G.player, d = PICKUPS[type];
  let msg = d.msg;
  switch (type) {
    case 'hp':
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.2);
      break;
    case 'cp':
      P.cp = Math.min(100, P.cp + 35);
      break;
    case 'dmg':
      P.buff.dmg = d.dur;
      break;
    case 'haste':
      P.buff.haste = d.dur;
      break;
    case 'weapon': {
        const w = pick(TEMP_WEAPONS);
        P.temp = { def: w, t: w.dur, max: w.dur };
        msg = w.icon + ' ' + w.name + '（' + w.dur + ' 秒，彈藥無限）';
        break;
      }
    case 'shield':
      P.shield = Math.min(1500, Math.max(0, P.shield) + 900);
      P.shieldMax = Math.max(900, P.shield);
      P.shieldT = 30;
      FX.sphere(P.x, P.y + P.h * 0.5, P.z, 0xffc840, 1, P.h, 0.4);
      break;
    case 'cool':
      for (const s of P.skills) s.cd = 0;
      P.sec.cd = 0;
      P.cannonCd = 0;
      break;
    case 'squad':
      deployMinion(0, true);
      deployMinion(1, true);
      break;
    case 'nuke': {
        const R = 95;
        FX.sphere(P.x, P.y + 4, P.z, 0xfff0c0, 4, R, 0.9, 2.5);
        FX.ring(P.x, 0.5, P.z, 0xff6030, 4, R, 0.9, 3);
        FX.light(P.x, P.y + 8, P.z, 0xffd090, 8, 200, 0.8);
        FX.shake(2);
        SND.play('bigboom');
        for (const e of G.enemies) if (e.alive && !e.isPart && Math.hypot(e.x - P.x, e.z - P.z) < R) {
          FX.explosion(e.x, Math.max(1, e.y + e.h * 0.5), e.z, 5, 0xff8040);
          damageEnt(e, e.def.boss ? 1400 : 800, 0, e.x, e.y, e.z);
        }
        for (let i = G.projs.length - 1; i >= 0; i--) if (G.projs[i].team === 1) {
          freeProj(G.projs[i]);
          G.projs.splice(i, 1);
        }
        break;
      }
  }
  UI.toast(d.icon, d.name, msg);
  SND.play('pickup');
  FX.ring(P.x, P.y + 1, P.z, d.color, 1, 8, 0.45);
}

// 每一格更新道具：旋轉浮動、快消失時閃爍、玩家靠近就撿起來
function updatePickups(dt) {
  const P = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.t -= dt;
    const u = k.mesh.userData;
    u.core.rotation.y += dt * 2.5;
    u.ring.rotation.y -= dt * 1.2;
    k.mesh.position.y = (k.supply ? 2.4 : 2.2) + Math.sin(G.time * 3 + k.x) * 0.4;
    k.mesh.visible = k.t > 6 || Math.floor(k.t * 6) % 2 === 0;
    if (k.supply) {
      k.beamT -= dt;
      if (k.beamT <= 0) {
        k.beamT = 0.5;
        FX.beam(k.x, 3, k.z, k.x, 150, k.z, PICKUPS[k.type].color, 0.5, 0.6, 1.2);
      }
    }
    // 玩家距離夠近（而且不是在很高的空中）就算撿到
    const got = P.alive && Math.hypot(k.x - P.x, k.z - P.z) < 4.5 + P.r && P.y < 10;
    if (got) applyPickup(k.type);
    if (got || k.t <= 0) {
      G.scene.remove(k.mesh);
      G.pickups.splice(i, 1);
    }
  }
}

// 空投一個補給箱到玩家周圍 55~140 公尺、走得到的地方
function dropSupply() {
  const P = G.player, nav = WORLD.nav;
  for (let i = 0; i < 30; i++) {
    const a = rand(TAU), d = rand(55, 140), x = clamp(P.x + Math.cos(a) * d, -380, 380),
        z = clamp(P.z + Math.sin(a) * d,
        -380, 380), c = navCell(x, z);
    if (nav.blocked[c] || nav.dist[c] === 65535) continue;
    spawnPickup(x, z, pick(['weapon', 'shield', 'dmg', 'squad', 'haste', 'weapon', 'nuke']), true);
    FX.beam(x, 0, z, x, 200, z, 0xffd24a, 3, 0.8, 2);
    UI.log('📦 補給空投已抵達（小地圖上的金色標記）');
    return;
  }
}

// ------------------------------------------------------------
//  爆炸桶
// ------------------------------------------------------------
// 油桶的模型（所有油桶共用同一份）
const BARREL = { geo: null, mat: null };
// 在地圖預先記下的位置放油桶（每個位置 1~2 個）；被打中 22 點傷害就會爆炸
function createBarrels() {
  if (!BARREL.geo) {
    const s = new Seg();
    s.cyl(0.9, 0.9, 2.2, 0xb02a1e, 0, 1.1, 0, 0, 0, 0, 14);
    for (const y of [0.25, 1.1, 1.95]) s.cyl(0.96, 0.96, 0.14, 0x3a1a14, 0, y, 0, 0, 0, 0, 14);
    s.box(1.0, 0.5, 0.06, 0xe0b020, 0, 1.5, 0.9);
    s.box(0.06, 0.5, 1.0, 0xe0b020, 0.9, 1.5, 0);
    s.cyl(0.2, 0.2, 0.12, 0x202020, 0.4, 2.26, 0.2, 0, 0, 0, 8);
    BARREL.geo = s.b.build();
    BARREL.mat = MAT.prop;
  }
  for (const p of WORLD.barrelSpots) {
    const n = Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b = { isBarrel: true, alive: true, x: p.x + i * 2.1, y: 0, z: p.z + i * 0.6, r: 1.0, h: 2.2,
          hp: 22, def: { fly: 0 } };
      b.mesh = new THREE.Mesh(BARREL.geo, BARREL.mat);
      b.mesh.position.set(b.x, 0, b.z);
      b.mesh.rotation.y = rand(TAU);
      b.mesh.castShadow = true;
      b.mesh.receiveShadow = true;
      G.scene.add(b.mesh);
      G.barrels.push(b);
    }
  }
}

// ------------------------------------------------------------
//  模式、波次與強化
// ------------------------------------------------------------
// 第 n 波是不是 Boss 波：Boss 連戰每一波都是；其他模式每 5 波一次，戰役的最後一波也一定是
function isBossWave(n) {
  const m = G.mode;
  return m.id === 'boss' || n % 5 === 0 || (m.total > 0 && n === m.total);
}

// 每一波只挑少數幾種敵人組隊（戰場才不會亂），而且低階型號會被高階型號取代
function composeWave(tier, budget) {
  // pool = 這個階段可以出現的敵人種類（不含 Boss；過了 until 的低階型號已被淘汰）
  const pool = Object.keys(ENEMIES).filter(k => {
    const d = ENEMIES[k];
    return !d.boss && d.w && d.min <= tier && (!d.until || tier <= d.until);
  }).map(k => ({ k, w: ENEMIES[k].w }));
  // 從 pool 裡依權重挑 2~4 種，這一波就只會出這幾種
  const types = [], maxTypes = Math.min(4, 2 + Math.floor(tier / 4));
  while (types.length < maxTypes && pool.length) {
    const c = weighted(pool);
    types.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  // 用這幾種敵人把預算花完（每種敵人有不同的花費 cost），最後把順序打亂
  const q = [];
  let guard = 0;
  while (budget > 0 && guard++ < 300) {
    const opts = types.filter(o => ENEMIES[o.k].cost <= budget);
    if (!opts.length) break;
    const ch = weighted(opts).k;
    q.push(ch);
    budget -= ENEMIES[ch].cost;
  }
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

// 開始第 n 波：設定難度倍率、組出這一波的敵人清單、必要時加入 Boss 與空投補給
function startWave(n) {
  const m = G.mode, P = G.player, bossMode = m.id === 'boss', bossWave = isBossWave(n);
  G.wave = n;
  G.waveState = 'active';
  G.waveBoss = false;
  // 難度曲線：hp = 敵人耐久倍率、dmg = 敵人傷害倍率、rate = Boss 出招頻率
  if (m.id === 'campaign') G.scale = { hp: 1 + (n - 1) * 0.05, dmg: 1 + (n - 1) * 0.018, rate: 1 };
  else if (m.id === 'endless') G.scale = { hp: 1 + (n - 1) * 0.08, dmg: 1 + (n - 1) * 0.03, rate: 1 };
  // Boss 連戰：攻擊力與出招頻率從低的地方慢慢爬升；血量從九成起跳，前幾隻才不會一下就打完
  else G.scale = { hp: 0.9 + (n - 1) * 0.12, dmg: 0.65 + (n - 1) * 0.05, rate: clamp(0.6 + (n - 1) * 0.07, 0.6, 1.25) };
  // bi = 這是第幾隻 Boss（從 0 算）；每打完十隻就進入下一輪（bossCycle + 1，Boss 變成強化型）
  const bi = bossMode ? n - 1 : Math.max(0, Math.ceil(n / 5) - 1);
  G.bossCycle = Math.floor(bi / BOSS_IDS.length);
  // 這一波的敵人預算（有上限，後期靠高階敵人取代數量）
  const budget = bossMode ? 2 + n * 1.2 : Math.min(bossWave ? 6 + n * 1.5 : 3 + n * 3.6, 44 + n * 0.4);
  const q = composeWave(bossMode ? n + 1 : n, budget);
  let bossDef = null;
  // Boss 排在清單最前面，第一個出場
  if (bossWave) {
    const id = G.bossOrder[bi % BOSS_IDS.length];
    bossDef = ENEMIES[id];
    q.unshift(id);
  }
  G.spawnQ = q;
  G.spawnT = 1.2;
  // 強化「開戰護盾」：每波開始時獲得護盾
  if (P.mod.wshield) {
    P.shield = Math.max(P.shield, 0) + P.mod.wshield;
    P.shieldMax = Math.max(500, P.shield);
    P.shieldT = Math.max(P.shieldT, 20);
  }
  // 每兩波、以及每個 Boss 波，空投一次補給
  if (n >= 2 && (n % 2 === 0 || bossWave)) dropSupply();
  const label = bossMode ? 'Boss 第 ' + n + ' 戰' : '第 ' + n + ' 波';
  UI.banner(label, bossDef ? '警告：' + (G.bossCycle > 0 ? '強化型 ' : '') + bossDef.name + ' 接近中' : '敵軍來襲');
  SND.play(bossWave ? 'alarm' : 'wave');
}

// 找一個走得到玩家的出生點；優先選玩家看不到的位置
function findSpawn(minD, maxD, big, visibleOk) {
  // 參數：minD ~ maxD = 離玩家的距離範圍、big = 大型單位（要找更寬敞的位置）、visibleOk = 可以出現在玩家看得到的地方
  const P = G.player, nav = big ? WORLD.navBig : WORLD.nav;
  for (let i = 0; i < 48; i++) {
    const a = rand(TAU), d = rand(minD, maxD), x = clamp(P.x + Math.cos(a) * d, -385, 385),
        z = clamp(P.z + Math.sin(a) * d, -385, 385);
    const c = navCell(x, z);
    if (nav.blocked[c] || nav.dist[c] === 65535) continue;
    if (Math.hypot(x - P.x, z - P.z) < minD * 0.7) continue;
    // 前 26 次嘗試只接受玩家看不到的位置；一直找不到才放寬
    if (!visibleOk && i < 26 && losClear(x, 4, z, P.x, P.y + 7, P.z)) continue;
    return { x, z };
  }
  return null;
}

// 一波結束後：隨機挑三個強化讓玩家選，20 秒沒選就自動選一個
function offerUpgrades() {
  const pool = UPGRADES.slice(), list = [];
  for (let i = 0; i < 3; i++) list.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  G.upg = list;
  G.upgT = 20;
  G.waveState = 'upgrade';
  UI.showUpgrades(list);
}
// 套用玩家選的強化（改的大多是 P.mod 裡的倍率），然後進入 5 秒的休息時間
function chooseUpgrade(i) {
  const P = G.player, u = G.upg && G.upg[i];
  if (!u) return;
  const M = P.mod;
  switch (u.id) {
    case 'dmg':
      M.dmg *= 1.15;
      break;
    case 'rate':
      M.rate *= 1.12;
      break;
    case 'hp':
      P.maxHp = Math.round(P.maxHp * 1.2);
      P.hp = P.maxHp;
      break;
    case 'speed':
      M.speed *= 1.08;
      break;
    case 'cd':
      M.cd *= 0.88;
      break;
    case 'energy':
      M.eRegen *= 1.35;
      break;
    case 'cp':
      M.cp *= 1.5;
      break;
    case 'minion':
      M.minion *= 1.3;
      for (const a of G.allies) {
        a.maxHp *= 1.3;
        a.hp = a.maxHp;
      }
      break;
    case 'wshield':
      M.wshield += 300;
      break;
    case 'leech':
      M.leech += 0.015;
      break;
    case 'sec':
      M.sec *= 0.82;
      break;
    case 'luck':
      M.luck *= 1.5;
      break;
  }
  P.ups.push(u);
  G.upg = null;
  G.waveState = 'break';
  G.waveT = 5;
  UI.hideUpgrades();
  UI.toast(u.icon, '已強化：' + u.name, u.desc);
  SND.play('upgrade');
  FX.ring(P.x, P.y + 1, P.z, 0xffd24a, 1, 10, 0.5);
  FX.sphere(P.x, P.y + P.h * 0.5, P.z, 0xffd24a, 1, P.h, 0.4);
}

// 每一格處理波次流程：選強化 → 休息倒數 → 戰鬥中（陸續生成敵人、判斷這一波是否結束）
function updateWaves(dt) {
  if (G.state !== 'playing') return;
  const P = G.player, I = G.input, m = G.mode;
  if (G.waveState === 'upgrade') {
    G.upgT -= dt;
    if (I.pressed.KeyZ) chooseUpgrade(0);
    else if (I.pressed.KeyX) chooseUpgrade(1);
    else if (I.pressed.KeyC) chooseUpgrade(2);
    else if (G.upgT <= 0) chooseUpgrade(Math.floor(Math.random() * 3));
  } else if (G.waveState === 'break') {
    G.waveT -= dt;
    if (G.waveT <= 0) startWave(G.wave + 1);
  } else if (G.waveState === 'active') {
    G.spawnT -= dt;
    // 生成下一隻敵人：場上最多同時 22 隻；Boss 會生成在比較遠的地方
    if (G.spawnQ.length && G.spawnT <= 0 && liveCount() < 22) {
      const kind = G.spawnQ[0], d = ENEMIES[kind], boss = !!d.boss, big = boss && !d.fly && (d.cr || d.r) >= 4.5;
      const p = findSpawn(boss ? 95 : 65, boss ? 150 : 135, big) || (boss ? findSpawn(60, 150, big, true) : null);
      if (p) {
        G.spawnQ.shift();
        spawnEnemy(kind, p.x, p.z);
        if (boss) {
          UI.banner(d.name, d.title + '　｜　' + d.hint);
          SND.play('alarm');
        }
      }
      G.spawnT = boss ? 1.6 : 0.45;
    }
    // Boss 連戰：Boss 一倒，剩下的護衛失去指揮直接自毀，這一波立刻結束
    if (m.id === 'boss' && G.waveBoss && !bossList().length && !G.spawnQ.some(k => ENEMIES[k].boss)) {
      let n = 0;
      for (const e of G.enemies) if (e.alive && !e.isPart) {
        G.score += Math.round((e.def.score || 0) * 0.5);
        vanish(e, true);
        n++;
      }
      G.spawnQ = [];
      if (n) UI.log('失去指揮訊號 ─ ' + n + ' 台護衛機自毀');
    }
    // 敵人全滅：加分；達到目標波數就勝利，否則回血、回指揮點數並進入選強化
    if (!G.spawnQ.length && liveCount() === 0) {
      for (const e of G.enemies) if (e.alive) vanish(e, true);
      G.score += 250 * G.wave * (m.id === 'boss' ? 3 : 1);
      if (m.total > 0 && G.wave >= m.total) {
        G.waveState = 'done';
        G.state = 'won';
        G.dieT = 3.2;
        SND.play('win');
        UI.banner('任務完成', '廢墟已肅清');
        return;
      }
      const heal = m.id === 'boss' ? 0.5 : 0.25;  // Boss 連戰每戰之間回復比較多
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * heal);
      P.cp = Math.min(100, P.cp + 30);
      UI.banner(m.id === 'boss' ? 'Boss 擊破' : '第 ' + G.wave + ' 波肅清', '裝甲修復 ' + heal * 100 + '%・選擇一項強化');
      SND.play('select');
      offerUpgrades();
    }
  }
}

// ------------------------------------------------------------
//  戰鬥開始 / 清除 / 主更新
// ------------------------------------------------------------
// 建立整場遊戲共用的物件（目前只有玩家的護盾球），啟動時呼叫一次
function initGameObjects() {
  G.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(0.25, 0.7, 1.0) }, amp: { value: 1 } },
    // 頂點著色器：把每個點的「表面朝向」vN 與「看向鏡頭的方向」vV 傳給片段著色器
    vertexShader: [
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vN = normalize(normalMatrix * normal);',
      '  vV = normalize(-mv.xyz);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    // 片段著色器：表面越是側對鏡頭（球的邊緣）就越亮，正對鏡頭的中央幾乎透明 → 看起來像一顆能量泡泡
    fragmentShader: [
      'uniform vec3 col;',
      'uniform float amp;',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main(){',
      '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);',
      '  gl_FragColor = vec4(col * (f * 0.9 + 0.025) * amp, 1.0);',
      '}',
    ].join('\n'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  G.shieldMesh.visible = false;
  G.shieldMesh.renderOrder = 7;
  G.scene.add(G.shieldMesh);
}

// 清空一場戰鬥的所有東西：移除模型、清空各種清單、重置特效（回機庫或重新開始時呼叫）
function clearBattle() {
  for (const e of G.enemies) if (e.alive) disposeRig(e.rig);
  for (const a of G.allies) if (a.alive) disposeRig(a.rig);
  if (G.player) disposeRig(G.player.rig);
  for (const p of G.projs) freeProj(p);
  for (const k of G.pickups) G.scene.remove(k.mesh);
  for (const b of G.barrels) if (b.alive) G.scene.remove(b.mesh);
  G.enemies = [];
  G.allies = [];
  G.friends = [];
  G.projs = [];
  G.pickups = [];
  G.barrels = [];
  G.timers = [];
  G.zones = [];
  G.dmgDirs = [];
  G.player = null;
  G.boss = null;
  G.aimEnt = null;
  G.upg = null;
  G.slow = 0;
  G.hunt = false;
  if (G.shieldMesh) G.shieldMesh.visible = false;
  FX.reset();
}

// 開始一場新的戰鬥。lo = 機庫選好的配置
function startBattle(lo) {
  clearBattle();
  G.loadout = lo;
  G.diff = DIFFS[lo.diff] || DIFFS[1];
  G.mode = { id: lo.mode, total: lo.opts[lo.mode] || 0 };
  // Boss 出場順序隨機，但最終兵器固定壓軸
  const order = BOSS_IDS.filter(k => k !== 'omega');
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.push('omega');
  G.bossOrder = order;
  G.bossCycle = 0;
  G.scale = { hp: 1, dmg: 1, rate: 1 };
  // 每一場都用新的亂數種子生成不同的地圖，然後放油桶、建立玩家
  genWorld(G.scene, (Math.random() * 1e9) | 0);
  createBarrels();
  const P = G.player = createPlayer(lo);
  P.x = 0;
  P.z = 0;
  collideXZ(P, 1.8);
  // 重置所有計數；4.5 秒後開始第一波
  G.camY = 0;
  G.camDist = 15;
  G.time = 0;
  G.score = 0;
  G.kills = 0;
  G.deployed = 0;
  G.hurt = 0;
  G.hitMark = 0;
  G.wave = 0;
  G.waveState = 'break';
  G.waveT = 4.5;
  G.spawnQ = [];
  G.flowT = 0;
  G.waveBoss = false;
  // 先算好一次尋路流場，第一波敵人一出現就知道怎麼走
  updateFlow(P.x, P.z);
  updateFlow(P.x, P.z, WORLD.navBig);
  G.input.mx = G.input.my = 0;
  G.input.lmb = G.input.rmb = false;
  G.input.pressed = {};
  G.state = 'playing';
  const m = byId(MODES, G.mode.id);
  UI.banner(m.name,
      G.mode.id === 'campaign' ? '擊退 ' +
          G.mode.total + ' 波敵軍' : G.mode.id === 'endless' ? '撐得越久越好' : G.mode.total ? '連續擊破 ' +
          G.mode.total + ' 隻 Boss' : '挑戰無盡的 Boss 連戰');
}

// 遊戲主更新：每一格由 main.js 的 frame() 呼叫一次，依序更新所有系統
function updateGame(dt) {
  G.time += dt;
  const P = G.player, I = G.input, playing = G.state === 'playing';
  // 1. 玩家移動（陣亡或勝利演出期間不能操作）
  if (playing) {
    updatePlayer(dt);
    pushFromPlayer(G.enemies);
  }
  updateCamera(dt);
  // 2. 重新整理「敵人可以攻擊的對象」= 活著的玩家 + 活著的小兵
  G.friends = P.alive ? [P] : [];
  for (const a of G.allies) if (a.alive) G.friends.push(a);
  // 3. 玩家的武器、技能（Q E F）與小兵（1 2）
  if (playing && P.alive) {
    P.rig.root.updateMatrixWorld(true);
    updateWeapons(dt);
    if (I.pressed.KeyQ) castSkill(0);
    if (I.pressed.KeyE) castSkill(1);
    if (I.pressed.KeyF) castSkill(2);
    if (I.pressed.Digit1) deployMinion(0);
    if (I.pressed.Digit2) deployMinion(1);
  }
  // 4. 波次流程；之後清掉「剛按下」的按鍵紀錄（每個按鍵只觸發一次）
  updateWaves(dt);
  I.pressed = {};

  // 5. 每 0.4 秒依玩家的新位置重算尋路流場
  G.flowT -= dt;
  if (G.flowT <= 0) {
    G.flowT = 0.4;
    updateFlow(P.x, P.z);
    updateFlow(P.x, P.z, WORLD.navBig);
  }
  // 殘敵追擊：剩沒幾隻時，敵人會放棄站位、主動衝過來找你
  const live = liveCount();
  G.hunt = G.waveState === 'active' && !G.spawnQ.length && live > 0 && live <= 4 && !bossList().length;
  // 6. 敵人、小兵、互相推擠、子彈、範圍效果
  for (let i = 0; i < G.enemies.length; i++) if (G.enemies[i].alive) updateEnemy(G.enemies[i], dt);
  for (let i = 0; i < G.allies.length; i++) if (G.allies[i].alive) updateAlly(G.allies[i], dt);
  separate(G.enemies);
  separate(G.allies);
  updateProjs(dt);
  updateZones(dt);
  // 7. 延遲動作：時間到的就執行（例如連發飛彈、延遲爆炸）
  for (let i = G.timers.length - 1; i >= 0; i--) {
    const t = G.timers[i];
    t.t -= dt;
    if (t.t <= 0) {
      G.timers.splice(i, 1);
      t.fn();
    }
  }
  updatePickups(dt);

  // 8. 玩家附近的火堆持續冒火（太遠的不處理）
  G.fireT -= dt;
  if (G.fireT <= 0) {
    G.fireT = 0.05;
    for (const f of WORLD.fires) if (Math.abs(f.x - P.x) < 170 && Math.abs(f.z - P.z) < 170) FX.fireColumn(f.x,
        f.y, f.z, f.s);
  }

  // 9. 把已經死亡的單位從清單裡移除
  if (G.enemies.some(e => !e.alive)) G.enemies = G.enemies.filter(e => e.alive);
  if (G.allies.some(e => !e.alive)) G.allies = G.allies.filter(e => e.alive);
  if (G.barrels.some(e => !e.alive)) G.barrels = G.barrels.filter(e => e.alive);
  G.boss = bossList()[0] || null;
  for (let i = G.dmgDirs.length - 1; i >= 0; i--) {
    G.dmgDirs[i].t -= dt * 1.2;
    if (G.dmgDirs[i].t <= 0) G.dmgDirs.splice(i, 1);
  }

  // 10. 介面用的倒數，以及把玩家位置告訴音效系統
  G.hitMark = Math.max(0, G.hitMark - dt);
  G.hurt = Math.max(0, G.hurt - dt * 1.4);
  SND.listener.x = P.x;
  SND.listener.z = P.z;

  // 11. 陣亡或勝利的演出結束後顯示結算畫面
  if (G.state === 'dying' || G.state === 'won') {
    G.dieT -= dt;
    if (G.dieT <= 0) UI.showResult(G.state === 'won');
  }
}
