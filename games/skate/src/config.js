/* config.js — every tunable, lifted straight out of the Godot original.
 *
 * GlobalSettings and PlayerSettings in Godot_Skate are two flat lists of
 * constants that the whole game reads. They are reproduced here name for name
 * and value for value, so that a number that felt right there feels right here.
 * Where a constant is new to this port (touch sizing, camera lerp) it is
 * marked PORT.
 */

/* --- PlayerSettings (Scripts/Player/player_settings.gd) --- */
export const STATS = {
  acc: 0.1,            // push impulse per physics tick
  jump_vel: 5.0,
  /* PORT: the original steers at 4.0 on the ground and 7.0 in the air, which
     on a keyboard is a twitch — you cannot hold a line down a corridor or set
     up for a rail without sawing at it. The ground rates are eased off.

     The AIR rate went the other way, to 10.0. Spinning is the thing you are in
     the air to do, and at 7.0 a full turn takes nine tenths of a second, which
     is most of an ollie — a 360 was a fluke and a 720 was not happening. At
     10.0 a turn takes 0.63 s, so a 360 fits inside an ordinary jump and a 720
     inside a good one off a ramp. The scored angle uses the same number as the
     body, which it did not before: the readout said 720 while the skater had
     turned 500. */
  rot: 2.8,            // steering rate, riding      (original 4.0)
  rot_setup: 3.0,      // steering rate, on the menu turntable
  rot_kickturn: 4.5,   // steering rate while braking (original 6.0)
  rot_air: 10.0,       // steering rate in the air    (original: rot_jump, 7.0)
  rot_jump: 10.0,      // kept in step with rot_air
  max_vel: 12.0,
  balance_threshold: 4.0
};

