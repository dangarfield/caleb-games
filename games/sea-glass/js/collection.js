// The collection: your sea glass actually tumbling inside jars.
//
// Its own scene and its own tiny physics world, on the SAME backend the beach runs
// (Rapier on High, js/lphys.js on Low — see js/phys.js), just a small N that falls
// asleep fast. The glass is genuinely 3D: real spheres, stacked, tumbling. Three
// tricks make it cheap:
//   * the jar SILHOUETTE is not physics geometry — containment is a hand-written
//     radial clamp applied inside the step, so a dozen tapering jars cost nothing
//     (the Rapier backend adds one static floor box per jar, and nothing else)
//   * every piece is drawn from one InstancedMesh per colour, so a jar of 20
//     bits of green glass is still a single draw call
//   * nothing is simulated or uploaded once the heap has settled: the world walks
//     an awake list, and a parked jar's list is empty
// Tipping rotates the whole shelf group visually and counter-rotates gravity, so
// the contents always fall towards real down.
//
// Presentation note: the beach is daylight, but this screen is a DARK shelf. Sea
// glass is translucent, so on a bright beige background it disappeared into the
// backdrop; against the arcade's own navy it reads as lit jewels. The scene still
// uses the bright beach environment map for reflections — only the visible
// background is dark, which is what makes the glass pop.

import * as THREE from 'three';
import { makeWorld, activeEngine, Body, MODE_SPIN } from './phys.js';
import * as audio from './audio.js';
import { GLASS, GLASS_IDS, BOTTLES, BOTTLE_BY_ID, BEACH_BY_ID } from './data.js';
import {
  makeEnvironment, shardGeometry, glassMaterial, ceramicMaterial, ceramicItemGeometry,
} from './env.js';
import { profile } from './quality.js';

// More, smaller pieces than before: at the old size each shard was a boulder next
// to its jar. Shrinking them costs fill, so the budget goes up to compensate —
// still cheap, because they are spheres that sleep and are drawn one instanced
// mesh per colour.
//
// CAPACITY is the fixed instanced-mesh allocation; the Low profile just fills
// fewer slots (110 bodies / 12 per jar instead of 240 / 24), so the second physics
// world costs about half as much to settle when the screen opens.
const MAX_PIECES = 240;
const PER_JAR_CAP = 24;
const CAPACITY = PER_JAR_CAP + 8;
const G = 9.82;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

const group = new THREE.Group();        // tips when you drag
scene.add(group);

// The jar world runs on the SAME backend the beach does — Rapier on High, lphys on
// Low (js/phys.js) — because the quality profile picks the engine once, for the whole
// game, and a player who has chosen High should get real rigid-body glass in the jars
// too. Step rate and relaxation passes follow the profile just like the beach.
//
// The jar SILHOUETTE is a hand-written position clamp on both backends (clampJars):
// it is a curved, tapering neck, and neither backend does anything but balls and
// boxes. What the Rapier backend adds is a real static floor per jar (see
// jarStatics), because a heap resting on a clamp cannot be allowed to fall asleep.
//
// Glass in a jar does not bounce and it does not slide. On lphys that comes for free:
// the separation pass and the wall clamp only ever adjust POSITIONS, and the velocity
// is then derived from where the piece actually ended up, so a piece pressed against
// the glass simply has no velocity into it and a settled heap cannot pump itself back
// into motion. On Rapier it is the friction and restitution the world is built with.
let world = makeJarWorld();

function makeJarWorld() {
  const w = makeWorld({
    engine: activeEngine(),
    capacity: MAX_PIECES + 8,
    gravity: -G,
    stepHz: profile().collectionStepHz,
    maxSubsteps: 2,
    passes: profile().collectionRelaxPasses,
    damping: 0.88,          // heavy: glass settling in a jar, not marbles on a table
    spinDamping: 0.9,
    maxSpeed: 6,
    // A shake wakes the whole jar deliberately, so there is no incremental cap here
    // the way there is on the beach; the ceiling is simply the world.
    maxAwake: MAX_PIECES + 8,
    wakeFrames: 900,
    sleepSpeed: 0.1,
    sleepSpin: 1.0,
    sleepFrames: 8,
    cell: 0.12,
    // Rapier only, ignored by lphys.
    solverIterations: profile().solverIterations,
    lengthUnit: profile().lengthUnit,
    friction: 0.6,          // glass on glass slides more than stone on stone
    restitution: 0.05,
  });
  w.clampFn = clampJars;
  return w;
}

/**
 * Adopt the backend that is now in force, if it is not the one we have.
 *
 * This module is evaluated before main.js has finished awaiting Rapier's wasm, so the
 * world it builds at import time is always lphys; main.js calls this once boot is
 * done, and again whenever the quality toggle is flipped. It compares against the
 * RESOLVED engine, not the profile's wish, so a failed Rapier load does not leave
 * this rebuilding the same lphys world on every call. Returns true if the world was
 * rebuilt.
 */
export function ensureEngine() {
  if (world.engine === activeEngine()) return false;
  rebuildWorld();
  return true;
}

