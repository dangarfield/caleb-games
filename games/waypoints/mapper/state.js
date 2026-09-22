// Waypoints — map document model, undo stack and persistence.
import { GRID } from './palette.js';
import { blankBoard, blankPlay } from './board.js';
import { blankCard, blankCardPlay } from './card.js';

export const SCHEMA = 'waypoints.map/2';
// /1 stored a waypoint's position as the CENTRE of its symbol, with the ring
// drawn below. /2 stores the ring, because the ring is where the walker stands.
const STORE_KEY = 'calebArcadeData:waypoints-mapper';

export const LAYERS = ['contours', 'rivers', 'lakes', 'woodland', 'bridges', 'waypoints', 'decor', 'places'];

export function blankMap(id = 'map-01', name = 'Whistling Water National Park') {
  return {
    schema: SCHEMA, id, name,
    grid: { cols: GRID.cols, rows: GRID.rows },
    world: {
      // One grid square on the ground, measured off the printed scale bar: it
      // spans 298 px against a 300 px grid square, so a square is 5 km. It was
      // 2500 by guess, which made every mountain twice as steep as it should be
      // and the whole park read as a model rather than a landscape.
      metresPerCell: 5000,
      contourInterval: 100,     // metres between contour rings
      baseElevation: 100,       // elevation of level 0
      verticalExaggeration: 3,  // per-map, tunable
      waterDepth: 25,           // how far lakes cut below their shore
      baseRun: 1,               // run from the first contour down to base, x the map's own spacing
      riverDepth: 22,           // how far the bed sits below the water surface
      riverBank: 14,            // how far the bank stands above it
      decorDensity: 1,          // scales how many plants every decoration scatters
      forestDensity: 1,         // scales how thickly a woodland polygon is planted
      smoothing: 1,
      // --- scale. Everything here is a multiplier on a real-world size, so the
      // defaults are the sizes things actually are and a knob is a deliberate lie.
      sceneryScale: 1,          // trees and bushes, sized by height
      coverScale: 1,            // grass, plants, stones — sized across, not up
      coverDensity: 1.8,        // how thickly open ground is planted
      // From across a 30 km park a 25 m pine is a third of a pixel, so the orbit
      // view oversizes its scenery. The exaggeration falls away to 1 as you zoom
      // in, which is what makes the close view a scale check rather than a toy.
      orbitBoost: 8,
      figureHeight: 1.8,        // the hiker, in metres
      figureScale: 1,           // …times this, for when you want to find him
    },
    underlay: { src: '', opacity: 0.6, x: 0, y: 0, w: GRID.cols, h: GRID.rows, visible: true },
    // The printed sheet around the map. Drawn from the spec in board.js, not
    // from a photo: the weather track is what a turn is rolled on, so it has to
    // be data you can play and edit rather than pixels.
    board: blankBoard(),
    card: blankCard(),
    play: { ...blankPlay(), card: blankCardPlay() },
    contours: [], rivers: [], lakes: [], woodland: [], bridges: [], waypoints: [], decor: [], places: [],
    weather: { hikes: [] },
  };
}

let seq = 0;
export const uid = (p) => `${p}${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`;

// ---------------------------------------------------------------- document
export class Doc {
  /** `persist` false gives a throwaway document: no autosave, no restore. */
  constructor(map, persist = true) {
    this.persist = persist;
    this.map = map || blankMap();
    this.undoStack = []; this.redoStack = [];
    this.listeners = new Set();
    this.dirty = false;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what = 'change') { this.listeners.forEach((f) => f(what, this.map)); }

  snapshot() { return JSON.stringify(this.map); }
  commit(label = 'edit') {
    this.undoStack.push({ label, json: this._pre ?? this.snapshot() });
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
    this._pre = null; this.dirty = true;
    this.save(); this.emit();
  }
  begin() { this._pre = this.snapshot(); }
  /** begin + mutate + commit in one go */
  edit(label, fn) { this.begin(); const r = fn(this.map); this.commit(label); return r; }

