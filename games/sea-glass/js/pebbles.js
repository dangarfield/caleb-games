// The pebble layer: three InstancedMeshes (different lumpy shapes + different
// roughness so the pile has dry and wet-looking stones) driven by capped
// cannon-es sphere bodies.
//
// Perf contract:
//   * sphere colliders only — the cheapest and most stable pile in cannon-es
//   * hard cap of MAX_PER_MESH * 3 bodies, and never more than 3 layers deep
//   * bodies sleep when settled; matrices are only re-uploaded on a frame where
//     something actually moved
//   * one draw call per mesh variant (plus one more each in the shadow pass)

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { pebbleGeometry, perf } from './env.js';
import { PIT } from './scene-beach.js';
import { world, stoneMaterial } from './physics.js';

// 3 meshes x 80 = a hard ceiling of 240 dynamic stones, which is the top of the
// "usable on a tablet" band. A beach whose coverage asks for more than that just
// gets capped; the pile reads as deep from about 200 upwards anyway.
const MAX_PER_MESH = 80;
const VARIANT_MIX = [0.42, 0.36, 0.22];

// The collider stays a sphere of `radius`; the visual is wider than the sphere
// (so the pile looks packed — sphere colliders only ever touch at radius+radius)
// and much FLATTER, because beach pebbles are oblate and a pile of near-spheres
// reads as a bag of marbles. The visual is dropped by VARIANT_SINK so a flattened
// stone still appears to rest on the sand rather than hover over it.
const VARIANT_SCALE = [
  new THREE.Vector3(1.28, 0.66, 1.16),
  new THREE.Vector3(1.20, 0.76, 1.22),
  new THREE.Vector3(1.32, 0.58, 1.14),
];
// Per-variant tint: the glossier "wet" stones are darker, as wet stones are.
const VARIANT_TINT = [1.0, 0.9, 0.76];

export const meshes = [];
export const pebbles = [];   // { body, mi, ii, radius, wasAwake, calm }

// cannon's own sleep test is too strict for a deep sphere pile — tiny residual
// jitter and slow rolling keep every stone awake forever, which is exactly the
// frame-rate cliff we cannot afford. So we run our own settle test on top of it:
// calm velocity for CALM_TIME, OR barely any displacement over DISP_WINDOW
// (which catches stones that shudder in place without ever going still).
const CALM_SPEED = 0.34;
const CALM_SPIN = 2.2;
const CALM_TIME = 0.4;
const DISP_WINDOW = 0.35;
const DISP_EPS = 0.012;
// cannon wakes a sleeping body as soon as an awake neighbour touches it, so in a
// dense pile the stones keep re-waking each other and the awake count plateaus
// instead of reaching zero. Once nothing in the pile is moving meaningfully we
// park the whole pile in one go, which breaks that cycle for good.
const GLOBAL_CALM_TIME = 0.45;
// And a hard backstop: sleeping one stone mid-contact kicks its awake neighbour,
// which re-wakes others, so a dense pile can chatter indefinitely. However long
// the pile wants to argue with itself, it gets parked this many seconds after the
// player last touched it. A stone freezing mid-roll is invisible; a permanently
// awake pile is not.
const SETTLE_DEADLINE = 1.6;
let globalCalm = 0;
let sinceDisturb = 1e9;

let pileTop = 0.3;
let stoneColors = [];

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function initPebbles(scene) {
  for (let v = 0; v < 3; v++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: v === 0 ? 0.88 : v === 1 ? 0.58 : 0.34,
      metalness: 0.0,
      envMapIntensity: v === 0 ? 0.55 : v === 1 ? 0.9 : 1.35,
    });
    const im = new THREE.InstancedMesh(pebbleGeometry(v), mat, MAX_PER_MESH);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    // Instance colours need to exist before the first setColorAt.
    im.setColorAt(0, _c.setHex(0xffffff));
    im.count = 0;
    scene.add(im);
    meshes.push(im);
  }
}

/** Hex colours of the current beach's stones, for the collection view etc. */
export function currentStoneColors() { return stoneColors; }

