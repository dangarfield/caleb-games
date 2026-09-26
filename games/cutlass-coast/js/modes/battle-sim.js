// battle-sim.js — ship physics, broadsides, hit tests, contact and enemy AI for the 1d ship battle.
// Pure-ish: works on plain ship-state objects; battle.js owns the scene, DOM and flow.
import * as THREE from 'three';

export const SPEED_SCALE = { relaxed: 0.75, normal: 1, fast: 1.3 };
export const ESCAPE_DIST = 175;   // either ship gets this far away → escape
export const WARN_DIST = 135;
export const MAX_RANGE = 72;      // broadside auto-range limit
export const BALL_SPEED = 34;
export const BOARD_REL = 3.4;     // relative speed (u/s) under which touching hulls can grapple
const SAIL_MULT = { full: 1, battle: 0.72, furl: 0.08 }; // furl: a struck/grappled ship drifts (was missing → NaN speed → blank screen)
const TAU = Math.PI * 2;
export const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const _p = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3(), _smoke = new THREE.Vector3(), _flash = new THREE.Vector3();

/** Build a ship state around a PLT ship object. */
export function makeShipState(obj, o) {
  const st = obj.userData.stats || {};
  const anchors = { L: [], R: [] };
  obj.traverse(ch => { if (/^muzzle_L\d+$/.test(ch.name)) anchors.L.push(ch); else if (/^muzzle_R\d+$/.test(ch.name)) anchors.R.push(ch); });
  const byIdx = (a, b) => +a.name.slice(8) - +b.name.slice(8);
  anchors.L.sort(byIdx); anchors.R.sort(byIdx);
  const perSide = Math.max(1, Math.round((o.guns || st.guns || 8) / 2));
  const s = {
    obj, cls: o.cls, isPlayer: !!o.isPlayer, name: o.name, kind: o.kind || 'player', nation: o.nation, type: o.type,
    half: obj.userData.halfLength || (st.length || 10) / 2, beam: st.beam || 3.2, mastH: obj.userData.mastHeight || 10, hs: 2.2,
    x: o.x, z: o.z, h: o.h, speed: o.speed || 0, vx: 0, vz: 0, rudder: 0, rudderIn: 0, sail: o.sail || 'battle',
    hull: o.hull, hullMax: o.hullMax, sails: o.sails, crew: o.crew, crew0: Math.max(1, o.crew), guns: o.guns, perSide,
    reloadTime: 3, reload: { L: 0, R: 0 }, anchors, skill: o.skill == null ? 0.7 : o.skill, speedMod: o.speedMod || 1, reloadMod: o.reloadMod || 1,
    dmgVis: -1, sinking: false, sinkP: 0, hitFlash: 0,
    ai: { t: 0, desired: o.h, mode: 'fight', fireTurnT: 0, seed: Math.random() * 10, alignT: { L: 0, R: 0 }, contactT: 0 },
  };
  s.hs = (obj.userData.deckY ? obj.userData.deckY(0) + 0.6 : 2.2);
  s.reloadTime = computeReload(s);
  obj.position.set(s.x, 0, s.z); obj.rotation.y = s.h;
  return s;
}

/** Reload seconds for one broadside: guns per side, crew to man them, Gunnery (reloadMod), enemy skill. */
export function computeReload(s) {
  const needed = Math.max(6, s.guns * 2.5);
  const crewF = clamp(needed / Math.max(1, s.crew), 1, 2.6);
  let t = (2.5 + s.perSide * 0.16) * crewF * s.reloadMod;
  if (!s.isPlayer) t *= 1.5 - 0.6 * s.skill;
  return t;
}

export const portVec = (h, out) => { out.x = Math.cos(h); out.z = -Math.sin(h); return out; };
/** Unit vector out of side ('L' port | 'R' starboard). */
export function sideVec(h, side, out) { const k = side === 'L' ? 1 : -1; out.x = Math.cos(h) * k; out.z = -Math.sin(h) * k; return out; }
const _sv = { x: 0, z: 0 };
/** Which broadside faces `other` and how well: {side, align (cos of angle off the beam), dist}. */
export function facing(s, other, out = {}) {
  const dx = other.x - s.x, dz = other.z - s.z, d = Math.hypot(dx, dz) || 1e-3;
  portVec(s.h, _sv);
  const dp = (dx * _sv.x + dz * _sv.z) / d;
  out.side = dp >= 0 ? 'L' : 'R'; out.align = Math.abs(dp); out.dist = d; out.proj = Math.abs(dp) * d;
  return out;
}

