// Tools and gesture arbitration. This is the file the whole UX risk lives in.
//
// THE PROBLEM: the camera orbits freely at all times, INCLUDING while you are building,
// and you draw with one finger. Those two want the same gesture.
//
// THE RULE, and it never has an exception:
//
//   TWO FINGERS ALWAYS ORBIT AND PINCH. Never draw. In every tool, in every mode.
//   ONE FINGER DRAWS when a drawing tool is selected.
//   ONE FINGER ORBITS when the resting "Look" tool is selected.
//   ONE FINGER PANS when "Move" is selected.
//
// Look, Move, Select and Rub Out are the first group in the bar, before the first vertical
// break — the four tools that act on what is already there rather than adding to it. All
// modal, so the answer to "what will my finger do" is still the selected tile and nothing
// else. Select and Rub Out count as DRAWING tools here only in the narrow sense that they
// want a table hit: Select puts nothing down, it just moves the blue ring.
//
// Three things enforce it:
//  1. If a second finger lands mid-stroke, the stroke is ABANDONED, not committed. A
//     child who meant to orbit and grazed the glass with one finger first gets an
//     orbit, not a stray line of dominoes.
//  2. The ghost preview shows what one finger is about to do, on the table, before it
//     commits. Nothing is ever placed that was not previewed.
//  3. The tool palette is always visible and always shows exactly one selected tool, so
//     "what will my finger do" is answerable without touching anything.
//
// Desktop keeps the mouse's own conventions on top of all that: MIDDLE-drag orbits,
// RIGHT-drag and shift-drag pan, and the wheel zooms.
// There is still deliberately NO two-finger pan: two fingers mean orbit-and-pinch and
// nothing else, ever. Touch pans by picking the Move tool, which is one more tile but not
// one more gesture — consistency for an eight-year-old beats a hidden modifier.

import * as THREE from 'three';
import {
  ghost, ghostBox, eraseRing, ghostParts, setGhostPartsColour, GHOST_PART_CAP,
} from './env.js';
import { DOM_W, DOM_H, DOM_HH, DOM_T } from './consts.js';
import * as orbit from './orbit.js';
import {
  pickSurface, strokeToDominoes, placeOne, pooledOut, nearestDomino, nearestItem,
  onTable, isBlocked, surfaceAt,
} from './layout.js';
import { ITEMS } from './items-def.js';
import { cmdAddDominoes, cmdAddItem, cmdRemove, cmdSetStart } from './history.js';
import * as audio from './audio.js';

// `grp` sorts the tiles into the bar's groups. ui.js draws a vertical break wherever it
// changes inside the palette, and lifts the 'go' group out to sit beside the GO button.
//
//   cam    the tools that act on what is ALREADY there — where you are looking, what is
//          selected, and what you rub out. None of them adds a piece.
//   build  the things that put dominoes and tricks down
//   go     First, next to GO, because "which one starts" is a question about the run
//
// `icon` is a name in js/icons.js, not a glyph. Emoji were the first cut and they were the
// wrong tool: every platform draws them differently, they ignore `color` (which is why the
// locked tiles used to need a filter hack), and a tiny picture of an eye next to a tiny
// picture of a hand at 17 px is soup.
export const TOOLS = [
  { id: 'look', name: 'Look', icon: 'eye', grp: 'cam', tip: 'One finger spins the camera' },
  // Panning used to be reachable ONLY by middle-click, right-click or shift-drag, i.e. only
  // with a mouse — on the tablet this game is built for there was no way to slide the view
  // across a big table at all. Move is that missing gesture, and it sits next to Look because
  // the two of them are the camera and everything after the first break builds.
  { id: 'move', name: 'Move', icon: 'move', grp: 'cam', tip: 'One finger slides the view around' },
  { id: 'select', name: 'Select', icon: 'pointer', grp: 'cam', tip: 'Tap a domino or trick to turn it' },
  // Rub Out sits next to Select, not at the end of the build group: picking a piece and
  // getting rid of a piece are the same kind of act — both point at something that is
  // already on the table — and a child who has just tapped the wrong thing reaches for the
  // undo/rub-out end of the bar, not past four tools that add more.
  { id: 'erase', name: 'Rub Out', icon: 'eraser', grp: 'cam', tip: 'Drag over things to remove them' },
  { id: 'line', name: 'Line', icon: 'ruler', grp: 'build', tip: 'Drag a straight line of dominoes' },
  { id: 'arc', name: 'Arc', icon: 'spline', grp: 'build', tip: 'Drag a curved line', needs: 'arc' },
  { id: 'single', name: 'One', icon: 'rectangle-vertical', grp: 'build', tip: 'Tap to place one domino' },
  { id: 'item', name: 'Tricks', icon: 'sparkles', grp: 'build', tip: 'Tap to drop the chosen trick' },
  // Labelled "First" but still id 'start': the id is what the layout's startId means and
  // what every test selects by, and renaming a button is no reason to churn either.
  { id: 'start', name: 'First', icon: 'flag', grp: 'go', tip: 'Tap the domino that goes first' },
];
const DRAWING = { line: 1, arc: 1, single: 1, item: 1, erase: 1, start: 1, select: 1 };
// The subset of DRAWING that actually PUTS A PIECE DOWN. Rub Out, First and Select want a
// table hit but add nothing, so they leave the blue ring alone; these four take the rotation
// dial over (see setTool).
const PLACES = { line: 1, arc: 1, single: 1, item: 1 };

