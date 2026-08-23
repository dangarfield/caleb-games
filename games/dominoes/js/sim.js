// The part registry, the render sync, and the physics.
//
// One module on purpose: the per-frame loop touches all three, and cross-module
// property lookups in the hot path are exactly the kind of cost the PERFORMANCE
// MANDATE is about. Everything is a structure-of-arrays over one flat part index
// space; nothing in step() or syncActive() allocates.
//
// A PART is one rendered instance plus (usually) one Rapier collider. Dominoes are
// parts, and so is every piece of every trick item. The part index is stored in the
// body's userData, so the active-body callback gets from Rapier straight into our
// arrays with one property read.
//
// THE FIVE THINGS THAT MAKE THIS FAST
//  1. Build mode creates NO bodies at all (see layout.js). hasWorld() is false and
//     step() returns immediately, so a 300-domino table costs the same to build on as
//     an empty one.
//  2. Fixed 60 Hz with a clamped accumulator, max 3 substeps. Never a frame delta:
//     measured, frame-delta jitter drops a 100-domino run to 5 fallen, and a single
//     dt = 1 s step pushes 5 dominoes THROUGH the floor.
//  3. Fallen-and-calm dominoes are converted to Fixed, not slept. 8x at 1500 bodies,
//     and the awake set stays around 10 however long the run is. Never park a body
//     that has not moved yet: parking the standing dominoes ahead of the wave walls
//     the chain off (measured, 3 of 500 fell).
//  4. Only bodies from forEachActiveRigidBody() are read and uploaded, and
//     instanceMatrix.needsUpdate is set only on meshes that actually changed. A
//     settled table uploads zero bytes and does zero solver work.
//  5. Item behaviours (bells ringing, towers collapsing, balls being credited) are
//     evaluated inside that same active-body pass, from state we have already read.
//     There is no contact-event queue and no second traversal.

import * as THREE from 'three';
import { meshes, CAPS, perf } from './env.js';
import {
  MESH, DOM_H, DOM_HH, DOM_W, DOM_T, DOM_DENSITY, PHYS, TABLES, TABLE_THICK, KERB_H,
  COLOURS, SKINS,
} from './consts.js';
import { ITEMS } from './items-def.js';
import { profile } from './quality.js';
import * as audio from './audio.js';
import { burstConfetti } from './fx.js';

const H = PHYS.H;
const NMAX = CAPS[0] + CAPS[1] + CAPS[2] + CAPS[3];
const FALL_DROP = 1 - PHYS.fallenFrac;     // 0.30 of its own height below where it began

// --- tags ------------------------------------------------------------------
const T_NONE = 0, T_DOMINO = 1, T_BELL = 2, T_CHIME = 3, T_TRIGGER = 4,
  T_MARBLE = 5, T_BALL = 6, T_SPINNER = 7, T_FLIPPER = 8,
  T_SPLITTER = 10, T_TOWER = 11, T_TOWERTOP = 12, T_LAUNCH = 13;
const TAG_ID = {
  bell: T_BELL, chime: T_CHIME, trigger: T_TRIGGER, marble: T_MARBLE, ball: T_BALL,
  spinner: T_SPINNER, flipper: T_FLIPPER, splitter: T_SPLITTER,
  tower: T_TOWER, towertop: T_TOWERTOP, launch: T_LAUNCH,
};
/**
 * What a part reports to the achievements as "an item that did something" — the id of the
 * trick it belongs to, filled in per build.
 *
 * This used to be a per-TAG table of names, which was wrong in one measurable way: the
 * Xylophone's bars are tagged 'chime', so a run containing a bell and a xylophone reported
 * two items, not three, and Clockwork ("five different tricks in one run") quietly
 * undercounted. Reading the item's own type instead is exact by construction, and every
 * trick added later reports itself with no table to remember to edit.
 */
const itemNames = [];

// --- the registry ---------------------------------------------------------
const P = {
  n: 0,
  mesh: new Uint8Array(NMAX),
  inst: new Int32Array(NMAX),
  x: new Float32Array(NMAX), y: new Float32Array(NMAX), z: new Float32Array(NMAX),
  qx: new Float32Array(NMAX), qy: new Float32Array(NMAX), qz: new Float32Array(NMAX),
  qw: new Float32Array(NMAX),
  sx: new Float32Array(NMAX), sy: new Float32Array(NMAX), sz: new Float32Array(NMAX),
  x0: new Float32Array(NMAX), y0: new Float32Array(NMAX), z0: new Float32Array(NMAX),
  yaw0: new Float32Array(NMAX),
  fallY: new Float32Array(NMAX),
  dens: new Float32Array(NMAX),
  fric: new Float32Array(NMAX),
  // Damping, and only the parts that ask for it get any. See the ROLLING RESISTANCE note in
  // the body-creation loop: it is what stops the Rocket's tube rolling for 45 s.
  ldamp: new Float32Array(NMAX),
  adamp: new Float32Array(NMAX),
  ccd: new Uint8Array(NMAX),
  calm: new Uint8Array(NMAX),
  parked: new Uint8Array(NMAX),
  noPark: new Uint8Array(NMAX),
  dyn: new Uint8Array(NMAX),
  fallen: new Uint8Array(NMAX),
  fired: new Uint8Array(NMAX),
  // A trigger part may not fire until it has been seen AT REST once. See ARMING below.
  armed: new Uint8Array(NMAX),
  moved: new Uint8Array(NMAX),
  tag: new Uint8Array(NMAX),
  note: new Uint8Array(NMAX),
  gate: new Uint8Array(NMAX),        // 0 = must have fallen, 1 = must have been displaced
  colour: new Int32Array(NMAX),
  itemIdx: new Int32Array(NMAX),
  domIdx: new Int32Array(NMAX),
  domColour: new Int8Array(NMAX),
  curved: new Uint8Array(NMAX),
  attach: new Int32Array(NMAX),
  aox: new Float32Array(NMAX), aoy: new Float32Array(NMAX), aoz: new Float32Array(NMAX),
  aqx: new Float32Array(NMAX), aqy: new Float32Array(NMAX), aqz: new Float32Array(NMAX),
  aqw: new Float32Array(NMAX),
  body: new Array(NMAX),
};
export { P as parts };

