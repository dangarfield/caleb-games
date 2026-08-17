// Single source of truth for where everything in the lake lives.
// Every position is derived from the lake outline so nothing is hand-guessed.

import { DEG, clamp, smoothRange } from '../util.js';

export const WATER_Y = 0;

export const LAKE = { cx: 0, cz: 58, R: 128 };

/** Organic lake outline: radius as a function of the polar angle atan2(dz, dx). */
export function lakeRadius(theta) {
  return LAKE.R
    + 21 * Math.sin(2 * theta + 0.5)
    + 13 * Math.sin(3 * theta - 1.2)
    + 7 * Math.sin(5 * theta + 2.1)
    + 4.5 * Math.sin(7 * theta + 0.7);
}

/** Unit vector pointing from the lake centre outwards at angle theta. */
export function outward(theta) {
  return { x: Math.cos(theta), z: Math.sin(theta) };
}

/**
 * A point on (or near) the shoreline.
 * offset > 0 walks inland, offset < 0 walks out into the water.
 */
export function shorePoint(thetaDeg, offset = 0) {
  const t = thetaDeg * DEG;
  const r = lakeRadius(t) + offset;
  return { x: LAKE.cx + Math.cos(t) * r, z: LAKE.cz + Math.sin(t) * r, theta: t };
}

// --- shore character around the rim -----------------------------------------
// shelf  : how far the shallow water shelf reaches out (big = wide gentle beach)
// bankH  : how high the land rises behind the shore
// slope  : how quickly it rises (small = steep bank)
// sandy  : 0 grass .. 1 sand
// rocky  : sprinkle of grey stone
export const SHORE_ZONES = [
  { theta: -152, span: 15, shelf: 26, bankH: 3.2, slope: 26, sandy: 1.0, rocky: 0.15, name: 'West Beach' },
  { theta: -128, span: 13, shelf: 34, bankH: 1.9, slope: 30, sandy: 0.75, rocky: 0.05, name: 'Reed Bay' },
  { theta: -102, span: 17, shelf: 24, bankH: 2.8, slope: 24, sandy: 1.0, rocky: 0.1, name: 'Main Beach' },
  { theta: -76, span: 11, shelf: 13, bankH: 4.4, slope: 13, sandy: 0.45, rocky: 0.2, name: 'Pier Shore' },
  // Willow used to be a 6 m cliff, which put the pick-up stones several metres
  // below the eye and off the bottom of the screen. Gentler bank, wider shelf.
  { theta: -52, span: 13, shelf: 15, bankH: 4.0, slope: 22, sandy: 0.3, rocky: 0.2, name: 'Willow Bank' },
  { theta: -18, span: 15, shelf: 9, bankH: 5.6, slope: 10, sandy: 0.2, rocky: 0.55, name: 'Cove Rocks' },
  // --- phase 2 shore zones (the unlockable spots) ---------------------------
  // Kept deliberately close to their neighbours' profiles so adding them does
  // not move the shoreline (and the rock framing) at the original spots.
  { theta: -64, span: 9, shelf: 13, bankH: 4.4, slope: 16, sandy: 0.25, rocky: 0.85, name: 'Rocky Point' },
  { theta: 14, span: 13, shelf: 12, bankH: 6.5, slope: 17, sandy: 0.15, rocky: 0.8, name: 'Waterfall Inlet' },
  { theta: 40, span: 12, shelf: 10, bankH: 8.5, slope: 12, sandy: 0.1, rocky: 0.7, name: 'Cliff Ledge' },
  { theta: 118, span: 15, shelf: 14, bankH: 3.4, slope: 24, sandy: 0.55, rocky: 0.1, name: 'Misty Shore' },
];
export const SHORE_DEFAULT = { shelf: 11, bankH: 9.5, slope: 15, sandy: 0.12, rocky: 0.25 };

