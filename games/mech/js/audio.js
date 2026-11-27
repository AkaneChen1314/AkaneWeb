"use strict";
// ============================================================
//  音訊：音效（SND）與背景音樂（MUSIC）
//  ・音效全部用 WebAudio 即時合成，不需要音檔
//  ・音樂優先播放 music/ 資料夾裡的音檔；沒有音檔就用內建的合成音樂
//  ・音效與音樂各有獨立的音量（SND.setVol）
// ============================================================
const SND = {
  // ctx = 瀏覽器的音訊引擎；master = 音效的總音量；music = 音樂的總音量；noiseBuf = 一秒的白噪音
  // last = 每種音效上次播放的時間；enabled = 瀏覽器不支援音訊時會變成 false
  ctx: null,
  master: null,
  music: null,
  noiseBuf: null,
  last: {},
  enabled: true,
  // listener：玩家的位置，用來計算遠處聲音要多小聲
  listener: { x: 0, z: 0 },
  vol: { sfx: 0.8, music: 0.3 }, // 0 ~ 1
  duck: 1, // 暫停時把音樂壓低用的倍率

  // 啟動音訊引擎。瀏覽器規定要等使用者點擊或按鍵後才能出聲，所以是在第一次點擊時才呼叫
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // 壓縮器：很多聲音同時播放時自動壓低，避免爆音
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      // 音效匯流排（沿用 master 這個名字，所有音效都接到這裡）
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol.sfx * 0.6;
      this.master.connect(comp);
      // 音樂匯流排
      this.music = this.ctx.createGain();
      this.music.gain.value = this.vol.music;
      this.music.connect(comp);
      // 一秒的白噪音，給各種噪音類音效用
      const len = this.ctx.sampleRate,
        buf = this.ctx.createBuffer(1, len, len),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.wind();
    } catch (e) {
      this.enabled = false;
    }
  },

  // 調整音量；kind = 'sfx' 或 'music'，v = 0 ~ 1
  setVol(kind, v) {
    this.vol[kind] = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.vol.sfx * 0.6;
    if (this.music) this.music.gain.value = this.vol.music * this.duck;
    if (MUSIC.el) MUSIC.el.volume = clamp(this.vol.music * this.duck, 0, 1);
  },
  // 暫時把音樂壓低（暫停時傳 0.35）或恢復（傳 1）
  setDuck(k) {
    this.duck = k;
    this.setVol("music", this.vol.music);
  },

  // ---- 合成元件：音調與噪音 ----
  // 有音高的聲音：type 波形（sine 柔和 / square 電子 / sawtooth 尖銳）
  // 頻率在 dur 秒內從 f0 滑到 f1，音量從 vol 漸漸變小。delay = 延遲幾秒才開始
  tone(type, f0, f1, dur, vol, delay = 0, bus = this.master) {
    const c = this.ctx,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  // 噪音類的聲音（爆炸、槍聲、風聲）：把白噪音通過濾波器，濾波頻率在 dur 秒內從 f0 滑到 f1
  // type = 濾波器種類（lowpass 悶 / highpass 尖 / bandpass 只留中間）、q = 濾波器的尖銳程度
  noise(
    dur,
    f0,
    f1,
    vol,
    type = "lowpass",
    q = 1,
    delay = 0,
    bus = this.master,
  ) {
    const c = this.ctx,
      t = c.currentTime + delay,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  },
  // 環境風聲（持續播放）
  wind() {
    const c = this.ctx,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    f.type = "bandpass";
    f.frequency.value = 320;
    f.Q.value = 0.6;
    g.gain.value = 0.05;
    // 用一個很慢的波讓風聲的音調忽高忽低
    const lfo = c.createOscillator(),
      lg = c.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(f.frequency);
    lfo.start();
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start();
  },

  // 播放一個音效；gap = 同一種音效的最短間隔（秒），避免疊太多變成噪音
  play(name, vol = 1, gap = 0.035) {
    if (!this.enabled || !this.ctx || vol < 0.02) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const v = vol;
    // 每一種音效都是用幾個 tone / noise 疊出來的
    switch (name) {
      // ── 玩家武器 ──
      case "mg":
        this.noise(0.09, 3200, 500, 0.5 * v, "lowpass");
        this.tone("square", 190, 70, 0.07, 0.22 * v);
        break;
      case "shotgun":
        this.noise(0.3, 2600, 180, 0.9 * v);
        this.tone("sine", 150, 40, 0.25, 0.6 * v);
        break;
      case "plasma":
        this.tone("sawtooth", 900, 160, 0.22, 0.22 * v);
        this.tone("sine", 1400, 300, 0.18, 0.2 * v);
        break;
      case "rail":
        this.tone("sawtooth", 2400, 90, 0.5, 0.35 * v);
        this.noise(0.45, 6000, 300, 0.6 * v, "bandpass", 2);
        this.tone("sine", 90, 30, 0.5, 0.7 * v);
        break;
      case "laser":
        this.tone("square", 1500, 500, 0.07, 0.11 * v);
        break;
      case "flame":
        this.noise(0.22, 900, 400, 0.35 * v, "bandpass", 0.7);
        break;
      case "missile":
        this.noise(0.5, 500, 2600, 0.4 * v, "bandpass", 1.2);
        break;
      case "gren":
        this.tone("sine", 220, 70, 0.14, 0.6 * v);
        this.noise(0.1, 1200, 300, 0.3 * v);
        break;
      case "saber":
        this.tone("sawtooth", 300, 900, 0.16, 0.3 * v);
        this.noise(0.22, 3000, 800, 0.35 * v, "bandpass", 3);
        break;
      case "arc":
        this.noise(0.28, 5000, 1500, 0.5 * v, "highpass", 1);
        this.tone("square", 110, 60, 0.26, 0.2 * v);
        break;
      // ── 爆炸 ──
      case "boom":
        this.noise(0.7, 1100, 50, 1.0 * v);
        this.tone("sine", 95, 28, 0.6, 0.9 * v);
        break;
      case "bigboom":
        this.noise(1.6, 800, 30, 1.2 * v);
        this.tone("sine", 70, 20, 1.4, 1.1 * v);
        this.noise(0.4, 4000, 500, 0.5 * v, "bandpass");
        break;
      // ── 命中與受傷 ──
      case "hit":
        this.tone("square", 1100, 700, 0.04, 0.09 * v);
        break;
      case "clank":
        this.noise(0.06, 5000, 1500, 0.25 * v, "bandpass", 4);
        break;
      case "hurt":
        this.noise(0.16, 1800, 300, 0.5 * v);
        this.tone("sawtooth", 160, 70, 0.14, 0.3 * v);
        break;
      // ── 敵人攻擊 ──
      case "eshot":
        this.tone("square", 700, 220, 0.09, 0.1 * v);
        this.noise(0.06, 2500, 800, 0.15 * v);
        break;
      case "cannon":
        this.noise(0.4, 1500, 100, 0.8 * v);
        this.tone("sine", 120, 35, 0.35, 0.7 * v);
        break;
      case "charge":
        this.tone("sine", 300, 1800, 1.5, 0.12 * v);
        break;
      case "snipe":
        this.tone("sawtooth", 2000, 200, 0.25, 0.3 * v);
        this.noise(0.2, 5000, 800, 0.4 * v, "bandpass", 2);
        break;
      // ── 技能 ──
      case "dash":
        this.noise(0.4, 600, 3500, 0.5 * v, "bandpass", 1);
        break;
      case "shield":
        this.tone("sine", 300, 900, 0.35, 0.3 * v);
        this.tone("sine", 450, 1350, 0.35, 0.2 * v);
        break;
      case "emp":
        this.tone("sawtooth", 1200, 40, 0.8, 0.4 * v);
        this.noise(0.6, 6000, 200, 0.5 * v, "bandpass", 1.5);
        break;
      case "orbital":
        this.tone("sine", 2000, 200, 1.4, 0.25 * v);
        break;
      case "heal":
        this.tone("sine", 520, 780, 0.25, 0.2 * v);
        this.tone("sine", 780, 1040, 0.25, 0.15 * v, 0.12);
        break;
      case "over":
        this.tone("sawtooth", 110, 440, 0.5, 0.3 * v);
        this.tone("square", 220, 880, 0.5, 0.12 * v);
        break;
      case "gravity":
        this.tone("sine", 400, 40, 1.2, 0.5 * v);
        break;
      // ── 小兵、換彈、腳步 ──
      case "deploy":
        this.tone("square", 440, 660, 0.1, 0.15 * v);
        this.tone("square", 660, 990, 0.12, 0.15 * v, 0.1);
        break;
      case "reload":
        this.noise(0.05, 3000, 2000, 0.2 * v, "bandpass", 5);
        this.noise(0.06, 2200, 1500, 0.25 * v, "bandpass", 5, 0.18);
        break;
      case "step":
        this.noise(0.14, 320, 70, 0.55 * v);
        this.tone("sine", 70, 35, 0.12, 0.4 * v);
        break;
      case "land":
        this.noise(0.4, 500, 50, 0.9 * v);
        this.tone("sine", 80, 25, 0.35, 0.8 * v);
        break;
      // ── 介面 ──
      case "ui":
        this.tone("square", 880, 1100, 0.05, 0.08 * v);
        break;
      case "select":
        this.tone("square", 660, 1320, 0.09, 0.1 * v);
        break;
      case "deny":
        this.tone("square", 200, 140, 0.14, 0.14 * v);
        break;
      // ── 波次、道具、警報、結算 ──
      case "wave":
        this.tone("sawtooth", 110, 110, 0.6, 0.25 * v);
        this.tone("sawtooth", 165, 165, 0.6, 0.2 * v, 0.2);
        this.tone("sawtooth", 220, 220, 0.9, 0.2 * v, 0.4);
        break;
      case "pickup":
        this.tone("sine", 660, 1320, 0.14, 0.2 * v);
        this.tone("sine", 990, 1980, 0.16, 0.14 * v, 0.08);
        break;
      case "beep":
        this.tone("square", 1500, 1500, 0.06, 0.16 * v);
        break;
      case "alarm":
        [0, 0.32, 0.64].forEach((t) => {
          this.tone("sawtooth", 520, 380, 0.26, 0.2 * v, t);
          this.tone("square", 260, 190, 0.26, 0.1 * v, t);
        });
        break;
      case "upgrade":
        [523, 784, 1047, 1568].forEach((f, i) =>
          this.tone("sine", f, f, 0.22, 0.16 * v, i * 0.07),
        );
        break;
      case "slash":
        this.noise(0.12, 4500, 1200, 0.5 * v, "highpass", 1);
        this.tone("sawtooth", 500, 200, 0.1, 0.15 * v);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone("square", f, f, 0.3, 0.14 * v, i * 0.14),
        );
        break;
      case "lose":
        [330, 262, 196, 131].forEach((f, i) =>
          this.tone("sawtooth", f, f * 0.9, 0.4, 0.16 * v, i * 0.2),
        );
        break;
    }
  },

  // 依與玩家的距離衰減音量後播放
  at(name, x, z, vol = 1, gap) {
    const d = Math.hypot(x - this.listener.x, z - this.listener.z),
      k = clamp(1 - d / 240, 0, 1);
    this.play(name, vol * k * k, gap);
  },
};

