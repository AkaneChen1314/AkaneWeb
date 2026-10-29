import assert from 'node:assert/strict';
import { createHarness, THREE } from './test-harness.mjs';

const cases=[];
const test=(name,execute)=>cases.push({name,execute});
const close=(actual,expected,label,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);

test('10 FPS consumes elapsed combat time in bounded active substeps',()=>{
  const h=createHarness();h.installFrameStubs();
  h.run(`
    let consumed=0,bossConsumed=0,largestStep=0;
    updateCombatTimers=dt=>consumed+=dt;
    updateBossAttacks=dt=>bossConsumed+=dt;
    updatePlayer=dt=>largestStep=Math.max(largestStep,dt);
    clock={getDelta(){return .1;}};gameState='playing';
    for(let i=0;i<18;i++)animate(1000+i*100);
  `);
  close(h.run('consumed'),1.8,'combat time');
  close(h.run('bossConsumed'),1.8,'Boss attack time');
  assert.ok(h.run('largestStep')<=.05,'movement steps cannot exceed the collision-safe interval');
});

test('real reload and grenade fuse retain their duration at 10 FPS',()=>{
  const h=createHarness();h.run('const liveGrenadeUpdate=updateGrenades;');h.installFrameStubs();
  h.run(`
    let detonations=0;updateGrenades=liveGrenadeUpdate;explodeBarrel=()=>detonations++;
    updateBossAttacks=()=>{};clock={getDelta(){return .1;}};gameState='playing';
    ammo=0;reserve=30;reloading=true;reloadDuration=1.55;reloadRemaining=1.55;
    const frag=createGrenadeModel();scene.add(frag);
    grenades.push({mesh:frag,motion:createGrenadeMotion({x:0,y:1.68,z:0},{x:0,y:0,z:-1})});
    for(let i=0;i<17;i++)animate(1000+i*100);
  `);
  assert.equal(h.run('ammo'),30);assert.equal(h.run('reserve'),0);assert.equal(h.run('reloading'),false);
  assert.equal(h.run('detonations'),0,'a 1.75 second fuse must survive 1.7 seconds');
  assert.equal(h.run('grenades.length'),1);
  h.run('animate(2800);');
  assert.equal(h.run('detonations'),1,'detonation occurs on the next 1.8 second render boundary');
  assert.equal(h.run('grenades.length'),0);
});

test('paused frames cannot advance reload, grenade or Boss attack simulation',()=>{
  const h=createHarness();h.installFrameStubs();
  h.run(`
    let grenadeElapsed=0,bossElapsed=0;
    updateGrenades=dt=>grenadeElapsed+=dt;updateBossAttacks=dt=>bossElapsed+=dt;
    clock={getDelta(){return .1;}};gameState='paused';reloading=true;reloadDuration=1.55;reloadRemaining=1.3;abilityCooldown=12;
    for(let i=0;i<100;i++)animate(1000+i*100);
  `);
  assert.equal(h.run('reloadRemaining'),1.3);assert.equal(h.run('abilityCooldown'),12);
  assert.equal(h.run('grenadeElapsed'),0);assert.equal(h.run('bossElapsed'),0);
});

test('a stalled frame pauses safely and excludes the stall from mission clocks',()=>{
  const h=createHarness();h.installFrameStubs();h.setNow(1600);
  h.run(`
    gameState='playing';gameStart=1000;matchDeadline=181000;lastKillAt=900;
    speedBoostUntil=7000;damageShieldUntil=8000;reloading=true;reloadDuration=1.55;reloadRemaining=1;
    clock={getDelta(){return .6;}};animate(1600);
  `);
  assert.equal(h.run('gameState'),'paused');assert.equal(h.run('pauseStarted'),1000);
  assert.equal(h.run('reloadRemaining'),1,'a stalled frame does not finish the reload');
  h.setNow(2100);h.run('resumeGame();');
  assert.equal(h.run('gameStart'),2100);assert.equal(h.run('matchDeadline'),182100);
  assert.equal(h.run('lastKillAt'),2000);assert.equal(h.run('speedBoostUntil'),8100);
  assert.equal(h.run('damageShieldUntil'),9100);
});