let tool = 'look';
let itemType = 'wall';
let mode = 'build';
let hooks = null;

// --- rotation + selection -------------------------------------------------
// ONE ANGLE, not two. `rotA` is what the slider holds, and it is simultaneously the angle
// the next domino or trick will be placed at AND the angle of whatever is selected. The
// alternative — a placement angle and a separate selection angle — means the slider jumps
// when you select something and jumps back when you deselect, and a child cannot predict
// which of the two they are dragging.
//
// So: selecting a piece adopts ITS angle, and dragging the slider turns that piece and sets
// the angle for the next thing you place. Place something, it is selected, and the slider is
// already pointing at it.
//
// The cost of one angle is that "what am I turning" has to be unambiguous, and the answer is
// always the MOST RECENT thing you pointed at. So reaching for a tool that puts a piece down —
// or picking a trick out of the tray — clears the ring: from that moment the slider is aiming
// the grey ghost you are about to drop, and it cannot also be quietly spinning a bell you
// selected a minute ago somewhere else on the table.
let rotA = 0;
let sel = null;            // { kind: 'domino' | 'item', id } — the blue ring's target
let dragFrom = null;       // the angle a slider drag started at, so one drag is one undo

// --- pointer bookkeeping (fixed size: no maps, no allocation) --------------
const MAXP = 4;
const pid = new Int32Array(MAXP).fill(-1);
const px = new Float32Array(MAXP);
const py = new Float32Array(MAXP);
let nPointers = 0;

let gesture = 'none';        // none | draw | orbit1 | orbit2 | pan
let pinchD0 = 0, pinchR0 = 0;
let lastCX = 0, lastCY = 0;

// --- stroke ---------------------------------------------------------------
const MAXPTS = 1024;
const pts = new Float64Array(MAXPTS * 2);
let nPts = 0;
const arcPts = new Float64Array(64 * 2);
const preview = pooledOut();
const eraseIds = [];
const eraseItemIds = [];

const _hit = { x: 0, y: 0, z: 0, t: 0, surf: null };
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _gs = new THREE.Vector3(1, 1, 1);
// A throwaway item object to hand to def.parts(), which wants { type, x, z, r }. Reused so
// a hover preview on every pointermove allocates nothing.
const _ghostIt = { type: 'wall', x: 0, z: 0, r: 0 };