  undo() { this._shift(this.undoStack, this.redoStack); }
  redo() { this._shift(this.redoStack, this.undoStack); }
  _shift(from, to) {
    if (!from.length) return;
    const e = from.pop();
    to.push({ label: e.label, json: this.snapshot() });
    this.map = JSON.parse(e.json);
    this.save(); this.emit('history');
  }

  save() {
    if (!this.persist) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ map: this.map, at: Date.now() })); }
    catch (e) { console.warn('autosave failed', e); }
  }
  static restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.map || !/^waypoints\.map\//.test(d.map.schema || '')) return null;
      // A map saved before a layer existed has no array for it. Migrate on the
      // way in, not only on file-open, or every later layer breaks the restore.
      return migrate(d.map);
    } catch { return null; }
  }

  load(map) {
    this.begin();
    this.map = migrate(map);
    this.commit('load');
    this.undoStack.length = 0; this.redoStack.length = 0;
    this.emit('load');
  }
}

export function migrate(m) {
  const base = blankMap(m.id || 'map-01', m.name || '');
  // Spreading `m` copies its ARRAYS BY REFERENCE, so the v1 waypoint shift below
  // was rewriting the caller's own object — load a file and the thing you parsed
  // had already been moved under you. The layers are cloned up front instead.
  const out = { ...base, ...m, grid: { ...base.grid, ...(m.grid || {}) },
    world: { ...base.world, ...(m.world || {}) },
    underlay: { ...base.underlay, ...(m.underlay || {}) },
    board: { ...base.board, ...(m.board || {}) },
    card: { ...base.card, ...(m.card || {}) },
    play: { ...base.play, ...(m.play || {}), card: { ...blankCardPlay(), ...((m.play || {}).card || {}) } } };
  // a board saved before the tracks existed, or one carrying the old photo
  // fields, gets the printed sheet back
  if (!out.board.tracks) out.board = { ...blankBoard(), visible: out.board.visible !== false };
  if (!Array.isArray(out.card.tracks)) out.card = blankCard();
  for (const k of LAYERS) {
    out[k] = Array.isArray(m[k]) ? m[k].map((sh) => ({ ...sh })) : [];   // never alias the input
  }

  // /1 -> /2: a waypoint's point was the symbol's centre and the ring hung below
  // it. Move each point down onto its own ring, so the stored position is the
  // ring and every symbol stays exactly where it was drawn over the photo.
  if (!m.schema || m.schema === 'waypoints.map/1') {
    for (const wp of out.waypoints) {
      const drop = (wp.type === 'campsite' ? 0.17 : 0.15) * 0.78;
      wp.y = +(wp.y + drop).toFixed(4);
    }
  }
  out.schema = SCHEMA;
  // tracer output (pixels, `river`/`contours[].pts`) -> cell units
  if (Array.isArray(m.river) && !out.rivers.length) {
    const c = (m.grid && m.grid.cell) || 300;
    out.rivers = m.river.map((pts) => ({ id: uid('r'), width: 0.05, pts: pts.map(([x, y]) => [x / c, y / c]) }));
  }
  return out;
}

// ---------------------------------------------------------------- the sheet
// The printed sheet's extent. Set once from the map; geometry uses it to keep
// curves inside the paper and to treat a point on the border as a hard corner.
let SHEET = { cols: GRID.cols, rows: GRID.rows };
let SHEET_REV = 0;
export function setSheet(cols, rows) {
  if (SHEET.cols === cols && SHEET.rows === rows) return;
  SHEET = { cols, rows }; SHEET_REV++;
}
export const EDGE_EPS = 1e-4;
export function onSheetEdge(p) {
  return p[0] <= EDGE_EPS || p[1] <= EDGE_EPS ||
         p[0] >= SHEET.cols - EDGE_EPS || p[1] >= SHEET.rows - EDGE_EPS;
}
export const clampToSheet = (p) => [
  Math.max(0, Math.min(SHEET.cols, p[0])),
  Math.max(0, Math.min(SHEET.rows, p[1])),
];

// ---------------------------------------------------------------- resolved geometry
// Shapes store the points you clicked. Everything that consumes them — the
// canvas, the heightfield, the 3D preview — asks for the smoothed curve here,
// so the ink and the terrain can never disagree.
const _geom = new WeakMap();
export function touch(shape) { _geom.delete(shape); }

