// Quality profiles: Low and High.
//
// The reported stutter on a low-spec tablet is NOT mainly a shading problem —
// it is CPU/physics. The two moments that hitch are (a) entering a beach, where
// the section build runs a couple of hundred physics steps over the whole pile,
// and (b) swiping, which used to wake most of the pile at once. So the Low profile
// cuts BOTH sides: it drops PBR/env shading, pixel ratio and shadows on the GPU,
// and it thins the loose pebble layer, lowers the step rate, runs one relaxation
// pass instead of two, spreads the section build across frames, and caps both the
// radius and the number of stones one swipe can wake.
//
// Since the physics is the game's own position-based relaxation (js/lphys.js), the
// knobs on the CPU side are: how many loose pebbles are real, how big the awake set
// may get, how long a woken stone runs before it re-freezes, the step rate and the
// number of relaxation passes. Nothing simulates at rest on either profile.
//
// Choosing the default: ANY touch device (tablet or phone) defaults to Low —
// this game is played on a tablet, and even a fast tablet is a thermally-limited
// chassis pushing a dpr-2 panel. Only a mouse-driven desktop defaults to High.
// Precedence is always ?q= URL override > saved choice > auto-detect, so a player
// who forces High on their tablet keeps it.
//
// The level is a DEVICE setting, not a per-player one: it lives at
// calebArcadeData.seaGlass.quality (via storage.js, so it shares the one cached
// root object and cannot be clobbered by a later savePlayer).

import { readSetting, writeSetting } from './storage.js';

const KEY = 'quality';