export function init(h) {
  hooks = h;
  const c = h.canvas;
  c.addEventListener('pointerdown', onDown, { passive: false });
  c.addEventListener('pointermove', onMove, { passive: false });
  c.addEventListener('pointerup', onUp, { passive: false });
  c.addEventListener('pointercancel', onUp, { passive: false });
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  // Firefox and Edge start a page autoscroll on a MIDDLE mousedown, and preventDefault on
  // pointerdown does not suppress the compatibility mouse event that triggers it — so the
  // middle-drag orbit would come with a scrolling page attached.
  c.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
}

export function setTool(id) {
  if (!TOOLS.some(t => t.id === id)) return;
  tool = id;
  // abandon() is also what clears the ghost, the ghost box and the eraser ring, so
  // switching tools can never leave a stale preview of the previous tool on the table.
  abandon();
  // ...and picking a placing tool hands the rotation dial to the ghost (see ONE ANGLE above).
  if (PLACES[id]) clearSelection();
  audio.click();
  if (hooks) {
    if (hooks.onToolChange) hooks.onToolChange(tool);
    hooks.invalidate();
  }
}
export function currentTool() { return tool; }
export function setItemType(t) {
  if (!ITEMS[t]) return;
  itemType = t;
  // setTool('item') is what clears the ring on the way in; when Tricks is ALREADY the tool,
  // swapping which trick you are holding has to do it here, or the dial would still be turning
  // whatever was selected before instead of the trick you just chose.
  if (tool !== 'item') setTool('item');
  else { abandon(); clearSelection(); if (hooks) hooks.invalidate(); }
}
export function currentItemType() { return itemType; }
export function currentItemRot() { return rotA; }
export function setMode(m) { mode = m; abandon(); if (m !== 'build') clearSelection(); }

// ==========================================================================
// SELECTION + THE ROTATION SLIDER
// ==========================================================================
export function selection() { return sel; }

/**
 * Select a piece and adopt its angle, so the slider is immediately pointing at the thing it
 * is about to turn. Called by the Select tool AND automatically after every placement.
 */
export function select(kind, id, angle) {
  sel = (id === null || id === undefined) ? null : { kind, id };
  if (sel && angle !== undefined) rotA = norm(angle);
  if (hooks) { hooks.onSelectionChange(sel, rotA); hooks.invalidate(); }
}
export function clearSelection() {
  if (!sel) return;
  sel = null;
  dragFrom = null;
  if (hooks) { hooks.onSelectionChange(null, rotA); hooks.invalidate(); }
}

