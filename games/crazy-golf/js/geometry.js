/* geometry.js — pure 2D helpers for building hole shapes (x = right, z = down-screen).
 * No three.js here: the physics, the solver tests and the renderer all share it. */

export const TAU = Math.PI * 2;

export function area(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* Every polygon is kept with positive signed area, so "outward" is always the same side. */
export function ccw(pts) { return area(pts) < 0 ? pts.slice().reverse() : pts; }

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function ellipse(cx, cz, rx, rz, n = 32, rot = 0) {
  const out = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    out.push([cx + x * c - z * s, cz + x * s + z * c]);
  }
  return ccw(out);
}

/* Rectangle centred at (cx,cz), w along the rotated x axis, d along rotated z. */
export function rect(cx, cz, w, d, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
  return ccw([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]));
}

/* Round every corner of a polygon with radius r (trimmed where edges are short). */
export function fillet(pts, r, seg = 5) {
  if (!r) return pts.slice();
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let ax = p0[0] - p1[0], az = p0[1] - p1[1], bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) { out.push(p1); continue; }
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const cos = Math.max(-1, Math.min(1, ax * bx + az * bz)), ang = Math.acos(cos);
    if (ang > Math.PI - 0.05) { out.push(p1); continue; }          // nearly straight
    let d = r / Math.tan(ang / 2);
    const dMax = Math.min(la, lb) * 0.48;
    let rr = r;
    if (d > dMax) { d = dMax; rr = d * Math.tan(ang / 2); }
    const s1 = [p1[0] + ax * d, p1[1] + az * d], s2 = [p1[0] + bx * d, p1[1] + bz * d];
    // centre along the bisector
    let mx = ax + bx, mz = az + bz; const ml = Math.hypot(mx, mz); mx /= ml; mz /= ml;
    const cd = rr / Math.sin(ang / 2), cx = p1[0] + mx * cd, cz = p1[1] + mz * cd;
    let a1 = Math.atan2(s1[1] - cz, s1[0] - cx), a2 = Math.atan2(s2[1] - cz, s2[0] - cx);
    let da = a2 - a1; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    const k = Math.max(2, Math.ceil(seg * Math.abs(da) / (Math.PI / 2)));
    for (let j = 0; j <= k; j++) { const a = a1 + da * j / k; out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  }
  return dedupe(out);
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) out.push(p); }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.02) out.pop();
  return out;
}

/* A corridor along a centre line. Each point is [x, z, halfWidth?]. Ends are rounded. */
export function path(line, hw = 1.4, capSeg = 8) {
  const P = line.map(p => [p[0], p[1], p[2] ?? hw]);
  const n = P.length, L = [], R = [];
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dz);
    segN.push([-dz / l, dx / l, dx / l, dz / l]);   // left normal (nx,nz), dir (dx,dz)
  }
  const off = (i, s, side) => { const [nx, nz] = segN[s]; const w = P[i][2] * side; return [P[i][0] + nx * w, P[i][1] + nz * w]; };
  for (const side of [1, -1]) {
    const out = side === 1 ? L : R;
    out.push(off(0, 0, side));
    for (let i = 1; i < n - 1; i++) {
      const a0 = off(i - 1, i - 1, side), a1 = off(i, i - 1, side), b0 = off(i, i, side), b1 = off(i + 1, i, side);
      const hit = intersect(a0, a1, b0, b1);
      const lim = P[i][2] * 2.6;
      if (hit && Math.hypot(hit[0] - P[i][0], hit[1] - P[i][1]) < lim) out.push(hit);
      else { out.push(a1); out.push(b0); }
    }
    out.push(off(n - 1, n - 2, side));
  }
  const aL = Math.atan2(segN[n - 2][1], segN[n - 2][0]), aR0 = Math.atan2(-segN[0][1], -segN[0][0]);
  const endCap = [], startCap = [];
  for (let k = 1; k < capSeg; k++) {
    const a = aL - Math.PI * k / capSeg, w = P[n - 1][2];
    endCap.push([P[n - 1][0] + Math.cos(a) * w, P[n - 1][1] + Math.sin(a) * w]);
    const b = aR0 - Math.PI * k / capSeg, w0 = P[0][2];
    startCap.push([P[0][0] + Math.cos(b) * w0, P[0][1] + Math.sin(b) * w0]);
  }
  return ccw(dedupe([...L, ...endCap, ...R.slice().reverse(), ...startCap]));
}

export function intersect(a0, a1, b0, b1) {
  const d1x = a1[0] - a0[0], d1z = a1[1] - a0[1], d2x = b1[0] - b0[0], d2z = b1[1] - b0[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b0[0] - a0[0]) * d2z - (b0[1] - a0[1]) * d2x) / den;
  return [a0[0] + d1x * t, a0[1] + d1z * t];
}

/* Push every vertex out along its averaged normal (polygon must be ccw). */
export function offset(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = norm(p1[0] - p0[0], p1[1] - p0[1]), e2 = norm(p2[0] - p1[0], p2[1] - p1[1]);
    // ccw with positive area in (x,z): outward normal of edge (dx,dz) is (dz,-dx)
    const n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]];
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const cosH = Math.max(0.35, mx * n1[0] + mz * n1[1]);
    out.push([p1[0] + mx * d / cosH, p1[1] + mz * d / cosH]);
  }
  return out;
}
function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

export function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a0 = pts[i], a1 = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b0 = pts[j], b1 = pts[(j + 1) % n];
      if (segCross(a0, a1, b0, b1)) return [i, j];
    }
  }
  return null;
}
function segCross(p1, p2, p3, p4) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function bounds(polys) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const pts of polys) for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

export function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return ccw(lo.concat(up));
}