const instCount = [0, 0, 0, 0];
const attached = new Int32Array(96);
let nAttached = 0;
const ballParts = new Int32Array(24);
let nBalls = 0;
const parkList = new Int32Array(NMAX);
let nPark = 0;
// --- the launchers ---------------------------------------------------------
// A part spec carrying `launch: [ix, iy, iz]` gets one row here rather than three more
// Float32Array(NMAX)s: at most a handful of parts in any layout are launchable, and NMAX
// is ~700. impItem is the item the row belongs to, so firing is "scan 48 ints".
const impPart = new Int32Array(48);
const impItem = new Int32Array(48);
const impX = new Float32Array(48), impY = new Float32Array(48), impZ = new Float32Array(48);
let nImp = 0;
// Items whose trigger tipped this frame. Applied AFTER world.forEachActiveRigidBody, for
// the same reason parking is: mutating bodies while Rapier walks its own active set is
// asking for trouble.
const launchQ = new Int32Array(32);
let nLaunch = 0;
// One flag per ITEM, not per trigger part, because each launcher carries three pink dominoes
// (items-def.js launchTrio) and a chain that arrives square knocks over more than one of them.
// P.fired guards the part, so without this the second and third would each queue the item
// again and fireLaunchers would apply the whole impulse a second and third time — a rocket at
// three times the speed, and run.launched reading 3. Sized in build() (there is no cap on
// item count), and only ever grown, so no allocation happens once a table is set up.
let itemLaunched = new Uint8Array(64);
// --- the carry -------------------------------------------------------------
// `carry: [cy, r, xdrift, vmin]` on a part means: when this item's launcher fires, watch the
// part until it reaches the item's local z = 0, then DRIVE it once round a circle of radius r
// centred on the item-local point (0, cy, 0), drifting `xdrift` sideways over the turn, and
// hand it back to the physics at the bottom moving forward. Only the Loop the Loop uses it.
//
// WHY THE LOOP IS DRIVEN AND NOT ROLLED, which is the one thing about this item worth
// knowing. A loop-the-loop built as colliders does not work at this timestep, and it is not
// close. Two compounding reasons, both measured (headless desktop Chrome, ?q=low):
//
//   1. A curved track has to be faceted, and two neighbouring facet planes each tangent to
//      the ball's running circle MEET AT A LARGER RADIUS than that circle — so every joint is
//      a sharp concave corner in the path of the ball's CENTRE. Rounding it means striking the
//      next plane at v*sin(theta), and with restitution 0 that component is simply gone.
//      One turn costs cos(2pi/N)^N ~ exp(-2pi^2/N) of the speed: N=16 keeps 29%, N=32 keeps
//      54%, N=64 keeps 73%. A tablet is not going to run 64 colliders per loop.
//   2. Worse, and fatal: at the 2.7 m/s a ball needs to hold the top of a 110 mm loop it
//      travels 45 mm per 1/60 s step, while an N=32 facet chord is 10.8 mm. It crosses four
//      facets per step and the whole 346 mm circumference in about EIGHT steps, so the solver
//      never sees a circle at all. Steps-per-loop only grows as sqrt(R), so a bigger loop does
//      not fix it either. The built track measured 12% energy retention against the ~64% the
//      facet model alone predicts, and the ball topped out at y 0.084 of the 0.100 it needed.
//
// So the loop is a PROP and the ball is animated round it. This is also the cheap option: no
// rail colliders, no CCD hunting a 6 mm plate, ~15 frames of one sin/cos.
const carPart = new Int32Array(8);
const carItem = new Int32Array(8);
const carIx = new Float32Array(8), carIz = new Float32Array(8);   // the item's own origin
const carC = new Float32Array(8), carS = new Float32Array(8);     // cos/sin of the item's yaw
const carCy = new Float32Array(8), carR = new Float32Array(8);
const carXd = new Float32Array(8), carVmin = new Float32Array(8);
const carState = new Uint8Array(8);      // 0 idle, 1 armed (waiting at the entry), 2 carrying
const carPhi = new Float32Array(8), carV0 = new Float32Array(8);
const carLx0 = new Float32Array(8);     // item-local x of the ball when the drive picked it up
let nCar = 0;        // rows in use
let nCarLive = 0;    // rows not idle, so the ordinary step pays one int test and no loop
const TAU = Math.PI * 2;
// (10/7)*g. A rolling sphere carries (7/10)mv^2, so climbing h costs v^2 by this much per
// metre — the factor that makes the ball visibly slow over the top.
const ROLL_G = 14.014;
// "Did it actually move?" thresholds, compared against the pose last DRAWN.
// 20 um of travel, or a quaternion change of ~0.01 deg (5 um at the top of a domino):
// both are far below one pixel at any sane zoom on a 1.9 m table.
const MOVE_EPS2 = 4e-10;
const MOVE_EPSQ = 2e-4;
// "At rest" for the purposes of ARMING a trigger: 6.3 mm/s and 0.2 rad/s. Chosen with a
// 5x margin under the LOWEST firing threshold (the chime at 40 mm/s, the springboard at
// 1 rad/s), so a part cannot arm and fire in the same breath.
const ARM_V2 = 4e-5;
const ARM_W2 = 0.04;
/** layout domino index -> part index, so the start marker and eraser are O(1). */
const domPart = new Int32Array(CAPS[0]);

let overflow = false;
export function didOverflow() { return overflow; }
export function partForDomino(k) {
  return (k >= 0 && k < CAPS[0] && domPart[k] >= 0) ? domPart[k] : -1;
}

// --- run statistics (read by progression.js when a run ends) --------------
export const run = {
  fell: 0, colours: 0, colourMask: 0, elevated: 0, curvedFell: 0,
  bells: 0, bestBallKnock: 0, towerCollapsed: 0, confettiFired: 0, launched: 0,
  forkL: 0, forkR: 0, items: {}, itemCount: 0, active: 0, seconds: 0, placed: 0,
};
function resetRun() {
  run.fell = 0; run.colours = 0; run.colourMask = 0; run.elevated = 0; run.curvedFell = 0;
  run.bells = 0; run.bestBallKnock = 0; run.towerCollapsed = 0; run.confettiFired = 0;
  run.launched = 0;
  run.forkL = 0; run.forkR = 0; run.items = {}; run.itemCount = 0;
  run.active = 0; run.seconds = 0; run.placed = 0;
}
function trigger(name) {
  if (name && !run.items[name]) { run.items[name] = 1; run.itemCount++; }
}

let splitFell = false, splitX = 0, splitZ = 0, splitFX = 0, splitFZ = 0;
const ballKnocks = new Int32Array(24);

// --- scratch (module level: never allocated inside a frame) ---------------
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _v2 = new THREE.Vector3();
const _q2 = new THREE.Quaternion();

// ==========================================================================
// BUILD
// ==========================================================================
function addPart(spec, worldX, worldZ, yaw, itemIdx, domIdx) {
  const m = spec.m;
  if (instCount[m] >= CAPS[m] || P.n >= NMAX) { overflow = true; return -1; }
  const i = P.n++;
  P.mesh[i] = m;
  P.inst[i] = instCount[m]++;
  P.x[i] = P.x0[i] = worldX;
  P.y[i] = P.y0[i] = spec.y;
  P.z[i] = P.z0[i] = worldZ;
  P.yaw0[i] = yaw;
  // YXZ = Ry * Rx * Rz, so the yaw the child aimed stays outermost and `tilt` (about local
  // X) and `roll` (about local Z) both act in the item's OWN frame whatever it is pointing
  // at. `roll` exists for the Loop's hoop: twelve boxes each lying along its own chord.
  // A part's own `yaw` just adds to the item's, which is what makes it mean "turned within
  // the item": positive swings the part's local +Z toward +X, matching localToWorld above.
  // The Slalom's funnel walls are the reason it exists.
  _e.set(spec.tilt || 0, yaw + (spec.yaw || 0), spec.roll || 0, 'YXZ');
  _q.setFromEuler(_e);
  P.qx[i] = _q.x; P.qy[i] = _q.y; P.qz[i] = _q.z; P.qw[i] = _q.w;
  P.sx[i] = spec.sx; P.sy[i] = spec.sy; P.sz[i] = spec.sz;
  // The "it went over" line is 30% of the part's OWN height below where it started.
  // Derived from the height and the start rather than hard-coded, because a fixed
  // threshold gets a domino standing on a bridge deck 64 mm up wrong every time.
  P.fallY[i] = spec.y - FALL_DROP * spec.sy;
  P.calm[i] = 0; P.parked[i] = 0; P.fallen[i] = 0; P.fired[i] = 0; P.moved[i] = 1;
  P.armed[i] = 0;
  P.dyn[i] = spec.dyn ? 1 : 0;
  P.dens[i] = spec.dens || 650;
  P.fric[i] = spec.fric !== undefined ? spec.fric : PHYS.dominoFriction;
  P.ldamp[i] = spec.ldamp || 0;
  P.adamp[i] = spec.adamp || 0;
  P.ccd[i] = spec.ccd ? 1 : 0;
  P.tag[i] = spec.tag ? (TAG_ID[spec.tag] || T_NONE) : (domIdx >= 0 ? T_DOMINO : T_NONE);
  P.note[i] = spec.note || 0;
  P.colour[i] = spec.col;
  P.itemIdx[i] = itemIdx;
  P.domIdx[i] = domIdx;
  P.domColour[i] = -1;
  P.curved[i] = 0;
  P.attach[i] = -1;
  P.body[i] = null;
  const t = P.tag[i];
  // Gate 0 = things whose whole job is to topple, so parking them early would wall
  // off the chain. Gate 1 = everything else, which parks only once it has been shoved.
  // Gate 2 = has FIRED, for a trick that swings once and is then done with. See
  // parkEligible().
  // T_LAUNCH belongs here for a second reason as well as parking: the "has it toppled" test
  // in onActive is guarded by `gate === 0`, so a launch trigger on gate 1 could never report
  // justFell and the trick could only ever fire by falling off the table. Measured: the pink
  // domino tipped to 46 degrees, shoved the Rocket over, and nothing launched.
  P.gate[i] = (t === T_DOMINO || t === T_SPLITTER || t === T_TRIGGER || t === T_CHIME ||
    t === T_LAUNCH) ? 0 : (t === T_FLIPPER ? 2 : 1);
  // A jointed part or a ball must never be parked: a Fixed pinwheel cannot be spun
  // again and a Fixed ball cannot be knocked again, which reads to a kid as
  // the toy being broken rather than as an optimisation.
  //
  // T_FLIPPER USED TO BE IN THIS LIST and had to come out of it. It swings once and is then
  // done: a Springboard carries exactly one passenger and throws it. The failure is that a
  // jointed arm which has finished moving still registers sub-visible motion for ever, so
  // syncActive() never returns STEP_STILL and main.js's 45 s hard cap is what ends the run.
  // Measured (headless desktop Chrome + swiftshader, ?q=low): the Springboard's plank moved
  // more than MOVE_EPS2 on 1191 frames of a 1770-frame run, against 25-35 for an ordinary
  // spent domino, costing the child 40 seconds of staring at a finished table. Angular
  // damping and a ten-fold stiffer motor spring both failed; parking the spent arm (gate 2)
  // is what worked.
  P.noPark[i] = (m === MESH.BALL || t === T_SPINNER) ? 1 : 0;
  return i;
}

