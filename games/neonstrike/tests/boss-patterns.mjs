import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

const checks=[];
const test=(name,execute)=>checks.push({name,execute});
function encounter(){
  const h=createHarness();
  h.run("gameState='playing';yaw.position.set(4,1.68,0);const boss=createEnemy(0,0,0x556677,0,'boss'),state=boss.userData.state;");
  return h;
}
function finishWave(h){
  h.run('updateBossAttacks(1.55,1550);for(let index=1;index<=14;index++)updateBossAttacks(.05,1550+index*50);');
}

test('boss rotates readable patterns with a single pending cast and faster initial engagement',()=>{
  const h=encounter();
  assert.equal(h.run('state.bossAttackCooldown'),2.6);
  h.run('const accepted=queueBossAttack(boss,yaw.position);const duplicate=queueBossAttack(boss,yaw.position);');
  assert.equal(h.run('accepted'),true);assert.equal(h.run('duplicate'),false);
  assert.equal(h.run('bossAttacks.length'),1);assert.equal(h.run('state.bossCastIndex'),1);
  assert.equal(h.run('bossAttacks[0].pattern'),'precision');assert.equal(h.run('bossAttacks[0].markers.length'),1);
  h.run('clearBossAttacks();queueBossAttack(boss,yaw.position);');
  assert.equal(h.run('bossAttacks[0].pattern'),'barrage');assert.equal(h.run('bossAttacks[0].markers.length'),2);
  h.run('clearBossAttacks();queueBossAttack(boss,yaw.position);');
  assert.equal(h.run('bossAttacks[0].pattern'),'shockwave');assert.ok(h.run('bossAttacks[0].radius')>=8);
});

test('staggered barrage freezes all targets, leaves gaps and opens recovery only after its final pulse',()=>{
  const h=encounter();
  h.run("queueBossAttack(boss,yaw.position,'barrage');const original=bossAttacks[0].markers.map(zone=>zone.position.clone());yaw.position.set(25,1.68,25);updateBossAttacks(1.56,1560);");
  assert.equal(h.run('bossAttacks[0].markers[0].complete'),true);assert.equal(h.run('bossAttacks[0].markers[1].complete'),false);
  assert.equal(h.run('state.bossRecovery'),0);
  assert.equal(h.run('bossAttacks[0].markers.every((zone,index)=>zone.position.equals(original[index]))'),true);
  assert.ok(h.run('original[0].distanceTo(original[1])')>h.run('bossAttacks[0].markers[0].radius+bossAttacks[0].markers[1].radius'));
  h.run('updateBossAttacks(.5,2060);');
  assert.equal(h.run('bossAttacks[0].detonated'),true);assert.equal(h.run('state.bossRecovery'),1.9);
  assert.equal(h.run('health'),100);assert.equal(h.run('armor'),50);
});

test('second phase adds a third barrage pulse without shrinking telegraph time below an escape window',()=>{
  const h=encounter();h.run("state.bossPhase=2;queueBossAttack(boss,yaw.position,'barrage');");
  assert.equal(h.run('bossAttacks[0].markers.length'),3);
  assert.deepEqual(Array.from(h.run('bossAttacks[0].markers.map(zone=>zone.duration)')),[1.35,1.85,2.35]);
  assert.ok(h.run('state.specialWindup')>2.35);
  h.run('clearBossAttacks();yaw.position.set(30,1.68,0);queueBossAttack(boss,yaw.position,"shockwave");');
  assert.equal(h.run('bossAttacks[0].pattern'),'barrage','distant casts use an attack that can reach the player');
});

test('shockwave expands over time and can damage each player only once per pulse',()=>{
  const h=encounter();h.run("queueBossAttack(boss,yaw.position,'shockwave');updateBossAttacks(1.55,1550);");
  assert.equal(h.run('health'),100,'windup itself cannot cause damage');
  h.run('for(let i=1;i<=14;i++)updateBossAttacks(.05,1550+i*50);');
  assert.equal(h.run('health'),90);assert.equal(h.run('armor'),30);
  const health=h.run('health');h.run('updateBossAttacks(.3,2550);');
  assert.equal(h.run('health'),health);assert.equal(h.run('bossAttacks.length'),0);
  assert.ok(h.run('state.bossRecovery')>0);
});