/**
 * The drawn curve for a shape.
 *
 * `smoothing` (0..1) is per-shape: 0 draws straight segments between the points
 * you clicked, 1 curves through them as a full Catmull-Rom spline. The curve
 * always passes through every point, so rounding a contour never moves it,
 * shrinks it, or lifts an edge-anchored end off the sheet border.
 */
export function resolvePts(shape) {
  if (!shape || !shape.pts) return [];
  const sm = clamp01(shape.smoothing == null ? DEFAULT_SMOOTHING : shape.smoothing);
  if (shape.pts.length < 3) return shape.pts;
  const hit = _geom.get(shape);
  if (hit && hit.n === shape.pts.length && hit.rev === (shape.rev | 0) &&
      hit.sm === sm && hit.cl === !!shape.closed && hit.sr === SHEET_REV) return hit.v;
  const v = sm <= 0.001
    ? (shape.closed ? shape.pts.concat([shape.pts[0]]) : shape.pts.map((p) => p.slice()))
    : cardinal(shape.pts, !!shape.closed, 1 - sm, 8);
  _geom.set(shape, { n: shape.pts.length, rev: shape.rev | 0, sm, cl: !!shape.closed, sr: SHEET_REV, v });
  return v;
}

export const DEFAULT_SMOOTHING = 0.6;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Ramer-Douglas-Peucker. Freehand strokes arrive with hundreds of points. */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1, fd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]).map((p) => p.slice());
}

// ---------------------------------------------------------------- geometry helpers
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyBounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

export function pointInPoly(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

export function nearestOnPolyline(pt, pts) {
  let best = null, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy || 1e-9;
    let t = ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / l2;
    t = Math.max(0, Math.min(1, t));
    const p = [a[0] + t * vx, a[1] + t * vy];
    const d = dist(p, pt);
    if (d < bd) { bd = d; best = { p, i, t, d }; }
  }
  return best;
}

/**
 * Cardinal spline through the control points.
 *
 * `tension` 0 gives a full Catmull-Rom curve (roundest); 1 zeroes the tangents
 * and you get straight segments between the same points. The curve always
 * passes through every point you clicked, so smoothing a contour rounds its
 * corners without moving it or shrinking it.
 */
export function cardinal(pts, closed = false, tension = 0, samples = 8) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const p = pts.map((q) => q.slice());
  if (closed && dist(p[0], p[p.length - 1]) < 1e-9) p.pop();
  const n = p.length, out = [];
  const at = (i) => p[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const c = 1 - Math.max(0, Math.min(1, tension));
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    // A point on the sheet border is a corner: the spans touching it stay
    // straight, so a contour meets the edge cleanly instead of bowing over it.
    if (onSheetEdge(p1) || onSheetEdge(p2)) { out.push(p1.slice()); continue; }
    const m1 = [(c * (p2[0] - p0[0])) / 2, (c * (p2[1] - p0[1])) / 2];
    const m2 = [(c * (p3[0] - p1[0])) / 2, (c * (p3[1] - p1[1])) / 2];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([
        h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0],
        h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1],
      ]);
    }
  }
  out.push((closed ? p[0] : p[n - 1]).slice());
  return out.map((q) => {
    const [x, y] = clampToSheet(q);
    return [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
  });
}

export const smoothPath = (pts, closed = false, samples = 8) => cardinal(pts, closed, 0, samples);


// ---------------------------------------------------------------- auto-level
/**
 * Assign contour levels from nesting depth. A ring inside another ring is one
 * step higher — unless the stack bottoms out in a lake and has no summit in it,
 * in which case it is a hollow and steps down. An assist, not an oracle: check
 * the result and fix with [ and ].
 */
