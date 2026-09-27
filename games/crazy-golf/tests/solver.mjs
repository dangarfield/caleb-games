/* solver.mjs — plays every hole headlessly with the real physics and checks it can be finished.
 *   node tests/solver.mjs            all holes
 *   node tests/solver.mjs pirate 3   one hole (world, 1-based hole)
 * For each hole: geometry checks, then a beam search over putts (angle x power, optional wait)
 * guided by a walking-distance field from the cup. Fails if the best found is over par. */

import { HOLES, WORLD_IDS } from '../js/holes.js';
const ONLY = process.env.WORLDS ? process.env.WORLDS.split(',') : null;
import { buildWorld, Sim, BALL_R, HAZARD_ZONES } from '../js/physics.js';
import { selfIntersects, pointInPoly } from '../js/geometry.js';
const GEOM_ONLY = !!process.env.GEOM;

const argW = process.argv[2], argH = process.argv[3] ? +process.argv[3] - 1 : null;
const DIFF = process.env.DIFF || 'normal';

export function field(W) {
  const C = 0.2, g = W.grid, x0 = g.x0, z0 = g.z0, nx = Math.ceil(g.nx / C), nz = Math.ceil(g.nz / C);
  const free = new Uint8Array(nx * nz), dist = new Float64Array(nx * nz).fill(1e9);
  const cell = (x, z) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); return (i < 0 || j < 0 || i >= nx || j >= nz) ? -1 : j * nx + i; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C;
    let ok = W.islands.some(p => pointInPoly(x, z, p));
    if (ok && W.zones.some(zn => HAZARD_ZONES.includes(zn.t) && pointInPoly(x, z, zn.pts))) ok = false;
    if (ok && W.blocks.some(b => pointInPoly(x, z, b.pts))) ok = false;
    if (ok && W.circles.some(c => Math.hypot(x - c.x, z - c.z) < c.r + BALL_R)) ok = false;
    free[j * nx + i] = ok ? 1 : 0;
  }
  // gaps are crossable (the plank) but cost a little extra
  const tele = new Map();   // exit cell -> [entry cells]
  for (const tr of W.triggers) {
    const to = tr.h.b || tr.h.to; const e = cell(to[0], to[1]), s = cell(tr.x, tr.z);
    if (!tele.has(e)) tele.set(e, []); tele.get(e).push(s); free[s] = 1;
  }
  const heap = [[0, cell(W.cup[0], W.cup[1])]]; dist[heap[0][1]] = 0;
  const push = (d, c) => { heap.push([d, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, c] = pop(); if (d > dist[c]) continue;
    const i = c % nx, j = (c / nx) | 0;
    for (const [di, dj, w] of [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const n = jj * nx + ii; if (!free[n]) continue;
      const nd = d + w * C; if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
    }
    for (const s of tele.get(c) || []) { const nd = d + 1; if (s >= 0 && nd < dist[s]) { dist[s] = nd; push(nd, s); } }
  }
  return (x, z) => { const c = cell(x, z); return c < 0 ? 1e9 : dist[c]; };
}

function clone(W, st) {
  const s = new Sim(W, { diff: DIFF, t: st.t });
  s.b.x = st.x; s.b.z = st.z; s.lastRest = [st.x, st.z];
  return s;
}
function play(W, st, ang, pw, wait) {
  const s = clone(W, { ...st, t: st.t + wait });
  s.shoot(Math.cos(ang), Math.sin(ang), pw);
  let pen = 0, T = 0, gems = 0;
  while (T < 40) {
    const ev = s.update(1 / 60); T += 1 / 60;
    for (const e of ev) { if (e.type === 'penalty') pen++; if (e.type === 'gem') gems++; }
    if (s.mode === 'sunk') return { sunk: true, pen, gems };
    if (s.mode === 'rest') break;
  }
  return { sunk: false, x: s.b.x, z: s.b.z, t: s.t, pen, gems };
}

function checkGeom(hole, W, tag) {
  const errs = [];
  W.islands.forEach((p, i) => { if (selfIntersects(p)) errs.push(`island ${i} self-intersects`); });
  const onC = (x, z) => W.islands.some(p => pointInPoly(x, z, p));
  const inHaz = (x, z) => W.zones.some(zn => HAZARD_ZONES.includes(zn.t) && pointInPoly(x, z, zn.pts)) || W.blocks.some(b => pointInPoly(x, z, b.pts));
  for (const [nm, p] of [['tee', W.tee], ['cup', W.cup], ...W.gems.map((g, i) => ['gem' + i, g])]) {
    if (!onC(p[0], p[1])) errs.push(`${nm} off course`); else if (inHaz(p[0], p[1])) errs.push(`${nm} in hazard`);
  }
  for (const tr of W.triggers) { const to = tr.h.b || tr.h.to; if (!onC(to[0], to[1])) errs.push(`${tr.t} exit off course`); if (!onC(tr.x, tr.z)) errs.push(`${tr.t} entry off course`); }
  for (const d of hole.deco || []) { const near = W.islands.some(p => pointInPoly(d[1], d[2], p)) || W.islands.some(p => p.some(q => Math.hypot(q[0] - d[1], q[1] - d[2]) < 1.1)); if (near) errs.push(`deco ${d[0]} too close to course`); }
  if (errs.length) console.log(`  ${tag} GEOM: ${errs.join('; ')}`);
  return errs.length;
}

function solve(hole, W) {
  const dist = field(W);
  const ANG = 120, PW = [0.14, 0.2, 0.27, 0.35, 0.43, 0.52, 0.62, 0.72, 0.83, 0.93, 1.0];
  const WAITS = W.movers.length || W.windmills.length || W.gaps.length || W.sweepers.length || W.pistons.length ? [0, 0.9, 1.8] : [0];
  let beam = [{ x: W.tee[0], z: W.tee[1], t: 0, strokes: 0 }];
  const maxS = hole.par + 2;
  let best = null, hio = false;
  for (let depth = 1; depth <= maxS && !best; depth++) {
    const next = new Map();
    for (const st of beam) {
      for (const wait of WAITS) for (let a = 0; a < ANG; a++) for (const pw of PW) {
        const ang = a / ANG * Math.PI * 2, r = play(W, st, ang, pw, wait), strokes = st.strokes + 1;   // no penalty stroke for water/lava/gaps
        if (r.sunk) { if (!best || strokes < best) best = strokes; if (strokes === 1) hio = true; continue; }
        const d = dist(r.x, r.z); if (d > 1e8) continue;
        const key = Math.round(r.x * 2) + ',' + Math.round(r.z * 2);
        const score = d + strokes * 3;
        const cur = next.get(key); if (!cur || cur.score > score) next.set(key, { x: r.x, z: r.z, t: r.t, strokes, score });
      }
    }
    if (best) break;
    beam = [...next.values()].sort((a, b) => a.score - b.score).slice(0, 14);
    if (!beam.length) break;
  }
  return { best, hio, d0: dist(W.tee[0], W.tee[1]) };
}

let fails = 0;
const t0 = Date.now();
for (const [wi, wid] of WORLD_IDS.entries()) {
  if (argW && argW !== wid) continue;
  if (ONLY && !ONLY.includes(wid)) continue;
  HOLES[wid].forEach((hole, hi) => {
    if (argH != null && argH !== hi) return;
    const tag = `${wid} ${hi + 1} ${hole.name}`;
    const W = buildWorld(hole);
    fails += checkGeom(hole, W, tag);
    if (GEOM_ONLY) return;
    const ts = Date.now();
    const r = solve(hole, W);
    const ok = r.best != null && r.best <= hole.par;
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${tag.padEnd(34)} par ${hole.par}  best ${r.best ?? '-'}${r.hio ? '  (ace possible)' : ''}  walk ${r.d0.toFixed(1)}  ${((Date.now() - ts) / 1000).toFixed(1)}s`);
  });
  void wi;
}
console.log(`${fails ? fails + ' problem(s)' : 'all holes playable'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(fails ? 1 : 0);
