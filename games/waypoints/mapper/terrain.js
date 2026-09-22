// Waypoints — contours in, heightfield out.
//
// The sheet is level 0 everywhere by default: bare ground at baseElevation. A
// contour is a piece of raised land drawn on top of it — the ring, or an
// edge-anchored line plus the border it closes against, encloses a region.
//
// Height between two contours is interpolated by distance: a cell that is d_lo
// from the level below it and d_hi from the level above sits at
// h_lo + (h_hi - h_lo) * d_lo/(d_lo + d_hi). So the ground climbs one interval
// per gap whatever the gap's width, and every step gets the same treatment.
//
// The bare sheet has no contour line to measure from, so it is given one: the
// ground falls from the outermost contour to base over `baseRun`, the map's own
// median contour spacing. That is what makes base-to-1 read like 1-to-2 instead
// of a flat plain with a sudden bank at the end.
//
// A few smoothing passes over the interpolated field round off the creases
// where two contours are equidistant. Beyond the outermost run the sheet is
// pinned flat, so editing one contour never moves ground on the far side.
import { polyBounds, pointInPoly, resolvePts, nearestOnPolyline } from './state.js';

export const DEFAULT_RES = 56;   // samples per grid cell

export function buildHeightfield(map, res = DEFAULT_RES) {
  const { cols, rows } = map.grid;
  const W = cols * res + 1, H = rows * res + 1;
  const w = map.world;
  const iv = Math.max(1, w.contourInterval);
  const levelHeight = (lv) => w.baseElevation + (lv || 0) * iv;

  // ---- contour lines, one mask per level
  const levelMask = new Map();
  const maskFor = (lv) => {
    let m = levelMask.get(lv);
    if (!m) { m = new Uint8Array(W * H); levelMask.set(lv, m); }
    return m;
  };
  const drawLine = (mask, a, b) => {
    const ax = a[0] * res, ay = a[1] * res, bx = b[0] * res, by = b[1] * res;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n, py = ay + ((by - ay) * k) / n;
      const x = Math.round(px), y = Math.round(py);
      if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
    }
  };
  for (const c of (map.contours || [])) {
    const pts = resolvePts(c);
    if (pts.length < 2) continue;
    if (c.height == null && c.level == null) continue;
    const lv = c.height != null ? Math.round((c.height - w.baseElevation) / iv) : (c.level | 0);
    const mask = maskFor(lv);
    for (let i = 0; i < pts.length - 1; i++) drawLine(mask, pts[i], pts[i + 1]);
    if (c.closed) drawLine(mask, pts[pts.length - 1], pts[0]);
  }

  // ---- distance to each level's lines
  const levels = [...levelMask.keys()].sort((a, b) => a - b);
  const dist = new Map();
  for (const lv of levels) dist.set(lv, distanceTo(levelMask.get(lv), W, H));

  // ---- which region each cell sits in
  const plateau = plateauLevels(map, cols, rows, W, H, res);

  // ---- the map's own contour spacing, used as the run from level 1 down to base
  const baseRun = medianSpacing(plateau, dist, levels, W, H) * (w.baseRun ?? 1) ||
    Math.max(2, (w.falloff ?? 0.35) * res * 2);

  // ---- interpolate
  const water = new Uint8Array(W * H);   // wet cells, for keeping plants out of them
  const val = new Float32Array(W * H);
  for (let i = 0; i < val.length; i++) {
    const N = plateau[i];
    const hLo = levelHeight(N);
    // nearest line above this cell's own level
    let dHi = Infinity, hHi = null;
    for (const lv of levels) {
      if (lv <= N) continue;
      const d = dist.get(lv)[i];
      if (d < dHi) { dHi = d; hHi = levelHeight(lv); }
    }
    if (hHi == null) { val[i] = hLo; continue; }          // nothing above: the top
    const dl = dist.get(N);
    if (dl) {
      const dLo = dl[i];
      val[i] = hLo + (hHi - hLo) * (dLo / Math.max(1e-6, dLo + dHi));
    } else {
      // bare sheet: no level-0 line exists, so fall to base over baseRun
      val[i] = w.baseElevation + (hHi - w.baseElevation) * (1 - Math.min(1, dHi / baseRun));
    }
  }

  // ---- summits rise above the ground they stand on
  for (const wp of (map.waypoints || [])) {
    if (wp.type !== 'mountain' || wp.height == null) continue;
    const px = wp.x * res, py = wp.y * res, r = Math.max(4, baseRun * 0.9);
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++)
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W - 1, Math.ceil(px + r)); x++) {
        const d = Math.hypot(x - px, y - py);
        if (d > r) continue;
        // smootherstep, not t*t: a squared falloff is flat at the base and
        // STEEPEST at the middle, which put a sharp point on every summit and
        // made the park look like a row of witch's hats. This one flattens at
        // both ends, so a peak has a rounded top and eases into the ground.
        const t = 1 - d / r, i = y * W + x;
        const e = t * t * t * (t * (t * 6 - 15) + 10);
        val[i] = Math.max(val[i], val[i] + (wp.height - val[i]) * e);
      }
  }

  // ---- smooth the land first: this rounds the creases where two contours are
  // equidistant, and it is the only pass that should be heavy.
  blur(val, W, H, (w.smoothing ?? 1) * res * 0.035, 3);

  // ---- then cut the water into the finished ground. Both carves are already
  // distance-based and smooth, so they need only a light pass afterwards — and
  // carving last means the main blur cannot silt up a narrow channel.
  for (const lk of (map.lakes || [])) {
    const pts = resolvePts(lk);
    if (pts.length < 3) continue;
    carveLake(val, water, W, H, res, lk, pts, w.waterDepth ?? 25);
  }
  for (const r of (map.rivers || [])) {
    const pts = resolvePts(r);
    if (pts.length < 2) continue;
    carveRiver(val, water, W, H, res, r, pts, w);
  }
  // Two light passes, not one: the carve classifies cells as in or out of the
  // water on the sample grid, and that boundary zigzags by a sample. One pass
  // leaves the zigzag visible in the surface normals as a crenellated fringe.
  blur(val, W, H, 1, 2);

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < val.length; i++) { if (val[i] < min) min = val[i]; if (val[i] > max) max = val[i]; }
  return { data: val, water, w: W, h: H, res, min, max, cols, rows,
    stats: { cells: W * H, levels: levels.length, baseRun: +baseRun.toFixed(1) } };
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher): the lower
 * envelope of parabolas, once down the columns and once across the rows.
 *
 * The obvious two-pass chamfer approximation is octagonal — its isolines have
 * corners at 45 degrees. Since height here is a ratio of two distances, those
 * corners land directly in the terrain as facets, which is what made the ground
 * look jagged. This version is exact and still linear time.
 */
