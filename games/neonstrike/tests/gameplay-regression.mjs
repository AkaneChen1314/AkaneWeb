import assert from 'node:assert/strict';
import { createHarness } from './test-harness.mjs';

const cases = [];
function test(name, execute) { cases.push({ name, execute }); }

test('reload uses active gameplay time and never creates spare ammunition', () => {
  const h = createHarness();
  h.run("gameState='playing';ammo=10;reserve=5;reload();updateCombatTimers(1,2000);");
  assert.equal(h.run('reloading'), true);
  assert.equal(h.run('ammo'), 10);
  h.installFrameStubs();
  h.run("gameState='paused';");
  const remaining = h.run('reloadRemaining');
  for (let i = 0; i < 100; i++) h.run('animate(10000);');
  assert.equal(h.run('reloadRemaining'), remaining);
  h.run("gameState='playing';updateCombatTimers(.56,2560);");
  assert.equal(h.run('reloading'), false);
  assert.equal(h.run('ammo'), 15);
  assert.equal(h.run('reserve'), 0);
});

test('wave reinforcement waits through pause, then spawns and supplies exactly once', () => {
  const h = createHarness();
  h.run("gameState='playing';selectedMode=1;matchTotalEnemies=27;reserve=0;armor=0;grenadeCount=1;handleEnemyDefeated();");
  assert.equal(h.run('wavePending'), true);
  assert.equal(h.run('currentWave'), 0);
  h.installFrameStubs();
  h.run("gameState='paused';");
  for (let i = 0; i < 100; i++) h.run('animate(10000);');
  assert.equal(h.run('waveRemaining'), 2.4);
  assert.equal(h.run('enemies.length'), 0);
  h.run("gameState='playing';updateCombatTimers(2.41,3410);");
  assert.equal(h.run('currentWave'), 1);
  assert.equal(h.run('wavePending'), false);
  assert.equal(h.run('enemies.length'), 9);
  assert.equal(h.run('reserve'), 45);
  assert.equal(h.run('armor'), 13);
  assert.equal(h.run('grenadeCount'), 2);
  h.run('updateCombatTimers(5,8410);');
  assert.equal(h.run('enemies.length'), 9);
  assert.equal(h.run('reserve'), 45);
});

test('ended match cannot change its result or accept later damage', () => {
  const h = createHarness();
  h.run("gameState='playing';health=0;createEnemy(0,0,0x556677,0);endGame(false);");
  const title = h.nodes.get('#resultTitle').textContent;
  h.run('endGame(true);damageEnemy(enemies[0],1000,null,false,true);handleEnemyDefeated();');
  assert.equal(h.nodes.get('#resultTitle').textContent, title);
  assert.equal(h.run('gameState'), 'ended');
  assert.equal(h.run('enemies[0].userData.state.alive'), true);
  assert.equal(h.run('kills'), 0);
});

test('spawned enemies avoid the player and real arena collision boxes', () => {
  const h = createHarness();
  h.run('createArena();yaw.position.set(-64,1.68,-61);matchTotalEnemies=18;spawnEnemies(18);');
  assert.equal(h.run('enemies.length'), 18);
  assert.ok(h.run('collisionBoxes.length') > 100);
  assert.equal(h.run('enemies.every(e=>Math.hypot(e.position.x-yaw.position.x,e.position.z-yaw.position.z)>14)'), true);
  assert.equal(h.run('enemies.every(e=>!isBotBlocked(e.position.x,e.position.z,e))'), true);
});

test('three quick kills reward supplies once; expired streak and duplicate kill do not', () => {
  const h = createHarness();
  h.run("gameState='playing';resolvingBlast=true;health=50;armor=10;reserve=100;for(let i=0;i<4;i++)createEnemy(i*5,0,0x556677,i);");
  for (let i = 0; i < 3; i++) {
    h.setNow(1000 + i * 1000);
    h.run(`killEnemy(enemies[${i}],false,true);`);
  }
  assert.equal(h.run('kills'), 3);
  assert.equal(h.run('killStreak'), 3);
  assert.equal(h.run('health'), 62);
  assert.equal(h.run('armor'), 20);
  assert.equal(h.run('reserve'), 115);
  h.setNow(19001);
  h.run('killEnemy(enemies[3],false,true);killEnemy(enemies[3],false,true);');
  assert.equal(h.run('kills'), 4);
  assert.equal(h.run('killStreak'), 1);
  assert.equal(h.run('reserve'), 115);
});

