'use strict';
// ===== 合成音效與音樂（Web Audio，不需要任何音檔） =====
const AU = {
  ctx: null, last: {}, step: 0, mt: 0,
  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new C();
      this.master = c.createGain(); this.master.gain.value = .9; this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = .5; this.sfx.connect(comp);
      this.mus = c.createGain(); this.mus.gain.value = .3; this.mus.connect(comp);
      this.echo = c.createDelay(); this.echo.delayTime.value = .19;
      const fb = c.createGain(); fb.gain.value = .32; this.echo.connect(fb); fb.connect(this.echo);
      const wet = c.createGain(); wet.gain.value = .3; this.echo.connect(wet); wet.connect(comp);
      const len = c.sampleRate * 1; this.nbuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.nbuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.mt = c.currentTime + .1;
      setInterval(() => this.sched(), 40);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toneAt(f, t, d, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + d);
    if (o.det) osc.detune.value = o.det;
    const v = o.vol ?? .3, a = o.attack ?? .005;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    osc.connect(g); g.connect(o.dest || this.sfx); if (o.echo) g.connect(this.echo);
    osc.start(t); osc.stop(t + d + .05);
  },
  tone(f, d, o = {}) {
    if (!this.ctx || !G.settings.sfx) return;
    this.toneAt(f, this.ctx.currentTime + (o.delay || 0), d, o);
  },
  noise(d, o = {}) {
    if (!this.ctx || !G.settings.sfx) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + d);
    f.Q.value = o.q || 1;
    const g = c.createGain(); const v = o.vol ?? .2;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.attack || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    src.connect(f); f.connect(g); g.connect(this.sfx); if (o.echo) g.connect(this.echo);
    src.start(t, Math.random() * .5); src.stop(t + d + .05);
  },
  thr(id, ms) { const n = performance.now(); if (this.last[id] && n - this.last[id] < ms) return false; this.last[id] = n; return true; },
  play(name, arg) { if (!this.ctx || !G.settings.sfx) return; const fn = SFX[name]; if (fn) fn(arg); },
  // ===== 背景音樂：七首不同風格（主選單／商店／賭場／備戰／戰鬥／首領／大抽獎） =====
  synth(f, t, d, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sawtooth'; osc.frequency.setValueAtTime(f, t); if (o.det) osc.detune.value = o.det;
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + (o.sd || d));
    let node = osc;
    if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + d); fl.Q.value = o.q || 1; osc.connect(fl); node = fl; }
    const v = o.vol ?? .1, a = o.attack ?? .003;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    node.connect(g); g.connect(this.mus); if (o.echo) g.connect(this.echo);
    osc.start(t); osc.stop(t + d + .05);
  },
  drumNoise(t, d, o) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.nbuf;
    const f = c.createBiquadFilter(); f.type = o.ft; f.frequency.value = o.f; f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(o.vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    src.connect(f); f.connect(g); g.connect(this.mus); src.start(t, Math.random() * .5); src.stop(t + d + .02);
  },
  kick(t, v = 1, hard) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(hard ? 190 : 150, t); o.frequency.exponentialRampToValueAtTime(hard ? 38 : 45, t + .13);
    g.gain.setValueAtTime(1.1 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + (hard ? .45 : .32));
    o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + .5);
    this.drumNoise(t, .02, { ft: 'highpass', f: 3000, vol: .22 * v });
  },
  sched() {
    if (!this.ctx) return;
    const c = this.ctx, S = SONGS[G.musicMode] || SONGS.menu, s16 = 60 / S.bpm / 4;
    if (this.song !== S) { this.song = S; this.step = 0; }
    if (this.mt < c.currentTime - .5) this.mt = c.currentTime + .05;
    while (this.mt < c.currentTime + .2) {
      const sw = (this.step % 2 === 1 && S.swing) ? s16 * S.swing : 0;
      if (G.settings.music) this.beat(this.step, this.mt + sw, s16, S);
      this.mt += s16; this.step++;
    }
  },
  beat(step, t, s, S) {
    const st = step % 16, bar = Math.floor(step / 16);
    const mid = m => 440 * Math.pow(2, (m - 69) / 12);
    const [root, minor] = S.prog[bar % S.prog.length];
    const ch = S.maj7 ? [0, minor ? 3 : 4, 7, minor ? 10 : 11] : [0, minor ? 3 : 4, 7, 12];
    const on = (p, i) => p && p[i] && p[i] !== '.';
    const breakBar = S.riser && bar % 8 === 7;
    if (on(S.kick, st) && !breakBar) this.kick(t, S.kick[st] === 'o' ? .55 : 1, S.hardKick);
    if (on(S.clap, st)) { this.drumNoise(t, .14, { ft: 'bandpass', f: S.snareF || 1600, vol: S.clap[st] === 'o' ? .18 : .42, q: .8 }); if (!S.rim) this.drumNoise(t + .012, .1, { ft: 'bandpass', f: 2200, vol: .25 }); }
    if (on(S.hat, st)) this.drumNoise(t, S.hat[st] === 'O' ? .1 : .035, { ft: 'highpass', f: 8000, vol: S.hat[st] === 'o' ? .06 : .14 });
    if (breakBar && st >= 8 && st % 2 === 0) this.drumNoise(t, .06, { ft: 'bandpass', f: 1600 + st * 200, vol: .3 });
    if (on(S.bass, st)) { const oct = S.bassOct ? S.bassOct[st % S.bassOct.length] : 0; this.synth(mid(root - 24 + oct), t, s * (S.bassLen || 1.6), { type: S.bassType || 'sawtooth', lp: S.bassLp || 900, lp2: 220, q: S.bassQ || 6, vol: .26 }); }
    if (S.pad && st === 0) for (const n of ch.slice(0, S.maj7 ? 4 : 3)) this.synth(mid(root + n), t, s * 15, { type: 'sawtooth', lp: S.padLp || 1400, vol: .022, attack: s * 3, det: n * 3 - 6 });
    if (on(S.stab, st)) for (const n of ch.slice(0, 3)) this.synth(mid(root + 12 + n), t, s * 1.2, { type: S.stabType || 'square', lp: 3200, vol: .035 });
    if (on(S.keys, st)) for (const n of ch) this.synth(mid(root + 12 + n), t, s * 6, { type: 'triangle', vol: .045, attack: .01, echo: true });
    if (S.lead && on(S.leadOn, st)) { const deg = S.lead[st % S.lead.length]; if (deg >= 0) this.synth(mid(root + (S.leadOct || 12) + ch[deg % ch.length] + (deg >= ch.length ? 12 : 0)), t, s * (S.leadLen || 1.4), { type: S.leadType || 'square', lp: S.leadLp || 4200, vol: S.leadVol || .05, echo: true }); }
    if (S.bell && st === 6 && bar % 2 === 1) this.synth(mid(root + 31), t, s * 8, { type: 'sine', vol: .05, echo: true });
    if (S.riser && bar % 8 === 7 && st === 0) { this.synth(200, t, s * 16, { type: 'sawtooth', slide: 2000, sd: s * 16, lp: 3000, vol: .03, attack: s * 8 }); this.drumNoise(t + s * 12, s * 4, { ft: 'highpass', f: 4000, vol: .12 }); }
  },
};


