// sail-world.js — the open-sea 3D world for the sail mode (1b): sky, following water, fog,
// lazily built islands with towns/forts, a chunked shallows map and an exact land test.
import * as THREE from 'three';

export const VIEW_DIST = 900;    // islands (edge distance) closer than this are shown
const BUILD_DIST = 980;          // …and built a little before they come into view
const DROP_DIST = 1600;          // built islands further than this are disposed
const SH_SIZE = 1100, SH_RES = 128, SH_ROWS_PER_FRAME = 16;
export const FOG_NEAR = 260, FOG_FAR = 860;

/** Radial water grid: 3-unit rings near the ship, geometric growth out to the horizon. */
function ringGeometry(NA = 80) {
  const radii = [0]; let r = 0;
  while (r < 90) { r += 3; radii.push(r); }
  while (r < 1600) { r *= 1.09; radii.push(r); }
  const pos = [0, 0, 0], idx = [];
  for (let i = 1; i < radii.length; i++) for (let j = 0; j < NA; j++) { const a = j / NA * Math.PI * 2; pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]); }
  for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
  for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < NA; j++) {
    const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1700);
  return g;
}

const TOWN_R = { small: 9, medium: 13, large: 17 };
const SCATTER_CAP = { palms: 46, jungle: 60, rocks: 24 };
const SCATTER_CAP_LOW = { palms: 20, jungle: 26, rocks: 10 }; // performance mode
const SCATTER_NEAR = 160, SCATTER_FAR = 340; // full caps near, half caps mid, none beyond

/**
 * createSeaWorld(ctx, {x, z}) → world handle. `career` is used for town overrides (conquered nations).
 * Handle: { scene, root, water, sky, fx, update(px, pz, fx, fz), landAt(x,z), dispose(), islands }
 */
