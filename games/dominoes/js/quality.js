// Device quality tiering — ported from games/sea-glass/js/quality.js.
//
// PERFORMANCE MANDATE rule 4: any touch device -> Low. The target machine for this
// game is a low-powered tablet, and the measured cost model says the bottleneck is
// NOT the physics (with fallen dominoes parked as Fixed, 1500 of them cost 0.21
// ms/step on desktop) but the RENDERER: fill rate, shadow pass and pixel ratio.
// So the Low profile cuts pixels and passes first and only caps the domino count
// last.
//
// Precedence is always  ?q= URL override  >  saved choice  >  auto-detect, resolved
// at module evaluation so env.js can read profile() before it builds the renderer.
//
// The level is a DEVICE setting, not a per-player one: the tablet is slow for Caleb
// and Ezra alike. It lives at calebArcadeData.dominoes.quality via storage.js, so it
// shares the one cached root object and cannot be clobbered by a later savePlayer().

import { readSetting, writeSetting } from './storage.js';

const KEY = 'quality';

export const PROFILES = {
  high: {
    id: 'high',
    name: 'High',
    // --- GPU ---
    pixelRatioCap: 1.65,
    shadows: true,
    shadowMapSize: 1024,
    shading: 'pbr',              // MeshStandardMaterial + a generated env map
    antialias: true,
    // --- physics ---
    // The timestep is NOT a quality knob. It is 1/60 on every device, for ever:
    // 30 Hz measurably changes the FEEL of a topple (the same 100-domino run takes
    // 34.3 s instead of 25.6 s) and destabilises resting stacks. See sim.js.
    solverIterations: 4,         // measured optimum: 1 collapses, 2 tilts 0.57 deg, 4 is 0.00, 8 is 60% dearer
    // --- counts ---
    // Realistic 60fps ceilings from the benchmark table in the plan. `dominoCap`
    // clamps the unlocked BUDGET, and the UI says so out loud rather than silently
    // truncating a run (silent truncation reads as a bug to an 8-year-old).
    dominoCap: 600,
    confetti: 90,
    itemCap: 40,
    // Shadow-casting is per-mesh; on High the dominoes cast, on Low nothing does.
    dominoShadows: true,
  },
  low: {
    id: 'low',
    name: 'Low',
    pixelRatioCap: 1.15,
    shadows: false,
    shadowMapSize: 512,
    shading: 'lambert',          // no env map, no PBR maths
    antialias: false,
    solverIterations: 4,         // SAME as High — see the note above; 4 is what makes a stack stand up
    dominoCap: 250,
    confetti: 30,
    itemCap: 24,
    dominoShadows: false,
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

  if (typeof hc !== 'number' || !hc) score += 1;
  else if (hc <= 2) score += 3;
  else if (hc <= 4) score += 2;
  else if (hc <= 6) score += 1;

  // Safari does not expose deviceMemory; absent is not evidence of weakness, so it
  // scores nothing rather than being counted twice against Chrome tablets.
  if (typeof mem === 'number' && mem > 0) {
    if (mem <= 2) score += 3;
    else if (mem <= 4) score += 2;
    else if (mem <= 6) score += 1;
  }

  if (dpr >= 2 && minSide <= 820) score += 1;

  return score;
}

/** Any touch device at all — three independent signals, any one is enough. */
export function isTouchDevice() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) { /* very old browsers */ }
  if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) return true;
  if (navigator.msMaxTouchPoints > 0) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook|BB10/i.test(navigator.userAgent || '')) return true;
  // iPadOS 13+ reports a desktop Safari UA; the touch points above catch it.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

/** The DEFAULT level when nobody has chosen one. Every touch device gets Low. */
export function autoLevel() {
  if (isTouchDevice()) return 'low';
  return weaknessScore() >= 2 ? 'low' : 'high';
}

function stored() {
  const v = readSetting(KEY, null);
  return v === 'low' || v === 'high' ? v : null;
}

/** ?q=low / ?quality=high forces a level for one session (used for testing). */
function forced() {
  const m = /[?&]q(?:uality)?=(low|high)/i.exec(location.search);
  return m ? m[1].toLowerCase() : null;
}

let source = 'auto';
let level = 'high';
try {
  const f = forced();
  const s = stored();
  if (f) { level = f; source = 'url'; }
  else if (s) { level = s; source = 'saved'; }
  else { level = autoLevel(); source = 'auto'; }
} catch (e) {
  level = 'low';                 // when in doubt, be cheap
  source = 'fallback';
}

export function profile() { return PROFILES[level]; }
export function currentLevel() { return level; }
export function levelName() { return PROFILES[level].name; }
export function isLow() { return level === 'low'; }
export function levelSource() { return source; }
export function otherLevel() { return level === 'low' ? 'high' : 'low'; }

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

export function detectionInfo() {
  return {
    level, source, auto: autoLevel(), score: weaknessScore(),
    touch: isTouchDevice(),
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
    dpr: window.devicePixelRatio || 1,
    minSide: Math.min(window.innerWidth, window.innerHeight),
  };
}
