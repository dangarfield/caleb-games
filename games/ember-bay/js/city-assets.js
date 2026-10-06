// Loads the converted packs:
//  - LowPoly City (assets/city-*.glb.gz): one mesh per model, shared palette texture.
//  - Extras (assets/extra-*.glb.gz): SimplePoly City, Rgsdev vehicles, FBX building pack. One group per model, own materials.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CATS = ['buildings', 'ground', 'vehicles', 'props', 'nature'];
export const EXTRA = ['buildings', 'vehicles', 'props', 'vehicles2', 'air', 'kit'];
export const SOURCES = { kit: 'Blaze kit (made here)', lowpoly: 'LowPoly City', simplepoly: 'SimplePoly City', rgsdev: 'Rgsdev vehicles (CC0)', fbxpack: 'FBX building pack', cartoon: 'Cartoon cars', boats: 'PolyPack boats', quaternius: 'Quaternius animals (CC0)', antonmoek: 'Lowpoly helicopter', drone: 'Drone LVL2' };
let cache = null;

async function gunzip(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

export function loadCityAssets(base = '../_shared/assets/') {
  if (cache) return cache;
  cache = (async () => {
    const tex = await new THREE.TextureLoader().loadAsync(base + 'city-palette-1024.jpg');
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
    const material = new THREE.MeshLambertMaterial({ map: tex, name: 'city_palette' });
    const index = (await (await fetch(base + 'city-assets-index.json')).json()).map(e => ({ ...e, src: 'lowpoly' }));
    const meshes = {};
    const loader = new GLTFLoader();
    await Promise.all(CATS.map(async c => {
      const gltf = await loader.parseAsync(await gunzip(base + 'city-' + c + '.glb.gz'), '');
      gltf.scene.traverse(o => { if (o.isMesh) { o.material = material; meshes[o.name] = o; } });
    }));
    const extras = await Promise.all(EXTRA.map(async c => {
      try {
        const [list, gltf] = await Promise.all([fetch(base + 'extra-' + c + '.json').then(r => r.json()), gunzip(base + 'extra-' + c + '.glb.gz').then(b => loader.parseAsync(b, ''))]);
        const byName = {}; gltf.scene.traverse(o => { if (o.name && !o.isMesh) byName[o.name] = o; });
        for (const e of list) {
          const g = byName[e.id]; if (!g) continue;
          g.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshLambertMaterial({ map: o.material.map || null, color: o.material.color, name: o.material.name }); if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
          g.userData.parts = []; g.traverse(o => o.isMesh && g.userData.parts.push(o));
          meshes[e.id] = g;
        }
        return list.map(e => ({ ...e, base: e.id }));
      } catch (err) { console.warn('extra pack ' + c + ' missing', err); return []; }
    }));
    extras.forEach(l => index.push(...l));
    // Heavy meshes are simplified offline now (tools/slim-packs.mjs), not at load.
    return { THREE, index, meshes, material };
  })();
  return cache;
}

// Parts to instance for a model: [{geometry, material}] (single mesh or a group of meshes).
export function partsOf(m) {
  if (!m) return [];
  if (m.isMesh) return [{ geometry: m.geometry, material: m.material }];
  return (m.userData.parts || []).map(p => ({ geometry: p.geometry, material: p.material, offset: p.position.lengthSq() > 1e-8 ? p.position.clone() : null, spin: p.userData.spin || null }));
}

// Animated animals (skinned, own files). Returns { list, get(id) → { scene, clips } } ; clone per placement with SkeletonUtils.
let animalCache = null;
export function loadAnimals(base = '../_shared/assets/') {
  if (animalCache) return animalCache;
  animalCache = (async () => {
    const list = await (await fetch(base + 'animals/index.json')).json();
    const loader = new GLTFLoader(), out = {};
    await Promise.all(list.map(async e => { const g = await loader.parseAsync(await gunzip(base + e.file), ''); g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); mergeSkinned(g.scene); out[e.id] = { scene: g.scene, clips: g.animations }; }));
    return { list, get: id => out[id] };
  })();
  return animalCache;
}

