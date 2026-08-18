// The things worth finding: sea glass and ceramic shards. Individual meshes
// (there are only ever ~6-10 per section, so per-piece materials are cheap) in
// the same physics world as the pebbles — whichever backend the quality profile
// picked (Rapier on High, lphys on Low) — most of them buried under the loose layer.

import * as THREE from 'three';
import { GLASS, CERAMIC_GRAMS, pickGlassColour } from './data.js';
import { shardGeometry, ceramicShardGeometry, glassMaterial, ceramicMaterial, glowTexture } from './env.js';
import { PIT } from './scene-beach.js';
import { world, setRestY, TAG_FIND, MODE_SPIN } from './physics.js';
// The one handle type, shared by both physics backends (js/phys.js): it only ever
// touches the SoA arrays and the world's own methods, which lphys and the Rapier
// wrapper agree on. So a find does not know or care which engine it is falling in.
import { Body } from './phys.js';
import { pileTopY, localTopY, shelteredSpots, roomAt } from './pebbles.js';

/**
 * A piece's collider.
 *
 * Every collider in either backend is a ball, and for a flat shard the radius is chosen
 * DELIBERATELY SMALL — about 1.5x its half-thickness rather than its outline. A
 * find is not shaped like a stone and it must not behave like one:
 *
 *   * a stone has to be able to come to rest ON TOP of a piece, because at this
 *     camera pitch that is the only thing that genuinely hides it. Give the piece a
 *     sphere as wide as its outline and the separation pass holds every stone a
 *     full radius away, so nothing can ever cover it.
 *   * the piece still cannot sift down out of reach, because its height is not
 *     decided by the pile: its rest height is its own half-thickness (setRestY), so
 *     it always ends up lying on the sand, exactly where the comb's sift can lift
 *     it again.
 *
 * `place()` puts it where it belongs immediately afterwards, before anything steps.
 */
function shardBody(mass, hx, hy, hz) {
  const i = world.add({
    r: Math.max(hy * 1.5, 0.03),
    mass,
    mode: MODE_SPIN,          // a shard tumbles; it does not roll like a pebble
    tag: TAG_FIND,
  });
  if (i < 0) return null;
  // Rests on the sand on its own thickness, not on its collision radius.
  setRestY(i, hy);
  return new Body(world, i);
}

export const finds = [];         // live, uncollected pieces
const flying = [];               // collected pieces mid-animation

let sceneRef = null;
let haloPool = [];
const glassGeoms = [];
const ceramicGeoms = [];

export function initFinds(scene) {
  sceneRef = scene;
  for (let i = 0; i < 6; i++) glassGeoms.push(shardGeometry(i + 1));
  for (let i = 0; i < 6; i++) ceramicGeoms.push(ceramicShardGeometry(i + 1));

  const tex = glowTexture();
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    s.visible = false;
    s.renderOrder = 18;
    scene.add(s);
    haloPool.push(s);
  }
}

/**
 * Live quality flip. There is nothing per-piece left to re-tune: the step rate,
 * the relaxation passes and the awake cap are all properties of the world (see
 * physics.js applyPhysicsQuality), and a position-based scheme has no contact skin
 * or CCD margin to scale. Kept as the one place to hang anything per-find that a
 * future profile needs.
 */
export function applyFindsQuality() { }

export function clearFinds() {
  for (const f of finds) {
    world.remove(f.body.i);
    sceneRef.remove(f.mesh);
    f.mesh.material.dispose();
  }
  finds.length = 0;
  for (const s of haloPool) { s.visible = false; s.material.opacity = 0; }
}

function makeGlass(colourId, rnd) {
  const g = GLASS[colourId];
  const scale = 0.8 + rnd() * 0.55;
  // Deliberately chunky relative to the stones. Slimmer, more realistic shards
  // sift straight down through the gaps in a sphere pile and can never be seen
  // or tapped — big enough to sit ON the shingle is worth more than accurate.
  // Halved (user: beach glass 50% smaller). The collider radius keeps its 0.03
  // floor in shardBody(), so smaller shards still can't sift out of reach / sight.
  const hx = 0.041 * scale * (0.9 + rnd() * 0.35);
  const hz = 0.0345 * scale * (0.9 + rnd() * 0.35);
  const hy = 0.011 * scale * (0.85 + rnd() * 0.4);

  const mesh = new THREE.Mesh(
    glassGeoms[Math.floor(rnd() * glassGeoms.length)],
    glassMaterial(g.hex)
  );
  mesh.scale.set(hx * 1.06, hy * 1.06, hz * 1.06);
  mesh.castShadow = true;

  const body = shardBody(0.16, hx, hy, hz);
  if (!body) { mesh.material.dispose(); return null; }

  return {
    kind: 'glass', colourId: colourId, mesh, body,
    grams: +(g.grams * (0.6 + scale * 0.55)).toFixed(1),
    rarity: g.rarity, name: g.name, hex: g.hex,
    radius: Math.max(hx, hz), halfY: hy,
  };
}