/**
 * The engine changed under us (quality toggle). Build a fresh world on the new
 * backend; the shelf is rebuilt from the save, exactly as it is on every open.
 */
export function rebuildWorld() {
  clearScene();
  // Same order as the beach (physics.js createWorld): stand the new world up, swap the
  // binding, and only THEN release the old one. On Rapier `dispose()` frees wasm, so a
  // piece handle that outlives the swap must find a dead world, never a freed one.
  const old = world;
  world = makeJarWorld();
  old.dispose();
  built = false;
  if (lastSave) build(lastSave, currentMode, currentStyle);
}

/** Which physics backend the jars are running on ('rapier' | 'lphys'). */
export function engine() { return world.engine; }

/**
 * A real floor inside each jar, for the backend that has static colliders. A no-op
 * on lphys, where clampJars is the whole containment.
 *
 * The top surface sits a whisker ABOVE the clamp's own floor (jar.cy + r), so the
 * solver — not the clamp — is what holds a settled heap up. If the clamp got there
 * first it would nudge every resting piece every step and the jar would never sleep.
 */
const JAR_FLOOR_LIFT = 0.006;
function jarStatics() {
  if (!world.hardWalls) return;
  for (const jar of jars) {
    const r = jar.innerR * 1.05;
    world.addStaticBox(jar.cx, jar.cy + JAR_FLOOR_LIFT - 0.06, jar.cz, r, 0.06, r);
  }
}

/** piece record by particle index, so the clamp can find its jar. */
const pieceByIndex = new Array(MAX_PIECES + 8).fill(null);

// --- lighting -------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a2450, 0.55));
const key = new THREE.DirectionalLight(0xfff6e2, 1.85);
key.position.set(-2.5, 4.5, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ac6ff, 0.8);
rim.position.set(3, 1.8, -3);
scene.add(rim);
// A low warm fill from the front so the glass nearest the camera is never a
// silhouette against the dark background.
const fill = new THREE.DirectionalLight(0xffe6c0, 0.5);
fill.position.set(0.4, 0.6, 4);
scene.add(fill);

/**
 * The visible backdrop: an equirect canvas painted in the arcade's own palette.
 * Deliberately NOT the beach sky — see the note at the top of the file. It is a
 * full 360 wash rather than a spot so that tipping the shelf never swings a seam
 * into view.
 */
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#07071f');
  grad.addColorStop(0.42, '#141452');
  grad.addColorStop(0.62, '#1a1a6e');
  grad.addColorStop(1.00, '#08081f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // Broad violet bloom around the horizon — the "room" the shelf sits in.
  for (let i = 0; i < 5; i++) {
    const x = (i / 5) * 512 + 51;
    const rg = g.createRadialGradient(x, 158, 0, x, 158, 190);
    rg.addColorStop(0, 'rgba(108,92,231,0.24)');
    rg.addColorStop(0.55, 'rgba(108,92,231,0.08)');
    rg.addColorStop(1, 'rgba(108,92,231,0)');
    g.fillStyle = rg;
    g.fillRect(x - 200, 0, 400, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

{
  // Background dark, environment bright: the glass reflects a sky it is not
  // standing in, which is exactly the look of glass on a windowsill at dusk.
  const envSet = makeEnvironment('collection', 0x7fc4ee, 0xe8eef2, 0xd8c9a6);
  scene.background = backdropTexture();
  scene.environment = envSet.environment;
}

// --- shelves --------------------------------------------------------------
// Dark and thin. A thick pale-brown plank was the biggest thing on the screen
// and pulled every bit of attention away from the glass.
//
// The jars are stacked on SEVERAL PLANKS, one above the other, rather than in
// rows front-to-back. Depth rows hide each other at this camera angle and the
// screen height went unused; a little cabinet of shelves shows every jar face-on
// and spends that spare height instead, so each jar ends up much bigger.
const shelfMat = new THREE.MeshStandardMaterial({
  color: 0x2b2752, roughness: 0.42, metalness: 0.06, envMapIntensity: 0.55,
});
const plankGeo = new THREE.BoxGeometry(1, 0.07, 1);
const planks = new THREE.Group();
group.add(planks);

/**
 * The cabinet's back board: gives the translucent glass something dark to read
 * against instead of the open backdrop. It is a feathered plane rather than a
 * solid slab — a hard-edged black rectangle floating behind the jars looked like
 * a stage flat, whereas a soft edge reads as the inside of a shadow box.
 */
function boardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#191540';
  g.fillRect(0, 0, 128, 128);
  const fade = g.createLinearGradient(0, 0, 128, 0);
  fade.addColorStop(0, 'rgba(25,21,64,0)');
  fade.addColorStop(0.16, 'rgba(25,21,64,1)');
  fade.addColorStop(0.84, 'rgba(25,21,64,1)');
  fade.addColorStop(1, 'rgba(25,21,64,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = fade;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const backBoard = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
  map: boardTexture(), transparent: true, depthWrite: false,
}));
backBoard.renderOrder = 1;
backBoard.visible = false;
group.add(backBoard);

// Upright end posts, so the planks read as one cabinet instead of floating slabs.
const posts = new THREE.Group();
group.add(posts);
const postGeo = new THREE.BoxGeometry(0.1, 1, 1);

/** Soft dark blob under each jar. No shadow maps in this scene; this grounds them. */
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)');
  rg.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const contactGeo = new THREE.PlaneGeometry(1, 1);
