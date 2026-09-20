/* player.js — character_controller.gd and character_fall.gd.
 *
 * Everything the states share: where the skater is, which way is up, which rail
 * is nearest, the balance angle, and the handful of geometric questions
 * ("can I grind this?", "am I over the lip of a pipe?") whose answers decide
 * every transition.
 *
 * The body is a bare Object3D. Its +Z is forward and its +Y is up — the same
 * convention Godot's controller used, so the ported lines keep their signs.
 */
import * as THREE from 'three';
import { STATS, G, P } from './config.js';
import {
  forwardVelocity, horizontalVelocity, alignUp, landedPerpendicular
} from './physics.js';
import { closestPath } from './paths.js';

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _t4 = new THREE.Vector3();
/* _pathDir is called with vectors that already live in _t1..._t4, so it keeps
   its own scratch — sharing one silently overwrote the tangent it was given. */
const _pd = new THREE.Vector3();

/* --------------------------------------------------- character_fall.gd */
export const Fall = {
  /**
   * Endless mode: nothing you do ends a run.
   *
   * Every way of coming off the board funnels through this object, so one flag
   * here covers all of them rather than a check scattered through the state
   * machine. Losing your balance on a rail or a lip stops counting, and so
   * does landing sideways.
   *
   * Falling out of the park is deliberately NOT included. That is not a bail
   * you can avoid by skating better — it is the floor of the Warehouse having
   * a hole in it — and switching it off would leave the skater dropping
   * through nothing for ever with no way back. It still puts you on your feet.
   */
  forgiving: false,

  balance(angle, threshold = STATS.balance_threshold) {
    if (this.forgiving) return false;
    return Math.abs(angle) > Math.PI / threshold;
  },
  /* set from the park's own bounding box at boot; P.RESPAWN_Y is the fallback */
  floorY: P.RESPAWN_Y,
  outOfBounds(pos) { return pos.y < this.floorY; },
  faceplant(fwdHits, up) {
    if (this.forgiving) return false;
    for (const h of fwdHits) {
      if (h.group === 'floor' || h.group === 'pipe') {
        if (h.normal.dot(up) < 0.75) return true;
      }
    }
    return false;
  },
  landedPerpendicular(body, velocity, up) {
    if (this.forgiving) return false;
    const fwdVel = forwardVelocity(velocity, up, _t1);
    if (fwdVel.length() <= G.PERPENDICULAR_FALL_THRESHOLD) return false;
    const fwd = _t2.setFromMatrixColumn(body.matrixWorld, 2);
    return !landedPerpendicular(fwdVel, fwd, G.FLOOR_FALL_THRESHOLD).valid;
  }
};

export class CharacterController {
  constructor(world, paths, input, anim, tricks) {
    this.world = world;
    this.paths = paths;
    this.input = input;
    this.anim = anim;
    this.tricks = tricks;

    this.body = new THREE.Object3D();
    this.velocity = new THREE.Vector3();
    this.up_direction = new THREE.Vector3(0, 1, 0);
    this.last_up_dir = new THREE.Vector3(0, 1, 0);
    this.last_vel = new THREE.Vector3();

    this.last_ground = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    this.fall_timer = 0;
    this.standing_timer = G.STANDING_TIMER;

    this.shape_col_ground = null;
    this.shape_col_fwd = [];
    this.groundEnabled = true;      // reset_shapecast

    /* rails */
    this.path = null;
    this.lip_ask_mark = 0;
    /* seconds left of "he came UP this face", which is what tells the camera a
       transition apart from a hill. See Pipe.physics. */
    this.pipe_climb = 0;
    /* seconds left of "he asked to grind". See Ground.grindLipCheck. */
    this.grind_ask = 0;
    this.path_offset = 0;
    this.path_vel = 0;
    this.path_dir = 0;
    this.path_closed = false;
    this.curve_tangent = new THREE.Vector3();
    this.curve_snap = new THREE.Vector3();
    this.revert_path = false;

    /* balance */
    this.balance_time = 1.0;
    this.balance_angle = 0.0;
    this.balance_dir = 0;

    /* lip */
    this.lip_start_pos = new THREE.Vector3();
    this.lip_start_up = new THREE.Vector3(0, 1, 0);
    this.lip_start_dir = new THREE.Vector3();

    this.hud = null;
    this.onBail = null;
    this.onSwitch = null;
    this.switch_timer = 0;
    this.popped = false;   // did we LEAVE the ground on purpose? (see Air.enter)
    /* the last horizontal direction you were genuinely travelling in. Snapped
       to the transition of a quarter pipe your horizontal speed falls to nearly
       zero and the body's own forward axis tips towards vertical, so neither is
       any use as "the way I am going" at the moment you leave the lip. */
    this.ride_dir = new THREE.Vector3(0, 0, 1);

    /* Where to DRAW the skater, which is not where the physics has him.
     *
     * Physics runs on a fixed 60 Hz step and the screen does not: at 120 Hz
     * half of all frames get no step at all and the skater is drawn twice in
     * the same place, then jumps; at 60 Hz an imperfect frame clock gives an
     * occasional double step. Either way it reads as judder. So each step
     * remembers where the body was, and the frame draws somewhere between the
     * last step and this one. */
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
  }

