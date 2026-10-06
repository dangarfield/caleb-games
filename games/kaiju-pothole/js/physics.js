// Real rigid-body physics (Rapier), switched on only around the holes.
// Each hole carries a collider "collar": a ring-shaped floor with a round opening, plus shaft walls under
// it, teleported to the hole every frame. Objects that come within reach of a hole turn into dynamic
// bodies sitting on that collar: anything over the opening genuinely tips, slides and drops in, and
// anything too big to fit just sits there (no fake shaking). Things too big to move become fixed
// obstacles while they're near. Bodies that come to rest away from every hole are switched back off.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { kindOf } from './world.js';

let ready = null;
export const initPhysics = () => ready || (ready = RAPIER.init());

const SEG = 32, OBJ = 1 << 8, OBST = 1 << 9;
const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export class Phys {
  constructor(world, unit = 1) {
    this.world = world; this.unit = unit;
    this.w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try { if ('lengthUnit' in this.w) this.w.lengthUnit = unit; else if (this.w.integrationParameters && 'lengthUnit' in this.w.integrationParameters) this.w.integrationParameters.lengthUnit = unit; } catch (e) { /* older build */ }
    this.collars = new Map(); try { this.w.integrationParameters.numSolverIterations = 8; } catch (e) {} this.active = new Map(); this.obst = new Map(); this.acc = 0; this.q = [];
  }
  dispose() { try { this.w.free(); } catch (e) {} this.active.clear(); }

  // The collar is the ground itself around the opening: a thick, wide ring slab (no shaft walls). Anything
  // that has dropped below the slab is just falling under the ground and never gets carried along.
  collar(h) {
    let c = this.collars.get(h);
    if (!c) { c = { body: this.w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(h.x, 0, h.z)), cols: [], r: 0, x: h.x, z: h.z, fx: h.x, fz: h.z }; this.collars.set(h, c); }
    const R = h.r * 0.98;
    if (Math.abs(R - c.r) > Math.max(0.03 * R, 0.01 * this.unit)) {
      for (const col of c.cols) this.w.removeCollider(col, false); c.cols = [];
      const u = this.unit, wr = this.reach(h) * 3 + R + 8 * u, th = Math.max(0.6 * u, R * 0.35);
      const g = groups(1 << h.slot, 1 << (4 + h.slot));
      for (let i = 0; i < SEG; i++) {
        const a = (i + 0.5) / SEG * Math.PI * 2, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), rot = { x: q.x, y: q.y, z: q.z, w: q.w };
        const outerW = Math.PI * 2 * (R + wr) / SEG * 0.56, rc = R + wr / 2;
        c.cols.push(this.w.createCollider(RAPIER.ColliderDesc.cuboid(wr / 2, th, outerW).setTranslation(Math.cos(a) * rc, -th, Math.sin(a) * rc).setRotation(rot).setFriction(0.8).setCollisionGroups(g), c.body));
      }
      c.r = R;
    }
    // moved by teleport, not velocity: the ground has no motion of its own, so nothing resting on it is
    // dragged along; only the cut edge pushes into whatever is half-way in
    c.tx = h.x; c.tz = h.z; // applied in small steps inside the simulation loop
    return c;
  }
  dropCollar(h) { const c = this.collars.get(h); if (c) { this.w.removeRigidBody(c.body); this.collars.delete(h); } }
  reach(h) { return Math.max(2 * this.unit, h.r * 0.7); }

  activate(o, h) {
    const W = this.world, pad = kindOf(o.m) === 'pad';
    W.unbucket(o);
    const q = o.q || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot);
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y, o.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCanSleep(false).setCcdEnabled(o.fr < 1.5 * this.unit).setLinearDamping(0.05).setAngularDamping(0.25);
    const body = this.w.createRigidBody(desc);
    const hw = Math.max(0.02 * this.unit, o.m.w * o.s / 2), hd = Math.max(0.02 * this.unit, o.m.d * o.s / 2), hh = pad ? Math.min(o.h, 0.15 * this.unit) / 2 + 0.01 : Math.max(0.02 * this.unit, o.h / 2);
    const g = pad ? groups(1 << (4 + h.slot), 1 << h.slot) : groups((1 << (4 + h.slot)) | OBJ, (1 << h.slot) | OBJ | OBST);
    this.w.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh, hd).setTranslation(0, hh, 0).setDensity(pad ? 0.3 : 0.6).setFriction(0.7).setRestitution(0.05).setCollisionGroups(g), body);
    body.setGravityScale(this.gscale(h), true);
    o.state = 1; o.q = q.clone(); o.tilt = 0;
    this.active.set(o, { body, owner: h, started: false, idle: 0 });
  }
  gscale(h) { return Math.max(1, h.r / (3 * this.unit)); }
  deactivate(o, b) {
    this.w.removeRigidBody(b.body); this.active.delete(o);
    o.state = 0; o.y = Math.max(0, o.y); this.world.rebucket(o); this.world.write(o);
  }
  // Fixed stand-in for something too big to move. Only its BASE is solid (a tree's canopy or a street light's
  // arm isn't), and it is trimmed so it never reaches over an opening: nothing can stand on thin air.
  obstacle(o, holes) {
    const k = kindOf(o.m), tall = o.h > 1.8 * Math.max(o.m.w, o.m.d) * o.s;
    const base = k === 'tree' || k === 'air' ? 0.28 : (k === 'prop' || k === 'play') && tall ? 0.3 : ['house', 'shop', 'tower', 'factory', 'station', 'stadium', 'farm'].includes(k) ? 0.85 : 0.7;
    let hx = o.m.w * o.s / 2 * base, hz = o.m.d * o.s / 2 * base;
    const yaw = o.q ? new THREE.Euler().setFromQuaternion(o.q, 'YXZ').y : o.rot, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const h of holes) {
      if (!h.active) continue;
      const dx = h.x - o.x, dz = h.z - o.z, lx = dx * c - dz * s, lz = dx * s + dz * c, R = h.r * 1.05;
      for (let t = 0; t < 8; t++) { const nx = Math.max(-hx, Math.min(hx, lx)), nz = Math.max(-hz, Math.min(hz, lz)); if (Math.hypot(lx - nx, lz - nz) >= R) break; hx *= 0.7; hz *= 0.7; }
      const nx = Math.max(-hx, Math.min(hx, lx)), nz = Math.max(-hz, Math.min(hz, lz)); if (Math.hypot(lx - nx, lz - nz) < R) return this.dropObstacle(o);
    }
    const prev = this.obst.get(o);
    if (prev && Math.abs(prev.hx - hx) < 1e-3 && Math.abs(prev.hz - hz) < 1e-3) return;
    if (prev) this.dropObstacle(o);
    const q = o.q || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rot);
    const body = this.w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(o.x, o.y, o.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    const hh = Math.max(0.05, o.h / 2);
    this.w.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.02, hx), hh, Math.max(0.02, hz)).setTranslation(0, hh, 0).setCollisionGroups(groups(OBST, OBJ)), body);
    this.obst.set(o, { body, hx, hz });
  }
  dropObstacle(o) { const ob = this.obst.get(o); if (ob) { this.w.removeRigidBody(ob.body); this.obst.delete(o); } }

  update(dt, holes) {
    const W = this.world, MAXB = 90;
    for (const h of holes) { if (h.active) this.collar(h); else this.dropCollar(h); }
    // switch on whatever is within reach of a hole
    for (const h of holes) {
      if (!h.active) continue;
      const reach = this.reach(h), list = W.near(h.x, h.z, h.r + reach + 10 * this.unit, this.q);
      for (const o of list) {
        if (o.state !== 0) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d > h.r + reach + o.fr * 0.5) continue;
        if (o.eatable && o.fd <= h.r * 1.02 && this.active.size < MAXB) { this.dropObstacle(o); this.activate(o, h); }
        else if (d < h.r + o.fr + 1) this.obstacle(o, holes);
      }
      list.length = 0;
    }
    // obstacles nobody is near any more
    for (const [o] of this.obst) if (!holes.some(h => h.active && Math.hypot(o.x - h.x, o.z - h.z) < h.r + o.fr + this.reach(h) + 2)) this.dropObstacle(o);
    // fixed-step simulation
    this.acc = Math.min(this.acc + dt, 1 / 20);
    // the edge moves in small increments (one per sub-step) so it nudges things instead of jumping into them
    let n = Math.min(3, Math.floor(this.acc * 60 + 1e-6));
    if (n) for (const c of this.collars.values()) { const mv = Math.hypot(c.tx - c.x, c.tz - c.z); n = Math.max(n, Math.min(this.active.size > 40 ? 3 : 8, Math.ceil(mv / Math.max(0.02, c.r * 0.06)))); }
    for (const c of this.collars.values()) { c.sx = c.x; c.sz = c.z; }
    for (let s = 1; s <= n; s++) {
      for (const c of this.collars.values()) { const t = s / n; c.x = c.sx + (c.tx - c.sx) * t; c.z = c.sz + (c.tz - c.sz) * t; c.body.setTranslation({ x: c.x, y: 0, z: c.z }, true); }
      this.w.timestep = 1 / 60 * Math.min(1, 3 / n) ; this.w.step();
    }
    this.acc -= Math.min(3, Math.floor(this.acc * 60 + 1e-6)) / 60;
    // read back, eat, or switch off
    for (const [o, b] of this.active) {
      const h = b.owner, t = b.body.translation(), r = b.body.rotation();
      o.x = t.x; o.y = t.y; o.z = t.z; o.q.set(r.x, r.y, r.z, r.w);
      if (!b.started && t.y < -0.15 * this.unit) { b.started = true; h.onStart && h.onStart(o); }
      b.body.setGravityScale(this.gscale(h), false);
      // keep falling until it has passed the bottom of the (visual) shaft and is out of sight
      if (t.y < -(Math.max(4, h.r * 3.5) + o.h + o.fd + this.unit)) {
        this.w.removeRigidBody(b.body); this.active.delete(o); o.state = 3; W.eatenArea += o.area; W.write(o); h.onEat && h.onEat(o); continue;
      }
      W.write(o);
      const d = Math.hypot(o.x - h.x, o.z - h.z), v = b.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      // safety net: something resting right over the opening for a second gets a nudge toward the middle
      if (h.active && d < h.r * 0.75 && t.y > -0.3 * this.unit && sp < 0.2 * this.unit) { b.hover = (b.hover || 0) + dt; if (b.hover > 1) { const m = b.body.mass(); b.body.applyImpulse({ x: (h.x - o.x) * m * 0.8, y: -m * 0.5, z: (h.z - o.z) * m * 0.8 }, true); b.hover = 0; } } else b.hover = 0;
      if (!h.active && t.y > -0.2 * this.unit) { this.deactivate(o, b); continue; }
      if (d > h.r + this.reach(h) * 1.6 + o.fr && t.y > -0.05 * this.unit) { b.idle = sp < 0.3 * this.unit ? b.idle + dt : 0; if (b.idle > 0.4 || d > h.r + this.reach(h) * 3 + o.fr) this.deactivate(o, b); }
    }
  }
}
