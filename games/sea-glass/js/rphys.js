// rphys — the Rapier rigid-body backend, wearing lphys's clothes.
//
// The game has TWO physics backends and the quality profile picks one:
//
//   High -> rphys (this file): real rigid bodies, real contact manifolds, real
//           friction and real rolling, solved in wasm by Rapier.
//   Low  -> lphys: the game's own position-based sphere relaxation, ~6KB of JS.
//
// Everything that talks to physics — pebbles.js, finds.js, collection.js — talks to
// ONE surface, which is lphys's: structure-of-arrays typed buffers (px/py/pz,
// qx..qw, vx/vy/vz, wx/wy/wz, r, invM, alive, tag, moved), an awake list, and the
// same method names (add/remove/wake/sleep/place/applyImpulse/step/...). This file
// implements that surface on top of Rapier by MIRRORING each body into those arrays
// once per step. No call site knows which engine it is driving.
//
// Three things are worth knowing before changing anything here:
//
//  1. THE AWAKE SET IS THE COST MODEL, ON BOTH BACKENDS. ~500 dynamic Rapier
//     bodies is far too much to integrate every frame on a tablet, so a parked
//     stone is not a sleeping dynamic body — it is converted to a FIXED body. A
//     fixed body is not in any island, is not integrated and is not solved, but its
//     collider stays in the broad phase, so the woken stones above it still rest on
//     it. That is exactly lphys's "frozen neighbours are immovable" rule, and it
//     means `maxAwake` genuinely bounds the per-frame work on High as well as Low.
//
//  2. NEVER CALL rb.sleep() ON A DENSE PILE. This is the bug the first Rapier port
//     shipped and then died of: `sleep()` leaves the body dynamic but out of the
//     solver, so with several hundred stones resting on each other the pile
//     integrates without resolving and sinks through the floor. The fix is the one
//     above — zero the velocity mirrors and convert to Fixed — plus letting
//     Rapier's OWN island manager decide when a body has stopped (`isSleeping()`),
//     which is then honoured by parking it.
//
//  3. NOTHING IS SIMULATED WHEN NOTHING IS AWAKE. `step()` returns before it
//     touches Rapier at all while `nAwake === 0`, and `moved` flags are only ever
//     set for bodies that actually changed transform, so a settled beach uploads no
//     instance matrices. Same contract as lphys.
//
//  4. NOTHING IS EVER DESTROYED IN A LIVE WORLD — NO BODY, NO COLLIDER. This is the
//     "comb further kills High" bug, and it is nastier than it looks. Destroying a
//     body or a collider that has been through `setBodyType()` — which, by rule 1, is
//     EVERY particle here — leaves rapier3d-compat 0.20's island / broad-phase
//     bookkeeping referring to a slot that is gone. The next `world.step()` then hits
//     an unreachable in wasm (`RuntimeError: unreachable`), and because wasm is built
//     with panic=abort that panic leaves wasm-bindgen's borrow flags latched for
//     ever: EVERY later call into the world throws "recursive use of an object
//     detected which would lead to unsafe aliasing in rust". The world is dead — no
//     stone moves, no tap collects — while the frame loop happily keeps running. A
//     section rebuild recycled ~510 bodies at once, so it hit this every time.
//
//     So the whole Rapier side is a POOL that only ever grows, and both `rb[i]` and
//     `col[i]` live for the lifetime of the world:
//       - `remove()` keeps the body AND its ball. It parks the body Fixed and
//         teleports it to a far-away shelf (STOW_X/STOW_Y, one slot per index so no
//         two stowed AABBs overlap). Out there it is in no island, touches nothing,
//         and no ray the game casts can reach it.
//       - `add()` on a recycled slot resizes the existing ball (`setRadius`) and moves
//         the body back into play. Nothing is created, nothing is destroyed.
//       - statics work the same way: `addStaticBox()` reuses a pooled fixed body and
//         calls `setHalfExtents` on its cuboid; `clearStatics()` only stows them.
//     The ONLY thing that ever destroys anything is `dispose()`, which frees the whole
//     world in one go — the one teardown shape the compat build is happy with — and
//     after it the world is marked `dead` and every method is a no-op, so a stale Body
//     handle from a previous section cannot reach freed wasm either.
//
//  5. NOTHING STRUCTURAL HAPPENS INSIDE A STEP. `stepOnce()` holds a `_stepping`
//     flag: a nested step is a no-op, and a `remove()`/`clear()`/`dispose()` that
//     arrives from inside the step (the consumer's `clampFn` runs in there) is queued
//     and flushed the moment the step returns. Transform writes are still allowed
//     mid-step — that is what a clamp IS — because they cannot restructure anything.
//
// The scale matters too: a pebble here is ~0.05 units across, not 5cm-of-a-metre.
// Rapier's contact tolerances are absolute, so the world is told what a "metre" is
// via `lengthUnit`; without it a 5cm world sits entirely inside the solver's own
// slop and the pile behaves like porridge.

import { MODE_ROLL, MODE_SPIN } from './lphys.js';
import { rapier } from './rapier.js';

export { MODE_ROLL, MODE_SPIN };

const NEG = -1;

