/* palette.js — every colour Paper Storm uses, as ramps rather than swatches.
 *
 * The reference art is cut card: each concentric ring is one flat colour, and
 * the sense of depth comes from neighbouring rings being one step apart on a
 * long, smooth gradient. So the unit of colour here is the ramp, not the
 * individual hex — a piece asks for "0.42 along STAGE1" and gets a colour that
 * is guaranteed to sit correctly against its neighbours at 0.35 and 0.49.
 *
 * Ramps are plain arrays of hex ints so they can be edited by eye.
 */
import * as THREE from 'three';

/* The reference image, read left-to-right through its ring clusters:
   cyan -> azure -> blue -> indigo -> violet -> magenta -> pink -> pale pink.

   Nothing in the reference is dark. The darkest thing in the picture is a
   mid-blue at about half lightness, and the shadows are what supply the
   contrast — so no stop in the SHALLOW ramps goes below roughly 40% lightness.
   A ramp with a near-black end drags every stack it touches toward mud.

   The deep stages (MIDNIGHT, TRENCH) break that on purpose: the descent is the
   point, and by then the readability is carried by the ramp's hot end being
   reserved for the play plane rather than by the scenery being light. */
export const DEEP = [
  0x2ce8f5, 0x1fd0f0, 0x1eb4ea, 0x2597e4,
  0x2b78dd, 0x3a5cd8, 0x5a45e0, 0x8236ea,
  0xa93ae0, 0xc94fd6, 0xe487e0, 0xf6ccf0,
];

/* Stage 1 IS the reference — same ramp, kept separate so DEEP can stay the
   canonical "house" ramp for UI and chrome while a stage gets retuned. */
export const STAGE1 = [
  0x2ce8f5, 0x1fd0f0, 0x1eb4ea, 0x2597e4,
  0x2b78dd, 0x3a5cd8, 0x5a45e0, 0x8236ea,
  0xa93ae0, 0xc94fd6, 0xe487e0, 0xf6ccf0,
];

/* Stage 2 — teal through aqua and sand to coral and cream. An earlier version
   ran green straight into orange, which is a clash at every step where the two
   meet; routing it through sand keeps the hue turning one way the whole way. */
export const STAGE2 = [
  0x18a8a0, 0x1cbcb0, 0x2fcdbd, 0x57dac6,
  0x86e4ce, 0xb3e6c6, 0xd8dfad, 0xecd095,
  0xf3b184, 0xf29478, 0xf6b79e, 0xfce3d2,
];

/* Stage 3 — indigo through violet and magenta to crimson and peach. Hot, not
   dark: the danger reads from saturation, not from turning the lights off. */
export const STAGE3 = [
  0x5b46d4, 0x6b46de, 0x7c45e4, 0x8f42e2,
  0xa93ed6, 0xc237c0, 0xd8309f, 0xe62f78,
  0xec3557, 0xf2544b, 0xf78571, 0xfcc2a8,
];

/* ------------------------------------------------------- the descent -----
 *
 * Seven stages of a paper-cut ocean going down: bright shallows to the trench.
 * The palette is doing the descent, so the ramps get darker and narrower as
 * the list goes on, and the last two deliberately break the lightness floor
 * above — MIDNIGHT and TRENCH are near-monochrome dark on purpose. They get
 * away with it because the rule that matters is not "nothing is dark", it is
 * "the actors own the bright end of the ramp"; both keep a hot, high-punch
 * colour at t=0 for the ship's core and hold the backdrop far away from it.
 */

/* 3. Kelp Forest — sunlight coming down through green water. Bright chartreuse
      at the top of the water column for the actors, deep green in the middle
      where the backdrop lives, gold at the far end for the light itself. */
export const KELP = [
  0xd8f77a, 0xaae95e, 0x78d652, 0x48bf52,
  0x2ca35a, 0x21885c, 0x216e54, 0x2f7042,
  0x4a7c31, 0x7c912d, 0xbaa83c, 0xe9d67e,
];

