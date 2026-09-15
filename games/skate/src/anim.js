/* anim.js — character_animation.gd, rebuilt on an AnimationMixer.
 *
 * SK_char.glb ships eighteen baked clips and this port uses every one of them.
 * Godot drove them through an AnimationTree: a BlendSpace2D called "Ground"
 * mixing Ground / GroundLeft / GroundRight / GroundBreak by the stick, an
 * Idle_Stand for standing still, and two one-shot slots (Trick0/Trick1) that
 * alternate so one trick can cross-fade into the next mid-combo.
 *
 * There is no AnimationTree in Three.js, so the blend space is four actions
 * whose weights are set every frame, and the two trick slots are one action
 * played with clampWhenFinished.
 *
 * The visual model is deliberately NOT the physics body: Godot interpolates the
 * character towards the controller at INTERP_SPEED, which is what stops the
 * skater snapping when the collide-and-slide corrects them.
 */
import * as THREE from 'three';
import { G, P } from './config.js';

const GROUND_SET = ['Ground', 'GroundLeft', 'GroundRight', 'GroundBreak'];
const ANIM_INTERP_SPEED = 5.0;

export class CharacterAnimation {
  constructor(model, clips, input) {
    this.input = input;
    this.model = model;              // the visual root (not the physics body)
    this.rig = new THREE.Group();    // stands in for Skeleton3D, carries balance lean
    this.rig.add(model);
    /* Carries the stance switch and nothing else. The body yaws 180 in one
       frame because the physics needs it to; this group starts at the opposite
       180 and unwinds, so what you SEE is the skater spinning round over a
       fifth of a second. Without it the visual either teleports or slerps
       through an ambiguous half-turn and picks its direction at random. */
    this.turn = new THREE.Group();
    this.turn.add(this.rig);
    this.root = new THREE.Group();   // the interpolated transform
    this.root.add(this.turn);
    this.turnY = 0;
    this.turnRate = 0;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions[clip.name] = a;
    }
    /* trick clips are one-shot; everything else loops */
    for (const name in this.actions) {
      if (!GROUND_SET.includes(name) && name !== 'Idle_Stand' && name !== 'Idle') {
        const a = this.actions[name];
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }

    this.blend = new THREE.Vector2();
    this.trickName = null;
    this.trickTime = 0;
    /* A held pose: how far it has come on (0..1), how long the two blends take,
       whether the clip is parked, and how long the way out is. See holdTrick. */
    this.trickWeight = 1;
    this.trickFade = 0;
    this.trickHold = false;
    this.trickRelease = 0;
    this.riding = false;
    this.stopped = true;
    this.weights = {};
  }

  /* character_animation.gd::init */
  init(isPlaying) {
    this.setTrickCleared();
    this.riding = false;
    this.stopped = !isPlaying;
    this.resetBalance();
  }

  update(dt) {
    const i = this.input.getInput();
    this.blend.lerp(new THREE.Vector2(i.x, i.y), Math.min(1, dt * ANIM_INTERP_SPEED));

    if (this.trickName) {
      if (this.trickRelease > 0) {
        /* on the way out — the pose fades and the trick is not over until it
           has gone, which is what stops the next trick starting early */
        this.trickWeight = Math.max(0, this.trickWeight - dt / this.trickRelease);
        if (this.trickWeight <= 0) this.setTrickCleared();
      } else {
        if (this.trickFade > 0 && this.trickWeight < 1) {
          this.trickWeight = Math.min(1, this.trickWeight + dt / this.trickFade);
        }
        if (!this.trickHold) {
          this.trickTime -= dt;
          if (this.trickTime <= 0) this.setTrickCleared();
        }
      }
    }

    if (this.turnY !== 0) {
      const s = Math.sign(this.turnY);
      this.turnY -= s * this.turnRate * dt;
      if (Math.sign(this.turnY) !== s) this.turnY = 0;
      this.turn.rotation.y = this.turnY;
    }
    this._applyWeights(dt);
    this.mixer.update(dt);
  }

  _applyWeights(dt) {
    const target = {};
    for (const n in this.actions) target[n] = 0;

    if (this.trickName && this.actions[this.trickName]) {
      target[this.trickName] = this.trickWeight;
    } else if (this.stopped) {
      target['Idle_Stand'] = 1;
    } else {
      /* the BlendSpace2D, by hand: x is steering (+ is left), y is push/brake */
      const bx = this.blend.x, by = this.blend.y;
      const left = Math.max(0, bx), right = Math.max(0, -bx), brake = Math.max(0, -by);
      const rest = Math.max(0, 1 - left - right - brake);
      target['GroundLeft'] = left;
      target['GroundRight'] = right;
      target['GroundBreak'] = brake;
      target['Ground'] = rest;
    }

    const k = Math.min(1, dt * 12);
    for (const n in this.actions) {
      const cur = this.weights[n] ?? 0;
      const w = cur + (target[n] - cur) * (this.trickName === n ? 1 : k);
      this.weights[n] = w;
      this.actions[n].setEffectiveWeight(w);
    }
  }

  /* character_animation.gd::animation_handler_ground_pipe */
  handleGround(velocity) {
    if (velocity.length() > 0.05) { this.riding = true; this.stopped = false; }
    else { this.riding = false; this.stopped = true; }
    this.setTrickCleared();
  }

