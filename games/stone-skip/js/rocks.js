// Scattered skimming stones. Shape is honest: what a rock looks like tells you
// how well it will skip (flat + smooth = many skips, jagged + chunky = plunk).

import * as THREE from 'three';
import { TAU, mulberry32, clamp, lerp } from './util.js';
import { SPOTS } from './world/layout.js';
import { heightAt } from './world/heightfield.js';
import { EYE_HEIGHT } from './camera-rig.js';
// One source of truth for stone data (progression.js reads the same table).
import { ROCK_KINDS, rockStars, SPECIAL_STONES } from './stones.js';

export { ROCK_KINDS, rockStars };

function jitterGeometry(geo, amount, rnd) {
  const pos = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount * 0.7, (rnd() - 0.5) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Builds a handful of geometry variants per rock kind. */
function buildGeometries() {
  const rnd = mulberry32(20260815);
  const out = {};
  for (const k of ROCK_KINDS) {
    out[k.id] = [];
    for (let v = 0; v < 3; v++) {
      let g;
      switch (k.id) {
        case 'flat':
          g = new THREE.CylinderGeometry(1, 0.88, 0.3, 9);
          g.scale(1, 1, 0.86);
          jitterGeometry(g, 0.14, rnd);
          break;
        case 'disc':
          g = new THREE.CylinderGeometry(0.95, 0.95, 0.42, 11);
          jitterGeometry(g, 0.16, rnd);
          break;
        case 'oval':
          g = new THREE.SphereGeometry(1, 9, 6);
          g.scale(1.2, 0.42, 0.86);
          jitterGeometry(g, 0.14, rnd);
          break;
        case 'round':
          g = new THREE.IcosahedronGeometry(1, 1);
          g.scale(1.05, 0.78, 0.95);
          jitterGeometry(g, 0.16, rnd);
          break;
        case 'chunky':
          g = new THREE.DodecahedronGeometry(1, 0);
          g.scale(1.0, 0.86, 0.92);
          jitterGeometry(g, 0.24, rnd);
          break;
        default:
          g = new THREE.IcosahedronGeometry(1, 0);
          g.scale(1.15, 0.7, 0.8);
          jitterGeometry(g, 0.5, rnd);
          break;
      }
      g.computeBoundingSphere();
      out[k.id].push(g);
    }
  }
  return out;
}

// Half-width of the cone every scattered stone must live inside, in radians.
// A portrait tablet shows ~+-18 deg horizontally (58 deg vertical FOV at a 0.6
// aspect), so 16 deg leaves a little margin at the edge of the picture. FAN_ARC
// is the narrower spread the slots prefer, so the fan sits well inside the frame.
export const VIEW_ARC = 16 * Math.PI / 180;
// ...but the icon rail runs down the RIGHT edge of the screen, so the cone is
// asymmetric: a stone may go the full VIEW_ARC to the left and a little less to
// the right, where the rail would otherwise sit on top of it. (The left edge is
// clear: the Games button is up in its corner.) 10 deg is the widest bearing that
// still clears the rail on the narrowest phone we care about (390 px).
export const VIEW_ARC_R = 10 * Math.PI / 180;
// Bearings out past here are close enough to the rail column that they also have
// to lie LOW in the picture, below the bottom icon: the rail is a fixed-size
// column, so on a short screen it reaches down past the middle of the screen.
// tan(20 deg) puts a stone about 2/3 of the way down, under the last icon.
const RAIL_ARC = 6 * Math.PI / 180;
const RAIL_LO = 0.36;
const FAN_ARC = 13 * Math.PI / 180;

// Overlap is a SCREEN problem, not a world one: two stones a metre apart look
// well separated at 3 m and stuck together at 7 m. So spacing is measured as the
// ANGLE between two stones from the player's eye, which maps straight to pixels
// (a portrait tablet shows 58 deg over its height, so 1 deg is about 14 px).
// 7 deg is ~100 px apart in portrait and ~80 px in landscape: two clearly
// separate things to tap in either orientation.
const MIN_ANG = 7 * Math.PI / 180;
// The wishes the placer walks down when a beach is too small to grant the first
// one. The last, 3.6 deg (~50 px), is still two distinguishable stones.
const GAP_WISHES = [MIN_ANG, 5.8 * Math.PI / 180, 4.6 * Math.PI / 180, 3.6 * Math.PI / 180];

// Steepest look-down angle, as tan(depression), that still puts a stone clear of
// the bottom controls. The resting camera pitches 10 deg down over a 58 deg
// frame, so tan(27 deg) lands a stone at ~78% of the way down the screen — above
// the WIND UP button even in landscape, where the screen is short.
const FRAME_HI = 0.51;
// Shallowest look-down angle: any flatter than tan(13.5 deg) and the stone climbs
// into the top half of the screen, where the icon rail is.
const FRAME_LO = 0.24;

// A stone may rest in up to this much water. The lake surface is at y = 0 and it
// is translucent near the shore, so a pebble at the water's edge reads perfectly
// — and it is where the good skimmers actually are.
const WET_FLOOR = -0.3;

// How far out a loose stone may lie, in metres. The pick proxy is a small sphere,
// so its tap target shrinks with distance: at 6 m it is still a comfortable
// ~80 px across on a portrait tablet, at 11 m it is a 40 px speck. So the scatter
// spreads sideways and in depth up to here, and never further.
const MAX_REACH = 6.6;

const GOOD_FLATNESS = 0.74;
const GOOD_KINDS = ROCK_KINDS.filter(k => k.flatness >= GOOD_FLATNESS);

function pickKind(rnd, pool) {
  // Every spot keeps at least two proper skimmers on the sand, so "pick the flat
  // one" always works and no beach is ever a dead end.
  if (pool) {
    const good = pool.filter(r => !r.consumed && r.kind.flatness >= GOOD_FLATNESS).length;
    if (good < 2) return GOOD_KINDS[Math.floor(rnd() * GOOD_KINDS.length)];
  }
  let total = 0;
  for (const k of ROCK_KINDS) total += k.chance;
  let r = rnd() * total;
  for (const k of ROCK_KINDS) { r -= k.chance; if (r <= 0) return k; }
  return ROCK_KINDS[0];
}

export function createRockField(scene) {
  const geos = buildGeometries();
  const rnd = mulberry32(31337);
  const group = new THREE.Group();
  group.name = 'rocks';
  scene.add(group);

  // Invisible-but-raycastable pick spheres: pebbles are tiny, small fingers are
  // not. material.visible = false keeps them out of the render but in the ray.
  const proxyGeo = new THREE.SphereGeometry(1, 8, 6);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

  const bySpot = new Map();
  let activeSpot = null;
  // The one special stone currently washed up on the beach, if any (phase 3).
  let specialRock = null;

  /**
   * One scattered stone. Pass `special` (a SPECIAL_STONES entry) to place a
   * bought stone on the beach instead of a lake pebble: it gets the same
   * placement, bob and fat pick proxy, so it is picked up exactly like the rest.
   */
  function makeRock(spot, slotIndex, pool, special) {
    const kind = special
      ? { id: special.id, name: special.name, tag: special.tag, color: special.color }
      : pickKind(rnd, pool);
    const gset = geos[special ? (special.geo || 'flat') : kind.id] || geos.flat;
    const geo = special ? gset[0] : gset[Math.floor(rnd() * gset.length)];
    // radius in metres: a skimming stone, not a boulder
    const scale = special
      ? 0.15 * (special.size || 1)
      : lerp(0.105, 0.17, rnd()) * (1 + kind.weight * 0.35);
    const mat = new THREE.MeshLambertMaterial({ color: kind.color, flatShading: true });
    if (special) {
      // a special stone should catch the eye from across the beach
      mat.emissive = new THREE.Color(special.glow || special.color);
      mat.emissiveIntensity = 0.5;
    } else {
      mat.color.offsetHSL(0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.1);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);

    // Rocks must be where a child will actually see them WITHOUT dragging the
    // view around. A portrait tablet (58 deg vertical FOV, ~0.6 aspect) only
    // shows about +-18 deg horizontally, so every stone goes inside a hard
    // +-VIEW_ARC cone in front of the spot. Nothing may ever be placed outside
    // it: an off-screen stone reads as "this beach is empty".
    const base = Math.atan2(spot.fx, spot.fz);
    const n = Math.max(1, spot.rockCount || 1);
    const slot = ((slotIndex % n) + 0.5) / n - 0.5;          // -0.5 .. +0.5

    // Where the player's eye is, so spacing can be judged the way they see it.
    const eyeY = (spot.onPier ? spot.standY : Math.max(0.05, heightAt(spot.x, spot.z))) + EYE_HEIGHT;
    /** Bearing + depression of a point, as seen from the eye (radians). */
    const angOf = (px, py, pz) => {
      const dx = px - spot.x, dz = pz - spot.z;
      const d = Math.max(0.4, Math.hypot(dx, dz));
      return { az: Math.atan2(dx, dz), dep: Math.atan2(eyeY - py, d) };
    };
    /** Angle to the nearest other stone at this spot — the on-screen gap. */
    const clearance = (cx, cy, cz) => {
      const a = angOf(cx, cy, cz);
      let best = Infinity;
      if (pool) for (const r of pool) {
        if (r.consumed) continue;
        const b = angOf(r.mesh.position.x, r.baseY, r.mesh.position.z);
        let daz = a.az - b.az;
        if (daz > Math.PI) daz -= TAU; else if (daz < -Math.PI) daz += TAU;
        best = Math.min(best, Math.hypot(daz, a.dep - b.dep));
      }
      return best;
    };

    let x = spot.x, z = spot.z, gy = 0;
    if (spot.onPier) {
      // Along the deck in front of the player. spot.deck says how much deck is
      // actually there (the Long Pier only has ~5 m past the marker; the Cove
      // Jetty has the whole run back to the shore). Best of many tries, because
      // two stones within a finger's width of each other are one bad tap.
      const d = spot.deck || { min: 1.8, max: 4.4, side: 1.2 };
      let bestClear = -1;
      for (let i = 0; i < 26; i++) {
        // A special stone waits at the FAR end of the deck: it should read as
        // something washed in from the lake, not as part of the pile at your feet.
        // Ordinary stones stop short of that band, so the special is always the
        // outermost stone on the deck.
        // Never closer than the framing allows: a stone on the deck 2.5 m ahead
        // is 32 deg below the eye, which is behind the bottom controls.
        const dMin = Math.max(d.min, EYE_HEIGHT / FRAME_HI);
        // near row / far row, so the stones on a small deck have depth between
        // them instead of sitting in one crowded line across the planks
        const u = special ? 0.9 + rnd() * 0.1
          : (slotIndex % 2 === 0 ? rnd() * 0.4 : 0.44 + rnd() * 0.4);
        const along = dMin + u * Math.max(0.4, d.max - dMin);
        // the sideways offset is capped by the same portrait cone: 1.3 m of deck
        // at 2.4 m along is 28 deg off-axis, which is off the edge of the screen
        const sideL = Math.min(d.side, along * Math.tan(VIEW_ARC));
        // The rail is a fixed column of icons, so on a SHORT screen it reaches
        // further down the picture. A stone far down the deck is high up in the
        // picture, so those keep well to the left of it.
        const sideR = Math.min(d.side, along * Math.tan(VIEW_ARC_R)) * (u > 0.6 ? 0.3 : 1);
        // Each stone owns a SLOT across the width of the deck. A pier deck is only
        // a couple of metres wide, so leaving the sideways offset to the dice put
        // two stones under one fingertip however many tries we took.
        const t = special ? rnd()
          : clamp(slot + 0.5 + (rnd() - 0.5) * 0.7 / n, 0.02, 0.98);
        const side = -sideL + t * (sideL + sideR);
        const cx = spot.x + spot.fx * along + spot.rx * side;
        const cz = spot.z + spot.fz * along + spot.rz * side;
        const c = clearance(cx, spot.standY, cz);
        if (c > bestClear) { bestClear = c; x = cx; z = cz; }
        if (c > MIN_ANG) break;
      }
      gy = spot.standY;
    } else {
      // Sweep the forward arc for dry ground that is actually FRAMED. "In front"
      // is not enough: on a steep bank (Willow) the sand two metres ahead is four
      // metres below the eye and sits off the bottom of the screen. So only accept
      // ground whose depression angle from the eye is inside the band the resting
      // camera shows (pitch -3 deg, 58 deg vertical FOV => roughly 10..24 deg down
      // puts a stone in the lower half of the picture, clear of the HUD chips).
      // tan(depression) band: FRAME_LO..FRAME_HI is roughly 8..27 deg below the
      // eye, which the resting camera (REST_PITCH = -10 deg) shows between the
      // middle of the screen and just above the bottom controls.
      // SIGN: `base + da` rotates the aim towards the player's LEFT for positive
      // da (layout's right vector is the aim turned the other way). So the icon
      // rail, which lives on the RIGHT of the screen, limits NEGATIVE da.
      const fanR = Math.min(FAN_ARC, VIEW_ARC_R);        // reach towards the rail
      const want = base - fanR + (slot + 0.5) * (fanR + FAN_ARC);
      /** Ground inside the cone whose depression angle is inside `band`. */
      const sweep = (arc, loRatio, hiRatio) => {
        const out = [];
        const arcR = Math.min(arc, VIEW_ARC_R);          // towards the rail
        const step = (arc + arcR) / 22;
        for (let da = -arcR; da <= arc + 1e-6; da += step) {
          const a = base + da, sa = Math.sin(a), ca = Math.cos(a);
          let r0 = 0, r1 = 0;
          for (let r = 1.6; r < MAX_REACH; r += 0.2) {
            const h = heightAt(spot.x + sa * r, spot.z + ca * r);
            // WET_FLOOR: a couple of centimetres of water is fine — skimming
            // stones live at the water's EDGE, and on a flat beach (Reed Point)
            // the dry strip is under a metre deep, far too small for a fan of
            // stones. Anything deeper than that is properly in the lake.
            if (h <= WET_FLOOR || h > eyeY - 0.4) continue;   // deep water, or a wall
            const ratio = (eyeY - h) / r;                     // tan(depression)
            // Stones out near the rail have to lie LOWER in the picture, under
            // the bottom icon (see RAIL_ARC).
            const lo = da < -RAIL_ARC ? Math.max(loRatio, RAIL_LO) : loRatio;
            if (ratio > hiRatio || ratio < lo) continue;      // too steep / too flat
            if (!r0) r0 = r;
            r1 = r;
          }
          if (r0) out.push({ a, r0, r1 });
        }
        return out;
      };
      // Framing is negotiable, the view cone is NOT. Take the nicely-framed band,
      // and widen it when that leaves too little room to spread a fan of stones
      // (few bearings, or almost no depth) — but never widen the cone itself.
      let cands = sweep(VIEW_ARC, FRAME_LO, FRAME_HI);
      const roomy = cands.reduce((a, c) => a + (c.r1 - c.r0) + 0.2, 0);
      if (cands.length < 8 || roomy < 5) {
        const more = sweep(VIEW_ARC, 0.2, 0.6);
        if (more.length > cands.length) cands = more;
      }
      if (cands.length) {
        const place = (c, u) => {
          const r = c.r0 + (c.r1 - c.r0) * u;
          return { x: spot.x + Math.sin(c.a) * r, z: spot.z + Math.cos(c.a) * r };
        };
        // A special stone sits at the OUTSIDE edge of the scatter: furthest patch
        // in the cone, at the far end of it. Ordinary stones prefer the bearing
        // their slot asked for, and alternate between a near row and a far row so
        // the fan has depth instead of being one crowded line.
        if (special) cands.sort((p, q) => q.r1 - p.r1);
        else cands.sort((p, q) => Math.abs(p.a - want) - Math.abs(q.a - want));
        const near = slotIndex % 2 === 0;
        const depth = () => special ? 0.88 + rnd() * 0.12
          : (near ? 0.05 + rnd() * 0.4 : 0.5 + rnd() * 0.36);
        let chosen = cands[0], pos = place(chosen, depth()), bestClear = -1;
        // Spacing is a *soft* wish, walked down in steps: crowding the stones a
        // little is better than pushing one out of the cone, where a child would
        // have to hunt for it. Each wish gets several bearings AND depths.
        for (const gap of GAP_WISHES) {
          let hit = false;
          for (const c of cands) {
            for (let k = 0; k < 3; k++) {
              const p = place(c, depth());
              const cl = clearance(p.x, Math.max(heightAt(p.x, p.z), 0), p.z);
              // remember the roomiest spot seen, so even a hopeless beach never
              // drops two stones on the same grain of sand
              if (cl > bestClear) { bestClear = cl; chosen = c; pos = p; }
              if (cl > gap) { hit = true; break; }
            }
            if (hit) break;
          }
          if (hit) break;
        }
        // Small lateral jitter so the fan never looks like a grid. It leans AWAY
        // from the rail (see the sign note above), so it can never nudge a stone
        // out from under the cone's right-hand limit and behind the icons.
        const j = rnd() * 0.26;
        x = pos.x + Math.cos(chosen.a) * j;
        z = pos.z - Math.sin(chosen.a) * j;
        // a stone in the shallows rests ON the surface line, so it is never a
        // submerged blob: the water is drawn at y = 0
        gy = Math.max(heightAt(x, z), 0);
      } else {
        // Nothing dry and well-framed in the cone (a spot standing right on the
        // water's edge, e.g. Waterfall Inlet). Walk out along this slot's bearing
        // and stand the stone on the last dry step before the water, so it is
        // always IN FRONT and always on screen.
        const sa = Math.sin(want), ca = Math.cos(want);
        // never closer than the eye height / max on-screen depression, or the
        // stone sits under the player's chin and off the bottom of the picture
        const near = Math.max(2.0, (eyeY - 0.1) / 0.74);
        let r = near;
        for (let t = near; t < MAX_REACH + 0.6; t += 0.2) {
          if (heightAt(spot.x + sa * t, spot.z + ca * t) > 0.06) r = t;
        }
        x = spot.x + sa * r;
        z = spot.z + ca * r;
        gy = Math.max(heightAt(x, z), 0.1);
      }
    }
    mesh.position.set(x, gy + scale * 0.35, z);
    mesh.rotation.set(rnd() * 0.5, rnd() * TAU, rnd() * 0.5);

    const rock = {
      kind, mesh, geo, scale, slotIndex, spotId: spot.id,
      special: special || null,
      material: mat,
      props: special
        ? { flatness: special.props.flatness, weight: special.props.weight, edge: special.props.edge, size: scale }
        : {
          flatness: clamp(kind.flatness + (rnd() - 0.5) * 0.09, 0.05, 1),
          weight: clamp(kind.weight + (rnd() - 0.5) * 0.12, 0.2, 1),
          edge: clamp(kind.edge + (rnd() - 0.5) * 0.12, 0.05, 1),
          size: scale,
        },
      bobPhase: rnd() * TAU,
      spawnT: 0,
      baseY: mesh.position.y,
    };
    rock.props.stars = special ? 5 : rockStars(rock.props);
    mesh.userData.rock = rock;
    group.add(mesh);

    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    // 0.22 m radius is a 100+ px target at 4 m on a tablet. Stones further out
    // get a proportionally fatter proxy so the tap target stays about that size
    // on screen — capped well under MIN_GAP so neighbours never swallow each
    // other's taps. main.js also breaks ties by angular offset from the tap ray.
    const reach = Math.hypot(x - spot.x, z - spot.z);
    proxy.scale.setScalar(Math.max(0.22, scale * 1.9, Math.min(0.36, reach * 0.055)));
    proxy.position.copy(mesh.position);
    proxy.userData.rock = rock;
    rock.proxy = proxy;
    group.add(proxy);
    return rock;
  }

  for (const s of SPOTS) {
    const arr = [];
    for (let i = 0; i < s.rockCount; i++) arr.push(makeRock(s, i, arr));
    bySpot.set(s.id, arr);
    for (const r of arr) { r.mesh.visible = false; r.proxy.visible = false; }
  }

  /** Loose stones here, plus the special one if it has washed up. */
  function refreshPickables() {
    const arr = (bySpot.get(activeSpot && activeSpot.id) || []).filter(r => !r.consumed);
    api.pickables = arr.map(r => r.proxy);
    if (specialRock && !specialRock.consumed) api.pickables.push(specialRock.proxy);
  }

  /** Take the washed-up special stone off the beach (it is in hand, or we left). */
  function despawnSpecial() {
    if (!specialRock) return;
    group.remove(specialRock.mesh);
    group.remove(specialRock.proxy);
    specialRock.mesh.visible = false;
    specialRock.proxy.visible = false;
    specialRock = null;
    refreshPickables();
  }

  const api = {
    group,
    selected: null,
    pickables: [],

    setActiveSpot(spotId) {
      activeSpot = SPOTS.find(s => s.id === spotId);
      for (const [id, arr] of bySpot) {
        const on = id === spotId;
        for (const r of arr) {
          r.mesh.visible = on && !r.consumed;
          r.proxy.visible = on && !r.consumed;
        }
      }
      // a special stone belongs to the beach it washed up on: leaving takes it
      // off the sand (main.js re-spawns it here if it is still off cooldown)
      despawnSpecial();
      refreshPickables();
      // NO auto-pick anywhere in the game: choosing your stone is the first half
      // of it, so arriving somewhere always leaves your hands empty until you tap
      // a stone. A special stone already in hand stays in hand.
      if (api.selected && api.selected.spotId !== spotId && !api.selected.special) {
        api.selected = null;
      }
    },

    /** Is there anything at this spot still worth picking up? */
    anyAvailable(spotId) {
      return (bySpot.get(spotId || (activeSpot && activeSpot.id)) || []).some(r => !r.consumed);
    },

    // --- special stones (phase 3: they wash up, they are not held) -----------
    /** The special stone currently lying on this beach, if any. */
    get special() { return specialRock; },

    /**
     * Wash a bought stone up among the loose rocks at the active spot. It uses a
     * scattered slot's placement, so it lands in the same visible cone as the
     * ordinary stones and is picked up with the same tap.
     */
    spawnSpecial(id) {
      if (!activeSpot || specialRock) return null;
      const sp = SPECIAL_STONES.find(s => s.id === id);
      if (!sp) return null;
      const arr = bySpot.get(activeSpot.id) || [];
      const slot = Math.floor(rnd() * Math.max(1, activeSpot.rockCount || 1));
      const rock = makeRock(activeSpot, slot, arr, sp);
      rock.spawnT = 0.001;
      specialRock = rock;
      refreshPickables();
      return rock;
    },

    select(rock) {
      if (api.selected === rock) return rock;
      api.selected = rock;
      return rock;
    },

    fromMesh(mesh) { return mesh && mesh.userData.rock; },

    /** Remove the thrown rock and grow a fresh one in its place. */
    consumeSelected() {
      const rock = api.selected;
      if (!rock) return null;
      // A special stone is used up like any other: it has to wash up again
      // (main.js restarts its one-minute cooldown from the returned rock).
      if (rock.special) {
        rock.consumed = true;
        if (specialRock === rock) despawnSpecial();
        else { group.remove(rock.mesh); group.remove(rock.proxy); }
        api.selected = null;
        refreshPickables();
        return rock;
      }
      rock.consumed = true;
      rock.mesh.visible = false;
      rock.proxy.visible = false;
      group.remove(rock.mesh);
      group.remove(rock.proxy);
      const arr = bySpot.get(rock.spotId);
      const idx = arr.indexOf(rock);
      const spot = SPOTS.find(s => s.id === rock.spotId);
      setTimeout(() => {
        const fresh = makeRock(spot, rock.slotIndex, arr);
        const on = !!(activeSpot && activeSpot.id === spot.id);
        fresh.mesh.visible = on;
        fresh.proxy.visible = on;
        fresh.spawnT = 0.001;
        arr.push(fresh);
        if (on) refreshPickables();
      }, 900);
      api.selected = null;
      if (idx >= 0) arr.splice(idx, 1);
      refreshPickables();
      return rock;
    },

    /** Fresh visual copy of a rock for the flying stone. */
    makeVisual(rock, sizeMul = 1) {
      // bought stones have no scattered mesh, only a material
      const mesh = new THREE.Mesh(rock.geo, rock.material || rock.mesh.material);
      mesh.scale.setScalar(rock.scale * sizeMul);
      return mesh;
    },

    /**
     * Copy for the first-person hand. The hand sits 0.86 m from the eye, so a
     * world-scale stone there fills a third of the screen; normalise it to a bit
     * over half the fist width (fist radius 0.082) so it reads as held, not as a
     * boulder balanced on a fist. A little variation between kinds survives.
     */
    makeHandVisual(rock) {
      const mesh = new THREE.Mesh(rock.geo, rock.material || rock.mesh.material);
      mesh.scale.setScalar(clamp(rock.scale * 0.34, 0.038, 0.055));
      return mesh;
    },

    update(dt, t) {
      const arr = activeSpot ? (bySpot.get(activeSpot.id) || []).slice() : null;
      if (!arr) return;
      // a washed-up special stone animates with the rest, only more so
      if (specialRock && !specialRock.consumed) arr.push(specialRock);
      // Nothing in hand? The loose stones hop gently to say "tap me". Picking is
      // manual now, so the invitation has to come from the stones themselves.
      const inviting = !api.selected;
      for (const r of arr) {
        const sp = !!r.special;
        r.mesh.position.y = r.baseY + (inviting
          ? Math.abs(Math.sin(t * (sp ? 2.4 : 1.7) + r.bobPhase)) * (sp ? 0.075 : 0.035) : 0);
        if (r.spawnT > 0 && r.spawnT < 1) {
          r.spawnT = Math.min(1, r.spawnT + dt * 3.2);
          r.mesh.scale.setScalar(r.scale * (0.3 + 0.7 * r.spawnT));
        }
        const sel = api.selected === r;
        const target = sel ? 1.28 : 1.0;
        const cur = r.mesh.scale.x / r.scale;
        if (r.spawnT >= 1 || r.spawnT === 0) {
          const k = lerp(cur, target, Math.min(1, dt * 9));
          r.mesh.scale.setScalar(r.scale * k);
        }
        if (sel || sp) r.mesh.rotation.y += dt * (sp && !sel ? 0.7 : 0.9);
        // the glow breathes, which is the "something good is on the sand" cue
        if (sp && r.material.emissive) r.material.emissiveIntensity = 0.4 + 0.28 * Math.sin(t * 3.4);
      }
    },
  };

  return api;
}
