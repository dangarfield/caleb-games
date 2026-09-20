/* states.js — Scripts/Player/Player_States/*.gd and character_statemachine.gd.
 *
 * Ten states, each one a small object with enter / exit / physics. Every
 * transition in the original is reproduced, including the ones that look odd
 * out of context: Ground falls straight to Air the moment the ground probe
 * misses (with an upward kick of GRIND_END_UP_VEL so you clear the lip), Pipe
 * is Ground with a pipesnap check bolted on, and Pipesnap is the state that
 * carries you round the transition of a bowl while gravity still applies.
 */
import * as THREE from 'three';
import { STATS, G, P } from './config.js';
import {
  killOrthogonalVelocity, forwardVelocity,
  horizontalVelocity, alignUp
} from './physics.js';
import { Fall } from './player.js';
import { Action } from './input.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export class StateMachine {
  constructor(ctx) {
    this.ctx = ctx;
    this.states = {};
    this.current = null;
    this.previous = null;
    this.onChange = null;
  }
  add(name, state) { state.name = name; state.m = this; state.c = this.ctx; this.states[name.toLowerCase()] = state; return this; }
  start(name) { this.current = this.states[name.toLowerCase()]; this.current.enter?.(); this._announce(); }
  go(name) {
    const next = this.states[name.toLowerCase()];
    if (!next || next === this.current) return;
    this.previous = this.current;
    this.current?.exit?.();
    this.current = next;
    next.enter?.();
    this._announce();
  }
  _announce() { if (this.onChange) this.onChange(this.current.name); }
  update(dt) { this.current?.update?.(dt); }
  physics(dt) {
    /* timers that belong to the simulation, not to the frame — they have to
       tick on the fixed step or they behave differently on a slow machine */
    this.ctx.ctrl?.tickWallrideCooldown?.(dt);
    /* Before he moves, not after: a window he is about to hit stops existing
       first, so the same step that would have stopped him carries him through
       the hole. See Glass.check. */
    this.ctx.glass?.check(this.ctx.ctrl, dt);
    this.current?.physics?.(dt);
    /* Where to draw him, assuming this step is the newest thing there is. The
       frame loop overwrites this with the true position between steps; doing it
       here as well means anything that drives the simulation directly — a test,
       a tool — still gets a sane one instead of a stale one. */
    this.ctx.ctrl?.setRenderAlpha?.(1);
  }
}

/* ------------------------------------------------------------- Ground */

class Ground {
  /* Wheels down, combo over.
   *
   * It used to run on a half-second timer that only started when the last
   * trick ENDED, so landing and immediately popping again carried the combo on
   * — ollie, land, ollie, land, one long chain off the flat. Measured: an
   * ollie a third of a second after touching down still joined. Landing is the
   * end of a combo; that is the whole shape of the game. */
  enter() {
    this.c.tricks.endCombo();
    this.c.input.buffer.clear();
    this.c.ctrl.lip_ask_mark = this.c.input.forwardAsks();
  }

  physics(dt) {
    this.groundMovement(dt, true);
    this.c.ctrl.handleWallBounce();
    this.revertCheck();
    if (this.handleJump()) return;
    if (this.grindLipCheck()) return;
  }

  /**
   * Is what we are riding a ramp rather than a floor? Steepness decides, not
   * the converter's label: it only tags a triangle `pipe` where the level
   * carries one of THPS's vert triggers, and plenty of genuinely steep ramp —
   * most of Skatestreet's, all of Skate Heaven's sampled — arrives tagged
   * `floor`.
   */
  onTransition() {
    return isTransition(this.c.ctrl.shape_col_ground);
  }

  /**
   * PORT: the manual switch. Nothing in Godot_Skate reads the Revert action —
   * it is mapped and then never used — so it is put to work here. It asks for
   * the same thing the automatic one does, "make where I am going the front",
   * so pressing it while already rolling forwards is a no-op rather than a
   * pirouette into riding backwards. It scores only when it did something.
   */
  revertCheck() {
    const { ctrl, input, tricks } = this.c;
    if (input.buffer.last() !== Action.REVERT) return;
    if (ctrl.switchStance()) tricks.revert();
  }

  /* player_ground.gd::_ground_movement — the whole feel of riding */
  groundMovement(dt, store = false) {
    const { ctrl, input, anim, tricks } = this.c;
    ctrl.surfaceCheck(false);
    ctrl.setPath();
    this.groundCheck();
    if (store) ctrl.storeGround();

    const i = input.getInput();
    if (i.y < 0) {
      ctrl.velocity.multiplyScalar(G.GROUND_SLOWDOWN);
      ctrl.body.rotateY(i.x * STATS.rot_kickturn * dt);
    } else {
      ctrl.body.rotateY(i.x * STATS.rot * dt);
    }
    ctrl.sync();

    const bz = ctrl.axisZ(_w).clone();
    const fwdLen = forwardVelocity(ctrl.velocity, ctrl.up_direction, _u).length();
    /* a slow roll keeps creeping so you never stall dead on a flat */
    if (i.y >= 0 && ctrl.velocity.length() < STATS.max_vel / 8 && fwdLen > 0.1)
      ctrl.velocity.addScaledVector(bz, STATS.acc * 0.25);
    /* Either the jump button held down (the original's push) or Up (what a
       thumb on a stick and most people's fingers actually reach for). Holding
       both does not stack. */
    const push = Math.max(i.z > 0 ? 1 : 0, Math.max(0, i.y));
    if (push > 0 && ctrl.velocity.length() <= STATS.max_vel && i.y !== -1)
      ctrl.velocity.addScaledVector(bz, G.PUSH_ACC * push);

    ctrl.velocity.y -= G.GRAVITY * dt;
    killOrthogonalVelocity(ctrl.body, ctrl.velocity, _u);
    ctrl.velocity.copy(_u);

    ctrl.setPreviousValues();
    ctrl.setCharUpDirection();
    alignUp(ctrl.body, ctrl.up_direction);
    ctrl.move(dt, true);

    /* `this.name` is 'ground' or 'pipe' — Pipe extends Ground, so riding the
       transition of a quarter pipe checks for a switch on the way back down. */
    ctrl.tickSwitch(dt, this.name);
    ctrl.noteRideDir();

    anim.handleGround(ctrl.velocity);
    tricks.setComboCooldown(dt);
  }