/** Radians, always in [0, 2pi) — the slider's own range, so it never shows -90 degrees. */
function norm(a) {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

/** The slider was grabbed. Remember where the selected piece started for a single undo. */
export function beginRotate() { dragFrom = sel ? rotA : null; }

/**
 * The slider moved. Turn the selected piece live — the whole point is seeing the angle you
 * are choosing — and set the angle the next placement will use. No history yet.
 */
export function setRotation(a) {
  rotA = norm(a);
  if (sel && hooks) hooks.onRotateLive(sel, rotA);
  // A live ghost has to follow the slider too, or the preview lies about what a tap will do.
  if (nPts) refreshPreview();
  if (hooks) hooks.invalidate();
}

/** The slider was let go: bank the whole drag as one undo entry, if it changed anything. */
export function endRotate() {
  const from = dragFrom;
  dragFrom = null;
  if (sel && from !== null && Math.abs(from - rotA) > 1e-4 && hooks) {
    hooks.onRotateCommit(sel, from, rotA);
  }
  audio.click();
}

/** Throw away any in-progress stroke without committing it. */
export function abandon() {
  nPts = 0;
  preview.length = 0;
  eraseIds.length = 0;
  eraseItemIds.length = 0;
  ghost.count = 0;
  ghostBox.visible = false;
  clearGhostParts();
  eraseRing.visible = false;
  if (gesture === 'draw') gesture = 'none';
}

// ==========================================================================
// POINTERS
// ==========================================================================
function slotOf(id) { for (let i = 0; i < MAXP; i++) if (pid[i] === id) return i; return -1; }

function onDown(e) {
  e.preventDefault();
  if (nPointers >= MAXP) return;
  let k = -1;
  for (let i = 0; i < MAXP; i++) if (pid[i] === -1) { k = i; break; }
  if (k < 0) return;
  pid[k] = e.pointerId; px[k] = e.clientX; py[k] = e.clientY;
  nPointers++;
  try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  audio.ensureAudio();

  if (nPointers >= 2) {
    // Rule 1: a second finger cancels drawing outright. This is the single most
    // important line in the file.
    abandon();
    gesture = 'orbit2';
    pinchD0 = pinchDist();
    pinchR0 = orbit.cam.radius;
    centroid();
    return;
  }

  // MOUSE BUTTONS ARE THE ONE PLACE A GESTURE IS NOT THE SELECTED TOOL. Middle-drag always
  // orbits and right-drag always pans, in every tool, so a grown-up on a mouse can look and
  // slide without giving up the tool the child left selected. They used to BOTH pan, which
  // made one of the two buttons dead weight.
  //
  // Which way round: middle = orbit is Blender's and Google Earth's, right = pan is three.js
  // OrbitControls' own default, so this pair is the one arrangement that agrees with both.
  // (Unity and Unreal do the opposite. There is no single convention to be right about.)
  const midOrbit = e.button === 1;
  const wantsPan = e.button === 2 || e.shiftKey || (mode === 'build' && tool === 'move');
  if (midOrbit || wantsPan) {
    gesture = midOrbit ? 'orbit1' : 'pan';
    lastCX = e.clientX; lastCY = e.clientY;
    return;
  }
  if (mode !== 'build' || tool === 'look' || !DRAWING[tool]) {
    gesture = 'orbit1';
    lastCX = e.clientX; lastCY = e.clientY;
    return;
  }
  nPts = 0;
  if (!pushPoint(e.clientX, e.clientY, true)) {
    // The finger came down off the table (the surround, or the sky). There is nothing to
    // draw on out there, so this is a look-around drag - which is what a child pressing
    // on the background expects anyway. Decided ONCE, at pointerdown, so a stroke never
    // changes its mind about what it is.
    gesture = 'orbit1';
    lastCX = e.clientX; lastCY = e.clientY;
    return;
  }
  gesture = 'draw';
  refreshPreview();
  hooks.invalidate();
}

function onMove(e) {
  const k = slotOf(e.pointerId);
  if (k < 0) {
    if (mode === 'build' && DRAWING[tool] && nPointers === 0) hoverPreview(e.clientX, e.clientY);
    return;
  }
  e.preventDefault();
  px[k] = e.clientX; py[k] = e.clientY;

  if (gesture === 'orbit2' && nPointers >= 2) {
    const cx = lastCX, cy = lastCY;
    centroid();
    orbit.orbitBy(lastCX - cx, lastCY - cy);
    const d = pinchDist();
    if (pinchD0 > 8 && d > 8) orbit.zoomBy((pinchD0 / d) * (pinchR0 / orbit.cam.radius));
    hooks.invalidate();
    return;
  }
  if (gesture === 'orbit1') {
    orbit.orbitBy(e.clientX - lastCX, e.clientY - lastCY);
    lastCX = e.clientX; lastCY = e.clientY;
    hooks.invalidate();
    return;
  }
  if (gesture === 'pan') {
    orbit.panBy(e.clientX - lastCX, e.clientY - lastCY);
    lastCX = e.clientX; lastCY = e.clientY;
    hooks.invalidate();
    return;
  }
  if (gesture === 'draw') {
    if (pushPoint(e.clientX, e.clientY, false)) {
      refreshPreview();
      hooks.invalidate();
    }
  }
}

function onUp(e) {
  const k = slotOf(e.pointerId);
  if (k < 0) return;
  e.preventDefault();
  pid[k] = -1;
  nPointers = Math.max(0, nPointers - 1);
  if (gesture === 'draw') {
    commit();
    gesture = 'none';
  } else if (nPointers === 0) {
    gesture = 'none';
  } else if (gesture === 'orbit2' && nPointers === 1) {
    // One finger lifted off a pinch: keep orbiting with what is left rather than
    // suddenly starting to draw.
    gesture = 'orbit1';
    for (let i = 0; i < MAXP; i++) if (pid[i] !== -1) { lastCX = px[i]; lastCY = py[i]; }
  }
  hooks.invalidate();
}

function onWheel(e) {
  e.preventDefault();
  orbit.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  hooks.invalidate();
}

function centroid() {
  let x = 0, y = 0, n = 0;
  for (let i = 0; i < MAXP; i++) if (pid[i] !== -1) { x += px[i]; y += py[i]; n++; }
  if (n) { lastCX = x / n; lastCY = y / n; }
}
function pinchDist() {
  let a = -1, b = -1;
  for (let i = 0; i < MAXP; i++) if (pid[i] !== -1) { if (a < 0) a = i; else if (b < 0) b = i; }
  if (a < 0 || b < 0) return 0;
  return Math.hypot(px[a] - px[b], py[a] - py[b]);
}

// ==========================================================================
// STROKE -> PREVIEW
// ==========================================================================
/**
 * Record a stroke sample.
 *
 * OFF-TABLE SAMPLES ARE IGNORED, NOT CLAMPED. This used to call clampToTable, which
 * folded a finger that had wandered past the edge back onto the kerb line and kept
 * depositing dominoes there — so a drag that visibly left the table still grew the run,
 * and the child got dominoes somewhere they had not pointed. Dropping the sample instead
 * means the run simply stops at the edge and resumes if the finger comes back on.
 *
 * @returns true if a new sample was actually recorded.
 */
function pushPoint(cx, cy, force) {
  orbit.makeRay(cx, cy);
  if (!pickSurface(orbit.rayPlane, _hit)) return false;
  const L = hooks.getLayout();
  if (!onTable(L, _hit.x, _hit.z)) return false;
  if (nPts === 0) {
    pts[0] = _hit.x; pts[1] = _hit.z; nPts = 1;
    return true;
  }
  const lx = pts[(nPts - 1) * 2], lz = pts[(nPts - 1) * 2 + 1];
  const d2 = ((_hit.x - lx) ** 2) + ((_hit.z - lz) ** 2);
  // One sample every 3 mm is far finer than the domino spacing and keeps a long drag
  // inside the scratch buffer.
  if (!force && d2 < 0.000009) return false;
  if (nPts >= MAXPTS) return false;
  pts[nPts * 2] = _hit.x; pts[nPts * 2 + 1] = _hit.z; nPts++;
  return true;
}

/** How many more dominoes may exist right now. */
function budgetLeft() { return Math.max(0, hooks.budgetLeft()); }

function refreshPreview() {
  const L = hooks.getLayout();
  preview.length = 0;
  eraseIds.length = 0;
  eraseItemIds.length = 0;
  ghostBox.visible = false;
  clearGhostParts();
  eraseRing.visible = false;

  if (tool === 'erase') { previewErase(L); drawGhost(0); return; }
  if (tool === 'start') { previewStart(L); drawGhost(0); return; }
  if (tool === 'select') { previewSelect(L); drawGhost(0); return; }
  if (tool === 'item') { previewItem(L); drawGhost(0); return; }

  const budget = budgetLeft();
  const colour = hooks.getColour();
  if (tool === 'single') {
    if (nPts) placeOne(L, pts[0], pts[1], rotA, preview, budget, colour, true);
  } else if (tool === 'arc') {
    const n = buildArc();
    strokeToDominoes(L, arcPts, n, preview, budget, colour, false, true);
  } else {
    // Line: first sample to last sample, ignoring the wobble in between.
    if (nPts >= 2) {
      arcPts[0] = pts[0]; arcPts[1] = pts[1];
      arcPts[2] = pts[(nPts - 1) * 2]; arcPts[3] = pts[(nPts - 1) * 2 + 1];
      strokeToDominoes(L, arcPts, 2, preview, budget, colour, false, true);
    } else if (nPts === 1) {
      placeOne(L, pts[0], pts[1], rotA, preview, budget, colour, true);
    }
  }
  drawGhost(preview.length);
}

/**
 * Fit a quadratic through the start, the most-bowed point of the drag, and the end,
 * then resample it. A kid drags a bendy path and gets a clean arc, which is both easier
 * to aim and far more reliable to topple than the raw wobble.
 */
function buildArc() {
  if (nPts < 2) { arcPts[0] = pts[0]; arcPts[1] = pts[1]; return nPts ? 1 : 0; }
  const x0 = pts[0], z0 = pts[1];
  const x1 = pts[(nPts - 1) * 2], z1 = pts[(nPts - 1) * 2 + 1];
  let ax = x1 - x0, az = z1 - z0;
  const len = Math.hypot(ax, az) || 1;
  ax /= len; az /= len;
  let bestI = -1, bestD = 0;
  for (let i = 1; i < nPts - 1; i++) {
    const dx = pts[i * 2] - x0, dz = pts[i * 2 + 1] - z0;
    const perp = Math.abs(ax * dz - az * dx);
    if (perp > bestD) { bestD = perp; bestI = i; }
  }
  const SEG = 40;
  if (bestI < 0 || bestD < DOM_W * 0.5) {
    arcPts[0] = x0; arcPts[1] = z0; arcPts[2] = x1; arcPts[3] = z1;
    return 2;
  }
  const mx = pts[bestI * 2], mz = pts[bestI * 2 + 1];
  // B(0.5) = (P0 + 2C + P2)/4, so the control point that passes through the bow is:
  const cx = (4 * mx - x0 - x1) * 0.5;
  const cz = (4 * mz - z0 - z1) * 0.5;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, u = 1 - t;
    arcPts[i * 2] = u * u * x0 + 2 * u * t * cx + t * t * x1;
    arcPts[i * 2 + 1] = u * u * z0 + 2 * u * t * cz + t * t * z1;
  }
  return SEG + 1;
}

