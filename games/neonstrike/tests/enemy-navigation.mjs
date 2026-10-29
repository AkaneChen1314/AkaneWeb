import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

const h=createHarness();
h.run(`gameState='playing'; yaw.position.set(60,1.68,60); createEnemy(0,-4,0x556677,0); const bot=enemies[0],state=bot.userData.state;
  state.speed=3;state.avoidSide=1;
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-5,0,-.2),new THREE.Vector3(5,3,.2)));
  for(let i=0;i<800;i++){
    const dx=-bot.position.x,dz=4-bot.position.z,dist=Math.hypot(dx,dz);
    if(dist<.7)break;moveBot(bot,dx/dist,dz/dist,.05);
  }`);
assert.ok(h.run('Math.hypot(bot.position.x,bot.position.z-4)')<1,'bot must route around the long wall to its destination');
assert.equal(h.run('isBotBlocked(bot.position.x,bot.position.z,bot)'),false,'bot must remain outside solid cover');
console.log('PASS enemy follows the edge of a long wall and reaches its target');

const s=createHarness();
s.run(`gameState='playing';yaw.position.set(60,1.68,60);createEnemy(0,0,0x556677,0);const bot=enemies[0],state=bot.userData.state;
  state.state='ENGAGE';state.cachedCanSee=false;state.losTimer=0;hasLineOfSight=()=>false;
  for(let i=0;i<270;i++)updateEnemies(.05,1000+i*50);`);
assert.equal(s.run('state.state'),'PATROL','an unreachable last known location must not keep the enemy searching forever');
console.log('PASS unreachable search expires and the enemy resumes patrol');

const hit=createHarness();
hit.run(`gameState='playing';yaw.position.set(15,1.68,0);createEnemy(0,0,0,0);
  const bot=enemies[0],state=bot.userData.state;hasLineOfSight=()=>false;
  damageEnemy(bot,10,null,false,false,true);`);
assert.equal(hit.run('state.state'),'SEARCH','a hit from an unseen player starts a search');
assert.equal(hit.run('state.searchTime'),12,'the enemy has time to investigate');
hit.run('updateEnemies(.05,1000);');
assert.equal(hit.run('state.state'),'SEARCH','the search must not expire on the next update');
hit.run('state.searchTime=1;damageEnemy(bot,10,null,false,false,true);');
assert.equal(hit.run('state.searchTime'),12,'a fresh hit refreshes the search');
assert.equal(hit.run('state.lastKnown.x'),15,'the last known location follows the attacker');
console.log('PASS unseen player damage starts and refreshes enemy investigation');

const p=createHarness();
p.run(`yaw.position.set(60,1.68,60);createEnemy(0,0,0x556677,0);const bot=enemies[0],state=bot.userData.state;
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(1,0,-20),new THREE.Vector3(1.2,3,20)));
  for(let i=0;i<100;i++){pickPatrolPoint(bot);if(state.target.x>1)throw Error('patrol target crossed wall');}`);
console.log('PASS patrol destinations remain on reachable local routes');

const arrived=createHarness();
arrived.run(`gameState='playing';yaw.position.set(60,1.68,60);createEnemy(0,0,0,0);const state=enemies[0].userData.state;
  hasLineOfSight=()=>false;state.patrolTimer=7;state.patrolWaiting=false;let picks=0;pickPatrolPoint=()=>{picks++;};updateEnemies(.05,1000);`);
assert.equal(arrived.run('picks'),1,'a bot that reaches its destination immediately requests another route');
arrived.run('picks=0;state.patrolWaiting=true;state.patrolTimer=1;updateEnemies(.05,1050);');
assert.equal(arrived.run('picks'),0,'failed searches wait briefly to avoid repeating expensive attempts each frame');
console.log('PASS reached patrol points are refreshed without a long idle');

const u=createHarness();
u.run(`yaw.position.set(60,1.68,60);createEnemy(0,0,0,0);const bot=enemies[0],state=bot.userData.state;state.speed=3;state.avoidSide=1;
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-3,0,-3),new THREE.Vector3(3,3,-2.8)));
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-3,0,-3),new THREE.Vector3(-2.8,3,3)));
  collisionBoxes.push(new THREE.Box3(new THREE.Vector3(2.8,0,-3),new THREE.Vector3(3,3,3)));
  for(let i=0;i<1600;i++){let dx=-bot.position.x,dz=-8-bot.position.z,d=Math.hypot(dx,dz);if(d<1)break;moveBot(bot,dx/d,dz/d,.05);}`);
assert.ok(u.run('Math.hypot(bot.position.x,bot.position.z+8)')<1.1,`bot should escape U-shaped cover, got ${u.run('[bot.position.x,bot.position.z]')}`);
console.log('PASS enemy can escape a U-shaped obstacle');

const crowd=createHarness();
crowd.run(`yaw.position.set(60,1.68,60);createEnemy(-2,0,0,0);createEnemy(2,0,0,1);
  const a=enemies[0],b=enemies[1];a.userData.state.speed=b.userData.state.speed=3;
  a.userData.state.avoidSide=1;b.userData.state.avoidSide=-1;
  for(let i=0;i<200;i++){moveBot(a,1,0,.05);moveBot(b,-1,0,.05);
    if(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<.71)throw Error('bots overlap');}`);
assert.ok(crowd.run('a.position.x')>1&&crowd.run('b.position.x')< -1,`both enemies move past the obstruction: ${crowd.run('[a.position.x,a.position.z,b.position.x,b.position.z]')}`);
console.log('PASS opposing enemies separate instead of blocking each other');

const many=createHarness();
many.run(`gameState='playing';createArena();spawnEnemies(30,{eliteRate:.3});hasLineOfSight=()=>false;
  const initial=enemies.map(enemy=>enemy.position.clone());
  let calls=0,mostCalls=0;const actualPick=pickPatrolPoint;
  pickPatrolPoint=enemy=>{calls++;actualPick(enemy);};
  for(let i=0;i<240;i++){calls=0;updateEnemies(.05,1000+i*50);mostCalls=Math.max(mostCalls,calls);}`);
assert.ok(many.run('mostCalls')<=1,'at most one enemy evaluates patrol candidates per frame');
assert.ok(many.run('enemies.every(enemy=>!isBotBlocked(enemy.position.x,enemy.position.z,enemy))'),'many enemies remain outside cover and one another');
assert.ok(many.run('enemies.filter((enemy,index)=>enemy.position.distanceTo(initial[index])>1).length')>=20,'most of the crowd should make patrol progress');
console.log('PASS 30-enemy waypoint searches are distributed across frames');
