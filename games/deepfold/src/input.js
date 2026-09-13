/* input.js — one small state object, fed by a finger or by a keyboard.
 *
 * The game above this never asks which one is being used. It reads:
 *
 *   in.hasPointer / in.px, in.py   where the finger is, in WORLD units
 *   in.kx, in.ky                   keyboard axis, -1..1
 *   in.charging, in.charge         Wave Cannon state, 0..1
 *   in.consumeBeam()               returns the charge to fire, or 0
 *
 * The Wave Cannon used to charge by holding the finger STILL, and that was
 * wrong: not moving is something a player does constantly — lining up a shot,
 * waiting for a gap — so the cannon kept winding up when nobody asked it to,
 * and flying cancelled a charge nobody meant to start. It has its own button
 * now, held with the other thumb, and the ship keeps flying throughout. That
 * also suits a tablet, which is what this is played on.
 *
 * Pointers that begin on a control are ignored here entirely, twice over: the
 * pad captures its own pointers (controls.js), and `onDown` refuses anything
 * whose target is inside it. A thumb that lands on a button can never drag the
 * ship, and a thumb that is flying the ship can never be stolen by a button.
 */
import { CFG } from './config.js';

export function createInput(canvas, view, hooks = {}) {
  const inp = {
    hasPointer: false,
    px: 0, py: 0,            // finger, world units
    tx: 0, ty: 0,            // where the ship is being asked to go
    kx: 0, ky: 0,            // keyboard axis
    charging: false,
    charge: 0,               // 0..1
    enabled: false,
    usingKeys: false,
    consumeBeam, update, reset, setEnabled, dispose, holdBeam,
  };

  let pointerId = -1;
  let holding = false;             // the beam button, or SPACE
  let pending = 0;                 // a fired charge waiting to be collected
  const keys = Object.create(null);

  /* ------------------------------------------------------------- geometry */

  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const u = (clientX - r.left) / Math.max(1, r.width);
    const v = (clientY - r.top) / Math.max(1, r.height);
    inp.px = (u * 2 - 1) * view.width * 0.5;
    inp.py = -(v * 2 - 1) * view.height * 0.5;
  }

  /* -------------------------------------------------------------- pointer */

  function onDown(e) {
    if (!inp.enabled) return;
    if (pointerId !== -1) return;            // a second finger is not a second ship
    // belt and braces: the pad captures its own pointers, and nothing that
    // starts on a control is ever a ship drag
    if (e.target && e.target.closest && e.target.closest('.dfc-pad')) return;
    pointerId = e.pointerId;
    inp.hasPointer = true;
    inp.usingKeys = false;
    toWorld(e.clientX, e.clientY);
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    e.preventDefault();
  }

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    toWorld(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    inp.hasPointer = false;
    // lifting the flying thumb does NOT fire the cannon any more: the beam
    // button owns that, and it is usually the other thumb.
    e.preventDefault();
  }

  /* ------------------------------------------------------------- keyboard */

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'p') { hooks.onPause && hooks.onPause(); e.preventDefault(); return; }
    if (k === 'm') { hooks.onMute && hooks.onMute(); e.preventDefault(); return; }
    if (k === 'shift' && !e.repeat) { hooks.onPod && hooks.onPod(); e.preventDefault(); return; }
    if (k === 'enter' && !e.repeat) { hooks.onConfirm && hooks.onConfirm(); return; }
    if (k === ' ' || k === 'spacebar') {
      if (!e.repeat) inp.holdBeam(true);
      e.preventDefault();
      return;
    }
    if (AXIS[k]) { keys[k] = 1; inp.usingKeys = true; e.preventDefault(); }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'spacebar') { inp.holdBeam(false); return; }
    if (AXIS[k]) keys[k] = 0;
  }

  const AXIS = {
    arrowleft: [-1, 0], a: [-1, 0],
    arrowright: [1, 0], d: [1, 0],
    arrowup: [0, 1], w: [0, 1],
    arrowdown: [0, -1], s: [0, -1],
  };

  /* --------------------------------------------------------------- charge */

  function releaseCharge() {
    if (inp.charging && inp.charge > 0) pending = Math.max(pending, inp.charge);
    inp.charging = false;
    inp.charge = 0;
  }

  /* Returns 0..1 once, the frame after a release. The ship polls this; nothing
     else may, or two systems would race for the same shot. */
  function consumeBeam() {
    const v = pending;
    pending = 0;
    return v >= CFG.charge.minFire ? v : 0;
  }

  /* Held by the beam button or by SPACE. Releasing arms the shot, which the
     ship collects on its next frame through consumeBeam. */
  function holdBeam(on) {
    if (on === holding) return;
    holding = on;
    if (!on) releaseCharge();
  }

  /* ---------------------------------------------------------------- frame */

  function update(dt) {
    // keyboard axis, normalised so diagonals are not faster
    let kx = 0, ky = 0;
    for (const k in keys) {
      if (!keys[k]) continue;
      const a = AXIS[k];
      kx += a[0]; ky += a[1];
    }
    const m = Math.hypot(kx, ky);
    inp.kx = m > 1 ? kx / m : kx;
    inp.ky = m > 1 ? ky / m : ky;

    if (!inp.enabled) { inp.charging = false; inp.charge = 0; holding = false; return inp; }

    if (holding) {
      inp.charging = true;
      inp.charge = Math.min(1, inp.charge + dt / CFG.charge.full);
    }
    return inp;
  }

  function reset() {
    pointerId = -1;
    inp.hasPointer = false;
    inp.charging = false;
    inp.charge = 0;
    pending = 0;
    holding = false;
    for (const k in keys) keys[k] = 0;
  }

  function setEnabled(on) {
    inp.enabled = !!on;
    if (!on) reset();
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp, { passive: false });
  canvas.addEventListener('pointercancel', onUp, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A tab switched away mid-drag leaves a finger that will never lift.
  window.addEventListener('blur', reset);

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', reset);
  }

  return inp;
}
