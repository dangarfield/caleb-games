/* paper.js — the cut-paper render kit.
 *
 * Everything on screen in Paper Storm is a flat shape cut out of coloured card
 * and laid on top of the shapes beneath it. That means three hard rules, and
 * the whole file follows from them:
 *
 *   1. MeshBasicMaterial only. There are no lights in the scene. A lit material
 *      would shade the inside of a shape, and paper doesn't do that.
 *   2. ShapeGeometry, never ExtrudeGeometry. The pieces have no thickness —
 *      depth is entirely z-order plus the shadow one piece throws on the next.
 *   3. Shadows are meshes, not shadow maps. Two copies of the same geometry,
 *      offset down-right at half opacity each, is a soft edge for the price of
 *      two extra draws and no render target. An iPad can hold sixty of these.
 *
 * Everything that looks random is seeded, so a level generated from seed 7
 * is the same level on every device and after every reload.
 */
import * as THREE from 'three';
import { SHADOW, RIM, RIM_WIDTH, ramp } from './palette.js';

/* ------------------------------------------------------------------ random */

/* mulberry32 — 32 bits of state, one multiply-xorshift round. Written out here
   rather than pulled in so the kit has no dependency beyond three itself. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------- polygons */

function v2(x, y) { return new THREE.Vector2(x, y); }

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

/* three does not brand Shape or Path with an `isShape`-style flag, so the kit
   sniffs for the one method it actually needs. Anything else is treated as a
   point list the caller already flattened. */
function isCurve(x) { return !!x && typeof x.getSpacedPoints === 'function'; }

/* Pull a flat, evenly spaced outline out of any THREE.Shape. Even spacing
   matters for insetShape: offsetting a polygon whose vertices bunch up in one
   corner produces spikes there. */
export function shapeOutline(shape, samples = 0) {
  if (!samples) {
    // Size the resampling from the shape itself: a coarse outline is where a
    // contour stack's faceting comes from, because every inset after it
    // inherits those vertices.
    const rough = shape.getSpacedPoints(24);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of rough) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    samples = densityFor(Math.max(maxX - minX, maxY - minY) * 0.5);
  }
  const pts = shape.getSpacedPoints(samples).map((p) => v2(p.x, p.y));
  // getSpacedPoints on a closed shape repeats the first point at the end.
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
  }
  return ensureCCW(pts);
}

/* Offset a closed CCW polygon inward by `amount` along each vertex's angle
   bisector, then throw away vertices that folded back on themselves. This is
   not a correct polygon offset — a true one needs the straight skeleton — but
   for the soft, convex-ish blobs this game draws it is indistinguishable, and
   it is a few hundred multiplies rather than a library. Returns null once the
   shape has eaten itself, which is how contourStack knows when to stop. */
function offsetPolygon(src, amount) {
  const n = src.length;
  if (n < 3) return null;
  const srcArea = Math.abs(signedArea(src));
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = src[i], prev = src[(i - 1 + n) % n], next = src[(i + 1) % n];
    const d1 = v2(p.x - prev.x, p.y - prev.y).normalize();
    const d2 = v2(next.x - p.x, next.y - p.y).normalize();
    // Inward normal of a CCW edge (dx,dy) is (-dy,dx).
    const n1 = v2(-d1.y, d1.x), n2 = v2(-d2.y, d2.x);
    const bis = v2(n1.x + n2.x, n1.y + n2.y);
    if (bis.lengthSq() < 1e-9) { out.push(v2(p.x, p.y)); continue; }
    bis.normalize();
    // Miter length, clamped so a near-cusp vertex doesn't shoot off to infinity.
    const cos = Math.max(0.25, bis.dot(n1));
    const k = amount / cos;
    out.push(v2(p.x + bis.x * k, p.y + bis.y * k));
  }
  // Fold cleanup: an edge that reversed direction means the offset overran it.
  const keep = [];
  for (let i = 0; i < n; i++) {
    const a = out[i], b = out[(i + 1) % n];
    const oa = src[i], ob = src[(i + 1) % n];
    const dot = (b.x - a.x) * (ob.x - oa.x) + (b.y - a.y) * (ob.y - oa.y);
    if (dot > 0) keep.push(a);
  }
  if (keep.length < 3) return null;
  const cleaned = ensureCCW(keep);

  // Growing outward can never eat the shape, so the exhaustion checks below
  // apply only to an inward offset — run on an outset they'd reject every
  // result, since a grown polygon is always larger than the one it came from.
  if (amount < 0) return cleaned;

  /* Three ways an offset is "finished", and all three have to be caught here
     or contourStack will happily stack a hundred identical specks. Dropping the
     folded vertices above can leave a small residue polygon that survives every
     further pass, so area alone is not enough: */
  const outArea = Math.abs(signedArea(cleaned));
  // 1. it stopped shrinking — the residue is chasing its own tail.
  if (outArea >= srcArea) return null;
  // 2. there is less area left than the next inset would remove.
  if (outArea < Math.max(1e-4, amount * amount)) return null;
  // 3. it got thinner than the offset in one axis, so the next pass inverts it.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of cleaned) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (maxX - minX < amount || maxY - minY < amount) return null;

  return cleaned;
}

/* Catmull-Rom through a point list, returning a denser one that passes exactly
 * through every input point.
 *
 * Interpolating, not approximating, and that is the whole reason it is this
 * and not Chaikin: terrain.js samples its own profile function and relies on
 * the drawn surface being the same line its collision reads. A subdividing
 * scheme that only approximates would pull the drawn wall a little inside the
 * line the player actually hits.
 */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return v2(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  );
}

