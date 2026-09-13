/* waves.js — the stage director: what arrives, when, and what it drops.
 *
 * The stage is a table, not code. Each row is one formation — a type, how many
 * of them, how far apart in seconds, the path they fly and where they enter —
 * and the director turns rows into spawns at the right moment. Retuning stage
 * one means editing the table; it never means editing a loop.
 *
 * Power-ups live here too, because a drop is stage content rather than enemy
 * behaviour: a carrier is simply a row that says what its first enemy is
 * carrying, and main.js calls dropPowerup when that enemy dies.
 *
 * Timeline: ~100 seconds of formations, a short breath, then the boss enters
 * from the right. Nothing is scripted after that — the fight ends when the
 * weak point does.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { contourStack, paperPiece, blobShape, ringShape, dartShape, roundRectShape, mergeShadows } from './paper.js';
import { ramp, GOLD, RIM, RIM_WIDTH } from './palette.js';

/* Rows. `t` is seconds into the stage. `gap` is the delay between members of
   the same formation, `ySpread` steps each member up or down from `y`, and
   `phaseStep` walks the sine phase so a line of drones flies as a ribbon
   rather than as one fat drone. `carries` marks the formation's leader as a
   power-up carrier. Enemy y is in world units: the view is -50..50, and the
   canyon walls eat roughly the outer twelve on each side. */
const STAGE1 = [
  // --- learning the controls: gentle, and the curve is flat here anyway ---
  { t: 2.0,  type: 'drone', count: 4, gap: 0.55, y: 12, move: 'sine', amp: 8, period: 1.9, phaseStep: 0.7, speed: 40 },
  { t: 8.0,  type: 'drone', count: 4, gap: 0.55, y: -12, move: 'sine', amp: 8, period: 1.9, phaseStep: 0.7, speed: 40 },
  { t: 13.5, type: 'drone', count: 6, gap: 0.35, y: 22, ySpread: -7, move: 'zigzag', amp: 7, period: 1.0, speed: 44, carries: 'SPREAD' },

  // --- first things that shoot back ---------------------------------------
  { t: 20.0, type: 'turret', count: 2, gap: 3.0, anchor: 'floor', move: 'static' },
  { t: 22.0, type: 'mine', count: 3, gap: 1.1, y: 16, ySpread: -13, move: 'straight', speed: 22 },
  { t: 27.0, type: 'drone', count: 5, gap: 0.3, y: -20, ySpread: 8, move: 'sine', amp: 10, period: 2.4, phaseStep: 0.9, speed: 44 },
  { t: 31.0, type: 'gunship', count: 1, gap: 0, y: 8, move: 'swoop', speed: 24, carries: 'SHIELD' },

  // --- the first thing that comes AT you rather than past you -------------
  { t: 35.0, type: 'drone', count: 3, gap: 1.0, y: 18, ySpread: -18, move: 'dive', speed: 34, hang: 1.3 },
  { t: 38.0, type: 'worm', count: 1, gap: 0, y: 14, move: 'worm', amp: 11, period: 1.5, speed: 34 },
  { t: 42.0, type: 'drone', count: 4, gap: 0.4, y: -16, move: 'zigzag', amp: 10, period: 0.75, speed: 46 },
  { t: 45.0, type: 'turret', count: 3, gap: 2.4, anchor: 'floor', move: 'static' },
  { t: 47.0, type: 'jelly', count: 2, gap: 1.6, y: 20, ySpread: -14, move: 'drift', amp: 6, period: 1.2, speed: 17 },

  // --- the ramp starts biting ---------------------------------------------
  { t: 52.0, type: 'mine', count: 4, gap: 0.9, y: 24, ySpread: -11, move: 'straight', speed: 24 },
  { t: 55.0, type: 'drone', count: 3, gap: 0.9, y: 0, ySpread: 0, move: 'loop', amp: 11, speed: 46, dir: 1 },
  { t: 58.0, type: 'gunship', count: 2, gap: 2.2, y: -6, ySpread: 16, move: 'strafe', speed: 25 },
  { t: 62.0, type: 'worm', count: 1, gap: 0, y: -14, move: 'worm', amp: 12, period: 1.7, speed: 36, carries: 'SPEED' },
  { t: 65.0, type: 'drone', count: 7, gap: 0.28, y: 0, move: 'sine', amp: 22, period: 2.0, phaseStep: 0.55, speed: 50 },

  // --- the gauntlet --------------------------------------------------------
  { t: 70.0, type: 'turret', count: 3, gap: 2.0, anchor: 'floor', move: 'static' },
  { t: 71.0, type: 'drone', count: 4, gap: 0.7, y: 22, ySpread: -14, move: 'dive', speed: 38, hang: 0.9 },
  { t: 75.0, type: 'jelly', count: 3, gap: 1.4, y: 20, ySpread: -14, move: 'drift', amp: 8, period: 1.4, speed: 19 },
  { t: 78.0, type: 'drone', count: 6, gap: 0.3, y: 24, ySpread: -8, move: 'zigzag', amp: 9, period: 0.7, speed: 50, carries: 'SPREAD' },
  { t: 82.0, type: 'mine', count: 5, gap: 0.7, y: -24, ySpread: 11, move: 'bounce', speed: 26, vy: 30 },
  { t: 85.0, type: 'gunship', count: 2, gap: 1.8, y: 12, ySpread: -22, move: 'swoop', speed: 27 },
  { t: 88.0, type: 'worm', count: 1, gap: 0, y: 0, move: 'worm', amp: 16, period: 1.9, speed: 38 },
  { t: 91.0, type: 'drone', count: 8, gap: 0.22, y: -22, ySpread: 6, move: 'sine', amp: 9, period: 2.6, phaseStep: 0.8, speed: 54, carries: 'SHIELD' },
  { t: 94.0, type: 'drone', count: 3, gap: 0.8, y: 10, ySpread: -20, move: 'dive', speed: 40, hang: 0.7 },
  { t: 96.0, type: 'jelly', count: 2, gap: 1.2, y: 8, ySpread: -18, move: 'drift', amp: 6, period: 1.1, speed: 20 },
];