export function createSeaWorld(ctx, { x, z, career }) {
  const { PLT, world: W } = ctx;
  const scene = new THREE.Scene();
  const root = new THREE.Group(); root.name = 'sail_root'; scene.add(root);

  // ---- sky + fog
  const sky = PLT.sky.create('day');
  root.add(sky.root);
  const fogCol = new THREE.Color('#b6dcea');
  scene.fog = new THREE.Fog(fogCol, FOG_NEAR, FOG_FAR);
  scene.background = fogCol;

  // ---- water (PLT shader on our own radial grid, follows the ship)
  const low = !!(ctx.engine && ctx.engine.perf), CAPS = low ? SCATTER_CAP_LOW : SCATTER_CAP;
  const water = PLT.water.create({ size: 64, segments: 1 });
  const oldGeo = water.mesh.geometry; const waterGeo = ringGeometry(low ? 48 : 80);
  water.mesh.geometry = waterGeo; oldGeo.dispose();
  root.add(water.mesh);
  const U = water.material.uniforms;
  const mapTex = U.uMap.value, mapData = mapTex.image.data;

  // ---- fx
  const fx = PLT.fx.create(scene);

  // ---- islands (lazy)
  const built = new Map();   // blob.id → island group
  const townsByBlob = new Map();
  for (const t0 of W.TOWNS) {
    const b = W.coastInfo(t0.x, t0.z).blob; if (!b) continue;
    if (!townsByBlob.has(b.id)) townsByBlob.set(b.id, []);
    townsByBlob.get(b.id).push(t0);
  }
  function townLayout(t) {
    const R = TOWN_R[t.size] || 13;
    const face = Math.atan2(t.harbour.x - t.x, t.harbour.z - t.z); // town +Z (dock) faces the harbour
    const sx = Math.cos(face), sz = -Math.sin(face);               // perpendicular (to the town's side)
    const fx0 = t.x + sx * (R + 17) - Math.sin(face) * 6, fz0 = t.z + sz * (R + 17) - Math.cos(face) * 6;
    return { R, face, fort: { x: fx0, z: fz0 } };
  }
  function buildIsland(b) {
    const towns = townsByBlob.get(b.id) || [];
    const flatten = [];
    for (const t of towns) {
      const L = townLayout(t);
      flatten.push({ x: t.x - b.cx, z: t.z - b.cz, r: L.R + 9, h: 1.1 });
      flatten.push({ x: L.fort.x - b.cx, z: L.fort.z - b.cz, r: 15, h: 1.3 });
    }
    const g = PLT.terrain.island({ radius: b.r, height: b.height, seed: b.seed, biome: b.biome, flatten });
    g.position.set(b.cx, 0, b.cz);
    g.userData.blob = b;
    for (const t0 of towns) {
      const t = W.townInfo(t0, career), L = townLayout(t0);
      const town = PLT.props.town({ nation: t.nation, size: t0.size, seed: t0.seed });
      town.position.set(t0.x - b.cx, 1.05, t0.z - b.cz); town.rotation.y = L.face; g.add(town);
      const fort = PLT.props.fort({ nation: t.nation });
      fort.position.set(L.fort.x - b.cx, 1.25, L.fort.z - b.cz); fort.rotation.y = L.face; g.add(fort);
    }
    // scatter LOD: remember full instance counts, cap them (palms are the bulk of the triangles)
    g.userData.scatter = g.children.filter(o => o.isInstancedMesh && CAPS[o.name]).map(o => ({ im: o, full: o.count, cap: Math.min(o.count, CAPS[o.name]) }));
    root.add(g); built.set(b.id, g);
    return g;
  }
  const edgeDist = (b, px, pz) => Math.hypot(b.cx - px, b.cz - pz) - b.r;
  // Far islands are kept (hidden) instead of rebuilt next time you pass — building one is a hitch on a tablet.
  // Only when more than KEEP are built do the furthest beyond DROP_DIST get disposed.
  const KEEP = 26, far = [];
  function manageIslands(px, pz, maxBuild) {
    let todo = null, td = Infinity; far.length = 0;
    for (const b of W.ISLANDS) {
      const d = edgeDist(b, px, pz), g = built.get(b.id);
      if (g) {
        g.visible = d < VIEW_DIST;
        if (g.visible) for (const sc of g.userData.scatter) {
          sc.im.visible = d < SCATTER_FAR;
          sc.im.count = d < SCATTER_NEAR ? sc.cap : Math.ceil(sc.cap / 2);
        }
        if (d > DROP_DIST && built.size > KEEP) far.push([d, b.id]); // (no garbage in the usual case)
      } else if (d < BUILD_DIST && d < td) { td = d; todo = b; }
    }
    if (built.size > KEEP && far.length) {
      far.sort((x, y) => y[0] - x[0]);
      for (let i = 0; i < far.length && built.size > KEEP; i++) { const g = built.get(far[i][1]); g.dispose(); root.remove(g); built.delete(far[i][1]); } // PLT dispose frees geometries only — detach it too
    }
    if (todo && maxBuild > 0) { buildIsland(todo).visible = td < VIEW_DIST; return manageIslands(px, pz, maxBuild - 1); }
  }

  // ---- exact land test (matches the visible coast of built islands; circle fallback)
  function shallowOf(b, wx, wz) {
    const g = built.get(b.id);
    if (g) return g.userData.shallowAt(wx, wz);
    const f = Math.hypot(wx - b.cx, wz - b.cz) / b.r;
    return f <= 1 ? 1 : Math.max(0, 1 - (f - 1) / 0.65);
  }
  // town + fort pads count as land (they sit on flattened plateaus the island's own test doesn't know about)
  const pads = [];
  for (const t of W.TOWNS) { const L = townLayout(t); pads.push({ x: t.x, z: t.z, r: L.R + 6.5 }, { x: L.fort.x, z: L.fort.z, r: 13 }); }
  function padShallow(wx, wz) {
    let v = 0;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i], dx = wx - p.x, dz = wz - p.z; if (dx > 40 || dx < -40 || dz > 40 || dz < -40) continue;
      const f = Math.hypot(dx, dz) / p.r; const s = f <= 1 ? 1 : Math.max(0, 1 - (f - 1) * 1.2); if (s > v) v = s;
    }
    return v;
  }
  function shallowAt(wx, wz) {
    let v = padShallow(wx, wz);
    for (const b of W.ISLANDS) {
      const dx = wx - b.cx, dz = wz - b.cz, lim = b.r * 2.1;
      if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
      const s = shallowOf(b, wx, wz); if (s > v) { v = s; if (v >= 1) break; }
    }
    return v;
  }
  const landAt = (wx, wz) => shallowAt(wx, wz) >= 0.95;

  // ---- shallows map (chunked across frames)
  const staging = new Uint8Array(SH_RES * SH_RES);
  const sh = { cx: 1e9, cz: 1e9, row: -1, x0: 0, z0: 0, list: [] };
  function startShallow(cx, cz) {
    sh.cx = cx; sh.cz = cz; sh.row = 0; sh.x0 = cx - SH_SIZE / 2; sh.z0 = cz - SH_SIZE / 2;
    sh.list = W.ISLANDS.filter(b => Math.abs(b.cx - cx) < SH_SIZE / 2 + b.r * 2.1 && Math.abs(b.cz - cz) < SH_SIZE / 2 + b.r * 2.1);
  }
  function stepShallow(rows) {
    if (sh.row < 0) return;
    const step = SH_SIZE / SH_RES, list = sh.list;
    const end = Math.min(SH_RES, sh.row + rows);
    for (let j = sh.row; j < end; j++) {
      const wz = sh.z0 + (j + 0.5) * step;
      for (let i = 0; i < SH_RES; i++) {
        const wx = sh.x0 + (i + 0.5) * step; let v = padShallow(wx, wz);
        for (let k = 0; k < list.length; k++) {
          const b = list[k], dx = wx - b.cx, dz = wz - b.cz, lim = b.r * 2.1;
          if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
          const s = shallowOf(b, wx, wz); if (s > v) { v = s; if (v >= 1) break; }
        }
        staging[j * SH_RES + i] = v * 255;
      }
    }
    sh.row = end;
    if (end >= SH_RES) {
      for (let p = 0, o = 0; p < staging.length; p++, o += 4) { const v = staging[p]; mapData[o] = mapData[o + 1] = mapData[o + 2] = v; mapData[o + 3] = 255; }
      mapTex.needsUpdate = true; U.uMapRect.value.set(sh.x0, sh.z0, SH_SIZE, SH_SIZE); U.uHasMap.value = 1;
      sh.row = -1;
    }
  }
  let shAimX = 0, shAimZ = 0;

  // initial build: everything in view, shallows now
  manageIslands(x, z, 99);
  startShallow(x, z); stepShallow(SH_RES);

  const api = {
    scene, root, water, sky, fx, islands: built, landAt, shallowAt,
    /** Call each frame with the player position and forward vector. */
    update(px, pz, fwx, fwz, camera) {
      water.mesh.position.set(px, 0, pz);
      sky.update(camera);
      if (sky.clouds) sky.clouds.position.set(camera.position.x, 0, camera.position.z);
      manageIslands(px, pz, 1);
      // keep the shallows window ahead of the ship
      shAimX = px + fwx * 180; shAimZ = pz + fwz * 180;
      if (sh.row < 0 && Math.hypot(shAimX - sh.cx, shAimZ - sh.cz) > 170) startShallow(shAimX, shAimZ);
      stepShallow(SH_ROWS_PER_FRAME);
    },
    dispose() {
      try { fx.dispose(); } catch (e) { console.error(e); }
      for (const g of built.values()) { g.dispose(); root.remove(g); }
      built.clear();
      root.remove(water.mesh); water.dispose(); waterGeo.dispose();
      root.remove(sky.root); sky.dispose();
      for (const o of [...root.children]) { if (typeof o.dispose === 'function') o.dispose(); else ctx.engine.disposeTree(o); }
      scene.remove(root);
      scene.fog = null;
    },
  };
  return api;
}
