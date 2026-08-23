// Renderer, scene, lights, the table, and the four InstancedMeshes that draw the
// WHOLE world. Nothing here knows about physics or about tools.
//
// PERFORMANCE MANDATE rule 3 lives in this file. There are exactly four instanced
// draw calls for every movable thing in the game:
//
//   MESH.DOMINO  one BoxGeometry at real domino size, capacity = the tier's cap
//   MESH.BOX     a UNIT cube, scaled per instance -> walls, bridge decks, stair
//                treads, tower blocks, ramps, springboards, splitter paddles, chime
//                and xylophone bars. One geometry covers nine different props.
//   MESH.BALL    a unit sphere, scaled per instance -> marble, slalom ball, loop-the-loop
//                ball, bell dome.
//   MESH.CYL     a unit cylinder -> bells, posts, spinner hubs, cannon tubes.
//
// Plus two static draw calls for the table (top + skirt) and one for the confetti,
// which is hidden until it fires. A settled table is therefore ~7 draw calls
// regardless of how many hundred dominoes are on it, and uploads zero bytes (see
// sim.js).

import * as THREE from 'three';
import { profile } from './quality.js';
import { MESH, DOM_W, DOM_H, DOM_T, SURFACES, TABLES, TABLE_THICK } from './consts.js';

export { MESH };

const q0 = profile();

// --- renderer --------------------------------------------------------------
export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('view'),
  antialias: q0.antialias,
  powerPreference: 'high-performance',
});
// The third argument MUST be false. setSize(w, h) writes an inline
// style="width:...px;height:...px" onto the canvas which beats the stylesheet's
// 100%/100%, and because resize() passes false too, that stale inline size then
// survives every rotation and letterboxes the whole game.
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.enabled = q0.shadows;

export const perf = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, q0.pixelRatioCap),
  shadows: q0.shadows,
  dominoCap: q0.dominoCap,
  fps: 0, drawCalls: 0, msPhys: 0, msDraw: 0, awake: 0,
};
renderer.setPixelRatio(perf.pixelRatio);

export function setPixelRatio(r) { perf.pixelRatio = r; renderer.setPixelRatio(r); }
export function setShadows(on) {
  perf.shadows = on;
  renderer.shadowMap.enabled = on;
  sun.castShadow = on;
  meshes[MESH.DOMINO].castShadow = on && q0.dominoShadows;
  meshes[MESH.BOX].castShadow = on;
  meshes[MESH.BALL].castShadow = on;
  meshes[MESH.CYL].castShadow = on;
  tableTop.receiveShadow = on;
}

// --- scene / camera --------------------------------------------------------
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.02, 24);

export const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x30304a, 0.85);
scene.add(hemi);

export const sun = new THREE.DirectionalLight(0xfff6e0, 1.15);
sun.position.set(0.9, 1.6, 0.7);
sun.castShadow = q0.shadows;
sun.shadow.mapSize.set(q0.shadowMapSize, q0.shadowMapSize);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 8;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

// --- the table ------------------------------------------------------------
// One textured plane for the top and one box for the skirt: two draw calls, and the
// kerbs that stop a run walking off the edge are physics-only (a painted border on
// the texture shows where they are), which saves four more.
const texCanvas = document.createElement('canvas');
texCanvas.width = 512; texCanvas.height = 512;
const tex = new THREE.CanvasTexture(texCanvas);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 2;

const tableTop = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshLambertMaterial({ map: tex }));
tableTop.rotation.x = -Math.PI / 2;
tableTop.receiveShadow = q0.shadows;
scene.add(tableTop);

const tableSkirt = new THREE.Mesh(
  new THREE.BoxGeometry(1, TABLE_THICK, 1),
  new THREE.MeshLambertMaterial({ color: 0x1d3f2a }));
tableSkirt.position.y = -TABLE_THICK / 2 - 0.0005;
scene.add(tableSkirt);

let surfaceId = 'felt';
let tableId = 'small';