/* ---------------------------------------------------------------- stage 2 */

/* Coral Cut. The squeeze.
 *
 * The canyon pinches shut roughly every twelve seconds (see the stage's
 * terrain block in config.js) and the turret rows are timed to arrive with the
 * narrows, so the wall guns are in the slot you have to thread. That is the
 * stage where the Force pod stops being a bonus: launch it into the gap ahead,
 * let it take the turret fire and grind the turret down, and fly through
 * behind it.
 *
 * Fewer drones than stage 1, more gunships and mines — heavy, slow things you
 * have to shoot or go around rather than a swarm you sweep up.
 */
const STAGE2 = [
  { t: 2.0,  type: 'gunship', count: 1, gap: 0, y: 10, move: 'straight', speed: 24 },
  { t: 6.0,  type: 'mine', count: 3, gap: 1.0, y: 14, ySpread: -11, move: 'straight', speed: 24 },
  { t: 11.0, type: 'turret', count: 2, gap: 2.6, anchor: 'floor', move: 'static', carries: 'SHIELD' },
  { t: 13.0, type: 'drone', count: 4, gap: 0.36, y: -14, move: 'zigzag', amp: 7, period: 0.85, speed: 46 },

  // first narrows: turrets in the slot, and something coming at you in it
  { t: 18.0, type: 'turret', count: 2, gap: 1.6, anchor: 'floor', move: 'static' },
  { t: 20.0, type: 'drone', count: 3, gap: 0.8, y: 6, ySpread: -8, move: 'dive', speed: 36, hang: 1.0 },
  { t: 23.0, type: 'mine', count: 4, gap: 0.8, y: 6, ySpread: -7, move: 'straight', speed: 26 },
  { t: 26.0, type: 'gunship', count: 2, gap: 2.0, y: 8, ySpread: -16, move: 'strafe', speed: 26, carries: 'SPREAD' },

  { t: 31.0, type: 'jelly', count: 2, gap: 1.5, y: 12, ySpread: -20, move: 'drift', amp: 6, period: 1.2, speed: 18 },
  { t: 34.0, type: 'drone', count: 4, gap: 0.5, y: 4, move: 'loop', amp: 10, speed: 46, dir: -1 },
  { t: 37.0, type: 'turret', count: 3, gap: 1.5, anchor: 'floor', move: 'static' },
  { t: 39.0, type: 'mine', count: 5, gap: 0.7, y: 10, ySpread: -5, move: 'bounce', speed: 26, vy: 28 },

  // second narrows
  { t: 45.0, type: 'gunship', count: 2, gap: 1.6, y: 0, ySpread: 14, move: 'swoop', speed: 25 },
  { t: 48.0, type: 'drone', count: 4, gap: 0.55, y: 12, ySpread: -12, move: 'dive', speed: 38, hang: 0.9 },
  { t: 50.0, type: 'turret', count: 3, gap: 1.4, anchor: 'floor', move: 'static', carries: 'SPEED' },
  { t: 53.0, type: 'drone', count: 5, gap: 0.3, y: 4, ySpread: -4, move: 'zigzag', amp: 9, period: 0.7, speed: 52 },
  { t: 57.0, type: 'worm', count: 1, gap: 0, y: 6, move: 'worm', amp: 8, period: 1.6, speed: 36 },

  { t: 62.0, type: 'mine', count: 6, gap: 0.6, y: 12, ySpread: -5, move: 'straight', speed: 26 },
  { t: 65.0, type: 'gunship', count: 3, gap: 1.5, y: 10, ySpread: -10, move: 'strafe', speed: 27, carries: 'SHIELD' },
  { t: 70.0, type: 'turret', count: 3, gap: 1.3, anchor: 'floor', move: 'static' },
  { t: 72.0, type: 'jelly', count: 2, gap: 1.2, y: -6, ySpread: 16, move: 'drift', amp: 8, period: 1.3, speed: 20 },
  { t: 75.0, type: 'drone', count: 4, gap: 0.6, y: 16, ySpread: -16, move: 'dive', speed: 40, hang: 0.8 },

  // the run home
  { t: 80.0, type: 'mine', count: 6, gap: 0.55, y: -8, ySpread: 4, move: 'bounce', speed: 30, vy: 34 },
  { t: 84.0, type: 'gunship', count: 3, gap: 1.3, y: 6, ySpread: -8, move: 'swoop', speed: 28 },
  { t: 88.0, type: 'turret', count: 4, gap: 1.2, anchor: 'floor', move: 'static', carries: 'SPREAD' },
  { t: 91.0, type: 'drone', count: 6, gap: 0.26, y: 0, move: 'zigzag', amp: 13, period: 0.6, speed: 54 },
  { t: 95.0, type: 'drone', count: 4, gap: 0.5, y: -4, ySpread: 10, move: 'strafe', speed: 44 },
  { t: 99.0, type: 'worm', count: 1, gap: 0, y: -4, move: 'worm', amp: 10, period: 1.8, speed: 38 },
];

