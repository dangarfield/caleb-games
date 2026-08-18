// The physics backend selector.
//
// Sea Glass has two physics engines and the quality profile picks one:
//
//   High -> 'rapier'  js/rphys.js, a Rapier (Rust/wasm) rigid-body world
//   Low  -> 'lphys'   js/lphys.js, the game's own position-based sphere relaxation
//
// Both expose the SAME surface: the SoA typed arrays (px/py/pz, qx..qw, vx/vy/vz,
// wx/wy/wz, r, invM, alive, tag, moved), the same awake-set bookkeeping, and the
// same methods. So the two worlds the game runs — the beach pit (physics.js) and the
// collection jars (collection.js) — are written once and simply ask this module for
// a world. There is exactly one place in game code that asks WHICH backend it got,
// and it asks by capability (`world.hardWalls`) rather than by name.
//
// The `Body` handle is shared verbatim: it only ever touches the SoA arrays and the
// world's own methods, both of which the two backends agree on.
//
// Rapier has to be fetched and its wasm instantiated before a world can exist, so
// the engine is resolved ONCE at boot (`initEngine`, awaited behind the loading
// screen) and again if the player flips the quality toggle. If Rapier cannot be
// loaded the game silently runs lphys on both profiles — the beach still works, it
// just uses the cheaper solver.

import { World as LphysWorld, Body, MODE_ROLL, MODE_SPIN } from './lphys.js';
import { World as RapierWorld } from './rphys.js';
import { loadRapier, rapierReady, rapierError, rapierVersion } from './rapier.js';

export { Body, MODE_ROLL, MODE_SPIN };

export const ENGINE_RAPIER = 'rapier';
export const ENGINE_LPHYS = 'lphys';

/** Which backend new worlds will be built on. */
let engine = ENGINE_LPHYS;
/** What was asked for, before any fallback. */
let requested = ENGINE_LPHYS;

/**
 * Resolve the backend. Awaits the Rapier download + wasm init the first time
 * 'rapier' is asked for; every later call is instant. Returns the engine actually
 * available, which is what the caller should believe (not what it asked for).
 */
export async function initEngine(want) {
  requested = want === ENGINE_RAPIER ? ENGINE_RAPIER : ENGINE_LPHYS;
  if (requested === ENGINE_RAPIER) {
    const mod = await loadRapier();
    engine = mod ? ENGINE_RAPIER : ENGINE_LPHYS;
  } else {
    engine = ENGINE_LPHYS;
  }
  return engine;
}

/** The backend in force right now. */
export function activeEngine() { return engine; }

/** Did we fall back? (i.e. High asked for Rapier and did not get it) */
export function engineFellBack() { return requested !== engine; }

export function engineInfo() {
  return {
    engine, requested,
    rapierReady: rapierReady(),
    rapierVersion: rapierVersion(),
    rapierError: rapierError(),
  };
}

/**
 * Build a world on the active backend (or on `opts.engine`, if a caller wants to
 * pin one). Falls back to lphys whenever Rapier is not actually ready, and also if
 * constructing the Rapier world throws — a physics backend that will not start must
 * not take the game down with it.
 */
export function makeWorld(opts = {}) {
  const want = opts.engine || engine;
  if (want === ENGINE_RAPIER && rapierReady()) {
    try {
      return new RapierWorld(opts);
    } catch (e) {
      engine = ENGINE_LPHYS;
    }
  }
  return new LphysWorld(opts);
}
