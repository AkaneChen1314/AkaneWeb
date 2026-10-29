import assert from 'node:assert/strict';
import { createHarness, THREE } from './test-harness.mjs';
import { orientCollider, roundCollider, bodyOverlapsCollider, sweepSphereCollider } from '../spatial-collision.js';
import { createGrenadeMotion, advanceGrenadeMotion, predictGrenadePath } from '../grenade-trajectory.js';

const cases=[];const test=(name,run)=>cases.push({name,run});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function movement(){const h=createHarness();h.run("scene.add(camera);createWeapon();gameState='playing';yaw.position.set(0,1.68,2.2);keys.KeyW=true;");return h;}

test('rotated walls do not fill the empty corners of their bounding rectangle',()=>{
  const h=createHarness();h.run('addBox(0,1,0,8,2,.3,0x888888,{rotation:Math.PI/4});');
  assert.equal(h.run('collisionBoxes[0].containsPoint(new THREE.Vector3(2.5,1,2.5))'),true);
  assert.equal(h.run('isPositionBlocked(2.5,2.5)'),false);
  assert.equal(h.run('isBotBlocked(2.5,2.5)'),false);
  assert.equal(h.run('findWeaponClearance(new THREE.Vector3(2.5,1,2.5),new THREE.Vector3(0,0,-1),collisionBoxes,.5)'),.5);
  assert.equal(h.run('isPositionBlocked(1,-1)'),true);
});

test('swept grenades collide with a rotated wall using its real outward normal',()=>{
  const box=orientCollider(new THREE.Box3(new THREE.Vector3(-3,0,-3),new THREE.Vector3(3,3,3)),0,1.5,0,8,3,.2,Math.PI/4);
  const hit=sweepSphereCollider({x:0,y:1,z:2},{x:0,y:0,z:-4},box,.12);
  assert.ok(hit&&hit.time>0&&hit.time<1);close(hit.normal.x,Math.SQRT1_2);close(hit.normal.z,Math.SQRT1_2);
  assert.equal(sweepSphereCollider({x:2.5,y:1,z:2.5},{x:0,y:0,z:-.5},box,.12),null);
});

test('round silos leave their empty bounding-box corners traversable',()=>{
  const box=roundCollider(new THREE.Box3(new THREE.Vector3(-2,0,-2),new THREE.Vector3(2,5,2)),0,0,2);
  assert.equal(bodyOverlapsCollider(box,1.9,1.9,.48,0,1.74),false);
  assert.equal(bodyOverlapsCollider(box,1.7,0,.48,0,1.74),true);
  assert.equal(sweepSphereCollider({x:1.9,y:2,z:1.9},{x:.1,y:0,z:0},box,.12),null);
  assert.ok(sweepSphereCollider({x:3,y:2,z:0},{x:-2,y:0,z:0},box,.12));
});

test('all three operators jump across 1.4 m cover instead of hitting an invisible wall',()=>{
  for(let operator=0;operator<3;operator++){
    const h=movement();h.run(`selectedOperator=${operator};addBox(0,.7,0,8,1.4,.6,0x888888);jump();`);
    for(let frame=0;frame<130;frame++)h.run(`updatePlayer(1/60,${1000+frame*1000/60});`);
    assert.ok(h.run('yaw.position.z')<-1.5,`operator ${operator} must cross the cover`);
    assert.ok(h.run('yaw.position.y')>=1.68);
  }
});

test('jumping and boosted sprinting cannot pass through a full-height wall',()=>{
  const h=movement();h.run('selectedOperator=1;keys.ShiftLeft=true;speedBoostUntil=10000;addBox(0,2,0,8,4,.08,0x888888);jump();');
  for(let frame=0;frame<100;frame++)h.run(`updatePlayer(1/60,${1000+frame*16});`);
  assert.ok(h.run('yaw.position.z')>=.52-.001);
});