/** Reusable read targets: Rapier's compat API writes into these, so no allocation. */
const _t = { x: 0, y: 0, z: 0 };
const _rq = { x: 0, y: 0, z: 0, w: 1 };
const _lv = { x: 0, y: 0, z: 0 };
const _av = { x: 0, y: 0, z: 0 };
/** Reusable write vectors. */
const _w1 = { x: 0, y: 0, z: 0 };
const _w2 = { x: 0, y: 0, z: 0 };
const _wq = { x: 0, y: 0, z: 0, w: 1 };
const _ZERO = { x: 0, y: 0, z: 0 };

/**
 * The shelf that pooled bodies are stowed on (rule 4). Far below and far to the side
 * of any beach or jar, and spread one `STOW_PITCH` apart per slot so several hundred
 * stowed AABBs never overlap each other — overlapping them would hand the broad phase
 * an O(n^2) pile of pairs for bodies that are not even in play.
 */
const STOW_X = 500;
const STOW_Y = -500;
const STOW_PITCH = 0.5;   // >> 2x any pebble radius, so no two stowed AABBs touch

/**
 * Per-step damping expressed as a factor (lphys's knob) turned into Rapier's
 * continuous damping rate. lphys multiplies the velocity by `f` every step; Rapier
 * integrates exp(-rate * dt), so rate = -ln(f) * hz. Capped, because a factor of
 * 0.86 at 60Hz is a rate of 9 and beyond about 12 a stone stops dead in mid-air.
 */
function dampingRate(factor, hz, cap) {
  if (!(factor > 0) || factor >= 1) return 0;
  return Math.min(cap, -Math.log(factor) * hz);
}

