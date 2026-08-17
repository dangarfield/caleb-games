// The 12 lake targets — the goal spine of the game, and the first twelve rows of
// the one Achievements list (progression.js turns each one into an achievement).
// Detection runs inside the stone's substep probe so fast throws can't tunnel
// through a target.

import { lerp } from './util.js';
import {
  BUOYS, RING, BRIDGE, REED_GATE, ISLANDS, DIST_FLAGS, spotById,
  REED_GATE2, LILY_RAFTS, BEACON, POSTS,
} from './world/layout.js';
import { islandAt } from './world/heightfield.js';

export const TARGETS = [
  { id: 'skip3', icon: '💧', name: 'First Skips', desc: 'Get 3 skips in one throw', spot: 'main', kind: 'skips', n: 3 },
  { id: 'skip6', icon: '🌊', name: 'Six Pack', desc: 'Get 6 skips in one throw', spot: 'main', kind: 'skips', n: 6 },
  { id: 'skip10', icon: '🏅', name: 'Perfect Ten', desc: 'Get 10 skips in one throw', spot: 'pier', kind: 'skips', n: 10 },
  // n always matches a real distance flag, so the wording, the arrow and the
  // marker in the water all say the same number.
  { id: 'dist60', icon: '📏', name: 'Long Shot', desc: 'Pass the 60 m flag', spot: 'main', kind: 'dist', n: 60 },
  { id: 'dist80', icon: '🚀', name: 'Horizon Hunter', desc: 'Throw 80 m in one go', spot: 'pier', kind: 'dist', n: 80 },
  { id: 'buoyRed', icon: '🔴', name: 'Red Buoy', desc: 'Bonk the red buoy', spot: 'main', kind: 'buoy', target: 'buoyRed' },
  { id: 'buoyYellow', icon: '🟡', name: 'Yellow Buoy', desc: 'Bonk the yellow buoy off the pier', spot: 'pier', kind: 'buoy', target: 'buoyYellow' },
  { id: 'buoyBlue', icon: '🔵', name: 'Far Buoy', desc: 'Bonk the far blue buoy', spot: 'pier', kind: 'buoy', target: 'buoyBlue' },
  { id: 'ring', icon: '⭕', name: 'Ring Master', desc: 'Skip a stone through the floating ring', spot: 'willow', kind: 'ring' },
  { id: 'bridge', icon: '🌉', name: 'Under the Bridge', desc: 'Skip a stone under the bridge', spot: 'cove', kind: 'bridge' },
  { id: 'island', icon: '🏝️', name: 'Island Landing', desc: 'Land a stone on Sand Isle', spot: 'west', kind: 'island' },
  { id: 'reeds', icon: '🌾', name: 'Reed Gate', desc: 'Thread the gap in the reeds', spot: 'reeds', kind: 'reeds' },
];

/** World marker for a target, so the celebration can fire at the right place. */
export function targetMarker(c) {
  switch (c.kind) {
    case 'buoy': { const b = BUOYS.find(x => x.id === c.target); return b ? { x: b.x, z: b.z, y: 2 } : null; }
    case 'ring': return { x: RING.x, z: RING.z, y: 1 };
    case 'bridge': return { x: BRIDGE.x, z: BRIDGE.z, y: BRIDGE.deckY || 5 };
    case 'reeds': return { x: REED_GATE.x, z: REED_GATE.z, y: 1.5 };
    case 'island': return { x: ISLANDS[0].x, z: ISLANDS[0].z, y: ISLANDS[0].h + 1 };
    case 'dist': {
      // the distance flags stand on the Main Beach aim line, so when the goal is
      // one of them point the arrow at the actual flag, not at a phantom point
      if (c.spot === 'main') {
        const f = DIST_FLAGS.find(x => x.d === c.n);
        if (f) return { x: f.x, z: f.z, y: 2.6 };
      }
      const s = spotById(c.spot);
      return { x: s.x + s.fx * c.n, z: s.z + s.fz * c.n, y: 1 };
    }
    default: return null;
  }
}