test('resuming flushes a suppressed hidden-tab frame instead of pausing again',()=>{
  const h=createHarness();h.installFrameStubs();h.setNow(2000);
  h.run(`
    let pendingGap=5,clockSamples=0;
    clock={getDelta(){clockSamples++;const elapsed=pendingGap;pendingGap=0;return elapsed;}};
    gameState='paused';pauseStarted=1000;gameStart=1000;matchDeadline=181000;
    resumeGame();animate(2000);
  `);
  assert.equal(h.run('gameState'),'playing');
  assert.equal(h.run('clockSamples'),2,'resume must drain the clock before the first active frame');
  assert.equal(h.run('gameStart'),2000);assert.equal(h.run('matchDeadline'),182000);
});

test('pressing against solid cover produces no phantom motion or footsteps',()=>{
  const h=createHarness();h.run(`
    scene.add(camera);createWeapon();yaw.position.set(0,1.68,1);keys.KeyW=true;
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-2,0,.48),new THREE.Vector3(2,4,.5)));
    updatePlayer(.05,2000);
  `);
  assert.equal(h.run('playerMoving'),0);assert.equal(h.run('lastFootstep'),0);
  assert.equal(h.run('yaw.position.z'),1);
});

test('a long sprint displacement cannot skip a thin fence',()=>{
  const h=createHarness();h.run(`
    scene.add(camera);createWeapon();yaw.position.set(0,1.68,2);keys.KeyW=true;keys.ShiftLeft=true;
    speedBoostUntil=10000;
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-2,0,-.04),new THREE.Vector3(2,4,0)));
    updatePlayer(.5,3000);
  `);
  assert.ok(h.run('yaw.position.z')>=.48,'player radius must remain on the original side of the fence');
});

test('jumping stops below a ceiling and falling lands on compatible low cover',()=>{
  const h=createHarness();h.run(`
    scene.add(camera);createWeapon();yaw.position.set(0,1.68,0);verticalVelocity=5;grounded=false;
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-2,2,-2),new THREE.Vector3(2,2.2,2)));
    updatePlayer(.1,2000);
  `);
  assert.ok(h.run('yaw.position.y+.06')<=2.00001);assert.equal(h.run('verticalVelocity'),0);
  h.run(`
    collisionBoxes.length=0;
    collisionBoxes.push(new THREE.Box3(new THREE.Vector3(-2,0,-2),new THREE.Vector3(2,1,2)));
    yaw.position.set(0,3.4,0);verticalVelocity=-4;updatePlayer(.2,2200);
  `);
  close(h.run('yaw.position.y'),2.68,'eye height on raised cover');
  assert.equal(h.run('grounded'),true);
  h.run('collisionBoxes.length=0;updatePlayer(.1,2300);');
  assert.ok(h.run('yaw.position.y')<2.68,'removing support must start a fall');
  assert.equal(h.run('grounded'),false);
});

test('player body spacing respects the larger Boss collision radius',()=>{
  const h=createHarness();h.run("createEnemy(0,0,0x556677,0,'boss');");
  assert.equal(h.run('isPositionBlocked(.95,0)'),true);
  h.run('enemies[0].userData.state.radius=.34;');
  assert.equal(h.run('isPositionBlocked(.95,0)'),false,'ordinary bodies retain the existing spacing');
});

test('tracer and spark budgets reuse geometry without disposing live shared shapes',()=>{
  const h=createHarness();h.run(`
    let disposedGeometry=0;
    for(let i=0;i<100;i++)createTracer(new THREE.Vector3(),new THREE.Vector3(0,0,10),0xffaa00);
    const shared=tracers[0].mesh.geometry;shared.addEventListener('dispose',()=>disposedGeometry++);
  `);
  assert.equal(h.run('tracers.length'),48);assert.equal(h.run('tracers.every(t=>t.mesh.geometry===shared)'),true);
  assert.ok(h.run('shared') instanceof THREE.BufferGeometry);
  h.run('updateEffects(.2);');
  assert.equal(h.run('tracers.length'),0);assert.equal(h.run('disposedGeometry'),0);
  h.run('qualityIndex=2;for(let i=0;i<100;i++)createImpact(new THREE.Vector3());');
  assert.equal(h.run('particles.length'),128,'low quality retains its smaller spark budget');
  h.run('updateEffects(2);');assert.equal(h.run('particles.length'),0);
});

