// Organic town layout: a world polygon split recursively by slightly skewed roads into irregular
// convex lots, then a winding river, a wavy coastline and a central roundabout laid over the top.
// Lots are convex polygons [[x,z],...]; everything placed in them is tested against the polygon.

export const G = {
  area(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return a / 2; },
  centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; },
  // keep the part of p where nx*x + nz*z <= c
  clip(p, nx, nz, c) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
      if (da <= 0) out.push(a);
      if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  },
  // shrink a convex polygon by d on every side
  inset(p, d) {
    const s = Math.sign(G.area(p)) || 1; let q = p;
    for (let i = 0; i < p.length && q.length >= 3; i++) {
      const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      const nx = s * ez / l, nz = -s * ex / l; // outward normal
      q = G.clip(q, nx, nz, nx * a[0] + nz * a[1] - d);
    }
    return q;
  },
  inside(p, x, z) {
    let sg = 0;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c !== 0) { if (sg === 0) sg = Math.sign(c); else if (Math.sign(c) !== sg) return false; } }
    return true;
  },
  extent(p, ux, uz) { let lo = 1e9, hi = -1e9; for (const q of p) { const v = q[0] * ux + q[1] * uz; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; },
  bbox(p) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 }; },
  // where the line ux*x+uz*z = t crosses the polygon's edges (2 points for a convex polygon)
  chord(p, ux, uz, t) {
    const pts = [];
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], da = ux * a[0] + uz * a[1] - t, db = ux * b[0] + uz * b[1] - t; if ((da < 0) !== (db < 0)) { const k = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); } }
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  },
  // nearest edge to a point: { ang, dist, nx, nz } (nx,nz = outward normal)
  nearestEdge(p, x, z) {
    const s = Math.sign(G.area(p)) || 1; let best = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)), dx = x - (a[0] + ex * t), dz = z - (a[1] + ez * t), d = Math.hypot(dx, dz);
      if (!best || d < best.dist) { const l = Math.sqrt(l2); best = { ang: Math.atan2(ex, ez), dist: d, nx: s * ez / l, nz: -s * ex / l }; }
    }
    return best;
  },
};

