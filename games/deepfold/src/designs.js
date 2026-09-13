/* designs.js — the cast, cut out of the kit's shapes.
 *
 * Nothing here knows about gameplay: every function returns a THREE.Group and
 * a few named handles in userData (flame, eye, tentacles) for whatever wants to
 * animate them. Gameplay code positions and drives these; the art lives here so
 * a change to how the ship looks is one file and one diff.
 *
 * Ships face +x. Enemies face -x, which is done by rotating the group rather
 * than mirroring every shape, so the shadow keeps falling down-right.
 *
 * EVERY actor here carries a rim: one near-white sheet cut RIM_WIDTH larger
 * than its silhouette and laid underneath. The backdrop is a dense field of
 * contours in the same hues, and without that bright edge a seven-unit enemy
 * is something the player hunts for rather than reacts to. It is also still
 * honest to the style — it is just the bottom sheet of card showing.
 */
import * as THREE from 'three';
import {
  blobShape, wedgeShape, roundRectShape, ringShape, spikedShape, teardropShape,
  arcBandShape, ribbonShape, ribbonStack, polyShape, contourStack, paperSprite, paperPiece,
  dartShape, outsetShape, mergeStack, mergeShadows, rotateKeepingLight, mulberry32,
} from './paper.js';
import { ramp, GOLD, RIM, RIM_WIDTH } from './palette.js';

const C = (name, t) => ramp(name, t);

/* ------------------------------------------------------------------- ship */

/* The player: a clean arrowhead dart, nose at +X, about nine world units
 * nose-to-tail — a small ship in a hundred-unit-tall play field, which is what
 * a shmup wants.
 *
 * Three hull plates, each cut to a smaller share of the same dart, so the
 * bands step up the centre line of the fuselage and follow the swept edges all
 * the way to the wingtips. A contourStack would be the obvious move here and
 * is the wrong one: insetting a shape this sharp takes the same distance off
 * the fat centre and the thin wingtips, so the bands crowd into the middle and
 * the wings go solid. Scaling the whole dart keeps the band width proportional
 * everywhere.
 *
 * Canopy well forward, near the nose. Two flames off the tail rather than one,
 * because a single centred flame on a delta reads as a rudder.
 */
export function playerShip({ rampName = 'STAGE1', len = 9 } = {}) {
  const g = new THREE.Group();
  const plate = (k) => dartShape({
    len: len * k, span: len * 0.86 * k, tail: len * 0.30 * k, sweep: 0.92, belly: 0.40,
  });

  /* Flames first, behind everything, so the tail edge cuts across their front
     and they read as coming out of the ship rather than being stuck on it. */
  const flames = new THREE.Group();
  for (const sy of [1, -1]) {
    const f = contourStack(teardropShape({ len: len * 0.42, width: len * 0.15, bulge: 0.34 }), {
      layers: 3, insetStep: len * 0.026, rampName, t0: 0.70, t1: 0.99, dz: 0.04, shadow: false,
    });
    f.rotation.z = Math.PI / 2;
    // Deliberately overlapping the tail cut: a flame with air between it and
    // the hull reads as a second object, not as thrust.
    f.position.set(-len * 0.56, sy * len * 0.085, 0);
    flames.add(f);
  }
  flames.position.z = -0.5;
  g.add(flames);

  /* Four plates rather than three, stepping the full width of the ramp from
     indigo at the hull edge to bright cyan up the centreline. The player's eye
     must never lose this object, so it is deliberately the brightest thing on
     screen and the only one that reaches the top of the ramp. */
  const hull = paperSprite([
    { name: 'rim',       shape: outsetShape(plate(1.00), RIM_WIDTH), color: RIM, dz: 0 },
    { name: 'underhull', shape: plate(1.00), color: C(rampName, 0.70), dz: 0.3 },
    { name: 'midhull',   shape: plate(0.83), color: C(rampName, 0.50), dz: 0.6, offset: [len * 0.015, 0] },
    { name: 'coreplate', shape: plate(0.64), color: C(rampName, 0.29), dz: 0.9, offset: [len * 0.030, 0] },
    { name: 'topplate',  shape: plate(0.44), color: C(rampName, 0.03), dz: 1.2, offset: [len * 0.045, 0] },
  ], { z: 0 });
  g.add(hull);

  g.add(paperSprite([
    { name: 'canopy', shape: blobShape({ radius: len * 0.125, points: 9, wobble: 0.10, seed: 12, aspect: 1.25 }), color: C(rampName, 0.82), dz: 0, offset: [len * 0.08, 0] },
    { name: 'canopyLit', shape: blobShape({ radius: len * 0.062, points: 8, wobble: 0.10, seed: 19, aspect: 1.3 }), color: C(rampName, 0.97), dz: 0.2, offset: [len * 0.10, len * 0.02] },
    { name: 'noseflash', shape: teardropShape({ len: len * 0.22, width: len * 0.095, bulge: 0.6 }), color: RIM, dz: 0.4, offset: [len * 0.29, 0], rotation: -Math.PI / 2 },
  ], { z: 1.6 }));

  g.userData.hull = hull;
  g.userData.flame = flames;
  g.userData.len = len;
  g.userData.rigid = true;   // the flames scale, but they carry no shadows
  return g;
}

