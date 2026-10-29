import assert from 'node:assert/strict';
import { createHarness, THREE } from './test-harness.mjs';

const cases=[];const test=(name,run)=>cases.push({name,run});

test('close-container sight queries avoid decorative instance raycasts while preserving cover',()=>{
  const h=createHarness();h.run(`
    createContainer(0,1.6,-7,4.8,3.2,11,0x556677,0);scene.updateMatrixWorld(true);
    let instanceWork=0;const originalInstanceRaycast=THREE.InstancedMesh.prototype.raycast;
    for(const root of worldMeshes)root.traverse(object=>{if(object.isInstancedMesh)object.raycast=function(ray,hits){instanceWork+=this.count;return originalInstanceRaycast.call(this,ray,hits);};});
    raycaster.set(new THREE.Vector3(2.35,1.5,0),new THREE.Vector3(0,0,-1));raycaster.far=20;
    const legacyHits=raycaster.intersectObjects(worldMeshes,true),legacyInstanceWork=instanceWork;
    instanceWork=0;const blocked=!hasLineOfSight({x:2.35,z:0},{x:2.35,y:1.5,z:-20});
  `);
  assert.ok(h.run('legacyHits.length')>0);assert.equal(h.run('blocked'),true);
  assert.ok(h.run('legacyInstanceWork')>=50,'fixture must exercise the old decorative instance batches');
  assert.equal(h.run('instanceWork'),0,'new structural queries perform no decorative instance raycasts');
  console.log(`  close-container instance tests per sight query: ${h.run('legacyInstanceWork')} -> ${h.run('instanceWork')}`);
});

test('ray target cache invalidates after removals, replacement and grouped components',()=>{
  const h=createHarness();h.run(`
    const wall=addBox(0,1.5,-3,4,3,.2,0x555555);const initial=worldRayTargets();
  `);
  assert.equal(h.run('worldRayTargets()===initial'),true,'unchanged structure reuses the same list');
  h.run('worldMeshes.length=0;');assert.equal(h.run('worldRayTargets().length'),0);
  h.run('const group=new THREE.Group();const part=new THREE.Mesh(new THREE.BoxGeometry(4,3,.2),new THREE.MeshBasicMaterial());part.position.set(0,1.5,-3);group.add(part);scene.add(group);worldMeshes.push(group);scene.updateMatrixWorld(true);');
  assert.equal(h.run('worldRayTargets().length'),1);
  assert.equal(h.run('hasLineOfSight({x:0,z:0},{x:0,y:1.5,z:-10})'),false);
  h.run('group.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));');
  assert.equal(h.run('worldRayTargets().length'),2);
  h.run('worldMeshes[0]=wall;');assert.equal(h.run('worldRayTargets()[0]===wall'),true);
});

test('registered structural instance batches retain their physical ray intersections',()=>{
  const h=createHarness();h.run(`
    const rail=new THREE.InstancedMesh(new THREE.BoxGeometry(4,.15,.2),new THREE.MeshBasicMaterial(),1);
    rail.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,1.5,-3));scene.add(rail);worldMeshes.push(rail);scene.updateMatrixWorld(true);
  `);
  assert.equal(h.run('worldRayTargets()[0]===rail'),true);
  assert.equal(h.run('hasLineOfSight({x:0,z:0},{x:0,y:1.5,z:-10})'),false);
});

test('small track and sleeper surfaces continuously support the player without vertical chatter',()=>{
  for(const height of [.08,.1,.155,.2]){
    const h=createHarness();h.run(`
      scene.add(camera);createWeapon();gameState='playing';
      addBox(0,${height/2},0,2,${height},30,0x555555);yaw.position.set(0,${1.68+height},10);keys.KeyW=true;
      const standingHeights=[];for(let frame=0;frame<120;frame++){updatePlayer(1/60,1000+frame*1000/60);standingHeights.push(yaw.position.y);}
    `);
    const heights=Array.from(h.run('standingHeights'));
    assert.ok(Math.max(...heights)-Math.min(...heights)<1e-9,`height ${height} must not repeatedly step up and fall`);
    assert.ok(Math.abs(heights[0]-(1.68+height))<1e-9);assert.equal(h.run('grounded'),true);
    assert.ok(h.run('yaw.position.z')<1,'fixture must traverse the track');
  }
});

test('falling lands on a low track and walking off still starts gravity',()=>{
  const h=createHarness();h.run(`
    scene.add(camera);createWeapon();gameState='playing';addBox(0,.05,0,2,.1,2,0x555555);
    yaw.position.set(0,2.5,0);grounded=false;verticalVelocity=-2;
    for(let i=0;i<50;i++)updatePlayer(1/60,1000+i*16);
  `);
  assert.ok(Math.abs(h.run('yaw.position.y')-1.78)<1e-9);assert.equal(h.run('grounded'),true);
  h.run('yaw.position.x=3;updatePlayer(1/60,2000);');
  assert.ok(h.run('yaw.position.y')<1.78);assert.equal(h.run('grounded'),false);
});

let passed=0;for(const item of cases){item.run();passed++;console.log(`PASS ${item.name}`);}
console.log(`\n${passed}/${cases.length} container performance checks passed.`);