const contactMat = new THREE.MeshBasicMaterial({
  map: contactTexture(), transparent: true, depthWrite: false,
});
const contacts = new THREE.Group();
group.add(contacts);

// --- jar visuals ---------------------------------------------------------
function jarProfile(style, scale) {
  const pts = [];
  const r = style.r * scale, h = style.h * scale, neck = style.neck;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let rr = r;
    if (t > 0.72) rr = r * (1 - (1 - neck) * ((t - 0.72) / 0.28));
    if (t < 0.06) rr = r * (0.86 + t / 0.06 * 0.14);
    pts.push(new THREE.Vector2(Math.max(0.02, rr), t * h));
  }
  // small lip
  pts.push(new THREE.Vector2(r * neck * 1.12, h));
  pts.push(new THREE.Vector2(r * neck * 1.06, h * 1.03));
  return pts;
}

const jars = [];   // { mesh, cx, cz, innerR, h, neck, fillN }

function makeJarMesh(style, scale, tint) {
  const geo = new THREE.LatheGeometry(jarProfile(style, scale), 26);
  const mat = new THREE.MeshStandardMaterial({
    color: tint, roughness: 0.05, metalness: 0.0, envMapIntensity: 2.6,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 6;
  return m;
}

// No per-jar labels. Tags floating over every jar were clutter, they cost real
// vertical space in the framing (which made every jar smaller), and the list
// under the shelf already names every colour with its count.

// --- pieces --------------------------------------------------------------
const pieceMeshes = {};   // colourId -> InstancedMesh
const pieces = [];        // { colourId, mi, ii, body, radius, jar }

{
  const geo = shardGeometry(3);
  for (const id of GLASS_IDS) {
    // Brighter and more opaque than the beach material: in a jar the glass is
    // the subject, and a nearly-clear shard against a dark shelf is invisible.
    const mat = glassMaterial(GLASS[id].hex);
    mat.opacity = 0.9;
    mat.roughness = 0.3;
    mat.envMapIntensity = 2.2;
    mat.emissiveIntensity = 0.2;
    const im = new THREE.InstancedMesh(geo, mat, CAPACITY);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.count = 0;
    im.renderOrder = 4;
    group.add(im);
    pieceMeshes[id] = im;
  }
}

const ceramicItems = new THREE.Group();
group.add(ceramicItems);

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

// --- tilt ----------------------------------------------------------------
const tilt = { x: 0, z: 0, tx: 0, tz: 0 };
const MAX_TILT = 0.52;

export function setTiltTarget(nx, nz) {
  tilt.tx = THREE.MathUtils.clamp(nx, -MAX_TILT, MAX_TILT);
  tilt.tz = THREE.MathUtils.clamp(nz, -MAX_TILT, MAX_TILT);
  wakeAll();
}
export function releaseTilt() { tilt.tx = 0; tilt.tz = 0; }

function wakeAll() {
  world.wakeAll(900);
  for (const p of pieces) p.calm = 0;
  awake = pieces.length;
  sinceDisturb = 0;
}

// --- settling -------------------------------------------------------------
// The jar walls and floor are a hand-written clamp, not bodies, and lphys puts each
// piece to sleep on its own once it has been calm for a few steps. This is the
// backstop on top of that, for the same reason the beach has one: a piece wedged
// between two others can jiggle indefinitely, and one awake piece keeps the whole
// world's step alive. Once everything is parked, `awake` hits zero and the world is
// not stepped at all.
const CALM_SPEED = 0.12;
const CALM_SPIN = 1.2;
const CALM_TIME = 0.35;
// However long the heap wants to argue with itself, it is parked this many
// seconds after the last shake, pour or tip. A piece freezing mid-roll is
// invisible; a jar that never settles is the first thing you notice.
const SETTLE_DEADLINE = 2.4;
let awake = 0;
let sinceDisturb = 1e9;
// Sleeping pieces are skipped by the instance sync, so a fully parked jar needs
// one guaranteed upload of its final resting matrices — otherwise the glass is
// simulated, settled, and invisible.
let needSync = false;

function parkAllPieces() {
  world.sleepAll();     // zeroes velocity + spin and empties the awake list
  for (const p of pieces) { p.calm = 0; p.rested = false; }
  awake = 0;
  needSync = true;
  world.resetClock();
}

/** Park whatever has stopped. Returns how many pieces are still simulating. */
function settlePieces(dt) {
  sinceDisturb += dt;
  let n = 0;
  for (const p of pieces) {
    if (p.body.frozen) continue;
    n++;
    const v = p.body.velocity, w = p.body.angularVelocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const spin = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    if (speed < CALM_SPEED && spin < CALM_SPIN) {
      p.calm = (p.calm || 0) + dt;
      if (p.calm > CALM_TIME) { p.body.sleep(); n--; }
    } else {
      p.calm = 0;
    }
  }
  if (n && sinceDisturb > SETTLE_DEADLINE) { parkAllPieces(); return 0; }
  awake = n;
  return n;
}

export function shake() {
  audio.whoosh(true);
  wakeAll();
  // Straight into the SoA: a shake is one pass over a couple of hundred slots and
  // allocates nothing.
  for (const p of pieces) {
    const i = p.body.i;
    world.vx[i] = (Math.random() - 0.5) * 2.6;
    world.vy[i] = 1.4 + Math.random() * 2.0;
    world.vz[i] = (Math.random() - 0.5) * 2.6;
    world.wx[i] = (Math.random() - 0.5) * 10;
    world.wy[i] = (Math.random() - 0.5) * 10;
    world.wz[i] = (Math.random() - 0.5) * 10;
  }
  for (let i = 0; i < 5; i++) {
    setTimeout(() => audio.pebbleClink(0.02 + Math.random() * 0.02), 90 + i * 110);
  }
}

// --- build ---------------------------------------------------------------
let currentMode = 'separate';
let currentStyle = 'jamjar';
let built = false;
let lastSave = null;
let builtPortrait = false;
let relayouting = false;
// The world-space box the camera has to frame.
let box = { hw: 1.2, zmin: -0.8, zmax: 0.8, top: 1.6 };

function clearScene() {
  for (const j of jars) {
    group.remove(j.mesh);
    j.mesh.geometry.dispose();
    j.mesh.material.dispose();
  }
  jars.length = 0;
  while (contacts.children.length) contacts.remove(contacts.children.pop());
  while (planks.children.length) planks.remove(planks.children.pop());
  while (posts.children.length) posts.remove(posts.children.pop());
  // Every piece goes at once, so the whole world is reset rather than freeing
  // slots one at a time — the jars are rebuilt from the save on every open.
  world.clear();
  pieceByIndex.fill(null);
  pieces.length = 0;
  for (const id of GLASS_IDS) pieceMeshes[id].count = 0;
  while (ceramicItems.children.length) {
    const c = ceramicItems.children.pop();
    c.geometry.dispose();
    c.material.dispose();
    ceramicItems.remove(c);
  }
}

/**
 * Jar positions for `shelves` planks, filled bottom row first. Everything sits at
 * the same z, so no jar is ever hidden behind another.
 */
function shelfPositions(n, shelves, spacing, levelH) {
  const perRow = Math.ceil(n / shelves);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const rowCount = Math.min(perRow, n - row * perRow);
    out.push({
      cx: (inRow - (rowCount - 1) / 2) * spacing,
      // Bottom plank last in the array order would look odd when a new colour
      // appears, so row 0 is the BOTTOM shelf and it fills upwards.
      cy: (shelves - 1 - row) * levelH,
      cz: 0,
    });
  }
  return { pos: out, perRow };
}

/** World box the camera must frame. */
function boxFor(pos, jarR, jarH, extraTop) {
  let hw = 0, top = 0;
  for (const p of pos) {
    hw = Math.max(hw, Math.abs(p.cx) + jarR * 1.1);
    top = Math.max(top, p.cy + jarH * 1.06);
  }
  return { hw, zmin: -jarR * 1.3, zmax: jarR * 1.3, top: top + extraTop };
}

/**
 * How many planks? It depends on the viewport — a landscape tablet wants two long
 * shelves, a phone in portrait wants four short ones — so instead of guessing we
 * fit the camera to each candidate and keep whichever gets the camera closest
 * (i.e. makes the jars biggest).
 */
function chooseLayout(n, jarR, jarH, spacing, levelH, extraTop) {
  let best = null;
  const maxShelves = Math.min(4, n);
  for (let shelves = 1; shelves <= maxShelves; shelves++) {
    const g = shelfPositions(n, shelves, spacing, levelH);
    const b = boxFor(g.pos, jarR, jarH, extraTop);
    const cost = fitDistance(b);
    if (!best || cost < best.cost) best = { cost, shelves, ...g, box: b };
  }
  return best;
}

/**
 * Build the shelf for a save. `mode` is 'separate' (a jar per colour) or
 * 'mixed' (one big jar with the lot poured in).
 */
export function build(save, mode, styleId) {
  currentMode = mode;
  currentStyle = styleId;
  lastSave = save;
  builtPortrait = window.innerWidth < window.innerHeight;
  clearScene();
  built = true;
  updateLimits();

  const style = BOTTLE_BY_ID[styleId] || BOTTLES[0];
  const owned = GLASS_IDS.filter((id) => (save.glass[id] || 0) > 0);
  const done = save.completed.filter((b) => BEACH_BY_ID[b]);

  // -- jars ---------------------------------------------------------------
  // The rebuilt ceramics get the top plank, so their height has to be known
  // BEFORE the layout is chosen — otherwise the camera gets pulled back after the
  // fact and every jar shrinks.
  const ceramicTop = done.length ? 0.86 : 0;
  let ceramicY = 0;
  let jarR = 0;
  let half = 0;         // the cabinet's half-width; every plank spans it
  let deep = 0;         // plank depth

  if (mode === 'mixed' || owned.length === 0) {
    const scale = 2.0;
    const innerR = style.r * scale * 0.92;
    const h = style.h * scale;
    jarR = style.r * scale;
    const mesh = makeJarMesh(style, scale, 0xe4f2ec);
    mesh.position.set(0, 0, 0);
    group.add(mesh);
    jars.push({ mesh, cx: 0, cy: 0, cz: 0, innerR, h, neck: style.neck, fillN: 0 });
    addContact(0, 0, 0, jarR * 2.5);
    half = jarR * 1.2;
    deep = jarR * 2.2;
    addPlank(0, 0, half * 2, deep);
    ceramicY = h * 1.06 + 0.34;
    box = { hw: half + 0.1, zmin: -deep / 2, zmax: deep / 2, top: h * 1.06 + ceramicTop };
  } else {
    const scale = 1.15;
    jarR = style.r * scale;
    const innerR = jarR * 0.9;
    const h = style.h * scale;
    // Jars nearly touching: generous spacing was what made the plank huge and
    // every jar small.
    const spacing = jarR * 2.16;
    // Enough headroom above each jar to lift it out — any more is wasted screen.
    // A little more than the jar's own height: the shelf above sits forward of the
    // jar behind it, so without this its front edge crops every rim.
    const levelH = h * 1.06 + 0.42;
    const layout = chooseLayout(owned.length, jarR, h, spacing, levelH, ceramicTop);

    for (let i = 0; i < owned.length; i++) {
      const id = owned[i];
      const { cx, cy } = layout.pos[i];
      const mesh = makeJarMesh(style, scale, new THREE.Color(GLASS[id].hex).lerp(new THREE.Color(0xffffff), 0.55).getHex());
      mesh.position.set(cx, cy, 0);
      group.add(mesh);
      jars.push({ mesh, cx, cy, cz: 0, innerR, h, neck: style.neck, fillN: 0 });
      addContact(cx, cy, 0, jarR * 2.3);
    }
    // Full-width planks, one per shelf — a cabinet, not a set of floating slabs.
    half = layout.box.hw;
    deep = jarR * 2.4;
    for (let s = 0; s < layout.shelves; s++) addPlank(s * levelH, 0, half * 2, deep);
    ceramicY = layout.box.top - ceramicTop + 0.34;
    box = { ...layout.box, hw: half + 0.1, zmin: -deep / 2, zmax: deep / 2 };
  }

  backBoard.visible = true;
  // Extended well below the bottom shelf: the board sits further back, so at this
  // camera angle its lower edge projects ABOVE the front of the plank unless it
  // runs on past it.
  const boardH = box.top + 2.2;
  backBoard.scale.set(half * 2 + 0.2, boardH, 1);
  backBoard.position.set(0, box.top + 0.3 - boardH / 2, -deep * 0.52);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, shelfMat);
    p.scale.set(1, box.top + 0.36, deep);
    p.position.set(sx * (half + 0.05), (box.top + 0.36) / 2 - 0.07, 0);
    posts.add(p);
  }

  // The jars exist now, so the backend that wants real floors can have them (no-op
  // on lphys). Must happen BEFORE the pieces are spawned, or the first settle drops
  // them through nothing.
  jarStatics();

  // -- pieces -------------------------------------------------------------
  const q = profile();
  const budget = Math.min(MAX_PIECES, q.collectionMaxPieces);
  const perJar = Math.min(PER_JAR_CAP, q.collectionPerJarCap);
  const cap = Math.max(6, Math.min(perJar, Math.floor(budget / Math.max(1, owned.length))));
  const cursor = {};
  for (const id of GLASS_IDS) cursor[id] = 0;
  let maxRadius = 0.02;

  owned.forEach((id, idx) => {
    const jarIdx = currentMode === 'mixed' ? 0 : idx;
    const jar = jars[Math.min(jarIdx, jars.length - 1)];
    const n = Math.min(save.glass[id], cap);
    for (let k = 0; k < n; k++) {
      // Piece size is a FRACTION OF THE JAR, not an absolute — with a fixed
      // radius a big jar full of glass looked like a jar full of sand. At the old
      // fraction (0.15) only four pieces fitted across a jar, which read as
      // boulders in a bucket; this is about eight across, which reads as glass.
      // Halved from (0.085 + rnd*0.03) — user wanted the glass pieces 50% smaller.
      const radius = jar.innerR * (0.0425 + Math.random() * 0.015);
      // Spawn spread across the jar floor in layers. Stacking them in one tall
      // column meant a 26-piece jar started as a 4-unit spike that then blew
      // itself apart against the containment ceiling.
      const perLayer = Math.max(3, Math.floor(0.5 * (jar.innerR * jar.innerR) / (radius * radius)));
      const layer = Math.floor(jar.fillN / perLayer);
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * Math.max(0.01, jar.innerR - radius - 0.01);
      const idx = world.add({
        x: jar.cx + Math.cos(a) * rr,
        y: jar.cy + radius + 0.02 + layer * radius * 2.15,
        z: jar.cz + Math.sin(a) * rr,
        r: radius,
        mass: 0.05,
        mode: MODE_SPIN,        // glass tumbles as it falls; it does not roll
      });
      if (idx < 0) break;
      world.setEuler(idx, Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
      if (radius > maxRadius) maxRadius = radius;
      jar.fillN++;
      const ii = cursor[id]++;
      const rec = {
        colourId: id, mi: id, ii, body: new Body(world, idx), radius,
        jar: jars.indexOf(jar),
      };
      pieceByIndex[idx] = rec;
      pieces.push(rec);
    }
  });
  for (const id of GLASS_IDS) pieceMeshes[id].count = cursor[id];
  // The spatial hash's cell has to be at least the largest piece's diameter.
  world.setCellFromMaxRadius(maxRadius);

  // -- rebuilt ceramics on a riser behind the jars -------------------------
  // Everything you have put back together, slowly turning on its own little
  // shelf. This is the payoff for ten shards, so it belongs in the collection
  // and not only in the one-off assemble animation.
  if (done.length) {
    const gap = 0.72;
    addPlank(ceramicY, 0, half * 2, Math.min(deep, 0.95));
    done.forEach((beachId, i) => {
      const b = BEACH_BY_ID[beachId];
      const geo = ceramicItemGeometry(b.ceramic.kind);
      const mat = ceramicMaterial(b.ceramic.base, b.ceramic.accent);
      mat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(0.52);
      m.position.set((i - (done.length - 1) / 2) * gap, ceramicY + 0.02, 0);
      m.userData.spin = 0.3 + i * 0.07;
      ceramicItems.add(m);
    });
    box = { hw: Math.max(box.hw, done.length * gap / 2 + 0.3), zmin: box.zmin, zmax: box.zmax, top: box.top };
  }

  for (const id of GLASS_IDS) pieceMeshes[id].visible = pieceMeshes[id].count > 0;

  // Settle the heaps before the screen is ever shown, then park them: the jars
  // should be at rest the moment the player looks at them. This is the collection
  // view's own "entering a beach" hitch, so the Low profile settles for fewer
  // steps over fewer bodies — and parkAllPieces() freezes whatever is left, so a
  // shorter settle can never leave the jars twitching.
  const settleSteps = Math.min(140, q.collectionSettleSteps);
  world.wakeAll(settleSteps + 60);
  for (let i = 0; i < settleSteps && world.awakeCount(); i++) world.stepOnce();
  parkAllPieces();
  frameCamera();
}