/* The Force pod — the reference image's ring cluster, made spherical. Pink on
   the outside stepping all the way to cyan at the core. */
export function forcePod({ rampName = 'STAGE1', radius = 9 } = {}) {
  const g = contourStack(blobShape({ radius, points: 14, wobble: 0.1, seed: 77 }), {
    layers: 7, insetStep: radius * 0.13, rampName, t0: 0.88, t1: 0.02, dz: 0.07, rim: RIM_WIDTH,
  });
  const core = paperPiece(blobShape({ radius: radius * 0.16, points: 9, wobble: 0.1, seed: 4 }), C(rampName, 0.0), { z: 0.7, shadow: false });
  g.add(core);
  g.userData.core = core;
  g.userData.rigid = true;
  return g;
}

/* ---------------------------------------------------------------- enemies */

/* Six enemies, six silhouettes. All of them six to ten world units, so they
 * sit alongside the player's nine rather than dwarfing it, and every one gets
 * three to five visible bands. The test each has to pass is that you can tell
 * which is which from the outline alone, at speed, at this size.
 */

/* 1. Popcorn drone — ROUND. The cannon fodder, so it has to be the one you
      never mistake for anything dangerous. Every add-on overlaps the body: at
      this size a piece with clear air around it stops reading as one object. */
export function popcornDrone({ rampName = 'STAGE1', radius = 3.6, seed = 3 } = {}) {
  const g = new THREE.Group();
  g.add(paperPiece(roundRectShape(radius * 0.8, radius * 0.62, radius * 0.28), C(rampName, 0.88), { z: -0.3 })
    .translateX(radius * 0.78));
  g.add(contourStack(blobShape({ radius, points: 10, wobble: 0.16, seed }), {
    layers: 4, insetStep: radius * 0.20, rampName, t0: 0.66, t1: 0.10, dz: 0.07, rim: RIM_WIDTH,
  }));
  const eye = paperPiece(blobShape({ radius: radius * 0.28, points: 8, wobble: 0.08, seed: seed + 9 }), C(rampName, 0.99), { z: 0.9 });
  eye.position.x = -radius * 0.16;
  g.add(eye);
  g.userData.eye = eye;
  g.userData.rigid = true;
  return g;
}

/* 2. Chain worm — A LINE OF IDENTICAL BEADS. Identical is the silhouette:
      a tapering string reads as one creature, a string of equal beads reads as
      a chain, and the chain is the thing the player has to learn to shoot the
      head of. Gameplay drives one link per bead; this is the whole worm. */
export function chainWorm({ rampName = 'STAGE1', beads = 5, radius = 2.6, spread = 5.4, seed = 21 } = {}) {
  const g = new THREE.Group();
  const links = [];
  for (let i = 0; i < beads; i++) {
    const b = contourStack(blobShape({ radius, points: 10, wobble: 0.12, seed: seed + i * 13 }), {
      layers: 3, insetStep: radius * 0.26, rampName, t0: 0.74, t1: 0.16, dz: 0.06, rim: RIM_WIDTH,
    });
    b.position.set(-i * spread, 0, -i * 0.2);
    g.add(b);
    links.push(b);
  }
  g.userData.links = links;
  g.userData.rigid = false;
  return g;
}

