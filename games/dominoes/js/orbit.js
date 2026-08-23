// The orbit camera, plus the one piece of maths every tool needs: screen -> table.
//
// Written by hand rather than with three/addons/OrbitControls because the gesture
// arbitration (tools.js) has to own the pointer stream: OrbitControls installs its own
// listeners and would happily orbit on the same one-finger drag that is drawing a run.
// This module never touches the DOM at all — tools.js calls orbitBy/zoomBy/panBy.
//
// Spherical about a target on the table: azimuth `th`, polar `ph` measured from +Y.
// `ph` is clamped away from 0 so the up-vector never degenerates, and away from
// horizontal so you cannot get under the table.

import * as THREE from 'three';
import { camera } from './env.js';

export const cam = {
  target: new THREE.Vector3(0, 0, 0),
  radius: 1.4,
  th: Math.PI * 0.25,
  ph: 0.85,
  minR: 0.16,
  maxR: 6,
  dirty: true,
};

const PH_MIN = 0.07;     // near top-down (the accurate drawing angle)
const PH_MAX = 1.40;     // ~10 degrees above the table

let bound = { w: 1.3, d: 0.95 };

/**
 * How much of the canvas the HUD and the dock sit on top of, in CSS pixels.
 *
 * The canvas is the whole viewport and the chrome floats over it, so "the table fits the
 * screen" and "the table fits the part of the screen you can touch" are two different
 * statements — and fit() used to make the first one. That difference had teeth: with the
 * Tricks tray open the dock reaches 44% of the way up a 900x700 window, so the front strip
 * of the table was under the pills and a tap there picked a trick icon instead of placing
 * anything. The rotation dial made the strip ~48 px taller, which is how a harness that had
 * been dropping a bell at z = +0.20 for weeks suddenly stopped.
 *
 * Set from ui.js, which is the only module that knows how tall the chrome actually is. The
 * value deliberately EXCLUDES the Tricks tray: the tray opens and closes constantly, and a
 * table that resized every time would be worse than one that is slightly small. The tray now
 * closes as soon as you pick a trick, so it is never up while you are aiming.
 */
const inset = { top: 0, bottom: 0 };

export function setInsets(top, bottom) {
  inset.top = top || 0;
  inset.bottom = bottom || 0;
}

export function setBounds(t) {
  bound = { w: t.w, d: t.d };
  const big = Math.max(t.w, t.d);
  cam.minR = big * 0.16;
  // Generous, so fit() is never clamped short of framing the table on a narrow portrait
  // viewport (that clamp was half of why Fit used to leave the table clipped).
  cam.maxR = big * 4.5;
  cam.radius = Math.min(cam.maxR, Math.max(cam.minR, cam.radius));
  clampTarget();
  cam.dirty = true;
}

function clampTarget() {
  // The target may leave the table a little (so you can look at a corner) but never
  // far enough to lose it.
  const mx = bound.w * 0.55, mz = bound.d * 0.55;
  cam.target.x = Math.max(-mx, Math.min(mx, cam.target.x));
  cam.target.z = Math.max(-mz, Math.min(mz, cam.target.z));
  cam.target.y = 0;
}

export function orbitBy(dx, dy) {
  cam.th -= dx * 0.006;
  cam.ph = Math.max(PH_MIN, Math.min(PH_MAX, cam.ph - dy * 0.005));
  cam.dirty = true;
}

export function zoomBy(f) {
  cam.radius = Math.max(cam.minR, Math.min(cam.maxR, cam.radius * f));
  cam.dirty = true;
}

const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** Pan in screen space, scaled so a finger keeps the same bit of table under it. */
export function panBy(dx, dy) {
  const s = cam.radius * 0.0016;
  _right.set(Math.cos(cam.th), 0, -Math.sin(cam.th));
  _fwd.set(Math.sin(cam.th), 0, Math.cos(cam.th));
  cam.target.addScaledVector(_right, -dx * s);
  cam.target.addScaledVector(_fwd, -dy * s);
  clampTarget();
  cam.dirty = true;
}

export function setPreset(name) {
  if (name === 'top') { cam.ph = PH_MIN + 0.02; }
  else if (name === 'low') { cam.ph = 1.22; }
  else { cam.ph = 0.82; }
  cam.dirty = true;
}