export class World {
  constructor(opts = {}) {
    const R = rapier();
    if (!R) throw new Error('rphys: Rapier is not initialised — await initEngine() first');
    this.R = R;
    /** Which backend this is. Game code should prefer `hardWalls` to this. */
    this.engine = 'rapier';
    /**
     * TRUE: this world has real static colliders (see addStaticBox), so a
     * consumer's clamp is a safety net rather than the containment itself. lphys
     * sets it false, where the clamp IS the containment.
     */
    this.hardWalls = true;

    const cap = this.capacity = opts.capacity || 128;

    // --- the mirrored state (identical layout to lphys) ---------------------
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.qx = new Float32Array(cap);
    this.qy = new Float32Array(cap);
    this.qz = new Float32Array(cap);
    this.qw = new Float32Array(cap);
    this.wx = new Float32Array(cap);
    this.wy = new Float32Array(cap);
    this.wz = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.invM = new Float32Array(cap);
    this.alive = new Uint8Array(cap);
    this.mode = new Uint8Array(cap);
    this.tag = new Uint8Array(cap);
    this.moved = new Uint8Array(cap);
    // lphys keeps the previous position because it derives velocity from it. Rapier
    // has real velocities, but the arrays are kept so any consumer that reads them
    // (debug probes) still finds something sane.
    this.ox = new Float32Array(cap);
    this.oy = new Float32Array(cap);
    this.oz = new Float32Array(cap);

    // --- the shadow copy ---------------------------------------------------
    // What Rapier last told us. Anything that differs from the mirror was written
    // by the game (a clamp, a shake, a nudge) and has to be pushed back in.
    this.sx = new Float32Array(cap);
    this.sy = new Float32Array(cap);
    this.sz = new Float32Array(cap);
    this.svx = new Float32Array(cap);
    this.svy = new Float32Array(cap);
    this.svz = new Float32Array(cap);
    this.swx = new Float32Array(cap);
    this.swy = new Float32Array(cap);
    this.swz = new Float32Array(cap);
    this.sqx = new Float32Array(cap);
    this.sqy = new Float32Array(cap);
    this.sqz = new Float32Array(cap);
    this.sqw = new Float32Array(cap);

    // --- the awake set -----------------------------------------------------
    // Exactly lphys's bookkeeping. Here it doubles as the list of DYNAMIC bodies:
    // everything not in it has been converted to Fixed (see _park).
    this.awakeList = new Int32Array(cap);
    this.inAwake = new Uint8Array(cap);
    this.framesLeft = new Int16Array(cap);
    this.calmFrames = new Int16Array(cap);
    this.parked = new Uint8Array(cap);
    this.nAwake = 0;

    this.count = 0;
    this.nAlive = 0;
    this.freeList = new Int32Array(cap);
    this.nFree = 0;

    /**
     * The Rapier handles, by slot. `rb` is a POOL: a slot's body outlives the
     * particle that used it (see remove()) and is handed back by the next add().
     * `col` is the live collider, and null for a pooled-but-idle slot.
     */
    this.rb = new Array(cap).fill(null);
    this.col = new Array(cap).fill(null);
    /** Static containment bodies (floor, rim, jar shelves) — also a pool. */
    this.statics = [];
    this.nStatics = 0;

    /** Set by dispose(): the wasm world is gone and every method is a no-op. */
    this.dead = false;
    /** True while inside world.step(). See rule 5 at the top of the file. */
    this._stepping = false;
    /** Structural work that arrived mid-step, run the moment the step returns. */
    this._deferred = [];

    // --- knobs (same names and meanings as lphys, so profiles carry over) ---
    this.gx = 0;
    this.gy = opts.gravity === undefined ? -9.82 : opts.gravity;
    this.gz = 0;
    this.h = 1 / (opts.stepHz || 60);
    this.maxSubsteps = opts.maxSubsteps || 2;
    /** No meaning to Rapier (it solves, it does not relax). Kept so the quality
     *  profile can set it without the caller caring which backend it is on. */
    this.passes = opts.passes || 2;
    this.damping = opts.damping === undefined ? 0.92 : opts.damping;
    this.spinDamping = opts.spinDamping === undefined ? 0.9 : opts.spinDamping;
    this.rollK = opts.rollK === undefined ? 1 : opts.rollK;
    this.maxSpeed = opts.maxSpeed || 6;
    this.acc = 0;

    this.maxAwake = opts.maxAwake || cap;
    this.wakeFrames = opts.wakeFrames || 80;
    this.sleepSpeed = opts.sleepSpeed === undefined ? 0.07 : opts.sleepSpeed;
    this.sleepSpin = opts.sleepSpin === undefined ? 0.5 : opts.sleepSpin;
    this.sleepFrames = opts.sleepFrames || 5;
    this.wakePenFrac = opts.wakePenFrac === undefined ? 0.3 : opts.wakePenFrac;
    this.cell = opts.cell || 0.25;      // lphys's spatial-hash cell: unused here

    /** Rapier-only knobs, with sane defaults if the profile does not set them. */
    this.friction = opts.friction === undefined ? 0.86 : opts.friction;
    this.restitution = opts.restitution === undefined ? 0.02 : opts.restitution;
    this.solverIterations = opts.solverIterations || 4;
    this.lengthUnit = opts.lengthUnit || 0.1;

    /** Called once per step, after the solve: the consumer's containment. */
    this.clampFn = null;

    this.world = new R.World({ x: this.gx, y: this.gy, z: this.gz });
    this.world.timestep = this.h;
    try { this.world.numSolverIterations = this.solverIterations; } catch (e) { /* older builds */ }
    try { this.world.lengthUnit = this.lengthUnit; } catch (e) { /* pre-0.14 */ }

    this.stats = { steps: 0, pairs: 0, corrections: 0 };
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Add a ball. Same signature and same return (a stable slot index) as lphys.add.
   *
   * Born PARKED, like everything in lphys: a new body does not simulate until
   * something wakes it. The bake path (`wakeAll`) is what starts a fresh pile off.
   *
   * If the slot has been used before it still HOLDS ITS BODY AND ITS BALL (rule 4 at
   * the top of the file): the ball is resized and the body moved back into play,
   * instead of anything being created. Refuses while a step is in flight — nothing in
   * the game adds a particle
   * from inside a clamp, and refusing is a case every caller already handles (a full
   * world returns NEG too).
   */
  add(o) {
    if (this.dead || this._stepping) return NEG;
    let i;
    if (this.nFree > 0) i = this.freeList[--this.nFree];
    else if (this.count < this.capacity) i = this.count++;
    else return NEG;

    const R = this.R;
    const x = o.x || 0, y = o.y || 0, z = o.z || 0;
    const radius = o.r || 0.05;
    const m = o.mass === undefined ? 1 : o.mass;
    const lin = dampingRate(this.damping, 1 / this.h, 12);
    const ang = dampingRate(this.spinDamping, 1 / this.h, 8);

    let rb = this.rb[i];
    let col = this.col[i];
    const recycled = !!rb;
    if (recycled) {
      // A pooled slot: the body AND its ball are still there, parked and stowed out
      // of the world by remove(). Resize the ball and move it back in — nothing is
      // created and nothing is destroyed.
      if (col) {
        col.setRadius(radius);
        if (m > 0) col.setMass(m);
      }
      _w1.x = x; _w1.y = y; _w1.z = z;
      rb.setTranslation(_w1, false);
      _wq.x = 0; _wq.y = 0; _wq.z = 0; _wq.w = 1;
      rb.setRotation(_wq, false);
      rb.setLinvel(_ZERO, false);
      rb.setAngvel(_ZERO, false);
      rb.setLinearDamping(lin);
      rb.setAngularDamping(ang);
      rb.userData = i;
      try { rb.recomputeMassPropertiesFromColliders(); } catch (e) { /* built mass stands */ }
    } else {
      rb = this.world.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(lin)
        .setAngularDamping(ang)
        .setCanSleep(true)
        .setCcdEnabled(false)
        .setUserData(i));
      // Ball colliders only, for the same reason lphys only has spheres: a bed of
      // shingle needs hundreds of them and a ball-ball contact is the cheapest
      // manifold there is. The mass is set on the COLLIDER so Rapier derives a
      // matching angular inertia from the shape rather than leaving it at zero.
      const cd = R.ColliderDesc.ball(radius)
        .setFriction(this.friction)
        .setRestitution(this.restitution);
      if (m > 0) cd.setMass(m);
      col = this.world.createCollider(cd, rb);
    }

    this.rb[i] = rb;
    this.col[i] = col;
    this.px[i] = this.ox[i] = this.sx[i] = x;
    this.py[i] = this.oy[i] = this.sy[i] = y;
    this.pz[i] = this.oz[i] = this.sz[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.svx[i] = this.svy[i] = this.svz[i] = 0;
    this.wx[i] = this.wy[i] = this.wz[i] = 0;
    this.swx[i] = this.swy[i] = this.swz[i] = 0;
    this.qx[i] = this.qy[i] = this.qz[i] = 0;
    this.qw[i] = 1;
    this.sqx[i] = this.sqy[i] = this.sqz[i] = 0;
    this.sqw[i] = 1;
    this.r[i] = radius;
    this.invM[i] = m > 0 ? 1 / m : 0;
    this.mode[i] = o.mode || MODE_ROLL;
    this.tag[i] = o.tag || 0;
    this.alive[i] = 1;
    this.moved[i] = 1;
    this.inAwake[i] = 0;
    this.framesLeft[i] = 0;
    this.calmFrames[i] = 0;
    // A recycled body is ALREADY Fixed, so _park has only bookkeeping left to do.
    this.parked[i] = recycled ? 1 : 0;
    this.nAlive++;
    this._park(i);
    return i;
  }

  /**
   * A fixed box. On lphys this is a no-op (the clamp is the containment); here it is
   * what the pit floor, the rim and the jar shelves actually ARE, because a
   * position clamp fighting a solver every step is how you stop a pile from ever
   * being allowed to fall asleep.
   *
   * Pooled like the particles (rule 4): a rebuilt shelf reuses the same fixed bodies
   * and RESIZES their cuboids. Nothing is ever created or destroyed after the first
   * build of a world.
   */
  addStaticBox(x, y, z, hx, hy, hz) {
    if (this.dead) return NEG;
    const R = this.R;
    let s = this.statics[this.nStatics];
    if (s) {
      _w2.x = hx; _w2.y = hy; _w2.z = hz;
      s.col.setHalfExtents(_w2);
      _w1.x = x; _w1.y = y; _w1.z = z;
      s.rb.setTranslation(_w1, false);
    } else {
      const rb = this.world.createRigidBody(
        R.RigidBodyDesc.fixed().setTranslation(x, y, z).setUserData(NEG));
      const cd = R.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(Math.min(1.1, this.friction * 1.15))
        .setRestitution(0);
      s = { rb, col: this.world.createCollider(cd, rb) };
      this.statics.push(s);
    }
    return this.nStatics++;
  }

  /**
   * Retire every static box: stow the pooled bodies out of play (rule 4 — the shapes
   * are never destroyed) so the next build can lay them out again.
   */
  clearStatics() {
    if (!this.dead) {
      for (let k = 0; k < this.nStatics; k++) {
        const s = this.statics[k];
        if (!s) continue;
        try {
          _w1.x = -STOW_X - k * STOW_PITCH; _w1.y = STOW_Y; _w1.z = 0;
          s.rb.setTranslation(_w1, false);
        } catch (e) { /* gone */ }
      }
    }
    this.nStatics = 0;
  }

  /**
   * Free a slot. The mirror is updated at once (the caller's index is dead the moment
   * it returns), and the Rapier side — park the body and stow it, see _retire — happens
   * now, or right after the step if we are called from inside one (finds.js collects a
   * stone from the clamp).
   */
  remove(i) {
    if (i < 0 || i >= this.capacity || !this.alive[i]) return;
    const wasParked = !!this.parked[i];
    this.parked[i] = 1;                 // a pooled body is always left Fixed
    this.inAwake[i] = 0;
    this.alive[i] = 0;
    this.moved[i] = 0;
    this.nAlive--;
    if (this.nFree < this.capacity) this.freeList[this.nFree++] = i;
    if (this._stepping) this._deferred.push(() => this._retire(i, wasParked));
    else this._retire(i, wasParked);
  }

  /**
   * Hand a body back to the pool. It keeps its collider (rule 4: destroying shapes is
   * the thing that breaks) and is instead made Fixed and stowed on a far-away shelf,
   * one slot per index so no two stowed AABBs overlap. Out there it is in no island,
   * touches nothing, and no ray we cast can reach it. NEVER world.removeRigidBody.
   */
  _retire(i, wasParked) {
    if (this.dead) return;
    const rb = this.rb[i];
    if (!rb) return;
    try {
      if (!wasParked) {
        rb.setLinvel(_ZERO, false);
        rb.setAngvel(_ZERO, false);
        rb.setBodyType(this.R.RigidBodyType.Fixed, false);
      }
      _w1.x = STOW_X + i * STOW_PITCH; _w1.y = STOW_Y; _w1.z = 0;
      rb.setTranslation(_w1, false);
    } catch (e) { /* keep going */ }
  }

  clear() {
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const wasParked = !!this.parked[i];
      if (this._stepping) this._deferred.push(() => this._retire(i, wasParked));
      else this._retire(i, wasParked);
    }
    this.clearStatics();
    this.alive.fill(0);
    this.inAwake.fill(0);
    // Every body still in the pool is Fixed; add() flips this back for a fresh slot.
    this.parked.fill(1);
    this.moved.fill(0);
    this.nAwake = 0;
    this.nAlive = 0;
    this.count = 0;
    this.nFree = 0;
    this.acc = 0;
  }

