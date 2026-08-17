// Pure ground maths for the lake (no Three.js) so it can be reasoned about /
// unit-tested on its own. terrain.js turns this into geometry.

import { RAD, clamp, sat, lerp, smoothstep, smoothRange, fbm } from '../util.js';
import { LAKE, lakeRadius, shoreStyle, ISLANDS, COVE, coveDist, WATER_Y } from './layout.js';

// Region covered by the terrain mesh / water plane / depth texture (must match).
export const REGION = { cx: 22, cz: 55, size: 620 };
export const WATER_REGION = { cx: 22, cz: 55, size: 430 };

const ISLAND_SEEDS = [1.7, 4.2, 0.6];
function islandRadius(isl, i, ang) {
  return isl.r * (1 + 0.2 * Math.sin(3 * ang + ISLAND_SEEDS[i % 3]) + 0.11 * Math.sin(5 * ang - 1.4));
}

/** Ground height in metres; the water surface is y = 0. */
export function heightAt(x, z) {
  const dx = x - LAKE.cx, dz = z - LAKE.cz;
  const r = Math.hypot(dx, dz) || 0.0001;
  const theta = Math.atan2(dz, dx);
  const R = lakeRadius(theta);
  const st = shoreStyle(theta * RAD);
  const d = R - r;                            // > 0 inside the lake

  let h;
  if (d > 0) {
    const shelf = smoothstep(d / st.shelf);
    const deep = smoothstep((d - st.shelf) / 72);
    h = -(1.75 * shelf + 7.6 * deep);
    h += (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 0.5 * sat(d / 8);
  } else {
    const t = -d;
    h = st.bankH * (1 - Math.exp(-t / st.slope));
    h += 30 * smoothRange(26, 210, t) * (0.3 + 0.95 * fbm(x * 0.0055 + 3.1, z * 0.0055 - 1.7, 4));
    h += 1.5 * (fbm(x * 0.045, z * 0.045, 3) - 0.5) * smoothRange(0, 14, t);
  }

  // islands: land above water plus their own shallow shelf
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const ix = x - isl.x, iz = z - isl.z;
    const di = Math.hypot(ix, iz);
    if (di > isl.r + 62) continue;
    const ang = Math.atan2(iz, ix);
    const ir = islandRadius(isl, i, ang);
    const u = ir - di;
    if (u > 0) {
      let ih = isl.h * (1 - Math.exp(-u / (isl.r * 0.4)));
      ih += (fbm(x * 0.06 + 9, z * 0.06 + 4, 3) - 0.5) * 0.7 * sat(u / 4);
      if (ih > h) h = ih;
    } else {
      const shelfH = -(1.1 + 7.2 * smoothRange(0, 48, -u));
      if (shelfH > h) h = shelfH;
    }
  }

  // cove channel: carve a shallow inlet inland so the bridge has something to span
  const cv = coveDist(x, z);
  const hw = COVE.halfWidth * cv.w;
  if (cv.d < hw * 1.5) {
    const w = 1 - smoothRange(hw * 0.55, hw * 1.32, cv.d);
    if (w > 0) {
      const bed = -COVE.depth * (0.45 + 0.55 * (1 - sat(cv.d / hw))) - 0.35 * Math.sin(cv.t * 9);
      h = lerp(h, Math.min(h, bed), smoothstep(w));
    }
  }
  return h;
}

export function depthAt(x, z) {
  const h = heightAt(x, z);
  return h < WATER_Y ? (WATER_Y - h) : 0;
}
export function isWater(x, z) { return heightAt(x, z) < WATER_Y - 0.02; }

/** Which island (if any) contains a point — used by the Sand Isle achievement. */
export function islandAt(x, z) {
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const di = Math.hypot(x - isl.x, z - isl.z);
    if (di < isl.r * 1.25 && heightAt(x, z) > WATER_Y - 0.05) return isl;
  }
  return null;
}
