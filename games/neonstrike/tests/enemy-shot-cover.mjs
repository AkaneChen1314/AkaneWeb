import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

function scenario(wall=''){
  const h=createHarness();
  h.run(`gameState='playing';yaw.position.set(0,1.68,12);createEnemy(0,0,0x556677,0);${wall}
    scene.updateMatrixWorld(true);Math.random=()=>.5;
    const state=enemies[0].userData.state;state.state='ENGAGE';state.reaction=0;
    state.cachedCanSee=true;state.losTimer=10;state.shotCooldown=0;`);
  return h;
}

for(const rotation of [0,.35]){
  const h=scenario(`const wall=addBox(0,1.5,.55,4,3,.15,0x334455,{rotation:${rotation}});`);
  assert.ok(h.run('enemies[0].userData.state.muzzle.getWorldPosition(new THREE.Vector3()).z')>.7,'reproduction requires muzzle beyond the thin wall');
  h.run('const originalSide=wall.material.side;raycaster.near=.002;raycaster.far=17;updateEnemies(.01,1000);');
  assert.equal(h.run('health'),100,'a cached sightline cannot allow a shot through cover');
  assert.equal(h.run('armor'),50);
  assert.equal(h.run('state.recoil'),.16,'enemy actually fired, rather than skipping the test');
  assert.equal(h.run('wall.material.side===originalSide'),true,'render material sidedness is restored');
  assert.equal(h.run('raycaster.near'),.002);assert.equal(h.run('raycaster.far'),17);
}

const open=scenario();open.run('updateEnemies(.01,1000);');
assert.ok(open.run('health')<100,'unobstructed enemy fire remains effective');
const fence=scenario('registerCollisionBox(0,1.5,.55,4,3,.15);');fence.run('updateEnemies(.01,1000);');
assert.ok(fence.run('health')<100,'movement-only fence collision keeps its intended bullet transparency');
console.log('PASS enemy muzzle clearance blocks thin and angled walls even with a stale sightline');
console.log('PASS enemy shots preserve open and fence fire, render sidedness, and raycaster settings');