function previewErase(L) {
  const r = DOM_W * 1.7;
  for (let i = 0; i < nPts; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    for (let k = 0; k < L.dominoes.length; k++) {
      const d = L.dominoes[k];
      const dx = d.x - x, dz = d.z - z;
      if (dx * dx + dz * dz < r * r && eraseIds.indexOf(d.id) < 0) eraseIds.push(d.id);
    }
  }
  // Items only go on a tap, so a sweep across a bell does not eat the bell.
  if (nPts <= 2 && eraseIds.length === 0) {
    const it = nearestItem(L, pts[0], pts[1], 0.06);
    if (it) eraseItemIds.push(it.id);
  }
  if (nPts) {
    const x = pts[(nPts - 1) * 2], z = pts[(nPts - 1) * 2 + 1];
    eraseRing.position.set(x, 0.003, z);
    eraseRing.scale.set(r, r, 1);
    eraseRing.visible = true;
  }
}

function previewStart(L) {
  if (!nPts) return;
  const d = nearestDomino(L, pts[0], pts[1], 0.07);
  if (!d) return;
  // Highlight the candidate with the ghost box rather than moving the real start ring:
  // if the tap is abandoned, the gold ring must still be on the domino it was on.
  ghostBox.position.set(d.x, d.y + DOM_HH, d.z);
  ghostBox.rotation.set(0, d.r, 0);
  ghostBox.scale.set(DOM_W * 1.5, DOM_H * 1.15, DOM_T * 3.2);
  ghostBox.material.color.setHex(0xffd32a);
  ghostBox.visible = true;
}