function addContact(cx, cy, cz, size) {
  const m = new THREE.Mesh(contactGeo, contactMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, cy + 0.004, cz);
  m.scale.set(size, size, 1);
  m.renderOrder = 2;
  contacts.add(m);
}

/** A plank whose TOP surface is at y. */
function addPlank(y, z, w, d) {
  const m = new THREE.Mesh(plankGeo, shelfMat);
  m.position.set(0, y - 0.035, z);
  m.scale.set(w, 1, d);
  planks.add(m);
}

/** Pour everything into one jar, or sort it back out again. */
export function setMode(save, mode) {
  build(save, mode, currentStyle);
  // Lift everything so the rebuild reads as a pour rather than a teleport.
  wakeAll();
  for (const p of pieces) {
    const i = p.body.i;
    // `place` so the lift is a teleport and not a velocity: the pour is meant to
    // start from a standstill above the jar and fall.
    world.place(i, world.px[i], world.py[i] + 0.7 + Math.random() * 0.7, world.pz[i]);
    world.vx[i] = (Math.random() - 0.5) * 0.4;
    world.vy[i] = -0.4;
    world.vz[i] = (Math.random() - 0.5) * 0.4;
  }
  audio.whoosh(false);
  for (let i = 0; i < 6; i++) {
    setTimeout(() => audio.pebbleClink(0.018 + Math.random() * 0.02), 120 + i * 90);
  }
}

