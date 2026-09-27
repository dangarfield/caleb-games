/* physics.js — the Crazy Golf simulation. Pure JS, no three.js, deterministic at a fixed step.
 * The game renders from it; tests/solver.mjs plays every hole with it headlessly.
 *
 * Plane: x right, z down-screen. The ball rolls on a flat felt at y = 0.
 * Hazards are plain data on the hole (see holes.js); buildWorld turns them into colliders,
 * zones, triggers and movers, and Sim steps the ball through them. */

import { fillet, pointInPoly, ellipse, rect, ccw, path as corridor } from './geometry.js';

export const BALL_R = 0.22;
export const MAX_SPEED = 14.37;         // full-power putt, units/s (~22.5 units of roll)
const FR_A = 1.6, FR_B = 0.35;          // rolling drag: constant + linear
const WALL_E = 0.72;
const REST_SPEED = 0.07;
export const DIFF = {
  easy:   { cupR: 0.62, capSpeed: 7.0, dots: 12, hz: 1.0 },
  normal: { cupR: 0.46, capSpeed: 6.0, dots: 7,  hz: 1.0 },
  hard:   { cupR: 0.42, capSpeed: 5.4, dots: 3,  hz: 1.2 },
};
export const LOOP_MIN = 5.4;            // speed needed to make it round a loop
/* zones the ball can roll on (friction multiplier) vs zones that swallow it (ball goes back, no penalty stroke) */
export const SURFACES = { grav: 0.18, ice: 0.12, toffee: 3.4, sand: 3.8 };
export const HAZARD_ZONES = ['water', 'lava', 'choc', 'quick'];
export const PUSH_ZONES = { boost: 26, belt: 5.5 };   // acceleration along the zone's arrow

/* ---------- building ---------- */

export function islandsOf(hole) {
  return [hole.shape, ...(hole.islands || [])].map(s => ccw(fillet(ccw(s), hole.round ?? 0.9)));
}
export function zonePoly(h) {
  if (h.pts) return ccw(fillet(ccw(h.pts), h.round ?? 0.6));
  return ellipse(h.x, h.z, h.rx, h.rz, 30, h.rot || 0);
}
const V = (a) => [Math.cos(a), Math.sin(a)];

