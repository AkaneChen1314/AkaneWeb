import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../lobby.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'each control and summary ID must be unique');

function element(value=''){
  const listeners={},classes=new Set(),attributes={};
  return {value,textContent:'',hidden:false,disabled:false,dataset:{},open:false,scrollTop:0,selectedOptions:[{textContent:''}],
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
    setAttribute(name,value){attributes[name]=value;},removeAttribute(name){delete attributes[name];},
    addEventListener(type,fn){listeners[type]=fn;},dispatch(type){listeners[type]?.();},dispatchEvent(event){listeners[event.type]?.(event);},scrollIntoView(){this.scrolled=true;}};
}
const elements=new Map(ids.map(id=>[id,element()]));
const get=id=>elements.get(id);
get('operatorName').textContent='VANTA // 夜襲';get('mapSelect').value='1';
get('bossSelect').value='on';get('bossHealthSelect').value='2000';get('bossSpeedSelect').value='3.2';get('bossPowerSelect').value='1.5';get('enemyPowerSelect').value='1.5';
const tabs=Array.from({length:4},()=>element()),pages=Array.from({length:4},(_,i)=>{const p=element();p.dataset.lobbyStep=String(i);return p;});
const mapCards=['0','1'].map(value=>element(value));
const mission=element(),content=element(),drawer=element();
let mode='首領討伐 WARLORD',difficulty='NIGHTMARE 煉獄';
const document={getElementById:get,addEventListener(){},querySelectorAll(q){return q==='[data-step-tab]'?tabs:q==='input[name="arena"]'?mapCards:pages;},querySelector(q){
  if(q==='.mission')return mission;if(q==='.setup-content')return content;if(q==='.encounter-drawer')return drawer;
  if(q.startsWith('#modeOptions'))return {getAttribute:()=>mode};if(q.startsWith('#difficultyOptions'))return {getAttribute:()=>difficulty};
}};
const context=vm.createContext({document,window:{},Event:class {constructor(type){this.type=type;}},queueMicrotask:fn=>fn()});vm.runInContext(source,context);
assert.equal(get('brandMapName').textContent,'EMBER FOUNDRY');assert.equal(get('briefSectorCount').textContent,'05');
assert.equal(mapCards[1].checked,true,'cards reflect the saved map');
assert.equal(pages[0].hidden,false);assert.equal(pages[1].hidden,true);
tabs[3].dispatch('click');
assert.equal(get('summaryMap').textContent,'熔火工廠');assert.equal(get('summaryBossCard').hidden,false);
assert.match(get('summaryBoss').textContent,/生命 3840（基礎 2000）/,'boss actual health includes difficulty and enemy strength');
assert.match(get('summaryBoss').textContent,/基礎移速 3\.2×/);
mode='限時獵殺 HUNTER';get('bossSelect').value='off';tabs[3].dispatch('click');
assert.equal(get('summaryBossCard').hidden,true,'hunter has no boss card');
tabs[2].dispatch('click');get('encounterJump').dispatch('click');assert.equal(drawer.open,true);assert.equal(drawer.scrolled,true,'shortcut reveals the configuration');
get('mapSelect').value='0';get('mapSelect').dispatch('change');assert.equal(get('brandMapName').textContent,'RUST HARBOR');assert.equal(get('briefSectorCount').textContent,'09');
assert.equal(mapCards[0].checked,true,'external map selection updates the cards');
mapCards[1].checked=true;mapCards[1].dispatch('change');
assert.equal(get('mapSelect').value,'1','card choice updates the actual game map control');
assert.equal(get('brandMapName').textContent,'EMBER FOUNDRY');assert.equal(mapCards[0].checked,false);
console.log('PASS four-step navigation, map card synchronization, boss health calculation and custom-settings shortcut');