export function mode() { return currentMode; }
export function style() { return currentStyle; }
export function isBuilt() { return built; }

// --- containment ---------------------------------------------------------
/**
 * The jar walls, floor and neck, as a POSITION clamp run inside the step over the
 * awake set only (both backends call this after their solve).
 *
 * It touches no velocities at all, and that is the point: lphys derives the
 * velocity from how far the piece actually moved this step — and the Rapier wrapper
 * cancels the velocity along whatever axis the clamp moved, for the same reason — so
 * a piece stopped by
 * the glass comes out of the step with no velocity into the glass — no reflection
 * coefficient to tune, and no chance of the clamp quietly feeding energy back into
 * a heap that is trying to settle (which is exactly what used to keep it shivering).
 */
function clampJars(w) {
  const list = w.awakeList, n = w.nAwake;
  const px = w.px, py = w.py, pz = w.pz, moved = w.moved;
  for (let k = 0; k < n; k++) {
    const i = list[k];
    const p = pieceByIndex[i];
    if (!p) continue;
    const jar = jars[p.jar] || jars[0];
    if (!jar) continue;
    const r = p.radius;
    let hit = false;
    const dx = px[i] - jar.cx, dz = pz[i] - jar.cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    // The wall follows the jar's silhouette, so glass funnels into the neck. All
    // heights are relative to the jar's own shelf, not the world floor.
    const t = (py[i] - jar.cy) / jar.h;
    const taper = t > 0.72
      ? 1 - (1 - jar.neck) * Math.min(1, (t - 0.72) / 0.28)
      : 1;
    const maxD = Math.max(0.005, jar.innerR * taper - r);
    if (d > maxD) {
      const inv = 1 / (d || 1);
      px[i] = jar.cx + dx * inv * maxD;
      pz[i] = jar.cz + dz * inv * maxD;
      hit = true;
    }
    if (py[i] < jar.cy + r) { py[i] = jar.cy + r; hit = true; }
    const ceiling = jar.cy + jar.h * 1.5;
    if (py[i] > ceiling) { py[i] = ceiling; hit = true; }
    if (hit) moved[i] = 1;
  }
}