test('cyan shockwave wedge and a timed jump both provide actual safe routes',()=>{
  const safe=encounter();safe.run("queueBossAttack(boss,yaw.position,'shockwave');const angle=bossAttacks[0].markers[0].safeAngle;yaw.position.set(Math.cos(angle)*4,1.68,Math.sin(angle)*4);");
  finishWave(safe);assert.equal(safe.run('health'),100);assert.equal(safe.run('armor'),50);
  const jumping=encounter();jumping.run("queueBossAttack(boss,yaw.position,'shockwave');yaw.position.y=1.68+.85;");
  finishWave(jumping);assert.equal(jumping.run('health'),100);assert.equal(jumping.run('armor'),50);
});

test('thick cover blocks the moving shockwave as well as target circles',()=>{
  const h=encounter();h.run("addBox(2,1.5,0,.1,3,5,0x334455);scene.updateMatrixWorld(true);queueBossAttack(boss,yaw.position,'shockwave');");
  finishWave(h);assert.equal(h.run('health'),100);assert.equal(h.run('armor'),50);
});

test('completed special exposes the core, suppresses shooting/movement and rewards accurate counterfire',()=>{
  const h=encounter();h.run("yaw.position.set(10,1.68,0);queueBossAttack(boss,yaw.position);yaw.position.z=10;updateBossAttacks(1.41,1410);state.state='ENGAGE';state.reaction=0;state.shotCooldown=0;state.losTimer=0;const shotsRecorded=[];enemyShoot=()=>shotsRecorded.push(true);const before=boss.position.clone();updateEnemies(.1,1510);");
  assert.equal(h.run('shotsRecorded.length'),0);assert.equal(h.run('boss.position.equals(before)'),true);
  assert.equal(h.run('state.rankMaterial.color.getHex()'),0x75f5ee);
  assert.match(h.run('ui.bossPhase.textContent'),/弱點開放/);
  h.run('damageEnemy(boss,100,null,false);');assert.equal(h.run('state.health'),560);
  h.run('damageEnemy(boss,20,null,true);');assert.equal(h.run('state.health'),522);
  h.run('state.bossRecovery=.05;state.shotCooldown=0;updateEnemies(.1,1610);');
  assert.equal(h.run('state.bossRecovery'),0);assert.equal(h.run('shotsRecorded.length'),1);
  assert.equal(h.run('state.rankMaterial.color.getHex()'),0xff9e42);
});

test('boss casts and recovery freeze while paused and owner death clears all pattern visuals',()=>{
  const h=encounter();h.run("queueBossAttack(boss,yaw.position,'barrage');const remaining=bossAttacks[0].markers.map(zone=>zone.remaining);gameState='paused';updateBossAttacks(8,8000);updateEnemies(8,8000);");
  assert.equal(h.run('bossAttacks[0].markers.every((zone,index)=>zone.remaining===remaining[index])'),true);
  h.run("gameState='playing';state.alive=false;updateBossAttacks(.1,8100);");
  assert.equal(h.run('bossAttacks.length'),0);assert.equal(h.run('scene.children.some(child=>child.name==="boss-attack")'),false);assert.equal(h.run('health'),100);
  const recovery=encounter();recovery.run("state.bossRecovery=1.9;gameState='paused';updateEnemies(4,4000);");
  assert.equal(recovery.run('state.bossRecovery'),1.9);
});

test('barrage telegraph keeps boss windup active through every pending pulse',()=>{
  const h=encounter();h.run("yaw.position.set(10,1.68,0);state.state='ENGAGE';state.reaction=0;state.losTimer=0;state.bossAttackCooldown=0;state.bossCastIndex=1;const before=boss.position.clone();updateEnemies(.05,1000);");
  assert.equal(h.run('bossAttacks[0].pattern'),'barrage');assert.ok(h.run('state.specialWindup')>2.05);
  assert.equal(h.run('boss.position.equals(before)'),true);
});

let failed=0;
for(const {name,execute} of checks){try{execute();console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}`);console.error(error.stack);}}
console.log(`\n${checks.length-failed}/${checks.length} boss pattern checks passed.`);
if(failed)process.exitCode=1;
