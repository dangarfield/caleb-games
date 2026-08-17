// Camera: no free roam. The player stands at a marked spot, may look around a
// little by dragging, taps a marker to walk to another spot, and the camera
// chases the stone during a throw.

import * as THREE from 'three';
import { clamp, lerp, easeInOut, DEG } from './util.js';
import { heightAt } from './world/heightfield.js';
import { LAKE } from './world/layout.js';

// Eye height above whatever the player is standing on. Exported because the rock
// field needs it to work out which patches of ground are actually in shot.
export const EYE_HEIGHT = 1.55;
const EYE = EYE_HEIGHT;
const YAW_LIMIT = 70 * DEG;
// How much of a dragged-off aim survives from one throw to the next (see toSpot).
const AIM_KEEP_MAX = 14 * DEG;
// The HUD starts warning about an off-centre aim past this (see hud.drawAimGuide).
export const AIM_WARN_DEG = 7;
const PITCH_MIN = -26 * DEG;
const PITCH_MAX = 22 * DEG;
// Resting look angle. Tilted down enough that the pick-up stones on the sand
// (3-5 m ahead, so ~25 deg below the eye) sit in the lower half of the picture
// instead of off the bottom edge, while the horizon still shows in the top third.
const REST_PITCH = -10 * DEG;

// --- the map view ('overview' mode) -----------------------------------------
// Metres of lake to keep inside the SHORTER screen axis. The shore reaches ~150 m
// from the lake centre and the spot labels stand off it, so 172 frames the whole
// lake with a margin on a phone held either way.
const OVERVIEW_FIT = 172;
// A hair off vertical: straight down leaves the up-vector undefined (three.js
// nudges it, but the picture then flips with the aspect), and a slight lean also
// gives the hills at the top of the map a bit of shape. Kept small so the far
// shore never reaches past the edge of the terrain mesh.
const OVERVIEW_TILT = 0.09;
const OVERVIEW_DUR = 1.3;
// Highest the eye may go, well inside the camera's far plane (1900).
const OVERVIEW_MAX_Y = 1150;

function groundY(spot) {
  return spot.onPier ? spot.standY : Math.max(0.05, heightAt(spot.x, spot.z));
}

