/* Air Hockey World Cup — ai.js
 *
 * Drives the CPU mallet (defends the TOP goal, roams the top half).
 *
 * SINGLE-AXIS DIFFICULTY (2026-08-29, v5):
 * The CPU no longer does its own skill math. Every behaviour number — mallet
 * speed, tracking reaction, aim wobble, hesitation — is read straight from
 * tuning.js TUNE, which is derived from one 0..10 difficulty knob. This keeps
 * the debug slider and the real-match difficulty on exactly the same axis.
 */

import { TUNE } from './tuning.js';

export function makeCpu(rink) {
  return {
    x: rink.x + rink.w / 2,
    y: rink.y + rink.h * 0.14,
    px: rink.x + rink.w / 2,
    py: rink.y + rink.h * 0.14,
    vx: 0, vy: 0,
    r: rink.w * TUNE.malletR,
  };
}

export function cpuThink(cpu, puck, rink, dt) {
  const mid = rink.y + rink.h / 2;
  const goalX = rink.x + rink.w / 2;
  const goalY = rink.y + 6;

  const react = TUNE.cpuReact;
  const maxSpeed = TUNE.cpuSpeed;

  let tx, ty;
  const puckInTop = puck.y < mid;
  const puckComing = puck.vy < -15;
  const puckSlow = (Math.abs(puck.vx) + Math.abs(puck.vy)) < 260;
  const puckClose = Math.hypot(puck.x - cpu.x, puck.y - cpu.y) < rink.w * 0.5;

  if (puckInTop && puckSlow && puckClose && puck.y > goalY + rink.h * 0.10) {
    const dirx = goalX - puck.x;
    const diry = mid - puck.y;
    const dl = Math.hypot(dirx, diry) || 1;
    tx = puck.x - (dirx / dl) * cpu.r * 1.05;
    ty = puck.y - (diry / dl) * cpu.r * 1.05;
  } else if (puckInTop || puckComing) {
    const line = rink.y + rink.h * 0.18;
    tx = goalX + (puck.x - goalX) * 0.7;
    ty = line;
  } else {
    tx = goalX + (puck.x - goalX) * 0.25;
    ty = rink.y + rink.h * 0.12;
  }

  tx = Math.max(rink.x + cpu.r, Math.min(rink.x + rink.w - cpu.r, tx));
  ty = Math.max(rink.y + cpu.r, Math.min(mid - cpu.r, ty));

  // aim wobble (fraction of rink width) — bigger when easier
  const jitter = TUNE.cpuJitter * rink.w;
  tx += (Math.random() - 0.5) * jitter;
  ty += (Math.random() - 0.5) * jitter;

  // hesitation: sometimes barely move this frame — more likely when easier
  const hesitate = (Math.random() < TUNE.cpuHesitateProb) ? 0.25 : 1;

  const dx = (tx - cpu.x) * react * hesitate;
  const dy = (ty - cpu.y) * react * hesitate;
  const step = Math.hypot(dx, dy);
  const maxStep = maxSpeed * dt;
  if (step > maxStep && step > 0) {
    const k = maxStep / step;
    cpu.x += dx * k;
    cpu.y += dy * k;
  } else {
    cpu.x += dx;
    cpu.y += dy;
  }
}