function distanceTo(mask, W, H) {
  const INF = 1e20;
  const d = new Float64Array(W * H);
  for (let i = 0; i < mask.length; i++) d[i] = mask[i] ? 0 : INF;

  const n = Math.max(W, H);
  const f = new Float64Array(n), out = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);

  const envelope = (len) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      out[q] = dq * dq + f[v[k]];
    }
  };

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = d[y * W + x];
    envelope(H);
    for (let y = 0; y < H; y++) d[y * W + x] = out[y];
  }
  const res = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = d[y * W + x];
    envelope(W);
    for (let x = 0; x < W; x++) res[y * W + x] = Math.sqrt(out[x]);
  }
  return res;
}

/** The typical width of a band between two contours, in grid samples. */
function medianSpacing(plateau, dist, levels, W, H) {
  const widths = [];
  for (let i = 0; i < plateau.length; i += 7) {
    const N = plateau[i];
    const dl = dist.get(N);
    if (!dl) continue;
    let dHi = Infinity;
    for (const lv of levels) if (lv > N) { const d = dist.get(lv)[i]; if (d < dHi) dHi = d; }
    if (dHi === Infinity) continue;
    widths.push(dl[i] + dHi);
  }
  if (!widths.length) return 0;
  widths.sort((a, b) => a - b);
  return widths[widths.length >> 1];
}