function makeCeramic(beach, shardIndex, rnd) {
  const hx = 0.0475 + rnd() * 0.015;
  const hz = hx * (0.82 + rnd() * 0.3);
  const hy = 0.011 + rnd() * 0.0035;
  const mesh = new THREE.Mesh(
    ceramicGeoms[shardIndex % ceramicGeoms.length],
    ceramicMaterial(beach.ceramic.base, beach.ceramic.accent)
  );
  mesh.scale.set(hx * 1.06, hy * 1.3, hz * 1.06);
  mesh.castShadow = true;

  const body = shardBody(0.2, hx, hy, hz);
  if (!body) { mesh.material.dispose(); return null; }

  return {
    kind: 'ceramic', shardIndex, mesh, body,
    grams: +(CERAMIC_GRAMS * (0.7 + rnd() * 0.6)).toFixed(1),
    rarity: 'uncommon', name: 'Ceramic Shard ' + (shardIndex + 1) + '/10',
    hex: beach.ceramic.accent, radius: Math.max(hx, hz), halfY: hy,
  };
}

function place(f, x, z, y, rnd) {
  // `place` (not position.set) so the previous position goes with it and no
  // velocity is inferred from the jump on the next step.
  f.body.place(x, y, z);
  f.body.quaternion.setFromEuler((rnd() - 0.5) * 0.6, rnd() * 6.283, (rnd() - 0.5) * 0.6);
  sceneRef.add(f.mesh);
  syncOne(f);
  finds.push(f);
}

/**
 * Lay out a section's pieces on the bare pit floor. Call BEFORE the pebbles are
 * generated so the stones drop on top and bury them; `surface` pieces get
 * lifted to the top of the finished pile afterwards.
 */
export function spawnFinds(beach, save, rnd) {
  clearFinds();
  const [lo, hi] = beach.glassPerSection;
  const count = lo + Math.floor(rnd() * (hi - lo + 1));
  const inset = 0.24;

  for (let i = 0; i < count; i++) {
    const f = makeGlass(pickGlassColour(beach, rnd), rnd);
    if (!f) break;                       // world full: ship the section as it is
    f.depth = pickDepth(f.rarity, rnd);
    applyDepthMass(f);
    // Straight onto the sand at its own thickness, so the stones generated next
    // land on top of it rather than under it.
    place(f,
      (rnd() * 2 - 1) * (PIT.hw - inset),
      (rnd() * 2 - 1) * (PIT.hd - inset),
      f.halfY + 0.004, rnd);
  }

  // Ceramic shards: only ones this player has not found on this beach.
  const found = save.ceramics[beach.id] || [];
  const remaining = [];
  for (let i = 0; i < 10; i++) if (!found.includes(i)) remaining.push(i);
  if (remaining.length) {
    let n = rnd() < 0.62 ? 1 : 0;
    if (n && rnd() < 0.22) n = 2;
    // Nearly done? Be generous so the last shard is not a slog.
    if (remaining.length <= 2 && rnd() < 0.5) n = Math.max(n, 1);
    for (let i = 0; i < n && remaining.length; i++) {
      const pick = remaining.splice(Math.floor(rnd() * remaining.length), 1)[0];
      const f = makeCeramic(beach, pick, rnd);
      if (!f) break;
      f.depth = pickDepth('uncommon', rnd);
      applyDepthMass(f);
      place(f,
        (rnd() * 2 - 1) * (PIT.hw - inset),
        (rnd() * 2 - 1) * (PIT.hd - inset),
        f.halfY + 0.004, rnd);
    }
  }

  // Exactly ONE piece is guaranteed in plain sight, so a fresh stretch of beach
  // still opens with something to tap — but only one, so the rest has to be
  // uncovered.
  const onTop = finds.filter((f) => f.depth === 'top');
  if (!onTop.length) {
    const rest = finds.filter((f) => f.depth !== 'top').sort((a, b) =>
      (a.rarity === 'common' ? 0 : 1) - (b.rarity === 'common' ? 0 : 1));
    if (rest.length) {
      rest[0].depth = 'top';
      applyDepthMass(rest[0]);
    }
  } else if (onTop.length > 1) {
    for (const f of onTop.slice(1)) { f.depth = 'shallow'; applyDepthMass(f); }
  }
  return finds.length;
}

