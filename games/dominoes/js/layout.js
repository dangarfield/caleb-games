// The LAYOUT is the single source of truth for what is on the table.
//
// This is the design decision the whole build hangs off: while you are building there
// is NO PHYSICS AT ALL. Standing dominoes are drawn straight out of this model, and
// Rapier is only handed the model when you tap GO. That buys three things at once:
//   * build mode costs zero solver work and zero wasm memory — a 300-domino table is
//     as cheap to build on as an empty one (PERFORMANCE MANDATE rule 3);
//   * undo/redo becomes a cheap edit of a plain array instead of a snapshot of 300
//     rigid bodies (see history.js);
//   * "back to build" after a topple is free and exactly non-destructive, because the
//     run never touched the model in the first place.
//
// It also means the whole world is destroyed and rebuilt only BETWEEN runs, so the
// rapier3d-compat "never free a body that has been through setBodyType() in a live
// world" trap (documented at length in sea-glass/js/rphys.js:39-60) simply cannot be
// hit: sim.js frees the entire World and makes a new one.

import { DOM_H, DOM_W, TABLES, SPACINGS, clampGap } from './consts.js';
import { ITEMS } from './items-def.js';

export function freshLayout(table, surface, spacing, skin) {
  return {
    table: table || 'small',
    surface: surface || 'felt',
    spacing: spacing || 'normal',
    skin: skin || 'plain',
    dominoes: [],
    items: [],
    startId: null,
    nextId: 1,
    challenge: null,
  };
}

// --- placement surfaces & blockers ----------------------------------------
// Rebuilt whenever items change (there are only ever a few dozen), so the per-frame
// cost of a lookup is a short linear scan over small structs.
// Rects are ORIENTED: a centre, half-extents, and the cos/sin of the yaw they were built
// at. They used to be axis-aligned (x0..x1, z0..z1), which was only sound while items
// snapped to quarter turns — a rotated rectangle is still an axis-aligned rectangle at 0,
// 90, 180 and 270 degrees and at no other angle. The rotation slider rotates items freely,
// so an axis-aligned test would have said "the bridge deck is here" about a rectangle the
// bridge is no longer standing in, and dominoes would have been placeable in mid-air
// alongside it. The oriented test below is two extra multiplies per rect.
let surfaces = [];   // { y, cx, cz, hw, hd, c, s }  horizontal tops you may place ON
let blockers = [];   // { y, cx, cz, hw, hd, c, s }  footprints you may NOT place in

export function rebuildSurfaces(L) {
  surfaces.length = 0;
  blockers.length = 0;
  const t = TABLES[L.table] || TABLES.small;
  surfaces.push({ y: 0, cx: 0, cz: 0, hw: t.w / 2, hd: t.d / 2, c: 1, s: 0 });
  for (const it of L.items) {
    const def = ITEMS[it.type];
    if (!def) continue;
    if (def.surfaces) def.surfaces(it, surfaces);
    if (def.blocks) def.blocks(it, blockers);
  }
  // Highest first, so the first containing hit from a camera above is the right one.
  surfaces.sort((a, b) => b.y - a.y);
}

/**
 * Is (x,z) inside an oriented rect? Take the offset from the rect's centre into the rect's
 * own frame and compare against the half-extents. The inverse of items-def's localToWorld
 * (`wx = cx + lx*c + lz*s`, `wz = cz - lx*s + lz*c`), so the two cannot drift apart.
 */
function inRect(r, x, z) {
  const dx = x - r.cx, dz = z - r.cz;
  const lx = dx * r.c - dz * r.s;
  const lz = dx * r.s + dz * r.c;
  return lx >= -r.hw && lx <= r.hw && lz >= -r.hd && lz <= r.hd;
}

/** Straight-down lookup: the highest surface under (x,z), or null if off-table. */
export function surfaceAt(x, z) {
  for (let i = 0; i < surfaces.length; i++) {
    if (inRect(surfaces[i], x, z)) return surfaces[i];
  }
  return null;
}

/**
 * Is (x,z) inside something solid, for a domino whose base would sit at height `y`?
 * The height term is the whole point: a blocker only obstructs what is BELOW its top,
 * so a bridge deck 64 mm up passes clean over a 50 mm wall. Omitting `y` asks the old
 * question ("is anything here at all") and is used by the eraser and the item preview.
 */
export function isBlocked(x, z, y) {
  for (let i = 0; i < blockers.length; i++) {
    const r = blockers[i];
    if (!inRect(r, x, z)) continue;
    if (y === undefined || y < r.y - 1e-4) return true;
  }
  return false;
}

