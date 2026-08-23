// Confetti. One Points cloud, CPU-animated, hidden (and therefore free) until fired.
//
// The whole effect is a fixed pool of q.confetti particles — 90 on High, 30 on Low —
// with preallocated velocity arrays. A second burst restarts the same pool rather than
// adding to it: a kid with six cannons should get six bangs, not a slideshow.

import { confetti, CONFETTI_N } from './env.js';
import { COLOURS } from './consts.js';

const pos = confetti.geometry.attributes.position.array;
const col = confetti.geometry.attributes.color.array;
const vx = new Float32Array(CONFETTI_N);
const vy = new Float32Array(CONFETTI_N);
const vz = new Float32Array(CONFETTI_N);

let live = 0;
let age = 0;
const LIFE = 2.6;

export function burstConfetti(x, y, z) {
  live = CONFETTI_N;
  age = 0;
  for (let i = 0; i < CONFETTI_N; i++) {
    pos[i * 3] = x + (Math.random() - 0.5) * 0.01;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.01;
    // A cone going up and slightly forward, with enough spread to look like a pop.
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.55;
    vx[i] = Math.cos(a) * r;
    vz[i] = Math.sin(a) * r;
    vy[i] = 0.9 + Math.random() * 0.9;
    const c = COLOURS[(Math.random() * COLOURS.length) | 0].hex;
    col[i * 3] = ((c >> 16) & 255) / 255;
    col[i * 3 + 1] = ((c >> 8) & 255) / 255;
    col[i * 3 + 2] = (c & 255) / 255;
  }
  confetti.geometry.attributes.color.needsUpdate = true;
  confetti.visible = true;
}

/** @returns true if anything is still in the air (i.e. the frame needs a redraw). */
export function stepConfetti(dt) {
  if (!live) return false;
  age += dt;
  if (age > LIFE) { live = 0; confetti.visible = false; return false; }
  const d = Math.pow(0.12, dt);        // air drag, frame-rate independent
  for (let i = 0; i < live; i++) {
    vy[i] -= 2.4 * dt;                 // deliberately light gravity: paper, not gravel
    vx[i] *= d; vz[i] *= d;
    let y = pos[i * 3 + 1] + vy[i] * dt;
    if (y < 0.002) { y = 0.002; vy[i] = 0; vx[i] *= 0.4; vz[i] *= 0.4; }
    pos[i * 3] += vx[i] * dt;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] += vz[i] * dt;
  }
  confetti.geometry.attributes.position.needsUpdate = true;
  confetti.material.opacity = age > LIFE - 0.6 ? Math.max(0, (LIFE - age) / 0.6) : 0.95;
  return true;
}

export function clearFx() {
  live = 0;
  confetti.visible = false;
  confetti.material.opacity = 0.95;
}
export function fxActive() { return live > 0; }