function skinColour(colourIdx, ordinal, skin) {
  const c = COLOURS[colourIdx & 7] || COLOURS[0];
  if (skin === 'gold') return 0xffd32a;
  if (skin === 'stripe') return (ordinal & 1) ? 0xf7f3e8 : c.hex;
  if (skin === 'spots') return (ordinal & 2) ? 0x2b2b40 : c.hex;
  return c.hex;
}

/**
 * Turn a layout into parts (and instances). Pass RAPIER to also create the physics
 * world; pass null to render the layout with no physics at all, which is what build
 * mode does and why build mode is free.
 */
export function build(L, RAPIER) {
  destroyWorld();
  P.n = 0;
  instCount[0] = instCount[1] = instCount[2] = instCount[3] = 0;
  nAttached = 0; nBalls = 0; nPark = 0; nImp = 0; nLaunch = 0;
  nCar = 0; nCarLive = 0; carState.fill(0);
  itemNames.length = 0;
  overflow = false;
  domPart.fill(-1);
  resetRun();
  splitFell = false;
  ballKnocks.fill(0);
  if (itemLaunched.length < L.items.length) itemLaunched = new Uint8Array(L.items.length);
  itemLaunched.fill(0);

  const skin = SKINS[L.skin] ? L.skin : 'plain';
  const dspec = {
    m: MESH.DOMINO, y: 0, sx: DOM_W, sy: DOM_H, sz: DOM_T, tilt: 0,
    col: 0xffffff, dyn: true, dens: DOM_DENSITY, fric: PHYS.dominoFriction,
  };
  for (let k = 0; k < L.dominoes.length; k++) {
    const d = L.dominoes[k];
    dspec.y = d.y + DOM_HH;
    dspec.col = skinColour(d.c, k, skin);
    const i = addPart(dspec, d.x, d.z, d.r, -1, k);
    if (i < 0) break;
    P.domColour[i] = d.c & 7;
    P.curved[i] = d.cv ? 1 : 0;
    if (k < CAPS[0]) domPart[k] = i;
  }
  run.placed = L.dominoes.length;

  for (let it = 0; it < L.items.length; it++) {
    const item = L.items[it];
    const def = ITEMS[item.type];
    if (!def) continue;
    itemNames[it] = item.type;
    const specs = def.parts(item);
    const base = P.n;
    const c = Math.cos(item.r), s = Math.sin(item.r);
    for (let k = 0; k < specs.length; k++) {
      const sp = specs[k];
      const wx = item.x + sp.x * c + sp.z * s;
      const wz = item.z - sp.x * s + sp.z * c;
      const i = addPart(sp, wx, wz, item.r, it, -1);
      if (i < 0) break;
      if (sp.attach !== undefined) {
        P.attach[i] = base + sp.attach;
        if (nAttached < attached.length) attached[nAttached++] = i;
      }
      if (sp.launch && nImp < impPart.length) {
        // Same rotation the part's own offset got: an item-local impulse has to follow the
        // item wherever the child pointed it, or the Rocket fires sideways at every angle
        // except zero.
        impPart[nImp] = i;
        impItem[nImp] = it;
        impX[nImp] = sp.launch[0] * c + sp.launch[2] * s;
        impY[nImp] = sp.launch[1];
        impZ[nImp] = -sp.launch[0] * s + sp.launch[2] * c;
        nImp++;
      }
      if (sp.carry && nCar < carPart.length) {
        // The item's own origin and yaw are kept rather than pre-rotated offsets: the carry
        // has to convert BOTH ways every frame (world -> local to spot the entry, local ->
        // world to place the ball), so it wants the transform, not one baked vector.
        carPart[nCar] = i; carItem[nCar] = it;
        carIx[nCar] = item.x; carIz[nCar] = item.z;
        carC[nCar] = c; carS[nCar] = s;
        carCy[nCar] = sp.carry[0]; carR[nCar] = sp.carry[1];
        carXd[nCar] = sp.carry[2]; carVmin[nCar] = sp.carry[3];
        carState[nCar] = 0;
        nCar++;
      }
      const tg = P.tag[i];
      if ((tg === T_BALL || tg === T_MARBLE) && nBalls < ballParts.length) ballParts[nBalls++] = i;
    }
    item._base = base;
  }

  // Attached parts: work out where they sit in their parent's frame, once.
  for (let k = 0; k < nAttached; k++) {
    const i = attached[k];
    const par = P.attach[i];
    _q.set(P.qx[par], P.qy[par], P.qz[par], P.qw[par]).invert();
    _v.set(P.x[i] - P.x[par], P.y[i] - P.y[par], P.z[i] - P.z[par]).applyQuaternion(_q);
    P.aox[i] = _v.x; P.aoy[i] = _v.y; P.aoz[i] = _v.z;
    _q2.set(P.qx[i], P.qy[i], P.qz[i], P.qw[i]).premultiply(_q);
    P.aqx[i] = _q2.x; P.aqy[i] = _q2.y; P.aqz[i] = _q2.z; P.aqw[i] = _q2.w;
    // A compound body's parts are driven by the parent, and both must survive to be
    // hit again, so neither end of a compound is ever parked. Gate 2 is the exception: the
    // Springboard's slot lips and counterweight are welded to an arm that IS parked once it
    // has fired, and parking the parent silences the whole
    // compound at once, because the loop in syncActive() only moves an attached part when
    // `P.moved[par]` is set.
    if (P.gate[par] !== 2) P.noPark[par] = 1;
    P.noPark[i] = 1;
  }

  if (RAPIER) createWorld(RAPIER, L);
  uploadAll();
  return { count: P.n, overflow };
}

/** Write every instance matrix and colour. On a rebuild only, never per frame. */
function uploadAll() {
  for (let i = 0; i < P.n; i++) writeInstance(i);
  for (let m = 0; m < 4; m++) {
    meshes[m].count = instCount[m];
    meshes[m].instanceMatrix.needsUpdate = true;
    if (meshes[m].instanceColor) meshes[m].instanceColor.needsUpdate = true;
  }
  P.moved.fill(0, 0, P.n);
}