export function smoothClosed(points, sub = 4) {
  const pts = points.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  const n = pts.length;
  if (n < 3 || sub < 2) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < sub; k++) out.push(catmull(p0, p1, p2, p3, k / sub));
  }
  return out;
}

export function smoothOpen(points, sub = 4) {
  const pts = points.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  const n = pts.length;
  if (n < 3 || sub < 2) return pts;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    // Ends are mirrored outward so the first and last spans curve like the
    // rest instead of running straight.
    const p0 = i === 0 ? v2(2 * pts[0].x - pts[1].x, 2 * pts[0].y - pts[1].y) : pts[i - 1];
    const p3 = i + 2 > n - 1 ? v2(2 * pts[n - 1].x - pts[n - 2].x, 2 * pts[n - 1].y - pts[n - 2].y) : pts[i + 2];
    for (let k = 0; k < sub; k++) out.push(catmull(p0, pts[i], pts[i + 1], p3, k / sub));
  }
  out.push(pts[n - 1]);
  return out;
}

/* Circular three-tap low-pass, with the spread it flattens put back.
 *
 * The filter is what stops two neighbouring lobes disagreeing sharply enough
 * to leave a corner in the silhouette. On its own it also flattens the blob
 * toward a circle — smooth, but not organic, which is the opposite failure —
 * so afterwards the deviations from the mean are rescaled to the range they
 * had before. What comes out is the same amount of variation, redistributed
 * so it changes gradually instead of abruptly. */
function lowPassRing(a, passes = 2) {
  const n = a.length;
  const mean = a.reduce((x, y) => x + y, 0) / n;
  const before = Math.max(...a) - Math.min(...a);
  for (let p = 0; p < passes; p++) {
    const b = a.slice();
    for (let i = 0; i < n; i++) a[i] = 0.25 * b[(i - 1 + n) % n] + 0.5 * b[i] + 0.25 * b[(i + 1) % n];
  }
  const after = Math.max(...a) - Math.min(...a);
  if (after > 1e-9 && before > 1e-9) {
    const k = before / after;
    for (let i = 0; i < n; i++) a[i] = mean + (a[i] - mean) * k;
  }
  return a;
}

/* How many points an outline of this size wants. Sized from the shape rather
   than fixed, because a hundred-unit backdrop sweep and a six-unit drone need
   very different densities to read as the same smooth line on screen. */
function densityFor(size, min = 64, max = 240) {
  /* Tuned against the sagitta — how far a chord sits from the curve it cuts.
     At this density a fifty-unit blob's chords are under a hundredth of a unit
     off the true curve, far below a pixel. The density is NOT what was making
     shapes look faceted; a coarse control polygon was, and the interpolation
     in smoothClosed/smoothOpen fixes that at its source. So this can stay
     modest, which keeps the triangle count roughly where it was. */
  return Math.max(min, Math.min(max, Math.round(size * 2.5)));
}

/* Build a THREE.Shape from a point list. `smooth` runs a quadratic through the
   edge midpoints using each original point as its control — the standard trick
   for turning a coarse polygon into a curve without adding vertices. */
export function polyShape(points, { smooth = false, closed = true } = {}) {
  const pts = points.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  const s = new THREE.Shape();
  const n = pts.length;
  if (n < 2) return s;
  if (!smooth) {
    s.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) s.lineTo(pts[i].x, pts[i].y);
    if (closed) s.closePath();
    return s;
  }
  const mid = (a, b) => v2((a.x + b.x) / 2, (a.y + b.y) / 2);
  const m0 = mid(pts[n - 1], pts[0]);
  s.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const m = mid(pts[i], pts[(i + 1) % n]);
    s.quadraticCurveTo(c.x, c.y, m.x, m.y);
  }
  s.closePath();
  return s;
}

/* ----------------------------------------------------------------- shapes */

/* A closed organic blob. Deterministic for a given seed — same seed, same
 * silhouette, forever.
 *
 * Three things keep the outline flowing rather than lumpy, and all three
 * matter: FEWER control points than you would expect (a handful of broad lobes
 * reads as organic; a dozen reads as noise), the radii LOW-PASSED before the
 * curve is built so neighbouring lobes cannot disagree sharply enough to leave
 * a corner, and then a lot of INTERPOLATION between them — the returned
 * outline is hundreds of points, sized from the blob's radius, so the
 * silhouette is one flowing line at any size it is drawn.
 *
 * `squash` flattens the lower half (a blob sitting on the ground); `aspect`
 * stretches it horizontally.
 */
export function blobShape({ radius = 10, points = 7, wobble = 0.35, seed = 1, aspect = 1, squash = 0, resolution = 0 } = {}) {
  const rnd = mulberry32(seed);
  const n = Math.max(5, Math.round(points));
  const r = [];
  for (let i = 0; i < n; i++) r.push(radius * (1 - wobble * 0.5 + rnd() * wobble));
  lowPassRing(r, 2);

  const ctrl = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctrl.push(v2(Math.cos(a) * r[i] * aspect, Math.sin(a) * r[i]));
  }

  const target = resolution || densityFor(radius * Math.max(1, aspect));
  const dense = smoothClosed(ctrl, Math.max(4, Math.ceil(target / n)));
  if (squash > 0) for (const p of dense) if (p.y < 0) p.y *= 1 - squash;
  return polyShape(dense);
}

/* Minimal SVG path parser: M L H V C S Q T Z, absolute and relative. Arcs are
   not supported — none of the art needs them, and approximating them would
   cost more code than redrawing the one shape that wanted one as beziers.
   SVG's y axis points down and three's points up, so the result is flipped. */
