// lphys — the game's own lightweight 3D physics.
//
// This replaces Rapier (and, before it, cannon-es). It is NOT a rigid-body
// solver: there are no contact manifolds, no islands, no friction/restitution
// coefficients, no angular momentum and no wasm. It is a position-based
// relaxation (PBD-style) integrator over spheres, which is all this game has ever
// actually needed — a bed of pebbles you rake with a finger, and glass tumbling in
// a jar.
//
// The three things that make it cheap (see docs/.plans/sea-glass-lite-physics):
//
//   1. AWAKE SET ONLY. Everything is FROZEN by default. `step()` walks a list of
//      awake indices and nothing else; a settled pile costs literally zero. A
//      swipe wakes only what it touched (`maxAwake` caps that), those particles
//      run for a few dozen frames and re-freeze.
//   2. NO IDLE WORK. When `nAwake === 0` the step returns before it even rebuilds
//      the spatial hash, and the `moved` flags stay clear so no consumer uploads
//      an instance matrix.
//   3. ZERO ALLOCATION IN THE LOOP. Structure-of-arrays typed buffers, all
//      scratch is plain numbers in locals. Nothing in step/relax/finish allocates,
//      so there is no GC stutter — which on a tablet is the difference between
//      "smooth" and "hitches every couple of seconds".
//
// One step, per awake particle:
//   integrate (gravity, predict position)
//   -> `passes` x sphere-vs-sphere separation via a 3D spatial hash
//   -> the consumer's clamp (pit rim / jar wall — see physics.js, collection.js)
//   -> velocity derived from the position delta, damped
//   -> rotation (fake roll from velocity, or integrated spin)
//   -> sleep test
//
// Deriving velocity from the position delta is what makes the pile stable: a
// resting stone's separation correction exactly cancels its gravity step, so its
// velocity comes out as zero rather than as an impulse to bounce on. Nothing is
// ever pushed back into a constraint.

/** Rotation follows the velocity (a pebble rolling). No torque, no spin state. */
export const MODE_ROLL = 0;
/** Rotation is an integrated angular velocity (a shard tumbling). */
export const MODE_SPIN = 1;

const NEG = -1;

