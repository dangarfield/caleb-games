// The beach world: ONE world holding the pebbles AND the finds, plus the containment.
//
// The world is built on whichever backend the quality profile asks for (js/phys.js):
// Rapier rigid bodies on High, the game's own position-based relaxation (js/lphys.js)
// on Low. Both wear the same surface, so everything below — and everything in
// pebbles.js and finds.js — is written once.
//
// CONTAINMENT differs by backend, and it is the one place in the game that cares:
//
//   * lphys has no static bodies at all. The pit floor and the rim are a CLAMP
//     applied once per step to the awake set only (`clampBeachSoft`). That is not a
//     cheat bolted onto a solver — in a position-based scheme a clamp IS the
//     collision response: the velocity is derived from the position delta
//     afterwards, so a stone clamped against the rim comes out of the step with no
//     velocity into the rim, exactly as a wall contact would have left it, for the
//     cost of two compares.
//   * Rapier gets REAL static geometry instead (`buildStatics`): one floor box and
//     four rim boxes. A position clamp fighting a real solver every step is how you
//     stop a pile from ever being allowed to fall asleep, so on that backend the
//     clamp shrinks to `clampBeachHard` — the "flung out of the world" rescue and
//     nothing else.
//
// Pebbles and finds share one world so that glass genuinely rests under stones and
// a rake genuinely shifts it. They are told apart by `tag`, which is what picks the
// containment rule and the rest height.

import { makeWorld, activeEngine, MODE_ROLL, MODE_SPIN } from './phys.js';
import { PIT } from './scene-beach.js';
import { profile } from './quality.js';

export { MODE_ROLL, MODE_SPIN };

/** Which kind of particle a slot holds — drives containment (see clampBeachSoft). */
export const TAG_PEBBLE = 0;
export const TAG_FIND = 1;

/** Pebble ceiling (3 x 168) plus room for a section's glass and shards. */
export const PEBBLE_CAPACITY = 504;
const CAPACITY = PEBBLE_CAPACITY + 24;

export let world = null;

/**
 * The height each particle is held at when it is resting on the sand. A pebble
 * beds into the shingle (a fraction of its ball radius); a flat shard rests on its
 * own half-thickness, which is much less than the ball radius the separation pass
 * uses — that difference is what lets a stone bridge OVER a piece of glass instead
 * of being held a whole radius away from it.
 */
const restY = new Float32Array(CAPACITY);

/** Where a stone that has somehow been flung out of the world is dropped back. */
let ceilingRest = 0.3;
export function setCeilingRest(y) { ceilingRest = y; }

// How often the containment has actually had to move something. Reported by
// __sgClamps: the numbers should stay small during ordinary play.
const clamps = { side: 0, floor: 0, high: 0 };
export function clampCounts() { return { ...clamps }; }
export function resetClampCounts() { clamps.side = clamps.floor = clamps.high = 0; }

/**
 * Per-step damping that means the same thing at any step rate: BASE_DAMPING is
 * the factor at 60Hz, and a 45Hz step gets the factor whose 45th power matches
 * BASE_DAMPING's 60th.
 */
const BASE_DAMPING = 0.9;
function rateDamping(hz) { return Math.pow(BASE_DAMPING, 60 / hz); }

/**
 * Build (or rebuild) the beach world on the profile's backend.
 *
 * The backend asked for is the RESOLVED one (phys.js activeEngine), not the profile's
 * wish — the profile says "rapier" on High, but if the wasm could not be loaded the
 * answer is lphys and every world has to agree on that.
 *
 * Callers must have cleared the pebbles and the finds first: slot indices belong to
 * the world that issued them, so a backend switch means a fresh section.
 *
 * The NEW world is stood up before the old one is released, and the module-level
 * `world` binding (which pebbles.js and finds.js import live) is swapped in between —
 * so there is no instant at which a consumer can see a null world, and no instant at
 * which it can see a released one. On the Rapier backend releasing the world frees
 * wasm memory, so getting that order wrong is a crash rather than a glitch.
 */