test('small pallet steps can be walked onto and do not become floor-level air walls',()=>{
  const h=movement();h.run('addBox(0,.1,0,4,.2,2,0x777777);');
  for(let frame=0;frame<100;frame++)h.run(`updatePlayer(1/60,${1000+frame*16});`);
  assert.ok(h.run('yaw.position.z')<-2);
  close(h.run('yaw.position.y'),1.68);
});

test('a jump pressed just before landing triggers once on the next grounded frame',()=>{
  const h=movement();h.run('keys.KeyW=false;grounded=false;yaw.position.y=1.7;verticalVelocity=-1;jump();');
  for(let frame=0;frame<5;frame++)h.run(`updatePlayer(1/60,${1000+frame*16});`);
  assert.ok(h.run('verticalVelocity')>0);assert.ok(h.run('yaw.position.y')>1.85);
  assert.equal(h.run('jumpBuffer'),0);
});

test('walking off a small edge permits one grace jump without enabling a second air jump',()=>{
  const h=movement();h.run('keys.KeyW=false;updatePlayer(1/60,1000);grounded=false;yaw.position.y=2;jump();');
  const velocity=h.run('verticalVelocity');assert.ok(velocity>0);
  h.run('updatePlayer(1/60,1016);jump();');assert.ok(h.run('verticalVelocity')<velocity);
});

test('refinery cross rails are solid and low pipes use their visible height',()=>{
  const h=createHarness();h.run('createOuterDistricts();');
  assert.equal(h.run('isPositionBlocked(55,31)'),true,'visible cross rail must block a standing body');
  assert.equal(h.run('isPositionBlocked(50.5,0)'),true,'visible pipe must block a standing body');
  assert.equal(h.run('(()=>{const pipe=collisionBoxes.find(box=>box.shape?.x===50.5&&box.shape?.hz===24.5);return !!sweepSphereCollider({x:49,y:.25,z:0},{x:3,y:0,z:0},pipe,.12);})()'),false,'grenade can pass through the visible gap under the pipe');
  assert.equal(h.run('(()=>{const pipe=collisionBoxes.find(box=>box.shape?.x===50.5&&box.shape?.hz===24.5);return !!sweepSphereCollider({x:49,y:.72,z:0},{x:3,y:0,z:0},pipe,.12);})()'),true);
});

test('all operators can jump the real refinery rail without walking through it',()=>{
  for(let operator=0;operator<3;operator++){
    const h=movement();h.run(`selectedOperator=${operator};createOuterDistricts();yaw.position.set(55,1.68,33);jump();`);
    for(let frame=0;frame<85;frame++)h.run(`updatePlayer(1/60,${1000+frame*16});`);
    assert.ok(h.run('yaw.position.z')<29.5,`operator ${operator} must clear the rail`);
  }
});

test('GATE A barrier is solid at its visible height and low enough to jump',()=>{
  const h=movement();h.run('createHarborDetails();yaw.position.set(0,1.68,41);');
  assert.equal(h.run('isPositionBlocked(0,39)'),true);
  h.run('selectedOperator=2;jump();');
  for(let frame=0;frame<90;frame++)h.run(`updatePlayer(1/60,${1000+frame*16});`);
  assert.ok(h.run('yaw.position.z')<38);
});

test('overhead beams do not obstruct walking but do intercept airborne grenades',()=>{
  const h=createHarness();h.run('createOuterDistricts();yaw.position.set(51.5,1.68,20);');
  assert.equal(h.run('isPositionBlocked(51.5,20)'),false);
  assert.equal(h.run('collisionBoxes.some(box=>!!sweepSphereCollider({x:49.5,y:4,z:20},{x:0,y:2,z:0},box,.12))'),true);
});

test('a grenade starting within thin scenery is recovered without tunneling or endless bounces',()=>{
  const box={min:{x:-1,y:0,z:-.1},max:{x:1,y:3,z:.1}};
  const state=createGrenadeMotion({x:0,y:1.5,z:.02},{x:0,y:0,z:-1},[box]);
  assert.ok(Math.abs(state.position.z)>.219);
  advanceGrenadeMotion(state,.3,[box]);
  assert.ok(state.position.z>.219,'throw rebounds on the original side');assert.ok(state.bounces<5);
});