  /**
   * Release the wasm world. Called when the engine is switched, and the ONLY thing in
   * this file that destroys anything Rapier owns — it destroys the whole world at once,
   * which is the one shape of teardown the compat build is happy with (rule 4).
   *
   * `dead` is set FIRST and every method that touches wasm checks it, so a Body handle
   * still held by a stale find or a half-finished section build cannot reach freed
   * memory. The free itself waits for the step to finish if one is running.
   */
  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.nAwake = 0;
    this.acc = 0;
    if (this._stepping) this._deferred.push(() => this._free());
    else this._free();
  }

  _free() {
    try { this.world.free(); } catch (e) { /* not all builds expose free() */ }
    this.rb.fill(null);
    this.col.fill(null);
    this.statics.length = 0;
    this.nStatics = 0;
    this.alive.fill(0);
    this.inAwake.fill(0);
    this.nAwake = 0;
    this.nAlive = 0;
  }

  /** lphys's spatial-hash tuning. Rapier has its own broad phase: nothing to do. */
  setCellFromMaxRadius(maxR) { this.cell = Math.max(0.02, maxR * 2.05); }

  setGravity(x, y, z) {
    this.gx = x; this.gy = y; this.gz = z;
    if (this.dead) return;
    this.world.gravity = { x, y, z };
  }

  setStepHz(hz) {
    this.h = 1 / hz;
    if (this.dead) return;
    this.world.timestep = this.h;
    // The damping factors are per-step, so the continuous rate has to follow the
    // rate — exactly the normalisation physics.js does for lphys.
    const lin = dampingRate(this.damping, hz, 12);
    const ang = dampingRate(this.spinDamping, hz, 8);
    for (let i = 0; i < this.count; i++) {
      const rb = this.rb[i];
      if (!this.alive[i] || !rb) continue;
      rb.setLinearDamping(lin);
      rb.setAngularDamping(ang);
    }
  }

  stepHz() { return Math.round(1 / this.h); }
  resetClock() { this.acc = 0; }

  // --- transforms (spawn / teleport paths, never per-frame) -----------------

  /**
   * Teleport. Pushed straight through to Rapier rather than left for the pre-step
   * sync, because the caller is allowed to teleport a PARKED body (finds.js places
   * a shard and immediately parks it) and the pre-step sync only walks the awake
   * set.
   */
  place(i, x, y, z) {
    if (!this.alive[i]) return;
    this.px[i] = this.ox[i] = this.sx[i] = x;
    this.py[i] = this.oy[i] = this.sy[i] = y;
    this.pz[i] = this.oz[i] = this.sz[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.svx[i] = this.svy[i] = this.svz[i] = 0;
    const rb = this.rb[i];
    if (rb) {
      _w1.x = x; _w1.y = y; _w1.z = z;
      rb.setTranslation(_w1, false);
      if (!this.parked[i]) rb.setLinvel(_ZERO, false);
    }
    this.moved[i] = 1;
  }

  setQuat(i, x, y, z, w) {
    if (!this.alive[i]) return;
    this.qx[i] = this.sqx[i] = x;
    this.qy[i] = this.sqy[i] = y;
    this.qz[i] = this.sqz[i] = z;
    this.qw[i] = this.sqw[i] = w;
    const rb = this.rb[i];
    if (rb) {
      _wq.x = x; _wq.y = y; _wq.z = z; _wq.w = w;
      rb.setRotation(_wq, false);
    }
    this.moved[i] = 1;
  }

  /** XYZ-order Euler, matching lphys (and the bodies before it). */
  setEuler(i, ex, ey, ez) {
    const c1 = Math.cos(ex / 2), s1 = Math.sin(ex / 2);
    const c2 = Math.cos(ey / 2), s2 = Math.sin(ey / 2);
    const c3 = Math.cos(ez / 2), s3 = Math.sin(ez / 2);
    this.setQuat(i,
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3);
  }

  setMass(i, m) {
    this.invM[i] = m > 0 ? 1 / m : 0;
    const col = this.col[i], rb = this.rb[i];
    if (!col || !rb) return;
    try {
      col.setMass(Math.max(1e-4, m));
      rb.recomputeMassPropertiesFromColliders();
    } catch (e) { /* mass stays as built */ }
  }

  mass(i) { return this.invM[i] > 0 ? 1 / this.invM[i] : 0; }

  speed(i) {
    const x = this.vx[i], y = this.vy[i], z = this.vz[i];
    return Math.sqrt(x * x + y * y + z * z);
  }

  // --- wake / sleep --------------------------------------------------------

  isAwake(i) { return !!this.inAwake[i]; }
  awakeCount() { return this.nAwake; }
  aliveCount() { return this.nAlive; }

  /**
   * Turn a slot into a FIXED body: out of every island, not integrated, not solved,
   * but still collidable so the awake stones above it have something to rest on.
   *
   * This is deliberately NOT rb.sleep() — see the note at the top of the file.
   */
  _park(i) {
    const rb = this.rb[i];
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.wx[i] = this.wy[i] = this.wz[i] = 0;
    this.svx[i] = this.svy[i] = this.svz[i] = 0;
    this.swx[i] = this.swy[i] = this.swz[i] = 0;
    if (rb && !this.parked[i]) {
      rb.setLinvel(_ZERO, false);
      rb.setAngvel(_ZERO, false);
      try { rb.setBodyType(this.R.RigidBodyType.Fixed, false); } catch (e) { /* keep going */ }
      this.parked[i] = 1;
    }
    this.inAwake[i] = 0;
    this.framesLeft[i] = 0;
    this.calmFrames[i] = 0;
  }

  /** Back to a dynamic body, seeded from the mirror (which is the source of truth). */
  _unpark(i) {
    const rb = this.rb[i];
    if (!rb) return;
    if (this.parked[i]) {
      try { rb.setBodyType(this.R.RigidBodyType.Dynamic, true); } catch (e) { /* keep going */ }
      try { rb.recomputeMassPropertiesFromColliders(); } catch (e) { /* built mass stands */ }
      this.parked[i] = 0;
    }
    _w1.x = this.px[i]; _w1.y = this.py[i]; _w1.z = this.pz[i];
    rb.setTranslation(_w1, false);
    _wq.x = this.qx[i]; _wq.y = this.qy[i]; _wq.z = this.qz[i]; _wq.w = this.qw[i];
    rb.setRotation(_wq, false);
    _w1.x = this.vx[i]; _w1.y = this.vy[i]; _w1.z = this.vz[i];
    rb.setLinvel(_w1, false);
    _w2.x = this.wx[i]; _w2.y = this.wy[i]; _w2.z = this.wz[i];
    rb.setAngvel(_w2, false);
    rb.wakeUp();
    this.sx[i] = this.px[i]; this.sy[i] = this.py[i]; this.sz[i] = this.pz[i];
    this.sqx[i] = this.qx[i]; this.sqy[i] = this.qy[i];
    this.sqz[i] = this.qz[i]; this.sqw[i] = this.qw[i];
    this.svx[i] = this.vx[i]; this.svy[i] = this.vy[i]; this.svz[i] = this.vz[i];
    this.swx[i] = this.wx[i]; this.swy[i] = this.wy[i]; this.swz[i] = this.wz[i];
  }

  /**
   * Wake a body for `frames` steps. Refuses once `maxAwake` is reached — that cap
   * is what makes a fast swipe across a full pit cost the same as a slow one, and it
   * matters MORE here than on lphys, because a dynamic Rapier body is the expensive
   * kind.
   */
  wake(i, frames) {
    if (!this.alive[i]) return false;
    const f = frames || this.wakeFrames;
    if (this.inAwake[i]) {
      if (f > this.framesLeft[i]) this.framesLeft[i] = f;
      this.calmFrames[i] = 0;
      return true;
    }
    if (this.nAwake >= this.maxAwake) return false;
    this._unpark(i);
    this.inAwake[i] = 1;
    this.framesLeft[i] = f;
    this.calmFrames[i] = 0;
    this.awakeList[this.nAwake++] = i;
    return true;
  }

  /** Bake / shake path: wake everything alive, ignoring the incremental cap. */
  wakeAll(frames) {
    const f = frames || this.wakeFrames;
    this.nAwake = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) { this.inAwake[i] = 0; continue; }
      this._unpark(i);
      this.inAwake[i] = 1;
      this.framesLeft[i] = f;
      this.calmFrames[i] = 0;
      this.awakeList[this.nAwake++] = i;
    }
    return this.nAwake;
  }

  sleep(i) {
    if (i < 0 || !this.alive[i]) return;
    this._park(i);
  }

  /** Freeze the lot. The only guaranteed way back to zero cost. */
  sleepAll() {
    for (let k = 0; k < this.nAwake; k++) this._park(this.awakeList[k]);
    // A body can be parked without being in the list (place-then-sleep), so make
    // sure nothing dynamic is left behind.
    for (let i = 0; i < this.count; i++) {
      if (this.alive[i] && !this.parked[i]) this._park(i);
    }
    this.nAwake = 0;
    this.acc = 0;
  }

  /** v += impulse/m, and wake. How swipes, shakes and the wave wash get in. */
  applyImpulse(i, x, y, z) {
    const k = this.invM[i];
    if (!this.inAwake[i]) {
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      if (!this.wake(i)) return false;
    }
    this.vx[i] += x * k;
    this.vy[i] += y * k;
    this.vz[i] += z * k;
    this.clampSpeed(i);
    return true;
  }

  addVelocity(i, x, y, z) {
    if (!this.inAwake[i]) {
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      if (!this.wake(i)) return false;
    }
    this.vx[i] += x;
    this.vy[i] += y;
    this.vz[i] += z;
    this.clampSpeed(i);
    return true;
  }

  clampSpeed(i) {
    const m = this.maxSpeed;
    const x = this.vx[i], y = this.vy[i], z = this.vz[i];
    const s2 = x * x + y * y + z * z;
    if (s2 > m * m) {
      const f = m / Math.sqrt(s2);
      this.vx[i] = x * f; this.vy[i] = y * f; this.vz[i] = z * f;
    }
  }

  // --- the step ------------------------------------------------------------

  /**
   * Advance by real time. A frozen world drops the accumulated time on the floor
   * instead of banking it, so the first frame after a swipe is one step and not a
   * catch-up burst. (Same as lphys, and for the same reason.)
   */
  step(dt) {
    if (this.dead || this._stepping) return 0;
    if (!this.nAwake) { this.acc = 0; return 0; }
    const h = this.h;
    this.acc += dt;
    let n = 0;
    while (this.acc >= h && n < this.maxSubsteps && this.nAwake) {
      this.stepOnce();
      this.acc -= h;
      n++;
    }
    if (this.acc > h) this.acc = 0;
    return n;
  }

  /**
   * Exactly one fixed step. Used by the bake / settle loops.
   *
   * `_stepping` is the re-entrancy guard of rule 5: a step that arrives from inside
   * this one (a clampFn that called back, a build generator resumed by something the
   * step triggered) is dropped rather than allowed to hand the same wasm objects to
   * Rapier twice, which is an instant "unsafe aliasing" throw and a dead world. The
   * `finally` is what makes the flag safe even if the clamp throws.
   */
  stepOnce() {
    if (this.dead || this._stepping || !this.nAwake) return;
    this._stepping = true;
    try {
      this.stats.steps++;
      this._push();
      this.world.step();
      this._pull();
      if (this.clampFn) {
        this.clampFn(this);
        this._applyClamp();
      }
      this.compactAwake();
    } finally {
      this._stepping = false;
      if (this._deferred.length) this._flushDeferred();
    }
  }

  /** Structural work that arrived mid-step (see remove/clear/dispose). */
  _flushDeferred() {
    const q = this._deferred;
    for (let k = 0; k < q.length; k++) {
      try { q[k](); } catch (e) { /* one bad teardown must not strand the rest */ }
    }
    q.length = 0;
  }

  /**
   * Mirror -> Rapier, for the awake set. Anything the game wrote since the last
   * pull (a shake's velocities, a nudge, a hand-set spin) differs from the shadow
   * copy and is pushed in; everything else is skipped, so a step where the game
   * touched nothing costs three compares per body.
   */
  _push() {
    const list = this.awakeList, n = this.nAwake;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      const rb = this.rb[i];
      if (!rb || !this.alive[i]) continue;
      if (this.px[i] !== this.sx[i] || this.py[i] !== this.sy[i] || this.pz[i] !== this.sz[i]) {
        _w1.x = this.px[i]; _w1.y = this.py[i]; _w1.z = this.pz[i];
        rb.setTranslation(_w1, false);
        this.sx[i] = this.px[i]; this.sy[i] = this.py[i]; this.sz[i] = this.pz[i];
      }
      if (this.vx[i] !== this.svx[i] || this.vy[i] !== this.svy[i] || this.vz[i] !== this.svz[i]) {
        _w1.x = this.vx[i]; _w1.y = this.vy[i]; _w1.z = this.vz[i];
        rb.setLinvel(_w1, false);
        this.svx[i] = this.vx[i]; this.svy[i] = this.vy[i]; this.svz[i] = this.vz[i];
      }
      if (this.wx[i] !== this.swx[i] || this.wy[i] !== this.swy[i] || this.wz[i] !== this.swz[i]) {
        _w1.x = this.wx[i]; _w1.y = this.wy[i]; _w1.z = this.wz[i];
        rb.setAngvel(_w1, false);
        this.swx[i] = this.wx[i]; this.swy[i] = this.wy[i]; this.swz[i] = this.wz[i];
      }
      if (this.qx[i] !== this.sqx[i] || this.qy[i] !== this.sqy[i]
        || this.qz[i] !== this.sqz[i] || this.qw[i] !== this.sqw[i]) {
        _wq.x = this.qx[i]; _wq.y = this.qy[i]; _wq.z = this.qz[i]; _wq.w = this.qw[i];
        rb.setRotation(_wq, false);
        this.sqx[i] = this.qx[i]; this.sqy[i] = this.qy[i];
        this.sqz[i] = this.qz[i]; this.sqw[i] = this.qw[i];
      }
    }
  }

  /**
   * Rapier -> mirror, plus the sleep policy.
   *
   * `moved` is only set where the transform actually changed, which is what keeps a
   * parked-but-not-yet-quiet pile from uploading instance matrices every frame.
   * Parking follows three signals, any of which is enough: Rapier's own island
   * manager says the body has stopped, it has been calm for `sleepFrames`, or its
   * wake window has run out. The last one is the hard guarantee that the pile always
   * reaches zero cost.
   */
  _pull() {
    const list = this.awakeList, n = this.nAwake;
    const maxS = this.maxSpeed;
    const sleepV2 = this.sleepSpeed * this.sleepSpeed;
    const sleepW2 = this.sleepSpin * this.sleepSpin;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      const rb = this.rb[i];
      if (!rb || !this.alive[i] || !this.inAwake[i]) continue;

      const t = rb.translation(_t);
      const q = rb.rotation(_rq);
      const lv = rb.linvel(_lv);
      const av = rb.angvel(_av);

      this.ox[i] = this.px[i]; this.oy[i] = this.py[i]; this.oz[i] = this.pz[i];
      if (t.x !== this.px[i] || t.y !== this.py[i] || t.z !== this.pz[i]
        || q.x !== this.qx[i] || q.y !== this.qy[i] || q.z !== this.qz[i] || q.w !== this.qw[i]) {
        this.moved[i] = 1;
      }
      this.px[i] = this.sx[i] = t.x;
      this.py[i] = this.sy[i] = t.y;
      this.pz[i] = this.sz[i] = t.z;
      this.qx[i] = this.sqx[i] = q.x;
      this.qy[i] = this.sqy[i] = q.y;
      this.qz[i] = this.sqz[i] = q.z;
      this.qw[i] = this.sqw[i] = q.w;

      let vx = lv.x, vy = lv.y, vz = lv.z;
      let s2 = vx * vx + vy * vy + vz * vz;
      if (s2 > maxS * maxS) {
        // A stone that has been squeezed out of a pile can leave at any speed the
        // solver likes. The cap is the same insurance lphys carries.
        const f = maxS / Math.sqrt(s2);
        vx *= f; vy *= f; vz *= f;
        s2 = maxS * maxS;
        _w1.x = vx; _w1.y = vy; _w1.z = vz;
        rb.setLinvel(_w1, false);
      }
      this.vx[i] = this.svx[i] = vx;
      this.vy[i] = this.svy[i] = vy;
      this.vz[i] = this.svz[i] = vz;
      this.wx[i] = this.swx[i] = av.x;
      this.wy[i] = this.swy[i] = av.y;
      this.wz[i] = this.swz[i] = av.z;
      const spin2 = av.x * av.x + av.y * av.y + av.z * av.z;

      if (rb.isSleeping()) { this._park(i); continue; }
      if (s2 < sleepV2 && spin2 < sleepW2) {
        if (++this.calmFrames[i] >= this.sleepFrames) { this._park(i); continue; }
      } else {
        this.calmFrames[i] = 0;
      }
      if (--this.framesLeft[i] <= 0) this._park(i);
    }
  }

  /**
   * The consumer's clamp wrote positions straight into the arrays. Push those back
   * and cancel the velocity along whichever axes it moved — which is exactly what a
   * wall contact would have left behind, and is how lphys gets the same result for
   * free (it derives velocity from the position delta).
   *
   * `wakeUp: false` throughout: a clamped body must not have its sleep timer reset,
   * or a piece of glass resting against the inside of a jar would keep the whole
   * world awake for ever.
   */
  _applyClamp() {
    const list = this.awakeList, n = this.nAwake;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      const rb = this.rb[i];
      if (!rb || !this.alive[i] || this.parked[i]) continue;
      const dx = this.px[i] !== this.sx[i];
      const dy = this.py[i] !== this.sy[i];
      const dz = this.pz[i] !== this.sz[i];
      if (!dx && !dy && !dz) continue;
      _w1.x = this.px[i]; _w1.y = this.py[i]; _w1.z = this.pz[i];
      rb.setTranslation(_w1, false);
      this.sx[i] = this.px[i]; this.sy[i] = this.py[i]; this.sz[i] = this.pz[i];
      if (dx) this.vx[i] = 0;
      if (dy) this.vy[i] = 0;
      if (dz) this.vz[i] = 0;
      _w1.x = this.vx[i]; _w1.y = this.vy[i]; _w1.z = this.vz[i];
      rb.setLinvel(_w1, false);
      this.svx[i] = this.vx[i]; this.svy[i] = this.vy[i]; this.svz[i] = this.vz[i];
      this.moved[i] = 1;
    }
  }

  /** Drop everything that has been parked (or died) out of the awake list. */
  compactAwake() {
    const list = this.awakeList, inAwake = this.inAwake, alive = this.alive;
    let w = 0;
    for (let k = 0; k < this.nAwake; k++) {
      const i = list[k];
      if (inAwake[i] && alive[i]) list[w++] = i;
    }
    this.nAwake = w;
    if (!w) this.acc = 0;
  }

  // --- queries -------------------------------------------------------------

  /**
   * First body along a ray. Returns { i, toi } or null. Nothing in the game needs
   * it today (tap-to-collect raycasts the MESHES, through three), but it is part of
   * the backend surface and lphys answers it too, so a future caller cannot end up
   * engine-specific.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxToi) {
    // A query is a mutable borrow of the same wasm objects the solver is holding, so
    // it must never happen from inside a step (rule 5) or after dispose (rule 4).
    if (this.dead || this._stepping) return null;
    const R = this.R;
    if (!this._ray) this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this._ray.origin.x = ox; this._ray.origin.y = oy; this._ray.origin.z = oz;
    this._ray.dir.x = dx; this._ray.dir.y = dy; this._ray.dir.z = dz;
    const hit = this.world.castRay(this._ray, maxToi === undefined ? 100 : maxToi, true);
    if (!hit) return null;
    let i = NEG;
    try {
      const parent = hit.collider.parent();
      const ud = parent ? parent.userData : NEG;
      if (typeof ud === 'number') i = ud;
    } catch (e) { /* static hit */ }
    const toi = hit.timeOfImpact === undefined ? hit.toi : hit.timeOfImpact;
    return { i, toi };
  }
}
