/* terrain.js — the canyon, and the only scenery that can kill you.
 *
 * ONE PROFILE, TWO CONSUMERS. The surface height is a pure function of world x
 * — `profileAt(x, side)` — and both the geometry and the collision line are
 * read from it. Nothing is duplicated, so nothing can drift apart.
 *
 * WHY NOT designs.terrainSlab. The kit's slab cuts its profile from a seed it
 * keeps to itself, which means chunk N+1's left edge has no idea what height
 * chunk N's right edge finished at — and a conveyor of those has a hard
 * vertical step at every join, on a straight line, at a regular interval. The
 * fix has to come from the profile being continuous ACROSS a join, so the
 * chunks are built here out of paper.js's own ribbonStack instead, from this
 * file's function. The look is deliberately identical to terrainSlab's: the
 * same bands, the same ramp span, the same near-white top sheet, the same
 * flipped-shadow trick for a ceiling.
 *
 * WHY IT IS SINES. The conveyor recycles a chunk by moving it one loop-length
 * to the right, which reuses geometry built for a different stretch of world.
 * That is only correct if the profile REPEATS with exactly that loop length,
 * so the profile is a sum of sines whose wavelengths divide the loop: it is
 * continuous everywhere, periodic to the floating-point bit, and needs no
 * per-recycle rebuild. Three octaves is enough that the repeat does not read
 * as a repeat inside a hundred-second stage.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { ribbonStack, mergeStack, disposeObject, contourStack, roundRectShape, blobShape } from './paper.js';
import { RIM } from './palette.js';

const T = CFG.terrain;
const PITCH = T.slabWidth - T.overlap;      // world x covered by one chunk
export const LOOP = PITCH * T.slabs;        // the profile's period

/* Wave counts are integers, so every term completes a whole number of cycles
   over LOOP and the join at x and x+LOOP is exact. The two sides get different
   phases so the canyon is never a mirror of itself. */
const WAVES = [
  { k: 1, amp: 1.00, floor: 0.00, ceil: 2.20 },
  { k: 2, amp: 0.58, floor: 1.90, ceil: 0.70 },
  { k: 5, amp: 0.26, floor: 3.30, ceil: 4.40 },
];

const TWO_PI = Math.PI * 2;

/* The shape parameters of the stage currently loaded. Set by `rebuild`, read
   by both the geometry and the collision line — there is only ever one of
   these, which is the whole point of the file. */
let P = Object.assign({}, T);

/* Height of the surface above its base, at a world x. `side` is 'floor' or
   'ceil'.
 *
 * Two terms. The WANDER is three sines whose wavelengths divide LOOP, so it is
 * continuous and exactly periodic and a recycled chunk lands on the same
 * curve it left. The PINCH is one-sided — a raised cosine cubed, which is zero
 * almost everywhere and rises to `pinch` in a narrow window — and it is added
 * to BOTH walls, so where it peaks the two close on each other and the canyon
 * becomes a slot. Making it one-sided matters: a plain sine would push the
 * walls apart by as much as it pulls them together, and half the stage would
 * have no visible wall at all.
 */
export function profileAt(x, side) {
  const u = x / LOOP;
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    h += Math.sin(u * TWO_PI * w.k + (side === 'ceil' ? w.ceil : w.floor)) * w.amp;
  }
  h *= P.amplitude;
  if (P.pinch > 0) {
    const c = (1 - Math.cos(u * TWO_PI * P.pinchK)) * 0.5;
    // Squared, not cubed: a cubed bump is so narrow the player slips through
    // the narrows without having to aim at it, which is not a squeeze.
    h += P.pinch * c * c;
  }
  return h;
}

