// Special beachcombing moves. All three are cooldown-gated and unlocked by
// milestones; each one is a short-lived assist rather than an auto-collect.

import * as audio from './audio.js';
import { markers, startPulse, startSweep, sweepProgress, PIT } from './scene-beach.js';
import { finds, isExposed, setShine } from './finds.js';
import { meshes as pebbleMeshes, setStoneDim, washBand } from './pebbles.js';

export const MOVES = {
  radar: { id: 'radar', name: 'Radar', cooldown: 14, duration: 5.5 },
  torch: { id: 'torch', name: 'Shine', cooldown: 22, duration: 7.0 },
  wave:  { id: 'wave',  name: 'Wash',  cooldown: 28, duration: 1.6 },
};

export const state = {
  radar: { cd: 0, active: 0 },
  torch: { cd: 0, active: 0 },
  wave:  { cd: 0, active: 0 },
};

let markedFinds = [];
let time = 0;

export function resetMoves() {
  for (const k of Object.keys(state)) { state[k].cd = 0; state[k].active = 0; }
  markedFinds = [];
  hideMarkers();
  setShine(false);
  setStoneDim(false);
}

/** Cooldowns keep running across a section change, but effects stop. */
export function endActiveEffects() {
  state.torch.active = 0;
  state.radar.active = 0;
  state.wave.active = 0;
  markedFinds = [];
  hideMarkers();
  setShine(false);
  setStoneDim(false);
}

function hideMarkers() {
  for (const m of markers) { m.visible = false; m.material.opacity = 0; }
}

export function canUse(id, save) {
  if (!save.unlocked.moves.includes(id)) return false;
  return state[id].cd <= 0 && state[id].active <= 0;
}

export function use(id, camera, save) {
  if (!canUse(id, save)) return false;
  const def = MOVES[id];
  state[id].cd = def.cooldown;
  state[id].active = def.duration;

  if (id === 'radar') {
    startPulse(1.5);
    audio.ping();
    // Only flag the pieces you could not already see — that is the whole point.
    markedFinds = finds.filter((f) => !isExposed(f, camera, pebbleMeshes));
  } else if (id === 'torch') {
    audio.whoosh(true);
    setShine(true);
    setStoneDim(true);
  } else if (id === 'wave') {
    audio.whoosh(false);
    startSweep(def.duration);
  }
  return true;
}

export function update(dt, t) {
  time = t;
  for (const k of Object.keys(state)) {
    const s = state[k];
    if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
    if (s.active > 0) {
      s.active = Math.max(0, s.active - dt);
      if (s.active === 0) onEnd(k);
    }
  }

  if (state.radar.active > 0) {
    const fade = Math.min(1, state.radar.active / 1.2);
    let i = 0;
    for (const f of markedFinds) {
      if (i >= markers.length) break;
      if (!f.mesh.parent) continue;   // already collected
      const m = markers[i++];
      m.visible = true;
      m.position.set(f.mesh.position.x, f.mesh.position.y + 0.05, f.mesh.position.z);
      const p = 0.5 + 0.5 * Math.sin(time * 6 - f.mesh.position.z * 3);
      m.material.opacity = (0.35 + p * 0.5) * fade;
      m.scale.setScalar(0.22 + p * 0.16);
    }
    for (; i < markers.length; i++) markers[i].visible = false;
  }

  if (state.wave.active > 0) {
    const p = sweepProgress();
    if (p >= 0) {
      const z = -PIT.hd - 0.6 + p * (PIT.d + 1.2);
      washBand(z, 0.5, 1.35);
    }
  }
}

function onEnd(id) {
  if (id === 'radar') { markedFinds = []; hideMarkers(); }
  if (id === 'torch') { setShine(false); setStoneDim(false); }
}
