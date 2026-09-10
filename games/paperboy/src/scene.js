// Scene, renderer, lights, helpers and the two cameras.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FOLLOW_DISTANCE, ORTHO_SCALE, state } from './config.js';
import { quality } from './quality.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(state.bgColor);
scene.fog = new THREE.Fog(state.bgColor, state.fogNear, state.fogFar);

// Antialiasing is baked into the context, so it comes from the saved detail
// level; the rest of the settings are applied by applyQuality() below and can
// change at any time.
export const renderer = new THREE.WebGLRenderer({ antialias: quality.preset.antialias });
renderer.setSize(innerWidth, innerHeight);
// PCF, not PCFSoft: the soft variant takes several extra taps per pixel, which
// is real money on a tablet and barely visible at this camera distance.
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.enabled = true;
// The map is refreshed on a cadence from the loop rather than every frame.
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = state.toneExposure;
document.body.appendChild(renderer.domElement);

// --- Cameras ---
export const orbitCamera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
orbitCamera.position.set(8, 6, 12);

const halfH = ORTHO_SCALE / 2;
export const orthoCamera = new THREE.OrthographicCamera(-halfH, halfH, halfH, -halfH, 0.1, 1000);

// Blender -> Three rotation: swap the Y/Z axes. Blender's euler order "XYZ"
// composes as Rz*Ry*Rx while Three's Euler order 'XYZ' composes as Rx*Ry*Rz —
// with a non-zero Z those are different rotations, so 'ZYX' below is what
// Blender's "XYZ" actually means. state.cameraRotation is in Blender degrees,
// so values read straight back into Blender.
const coordSwap = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

export function updateOrthoCamera() {
    const p = state.cameraPosition, r = state.cameraRotation;
    orthoCamera.position.set(p.x, p.y, p.z);
    if (orthoCamera.zoom !== state.cameraZoom) {
        orthoCamera.zoom = state.cameraZoom;
        orthoCamera.updateProjectionMatrix();
    }
    _e.set(THREE.MathUtils.degToRad(r.x), THREE.MathUtils.degToRad(r.y), THREE.MathUtils.degToRad(r.z), 'ZYX');
    orthoCamera.quaternion.copy(_q.setFromEuler(_e).premultiply(coordSwap));
}
updateOrthoCamera();

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// Move the OrthoCamera so `focus` lands at normalised screen position
// `anchor` (x,y in -1..1). Orientation and zoom are untouched — only position
// moves — so the Blender-derived camera angle is preserved. Because the frustum
// is re-read each call this stays correct across resizes and zoom changes.
export function frameOrthoOn(focus, anchor, distance = FOLLOW_DISTANCE) {
    const halfW = (orthoCamera.right - orthoCamera.left) / 2 / orthoCamera.zoom;
    const halfH = (orthoCamera.top - orthoCamera.bottom) / 2 / orthoCamera.zoom;
    _right.set(1, 0, 0).applyQuaternion(orthoCamera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(orthoCamera.quaternion);
    _fwd.set(0, 0, -1).applyQuaternion(orthoCamera.quaternion);
    orthoCamera.position.copy(focus)
        .addScaledVector(_right, -anchor.x * halfW)
        .addScaledVector(_up, -anchor.y * halfH)
        .addScaledVector(_fwd, -distance);
    state.cameraPosition.x = orthoCamera.position.x;
    state.cameraPosition.y = orthoCamera.position.y;
    state.cameraPosition.z = orthoCamera.position.z;
}

// Top-down camera for the enemy planner. Street runs left-to-right on screen
// (screen right = +X), houses at the top (screen up = -Z). Only X moves.
export const planCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
export function updatePlanCamera() {
    const h = state.plannerHeight / 2;
    const a = Math.max(1, innerWidth) / Math.max(1, innerHeight);
    planCamera.left = -h * a;
    planCamera.right = h * a;
    planCamera.top = h;
    planCamera.bottom = -h;
    planCamera.position.set(state.plannerX, 80, state.plannerCentreZ);
    planCamera.up.set(0, 0, -1);
    planCamera.lookAt(state.plannerX, 0, state.plannerCentreZ);
    planCamera.updateProjectionMatrix();
}

export const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 2, 0);
controls.enabled = !state.useOrthoCamera;

// Held in an object so other modules see reassignment.
export const view = { activeCamera: state.useOrthoCamera ? orthoCamera : orbitCamera };

// Three cameras, one rule: the planner wins, then the Blender ortho, then orbit.
export function chooseCamera() {
    view.activeCamera = state.planner ? planCamera
        : state.useOrthoCamera ? orthoCamera
        : orbitCamera;
    controls.enabled = view.activeCamera === orbitCamera;
}

export function setOrthoActive(on) {
    state.useOrthoCamera = on;
    chooseCamera();
}

// --- Lights ---
export const ambientLight = new THREE.AmbientLight(0xffffff, state.ambientIntensity);
scene.add(ambientLight);

export const dirLight = new THREE.DirectionalLight(0xffffff, state.dirLightIntensity);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);
// The shadow frustum is only 40 units across, so it has to travel with the
// action — parked at the origin it rendered an empty shadow map every frame
// while the boy (300 units away) cast nothing. Needs the target in the graph.
scene.add(dirLight.target);

export const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x556633, state.hemiIntensity);
scene.add(hemiLight);

// --- Detail level ---
// Pixel count and the shadow pass are the two things a weak GPU notices, and
// both live here. Called once at load and again whenever the level changes.
export function applyQuality(preset = quality.preset) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
    renderer.setSize(renderer.domElement.clientWidth || innerWidth,
        renderer.domElement.clientHeight || innerHeight, false);
    renderer.shadowMap.enabled = preset.shadows;
    dirLight.castShadow = preset.shadows;
    if (dirLight.shadow.mapSize.x !== preset.shadowMapSize) {
        dirLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        // A map already on the GPU is the old size; drop it and let it rebuild.
        dirLight.shadow.map?.dispose();
        dirLight.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
}
quality.onChange(applyQuality);

// --- Fallback ground + helpers ---
// The ground plane sits at y=0, exactly co-planar with the level's road, so it
// z-fights and hides the street from a low angle. main.js switches it off once
// a real level is loaded; both stay toggleable under Scene.
export const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

export const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0x444444);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

// Dev aid only, off unless it is switched on in the panel.
export const axesHelper = new THREE.AxesHelper(5);
axesHelper.visible = false;
scene.add(axesHelper);

// Size the cameras and the canvas. Guarded with Math.max(1, ...) because a page
// that boots in a hidden/zero-size window would otherwise get aspect = 0/0 = NaN,
// leaving the ortho frustum NaN and the canvas blank until the next resize.
let lastW = 0, lastH = 0;
export function applyViewportSize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), a = w / h;
    lastW = innerWidth;
    lastH = innerHeight;
    orbitCamera.aspect = a;
    orbitCamera.updateProjectionMatrix();
    orthoCamera.left = -halfH * a;
    orthoCamera.right = halfH * a;
    orthoCamera.top = halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.updateProjectionMatrix();
    updatePlanCamera();
    renderer.setSize(w, h);
}

// Cheap per-frame catch-up for the case above (no resize event ever fires if the
// window simply gains size after being hidden).
export function syncViewportSize() {
    if (innerWidth !== lastW || innerHeight !== lastH) applyViewportSize();
}

applyViewportSize();
addEventListener('resize', applyViewportSize);
