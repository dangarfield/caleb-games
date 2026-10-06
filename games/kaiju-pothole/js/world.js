// Town builder + the swallowable-object system (instanced draw, spatial grid, teeter/fall states).
import * as THREE from 'three';
import { patchDiscard, patchMat } from './hole.js';
import { G, planTown, zone } from './plan.js';
import { lodsFor, lodPass } from './lod.js';

export function kindOf(m) {
  const id = m.id, n = id.toLowerCase();
  if (m.hazard) return 'hazard';
  if (/^bt_/.test(n)) return /paddle|rod/.test(n) ? 'prop' : 'boat';
  if (/^(hc_|dr_|airballoon)/.test(n)) return 'air';
  if (/^pg_/.test(n)) return 'play';
  if (/^(hb_|bridge_ramp)/.test(n)) return 'harbour';
  if (/fire_station/.test(n)) return 'station';
  if (/^(farm|tractor|logs|timber|milk|cart_|lawn_mower|sp_windmill)/.test(n)) return 'farm';
  if (/factory|sp_roof_/.test(n)) return 'factory';
  if (m.cat === 'ground') return 'pad';
  if (m.cat === 'vehicles') return 'vehicle';
  if (m.cat === 'nature' || /tree|bush|rock|flowers|plants/.test(n)) return 'tree';
  if (m.cat === 'buildings') { const f = Math.max(m.w, m.d); if (/stadium/.test(n)) return 'stadium'; if (m.h > 24 || f > 22) return 'tower'; if (/house/.test(n)) return 'house'; return f < 6 ? 'prop' : 'shop'; }
  return 'prop';
}
// Footprint (metres) → tier 1..6, shown on the size meter.
export const TIER_MAX = [1.2, 2.5, 5, 9, 16, Infinity];
export const tierOf = f => TIER_MAX.findIndex(t => f <= t) + 1;
// largest half-diagonal an eatable town object may have: a hole that has just reached size 6 (r = 28 × 1.1 / 1.9 ≈ 16.2) swallows it
const FIT_MAX = 16;
const BUILDINGS = new Set(['house', 'shop', 'tower', 'factory', 'station', 'stadium']);

const rnd = (() => { let s = 1; return { seed: v => (s = v >>> 0 || 1), next: () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }; })();
const R = () => rnd.next(), pick = a => a[Math.floor(R() * a.length)];