/* --- GlobalSettings (Scripts/global_settings.gd) --- */
export const G = {
  GRAVITY: 15.0,
  /* Dropped from 0.38 to hold the overall difficulty steady now that the
     needle accelerates: unchanged, the runaway took the fall from 1.97 s to
     1.32 s. At 0.26 it is 1.90 s again, but spent very differently — the first
     quarter of the travel takes 0.70 s and the last 0.27. */
  BALANCE_MULTI: 0.26,
  UP_ALIGN_SPEED: 10.0,
  INTERP_SPEED: 15.0,
  SHAPE_CAST_OFFSET_MAX: 0.25,
  SHAPE_CAST_OFFSET_MULTIPLIER: 0.5,
  /* PORT: when a landing counts as a bail.
     The original bails if you touch down with your board more than 60 degrees
     off your direction of travel, at over 4 m/s. Measured, that means 0.42 s of
     holding left in the air — a quarter turn — bails you 100% of the time,
     which for a seven-year-old is most landings. It now takes a nearly square
     sideways landing (83 degrees) at real speed, and anything short of that
     straightens the board out instead (see LAND_ALIGN_DOT). */
  FLOOR_FALL_THRESHOLD: 0.12,       // original 0.5
  PERPENDICULAR_FALL_THRESHOLD: 6.5, // original 4.0
  /* Below this, touching down turns the board to the way you are going rather
     than leaving you scraping sideways. Fakie is preserved: it aligns to
     whichever end of your line the board is already closer to. */
  LAND_ALIGN_DOT: 0.985,
  FALL_TIMER: 2.0,
  GROUND_SLOWDOWN: 0.95,
  BALANCE_TIME_INC: 0.05,
  /* How much faster the balance needle drifts at the very edge than it does in
     the middle — see CharacterController.balanceLogic. At 2.2 the last quarter
     of the travel goes by three times as fast as the first, which is what turns
     a slider into something you have to catch. */
  BALANCE_RUNAWAY: 2.2,
  WALL_BOUNCE_RAY_DIST: 0.5,
  WALL_BOUNCE_VEL_THRESH: 3.0,
  WALL_BOUNCE_MULTI: 0.25,
  WALL_BOUNCE_OFFSET_MULTI: 0.05,
  /* PORT: what hitting a wall does. The original mirrors your velocity off the
     wall and turns you to face the new direction — so clipping a doorway at
     speed spins you round and sends you back the way you came. That is brutal
     on a converted THPS level, which is all corridors and pillars.
     Below WALL_HEAD_ON you now just slide along the wall with a small nudge
     off it, keeping your speed and your line. The full reversal is kept for
     what it was for: riding squarely into something at speed. */
  WALL_HEAD_ON: 0.82,        // |n . heading| above which it counts as square on
  WALL_IGNORE_DOT: 0.12,     // below this you are parallel to it; do nothing
  WALL_SLIDE_KEEP: 0.97,     // speed kept when grazing
  WALL_SLIDE_PUSH: 0.45,     // m/s of "light angle away from the wall"
  WALL_HEAD_ON_KEEP: 0.45,   // speed kept on a square hit (was a flat 0.25)
  /* In the AIR a wall never bounces you, ever. Collide-and-slide already moves
     you along the face, but it only fixes the POSITION: the velocity carries on
     pointing into the wall and gets scrubbed off again every tick, so a 15
     degree graze was costing three quarters of your speed. Drop the into-wall
     component outright and keep the rest. */
  AIR_WALL_KEEP: 0.93,
  PATH_BOUNCE_MULTI: 0.75,
  JUMP_GRIND_DIR_MULTI: 0.5,
  /* Hop off a rail with the stick held and you leave at an angle — this many
     radians of it at full lean, eased from straight ahead at centre. It used to
     be a flat half a metre a second sideways off the buffered LEFT/RIGHT, which
     is neither steerable nor something you could feel. */
  GRIND_OUT_ANGLE: 30 * Math.PI / 180,
  /* How long a press of grind keeps asking. Pressing it on the way up a ramp,
     or in the air on the way down to a rail, used to do nothing at all: the
     press lived for one buffer slot and the rail was still a second away. */
  GRIND_JOIN_REACH: 1.6,       // a ledge that carries on within this hands the grind over
  GRIND_JOIN_ANGLE: 100 * Math.PI / 180,  // ...unless the turn is sharper than this, which means it doubles back
  GRIND_ASK: 0.7,
  /* ...and how forgiving the catch is when the ask came from the air. Landing
     on a rail is rarely along it — 0.25 is the original's figure for rolling
     onto one, and it refuses almost every drop-in. */
  GRIND_AIR_ALIGN: 0.10,
  GRIND_AIR_REACH: 3.0,
  RAY_GROUND_DIST: 0.1,
  RAY_GROUND_AIR_DIST: 0.15,
  SHAPE_GROUND_DIST: 0.3,
  SHAPE_GROUND_AIR_DIST: 0.15,
  SHAPE_COL_DOT: 0.5,
  STICK_CURVE_THRESHOLD: 0.05,
  TANGENT_LERP_SPD: 5.0,
  STANDING_TIMER_MIN_SPEED: 0.5,
  STANDING_TIMER: 0.5,
  MIN_GRIND_VEL: 3.0,
  GRIND_END_UP_VEL: 3.0,
  /* PORT: taking a ramp OVER the lip instead of riding it back down.
     Anyone skating at a quarter pipe is holding forward as they hit it, so
     holding forward cannot by itself mean "eject" — the decision waits
     LIP_HOLD_TIME once you are on the transition and is then latched: still
     pushing, you leave; let go in that window and you ride it up and down.
     Leaving adds FORWARD speed, not an upward pop — your velocity up the
     transition already points up and over, and what was missing was the
     horizontal carry to land somewhere else. (The original bled 0.5 off the up
     axis here, which killed exactly the momentum you were asking to keep.) */
  LIP_HOLD_TIME: 0.2,
  LIP_PUSH: 3.0,
  /* ...and how far past the top the lean still counts. Dropping faster than
     this down the face means the moment has gone and you are riding it back
     down, so the push would come out of nowhere. It is not a latch: ask again
     and it is asked again, which is the whole point. Measured over 24 lip locks
     in four parks: the lean lands 22 of 24 from a tenth of a second after the
     lip up to four tenths, 20 of 24 out to two thirds of a second, and by then
     the lock has usually ended on its own anyway. */
  LIP_LEAVE_FALL: -7.0,
  /* The ollie, as a multiple of the height it used to reach.
   *
   * Written as HEIGHT rather than as speed, because height is the thing you
   * can see and the thing to tune: the pop is scaled by the square root of
   * these, since how high you get goes with the square of how hard you leave
   * the ground. STILL is a standing ollie, FAST is one at top speed, and it
   * slides between the two with how fast you are actually going — which is
   * what the original does and what makes a run-up worth taking. */
  OLLIE_STILL: 1.5,
  OLLIE_FAST: 2.0,
  /* A grab is a pose you hold, and it pays by the second. The clips are single
     static frames, so holding one is simply not ending the trick. */
  /* --- wallride -----------------------------------------------------------
     Ollie into a wall the original marked WALLRIDEABLE at a shallow enough
     angle and with speed, and the board goes onto the wall: the skater stands
     out of it, rides along it, and gravity drags them back down the face.
     No button — hitting it IS the trick, the same as a grind is entering a
     rail. Jump kicks off it. */
  /* How close to the FACE, measured perpendicular to it — not how far along
     the way you are travelling. Meeting a wall at 25 degrees, a metre of
     perpendicular gap is two and a half metres of ray, so a reach measured
     down the ray only ever caught a square-on approach, which is the one case
     that is not a wallride. */
  WALLRIDE_REACH: 1.1,
  WALLRIDE_RAY: 3.6,        // how far the catch probe looks along the travel
  WALLRIDE_CATCH_AIR: 0.5,  // to CATCH a wall you must be this far off the floor
  WALLRIDE_TALL: 1.3,       // ...and the wall must carry on this far above you
  WALLRIDE_MIN_AIR: 0.5,    // and you ride it until the floor is this close
  WALLRIDE_HOLD: 0.7,       // and how far it may drift before the ride is over
  WALLRIDE_MIN_SPEED: 3.0,  // slower than this and you just slide down it
  WALLRIDE_MIN_KEEP: 1.8,   // and this is where an ongoing ride gives out
  /* Both were half again as high (4.5 and 2.5) and turned a lot of honest
     attempts away for want of a run-up. The catch probe reaches a little
     further with them, 3.0 m to 3.6 — but only the probe: WALLRIDE_REACH, the
     gap to the face itself, stays where it was. Opening that instead let him
     attach to a wall three metres away and ride thin air. */
  WALLRIDE_COOLDOWN: 0.35,  // no re-catching the same wall on the next frame
  WALLRIDE_MIN_SHOW: 0.18,  // shorter than this was a brush, not a trick
  WALLRIDE_MAX_NY: 0.30,    // it has to be an actual wall, not a steep bank
  /* How square-on you may be arriving, as the dot of your travel into the
     wall's face. The band used to be 0.10 to 0.85 — roughly 6 to 58 degrees —
     and that upper end was the whole problem: coming at a wall steeply is the
     natural way to do it, and at 60 degrees the catch fired once in 41 tries,
     at 75 never. Both ends are open now. Measured over 248 approaches in five
     parks: 60 degrees went from 1 to 17, 75 degrees from 0 to 14, and shallow
     10-degree grazes from 10 to 14. */
  WALLRIDE_MIN_INTO: 0.04,
  WALLRIDE_MAX_INTO: 0.99,
  WALLRIDE_GRAVITY: 6.5,    // what pulls you back down the face
  WALLRIDE_MAX_TIME: 3.0,
  /* The shove away from the wall when you jump out of a wallride.
     It was 4.5, which threw you off sideways at about 40 degrees — you left
     the wall travelling away from it rather than along it, and the trick ended
     looking like a fall. Just enough to clear the face now; the pop that goes
     with it is the ordinary ollie, speed and all. */
  WALLRIDE_KICK: 1.6,
  WALLRIDE_LEAN: 0.22,      // radians the rider leans back out of the wall
  WALLRIDE_HOLD_SCORE: 420, // points a second, like a grind
  WALLRIDE_MAX_HOLD: 3.0,
  FLIP_LOCK: 0.42,          // a flip cannot be re-pressed until its clip has run
  GRAB_HOLD_SCORE: 700,     // points a second, while the button is down
  GRAB_MAX_HOLD: 2.5,       // and the most that can be banked from one grab
  /* A grab has three parts. The pose comes ON over GRAB_IN, is HELD for as
     long as the button is down — this is the part that pays, and the points
     climb on the screen while it runs — and comes OFF over GRAB_OUT, which has
     to finish before the next trick can start. Every Grab_* clip in
     SK_char.glb is one static frame (measured: 2 keys, zero movement between
     them), so there is no midpoint inside the clip to stop at; these two blends
     ARE the two halves of the animation, and pausing between them is what the
     holding looks like. */
  GRAB_IN: 0.18,
  GRAB_OUT: 0.22,
  /* Grinds and lip stalls pay by the second too, and show the same climbing
     number. A grind runs longer than a grab can, so it pays less per second. */
  GRIND_HOLD_SCORE: 260,
  GRIND_MAX_HOLD: 6.0,
  LIP_HOLD_SCORE: 340,
  LIP_MAX_HOLD: 3.0,
  /* How steep a piece of tagged transition has to be before it behaves like
     one. The vert trigger covers the flat floor of a bowl as well as its walls,
     and standing on the flat is not riding a transition. See isTransition. */
  TRANSITION_NY: 0.80,
  COPING_PEEK: [0.4, 0.9, 1.7],  // how far back down the ramp the plane lock looks
  COPING_LOOK: 9.0,         // and how far down
  COPING_TURN: 5.0,         // how fast the plane swings round to follow a bend
  PIPE_LAND_DIST: 0.45,     // how far below you the lock looks for the ramp coming back
  PIPE_LOCK_MAX: 4.0,       // and the longest it will ever hold you, whatever happens
  /* PORT: the stance swap. Ride up a ramp and come back down and you are now
     rolling tail-first — in the original there is nothing you can do about it
     but stop and turn round, and pushing just fights your own momentum. These
     govern the swap that makes the way you are MOVING the way you are FACING. */
  FAKIE_DOT: -0.6,          // how squarely backwards before it counts as fakie
  FAKIE_MIN_SPEED: 1.3,     // don't swap at walking pace, or the apex twitches
  SWITCH_COOLDOWN: 0.5,     // and don't let it flip-flop
  SWITCH_SPIN_TIME: 0.22,   // how long the model takes to spin round after it
  /* PORT: the push. In the original the ONLY full-rate push is the jump button
     held down (input.z); Up gives a quarter-rate creep, so anyone who assumes
     "forward means forward" gets 1.5 m/s^2 and eight seconds to top speed. Up
     now pushes at the same rate as the button, and the rate itself is a shade
     above the original's 0.1 so a standing start is not a chore. */
  PUSH_ACC: 0.135
};

