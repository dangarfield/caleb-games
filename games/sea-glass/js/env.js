// Renderer, the generated environment map (no HDRI download), procedural
// textures and the shared geometry factories. Everything visual that both the
// beach scene and the collection scene need lives here.

import * as THREE from 'three';
import { profile } from './quality.js';

export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('view'),
  antialias: true,
  powerPreference: 'high-performance',
});
// The third argument MUST be false. setSize(w, h) writes an inline
// style="width:1024px;height:768px" onto the canvas, which beats the stylesheet's
// width:100%/height:100% — and because resize() also passes false, that stale
// inline size then survives every rotation and letterboxes the whole game.
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// The quality profile owns the pixel ratio cap and the shadow switch. On Low that
// is dpr<=1.15 with the shadow pass off, which on a dpr-2 tablet is roughly a
// two-thirds cut in shaded pixels per frame plus one whole pass gone.
const q0 = profile();
renderer.shadowMap.enabled = q0.shadows;

export const perf = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, q0.pixelRatioCap),
  shadows: q0.shadows,
  bodyBudget: 1,     // multiplier applied to a beach's stoneCount
  fps: 0,
  drawCalls: 0,
  bodies: 0,
};
renderer.setPixelRatio(perf.pixelRatio);

// A very small screen (phone) starts leaner; tablets get the full pile.
if (Math.min(window.innerWidth, window.innerHeight) < 520) perf.bodyBudget = 0.78;

export function setPixelRatio(r) {
  perf.pixelRatio = r;
  renderer.setPixelRatio(r);
}
export function setShadows(on) {
  perf.shadows = on;
  renderer.shadowMap.enabled = on;
}

/**
 * Push the current quality profile's renderer settings. Called on boot and every
 * time the player flips the Quality toggle, so the pixel ratio and the shadow
 * pass change on the very next frame — no reload, no rebuild.
 */
export function applyRenderQuality() {
  const q = profile();
  setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioCap));
  setShadows(q.shadows);
}

