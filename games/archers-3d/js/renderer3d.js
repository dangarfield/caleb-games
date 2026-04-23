// renderer3d.js — Core Three.js scene, camera, lights, coordinate mapping
import * as THREE from 'three';
import { game } from './state.js';
import { arena, T } from './arena.js';

export let scene, camera, renderer;
let clock, ambientLight, dirLight, playerLight;
let threeCanvas;
let _camTargetX = 0, _camTargetZ = 0;

export function initRenderer3D() {
  threeCanvas = document.getElementById('three-canvas');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0a2e');
  scene.fog = new THREE.Fog('#0a0a2e', 20, 40);

  // Clock
  clock = new THREE.Clock();

  // Camera — semi-top-down perspective
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 12, 7);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Lights
  ambientLight = new THREE.AmbientLight('#b0c4de', 0.5);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight('#fff5e6', 0.9);
  dirLight.position.set(5, 15, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 40;
  dirLight.shadow.camera.left = -12;
  dirLight.shadow.camera.right = 12;
  dirLight.shadow.camera.top = 12;
  dirLight.shadow.camera.bottom = -12;
  dirLight.shadow.bias = -0.002;
  scene.add(dirLight);
  scene.add(dirLight.target);

  // Player glow light
  playerLight = new THREE.PointLight('#00e5ff', 0.6, 8);
  playerLight.position.set(0, 1.5, 0);
  scene.add(playerLight);

  // Hemisphere for softer fill
  const hemiLight = new THREE.HemisphereLight('#8ecae6', '#2a1a3a', 0.3);
  scene.add(hemiLight);

  // Resize handler
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
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

export function updateCamera(playerGameX, playerGameY, dt) {
  if (!camera) return;
  const target = gameToWorld(playerGameX, playerGameY);

  // Smooth ease toward player
  const ease = 1 - Math.exp(-4 * dt);
  _camTargetX += (target.x - _camTargetX) * ease;
  _camTargetZ += (target.z - _camTargetZ) * ease;

  // Camera offset: above and behind (looking down at ~60-65 degrees)
  camera.position.set(
    _camTargetX,
    12,
    _camTargetZ + 7
  );
  camera.lookAt(_camTargetX, 0, _camTargetZ);

  // Move directional light with camera
  dirLight.position.set(_camTargetX + 5, 15, _camTargetZ + 5);
  dirLight.target.position.set(_camTargetX, 0, _camTargetZ);

  // Player glow light
  playerLight.position.set(target.x, 1.5, target.z);
  if (game.player && game.player.armorColor) {
    playerLight.color.set(game.player.armorColor);
  }
}

export function setChapterTheme(theme) {
  if (!theme || !scene) return;
  const bgColor = theme.boundary || '#0a0a2e';
  scene.background.set(bgColor);
  if (scene.fog) {
    scene.fog.color.set(bgColor);
  }
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