test('operator ability respects caps, cooldown, pause and its operator effect', () => {
  const h = createHarness();
  h.run("gameState='playing';health=90;armor=45;useAbility();");
  assert.equal(h.run('health'), 100);
  assert.equal(h.run('armor'), 50);
  assert.equal(h.run('abilityCooldown'), 28);
  h.run('health=50;useAbility();');
  assert.equal(h.run('health'), 50);
  h.installFrameStubs();
  h.run("gameState='paused';");
  for (let i = 0; i < 100; i++) h.run('animate(10000);');
  assert.equal(h.run('abilityCooldown'), 28);
  h.run("gameState='playing';updateCombatTimers(28,29000);useAbility();");
  assert.equal(h.run('health'), 72);
  h.setNow(30000);
  h.run('selectedOperator=1;abilityCooldown=0;useAbility();');
  assert.equal(h.run('speedBoostUntil'), 38000);
  h.run('selectedOperator=2;abilityCooldown=0;maxArmor=80;armor=60;useAbility();');
  assert.equal(h.run('armor'), 80);
  assert.equal(h.run('damageShieldUntil'), 38000);
});

test('resuming pointer lock preserves buff, pickup, contract and streak time', () => {
  const h = createHarness();
  h.run("setupEvents();gameState='playing';gameStart=1000;matchDeadline=181000;lastKillAt=4000;speedBoostUntil=17000;damageShieldUntil=17000;reloading=true;reloadStarted=4000;pickups.push({active:false,respawnAt:40000});");
  h.setNow(5000);
  h.run('pauseGame();');
  h.setNow(25000);
  h.run('document.pointerLockElement=renderer.domElement;');
  h.dispatchDocument('pointerlockchange');
  assert.equal(h.run('gameState'), 'playing');
  assert.equal(h.run('gameStart'), 21000);
  assert.equal(h.run('matchDeadline'), 201000);
  assert.equal(h.run('lastKillAt'), 24000);
  assert.equal(h.run('speedBoostUntil'), 37000);
  assert.equal(h.run('damageShieldUntil'), 37000);
  assert.equal(h.run('reloadStarted'), 24000);
  assert.equal(h.run('pickups[0].respawnAt'), 60000);
});

test('solid wall blocks blast while an unobstructed target is reachable', () => {
  const h = createHarness();
  h.run('const testWall=new THREE.Mesh(new THREE.BoxGeometry(.5,3,4),new THREE.MeshStandardMaterial());testWall.position.set(0,1.5,0);scene.add(testWall);worldMeshes.push(testWall);scene.updateMatrixWorld(true);');
  assert.equal(h.run('blastReaches(new THREE.Vector3(-3,.7,0),new THREE.Vector3(3,1.68,0))'), false);
  h.run('worldMeshes.length=0;');
  assert.equal(h.run('blastReaches(new THREE.Vector3(-3,.7,0),new THREE.Vector3(3,1.68,0))'), true);
});

test('shooting floating enemy UI cannot damage the body; aiming at the body can', () => {
  const h = createHarness();
  h.run("gameState='playing';createEnemy(0,0,0x556677,0);pitch=new THREE.Group();weapon=new THREE.Group();const testFlash=new THREE.Object3D();testFlash.name='flash';weapon.add(testFlash);muzzleAnchor=new THREE.Object3D();weapon.add(muzzleAnchor);camera.add(weapon);muzzleFlash=new THREE.PointLight();scene.add(camera);camera.position.set(0,1.28,10);camera.lookAt(0,1.28,0);scene.updateMatrixWorld(true);shoot(1000);");
  assert.equal(h.run('enemies[0].userData.state.health'), 65);
  assert.equal(h.run('hits'), 1);
  h.run('camera.position.set(0,2.52,10);camera.lookAt(0,2.52,0);scene.updateMatrixWorld(true);shoot(2000);');
  assert.equal(h.run('enemies[0].userData.state.health'), 65);
  assert.equal(h.run('hits'), 1);
  assert.equal(h.run('ammo'), 28);
});