/* 3. Spiked mine — SPIKED. The inset eats a spiked outline far faster than a
      round one (the valleys between spikes are the narrowest part and close
      first), so the step is about half what a blob this size would take. */
export function spikeMine({ rampName = 'STAGE1', radius = 4.2, seed = 33 } = {}) {
  /* Two bands of the spiked outline and then a round core, rather than three
     bands of spikes: a third inset of a spiked shape collapses into a rounded
     square, and a square inside a star reads as a bug, not as a mine. */
  const g = contourStack(spikedShape({ radius, spikes: 8, depth: 0.30, sharp: 1.0, seed }), {
    layers: 2, insetStep: radius * 0.17, rampName, t0: 0.58, t1: 0.30, dz: 0.07, rim: RIM_WIDTH,
  });
  g.add(paperPiece(blobShape({ radius: radius * 0.52, points: 11, wobble: 0.08, seed: seed + 5 }), C(rampName, 0.06), { z: 0.35 }));
  const eye = paperPiece(blobShape({ radius: radius * 0.22, points: 8, wobble: 0.1, seed: seed + 1 }), GOLD, { z: 0.6 });
  g.add(eye);
  g.userData.eye = eye;
  g.userData.rigid = true;
  return g;
}

/* 4. Heavy gunship — ANGULAR AND HEAVY. A blunt dart flown backwards, wide in
      the beam, with a squared-off barrel out of the nose and a shoulder plate
      breaking the outline so it never reads as a second player ship. */
export function gunship({ rampName = 'STAGE1', len = 9 } = {}) {
  const g = new THREE.Group();
  /* Deliberately NOT a dart. The player is the only arrowhead on screen; a
     gunship built from the same shape reads as a second player ship coming the
     other way. This is a slab with a nose bolted on — blunt, square, heavy. */
  const plate = (k) => roundRectShape(len * 0.86 * k, len * 0.60 * k, len * 0.10 * k);
  const body = paperSprite([
    { shape: outsetShape(plate(1.00), RIM_WIDTH), color: RIM, dz: -0.2 },
    { shape: plate(1.00), color: C(rampName, 0.62), dz: 0 },
    { shape: plate(0.70), color: C(rampName, 0.34), dz: 0.4, offset: [-len * 0.03, 0] },
    { shape: plate(0.42), color: C(rampName, 0.12), dz: 0.8, offset: [-len * 0.05, 0] },
  ]);
  rotateKeepingLight(body, Math.PI);               // nose to -x, light unmoved
  g.add(body);
  g.add(paperSprite([
    { shape: dartShape({ len: len * 0.64, span: len * 0.50, tail: len * 0.34, sweep: 0.9 }), color: C(rampName, 0.44), dz: -0.3, offset: [-len * 0.66, 0], rotation: Math.PI },
    { shape: roundRectShape(len * 0.60, len * 0.20, len * 0.07), color: C(rampName, 0.76), dz: 0.3, offset: [len * 0.10, len * 0.40], rotation: -0.16 },
    { name: 'canopy', shape: blobShape({ radius: len * 0.13, points: 9, wobble: 0.12, seed: 51 }), color: C(rampName, 0.92), dz: 0.6, offset: [-len * 0.10, 0] },
  ], { z: 0.9 }));
  g.userData.rigid = true;
  return g;
}

/* 5. Jellyfish drifter — DOMED BELL, LONG TRAILING RIBBONS. The tentacles are
      most of the silhouette, so they run well past the bell; each is its own
      shape and can be rebuilt per frame if the gameplay wants them to swim. */
export function jellyDrifter({ rampName = 'STAGE1', size = 7.5, seed = 61 } = {}) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const tents = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * size * 0.15;
    const lean = (rnd() - 0.5) * size * 0.34;
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      pts.push([x + Math.sin(t * 3.4 + i) * lean, -size * 0.16 - t * size * 1.25]);
    }
    tents.add(paperPiece(ribbonShape(pts, (t) => size * 0.085 * (1 - t * 0.8)),
      C(rampName, 0.88 - i * 0.04), { z: -0.2 - i * 0.02 }));
  }
  g.add(tents);
  const bell = contourStack(blobShape({ radius: size * 0.5, points: 12, wobble: 0.08, seed: seed + 3, aspect: 1.05, squash: 0.42 }), {
    layers: 5, insetStep: size * 0.055, rampName, t0: 0.40, t1: 0.97, dz: 0.07, rim: RIM_WIDTH,
  });
  bell.position.y = size * 0.10;
  g.add(bell);
  g.userData.bell = bell;
  g.userData.tentacles = tents;
  g.userData.rigid = false;
  return g;
}