/* --- PORT: things Godot got from its physics server and we have to name --- */
export const P = {
  STEP: 1 / 60,           // fixed physics tick; the Godot values assume 60 Hz
  MAX_STEPS: 5,           // never simulate more than this many ticks in one frame
  BODY_RADIUS: 0.36,      // sphere used for collide-and-slide, centred a radius up
  /* Godot's downward ShapeCast3D is a 0.2 m sphere swept RAY_GROUND_DIST from
     the body origin, so the ground is "found" about 0.3 m under the feet in the
     air and 0.35 m on the ground. This is that sphere radius. It matters more
     than it looks: at 0.55 the probe reached 0.65 m down, so an ollie "landed"
     while still half a metre up, got floor-snapped back down with its upward
     velocity intact, and took off again — one jump, two ollies. */
  SHAPE_RADIUS: 0.2,      // the ShapeCast sphere; sets how far the ground probe sees
  SNAP_DIST: 0.35,        // floor snap distance while riding (Godot apply_floor_snap)
  FWD_PROBE: 0.6,         // wall probe length ahead of the board
  CAM_LERP: 10.0,         // Camera_Pos.lerp(global_position, delta * 10)
  /* Camera3D transform out of Scenes/player_character.tscn, basis rows:
     the camera sits back/up/right of the skater and never turns with them. */
  CAM_OFFSET: [-2.11664, 5.29459, 3.55786],
  CAM_DIR: [0.345967, -0.751218, -0.562119],
  CAM_FOV: 38.0,
  /* The vert camera. Going up a quarter pipe the skater turns 180 at the apex,
     and a camera chasing that ends up inside the wall behind them — the
     occlusion probe then shoves it against the back of their head and you
     cannot see the skater at all. So the angle is frozen at whatever it was
     riding in, and only unfreezes once they are down and rolling away, or
     after CAM_VERT_HOLD if that never happens. */
  CAM_VERT_HOLD: 0.7,     // seconds the angle keeps holding after the lock ends
  CAM_VERT_ROLL: 2.5,     // m/s of ground speed that counts as "moving away"
  /* A steep face is not always a quarter pipe. Riding DOWN one at this many
     metres a second means it is a hill and the ordinary follow is right; riding
     up it, or carving across it, is a transition and the shot belongs out in
     front of the face. Carving sits near zero, which is why the test is a
     speed down the slope and not simply "is he descending". */
  CAM_PIPE_DESCENT: 1.5,
  /* ...and once he HAS been up the face, the shot keeps holding this long, so
     the way back down is filmed from the same place as the way up instead of
     whipping round behind him at the apex. */
  CAM_PIPE_MEMORY: 1.6,
  /* Following the slope.
   *
   * The camera sits a fixed height over the skater and a fixed distance back
   * along his heading — and going downhill, "back" is UP the hill. On anything
   * steeper than about twenty degrees the ground behind him is higher than the
   * lens, so the shot was inside the slope: a quarter of the frames measured
   * over five parks had less than a metre of air under the camera, plenty of
   * them none at all, and the occlusion probe answered by hauling the camera
   * onto the back of his head. So the height follows the ground plane he is
   * standing on: up behind him going down, down behind him going up, which is
   * also what makes the view tip over and look down the hill.
   *
   * The limits are what stops a steep face throwing the camera into orbit as
   * the divide by n.y runs away, and MIN_NY keeps this away from transitions,
   * where the vert lock has its own answer. */
  CAM_SLOPE_MIN_NY: 0.45,
  CAM_SLOPE_LIFT: 4.5,      // most it will climb behind you on a descent
  CAM_SLOPE_DROP: 1.6,      // ...and most it will drop behind you on a climb
  CAM_SLOPE_EASE: 5.0,      // how fast it takes up a change of gradient
  CAM_GROUND_LOOK: 1.5,     // start the ground probe this far over the lens
  CAM_GROUND_REACH: 6.0,    // ...and look this far down for something under it
  CAM_GROUND_CLEAR: 1.0,    // air to keep beneath the lens
  CAM_GROUND_MAX: 2.5,      // most the probe may add on top of the slope term
  MODEL_YAW: 0,           // the exported character already faces +Z, like the body
  RESPAWN_Y: -100         // get_fall_out_of_bounds
};

