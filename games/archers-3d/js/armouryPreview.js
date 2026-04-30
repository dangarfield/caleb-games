// armouryPreview.js — Mini Three.js renderer for the armoury character preview
// Renders the player model with idle animation into an offscreen canvas.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let _scene, _camera, _renderer, _canvas;
let _model, _mixer, _idleAction;
let _clock;
let _ready = false;
let _loading = false;

const PREVIEW_SIZE = 256;

function init() {
  if (_canvas) return;

  _canvas = document.createElement('canvas');
  _canvas.width = PREVIEW_SIZE;
  _canvas.height = PREVIEW_SIZE;

  _scene = new THREE.Scene();
  _scene.background = null; // transparent

  _camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  _camera.position.set(0, 0.5, 3.2);
  _camera.lookAt(0, 0.4, 0);

  _renderer = new THREE.WebGLRenderer({
    canvas: _canvas,
    antialias: true,
    alpha: true,
  });
  _renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE);
  _renderer.setPixelRatio(1);
  _renderer.toneMapping = THREE.LinearToneMapping;
  _renderer.toneMappingExposure = 1.8;

  // Lighting
  const ambient = new THREE.AmbientLight('#ffffff', 2.5);
  _scene.add(ambient);

  const key = new THREE.DirectionalLight('#ffffff', 2.0);
  key.position.set(2, 3, 2);
  _scene.add(key);

  const fill = new THREE.DirectionalLight('#8888ff', 0.8);
  fill.position.set(-2, 1, 1);
  _scene.add(fill);

  const rim = new THREE.DirectionalLight('#aaccff', 1.0);
  rim.position.set(0, 2, -2);
  _scene.add(rim);

  _clock = new THREE.Clock();
}

function loadModel() {
  if (_loading || _ready) return;
  _loading = true;

  const loader = new GLTFLoader();
  fetch('models/mouse.glb')
    .then(r => r.arrayBuffer())
    .then(buf => {
      loader.parse(buf, '', (gltf) => {
        _model = gltf.scene;
        _model.scale.setScalar(0.012);
        _model.position.set(0, -0.12, 0);
        _model.rotation.y = Math.PI * 0.1; // slight angle

        _model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        _scene.add(_model);

        // Set up idle animation
        _mixer = new THREE.AnimationMixer(_model);
        const idleClip = gltf.animations.find(c => c.name.includes('idle'));
        if (idleClip) {
          // Strip root motion
          idleClip.tracks = idleClip.tracks.filter(track => {
            const dotIdx = track.name.lastIndexOf('.');
            const prop = track.name.substring(dotIdx + 1);
            const target = track.name.substring(0, dotIdx);
            if (prop === 'position' && !target.includes('/')) return false;
            return true;
          });
          _idleAction = _mixer.clipAction(idleClip);
          _idleAction.play();
        }

        _ready = true;
        _loading = false;
      }, () => { _loading = false; });
    })
    .catch(() => { _loading = false; });
}

/** Render one frame and return the canvas for drawing into 2D context. */
export function renderArmouryPreview() {
  if (!_canvas) init();
  if (!_ready) {
    loadModel();
    return null;
  }

  const dt = _clock.getDelta();
  if (_mixer) _mixer.update(dt);

  // Gentle rotation
  if (_model) {
    _model.rotation.y = Math.PI * 0.1 + Math.sin(Date.now() * 0.001) * 0.15;
  }

  _renderer.render(_scene, _camera);
  return _canvas;
}

/** Dispose resources when no longer needed. */
export function disposeArmouryPreview() {
  if (_mixer) { _mixer.stopAllAction(); _mixer = null; }
  if (_model) { _scene.remove(_model); _model = null; }
  _ready = false;
  _loading = false;
}
