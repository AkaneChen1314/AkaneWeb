import assert from 'node:assert/strict';
import { createHarness } from './test-harness.mjs';

function weaponHarness(){
  const h=createHarness();
  h.run(`
    scene.add(camera);camera.position.set(0,1.68,0);camera.lookAt(0,1.68,-10);
    pitch=new THREE.Group();gameState='playing';createWeapon();Math.random=()=>.5;
    const shotPaths=[],shotImpacts=[];let shotSoundCount=0;
    createTracer=(start,end)=>shotPaths.push({start:start.clone(),end:end.clone()});
    createImpact=point=>{if(point)shotImpacts.push(point.clone());};
    playGunshot=()=>{shotSoundCount++;};
  `);
  return h;
}

const checks=[];
function test(name,execute){checks.push({name,execute});}

test('near frontal cover never disables continuous fire and each bullet strikes the wall',()=>{
  const h=weaponHarness();
  h.run(`
    addBox(0,2,-1.05,4,4,.1,0x666666);aiming=true;
    for(let i=0;i<40;i++)updateWeaponPose(1/60,i*16);
    scene.updateMatrixWorld(true);mouseDown=true;
    for(let i=0;i<10;i++)shoot(1000+i*100);
  `);
  assert.equal(h.run('ammo'),20);
  assert.equal(h.run('shots'),10);
  assert.equal(h.run('shotSoundCount'),10);
  assert.equal(h.run('shotImpacts.length'),10);
  assert.ok(h.run('shotPaths.every(path=>path.end.z>=-1.001&&path.end.z<=-.999)'), 'solid wall receives the bullets');
  assert.ok(h.run('wallPoseAmount')>.1, 'near cover still uses a retracted weapon pose');
});

test('a wall burst empties the magazine, reloads automatically and resumes a held trigger',()=>{
  const h=weaponHarness();
  h.run(`
    addBox(0,2,-1.05,4,4,.1,0x666666);scene.updateMatrixWorld(true);
    mouseDown=true;for(let i=0;i<30;i++)shoot(1000+i*100);
  `);
  assert.equal(h.run('ammo'),0);assert.equal(h.run('reloading'),true);assert.equal(h.run('mouseDown'),true);
  assert.equal(h.run('shots'),30);
  h.run('updateCombatTimers(2,6000);updatePlayer(1/60,6100);');
  assert.equal(h.run('ammo'),29);assert.equal(h.run('reserve'),90);assert.equal(h.run('shots'),31);
  assert.equal(h.run('shotSoundCount'),31);
});

test('side cover does not cancel a clear ADS sightline or suppress its shot',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    addBox(.65,1.5,-1.15,.65,3,.65,0x666666);createEnemy(0,-8,0x555555,0);
    aiming=true;for(let i=0;i<90;i++)updateWeaponPose(1/60,i*16);
    scene.updateMatrixWorld(true);shoot(2000);
  `);
  assert.ok(h.run('adsAmount')>.995, 'an unobstructed sightline retains ADS beside cover');
  assert.ok(Math.abs(h.run('camera.fov')-54)<.1);
  const optic=h.run('opticGroup.getWorldPosition(new THREE.Vector3()).project(camera).toArray()');
  assert.ok(Math.abs(optic[0])<.003&&Math.abs(optic[1])<.003, 'side cover cannot pull the scope away from the sightline');
  assert.equal(h.run('ammo'),29);
  assert.ok(h.run('enemies[0].userData.state.health')<100, 'the exposed target remains hittable');
});

test('an unrefreshed muzzle beyond a thin wall cannot shoot enemies behind it',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    addBox(0,1.5,-.65,4,3,.04,0x666666);createEnemy(0,-5,0x555555,0);
    scene.updateMatrixWorld(true);
    const originalMuzzle=muzzleAnchor.getWorldPosition(new THREE.Vector3());shoot(1000);
  `);
  assert.ok(h.run('originalMuzzle.z')<-.67, 'fixture puts the uncorrected muzzle behind cover');
  assert.equal(h.run('ammo'),29, 'the weapon still fires');
  assert.equal(h.run('enemies[0].userData.state.health'),100, 'bullet cannot begin beyond a thin wall');
  assert.ok(h.run('shotPaths[0].start.z')>-.631, 'tracer starts on the camera side of cover');
  assert.ok(h.run('shotPaths[0].end.z')>=-.631, 'impact remains on the visible wall face');
});