function writeInstance(i) {
  writeMatrix(i);
  _c.setHex(P.colour[i]);
  meshes[P.mesh[i]].setColorAt(P.inst[i], _c);
}

function writeMatrix(i) {
  const m = P.mesh[i];
  _v.set(P.x[i], P.y[i], P.z[i]);
  _q.set(P.qx[i], P.qy[i], P.qz[i], P.qw[i]);
  // The domino geometry is built at real size; everything else is a unit primitive
  // scaled per instance, which is how nine different props share one draw call.
  if (m === MESH.DOMINO) _s.set(1, 1, 1);
  else _s.set(P.sx[i], P.sy[i], P.sz[i]);
  _m.compose(_v, _q, _s);
  meshes[m].setMatrixAt(P.inst[i], _m);
}

// ==========================================================================
// THE PHYSICS WORLD
// ==========================================================================
let R = null;
let world = null;
let acc = 0;
let started = false;
let elapsed = 0;

export function hasWorld() { return !!world; }
export function hasStarted() { return started; }

function createWorld(RAPIER, L) {
  R = RAPIER;
  const q = profile();
  world = new R.World({ x: 0, y: PHYS.gravity, z: 0 });
  world.timestep = H;
  // Measured optimum: 4 iterations gave 100/100 dominoes at 0.152 ms/step. 8 was no
  // more reliable and 30% slower; 2 lost the chain.
  try { world.numSolverIterations = q.solverIterations; } catch (e) { /* older build */ }
  // Rapier's contact tolerances are absolute, and a domino is 7.5 mm thick, so without
  // this the entire game sits inside the solver's own slop. Measured 0.258 -> 0.152
  // ms/step, so this one line is a 40% saving as well as a correctness fix.
  try { world.lengthUnit = PHYS.lengthUnit; } catch (e) { /* pre-0.14 */ }

  const t = TABLES[L.table] || TABLES.small;
  const fb = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -TABLE_THICK / 2, 0));
  world.createCollider(R.ColliderDesc.cuboid(t.w / 2, TABLE_THICK / 2, t.d / 2)
    .setFriction(PHYS.floorFriction).setRestitution(0), fb);

  // Kerbs: below domino height, so a run can never walk off the edge but a launched
  // ball still can (which is a feature - the ball escaping is funny).
  const kb = world.createRigidBody(R.RigidBodyDesc.fixed());
  const kh = KERB_H / 2, kt = 0.006;
  const rims = [
    [0, kh, -t.d / 2 - kt, t.w / 2 + kt * 2, kh, kt],
    [0, kh, t.d / 2 + kt, t.w / 2 + kt * 2, kh, kt],
    [-t.w / 2 - kt, kh, 0, kt, kh, t.d / 2 + kt * 2],
    [t.w / 2 + kt, kh, 0, kt, kh, t.d / 2 + kt * 2],
  ];
  for (let k = 0; k < rims.length; k++) {
    const r = rims[k];
    world.createCollider(R.ColliderDesc.cuboid(r[3], r[4], r[5])
      .setTranslation(r[0], r[1], r[2]).setFriction(0.4).setRestitution(0), kb);
  }

  for (let i = 0; i < P.n; i++) {
    if (P.attach[i] >= 0) continue;                  // rides on its parent's body
    // CCD off by default and ON for the handful of parts that ask for it. `ccd: true` has
    // been sitting in items-def since the Ball Run was written and nothing read it, which was
    // fine while the fastest thing on the table was a 0.33 m/s marble: the table slab is
    // 60 mm thick and a step is 1/60 s, so tunnelling needed 3.6 m/s. The Rocket comes down
    // at 4.3 m/s. Measured without this: it fell straight THROUGH the table and vanished.
    const desc = P.dyn[i]
      ? R.RigidBodyDesc.dynamic().setCanSleep(true).setCcdEnabled(P.ccd[i] === 1)
      : R.RigidBodyDesc.fixed();
    // ROLLING RESISTANCE, on balls only. Rapier models none: a ball that starts rolling on
    // a level table never stops, and a ball is never parked either (a Fixed ball could not
    // be hit again), so ONE marble kept the run "still moving" for 45 s while a child sat
    // waiting for the result. Damping is the cheap, stable way to spend that energy.
    // 0.3 measured: the marble free-coasts 1.21 m off a Ball Run, which is more than the
    // longest table, and a run ends in 9-13 s instead of 45. 0.45 was tried and rejected -
    // it cost the marble the 0.40 m crossing that challenge 1 asks for.
    if (P.mesh[i] === MESH.BALL) desc.setLinearDamping(0.3).setAngularDamping(0.3);
    // Same trap, different shape: a CYLINDER rolls on its side and never stops either. The
    // Rocket's tube lands and rolls, and BOTH dampings are needed to stop it - measured, with
    // angular damping alone it settled into a dead-steady 12.5 mm/s roll (w = 1.03 rad/s,
    // exactly v/r) that did not decay at all in 43 s, because Rapier damps the spin while
    // contact friction feeds it straight back out of the undamped translation. It rolled the
    // width of the table and main.js's 45 s cap ended the run: "10 of 10 fell in 44.9s" for
    // a chain that finished in three seconds. Which is why the balls above damp both, too.
    else if (P.ldamp[i] > 0 || P.adamp[i] > 0) {
      desc.setLinearDamping(P.ldamp[i]).setAngularDamping(P.adamp[i]);
    }
    desc.setTranslation(P.x[i], P.y[i], P.z[i]);
    desc.setRotation({ x: P.qx[i], y: P.qy[i], z: P.qz[i], w: P.qw[i] });
    desc.setUserData(i);
    const rb = world.createRigidBody(desc);
    P.body[i] = rb;
    world.createCollider(colliderFor(i, false), rb);
  }
  for (let k = 0; k < nAttached; k++) {
    const i = attached[k], par = P.attach[i];
    const rb = P.body[par];
    if (!rb) continue;
    P.body[i] = rb;
    world.createCollider(colliderFor(i, true), rb);
    try { rb.recomputeMassPropertiesFromColliders(); } catch (e) { /* densities stand */ }
  }

  buildJoints(L);
  acc = 0; elapsed = 0; started = false;
}

function colliderFor(i, isAttached) {
  const m = P.mesh[i];
  let cd;
  if (m === MESH.BALL) cd = R.ColliderDesc.ball(P.sx[i] / 2);
  else if (m === MESH.CYL) cd = R.ColliderDesc.cylinder(P.sy[i] / 2, P.sx[i] / 2);
  else cd = R.ColliderDesc.cuboid(P.sx[i] / 2, P.sy[i] / 2, P.sz[i] / 2);
  cd.setFriction(P.fric[i]);
  // 0 and 0.4 measured identical (95/100 either way): domino impacts are below the
  // restitution threshold anyway, so take the cheap one.
  cd.setRestitution(PHYS.restitution);
  // Rapier's default density is 1, NOT 1000. Left at the default a domino weighs 8.6
  // milligrams and the whole table behaves like paper.
  cd.setDensity(P.dens[i]);
  if (isAttached) {
    cd.setTranslation(P.aox[i], P.aoy[i], P.aoz[i]);
    cd.setRotation({ x: P.aqx[i], y: P.aqy[i], z: P.aqz[i], w: P.aqw[i] });
  }
  // Soft CCD, on balls only. Regular CCD measured as doing literally nothing at 10 m/s
  // (22 of 40 either way); soft CCD took that to 33 of 40 for about 2% cost. Do NOT
  // add contactSkin - it makes every body hover above the floor.
  if (m === MESH.BALL && P.dyn[i]) {
    try { cd.setSoftCcdPrediction(PHYS.softCcd); } catch (e) { /* older build */ }
  }
  return cd;
}