export function pileTopY() { return pileTop; }

export function clearPebbles() {
  for (const p of pebbles) world.removeBody(p.body);
  pebbles.length = 0;
  for (const m of meshes) m.count = 0;
}

/**
 * Build a fresh pebble field for a beach. Call AFTER the section's finds have
 * been dropped on the floor, so the stones land on top and bury them.
 */
export function generatePebbles(beach, rnd, coverPts) {
  clearPebbles();
  stoneColors = beach.stones;

  const [rMin, rMax] = beach.stoneSize;
  // The grid is sized on the LARGEST stone, not the average. Sizing it on the
  // average lets two big neighbours spawn interpenetrated, and a sphere pile
  // with deep initial overlap never stops fighting itself — it jitters and pops
  // forever, which was exactly the frame-rate cliff we cannot afford.
  const cell = rMax * 2 * 1.02;
  const cols = Math.max(3, Math.floor(PIT.w / cell));
  const rows = Math.max(3, Math.floor(PIT.d / cell));
  const perLayer = cols * rows;

  // A beach is authored as an areal COVERAGE (1.0 = the pit floor exactly hidden
  // once over), not as a stone count. The body count then falls out of the stone
  // size, so a beach of big cobbles and one of fine gravel look equally deep and
  // neither one has to be hand-tuned when the sizes change.
  const avgR = (rMin + rMax) / 2;
  const stoneArea = Math.PI * (avgR * 1.16) * (avgR * 1.16);
  const capacity = MAX_PER_MESH * 3;
  let target = Math.round(
    (PIT.w * PIT.d * (beach.coverage || 1.15) / stoneArea) * perf.bodyBudget);
  target = Math.min(target, capacity, perLayer * 3);

  // Only ~70% of a layer's slots get used, so the stones stack into two or three
  // patchy layers instead of one tidy sheet. It matters most on the fine-shingle
  // beaches: their small stones would otherwise all fit side by side in a single
  // layer with nothing on top to bury the glass.
  const layers = Math.min(3, Math.max(1, Math.ceil(target / (perLayer * 0.7))));
  const slots = [];
  const x0 = -PIT.hw + (PIT.w - cols * cell) / 2 + cell / 2;
  const z0 = -PIT.hd + (PIT.d - rows * cell) / 2 + cell / 2;
  for (let L = 0; L < layers; L++) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Jitter stays inside the cell's spare room so nothing starts overlapping.
        const slack = (cell - rMax * 2) * 0.5 + rMax - rMin;
        slots.push({
          x: x0 + c * cell + (rnd() - 0.5) * slack,
          z: z0 + r * cell + (rnd() - 0.5) * slack,
          y: rMax * 1.05 + L * cell,
        });
      }
    }
  }
  // Shuffle so a partly-filled top layer is patchy rather than a neat block.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }

  // Stones deliberately aimed at the pieces already lying on the floor.
  //
  // With a body cap of 240, a beach of fine shingle can only cover about 60% of
  // the pit, so leaving burial to chance left half of every section lying in the
  // open — the comb became optional. These slots are filled FIRST, so each piece
  // gets a small mound over it wherever it happens to be. They are ordinary
  // stones: one swipe still rakes them away, which is the whole point.
  const cover = [];
  if (coverPts && coverPts.length) {
    const step = rMax * 1.12;
    for (const c of coverPts) {
      // Biased towards the camera (+z): at this camera pitch a stone directly
      // overhead leaves the piece's shoreward face in plain view.
      const ring = rMax < 0.11
        ? [[0, step * 0.72], [-step * 0.92, 0], [step * 0.92, 0], [0, -step * 0.5]]
        : [[0, step * 0.6], [-step * 0.8, step * 0.1]];
      for (const [ox, oz] of ring) {
        const x = THREE.MathUtils.clamp(c.x + ox, -PIT.hw + rMax, PIT.hw - rMax);
        const z = THREE.MathUtils.clamp(c.z + oz, -PIT.hd + rMax, PIT.hd - rMax);
        cover.push({ x, z, y: rMax * 1.05 });
      }
    }
    // Drop any grid slot that would spawn inside one of those, or the pile starts
    // with deep overlap and a sphere pile with overlap never settles.
    const keep = [];
    for (const sl of slots) {
      let clash = false;
      for (const c of cover) {
        if (Math.abs(sl.y - c.y) > cell * 0.5) continue;
        const dx = sl.x - c.x, dz = sl.z - c.z;
        if (dx * dx + dz * dz < cell * cell * 0.7) { clash = true; break; }
      }
      if (!clash) keep.push(sl);
    }
    slots.length = 0;
    slots.push(...cover, ...keep);
  }

  // How many of each variant, so every mesh stays inside MAX_PER_MESH.
  const quota = [0, 0, 0];
  for (let i = 0; i < target; i++) {
    let v = 0, r = rnd();
    if (r > VARIANT_MIX[0]) v = 1;
    if (r > VARIANT_MIX[0] + VARIANT_MIX[1]) v = 2;
    if (quota[v] >= MAX_PER_MESH) v = quota.findIndex((q) => q < MAX_PER_MESH);
    if (v < 0) break;
    quota[v]++;
  }

  const cursor = [0, 0, 0];
  let placed = 0;
  for (let i = 0; i < slots.length && placed < target; i++) {
    let v = -1;
    for (let k = 0; k < 3; k++) {
      const pick = (i + k) % 3;
      if (cursor[pick] < quota[pick]) { v = pick; break; }
    }
    if (v < 0) break;
    const ii = cursor[v]++;
    const radius = rMin + rnd() * (rMax - rMin);
    const slot = slots[i];

    const body = new CANNON.Body({
      mass: Math.max(0.08, radius * radius * radius * 90),
      shape: new CANNON.Sphere(radius),
      material: stoneMaterial,
      linearDamping: 0.24,
      angularDamping: 0.64,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.4,
    });
    body.position.set(slot.x, slot.y, slot.z);
    body.quaternion.setFromEuler(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
    body.isPebble = true;
    world.addBody(body);

    const rec = { body, mi: v, ii, radius, wasAwake: true, calm: 0, dispT: 0 };
    resetSettle(rec);
    pebbles.push(rec);
    placed++;

    const base = beach.stones[Math.floor(rnd() * beach.stones.length)];
    _c.setHex(base);
    _c.multiplyScalar((0.70 + rnd() * 0.34) * VARIANT_TINT[v]);
    meshes[v].setColorAt(ii, _c);
  }

  for (let v = 0; v < 3; v++) {
    meshes[v].count = cursor[v];
    if (meshes[v].instanceColor) meshes[v].instanceColor.needsUpdate = true;
  }

  perf.bodies = pebbles.length;
  return pebbles.length;
}