export function pathShape(d, { size = 10, center = true } = {}) {
  const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const raw = [];                       // subpath point lists, y still SVG-down
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', pcx = 0, pcy = 0;
  let i = 0;
  const num = () => parseFloat(toks[i++]);
  const open = () => { cur = []; raw.push(cur); };
  const push = (x, y) => { if (!cur) open(); cur.push(v2(x, y)); };
  // Flatten curves at a fixed step; 16 is smooth at any size the game uses.
  const cubic = (x1, y1, x2, y2, x, y) => {
    const ax = cx, ay = cy;
    for (let s = 1; s <= 16; s++) {
      const t = s / 16, m = 1 - t;
      push(m * m * m * ax + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x,
           m * m * m * ay + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y);
    }
    pcx = x2; pcy = y2; cx = x; cy = y;
  };
  const quad = (x1, y1, x, y) => {
    const ax = cx, ay = cy;
    for (let s = 1; s <= 16; s++) {
      const t = s / 16, m = 1 - t;
      push(m * m * ax + 2 * m * t * x1 + t * t * x, m * m * ay + 2 * m * t * y1 + t * t * y);
    }
    pcx = x1; pcy = y1; cx = x; cy = y;
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'M') {
      cx = num() + ox; cy = num() + oy; sx = cx; sy = cy; open(); push(cx, cy);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') { cx = num() + ox; cy = num() + oy; push(cx, cy); }
    else if (C === 'H') { cx = num() + ox; push(cx, cy); }
    else if (C === 'V') { cy = num() + oy; push(cx, cy); }
    else if (C === 'C') {
      const a = num() + ox, b = num() + oy, c = num() + ox, dd = num() + oy;
      cubic(a, b, c, dd, num() + ox, num() + oy);
    } else if (C === 'S') {
      const a = 2 * cx - pcx, b = 2 * cy - pcy, c = num() + ox, dd = num() + oy;
      cubic(a, b, c, dd, num() + ox, num() + oy);
    } else if (C === 'Q') {
      const a = num() + ox, b = num() + oy;
      quad(a, b, num() + ox, num() + oy);
    } else if (C === 'T') {
      quad(2 * cx - pcx, 2 * cy - pcy, num() + ox, num() + oy);
    } else if (C === 'Z') { cx = sx; cy = sy; }
    else { i++; }                        // unknown command: skip a token, limp on
  }
  const pts = (raw.sort((a, b) => b.length - a.length)[0] || []).slice();
  if (!pts.length) return new THREE.Shape();
  // SVG y-down -> three y-up.
  for (const p of pts) p.y = -p.y;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const k = size / span;
  const mx = center ? (minX + maxX) / 2 : 0, my = center ? (minY + maxY) / 2 : 0;
  for (const p of pts) { p.x = (p.x - mx) * k; p.y = (p.y - my) * k; }
  return polyShape(pts);
}

/* An arrow/dart hull pointing along +x — the base of every ship in the game.
   `sweep` is how far the notch between the tail fins cuts forward, 0..1. */
export function wedgeShape({ len = 20, tail = 7, nose = 2.2, sweep = 0.45 } = {}) {
  const hx = len * 0.5;
  const s = new THREE.Shape();
  s.moveTo(hx, 0);
  s.quadraticCurveTo(hx * 0.2, nose, -hx * 0.5, tail * 0.92);   // upper leading edge
  s.lineTo(-hx, tail);                                          // upper tail fin
  s.quadraticCurveTo(-hx + sweep * len * 0.5, 0, -hx, -tail);   // swept notch
  s.lineTo(-hx * 0.5, -tail * 0.92);
  s.quadraticCurveTo(hx * 0.2, -nose, hx, 0);                   // lower leading edge
  s.closePath();
  return s;
}

/* A clean arrowhead pointing along +x — the player's silhouette.
 *
 * wedgeShape has a notch cut between its tail fins, which at a glance reads as
 * a tail fin rather than as a nose, and the whole ship then reads as a fish
 * swimming left. This has no notch: one sharp nose, two hard swept leading
 * edges out to the wingtips, trailing edges raked back in, one straight cut
 * across the tail. Squinted at, it says fighter.
 *
 *   len   nose-to-tail
 *   span  wingtip to wingtip
 *   tail  width of the straight back edge
 *   sweep how far back the wingtips sit, 0..1 of len
 */
export function dartShape({ len = 9, span = 7.5, tail = 2.4, sweep = 0.62, belly = 0.22 } = {}) {
  const hx = len * 0.5, hs = span * 0.5, ht = tail * 0.5;
  const wingX = hx - len * sweep;
  const s = new THREE.Shape();
  s.moveTo(hx, 0);
  // leading edge: bowed very slightly outward so the nose isn't a needle
  s.quadraticCurveTo(hx - len * sweep * 0.42, hs * belly, wingX, hs);
  s.lineTo(wingX - len * 0.06, hs * 0.92);            // squared-off wingtip
  s.lineTo(-hx, ht);                                   // raked trailing edge
  s.lineTo(-hx, -ht);                                  // straight tail cut
  s.lineTo(wingX - len * 0.06, -hs * 0.92);
  s.lineTo(wingX, -hs);
  s.quadraticCurveTo(hx - len * sweep * 0.42, -hs * belly, hx, 0);
  s.closePath();
  return s;
}