test('removed supply types cannot spawn or collect; remaining supplies have distinct models',()=>{
  const h=createHarness();
  assert.deepEqual(Array.from(h.run('Object.keys(pickupTypes)')),['medkit','armor','ammo','grenade']);
  assert.equal(h.run("pickupPlacements.some(([type])=>type==='stim'||type==='cache')"),false);
  assert.equal(h.run("canUsePickup('stim',1000)||canUsePickup('cache',1000)"),false);
  h.run("createPickups();health=99;maxHealth=100;gameState='playing';");
  assert.equal(h.run('pickups.length'),16);
  assert.ok(h.run("pickups.find(item=>item.type==='medkit').model.children.length")>15);
  assert.ok(h.run("pickups.find(item=>item.type==='grenade').model.children.length")>7);
  assert.equal(h.run("collectPickup(pickups.find(item=>item.type==='medkit'),1000)"),true);
  assert.equal(h.run('health'),100);
});

test('grenade hold previews without spending stock; release throws once and pause cancels',()=>{
  const h=createHarness();h.run("setupEvents();createGrenadePreview();gameState='playing';grenadeCount=2;");
  const key={code:'KeyG',repeat:false,preventDefault(){}};
  h.dispatchGlobal('keydown',key);
  assert.equal(h.run('grenadeAiming'),true);assert.equal(h.run('grenadeCount'),2);
  h.run('updateGrenadePreview(1000,true);');
  assert.equal(h.run('grenadePreview.group.visible'),true);
  h.dispatchGlobal('keyup',key);
  assert.equal(h.run('grenadeAiming'),false);assert.equal(h.run('grenadeCount'),1);assert.equal(h.run('grenades.length'),1);
  h.dispatchGlobal('keydown',key);h.run('pauseGame();');h.dispatchGlobal('keyup',key);
  assert.equal(h.run('grenadeCount'),1);assert.equal(h.run('grenadePreview.group.visible'),false);
});

test('left click cancels a held grenade without spending stock or firing on release',()=>{
  const h=createHarness();h.run("setupEvents();createGrenadePreview();gameState='playing';grenadeCount=2;");
  const key={code:'KeyG',repeat:false,preventDefault(){}};
  h.dispatchGlobal('keydown',key);h.dispatchGlobal('mousedown',{button:0});
  assert.equal(h.run('grenadeAiming'),false);assert.equal(h.run('mouseDown'),false);
  h.dispatchGlobal('keyup',key);
  assert.equal(h.run('grenadeCount'),2);assert.equal(h.run('grenades.length'),0);
  assert.equal(h.run('ammo'),30);assert.equal(h.run('shots'),0);
  assert.equal(h.run('grenadePreview.group.visible'),false);
  assert.equal(h.run('grenadePreview.line.geometry.drawRange.count'),0);
});

test('grenade blast uses the actual projectile location and frozen grenades stop spinning',()=>{
  const h=createHarness();
  h.run("gameState='playing';scene.add(camera);yaw.position.set(0,1.68,50);const resting=createGrenadeModel();const restingMotion=createGrenadeMotion({x:0,y:1.68,z:0},{x:0,y:0,z:0});restingMotion.position={x:0,y:.13,z:0};restingMotion.velocity={x:0,y:0,z:0};restingMotion.grounded=true;resting.position.copy(restingMotion.position);scene.add(resting);grenades.push({mesh:resting,motion:restingMotion});updateGrenades(.1);");
  assert.equal(h.run('grenades[0].mesh.rotation.x'),0);assert.equal(h.run('grenades[0].mesh.rotation.z'),0);
  h.run('updateGrenades(2);');
  assert.equal(h.run('grenades.length'),0);assert.equal(h.run('explosions.length'),1);
  assert.ok(Math.abs(h.run('explosions[0].fireball.position.y')-.13)<1e-7,'grenade blast cannot inherit the barrel height offset');
});