/* 6. Wall turret — SQUAT AND CLAMPED. Wider than it is tall, sitting on a slab
      that reads as the bracket bolting it to the terrain. The dome is drawn
      over the barrel's root at every angle it can aim through, so the barrel
      always looks mounted rather than laid down beside it. */
export function wallTurret({ rampName = 'STAGE1', size = 8, aim = 0.22 } = {}) {
  const g = new THREE.Group();
  const base = roundRectShape(size * 0.96, size * 0.30, size * 0.07);
  g.add(paperPiece(outsetShape(base, RIM_WIDTH), RIM, { z: -0.2 }));
  g.add(paperPiece(base, C(rampName, 0.46), { z: 0 }));
  const gun = paperSprite([
    { shape: roundRectShape(size * 0.46, size * 0.14, size * 0.05), color: C(rampName, 0.16), dz: 0, offset: [size * 0.26, 0] },
    { shape: roundRectShape(size * 0.11, size * 0.21, size * 0.05), color: C(rampName, 0.90), dz: 0.2, offset: [size * 0.46, 0] },
  ], { z: 1.4 });
  rotateKeepingLight(gun, aim);
  gun.position.y = size * 0.16;
  g.add(gun);
  const dome = contourStack(blobShape({ radius: size * 0.44, points: 10, wobble: 0.10, seed: 88, squash: 0.55 }), {
    layers: 4, insetStep: size * 0.070, rampName, t0: 0.28, t1: 0.92, z: 0.4, dz: 0.08, rim: RIM_WIDTH,
  });
  dome.position.y = size * 0.08;
  g.add(dome);
  g.userData.gun = gun;
  g.userData.dome = dome;
  g.userData.rigid = false;
  return g;
}

/* ------------------------------------------------- the deeper water ------
 *
 * Seven more, for stages three through seven. Same contract as the six above:
 * six to ten world units, three to five visible bands, a rim, curves not
 * facets, and a silhouette you can name at a glance in motion.
 *
 * Each carries `userData.rigid`. True means the whole actor can go through
 * mergeShadows in one call; false means it articulates and the caller has to
 * merge the rigid sub-assemblies separately, or a moving part slides out from
 * under its own shadow. The named handles below are the parts that move.
 */

/* 7. Urchin — SPIKED BALL, clamped to the terrain. Radially symmetric, so it
      needs no special handling to sit on a ceiling: turned upside down it is
      the same shape. Two bands of spines and then a round core, because a
      third inset of a spiked outline collapses into a rounded square. */
export function urchin({ rampName = 'STAGE1', radius = 3.6, seed = 71 } = {}) {
  const g = contourStack(spikedShape({ radius, spikes: 14, depth: 0.38, sharp: 1.0, seed }), {
    layers: 2, insetStep: radius * 0.13, rampName, t0: 0.62, t1: 0.34, dz: 0.07, rim: RIM_WIDTH,
  });
  g.add(paperPiece(blobShape({ radius: radius * 0.52, points: 11, wobble: 0.10, seed: seed + 4 }), C(rampName, 0.08), { z: 0.35 }));
  const eye = paperPiece(blobShape({ radius: radius * 0.20, points: 9, wobble: 0.10, seed: seed + 6 }), GOLD, { z: 0.6 });
  g.add(eye);
  g.userData.eye = eye;
  g.userData.rigid = true;
  return g;
}

/* 8. Angler — a dark bulk with one bright lure hanging in front of it.
 *
 * The body sits in the middle of the ramp where nothing is bright, so at rest
 * it is almost the same value as the water and you track the lure instead. It
 * still carries a rim: the rim is the fairness contract, not decoration — a
 * thing that can kill you has to be findable once you know to look. The lure
 * is the only part that reaches the ramp's hot end.
 */