export function autoLevelContours(map) {
  const rings = map.contours.filter((c) => c.closed && c.pts && c.pts.length > 2);
  const geo = new Map(rings.map((c) => [c, resolvePts(c)]));
  const centroid = (pts) => {
    let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  };
  const cen = new Map(rings.map((c) => [c, centroid(geo.get(c))]));
  const areaOf = (pts) => {
    let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return Math.abs(a / 2);
  };
  const area = new Map(rings.map((c) => [c, areaOf(geo.get(c))]));
  // o encloses c only if c sits inside it AND o is the bigger ring
  const encloses = (o, c) => o !== c && area.get(o) > area.get(c) && pointInPoly(cen.get(c), geo.get(o));
  let changed = 0;
  for (const c of rings) {
    const mine = geo.get(c);
    const depth = rings.reduce((n, o) => n + (encloses(o, c) ? 1 : 0), 0);
    const hasSummit = map.waypoints.some((w) => w.type === 'mountain' && pointInPoly([w.x, w.y], mine));
    const hasLake = map.lakes.some((l) => {
      const lp = resolvePts(l); return lp.length > 2 && pointInPoly(centroid(lp), mine);
    });
    const inner = !rings.some((o) => encloses(c, o));
    const hollow = hasLake && !hasSummit && inner;
    const lv = hollow ? Math.max(0, depth - 2) : depth;
    if (c.level !== lv) { c.level = lv; changed++; }
  }
  return { rings: rings.length, changed };
}

// ---------------------------------------------------------------- joining
/**
 * Weld a freshly drawn line onto any open line in the same layer whose loose
 * end it lands on. Contours only join at the same level (a level-less line
 * takes the level of what it joins). Returns the shape that survived.
 */
export function joinEnds(map, layer, shape, tol = 0.05) {
  const levelsMatch = (a, b) => layer !== 'contours' || a.level == null || b.level == null || a.level === b.level;
  let cur = shape;
  for (let pass = 0; pass < 2; pass++) {
    if (cur.closed) break;
    const list = map[layer].filter((o) => o !== cur && !o.closed && o.pts && o.pts.length > 1 && levelsMatch(o, cur));
    let best = null;
    for (const o of list) {
      const cands = [
        { d: dist(cur.pts[0], o.pts[o.pts.length - 1]), mine: 'start', theirs: 'end' },
        { d: dist(cur.pts[0], o.pts[0]), mine: 'start', theirs: 'start' },
        { d: dist(cur.pts[cur.pts.length - 1], o.pts[o.pts.length - 1]), mine: 'end', theirs: 'end' },
        { d: dist(cur.pts[cur.pts.length - 1], o.pts[0]), mine: 'end', theirs: 'start' },
      ];
      for (const c of cands) if (c.d < tol && (!best || c.d < best.d)) best = { ...c, other: o };
    }
    if (!best) break;
    const o = best.other;
    const mine = cur.pts.slice(), theirs = o.pts.slice();
    let merged;
    if (best.mine === 'end' && best.theirs === 'start') merged = mine.concat(theirs.slice(1));
    else if (best.mine === 'end' && best.theirs === 'end') merged = mine.concat(theirs.reverse().slice(1));
    else if (best.mine === 'start' && best.theirs === 'end') merged = theirs.concat(mine.slice(1));
    else merged = theirs.reverse().concat(mine.slice(1));
    o.pts = merged;
    o.rev = (o.rev | 0) + 1; touch(o);
    if (layer === 'contours' && o.level == null && cur.level != null) o.level = cur.level;
    if (cur.smoothing != null && o.smoothing == null) o.smoothing = cur.smoothing;
    map[layer] = map[layer].filter((x) => x !== cur);
    cur = o;
  }
  // ends met: it is a ring
  if (!cur.closed && cur.pts.length > 3 && dist(cur.pts[0], cur.pts[cur.pts.length - 1]) < tol) {
    cur.pts.pop(); cur.closed = true; cur.rev = (cur.rev | 0) + 1; touch(cur);
  }
  return cur;
}

/** Free ends of open shapes in a layer — what a new stroke can weld onto. */
export function openEnds(map, layer) {
  const out = [];
  for (const s of map[layer]) {
    if (s.closed || !s.pts || s.pts.length < 2) continue;
    out.push({ shape: s, p: s.pts[0] }, { shape: s, p: s.pts[s.pts.length - 1] });
  }
  return out;
}
