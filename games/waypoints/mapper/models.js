// Waypoints — the scenery models, from the Stylized Nature MegaKit.
//
// A model arrives as a small scene graph with a few parts (trunk, leaves, …),
// each with its own material. To plant a thousand of one we need an
// InstancedMesh PER PART, all sharing the same transforms — so a model is kept
// here as a flat list of parts plus its native size, and the planting code
// hands the same matrices to every part.
//
// Everything is baked once at load: the parts are pulled out of the scene, the
// geometry is left as-is (these are already low-poly, and the cost in the
// preview is the NUMBER of instances), and the material is switched to
// alpha-testing so leaf cards cut out cleanly without sorting.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = new URL('../assets/models/', import.meta.url).href;

/** What each kind of scenery can be. The planter picks from the list by hash. */
export const KIT = {
  pine:    ['Pine_5', 'Pine_2', 'Pine_4'],
  bushy:   ['CommonTree_5', 'CommonTree_3'],
  dead:    ['DeadTree_5'],
  bush:    ['Bush_Common', 'Bush_Common_Flowers'],
  grass:   ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall'],
  leafy:   ['Clover_1', 'Clover_2', 'Fern_1', 'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big'],
  flower:  ['Flower_3_Single', 'Flower_3_Group', 'Flower_4_Single', 'Flower_4_Group'],
  mushroom:['Mushroom_Common', 'Mushroom_Laetiporus'],
  rock:    ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'],
  pebble:  ['Pebble_Round_1', 'Pebble_Round_3'],
  stone:   ['Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3'],
};

const cache = new Map();      // name -> { parts, height, tris } | 'failed'
let loader = null;

function prep(scene) {
  const parts = [];
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);          // bake the model's own transforms in
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const mat = new THREE.MeshLambertMaterial({
      map: src && src.map ? src.map : null,
      color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    });
    // Leaf cards are cut-outs. Alpha TEST, not blending: a thousand instanced
    // trees cannot be depth-sorted, and blended foliage without sorting draws
    // holes through whatever is behind it.
    if (mat.map) { mat.alphaTest = 0.5; mat.transparent = false; }
    geo.computeBoundingBox();
    box.union(geo.boundingBox);
    const idx = geo.getIndex();
    parts.push({ geo, mat, tris: (idx ? idx.count : geo.attributes.position.count) / 3 });
  });
  const size = new THREE.Vector3(); box.getSize(size);
  // `height` sizes a tree, which is tall and narrow. `span` sizes ground
  // clutter, which is often WIDER than it is tall — a clump of flowers 20 cm
  // high scaled to "70 cm tall" came out two metres across.
  return { parts, height: size.y || 1, span: Math.max(size.x, size.y, size.z) || 1,
    foot: box.min.y, tris: parts.reduce((n, p) => n + p.tris, 0) };
}

/** Load one model. Resolves to null if it is not there, so the caller falls back. */
export function loadModel(name) {
  const hit = cache.get(name);
  if (hit) return hit;
  if (!loader) loader = new GLTFLoader();
  const p = new Promise((res) => {
    loader.load(`${DIR}${name}.glb`, (g) => res(prep(g.scene)),
      undefined, () => res(null));
  });
  cache.set(name, p);
  return p;
}

/** Load every model in the kit. Resolves when they are all in (or have failed). */
export function loadKit() {
  const names = [...new Set(Object.values(KIT).flat())];
  return Promise.all(names.map((n) => loadModel(n).then((m) => [n, m])))
    .then((rows) => new Map(rows.filter(([, m]) => m)));
}
