import assert from 'node:assert/strict';
import {createHarness,THREE} from './test-harness.mjs';

const harbor=createHarness();
harbor.run('buildSelectedArena(0);scene.updateMatrixWorld(true);');
const labels=[];harbor.run('scene').traverse(item=>{if(item.name==='harbor-rail-label')labels.push(item);});
assert.equal(labels.length,4,'both rail cars need a readable label on each side');
for(const label of labels){
  assert.equal(label.parent.userData.container,true,'the label is attached to its container');
  assert.ok(Math.abs(label.position.x)>label.parent.geometry.parameters.width/2+.04,'the label clears the ribs and cannot z-fight');
  assert.ok(!harbor.run('worldRayTargets()').includes(label),'decorative lettering does not add a second shot collider');
}
for(const map of [0,1]){
  const h=createHarness();h.run(`buildSelectedArena(${map});scene.updateMatrixWorld(true);`);
  const barrels=Array.from(h.run('explosiveBarrels'));
  assert.ok(barrels.length>0);
  for(const barrel of barrels){
    const warning=barrel.getObjectByName('barrel-warning');assert.ok(warning);
    const p=warning.geometry.parameters;
    assert.equal(warning.geometry.type,'CylinderGeometry');
    assert.ok(p.radiusTop>.43&&p.radiusTop<.46&&p.openEnded,'warning follows the barrel without protruding');
    assert.ok(warning.position.y-p.height/2>.64+.035&&warning.position.y+p.height/2<1.12-.035,'marking clears the metal hoops');
  }
}
const foundry=createHarness();foundry.run('buildSelectedArena(1);scene.updateMatrixWorld(true);');
const bridges=foundry.run("scene.children.filter(item=>item.name==='foundry-pipe-bridge')");
assert.equal(bridges.length,2);
for(const bridge of bridges){
  const bounds=new THREE.Box3().setFromObject(bridge);
  for(const x of [-11,11]){
    const support=foundry.run(`worldMeshes.find(item=>Math.abs(item.position.x-(${x}))<.001&&Math.abs(item.position.z-(${bridge.position.z}))<.001&&Math.abs(item.position.y-2.6)<.001)`);
    assert.ok(support&&bounds.clone().expandByScalar(.01).intersectsBox(new THREE.Box3().setFromObject(support)),'each pipe meets its columns');
  }
  assert.equal(foundry.run(`isPositionBlocked(0,${bridge.position.z})`),false,'pipe does not obstruct walking under it');
  assert.ok(foundry.run(`collisionBoxes.some(box=>box.min.y>4&&bodyOverlapsCollider(box,0,${bridge.position.z},.1,4.5,4.8))`),'pipe can block projectiles at its height');
}
console.log('PASS harbor rail labels are attached and readable from both sides');
console.log('PASS barrel warnings follow the surface and clear its hoops on both maps');
console.log('PASS foundry pipe bridges have supports and preserve the lane beneath');