export function createTerrain(scene, { rampName = 'STAGE1', stage = null } = {}) {
  let ramp = rampName;
  const group = new THREE.Group();
  // Just behind the actors and in front of the backdrop's scrim.
  group.position.z = 0.2;
  if (scene) scene.add(group);

  const floor = [];
  const ceil = [];

  /* ------------------------------------------------------------ obstacles */

  /* Some stages have things in the water as well as walls round it.
   *
   *   column  Kelp Forest: a stalk spanning the canyon with ONE gap in it,
   *           and the gap wanders from column to column. The stage is about
   *           finding the gap early and being on that line when it arrives.
   *   block   The Wreck: angular slabs adrift mid-water. Deliberately
   *           axis-aligned — a rotated slab whose hitbox is not rotated is
   *           the kind of unfairness that ends a session.
   *
   * A pool of eight, recycled, scrolling with the stage. Nothing is built
   * after setup: a column is rebuilt in place by moving its two halves.
   */
  const OB_POOL = 8;
  const obstacles = [];
  let obKind = null, obTimer = 0;

  function buildObstacle() {
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const piece = new THREE.Group();
      piece.add(contourStack(roundRectShape(1, 1, 0.22), {
        layers: 3, insetStep: 0.12, rampName: ramp, t0: 0.10, t1: 0.44, dz: 0.08,
      }));
      g.add(piece);
      parts.push(piece);
    }
    g.visible = false;
    group.add(g);
    return { g, parts, alive: false, x: 0, hw: 0, boxes: [] };
  }

  function releaseObstacles() {
    for (const o of obstacles) { o.alive = false; o.g.visible = false; }
    obTimer = 0;
  }

  /* Lay one out. A column is two stalks with a gap between them; a block is
     one slab (the second part is parked). Boxes are axis-aligned and are the
     collision, exactly as drawn. */
  function placeObstacle(o, x) {
    const C = P;
    o.alive = true;
    o.x = x;
    o.g.visible = true;
    o.boxes.length = 0;
    if (obKind === 'column') {
      const gapY = Math.sin(x * 0.013 * (C.gapRate || 1)) * (C.gapVary || 14);
      const w = C.width || 7;
      const top = 62, bottom = -62;
      const gapHalf = (C.gap || 34) * 0.5;
      const spans = [[gapY + gapHalf, top], [bottom, gapY - gapHalf]];
      for (let i = 0; i < 2; i++) {
        const [lo, hi] = spans[i];
        const h = hi - lo;
        const cy = (hi + lo) * 0.5;
        o.parts[i].scale.set(w, h, 1);
        o.parts[i].position.set(0, cy, 0);
        o.parts[i].visible = true;
        o.boxes.push(cy, h * 0.5, w * 0.5);
      }
      o.hw = w * 0.5;
    } else {
      const k = 1 + (Math.sin(x * 0.021) * (C.sizeVary || 0.4));
      const w = (C.width || 16) * k;
      const h = (C.height || 11) * k;
      const cy = Math.sin(x * 0.017) * (C.span || 26);
      o.parts[0].scale.set(w, h, 1);
      o.parts[0].position.set(0, cy, 0);
      o.parts[0].visible = true;
      o.parts[1].visible = false;
      o.boxes.push(cy, h * 0.5, w * 0.5);
      o.hw = w * 0.5;
    }
    o.g.position.x = x;
  }

  function updateObstacles(dt, scrollSpeed, layout) {
    if (!obKind) return;
    const dx = scrollSpeed * dt;
    for (const o of obstacles) {
      if (!o.alive) continue;
      o.x -= dx;
      o.g.position.x = o.x;
      if (o.x < -layout.halfW - 40) { o.alive = false; o.g.visible = false; }
    }
    obTimer -= dt;
    if (obTimer <= 0) {
      obTimer = P.every || 3;
      for (const o of obstacles) {
        if (o.alive) continue;
        placeObstacle(o, layout.halfW + 30);
        break;
      }
    }
  }

  /* True when a circle is inside any obstacle. Boxes are stored flat as
     (centreY, halfHeight, halfWidth) triples to keep this allocation-free. */
  function hitsObstacle(x, y, r) {
    if (!obKind) return false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.alive) continue;
      if (x < o.x - o.hw - r || x > o.x + o.hw + r) continue;
      for (let b = 0; b < o.boxes.length; b += 3) {
        const cy = o.boxes[b], hh = o.boxes[b + 1], hw = o.boxes[b + 2];
        if (Math.abs(y - cy) <= hh + r && Math.abs(x - o.x) <= hw + r) return true;
      }
    }
    return false;
  }

  /* One chunk: the profile sampled across its own span, banded downward, and
     merged to two draws. Sampling runs a touch past both ends so neighbouring
     chunks overlap by a hair rather than meeting on a shared vertex that a
     rounding error could open into a seam. */
  function buildChunk(index, side) {
    const isCeil = side === 'ceil';
    const x0 = index * PITCH;
    const pts = [];
    const steps = T.samples;
    const pad = 0.3;
    for (let i = 0; i <= steps; i++) {
      const lx = -pad + (PITCH + pad * 2) * (i / steps);
      pts.push([lx, profileAt(x0 + lx, side)]);
    }
    const g = ribbonStack(pts, {
      bands: T.layers, bandWidth: T.bandWidth, rampName: ramp,
      t0: P.t0, t1: P.t1, direction: -1, dz: 0.06,
    });
    // Band 0 is the face the player can crash into: the brightest line on it.
    if (g.userData.pieces.length) {
      g.userData.pieces[0].userData.fill.material.color.set(
        P.topColor === null || P.topColor === undefined ? RIM : P.topColor);
    }

    const wrap = new THREE.Group();
    /* A ceiling is the same chunk turned over. Flipping the group would flip
       its shadows with it and the light would come from the wrong side, so
       each shadow's own y offset is negated to cancel the mirror. */
    if (isCeil) {
      wrap.scale.y = -1;
      for (const piece of g.userData.pieces) {
        for (const sh of piece.userData.shadows) sh.position.y = -sh.position.y;
      }
    }
    wrap.add(mergeStack(g));
    return wrap;
  }

  function buildAll() {
    for (const list of [floor, ceil]) {
      for (const c of list) disposeObject(c.wrap);
      list.length = 0;
    }
    for (let i = 0; i < T.slabs; i++) {
      for (const side of ['floor', 'ceil']) {
        const wrap = buildChunk(i, side);
        const chunk = { wrap, x: i * PITCH, home: i * PITCH, side };
        wrap.position.set(chunk.x, baseOf(side), 0);
        group.add(wrap);
        (side === 'ceil' ? ceil : floor).push(chunk);
      }
    }
  }

  /* A stage's walls are baked into vertices, so changing stage means cutting
     new ones. It costs about as much as booting does and it happens once, with
     the stage-clear card on screen. */
  function rebuild(stageCfg, rampName2, pinchScale) {
    P = Object.assign({}, T, (stageCfg && stageCfg.terrain) || {});
    if (pinchScale !== undefined) P.pinch *= pinchScale;
    if (rampName2) ramp = rampName2;
    open = 0; openTarget = 0;
    buildAll();
    obKind = P.obstacle || null;
    if (obKind && !obstacles.length) for (let i = 0; i < OB_POOL; i++) obstacles.push(buildObstacle());
    releaseObstacles();
  }

  /* How far the walls have drawn back. A boss is forty units across and a
     pinched canyon is thirty-five, so the stage opens up to let it in — and
     because it is an offset on the base rather than on the profile, the
     collision line moves with the drawn wall for free. */
  let open = 0, openTarget = 0;
  function baseOf(side) {
    return side === 'ceil' ? P.ceilBase + open : P.floorBase - open;
  }
  function setOpen(v) { openTarget = v || 0; }

  /* The surface in world units. `shift` is how far the whole conveyor has
     scrolled: geometry built for world x is showing at x - shift, so the
     profile is read at x + shift. It is the same number the chunks moved by,
     which is what keeps the collision line under the drawn surface exactly. */
  let shift = 0;

  const terrain = {
    group,
    profileAt,
    floorAt: (x) => P.floorBase - open + profileAt(x + shift, 'floor'),
    ceilAt: (x) => P.ceilBase + open - profileAt(x + shift, 'ceil'),
    hits, update, reset, dispose, rebuild, setOpen, hitsObstacle,
    obstacles,
    gapAt: (x) => (P.ceilBase + open - profileAt(x + shift, 'ceil'))
      - (P.floorBase - open + profileAt(x + shift, 'floor')),
    openNow: () => open,
    /* The invariant this file lives or dies by, exposed so it can be checked
       from outside: every chunk must satisfy x === home - shift (mod LOOP).
       If that slips, the drawn surface and the collision line are different
       lines and the seam is back. */
    chunks: { floor, ceil },
    shiftNow: () => shift,
  };

  /* True when a circle at (x,y) is inside either wall. */
  function hits(x, y, r) {
    if (!T.lethal) return false;
    const rr = r - T.graceRadius;
    return (y - rr) <= terrain.floorAt(x) || (y + rr) >= terrain.ceilAt(x);
  }

  function update(dt, scrollSpeed, layout) {
    if (open !== openTarget) {
      const k = 1 - Math.exp(-T.openLerp * dt);
      open += (openTarget - open) * k;
      if (Math.abs(openTarget - open) < 0.02) open = openTarget;
      for (const list of [floor, ceil]) {
        for (let i = 0; i < list.length; i++) list[i].wrap.position.y = baseOf(list[i].side);
      }
    }
    updateObstacles(dt, scrollSpeed, layout);
    const dx = scrollSpeed * dt;
    shift += dx;
    if (shift > LOOP) shift -= LOOP;          // keep the argument small and exact
    const limit = -layout.halfW - T.slabWidth;
    for (const list of [floor, ceil]) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        c.x -= dx;
        // Recycling by exactly LOOP is invisible because the profile repeats
        // with exactly LOOP. Any other step would tear the surface open.
        if (c.x < limit) c.x += LOOP;
        c.wrap.position.x = c.x;
      }
    }
  }

  /* Lay the conveyor out from off the left edge, so the canyon is already
     under the ship on frame one instead of arriving a second later.
   *
     THE INVARIANT: a chunk built for home span [home, home+PITCH] draws
     profileAt(home + lx), and collision reads profileAt(worldX + shift). For
     the drawn surface and the collision line to be the same line, every chunk
     must satisfy  x === home - shift  (mod LOOP). Reset puts shift back to
     zero, so here that is simply x === home (mod LOOP) — and the only move
     allowed on x, ever, is a whole number of LOOPs. */
  function reset(layout) {
    shift = 0;
    releaseObstacles();
    const start = layout ? -layout.halfW - T.slabWidth * 0.5 : -T.slabWidth;
    for (const list of [floor, ceil]) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        let x = c.home;
        while (x >= start + LOOP) x -= LOOP;
        while (x < start) x += LOOP;
        c.x = x;
        c.wrap.position.x = x;
      }
    }
  }

  function dispose() {
    for (const o of obstacles) disposeObject(o.g);
    obstacles.length = 0;
    for (const list of [floor, ceil]) for (const c of list) disposeObject(c.wrap);
    if (group.parent) group.parent.remove(group);
  }

  rebuild(stage, rampName);
  reset(null);
  return terrain;
}