  groundCheck() {
    const { ctrl } = this.c;
    if (ctrl.shape_col_ground) {
      const hit = ctrl.shape_col_ground;
      /* landing: a tagged bowl counts however flat it is under you, because
         that is the floor of the bowl and you have landed in it */
      const transition = hit.group === 'pipe';
      if (transition && ctrl.up_direction.dot(hit.normal) > 0.995) { this.m.go('pipe'); return; }
    } else if (ctrl.velocity.y > 0 && ctrl.up_direction.y < G.TRANSITION_NY) {
      /* off the top of a transition and still going up: hold the ramp's plane */
      this.m.go('pipesnap'); return;
    } else {
      /* player_ground.gd adds GRIND_END_UP_VEL — three metres a second straight
         up, 60% of a full ollie — every time the ground probe misses. On a rail
         end (which is what the constant is named for, and where Grind still
         uses it) that is a deliberate pop. Here it fires when you simply roll
         off the coping of a bowl or the edge of a ledge, and it reads exactly
         like the game jumping for you. Roll off an edge and you now just fall
         off it. */
      this.m.go('air');
    }
  }

  handleJump() {
    const { ctrl, input } = this.c;
    if (!input.getInputJump()) return false;
    ctrl.velocity.addScaledVector(UP, STATS.jump_vel * ollieGain(ctrl));
    ctrl.popped = true;
    input.setJumpCooldown();
    this.m.go(this.onTransition() ? 'pipesnap' : 'air');
    return true;
  }

  /**
   * Asking to grind, and the ask outliving the press.
   *
   * The press used to have to land on the frame the rail was already under you.
   * Anyone riding up a ramp towards a coping, or dropping out of the air onto a
   * rail, pressed grind a good half-second early and got nothing — Dan's two
   * cases exactly. So a press starts a timer instead, and the catch is tried
   * every frame until it runs out.
   *
   * From the air it is also tried more forgivingly: further from the rail, and
   * without demanding that you already be travelling along it. Dropping onto a
   * rail is almost never along it, which is why the original's figure turned
   * nearly every attempt down.
   */
  grindLipCheck(fromAir = false) {
    const { ctrl, input } = this.c;
    if (input.getInputGrind()) ctrl.grind_ask = G.GRIND_ASK;
    if ((ctrl.grind_ask || 0) <= 0) return false;
    if (fromAir) ctrl.setPath(G.GRIND_AIR_REACH);
    const align = fromAir ? G.GRIND_AIR_ALIGN : 0.25;
    if (ctrl.getCanGrind(align)) { ctrl.grind_ask = 0; this.m.go('grind'); return true; }
    if (ctrl.getCanLip()) { ctrl.grind_ask = 0; this.m.go('lip'); return true; }
    return false;
  }
}

/**
 * Is the ground under him a transition to ride, or just a slope?
 *
 * THE ORIGINAL SAYS SO, and nothing else gets a vote. Every park carries vert
 * triggers — invisible vertical curtains standing over its transitions, 99% of
 * the flagged faces measured across the twenty parks — and the converter turns
 * the bottom edge of each one into a coping and tags the ground beneath it
 * `pipe`. That tag is the game's own answer to this question.
 *
 * There used to be a steepness fallback on top of it, on the theory that plenty
 * of real transition arrives untagged. Measured, that theory was wrong twice
 * over. It let ordinary kickers behave like quarter pipes, which is what Dan
 * found in the Hangar. And it was barely earning its place anyway: riding at
 * 360 steep untagged ramps across twelve parks, dropping it changed the outcome
 * on five of them, because anyone riding up a real transition crosses into the
 * tagged zone within a metre or two regardless. Taking it out also stopped the
 * camera burying itself on three of thirty-nine quarter-pipe runs.
 *
 * The steepness test that remains is for the tagged ground only: a vert trigger
 * covers the flat floor of a bowl as well as its walls, and standing on the
 * flat is not riding a transition.
 */
function isTransition(hit) {
  return !!hit && hit.group === 'pipe' && hit.normal.y < G.TRANSITION_NY;
}

/**
 * How hard the pop is, as a multiple of the ported figure.
 *
 * The original's ollie is one number and it was always the same height, which
 * is not how the game it came from feels: there, rolling in fast gets you up,
 * and standing still barely gets the board off the floor. So the pop grows with
 * ground speed, from OLLIE_STILL at a standstill to OLLIE_FAST at top speed.
 *
 * Those two are written as HEIGHTS — "half again as high", "twice as high" —
 * because that is the thing you can see. Height goes with the SQUARE of the
 * speed you leave the ground at, so the square root is what actually multiplies
 * the pop, and setting OLLIE_FAST to 2 really does get you twice as high.
 */
function ollieGain(ctrl) {
  const v = ctrl.velocity;
  const speed = Math.min(1, Math.hypot(v.x, v.z) / STATS.max_vel);
  return Math.sqrt(G.OLLIE_STILL + (G.OLLIE_FAST - G.OLLIE_STILL) * speed);
}

/* --------------------------------------------------------------- Pipe */
/* player_pipe.gd extends CharacterStateGround */

class Pipe extends Ground {
  enter() {
    this.c.tricks.endCombo();      // landing on a transition ends it too
    this.c.ctrl.lip_ask_mark = this.c.input.forwardAsks();
  }
  physics(dt) {
    const { ctrl, cam } = this.c;
    this.groundMovement(dt);
    ctrl.handleWallBounce();
    /* High on a steep transition the camera belongs out over the bowl, the same
       place the plane lock puts it — otherwise turning across the face of a
       ramp asks for a shot from inside the wall behind it, and the occlusion
       probe answers by climbing onto the skater. Below TRANSITION_NY this is
       the flat part of a bowl and the ordinary follow is right.
     *
     * STEEPNESS ALONE IS NOT ENOUGH, and that was the bug Dan found. A long
     * ramp you ride DOWN is every bit as steep as the face of a quarter pipe,
     * and locking the shot to its open side puts the camera below him looking
     * back up — he spends the whole descent driving into the lens. The three
     * cases are told apart by which way he is going along the slope:
     *
     *   up it     the classic transition. Lock.
     *   across it carving the face, and the case the lock was written for,
     *             because "behind" here really is inside the wall. Lock.
     *   down it   a hill. Ordinary follow, and the reason for this rule.
     *
     * Plus a memory: having been UP the face, the shot keeps holding for
     * CAM_PIPE_MEMORY so the way back down is filmed from where the way up
     * was, rather than whipping round behind him at the apex. */
    if (cam && ctrl.up_direction.y < G.TRANSITION_NY) {
      _v.set(ctrl.up_direction.x, 0, ctrl.up_direction.z);
      /* speed up the slope: positive climbing, negative running down it */
      const upSlope = -(ctrl.velocity.x * _v.x + ctrl.velocity.z * _v.z);
      if (upSlope > 0.5) ctrl.pipe_climb = G.CAM_PIPE_MEMORY;
      if (upSlope > -G.CAM_PIPE_DESCENT || ctrl.pipe_climb > 0) cam.setVertPlane(_v);
    }
    if (this.handleJump()) return;
    if (this.grindLipCheck()) return;
  }
  groundCheck() {
    const { ctrl } = this.c;
    if (ctrl.shape_col_ground) {
      if (ctrl.shape_col_ground.group === 'floor' && !this.onTransition()) { this.m.go('ground'); return; }
    } else if (ctrl.velocity.y > 0 && ctrl.up_direction.y < G.TRANSITION_NY) {
      this.m.go('pipesnap');                 // off the lip, still climbing
    } else this.m.go('air');
  }
}