export function roundRectShape(w, h, r = 2) {
  const hw = w / 2, hh = h / 2;
  const k = Math.min(r, hw, hh);
  const s = new THREE.Shape();
  s.moveTo(-hw + k, -hh);
  s.lineTo(hw - k, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + k);
  s.lineTo(hw, hh - k);  s.quadraticCurveTo(hw, hh, hw - k, hh);
  s.lineTo(-hw + k, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - k);
  s.lineTo(-hw, -hh + k); s.quadraticCurveTo(-hw, -hh, -hw + k, -hh);
  s.closePath();
  return s;
}

/* Shrink a shape toward its own interior. This is the move the whole look is
   built on: the reference image's nested rings are one outline inset over and
   over. Returns null when there is nothing left to shrink. */
export function insetShape(shape, amount, samples = 0) {
  const src = isCurve(shape) ? shapeOutline(shape, samples) : ensureCCW(shape);
  const out = offsetPolygon(src, amount);
  if (!out) return null;
  /* Offsetting moves every vertex along its own bisector, so wherever the
     source outline had even a slight kink the offset has a sharper one — and a
     contour stack insets six or nine times, compounding it. One low-pass pass
     per inset keeps the inner bands as smooth as the outline they came from. */
  const n = out.length;
  const sm = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = out[(i - 1 + n) % n], b = out[i], c = out[(i + 1) % n];
    sm[i] = v2(0.25 * a.x + 0.5 * b.x + 0.25 * c.x, 0.25 * a.y + 0.5 * b.y + 0.25 * c.y);
  }
  return polyShape(sm);
}

/* Grow a shape outward — the inverse of insetShape, and the thing an actor's
   rim is cut from. Never returns null: an outset cannot run out of shape. */
export function outsetShape(shape, amount, samples = 0) {
  const src = isCurve(shape) ? shapeOutline(shape, samples) : ensureCCW(shape);
  const out = offsetPolygon(src, -amount);
  return out ? polyShape(out) : null;
}

/* One near-white sheet of card cut a little larger than `shape` and laid under
   it. Everything in the play plane gets one; nothing behind it does. */
export function rimPiece(shape, { rim = RIM_WIDTH, color = RIM, z = 0, shadow = true, shadowScale = 1, opacity = 1, curveSegments = 0, samples = 0, shadowSteps = 2 } = {}) {
  const r = outsetShape(shape, rim, samples);
  if (!r) return null;
  return paperPiece(r, color, { z, shadow, shadowScale, opacity, curveSegments, shadowSteps });
}

/* An annulus: the outline, with its own inset as a hole. */
export function ringShape(outerShape, thickness) {
  const outer = isCurve(outerShape) ? shapeOutline(outerShape) : ensureCCW(outerShape);
  const s = polyShape(outer);
  const inner = offsetPolygon(outer, thickness);
  if (inner && inner.length > 2) {
    const h = new THREE.Path();
    const rev = inner.slice().reverse();   // holes wind opposite the outline
    h.moveTo(rev[0].x, rev[0].y);
    for (let i = 1; i < rev.length; i++) h.lineTo(rev[i].x, rev[i].y);
    h.closePath();
    s.holes.push(h);
  }
  return s;
}

/* A spiked disc — mines, sea urchins, boss crowns. `sharp` 0..1 moves the
   valley control points outward, which blunts the spikes into petals. */
export function spikedShape({ radius = 8, spikes = 9, depth = 0.42, sharp = 0.7, seed = 1 } = {}) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const b = ((i + 0.5) / spikes) * Math.PI * 2;
    const rOut = radius * (0.9 + rnd() * 0.2);
    const rIn = radius * (1 - depth);
    pts.push(v2(Math.cos(a) * rOut, Math.sin(a) * rOut));
    const kb = rIn * (0.85 + sharp * 0.3);
    pts.push(v2(Math.cos(b) * kb, Math.sin(b) * kb));
  }
  /* Smoothed. The spikes are meaning — this is the thing that hurts you — so
     they stay, but as curves: straight-sided triangles are the one silhouette
     on screen that reads as a rendering artefact rather than as cut paper. */
  return polyShape(smoothClosed(pts, 6));
}

/* A teardrop pointing along +y — jellyfish bells, engine flames, canopies.
   `bulge` moves the widest part toward the round end. */
export function teardropShape({ len = 14, width = 9, bulge = 0.55 } = {}) {
  const hw = width / 2, top = len * 0.5, bot = -len * 0.5;
  const wy = bot + len * bulge;
  const s = new THREE.Shape();
  s.moveTo(0, top);
  s.bezierCurveTo(hw * 0.55, top - len * 0.08, hw, wy + len * 0.18, hw, wy);
  s.bezierCurveTo(hw, bot + len * 0.1, hw * 0.55, bot, 0, bot);
  s.bezierCurveTo(-hw * 0.55, bot, -hw, bot + len * 0.1, -hw, wy);
  s.bezierCurveTo(-hw, wy + len * 0.18, -hw * 0.55, top - len * 0.08, 0, top);
  s.closePath();
  return s;
}

/* A band swept between two angles — turret mouths, boss shoulder plates, and
   the half-rings that crowd the corners of the reference image. `taper`
   thins the band toward its ends so it reads as a cut strip, not a pipe. */
export function arcBandShape({ r = 12, thickness = 3, a0 = 0, a1 = Math.PI, taper = 0.5, steps = 40 } = {}) {
  const outer = [], inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const ends = Math.sin(Math.PI * t);             // 0 at both ends, 1 in the middle
    const th = thickness * (1 - taper + taper * ends);
    outer.push(v2(Math.cos(a) * (r + th * 0.5), Math.sin(a) * (r + th * 0.5)));
    inner.push(v2(Math.cos(a) * (r - th * 0.5), Math.sin(a) * (r - th * 0.5)));
  }
  return polyShape(outer.concat(inner.reverse()));
}

