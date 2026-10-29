import assert from 'node:assert/strict';
import {createHarness,THREE} from './test-harness.mjs';

for(const map of [0,1]){
  const h=createHarness();h.run(`buildSelectedArena(${map});scene.updateMatrixWorld(true);`);
  assert.equal(h.run('isPositionBlocked(0,65)'),false,`map ${map}: deployment stays open`);
  assert.equal(h.run('pickups.length'),16);
  assert.equal(h.run('pickups.filter(item=>collisionBoxes.some(box=>bodyOverlapsCollider(box,item.root.position.x,item.root.position.z,.7,.15,1.75))).length'),0,`map ${map}: supply approach stays open`);
  h.run('matchTotalEnemies=12;spawnEnemies(12);');assert.equal(h.run('enemies.length'),12);
  assert.equal(h.run('enemies.every(enemy=>!isBotBlocked(enemy.position.x,enemy.position.z,enemy))'),true);
  if(map===0){
    const beam=h.run("scene.children.find(item=>item.name==='harbor-cargo-beam')"),columns=h.run("scene.children.filter(item=>item.name==='harbor-cargo-column')");
    assert.ok(beam);assert.equal(columns.length,2);const bounds=new THREE.Box3().setFromObject(beam);
    for(const column of columns){const columnBounds=new THREE.Box3().setFromObject(column);assert.ok(Math.abs(columnBounds.min.y)<1e-6);assert.ok(columnBounds.expandByScalar(.01).intersectsBox(bounds));}
  }
}

const h=createHarness();h.run('buildSelectedArena(1);scene.updateMatrixWorld(true);');
assert.ok(h.run("scene.children.some(item=>item.name==='foundry-skyline')"),'foundry has its own industrial horizon');
const stations=h.run("scene.children.filter(item=>item.name==='foundry-equipment')");
const stacks=h.run("scene.children.filter(item=>item.name==='foundry-equipment-stack')");
assert.equal(stations.length,4);assert.equal(stacks.length,4);
for(const station of stations){
  const bounds=new THREE.Box3().setFromObject(station);
  assert.ok(Math.abs(bounds.min.y)<1e-6,'equipment is supported by the ground');
  assert.equal(h.run(`isPositionBlocked(${station.position.x},${station.position.z})`),true,'equipment blocks movement');
  assert.ok(stacks.some(stack=>new THREE.Box3().setFromObject(stack).expandByScalar(.01).intersectsBox(bounds)),'stack is supported by equipment');
}
const beams=h.run("scene.children.filter(item=>item.name==='foundry-portal-beam')");
const columns=h.run("scene.children.filter(item=>item.name==='foundry-portal-column')");
assert.equal(beams.length,2);assert.equal(columns.length,4);
for(const beam of beams){
  const bounds=new THREE.Box3().setFromObject(beam);
  const supports=columns.filter(column=>new THREE.Box3().setFromObject(column).expandByScalar(.01).intersectsBox(bounds));
  assert.equal(supports.length,2,'each overhead beam rests on two columns');
  for(const column of supports)assert.ok(Math.abs(new THREE.Box3().setFromObject(column).min.y)<1e-6,'portal columns touch the ground');
}
for(const z of [-65,-60,-55,-50,-45,-40,-35,-30,-25,-20,-15,15,20,25,30,35,40,45,50,55,60,65]){
  assert.equal(h.run(`isPositionBlocked(0,${z})`),false,`central approach at ${z} remains open`);
}
const grates=h.run("scene.children.find(item=>item.name==='foundry-floor-grates')");
const slats=h.run("scene.children.find(item=>item.name==='foundry-grate-slats')");
const pipes=h.run("scene.children.find(item=>item.name==='foundry-wall-pipes')");
assert.equal(grates.count,12);assert.equal(slats.count,96);assert.equal(pipes.count,8);
assert.equal(h.run("worldMeshes.some(item=>['foundry-floor-grates','foundry-grate-slats','foundry-wall-pipes'].includes(item.name))"),false,'decoration does not become extra raycast geometry');
const transform=new THREE.Matrix4(),position=new THREE.Vector3();
for(let i=0;i<grates.count;i++){
  grates.getMatrixAt(i,transform);position.setFromMatrixPosition(transform);
  assert.ok(Math.abs(position.y-.043)<1e-6,'grates remain flush with the ground');
  assert.equal(h.run(`isPositionBlocked(${position.x},${position.z})`),false,'grates do not block movement');
}
for(let i=0;i<pipes.count;i++){
  pipes.getMatrixAt(i,transform);position.setFromMatrixPosition(transform);
  assert.ok(Math.abs(Math.abs(position.x)-47.46)<1e-5,'pipes remain mounted against existing perimeter walls');
}
console.log('PASS both maps retain open spawn, accessible supplies and enemy generation');
console.log('PASS foundry portals are ground-supported and preserve north/south routes');
console.log('PASS foundry equipment is grounded, solid, and has supported stacks');
console.log('PASS foundry detail stays flush and does not add hidden movement or raycast blockers');