/** Clear the settle timers so a woken stone gets a fair chance to move. */
function resetSettle(p) {
  p.calm = 0;
  p.dispT = 0;
  p.mx = p.body.position.x;
  p.my = p.body.position.y;
  p.mz = p.body.position.z;
}

/** After the prewarm settle: park everything and record the pile height. */
export function settlePebbles() {
  parkAll();
  for (const p of pebbles) p.wasAwake = true;   // force one matrix upload
  syncPebbles(true);
}

/** Sleep every stone and re-measure the pile height (it flattens as you comb). */
function parkAll() {
  const tops = [];
  for (const p of pebbles) {
    p.body.velocity.setZero();
    p.body.angularVelocity.setZero();
    p.body.sleep();
    resetSettle(p);
    tops.push(p.body.position.y + p.radius);
  }
  tops.sort((a, b) => a - b);
  pileTop = tops.length ? tops[Math.floor(tops.length * 0.82)] : 0.3;
  globalCalm = 0;
  sinceDisturb = 1e9;
}

/**
 * Force-settle stones that have essentially stopped. Returns how many are still
 * awake, which is the number that actually costs us anything.
 */
export function settleTick(dt) {
  sinceDisturb += dt;
  let awake = 0, maxSpeed = 0, maxSpin = 0;
  for (const p of pebbles) {
    if (p.body.sleepState === CANNON.Body.SLEEPING) { p.calm = 0; continue; }
    awake++;
    const pos = p.body.position;
    const v = p.body.velocity, w = p.body.angularVelocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const spin = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    if (speed > maxSpeed) maxSpeed = speed;
    if (spin > maxSpin) maxSpin = spin;

    let park = false;
    if (speed < CALM_SPEED && spin < CALM_SPIN) {
      p.calm += dt;
      if (p.calm > CALM_TIME) park = true;
    } else {
      p.calm = 0;
    }

    // Displacement fallback: a stone shuddering against its neighbours never
    // reaches a calm velocity, but it is not going anywhere either.
    p.dispT = (p.dispT || 0) + dt;
    if (p.dispT >= DISP_WINDOW) {
      const dx = pos.x - p.mx, dy = pos.y - p.my, dz = pos.z - p.mz;
      if (dx * dx + dy * dy + dz * dz < DISP_EPS * DISP_EPS) park = true;
      p.mx = pos.x; p.my = pos.y; p.mz = pos.z;
      p.dispT = 0;
    }

    if (park) {
      v.setZero();
      w.setZero();
      p.body.sleep();
      awake--;
    }
  }

  if (!awake) { globalCalm = 0; return 0; }
  if (sinceDisturb > SETTLE_DEADLINE) { parkAll(); return 0; }
  if (maxSpeed < CALM_SPEED && maxSpin < CALM_SPIN) {
    globalCalm += dt;
    if (globalCalm > GLOBAL_CALM_TIME) { parkAll(); return 0; }
  } else {
    globalCalm = 0;
  }
  return awake;
}

