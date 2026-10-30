import assert from 'node:assert/strict';
import { createTouchControls, supportsTouch } from '../touch-controls.js';
import { createHarness } from './test-harness.mjs';

function node(action) {
  const listeners = new Map(), attrs = new Map(), classes = new Set();
  return {
    dataset: { touchAction: action }, style: {setProperty(key,value){this[key]=value;}}, hidden: false,
    classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener(type, callback) { listeners.set(type, callback); },
    emit(type, event = {}) { listeners.get(type)?.({ pointerType: 'touch', pointerId: 1, clientX: 50, clientY: 50, preventDefault() {}, stopPropagation() {}, ...event }); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setAttribute: (key, value) => attrs.set(key, value), getAttribute: key => attrs.get(key),
    setPointerCapture() {}, hasPointerCapture: () => false,
  };
}
const root = node(), canvas = node(), pad = node(), knob = node(), env = node();
const actions = ['fire', 'aim', 'sprint', 'reload', 'jump', 'ability', 'grenade', 'grenade-cancel', 'pause'];
const buttons = actions.map(node), calls = [], turns = [];
root.querySelectorAll = () => buttons;
root.querySelector = selector => selector === '[data-touch-move]' ? pad : buttons[7];
pad.querySelector = () => knob;
env.navigator = { maxTouchPoints: 5 };env.matchMedia = () => ({ matches: false });
env.document = node();env.document.body = node();
assert(supportsTouch(env), 'desktop UA must not disable a real touch screen');
assert.equal(supportsTouch({}), false);
const controls = createTouchControls({ root, canvas, env, onAction: (...args) => calls.push(args), onLook: (...args) => turns.push(args) });
controls.setPlaying(true);
pad.emit('pointerdown', { pointerId: 1, clientY: 16 });
assert.equal(controls.moveY, -1);
canvas.emit('pointerdown', { pointerId: 2 });canvas.emit('pointermove', { pointerId: 2, clientX: 80 });
buttons[0].emit('pointerdown', { pointerId: 3 });buttons[0].emit('pointermove', { pointerId: 3, clientX: 90 });
assert.equal(controls.moveY, -1, 'looking and firing must preserve the movement finger');
assert.deepEqual(turns, [[30, 0], [40, 0]]);
assert(calls.some(([action, down]) => action === 'fire' && down));
env.emit('pointercancel', { pointerId: 3 });assert.deepEqual(calls.at(-1), ['fire', false]);
env.emit('pointerup', { pointerId: 1 });assert.equal(controls.moveY, 0);
buttons[6].emit('pointerdown', { pointerId: 4 });env.emit('pointercancel', { pointerId: 4 });assert.deepEqual(calls.at(-1), ['grenade-cancel']);
buttons[6].emit('pointerdown', { pointerId: 5 });env.emit('pointerup', { pointerId: 5 });assert.deepEqual(calls.at(-1), ['grenade-throw']);
buttons[1].emit('pointerdown', { pointerId: 6 });env.emit('pointerup', { pointerId: 6 });assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
buttons[2].emit('pointerdown', { pointerId: 7 });env.emit('pointerup', { pointerId: 7 });assert.equal(controls.sprint, true);
controls.setPlaying(false);assert.equal(root.hidden, true);assert.equal(controls.sprint, false);assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
const count = calls.length;buttons[0].emit('pointerdown', { pointerId: 8 });assert.equal(calls.length, count, 'hidden controls cannot fire');
env.innerWidth=980;env.innerHeight=1850;env.screen={width:390,height:844};env.emit('resize');
assert.equal(Number(env.document.body.style['--touch-scale']),980/390);
controls.setPlaying(true);canvas.emit('pointerdown',{pointerId:9});canvas.emit('pointermove',{pointerId:9,clientX:50+20*980/390});
assert(Math.abs(turns.at(-1)[0]-20)<1e-9,'desktop-mode aiming must compensate for page scale');
env.emit('orientationchange');assert.equal(controls.moveX,0);assert.deepEqual(calls.at(-1),['pause']);

// Check analog input and camera changes against the actual gameplay functions.
const h = createHarness();
h.run("pitch=new THREE.Group();touchControls={enabled:true,moveX:.4,moveY:-.3,sprint:false,reset(){},setPlaying(){},setGrenadePreview(){}};gameState='playing';updateWeaponPose=()=>{};playTone=()=>{};updateHUD=()=>{};");
h.run('onTouchLook(50,-30);');assert.equal(h.run('yaw.rotation.y'), -.2);assert(Math.abs(h.run('pitch.rotation.x') - .105) < 1e-9);
h.run('yaw.rotation.y=0;updatePlayer(.1,1000);');
assert(Math.abs(h.run('yaw.position.x') - .204) < 1e-9, 'partial joystick input must preserve walking speed');
assert(Math.abs(h.run('yaw.position.z') - 63.847) < 1e-9);
h.run("onTouchAction('jump');");assert(h.run('verticalVelocity') > 0);
h.run("onTouchAction('ability');");assert.equal(h.run('abilityCooldown'), 28);
h.run("freeLook=false;clock={getDelta(){return 0}};requestLock();");assert.equal(h.run('freeLook'), true);
console.log('PASS multi-touch move/look/fire, pointer cancellation, grenade release, pause reset, analog movement, camera, jump, ability and touch startup');
