import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { performance } from 'node:perf_hooks';

// The game server must already be running; this test never starts another server.
const host = '127.0.0.1';
const port = 4173;

function get(path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host, port, path, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    });
    request.setTimeout(6000, () => request.destroy(new Error(`GET ${path} timed out`)));
    request.on('error', reject);
  });
}

function rawRequest(requestText) {
  return new Promise((resolve, reject) => {
    let response = '';
    const started = performance.now();
    const socket = net.createConnection({ host, port });
    socket.setEncoding('utf8');
    socket.setTimeout(6000, () => socket.destroy(new Error('Raw HTTP request timed out')));
    socket.on('connect', () => socket.write(requestText));
    socket.on('data', chunk => {
      response += chunk;
      if (response.length > 65536) socket.destroy(new Error('Unexpectedly large raw response'));
    });
    socket.on('end', () => resolve({ response, elapsed: performance.now() - started }));
    socket.on('error', reject);
  });
}

const home = await get('/');
assert.equal(home.status, 200, 'Homepage must return 200');
assert.match(home.body, /NEON STRIKE/, 'Homepage must contain the game');
console.log('PASS homepage 200');

const script = await get('/main.js');
assert.equal(script.status, 200, 'Game script must return 200');
assert.match(script.headers['content-type'] ?? '', /^(?:text|application)\/javascript\b/i, 'Game script must use a JavaScript MIME type');
console.log('PASS JavaScript MIME');

const missing = await get('/__server_regression_missing__.txt');
assert.equal(missing.status, 404, 'Missing file must return 404');
console.log('PASS missing file 404');

const partial = await rawRequest('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n');
assert.match(partial.response, /^HTTP\/1\.1 408\b/, 'Incomplete headers must time out with 408');
assert.ok(partial.elapsed >= 2000 && partial.elapsed < 6000, `Header deadline should be about 3 seconds, observed ${Math.round(partial.elapsed)} ms`);
assert.equal((await get('/')).status, 200, 'Server must still respond after an incomplete request');
console.log('PASS partial-header timeout and server recovery');

const oversized = await rawRequest(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Fill: ${'a'.repeat(5000)}\r\n\r\n`);
assert.match(oversized.response, /^HTTP\/1\.1 431\b/, 'Oversized header must return 431');
console.log('PASS oversized header 431');
console.log('All server regression checks passed.');