export function angler({ rampName = 'STAGE1', size = 6.5, seed = 83 } = {}) {
  const g = new THREE.Group();
  const body = contourStack(blobShape({ radius: size * 0.5, points: 7, wobble: 0.34, seed, aspect: 1.25 }), {
    layers: 4, insetStep: size * 0.055, rampName, t0: 0.52, t1: 0.30, dz: 0.07, rim: RIM_WIDTH,
  });
  g.add(body);
  // Jaw: a spiked crescent under the front of the bulk.
  const jaw = paperPiece(spikedShape({ radius: size * 0.26, spikes: 7, depth: 0.5, sharp: 1.0, seed: seed + 2 }),
    C(rampName, 0.40), { z: 0.5 });
  jaw.position.set(-size * 0.34, -size * 0.16, 0);
  g.add(jaw);

  const lure = new THREE.Group();
  lure.add(paperPiece(ribbonShape([[0, 0], [-size * 0.22, size * 0.30], [-size * 0.52, size * 0.34]],
    (t) => size * 0.05 * (1 - t * 0.5)), C(rampName, 0.46), { z: 0 }));
  const bulb = contourStack(blobShape({ radius: size * 0.13, points: 9, wobble: 0.14, seed: seed + 8 }), {
    layers: 3, insetStep: size * 0.030, rampName, t0: 0.60, t1: 0.00, dz: 0.05, shadow: false,
  });
  bulb.position.set(-size * 0.52, size * 0.34, 0.3);
  lure.add(bulb);
  lure.position.set(-size * 0.10, size * 0.18, 1.2);
  g.add(lure);

  g.userData.body = body;
  g.userData.lure = lure;
  g.userData.bulb = bulb;
  g.userData.rigid = false;          // the lure swings
  return g;
}

/* 9. Puffer — a round body that inflates. Everything that grows lives under
      `userData.body`, so the gameplay side scales that one group. The spines
      are part of the same outline rather than pieces laid on top, which is
      what keeps them readable deflated as well as inflated: they shrink with
      the body instead of vanishing into it. */
export function puffer({ rampName = 'STAGE1', radius = 3.6, seed = 97 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(contourStack(spikedShape({ radius, spikes: 11, depth: 0.30, sharp: 1.0, seed }), {
    layers: 3, insetStep: radius * 0.13, rampName, t0: 0.66, t1: 0.16, dz: 0.07, rim: RIM_WIDTH,
  }));
  body.add(paperPiece(blobShape({ radius: radius * 0.46, points: 10, wobble: 0.12, seed: seed + 3 }), C(rampName, 0.06), { z: 0.4 }));
  g.add(body);
  const eye = paperPiece(blobShape({ radius: radius * 0.19, points: 8, wobble: 0.1, seed: seed + 5 }), C(rampName, 0.98), { z: 0.9 });
  eye.position.set(-radius * 0.34, radius * 0.16, 0);
  g.add(eye);
  g.userData.body = body;
  g.userData.eye = eye;
  g.userData.rigid = false;          // the body inflates
  return g;
}

/* 10. Ray — a wide flat manta. The wings are their own groups pivoting on the
       body's centre line, so the gameplay side flaps them with rotation.z and
       the silhouette opens and closes the way a ray's does. */
export function ray({ rampName = 'STAGE1', size = 5.2, seed = 103 } = {}) {
  const g = new THREE.Group();

  const wing = (sy, seedOff) => {
    const w = new THREE.Group();
    const shape = blobShape({ radius: size * 0.34, points: 7, wobble: 0.24, seed: seed + seedOff, aspect: 2.5, squash: 0.25 });
    const stack = contourStack(shape, {
      layers: 4, insetStep: size * 0.030, rampName, t0: 0.60, t1: 0.22, dz: 0.06, rim: RIM_WIDTH,
    });
    stack.position.set(-size * 0.02, sy * size * 0.30, 0);
    w.add(stack);
    return w;
  };
  const wingL = wing(1, 11);
  const wingR = wing(-1, 29);
  g.add(wingL, wingR);

  g.add(paperSprite([
    { shape: outsetShape(teardropShape({ len: size * 0.78, width: size * 0.26, bulge: 0.55 }), RIM_WIDTH), color: RIM, dz: 0 },
    { shape: teardropShape({ len: size * 0.78, width: size * 0.26, bulge: 0.55 }), color: C(rampName, 0.44), dz: 0.3, rotation: -Math.PI / 2 },
    { shape: blobShape({ radius: size * 0.09, points: 9, wobble: 0.12, seed: seed + 7 }), color: C(rampName, 0.95), dz: 0.6, offset: [-size * 0.22, 0] },
  ], { z: 0.9 }));
  // The rim piece needs the same turn as the hull it is under.
  rotateKeepingLight(g.children[g.children.length - 1].children[0], -Math.PI / 2);

  g.add(paperPiece(ribbonShape([[size * 0.36, 0], [size * 0.72, size * 0.05], [size * 1.02, -size * 0.02]],
    (t) => size * 0.055 * (1 - t * 0.8)), C(rampName, 0.36), { z: 0.2 }));

  g.userData.wingL = wingL;
  g.userData.wingR = wingR;
  g.userData.rigid = false;          // the wings flap
  return g;
}

/* 11. Baitball — many tiny identical fish moving as one cloud, and able to
       scatter. `userData.fish` is the flock; the gameplay side moves each one.
       Two pieces per fish and no more: a rim and one band. A third band is
       invisible at this size and twenty of them is a draw-call problem — and
       the fish have to stay big enough that the rim reads as an edge on them
       rather than as the whole fish. */
export function baitball({ rampName = 'STAGE1', size = 6.2, count = 13, seed = 109 } = {}) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const fish = [];
  for (let i = 0; i < count; i++) {
    const r = size * (0.125 + rnd() * 0.055);
    const f = contourStack(blobShape({ radius: r, points: 7, wobble: 0.30, seed: seed + i * 17, aspect: 1.7 }), {
      layers: 1, insetStep: r * 0.3, rampName, t0: 0.30 + rnd() * 0.3, t1: 0.3, dz: 0.05, rim: RIM_WIDTH,
    });
    const a = rnd() * Math.PI * 2, rad = size * 0.62 * Math.sqrt(rnd());
    f.position.set(Math.cos(a) * rad * 1.35, Math.sin(a) * rad, i * 0.02);
    rotateKeepingLight(f, (rnd() - 0.5) * 0.6);
    g.add(f);
    fish.push(f);
  }
  g.userData.fish = fish;
  g.userData.rigid = false;          // they scatter
  return g;
}