export class World {
  constructor(opts = {}) {
    const cap = this.capacity = opts.capacity || 128;

    // --- which backend this is ---------------------------------------------
    // The game runs two: this one on the Low profile, and a Rapier rigid-body
    // world (js/rphys.js) on High. They share this whole surface, so nothing in the
    // game branches on the name — see js/phys.js.
    /** @type {'lphys'} */
    this.engine = 'lphys';
    /**
     * FALSE: there are no static colliders here at all. The pit floor, the rim and
     * the jar walls ARE the consumer's clamp (see clampFn), which in a
     * position-based scheme is a complete collision response and not a cheat.
     * The Rapier backend sets this true, where the clamp is only a safety net.
     */
    this.hardWalls = false;

    // --- state (SoA) -------------------------------------------------------
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.pz = new Float32Array(cap);
    // Position at the start of the step: the velocity is (p - o) / h.
    this.ox = new Float32Array(cap);
    this.oy = new Float32Array(cap);
    this.oz = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.qx = new Float32Array(cap);
    this.qy = new Float32Array(cap);
    this.qz = new Float32Array(cap);
    this.qw = new Float32Array(cap);
    // Angular velocity: only read for MODE_SPIN particles.
    this.wx = new Float32Array(cap);
    this.wy = new Float32Array(cap);
    this.wz = new Float32Array(cap);
    this.r = new Float32Array(cap);        // collision radius
    this.invM = new Float32Array(cap);
    this.alive = new Uint8Array(cap);
    this.mode = new Uint8Array(cap);
    this.tag = new Uint8Array(cap);        // consumer's own kind flag
    /** Set whenever a transform changed. The consumer clears it after syncing. */
    this.moved = new Uint8Array(cap);

    // --- the awake set -----------------------------------------------------
    this.awakeList = new Int32Array(cap);
    this.inAwake = new Uint8Array(cap);
    this.framesLeft = new Int16Array(cap);
    this.calmFrames = new Int16Array(cap);
    this.nAwake = 0;

    this.count = 0;                        // high-water mark of used slots
    this.nAlive = 0;
    this.freeList = new Int32Array(cap);
    this.nFree = 0;

    // --- integration knobs -------------------------------------------------
    this.gx = 0;
    this.gy = opts.gravity === undefined ? -9.82 : opts.gravity;
    this.gz = 0;
    this.h = 1 / (opts.stepHz || 60);
    this.maxSubsteps = opts.maxSubsteps || 2;
    this.passes = opts.passes || 2;
    this.damping = opts.damping === undefined ? 0.92 : opts.damping;
    this.spinDamping = opts.spinDamping === undefined ? 0.9 : opts.spinDamping;
    this.rollK = opts.rollK === undefined ? 1 : opts.rollK;
    this.maxSpeed = opts.maxSpeed || 6;
    this.acc = 0;

    // --- sleep / wake knobs ------------------------------------------------
    this.maxAwake = opts.maxAwake || cap;
    this.wakeFrames = opts.wakeFrames || 80;
    this.sleepSpeed = opts.sleepSpeed === undefined ? 0.07 : opts.sleepSpeed;
    this.sleepSpin = opts.sleepSpin === undefined ? 0.5 : opts.sleepSpin;
    this.sleepFrames = opts.sleepFrames || 5;
    /** How deep a frozen neighbour has to be pushed before it wakes too. */
    this.wakePenFrac = opts.wakePenFrac === undefined ? 0.3 : opts.wakePenFrac;

    /** Called once per step, after separation: the consumer's containment. */
    this.clampFn = null;

    // --- spatial hash ------------------------------------------------------
    // Buckets are a linked list per cell (head + next), so a rebuild is one O(N)
    // pass with no prefix sums. A generation stamp per bucket means the heads
    // never have to be cleared either.
    let table = 64;
    while (table < cap * 4) table *= 2;
    this.tableMask = table - 1;
    this.head = new Int32Array(table);
    this.stamp = new Int32Array(table);
    this.next = new Int32Array(cap);
    this.gen = 0;
    this.cell = opts.cell || 0.25;
    this.invCell = 1 / this.cell;

    this.stats = { steps: 0, pairs: 0, corrections: 0 };
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Add a sphere. `mass` 0 means immovable. Returns its index, which the caller
   * keeps: indices are stable for the particle's whole life (they are recycled
   * only after `remove`), so instance slots can be keyed off them.
   */
  add(o) {
    let i;
    if (this.nFree > 0) i = this.freeList[--this.nFree];
    else if (this.count < this.capacity) i = this.count++;
    else return NEG;

    const x = o.x || 0, y = o.y || 0, z = o.z || 0;
    this.px[i] = this.ox[i] = x;
    this.py[i] = this.oy[i] = y;
    this.pz[i] = this.oz[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.wx[i] = this.wy[i] = this.wz[i] = 0;
    this.qx[i] = this.qy[i] = this.qz[i] = 0;
    this.qw[i] = 1;
    this.r[i] = o.r || 0.05;
    const m = o.mass === undefined ? 1 : o.mass;
    this.invM[i] = m > 0 ? 1 / m : 0;
    this.mode[i] = o.mode || MODE_ROLL;
    this.tag[i] = o.tag || 0;
    this.alive[i] = 1;
    this.moved[i] = 1;
    this.inAwake[i] = 0;
    this.framesLeft[i] = 0;
    this.calmFrames[i] = 0;
    this.nAlive++;
    return i;
  }

  remove(i) {
    if (i < 0 || !this.alive[i]) return;
    if (this.inAwake[i]) this.inAwake[i] = 0;   // dropped by the next compaction
    this.alive[i] = 0;
    this.moved[i] = 0;
    this.nAlive--;
    if (this.nFree < this.capacity) this.freeList[this.nFree++] = i;
  }

  clear() {
    this.alive.fill(0);
    this.inAwake.fill(0);
    this.moved.fill(0);
    this.nAwake = 0;
    this.nAlive = 0;
    this.count = 0;
    this.nFree = 0;
    this.acc = 0;
  }

  /**
   * A fixed box. There is nothing to do here — this world's containment is the
   * consumer's position clamp — but the Rapier backend needs real static geometry,
   * so both backends answer the call and neither consumer has to know which it has.
   */
  addStaticBox(x, y, z, hx, hy, hz) { return -1; }
  clearStatics() { }

  /** Nothing to release: no wasm, no external allocation. */
  dispose() { }

  /** Cell size must be at least the largest DIAMETER, or pairs get missed. */
  setCellFromMaxRadius(maxR) {
    this.cell = Math.max(0.02, maxR * 2.05);
    this.invCell = 1 / this.cell;
  }

  setGravity(x, y, z) { this.gx = x; this.gy = y; this.gz = z; }
  setStepHz(hz) { this.h = 1 / hz; }
  stepHz() { return Math.round(1 / this.h); }
  resetClock() { this.acc = 0; }

  // --- transforms (used by spawn / teleport paths, never per-frame) ---------

  /** Teleport: also resets the previous position, so no velocity is inferred. */
  place(i, x, y, z) {
    this.px[i] = this.ox[i] = x;
    this.py[i] = this.oy[i] = y;
    this.pz[i] = this.oz[i] = z;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.moved[i] = 1;
  }

  setQuat(i, x, y, z, w) {
    this.qx[i] = x; this.qy[i] = y; this.qz[i] = z; this.qw[i] = w;
    this.moved[i] = 1;
  }

  /** XYZ-order Euler, matching what the old bodies took. */
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

  setMass(i, m) { this.invM[i] = m > 0 ? 1 / m : 0; }
  mass(i) { return this.invM[i] > 0 ? 1 / this.invM[i] : 0; }

  speed(i) {
    const x = this.vx[i], y = this.vy[i], z = this.vz[i];
    return Math.sqrt(x * x + y * y + z * z);
  }

  /**
   * First body along a ray: { i, toi } or null. Analytic ray-vs-sphere over the live
   * set — N is a few hundred and nothing in the game calls this per frame (tap
   * collection raycasts the MESHES, through three). It exists because the Rapier
   * backend can answer it, and a backend surface with holes in it is how call sites
   * end up engine-specific.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxToi) {
    const limit = maxToi === undefined ? 100 : maxToi;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ux = dx / l, uy = dy / l, uz = dz / l;
    let best = -1, bestT = limit;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const mx = this.px[i] - ox, my = this.py[i] - oy, mz = this.pz[i] - oz;
      const proj = mx * ux + my * uy + mz * uz;
      if (proj < 0) continue;                     // behind the origin
      const d2 = mx * mx + my * my + mz * mz - proj * proj;
      const rr = this.r[i] * this.r[i];
      if (d2 > rr) continue;
      const t = proj - Math.sqrt(rr - d2);
      if (t >= 0 && t < bestT) { bestT = t; best = i; }
    }
    return best < 0 ? null : { i: best, toi: bestT };
  }

  // --- wake / sleep --------------------------------------------------------

  isAwake(i) { return !!this.inAwake[i]; }
  awakeCount() { return this.nAwake; }
  aliveCount() { return this.nAlive; }

  /**
   * Wake a particle for `frames` steps. Returns false if the awake cap is
   * already reached — that cap is the whole reason a fast swipe across a full
   * pit cannot cost more than a slow one.
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
      this.inAwake[i] = 1;
      this.framesLeft[i] = f;
      this.calmFrames[i] = 0;
      this.awakeList[this.nAwake++] = i;
    }
    return this.nAwake;
  }

  sleep(i) {
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.wx[i] = this.wy[i] = this.wz[i] = 0;
    this.inAwake[i] = 0;
    this.framesLeft[i] = 0;
    this.calmFrames[i] = 0;
  }

  /** Freeze the lot. The only guaranteed way back to zero cost. */
  sleepAll() {
    for (let k = 0; k < this.nAwake; k++) this.sleep(this.awakeList[k]);
    this.nAwake = 0;
    this.acc = 0;
  }

  /** v += impulse/m, and wake. This is how swipes and shakes get in. */
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
   * catch-up burst.
   */
  step(dt) {
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

  /** Exactly one fixed step. Used by the bake / settle loops. */
  stepOnce() {
    if (!this.nAwake) return;
    this.stats.steps++;
    this.rebuildHash();
    this.integrate();
    for (let p = 0; p < this.passes; p++) this.separate();
    if (this.clampFn) this.clampFn(this);
    this.finish();
    this.compactAwake();
  }

  /**
   * Rehash every LIVE particle (not just the awake ones): a woken stone has to
   * find the frozen ones it is resting against. One pass over a couple of hundred
   * slots, and only when something is awake.
   */
  rebuildHash() {
    const gen = ++this.gen;
    const mask = this.tableMask, inv = this.invCell;
    const head = this.head, stamp = this.stamp, next = this.next;
    const px = this.px, py = this.py, pz = this.pz, alive = this.alive;
    for (let i = 0; i < this.count; i++) {
      if (!alive[i]) continue;
      const cx = Math.floor(px[i] * inv);
      const cy = Math.floor(py[i] * inv);
      const cz = Math.floor(pz[i] * inv);
      const b = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)
        ^ Math.imul(cz, 83492791)) & mask;
      if (stamp[b] !== gen) { stamp[b] = gen; head[b] = NEG; }
      next[i] = head[b];
      head[b] = i;
    }
  }