/* 4. The Wreck — rust and amber over slate and silt. The one stage with
      man-made geometry in it, and the ramp is built to match: a hot corroded
      end, a long dead middle of slate, and pale silt at the far end. */
export const WRECK = [
  0xffca7a, 0xf0a052, 0xd97b3c, 0xb35a30,
  0x8c4a30, 0x6e4438, 0x574a4a, 0x4a5560,
  0x556878, 0x6f8494, 0x9aa8ae, 0xd6d3c4,
];

/* 5. Midnight Drift — near-monochrome deep blue. The only bright things in the
      frame are bioluminescent, and bioluminescence belongs to the play plane:
      the ship's core, a weak point, a lure. The backdrop gets the trough. */
export const MIDNIGHT = [
  0x9ff2ff, 0x62d6f2, 0x38a9cf, 0x2a83ac,
  0x22638f, 0x1a4b72, 0x143a5a, 0x123049,
  0x173c58, 0x255a7c, 0x4d90b4, 0xaddcf2,
];

/* 7. The Trench — the bottom of the world. Near-black rock with vent orange
      and sulphur yellow as the only colour in it, and both of those reserved
      for the things that can kill you or that you are flying. */
export const TRENCH = [
  0xffe066, 0xffb63f, 0xf5812a, 0xcf5a1c,
  0x963f1a, 0x653018, 0x412618, 0x2a1e1a,
  0x3a2a20, 0x6b442a, 0xb8783f, 0xffcf95,
];

const RAMPS = { DEEP, STAGE1, STAGE2, STAGE3, KELP, WRECK, MIDNIGHT, TRENCH };

/* The stage order. `ramp` is the palette; `name` is what the player sees. */
export const STAGES = [
  { name: 'Paper Reef',     ramp: 'STAGE1' },
  { name: 'Coral Cut',      ramp: 'STAGE2' },
  { name: 'Kelp Forest',    ramp: 'KELP' },
  { name: 'The Wreck',      ramp: 'WRECK' },
  { name: 'Midnight Drift', ramp: 'MIDNIGHT' },
  { name: 'Violet Deep',    ramp: 'STAGE3' },
  { name: 'The Trench',     ramp: 'TRENCH' },
];

/* Shadow is one global setting because the light in a paper collage is one
   light: every piece in the picture throws its shadow the same direction, the
   same distance, at the same strength, or the illusion dies. Nothing in the
   game may override these — no per-object darker or bigger shadow. Offsets are
   world units (the play area is 100 tall), and the rule of thumb that follows
   from this offset is that a contour band wants to be four to eight times it:
   thinner and the bands read as streaks, wider and the stack stops stepping. */
export const SHADOW = { color: 0x102a5c, opacity: 0.18, dx: 0.40, dy: -0.40 };

/* Arcade chrome — shared with every other game in the hub. */
export const ACCENT = 0x6c5ce7;
export const GLOW   = 0xa29bfe;
export const GOLD   = 0xffd32a;
export const DANGER = 0xe74c3c;

/* The arcade's base dark. Backdrop colours are mixed toward this so the
   scenery sits behind the play plane instead of competing with it. */
export const BASE = 0x0a0a2e;

/* The rim colour every actor carries: one near-white sheet of card under the
   whole silhouette, showing as a thin bright edge. This is the single thing
   that keeps a seven-unit enemy readable against a field of contours, so it is
   a constant rather than a per-object choice — a rim that varies stops being a
   signal and goes back to being decoration. */
export const RIM = 0xf2fbff;
export const RIM_WIDTH = 0.35;          // world units

const _base = new THREE.Color(BASE);

/* Push a colour back toward the base dark. `amount` 0 leaves it alone, 1 makes
   it the base. Used on everything in the backdrop and nothing in front of it. */
export function recede(color, amount) {
  return color.clone().lerp(_base, amount);
}

