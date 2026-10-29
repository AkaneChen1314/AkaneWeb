import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';

const source=readFileSync(new URL('../main.js',import.meta.url),'utf8');
const audioSource=source.slice(source.indexOf('function initAudio(){'),source.indexOf('\nfunction onResize()'));

function harness(saved={}){
  const nodes=[],starts=[],buffers=[];
  const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;}});
  function node(kind){
    const result={kind,gain:parameter(),frequency:parameter(),Q:parameter(),pan:parameter(),playbackRate:parameter(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),connect(next){this.target=next;return next;},disconnect(){this.disconnected=true;},start(){this.started=true;starts.push(this);},stop(){this.stopped=true;}};
    nodes.push(result);return result;
  }
  class FakeAudioContext{
    constructor(){this.sampleRate=8000;this.currentTime=1;this.state='running';this.destination=node('destination');}
    createGain(){return node('gain');}createDynamicsCompressor(){return node('compressor');}createBufferSource(){return node('source');}createBiquadFilter(){return node('filter');}createStereoPanner(){return node('panner');}createOscillator(){return node('oscillator');}
    createBuffer(channels,length){const samples=new Float32Array(length),buffer={getChannelData(){return samples;}};buffers.push(buffer);return buffer;}
    resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
  }
  const context=vm.createContext({THREE,window:{AudioContext:FakeAudioContext},sessionStorage:{getItem(key){return saved[key]??null;}},console,Promise});
  vm.runInContext(`
    let audioContext,audioMaster,audioCompressor,audioLoadPromise;
    let masterVolume=.72,ambientStarted=false,shots=1;
    const audioBuses={},audioVoices=new Map(),AUDIO_VOICE_LIMIT=24;
    const mixDefaults={effects:.8,ambience:.35,feedback:.55};
    const mixSettings={effects:readMixSetting('neonEffectsVolume',.8),ambience:readMixSetting('neonAmbienceVolume',.35),feedback:readMixSetting('neonFeedbackVolume',.55)};
    const sampleCalibration={},mechanicalBuffers={},soundFiles={};
    let soundBuffers={rifle0:{name:'rifle0'},rifle1:{name:'rifle1'},shell:{name:'shell'},explosion:{name:'explosion'},explosionLow:{name:'explosionLow'},tail:{name:'tail'}};
    let lastEnemySoundAt=-Infinity,lastExplosionSoundAt=-Infinity;
    const yaw=new THREE.Group();
  `+audioSource,context);
  return {run:code=>vm.runInContext(code,context),nodes,starts,buffers};
}

const checks=[];
function test(name,execute){checks.push({name,execute});}

test('three volume buses restore settings, clamp corrupt input and smooth live gains',()=>{
  const h=harness({neonEffectsVolume:'500',neonAmbienceVolume:'-12',neonFeedbackVolume:'broken'});
  assert.equal(h.run('mixSettings.effects'),1);assert.equal(h.run('mixSettings.ambience'),0);assert.equal(h.run('mixSettings.feedback'),.55);
  h.run('initAudio();mixSettings.effects=NaN;mixSettings.ambience=.23;mixSettings.feedback=Infinity;masterVolume=-1;applyAudioMix();');
  assert.equal(h.run('audioBuses.effects.gain.value'),.8);assert.equal(h.run('audioBuses.ambience.gain.value'),.23);assert.equal(h.run('audioBuses.feedback.gain.value'),.55);assert.equal(h.run('audioMaster.gain.value'),0);
  assert.equal(h.run('audioCompressor.ratio.value'),8);
});

test('muting one bus preserves the other sound categories and rejects malformed parameters',()=>{
  const h=harness();h.run("initAudio();mixSettings.effects=0;applyAudioMix();");
  assert.equal(h.run("playSample('rifle0')"),false);assert.equal(h.run("playTone(400,.1)"),true);
  h.run("mixSettings.effects=.8;applyAudioMix();playSample('rifle0',.2,NaN,NaN,Infinity);playTone(NaN,NaN,'invalid',.02,NaN);");
  assert.ok(h.nodes.every(node=>['gain','frequency','Q','pan','playbackRate'].every(key=>Number.isFinite(node[key].value))));
});

test('voice budget preserves player effects by evicting distant voices and releases nodes',()=>{
  const h=harness();h.run('initAudio();');
  for(let i=0;i<30;i++)h.run("playSample('rifle0',.02,1,0,0,'effects',0);");
  assert.equal(h.run('audioVoices.size'),24);
  h.run("playSample('shell',.1,1,0,0,'effects',4);");
  assert.equal(h.run('audioVoices.size'),24);assert.equal(h.starts.at(-1).buffer.name,'shell');
  assert.ok(h.starts.some(source=>source.stopped&&source.disconnected));
  h.run('for(const state of [...audioVoices.values()])state.release(true);');
  assert.equal(h.run('audioVoices.size'),0);
  assert.ok(h.starts.filter(source=>!source.loop).every(source=>source.disconnected));
});

test('spatial audio follows listener orientation and keeps left and right consistent',()=>{
  const h=harness();
  assert.equal(h.run('spatialPan({x:10,y:0,z:0})'),1);assert.equal(h.run('spatialPan({x:-10,y:0,z:0})'),-1);
  h.run('yaw.rotation.y=Math.PI/2;');
  assert.ok(Math.abs(h.run('spatialPan({x:0,y:0,z:-10})')-1)<1e-9);
  assert.equal(h.run('spatialPan({x:0,y:0,z:0})'),0);
});

test('dense enemy fire is throttled and distant shots decay instead of retaining a loud floor',()=>{
  const h=harness();h.run('initAudio();');
  for(let i=0;i<12;i++)h.run('playDistantShot(10,{x:10,y:0,z:0});');
  assert.equal(h.starts.filter(source=>source.buffer?.name?.startsWith('rifle')).length,1);
  h.run('audioContext.currentTime+=.06;playDistantShot(70,{x:70,y:0,z:0});');
  const shots=h.starts.filter(source=>source.buffer?.name?.startsWith('rifle'));
  assert.equal(shots.length,2);assert.ok(shots[1].target.gain.value<shots[0].target.gain.value/5);
});

test('near-simultaneous explosions avoid multiplying low-frequency layers',()=>{
  const h=harness();h.run('initAudio();playExplosionSound(0,{x:0,y:0,z:-1});playExplosionSound(0,{x:0,y:0,z:-1});');
  assert.equal(h.starts.filter(source=>source.buffer?.name==='explosion').length,2);
  assert.equal(h.starts.filter(source=>source.buffer?.name==='explosionLow').length,1);
});

test('ambient loop joins at silence and repeated starts do not allocate another loop',()=>{
  const h=harness();h.run('initAudio();startAmbientSound();startAmbientSound();');
  const loops=h.starts.filter(source=>source.loop);assert.equal(loops.length,1);
  const samples=loops[0].buffer.getChannelData(0);assert.equal(Math.abs(samples[0]),0);assert.equal(Math.abs(samples.at(-1)),0);
  h.run("audioContext.state='closed';");assert.equal(h.run('resumeAudio()'),false);assert.equal(h.run("playSample('rifle0')"),false);
});

let failed=0;
for(const {name,execute} of checks){try{execute();console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`\n${checks.length-failed}/${checks.length} audio mix checks passed.`);if(failed)process.exitCode=1;
