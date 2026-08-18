// The pebble layer: three InstancedMeshes (different lumpy shapes + different
// roughness so the pile has dry and wet-looking stones) driven by spheres in the
// beach world (js/physics.js), whichever backend that world is running on — Rapier
// rigid bodies on High, the game's own position-based relaxation on Low. Nothing
// here knows or cares which: both expose the same arrays and the same methods.
//
// Perf contract:
//   * ~500 real, movable stones on BOTH profiles. The count is not a quality knob:
//     what costs money per frame is the AWAKE SET, and that is capped separately
//     (96 on High, 40 on Low). The painted shingle bed underneath (env.js paints it
//     from the same palette and the same stone shapes) fills in below them.
//   * the pile is FROZEN at rest. A swipe wakes only the stones near the stroke
//     (capped by the profile); they run for a few dozen frames and re-freeze. When
//     nothing is awake, nothing is integrated, hashed or uploaded.
//   * instance matrices are written at bake, then only for stones that actually
//     moved, and `instanceMatrix.needsUpdate` is only set on a frame where at
//     least one did. A settled pile costs zero GPU transform work.
//   * one draw call per mesh variant (plus one more each in the shadow pass)

import * as THREE from 'three';
import {
  pebbleGeometry, perf,
  STONE_VARIANT_SCALE, STONE_VARIANT_MIX, stoneTint, pickStoneVariant,
} from './env.js';
import { PIT } from './scene-beach.js';
import { world, TAG_PEBBLE, MODE_ROLL, setRestY, setCeilingRest } from './physics.js';
import { profile } from './quality.js';

// CAPACITY is what the instanced meshes are ALLOCATED for and never changes, so
// flipping the quality toggle never has to rebuild them; the profile fills as many
// of the slots as it wants (167 x 3 = 501 on both profiles today, with headroom).
const CAPACITY = 168;
const perMeshCap = () => Math.min(CAPACITY, profile().pebblePerMesh);

// The stone's LOOK — its footprint, flattening and tint — is shared with the
// painted shingle bed and lives in env.js, so the two cannot drift apart.
const VARIANT_SCALE = STONE_VARIANT_SCALE;
const VARIANT_MIX = STONE_VARIANT_MIX;

// --- collider vs visual ----------------------------------------------------
// The collision sphere is smaller than the visible stone, and the gap is
// deliberate: a beach is a bed of interpenetrating lumps, not a tray of billiard
// balls. It also means the separation pass has far fewer overlapping pairs to
// resolve for the same apparent density.
//
// COLLIDER_SCALE is the sphere radius as a fraction of the stone's nominal radius,
// so it is about 0.55 of the visible width at the shipped 0.70. What it must NOT
// do is let a stone fall THROUGH the pack, so the rest height, the rim clamp, the
// sink offset and pileStats all measure against the sphere, not the lump.
const COLLIDER_SCALE = 0.70;
let colliderScale = COLLIDER_SCALE;
const csOverride = /[?&]cs=([\d.]+)/.exec(location.search);
if (csOverride) {
  const v = parseFloat(csOverride[1]);
  if (v > 0.2 && v <= 1.5) colliderScale = v;
}

/** Debug / tuning hook: change the collider-to-stone ratio and rebuild. */
export function setColliderScale(s) {
  if (s > 0.2 && s <= 1.5) colliderScale = s;
  return colliderScale;
}

/** The current ratios, for the perf readout and the regression harness. */
export function colliderRatio() {
  return {
    ofRadius: +colliderScale.toFixed(3),
    ofVisualWidth: +(colliderScale / (
      VARIANT_SCALE.reduce((s, v, i) => s + v.x * VARIANT_MIX[i], 0))).toFixed(3),
  };
}

export const meshes = [];
/** { i (particle index), mi (mesh variant), ii (instance slot), radius, cr } */
export const pebbles = [];

// lphys re-freezes each stone on its own (calm for a few frames, or its wake
// window running out). This is the backstop on TOP of that: however long the pile
// wants to argue with itself, it is parked outright this many seconds after the
// player last touched it. A stone freezing mid-roll is invisible; a permanently
// awake pile is the frame-rate cliff we cannot afford.
const SETTLE_DEADLINE = 1.6;
let sinceDisturb = 1e9;

