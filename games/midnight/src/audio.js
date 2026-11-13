(() => {
  const game = globalThis.Midnight;
  const PREF = "midnight-circuit-sound";
  const SFX_LEVEL = 0.72;
  const MUSIC_LEVEL = 0.2;
  const rand = (min, max) => min + Math.random() * (max - min);

  // Soft-clip curve: adds grit and loudness to low thumps without harsh digital clipping.
  function saturation(amount) {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  class ArcadeAudio {
    constructor() {
      this.enabled = true;
      this.musicEnabled = true;
      this.battle = false;
      this.intense = false;
      this.beat = 0;
      try {
        this.musicEnabled = localStorage.getItem(PREF + "-music") !== "off";
      } catch {
        /* Storage can be disabled. */
      }
      try {
        this.enabled = localStorage.getItem(PREF) !== "off";
      } catch {
        /* Storage can be disabled. */
      }
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      try {
        localStorage.setItem(PREF, enabled ? "on" : "off");
      } catch {
        /* The current session still works. */
      }
      if (enabled) this.activate();
      if (this.master)
        this.master.gain.setTargetAtTime(
          enabled ? SFX_LEVEL : 0,
          this.context.currentTime,
          0.025,
        );
    }

    activate() {
      if (!this.enabled && !this.musicEnabled) return;
      const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Audio) return;
      if (!this.context) {
        try {
          this.context = new Audio();
        } catch {
          return;
        }
        const ctx = this.context;
        // Bus layout: sfx → master → compressor → out, with a reverb send and music ducking.
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 8;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.002;
        this.compressor.release.value = 0.16;
        this.compressor.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = this.enabled ? SFX_LEVEL : 0;
        this.master.connect(this.compressor);
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this.impulse(1.8);
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 0.5;
        this.reverbSend.connect(this.reverb).connect(this.master);
        this.shaper = ctx.createWaveShaper();
        this.shaper.curve = saturation(6);
        this.shaper.oversample = "2x";
        this.shaper.connect(this.master);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0;
        this.duck = ctx.createGain();
        this.musicBus.connect(this.duck).connect(this.compressor);
        const length = Math.floor(ctx.sampleRate * 1.2);
        this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i += 1)
          samples[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    }

    impulse(seconds) {
      const ctx = this.context;
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i += 1)
          data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
      }
      return buffer;
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = enabled;
      try {
        localStorage.setItem(PREF + "-music", enabled ? "on" : "off");
      } catch {
        /* Storage can be disabled. */
      }
      this.activate();
      this.syncMusic();
    }

    setBattle(active) {
      if (this.battle === active) return;
      this.battle = active;
      this.syncMusic();
    }

    syncMusic() {
      const play = this.battle && this.musicEnabled && this.context;
      if (this.musicBus)
        this.musicBus.gain.setTargetAtTime(
          play ? MUSIC_LEVEL : 0,
          this.context.currentTime,
          0.045,
        );
      if (play && !this.musicTimer) {
        this.nextBeat = this.context.currentTime + 0.04;
        this.scheduleMusic();
        this.musicTimer = setInterval(() => this.scheduleMusic(), 25);
      } else if (!play && this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    // Briefly pull the music down so big impacts punch through.
    duckMusic(depth, hold) {
      if (!this.duck) return;
      const now = this.context.currentTime;
      const gain = this.duck.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(1 - depth, now + 0.01);
      gain.setTargetAtTime(1, now + hold, 0.18);
    }

    musicNote(midi, time, length, volume, wave = "triangle") {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = wave;
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
      osc.connect(gain).connect(this.musicBus);
      osc.start(time);
      osc.stop(time + length + 0.01);
    }

    drum(time, type) {
      const gain = this.context.createGain();
      gain.connect(this.musicBus);
      const kick = type === "kick";
      const length = kick ? 0.19 : type === "snare" ? 0.14 : 0.035;
      gain.gain.setValueAtTime(
        kick ? 0.65 : type === "snare" ? 0.24 : 0.09,
        time,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
      if (kick) {
        const osc = this.context.createOscillator();
        osc.frequency.setValueAtTime(135, time);
        osc.frequency.exponentialRampToValueAtTime(39, time + 0.13);
        osc.connect(gain);
        osc.start(time);
        osc.stop(time + length);
      } else {
        const noise = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        noise.buffer = this.noiseBuffer;
        filter.type = "highpass";
        filter.frequency.value = type === "snare" ? 1100 : 6500;
        noise.connect(filter).connect(gain);
        noise.start(time, rand(0, 0.9));
        noise.stop(time + length);
      }
    }

    scheduleMusic() {
      if (this.context.state !== "running") {
        this.nextBeat = this.context.currentTime + 0.04;
        return;
      }
      // Audio-clock scheduling keeps rhythm independent of rendering and timer jitter.
      if (this.nextBeat < this.context.currentTime)
        this.nextBeat = this.context.currentTime + 0.02;
      const stepLength = 60 / (this.intense ? 140 : 132) / 4;
      const progression = [38, 38, 34, 36, 38, 41, 34, 36];
      const melody = [0, 7, 12, 7, 3, 7, 15, 12, 0, 7, 10, 7, 3, 10, 7, 3];
      while (this.nextBeat < this.context.currentTime + 0.12) {
        const step = this.beat % 16;
        const root =
          progression[Math.floor(this.beat / 16) % progression.length];
        const time = this.nextBeat;
        if (step % 4 === 0 || step === 10) this.drum(time, "kick");
        if (step === 4 || step === 12) this.drum(time, "snare");
        if (step % 2 === 0 || this.intense) this.drum(time, "hat");
        if (step % 2 === 0)
          this.musicNote(
            root + (step === 14 ? 12 : 0),
            time,
            0.18,
            0.31,
            "triangle",
          );
        if (step % 4 === 0) {
          for (const interval of [0, 3, 7])
            this.musicNote(root + 24 + interval, time, 0.43, 0.045, "sine");
        }
        this.musicNote(
          root + 24 + melody[step],
          time,
          0.095,
          this.intense ? 0.11 : 0.065,
          "triangle",
        );
        if (this.intense && step % 2)
          this.musicNote(root + 36 + melody[step], time, 0.12, 0.035, "sine");
        this.beat += 1;
        this.nextBeat += stepLength;
      }
    }

    // ---------- synthesis building blocks ----------
    now(delay = 0) {
      return this.context.currentTime + delay;
    }

    envelope(gain, start, attack, volume, length) {
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    }

    tone(
      from,
      to,
      duration,
      volume,
      wave = "triangle",
      delay = 0,
      out = this.master,
    ) {
      const start = this.now(delay);
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, to),
        start + duration,
      );
      this.envelope(gain, start, 0.006, volume, duration);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    // Low body thump through saturation: the "weight" of a punch.
    thump(from, to, duration, volume, delay = 0) {
      this.tone(from, to, duration, volume, "sine", delay, this.shaper);
      this.tone(
        from * 1.5,
        to * 1.2,
        duration * 0.55,
        volume * 0.35,
        "triangle",
        delay,
        this.shaper,
      );
    }

    noise({
      type = "bandpass",
      from = 1000,
      to = from,
      q = 0.8,
      duration = 0.1,
      volume = 0.3,
      delay = 0,
      attack = 0.002,
      out = this.master,
    } = {}) {
      const start = this.now(delay);
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(30, to),
        start + duration,
      );
      this.envelope(gain, start, attack, volume, duration);
      source.connect(filter).connect(gain).connect(out);
      source.start(start, rand(0, 0.9 - Math.min(0.3, duration)));
      source.stop(start + duration + 0.02);
    }

    // Short broadband transient: the "crack" at the moment of contact.
    click(volume, delay = 0) {
      this.noise({
        type: "highpass",
        from: 2600,
        duration: 0.022,
        volume,
        delay,
        attack: 0.0005,
      });
    }

    whoosh(from, to, duration, volume, delay = 0) {
      this.noise({
        type: "bandpass",
        from,
        to,
        q: 1.4,
        duration,
        volume,
        delay,
        attack: duration * 0.35,
      });
    }

    crackle(duration, volume, delay = 0) {
      for (let i = 0; i < 7; i += 1) {
        this.noise({
          type: "highpass",
          from: rand(3000, 6000),
          duration: rand(0.012, 0.03),
          volume: volume * rand(0.5, 1),
          delay: delay + rand(0, duration),
        });
      }
      this.tone(
        rand(900, 1300),
        180,
        duration,
        volume * 0.35,
        "sawtooth",
        delay,
      );
    }

    chime(base, volume, delay = 0) {
      for (const ratio of [1, 2.76, 5.4])
        this.tone(
          base * ratio,
          base * ratio * 0.985,
          0.45,
          volume / ratio,
          "sine",
          delay,
          this.reverbSend,
        );
      for (const ratio of [1, 2.76])
        this.tone(
          base * ratio,
          base * ratio,
          0.2,
          (volume * 0.5) / ratio,
          "sine",
          delay,
        );
    }

    metal(volume, delay = 0) {
      for (const freq of [523, 1187, 1913, 2741])
        this.tone(
          freq,
          freq * 0.97,
          0.22,
          volume / (freq / 523) ** 0.6,
          "square",
          delay,
        );
      this.click(volume * 0.8, delay);
    }

    boom(volume, delay = 0) {
      this.thump(120, 28, 0.9, volume, delay);
      this.noise({
        type: "lowpass",
        from: 900,
        to: 80,
        duration: 1.1,
        volume: volume * 0.7,
        delay,
        out: this.reverbSend,
      });
      this.noise({
        type: "lowpass",
        from: 1400,
        to: 120,
        duration: 0.5,
        volume: volume * 0.5,
        delay,
      });
    }

    element(id, power, delay = 0) {
      switch (id) {
        case "thunder":
          this.crackle(0.16 * power, 0.3 * power, delay);
          break;
        case "frost":
          this.chime(rand(1500, 1900), 0.14 * power, delay);
          this.noise({
            type: "highpass",
            from: 4200,
            duration: 0.12,
            volume: 0.22 * power,
            delay,
          });
          break;
        case "lion":
          this.thump(70, 30, 0.4 * power, 0.5 * power, delay);
          this.noise({
            type: "lowpass",
            from: 600,
            to: 90,
            duration: 0.35 * power,
            volume: 0.35 * power,
            delay,
          });
          break;
        case "shade":
          this.whoosh(500, 3800, 0.16, 0.26 * power, delay);
          this.tone(220, 110, 0.25, 0.12 * power, "sawtooth", delay);
          break;
      }
    }

    // ---------- game cues ----------
    cue(event) {
      if (!this.enabled || this.context?.state !== "running") return;
      const id = event.fighter?.profile?.id;
      switch (event.type) {
        case "select":
          this.tone(525, 710, 0.075, 0.16);
          break;
        case "fight":
          this.thump(160, 50, 0.3, 0.6);
          this.tone(349, 392, 0.16, 0.24);
          this.tone(523, 698, 0.3, 0.26, "sawtooth", 0.09);
          this.noise({
            type: "highpass",
            from: 3000,
            duration: 0.4,
            volume: 0.12,
            delay: 0.09,
            out: this.reverbSend,
          });
          break;
        case "attack":
          if (event.action === "special" || event.action === "skill2") {
            this.tone(290, 610, 0.21, 0.16);
            this.whoosh(600, 2400, 0.22, 0.2);
          }
          break;
        case "super-flash":
          this.duckMusic(0.7, 0.5);
          this.tone(110, 440, 0.42, 0.28, "sawtooth");
          this.tone(220, 880, 0.42, 0.14, "square");
          this.noise({
            type: "bandpass",
            from: 400,
            to: 6000,
            q: 2,
            duration: 0.42,
            volume: 0.3,
            attack: 0.38,
          });
          this.boom(0.55, 0.4);
          this.element(id, 1.4, 0.4);
          break;
        case "swing":
          if (event.action === "light") this.whoosh(2600, 900, 0.09, 0.26);
          else this.whoosh(1600, 380, 0.17, 0.36);
          break;
        case "hit":
          this.hit(event);
          break;
        case "armor":
          this.thump(140, 60, 0.18, 0.55);
          this.metal(0.16);
          break;
        case "block":
          this.metal(0.2);
          this.thump(200, 90, 0.08, 0.3);
          break;
        case "perfect":
          this.tone(1760, 1760, 0.35, 0.2, "sine", 0, this.reverbSend);
          this.tone(2637, 2637, 0.3, 0.14, "sine");
          this.metal(0.12);
          break;
        case "guard-break":
          this.metal(0.3);
          this.noise({
            type: "highpass",
            from: 2500,
            duration: 0.35,
            volume: 0.4,
          });
          this.thump(150, 40, 0.35, 0.8);
          break;
        case "counter":
          this.duckMusic(0.5, 0.25);
          this.tone(2400, 2300, 0.5, 0.18, "sine", 0, this.reverbSend);
          this.tone(3600, 3550, 0.4, 0.1, "sine");
          this.whoosh(400, 4000, 0.2, 0.3, 0.05);
          break;
        case "projectile":
          if (event.shot.shape === "ice") {
            this.whoosh(3000, 1200, 0.2, 0.2);
            this.chime(rand(1200, 1500), 0.09);
          } else {
            this.thump(90, 35, 0.35, 0.6);
            this.noise({
              type: "lowpass",
              from: 500,
              to: 100,
              duration: 0.45,
              volume: 0.35,
            });
          }
          break;
        case "trap":
          this.chime(980, 0.08);
          this.noise({
            type: "highpass",
            from: 5000,
            duration: 0.3,
            volume: 0.08,
            attack: 0.25,
          });
          break;
        case "erupt":
          this.noise({
            type: "highpass",
            from: 2200,
            duration: 0.3,
            volume: 0.45,
          });
          this.chime(1650, 0.16);
          this.thump(120, 50, 0.2, 0.45);
          break;
        case "clash":
          this.metal(0.22);
          this.boom(0.35);
          break;
        case "rise":
          this.crackle(0.2, 0.25);
          this.whoosh(500, 3000, 0.2, 0.26);
          break;
        case "dodge":
          this.whoosh(900, 2600, 0.16, 0.2);
          break;
        case "dash":
          this.whoosh(
            event.forward ? 700 : 1400,
            event.forward ? 2200 : 600,
            0.14,
            0.18,
          );
          this.noise({
            type: "lowpass",
            from: 500,
            duration: 0.06,
            volume: 0.12,
          });
          break;
        case "grab":
          this.thump(180, 80, 0.1, 0.4);
          this.noise({
            type: "bandpass",
            from: 900,
            to: 500,
            duration: 0.12,
            volume: 0.25,
          });
          break;
        case "whiff":
          this.whoosh(1200, 400, 0.18, 0.16);
          break;
        case "tech":
          this.metal(0.22);
          this.whoosh(800, 2400, 0.15, 0.2);
          break;
        case "burst":
          this.duckMusic(0.6, 0.3);
          this.boom(0.6);
          this.tone(200, 900, 0.3, 0.2, "sawtooth");
          this.noise({
            type: "highpass",
            from: 1500,
            duration: 0.4,
            volume: 0.3,
            out: this.reverbSend,
          });
          break;
        case "blink":
          this.whoosh(3800, 500, 0.18, 0.24);
          this.tone(180, 90, 0.2, 0.1, "sawtooth");
          break;
        case "land":
          this.thump(
            event.heavy ? 110 : 160,
            50,
            event.heavy ? 0.3 : 0.08,
            event.heavy ? 0.7 : 0.22,
          );
          this.noise({
            type: "lowpass",
            from: 700,
            duration: 0.09,
            volume: 0.14,
          });
          break;
        case "footstep":
          this.noise({
            type: "bandpass",
            from: 290,
            duration: 0.045,
            volume: 0.06,
          });
          break;
        case "jump":
          this.whoosh(600, 1400, 0.12, 0.1);
          break;
        case "round-end":
          if (event.reason === "ko") {
            this.duckMusic(0.85, 1.2);
            this.boom(0.9);
            this.tone(233, 58, 1.1, 0.3, "sawtooth", 0.05);
          } else {
            this.tone(233, 78, 0.42, 0.25);
            this.tone(175, 61, 0.52, 0.19, "triangle", 0.06);
          }
          break;
      }
    }

    // Layered impact: transient crack + saturated body thump + mid crunch + element texture.
    hit({ action, effect, counterHit, finisher, ko }) {
      const power =
        action === "light"
          ? 0.65
          : action === "heavy"
            ? 1
            : action === "super"
              ? 1.3
              : 1.15;
      this.click(0.5 * power);
      this.thump(
        action === "light" ? 230 : 170,
        action === "light" ? 70 : 42,
        0.1 + 0.12 * power,
        0.8 * power,
      );
      this.noise({
        type: "bandpass",
        from: action === "light" ? 2000 : 1200,
        to: 400,
        q: 1.1,
        duration: 0.05 + 0.06 * power,
        volume: 0.45 * power,
      });
      this.noise({
        type: "lowpass",
        from: 1800,
        to: 200,
        duration: 0.14 * power,
        volume: 0.3 * power,
      });
      if (power >= 1) this.duckMusic(0.35 * power, 0.08);
      const id = {
        bolt: "thunder",
        ice: "frost",
        quake: "lion",
        shade: "shade",
      }[effect];
      if (id) this.element(id, power);
      if (finisher || action === "super")
        this.noise({
          type: "lowpass",
          from: 1200,
          to: 100,
          duration: 0.6,
          volume: 0.4,
          out: this.reverbSend,
        });
      if (counterHit) {
        this.tone(1320, 1320, 0.25, 0.14, "square");
        this.tone(1980, 1980, 0.25, 0.1, "square", 0.05);
      }
      if (ko) this.boom(0.7);
    }
  }

  game.ArcadeAudio = ArcadeAudio;
})();