/** Level of the innermost contour region covering each cell; 0 for bare sheet. */
function plateauLevels(map, cols, rows, W, H, res) {
  const out = new Int16Array(W * H);
  const regions = [];
  for (const c of (map.contours || [])) {
    if (c.height == null && c.level == null) continue;
    const poly = regionPolygon(c, cols, rows);
    if (!poly || poly.length < 3) continue;
    regions.push({ poly, area: Math.abs(signedArea(poly)), lv: c.level | 0 });
  }
  regions.sort((a, b) => b.area - a.area);
  for (const r of regions) scanFill(out, r.poly, W, H, res, r.lv);
  return out;
}

/**
 * The ground a contour encloses.
 *
 * A closed ring encloses its own interior. An open contour anchored on two
 * points of the sheet border encloses one of the two sides it cuts the sheet
 * into — by default the smaller, flipped per contour with `side: 'big'`.
 * Anything else (a line with a loose end) encloses nothing and acts as a bare
 * constraint line.
 */
export function regionPolygon(c, cols, rows) {
  const pts = resolvePts(c);
  if (pts.length < 3) return null;
  if (c.closed) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  if (!onEdge(a, cols, rows) || !onEdge(b, cols, rows)) return null;
  const forward = borderPath(perim(b, cols, rows), perim(a, cols, rows), cols, rows, +1);
  const back = borderPath(perim(b, cols, rows), perim(a, cols, rows), cols, rows, -1);
  const optA = pts.concat(forward), optB = pts.concat(back);
  const wantBig = c.side === 'big';
  const aBig = Math.abs(signedArea(optA)) >= Math.abs(signedArea(optB));
  return (aBig === wantBig) ? optA : optB;
}

const onEdge = (p, cols, rows) => p[0] <= 1e-3 || p[1] <= 1e-3 ||
  p[0] >= cols - 1e-3 || p[1] >= rows - 1e-3;

/** Position of an edge point around the perimeter, 0..(2*cols+2*rows). */
function perim(p, cols, rows) {
  if (p[1] <= 1e-3) return p[0];                                  // top, L->R
  if (p[0] >= cols - 1e-3) return cols + p[1];                    // right, T->B
  if (p[1] >= rows - 1e-3) return cols + rows + (cols - p[0]);    // bottom, R->L
  return 2 * cols + rows + (rows - p[1]);                         // left, B->T
}
function unperim(t, cols, rows) {
  const P = 2 * (cols + rows);
  t = ((t % P) + P) % P;
  if (t <= cols) return [t, 0];
  if (t <= cols + rows) return [cols, t - cols];
  if (t <= 2 * cols + rows) return [cols - (t - cols - rows), rows];
  return [0, rows - (t - 2 * cols - rows)];
}
/** Walk the border from t0 to t1 in `dir`, planting the corners on the way. */
function borderPath(t0, t1, cols, rows, dir) {
  const P = 2 * (cols + rows);
  const out = [];
  let span = dir > 0 ? (t1 - t0 + P) % P : (t0 - t1 + P) % P;
  const corners = [0, cols, cols + rows, 2 * cols + rows];
  for (let k = 0; k < 4; k++) {
    for (const c of corners) {
      const d = dir > 0 ? (c - t0 + P) % P : (t0 - c + P) % P;
      if (d > 0 && d < span && !out.some((o) => o.d === d)) out.push({ d, p: unperim(c, cols, rows) });
    }
    break;
  }
  out.sort((x, y) => x.d - y.d);
  return out.map((o) => o.p).concat([unperim(t1, cols, rows)]);
}
function signedArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

function scanFill(field, poly, W, H, res, value) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { const y = p[1] * res; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    xs.length = 0;
    const yc = y + 0.5;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ay = poly[j][1] * res, by = poly[i][1] * res;
      if ((ay > yc) === (by > yc)) continue;
      const ax = poly[j][0] * res, bx = poly[i][0] * res;
      xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const s = Math.max(0, Math.ceil(xs[k])), e = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = s; x <= e; x++) field[y * W + x] = value;
    }
  }
}

/**
 * Sink a lake into its own basin.
 *
 * The water surface is the mean ground height around the shore. Inside, the bed
 * drops away from that surface over a short run rather than being cut flat at
 * the polygon edge — a flat cut leaves a vertical wall along the shore, which
 * renders as a stair-stepped rim.
 */