let pileTop = 0.3;
let stoneColors = [];

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
/** The shadeLift the current instance colours were baked with. */
let writtenLift = profile().shadeLift;

/**
 * The flat sky fill added back to the Lambert stones on the Low profile — see
 * pebbleMaterial. Fitted with profile.low.shadeLift as a pair, not eyeballed:
 * research/match.mjs shoots the pit with and without the movable stones on every
 * beach, and the two constants are solved so the pile matches its own painted bed
 * on all four. This one is the dark-beach knob: at 0.07 stormPoint's near-black
 * slate measured 1.45x its bed and looked milky, 0.04 lands it at 1.16.
 */
const LAMBERT_FILL = 0.04;

/**
 * The stone material for one variant, at the current quality level.
 *
 * High is PBR: roughness varies per variant and the generated environment map
 * supplies the wet-stone sheen. Low is MeshLambertMaterial with NO env map —
 * three only resolves `scene.environment` for Standard/Physical materials, so a
 * Lambert stone is lit by the two lights alone. That drops the whole PMREM
 * sampling + BRDF path from the fragment shader for the instances that cover most
 * of the screen. (The sea glass keeps its PBR material either way: shiny
 * translucent glass IS the game.)
 */
function pebbleMaterial(v) {
  if (profile().pebbleShading === 'lambert') {
    // The env map's contribution is mostly a flat skyful of fill light, and losing
    // it is not a proportional loss: measured against the PBR pile, Lambert stones
    // came out 22% darker on the pale beaches and 50% darker on stormPoint's dark
    // ones, which no `shadeLift` multiplier can straighten out. `emissive` puts that
    // fill back in the shape it actually has — the same amount for a black stone as
    // for a white one — and it costs one add in the fragment shader.
    return new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: 0xdfe7ee,                 // sky, not white: the fill is daylight
      emissiveIntensity: LAMBERT_FILL,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: v === 0 ? 0.88 : v === 1 ? 0.58 : 0.34,
    metalness: 0.0,
    envMapIntensity: v === 0 ? 0.55 : v === 1 ? 0.9 : 1.35,
  });
}

export function initPebbles(scene) {
  const shadows = profile().shadows;
  for (let v = 0; v < 3; v++) {
    const im = new THREE.InstancedMesh(pebbleGeometry(v), pebbleMaterial(v), CAPACITY);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.frustumCulled = false;
    im.count = 0;
    // Instance colours need to exist before the first setColorAt.
    im.setColorAt(0, _c.setHex(0xffffff));
    im.count = 0;
    scene.add(im);
    meshes.push(im);
  }
}

/**
 * Swap the stone shading (and the shadow flags) for the current profile, live.
 * Instance colours and matrices belong to the mesh, not the material, so the pile
 * keeps its colours and positions across the swap — no rebuild, no reload.
 */
export function applyPebbleQuality() {
  const shadows = profile().shadows;
  // Rescale the live instance colours so a mid-section toggle doesn't step the
  // pile's brightness: the tints were baked with the previous profile's lift.
  const ratio = profile().shadeLift / writtenLift;
  writtenLift = profile().shadeLift;
  for (let v = 0; v < 3; v++) {
    const im = meshes[v];
    if (!im) continue;
    if (ratio !== 1 && im.instanceColor) {
      const a = im.instanceColor.array;
      for (let i = 0; i < a.length; i++) a[i] *= ratio;
      im.instanceColor.needsUpdate = true;
    }
    const want = profile().pebbleShading === 'lambert' ? 'MeshLambertMaterial' : 'MeshStandardMaterial';
    if (im.material.type !== want) {
      const old = im.material;
      im.material = pebbleMaterial(v);
      old.dispose();
    }
    im.castShadow = shadows;
    im.receiveShadow = shadows;
  }
}

/** Which material the stones are drawn with (for the perf readout / tests). */
export function pebbleMaterialType() {
  return meshes.length ? meshes[0].material.type : null;
}