/** Physics step: steer, sail speed from wind + sails damage, move. */
export function stepShip(s, dt, W, wind) {
  if (s.sinking) { s.speed *= Math.max(0, 1 - dt * 0.8); }
  else {
    const sailF = 0.3 + 0.7 * clamp(s.sails / 100, 0, 1);
    const target = s.cls.speed * (SAIL_MULT[s.sail] ?? 0.72) * W.windFactor(s.h, wind) * sailF * s.speedMod;
    s.speed += (target - s.speed) * (1 - Math.exp(-dt * 0.7));
    s.rudder += (s.rudderIn - s.rudder) * (1 - Math.exp(-dt * 6));
    const way = 0.35 + 0.65 * clamp(s.speed / (s.cls.speed * 0.55), 0, 1);
    s.h = wrap(s.h + s.rudder * s.cls.turn * 0.8 * (s.sail === 'battle' ? 1.15 : 1) * way * dt);
  }
  s.vx = Math.sin(s.h) * s.speed; s.vz = Math.cos(s.h) * s.speed;
  s.x += s.vx * dt; s.z += s.vz * dt;
  for (const k of ['L', 'R']) if (s.reload[k] > 0) s.reload[k] = Math.max(0, s.reload[k] - dt);
  if (s.hitFlash > 0) s.hitFlash -= dt;
}

/** Start a broadside (rippled over ~0.4 s). Returns false if that side is reloading. */
export function fireBroadside(B, s, side) {
  if (s.sinking || B.over || s.reload[side] > 0 || s.crew <= 0) return false;
  s.reloadTime = computeReload(s);
  s.reload[side] = s.reloadTime;
  const list = s.anchors[side];
  const n = list.length;
  for (let i = 0; i < n; i++) B.pending.push({ s, side, i, at: B.t + i * (0.34 / Math.max(1, n)) + Math.random() * 0.05 });
  B.audio.play('cannon', s.isPlayer ? undefined : { caption: 'Enemy cannon fire' });
  if (s.isPlayer) B.shake = Math.max(B.shake, 0.25);
  return true;
}

/** Fire queued guns whose time has come. */
export function stepPending(B) {
  for (let i = B.pending.length - 1; i >= 0; i--) {
    const q = B.pending[i]; if (q.at > B.t) continue;
    B.pending.splice(i, 1);
    if (!q.s.sinking) shootGun(B, q.s, q.side, q.s.anchors[q.side][q.i]);
  }
}

function shootGun(B, s, side, anchor) {
  if (!anchor) return;
  const other = s === B.player ? B.enemy : B.player;
  s.obj.updateMatrixWorld();
  anchor.getWorldPosition(_p);
  sideVec(s.h, side, _sv);
  // auto-range: distance along the broadside to the enemy's beam line
  const dx = other.x - s.x, dz = other.z - s.z, proj = dx * _sv.x + dz * _sv.z;
  let range = proj > 4 ? clamp(proj, 12, MAX_RANGE) : MAX_RANGE * 0.55;
  const spread = (s.isPlayer ? 2.0 : 1.4 + (1 - s.skill) * 6.5) * Math.PI / 180;
  const yaw = (Math.random() * 2 - 1) * spread;
  range *= 1 + (Math.random() * 2 - 1) * (s.isPlayer ? 0.05 : 0.05 + (1 - s.skill) * 0.12);
  const c = Math.cos(yaw), sn = Math.sin(yaw), ux = _sv.x * c - _sv.z * sn, uz = _sv.x * sn + _sv.z * c;
  _to.set(_p.x + ux * range, 0.9, _p.z + uz * range);
  B.fx.cannonball.solve(_p, _to, BALL_SPEED, _dir);
  const ball = B.fx.cannonball.fire(_p, _dir, BALL_SPEED, null, s);
  if (ball) { ball.vel.x += s.vx; ball.vel.z += s.vz; }
  _flash.set(ux * 3, 0.2, uz * 3);
  B.fx.muzzleFlash.spawn(_p, { dir: _flash, count: 4 });
  _smoke.set(ux * 0.9, 0.25, uz * 0.9);
  B.fx.cannonSmoke.spawn(_p, { dir: _smoke, count: 5, speed: 2.6 });
}