export const PROFILES = {
  high: {
    id: 'high',
    name: 'High',
    // --- GPU ---
    pixelRatioCap: 1.65,
    shadows: true,
    pebbleShading: 'pbr',        // MeshStandardMaterial + scene.environment
    shadeLift: 1.0,              // instance-colour brightness compensation
    // --- physics BACKEND ---
    // High runs real rigid bodies: Rapier (Rust/wasm) via js/rphys.js. Contacts,
    // friction and rolling are solved properly, which is what makes a raked pile
    // behave like stones rather than like separating spheres. It is also much the
    // more expensive of the two, which is why it is on this profile only — and why
    // the awake set is still capped (see maxAwake): a parked stone becomes a FIXED
    // Rapier body, so it is not integrated or solved at all.
    engine: 'rapier',
    solverIterations: 4,         // Rapier only: World.numSolverIterations
    // Rapier's contact tolerances are absolute, and a pebble here is ~0.05 units
    // across. This tells it what a "metre" is so a 5cm stone is not entirely
    // inside the solver's own slop.
    lengthUnit: 0.1,
    friction: 0.9,               // wet shingle
    restitution: 0.02,           // stones do not bounce
    // --- pebble physics ---
    // 252 real, movable stones. That count is affordable on BOTH profiles only
    // because of the awake set: a frozen stone is not integrated, not hashed and
    // not uploaded, so the total affects section-build time and GPU fill and
    // nothing else. The steady-state cost is set by `maxAwake`, not by this.
    pebblePerMesh: 167,          // x3 instanced meshes = 501 loose stones
    stepHz: 60,                  // fixed step rate
    maxSubsteps: 2,              // catch-up cap per frame
    relaxPasses: 2,              // sphere-separation passes per step
    maxAwake: 96,                // hard ceiling on the awake set
    wakeFrames: 80,              // frames a woken stone runs before re-freezing
    wakeRadiusScale: 1.0,        // multiplier on the comb's reach
    swipeWakeCap: 44,
    // --- section build ---
    chunkedBuild: false,         // one synchronous block, as before
    buildChunk: 0,
    prewarmMain: 130,
    prewarmDepth: 45,
    buryFirst: 10,
    buryPass: 16,
    buryPasses: 2,
    coverRingBoost: 0,
    // --- collection ---
    collectionMaxPieces: 240,
    collectionPerJarCap: 24,
    collectionSettleSteps: 140,
    collectionStepHz: 60,
    collectionRelaxPasses: 2,
  },
  low: {
    id: 'low',
    name: 'Low',
    pixelRatioCap: 1.15,
    shadows: false,
    pebbleShading: 'lambert',    // no env map, no PBR maths
    // --- physics BACKEND ---
    // Low runs the game's own position-based relaxation (js/lphys.js): no wasm to
    // download, no contact manifolds, no islands, and an awake set that a settled
    // beach empties completely. Same ~500 stones as High; a tenth of the machinery.
    engine: 'lphys',
    // Lambert loses the env map's diffuse irradiance, which IS proportional to the
    // stone's own colour, so the compensation is a multiplier — but 1.24 was fitted by
    // eye and left the Low pile far darker than the beach it sits in: measured against
    // its own painted bed, the pit came out at 0.95 / 1.25 / 0.93 / 1.06 of the bed's
    // brightness on pebbleCove / copperShore / shellBay / stormPoint while High sat at
    // ~1.0 everywhere, i.e. the fixed surround and the movable pile read as two
    // different materials on Low only.
    //
    // 1.62, with the flat sky fill in pebbles.js (LAMBERT_FILL) carrying the part of
    // the loss that is NOT proportional to albedo, brings the four beaches to
    // 0.94 / 1.02 / 0.93 / 1.16 — the same band High's PBR pile sits in
    // (1.05 / 1.12 / 1.00 / 1.07), and the two profiles now agree on how dark a dark
    // beach is (stormPoint's pile measures 60 on both). Fitted with
    // research/match.mjs; don't chase tighter, because every section is randomly
    // regenerated and that alone moves these numbers by about 8%.
    shadeLift: 1.62,
    // The SAME 252 stones as High. Density is not a quality knob any more: with the
    // pile frozen at rest the count costs nothing per frame, so Low pays for it only
    // in section-build time (which is frame-sliced, see chunkedBuild) and fill rate.
    // Low still cuts every lever that IS per-frame: shading, pixel ratio, shadows,
    // step rate, relaxation passes and — the important one — the size of the awake set.
    pebblePerMesh: 167,          // x3 = 501 loose stones
    // A longer step with ONE relaxation pass. In a position-based scheme that is a
    // safe trade in a way it never was for a solver: nothing is integrated between
    // steps except the awake set, a missed overlap is simply corrected on the next
    // pass, and the containment clamp cannot be tunnelled through because it is
    // applied to positions rather than to contacts. The per-step damping is
    // rate-normalised in physics.js, so the pile behaves the same at either rate.
    stepHz: 45,
    maxSubsteps: 1,
    relaxPasses: 1,
    // The awake set is the whole cost model, so this is the single most important
    // Low number: at most 40 of the 84 stones can be simulating at once.
    maxAwake: 40,
    wakeFrames: 60,
    wakeRadiusScale: 0.85,
    swipeWakeCap: 22,
    // The build is pumped from the frame loop in ~6ms slices instead of blocking
    // for a few hundred milliseconds ("raking the beach…").
    chunkedBuild: true,
    buildChunk: 8,               // physics steps per yield
    prewarmMain: 72,
    prewarmDepth: 28,
    buryFirst: 8,
    buryPass: 12,
    // Both profiles run the same 252-stone pile now, so Low no longer needs the
    // extra covering pass and the wider ring of cover stones it had when it was the
    // thin one: the density does that work, and over-covering risks a piece that
    // cannot be raked back out.
    buryPasses: 2,
    coverRingBoost: 0,
    collectionMaxPieces: 110,
    collectionPerJarCap: 12,
    collectionSettleSteps: 80,
    collectionStepHz: 45,
    collectionRelaxPasses: 1,
  },
};

/**
 * How likely is this device to be weak? Deliberately pessimistic: mis-guessing a
 * mid device as Low costs a little sheen, mis-guessing a weak one as High costs
 * the game. 2+ points = Low.
 */
export function weaknessScore() {
  const hc = navigator.hardwareConcurrency;
  const mem = navigator.deviceMemory;
  const dpr = window.devicePixelRatio || 1;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  let score = 0;

  if (typeof hc !== 'number' || !hc) score += 1;      // unknown → assume modest
  else if (hc <= 2) score += 3;
  else if (hc <= 4) score += 2;
  else if (hc <= 6) score += 1;

  // Safari does not expose deviceMemory; absent is not evidence of weakness, so
  // it scores nothing rather than being counted twice against Chrome tablets.
  if (typeof mem === 'number' && mem > 0) {
    if (mem <= 2) score += 3;
    else if (mem <= 4) score += 2;
    else if (mem <= 6) score += 1;
  }

  // A small panel at dpr 2+ is a lot of fill for very little chassis.
  if (dpr >= 2 && minSide <= 820) score += 1;

  return score;
}