// ============================================================
//  背景音樂
//  MUSIC.set('hangar' | 'battle' | 'boss' | 'off', bossId)
//  ・會先找音檔：music/hangar.mp3、music/battle.mp3、music/boss_<Boss代號>.mp3、music/boss.mp3
//  ・找不到音檔時改用下面的步進式合成器即時演奏（每隻 Boss 的調性與速度都不同）
// ============================================================
const MUSIC = {
  key: "off", // 目前播放的曲目代號
  token: 0, // 用來作廢過期的非同步載入
  el: null, // 正在播放的音檔元素（用音檔時）
  song: null, // 正在演奏的合成曲目（用合成器時）
  // step = 合成曲目演奏到第幾步；nextT = 下一步該發聲的時間；timer = 排程用的計時器
  step: 0,
  nextT: 0,
  timer: null,
  cache: {}, // 檔名 → Audio 元素或 null（不存在）

  // 放在 music 資料夾裡的檔名（不含 .mp3）。網站上不能列出資料夾內容，
  // 所以只試著載入這裡列出的檔案，避免對不存在的曲目送出一堆 404 請求；新增音樂時記得加進來。
  files: ["battle", "battle2", "boss", "boss2"],

  // 嘗試載入 music/<name>.mp3；不存在就回傳 null
  probe(name) {
    if (name in this.cache) return Promise.resolve(this.cache[name]);
    if (!this.files.includes(name))
      return Promise.resolve((this.cache[name] = null));
    return new Promise((res) => {
      const a = new Audio();
      let done = false;
      // 無論成功或失敗都只回報一次，並記住結果。
      const fin = (v) => {
        if (done) return;
        done = true;
        this.cache[name] = v;
        res(v);
      };
      a.addEventListener("canplay", () => fin(a), { once: true });
      a.addEventListener("error", () => fin(null), { once: true });
      setTimeout(() => fin(null), 8000);
      a.loop = true;
      a.preload = "auto";
      a.src = "music/" + name + ".mp3";
    });
  },

  // 找出某一類音樂有哪些音檔可用：例如 battle.mp3、battle2.mp3、battle3.mp3
  async avail(base) {
    const out = [];
    for (const n of [base, base + "2", base + "3"]) {
      const a = await this.probe(n);
      if (a) out.push(a);
    }
    return out;
  },

  // 切換音樂
  //   mode   ：'hangar' | 'battle' | 'boss' | 'off'
  //   bossId ：Boss 代號（mode 為 'boss' 時用來挑專屬曲）
  //   wave   ：目前波數（一般戰鬥曲有多首時，每兩波換一首）
  async set(mode, bossId, wave) {
    // turn：每兩波加 1，用來輪流換戰鬥曲
    const turn = Math.floor(((wave || 1) - 1) / 2);
    // key：這次要播的曲目代號；和目前的一樣就不用做任何事
    const key =
      mode +
      ":" +
      (mode === "boss" ? bossId || "" : mode === "battle" ? turn : "");
    if (key === this.key) return;
    if (mode !== "off" && !SND.ctx) return; // 還沒取得使用者點擊前不能出聲：先不記錄，之後再試
    this.key = key;
    const tk = ++this.token;
    if (mode === "off") {
      this.stop();
      return;
    }
    // 1) 先找音檔
    let a = null;
    if (mode === "boss") {
      a = bossId ? await this.probe("boss_" + bossId) : null; // 該 Boss 的專屬曲
      if (!a) {
        const list = await this.avail("boss"); // 沒有專屬曲：從共用的 Boss 曲裡輪流挑
        if (list.length)
          a = list[Math.max(0, BOSS_IDS.indexOf(bossId)) % list.length];
      }
    } else if (mode === "battle") {
      const list = await this.avail("battle");
      if (list.length) a = list[turn % list.length];
    } else {
      a = await this.probe(mode);
    }
    if (tk !== this.token) return; // 載入期間又切歌了
    if (a) {
      if (a === this.el) return; // 同一首正在播：不要重頭播
      this.stop();
      this.el = a;
      a.currentTime = 0;
      a.volume = clamp(SND.vol.music * SND.duck, 0, 1);
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => {});
      return;
    }
    // 2) 沒有音檔：用合成器
    const sk = mode + ":" + (mode === "boss" ? bossId || "" : "");
    if (this.song && this.songKey === sk) return; // 同一首合成曲正在演奏
    this.stop();
    this.song = this.makeSong(mode, bossId);
    this.songKey = sk;
    this.step = 0;
    this.nextT = SND.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 60);
  },

  // 停止目前的音樂（不管是音檔還是合成器）
  stop() {
    if (this.el) {
      this.el.pause();
      this.el = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.song = null;
    this.songKey = null;
  },

  // ---- 曲目定義 ----
  // root：主音（MIDI 音高）；prog：每小節的和弦 [相對主音的半音數, 'm' 小和弦 / 'M' 大和弦]
  // kick / snare：一小節 16 步中哪幾步要打；hat：每幾步一下；bass / arp / lead：每一步的音（null = 休止）
  makeSong(mode, bossId) {
    // 機庫：慢速、沒有鼓、柔和的琶音
    if (mode === "hangar")
      return {
        bpm: 80,
        root: 57,
        cut: 900,
        vol: 0.8,
        prog: [
          [0, "m"],
          [-4, "M"],
          [3, "M"],
          [-2, "M"],
        ],
        kick: [],
        snare: [],
        hat: 0,
        bass: [
          0,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          0,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
        arp: [
          0,
          null,
          null,
          2,
          null,
          null,
          3,
          null,
          null,
          2,
          null,
          null,
          1,
          null,
          null,
          null,
        ],
        pad: 0.07,
      };
    // 一般戰鬥：中速、四拍鼓點
    if (mode === "battle")
      return {
        bpm: 124,
        root: 52,
        cut: 520,
        vol: 1,
        prog: [
          [0, "m"],
          [0, "m"],
          [-4, "M"],
          [-2, "M"],
          [0, "m"],
          [3, "M"],
          [-4, "M"],
          [-5, "M"],
        ],
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        hat: 2,
        bass: [
          0,
          null,
          0,
          null,
          0,
          null,
          12,
          null,
          0,
          null,
          0,
          null,
          7,
          null,
          10,
          null,
        ],
        arp: [
          0,
          null,
          2,
          null,
          1,
          null,
          2,
          null,
          3,
          null,
          2,
          null,
          1,
          null,
          2,
          null,
        ],
        pad: 0.05,
      };
    // Boss：每隻的調性、速度、鼓點都不一樣
    // 不在名單內的首領用第一首。
    const i = Math.max(0, BOSS_IDS.indexOf(bossId));
    // 產生一首戰鬥曲的設定：速度（bpm）、根音、和弦進行等，每一波用不同的組合，
    // 聽起來不會一直重複。
    return {
      // bpm = 速度；root 從十個音裡依 Boss 編號挑一個，所以每隻 Boss 的調都不同
      bpm: 138 + ((i * 7) % 22),
      root: [50, 52, 49, 53, 51, 54, 48, 55, 50, 47][i % 10],
      cut: 760,
      vol: 1,
      prog:
        i % 2
          ? [
              [0, "m"],
              [0, "m"],
              [1, "M"],
              [0, "m"],
              [-4, "M"],
              [-2, "M"],
              [0, "m"],
              [-1, "M"],
            ]
          : [
              [0, "m"],
              [3, "M"],
              [-2, "M"],
              [0, "m"],
              [0, "m"],
              [-4, "M"],
              [-5, "m"],
              [-2, "M"],
            ],
      kick:
        i % 3 === 0
          ? [0, 3, 6, 8, 11, 14]
          : i % 3 === 1
            ? [0, 4, 8, 10, 12, 14]
            : [0, 2, 6, 8, 10, 14],
      snare: [4, 12],
      hat: 1,
      bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 10, 0, 0, 7, 10, 12],
      arp: null,
      stab: [0, 6, 12],
      lead: [
        12,
        null,
        null,
        15,
        null,
        14,
        null,
        12,
        null,
        null,
        10,
        null,
        12,
        null,
        null,
        null,
        7,
        null,
        null,
        10,
        null,
        12,
        null,
        15,
        null,
        17,
        null,
        15,
        null,
        14,
        null,
        null,
      ],
      pad: 0.05,
    };
  },

  // 排程器：每 60 毫秒把接下來 0.2 秒內該發聲的音排進 WebAudio
  tick() {
    const c = SND.ctx,
      S = this.song;
    if (!c || !S) return;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05; // 分頁被凍結後追上進度
    while (this.nextT < c.currentTime + 0.2) {
      this.playStep(this.step, this.nextT);
      this.nextT += 60 / S.bpm / 4;
      this.step++;
    }
  },

  // 把 MIDI 音高換成頻率（69 = 中央 A = 440 Hz，每高 12 就是高八度）
  hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  // 演奏第 i 步（一小節 16 步）
  playStep(i, t) {
    // st = 這一小節裡的第幾步；bar = 第幾小節；ch = 這一小節的和弦
    const S = this.song,
      st = i % 16,
      bar = Math.floor(i / 16),
      ch = S.prog[bar % S.prog.length];
    // third = 和弦的三度音（大和弦 4 個半音、小和弦 3 個）；tones = 和弦的組成音；base = 和弦根音
    // 這一小節的和弦音（三度、五度、八度）與音量。
    const third = ch[1] === "M" ? 4 : 3,
      tones = [0, third, 7, 12],
      base = S.root + ch[0],
      V = S.vol;
    const fill = S.snare.length && bar % 4 === 3 && st >= 12; // 每四小節最後來一段過門
    // 鼓組：大鼓、小鼓、腳踏鈸
    if (S.kick.includes(st)) this.kick(t, V);
    if (S.snare.includes(st) || fill) this.snare(t, V * (fill ? 0.6 : 1));
    if (S.hat && st % S.hat === 0) this.hat(t, V * (st % 4 === 2 ? 1 : 0.55));
    // 低音（比和弦低兩個八度）
    const b = S.bass[st];
    if (b !== null && b !== undefined)
      this.voice(
        "sawtooth",
        this.hz(base - 24 + b),
        t,
        (60 / S.bpm / 4) * 1.7,
        0.26 * V,
        S.cut,
      );
    // 琶音（把和弦的音一個一個彈）
    if (S.arp) {
      const a = S.arp[st];
      if (a !== null && a !== undefined)
        this.voice(
          "triangle",
          this.hz(base + 12 + tones[a]),
          t,
          0.3,
          0.1 * V,
          2600,
        );
    }
    // 和弦重音（Boss 曲專用）
    if (S.stab && S.stab.includes(st))
      for (const n of [0, 7, 12])
        this.voice(
          "sawtooth",
          this.hz(base - 12 + n),
          t,
          0.22,
          0.075 * V,
          1500,
        );
    // 主旋律（Boss 曲專用）
    if (S.lead) {
      const n = S.lead[i % S.lead.length];
      if (n !== null && n !== undefined)
        this.voice("square", this.hz(S.root + n), t, 0.2, 0.05 * V, 2200);
    }
    // 每小節開頭鋪一個長和弦當背景
    if (st === 0)
      for (const n of [0, third, 7])
        this.voice(
          "sawtooth",
          this.hz(base + n),
          t,
          (60 / S.bpm) * 4 * 0.98,
          S.pad * V,
          800,
          0.35,
        );
  },

  // ---- 樂器 ----
  // 一般有音高的聲音：type 波形、f 頻率、dur 長度、cut 低通濾波頻率、atk 起音時間
  voice(type, f, t, dur, vol, cut, atk = 0.008) {
    const c = SND.ctx,
      o = c.createOscillator(),
      lp = c.createBiquadFilter(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.value = cut;
    lp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(SND.music);
    o.start(t);
    o.stop(t + dur + 0.03);
  },
  // 大鼓：音高快速往下掉的低音
  kick(t, v) {
    const c = SND.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(0.75 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    o.connect(g);
    g.connect(SND.music);
    o.start(t);
    o.stop(t + 0.22);
  },
  // 鼓用的噪音（小鼓與鈸共用）
  drumNoise(t, dur, freq, type, vol) {
    const c = SND.ctx,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = SND.noiseBuf;
    s.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(SND.music);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  },
  // 小鼓：一段噪音 + 一個短音
  snare(t, v) {
    this.drumNoise(t, 0.15, 1900, "bandpass", 0.42 * v);
    this.voice("triangle", 190, t, 0.1, 0.2 * v, 1200);
  },
  // 腳踏鈸：很短的高頻噪音
  hat(t, v) {
    this.drumNoise(t, 0.04, 7500, "highpass", 0.13 * v);
  },
};
