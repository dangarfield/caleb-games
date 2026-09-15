/* tricks.js — Scripts/Tricks/*.gd and character_tricks.gd.
 *
 * Every trick is a tiny record: a name, a duration, a score and the animation
 * to play.
 *
 * PORT: WHICH trick you get is the difference. The original matches the tail of
 * the input buffer against a sequence — UP+GRIND is a Boardslide, bare GRIND is
 * a Frontside — which means the whole trick list is a thing you have to know
 * before you can do any of it, and on a tablet it is two thumbs' worth of
 * coordination for a seven-year-old. Here each button owns a FAMILY and picks
 * from it at random, never twice running, so pressing FLIP gives you a Kickflip
 * this time and a Hardflip the next and the combo reads as a real run of
 * different tricks. Nothing to memorise, and the variety comes for free.
 *
 * The animation set is smaller than the trick list on purpose: SK_char.glb has
 * one flip clip, two grabs, five grinds and three lip poses, so several named
 * tricks share a clip. The original does this too — its Heelflip and Kickflip
 * are both Flip_Kickflip.
 *
 * Rotation: while a trick is active the stick's X axis spins the skater, the
 * angle is accumulated on the trick, and it is reported rounded to the nearest
 * 15 degrees ("Kickflip 360").
 */
import { Action } from './input.js';
import { COMBO_COOLDOWN_TIME, G, ROT_ROUNDING, STATS } from './config.js';

class Trick {
  constructor(o) {
    this.trick_name = o.name;
    this.duration = o.duration;
    this.base_score = o.score ?? 300;
    this.trick_animation = o.anim;
    this.can_rotate = !!o.rotate;
    this.can_hold = !!o.hold;
    /* An ollie is not a trick until you turn it into one. See banks(). */
    this.plain = !!o.plain;
    this.hold_action = o.holdAction ?? null;
    /* Points a second while the trick is being held, and the most one trick can
       bank that way. Zero for a flip or an ollie: those pay a flat rate. */
    this.hold_rate = o.holdRate ?? 0;
    this.hold_cap = o.holdCap ?? 0;
    this.trick_rotation = 0;
    this.hold_time = 0;
    this.phase = null;          // 'in' | 'held' | 'out', for a held pose
    this.phase_t = 0;
  }
  clone() {
    const t = Object.create(Trick.prototype);
    Object.assign(t, this);
    t.trick_rotation = 0;
    t.hold_time = 0;
    t.phase = null;
    t.phase_t = 0;
    return t;
  }
  /* A grab pays for as long as you keep hold of it, a grind for as long as you
     stay on the rail, a stall for as long as you hang on the lip — see
     CharacterTricks.update and holdTick. Capped so a long one cannot out-earn
     actually doing things. */
  getScore() {
    return Math.round(this.base_score + Math.min(this.hold_time, this.hold_cap) * this.hold_rate);
  }
  /* What the number on the screen is doing right now. */
  growing() { return this.hold_rate > 0; }
  addRotation(d) { this.trick_rotation += d; }
  getRotation() { return this.can_rotate ? this.trick_rotation : 0; }

  /**
   * Is this worth putting in the combo?
   *
   * Everything is, except a bare ollie. Popping onto a rail and popping off
   * again was scoring Ollie - 50-50 - Ollie at three times the multiplier, and
   * the two ollies did nothing but get you there. Turn one, though, and it IS
   * a trick — so an ollie banks the moment it has a completed half-turn on it,
   * and reads out as the spin it was.
   */
  banks() {
    return !this.plain || Math.abs(this.getRotation()) >= Math.PI;
  }
}

/**
 * Pick one at random, but never the one just used, so a combo does not read
 * "Kickflip - Kickflip - Kickflip". With one clip and several names sharing it
 * the picture repeats anyway; the scoreline is what tells you they were
 * different tricks.
 */
function pickDifferent(list, last) {
  if (list.length < 2) return list[0];
  let t = list[Math.floor(Math.random() * list.length)];
  if (t.trick_name === last) t = list[(list.indexOf(t) + 1) % list.length];
  return t;
}

/* --- the families ---------------------------------------------------------
 *
 * Scores rise with how hard the real trick is, so a random pick still has some
 * texture to it: a Kickflip pays 300, a 360 Flip 700. Clip names are the ones
 * SK_char.glb ships, and several tricks share one.
 */
const FLIP_CLIP = 'Flip_Kickflip';
const flip = (name, score) =>
  new Trick({ name, score, duration: G.FLIP_LOCK, anim: FLIP_CLIP, rotate: true });
const grab = (name, score, anim) =>
  new Trick({ name, score, duration: G.GRAB_IN + G.GRAB_OUT, anim, rotate: true,
              hold: true, holdAction: 'Grab',
              holdRate: G.GRAB_HOLD_SCORE, holdCap: G.GRAB_MAX_HOLD });