/** Called whenever the player disturbs the pile; restarts the settle deadline. */
export function noteDisturbance() { sinceDisturb = 0; }

/**
 * Hard containment. Even with rigid wall contacts, a stone at the bottom of a
 * three-deep pile is under enough sideways pressure to squeeze through a static
 * box now and then, and once out it free-falls forever and never sleeps — which
 * both looks broken and pins the awake count. So every awake stone is simply
 * clamped back inside the pit. In a bed of gravel a stone jumping two
 * centimetres is invisible; a stone falling out of the world is not.
 */
export function containPebbles() {
  for (const p of pebbles) {
    if (p.body.sleepState === CANNON.Body.SLEEPING) continue;
    const q = p.body.position, v = p.body.velocity;
    const lx = PIT.hw - p.radius * 0.35;
    const lz = PIT.hd - p.radius * 0.35;
    if (q.x > lx) { q.x = lx; if (v.x > 0) v.x = 0; }
    else if (q.x < -lx) { q.x = -lx; if (v.x < 0) v.x = 0; }
    if (q.z > lz) { q.z = lz; if (v.z > 0) v.z = 0; }
    else if (q.z < -lz) { q.z = -lz; if (v.z < 0) v.z = 0; }
    if (q.y < p.radius * 0.4) { q.y = p.radius * 0.4; if (v.y < 0) v.y = 0; }
    else if (q.y > 1.1) { q.y = Math.max(0.2, pileTop); v.setZero(); }
  }
}

/**
 * Height of the pile immediately around (x, z) — used to drop a "surface" find
 * onto the stones near it rather than at the pile's average height.
 */
export function localTopY(x, z, reach) {
  let top = 0;
  const r2 = reach * reach;
  for (const p of pebbles) {
    const dx = p.body.position.x - x, dz = p.body.position.z - z;
    if (dx * dx + dz * dz > r2) continue;
    const t = p.body.position.y + p.radius;
    if (t > top) top = t;
  }
  return top || pileTop;
}

/**
 * Spots on the sand that already have a stone bridging over them.
 *
 * A stone resting on other stones leaves a shadowed void underneath, and that is
 * where a piece of glass genuinely belongs — under the top course, not lying in a
 * gap. `minClear` is the vertical room the piece needs. Returned nearest-cover
 * first (a low bridge hides better than a high one) and shuffled within that.
 */