/* A constant-or-tapering strip along a polyline — tentacles, chain links,
   cables. `width` may be a number or a function of t (0..1 along the line). */
export function ribbonShape(points, width = 3) {
  const pts = points.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  const n = pts.length;
  if (n < 2) return new THREE.Shape();
  const w = typeof width === 'function' ? width : () => width;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = v2(b.x - a.x, b.y - a.y).normalize();
    const nrm = v2(-d.y, d.x);
    const h = w(i / (n - 1)) * 0.5;
    left.push(v2(pts[i].x + nrm.x * h, pts[i].y + nrm.y * h));
    right.push(v2(pts[i].x - nrm.x * h, pts[i].y - nrm.y * h));
  }
  return polyShape(left.concat(right.reverse()), { smooth: false });
}

/* ------------------------------------------------------------- the pieces */

/* Segments per curve, from the shape's on-screen size. */
function autoSegments(shape) {
  const curves = (shape.curves && shape.curves.length) || 1;
  const rough = shape.getSpacedPoints(24);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rough) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const size = Math.max(maxX - minX, maxY - minY);
  return Math.max(6, Math.min(64, Math.ceil(densityFor(size * 0.5) / curves)));
}

function basicMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity,
    side: THREE.DoubleSide, depthWrite: opacity >= 1,
  });
}

/* ONE flat cut-paper piece: the filled shape, plus the shadow it throws on
   whatever is behind it.
 *
 * The shadow is two copies of the same geometry at 1x and 2x the offset, each
 * at half the configured opacity. Where they overlap they sum back to full
 * opacity, and the 1x-only band around the edge is half — a two-step gradient
 * that reads as a soft edge from any sensible distance and costs nothing. The
 * copies share the fill's geometry, so a piece is one geometry and three
 * materials however dark its shadow is.
 */
export function paperPiece(shape, color, { z = 0, shadow = true, shadowScale = 1, opacity = 1, curveSegments = 0, shadowSteps = 2 } = {}) {
  /* Tessellation from the shape's own size rather than a flat number. three's
     default of twelve segments per curve turns a big blob into a visible
     polygon while being far more than a six-unit drone needs. Shapes are built
     once and merged, so this is a load-time cost and not a per-frame one. */
  const geo = new THREE.ShapeGeometry(shape, curveSegments || autoSegments(shape));
  const g = new THREE.Group();
  const shadows = [];
  if (shadow) {
    for (let i = 1; i <= shadowSteps; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: SHADOW.color, transparent: true,
        opacity: SHADOW.opacity * (1 / shadowSteps) * opacity, depthWrite: false,
        side: THREE.DoubleSide,
      }));
      m.position.set(SHADOW.dx * shadowScale * i, SHADOW.dy * shadowScale * i, z - 0.01 - i * 0.002);
      m.scale.setScalar(1 + 0.01 * i);   // a hair larger, so it never peeks inside the fill
      m.renderOrder = -1;
      g.add(m);
      shadows.push(m);
    }
  }
  const fill = new THREE.Mesh(geo, basicMat(color, opacity));
  fill.position.z = z;
  g.add(fill);
  g.userData.fill = fill;
  g.userData.shadows = shadows;
  g.userData.geometry = geo;
  g.userData.shape = shape;
  return g;
}

/* Recolour a piece in place — the gameplay layer uses this for hit flashes. */
export function setPieceColor(piece, color) {
  const f = piece.userData && piece.userData.fill;
  if (f) f.material.color.set(color);
}

/* A stack of concentric rings cut from one outline. This is the reference
 * image's core move and most of the art in the game is some version of it:
 * take a silhouette, inset it repeatedly, step along the ramp as you go, and
 * give every layer its own shadow so the stack reads as a pile of card.
 *
 * Every band gets its own shadow, the outermost one included — it is throwing
 * that shadow onto whatever is behind the stack, and leaving it off is what
 * makes a stack look pasted on rather than laid on.
 *
 * Pass `rim` for anything in the play plane: it adds one more sheet under the
 * whole silhouette, cut `rim` units larger and in near-white, which is what
 * keeps a small actor legible against a field of contours.
 *
 * Stops early and quietly when the inset runs out of shape, so callers can ask
 * for more layers than a small outline can hold without checking first.
 */
export function contourStack(shape, {
  layers = 6, insetStep = 1.2, rampName = 'STAGE1', t0 = 0, t1 = 1,
  z = 0, dz = 0.06, shadow = true, shadowScale = 1, opacity = 1, samples = 0,
  curveSegments = 0, rim = 0, rimColor = RIM, shadowSteps = 2,
} = {}) {
  const g = new THREE.Group();
  const pieces = [];
  /* The rim goes on first and sits one step behind the stack, so it shows as a
     thin bright edge all the way round and catches the first band's shadow the
     way an actual bottom sheet would. */
  if (rim > 0) {
    const rp = rimPiece(shape, { rim, color: rimColor, z: z - dz, shadow, shadowScale, opacity, curveSegments, samples, shadowSteps });
    if (rp) { g.add(rp); pieces.push(rp); }
  }
  let cur = shape;
  for (let i = 0; i < layers; i++) {
    if (!cur) break;
    const t = layers === 1 ? t0 : t0 + (t1 - t0) * (i / (layers - 1));
    const p = paperPiece(cur, ramp(rampName, t), {
      z: z + i * dz, shadow, shadowScale, opacity, curveSegments, shadowSteps,
    });
    g.add(p);
    pieces.push(p);
    cur = insetShape(cur, insetStep, samples);
  }
  g.userData.pieces = pieces;
  g.userData.layers = pieces.length;
  return g;
}