test('simultaneous explosion visuals have a bounded light and mesh lifetime',()=>{
  const h=createHarness();h.run(`
    for(let i=0;i<20;i++){
      const fireball=new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial({transparent:true}));
      const ring=new THREE.Mesh(new THREE.RingGeometry(.2,.3),new THREE.MeshBasicMaterial({transparent:true}));
      const light=new THREE.PointLight();scene.add(fireball,ring,light);
      explosions.push({fireball,ring,light,life:.72,max:.72});
    }
    updateEffects(0);
  `);
  assert.equal(h.run('explosions.length'),10);
  assert.equal(h.run('scene.children.filter(object=>object.isPointLight).length'),10);
  h.run('updateEffects(1);');
  assert.equal(h.run('explosions.length'),0);
  assert.equal(h.run('scene.children.filter(object=>object.isPointLight).length'),0);
});

test('particle drag and smoke expansion do not depend on the render frequency',()=>{
  const atRate=dt=>{
    const h=createHarness();h.run(`
      const smoke=new THREE.Mesh(new THREE.SphereGeometry(.2),new THREE.MeshBasicMaterial({transparent:true}));
      scene.add(smoke);particles.push({mesh:smoke,velocity:new THREE.Vector3(4,0,2),life:2,smoke:true});
    `);
    for(let i=0;i<Math.round(.3/dt);i++)h.run(`updateEffects(${dt});`);
    return {velocity:h.run('particles[0].velocity.x'),scale:h.run('particles[0].mesh.scale.x')};
  };
  const fast=atRate(1/60),slow=atRate(.1);
  close(slow.velocity,fast.velocity,'horizontal smoke drag');close(slow.scale,fast.scale,'smoke expansion');
});

test('shadow throttling retains per-frame layer-1 muzzle flashes and restores render state',()=>{
  const h=createHarness();h.run(`
    scene.add(camera);createWeapon();scene.background=new THREE.Color(0x102030);const originalBackground=scene.background;
    weapon.getObjectByName('flash').visible=true;muzzleFlash.intensity=7;const renders=[];
    renderer.render=(s,c)=>{
      renders.push({mask:c.layers.mask,shadows:renderer.shadowMap.autoUpdate,background:s.background,
        flash:muzzleFlash.layers.test(c.layers)&&muzzleFlash.intensity===7&&weapon.getObjectByName('flash').visible});
      if(renderer.shadowMap.autoUpdate)renderer.shadowMap.needsUpdate=false;
    };
    renderFrame();
  `);
  h.setNow(1030);h.run('renderFrame();');
  h.setNow(1070);h.run('renderFrame();');
  assert.deepEqual(Array.from(h.run('renders.map(render=>render.mask)')),[1,2,1,2,1,2]);
  assert.deepEqual(Array.from(h.run('renders.filter((_,index)=>index%2===0).map(render=>render.shadows)')),[true,false,true]);
  assert.equal(h.run('renders.filter((_,index)=>index%2===1).every(render=>render.flash&&!render.shadows&&render.background===null)'),true);
  assert.equal(h.run('scene.background===originalBackground'),true);
  assert.equal(h.run('camera.layers.mask'),1);assert.equal(h.run('renderer.shadowMap.autoUpdate'),true);
  h.setNow(1075);h.run('renderer.shadowMap.needsUpdate=true;renderFrame();');
  assert.equal(h.run('renders.at(-2).shadows'),true,'quality changes can force an immediate shadow refresh');
  h.run('renderer.shadowMap.autoUpdate=false;renderFrame();');
  assert.equal(h.run('renderer.shadowMap.autoUpdate'),false,'a pre-disabled shadow updater stays disabled');
});

test('render failures still restore background, camera layers and the shadow updater',()=>{
  const h=createHarness();h.run(`
    scene.background=new THREE.Color(0x102030);const saved=scene.background;
    let draws=0;renderer.render=()=>{if(++draws===2)throw new Error('simulated view-model renderer failure');};
  `);
  assert.throws(()=>h.run('renderFrame();'),/simulated view-model/);
  assert.equal(h.run('scene.background===saved'),true);assert.equal(h.run('camera.layers.mask'),1);
  assert.equal(h.run('renderer.shadowMap.autoUpdate'),true);
});

let failed=0;
for(const {name,execute} of cases){
  try{execute();console.log(`PASS ${name}`);}
  catch(error){failed++;console.error(`FAIL ${name}`);console.error(error.stack);}
}
console.log(`\n${cases.length-failed}/${cases.length} runtime regression checks passed.`);
if(failed)process.exitCode=1;