  /** Called immediately before every fixed physics step. */
  beginStep() {
    this.prevPos.copy(this.body.position);
    this.prevQuat.copy(this.body.quaternion);
  }

  /** A jump that is not movement — a spawn, a respawn — must not be smeared. */
  markTeleport() {
    this.prevPos.copy(this.body.position);
    this.prevQuat.copy(this.body.quaternion);
    this.renderPos.copy(this.body.position);
    this.renderQuat.copy(this.body.quaternion);
  }

  /**
   * @param {number} alpha 0..1 through the step the frame landed in.
   * Anything further than a step's worth of real travel is a teleport that got
   * past markTeleport, and is drawn where it actually is rather than smeared.
   */
  setRenderAlpha(alpha) {
    if (this.prevPos.distanceToSquared(this.body.position) > 4) {
      this.renderPos.copy(this.body.position);
      this.renderQuat.copy(this.body.quaternion);
      return;
    }
    this.renderPos.copy(this.prevPos).lerp(this.body.position, alpha);
    this.renderQuat.copy(this.prevQuat).slerp(this.body.quaternion, alpha);
  }

  get position() { return this.body.position; }

  /* --- transform helpers, standing in for Godot's basis accessors --- */
  axisX(out = _t1) { return out.setFromMatrixColumn(this.body.matrixWorld, 0); }
  axisY(out = _t2) { return out.setFromMatrixColumn(this.body.matrixWorld, 1); }
  axisZ(out = _t3) { return out.setFromMatrixColumn(this.body.matrixWorld, 2); }
  sync() { this.body.updateMatrixWorld(true); }

  setStartTransform(pos, heading) {
    this.body.position.copy(pos);
    this.body.quaternion.identity();
    this.body.rotateY(heading);
    this.up_direction.set(0, 1, 0);
    this.velocity.set(0, 0, 0);
    this.sync();
    this.storeGround();
    this.markTeleport();
  }

  storeGround() {
    this.last_ground.position.copy(this.body.position);
    this.last_ground.quaternion.copy(this.body.quaternion);
  }

  /* character_controller.gd::surface_check */
  surfaceCheck(isAir = true, isGrind = false) {
    const speed = this.velocity.length();
    const moveClamp = Math.min(speed, 0.5);
    const fwd = _t4;
    if (isGrind) fwd.copy(this.curve_tangent).multiplyScalar(-this.path_dir * moveClamp);
    else horizontalVelocity(this.velocity, fwd).normalize().multiplyScalar(moveClamp);

    this.shape_col_ground = null;
    if (this.input.canJump() && this.groundEnabled) {
      const rayDist = (isAir ? G.RAY_GROUND_DIST : G.RAY_GROUND_AIR_DIST) + P.SHAPE_RADIUS;
      const lift = 0.05;
      const from = _t1.copy(this.body.position).addScaledVector(this.axisY(_t2), lift);
      const dir = _t3.copy(this.axisY(_t2)).multiplyScalar(-1);
      const hit = this.world.probe(from, dir, lift + rayDist);
      if (hit) {
        const dot = hit.normal.dot(this.up_direction);
        if (hit.group !== 'wall' && dot >= G.SHAPE_COL_DOT) this.shape_col_ground = hit;
      }
    }

    if (fwd.lengthSq() > 1e-6) {
      this.shape_col_fwd = this.world.sweepForward(
        this.body.position, _t1.copy(fwd).normalize(), this.up_direction,
        P.FWD_PROBE * G.SHAPE_CAST_OFFSET_MULTIPLIER * 2);
    } else this.shape_col_fwd = [];
  }

  /* character_controller.gd::set_char_up_direction */
  setCharUpDirection() {
    if (this.shape_col_ground) {
      if (this.shape_col_ground.group === 'wall') return;
      this.up_direction.copy(this.shape_col_ground.normal);
    } else {
      this.up_direction.copy(this.last_up_dir);
    }
  }

