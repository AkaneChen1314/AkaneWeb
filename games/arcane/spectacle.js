"use strict";

// Visuals have their own clock and random stream; they never alter combat rules.
const Spectacle = (() => {
  const canvas = document.getElementById("battleFX");
  const ctx = canvas.getContext("2d");
  const labels = document.getElementById("battleFXLabels");
  const screen = document.getElementById("battleScreen");
  const caption = document.getElementById("combatCaption");
  const cutin = document.getElementById("ultimateCutin");
  const toggle = document.getElementById("effectsToggle");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    frame = 0,
    events = [],
    timers = new Set(),
    mode = "full",
    hitIndex = 0,
    visualEnd = 0,
    seed = Date.now() >>> 0;
  try {
    mode = localStorage.getItem("astral-fx-mode") || "full";
  } catch (_) {
    /* Storage may be unavailable in file mode. */
  }
  const calm = () => mode === "soft" || reduced.matches;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }
  function size() {
    const r = screen.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function point(side) {
    const r = screen.querySelector(`.${side}-unit .unit-art`).getBoundingClientRect(),
      s = screen.getBoundingClientRect();
    return { x: r.left - s.left + r.width * 0.5, y: r.top - s.top + r.height * 0.4 };
  }
  function updateMode() {
    const soft = calm();
    screen.classList.toggle("soft-effects", soft);
    toggle.textContent = `特效：${soft ? "柔和" : "華麗"}`;
    toggle.setAttribute("aria-pressed", String(!soft));
    toggle.title = reduced.matches ? "系統已啟用減少動態效果" : "切換華麗／柔和特效";
  }
  toggle.onclick = () => {
    mode = mode === "full" ? "soft" : "full";
    try {
      localStorage.setItem("astral-fx-mode", mode);
    } catch (_) {}
    reset();
    updateMode();
  };
  reduced.addEventListener("change", () => {
    reset();
    updateMode();
  });
  new ResizeObserver(size).observe(screen);
  updateMode();
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    events = [];
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    labels.replaceChildren();
    caption.classList.remove("show");
    cutin.classList.remove("show");
    screen.classList.remove("fx-impact");
    ctx?.clearRect(0, 0, width, height);
    hitIndex = 0;
    visualEnd = 0;
    screen.querySelectorAll(".unit-art").forEach((n) => n.classList.remove("hit", "cast", "heal"));
  }
  function start() {
    reset();
    size();
    updateMode();
    announce("界域開啟", "你的回合", "觀察敵方意圖，安排本回合出牌。", "#94d9ef");
  }
  function announce(kind, name, outcome, color, enemy = false) {
    caption.classList.toggle("enemy", enemy);
    caption.style.setProperty("--fx-accent", color);
    document.getElementById("combatKind").textContent = kind;
    document.getElementById("combatName").textContent = name;
    document.getElementById("combatOutcome").textContent = outcome;
    caption.classList.add("show");
    if (announce.timer) {
      clearTimeout(announce.timer);
      timers.delete(announce.timer);
    }
    announce.timer = later(() => caption.classList.remove("show"), 1300);
  }
  function queue(type, side, color, delay = 0, power = 1) {
    if (!ctx || calm() || !screen.classList.contains("active")) return;
    if (events.length > 42) return;
    events.push({
      type,
      side,
      color,
      start: performance.now() + delay,
      duration: type === "arrow" ? 620 : 780,
      power,
      from: point(side === "enemy" ? "player" : "enemy"),
      to: point(side),
      rnd: Array.from({ length: 22 }, () => random()),
    });
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function number(side, value, kind = "damage", note = "", delay = 0) {
    const p = point(side),
      n = document.createElement("div");
    n.className = `fx-number ${kind}`;
    n.style.left = `${p.x + ((hitIndex % 3) - 1) * 13}px`;
    n.style.top = `${p.y + 18 - (hitIndex % 3) * 18}px`;
    n.textContent = value;
    if (note) {
      const s = document.createElement("small");
      s.textContent = note;
      n.append(s);
    }
    later(() => {
      labels.append(n);
      later(() => n.remove(), calm() ? 600 : 900);
    }, delay);
  }
  function pop(side, value, type) {
    if (type === "cast" || String(value).startsWith("盾")) return;
    const delay = (hitIndex++ % 6) * 85;
    number(
      side,
      type === "heal" ? `+${value}` : typeof value === "number" ? `−${Math.ceil(value)}` : value,
      type === "heal" ? "heal" : String(value).startsWith("盾") ? "shield" : "damage",
      "",
      delay,
    );
    queue("impact", side, type === "heal" ? "#92e9b7" : "#ffae91", delay, 0.6);
  }
  function absorb(side, amount) {
    number(side, `抵擋 ${Math.ceil(amount)}`, "shield", "護盾吸收", 50);
    queue("shield", side, "#80c4eb", 0, 0.7);
  }
  function attack(item, actor, side = "player") {
    hitIndex = 0;
    visualEnd = performance.now() + (item.ultimate && !calm() ? 1080 : 650);
    const target = side === "player" ? "enemy" : "player",
      color = item.color || actor.color || "#ff94a0";
    const result = { hp: actor.hp, block: actor.block, energy: actor.energy };
    const projectile =
      actor.id === "frost"
        ? "arrow"
        : item.magic || actor.id === "lunar"
          ? "spell"
          : item.shieldDamage
            ? "shock"
            : "slash";
    const kind =
      side === "player"
        ? `${actor.className} · ${item.type}${item.hits ? ` · ${item.hits} 連擊` : ""}`
        : "敵方行動";
    announce(kind, item.name, "", color, side === "enemy");
    if (item.damage)
      for (let i = 0; i < Math.min(item.hits || 1, 6); i++)
        queue(projectile, target, color, i * 110, item.ultimate ? 1.65 : 1);
    if (item.block || item.counter || item.ward) queue("shield", side, "#88cce9");
    if (item.heal || item.regen || item.cleanse) queue("heal", side, "#91e6b5");
    if (item.summon) queue("summon", side, "#a0f0c6");
    if (!item.damage && !item.block && !item.heal) queue("spell", side, color);
    if (item.ultimate) {
      document.getElementById("cutinPortrait").src = actor.image;
      document.getElementById("cutinName").textContent = item.name;
      cutin.classList.remove("show");
      void cutin.offsetWidth;
      cutin.classList.add("show");
      later(() => cutin.classList.remove("show"), calm() ? 650 : 1050);
      queue("nova", target, "#e7d09d", 260, 1.8);
    }
    if (item.damage && !calm()) {
      screen.classList.remove("fx-impact");
      void screen.offsetWidth;
      screen.classList.add("fx-impact");
      later(() => screen.classList.remove("fx-impact"), 300);
    }
    return result;
  }
  function outcome(before, actor, side, item, damage) {
    const parts = [];
    if (damage) parts.push(`傷害 ${Math.ceil(damage)}${item.hits ? ` · ${item.hits} 連擊` : ""}`);
    const heal = actor.hp - before.hp,
      shield = actor.block - before.block,
      energy = actor.energy - before.energy;
    if (heal > 0) {
      parts.push(`生命 +${Math.ceil(heal)}`);
      number(side, `+${Math.ceil(heal)}`, "heal", "生命恢復", 160);
    }
    if (shield > 0) {
      parts.push(`護盾 +${Math.ceil(shield)}`);
      number(side, `+${Math.ceil(shield)}`, "shield", "護盾建立", 250);
    }
    if (energy > 0) parts.push(`星能 +${Math.floor(energy)}`);
    if (item.draw) parts.push(`抽牌 ${item.draw}`);
    document.getElementById("combatOutcome").textContent = parts.join("　") || "術式已生效";
  }
  function ring(x, y, r, color, alpha = 1, line = 2) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
    ctx.stroke();
  }
  function sigil(x, y, r, color, t, sides = 6) {
    ring(x, y, r, color, 0.65, 1.5);
    ring(x, y, r * 0.7, color, 0.3, 1);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + t;
      const xx = x + Math.cos(a) * r,
        yy = y + Math.sin(a) * r;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - t;
      ring(x + Math.cos(a) * r, y + Math.sin(a) * r, 3, color, 0.6);
    }
  }
  function sparks(e, t, x, y) {
    const count = width < 721 ? 10 : 20;
    for (let i = 0; i < count; i++) {
      const angle = e.rnd[i] * Math.PI * 2,
        d = (15 + e.rnd[(i + 3) % 22] * 85) * t * e.power;
      const xx = x + Math.cos(angle) * d,
        yy = y + Math.sin(angle) * d + t * t * 36;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(xx, yy, 1 + e.rnd[i] * 2, 0, 7);
      ctx.fill();
    }
  }
  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    events = events.filter((e) => now - e.start < e.duration);
    for (const e of events) {
      const t = (now - e.start) / e.duration;
      if (t < 0) continue;
      const { x, y } = e.to;
      const fade = Math.sin(Math.PI * t),
        r = (width < 721 ? 43 : 70) * e.power;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = e.color;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = fade;
      if (e.type === "slash") {
        const a = e.rnd[0] * 0.8 - 0.4;
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.lineWidth = 6 * fade;
        ctx.beginPath();
        ctx.moveTo(-r * 1.4, -r * 0.8);
        ctx.quadraticCurveTo(r * 0.1, r * 0.5, r * 1.2, r * 0.8);
        ctx.stroke();
        ctx.strokeStyle = "#e8f7ff";
        ctx.lineWidth = 2;
        ctx.stroke();
        sparks(e, t, 0, 0);
      } else if (e.type === "arrow") {
        const travel = Math.min(1, t * 3),
          xx = e.from.x + (x - e.from.x) * travel,
          yy = e.from.y + (y - e.from.y) * travel,
          angle = Math.atan2(y - e.from.y, x - e.from.x);
        ctx.translate(xx, yy);
        ctx.rotate(angle);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-60, 0);
        ctx.lineTo(12, 0);
        ctx.lineTo(2, -6);
        ctx.moveTo(12, 0);
        ctx.lineTo(2, 6);
        ctx.stroke();
        if (travel === 1) sparks(e, t, 0, 0);
      } else if (e.type === "spell" || e.type === "summon") {
        sigil(x, y, r * (0.5 + t * 0.8), e.color, t * 2, e.type === "summon" ? 8 : 6);
        sparks(e, t, x, y);
        if (e.type === "spell" && Math.abs(e.from.x - x) > 10) {
          ctx.globalAlpha = fade * 0.3;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(e.from.x, e.from.y);
          ctx.quadraticCurveTo((x + e.from.x) / 2, y - 50, x, y);
          ctx.stroke();
        }
      } else if (e.type === "shield") {
        sigil(x, y, r * (0.7 + t * 0.35), e.color, t * 0.15, 6);
        ctx.globalAlpha = fade * 0.12;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
      } else if (e.type === "heal") {
        for (let i = 0; i < 7; i++) {
          const xx = x + (e.rnd[i] - 0.5) * r * 2,
            yy = y + 25 - t * 90 + e.rnd[i + 4] * 45;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xx - 4, yy);
          ctx.lineTo(xx + 4, yy);
          ctx.moveTo(xx, yy - 4);
          ctx.lineTo(xx, yy + 4);
          ctx.stroke();
        }
        ring(x, y, r * (0.5 + t), e.color, fade * 0.55);
      } else {
        ring(x, y, r * t, e.color, fade, e.type === "nova" ? 5 : 2);
        ring(x, y, r * t * 0.65, e.color, fade * 0.6);
        sparks(e, t, x, y);
        if (e.type === "nova" || e.type === "shock") sigil(x, y, r * t * 1.5, e.color, t, 8);
      }
      ctx.restore();
    }
    frame = events.length ? requestAnimationFrame(draw) : 0;
  }
  const finishDelay = () => Math.max(650, Math.ceil(visualEnd - performance.now()));
  return { start, reset, pop, absorb, attack, outcome, announce, queue, calm, finishDelay };
})();
