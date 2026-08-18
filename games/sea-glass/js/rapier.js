// Rapier loader.
//
// Rapier is Rust compiled to WebAssembly, so unlike `three` it cannot simply be
// imported and used: the module has to be fetched AND its wasm instantiated
// (`await RAPIER.init()`) before a single World can exist. That is why this is a
// module of its own rather than three lines inside rphys.js — the whole point is to
// keep the await in ONE place, ahead of everything else, behind the loading screen.
//
// It is also loaded LAZILY, with a dynamic import. Only the High profile runs the
// Rapier backend (Low runs js/lphys.js, which is a few kilobytes of hand-written
// JS), so a tablet on Low must never pay to download a megabyte of wasm it is not
// going to use.
//
// Everything here is failure-tolerant on purpose: if the CDN is unreachable, or the
// device refuses to instantiate the wasm, `loadRapier()` resolves to null and
// js/phys.js quietly falls back to lphys. A missing physics engine must degrade the
// game's feel, never break it.

/** The importmap specifier, tried first, then explicit CDN URLs as a fallback. */
const SOURCES = [
  '@dimforge/rapier3d-compat',
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs',
  'https://unpkg.com/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs',
];

let RAPIER = null;
let pending = null;
let failure = null;

/**
 * Fetch + initialise Rapier. Safe to call any number of times: the work happens
 * once and every caller awaits the same promise. Resolves to the module, or to
 * null if it could not be loaded (see the note above).
 */
export function loadRapier() {
  if (RAPIER) return Promise.resolve(RAPIER);
  if (pending) return pending;
  pending = (async () => {
    for (const src of SOURCES) {
      try {
        const mod = await import(/* @vite-ignore */ src);
        const api = mod && mod.default && mod.default.World ? mod.default : mod;
        if (!api || typeof api.init !== 'function') throw new Error('no init()');
        await api.init();
        if (!api.World) throw new Error('no World after init()');
        RAPIER = api;
        return RAPIER;
      } catch (e) {
        failure = e;
        // Try the next source. A blocked CDN and a wasm that will not instantiate
        // look the same from here, and the answer is the same either way.
      }
    }
    return null;
  })();
  return pending;
}

/** The module, or null while it is still loading / if it failed. */
export function rapier() { return RAPIER; }

/** Has Rapier been loaded AND initialised? */
export function rapierReady() { return !!RAPIER; }

/** Why it is not available (for the debug readout). */
export function rapierError() { return failure ? String(failure.message || failure) : null; }

/** Version string, for the perf readout. */
export function rapierVersion() {
  try { return RAPIER && RAPIER.version ? RAPIER.version() : null; } catch (e) { return null; }
}