/* ---------------------------------------------------------------- stage 3 */

/* Violet Deep. The hard one.
 *
 * Open water — the walls are further out than stage 1's — but the water is
 * full: chain worms and jellyfish are the backbone rather than the garnish,
 * mines drift in fields across the middle instead of in lines, and the
 * formations overlap so fire arrives from two heights at once. Nothing here is
 * new to the player; it is stage 1's vocabulary with the spaces taken out.
 */
const STAGE3 = [
  { t: 1.5,  type: 'worm', count: 1, gap: 0, y: 16, move: 'worm', amp: 12, period: 1.6, speed: 38 },
  { t: 4.0,  type: 'jelly', count: 2, gap: 1.2, y: -12, ySpread: -12, move: 'drift', amp: 8, period: 1.3, speed: 20 },
  { t: 9.0,  type: 'mine', count: 5, gap: 0.5, y: 22, ySpread: -9, move: 'straight', speed: 28 },
  { t: 13.0, type: 'worm', count: 1, gap: 0, y: -16, move: 'worm', amp: 14, period: 1.9, speed: 40, carries: 'SPREAD' },
  { t: 16.0, type: 'drone', count: 6, gap: 0.26, y: 8, ySpread: -3, move: 'zigzag', amp: 11, period: 0.7, speed: 56 },

  { t: 21.0, type: 'drone', count: 4, gap: 0.7, y: 20, ySpread: -16, move: 'dive', speed: 40, hang: 0.9 },
  { t: 23.0, type: 'jelly', count: 3, gap: 1.0, y: 24, ySpread: -16, move: 'drift', amp: 10, period: 1.5, speed: 21 },
  { t: 27.0, type: 'gunship', count: 2, gap: 1.4, y: -18, ySpread: 30, move: 'strafe', speed: 28 },
  { t: 31.0, type: 'mine', count: 7, gap: 0.42, y: -22, ySpread: 7, move: 'bounce', speed: 30, vy: 32, carries: 'SHIELD' },
  { t: 35.0, type: 'worm', count: 2, gap: 2.4, y: 10, ySpread: -22, move: 'worm', amp: 9, period: 1.7, speed: 40 },

  { t: 41.0, type: 'drone', count: 5, gap: 0.5, y: 0, move: 'loop', amp: 12, speed: 50, dir: 1 },
  { t: 43.0, type: 'turret', count: 3, gap: 1.6, anchor: 'floor', move: 'static' },
  { t: 45.0, type: 'jelly', count: 3, gap: 1.1, y: 18, ySpread: -13, move: 'drift', amp: 9, period: 1.2, speed: 22 },
  { t: 49.0, type: 'drone', count: 8, gap: 0.22, y: -6, ySpread: 3, move: 'sine', amp: 20, period: 2.2, phaseStep: 0.5, speed: 58 },
  { t: 54.0, type: 'mine', count: 8, gap: 0.4, y: 20, ySpread: -6, move: 'straight', speed: 30, carries: 'SPEED' },

  { t: 59.0, type: 'drone', count: 5, gap: 0.6, y: 14, ySpread: -14, move: 'dive', speed: 42, hang: 0.7 },
  { t: 61.0, type: 'worm', count: 2, gap: 2.0, y: -8, ySpread: 20, move: 'worm', amp: 13, period: 2.0, speed: 42 },
  { t: 66.0, type: 'gunship', count: 3, gap: 1.2, y: 14, ySpread: -14, move: 'swoop', speed: 29 },
  { t: 70.0, type: 'jelly', count: 3, gap: 0.9, y: -20, ySpread: 18, move: 'drift', amp: 11, period: 1.6, speed: 22 },
  { t: 73.0, type: 'drone', count: 6, gap: 0.4, y: 6, ySpread: -6, move: 'zigzag', amp: 14, period: 0.55, speed: 58 },
  { t: 76.0, type: 'mine', count: 8, gap: 0.38, y: 4, ySpread: -4, move: 'bounce', speed: 32, vy: 36 },

  { t: 81.0, type: 'drone', count: 8, gap: 0.2, y: 22, ySpread: -6, move: 'strafe', speed: 52, carries: 'SPREAD' },
  { t: 85.0, type: 'worm', count: 2, gap: 1.8, y: 0, ySpread: -18, move: 'worm', amp: 15, period: 2.1, speed: 42 },
  { t: 88.0, type: 'drone', count: 5, gap: 0.5, y: -10, ySpread: 16, move: 'loop', amp: 13, speed: 54, dir: -1 },
  { t: 91.0, type: 'gunship', count: 3, gap: 1.1, y: -16, ySpread: 16, move: 'strafe', speed: 30 },
  { t: 95.0, type: 'jelly', count: 3, gap: 0.9, y: 16, ySpread: -15, move: 'drift', amp: 12, period: 1.4, speed: 23, carries: 'SHIELD' },
  { t: 99.0, type: 'mine', count: 8, gap: 0.36, y: -18, ySpread: 5, move: 'straight', speed: 32 },
  { t: 103.0, type: 'drone', count: 6, gap: 0.45, y: 8, ySpread: -16, move: 'dive', speed: 44, hang: 0.6 },
  { t: 106.0, type: 'drone', count: 8, gap: 0.2, y: 0, move: 'zigzag', amp: 16, period: 0.5, speed: 60 },
];

/* ---------------------------------------------------------------- stage 3 */