export function buildWorld(hole) {
  const W = {
    hole, islands: islandsOf(hole), segs: [], circles: [], zones: [], gaps: [], triggers: [], movers: [],
    loops: [], windmills: [], blocks: [], sweepers: [], pistons: [], tee: hole.tee.slice(), cup: hole.cup.slice(),
    gems: (hole.gems || []).map(g => g.slice()),
  };
  let obj = 0;
  const addPoly = (pts, inner, tag) => {
    const id = obj++;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      W.segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], inner, obj: id, tag });
    }
    return id;
  };
  W.islands.forEach(p => addPoly(p, false, 'edge'));

  for (const h of hole.hz || []) {
    switch (h.t) {
      case 'block': {
        const pts = h.pts ? ccw(h.pts) : rect(h.x, h.z, h.w, h.d, h.rot || 0);
        const sm = ccw(fillet(pts, h.round ?? 0.25, 3));
        W.blocks.push({ pts: sm, h, obj: addPoly(sm, true, 'block') });
        break;
      }
      case 'post': W.circles.push({ x: h.x, z: h.z, r: h.r || 0.45, e: WALL_E, obj: obj++, inner: true, tag: 'post' }); break;
      case 'bumper': W.circles.push({ x: h.x, z: h.z, r: h.r || 0.5, e: 1.35, boost: 5.5, obj: obj++, inner: false, tag: 'bumper', h }); break;
      case 'water': case 'lava': case 'choc': case 'quick':
      case 'grav': case 'ice': case 'toffee': case 'sand': W.zones.push({ t: h.t, pts: zonePoly(h), h }); break;
      case 'boost': case 'belt': {
        const pts = h.pts ? ccw(h.pts) : rect(h.x, h.z, h.len || 1.6, h.w || 1.2, h.a);
        const [dx, dz] = V(h.a);
        W.zones.push({ t: h.t, pts, h, dx, dz, force: h.force || PUSH_ZONES[h.t] });
        break;
      }
      case 'sweep': {
        W.sweepers.push({ h, x: h.x, z: h.z, len: h.len || 1.6, spd: h.spd || 1.4, arms: h.arms || 2, r: 0.13 });
        W.circles.push({ x: h.x, z: h.z, r: 0.28, e: WALL_E, obj: obj++, inner: true, tag: 'post', hub: true });
        break;
      }
      case 'piston': {
        const [dx, dz] = V(h.a);
        W.pistons.push({ h, x: h.x, z: h.z, dx, dz, nx: -dz, nz: dx, w: h.w || 3, d: h.d || 0.5, per: h.per || 3, duty: h.duty ?? 0.5 });
        break;
      }
      case 'windmill': {
        const w = h.w || 3.4, d = h.d || 1.5, gap = h.gap || 1.05, [dx, dz] = V(h.a), nx = -dz, nz = dx;
        const side = (w - gap) / 2, off = gap / 2 + side / 2;
        for (const s of [1, -1]) {
          const cx = h.x + nx * off * s, cz = h.z + nz * off * s;
          const pts = ccw(fillet(rect(cx, cz, d, side, h.a), 0.18, 3));
          W.blocks.push({ pts, h, windmill: true, obj: addPoly(pts, true, 'windmill') });
        }
        const fx = h.x - dx * (d / 2 + 0.05), fz = h.z - dz * (d / 2 + 0.05);   // entrance face
        W.windmills.push({ h, spd: h.spd || 1.3, blades: h.blades || 4,
          seg: { ax: fx + nx * gap / 2, az: fz + nz * gap / 2, bx: fx - nx * gap / 2, bz: fz - nz * gap / 2, inner: true, obj: obj++, tag: 'blade' } });
        break;
      }
      case 'loop': {
        const len = h.len || 4.4, gap = h.gap || 1.25, [dx, dz] = V(h.a), nx = -dz, nz = dx;
        for (const s of [1, -1]) {
          const cx = h.x + nx * (gap / 2 + 0.12) * s, cz = h.z + nz * (gap / 2 + 0.12) * s;
          const pts = ccw(fillet(rect(cx, cz, len, 0.24, h.a), 0.1, 2));
          W.blocks.push({ pts, h, rail: true, obj: addPoly(pts, true, 'rail') });
        }
        W.loops.push({ h, x: h.x, z: h.z, dx, dz, nx, nz, gap });
        break;
      }
      case 'ramp': {
        const [dx, dz] = V(h.a), nx = -dz, nz = dx, len = h.len || 1.8, w = h.w || 3;
        const pts = rect(h.x, h.z, len, w, h.a);
        W.gaps.push({ h, pts, x: h.x, z: h.z, dx, dz, nx, nz, len, w, pw: h.pw || 1.2, amp: h.amp ?? (w - (h.pw || 1.2)) / 2, spd: h.spd || 1.1 });
        break;
      }
      case 'portal': W.triggers.push({ t: 'portal', x: h.a[0], z: h.a[1], r: 0.42, h }); break;
      case 'cannon': W.triggers.push({ t: 'cannon', x: h.x, z: h.z, r: 0.55, h }); break;
      case 'idol': {
        const [fx, fz] = V(h.face), s = h.size || 2.2;
        const pts = ccw(fillet(rect(h.x, h.z, s, s, h.face), 0.35, 3));
        W.blocks.push({ pts, h, idol: true, obj: addPoly(pts, true, 'idol') });
        W.triggers.push({ t: 'idol', x: h.x + fx * (s / 2 + 0.25), z: h.z + fz * (s / 2 + 0.25), r: 0.5, h });
        break;
      }
      case 'vine': W.movers.push({ t: 'vine', h, r: h.r || 0.42, e: 0.85 }); break;
      case 'ghost': W.movers.push({ t: 'ghost', h, r: h.r || 0.5, e: 0.9, loop: h.pts.concat([h.pts[0]]) }); break;
      case 'roller': W.movers.push({ t: 'roller', h, r: h.r || 0.45, e: 0.85, loop: h.pts.concat([h.pts[0]]) }); break;
      default: break;
    }
  }
  buildGrid(W);
  return W;
}

/* uniform grid broadphase over static segments + circles */
function buildGrid(W) {
  const C = 1.0, pad = BALL_R + 0.1;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of W.islands) for (const [x, z] of p) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C);
  const cells = Array.from({ length: nx * nz }, () => []);
  const put = (item, ax, az, bx, bz) => {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + pad - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - pad - z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz) + pad - z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(item);
  };
  W.segs.forEach(s => put(s, s.ax, s.az, s.bx, s.bz));
  W.circles.forEach(c => { c.circle = true; put(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r); });
  W.grid = { C, x0, z0, nx, nz, cells };
}
function near(W, x, z) {
  const g = W.grid, i = Math.floor((x - g.x0) / g.C), j = Math.floor((z - g.z0) / g.C);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return [];
  return g.cells[j * g.nx + i];
}

