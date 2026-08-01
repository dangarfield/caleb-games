#!/usr/bin/env node
// Linky (Flow Free clone) — level generator.
//
// Generates 50 provably-solvable, FULLY-COVERING levels "by construction":
//   1. Build a random Hamiltonian path over the WHOLE grid (backbite algorithm),
//      guaranteeing every cell is visited exactly once by a single simple path.
//   2. Cut that path into K contiguous segments. Each segment => one colour pair,
//      its two ends => the coloured dots, the segment itself => the stored solution.
//   Because the source is one Hamiltonian path, the union of segments always
//   covers every cell and no cell is ever reused — solvability is guaranteed.
//
// Every level is self-verified before it is accepted; the whole run ABORTS on
// any failure. Output: games/linky/levels.js -> window.LINKY_LEVELS.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- seeded PRNG (mulberry32) -------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- vivid, distinct dot colours ----------------------------------------
const COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f1c40f', // yellow
  '#e67e22', // orange
  '#00e5ff', // cyan
  '#ff2fd0', // magenta
  '#9b59b6', // purple
  '#ffffff', // white
  '#a3ff2f', // lime
  '#ff8fc7', // pink
  '#1abc9c', // teal
  '#7f8cff', // periwinkle
  '#c0392b', // dark red
  '#f5a623', // amber
  '#16a085', // dark teal
  '#8e44ad', // deep purple
  '#2980b9', // steel blue
  '#d35400', // burnt orange
  '#27ae60', // emerald
  '#e84393', // hot pink
  '#95a5a6', // grey
  '#fd79a8', // salmon
  '#00b894', // mint
];

// ---- grid helpers --------------------------------------------------------
const key = (r, c) => r * 100 + c;
function neighbors(r, c, size) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < size - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < size - 1) out.push([r, c + 1]);
  return out;
}
function adjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

// ---- Hamiltonian path via backbite --------------------------------------
// Start from a boustrophedon (snake) path, then randomise with backbite moves.
function boustrophedon(size) {
  const path = [];
  for (let r = 0; r < size; r++) {
    if (r % 2 === 0) for (let c = 0; c < size; c++) path.push([r, c]);
    else for (let c = size - 1; c >= 0; c--) path.push([r, c]);
  }
  return path;
}

function backbiteRandomize(path, size, rng, iters) {
  const n = path.length;
  // index map: cellKey -> position in path
  const pos = new Map();
  for (let i = 0; i < n; i++) pos.set(key(path[i][0], path[i][1]), i);

  for (let it = 0; it < iters; it++) {
    // pick an end: 0 => head, 1 => tail
    const useTail = rng() < 0.5;
    const endIdx = useTail ? n - 1 : 0;
    const end = path[endIdx];
    const nb = neighbors(end[0], end[1], size);
    const pick = nb[(rng() * nb.length) | 0];
    const j = pos.get(key(pick[0], pick[1]));

    if (useTail) {
      // neighbour already the adjacent path cell -> no-op
      if (j === n - 2) continue;
      // reverse path[j+1 .. n-1]
      let lo = j + 1, hi = n - 1;
      while (lo < hi) {
        const tmp = path[lo]; path[lo] = path[hi]; path[hi] = tmp;
        pos.set(key(path[lo][0], path[lo][1]), lo);
        pos.set(key(path[hi][0], path[hi][1]), hi);
        lo++; hi--;
      }
      if (lo === hi) pos.set(key(path[lo][0], path[lo][1]), lo);
    } else {
      if (j === 1) continue;
      // reverse path[0 .. j-1]
      let lo = 0, hi = j - 1;
      while (lo < hi) {
        const tmp = path[lo]; path[lo] = path[hi]; path[hi] = tmp;
        pos.set(key(path[lo][0], path[lo][1]), lo);
        pos.set(key(path[hi][0], path[hi][1]), hi);
        lo++; hi--;
      }
      if (lo === hi) pos.set(key(path[lo][0], path[lo][1]), lo);
    }
  }
  return path;
}

// ---- cut a path into K contiguous segments (each length >= 2) ------------
function cutIntoSegments(path, k, rng) {
  const n = path.length;
  if (k * 2 > n) return null; // can't guarantee each length >= 2
  // choose k-1 internal cut points so each segment length >= 2.
  // model: distribute (n - 2k) extra units across k segments (each base 2).
  const extra = n - 2 * k;
  const lens = new Array(k).fill(2);
  for (let e = 0; e < extra; e++) lens[(rng() * k) | 0]++;
  const segs = [];
  let idx = 0;
  for (let i = 0; i < k; i++) {
    segs.push(path.slice(idx, idx + lens[i]));
    idx += lens[i];
  }
  return segs;
}

function isStraight(seg) {
  const sameRow = seg.every((c) => c[0] === seg[0][0]);
  const sameCol = seg.every((c) => c[1] === seg[0][1]);
  return sameRow || sameCol;
}

// ---- build one level -----------------------------------------------------
function buildLevel(size, pairs, seedBase) {
  const total = size * size;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const rng = mulberry32(seedBase + attempt * 7919);
    let path = boustrophedon(size);
    path = backbiteRandomize(path, size, rng, total * 12);
    const segs = cutIntoSegments(path, pairs, rng);
    if (!segs) return null;

    // quality gates
    const straightCount = segs.filter(isStraight).length;
    // "Adjacent dots" = the two ENDPOINTS sit on neighbouring cells (a trivial
    // gimme), regardless of how the solution path snakes between them.
    const adjCount = segs.filter((s) => adjacent(s[0], s[s.length - 1])).length;
    // RULE: no more than 25% of link pairs may have their two dots adjacent.
    if (adjCount > Math.floor(pairs * 0.25)) continue;
    // Also cap fully straight-line paths so levels aren't trivially obvious.
    if (size >= 7 && straightCount > Math.floor(pairs * 0.4)) continue;
    if (size < 7 && straightCount > Math.floor(pairs * 0.5)) continue;

    const level = {
      size,
      pairs: segs.map((seg, i) => ({
        color: COLORS[i],
        a: seg[0],
        b: seg[seg.length - 1],
      })),
      solution: segs.map((seg) => seg.map((c) => [c[0], c[1]])),
    };
    if (verifyLevel(level, false).ok) return level;
  }
  return null;
}