// The joint builder. Item definitions give anchors in LOCAL item x/z and ABSOLUTE y
// (the same convention as a part spec), and an axis in the item's own frame. The anchors
// are converted into each body's frame below; the AXIS needs no conversion at any yaw,
// because Rapier reads a revolute axis in the bodies' local frames and both ends of one of
// these joints carry the same item yaw. (This is why free item rotation did not have to
// touch the joints — the old note here credited the quarter-turn snap, which was never
// what made it safe.)
let _jItem = null;
const jointBuilder = {
  revolute(a, b, ax, ay, az, axx, axy, axz, stiffness, damping) {
    const ra = P.body[a], rb = P.body[b];
    if (!ra || !rb || ra === rb) return;
    const it = _jItem;
    const c = Math.cos(it.r), s = Math.sin(it.r);
    const wx = it.x + ax * c + az * s;
    const wz = it.z - ax * s + az * c;
    _v.set(wx - P.x[a], ay - P.y[a], wz - P.z[a]);
    _q.set(P.qx[a], P.qy[a], P.qz[a], P.qw[a]).invert();
    _v.applyQuaternion(_q);
    _v2.set(wx - P.x[b], ay - P.y[b], wz - P.z[b]);
    _q2.set(P.qx[b], P.qy[b], P.qz[b], P.qw[b]).invert();
    _v2.applyQuaternion(_q2);
    const params = R.JointData.revolute(
      { x: _v.x, y: _v.y, z: _v.z },
      { x: _v2.x, y: _v2.y, z: _v2.z },
      { x: axx, y: axy, z: axz });
    const j = world.createImpulseJoint(params, ra, rb, true);
    if (stiffness > 0) {
      // A position motor at rest angle 0 is what makes the springboard spring BACK.
      // Torque scale: the plate weighs about 8.5 g and a domino landing 50 mm out
      // applies roughly 0.005 N m, so the stiffness has to sit just under that or the
      // board cannot be tipped at all.
      try { j.configureMotorPosition(0, stiffness, damping); } catch (e) { /* no motor API */ }
    }
  },
};

function buildJoints(L) {
  for (let k = 0; k < L.items.length; k++) {
    const item = L.items[k];
    const def = ITEMS[item.type];
    if (!def || !def.joints || item._base === undefined) continue;
    _jItem = item;
    try { def.joints(item, item._base, jointBuilder); } catch (e) { /* skip a bad joint */ }
  }
  _jItem = null;
}

export function destroyWorld() {
  if (world) { try { world.free(); } catch (e) { /* already gone */ } }
  world = null;
  started = false;
  activeCount = 0;
  for (let i = 0; i < P.n; i++) P.body[i] = null;
}

// ==========================================================================
// GO
// ==========================================================================
const _imp = { x: 0, y: 0, z: 0 };
const _pt = { x: 0, y: 0, z: 0 };

/** Tip the start domino. Returns false if there is nothing to tip. */
export function tapStart(domIdx) {
  if (!world) return false;
  const i = partForDomino(domIdx);
  if (i < 0) return false;
  const rb = P.body[i];
  if (!rb) return false;
  _q.set(P.qx[i], P.qy[i], P.qz[i], P.qw[i]);
  _v.set(0, 0, 1).applyQuaternion(_q);
  // mass * 0.1, applied at the TOP. mass * 0.05 measured as not reliably starting it,
  // and pushing at the centre of mass slides the domino instead of tipping it.
  const k = (rb.mass() || 0.0104) * PHYS.startImpulse;
  _imp.x = _v.x * k; _imp.y = 0; _imp.z = _v.z * k;
  _pt.x = P.x[i]; _pt.y = P.y[i] + DOM_HH * 0.85; _pt.z = P.z[i];
  rb.applyImpulseAtPoint(_imp, _pt, true);
  started = true;
  return true;
}

/** Shove one part directly (used by the challenge intros). */
export function nudge(partIndex, ix, iy, iz) {
  const rb = P.body[partIndex];
  if (!rb) return;
  _imp.x = ix; _imp.y = iy; _imp.z = iz;
  rb.applyImpulse(_imp, true);
  started = true;
}

// ==========================================================================
// STEP
// ==========================================================================
/**
 * Advance the world. The return value is deliberately a THREE-STATE code rather than a
 * boolean, because "the run has finished" and "there is nothing new to draw" are not
 * the same question and main.js needs both:
 *
 *   STEP_NONE   no substep ran this frame (the display is faster than 60 Hz). Says
 *               nothing at all about whether the run is over.
 *   STEP_STILL  the world advanced and NOTHING moved measurably. This is the only
 *               honest end-of-run signal; Rapier's active set is not, because an
 *               untouched standing domino can stay in it indefinitely.
 *   STEP_MOVED  the world advanced and something moved: redraw.
 */
export const STEP_NONE = 0;
export const STEP_STILL = 1;
export const STEP_MOVED = 2;

export function step(dt) {
  if (!world) return STEP_NONE;
  acc += Math.min(dt, PHYS.maxDt);
  // Do not chase a spike. A tab switch or a GC pause must not become five physics
  // steps in one frame, and unbounded debt would make every later frame do three.
  if (acc > H * PHYS.maxSubsteps) acc = H * PHYS.maxSubsteps;
  let n = 0;
  const t0 = performance.now();
  // A carry advances INSIDE the substep loop and before world.step(), because that is what
  // setNextKinematicTranslation means: Rapier moves the body to the pose you set during the
  // step that follows. Setting it once per frame outside the loop would skip a substep.
  while (acc >= H && n < PHYS.maxSubsteps) {
    if (nCarLive) advanceCarries(H);
    world.step(); acc -= H; n++;
  }
  perf.msPhys = performance.now() - t0;
  if (!n) return STEP_NONE;
  elapsed += n * H;
  run.seconds = elapsed;
  return syncActive() ? STEP_MOVED : STEP_STILL;
}

const touched = [false, false, false, false];
let anyMoved = false;
let activeCount = 0;

function syncActive() {
  touched[0] = touched[1] = touched[2] = touched[3] = false;
  anyMoved = false;
  activeCount = 0;
  nPark = 0;
  world.forEachActiveRigidBody(onActive);

  // Attached parts follow their parent. There are only ever a handful.
  for (let k = 0; k < nAttached; k++) {
    const i = attached[k], par = P.attach[i];
    if (!P.moved[par]) continue;
    _q.set(P.qx[par], P.qy[par], P.qz[par], P.qw[par]);
    _v.set(P.aox[i], P.aoy[i], P.aoz[i]).applyQuaternion(_q);
    P.x[i] = P.x[par] + _v.x; P.y[i] = P.y[par] + _v.y; P.z[i] = P.z[par] + _v.z;
    _q2.set(P.aqx[i], P.aqy[i], P.aqz[i], P.aqw[i]).premultiply(_q);
    P.qx[i] = _q2.x; P.qy[i] = _q2.y; P.qz[i] = _q2.z; P.qw[i] = _q2.w;
    P.moved[i] = 1;
    touched[P.mesh[i]] = true;
    anyMoved = true;
  }

  // Fire the launchers, then park — both AFTER the traversal, because changing a body
  // while Rapier is walking its own active set is asking for trouble.
  if (nLaunch) fireLaunchers();
  for (let k = 0; k < nPark; k++) park(parkList[k]);

  if (anyMoved) {
    for (let i = 0; i < P.n; i++) {
      if (!P.moved[i]) continue;
      P.moved[i] = 0;
      writeMatrix(i);
    }
    for (let m = 0; m < 4; m++) if (touched[m]) meshes[m].instanceMatrix.needsUpdate = true;
  }
  perf.awake = activeCount;
  run.active = activeCount;
  return anyMoved;
}

// Its own reused vector rather than nudge()'s `_imp`: the file's rule is that a step
// allocates nothing, and two scratch objects are cheaper than reasoning about whether these
// two writers can ever interleave.
const _limp = { x: 0, y: 0, z: 0 };

