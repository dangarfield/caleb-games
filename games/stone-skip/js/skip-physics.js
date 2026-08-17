// Arcade skip simulation. Not a rigid sim, but the cause -> effect chain is
// honest so a 7 year old can learn it:
//   flat entry angle  -> lots of skips        steep entry -> one splash, gone
//   flatter rock      -> forgiving + bouncier jagged rock -> dies fast
//   more power        -> faster and further   more spin   -> straighter
//
// The number of skips is decided at the first water contact (the "budget"),
// then the flight plays it out with a decay that fades the hops away naturally.

import { DEG, clamp } from './util.js';

export const CFG = {
  GRAV: 12.5,
  AIR_DRAG: 0.03,
  SPEED_MIN: 14,
  SPEED_MAX: 30,
  // survivable entry angle (deg)
  THETA_BASE: 20,
  THETA_FLAT: 15,
  THETA_SPIN: 7,
  // skip budget
  BUD_BASE: 1.5,
  BUD_FLAT: 22,
  // How hard a less-than-flat water entry is punished. 1.6 made a release at the
  // edge of the GREAT window worth barely half the budget of a dead-centre one,
  // which is why a decent throw so often stalled at 5 skips. 1.45 keeps the whole
  // gradient (flat rock >> round >> jagged, gold >> poor) but lets a good stone
  // thrown reasonably well clear 7 comfortably.
  BUD_Q_POW: 1.45,
  BUD_MAX: 32,
  TAIL_END: 0.05,          // vertical speed left (fraction) at the last skip
  MAX_LIFT: 0.28,          // a bounce may never leave steeper than this (vy/vh)
  LOSS_BASE: 0.045,
  LOSS_ANGLE: 0.85,
  LOSS_ANGLE_POW: 2.0,
  LOSS_ROUGH: 0.05,
  LOSS_AGE: 0.003,
  VH_STOP: 4.0,
  MIN_DEPTH: 0.32,
  MAX_TIME: 14,
};

export const SWEET = { center: 6, half: 7, high: 36, low: -30 };

// --- the shared piecewise gauge score ---------------------------------------
// Both timed taps (POWER and RELEASE) are scored the same way, and the score is
// deliberately NOT linear across the bar. The gold band is the whole game:
//
//   inside gold   -> GOLD_FLOOR .. 1   (1.00 dead centre, 0.10 at the gold edge)
//   outside gold  -> 0 .. GOLD_FLOOR   (the whole rest of the bar squeezed in)
//
// So there is a cliff at the gold edge: everything in gold scores at least 10%,
// everything outside scores at most 10%. `off` is signed and normalised so 0 is
// dead centre and +-1 are the gold edges; `spanLo`/`spanHi` are how much bar is
// left beyond the gold on each side, in the same units, so the score reaches 0
// exactly at the end of the bar.
export const GOLD_FLOOR = 0.10;
export function bandScore(off, inPow, spanLo = 1, spanHi = 1) {
  const a = Math.abs(off);
  // in gold: the same centre-peaked shape as before, rescaled to 0.10 .. 1
  if (a <= 1) return clamp(GOLD_FLOOR + (1 - GOLD_FLOOR) * (1 - Math.pow(a, inPow)), 0, 1);
  const span = Math.max(0.35, off < 0 ? spanLo : spanHi);
  return clamp(GOLD_FLOOR * (1 - (a - 1) / span), 0, GOLD_FLOOR);
}

// The sweet spot is the CENTRE of the gold band, not the whole band. `off` is
// normalised so 0 = dead centre and 1 = the gold edge:
//   off  0.00  0.26  0.55  0.80  1.00  1.4   2.0
//   q    1.00  0.91  0.67  0.38  0.10  0.09  0.07
// PERFECT/GREAT are the *grading* widths, deliberately wider than the tightest
// part of the curve: a seven year old needs a window they can hit on purpose.
// At 1.9 s per sweep these are ~0.16 s (perfect) and ~0.28 s (great) of finger
// time, while the quality curve above still pays for real precision.
export const RELEASE = {
  IN_POW: 1.7,       // >1 = flat near the centre, steep near the gold edge
  PERFECT: 0.40,     // |off| under this = a dead-centre PERFECT release
  GREAT: 0.72,
};
/** Signed distance from dead centre, in units of the gold half-width. */
export function releaseOffset(pitchDeg) {
  return (pitchDeg - SWEET.center) / SWEET.half;
}
/** How much bar is left past the gold, each way, in gold half-widths. */
const REL_SPAN = {
  hi: Math.abs(releaseOffset(SWEET.high)) - 1,
  lo: Math.abs(releaseOffset(SWEET.low)) - 1,
};
/** How good a release was, from the launch angle it produced (0..1). */
export function releaseQuality(pitchDeg) {
  return bandScore(releaseOffset(pitchDeg), RELEASE.IN_POW, REL_SPAN.lo, REL_SPAN.hi);
}
/** perfect | great | okay | poor — drives grading, points and SFX. */
export function releaseGrade(pitchDeg) {
  const off = Math.abs(releaseOffset(pitchDeg));
  if (off <= RELEASE.PERFECT) return 'perfect';
  if (off <= RELEASE.GREAT) return 'great';
  if (off <= 1) return 'okay';
  return 'poor';
}
/**
 * A sloppy release also fails to transfer the swing energy. The weight is small
 * because `releaseQuality` is now the piecewise gauge score, which already falls
 * off a cliff at the gold edge — 0.34 of the speed on top of that turned a
 * release at the edge of the GREAT window into a 5-skip throw.
 */