/**
 * Is this a tablet / phone / any touch device? Three independent signals, any of
 * which is enough — a coarse pointer, real touch points, or a mobile-ish UA.
 * A desktop with a mouse trips none of them.
 *
 * (A touchscreen laptop lands on Low. That is the intended trade: Low is a small
 * visual step down and the toggle is one tap away, while a stuttering tablet is
 * the actual reported bug.)
 */
export function isTouchDevice() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) { /* very old browsers */ }
  if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) return true;
  if (navigator.msMaxTouchPoints > 0) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook|BB10/i.test(navigator.userAgent || '')) return true;
  // iPadOS 13+ reports a desktop Safari UA; touch points above catch it, this is belt-and-braces.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

/**
 * The DEFAULT level when the player has never chosen one.
 *
 * Every touch device defaults to Low — the game is aimed at tablets, and even a
 * nominally strong tablet is a thermally-limited chassis pushing a dpr-2 panel.
 * Only a genuine mouse-and-keyboard desktop defaults to High, and even then a
 * weak one is still caught by the hardware score.
 */
export function autoLevel() {
  if (isTouchDevice()) return 'low';
  return weaknessScore() >= 2 ? 'low' : 'high';
}

function stored() {
  const v = readSetting(KEY, null);
  return v === 'low' || v === 'high' ? v : null;
}

/** ?q=low / ?quality=high forces a level for a session (used by the tests). */
function forced() {
  const m = /[?&]q(?:uality)?=(low|high)/i.exec(location.search);
  return m ? m[1].toLowerCase() : null;
}

// Resolved at module evaluation, BEFORE env.js builds the renderer — every other
// module can then just read profile() without worrying about ordering.
let source = 'auto';
let level = 'high';
try {
  const f = forced();
  const s = stored();
  if (f) { level = f; source = 'url'; }
  else if (s) { level = s; source = 'saved'; }
  else { level = autoLevel(); source = 'auto'; }
} catch (e) {
  level = 'high';
  source = 'fallback';
}

/**
 * ?engine=lphys / ?e=rapier pins the physics backend for a session, independently of
 * the quality level. Handy for comparing the two on one device without giving up
 * High's shading — and for a tablet where the Rapier download is a problem.
 */
function forcedEngine() {
  const m = /[?&]e(?:ngine)?=(lphys|rapier)/i.exec(location.search);
  return m ? m[1].toLowerCase() : null;
}
const engineOverride = (() => { try { return forcedEngine(); } catch (e) { return null; } })();

/**
 * The physics backend this profile wants: 'rapier' on High, 'lphys' on Low (unless
 * pinned on the URL). What the game actually GOT is js/phys.js activeEngine() — it
 * falls back to lphys if Rapier cannot be loaded.
 */
export function wantedEngine() { return engineOverride || PROFILES[level].engine; }
export function engineIsPinned() { return !!engineOverride; }

export function profile() { return PROFILES[level]; }
export function currentLevel() { return level; }
export function levelName() { return PROFILES[level].name; }
export function isLow() { return level === 'low'; }
export function levelSource() { return source; }

/** Flip the level. `persist` writes it to the shared save (device setting). */
export function setLevel(next, persist) {
  if (next !== 'low' && next !== 'high') return level;
  level = next;
  if (persist) {
    source = 'saved';
    try { writeSetting(KEY, next); } catch (e) { /* private mode: session only */ }
  }
  return level;
}

export function otherLevel() { return level === 'low' ? 'high' : 'low'; }

export function detectionInfo() {
  return {
    level, source, auto: autoLevel(), score: weaknessScore(),
    engine: wantedEngine(), enginePinned: engineIsPinned(),
    touch: isTouchDevice(),
    coarsePointer: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
    dpr: window.devicePixelRatio || 1,
    minSide: Math.min(window.innerWidth, window.innerHeight),
  };
}