/** Hex colours of the current beach's stones, for the collection view etc. */
export function currentStoneColors() { return stoneColors; }

export function pileTopY() { return pileTop; }

export function clearPebbles() {
  for (const p of pebbles) world.remove(p.i);
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
  // The spawn grid is pitched on the AVERAGE COLLIDER, not on the largest lump.
  // Two things drive that:
  //   * neighbouring stones are meant to interpenetrate visually — that is what
  //     makes a beach look like packed shingle instead of a tray of billiard balls —
  //     so only the SPHERES need room, and they are 0.7 of the visible radius;
  //   * the containment treats anything above y=1.1 as flung out of the world, so
  //     500 stones have to be laid out in a few wide courses rather than a tower.
  // Pitching on the average leaves the occasional big pair a little overlapped at
  // spawn. That is fine and deliberate: resolving a SHALLOW overlap is exactly what
  // the relaxation pass does, and the bake gets a hundred-odd steps to do it. What
  // must never happen is a pair starting DEEPLY inside each other, which is why the
  // pitch is the average diameter and not something smaller.
  const cell = (rMin + rMax) * colliderScale * 1.02;
  const cols = Math.max(3, Math.floor(PIT.w / cell));
  const rows = Math.max(3, Math.floor(PIT.d / cell));
  const perLayer = cols * rows;

  // The count comes from the PROFILE, not from the beach: the awake set means a
  // frozen stone is free, so every beach gets the whole loose layer. (It used to be
  // an areal `coverage` target capped hard, which left the coarse-cobble beaches at
  // ~130 stones however much budget there was.) The `perLayer` term is only a
  // sanity bound so a hypothetical beach of boulders cannot ask for a tower.
  const cap = perMeshCap();
  const target = Math.min(cap * 3, perLayer * 4);

  // As many courses as it takes to lay `target` out flat. On the fine beaches that
  // is one or two; the big cobbles need three, which still tops out around y=0.65.
  const layers = Math.max(1, Math.ceil(target / (perLayer * 0.92)));
  const slots = [];
  const x0 = -PIT.hw + (PIT.w - cols * cell) / 2 + cell / 2;
  const z0 = -PIT.hd + (PIT.d - rows * cell) / 2 + cell / 2;
  for (let L = 0; L < layers; L++) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Enough jitter that the pile never reads as a grid, small enough that it
        // cannot turn the shallow overlap the pitch allows into a deep one.
        const slack = cell * 0.26;
        slots.push({
          x: x0 + c * cell + (rnd() - 0.5) * slack,
          z: z0 + r * cell + (rnd() - 0.5) * slack,
          y: rMax * 1.05 + L * cell,
        });
      }
    }
  }
  // Shuffle so a partly-filled layer is patchy rather than a neat block.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }

  // Stones deliberately aimed at the pieces already lying on the sand.
  //
  // With a loose layer of ~100 stones a fine-shingle beach cannot cover the pit
  // once over, so leaving burial to chance would leave half of every section lying
  // in the open and the comb would be optional. These slots are filled FIRST, so
  // each piece gets a small mound over it wherever it happens to be. They are
  // ordinary stones: one swipe still rakes them away, which is the whole point.
  const cover = [];
  if (coverPts && coverPts.length) {
    const step = rMax * 1.12;
    const boost = profile().coverRingBoost;
    for (const c of coverPts) {
      // The first slot is nearly OVERHEAD (a hair towards the camera): a piece of
      // glass is flat, its collision sphere is small, and a stone will happily
      // perch on top of it — which at this camera pitch is the only thing that
      // genuinely hides it. The rest of the ring packs stones in around it.
      const ring = rMax < 0.11
        ? [[0, step * 0.18], [0, step * 0.78], [-step * 0.92, 0], [step * 0.92, 0]]
        : [[0, step * 0.16], [0, step * 0.66], [-step * 0.8, step * 0.1]];
      if (boost > 0) {
        ring.push([step * 0.86, step * 0.34]);
        if (boost > 1) ring.push([-step * 0.5, -step * 0.62]);
      }
      for (const [ox, oz] of ring) {
        const x = THREE.MathUtils.clamp(c.x + ox, -PIT.hw + rMax, PIT.hw - rMax);
        const z = THREE.MathUtils.clamp(c.z + oz, -PIT.hd + rMax, PIT.hd - rMax);
        cover.push({ x, z, y: rMax * 1.15 });
      }
    }
    // Drop any grid slot that would spawn inside one of those.
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

  // How many of each variant, so every mesh stays inside the per-mesh cap.
  const quota = [0, 0, 0];
  for (let i = 0; i < target; i++) {
    let v = pickStoneVariant(rnd);
    if (quota[v] >= cap) v = quota.findIndex((q) => q < cap);
    if (v < 0) break;
    quota[v]++;
  }

  const cursor = [0, 0, 0];
  let placed = 0;
  let maxCr = 0.02;
  for (let i = 0; i < slots.length && placed < target; i++) {
    let v = -1;
    for (let k = 0; k < 3; k++) {
      const pick = (i + k) % 3;
      if (cursor[pick] < quota[pick]) { v = pick; break; }
    }
    if (v < 0) break;
    const ii = cursor[v]++;
    const radius = rMin + rnd() * (rMax - rMin);
    // The sphere the physics sees. Mass stays keyed to the VISIBLE stone: a pebble
    // should weigh what it looks like, and every impulse in the game is scaled by
    // mass, so shrinking the collider must not quietly make the pile lighter.
    const cr = radius * colliderScale;
    if (cr > maxCr) maxCr = cr;
    const slot = slots[i];

    const idx = world.add({
      x: slot.x, y: slot.y, z: slot.z,
      r: cr,
      mass: Math.max(0.08, radius * radius * radius * 90),
      mode: MODE_ROLL,
      tag: TAG_PEBBLE,
    });
    if (idx < 0) break;
    // Resting height: the sphere sits on the sand, bedded very slightly into it.
    setRestY(idx, cr * 0.92);
    world.setEuler(idx, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);

    pebbles.push({ i: idx, mi: v, ii, radius, cr });
    placed++;

    // Palette, brightness band and variant tint all come from env.js, which is
    // also what paints the shingle bed under the pile. shadeLift compensates the
    // indirect light the Lambert stones lose with the env map.
    stoneTint(_c, beach.stones[Math.floor(rnd() * beach.stones.length)], v, rnd,
      profile().shadeLift);
    meshes[v].setColorAt(ii, _c);
  }

  // The spatial hash's cell has to be at least the largest diameter in the world,
  // or two big stones can straddle four cells and miss each other.
  world.setCellFromMaxRadius(Math.max(maxCr, 0.06));

  writtenLift = profile().shadeLift;
  for (let v = 0; v < 3; v++) {
    meshes[v].count = cursor[v];
    if (meshes[v].instanceColor) meshes[v].instanceColor.needsUpdate = true;
  }

  // Everything is awake for the bake; settlePebbles() freezes it afterwards.
  world.wakeAll(600);
  perf.bodies = pebbles.length;
  return pebbles.length;
}