/**
 * A flat piece in a jostled bed of stones rises or sinks with its density (the
 * Brazil-nut effect), so the depth tier is enforced with mass as well as with a
 * starting height — otherwise everything ends up on top within a second. The
 * comb's own impulse is mass-scaled, so a heavy piece still lifts the same
 * amount when the player actually rakes it.
 */
const DEPTH_MASS = { top: 0.16, shallow: 0.34, deep: 0.9 };

function applyDepthMass(f) {
  f.body.mass = DEPTH_MASS[f.depth] || 0.16;
  f.body.updateMassProperties();
}

/**
 * Three tiers, so a section always has something to see, something one sweep
 * away, and something you have to dig for. Rarer pieces skew deeper.
 */
function pickDepth(rarity, rnd) {
  const r = rnd();
  // Only about one piece in ten starts in plain sight. Combing IS the game, so a
  // section that hands over most of its glass without a single swipe is broken —
  // and with `top` at 0.28 for commons that is exactly what was happening.
  if (rarity === 'rare') return r < 0.02 ? 'top' : r < 0.24 ? 'shallow' : 'deep';
  if (rarity === 'uncommon') return r < 0.06 ? 'top' : r < 0.4 ? 'shallow' : 'deep';
  return r < 0.12 ? 'top' : r < 0.5 ? 'shallow' : 'deep';
}

/**
 * How far below the surface of the stones a piece may ever be put.
 *
 * One stroke of the comb parts roughly the top course. On the fine beaches the
 * whole loose layer IS about one course, so "on the sand" was always within reach
 * and `deep` could simply mean "where it spawned". On the coarse-cobble beaches a
 * 252-stone bed is 40cm deep, and a piece lying on the sand under it took 14 full
 * strokes to uncover barely half a section (measured on stormPoint). So the tiers
 * are now expressed against the LOCAL SURFACE with a hard floor on the depth:
 * hidden, but never further down than a player can rake.
 */
const RAKE_REACH = 0.16;

/**
 * Move each piece to its depth tier now that the pile exists. Uses the LOCAL
 * stone height, not the pile average — dropping a shard to the average height on
 * a lumpy pile just buries it again in the nearest hollow.
 */
export function placeFindsByDepth() {
  for (const f of finds) {
    const local = localTopY(f.body.position.x, f.body.position.z, 0.22);
    if (f.depth === 'deep') {
      // Only ever LIFTED, never pushed down: on a thin pile a deep piece stays on
      // the sand exactly as before, and this does nothing at all.
      const ny = Math.max(f.halfY, local - RAKE_REACH);
      if (ny > f.body.position.y + 0.004) {
        f.body.place(f.body.position.x, ny, f.body.position.z);
        f.body.velocity.setZero();
        f.body.angularVelocity.setZero();
        f.body.wakeUp();
      }
      continue;
    }
    const top = Math.max(pileTopY(), local);
    // Burial depth is a FRACTION of the local pile, not a fixed 0.22: on the
    // fine-shingle beaches the pile is barely 0.2 deep, so a fixed drop clamped
    // straight onto the sand and left the piece sitting in the open.
    const under = Math.min(RAKE_REACH, Math.max(0.1, local * 0.62));
    if (f.depth === 'shallow' && local < 0.2) {
      // A thin pile has no "one course down" to move to, and the stones were
      // already aimed at where this piece is lying (see generatePebbles' cover
      // slots) — moving it now would just walk it out from under them.
      continue;
    }
    // Heights are measured with the piece's THICKNESS, not its outline: a shard
    // laid on the pile at `top + radius` floats a visible centimetre above it,
    // because the outline is four times the thickness.
    const ny = f.depth === 'top'
      ? top + f.halfY + 0.008
      : Math.max(f.halfY, local - under);
    f.body.place(f.body.position.x, ny, f.body.position.z);
    // Lie flat-ish so it reads as a glinting facet from above.
    f.body.quaternion.setFromEuler((Math.random() - 0.5) * 0.5,
      Math.random() * 6.283, (Math.random() - 0.5) * 0.5);
    f.body.velocity.setZero();
    f.body.angularVelocity.setZero();
    f.body.wakeUp();
  }
}