const grind = (name, score, anim) =>
  new Trick({ name, score, duration: 0.1, anim,
              holdRate: G.GRIND_HOLD_SCORE, holdCap: G.GRIND_MAX_HOLD });
const lip = (name, score, anim) =>
  new Trick({ name, score, duration: 0.1, anim,
              holdRate: G.LIP_HOLD_SCORE, holdCap: G.LIP_MAX_HOLD });

const AIR = [
  new Trick({ name: 'Ollie', duration: 0.025, score: 300, anim: 'Air_Olli',
              rotate: true, plain: true })
];
const FLIP = [
  flip('Kickflip', 300), flip('Heelflip', 320), flip('Pop Shove-it', 350),
  flip('Varial Kickflip', 450), flip('Hardflip', 550), flip('Inward Heelflip', 580),
  flip('360 Flip', 700), flip('Impossible', 750)
];
const GRAB = [
  grab('Indy Grab', 300, 'Grab_IndyGrab'), grab('Melon Grab', 320, 'Grab_MelonGrab'),
  grab('Tail Grab', 350, 'Grab_IndyGrab'), grab('Nose Grab', 380, 'Grab_MelonGrab'),
  grab('Method Air', 480, 'Grab_MelonGrab'), grab('Stalefish', 520, 'Grab_IndyGrab'),
  grab('Benihana', 600, 'Grab_IndyGrab'), grab('Japan Air', 680, 'Grab_MelonGrab')
];
const GRIND = [
  grind('50-50 Grind', 300, 'Grind_5050'), grind('Frontside Grind', 320, 'Grind_Frontside'),
  grind('Backside Grind', 340, 'Grind_Backside'), grind('Boardslide', 420, 'Grind_Boardslide'),
  grind('Nosegrind', 460, 'Grind_5050'), grind('Smith Grind', 520, 'Grind_SmithGrind'),
  grind('Crooked Grind', 560, 'Grind_Frontside'), grind('Noseslide', 600, 'Grind_Boardslide')
];
/* PORT: not an upstream trick. The Revert action exists in the original's
   input map and is never read; here it swaps the stance and pays for it, which
   is what keeps a switch landing inside the combo instead of ending it.
   It has no clip of its own — the visual root interpolates towards the body at
   INTERP_SPEED, so the 180 reads as a quick spin on its own. */
const REVERT = [
  new Trick({ name: 'Revert', duration: 0.12, score: 200, anim: null })
];
/* PORT: the original has no wallride at all — Godot_Skate's walls are fences.
   These are the THPS names for what the state does, picked at random like
   every other family, and they pay by the second the way a grind does. */
const WALLRIDE = [
  new Trick({ name: 'Wallride', score: 300, duration: 0.1, anim: null,
              holdRate: G.WALLRIDE_HOLD_SCORE, holdCap: G.WALLRIDE_MAX_HOLD }),
  new Trick({ name: 'Wall Ride to Fakie', score: 420, duration: 0.1, anim: null,
              holdRate: G.WALLRIDE_HOLD_SCORE, holdCap: G.WALLRIDE_MAX_HOLD }),
  new Trick({ name: 'Wallplant', score: 520, duration: 0.1, anim: null,
              holdRate: G.WALLRIDE_HOLD_SCORE, holdCap: G.WALLRIDE_MAX_HOLD })
];

const LIP = [
  lip('Nosestall', 300, 'Lip_Nosestall'), lip('Axlestall', 340, 'Lip_Axlestall'),
  lip('Blunt', 420, 'Lip_Blunt'), lip('Nose Blunt', 500, 'Lip_Blunt'),
  lip('Disaster', 560, 'Lip_Axlestall'), lip('Rock to Fakie', 620, 'Lip_Nosestall')
];

/**
 * The trick list as the pause menu shows it — built from the very same Trick
 * objects the game picks from, so it cannot go stale the way a hand-typed list
 * would. There are no input sequences to print any more: a button gives you one
 * of its family at random, so what the list is FOR is telling you which button
 * owns which tricks and what each is worth.
 *
 * Ordered cheapest first, which reads as easiest first.
 */