/* ---------------------------------------------------------------- Air */

class Air {
  enter() {
    const { ctrl, tricks } = this.c;
    /* character_tricks.gd fires an Olli on ANY entry to the air, because
       `_start_trick` matches it unconditionally. That means rolling off a ledge
       scores an ollie you did not do — the other half of what makes the old
       behaviour feel like an auto-jump. Only a real pop counts now. */
    if (ctrl.popped) tricks.startAir();
    ctrl.popped = false;
    ctrl.setPathNull();
    this.surfaceTimer = 0.1;   // SURFACE_TIMER_DELAY
  }
  exit() { this.c.tricks.endTrick(); }

  physics(dt) {
    const { ctrl, tricks } = this.c;
    if (this.wallrideCheck()) return;
    this.airMovement(dt);
    tricks.airTrick();
    if (this.grindLipCheck(true)) return;
    if (Fall.outOfBounds(ctrl.position)) { this.m.go('fall'); return; }
  }

  /**
   * Ollie into a wall and ride along it.
   *
   * No button: arriving at the wall the right way IS the trick, the same way
   * entering a rail is. "The right way" is three things at once — the original
   * marked this face WALLRIDEABLE, you have speed, and you are meeting it at
   * an angle rather than nose-first. Square into a wall is a crash and always
   * was; running parallel and grazing it is not a wallride either.
   *
   * The probe is its own rather than shape_col_fwd's, because that sweep is
   * three rays fired for a different purpose and its answer for "which wall am
   * I about to touch" is whichever one sorted first.
   */
  wallrideCheck() {
    const { ctrl } = this.c;
    if (!ctrl.world) return false;
    if ((ctrl.wallride_cool || 0) > 0) return false;
    const v = _v.copy(ctrl.velocity); v.y = 0;
    const speed = v.length();
    if (speed < G.WALLRIDE_MIN_SPEED) return false;
    v.divideScalar(speed);
    const from = _w.copy(ctrl.body.position).addScaledVector(UP, 0.35);
    const hit = ctrl.world.probe(from, v, G.WALLRIDE_RAY);
    if (!hit || !hit.ride) return false;
    if (Math.abs(hit.normal.y) > G.WALLRIDE_MAX_NY) return false;
    const into = -hit.normal.dot(v);
    if (into < G.WALLRIDE_MIN_INTO || into > G.WALLRIDE_MAX_INTO) return false;
    /* the gap that matters is to the FACE, not along the way you are going */
    if (hit.distance * into > G.WALLRIDE_REACH) return false;
    /* and you have to be off the ground: a wall whose foot is right under you
       is something you are landing beside, not something you are riding */
    const down = ctrl.world.probe(_w.copy(ctrl.body.position), DOWN, G.WALLRIDE_CATCH_AIR);
    if (down && down.group !== 'wall') return false;
    /* and it has to be a WALL, not a kerb or the lip of a step: the same face
       must still be there above your head, or catching it just drops you on
       the floor a frame later — which is what the one- and two-frame
       "wallrides" in Downtown turned out to be. */
    const tall = ctrl.world.probe(_w.addScaledVector(UP, 0.35 + G.WALLRIDE_TALL), v, G.WALLRIDE_RAY);
    if (!tall || !tall.ride) return false;
    this.m.go('wallride');
    return true;
  }

  airMovement(dt) {
    const { ctrl, input, anim } = this.c;
    ctrl.surfaceCheck(true);
    ctrl.setPath();
    ctrl.body.rotateY(input.getInput().x * STATS.rot_air * dt);
    ctrl.sync();
    ctrl.velocity.y -= G.GRAVITY * dt;
    ctrl.up_direction.lerp(UP, Math.min(1, dt * G.UP_ALIGN_SPEED)).normalize();
    ctrl.setPreviousValues();
    if (this.surfaceDelay(dt)) this.groundCheck();
    ctrl.handleAirWall();
    ctrl.setCharUpDirection();
    alignUp(ctrl.body, ctrl.up_direction);
    ctrl.move(dt);
    anim.setAirPose();
  }

  groundCheck() {
    const { ctrl } = this.c;
    const hit = ctrl.shape_col_ground;
    if (!hit) return;
    if (hit.group === 'wall') return;
    if (Fall.landedPerpendicular(ctrl.body, ctrl.velocity, ctrl.up_direction)) { this.m.go('fall'); return; }
    ctrl.alignLandingToTravel();
    /* Land a 180 and you are rolling backwards; swap ends as you touch down so
       you ride away forwards. Same call the ground tick makes — it only turns
       you if you are actually going the other way. */
    ctrl.switchStance();
    if (hit.group === 'pipe') { this.m.go('pipe'); return; }
    if (ctrl.up_direction.dot(UP) < 0.5) return;
    if (hit.group === 'floor') this.m.go('ground');
  }

