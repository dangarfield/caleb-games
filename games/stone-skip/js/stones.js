// Stone data — pure, no Three.js, so both the rock field and the progression
// system can read it. Shape is honest: what a stone looks like tells you how it
// will skip.

import { clamp } from './util.js';

export const ROCK_KINDS = [
  { id: 'flat', name: 'Flat Skimmer', tag: 'FLAT', flatness: 0.95, weight: 0.40, edge: 0.86, chance: 0.13, color: 0x9aa7ae },
  { id: 'disc', name: 'Round Disc', tag: 'DISC', flatness: 0.86, weight: 0.46, edge: 0.64, chance: 0.15, color: 0x9fa5a0 },
  { id: 'oval', name: 'Smooth Oval', tag: 'OVAL', flatness: 0.74, weight: 0.50, edge: 0.72, chance: 0.20, color: 0xa8a396 },
  { id: 'round', name: 'Round Pebble', tag: 'ROUND', flatness: 0.46, weight: 0.58, edge: 0.50, chance: 0.20, color: 0x9c948c },
  { id: 'chunky', name: 'Chunky Rock', tag: 'CHUNKY', flatness: 0.24, weight: 0.88, edge: 0.34, chance: 0.18, color: 0x8b8b86 },
  { id: 'jagged', name: 'Jagged Shard', tag: 'JAGGED', flatness: 0.13, weight: 0.66, edge: 0.12, chance: 0.14, color: 0x8a7f70 },
];

export function rockStars(props) {
  return clamp(Math.round(1 + props.flatness * 4.2), 1, 5);
}

/**
 * Bought stones. These are *held*, never used up, and each one bends the physics
 * in a different direction so owning them changes how you play, not just how it
 * looks.
 *   budgetMul  multiplies the skip budget decided at first water contact
 *   speedMul   multiplies launch speed (distance goes roughly with speed^2)
 *   decayMul   bounce restitution vs. what the budget implies (>1 = huge hops)
 *   lossMul    per-bounce energy loss (<1 = keeps its speed, skips on and on)
 *   liftMul    cap on how high a hop may leave the water
 *   geo        which scattered-rock geometry set to reuse for the visual
 *
 * Measured ceilings (full power, dead-centre release, max spin, arm 0 -> arm 2;
 * see the sweep in the build notes — jittered rock props add about +1):
 *   normal flat  13 skips / 102 m  ->  14 /149
 *   round pebble  6 /  54          ->   7 / 83   (the "bad rock" mastery target)
 *   rainbow      11 /  87  ->  12 /129      (cosmetic: skips like a good disc)
 *   feather      16 / 113  ->  18 /171      (many gentle low hops)
 *   slate         6 / 149  ->   6 /204      (the distance stone)
 *   rune         15 / 126  ->  16 /182
 *   golden       23 / 175  ->  26 /258      (the skip stone: Skip King lives here)
 */
export const SPECIAL_STONES = [
  {
    id: 'rainbow', unlock: 'stone_rainbow', name: 'Rainbow Pebble', tag: 'RAINBOW', icon: '🌈',
    desc: 'Paints a rainbow trail behind it',
    // `effect` is the one line the shop and the stone bag show: what it DOES.
    // budgetMul/speedMul are both 1, so this one is honestly cosmetic.
    effect: 'Leaves a rainbow trail — skips like a good flat stone',
    geo: 'disc', color: 0xff7ab6,
    props: { flatness: 0.80, weight: 0.46, edge: 0.70 },
    budgetMul: 1.0, speedMul: 1.0, trail: 'rainbow', size: 1.0,
  },
  {
    id: 'feather', unlock: 'stone_feather', name: 'Feather Stone', tag: 'FEATHER', icon: '🪶',
    desc: 'Floaty — lots of long, low, gentle skips',
    effect: 'Floaty: lots of long, low skips (about a third more)',
    geo: 'flat', color: 0xe7f0f7,
    props: { flatness: 0.93, weight: 0.22, edge: 0.80 },
    budgetMul: 1.34, speedMul: 0.9, liftMul: 0.7, lossMul: 0.75, size: 0.94,
  },
  {
    id: 'slate', unlock: 'stone_slate', name: 'Heavy Slate', tag: 'SLATE', icon: '⬛',
    desc: 'Few skips, enormous distance',
    effect: 'Half the skips, but huge hops and way more distance',
    geo: 'flat', color: 0x54606b,
    props: { flatness: 0.72, weight: 0.80, edge: 0.66 },
    budgetMul: 0.5, speedMul: 1.34, decayMul: 1.45, lossMul: 0.45, liftMul: 1.5, size: 1.2,
  },
  {
    id: 'rune', unlock: 'stone_rune', name: 'Ancient Rune Stone', tag: 'RUNE', icon: '🔮',
    desc: 'Glows, and skips like a legend',
    effect: 'Glows purple: more skips AND more distance',
    geo: 'oval', color: 0x7d5fe0,
    props: { flatness: 0.90, weight: 0.44, edge: 0.86 },
    budgetMul: 1.2, speedMul: 1.08, lossMul: 0.85, glow: 0x6c5ce7, trail: 'rune', size: 1.05,
  },
  {
    id: 'golden', unlock: 'stone_golden', name: 'Golden Skipper', tag: 'GOLDEN', icon: '🥇',
    desc: 'The best skimmer in the lake — extra skips',
    effect: 'Lots of extra skips — the best skimmer in the lake',
    geo: 'flat', color: 0xffd32a,
    props: { flatness: 0.99, weight: 0.36, edge: 0.95 },
    // 1.75 puts the ceiling at 26 skips with Arm Strength II, which is what makes
    // the 25-skip "Skip King" achievement the reward for owning both.
    budgetMul: 1.75, speedMul: 1.06, lossMul: 0.65, glow: 0xffd32a, trail: 'sparkle', size: 1.0,
  },
];

export function specialById(id) { return SPECIAL_STONES.find(s => s.id === id) || null; }
