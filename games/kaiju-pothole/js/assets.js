// Kaiju Pothole asset loader. Reads the shared Ember Bay packs in games/_shared/assets.
// Every static model is baked into per-material geometry in its own local space (centred, feet at y=0)
// so the world can draw it with one InstancedMesh per part.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader();
let dropGz = false; // some hosts store the packs as plain .glb (still gzip bytes inside)

async function fetchBuf(url) {
  let r = dropGz ? null : await fetch(url).catch(() => null);
  if (!r || !r.ok) { const alt = url.replace(/\.gz$/, ''); if (alt !== url) { r = await fetch(alt); if (r.ok) dropGz = true; } }
  if (!r || !r.ok) throw new Error('missing ' + url);
  const ab = await r.arrayBuffer(), b = new Uint8Array(ab, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) return new Response(new Blob([ab]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return ab;
}
const json = url => fetch(url).then(r => r.json());
const parse = ab => loader.parseAsync(ab, '');

const KEEP = ['position', 'normal', 'uv'];
// tint: bake a flat material colour into a vertex colour so every untextured model can share one material
function clean(g, tint) {
  const src = g;
  g = g.index ? g.toNonIndexed() : g.clone();
  const out = new THREE.BufferGeometry();
  const n = g.attributes.position.count;
  for (const k of KEEP) {
    let a = g.attributes[k];
    if (!a) { if (k === 'normal') { g.computeVertexNormals(); a = g.attributes.normal; } else a = new THREE.BufferAttribute(new Float32Array(n * 2), 2); }
    out.setAttribute(k, toF32(a));
  }
  if (tint) {
    const col = new Float32Array(n * 3), vc = tint.vc && g.attributes.color;
    for (let i = 0; i < n; i++) { col[i * 3] = tint.c.r * (vc ? vc.getX(i) : 1); col[i * 3 + 1] = tint.c.g * (vc ? vc.getY(i) : 1); col[i * 3 + 2] = tint.c.b * (vc ? vc.getZ(i) : 1); }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return out;
}
const GET = ['getX', 'getY', 'getZ', 'getW'];
function toF32(a) {
  if (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) return a;
  const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[i * s + c] = a[GET[c]](i);
  return new THREE.BufferAttribute(arr, s);
}

// Materials are shared as widely as possible (each distinct material is one draw call for the whole town):
// untextured opaque → one vertex-coloured material; textured → one per texture + colour.
const matCache = new Map();
const FLAT = [new THREE.MeshLambertMaterial({ vertexColors: true, name: 'flat' }), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, name: 'flat2' })];
function lambert(m, shared) {
  if (shared) return [shared, null];
  const map = m.map || null, c = m.color ? m.color : new THREE.Color(1, 1, 1);
  if (!map && !m.transparent) return [FLAT[m.side === THREE.DoubleSide ? 1 : 0], { c, vc: !!m.vertexColors }];
  const key = (map ? (map.source && map.source.uuid) || map.uuid : 'n') + c.getHexString() + (m.transparent ? 't' + (m.opacity ?? 1) : '') + m.side;
  if (matCache.has(key)) return [matCache.get(key), null];
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  const l = new THREE.MeshLambertMaterial({ map, color: c.clone(), transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, name: m.name });
  matCache.set(key, l); return [l, null];
}

// root: object to bake; scene: its gltf scene (for world matrices). hint: index w/h/d (metres).
export function bake(root, hint, shared) {
  root.updateWorldMatrix(true, true);
  const byMat = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    if (mats.length > 1 && g.groups.length) {
      const ni = g.index ? g.toNonIndexed() : g;
      for (const gr of ni.groups) { const part = new THREE.BufferGeometry(), end = Math.min(gr.start + gr.count, ni.attributes.position.count);
        for (const k of [...KEEP, 'color']) { const a = ni.attributes[k]; if (!a) continue; const f = toF32(a); part.setAttribute(k, new THREE.BufferAttribute(f.array.slice(gr.start * f.itemSize, end * f.itemSize), f.itemSize)); }
        if (part.attributes.position && part.attributes.position.count) { const [mt, tint] = lambert(mats[gr.materialIndex] || mats[0], shared); push(byMat, mt, clean(part, tint)); } }
    } else { const [mt, tint] = lambert(mats[0], shared); push(byMat, mt, clean(g, tint)); }
  });
  const parts = [];
  for (const [material, geos] of byMat) { let geometry = geos.length > 1 ? mergeGeometries(geos, false) : geos[0]; if (geometry) { geometry = mergeVertices(geometry, 1e-4); parts.push({ geometry, material }); } }
  if (!parts.length) return null;
  const box = new THREE.Box3(); parts.forEach(p => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let s = 1;
  if (hint && hint.h > 0.05 && size.y > 0.001) { const r = hint.h / size.y; if (r > 2 || r < 0.5) s = r; }
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  parts.forEach(p => { p.geometry.applyMatrix4(m); p.geometry.computeBoundingSphere(); });
  return { parts, w: size.x * s, h: size.y * s, d: size.z * s };
}
function push(map, k, v) { (map.get(k) || map.set(k, []).get(k)).push(v); }