/**
 * Hand out the impulses for every trick whose trigger tipped this frame. Called once, from
 * syncActive, with the traversal finished.
 *
 * `true` on applyImpulse is the wake flag, and it is doing real work: the Rocket has been
 * standing still on its pad since GO and Rapier has long since put it to sleep, so without
 * it the impulse lands on a sleeping body and nothing happens at all.
 */
function fireLaunchers() {
  for (let q = 0; q < nLaunch; q++) {
    const it = launchQ[q];
    for (let k = 0; k < nImp; k++) {
      if (impItem[k] !== it) continue;
      const rb = P.body[impPart[k]];
      if (!rb) continue;
      _limp.x = impX[k]; _limp.y = impY[k]; _limp.z = impZ[k];
      rb.applyImpulse(_limp, true);
      run.launched++;
    }
    // Arm any carry on this item. It does not start here: the ball still has to roll the
    // run-up to the mouth of the loop, and how long that takes is the physics' business.
    for (let k = 0; k < nCar; k++) {
      if (carItem[k] === it && carState[k] === 0) { carState[k] = 1; nCarLive++; }
    }
    audio.confettiWhoosh();
    audio.whoosh();
  }
  nLaunch = 0;
}

// Reused for every vector the carry hands to Rapier. Each call consumes it immediately, so
// one object serves the position, the velocity and the spin in turn.
const _kin = { x: 0, y: 0, z: 0 };

/**
 * Drive every armed or running carry on one physics step. See the block comment beside the
 * carry arrays for why the Loop the Loop is animated instead of rolled.
 *
 * Nothing here is guarded against parking: a ball carries `noPark`, so parkEligible() already
 * refuses to freeze it, kinematic or not.
 */
function advanceCarries(h) {
  for (let k = 0; k < nCar; k++) {
    if (!carState[k]) continue;
    const i = carPart[k], rb = P.body[i];
    if (!rb) { carState[k] = 0; nCarLive--; continue; }
    const r = carR[k], c = carC[k], s = carS[k];

    if (carState[k] === 1) {
      // translation() allocates, and this file's rule is that a step allocates nothing. The
      // exception is deliberate and bounded: at most a handful of rows, only while one is
      // armed, which is the ~30 frames of the run-up. The cached P.z would be a step stale,
      // and one step at the entry speed is 28 mm — enough to catch the ball a quarter of the
      // way up the loop and then yank it back down to the bottom, which reads as a glitch.
      const t = rb.translation();
      const dx = t.x - carIx[k], dz0 = t.z - carIz[k];
      const dz = dx * s + dz0 * c;                              // the inverse of the item yaw
      if (dz < 0) continue;                                     // not at the mouth yet
      // The drift is a DELTA from wherever the ball is standing when we pick it up, not an
      // absolute item-local x. Which matters because the run-up does not have to sit on the
      // item's centre line: the Loop the Loop parks its ENTRY 56 mm to the left so that the
      // exit lands on the centre line, where the child aimed their dominoes. An absolute x
      // would teleport the ball sideways the instant the drive engaged.
      carLx0[k] = dx * c - dz0 * s;
      const v = rb.linvel();
      const sp0 = Math.hypot(v.x, v.y, v.z);
      // Floor, not a gate: whatever the run-up delivered, the loop always completes. A trick
      // that works four times in five is worse for a child than one that is simply magic.
      carV0[k] = sp0 < carVmin[k] ? carVmin[k] : sp0;
      // Start from where the ball actually IS, not from phi 0, so a late catch does not
      // teleport it backwards.
      carPhi[k] = dz < r ? Math.asin(dz / r) : Math.PI / 2;
      carState[k] = 2;
      rb.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    }

    // Speed from energy rather than a constant rate: a rollercoaster is slowest over the top,
    // and that hang is most of what makes the trick read as a loop rather than a spin.
    let v2 = carV0[k] * carV0[k] - ROLL_G * r * (1 - Math.cos(carPhi[k]));
    if (v2 < 0.04) v2 = 0.04;                 // never stall: 0.2 m/s keeps it crawling round
    carPhi[k] += (Math.sqrt(v2) / r) * h;

    if (carPhi[k] < TAU) {
      const lx = carLx0[k] + carXd[k] * carPhi[k] / TAU, lz = r * Math.sin(carPhi[k]);
      _kin.x = carIx[k] + lx * c + lz * s;
      _kin.y = carCy[k] - r * Math.cos(carPhi[k]);
      _kin.z = carIz[k] - lx * s + lz * c;
      rb.setNextKinematicTranslation(_kin);
      continue;
    }

    // Round, and put down at the exit.
    const lx = carLx0[k] + carXd[k];
    _kin.x = carIx[k] + lx * c;
    _kin.y = carCy[k] - r;
    _kin.z = carIz[k] - lx * s;
    rb.setBodyType(R.RigidBodyType.Dynamic, true);
    rb.setTranslation(_kin, true);
    // Along the item's forward axis, NOT the true helical tangent: the tangent is ~13 deg to
    // the side, which is invisible inside the loop but walks the ball off the edge of a 46 mm
    // apron before it reaches the table — and the child's next line of dominoes runs straight.
    // 0.85 of the entry speed, because a loop that gives back everything it took reads as a
    // cheat to anyone watching closely.
    const out = carV0[k] * 0.85;
    _kin.x = out * s; _kin.y = 0; _kin.z = out * c;
    rb.setLinvel(_kin, true);
    // Spin to match so it rolls off instead of skidding: w = v/R about the item's local X,
    // which is (c, 0, -s) in the world.
    const w = out / (P.sx[i] * 0.5);
    _kin.x = w * c; _kin.y = 0; _kin.z = -w * s;
    rb.setAngvel(_kin, true);
    carState[k] = 0; nCarLive--;
  }
}