  integrate() {
    const h = this.h;
    const gx = this.gx * h, gy = this.gy * h, gz = this.gz * h;
    const list = this.awakeList, n = this.nAwake;
    const px = this.px, py = this.py, pz = this.pz;
    const ox = this.ox, oy = this.oy, oz = this.oz;
    const vx = this.vx, vy = this.vy, vz = this.vz;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
      if (this.invM[i] > 0) {
        vx[i] += gx; vy[i] += gy; vz[i] += gz;
      }
      px[i] += vx[i] * h;
      py[i] += vy[i] * h;
      pz[i] += vz[i] * h;
    }
  }

  /**
   * One relaxation pass: push overlapping spheres apart along their centre line,
   * split by inverse mass. Frozen neighbours are treated as immovable (they are
   * the settled pile), but a deep push wakes them, which is how a rake ripples
   * outwards a stone or two beyond the finger without waking the whole beach.
   */
  separate() {
    const list = this.awakeList, n = this.nAwake;
    const px = this.px, py = this.py, pz = this.pz, r = this.r, invM = this.invM;
    const head = this.head, stamp = this.stamp, next = this.next, alive = this.alive;
    const inAwake = this.inAwake, moved = this.moved;
    const mask = this.tableMask, inv = this.invCell, gen = this.gen;
    const wakePen = this.wakePenFrac;

    for (let k = 0; k < n; k++) {
      const i = list[k];
      if (!alive[i]) continue;
      const wi = invM[i];
      if (wi <= 0) continue;                     // immovable: nothing to correct
      // Held in locals and written back as they change, so the next neighbour in
      // the same pass sees the corrected position (Gauss-Seidel, which converges
      // far faster than accumulating deltas would).
      let xi = px[i], yi = py[i], zi = pz[i];
      const ri = r[i];
      const cx = Math.floor(xi * inv), cy = Math.floor(yi * inv), cz = Math.floor(zi * inv);
      for (let ax = cx - 1; ax <= cx + 1; ax++) {
        for (let ay = cy - 1; ay <= cy + 1; ay++) {
          for (let az = cz - 1; az <= cz + 1; az++) {
            const b = (Math.imul(ax, 73856093) ^ Math.imul(ay, 19349663)
              ^ Math.imul(az, 83492791)) & mask;
            if (stamp[b] !== gen) continue;
            for (let j = head[b]; j !== NEG; j = next[j]) {
              if (j === i || !alive[j]) continue;
              // Awake/awake pairs are handled once, from the lower index, so the
              // correction is not applied twice.
              const jAwake = inAwake[j];
              if (jAwake && j < i) continue;
              const rs = ri + r[j];
              const dx = px[j] - xi, dy = py[j] - yi, dz = pz[j] - zi;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= rs * rs) continue;
              let d = Math.sqrt(d2);
              let nx, ny, nz;
              if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; }
              else {
                // Exactly coincident: pick a deterministic axis rather than NaN.
                nx = 0; ny = 1; nz = 0; d = 0;
              }
              const pen = rs - d;
              const wj = jAwake ? invM[j] : 0;
              const wsum = wi + wj;
              const ci = pen * (wi / wsum);
              xi -= nx * ci; yi -= ny * ci; zi -= nz * ci;
              if (wj > 0) {
                const cj = pen * (wj / wsum);
                px[j] += nx * cj; py[j] += ny * cj; pz[j] += nz * cj;
                moved[j] = 1;
              } else if (pen > rs * wakePen) {
                // Shoved hard by a woken neighbour: join the awake set (subject
                // to the cap) so the disturbance can spread a little.
                this.wake(j, this.wakeFrames);
              }
            }
          }
        }
      }
      if (xi !== px[i] || yi !== py[i] || zi !== pz[i]) {
        px[i] = xi; py[i] = yi; pz[i] = zi;
        moved[i] = 1;
      }
    }
  }

  /**
   * Velocity from the position delta, damped; then rotation; then the sleep test.
   */
  finish() {
    const h = this.h, invH = 1 / h, damp = this.damping, spinDamp = this.spinDamping;
    const list = this.awakeList, n = this.nAwake;
    const px = this.px, py = this.py, pz = this.pz;
    const ox = this.ox, oy = this.oy, oz = this.oz;
    const vx = this.vx, vy = this.vy, vz = this.vz;
    const wx = this.wx, wy = this.wy, wz = this.wz;
    const qx = this.qx, qy = this.qy, qz = this.qz, qw = this.qw;
    const sleepV = this.sleepSpeed, sleepW = this.sleepSpin;
    const rollK = this.rollK, maxS = this.maxSpeed;

    for (let k = 0; k < n; k++) {
      const i = list[k];
      if (!this.alive[i] || !this.inAwake[i]) continue;
      const dx = px[i] - ox[i], dy = py[i] - oy[i], dz = pz[i] - oz[i];
      let sx = dx * invH * damp, sy = dy * invH * damp, sz = dz * invH * damp;
      let s2 = sx * sx + sy * sy + sz * sz;
      if (s2 > maxS * maxS) {
        const f = maxS / Math.sqrt(s2);
        sx *= f; sy *= f; sz *= f;
        s2 = maxS * maxS;
      }
      vx[i] = sx; vy[i] = sy; vz[i] = sz;
      if (dx || dy || dz) this.moved[i] = 1;

      let spin2 = 0;
      if (this.mode[i] === MODE_ROLL) {
        // Fake roll: turn about the axis perpendicular to the horizontal travel,
        // by the angle a sphere of this radius would have rolled. No torque, no
        // angular state, and visually indistinguishable in a bed of shingle.
        const hx = dx, hz = dz;
        const hl = Math.sqrt(hx * hx + hz * hz);
        if (hl > 1e-5) {
          const ang = (hl / Math.max(0.01, this.r[i])) * rollK;
          if (ang > 1e-4) this._spinQuat(i, -hz / hl, 0, hx / hl, ang);
        }
      } else {
        wx[i] *= spinDamp; wy[i] *= spinDamp; wz[i] *= spinDamp;
        const ax = wx[i], ay = wy[i], az = wz[i];
        spin2 = ax * ax + ay * ay + az * az;
        if (spin2 > 1e-8) {
          const l = Math.sqrt(spin2);
          this._spinQuat(i, ax / l, ay / l, az / l, l * h);
        }
      }

      // Sleep test: barely moving, and not spinning. Plus a hard deadline, so
      // however long a heap wants to argue with itself it always reaches zero.
      if (s2 < sleepV * sleepV && spin2 < sleepW * sleepW) {
        if (++this.calmFrames[i] >= this.sleepFrames) { this.sleep(i); continue; }
      } else {
        this.calmFrames[i] = 0;
      }
      if (--this.framesLeft[i] <= 0) this.sleep(i);
    }
    // Keep the derived quaternions unit-length; drift shows up as a squashed
    // stone after a few thousand rolls.
    for (let k = 0; k < n; k++) {
      const i = list[k];
      const a = qx[i], b = qy[i], c = qz[i], d = qw[i];
      const l2 = a * a + b * b + c * c + d * d;
      if (l2 > 1.0001 || l2 < 0.9999) {
        const f = 1 / Math.sqrt(l2);
        qx[i] = a * f; qy[i] = b * f; qz[i] = c * f; qw[i] = d * f;
      }
    }
  }

  /** q = delta(axis, angle) * q. Plain numbers: no Quaternion object involved. */
  _spinQuat(i, ax, ay, az, ang) {
    const s = Math.sin(ang * 0.5), c = Math.cos(ang * 0.5);
    const bx = ax * s, by = ay * s, bz = az * s, bw = c;
    const x = this.qx[i], y = this.qy[i], z = this.qz[i], w = this.qw[i];
    this.qx[i] = bw * x + bx * w + by * z - bz * y;
    this.qy[i] = bw * y - bx * z + by * w + bz * x;
    this.qz[i] = bw * z + bx * y - by * x + bz * w;
    this.qw[i] = bw * w - bx * x - by * y - bz * z;
    this.moved[i] = 1;
  }

  /** Drop everything that fell asleep (or died) out of the awake list. */
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
}

