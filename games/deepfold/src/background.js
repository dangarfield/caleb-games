/* background.js — the scrolling collage behind the play field.
 *
 * Four things are happening at once, and they are separate on purpose because
 * they do different jobs in a hundred-second stage:
 *
 *   - SWEEPS: long ribbons of parallel bands following a meander, spanning far
 *     wider than the screen. The constant texture of the world.
 *   - CLUSTERS: nested contour rings crowded into the corners and edges, most
 *     of them large enough to run off two sides of the frame at once. Spaced
 *     unevenly, so the stage alternates between open water and crowded.
 *   - SET PIECES: two or three large, distinct features per stage that scroll
 *     past ONCE and do not recycle — an arch, an island, a vortex, a shoal, a
 *     single vast mass. They are what makes the journey feel like it goes
 *     somewhere rather than looping.
 *   - DRIFT: the whole backdrop is tinted from one colour to another across
 *     the stage, so the end does not look like the beginning.
 *
 * SEAMS. A straight vertical edge cannot appear in a picture made of organic
 * contours, so the three recycling schemes each guarantee it away:
 *
 *   - A sweep is ONE ribbon whose meander is periodic in x with period
 *     `period`. Recycling translates it by exactly one period, which maps the
 *     curve onto itself: nothing moves on screen. It is built wider than the
 *     screen plus two periods, so its own cut ends are never in frame.
 *   - A cluster jumps a whole layer-width at once, and that width is sized
 *     from the cluster's measured extent, so it is always fully off-screen
 *     when it moves. Their spacing within the layer is uneven but FIXED, so
 *     the pattern repeats exactly and cannot open a gap.
 *   - A set piece never recycles at all. It scrolls past and is done.
 *
 * Everything is merged to two draw calls per element, and colour recedes
 * toward the base dark rather than fading, so nothing needs depth sorting.
 */
import * as THREE from 'three';
import {
  blobShape, arcBandShape, roundRectShape, contourStack, ribbonStack,
  mergeStack, rotateKeepingLight, mulberry32, disposeObject,
} from './paper.js';
import { ramp, recede, backdropWindow, backdropDrift, BASE } from './palette.js';

/* Widest viewport the layout is sized against, in world units. The play area
   is 100 tall, so this covers everything up to a 2.6:1 screen. */
const MAX_VIEW = 260;

const SWEEPS = [
  { parallax: 0.05, z: -39, bands: 3, bandWidth: 30, period: 210, y: -70, wash: 0.88, recede: 0.50, t0: 0.12, t1: 0.30,
    harmonics: [[1, 10, 0.0], [2, 4.5, 1.7], [3, 2.0, 4.2]], vary: 0.30 },
  { parallax: 0.10, z: -37, bands: 3, bandWidth: 24, period: 170, y: 8, wash: 0.84, recede: 0.46, t0: 0.18, t1: 0.42,
    harmonics: [[1, 13, 2.1], [2, 5.0, 5.0], [5, 1.8, 0.8]], vary: 0.34 },
  { parallax: 0.22, z: -29, bands: 10, bandWidth: 7.0, period: 145, y: -62, wash: 0.46, recede: 0.36, t0: 0.16, t1: 0.58,
    harmonics: [[1, 17, 1.1], [2, 7.0, 3.9], [3, 2.6, 2.2]], vary: 0.42 },
  { parallax: 0.40, z: -19, bands: 13, bandWidth: 5.5, period: 100, y: 26, wash: 0.26, recede: 0.24, t0: 0.14, t1: 0.68, direction: -1,
    harmonics: [[1, 14, 3.4], [2, 5.5, 0.6], [3, 2.2, 5.5]], vary: 0.46 },
];