export function shelteredSpots(minClear) {
  const out = [];
  for (const p of pebbles) {
    const clear = p.body.position.y - p.radius;
    if (clear < minClear) continue;
    out.push({ x: p.body.position.x, z: p.body.position.z, clear, r: p.radius });
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  out.sort((a, b) => a.clear - b.clear);
  return out;
}

/**
 * Is there room for a flat piece of this size at (x, y, z)? Treated as a disc of
 * `hr` radius and `hy` half-thickness against the stone spheres. Dropping a piece
 * into a stone is the one thing that makes a settled pile explode.
 */
export function roomAt(x, y, z, hr, hy) {
  for (const p of pebbles) {
    const q = p.body.position;
    const dy = Math.abs(q.y - y);
    if (dy > p.radius + hy) continue;
    const dx = q.x - x, dz = q.z - z;
    // Slice the sphere at this height: only the part of it beside the piece counts.
    const cut = Math.sqrt(Math.max(0, p.radius * p.radius - dy * dy));
    const need = cut + hr * 0.72;
    if (dx * dx + dz * dz < need * need) return false;
  }
  return true;
}

/**
 * Slide one spare stone onto the sight line to a piece that should be hidden.
 *
 * A piece is buried by spawning it first and dropping the stones on top, which
 * worked when the stones were big enough to cover the floor twice over. The
 * smaller stones the beaches use now leave real gaps, so a "deep" piece often
 * ends up sitting in a hole with a clear line to the camera. Rather than move the
 * piece (teleporting it under the pile guarantees interpenetration, and a sphere
 * pile with overlap never stops fighting), a stone from a crowded part of the pit
 * is lifted out and dropped onto the line of sight, where there is free air.
 *
 * `dir` is the unit vector from the piece TOWARDS the camera; `protect` is the
 * list of other pieces, so robbing one hollow does not expose another.
 */
export function coverAlongRay(x, y, z, dir, protect) {
  // Donor: the stone that is highest (so it is on top of the pile, not wedged
  // under it) and not the only cover some other piece has.
  let best = null, bestScore = -Infinity;
  for (const p of pebbles) {
    const px = p.body.position.x, py = p.body.position.y, pz = p.body.position.z;
    const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d2 < 0.09) continue;                    // already over this piece
    let near = 0;
    for (const q of protect) {
      const qx = q.body.position.x - px, qz = q.body.position.z - pz;
      if (qx * qx + qz * qz < 0.075) { near = 1; break; }
    }
    if (near) continue;
    const score = py - Math.sqrt(d2) * 0.05;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return false;

  // Where the sight line crosses the top of the local pile: free air, so the
  // stone can be dropped there without overlapping anything.
  const r = best.radius;
  const top = localTopY(x, z, 0.3);
  const h = Math.max(top, y + r) + r * 1.02;
  const t = dir.y > 0.15 ? (h - y) / dir.y : r * 1.4;
  best.body.position.set(x + dir.x * t, h, z + dir.z * t);
  best.body.velocity.setZero();
  best.body.angularVelocity.setZero();
  best.body.wakeUp();
  best.calm = 0;
  return true;
}

/** Debug: what is still moving, and where? */
export function activityDebug() {
  let worst = null, maxSpeed = 0, outside = 0;
  for (const p of pebbles) {
    if (p.body.sleepState === CANNON.Body.SLEEPING) continue;
    const v = p.body.velocity;
    const s = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (s > maxSpeed) { maxSpeed = s; worst = p; }
    const q = p.body.position;
    if (Math.abs(q.x) > PIT.hw + 0.1 || Math.abs(q.z) > PIT.hd + 0.1 || q.y < -0.05) outside++;
  }
  const a = worst && worst.body.angularVelocity;
  return {
    maxSpeed: +maxSpeed.toFixed(3), outside,
    worst: worst ? {
      x: +worst.body.position.x.toFixed(2), y: +worst.body.position.y.toFixed(2),
      z: +worst.body.position.z.toFixed(2), r: +worst.radius.toFixed(3),
      spin: +Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z).toFixed(2),
    } : null,
  };
}

