import rifle0 from './assets/audio/rifle-0.wav';
import rifle1 from './assets/audio/rifle-1.wav';
import tail from './assets/audio/rifle-tail.mp3';
import explosion from './assets/audio/explosion-crunch.ogg';
import explosionLow from './assets/audio/explosion-low.ogg';
import shell from './assets/audio/shell.ogg';
import step0 from './assets/audio/step-0.wav';
import step1 from './assets/audio/step-1.wav';

// A classic bundle and embedded samples also work when the site is opened from disk.
globalThis.neonAudioAssets = Object.freeze({rifle0, rifle1, tail, explosion, explosionLow, shell, step0, step1});
import('./main.js').catch(error => {
  document.getElementById('loadError').hidden = false;
  console.error('Game initialization failed', error);
});
