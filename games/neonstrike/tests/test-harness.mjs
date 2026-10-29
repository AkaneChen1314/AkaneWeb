import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import { createGrenadeMotion, advanceGrenadeMotion, predictGrenadePath, GRENADE_FUSE, GRENADE_BLAST_RADIUS } from '../grenade-trajectory.js';
import * as spatialCollision from '../spatial-collision.js';

// Exercise shipped gameplay with real Three geometry and a small browser mock.
const sourcePath=fileURLToPath(new URL('../main.js',import.meta.url));
const source=readFileSync(sourcePath,'utf8')
  .replace(/^import .*\r?\n/gm,'')
  .replace(/\r?\ninitLoadout\(\);\s*init3D\(\);[\s\S]*$/,'');

export function createHarness(){
  const nodes=new Map(),documentListeners=new Map(),globalListeners=new Map(),scheduled=new Map();
  let now=1000,nextTimer=0;
  const noop=()=>{},gradient={addColorStop:noop};
  const canvasContext=new Proxy({
    measureText:text=>({width:String(text).length*10}),
    createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
  },{get:(target,key)=>target[key]??noop,set:(target,key,value)=>(target[key]=value,true)});
  function makeNode(){
    const classes=new Set(),children=new Map(),attributes=new Map(),listeners=new Map();
    return {
      textContent:'',style:{setProperty:noop},children:[],dataset:{},value:'',disabled:false,
      classList:{
        add:(...names)=>names.forEach(name=>classes.add(name)),
        remove:(...names)=>names.forEach(name=>classes.delete(name)),
        contains:name=>classes.has(name),
        toggle:(name,force)=>{const add=force??!classes.has(name);if(add)classes.add(name);else classes.delete(name);return add;},
      },
      setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name)??null,
      addEventListener:(type,listener)=>listeners.set(type,listener),
      dispatch(type,event={}){listeners.get(type)?.(event);},
      appendChild(child){this.children.push(child);child.parent=this;return child;},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},
      replaceChildren(...items){this.children=items;items.forEach(child=>child.parent=this);},
      getContext:()=>canvasContext,
      querySelector:selector=>{if(!children.has(selector))children.set(selector,makeNode());return children.get(selector);},
    };
  }
  const document={
    pointerLockElement:null,documentElement:makeNode(),body:makeNode(),
    querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,makeNode());return nodes.get(selector);},
    querySelectorAll:()=>[],createElement:makeNode,
    addEventListener:(type,listener)=>documentListeners.set(type,listener),exitPointerLock:noop,
  };
  const storage=new Map();
  const context=vm.createContext({
    THREE,...spatialCollision,createGrenadeMotion,advanceGrenadeMotion,predictGrenadePath,GRENADE_FUSE,GRENADE_BLAST_RADIUS,document,console,
    performance:{now:()=>now},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},
    setTimeout:callback=>{scheduled.set(++nextTimer,callback);return nextTimer;},clearTimeout:id=>scheduled.delete(id),
    requestAnimationFrame:noop,addEventListener:(type,listener)=>globalListeners.set(type,listener),
  });
  vm.runInContext(source,context,{filename:sourcePath});
  const run=expression=>vm.runInContext(expression,context);
  run('scene=new THREE.Scene();camera=new THREE.PerspectiveCamera();yaw=new THREE.Group();yaw.position.set(0,1.68,64);renderer={domElement:{},clear(){},clearDepth(){},shadowMap:{autoUpdate:true},render(){}};');
  return {
    run,nodes,document,scheduled,storage,
    setNow:value=>{now=value;},
    dispatchDocument:type=>{assert.ok(documentListeners.has(type),`Missing ${type} handler`);documentListeners.get(type)();},
    dispatchGlobal:(type,event)=>{assert.ok(globalListeners.has(type),`Missing ${type} handler`);globalListeners.get(type)(event);},
    installFrameStubs:()=>run('clock={getDelta(){return .05;}};updateRain=()=>{};updateEffects=()=>{};updatePlayer=()=>{};updateEnemies=()=>{};updateGrenades=()=>{};updatePickups=()=>{};updateCompass=()=>{};updateMissionStatus=()=>{};drawMinimap=()=>{};'),
  };
}

export { THREE };