test('prediction and live throws agree across frame rates around rotated and round cover',()=>{
  const h=createHarness();h.run('addBox(0,1,-4,5,2,.2,0x777777,{rotation:.35});');
  const boxes=Array.from(h.run('collisionBoxes'));
  boxes.push(roundCollider(new THREE.Box3(new THREE.Vector3(2,0,-8),new THREE.Vector3(4,4,-6)),3,-7,1));
  for(const direction of [{x:0,y:0,z:-1},{x:.25,y:.15,z:-Math.sqrt(1-.25**2-.15**2)}]){
    const origin={x:0,y:1.68,z:0},prediction=predictGrenadePath(origin,direction,boxes);
    for(const dt of [1/144,1/60,1/20,.1]){const actual=createGrenadeMotion(origin,direction,boxes);for(let frame=0;frame<400&&actual.life>0;frame++)advanceGrenadeMotion(actual,dt,boxes);for(const axis of ['x','y','z'])close(actual.position[axis],prediction.end[axis]);}
  }
});

test('grenade preview uses one line, compact markers and a shake-free launch point',()=>{
  const h=createHarness();h.run(`
    pitch=new THREE.Group();scene.add(yaw);yaw.add(pitch);pitch.add(camera);camera.position.set(0,0,0);yaw.position.set(0,1.68,0);
    createGrenadePreview();gameState='playing';grenadeAiming=true;updateGrenadePreview(1000,true);
    const stablePrediction=grenadePreview.prediction;camera.position.set(.18,-.13,0);camera.rotation.z=.05;updateGrenadePreview(1100);
  `);
  assert.equal(h.run('grenadePreview.prediction===stablePrediction'),true);
  assert.equal(h.run('grenadePreview.group.children.filter(child=>child.isLine).length'),1);
  assert.equal(h.run('grenadePreview.group.children.some(child=>child.isInstancedMesh)'),false);
  assert.equal(h.run('grenadePreview.blastMarker.children.some(child=>child.geometry?.parameters?.outerRadius>1)'),false);
  h.run('throwGrenade();');
  assert.equal(h.run('grenadePreview.line.geometry.drawRange.count'),0);
  assert.equal(h.run('grenadePreview.group.visible'),false);
  for(const axis of ['x','y','z'])close(h.run(`grenades[0].motion.position.${axis}`),h.run(`stablePrediction.points[0].${axis}`));
});

test('every zone sign has independently readable outward-facing front and back prints',()=>{
  const h=createHarness();h.run("const sign=placeZoneSign('GATE—A','SECURITY CHECKPOINT',0,3,0,Math.PI/4);scene.updateMatrixWorld(true);");
  const sign=h.run('sign'),front=sign.children[0],back=sign.children[1];
  assert.equal(front.material.side,THREE.FrontSide);assert.equal(back.material.side,THREE.FrontSide);
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(sign.quaternion);
  for(const side of [1,-1]){
    const origin=sign.position.clone().addScaledVector(normal,side*4);
    const ray=new THREE.Raycaster(origin,normal.clone().multiplyScalar(-side));
    const hits=ray.intersectObjects([front,back]);assert.equal(new Set(hits.map(hit=>hit.object)).size,1);assert.equal(hits[0].object,side===1?front:back);
    const printedRight=new THREE.Vector3(1,0,0).transformDirection(hits[0].object.matrixWorld);
    const viewerRight=new THREE.Vector3(0,1,0).cross(normal.clone().multiplyScalar(side)).normalize();
    assert.ok(printedRight.dot(viewerRight)>.999,'texture U increases to the viewer’s right on either side');
  }
});

let passed=0;for(const item of cases){try{item.run();passed++;console.log(`PASS ${item.name}`);}catch(error){console.error(`FAIL ${item.name}`);throw error;}}
console.log(`\n${passed}/${cases.length} map physics checks passed.`);