// --- camera --------------------------------------------------------------
// The shelf is framed into the band BETWEEN the top button row and the bottom
// sheet, not into the raw viewport. The band is off-centre, so rather than
// wasting half the height on symmetric margins the projection itself is shifted
// with setViewOffset: that puts the camera axis on the middle of the band and
// lets the fit stay symmetric (and therefore tight).
// A low, near-eye-level angle. Steeper looks INTO the jars, which sounds better
// than it is: the glass lies in the bottom, so the side-on view is the one that
// shows it, and a low angle costs far less screen height per row of depth.
const PITCH = THREE.MathUtils.degToRad(22);
let limX = 0.93;
let limY = 0.62;
let camDist = 0;
const _fp = new THREE.Vector3();

function measureBand() {
  const H = window.innerHeight;
  const nav = document.querySelector('#collectionUI .navbar');
  const sheet = document.querySelector('#collectionUI .bottomsheet');
  // offsetHeight is 0 while the screen is still hidden (build runs before the
  // screen is shown), so fall back to a sensible guess and re-fit after show.
  // Only the back-to-arcade pill is above the shelf now; the buttons all live in
  // the fixed bottom strip, with the totals sheet stacked on top of it.
  const navH = nav && nav.offsetHeight ? nav.offsetHeight : 66;
  const sheetH = sheet && sheet.offsetHeight
    ? Math.min(sheet.offsetHeight + navH + 6, H * 0.56)
    : Math.min(H * 0.4, 268);
  const top = Math.min(54, H * 0.16);
  const bottom = Math.max(top + H * 0.22, H - sheetH);
  return { top, bottom, centre: (top + bottom) / 2, half: (bottom - top) / 2, H };
}