export function createWorld() {
  const q = profile();
  const old = world;
  world = makeWorld({
    engine: activeEngine(),
    capacity: CAPACITY,
    gravity: -9.82,
    stepHz: q.stepHz,
    maxSubsteps: q.maxSubsteps,
    passes: q.relaxPasses,
    // Wet shingle: heavily damped, so a raked stone rolls a little and stops
    // instead of skating across the pit. Damping is per STEP, so it is normalised
    // to the rate (see rateDamping) — otherwise the Low profile's longer step
    // would make the beach feel like treacle.
    damping: rateDamping(q.stepHz),
    spinDamping: 0.86,
    rollK: 0.85,
    maxSpeed: 2.8,
    maxAwake: q.maxAwake,
    wakeFrames: q.wakeFrames,
    sleepSpeed: 0.09,
    sleepSpin: 0.7,
    sleepFrames: 5,
    wakePenFrac: 0.22,
    cell: 0.3,
    // Rapier-only, ignored by lphys.
    solverIterations: q.solverIterations,
    lengthUnit: q.lengthUnit,
    friction: q.friction,
    restitution: q.restitution,
  });
  // Real walls on the backend that has them; the clamp shrinks to a rescue there.
  world.clampFn = world.hardWalls ? clampBeachHard : clampBeachSoft;
  buildStatics();
  // Last: the old world is nobody's world any more. dispose() marks it dead, so even a
  // Body handle left over from the previous section can only reach a no-op.
  if (old) old.dispose();
  return world;
}

/**
 * The pit, as static boxes. A no-op on lphys (addStaticBox returns -1 there), so
 * this is called unconditionally and the branch lives in one place.
 *
 * The floor's TOP is exactly y = 0, so a ball of radius `cr` rests at cr — a hair
 * above the `cr * 0.92` the soft clamp holds it at, which is deliberate: it means
 * the soft clamp can never fire on this backend and start arguing with the solver.
 * The rim boxes' inner faces are at +/-PIT.hw and +/-PIT.hd for the same reason
 * (tighter than the clamp's inset), and the VISIBLE stone still overhangs the edge
 * because it is drawn about 1.4x its collision radius.
 */
function buildStatics() {
  if (!world || !world.hardWalls) return;
  const T = 0.5;                       // thickness of floor/walls: deep enough that
  const H = 0.75;                      // nothing can tunnel out in one step
  const hw = PIT.hw, hd = PIT.hd;
  world.clearStatics();
  world.addStaticBox(0, -T, 0, hw + T * 2, T, hd + T * 2);        // floor, top at y=0
  world.addStaticBox(hw + T, H - 0.1, 0, T, H, hd + T * 2);       // +x rim
  world.addStaticBox(-(hw + T), H - 0.1, 0, T, H, hd + T * 2);    // -x rim
  world.addStaticBox(0, H - 0.1, hd + T, hw + T * 2, H, T);       // +z rim
  world.addStaticBox(0, H - 0.1, -(hd + T), hw + T * 2, H, T);    // -z rim
}

/** Which physics backend the beach is running on ('rapier' | 'lphys'). */
export function engine() { return world ? world.engine : null; }

/**
 * Register a particle's resting height. Called once, when it is created.
 */
export function setRestY(i, y) { restY[i] = y; }

/**
 * Containment on the lphys backend, run once per step over the AWAKE SET only.
 *
 * Position-only: the velocity is derived from (p - previous p) at the end of the
 * step, so clamping the position is what cancels the velocity into the wall. The
 * one exception is the "flung out of the world" case, which teleports and
 * therefore has to reset the previous position too (`place`).
 */
function clampBeachSoft(w) {
  const list = w.awakeList, n = w.nAwake;
  const px = w.px, py = w.py, pz = w.pz, r = w.r, tag = w.tag, moved = w.moved;
  for (let k = 0; k < n; k++) {
    const i = list[k];
    // The rim is felt by the BALL, and a little inside it: the visible lump is
    // meant to overhang the edge, which is what makes the pile look packed against
    // it rather than leaving a bare gutter all round.
    const inset = tag[i] === TAG_PEBBLE ? r[i] * 0.35 : 0.05;
    const lx = PIT.hw - inset, lz = PIT.hd - inset;
    let hit = false;
    if (px[i] > lx) { px[i] = lx; hit = true; clamps.side++; }
    else if (px[i] < -lx) { px[i] = -lx; hit = true; clamps.side++; }
    if (pz[i] > lz) { pz[i] = lz; hit = true; clamps.side++; }
    else if (pz[i] < -lz) { pz[i] = -lz; hit = true; clamps.side++; }
    const floor = restY[i];
    if (py[i] < floor) { py[i] = floor; hit = true; clamps.floor++; }
    else if (py[i] > 1.1) {
      // Nothing legitimately gets this high. Drop it back onto the pile.
      w.place(i, px[i], Math.max(0.2, ceilingRest), pz[i]);
      clamps.high++;
      continue;
    }
    if (hit) moved[i] = 1;
  }
}

