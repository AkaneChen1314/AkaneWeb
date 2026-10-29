import assert from 'node:assert/strict';
import {createHarness} from './test-harness.mjs';

const h=createHarness();
h.run(`
  const calls=[];
  const minimapContext={beginPath(){calls.push(['begin']);},moveTo(x,y){calls.push(['move',x,y]);},lineTo(x,y){calls.push(['line',x,y]);},closePath(){calls.push(['close']);},fill(){calls.push(['fill']);},arc(...args){calls.push(['arc',...args]);},fillRect(...args){calls.push(['rect',...args]);}};
  const angled=orientCollider(new THREE.Box3(new THREE.Vector3(-3,0,-3),new THREE.Vector3(3,2,3)),0,1,0,4,2,2,Math.PI/4);
  drawMinimapCollider(minimapContext,angled,1,0,0);
`);
let calls=Array.from(h.run('calls'),row=>Array.from(row));
assert.deepEqual(calls.map(row=>row[0]),['begin','move','line','line','line','close','fill']);
assert.ok(Math.abs(calls[1][1]+3/Math.sqrt(2))<1e-9,'rotated footprint should use its real corners');
h.run(`calls.length=0;const round=roundCollider(new THREE.Box3(new THREE.Vector3(8,0,8),new THREE.Vector3(12,4,12)),10,10,2);drawMinimapCollider(minimapContext,round,1,0,0);`);
calls=Array.from(h.run('calls'),row=>Array.from(row));
assert.deepEqual(calls[1].slice(0,4),['arc',10,10,2]);
h.run(`calls.length=0;drawMinimapCollider(minimapContext,new THREE.Box3(new THREE.Vector3(0,3,0),new THREE.Vector3(3,4,3)),1,0,0);drawMinimapCollider(minimapContext,new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(3,.2,3)),1,0,0);`);
assert.equal(h.run('calls.length'),0,'overhead beams and floor details must not look like walls');
console.log('PASS minimap shows angled and round cover accurately and omits overhead or floor-only scenery');
