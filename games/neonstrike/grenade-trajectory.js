/*
 * 檔案導讀：手榴彈共用運動計算：預覽路徑與實際投擲共用規則，保持兩者一致。
 */
// 手榴彈的固定步長物理；預覽與真正的手榴彈用同一套計算。
import { sweepSphereCollider, sphereSupportedBy } from "./spatial-collision.js";
export const GRENADE_FUSE = 1.75;
export const GRENADE_BLAST_RADIUS = 7.5;
const STEP = 1 / 120;
const RADIUS = 0.12;
const FLOOR = 0.13;
const REST_SPEED = 0.55;

// 這一步最先碰到的東西。
function firstCollision(position, delta, boxes) {
  let hit = null;
  if (delta.y < 0 && position.y + delta.y < FLOOR) {
    hit = {
      time: Math.max(0, (FLOOR - position.y) / delta.y),
      normal: { x: 0, y: 1, z: 0 },
    };
  }
  for (const box of boxes) {
    const candidate = sweepSphereCollider(position, delta, box, RADIUS);
    if (candidate && (!hit || candidate.time < hit.time)) hit = candidate;
  }
  return hit;
}

// 建立手榴彈的初始狀態：起點、速度與引信。
export function createGrenadeMotion(origin, direction, boxes = []) {
  // 起點稍微卡進場景時安全地移出來，不會穿到另一面，也不會在原地一直彈。
  origin = { ...origin };
  for (let pass = 0; pass < 6; pass++) {
    let corrected = false;
    for (const box of boxes) {
      const hit = sweepSphereCollider(
        origin,
        { x: 0, y: 0, z: 0 },
        box,
        RADIUS,
      );
      if (hit?.penetration) {
        for (const axis of ["x", "y", "z"])
          origin[axis] += hit.normal[axis] * hit.penetration;
        corrected = true;
      }
    }
    if (!corrected) break;
  }
  const horizontal = Math.hypot(direction.x, direction.z),
    rightX = horizontal > 1e-6 ? -direction.z / horizontal : 1,
    rightZ = horizontal > 1e-6 ? direction.x / horizontal : 0;
  // 從右手丟出，不是正中央：從正中央丟的拋物線在畫面上會疊成一條線。整段手的位
  // 移都要檢查，不會從近的掩體後面冒出來。
  const offset = {
    x: direction.x * 0.6 + rightX * 0.24,
    y: direction.y * 0.6 - 0.18,
    z: direction.z * 0.6 + rightZ * 0.24,
  };
  const obstacle = firstCollision(origin, offset, boxes);
  const scale = obstacle ? Math.max(0, obstacle.time - 0.01) : 1;
  return {
    position: {
      x: origin.x + offset.x * scale,
      y: Math.max(FLOOR, origin.y + offset.y * scale),
      z: origin.z + offset.z * scale,
    },
    velocity: {
      x: direction.x * 13,
      y: direction.y * 13 + 3.4,
      z: direction.z * 13,
    },
    life: GRENADE_FUSE,
    bounces: 0,
    accumulator: 0,
    grounded: false,
    supportHeight: FLOOR,
    supportBox: null,
    firstImpact: null,
    firstImpactNormal: null,
    firstImpactTime: null,
  };
}

