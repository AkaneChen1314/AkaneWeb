import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import { createGrenadeMotion, advanceGrenadeMotion, predictGrenadePath, GRENADE_FUSE, GRENADE_BLAST_RADIUS } from '../grenade-trajectory.js';

const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const origin={x:0,y:1.68,z:0},direction={x:0,y:.25,z:-Math.sqrt(1-.25*.25)};

const airborne=createGrenadeMotion(origin,direction);
advanceGrenadeMotion(airborne,.3);
assert.ok(airborne.position.y>origin.y,'upward launch rises before descending');
advanceGrenadeMotion(airborne,GRENADE_FUSE);
assert.equal(airborne.life,0);
assert.ok(airborne.position.y>=.13,'floor prevents sinking below the ground');
console.log('PASS ballistic launch, fuse and floor contact');

const wall={min:{x:-2,y:0,z:-4.05},max:{x:2,y:4,z:-4}};
const blocked=createGrenadeMotion(origin,{x:0,y:0,z:-1},[wall]);
advanceGrenadeMotion(blocked,.4,[wall]);
assert.ok(blocked.velocity.z>0,'wall reflects incoming motion');
assert.ok(blocked.position.z>-4,'swept collision cannot tunnel through a thin wall');
console.log('PASS swept wall collision and bounce');

const nearWall={min:{x:-2,y:0,z:-.5},max:{x:2,y:4,z:-.45}};
const launch=createGrenadeMotion(origin,{x:0,y:0,z:-1},[nearWall]);
assert.ok(launch.position.z>-.33,'launch offset is clipped before an adjacent wall');
console.log('PASS launch clearance near cover');

const prediction=predictGrenadePath(origin,direction,[wall]);
for(const dt of [1/30,1/60,.05]){
  const actual=createGrenadeMotion(origin,direction,[wall]);
  for(let i=0;i<500&&actual.life>1e-9;i++)advanceGrenadeMotion(actual,dt,[wall]);
  for(const axis of ['x','y','z'])close(actual.position[axis],prediction.end[axis],`predicted endpoint ${axis} at ${dt}`);
}
assert.ok(prediction.points.length<=64,'preview fits the reusable GPU buffer');
console.log('PASS preview endpoint matches live physics across frame rates');

const downward=createGrenadeMotion(origin,{x:0,y:-.7,z:-Math.sqrt(.51)});
while(downward.life>.7)advanceGrenadeMotion(downward,1/60);
assert.equal(downward.grounded,true,'small floor bounces settle before fuse expires');
const bounceCount=downward.bounces,speedBefore=Math.hypot(downward.velocity.x,downward.velocity.z),lifeBefore=downward.life;
advanceGrenadeMotion(downward,.3);
assert.equal(downward.bounces,bounceCount,'settled grenade does not generate repeated micro-bounces');
assert.equal(downward.position.y,.13,'resting grenade remains on the floor');
assert.equal(downward.velocity.y,0,'resting grenade has no vertical jitter');
assert.ok(Math.hypot(downward.velocity.x,downward.velocity.z)<speedBefore,'horizontal sliding continues to lose speed');
assert.ok(downward.life<lifeBefore,'fuse still counts down while settled');
console.log('PASS low-speed floor contact settles with friction and a live fuse');

const wallPreview=predictGrenadePath(origin,{x:0,y:0,z:-1},[wall]);
assert.ok(wallPreview.firstImpact,'wall contact is exposed separately');
assert.ok(wallPreview.previewPoints.length<wallPreview.points.length,'main preview stops at the first collision');
for(const axis of ['x','y','z'])close(wallPreview.previewPoints.at(-1)[axis],wallPreview.firstImpact[axis],`preview terminates at first impact ${axis}`);
assert.ok(wallPreview.previewPoints.every((point,index,all)=>index===0||point.z<=all[index-1].z+1e-9),'main line contains no reflected return segment');
assert.ok(wallPreview.end.z>wallPreview.firstImpact.z,'final explosion endpoint still includes later real bounces');
assert.deepEqual(wallPreview.firstImpactNormal,{x:0,y:0,z:1});
console.log('PASS preview draws one primary arc while retaining the final physics endpoint');

const platform={min:{x:-3,y:0,z:-3},max:{x:3,y:1,z:3}};
const onTop=createGrenadeMotion({x:0,y:1.6,z:0},{x:0,y:0,z:0},[platform]);
onTop.velocity={x:0,y:0,z:0};advanceGrenadeMotion(onTop,.8,[platform]);
assert.equal(onTop.grounded,true,'low bounces settle on a raised surface');
close(onTop.position.y,1.1202,'grenade rests above the box');
const topBounces=onTop.bounces;advanceGrenadeMotion(onTop,.2,[platform]);
assert.equal(onTop.bounces,topBounces,'box-top support has no repeated micro-bounces');
advanceGrenadeMotion(onTop,.15,[]);
assert.equal(onTop.grounded,false,'destroyed support releases the grenade');
assert.ok(onTop.position.y<1.1,'grenade falls after its support disappears');
console.log('PASS box-top settling and removal of supporting scenery');