const CLUSTERS = [
  { parallax: 0.14, z: -32, radius: 56, wash: 0.55, recede: 0.44, t0: 0.12, t1: 0.42, layers: 7, step: 4.6, spacing: 82, edge: 0.90 },
  { parallax: 0.30, z: -24, radius: 45, wash: 0.36, recede: 0.34, t0: 0.14, t1: 0.54, layers: 8, step: 3.7, spacing: 76, edge: 0.98 },
  { parallax: 0.52, z: -14, radius: 35, wash: 0.18, recede: 0.24, t0: 0.16, t1: 0.64, layers: 9, step: 2.9, spacing: 70, edge: 1.06 },
  { parallax: 0.78, z: -7,  radius: 27, wash: 0.06, recede: 0.15, t0: 0.14, t1: 0.70, layers: 9, step: 2.3, spacing: 62, edge: 1.16 },
];

/* Per-stage character, so the three stages differ in more than palette.
 *
 *   density   multiplies how many clusters a layer carries
 *   clump     0 is an even grid, 1 is hard clumps with open water between
 *   bulk      multiplies cluster radius
 *   strata    multiplies sweep band counts and flattens their meander, which
 *             turns the sweeps from drifting ribbons into layered rock
 *   pieces    the set-piece kinds this stage draws from, in order
 */
/*   form      what the NEAR cluster layers are cut as. The far layers stay
 *             round whatever this says — they are the water itself, and only
 *             the near ones read as objects you are passing.
 */
const MOTIF = {
  // 1. Paper Reef — open water and reef heads. The established mix.
  STAGE1:   { density: 1.00, clump: 0.55, bulk: 1.00, strata: 1.00, flatten: 1.00,
              pieces: ['arch', 'shoal', 'island'] },
  // 2. Coral Cut — the squeeze: long horizontal strata rather than clusters.
  STAGE2:   { density: 0.60, clump: 0.35, bulk: 0.85, strata: 1.55, flatten: 0.45,
              pieces: ['strata', 'arch', 'strata'] },
  // 3. Kelp Forest — vertical everything: columns in the parallax, light
  //    coming down through them, a canopy closing overhead.
  KELP:     { density: 1.10, clump: 0.40, bulk: 1.05, strata: 1.15, flatten: 0.80,
              form: 'column', pieces: ['canopy', 'shaft', 'kelp'] },
  // 4. The Wreck — man-made geometry among the organic. The near layers go
  //    angular, which is the only place in the game straight lines are allowed,
  //    and they are meant to feel wrong against the contours behind them.
  WRECK:    { density: 0.80, clump: 0.65, bulk: 0.95, strata: 1.10, flatten: 0.70,
              form: 'plate', pieces: ['hull', 'ribs', 'plates'] },
  // 5. Midnight Drift — vast dim forms far off, drifting particulate close to.
  //    Sparse and large: this is where the descent gets lonely.
  MIDNIGHT: { density: 0.50, clump: 0.90, bulk: 1.60, strata: 0.70, flatten: 1.30,
              form: 'mote', pieces: ['glow', 'monolith', 'glow'] },
  // 6. Violet Deep — sparser, larger, more space between things.
  STAGE3:   { density: 0.45, clump: 0.80, bulk: 1.45, strata: 0.85, flatten: 1.25,
              pieces: ['vortex', 'monolith', 'vortex'] },
  // 7. The Trench — walls close overhead and underfoot, vents from below.
  TRENCH:   { density: 0.55, clump: 0.70, bulk: 1.55, strata: 0.90, flatten: 1.10,
              form: 'column', pieces: ['vent', 'walls', 'vent'] },
};

const DEFAULT_MOTIF = MOTIF.STAGE1;

const SCRIM_Z = -4;
const SCRIM_OPACITY = 0.16;
const SAMPLES_PER_PERIOD = 22;

/* Set pieces ride here: near enough to read as part of the world, far enough
   that the play plane still wins. */
const PIECE_PARALLAX = 0.46;
const PIECE_Z = -17;