// 推進物理：重力、反彈、摩擦與停住。
export function advanceGrenadeMotion(state, dt, boxes = []) {
  state.accumulator += Number.isFinite(dt) ? Math.max(0, dt) : 0;
  while (state.accumulator + 1e-9 >= STEP && state.life > 1e-9) {
    const step = Math.min(STEP, state.life);
    state.accumulator = Math.max(0, state.accumulator - STEP);
    if (state.grounded && state.supportBox) {
      const box = state.supportBox;
      if (
        !boxes.includes(box) ||
        !sphereSupportedBy(box, state.position, RADIUS)
      ) {
        state.grounded = false;
        state.supportBox = null;
      }
    }
    // 已經停在地面。
    if (state.grounded) {
      state.position.y = state.supportHeight;
      state.velocity.y = 0;
      const friction = Math.exp(-4 * step);
      state.velocity.x *= friction;
      state.velocity.z *= friction;
      if (Math.hypot(state.velocity.x, state.velocity.z) < 0.025) {
        state.velocity.x = 0;
        state.velocity.z = 0;
      }
    } else state.velocity.y -= 12 * step;
    let remaining = step;
    // 同一步最多處理六次碰撞。
    for (let collision = 0; collision < 6 && remaining > 1e-6; collision++) {
      const delta = {
        x: state.velocity.x * remaining,
        y: state.velocity.y * remaining,
        z: state.velocity.z * remaining,
      };
      const hit = firstCollision(state.position, delta, boxes);
      const normalVelocity = hit
        ? state.velocity.x * hit.normal.x +
          state.velocity.y * hit.normal.y +
          state.velocity.z * hit.normal.z
        : 0;
      if (hit && normalVelocity < -0.001 && !state.firstImpact) {
        state.firstImpact = {
          x: state.position.x + delta.x * hit.time,
          y: state.position.y + delta.y * hit.time,
          z: state.position.z + delta.z * hit.time,
        };
        state.firstImpactNormal = { ...hit.normal };
        state.firstImpactTime =
          GRENADE_FUSE - state.life + step - remaining + remaining * hit.time;
      }
      const fraction = hit ? Math.max(0, hit.time - 0.0001) : 1;
      for (const axis of ["x", "y", "z"])
        state.position[axis] += delta[axis] * fraction;
      if (!hit) break;
      if (hit.penetration)
        for (const axis of ["x", "y", "z"])
          state.position[axis] += hit.normal[axis] * hit.penetration;
      if (normalVelocity >= 0) {
        remaining *= 1 - hit.time;
        continue;
      }
      state.bounces++;
      const restitution = hit.normal.y > 0 ? 0.42 : 0.48;
      for (const axis of ["x", "y", "z"])
        state.velocity[axis] -=
          (1 + restitution) * normalVelocity * hit.normal[axis];
      if (hit.normal.y > 0) {
        state.velocity.x *= 0.72;
        state.velocity.z *= 0.72;
      }
      for (const axis of ["x", "y", "z"])
        state.position[axis] += hit.normal[axis] * 0.0002;
      if (hit.normal.y > 0 && state.velocity.y < REST_SPEED) {
        state.grounded = true;
        state.supportBox = hit.box || null;
        state.supportHeight = hit.box ? hit.box.max.y + RADIUS + 0.0002 : FLOOR;
        state.position.y = state.supportHeight;
        state.velocity.y = 0;
      }
      remaining *= 1 - hit.time;
    }
    state.position.y = Math.max(FLOOR, state.position.y);
    state.life = Math.max(0, state.life - step);
    if (state.life < 1e-9) state.life = 0;
  }
  return state;
}

// 預測整條路徑，給預覽用。
export function predictGrenadePath(origin, direction, boxes = []) {
  // 引信燒完前，水平最多飛 24 公尺。先排除遠處的東西，不必把整個港區檢查 210 次。
  boxes = boxes.filter(
    (box) =>
      box.min.x <= origin.x + 24 &&
      box.max.x >= origin.x - 24 &&
      box.min.z <= origin.z + 24 &&
      box.max.z >= origin.z - 24,
  );
  const state = createGrenadeMotion(origin, direction, boxes);
  const points = [{ ...state.position }];
  const previewPoints = [{ ...state.position }];
  let primaryComplete = false;
  for (let sample = 0; state.life > 1e-9 && sample < 60; sample++) {
    advanceGrenadeMotion(state, 1 / 30, boxes);
    points.push({ ...state.position });
    if (!primaryComplete) {
      previewPoints.push({ ...(state.firstImpact || state.position) });
      primaryComplete = !!state.firstImpact;
    }
  }
  return {
    points,
    previewPoints,
    firstImpact: state.firstImpact,
    firstImpactNormal: state.firstImpactNormal,
    firstImpactTime: state.firstImpactTime,
    end: { ...state.position },
    grounded: state.grounded,
    bounces: state.bounces,
  };
}