/** Blend of the shore zones for a given polar angle (degrees). */
export function shoreStyle(thetaDeg) {
  let wsum = 0;
  const acc = { shelf: 0, bankH: 0, slope: 0, sandy: 0, rocky: 0 };
  for (const z of SHORE_ZONES) {
    // wrapped angular distance in degrees
    const d = Math.abs(((thetaDeg - z.theta + 540) % 360) - 180);
    const w = 1 - smoothRange(z.span * 0.55, z.span * 1.6, d);
    if (w <= 0) continue;
    wsum += w;
    acc.shelf += z.shelf * w; acc.bankH += z.bankH * w;
    acc.slope += z.slope * w; acc.sandy += z.sandy * w; acc.rocky += z.rocky * w;
  }
  const wd = clamp(1 - wsum, 0, 1);
  wsum += wd;
  acc.shelf += SHORE_DEFAULT.shelf * wd; acc.bankH += SHORE_DEFAULT.bankH * wd;
  acc.slope += SHORE_DEFAULT.slope * wd; acc.sandy += SHORE_DEFAULT.sandy * wd;
  acc.rocky += SHORE_DEFAULT.rocky * wd;
  acc.shelf /= wsum; acc.bankH /= wsum; acc.slope /= wsum;
  acc.sandy /= wsum; acc.rocky /= wsum;
  return acc;
}

// --- the cove + bridge -------------------------------------------------------
const COVE_THETA = -18;
const coveMouth = shorePoint(COVE_THETA, -7);
const coveOut = outward(COVE_THETA * DEG);
export const COVE = {
  ax: coveMouth.x, az: coveMouth.z,                       // mouth (in the lake)
  length: 104,
  bx: coveMouth.x + coveOut.x * 104,
  bz: coveMouth.z + coveOut.z * 104,                      // head (inland)
  dirX: coveOut.x, dirZ: coveOut.z,
  nx: -coveOut.z, nz: coveOut.x,                          // channel normal
  halfWidth: 13,
  depth: 1.6,
};

/** Lateral wobble of the creek so the channel is not a dead-straight canal. */
export function coveWobble(t) {
  return Math.sin(t * 4.1) * 5.5 + Math.sin(t * 7.7 + 1.2) * 2.6;
}
/** Point on the creek centreline, s metres from the mouth. */
export function covePoint(s) {
  const t = clamp(s / COVE.length, 0, 1);
  const w = coveWobble(t);
  return { x: COVE.ax + COVE.dirX * s + COVE.nx * w, z: COVE.az + COVE.dirZ * s + COVE.nz * w };
}
/** Local width multiplier: wide at the mouth, narrowing towards the head. */
export function coveWidthAt(t) { return 1.18 - 0.42 * t; }

export const BRIDGE = (() => {
  const s = 42;                            // 42 m up the creek from the mouth
  const p = covePoint(s);
  const a = covePoint(s - 4), b = covePoint(s + 4);
  let tx = b.x - a.x, tz = b.z - a.z;
  const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  return {
    x: p.x, z: p.z,
    dirX: tx, dirZ: tz,                    // direction the stone travels through
    nx: -tz, nz: tx,                       // along the deck
    halfLength: 26, deckY: 4.7,
    clearance: 3.7,
    gateHalfWidth: 8.5,
  };
})();

// --- islands ----------------------------------------------------------------
export const ISLANDS = [
  // Sand Isle: the reachable one (see SPOTS: aligned with West Beach)
  { x: 0, z: 0, r: 15, h: 2.3, sandy: 1, name: 'Sand Isle', trees: 1 },
  // Scenic far island
  { x: 34, z: 152, r: 34, h: 13, sandy: 0.25, name: 'Pine Island', trees: 26 },
  { x: -78, z: 132, r: 17, h: 6.5, sandy: 0.3, name: 'Gull Rock', trees: 5 },
];