export function createBackdrop(scene, {
  rampName = 'STAGE1', seed = 1, width = 200, height = 100,
  stageSeconds = 100, scrollSpeed = 30,
} = {}) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  if (scene) scene.add(group);

  const win = backdropWindow(rampName);
  const clampT = (t) => Math.min(win.hi, Math.max(win.lo, t));
  const motif = MOTIF[rampName] || DEFAULT_MOTIF;

  const washTarget = ramp(rampName, clampT(0.22));
  const fieldColor = recede(washTarget, 0.40);
  const baseColor = new THREE.Color(BASE);

  const fieldGeo = new THREE.PlaneGeometry(MAX_VIEW * 3, 400);
  const fieldMat = new THREE.MeshBasicMaterial({ color: fieldColor });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.position.z = -42;
  group.add(field);

  function paint(stack, washAmount, recedeAmount) {
    const r = Math.min(0.92, recedeAmount);
    for (const piece of stack.userData.pieces) {
      const c = piece.userData.fill.material.color;
      if (washAmount > 0) c.lerp(washTarget, washAmount);
      c.lerp(baseColor, r);
    }
  }

  const layers = [];
  const tinted = [];          // every merged material the drift multiplies

  function collectTint(merged) {
    merged.traverse((o) => { if (o.isMesh && o.material && o.material.vertexColors) tinted.push(o.material); });
  }

  // ------------------------------------------------------------ sweeps
  SWEEPS.forEach((cfg) => {
    const lg = new THREE.Group();
    lg.position.z = cfg.z;
    group.add(lg);

    const nPeriods = Math.ceil((MAX_VIEW + 2 * cfg.period) / cfg.period);
    const total = nPeriods * cfg.period;
    const samples = nPeriods * SAMPLES_PER_PERIOD;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const x = -total * 0.5 + (i / samples) * total;
      let y = cfg.y;
      // Phase in x, not in normalised u — that is what makes translating by
      // one period an exact identity rather than an approximate one.
      for (const [k, a, ph] of cfg.harmonics) y += Math.sin((x / cfg.period) * Math.PI * 2 * k + ph) * a * motif.flatten;
      pts.push([x, y]);
    }

    const wave = (u, k, ph) => Math.sin(u * Math.PI * 2 * nPeriods * k + ph);
    const bandWidth = (u, i) => cfg.bandWidth
      * (1 + cfg.vary * 0.6 * wave(u, 1, i * 1.7))
      * (1 + cfg.vary * 0.4 * wave(u, 2, 2.3 + i * 0.9));

    const rib = ribbonStack(pts, {
      bands: Math.max(2, Math.round(cfg.bands * motif.strata)), bandWidth, rampName,
      t0: clampT(cfg.t0), t1: clampT(cfg.t1), dz: 0.04, direction: cfg.direction || 1,
      shadowSteps: 1,
    });
    paint(rib, cfg.wash, cfg.recede * win.recede);
    const merged = mergeStack(rib);
    collectTint(merged);
    lg.add(merged);
    layers.push({ cfg, kind: 'sweep', group: lg, span: cfg.period,
                  items: [{ obj: merged, radius: total * 0.5 }] });
  });

  // ---------------------------------------------------------- clusters
  CLUSTERS.forEach((cfg, li) => {
    const lg = new THREE.Group();
    lg.position.z = cfg.z;
    group.add(lg);

    const radius = cfg.radius * motif.bulk;
    /* Provisional only — used to pick how MANY clusters this layer carries.
       The recycle span is measured from the built geometry further down,
       because predicting a wobbled, stretched, rotated blob's extent from its
       radius underestimates it, and an underestimate means a cluster jumping
       back into view mid-screen. */
    const span0 = MAX_VIEW + 2 * radius * 2.6 + 20;
    const count = Math.max(2, Math.round((span0 / cfg.spacing) * motif.density));

    /* Uneven spacing, fixed pattern. Gaps come from a slow envelope so
       neighbours correlate — which is what makes stretches of open water and
       stretches of crowding rather than uniform scatter — and are then
       normalised to sum to exactly `span`, so the pattern repeats on the wrap
       and no gap can open. */
    const envCycles = 1 + Math.floor(rnd() * 2);
    const envPhase = rnd() * Math.PI * 2;
    const gaps = [];
    let gapTotal = 0;
    for (let i = 0; i < count; i++) {
      const e = Math.sin((i / count) * Math.PI * 2 * envCycles + envPhase);
      const g = Math.max(0.22, 1 + motif.clump * e * 1.15 + (rnd() - 0.5) * 0.25);
      gaps.push(g);
      gapTotal += g;
    }

    const built = [];
    for (let i = 0; i < count; i++) {
      const up = i % 2 === 0 ? 1 : -1;
      const r = radius * (0.8 + rnd() * 0.5);
      const edge = height * 0.5 * cfg.edge + r * (0.25 + rnd() * 0.3);
      const form = li >= 2 && motif.form ? motif.form : 'blob';
      const cut = clusterShape(form, r, (seed * 7919 + li * 131 + i * 17) | 0, rnd);
      const edgeIn = edge * (cut.edgeScale === undefined ? 1 : cut.edgeScale);
      const stack = contourStack(cut.shape, {
        layers: Math.max(3, Math.round(cfg.layers * cut.layerScale)),
        insetStep: cfg.step * (r / radius) * cut.stepScale,
        rampName, t0: clampT(cfg.t0 + (rnd() - 0.5) * 0.06),
        t1: clampT(cfg.t1 + (rnd() - 0.5) * 0.06),
        z: 0, dz: 0.05, shadowSteps: 1,
      });
      paint(stack, cfg.wash, cfg.recede * win.recede);
      const cluster = mergeStack(stack);
      collectTint(cluster);
      cluster.rotation.z = rnd() * Math.PI * 2;
      cluster.position.set(0, 0, 0);
      cluster.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cluster);
      built.push({ obj: cluster, halfW: (box.max.x - box.min.x) * 0.5 + 2, y: up * edgeIn });
    }

    // Span from the widest cluster this layer actually built, so every one of
    // them is off-screen at the moment it jumps, on the widest screen.
    let widest = 0;
    for (const b of built) widest = Math.max(widest, b.halfW);
    const span = MAX_VIEW + 2 * widest + 20;

    const items = [];
    let walk = 0;
    built.forEach((b, i) => {
      b.obj.position.set((walk / gapTotal) * span - span * 0.5, b.y, 0);
      walk += gaps[i];
      lg.add(b.obj);
      items.push({ obj: b.obj, radius: b.halfW });
    });
    layers.push({ cfg, kind: 'cluster', group: lg, span, items });
  });

  // -------------------------------------------------------- set pieces
  const pieceGroup = new THREE.Group();
  pieceGroup.position.z = PIECE_Z;
  group.add(pieceGroup);

  const pieces = [];
  {
    const travel = scrollSpeed * PIECE_PARALLAX * stageSeconds;
    const kinds = motif.pieces;
    const gap = travel / (kinds.length + 0.6);       // one every ~stage/n seconds
    kinds.forEach((kind, i) => {
      const built = buildSetPiece(kind, {
        rampName, seed: (seed * 31337 + i * 911) | 0, height,
        clampT, paint, wash: 0.20, recedeAmount: 0.22 * win.recede,
      });
      if (!built) return;
      collectTint(built.obj);
      // First one arrives a little after the stage opens, not on frame one.
      built.obj.position.x = MAX_VIEW * 0.6 + gap * (i + 0.6);
      built.obj.position.y = built.y;
      pieceGroup.add(built.obj);
      pieces.push({ obj: built.obj, radius: built.radius, done: false });
    });
  }

  /* Scrim last: in front of every layer above, behind everything in the play
     plane. depthWrite off so it never occludes the actors it sits under. */
  const scrimGeo = new THREE.PlaneGeometry(MAX_VIEW * 3, 400);
  const scrimMat = new THREE.MeshBasicMaterial({
    color: BASE, transparent: true, opacity: SCRIM_OPACITY, depthWrite: false,
  });
  const scrim = new THREE.Mesh(scrimGeo, scrimMat);
  scrim.position.z = SCRIM_Z;
  scrim.renderOrder = -2;
  group.add(scrim);

  // ------------------------------------------------------------- drift
  const drift = backdropDrift(rampName);
  const driftFrom = new THREE.Color(drift.from);
  const driftTo = new THREE.Color(drift.to);
  const driftNow = new THREE.Color();
  let elapsed = 0;
  let lastDrift = -1;

  function applyDrift(progress) {
    // Only rewrite when it has actually moved — a hundred-odd material writes
    // for a change nobody can see is the kind of per-frame cost that adds up.
    if (Math.abs(progress - lastDrift) < 0.002) return;
    lastDrift = progress;
    driftNow.lerpColors(driftFrom, driftTo, progress);
    for (const m of tinted) m.color.copy(driftNow);
  }
  applyDrift(0);

  let viewHalfW = width * 0.5;
  function setExtent(w) { viewHalfW = w * 0.5; }

  function update(dt, speed = scrollSpeed) {
    elapsed += dt;
    applyDrift(Math.min(1, elapsed / stageSeconds));

    for (const L of layers) {
      const dx = speed * L.cfg.parallax * dt;
      for (const it of L.items) {
        const p = it.obj.position;
        p.x -= dx;
        if (L.kind === 'sweep') {
          // One period is an exact identity on the curve, so this is invisible.
          while (p.x <= -L.span) p.x += L.span;
          while (p.x > 0) p.x -= L.span;
        } else {
          const limit = viewHalfW + it.radius;
          if (p.x < -limit) p.x += L.span;
          else if (p.x > limit + L.span) p.x -= L.span;
        }
      }
    }

    // Set pieces scroll past once and are then left alone.
    const pdx = speed * PIECE_PARALLAX * dt;
    for (const sp of pieces) {
      if (sp.done) continue;
      sp.obj.position.x -= pdx;
      if (sp.obj.position.x < -(viewHalfW + sp.radius)) {
        sp.done = true;
        sp.obj.visible = false;
      }
    }
  }

  /* Put every set piece back for a replay of the same stage. */
  function restart() {
    elapsed = 0;
    lastDrift = -1;
    applyDrift(0);
    for (const sp of pieces) { sp.done = false; sp.obj.visible = true; }
  }

  function dispose() {
    for (const L of layers) for (const it of L.items) disposeObject(it.obj);
    for (const sp of pieces) disposeObject(sp.obj);
    fieldGeo.dispose();
    fieldMat.dispose();
    scrimGeo.dispose();
    scrimMat.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return { group, field, scrim, fieldColor, layers, pieces, motif,
           update, setExtent, restart, dispose };
}

