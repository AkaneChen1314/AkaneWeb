/*
 * ============================================================
 *  02-audio.js ── 音效與背景音樂
 * ------------------------------------------------------------
 *  所有聲音都用 Web Audio「即時合成」，不需要任何音檔：
 *    - 槍聲 = 短促的雜訊 + 低頻震動
 *    - 爆炸 = 很長的低頻雜訊
 *    - 介面提示音 = 簡單的正弦波／方波
 *  也因此直接雙擊 index.html 就能有聲音。
 *
 *  使用方式：
 *    Sound.play("ar")                         播放自己的步槍聲
 *    Sound.play("explosion", { pos: 位置 })   播放有方向與距離感的聲音
 * ============================================================
 */

const Sound = {
  ctx: null, // AudioContext，第一次使用者點擊後才建立（瀏覽器規定）
  master: null, // 主音量
  sfx: null, // 音效音量
  musicGain: null, // 音樂音量
  noise: null, // 預先產生的白雜訊（槍聲、爆炸的原料）
  voices: 0, // 目前同時播放的聲音數量
  volume: { master: 0.8, music: 0.35 },

  // 聽者（玩家）的位置與面向，用來計算左右聲道與距離衰減
  listener: { x: 0, y: 0, z: 0, yaw: 0 },

  /* ---------- 初始化 ---------- */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // 很舊的瀏覽器沒有 Web Audio，就靜音執行
    this.ctx = new AC();

    // 壓縮器：很多聲音同時出現時自動壓低，避免破音
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.connect(comp);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.applyVolume();

    // 兩秒的白雜訊
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  },

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.musicGain.gain.value = this.volume.music;
  },

  /* ---------- 空間感 ----------
   * 回傳 { gain 音量倍率, pan 左右聲道 }；太遠聽不到時回傳 null。 */
  spatial(pos, range) {
    if (!pos) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.x;
    const dz = pos.z - L.z;
    const dist = Math.hypot(dx, dz, (pos.y || 0) - L.y);
    if (dist > range) return null;

    // 距離越遠越小聲
    const gain = Math.pow(1 - dist / range, 1.6);

    // 把聲源方向轉到「以玩家面向為準」的座標，x 分量就是左右
    const right = dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw);
    const pan = Util.clamp(right / Math.max(dist, 1), -1, 1) * 0.85;
    return { gain, pan };
  },

  // 建立「音量 → 左右聲道 → 輸出」的節點串，回傳入口節點
  _out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return g;
  },

  /* ---------- 兩種基本原料 ---------- */

  // 雜訊爆音：經過濾波器，頻率從 f0 滑到 f1
  _noise(out, { dur = 0.2, f0 = 2000, f1 = 300, type = "lowpass", q = 0.8, vol = 1, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t, Math.random()); // 從隨機位置開始，每次聽起來略有不同
    src.stop(t + dur + 0.02);

    this.voices++;
    src.onended = () => this.voices--;
  },

  // 音調：頻率從 f0 滑到 f1
  _tone(out, { dur = 0.15, f0 = 440, f1 = 440, type = "sine", vol = 0.5, delay = 0, attack = 0.004 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    this.voices++;
    osc.onended = () => this.voices--;
  },

  /* ---------- 播放入口 ----------
   * name : 聲音名稱（見下方 RECIPES）
   * opt  : { pos 聲源位置, vol 音量倍率 }
   */
  play(name, opt = {}) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const recipe = this.RECIPES[name];
    if (!recipe) return;

    const range = recipe.range || 60;
    const sp = this.spatial(opt.pos, range);
    if (!sp) return;

    // 同時太多聲音時，丟掉遠處、不重要的
    if (this.voices > 40 && sp.gain < 0.5) return;
    if (this.voices > 70) return;

    const out = this._out((opt.vol ?? 1) * sp.gain * (recipe.vol ?? 1), sp.pan);
    recipe.make.call(this, out, opt);
  },

  /* ---------- 聲音配方 ----------
   * 每個配方的 make(out) 把幾個雜訊／音調疊在一起。 */
  RECIPES: {
    // ── 槍聲 ──
    ar: { range: 90, make(o) {
      this._noise(o, { dur: 0.16, f0: 5200, f1: 500, vol: 0.9 });
      this._noise(o, { dur: 0.03, f0: 9000, f1: 4000, type: "highpass", vol: 0.5 });
      this._tone(o, { dur: 0.1, f0: 190, f1: 55, vol: 0.7 });
    } },
    smg: { range: 80, make(o) {
      this._noise(o, { dur: 0.1, f0: 6500, f1: 900, vol: 0.75 });
      this._tone(o, { dur: 0.07, f0: 240, f1: 80, vol: 0.5 });
    } },
    shotgun: { range: 100, make(o) {
      this._noise(o, { dur: 0.34, f0: 3600, f1: 180, vol: 1.1 });
      this._noise(o, { dur: 0.05, f0: 8000, f1: 3000, type: "highpass", vol: 0.6 });
      this._tone(o, { dur: 0.22, f0: 130, f1: 38, vol: 1.0 });
    } },
    sniper: { range: 130, make(o) {
      this._noise(o, { dur: 0.5, f0: 6000, f1: 160, vol: 1.1 });
      this._tone(o, { dur: 0.3, f0: 160, f1: 34, vol: 1.0 });
      this._noise(o, { dur: 0.9, f0: 1200, f1: 200, vol: 0.25, delay: 0.08 }); // 遠方回音
    } },
    lmg: { range: 95, make(o) {
      this._noise(o, { dur: 0.19, f0: 4200, f1: 380, vol: 0.95 });
      this._tone(o, { dur: 0.13, f0: 150, f1: 48, vol: 0.85 });
    } },
    pistol: { range: 75, make(o) {
      this._noise(o, { dur: 0.12, f0: 5600, f1: 700, vol: 0.8 });
      this._tone(o, { dur: 0.08, f0: 260, f1: 70, vol: 0.55 });
    } },
    launcher: { range: 80, make(o) {
      this._tone(o, { dur: 0.25, f0: 210, f1: 60, vol: 0.9, type: "triangle" });
      this._noise(o, { dur: 0.22, f0: 1800, f1: 240, vol: 0.7 });
    } },
    plasma: { range: 75, make(o) {
      this._tone(o, { dur: 0.16, f0: 1500, f1: 280, vol: 0.4, type: "sawtooth" });
      this._tone(o, { dur: 0.12, f0: 760, f1: 190, vol: 0.35, type: "square" });
      this._noise(o, { dur: 0.08, f0: 7000, f1: 2500, type: "bandpass", q: 2, vol: 0.35 });
    } },

    // ── 換彈與槍械動作 ──
    magOut: { range: 12, make(o) {
      this._noise(o, { dur: 0.05, f0: 3200, f1: 1200, type: "bandpass", q: 3, vol: 0.5 });
      this._tone(o, { dur: 0.05, f0: 420, f1: 240, vol: 0.2, type: "square" });
    } },
    magIn: { range: 12, make(o) {
      this._noise(o, { dur: 0.06, f0: 2400, f1: 900, type: "bandpass", q: 3, vol: 0.6 });
      this._tone(o, { dur: 0.06, f0: 300, f1: 180, vol: 0.25, type: "square" });
    } },
    bolt: { range: 12, make(o) {
      this._noise(o, { dur: 0.04, f0: 5200, f1: 2600, type: "bandpass", q: 4, vol: 0.55 });
      this._noise(o, { dur: 0.05, f0: 3600, f1: 1800, type: "bandpass", q: 4, vol: 0.55, delay: 0.09 });
    } },
    empty: { range: 8, make(o) {
      this._tone(o, { dur: 0.04, f0: 1300, f1: 900, vol: 0.2, type: "square" });
    } },
    swap: { range: 8, make(o) {
      this._noise(o, { dur: 0.09, f0: 1600, f1: 3800, type: "bandpass", q: 2, vol: 0.35 });
    } },

    // ── 命中回饋 ──
    hit: { make(o) {
      this._tone(o, { dur: 0.05, f0: 1900, f1: 1400, vol: 0.22, type: "triangle" });
    } },
    headshot: { make(o) {
      this._tone(o, { dur: 0.09, f0: 2600, f1: 2200, vol: 0.3, type: "triangle" });
      this._tone(o, { dur: 0.16, f0: 3900, f1: 3300, vol: 0.2, delay: 0.03 });
    } },
    kill: { make(o) {
      this._tone(o, { dur: 0.1, f0: 880, f1: 880, vol: 0.25, type: "triangle" });
      this._tone(o, { dur: 0.2, f0: 1320, f1: 1320, vol: 0.25, type: "triangle", delay: 0.07 });
    } },
    hurt: { make(o) {
      this._tone(o, { dur: 0.12, f0: 150, f1: 70, vol: 0.5, type: "sawtooth" });
      this._noise(o, { dur: 0.08, f0: 900, f1: 300, vol: 0.4 });
    } },
    armorHit: { make(o) {
      this._tone(o, { dur: 0.07, f0: 900, f1: 500, vol: 0.3, type: "square" });
    } },
    impact: { range: 30, vol: 0.5, make(o) {
      this._noise(o, { dur: 0.05, f0: 4200, f1: 1500, type: "bandpass", q: 2, vol: 0.5 });
    } },
    whiz: { range: 20, vol: 0.5, make(o) { // 子彈從耳邊飛過
      this._noise(o, { dur: 0.12, f0: 5000, f1: 1500, type: "bandpass", q: 6, vol: 0.5 });
    } },

    // ── 爆炸與近戰 ──
    explosion: { range: 150, make(o) {
      this._noise(o, { dur: 1.1, f0: 2400, f1: 60, vol: 1.3 });
      this._tone(o, { dur: 0.7, f0: 110, f1: 26, vol: 1.2 });
      this._noise(o, { dur: 0.07, f0: 9000, f1: 2000, type: "highpass", vol: 0.5 });
    } },
    melee: { range: 15, make(o) {
      this._noise(o, { dur: 0.14, f0: 900, f1: 4200, type: "bandpass", q: 1.5, vol: 0.5 });
    } },
    throw: { range: 15, make(o) {
      this._noise(o, { dur: 0.16, f0: 700, f1: 2600, type: "bandpass", q: 1.2, vol: 0.35 });
    } },
    bounce: { range: 30, make(o) {
      this._tone(o, { dur: 0.05, f0: 700, f1: 380, vol: 0.3, type: "square" });
    } },

    // ── 移動 ──
    step: { range: 16, vol: 0.5, make(o) {
      this._noise(o, { dur: 0.07, f0: 700 + Math.random() * 300, f1: 160, vol: 0.5 });
    } },
    jump: { range: 14, make(o) {
      this._noise(o, { dur: 0.1, f0: 500, f1: 1400, type: "bandpass", vol: 0.3 });
    } },
    land: { range: 16, make(o) {
      this._noise(o, { dur: 0.13, f0: 600, f1: 90, vol: 0.6 });
      this._tone(o, { dur: 0.1, f0: 110, f1: 50, vol: 0.4 });
    } },

    // ── 道具與技能 ──
    pickup: { make(o) {
      this._tone(o, { dur: 0.09, f0: 660, f1: 660, vol: 0.25, type: "triangle" });
      this._tone(o, { dur: 0.16, f0: 990, f1: 990, vol: 0.25, type: "triangle", delay: 0.07 });
    } },
    skill: { make(o) {
      this._tone(o, { dur: 0.4, f0: 220, f1: 1320, vol: 0.3, type: "sawtooth" });
      this._tone(o, { dur: 0.5, f0: 440, f1: 1760, vol: 0.2, delay: 0.05 });
    } },
    dash: { make(o) {
      this._noise(o, { dur: 0.3, f0: 400, f1: 6000, type: "bandpass", q: 1, vol: 0.6 });
    } },
    strikeCall: { range: 200, make(o) { // 軌道打擊蓄能
      this._tone(o, { dur: 1.3, f0: 120, f1: 1900, vol: 0.4, type: "sawtooth", attack: 0.3 });
    } },
    beam: { range: 200, make(o) {
      this._tone(o, { dur: 0.9, f0: 90, f1: 30, vol: 1.1 });
      this._noise(o, { dur: 1.3, f0: 5000, f1: 80, vol: 1.2 });
      this._tone(o, { dur: 0.5, f0: 2400, f1: 300, vol: 0.4, type: "sawtooth" });
    } },

    // ── 首領 ──
    bossRoar: { range: 250, make(o) {
      this._tone(o, { dur: 1.4, f0: 95, f1: 42, vol: 0.9, type: "sawtooth", attack: 0.15 });
      this._tone(o, { dur: 1.4, f0: 143, f1: 60, vol: 0.5, type: "square", attack: 0.2 });
      this._noise(o, { dur: 1.2, f0: 800, f1: 150, vol: 0.5 });
    } },
    charge: { range: 150, make(o) { // 招式預警
      this._tone(o, { dur: 0.7, f0: 300, f1: 1500, vol: 0.35, type: "square", attack: 0.2 });
    } },
    laser: { range: 150, make(o) {
      this._tone(o, { dur: 0.5, f0: 1800, f1: 600, vol: 0.3, type: "sawtooth" });
      this._noise(o, { dur: 0.5, f0: 6000, f1: 3000, type: "bandpass", q: 3, vol: 0.3 });
    } },
    stomp: { range: 200, make(o) {
      this._tone(o, { dur: 0.6, f0: 80, f1: 22, vol: 1.3 });
      this._noise(o, { dur: 0.5, f0: 700, f1: 60, vol: 1.0 });
    } },
    blink: { range: 100, make(o) {
      this._tone(o, { dur: 0.25, f0: 2400, f1: 200, vol: 0.35, type: "sine" });
      this._noise(o, { dur: 0.2, f0: 8000, f1: 1000, type: "bandpass", q: 2, vol: 0.3 });
    } },

    // ── 介面 ──
    uiHover: { make(o) {
      this._tone(o, { dur: 0.04, f0: 1200, f1: 1200, vol: 0.08, type: "triangle" });
    } },
    uiClick: { make(o) {
      this._tone(o, { dur: 0.07, f0: 700, f1: 1050, vol: 0.18, type: "triangle" });
    } },
    uiStart: { make(o) {
      this._tone(o, { dur: 0.5, f0: 220, f1: 880, vol: 0.25, type: "sawtooth" });
      this._tone(o, { dur: 0.6, f0: 330, f1: 1320, vol: 0.2, type: "triangle", delay: 0.06 });
    } },
    announce: { make(o) { // 連殺、波次等大字提示
      this._tone(o, { dur: 0.14, f0: 523, f1: 523, vol: 0.22, type: "triangle" });
      this._tone(o, { dur: 0.14, f0: 659, f1: 659, vol: 0.22, type: "triangle", delay: 0.1 });
      this._tone(o, { dur: 0.3, f0: 784, f1: 784, vol: 0.22, type: "triangle", delay: 0.2 });
    } },
    capture: { make(o) {
      this._tone(o, { dur: 0.2, f0: 440, f1: 440, vol: 0.22, type: "triangle" });
      this._tone(o, { dur: 0.35, f0: 880, f1: 880, vol: 0.22, type: "triangle", delay: 0.15 });
    } },
    warning: { make(o) {
      this._tone(o, { dur: 0.18, f0: 620, f1: 620, vol: 0.22, type: "square" });
      this._tone(o, { dur: 0.18, f0: 620, f1: 620, vol: 0.22, type: "square", delay: 0.26 });
    } },
    victory: { make(o) {
      [523, 659, 784, 1047].forEach((f, i) =>
        this._tone(o, { dur: 0.5, f0: f, f1: f, vol: 0.25, type: "triangle", delay: i * 0.14 }));
    } },
    defeat: { make(o) {
      [392, 330, 262, 196].forEach((f, i) =>
        this._tone(o, { dur: 0.6, f0: f, f1: f * 0.97, vol: 0.25, type: "sawtooth", delay: i * 0.2 }));
    } },
  },

  /* ============================================================
   *  背景音樂：簡單的 16 步音序器
   *  每一步（十六分音符）依照固定樣式觸發 大鼓／鼓刷／貝斯／琶音。
   * ============================================================ */
  music: {
    timer: null,
    step: 0,
    nextTime: 0,
    root: 55, // 根音頻率（每張地圖不同）
    tempo: 112,
    intensity: 0.5, // 0 平靜 ～ 1 激戰（決定鼓點多寡）
    scale: [0, 3, 5, 7, 10, 12, 15], // 小調五聲音階（半音數）
  },

  startMusic(root = 55, tempo = 112) {
    if (!this.ctx) return;
    this.stopMusic();
    const m = this.music;
    m.root = root;
    m.tempo = tempo;
    m.step = 0;
    m.nextTime = this.ctx.currentTime + 0.1;
    // 每 60 毫秒檢查一次，把接下來 0.2 秒內該出現的音先排好
    m.timer = setInterval(() => this._musicTick(), 60);
  },

  stopMusic() {
    if (this.music.timer) clearInterval(this.music.timer);
    this.music.timer = null;
  },

  _musicTick() {
    const m = this.music;
    if (!this.ctx || this.ctx.state !== "running") return;
    const stepDur = 60 / m.tempo / 4;
    // 分頁切走太久時直接跳到現在，避免一口氣補播一大串
    if (m.nextTime < this.ctx.currentTime - 0.5) m.nextTime = this.ctx.currentTime;

    while (m.nextTime < this.ctx.currentTime + 0.2) {
      this._musicStep(m.step, m.nextTime - this.ctx.currentTime, stepDur);
      m.step = (m.step + 1) % 64;
      m.nextTime += stepDur;
    }
  },

  // 半音數 → 頻率
  _note(semi) {
    return this.music.root * Math.pow(2, semi / 12);
  },

  _musicStep(step, delay, stepDur) {
    const m = this.music;
    const out = this.musicGain;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const hot = m.intensity;

    // 大鼓：每拍一下，激戰時加上切分
    if (s16 % 4 === 0 || (hot > 0.6 && s16 === 10)) {
      this._tone(out, { dur: 0.22, f0: 130, f1: 38, vol: 0.55, delay });
    }
    // 鼓刷：反拍；激戰時每一步都有
    if (s16 % 4 === 2 || (hot > 0.5 && s16 % 2 === 1)) {
      this._noise(out, { dur: 0.04, f0: 9000, f1: 6000, type: "highpass", vol: s16 % 4 === 2 ? 0.12 : 0.05, delay });
    }
    // 小鼓：第 2、4 拍
    if (hot > 0.35 && (s16 === 4 || s16 === 12)) {
      this._noise(out, { dur: 0.13, f0: 2600, f1: 700, type: "bandpass", q: 0.8, vol: 0.2, delay });
    }
    // 貝斯：四個小節循環的根音走向
    const bassLine = [0, 0, -4, -2];
    if ([0, 3, 6, 8, 11, 14].includes(s16)) {
      const f = this._note(bassLine[bar % 4]);
      this._tone(out, { dur: stepDur * 1.6, f0: f, f1: f, vol: 0.22, type: "sawtooth", delay, attack: 0.01 });
    }
    // 琶音：在音階上來回
    if (s16 % 2 === 0) {
      const idx = [0, 2, 4, 5, 4, 2, 3, 1][(s16 / 2 + bar * 3) % 8];
      const f = this._note(m.scale[idx] + bassLine[bar % 4] + 24);
      this._tone(out, { dur: stepDur * 1.8, f0: f, f1: f, vol: 0.05 + hot * 0.04, type: "triangle", delay });
    }
    // 鋪底長音：每小節開頭
    if (s16 === 0) {
      const f = this._note(bassLine[bar % 4] + 12);
      this._tone(out, { dur: stepDur * 15, f0: f, f1: f, vol: 0.06, type: "sine", delay, attack: 0.4 });
      this._tone(out, { dur: stepDur * 15, f0: f * 1.5, f1: f * 1.5, vol: 0.04, type: "sine", delay, attack: 0.4 });
    }
  },
};