export const TRICK_BOOK = [
  { group: 'In the air', action: 'FLIP',
    when: 'Ollie first, then tap FLIP. You get one of these — a different one each time.',
    list: FLIP },
  { group: 'Grabs', action: 'GRAB',
    when: 'HOLD GRAB in the air. The longer you hold it the more it pays; let go before you land.',
    list: GRAB },
  { group: 'On a rail or a ledge', action: 'GRIND',
    when: 'Ride at it and press GRIND as you reach it. The longer you stay on, the more it pays.',
    list: GRIND },
  { group: 'On the lip of a ramp', action: 'GRIND',
    when: 'Press GRIND at the very top instead of dropping back in. Hang there and the points climb.',
    list: LIP },
  { group: 'On a wall', action: 'JUMP',
    when: 'Ollie at a wall at an angle with some speed and the board goes onto it. The longer you ride it the more it pays; JUMP kicks off.',
    list: WALLRIDE },
  { group: 'Landing', action: 'REVERT',
    when: 'Land backwards and the board swaps ends on its own.',
    list: REVERT }
].map((g) => ({
  group: g.group,
  when: g.when,
  action: g.action,
  tricks: g.list
    .slice()
    .sort((a, b) => a.base_score - b.base_score)
    .map((t) => ({ name: t.trick_name, score: t.base_score }))
}));

export class CharacterTricks {
  constructor(input, anim, hud) {
    this.input = input; this.anim = anim; this.hud = hud;
    this.air = AIR;
    this.flip = FLIP;
    this.grab = GRAB;
    this.grind = GRIND;
    this.lip = LIP;
    this.wallrideList = WALLRIDE;
    this.revertList = REVERT;
    this.last_name = null;

    this.can_trick = true;
    this.current_trick = null;
    this.tricks = [];
    this.current_trick_duration = 0;
    this.is_trick_active = false;
    this.combo_cooldown = 0;
    this.performed_olli = false;
    this.score = 0;
    this.best_combo = 0;
    this.onScore = null;
  }

  update(dt) {
    const t = this.current_trick;
    if (t && t.can_hold) this._hold(dt, t);
    else if (this.current_trick_duration > 0) {
      this.current_trick_duration -= dt; this.can_trick = false;
    } else this.can_trick = true;
    this._setTrickRot(dt * this.input.getInput().x * STATS.rot_air);
    this._updateUI();
  }

  /**
   * A GRAB in three parts, which is what the button actually feels like.
   *
   * IN     the pose blends on over GRAB_IN. Nothing is banked yet.
   * HELD   it stays there for as long as the button is down, and every second
   *        of it pays — this is the part where the number on the screen climbs.
   * OUT    the button comes up, the pose blends off over GRAB_OUT, and only
   *        when it has gone does the trick end and the next one become
   *        pressable. That is why spamming GRAB does nothing.
   *
   * Every Grab_* clip in SK_char.glb is one static frame, so the two blends are
   * the only halves of the animation there are; the hold sits between them.
   */
  _hold(dt, t) {
    this.can_trick = false;
    if (t.phase === 'in') {
      t.phase_t += dt;
      if (t.phase_t >= G.GRAB_IN) { t.phase = 'held'; t.phase_t = 0; this.anim.holdTrick(true); }
      return;
    }
    if (t.phase === 'held') {
      if (this.input.isHeld(t.hold_action)) { t.hold_time += dt; return; }
      t.phase = 'out'; t.phase_t = 0;
      this.anim.releaseTrick(G.GRAB_OUT);
      return;
    }
    t.phase_t += dt;
    if (t.phase_t >= G.GRAB_OUT) this._end();
  }

  /**
   * A second of grinding or of hanging on the lip, banked the same way a held
   * grab is — called by the Grind and Lip states while they are running, so the
   * score climbs on the screen for those too.
   */
  holdTick(dt) {
    const t = this.current_trick;
    if (t && t.hold_rate > 0 && !t.can_hold) t.hold_time += dt;
  }

  setComboCooldown(dt) {
    if (this.combo_cooldown > 0) this.combo_cooldown -= dt;
    else if (this.tricks.length > 0) this.endCombo();
  }

  /**
   * A spin counts in half-turns and nothing else.
   *
   * The original prints the angle rounded to the nearest 15 degrees, so an
   * ollie with a nudge of the stick reads "Ollie 272" — a number that is not a
   * trick, does not mean anything to anyone, and makes the readout look like a
   * debug print. Skating counts 180s: you land it or you do not. So the angle
   * is rounded DOWN to a completed half-turn, and anything short of one says
   * nothing at all.
   */
  _rotRound(rad) {
    const deg = Math.abs(rad * 180 / Math.PI);
    const half = Math.floor(deg / ROT_ROUNDING) * ROT_ROUNDING;
    return half >= ROT_ROUNDING ? String(half) : '';
  }

  _updateUI() {
    if (!this.is_trick_active || !this.current_trick) return;
    const t = this.current_trick;
    /* an ollie that has not turned yet is not going to be scored, so it does
       not claim the readout either — the number would only be a lie */
    if (!t.banks()) {
      this.hud.setTrick('', this.tricks.length > 1 ? 'X ' + this.tricks.length : '');
      return;
    }
    const multi = this.tricks.length > 1 ? 'X ' + this.tricks.length : '';
    /* While a trick is paying by the second, show what it is worth so far —
       the climbing number IS the feedback that holding on is doing something. */
    const live = t.growing() && t.hold_time > 0
      ? t.getScore().toLocaleString('en-GB') : '';
    this.hud.setTrick(
      t.trick_name + ' ' + this._rotRound(t.getRotation()),
      live && multi ? live + ' ' + multi : (live || multi)
    );
  }