  /**
   * Asking to grind, and the ask outliving the press.
   *
   * The press used to have to land on the frame the rail was already under you.
   * Anyone riding up a ramp towards a coping, or dropping out of the air onto a
   * rail, pressed grind a good half-second early and got nothing — Dan's two
   * cases exactly. So a press starts a timer instead, and the catch is tried
   * every frame until it runs out.
   *
   * From the air it is also tried more forgivingly: further from the rail, and
   * without demanding that you already be travelling along it. Dropping onto a
   * rail is almost never along it, which is why the original's figure turned
   * nearly every attempt down.
   */
  grindLipCheck(fromAir = false) {
    const { ctrl, input } = this.c;
    if (input.getInputGrind()) ctrl.grind_ask = G.GRIND_ASK;
    if ((ctrl.grind_ask || 0) <= 0) return false;
    if (fromAir) ctrl.setPath(G.GRIND_AIR_REACH);
    const align = fromAir ? G.GRIND_AIR_ALIGN : 0.25;
    if (ctrl.getCanGrind(align)) { ctrl.grind_ask = 0; this.m.go('grind'); return true; }
    if (ctrl.getCanLip()) { ctrl.grind_ask = 0; this.m.go('lip'); return true; }
    return false;
  }

  surfaceDelay(dt) {
    if (this.surfaceTimer >= 0) this.surfaceTimer -= dt;
    return this.surfaceTimer <= 0;
  }
}

/* -------------------------------------------------------------- Grind */

class Grind {
  enter() {
    const { ctrl, tricks, hud } = this.c;
    /* player_grind.gd::_min_path_vel — GDScript sign(0.0) is 0, so a grind
       entered with no velocity along the rail stays dead. Kept exactly. */
    ctrl.path_vel = Math.max(Math.abs(ctrl.path_vel), G.MIN_GRIND_VEL) * Math.sign(ctrl.path_vel);
    tricks.grindTrick();
    tricks.performed_olli = false;
    ctrl.resetShapecast(true);
    ctrl.randomizeBalance();
    hud.setBalanceView(true, Math.PI / 2);
  }
  exit() {
    const { ctrl, anim, hud } = this.c;
    ctrl.setPathNull();
    ctrl.resetShapecast(true);
    anim.resetBalance();
    hud.setBalanceView(false);
  }

  physics(dt) {
    const { ctrl, anim, tricks } = this.c;
    ctrl.setPreviousValues();
    ctrl.surfaceCheck(false, true);
    ctrl.setUpAlignment();
    ctrl.balanceLogic(dt, 0);
    ctrl.handleBounce();
    tricks.holdTick(dt);          // a grind pays by the second, like a held grab
    this.grindMovement(dt);
    if (Fall.balance(ctrl.balance_angle)) { this.m.go('fall'); return; }
    if (this.handleJump()) return;
    if (this.endCheck()) return;
    anim.setBalance(0, ctrl.balance_angle);
  }

  grindMovement(dt) {
    const { ctrl } = this.c;
    if (!ctrl.path) { this.m.go('air'); return; }
    ctrl.path.sample(ctrl.path_offset, ctrl.curve_snap);
    ctrl.path_offset += ctrl.path_vel * dt;
    if (ctrl.path_closed) ctrl.path_offset = ctrl.path.wrap(ctrl.path_offset);
    ctrl.curve_tangent.lerp(ctrl.path.tangent(ctrl.path_offset, _v), Math.min(1, dt * G.TANGENT_LERP_SPD)).normalize();
    ctrl.body.position.copy(ctrl.curve_snap);
    ctrl.path.up(ctrl.path_offset, ctrl.up_direction);
    const target = _w.copy(ctrl.curve_tangent).multiplyScalar(ctrl.path_dir);
    if (target.lengthSq() > 1e-8) ctrl.lookAlong(target, ctrl.up_direction);
    ctrl.velocity.copy(ctrl.axisZ(_u)).multiplyScalar(ctrl.path_vel * ctrl.path_dir);
    ctrl.balanceLogic(dt, 0);
  }

  endCheck() {
    const { ctrl } = this.c;
    if (!ctrl.path) return true;
    if (ctrl.path.stick(ctrl.path_offset, 0.001) || ctrl.path_closed) return false;
    /* the rail ran out — but the next one may start right there */
    if (ctrl.joinPath(G.GRIND_JOIN_REACH, G.GRIND_JOIN_ANGLE)) return false;
    ctrl.resetShapecast(true);
    ctrl.surfaceCheck(false, false);
    if (ctrl.shape_col_ground) {
      this.m.go(ctrl.shape_col_ground.group === 'pipe' ? 'pipe' : 'ground');
      return true;
    }
    ctrl.velocity.addScaledVector(ctrl.up_direction, G.GRIND_END_UP_VEL);
    this.m.go('air');
    return true;
  }

  /**
   * Hop off the rail, and steer it.
   *
   * Hold the stick as you pop and you leave at an angle — up to
   * GRIND_OUT_ANGLE, eased from straight ahead at centre, taken off the stick
   * as it is HELD rather than off a buffered LEFT or RIGHT. It turns the
   * exit into something you aim: off the end of a handrail, out into the bank
   * beside it, or straight on.
   */
  handleJump() {
    const { ctrl, input } = this.c;
    if (!input.getInputJump()) return false;
    const speed = Math.abs(ctrl.path_vel);
    const lean = Math.max(-1, Math.min(1, input.getInput().x || input.dirBeforeJump()));
    const ang = lean * G.GRIND_OUT_ANGLE;
    ctrl.velocity.copy(ctrl.axisZ(_v)).multiplyScalar(speed * Math.cos(ang));
    ctrl.velocity.addScaledVector(ctrl.axisX(_u), speed * Math.sin(ang));
    ctrl.velocity.addScaledVector(ctrl.axisY(_w), STATS.jump_vel * ollieGain(ctrl));
    ctrl.body.position.addScaledVector(ctrl.axisY(_w), 0.05);
    ctrl.popped = true;
    input.setJumpCooldown();
    this.m.go('air');
    return true;
  }
}

/* ---------------------------------------------------------------- Lip */

class Lip {
  enter() {
    const { ctrl, tricks, hud } = this.c;
    tricks.lipTrick();
    tricks.performed_olli = false;
    ctrl.resetShapecast(false);
    ctrl.randomizeBalance();
    hud.setBalanceView(true, 0);
  }
  exit() {
    const { ctrl, anim, input, hud } = this.c;
    ctrl.setPathNull();
    ctrl.resetShapecast(true);
    anim.resetBalance();
    hud.setBalanceView(false);
    input.buffer.clear();
  }

