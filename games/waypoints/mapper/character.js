// Waypoints — the hiker.
//
// One figure on the ground is worth any amount of arguing about scale: a park
// you cannot find a person in is a diagram, and a park with a person standing
// in it is a landscape. This is that person — the Adventurer from the Ultimate
// Modular Men pack, cut down by `tools/build_character.py` to the three clips
// the map needs.
//
// The model arrives at whatever size its author worked in, so it is measured
// once and wrapped in a group scaled to be exactly ONE UNIT TALL with its feet
// on y = 0. Everything outside this file then sizes the hiker in metres and
// never has to know what the artist's units were.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL_ = new URL('../assets/models/Adventurer.glb', import.meta.url).href;

/**
 * Measure a skinned figure honestly.
 *
 * `Box3.setFromObject` transforms the geometry's bind-pose box by the mesh's
 * world matrix — but a skinned mesh's vertices are placed by its BONES, not by
 * that matrix, and here the armature carries a scale of 100 that the mesh node
 * does not. So the box comes out a hundredth of the real size. Walking the
 * vertices through the skinning transform is the only measurement that is not
 * a guess.
 */
function skinnedBox(root) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) {
      if (o.isMesh && o.geometry) box.expandByObject(o);
      return;
    }
    const pos = o.geometry.attributes.position;
    // every 7th vertex is plenty for a bounding box and a twentieth of the work
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i);
      o.applyBoneTransform(i, v);
      box.expandByPoint(o.localToWorld(v));
    }
  });
  return box;
}

/**
 * Load the hiker.
 *
 * Resolves to null if the model is missing, so the preview carries on without
 * him rather than failing to build.
 */
export function loadCharacter() {
  return new Promise((resolve) => {
    new GLTFLoader().load(URL_, (gltf) => {
      try {
        resolve(make(gltf));
      } catch (e) {
        console.warn('hiker failed to prepare', e);
        resolve(null);
      }
    }, undefined, () => resolve(null));
  });
}

function make(gltf) {
  const inner = gltf.scene;
  inner.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.frustumCulled = false;         // he is small and we move him every frame
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    // The pack is untextured — flat colours only — so a Lambert material keeps
    // him lit the same way as the trees rather than a shade brighter.
    o.material = new THREE.MeshLambertMaterial({
      color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src?.map || null,
    });
  });

  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    a.enabled = true; a.setEffectiveWeight(0); a.play();
    actions[clip.name.toLowerCase()] = a;
  }

  // settle on the first frame of the idle pose before measuring: the bind pose
  // is a T-shape with the arms out, which is neither his height nor his width
  if (actions.idle) actions.idle.setEffectiveWeight(1);
  mixer.update(0);

  const box = skinnedBox(inner);
  const size = new THREE.Vector3(); box.getSize(size);
  const h = size.y || 1;
  inner.position.set(-((box.min.x + box.max.x) / 2) / h, -box.min.y / h, -((box.min.z + box.max.z) / 2) / h);
  inner.scale.setScalar(1 / h);

  // the group the caller moves: one unit tall, feet at the origin, facing +z
  const root = new THREE.Group();
  root.add(inner);

  let current = 'idle';
  const FADE = 0.22;

  return {
    root, mixer, nativeHeight: h,
    get clip() { return current; },
    /** Cross-fade to a clip by name. Unknown names are ignored. */
    play(name, speed = 1) {
      const next = actions[name];
      if (!next) return;
      next.timeScale = speed;
      if (name === current) return;
      const prev = actions[current];
      if (prev) prev.fadeOut(FADE);
      next.reset();
      // `fadeIn` ramps a MULTIPLIER on the action's weight, and every action was
      // parked at weight zero when the clips were loaded. Zero times anything is
      // zero, so without this the cross-fade ran its full length and left him
      // standing in the idle pose — which is exactly what he did.
      next.setEffectiveWeight(1);
      next.timeScale = speed;
      next.fadeIn(FADE).play();
      current = name;
    },
    update(dt) { mixer.update(dt); },
    dispose() {
      mixer.stopAllAction();
      root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    },
  };
}
