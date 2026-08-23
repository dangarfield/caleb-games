// Every tuned number in one place. The physics values are MEASURED (see
// docs/.plans/game-dominoes.plan.md) — do not "clean them up".

// Which of the four InstancedMeshes a part is drawn by. Lives here rather than in
// env.js so the pure-data modules (items-def.js) never have to import the renderer.
export const MESH = { DOMINO: 0, BOX: 1, BALL: 2, CYL: 3 };

// --- the domino ------------------------------------------------------------
// Real domino proportions, 48 x 24 x 7.5 mm, at real scale (1 unit = 1 metre).
// The world is small, which is why sim.js sets world.lengthUnit = 0.05: it tells
// Rapier what "a metre" is here so a 48 mm box is not entirely inside the solver's
// own contact slop. Measured: 0.258 -> 0.152 ms/step just from that one line.
export const DOM_W = 0.024;      // width  (local X)
export const DOM_H = 0.048;      // height (local Y)
export const DOM_T = 0.0075;     // thickness (local Z) — the axis it topples along
export const DOM_HW = DOM_W / 2;
export const DOM_HH = DOM_H / 2;
export const DOM_HT = DOM_T / 2;
export const DOM_DENSITY = 1200; // Rapier's default density is 1, NOT 1000

// --- spacing ---------------------------------------------------------------
// Measured on 200 dominoes: 0.4-0.95 x height -> 200/200 fall.  1.05 x height ->
// 13/200 and the chain dies. Theory (van Leeuwen) puts the limit at sqrt(3)/2 ~ 0.87.
// So the editor is HARD-CLAMPED to 0.85 x height and a kid's run can never fail for
// geometric reasons. Inside that safe band, spacing is a pacing dial: tight = a fast
// wave, wide = slow and dramatic.
export const SPACING_MAX = 0.85 * DOM_H;
export const SPACINGS = {
  tight:  { id: 'tight',  name: 'Tight',  label: 'fast wave',  gap: 0.55 * DOM_H },
  normal: { id: 'normal', name: 'Normal', label: 'just right', gap: 0.70 * DOM_H },
  wide:   { id: 'wide',   name: 'Wide',   label: 'slow drama', gap: SPACING_MAX },
};
export const SPACING_IDS = ['tight', 'normal', 'wide'];
/** Never trust a caller: clamp into the band that is known to topple. */
export function clampGap(g) {
  return Math.max(0.35 * DOM_H, Math.min(SPACING_MAX, g));
}

// --- tables ----------------------------------------------------------------
// The floor is a fixed cuboid whose top face is y = 0, plus four low kerbs (below
// domino height) so a run cannot walk off the edge but a launched ball still can.
export const TABLES = {
  small:  { id: 'small',  name: 'Small',  w: 1.30, d: 0.95 },
  medium: { id: 'medium', name: 'Medium', w: 1.90, d: 1.40 },
  large:  { id: 'large',  name: 'Large',  w: 2.60, d: 1.90 },
  huge:   { id: 'huge',   name: 'Huge',   w: 3.40, d: 2.50 },
};
export const TABLE_ORDER = ['small', 'medium', 'large', 'huge'];
export const KERB_H = 0.012;
export const TABLE_THICK = 0.06;

// --- budgets ---------------------------------------------------------------
export const BUDGETS = [60, 150, 300, 500];

// --- colours ---------------------------------------------------------------
// Eight, so "use 4 or more colours in one run" is an easy, obvious thing to do.
export const COLOURS = [
  { name: 'Ivory',  hex: 0xf3ead9 },
  { name: 'Red',    hex: 0xe74c3c },
  { name: 'Orange', hex: 0xf39c12 },
  { name: 'Yellow', hex: 0xffd32a },
  { name: 'Green',  hex: 0x2ecc71 },
  { name: 'Blue',   hex: 0x3498db },
  { name: 'Purple', hex: 0x9b59b6 },
  { name: 'Pink',   hex: 0xfd79a8 },
];

// Skins recolour at RENDER time only (the layout still stores the colour you chose,
// so the Rainbow achievement counts what you actually picked). Zero cost: it is one
// instance-colour write per domino at build time.
export const SKINS = {
  plain:   { id: 'plain',   name: 'Plain',   desc: 'The colour you picked' },
  stripe:  { id: 'stripe',  name: 'Stripes', desc: 'Every other one goes white' },
  spots:   { id: 'spots',   name: 'Spots',   desc: 'Light and dark, two by two' },
  gold:    { id: 'gold',    name: 'Gold',    desc: 'All of them, solid gold' },
};

// --- table surfaces (challenge rewards) ------------------------------------
export const SURFACES = {
  felt:  { id: 'felt',  name: 'Green Felt', top: 0x2f6b46, edge: 0x1d3f2a, line: 0x3d8a5a, sky: 0x0a0a2e },
  wood:  { id: 'wood',  name: 'Wood',       top: 0x8b5a2b, edge: 0x53341a, line: 0xa8703a, sky: 0x14102e },
  ice:   { id: 'ice',   name: 'Ice',        top: 0x9fd8e8, edge: 0x5f9fb4, line: 0xc9edf7, sky: 0x0a1e3a },
  neon:  { id: 'neon',  name: 'Neon Grid',  top: 0x141452, edge: 0x2a2a7e, line: 0xa29bfe, sky: 0x05051a },
  space: { id: 'space', name: 'Deep Space', top: 0x1b1035, edge: 0x0d0820, line: 0x6c5ce7, sky: 0x02020c },
  candy: { id: 'candy', name: 'Candy Floss', top: 0xf5b7c9, edge: 0xc4788f, line: 0xffffff, sky: 0x2a0a20 },
  lava:  { id: 'lava',  name: 'Lava Rock',  top: 0x3a1208, edge: 0x1c0703, line: 0xff6b1a, sky: 0x1a0500 },
  gold:  { id: 'gold',  name: 'Gold Leaf',  top: 0xb98a2a, edge: 0x6f4f12, line: 0xffd980, sky: 0x1a1405 },
};

// --- arcade palette --------------------------------------------------------
export const PAL = {
  base: '#0a0a2e', accent: '#6c5ce7', glow: '#a29bfe',
  sub: '#a0c4ff', gold: '#ffd32a', danger: '#e74c3c',
};

// --- physics tuning (measured) ---------------------------------------------
export const PHYS = {
  H: 1 / 60,                 // FIXED timestep. Never assign a frame delta.
  maxSubsteps: 3,
  maxDt: 0.1,
  lengthUnit: 0.05,
  gravity: -9.81,
  dominoFriction: 0.5,       // at 0.1 the first domino just slides and the chain dies
  floorFriction: 0.7,
  restitution: 0.0,          // 0 and 0.4 measured identical: impacts are below the threshold
  // Park a domino once it has BOTH fallen and gone calm. The `fallen` gate is
  // essential: parking any calm body freezes the still-standing dominoes ahead of
  // the wave and the chain hits a Fixed wall (measured 3/500).
  calmFrames: 15,
  fallenFrac: 0.7,           // y < restingY * 0.7 counts as fallen
  calmV2: 1e-4,
  calmW2: 4e-2,
  startImpulse: 0.1,         // x mass, applied at the top of the first domino.
                             // 0.05 x mass does NOT reliably start it.
  softCcd: DOM_H,            // on launched balls only: 22/40 -> 33/40 at 10 m/s
};