/* A stack of parallel bands following a path — the long ribbons that sweep
 * right across the reference image, and the canyon walls.
 *
 * contourStack works inward from a closed outline, which gives nested rings.
 * This works sideways from an open line, which gives the other half of the
 * reference's vocabulary: bands of card running off both edges of the picture,
 * each one offset from the last, each shadowing the one below.
 *
 * The centre line is interpolated through the points given, not just joined up
 * — a caller sampling a curve every couple of units and getting straight
 * chords back is where most of the faceting on a terrain wall came from. The
 * curve passes exactly through every input point, so a caller whose collision
 * reads the same function it sampled still gets the line it drew.
 *
 * `bandWidth` may be a function (u, i) of position along the path and band
 * index, which is what stops a sweep reading as a stripe: real cut paper is
 * never a constant-width band. Widths accumulate per point, so the bands stay
 * stacked with no gaps however much they vary.
 *
 * Bands are offset along y rather than along the path normal. For the shallow
 * curves this is used for the difference is under a percent, and it guarantees
 * the bands stay parallel — a normal offset pinches them where the curve
 * tightens, and a pinched band is instantly visible as a mistake.
 */
export function ribbonStack(points, {
  bands = 10, bandWidth = 6, gap = 0, rampName = 'STAGE1', t0 = 0, t1 = 1,
  z = 0, dz = 0.05, shadow = true, direction = 1, opacity = 1,
  smooth = 4, shadowSteps = 2,
} = {}) {
  const raw = points.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  const centre = smooth > 1 ? smoothOpen(raw, smooth) : raw;
  const m = centre.length;
  const g = new THREE.Group();
  const pieces = [];
  const widthAt = typeof bandWidth === 'function' ? bandWidth : () => bandWidth;

  // Cumulative offset per point, so varying widths still stack flush.
  let lower = new Array(m).fill(0);
  for (let i = 0; i < bands; i++) {
    const upper = new Array(m);
    for (let j = 0; j < m; j++) {
      upper[j] = lower[j] + direction * (widthAt(j / (m - 1), i) + gap);
    }
    const poly = [];
    for (let j = 0; j < m; j++) poly.push(v2(centre[j].x, centre[j].y + lower[j]));
    for (let j = m - 1; j >= 0; j--) poly.push(v2(centre[j].x, centre[j].y + upper[j]));
    const t = bands === 1 ? t0 : t0 + (t1 - t0) * (i / (bands - 1));
    /* z steps WITH the stacking direction: band i has to sit in front of the
       band its own shadow lands on, and that is the previous band when you
       stack upward and the next one when you stack down. */
    const piece = paperPiece(polyShape(poly), ramp(rampName, t), {
      z: z + i * dz * direction, shadow, opacity, curveSegments: 1, shadowSteps,
    });
    g.add(piece);
    pieces.push(piece);
    lower = upper;
  }
  g.userData.pieces = pieces;
  g.userData.layers = pieces.length;
  g.userData.centre = centre;
  return g;
}

/* Scale an object to a target width and put its shadows back to world size.
   A gallery, a HUD icon or a pickup preview all want to show a thing at a size
   that suits the layout rather than the size it flies at; without the shadow
   correction a piece drawn at three times scale also throws a shadow three
   times as far, and the picture stops having one light in it. */
export function fitTo(obj, targetWidth) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.x > 1e-6)) return obj;
  const k = targetWidth / size.x;
  obj.scale.setScalar(k);
  setShadowScale(obj, 1 / k);
  return obj;
}

/* Rotate a group about z while keeping every shadow under it pointing
 * down-right.
 *
 * A flat piece of card turned in its own plane under a fixed light keeps its
 * shadow in the same DIRECTION — only the shadow's outline turns with it. A
 * plain `rotation.z` gives the opposite: the offset swings round too, and a
 * part flipped 180 degrees ends up lit from the bottom right. So the offsets
 * are counter-rotated here.
 *
 * This is for structural rotation applied once at build time. Rotation applied
 * per frame by gameplay — a ship banking, a turret tracking — is left to plain
 * `rotation.z`: doing it properly there costs a traversal every frame, and on
 * a small part swinging through a small angle the error stays under the shadow
 * offset itself.
 */
export function rotateKeepingLight(obj, angle) {
  obj.rotation.z = angle;
  const c = Math.cos(-angle), sn = Math.sin(-angle);
  obj.traverse((o) => {
    if (!o.userData || !o.userData.shadows) return;
    for (const sh of o.userData.shadows) {
      const x = sh.position.x, y = sh.position.y;
      sh.position.x = x * c - y * sn;
      sh.position.y = x * sn + y * c;
    }
  });
  return obj;
}

/* Rescale every shadow offset under an object. A group drawn at twice its
   authored size drags its shadows out to twice the offset with it, which
   breaks the one-light rule; scaling a display copy by k and calling this with
   1/k puts the shadows back where the rest of the picture has them. */
export function setShadowScale(obj, k) {
  obj.traverse((o) => {
    if (!o.userData || !o.userData.shadows) return;
    for (const sh of o.userData.shadows) { sh.position.x *= k; sh.position.y *= k; }
  });
  return obj;
}

