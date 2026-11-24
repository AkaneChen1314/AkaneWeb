/* 檔案導讀：角色動畫。決定「現在要擺什麼姿勢」，畫圖交給 rig.js。

   每個動作由幾個關鍵姿勢組成（蓄力 → 打出 → 收招），中間自動補間；
   姿勢參數的意義寫在 rig.js 開頭。原圖有三張：idle 站立、punch 出拳、
   crouch 蹲下，出拳用 punch 的手臂，踢腿用 idle 的腿，掃腿用 crouch。
   另外用彈簧補上受擊、落地的餘震，馬尾與腰帶也有自己的擺動。 */
(() => {
  const game = globalThis.Midnight;
  const REST = game.SpriteRig.REST;
  const KEYS = Object.keys(REST);
  // 畫布的大小與腳底中央的位置（場地像素）。踢腿、上勾拳、倒地都要放得下
  const SIZE = { width: 620, height: 460 };
  const ORIGIN = { x: 290, y: 380 };
  const POSE_FADE = 0.05;
  const HIT_FADE = 0.028;
  const TAU = Math.PI * 2;
  // 限制範圍與快慢曲線。
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeIn = (t) => t * t;
  const easeInOut = (t) => t * t * (3 - 2 * t);
  const wave = (t) => Math.sin(t);

  /* ---------- 動作表 ----------
     每個動作有一到數段 hits，對應招式資料裡的每一次打擊：
       wind 蓄力的姿勢、from 打出瞬間的起點、hit 打中的姿勢、hold 停留秒數
     s 是用哪一張圖。 */
  const CLIPS = {
    // 刺拳：前腳踏出去，肩膀送到底
    light: [
      {
        wind: { s: "idle", to: -7, px: -8, au: -8 },
        from: { ax: 0.6, st: 0.1 },
        hit: {
          s: "punch",
          to: 9,
          px: 30,
          py: 6,
          ax: 1.12,
          st: 0.62,
          hd: -6,
        },
        hold: 0.07,
      },
    ],
    // 轉腰的後手直拳
    light2: [
      {
        wind: { s: "punch", ax: 0.5, to: -17, px: -10, st: 0.35, au: 12 },
        hit: {
          s: "punch",
          to: 17,
          px: 42,
          py: 10,
          ax: 1.16,
          au: -9,
          hd: -11,
          st: 0.95,
          by: 4,
          br: 12,
        },
        hold: 0.08,
      },
    ],
    // 中段側踢：後腳蹬地，整個人往前送
    light3: [
      {
        wind: { s: "idle", px: -10, py: 14, to: 11, fx: -14, fy: 60, fr: 26 },
        hit: {
          s: "idle",
          px: 46,
          py: 2,
          to: -24,
          hd: 14,
          au: -12,
          fx: 128,
          fy: 160,
          fk: 1,
          bx: 12,
          br: -16,
        },
        hold: 0.12,
        limb: "foot",
      },
    ],
    // 大步直拳
    heavy: [
      {
        wind: {
          s: "punch",
          ax: 0.46,
          to: -24,
          px: -30,
          py: 18,
          st: 0.5,
          au: 14,
        },
        hit: {
          s: "punch",
          to: 17,
          px: 56,
          py: 24,
          ax: 1.2,
          st: 1.16,
          hd: -12,
          bx: -10,
          by: 6,
          br: 22,
        },
        hold: 0.12,
      },
    ],
    crouchLight: [
      {
        wind: { s: "crouch", px: -8, to: -4 },
        hit: {
          s: "crouch",
          fx: 98,
          fy: 14,
          fk: 0.5,
          to: -12,
          px: 30,
          hd: 6,
        },
        hold: 0.07,
        limb: "foot",
      },
    ],
    sweep: [
      {
        wind: { s: "crouch", px: -14, py: 10, to: 14, fx: -22 },
        hit: {
          s: "crouch",
          fx: 138,
          fy: 0,
          fk: 0.72,
          to: -20,
          px: 34,
          py: 12,
          hd: 10,
        },
        hold: 0.15,
        limb: "foot",
      },
    ],
    // 空中：往下打的拳、俯衝踢
    airLight: [
      {
        wind: { s: "idle", to: -8, fx: -10, fy: 52, bx: 18, by: 44, br: 20 },
        from: { ax: 0.65, st: 0.2 },
        hit: {
          s: "punch",
          au: 30,
          to: 18,
          st: 0.2,
          ax: 1.08,
          fx: -32,
          fy: 54,
          fr: 18,
          bx: 34,
          by: 46,
          bk: 0.5,
        },
        hold: 0.2,
      },
    ],
    airHeavy: [
      {
        wind: { s: "idle", to: 12, fx: -20, fy: 70, bx: 20, by: 56, br: 24 },
        hit: {
          s: "idle",
          to: -16,
          hd: 10,
          rot: 8,
          au: -10,
          fx: 74,
          fy: 2,
          fk: 0.72,
          bx: 42,
          by: 78,
          bk: 0.7,
        },
        hold: 0.26,
        limb: "foot",
      },
    ],
    burst: [],
  };

  // 各鬥士自己的招式，以及和共用動作不一樣的普攻
  const OWN = {
    thunder: {
      special: [
        {
          wind: {
            s: "punch",
            ax: 0.45,
            au: 24,
            to: -22,
            px: -30,
            py: 24,
            st: 0.6,
          },
          hit: {
            s: "punch",
            to: 19,
            px: 48,
            py: 22,
            ax: 1.2,
            st: 1.15,
            hd: -12,
            bx: -16,
            by: 8,
            br: 26,
          },
          hold: 0.13,
        },
      ],
      // 升龍：蹲低蓄力，再帶膝往上打
      skill2: [
        {
          wind: { s: "crouch", to: 12, py: 8, hd: -6 },
          from: { au: 34, ax: 0.75, st: 0.3, to: 16, py: 30 },
          hit: {
            s: "punch",
            au: -58,
            to: -2,
            st: 0.35,
            ax: 1.06,
            fx: -26,
            fy: 78,
            fr: 14,
            bx: 22,
            bk: 0.4,
          },
          hold: 0.05,
        },
        {
          wind: {
            s: "punch",
            au: -62,
            to: -4,
            st: 0.35,
            fx: -26,
            fy: 78,
            fr: 14,
            bx: 22,
            bk: 0.4,
          },
          hit: {
            s: "punch",
            au: -82,
            al: -6,
            to: -11,
            hd: -12,
            st: 0.35,
            ax: 1.14,
            fx: -14,
            fy: 66,
            fr: 16,
            bx: 28,
            by: -8,
            bk: 0.5,
          },
          hold: 0.2,
        },
      ],
      super: [
        {
          wind: { s: "punch", ax: 0.5, to: -18, px: -24, py: 18, st: 0.5 },
          hit: {
            s: "punch",
            to: 10,
            px: 26,
            py: 10,
            ax: 1.12,
            st: 0.8,
            hd: -6,
          },
        },
        {
          wind: { s: "idle", px: -6, py: 10, to: 10, fx: -14, fy: 58, fr: 22 },
          hit: {
            s: "idle",
            px: 22,
            py: -2,
            to: -22,
            hd: 12,
            fx: 112,
            fy: 176,
            fk: 1,
            br: -10,
          },
          limb: "foot",
        },
        {
          wind: {
            s: "punch",
            ax: 0.42,
            au: 28,
            to: -24,
            px: -32,
            py: 26,
            st: 0.6,
          },
          hit: {
            s: "punch",
            to: 21,
            px: 54,
            py: 24,
            ax: 1.24,
            st: 1.18,
            hd: -14,
            bx: -20,
            by: 8,
            br: 28,
          },
          hold: 0.18,
        },
      ],
    },
    frost: {
      // 高踢
      heavy: [
        {
          wind: { s: "idle", px: -12, py: 18, to: 15, fx: -26, fy: 70, fr: 28 },
          hit: {
            s: "idle",
            px: 54,
            py: 0,
            to: -30,
            hd: 18,
            au: -16,
            fx: 130,
            fy: 204,
            fk: 1,
            br: -10,
          },
          hold: 0.12,
          limb: "foot",
        },
      ],
      special: [
        {
          wind: {
            s: "punch",
            ax: 0.5,
            au: 18,
            to: -16,
            px: -14,
            py: 6,
            st: 0.3,
          },
          hit: { s: "punch", to: 8, px: 16, ax: 1.06, st: 0.7, hd: -4 },
          hold: 0.16,
        },
      ],
      // 冰棱陣：高舉手，往地面一壓
      skill2: [
        {
          wind: {
            s: "punch",
            au: -88,
            al: -12,
            to: -12,
            hd: -8,
            px: -8,
            py: -4,
            st: 0.3,
          },
          hit: {
            s: "punch",
            au: 34,
            to: 20,
            hd: -8,
            py: 24,
            px: 10,
            st: 0.75,
          },
          hold: 0.18,
        },
      ],
      super: [
        {
          wind: { s: "punch", ax: 0.5, au: 40, to: -6, px: -12, st: 0.3 },
          hit: { s: "punch", au: 30, to: 16, px: 14, py: 16, st: 0.7 },
        },
        {
          wind: { s: "punch", ax: 0.5, au: 10, to: -14, px: -10, st: 0.4 },
          hit: { s: "punch", au: 0, to: 8, px: 16, ax: 1.06, st: 0.7 },
        },
        {
          wind: { s: "punch", ax: 0.55, au: 20, to: -14, px: -12, st: 0.4 },
          hit: {
            s: "punch",
            au: -34,
            to: -4,
            px: 20,
            ax: 1.12,
            st: 0.8,
            hd: -8,
          },
          hold: 0.2,
        },
      ],
    },
    lion: {
      // 由下往上的勾拳
      light3: [
        {
          wind: {
            s: "punch",
            ax: 0.6,
            au: 34,
            to: -14,
            px: -14,
            py: 22,
            st: 0.4,
          },
          hit: {
            s: "punch",
            au: -30,
            to: 8,
            px: 46,
            py: 4,
            ax: 1.12,
            st: 1,
            hd: -9,
          },
          hold: 0.13,
        },
      ],
      // 從頭上揮下來的重拳
      heavy: [
        {
          wind: {
            s: "punch",
            au: -98,
            al: -22,
            ax: 0.92,
            to: -18,
            px: -24,
            st: 0.4,
          },
          hit: {
            s: "punch",
            au: 8,
            to: 23,
            px: 58,
            py: 22,
            ax: 1.16,
            st: 1.14,
            hd: -13,
          },
          hold: 0.14,
        },
      ],
      special: [
        {
          wind: {
            s: "punch",
            au: -108,
            al: -16,
            to: -16,
            hd: -6,
            px: -14,
            py: -6,
            st: 0.5,
          },
          hit: {
            s: "punch",
            au: 50,
            to: 35,
            hd: -16,
            py: 54,
            px: 18,
            st: 1,
          },
          hold: 0.22,
        },
      ],
      // 肩撞
      skill2: [
        {
          wind: { s: "idle", to: -12, px: -20, py: 18, au: -10 },
          hit: {
            s: "idle",
            to: 33,
            hd: -20,
            px: 44,
            py: 28,
            au: 30,
            fx: 30,
            bx: -36,
            by: 6,
            br: 32,
          },
          hold: 0.16,
        },
      ],
      super: [
        {
          wind: {
            s: "punch",
            au: -114,
            al: -20,
            to: -22,
            hd: -10,
            px: -16,
            py: -10,
            st: 0.5,
          },
          hit: {
            s: "punch",
            au: 58,
            to: 41,
            hd: -20,
            py: 66,
            px: 20,
            st: 1,
          },
          hold: 0.36,
        },
      ],
    },
    shade: {
      // 旋身側踢
      heavy: [
        {
          wind: { s: "idle", px: -14, py: 18, to: 16, fx: -20, fy: 56, fr: 26 },
          hit: {
            s: "idle",
            y: 12,
            px: 60,
            py: 4,
            to: -34,
            hd: 21,
            au: -14,
            fx: 140,
            fy: 182,
            fk: 1,
            bx: 14,
            br: -22,
          },
          hold: 0.12,
          limb: "foot",
        },
      ],
      special: [
        {
          wind: { s: "crouch", to: 8, hd: -4 },
          from: { ax: 0.55, st: 0.2, py: 26 },
          hit: {
            s: "punch",
            to: 15,
            px: 26,
            py: 8,
            ax: 1.14,
            au: -5,
            st: 0.95,
            hd: -8,
          },
          hold: 0.13,
        },
      ],
      counter: [
        {
          wind: { s: "crouch", to: 10 },
          hit: {
            s: "idle",
            y: 12,
            px: 36,
            py: 0,
            to: -32,
            hd: 20,
            au: -14,
            fx: 124,
            fy: 190,
            fk: 1,
            bx: 14,
            br: -24,
          },
          hold: 0.2,
          limb: "foot",
        },
      ],
      super: [
        {
          wind: { s: "crouch", to: 10 },
          from: { ax: 0.55, st: 0.2, py: 24 },
          hit: {
            s: "punch",
            to: 16,
            px: 26,
            py: 8,
            ax: 1.14,
            au: -6,
            st: 0.95,
            hd: -8,
          },
          hold: 0.12,
        },
        {
          wind: { s: "crouch", to: 12 },
          hit: {
            s: "idle",
            y: 14,
            px: 36,
            py: 0,
            to: -33,
            hd: 20,
            au: -14,
            fx: 124,
            fy: 196,
            fk: 1,
            bx: 14,
            br: -24,
          },
          hold: 0.2,
          limb: "foot",
        },
      ],
    },
  };

  /* 每個鬥士站立的習慣：
       tempo 呼吸與踮步的速度　bounce 踮步幅度　low 站得多低　lean 前傾
       win   勝利姿勢（圖 + 參數） */
  const STYLE = {
    thunder: {
      tempo: 4.2,
      bounce: 5,
      low: 4,
      lean: 2,
      win: { s: "punch", au: -86, al: -10, to: -6, hd: -8, st: 0.35 },
    },
    frost: {
      tempo: 2.7,
      bounce: 2.4,
      low: 0,
      lean: 0,
      win: { s: "punch", au: -30, al: -8, to: -5, hd: -2, st: 0.25 },
    },
    lion: {
      tempo: 2.4,
      bounce: 2.2,
      low: 4,
      lean: 3,
      win: { s: "punch", au: -82, al: -6, to: -9, hd: -10, st: 0.4 },
    },
    shade: {
      tempo: 3.3,
      bounce: 3.6,
      low: 10,
      lean: 5,
      win: { s: "idle", to: -5, hd: 5, au: -10, al: -8 },
    },
  };

  // 走路與衝刺的一步：phase 走完 0～1 是一個循環，前半腳踩在地上往後滑、後半抬起來
  function step(phase, stride, lift) {
    const u = ((phase % 1) + 1) % 1;
    if (u < 0.5) return [stride - stride * 4 * u, 0, 0];
    const k = (u - 0.5) * 2;
    const x = -stride + stride * 2 * easeInOut(k);
    const up = Math.sin(k * Math.PI);
    return [x, up * lift, Math.cos(k * Math.PI) * up * 26];
  }

  // 補上沒有指定的欄位。
  const complete = (pose) => ({ ...REST, ...pose });
  // 兩個姿勢之間的混合。
  function blend(a, b, t) {
    const out = {};
    for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
    return out;
  }

  // 把「動作 + 招式的打擊時間」組成一條時間軸
  function timeline(clip, spec, finish) {
    const times = spec.events
      .filter((e) => e.damage || e.projectile || e.trap || e.burst)
      .map((e) => e.at);
    const keys = [{ t: 0, s: finish, p: complete({}), ease: easeOut }];
    times.forEach((at, i) => {
      const part = clip[Math.min(i, clip.length - 1)];
      if (!part) return;
      const start = keys[keys.length - 1].t;
      const snap = clamp((at - start) * 0.45, 0.02, 0.055);
      const wind = complete(part.wind);
      const hit = complete(part.hit);
      // 打中的瞬間手腳多伸出去一些，馬上彈回來，看起來才有力
      const foot = part.limb === "foot";
      // 打到最遠那一瞬間的姿勢。
      const peak = {
        ...hit,
        px: hit.px + 8,
        to: hit.to * 1.14,
        ax: foot ? hit.ax : hit.ax + 0.1,
        fx: foot ? hit.fx + 12 : hit.fx,
      };
      keys.push({ t: at - snap, s: part.wind.s, p: wind, ease: easeOut });
      keys.push({
        t: at - 0.004,
        s: part.hit.s,
        p: peak,
        // 打出的起點：換圖時手臂從縮短的狀態射出去
        from: { ...wind, ...part.from },
        ease: easeIn,
        limb: part.limb ?? "hand",
        strike: true,
      });
      // 打完停一下，再往回收一點點
      const gap = times[i + 1] ? (times[i + 1] - at) * 0.45 : 0.3;
      const hold = Math.min(part.hold ?? 0.09, gap);
      keys.push({
        t: at + hold * 0.45,
        s: part.hit.s,
        p: hit,
        ease: easeOut,
        limb: part.limb ?? "hand",
      });
      keys.push({
        t: at + hold,
        s: part.hit.s,
        p: blend(hit, complete({ st: hit.st }), 0.14),
        ease: easeOut,
        limb: part.limb ?? "hand",
      });
    });
    const last = keys[keys.length - 1];
    keys.push({
      t: Math.max(last.t + 0.06, spec.duration),
      s: finish,
      p: complete({}),
      ease: easeInOut,
      settle: true,
    });
    return keys;
  }

  /* 換圖時的起點：身體的位置與傾斜接續上一張圖，手腳用新圖的姿勢
     （不同張圖的手腳參數不能直接混用）。站姿從待機的站距開始跨出去。 */
  function enter(a, b) {
    if (a.s === b.s) return a.p;
    const p = { ...b.p };
    for (const key of ["x", "y", "rot", "px", "py", "to", "hd"])
      p[key] = a.p[key];
    if (a.s === "idle" && b.s === "punch") p.st = Math.min(0.1, b.p.st);
    if (b.s === "crouch" || a.s === "crouch") p.py = b.p.py;
    return p;
  }

  // 取出某個時間點的姿勢。
  function sample(keys, time) {
    let i = 1;
    while (i < keys.length - 1 && keys[i].t < time) i += 1;
    const a = keys[i - 1];
    const b = keys[i];
    const u = clamp((time - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
    if (b.settle) {
      // 收招：前半把手腳收回來（踢腿先屈膝、出拳用縮短手臂代替），後半回到站姿
      const punch = a.s === "punch";
      const kick = a.limb === "foot";
      // 收招時先往回收一點。
      const back = complete({
        st: punch ? a.p.st * 0.45 : 1, // 只有出拳的圖需要收步
        ax: punch ? 0.58 : 1,
        au: punch ? 14 : 0,
        to: a.p.to * 0.25,
        hd: a.p.hd * 0.25,
        py: kick ? 8 : 4,
        fx: kick ? 6 : 0,
        fy: kick ? Math.min(54, a.p.fy * 0.4) : 0,
        fr: kick ? 18 : 0,
      });
      if (u < 0.45)
        return { s: a.s, p: blend(a.p, back, easeInOut(u / 0.45)), limb: null };
      const start =
        a.s === b.s
          ? back
          : complete({ to: a.p.to * 0.2, px: a.p.px * 0.2, py: 6 });
      const p = blend(start, b.p, easeInOut((u - 0.45) / 0.55));
      return { s: b.s, p, limb: null };
    }
    return {
      s: b.s,
      p: blend(b.from ?? enter(a, b), b.p, b.ease(u)),
      limb: b.limb ?? null,
      strike: Boolean(b.strike),
      fast: Boolean(b.strike),
    };
  }

  // 彈簧：受擊、落地、起跳的餘震
  function spring(value = 0) {
    return { x: value, v: 0 };
  }

  // 推進一步彈簧。
  function stepSpring(s, target, k, damping, dt) {
    s.v += ((target - s.x) * k - s.v * damping) * dt;
    s.x += s.v * dt;
  }

  // 沒有 WebGL2 時的備案：直接用原圖，只套整體的旋轉與縮放
  class FlatSprites {
    // 先把每張圖縮成需要的大小。
    constructor(atlas, res) {
      this.res = res;
      this.images = new Map();
      for (const profile of game.FIGHTERS) {
        const scale = profile.size / profile.frames.idle[3];
        const set = {};
        for (const [name, frame] of Object.entries(profile.frames)) {
          const [sx, sy, sw, sh, anchor] = frame;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE.width * res;
          canvas.height = SIZE.height * res;
          const ctx = canvas.getContext("2d");
          ctx.scale(res, res);
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            atlas,
            sx,
            sy,
            sw,
            sh,
            ORIGIN.x - anchor * scale,
            ORIGIN.y - sh * scale,
            sw * scale,
            sh * scale,
          );
          set[name] = canvas;
        }
        this.images.set(profile.id, { scale, set });
      }
      this.canvas = document.createElement("canvas");
      this.canvas.width = SIZE.width * res;
      this.canvas.height = SIZE.height * res;
    }

    // 圖上某一點的位置，跟 SpriteRig 的同名函式對應。
    point(id, sprite, pose) {
      const { scale } = this.images.get(id);
      return [(pose.px + 150) * scale, 240 * scale];
    }

    // 用原圖畫一個角色。
    render(id, sprite, pose, look) {
      const { scale, set } = this.images.get(id);
      const ctx = this.canvas.getContext("2d");
      const { res } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.translate(ORIGIN.x * res, ORIGIN.y * res);
      ctx.scale(pose.sx, pose.sy);
      ctx.translate(pose.px * scale * res, -pose.y * scale * res);
      ctx.rotate(((pose.rot + pose.to * 0.4) * Math.PI) / 180);
      ctx.drawImage(set[sprite], -ORIGIN.x * res, -ORIGIN.y * res);
      const [r, g, b, a] = look.flash ?? [0, 0, 0, 0];
      if (a > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = "source-over";
      }
      return this.canvas;
    }
  }

  // #rrggbb 換成 0～1 的數值。
  const flashRgb = (value) => [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];

  // 所有角色的動畫：算姿勢、換圖、彈簧與繪圖。
  class FighterAnimation {
    // 有 WebGL2 就用骨架，沒有就用靜態圖。
    constructor(atlas, res = 1) {
      this.res = res;
      const logical = { ...SIZE, x: ORIGIN.x, y: ORIGIN.y };
      try {
        this.rig = new game.SpriteRig(atlas, logical, res);
      } catch (error) {
        console.warn("改用靜態角色圖：", error.message);
        this.rig = new FlatSprites(atlas, res);
      }
      this.states = new WeakMap();
      this.clips = new Map(); // 招式 → 時間軸
      this.pool = [];
      this.layers = [this.layer(), this.layer()]; // 兩位鬥士這一幀的樣子
    }

    // 每位角色一張畫布。
    layer() {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(SIZE.width * this.res);
      canvas.height = Math.round(SIZE.height * this.res);
      return canvas;
    }

    // 這位角色的動畫狀態，第一次用到才建立。
    state(fighter) {
      let state = this.states.get(fighter);
      if (!state) {
        // 各種姿勢、換圖、彈簧與拖影的狀態。
        state = {
          sprite: "idle",
          prevSprite: "idle",
          pose: complete({}),
          prevPose: complete({}),
          fade: 1,
          fadeTime: POSE_FADE,
          gait: 0,
          time: Math.random() * 10,
          ox: spring(),
          rot: spring(),
          sx: spring(1),
          sy: spring(1),
          face: spring(fighter.face),
          tail: spring(),
          sash: spring(),
          aura: 0,
          ghostTimer: 0,
          landT: 0, // 剛落地：短暫屈膝緩衝
          hurt: 0, // 剛被重擊：身體縮起來的程度
          hurtAt: 1, // 被打的高度（0 腳、1 頭頂）
          snap: 0, // 剛被打中：姿勢直接跳過去，不慢慢補
          side: 1, // 連續被打時左右交替
          flash: 0, // 受擊閃光還剩幾秒
          flashColor: "#ffffff",
          blown: false, // 被重擊打飛：整個人橫著飛出去
          fell: false, // 被打飛過，落地後先倒地再起身
          trail: [], // 揮拳踢腿的殘影姿勢
          // 換圖時身體位置的差距，很快縮回 0，換圖才不會跳一下
          fix: { px: 0, py: 0, to: 0, tau: 0.05 },
          crouch: 0, // 蹲下的程度 0~1
          guard: 0,
          limb: null, // 正在出招的手或腳
          strike: false,
        };
        this.states.set(fighter, state);
      }
      return state;
    }

    // 瞬間的推力：被打後退、落地壓扁、起跳拉長
    kick(fighter, { ox = 0, rot = 0, sx = 0, sy = 0 } = {}) {
      const state = this.state(fighter);
      state.ox.v += ox;
      state.rot.v += rot;
      state.sx.v += sx;
      state.sy.v += sy;
    }

    // 落地：短暫屈膝（由 renderer 在落地事件時呼叫）
    land(fighter, heavy = false) {
      this.state(fighter).landT = heavy ? 0.2 : 0.12;
    }

    // 被打中：amount 0~1 是力道，at 是被打的高度（0 腳、1 頭頂）
    hurt(fighter, amount, at = 1) {
      const state = this.state(fighter);
      state.hurt = Math.max(state.hurt, amount);
      state.hurtAt = at;
      state.snap = 0.07;
      state.side = -state.side;
      if (amount >= 1) state.blown = true;
    }

    // 受擊閃光：只亮一下下，定格的時候也會繼續變淡
    flash(fighter, color) {
      const state = this.state(fighter);
      state.flash = 0.1;
      state.flashColor = color;
    }

    // 瞬移：直接面向新的方向，不要轉身的過程
    snapFace(fighter) {
      const state = this.state(fighter);
      state.face.x = fighter.face;
      state.face.v = 0;
    }

    // 這一招用哪一條時間軸
    keysFor(fighter, move) {
      const { profile } = fighter;
      const air = Boolean(move.air);
      const tag = `${profile.id}:${air}`;
      let bySpec = this.clips.get(move.spec);
      if (!bySpec) this.clips.set(move.spec, (bySpec = {}));
      if (!bySpec[tag]) {
        const own = OWN[profile.id];
        let name = move.spec.clip ?? move.action;
        if (move.countered) name = "counter";
        if (air && name === "light") name = "airLight";
        if (air && name === "heavy") name = "airHeavy";
        const clip = own[name] ?? CLIPS[name] ?? CLIPS.light;
        const finish = move.spec.low ? "crouch" : "idle";
        bySpec[tag] = timeline(clip, move.spec, finish);
      }
      return bySpec[tag];
    }

    /* 決定這一幀的目標：{ s 圖, p 姿勢, rate 靠近的速度, fade 換圖的秒數 } */
    target(fighter, state, match, dt, lag = 0) {
      const style = STYLE[fighter.profile.id];
      const move = fighter.move;
      const airborne = fighter.y > 0 || fighter.vy > 0;
      const out = { s: "idle", p: null, rate: 26, fade: POSE_FADE, limb: null };
      // 設定這一幀要的姿勢與圖。
      const pose = (p, s = "idle") => {
        out.p = complete(p);
        out.s = s;
        return out;
      };
      const t = state.time;
      // 蹲下的程度：下段招式也算，收招後才不會先站起來再蹲回去
      const ducking = fighter.crouch || move?.spec.low || fighter.dodge;
      const low = !airborne && ducking ? 1 : 0;
      state.crouch += (low - state.crouch) * (1 - Math.exp(-26 * dt));

      // 倒地。
      if (fighter.hp === 0) {
        if (airborne) {
          out.rate = 14;
          return pose({
            rot: -62,
            y: -20,
            to: -16,
            hd: -14,
            au: -34,
            fx: -14,
            fy: 34,
            bx: 48,
            by: 20,
            bk: 0.4,
            fk: 0.4,
          });
        }
        // 倒在地上：仰躺，一隻腳屈起
        out.rate = 20;
        return pose({
          rot: -88,
          y: -112,
          to: 4,
          hd: 6,
          au: 24,
          al: 20,
          fx: -44,
          fy: 46,
          fr: 10,
          bx: 78,
          by: 2,
          bk: 0.2,
        });
      }

      // 登場。
      if (match?.phase === "intro") {
        const p = clamp(match.phaseTime / 0.85, 0, 1);
        if (p < 1) {
          // 從場外跑進來，到定位煞車
          out.snapOx = -(1 - easeOut(p)) * 460;
          state.gait += dt * TAU * 3.4 * (1 - p * 0.55);
          return this.run(out, state, 1 - p * 0.4);
        }
      }
      const settled = match && match.phase !== "fight" && match.result;
      // 勝利或落敗的姿勢。
      if (settled && match.phaseTime > 0.55) {
        if (match.result.winner === fighter.index && !airborne) {
          const sway = wave(t * 2.4);
          out.rate = 12;
          const { s, ...win } = style.win;
          return pose(
            {
              ...win,
              to: (win.to ?? 0) + sway * 1.2,
              hd: (win.hd ?? 0) + sway,
              py: -2 + sway * 1.5,
            },
            s,
          );
        }
        if (match.result.winner !== null && !airborne) {
          out.rate = 10;
          return pose({ to: 12, hd: 18, py: 4, au: 18 }, "crouch");
        }
      }

      // 被抓住。
      if (fighter.heldBy) {
        return pose({
          y: 26,
          rot: -16,
          to: -8,
          hd: -16,
          au: 22,
          fx: -12,
          fy: -6,
          fr: 26,
          bx: 30,
          by: -8,
          br: 30,
        });
      }
      if (move?.action === "throw") return this.throwPose(move, out);
      if (move?.spec.burstMove) {
        const p = clamp(move.elapsed / 0.1, 0, 1);
        out.rate = 40;
        return pose({
          to: -18 * p,
          hd: -16 * p,
          au: -30 * p,
          al: 14 * p,
          py: 10 * p,
          sx: 1 + 0.05 * p,
        });
      }
      if (move?.rush) return this.rushPose(move, out);
      if (move) return this.movePose(fighter, move, out, match, lag);

      // 衝刺。
      if (fighter.dash) {
        if (fighter.dash.forward) return this.run(out, state, 1);
        out.rate = 40;
        const gone = Math.max(0, fighter.dash.elapsed - lag);
        const p = clamp(gone / fighter.dash.time, 0, 1);
        const hop = Math.sin(p * Math.PI);
        return pose({
          y: hop * 16,
          to: -9,
          hd: 8,
          px: -10,
          fx: -20,
          fy: 10 * hop,
          fr: -16 * hop,
          bx: 6,
          by: 6 * hop,
          au: -8,
        });
      }
      // 閃避。
      if (fighter.dodge) {
        // 閃避：壓低身子滑過去
        const forward = fighter.dodge.direction * fighter.face;
        out.rate = 45;
        return pose(
          {
            to: 16 * forward,
            hd: -8 * forward,
            px: 10 * forward,
            py: 12,
            fx: 14 * forward,
            bx: 14 * forward,
            fr: -10,
          },
          "crouch",
        );
      }
      if (fighter.stun > 0 && !(fighter.guard && fighter.blockStun > 0))
        return this.hurtPose(fighter, state, out, airborne);
      state.fell = false;
      state.blown = false;

      if (airborne) return this.airPose(fighter, out);

      // 蹲下：先屈膝，再換成蹲姿的圖，起身時反過來
      const guardOn = fighter.guard ? 1 : 0;
      state.guard += (guardOn - state.guard) * (1 - Math.exp(-30 * dt));
      const jolt = fighter.blockStun > 0 ? 1 : 0; // 剛擋下一擊，身體往後一頓
      // 蹲下。
      if (state.crouch > 0.4) {
        const rise = 1 - state.crouch;
        out.rate = 34;
        const breath = wave(t * style.tempo);
        return pose(
          {
            py: -rise * 60 + breath * 1.2,
            to: breath * 0.8 - state.guard * 5 - jolt * 8,
            hd: state.guard * 4,
            px: -state.guard * 4 - jolt * 8,
            au: -state.guard * 18,
            al: -state.guard * 10,
          },
          "crouch",
        );
      }
      const bend = state.crouch * 100 + (state.landT > 0 ? 34 : 0);

      if (fighter.walking && Math.abs(fighter.vx) > 20 && !bend)
        return this.walk(fighter, state, out);

      // 待機：呼吸、踮步，手與頭的擺動慢半拍，看起來才不僵硬
      const w = t * style.tempo;
      const g = state.guard;
      out.rate = bend ? 40 : 22;
      return pose({
        px: wave(w * 0.5) * 3.2 * (1 - g) - g * 12 - jolt * 14,
        py: style.low + bend + (1 - wave(w)) * style.bounce * 0.5 + g * 12,
        to: style.lean + wave(w - 0.5) * 1.3 + bend * 0.22 - g * 9 - jolt * 9,
        hd: wave(w - 1.1) * 1.2 - bend * 0.1 + g * 13,
        au: wave(w - 0.9) * 3 - g * 30 - jolt * 6,
        al: wave(w - 1.4) * 3 - g * 16,
        fx: wave(w * 0.5) * 1.2,
      });
    }

    // 跑步（衝刺、進場）：身體前傾，兩腳大步交替
    run(out, state, amount) {
      const phase = state.gait / TAU;
      const a = step(phase, 66, 52);
      const b = step(phase + 0.5, 66, 52);
      out.rate = 60;
      out.s = "idle";
      out.p = complete({
        px: 20 * amount,
        py: 20 - Math.abs(wave(state.gait)) * 10,
        to: 19 * amount,
        hd: -12 * amount,
        au: wave(state.gait) * 12,
        fx: a[0] - 40,
        fy: a[1],
        fr: a[2],
        bx: b[0] + 46,
        by: b[1],
        br: b[2],
        fk: 0.15,
        bk: 0.25,
      });
      return out;
    }

    // 追擊衝步：壓低身體貼著地面滑過去，拳頭收在腰邊
    rushPose(move, out) {
      const p = easeOut(clamp(move.rush.time / 0.07, 0, 1));
      out.rate = 70;
      out.s = "idle";
      out.p = complete({
        px: 34 * p,
        py: 34 * p,
        to: 30 * p,
        hd: -21 * p,
        au: 26 * p,
        al: 12 * p,
        fx: 44 * p,
        fy: 5 * p,
        fr: -8 * p,
        bx: -62 * p,
        by: 30 * p,
        br: 44 * p,
        bk: 0.4,
        sx: 1 + 0.04 * p,
      });
      return out;
    }

    // 走路：前後腳輪流小步移動，不會交叉，像拳擊的步伐
    walk(fighter, state, out) {
      const phase = state.gait / TAU;
      const a = step(phase, 34, 17);
      const b = step(phase + 0.5, 34, 13);
      const forward = Math.sign(fighter.vx * fighter.face);
      const style = STYLE[fighter.profile.id];
      out.rate = 60;
      out.s = "idle";
      out.p = complete({
        px: 4 * forward,
        py: style.low + 7 - Math.abs(wave(state.gait)) * 6,
        to: style.lean + 4 * forward + wave(state.gait * 2) * 1.4,
        hd: -2.5 * forward,
        au: wave(state.gait + 0.6) * 5,
        al: wave(state.gait + 0.2) * 4,
        fx: a[0],
        fy: a[1],
        fr: a[2] * 0.5,
        bx: b[0],
        by: b[1],
        br: b[2] * 0.5,
      });
      return out;
    }

    // 跳躍：上升時縮腿，最高點抱膝，下墜時把腳伸出來準備落地
    airPose(fighter, out) {
      const v = clamp(fighter.vy / 760, -1, 1);
      const tuck = 1 - Math.abs(v);
      out.rate = 24;
      out.s = "idle";
      out.p = complete({
        py: -6 * v,
        sy: 1 + 0.03 * Math.abs(v),
        to: 5 + tuck * 10 - (v < 0 ? 4 : 0),
        hd: -tuck * 6 + (v < 0 ? 6 : 0),
        au: -10 - tuck * 6 + (v < 0 ? -12 : 0),
        fx: -16 + (v < 0 ? 10 : -6),
        fy: 22 + tuck * 44,
        fr: 14 + tuck * 10,
        bx: 22,
        by: 6 + tuck * 46,
        br: 26 * tuck + 12,
      });
      return out;
    }

    // 出招時的姿勢。
    movePose(fighter, move, out, match, lag = 0) {
      const airborne = fighter.y > 0;
      if (move.spec.counter) {
        // 反擊架勢：壓低、蓄勢待發
        out.rate = 34;
        out.s = "crouch";
        out.p = complete({
          to: -7,
          hd: 5,
          px: -8,
          au: -14,
          py: wave(this.state(fighter).time * 30) * 0.8,
        });
        return out;
      }
      if (move.action === "super" && !move.next && match?.hitStop > 0.05) {
        // 大招發動的瞬間：沉腰聚氣
        out.rate = 16;
        out.s = "crouch";
        out.p = complete({ to: -8, hd: -10, px: -8, py: -16, au: 18, al: 24 });
        return out;
      }
      const keys = this.keysFor(fighter, move);
      const time = Math.max(0, move.elapsed - lag);
      const now = sample(keys, time);
      // 出手最快的那一小段：往回取幾個瞬間當殘影，手腳看起來才連續
      if (now.strike || (now.limb && time < (move.smear ?? 0))) {
        if (now.strike) move.smear = time + 0.04;
        out.trail = [0.034, 0.022, 0.011]
          .map((back) => sample(keys, Math.max(0, time - back)))
          .filter((item) => item.s === now.s)
          .map((item) => item.p);
      }
      out.s = now.s;
      out.p = now.p;
      out.limb = now.limb;
      out.strike = now.strike;
      out.rate = now.fast ? 120 : 60;
      out.fade = now.strike ? HIT_FADE : POSE_FADE;
      // 升龍等離地的招式：腿跟著身體收起來
      if (airborne && move.drift && !now.limb) {
        // 空中移動時腳收起來。
        out.p = {
          ...out.p,
          fx: -18,
          fy: 46,
          fr: 12,
          bx: 24,
          by: 22,
          br: 18,
        };
      }
      return out;
    }

    // 摔技。
    throwPose(move, out) {
      const { elapsed } = move;
      out.rate = 45;
      out.s = "punch";
      if (elapsed < 0.09) {
        const p = elapsed / 0.09;
        out.p = complete({ ax: 0.6 + 0.35 * p, au: 8, to: 10 * p, st: 0.4 });
        out.s = elapsed < 0.04 ? "idle" : "punch";
        if (out.s === "idle") out.p = complete({ to: 6, px: 6 });
      } else if (move.grabbed && elapsed < 0.4) {
        // 把人舉起來
        const p = easeInOut((elapsed - 0.09) / 0.31);
        out.p = complete({
          ax: 0.86,
          au: 4 - 46 * p,
          to: 8 - 22 * p,
          hd: 6 * p,
          px: 8 - 18 * p,
          py: 14 * p,
          st: 0.55,
        });
      } else if (move.grabbed) {
        // 往前摔
        out.rate = 52;
        out.p = complete({
          au: 38,
          to: 30,
          hd: -10,
          px: 26,
          py: 26,
          st: 0.95,
        });
      } else {
        // 沒抓到：身體往前栽
        out.p = complete({ ax: 0.9, au: 14, to: 18, px: 16, py: 8, st: 0.6 });
        if (elapsed > 0.36) {
          out.s = "idle";
          out.p = complete({ to: 10, px: 8, py: 8 });
        }
      }
      return out;
    }

    // 受擊與被擊飛。
    hurtPose(fighter, state, out, airborne) {
      out.s = "idle";
      if (airborne) {
        state.fell = true;
        const v = clamp(fighter.vy / 700, -1, 1);
        // 被打飛：重擊是整個人橫著飛，輕一點的只往後仰，四肢被甩在後面
        const flat = state.blown ? 1 : 0;
        out.rate = flat ? 26 : 20;
        out.p = complete({
          rot: -34 - flat * 46 + v * (16 + flat * 14),
          y: -flat * 26,
          to: -18 - flat * 6,
          hd: -16 - flat * 8,
          au: -30 - flat * 16,
          al: 18,
          px: -6,
          fx: 18 - flat * 12,
          fy: 46,
          fr: -20,
          bx: 44,
          by: 26,
          bk: 0.4,
        });
        return out;
      }
      const k = clamp(fighter.stun / 0.3, 0, 1);
      if (state.fell) {
        if (state.blown && k > 0.5) {
          // 摔在地上：仰躺，膝蓋還屈著
          out.rate = 30;
          out.p = complete({
            rot: -84,
            y: -104,
            to: 8,
            hd: 12,
            au: 14,
            fx: -40,
            fy: 60,
            fr: 12,
            bx: 70,
            by: 14,
            bk: 0.2,
          });
          return out;
        }
        // 撐起身體：單膝著地
        out.rate = 18;
        out.s = "crouch";
        out.p = complete({ to: 14 + 8 * k, hd: 14, au: 22, py: 4 });
        return out;
      }
      out.rate = 30;
      const heavy = 0.8 + state.hurt * 0.6;
      const { side, hurtAt } = state;
      if (hurtAt < 0.36) {
        // 被踢到腿：膝蓋一軟往前彎
        out.p = complete({
          to: 24 * k * heavy + 4,
          hd: 16 * k,
          px: -18 * k,
          py: 24 * k * heavy,
          au: 18 * k,
          fx: -14 * k,
          bx: -10 * k,
        });
      } else if (hurtAt < 0.56) {
        // 打在肚子：整個人往前折，屁股往後退
        out.p = complete({
          to: 27 * k * heavy,
          hd: 18 * k,
          px: -34 * k * heavy,
          py: 12 * k,
          au: 26 * k,
          al: 16 * k,
          fx: -20 * k * heavy,
          fy: 6 * k,
          bx: -20 * k * heavy,
        });
      } else {
        // 打在臉：上半身後仰，前腳被震離地面；連續被打時左右交替
        const twist = side > 0 ? 1 : 0.62;
        out.p = complete({
          to: -30 * k * heavy * twist - 2,
          hd: (side > 0 ? -28 : -44) * k * heavy,
          px: -28 * k * heavy,
          py: 8 * k,
          au: (side > 0 ? 22 : -16) * k,
          al: 12 * k,
          fx: -20 * k * heavy,
          fy: 18 * k * heavy,
          fr: -22 * k * heavy,
          bx: -14 * k * heavy,
        });
      }
      return out;
    }

    // 每一幀更新：目標姿勢、換圖淡入、彈簧與重力感。
    update(fighter, dt, frozen = false, match = null, lag = 0) {
      const state = this.state(fighter);
      state.time += dt;
      state.snap = Math.max(0, state.snap - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.landT = Math.max(0, state.landT - dt);
      state.hurt = Math.max(0, state.hurt - dt * 2.4);
      if (!frozen && dt > 0) {
        const cycle = fighter.dash ? 173 : 89; // 走完一個循環的距離
        state.gait += ((fighter.vx * fighter.face * dt) / cycle) * TAU;
      }
      const t = this.target(fighter, state, match, dt, lag);
      // 剛被打中：第一瞬間就擺出受擊姿勢，定格時才看得到
      if (state.snap > 0 && fighter.stun > 0) t.rate = 120;
      state.trail = t.trail ?? [];
      const { fix } = state;
      const keep = Math.exp(-dt / fix.tau);
      for (const key of ["px", "py", "to"]) fix[key] *= keep;
      if (t.s !== state.sprite) {
        const before = this.withFix(state, state.pose);
        this.carryOver(fighter, state, t);
        // 換圖：新圖直接從目標姿勢開始，舊圖停在原本的姿勢淡出
        if (state.fade >= 0.5) {
          state.prevSprite = state.sprite;
          state.prevPose = before;
        }
        state.sprite = t.s;
        state.pose = { ...t.p };
        state.fade = 0;
        state.fadeTime = t.fade;
      } else {
        const k = 1 - Math.exp(-t.rate * dt);
        const pose = {};
        for (const key of KEYS)
          pose[key] = state.pose[key] + (t.p[key] - state.pose[key]) * k;
        state.pose = pose;
      }
      state.limb = t.limb;
      state.strike = Boolean(t.strike);
      state.fade = Math.min(1, state.fade + dt / state.fadeTime);

      // 彈簧分成小步算，畫面慢的時候也不會亂跳
      let remaining = dt;
      const speed = fighter.vx * fighter.face;
      const airborne = fighter.y > 0 || fighter.vy > 0;
      const lift = airborne ? fighter.vy : 0;
      // 馬尾與腰帶：往前衝就往後飄，往下掉就往上揚
      const drag = clamp(speed * 0.05 - lift * 0.02, -38, 38);
      const idle = wave(state.time * 2.1) * 3.5;
      // 彈簧分成小步算，掉幀時不會爆掉。
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 120);
        stepSpring(state.ox, 0, 620, 30, h);
        stepSpring(state.rot, 0, 420, 24, h);
        stepSpring(state.sx, 1, 700, 24, h);
        stepSpring(state.sy, 1, 700, 24, h);
        stepSpring(state.face, fighter.face, 2600, 100, h);
        stepSpring(state.tail, drag * 0.8 + idle, 90, 9, h);
        stepSpring(state.sash, drag + idle * 0.8, 110, 9, h);
        remaining -= h;
      }
      // 進場的位移直接指定（彈簧會跟不上，角色會拖在後面）
      if (t.snapOx !== undefined) {
        state.ox.x = t.snapOx;
        state.ox.v = 0;
      }
      const full =
        fighter.meter >= 100 || fighter.move?.action === "super" ? 1 : 0;
      state.aura += (full - state.aura) * (1 - Math.exp(-6 * dt));
      state.dirty = true;
      return state;
    }

    /* 換圖的銜接：算出兩張圖的骨盆與上身差多少，讓新圖從舊圖的位置出發，
       再很快回到自己的姿勢（腳由 IK 固定在地上，看起來是身體在移動）。 */
    carryOver(fighter, state, next) {
      if (!this.rig.scaleOf) return; // 備案的整張圖不需要
      const { id } = fighter.profile;
      // 算出骨盆與頭的位置。
      const place = (sprite, pose) => {
        const [x, y] = this.rig.point(id, sprite, pose, "pelvis", "pel");
        const [hx, hy] = this.rig.point(id, sprite, pose, "head", "crown");
        return { x, y, lean: Math.atan2(hx - x, hy - y) * (180 / Math.PI) };
      };
      const { fix } = state;
      const old = place(state.sprite, this.withFix(state, state.pose));
      const now = place(next.s, next.p);
      const scale = this.rig.scaleOf(id);
      const limit = (value, max) => clamp(value, -max, max);
      fix.px = limit((old.x - now.x) / scale, 60);
      fix.py = limit((now.y - old.y) / scale, 90);
      fix.to = limit(old.lean - now.lean, 40);
      fix.tau = next.strike ? 0.016 : 0.045;
    }

    // 加上換圖時的修正量。
    withFix({ fix }, pose) {
      return {
        ...pose,
        px: pose.px + fix.px,
        py: pose.py + fix.py,
        to: pose.to + fix.to,
      };
    }

    // 彈簧的餘震加到姿勢上，變成最後要畫的姿勢
    finalPose(state, base, fresh = true) {
      const pose = fresh ? this.withFix(state, base) : base;
      const shake = (state.rot.x * 180) / Math.PI;
      return {
        ...pose,
        to: pose.to + shake * 1.2,
        hd: pose.hd + shake * 0.5,
        sx: pose.sx * clamp(state.sx.x, 0.82, 1.22),
        sy: pose.sy * clamp(state.sy.x, 0.82, 1.18),
        tl: clamp(state.tail.x - pose.to * 0.35 - pose.hd * 0.4, -55, 55),
        ss: clamp(state.sash.x, -60, 60),
      };
    }

    // 畫出這一幀的角色（含換圖的淡入淡出、受擊閃光）
    compose(fighter, state, single = false) {
      const { id } = fighter.profile;
      const canvas = this.layers[fighter.index];
      if (this.rig.lost) return canvas; // 顯示卡重設中，先用上一幀的樣子
      const ctx = canvas.getContext("2d");
      const look = { face: fighter.face, ...state.light };
      if (state.flash > 0) {
        const strength = Math.min(1, state.flash / 0.1) ** 1.5 * 0.36;
        look.flash = [...flashRgb(state.flashColor), strength];
      }
      ctx.globalCompositeOperation = "copy";
      ctx.globalAlpha = 1;
      const fading = !single && state.fade < 1;
      if (fading) {
        // 兩張圖用相加混合，等於精確的線性交叉淡化
        ctx.globalAlpha = 1 - state.fade;
        const old = this.finalPose(state, state.prevPose, false);
        ctx.drawImage(this.rig.render(id, state.prevSprite, old, look), 0, 0);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = state.fade;
      }
      const pose = this.finalPose(state, state.pose);
      if (!fading && !single && state.trail.length) {
        // 揮拳踢腿的殘影：由舊到新疊在本體底下，只有動得快的手腳看得到
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.trail.forEach((old, i, list) => {
          const back = this.finalPose(state, old);
          ctx.globalAlpha = 0.12 + (0.32 * (i + 1)) / list.length;
          ctx.drawImage(this.rig.render(id, state.sprite, back, look), 0, 0);
        });
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(this.rig.render(id, state.sprite, pose, look), 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      state.dirty = false;
      return canvas;
    }

    /* 這一擊的拳頭或腳掃過的路線（以腳底中央為原點，x 往前、y 往上），
       給 effects.js 畫揮擊的光帶，也用來決定打擊火花的高度。 */
    swingPath(fighter, at) {
      const move = fighter.move;
      if (!move || move.action === "throw" || move.spec.burstMove) return null;
      const keys = this.keysFor(fighter, move);
      const i = keys.findIndex((k) => k.strike && Math.abs(k.t - at) < 0.02);
      if (i < 1) return null;
      const key = keys[i];
      const foot = key.limb === "foot";
      const { id } = fighter.profile;
      const start = keys[i - 1].t;
      const points = [];
      for (let n = 0; n <= 8; n += 1) {
        const { s, p } = sample(keys, start + ((key.t - start) * n) / 8 + 1e-6);
        if (s !== key.s) continue;
        const bone = foot ? "footF" : "armL";
        points.push(this.rig.point(id, s, p, bone, foot ? "toF" : "haF"));
      }
      return points.length > 1 ? { points, foot } : null;
    }

    // 兩隻腳現在的位置（場地像素，相對於腳底中央），影子用
    feet(fighter, state) {
      const { id } = fighter.profile;
      const pose = this.finalPose(state, state.pose);
      return [
        this.rig.point(id, state.sprite, pose, "footB", "toB"),
        this.rig.point(id, state.sprite, pose, "footF", "toF"),
      ];
    }

    // 把畫布移到角色的腳底，並處理轉身
    transform(ctx, fighter, state, x, y) {
      ctx.translate(x + state.ox.x * fighter.face, y);
      const face = state.face.x;
      const turn =
        Math.sign(face || fighter.face) *
        Math.max(0.18, Math.min(1, Math.abs(face)));
      ctx.scale(turn, 1);
    }

    // 把角色畫到場景上，可以加光暈。
    draw(ctx, fighter, state, { glow = null, glowSize = 0 } = {}) {
      // 同一幀內（本體、倒影）只需要畫一次
      const image = state.dirty
        ? this.compose(fighter, state)
        : this.layers[fighter.index];
      if (glow && glowSize > 0) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = glowSize;
      }
      ctx.drawImage(image, -ORIGIN.x, -ORIGIN.y, SIZE.width, SIZE.height);
      ctx.shadowBlur = 0;
    }

    // 染色的現在姿勢（不含換圖的淡入淡出），殘影用
    snapshot(fighter, state, color, tint = 0.55) {
      const image = this.compose(fighter, state, true);
      state.dirty = true;
      const canvas = this.pool.pop() ?? this.layer();
      const c = canvas.getContext("2d");
      c.globalCompositeOperation = "copy";
      c.globalAlpha = 1;
      c.drawImage(image, 0, 0);
      c.globalCompositeOperation = "source-atop";
      c.globalAlpha = tint;
      c.fillStyle = color;
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      return canvas;
    }

    release(canvas) {
      if (this.pool.length < 16) this.pool.push(canvas);
    }
  }

  FighterAnimation.ORIGIN = ORIGIN;
  FighterAnimation.SIZE = SIZE;
  game.FighterAnimation = FighterAnimation;
})();