  /** Called each tick while riding; ignores the near-vertical crawl up a ramp. */
  noteRideDir() {
    const h = horizontalVelocity(this.velocity, _t1);
    if (h.lengthSq() > 1.0) this.ride_dir.copy(h.normalize());
  }

  setPreviousValues() {
    this.last_up_dir.copy(this.up_direction);
    this.last_vel.copy(this.velocity);
  }

  setUpAlignment() { alignUp(this.body, this.up_direction); }

  /* move_and_slide + apply_floor_snap */
  move(dt, snap = false) {
    const hits = this.world.slide(this.body.position, this.velocity, dt, P.BODY_RADIUS, this.up_direction);
    if (snap && this.input.canJump()) this.floorSnap();
    this.sync();
    return hits;
  }

  floorSnap() {
    const from = _t1.copy(this.body.position).addScaledVector(this.up_direction, 0.15);
    const dir = _t2.copy(this.up_direction).multiplyScalar(-1);
    const hit = this.world.probe(from, dir, 0.15 + P.SNAP_DIST);
    if (hit && hit.group !== 'wall') this.body.position.copy(hit.point);
  }

  /* --- rails ------------------------------------------------------- */

  /* character_controller.gd::set_path */
  setPath(reach) {
    const p = reach ? closestPath(this.paths, this.body.position, reach)
                    : closestPath(this.paths, this.body.position);
    if (p) {
      this.path = p;
      this.path_closed = p.closed;
      this.path_offset = p.closestOffset(this.body.position);
      p.tangent(this.path_offset, this.curve_tangent);
      this.path_dir = this._pathDir(this.curve_tangent, this.velocity, 0.25);
    } else this.path = null;
  }
  setPathNull() { this.path = null; }

  /* LibHelpers.get_path_dir */
  /**
   * Which way along a rail you are travelling: +1 with the stored direction of
   * the points, -1 against it, 0 if you are barely moving along it at all.
   *
   * The original returns these the other way round, and that is correct THERE:
   * Godot's forward is -Z, so `look_at(tangent * -1)` faces you along the
   * tangent. This port treats +Z as forward — the exported character already
   * faces +Z, which is why MODEL_YAW is 0 — so carrying the signs across
   * verbatim faced the skater backwards and, because `path_offset += path_vel`,
   * walked them back down the rail the way they came. Same class of bug as the
   * model yaw, one layer further in.
   */
  _pathDir(tangent, vel, threshold) {
    const d = tangent.dot(_pd.copy(vel).normalize());
    if (d > threshold) return 1;
    if (d < -threshold) return -1;
    return 0;
  }

  /* LibHelpers.start_grind */
  /**
   * @param {number} [threshold] how closely your travel has to line up with the
   *   rail. The default is the original's; coming in from the air wants a
   *   looser one, because dropping onto a rail is rarely along it.
   */
  getCanGrind(threshold = 0.25) {
    if (!this.path) return false;
    const tan = this.path.tangent(this.path_offset, _t1);
    if (tan.lengthSq() < 1e-6) return false;
    const dir = this._pathDir(tan, this.velocity, threshold);
    if (dir === 0) return false;
    const along = _t2.copy(tan).multiplyScalar(this.velocity.dot(tan));
    this.path_vel = along.length() * dir;
    this.curve_tangent.copy(tan);
    this.path_dir = dir;
    return true;
  }

