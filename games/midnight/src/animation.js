(() => {
  const game = globalThis.Midnight;
  const FRAME_COUNT = 8;
  const CANVAS_W = 360;
  const CANVAS_H = 300;
  const ORIGIN_X = 160;
  const ORIGIN_Y = 296;
  const POSE_FADE = 0.05;
  const PUNCH_FADE = 0.03;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const easeOut = (t) => 1 - (1 - t) ** 3;

  // Underdamped springs give every pose change a little follow-through instead of snapping.
  function spring(value = 0) {
    return { x: value, v: 0 };
  }

  function stepSpring(s, target, k, damping, dt) {
    s.v += ((target - s.x) * k - s.v * damping) * dt;
    s.x += s.v * dt;
  }

  function poseCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    return canvas;
  }

  class FighterAnimation {
    constructor(atlas, walkAtlas) {
      this.poses = new Map();
      for (const profile of game.FIGHTERS) {
        const poses = {};
        for (const [name, frame] of Object.entries(profile.frames)) {
          const [sx, sy, sw, sh, anchor] = frame;
          const scale = profile.size / profile.frames.idle[3];
          const canvas = poseCanvas();
          canvas
            .getContext("2d")
            .drawImage(
              atlas,
              sx,
              sy,
              sw,
              sh,
              ORIGIN_X - anchor * scale,
              ORIGIN_Y - sh * scale,
              sw * scale,
              sh * scale,
            );
          poses[name] = canvas;
        }
        const frames = game.WALK_FRAMES[game.FIGHTERS.indexOf(profile)];
        const scale =
          profile.size / Math.max(...frames.map((frame) => frame[3]));
        poses.walk = frames.map(([sx, sy, sw, sh, anchor]) => {
          const canvas = poseCanvas();
          canvas
            .getContext("2d")
            .drawImage(
              walkAtlas,
              sx,
              sy,
              sw,
              sh,
              ORIGIN_X - anchor * scale,
              ORIGIN_Y - sh * scale,
              sw * scale,
              sh * scale,
            );
          return canvas;
        });
        this.poses.set(profile.id, poses);
      }
      this.states = new WeakMap();
      this.mix = poseCanvas();
      this.mixContext = this.mix.getContext("2d");
      this.pool = [];
    }

    state(fighter) {
      let state = this.states.get(fighter);
      if (!state) {
        state = {
          pose: "idle",
          prevPose: "idle",
          fade: 1,
          fadeTime: POSE_FADE,
          walk: 0,
          gait: 0,
          time: Math.random() * 10,
          ox: spring(),
          oy: spring(),
          rot: spring(),
          sx: spring(1),
          sy: spring(1),
          face: spring(fighter.face),
          aura: 0,
          ghostTimer: 0,
        };
        this.states.set(fighter, state);
      }
      return state;
    }

    // Instant velocity kicks for reactions (hit recoil, landing squash, take-off stretch).
    kick(fighter, { ox = 0, rot = 0, sx = 0, sy = 0 } = {}) {
      const state = this.state(fighter);
      state.ox.v += ox;
      state.rot.v += rot;
      state.sx.v += sx;
      state.sy.v += sy;
    }

    // Picks exactly one sprite pose per frame. In-between looks ("half crouch", wind-up)
    // come from squash and lean transforms, never from overlaying two silhouettes.
    targets(fighter, state) {
      const t = {
        pose: "idle",
        ox: 0,
        oy: 0,
        rot: 0,
        sx: 1,
        sy: 1,
        fade: POSE_FADE,
      };
      const move = fighter.move;
      const airborne = fighter.y > 0 || fighter.vy > 0;
      if (fighter.hp === 0) {
        t.pose = "crouch";
        t.rot = fighter.y > 0 ? -1.0 : -1.45;
        t.oy = fighter.y > 0 ? 0 : 30;
        return t;
      }
      if (fighter.heldBy) {
        // Lifted off balance by a throw.
        t.rot = -0.35;
        t.oy = -18;
        t.ox = -6;
        t.sx = 0.96;
        return t;
      }
      if (move?.action === "throw") return this.throwPose(move, t);
      if (move?.spec.burstMove) {
        const p = clamp(move.elapsed / 0.12, 0, 1);
        t.sx = 1 + 0.14 * p;
        t.sy = 1 - 0.1 * p;
        t.rot = -0.1 * p;
        return t;
      }
      if (move) {
        const { spec, elapsed } = move;
        const hits = spec.events.filter(
          (event) => event.damage || event.projectile || event.trap,
        );
        const low = move.lowAttack || move.action === "sweep";
        const heavyish = move.action !== "light";
        const reach = move.action === "light" ? 13 : 22;
        const current = hits.find((event) => elapsed < event.at + 0.1);
        if (spec.counter) {
          // Counter stance: low, coiled, ready to spring.
          t.pose = "crouch";
          t.rot = -0.07;
          t.ox = -8;
          t.sx = 1.03;
          t.sy = 0.97 + Math.sin(state.time * 30) * 0.006;
        } else if (move.action === "super" && !move.next) {
          // Charging pose while the super flash plays.
          t.pose = "crouch";
          t.rot = -0.05;
          t.sx = 1.03;
          t.sy = 0.96;
        } else if (current) {
          const windupEnd = current.at - 0.05;
          const previous = hits[hits.indexOf(current) - 1];
          const start = previous ? previous.at + 0.1 : 0;
          if (elapsed < windupEnd) {
            const w = easeOut(
              clamp(
                (elapsed - start) / Math.max(0.03, windupEnd - start),
                0,
                1,
              ),
            );
            // Anticipation: pull back and coil before releasing the blow.
            t.pose = low ? "crouch" : previous ? "punch" : "idle";
            t.rot = -(heavyish ? 0.11 : 0.07) * w;
            t.ox = -(heavyish ? 14 : 7) * w;
            t.oy = (heavyish ? 6 : 2) * w;
            t.sx = 1 + (heavyish ? 0.03 : 0.015) * w;
            t.sy = 1 - (heavyish ? 0.05 : 0.02) * w;
          } else if (low) {
            // Low attacks stay crouched and lunge along the floor.
            t.pose = "crouch";
            t.fade = PUNCH_FADE;
            t.rot = 0.12;
            t.ox = move.action === "sweep" ? 28 : 16;
            t.sx = 1.1;
            t.sy = 0.93;
          } else {
            t.pose = "punch";
            t.fade = PUNCH_FADE;
            t.rot = move.drift ? -0.12 : 0.1;
            t.ox = reach;
            t.sx = 1.07;
            t.sy = move.drift ? 1.1 : 0.96;
          }
        } else {
          // Recovery: hold the extended pose briefly, then settle back.
          const last = hits[hits.length - 1];
          const from = last ? last.at + 0.1 : 0;
          const r = clamp(
            (elapsed - from) / Math.max(0.05, spec.duration - from),
            0,
            1,
          );
          t.pose = low ? "crouch" : last && r < 0.45 ? "punch" : "idle";
          t.ox = reach * (1 - r) * 0.6;
          t.rot = 0.04 * (1 - r);
        }
        if (spec.armor && elapsed < spec.armor[1]) {
          t.rot += 0.1;
          t.sy *= 0.97;
        }
        if (airborne && move.drift) t.pose = "punch";
      } else if (fighter.dash) {
        // Running dash leans hard into the motion; the back-step leans away.
        const forward = fighter.dash.forward;
        t.pose = "walk";
        t.rot = forward ? 0.13 : -0.1;
        t.ox = forward ? 6 : -4;
        t.sx = forward ? 1.05 : 0.97;
        t.sy = forward ? 0.96 : 1;
      } else if (fighter.dodge) {
        const forward = fighter.dodge.direction * fighter.face;
        t.pose = "crouch";
        t.rot = 0.14 * forward;
        t.sx = 1.06;
        t.sy = 0.95;
      } else if (fighter.stun > 0) {
        t.rot = airborne ? -0.55 : -0.17;
        t.ox = -10;
        t.sx = 1.02;
        t.sy = 0.95;
      } else if (fighter.guard) {
        t.rot = -0.06;
        t.ox = -4;
        t.sx = 0.97;
        t.sy = 0.98;
      } else if (fighter.crouch) {
        t.pose = "crouch";
      } else if (airborne) {
        if (fighter.vy > 260) {
          t.sx = 0.93;
          t.sy = 1.08;
          t.rot = 0.05;
        } else if (fighter.vy > -260) {
          t.pose = "crouch"; // Tuck at the top of the arc.
          t.rot = 0.1;
        } else {
          t.sx = 0.96;
          t.sy = 1.05;
        }
      } else if (fighter.walking && Math.abs(fighter.vx) > 20) {
        t.pose = "walk";
        t.rot = clamp(fighter.vx * fighter.face * 0.00018, -0.04, 0.05);
      } else {
        t.sy = 1 + Math.sin(state.time * 3.4) * 0.012;
        t.sx = 1 - Math.sin(state.time * 3.4) * 0.006;
      }
      return t;
    }

    throwPose(move, t) {
      const { elapsed } = move;
      if (elapsed < 0.09) {
        t.rot = 0.08;
        t.ox = 10 * (elapsed / 0.09);
      } else if (move.grabbed && elapsed < 0.4) {
        // Heave the opponent back before the toss.
        const p = (elapsed - 0.09) / 0.31;
        t.pose = "punch";
        t.rot = -0.16 * p;
        t.ox = 8 - 14 * p;
        t.sy = 1 - 0.03 * p;
      } else if (move.grabbed) {
        t.pose = elapsed < 0.48 ? "punch" : "idle";
        t.fade = PUNCH_FADE;
        t.rot = 0.18;
        t.ox = 20;
        t.sx = 1.06;
      } else {
        // Whiffed grab: overreach and stumble.
        t.pose = elapsed < 0.3 ? "punch" : "idle";
        t.rot = 0.14;
        t.ox = 14;
        t.sy = 0.97;
      }
      return t;
    }

    update(fighter, dt, frozen = false) {
      const state = this.state(fighter);
      state.time += dt;
      const t = this.targets(fighter, state);
      if (t.pose !== state.pose) {
        const intoCrouch = t.pose === "crouch" && state.pose !== "crouch";
        const outOfCrouch = state.pose === "crouch" && t.pose !== "crouch";
        if (intoCrouch && fighter.hp > 0)
          state.sy.x = Math.max(state.sy.x, 1.13);
        if (outOfCrouch && fighter.hp > 0)
          state.sy.x = Math.min(state.sy.x, 0.9);
        // Fade out of whichever pose is currently most visible.
        if (state.fade >= 0.5) state.prevPose = state.pose;
        state.pose = t.pose;
        state.fade = 0;
        state.fadeTime = t.fade;
      }
      state.fade = Math.min(1, state.fade + dt / state.fadeTime);
      state.walk +=
        ((t.pose === "walk" ? 1 : 0) - state.walk) * (1 - Math.exp(-20 * dt));
      if (!frozen)
        state.gait += ((fighter.vx * fighter.face * dt) / 190) * Math.PI * 2;
      // Sub-step the springs so they stay stable on slow frames.
      let remaining = dt;
      const ko = fighter.hp === 0;
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 120);
        stepSpring(state.ox, t.ox, 620, 30, h);
        stepSpring(state.oy, t.oy, 400, 30, h);
        stepSpring(state.rot, t.rot, ko ? 120 : 520, ko ? 16 : 26, h);
        stepSpring(state.sx, t.sx, 700, 22, h);
        stepSpring(state.sy, t.sy, 700, 22, h);
        stepSpring(state.face, fighter.face, 1100, 62, h);
        remaining -= h;
      }
      const target =
        fighter.meter >= 100 || fighter.move?.action === "super" ? 1 : 0;
      state.aura += (target - state.aura) * (1 - Math.exp(-6 * dt));
      return state;
    }

    poseImage(poses, name, state) {
      if (name !== "walk") return poses[name];
      // Sprite walk cycles read crisper showing the nearest frame than blending neighbours.
      const frame = Math.floor(
        ((((state.gait / (Math.PI * 2)) * FRAME_COUNT) % FRAME_COUNT) +
          FRAME_COUNT) %
          FRAME_COUNT,
      );
      return poses.walk[frame];
    }

    compose(fighter, state, single = false) {
      const poses = this.poses.get(fighter.profile.id);
      const mix = this.mixContext;
      mix.globalAlpha = 1;
      mix.globalCompositeOperation = "source-over";
      mix.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const fade = single ? 1 : state.fade;
      if (fade < 1 && state.prevPose !== state.pose) {
        // Additive cross-fade of opaque pixels is an exact linear blend; it only lasts a few frames.
        mix.globalCompositeOperation = "lighter";
        mix.globalAlpha = 1 - fade;
        mix.drawImage(this.poseImage(poses, state.prevPose, state), 0, 0);
        mix.globalAlpha = fade;
      }
      mix.drawImage(this.poseImage(poses, state.pose, state), 0, 0);
      if (fighter.flash > 0) {
        mix.globalCompositeOperation = "source-atop";
        mix.globalAlpha = Math.min(1, fighter.flash / 0.12) * 0.7;
        mix.fillStyle = fighter.flashColor ?? "#ffffff";
        mix.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
      mix.globalCompositeOperation = "source-over";
      mix.globalAlpha = 1;
      return this.mix;
    }

    // Applies the procedural transform; callers draw at the returned origin.
    transform(ctx, fighter, state, x, y) {
      ctx.translate(x + state.ox.x * fighter.face, y + state.oy.x);
      const face = state.face.x;
      const turn =
        Math.sign(face || fighter.face) *
        Math.max(0.18, Math.min(1, Math.abs(face)));
      ctx.scale(turn * state.sx.x, state.sy.x);
      ctx.rotate(state.rot.x);
    }

    draw(ctx, fighter, state, { glow = null, glowSize = 0 } = {}) {
      const image = this.compose(fighter, state);
      if (glow && glowSize > 0) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = glowSize;
      }
      ctx.drawImage(image, -ORIGIN_X, -ORIGIN_Y);
      ctx.shadowBlur = 0;
    }

    // A tinted copy of the current pose (never a cross-fade) for afterimage trails.
    snapshot(fighter, state, color, tint = 0.55) {
      const image = this.compose(fighter, state, true);
      const canvas = this.pool.pop() ?? poseCanvas();
      const c = canvas.getContext("2d");
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.clearRect(0, 0, CANVAS_W, CANVAS_H);
      c.drawImage(image, 0, 0);
      c.globalCompositeOperation = "source-atop";
      c.globalAlpha = tint;
      c.fillStyle = color;
      c.fillRect(0, 0, CANVAS_W, CANVAS_H);
      c.globalCompositeOperation = "source-over";
      return canvas;
    }

    release(canvas) {
      if (this.pool.length < 24) this.pool.push(canvas);
    }
  }
  FighterAnimation.ORIGIN = { x: ORIGIN_X, y: ORIGIN_Y };
  game.FighterAnimation = FighterAnimation;
})();