/* A multi-part sprite — a ship, an enemy, a prop. parts are drawn in array
   order, each nudged in z by its own `dz` so the stacking is explicit rather
   than an accident of insertion order. */
export function paperSprite(parts, { z = 0 } = {}) {
  const g = new THREE.Group();
  const pieces = [];
  parts.forEach((part, i) => {
    if (!part || !part.shape) return;
    const dz = part.dz === undefined ? i * 0.08 : part.dz;
    const p = paperPiece(part.shape, part.color, {
      z: z + dz,
      shadow: part.shadow !== false,
      shadowScale: part.shadowScale === undefined ? 1 : part.shadowScale,
      opacity: part.opacity === undefined ? 1 : part.opacity,
    });
    if (part.offset) { p.position.x += part.offset[0]; p.position.y += part.offset[1]; }
    /* A part's own rotation and scale would drag its shadow round and out with
       it — a hull plate flipped 180 degrees would throw its shadow up-left, and
       a part at half scale would throw a half-length one. Both break the one
       light the whole picture shares, so the shadow offsets are counter-rotated
       and counter-scaled here and end up pointing down-right at the standard
       distance whatever the part is doing. (Rotation applied later, by gameplay
       — a ship banking — is left alone: that one is the object moving, not the
       light.) */
    if (part.rotation) {
      p.rotation.z = part.rotation;
      const c = Math.cos(-part.rotation), sn = Math.sin(-part.rotation);
      for (const sh of p.userData.shadows) {
        const x = sh.position.x, y = sh.position.y;
        sh.position.x = x * c - y * sn;
        sh.position.y = x * sn + y * c;
      }
    }
    if (part.scale) {
      p.scale.setScalar(part.scale);
      for (const sh of p.userData.shadows) {
        sh.position.x /= part.scale;
        sh.position.y /= part.scale;
      }
    }
    if (part.name) p.name = part.name, g.userData[part.name] = p;
    g.add(p);
    pieces.push(p);
  });
  g.userData.pieces = pieces;
  return g;
}

/* ------------------------------------------------------------------ merging */

/* Bake a list of meshes into one geometry, applying each mesh's own transform
   and (optionally) its material colour as vertex colours. */
function bakeMeshes(meshes, withColor, relativeTo) {
  /* Without `relativeTo` a mesh's own local matrix is enough, which is true for
     a contour stack whose piece groups all sit at the origin. A sprite offsets
     its pieces, so anything merging across one has to bake the full chain down
     from the ancestor it is merging into. */
  const inv = new THREE.Matrix4();
  if (relativeTo) { relativeTo.updateMatrixWorld(true); inv.copy(relativeTo.matrixWorld).invert(); }
  const mm = new THREE.Matrix4();
  let vTotal = 0, iTotal = 0;
  for (const m of meshes) {
    const g = m.geometry;
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const col = withColor ? new Float32Array(vTotal * 3) : null;
  const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    let mat;
    if (relativeTo) { m.updateWorldMatrix(true, false); mat = mm.multiplyMatrices(inv, m.matrixWorld); }
    else { m.updateMatrix(); mat = m.matrix; }
    const g = m.geometry;
    const p = g.attributes.position;
    const c = m.material.color;
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mat);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      if (col) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
    vo += p.count;
    io += g.index ? g.index.count : p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* Collapse a contourStack (or any group of paperPieces) into two meshes: every
 * shadow in one, every fill in the other, with the per-layer colours baked in
 * as vertex colours.
 *
 * A nine-layer stack is twenty-five draw calls unmerged and two merged, and a
 * backdrop is thirty of those stacks — the difference between an iPad holding
 * sixty frames and not. The trade is that the layers stop being individually
 * addressable, so this is for scenery (backdrop, terrain) and not for anything
 * that needs to flash when it is hit.
 *
 * It stays correct because merging changes nothing the renderer cares about:
 * the shadow pass is still one flat colour at one opacity with depth writes
 * off, the fills are still opaque and still carry their own z, so the depth
 * buffer resolves the stacking exactly as it did with separate meshes.
 */
export function mergeStack(group, { dispose = true } = {}) {
  const fills = [], shadows = [];
  group.traverse((o) => {
    if (!o.userData || !o.userData.fill) return;
    fills.push(o.userData.fill);
    for (const sh of o.userData.shadows) shadows.push(sh);
  });
  if (!fills.length) return group;

  const out = new THREE.Group();
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  out.scale.copy(group.scale);

  if (shadows.length) {
    const sg = bakeMeshes(shadows, false, group);
    const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: shadows[0].material.color.clone(), transparent: true,
      opacity: shadows[0].material.opacity, depthWrite: false, side: THREE.DoubleSide,
    }));
    sm.renderOrder = -1;
    out.add(sm);
    out.userData.shadowMesh = sm;
  }
  const fg = bakeMeshes(fills, true, group);
  const op = fills[0].material.opacity;
  const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide,
    transparent: op < 1, opacity: op, depthWrite: op >= 1,
  }));
  out.add(fm);
  out.userData.fillMesh = fm;
  out.userData.merged = true;

  const parent = group.parent;
  if (dispose) disposeObject(group);
  if (parent) parent.add(out);
  return out;
}