function updateLimits() {
  const W = window.innerWidth, H = window.innerHeight;
  const band = measureBand();
  camera.aspect = W / H;
  camera.setViewOffset(W, H, 0, H / 2 - band.centre, W, H);
  limX = 0.93;
  // A little slack so tipping the shelf does not swing a jar off screen.
  limY = (2 * band.half / H) * 0.95;
  camera.updateProjectionMatrix();
}

function placeCamera(dist, b) {
  const tz = (b.zmin + b.zmax) / 2;
  const ty = b.top * 0.5;          // the middle of the cabinet
  camera.position.set(0, ty + Math.sin(PITCH) * dist, tz + Math.cos(PITCH) * dist);
  camera.lookAt(0, ty, tz);
  camera.updateMatrixWorld(true);
}

function fits(dist, b) {
  placeCamera(dist, b);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanX = tanY * camera.aspect;
  for (const sx of [-1, 1]) {
    for (const z of [b.zmin, b.zmax]) {
      for (const y of [0, b.top]) {
        _fp.set(sx * b.hw, y, z).applyMatrix4(camera.matrixWorldInverse);
        const depth = -_fp.z;
        if (depth < 0.2) return false;
        if (Math.abs(_fp.x) > limX * tanX * depth) return false;
        if (Math.abs(_fp.y) > limY * tanY * depth) return false;
      }
    }
  }
  return true;
}

/** Smallest distance at which the whole box sits inside the safe band. */
function fitDistance(b) {
  let lo = 0.8, hi = 26;
  if (!fits(hi, b)) return hi;
  if (fits(lo, b)) return lo;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid, b)) hi = mid; else lo = mid;
  }
  return hi;
}