/**
 * The trick you are about to drop, drawn AS ITSELF.
 *
 * This used to be one purple box the size of the item's footprint, which told a child where
 * the thing would land but not which end of the bridge was the ramp — and a rotation slider
 * is useless if you cannot see what you are rotating. So the ghost is now the item's own part
 * specs, run through the same local-to-world maths sim.js uses (`wx = x + lx*c + lz*s`,
 * `wz = z - lx*s + lz*c`), into the ghostParts instanced meshes over the same unit primitives.
 * One source of truth for the shape: a preview cannot disagree with the item it previews.
 *
 * COST, since this replaced something that allocated nothing: def.parts() builds its spec
 * objects fresh, so a hover frame on the Tower allocates 18 short-lived objects. It is bounded
 * (18 is the worst item in the file, measured), it only happens while a finger or a cursor is
 * actually over the table with the Tricks tool selected, and it is nothing next to what a
 * single three.js matrix update does. Idle costs zero: no preview runs and the meshes are
 * `visible = false`, so this is also zero extra draw calls the rest of the time.
 */
/**
 * What the Select tool is about to grab. A trick WINS a tie with a domino inside its own
 * radius: a bell is often surrounded by the dominoes that ring it, and a child who taps the
 * bell means the bell. Both radii are the ones the First and Rub Out tools already use, so
 * "how close do I have to tap" is one answer everywhere.
 */