  _start(list) {
    const trick = pickDifferent(list, this.last_name);
    if (!trick) return;
    if (this.is_trick_active) this._end();
    this.input.buffer.clear();
    this.last_name = trick.trick_name;
    this.current_trick = trick.clone();
    this.is_trick_active = true;
    this.current_trick_duration = this.current_trick.duration;
    this.hud.setTrick(this.current_trick.banks() ? this.current_trick.trick_name : '',
                      this.tricks.length > 1 ? 'X ' + this.tricks.length : '');
    this.combo_cooldown = COMBO_COOLDOWN_TIME;
    if (this.current_trick.can_hold) {
      this.current_trick.phase = 'in';
      this.current_trick.phase_t = 0;
      this.can_trick = false;
      this.anim.setTrickAnimation(this.current_trick.trick_animation, G.GRAB_IN);
    } else {
      this.anim.setTrickAnimation(this.current_trick.trick_animation);
    }
  }

  _end() {
    if (this.current_trick) {
      /* a grab cut short by a landing or a bail still lets go of the pose */
      if (this.current_trick.can_hold && this.current_trick.phase !== 'out') {
        this.anim.releaseTrick(0);
      }
      if (this.current_trick.banks()) this.tricks.push(this.current_trick);
    }
    this.is_trick_active = false;
    this.current_trick = null;
    this.can_trick = true;
  }

  _setTrickRot(d) { if (this.current_trick) this.current_trick.addRotation(d); }

  /* character_tricks.gd::set_end_combo — the flash that pays you */
  endCombo() {
    if (!this.tricks.length) return;
    let text = '', points = 0;
    if (this.tricks.length > 1) {
      this.tricks.forEach((t, i) => {
        if (i > 0) text += ' - ';
        points += t.getScore();
        text += t.trick_name + ' ' + this._rotRound(t.getRotation());
      });
    } else {
      points = this.tricks[0].getScore();
      text = this.tricks[0].trick_name + ' ' + this._rotRound(this.tricks[0].getRotation());
    }
    /* Rotation pays too — the one scoring addition this port makes, since the
       original tracks the angle, prints it, and never cashes it. It pays by the
       COMPLETED half-turn, the same unit the readout uses, so the number on the
       screen and the number in the score agree and a 179 is worth what it looks
       like: nothing. 240 a half-turn, capped at four of them per trick, so a
       long float with the stick held cannot out-earn actually landing things. */
    let spin = 0;
    for (const t of this.tricks) {
      const halves = Math.min(4, Math.floor(Math.abs(t.getRotation()) / Math.PI));
      spin += halves * 240;
    }
    const multiplier = this.tricks.length;
    const total = Math.round((points + spin) * multiplier);
    this.score += total;
    if (total > this.best_combo) this.best_combo = total;
    this.hud.setTrick(text.trim(), total + (multiplier > 1 ? ' X ' + multiplier : ''));
    this.hud.setScore(this.score);
    if (this.onScore) this.onScore(total, this.tricks.length);
    this.tricks.length = 0;
  }

  /* Throw the current trick away instead of banking it — for a "trick" that
     turned out not to be one, like a wallride that lasted two frames because
     the floor was right there. Nothing shows and nothing scores. */
  dropTrick() {
    if (!this.current_trick) return;
    if (this.current_trick.can_hold) this.anim.releaseTrick(0);
    this.current_trick = null;
    this.is_trick_active = false;
    this.can_trick = true;
    this.hud.setTrick('', this.tricks.length > 1 ? 'X ' + this.tricks.length : '');
  }

  clearTricks() { this._end(); this.tricks.length = 0; this.current_trick = null; }
  stateChanged() { if (this.is_trick_active) this._end(); }
  endTrick() { this._end(); }

  startAir() { this.last_name = null; this._start(this.air); }
  airTrick() {
    if (!this.can_trick) return;
    const last = this.input.buffer.last();
    if (last === Action.FLIP) return this._start(this.flip);
    if (last === Action.GRAB) return this._start(this.grab);
  }
  grindTrick() { if (this.input.buffer.last() === Action.GRIND) this._start(this.grind); }
  revert() { this._start(this.revertList); }
  lipTrick() { if (this.input.buffer.last() === Action.GRIND) this._start(this.lip); }
  /* no button to check: being on the wall is the input */
  wallrideTrick() { this._start(this.wallrideList); }
}