  setAirPose() {
    /* Godot leaves the last trick playing in the air; if nothing is running,
       hold the Olli pose so the skater is not riding on nothing */
    if (!this.trickName) { this.stopped = false; }
  }

  /* character_animation.gd::set_trick_animation */
  setTrickAnimation(name, fade = 0) {
    if (!name) { this.setTrickCleared(); return; }   // a trick with no clip of its own
    const a = this.actions[name];
    if (!a) return;
    this.riding = false; this.stopped = false;
    if (this.trickName && this.trickName !== name) {
      this.actions[this.trickName].setEffectiveWeight(0);
      this.actions[this.trickName].paused = false;
      this.weights[this.trickName] = 0;
    }
    a.reset();
    a.paused = false;
    a.play();
    this.trickName = name;
    /* fade > 0 means the pose eases on over that many seconds instead of
       appearing on the frame the button went down — the first half of a grab. */
    this.trickFade = fade;
    this.trickWeight = fade > 0 ? 0 : 1;
    this.trickHold = false;
    this.trickRelease = 0;
    a.setEffectiveWeight(this.trickWeight);
    this.weights[name] = this.trickWeight;
    this.trickTime = a.getClip().duration;
  }

  /* Park the clip where it is, for as long as the player keeps hold of it. */
  holdTrick(on) {
    this.trickHold = !!on;
    const a = this.trickName && this.actions[this.trickName];
    if (a) a.paused = !!on;
  }

  /* Let it go again: the pose blends off over `fade` seconds and the trick is
     finished when it has. */
  releaseTrick(fade) {
    if (!this.trickName) return;
    this.trickHold = false;
    const a = this.actions[this.trickName];
    if (a) a.paused = false;
    if (fade > 0) { this.trickRelease = fade; return; }
    this.setTrickCleared();
  }

  /* 1 once the pose is fully on; used to decide when the hold starts paying. */
  trickBlend() { return this.trickName ? this.trickWeight : 0; }

  setTrickCleared() {
    if (this.trickName) {
      const a = this.actions[this.trickName];
      if (a) { a.fadeOut(0.12); a.paused = false; }
      this.trickName = null;
    }
    this.trickHold = false;
    this.trickRelease = 0;
    this.trickFade = 0;
    this.trickWeight = 1;
  }

  /* character_animation.gd::set_vis_balance — the lean that tells you which way
     you are about to fall off the rail */
  setBalance(axis, angle) {
    if (axis === 0) this.rig.rotation.set(0, 0, -angle * 0.5);
    else this.rig.rotation.set(-angle * 0.5, 0, 0);
  }
  resetBalance() { this.rig.rotation.set(0, 0, 0); }

  /**
   * A wallride needs no clip of its own.
   *
   * The body is already standing on the wall — the state hands up_direction the
   * wall's normal and alignUp does the rest, so the riding blend puts the board
   * flat on the face with the rider out of it, which is the pose. All that is
   * missing is the lean: on a real wallride the rider's weight is back, away
   * from the wall, and that is one rotation of the rig. Pass 0 to clear it.
   */
  setWallride(lean) {
    this.wallLean = lean || 0;
    this.rig.rotation.set(-this.wallLean, 0, 0);
  }

  /**
   * The body has already turned 180. Snap the interpolated root to it — a slerp
   * across half a turn has no short way round and would wander — and hand the
   * visible rotation to the turn group, which unwinds over SWITCH_SPIN_TIME.
   */
  spinFlip(side, body) {
    this.root.quaternion.copy(body.quaternion);
    this.turnY = -side * Math.PI;
    this.turnRate = Math.PI / G.SWITCH_SPIN_TIME;
    this.turn.rotation.y = this.turnY;
  }

  /* stand-in for character_ragdoll.gd: the visual falls over and slides */
  startTumble() {
    this._spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
    this._roll = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
    this._tumbling = true;
    this.setTrickCleared();
    this.stopped = true;
  }
  tumble(dt) {
    if (!this._tumbling) return;
    this.rig.rotation.x += this._spin * dt;
    this.rig.rotation.z += this._roll * dt;
    /* lift the pivot to the hips so a face-plant does not sink through */
    this.rig.position.y += (0.5 - this.rig.position.y) * Math.min(1, dt * 8);
    this._spin *= 0.965; this._roll *= 0.965;
  }
  endTumble() {
    this._tumbling = false;
    this.rig.rotation.set(0, 0, 0);
    this.rig.position.set(0, 0, 0);
  }

  /* character_animation.gd::set_vis_transform */
  /**
   * @param {THREE.Vector3} [pos] where to draw him — the position interpolated
   *   between the last two physics steps, not the raw stepped one. The
   *   rotation keeps its own soft chase, which is what makes a stance swap
   *   read as a turn rather than a snap.
   */
  follow(body, dt, pos) {
    const t = Math.min(1, dt * G.INTERP_SPEED);
    this.root.quaternion.slerp(body.quaternion, t);
    this.root.position.copy(pos || body.position);
    this.root.updateMatrixWorld(true);
  }
  snapTo(body) {
    this.root.quaternion.copy(body.quaternion);
    this.root.position.copy(body.position);
    this.root.updateMatrixWorld(true);
  }

  setYawOffset(y) { this.model.rotation.y = y; }
}

export function modelYaw() { return P.MODEL_YAW; }