/**
 * Containment on the Rapier backend: the RESCUE ONLY.
 *
 * The floor and the rim are real static boxes there (buildStatics), and a clamp that
 * also pushed positions every step would keep re-waking the bodies it touched and the
 * pile would never be allowed to sleep. What is still needed is the case no collider
 * can fix: a stone squeezed out of a dense pack and flung somewhere it can never be
 * combed from. Rare, cheap to check, and fatal if left.
 */
function clampBeachHard(w) {
  const list = w.awakeList, n = w.nAwake;
  const px = w.px, py = w.py, pz = w.pz;
  for (let k = 0; k < n; k++) {
    const i = list[k];
    if (py[i] > 1.1 || py[i] < -0.25
      || px[i] > PIT.hw + 0.15 || px[i] < -PIT.hw - 0.15
      || pz[i] > PIT.hd + 0.15 || pz[i] < -PIT.hd - 0.15) {
      const x = Math.max(-PIT.hw + 0.05, Math.min(PIT.hw - 0.05, px[i]));
      const z = Math.max(-PIT.hd + 0.05, Math.min(PIT.hd - 0.05, pz[i]));
      w.place(i, x, Math.max(0.2, ceilingRest), z);
      clamps.high++;
    }
  }
}

/** Fixed-step advance. Does nothing at all while the pile is frozen. */
export function step(dt) {
  if (world) world.step(dt);
}

/**
 * Run the sim forward without rendering, to settle a freshly built pile.
 * `perStep` runs after every step — that is where the finds' own containment
 * happens, because this loop bypasses the frame loop entirely.
 */
export function prewarm(steps, perStep) {
  if (!world) return;
  for (let i = 0; i < steps; i++) {
    world.stepOnce();
    if (perStep) perStep();
  }
  world.resetClock();
}

/**
 * Re-read the quality profile (live quality toggle).
 *
 * This tunes the world it is given; it never changes BACKEND — that needs a fresh
 * world and therefore a fresh section, which main.js drives (createWorld + rebuild).
 * `damping` is set before `setStepHz` because the Rapier backend converts the
 * per-step factor into a continuous rate inside setStepHz.
 */
export function applyPhysicsQuality() {
  if (!world) return;
  const q = profile();
  world.damping = rateDamping(q.stepHz);
  world.setStepHz(q.stepHz);
  world.maxSubsteps = q.maxSubsteps;
  world.passes = q.relaxPasses;
  world.maxAwake = q.maxAwake;
  world.wakeFrames = q.wakeFrames;
  world.resetClock();
}

/**
 * Lower the awake ceiling below the profile's. The frame governor's last resort:
 * the awake set — not the number of stones — is what a struggling device is
 * actually paying for, so this is the lever that buys frames. Reset on the next
 * applyPhysicsQuality (i.e. on a quality toggle).
 */
export function setMaxAwake(n) {
  if (world && n > 4) world.maxAwake = Math.min(world.maxAwake, Math.round(n));
  return world ? world.maxAwake : 0;
}

/** The live world object, for debug probes only (game code imports `world`). */
export function beachWorld() { return world; }

export function stepHz() { return world ? world.stepHz() : 0; }
export function relaxPasses() { return world ? world.passes : 0; }
export function bodyCount() { return world ? world.aliveCount() : 0; }
export function awakeCount() { return world ? world.awakeCount() : 0; }
export function maxAwake() { return world ? world.maxAwake : 0; }

export function removeBody(i) {
  if (world && i >= 0) world.remove(i);
}

/**
 * Debug / regression probe: how much overlap is left in the pile, and how many
 * pairs the separation pass is actually being handed. This is the honest measure
 * of whether the relaxation is keeping up — a pile that is quietly
 * interpenetrating shows here as a big `maxPen`.
 */
export function overlapStats() {
  const w = world;
  if (!w) return null;
  let pairs = 0, overlapping = 0, maxPen = 0;
  for (let i = 0; i < w.count; i++) {
    if (!w.alive[i]) continue;
    for (let j = i + 1; j < w.count; j++) {
      if (!w.alive[j]) continue;
      const dx = w.px[j] - w.px[i], dy = w.py[j] - w.py[i], dz = w.pz[j] - w.pz[i];
      const rs = w.r[i] + w.r[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (rs + 0.05) * (rs + 0.05)) continue;
      pairs++;
      if (d2 < rs * rs) {
        overlapping++;
        const pen = (rs - Math.sqrt(d2)) / rs;
        if (pen > maxPen) maxPen = pen;
      }
    }
  }
  return {
    pairs, overlapping, maxPen: +maxPen.toFixed(4),
    awake: w.awakeCount(), alive: w.aliveCount(),
  };
}