/* Collapse every shadow under an object into one mesh, leaving the fills
 * alone.
 *
 * mergeStack is for scenery: it merges fills too, which costs the ability to
 * recolour a band. An actor needs that ability (hit flashes, weak points going
 * hot), but it does not need thirty separate shadow draws — every shadow in
 * the game is the same flat colour at the same opacity, which is exactly the
 * condition for merging. A rimmed five-band enemy goes from eighteen draws to
 * seven, and its fills stay individually addressable.
 *
 * Call it once, after the actor is built and after any scaling: it bakes the
 * shadow offsets as they stand. The fills' shared geometry is NOT disposed —
 * paperPiece hands the same geometry to a piece's fill and its shadows, so
 * freeing it here would take the fill with it.
 *
 * ONLY ON A RIGID ASSEMBLY. The merged shadow is one mesh parented to `obj`,
 * so anything that moves a sub-part afterwards — a turret tracking, a worm
 * undulating, a weak point pulsing — moves the part away from its own shadow.
 * On an articulated actor, call it on each rigid sub-assembly instead (each
 * worm bead, say) and leave the joints alone.
 */
export function mergeShadows(obj) {
  const owners = [];
  obj.traverse((o) => { if (o.userData && o.userData.shadows && o.userData.shadows.length) owners.push(o); });
  const shadows = [];
  for (const o of owners) for (const sh of o.userData.shadows) shadows.push(sh);
  if (shadows.length < 2) return obj;

  const geo = bakeMeshes(shadows, false, obj);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: shadows[0].material.color.clone(), transparent: true,
    opacity: shadows[0].material.opacity, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = -1;
  for (const sh of shadows) {
    if (sh.parent) sh.parent.remove(sh);
    sh.material.dispose();
  }
  for (const o of owners) o.userData.shadows = [];
  obj.add(mesh);
  obj.userData.shadowMesh = mesh;
  return obj;
}

/* ---------------------------------------------------------------- disposal */

/* Free every geometry and material under an object and detach it. Call this
   whenever something built per-frame or per-level goes away — the kit creates
   geometry eagerly, so nothing gets collected on its own. */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else if (m) m.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

/* ---------------------------------------------------------------- confetti */

/* Torn-paper burst for kills and explosions.
 *
 * One InstancedMesh, one geometry, one material, `max` scraps — so however
 * busy the screen gets this is a single draw call and the particle count never
 * changes. Fading is done by shrinking rather than by alpha: per-instance
 * opacity would need a custom shader, and a scrap of card shrinking to nothing
 * reads as "blown away" anyway.
 */
/* Every scrap spins about z; hoisted so writeMatrix allocates nothing. */
const SPIN_AXIS = new THREE.Vector3(0, 0, 1);

export function confettiPool(scene, { max = 400, gravity = -55, drag = 1.1, seed = 99 } = {}) {
  // An irregular five-sided scrap. Per-particle scale and spin do the rest of
  // the variety, so one silhouette is enough.
  const scrap = polyShape([[-0.5, -0.42], [0.46, -0.5], [0.5, 0.3], [0.02, 0.5], [-0.42, 0.24]]);
  const geo = new THREE.ShapeGeometry(scrap, 1);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = max;

  const group = new THREE.Group();
  group.add(mesh);
  if (scene) scene.add(group);

  const rnd = mulberry32(seed);
  const P = new Array(max);
  for (let i = 0; i < max; i++) P[i] = { life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, rot: 0, rv: 0, s: 1 };
  let cursor = 0;

  const col = new THREE.Color();
  for (let i = 0; i < max; i++) mesh.setColorAt(i, col.setHex(0xffffff));

  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const ZERO = new THREE.Vector3(0, 0, 0);
  // Scratch only — writeMatrix runs for every live scrap every frame.

  function writeMatrix(i, p) {
    if (p.life <= 0) {
      m4.compose(ZERO, quat.set(0, 0, 0, 1), scl.set(0, 0, 0));
    } else {
      // Shrink over the last 45% of life — the "blown away" fade.
      const k = Math.min(1, p.life / (p.max * 0.45));
      quat.setFromAxisAngle(SPIN_AXIS, p.rot);
      pos.set(p.x, p.y, p.z);
      scl.setScalar(p.s * k);
      m4.compose(pos, quat, scl);
    }
    mesh.setMatrixAt(i, m4);
  }
  for (let i = 0; i < max; i++) writeMatrix(i, P[i]);
  mesh.instanceMatrix.needsUpdate = true;

  function burst(x, y, { count = 18, colors = [0xffffff], speed = 34, z = 1, size = 1.6, spread = Math.PI * 2, dir = 0, life = 0.9 } = {}) {
    for (let k = 0; k < count; k++) {
      const p = P[cursor];
      const idx = cursor;
      cursor = (cursor + 1) % max;               // oldest scrap is recycled first
      const a = dir + (rnd() - 0.5) * spread;
      const sp = speed * (0.35 + rnd() * 0.9);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.rot = rnd() * Math.PI * 2;
      p.rv = (rnd() - 0.5) * 14;
      p.s = size * (0.5 + rnd());
      p.max = life * (0.6 + rnd() * 0.8);
      p.life = p.max;
      mesh.setColorAt(idx, col.setHex(colors[(rnd() * colors.length) | 0] || 0xffffff));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function update(dt) {
    const d = Math.max(0, 1 - drag * dt);
    let live = false;
    for (let i = 0; i < max; i++) {
      const p = P[i];
      if (p.life <= 0) continue;
      live = true;
      p.life -= dt;
      p.vy += gravity * dt;
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.rv * dt;
      if (p.life <= 0) p.life = 0;
      writeMatrix(i, p);
    }
    if (live) mesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    for (let i = 0; i < max; i++) { P[i].life = 0; writeMatrix(i, P[i]); }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    mesh.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return { group, mesh, burst, update, clear, dispose };
}