// --- throw spots ------------------------------------------------------------
// rockCount is deliberately modest (4-6). A beach is a CHOICE of stones, not a
// heap: the view cone is only ~32 deg wide and about 15 deg deep, so more than
// about six stones cannot be kept MIN_ANG apart on screen for small fingers to
// tap one on purpose (see MIN_ANG in rocks.js).
function makeSpot(id, name, thetaDeg, offset, opts = {}) {
  const p = shorePoint(thetaDeg, offset);
  // face towards the lake centre by default
  let fx = LAKE.cx - p.x, fz = LAKE.cz - p.z;
  const l = Math.hypot(fx, fz); fx /= l; fz /= l;
  if (opts.faceX !== undefined) { fx = opts.faceX; fz = opts.faceZ; }
  return {
    id, name, x: p.x, z: p.z, theta: thetaDeg,
    fx, fz, rx: -fz, rz: fx,                 // right = forward rotated -90deg
    standY: opts.standY || 0,                // platform height override (piers)
    onPier: !!opts.onPier,
    // natural stone shelf to stand on (props.js builds it): { w, len, back, color }
    shelf: opts.shelf || null,
    // usable deck IN FRONT of the marker, for scattering pick-up stones
    deck: opts.deck || null,
    hint: opts.hint || '',
    rockCount: opts.rockCount !== undefined ? opts.rockCount : 7,
    // phase 2: spots bought in the shop start locked (main.js unlocks from the save)
    unlock: opts.unlock || '',
    unlocked: !opts.unlock,
  };
}

export const SPOTS = [
  makeSpot('west', 'West Beach', -152, 5, { hint: 'Sand Isle straight ahead', rockCount: 6 }),
  makeSpot('reeds', 'Reed Point', -128, 4, { hint: 'Thread the reed gate', rockCount: 6 }),
  makeSpot('main', 'Main Beach', -102, 5.5, { hint: 'Wide open water + distance flags', rockCount: 6 }),
  // The Long Pier deck runs out to offset -33, so there are ~5 m of planks in
  // front of the marker: stones go there, never behind you where you cannot look.
  // 3.5..4.7 m is also the band the resting camera frames (see rocks.js).
  makeSpot('pier', 'Long Pier', -76, -28, {
    // 4 stones, not 5: the planks in front of the marker are only ~2 m deep and
    // ~2.3 m wide inside the portrait cone, so a fifth stone always crowded one
    // of the others into the same fingertip.
    hint: 'Deep water, far buoys', standY: 1.75, onPier: true, rockCount: 4,
    deck: { min: 2.9, max: 4.9, side: 1.15 },
  }),
  makeSpot('willow', 'Willow Bank', -52, 5, { hint: 'Floating ring out front', rockCount: 6 }),
];

const EXTRA_SPOT_DEFS = () => [
  // Rocky Point and Waterfall Inlet sit on steep banks: the sand 4 m ahead is
  // more than 2 m below the eye, which is off the bottom of a portrait screen.
  // So, like the Cliff Ledge, they stand on a flat stone shelf (props.js draws
  // it) whose top is the height of the ground at the marker. Level footing means
  // the loose stones land in the same well-framed band as every beach spot.
  // standY matches heightAt(spot) — the shelf is 3 m thick, so it stays buried.
  makeSpot('rocky', 'Rocky Point', -64, 4, {
    hint: 'Boulders and deep water straight off the point',
    rockCount: 6, unlock: 'spot_rocky',
    standY: 0.88, onPier: true, shelf: { w: 3.9, len: 6.2, back: 2.2, color: 0xa8a49a },
    deck: { min: 2.8, max: 4.7, side: 1.2 },
  }),
  // stands on the little beach jetty that was already at theta -112
  makeSpot('dock', 'Boat Dock', -112, -9, {
    hint: 'Mooring posts to bounce off', standY: 1.2, onPier: true,
    deck: { min: 3.0, max: 4.8, side: 0.95 }, rockCount: 5, unlock: 'spot_dock',
  }),
  // stands on the west plank, over the lily raft
  makeSpot('lily', 'Lily-Pad Cove', -140, -7, {
    hint: 'Land one on the big lily raft', standY: 1.0, onPier: true,
    // the west plank only runs 4 m past the marker, so this is the smallest
    // deck in the lake: four stones is all that fits with room to tap one
    deck: { min: 3.0, max: 4.3, side: 0.85 }, rockCount: 4, unlock: 'spot_lily',
  }),
  makeSpot('falls', 'Waterfall Inlet', 14, 4.5, {
    hint: 'Skip out past the falling water', rockCount: 6, unlock: 'spot_falls',
    standY: 1.54, onPier: true, shelf: { w: 4.2, len: 6.6, back: 2.4, color: 0x94a3a4 },
    deck: { min: 2.8, max: 4.8, side: 1.25 },
  }),
  // a stone shelf you climb onto: highest launch in the lake, longest clear lane
  makeSpot('cliff', 'Cliff Ledge', 40, 1.5, {
    hint: 'High up — the longest lane in the lake', standY: 2.2, onPier: true,
    // The shelf must reach past the far end of the scatter deck, or a stone would
    // sit in mid-air off the lip. props.js builds it from these numbers, the same
    // way it builds the Rocky Point and Waterfall Inlet shelves.
    shelf: { w: 5.4, len: 6.0, back: 2.8, color: 0x94918a },
    deck: { min: 3.0, max: 5.2, side: 1.3 }, rockCount: 6, unlock: 'spot_cliff',
  }),
  makeSpot('mist', 'Misty Far Shore', 118, 5, {
    hint: 'The widest water there is', rockCount: 6, unlock: 'spot_mist',
  }),
];

