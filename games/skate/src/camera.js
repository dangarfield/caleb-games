/* camera.js — two ways to watch.
 *
 * FIXED is the original's: Scenes/player_character.tscn parents the camera to a
 * node that lerps towards the skater but never rotates, so the whole park is
 * seen from one unchanging angle. It is what gives Godot_Skate its diorama look
 * and it is kept, exactly, as an option.
 *
 * FOLLOW is the default here, because on a park you are trying to learn, a
 * camera that always shows you what is in front of the board is worth more than
 * the look. It trails the skater's heading with heavy damping — heavier still
 * in the air, so a 540 does not throw the view around — and never dips below
 * the surface you are riding.
 */
import * as THREE from 'three';
import { P } from './config.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
const _eye = new THREE.Vector3(), _ray = new THREE.Vector3(), _side = new THREE.Vector3();
const _probe = new THREE.Vector3(), _sd = new THREE.Vector3();
const _g = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/* how far either side of the head the clearance rays start */
const SIDE_PROBE = 0.4;

export class GameCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.ready = false;

    /* the fixed rig, straight out of the scene file */
    const dir = new THREE.Vector3(...P.CAM_DIR).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
    this.fixedQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    this.fixedOffset = new THREE.Vector3(...P.CAM_OFFSET);
    this.fixedPos = new THREE.Vector3();

    /* follow rig */
    this.distance = 6.4;
    this.height = 2.75;
    this.lookAhead = 1.15;
    this.kickTimer = 0;
    /* How close it may get when squeezed. Wedge the skater into a corner of
       Downtown and even a metre and a half behind his head is inside the wall,
       so this goes almost to first person rather than leave the view buried.
       The near plane is 0.3, so nothing clips. */
    this.minDistance = 0.6;
    this.occluded = this.distance;

    /* the vert lock — see update() */
    this.vertHold = false;
    this.vertYaw = 0;
    this.vertRelease = 0;
    this.vertPlaned = false;

    /* how far the lens is riding above (or below) the skater's own height to
       stay with the ground behind him — see the slope block in update() */
    this.slope = 0;
  }

  /**
   * A stance switch turns the skater 180 in one frame, and a camera easing
   * round at its usual rate would take most of a second to get behind them
   * again. This makes it hurry for a moment.
   */
  kick() { this.kickTimer = 0.35; }

  /**
   * The plane lock has taken over, and this is the face it is holding — its
   * normal points away from the ramp, out over the bowl.
   *
   * Freezing the camera at the heading the skater rode in on was nearly right
   * and came apart under a held stick: every bounce back into the lock re-froze
   * it at whatever the spun heading had become, and after a few seconds of
   * that, "behind the skater" was through the wall. The wall itself does not
   * spin. Sitting on its open side is the same shot every time, and it is the
   * one a skating game uses.
   */
  setVertPlane(n) {
    if (!n || (n.x * n.x + n.z * n.z) < 1e-6) return;
    this.vertYaw = Math.atan2(-n.x, -n.z);
    this.vertHold = true;
    this.vertPlaned = true;
    this.vertRelease = P.CAM_VERT_HOLD;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.ready = false;      // re-seat rather than sweep across the park
  }

  /** Drop the camera exactly where it belongs, with no easing. */
  snap(ctrl) {
    this.ready = false;
    this.update(1, ctrl, 'ground');
  }

  update(dt, ctrl, stateName) {
    /* Follow what is on the SCREEN, not what the physics step left behind —
       chasing the stepped position put the camera's own judder on top of the
       skater's. See CharacterController.setRenderAlpha. */
    const target = ctrl.renderPos && ctrl.renderPos.lengthSq() ? ctrl.renderPos : ctrl.position;

    if (this.mode === 'fixed') {
      /* Camera_Pos.global_position.lerp(global_position, delta * 10) */
      if (!this.ready) { this.fixedPos.copy(target); this.ready = true; }
      this.fixedPos.lerp(target, Math.min(1, dt * P.CAM_LERP));
      this.camera.position.copy(this.fixedPos).add(this.fixedOffset);
      this.camera.quaternion.copy(this.fixedQuat);
      return;
    }

    /* --- follow --- */
    const fwd = _v.setFromMatrixColumn(ctrl.body.matrixWorld, 2);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); else fwd.normalize();
    let wantYaw = Math.atan2(fwd.x, fwd.z);

    if (!this.ready) {
      this.yaw = wantYaw;
      this.pos.copy(target).addScaledVector(fwd, -this.distance).setY(target.y + this.height);
      this.look.copy(target);
      this.occluded = this.distance;
      this.vertHold = false;
      this.vertPlaned = false;
      this.vertRelease = 0;
      this.slope = 0;          // a respawn starts level, whatever the last ramp did
      this.ready = true;
    }

    /* --- the vert lock -------------------------------------------------
     *
     * A camera that always gets behind the skater is right everywhere except
     * on a quarter pipe. Up there the plane lock turns them 180 at the apex,
     * the camera set off after it, and the only place behind them is inside
     * the wall — so the occlusion probe hauled it in to minDistance and the
     * screen filled with the back of their head.
     *
     * A skating game does not do that. The vert camera holds the angle you
     * took off at and watches from where it already was, and only swings
     * round behind once you are back down and rolling away from the ramp.
     * So: freeze the yaw on entering the lock, and let go of it when they are
     * on the ground with some speed under them — or after CAM_VERT_HOLD, in
     * case they end up somewhere that never satisfies that.
     */
    if (stateName === 'pipesnap') {
      /* setVertPlane normally gets here first; this is the fallback for a lock
         with no usable plane, which keeps the old freeze-on-entry behaviour */
      if (!this.vertHold) { this.vertHold = true; this.vertYaw = this.yaw; }
      this.vertRelease = P.CAM_VERT_HOLD;
    } else if (this.vertHold) {
      const grounded = stateName === 'ground' || stateName === 'grind' || stateName === 'lip';
      const rolling = grounded && ctrl.velocity.lengthSq() > P.CAM_VERT_ROLL * P.CAM_VERT_ROLL;
      this.vertRelease -= dt;
      if (rolling || this.vertRelease <= 0) { this.vertHold = false; this.vertPlaned = false; }
    }
    /* held: the angle does not move, so nothing below has to know about it.
     *
     * A low-pass on the raw reading was tried here — the body is re-levelled
     * onto the ground normal every tick, so its forward axis twitches — and it
     * took 5% off the camera's frame-to-frame wobble while adding 80 ms of lag
     * to its heading. That lag put the camera 1.5 m from where it used to be
     * during a fast turn, which on a quarter pipe is 1.5 m inside the wall:
     * three burials in seventy-one rides where there had been none. The
     * judder was never in the yaw. It was that the frame drew whatever position
     * the last physics step left behind — see setRenderAlpha. */
    if (this.vertHold) wantYaw = this.vertYaw;

    /* shortest way round, and lazier while airborne or bailing */
    const airborne = stateName === 'air' || stateName === 'pipesnap' || stateName === 'fall';
    let delta = wantYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (this.kickTimer > 0) this.kickTimer -= dt;
    const yawRate = airborne ? 1.1 : (this.kickTimer > 0 ? 11 : 3.4);
    this.yaw += delta * Math.min(1, dt * yawRate);

    const back = _w.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    /* pull out a little with speed, so fast lines read further ahead. Off the
       RAW speed: smoothing it took a little of the frame-to-frame wobble out,
       and held the camera 1.5 m further back for a fifth of a second after a
       ramp had already stopped the skater — which is 1.5 m deeper into the wall
       behind, and three burials in seventy-one rides. Not worth it. */
    const speed = Math.min(1, ctrl.velocity.length() / 12);
    const dist = this.distance + speed * 1.5;
    _t.copy(target).addScaledVector(back, -dist);

    /* Ride the slope, not the skater.
     *
     * `back` is the way he is FACING, so the camera sits dist behind him — and
     * on a descent behind him is up the hill. Holding the lens at a fixed
     * height over his head puts it under the ground he just came down; a
     * quarter of the frames measured on five parks had under a metre of air
     * beneath it and the occlusion probe kept dragging the shot onto the back
     * of his head. So work out where the ground he is standing on would be at
     * the camera's spot — the plane through him with the surface normal — and
     * carry the lens with it. Going down that lifts it and tips the view down
     * the hill, which is what you want to be looking at anyway; going up it
     * drops the lens in behind him instead of leaving it hanging in the air.
     *
     * Only for ground you could describe as sloping. A transition gets steep
     * enough that dividing by n.y runs away, and up there the vert lock is the
     * right answer, not this. */
    const gn = (ctrl.shape_col_ground && ctrl.shape_col_ground.normal) || ctrl.up_direction;
    let wantSlope = 0;
    if (!this.vertHold && gn && gn.y > P.CAM_SLOPE_MIN_NY) {
      wantSlope = dist * (back.x * gn.x + back.z * gn.z) / gn.y;
      wantSlope = Math.max(-P.CAM_SLOPE_DROP, Math.min(P.CAM_SLOPE_LIFT, wantSlope));
    }
    /* eased, or every ripple in the ground under the board is a nudge of the
       camera; the ground normal changes the instant he crosses onto a new face */
    this.slope += (wantSlope - this.slope) * Math.min(1, dt * P.CAM_SLOPE_EASE);
    _t.y = target.y + this.height + speed * 0.35 + this.slope;

    /* ...and then look where it actually ended up. The plane above assumes the
       hill carries on behind him at the gradient under his board, which is
       close enough most of the time and wrong wherever the slope steepens or a
       step comes up behind. One probe straight down from a little over the
       wanted spot says what is really there; if the ground has come up to meet
       the lens, the lens goes up with it. Started just above where the camera
       wants to be rather than from high overhead, so an indoor park's ceiling
       is never what it finds. */
    if (ctrl.world) {
      const from = _g.set(_t.x, _t.y + P.CAM_GROUND_LOOK, _t.z);
      const hit = ctrl.world.probe(from, DOWN, P.CAM_GROUND_LOOK + P.CAM_GROUND_REACH);
      if (hit) {
        const clear = hit.point.y + P.CAM_GROUND_CLEAR;
        if (clear > _t.y) _t.y = Math.min(clear, _t.y + P.CAM_GROUND_MAX);
      }
    }

    /* Don't let the park get between the camera and the skater.
     *
     * On the debug bowls the camera never had anything to hide behind. A
     * converted THPS level is a building: ride into a corridor and the wall you
     * just came through is now sitting in front of the lens. So sweep from the
     * skater's head out to where the camera wants to be, and if something is in
     * the way, sit just in front of it instead.
     *
     * Closing in is instant (you cannot see anything while it is happening) and
     * backing out again is eased, so passing a pillar does not fire the view
     * across the park. */
    _eye.set(target.x, target.y + 1.0, target.z);
    _ray.subVectors(_t, _eye);
    const want = _ray.length();
    let allowed = want;
    if (want > 1e-4 && ctrl.world) {
      _ray.divideScalar(want);
      /* three rays, not one: a single centre ray slides along the face of a
         wall and only notices it when the camera is already flush against it,
         which reads as the corner of the screen filling with grey. Probing a
         board's width either side keeps a little clearance. */
      _side.set(-_ray.z, 0, _ray.x);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0); else _side.normalize();
      for (let k = -1; k <= 1; k++) {
        let off = k * SIDE_PROBE;
        if (k !== 0) {
          /* A side ray needs somewhere to START.
           *
           * Up the vert wall of the School II bowl, hard against the end wall,
           * there is less than 40 cm of air off one shoulder — so the offset
           * origin landed INSIDE that wall, the probe answered "something 2 cm
           * away", and the camera was hauled onto the back of the skater's head
           * while the real view out over the bowl was completely clear. The
           * centre ray hit nothing at all; one bad side ray did the whole thing.
           *
           * So ask how much room there is that way first, and either start
           * inside it or, if there is none, do not probe that side. */
          _sd.set(_side.x * k, 0, _side.z * k);
          const room = ctrl.world.probe(_eye, _sd, SIDE_PROBE + 0.1);
          if (room) {
            if (room.distance < SIDE_PROBE * 0.5) continue;
            off = k * (room.distance - 0.1);
          }
        }
        _probe.set(target.x + _side.x * off, target.y + 1.0, target.z + _side.z * off);
        const hit = ctrl.world.probe(_probe, _ray, want + 0.2);
        /* a hit on the nose of the ray means it began inside something; that is
           a bad reading, not a wall between the camera and the skater */
        if (hit && hit.distance > 0.1) {
          allowed = Math.min(allowed, Math.max(this.minDistance, hit.distance - 0.35));
        }
      }
    }
    /* close in fast, ease out — but not on one frame either way, and not at all
       for a few centimetres, or probe noise reads as the camera lunging */
    this.occluded = allowed < this.occluded
      ? allowed
      : this.occluded + Math.min(allowed - this.occluded, dt * 9);
    if (this.occluded < want - 1e-4) {
      _t.copy(_eye).addScaledVector(_ray, this.occluded);
    }

    const tight = this.occluded < want - 0.05;
    this.pos.lerp(_t, Math.min(1, dt * (tight ? 26 : 6.5)));
    /* never let the view sink through whatever we are standing on. Tried easing
       this instead of clamping, to take the jolt out of it engaging and letting
       go on rolling ground; it bought nothing measurable and let the camera dip
       close enough on a fast climb to be hauled in by the occlusion probe —
       three burials in seventy-one rides where there had been none. Clamped. */
    /* the clamp moves with the slope too: going UP one, the ground behind him
       is lower and the lens is supposed to be down there with it */
    const floor = target.y + 0.7 + Math.min(0, this.slope);
    if (this.pos.y < floor && !tight) this.pos.y = floor;

    this.look.lerp(_t.copy(target).addScaledVector(back, this.lookAhead).setY(target.y + 1.0),
      Math.min(1, dt * 8));

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