// Animated people — skinned bounds normalised via index fix {s,x,y,z}: feet at y=0, centred, 1.75 m tall. (Quaternius Ultimate Animated Characters). Same shape as loadAnimals; 1.75 m tall, clips Idle/Walk/Run/Jump/Roll/…
// entry.street = suitable as a pedestrian (casual, suits, workers, doctors, chefs…). Loaded on demand: pass ids to load a subset.
const peopleCache = {};
export async function loadPeople(base = '../_shared/assets/', ids) {
  const list = await (await fetch(base + 'people/index.json')).json();
  const want = ids ? list.filter(e => ids.includes(e.id)) : list, loader = new GLTFLoader();
  await Promise.all(want.map(async e => { if (peopleCache[e.id]) return; peopleCache[e.id] = loader.parseAsync(await gunzip(base + e.file), '').then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) { m.metalness = 0; m.roughness = Math.max(0.6, m.roughness ?? 1); if (/skin/i.test(m.name || '') && m.color) { const FIX = { person_casual_male: '#f2cfb3', person_casual2_male: '#f2cfb3' }, T = ['#f6d7c3', '#eec3a3', '#e0ac85', '#c98f63', '#a86f48', '#8a5636', '#6b3f27', '#4e2d1c']; let hsh = 0; for (const ch of e.id) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0; m.color.set(FIX[e.id] || T[Math.abs(hsh) % T.length]); } } } }); mergeSkinned(g.scene); const f = e.fix; if (f) { g.scene.scale.multiplyScalar(f.s); g.scene.position.set(f.x, f.y, f.z); } const scene = new THREE.Group(); scene.name = e.id; scene.add(g.scene); return { scene, clips: g.animations }; }); }));
  const out = {}; for (const e of want) out[e.id] = await peopleCache[e.id];
  return { list: want, get: id => out[id] };
}

// Static packs: 'interiors' (9 cut-away rooms: 3 lounges, 2 kitchens, dining, 2 bedrooms, office; 2.9 m walls, 3.6–6.9 m square) and 'hazards' (15 home fire-safety props, built by hazards-gen.js).
const packCache = {};
export async function loadPack(dir, base = '../_shared/assets/', ids) {
  const list = await (await fetch(base + dir + '/index.json')).json();
  const want = ids ? list.filter(e => ids.includes(e.id)) : list, loader = new GLTFLoader();
  await Promise.all(want.map(async e => { if (packCache[e.id]) return; packCache[e.id] = loader.parseAsync(await gunzip(base + e.file), '').then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.scene.name = e.id; return g.scene; }); }));
  const out = {}; for (const e of want) out[e.id] = await packCache[e.id];
  return { list: want, get: id => out[id] };
}

// One draw call per character instead of one per body part / per colour (a Quaternius cow is 106 parts,
// a person 6). Parts that share a skeleton, bind pose and parent are merged into one SkinnedMesh; each
// part's flat material colour is baked into a vertex colour, so the look is unchanged. Parts with a
// texture, transparency or morph targets are left alone. Runs once per loaded model, before cloning.
export function mergeSkinned(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isSkinnedMesh || Array.isArray(o.material)) return;
    const m = o.material; if (m.map || m.transparent || Object.keys(o.geometry.morphAttributes).length) return;
    const key = o.parent.uuid + '|' + o.skeleton.bones.map(b => b.uuid).join() + '|' + o.bindMatrix.elements.map(v => v.toFixed(5)).join() + '|' + o.matrix.elements.map(v => v.toFixed(5)).join();
    (groups.get(key) || groups.set(key, []).get(key)).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const KEEP = ['position', 'normal', 'skinIndex', 'skinWeight'];
    const geos = list.map(o => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const out = new THREE.BufferGeometry();
      for (const k of KEEP) { const a = g.attributes[k]; if (!a) return null; const n = a.count * a.itemSize, arr = k === 'skinIndex' ? new Uint16Array(n) : new Float32Array(n);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
        out.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize)); }
      const col = new Float32Array(out.attributes.position.count * 3), c = o.material.color || new THREE.Color(1, 1, 1);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return out;
    });
    if (geos.some(g => !g)) continue;
    const geo = mergeGeometries(geos, false); if (!geo) continue;
    const first = list[0], rough = list.reduce((a, o) => a + (o.material.roughness ?? 1), 0) / list.length;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: rough, side: list.some(o => o.material.side === THREE.DoubleSide) ? THREE.DoubleSide : THREE.FrontSide, name: 'merged' });
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = first.name; mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.frustumCulled = false;
    first.parent.add(mesh); mesh.updateMatrixWorld(true);
    mesh.bind(first.skeleton, first.bindMatrix);
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
  }
  return root;
}