  physics(dt) {
    const { ctrl, anim, tricks } = this.c;
    ctrl.setPreviousValues();
    ctrl.setUpAlignment();
    ctrl.balanceLogic(dt, 1);
    tricks.holdTick(dt);          // and so does hanging on the lip
    /* player_lip.gd::_lip_movement — you are pinned to the coping */
    ctrl.body.position.copy(ctrl.lip_start_pos);
    ctrl.up_direction.copy(ctrl.lip_start_up);
    ctrl.body.quaternion.identity();
    ctrl.body.rotateY(Math.atan2(ctrl.lip_start_dir.x, ctrl.lip_start_dir.z));
    ctrl.sync();
    if (Fall.balance(ctrl.balance_angle)) { this.m.go('fall'); return; }
    if (this.handleJump()) return;
    anim.setBalance(1, ctrl.balance_angle);
  }

  handleJump() {
    const { ctrl, input } = this.c;
    if (!input.getInputJump()) return false;
    ctrl.body.position.addScaledVector(ctrl.lip_start_dir, -ctrl.balance_dir * 0.5);
    ctrl.body.position.addScaledVector(ctrl.axisY(_v), -0.05);
    ctrl.up_direction.set(0, 1, 0);
    ctrl.body.quaternion.identity();
    ctrl.body.rotateY(Math.atan2(
      ctrl.lip_start_dir.x * -ctrl.balance_dir,
      ctrl.lip_start_dir.z * -ctrl.balance_dir));
    ctrl.sync();
    ctrl.velocity.copy(ctrl.axisZ(_w)).multiplyScalar(0.15);
    ctrl.velocity.addScaledVector(UP, STATS.jump_vel * 0.25);
    ctrl.popped = true;
    input.setJumpCooldown();
    this.m.go('air');
    return true;
  }
}

/* ----------------------------------------------------------- Pipesnap */

class Pipesnap {
  /**
   * Above the lip: the plane lock.
   *
   * Ordinary ballistics is wrong here and always looks wrong. Ride up a
   * transition, leave the top, and what should happen is that you go up in the
   * PLANE OF THE RAMP and come back down into it — however that ramp curves.
   * An arc computed from the velocity you happened to have throws you out over
   * the park instead, and a bowl throws you out of the bowl.
   *
   * The lock is one rule: you may move up, down, and sideways along the face of
   * the ramp, but not away from it or into it. Imagine a sheet of glass
   * standing on the coping — you cannot cross it. Take the ramp's surface
   * normal at the moment you leave, flatten it, and that is the sheet; remove
   * whatever velocity points through it each tick and the rest of the physics
   * is untouched, so gravity, height, spins and tricks all behave normally.
   *
   * A bowl's coping bends, so the sheet has to bend with it. Every tick it
   * looks down from a little way inside the lip, finds the transition below,
   * and turns towards that surface's own facing. Travelling along a curved wall
   * therefore carries you round it, and you come down where the ramp is rather
   * than where you were pointing when you left it.
   *
   * The way out is deliberate and unchanged: hold forward and you are asking to
   * clear the coping, so the lock lets go (see _leaveCheck).
   *
   * This replaces a version that took its curve from a `_Rail_` polyline. That
   * worked in the debug parks, where a rail is drawn along every coping, and
   * mostly did not in a converted THPS level, where rails are wherever Tony
   * Hawk put something grindable: of seventeen quarter pipes ridden up at speed
   * in the Skate Park, seven locked and ten were launched off. Geometry is
   * always there.
   */
  enter() {
    const { ctrl } = this.c;
    this.c.tricks.startAir();
    /* the ground probe stays ON: unlike the version this replaced, which knew
       where the ramp was from its curve, the landing is found by looking */
    ctrl.resetShapecast(true);
    this.hold = G.LIP_HOLD_TIME;   // grace before "still pushing" means anything
    this.decided = false;
    this.turned = false;
    this.held = 0;
    /* the ramp's facing, flattened: the normal of the sheet we may not cross */
    this.planeN = new THREE.Vector3(ctrl.up_direction.x, 0, ctrl.up_direction.z);
    if (this.planeN.lengthSq() < 1e-6) this.planeN.copy(ctrl.axisZ(_v)).setY(0).multiplyScalar(-1);
    this.planeN.normalize();
    this.before = new THREE.Vector3();
    ctrl.setPathNull();
    ctrl.velocity.addScaledVector(this.planeN, -ctrl.velocity.dot(this.planeN));
    /* The ask has to come from UP HERE. The mark used to be taken when he got
       on the transition, several seconds and a whole climb earlier, so a single
       fumble of the stick on the way up armed the exit before he reached the
       top — and, worse, it made the question unanswerable in the other
       direction: see _leaveCheck. Re-marking at the lip means exactly one
       thing counts, which is leaning forward once you are there. */
    ctrl.lip_ask_mark = this.c.input.forwardAsks();
    /* the camera watches the face from its open side — see GameCamera.setVertPlane.
       Being here at all means he came UP something, so arm the memory that keeps
       the shot in place for the ride back down. */
    ctrl.pipe_climb = G.CAM_PIPE_MEMORY;
    if (this.c.cam) this.c.cam.setVertPlane(this.planeN);
  }
  exit() { this.c.tricks.endTrick(); }

  /**
   * Are you asking to leave?
   *
   * The trap here is that forward is also the push. Everyone arrives at a
   * quarter pipe holding forward, because that is how you get the speed to ride
   * up it, so "is forward held?" is true on every single approach and the lock
   * never gets to do its job. The jump button is worse: it is the original's
   * push, so holding it says "leave" too. This asked that question for a while
   * and the answer was always yes.
   *
   * So the ask has to be an ask. Forward must be pressed AGAIN once you are on
   * the lip — let go and lean back into it at the top — and still be held when
   * the question is put, a fifth of a second in. Keep the run-up push held the
   * whole way and nothing happens, which is the default: up in the plane of the
   * ramp and back down into it.
   *
   * WHAT WAS WRONG WITH IT. The question used to be asked once and then latched:
   * the first frame forward was NOT held, the answer was recorded as no and the
   * exit was shut for the rest of the lock. Letting go of forward is the first
   * half of pressing it again, so the act of asking was what closed the door —
   * across 26 lip locks in four parks, the lean-forward launched exactly none of
   * them. Now the question is simply asked every frame for as long as the lock
   * lasts, and the only latch left is the one that matters: it must be a press
   * that happened up here, not on the way up.
   */
  _leaveCheck(dt) {
    const { ctrl, input } = this.c;
    if (this.hold > 0) { this.hold -= dt; return false; }
    const i = input.getInput();
    if (i.y <= 0) return false;                                        // not asking, this frame
    if (input.forwardAsks() <= (ctrl.lip_ask_mark || 0)) return false; // the push you arrived with
    if (ctrl.velocity.y < G.LIP_LEAVE_FALL) return false;              // long past the top

    /* Leave along the way you were travelling, flat. The climb up the
       transition is doing the lifting; this is the horizontal carry that gets
       you away from the ramp instead of straight up and back onto it. */
    const flat = _v.copy(ctrl.ride_dir);
    flat.y = 0;
    if (flat.lengthSq() < 1e-6) return false;   // no usable heading: ask again next tick
    this.decided = true;
    ctrl.velocity.addScaledVector(flat.normalize(), G.LIP_PUSH);
    ctrl.popped = true;
    ctrl.setPathNull();
    this.m.go('air');
    return true;
  }

