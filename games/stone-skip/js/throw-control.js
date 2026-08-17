// The 3-beat throw. Everything the player does with their finger lives here.
//
//   beat 1  tap anywhere        -> slow motion + the arm starts drawing back
//   beat 2  tap  = POWER        -> how far the wind-up got when you tapped
//   beat 3  FLICK = RELEASE     -> when you touch down sets the launch angle,
//                                  the direction you flick sets the aim
//
// Missing a beat never hard-fails: it degrades the throw (fewer skips, off line).

import { clamp, lerp, DEG } from './util.js';
import {
  SWEET, releaseQuality, releaseGrade, speedFactorFor,
  POWER_BAND, powerQuality, powerGrade,
} from './skip-physics.js';

export const TIMING = {
  WIND: 1.45,          // seconds for the wind-up to reach full power
  OVERWIND: 0.9,       // ...then it slips back if you wait too long
  OVERWIND_FLOOR: 0.45,
  // Seconds for the release sweep, top -> bottom. 1.9 s puts the PERFECT window
  // at ~0.16 s and the GREAT window at ~0.28 s of finger time: hittable on
  // purpose by a seven year old, still a real aim.
  SWING: 1.9,
  // power gold band — the same numbers the white core is drawn from
  GOLD_LO: POWER_BAND.lo,
  GOLD_HI: POWER_BAND.hi,
  // Seconds to read the flick before launching anyway. A full flick is now a
  // LONG swipe (75% of the screen height), which takes 500-750 ms even at a
  // brisk pace, so this safety net has to sit well beyond that or a genuine
  // max-length swipe would be cut off early and read as "weak".
  FLICK_MAX: 1.0,
  FLICK_MIN_PX: 16,     // dead zone: below this it is a tap, not a flick
  // Fallback flick length, in CSS pixels, when nobody has told us the viewport
  // size yet. setFlickRange() replaces it with a fraction of the screen height:
  // the flick is meant to be a big, satisfying swipe up the screen, not a twitch.
  FLICK_TRIGGER_PX: 58,
  SLOWMO: 0.3,
};

/**
 * Flick distance that means "full power flick": 75% of the viewport height.
 * A max flick is meant to be a LONG swipe - most of the way up the screen - so
 * a short twitch reads as weak. The clamp ceiling is high enough that tall
 * screens are never capped below 0.75 * height.
 */
export function flickRangeFor(viewH) {
  return clamp(viewH * 0.75, 200, 1100);
}

/** How much of a sideways flick becomes aim (radians of aim per radian of flick). */
const AIM_AUTHORITY = 0.30;

export function angleForT(t) { return lerp(SWEET.high, SWEET.low, clamp(t, 0, 1)); }
export function tForAngle(a) { return (SWEET.high - a) / (SWEET.high - SWEET.low); }
export const SWEET_T = {
  lo: tForAngle(SWEET.center + SWEET.half),
  hi: tForAngle(SWEET.center - SWEET.half),
  // the single dead-centre point: releasing HERE is a PERFECT release
  mid: tForAngle(SWEET.center),
};

/**
 * Seconds of finger time a grading window is worth. `offHalf` is the window's
 * half-width in `releaseOffset` units (so RELEASE.PERFECT -> the perfect window).
 * Used by the tuning tests to keep the windows kid-sized.
 */
export function windowSeconds(offHalf, swingDur = TIMING.SWING) {
  return (SWEET.half * 2 * offHalf / (SWEET.high - SWEET.low)) * swingDur;
}