/* ------------------------------------------------- the readability rule ---
 *
 * THE RULE: on every stage, the backdrop must be quieter than the actors.
 * Scenery the player has to visually subtract before they can play is scenery
 * that is doing harm, however good it looks in a still.
 *
 * The useful measure is not brightness on its own. Stage 3's backdrop measures
 * DARKER than stage 1's and still comes forward, because what grabs the eye in
 * flat colour is brightness AND colourfulness together — call it punch:
 *
 *      punch = relative luminance x saturation
 *
 * Every ramp has a quiet stretch and a hot stretch, and they are in different
 * places on different ramps. STAGE1 peaks at its cyan end and is quiet through
 * the middle and top. STAGE3 climbs the whole way: it is quiet at the indigo
 * end and hottest at peach. Which is exactly why one fixed cap of 0.70 worked
 * for stage 1 and let stage 3's scenery into the crimson the actors need.
 *
 * So: THE BACKDROP LIVES IN ITS RAMP'S QUIET ZONE, and the hot stretch belongs
 * to actors and explosions. quietZone() derives that from the ramp itself, so
 * a future retune cannot silently break the rule — the numbers in
 * BACKDROP_WINDOW are checked against it.
 */

const _lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function luminance(color) {
  return 0.2126 * _lin(color.r) + 0.7152 * _lin(color.g) + 0.0722 * _lin(color.b);
}

export function saturation(color) {
  const mx = Math.max(color.r, color.g, color.b);
  const mn = Math.min(color.r, color.g, color.b);
  return mx > 0 ? (mx - mn) / mx : 0;
}

/* How much a flat colour grabs the eye. */
export function punch(color) { return luminance(color) * saturation(color); }

/* The contiguous stretch of a ramp, around its quietest point, whose punch
   stays within `share` of the ramp's own punch range. Returned as {lo, hi} in
   ramp coordinates. Relative to the ramp's own range, not an absolute number,
   because a ramp made entirely of hot colours has no absolute quiet end. */
export function quietZone(name, share = 0.30, steps = 60) {
  const p = [];
  for (let i = 0; i <= steps; i++) p.push(punch(ramp(name, i / steps)));
  const floor = Math.min(...p), peak = Math.max(...p);
  const limit = floor + (peak - floor) * share;
  let at = p.indexOf(floor);
  let lo = at, hi = at;
  while (lo > 0 && p[lo - 1] <= limit) lo--;
  while (hi < steps && p[hi + 1] <= limit) hi++;
  return { lo: lo / steps, hi: hi / steps, floor, peak, limit };
}

/* The slice of each ramp the backdrop is allowed, and how hard that stage's
   scenery is pushed toward the base dark. Each window is inside its ramp's
   quiet zone — asserted, not assumed.

   STAGE2 is the awkward one and worth knowing about: its ramp is colourful at
   every point (its punch never drops below a third of its peak), so it has no
   real quiet zone and its separation comes from hue instead — coral actors on
   a green field — plus the rim. It is the ramp most at risk from a retune. */
export const BACKDROP_WINDOW = {
  DEEP:   { lo: 0.12, hi: 0.68, recede: 1.00 },
  STAGE1: { lo: 0.20, hi: 0.68, recede: 1.00 },
  /* Declared exception: STAGE2 has no quiet zone to sit in, so its separation
     is hue — coral and cream actors on a green and teal field — backed by the
     rim. Written down rather than left implicit, because the next person to
     retune this ramp needs to know the safety net is hue and not value. */
  STAGE2: { lo: 0.12, hi: 0.68, recede: 1.00, hueSeparated: true },
  // Hot from about 0.45 up: crimson and peach are the actors' on this stage.
  STAGE3: { lo: 0.06, hi: 0.42, recede: 1.40 },
  // Deep green mid-water. The sunlit chartreuse and the gold are the light
  // coming down, and light is a play-plane colour on this stage.
  KELP:     { lo: 0.28, hi: 0.72, recede: 1.00 },
  // Dead slate and silt. The corroded hot end belongs to the wreck's own
  // set pieces and to the actors, not to the ambient field.
  WRECK:    { lo: 0.28, hi: 0.78, recede: 1.05 },
  // The trough and nothing but. Every bioluminescent colour on this stage is
  // something the player has to react to, so none of it is scenery.
  MIDNIGHT: { lo: 0.34, hi: 0.78, recede: 1.15 },
  // Near-black rock only. Vent orange and sulphur are the actors' and the
  // vents', and the vents are set pieces that live inside this window too —
  // they read as glowing because everything around them is darker, not
  // because they are allowed past the cap.
  TRENCH:   { lo: 0.42, hi: 0.82, recede: 1.25 },
};

