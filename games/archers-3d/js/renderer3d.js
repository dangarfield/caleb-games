// renderer3d.js — Core Three.js scene, camera, lights, coordinate mapping
import * as THREE from 'three';
import { game } from './state.js';
import { arena, T } from './arena.js';

export let scene, camera, renderer;
let clock, ambientLight, dirLight;
let threeCanvas;
let _gameWrapper;
let _camTargetX = 0, _camTargetZ = 0;
let _useOrtho = false; // current camera mode
let _orthoCamera, _perspCamera; // both cameras kept alive

function getGameSize() {
  if (_gameWrapper) {
    const r = _gameWrapper.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  return { w: innerWidth, h: innerHeight };
}

export function initRenderer3D() {
  threeCanvas = document.getElementById('three-canvas');
  _gameWrapper = document.getElementById('game-wrapper');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0a2e');
  // No fog with orthographic camera

  // Clock
  clock = new THREE.Clock();

  // Both cameras — toggle between them
  const { w, h } = getGameSize();
  const aspect = w / h;
  const frustumSize = 23;
  _orthoCamera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 150
  );
  _orthoCamera.position.set(0, 32, 20);
  _orthoCamera.lookAt(0, 0, 0);

  _perspCamera = new THREE.PerspectiveCamera(35, aspect, 0.1, 150);
  _perspCamera.position.set(0, 32, 18);
  _perspCamera.lookAt(0, 0, 0);

  camera = _useOrtho ? _orthoCamera : _perspCamera;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1024);
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 2.0;

  // Lights
  ambientLight = new THREE.AmbientLight('#ffffff', 2.0);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight('#ffffff', 2.0);
  dirLight.position.set(-3, 15, -8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 80;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.bias = 0;
  dirLight.shadow.normalBias = 0.02;
  scene.add(dirLight);
  scene.add(dirLight.target);


  // Hemisphere for softer fill
  const hemiLight = new THREE.HemisphereLight('#ffffff', '#8888aa', 1.2);
  scene.add(hemiLight);

  // Resize handler
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  const { w, h } = getGameSize();
  const aspect = w / h;
  const frustumSize = 23;
  if (_orthoCamera) {
    _orthoCamera.left = -frustumSize * aspect / 2;
    _orthoCamera.right = frustumSize * aspect / 2;
    _orthoCamera.top = frustumSize / 2;
    _orthoCamera.bottom = -frustumSize / 2;
    _orthoCamera.updateProjectionMatrix();
  }
  if (_perspCamera) {
    _perspCamera.aspect = aspect;
    _perspCamera.updateProjectionMatrix();
  }
  renderer.setSize(w, h);
}

export function gameToWorld(gx, gy) {
  const a = arena();
  const t = T();
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  return {
    x: (gx - cx) / t,
    y: 0,
    z: (gy - cy) / t
  };
}

export function worldScale(pixels) {
  return pixels / T();
}

export function snapCamera(playerGameX, playerGameY) {
  if (!camera) return;
  const target = gameToWorld(playerGameX, playerGameY);
  _camTargetZ = target.z;
  // Force clamp + position update with large dt
  updateCamera(playerGameX, playerGameY, 10);
}

// Camera Z clamp — T units visible beyond the arena edge at screen top/bottom
// When the player walks to the arena top edge and camera clamps:
//   CAM_VISIBLE_BEYOND_TOP_T = how many T of space ABOVE the arena top edge are visible
// When the player walks to the arena bottom edge and camera clamps:
//   CAM_VISIBLE_BEYOND_BOTTOM_T = how many T of space BELOW the arena bottom edge are visible
// The frustum half-height is ~11.5T, so the player shifts off-center when clamped.
const CAM_VISIBLE_BEYOND_TOP_T = 2;    // 2T of boundary visible above arena
const CAM_VISIBLE_BEYOND_BOTTOM_T = 1; // 1T of boundary visible below arena

