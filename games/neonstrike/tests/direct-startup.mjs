import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHarness} from './test-harness.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../browser.js',import.meta.url),'utf8');
assert.match(html, /<script defer src="\.\/browser\.js\?/);
assert.doesNotMatch(html, /localhost|fileNotice|import\(/);
assert.doesNotThrow(()=>new vm.Script(bundle), 'shipped game must parse as a classic script');
for(const file of ['rifle-0.wav','rifle-1.wav','rifle-tail.mp3','explosion-crunch.ogg','explosion-low.ogg','shell.ogg','step-0.wav','step-1.wav']){
  const bytes=readFileSync(new URL(`../assets/audio/${file}`,import.meta.url));
  assert.ok(bundle.includes(bytes.toString('base64')), `${file} must be embedded for file-mode audio`);
}
const h=createHarness();
h.run("renderer={domElement:{}};document.pointerLockElement=renderer.domElement;let unlocks=0;document.exitPointerLock=()=>{unlocks++;};setupEvents();ui.helpModal.classList.add('hidden');gameState='playing';keys.KeyW=true;mouseDown=true;");
h.dispatchGlobal('keydown',{code:'Escape'});
assert.equal(h.run('gameState'),'paused');
assert.equal(h.run('unlocks'),1);
assert.equal(h.run('keys.KeyW'),false);
assert.equal(h.run('mouseDown'),false);
console.log('PASS classic startup contains modules and all eight audio samples; no localhost gate; Escape pauses and releases input');