export function createCameraRig(camera) {
  const st = {
    mode: 'spot',
    spot: null,
    baseYaw: 0,
    yaw: 0, pitch: REST_PITCH,
    tYaw: 0, tPitch: REST_PITCH,
    eye: new THREE.Vector3(),
    look: new THREE.Vector3(),
    travel: null,
    stone: null,
    resultT: 0,
    resultPos: new THREE.Vector3(),
    overview: null,             // the map tween: { t, dur, from, to, dir, ... }
    ovU: 0,                     // 0 = standing at the spot, 1 = parked overhead
    shake: 0,
    dragging: false, dragId: null, dragX: 0, dragY: 0, dragMoved: 0,
  };

  const tmpEye = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function spotEye(spot, out) {
    return out.set(spot.x, groundY(spot) + EYE, spot.z);
  }

  function setSpot(spot, instant = true) {
    st.spot = spot;
    st.baseYaw = Math.atan2(spot.fx, spot.fz);
    st.tYaw = st.baseYaw; st.tPitch = REST_PITCH;
    st.mode = 'spot';
    if (instant) {
      st.yaw = st.tYaw; st.pitch = st.tPitch;
      spotEye(spot, tmpEye);
      lookFromAngles(tmpEye, st.yaw, st.pitch, tmpLook);
      st.eye.copy(tmpEye);
      st.look.copy(tmpLook);
      camera.position.copy(tmpEye);
      camera.lookAt(tmpLook);
    }
  }

  function travelTo(spot, onArrive) {
    if (!st.spot || spot === st.spot) { setSpot(spot); if (onArrive) onArrive(); return; }
    const from = spotEye(st.spot, new THREE.Vector3());
    const to = spotEye(spot, new THREE.Vector3());
    const dist = from.distanceTo(to);
    st.travel = {
      from, to, t: 0,
      dur: clamp(0.55 + dist * 0.012, 0.7, 2.2),
      fromYaw: st.yaw,
      toYaw: Math.atan2(spot.fx, spot.fz),
      onArrive, spot,
      stepT: 0,
    };
    st.mode = 'travel';
  }

  function follow(stone) {
    st.stone = stone;
    st.mode = 'follow';
    st.followBlend = 0;
  }

  function showResult(x, y, z) {
    st.resultPos.set(x, Math.max(y, 0.2), z);
    st.resultT = 0;
    st.mode = 'result';
  }

  /**
   * Back to standing at the spot. Small aim offsets are KEPT: after a throw you
   * usually want another go at the same target, and snapping the view straight
   * every time means re-aiming before every throw. A LARGE offset is a different
   * story — it is nearly always left over from looking around, and every spot's
   * clear lane of deep water is straight ahead, so anything past AIM_KEEP_MAX is
   * pulled back rather than allowed to quietly ruin the next throw.
   * Pass true to force the view back to the default heading.
   */
  function toSpot(resetAim = false) {
    st.mode = 'spot';
    const keep = resetAim ? 0 : AIM_KEEP_MAX;
    st.tYaw = clamp(st.tYaw, st.baseYaw - keep, st.baseYaw + keep);
    st.tPitch = REST_PITCH;
  }

  /**
   * Where the map view parks: high over the middle of the lake, looking almost
   * straight down. The height is DERIVED from the live camera, so a phone in
   * portrait (a narrow horizontal field) simply rises further than the same
   * phone in landscape and both frame the whole lake.
   */
  function overviewPose(eyeOut, lookOut) {
    const tanV = Math.tan(camera.fov * 0.5 * DEG);
    const tanH = tanV * Math.max(camera.aspect || 1, 0.05);
    const h = clamp(OVERVIEW_FIT / Math.min(tanV, tanH) * 1.04, 150, OVERVIEW_MAX_Y);
    eyeOut.set(LAKE.cx, h, LAKE.cz - h * OVERVIEW_TILT);
    lookOut.set(LAKE.cx, 0, LAKE.cz + 8);
    return h;
  }

  /** Tween up to the map view. */
  function toOverview() {
    if (st.mode === 'overview' && st.overview && st.overview.dir > 0) return;
    const to = new THREE.Vector3(), toLook = new THREE.Vector3();
    overviewPose(to, toLook);
    st.overview = {
      t: 0, dur: OVERVIEW_DUR, dir: 1,
      from: camera.position.clone(), fromLook: st.look.clone(), to, toLook,
    };
    st.mode = 'overview';
  }

  /**
   * Tween back down to the spot the player is standing at, landing looking
   * straight down the lane (a map trip is exactly when a stale dragged aim would
   * be most confusing, so this one always recentres).
   */
  function fromOverview() {
    if (st.mode !== 'overview' || !st.spot) return;
    const to = spotEye(st.spot, new THREE.Vector3());
    const toLook = new THREE.Vector3();
    lookFromAngles(to, st.baseYaw, REST_PITCH, toLook);
    st.tYaw = st.baseYaw; st.tPitch = REST_PITCH;
    st.overview = {
      t: 0, dur: OVERVIEW_DUR, dir: -1,
      from: camera.position.clone(), fromLook: st.look.clone(), to, toLook,
    };
    st.mode = 'overview';
  }

  function addShake(amount) { st.shake = Math.min(1, st.shake + amount); }

  /**
   * How far the aim has been dragged off the spot's own heading, in degrees
   * (signed: + = looking right of straight ahead). Every spot has its clear lane
   * of deep water straight ahead, so a big offset is the difference between a
   * 10-skip throw and one that dies in the shallows — the HUD shows this so the
   * player can never be silently stranded, and `recentre` puts it back.
   */
  function aimOffsetDeg() {
    let d = st.tYaw - st.baseYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d / DEG;
  }

  /** Snap the aim back to straight ahead (the ⟲ CENTRE AIM button). */
  function recentre() {
    st.tYaw = st.baseYaw;
    st.tPitch = REST_PITCH;
  }

  // --- drag to look ---------------------------------------------------------
  function dragStart(x, y, id) {
    if (st.mode !== 'spot') return false;
    st.dragging = true; st.dragId = id; st.dragX = x; st.dragY = y; st.dragMoved = 0;
    return true;
  }
  function dragMove(x, y, id) {
    if (!st.dragging || (id !== st.dragId && id !== undefined)) return false;
    const dx = x - st.dragX, dy = y - st.dragY;
    st.dragX = x; st.dragY = y;
    st.dragMoved += Math.abs(dx) + Math.abs(dy);
    const k = 0.0032;
    st.tYaw = clamp(st.tYaw - dx * k, st.baseYaw - YAW_LIMIT, st.baseYaw + YAW_LIMIT);
    st.tPitch = clamp(st.tPitch - dy * k * 0.8, PITCH_MIN, PITCH_MAX);
    return true;
  }
  function dragEnd(id) {
    if (!st.dragging) return false;
    st.dragging = false; st.dragId = null;
    return st.dragMoved > 22;   // true = it was a look, not a tap
  }

  function apply(a) {
    camera.position.lerp(tmpEye, a);
    st.look.lerp(tmpLook, a);
    if (st.shake > 0.001) {
      const s = st.shake * st.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(st.look);
  }

  function update(dt) {
    st.shake *= Math.pow(0.0015, dt);
    if (st.mode !== 'overview') st.ovU = 0;
    const rate = (k) => 1 - Math.exp(-k * dt);

    if (st.mode === 'travel') {
      const tr = st.travel;
      tr.t += dt;
      const u = clamp(tr.t / tr.dur, 0, 1);
      const e = easeInOut(u);
      tmpEye.copy(tr.from).lerp(tr.to, e);
      // hop along the walk so it feels like footsteps, and hug the ground
      const gx = tmpEye.x, gz = tmpEye.z;
      const gh = Math.max(tr.spot.onPier || st.spot.onPier ? tmpEye.y - EYE : heightAt(gx, gz), 0.05);
      tmpEye.y = Math.max(tmpEye.y, gh + EYE) + Math.sin(u * Math.PI) * 0.2 + Math.sin(tr.t * 11) * 0.045;
      let dy = tr.toYaw - tr.fromYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      st.yaw = tr.fromYaw + dy * e;
      st.pitch = lerp(st.pitch, REST_PITCH, rate(4));
      lookFromAngles(tmpEye, st.yaw, st.pitch, tmpLook);
      apply(1);
      if (u >= 1) {
        st.spot = tr.spot;
        st.baseYaw = tr.toYaw;
        st.tYaw = tr.toYaw;
        st.mode = 'spot';
        st.travel = null;
        if (tr.onArrive) tr.onArrive();
      }
      return;
    }

    if (st.mode === 'overview') {
      const o = st.overview;
      o.t += dt;
      const u = clamp(o.t / o.dur, 0, 1);
      const e = easeInOut(u);
      // parked: re-derive the pose every frame so rotating the tablet re-frames
      // the lake instead of cropping it
      if (o.dir > 0 && u >= 1) overviewPose(o.to, o.toLook);
      tmpEye.copy(o.from).lerp(o.to, e);
      // a little arc, so the climb reads as lifting off rather than sliding up a
      // wall (and the descent settles instead of dropping)
      tmpEye.y += Math.sin(e * Math.PI) * 18;
      tmpLook.copy(o.fromLook).lerp(o.toLook, e);
      st.ovU = o.dir > 0 ? e : 1 - e;
      apply(1);
      if (u >= 1 && o.dir < 0) {
        st.yaw = st.baseYaw; st.pitch = REST_PITCH;
        st.tYaw = st.baseYaw; st.tPitch = REST_PITCH;
        st.mode = 'spot';
        st.overview = null;
        st.ovU = 0;
      }
      return;
    }

    if (st.mode === 'follow' && st.stone) {
      const s = st.stone;
      const vh = Math.hypot(s.vx, s.vz) || 1;
      const fx = s.vx / vh, fz = s.vz / vh;
      const d = Math.hypot(s.x - s.launchX, s.z - s.launchZ);
      // stay at the shore for the first few metres, then swing in behind
      const blend = clamp((d - 7) / 16, 0, 1);
      st.followBlend = Math.max(st.followBlend, blend);
      const b = st.followBlend;
      const back = lerp(4, 11, b), up = lerp(1.6, 3.4, b);
      const chaseX = s.x - fx * back, chaseZ = s.z - fz * back;
      const chaseY = Math.max(s.y + up, 1.5);
      const restY = st.spot ? groundY(st.spot) + EYE : 2;
      tmpEye.set(
        lerp(st.spot ? st.spot.x : chaseX, chaseX, b),
        lerp(restY, chaseY, b),
        lerp(st.spot ? st.spot.z : chaseZ, chaseZ, b)
      );
      tmpLook.set(s.x + s.vx * 0.16, s.y + 0.4, s.z + s.vz * 0.16);
      apply(rate(lerp(5, 9, b)));
      return;
    }

    if (st.mode === 'result') {
      st.resultT += dt;
      const p = st.resultPos;
      const spot = st.spot;
      const ang = Math.atan2(p.x - spot.x, p.z - spot.z);
      const back = 13, upY = 5.5;
      tmpEye.set(p.x - Math.sin(ang) * back, Math.max(p.y + upY, 3), p.z - Math.cos(ang) * back);
      tmpLook.copy(p);
      apply(rate(3.2));
      return;
    }

    // spot mode
    st.yaw = lerp(st.yaw, st.tYaw, rate(11));
    st.pitch = lerp(st.pitch, st.tPitch, rate(11));
    spotEye(st.spot, tmpEye);
    lookFromAngles(tmpEye, st.yaw, st.pitch, tmpLook);
    apply(rate(9));
  }

  function lookFromAngles(eye, yaw, pitch, out) {
    const cp = Math.cos(pitch);
    out.set(eye.x + Math.sin(yaw) * cp * 10, eye.y + Math.sin(pitch) * 10, eye.z + Math.cos(yaw) * cp * 10);
  }

  /** Horizontal aim direction — the player throws where they are looking. */
  function forwardXZ() {
    const y = st.mode === 'spot' ? st.yaw : st.baseYaw;
    return { x: Math.sin(y), z: Math.cos(y) };
  }

  /** Where the stone leaves the hand. */
  function handPoint() {
    const f = forwardXZ();
    const g = st.spot ? groundY(st.spot) : 0;
    return { x: st.spot.x + f.x * 0.85, y: g + EYE - 0.28, z: st.spot.z + f.z * 0.85 };
  }

  return {
    st, setSpot, travelTo, follow, showResult, toSpot, update, addShake,
    dragStart, dragMove, dragEnd, forwardXZ, handPoint, aimOffsetDeg, recentre,
    toOverview, fromOverview,
    get mode() { return st.mode; },
    /** 0 standing at the spot .. 1 parked over the lake (drives the map HUD/haze). */
    get overviewBlend() { return st.ovU; },
    /** true while the map view is up or rising, false once it is heading back. */
    get overviewRising() { return st.mode === 'overview' && st.overview.dir > 0; },
    get yaw() { return st.yaw; },
    get spot() { return st.spot; },
    eyeHeight: EYE,
  };
}