/* 12. Crab — squat, and it walks on the floor or the ceiling. `ceiling` turns
       it over and negates each shadow's own y offset to cancel the mirror, so
       the light still comes from the same place either way up. */
export function crab({ rampName = 'STAGE1', size = 6, seed = 127, ceiling = false } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();

  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1;
    const k = i % 3;
    const leg = paperPiece(ribbonShape([
      [sx * size * (0.16 + k * 0.10), 0],
      [sx * size * (0.30 + k * 0.13), -size * 0.16],
      [sx * size * (0.36 + k * 0.15), -size * 0.34],
    ], (t) => size * 0.055 * (1 - t * 0.45)), C(rampName, 0.52), { z: -0.3 });
    inner.add(leg);
  }

  const shell = contourStack(blobShape({ radius: size * 0.40, points: 8, wobble: 0.22, seed, aspect: 1.6, squash: 0.35 }), {
    layers: 4, insetStep: size * 0.042, rampName, t0: 0.64, t1: 0.18, dz: 0.07, rim: RIM_WIDTH,
  });
  inner.add(shell);

  const claw = new THREE.Group();
  claw.add(contourStack(blobShape({ radius: size * 0.17, points: 8, wobble: 0.28, seed: seed + 9, aspect: 1.35 }), {
    layers: 3, insetStep: size * 0.032, rampName, t0: 0.58, t1: 0.12, dz: 0.06, rim: RIM_WIDTH,
  }));
  claw.position.set(-size * 0.52, size * 0.02, 0.6);
  inner.add(claw);

  for (const sx of [-1, 1]) {
    const eye = paperPiece(blobShape({ radius: size * 0.075, points: 8, wobble: 0.1, seed: seed + 13 }), GOLD, { z: 1.0 });
    eye.position.set(sx * size * 0.13, size * 0.17, 0);
    inner.add(eye);
  }

  g.add(inner);
  if (ceiling) {
    inner.scale.y = -1;
    inner.traverse((o) => {
      if (!o.userData || !o.userData.shadows) return;
      for (const sh of o.userData.shadows) sh.position.y = -sh.position.y;
    });
  }
  g.userData.claw = claw;
  g.userData.shell = shell;
  g.userData.rigid = false;          // the claw snaps
  return g;
}