  /**
   * Carry a grind onto the rail that starts where this one stops.
   *
   * A ledge that goes round a corner is rarely one chain in the level data —
   * the .trg splits it wherever the original's authors split it — so running
   * off the end of a handrail a foot from the start of the next one dropped
   * you on the floor mid-line. This looks for a chain whose END is within
   * reach of where you are leaving, pointing somewhere you could plausibly
   * carry on, and hands the grind over: same speed, new rail.
   *
   * The turn limit matters. Half the end-to-end pairs in a park are two rails
   * that meet at 150 degrees or more — the two sides of one ledge, or a rail
   * doubling back beside itself — and joining those would spin you round and
   * send you back the way you came, which reads as a bug however you dress it
   * up. Anything up to a right angle and a bit is a corner; past that is a
   * U-turn.
   *
   * @param {number} reach  how far the next rail's end may be, in metres
   * @param {number} maxTurn  the sharpest corner to take, in radians
   * @returns {boolean} true if the grind continues
   */
  joinPath(reach, maxTurn) {
    if (!this.path || !this.paths || !this.paths.length) return false;
    const sign = this.path_vel >= 0 ? 1 : -1;
    const leaveAt = sign > 0 ? this.path.length : 0;
    const from = this.path.sample(leaveAt, _t1).clone();
    const out = this.path.tangent(leaveAt, _t2).clone().multiplyScalar(sign);
    if (out.lengthSq() < 1e-8) return false;
    out.normalize();

    const minDot = Math.cos(maxTurn);
    let best = null, bestScore = -Infinity;
    for (const q of this.paths) {
      if (q === this.path) continue;
      for (const at of q.closed ? [0] : [0, q.length]) {
        const here = q.sample(at, _t3);
        const gap = here.distanceTo(from);
        if (gap > reach) continue;
        const tan = q.tangent(at, _t4).clone();
        if (tan.lengthSq() < 1e-8) continue;
        /* entering at offset 0 means running up the chain, at the far end it
           means running down it — either way this is the way you would go */
        const newSign = at === 0 ? 1 : -1;
        const into = tan.normalize().multiplyScalar(newSign);
        const dot = out.dot(into);
        if (dot < minDot) continue;
        /* straighter and closer wins */
        const score = dot * 2 - gap;
        if (score > bestScore) { bestScore = score; best = { q, at, newSign, into: into.clone() }; }
      }
    }
    if (!best) return false;

    const speed = Math.abs(this.path_vel);
    this.path = best.q;
    this.path_closed = best.q.closed;
    /* a hair inside the end, or the very next stick() check ends it again */
    this.path_offset = best.at === 0 ? 0.02 : best.q.length - 0.02;
    this.path_vel = speed * best.newSign;
    this.path_dir = best.newSign;
    this.path.tangent(this.path_offset, this.curve_tangent);
    this.path.sample(this.path_offset, this.curve_snap);
    this.body.position.copy(this.curve_snap);
    this.path.up(this.path_offset, this.up_direction);
    return true;
  }

  /* LibHelpers.start_lip */
  getCanLip() {
    if (!this.path) return false;
    const tan = this.path.tangent(this.path_offset, _t1).clone();
    const pos = this.path.sample(this.path_offset, _t2).clone();
    const toPlayer = _t3.copy(this.body.position).sub(pos);
    toPlayer.y = 0;
    const perp = _t4.copy(tan).cross(new THREE.Vector3(0, 1, 0)).normalize();
    const dotPerp = toPlayer.clone().normalize().dot(perp);
    let dir = dotPerp > 0 ? perp.clone() : perp.clone().negate();
    if (toPlayer.lengthSq() < 0.01 || Math.abs(dotPerp) < 0.1) {
      const vh = horizontalVelocity(this.velocity, new THREE.Vector3()).normalize();
      if (vh.lengthSq() > 0.01) dir = vh.dot(perp) > 0 ? perp.clone() : perp.clone().negate();
    }
    this.curve_tangent.copy(tan);
    this.lip_start_pos.copy(pos);
    this.lip_start_dir.copy(dir.normalize().negate());
    this.path.up(this.path_offset, this.lip_start_up);
    return true;
  }

  /* LibHelpers.start_pipesnap wrapped in character_controller.gd::get_pipesnap */

  /* --- walls ------------------------------------------------------- */

  handleBounce() {
    const wall = this.shape_col_fwd.find((c) => c.group === 'wall');
    if (wall && !this.revert_path) {
      this.path_vel *= -G.PATH_BOUNCE_MULTI;
      this.path_dir *= -1;
      this.revert_path = true;
    }
    if (!wall) this.revert_path = false;
  }

  /**
   * What hitting a wall does.
   *
   * The original mirrors your velocity off the wall and turns you to face the
   * way you now bounce, which on the debug parks is fine — there is barely a
   * wall to hit. On a converted THPS level, which is corridors and pillars and
   * doorways, clipping anything at speed spins you round and fires you back
   * where you came from, and the level stops being skateable.
   *
   * So the reversal is kept for what it is actually for — riding squarely into
   * something — and everything short of that grazes: the into-the-wall part of
   * your velocity is removed, the along-the-wall part is kept almost whole, and
   * a small push off the surface angles you clear of it. You keep your line.
   */
  /**
   * A wall met in the air. No bounce and no turn — you are mid-flight, the
   * board keeps its rotation — just lose the part of your speed that was going
   * into the wall and carry on along it.
   */
  handleAirWall() {
    const wall = this.shape_col_fwd.find((c) => c.group === 'wall');
    if (!wall) return;
    const n = wall.normal;
    const vn = this.velocity.dot(n);
    if (vn >= 0) return;                      // already moving away from it
    this.velocity.addScaledVector(n, -vn);    // cancel the into-wall part
    this.velocity.multiplyScalar(G.AIR_WALL_KEEP);
    this.body.position.addScaledVector(n, G.WALL_BOUNCE_OFFSET_MULTI);
  }