function paintTable(surf, tw, td) {
  const c = texCanvas.getContext('2d');
  const S = texCanvas.width;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  c.fillStyle = hex(surf.top);
  c.fillRect(0, 0, S, S);
  if (surf.id === 'felt' || surf.id === 'wood') {
    // A little grain so the eye has something to hold on to at this scale.
    c.globalAlpha = 0.06;
    for (let i = 0; i < 900; i++) {
      c.fillStyle = i % 2 ? '#000' : '#fff';
      const y = Math.random() * S;
      c.fillRect(Math.random() * S, y, surf.id === 'wood' ? 60 + Math.random() * 120 : 3, 1.5);
    }
    c.globalAlpha = 1;
  }
  if (surf.id === 'neon' || surf.id === 'space') {
    c.strokeStyle = hex(surf.line);
    c.globalAlpha = surf.id === 'neon' ? 0.5 : 0.25;
    c.lineWidth = 2;
    const step = S / 16;
    for (let i = 0; i <= 16; i++) {
      c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, S); c.stroke();
      c.beginPath(); c.moveTo(0, i * step); c.lineTo(S, i * step); c.stroke();
    }
    c.globalAlpha = 1;
  }
  if (surf.id === 'ice') {
    c.strokeStyle = hex(surf.line); c.globalAlpha = 0.5; c.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      c.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; c.lineTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // The border marks where the kerb is, so "the edge" is visible from any angle.
  c.strokeStyle = hex(surf.line);
  c.globalAlpha = 0.85; c.lineWidth = 10;
  c.strokeRect(6, 6, S - 12, S - 12);
  c.globalAlpha = 0.3; c.lineWidth = 2;
  c.strokeRect(22, 22, S - 44, S - 44);
  c.globalAlpha = 1;
  tex.needsUpdate = true;
}

/** Resize the table and repaint its surface. Called on boot and on every upgrade. */
export function setTable(id, surfId) {
  tableId = TABLES[id] ? id : 'small';
  surfaceId = SURFACES[surfId] ? surfId : 'felt';
  const t = TABLES[tableId], s = SURFACES[surfaceId];
  tableTop.scale.set(t.w, t.d, 1);
  tableSkirt.scale.set(t.w + 0.03, 1, t.d + 0.03);
  tableSkirt.material.color.setHex(s.edge);
  scene.background = new THREE.Color(s.sky);
  scene.fog = new THREE.Fog(s.sky, Math.max(t.w, t.d) * 1.1, Math.max(t.w, t.d) * 4.2);
  hemi.groundColor.setHex(s.edge);
  paintTable(s, t.w, t.d);
  // Frame the shadow camera on the table, otherwise a Huge table either has no
  // shadows at its edges or a uselessly coarse map everywhere.
  const r = Math.max(t.w, t.d) * 0.62;
  const sc = sun.shadow.camera;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
  sc.updateProjectionMatrix();
  const d = Math.max(t.w, t.d);
  sun.position.set(d * 0.55, d * 1.05, d * 0.45);
  sun.target.position.set(0, 0, 0);
  return t;
}
export function currentTable() { return TABLES[tableId]; }
export function currentSurface() { return SURFACES[surfaceId]; }

// --- the four instanced meshes --------------------------------------------
const shading = q0.shading;
function mat(opts) {
  return shading === 'pbr'
    ? new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.62, metalness: 0.04 }, opts))
    : new THREE.MeshLambertMaterial(opts);
}

export const CAPS = [
  q0.dominoCap,
  q0.id === 'low' ? 240 : 420,
  16,
  40,
];

const GEOS = [
  new THREE.BoxGeometry(DOM_W, DOM_H, DOM_T),
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.SphereGeometry(0.5, q0.id === 'low' ? 10 : 16, q0.id === 'low' ? 7 : 11),
  new THREE.CylinderGeometry(0.5, 0.5, 1, q0.id === 'low' ? 10 : 16),
];

export const meshes = [];
for (let k = 0; k < 4; k++) {
  const m = new THREE.InstancedMesh(GEOS[k], mat({ color: 0xffffff }), CAPS[k]);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Allocating instanceColor up front means setColorAt never has to grow it mid-run.
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPS[k] * 3).fill(1), 3);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // Every instance moves, so the bounding sphere three would compute is worthless;
  // culling it per frame is pure cost.
  m.frustumCulled = false;
  m.castShadow = q0.shadows && (k !== MESH.DOMINO || q0.dominoShadows);
  m.receiveShadow = false;
  m.count = 0;
  scene.add(m);
  meshes.push(m);
}