/** Copy body transforms into the instance matrices. */
export function syncPebbles(force) {
  const touched = [false, false, false];
  for (const p of pebbles) {
    const awake = p.body.sleepState !== CANNON.Body.SLEEPING;
    if (!force && !awake && !p.wasAwake) continue;
    p.wasAwake = awake;
    const sc = VARIANT_SCALE[p.mi];
    _v.set(p.body.position.x,
      p.body.position.y - p.radius * (1 - sc.y) * 0.8,
      p.body.position.z);
    _q.set(p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w);
    _s.set(p.radius * sc.x, p.radius * sc.y, p.radius * sc.z);
    _m.compose(_v, _q, _s);
    meshes[p.mi].setMatrixAt(p.ii, _m);
    touched[p.mi] = true;
  }
  for (let v = 0; v < 3; v++) {
    if (force || touched[v]) {
      meshes[v].instanceMatrix.needsUpdate = true;
      // Three caches this for InstancedMesh.raycast; stones have moved.
      meshes[v].boundingSphere = null;
    }
  }
}

const MAX_PEBBLE_SPEED = 2.6;

/**
 * A swipe: gently shove every pebble near the segment a→b (both XZ points).
 * Deliberately soft — this is combing, not an explosion.
 */
export function swipeImpulse(ax, az, bx, bz, radius, strength) {
  noteDisturbance();
  const dx = bx - ax, dz = bz - az;
  const segLen2 = dx * dx + dz * dz;
  let ux = dx, uz = dz;
  const len = Math.sqrt(segLen2) || 1;
  ux /= len; uz /= len;
  let woke = 0;

  for (const p of pebbles) {
    const px = p.body.position.x, pz = p.body.position.z;
    let t = segLen2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cz = az + dz * t;
    const ddx = px - cx, ddz = pz - cz;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d > radius + p.radius) continue;

    const fall = 1 - d / (radius + p.radius);
    const k = strength * fall * fall * p.body.mass;
    p.body.wakeUp();
    resetSettle(p);
    woke++;
    // Along the swipe, a nudge sideways out of the furrow, and a small lift so
    // the top layer parts instead of just sliding.
    const outX = d > 1e-4 ? ddx / d : 0;
    const outZ = d > 1e-4 ? ddz / d : 0;
    p.body.applyImpulse(new CANNON.Vec3(
      (ux * 1.0 + outX * 0.8) * k,
      k * 0.42,
      (uz * 1.0 + outZ * 0.8) * k
    ));
    p.body.angularVelocity.x += (uz * -6 - outZ * 2) * fall;
    p.body.angularVelocity.z += (ux * 6 + outX * 2) * fall;
    clampSpeed(p.body);
  }
  return woke;
}

/** Wave-wash: a band at world z pushes everything it touches shoreward. */
export function washBand(z, halfWidth, strength) {
  noteDisturbance();
  for (const p of pebbles) {
    const d = Math.abs(p.body.position.z - z);
    if (d > halfWidth) continue;
    const fall = 1 - d / halfWidth;
    const k = strength * fall * p.body.mass;
    p.body.wakeUp();
    resetSettle(p);
    p.body.applyImpulse(new CANNON.Vec3(
      (Math.random() - 0.5) * k * 0.5, k * 0.75, k
    ));
    p.body.angularVelocity.x -= 5 * fall;
    clampSpeed(p.body);
  }
}

function clampSpeed(body) {
  const v = body.velocity;
  const s = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (s > MAX_PEBBLE_SPEED) {
    const f = MAX_PEBBLE_SPEED / s;
    v.x *= f; v.y *= f; v.z *= f;
  }
  const a = body.angularVelocity;
  const as = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (as > 14) { const f = 14 / as; a.x *= f; a.y *= f; a.z *= f; }
}

/** Dim the stones while Shine is active so the glass reads against them. */
export function setStoneDim(dim) {
  for (const m of meshes) {
    m.material.envMapIntensity = (m.material.userData.baseEnv ??= m.material.envMapIntensity) * (dim ? 0.35 : 1);
    m.material.color.setScalar(dim ? 0.42 : 1);
    m.material.needsUpdate = true;
  }
}
