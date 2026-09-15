/* level.js — the park, read straight out of the glTF.
 *
 * The original's whole level pipeline is a naming convention (README, and
 * Scripts/Editor/park_import.gd): a node called `<Thing>_Col_Floor` becomes a
 * floor collider, `_Col_Wall` a wall, `_Col_Ride` a wall you can wallride,
 * `_Col_Pipe` the inside of a bowl, and
 * `<Thing>_Rail_A` is a Blender polyline that becomes a grindable Path3D with a
 * 5 cm red bar extruded along it, and `_Glass_NNN` is one sheet of window you
 * can put a board through. `_Mesh` is just something to look at.
 *
 * That convention survives export, so this file reads the same names off the
 * glTF and gets the same park — no hand-placed geometry, no level format.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PathCurve } from './paths.js';
import { World } from './physics.js';

const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _d3 = new THREE.Vector3();

/* How far down a converted THPS level's baked vertex colour is scaled before
   the scene's lights are applied to it. See the note in add(). */
const THPS_EXPOSURE = 0x8c8c8c;
/* A textured face is already carrying its own detail and its baked shade on
   top, so it needs pulling down further than a bare vertex-coloured one. */
const THPS_TEX_EXPOSURE = 0xe8e8e8;

/* Assets/Materials/M_path.tres */
const RAIL_COLOUR = 0xd00005;
/* The red tube drawn along a grindable edge. Half what it was: at 0.05 the
   tube read as a pipe bolted to the ledge rather than a marked edge, and with
   the rail count up by a third after the .trg chaining fix the parks were
   getting stripy. The collider is the path, not this, so the size is purely
   how loudly the edge announces itself. */
const RAIL_SIDE = 0.025;

/**
 * Godot's StandardMaterial3D with uv1_triplanar = true: the grid texture is
 * projected down all three world axes and blended by the normal, which is why
 * the bowl's squares stay square as the surface curves over.
 */