/** Ball-vs-ship hit tests over cannonball.active. Calls B.onHit(target, shooter, zone, pos). */
export function hitTests(B) {
  const act = B.fx.cannonball.active;
  for (let i = act.length - 1; i >= 0; i--) {
    const b = act[i];
    for (let k = 0; k < 2; k++) {
      const s = B.ships[k];
      if (b.owner === s || s.sinkP > 0.5) continue;
      const dx = b.pos.x - s.x, dz = b.pos.z - s.z;
      if (dx * dx + dz * dz > (s.half + 3) * (s.half + 3)) continue;
      const sh = Math.sin(s.h), ch = Math.cos(s.h);
      const lz = dx * sh + dz * ch, lx = dx * ch - dz * sh;
      if (Math.abs(lz) > s.half * 0.96) continue;
      const y = b.pos.y - s.obj.position.y;
      if (y < -0.7) continue;
      const t = lz / s.half, halfW = (s.beam / 2) * (1 - t * t * 0.55) + 0.3;
      let zone = null;
      if (y <= s.hs + 1.0) { if (Math.abs(lx) < halfW) zone = 'hull'; }
      else if (y <= s.hs + s.mastH && Math.abs(lx) < s.beam * 1.1 && Math.abs(lz) < s.half * 0.75) zone = 'sails';
      if (!zone) continue;
      _p.copy(b.pos);
      B.fx.cannonball.kill(b);
      B.onHit(s, b.owner, zone, _p);
      break;
    }
  }
}

/** Apply a hit's damage. mult = damage multiplier of the shooter. Returns {hull, crew, sails} lost. */
export function applyHit(s, zone, mult, out = {}) {
  out.hull = 0; out.crew = 0; out.sails = 0;
  const big = Math.max(1, s.crew0 / 45);
  if (zone === 'hull') {
    out.hull = (2.6 + Math.random() * 2.2) * mult;
    if (Math.random() < 0.4) out.crew = Math.round((0.6 + Math.random() * 1.4) * big * mult);
    if (Math.random() < 0.12) out.sails = 2 + Math.random() * 3;
  } else {
    out.sails = (3.5 + Math.random() * 5) * mult;
    if (Math.random() < 0.2) out.crew = Math.max(1, Math.round(big * 0.6 * mult));
  }
  s.hull = Math.max(0, s.hull - out.hull); s.crew = Math.max(0, s.crew - out.crew); s.sails = Math.max(0, s.sails - out.sails);
  s.hitFlash = 0.3;
  return out;
}

// ---------- hull contact (centre-line segments) ----------
const segA = { ax: 0, az: 0, bx: 0, bz: 0 }, segB = { ax: 0, az: 0, bx: 0, bz: 0 }, cp = { d: 0, px: 0, pz: 0, qx: 0, qz: 0 };
function seg(s, o) { const fx = Math.sin(s.h) * s.half * 0.82, fz = Math.cos(s.h) * s.half * 0.82; o.ax = s.x - fx; o.az = s.z - fz; o.bx = s.x + fx; o.bz = s.z + fz; }
function closestSegSeg(A, Bs, out) {
  const d1x = A.bx - A.ax, d1z = A.bz - A.az, d2x = Bs.bx - Bs.ax, d2z = Bs.bz - Bs.az, rx = A.ax - Bs.ax, rz = A.az - Bs.az;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  const c = d1x * rx + d1z * rz, b = d1x * d2x + d1z * d2z, den = a * e - b * b;
  s = den > 1e-6 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  out.px = A.ax + d1x * s; out.pz = A.az + d1z * s; out.qx = Bs.ax + d2x * t; out.qz = Bs.az + d2z * t;
  out.d = Math.hypot(out.px - out.qx, out.pz - out.qz);
  return out;
}
/** Resolve hull overlap; returns {contact, relSpeed, dist, rammed}. */
export function contactStep(B, out) {
  const P = B.player, E = B.enemy;
  seg(P, segA); seg(E, segB); closestSegSeg(segA, segB, cp);
  const minSep = (P.beam + E.beam) * 0.5 * 0.92;
  const rvx = P.vx - E.vx, rvz = P.vz - E.vz;
  out.relSpeed = Math.hypot(rvx, rvz); out.dist = cp.d; out.rammed = 0;
  if (cp.d < minSep) {
    let nx = cp.px - cp.qx, nz = cp.pz - cp.qz; const l = Math.hypot(nx, nz);
    if (l < 1e-4) { nx = P.x - E.x; nz = P.z - E.z; } const ll = Math.hypot(nx, nz) || 1; nx /= ll; nz /= ll;
    const push = (minSep - cp.d) * 0.5;
    P.x += nx * push; P.z += nz * push; E.x -= nx * push; E.z -= nz * push;
    const closing = -(rvx * nx + rvz * nz);
    if (closing > 3.5) { out.rammed = closing; P.speed *= 0.6; E.speed *= 0.6; }
  }
  out.contact = cp.d < minSep + 1.3;
  return out;
}

