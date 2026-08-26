// Roadways v2.7 — the demand curve, in ONE place.
//
// Everything about "how hungry is an office, and how many houses does it take to
// feed it" lives here, because two modules need the same answer and must never
// disagree: sim.js turns it into a pin interval, spawn.js turns it into a floor
// on the house count.
//
// ---------------------------------------------------------------------------
// THE RULE (author's numbers, do not "improve" them silently)
// ---------------------------------------------------------------------------
// An office is rated in HOUSES TO SUSTAIN IT — how many houses' worth of cars it
// takes to keep its pin queue down. That rating RISES over the first ten days and
// then holds:
//
//   standard office (square)   1.2 houses on day 1  ->  2.0 by the end of day 10
//   skyscraper      (circle)   1.8                 ->  3.0
//   double office, PER HALF    1.0                 ->  1.5   (so 2.0 -> 3.0 a pair)
//
// A double office is deliberately CHEAPER per colour than two separate offices
// (2.0-3.0 for the pair, against 2.4-4.0 for two singles): its shared driveway is
// a reward, not just a bigger building.
//
// Two consequences fall out of one number:
//
//   1. PIN RATE. `intervalScale` is REF / need, where REF is the day-1 rating of
//      that shape. So day 1 behaves EXACTLY as it did before this file existed
//      (scale 1.0) and by day 10 a square's interval is 0.6x — it asks for ~67%
//      more deliveries per second. This is the fix for "the game never gets
//      harder": before, per-office demand was constant forever and all growth was
//      in the COUNT of offices, which stalls when the colours run out.
//   2. HOUSE FLOOR. `colorNeed` sums the ratings of one colour's offices, and the
//      generator guarantees at least that many houses of that colour exist. The
//      player is never asked for throughput the map cannot physically supply.
//
// DOM-free, allocation-free, no imports. Pure functions of (shape, kind, day).

/** Day 1 is Monday of week 1. `week` is 1-based, `dayIndex` is 0..6 (Mon..Sun). */
export function absDay(week, dayIndex) {
  const w = (week | 0) > 1 ? (week | 0) : 1;
  let di = dayIndex | 0;
  if (di < 0) di = 0; else if (di > 6) di = 6;
  return (w - 1) * 7 + di + 1;
}

const RAMP_DAYS = 9;    // day 1 -> day 10 is nine days of growth, then it holds

/** 0 on day 1, 1 from day 10 on. */
export function ramp(day) {
  const p = ((day | 0) - 1) / RAMP_DAYS;
  return p <= 0 ? 0 : (p >= 1 ? 1 : p);
}

// [start, end] houses-to-sustain, per shape, single vs one half of a double
const NEED_SINGLE = { square: [1.2, 2.0], circle: [1.8, 3.0] };
const NEED_HALF = { square: [1.0, 1.5], circle: [1.5, 2.25] };

/**
 * Houses needed to sustain one office (one COLOUR of it — a double office asks
 * this twice, once per half).
 * @param {string} shape 'square' | 'circle'
 * @param {boolean} isHalf true for one half of a double office
 * @param {number} day absolute day, 1-based
 */
export function housesNeeded(shape, isHalf, day) {
  const tab = isHalf ? NEED_HALF : NEED_SINGLE;
  const pair = (shape === 'circle') ? tab.circle : tab.square;
  return pair[0] + (pair[1] - pair[0]) * ramp(day);
}

/**
 * Multiplier on a destination's base pin interval. 1.0 on day 1 for a single
 * office (so nothing about the opening minute changes), falling to 0.6 by day 10.
 * A double office's half starts at 1.2 — a shade slower than a standalone.
 */
export function intervalScale(shape, isHalf, day) {
  const ref = (shape === 'circle') ? NEED_SINGLE.circle[0] : NEED_SINGLE.square[0];
  const need = housesNeeded(shape, isHalf, day);
  return need > 0.01 ? ref / need : 1;
}

/**
 * The house floor for one colour: sum of its offices' ratings, rounded up.
 * @param {Array} dests world.dests (every colour PART, so a double office
 *   contributes its two halves separately — which is exactly what we want)
 * @param {number} color
 * @param {number} day
 * @returns {number} minimum houses of that colour for demand to be servable
 */
export function colorNeed(dests, color, day) {
  if (!dests) return 0;
  let sum = 0;
  for (let i = 0; i < dests.length; i++) {
    const d = dests[i];
    if (!d || (d.color | 0) !== (color | 0)) continue;
    sum += housesNeeded(d.shape === 'circle' ? 'circle' : 'square', !!d.isHalf, day);
  }
  return Math.ceil(sum - 1e-9);
}
