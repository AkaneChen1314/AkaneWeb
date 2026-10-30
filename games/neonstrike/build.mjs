import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Rebuild only when game source or audio changes. Players use the committed browser.js.
const binary = process.argv[2] || 'esbuild';
const version = spawnSync(binary, ['--version'], {encoding:'utf8'});
if(version.error || version.status !== 0 || version.stdout.trim() !== '0.28.2') {
  throw new Error('Build requires esbuild 0.28.2. Pass its executable path as the first argument.');
}
const result = spawnSync(binary, [
  'browser-entry.js', '--bundle', '--format=iife', '--platform=browser',
  '--target=es2020', '--minify', '--legal-comments=inline',
  '--loader:.wav=dataurl', '--loader:.mp3=dataurl', '--loader:.ogg=dataurl',
  '--outfile=browser.js',
], {cwd:fileURLToPath(new URL('.', import.meta.url)), stdio:'inherit'});
if(result.error) throw result.error;
if(result.status !== 0) process.exit(result.status || 1);