/* Kelp Forest. Vertical.
 *
 * The stage's obstacle is a stalk spanning the canyon with one gap in it, so
 * the player is threading rather than dodging — and everything that lives here
 * is built to punish being on the wrong line when a gap arrives. Urchins clamp
 * to the rock and spray in every direction (stop hugging the wall), crabs walk
 * the floor and the ceiling firing straight out of it, and the baitballs are
 * there to be cleared with the beam while you are busy with all of it.
 */
const STAGE_KELP = [
  { t: 2.0,  type: 'drone', count: 4, gap: 0.5, y: 10, move: 'sine', amp: 8, period: 2.0, phaseStep: 0.7, speed: 44 },
  { t: 6.0,  type: 'crab', count: 2, gap: 2.2, anchor: 'floor', move: 'walk' },
  { t: 10.0, type: 'baitball', count: 1, gap: 0, y: 14, move: 'flock', speed: 24, carries: 'SPREAD' },
  { t: 14.0, type: 'urchin', count: 2, gap: 2.4, anchor: 'floor', move: 'clamp' },
  { t: 17.0, type: 'drone', count: 5, gap: 0.32, y: -14, move: 'zigzag', amp: 9, period: 0.8, speed: 48 },

  { t: 22.0, type: 'crab', count: 2, gap: 1.8, anchor: 'ceil', move: 'walk' },
  { t: 25.0, type: 'urchin', count: 2, gap: 2.0, anchor: 'ceil', move: 'clamp' },
  { t: 28.0, type: 'jelly', count: 2, gap: 1.4, y: 18, ySpread: -22, move: 'drift', amp: 8, period: 1.3, speed: 20 },
  { t: 32.0, type: 'baitball', count: 2, gap: 2.6, y: -6, ySpread: 18, move: 'flock', speed: 26 },

  { t: 38.0, type: 'crab', count: 3, gap: 1.6, anchor: 'floor', move: 'walk', carries: 'SHIELD' },
  { t: 41.0, type: 'drone', count: 6, gap: 0.3, y: 6, ySpread: -5, move: 'dive', speed: 38, hang: 1.0 },
  { t: 45.0, type: 'urchin', count: 3, gap: 1.8, anchor: 'floor', move: 'clamp' },
  { t: 49.0, type: 'mine', count: 5, gap: 0.7, y: 16, ySpread: -8, move: 'bounce', speed: 26, vy: 28 },

  { t: 55.0, type: 'baitball', count: 2, gap: 2.2, y: 10, ySpread: -20, move: 'flock', speed: 28 },
  { t: 58.0, type: 'crab', count: 3, gap: 1.5, anchor: 'ceil', move: 'walk' },
  { t: 62.0, type: 'gunship', count: 2, gap: 1.8, y: 4, ySpread: -14, move: 'strafe', speed: 26, carries: 'SPEED' },
  { t: 66.0, type: 'drone', count: 6, gap: 0.28, y: 0, move: 'sine', amp: 18, period: 2.2, phaseStep: 0.6, speed: 52 },

  { t: 72.0, type: 'urchin', count: 3, gap: 1.6, anchor: 'floor', move: 'clamp' },
  { t: 74.0, type: 'urchin', count: 2, gap: 1.6, anchor: 'ceil', move: 'clamp' },
  { t: 78.0, type: 'baitball', count: 2, gap: 2.0, y: -4, ySpread: 16, move: 'flock', speed: 28 },
  { t: 82.0, type: 'crab', count: 4, gap: 1.3, anchor: 'floor', move: 'walk' },
  { t: 86.0, type: 'drone', count: 7, gap: 0.24, y: 12, ySpread: -6, move: 'zigzag', amp: 11, period: 0.65, speed: 54, carries: 'SPREAD' },
  { t: 90.0, type: 'jelly', count: 3, gap: 1.1, y: 16, ySpread: -14, move: 'drift', amp: 10, period: 1.4, speed: 22 },
  { t: 95.0, type: 'mine', count: 6, gap: 0.5, y: 8, ySpread: -6, move: 'bounce', speed: 28, vy: 32 },
  { t: 99.0, type: 'baitball', count: 2, gap: 1.8, y: 0, ySpread: 14, move: 'flock', speed: 30 },
];

/* ---------------------------------------------------------------- stage 4 */

/* The Wreck. Angular.
 *
 * Slabs of man-made geometry drift through the water and block lines that
 * would otherwise be free. Rays glide over the top laying mines behind them,
 * so the stage fills up with things the player put off dealing with, and the
 * crabs and turrets bolted to the wreck mean the safe lane keeps moving.
 */
