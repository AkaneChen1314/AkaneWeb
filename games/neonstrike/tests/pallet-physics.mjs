import assert from 'node:assert/strict';
import {createHarness,THREE} from './test-harness.mjs';

// Inspect the actual scene and collision bounds, including each rotated pallet.
const h=createHarness();
h.run(`buildSelectedArena(0);scene.updateMatrixWorld(true);`);
const pallets=h.run("scene.getObjectByName('harbor-pallets')");
const boxes=Array.from(h.run("collisionBoxes.filter(box=>box.userData?.pallet)"));
assert.equal(pallets.count,9);assert.equal(boxes.length,pallets.count);
const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
for(let i=0;i<pallets.count;i++){
  pallets.getMatrixAt(i,matrix);matrix.decompose(position,quaternion,scale);
  const box=boxes[i];
  assert.ok(Math.abs(box.max.y-.18)<1e-8 && Math.abs(box.min.y-.02)<1e-8);
  assert.ok(Math.abs(box.shape.x-position.x)<1e-8 && Math.abs(box.shape.z-position.z)<1e-8);
  assert.equal(h.run(`bodyOverlapsCollider(collisionBoxes.filter(box=>box.userData?.pallet)[${i}],${position.x},${position.z},.34,.22,1.85)`),false,'low pallet cannot block an enemy');
  assert.ok(h.run(`sweepSphereCollider({x:${position.x},y:.7,z:${position.z}},{x:0,y:-1,z:0},collisionBoxes.filter(box=>box.userData?.pallet)[${i}],.12)`),'grenades hit the top');
}
assert.equal(h.run("worldRayTargets().includes(scene.getObjectByName('harbor-pallets'))"),false,'pallets do not obstruct weapon or AI line-of-sight rays');
assert.equal(h.run("pickups.some(item=>collisionBoxes.filter(box=>box.userData?.pallet).some(box=>bodyOverlapsCollider(box,item.root.position.x,item.root.position.z,.7,.15,1.75)))"),false,'supply pads must not overlap a pallet');

const walk=createHarness();
walk.run(`scene.add(camera);createWeapon();createInstancedProps();gameState='playing';yaw.position.set(-39,1.68,-12.9);keys.KeyW=true;`);
let highest=0;
for(let i=0;i<90;i++){walk.run(`updatePlayer(1/60,${1000+i*16});`);highest=Math.max(highest,walk.run('yaw.position.y'));}
assert.ok(highest>=1.85,'the player steps onto the pallet rather than passing through it');
assert.ok(walk.run('yaw.position.z')< -17.5,'the player walks off it without an invisible wall');
assert.ok(Math.abs(walk.run('yaw.position.y')-1.68)<.01,'the player returns to ground level');

const jump=createHarness();
jump.run(`scene.add(camera);createWeapon();createInstancedProps();gameState='playing';yaw.position.set(-39,1.68,-12.9);keys.KeyW=true;jump();`);
for(let i=0;i<90;i++)jump.run(`updatePlayer(1/60,${1000+i*16});`);
assert.ok(jump.run('yaw.position.z')< -17.5,'the player can jump over the visible pallet');
console.log('PASS all nine real pallets support player and grenades without blocking bots, bullets or supply pads');
console.log('PASS a player can walk on, off and jump across a pallet');
