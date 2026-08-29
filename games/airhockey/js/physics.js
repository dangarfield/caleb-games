/* Air Hockey World Cup — physics.js
 *
 * Pure math, no rendering. The rink is a vertical table (portrait): the human
 * defends the BOTTOM goal, the CPU defends the TOP goal. All positions are in
 * canvas pixels; the caller passes a `rink` describing the play area.
 *
 * rink = { x, y, w, h, goalW, wallPad }
 *
 * Entities are circles: { x, y, vx, vy, r }.
 *
 * Live-tunable values (puck speed/friction/size, mallet size) are read from
 * tuning.js TUNE so the debug match can fine-tune them at runtime.
 */

import { TUNE } from './tuning.js';

// Kept as exports for callers that want the current fractions.
export function puckRFrac() { return TUNE.puckR; }
export function malletRFrac() { return TUNE.malletR; }
// Back-compat constant name used by game.js at match setup.
export const MALLET_R_FRAC = 0.078;

export function makePuck(rink) {
  return { x: rink.x + rink.w / 2, y: rink.y + rink.h / 2, vx: 0, vy: 0, r: rink.w * TUNE.puckR };
}

export function resetPuck(puck, rink, towardBottom) {
  puck.x = rink.x + rink.w / 2;
  puck.y = rink.y + rink.h / 2;
  puck.vx = 0;
  puck.vy = 0;
  puck.r = rink.w * TUNE.puckR;
  const dir = towardBottom ? 1 : -1;
  puck.vy = dir * 90;
}

function clampSpeed(p, max) {
  const s = Math.hypot(p.vx, p.vy);
  if (s > max) { const k = max / s; p.vx *= k; p.vy *= k; }
}

/* Advance the puck one step. dt in seconds. Returns { goal, hitWall }.
 *   goal: 0 = none, 1 = TOP goal (player scores), -1 = BOTTOM goal (cpu scores) */
export function stepPuck(puck, rink, dt, speedMul) {
  const max = TUNE.puckMaxSpeed * (speedMul || 1);
  clampSpeed(puck, max);

  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  const f = Math.pow(TUNE.puckFriction, dt * 1000 / 16.67);
  puck.vx *= f;
  puck.vy *= f;

  let hitWall = false;
  const left = rink.x + puck.r;
  const right = rink.x + rink.w - puck.r;
  const top = rink.y + puck.r;
  const bottom = rink.y + rink.h - puck.r;
  const goalHalf = rink.goalW / 2;
  const cx = rink.x + rink.w / 2;

  if (puck.x < left) { puck.x = left; puck.vx = Math.abs(puck.vx) * 0.88; hitWall = true; }
  else if (puck.x > right) { puck.x = right; puck.vx = -Math.abs(puck.vx) * 0.88; hitWall = true; }

  if (puck.y < top) {
    if (Math.abs(puck.x - cx) < goalHalf) {
      if (puck.y < rink.y - puck.r * 0.5) return { goal: 1, hitWall };
    } else {
      puck.y = top; puck.vy = Math.abs(puck.vy) * 0.88; hitWall = true;
    }
  }
  if (puck.y > bottom) {
    if (Math.abs(puck.x - cx) < goalHalf) {
      if (puck.y > rink.y + rink.h + puck.r * 0.5) return { goal: -1, hitWall };
    } else {
      puck.y = bottom; puck.vy = -Math.abs(puck.vy) * 0.88; hitWall = true;
    }
  }

  return { goal: 0, hitWall };
}

/* Resolve a collision between the puck and a mallet. */
export function malletHit(puck, mallet, restitution) {
  const dx = puck.x - mallet.x;
  const dy = puck.y - mallet.y;
  const dist = Math.hypot(dx, dy);
  const minD = puck.r + mallet.r;
  if (dist >= minD || dist === 0) return false;

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = minD - dist;
  puck.x += nx * overlap;
  puck.y += ny * overlap;

  const rvx = puck.vx - (mallet.vx || 0);
  const rvy = puck.vy - (mallet.vy || 0);
  const velAlong = rvx * nx + rvy * ny;

  const e = restitution == null ? 1.0 : restitution;
  if (velAlong < 0) {
    const j = -(1 + e) * velAlong;
    puck.vx += j * nx;
    puck.vy += j * ny;
  }
  puck.vx += (mallet.vx || 0) * 0.42;
  puck.vy += (mallet.vy || 0) * 0.42;

  const outSpeed = puck.vx * nx + puck.vy * ny;
  const MIN_OUT = 170;
  if (outSpeed < MIN_OUT) {
    puck.vx += nx * (MIN_OUT - outSpeed);
    puck.vy += ny * (MIN_OUT - outSpeed);
  }
  return true;
}

/* Hard safety clamp: force the puck back inside the rink walls after anything
 * (a mallet shove, a special move) may have pushed it out of bounds. Side walls
 * are solid everywhere; the top/bottom are only open across the goal mouth, so a
 * puck can never come to rest outside a corner (the "stuck off the grid" bug).
 * Leaves the goal mouth open so real goals still score. */
export function clampPuckInside(puck, rink) {
  const left = rink.x + puck.r, right = rink.x + rink.w - puck.r;
  const top = rink.y + puck.r, bottom = rink.y + rink.h - puck.r;
  const goalHalf = rink.goalW / 2, cx = rink.x + rink.w / 2;
  if (puck.x < left) { puck.x = left; if (puck.vx < 0) puck.vx = Math.abs(puck.vx) * 0.9; }
  else if (puck.x > right) { puck.x = right; if (puck.vx > 0) puck.vx = -Math.abs(puck.vx) * 0.9; }
  const inMouth = Math.abs(puck.x - cx) < goalHalf;
  if (!inMouth) {
    if (puck.y < top) { puck.y = top; if (puck.vy < 0) puck.vy = Math.abs(puck.vy) * 0.9; }
    else if (puck.y > bottom) { puck.y = bottom; if (puck.vy > 0) puck.vy = -Math.abs(puck.vy) * 0.9; }
  }
}

/* Keep a mallet inside a rectangular half of the rink. half = 'top'|'bottom'|'all' */
export function clampMallet(m, rink, half) {
  const left = rink.x + m.r;
  const right = rink.x + rink.w - m.r;
  let top = rink.y + m.r;
  let bottom = rink.y + rink.h - m.r;
  const mid = rink.y + rink.h / 2;
  if (half === 'top') bottom = mid - m.r;
  else if (half === 'bottom') top = mid + m.r;
  if (m.x < left) m.x = left; else if (m.x > right) m.x = right;
  if (m.y < top) m.y = top; else if (m.y > bottom) m.y = bottom;
}