const STAGE_WRECK = [
  { t: 2.0,  type: 'gunship', count: 1, gap: 0, y: 8, move: 'straight', speed: 26 },
  { t: 5.0,  type: 'ray', count: 1, gap: 0, y: 10, move: 'glide', amp: 18, period: 0.5, speed: 28 },
  { t: 10.0, type: 'turret', count: 2, gap: 2.4, anchor: 'floor', move: 'static' },
  { t: 13.0, type: 'drone', count: 5, gap: 0.34, y: -12, move: 'zigzag', amp: 9, period: 0.8, speed: 50, carries: 'SHIELD' },
  { t: 17.0, type: 'crab', count: 2, gap: 2.0, anchor: 'floor', move: 'walk' },

  { t: 21.0, type: 'ray', count: 2, gap: 3.0, y: -8, ySpread: 20, move: 'glide', amp: 16, period: 0.45, speed: 29 },
  { t: 26.0, type: 'gunship', count: 2, gap: 1.8, y: 12, ySpread: -20, move: 'strafe', speed: 27 },
  { t: 30.0, type: 'urchin', count: 2, gap: 2.0, anchor: 'ceil', move: 'clamp' },
  { t: 34.0, type: 'drone', count: 6, gap: 0.3, y: 4, ySpread: -4, move: 'dive', speed: 40, hang: 0.9 },

  { t: 39.0, type: 'ray', count: 2, gap: 2.6, y: 14, ySpread: -24, move: 'glide', amp: 20, period: 0.5, speed: 30, carries: 'SPREAD' },
  { t: 44.0, type: 'crab', count: 3, gap: 1.6, anchor: 'ceil', move: 'walk' },
  { t: 48.0, type: 'turret', count: 3, gap: 1.6, anchor: 'floor', move: 'static' },
  { t: 52.0, type: 'mine', count: 6, gap: 0.55, y: 6, ySpread: -5, move: 'straight', speed: 30 },

  { t: 58.0, type: 'gunship', count: 3, gap: 1.5, y: 10, ySpread: -12, move: 'swoop', speed: 28, carries: 'SPEED' },
  { t: 62.0, type: 'ray', count: 2, gap: 2.2, y: -6, ySpread: 18, move: 'glide', amp: 17, period: 0.55, speed: 30 },
  { t: 67.0, type: 'urchin', count: 3, gap: 1.7, anchor: 'floor', move: 'clamp' },
  { t: 71.0, type: 'drone', count: 7, gap: 0.26, y: 0, move: 'sine', amp: 20, period: 2.1, phaseStep: 0.55, speed: 56 },

  { t: 77.0, type: 'crab', count: 4, gap: 1.4, anchor: 'floor', move: 'walk' },
  { t: 81.0, type: 'ray', count: 3, gap: 2.0, y: 12, ySpread: -16, move: 'glide', amp: 18, period: 0.5, speed: 31 },
  { t: 86.0, type: 'gunship', count: 3, gap: 1.3, y: -10, ySpread: 16, move: 'strafe', speed: 29, carries: 'SHIELD' },
  { t: 91.0, type: 'drone', count: 6, gap: 0.3, y: 14, ySpread: -14, move: 'dive', speed: 42, hang: 0.7 },
  { t: 95.0, type: 'turret', count: 4, gap: 1.2, anchor: 'floor', move: 'static' },
  { t: 100.0, type: 'mine', count: 7, gap: 0.42, y: 4, ySpread: -4, move: 'bounce', speed: 32, vy: 34 },
];

/* ---------------------------------------------------------------- stage 5 */

/* Midnight Drift. Dark.
 *
 * The palette gives almost nothing away here, so the stage is built round the
 * angler: it sits out in the black with its lure lit, looking like scenery,
 * and charges the moment the player comes inside its range. Pufferfish make
 * the gaps between things unsafe to squeeze through, and the eels are the
 * first thing in the game that is genuinely faster than the ship.
 */
const STAGE_MIDNIGHT = [
  { t: 2.0,  type: 'jelly', count: 2, gap: 1.6, y: 14, ySpread: -24, move: 'drift', amp: 9, period: 1.2, speed: 20 },
  { t: 7.0,  type: 'angler', count: 1, gap: 0, y: 8, move: 'lurk', speed: 22 },
  { t: 11.0, type: 'puffer', count: 3, gap: 1.2, y: 16, ySpread: -14, move: 'puff', speed: 18, carries: 'SHIELD' },
  { t: 16.0, type: 'angler', count: 2, gap: 2.6, y: -10, ySpread: 22, move: 'lurk', speed: 22 },

  { t: 21.0, type: 'drone', count: 5, gap: 0.32, y: 0, move: 'zigzag', amp: 12, period: 0.75, speed: 52 },
  { t: 25.0, type: 'eel', count: 1, gap: 0, anchor: 'floor', move: 'snake', amp: 6, period: 2.2, speed: 44 },
  { t: 30.0, type: 'puffer', count: 4, gap: 1.0, y: -8, ySpread: 10, move: 'puff', speed: 18 },
  { t: 34.0, type: 'angler', count: 2, gap: 2.2, y: 14, ySpread: -26, move: 'lurk', speed: 24, carries: 'SPREAD' },

  { t: 40.0, type: 'jelly', count: 3, gap: 1.2, y: 20, ySpread: -16, move: 'drift', amp: 11, period: 1.5, speed: 22 },
  { t: 44.0, type: 'eel', count: 1, gap: 0, anchor: 'ceil', move: 'snake', amp: 6, period: 2.0, speed: 46 },
  { t: 49.0, type: 'baitball', count: 2, gap: 2.4, y: 6, ySpread: -18, move: 'flock', speed: 28 },
  { t: 54.0, type: 'puffer', count: 5, gap: 0.9, y: 12, ySpread: -7, move: 'puff', speed: 20 },

  { t: 60.0, type: 'angler', count: 3, gap: 2.0, y: -12, ySpread: 16, move: 'lurk', speed: 24 },
  { t: 65.0, type: 'eel', count: 2, gap: 3.0, anchor: 'floor', move: 'snake', amp: 7, period: 2.3, speed: 46, carries: 'SPEED' },
  { t: 71.0, type: 'drone', count: 7, gap: 0.26, y: 8, ySpread: -5, move: 'dive', speed: 42, hang: 0.8 },
  { t: 76.0, type: 'jelly', count: 3, gap: 1.1, y: -18, ySpread: 18, move: 'drift', amp: 12, period: 1.6, speed: 23 },

  { t: 82.0, type: 'puffer', count: 6, gap: 0.8, y: 4, ySpread: -5, move: 'puff', speed: 20 },
  { t: 87.0, type: 'angler', count: 3, gap: 1.8, y: 16, ySpread: -18, move: 'lurk', speed: 26, carries: 'SHIELD' },
  { t: 92.0, type: 'eel', count: 2, gap: 2.6, anchor: 'ceil', move: 'snake', amp: 8, period: 2.1, speed: 48 },
  { t: 98.0, type: 'baitball', count: 2, gap: 1.8, y: 0, ySpread: 16, move: 'flock', speed: 30 },
  { t: 103.0, type: 'drone', count: 8, gap: 0.22, y: -6, move: 'zigzag', amp: 15, period: 0.55, speed: 58 },
];