export function updateCamera(playerGameX, playerGameY, dt) {
  if (!camera) return;
  const target = gameToWorld(playerGameX, playerGameY);

  // Smooth ease toward player (only Z axis, X stays centered on arena)
  const diff = target.z - _camTargetZ;
  if (Math.abs(diff) < 0.001) {
    _camTargetZ = target.z; // snap when close to avoid micro-jitter
  } else {
    const ease = 1 - Math.exp(-4 * dt);
    _camTargetZ += diff * ease;
  }

  // Clamp camera Z so the screen edge doesn't show more than N tiles beyond arena
  const a = arena();
  const t = T();
  const cy = a.y + a.h / 2;
  const arenaTopZ = (a.y - cy) / t;           // world Z of arena top edge (negative)
  const arenaBottomZ = (a.y + a.h - cy) / t;  // world Z of arena bottom edge (positive)
  const frustumHalf = 23 / 2; // half the ortho frustum height in world units

  // Camera center must be far enough south that screen top doesn't exceed arenaTopZ - beyondTop
  // Screen top Z = camZ - frustumHalf, must be >= arenaTopZ - beyondTop
  // So camZ >= arenaTopZ - beyondTop + frustumHalf
  const camMinZ = arenaTopZ - CAM_VISIBLE_BEYOND_TOP_T + frustumHalf;

  // Screen bottom Z = camZ + frustumHalf, must be <= arenaBottomZ + beyondBottom
  // So camZ <= arenaBottomZ + beyondBottom - frustumHalf
  const camMaxZ = arenaBottomZ + CAM_VISIBLE_BEYOND_BOTTOM_T - frustumHalf;

  // Soft clamp: ease toward boundary instead of hard stop
  if (camMinZ <= camMaxZ) {
    // Normal case: arena + padding is larger than frustum
    if (_camTargetZ < camMinZ) {
      _camTargetZ += (camMinZ - _camTargetZ) * (1 - Math.exp(-8 * dt));
    } else if (_camTargetZ > camMaxZ) {
      _camTargetZ += (camMaxZ - _camTargetZ) * (1 - Math.exp(-8 * dt));
    }
  } else {
    // Arena fits within frustum — just center on arena
    const arenaCenterZ = (arenaTopZ + arenaBottomZ) / 2;
    _camTargetZ += (arenaCenterZ - _camTargetZ) * (1 - Math.exp(-8 * dt));
  }

  // Both cameras track the same position
  const orthoOffset = 0;
  _orthoCamera.position.set(0, 32, _camTargetZ + orthoOffset + 20);
  _orthoCamera.lookAt(0, 0, _camTargetZ + orthoOffset);
  _perspCamera.position.set(0, 32, _camTargetZ + 20);
  _perspCamera.lookAt(0, 0, _camTargetZ);

  // Move directional light with camera
  dirLight.position.set(-3, 20, _camTargetZ - 8);
  dirLight.target.position.set(0, 0, _camTargetZ);

}

export function setChapterTheme(theme) {
  if (!theme || !scene) return;
  const bgColor = theme.boundary || '#0a0a2e';
  scene.background.set(bgColor);
  // Tint ambient slightly with boundary color
  const bg = new THREE.Color(bgColor);
  const warm = new THREE.Color('#b0c4de');
  ambientLight.color.copy(warm.lerp(bg, 0.2));
}

export function render3D() {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
}

export function setVisible(visible) {
  if (!threeCanvas) return;
  threeCanvas.style.display = visible ? 'block' : 'none';
}

export function getScene() {
  return scene;
}

export function getTime() {
  return clock ? clock.getElapsedTime() : 0;
}

export function toggleCamera() {
  _useOrtho = !_useOrtho;
  camera = _useOrtho ? _orthoCamera : _perspCamera;
  return _useOrtho;
}

export function isOrthoCamera() {
  return _useOrtho;
}

export function toggleShadows() {
  if (!renderer) return;
  renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
  // Force shadow map update on all materials
  scene.traverse(obj => {
    if (obj.isMesh && obj.material) obj.material.needsUpdate = true;
  });
}

export function areShadowsEnabled() {
  return renderer ? renderer.shadowMap.enabled : true;
}