export function speedFactorFor(pitchDeg) { return 0.81 + 0.19 * releaseQuality(pitchDeg); }

// --- beat 2: the POWER tap ---------------------------------------------------
// The power bar gets the same white centre-core target as the release gauge, and
// scores through the same piecewise curve (bandScore), so both timed taps read
// the same way: aim for the white middle, gold spans 10%..100%, and everything
// below the gold band is squeezed into 0..10%. The centre sits a touch below full
// power (0.88) so the target is a real point on the bar instead of the far edge,
// where over-winding starts to slip back. Raw power still drives speed on its
// own, so a weak wind-up is slow because it is weak, not because of the score:
//   off  0.00  0.34  0.68  0.86(=full power)  1.00  1.50  3.00
//   q    1.00  0.86  0.53  0.31               0.10  0.09  0.06
export const POWER = {
  center: 0.88,
  half: 0.14,        // gold band = 0.74 .. 1.00
  IN_POW: 1.7,
  PERFECT: 0.34,     // |off| under this = the white core
  GREAT: 0.68,
};
export const POWER_BAND = {
  lo: Math.max(0, POWER.center - POWER.half),
  hi: Math.min(1, POWER.center + POWER.half),
};
/** Signed distance from the power sweet centre, in gold half-widths. */
export function powerOffset(p) { return (p - POWER.center) / POWER.half; }
/** How much bar is left below the gold, in gold half-widths (0.06 = weakest tap). */
const POW_SPAN_LO = Math.abs(powerOffset(0.06)) - 1;
/** 0..1 — how close the power tap was to the white core. */
export function powerQuality(p) {
  return bandScore(powerOffset(p), POWER.IN_POW, POW_SPAN_LO, 1);
}
/** perfect | great | okay | poor, for the little word next to the power bar. */
export function powerGrade(p) {
  const off = Math.abs(powerOffset(p));
  if (off <= POWER.PERFECT) return 'perfect';
  if (off <= POWER.GREAT) return 'great';
  if (off <= 1) return 'okay';
  return 'poor';
}

/**
 * Extra cost for a tap that landed OUTSIDE the gold band, as a function of the
 * gauge score alone. 1 for anything in gold (score >= GOLD_FLOOR), then down to
 * `floor` at the very end of the bar. This is what makes gold reliably feel much
 * better than just-outside without making the in-gold band harsher.
 */
export const MISS_STEP = 0.9;
export function missPenalty(q, floor = 0.7) {
  if (q >= GOLD_FLOOR) return 1;
  // MISS_STEP is a real step right at the gold edge, so landing in the band is a
  // threshold you can feel, not a gradient you can shrug off
  return MISS_STEP * (floor + (1 - floor) * clamp(q / GOLD_FLOOR, 0, 1));
}

export function thetaMaxFor(props, spin) {
  return CFG.THETA_BASE + CFG.THETA_FLAT * props.flatness + CFG.THETA_SPIN * clamp(spin, 0, 1);
}

/**
 * @param o.power     0..1 wind-up power
 * @param o.pitchDeg  launch angle above horizontal (negative = slammed down)
 * @param o.aimRad    horizontal aim offset from the spot's forward direction
 * @param o.spin      0..1
 * @param o.curve     lateral drift m/s^2 (signed) from a sloppy flick
 * @param o.props     rock props { flatness, weight, edge }
 * @param o.special   optional bought-stone definition (budgetMul/speedMul/lowLift)
 * @param o.speedScale arm-strength multiplier on the speed ceiling
 * @param o.powerQ    0..1 how centred the power tap was (defaults from o.power)
 */