/* ---------------------------------------------------------------- stage 7 */

/* The Trench. The bottom.
 *
 * The walls are close overhead for the whole stage, so there is no open water
 * to retreat into and every pattern has to be answered where it is met. The
 * roster is everything the game has, at the speeds the curve has been climbing
 * toward, with eels on both surfaces and urchins filling what is left.
 */
const STAGE_TRENCH = [
  { t: 1.5,  type: 'urchin', count: 2, gap: 2.0, anchor: 'floor', move: 'clamp' },
  { t: 4.0,  type: 'drone', count: 5, gap: 0.3, y: 0, move: 'zigzag', amp: 8, period: 0.7, speed: 56 },
  { t: 8.0,  type: 'crab', count: 2, gap: 1.8, anchor: 'ceil', move: 'walk' },
  { t: 12.0, type: 'eel', count: 1, gap: 0, anchor: 'floor', move: 'snake', amp: 5, period: 2.2, speed: 48, carries: 'SPREAD' },
  { t: 16.0, type: 'puffer', count: 4, gap: 0.9, y: 4, ySpread: -6, move: 'puff', speed: 20 },

  { t: 21.0, type: 'urchin', count: 3, gap: 1.6, anchor: 'ceil', move: 'clamp' },
  { t: 25.0, type: 'angler', count: 2, gap: 2.2, y: -4, ySpread: 12, move: 'lurk', speed: 26 },
  { t: 30.0, type: 'gunship', count: 2, gap: 1.6, y: 6, ySpread: -12, move: 'strafe', speed: 30 },
  { t: 34.0, type: 'eel', count: 2, gap: 2.8, anchor: 'ceil', move: 'snake', amp: 6, period: 2.0, speed: 50 },

  { t: 40.0, type: 'crab', count: 4, gap: 1.4, anchor: 'floor', move: 'walk', carries: 'SHIELD' },
  { t: 44.0, type: 'drone', count: 7, gap: 0.24, y: 2, ySpread: -3, move: 'dive', speed: 44, hang: 0.7 },
  { t: 49.0, type: 'baitball', count: 2, gap: 2.0, y: 0, ySpread: 10, move: 'flock', speed: 30 },
  { t: 54.0, type: 'urchin', count: 3, gap: 1.4, anchor: 'floor', move: 'clamp' },
  { t: 57.0, type: 'puffer', count: 6, gap: 0.7, y: -2, ySpread: 5, move: 'puff', speed: 22 },

  { t: 63.0, type: 'ray', count: 2, gap: 2.2, y: 6, ySpread: -12, move: 'glide', amp: 10, period: 0.6, speed: 32 },
  { t: 68.0, type: 'eel', count: 2, gap: 2.4, anchor: 'floor', move: 'snake', amp: 7, period: 2.2, speed: 52, carries: 'SPEED' },
  { t: 73.0, type: 'angler', count: 3, gap: 1.8, y: 8, ySpread: -10, move: 'lurk', speed: 28 },
  { t: 78.0, type: 'crab', count: 4, gap: 1.2, anchor: 'ceil', move: 'walk' },
  { t: 83.0, type: 'drone', count: 8, gap: 0.2, y: -4, move: 'zigzag', amp: 12, period: 0.5, speed: 60 },

  { t: 88.0, type: 'urchin', count: 4, gap: 1.2, anchor: 'floor', move: 'clamp' },
  { t: 91.0, type: 'eel', count: 2, gap: 2.0, anchor: 'ceil', move: 'snake', amp: 8, period: 2.0, speed: 54 },
  { t: 96.0, type: 'gunship', count: 3, gap: 1.2, y: -6, ySpread: 10, move: 'strafe', speed: 32, carries: 'SPREAD' },
  { t: 101.0, type: 'puffer', count: 7, gap: 0.6, y: 2, ySpread: -4, move: 'puff', speed: 22 },
  { t: 106.0, type: 'baitball', count: 3, gap: 1.6, y: 0, ySpread: 8, move: 'flock', speed: 32 },
  { t: 111.0, type: 'drone', count: 8, gap: 0.2, y: 4, ySpread: -4, move: 'dive', speed: 46, hang: 0.55 },
  { t: 115.0, type: 'eel', count: 2, gap: 1.8, anchor: 'floor', move: 'snake', amp: 9, period: 1.9, speed: 56 },
];

export const STAGE_TABLES = [
  STAGE1, STAGE2, STAGE_KELP, STAGE_WRECK, STAGE_MIDNIGHT, STAGE3, STAGE_TRENCH,
];

/* The pickup's art, out here so the start-overlay guide can show the player
   the same disc they will be flying into rather than a description of it. */