  physics(dt) {
    const { ctrl, tricks, input } = this.c;
    if (this._leaveCheck(dt)) return;
    /* a backstop: whatever else happens, the lock is not forever */
    this.held += dt;
    if (this.held > G.PIPE_LOCK_MAX) { this.m.go('air'); return; }
    ctrl.surfaceCheck(true);
    ctrl.setPreviousValues();
    if (this.groundCheck()) return;
    if (Fall.outOfBounds(ctrl.position)) { this.m.go('fall'); return; }

    this.followRamp(dt);
    ctrl.pipe_climb = G.CAM_PIPE_MEMORY;
    if (this.c.cam) this.c.cam.setVertPlane(this.planeN);   // the coping bends; the shot follows
    this.turnAtApex();
    ctrl.body.rotateY(input.getInput().x * STATS.rot_air * dt);
    ctrl.sync();
    ctrl.velocity.y -= G.GRAVITY * dt;
    /* nothing through the sheet, in velocity or in the step that follows */
    ctrl.velocity.addScaledVector(this.planeN, -ctrl.velocity.dot(this.planeN));
    ctrl.up_direction.lerp(UP, Math.min(1, dt * G.UP_ALIGN_SPEED)).normalize();
    ctrl.setCharUpDirection();
    alignUp(ctrl.body, ctrl.up_direction);
    this.before.copy(ctrl.body.position);
    const hits = ctrl.move(dt);
    /* THE SHEET DOES NOT ARGUE WITH THE RAMP. Cancelling every bit of sideways
       drift, collisions included, means the push that gets the body out of the
       ramp face is undone the moment it happens: on a near-vertical top the
       skater ends up pinned flat against the wall, sliding down it, still held
       above the lip. Dan found one in the Skate Park and the random ride
       reproduced it — four seconds and counting, in the lock, at 4.6 m/s. So
       the lock holds only while nothing is being touched; the instant the ramp
       is in the way, the ramp wins and the landing below takes over. */
    if (!hits.length) {
      const drift = _v.copy(ctrl.body.position).sub(this.before).dot(this.planeN);
      if (drift) ctrl.body.position.addScaledVector(this.planeN, -drift);
    }
    ctrl.sync();

    tricks.airTrick();
    this.grindLipCheck();
  }

  /**
   * Turn the sheet to face the way the ramp under it faces, so a bend in the
   * coping carries round instead of off. It looks from a little way back down
   * the ramp — the normal points out of the face, towards where the skater came
   * from — because straight down from the lip is the deck, not the transition.
   */
  followRamp(dt) {
    const { ctrl } = this.c;
    /* Look back down the ramp from three distances and take the steepest thing
       any of them finds. One fixed distance is not enough: a metre back from
       the lip is halfway up a Warehouse quarter pipe and already past the end of
       a short one in the Skate Park, where it lands on flat bowl floor and the
       ramp appears to have vanished. */
    let best = null;
    for (const back of G.COPING_PEEK) {
      const from = _v.copy(ctrl.body.position).addScaledVector(this.planeN, back);
      from.y += 0.2;
      const hit = ctrl.world.probe(from, DOWN, G.COPING_LOOK);
      if (!hit || hit.group === 'wall' || hit.normal.y >= G.TRANSITION_NY) continue;
      if (!best || hit.normal.y < best.normal.y) best = hit;
    }
    if (!best) return;                       // nothing to correct against; hold the plane
    const n = _w.set(best.normal.x, 0, best.normal.z);
    if (n.lengthSq() < 1e-4) return;
    n.normalize();
    if (n.dot(this.planeN) < 0.2) return;    // a different ramp entirely, not this one bending
    this.planeN.lerp(n, Math.min(1, dt * G.COPING_TURN)).normalize();
  }

  /**
   * Turn to face down the ramp as you start to fall.
   *
   * You climb a transition facing up it, and without this you come back down
   * still facing up it — or, once any drift along the coping is in the mix,
   * facing along the lip, which is how a drop-in turns into a skater lying
   * sideways across the top of the ramp with their speed gone. Measured before
   * this existed: 4 of 27 landings came down more than 60 degrees off the fall
   * line, one of them at 112 degrees and losing more than half its speed.
   *
   * So at the apex the board comes round to point down the fall line, which is
   * the way the sheet faces — out of the ramp, towards where you rode in from.
   * It is the move a skater makes at the top of a quarter pipe, and the model's
   * own spin animation carries it, so it reads as a turn rather than a snap.
   * A spinning trick is left alone: it is already turning the body.
   */
  turnAtApex() {
    const { ctrl } = this.c;
    if (this.turned || ctrl.velocity.y > 0) return;
    this.turned = true;
    this.faceFallLine();
  }

  /* Put the board on the fall line. Called at the apex, and again as the wheels
     touch down — the ramp can interrupt the flight before the apex, and landing
     across the coping is the whole problem being solved here. */
  faceFallLine() {
    const { ctrl, tricks } = this.c;
    /* Only a spin the player is actually doing gets to keep the body. Every
       air trick CAN rotate, so testing that alone cancels the turn on every
       ordinary ollie. */
    const t = tricks.is_trick_active && tricks.current_trick;
    if (t && Math.abs(t.getRotation()) > 0.35) return;
    const down = _v.copy(this.planeN); down.y = 0;
    if (down.lengthSq() < 1e-6) return;
    down.normalize();
    const fwd = _w.copy(ctrl.axisZ(_u)); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    const side = ctrl.axisX(_u).dot(down) >= 0 ? 1 : -1;
    const turning = fwd.normalize().dot(down) < 0.7;
    ctrl.lookAlong(down, ctrl.up_direction);
    if (turning && ctrl.onSwitch) ctrl.onSwitch(side, ctrl.body);
  }