// Ground tiles from LowPoly City that make no sense to swallow (the roads are drawn by the world itself).
const GROUNDISH = /^(road_|green_a|land|landscape|sand_a|bridge_a)/;

export async function loadStatic(base, onStep) {
  const tex = await new THREE.TextureLoader().loadAsync(base + 'city-palette-1024.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
  const palette = new THREE.MeshLambertMaterial({ map: tex, name: 'city_palette' });
  const models = {};
  const index = await json(base + 'city-assets-index.json');
  await Promise.all(['buildings', 'ground', 'vehicles', 'props', 'nature'].map(async cat => {
    const g = await parse(await fetchBuf(base + 'city-' + cat + '.glb.gz'));
    const byName = {}; g.scene.traverse(o => { if (o.isMesh) byName[o.name] = o; });
    for (const e of index.filter(e => e.cat === cat)) {
      const o = byName[e.id]; if (!o || GROUNDISH.test(e.base)) continue;
      const b = bake(o, e, palette); if (b) models[e.id] = { id: e.id, name: e.base.replace(/_/g, ' '), cat, src: 'lowpoly', ...b };
    }
    onStep && onStep();
  }));
  await Promise.all(['buildings', 'vehicles', 'props', 'vehicles2', 'air', 'kit'].map(async c => {
    try {
      const [list, g] = await Promise.all([json(base + 'extra-' + c + '.json'), fetchBuf(base + 'extra-' + c + '.glb.gz').then(parse)]);
      const byName = {}; g.scene.traverse(o => { if (o.name && !byName[o.name]) byName[o.name] = o; });
      for (const e of list) { const o = byName[e.id]; if (!o) continue; const b = bake(o, e); if (b) models[e.id] = { id: e.id, name: e.name || e.id, cat: e.cat, src: e.src, ...b }; }
    } catch (err) { console.warn('pack ' + c, err); }
    onStep && onStep();
  }));
  return models;
}

export async function loadHazards(base) {
  const list = await json(base + 'hazards/index.json'), out = {};
  await Promise.all(list.map(async e => { const g = await parse(await fetchBuf(base + e.file)); const b = bake(g.scene, e); if (b) out[e.id] = { id: e.id, name: e.name, cat: 'hazards', src: 'hazards', hazard: true, ...b }; }));
  return out;
}

const roomCache = {};
export async function loadRoom(base, id) {
  if (roomCache[id]) return roomCache[id];
  const list = await json(base + 'interiors/index.json'), e = list.find(r => r.id === id);
  const g = await parse(await fetchBuf(base + e.file)), scene = g.scene;
  // some rooms are modelled at 45°: find the yaw that gives the tightest floor rectangle and square them up
  scene.updateWorldMatrix(true, true);
  const pts = [], v = new THREE.Vector3();
  scene.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 600)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, v.z, v.y); } });
  let best = 0, area = Infinity;
  for (let a = 0; a < 90; a += 1) { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 3) { const x = pts[i] * c - pts[i + 1] * s, z = pts[i] * s + pts[i + 1] * c; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const ar = (x1 - x0) * (z1 - z0); if (ar < area - 1e-6) { area = ar; best = r; } }
  best += (FLIP[id] || 0);
  const spin = new THREE.Group(); spin.rotation.y = -best; spin.add(scene); spin.updateWorldMatrix(true, true);
  // the floor = the lowest layer of vertices; centre the room on it (beams and shelves overhang)
  let y0 = 1e9; for (let i = 2; i < pts.length; i += 3) y0 = Math.min(y0, pts[i]);
  const fc = Math.cos(best), fs = Math.sin(best); let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9;
  for (let i = 0; i < pts.length; i += 3) { if (pts[i + 2] > y0 + 0.12) continue; const x = pts[i] * fc - pts[i + 1] * fs, z = pts[i] * fs + pts[i + 1] * fc; fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fz0 = Math.min(fz0, z); fz1 = Math.max(fz1, z); }
  const box = new THREE.Box3().setFromObject(spin), c = box.getCenter(new THREE.Vector3());
  const fw = fx1 - fx0, fd = fz1 - fz0, ok = fw > 1.5 && fd > 1.5 && fw < 20;
  const fl = ok ? new THREE.Vector3((fx0 + fx1) / 2, 0, (fz0 + fz1) / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0) : c;
  spin.position.set(-(ok ? fl.x : c.x), -box.min.y, -(ok ? fl.z : c.z));
  const wrap = new THREE.Group(); wrap.add(spin); wrap.name = id;
  wrap.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  return (roomCache[id] = { scene: wrap, w: ok ? fw : Math.min(box.max.x - box.min.x, e.w), d: ok ? fd : Math.min(box.max.z - box.min.z, e.d), name: e.name });
}
const FLIP = { room_blue_bedroom: Math.PI };
export const roomList = base => json(base + 'interiors/index.json');