// 曲目：x=重拍 o=輕拍 O=開放 hi-hat  . =休止
const AM = [[57, 1], [53, 0], [48, 0], [55, 0]];
const SONGS = {
  menu:   { bpm: 104, prog: AM, kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', bassOct: [0, 12], pad: true, lead: [0, 1, 2, 3, 2, 1, 2, 3], leadOn: 'x.x.x.x.x.x.x.x.', leadType: 'sawtooth', leadLp: 2600, leadLen: 2, bell: true },
  shop:   { bpm: 94, swing: .2, maj7: true, prog: [[48, 0], [57, 1], [50, 1], [55, 0]], kick: 'x......x..x.....', clap: '....x.......x...', rim: 1, snareF: 2600, hat: 'xoxoxoxoxoxoxoxo', bass: 'x...x.x...x.x...', bassType: 'triangle', bassLp: 700, bassQ: 1, bassLen: 2.5, keys: 'x.......x.......', lead: [3, -1, 2, -1, 1, -1, 0, -1], leadOn: '..x...x...x.x...', leadType: 'sine', leadVol: .06, leadOct: 24 },
  casino: { bpm: 118, prog: [[50, 1], [55, 0], [48, 0], [57, 1]], kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'o.O.o.O.o.O.o.O.', bass: 'x.xx.x.xx.xx.x.x', bassOct: [0, 12, 0, 0, 12], bassLen: .9, bassLp: 1400, stab: '...x..x....x..x.', stabType: 'sawtooth', lead: [0, 2, 1, 3, 2, 0, 3, 1], leadOn: 'x..x..x.x..x..x.', leadType: 'square', leadVol: .045, riser: 1 },
  build:  { bpm: 112, prog: AM, kick: 'x.......x.......', clap: '........x.......', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', pad: true, padLp: 1000, lead: [0, -1, -1, 2, -1, -1, 1, -1], leadOn: 'x..x..x.........', leadType: 'triangle', leadVol: .06, bell: true },
  wave:   { bpm: 132, prog: AM, kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'oxOxoxOxoxOxoxOx', bass: '..x...x...x...x.', pad: true, padLp: 2200, lead: [0, 2, 1, 3, 0, 2, 1, 2, 0, 2, 1, 3, 2, 1, 0, 3], leadOn: 'xxxxxxxxxxxxxxxx', leadType: 'square', riser: 1 },
  boss:   { bpm: 142, prog: [[57, 1], [58, 0], [57, 1], [56, 1]], hardKick: 1, kick: 'x..xx...x..xx...', clap: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xxx.xxx.xxx.xx', bassLp: 1800, bassQ: 10, bassLen: .8, stab: 'x.....x.....x...', stabType: 'sawtooth', lead: [3, 2, 1, 0, 1, 2, 3, 2], leadOn: 'x.x.x.x.x.x.x.x.', leadType: 'sawtooth', leadLp: 3000, riser: 1 },
  bonus:  { bpm: 150, prog: [[48, 0], [55, 0], [57, 1], [53, 0]], kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'oxOxoxOxoxOxoxOx', bass: '..x...x...x...x.', pad: true, padLp: 3000, stab: 'x..x..x.....x...', lead: [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2], leadOn: 'xxxxxxxxxxxxxxxx', leadType: 'square', leadOct: 24, bell: true, riser: 1 },
};

const SFX = {
  lose() { AU.tone(330, .25, { type: 'triangle', vol: .08, slide: 220 }); AU.tone(220, .35, { type: 'triangle', vol: .08, slide: 140, delay: .18 }); },
  dice() { for (let k = 0; k < 8; k++) AU.noise(.05, { ft: 'bandpass', f: 1800 + Math.random() * 1500, vol: .12, delay: k * .13 }); },
  pkTick(r = 0) { if (AU.thr('pk', 25)) AU.tone(900 + r * 90, .03, { type: 'sine', vol: .05 }); },
  lever() { AU.noise(.25, { ft: 'bandpass', f: 500, f2: 150, vol: .25, q: 3 }); AU.tone(90, .2, { type: 'square', vol: .1, slide: 50 }); },
  reach() { [0, .12, .24].forEach((d, i) => AU.tone(880 * Math.pow(1.26, i), .25, { type: 'square', vol: .08, delay: d, echo: true })); AU.tone(110, 1.2, { type: 'sawtooth', vol: .07, slide: 440, attack: .2 }); },
  nudge() { [523, 784, 1047, 1568].forEach((f, i) => AU.tone(f, .2, { type: 'triangle', vol: .1, delay: i * .05, echo: true })); },
  lottoTick(k = 0) { if (AU.thr('lt', 20)) AU.tone(1200 + k * 900, .04, { type: 'square', vol: .06 }); },
  lottoHit() { AU.noise(.5, { f: 1500, f2: 100, vol: .3 }); [523, 659, 784, 1047, 1319].forEach((f, i) => AU.tone(f, .4, { type: 'square', vol: .07, delay: i * .05, echo: true })); },
  nova() { if (AU.thr('nova', 120)) { AU.tone(300, .5, { type: 'sine', vol: .18, slide: 60 }); AU.noise(.4, { ft: 'bandpass', f: 2500, f2: 300, vol: .15 }); } },
  ult() { AU.tone(60, 1.2, { type: 'sawtooth', vol: .2, slide: 30 }); AU.noise(1.2, { f: 3000, f2: 100, vol: .35 }); [784, 1047, 1568, 2093].forEach((f, i) => AU.tone(f, .5, { type: 'square', vol: .06, delay: .1 + i * .07, echo: true })); },
  spell(el) { AU.noise(1, { ft: 'bandpass', f: el === 'ice' ? 4000 : el === 'thunder' ? 3000 : 600, f2: 200, vol: .3, q: 2 }); AU.tone(el === 'ice' ? 1200 : 200, .8, { type: 'sawtooth', vol: .1, slide: el === 'ice' ? 300 : 60 }); [392, 523, 659, 784].forEach((f, i) => AU.tone(f, .3, { type: 'square', vol: .05, delay: i * .06, echo: true })); },
  chip() { AU.tone(2400, .08, { type: 'sine', vol: .08, delay: .03 }); },
  click() { AU.tone(880, .05, { type: 'square', vol: .05 }); AU.tone(1320, .04, { type: 'sine', vol: .05, delay: .02 }); },
  hover() { if (AU.thr('hov', 60)) AU.tone(1600, .025, { type: 'sine', vol: .025 }); },
  error() { AU.tone(180, .12, { type: 'square', vol: .07 }); AU.tone(140, .15, { type: 'square', vol: .07, delay: .1 }); },
  spin() { AU.noise(.5, { ft: 'bandpass', f: 400, f2: 3000, vol: .12, q: 2 }); AU.tone(220, .4, { type: 'sawtooth', vol: .04, slide: 660 }); },
  tick() { if (AU.thr('tick', 55)) AU.tone(1200 + Math.random() * 400, .025, { type: 'square', vol: .025 }); },
  stop(i) { AU.tone(200 - i * 10, .14, { type: 'triangle', vol: .32, slide: 80 }); AU.noise(.06, { f: 1200, vol: .12 }); },
  antic(i) { AU.tone(330 * Math.pow(1.26, i), .9, { type: 'sawtooth', vol: .05, slide: 330 * Math.pow(1.26, i) * 1.5, attack: .3 }); AU.tone(60, .25, { type: 'sine', vol: .4, slide: 40 }); AU.tone(60, .25, { type: 'sine', vol: .3, slide: 40, delay: .3 }); },
  win(ch = 1) { const k = Math.pow(1.122, Math.min(12, ch - 1)); [523, 659, 784, 1047].forEach((f, i) => AU.tone(f * k, .22, { type: 'triangle', vol: .13, delay: i * .05, echo: true })); AU.tone(1568 * k, .4, { type: 'sine', vol: .05, delay: .2, echo: true }); },
  winEnd() { [784, 1047, 1319].forEach((f, i) => AU.tone(f, .3, { type: 'sine', vol: .08, delay: i * .07, echo: true })); },
  land(i) { if (AU.thr('land', 50)) { AU.tone(150 - i * 8, .08, { type: 'triangle', vol: .18, slide: 70 }); AU.noise(.04, { f: 2500, vol: .05 }); } },
  pop(ch = 1) { const k = Math.pow(1.12, Math.min(12, ch)); AU.noise(.25, { ft: 'bandpass', f: 1200 * k, f2: 300, vol: .22, q: 2 }); AU.tone(300 * k, .2, { type: 'square', vol: .06, slide: 1200 * k }); [1047, 1568, 2093].forEach((f, i) => AU.tone(f * k, .12, { type: 'sine', vol: .05, delay: .05 + i * .03, echo: true })); },
  orb(k = 1) { const f = 523 * Math.pow(1.19, Math.min(14, k)); AU.tone(f, .35, { type: 'square', vol: .06, echo: true }); AU.tone(f * 2, .4, { type: 'sine', vol: .07, delay: .03, echo: true }); AU.noise(.2, { ft: 'highpass', f: 5000, vol: .06 }); },
  multApply(M = 2) { AU.noise(.6, { f: 900, f2: 60, vol: .3 }); AU.tone(60, .6, { type: 'sine', vol: .35, slide: 30 }); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => AU.tone(f, .5, { type: 'sawtooth', vol: .04, delay: .05 + i * .04, echo: true })); },
  tierUp(t = 2) { const base = 392 * Math.pow(1.12, t); [1, 1.26, 1.5, 2, 2.52, 3].slice(0, 2 + t).forEach((m, i) => AU.tone(base * m, .45, { type: i % 2 ? 'square' : 'triangle', vol: .07, delay: i * .06, echo: true })); if (t >= 5) { AU.noise(1, { ft: 'highpass', f: 4000, vol: .08, delay: .2 }); AU.tone(80, .8, { type: 'sine', vol: .3, slide: 40 }); } },
  bigwin() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => AU.tone(f, .35, { type: 'square', vol: .07, delay: i * .07, echo: true }));
    [262, 330, 392].forEach(f => AU.tone(f, 1.4, { type: 'sawtooth', vol: .06, delay: .45, attack: .05 }));
  },
  megawin() {
    const seq = [392, 523, 659, 784, 1047, 784, 1047, 1319, 1568, 2093];
    seq.forEach((f, i) => AU.tone(f, .3, { type: 'square', vol: .07, delay: i * .08, echo: true }));
    [262, 330, 392, 523].forEach(f => AU.tone(f, 2, { type: 'sawtooth', vol: .05, delay: .8, attack: .05 }));
    AU.noise(1.2, { ft: 'highpass', f: 4000, vol: .08, delay: .8 });
  },
  jackpot() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1047, 1319, 1568, 2093, 1568, 2093, 2637];
    seq.forEach((f, i) => AU.tone(f, .28, { type: 'square', vol: .07, delay: i * .085, echo: true }));
    [[262, 330, 392], [349, 440, 523], [392, 494, 587], [523, 659, 784]].forEach((c, j) =>
      c.forEach(f => AU.tone(f, .9, { type: 'sawtooth', vol: .045, delay: 1.2 + j * .45, attack: .03 })));
    AU.noise(2.5, { ft: 'highpass', f: 5000, vol: .07, delay: 1.2 });
    for (let i = 0; i < 6; i++) AU.noise(.5, { f: 300, f2: 60, vol: .25, delay: 1.2 + i * .45 });
  },
  coin() { if (AU.thr('coin', 35)) { const f = 1800 + Math.random() * 900; AU.tone(f, .07, { type: 'square', vol: .03 }); AU.tone(f * 1.5, .12, { type: 'sine', vol: .04, delay: .04 }); } },
  gem() { [1568, 2093, 2637].forEach((f, i) => AU.tone(f, .2, { type: 'sine', vol: .07, delay: i * .05, echo: true })); },
  heal() { [523, 784, 1047].forEach((f, i) => AU.tone(f, .3, { type: 'sine', vol: .08, delay: i * .07 })); },
  shoot(el) {
    if (!AU.thr('sh_' + el, 85)) return;
    switch (el) {
      case 'fire': AU.noise(.14, { ft: 'bandpass', f: 900, f2: 300, vol: .06, q: 1.5 }); break;
      case 'ice': AU.tone(1500, .09, { type: 'sine', vol: .035, slide: 2400 }); break;
      case 'thunder': AU.noise(.12, { ft: 'highpass', f: 3000, vol: .06 }); AU.tone(110, .1, { type: 'square', vol: .03, slide: 60 }); break;
      case 'poison': AU.tone(320, .12, { type: 'sine', vol: .045, slide: 620 }); break;
      case 'wind': AU.noise(.07, { ft: 'highpass', f: 2500, vol: .035 }); break;
      case 'earth': AU.tone(95, .25, { type: 'triangle', vol: .18, slide: 45 }); AU.noise(.12, { f: 500, vol: .06 }); break;
      case 'beam': AU.tone(140, .2, { type: 'sawtooth', vol: .02, slide: 160 }); break;
      case 'rail': AU.tone(1800, .35, { type: 'sawtooth', vol: .06, slide: 120 }); AU.noise(.3, { ft: 'bandpass', f: 2000, vol: .08 }); break;
      case 'pulse': AU.tone(200, .3, { type: 'sine', vol: .08, slide: 80 }); AU.noise(.2, { f: 1500, f2: 200, vol: .05 }); break;
    }
  },
  boom() { if (AU.thr('boom', 70)) { AU.noise(.35, { f: 800, f2: 80, vol: .2 }); AU.tone(70, .3, { type: 'sine', vol: .25, slide: 35 }); } },
  die() { if (AU.thr('die', 45)) AU.tone(600 + Math.random() * 200, .09, { type: 'triangle', vol: .05, slide: 200 }); },
  bigdie() { AU.noise(1, { f: 1200, f2: 60, vol: .35 }); AU.tone(80, 1, { type: 'sawtooth', vol: .12, slide: 30 }); [784, 1047, 1319, 1568].forEach((f, i) => AU.tone(f, .3, { type: 'square', vol: .05, delay: .3 + i * .08, echo: true })); },
  hurt() { AU.tone(140, .35, { type: 'sawtooth', vol: .16, slide: 50 }); AU.noise(.3, { f: 600, vol: .15 }); },
  merge() { [659, 880, 1175, 1568].forEach((f, i) => AU.tone(f, .22, { type: 'triangle', vol: .09, delay: i * .05, echo: true })); },
  fuse() { [523, 784, 1047, 1568, 2093].forEach((f, i) => AU.tone(f, .3, { type: 'sine', vol: .1, delay: i * .06, echo: true })); AU.noise(.6, { ft: 'highpass', f: 4000, vol: .05 }); },
  place() { AU.tone(300, .1, { type: 'triangle', vol: .15, slide: 150 }); AU.noise(.08, { f: 900, vol: .08 }); },
  sell() { [1568, 1319, 1047].forEach((f, i) => AU.tone(f, .08, { type: 'square', vol: .04, delay: i * .04 })); },
  wave() { [262, 330, 392].forEach(f => AU.tone(f, .8, { type: 'sawtooth', vol: .05, attack: .05 })); AU.tone(131, .8, { type: 'square', vol: .05 }); },
  clear() { [523, 659, 784, 1047].forEach((f, i) => AU.tone(f, .4, { type: 'triangle', vol: .1, delay: i * .1, echo: true })); },
  flip() { AU.noise(.12, { ft: 'bandpass', f: 1800, vol: .12 }); },
  reveal(r) { const base = [523, 659, 784, 1047][r || 0]; [1, 1.25, 1.5, 2].forEach((m, i) => AU.tone(base * m, .3 + r * .1, { type: 'triangle', vol: .09, delay: i * .07, echo: true })); },
  wtick() { if (AU.thr('wt', 30)) AU.tone(2200, .02, { type: 'square', vol: .05 }); },
  fever() { AU.tone(200, 1.2, { type: 'sawtooth', vol: .08, slide: 1600, attack: .1 }); [523, 659, 784, 1047, 1319].forEach((f, i) => AU.tone(f, .5, { type: 'square', vol: .06, delay: .9 + i * .06, echo: true })); },
  stomp() { AU.noise(.6, { f: 400, f2: 40, vol: .35 }); AU.tone(50, .6, { type: 'sine', vol: .4, slide: 25 }); },
  discover() { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => AU.tone(f, .25, { type: 'sine', vol: .07, delay: i * .05, echo: true })); },
};