// --- ghost preview --------------------------------------------------------
// What one finger is about to do, drawn before it commits. A separate instanced mesh
// so the real layout is never touched by a preview, and it only re-uploads on the
// frames where the finger actually moved.
export const ghost = new THREE.InstancedMesh(
  GEOS[MESH.DOMINO],
  new THREE.MeshBasicMaterial({ color: 0xa29bfe, transparent: true, opacity: 0.45, depthWrite: false }),
  q0.dominoCap);
ghost.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ghost.frustumCulled = false;
ghost.count = 0;
ghost.renderOrder = 3;
scene.add(ghost);

/**
 * A second ghost: a unit box, scaled and tinted per use. It no longer previews trick items
 * (ghostParts below draws those as themselves) — what is left is the two jobs that want one
 * clear shape rather than a model: highlighting the domino the First tool is about to pick
 * (gold), and the piece the Select tool is about to pick (blue).
 */
export const ghostBox = new THREE.Mesh(
  GEOS[MESH.BOX],
  new THREE.MeshBasicMaterial({ color: 0xa29bfe, transparent: true, opacity: 0.32, depthWrite: false }));
ghostBox.visible = false;
ghostBox.renderOrder = 3;
scene.add(ghostBox);

/**
 * THE REAL SHAPE of the trick you are about to drop, not a box the size of its footprint.
 * A box told a child where the bridge would land but not which end was the ramp, which is
 * exactly the thing a rotation slider needs them to be able to see.
 *
 * Four instanced meshes over the same unit primitives the real items use, so the preview is
 * drawn by the same geometry as the thing itself and cannot disagree with it. GHOST_PART_CAP
 * is per primitive; measured worst case across every item is the Tower at 18 boxes (then
 * Pendulum, 3 cylinders), so 32 leaves room for anything added later. `visible = false`
 * while nothing is previewing keeps this at zero draw calls, which is most of the time.
 */
export const GHOST_PART_CAP = 32;
export const ghostParts = [];
for (let k = 0; k < 4; k++) {
  const g = new THREE.InstancedMesh(
    GEOS[k],
    new THREE.MeshBasicMaterial({ color: 0xa29bfe, transparent: true, opacity: 0.42, depthWrite: false }),
    GHOST_PART_CAP);
  g.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  g.frustumCulled = false;
  g.count = 0;
  g.visible = false;
  g.renderOrder = 3;
  scene.add(g);
  ghostParts.push(g);
}
/** Tint the whole preview at once — purple for "yes", red for "not there". */
export function setGhostPartsColour(hex) {
  for (const g of ghostParts) g.material.color.setHex(hex);
}

// --- the start marker -----------------------------------------------------
// A gold ring around the domino GO will tip. Without it, "which one goes first?" is
// the single most confusing thing about a finished layout.
export const startRing = new THREE.Mesh(
  new THREE.RingGeometry(DOM_W * 0.85, DOM_W * 1.25, 20),
  new THREE.MeshBasicMaterial({ color: 0xffd32a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
startRing.rotation.x = -Math.PI / 2;
startRing.visible = false;
startRing.renderOrder = 2;
scene.add(startRing);

// --- the selection ring ---------------------------------------------------
// Blue, and deliberately the same shape as the gold start ring: a child already reads a
// ring under a piece as "this is the one we mean", so selection borrows that vocabulary
// rather than inventing a second one. Gold answers "which goes first", blue answers
// "which will the slider turn". Unit-sized and scaled per target, because a domino and a
// bridge want very different rings.
export const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.82, 1, 22),
  new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;
selRing.renderOrder = 2;
scene.add(selRing);

// --- eraser ring ----------------------------------------------------------
export const eraseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 24),
  new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
eraseRing.rotation.x = -Math.PI / 2;
eraseRing.visible = false;
eraseRing.renderOrder = 2;
scene.add(eraseRing);

// --- confetti -------------------------------------------------------------
// One Points cloud, hidden until the cannon fires, CPU-animated in fx.js. Hidden
// means zero draw calls, so the finale costs nothing until it happens.
const CONF_N = q0.confetti;
const confGeo = new THREE.BufferGeometry();
confGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONF_N * 3), 3));
confGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CONF_N * 3), 3));
confGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
export const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({
  size: 0.012, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false,
}));
confetti.visible = false;
confetti.frustumCulled = false;
scene.add(confetti);
export const CONFETTI_N = CONF_N;

// --- resize ---------------------------------------------------------------
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

setTable('small', 'felt');