/* What a cluster is cut as. Only the near layers use anything but 'blob' —
   the far ones are the water, and water is round.
   `edgeScale` pulls a form in from the frame edge: the round ones are the
   water itself and belong half off-screen, but a hull plate or a kelp stem is
   an object you are passing and has to be visible to read as one. */
function clusterShape(form, r, seed, rnd) {
  if (form === 'column') {
    // Tall and narrow: kelp, or a trench wall seen edge-on.
    return { shape: blobShape({ radius: r * 1.5, points: 9, wobble: 0.22, seed, aspect: 0.20 }),
             layerScale: 0.8, stepScale: 0.55, edgeScale: 0.72 };
  }
  if (form === 'plate') {
    /* Straight-edged, and deliberately so. Everything else in the game is cut
       with a curve; a hull plate among the contours is meant to look like it
       does not belong there. */
    const w = r * (1.1 + rnd() * 0.8), h = r * (0.3 + rnd() * 0.5);
    const s = roundRectShape(w, h, Math.min(w, h) * 0.06);
    return { shape: s, layerScale: 0.7, stepScale: 0.8, edgeScale: 0.55 };
  }
  if (form === 'mote') {
    // Particulate drifting past close to the lens.
    return { shape: blobShape({ radius: r * 0.22, points: 7, wobble: 0.4, seed }),
             layerScale: 0.45, stepScale: 0.35, edgeScale: 0.50 };
  }
  return { shape: blobShape({ radius: r, points: 6 + ((rnd() * 3) | 0), wobble: 0.34 + rnd() * 0.3,
                              seed, aspect: 0.9 + rnd() * 0.6 }),
           layerScale: 1, stepScale: 1, edgeScale: 1 };
}