export function makePickupArt(kind, rampName = 'STAGE1') {
  const g = new THREE.Group();
  const r = CFG.powerups.radius;
  g.add(contourStack(blobShape({ radius: r, points: 11, wobble: 0.1, seed: 41 }), {
    layers: 3, insetStep: r * 0.22, rampName,
    t0: kind === 'SHIELD' ? 0.86 : kind === 'SPEED' ? 0.12 : 0.46,
    t1: kind === 'SHIELD' ? 0.62 : kind === 'SPEED' ? 0.40 : 0.20,
    dz: 0.08, rim: RIM_WIDTH,
  }));
  const icon = new THREE.Group();
  if (kind === 'SPEED') {
    icon.add(paperPiece(dartShape({ len: r * 1.1, span: r * 0.9, tail: r * 0.3, sweep: 0.8 }), GOLD, { z: 0.6, shadow: false }));
  } else if (kind === 'SPREAD') {
    for (const a of [-0.5, 0, 0.5]) {
      const p = paperPiece(roundRectShape(r * 0.9, r * 0.20, r * 0.1), GOLD, { z: 0.6, shadow: false });
      p.rotation.z = a;
      icon.add(p);
    }
  } else {
    icon.add(paperPiece(ringShape(blobShape({ radius: r * 0.62, points: 14, wobble: 0.04, seed: 7 }), r * 0.16), GOLD, { z: 0.6, shadow: false }));
  }
  g.add(icon);
  g.userData.icon = icon;
  return g;
}