// The town plan. R = seeded random. Returns { lots, roads, shore(x), riverX(z), blocked(x,z,pad,lot), H, W, ring }.
export function planTown(R, W = 360) {
  const H = W / 2, roads = [], lots = [];
  const shoreBase = H - 40, shore = x => shoreBase + 9 * Math.sin(x / 41 + 0.7) + 5 * Math.sin(x / 15 + 2.1);
  const RIVW = 13, riverX = z => -H * 0.38 + 24 * Math.sin(z / 57 + 0.6) + 9 * Math.sin(z / 23);
  const ring = { x: H * 0.08, z: -H * 0.06, out: 21, mid: 17, plaza: 13 };
  const inRiver = (x, z, pad = 0) => z < shore(x) + 6 && Math.abs(x - riverX(z)) < RIVW / 2 + pad;
  const inSea = (x, z, pad = 0) => z > shore(x) - pad;
  const inRing = (x, z, pad = 0) => Math.hypot(x - ring.x, z - ring.z) < ring.out + pad;
  const blocked = (x, z, pad = 0, lot) => inSea(x, z, pad) || inRiver(x, z, pad) || (!(lot && lot.type === 'plaza') && inRing(x, z, pad)) || Math.abs(x) > H - 1 || Math.abs(z) > H - 1;
  const RW = [14, 12, 10, 9, 8, 7, 7, 7, 7];
  const split = (poly, depth) => {
    const a = Math.abs(G.area(poly)); if (a < 60) return;
    const bx = G.extent(poly, 1, 0), bz = G.extent(poly, 0, 1), along = bx[1] - bx[0] > bz[1] - bz[0];
    const th = (along ? 0 : Math.PI / 2) + (R() - 0.5) * 0.42, ux = Math.cos(th), uz = Math.sin(th);
    const [lo, hi] = G.extent(poly, ux, uz), L = hi - lo, [plo, phi] = G.extent(poly, -uz, ux), M = phi - plo;
    if (L < 44 || M < 18 || a < 1300 || (a < 3600 && R() < 0.45) || depth > 7) { lots.push(poly); return; }
    const t = lo + L * (0.33 + R() * 0.34), w = RW[depth];
    const ch = G.chord(poly, ux, uz, t); if (ch) roads.push({ a: ch[0], b: ch[1], w });
    split(G.clip(poly, ux, uz, t - w / 2), depth + 1);
    split(G.clip(poly, -ux, -uz, -(t + w / 2)), depth + 1);
  };
  const E = H - 8;
  split([[-E, -E], [E, -E], [E, E], [-E, E]], 0);
  for (const [a, b] of [[[-H + 4, -H + 4], [H - 4, -H + 4]], [[H - 4, -H + 4], [H - 4, H - 4]], [[-H + 4, H - 4], [H - 4, H - 4]], [[-H + 4, -H + 4], [-H + 4, H - 4]]]) roads.push({ a, b, w: 8 });

  const out = [];
  for (const poly of lots) {
    const [cx, cz] = G.centroid(poly);
    if (inSea(cx, cz, 4) || inRiver(cx, cz, 2) || inRing(cx, cz, 4)) continue;
    const inner = G.inset(poly, 2.4); if (inner.length < 3 || Math.abs(G.area(inner)) < 140) continue;
    const bb = G.bbox(poly), minW = Math.min(bb.w, bb.d);
    out.push({ poly, inner, cx, cz, area: Math.abs(G.area(poly)), minW, ...bb, placed: [], shoreSide: poly.some(q => inSea(q[0], q[1], 2)) });
  }
  const pl = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; pl.push([ring.x + Math.cos(a) * ring.plaza, ring.z + Math.sin(a) * ring.plaza]); }
  const plaza = { poly: pl, inner: G.inset(pl, 1.2), cx: ring.x, cz: ring.z, area: Math.abs(G.area(pl)), minW: ring.plaza * 2, ...G.bbox(pl), placed: [], type: 'plaza' };
  out.push(plaza);
  return { lots: out, roads, shore, riverX, RIVW, ring, blocked, inSea, inRiver, H, W };
}

// Give each lot a district type from its size, shape and where it sits.
export function zone(plan, R, stadiumSize = 40) {
  const { lots, H } = plan;
  const free = lots.filter(l => !l.type);
  const by = f => free.filter(l => !l.type).sort(f)[0];
  const st = free.filter(l => l.minW >= stadiumSize * 0.75 && Math.hypot(l.cx, l.cz) > H * 0.35).sort((a, b) => b.area - a.area)[0]; if (st) st.type = 'stadium';
  const fs = by((a, b) => Math.hypot(a.cx - H * 0.5, a.cz + H * 0.45) - Math.hypot(b.cx - H * 0.5, b.cz + H * 0.45)); if (fs) fs.type = 'station';
  for (const side of [-1, 1]) { const f = by((a, b) => Math.hypot(a.cx - side * H, a.cz + H) - Math.hypot(b.cx - side * H, b.cz + H)); if (f && f.area > 900) f.type = 'farm'; }
  for (const l of lots) {
    if (l.type) continue;
    const d = Math.max(Math.abs(l.cx), Math.abs(l.cz)) / H, tri = l.poly.length <= 3 || l.minW < 22, r = R();
    if (l.shoreSide && l.area > 500) l.type = r < 0.5 ? 'harbour' : 'shops';
    else if (tri || l.area < 1000) l.type = r < 0.5 ? 'park' : 'houses';
    else if (d < 0.32) l.type = r < 0.42 ? 'tower' : r < 0.82 ? 'shops' : 'park';
    else if (d < 0.66) l.type = r < 0.45 ? 'houses' : r < 0.72 ? 'shops' : r < 0.86 ? 'factory' : 'park';
    else l.type = r < 0.42 ? 'houses' : r < 0.66 ? 'factory' : r < 0.82 ? 'tower' : 'park';
  }
}