// ---------------------------------------------------------------------------
// Environment map: an equirectangular gradient sky painted to a canvas, then
// pushed through PMREMGenerator. Gives believable sheen on wet stones and a
// real reflection for the frosted glass without downloading anything.
// ---------------------------------------------------------------------------
function paintSky(sky, haze, sand, sunAngle) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, shade(sky, -0.22));
  grad.addColorStop(0.30, sky);
  grad.addColorStop(0.47, haze);
  grad.addColorStop(0.50, shade(haze, -0.05));
  grad.addColorStop(0.56, shade(sand, 0.06));
  grad.addColorStop(1.00, shade(sand, -0.3));
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // sun blob
  const sx = (sunAngle / (Math.PI * 2)) * 1024;
  const sy = 140;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 210);
  sun.addColorStop(0, 'rgba(255,252,235,1)');
  sun.addColorStop(0.13, 'rgba(255,246,215,0.85)');
  sun.addColorStop(0.5, 'rgba(255,240,205,0.22)');
  sun.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = sun;
  g.fillRect(sx - 220, sy - 220, 440, 440);

  // soft cumulus band — cheap: overlapping translucent ellipses
  g.globalAlpha = 0.55;
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 1024;
    const y = 40 + Math.pow(Math.random(), 1.6) * 170;
    const rw = 40 + Math.random() * 130;
    const rh = rw * (0.2 + Math.random() * 0.25);
    const cg = g.createRadialGradient(x, y, 0, x, y, rw);
    const bright = 0.72 + Math.random() * 0.28;
    cg.addColorStop(0, `rgba(255,255,255,${bright})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  if (amt > 0) c.lerp(new THREE.Color(0xffffff), amt);
  else c.lerp(new THREE.Color(0x000000), -amt);
  return '#' + c.getHexString();
}

let pmrem = null;
const envCache = new Map();

/** Returns { background, environment } for a palette; cached per beach. */
export function makeEnvironment(key, skyHex, hazeHex, sandHex) {
  if (envCache.has(key)) return envCache.get(key);
  if (!pmrem) {
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
  }
  const bg = paintSky(
    '#' + new THREE.Color(skyHex).getHexString(),
    '#' + new THREE.Color(hazeHex).getHexString(),
    '#' + new THREE.Color(sandHex).getHexString(),
    Math.PI * 1.35
  );
  const env = pmrem.fromEquirectangular(bg).texture;
  const out = { background: bg, environment: env };
  envCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// The stone look, in ONE place.
//
// Two things draw this beach's stones: the dynamic pebble InstancedMeshes
// (pebbles.js) and the painted shingle bed under them (shingleTexture, below).
// They used to carry their own copies of the size and tint rules, and they
// drifted — the painted bed came out brighter (its tint band averaged ~1.02
// against the pile's ~0.75), rounder-but-smaller than the visible stones, and lit
// from the wrong side. The result read as two different materials meeting at the
// edge of the pile, which is exactly what it was.
//
// So the rules live here and both consumers import them. A change to the pile's
// look now moves the painted bed with it, by construction.
// ---------------------------------------------------------------------------

/** How often each pebble variant occurs (cumulative thresholds are applied below). */
export const STONE_VARIANT_MIX = [0.42, 0.36, 0.22];

/**
 * Visual half-extents of a stone as a multiple of its nominal radius. Wider than
 * round and much FLATTER, because beach pebbles are oblate. x/z is what a painted
 * stone has to match: it is the stone's footprint seen from above.
 */
export const STONE_VARIANT_SCALE = [
  new THREE.Vector3(1.28, 0.66, 1.16),
  new THREE.Vector3(1.20, 0.76, 1.22),
  new THREE.Vector3(1.32, 0.58, 1.14),
];

/** Per-variant tint: the glossier "wet" stones are darker, as wet stones are. */
export const STONE_VARIANT_TINT = [1.0, 0.9, 0.76];

/** The per-stone brightness band applied on top of the palette colour. */
export const STONE_TINT_MIN = 0.70;
export const STONE_TINT_RANGE = 0.34;

/** Pick a variant index from the shared mix. `rnd` is the caller's generator. */
export function pickStoneVariant(rnd) {
  const r = rnd();
  if (r > STONE_VARIANT_MIX[0] + STONE_VARIANT_MIX[1]) return 2;
  if (r > STONE_VARIANT_MIX[0]) return 1;
  return 0;
}

/**
 * Tint one stone into `out`: palette colour, the shared brightness band, the
 * variant's tint, and `lift` (the Lambert compensation — 1 for anything that is
 * still lit by the environment map, which includes the painted bed).
 */
export function stoneTint(out, baseHex, variant, rnd, lift) {
  out.setHex(baseHex);
  out.multiplyScalar(
    (STONE_TINT_MIN + rnd() * STONE_TINT_RANGE) * STONE_VARIANT_TINT[variant] * (lift || 1));
  return out;
}

// The sun sits at (-3.6, +6.2, +2.4), so a stone lying on the ground is lit from
// -x / +z and its shadow falls to +x / -z. On the pit floor plane (rotated -90
// about x) texture +u is world +x and texture +v is world -z, and a canvas's y
// axis runs opposite to v — so in CANVAS pixels the highlight belongs at
// (-x, +y) and the seat at (+x, -y). The old painter had both flipped in y, which
// lit the painted stones from the opposite side to every real one.
const LIGHT_PX = { hx: -0.20, hy: 0.24, sx: 0.12, sy: -0.20 };

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
const texCache = new Map();

/** Grainy damp sand: speckle + a couple of wave-drag ripples. */
export function sandTexture(baseHex) {
  const key = 'sand' + baseHex;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  g.fillStyle = '#' + base.getHexString();
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.06 + i) * 5);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/**
 * Paint a bed of this beach's stones over the whole canvas.
 *
 * Every stone is drawn to the SAME rules as a dynamic pebble: a variant is picked
 * from the shared mix, its footprint is the variant's x/z half-extents times a
 * radius drawn from the beach's own size band, and its colour comes out of
 * stoneTint. Two fills each — a weak concentric crevice shadow, then the stone as a
 * single radial gradient running from its sunward crown to its shaded limb — which
 * is what makes it read as a bedded stone rather than a printed disc.
 *
 * Three things here were what made the painted bed read as a DIFFERENT MATERIAL
 * from the pile, and all three are deliberate now:
 *
 *  1. The light direction never rotates. The old painter did `g.rotate()` and then
 *     drew the highlight at a fixed offset, so every painted stone was lit from its
 *     own random direction while every real one is lit by the one scene sun. The
 *     footprint's orientation is passed to `ellipse()` as its rotation argument
 *     instead, leaving the shading in canvas space.
 *  2. Shading is CLIPPED to the stone. The old dark seat was drawn at 1.06x the
 *     stone, so it ringed it — hundreds of overlapping dark rings, which is the
 *     "flat translucent discs" look. Now the form shading lives inside the outline.
 *  3. Footprints are scaled by FOOT. A painted stone always shows its plan view
 *     (the two widest axes); a real one is at a random 3D orientation and so
 *     presents a narrower silhouette about four fifths as wide on average. Painting
 *     the full plan view made the bed's stones look a size bigger than the pile's.
 *
 * `wrap` draws anything crossing an edge again on the opposite side, so the
 * result tiles seamlessly (the rim bank needs that; the pit floor does not).
 */
/** Painted footprint vs the stone's full plan view — see note 3 above. */
const FOOT = 0.82;
/**
 * The scene's lighting, baked into the paint. A dynamic pebble carries exactly the
 * same tint as a painted one, but it then gets the sun, the ambient and the env map
 * on top, so the raw tint on its own comes out as a dark slate bed under a pale pile.
 *
 * It takes BOTH terms. A multiply alone is what the first attempt used, and it fits
 * the pale beaches while leaving stormPoint's dark stones at half the brightness of
 * the real ones — a rough dark stone still catches a skyful of light, and that
 * contribution is additive, not proportional.
 *
 * Both are fitted, not eyed: research/match.mjs shoots the pit with and without the
 * movable stones on every beach, and these are set so the two frames have the same
 * mean brightness. As shipped the pile measures 1.06 / 1.19 / 0.98 / 1.10 of its own
 * painted bed on High and 0.92 / 1.09 / 0.91 / 1.09 on Low (pebbleCove / copperShore
 * / shellBay / stormPoint), against up to 2x out before. Re-run that check after
 * touching anything in this block, the pebble material, or profile.low.shadeLift —
 * those four numbers are the whole point of sharing this module.
 */
const LIGHT_LIFT = 1.14;    // sun + diffuse, proportional to the stone's own colour
const LIGHT_AMB = 0.115;    // sky / env, the same for a black stone and a white one

/**
 * A stone's colour under that lighting, at `m` of full sun, as a canvas fill string.
 */
function stoneShade(col, m) {
  const q = (v) => Math.max(0, Math.min(255, Math.round((v * m + LIGHT_AMB) * 255)));
  return 'rgb(' + q(col.r) + ',' + q(col.g) + ',' + q(col.b) + ')';
}

/**
 * The average tint one painted or dynamic stone ends up with, as a fraction of its
 * palette colour: the brightness band's midpoint times the variant mix's average
 * variant tint. Derived from the shared constants rather than written down, so it
 * cannot drift away from what stoneTint actually does.
 */
const MEAN_STONE_TINT = (STONE_TINT_MIN + STONE_TINT_RANGE / 2)
  * (STONE_VARIANT_MIX[0] * STONE_VARIANT_TINT[0]
    + STONE_VARIANT_MIX[1] * STONE_VARIANT_TINT[1]
    + STONE_VARIANT_MIX[2] * STONE_VARIANT_TINT[2]);

/**
 * What to fill a stone bed's canvas with BEFORE painting stones on it.
 *
 * It used to be sand, and that was the single loudest tell that the painted bed was
 * painted: random placement leaves gaps however dense the bed is, and every gap was
 * showing pale dry sand between the stones. Nowhere in the real pile can you see
 * sand — look between its stones and you see a deeper stone in shadow.
 *
 * So the base is this beach's own mean stone, one notch DOWN in light. Deliberately
 * only one notch: a near-black crevice colour looks right on the pale beaches but
 * drops the whole bed's brightness on the dark ones (stormPoint's bed measured 30%
 * darker than its pile that way), because the uncovered fraction is a good deal
 * larger than the density figure suggests. Sitting the base just under the mean lit
 * stone makes the bed's overall brightness almost independent of how much of it the
 * gaps are, while still reading as shadow between stones.
 */
const BED_BASE_SHADE = 0.86;
function bedBase(stones) {
  const c = new THREE.Color();
  let r = 0, g = 0, b = 0;
  for (const hex of stones) {
    c.setHex(hex);
    r += c.r; g += c.g; b += c.b;
  }
  const n = stones.length;
  c.setRGB(r / n, g / n, b / n).multiplyScalar(MEAN_STONE_TINT);
  return stoneShade(c, LIGHT_LIFT * BED_BASE_SHADE);
}
function paintStoneBed(g, S, opts) {
  const { stones, sizeBand, worldW, worldH, wrap, density } = opts;
  const cols = stones;
  const tmp = new THREE.Color();
  const rnd = Math.random;
  const [rMin, rMax] = sizeBand;
  const avgR = (rMin + rMax) / 2;

  // Enough stones to cover the patch `density` times over, using the average
  // painted footprint. Capped, because this runs once per beach on the main thread.
  const pxPerX = S / worldW, pxPerY = S / worldH;
  const avgRx = avgR * 1.27 * FOOT * pxPerX, avgRy = avgR * 1.17 * FOOT * pxPerY;
  // The cap is what the fine-gravel beaches actually hit: shellBay's 0.055-0.09
  // stones want ~3300 of them to cover its floor the requested number of times, and
  // at the old cap of 2200 it was silently getting two thirds of the density asked
  // for — the beach with the smallest stones was the one with the most visible gaps.
  const n = Math.min(3600, Math.round(density * S * S / (Math.PI * avgRx * avgRy)));

  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S;
    const v = pickStoneVariant(rnd);
    const sc = STONE_VARIANT_SCALE[v];
    const r = rMin + rnd() * (rMax - rMin);
    // The painted stone is the real stone's plan view: half-extents x and z, with
    // z going down the canvas. No extra squash — the old painter's 0.66..0.96 ry
    // multiplier is what made the bed read as smaller, eggier gravel.
    const rx = Math.max(2, r * sc.x * FOOT * pxPerX);
    const ry = Math.max(2, r * sc.z * FOOT * pxPerY);
    // How the footprint lies. Passed to ellipse() rather than applied to the
    // context, so the stone turns but the sunlight does not.
    const ang = rnd() * Math.PI;
    stoneTint(tmp, cols[(rnd() * cols.length) | 0], v, rnd, 1);
    // Lifted well above the raw tint, because these three stops have to stand in
    // for the whole scene's lighting: a real pebble's tint is the same as a painted
    // one's, but it then gets the sun, the ambient and the env map on top. Measured
    // rather than guessed — the pile and the bed are sampled side by side and the
    // stops set so their mean brightness matches (see LIGHT_LIFT).
    // The spread between these three is what makes a painted stone look DOMED. At
    // 1.22/1.10/0.94 it was only +/-13% and, next to a pile of shaded 3D lumps, the
    // bed read as flat overlapping discs — the right colours and the right size, but
    // obviously printed. Widened to about +/-30%, which is roughly the range the real
    // stones show from crown to limb, and rescaled so the area-weighted average of
    // the gradient is unchanged (that average is what the brightness match is fitted
    // on, so widening must not move it).
    const hi = stoneShade(tmp, LIGHT_LIFT * 1.46),
      mid = stoneShade(tmp, LIGHT_LIFT * 1.17),
      lo = stoneShade(tmp, LIGHT_LIFT * 0.82);
    // The sun's direction in the STONE's own frame, so the gradient can be drawn in
    // unit space (where the stone is a circle) and still be lit from the one
    // direction every other stone in the scene is lit from.
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const hx = LIGHT_PX.hx * 1.3, hy = LIGHT_PX.hy * 1.3;
    const ux = hx * ca + hy * sa, uy = hy * ca - hx * sa;

    const draw = (ox, oy) => {
      const cx = x + ox, cy = y + oy;
      // Crevice shadow: CONCENTRIC and weak. It has to be concentric — offsetting it
      // the way the sun throws a shadow left a hard dark crescent sticking out of
      // every stone, and with a bed this dense that is all you saw. Its job is only
      // to keep touching stones from merging into one flat blob, which is the same
      // job the real pile's contact shadows do.
      g.fillStyle = 'rgba(34,32,28,0.08)';
      g.beginPath();
      g.ellipse(cx, cy, rx * 1.07, ry * 1.07, ang, 0, 6.284);
      g.fill();
      // The stone: ONE gradient fill. Stacked translucent ellipses (a dark limb
      // plus a light crown) left a hard-edged dark disc inside a pale ring — every
      // painted stone read as a fried egg, which no lit 3D pebble next to it does.
      // A radial gradient from the sunward crown to the shaded limb is both rounder
      // and cheaper: one fill per stone instead of three.
      g.save();
      g.translate(cx, cy);
      g.rotate(ang);
      g.scale(rx, ry);
      const grd = g.createRadialGradient(ux, uy, 0.04, 0, 0, 1.3);
      grd.addColorStop(0, hi);
      grd.addColorStop(0.5, mid);
      grd.addColorStop(1, lo);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, 1, 0, 6.284);
      g.fill();
      g.restore();
    };
    draw(0, 0);
    if (wrap) {
      const wx = x < rx ? S : x > S - rx ? -S : 0;
      const wy = y < ry ? S : y > S - ry ? -S : 0;
      if (wx) draw(wx, 0);
      if (wy) draw(0, wy);
      if (wx && wy) draw(wx, wy);
    }
  }
  return n;
}

/**
 * Shingle already bedded into the beach, painted onto the pit floor.
 *
 * There is a hard ceiling on how many stones can be PHYSICS stones, and the
 * smaller each one is the less of the ground that budget covers. Painting the
 * floor with the same stones is what stops a fine-gravel beach reading as bare
 * sand with a few loose pebbles dropped on it: the movable stones sit on a bed
 * that looks like more of them.
 *
 * The texture covers the pit ONCE and is not tiled, so its edges can be faded
 * back into the dry sand — a repeating map would put a hard rectangle of shingle
 * on the beach, which is worse than the bare sand it was meant to fix.
 * `sizeBand` is the beach's own [rMin, rMax] and `worldW/H` the size of the patch,
 * both in world units, so painted stones come out the size of the real ones.
 */
export function shingleTexture(key, sandHex, stones, sizeBand, worldW, worldH) {
  const ck = 'shingle' + key;
  if (texCache.has(ck)) return texCache.get(ck);
  // 768, not 512: the floor patch is 4.6 world units wide and fills most of a
  // tablet, so a 512 map is magnified over 3x and its stones come out visibly
  // softer than the pile sitting on them — one of the tells that the bed and the
  // pile were different materials. Baked once per beach and cached.
  const S = 768;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = bedBase(stones);
  g.fillRect(0, 0, S, S);

  // 2.4 covers the floor twice over and then some. The real pile is two or three
  // stones deep, so anywhere you can see between its stones you should see more
  // stones — never the ground. Random placement always leaves a few percent
  // uncovered whatever this is set to, which is why the base fill underneath is a
  // crevice colour and not sand (bedBase).
  paintStoneBed(g, S, { stones, sizeBand, worldW, worldH, wrap: false, density: 2.4 });

  // Grain, then a wandering fade back to dry sand around the edge. Doing the
  // fade in the pixels rather than with material transparency keeps the floor a
  // single opaque draw — transparent full-screen planes are the one thing this
  // scene genuinely cannot afford.
  const sand = new THREE.Color(sandHex);
  const sr = sand.r * 255, sg = sand.g * 255, sb = sand.b * 255;
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const noise = (Math.random() - 0.5) * 26;
      // Distance to the nearest edge, 0..1, with a wobbly margin so the patch
      // does not end on a straight line.
      const e = Math.min(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y)) / S;
      const wob = 0.09 * (0.55 + 0.45 * Math.sin(x * 0.031) * Math.sin(y * 0.027)
        + 0.2 * Math.sin((x + y) * 0.017));
      let w = e / Math.max(0.02, wob);
      w = w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
      d[i] = (d[i] + noise) * w + sr * (1 - w);
      d[i + 1] = (d[i + 1] + noise) * w + sg * (1 - w);
      d[i + 2] = (d[i + 2] + noise) * w + sb * (1 - w);
    }
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(ck, tex);
  return tex;
}

/**
 * A seamless bed of the same stones, for surfaces that have to TILE — the bank
 * around the rim of the pit. Same painter, same palette and same size band as
 * both the pit floor and the pile, so all three read as one beach.
 *
 * Smaller canvas than the floor: the bank is a narrow strip a long way from the
 * camera's focus, and this bake happens on the main thread once per beach.
 */
export function stoneBedTexture(key, stones, sizeBand, worldW, worldH) {
  const ck = 'bed' + key;
  if (texCache.has(ck)) return texCache.get(ck);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = bedBase(stones);
  g.fillRect(0, 0, S, S);
  paintStoneBed(g, S, { stones, sizeBand, worldW, worldH, wrap: true, density: 2.2 });

  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 22;
    d[i] += noise; d[i + 1] += noise; d[i + 2] += noise;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(ck, tex);
  return tex;
}

/** Blue-and-white style pattern for the ceramic shards of a beach. */
export function ceramicTexture(baseHex, accentHex) {
  const key = 'cer' + baseHex + '_' + accentHex;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(baseHex).getHexString();
  g.fillRect(0, 0, 128, 128);
  const acc = '#' + new THREE.Color(accentHex).getHexString();
  g.strokeStyle = acc;
  g.fillStyle = acc;
  g.lineWidth = 4;
  g.globalAlpha = 0.9;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(64, 64, 20 + i * 18, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.ellipse(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44, 9, 4, a, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** Soft radial sprite used for glints, radar markers and foam. */
export function glowTexture() {
  if (texCache.has('glow')) return texCache.get('glow');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.22, 'rgba(255,255,255,0.7)');
  rg.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  texCache.set('glow', tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry factories. Pebbles/shards are lumpy low-poly blobs — cheap, and the
// jitter is what stops 170 instances of the same rock looking like 170 clones.
// ---------------------------------------------------------------------------
function jitter(geo, amount, scaleY, scaleZ, seed) {
  const pos = geo.attributes.position;
  let s = seed || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Merge duplicate vertices first so the jitter does not tear the surface.
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    if (!map.has(k)) map.set(k, 1 + (rnd() - 0.5) * amount * 2);
    const f = map.get(k);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * scaleY, pos.getZ(i) * f * scaleZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Rescale so the geometry's half-extents are exactly 1 on every axis. */
function normalizeExtents(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const sx = 1 / Math.max(1e-4, Math.max(-b.min.x, b.max.x));
  const sy = 1 / Math.max(1e-4, Math.max(-b.min.y, b.max.y));
  const sz = 1 / Math.max(1e-4, Math.max(-b.min.z, b.max.z));
  geo.scale(sx, sy, sz);
  geo.computeBoundingSphere();
  return geo;
}

/** A rounded, slightly flattened stone whose half-extents are 1. */
export function pebbleGeometry(variant) {
  // A SPHERE, not an icosahedron. IcosahedronGeometry is non-indexed, so three
  // can only flat-shade it and every stone came out as a faceted ice crystal.
  // A UV sphere is indexed, so computeVertexNormals gives smooth normals and the
  // jitter reads as a tumbled, waterworn lump instead of a gem.
  // NB the flattening is applied by VARIANT_SCALE in pebbles.js, not here —
  // normalizeExtents deliberately squares the geometry up to half-extents of 1
  // so the collider radius and the visual size stay in step.
  const seg = variant === 2 ? [15, 10] : [13, 9];
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  return normalizeExtents(jitter(g, variant === 2 ? 0.1 : 0.15, 1, 0.92, 7 + variant * 913));
}

/** A tumbled shard of sea glass: flat, softly faceted, half-extents of 1. */
export function shardGeometry(seed) {
  const g = new THREE.DodecahedronGeometry(1, 0);
  return normalizeExtents(jitter(g, 0.24, 0.4, 0.78, 31 + seed * 577));
}

/** A ceramic shard: an irregular extruded polygon so the break edges read. */
export function ceramicShardGeometry(seed) {
  let s = seed * 7919 + 13;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pts = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const r = 0.6 + rnd() * 0.5;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.85));
  }
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return normalizeExtents(geo);
}

/** The reconstructed ceramic item for a beach, roughly 1 unit tall. */
export function ceramicItemGeometry(kind) {
  if (kind === 'plate') {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.06 + t * 0.94, Math.pow(t, 2.4) * 0.34));
    }
    return new THREE.LatheGeometry(pts, 28);
  }
  if (kind === 'tile') {
    const g = new THREE.BoxGeometry(1.3, 0.11, 1.3, 1, 1, 1);
    return g;
  }
  if (kind === 'pot') {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(0.34 + t * 0.42 - Math.pow(t, 3) * 0.06, t * 0.95));
    }
    pts.push(new THREE.Vector2(0.80, 1.0));
    pts.push(new THREE.Vector2(0.72, 1.0));
    return new THREE.LatheGeometry(pts, 26);
  }
  if (kind === 'jug') {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = 0.28 + Math.sin(t * Math.PI * 0.86) * 0.42;
      pts.push(new THREE.Vector2(Math.max(0.14, r), t * 1.15));
    }
    return new THREE.LatheGeometry(pts, 26);
  }
  if (kind === 'bowl') {
    // Wide and shallow with a rolled rim — reads differently from the plate at a
    // glance, which matters when six of these sit on one shelf.
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(0.2 + t * 0.72, Math.pow(t, 1.5) * 0.52));
    }
    pts.push(new THREE.Vector2(1.0, 0.56));
    pts.push(new THREE.Vector2(0.9, 0.5));
    return new THREE.LatheGeometry(pts, 26);
  }
  // vase
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const r = 0.2 + Math.sin(t * Math.PI * 0.95) * 0.36 + (t > 0.85 ? (t - 0.85) * 1.1 : 0);
    pts.push(new THREE.Vector2(Math.max(0.12, r), t * 1.25));
  }
  return new THREE.LatheGeometry(pts, 26);
}

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

/**
 * Frosted sea glass. MeshPhysicalMaterial `transmission` would look glorious but
 * costs a whole extra scene render per frame — on a tablet that is the
 * difference between 55fps and 25fps. Instead: translucent MeshStandardMaterial
 * with a high envMapIntensity + mid roughness, which reads as frosted glass
 * because the env map supplies the soft sheen.
 */
export function glassMaterial(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.42,
    metalness: 0.0,
    transparent: true,
    opacity: 0.76,
    envMapIntensity: 1.9,
    emissive: hex,
    emissiveIntensity: 0.06,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

export function ceramicMaterial(baseHex, accentHex) {
  return new THREE.MeshStandardMaterial({
    map: ceramicTexture(baseHex, accentHex),
    roughness: 0.34,
    metalness: 0.0,
    envMapIntensity: 1.15,
  });
}

export function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