test('high airbursts respect vertical blast distance and cannot scorch the distant ground',()=>{
  const h=createHarness();
  h.run("gameState='playing';yaw.position.set(0,1.68,0);createEnemy(0,0,0x556677,0);const highGrenade=new THREE.Group();highGrenade.position.set(0,15,0);explodeBarrel(highGrenade,'grenade');");
  assert.equal(h.run('health'),100);assert.equal(h.run('armor'),50);
  assert.equal(h.run('enemies[0].userData.state.health'),100);
  assert.equal(h.run('bulletDecals.length'),0,'an airburst leaves no ground scorch mark');
  h.run("const lowGrenade=new THREE.Group();lowGrenade.position.set(0,.13,0);lowGrenade.userData.surfaceY=.01;explodeBarrel(lowGrenade,'grenade');");
  assert.ok(h.run('health')<100,'a close unobstructed grenade still damages the player');
  assert.equal(h.run('bulletDecals.length'),1);
});

test('kill feedback distinguishes headshots and caps recent kills at three',()=>{
  const h=createHarness();h.run("kills=4;killStreak=2;matchTotalEnemies=12;defeatedEnemies=4;showKillFeedback('ALPHA',true);showKillFeedback('BETA',false);showKillFeedback('GAMMA',false);showKillFeedback('DELTA',false);");
  assert.equal(h.nodes.get('#killFeed').children.length,3);
  assert.equal(h.run("ui.killNotice.classList.contains('visible')"),true);
  assert.equal(h.run("ui.killNotice.querySelector('strong').textContent"),'2 連殺');
  assert.match(h.run("ui.killNotice.querySelector('p').textContent"),/剩餘 8/);
  h.run("showKillFeedback('ECHO',true);");
  assert.equal(h.run("ui.killNotice.classList.contains('headshot')"),true);
  assert.equal(h.run("ui.killNotice.querySelector('strong').textContent"),'爆頭擊殺');
});

test('ADS zoom aligns the complete rifle while its optic mount stays attached',()=>{
  const h=createHarness();
  h.run("scene.add(camera);camera.position.set(0,1.68,0);createWeapon();aiming=true;for(let i=0;i<60;i++)updateWeaponPose(1/60,i*16);scene.updateMatrixWorld(true);");
  assert.ok(Math.abs(h.run('camera.fov')-54)<.1);
  assert.equal(h.run('opticGroup.position.y'),.225);
  assert.ok(h.run('new THREE.Box3().setFromObject(weapon.getObjectByName("optic-mount")).intersectsBox(new THREE.Box3().setFromObject(weapon.getObjectByName("rail")))'));
  const center=h.run('opticGroup.getWorldPosition(new THREE.Vector3()).project(camera).toArray()');
  assert.ok(Math.abs(center[0])<.002&&Math.abs(center[1])<.002,'optic center must align with the camera reticle');
});

test('point-blank solid cover retracts the rifle and exits ADS without disabling fire',()=>{
  const h=createHarness();
  h.run("scene.add(camera);pitch=new THREE.Group();camera.position.set(0,1.68,0);createWeapon();addBox(0,2,-.55,4,4,.1,0x444444);aiming=true;gameState='playing';for(let i=0;i<30;i++)updateWeaponPose(1/60,i*16);shoot(2000);");
  assert.equal(h.run('weaponObstructed'),true);
  assert.equal(h.run('ammo'),29);
  assert.equal(h.run('shots'),1);
  assert.ok(h.run('wallPoseAmount')>.5);
  assert.ok(h.run('adsAmount')<.01);
  assert.equal(h.run('findWeaponClearance(new THREE.Vector3(0,1.68,0),new THREE.Vector3(0,0,1))'),1.85,'cover behind the player cannot block the rifle');
  h.run('collisionBoxes.length=0;worldMeshes.length=0;for(let i=0;i<60;i++)updateWeaponPose(1/60,3000+i*16);shoot(5000);');
  assert.equal(h.run('weaponObstructed'),false);
  assert.ok(h.run('adsAmount')>.995,'backing away restores ADS');
  assert.equal(h.run('ammo'),28,'firing continues after leaving cover');
});