  /**
   * Have we come back down onto it?
   *
   * Not `shape_col_ground`: that only accepts a surface within 60 degrees of
   * the way the skater is standing (SHAPE_COL_DOT), and the body levels out
   * while it is in the air, so the near-vertical top of a transition can never
   * satisfy it — which is the other half of how a skater ends up stuck against
   * the wall. Above the lip you come down vertically, so look vertically.
   */
  groundCheck() {
    const { ctrl } = this.c;
    if (ctrl.velocity.y > 0) return false;
    const from = _v.copy(ctrl.body.position); from.y += 0.25;
    const hit = ctrl.world.probe(from, DOWN, 0.25 + G.PIPE_LAND_DIST);
    if (!hit || hit.group === 'wall') return false;
    /* The apex turn has already put the board on the fall line, so the landing
       tidy-up that Air does is skipped here — it straightens onto the line you
       are TRAVELLING, and on a ramp taken at an angle that line runs along the
       coping, which is the very thing being fixed. */
    this.faceFallLine();
    this.m.go(hit.group === 'floor' && hit.normal.y >= G.TRANSITION_NY ? 'ground' : 'pipe');
    return true;
  }

  /**
   * Asking to grind, and the ask outliving the press.
   *
   * The press used to have to land on the frame the rail was already under you.
   * Anyone riding up a ramp towards a coping, or dropping out of the air onto a
   * rail, pressed grind a good half-second early and got nothing — Dan's two
   * cases exactly. So a press starts a timer instead, and the catch is tried
   * every frame until it runs out.
   *
   * From the air it is also tried more forgivingly: further from the rail, and
   * without demanding that you already be travelling along it. Dropping onto a
   * rail is almost never along it, which is why the original's figure turned
   * nearly every attempt down.
   */
  grindLipCheck(fromAir = false) {
    const { ctrl, input } = this.c;
    if (input.getInputGrind()) ctrl.grind_ask = G.GRIND_ASK;
    if ((ctrl.grind_ask || 0) <= 0) return false;
    if (fromAir) ctrl.setPath(G.GRIND_AIR_REACH);
    const align = fromAir ? G.GRIND_AIR_ALIGN : 0.25;
    if (ctrl.getCanGrind(align)) { ctrl.grind_ask = 0; this.m.go('grind'); return true; }
    if (ctrl.getCanLip()) { ctrl.grind_ask = 0; this.m.go('lip'); return true; }
    return false;
  }
}

/* --------------------------------------------------------- Fall/Reset */

/* ----------------------------------------------------------- Wallride */

class Wallride {
  /**
   * On the wall.
   *
   * The whole thing is one idea: make the wall the ground. up_direction
   * becomes the wall's own normal, so every piece of machinery that already
   * knows how to stand a skater on a surface — alignUp, the character's up,
   * the animation blend — puts them out of the wall with the board flat on it,
   * with no new animation needed. What is left is the part that makes it a
   * wallride rather than a floor: gravity still points DOWN the world, so it
   * drags you along the face and you have a few seconds before you run out of
   * wall. Jump kicks you off it.
   */
  enter() {
    const { ctrl, tricks, cam, anim } = this.c;
    this.n = new THREE.Vector3();
    this.held = 0;
    const v = _v.copy(ctrl.velocity); v.y = 0;
    if (v.lengthSq() < 1e-6) v.copy(ctrl.axisZ(_u)).setY(0);
    v.normalize();
    const from = _w.copy(ctrl.body.position).addScaledVector(UP, 0.35);
    const hit = ctrl.world.probe(from, v, G.WALLRIDE_RAY);
    this.n.copy(hit ? hit.normal : v.clone().multiplyScalar(-1));
    this.n.y = 0;
    if (this.n.lengthSq() < 1e-6) this.n.set(0, 0, 1);
    this.n.normalize();

    /* Commit, on this frame.
     *
     * Catching the wall from a metre out and then asking, next tick, whether
     * there is still a wall within a metre is how you get 374 "wallrides"
     * totalling six seconds: it caught and dropped it every other frame. So the
     * board goes ON the wall now — snapped to the face, velocity flattened into
     * it, and if what is left is too slow to be a ride, given enough to be one.
     * From here the hold probe only ever has to find a wall an arm's length
     * away, which it does. */
    if (hit) ctrl.body.position.addScaledVector(this.n, P.BODY_RADIUS - hit.distance * -this.n.dot(v));
    ctrl.velocity.addScaledVector(this.n, -ctrl.velocity.dot(this.n));
    const flat = _u.copy(ctrl.velocity); flat.y = 0;
    const sp = flat.length();
    if (sp > 1e-3 && sp < G.WALLRIDE_MIN_SPEED) {
      ctrl.velocity.addScaledVector(flat.divideScalar(sp), G.WALLRIDE_MIN_SPEED - sp);
    }
    ctrl.setPathNull();
    /* the downward ground probe would find the floor below and yank us off the
       wall on the first tick; this state does its own looking */
    ctrl.resetShapecast(false);
    tricks.wallrideTrick();
    if (anim) anim.setWallride(G.WALLRIDE_LEAN);
    if (cam) cam.setVertPlane(this.n);
  }

  exit() {
    const { ctrl, anim, tricks } = this.c;
    ctrl.resetShapecast(true);
    ctrl.wallride_cool = G.WALLRIDE_COOLDOWN;
    if (anim) anim.setWallride(0);
    /* clipping the corner of a wall on the way past is not a wallride, and
       should not put a trick name on the screen or points in the combo */
    if (this.held < G.WALLRIDE_MIN_SHOW) tricks.dropTrick();
    else tricks.endTrick();
  }