// A named module-level function, not a closure: forEachActiveRigidBody is called every
// step, and a fresh closure per step is a fresh allocation per step.
function onActive(rb) {
  const i = rb.userData;
  if (typeof i !== 'number' || i < 0 || i >= P.n) return;
  activeCount++;
  // translation() and rotation() each allocate a small object in rapier3d-compat and
  // there is no public zero-alloc alternative. Mitigation: exactly one call each, per
  // ACTIVE body, per frame - with parking that is ~20 tiny objects a frame, not 600.
  const t = rb.translation();
  const q = rb.rotation();
  // A body in Rapier's active set has NOT necessarily moved. Compare against the pose
  // we last drew and, if the difference is below the visible threshold, leave the
  // stored pose alone: the comparison then stays against the RENDERED pose, so slow
  // creep still accumulates and eventually crosses instead of silently drifting out of
  // sync with the picture. This is what makes "nothing moved" mean "the run is over",
  // and it also stops a settled table re-uploading 600 matrices a frame for jitter.
  // --- gone over the edge ---------------------------------------------------
  // There is no floor under the table, so anything that leaves it falls forever, is never
  // calm, and keeps the whole run awake until the 45 s hard cap in main.js — 40 seconds of
  // watching an empty table. It was already reachable (a marble can roll off the edge) and
  // the launchers make it ordinary, so cull properly: 300 mm below the top it is never
  // coming back. Sink the picture out of sight and freeze the body, which is what park does.
  // park() ignores noPark on purpose, so a lost ball goes quiet like anything else.
  //
  // BEFORE the movement test, and `parked` guarded, both for the same reason. Rapier keeps a
  // frozen body in its active set for a while, so a version of this that ran after the pose
  // write compared the body's REAL y (say -0.35) against the sunk render pose (-9) every
  // frame, called that a 8.65 m move, and set anyMoved — for ever. Measured: a Rocket that
  // tunnelled off the table held the run open the full 45 s while nothing at all was moving.
  if (t.y < -0.30) {
    if (!P.parked[i]) {
      P.y[i] = -9;
      P.moved[i] = 1;
      touched[P.mesh[i]] = true;
      anyMoved = true;
      if (nPark < parkList.length) parkList[nPark++] = i;
    }
    return;
  }

  const dx = t.x - P.x[i], dy = t.y - P.y[i], dz = t.z - P.z[i];
  const dq = Math.abs(q.x - P.qx[i]) + Math.abs(q.y - P.qy[i]) +
    Math.abs(q.z - P.qz[i]) + Math.abs(q.w - P.qw[i]);
  if (dx * dx + dy * dy + dz * dz < MOVE_EPS2 && dq < MOVE_EPSQ) {
    // 20 um in a 1/60 s step is 1.2 mm/s, an order of magnitude under calmV2, so this
    // body is provably calm without paying for linvel()/angvel() (two allocations).
    // It is also, by definition, AT REST - which is exactly the arming condition.
    P.armed[i] = 1;
    parkStill(i);
    return;
  }
  P.x[i] = t.x; P.y[i] = t.y; P.z[i] = t.z;
  P.qx[i] = q.x; P.qy[i] = q.y; P.qz[i] = q.z; P.qw[i] = q.w;
  P.moved[i] = 1;
  touched[P.mesh[i]] = true;
  anyMoved = true;

  const lv = rb.linvel(), av = rb.angvel();
  const v2 = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
  const w2 = av.x * av.x + av.y * av.y + av.z * av.z;

  // --- HAS IT FALLEN? -------------------------------------------------------
  // Two tests, either of which counts, and the second one is not optional.
  //
  // HEIGHT: the centre has dropped 30% of the domino's height (14.4 mm). This is the
  // cheap, obvious test and it is right for a domino that lies down flat.
  //
  // TIPPED: the body is more than 40 degrees off upright. A domino that topples into
  // something it cannot lie down on NEVER passes the height test - and that is a whole
  // class of perfectly real topple. Measured on the Bridge: the ten up-flight dominoes
  // toppled forward, came to rest in a stable leaning fan at 64-72 degrees (each resting
  // on the next, the front one propped on the step above), and pushed the chain on across
  // the deck to the far end - yet the run reported "15 of 24 fell", so a completed
  // crossing read as a failure and the coach told the child to add dominoes where nothing
  // was wrong. The same undercount applies to a chain that piles against a wall.
  //
  // For an upright body the world-Y component of its local Y axis is 1 - 2(qx^2 + qz^2),
  // whatever the yaw, so the whole test is 2(qx^2 + qz^2) > 1 - cos 40 = 0.234. No
  // allocation, no trig, and it only runs for parts that have actually moved this frame.
  let justFell = false;
  if (!P.fallen[i]) {
    const tipped = P.gate[i] === 0 &&
      2 * (P.qx[i] * P.qx[i] + P.qz[i] * P.qz[i]) > 0.234;
    if (tipped || P.y[i] < P.fallY[i]) { P.fallen[i] = 1; justFell = true; }
  }

  // --- ARMING ---------------------------------------------------------------
  // Every dynamic trick part spawns EXACTLY resting on its support - a bell's clapper
  // cylinder sits with its base at y = 0.004 on a plate whose top is y = 0.004 - so the
  // first world.step() sees zero penetration and gravity alone hands it 9.81/60 =
  // 0.163 m/s. That is over the bell threshold (0.05 m/s), the chime (0.04) and the marble
  // (0.10), so a pure speed test made every noise-maker fire
  // itself at GO whether or not the child's chain ever reached it. Challenges 1 and 2
  // completed themselves and the Ding! achievement was free.
  //
  // Fix: a part must be seen AT REST once before it is allowed to fire. That covers the
  // spawn transient without a fixed grace period (which would still misfire for anything
  // that starts on a slope) and costs one byte plus one branch per active part.
  if (!P.armed[i] && v2 < ARM_V2 && w2 < ARM_W2) P.armed[i] = 1;
  const armed = P.armed[i] === 1;

  const tag = P.tag[i];
  if (tag === T_DOMINO) {
    if (justFell) onDominoFell(i, v2);
  } else if (tag === T_BELL) {
    // 4e-4 = 20 mm/s, down from 0.0025 = 50 mm/s. The old figure was picked to reject the
    // spawn transient, and the ARMING gate above now does that job properly and exactly,
    // so all this number still has to do is reject nothing at all: a rigid-body world
    // transmits no vibration through the fixed table, so if a bell is moving 20 mm/s
    // something hit it. 50 mm/s was too much to ask of a marble that has crossed the sand:
    // measured, it shoved the bell but only at 20-40 mm/s, and 4 of 10 identical runs of
    // challenge 1 stayed silent.
    if (!P.fired[i] && armed && v2 > 4e-4) {
      P.fired[i] = 1;
      audio.bell(audio.PENT[P.note[i] % audio.PENT.length]);
      run.bells++; trigger(itemNames[P.itemIdx[i]]);
    }
  } else if (tag === T_CHIME) {
    if (!P.fired[i] && armed && v2 > 4e-4) {   // see the bell, same reasoning
      P.fired[i] = 1;
      audio.chime(audio.PENT[P.note[i] % audio.PENT.length]);
      run.bells++; trigger(itemNames[P.itemIdx[i]]);
    }
  } else if (tag === T_TRIGGER) {
    if (!P.fired[i] && justFell) {
      P.fired[i] = 1;
      run.confettiFired = 1;
      trigger(itemNames[P.itemIdx[i]]);
      audio.confettiWhoosh();
      burstConfetti(P.x[i], 0.07, P.z[i]);
    }
  } else if (tag === T_MARBLE || tag === T_BALL) {
    if (!P.fired[i] && armed && v2 > 0.01) {
      P.fired[i] = 1; audio.whoosh(); trigger(itemNames[P.itemIdx[i]]);
    }
  } else if (tag === T_LAUNCH) {
    // No ARM gate, and deliberately so: this fires on justFell, and a spawn transient
    // cannot tip a domino 40 degrees. Gating it on `armed` would only add a way for the
    // trick to silently not go off.
    //
    // Three pink dominoes stand on every launcher, so guard the ITEM as well as the part:
    // the other two tipping afterwards must not fire the impulse again.
    if (!P.fired[i] && justFell) {
      P.fired[i] = 1;
      const it = P.itemIdx[i];
      if (!itemLaunched[it]) {
        itemLaunched[it] = 1;
        if (nLaunch < launchQ.length) launchQ[nLaunch++] = it;
        trigger(itemNames[it]);
      }
    }
  } else if (tag === T_SPINNER) {
    if (!P.fired[i] && armed && w2 > 4) { P.fired[i] = 1; trigger(itemNames[P.itemIdx[i]]); audio.whoosh(); }
  } else if (tag === T_FLIPPER) {
    // The Springboard's plank is BOTH the moving part and its own trigger: once the arm is
    // turning at more than 1 rad/s it has been hit, and that is when the spring lets go. It
    // needs the launcher queue because a see-saw cannot throw its passenger on its own — one
    // falling domino carries about 2.4 mJ, and lifting a 10.4 g domino even 20 mm spends most
    // of that, so the measured whip moved the passenger a fraction of a millimetre. A real
    // springboard stores energy; this is where that energy comes from.
    if (!P.fired[i] && armed && w2 > 1) {
      P.fired[i] = 1;
      const it = P.itemIdx[i];
      trigger(itemNames[it]);
      audio.thud();
      if (!itemLaunched[it]) {
        itemLaunched[it] = 1;
        if (nLaunch < launchQ.length) launchQ[nLaunch++] = it;
      }
    }
  } else if (tag === T_SPLITTER) {
    if (justFell) {
      trigger(itemNames[P.itemIdx[i]]);
      splitFell = true;
      splitX = P.x0[i]; splitZ = P.z0[i];
      // The direction it was FACING when it stood up: that is what "which side" means,
      // and its live quaternion is useless now that it is lying down.
      splitFX = Math.sin(P.yaw0[i]); splitFZ = Math.cos(P.yaw0[i]);
      audio.clatter(1);
    }
  } else if (tag === T_TOWERTOP) {
    if (!P.fired[i] && P.y[i] < P.y0[i] * 0.55) {
      P.fired[i] = 1; run.towerCollapsed = 1; trigger(itemNames[P.itemIdx[i]]); audio.thud();
    }
  } else if (tag === T_TOWER) {
    if (justFell) audio.clatter(0.7);
  }

  // --- park it? ------------------------------------------------------------
  if (!parkEligible(i)) return;
  if (v2 < PHYS.calmV2 && w2 < PHYS.calmW2) countCalm(i);
  else P.calm[i] = 0;
}