test('empty magazine starts automatic reload and held trigger resumes without R',()=>{
  const h=createHarness();
  h.run("scene.add(camera);createWeapon();pitch=new THREE.Group();gameState='playing';ammo=1;reserve=35;mouseDown=true;shoot(1000);");
  assert.equal(h.run('ammo'),0);
  assert.equal(h.run('reloading'),true);
  assert.equal(h.run('mouseDown'),true,'automatic reload preserves a held trigger');
  assert.equal(h.run('reserve'),35,'spare ammo moves only when loading completes');
  h.run('shoot(1100);');
  assert.equal(h.run('shots'),1,'no dry firing or shot is emitted during automatic loading');
  h.run('updateCombatTimers(2,4000);');
  assert.equal(h.run('ammo'),30);assert.equal(h.run('reserve'),5);assert.equal(h.run('reloading'),false);
  h.run('updatePlayer(1/60,4010);');
  assert.equal(h.run('ammo'),29,'holding fire resumes on the next gameplay update');
});

test('automatic reload respects partial reserves and does not create ammo',()=>{
  const h=createHarness();
  h.run("scene.add(camera);createWeapon();pitch=new THREE.Group();gameState='playing';ammo=1;reserve=4;shoot(1000);updateCombatTimers(2,4000);");
  assert.equal(h.run('ammo'),4);assert.equal(h.run('reserve'),0);
  h.run('ammo=1;shoot(5000);');
  assert.equal(h.run('ammo'),0);assert.equal(h.run('reloading'),false);
  assert.match(h.run('ui.reload.textContent'),/備彈用盡/);
});

test('reload sounds follow magazine and bolt stages once and freeze during pause',()=>{
  const h=createHarness();
  h.run("const reloadSounds=[];playReloadSound=stage=>reloadSounds.push(stage);gameState='playing';ammo=12;reserve=50;reload();updateCombatTimers(.4,1400);");
  assert.deepEqual(Array.from(h.run('reloadSounds')),['release']);
  h.run('updateCombatTimers(.5,1900);');
  assert.deepEqual(Array.from(h.run('reloadSounds')),['release','insert']);
  h.installFrameStubs();h.run("gameState='paused';");
  for(let i=0;i<100;i++)h.run('animate(9000);');
  assert.equal(h.run('reloadSounds.length'),2);
  h.run("gameState='playing';updateCombatTimers(.5,2400);updateCombatTimers(.3,2700);");
  assert.deepEqual(Array.from(h.run('reloadSounds')),['release','insert','bolt']);
  h.run('ammo=0;reload(true);');
  assert.equal(h.run('reloadSounds.at(-1)'),'release','automatic reload uses the same sound sequence');
});