// Skinned characters: people (with index `fix`) and animals. Returns { list, get(id) → {scene, clips} }.
export async function loadSkinned(base, dir, ids) {
  const list = (await json(base + dir + '/index.json')).filter(e => !ids || ids.includes(e.id)), out = {};
  await Promise.all(list.map(async e => {
    try {
      const g = await parse(await fetchBuf(base + e.file));
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) { if ('metalness' in m) m.metalness = 0; } } });
      mergeSkinned(g.scene);
      if (e.fix) { g.scene.scale.multiplyScalar(e.fix.s); g.scene.position.set(e.fix.x, e.fix.y, e.fix.z); }
      const scene = new THREE.Group(); scene.add(g.scene); scene.name = e.id;
      out[e.id] = { scene, clips: g.animations, entry: e };
    } catch (err) { console.warn('skinned ' + e.id, err); }
  }));
  return { list: list.filter(e => out[e.id]), get: id => out[id] };
}

// From Ember Bay's city-assets.js: merge a character's flat-coloured skinned parts into one draw call.
function mergeSkinned(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material; if (m.map || m.transparent || Object.keys(o.geometry.morphAttributes).length) return;
    const key = o.parent.uuid + '|' + o.skeleton.bones.map(b => b.uuid).join() + '|' + o.bindMatrix.elements.map(v => v.toFixed(5)).join() + '|' + o.matrix.elements.map(v => v.toFixed(5)).join();
    push(groups, key, o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const K = ['position', 'normal', 'skinIndex', 'skinWeight'];
    const geos = list.map(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), out = new THREE.BufferGeometry();
      for (const k of K) { const a = g.attributes[k]; if (!a) return null; const n = a.count * a.itemSize, arr = k === 'skinIndex' ? new Uint16Array(n) : new Float32Array(n);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
        out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize)); }
      const col = new Float32Array(out.attributes.position.count * 3), c = o.material.color || new THREE.Color(1, 1, 1);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
    });
    if (geos.some(g => !g)) continue;
    const geo = mergeGeometries(geos, false); if (!geo) continue;
    const first = list[0];
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: list.some(o => o.material.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide }));
    mesh.name = first.name; mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
    mesh.castShadow = true; mesh.frustumCulled = false;
    first.parent.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(first.skeleton, first.bindMatrix);
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
  }
}