/* ------------------------------------------------------------ set pieces */

/* Each returns { obj, y, radius } or null. They are built from the same kit as
   everything else and merged the same way, so a set piece costs two draws. */
function buildSetPiece(kind, { rampName, seed, height, clampT, paint, wash, recedeAmount }) {
  const rnd = mulberry32(seed);
  const holder = new THREE.Group();
  let y = 0;

  const stack = (shape, opts) => {
    const g = contourStack(shape, Object.assign({
      rampName, z: 0, dz: 0.05, shadowSteps: 1,
    }, opts));
    paint(g, wash, recedeAmount);
    return g;
  };

  if (kind === 'arch') {
    /* A vast contour arch the player flies under. The sweep runs past the
       horizontal at both ends so the legs leave the bottom of the frame
       rather than stopping in mid-air, and the bands step the full width of
       the stage window so it has more internal contrast than the ambient
       scenery — it is an event, not more texture. */
    const r = height * 0.80;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const band = arcBandShape({
        r: r - i * r * 0.115, thickness: r * 0.135, a0: -0.35, a1: Math.PI + 0.35, taper: 0.35,
        steps: 128,
      });
      const t = clampT(0.18 + (0.52 * i) / (N - 1));
      const g = stack(band, { layers: 1, insetStep: 1, t0: t, t1: t });
      g.position.z = i * 0.06;
      holder.add(g);
    }
    y = -height * 0.30;
  } else if (kind === 'island') {
    /* A mass rising out of the bottom of the frame. */
    const r = height * 0.62;
    holder.add(stack(blobShape({ radius: r, points: 7, wobble: 0.42, seed: seed + 1, aspect: 1.5, squash: 0.55 }), {
      layers: 12, insetStep: r * 0.058, t0: clampT(0.12), t1: clampT(0.70),
    }));
    y = -height * 0.52;
  } else if (kind === 'monolith') {
    /* One vast blob filling a third of the screen — the deep's whale. */
    const r = height * 0.55;
    holder.add(stack(blobShape({ radius: r, points: 6, wobble: 0.30, seed: seed + 3, aspect: 0.85 }), {
      layers: 12, insetStep: r * 0.062, t0: clampT(0.12), t1: clampT(0.70),
    }));
    y = (rnd() - 0.5) * height * 0.3;
  } else if (kind === 'vortex') {
    /* Nested rings, each turned a little further than the last, so the stack
       reads as a spiral rather than a target. Each band is rotated with
       rotateKeepingLight so the whole thing still has one light in it. */
    const r = height * 0.46;
    const g = stack(blobShape({ radius: r, points: 7, wobble: 0.30, seed: seed + 5, aspect: 1.15 }), {
      layers: 14, insetStep: r * 0.056, t0: clampT(0.10), t1: clampT(0.70),
    });
    g.userData.pieces.forEach((piece, i) => rotateKeepingLight(piece, i * 0.17));
    holder.add(g);
    y = (rnd() - 0.5) * height * 0.35;
  } else if (kind === 'shoal') {
    /* Many small repeating shapes moving as one body. */
    /* A drifting body of small shapes, not a ring of them: spread along a
       shallow diagonal so it sweeps across the frame like a shoal turning. */
    const n = 30;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const rr = height * (0.045 + rnd() * 0.035);
      const g = stack(blobShape({ radius: rr, points: 7, wobble: 0.34, seed: seed + i * 13 }), {
        layers: 4, insetStep: rr * 0.19, t0: clampT(0.20), t1: clampT(0.66),
      });
      g.position.set((u - 0.5) * height * 3.0 + (rnd() - 0.5) * height * 0.2,
                     Math.sin(u * Math.PI * 1.3) * height * 0.30 + (rnd() - 0.5) * height * 0.34,
                     i * 0.02);
      holder.add(g);
    }
    y = (rnd() - 0.5) * height * 0.2;
  } else if (kind === 'strata') {
    /* Long horizontal layers — canyon rock, not reef. */
    const w = height * 3.2;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = -w * 0.5 + (i / 40) * w;
      pts.push([x, Math.sin(i / 40 * Math.PI * 2 + rnd() * 0.02) * height * 0.06
                 + Math.sin(i / 40 * Math.PI * 5.0) * height * 0.025]);
    }
    const rib = ribbonStack(pts, {
      bands: 9, bandWidth: (u) => height * 0.045 * (1 + 0.5 * Math.sin(u * Math.PI * 3)),
      rampName, t0: clampT(0.16), t1: clampT(0.64), dz: 0.04, direction: -1, shadowSteps: 1,
    });
    paint(rib, wash, recedeAmount);
    holder.add(rib);
    y = (rnd() < 0.5 ? -1 : 1) * height * 0.34;
  } else if (kind === 'canopy') {
    /* The kelp canopy closing over the top of the frame, with fronds hanging
       down out of it. You fly under this one. */
    const w = height * 3.2;
    const pts = [];
    for (let i = 0; i <= 44; i++) {
      const u = i / 44;
      pts.push([(u - 0.5) * w, Math.sin(u * Math.PI * 2.2) * height * 0.07 + Math.sin(u * Math.PI * 5.3) * height * 0.03]);
    }
    const rib = ribbonStack(pts, {
      bands: 7, bandWidth: (u) => height * 0.05 * (1 + 0.5 * Math.sin(u * Math.PI * 3.4)),
      rampName, t0: clampT(0.30), t1: clampT(0.72), dz: 0.04, direction: 1, shadowSteps: 1,
    });
    paint(rib, wash, recedeAmount);
    holder.add(rib);
    for (let i = 0; i < 9; i++) {
      const hh = height * (0.16 + rnd() * 0.30);
      const g = stack(blobShape({ radius: hh, points: 9, wobble: 0.22, seed: seed + i * 7, aspect: 0.14 }), {
        layers: 4, insetStep: hh * 0.045, t0: clampT(0.34), t1: clampT(0.70),
      });
      g.position.set((i / 8 - 0.5) * w * 0.85 + (rnd() - 0.5) * height * 0.2, -hh * 0.85, i * 0.02);
      holder.add(g);
    }
    y = height * 0.46;
  } else if (kind === 'shaft') {
    /* Light coming down through the water. Long, narrow, leaning the same way,
       and nothing else in the backdrop leans — that is what makes them read as
       light rather than as more scenery. */
    for (let i = 0; i < 5; i++) {
      const w = height * (0.07 + rnd() * 0.05), len = height * (1.5 + rnd() * 0.6);
      const g = stack(roundRectShape(w, len, w * 0.45), {
        layers: 4, insetStep: w * 0.14, t0: clampT(0.48), t1: clampT(0.72),
      });
      rotateKeepingLight(g, 0.22 + (rnd() - 0.5) * 0.08);
      g.position.set((i - 2) * height * 0.52 + (rnd() - 0.5) * height * 0.2, (rnd() - 0.5) * height * 0.25, i * 0.03);
      holder.add(g);
    }
    y = 0;
  } else if (kind === 'kelp') {
    /* A stand of it, close enough that you pass between the stems. */
    for (let i = 0; i < 11; i++) {
      const hh = height * (0.35 + rnd() * 0.55);
      const g = stack(blobShape({ radius: hh, points: 11, wobble: 0.28, seed: seed + i * 23, aspect: 0.12 }), {
        layers: 5, insetStep: hh * 0.032, t0: clampT(0.30), t1: clampT(0.70),
      });
      g.position.set((i / 10 - 0.5) * height * 2.6 + (rnd() - 0.5) * height * 0.18,
                     -height * 0.5 + hh * (0.55 + rnd() * 0.3), i * 0.02);
      holder.add(g);
    }
    y = 0;
  } else if (kind === 'hull') {
    /* A broken hull section. Rectangles with a hard cut across them, among
       shapes that have no corners at all — it should look like it landed here
       from a different game, because that is the story of the stage. */
    const w = height * 1.7, h = height * 0.62;
    holder.add(stack(roundRectShape(w, h, h * 0.05), {
      layers: 8, insetStep: h * 0.055, t0: clampT(0.30), t1: clampT(0.76),
    }));
    const g2 = stack(roundRectShape(w * 0.52, h * 0.72, h * 0.04), {
      layers: 6, insetStep: h * 0.06, t0: clampT(0.34), t1: clampT(0.74),
    });
    rotateKeepingLight(g2, -0.26);
    g2.position.set(-w * 0.62, -h * 0.30, 0.5);
    holder.add(g2);
    y = -height * 0.18;
  } else if (kind === 'ribs') {
    /* The skeleton of it: a row of arcs, evenly spaced, getting shorter. */
    for (let i = 0; i < 8; i++) {
      const rr = height * (0.52 - i * 0.035);
      const band = arcBandShape({ r: rr, thickness: rr * 0.14, a0: 0.15, a1: Math.PI - 0.15, taper: 0.4, steps: 96 });
      const t = clampT(0.32 + i * 0.055);
      const g = stack(band, { layers: 1, insetStep: 1, t0: t, t1: t });
      g.position.set((i - 3.5) * height * 0.30, 0, i * 0.05);
      holder.add(g);
    }
    y = -height * 0.30;
  } else if (kind === 'plates') {
    /* Debris field: flat plates at angles, scattered. */
    for (let i = 0; i < 13; i++) {
      const w = height * (0.14 + rnd() * 0.26), h = height * (0.05 + rnd() * 0.10);
      const g = stack(roundRectShape(w, h, h * 0.12), {
        layers: 4, insetStep: h * 0.13, t0: clampT(0.32), t1: clampT(0.76),
      });
      rotateKeepingLight(g, (rnd() - 0.5) * 1.5);
      g.position.set((rnd() - 0.5) * height * 2.6, (rnd() - 0.5) * height * 0.85, i * 0.03);
      holder.add(g);
    }
    y = 0;
  } else if (kind === 'glow') {
    /* A vast dim bloom in the dark. It reads as glowing because everything
       around it is darker, not because it is allowed past the stage cap —
       every band here is inside the same window as the rest of the scenery. */
    const r = height * 0.60;
    holder.add(stack(blobShape({ radius: r, points: 6, wobble: 0.26, seed: seed + 9, aspect: 1.25 }), {
      layers: 14, insetStep: r * 0.052, t0: clampT(0.78), t1: clampT(0.34),
    }));
    y = (rnd() - 0.5) * height * 0.40;
  } else if (kind === 'vent') {
    /* A vent glowing from below, with its plume rising off it. */
    const r = height * 0.34;
    holder.add(stack(blobShape({ radius: r, points: 7, wobble: 0.4, seed: seed + 11, aspect: 1.7, squash: 0.5 }), {
      layers: 9, insetStep: r * 0.070, t0: clampT(0.44), t1: clampT(0.82),
    }));
    for (let i = 0; i < 5; i++) {
      const pr = r * (0.30 - i * 0.045);
      const g = stack(blobShape({ radius: pr, points: 7, wobble: 0.45, seed: seed + 40 + i * 5 }), {
        layers: 3, insetStep: pr * 0.22, t0: clampT(0.52), t1: clampT(0.80),
      });
      g.position.set((rnd() - 0.5) * r * 0.7, r * (0.5 + i * 0.42), i * 0.02);
      holder.add(g);
    }
    y = -height * 0.44;
  } else if (kind === 'walls') {
    /* The trench closing in: columns down from the top and up from the floor,
       leaving a gap you have to fly through. */
    for (let i = 0; i < 10; i++) {
      const down = i % 2 === 0;
      const hh = height * (0.30 + rnd() * 0.34);
      const g = stack(blobShape({ radius: hh, points: 9, wobble: 0.30, seed: seed + i * 31, aspect: 0.22 }), {
        layers: 6, insetStep: hh * 0.042, t0: clampT(0.46), t1: clampT(0.82),
      });
      g.position.set((i / 9 - 0.5) * height * 2.8 + (rnd() - 0.5) * height * 0.12,
                     (down ? 1 : -1) * (height * 0.52 - hh * 0.35), i * 0.02);
      holder.add(g);
    }
    y = 0;
  } else {
    return null;
  }

  const obj = mergeStack(holder);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  return { obj, y, radius: (box.max.x - box.min.x) * 0.5 + 4 };
}