test('weapon audio emits rifle and casing layers, caches impacts and releases nodes',()=>{
  const h=createHarness();
  h.run(`
    const audioNodes=[],audioStarts=[];let allocatedAudioBuffers=0;
    function audioNode(kind){const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});const node={kind,gain:parameter(),frequency:parameter(),Q:parameter(),pan:parameter(),playbackRate:parameter(),connect(next){return next;},disconnect(){this.disconnected=true;},start(){audioStarts.push(this);},stop(){}};audioNodes.push(node);return node;}
    audioContext={sampleRate:8000,currentTime:1,createBuffer(channels,length){allocatedAudioBuffers++;const samples=new Float32Array(length);return {getChannelData(){return samples;}};},createBufferSource(){return audioNode('source');},createGain(){return audioNode('gain');},createBiquadFilter(){return audioNode('filter');},createStereoPanner(){return audioNode('panner');},createOscillator(){return audioNode('oscillator');}};
    audioMaster=audioNode('master');soundBuffers={rifle0:{name:'rifle0'},rifle1:{name:'rifle1'},shell:{name:'shell'},tail:{name:'tail'}};
    playGunshot();playReloadSound('release');playReloadSound('insert');playReloadSound('bolt');playReloadSound('release');
  `);
  assert.equal(h.run("audioStarts.filter(node=>node.buffer?.name?.startsWith('rifle')).length"),1);
  assert.ok(h.run("audioStarts.filter(node=>node.buffer?.name==='shell').length")>=4);
  assert.equal(h.run('allocatedAudioBuffers'),4,'shot transient and three reload impacts are reused');
  assert.ok(h.run("Object.values(mechanicalBuffers).every(buffer=>Array.from(buffer.getChannelData(0)).every(Number.isFinite)&&buffer.getChannelData(0).some(value=>Math.abs(value)>.01))"));
  h.run('audioStarts.forEach(node=>node.onended?.());');
  assert.equal(h.run("audioNodes.filter(node=>node.kind!=='master').every(node=>node.disconnected)"),true);
});

test('world and foreground rifle use isolated depth passes and restore render state',()=>{
  const h=createHarness();
  h.run("const renderPasses=[];scene.background=new THREE.Color(0x102030);const savedBackground=scene.background;renderer.render=(s,c)=>renderPasses.push({mask:c.layers.mask,background:s.background,shadows:renderer.shadowMap.autoUpdate});renderFrame();");
  assert.equal(h.run('renderPasses.length'),2);
  assert.equal(h.run('renderPasses[0].mask'),1);
  assert.equal(h.run('renderPasses[1].mask'),2);
  assert.equal(h.run('renderPasses[1].background'),null);
  assert.equal(h.run('renderPasses[1].shadows'),false);
  assert.equal(h.run('scene.background===savedBackground'),true);
  assert.equal(h.run('renderer.shadowMap.autoUpdate'),true);
  assert.equal(h.run('camera.layers.mask'),1);
});

test('encounter settings validate stored values and compose fair mode objectives',()=>{
  const h=createHarness();
  h.run("missionSettings=normalizeMissionSettings({enemyCount:999,enemyPower:NaN,eliteRate:-1,bossFinale:'true'});");
  assert.equal(h.run('missionSettings.enemyCount'),0);assert.equal(h.run('missionSettings.enemyPower'),1);assert.equal(h.run('missionSettings.eliteRate'),.15);assert.equal(h.run('missionSettings.bossFinale'),false);
  h.run('selectedMode=1;missionSettings=normalizeMissionSettings({enemyCount:30,enemyPower:1.5,eliteRate:.3,bossFinale:true});');
  assert.deepEqual(Array.from(h.run('currentMode().waves')),[20,25,30]);assert.equal(h.run('encounterTotal()'),76);
  h.run('selectedMode=2;missionSettings.enemyCount=6;');
  assert.equal(h.run('currentMode().killTarget'),6);assert.equal(h.run('currentMode().bossEnabled'),false);assert.equal(h.run('encounterTotal()'),6);
  h.run('selectedMode=3;missionSettings.eliteRate=0;');
  assert.equal(h.run('currentMode().bossEnabled'),true);assert.equal(h.run('getModeEliteRate()'),.25);assert.equal(h.run('encounterTotal()'),7);
  h.run('updateModePreview();');assert.equal(h.nodes.get('#eliteSelect').value,'0.25','dropdown must show the effective Warlord elite rate');
});

test('lobby controls persist configuration and cannot change a running encounter',()=>{
  const h=createHarness();h.run('setupEvents();');
  h.nodes.get('#enemyCountSelect').value='6';h.nodes.get('#enemyCountSelect').dispatch('change');
  h.nodes.get('#enemyPowerSelect').value='1.25';h.nodes.get('#enemyPowerSelect').dispatch('change');
  assert.equal(h.run('currentMode().enemyCount'),6);assert.equal(JSON.parse(h.storage.get('neonEncounter')).enemyPower,1.25);
  h.run('initAudio=()=>{};loadAudioAssets=()=>{};requestLock=()=>{};startGame();');
  h.nodes.get('#enemyCountSelect').value='30';h.nodes.get('#enemyCountSelect').dispatch('change');
  h.run('missionSettings.enemyCount=24;missionSettings.enemyPower=.8;');
  assert.equal(h.run('currentMode().enemyCount'),6);assert.equal(h.run('getEnemyTuning().health'),1.25);
  assert.equal(h.run('matchTotalEnemies'),6);
});

