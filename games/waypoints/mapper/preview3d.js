// Waypoints — live 3D preview of the terrain the contours describe.
import * as THREE from 'three';
import { buildHeightfield, sampleHeight, isWaterAt } from './terrain.js';
import { resolvePts, pointInPoly } from './state.js';
import { levelRGB, levelInk } from './palette.js';
import { WAYPOINTS, DECOR, decorPoints } from './palette.js';
import { KIT, loadKit } from './models.js';
import { loadCharacter } from './character.js';

// Two presentations of the same park. Far out it is a model on a dark desk —
// the editor's own look, where the ink reads. Close in it is a place, and a
// place has daylight and a horizon; a hillside a kilometre away going navy is
// the single thing that stopped the close view looking like a landscape.
const SKY  = { far: new THREE.Color(0x0a0a2e), near: new THREE.Color(0x8fb8e8) };
const HAZE = { far: new THREE.Color(0x141452), near: new THREE.Color(0xbcd2e6) };

const WP_COLOR = { bear:0x2b2b2b, rabbit:0x2b2b2b, bird:0x2b2b2b, trig:0x2b3c5c,
  mountain:0x6b6257, lookout:0x1d1d24, gear:0x1d1d24, campsite:0xf0836c };

export class Preview3D {
  /**
   * @param canvas  the canvas to draw on
   * @param q       what this machine is allowed: `{ pixels, aa, scenery, cover }`.
   *                Antialiasing can only be chosen when the context is created,
   *                which is why it arrives here rather than being set later.
   *                The mapper passes nothing and gets the lot.
   */
  constructor(canvas, q = {}) {
    this.canvas = canvas;
    this.q = { pixels: 2, aa: true, scenery: 1, cover: 1, ...q };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.aa !== false,
      powerPreference: 'high-performance', alpha: false, stencil: false });
    this.setPixels(this.q.pixels);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a2e);
    this.scene.fog = new THREE.Fog(0x141452, 12, 90);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);

    const sun = new THREE.DirectionalLight(0xfff4e2, 1.45);
    sun.position.set(-9, 11, 7); this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x9fc4f0, 0x33402c, 0.42));

    this.group = new THREE.Group(); this.scene.add(this.group);
    // Anything parented to the camera — the map the walker is holding — only
    // renders if the camera is itself in the scene graph.
    this.scene.add(this.camera);
    this.orbit = { yaw: -0.6, pitch: 0.72, dist: 11, target: new THREE.Vector3(3, 0, 2) };
    // Where the hiker is standing, in cell units. He exists whatever the view:
    // in orbit he is the figure you judge the scale of the park against, and at
    // eye level the camera sits behind his eyes. One position, two cameras.
    this.hiker = { x: 3, y: 2, yaw: 0, to: null, speed: 0 };
    this.walk = null;                    // === this.hiker when in eye mode
    this._bindInput();
    this.hf = null; this.scaleY = 1;
    this._raf = null;
    this.kit = null;
    // The scenery arrives after the first build, so the preview comes up on its
    // primitives and swaps to the models when they land — a rebuild is cheap and
    // waiting on 4 MB of trees before showing anything is not.
    this.onKit = () => {};
    // The mapper's own click, drag and wheel handling. The game turns it off and
    // brings its own.
    this.interactive = true;
    this.clock = new THREE.Clock();
    this.character = null;
    loadCharacter().then((ch) => {
      if (!ch) return;
      this.character = ch;
      this.scene.add(ch.root);
      this._placeHiker();
      this._loop();
    });
    loadKit().then((kit) => {
      if (!kit || !kit.size) return;
      this.kit = kit;
      if (this.map) this.rebuild(this.map, this.hf ? this.hf.res : undefined);
      this.onKit(kit);
    });
    this.resize();
  }

  // -------------------------------------------------------------- build
  /**
   * How many device pixels per CSS pixel.
   *
   * The cheapest dial in the whole renderer and the one nobody notices being
   * turned: a tablet at 2x is drawing four times the pixels of one at 1x, and
   * these machines run out of fill rate long before they run out of triangles.
   */
  /**
   * Show or hide the dressing.
   *
   * With the map held up to his face the park behind it is a blurred green
   * band at the edges of the paper — and every frame of a route being dragged
   * was still drawing nine million triangles of trees and grass into it. The
   * terrain, the water and the contour lines stay: those are the shapes you
   * can actually make out past the paper.
   */
  showScenery(on) {
    if (this._scenery === on) return;
    this._scenery = on;
    for (const c of this.group.children) if (c.userData.scenery) c.visible = on;
  }

  /**
   * The grass, on or off.
   *
   * With the map held up to his face the park behind it is still the park —
   * hills, trees, the river — and it stays. What goes is the ground cover: five
   * and a half million triangles of tufts and flowers planted around the
   * camera, every one of them smaller than a pixel from the far side of a sheet
   * of paper.
   */
  showCover(on) {
    if (this._cover === on) return;
    this._cover = on;
    for (const c of this.group.children) if (c.userData.cover) c.visible = on;
  }

  setPixels(n) {
    this.q.pixels = n;
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.renderer.setPixelRatio(Math.min(dpr, n));
    const r = this.canvas.getBoundingClientRect();
    if (r.width && r.height) this.renderer.setSize(r.width, r.height, false);
    if (this.scene) this.render();          // not on the way up: there is no scene yet
  }

  rebuild(map, res) {
    const t0 = performance.now();
    this.map = map;
    this.hf = buildHeightfield(map, res);
    const { cols, rows } = map.grid;
    const w = map.world;
    // world units: 1 grid cell = 1 unit. Height in metres -> units, with exaggeration.
    this.scaleY = (w.verticalExaggeration / w.metresPerCell);
    while (this.group.children.length) {
      const c = this.group.children.pop();
      c.geometry?.dispose(); c.material?.dispose?.();
    }
    // props are drawn at true size in eye level and boosted in the orbit view,
    // where a 30 m tree on a 15 km map would be a single pixel.
    // Scenery is drawn at true size in eye level and only slightly boosted in
    // the orbit view, or a pine ends up 180 m tall and the map reads as a model
    // village. Waypoint and bridge markers are symbols rather than scenery, so
    // they keep a bigger boost and stay legible from above.
    // A 25 m tree on a 15 km map is a third of a pixel. Eye level shows the park
    // at true size; the orbit view is a model of it, and its scenery is
    // exaggerated the same way its height is.
    this.boost = this.walk ? 1 : this.orbitBoost();
    this.markerBoost = this.walk ? 1 : 7;
    this._builtBoost = this.boost;
    this.mPerU = w.metresPerCell;
    // Triangle budgets for the scenery. Instancing makes the DRAW CALLS cheap
    // however many trees there are, but the triangles are still drawn, so the
    // planter thins a set rather than let a dense wood stall the preview.
    this.sceneryTris = 0;
    // One pool for the whole scene, not one per wood: seven woodlands each
    // given "half the budget" is three and a half budgets.
    //
    // And they depend on the view. Standing in the park, a tuft of grass is a
    // real thing at your feet and worth its triangles. From the drone or from
    // macro the same tuft is a fraction of a pixel: the wide view was drawing
    // nine and a half million triangles of scenery nobody could see, which is
    // what made the whole park feel like treacle to turn.
    // Trees are the shape of the park from the air and they stay; GRASS is what
    // the wide view cannot see. So the wide build keeps its woods and loses most
    // of its ground cover, rather than being thinned all over.
    const wide = !this.focus();
    const q = this.q || { scenery: 1, cover: 1 };
    this.budget = 2.4e6 * q.scenery;
    this.decorBudget = 1.1e6 * q.scenery;
    // A close view plants one disc a few hundred metres across, not thirty
    // kilometres of park, so it can afford real ground cover; the wide view
    // cannot and is scattered instead.
    this.coverBudget = (wide ? 1.0e6 : 5.5e6) * q.cover;
    this.group.add(this._terrain(map, cols, rows));
    this._plinth(map, cols, rows).forEach((m) => this.group.add(m));
    this._contourLines(map).forEach((m) => this.group.add(m));
    this._water(map).forEach((m) => this.group.add(m));
    // The grid is an editing aid for the model view. Standing in the park it is
    // a blue line across the grass, so it is left out whenever the view is close.
    if (!this.focus()) this._gridLines(map, cols, rows).forEach((m) => this.group.add(m));
    // Trees, rocks and woods are THE PARK — you look at them past the edge of
    // the map and they are why the park is worth looking at. Ground cover is
    // different: a tuft of grass is a real thing at your feet and a smear of
    // green from anywhere else, and there are millions of triangles of it. It
    // is tagged separately so a view that cannot make it out can drop it.
    const dress = (m) => { m.userData.scenery = true; this.group.add(m); };
    const cover = (m) => { m.userData.cover = true; this.group.add(m); };
    this._woodland(map).forEach(dress);
    this._coverAt = this.focus();
    this._groundCover(map).forEach(cover);
    this._scree(map).forEach(dress);
    this._decor(map).forEach(dress);
    this._markers(map).forEach((m) => this.group.add(m));
    this._placeHiker();
    // A fresh build has everything in it. If the view had the grass off — the
    // map held up to his face — put it back off, or a re-plant would hand the
    // reading view five million triangles it cannot make out.
    if (this._scenery === false) { this._scenery = true; this.showScenery(false); }
    if (this._cover === false) { this._cover = true; this.showCover(false); }
    // A rebuild must never move the camera — you are watching one spot while
    // you edit. Framing happens once, or when you ask for it.
    if (!this._framed) { this.frame(); this._framed = true; }
    this.buildMs = Math.round(performance.now() - t0);
    this.render();
    return { ms: this.buildMs, min: this.hf.min, max: this.hf.max, tris: this.sceneryTris };
  }


  // ---------------------------------------------------------------- scenery
  /**
   * Plant a set of points with real models.
   *
   * Every point picks a model from `kind`'s list by hash, so a wood is a mix and
   * the same wood is the same mix every rebuild. Each model is drawn as one
   * InstancedMesh PER PART, which is a handful of draw calls however many trees
   * there are — but the triangles still add up, so `budget` caps the count.
   *
   * Returns the meshes, or null if the kit has not loaded yet and the caller
   * should fall back to its primitives.
   */
  _plant(points, kind, metres, budget, boost, fit) {
    const kit = this.kit;
    if (!kit) return null;
    // One knob per family, so a wood can be thinned without shrinking the grass.
    // Ground clutter is the `span`-fitted stuff; anything sized by height is a
    // tree or a bush and belongs to the scenery knob.
    const knobs = this.map?.world || {};
    metres *= (fit === 'span' ? (knobs.coverScale ?? 1) : (knobs.sceneryScale ?? 1));
    const names = (KIT[kind] || []).filter((n) => kit.has(n));
    if (!names.length || !points.length) return null;

    // Choose between the models INVERSELY to what they cost, so a set spends the
    // same on each and the cheap common tuft is the common one — which is both
    // more plants for the triangles and, as it happens, what a meadow looks like.
    const cost = names.map((x) => Math.max(1, kit.get(x).tris));
    const wsum = cost.reduce((n, t) => n + 1 / t, 0);
    const w = cost.map((t) => 1 / t / wsum);
    const avg = w.reduce((n, wi, i) => n + wi * cost[i], 0);
    const cap = Math.max(1, Math.min(points.length, Math.floor(budget / Math.max(1, avg))));
    const use = cap < points.length
      ? points.filter((_, i) => i % Math.ceil(points.length / cap) === 0)
      : points;

    const buckets = names.map(() => []);
    use.forEach((p) => {
      // a stable hash of the position, so thinning the list never reshuffles
      const h = Math.abs(Math.sin((p[0] * 127.1 + p[1] * 311.7) * 43758.5453)) % 1;
      let k = 0, acc = w[0];
      while (k < w.length - 1 && h > acc) acc += w[++k];
      buckets[k].push([p, h]);
    });

    const out = [];
    const o = new THREE.Object3D();
    names.forEach((name, bi) => {
      const list = buckets[bi];
      if (!list.length) return;
      const model = kit.get(name);
      const mats = [];
      for (const part of model.parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        im.frustumCulled = false;      // the instances are spread over the whole map
        mats.push(im);
      }
      list.forEach(([p, h], i) => {
        const [x, y, given] = p;
        const wobble = 0.78 + h * 0.5;
        const ref = fit === 'span' ? model.span : model.height;
        const sc = ((metres * (given || 1) * wobble) / this.mPerU) * (boost || this.boost) / ref;
        o.position.set(x, this.h(x, y) - model.foot * sc, y);
        o.scale.set(sc, sc, sc);
        o.rotation.set(0, h * 6.283, 0);
        o.updateMatrix();
        for (const im of mats) im.setMatrixAt(i, o.matrix);
      });
      for (const im of mats) { im.instanceMatrix.needsUpdate = true; out.push(im); }
      this.sceneryTris += model.tris * list.length;
    });
    return out;
  }

  h(x, y) { return sampleHeight(this.hf, x, y) * this.scaleY; }

  /** Is this point on the printed sheet? Scenery outside it has nothing to stand on. */
  onSheet(x, y) {
    const { cols, rows } = this.map.grid;
    return x >= 0 && y >= 0 && x <= cols && y <= rows;
  }

  clampToSheet(x, y) {
    const { cols, rows } = this.map.grid;
    return [Math.max(0, Math.min(cols, x)), Math.max(0, Math.min(rows, y))];
  }

  _terrain(map, cols, rows) {
    const hf = this.hf;
    const geo = new THREE.PlaneGeometry(cols, rows, hf.w - 1, hf.h - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = i % hf.w, gy = (i / hf.w) | 0;
      pos.setY(i, hf.data[gy * hf.w + gx] * this.scaleY);
    }
    geo.computeVertexNormals();
    geo.translate(cols / 2, 0, rows / 2);

    const w = map.world;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // the same level ramp the flat map tints its bands with
    const ramp = [];
    for (let lv = 0; lv <= 12; lv++) {
      const [r, g, b] = levelRGB(lv);
      ramp.push(new THREE.Vector3(r / 255, g / 255, b / 255));
    }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uInterval = { value: w.contourInterval * this.scaleY };
      sh.uniforms.uBase = { value: w.baseElevation * this.scaleY };
      sh.uniforms.uRamp = { value: ramp };
      sh.vertexShader = 'varying float vH;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\n vH = position.y;');
      sh.fragmentShader = `
        varying float vH;
        uniform float uInterval;
        uniform float uBase;
        uniform vec3 uRamp[13];
        vec3 rampAt(float lv){
          float c = clamp(lv, 0.0, 12.0);
          int i = int(floor(c));
          int j = min(i + 1, 12);
          return mix(uRamp[i], uRamp[j], fract(c));
        }
` + sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Colour only. The contour LINES are real geometry draped on this
         // surface (see _contourLines) — drawing them here from elevation
         // instead invented a ring at every interval the ground happened to
         // pass through, so a summit cone that rises 400 m above the highest
         // drawn contour wore four rings the map never had.
         float band = (vH - uBase) / max(uInterval, 1e-5);
         diffuseColor.rgb = rampAt(band);`);
      this._terrainShader = sh;
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrain';
    this.ground = mesh;              // what a click is raycast against
    return mesh;
  }

  /**
   * The map's own contours, draped on the terrain.
   *
   * These are the lines the map has and no others: one polyline per drawn
   * contour, resampled fine enough to sit on the surface, lifted a few metres
   * so it does not fight the ground for the same depth. A ring that was never
   * drawn does not appear, however much ground the solver put between levels.
   */
  _contourLines(map) {
    const out = [];
    const lift = 6 * this.scaleY;          // metres, so it clears the ground
    const STEP = 0.012;                    // cell units between samples
    const byLevel = new Map();
    for (const ct of (map.contours || [])) {
      if (ct.level == null && ct.height == null) continue;
      const pts = resolvePts(ct);
      if (pts.length < 2) continue;
      const lv = ct.level | 0;
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      const verts = byLevel.get(lv);
      const seq = ct.closed ? pts.concat([pts[0]]) : pts;
      let prev = null;
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1], b = seq[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
        for (let k = (prev ? 1 : 0); k <= n; k++) {
          const t = k / n;
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          const cur = [x, this.h(x, y) + lift, y];
          if (prev) verts.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]);
          prev = cur;
        }
      }
    }
    for (const [lv, verts] of byLevel) {
      if (!verts.length) continue;
      const g3 = new THREE.BufferGeometry();
      g3.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      // setStyle, not the float constructor: three treats raw components as
      // already being in the working colour space, so a dark olive passed that
      // way came out as pale cream once the sRGB transfer was applied.
      const col = new THREE.Color();
      col.setStyle(levelInk(lv));
      const mat = new THREE.LineBasicMaterial({ color: col, transparent: true,
        opacity: (lv % 5) === 0 ? 0.95 : 0.8 });
      out.push(new THREE.LineSegments(g3, mat));
    }
    return out;
  }

  /**
   * The sheet as a solid block: walls from the terrain's own edge down to a
   * floor three contour intervals below level 0, and a base to close it.
   *
   * The walls take their top from the terrain's edge samples, so they can never
   * stand above the ground they are holding up — including where a river has
   * carved the edge down on its way off the map.
   */
  _plinth(map, cols, rows) {
    const hf = this.hf, out = [];
    const w = map.world;
    const floor = (w.baseElevation - 3 * w.contourInterval) * this.scaleY;
    const edgeY = (gx, gy) => hf.data[gy * hf.w + gx] * this.scaleY;
    const sideMat = new THREE.MeshLambertMaterial({ color: 0xb9ab8e, side: THREE.DoubleSide });
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x8d8168, side: THREE.DoubleSide });

    // each edge as a strip: [world x, world z, heightfield index]
    const runs = [
      { n: hf.w, at: (i) => [i / (hf.w - 1) * cols, 0,    i, 0] },
      { n: hf.w, at: (i) => [i / (hf.w - 1) * cols, rows, i, hf.h - 1] },
      { n: hf.h, at: (i) => [0,    i / (hf.h - 1) * rows, 0, i] },
      { n: hf.h, at: (i) => [cols, i / (hf.h - 1) * rows, hf.w - 1, i] },
    ];
    for (const run of runs) {
      const verts = [], idx = [];
      for (let i = 0; i < run.n; i++) {
        const [x, z, gx, gy] = run.at(i);
        verts.push(x, edgeY(gx, gy), z, x, floor, z);
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(idx); g.computeVertexNormals();
      out.push(new THREE.Mesh(g, sideMat));
    }
    const base = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), baseMat);
    base.rotateX(Math.PI / 2);
    base.position.set(cols / 2, floor, rows / 2);
    out.push(base);
    return out;
  }

  _water(map) {
    const out = [];
    // DoubleSide: a lake's ShapeGeometry ends up facing down after the rotation
    // onto the ground plane, and a river ribbon's winding depends on which way
    // the course was drawn. Either way a one-sided water surface is invisible
    // from above, which is exactly how it failed.
    const matL = new THREE.MeshLambertMaterial({ color: 0x3b82c4, transparent: true,
      opacity: 0.9, side: THREE.DoubleSide });
    for (const lk of (map.lakes || [])) {
      const lp = resolvePts(lk);
      if (lp.length < 3) continue;
      const mesh = this._lakeSurface(map, lk, lp, matL);
      if (mesh) out.push(mesh);
    }
    const matR = new THREE.MeshLambertMaterial({ color: 0x2f6ea8, transparent: true,
      opacity: 0.94, side: THREE.DoubleSide });
    for (const r of (map.rivers || [])) {
      const rp = resolvePts(r);
      if (rp.length < 2) continue;
      // the water sits on the surface profile the carve worked out, not on the
      // terrain — the terrain under it is the bed, which is lower
      const half = (r.channelHalf || (r.width || 0.05) / 2) * 0.92;
      const verts = [], idx = [];
      for (let i = 0; i < rp.length; i++) {
        const p = rp[i];
        const a = rp[Math.max(0, i - 1)], b = rp[Math.min(rp.length - 1, i + 1)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const surf = r.surface && r.surface[i] != null ? r.surface[i] : null;
        // Water never stands above the ground it is in. The carve's surface
        // profile is what the bed was cut against, but where a course leaves the
        // sheet there is no carve to speak of, and an unchecked profile floated
        // the ribbon over the lip of the block.
        let y = (surf != null ? surf * this.scaleY : this.h(p[0], p[1])) + 0.0015;
        const ground = this.h(p[0], p[1]);
        if (y > ground + 0.02) y = ground + 0.0015;
        // Both banks are pinned to the paper, so a river running off the edge
        // stops at the wall instead of hanging in the air beyond it.
        const L = this.clampToSheet(p[0] + nx * half, p[1] + ny * half);
        const R = this.clampToSheet(p[0] - nx * half, p[1] - ny * half);
        verts.push(L[0], y, L[1]);
        verts.push(R[0], y, R[1]);
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(idx); g.computeVertexNormals();
      out.push(new THREE.Mesh(g, matR));
    }
    return out;
  }

  /**
   * A lake's surface, as a mesh rather than a flat disc.
   *
   * At the shore it sits on the ground it meets, so there is no hard edge where
   * a plane clips into a sloping bank; from there it eases down to the lowest
   * point of the basin. Physically a still lake is flat, but a flat quad on
   * uneven ground reads as a sticker — this follows the land it is lying in.
   */
  _lakeSurface(map, lake, lp, mat) {
    const hf = this.hf;
    let x0 = 9e9, y0 = 9e9, x1 = -9e9, y1 = -9e9;
    for (const [x, y] of lp) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    // one vertex per heightfield sample, coarsened only for a very large lake
    const spanSamples = Math.max(x1 - x0, y1 - y0) * hf.res;
    const step = Math.max(1, Math.round(spanSamples / 48));
    const cell = step / hf.res;                       // grid spacing in cell units
    const gx0 = Math.floor(x0 / cell) - 1, gx1 = Math.ceil(x1 / cell) + 1;
    const gy0 = Math.floor(y0 / cell) - 1, gy1 = Math.ceil(y1 / cell) + 1;
    const nx = gx1 - gx0 + 1, ny = gy1 - gy0 + 1;
    if (nx < 2 || ny < 2) return this._flatLake(lake, lp, mat);

    const span = Math.min(x1 - x0, y1 - y0) * hf.res;
    const run = Math.max(2.5, Math.min(span * 0.35, hf.res * 0.22)) / hf.res;
    const drop = (map.world.waterDepth ?? 25) * 0.3 * this.scaleY;

    const nearestShore = (x, y) => {
      let d = Infinity, sx = x, sy = y;
      for (let k = 0, m = lp.length - 1; k < lp.length; m = k++) {
        const ax = lp[m][0], ay = lp[m][1], bx = lp[k][0], by = lp[k][1];
        const vx = bx - ax, vy = by - ay;
        const l2 = vx * vx + vy * vy || 1e-9;
        let t = ((x - ax) * vx + (y - ay) * vy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + t * vx, py = ay + t * vy;
        const dd = Math.hypot(x - px, y - py);
        if (dd < d) { d = dd; sx = px; sy = py; }
      }
      return { d, sx, sy };
    };

    const idx = new Int32Array(nx * ny).fill(-1);
    const verts = [];
    let lowest = Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = (gx0 + i) * cell, y = (gy0 + j) * cell;
      const inside = pointInPoly([x, y], lp);
      const { d, sx, sy } = nearestShore(x, y);
      // A vertex just outside is pulled onto the shoreline rather than dropped.
      // Keeping only fully-inside quads shrank every lake to a sliver of itself.
      if (!inside && d > cell * 1.5) continue;
      const vx = inside ? x : sx, vz = inside ? y : sy;
      const u = inside ? Math.min(1, d / run) : 0;
      const ease = u * u * (3 - 2 * u);
      const wy = this.h(sx, sy) - drop * ease;
      if (wy < lowest) lowest = wy;
      idx[j * nx + i] = verts.length / 3;
      verts.push(vx, wy, vz);
    }
    if (verts.length < 9) return this._flatLake(lake, lp, mat);

    // Following the shore exactly picks up every bump in it, and the varying
    // normals make the water read as crumpled foil. A couple of averaging
    // passes keep the gradient but lose the wrinkles.
    for (let pass = 0; pass < 3; pass++) {
      const snap = new Float32Array(verts.length / 3);
      for (let v = 0; v < snap.length; v++) snap[v] = verts[v * 3 + 1];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const v = idx[j * nx + i];
        if (v < 0) continue;
        let sum = snap[v], n = 1;
        const add = (jj, ii) => {
          if (jj < 0 || ii < 0 || jj >= ny || ii >= nx) return;
          const w = idx[jj * nx + ii];
          if (w >= 0) { sum += snap[w]; n++; }
        };
        add(j - 1, i); add(j + 1, i); add(j, i - 1); add(j, i + 1);
        verts[v * 3 + 1] = sum / n;
      }
    }
    lowest = Infinity;
    for (let v = 1; v < verts.length; v += 3) if (verts[v] < lowest) lowest = verts[v];

    const tri = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = idx[j * nx + i], b = idx[j * nx + i + 1];
      const c = idx[(j + 1) * nx + i], d2 = idx[(j + 1) * nx + i + 1];
      if (a < 0 || b < 0 || c < 0 || d2 < 0) continue;
      tri.push(a, c, b, b, c, d2);
    }
    if (!tri.length) return this._flatLake(lake, lp, mat);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    // Water is lit as a level surface even where it follows a gentle gradient —
    // true normals here just expose the slope as shading noise.
    const up = new Float32Array(verts.length);
    for (let v = 1; v < up.length; v += 3) up[v] = 1;
    g.setAttribute('normal', new THREE.Float32BufferAttribute(up, 3));
    g.setIndex(tri);
    lake.surface = Math.round((lowest / this.scaleY) * 10) / 10;
    return new THREE.Mesh(g, mat);
  }

  /** Fallback for a lake too small to grid: the old flat disc. */
  _flatLake(lake, lp, mat) {
    const shape = new THREE.Shape(lp.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    g.translate(0, (lake.surface ?? 0) * this.scaleY - 0.002, 0);
    return new THREE.Mesh(g, mat);
  }

  _gridLines(map, cols, rows) {
    const mat = new THREE.LineBasicMaterial({ color: 0x24456e, transparent: true, opacity: 0.85 });
    const out = [];
    const strip = (fn, n) => {
      const pts = [];
      for (let t = 0; t <= n; t++) pts.push(fn(t / n));
      const g = new THREE.BufferGeometry().setFromPoints(
        pts.map(([x, y]) => new THREE.Vector3(x, this.h(x, y) + 0.012, y)));
      out.push(new THREE.Line(g, mat));
    };
    for (let i = 0; i <= cols; i++) strip((t) => [i, t * rows], 160);
    for (let j = 0; j <= rows; j++) strip((t) => [t * cols, j], 240);
    return out;
  }

  _woodland(map) {
    const out = [];
    const trunk = new THREE.MeshLambertMaterial({ color: 0x5b4632 });
    const leaf = new THREE.MeshLambertMaterial({ color: 0x3f7a4d, flatShading: true });
    const U = (metres) => (metres / this.mPerU) * this.boost;
    const density = Math.max(0, map.world.forestDensity ?? 1);
    const cone = new THREE.ConeGeometry(U(7), U(24), 6);
    const cyl = new THREE.CylinderGeometry(U(1.4), U(1.9), U(10), 5);

    // Every wood is seeded first and planted once, so the triangle budget is
    // spent across the map rather than handed out again to each polygon, and a
    // model ends up as ONE instanced mesh for the whole park.
    const seeds = [];
    for (const wd of (map.woodland || [])) {
      const wp = resolvePts(wd);
      if (wp.length < 3) continue;
      let x0 = 9e9, y0 = 9e9, x1 = -9e9, y1 = -9e9, area2 = 0;
      for (let i = 0, j = wp.length - 1; i < wp.length; j = i++) {
        const [x, y] = wp[i];
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x > x1) x1 = x; if (y > y1) y1 = y;
        area2 += wp[j][0] * y - x * wp[j][1];
      }
      // Planted by area, not a flat cap: a big wood used to get the same 60
      // trees as a copse, which is why forests read as thin. The rate is set so
      // density 1 is open woodland and 6 is a closed canopy — on this map a wood
      // is only a few hundredths of a grid square, so a low rate per unit area
      // left even the top of the slider looking like parkland.
      const area = Math.abs(area2 / 2);
      const want = Math.min(6000, Math.round(area * 10000 * density));
      let got = 0;
      for (let k = 0; k < want * 8 && got < want; k++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
        if (!this.onSheet(x, y)) continue;      // a wood may run off the paper; its trees may not
        if (!inPoly(x, y, wp)) continue;
        if (isWaterAt(this.hf, x, y)) continue;
        seeds.push([x, y]); got++;
      }
    }
    if (!seeds.length) return out;

    // A wood is a mix: mostly conifer with broadleaf through it, and a bare tree
    // here and there. Split by index so the mix is the same every rebuild.
    const planted = [
      this._plant(seeds.filter((p, i) => i % 5 < 3), 'pine',  26, this.budget * 0.58),
      this._plant(seeds.filter((p, i) => i % 5 === 3), 'bushy', 22, this.budget * 0.34),
      this._plant(seeds.filter((p, i) => i % 25 === 4), 'dead', 24, this.budget * 0.08),
    ];
    if (planted[0]) {
      for (const g of planted) if (g) out.push(...g);
      return out;
    }

    const mc = new THREE.InstancedMesh(cone, leaf, seeds.length);
    const mt = new THREE.InstancedMesh(cyl, trunk, seeds.length);
    const o = new THREE.Object3D();
    seeds.forEach(([x, y], i) => {
      const h = this.h(x, y);
      const sc = 0.8 + ((i * 0.618) % 1) * 0.45;
      o.scale.set(sc, sc, sc);
      o.position.set(x, h + U(17) * sc, y); o.rotation.set(0, (i * 2.399) % 6.283, 0);
      o.updateMatrix(); mc.setMatrixAt(i, o.matrix);
      o.position.set(x, h + U(5) * sc, y); o.updateMatrix(); mt.setMatrixAt(i, o.matrix);
    });
    out.push(mc, mt);
    return out;
  }

  /**
   * Ground cover over the whole park: grass, clover, ferns, plants, the odd
   * mushroom and loose stone.
   *
   * This is what makes the park a SURFACE rather than a painted plane, and it
   * is not something the map says: the map marks where a particular kind of
   * vegetation stands out, not where the ground has grass on it. So it is
   * scattered everywhere the ground is open — out of the water, off the rock
   * above the treeline, and thinning as it climbs, the way a hillside does.
   *
   * Sampled on a jittered grid rather than at random, so the cover is even
   * instead of clumping and leaving bald patches.
   */
  /**
   * The patch of ground that gets dense cover, or null for "the whole map".
   *
   * Planting 1 m tufts across a 30 km park at true size is thirty million of
   * them. So close views plant a disc and far views plant the park sparsely and
   * oversized — and the disc follows the camera, not the map.
   */
  focus() {
    // On foot you see a few hundred metres through the haze, so that is the patch.
    if (this.walk) return { x: this.walk.x, y: this.walk.y, r: 0.22 };
    // 0.6 cells out is three kilometres: past that the exaggerated, map-wide
    // scatter is the better picture and a patch would show its own edge.
    const o = this.orbit;
    if (o.dist > 0.6) return null;
    // Crowd the cover around the CAMERA, not around what it is looking at.
    // Screen density is set by how near the ground is to the eye, and the
    // ground at the bottom of the frame — the part you judge the grass by — is
    // the ground nearest the camera, not the ground at the target.
    const c = Math.cos(o.pitch) * o.dist;
    const cx = o.target.x + Math.sin(o.yaw) * c, cy = o.target.z + Math.cos(o.yaw) * c;
    // wide enough to run past the horizon of the shot, so the disc never ends
    // somewhere you can see it end
    return { x: cx * 0.62 + o.target.x * 0.38, y: cy * 0.62 + o.target.z * 0.38,
             r: Math.max(0.22, o.dist * 9) };
  }

  _groundCover(map) {
    const hf = this.hf;
    if (!this.kit || !hf) return [];
    const { cols, rows } = map.grid;
    const span = Math.max(1e-6, hf.max - hf.min);
    // Ground cover has its own density: the decoration slider says how thickly a
    // MARKED patch is planted, and the two are not the same dial.
    const density = Math.max(0, map.world.coverDensity ?? 1.8);

    // A tuft of grass is a metre across on a park thirty kilometres wide. From
    // orbit it is a hundredth of a pixel, so there it is planted sparsely and
    // OVERSIZED — texture on the ground, the way a model railway lays lichen.
    // On foot it is planted at true size and only in the patch you are standing
    // in, because ten thousand real tufts is a field, not a continent.
    // What the cover is planted AROUND. On foot that is the hiker; in orbit,
    // once you are close enough for true scale, it is whatever the camera is
    // pointed at — otherwise zooming in to check the scale puts you on a bare
    // green plain, because a tuft every eighty metres is not ground cover.
    const near = this.focus();
    // On foot you can see a few hundred metres through the haze, so the patch is
    // sized to that: spreading the same budget over a kilometre left one tuft
    // per thousand square metres, which is not ground cover, it is litter.
    const R = near ? near.r : 0;
    // The same number of plants over whatever patch we are given: a wider patch
    // is a further view, and a further view wants fewer, bigger things on it.
    const N = Math.round((near ? 205 : 150) * Math.sqrt(Math.max(0.15, density)));
    // Ground cover takes a bigger exaggeration than the trees do: a tree is 25 m
    // and reads from a distance, a tuft of grass is 1 m and does not.
    const boost = near ? 1 : Math.max(1, this.boost * (map.world.coverBoost ?? 3.5));
    let seed = 991;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Where the points go.
    //
    // Over the whole map: a jittered grid. Random sampling clumps and leaves
    // bald patches, which on open ground reads as a mistake.
    //
    // Over a patch: a phyllotaxis spiral, with the radius raised to a power so
    // the points crowd towards the middle. Spreading them evenly over a
    // 275 m disc spends most of the budget on ground that is a few pixels
    // high at the horizon and leaves the grass at your feet thin — and thin
    // grass at your feet is exactly what you notice. Crowding the centre
    // matches the plants to how much of the screen the ground actually takes.
    const spots = [];
    if (near) {
      const n = N * N;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const rad = R * Math.pow(u, map.world.coverFalloff ?? 1.45) * (0.94 + rnd() * 0.12);
        const th = i * 2.399963229728653 + rnd() * 0.35;      // golden angle
        spots.push([near.x + Math.cos(th) * rad, near.y + Math.sin(th) * rad]);
      }
    } else {
      const nx = Math.max(1, Math.round(N * Math.sqrt(cols / Math.max(rows, 1e-6))));
      const ny = Math.max(1, Math.round((N * N) / nx));
      const stepX = cols / nx, stepY = rows / ny;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        spots.push([(i + 0.15 + rnd() * 0.7) * stepX, (j + 0.15 + rnd() * 0.7) * stepY]);
      }
    }

    const turf = [], leaf = [], bloom = [], fungi = [], stone = [];
    for (const [x, y] of spots) {
      if (x >= cols || y >= rows || x < 0 || y < 0) continue;
      if (isWaterAt(hf, x, y)) continue;
      const e = (sampleHeight(hf, x, y) - hf.min) / span;
      // lush in the valleys, thinning with height, gone by the scree line
      const lush = Math.max(0, 1 - Math.max(0, e - 0.25) / 0.45);
      if (rnd() > lush) continue;
      const sc = 0.78 + rnd() * 0.44;
      const r = rnd();
      if (r < 0.66) turf.push([x, y, sc]);
      else if (r < 0.86) leaf.push([x, y, sc]);
      else if (r < 0.895) bloom.push([x, y, sc]);
      else if (r < 0.955) fungi.push([x, y, sc * 0.8]);
      else stone.push([x, y, sc]);
    }
    const b = this.coverBudget;
    const out = [];
    // sized across, not up: these are all wider than they are tall
    for (const [pts, kind, m, share] of [
      [turf,  'grass',    0.38, 0.66],
      [leaf,  'leafy',    0.35, 0.20],
      [bloom, 'flower',   0.2,  0.035],
      [fungi, 'mushroom', 0.14, 0.06],
      [stone, 'stone',    0.25, 0.045],
    ]) {
      const g = this._plant(pts, kind, m, b * share, boost, 'span');
      if (g) out.push(...g);
    }
    return out;
  }

  /**
   * Loose rock where nothing grows: the steep ground and the summits.
   *
   * The map says nothing about scree, but a bare cone with a sharp point reads
   * as a cardboard model. Sampling the heightfield for slope and height gives
   * the tops something on them without inventing map data.
   */
  _scree(map) {
    const hf = this.hf;
    if (!this.kit || !hf) return [];
    const { cols, rows } = map.grid;
    const span = Math.max(1e-6, hf.max - hf.min);
    const big = [], small = [];
    let seed = 20260914;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    // Only the tops. Slope alone was no use as a test: interpolating between
    // contours leaves gentle slope almost everywhere, so weighting it spread
    // scree across the whole park.
    const LO = 0.52, HI = 0.86;
    for (let k = 0; k < 14000 && big.length + small.length < 420; k++) {
      const x = rnd() * cols, y = rnd() * rows;
      if (isWaterAt(hf, x, y)) continue;
      const e = (sampleHeight(hf, x, y) - hf.min) / span;
      const want = Math.min(1, Math.max(0, (e - LO) / (HI - LO)));
      if (want <= 0 || rnd() > want * want) continue;
      (rnd() < 0.4 ? big : small).push([x, y, 0.7 + rnd() * 0.8]);
    }
    const out = [];
    const a = this._plant(big, 'rock', 5, 1.6e5, undefined, 'span');
    const b = this._plant(small, 'pebble', 2.5, 6e4, undefined, 'span');
    if (a) out.push(...a);
    if (b) out.push(...b);
    return out;
  }

  _decor(map) {
    if (!map.decor || !map.decor.length) return [];
    const U = (metres) => (metres / this.mPerU) * this.boost;
    const kinds = {
      pine:  { leaf: 0x36663f, trunk: 0x4d3c2b, h: 22, r: 5.5, trunkH: 7, cone: true },
      bushy: { leaf: 0x548a49, trunk: 0x5b4632, h: 15, r: 8,   trunkH: 6, cone: false },
      grass: { leaf: 0x86a35f, trunk: null,     h: 6,  r: 5,   trunkH: 0, cone: true },
    };
    const density = Math.max(0, map.world.decorDensity ?? 1);
    // reject anything in water OR off the paper — a decoration near the border
    // scatters over a radius, and half of that radius can be off the map
    const wet = (x, y) => isWaterAt(this.hf, x, y) || !this.onSheet(x, y);
    const bucket = {};
    for (const dc of map.decor) {
      const k = kinds[dc.type] ? dc.type : 'grass';
      const base = (DECOR[k] || DECOR.grass).count;
      (bucket[k] ||= []).push(...decorPoints(dc, { count: base * density, reject: wet }));
    }
    const out = [];
    // the kit's own version, when it is loaded: real grass, bushes and trees
    const KIND = { pine: 'pine', bushy: 'bushy', grass: 'grass' };
    const METRES = { pine: 24, bushy: 18, grass: 1.4 };
    const SHARE = { pine: 0.36, bushy: 0.34, grass: 0.30 };
    // A grass decoration marks rough open ground, so its tufts are real size —
    // and like the ground cover they need oversizing to be seen from orbit.
    const BOOST = { pine: 0, bushy: 0, grass: this.walk ? 1 : 22 };
    for (const [k, pts] of Object.entries(bucket)) {
      const g = this._plant(pts, KIND[k], METRES[k], this.decorBudget * (SHARE[k] || 0.3),
        BOOST[k] || undefined, k === 'grass' ? 'span' : undefined);
      if (g) {
        out.push(...g);
        // a scatter of flowers and stones through the grass, for the ground to
        // have something on it besides tufts
        if (k === 'grass') {
          const extra = pts.filter((_, i) => i % 9 === 0);
          const f = this._plant(extra, 'flower', 0.5, this.decorBudget * 0.06, BOOST.grass || undefined, 'span');
          if (f) out.push(...f);
          const s2 = this._plant(pts.filter((_, i) => i % 17 === 0), 'stone', 0.4,
            this.decorBudget * 0.03, BOOST.grass || undefined, 'span');
          if (s2) out.push(...s2);
        }
        if (k === 'bushy') {
          const u = this._plant(pts.filter((_, i) => i % 4 === 0), 'bush', 6,
            this.decorBudget * 0.08);
          if (u) out.push(...u);
        }
        continue;
      }

      const cfg = kinds[k];
      const capped = pts.slice(0, 4000);
      const geo = cfg.cone
        ? new THREE.ConeGeometry(U(cfg.r), U(cfg.h), 6)
        : new THREE.SphereGeometry(U(cfg.r), 8, 6);
      const leaf = new THREE.MeshLambertMaterial({ color: cfg.leaf, flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, leaf, capped.length);
      const o = new THREE.Object3D();
      let trunks = null;
      if (cfg.trunk) {
        trunks = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(U(1.6), U(2.2), U(cfg.trunkH), 5),
          new THREE.MeshLambertMaterial({ color: cfg.trunk }), capped.length);
      }
      capped.forEach(([x, y, sc], i) => {
        const h = this.h(x, y);
        o.position.set(x, h + U(cfg.trunkH + cfg.h * 0.5) * sc, y);
        o.scale.set(sc, sc, sc);
        o.rotation.set(0, (i * 2.399) % 6.283, 0);
        o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
        if (trunks) {
          o.position.set(x, h + U(cfg.trunkH * 0.5) * sc, y);
          o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
        }
      });
      out.push(mesh);
      if (trunks) out.push(trunks);
    }
    return out;
  }

  _markers(map) {
    const out = [];
    const U = (metres) => (metres / this.mPerU) * this.markerBoost;
    const poleH = U(26), headR = U(11);
    // A twenty-six metre pole with a ball on it is how the MAPPER shows where a
    // waypoint is while you are placing it. The game plants its own markers —
    // the sheet's printed icon on a thin stem — and two sets of markers for the
    // same places is one set too many, so the game turns these off.
    for (const wp of (this.posts === false ? [] : map.waypoints || [])) {
      const col = WP_COLOR[wp.type] ?? 0x333333;
      const g = wp.type === 'mountain'
        ? new THREE.ConeGeometry(headR * 1.4, headR * 3.2, 4)
        : new THREE.SphereGeometry(headR, 10, 8);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: col }));
      m.position.set(wp.x, this.h(wp.x, wp.y) + poleH + headR, wp.y);
      m.userData.wp = wp;
      out.push(m);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(U(2), U(2), poleH, 5),
        new THREE.MeshLambertMaterial({ color: 0xf0836c }));
      pole.position.set(wp.x, this.h(wp.x, wp.y) + poleH / 2, wp.y);
      out.push(pole);
    }
    for (const b of (map.bridges || [])) {
      const g = new THREE.BoxGeometry(U(70), U(3), U(16));
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xf0a58c }));
      m.position.set(b.x, this.h(b.x, b.y) + U(8), b.y);
      m.rotation.y = b.angle || 0;
      out.push(m);
    }
    return out;
  }

  // --------------------------------------------------------------- the hiker
  /**
   * How much the orbit view exaggerates its scenery.
   *
   * From across the park a 25 m pine is a third of a pixel, so out there the
   * scenery is deliberately oversized — the way a model railway lays lichen for
   * a wood. Zoom in and that exaggeration IS the scale problem: grass twenty
   * metres wide standing next to a man is not a landscape. So the boost falls
   * away to true size as the camera comes in.
   *
   * It is quantised, because changing it rebuilds the scene: without steps a
   * single spin of the wheel would rebuild sixty times.
   */
  orbitBoost(dist = this.orbit.dist) {
    const knob = Math.max(1, this.map?.world?.orbitBoost ?? 8);
    const NEAR = 0.06, FAR = 4.5;                   // cells: 300 m to 22 km
    // Zoom is multiplicative — a wheel tick is a percentage, not a distance —
    // so the ramp runs on the LOG of the distance. Linear in distance spent the
    // whole close half of the range pinned at 1 and then jumped.
    const t = Math.max(0, Math.min(1, Math.log(Math.max(dist, 1e-6) / NEAR) / Math.log(FAR / NEAR)));
    const want = 1 + (knob - 1) * t;
    const steps = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
    let best = steps[0];
    for (const v of steps) if (v <= knob + 1e-6 && Math.abs(v - want) < Math.abs(best - want)) best = v;
    return best;
  }

  /** The hiker's height in world units, at the boost the scene was built with. */
  hikerScale() {
    const m = (this.map?.world?.figureHeight ?? 1.8) * (this.map?.world?.figureScale ?? 1);
    return (m / this.mPerU) * (this.walk ? 1 : this.boost);
  }

  /** Stand him on the ground at wherever he is now. Hidden at eye level: the
   *  camera is inside his head there, and you would be looking at his jaw. */
  _placeHiker() {
    const ch = this.character;
    if (!ch || !this.hf) return;
    const p = this.hiker;
    [p.x, p.y] = this.clampToSheet(p.x, p.y);
    const sc = this.hikerScale();
    ch.root.visible = !this.walk;
    ch.root.position.set(p.x, this.h(p.x, p.y), p.y);
    ch.root.scale.setScalar(sc);
    ch.root.rotation.y = p.yaw;
  }

  /**
   * Send him to a point on the map.
   *
   * At his real pace a click across the park is a five-minute wait — one grid
   * square is five kilometres, and a man walks it in an hour. So short hops run
   * at true speed and long ones are compressed into a few seconds, with the
   * clip and its playback rate following the speed he is actually making, which
   * keeps his feet roughly on the ground either way.
   */
  walkTo(x, y) {
    const p = this.hiker;
    [x, y] = this.clampToSheet(x, y);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1e-5) return;
    const metres = d * this.mPerU;
    const TRUE = 3.4;                                   // m/s, a decent walking pace
    const secs = Math.max(0.5, Math.min(4, metres / TRUE));
    const mps = metres / secs;
    p.to = { x, y };
    p.speed = d / secs;                                 // cells per second
    p.yaw = Math.atan2(x - p.x, y - p.y);
    // above a jog he runs; the clip is sped up a little for a fast pace and
    // slowed for a stroll, but never enough to look like a wind-up toy
    const rate = Math.max(0.65, Math.min(2, mps / TRUE));
    this.character?.play(mps > 2.2 ? 'run' : 'walk', rate);
    this._loop();
  }

  /**
   * Turn a click into a point on the ground.
   *
   * Raycasting the terrain mesh rather than intersecting a flat plane, so a
   * click on a hillside lands on the hillside and not on the plain behind it.
   */
  pick(ev) {
    if (!this.ground) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.ground, false)[0];
    return hit ? { x: hit.point.x, y: hit.point.z } : null;
  }

  /**
   * The animation loop.
   *
   * The preview renders on demand — it is an editor, not a game — so this runs
   * only while something is actually moving, and stops itself when the hiker
   * settles back into idle. One more idle frame is drawn after he stops so the
   * cross-fade finishes.
   */
  _loop() {
    if (this._anim) return;
    const step = () => {
      const ch = this.character;
      if (!ch) { this._anim = null; return; }
      // Clamped so a stall does not teleport him across the park, but not so
      // tightly that a slow frame rate slows him down: at 0.05 a machine drawing
      // four frames a second walked him at a fifth speed.
      const dt = Math.min(0.25, this.clock.getDelta());
      const p = this.hiker;
      let busy = false;
      if (p.to) {
        const dx = p.to.x - p.x, dy = p.to.y - p.y;
        const d = Math.hypot(dx, dy);
        const stepLen = p.speed * dt;
        if (d <= stepLen) { p.x = p.to.x; p.y = p.to.y; p.to = null; }
        else { p.x += (dx / d) * stepLen; p.y += (dy / d) * stepLen; busy = true; }
      }
      if (!busy && ch.clip !== 'idle') ch.play('idle');
      this._placeHiker();
      if (this.walk) this._followCover();
      ch.update(dt);
      this._apply();
      this.renderer.render(this.scene, this.camera);
      // keep ticking a moment past the last step so the fade back to idle plays
      this._settle = busy ? 0 : (this._settle || 0) + dt;
      if (busy || this._settle < 0.45) this._anim = requestAnimationFrame(step);
      else { this._anim = null; this._settle = 0; }
    };
    this.clock.getDelta();
    this._settle = 0;
    this._anim = requestAnimationFrame(step);
  }

  /**
   * Swing the orbit camera down to the hiker.
   *
   * At true scale a man on a thirty-kilometre park is a ten-thousandth of the
   * view, so there is no finding him by eye — but standing next to him is the
   * only honest check that a pine is a pine and not a shrub.
   */
  gotoHiker() {
    const p = this.hiker;
    this.orbit.target.set(p.x, this.h(p.x, p.y), p.y);
    this.orbit.dist = 0.006;                 // about 30 m out
    this.orbit.pitch = 0.22;
    // always a rebuild: at this range the cover is a patch planted around where
    // you are looking, and you have just looked somewhere else
    if (this.kit) { this.rebuild(this.map, this.hf ? this.hf.res : undefined); return; }
    this.render();
  }

  /**
   * Re-plant the ground cover when the view leaves the patch it was planted in.
   *
   * Cheap to ask and expensive to get wrong in both directions: rebuild too
   * eagerly and a drag stutters, too late and you walk onto bare ground.
   */
  _followCover(force) {
    const was = this._coverAt, now = this.focus();
    const moved = (!was) !== (!now)
      || (was && now && Math.hypot(now.x - was.x, now.y - was.y) > 0.022);
    if (!moved && !force) return false;
    this.rebuild(this.map, this.hf ? this.hf.res : undefined);
    return true;
  }

  // -------------------------------------------------------------- camera
  /** Point the orbit camera at the whole map. Only on request. */
  frame() {
    const { cols, rows } = this.map.grid;
    this.orbit.target.set(cols / 2, this.h(cols / 2, rows / 2), rows / 2);
    this.orbit.dist = Math.max(cols, rows) * 1.3;
    this.orbit.yaw = -0.6; this.orbit.pitch = 0.72;
    this.render();
  }

  /**
   * Switch between orbiting the park and standing in it.
   *
   * There is one hiker and two cameras: `this.walk` is the same object as
   * `this.hiker` when you are behind his eyes, and null when you are above him.
   * So walking somewhere in one view is where you are in the other.
   */
  setWalk(on, at, res) {
    if (!on) { this.walk = null; this.rebuild(this.map, res); return; }
    if (at && at.x != null) { this.hiker.x = at.x; this.hiker.y = at.y; }
    this.hiker.yaw = this.orbit.yaw;
    this.hiker.eye = this.map.world.figureHeight ?? 1.8;
    this.walk = this.hiker;
    this.rebuild(this.map, res);
  }
  /**
   * How far towards "a model of a park" this view is: 0 standing in it, 1
   * looking at the whole thing. The same log ramp the scenery exaggeration
   * uses, so the light and the scale change together rather than fighting.
   */
  modelness() {
    if (this.walk) return 0;
    const NEAR = 0.06, FAR = 4.5;
    return Math.max(0, Math.min(1,
      Math.log(Math.max(this.orbit.dist, 1e-6) / NEAR) / Math.log(FAR / NEAR)));
  }

  _light() {
    const t = this.modelness();
    const e = t * t * (3 - 2 * t);          // hold daylight through the close half
    this.scene.background.lerpColors(SKY.near, SKY.far, e);
    this.scene.fog.color.lerpColors(HAZE.near, HAZE.far, e);
  }

  _apply() {
    this._light();
    // The game drives its own camera along one continuous zoom, from the map in
    // the walker's hands out to the whole park, which is neither this orbit nor
    // this eye-level rig. It takes the camera over rather than fighting them.
    // The mapper never sets this, so its two views are untouched.
    if (this.cameraOverride) {
      this.cameraOverride(this.camera, this);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.walk) {
      const w = this.walk;
      // his eyes, not an arbitrary 1.7: the figure standing in the orbit view
      // and the camera standing at eye level have to be the same person
      const eye = this.h(w.x, w.y)
        + ((this.map.world.figureHeight ?? 1.8) * 0.94) / this.map.world.metresPerCell;
      this.camera.position.set(w.x, eye, w.y);
      this.camera.lookAt(w.x + Math.sin(w.yaw), eye - 0.03, w.y + Math.cos(w.yaw));
      this.camera.fov = 68;
      this.camera.near = 0.0004;                      // ~1 m
      this.camera.far = 60;
      // in cell units: haze from 150 m, gone by 2 km — at 5 km to the square the
      // old 0.5..9 was 2.5 km to 45 km, which is no fog at all
      // Aerial perspective at the distance it actually happens: haze from about
      // half a kilometre, a hill thirty kilometres off gone into it. Fogging
      // everything past three kilometres turned every ridge into a cloud.
      const m = this.map.world.metresPerCell || 5000;
      this.scene.fog.near = 600 / m; this.scene.fog.far = 30000 / m;
    } else {
      const o = this.orbit;
      this.camera.position.set(
        o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
        o.target.y + Math.sin(o.pitch) * o.dist,
        o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
      this.camera.lookAt(o.target);
      this.camera.fov = 55;
      // Near plane and fog are both relative to how far out you are. A fixed
      // 0.05 near plane is 250 m on this map, which clips the whole park away
      // the moment you zoom in close enough to stand beside the hiker.
      this.camera.near = Math.max(1e-5, o.dist * 0.008);
      this.camera.far = Math.max(60, o.dist * 40);
      // Two fogs in one: far out it is atmospheric perspective on a model, and
      // it scales with how far out you are. Close in it is real haze at a real
      // distance — 150 m to 3 km — or a tree a hundred metres away goes navy.
      const m = this.mPerU || 5000;
      this.scene.fog.near = Math.max(600 / m, o.dist * 1.2);
      this.scene.fog.far = Math.max(30000 / m, o.dist * 9);
    }
    this.camera.updateProjectionMatrix();
  }

  _bindInput() {
    const c = this.canvas;
    // The mapper drives this view by clicking and dragging the canvas. The game
    // does not: it has its own gesture on the whole stage, and clicking the
    // ground to send the walker somewhere is not a thing the game has — where he
    // goes is a route drawn on the map and then walked. One flag rather than a
    // fork, so the mapper is untouched.
    const off = () => this.interactive === false;
    let drag = null;
    // capture can throw if the pointer has already gone (window switch, lost
    // focus); losing capture is never a reason to break the drag.
    const capture = (fn, id) => { try { fn.call(c, id); } catch { /* no live pointer */ } };
    c.addEventListener('pointerdown', (e) => {
      if (off()) return;
      drag = { x: e.clientX, y: e.clientY, b: e.button, x0: e.clientX, y0: e.clientY };
      capture(c.setPointerCapture, e.pointerId);
    });
    c.addEventListener('pointerup', (e) => {
      if (off()) return;
      // A click sends the hiker; a drag turns the camera. Four pixels of travel
      // is the line between them — orbiting with a trackpad always moves a
      // little, and having the walker set off every time you looked around is
      // the kind of helpfulness nobody asked for.
      if (drag && drag.b === 0 && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) {
        const at = this.pick(e);
        if (at) this.walkTo(at.x, at.y);
      }
      drag = null; capture(c.releasePointerCapture, e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (off()) return;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (this.walk) {
        this.walk.yaw -= dx * 0.006;
      } else if (e.shiftKey || drag.b === 2) {
        // Grab-the-world panning: the ground stays under the cursor. The rate
        // comes from the view frustum at the target's distance, and the vertical
        // term is divided by sin(pitch) because the ground is foreshortened —
        // so dragging up lifts the view up by the amount you actually dragged.
        const o = this.orbit;
        const vh = this.canvas.clientHeight || this.canvas.height || 1;
        const upp = (2 * o.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / vh;
        const sx = upp, sy = upp / Math.max(0.22, Math.sin(o.pitch));
        o.target.x -= dx * Math.cos(o.yaw) * sx + dy * Math.sin(o.yaw) * sy;
        o.target.z += dx * Math.sin(o.yaw) * sx - dy * Math.cos(o.yaw) * sy;
        if (this.kit && this._followCover()) return;
      } else {
        this.orbit.yaw -= dx * 0.006;
        this.orbit.pitch = Math.max(0.06, Math.min(1.45, this.orbit.pitch + dy * 0.005));
      }
      this.render();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      if (off()) return;
      e.preventDefault();
      if (this.walk) {
        const s = (-e.deltaY * 4) / this.map.world.metresPerCell;   // ~4 m per tick
        this.walk.to = null;                       // a wheel overrides a click
        [this.walk.x, this.walk.y] = this.clampToSheet(
          this.walk.x + Math.sin(this.walk.yaw) * s,
          this.walk.y + Math.cos(this.walk.yaw) * s);
        this.character?.play('walk');
        this._loop();
        // the ground cover is planted round where you were standing, so walking
        // out of that patch re-plants it rather than leaving you on bare ground
        const c = this._coverAt;
        if (c && Math.hypot(this.walk.x - c.x, this.walk.y - c.y) > 0.022) {
          this.rebuild(this.map, this.hf ? this.hf.res : undefined);
          return;
        }
      } else {
        const o = this.orbit;
        // 0.0015 cells is about seven metres — close enough to stand next to the
        // hiker and see how big a pine actually is.
        o.dist = Math.max(0.0015, Math.min(40, o.dist * (1 + e.deltaY * 0.0012)));
        // coming in far enough drops the scenery back to true size, which needs
        // a rebuild; the boost is stepped so this happens a handful of times
        if (this.kit && this._followCover(this.orbitBoost() !== this._builtBoost)) return;
      }
      this.render();
    }, { passive: false });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.render();
  }
  render() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      if (!this.hf) return;
      this._apply();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
