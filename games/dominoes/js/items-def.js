// The trick items: pure data. No Three.js, no Rapier, no DOM — every item is a list
// of PART SPECS plus optional rectangles describing where you may (and may not) put
// dominoes. parts.js turns the specs into instances and (at GO time) bodies.
//
// Two conventions make the whole file simple:
//
//  1. LOCAL +Z IS FORWARD — the direction the domino chain travels through the item.
//     A domino's own thin axis is local Z too (see consts.js), so an item and the run
//     that feeds it always agree about which way "onward" is.
//
//  2. ITEMS ROTATE FREELY. it.r is any angle, set by the rotation slider. It used to snap
//     to quarter turns, because the `surfaces` and `blocks` rectangles below were stored
//     axis-aligned and a rotated rectangle is only still axis-aligned at 0, 90, 180 and
//     270 degrees. Those rects are oriented now (layout.js), which costs two multiplies
//     per test and buys an item that points wherever the child pointed it.
//
// Shapes: 'box' uses (sx,sy,sz) as the full size and half of it as the cuboid;
// 'ball' uses sx as the diameter; 'cyl' uses sx as the diameter and sy as the height.
// `y` is ABSOLUTE world height (the table top is y = 0); x and z are local.

import { MESH, DOM_H, DOM_W, DOM_T, DOM_DENSITY } from './consts.js';

// --- spec helpers ----------------------------------------------------------
function bx(x, y, z, sx, sy, sz, o) {
  return Object.assign({ m: MESH.BOX, shape: 'box', x, y, z, sx, sy, sz, tilt: 0, col: 0x8899aa, dyn: false }, o);
}
function bl(x, y, z, d, o) {
  return Object.assign({ m: MESH.BALL, shape: 'ball', x, y, z, sx: d, sy: d, sz: d, tilt: 0, col: 0xdddddd, dyn: true }, o);
}
function cy(x, y, z, d, h, o) {
  return Object.assign({ m: MESH.CYL, shape: 'cyl', x, y, z, sx: d, sy: h, sz: d, tilt: 0, col: 0xbbbbbb, dyn: false }, o);
}

/** Rotate a local (lx,lz) offset by the item's yaw, which is now any angle at all. */
export function localToWorld(it, lx, lz, out) {
  const c = Math.cos(it.r), s = Math.sin(it.r);
  out.x = it.x + lx * c + lz * s;
  out.z = it.z - lx * s + lz * c;
  return out;
}

/**
 * For a `surfaces` rect, `y` is the height of the top you may place ON.
 * For a `blocks` rect, `y` is the height of the top of the OBSTRUCTION: a domino whose
 * base sits at or above it is clear of the thing and is allowed. Leaving it out means
 * "blocks at every height", which is right for nothing in this file but is the safe
 * default for anything added later.
 *
 * Without that height term the three walls in challenge 3 blanketed the whole strip the
 * bridge deck crosses, so no domino could be placed on the apex, the arc-length walk
 * silently skipped those positions, and the chain met a 67 mm hole against a 40.8 mm
 * propagation limit - i.e. the challenge could not be completed by the method its own
 * hint teaches.
 */
function pushRect(out, it, lx, lz, hw, hd, y) {
  const c = Math.cos(it.r), s = Math.sin(it.r);
  out.push({
    cx: it.x + lx * c + lz * s,
    cz: it.z - lx * s + lz * c,
    hw, hd, c, s,
    y: y !== undefined ? y : Infinity,
  });
}

// --- palette colours -------------------------------------------------------
const C = {
  stone: 0x7d8794, wood: 0xb1793f, gold: 0xffd32a, steel: 0xa9b4c2,
  red: 0xe74c3c, blue: 0x3498db, green: 0x2ecc71, purple: 0x8e6cf0,
  orange: 0xf39c12, dark: 0x34405a, ivory: 0xf3ead9, pink: 0xfd79a8,
};

// Sizes shared by the structures.
//
// HOW HIGH A STEP A CHAIN CAN CLIMB, measured rather than guessed. A domino pivots about
// its front bottom edge, so it first touches the next domino's face at a horizontal reach
// of (spacing - DOM_T) and a height of sqrt(48^2 - (spacing - DOM_T)^2) above ITS OWN
// base - and that first touch is the HIGHEST the contact ever gets, because further
// rotation only lowers the tip. Per spacing setting:
//
//     tight  26.4 mm -> reach 18.9 -> contact 44.1 mm
//     normal 33.6 mm -> reach 26.1 -> contact 40.3 mm
//     wide   40.8 mm -> reach 33.3 -> contact 34.6 mm
//
// A target standing `rise` higher has its centre of mass at rise + 24 mm, and a strike at
// or below the CoM does not tip it - it just leans on it. So the usable rise is
// (contact - 24), i.e. 10.6 mm at the WIDEST spacing. RISE was 0.016 and challenge 3
// measured 4 of 24: the up-flight dominoes all stalled at 53-63 degrees in a stable
// leaning arch, each one propped against the next riser, because at normal spacing the
// strike lands at 40.3 - 16 = 24.3 mm, which is the CoM to within half a millimetre.
// Hence B_RISE = 0.008 for the bridge (2.6 mm of margin even at the widest spacing) and
// more steps to reach the same deck height. RISE (16 mm) is kept for the Stairs, which
// only ever cascade DOWNWARDS - falling onto a lower step strikes ABOVE the CoM and the
// same arithmetic is generous there.
//
// TREAD MUST BE >= THE WIDEST SPACING (SPACING_MAX, 40.8 mm), and that is not a
// nicety. Dominoes are laid every `gap` along the stroke with no knowledge of where the
// treads are, so if a tread is shorter than the gap the walk intermittently skips one -
// floor(0.0336 / 0.030) alternates between 1 and 2 - and a SKIPPED tread means a 32 mm
// climb in a single step. The strike then lands 8 mm up the next domino's face, below
// its centre of mass, so it slides instead of tipping and the chain dies. Measured on
// challenge 3 with TREAD = 0.030: 2 of 19 fell. With TREAD = 0.042 no spacing setting
// can skip a tread, because the widest gap is smaller than one tread.
//
// STEP_W is 90 mm for a 24 mm domino on purpose: +-33 mm of aim over a 44 cm bridge is
// about what an 8-year-old's finger can hold. At the original 62 mm it was +-19 mm and
// half the line fell off the side of the deck.
const RISE = 0.016;
const B_RISE = 0.008;              // the Bridge only: see the arithmetic above
const B_STEPS = 7;                 // 7 * 8 mm = 56 mm deck, underside 52 mm, wall is 50
const B_DECK_T = 0.004;
const TREAD = 0.042;
const STEP_W = 0.090;
const DECK_HD = 0.050;             // half the flat span over the top

// THREE pink dominoes side by side, not one fat one, and this is the single most-measured
// decision in the launchers. A trick's trigger is the only part of this game a child's line
// has to hit that the child did not place, and there is no docking or snapping: dominoes are
// laid every `gap` from where the stroke STARTED, so the gap between the last one placed and
// the trigger is uniformly distributed across a whole spacing — 10 to 43.6 mm as the numbers
// stand below. Whether a domino tips its neighbour at that distance is arithmetic: it pivots
// about its front edge, so at a gap g it first touches at height sqrt(48^2 - (g - 7.5)^2) mm,
// and a strike at or below the 24 mm centre of mass leans the target instead of tipping it.
// At 43.6 mm that is 31.6 mm — clear of the CoM, and comparable to the 34.6 mm the game's own
// widest spacing gives. At the 48.6 mm the old 15 mm margin allowed it is 24 mm, exactly on
// the CoM, i.e. a coin toss; measured, challenge 6 put its last domino 47 mm short and the
// trigger only leaned. So the near edge of every launcher's blocked rect is now 10 mm behind
// its trigger centre (7.5 mm is bare non-overlap, so 10 leaves 2.5 mm of air).
//
// Mass is the other half. One DOM_W*2 x DOM_T*1.6 slab weighed 3.2 dominoes and had to be
// pushed 16.7 degrees to fall over; each of these weighs exactly one domino and balances at
// 10.6, so the propagation arithmetic above — which is calibrated on domino-on-domino — is
// actually the arithmetic that applies. And three of them span 73 mm instead of 48, which is
// 73 mm of aim for a seven-year-old drawing a line freehand.
//
// Any ONE of them firing launches the trick once: sim.js guards the launch per ITEM, not per
// trigger part, so the two that fall afterwards are just dominoes falling.
function launchTrio(z) {
  return [-0.0245, 0, 0.0245].map(x => bx(x, DOM_H / 2, z, DOM_W, DOM_H, DOM_T, {
    col: C.pink, dyn: true, dens: DOM_DENSITY, tag: 'launch',
  }));
}