test('warlord guards lead to one supplied boss finale and victory waits for the boss',()=>{
  const h=createHarness();
  h.run("selectedMode=3;missionSettings=normalizeMissionSettings({enemyCount:6,eliteRate:.3});initAudio=()=>{};loadAudioAssets=()=>{};requestLock=()=>{};startGame();");
  assert.equal(h.run('matchTotalEnemies'),7);assert.equal(h.run('enemies.length'),6);assert.equal(h.run("enemies.filter(e=>e.userData.state.rank==='elite').length"),2);
  h.run("enemies.forEach(enemy=>enemy.userData.state.alive=false);defeatedEnemies=6;kills=6;health=25;armor=0;reserve=0;grenadeCount=0;handleEnemyDefeated();");
  assert.equal(h.run('gameState'),'playing');assert.equal(h.run('bossArrivalQueued'),true);
  h.run('updateCombatTimers(1,2000);handleEnemyDefeated();');
  assert.ok(Math.abs(h.run('bossArrivalRemaining')-2.2)<1e-7,'repeated completion checks cannot restart the countdown');
  h.run('updateCombatTimers(2.3,4300);');
  assert.equal(h.run('enemies.length'),7);assert.equal(h.run('bossPending'),false);assert.equal(h.run('health'),60);assert.equal(h.run('armor'),25);assert.equal(h.run('reserve'),75);assert.equal(h.run('grenadeCount'),1);
  h.run('updateCombatTimers(4,8300);');assert.equal(h.run('enemies.length'),7,'boss spawns exactly once');assert.equal(h.run('reserve'),75,'pre-boss supply is granted exactly once');
  h.run("const finalBoss=enemies.find(e=>e.userData.state.rank==='boss');queueBossAttack(finalBoss,yaw.position);damageEnemy(finalBoss,10000,null,true,false,true);");
  assert.equal(h.run('gameState'),'ended');assert.equal(h.run('defeatedEnemies'),7);assert.equal(h.run('bossAttacks.length'),0);
  assert.equal(h.nodes.get('#resultTitle').textContent,'指揮官已擊敗');
});

test('boss telegraph freezes through pause, locks its target and can be escaped',()=>{
  const h=createHarness();h.run("gameState='playing';yaw.position.set(0,1.68,0);const castingBoss=createEnemy(10,0,0x444444,0,'boss');queueBossAttack(castingBoss,yaw.position);");
  assert.equal(h.run('bossAttacks.length'),1);h.run("gameState='paused';updateBossAttacks(1,2000);");
  assert.equal(h.run('bossAttacks[0].remaining'),1.4);
  h.run("gameState='playing';yaw.position.x=5;updateBossAttacks(1.5,3500);");
  assert.equal(h.run('bossAttacks[0].position.x'),0,'warning remains at the original target');assert.equal(h.run('health'),100);assert.equal(h.run('armor'),50);
  h.run('updateBossAttacks(.3,3800);');assert.equal(h.run('bossAttacks.length'),0);
});

test('boss strike deals damage once and thick cover blocks it',()=>{
  const h=createHarness();h.run("gameState='playing';yaw.position.set(1,1.68,0);const strikeBoss=createEnemy(10,0,0x444444,0,'boss');const targetPoint=new THREE.Vector3(0,0,0);queueBossAttack(strikeBoss,targetPoint);updateBossAttacks(1.41,2410);");
  assert.ok(h.run('health')<100);const health=h.run('health');h.run('updateBossAttacks(.1,2510);');assert.equal(h.run('health'),health);
  const covered=createHarness();covered.run("gameState='playing';yaw.position.set(1,1.68,0);const coverBoss=createEnemy(10,0,0x444444,0,'boss');const cover=new THREE.Mesh(new THREE.BoxGeometry(.1,3,4),new THREE.MeshBasicMaterial());cover.position.set(.5,1.5,0);scene.add(cover);worldMeshes.push(cover);scene.updateMatrixWorld(true);queueBossAttack(coverBoss,new THREE.Vector3(0,0,0));updateBossAttacks(1.5,2500);");
  assert.equal(covered.run('health'),100);assert.equal(covered.run('armor'),50);
});