export class World {
  constructor(scene, models) { this.scene = scene; this.models = models; this.objs = []; this.meshes = []; this.root = new THREE.Group(); scene.add(this.root); }
  clear() {
    this.root.traverse(o => { if (o.isBatchedMesh) o.dispose(); });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.objs = []; this.meshes = []; this.grid = new Map(); this.big = []; this.free = null; this.fitMax = 0; if (this.phys) { this.phys.dispose(); this.phys = null; }
  }
  // queues cycle through every model of a kind so the whole library gets used
  queues() {
    const q = {}; for (const m of Object.values(this.models)) (q[kindOf(m)] ||= []).push(m);
    for (const k in q) q[k].sort(() => R() - 0.5);
    const at = {}; this.take = k => { const l = q[k]; if (!l || !l.length) return null; at[k] = ((at[k] ?? -1) + 1) % l.length; return l[at[k]]; };
    this.q = q;
  }
  add(m, x, z, rot = 0, s = 1, opts = {}) {
    if (!m) return null;
    // Everything you can eat must fit a size-6 hole. The fit test is the footprint's half-diagonal (fd ≤ r × 1.02),
    // and size 6 starts at r ≈ 16.2, so a square 24 m tower (fd 16.8) or a 35 m factory used to stay put for good.
    if (opts.eatable !== false && this.fitMax) { const fd = Math.hypot(m.w, m.d) * s / 2; if (fd > this.fitMax) s *= this.fitMax / fd; }
    const o = { m, id: m.id, x, z, y: 0, rot, s, fr: Math.max(m.w, m.d) * s / 2, fd: Math.hypot(m.w, m.d) * s / 2, area: m.w * m.d * s * s, h: m.h * s, eatable: opts.eatable !== false, state: 0, tilt: 0, ax: 0, az: 0, wob: 0, idx: -1 };
    if (opts.y) o.y = o.y0 = opts.y;
    this.objs.push(o); return o;
  }
  // Pack footprints into a convex lot without overlaps (rejection sampling against the lot polygon).
  fill(lot, kinds, tries, scale = 1, opts = {}) {
    const inner = lot.inner, bb = lot.ibb || (lot.ibb = G.bbox(inner)), placed = lot.placed, blocked = this.plan.blocked;
    for (let t = 0; t < tries; t++) {
      const m = this.take(pick(kinds)); if (!m) continue;
      const s = scale * (opts.vary ? 0.85 + R() * 0.3 : 1);
      for (let k = 0; k < 12; k++) {
        const x = bb.x + R() * bb.w, z = bb.z + R() * bb.d; if (!G.inside(inner, x, z)) continue;
        const rot = opts.square ? G.nearestEdge(inner, x, z).ang + Math.floor(R() * 4) * Math.PI / 2 : R() * Math.PI * 2;
        const c = Math.cos(rot), sn = Math.sin(rot), lw = m.w * s / 2 + 0.3, ld = m.d * s / 2 + 0.3;
        let ok = true; for (const [lx, lz] of [[-lw, -ld], [lw, -ld], [lw, ld], [-lw, ld]]) { const px = x + lx * c + lz * sn, pz = z - lx * sn + lz * c; if (!G.inside(inner, px, pz) || blocked(px, pz, 0.3, lot)) { ok = false; break; } }
        if (!ok) continue;
        const hw = Math.abs(c) * lw + Math.abs(sn) * ld, hd = Math.abs(sn) * lw + Math.abs(c) * ld;
        if (placed.some(p => Math.abs(p.x - x) < p.hw + hw && Math.abs(p.z - z) < p.hd + hd)) continue;
        placed.push({ x, z, hw, hd }); this.add(m, x, z, rot, s, opts); break;
      }
    }
  }
  pointIn(lot, rnd = Math.random) { const bb = lot.ibb || (lot.ibb = G.bbox(lot.inner)); for (let k = 0; k < 30; k++) { const x = bb.x + rnd() * bb.w, z = bb.z + rnd() * bb.d; if (G.inside(lot.inner, x, z)) return [x, z]; } return [lot.cx, lot.cz]; }
  // a point on the pavement band just inside a lot's edge
  edgePoint(lot, inset = 1.3, rnd = Math.random) {
    const p = lot.poly, s = Math.sign(G.area(p)) || 1;
    for (let k = 0; k < 12; k++) { const i = Math.floor(rnd() * p.length), a = p[i], b = p[(i + 1) % p.length], t = 0.1 + rnd() * 0.8, ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      const x = a[0] + ex * t - s * ez / l * inset, z = a[1] + ez * t + s * ex / l * inset; if (!this.plan.blocked(x, z, 0.3, lot)) return [x, z]; }
    return this.pointIn(lot, rnd);
  }