/* ---------- movers as functions of the hazard clock ---------- */

export function moverPos(m, t, hz = 1) {
  const h = m.h;
  if (m.t === 'vine') {
    const per = (h.per || 3.2) / hz, [dx, dz] = V(h.a), s = Math.sin((t + (h.ph || 0)) * Math.PI * 2 / per) * (h.amp ?? 1.5);
    return [h.x + dx * s, h.z + dz * s];
  }
  const per = (h.per || 6) / hz, L = m.loop;
  let tot = 0; const lens = [];
  for (let i = 0; i < L.length - 1; i++) { const l = Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]); lens.push(l); tot += l; }
  let u = (((t + (h.ph || 0)) / per) % 1 + 1) % 1 * tot;
  for (let i = 0; i < lens.length; i++) {
    if (u <= lens[i]) { const k = u / lens[i]; return [L[i][0] + (L[i + 1][0] - L[i][0]) * k, L[i][1] + (L[i + 1][1] - L[i][1]) * k]; }
    u -= lens[i];
  }
  return L[0];
}
export function windmillAngle(wm, t, hz = 1) { return t * wm.spd * hz + (wm.h.ph || 0); }
export function bladeBlocks(wm, t, hz = 1) {
  const n = wm.blades, a = windmillAngle(wm, t, hz);
  // a blade points straight down when (a + k*2π/n) ≡ 0 (mod 2π)
  const step = Math.PI * 2 / n; let r = ((a % step) + step) % step; r = Math.min(r, step - r);
  return r < 0.28;
}
export function plankOffset(g, t, hz = 1) { return Math.sin((t + (g.h.ph || 0)) * g.spd * hz) * g.amp; }
export function sweepAngle(sw, t, hz = 1) { return (sw.h.ph || 0) + t * sw.spd * hz; }
/* 0 = fully down, 1 = fully up; eased so the block pauses at the top and bottom */
export function pistonLift(p, t, hz = 1) {
  const per = p.per / hz, f = ((((t + (p.h.ph || 0)) / per) % 1) + 1) % 1, ramp = 0.1;
  const up0 = 0, up1 = p.duty;
  if (f < up0 + ramp) return f / ramp;
  if (f < up1) return 1;
  if (f < up1 + ramp) return 1 - (f - up1) / ramp;
  return 0;
}

/* ---------- the sim ---------- */

export class Sim {
  constructor(world, opts = {}) {
    this.W = world;
    this.diff = DIFF[opts.diff || 'normal'];
    this.hz = this.diff.hz;
    this.t = opts.t || 0;
    this.b = { x: world.tee[0], z: world.tee[1], vx: 0, vz: 0, y: BALL_R, scale: 1, hidden: false };
    this.mode = 'rest';          // rest | roll | script | sunk
    this.lastRest = [world.tee[0], world.tee[1]];
    this.script = null;
    this.gemsTaken = world.gems.map(() => false);
    this.events = [];
    this.rollTime = 0; this.lipCool = 0; this.inGrav = false;
    this.lastPlank = null;
    this.cool = new Map();
  }
  get resting() { return this.mode === 'rest'; }

  shoot(dx, dz, power) {
    if (this.mode !== 'rest') return false;
    const l = Math.hypot(dx, dz) || 1, sp = Math.max(0, Math.min(1, power)) * MAX_SPEED;
    this.b.vx = dx / l * sp; this.b.vz = dz / l * sp;
    this.lastRest = [this.b.x, this.b.z];
    this.mode = 'roll'; this.rollTime = 0;
    this.events.push({ type: 'putt', power });
    return true;
  }

