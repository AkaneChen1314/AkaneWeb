// Shared fixed-step grenade physics. Preview and live grenades use the same integrator.
import { sweepSphereCollider, sphereSupportedBy } from './spatial-collision.js';
export const GRENADE_FUSE = 1.75;
export const GRENADE_BLAST_RADIUS = 7.5;
const STEP = 1 / 120;
const RADIUS = .12;
const FLOOR = .13;
const REST_SPEED = .55;

function firstCollision(position, delta, boxes) {
  let hit = null;
  if (delta.y < 0 && position.y + delta.y < FLOOR) {
    hit = { time: Math.max(0, (FLOOR - position.y) / delta.y), normal: { x: 0, y: 1, z: 0 } };
  }
  for (const box of boxes) {
    const candidate = sweepSphereCollider(position, delta, box, RADIUS);
    if (candidate && (!hit || candidate.time < hit.time)) hit = candidate;
  }
  return hit;
}

export function createGrenadeMotion(origin, direction, boxes = []) {
  // Recover safely from a spawn point slightly inside scenery instead of letting
  // a grenade escape through the far face (or bounce forever at time zero).
  origin={...origin};
  for(let pass=0;pass<6;pass++){
    let corrected=false;
    for(const box of boxes){const hit=sweepSphereCollider(origin,{x:0,y:0,z:0},box,RADIUS);if(hit?.penetration){for(const axis of ['x','y','z'])origin[axis]+=hit.normal[axis]*hit.penetration;corrected=true;}}
    if(!corrected)break;
  }
  const horizontal=Math.hypot(direction.x,direction.z),rightX=horizontal>1e-6?-direction.z/horizontal:1,rightZ=horizontal>1e-6?direction.x/horizontal:0;
  // Release from the right hand, not exactly along the optical center: a
  // center-origin arc projects onto itself and looks like overlapping lines.
  // Sweep the complete hand offset so it can never spawn through close cover.
  const offset = { x: direction.x * .6+rightX*.24, y: direction.y * .6-.18, z: direction.z * .6+rightZ*.24 };
  const obstacle = firstCollision(origin, offset, boxes);
  const scale = obstacle ? Math.max(0, obstacle.time - .01) : 1;
  return {
    position: { x: origin.x + offset.x * scale, y: Math.max(FLOOR, origin.y + offset.y * scale), z: origin.z + offset.z * scale },
    velocity: { x: direction.x * 13, y: direction.y * 13 + 3.4, z: direction.z * 13 },
    life: GRENADE_FUSE, bounces: 0, accumulator: 0, grounded: false,
    supportHeight: FLOOR, supportBox: null,
    firstImpact: null, firstImpactNormal: null, firstImpactTime: null,
  };
}

export function advanceGrenadeMotion(state, dt, boxes = []) {
  state.accumulator += Number.isFinite(dt)?Math.max(0, dt):0;
  while (state.accumulator + 1e-9 >= STEP && state.life > 1e-9) {
    const step = Math.min(STEP, state.life);
    state.accumulator = Math.max(0, state.accumulator - STEP);
    if (state.grounded && state.supportBox) {
      const box = state.supportBox;
      if (!boxes.includes(box) || !sphereSupportedBy(box,state.position,RADIUS)) {
        state.grounded = false; state.supportBox = null;
      }
    }
    if (state.grounded) {
      state.position.y = state.supportHeight;
      state.velocity.y = 0;
      const friction = Math.exp(-4 * step);
      state.velocity.x *= friction; state.velocity.z *= friction;
      if (Math.hypot(state.velocity.x, state.velocity.z) < .025) { state.velocity.x = 0; state.velocity.z = 0; }
    } else state.velocity.y -= 12 * step;
    let remaining = step;
    for (let collision = 0; collision < 6 && remaining > 1e-6; collision++) {
      const delta = { x: state.velocity.x * remaining, y: state.velocity.y * remaining, z: state.velocity.z * remaining };
      const hit = firstCollision(state.position, delta, boxes);
      const normalVelocity=hit?state.velocity.x*hit.normal.x+state.velocity.y*hit.normal.y+state.velocity.z*hit.normal.z:0;
      if (hit && normalVelocity<-.001 && !state.firstImpact) {
        state.firstImpact = { x: state.position.x + delta.x * hit.time, y: state.position.y + delta.y * hit.time, z: state.position.z + delta.z * hit.time };
        state.firstImpactNormal = { ...hit.normal };
        state.firstImpactTime = GRENADE_FUSE - state.life + step - remaining + remaining * hit.time;
      }
      const fraction = hit ? Math.max(0, hit.time - .0001) : 1;
      for (const axis of ['x', 'y', 'z']) state.position[axis] += delta[axis] * fraction;
      if (!hit) break;
      if(hit.penetration)for(const axis of ['x','y','z'])state.position[axis]+=hit.normal[axis]*hit.penetration;
      if(normalVelocity>=0){remaining*=1-hit.time;continue;}
      state.bounces++;
      const restitution = hit.normal.y > 0 ? .42 : .48;
      for (const axis of ['x', 'y', 'z']) state.velocity[axis] -= (1 + restitution) * normalVelocity * hit.normal[axis];
      if (hit.normal.y > 0) { state.velocity.x *= .72; state.velocity.z *= .72; }
      for (const axis of ['x', 'y', 'z']) state.position[axis] += hit.normal[axis] * .0002;
      if (hit.normal.y > 0 && state.velocity.y < REST_SPEED) {
        state.grounded = true; state.supportBox = hit.box || null;
        state.supportHeight = hit.box ? hit.box.max.y + RADIUS + .0002 : FLOOR;
        state.position.y = state.supportHeight; state.velocity.y = 0;
      }
      remaining *= 1 - hit.time;
    }
    state.position.y = Math.max(FLOOR, state.position.y);
    state.life = Math.max(0, state.life - step);
    if(state.life<1e-9)state.life=0;
  }
  return state;
}

export function predictGrenadePath(origin, direction, boxes = []) {
  // No throw can travel horizontally beyond 24 m before its fuse expires. Cull
  // distant map structures once, rather than testing the entire harbor 210 times.
  boxes=boxes.filter(box=>box.min.x<=origin.x+24&&box.max.x>=origin.x-24&&box.min.z<=origin.z+24&&box.max.z>=origin.z-24);
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
  return { points, previewPoints, firstImpact: state.firstImpact, firstImpactNormal: state.firstImpactNormal,
    firstImpactTime: state.firstImpactTime, end: { ...state.position }, grounded: state.grounded, bounces: state.bounces };
}