  buildTown(seed = 7, extra) {
    this.clear(); rnd.seed(seed); this.queues(); this.fitMax = FIT_MAX;
    const stadiumSize = Math.max(...(this.q.stadium || [{ w: 40, d: 40 }]).map(m => Math.max(m.w, m.d)));
    const plan = this.plan = planTown(R); zone(plan, R, stadiumSize);
    const { H, W, blocked } = plan;
    this.bounds = { minX: -H, maxX: H, minZ: -H, maxZ: H };
    this.blocks = plan.lots;
    this.paintGround(plan);
    // parked cars just off each lot edge (in the road), pavement furniture just inside it
    const furn = this.q.prop.filter(m => Math.max(m.w, m.d) < 3), cars = new Set();
    for (const lot of plan.lots) {
      const p = lot.poly, sg = Math.sign(G.area(p)) || 1;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez); if (L < 6) continue;
        const ux = ex / L, uz = ez / L, nx = sg * uz, nz = -sg * ux, ang = Math.atan2(ex, ez);
        if (lot.type !== 'plaza') for (let u = 5; u < L - 5; u += 6.5) if (R() < 0.5) {
          const x = a[0] + ux * u + nx * 2.3, z = a[1] + uz * u + nz * 2.3; if (blocked(x, z, 1.5)) continue;
          const key = Math.round(x / 4.5) + ',' + Math.round(z / 4.5); if (cars.has(key)) continue; cars.add(key);
          const m = this.take(R() < 0.05 ? 'air' : 'vehicle'); if (!m || (kindOf(m) === 'air' && m.id !== 'dr_drone')) continue;
          this.add(m, x, z, ang + (R() < 0.5 ? 0 : Math.PI));
        }
        for (let u = 2; u < L - 1.5; u += 3.2) if (R() < 0.3) { const x = a[0] + ux * u - nx * 0.8, z = a[1] + uz * u - nz * 0.8; if (!blocked(x, z, 0.5, lot)) this.add(furn.length ? pick(furn) : this.take('prop'), x, z, ang + Math.PI / 2); }
      }
    }
    for (const lot of plan.lots) {
      const F = (k, n, s, o) => this.fill(lot, k, n, s, o), big = lot.area / 900;
      const t = lot.type;
      if (t === 'park') { if (lot.minW > 26 && R() < 0.6) F(['pad'], 1, 1, { square: true }); F(['play'], Math.ceil(2 * big)); F(['tree'], Math.ceil(18 * big), 1, { vary: true }); F(['prop'], Math.ceil(8 * big)); }
      else if (t === 'plaza') { F(['play'], 3); F(['tree'], 10, 1, { vary: true }); F(['prop'], 8); }
      else if (t === 'shops') { F(['shop'], Math.ceil(4 * big), 1, { square: true }); F(['tree', 'prop'], Math.ceil(12 * big), 1, { vary: true }); }
      else if (t === 'houses') { F(['house'], Math.ceil(4 * big), 1, { square: true }); F(['tree'], Math.ceil(10 * big), 1, { vary: true }); F(['prop', 'vehicle'], Math.ceil(5 * big)); }
      else if (t === 'tower') { F(['tower'], Math.ceil(1.6 * big), 1, { square: true }); F(['shop'], Math.ceil(2 * big), 1, { square: true }); F(['tree', 'prop'], Math.ceil(8 * big)); }
      else if (t === 'factory') { F(['factory'], Math.ceil(5 * big), 1, { square: true }); F(['vehicle', 'prop'], Math.ceil(8 * big)); }
      else if (t === 'farm') { F(['farm'], Math.ceil(10 * big)); F(['air'], 1); F(['tree'], Math.ceil(8 * big), 1, { vary: true }); }
      else if (t === 'harbour') { F(['shop'], 2, 1, { square: true }); F(['prop', 'vehicle'], Math.ceil(8 * big)); F(['air'], 1); }
      else if (t === 'stadium') F(['stadium'], 1, Math.min(1, (lot.minW - 6) / stadiumSize), { square: true });
      else if (t === 'station') { const st = this.take('station'); if (st) { lot.placed.push({ x: lot.cx, z: lot.cz, hw: st.w / 2 + 1, hd: st.d / 2 + 1 }); this.add(st, lot.cx, lot.cz, G.nearestEdge(lot.inner, lot.cx, lot.cz).ang, 1, {}); } F(['vehicle', 'prop'], 6); }
    }
    // the sea: jetties off the shore, boats out on the water and a few on the river
    const boats = [];
    for (let i = 0; i < 4; i++) { const m = this.take('harbour'); if (!m) break; const x = -H * 0.7 + i * H * 0.45 + R() * 14; if (plan.inRiver(x, plan.shore(x) - 2, 10)) continue; const z = plan.shore(x) + m.d / 2 - 2; if (z + m.d / 2 < H - 2) { this.add(m, x, z, 0); boats.push([x, z, m.d / 2]); } }
    for (let i = 0; i < 40; i++) { const x = -H + 8 + R() * (W - 16), z0 = plan.shore(x) + 6, z = z0 + R() * Math.max(0, H - 4 - z0); if (boats.some(b => Math.hypot(b[0] - x, b[1] - z) < b[2] + 6)) continue; const m = this.take('boat'); if (m) { this.add(m, x, z, R() * 6); boats.push([x, z, Math.max(m.w, m.d) / 2]); } }
    for (let i = 0; i < 6; i++) { const z = -H + 20 + R() * (plan.shore(0) - H - 30 + H), x = plan.riverX(z); const m = this.take('boat'); if (m && Math.max(m.w, m.d) < plan.RIVW * 0.8) this.add(m, x, z, Math.atan2(plan.riverX(z + 1) - x, 1)); }
    // anything that never got placed (a kind with no lot) goes in a park or shopping lot so the whole library shows up
    const used = new Set(this.objs.map(o => o.id)), hosts = plan.lots.filter(l => l.type === 'park' || l.type === 'shops');
    for (const m of Object.values(this.models)) if (!used.has(m.id) && !m.hazard && kindOf(m) !== 'station') this.fill(pick(hosts), [kindOf(m)], 3);
    // border trees on the three land sides (not edible): the edge of the map
    for (let a = -H - 6; a < H + 6; a += 5) for (const [x, z] of [[a, -H - 5], [-H - 5, a], [H + 5, a]]) { if (plan.inSea(x, z, 2)) continue; const m = this.take('tree'); this.add(m, x + R() * 2, z + R() * 2, R() * 6, 1.4, { eatable: false }); }
    extra && extra(this, R);
    this.finish();
  }

  paintGround(plan) {
    const { H, W, ring } = plan, px = Math.min(4096, this.maxTex || 4096), k = px / W, T = v => (v + H) * k;
    const cv = document.createElement('canvas'); cv.width = cv.height = px; const g = cv.getContext('2d');
    const path = p => { g.beginPath(); p.forEach((q, i) => i ? g.lineTo(T(q[0]), T(q[1])) : g.moveTo(T(q[0]), T(q[1]))); g.closePath(); };
    g.fillStyle = '#5b5670'; g.fillRect(0, 0, px, px);
    // centre-line dashes on the bigger roads
    g.strokeStyle = '#f4efe2'; g.lineWidth = 0.25 * k; g.setLineDash([2.5 * k, 3 * k]);
    for (const r of plan.roads) if (r.w >= 9) { g.beginPath(); g.moveTo(T(r.a[0]), T(r.a[1])); g.lineTo(T(r.b[0]), T(r.b[1])); g.stroke(); }
    g.setLineDash([]);
    const fillFor = { park: '#86d462', houses: '#9fdc74', shops: '#e9dcc0', tower: '#d9d1c4', factory: '#c8c0b4', farm: '#b6dc6a', stadium: '#86d462', station: '#e9dcc0', harbour: '#e3d3b0', plaza: '#86d462' };
    const lot = l => {
      path(l.poly); g.fillStyle = '#d8d0c0'; g.fill();
      const inn = G.inset(l.poly, 2); if (inn.length < 3) return; path(inn); g.fillStyle = fillFor[l.type] || '#9fdc74'; g.fill();
      if (l.type === 'farm' || l.type === 'harbour' || l.type === 'tower') { g.save(); path(inn); g.clip(); const bb = G.bbox(inn);
        if (l.type === 'farm') { g.fillStyle = 'rgba(120,80,30,.18)'; for (let z = bb.z; z < bb.z + bb.d; z += 3.4) g.fillRect(T(bb.x), T(z), bb.w * k, 1.2 * k); }
        else if (l.type === 'harbour') { g.fillStyle = 'rgba(90,60,30,.12)'; for (let x = bb.x; x < bb.x + bb.w; x += 1.6) g.fillRect(T(x), T(bb.z), 0.25 * k, bb.d * k); }
        else { g.strokeStyle = 'rgba(30,27,46,.07)'; g.lineWidth = 0.2 * k; for (let x = bb.x; x < bb.x + bb.w; x += 3) { g.beginPath(); g.moveTo(T(x), T(bb.z)); g.lineTo(T(x), T(bb.z + bb.d)); g.stroke(); } for (let z = bb.z; z < bb.z + bb.d; z += 3) { g.beginPath(); g.moveTo(T(bb.x), T(z)); g.lineTo(T(bb.x + bb.w), T(z)); g.stroke(); } }
        g.restore(); }
    };
    plan.lots.filter(l => l.type !== 'plaza').forEach(lot);
    // roundabout: asphalt ring, dashed lane, kerb, then the plaza in the middle
    const circ = (r, fill) => { g.beginPath(); g.arc(T(ring.x), T(ring.z), r * k, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
    circ(ring.out + 2, '#d8d0c0'); circ(ring.out, '#5b5670');
    g.setLineDash([2.5 * k, 3 * k]); g.strokeStyle = '#f4efe2'; g.lineWidth = 0.25 * k; g.beginPath(); g.arc(T(ring.x), T(ring.z), ring.mid * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    plan.lots.filter(l => l.type === 'plaza').forEach(lot);
    // river with sandy banks, then bridges where roads cross it
    const rz = []; for (let z = -H - 2; z < plan.shore(plan.riverX(H)) + 12; z += 3) rz.push([plan.riverX(z), z]);
    const stroke = (pts, w, c) => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(T(q[0]), T(q[1])) : g.moveTo(T(q[0]), T(q[1]))); g.strokeStyle = c; g.lineWidth = w * k; g.lineJoin = g.lineCap = 'round'; g.stroke(); };
    stroke(rz, plan.RIVW + 4, '#e8d9a8'); stroke(rz, plan.RIVW, '#3cb4e6'); stroke(rz, 2, 'rgba(255,255,255,.18)');
    g.lineCap = 'butt';
    for (const r of plan.roads) {
      const n = Math.ceil(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) / 1.5); let s0 = -1;
      for (let i = 0; i <= n + 1; i++) { const t = i / n, x = r.a[0] + (r.b[0] - r.a[0]) * t, z = r.a[1] + (r.b[1] - r.a[1]) * t, inR = i <= n && plan.inRiver(x, z, 3);
        if (inR && s0 < 0) s0 = t; if (!inR && s0 >= 0) { const P = u => [r.a[0] + (r.b[0] - r.a[0]) * u, r.a[1] + (r.b[1] - r.a[1]) * u]; const seg = [P(s0), P(Math.min(1, t))]; stroke(seg, r.w + 1.6, '#3f3a52'); stroke(seg, r.w, '#8c86a0'); stroke(seg, r.w - 1.6, '#6a6580'); s0 = -1; } }
    }
    // the sea, with a beach along the wavy shore
    const sea = off => { g.beginPath(); g.moveTo(0, px); for (let x = -H; x <= H; x += 2) g.lineTo(T(x), T(plan.shore(x) + off)); g.lineTo(px, px); g.closePath(); };
    sea(-4); g.fillStyle = '#efdfae'; g.fill(); sea(0); g.fillStyle = '#3cb4e6'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 0.4 * k; for (const off of [4, 9, 15, 22]) { g.beginPath(); for (let x = -H; x <= H; x += 2) { const z = plan.shore(x) + off + Math.sin(x / 6 + off) * 0.6; x === -H ? g.moveTo(T(x), T(z)) : g.lineTo(T(x), T(z)); } g.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.maxAniso || 8; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = patchDiscard(new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 }));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), mat); ground.receiveShadow = true;
    const off = (c, w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), patchDiscard(new THREE.MeshLambertMaterial({ color: c, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }))); m.position.set(x, -0.08, z); m.receiveShadow = true; return m; };
    this.root.add(ground, off(0x7cc75a, W + 3000, W + 1500, 0, -750), off(0x3cb4e6, W + 3000, 1500, 0, H + 750));
  }

  // House Call: a cut-away room is the arena; toys + hazards go only on clear floor (read from a
  // top-down height map of the room, so nothing ends up inside a sofa or a wall).
  buildRoom(room, hazards, seed = 3, renderer) {
    this.clear(); rnd.seed(seed); this.queues();
    room.scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (!m.userData.kp) { m.userData.kp = 1; patchMat(m, { floorY: 0.14, xray: true }); } });
    this.root.add(room.scene);
    const hm = this.heightMap(room, renderer); this.free = hm.free;
    // a background-coloured sheet just under the floor hides the hole's shaft wherever it pokes past the room's edge
    const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), patchDiscard(new THREE.MeshBasicMaterial({ color: 0x2b2162, fog: false }), 0.05)); under.position.y = -0.015; this.root.add(under);
    const w = room.w * 0.9, d = room.d * 0.9; this.bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
    // strict first (whole footprint on clear floor), then just the middle, then anywhere not inside a wall
    const spot = (rad, cb) => { for (const [k, n] of [[1, 30], [0.5, 30], [0.2, 40]]) for (let t = 0; t < n; t++) { const x = -w / 2 + rad + R() * (w - rad * 2), z = -d / 2 + rad + R() * (d - rad * 2); if (hm.free(x, z, rad * k) && !this.objs.some(o => Math.hypot(o.x - x, o.z - z) < (o.fr + rad) * k)) return cb(x, z); } };
    this.spot = spot;
    for (const m of Object.values(hazards)) spot(Math.max(m.w, m.d) * 0.25, (x, z) => this.add(m, x, z, R() * 6, 0.5));
    const toys = (k, n, s) => { for (let i = 0; i < n; i++) { const m = this.take(k); if (m) { const sc = s / Math.max(m.w, m.d); spot(s / 2, (x, z) => this.add(m, x, z, R() * 6, sc)); } } };
    // the player's start: the clearest spot nearest the middle
    this.start = [0, 0];
    for (let rr = 0; rr < Math.min(w, d) / 2; rr += 0.1) { let hit = false; for (let a = 0; a < 16; a++) { const x = Math.cos(a / 16 * 6.283) * rr, z = Math.sin(a / 16 * 6.283) * rr; if (hm.free(x, z, 0.3)) { this.start = [x, z]; hit = true; break; } } if (hit) break; }
    const sx = this.start[0], sz = this.start[1];
    toys('prop', 40, 0.16); toys('vehicle', 24, 0.32); toys('tree', 10, 0.25); toys('house', 4, 0.7); toys('play', 4, 0.5);
    // keep the start spot itself empty so round one doesn't begin with a gulp
    this.objs = this.objs.filter(o => Math.hypot(o.x - sx, o.z - sz) > 0.22 + o.fr * 0.5 || o.m.hazard ? true : false);
    for (const o of this.objs) if (o.m.hazard && Math.hypot(o.x - sx, o.z - sz) < 0.3) spot(o.fr, (x, z) => { o.x = x; o.z = z; });
    this.finish();
  }
  heightMap(room, renderer) {
    const N = 192, W = room.w + 1, D = room.d + 1, rt = new THREE.WebGLRenderTarget(N, N);
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0.1, 30); cam.position.set(0, 20, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(1, 1, 1);
    sc.overrideMaterial = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'varying float vY; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }', fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(clamp(vY / 3.0, 0.0, 1.0), 0.0, 0.0, 1.0); }' });
    const parent = room.scene.parent; sc.add(room.scene);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sc, cam); const px = new Uint8Array(N * N * 4); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); renderer.setRenderTarget(prev);
    parent && parent.add(room.scene); rt.dispose(); sc.overrideMaterial.dispose();
    const h = new Float32Array(N * N), bins = new Uint32Array(150);
    for (let i = 0; i < N * N; i++) { h[i] = px[i * 4] / 255 * 3; if (h[i] < 1.5) bins[Math.floor(h[i] / 0.01)]++; }
    // the floor is the most common low height (a few stray low pixels are slab edges); move the room so it sits at y = 0
    let F = 0, best = 0; for (let b = 0; b < 60; b++) if (bins[b] > best) { best = bins[b]; F = b * 0.01 + 0.005; }
    if (!room.floorFixed) { room.scene.position.y -= F; room.floorFixed = F; } else F = room.floorFixed;
    for (let i = 0; i < N * N; i++) h[i] -= F;
    const lo = 0, lim = 0.14; this._hm = { h, lo, N, W, D };
    const free = (x, z, rad = 0.05) => {
      const x0 = Math.floor(((x - rad) / W + 0.5) * N), x1 = Math.floor(((x + rad) / W + 0.5) * N), z0 = Math.floor((0.5 - (z + rad) / D) * N), z1 = Math.floor((0.5 - (z - rad) / D) * N);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { if (i < 0 || j < 0 || i >= N || j >= N || h[j * N + i] > lim) return false; }
      return true;
    };
    return { free };
  }

  finish() {
    // One BatchedMesh per material: a single draw call (with per-object frustum culling) for every
    // model that shares it, instead of one draw per model part.
    // Buildings and small things go in separate batches (per material) so the small ones can stop casting
    // shadows when zoomed right out (shadowMode) while buildings keep a cheap one.
    const groups = new Map();
    for (const o of this.objs) {
      const kind = kindOf(o.m), pad = kind === 'pad', bld = BUILDINGS.has(kind); o.inst = []; o.pad = pad; o.lod = 0;
      for (const p of o.m.parts) {
        const mat = matFor(p.material, pad), key = mat.uuid + (bld ? '|b' : '|s');
        let g = groups.get(key); if (!g) groups.set(key, g = { mat, geos: new Map(), n: 0, v: 0, i: 0, pad, small: !bld && !pad });
        // full detail first, then the simplified levels (lod.js), all in the same BatchedMesh
        const levels = [p.geometry, ...lodsFor(p.geometry, p.material)];
        for (const geo of levels) if (!g.geos.has(geo)) { g.geos.set(geo, -1); g.v += geo.attributes.position.count; g.i += geo.index.count; }
        g.n++; o.inst.push([g, levels]);
      }
    }
    for (const g of groups.values()) {
      const bm = new THREE.BatchedMesh(g.n, g.v, g.i, g.mat); bm.sortObjects = false; bm.frustumCulled = false; bm.perObjectFrustumCulled = true;
      bm.castShadow = !g.pad && !(g.small && this.farShadows); bm.receiveShadow = g.pad; bm.userData.small = g.small;
      for (const geo of g.geos.keys()) g.geos.set(geo, bm.addGeometry(geo));
      g.bm = bm; this.root.add(bm); this.meshes.push(bm);
    }
    // o.inst: [batchedMesh, instanceId, geometryIds per level]
    for (const o of this.objs) { o.inst = o.inst.map(([g, levels]) => { const ids = levels.map(geo => g.geos.get(geo)); return [g.bm, g.bm.addInstance(ids[0]), ids.length > 1 ? ids : null]; }); o.idx = o.inst.length ? o.inst[0][1] : 0; this.write(o); }
    for (const o of this.objs) { if (o.fr > 9) { o.big = true; this.big.push(o); } else this.rebucket(o); }
    this.totalArea = this.objs.filter(o => o.eatable).reduce((a, o) => a + o.area, 0); this.eatenArea = 0;
  }
  key(x, z) { return (Math.floor(x / 8) + 500) * 1000 + Math.floor(z / 8) + 500; }
  near(x, z, r, out = []) {
    if (!Number.isFinite(x + z + r)) return out;
    const a = Math.floor((x - r) / 8), b = Math.floor((x + r) / 8), c = Math.floor((z - r) / 8), d = Math.floor((z + r) / 8);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const l = this.grid.get((i + 500) * 1000 + j + 500); if (l) for (const o of l) out.push(o); }
    for (const o of this.big) out.push(o);
    return out;
  }
  write(o) {
    if (o.state === 3) { for (const [bm, id] of o.inst) bm.setVisibleAt(id, false); return; }
    if (o.q) Q.copy(o.q); else Q.setFromAxisAngle(Y, o.rot);
    M.compose(P.set(o.x, o.y, o.z), Q, S.setScalar(o.s));
    for (const [bm, id] of o.inst) bm.setMatrixAt(id, M);
  }
  // is (x, z) clear of standing objects? (critters use it to walk round things)
  clearAt(x, z, rad) {
    if (this.free) return this.free(x, z, rad);
    const l = this.near(x, z, 6, this._q || (this._q = [])); let ok = true;
    for (const o of l) if (o.state === 0 && o.fr > 0.6 && Math.abs(o.x - x) < o.fr * 0.8 + rad && Math.abs(o.z - z) < o.fr * 0.8 + rad) { ok = false; break; }
    l.length = 0; return ok;
  }

  // Physics (physics.js) owns everything near a hole; the world just hands it the holes.
  update(dt, holes) { if (this.phys) this.phys.update(dt, holes); }
  // level of detail + tiny-thing culling by size on screen (lod.js); called every frame, throttled inside
  lod(cam, perf, wide) { if (this.objs.length && this.meshes.length) lodPass(this, cam, perf, false, wide); }
  // far = zoomed right out: only buildings cast shadows
  shadowMode(far) { this.farShadows = far; for (const bm of this.meshes) if (bm.userData.small) bm.castShadow = !far; }
  unbucket(o) { if (o.big) return; const l = this.grid.get(o.key); if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); } }
  rebucket(o) { if (o.big) return; o.key = this.key(o.x, o.z); (this.grid.get(o.key) || this.grid.set(o.key, []).get(o.key)).push(o); }
  remaining(pred) { return this.objs.filter(o => o.eatable && o.state !== 3 && pred(o)).length; }
}
const Y = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), AX = new THREE.Vector3();
// Object materials get the x-ray patch; flat ground pads (parks, car parks, courts) get their own copy that
// also lets the hole cut through them, so the opening never disappears under a park.
const padMats = new Map();
function matFor(m, pad) {
  if (!pad) { if (!m.userData.kp) { m.userData.kp = 1; patchMat(m, { xray: true, under: true }); } return m; }
  if (!padMats.has(m)) { const c = m.clone(); c.polygonOffset = true; c.polygonOffsetFactor = -1; c.polygonOffsetUnits = -2; patchMat(c, { floorY: 0.6, xray: true, under: true }); padMats.set(m, c); }
  return padMats.get(m);
}