export const ITEMS = {
  // ---------------------------------------------------------------- obstacle
  wall: {
    id: 'wall', name: 'Wall', icon: 'gi-brick-wall', family: 'Obstacles',
    desc: 'A solid block. Route around it — or bridge over it.',
    unlock: null, foot: 0.055,
    parts: () => [bx(0, 0.025, 0, 0.11, 0.05, 0.016, { col: C.stone })],
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.062, 0.016, 0.050),
  },

  // A challenge prop, not a palette item (hidden: true). 2 mm of soft sand: a domino
  // will not stand in it, but a rolling ball crosses it without noticing. This is what
  // makes "get the chain across the gap" teachable without inventing a hole in the
  // table that everything else would fall into.
  sand: {
    id: 'sand', name: 'Soft Sand', icon: 'gi-quicksand', family: 'Obstacles',
    desc: 'Dominoes will not stand here. A ball rolls straight over.',
    unlock: null, hidden: true, foot: 0.20,
    parts: () => [bx(0, 0.001, 0, 0.400, 0.002, 0.120, { col: 0xd8c48f })],
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.200, 0.060, 0.002),
  },

  // ------------------------------------------------------------ noise/payoff
  bell: {
    id: 'bell', name: 'Bell', icon: 'gi-ringing-bell', family: 'Noise',
    desc: 'Knock it over and it rings. Every bell has its own note.',
    unlock: null, foot: 0.028, note: 0,
    parts: () => [
      // The base plate is 26 mm across - NARROWER than the 28 mm bell on top of it, which
      // looks like a detail and is not. It used to be 40 mm, and a fixed 40 mm plate is a
      // bumper: a 34 mm marble rolling in is stopped by its rim with its centre 30.9 mm
      // from the axis (sqrt(17^2-13^2) + 20), which puts the marble's surface 13.9 mm from
      // the axis and the bell's face at 14.0 mm. Every rolling ball therefore parked itself
      // 0.1 mm short of the thing it was supposed to ring, and whether it rang at all came
      // down to solver noise - measured, 6 of 10 identical runs. At 26 mm the marble meets
      // the BELL first, 7 mm before anything else can stop it.
      cy(0, 0.002, 0, 0.026, 0.004, { col: C.dark }),
      cy(0, 0.017, 0, 0.028, 0.026, { col: C.gold, dyn: true, dens: 500, tag: 'bell' }),
      bl(0, 0.033, 0, 0.014, { col: C.gold, attach: 1 }),
    ],
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.022, 0.022, 0.043),
  },

  chime: {
    id: 'chime', name: 'Chimes', icon: 'gi-windchimes', family: 'Noise',
    desc: 'Three plates, three notes. Run the chain across them.',
    unlock: 'ding', foot: 0.075,
    parts: () => {
      const p = [];
      const cols = [C.blue, C.green, C.gold];
      for (let i = 0; i < 3; i++) {
        p.push(bx(-0.036 + i * 0.036, 0.021, 0, 0.030, 0.042, 0.007,
          { col: cols[i], dyn: true, dens: 700, tag: 'chime', note: i }));
      }
      return p;
    },
    blocks: (it, out) => { for (let i = 0; i < 3; i++) pushRect(out, it, -0.036 + i * 0.036, 0, 0.017, 0.008, 0.042); },
  },

  xylo: {
    id: 'xylo', name: 'Xylophone', icon: 'gi-xylophone', family: 'Noise',
    desc: 'Five bars, five notes, low to high.',
    unlock: 'ding', foot: 0.10,
    parts: () => {
      const p = [];
      const cols = [C.red, C.orange, C.gold, C.green, C.blue];
      for (let i = 0; i < 5; i++) {
        const h = 0.050 - i * 0.005;
        p.push(bx(-0.060 + i * 0.030, h / 2, 0, 0.024, h, 0.007,
          { col: cols[i], dyn: true, dens: 700, tag: 'chime', note: i + 1 }));
      }
      return p;
    },
    blocks: (it, out) => { for (let i = 0; i < 5; i++) pushRect(out, it, -0.060 + i * 0.030, 0, 0.014, 0.008, 0.050 - i * 0.005); },
  },

  confetti: {
    id: 'confetti', name: 'Confetti Cannon', icon: 'gi-party-popper', family: 'Noise',
    desc: 'The grand finale. Tip the paddle and it goes bang.',
    unlock: 'tower', foot: 0.075,
    parts: () => [
      bx(0, 0.008, 0.030, 0.070, 0.016, 0.060, { col: C.dark }),
      cy(0, 0.045, 0.030, 0.034, 0.070, { col: C.purple, tilt: -0.55 }),
      // The trigger sits at table level on the incoming side so a normal run reaches
      // it: it is just a fat domino that happens to fire a cannon.
      bx(0, DOM_H / 2, -0.028, 0.048, DOM_H, DOM_T * 1.6,
        { col: C.pink, dyn: true, dens: DOM_DENSITY, tag: 'trigger' }),
    ],
    blocks: (it, out) => { pushRect(out, it, 0, 0.030, 0.040, 0.034, 0.080); pushRect(out, it, 0, -0.028, 0.026, 0.008, DOM_H); },
  },

  // ------------------------------------------------------------- core movers
  ramp: {
    id: 'ramp', name: 'Ball Run', icon: 'gi-kid-slide', family: 'Movers',
    desc: 'The chain shoves the marble; it rolls on where dominoes cannot.',
    unlock: 'longline', foot: 0.09,
    // REBUILT, and every number here was measured rather than guessed. The first version
    // was a 24 mm marble at density 900 sitting on the flat table behind an 8 mm "kicker"
    // plate tilted so its far edge stood 10 mm proud. Instrumented, one domino gives that
    // marble 0.137 m/s; clearing a 10 mm lip needs 0.44 m/s. So it rolled 101 mm, stopped
    // dead against the kicker every single time, and then rocked against it for 30 s of
    // run time. Challenge 1 was unwinnable by the method its own hint teaches.
    //
    // Four changes, in order of how much they mattered:
    //
    //  1. A STRIKER. The orange part is an ordinary domino built into the item, standing
    //     at the mouth of the channel. It is what the child's line knocks over, and it is
    //     what pushes the ball. Without it the ball has to be hit by the child's own last
    //     domino, and whether that domino lands 20 mm or 60 mm short of the ball is pure
    //     phase luck: at wide spacing a third of all lines could not reach the ball at
    //     all, and some phases put the standing domino INSIDE it. Now the child's job is
    //     the one thing the game is reliable at - domino hits domino - and the striker to
    //     ball distance is fixed by the item at 2 mm.
    //  2. A PLINTH AND A SLOPE. The ball rests 8 mm up and rolls down to table level, so
    //     gravity supplies 0.33 m/s that no amount of tuning could get out of a domino
    //     flick. It needs it: challenge 1's sand is a 2 mm step, and a rolling ball needs
    //     0.17 m/s just to climb that, which is all the flick ever produced.
    //  3. NO KICKER. An open channel. A lip the ball cannot climb is a lip that eats the
    //     run, and nothing in the game actually needs a hop.
    //  4. 34 mm across at density 500, not 24 mm at 900. Diameter is not cosmetic: a
    //     falling domino strikes a 24 mm ball near the TOP, so the contact normal points
    //     downwards and the push goes into the table. At 34 mm the strike lands near the
    //     equator, where the normal is horizontal, and the ball is lighter than the thing
    //     hitting it instead of heavier.
    parts: () => [
      // Side rails, 24 mm tall, covering the slope (z = -0.035 to 0.075) and NOT the pocket
      // behind it where the striker stands. A rail behind the striker is a 24 mm shelf, and
      // a domino that clears the striker lands on it: measured, the rails took the domino's
      // whole weight, the striker was never touched (chain 9/9) and the marble never moved.
      bx(-0.026, 0.012, 0.020, 0.005, 0.024, 0.110, { col: C.steel }),
      bx(0.026, 0.012, 0.020, 0.005, 0.024, 0.110, { col: C.steel }),
      // The plinth (top at y = 0.008) is deliberately SHORT - it ends at z = -0.035, just
      // 3 mm in front of the marble's contact point - and the slope takes over from there,
      // running 8 mm down over 110 mm to table level at z = 0.075. The plinth used to be
      // 53 mm long, so the marble had 33 mm of FLAT to cross before gravity could help it,
      // and the striker (48 mm long, falling from 20 mm behind it) had time to come down on
      // top of it: measured twice, in two different line-spacing phases, the marble crawled
      // to a stop exactly at the old plinth/slope junction with the fallen striker's tip
      // 4 mm behind it. With 3 mm of flat the marble is on the downslope immediately and
      // accelerates out from under the striker. The drop, and so the 0.33 m/s the marble
      // leaves with, is unchanged - only the gradient is gentler (4.2 degrees, was 5.7).
      bx(0, 0.004, -0.049, 0.046, 0.008, 0.028, { col: C.steel }),
      bx(0, 0.001, 0.020, 0.046, 0.006, 0.1104, { col: C.steel, tilt: 0.0726 }),
      // The marble sits 2 mm off the striker's face, and the gap is the whole point. The
      // striker's face rotates about its own front-bottom edge, so it meets the marble at
      // whatever height the face happens to cross the marble's surface: with a 2 mm gap
      // that is 4.5 degrees into the fall, 26 mm up, with the contact normal still
      // horizontal - a clean shove. With the 10 mm gap this used to have, contact came at
      // 19 degrees and 31 mm up, and a fifth of the push went into the table instead of the
      // marble. Measured, that phase left the marble crawling at 36 mm/s, so it was still
      // on the plinth when the child's own domino came down on top of it and pinned it.
      bl(0, 0.025, -0.038, 0.034, { col: C.red, dens: 450, fric: 0.22, ccd: true, tag: 'marble' }),
      // THE STRIKER, and it is two boxes on ONE body (the upper one is `attach`ed, so it is
      // a second collider on the lower one's rigid body, not a stack that could fall
      // apart). Both numbers here are forced:
      //   * 48 mm TALL - full domino height. A domino toppling from d mm behind it makes
      //     contact sqrt(48^2 - d^2) mm up, which is under 48 mm for every d > 0, so the
      //     strike ALWAYS lands on the face. A shorter striker gets flown over at close
      //     spacing (36 mm was flown over for any d < 32 mm) and the flying domino comes
      //     down on top of the ball and pins it. Both measured, and both were losses.
      //   * CENTRE OF MASS AT 14 mm, because the worst phase the child's line can leave is
      //     a strike only 24 mm up and a striker only topples when hit ABOVE its centre of
      //     mass. Densities 1.5x and 0.15x of a domino's put the mass in the bottom half:
      //     com = (1.5*12 + 0.15*36) / 1.65 = 14.2 mm. Total mass is 0.83 of a domino, so
      //     one topple still moves it, and height now costs nothing.
      // Tipping cost is unaffected by the low com - a 6 mm-thick body only has to lift its
      // com by 0.37 mm to go over its own edge, the same 0.3 mm an ordinary domino needs.
      bx(0, 0.012, -0.060, DOM_W, 0.024, 0.006, { col: C.orange, dyn: true, dens: DOM_DENSITY * 0.6 }),
      bx(0, 0.036, -0.060, DOM_W, 0.024, 0.006, { col: C.orange, attach: 5, dens: DOM_DENSITY * 0.06 }),
    ],
    // One blanket rectangle over the whole run, near edge at local z -0.073. isBlocked tests
    // a domino's CENTRE only, so that edge has to clear the striker's back face (-0.063) by
    // a full domino half-thickness (3.75 mm) plus air, or a domino dropped exactly on the
    // boundary spawns INSIDE the striker and the two wedge instead of launching the ball
    // (measured: chain 9/9, marble never moved). -0.073 leaves 6.3 mm of air, and still
    // leaves the worst spacing phase 41.8 mm of reach, which is measured good.
    blocks: (it, out) => pushRect(out, it, 0, 0.0014, 0.0285, 0.0744),
  },

  // --- the launchers -------------------------------------------------------
  //
  // These three are the only items that do not run on gravity alone. Each carries a pink
  // TRIGGER domino tagged 'launch', and one part carrying `launch: [ix, iy, iz]` — an
  // impulse in NEWTON-SECONDS, in item-local axes, applied once, the frame the trigger is
  // seen to have tipped past 40 degrees (sim.js, T_LAUNCH).
  //
  // WHY AN IMPULSE AND NOT A RAMP. A real loop-the-loop needs v > sqrt(g*r) at the top:
  // 1.57 m/s for a 50 mm loop. A marble rolling off the Ball Run's slope leaves at 0.33
  // m/s — a factor of five short, and no slope that fits on this table closes the gap.
  // The child's own words for what they wanted were "auto triggering a domino fling", so
  // the fling is the mechanism rather than a physical cheat pretending to be a ramp.
  //
  // Every impulse below is mass x target speed, with the mass computed from the part's own
  // volume and density, and then measured and re-tuned by research/dtricks.cjs. Where a
  // number came out of the harness rather than the arithmetic it says so.

  rocket: {
    id: 'rocket', name: 'Rocket', icon: 'gi-firework-rocket', family: 'Movers',
    desc: 'Knock the pink domino and it blasts off, way up above the table.',
    unlock: 'ch6', foot: 0.055,
    // Mass: a d=24 h=70 cylinder (3.167e-5 m^3) plus a d=24 nose ball (7.24e-6) at density
    // 120 = 4.67e-3 kg. 3.5 m/s up clears about 620 mm, which reads as "gone" on a tablet
    // screen; a small +Z component keeps it from landing back on its own pad.
    parts: () => [
      bx(0, 0.004, 0, 0.070, 0.008, 0.070, { col: C.dark }),
      // Two rail posts, 2 mm off the body each side. They stop the free-standing rocket
      // being toppled by the spawn transient. NOT a collar: a solid cylinder around a solid
      // cylinder is an overlap the solver resolves by firing one of them across the room.
      bx(-0.0165, 0.020, 0, 0.005, 0.024, 0.026, { col: C.steel }),
      bx(0.0165, 0.020, 0, 0.005, 0.024, 0.026, { col: C.steel }),
      // It comes back DOWN, and a cylinder that lands on its side rolls. Both dampings are
      // set for that (see sim.js), at a cost of 60 mm of flight: measured 647 mm with none
      // and 588 mm with these. ccd, because it lands at 4.3 m/s and the table slab is only
      // 60 mm thick — without it the rocket went straight through and vanished.
      //
      // Damping alone was NOT enough, and the fins below are the actual fix. See them there.
      //
      // Impulse: the compound weighs 5.725e-3 kg — Rapier's own rb.mass(), and it agrees with
      // the arithmetic (tube 3.80e-3 + nose 8.7e-4 + two fins at 5.3e-4) to four figures. So
      // 0.0215 is 3.75 m/s on paper and MEASURES as a 564 mm apex — 3.32 m/s, the rest going
      // into scraping out between the rail posts. It measured 467 mm until the trigger became
      // three light dominoes instead of one slab weighing 3.2 of them: the trigger stands 55 mm
      // back and a 48 mm domino falls onto the tube, so the old one was clouting the rocket as
      // it left. Enough is enough at 564 — 40% of the table's own depth reads as "gone" on a
      // tablet, and more speed only means a harder landing and more drift off the edge.
      //
      // 6% of it forward, not the 11.4% of the first version. The forward component only has
      // to miss its own pad (70 mm), and at 11.4% the rocket drifted 0.68 m: on the medium
      // table that means it lands off the edge and gets culled, which is a legal ending but
      // not the one a child wants to watch.
      cy(0, 0.043, 0, 0.024, 0.070, {
        col: C.red, dyn: true, dens: 120, ldamp: 0.5, adamp: 1.2, ccd: true,
        launch: [0, 0.0215, 0.0013],
      }),
      bl(0, 0.078, 0, 0.024, { col: C.ivory, attach: 3, dens: 120 }),
      // ONE FIN, and it is load-bearing engineering rather than decoration: a plate through
      // the tube's own axis cannot roll, because rolling would drive its edge through the
      // table. Damping could not do this job. Measured with adamp alone the landed tube held
      // a dead-steady 12.5 mm/s roll (w = 1.03 rad/s, exactly v/r) that did not decay at all
      // in 43 s — Rapier damps the spin and contact friction feeds it straight back out of
      // the undamped translation — and adding ldamp 0.5 only halved it to 6.5 mm/s, still
      // five times main.js's 1.2 mm/s stillness threshold. So every Rocket run ran to the
      // 45 s hard cap and a child who built a 10-domino chain was told "10 of 10 fell in
      // 44.9 s". Parking it instead was no good either: sim.js forces noPark on both ends of
      // a compound, and at 0.55 rad/s it was never calm enough to park anyway.
      //
      // In the ZY plane at x = 0 so it slides straight up between the rail posts: it is 4 mm
      // thick and their inner faces are 28 mm apart, so it passes with 12 mm either side.
      bx(0, 0.019, 0, 0.004, 0.022, 0.050, { col: C.ivory, attach: 3, dens: 120 }),
      // A second fin crossing it, higher up so it clears the 32 mm rail posts by 5 mm. One
      // fin stops the roll but leaves the tube balanced on a knife edge: measured, it rocked
      // for six seconds (|w| swinging 0.2-0.66 rad/s while z held at 0.390 to the millimetre)
      // before Rapier finally slept it, and the child watched a 2.5 s chain take 9.5 s to
      // report. Two fins at different heights rest on two edges and the tube lies still.
      bx(0, 0.048, 0, 0.050, 0.022, 0.004, { col: C.ivory, attach: 3, dens: 120 }),
      ...launchTrio(-0.055),
    ],
    // Near edge -0.065: 10 mm behind the trigger centre — see launchTrio for why 10 and not
    // the 15 this had first. isBlocked tests a domino's CENTRE only, so 10 mm still leaves
    // 2.5 mm of air behind a domino dropped exactly on the boundary (same reason as the Ball
    // Run's rectangle). The 76 mm width already covers the 73 mm trio.
    blocks: (it, out) => pushRect(out, it, 0, -0.010, 0.038, 0.055),
  },

  // RENAMED from "Loop the Loop", which it never was: it throws a ball on a ballistic arc
  // through a standing ring. That is a JUMP through a ring of fire, and the name now says so —
  // "Loop the Loop" has moved to the `coaster` item below, which is an actual rollercoaster
  // loop the ball rolls round the inside of.
  //
  // The ID CHANGED TOO, from `loop` to `firejump`, and that is deliberate rather than
  // convenient: `coaster` could have taken the freed-up `loop` id, but then every Fire Jump
  // sitting in a child's saved creation would silently come back as a different trick in a
  // different place. main.js drops saved items whose type it does not recognise, so an old
  // save loses its Fire Jumps instead — visible, and not a lie.
  firejump: {
    id: 'firejump', name: 'Fire Jump', icon: 'gi-fire-ring', family: 'Movers',
    desc: 'Throws the ball through the ring of fire. Build a big pack where it comes down.',
    unlock: 'ch5', foot: 0.16,
    // Ball d=24 at density 450 = 3.257e-3 kg. Thrown at 1.85 m/s at 45 degrees, so
    // vy = vz = 1.308: apex at t = 0.133 s, 87 mm up and 174 mm on — hence a hoop centred
    // 107 mm up and 174 mm forward of the plinth. It comes down to domino height at
    // z = +0.238, which is where the child's pack goes.
    parts: () => {
      const p = [];
      const LZ = -0.100;                 // the plinth, and where the throw starts
      // Plinth plus two lips: the ball has to still be exactly here when the trigger fires.
      p.push(bx(0, 0.004, LZ, 0.046, 0.008, 0.040, { col: C.steel }));
      p.push(bx(-0.0205, 0.014, LZ, 0.005, 0.012, 0.040, { col: C.steel }));
      p.push(bx(0.0205, 0.014, LZ, 0.005, 0.012, 0.040, { col: C.steel }));
      p.push(bl(0, 0.020, LZ, 0.024, {
        col: C.gold, dens: 450, fric: 0.22, ccd: true, tag: 'ball',
        launch: [0, 0.00426, 0.00426],
      }));
      // The ring: twelve tangential boxes on a 45 mm inner radius, each rolled to lie along
      // its own chord (chord = 2*r*sin(15deg) = 23.3 mm, so 26 mm boxes overlap slightly and
      // leave no gaps). 33 mm of clearance for a 12 mm ball — generous on purpose, because
      // the throw is ballistic and a ring it can clip is a ring that eats the trick.
      // Red into orange into gold around the circle, so it reads as fire rather than as a
      // barber's pole. Colour is all the fire there is: fx.js does confetti and nothing else,
      // and a particle system for one item is not worth what it costs on the tablet.
      const N = 12, r = 0.045, HY = 0.107, HZ = 0.074;
      const FIRE = [C.red, C.orange, C.gold];
      for (let i = 0; i < N; i++) {
        const a = i * Math.PI * 2 / N;
        p.push(bx(r * Math.cos(a), HY + r * Math.sin(a), HZ, 0.026, 0.007, 0.010,
          { col: FIRE[i % 3], roll: a + Math.PI / 2 }));
      }
      // Posts outboard of the hoop, 88 mm apart — a 24 mm domino line runs between them,
      // and the lowest hoop box is 58 mm up, so a 48 mm domino passes under it too.
      p.push(bx(-0.048, HY / 2, HZ, 0.008, HY, 0.008, { col: C.steel }));
      p.push(bx(0.048, HY / 2, HZ, 0.008, HY, 0.008, { col: C.steel }));
      // The trigger stands 65 mm behind the ball. At the 40-degree firing angle a tipping
      // domino's tip has only reached z = -0.134, still 22 mm behind the ball's back face, so
      // the throw is never a race between the impulse and the falling domino.
      for (const t of launchTrio(-0.165)) p.push(t);
      return p;
    },
    blocks: (it, out) => {
      // The trigger and the plinth, one blanket rect at every height. Near edge -0.175 (10 mm
      // behind the trigger centre) and widened to 80 mm so it fences the whole 73 mm trio.
      pushRect(out, it, 0, -0.125, 0.040, 0.050);
      // The posts. Nothing else is fenced: the whole point of the hoop is that the run goes
      // UNDER it, and the landing zone past it has to be free for the pack.
      pushRect(out, it, -0.048, 0.074, 0.010, 0.010);
      pushRect(out, it, 0.048, 0.074, 0.010, 0.010);
    },
  },

  // The rollercoaster one: the ball is nudged along a flat run-up, goes round the INSIDE of a
  // vertical loop — upside down over the top — and comes out of the bottom still going forward,
  // into whatever the child built next.
  //
  // THE BALL IS DRIVEN ROUND THE LOOP, NOT ROLLED. The track is a prop; the `carry` field on the
  // ball hands it to sim.js's advanceCarries(), which animates one turn and gives it back to the
  // physics at the exit. sim.js has the full argument beside the carry arrays — the short version
  // is that a faceted concave track bleeds exp(-2*pi^2/N) of its speed per turn AND that at loop
  // speed the ball crosses four facets per 1/60 s step, so the solver never sees a circle at all.
  // A collider loop was built, tuned and measured: 32 facets, frictionless guide rails, 12% of
  // the energy retained, ball stalling at y 0.084 of the 0.100 it needed. It is not fixable by
  // arrangement, and the drive is cheaper than the thing that did not work.
  //
  // Everything below therefore serves the LOOK, with two hard exceptions that the drive depends
  // on: the ball's centre must orbit radius R = 40 mm about (0, CY) — because that is the circle
  // advanceCarries walks — and it must be handed back at the bottom onto something at the right
  // height. The rest is free.
  //
  // THE LOOP IS A HELIX, one full turn drifting 56 mm to the right, and that is not decoration
  // either. The first cut used a flat circle in the Y-Z plane, tangent to the run-up at its
  // lowest point, on the reasoning that entry and exit are then the same stretch of track at
  // different times so nothing can collide. That is wrong, and the measurement said so in one
  // line: the impulse landed at 3.837 m/s and the next frame read -0.199. A circle tangent at ONE
  // point still hangs its whole descending quarter over the approach — the phi = 292.5/315/337.5
  // deg segments sat at z = -0.251/-0.239/-0.221 with top edges 17 mm up, and the ball waited at
  // z = -0.245 with its underside 6 mm up. It never failed to climb; it was fired point-blank
  // into the back of the loop. Real coasters offset entry and exit side by side at the bottom for
  // exactly this reason. So the ball leaves 56 mm to the RIGHT of where it went in and rolls out
  // on its own apron: say "shoots out the bottom" to the child, not "comes back to the same
  // place". The drift is also what lets the run-up stay straight and short.
  //
  // ARITHMETIC (r = 55 mm to the segment centres, 6 mm of floor, so the running face is at 52 mm
  // and the ball's centre orbits at R = 52 - 12 = 40 mm). The drive follows the same energy the
  // physics would have, so the thresholds still decide whether it LOOKS right:
  //   * to hold the top,  v_top^2 >= g*R = 9.81*0.040                       -> v_top >= 0.63 m/s
  //   * the centre climbs 2R = 80 mm and a rolling sphere carries (7/10)mv^2, so
  //     v_bottom^2 = v_top^2 + (10/7)*g*0.080 = 0.392 + 1.121               -> v_b   >= 1.23 m/s
  //   * 0.0055 N s on a 3.257e-3 kg ball is 1.69 m/s off the pad, which is all the run-up needs
  //     to reach the mouth, and comfortably over that 1.23. `carry`'s last number is a FLOOR of
  //     1.35 m/s applied at the mouth, so a ball that arrives slow (nudged by a stray domino,
  //     say, rather than launched) still gets round instead of half-looping. The old 0.0125 N s
  //     was sized to survive the facet losses; with none to survive it would only fling the ball
  //     off the apron at 3.8 m/s.
  coaster: {
    id: 'coaster', name: 'Loop the Loop', icon: 'gi-spiral-arrow', family: 'Movers',
    desc: 'The ball loops right round the inside, upside down, and shoots out the bottom.',
    unlock: 'century', foot: 0.20,
    parts: () => {
      const p = [];
      const r = 0.055;                   // segment centres
      const PAD = 0.008;                 // run-up height = the loop's inner face at the bottom
      const CY = PAD + r - 0.003;        // 0.060: puts that face level with the pad, no step
      // 16 facets, because the facet count is now a purely VISUAL question and 17 boxes beat 33
      // on a tablet. It was briefly 32 to fight the energy loss described above; the drive
      // removed the reason, and the sagitta at 16 is 1.1 mm on a 55 mm radius — a smooth loop.
      const N = 16;
      const XS = 0.056;                  // the helix drift over one full turn
      // THE EXIT IS ON THE CENTRE LINE AND THE ENTRY IS OFF TO THE LEFT, which is the opposite
      // way round from how this was first built, and the reason is the only thing about this
      // item a child ever noticed. A loop of track HAS to drift sideways over its turn: the
      // descending quarter comes down to the tangent point at the bottom, which is exactly
      // where the incoming straight track already is, so a planar loop with a run-up through it
      // is not a shape that exists. (Tried: the ball met the back of the descending ribbon
      // 20 mm before the mouth, and measured 0.35 m/s peak against 1.66 — it never even got
      // round.) But the drift was applied FORWARDS, entry at x 0 and exit at x +56, so the ball
      // came out 56 mm to the side of the line the child had drawn at the thing. Measured: a
      // 13-domino receiving line on the centre line was passed clean by, 32 mm clear of the
      // nearest edge, and 0 of it fell. A trick that cannot start the next line is not a trick.
      // So the drift runs -XS -> 0 instead of 0 -> +XS. Nothing about the loop changes; it is
      // parked 56 mm to the left of its own exit. The trigger stays on the centre line (it is
      // three ordinary dominoes and has nothing to do with the ball's path), so what the child
      // draws and where the ball comes out are now the same line.
      const xAt = (t) => XS * (t - 1);   // t is turns: -XS at the entry, 0 at the exit
      // The run-up: a pad with two lips, exactly the Fire Jump's cradle, because the ball has
      // to be sitting still in a known place when the trigger fires. It ends at z = -0.008,
      // where the loop's own entry segment takes over.
      p.push(bx(-XS, PAD / 2, -0.043, 0.046, PAD, 0.070, { col: C.steel }));
      p.push(bx(-XS - 0.0205, 0.014, -0.043, 0.005, 0.012, 0.070, { col: C.steel }));
      p.push(bx(-XS + 0.0205, 0.014, -0.043, 0.005, 0.012, 0.070, { col: C.steel }));
      p.push(bl(-XS, PAD + 0.012, -0.045, 0.024, {
        // HEAVY, 21.7 g, and that is the whole reason a domino at the exit falls over. At
        // dens 450 (3.3 g) it came out of the loop at 1.4 m/s, hit the first domino of the
        // child's line, SLID IT 7.6 mm FORWARD and left it standing — measured, fallen 0,
        // bestBallKnock 0. Energy was never short (1.2e-4 J against the 2.95e-5 J a domino
        // costs to tip); momentum was. A 24 mm ball on the table strikes 12 mm up, half way
        // to the domino's 24 mm centre of mass, so the blow kicks the base out from under it
        // and it rocks backwards onto its heel instead of going over. The only cure for a low
        // strike is mass, and the Slalom Tower measured the same wall and the same fix (see
        // its ball: 2.5 g and 8.9 g toppled nothing, 33.5 g took 17 of 17). At 3000 kg/m^3 the
        // exit carries 0.027 N s, twice the smallest figure the slalom proved.
        col: C.gold, dens: 3000, fric: 0.22, ccd: true, tag: 'ball',
        // Enough to roll the 45 mm to the mouth of the loop at 1.7 m/s, and no more. It scales
        // with the mass — 0.037 / 21.7e-3 — so this number moves whenever the density does.
        launch: [0, 0, 0.037],
        // [centre height, ball-centre orbit radius, sideways drift over the turn, speed floor].
        // These four ARE the loop as far as the ball is concerned; the boxes below only have to
        // agree with them. The drift is a DELTA from wherever the ball actually is when the
        // drive picks it up, so this number does not have to know where the run-up was put.
        // See sim.js advanceCarries().
        carry: [CY, 0.040, XS, 1.35],
      }));
      // The exit apron, on the centre line, doing two jobs in one part: it catches the ball
      // where the helix drops it and then TILTS down to the tabletop, so the run leaves at table
      // level instead of stepping 8 mm off a kerb. tilt is +0.129 rad about local X, which takes
      // the top face from y = 0.008 at the near end to y = 0.000 at the far end.
      p.push(bx(0, 0.0015, 0.030, 0.046, 0.005, 0.062, { col: C.steel, tilt: 0.129 }));
      // The track. Each segment is a box long in Z, tilted about local X by -phi so it lies
      // along its own chord — the same trick as the Fire Jump's ring, one axis over, because
      // this loop stands in the Y-Z plane (the plane the run travels in) rather than facing the
      // run. 25 mm boxes on a 21.6 mm chord, so they overlap and leave no visible lip. 40 mm
      // wide, and blue/ivory alternating so the turn reads as a turn while it happens.
      // N+1 of them, not N: entry (phi 0, x -56) and exit (phi 360, x 0) are different places.
      for (let i = 0; i <= N; i++) {
        const phi = i * Math.PI * 2 / N;
        p.push(bx(xAt(i / N), CY - r * Math.cos(phi), r * Math.sin(phi), 0.040, 0.006, 0.025,
          { col: i % 2 ? C.blue : C.ivory, tilt: -phi }));
      }
      // Side rails, six a side, each chorded across two facets (45 deg of arc) so it bulges
      // 4.2 mm outward at its middle rather than cutting the corner. Each spans radius r-0.023
      // to r-0.003, standing 20 mm of the ball's 24, which is what makes the loop read as a
      // channel with a ball IN it rather than a stripe with a ball on top. They no longer steer
      // anything — the drive does that, and it ignores colliders — so they are here to be seen.
      for (let j = 0; j < N; j += 2) {
        const t = (j + 1) / N, phi = t * Math.PI * 2;
        const rr = r - 0.013, xx = xAt(t);
        const y = CY - rr * Math.cos(phi), z = rr * Math.sin(phi);
        p.push(bx(xx - 0.023, y, z, 0.004, 0.020, 0.046, { col: C.steel, tilt: -phi }));
        p.push(bx(xx + 0.023, y, z, 0.004, 0.020, 0.046, { col: C.steel, tilt: -phi }));
      }
      // Two legs, one under the entry and one under the exit. Every part here is static, so it
      // would hang in the air perfectly well without them; they are there so it does not LOOK
      // like it is cheating. Both are outboard of their own channel — 24 mm off centre, past the
      // 40 mm track and the rails at +-25 — so neither is anywhere near the ball.
      p.push(bx(-XS - 0.024, CY / 2, 0, 0.006, CY, 0.006, { col: C.steel }));
      p.push(bx(0.024, CY / 2, 0, 0.006, CY, 0.006, { col: C.steel }));
      // 57 mm behind the pad's back face. Same reasoning as the Fire Jump's trigger: far
      // enough that the tipping domino is nowhere near the ball when the impulse lands.
      for (const t of launchTrio(-0.135)) p.push(t);
      return p;
    },
    // One blanket rect over the trigger, the run-up, the loop and the exit apron, at every
    // height: the ball comes out of the BOTTOM of the loop, so the ground under it has to stay
    // empty or the exit is bricked up. x = -86..+30 — the helix means the footprint is not
    // symmetric, the entry channel hanging 56 mm out to the left of the exit — and z = -145..+62.
    // Everything past the apron is free for the pack, and free STRAIGHT AHEAD of the exit, which
    // is where the child will draw.
    blocks: (it, out) => pushRect(out, it, -0.028, -0.0415, 0.058, 0.1035),
  },

  slalom: {
    id: 'slalom', name: 'Slalom Tower', icon: 'gi-tower-fall', family: 'Structures',
    desc: 'The ball zig-zags down four ledges, then rolls out of the bottom.',
    unlock: 'ch7', foot: 0.09,
    // RELIABILITY BY ENCLOSURE, not by aim. Two earlier designs were rejected on paper:
    // open tilted zig-zag ledges let the ball fly off their ends, and a peg-and-gap Plinko
    // tower deflects the ball INTO the gap it just came from about half the time. Here the
    // ball is inside a three-walled box with front rails at every ledge height, so the only
    // way out is the chute at the bottom. The ledges choose HOW it gets down; the walls
    // guarantee that it does.
    parts: () => {
      const p = [];
      const H = 0.165, LX = 0.0145, LW = 0.033, LR = 0.25, W = 0.062, D = 0.068;
      p.push(bx(-0.034, H / 2, 0, 0.006, H, D, { col: C.wood }));
      p.push(bx(0.034, H / 2, 0, 0.006, H, D, { col: C.wood }));
      p.push(bx(0, H / 2, -0.034, W, H, 0.006, { col: C.wood }));
      // Four ledges, 32 mm apart (a 22 mm ball clears each one with 10 mm to spare). Each
      // spans from a wall to 2 mm past the centre line, leaving a 29 mm hole on the far side
      // for the ball to drop through. The top one is FLAT and holds the ball; the impulse
      // rolls it off the end. The three below are rolled 0.25 rad so gravity walks the ball
      // back the other way — and the side wall it bounces off on the way down is what puts
      // it on the high end each time, which is why this does not depend on aim.
      p.push(bx(-LX, 0.140, 0, LW, 0.005, 0.050, { col: 0xc98d4e }));
      p.push(bx(LX, 0.108, 0, LW, 0.005, 0.050, { col: 0xc98d4e, roll: LR }));
      p.push(bx(-LX, 0.076, 0, LW, 0.005, 0.050, { col: 0xc98d4e, roll: -LR }));
      p.push(bx(LX, 0.044, 0, LW, 0.005, 0.050, { col: 0xc98d4e, roll: LR }));
      // Front rails, one per ledge, each set at the height the ball's centre passes. Thin
      // bars rather than a wall: a closed front would hide the entire trick, which for a
      // seven-year-old is the whole reason the tower exists. The lowest one is 38 mm above
      // the chute, so the ball leaves under it rather than being fenced in.
      for (const y of [0.058, 0.090, 0.122, 0.154]) {
        p.push(bx(0, y, 0.034, W, 0.012, 0.006, { col: C.steel }));
      }
      // The exit chute. Tilted 0.215 rad (positive tilt drops the +Z end, derived from
      // Rx(t): (0,0,1) -> (0,-sin t,cos t)), so its far lip rests on the table and the ball
      // rolls out onto the felt at z = +0.072.
      p.push(bx(0, 0.014, 0.019, W, 0.006, 0.106, { col: 0xc98d4e, tilt: 0.215 }));
      // ...and a funnel into a 28 mm channel, because the ball does not arrive at the chute
      // travelling forwards. The bottom ledge is rolled, so it dumps the ball sideways, and
      // the chute is flat across X and hands that sideways speed straight on: measured, the
      // ball left the tower 26 degrees off axis (started x -0.018, finished x -0.475) and
      // sailed clean past a domino line laid down the middle. The box walls above are 62 mm
      // apart, far too much play to scrub anything off. The channel leaves 6 mm, so the ball
      // touches a rail within a few millimetres and that contact — restitution 0 — spends
      // the whole lateral component while leaving the forward roll alone.
      //
      // The funnel is not decoration. A bare channel measured WORSE than none: the ball came
      // down hugging the left wall at x -0.020, met the rail's end face square on and stopped
      // dead 47 mm short of the lip. These two walls open to the full 62 mm at the mouth, so
      // anything the ledges can deliver is led in rather than blocked.
      for (const sgn of [-1, 1]) {
        p.push(bx(sgn * 0.0255, 0.019, 0.038, 0.005, 0.022, 0.030,
          { col: C.steel, yaw: -sgn * 0.617 }));
        p.push(bx(sgn * 0.0165, 0.019, 0.063, 0.005, 0.022, 0.026, { col: C.steel }));
      }
      // Ball d=22, and HEAVY: density 6000 makes it 33.5 g, which is a 22 mm steel bearing
      // (43 g) to within a third. Density rather than diameter because 22 mm is all the 32 mm
      // ledge spacing allows, and mass is what was actually missing. Measured at 450 (2.5 g):
      // the ball came out of the chute at 0.31 m/s — the Ball Run marble does 0.33 — rolled
      // the length of the table, and then failed to tip the FIRST domino it met, stopping
      // 12 mm short of it with bestBallKnock 0. Energy was never the problem: 1.2e-4 J
      // against the 2.95e-5 J a domino costs. Momentum was. The ball strikes 11 mm up, well
      // under the 24 mm centre of mass, so a domino has to be shoved off its base rather
      // than knocked over, and 7.8e-4 kg m/s put nothing behind the shove. Two steps were
      // measured: 8.9 g (the marble's own mass) still toppled nothing at all, and 33.5 g
      // takes the whole line down, 17 of 17. The colour stays green for visibility — a grey
      // ball inside a wooden tower is exactly the thing a seven-year-old loses track of.
      //
      // The pop scales with the mass: 0.0131 N s / 33.5e-3 kg = 0.39 m/s, the same 0.4 m/s
      // nudge that walks it the 31 mm off the flat top ledge. It does not need to be aimed.
      p.push(bl(-0.018, 0.1535, 0, 0.022, {
        col: C.green, dens: 6000, fric: 0.22, ccd: true, tag: 'ball',
        launch: [0.0131, 0, 0],
      }));
      // The trigger stands 100 mm back — 30 mm further than the first version, and the
      // measurements are why. At -0.070 its front face was 27 mm from the back wall, and a
      // 48 mm domino needs 31 mm of reach just to pass 40 degrees, so it could not fire even
      // in principle: measured, it shoved forward 17 mm, jammed on the wall and rested at
      // 25.7 degrees. Worse, the blocked footprint stopped the child's line 54 mm short of
      // it, so all it ever got was a glancing tap from the very tip of the last domino.
      // At -0.100 the wall is 57 mm away, so it still passes 56 degrees even after that 17 mm
      // shove, and the child's line can now reach to within 10 mm of it (see launchTrio).
      for (const t of launchTrio(-0.100)) p.push(t);
      return p;
    },
    // Near edge -0.110 (10 mm behind the trigger centre), far edge +0.075 — right at the
    // chute's lip, so the child can start a fresh line where the ball rolls out.
    blocks: (it, out) => pushRect(out, it, 0, -0.0175, 0.040, 0.0925),
  },

  flipper: {
    id: 'flipper', name: 'Springboard', icon: 'gi-bouncing-spring', family: 'Movers',
    desc: 'Hit the empty end and it flings the domino off the other end.',
    unlock: 'strike', foot: 0.06,
    parts: () => [
      bx(0, 0.005, 0, 0.034, 0.010, 0.014, { col: C.dark }),
      bx(0, 0.014, 0, 0.034, 0.005, 0.100, {
        col: C.orange, dyn: true, dens: 500, tag: 'flipper',
        // Angular damping. 3 is a 0.33 s time constant: it takes about 8% off a 30 ms whip and
        // most of a slow wobble. It is NOT what makes the run end — see note (6) below; a
        // near-balanced arm resting on its post chatters against it whatever the damping, and
        // the fix is that a spent arm is parked (sim.js gate 2).
        adamp: 3,
      }),
      // THE BOARD COMES LOADED, and everything from here down exists to make that work. There
      // was no way to put anything on it: the whole plank is inside the `blocks` rect below, so
      // a child could never place the domino that makes a springboard a springboard, and the
      // item did nothing a wall would not have done. Getting a loaded board to behave took six
      // measured passes, and the notes below are each one of them.
      //
      // The passenger rides the FAR end (+Z is forward, so the chain arrives at the near end and
      // this is the end that whips up). The plank spans y 0.0115..0.0165, so a domino standing
      // on it centres at 0.0165 + DOM_H/2 = 0.0405, and z = +0.038 puts its 12 mm half-width
      // flush with the plank's +0.050 tip. Turned BROADSIDE (yaw 90 degrees) so the whip meets
      // its 24 mm face rather than its 7.5 mm edge and it leaves as a thrown object instead of
      // toppling over the tip. MESH.BOX rather than MESH.DOMINO deliberately: that instanced
      // pool is sized to the tier's domino cap, and item parts drawing from it would overflow it
      // on a full table.
      //
      // (1) THE IMPULSE IS WHAT THROWS IT. The plank's own whip is only the trigger — sim.js
      // fires the launcher when a T_FLIPPER part passes 1 rad/s. A see-saw cannot do this job
      // unaided and it is not close: one falling domino carries about 2.4 mJ, lifting this
      // passenger even 20 mm costs 2.0 mJ before a single loss, and the far end throws UP and
      // slightly BACK in any case, because a point on a rotating arm moves perpendicular to it.
      // Measured on a bare see-saw the plank turned 1.1 degrees in total and the passenger did
      // not move at all. A real springboard stores energy in a spring; this one gets a spring.
      //
      // 0.0078 N s up and 0.0036 across on 10.37 g is 0.75 and 0.35 m/s. It clears the 8 mm slot
      // on 28 mm of ballistic rise, tops out near y 0.069 and comes down about 100 mm forward —
      // just past the item's blocked footprint, so it lands on the first domino of whatever the
      // child built next instead of sailing over the line.
      bx(0, 0.0405, 0.038, DOM_W, DOM_H, DOM_T, {
        col: C.ivory, dyn: true, dens: DOM_DENSITY, yaw: Math.PI / 2,
        launch: [0, 0.0078, 0.0036],
      }),
      // (2) THE COUNTERWEIGHT, welded to the near arm. The passenger applies 3.95e-3 N m at
      // 38 mm out, and a domino landing on the near end applies about 2.5e-3 N m, so a loaded
      // board simply will not move — that is the 1.1 degrees above, and with it the trigger
      // never reaches 1 rad/s and the spring never lets go. 8.7 g at 40 mm back gives 3.43e-3
      // N m the other way, leaving a net 0.5e-3 N m of far-end-down bias: enough that the board
      // always rests the same way up and never floats, and five times less than the domino that
      // has to shift it. 26 x 10 x 14 mm of something dense, sitting on TOP of the arm where it
      // reads as a counterweight and stays clear of the table through the arm's whole travel.
      bx(0, 0.0215, -0.040, 0.026, 0.010, 0.014, { col: 0x555f6e, attach: 1, dens: 2400 }),
      // (3) THE SLOT, two lips welded to the plank (`attach: 1`, so they are extra colliders on
      // its body rather than parts left behind when it swings). Without it the passenger falls
      // over before the chain ever arrives — it does not survive its own board settling. It was
      // first tried on the argument that broadside it needs 26.6 degrees to topple along the
      // plank instead of 8.9; true, and irrelevant, because it went over SIDEWAYS, to x +30 mm.
      // Broadside buys stability along the plank and spends it across the plank, where the
      // standing footprint is 7.5 mm.
      //
      // THE SLOT HAS TO BEAT 8.9 DEGREES, which is the arithmetic that sizes it. A domino
      // tilting on its bottom edge escapes a lip of height h across a gap g at sin(theta) = g/h,
      // and it passes its own point of no return at atan(3.75/24) = 8.9 degrees, so the slot
      // only holds if g/h < 0.157. The first try was 4 mm tall with 1 mm a side — ratio 0.25, so
      // the domino reached 14 degrees before the lip could catch it, which is well past tipping,
      // and it levered straight over the top to x +26 mm. At 0.5 mm and 8 mm the ratio is 0.063:
      // 3.6 degrees of rock and no way out sideways. 2 mm posts, so x = +-5.25 leaves 8.5 mm for
      // a 7.5 mm domino. FORWARD IS LEFT WIDE OPEN, which is the direction the fling uses.
      bx(-0.00525, 0.0205, 0.038, 0.002, 0.008, 0.026, { col: C.dark, attach: 1, dens: 300 }),
      bx(0.00525, 0.0205, 0.038, 0.002, 0.008, 0.026, { col: C.dark, attach: 1, dens: 300 }),
      // (4) THE REST POST, under the far end, top face at 0.0115 — exactly the plank's underside,
      // so the arm rests dead level on it. The slot alone is not enough: with only the spring
      // holding the arm, the settle swing dips the tip and the passenger slides FORWARD out of
      // the open end of its own slot, measured at 10.5 mm (toppled) before the chain arrived.
      // The slot deliberately has no front, so it needs a platform that never tilts forward.
      // 10 mm deep at z = 0.044, directly under the passenger's front half.
      bx(0, 0.00575, 0.044, 0.028, 0.0115, 0.010, { col: C.dark }),
    ],
    // (5) THE SPRING ALSO HAS TO CARRY THE ARM, not just centre it. The stiffness used to be
    // 0.004 N m per radian, which against the 0.5e-3 N m of residual bias settles at 0.13 rad:
    // the arm hangs on the post rather than resting on it, and the passenger sits on a surface
    // that is 7.5 degrees off level. 0.03 N m per radian holds the same bias at 1 degree, so the
    // arm sits on the post instead of leaning on it. It costs the whip nothing that matters: the
    // arm now stops at about 5 degrees instead of 13, and the trigger only wants 1 rad/s. Damping
    // 0.0015 against 2*sqrt(k*I) = 2.2e-3 is 0.67 of critical — down inside a couple of swings,
    // with none of the mush a heavier damper would put on the whip itself.
    //
    // (6) WHAT ENDS THE RUN IS PARKING, and it is worth saying so here because two plausible
    // fixes were tried first and neither worked. A loaded board that works end to end still
    // reported a 44.9 SECOND run — ended by main.js's 45 s hard cap rather than by stillness,
    // because a near-balanced arm resting on a static post chatters against it for ever: the
    // plank and its three welded parts registered movement on 1000 to 1600 separate frames of a
    // run that was visibly over in five. Neither `adamp: 3` nor the ten-fold stiffer spring above
    // shifted that number, which is what identified it as contact/motor solver noise rather than
    // free oscillation. The fix is in sim.js: a Springboard is one-shot by construction, so
    // T_FLIPPER came out of the noPark list and got its own parking gate (2 = has fired). Do not
    // reach for more damping here if this ever regresses; check that the arm still parks.
    //
    // The see-saw pivots about local X so it tips along the run.
    joints: (it, base, J) => J.revolute(base + 0, base + 1, 0, 0.014, 0, 1, 0, 0, 0.03, 0.0015),
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.020, 0.055, 0.017),
  },

  // ----------------------------------------------------------- chain gadgets
  splitter: {
    id: 'splitter', name: 'Splitter', icon: 'gi-split-arrows', family: 'Gadgets',
    desc: 'A triple-wide domino. It falls across two runs at once.',
    unlock: 'fifty', foot: 0.045,
    parts: () => [bx(0, DOM_H / 2, 0, DOM_W * 3, DOM_H, DOM_T,
      { col: C.orange, dyn: true, dens: DOM_DENSITY, tag: 'splitter' })],
    blocks: (it, out) => pushRect(out, it, 0, 0, DOM_W * 1.6, DOM_T, DOM_H),
  },

  spinner: {
    id: 'spinner', name: 'Pinwheel', icon: 'gi-paper-windmill', family: 'Gadgets',
    desc: 'Hit one blade and the other one comes round to shove.',
    unlock: 'strike', foot: 0.075,
    parts: () => [
      cy(0, 0.012, 0, 0.012, 0.024, { col: C.dark }),
      bx(0, 0.030, 0, 0.130, 0.010, 0.009, { col: C.purple, dyn: true, dens: 400, tag: 'spinner' }),
    ],
    joints: (it, base, J) => J.revolute(base + 0, base + 1, 0, 0.030, 0, 0, 1, 0, 0, 0),
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.012, 0.012, 0.035),
  },

  // -------------------------------------------------------------- structures
  bridge: {
    id: 'bridge', name: 'Bridge', icon: 'gi-arch-bridge', family: 'Structures',
    desc: 'Seven shallow steps up, over the top, seven down. Draw straight over it.',
    // foot only scales the drop ghost (tools.js): 0.30 * 2.3 = 0.69, i.e. the ghost is as
    // long as the bridge really is, so a child can see it will not fit before they drop it.
    unlock: 'twoways', foot: 0.30,
    // The one item that is MEANT to be dropped on top of something. At its drop point the
    // bridge has no material below the deck's underside (B_STEPS*B_RISE - B_DECK_T =
    // 0.052), so that is the height the placement test has to ask about. Asking the default
    // question ("is anything here at all") made the game refuse the bridge at exactly
    // z = 0 on the wall - the placement its own hint tells the child to make - while
    // allowing z = +-0.02, so challenge 3 was unwinnable by the book and the child got a
    // red ghost with no reason.
    clearY: B_STEPS * B_RISE - B_DECK_T,
    parts: () => {
      const p = [];
      const DECK = B_STEPS * B_RISE;               // 0.056 - clears a 50 mm wall by 2 mm
      const z0 = -(B_STEPS * TREAD + DECK_HD);     // start of the up-flight
      for (let i = 0; i < B_STEPS; i++) {
        const h = (i + 1) * B_RISE;
        p.push(bx(0, h / 2, z0 + i * TREAD + TREAD / 2, STEP_W, h, TREAD, { col: C.wood }));
      }
      p.push(bx(0, DECK - B_DECK_T / 2, 0, STEP_W, B_DECK_T, DECK_HD * 2, { col: 0xc98d4e }));
      for (let i = 0; i < B_STEPS; i++) {
        const h = (B_STEPS - i) * B_RISE;
        p.push(bx(0, h / 2, DECK_HD + i * TREAD + TREAD / 2, STEP_W, h, TREAD, { col: C.wood }));
      }
      return p;
    },
    surfaces: (it, out) => {
      const DECK = B_STEPS * B_RISE;
      const z0 = -(B_STEPS * TREAD + DECK_HD);
      for (let i = 0; i < B_STEPS; i++) {
        pushRect(out, it, 0, z0 + i * TREAD + TREAD / 2, STEP_W / 2, TREAD / 2, (i + 1) * B_RISE);
      }
      pushRect(out, it, 0, 0, STEP_W / 2, DECK_HD, DECK);
      for (let i = 0; i < B_STEPS; i++) {
        pushRect(out, it, 0, DECK_HD + i * TREAD + TREAD / 2, STEP_W / 2, TREAD / 2,
          (B_STEPS - i) * B_RISE);
      }
    },
  },

  stairs: {
    id: 'stairs', name: 'Stairs', icon: 'gi-stairs', family: 'Structures',
    desc: 'Start at the top and let it cascade down.',
    unlock: 'bridged', foot: 0.20,
    parts: () => {
      const p = [];
      const N = 6;
      p.push(bx(0, N * RISE / 2, -0.055, STEP_W, N * RISE, 0.060, { col: 0xc98d4e }));
      for (let i = 0; i < N; i++) {
        const h = (N - i) * RISE;
        p.push(bx(0, h / 2, -0.025 + i * TREAD + TREAD / 2, STEP_W, h, TREAD, { col: C.wood }));
      }
      return p;
    },
    surfaces: (it, out) => {
      const N = 6;
      pushRect(out, it, 0, -0.055, STEP_W / 2, 0.030, N * RISE);
      for (let i = 0; i < N; i++) {
        pushRect(out, it, 0, -0.025 + i * TREAD + TREAD / 2, STEP_W / 2, TREAD / 2, (N - i) * RISE);
      }
    },
  },

  tower: {
    id: 'tower', name: 'Tower', icon: 'gi-stone-tower', family: 'Structures',
    desc: 'Six layers of blocks. Knock the bottom out and watch.',
    // Was 'wrecked', the badge for landing a wrecking-ball hit. The Wrecking Ball is gone,
    // so the Tower now comes off the same rung as the Stairs — Bridge Builder.
    unlock: 'bridged', foot: 0.05,
    parts: () => {
      const p = [];
      const BH = 0.012, BL = 0.038, BT = 0.0115;
      for (let k = 0; k < 6; k++) {
        const y = BH * k + BH / 2;
        for (let j = 0; j < 3; j++) {
          const o = (j - 1) * BT * 1.02;
          if (k % 2 === 0) p.push(bx(0, y, o, BL, BH, BT, { col: k === 5 ? C.gold : C.wood, dyn: true, dens: 650, tag: k === 5 && j === 1 ? 'towertop' : 'tower' }));
          else p.push(bx(o, y, 0, BT, BH, BL, { col: C.wood, dyn: true, dens: 650, tag: 'tower' }));
        }
      }
      return p;
    },
    blocks: (it, out) => pushRect(out, it, 0, 0, 0.026, 0.026, 0.072),
  },
};

export const ITEM_IDS = Object.keys(ITEMS);

export const FAMILIES = ['Obstacles', 'Movers', 'Noise', 'Gadgets', 'Structures'];

/** How many render instances an item needs, per mesh — used for the capacity check. */
export function itemCost(type) {
  const def = ITEMS[type];
  if (!def) return null;
  const c = [0, 0, 0, 0];
  for (const p of def.parts({ x: 0, z: 0, r: 0 })) c[p.m]++;
  return c;
}