/**
 * Enforce the rake reach AFTER the pile has settled.
 *
 * `placeFindsByDepth` caps how deep a piece is PUT, but two things happen to it
 * afterwards and both dig it back down: `hideExposedFinds` drops a piece into a
 * sheltered void, which on a cobble beach is down on the sand, and a few hundred
 * settling steps let a small collider sift through the gaps between big stones. On
 * stormPoint that left `deep` pieces 34cm under a 52cm surface — twice the reach
 * the burial comment promises, and measurably unrakeable (a full 14-stroke sweep
 * recovered 38% of a section).
 *
 * So this is the last word on depth: with the pile parked, anything further down
 * than RAKE_REACH is walked back UP to the lowest free slot that is still hidden
 * from the camera. A piece that cannot be lifted without coming into plain sight is
 * left where it is — burial wins that tie, since an exposed piece is a worse bug
 * than a deep one. The piece is left asleep and nothing steps afterwards, so it
 * cannot sift down again.
 *
 * Returns how many pieces were raised.
 */
const LIFT_STEP = 0.03;

export function liftToRakeReach(camera, pebbleMeshes) {
  let lifted = 0;
  for (const f of finds) {
    if (f.depth === 'top') continue;
    const x = f.body.position.x, z = f.body.position.z;
    const y0 = f.body.position.y;
    const local = localTopY(x, z, 0.22);
    const floor = Math.max(f.halfY, local - RAKE_REACH);
    if (y0 >= floor - 0.004) continue;
    let placed = false;
    // Two goes at finding room. The first asks for the piece's whole OUTLINE to be
    // clear, which is what looks right; a dense cobble bed often has no such gap, so
    // the second asks only for its COLLIDER to be clear, which is what actually
    // matters (a thin shard whose corner tucks under a stone reads as buried, not as
    // broken, and nothing will pop it out when the player rakes there).
    for (const hr of [f.radius, f.radius * 0.45]) {
      for (let y = floor; y < local && !placed; y += LIFT_STEP) {
        if (!roomAt(x, y, z, hr, f.halfY)) continue;
        f.body.place(x, y, z);
        f.body.velocity.setZero();
        f.body.angularVelocity.setZero();
        f.body.sleep();
        syncOne(f);
        placed = !isExposed(f, camera, pebbleMeshes);
      }
      if (placed) break;
    }
    if (placed) { lifted++; world.moved[f.body.i] = 0; continue; }
    // Nothing worked: put it back exactly where it was.
    f.body.place(x, y0, z);
    f.body.velocity.setZero();
    f.body.angularVelocity.setZero();
    f.body.sleep();
    syncOne(f);
    world.moved[f.body.i] = 0;
  }
  return lifted;
}

/**
 * Move any piece that is meant to be hidden but is in plain view into a void
 * under the stones, and report how many are still exposed.
 *
 * Burying by "spawn first, drop the stones on top" only works when the stones
 * cover the floor several times over. The beaches use smaller stones now, so the
 * pile has real gaps and a piece can settle in one with a clear line to the
 * camera — which let a player tap most of a section without ever combing. This
 * finds a spot that already has a stone bridging over it and puts the piece
 * there, checking against the actual sight line rather than hoping.
 */
export function hideExposedFinds(camera, pebbleMeshes) {
  let stillOpen = 0;
  for (const f of finds) {
    if (f.depth === 'top') continue;
    if (!isExposed(f, camera, pebbleMeshes)) continue;
    const spots = shelteredSpots(f.halfY * 2 + 0.02);
    let hidden = false;
    for (const sp of spots) {
      // Do not rob another piece of its cover, and stay inside the pit.
      if (Math.abs(sp.x) > PIT.hw - 0.2 || Math.abs(sp.z) > PIT.hd - 0.2) continue;
      let clash = false;
      for (const o of finds) {
        if (o === f) continue;
        const dx = o.body.position.x - sp.x, dz = o.body.position.z - sp.z;
        if (dx * dx + dz * dz < 0.1) { clash = true; break; }
      }
      if (clash) continue;
      const y = f.halfY + 0.006;
      if (!roomAt(sp.x, y, sp.z, f.radius, f.halfY)) continue;
      f.body.place(sp.x, y, sp.z);
      f.body.velocity.setZero();
      f.body.angularVelocity.setZero();
      f.body.quaternion.setFromEuler((Math.random() - 0.5) * 0.4,
        Math.random() * 6.283, (Math.random() - 0.5) * 0.4);
      f.body.wakeUp();   // teleported into a hollow: it must not stay parked
      syncOne(f);
      if (!isExposed(f, camera, pebbleMeshes)) { hidden = true; break; }
    }
    if (!hidden) stillOpen++;
  }
  return stillOpen;
}