function carveLake(val, water, W, H, res, lake, lpts, depth) {
  const b = polyBounds(lpts);
  const x0 = Math.max(0, Math.floor(b.x0 * res) - 4), x1 = Math.min(W - 1, Math.ceil(b.x1 * res) + 4);
  const y0 = Math.max(0, Math.floor(b.y0 * res) - 4), y1 = Math.min(H - 1, Math.ceil(b.y1 * res) + 4);

  let shore = 0, n = 0;
  for (const [px, py] of lpts) {
    const x = Math.round(px * res), y = Math.round(py * res);
    if (x >= 0 && y >= 0 && x < W && y < H) { shore += val[y * W + x]; n++; }
  }
  if (!n) return;
  shore /= n;
  lake.surface = Math.round(shore * 10) / 10;

  // how far in the bed takes to reach full depth: a fraction of the lake's size
  const span = Math.min((b.x1 - b.x0), (b.y1 - b.y0)) * res;
  const run = Math.max(2.5, Math.min(span * 0.35, res * 0.22));

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!pointInPoly([x / res, y / res], lpts)) continue;
    // distance from this cell to the shore, measured along the outline
    let d = Infinity;
    for (let k = 0, j = lpts.length - 1; k < lpts.length; j = k++) {
      const ax = lpts[j][0] * res, ay = lpts[j][1] * res;
      const bx = lpts[k][0] * res, by = lpts[k][1] * res;
      const vx = bx - ax, vy = by - ay;
      const l2 = vx * vx + vy * vy || 1e-9;
      let t = ((x - ax) * vx + (y - ay) * vy) / l2;
      t = Math.max(0, Math.min(1, t));
      const dd = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
      if (dd < d) d = dd;
    }
    const u = Math.min(1, d / run);
    const ease = u * u * (3 - 2 * u);
    const i = y * W + x;
    water[i] = 1;
    // Blend from the ground that is already there down to the basin floor.
    // Clipping to a flat `shore - depth*ease` instead cut off any ground above
    // the mean shore height, and the cut followed the rasterised polygon edge —
    // which is what showed as a crenellated fringe round the shoreline.
    val[i] += (shore - depth - val[i]) * ease;
  }
}

function carveRiver(val, water, W, H, res, river, rpts, w) {
  const n = rpts.length;
  if (n < 2) return;
  const half = Math.max(2.6, (river.width || 0.05) * res * 0.5);   // the water itself
  const valley = half * 4.5;                                      // the banks around it
  const depth = w.riverDepth ?? 22;      // bed below the water surface
  const bankDrop = w.riverBank ?? 14;    // water surface below the surrounding land

  const at = (p) => {
    const x = Math.max(0, Math.min(W - 1, Math.round(p[0] * res)));
    const y = Math.max(0, Math.min(H - 1, Math.round(p[1] * res)));
    return val[y * W + x];
  };
  const ground = rpts.map(at);

  // The source is the higher end; from there the surface only ever falls. It
  // also sits `bankDrop` below the land it runs through, so the river is in a
  // valley rather than brim-full with the plain — that is what puts the ridges
  // above the water.
  const downhill = ground[0] >= ground[n - 1];
  const surf = new Float32Array(n);
  let run = Infinity;
  for (let k = 0; k < n; k++) {
    const idx = downhill ? k : n - 1 - k;
    run = Math.min(run, ground[idx] - bankDrop);
    surf[idx] = run;
  }
  river.surface = Array.from(surf, (v) => +v.toFixed(1));
  river.channelHalf = Math.max((river.width || 0.05) / 2, half / res);

  // nearest point on the course per cell, carrying the surface it has there
  const nd = new Float32Array(W * H).fill(Infinity);
  const ns = new Float32Array(W * H);
  for (let k = 0; k < n - 1; k++) {
    const ax = rpts[k][0] * res, ay = rpts[k][1] * res;
    const bx = rpts[k + 1][0] * res, by = rpts[k + 1][1] * res;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
      const sv = surf[k] + (surf[k + 1] - surf[k]) * f;
      const x0 = Math.max(0, Math.floor(px - valley)), x1 = Math.min(W - 1, Math.ceil(px + valley));
      const y0 = Math.max(0, Math.floor(py - valley)), y1 = Math.min(H - 1, Math.ceil(py + valley));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - px, y - py);
        if (d > valley) continue;
        const i = y * W + x;
        if (d < nd[i]) { nd[i] = d; ns[i] = sv; }
      }
    }
  }

  for (let i = 0; i < val.length; i++) {
    const d = nd[i];
    if (!isFinite(d)) continue;
    const sv = ns[i];
    // Two stages. Inside `half` the bed climbs from the deepest point up to
    // the water surface, so the waterline sits exactly at the river's drawn
    // width — the water ribbon and the wetted ground agree. Outside it the bank
    // climbs on to the surrounding ground.
    //
    // The rim is never raised ABOVE the surrounding ground: doing that left a
    // hard step all along the valley edge and the river read as a causeway. It
    // is only lifted to the waterline where the ground would otherwise sit
    // below it, and even then it is blended over the full bank width.
    if (d <= half * 1.6) water[i] = 1;
    if (d <= half) {
      const u = d / half;
      val[i] = sv - depth * (1 - u * u);
    } else {
      // Blend back into exactly the ground that is there, so the carve has no
      // boundary at all. Clamping the rim up to the water surface put a step
      // along the valley edge wherever the ground sat below it.
      const rim = val[i];
      const t = Math.min(1, (d - half) / (valley - half));
      const ease = t * t * (3 - 2 * t);
      val[i] = sv + (rim - sv) * ease;
    }
  }
}