// Cove jetty is placed from the cove geometry, facing up the creek.
{
  const jx = COVE.ax - coveOut.x * 16, jz = COVE.az - coveOut.z * 16;
  SPOTS.push({
    id: 'cove', name: 'Cove Jetty', x: jx, z: jz, theta: COVE_THETA,
    fx: coveOut.x, fz: coveOut.z, rx: -coveOut.z, rz: coveOut.x,
    standY: 1.6, onPier: true, hint: 'Skip it under the bridge',
    // the jetty faces back up the creek, so the whole deck is in front of you
    deck: { min: 2.9, max: 7.2, side: 1.05 },
    rockCount: 5, unlock: '', unlocked: true,
  });
}

// --- phase 2 spots (bought in the shop) -------------------------------------
// Each one is a real place with its own reason to exist: a lane over different
// water, a target of its own, or a different launch height. They come after the
// six base spots so the spots list still reads "the lake you start with", then
// "the lake you unlock".
export const BASE_SPOT_IDS = SPOTS.map(s => s.id);
export const EXTRA_SPOTS = EXTRA_SPOT_DEFS();
for (const s of EXTRA_SPOTS) SPOTS.push(s);

export function spotById(id) { return SPOTS.find(s => s.id === id); }

/** Helper: a point relative to a spot (forward / right metres). */
export function fromSpot(spot, fwd, right = 0) {
  return { x: spot.x + spot.fx * fwd + spot.rx * right, z: spot.z + spot.fz * fwd + spot.rz * right };
}

// place Sand Isle 74 m out from West Beach
{
  const s = spotById('west');
  const p = fromSpot(s, 74, 9);
  ISLANDS[0].x = p.x; ISLANDS[0].z = p.z;
}

// --- floating targets -------------------------------------------------------
function target(spotId, fwd, right, extra) {
  const s = spotById(spotId);
  const p = fromSpot(s, fwd, right);
  return Object.assign({ x: p.x, z: p.z, spot: spotId, dist: fwd }, extra);
}

export const BUOYS = [
  target('main', 44, 4, { id: 'buoyRed', color: 0xe74c3c, r: 1.5, label: 'Red buoy' }),
  target('pier', 56, -7, { id: 'buoyYellow', color: 0xffd32a, r: 1.4, label: 'Yellow buoy' }),
  // 74 m: inside the ~88 m range of a great throw, so "far buoy" is hard but real
  target('pier', 74, 11, { id: 'buoyBlue', color: 0x3aa7ff, r: 1.4, label: 'Blue buoy' }),
];

export const RING = target('willow', 50, 2, { id: 'ring', rOuter: 3.4, rInner: 2.3 });