test('corner cover intercepts a hip muzzle until ADS exposes the barrel',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    addBox(1.05,1.5,-.65,1.9,3,.05,0x666666);createEnemy(0,-8,0x555555,0);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('ammo'),29);
  assert.equal(h.run('enemies[0].userData.state.health'),100, 'a blocked off-center barrel cannot exploit a clear camera ray');
  h.run('aiming=true;for(let i=0;i<100;i++)updateWeaponPose(1/60,1100+i*16);scene.updateMatrixWorld(true);shoot(4000);');
  assert.ok(h.run('adsAmount')>.995);
  assert.ok(h.run('enemies[0].userData.state.health')<100, 'centering the barrel opens the legitimate firing lane');
  assert.equal(h.run('ammo'),28);
});

test('a movement-only fence collider preserves its intended bullet transparency',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-2,0,-1.05),new THREE.Vector3(2,3,-1)));
    const fence=new THREE.Mesh(new THREE.PlaneGeometry(4,3),new THREE.MeshBasicMaterial({transparent:true,opacity:.3}));
    fence.position.set(0,1.5,-1);scene.add(fence);createEnemy(0,-6,0x555555,0);
    for(let i=0;i<40;i++)updateWeaponPose(1/60,i*16);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('ammo'),29);
  assert.ok(h.run('enemies[0].userData.state.health')<100, 'collision proxies must not become invisible ballistic walls');
});

test('rotated cover cannot turn its oversized movement AABB into an invisible bullet blocker',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    addBox(1.2,1.5,-.8,4,3,.1,0x666666,{rotation:Math.PI/4});createEnemy(0,-6,0x555555,0);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('collisionBoxes[0].containsPoint(camera.position)'),true,'fixture uses a conservative rotated movement box');
  assert.equal(h.run('ammo'),29);assert.ok(h.run('enemies[0].userData.state.health')<100);
});

test('starting inside a solid surface still hits its exit face and restores material sidedness',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.y=1.28;camera.lookAt(0,1.28,-10);
    const enclosingWall=addBox(0,1.5,0,2,3,2,0x666666);createEnemy(0,-6,0x555555,0);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('ammo'),29);assert.equal(h.run('enemies[0].userData.state.health'),100);
  assert.equal(h.run('enclosingWall.material.side'),0,'temporary double-sided ray queries cannot change rendering materials');
  assert.ok(h.run('shotPaths[0].end.z')>=-1.001,'bullet stops on the containing surface');
});