/**
 * Half-height of the VISIBLE stone. Anything the player sees or lands a piece of
 * glass on measures against this; anything the separation pass touches measures
 * against `p.cr`. Mixing the two up is how a find ends up hovering over the pile.
 */
function visHalfY(p) { return p.radius * VARIANT_SCALE[p.mi].y; }

/** After the bake: freeze the whole pile and record its height. */
export function settlePebbles() {
  parkAll();
  syncPebbles(true);
}

/** Freeze every stone and re-measure the pile height (it flattens as you comb). */
function parkAll() {
  const tops = [];
  for (const p of pebbles) {
    world.sleep(p.i);
    tops.push(world.py[p.i] + visHalfY(p));
  }
  // Anything else in the world (the finds) is parked by its own module.
  world.compactAwake();
  tops.sort((a, b) => a - b);
  pileTop = tops.length ? tops[Math.floor(tops.length * 0.82)] : 0.3;
  setCeilingRest(pileTop);
  sinceDisturb = 1e9;
}

/**
 * Frame hook: how many stones are still simulating, plus the settle backstop.
 * lphys parks each stone by itself (calm frames, or its wake window expiring), so
 * all this has to do is guarantee the pile as a whole reaches zero.
 */
export function settleTick(dt) {
  sinceDisturb += dt;
  let awake = 0;
  for (const p of pebbles) if (world.inAwake[p.i]) awake++;
  if (!awake) return 0;
  if (sinceDisturb > SETTLE_DEADLINE) { parkAll(); return 0; }
  return awake;
}