export function settleFinds() {
  for (const f of finds) {
    f.body.sleep();
    syncOne(f);
    world.moved[f.body.i] = 0;
  }
}

function syncOne(f) {
  f.mesh.position.set(f.body.position.x, f.body.position.y, f.body.position.z);
  f.mesh.quaternion.set(f.body.quaternion.x, f.body.quaternion.y,
    f.body.quaternion.z, f.body.quaternion.w);
}

/**
 * Copy transforms to the meshes — same contract as the pebbles: only the pieces
 * the world says actually moved, and the flag is cleared here. A settled section
 * writes nothing at all.
 */
export function syncFinds() {
  for (const f of finds) {
    if (!world.moved[f.body.i]) continue;
    world.moved[f.body.i] = 0;
    syncOne(f);
  }
}

/**
 * Backstop on top of lphys's own sleep test, in the same spirit as the pebbles':
 * a shard wedged between two stones can jiggle indefinitely, and one permanently
 * awake particle keeps the whole world's step alive.
 */
export function settleFindsTick(dt) {
  let awake = 0;
  for (const f of finds) {
    if (f.body.frozen) { f.calm = 0; continue; }
    awake++;
    const v = f.body.velocity, w = f.body.angularVelocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    const spin = Math.hypot(w.x, w.y, w.z);
    if (speed < 0.28 && spin < 2.0) {
      f.calm = (f.calm || 0) + dt;
      if (f.calm > 0.55) { f.body.sleep(); awake--; }
    } else {
      f.calm = 0;
    }
  }
  return awake;
}

export function wakeFindsNear(x, z, radius) {
  for (const f of finds) {
    const dx = f.body.position.x - x, dz = f.body.position.z - z;
    if (dx * dx + dz * dz < radius * radius) { f.body.wakeUp(); f.calm = 0; }
  }
}

/**
 * The comb passing over a piece.
 *
 * Impulses alone do not work here: 240 stones weigh far more than one shard, so
 * a swipe just shuffles shingle ON TOP of the glass and combing made a section
 * *harder*, which is exactly backwards. So the comb also SIFTS — each pass raises
 * a buried piece a few centimetres towards the local surface. Two or three
 * strokes over the same patch bring a shallow piece up; a deep one takes real
 * work. That is the sieving action of a real beachcomber's scoop, and it means
 * effort always pays.
 */
const SIFT_PER_PASS = 0.05;

export function swipeFinds(ax, az, bx, bz, radius, strength) {
  const dx = bx - ax, dz = bz - az;
  const segLen2 = dx * dx + dz * dz;
  const len = Math.sqrt(segLen2) || 1;
  const ux = dx / len, uz = dz / len;

  for (const f of finds) {
    const px = f.body.position.x, pz = f.body.position.z;
    let t = segLen2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / segLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ddx = px - (ax + dx * t), ddz = pz - (az + dz * t);
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    const reach = radius + f.radius + 0.1;
    if (d > reach) continue;

    const fall = 1 - d / reach;
    const k = strength * fall * f.body.mass;
    f.body.wakeUp();
    f.calm = 0;
    f.body.applyImpulse(ux * k * 0.5, k * 1.6, uz * k * 0.5);
    f.body.angularVelocity.x += (Math.random() - 0.5) * 5 * fall;
    f.body.angularVelocity.z += (Math.random() - 0.5) * 5 * fall;
    const v = f.body.velocity;
    const s = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (s > 2.2) { const m = 2.2 / s; v.x *= m; v.y *= m; v.z *= m; }

    // The sift. Only while the comb is genuinely over the piece.
    if (fall >= 0.25) {
      const surface = localTopY(px, pz, 0.2) + f.radius * 0.35;
      const buried = surface - f.body.position.y;
      if (buried > 0.01) {
        f.body.position.y += Math.min(SIFT_PER_PASS * fall, buried);
      }
    }
    // Velocity, spin and the sift were all written into the mirrors directly.
    f.body.markDirty();
  }
}