export const REED_GATE = (() => {
  const s = spotById('reeds');
  const c = fromSpot(s, 28, 0);
  return {
    x: c.x, z: c.z,
    dirX: s.fx, dirZ: s.fz,                 // the stone flies this way
    nx: s.rx, nz: s.rz,                     // the reed row runs this way
    gapHalf: 4.2, rowHalf: 24, spot: 'reeds',
  };
})();

// Staggered sideways so the billboard labels never stack on top of each other
// when you stand at Main Beach and look down the line. The offsets sweep LEFT to
// RIGHT with distance, so the labels read 40, 60, 80, 100 in order across the
// screen instead of hopping about, and every flag stays inside ~12 deg of the aim
// line (the portrait-tablet half-FOV) so none of them needs looking around.
export const DIST_FLAGS = [40, 60, 80, 100].map((d, i) => {
  const lat = [-8, -4, 6, 20][i];
  const p = fromSpot(spotById('main'), d, lat);
  return { x: p.x, z: p.z, d };
});

// --- phase 2 targets --------------------------------------------------------
// A second reed row further out, aligned with the first, so one throw can thread
// both gates ("Double Gate"). 44 m is as far as the Reed Bay shelf stays shallow
// enough (~2 m) for reeds to be standing in it.
export const REED_GATE2 = (() => {
  const s = spotById('reeds');
  const c = fromSpot(s, 44, 0);
  return {
    x: c.x, z: c.z, dirX: s.fx, dirZ: s.fz, nx: s.rx, nz: s.rz,
    gapHalf: 3.6, rowHalf: 14, spot: 'reeds',
  };
})();

// Lily rafts you can land a stone on. Both sit OFF the straight lane on purpose:
// hitting one is an aimed shot, not something that eats every throw.
export const LILY_RAFTS = [
  target('lily', 52, 14, { id: 'raftBig', r: 6.0, pads: 11 }),
  target('reeds', 34, 13, { id: 'raftSmall', r: 3.6, pads: 6 }),
];

// A little striped beacon on Sand Isle — a target you can see from a long way off.
export const BEACON = {
  x: ISLANDS[0].x + 2, z: ISLANDS[0].z - 3,
  baseY: ISLANDS[0].h * 0.62, h: 4.6, r: 0.55, hitR: 2.4,
};

// Mooring posts in the water off the Boat Dock. Stones bounce off them.
export const POSTS = [
  target('dock', 16, -5, { id: 'post1', r: 0.55, h: 1.75 }),
  target('dock', 25, 6, { id: 'post2', r: 0.55, h: 1.9 }),
  target('dock', 34, -2, { id: 'post3', r: 0.55, h: 1.65 }),
];

// Waterfall beside the inlet spot: a rock notch pouring into the lake.
export const WATERFALL = (() => {
  const p = shorePoint(21, 3);
  return { x: p.x, z: p.z, topY: 7.4, w: 3.2 };
})();

// piers / jetties (wooden decks). Each: from a shore angle out into the water.
export const PIERS = [
  { theta: -76, from: 6, to: -33, width: 3.4, deckY: 1.75 },     // Long Pier
  { theta: -18, from: 5, to: -28, width: 3.0, deckY: 1.6 },      // Cove Jetty
  { theta: -112, from: 4, to: -14, width: 2.6, deckY: 1.2 },     // small beach jetty
  { theta: -140, from: 4, to: -11, width: 2.2, deckY: 1.0 },     // west beach plank
];

/** Distance from a point to the (wobbly) creek centreline — used to carve terrain. */
export function coveDist(x, z) {
  const ax = COVE.ax, az = COVE.az;
  const vx = COVE.bx - ax, vz = COVE.bz - az;
  const len2 = vx * vx + vz * vz;
  let t = ((x - ax) * vx + (z - az) * vz) / len2;
  t = clamp(t, 0, 1);
  const w = coveWobble(t);
  const px = ax + vx * t + COVE.nx * w, pz = az + vz * t + COVE.nz * w;
  return { d: Math.hypot(x - px, z - pz), t, w: coveWidthAt(t) };
}