export function backdropWindow(name) {
  return BACKDROP_WINDOW[name] || BACKDROP_WINDOW.DEEP;
}

/* Colour drift across a stage: the backdrop is multiplied by a tint that
 * travels from `from` to `to` over the stage's length. Barely perceptible
 * minute to minute, obvious between the first screen and the last.
 *
 * It is a MULTIPLY, and every channel of both ends is below white, which is
 * what makes it safe: a multiply can only take light out, so drift can darken
 * or cool the scenery but can never walk it up into the actors' range. The
 * ramp position may drift; the actors' advantage may not. (The contrast suite
 * checks the rule at several points along the drift, not just at the start.)
 */
export const BACKDROP_DRIFT = {
  DEEP:   { from: 0xffffff, to: 0xffffff },
  // Stage 1: opens cool and open, closes deeper and bluer.
  STAGE1: { from: 0xe8f4ff, to: 0x8fa0d8 },
  // Stage 2: opens bright and shallow, closes into weedier green.
  STAGE2: { from: 0xf2fff4, to: 0x9fc0a4 },
  // Stage 3: opens dim, closes dimmer and colder — the deep getting deeper.
  STAGE3: { from: 0xdcd6f4, to: 0x7a6fb0 },
  // Kelp: the light fades as the canopy closes over.
  KELP:     { from: 0xf4ffe6, to: 0x94ad84 },
  // Wreck: silt settling out of the water.
  WRECK:    { from: 0xfff1de, to: 0x9c968e },
  // Midnight: it only gets lonelier.
  MIDNIGHT: { from: 0xdde9ff, to: 0x7688ad },
  // Trench: the last of the light going.
  TRENCH:   { from: 0xd6cdc2, to: 0x7e6a5c },
};

export function backdropDrift(name) {
  return BACKDROP_DRIFT[name] || BACKDROP_DRIFT.DEEP;
}

export function rampList(name) {
  const r = RAMPS[name];
  if (!r) throw new Error('palette: unknown ramp "' + name + '"');
  return r;
}

export function rampNames() { return Object.keys(RAMPS); }

const _a = new THREE.Color();
const _b = new THREE.Color();

/* Smoothstep between stops rather than a straight lerp. A linear ramp sampled
   at even steps shows its stops as faint bands where the slope kinks; easing
   each segment hides the kink without needing more stops. */
function smooth(t) { return t * t * (3 - 2 * t); }

export function ramp(name, t) {
  const stops = rampList(name);
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  _a.setHex(stops[i]);
  _b.setHex(stops[i + 1]);
  return new THREE.Color().lerpColors(_a, _b, smooth(u - i));
}

/* n colours evenly spaced across a ramp. n === 1 returns the midpoint, which
   is more useful than an arbitrary end. */
export function rampSwatch(name, n) {
  if (n <= 1) return [ramp(name, 0.5)];
  const out = [];
  for (let i = 0; i < n; i++) out.push(ramp(name, i / (n - 1)));
  return out;
}

/* Hex int for places that want a number (materials, CSS via toString(16)). */
export function rampHex(name, t) { return ramp(name, t).getHex(); }