/**
 * Safety net. A shard can be flung against a wall or wedged on top of the pile
 * edge; rather than leave it hovering somewhere unreachable, drop it back into
 * the pit. Cheap — there are only ever a handful of pieces.
 */
export function containFinds() {
  for (const f of finds) {
    const p = f.body.position;
    const lim = 0.9;                 // nothing legitimately gets this high
    const outX = Math.abs(p.x) > PIT.hw - 0.05;
    const outZ = Math.abs(p.z) > PIT.hd - 0.05;
    if (p.y < lim && !outX && !outZ && p.y > -0.2) continue;
    const nx = Math.max(-PIT.hw + 0.2, Math.min(PIT.hw - 0.2, p.x));
    const nz = Math.max(-PIT.hd + 0.2, Math.min(PIT.hd - 0.2, p.z));
    f.body.place(nx, localTopY(nx, nz, 0.2) + f.halfY + 0.01, nz);
    f.body.velocity.setZero();
    f.body.angularVelocity.setZero();
    f.body.wakeUp();     // it has been teleported; also marks the write dirty
    f.calm = 0;
  }
}

// --- picking ---------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

// A shard is only ~18px across on a tablet, and a seven-year-old's finger is
// not a mouse. So a tap fires a small spiral of rays and takes the nearest
// piece that is genuinely uncovered at one of them. Forgiving on aim, still
// honest about occlusion.
const TAP_SAMPLES = [[0, 0]];
for (const r of [13, 26]) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (r > 20 ? Math.PI / 8 : 0);
    TAP_SAMPLES.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
}

/**
 * Hit-test a tap. Pebbles are included in the ray so you cannot pluck a piece
 * out from under a stone — it has to actually be exposed.
 */
export function pickAt(ndc, camera, pebbleMeshes) {
  if (!finds.length) return null;
  const targets = pebbleMeshes.concat(finds.map((f) => f.mesh));
  const sx = 2 / window.innerWidth, sy = 2 / window.innerHeight;
  let best = null, bestD = Infinity;
  for (const [ox, oy] of TAP_SAMPLES) {
    _ndc.set(ndc.x + ox * sx, ndc.y - oy * sy);
    raycaster.setFromCamera(_ndc, camera);
    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) continue;
    const f = finds.find((x) => x.mesh === hits[0].object);
    if (f && hits[0].distance < bestD) { best = f; bestD = hits[0].distance; }
  }
  return best;
}

/** Debug: what does the ray actually hit at this NDC point? */
export function pickDebug(ndc, camera, pebbleMeshes) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(
    pebbleMeshes.concat(finds.map((f) => f.mesh)), false);
  return hits.slice(0, 4).map((h) => {
    const f = finds.find((x) => x.mesh === h.object);
    return {
      d: +h.distance.toFixed(3),
      what: f ? f.kind + ':' + (f.colourId || 'shard' + f.shardIndex)
        : h.object.isInstancedMesh ? 'pebble' : h.object.name || 'other',
    };
  });
}

/** Is this piece visible from the camera, or is a stone in the way? */
/**
 * The other half of the burial contract: the ONE piece that is meant to be in plain
 * sight has to actually be in plain sight.
 *
 * `placeFindsByDepth` lifts it onto the pile early in the build, but several
 * hundred physics steps run after that — stones roll, the pile flattens, and on a
 * 252-stone bed a cobble lands on the poor thing often enough to matter (three of
 * six beaches opened with nothing visible at all before this). So the last thing
 * the build does is walk the piece around the surface until the actual sight-line
 * raycast agrees it can be seen. Called with the pile already parked, and it leaves
 * the piece asleep, so nothing moves afterwards to hide it again.
 *
 * Returns how many `top` pieces are still hidden (0 in practice).
 */