export function createThrowController(opts) {
  const S = {
    state: 'idle',
    t: 0,
    power: 0,
    powerLocked: 0,
    angleT: 0,
    pitch: SWEET.high,
    releasing: false,
    flick: null,
    pointerId: null,
    lastJudgement: '',
    // arm strength speeds both sweeps up, so a stronger arm stays a skill test
    windDur: TIMING.WIND,
    swingDur: TIMING.SWING,
    // seconds until the needle reaches dead centre (negative = already past)
    toSweet: 0,
    grade: 'poor',
    // beat 2 result: how centred the power tap was
    powerQ: 1,
    powerGrade: 'okay',
    // how long a flick has to be to count as a full one (set from the viewport)
    flickRange: TIMING.FLICK_TRIGGER_PX,
  };

  /**
   * Arm-strength level 0..2 -> a faster POWER bar (see progression.ARM).
   * The release sweep is deliberately left alone: buying a stronger arm must
   * never make the timing test harder, or the reward feels like a punishment.
   */
  function setRates(windMul, swingMul) {
    S.windDur = TIMING.WIND * (windMul || 1);
    S.swingDur = TIMING.SWING * (swingMul || 1);
  }

  /** Called on every resize: the flick scales with the screen, not with pixels. */
  function setFlickRange(px) {
    S.flickRange = Math.max(TIMING.FLICK_MIN_PX * 2.5, px || TIMING.FLICK_TRIGGER_PX);
  }

  function setState(s) {
    if (S.state === s) return;
    S.state = s;
    if (opts.onState) opts.onState(s, S);
  }

  function start() {
    if (S.state !== 'idle') return false;
    S.t = 0; S.power = 0; S.powerLocked = 0; S.angleT = 0;
    S.pitch = SWEET.high; S.releasing = false; S.flick = null;
    S.toSweet = S.swingDur; S.grade = 'poor';
    S.powerQ = 1; S.powerGrade = 'okay';
    setState('windup');
    if (opts.onWindUp) opts.onWindUp();
    return true;
  }

  function lockPower() {
    S.powerLocked = clamp(S.power, 0.06, 1);
    S.powerQ = powerQuality(S.powerLocked);
    S.powerGrade = powerGrade(S.powerLocked);
    S.t = 0;
    S.angleT = 0;
    setState('swing');
    if (opts.onPower) opts.onPower(S.powerLocked, S.powerGrade);
  }

  function beginRelease(x, y, id) {
    S.releasing = true;
    S.pitch = angleForT(S.angleT);
    S.pointerId = id;
    // `path` is the actual route the finger takes, kept so the HUD can draw the
    // flick back to the player as a fading trail (hud.drawFlickTrail).
    S.flick = { sx: x, sy: y, cx: x, cy: y, time: 0, path: [{ x, y }] };
    if (opts.onRelease) opts.onRelease(S.pitch);
  }

  const PATH_MAX = 64;
  function pushPath(x, y) {
    const p = S.flick.path;
    if (!p) return;
    const last = p[p.length - 1];
    if (Math.hypot(x - last.x, y - last.y) < 2) return;
    p.push({ x, y });
    if (p.length > PATH_MAX) p.shift();
  }

  function readFlick(edge) {
    const f = S.flick || { sx: 0, sy: 0, cx: 0, cy: 0, time: 0.1, path: [] };
    const dx = f.cx - f.sx, dy = f.cy - f.sy;
    const len = Math.hypot(dx, dy);
    const ms = Math.max(28, f.time * 1000);
    if (len < TIMING.FLICK_MIN_PX) {
      // a plain tap: straight ahead, but without the wrist snap there is no spin,
      // and the throw picks up a random wobble — so both flick scores are low
      return {
        aim: 0, spin: 0.34 * (0.62 + 0.38 * edge),
        curve: (Math.random() - 0.5) * 2.4,
        speedMul: 0.88, forward: 0.35, kind: 'tap',
        len, vert: 0, sideDeg: 0, straight: 0.25, path: f.path || [],
        range: S.flickRange,
      };
    }
    const fwd = clamp(-dy / len, -1, 1);
    let side = Math.atan2(dx, -dy);
    if (side > Math.PI / 2) side = Math.PI / 2;
    if (side < -Math.PI / 2) side = -Math.PI / 2;
    side = clamp(side, -50 * DEG, 50 * DEG);
    // How far up the screen the swipe actually went, against the full flick
    // distance. It is a real (if gentle) input: a longer wrist snap spins the
    // stone harder, so the "Flick up" row in the throw readout is honest —
    // never worth more than 18%, so a modest flick is still a good throw.
    const vert = clamp(-dy / S.flickRange, 0, 1);
    const spin = clamp(0.22 + 0.8 * Math.max(fwd, 0), 0, 1)
      * (0.62 + 0.38 * edge) * (0.82 + 0.18 * vert);
    // a fast forward flick adds a little zip; a lazy sideways one loses some
    const speedMul = (0.9 + 0.1 * clamp(fwd, 0, 1)) + clamp((len / ms - 0.45) / 1.6, 0, 1) * 0.08;
    const sgn = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
    const curve = (1 - Math.max(fwd, 0)) * 3.6 * sgn + (1 - edge) * 0.9 * (Math.random() < 0.5 ? -1 : 1);
    return {
      // Aim authority is deliberately gentle (max ~15 deg): the camera yaw is what
      // the player can see and pre-aim, and every spot stays in deep water inside
      // +-24 deg. A hard sideways flick should bend the throw, never beach it.
      aim: side * AIM_AUTHORITY, spin, curve, speedMul, forward: fwd,
      kind: fwd > 0.72 ? 'flick' : (fwd > 0.25 ? 'angled' : 'weak'),
      // --- the two numbers the throw breakdown reports (hud.drawBreakdown) ----
      // how far UP the flick went, against the full swipe distance (75% of the
      // screen height), and how far off vertical it was (50 deg = 0% straight)
      len,
      range: S.flickRange,
      vert,
      sideDeg: side / DEG,
      straight: clamp(1 - Math.abs(side / DEG) / 50, 0, 1),
      path: f.path || [],
    };
  }

  function judgement(pitch, flick, grade) {
    if (grade === 'perfect') return flick.kind === 'flick' ? 'DEAD CENTRE!' : 'PERFECT RELEASE!';
    if (grade === 'great') return flick.kind === 'weak' ? 'Great timing, weak flick' : 'GREAT RELEASE!';
    if (pitch > SWEET.center + SWEET.half) return 'A bit early — lobbed it';
    if (pitch < SWEET.center - SWEET.half) return 'A bit late — slammed it';
    if (flick.kind === 'weak') return 'Flick forwards next time';
    return 'Okay — aim for the middle';
  }

  function fire() {
    const edge = opts.getEdge ? opts.getEdge() : 0.6;
    const flick = readFlick(edge);
    const pitch = S.pitch;
    const grade = releaseGrade(pitch);
    const speedBonus = speedFactorFor(pitch) * flick.speedMul;
    S.releasing = false;
    S.grade = grade;
    S.lastJudgement = judgement(pitch, flick, grade);
    setState('flight');
    if (opts.onLaunch) {
      opts.onLaunch({
        power: S.powerLocked,
        powerQ: S.powerQ,
        powerGrade: S.powerGrade,
        pitchDeg: pitch,
        aimRad: flick.aim,
        spin: flick.spin,
        curve: flick.curve,
        speedBonus,
        flick,
        quality: releaseQuality(pitch),
        grade,
        judgement: S.lastJudgement,
      });
    }
  }

  // --- input ---------------------------------------------------------------
  function pointerDown(x, y, id) {
    if (S.state === 'windup') { lockPower(); return true; }
    if (S.state === 'swing' && !S.releasing) { beginRelease(x, y, id); return true; }
    return false;
  }
  function pointerMove(x, y, id) {
    if (S.releasing && (id === S.pointerId || id === undefined)) {
      S.flick.cx = x; S.flick.cy = y;
      pushPath(x, y);
      const len = Math.hypot(x - S.flick.sx, y - S.flick.sy);
      // only a flick that has run the WHOLE way launches early: anything shorter
      // waits for the finger to lift, so a long swipe is never cut off
      if (len >= S.flickRange) fire();
      return true;
    }
    return false;
  }
  function pointerUp(x, y, id) {
    if (S.releasing && (id === S.pointerId || id === undefined)) {
      S.flick.cx = x; S.flick.cy = y;
      pushPath(x, y);
      fire();
      return true;
    }
    return false;
  }

  function update(dt) {
    if (S.state === 'windup') {
      S.t += dt;
      if (S.t <= S.windDur) {
        S.power = S.t / S.windDur;
      } else {
        const o = (S.t - S.windDur) / TIMING.OVERWIND;
        S.power = Math.max(TIMING.OVERWIND_FLOOR, 1 - (1 - TIMING.OVERWIND_FLOOR) * o);
        if (o >= 1) lockPower();
      }
    } else if (S.state === 'swing') {
      if (S.releasing) {
        S.flick.time += dt;
        if (S.flick.time > TIMING.FLICK_MAX) fire();
      } else {
        S.t += dt;
        S.angleT = S.t / S.swingDur;
        // countdown to the dead-centre point, for the FLICK NOW cue
        S.toSweet = (SWEET_T.mid - S.angleT) * S.swingDur;
        S.grade = releaseGrade(angleForT(S.angleT));
        if (S.angleT >= 1) {
          S.angleT = 1;
          S.pitch = SWEET.low;
          S.flick = { sx: 0, sy: 0, cx: 0, cy: 0, time: 0, path: [] };
          fire();
        }
      }
    }
  }

  /** Timescale for the world while the player is winding up. */
  function timeScale() {
    if (S.state === 'windup' || S.state === 'swing') return TIMING.SLOWMO;
    return 1;
  }

  /** Visual draw-back amount (0 relaxed .. 1 fully wound) for the arm rig. */
  function drawBack() {
    if (S.state === 'windup') return S.power;
    if (S.state === 'swing') return S.powerLocked;
    return 0;
  }

  return {
    S, start, update, pointerDown, pointerMove, pointerUp, timeScale, drawBack, setRates,
    setFlickRange,
    setIdle() { setState('idle'); S.releasing = false; },
    setState,
    get state() { return S.state; },
  };
}