/**
 * Where a screen ray lands, taking raised decks into account: hit the highest
 * surface the ray actually crosses INSIDE its rectangle. With an angled camera that
 * is what makes tapping the top of a bridge put a domino on the bridge rather than
 * on the table behind it. `out` is written in place.
 */
export function pickSurface(rayPlane, out) {
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (!rayPlane(s.y, out)) continue;
    if (inRect(s, out.x, out.z)) { out.surf = s; return true; }
  }
  return false;
}

export function tableOf(L) { return TABLES[L.table] || TABLES.small; }

/** Clamp a point to the usable part of the table (inside the kerbs). */
export function clampToTable(L, p) {
  const t = tableOf(L);
  const mx = t.w / 2 - DOM_W * 0.8, mz = t.d / 2 - DOM_W * 0.8;
  p.x = Math.max(-mx, Math.min(mx, p.x));
  p.z = Math.max(-mz, Math.min(mz, p.z));
}
export function onTable(L, x, z) {
  const t = tableOf(L);
  return Math.abs(x) <= t.w / 2 - DOM_W * 0.5 && Math.abs(z) <= t.d / 2 - DOM_W * 0.5;
}

export function gapOf(L) { return clampGap((SPACINGS[L.spacing] || SPACINGS.normal).gap); }

// --- stroke -> evenly spaced dominoes -------------------------------------
// Scratch arrays, reused: a stroke is turned into dominoes on pointerup AND on every
// pointermove while the preview is live, so this must not allocate.
const _sx = new Float64Array(4096);
const _sz = new Float64Array(4096);
const _cum = new Float64Array(4096);
let _sn = 0;

function smooth(passes) {
  for (let p = 0; p < passes; p++) {
    let px = _sx[0], pz = _sz[0];
    for (let i = 1; i < _sn - 1; i++) {
      const cx = _sx[i], cz = _sz[i];
      _sx[i] = (px + cx * 2 + _sx[i + 1]) * 0.25;
      _sz[i] = (pz + cz * 2 + _sz[i + 1]) * 0.25;
      px = cx; pz = cz;
    }
  }
}

/**
 * Walk a polyline by arc length and emit domino placements into `out`.
 *
 * @param L        the layout (for table bounds, gap, surfaces)
 * @param pts      flat [x,z,x,z,...] in table space
 * @param n        number of points
 * @param out      array to push {x,z,y,r,c,cv,s} into
 * @param budget   how many MORE dominoes may exist
 * @param colour   colour index to stamp on them
 * @param freehand smooth the stroke first
 * @param avoid    true = do not place within 0.6*gap of an existing domino
 * @returns { placed, curved, hitBudget }
 */
