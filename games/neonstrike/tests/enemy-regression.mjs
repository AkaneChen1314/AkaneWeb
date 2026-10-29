import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

const cases=[];
const test=(name,run)=>cases.push({name,run});

test('enemy ranks have distinct models, labels, health and collision footprints',()=>{
  const h=createHarness();
  h.run("createEnemy(-10,0,0x556677,0);createEnemy(0,0,0x556677,1,'elite');createEnemy(10,0,0x556677,2,'boss');");
  assert.deepEqual(Array.from(h.run('enemies.map(enemy=>enemy.userData.state.rank)')),['standard','elite','boss']);
  assert.deepEqual(Array.from(h.run('enemies.map(enemy=>enemy.userData.state.maxHealth)')),[100,155,700]);
  assert.equal(h.run('enemies[2].scale.x'),1.25);
  assert.ok(h.run('enemies[2].userData.state.radius>enemies[0].userData.state.radius'));
  assert.ok(h.run('enemies[2].children.length>enemies[1].children.length'));
  assert.match(h.run('enemies[1].userData.state.name'),/ELITE/);
  assert.equal(h.run("enemies[2].getObjectByName('rank-visor').material.color.getHex()"),0xff9e42);
});

test('configured elite density is deterministic and a boss batch adds exactly one boss',()=>{
  const h=createHarness();
  h.run('matchTotalEnemies=11;spawnEnemies(10,{eliteRate:.3});spawnEnemies(1,{boss:true,eliteRate:1});');
  assert.equal(h.run("enemies.filter(enemy=>enemy.userData.state.rank==='elite').length"),3);
  assert.equal(h.run("enemies.filter(enemy=>enemy.userData.state.rank==='boss').length"),1);
  assert.equal(h.run('enemies.length'),11);assert.equal(h.run('matchTotalEnemies'),11);
  assert.equal(h.run('enemies.every(enemy=>!isBotBlocked(enemy.position.x,enemy.position.z,enemy))'),true);
});

test('enemy strength and difficulty compose once for health, speed, reaction and damage',()=>{
  const h=createHarness();
  h.run("missionSettings.enemyPower=1.5;selectedDifficulty=2;createEnemy(0,0,0x556677,0,'elite');const tuned=enemies[0].userData.state;const tune=getEnemyTuning();");
  assert.equal(h.run('tuned.maxHealth'),Math.round(155*1.28*1.5));
  assert.ok(Math.abs(h.run('tuned.speed/tuned.baseSpeed')-1.13*1.05)<1e-9);
  assert.ok(Math.abs(h.run('tuned.reaction/tuned.baseReaction')-.68/Math.sqrt(1.5))<1e-9);
  h.run("gameState='playing';yaw.position.set(0,1.68,10);enemies[0].position.set(0,0,0);scene.updateMatrixWorld(true);const recordedDamage=[];takeDamage=amount=>recordedDamage.push(amount);Math.random=()=>.5;enemyShoot(enemies[0],10);");
  assert.equal(h.run('recordedDamage.length'),1);
  assert.equal(h.run('recordedDamage[0]'),Math.round(12*1.25*1.2*1.13));
});

test('commander changes phase once, armor is weaker after enrage and headshots expose its weakpoint',()=>{
  const h=createHarness();
  h.run("gameState='playing';createEnemy(0,0,0x556677,0,'boss');const boss=enemies[0],state=boss.userData.state;damageEnemy(boss,100,null,false);");
  assert.equal(h.run('state.health'),612);assert.equal(h.run('state.bossPhase'),1);
  h.run('damageEnemy(boss,300,null,false);const enragedSpeed=state.speed;const enragedDamage=state.damageMultiplier;');
  assert.equal(h.run('state.bossPhase'),2);
  assert.equal(h.run('state.health'),348);
  assert.equal(h.run('state.rankMaterial.color.getHex()'),0xff5366);
  h.run('damageEnemy(boss,10,null,false);');
  assert.equal(h.run('state.health'),338);
  assert.equal(h.run('state.speed===enragedSpeed&&state.damageMultiplier===enragedDamage'),true);
  h.run('damageEnemy(boss,20,null,true);');
  assert.equal(h.run('state.health'),311);
});

test('boss special attacks require active engagement and pause all movement during the warning',()=>{
  const h=createHarness();
  h.run("gameState='playing';yaw.position.set(0,1.68,20);createEnemy(0,0,0x556677,0,'boss');const boss=enemies[0],state=boss.userData.state;state.state='ENGAGE';state.reaction=0;state.bossAttackCooldown=0;state.losTimer=0;const attacks=[];queueBossAttack=(owner,target)=>{attacks.push({owner,target});return true;};const before=boss.position.clone();updateEnemies(.05,1000);");
  assert.equal(h.run('attacks.length'),1);
  assert.equal(h.run('state.specialWindup'),1.45);
  assert.equal(h.run('boss.position.equals(before)'),true);
  h.run('updateEnemies(.05,1050);');
  assert.equal(h.run('attacks.length'),1,'one telegraph cannot repeat every frame');
  h.run("gameState='paused';state.bossAttackCooldown=0;updateEnemies(.05,1100);");
  assert.equal(h.run('attacks.length'),1,'paused boss cannot queue damage');
  h.run("gameState='playing';state.alive=false;updateEnemies(.05,1150);");
  assert.equal(h.run('attacks.length'),1,'dead boss cannot queue damage');
});

test('solid cover prevents enemy hitscan and boss telegraph targeting through walls',()=>{
  const h=createHarness();
  h.run("gameState='playing';yaw.position.set(0,1.68,20);createEnemy(0,0,0x556677,0,'boss');addBox(0,2,10,6,4,.2,0x334455);scene.updateMatrixWorld(true);const state=enemies[0].userData.state;state.state='ENGAGE';state.bossAttackCooldown=0;state.losTimer=0;const attacks=[];queueBossAttack=()=>attacks.push(true);Math.random=()=>.5;updateEnemies(.05,1000);enemyShoot(enemies[0],20);");
  assert.equal(h.run('attacks.length'),0);
  assert.equal(h.run('health'),100);assert.equal(h.run('armor'),50);
  assert.equal(h.run('state.cachedCanSee'),false);
});

test('boss spawning respects its larger radius next to map scenery and other enemies',()=>{
  const h=createHarness();
  h.run('createArena();matchTotalEnemies=31;spawnEnemies(30,{eliteRate:.3});spawnEnemies(1,{boss:true});');
  assert.equal(h.run('enemies.length'),31);
  assert.equal(h.run('enemies.every(enemy=>!isBotBlocked(enemy.position.x,enemy.position.z,enemy))'),true);
  assert.equal(h.run("enemies.filter(enemy=>enemy.userData.state.rank==='boss').length"),1);
  const h2=createHarness();
  h2.run("yaw.position.set(0,1.68,60);createEnemy(0,0,0x556677,0,'boss');collisionBoxes.push(new THREE.Box3(new THREE.Vector3(.5,0,-2),new THREE.Vector3(.7,4,2)));const before=enemies[0].position.clone();moveBot(enemies[0],1,0,.05);");
  assert.ok(h2.run('enemies[0].position.x')<.5,'heavy armor cannot enter the wall');
});

let failed=0;
for(const {name,run} of cases){
  try{run();console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}`);console.error(error.stack);}
}
console.log(`\n${cases.length-failed}/${cases.length} enemy checks passed.`);
if(failed)process.exitCode=1;