/**
 * A per-body object view over the SoA, for the places where a handful of bodies
 * is handled as objects (the finds, the jar pieces). Created once per body at
 * spawn, so nothing here allocates per frame — the hot loops (the pebble pile,
 * the containment clamps, the instance sync) all read the typed arrays directly.
 */
class Vec3View {
  constructor(w, i, ax, ay, az) { this.w = w; this.i = i; this.ax = ax; this.ay = ay; this.az = az; }
  get x() { return this.ax[this.i]; }
  set x(v) { this.ax[this.i] = v; this.w.moved[this.i] = 1; }
  get y() { return this.ay[this.i]; }
  set y(v) { this.ay[this.i] = v; this.w.moved[this.i] = 1; }
  get z() { return this.az[this.i]; }
  set z(v) { this.az[this.i] = v; this.w.moved[this.i] = 1; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setZero() { return this.set(0, 0, 0); }
  length() { const x = this.x, y = this.y, z = this.z; return Math.sqrt(x * x + y * y + z * z); }
}

/** A cannon/Rapier-shaped handle onto one particle. */
export class Body {
  constructor(world, i) {
    this.world = world;
    this.i = i;
    this.position = new Vec3View(world, i, world.px, world.py, world.pz);
    this.velocity = new Vec3View(world, i, world.vx, world.vy, world.vz);
    this.angularVelocity = new Vec3View(world, i, world.wx, world.wy, world.wz);
    this.quaternion = {
      set: (x, y, z, w) => { world.setQuat(i, x, y, z, w); },
      setFromEuler: (ex, ey, ez) => { world.setEuler(i, ex, ey, ez); },
      get x() { return world.qx[i]; },
      get y() { return world.qy[i]; },
      get z() { return world.qz[i]; },
      get w() { return world.qw[i]; },
    };
  }

  get frozen() { return !this.world.inAwake[this.i]; }
  isSleeping() { return this.frozen; }
  get mass() { return this.world.mass(this.i); }
  set mass(m) { this.world.setMass(this.i, m); }
  updateMassProperties() { /* nothing to recompute */ }
  /** Kept so old call sites read the same; the SoA views flag `moved` already. */
  markDirty() { this.world.moved[this.i] = 1; }
  /** There is no contact skin and no CCD to configure any more. */
  setStability() { }
  applyImpulse(x, y, z) { this.world.applyImpulse(this.i, x, y, z); }
  wakeUp(frames) { this.world.wake(this.i, frames); this.world.moved[this.i] = 1; }
  sleep() { this.world.sleep(this.i); }
  place(x, y, z) { this.world.place(this.i, x, y, z); }
}
