// Waypoints — the two thumbsticks.
//
// Left walks, right looks. They only exist while he is out walking a route, and
// the left one locks out under autopilot — visibly, by going pale, because a
// stick that silently does nothing is a broken game to a child.
//
// Pointer events rather than touch events, so the same code works under a
// thumb, a mouse and a test.

const clamp = (v, r) => (Math.abs(v) > r ? (v / Math.abs(v)) * r : v);

export function makeStick(el, opts = {}) {
  const knob = el.querySelector('.knob');
  const state = { x: 0, y: 0, id: null, locked: false };
  const R = opts.radius || 44;
  // The look stick only turns. Up and down would pitch the camera, and a child
  // who tips it by accident ends up looking at the sky with no idea why.
  const flat = opts.axis === 'x';

  const put = (dx, dy) => {
    if (flat) dy = 0;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.x = dx / R; state.y = dy / R;
  };
  const home = () => { knob.style.transform = ''; state.x = 0; state.y = 0; };

  el.addEventListener('pointerdown', (e) => {
    if (state.locked) return;
    state.id = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const r = el.getBoundingClientRect();
    put(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.id) return;
    const r = el.getBoundingClientRect();
    put(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  });
  const up = (e) => {
    if (e.pointerId !== state.id) return;
    state.id = null; home();
    try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  return {
    get x() { return state.x; },
    get y() { return state.y; },
    get live() { return state.id != null; },
    show(on) { el.classList.toggle('on', !!on); if (!on) { state.id = null; home(); } },
    lock(on) {
      state.locked = !!on;
      el.classList.toggle('locked', !!on);
      if (on) { state.id = null; home(); }
    },
  };
}

/**
 * The keys, for anyone playing at a desk.
 *
 * They fold into the same two vectors the thumbs produce, so nothing downstream
 * has to know which was used. Zoom is not here: I and K work whether or not he
 * is out walking, so they belong with the rest of the view.
 */
function keys(doc) {
  const down = new Set();
  // W and S walk, A and D strafe. J and L turn the camera, with the left and
  // right arrows doing the same for anyone who reaches for them.
  const MOVE = { keyw: [0, -1], keys: [0, 1], keya: [-1, 0], keyd: [1, 0] };
  const LOOK = { keyj: [-1, 0], keyl: [1, 0], arrowleft: [-1, 0], arrowright: [1, 0] };
  const known = (c) => MOVE[c] || LOOK[c];
  doc.addEventListener('keydown', (e) => {
    const c = e.code.toLowerCase();
    if (!known(c)) return;
    down.add(c);
    e.preventDefault();                 // arrows would otherwise scroll the page
  });
  doc.addEventListener('keyup', (e) => down.delete(e.code.toLowerCase()));
  // A key held while the tab loses focus never gets its keyup, and the walker
  // would set off across the park on his own.
  addEventListener('blur', () => down.clear());

  const sum = (map) => {
    let x = 0, y = 0;
    for (const c of down) { const v = map[c]; if (v) { x += v[0]; y += v[1]; } }
    const d = Math.hypot(x, y);
    return d > 1 ? { x: x / d, y: y / d } : { x, y };
  };
  return { move: () => sum(MOVE), look: () => sum(LOOK) };
}

/** Both sticks, the keys, and the buttons above the left stick. */
export function makeControls(doc) {
  const left = makeStick(doc.getElementById('stickL'));
  const right = makeStick(doc.getElementById('stickR'), { axis: 'x' });
  const panel = doc.getElementById('walkBtns');
  const auto = doc.getElementById('btnAuto');
  const fast = doc.getElementById('btnFast');
  const key = keys(doc);
  const s = { auto: false, fast: false, onChange: () => {} };

  const paint = () => {
    auto.textContent = s.auto ? 'Manual walk' : 'Auto pilot';
    auto.classList.toggle('on', s.auto);
    // Fast is autopilot's own control — it hurries along a walk that is already
    // walking itself. On its own, while he is steering, it is just a cheat.
    fast.classList.toggle('shown', s.auto);
    fast.classList.toggle('on', s.fast && s.auto);
    left.lock(s.auto);
    s.onChange();
  };
  auto.onclick = () => { s.auto = !s.auto; if (!s.auto) s.fast = false; paint(); };
  fast.onclick = () => { s.fast = !s.fast; paint(); };

  return {
    left, right,
    // The thumb wins when a thumb is on the glass; otherwise the keys speak.
    get moveX() { return left.live ? left.x : key.move().x; },
    get moveY() { return left.live ? left.y : key.move().y; },
    get lookX() { return right.live ? right.x : key.look().x; },
    get auto() { return s.auto; },
    get fast() { return s.fast && s.auto; },
    set onChange(fn) { s.onChange = fn; },
    show(on) {
      left.show(on); right.show(on);
      panel.classList.toggle('on', !!on);
      if (!on) { s.auto = false; s.fast = false; }
      paint();
    },
    reset() { s.auto = false; s.fast = false; paint(); },
  };
}