  physics(dt) {
    const { ctrl, input, cam, tricks } = this.c;
    this.held += dt;
    ctrl.setPreviousValues();
    tricks.holdTick(dt);              // a wallride pays by the second

    if (this.held > G.WALLRIDE_MAX_TIME) { this.why = 'time'; this.m.go('air'); return; }

    /* still on it? and where exactly — a wall can curve */
    const into = _u.copy(this.n).multiplyScalar(-1);
    const from = _w.copy(ctrl.body.position).addScaledVector(UP, 0.35);
    const hit = ctrl.world.probe(from, into, G.WALLRIDE_HOLD + P.BODY_RADIUS);
    if (!hit || !hit.ride || Math.abs(hit.normal.y) > G.WALLRIDE_MAX_NY) {
      this.why = !hit ? 'lost the wall' : (!hit.ride ? 'not rideable' : 'too flat'); this.m.go('air'); return; }
    this.n.copy(hit.normal); this.n.y = 0;
    if (this.n.lengthSq() < 1e-6) { this.why = 'flat normal'; this.m.go('air'); return; }
    this.n.normalize();
    /* sit against the face, correcting only along the normal so the probe's
       own 0.35 m lift cannot creep into the height */
    ctrl.body.position.addScaledVector(this.n, P.BODY_RADIUS - hit.distance);

    if (input.getInputJump()) { this.why = 'kicked off'; this.kickOff(); return; }

    /* nothing through the wall, and gravity down the face of it */
    ctrl.velocity.addScaledVector(this.n, -ctrl.velocity.dot(this.n));
    ctrl.velocity.y -= G.WALLRIDE_GRAVITY * dt;

    const flat = _v.copy(ctrl.velocity); flat.y = 0;
    if (flat.length() < G.WALLRIDE_MIN_KEEP) { this.why = 'ran out of speed'; this.m.go('air'); return; }

    /* down to the floor again: land and ride away */
    const down = ctrl.world.probe(_w.copy(ctrl.body.position), DOWN, G.WALLRIDE_MIN_AIR);
    if (down && down.group !== 'wall' && down.normal.y > 0.5) {
      ctrl.up_direction.set(0, 1, 0);
      this.why = 'reached the floor';
      this.m.go('ground');
      return;
    }

    ctrl.up_direction.lerp(this.n, Math.min(1, dt * G.UP_ALIGN_SPEED)).normalize();
    ctrl.setCharUpDirection();
    if (ctrl.velocity.lengthSq() > 1e-4) {
      ctrl.lookAlong(_u.copy(ctrl.velocity).normalize(), ctrl.up_direction);
    }
    alignUp(ctrl.body, ctrl.up_direction);
    ctrl.move(dt);
    ctrl.sync();
    if (cam) cam.setVertPlane(this.n);
    this.c.tricks.airTrick();          // grabs and flips still work off a wall
  }

  /** Jump out of it: away from the wall and up, as a pop you can land. */
  kickOff() {
    const { ctrl, input } = this.c;
    input.setJumpCooldown();
    input.buffer.clear();
    ctrl.velocity.addScaledVector(this.n, G.WALLRIDE_KICK);
    /* the same pop as any other ollie, speed scaling included — see ollieGain */
    ctrl.velocity.y = Math.max(ctrl.velocity.y, 0) + STATS.jump_vel * ollieGain(ctrl);
    ctrl.up_direction.set(0, 1, 0);
    ctrl.popped = true;
    this.m.go('air');
  }
}

class FallState {
  enter() {
    const { ctrl, hud } = this.c;
    ctrl.setFall();
    hud.setFailView(true, Fall.forgiving);
    this.hold = 0.6;   // don't let a still-held key skip the bail instantly
    /* Out of bounds — down one of the Warehouse's floor holes. The bail timer
       is two seconds, which is two seconds of watching the skater drop into
       nothing. Cut it to a beat: long enough to read BAIL, short enough not to
       plummet. (Measured before this: minimum y of -24.8 on a level whose
       lowest geometry is -1.6.) */
    if (Fall.outOfBounds(ctrl.position)) { this.hold = 0.35; ctrl.fall_timer = 0.35; }
    /* the original ragdolls the skeleton here (character_ragdoll.gd). There is
       no ragdoll in this port, so the VISUAL tumbles while the body stays
       upright for collision — enough to read as a wipeout, and the skater
       never ends up buried in the floor. */
    this.c.anim.startTumble();
  }
  exit() {
    const { ctrl, tricks, hud } = this.c;
    tricks.performed_olli = false;
    ctrl.resetShapecast(true);
    hud.setFailView(false);
    this.c.anim.endTumble();
  }
  physics(dt) {
    const { ctrl, input } = this.c;
    /* the skater keeps tumbling: gravity and a slide, no control */
    ctrl.velocity.y -= G.GRAVITY * dt;
    ctrl.velocity.x *= 0.985; ctrl.velocity.z *= 0.985;
    ctrl.move(dt);
    this.c.anim.tumble(dt);
    ctrl.fall_timer -= dt;
    this.hold -= dt;
    /* PORT: player_fall.gd only leaves this state on Up. A seven-year-old who
       has not found W yet would sit in a bail for ever, so Jump counts too and
       FALL_TIMER (2 s, set but never spent upstream) picks you up on its own. */
    if (this.hold <= 0 && (input.isHeld('Up') || input.isHeld('Jump') || ctrl.fall_timer <= 0)) this.m.go('reset');
  }
}

class Reset {
  enter() {
    const { ctrl, anim } = this.c;
    ctrl.resetPlayer();
    anim.snapTo(ctrl.body);
    anim.init(true);
    anim.resetBalance();
    ctrl.surfaceCheck(false, false);
    /* PORT: player_reset.gd waits for Up before handing control back; here a
       quarter-second beat does it, so getting up never needs a second key. */
    this.wait = 0.25;
  }
  physics(dt) {
    this.wait -= dt;
    if (this.wait <= 0) this.m.go('ground');
  }
}

class Setup {
  enter() { this.c.anim.init(false); this.c.anim.resetBalance(); }
  physics(dt) {
    const { ctrl, input } = this.c;
    ctrl.body.rotateY(input.getInput().x * STATS.rot_setup * dt);
    ctrl.sync();
  }
}

export function buildStateMachine(ctx) {
  return new StateMachine(ctx)
    .add('setup', new Setup())
    .add('ground', new Ground())
    .add('pipe', new Pipe())
    .add('pipesnap', new Pipesnap())
    .add('air', new Air())
    .add('grind', new Grind())
    .add('lip', new Lip())
    .add('wallride', new Wallride())
    .add('fall', new FallState())
    .add('reset', new Reset());
}