/**
 * Who is skating.
 *
 * One model, two outfits: SK_char.glb's parts are named (body, top, bottom,
 * shoes, hair, helmet), so a skater is nothing more than a set of colours to
 * paint them. Each one keeps its own best score, its own per-park bests and
 * its own goal ticks — see Skate._store.
 */
export const SKATERS = [
  {
    id: 'ezra',
    name: 'Ezra',
    look: { top: 0xc8452f, bottom: 0x2f3540, helmet: 0xf0b429, hair: 0x3a2c22,
            boardDeck: 0x1f2933 }
  },
  {
    id: 'caleb',
    name: 'Caleb',
    look: { top: 0x3f7fbf, bottom: 0x4a4237, helmet: 0x2fa36b, hair: 0x8e7659,
            boardDeck: 0x38251c }
  }
];

/* Character colours — CharacterData's exported defaults (character_data.gd).
   A skater's own `look` is laid over the top of this. */
export const LOOK = {
  top: 0x5d7937,          // hoodie
  bottom: 0x826a4a,       // jeans
  shoes: 0x323232,
  skin: 0xc99a72,
  hair: 0x8e7659,
  helmet: 0x2f5fd0,
  glass: 0x223344,
  boardDeck: 0x2b2b33,
  boardWheels: 0xc1b878,
  boardMetal: 0xcccccc
};