/**
 * THREE GATES, and which one applies is fixed when the part is built:
 *   gate 0 (dominoes, splitters, confetti triggers, chime bars) must have FALLEN. A
 *          standing domino is never parked, or it could not be knocked over.
 *   gate 1 (everything else) must have been DISPLACED by more than 2 mm. A tower block
 *          that was never touched must stay knock-over-able; one that has been shoved
 *          and come to rest is finished with.
 *   gate 2 (the Springboard arm) must have FIRED. It needs its own gate because a thing on a
 *          hinge ENDS UP WHERE IT STARTED: the springboard pivots about its own centre, so
 *          its origin never moves at all. Gate 1's "has it been displaced 2 mm" is a flat no
 *          on a see-saw, and it never topples either, so gate 0 is no use. What it really
 *          means by "finished" is fired.
 * Balls and jointed parts carry noPark and are never parked at all - a Fixed pinwheel
 * cannot spin and a Fixed ball cannot be hit again.
 */
function parkEligible(i) {
  if (P.noPark[i] || P.parked[i] || !P.dyn[i]) { P.calm[i] = 0; return false; }
  const g = P.gate[i];
  const ok = g === 0
    ? P.fallen[i] === 1
    : g === 2
      ? P.fired[i] === 1
      : (P.fallen[i] === 1 ||
       Math.abs(P.x[i] - P.x0[i]) + Math.abs(P.y[i] - P.y0[i]) + Math.abs(P.z[i] - P.z0[i]) > 0.002);
  if (!ok) { P.calm[i] = 0; return false; }
  return true;
}
function countCalm(i) {
  if (++P.calm[i] >= PHYS.calmFrames && nPark < parkList.length) parkList[nPark++] = i;
}
function parkStill(i) {
  if (parkEligible(i)) countCalm(i);
}

const _ZERO = { x: 0, y: 0, z: 0 };
function park(i) {
  const rb = P.body[i];
  if (!rb || P.parked[i]) return;
  // Zero the velocities, then convert to Fixed. NEVER rb.sleep(): a slept body is
  // still dynamic, so it keeps integrating without being solved, and a leaning pile
  // slowly sinks through the floor.
  try {
    rb.setLinvel(_ZERO, false);
    rb.setAngvel(_ZERO, false);
    rb.setBodyType(R.RigidBodyType.Fixed, false);
    P.parked[i] = 1;
  } catch (e) {
    P.noPark[i] = 1;
  }
}

function onDominoFell(i, v2) {
  run.fell++;
  const c = P.domColour[i];
  if (c >= 0 && !(run.colourMask & (1 << c))) { run.colourMask |= (1 << c); run.colours++; }
  if (P.y0[i] > DOM_HH + 0.008) run.elevated = 1;
  if (P.curved[i]) run.curvedFell++;
  audio.clatter(Math.min(1, v2 * 12));

  // Credit the nearest moving ball, so "knock 10 dominoes down with one ball" means
  // what a kid thinks it means.
  for (let b = 0; b < nBalls; b++) {
    const j = ballParts[b];
    if (!P.fired[j]) continue;
    const dx = P.x[j] - P.x[i], dy = P.y[j] - P.y[i], dz = P.z[j] - P.z[i];
    if (dx * dx + dy * dy + dz * dz < 0.0036) {              // within 60 mm
      const k = ++ballKnocks[b];
      if (k > run.bestBallKnock) run.bestBallKnock = k;
    }
  }

  // Which side of the splitter did this one fall on?
  if (splitFell) {
    const dx = P.x[i] - splitX, dz = P.z[i] - splitZ;
    if (splitFX * dx + splitFZ * dz > 0.01) {                // ahead of it, not behind
      const side = splitFX * dz - splitFZ * dx;
      if (side > 0.012) run.forkL++;
      else if (side < -0.012) run.forkR++;
    }
  }
}

export function activeBodies() { return activeCount; }
export function partCount() { return P.n; }
export function instanceCounts() { return instCount; }

/**
 * How many bodies have been retired to Fixed. Shown in the frame counter because
 * parking IS the performance story: if this number is not climbing while dominoes are
 * lying still, the run is paying full solver cost for a settled table.
 */
export function parkedCount() {
  let n = 0;
  for (let i = 0; i < P.n; i++) if (P.parked[i]) n++;
  return n;
}

/** Recolour every domino instance in place (skin or palette change, no rebuild). */
/**
 * Re-place ONE domino's instance after its yaw changed, without rebuilding the part table.
 *
 * The rotation slider fires on every pointermove. Routing that through the normal
 * layout-changed path would re-derive all N parts and re-upload the whole instance matrix
 * buffer per frame — on a 300-domino table on a cheap tablet that is the difference between
 * a slider that tracks a finger and one that lags behind it. This touches one instance.
 *
 * Build mode only: there are no bodies to keep in step, which is exactly why it is safe.
 */
export function refreshDominoTransform(L, k) {
  const i = partForDomino(k);
  const d = L.dominoes[k];
  if (i < 0 || !d) return false;
  P.x[i] = P.x0[i] = d.x;
  P.z[i] = P.z0[i] = d.z;
  P.y[i] = P.y0[i] = d.y + DOM_HH;
  P.yaw0[i] = d.r;
  _e.set(0, d.r, 0, 'YXZ');
  _q.setFromEuler(_e);
  P.qx[i] = _q.x; P.qy[i] = _q.y; P.qz[i] = _q.z; P.qw[i] = _q.w;
  writeMatrix(i);
  meshes[MESH.DOMINO].instanceMatrix.needsUpdate = true;
  return true;
}

/** The same, for every part of one item. Its parts are contiguous from `_base`. */
export function refreshItemTransform(L, it) {
  const def = ITEMS[it.type];
  if (!def || it._base === undefined) return false;
  const specs = def.parts(it);
  const c = Math.cos(it.r), s = Math.sin(it.r);
  const touched = [0, 0, 0, 0];
  for (let k = 0; k < specs.length; k++) {
    const i = it._base + k;
    if (i >= P.n || P.itemIdx[i] < 0) break;
    const sp = specs[k];
    P.x[i] = P.x0[i] = it.x + sp.x * c + sp.z * s;
    P.z[i] = P.z0[i] = it.z - sp.x * s + sp.z * c;
    P.y[i] = P.y0[i] = sp.y;
    P.yaw0[i] = it.r;
    _e.set(sp.tilt || 0, it.r + (sp.yaw || 0), sp.roll || 0, 'YXZ');
    _q.setFromEuler(_e);
    P.qx[i] = _q.x; P.qy[i] = _q.y; P.qz[i] = _q.z; P.qw[i] = _q.w;
    writeMatrix(i);
    touched[P.mesh[i]] = 1;
  }
  for (let m = 0; m < 4; m++) if (touched[m]) meshes[m].instanceMatrix.needsUpdate = true;
  return true;
}

export function refreshColours(L) {
  const skin = SKINS[L.skin] ? L.skin : 'plain';
  for (let i = 0; i < P.n; i++) {
    const k = P.domIdx[i];
    if (k < 0 || !L.dominoes[k]) continue;
    P.colour[i] = skinColour(L.dominoes[k].c, k, skin);
    _c.setHex(P.colour[i]);
    meshes[MESH.DOMINO].setColorAt(P.inst[i], _c);
  }
  if (meshes[MESH.DOMINO].instanceColor) meshes[MESH.DOMINO].instanceColor.needsUpdate = true;
}
