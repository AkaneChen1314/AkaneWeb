// Pointer IDs keep movement, aiming and action fingers independent.
export function supportsTouch(env = globalThis) {
  return (env.navigator?.maxTouchPoints || 0) > 0 ||
    env.matchMedia?.('(any-pointer: coarse)').matches === true;
}

export function createTouchControls({ root, canvas, onLook, onAction, env = globalThis }) {
  const pointers = new Map();
  const pad = root.querySelector('[data-touch-move]');
  const knob = pad.querySelector('span');
  const buttons = [...root.querySelectorAll('[data-touch-action]')];
  let playing = false;
  let coordinateScale = 1;
  const state = { enabled: supportsTouch(env), moveX: 0, moveY: 0, sprint: false };
  env.document.body.classList.toggle('neon-touch', state.enabled);
  function updateScale() {
    const width = env.innerWidth || 1, height = env.innerHeight || 1;
    const sw = env.screen?.width || width, sh = env.screen?.height || height;
    const screenWidth = width > height ? Math.max(sw, sh) : Math.min(sw, sh);
    coordinateScale = Math.max(1, Math.min(3, width / screenWidth));
    env.document.body.style.setProperty?.('--touch-scale', String(coordinateScale));
  }
  updateScale();
  env.addEventListener('resize', updateScale);

  function press(button, active) {
    button.classList.toggle('pressed', active);
    if (['aim', 'sprint'].includes(button.dataset.touchAction))
      button.setAttribute('aria-pressed', String(active));
  }
  function centerMove() {
    state.moveX = state.moveY = 0;
    knob.style.transform = 'translate(0px, 0px)';
    pad.classList.remove('pressed');
  }
  function release(id, cancelled = false) {
    const pointer = pointers.get(id);
    if (!pointer) return;
    pointers.delete(id);
    if (pointer.kind === 'move') centerMove();
    if (pointer.kind === 'fire') onAction('fire', false);
    if (pointer.kind === 'grenade') onAction(cancelled ? 'grenade-cancel' : 'grenade-throw');
    if (pointer.node !== canvas && !['aim', 'sprint'].includes(pointer.kind)) press(pointer.node, false);
    try { if (pointer.node.hasPointerCapture?.(id)) pointer.node.releasePointerCapture(id); } catch (_) { /* Already cancelled by the browser. */ }
  }
  function reset() {
    [...pointers.keys()].forEach(id => release(id, true));
    centerMove();
    state.sprint = false;
    onAction('fire', false);
    onAction('aim', false);
    onAction('grenade-cancel');
    buttons.forEach(button => press(button, false));
  }
  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (pointer.kind === 'move') {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      const distance = Math.hypot(dx, dy), radius = pointer.radius;
      const scale = distance > radius ? radius / distance : 1;
      const amount = Math.max(0, Math.min(1, distance / radius) - .12) / .88;
      state.moveX = distance ? dx / distance * amount : 0;
      state.moveY = distance ? dy / distance * amount : 0;
      knob.style.transform = `translate(${dx * scale / coordinateScale}px, ${dy * scale / coordinateScale}px)`;
    } else if (pointer.kind === 'look' || pointer.kind === 'fire') {
      onLook((event.clientX - pointer.x) / coordinateScale, (event.clientY - pointer.y) / coordinateScale);
      pointer.x = event.clientX; pointer.y = event.clientY;
    }
  }
  function bind(node, kind) {
    node.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      if (!playing || !state.enabled) return;
      event.preventDefault(); event.stopPropagation();
      root.dataset.interacted = 'true';
      if ([...pointers.values()].some(pointer => pointer.kind === kind)) return;
      const pointer = { node, kind, x: event.clientX, y: event.clientY };
      if (kind === 'move') {
        const rect = pad.getBoundingClientRect();
        pointer.x = rect.left + rect.width / 2;
        pointer.y = rect.top + rect.height / 2;
        pointer.radius = rect.width * .34;
      }
      pointers.set(event.pointerId, pointer);
      try { node.setPointerCapture(event.pointerId); } catch (_) { /* Window release remains a fallback. */ }
      if (kind === 'move') { pad.classList.add('pressed'); move(event); }
      else if (kind === 'look') { /* A second finger can fire while this one looks. */ }
      else if (kind === 'aim' || kind === 'sprint') {
        const active = node.getAttribute('aria-pressed') !== 'true';
        press(node, active);
        if (kind === 'sprint') state.sprint = active;
        else onAction('aim', active);
      } else {
        press(node, true);
        if (kind === 'fire') onAction('fire', true);
        else onAction(kind === 'grenade' ? 'grenade-start' : kind);
      }
    }, { passive: false });
    node.addEventListener('pointermove', move, { passive: false });
    node.addEventListener('lostpointercapture', event => release(event.pointerId, true));
    node.addEventListener('contextmenu', event => event.preventDefault());
  }
  bind(pad, 'move');
  bind(canvas, 'look');
  buttons.forEach(button => bind(button, button.dataset.touchAction));
  env.addEventListener('pointerup', event => release(event.pointerId));
  env.addEventListener('pointercancel', event => release(event.pointerId, true));
  env.addEventListener('blur', reset);
  env.document.addEventListener('visibilitychange', () => { if (env.document.hidden) reset(); });
  env.addEventListener('orientationchange', () => {
    reset();
    if (playing) onAction('pause');
  });
  root.hidden = true;
  return Object.assign(state, {
    reset,
    setPlaying(active) {
      active = Boolean(active && state.enabled);
      if (active === playing) return;
      playing = active;
      root.hidden = !active;
      env.document.body.classList.toggle('neon-touch-playing', active);
      if (!active) reset();
    },
    setGrenadePreview(active) {
      root.querySelector('[data-touch-action="grenade-cancel"]').hidden = !active;
    },
  });
}