export function createWaves(scene, { rampName = 'STAGE1', enemies } = {}) {
  const group = new THREE.Group();
  group.position.z = 1.0;
  if (scene) scene.add(group);

  /* -------------------------------------------------------- power-up art */

  /* Three pickups, three silhouettes, so which one is falling toward you is a
     shape question rather than a colour question. All three carry the gold
     ring the arcade uses for "this is good". */
  function makePickup(kind) {
    const g = makePickupArt(kind, rampName);
    // The icon is cut without a shadow and the disc turns as one piece, so the
    // whole pickup is a rigid assembly.
    mergeShadows(g);
    return g;
  }

  const pickups = [];
  CFG.powerups.order.forEach((kind) => {
    for (let i = 0; i < 2; i++) {
      pickups.push({ kind, art: makePickup(kind), alive: false, x: 0, y: 0, t: 0, baseY: 0 });
    }
  });

  function dropPowerup(x, y, kind) {
    const want = kind || CFG.powerups.order[(Math.random() * CFG.powerups.order.length) | 0];
    let slot = pickups.find((p) => !p.alive && p.kind === want);
    if (!slot) slot = pickups.find((p) => !p.alive);
    if (!slot) return null;
    slot.alive = true;
    slot.x = x; slot.y = y; slot.baseY = y; slot.t = 0;
    slot.art.position.set(x, y, 0);
    slot.art.scale.setScalar(1);
    group.add(slot.art);
    return slot;
  }

  function takePowerup(p) {
    p.alive = false;
    if (p.art.parent) p.art.parent.remove(p.art);
  }

  /* --------------------------------------------------------- the director */

  const state = {
    group, pickups, dropPowerup, takePowerup,
    elapsed: 0, phase: 'waves', progress: 0, bossSpawned: false,
    stageIndex: 0, stageName: CFG.stages[0].name,
    intensity: 1, fireScale: 1,
    start, update, clear, dispose, intensityNow, axis, callBoss,
  };

  /* `seconds` used to be a COPY taken in start(), which nothing read: writing
     it looked like it should shorten the stage and silently did nothing. It is
     now a window onto the live value — reading it tells the truth, and writing
     it writes through to the stage that is actually running. */
  Object.defineProperty(state, 'seconds', {
    get() { return stageCfg.seconds; },
    set(v) { stageCfg.seconds = v; },
    enumerable: true,
  });

  let lastDiff = null;

  /* HOW HARD IS IT RIGHT NOW.
   *
   * Flat for the first `warmUp` of the stage, smoothstep up to `peak` by
   * `full`, then held. Multiplied by the stage's own number, and then the
   * whole excess is scaled by the difficulty — which is how Easy gets a
   * shallower ramp rather than a different game. */
  function intensityNow() {
    const C = CFG.curve;
    const u = Math.min(1, state.elapsed / stageCfg.seconds);
    let shape;
    if (u <= C.warmUp) shape = 0;
    else if (u >= C.full) shape = 1;
    else {
      const t = (u - C.warmUp) / (C.full - C.warmUp);
      shape = t * t * (3 - 2 * t);
    }
    const raw = (1 + (C.peak - 1) * shape) * (C.stage[state.stageIndex] || 1);
    const k = lastDiff ? lastDiff.curveScale : 1;
    return 1 + (raw - 1) * k;
  }

  /* The curve, weighted for one axis. Speed and density take it whole; the
     enemy fire rate takes three quarters of it, because guns that speed up as
     fast as everything else reads as unfair rather than as busy. */
  function axis(w) { return 1 + (state.intensity - 1) * w; }

  let cursor = 0;
  let table = STAGE1;
  let stageCfg = CFG.stages[0];
  const streams = [];           // formations part-way through spawning

  function start(stageIndex) {
    const i = Math.max(0, Math.min(CFG.stages.length - 1, stageIndex || 0));
    stageCfg = CFG.stages[i];
    table = STAGE_TABLES[i] || STAGE1;
    state.stageIndex = i;
    state.stageName = stageCfg.name;
    cursor = 0;
    streams.length = 0;
    state.elapsed = 0;
    state.phase = 'waves';
    state.progress = 0;
    state.bossSpawned = false;
    state.lateBoss = false;
    state.intensity = 1;
    state.fireScale = 1;
    for (const p of pickups) takePowerup(p);
  }

  function update(dt, ctx) {
    const { layout, diff } = ctx;
    lastDiff = diff;
    state.elapsed += dt;
    state.progress = Math.min(1, state.elapsed / stageCfg.seconds);
    state.intensity = intensityNow();
    state.fireScale = axis(CFG.curve.fire);

    if (state.phase === 'waves') {
      while (cursor < table.length && table[cursor].t <= state.elapsed) {
        const row = table[cursor];
        // a formation's size is set when it starts, from the curve
        const n = Math.max(1, Math.round(row.count * axis(CFG.curve.count)));
        streams.push({ row, left: n, next: 0, index: 0 });
        cursor++;
      }
      for (let i = streams.length - 1; i >= 0; i--) {
        const s = streams[i];
        s.next -= dt;
        if (s.next > 0) continue;
        spawnOne(s, layout, diff);
        s.left--;
        s.index++;
        // density: the gaps close as the stage climbs
        s.next = (s.row.gap || 0.4) / axis(CFG.curve.density);
        if (s.left <= 0) streams.splice(i, 1);
      }
      /* Two ways into the boss. The tidy one is every formation dispatched and
         drained. The other is the clock: if a stream ever fails to drain — a
         spawn that found its pool full and silently dropped, a type that leaves
         the field some way this code has not thought of — the tidy condition
         never comes true and the stage runs forever with no way out and no way
         to lose. A stage that can silently never end is worse than one that
         ends untidily, so past the deadline the remaining formations are
         binned and the boss comes anyway. */
      const done = cursor >= table.length && streams.length === 0;
      const overdue = state.elapsed >= stageCfg.seconds + CFG.stage.bossDeadline;
      if (state.elapsed >= stageCfg.seconds && (done || overdue)) {
        state.lateBoss = overdue && !done;
        callBoss(layout, diff);
      }
    }

    // pickups drift left a little slower than the stage and bob as they go
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.alive) continue;
      p.t += dt;
      p.x -= CFG.powerups.driftSpeed * dt;
      p.y = p.baseY + Math.sin(p.t * CFG.powerups.bobRate) * CFG.powerups.bob;
      p.art.position.set(p.x, p.y, 0);
      p.art.rotation.z = Math.sin(p.t * 1.3) * 0.25;
      if (p.art.userData.icon) p.art.userData.icon.rotation.z -= dt * 1.1;
      if (p.t > CFG.powerups.life || p.x < layout.despawnX) takePowerup(p);
    }
  }

  /* Bin whatever is left of the wave script and bring the boss on.
   *
   * Two callers: the stage clock, and `Deepfold.goBoss()` from the console —
   * which is how you look at a boss's fire patterns without flying two minutes
   * to reach it. `elapsed` is pushed to the end of the stage so the intensity
   * curve is where it would have been, and the fight is seen at the difficulty
   * it was tuned for rather than at the stage's opening pace. */
  function callBoss(layout, diff) {
    cursor = table.length;
    streams.length = 0;
    state.elapsed = Math.max(state.elapsed, stageCfg.seconds);
    state.progress = 1;
    state.intensity = intensityNow();
    state.phase = 'boss';
    enemies.spawn('boss', {
      x: layout.spawnX + 24,
      hp: stageCfg.boss.hp,
      hpScale: diff ? diff.bossHp : 1,
      variant: stageCfg.boss.weak || stageCfg.boss.variant || 'eye',
      label: stageCfg.boss.label,
      phases: stageCfg.boss.phases,
    });
    state.bossSpawned = true;
  }

  function spawnOne(s, layout, diff) {
    const row = s.row;
    const i = s.index;
    /* Final speed = the row's relative number, times the global base rise,
       times the difficulty's hold-back, times where we are on the curve. All
       four are in config.js; none of them is in this table. */
    const baseSpeed = row.speed === undefined ? CFG.enemies[row.type].speed : row.speed;
    const opts = {
      x: layout.spawnX,
      y: (row.y || 0) + (row.ySpread || 0) * i,
      move: row.move || 'straight',
      speed: baseSpeed * CFG.pace.speedScale
        * (diff ? diff.speedScale : 1)
        * Math.min(CFG.curve.speedMax, axis(CFG.curve.speed)),
      amp: row.amp || 0,
      period: row.period || 1.5,
      phase: (row.phase || 0) + (row.phaseStep || 0) * i,
      hpScale: diff ? diff.enemyHp : 1,
      anchor: row.anchor || null,
      carries: i === 0 ? (row.carries || null) : null,
      fireDelay: 0.8 + i * 0.2,
      hang: row.hang,
      rushAt: row.rushAt,
      loopX: row.loopX,
      vy: row.vy === undefined ? undefined : row.vy * (i % 2 ? -1 : 1),
      dir: row.dir === undefined ? (i % 2 ? -1 : 1) : row.dir,
    };
    if (row.move === 'static' || row.move === 'clamp' || row.move === 'walk' || row.move === 'snake') {
      // anything that lives on the rock enters at the rock, not in mid-air
      opts.y = row.anchor === 'ceil' ? 40 : -40;
      opts.anchor = row.anchor || 'floor';
    }
    enemies.spawn(row.type, opts);
  }

  function clear() {
    for (const p of pickups) takePowerup(p);
    streams.length = 0;
  }

  function dispose() {
    clear();
    if (group.parent) group.parent.remove(group);
  }

  return state;
}