function pickAt(L, x, z) {
  const it = nearestItem(L, x, z, 0.06);
  if (it) return { kind: 'item', id: it.id, x: it.x, y: 0, z: it.z, r: it.r };
  const d = nearestDomino(L, x, z, 0.07);
  if (d) return { kind: 'domino', id: d.id, x: d.x, y: d.y, z: d.z, r: d.r };
  return null;
}

/** Highlight the piece a tap would select, in the selection ring's own blue. */
function previewSelect(L) {
  if (!nPts) return;
  const p = pickAt(L, pts[0], pts[1]);
  if (!p) return;
  ghostBox.position.set(p.x, p.y + DOM_HH, p.z);
  ghostBox.rotation.set(0, p.r, 0);
  const k = p.kind === 'item' ? 2.6 : 1;
  ghostBox.scale.set(DOM_W * 1.5 * k, DOM_H * 1.15, DOM_T * 3.2 * k);
  ghostBox.material.color.setHex(0x3498db);
  ghostBox.visible = true;
}

function previewItem(L) {
  clearGhostParts();
  if (!nPts) return;
  const def = ITEMS[itemType];
  if (!def) return;
  const x = pts[0], z = pts[1];
  // def.clearY = the height this item's own material starts at, at its drop point. Only
  // the Bridge sets it, and only the Bridge needs it: it is the one item you are supposed
  // to put on top of an obstacle.
  const ok = onTable(L, x, z) && !isBlocked(x, z, def.clearY) && !!surfaceAt(x, z);
  setGhostPartsColour(ok ? 0xa29bfe : 0xe74c3c);

  _ghostIt.type = itemType; _ghostIt.x = x; _ghostIt.z = z; _ghostIt.r = rotA;
  const specs = def.parts(_ghostIt);
  const c = Math.cos(rotA), s = Math.sin(rotA);
  const n = [0, 0, 0, 0];
  for (const sp of specs) {
    const m = sp.m;
    if (n[m] >= GHOST_PART_CAP) continue;    // silently clipped; nothing is this big today
    _v.set(x + sp.x * c + sp.z * s, sp.y, z - sp.x * s + sp.z * c);
    _e.set(sp.tilt || 0, rotA + (sp.yaw || 0), sp.roll || 0, 'YXZ');
    _q.setFromEuler(_e);
    _gs.set(sp.sx, sp.sy, sp.sz);
    _m.compose(_v, _q, _gs);
    ghostParts[m].setMatrixAt(n[m]++, _m);
  }
  for (let m = 0; m < 4; m++) {
    const g = ghostParts[m];
    g.count = n[m];
    g.visible = n[m] > 0;
    if (n[m]) g.instanceMatrix.needsUpdate = true;
  }
}

/** Every path out of a preview goes through here, so no ghost part is ever left behind. */
function clearGhostParts() {
  for (const g of ghostParts) { g.count = 0; g.visible = false; }
}

function drawGhost(n) {
  const cap = ghost.count;
  for (let i = 0; i < n; i++) {
    const d = preview[i];
    _v.set(d.x, d.y + DOM_HH, d.z);
    _e.set(0, d.r, 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v, _q, _s);
    ghost.setMatrixAt(i, _m);
  }
  ghost.count = n;
  if (n || cap) ghost.instanceMatrix.needsUpdate = true;
}