export function strokeToDominoes(L, pts, n, out, budget, colour, freehand, avoid) {
  if (n < 2 || budget <= 0) return { placed: 0, curved: false, hitBudget: budget <= 0 };
  _sn = Math.min(n, 4096);
  for (let i = 0; i < _sn; i++) { _sx[i] = pts[i * 2]; _sz[i] = pts[i * 2 + 1]; }
  if (freehand && _sn > 4) smooth(2);

  _cum[0] = 0;
  for (let i = 1; i < _sn; i++) {
    _cum[i] = _cum[i - 1] + Math.hypot(_sx[i] - _sx[i - 1], _sz[i] - _sz[i - 1]);
  }
  const total = _cum[_sn - 1];
  const gap = gapOf(L);
  if (total < gap * 0.5) {
    // A tap, not a stroke: one domino pointing along the camera-independent +Z.
    return placeOne(L, _sx[0], _sz[0], 0, out, budget, colour, avoid);
  }

  // Total heading change decides whether this counts as "a curve".
  let bend = 0, prevA = null;
  for (let i = 1; i < _sn; i++) {
    const a = Math.atan2(_sx[i] - _sx[i - 1], _sz[i] - _sz[i - 1]);
    if (prevA !== null) {
      let d = a - prevA;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      bend += Math.abs(d);
    }
    prevA = a;
  }
  const curved = bend > 0.85;   // ~50 degrees of accumulated turn

  // JOIN PHASE. A stroke that continues an existing line starts its own arc-length walk at
  // s = 0, i.e. exactly where the finger went down - and tryPlace then REFUSES anything
  // within 0.6 * gap of the dominoes already there, so the join comes out one and a half
  // gaps wide. Measured at tight spacing on challenge 4: a 33 mm hole against a 40.8 mm
  // propagation limit, with a heading change across it as well. That made the challenge a
  // coin flip - the same three strokes placed 190 dominoes and stopped dead at the joint
  // one run, then placed 195 and toppled every one the next, on a millimetre of phase.
  //
  // Fix: if a domino already exists within one gap of where this stroke starts, offset the
  // walk so the new stroke's FIRST domino lands a full gap from it. One nearestDomino()
  // call per stroke, none per domino, and only for the child's own strokes (`avoid`) so
  // challenge layouts are still built to the letter.
  let s0 = 0;
  if (avoid) {
    const near = nearestDomino(L, _sx[0], _sz[0], gap);
    if (near) s0 = Math.max(0, gap - Math.hypot(near.x - _sx[0], near.z - _sz[0]));
  }

  let placed = 0, hitBudget = false;
  let seg = 1;
  for (let s = s0; s <= total + 1e-9; s += gap) {
    if (placed >= budget) { hitBudget = true; break; }
    while (seg < _sn - 1 && _cum[seg] < s) seg++;
    const s0 = _cum[seg - 1], s1 = _cum[seg];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const x = _sx[seg - 1] + (_sx[seg] - _sx[seg - 1]) * f;
    const z = _sz[seg - 1] + (_sz[seg] - _sz[seg - 1]) * f;
    let dx = _sx[seg] - _sx[seg - 1], dz = _sz[seg] - _sz[seg - 1];
    if (dx === 0 && dz === 0) { dx = 0; dz = 1; }
    // A domino's thin axis is local Z, so aligning local +Z with the stroke direction
    // is what makes it topple FORWARD along the run.
    const r = Math.atan2(dx, dz);
    const res = tryPlace(L, x, z, r, out, colour, curved, avoid);
    if (res) placed++;
  }
  return { placed, curved, hitBudget };
}

/**
 * Emit one placement into `out`. If `out.pool` exists the placement objects are
 * REUSED, which matters because the ghost preview re-runs the whole stroke on every
 * pointermove: without the pool a long drag allocates a few hundred short-lived
 * objects per frame and the GC pause shows up as a stutter mid-stroke. The committed
 * stroke passes a plain array and gets real, keepable objects.
 */
function emit(out, x, z, y, r, c, cv) {
  const n = out.length;
  if (out.pool) {
    let o = out.pool[n];
    if (!o) o = out.pool[n] = { x: 0, z: 0, y: 0, r: 0, c: 0, cv: 0 };
    o.x = x; o.z = z; o.y = y; o.r = r; o.c = c; o.cv = cv;
    out[n] = o;
    out.length = n + 1;
  } else {
    out.push({ x, z, y, r, c, cv });
  }
}

/** An output array whose placement objects are recycled. For previews only. */
export function pooledOut() {
  const a = [];
  a.pool = [];
  return a;
}

function tryPlace(L, x, z, r, out, colour, curved, avoid) {
  if (!onTable(L, x, z)) return false;
  // surfaceAt FIRST: which surface we land on decides how high we are, and how high we
  // are decides whether a blocker is in the way at all.
  const surf = surfaceAt(x, z);
  if (!surf) return false;
  if (isBlocked(x, z, surf.y)) return false;
  if (avoid) {
    const gap = gapOf(L) * 0.6, g2 = gap * gap;
    for (let i = 0; i < L.dominoes.length; i++) {
      const d = L.dominoes[i];
      if (Math.abs(d.y - surf.y) > DOM_H * 0.5) continue;
      const ddx = d.x - x, ddz = d.z - z;
      if (ddx * ddx + ddz * ddz < g2) return false;
    }
    for (let i = 0; i < out.length; i++) {
      const d = out[i];
      if (Math.abs(d.y - surf.y) > DOM_H * 0.5) continue;
      const ddx = d.x - x, ddz = d.z - z;
      if (ddx * ddx + ddz * ddz < g2) return false;
    }
  }
  emit(out, x, z, surf.y, r, colour, curved ? 1 : 0);
  return true;
}

export function placeOne(L, x, z, r, out, budget, colour, avoid) {
  if (budget <= 0) return { placed: 0, curved: false, hitBudget: true };
  const ok = tryPlace(L, x, z, r, out, colour, false, avoid);
  return { placed: ok ? 1 : 0, curved: false, hitBudget: false };
}