/**
 * Separable box blur, applied three times — that is a close approximation to a
 * Gaussian and far smoother than repeated 4-neighbour averaging, which leaves a
 * diamond-shaped footprint of its own.
 */
function blur(v, W, H, radius, passes = 3) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(v.length);
  const pass = (src, dst, w, h, stride, step) => {
    for (let line = 0; line < h; line++) {
      const base = line * stride;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + clampI(k, w) * step];
      for (let i = 0; i < w; i++) {
        dst[base + i * step] = sum / (2 * r + 1);
        sum += src[base + clampI(i + r + 1, w) * step] - src[base + clampI(i - r, w) * step];
      }
    }
  };
  const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  for (let p = 0; p < passes; p++) {
    pass(v, tmp, W, H, W, 1);      // horizontal
    pass(tmp, v, H, W, 1, W);      // vertical
  }
}

function blurRegion(v, W, H, x0, y0, x1, y1, passes) {
  const tmp = new Float32Array(v.length);
  for (let k = 0; k < passes; k++) {
    tmp.set(v);
    for (let y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++)
      for (let x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) {
        const i = y * W + x;
        v[i] = (tmp[i] * 4 + tmp[i - 1] + tmp[i + 1] + tmp[i - W] + tmp[i + W]) / 8;
      }
  }
}

/**
 * Is this spot wet? Reads the mask the carves rasterised, so it is one array
 * lookup. Testing every scattered plant against every lake polygon and river
 * polyline instead took a second on a map with 150 decorations.
 */
export function isWaterAt(hf, x, y) {
  if (!hf || !hf.water) return false;
  const px = Math.round(x * hf.res), py = Math.round(y * hf.res);
  if (px < 0 || py < 0 || px >= hf.w || py >= hf.h) return false;
  return hf.water[py * hf.w + px] === 1;
}

/** Geometry-based fallback for callers with no heightfield to hand. */
export function isWater(map, x, y, margin = 1.8) {
  for (const lk of (map.lakes || [])) {
    const pts = resolvePts(lk);
    if (pts.length > 2 && pointInPoly([x, y], pts)) return true;
  }
  for (const r of (map.rivers || [])) {
    const pts = resolvePts(r);
    if (pts.length < 2) continue;
    const half = r.channelHalf ?? (r.width || 0.05) / 2;
    const n = nearestOnPolyline([x, y], pts);
    if (n && n.d < half * margin) return true;
  }
  return false;
}

/** Bilinear sample in cell units. */
export function sampleHeight(hf, x, y) {
  const px = Math.max(0, Math.min(hf.w - 1.001, x * hf.res));
  const py = Math.max(0, Math.min(hf.h - 1.001, y * hf.res));
  const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0;
  const i = y0 * hf.w + x0;
  return (hf.data[i] * (1 - fx) + hf.data[i + 1] * fx) * (1 - fy) +
         (hf.data[i + hf.w] * (1 - fx) + hf.data[i + hf.w + 1] * fx) * fy;
}