/* 13. Eel — the chain worm's faster cousin: more beads, tighter spacing,
       thinner. Same handle, so anything driving a chain drives this too. */
export function eel({ rampName = 'STAGE1', beads = 10, radius = 1.9, spread = 3.1, seed = 131 } = {}) {
  const g = new THREE.Group();
  const links = [];
  for (let i = 0; i < beads; i++) {
    const taper = 1 - (i / beads) * 0.35;
    const b = contourStack(blobShape({ radius: radius * taper, points: 8, wobble: 0.16, seed: seed + i * 13, aspect: 1.2 }), {
      layers: 2, insetStep: radius * 0.28, rampName, t0: 0.66, t1: 0.20, dz: 0.06, rim: RIM_WIDTH,
    });
    b.position.set(-i * spread, 0, -i * 0.2);
    g.add(b);
    links.push(b);
  }
  const eye = paperPiece(blobShape({ radius: radius * 0.34, points: 8, wobble: 0.1, seed: seed + 3 }), GOLD, { z: 0.9 });
  eye.position.set(radius * 0.3, radius * 0.35, 0);
  links[0].add(eye);
  g.userData.links = links;
  g.userData.eye = eye;
  g.userData.rigid = false;          // it undulates
  return g;
}

/* ------------------------------------------------------------------- boss */

/* Big, slow and obviously layered — nine contours in the body alone — with a
   gold weak point that the gameplay can pulse. The crown and shoulder bands
   exist to break the silhouette so it doesn't read as "large popcorn drone". */
export function bossHulk({ rampName = 'STAGE1', radius = 20, seed = 101 } = {}) {
  const g = new THREE.Group();

  const crown = contourStack(spikedShape({ radius: radius * 1.05, spikes: 13, depth: 0.30, sharp: 0.4, seed: seed + 5 }), {
    layers: 3, insetStep: radius * 0.10, rampName, t0: 0.50, t1: 0.72, z: -0.6, dz: 0.06,
  });
  g.add(crown);

  const body = contourStack(blobShape({ radius, points: 8, wobble: 0.38, seed, aspect: 1.12 }), {
    layers: 9, insetStep: radius * 0.085, rampName, t0: 0.62, t1: 0.98, dz: 0.07, rim: RIM_WIDTH,
  });
  g.add(body);

  g.add(paperSprite([
    { shape: arcBandShape({ r: radius * 0.82, thickness: radius * 0.16, a0: 0.75, a1: 2.4, taper: 0.6 }), color: C(rampName, 0.36), dz: 0 },
    { shape: arcBandShape({ r: radius * 0.82, thickness: radius * 0.16, a0: -2.4, a1: -0.75, taper: 0.6 }), color: C(rampName, 0.36), dz: 0.1 },
    { shape: wedgeShape({ len: radius * 0.95, tail: radius * 0.26, nose: radius * 0.08, sweep: 0.35 }), color: C(rampName, 0.20), dz: 0.3, offset: [-radius * 0.78, 0], rotation: Math.PI },
  ], { z: 0.75 }));

  // Weak point. Concentric again, but jumping off the stage ramp into gold so
  // it cannot be mistaken for another hull plate.
  const eye = new THREE.Group();
  eye.add(contourStack(blobShape({ radius: radius * 0.30, points: 12, wobble: 0.08, seed: seed + 9 }), {
    layers: 4, insetStep: radius * 0.055, rampName, t0: 0.86, t1: 1.0, dz: 0.06,
  }));
  eye.add(paperPiece(blobShape({ radius: radius * 0.15, points: 10, wobble: 0.06, seed: seed + 11 }), GOLD, { z: 0.35, shadow: false }));
  eye.add(paperPiece(ringShape(blobShape({ radius: radius * 0.22, points: 12, wobble: 0.05, seed: seed + 13 }), radius * 0.035), GOLD, { z: 0.3, shadow: false, opacity: 0.75 }));
  eye.position.set(-radius * 0.06, 0, 1.2);
  g.add(eye);

  g.userData.eye = eye;
  g.userData.body = body;
  g.userData.crown = crown;
  g.userData.rigid = false;
  return g;
}