// ---- verification (shared shape with the in-page self-test) --------------
function verifyLevel(level, verbose) {
  const errs = [];
  const { size, pairs, solution } = level;
  const total = size * size;

  if (!Array.isArray(pairs) || !Array.isArray(solution)) {
    return { ok: false, errs: ['missing pairs/solution'] };
  }
  if (pairs.length !== solution.length) errs.push('pairs/solution length mismatch');
  if (pairs.length < 3) errs.push('too few pairs (<3)');

  const used = new Map(); // cellKey -> pairIndex
  for (let i = 0; i < solution.length; i++) {
    const chain = solution[i];
    const p = pairs[i];
    if (!Array.isArray(chain) || chain.length < 2) { errs.push(`pair ${i}: chain too short`); continue; }
    // bounds + adjacency
    for (let s = 0; s < chain.length; s++) {
      const [r, c] = chain[s];
      if (r < 0 || c < 0 || r >= size || c >= size) errs.push(`pair ${i}: cell out of bounds`);
      if (s > 0 && !adjacent(chain[s - 1], chain[s])) errs.push(`pair ${i}: non-adjacent step at ${s}`);
      const k = key(r, c);
      if (used.has(k)) errs.push(`pair ${i}: cell ${r},${c} overlaps pair ${used.get(k)}`);
      else used.set(k, i);
    }
    // endpoints match dots
    const head = chain[0], tail = chain[chain.length - 1];
    if (!p || head[0] !== p.a[0] || head[1] !== p.a[1]) errs.push(`pair ${i}: head != dot a`);
    if (!p || tail[0] !== p.b[0] || tail[1] !== p.b[1]) errs.push(`pair ${i}: tail != dot b`);
  }
  // full coverage
  if (used.size !== total) errs.push(`coverage ${used.size}/${total} (not full)`);

  if (verbose && errs.length) errs.forEach((e) => console.log('   x ' + e));
  return { ok: errs.length === 0, errs, coverage: used.size, total };
}

// ---- level curve ---------------------------------------------------------
function curve(levelNum) {
  // returns { size, pairs }
  if (levelNum <= 10) {           // 5x5, 25 cells (~3.1-5 cells/path)
    const p = [5, 5, 5, 6, 6, 6, 7, 7, 8, 8];
    return { size: 5, pairs: p[levelNum - 1] };
  }
  if (levelNum <= 20) {           // 6x6, 36 cells
    const p = [6, 7, 7, 8, 8, 8, 9, 9, 10, 10];
    return { size: 6, pairs: p[levelNum - 11] };
  }
  if (levelNum <= 32) {           // 7x7, 49 cells
    const p = [8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14];
    return { size: 7, pairs: p[levelNum - 21] };
  }
  if (levelNum <= 42) {           // 8x8, 64 cells
    const p = [11, 11, 12, 12, 13, 13, 14, 15, 15, 16];
    return { size: 8, pairs: p[levelNum - 33] };
  }
  // 9x9, 81 cells
  const p = [13, 14, 15, 15, 16, 17, 18, 19];
  return { size: 9, pairs: p[levelNum - 43] };
}

// ---- run -----------------------------------------------------------------
function main() {
  const levels = [];
  let allOk = true;
  console.log('Linky level generation\n=======================');
  for (let n = 1; n <= 50; n++) {
    const { size, pairs } = curve(n);
    const level = buildLevel(size, pairs, 0x1000 * n + 12345);
    if (!level) {
      console.log(`L${String(n).padStart(2)}: FAILED to construct (${size}x${size}, ${pairs} pairs)`);
      allOk = false;
      continue;
    }
    const v = verifyLevel(level, true);
    const straight = level.solution.filter(isStraight).length;
    const adj = level.solution.filter((s) => adjacent(s[0], s[s.length - 1])).length;
    const status = v.ok ? 'OK ' : 'FAIL';
    console.log(
      `L${String(n).padStart(2)}: ${status} ${size}x${size}  pairs=${pairs}  ` +
      `coverage=${v.coverage}/${v.total}  straight=${straight}  adj=${adj}/${pairs}(${Math.round(adj/pairs*100)}%)`
    );
    if (!v.ok) allOk = false;
    levels.push(level);
  }

  if (!allOk || levels.length !== 50) {
    console.error('\nABORT: not all levels verified. No file written.');
    process.exit(1);
  }

  const out =
    '// AUTO-GENERATED by tools/gen-levels.mjs — do not edit by hand.\n' +
    '// 50 provably-solvable, fully-covering Flow Free levels.\n' +
    '// Each level: { size, pairs:[{color,a:[r,c],b:[r,c]}...], solution:[[[r,c]...]...] }\n' +
    'window.LINKY_LEVELS = ' + JSON.stringify(levels) + ';\n';
  const outPath = join(__dirname, '..', 'levels.js');
  writeFileSync(outPath, out, 'utf8');
  console.log(`\nAll 50 levels verified. Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB).`);
}

main();