const ledge={min:{x:-.5,y:0,z:-2},max:{x:.5,y:1,z:2}};
const sliding=createGrenadeMotion({x:0,y:1.6,z:0},{x:0,y:0,z:0},[ledge]);
sliding.velocity={x:0,y:0,z:0};advanceGrenadeMotion(sliding,.8,[ledge]);
sliding.velocity.x=8;advanceGrenadeMotion(sliding,.3,[ledge]);
assert.equal(sliding.grounded,false,'sliding past the edge loses support');
assert.ok(sliding.position.y<1.1,'grenade falls rather than hovering beside a crate');
console.log('PASS grenade sliding off raised cover obeys gravity');

const overhead=predictGrenadePath(origin,{x:0,y:1,z:0});
assert.equal(overhead.firstImpact,null);assert.equal(overhead.grounded,false);
assert.ok(overhead.end.y>5,'airburst prediction does not invent a ground impact');
assert.ok(wallPreview.firstImpactTime>0&&wallPreview.firstImpactTime<GRENADE_FUSE);
const timed=createGrenadeMotion(origin,{x:0,y:0,z:-1},[wall]);
while(!timed.firstImpact)advanceGrenadeMotion(timed,1/120,[wall]);
close(timed.firstImpactTime,wallPreview.firstImpactTime,'predicted first contact time');
console.log('PASS first-contact timing and airborne explosion prediction');

const mainSource=readFileSync(new URL('../main.js',import.meta.url),'utf8');
const previewFunctions=['getGrenadeAim','createGrenadePreview','updateGrenadePreview'].map(name=>{
  const match=mainSource.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match,`${name} is present in the shipped game`);return match[0];
}).join('\n');
const labelNodes=new Map();
const hintClasses=new Set();
const hint={classList:{toggle(name,value){if(value)hintClasses.add(name);else hintClasses.delete(name);},remove(name){hintClasses.delete(name);}},querySelector(selector){if(!labelNodes.has(selector))labelNodes.set(selector,{textContent:''});return labelNodes.get(selector);}};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.copy(origin);
const context=vm.createContext({THREE,scene,camera,predictGrenadePath,GRENADE_FUSE,GRENADE_BLAST_RADIUS,ui:{grenadeHint:hint,hud:{classList:{toggle(){}}}},touchControls:null,grenadePreview:null,grenadeAiming:true,gameState:'playing',grenadeCount:2,lastGrenadePreview:0,collisionBoxes:[new THREE.Box3(new THREE.Vector3(-2,0,-4.05),new THREE.Vector3(2,4,-4))]});
vm.runInContext(previewFunctions,context);
vm.runInContext('createGrenadePreview();createGrenadePreview();updateGrenadePreview(1000,true);',context);
assert.equal(scene.children.length,1,'repeated setup reuses one preview group');
assert.equal(context.grenadePreview.group.visible,true);
assert.equal(context.grenadePreview.line.geometry.drawRange.count,wallPreview.previewPoints.length);
assert.match(labelNodes.get('small').textContent,/首次撞牆/);
assert.match(labelNodes.get('em').textContent,/自身爆炸範圍/);
assert.equal(hintClasses.has('danger'),true);
const cached=context.grenadePreview.prediction;
vm.runInContext('updateGrenadePreview(1050);',context);
assert.equal(context.grenadePreview.prediction,cached,'still aim reuses the physics result');
camera.position.x=.2;vm.runInContext('updateGrenadePreview(1100);',context);
assert.notEqual(context.grenadePreview.prediction,cached,'moving refreshes the physics result');
const moved=context.grenadePreview.prediction;
vm.runInContext('collisionBoxes.length=0;updateGrenadePreview(1150);',context);
assert.notEqual(context.grenadePreview.prediction,moved,'destroying cover refreshes the prediction');
for(const axis of ['x','z'])close(context.grenadePreview.blastMarker.position[axis],context.grenadePreview.prediction.end[axis],`blast marker ${axis}`);
console.log('PASS preview caches still aim, invalidates changed cover and warns about close blasts');
vm.runInContext("grenadeAiming=false;updateGrenadePreview(1100,true);",context);
assert.equal(context.grenadePreview.group.visible,false);
assert.equal(context.grenadePreview.line.geometry.drawRange.count,0,'release clears the line draw range');
assert.equal(context.grenadePreview.marker.visible,false,'release hides the contact marker');
assert.equal(context.grenadePreview.blastMarker.visible,false,'release hides the blast marker');
vm.runInContext("grenadeAiming=true;gameState='paused';updateGrenadePreview(1200,true);",context);
assert.equal(context.grenadePreview.line.geometry.drawRange.count,0,'pause cannot revive stale line segments');
console.log('PASS preview setup is idempotent and release/pause clear all geometry draws');