/** Desktop nicety: show the item/one-domino ghost under the mouse before clicking. */
function hoverPreview(cx, cy) {
  if (tool !== 'item' && tool !== 'single') return;
  orbit.makeRay(cx, cy);
  if (!pickSurface(orbit.rayPlane, _hit)) return;
  const L = hooks.getLayout();
  // Same rule as pushPoint: no ghost off the table, because nothing can be placed there.
  if (!onTable(L, _hit.x, _hit.z)) {
    if (ghostBox.visible || ghost.count) { ghostBox.visible = false; drawGhost(0); hooks.invalidate(); }
    return;
  }
  pts[0] = _hit.x; pts[1] = _hit.z; nPts = 1;
  refreshPreview();
  nPts = 0;
  hooks.invalidate();
}

// ==========================================================================
// COMMIT
// ==========================================================================
function commit() {
  const L = hooks.getLayout();
  if (tool === 'erase') {
    if (eraseIds.length || eraseItemIds.length) {
      hooks.apply(cmdRemove(L, eraseIds.slice(), eraseItemIds.slice()));
      audio.erase();
    }
    abandon();
    return;
  }
  if (tool === 'start') {
    const d = nPts ? nearestDomino(L, pts[0], pts[1], 0.07) : null;
    if (d) { hooks.apply(cmdSetStart(L, d.id)); audio.click(); }
    abandon();
    return;
  }
  if (tool === 'select') {
    const p = nPts ? pickAt(L, pts[0], pts[1]) : null;
    // A tap on bare felt DESELECTS. Without it the ring is a thing a child can turn on and
    // never off, and there is no other gesture that means "no, none of them".
    if (p) { select(p.kind, p.id, p.r); audio.click(); } else clearSelection();
    abandon();
    return;
  }
  if (tool === 'item') {
    if (nPts) {
      const x = pts[0], z = pts[1];
      if (onTable(L, x, z) && !isBlocked(x, z, ITEMS[itemType].clearY) && surfaceAt(x, z)) {
        const it = { type: itemType, x, z, r: rotA };
        hooks.apply(cmdAddItem(L, it, ITEMS[itemType].name));
        audio.place();
        // Drop it and it is already selected, so the slider is pointing at the thing you
        // just put down and turning it is one drag away rather than a tool change away.
        select('item', it.id, it.r);
      } else {
        hooks.onBlocked();
      }
    }
    abandon();
    return;
  }

  // Dominoes. Re-run the stroke into a fresh (unpooled) array so the committed
  // placements are real objects the layout can keep.
  const budget = budgetLeft();
  const colour = hooks.getColour();
  const out = [];
  let res;
  if (tool === 'single') {
    res = nPts ? placeOne(L, pts[0], pts[1], rotA, out, budget, colour, true)
      : { placed: 0, hitBudget: false };
  } else if (tool === 'arc') {
    res = strokeToDominoes(L, arcPts, buildArc(), out, budget, colour, false, true);
  } else if (nPts >= 2) {
    arcPts[0] = pts[0]; arcPts[1] = pts[1];
    arcPts[2] = pts[(nPts - 1) * 2]; arcPts[3] = pts[(nPts - 1) * 2 + 1];
    res = strokeToDominoes(L, arcPts, 2, out, budget, colour, false, true);
  } else if (nPts === 1) {
    res = placeOne(L, pts[0], pts[1], rotA, out, budget, colour, true);
  } else {
    res = { placed: 0, hitBudget: false };
  }
  abandon();
  if (out.length) {
    // ONE stroke is ONE undo entry.
    hooks.apply(cmdAddDominoes(L, out));
    audio.place();
    // The LAST domino of the stroke, which for a line or an arc is the end you just drew to
    // and is where a child's attention already is. Ids are assigned inside the command's
    // do(), so this is only valid after apply().
    const last = out[out.length - 1];
    select('domino', last.id, last.r);
    if (hooks.onPlaced) hooks.onPlaced(out.length);
  }
  if (res && res.hitBudget) hooks.onBudget();
}