export function exposeTopFinds(camera, pebbleMeshes, rnd) {
  const r = rnd || Math.random;
  let stuck = 0;
  for (const f of finds) {
    if (f.depth !== 'top') continue;
    if (isExposed(f, camera, pebbleMeshes)) continue;
    let ok = false;
    // Candidate 1 is straight up from where it already lies, so a piece that just
    // needs lifting a centimetre is not teleported across the beach for no reason.
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const x = attempt === 0 ? f.body.position.x
        : (r() * 2 - 1) * (PIT.hw - 0.26);
      const z = attempt === 0 ? f.body.position.z
        : (r() * 2 - 1) * (PIT.hd - 0.26);
      const y = localTopY(x, z, 0.2) + f.halfY + 0.012;
      f.body.place(x, y, z);
      // Flat, face up: this piece is the section's invitation to tap.
      f.body.quaternion.setFromEuler((r() - 0.5) * 0.22, r() * 6.283, (r() - 0.5) * 0.22);
      f.body.sleep();
      syncOne(f);
      ok = isExposed(f, camera, pebbleMeshes);
    }
    if (!ok) stuck++;
    world.moved[f.body.i] = 0;
  }
  return stuck;
}

export function isExposed(f, camera, pebbleMeshes) {
  // matrixWorld is only refreshed by the renderer, so a piece moved this frame
  // would still be ray-tested at its previous transform. Force it current.
  f.mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const dir = new THREE.Vector3().subVectors(f.mesh.position, camera.position).normalize();
  raycaster.set(camera.position, dir);
  raycaster.far = camera.position.distanceTo(f.mesh.position) + 0.3;
  const hits = raycaster.intersectObjects(pebbleMeshes.concat([f.mesh]), false);
  raycaster.far = Infinity;
  return hits.length > 0 && hits[0].object === f.mesh;
}

// --- collect ---------------------------------------------------------------

export function removeFind(f) {
  const i = finds.indexOf(f);
  if (i >= 0) finds.splice(i, 1);
  world.remove(f.body.i);
}

/** Detach the mesh and fly it to a screen-space target (the HUD tally). */
export function flyToHud(f, target) {
  const start = f.mesh.position.clone();
  const mid = start.clone().lerp(target, 0.45);
  mid.y += 0.8;
  flying.push({ mesh: f.mesh, start, mid, end: target.clone(), t: 0, dur: 0.62,
    spin: (Math.random() - 0.5) * 12 });
}

export function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const fl = flying[i];
    fl.t += dt;
    const p = Math.min(1, fl.t / fl.dur);
    const e = p * p * (3 - 2 * p);
    // quadratic bezier through mid
    const a = 1 - e;
    fl.mesh.position.set(
      a * a * fl.start.x + 2 * a * e * fl.mid.x + e * e * fl.end.x,
      a * a * fl.start.y + 2 * a * e * fl.mid.y + e * e * fl.end.y,
      a * a * fl.start.z + 2 * a * e * fl.mid.z + e * e * fl.end.z
    );
    fl.mesh.rotateY(fl.spin * dt);
    fl.mesh.rotateX(fl.spin * 0.6 * dt);
    const shrink = 1 - e * 0.75;
    fl.mesh.scale.multiplyScalar(1 + (shrink - 1) * dt * 4);
    if (p >= 1) {
      sceneRef.remove(fl.mesh);
      fl.mesh.material.dispose();
      flying.splice(i, 1);
    }
  }
}

// --- Shine / Radar presentation -------------------------------------------

let shineT = 0;

export function setShine(on) {
  shineT = on ? 0.0001 : 0;
  for (const f of finds) {
    if (f.kind === 'glass') {
      f.mesh.material.emissiveIntensity = on ? 0.85 : 0.06;
      f.mesh.material.opacity = on ? 0.92 : 0.76;
    } else {
      f.mesh.material.emissive = f.mesh.material.emissive || new THREE.Color();
      f.mesh.material.emissive.setHex(on ? 0x604020 : 0x000000);
      f.mesh.material.emissiveIntensity = on ? 0.6 : 0;
    }
    f.mesh.material.needsUpdate = true;
  }
  if (!on) for (const s of haloPool) { s.visible = false; s.material.opacity = 0; }
}

/** While Shine is up, halo sprites render through the stones. */
export function updateShine(dt, t) {
  if (!shineT) return;
  let i = 0;
  for (const f of finds) {
    if (i >= haloPool.length) break;
    const s = haloPool[i++];
    s.visible = true;
    s.position.copy(f.mesh.position);
    s.position.y += 0.03;
    s.material.color.setHex(f.hex);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + f.mesh.position.x * 4);
    s.material.opacity = 0.38 + pulse * 0.42;
    s.scale.setScalar(0.16 + pulse * 0.07 + f.radius * 1.4);
  }
  for (; i < haloPool.length; i++) haloPool[i].visible = false;
}

export function findsRemaining() { return finds.length; }
