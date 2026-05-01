// enemyModels.js - GLB enemy model loader with animation management
// Loads rigged 3D models from models/enemies/, generates procedural animations,
// and manages AnimationMixer per enemy instance. Falls back gracefully when no GLB exists.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createAllAnimations } from '../models/animations.js';

// ─── Loader setup ───

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

// ─── Config & cache ───

let enemyConfig = null;
let configPromise = null;

// Stores fully parsed and normalized template scenes: typeId → { scene, config, normScale, normOffset }
const templateCache = new Map();
const loadingSet = new Set();

function loadConfig() {
  if (configPromise) return configPromise;
  configPromise = fetch('models/enemy-config.json')
    .then(r => r.json())
    .then(cfg => { enemyConfig = cfg; return cfg; })
    .catch(err => {
      console.warn('enemyModels: failed to load enemy-config.json', err);
      enemyConfig = {};
      return enemyConfig;
    });
  return configPromise;
}
loadConfig();

// ─── Preloading ───

function parseGLB(buf) {
  return new Promise((resolve, reject) => {
    gltfLoader.parse(buf.slice(0), '', resolve, reject);
  });
}

/** Preload and fully parse a set of enemy typeIds. Returns a Promise that resolves when all are ready. */
export function preloadEnemyModels(typeIds) {
  return loadConfig().then(() => {
    const promises = [];
    for (const id of typeIds) {
      if (!enemyConfig[id] || templateCache.has(id)) continue;
      if (loadingSet.has(id)) {
        // Already loading — wait for it by polling
        promises.push(new Promise(resolve => {
          const check = () => loadingSet.has(id) ? setTimeout(check, 16) : resolve();
          check();
        }));
        continue;
      }
      loadingSet.add(id);
      const cfg = enemyConfig[id];
      const filePath = 'models/' + cfg.file;
      const p = fetch(filePath)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(buf => parseGLB(buf))
        .then(gltf => {
          const scene = gltf.scene;

          scene.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Measure and compute normalization transform
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const configScale = cfg.scale || 1.0;
          const normScale = (1.0 / maxDim) * configScale;
          const center = new THREE.Vector3();
          box.getCenter(center);
          const normOffset = new THREE.Vector3(
            -center.x * normScale,
            -box.min.y * normScale,
            -center.z * normScale
          );

          templateCache.set(id, { scene, config: cfg, normScale, normOffset });
        })
        .catch(() => { /* no model, will use procedural fallback */ })
        .finally(() => { loadingSet.delete(id); });
      promises.push(p);
    }
    return Promise.all(promises);
  });
}

// ─── Per-enemy instance creation ───

/**
 * Create a GLB enemy instance by cloning the pre-parsed template.
 * Returns { group, model, mixer, clips, actions, currentAnim, config } or null.
 */
export function createGLBEnemy(typeId) {
  const template = templateCache.get(typeId);
  if (!template) return null;

  const { scene, config, normScale, normOffset } = template;

  // Clone the entire scene (handles SkinnedMesh + skeleton properly)
  const model = SkeletonUtils.clone(scene);

  model.scale.setScalar(normScale);
  model.position.copy(normOffset);

  // Apply config rotation (degrees around Y axis)
  if (config.rotation) {
    model.rotation.y = (config.rotation * Math.PI) / 180;
  }

  // Apply frontOffset — push model back along local Z (in group-local units)
  if (config.frontOffset) {
    model.position.z -= config.frontOffset;
  }

  const group = new THREE.Group();
  group.add(model);

  // Animation
  const mixer = new THREE.AnimationMixer(model);
  const clips = createAllAnimations(model, config.anims);
  const actions = {};
  for (const [slot, clip] of Object.entries(clips)) {
    const action = mixer.clipAction(clip);
    if (slot === 'death' || slot === 'attack') {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    }
    actions[slot] = action;
  }

  // Start with idle
  if (actions.idle) actions.idle.play();

  return { group, model, mixer, clips, actions, currentAnim: 'idle', config };
}

/**
 * Update animation state for a GLB enemy based on game state.
 */
export function updateGLBAnimation(glbData, enemy, dt) {
  if (!glbData || !glbData.mixer) return;

  glbData.mixer.update(dt);

  // Determine desired animation
  let desired = 'idle';

  if (enemy.hp <= 0) {
    desired = 'death';
  } else if (enemy._hitAnim > 0) {
    desired = 'damage';
  } else if (enemy._attackAnim > 0) {
    desired = 'attack';
  } else if (!enemy._atRest) {
    desired = 'move';
  }

  if (desired !== glbData.currentAnim && glbData.actions[desired]) {
    const prev = glbData.actions[glbData.currentAnim];
    const next = glbData.actions[desired];

    if (desired === 'death') {
      glbData.mixer.stopAllAction();
      next.reset().play();
    } else if (desired === 'damage') {
      if (prev) prev.fadeOut(0.1);
      next.reset().fadeIn(0.1).play();
      glbData._returnAnim = glbData.currentAnim;
    } else if (desired === 'attack') {
      if (prev) prev.fadeOut(0.08);
      next.reset().fadeIn(0.08).play();
    } else {
      if (prev) prev.fadeOut(0.2);
      next.reset().fadeIn(0.2).play();
    }

    glbData.currentAnim = desired;
  }

  // Return from damage after hit animation ends
  if (glbData.currentAnim === 'damage' && enemy._hitAnim <= 0 && glbData._returnAnim) {
    const ret = glbData._returnAnim;
    glbData._returnAnim = null;
    const prev = glbData.actions.damage;
    const next = glbData.actions[ret] || glbData.actions.idle;
    if (next) {
      if (prev) prev.fadeOut(0.15);
      next.reset().fadeIn(0.15).play();
      glbData.currentAnim = ret;
    }
  }
}

/**
 * Check if a typeId's GLB is pre-parsed and ready.
 */
export function isGLBReady(typeId) {
  return templateCache.has(typeId);
}

/**
 * Dispose a GLB enemy's mixer.
 */
export function disposeGLBEnemy(glbData) {
  if (!glbData) return;
  if (glbData.mixer) {
    glbData.mixer.stopAllAction();
    glbData.mixer.uncacheRoot(glbData.model);
  }
}