test('floating nameplates and health bars never become ballistic targets',()=>{
  const h=weaponHarness();
  h.run(`
    camera.position.set(0,2.52,0);camera.lookAt(0,2.52,-10);createEnemy(0,-6,0x555555,0);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('ammo'),29);assert.equal(h.run('enemies[0].userData.state.health'),100);
  assert.equal(h.run('hits'),0);
});

test('downward fire hits the real arena floor instead of disappearing below it',()=>{
  const h=weaponHarness();
  h.run(`
    createArena();camera.position.set(0,1.68,64);camera.lookAt(0,0,62);
    scene.updateMatrixWorld(true);shoot(1000);
  `);
  assert.equal(h.run('ammo'),29);assert.equal(h.run('shotImpacts.length'),1);
  assert.ok(Math.abs(h.run('shotPaths[0].end.y'))<.02, 'ground collision determines the endpoint');
});

test('the complete rigid rifle retracts on first close-cover update and returns smoothly after leaving',()=>{
  const h=weaponHarness();
  h.run(`
    addBox(0,2,-.53,6,4,.1,0x666666);updateWeaponPose(1/60,1000);scene.updateMatrixWorld(true);
    function rigidRifleFront(){
      const point=new THREE.Vector3();let front=0;
      weapon.traverse(object=>{
        if(!object.isMesh||object.name==='flash'||object.userData.arm)return;
        const positions=object.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i);object.localToWorld(point);camera.worldToLocal(point);front=Math.min(front,point.z);
        }
      });
      return front;
    }
    const firstRetraction=weaponRetraction,firstFront=rigidRifleFront();
  `);
  assert.ok(h.run('firstRetraction')>.4,'retraction does not wait for animation smoothing before avoiding the wall');
  assert.ok(h.run('firstFront')>-.47,'the real rigid vertices remain on the camera side of the wall at .48m');
  h.run('camera.position.z=3.1;camera.lookAt(0,1.68,0);updateWeaponPose(1/60,1100);const firstReturn=weaponRetraction;');
  assert.ok(h.run('firstReturn')>0&&h.run('firstReturn')<h.run('firstRetraction'),'leaving cover eases the rifle outward');
  h.run('for(let i=0;i<90;i++)updateWeaponPose(1/60,1200+i*16);');
  assert.ok(h.run('weaponRetraction')<.001);assert.ok(Math.abs(h.run('weapon.position.z')+.6)<.003);
});

test('front-cover ADS hysteresis prevents toggling and keeps the retained optic in front of the camera',()=>{
  const h=weaponHarness();
  h.run(`
    const movingWall=new THREE.Mesh(new THREE.BoxGeometry(6,4,.1),new THREE.MeshBasicMaterial());scene.add(movingWall);worldMeshes.push(movingWall);collisionBoxes.push(new THREE.Box3());
    function setCenterClearance(value){movingWall.position.set(0,2,-value-.105);scene.updateMatrixWorld(true);collisionBoxes[0].setFromObject(movingWall);}
    aiming=true;setCenterClearance(1.45);for(let i=0;i<90;i++)updateWeaponPose(1/60,i*16);
  `);
  assert.equal(h.run('adsWallSuppressed'),false);assert.ok(h.run('adsAmount')>.995);
  h.run('setCenterClearance(1);for(let i=0;i<60;i++)updateWeaponPose(1/60,2000+i*16);');
  assert.equal(h.run('adsWallSuppressed'),true);assert.ok(h.run('adsAmount')<.005);
  for(const clearance of [1.18,1.22,1.28,1.2,1.25]){
    h.run(`setCenterClearance(${clearance});updateWeaponPose(1/60,3200);`);
    assert.equal(h.run('adsWallSuppressed'),true,'the exit state holds throughout the hysteresis band');
  }
  h.run('setCenterClearance(1.45);for(let i=0;i<90;i++)updateWeaponPose(1/60,4000+i*16);');
  assert.equal(h.run('adsWallSuppressed'),false);assert.ok(h.run('adsAmount')>.995);
  for(const clearance of [1.28,1.2,1.18,1.25]){
    h.run(`setCenterClearance(${clearance});for(let i=0;i<12;i++)updateWeaponPose(1/60,5600+i*16);scene.updateMatrixWorld(true);`);
    assert.equal(h.run('adsWallSuppressed'),false,'retained ADS cannot oscillate at the same distances');
    assert.ok(h.run('adsAmount')>.995);
    assert.ok(h.run('camera.worldToLocal(opticGroup.getWorldPosition(new THREE.Vector3())).z')<-.15,'scope glass cannot move behind the eye while ADS remains enabled');
  }
});

test('point-blank high-ready keeps visible rigid gun detail in the viewport',()=>{
  const h=weaponHarness();h.run(`
    addBox(0,2,-.53,4,4,.1,0x666666);
    for(let i=0;i<80;i++)updateWeaponPose(1/60,i*16);
    scene.updateMatrixWorld(true);let visibleWeaponPoints=0;
    const points=weapon.userData.clearancePoints;
    for(let i=0;i<points.length;i+=3){const point=weapon.localToWorld(new THREE.Vector3(points[i],points[i+1],points[i+2])).project(camera);if(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z>-1&&point.z<1)visibleWeaponPoints++;}
  `);
  assert.ok(h.run('highReadyAmount')>.99);
  assert.ok(h.run('visibleWeaponPoints')>0,'close cover should stow the gun visibly rather than hiding it behind the camera');
  h.run('const barrel=weapon.getObjectByName("barrel"),barrelVertices=barrel.geometry.attributes.position;let barrelNearest=Infinity;for(let i=0;i<barrelVertices.count;i++){const p=barrel.localToWorld(new THREE.Vector3().fromBufferAttribute(barrelVertices,i));camera.worldToLocal(p);barrelNearest=Math.min(barrelNearest,-p.z);}');
  assert.ok(h.run('barrelNearest')>.12,'the high-ready barrel cannot turn into a giant cylinder crossing the near plane');
  assert.equal(h.run('weapon.userData.arms.every(arm=>!arm.visible)'),true,'upright stow cannot rotate an arm through the eye');
  h.run('collisionBoxes.length=0;worldMeshes.length=0;for(let i=0;i<90;i++)updateWeaponPose(1/60,2000+i*16);');
  assert.equal(h.run('weapon.userData.arms.every(arm=>arm.visible)'),true,'normal grip returns after leaving cover');
});

test('close-wall bullet marks lie flat on their actual surface instead of floating blobs',()=>{
  const h=createHarness();h.run('const normal=new THREE.Vector3(1,0,0);createImpact(new THREE.Vector3(.5,1,0),normal);const decal=bulletDecals[0],decalNormal=new THREE.Vector3(0,0,1).applyQuaternion(decal.quaternion);');
  assert.ok(h.run('decalNormal.dot(normal)')>.9999);
  assert.equal(h.run('decal.geometry.type'),'CircleGeometry');assert.equal(h.run('decal.geometry.parameters.radius'),.016);
  assert.equal(h.run('decal.material.depthWrite'),false);assert.ok(Math.abs(h.run('decal.position.x')-.5015)<1e-7);
});

let failed=0;
for(const {name,execute} of checks){
  try{execute();console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}`);console.error(error.stack);}
}
console.log(`\n${checks.length-failed}/${checks.length} weapon clearance checks passed.`);
if(failed)process.exitCode=1;
