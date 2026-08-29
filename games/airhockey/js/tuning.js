/* Air Hockey World Cup — tuning.js
 *
 * SINGLE-AXIS DIFFICULTY (2026-08-29 rework):
 * One knob, `TUNE.difficulty` (0..10), scales EVERY difficulty attribute at
 * once by interpolating between an EASY preset (difficulty 0 — the gentlest
 * feel) and a HARD preset (difficulty 10). physics.js and ai.js read the
 * derived TUNE.* fields every frame; call applyDifficulty() after changing
 * TUNE.difficulty to recompute them.
 *
 * The debug match exposes this as a single Easy->Hard slider. Once the user
 * finds the right number from play, we bake it into the real match mapping.
 */

export const DIFF_MIN = 0;
export const DIFF_MAX = 10;
export const DIFF_STEP = 0.5;

/* Endpoints. difficulty 0 = EASY, difficulty 10 = HARD. Everything else is a
 * linear blend. (Bigger mallet/puck = easier, so those shrink as it gets hard.) */
export const EASY = {
  cpuSpeed: 190,          // px/sec the CPU mallet can move
  cpuReact: 0.038,        // tracking lerp toward its target
  cpuJitter: 0.11,        // aim wobble as a fraction of rink width
  cpuHesitateProb: 0.28,  // chance per frame it half-freezes
  puckMaxSpeed: 1300,     // px/sec puck cap
  malletR: 0.086,         // mallet radius (fraction of rink width)
  puckR: 0.044,           // puck radius (fraction of rink width)
};
export const HARD = {
  cpuSpeed: 950,
  cpuReact: 0.34,
  cpuJitter: 0.008,
  cpuHesitateProb: 0.0,
  puckMaxSpeed: 1750,
  malletR: 0.056,
  puckR: 0.032,
};

function lerp(a, b, t) { return a + (b - a) * t; }

/* Live values read by physics.js / ai.js. Filled by applyDifficulty(). */
export const TUNE = {
  difficulty: 0,          // 0..10
  puckFriction: 0.9968,   // constant (glide), not part of the difficulty axis
  // derived (set below):
  cpuSpeed: EASY.cpuSpeed,
  cpuReact: EASY.cpuReact,
  cpuJitter: EASY.cpuJitter,
  cpuHesitateProb: EASY.cpuHesitateProb,
  puckMaxSpeed: EASY.puckMaxSpeed,
  malletR: EASY.malletR,
  puckR: EASY.puckR,
};

/* Recompute every derived field from TUNE.difficulty. */
export function applyDifficulty() {
  const d = Math.max(DIFF_MIN, Math.min(DIFF_MAX, TUNE.difficulty));
  const t = d / DIFF_MAX;
  TUNE.difficulty = d;
  TUNE.cpuSpeed = lerp(EASY.cpuSpeed, HARD.cpuSpeed, t);
  TUNE.cpuReact = lerp(EASY.cpuReact, HARD.cpuReact, t);
  TUNE.cpuJitter = lerp(EASY.cpuJitter, HARD.cpuJitter, t);
  TUNE.cpuHesitateProb = lerp(EASY.cpuHesitateProb, HARD.cpuHesitateProb, t);
  TUNE.puckMaxSpeed = lerp(EASY.puckMaxSpeed, HARD.puckMaxSpeed, t);
  TUNE.malletR = lerp(EASY.malletR, HARD.malletR, t);
  TUNE.puckR = lerp(EASY.puckR, HARD.puckR, t);
}

/* Set the difficulty and recompute in one call. */
export function setDifficulty(d) {
  TUNE.difficulty = Math.max(DIFF_MIN, Math.min(DIFF_MAX, d));
  applyDifficulty();
}

/* Snapshot of the derived numbers for the debug readout. */
export function currentDerived() {
  return {
    difficulty: TUNE.difficulty,
    cpuSpeed: Math.round(TUNE.cpuSpeed),
    cpuReact: +TUNE.cpuReact.toFixed(3),
    puckMaxSpeed: Math.round(TUNE.puckMaxSpeed),
  };
}

// initialise derived fields at load
applyDifficulty();