export function launchStone(o) {
  const p = o.props;
  const sp = o.special || null;
  const speed = (CFG.SPEED_MIN + (CFG.SPEED_MAX - CFG.SPEED_MIN) * o.power)
    * (1.20 - 0.36 * p.weight)
    * (o.speedScale || 1)
    * (sp ? (sp.speedMul || 1) : 1)
    * (o.speedBonus !== undefined ? o.speedBonus : speedFactorFor(o.pitchDeg));
  const pitch = o.pitchDeg * DEG;
  const ca = Math.cos(o.aimRad), sa = Math.sin(o.aimRad);
  const fx = o.fwdX * ca - o.fwdZ * sa;
  const fz = o.fwdX * sa + o.fwdZ * ca;
  const vh = speed * Math.cos(pitch);
  return {
    x: o.x, y: o.y, z: o.z,
    px: o.x, py: o.y, pz: o.z,
    vx: fx * vh, vy: speed * Math.sin(pitch), vz: fz * vh,
    fwdX: fx, fwdZ: fz, rightX: -fz, rightZ: fx,
    spin: clamp(o.spin, 0, 1), spin0: clamp(o.spin, 0, 1),
    curve: o.curve || 0,
    props: p, power: o.power, launchSpeed: speed,
    launchX: o.x, launchZ: o.z,
    special: sp, specialId: sp ? sp.id : '',
    budgetMul: sp ? (sp.budgetMul || 1) : 1,
    liftMul: sp ? (sp.liftMul || 1) : 1,
    lossMul: sp ? (sp.lossMul || 1) : 1,
    decayMul: sp ? (sp.decayMul || 1) : 1,
    relQ: o.quality !== undefined ? clamp(o.quality, 0, 1) : releaseQuality(o.pitchDeg),
    powQ: o.powerQ !== undefined ? clamp(o.powerQ, 0, 1) : powerQuality(o.power),
    skips: 0, bounceIndex: 0, time: 0,
    budget: 0, decay: 0.6, entryAngle: 0,
    distance: 0, maxDistance: 0, sinkDistance: 0,
    alive: true, sunk: false, landed: false, spinRoll: 0,
    stopRequest: null,          // probes (lily pad, fish) can end the throw
  };
}

// Reasons that count as "it came to rest on something" rather than "it sank".
const LANDED = { land: 1, lily: 1, fish: 1 };

function endStone(s, events, reason) {
  s.alive = false;
  if (LANDED[reason]) s.landed = true; else s.sunk = true;
  s.endReason = reason;
  s.sinkDistance = s.distance;
  const type = reason === 'fish' ? 'gulp' : (LANDED[reason] ? 'land' : 'plunk');
  events.push({ type, x: s.x, y: s.y, z: s.z, reason });
  events.push({ type: 'end', skips: s.skips, distance: s.maxDistance, reason });
}