  /* advance by dt seconds; returns and clears the event list */
  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
    const ev = this.events; this.events = [];
    return ev;
  }

  step(h) {
    this.t += h;
    const b = this.b;
    if (this.mode === 'script') { this.runScript(h); return; }
    if (this.mode === 'rest') { this.carryOnPlank(); this.restNudges(); if (this.mode !== 'roll') return; }
    if (this.mode !== 'roll') return;
    this.rollTime += h;
    const sp = Math.hypot(b.vx, b.vz);
    const sub = Math.max(1, Math.ceil(sp * h / (BALL_R * 0.4)));
    const hh = h / sub;
    for (let k = 0; k < sub && this.mode === 'roll'; k++) this.sub(hh);
  }

  sub(h) {
    const b = this.b, W = this.W;
    // drag
    let sp = Math.hypot(b.vx, b.vz);
    const surf = this.surfaceAt(b.x, b.z);
    this.inGrav = !!surf && surf.t === 'grav';
    this.surface = surf ? surf.t : null;
    let fr = (FR_A + FR_B * sp) * (surf && SURFACES[surf.t] ? SURFACES[surf.t] : 1);
    if (surf && surf.force) { b.vx += surf.dx * surf.force * h; b.vz += surf.dz * surf.force * h; sp = Math.hypot(b.vx, b.vz); if (sp > MAX_SPEED * 1.1) { b.vx *= MAX_SPEED * 1.1 / sp; b.vz *= MAX_SPEED * 1.1 / sp; sp = MAX_SPEED * 1.1; } }
    { // gentle pull into the cup when rolling slowly past its lip
      const cx = W.cup[0] - b.x, cz = W.cup[1] - b.z, d = Math.hypot(cx, cz);
      if (d < this.diff.cupR + 0.25 && sp < 2.2 && d > 0.01) { b.vx += cx / d * 3 * h; b.vz += cz / d * 3 * h; sp = Math.hypot(b.vx, b.vz); }
    }
    if (sp > 0) { const ns = Math.max(0, sp - fr * h); b.vx *= ns / sp; b.vz *= ns / sp; sp = ns; }
    if (surf && surf.force && sp < 0.5) { b.vx += surf.dx * 0.5; b.vz += surf.dz * 0.5; }   // belts never let a ball stop on them
    const px = b.x, pz = b.z;
    b.x += b.vx * h; b.z += b.vz * h;

    this.collideStatic();
    this.collideMovers(h);
    this.collideSweepers(h);
    this.collidePistons();
    if (this.checkLoops(px, pz)) return;
    if (this.checkTriggers()) return;
    if (this.checkZones()) return;
    if (this.checkGaps()) return;
    this.checkGems();
    if (this.checkCup()) return;

    if (Math.hypot(b.vx, b.vz) < REST_SPEED || this.rollTime > 30) this.toRest();
  }

  toRest() {
    const b = this.b;
    b.vx = b.vz = 0; this.mode = 'rest';
    if (!this.onCourse(b.x, b.z) || this.insideInner(b.x, b.z) >= 0) { b.x = this.lastRest[0]; b.z = this.lastRest[1]; this.events.push({ type: 'reset' }); }
    this.lastRest = [b.x, b.z];
    this.events.push({ type: 'rest', x: b.x, z: b.z });
  }

  onCourse(x, z) { return this.W.islands.some(p => pointInPoly(x, z, p)); }
  /* the inner obstacle (block or post) the ball centre is inside, or -1 */
  insideInner(x, z) {
    for (const b of this.W.blocks) if (pointInPoly(x, z, b.pts)) return b.obj;
    for (const c of this.W.circles) if (c.inner && Math.hypot(x - c.x, z - c.z) < c.r + BALL_R * 0.5) return c.obj;
    return -1;
  }
  surfaceAt(x, z) {
    for (const zn of this.W.zones) if (!HAZARD_ZONES.includes(zn.t) && pointInPoly(x, z, zn.pts)) return zn;
    return null;
  }
  /* a moving arm/roller/belt reaching a ball that is sitting still sets it rolling */
  restNudges() {
    const b = this.b, zn = this.surfaceAt(b.x, b.z);
    if (zn && zn.force) { b.vx = zn.dx * 0.6; b.vz = zn.dz * 0.6; this.startRoll(); return; }
    const vx0 = b.vx, vz0 = b.vz;
    this.collideMovers(1 / 120); this.collideSweepers(1 / 120); this.collidePistons();
    if (Math.hypot(b.vx - vx0, b.vz - vz0) > 0.05) this.startRoll();
  }
  startRoll() { this.mode = 'roll'; this.rollTime = 0; this.lastRest = [this.b.x, this.b.z]; }
  inZone(t, x, z) {
    for (const zn of this.W.zones) if (zn.t === t && pointInPoly(x, z, zn.pts)) return zn;
    return null;
  }

  collideStatic() {
    const b = this.b, R = BALL_R;
    const list = near(this.W, b.x, b.z);
    for (const s of list) {
      if (s.circle) { this.hitCircle(s); continue; }
      this.hitSeg(s);
    }
    for (const wm of this.W.windmills) if (bladeBlocks(wm, this.t, this.hz)) this.hitSeg(wm.seg);
    void R;
  }
  hitSeg(s) {
    const b = this.b, R = BALL_R;
    const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez;
    let u = ((b.x - s.ax) * ex + (b.z - s.az) * ez) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = s.ax + ex * u, cz = s.az + ez * u;
    let dx = b.x - cx, dz = b.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = -ez; dz = ex; d = Math.hypot(dx, dz); }
    const nx = dx / d, nz = dz / d;
    b.x = cx + nx * R; b.z = cz + nz * R;
    this.bounce(nx, nz, s.tag === 'blade' ? 0.5 : null, s.tag);
  }
  hitCircle(c) {
    const b = this.b, R = BALL_R + c.r;
    let dx = b.x - c.x, dz = b.z - c.z; const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d;
    b.x = c.x + nx * R; b.z = c.z + nz * R;
    if (c.tag === 'bumper') {
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) { b.vx -= (1 + c.e) * vn * nx; b.vz -= (1 + c.e) * vn * nz; }
      const sp = Math.hypot(b.vx, b.vz), out = Math.max(sp, c.boost);
      const cap = Math.min(out, MAX_SPEED * 1.05);
      if (sp > 0) { b.vx *= cap / sp; b.vz *= cap / sp; }
      this.events.push({ type: 'bumper', h: c.h });
      return;
    }
    this.bounce(nx, nz, null, c.tag);
  }
  bounce(nx, nz, eOverride, tag) {
    const b = this.b, vn = b.vx * nx + b.vz * nz;
    if (vn >= 0) return;
    const e = eOverride ?? WALL_E;
    b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
    b.vx *= 0.97; b.vz *= 0.97;
    if (-vn > 0.4) this.events.push({ type: 'wall', v: -vn, tag });
  }

  collideMovers(h) {
    const b = this.b;
    for (const m of this.W.movers) {
      const p = moverPos(m, this.t, this.hz), q = moverPos(m, this.t - h, this.hz);
      const ux = (p[0] - q[0]) / h, uz = (p[1] - q[1]) / h;
      const R = BALL_R + m.r; let dx = b.x - p[0], dz = b.z - p[1]; const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d;
      b.x = p[0] + nx * R; b.z = p[1] + nz * R;
      const wx = b.vx - ux, wz = b.vz - uz, wn = wx * nx + wz * nz;
      if (wn < 0) { b.vx -= (1 + m.e) * wn * nx; b.vz -= (1 + m.e) * wn * nz; }
      if (m.t === 'ghost') {       // spooked: a deterministic wobble off-line
        const s = (Math.floor(this.t * 7) % 2 ? 1 : -1) * 0.55, c = Math.cos(s), sn = Math.sin(s);
        const vx = b.vx * c - b.vz * sn, vz = b.vx * sn + b.vz * c; b.vx = vx; b.vz = vz;
        const sp = Math.hypot(b.vx, b.vz); if (sp < 2.5) { b.vx *= 2.5 / (sp || 1); b.vz *= 2.5 / (sp || 1); }
      }
      const cd = this.cool.get(m) || 0;
      if (this.t > cd) { this.events.push({ type: m.t === 'ghost' ? 'spook' : m.t === 'roller' ? 'bonk' : 'vine', h: m.h }); this.cool.set(m, this.t + 0.4); }
    }
  }

  /* rotating arms: a moving capsule; the contact point moves at ω × r */
  collideSweepers(h) {
    const b = this.b;
    for (const sw of this.W.sweepers) {
      const a = sweepAngle(sw, this.t, this.hz), w = sw.spd * this.hz;
      for (let k = 0; k < sw.arms; k++) {
        const ang = a + k * Math.PI * 2 / sw.arms, ex = Math.cos(ang) * sw.len, ez = Math.sin(ang) * sw.len;
        let u = ((b.x - sw.x) * ex + (b.z - sw.z) * ez) / (sw.len * sw.len); u = u < 0 ? 0 : u > 1 ? 1 : u;
        const cx = sw.x + ex * u, cz = sw.z + ez * u, R = BALL_R + sw.r;
        let dx = b.x - cx, dz = b.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d;
        b.x = cx + nx * R; b.z = cz + nz * R;
        const rx = cx - sw.x, rz = cz - sw.z, ux = -w * rz, uz = w * rx;          // arm velocity at the contact
        const wx = b.vx - ux, wz = b.vz - uz, wn = wx * nx + wz * nz;
        if (wn < 0) { b.vx -= 1.8 * wn * nx; b.vz -= 1.8 * wn * nz; }
        const cd = this.cool.get(sw) || 0;
        if (this.t > cd) { this.events.push({ type: 'sweep', h: sw.h }); this.cool.set(sw, this.t + 0.4); }
      }
    }
  }

  /* crusher gates: a block across the whole path that rises and falls */
  collidePistons() {
    const b = this.b;
    for (const p of this.W.pistons) {
      if (pistonLift(p, this.t, this.hz) < 0.5) continue;
      const u = (b.x - p.x) * p.dx + (b.z - p.z) * p.dz, v = (b.x - p.x) * p.nx + (b.z - p.z) * p.nz;
      const hu = p.d / 2 + BALL_R;
      if (Math.abs(u) >= hu || Math.abs(v) >= p.w / 2 + 0.05) continue;
      const side = u >= 0 ? 1 : -1, push = side * hu - u;
      b.x += p.dx * push; b.z += p.dz * push;
      const vn = (b.vx * p.dx + b.vz * p.dz) * side;
      if (vn < 0) { b.vx -= 1.5 * vn * p.dx * side; b.vz -= 1.5 * vn * p.dz * side; if (-vn > 0.4) this.events.push({ type: 'wall', v: -vn, tag: 'piston' }); }
    }
  }

  checkLoops(px, pz) {
    const b = this.b;
    for (const L of this.W.loops) {
      const u0 = (px - L.x) * L.dx + (pz - L.z) * L.dz, u1 = (b.x - L.x) * L.dx + (b.z - L.z) * L.dz;
      const lat = (b.x - L.x) * L.nx + (b.z - L.z) * L.nz;
      if (Math.abs(lat) > L.gap / 2 + 0.1) continue;
      if ((u0 < 0) === (u1 < 0)) continue;
      const dir = u1 > u0 ? 1 : -1, sp = Math.hypot(b.vx, b.vz);
      if (sp >= LOOP_MIN) {
        this.startScript({ kind: 'loop', dur: 0.85, L, dir, sp, lat });
        this.events.push({ type: 'loop' });
      } else {
        b.vx = -b.vx * 0.65; b.vz = -b.vz * 0.65; b.x = px; b.z = pz;
        this.startScript({ kind: 'loopFail', dur: 0.55, L, dir, sp, lat, from: [px, pz] });
        this.events.push({ type: 'loopFail' });
      }
      return true;
    }
    return false;
  }

  checkTriggers() {
    const b = this.b;
    for (const tr of this.W.triggers) {
      const d = Math.hypot(b.x - tr.x, b.z - tr.z);
      if (d > tr.r) continue;
      const sp = Math.hypot(b.vx, b.vz), h = tr.h;
      if (tr.t === 'portal') {
        const dir = h.dir != null ? V(h.dir) : [b.vx / (sp || 1), b.vz / (sp || 1)];
        this.startScript({ kind: 'portal', dur: 0.5, from: [tr.x, tr.z], to: h.b, dir, sp: Math.max(sp, 2.2) });
        this.events.push({ type: 'portal' });
      } else if (tr.t === 'idol') {
        const dir = V(h.dir ?? 0);
        this.startScript({ kind: 'idol', dur: 0.9, from: [tr.x, tr.z], to: h.to, dir, sp: Math.max(sp * 0.8, h.out || 3.5) });
        this.events.push({ type: 'idol' });
      } else if (tr.t === 'cannon') {
        this.startScript({ kind: 'cannon', dur: 1.75, from: [h.x, h.z], to: h.to, sp });
        this.events.push({ type: 'cannonIn', h });
      }
      return true;
    }
    return false;
  }

  checkZones() {
    const b = this.b;
    for (const zn of this.W.zones) {
      if (!HAZARD_ZONES.includes(zn.t)) continue;
      if (pointInPoly(b.x, b.z, zn.pts)) {
        this.startScript({ kind: 'splash', dur: 0.8, zt: zn.t, at: [b.x, b.z] });
        this.events.push({ type: 'splash', kind: zn.t, x: b.x, z: b.z });
        return true;
      }
    }
    return false;
  }

  gapAt(x, z) {
    for (const g of this.W.gaps) {
      const u = (x - g.x) * g.dx + (z - g.z) * g.dz, v = (x - g.x) * g.nx + (z - g.z) * g.nz;
      if (Math.abs(u) < g.len / 2 && Math.abs(v) < g.w / 2) return { g, u, v };
    }
    return null;
  }
  checkGaps() {
    const b = this.b, hit = this.gapAt(b.x, b.z);
    if (!hit) return false;
    const off = plankOffset(hit.g, this.t, this.hz);
    if (Math.abs(hit.v - off) <= hit.g.pw / 2) return false;          // on the plank
    this.startScript({ kind: 'fall', dur: 0.7, at: [b.x, b.z], v: [b.vx, b.vz] });
    this.events.push({ type: 'fall', x: b.x, z: b.z });
    return true;
  }
  carryOnPlank() {
    const b = this.b, hit = this.gapAt(b.x, b.z);
    if (!hit) { this.lastPlank = null; return; }
    const off = plankOffset(hit.g, this.t, this.hz);
    if (this.lastPlank && this.lastPlank.g === hit.g) {
      const d = off - this.lastPlank.off; b.x += hit.g.nx * d; b.z += hit.g.nz * d;
      this.lastRest = [b.x, b.z];
    }
    this.lastPlank = { g: hit.g, off };
  }

  checkGems() {
    const b = this.b;
    this.W.gems.forEach((g, i) => {
      if (this.gemsTaken[i]) return;
      if (Math.hypot(b.x - g[0], b.z - g[1]) < 0.55) { this.gemsTaken[i] = true; this.events.push({ type: 'gem', i }); }
    });
  }

  checkCup() {
    const b = this.b, c = this.W.cup, d = Math.hypot(b.x - c[0], b.z - c[1]);
    const sp = Math.hypot(b.vx, b.vz), cap = this.diff.capSpeed;
    if (this.lipCool > 0 && d > this.diff.cupR) this.lipCool = 0;
    if (d < this.diff.cupR) {
      if (sp < cap) {
        this.startScript({ kind: 'sink', dur: 0.4, from: [b.x, b.z] });
        this.events.push({ type: 'sink' });
        return true;
      }
      if (!this.lipCool) {
        this.lipCool = 1;
        const cross = (c[0] - b.x) * b.vz - (c[1] - b.z) * b.vx, a = Math.sign(cross || 1) * 0.35, co = Math.cos(a), si = Math.sin(a);
        const vx = (b.vx * co - b.vz * si) * 0.72, vz = (b.vx * si + b.vz * co) * 0.72; b.vx = vx; b.vz = vz;
        this.events.push({ type: 'lip' });
      }
    }
    return false;
  }

  startScript(s) { s.t = 0; this.script = s; this.mode = 'script'; }

  runScript(h) {
    const s = this.script, b = this.b;
    s.t += h;
    const k = Math.min(1, s.t / s.dur);
    b.hidden = false; b.scale = 1; b.y = BALL_R;
    switch (s.kind) {
      case 'loop': {
        const L = s.L, R = 1.0, th = k * Math.PI * 2;
        const along = Math.sin(th) * R * s.dir, lift = R * (1 - Math.cos(th));
        const shift = (k - 0.5) * 0.35;                                 // corkscrew sideways a touch
        b.x = L.x + L.dx * along + L.nx * (s.lat + shift * 0); b.z = L.z + L.dz * along + L.nz * s.lat;
        b.y = BALL_R + lift;
        if (k >= 1) {
          const sp = s.sp * 0.88;
          b.x = L.x + L.dx * 0.06 * s.dir; b.z = L.z + L.dz * 0.06 * s.dir; b.y = BALL_R;
          b.vx = L.dx * s.dir * sp; b.vz = L.dz * s.dir * sp; this.endScript('roll');
        }
        void shift;
        break;
      }
      case 'loopFail': {
        b.y = BALL_R + Math.sin(k * Math.PI) * 0.7 * (s.sp / LOOP_MIN);
        if (k >= 1) { b.y = BALL_R; this.endScript('roll'); }
        break;
      }
      case 'portal': case 'idol': {
        const half = s.kind === 'idol' ? 0.55 : 0.5;
        if (k < half) { b.x = s.from[0]; b.z = s.from[1]; b.scale = 1 - k / half; b.hidden = s.kind === 'idol' && k > half * 0.6; }
        else { b.x = s.to[0]; b.z = s.to[1]; b.scale = (k - half) / (1 - half); }
        if (k >= 1) {
          b.scale = 1; b.hidden = false;
          b.x = s.to[0] + s.dir[0] * 0.35; b.z = s.to[1] + s.dir[1] * 0.35;
          b.vx = s.dir[0] * s.sp; b.vz = s.dir[1] * s.sp;
          this.events.push({ type: s.kind === 'idol' ? 'idolOut' : 'portalOut' });
          this.endScript('roll');
        }
        break;
      }
      case 'cannon': {
        const wait = 0.55, fl = s.dur - wait;
        if (s.t < wait) { b.x = s.from[0]; b.z = s.from[1]; b.hidden = true; }
        else {
          if (!s.boomed) { s.boomed = true; this.events.push({ type: 'boom' }); }
          const u = (s.t - wait) / fl, e = Math.min(1, u);
          b.x = s.from[0] + (s.to[0] - s.from[0]) * e; b.z = s.from[1] + (s.to[1] - s.from[1]) * e;
          b.y = BALL_R + 0.6 + Math.sin(e * Math.PI) * 4.2 - 0.6 * e;
        }
        if (k >= 1) {
          const dx = s.to[0] - s.from[0], dz = s.to[1] - s.from[1], l = Math.hypot(dx, dz) || 1;
          b.x = s.to[0]; b.z = s.to[1]; b.y = BALL_R; b.hidden = false;
          b.vx = dx / l * 2.6; b.vz = dz / l * 2.6;
          this.events.push({ type: 'land' });
          this.endScript('roll');
        }
        break;
      }
      case 'splash': {
        b.x = s.at[0]; b.z = s.at[1]; b.y = BALL_R - k * 0.5; b.scale = 1 - k * 0.6;
        if (k >= 1) this.penaltyReset();
        break;
      }
      case 'fall': {
        b.x = s.at[0] + s.v[0] * 0.05 * k; b.z = s.at[1] + s.v[1] * 0.05 * k; b.y = BALL_R - k * k * 3;
        if (k >= 1) this.penaltyReset();
        break;
      }
      case 'sink': {
        const c = this.W.cup;
        b.x = s.from[0] + (c[0] - s.from[0]) * Math.min(1, k * 2); b.z = s.from[1] + (c[1] - s.from[1]) * Math.min(1, k * 2);
        b.y = BALL_R - k * 0.45;
        if (k >= 1) { b.hidden = true; this.script = null; this.mode = 'sunk'; b.vx = b.vz = 0; this.events.push({ type: 'sunk' }); }
        break;
      }
    }
  }
  endScript(mode) { this.script = null; this.mode = mode; this.b.scale = 1; }
  penaltyReset() {
    const b = this.b;
    this.script = null; this.mode = 'rest'; b.vx = b.vz = 0; b.y = BALL_R; b.scale = 1; b.hidden = false;
    b.x = this.lastRest[0]; b.z = this.lastRest[1];
    this.events.push({ type: 'penalty' });
    this.events.push({ type: 'rest', x: b.x, z: b.z });
  }

  /* where a putt would go, for the aim dots: runs a throwaway copy with the clock frozen */
  predict(dx, dz, power, maxDist) {
    const c = new Sim(this.W, {});
    c.diff = this.diff; c.hz = this.hz; c.t = this.t;
    c.b = { ...this.b }; c.mode = 'rest'; c.lastRest = this.lastRest.slice();
    c.gemsTaken = this.gemsTaken.slice();
    c.shoot(dx, dz, power);
    const pts = [[c.b.x, c.b.z]]; let dist = 0; const h = 1 / 60;
    for (let i = 0; i < 600 && c.mode === 'roll' && dist < maxDist; i++) {
      const px = c.b.x, pz = c.b.z; c.step(h); c.t -= h;   // hazards frozen at "now"
      dist += Math.hypot(c.b.x - px, c.b.z - pz); pts.push([c.b.x, c.b.z]);
    }
    return pts;
  }
}

/* re-export the corridor builder for holes.js convenience */
export { corridor };