test('lethal boss strike clears other pending strikes without post-match damage',()=>{
  const h=createHarness();h.run("gameState='playing';health=1;armor=0;yaw.position.set(0,1.68,0);const b1=createEnemy(10,0,0x444444,0,'boss'),b2=createEnemy(-10,0,0x444444,1,'boss');queueBossAttack(b1,yaw.position);queueBossAttack(b2,yaw.position);updateBossAttacks(1.5,2500);");
  assert.equal(h.run('gameState'),'ended');assert.equal(h.run('health'),0);assert.equal(h.run('bossAttacks.length'),0);assert.equal(h.nodes.get('#resultTitle').textContent,'幹員已陣亡');
});

test('ammo supplies automatically load an empty weapon after reserves were exhausted',()=>{
  const h=createHarness();h.run("createPickups();gameState='playing';ammo=0;reserve=0;mouseDown=true;collectPickup(pickups.find(item=>item.type==='ammo'),1000);");
  assert.equal(h.run('reloading'),true);assert.equal(h.run('mouseDown'),true);assert.equal(h.run('reserve'),60);
  h.run('updateCombatTimers(2,3000);');assert.equal(h.run('ammo'),30);assert.equal(h.run('reserve'),30);
});

test('wave, streak and boss supplies never remove already stocked ammo or grenades',()=>{
  const h=createHarness();h.run("gameState='playing';selectedMode=1;reserve=235;grenadeCount=4;wavePending=true;waveRemaining=.1;updateCombatTimers(.2,1200);");
  assert.equal(h.run('reserve'),240);assert.equal(h.run('grenadeCount'),4);
  h.run("resolvingBlast=true;killStreak=2;lastKillAt=900;createEnemy(60,60,0x555555,20);killEnemy(enemies.at(-1),false,true);");
  assert.equal(h.run('reserve'),240,'a streak reward cannot lower a full reserve');
  h.run('bossArrivalQueued=true;bossArrivalRemaining=.1;bossPending=true;updateCombatTimers(.2,1400);');
  assert.equal(h.run('reserve'),240);assert.equal(h.run('grenadeCount'),4);
});

test('pause volume and quality controls stay synchronized with the lobby and preserve combat setup',()=>{
  const h=createHarness();h.run("devicePixelRatio=2;innerWidth=1024;innerHeight=768;renderer.setPixelRatio=value=>renderer.testPixelRatio=value;renderer.setSize=()=>{};setupEvents();gameState='paused';");
  h.nodes.get('#pauseVolumeControl').value='0';h.nodes.get('#pauseVolumeControl').dispatch('input');
  assert.equal(h.run('masterVolume'),0);assert.equal(h.nodes.get('#volumeControl').value,'0');assert.equal(h.storage.get('neonVolume'),'0');
  h.nodes.get('#pauseQualitySelect').value='2';h.nodes.get('#pauseQualitySelect').dispatch('change');
  assert.equal(h.run('renderer.testPixelRatio'),1);assert.equal(h.run('renderer.shadowMap.enabled'),false);assert.equal(h.nodes.get('#qualitySelect').value,'2');
  assert.equal(h.run('gameState'),'paused');assert.equal(h.run('missionSettings.enemyCount'),0);
  h.run('setGameVolume(NaN);');assert.equal(h.run('masterVolume'),.72);
});

let failed = 0;
for (const { name, execute } of cases) {
  try {
    execute();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error.stack);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} gameplay regression checks passed.`);
if (failed) process.exitCode = 1;
