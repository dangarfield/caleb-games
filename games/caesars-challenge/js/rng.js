// Caesar's Challenge — deterministic RNG helpers (LANE A)
// Pure. No DOM, no Date.now(), no Math.random(). Same seed => same stream, forever.

/**
 * mulberry32 — tiny, fast, well-distributed 32-bit PRNG.
 * @param {number} seed any integer (coerced to uint32)
 * @returns {() => number} function returning a float in [0,1)
 */
export function makeRng(seed) {
  let a = (seed | 0) >>> 0;
  // Avoid the degenerate all-zero state.
  if (a === 0) a = 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random element of a non-empty array. */
export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Fisher-Yates. Returns a NEW array; never mutates the input. */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Inclusive integer in [lo, hi]. Tolerates lo > hi by swapping. */
export function randInt(rng, lo, hi) {
  let a = Math.ceil(Math.min(lo, hi));
  let b = Math.floor(Math.max(lo, hi));
  if (b < a) b = a;
  return a + Math.floor(rng() * (b - a + 1));
}