// ---------- enemy AI ----------
const FLEE_KINDS = new Set(['merchant', 'treasure', 'smuggler']);
const _f = {};
/** Decide the enemy's steering, sails and firing. Lively: fighters jockey for broadsides, traders run but bite back. */
export function aiStep(B, e, p, dt, W, wind) {
  if (e.sinking || B.over) { e.rudderIn = 0; return; }
  const ai = e.ai;
  ai.t -= dt;
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
  const hullF = e.hull / e.hullMax;
  if (ai.t <= 0) {
    ai.t = 0.3 + (1 - e.skill) * 0.3;
    const flee = FLEE_KINDS.has(e.kind) || (e.kind !== 'warship' && hullF < 0.25 && e.crew < p.crew);
    ai.mode = flee ? 'flee' : 'fight';
    if (ai.fireTurnT > 0) ai.mode = 'turnfire';
    if (flee && ai.fireTurnT <= 0 && dist < 38 && e.guns > 0 && Math.random() < 0.08 + e.skill * 0.1) { ai.fireTurnT = 2.2 + Math.random(); ai.mode = 'turnfire'; }
    const wantBoard = (e.kind === 'pirate' || e.kind === 'privateer') && e.crew > p.crew * 1.4 && hullF > 0.3;
    if (ai.mode === 'flee') {
      let best = a + Math.PI, bs = -9;
      for (const off of [-1.3, -0.7, -0.3, 0, 0.3, 0.7, 1.3]) { const hh = a + Math.PI + off, sc = W.windFactor(hh, wind) + 0.55 * Math.cos(off); if (sc > bs) { bs = sc; best = hh; } }
      ai.desired = best; e.sail = 'full';
    } else if (wantBoard && ai.mode === 'fight') {
      const lead = Math.min(2.2, dist / 12);
      ai.desired = Math.atan2(p.x + p.vx * lead - e.x, p.z + p.vz * lead - e.z);
      e.sail = dist < 20 ? 'battle' : 'full'; ai.boarding = true;
    } else {
      ai.boarding = false;
      let side;
      const rl = e.reload.L, rr = e.reload.R;
      if (rl <= 0.4 && rr <= 0.4) { const hl = a - Math.PI / 2, hr = a + Math.PI / 2; side = Math.abs(wrap(hl - e.h)) < Math.abs(wrap(hr - e.h)) ? 'L' : 'R'; }
      else side = rl < rr ? 'L' : 'R';
      const hb = side === 'L' ? a - Math.PI / 2 : a + Math.PI / 2;
      const k = ai.mode === 'turnfire' ? 0 : clamp((dist - 30) / 22, -1, 2);
      ai.desired = hb + (side === 'L' ? 1 : -1) * k * Math.PI / 4;
      e.sail = e.kind === 'warship' || dist < 60 ? 'battle' : 'full';
    }
    ai.desired += Math.sin(B.t * 0.6 + ai.seed) * 0.1 * (1.2 - e.skill);
  }
  if (ai.fireTurnT > 0) ai.fireTurnT -= dt;
  const diff = wrap(ai.desired - e.h);
  e.rudderIn = clamp(diff * 2.4, -1, 1) * (0.6 + 0.4 * e.skill);
  // fire when a loaded broadside bears
  facing(e, p, _f);
  const need = Math.cos((16 + (1 - e.skill) * 10) * Math.PI / 180);
  for (const side of ['L', 'R']) {
    const bears = _f.side === side && _f.align > need && dist < MAX_RANGE * 0.95 && dist > 6;
    ai.alignT[side] = bears ? ai.alignT[side] + dt : 0;
    if (bears && e.reload[side] <= 0 && ai.alignT[side] > 0.35 - e.skill * 0.2) fireBroadside(B, e, side);
  }
}

/** Surrender check (call ~every 1.5 s). */
export function wantsSurrender(e, p) {
  const hullF = e.hull / e.hullMax, crewF = e.crew / e.crew0;
  let q = 0;
  const thr = FLEE_KINDS.has(e.kind) ? 0.62 : 0.4; // traders give up sooner
  if (hullF < thr) q += (thr - hullF) * 1.4;
  if (crewF < 0.45) q += (0.45 - crewF) * 1.2;
  if (e.sails < 25) q += 0.08;
  if (q <= 0) return false;
  if (FLEE_KINDS.has(e.kind)) q *= 2;
  if (e.kind === 'warship') q *= 0.35;
  if (e.villainId) q *= 0.4;
  if (e.crew < p.crew * 0.6) q *= 1.5;
  return Math.random() < q;
}