export function frameCamera() {
  // Rotating the tablet can change which grid shape is best, so rebuild the
  // layout on an orientation flip rather than just pulling the camera back.
  const portrait = window.innerWidth < window.innerHeight;
  if (built && lastSave && portrait !== builtPortrait && !relayouting) {
    relayouting = true;
    build(lastSave, currentMode, currentStyle);
    relayouting = false;
    return camDist;
  }
  updateLimits();
  camDist = fitDistance(box);
  placeCamera(camDist, box);
  return camDist;
}

// --- frame ---------------------------------------------------------------
const _grav = new THREE.Vector3();
const _rot = new THREE.Quaternion();
const _euler = new THREE.Euler();

export function update(dt) {
  if (!built) return;

  // tilt spring
  const tiltMoving = Math.abs(tilt.tx - tilt.x) > 2e-4 || Math.abs(tilt.tz - tilt.z) > 2e-4;
  tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 7);
  tilt.z += (tilt.tz - tilt.z) * Math.min(1, dt * 7);
  group.rotation.set(tilt.x, 0, tilt.z);

  for (const c of ceramicItems.children) c.rotation.y += dt * c.userData.spin;

  // While the shelf is tipping, gravity has to follow it and the glass has to be
  // awake to answer. Once the shelf is level and every piece is parked there is
  // nothing left to simulate, so the world stops being stepped at all.
  if (tiltMoving) wakeAll();
  if (awake) {
    _euler.set(tilt.x, 0, tilt.z);
    _rot.setFromEuler(_euler).invert();
    _grav.set(0, -G, 0).applyQuaternion(_rot);
    world.setGravity(_grav.x, _grav.y, _grav.z);

    // The wall clamp runs inside the step (world.clampFn), so this is the whole
    // simulation for the frame.
    world.step(Math.min(dt, 1 / 30));
    settlePieces(Math.min(dt, 1 / 30));
  } else if (!needSync) {
    return;
  }
  const force = needSync;
  needSync = false;

  // Sync instances — only the pieces the world says moved, exactly as the beach
  // does, so a settled shelf uploads nothing.
  const touched = {};
  for (const p of pieces) {
    const i = p.body.i;
    if (!force && !world.moved[i]) continue;
    world.moved[i] = 0;
    _v.set(world.px[i], world.py[i], world.pz[i]);
    _q.set(world.qx[i], world.qy[i], world.qz[i], world.qw[i]);
    // Flat and wide: a shard, not a pebble. The collider stays a sphere.
    _s.set(p.radius * 1.9, p.radius * 0.62, p.radius * 1.45);
    _m.compose(_v, _q, _s);
    pieceMeshes[p.mi].setMatrixAt(p.ii, _m);
    touched[p.mi] = true;
  }
  for (const id of Object.keys(touched)) pieceMeshes[id].instanceMatrix.needsUpdate = true;
}

export function bodyCount() { return pieces.length; }

/**
 * Live quality flip. Only the step rate and the relaxation passes have to change —
 * the piece budget is read on every build(), and the collection is rebuilt every
 * time it is opened.
 */
export function applyQuality() {
  const q = profile();
  world.setStepHz(q.collectionStepHz);
  world.passes = q.collectionRelaxPasses;
  world.resetClock();
}

export function relaxPasses() { return world.passes; }
export function stepHz() { return world.stepHz(); }

/**
 * Where the glass actually IS: the height of the highest piece (so a shake can be
 * seen to lift the heap) and how many pieces have escaped their jar. `outOfJar`
 * must be 0 — the jar has no colliders, so if the clamp and the step rate ever
 * disagreed the glass would simply leave.
 */
export function heapStats() {
  let top = -9, outOfJar = 0;
  for (const p of pieces) {
    const jar = jars[p.jar] || jars[0];
    if (p.body.position.y > top) top = p.body.position.y;
    if (!jar) continue;
    const dx = p.body.position.x - jar.cx, dz = p.body.position.z - jar.cz;
    if (Math.hypot(dx, dz) > jar.innerR + 0.01) outOfJar++;
    if (p.body.position.y < jar.cy - p.radius) outOfJar++;
  }
  return { top: +(top === -9 ? 0 : top).toFixed(3), outOfJar };
}

/**
 * The per-colour InstancedMeshes, for the same "no idle uploads" probe the beach
 * gets: with the jars settled nothing here should have `needsUpdate` written.
 */
export function debugMeshes() { return Object.values(pieceMeshes); }

export function debugInfo() {
  const band = measureBand();
  const heap = heapStats();
  return {
    mode: currentMode, style: currentStyle, jars: jars.length, pieces: pieces.length,
    stepHz: stepHz(), relaxPasses: world.passes,
    topY: heap.top, outOfJar: heap.outOfJar,
    awake, worldAwake: world.awakeCount(),
    sinceDisturb: +Math.min(sinceDisturb, 99).toFixed(2),
    camDist: +camDist.toFixed(2), limY: +limY.toFixed(3),
    box: { hw: +box.hw.toFixed(2), zmin: +box.zmin.toFixed(2), zmax: +box.zmax.toFixed(2), top: +box.top.toFixed(2) },
    band: { top: Math.round(band.top), bottom: Math.round(band.bottom) },
  };
}