/**
 * Frame the whole table, for real.
 *
 * The old version was `max(w, d * 1.35) * 1.15` with no aspect and no field-of-view
 * term, so on a 500 x 753 portrait tablet - the primary device - pressing Fit left the
 * table clipped on three sides, which is a bad thing for a button whose entire promise is
 * "show me my build".
 *
 * Project the four table corners onto the two screen axes and solve for the radius that
 * puts both inside the frustum. Screen right is (cos th, 0, -sin th), purely horizontal;
 * screen up is (-cos ph sin th, sin ph, -cos ph cos th), so a horizontal table extent is
 * foreshortened by cos(ph) on the vertical axis. Both maxima are closed form for an
 * axis-aligned rectangle, so this stays a handful of multiplies.
 *
 * The vertical solve is against the UNCOVERED band of the screen (see `inset`), and then the
 * target slides along screen-up so the table is centred in that band rather than in the
 * frame. In landscape the width usually decides the radius anyway, so reserving the chrome
 * costs nothing there and the shift alone lifts the table off the dock; in portrait, where
 * the height does decide it, the table comes out smaller — which is the correct trade, since
 * the alternative is a table whose front edge cannot be touched.
 */
export function fit() {
  cam.target.set(0, 0, 0);
  const cp = Math.cos(cam.ph);
  const sth = Math.sin(cam.th), cth = Math.cos(cam.th);
  const st = Math.abs(sth), ct = Math.abs(cth);
  const hw = bound.w / 2, hd = bound.d / 2;
  const eh = hw * ct + hd * st;              // half-extent across the screen
  const ev = cp * (hw * st + hd * ct);       // half-extent up the screen
  const tanV = Math.tan(camera.fov * Math.PI / 360);
  const tanH = tanV * (camera.aspect || 1);
  const H = window.innerHeight || 1;
  // Never give the table less than a third of the frame: a freak viewport where the chrome
  // is most of the screen should leave a small table, not a dot.
  const vis = Math.max(H / 3, H - inset.top - inset.bottom) / H;
  const r = Math.max(ev / (tanV * vis), eh / tanH) * 1.18;
  cam.radius = Math.min(cam.maxR, Math.max(cam.minR, r));
  // Pixels the image has to travel up the screen to sit in the middle of the visible band,
  // converted through the frustum half-height at the target's distance.
  const dy = (inset.bottom - inset.top) / 2;
  if (dy) {
    const w = (2 * dy / H) * cam.radius * tanV;
    // The target has to stay ON the table plane (clampTarget and panBy both assume y = 0), so
    // this is not `-up * w` but the in-plane vector whose screen-up component IS w. Screen-up
    // is (-cp sth, sp, -cp cth); projecting it onto the plane costs a factor of cos(ph), hence
    // the /cp — a shallow camera has to slide a long way to move the picture a little.
    // clampTarget then keeps a grazing angle from sliding right off the table.
    const k = w / Math.max(0.12, cp);
    cam.target.set(sth * k, 0, cth * k);
    clampTarget();
  }
  cam.dirty = true;
}

/** Recompute camera position. Returns true when it actually moved. */
export function updateCamera() {
  if (!cam.dirty) return false;
  cam.dirty = false;
  const sp = Math.sin(cam.ph), cp = Math.cos(cam.ph);
  camera.position.set(
    cam.target.x + cam.radius * sp * Math.sin(cam.th),
    cam.target.y + cam.radius * cp,
    cam.target.z + cam.radius * sp * Math.cos(cam.th));
  camera.lookAt(cam.target);
  return true;
}

// --- screen -> world ray ---------------------------------------------------
// Preallocated: this runs on every pointermove.
const _ndc = new THREE.Vector3();
export const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };

/** Build `ray` from a client-space point. */
export function makeRay(clientX, clientY) {
  _ndc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
    0.5);
  _ndc.unproject(camera);
  ray.ox = camera.position.x; ray.oy = camera.position.y; ray.oz = camera.position.z;
  let x = _ndc.x - ray.ox, y = _ndc.y - ray.oy, z = _ndc.z - ray.oz;
  const l = Math.hypot(x, y, z) || 1;
  ray.dx = x / l; ray.dy = y / l; ray.dz = z / l;
}

/**
 * Where the current ray crosses the horizontal plane y = h. Returns false when the
 * ray points away from it (looking at the sky) so callers can ignore the stroke.
 * Writes into `out` — no allocation.
 */
export function rayPlane(h, out) {
  if (Math.abs(ray.dy) < 1e-6) return false;
  const t = (h - ray.oy) / ray.dy;
  if (t <= 0) return false;
  out.x = ray.ox + ray.dx * t;
  out.y = h;
  out.z = ray.oz + ray.dz * t;
  out.t = t;
  return true;
}
