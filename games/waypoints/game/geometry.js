// Waypoints — the geometry the rules are made of.
//
// Everything the rules ask about the map is a question about lines: how many did
// this route cross, is this point in that lake, does this leg touch the river
// anywhere but a bridge. There are 177 contours on map 01 and the cost of a
// route is recomputed on every pointer-move while it is being dragged, so
// "check the route against every polyline" is not an option — the map's lines
// are put into a uniform grid of buckets once, and a segment only ever tests
// against the lines that share a bucket with it.
//
// One convention throughout: a POINT is `[x, y]` in cell units, a POLYLINE is an
// array of points, and a ROUTE is a polyline. Nothing here knows about the game.

/** Where two segments cross, or null. Endpoints touching counts; parallel does not. */
export function segIntersect(a1, a2, b1, b2) {
  const rx = a2[0] - a1[0], ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0], sy = b2[1] - b1[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;            // parallel or collinear
  const dx = b1[0] - a1[0], dy = b1[1] - a1[1];
  const t = (dx * sy - dy * sx) / den;
  const u = (dx * ry - dy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1[0] + t * rx, y: a1[1] + t * ry, t, u };
}

/** Distance from a point to a segment, and the closest point on it. */
export function nearestOnSeg(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1,
    ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  const x = a[0] + t * vx, y = a[1] + t * vy;
  return { x, y, t, d: Math.hypot(p[0] - x, p[1] - y) };
}

export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A uniform-grid index over a set of named polylines.
 *
 * Built once per map revision and asked thousands of times. Each entry is one
 * SEGMENT tagged with the id of the line it came from, because the rules care
 * which line was crossed (crossing the same contour twice is two points) and
 * because the river has to be identifiable to be refused.
 */
export class LineIndex {
  /** @param {number} cell bucket size in cell units; ~1/4 of a grid square is plenty */
  constructor(cell = 0.25) {
    this.cell = cell;
    this.buckets = new Map();
    this.segs = [];
  }

  key(cx, cy) { return cx * 100000 + cy; }

  /** Add one polyline under `id`. `kind` lets the caller filter later. */
  add(id, kind, pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const si = this.segs.length;
      this.segs.push({ id, kind, a, b });
      // every bucket the segment's bounding box touches
      const x0 = Math.floor(Math.min(a[0], b[0]) / this.cell);
      const x1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / this.cell);
      const y1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, (list = []));
        list.push(si);
      }
    }
    return this;
  }

  /**
   * Every crossing of one segment against the index.
   *
   * Returns `{ id, kind, x, y, t }` per crossing, `t` being how far along the
   * query segment it happened — which is what lets a caller find the FIRST
   * thing a leg hits, for "you stopped at the river".
   */
  hits(a, b, want) {
    const out = [];
    const seen = new Set();                 // a segment can sit in several buckets
    const x0 = Math.floor(Math.min(a[0], b[0]) / this.cell);
    const x1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
    const y0 = Math.floor(Math.min(a[1], b[1]) / this.cell);
    const y1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const list = this.buckets.get(this.key(cx, cy));
      if (!list) continue;
      for (const si of list) {
        if (seen.has(si)) continue;
        seen.add(si);
        const s = this.segs[si];
        if (want && !want(s)) continue;
        const h = segIntersect(a, b, s.a, s.b);
        if (h) out.push({ id: s.id, kind: s.kind, x: h.x, y: h.y, t: h.t });
      }
    }
    out.sort((p, q) => p.t - q.t);
    return out;
  }

  /** The nearest point on any indexed line within `r`, or null. */
  nearest(p, r, want) {
    let best = null;
    const n = Math.ceil(r / this.cell);
    const cx0 = Math.floor(p[0] / this.cell), cy0 = Math.floor(p[1] / this.cell);
    const seen = new Set();
    for (let cy = cy0 - n; cy <= cy0 + n; cy++) for (let cx = cx0 - n; cx <= cx0 + n; cx++) {
      const list = this.buckets.get(this.key(cx, cy));
      if (!list) continue;
      for (const si of list) {
        if (seen.has(si)) continue;
        seen.add(si);
        const s = this.segs[si];
        if (want && !want(s)) continue;
        const near = nearestOnSeg(p, s.a, s.b);
        if (near.d <= r && (!best || near.d < best.d)) {
          best = { id: s.id, kind: s.kind, x: near.x, y: near.y, d: near.d };
        }
      }
    }
    return best;
  }
}

/**
 * The nearest point on a closed polygon's edge, and how far away it is.
 *
 * Used to push a drawn point out of a lake: the shore is the nearest edge, and
 * "which shore" is not a question worth asking — the one you were closest to
 * when you dragged in is the one you meant.
 */
export function nearestOnPoly(p, pts) {
  let best = null;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const n = nearestOnSeg(p, pts[j], pts[i]);
    if (!best || n.d < best.d) best = n;
  }
  return best;
}

/**
 * Round the corners off a drawn route.
 *
 * A route is a handful of points the player put down, and a walk between them is
 * not a set of hard corners. Centripetal Catmull-Rom because it passes THROUGH
 * every point the player placed — the ends stay on the waypoints, and a corner
 * stays where they put it — and because the centripetal parameterisation does
 * not loop or overshoot when two points are close together, which a uniform one
 * does and which would cost the player a contour they never went near.
 *
 * The result is the route, not a picture of it: it is what gets drawn AND what
 * gets costed, so what you see crossing a contour is what you pay for.
 */
export function smoothPath(pts, per = 8) {
  if (!pts || pts.length < 3) return (pts || []).map((p) => [p[0], p[1]]);
  const P = pts.map((p) => [p[0], p[1]]);
  // phantom ends, so the first and last spans bend like the rest
  const first = [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
  const last = [2 * P[P.length - 1][0] - P[P.length - 2][0],
                2 * P[P.length - 1][1] - P[P.length - 2][1]];
  const C = [first, ...P, last];
  const out = [[P[0][0], P[0][1]]];
  const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || ti + 1e-6;

  for (let i = 1; i + 2 < C.length; i++) {
    const [p0, p1, p2, p3] = [C[i - 1], C[i], C[i + 1], C[i + 2]];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let s = 1; s <= per; s++) {
      const t = t1 + ((t2 - t1) * s) / per;
      const mix = (a, b, ta, tb, u) => {
        const k = tb - ta || 1e-6;
        return [((tb - u) / k) * a[0] + ((u - ta) / k) * b[0],
                ((tb - u) / k) * a[1] + ((u - ta) / k) * b[1]];
      };
      const a1 = mix(p0, p1, t0, t1, t), a2 = mix(p1, p2, t1, t2, t), a3 = mix(p2, p3, t2, t3, t);
      const b1 = mix(a1, a2, t0, t2, t), b2 = mix(a2, a3, t1, t3, t);
      out.push(mix(b1, b2, t1, t2, t));
    }
  }
  // The last point must be EXACTLY where it was put: a waypoint is reached or it
  // is not, and a rounding error is not an answer to that question.
  out[out.length - 1] = [P[P.length - 1][0], P[P.length - 1][1]];
  return out;
}
