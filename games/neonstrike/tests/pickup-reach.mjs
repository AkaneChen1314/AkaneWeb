import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

const h=createHarness();
h.run(`gameState='playing';health=50;yaw.position.set(0,eyeHeight,0);createPickup('medkit',1,0,0);
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(.45,0,-1),new THREE.Vector3(.55,2,1)));
  updatePickups(.05,1000);`);
assert.equal(h.run('health'),50,'a nearby wall prevents collecting through cover');
assert.equal(h.run('pickups[0].active'),true);
assert.match(h.run("ui.pickupPrompt.querySelector('b').textContent"),/前往補給所在位置/);
h.run('collisionBoxes.length=0;yaw.position.y=eyeHeight+2;updatePickups(.05,1050);');
assert.equal(h.run('health'),50,'a pickup far below the player is not automatically collected');
assert.equal(h.run('pickups[0].active'),true);
h.run('yaw.position.y=eyeHeight;updatePickups(.05,1100);');
assert.equal(h.run('health'),95,'an accessible pickup still heals normally');
assert.equal(h.run('pickups[0].active'),false);
console.log('PASS pickups require a reachable height and an unobstructed path');