/** Signed-plane crossing between two substep positions. */
function crossPlane(s, gx, gz, dirX, dirZ) {
  const dPrev = (s.px - gx) * dirX + (s.pz - gz) * dirZ;
  const dCur = (s.x - gx) * dirX + (s.z - gz) * dirZ;
  if (dPrev < 0 && dCur >= 0) {
    const t = dCur === dPrev ? 0 : -dPrev / (dCur - dPrev);
    return {
      x: lerp(s.px, s.x, t), y: lerp(s.py, s.y, t), z: lerp(s.pz, s.z, t),
    };
  }
  return null;
}

export function createTargetTracker() {
  const state = {
    completed: {},            // id -> true
    hits: {},                 // per-throw hit flags
  };

  function reset() { state.hits = {}; }

  /** Probe called every physics substep. Pushes events for feedback. */
  function probe(s, events) {
    // buoys
    for (const b of BUOYS) {
      if (state.hits['buoy_' + b.id]) continue;
      const d = Math.hypot(s.x - b.x, s.z - b.z);
      // generous bonk radius: these are 44-92 m away and aimed by eye
      if (d < b.r + 2.0 && s.y > -0.5 && s.y < 2.9) {
        state.hits['buoy_' + b.id] = true;
        events.push({ type: 'buoyHit', id: b.id, x: b.x, y: 1.2, z: b.z, label: b.label });
      }
    }
    // floating ring
    if (!state.hits.ring) {
      const d = Math.hypot(s.x - RING.x, s.z - RING.z);
      // a hop can peak ~1.3 m, so allow the pass a little air over the ring
      if (d < RING.rInner - 0.15 && s.y < 1.9) {
        state.hits.ring = true;
        events.push({ type: 'ringPass', x: RING.x, y: 1.0, z: RING.z });
      }
    }
    // under the bridge
    if (!state.hits.bridge) {
      const p = crossPlane(s, BRIDGE.x, BRIDGE.z, BRIDGE.dirX, BRIDGE.dirZ);
      if (p) {
        const lat = (p.x - BRIDGE.x) * BRIDGE.nx + (p.z - BRIDGE.z) * BRIDGE.nz;
        if (Math.abs(lat) < BRIDGE.gateHalfWidth && p.y < (BRIDGE.clearance || 4) && p.y > -0.4) {
          state.hits.bridge = true;
          // skip count at the moment of passing, so "kept skipping after" is real
          state.hits.bridgeSkips = s.skips;
          events.push({ type: 'bridgePass', x: p.x, y: p.y + 1, z: p.z });
        }
      }
    }
    // reed gates (the near one is the target; threading BOTH is its own achievement)
    const gates = [REED_GATE, REED_GATE2];
    for (let i = 0; i < gates.length; i++) {
      const G = gates[i];
      if (state.hits['gate' + i]) continue;
      const p = crossPlane(s, G.x, G.z, G.dirX, G.dirZ);
      if (!p) continue;
      const lat = (p.x - G.x) * G.nx + (p.z - G.z) * G.nz;
      if (Math.abs(lat) < G.gapHalf && p.y < 3.2 && p.y > -0.4) {
        state.hits['gate' + i] = true;
        state.hits.gates = (state.hits.gates || 0) + 1;
        if (i === 0) state.hits.reeds = true;
        events.push({ type: 'reedPass', x: p.x, y: 1.2, z: p.z, n: state.hits.gates });
      } else if (Math.abs(lat) < G.rowHalf && p.y < 3.0) {
        events.push({ type: 'reedHit', x: p.x, y: 1.0, z: p.z });
      }
    }

    // --- phase 2 trick-shot targets ------------------------------------------
    // Lily rafts: a stone coming down inside the pads settles on them instead of
    // sinking, which is the "frog landing".
    if (!state.hits.lily) {
      for (const raft of LILY_RAFTS) {
        if (s.vy > 0 || s.y > 0.4) continue;
        if (Math.hypot(s.x - raft.x, s.z - raft.z) > raft.r) continue;
        state.hits.lily = true;
        s.stopRequest = 'lily';
        events.push({ type: 'lilyLand', x: s.x, y: 0.25, z: s.z, id: raft.id });
        break;
      }
    }

    // The beacon on Sand Isle: a solid target, so a hit ends the throw there.
    if (!state.hits.beacon) {
      const d = Math.hypot(s.x - BEACON.x, s.z - BEACON.z);
      if (d < BEACON.hitR && s.y > BEACON.baseY - 1.2 && s.y < BEACON.baseY + BEACON.h) {
        state.hits.beacon = true;
        s.stopRequest = 'land';
        events.push({ type: 'beaconHit', x: BEACON.x, y: BEACON.baseY + BEACON.h * 0.6, z: BEACON.z });
      }
    }

    // Mooring posts: the stone really does bounce off them (velocity reflected
    // about the post normal), which is what makes the trick shot feel earned.
    for (const post of POSTS) {
      if (state.hits['post_' + post.id]) continue;
      const dx = s.x - post.x, dz = s.z - post.z;
      const d = Math.hypot(dx, dz);
      if (d > post.r + 0.35 || d < 0.0001) continue;
      if (s.y < -0.35 || s.y > post.h) continue;
      state.hits['post_' + post.id] = true;
      state.hits.post = true;
      const nx = dx / d, nz = dz / d;
      const vn = s.vx * nx + s.vz * nz;
      // reflect + damp, then nudge clear so the next substep cannot re-hit
      s.vx = (s.vx - 2 * vn * nx) * 0.72;
      s.vz = (s.vz - 2 * vn * nz) * 0.72;
      s.x = post.x + nx * (post.r + 0.4);
      s.z = post.z + nz * (post.r + 0.4);
      events.push({ type: 'postHit', x: post.x, y: Math.max(s.y, 0.4), z: post.z });
    }
  }

  /**
   * Resolves the throw once it is over.
   * @returns array of newly completed target objects
   */
  function settle(result, save) {
    const gained = [];
    const done = (c) => {
      if (state.completed[c.id]) return;
      state.completed[c.id] = true;
      save.targets[c.id] = true;
      gained.push(c);
    };
    for (const c of TARGETS) {
      if (state.completed[c.id]) continue;
      switch (c.kind) {
        case 'skips': if (result.skips >= c.n) done(c); break;
        case 'dist': if (result.distance >= c.n) done(c); break;
        case 'buoy': if (state.hits['buoy_' + c.target]) done(c); break;
        case 'ring': if (state.hits.ring) done(c); break;
        case 'bridge': if (state.hits.bridge) done(c); break;
        case 'reeds': if (state.hits.reeds) done(c); break;
        case 'island':
          if (result.landed) {
            const isl = islandAt(result.x, result.z);
            if (isl && isl === ISLANDS[0]) done(c);
          }
          break;
      }
    }
    return gained;
  }

  /**
   * Everything this throw did that the achievement system cares about.
   * Called once, right after settle().
   */
  function tricks(result) {
    const h = state.hits;
    return {
      reedGates: h.gates || 0,
      bridge: !!h.bridge,
      afterBridge: h.bridge ? Math.max(0, result.skips - (h.bridgeSkips || 0)) : 0,
      lily: !!h.lily,
      beacon: !!h.beacon,
      post: !!h.post,
      buoys: BUOYS.filter(b => h['buoy_' + b.id]).map(b => b.id),
    };
  }

  function load(save) {
    state.completed = Object.assign({}, save.targets || {});
  }

  function countDone() {
    return TARGETS.filter(c => state.completed[c.id]).length;
  }

  return { state, probe, settle, tricks, reset, load, countDone, total: TARGETS.length };
}
