// swipe.js — drag a finger left/right on the 3D view to steer (sea and battles).
// Left drag = port (turn left), right drag = starboard. Two fingers (a pinch) cancel it.
export function swipeSteer(el, onChange) {
  const pts = new Map(); let id = null, x0 = 0;
  const DEAD = 12, FULL = 90; // px: ignore tiny wobbles; full rudder at ~90px
  const set = v => onChange(v);
  const down = e => {
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 1) { id = e.pointerId; x0 = e.clientX; } else { id = null; set(0); } // second finger = pinch, not steering
  };
  const move = e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0, a = Math.abs(dx);
    set(a < DEAD ? 0 : -Math.sign(dx) * Math.min(1, (a - DEAD) / (FULL - DEAD)));
  };
  const up = e => { pts.delete(e.pointerId); if (e.pointerId === id) { id = null; set(0); } };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    set(0);
  };
}