// --- mutation (only ever called from history.js commands) -----------------
export function addDominoes(L, list) {
  for (const d of list) {
    if (d.id === undefined) d.id = L.nextId++;
    L.dominoes.push(d);
  }
  if (L.startId === null && L.dominoes.length) L.startId = L.dominoes[0].id;
}
export function addItem(L, it) {
  if (it.id === undefined) it.id = L.nextId++;
  L.items.push(it);
  rebuildSurfaces(L);
}

/** Remove by id. Returns removed entries WITH their index so undo can restore order. */
export function removeByIds(L, dominoIds, itemIds) {
  const rd = [], ri = [];
  if (dominoIds && dominoIds.length) {
    const set = new Set(dominoIds);
    for (let i = L.dominoes.length - 1; i >= 0; i--) {
      if (set.has(L.dominoes[i].id)) { rd.push({ i, d: L.dominoes[i] }); L.dominoes.splice(i, 1); }
    }
  }
  if (itemIds && itemIds.length) {
    const set = new Set(itemIds);
    for (let i = L.items.length - 1; i >= 0; i--) {
      if (set.has(L.items[i].id)) { ri.push({ i, d: L.items[i] }); L.items.splice(i, 1); }
    }
  }
  if (ri.length) rebuildSurfaces(L);
  if (L.startId !== null && !L.dominoes.some(d => d.id === L.startId)) {
    L.startId = L.dominoes.length ? L.dominoes[0].id : null;
  }
  return { rd, ri };
}

/** Put back what removeByIds took out, at the same indices. */
export function restore(L, rd, ri, startId) {
  for (let k = rd.length - 1; k >= 0; k--) L.dominoes.splice(rd[k].i, 0, rd[k].d);
  for (let k = ri.length - 1; k >= 0; k--) L.items.splice(ri[k].i, 0, ri[k].d);
  if (ri.length) rebuildSurfaces(L);
  L.startId = startId;
}

export function dominoById(L, id) {
  for (const d of L.dominoes) if (d.id === id) return d;
  return null;
}

export function itemById(L, id) {
  for (const it of L.items) if (it.id === id) return it;
  return null;
}

/** Nearest domino to (x,z) within `r`, ignoring height. */
export function nearestDomino(L, x, z, r) {
  let best = null, bd = r * r;
  for (const d of L.dominoes) {
    const dx = d.x - x, dz = d.z - z;
    const s = dx * dx + dz * dz;
    if (s < bd) { bd = s; best = d; }
  }
  return best;
}
export function nearestItem(L, x, z, r) {
  let best = null, bd = r * r;
  for (const it of L.items) {
    if (it.locked) continue;
    const dx = it.x - x, dz = it.z - z;
    const s = dx * dx + dz * dz;
    if (s < bd) { bd = s; best = it; }
  }
  return best;
}

// --- serialisation --------------------------------------------------------
// Compact and rounded to 0.1 mm: a 300-domino creation is ~9 KB of JSON, and
// localStorage is shared with 64 other games.
const r4 = (v) => Math.round(v * 10000) / 10000;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function serialise(L) {
  return {
    v: 1,
    tb: L.table, sf: L.surface, sp: L.spacing, sk: L.skin,
    // The start is stored as an INDEX, not an id: ids are re-issued on load, so an
    // id would silently point at the wrong domino (or nothing).
    st: L.dominoes.findIndex(d => d.id === L.startId),
    ch: L.challenge || null,
    d: L.dominoes.map(d => [r4(d.x), r4(d.z), r4(d.y), r3(d.r), d.c | 0, d.cv ? 1 : 0]),
    i: L.items.map(it => [it.type, r4(it.x), r4(it.z), r3(it.r), it.locked ? 1 : 0]),
  };
}

export function deserialise(o) {
  const L = freshLayout(o.tb, o.sf, o.sp, o.sk);
  L.challenge = o.ch || null;
  for (const a of o.i || []) {
    if (!ITEMS[a[0]]) continue;
    L.items.push({ id: L.nextId++, type: a[0], x: a[1], z: a[2], r: a[3], locked: !!a[4] });
  }
  for (const a of o.d || []) {
    L.dominoes.push({ id: L.nextId++, x: a[0], z: a[1], y: a[2], r: a[3], c: a[4] | 0, cv: a[5] ? 1 : 0 });
  }
  const si = typeof o.st === 'number' ? o.st : 0;
  L.startId = L.dominoes[si] ? L.dominoes[si].id
    : (L.dominoes.length ? L.dominoes[0].id : null);
  rebuildSurfaces(L);
  return L;
}