export function triplanarMaterial(map, { doubleSide = false } = {}) {
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map, roughness: 0.92, metalness: 0.0,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: 0.125 };  // 8 squares to the 1024 tile
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriPos;
        varying vec3 vTriNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTriNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTriScale;
        varying vec3 vTriPos;
        varying vec3 vTriNrm;
        vec4 triplanar(sampler2D t, vec3 p, vec3 n) {
          vec3 b = pow(abs(n), vec3(4.0));
          b /= max(b.x + b.y + b.z, 1e-4);
          return texture2D(t, p.zy) * b.x
               + texture2D(t, p.xz) * b.y
               + texture2D(t, p.xy) * b.z;
        }`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = triplanar(map, vTriPos * uTriScale, normalize(vTriNrm));
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'triplanar';
  mat.userData.shared = true;   // outlives every level; never disposed with one
  return mat;
}

function railMaterial() {
  return new THREE.MeshStandardMaterial({ color: RAIL_COLOUR, roughness: 0.5, metalness: 0.1 });
}

/* The ordered vertices of a glTF LINES primitive. Blender's polyline export
   keeps them in order, which is the whole reason the README insists on the
   geometry-nodes clean-up step. */
function polylinePoints(mesh) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  const out = [];
  const seen = new Set();
  const push = (i) => {
    if (seen.has(i)) return;
    seen.add(i);
    out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  };
  if (idx) {
    for (let i = 0; i < idx.count; i++) push(idx.getX(i));
  } else {
    for (let i = 0; i < pos.count; i++) push(i);
  }
  /* a closed loop comes back with its first index repeated at the end; PathCurve
     detects that from the geometry, so hand it the raw run plus the wrap point */
  if (idx && idx.count >= 2 && idx.getX(idx.count - 1) === idx.getX(0) && out.length > 2) {
    out.push(out[0].clone());
  }
  return out;
}

export class Level {
  static _foliage = new Map();
  static _canvas = null;

  constructor() {
    this.root = new THREE.Group();
    this.world = new World();
    this.paths = [];
    /* centroids of everything the level DRAWS, on a coarse grid — finish() uses
       them to tell collision that smooths real geometry from collision that
       hangs in the air. See World.dropUndrawnFloors. */
    this.drawn = new Map();
    /* the panes, by the id their collision triangles carry. See Glass. */
    this.glass = [];
    this.spawn = { position: new THREE.Vector3(0, 0.1, 0), heading: 0 };
  }

  /**
   * Walk a loaded glTF scene and sort every node by the naming convention.
   * @param {THREE.Object3D} src  the gltf.scene (or an instance of it)
   * @param {object} mats  { grey } the shared triplanar grid material
   */
  add(src, mats, transform, opts = {}) {
    const holder = new THREE.Group();
    if (transform) holder.applyMatrix4(transform);
    holder.add(src);
    this.root.add(holder);
    holder.updateMatrixWorld(true);

    const rails = [];
    const glass = [];
    const foliage = [];        // crossed AFTER the walk: adding to a node mid-traverse revisits it
    src.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isLineSegments) return;
      const name = o.name || '';
      o.castShadow = false;
      o.receiveShadow = true;

      if (/_Rail_/.test(name)) { rails.push(o); o.visible = false; return; }

      /* A pane is solid AND drawn — the one node in the format that is both.
         It goes into collision as a wall like any other, tagged with an id so
         the whole sheet can be taken out in one go, and it keeps its mesh so
         there is something to see until it is. */
      if (/_Glass_/.test(name)) { glass.push(o); }

      /* `_Col_Ride` is a wall in every way that matters to the physics — you
         cannot pass through it and it is not a floor — so it goes in as one.
         The only thing the name adds is that the original marked it
         WALLRIDEABLE, which is what the wallride state looks for. */
      const isRide = /_Col_Ride/.test(name);
      const isWall = isRide || /_Col_Wall/.test(name);
      const isFloor = /_Col_Floor/.test(name);
      const isPipe = /_Col_Pipe/.test(name);

      if (isWall || isFloor || isPipe) {
        this.world.addMesh(o, isWall ? 'wall' : isPipe ? 'pipe' : 'floor', null, isRide);
        /* Godot keeps the collision meshes visible in the bowl park — they ARE
           the park. Walls are invisible fences, so they stay hidden.
           A converted THPS level is different: its colliders are buckets sorted
           out of the original's per-polygon surface flags, and the thing you
           look at is a separate _Mesh carrying the game's own vertex lighting.
           Drawing both would z-fight every surface in the park. */
        o.visible = opts.hideColliders ? false : !isWall;
        /* In the debug parks the colliders ARE the scenery, so they vouch for
           themselves; in a converted level they are hidden and the separate
           _Mesh does the vouching. */
        if (o.visible) this._noteDrawn(o);
      } else if (o.isMesh && o.visible) {
        this._noteDrawn(o);
      }

      /* Baked vertex colour is the whole look of a PS1-era level — throw the
         triplanar grid over it and you get a grey soup instead of a warehouse.
         But the colour already IS the lighting: the PS1 had no lights, it had a
         number per vertex that an artist or a tool baked. Feed that into a lit
         material and it gets lit twice, which is survivable in the Warehouse
         (median shade 50 of 255) and destroys Venice Beach (median 124, half
         its faces at or above the PS1's full brightness) — the whole level
         turns white. THPS_EXPOSURE scales the baked colour back down so that
         after the scene's lights it lands about where the artist put it, while
         still picking up the sun's direction and the skater's shadow. */
      if (opts.vertexColours && o.isMesh && o.geometry.attributes.color) {
        /* Keep whatever texture the glTF brought with it. Most of the park now
           arrives as ONE mesh reading ONE atlas (see below); what is left with
           an image of its own is the cutouts, which tile with a REPEAT sampler
           exactly as they always did. */
        const map = o.material && o.material.map ? o.material.map : null;
        const atlas = !!o.geometry.attributes._tileorigin;
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 4;
          /* a PS1 texture is 64 pixels across; smooth it and it turns to soup */
          map.magFilter = THREE.NearestFilter;
          if (atlas) {
            /* the sheet must not wrap or mip: the shader does the wrapping, and
               a mip chain would blend one tile into the next as it shrinks */
            map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
            map.minFilter = THREE.LinearFilter;
            map.generateMipmaps = false;
            map.needsUpdate = true;
          }
        }
        o.material = new THREE.MeshStandardMaterial({
          map, vertexColors: true, color: map ? THPS_TEX_EXPOSURE : THPS_EXPOSURE,
          roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
          transparent: false, alphaTest: map ? 0.5 : 0
        });
        if (atlas) this._atlasMaterial(o);
        /* The level's own shadowing is already baked into its vertex colours,
           and with a material per texture, casting would double the draw calls
           for nothing. It still RECEIVES the skater's shadow. */
        o.castShadow = false;
        o.receiveShadow = true;
        if (map && this._isFoliage(map)) foliage.push(o);
        return;
      }

      if (o.visible && o.isMesh) o.material = mats.grey;
    });

    for (const o of foliage) this._fixFoliage(o);

    /* Panes, after the walk — each one a collider the physics can retire and a
       mesh the renderer can hide, joined by an id.
     *
     * A pane keeps its own texture rather than joining the atlas, because the
     * texture IS the window: frame, glazing bars, and in the Warehouse the
     * panes the level ships already broken, jagged edge and all. Tinted flat
     * instead it read as a grey rectangle. What this adds is the transparency
     * the PS1 could not afford — alphaTest punches out the cut-out panes, and
     * the rest sits just under full opacity so you can see the room behind it
     * and tell at a glance it is glass. */
    for (const o of glass) {
      const id = this.glass.length;
      this.world.addMesh(o, 'wall', null, false, id);
      const map = o.material && o.material.map ? o.material.map : null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = THREE.NearestFilter;
        map.anisotropy = 4;
      }
      o.material = new THREE.MeshStandardMaterial({
        map,
        color: map ? THPS_TEX_EXPOSURE : 0xbfe0ee,
        vertexColors: !!o.geometry.attributes.color,
        transparent: true, opacity: map ? 0.86 : 0.30, alphaTest: map ? 0.4 : 0,
        roughness: 0.08, metalness: 0.0,
        side: THREE.DoubleSide, depthWrite: false
      });
      o.castShadow = false;
      o.receiveShadow = true;
      o.renderOrder = 2;          // after the opaque park, or it sorts oddly
      this.glass.push({ id, mesh: o });
    }

    /* One mesh for every rail in the park.
     *
     * They all wear the same red and carry no texture, so there was never a
     * reason for them to be separate — and with the chaining fix there are now
     * 125 of them in School II and 152 in Downtown, which was more draw calls
     * than the entire level. Merged, they are one. */
    const tubes = [];
    for (const r of rails) {
      const pts = polylinePoints(r);
      if (pts.length < 2) continue;
      const curve = new PathCurve(pts, r.name);
      this.paths.push(curve);
      tubes.push(this._railGeometry(curve));
    }
    if (tubes.length) {
      const mesh = new THREE.Mesh(mergeGeometries(tubes), railMaterial());
      mesh.castShadow = false;
      mesh.name = 'Rails_CSG';
      this.root.add(mesh);
    }
    return this;
  }

  /* rail_csg.gd: a 5 cm square section extruded along the curve. */
  _railGeometry(curve) {
    const pts = curve.closed ? curve.points.concat([curve.points[0]]) : curve.points;
    const path = new THREE.CatmullRomCurve3(pts.map((p) => p.clone()), curve.closed, 'catmullrom', 0.0);
    const seg = Math.max(8, Math.min(600, Math.round(curve.length * 4)));
    return new THREE.TubeGeometry(path, seg, RAIL_SIDE * 0.72, 4, curve.closed);
  }


  /**
   * Is this texture foliage?
   *
   * A tree crown in these levels is a cut-out: mostly transparent, and what is
   * left is leaves. Measured over every cut-out texture in a level the two
   * populations do not overlap — Venice's palm fronds are 97% green over their
   * opaque pixels and every other cut-out there is 0%; the School's three
   * foliage textures are 100%, 92% and 68% and the next one down is 24%. So the
   * test is simply "mostly green, and mostly holes", and a fence, a railing or a
   * cut-out sign never qualifies.
   */
  /**
   * Make one texture out of two hundred.
   *
   * The converter packs a level's textures onto a single sheet and hands every
   * vertex the rect its own texture landed on. A sampler cannot tile inside a
   * rect, so the shader does it: fract(uv) is exactly what GL_REPEAT computes,
   * and scaling that into the tile gives real tiling from a shared image.
   *
   * The seam is why each tile carries a one-texel border holding its own
   * opposite edge — at fract(u) = 0 the bilinear filter reads one texel to the
   * left, and that texel has to be the right-hand edge of the same texture or
   * every tiling face gets a bright line down it.
   *
   * The glTF names the attributes _TILEORIGIN and _TILESIZE, which three lower-
   * cases; they are re-registered under the names the shader declares, because
   * three binds attributes by looking them up in geometry.attributes by name.
   */
  _atlasMaterial(mesh) {
    const g = mesh.geometry;
    if (g.attributes._tileorigin) g.setAttribute('aTileOrigin', g.attributes._tileorigin);
    if (g.attributes._tilesize) g.setAttribute('aTileSize', g.attributes._tilesize);
    if (!g.attributes.aTileOrigin || !g.attributes.aTileSize) return;

    mesh.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 aTileOrigin;
          attribute vec2 aTileSize;
          varying vec2 vTileOrigin;
          varying vec2 vTileSize;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vTileOrigin = aTileOrigin;
          vTileSize = aTileSize;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vTileOrigin;
          varying vec2 vTileSize;`)
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec2 tiled = fract(vMapUv);
            vec4 sampledDiffuseColor = texture2D(map, vTileOrigin + tiled * vTileSize);
            diffuseColor *= sampledDiffuseColor;
          #endif`);
    };
    /* one program for the whole park, not one per mesh */
    mesh.material.customProgramCacheKey = () => 'thpsAtlas';
    mesh.material.needsUpdate = true;
  }

  _isFoliage(map) {
    if (!map || !map.image) return false;
    if (Level._foliage.has(map.image)) return Level._foliage.get(map.image);
    let out = false;
    try {
      const im = map.image;
      const cv = Level._canvas || (Level._canvas = document.createElement('canvas'));
      cv.width = im.width; cv.height = im.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0, solid = 0, green = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) { clear++; continue; }
        solid++;
        if (d[i + 1] >= d[i] * 1.05 && d[i + 1] >= d[i + 2] * 1.05) green++;
      }
      out = clear / (cv.width * cv.height) > 0.2 && solid > 0 && green / solid > 0.55;
    } catch (e) { out = false; }
    Level._foliage.set(map.image, out);
    return out;
  }

  /**
   * Put the leaves back.
   *
   * THPS draws a tree crown as a sprite: the model stores the frond as a line
   * and the engine hangs a camera-facing quad of its own size on it. Exported
   * as plain geometry that line is all you get — measured on Venice's palms,
   * every frond triangle is 3.6 metres long, 10 centimetres tall and 10 wide,
   * average area a third of a square metre. On screen that is a bare trunk with
   * a dark spike where the crown should be, which is exactly what Dan saw.
   *
   * Two things bring them back. First give the sliver its height, taken from
   * the shape of its own texture: a 128x32 frond is four times as long as it is
   * tall, so a 3.6 m frond should stand 0.9 m, and the number comes from the
   * art rather than from me picking one. Then cross a second copy over the
   * first, turned 90 degrees about the vertical through that crown, so the tree
   * reads from every direction instead of vanishing edge-on — which is what the
   * original's turning-to-face achieves, for one copy of a handful of triangles
   * once instead of work per tree per frame.
   */
  _fixFoliage(mesh) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos || pos.count < 3) return;

    /* group the triangles into crowns — one mesh holds every tree in the level
       that shares a texture, and treating them as one would plant them all in
       the sea */
    const CELL = 4;
    const crowns = new Map();
    const key = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { x += pos.getX(i + k); y += pos.getY(i + k); z += pos.getZ(i + k); }
      x /= 3; y /= 3; z /= 3;
      const k = Math.round(x / CELL) + ',' + Math.round(y / CELL) + ',' + Math.round(z / CELL);
      key.push(k);
      let e = crowns.get(k);
      if (!e) { e = { x: 0, y: 0, z: 0, n: 0, lo: Infinity, hi: -Infinity, span: 0 }; crowns.set(k, e); }
      e.x += x; e.y += y; e.z += z; e.n++;
      for (let k2 = 0; k2 < 3; k2++) {
        const vy = pos.getY(i + k2);
        e.lo = Math.min(e.lo, vy); e.hi = Math.max(e.hi, vy);
      }
      /* how long the frond is, across the ground */
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k2 = 0; k2 < 3; k2++) {
        const vx = pos.getX(i + k2), vz = pos.getZ(i + k2);
        minX = Math.min(minX, vx); maxX = Math.max(maxX, vx);
        minZ = Math.min(minZ, vz); maxZ = Math.max(maxZ, vz);
      }
      e.span = Math.max(e.span, Math.max(maxX - minX, maxZ - minZ));
    }
    for (const e of crowns.values()) { e.x /= e.n; e.y /= e.n; e.z /= e.n; }

    const im = mesh.material.map.image;
    const aspect = im && im.height ? im.width / im.height : 4;

    /* Inflate each frond, not each crown. A crown is several fronds at
       different heights, so its own vertical extent looks healthy while every
       triangle in it is a 10 cm sliver — measuring the crown was the first
       version of this and it did nothing at all. Both triangles of a quad span
       the same heights, so scaling each about its own middle keeps them
       joined. */
    let inflated = 0;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      let lo = Infinity, hi = -Infinity;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vy = pos.getY(i + k), vx = pos.getX(i + k), vz = pos.getZ(i + k);
        lo = Math.min(lo, vy); hi = Math.max(hi, vy);
        minX = Math.min(minX, vx); maxX = Math.max(maxX, vx);
        minZ = Math.min(minZ, vz); maxZ = Math.max(maxZ, vz);
      }
      const span = Math.max(maxX - minX, maxZ - minZ);
      const want = span / Math.max(1, aspect);
      const have = hi - lo;
      if (have >= want * 0.6 || span < 0.2) continue;
      const mid = (lo + hi) * 0.5, k = want / Math.max(0.02, have);
      for (let v = 0; v < 3; v++) pos.setY(i + v, mid + (pos.getY(i + v) - mid) * k);
      inflated++;
    }
    if (inflated) {
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }

    /* and stand a copy across it */
    const copy = geo.clone();
    const cp = copy.attributes.position;
    for (let i = 0; i + 2 < cp.count; i += 3) {
      const e = crowns.get(key[i / 3]);
      if (!e) continue;
      for (let k = 0; k < 3; k++) {
        const px = cp.getX(i + k), py = cp.getY(i + k), pz = cp.getZ(i + k);
        cp.setXYZ(i + k, e.x + (pz - e.z), py, e.z - (px - e.x));
      }
    }
    cp.needsUpdate = true;
    copy.computeVertexNormals();
    const cross = new THREE.Mesh(copy, mesh.material);
    cross.name = mesh.name + '_Cross';
    cross.castShadow = false;
    cross.receiveShadow = mesh.receiveShadow;
    mesh.add(cross);
  }

  /**
   * Remember roughly where this mesh puts pixels on the screen. One centroid per
   * triangle on a 1.5 m grid, which is as much resolution as finish() needs to
   * ask "is anything drawn near here?" and cheap enough to build while the level
   * is being assembled anyway.
   */
  _noteDrawn(mesh) {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;
    const idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;
    const m = mesh.matrixWorld;
    const a = _d1, b = _d2, c = _d3;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      /* SPREAD THE SAMPLES OVER THE FACE. One centroid per triangle was the
         first version of this and it made the filter downstream delete real
         floor: a warehouse floor drawn as two enormous triangles registers as
         two dots, so a collider five metres from either of them looks like it
         has nothing under it. Measured, that dropped the skater through visible
         ground on 82 of 720 spots. Big faces now leave a trail of samples
         across themselves and the number is back to single figures. */
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5;
      const n = Math.max(1, Math.min(8, Math.round(Math.sqrt(area) / 1.5)));
      for (let p = 0; p <= n; p++) {
        for (let q = 0; p + q <= n; q++) {
          const s2 = (p + 0.33) / (n + 1), t2 = (q + 0.33) / (n + 1);
          const x = a.x + ux * s2 + vx * t2;
          const y = a.y + uy * s2 + vy * t2;
          const z = a.z + uz * s2 + vz * t2;
          const k = Math.floor(x / 1.5) + ',' + Math.floor(y / 1.5) + ',' + Math.floor(z / 1.5);
          let l = this.drawn.get(k);
          if (!l) { l = []; this.drawn.set(k, l); }
          l.push(x, y, z);
        }
      }
    }
  }

  finish() {
    this.world.dropUndrawnFloors(this.drawn);
    this.drawn.clear();
    this.world.build();
    return this;
  }

  /** Give the GPU its memory back before another level is built. */
  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isLineSegments) return;
      if (o.geometry) o.geometry.dispose();
      /* the two triplanar park materials are shared and outlive every level */
      const m = o.material;
      if (m && !m.userData.shared) {
        if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose();
      }
    });
    this.paths.length = 0;
  }
}
