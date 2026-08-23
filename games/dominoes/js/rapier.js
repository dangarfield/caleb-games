// Rapier loader — the SOURCES/fallback pattern from games/sea-glass/js/rapier.js.
//
// Rapier is Rust compiled to WebAssembly, so unlike `three` it cannot just be
// imported and used: the module has to be fetched AND its wasm instantiated
// (`await RAPIER.init()`) before a single World can exist. Keeping that await in ONE
// place means the rest of the game never has to think about it.
//
// It is fetched LAZILY, in the background, from the moment the title screen appears.
// Build mode runs with NO physics at all (standing dominoes are drawn straight from
// the layout model — see sim.js), so the ~950 KB wasm only has to be there by
// the time the player taps GO. If they beat the download, the GO button says
// "Loading physics..." for a moment instead of the whole game sitting behind a
// blocking splash.
//
// Preference order:
//   1. the importmap specifier `rapier` -> the SIMD build, 2.4x faster under load
//      (0.466 -> 0.189 ms/step at ~250 awake bodies) and 39 KB SMALLER over the wire.
//   2. the same SIMD build by explicit jsdelivr URL, then unpkg.
//   3. the non-SIMD compat build, for tablets older than Safari 16.4 / Chrome 91.
//
// NOTE the `/dist/rapier.mjs` path: 0.20.0 moved the compat entry point out of the
// package root, so older pinned URLs 404.
//
// Everything here is failure-tolerant on purpose: loadRapier() resolves to null and
// the game says so instead of throwing.

const SOURCES = [
  'rapier',
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-simd-compat@0.20.0/dist/rapier.mjs',
  'https://unpkg.com/@dimforge/rapier3d-simd-compat@0.20.0/dist/rapier.mjs',
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs',
  'https://unpkg.com/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs',
];

let RAPIER = null;
let pending = null;
let failure = null;
let usedSource = null;

/**
 * Fetch + initialise Rapier. Safe to call any number of times: the work happens
 * once and every caller awaits the same promise. Resolves to the module, or to null
 * if it could not be loaded.
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
        usedSource = src;
        return RAPIER;
      } catch (e) {
        failure = e;
        // A blocked CDN and a wasm that will not instantiate look the same from
        // here, and the answer is the same either way: try the next source.
      }
    }
    return null;
  })();
  return pending;
}

export function rapier() { return RAPIER; }
export function rapierReady() { return !!RAPIER; }
export function rapierError() { return failure ? String(failure.message || failure) : null; }
export function rapierSource() { return usedSource; }
export function rapierIsSimd() { return !!usedSource && /simd|^rapier$/.test(usedSource); }
export function rapierVersion() {
  try { return RAPIER && RAPIER.version ? RAPIER.version() : null; } catch (e) { return null; }
}
