// Pointer handling for the combing view: drag = comb the pebbles aside,
// tap = pick a piece up. One pointer at a time; everything is pointer events so
// mouse, pen and touch all behave the same.

import * as THREE from 'three';
import * as audio from './audio.js';
import { swipeImpulse, pileTopY, meshes as pebbleMeshes } from './pebbles.js';
import { pickAt, swipeFinds } from './finds.js';
import { setZoom, nudgeZoom, zoomFactor } from './scene-beach.js';

const TAP_PX = 16;
const TAP_MS = 420;
const STEP = 0.055;        // world units of travel before another shove lands
const DIG_RADIUS = 0.40;      // roughly a fingertip's worth of shingle
const BASE_STRENGTH = 1.15;

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster();
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

let active = null;
let camera = null;
let onTap = null;
let enabled = false;

// Every pointer currently down, so a second finger can be recognised as a pinch
// rather than as a second comb stroke.
const down2 = new Map();
let pinch = null;      // { d0, z0 }

export function initDig(canvas, cam, tapHandler) {
  camera = cam;
  onTap = tapHandler;

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', move, { passive: false });
  canvas.addEventListener('pointerup', up, { passive: false });
  canvas.addEventListener('pointercancel', cancel, { passive: false });
  canvas.addEventListener('pointerleave', cancel, { passive: false });
  canvas.addEventListener('wheel', (e) => {
    if (!enabled) return;
    e.preventDefault();
    nudgeZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
}

export function setDigEnabled(on) {
  enabled = on;
  if (!on) { active = null; down2.clear(); pinch = null; }
}

function pinchDist() {
  const p = [...down2.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}

function toNdc(e) {
  ndc.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  return ndc;
}

function worldPoint(e, y) {
  ray.setFromCamera(toNdc(e), camera);
  plane.constant = -y;
  return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

function down(e) {
  if (!enabled) return;
  down2.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (down2.size >= 2) {
    // Second finger: abandon the stroke in progress and pinch instead. Combing
    // with one finger while the other is still down would fight the zoom.
    active = null;
    pinch = { d0: Math.max(20, pinchDist()), z0: zoomFactor() };
    e.preventDefault();
    return;
  }
  if (active) return;
  e.preventDefault();
  const y = pileTopY();
  const p = worldPoint(e, y);
  active = {
    id: e.pointerId,
    startX: e.clientX, startY: e.clientY,
    t0: performance.now(),
    moved: 0,
    last: p,
    lastT: performance.now(),
    digY: y,
  };
}

function move(e) {
  if (!enabled) return;
  if (down2.has(e.pointerId)) down2.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    e.preventDefault();
    if (down2.size >= 2) setZoom(pinch.z0 * (pinchDist() / pinch.d0));
    return;
  }
  if (!active || e.pointerId !== active.id) return;
  e.preventDefault();
  active.moved = Math.max(active.moved,
    Math.hypot(e.clientX - active.startX, e.clientY - active.startY));

  const p = worldPoint(e, active.digY);
  if (!p || !active.last) { active.last = p; return; }

  const d = Math.hypot(p.x - active.last.x, p.z - active.last.z);
  if (d < STEP) return;

  const now = performance.now();
  const dt = Math.max(0.008, (now - active.lastT) / 1000);
  const speed = d / dt;                                  // world units / second
  const strength = BASE_STRENGTH * THREE.MathUtils.clamp(speed / 1.6, 0.4, 1.8);

  swipeImpulse(active.last.x, active.last.z, p.x, p.z, DIG_RADIUS, strength);
  swipeFinds(active.last.x, active.last.z, p.x, p.z, DIG_RADIUS, strength);
  audio.rustle(strength / (BASE_STRENGTH * 1.8));

  active.last = p;
  active.lastT = now;
}

function up(e) {
  down2.delete(e.pointerId);
  if (pinch) {
    // Lifting out of a pinch must never register as a tap.
    if (down2.size < 2) pinch = null;
    active = null;
    return;
  }
  if (!enabled || !active || e.pointerId !== active.id) return;
  e.preventDefault();
  const dtms = performance.now() - active.t0;
  const wasTap = active.moved <= TAP_PX && dtms <= TAP_MS;
  active = null;
  if (!wasTap) return;

  const f = pickAt(toNdc(e), camera, pebbleMeshes);
  if (f && onTap) onTap(f);
  else audio.pebbleClink(0.02);
}

function cancel(e) {
  down2.delete(e.pointerId);
  if (down2.size < 2) pinch = null;
  if (active && e.pointerId === active.id) active = null;
}