/** Called whenever the player disturbs the pile; restarts the settle deadline. */
export function noteDisturbance() { sinceDisturb = 0; }

/**
 * Height of the pile immediately around (x, z) — used to drop a "surface" find
 * onto the stones near it rather than at the pile's average height.
 */
export function localTopY(x, z, reach) {
  let top = 0;
  const r2 = reach * reach;
  for (const p of pebbles) {
    const dx = world.px[p.i] - x, dz = world.pz[p.i] - z;
    if (dx * dx + dz * dz > r2) continue;
    const t = world.py[p.i] + visHalfY(p);
    if (t > top) top = t;
  }
  return top || pileTop;
}

/**
 * Spots on the sand that already have a stone bridging over them.
 *
 * A stone resting on other stones leaves a shadowed void underneath, and that is
 * where a piece of glass genuinely belongs. `minClear` is the vertical room the
 * piece needs. Returned nearest-cover first (a low bridge hides better than a high
 * one) and shuffled within that.
 */
export function shelteredSpots(minClear) {
  const out = [];
  for (const p of pebbles) {
    const clear = world.py[p.i] - p.cr;
    if (clear < minClear) continue;
    out.push({ x: world.px[p.i], z: world.pz[p.i], clear, r: p.radius });
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
 * `hr` radius and `hy` half-thickness against the stone spheres.
 */
export function roomAt(x, y, z, hr, hy) {
  for (const p of pebbles) {
    const dy = Math.abs(world.py[p.i] - y);
    if (dy > p.cr + hy) continue;
    const dx = world.px[p.i] - x, dz = world.pz[p.i] - z;
    // Slice the sphere at this height: only the part of it beside the piece counts.
    const cut = Math.sqrt(Math.max(0, p.cr * p.cr - dy * dy));
    const need = cut + hr * 0.72;
    if (dx * dx + dz * dz < need * need) return false;
  }
  return true;
}

/**
 * Slide one spare stone onto the sight line to a piece that should be hidden.
 *
 * A piece is buried by spawning it first and dropping stones on top, but a loose
 * layer leaves real gaps, so a "deep" piece can still end up with a clear line to
 * the camera. Rather than move the piece, a stone from a crowded part of the pit is
 * lifted out and dropped onto that line, where there is free air. A find's
 * collision sphere is deliberately much smaller than its outline (see finds.js),
 * so a stone can settle ON a shard rather than being held a whole radius away.
 *
 * `dir` is the unit vector from the piece TOWARDS the camera; `protect` is the
 * other pieces, so robbing one hollow does not expose another.
 */
export function coverAlongRay(x, y, z, dir, protect) {
  let best = null, bestScore = -Infinity;
  for (const p of pebbles) {
    const px = world.px[p.i], py = world.py[p.i], pz = world.pz[p.i];
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

  // Where the sight line crosses the top of the local pile: free air, so the stone
  // can be dropped there without starting inside anything.
  const r = best.radius;
  const top = localTopY(x, z, 0.3);
  const h = Math.max(top, y + r) + r * 1.02;
  const t = dir.y > 0.15 ? (h - y) / dir.y : r * 1.4;
  world.place(best.i, x + dir.x * t, h, z + dir.z * t);
  world.wake(best.i, 600);
  return true;
}

/**
 * Debug / regression probe: is the pile actually holding up?
 *   * `floorPen`  — the deepest a stone's underside is below its rest height, as a
 *                   FRACTION of its own radius.
 *   * `sunk`      — stones whose centre is below half their radius.
 *   * `through`   — stones entirely below the sand. Must always be 0.
 *   * `outside`   — stones outside the rim. Must always be 0.
 */
export function pileStats() {
  let floorPen = 0, sunk = 0, through = 0, outside = 0;
  let minCentreY = Infinity, top = 0, awake = 0;
  for (const p of pebbles) {
    const x = world.px[p.i], y = world.py[p.i], z = world.pz[p.i], r = p.cr;
    const pen = r - y;
    if (pen / r > floorPen) floorPen = pen / r;
    if (y < r * 0.5) sunk++;
    if (y < -r) through++;
    if (Math.abs(x) > PIT.hw + 0.02 || Math.abs(z) > PIT.hd + 0.02) outside++;
    if (y < minCentreY) minCentreY = y;
    if (world.inAwake[p.i]) awake++;
    const vt = y + visHalfY(p);
    if (vt > top) top = vt;
  }
  return {
    stones: pebbles.length,
    collider: colliderRatio(),
    awake,
    floorPen: +Math.max(0, floorPen).toFixed(4),
    sunk, through, outside,
    minCentreY: +(minCentreY === Infinity ? 0 : minCentreY).toFixed(4),
    top: +top.toFixed(3),
    pileTop: +pileTop.toFixed(3),
  };
}

/** Debug: what is still moving, and where? */
export function activityDebug() {
  let worst = null, maxSpeed = 0, outside = 0, awake = 0;
  for (const p of pebbles) {
    if (!world.inAwake[p.i]) continue;
    awake++;
    const s = world.speed(p.i);
    if (s > maxSpeed) { maxSpeed = s; worst = p; }
    const x = world.px[p.i], y = world.py[p.i], z = world.pz[p.i];
    if (Math.abs(x) > PIT.hw + 0.1 || Math.abs(z) > PIT.hd + 0.1 || y < -0.05) outside++;
  }
  return {
    awake, maxSpeed: +maxSpeed.toFixed(3), outside,
    worst: worst ? {
      x: +world.px[worst.i].toFixed(2), y: +world.py[worst.i].toFixed(2),
      z: +world.pz[worst.i].toFixed(2), r: +worst.radius.toFixed(3),
    } : null,
  };
}

/**
 * Copy transforms into the instance matrices — for the stones that MOVED only.
 *
 * `world.moved[i]` is set by the integrator, the separation pass, the containment
 * clamp and any teleport, and cleared here. So a settled pile writes nothing and
 * `instanceMatrix.needsUpdate` is never set, which is what makes a frozen beach
 * cost no GPU transform work at all.
 */
export function syncPebbles(force) {
  const touched = [false, false, false];
  for (const p of pebbles) {
    if (!force && !world.moved[p.i]) continue;
    world.moved[p.i] = 0;
    const sc = VARIANT_SCALE[p.mi];
    // The lump is drawn a little BELOW its sphere, so a stone resting on the sand
    // beds into it instead of hovering. Derived from the sphere radius, not a
    // constant, so it stays correct at any COLLIDER_SCALE.
    _v.set(world.px[p.i],
      world.py[p.i] - Math.max(0, p.cr - p.radius * sc.y * 0.9),
      world.pz[p.i]);
    _q.set(world.qx[p.i], world.qy[p.i], world.qz[p.i], world.qw[p.i]);
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

// Scratch buffers for the "nearest N only" wake cap. Reused, so a swipe — which
// fires several times a second while a finger is moving — allocates nothing.
const _ci = new Int32Array(CAPACITY * 3);
const _cd = new Float32Array(CAPACITY * 3);
const _csort = new Float32Array(CAPACITY * 3);

/**
 * The distance beyond which candidates are ignored, so at most `cap` stones are
 * woken. Selecting the cap-th smallest distance is done by sorting a typed-array
 * view over the candidates we just collected: in-place, no allocation, and n is
 * only ever a few dozen.
 */
function wakeLimit(n, cap) {
  if (!(n > cap)) return Infinity;
  _csort.set(_cd.subarray(0, n));
  const view = _csort.subarray(0, n);
  view.sort();
  return view[cap - 1];
}

/**
 * A swipe: gently shove every pebble near the segment a→b (both XZ points).
 * Deliberately soft — this is combing, not an explosion.
 *
 * Only the stones NEAREST the stroke are woken, and never more than
 * `swipeWakeCap` of them. That cap plus the world's own `maxAwake` is what makes
 * a fast stroke across a full pit cost the same as a slow one: waking 60 stones is
 * the same spike as waking the lot.
 */
export function swipeImpulse(ax, az, bx, bz, radius, strength) {
  noteDisturbance();
  const reach = radius * profile().wakeRadiusScale;
  const dx = bx - ax, dz = bz - az;
  const segLen2 = dx * dx + dz * dz;
  let ux = dx, uz = dz;
  const len = Math.sqrt(segLen2) || 1;
  ux /= len; uz /= len;
  let woke = 0;

  // Pass 1: who is in reach, and how far off the stroke are they?
  let n = 0;
  for (let k = 0; k < pebbles.length; k++) {
    const p = pebbles[k];
    const px = world.px[p.i], pz = world.pz[p.i];
    let t = segLen2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ddx = px - (ax + dx * t), ddz = pz - (az + dz * t);
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d > reach + p.radius) continue;
    _ci[n] = k; _cd[n] = d; n++;
  }

  const cap = profile().swipeWakeCap;
  const limit = wakeLimit(n, cap);

  // Pass 2: shove the ones that made the cut.
  for (let k = 0; k < n; k++) {
    if (_cd[k] > limit || woke >= cap) continue;
    const p = pebbles[_ci[k]];
    const px = world.px[p.i], pz = world.pz[p.i];
    let t = segLen2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ddx = px - (ax + dx * t), ddz = pz - (az + dz * t);
    const d = _cd[k];

    const fall = 1 - d / (reach + p.radius);
    const imp = strength * fall * fall * world.mass(p.i);
    // Along the swipe, a nudge sideways out of the furrow, and a small lift so the
    // top layer parts instead of just sliding. applyImpulse wakes the stone; if the
    // awake set is already full it refuses, and the stone simply stays put.
    const outX = d > 1e-4 ? ddx / d : 0;
    const outZ = d > 1e-4 ? ddz / d : 0;
    if (world.applyImpulse(p.i,
      (ux * 1.0 + outX * 0.8) * imp,
      imp * 0.42,
      (uz * 1.0 + outZ * 0.8) * imp)) woke++;
  }
  return woke;
}

/**
 * Wave-wash: a band at world z pushes everything it touches shoreward. Same
 * nearest-first cap as a swipe, at twice the allowance — the wash is meant to roll
 * a whole strip of beach, but on a weak tablet it still must not wake everything.
 */
export function washBand(z, halfWidth, strength) {
  noteDisturbance();
  let n = 0;
  for (let k = 0; k < pebbles.length; k++) {
    const d = Math.abs(world.pz[pebbles[k].i] - z);
    if (d > halfWidth) continue;
    _ci[n] = k; _cd[n] = d; n++;
  }
  const cap = profile().swipeWakeCap * 2;
  const limit = wakeLimit(n, cap);
  let woke = 0;

  for (let i = 0; i < n; i++) {
    if (_cd[i] > limit || woke >= cap) continue;
    const p = pebbles[_ci[i]];
    const fall = 1 - _cd[i] / halfWidth;
    const imp = strength * fall * world.mass(p.i);
    if (world.applyImpulse(p.i,
      (Math.random() - 0.5) * imp * 0.5, imp * 0.75, imp)) woke++;
  }
  return woke;
}

/**
 * Dim the stones while Shine is active so the glass reads against them.
 * On the Low profile the stones are Lambert, which has no envMapIntensity at all —
 * the colour alone does the dimming there.
 */
export function setStoneDim(dim) {
  for (const m of meshes) {
    if (m.material.envMapIntensity !== undefined) {
      m.material.envMapIntensity =
        (m.material.userData.baseEnv ??= m.material.envMapIntensity) * (dim ? 0.35 : 1);
    }
    m.material.color.setScalar(dim ? 0.42 : 1);
    m.material.needsUpdate = true;
  }
}