/* Stamped when the game is deployed, and shown on the pause screen, so it is
   obvious at a glance whether a change has actually reached the tablet.
   tools/stamp_build.py rewrites this line. */
export const BUILD = '2026-09-19 08:44';

/* Score band shown on the end-of-combo flash. */
export const COMBO_COOLDOWN_TIME = 0.5;
/* A spin is counted in half-turns: 180, 360, 540, 720. See CharacterTricks.
   _rotRound — the original's 15 degree rounding prints things like "Ollie 272",
   which is not a trick anyone has ever done. */
export const ROT_ROUNDING = 180;
export const TRICK_LABEL_COOLDOWN = 2.0;

/* Windows.
 *
 * Any speed breaks one. This was 7 m/s — about half of what you carry off a
 * decent ramp — on the theory that a window you can nudge open is not a window.
 * In practice it meant rolling gently into a pane bounced you off it for no
 * reason anyone could see, and you had to go and line the whole thing up
 * again. Touching one at all is now enough; the floor is only there to stop a
 * standing skater dividing by zero. */
export const GLASS = {
  MIN_SPEED: 0.3,    // i.e. anything but standing still
  REACH: 0.6,        // how far in front of the chest the board counts as arriving
  EYE: 0.55,         // chest height above the board, where the ray starts
  SCORE: 250,        // paid straight out, not into the combo
  SHARDS: 34,        // pieces per pane
  POOL: 90,          // ...and the most that can be in the air at once
  SIZE: 0.11,        // a piece, in metres
  LIFE: 1.5,         // seconds before it gives up and fades
  CARRY: 0.33,       // how much of your speed the pieces take with them
  SPRAY: 3.0,        // and how much they scatter on top of that
  LIFT: 2.2,         // a little upward kick, so they arc instead of sliding
  GRAVITY: 16.0      // heavier than real, because the pieces are small and near
};