function bounce(s, events) {
  const p = s.props;
  const vh = Math.hypot(s.vx, s.vz);
  const theta = Math.atan2(-s.vy, Math.max(vh, 0.001)) / DEG;
  const thetaMax = thetaMaxFor(p, s.spin);

  if (s.bounceIndex === 0) {
    s.entryAngle = theta;
    if (theta > thetaMax) { endStone(s, events, 'steep'); return; }
    const q = clamp(1 - theta / thetaMax, 0, 1);
    s.entryQuality = q;
    let b = CFG.BUD_BASE + CFG.BUD_FLAT * p.flatness;
    b *= Math.pow(q, CFG.BUD_Q_POW);
    b *= (0.6 + 0.4 * s.power);
    b *= (0.75 + 0.25 * s.spin);
    // Precision at the release counts twice: it already flattened the entry
    // angle, and a dead-centre release also gets the full budget. `relQ` is the
    // piecewise gauge score (10% at the gold edge, 0..10% outside), so this
    // weight is gentler than it looks: the score itself is the cliff.
    b *= (0.81 + 0.19 * s.relQ);
    // ...and MISSING the gold costs extra. This only ever applies below the gold
    // floor, so it cannot touch a throw released inside the band: it just makes
    // the squeezed 0..10% outside region fall away properly.
    b *= missPenalty(s.relQ) * missPenalty(s.powQ, 0.86);
    // hitting the white core of the POWER bar is worth a small, forgiving bonus
    // (at most ~6% of the budget) — never the difference between a skip and a plunk
    b *= (0.96 + 0.04 * s.powQ);
    b *= s.budgetMul;
    s.budget = clamp(1 + Math.round(b), 1, CFG.BUD_MAX);
    // Bounce restitution is derived from the budget so the hops fade out exactly
    // as the budget runs out. `decayMul` lets a special stone keep more of its
    // bounce than its skip count would imply (Heavy Slate: few, huge hops).
    s.decay = clamp(Math.pow(CFG.TAIL_END, 1 / s.budget) * s.decayMul, 0.05, 0.92);
  } else if (theta > thetaMax * 1.2) {
    endStone(s, events, 'steep');
    return;
  }

  const ratio = clamp(theta / thetaMax, 0, 1);
  let vyOut = -s.vy * s.decay;
  const lift = vh * CFG.MAX_LIFT * s.liftMul;
  if (vyOut > lift) vyOut = lift;
  const loss = (CFG.LOSS_BASE
    + CFG.LOSS_ANGLE * Math.pow(ratio, CFG.LOSS_ANGLE_POW)
    + CFG.LOSS_ROUGH * (1 - p.flatness)
    + CFG.LOSS_AGE * s.bounceIndex) * s.lossMul;
  s.vy = vyOut;
  const keep = Math.max(0.08, 1 - loss);
  s.vx *= keep; s.vz *= keep;
  s.spin *= (0.972 - 0.03 * (1 - p.edge));
  s.curve *= 0.9;
  s.bounceIndex++;
  s.skips++;

  events.push({
    type: 'skip', n: s.skips, x: s.x, y: 0, z: s.z,
    vh: Math.hypot(s.vx, s.vz), theta, distance: s.distance,
    strength: clamp(vyOut / 3.2, 0.12, 1),
  });

  if (s.skips >= s.budget) { endStone(s, events, 'fade'); return; }
  if (Math.hypot(s.vx, s.vz) < CFG.VH_STOP) { endStone(s, events, 'slow'); return; }
}

/** Advances the stone. `env` supplies heightAt() and an optional probe(). */
export function stepStone(s, dt, env, events) {
  if (!s.alive) return events;
  const sub = Math.max(1, Math.min(24, Math.ceil(dt / (1 / 240))));
  const h = dt / sub;
  for (let i = 0; i < sub && s.alive; i++) {
    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.vy -= CFG.GRAV * h;
    const drag = 1 - CFG.AIR_DRAG * h;
    s.vx *= drag; s.vz *= drag;
    const cAcc = s.curve * (1 - 0.75 * s.spin);
    s.vx += s.rightX * cAcc * h;
    s.vz += s.rightZ * cAcc * h;
    s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
    s.time += h;
    // negative: a stone skimmed off the side of the hand spins the other way round
    // (clockwise seen from above), which is what the eye expects from a skip
    s.spinRoll -= (s.spin * 26 + 7) * h;
    s.distance = Math.hypot(s.x - s.launchX, s.z - s.launchZ);
    if (s.distance > s.maxDistance) s.maxDistance = s.distance;

    if (env.probe) env.probe(s, events);
    if (!s.alive) break;
    if (s.stopRequest) { const r = s.stopRequest; s.stopRequest = null; endStone(s, events, r); break; }

    const ground = env.heightAt(s.x, s.z);
    if (ground > 0.02 && s.y <= ground + 0.06) {
      s.y = ground + 0.06;
      endStone(s, events, 'land');
      break;
    }
    if (s.y <= 0 && s.vy < 0) {
      s.y = 0;
      if (-ground < CFG.MIN_DEPTH) { endStone(s, events, 'shallow'); break; }
      bounce(s, events);
    }
    if (s.time > CFG.MAX_TIME) { endStone(s, events, 'timeout'); break; }
  }
  return events;
}

/** Deep-water dry run used for tuning and the tutorial preview. */
export function predictSkips(power, pitchDeg, props, spin, opt) {
  const o = opt || {};
  const s = launchStone({
    x: 0, y: o.y !== undefined ? o.y : 1.7, z: 0, fwdX: 0, fwdZ: 1,
    power, pitchDeg, aimRad: 0, spin, props,
    special: o.special || null, speedScale: o.speedScale || 1,
  });
  const env = { heightAt: () => -6 };
  const events = [];
  let guard = 0;
  while (s.alive && guard++ < 6000) stepStone(s, 1 / 120, env, events);
  return { skips: s.skips, distance: s.maxDistance, budget: s.budget, speed: s.launchSpeed };
}