/* ------------------------------------------------------- merging actors ---

/* Collapse an actor's shadows correctly, whatever it is.
 *
 * mergeShadows on a whole actor is only safe when nothing inside it moves —
 * otherwise a part slides out from under its own shadow. Every design in this
 * file declares `userData.rigid` and names its moving parts, so this can do
 * the right thing without the caller having to remember which is which: the
 * moving sub-assemblies are merged on their own, and then the root merge picks
 * up whatever is left, which is the rigid remainder.
 *
 * Call it once, after the actor is built and after any scaling.
 */
const MOVING_HANDLES = ['lure', 'body', 'wingL', 'wingR', 'claw', 'gun', 'tentacles', 'crown', 'eye'];

export function mergeActorShadows(actor) {
  if (!actor || !actor.userData) return actor;
  if (actor.userData.rigid) return mergeShadows(actor);
  for (const key of MOVING_HANDLES) {
    const part = actor.userData[key];
    if (part && part.isObject3D) mergeShadows(part);
  }
  for (const key of ['fish', 'links']) {
    const list = actor.userData[key];
    if (Array.isArray(list)) for (const part of list) mergeShadows(part);
  }
  mergeShadows(actor);
  return actor;
}

/* ---------------------------------------------------------------- terrain */

/* A slab of canyon wall or ceiling: a seeded surface profile with bands of
 * card stacked underneath it.
 *
 * This used to be a contourStack of a closed slab polygon, and it was wrong.
 * Insetting a shape ninety units wide and twenty tall takes the same distance
 * off every side, so what you get is a thin outline round a huge flat core —
 * a pencil line, not strata. Terrain wants bands PARALLEL to the surface, all
 * the way along, which is a ribbonStack: the profile, then five or six sheets
 * of card laid under it, each one the same width everywhere.
 *
 * Band 0 is the top sheet — the face you skim along — and it is painted the
 * same near-white the actors' rims use, so the surface the player can crash
 * into is the brightest line in the lower half of the screen. The bands under
 * it run COOL, cyan down into indigo: an earlier version ran pale pink into
 * magenta and merged straight into the backdrop's violet clusters.
 *
 * The stack runs `layers * bandWidth` deep, which should be enough to run off
 * the edge of the screen from wherever it is placed.
 */
export function terrainSlab({
  rampName = 'STAGE1', width = 90, height = 14, seed = 5, bumps = 7,
  layers = 6, bandWidth = 3.2, ceiling = false, merge = true,
  t0 = 0.06, t1 = 0.52, topColor = RIM,
} = {}) {
  const rnd = mulberry32(seed);
  // Control heights, cosine-interpolated into a dense profile so the surface
  // curves without the polyline showing its corners.
  const ctrl = [];
  for (let i = 0; i <= bumps; i++) ctrl.push(height * (0.25 + rnd() * 0.75) - height * 0.5);
  const pts = [];
  const STEPS = 10;
  for (let i = 0; i < bumps; i++) {
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      const e = (1 - Math.cos(t * Math.PI)) * 0.5;
      pts.push([-width * 0.5 + ((i + t) / bumps) * width, ctrl[i] + (ctrl[i + 1] - ctrl[i]) * e]);
    }
  }
  pts.push([width * 0.5, ctrl[bumps]]);

  const g = ribbonStack(pts, {
    bands: layers, bandWidth, rampName, t0, t1, direction: -1, dz: 0.06,
  });
  if (topColor !== null && g.userData.pieces.length) {
    g.userData.pieces[0].userData.fill.material.color.set(topColor);
  }

  const wrap = new THREE.Group();
  /* A ceiling is the same slab turned over. Flipping the group would flip its
     shadows with it and the light would come from the wrong side, so each
     shadow's own y offset is negated to cancel the mirror — every piece in the
     picture still throws its shadow down-right. */
  if (ceiling) {
    wrap.scale.y = -1;
    for (const piece of g.userData.pieces) {
      for (const sh of piece.userData.shadows) sh.position.y = -sh.position.y;
    }
  }
  // Merge last: it bakes the transforms above into the vertices. Terrain never
  // recolours, so the bands are not worth keeping addressable.
  const slab = merge ? mergeStack(g) : g;
  wrap.add(slab);
  wrap.userData.stack = slab;
  return wrap;
}