  handleWallBounce() {
    const wall = this.shape_col_fwd.find((c) => c.group === 'wall');
    if (!wall) return;
    const fwdVel = forwardVelocity(this.velocity, this.up_direction, _t1);
    const len = fwdVel.length();
    if (len < 0.2) return;

    const n = wall.normal;
    /* how squarely we are going into it: 1 head on, 0 running alongside */
    const into = -n.dot(_t2.copy(fwdVel).divideScalar(len));
    if (into <= G.WALL_IGNORE_DOT) return;         // parallel; not a collision

    if (into < G.WALL_HEAD_ON) {
      /* graze — slide along it */
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn);   // drop the into-wall part
      this.velocity.multiplyScalar(G.WALL_SLIDE_KEEP);
      this.velocity.addScaledVector(n, G.WALL_SLIDE_PUSH * into);
      this.body.position.addScaledVector(n, G.WALL_BOUNCE_OFFSET_MULTI);
      if (this.velocity.lengthSq() > 0.01) {
        this.lookAlong(_t3.copy(this.velocity).normalize());
      }
      return;
    }

    if (len <= G.WALL_BOUNCE_VEL_THRESH) {
      /* square on but slow: stop dead against it rather than ping backwards */
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn);
      this.body.position.addScaledVector(n, G.WALL_BOUNCE_OFFSET_MULTI);
      return;
    }

    /* square on and fast — Godot's Vector3.bounce(n): v - 2n(v.n) */
    this.velocity.addScaledVector(n, -2 * this.velocity.dot(n));
    this.velocity.multiplyScalar(G.WALL_HEAD_ON_KEEP);
    this.body.position.addScaledVector(n, G.WALL_BOUNCE_OFFSET_MULTI);
    if (this.velocity.length() > 0.1) this.lookAlong(_t3.copy(this.velocity).normalize());
  }

  /* --- stance ------------------------------------------------------- */

  /**
   * Are we rolling backwards? Ride up a quarter pipe and come back down and
   * this is true all the way to the bottom: the board is travelling one way and
   * pointing the other.
   */
  isFakie() {
    const fwd = this.axisZ(_t1);
    const v = forwardVelocity(this.velocity, this.up_direction, _t2);
    if (v.length() < G.FAKIE_MIN_SPEED) return false;
    return v.normalize().dot(fwd) < G.FAKIE_DOT;
  }

  /**
   * Make the way you are MOVING the way you are FACING — which is the whole of
   * what a switch is. It is NOT "turn round": if you are already going forwards
   * there is nothing to do and it does nothing, because turning a forward-
   * rolling skater round would just leave them rolling backwards instead.
   *
   * Velocity is untouched, so no speed is gained or lost and the line through
   * the park is unchanged; only which end of the board is the nose. Returns
   * true when it actually had to turn you, so a caller can score it.
   */
  switchStance() {
    if (!this.isFakie()) return false;
    /* spin the model the way it is already leaning, so the turn has a direction
       rather than picking one arbitrarily out of an ambiguous 180 slerp */
    const side = this.axisX(_t1).dot(this.last_vel) >= 0 ? 1 : -1;
    this.body.rotateY(Math.PI);
    this.sync();
    this.switch_timer = G.SWITCH_COOLDOWN;
    if (this.onSwitch) this.onSwitch(side, this.body);
    return true;
  }

  /**
   * Called every physics tick while riding. This is what catches the quarter
   * pipe: coming back down never touches the Air state, so a landing hook alone
   * would never fire, and you would roll all the way to the bottom backwards.
   */
  tickSwitch(dt, stateName) {
    if (this.switch_timer > 0) { this.switch_timer -= dt; return false; }
    if (stateName !== 'ground' && stateName !== 'pipe') return false;
    return this.switchStance();
  }

  /** Godot's look_at(pos - dir) with our +Z forward convention. */
  /**
   * Straighten up as you touch down.
   *
   * Steering in the air turns the BODY, not the velocity, so you land pointing
   * somewhere other than where you are going. The original's only answer to
   * that is the bail. This is the gentler one: if the board is off your line,
   * turn it back onto the line — to whichever end of it the board is already
   * nearer, so landing a 180 still leaves you fakie and the stance swap that
   * follows still has something to swap.
   *
   * A genuinely sideways landing at speed is still a bail; this only tidies up
   * the ones that were never really crashes.
   */
  alignLandingToTravel() {
    const flat = _pd.copy(this.velocity);
    flat.y = 0;
    if (flat.lengthSq() < 0.25) return;
    flat.normalize();
    const fwd = _t4.setFromMatrixColumn(this.body.matrixWorld, 2);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const dot = fwd.dot(flat);
    if (Math.abs(dot) >= G.LAND_ALIGN_DOT) return;    // already straight enough
    this.lookAlong(dot < 0 ? flat.negate() : flat, this.up_direction);
  }

  lookAlong(dir, up = this.up_direction) {
    const m = new THREE.Matrix4();
    const f = _t1.copy(dir).normalize();
    const u = _t2.copy(up).normalize();
    const r = _t3.copy(u).cross(f);
    if (r.lengthSq() < 1e-8) return;
    r.normalize();
    const u2 = _t4.copy(f).cross(r).normalize();
    m.makeBasis(r, u2, f);
    this.body.quaternion.setFromRotationMatrix(m);
    this.sync();
  }

  /* --- balance ----------------------------------------------------- */

  randomizeBalance() {
    this.balance_time = 1.0;
    this.balance_angle = 0.0;
    this.balance_dir = Math.random() >= 0.5 ? 1 : -1;
  }

  /* character_controller.gd::balance_logic */
  balanceLogic(dt, axis) {
    const i = this.input.getInput();
    if (axis === 0) {
      if (i.x > 0.6 || i.x < -0.6) this.balance_dir = Math.round(i.x);
    } else {
      if (i.y > 0.6 || i.y < -0.6) this.balance_dir = Math.round(-i.y);
    }
    this.balance_time += G.BALANCE_TIME_INC * dt;
    /* IT RUNS AWAY FROM YOU.
     *
     * The ported figure drifts at a constant rate, which is a slider, not a
     * balance: the needle leaves the middle at exactly the speed it crosses the
     * edge, so there is nothing to react to and nothing at stake near the end.
     * Anything actually balancing does the opposite — the further past upright
     * it gets the harder it pulls — so the drift accelerates with how far out
     * the needle already is.
     *
     * Only on the way OUT. Pushing back the other way stays steady, or a late
     * save would snap through the middle and straight off the far side. */
    const limit = Math.PI / STATS.balance_threshold;
    const lean = Math.min(1, Math.abs(this.balance_angle) / limit);
    const falling = this.balance_angle === 0
      || Math.sign(this.balance_angle) === Math.sign(this.balance_dir);
    const runaway = falling ? 1 + G.BALANCE_RUNAWAY * lean * lean : 1;
    this.balance_angle += G.BALANCE_MULTI * dt * this.balance_dir * this.balance_time * runaway;
    /* With nothing to fall off, the needle would keep travelling past the end
       of the meter and the skater would lean further and further over. Pin it
       just inside the edge: it still shows you losing it, it just never goes
       over. */
    if (Fall.forgiving) {
      const edge = limit * 0.97;
      this.balance_angle = Math.max(-edge, Math.min(edge, this.balance_angle));
    }
    if (this.hud) this.hud.setBalanceValue(this.balance_angle);
  }

  resetShapecast(enabled) { this.groundEnabled = enabled; }

  /* counts down the "do not re-catch that wall" window — see Wallride */
  tickWallrideCooldown(dt) {
    if (this.wallride_cool > 0) this.wallride_cool -= dt;
    if (this.pipe_climb > 0) this.pipe_climb -= dt;
    if (this.grind_ask > 0) this.grind_ask -= dt;
  }

  /* character_controller.gd::set_fall / _reset_player */
  setFall() {
    this.tricks.clearTricks();
    this.fall_timer = G.FALL_TIMER;
    if (this.onBail) this.onBail();
  }

  resetPlayer() {
    this.standing_timer = G.STANDING_TIMER;
    this.up_direction.set(0, 1, 0);
    this.velocity.set(0, 0, 0);
    this.last_vel.set(0, 0, 0);
    this.body.position.copy(this.last_ground.position);
    this.body.quaternion.copy(this.last_ground.quaternion);
    this.balance_angle = 0;
    this.sync();
    this.input.reset();
  }
}
