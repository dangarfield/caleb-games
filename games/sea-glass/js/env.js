// Renderer, the generated environment map (no HDRI download), procedural
// textures and the shared geometry factories. Everything visual that both the
// beach scene and the collection scene need lives here.

import * as THREE from 'three';

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const perf = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, 1.65),
  shadows: true,
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
 * `stoneR` is the average stone radius and `worldW/H` the size of the patch, both
 * in world units, so painted stones come out the size of the real ones.
 */
export function shingleTexture(key, baseHex, sandHex, stones, stoneR, worldW, worldH) {
  const ck = 'shingle' + key;
  if (texCache.has(ck)) return texCache.get(ck);
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  g.fillStyle = '#' + base.getHexString();
  g.fillRect(0, 0, S, S);

  const pxX = Math.max(3, (stoneR / worldW) * S);
  const pxY = Math.max(3, (stoneR / worldH) * S);
  const n = Math.min(1400, Math.round(1.5 * S * S / (Math.PI * pxX * pxY)));
  const cols = stones.map((h) => new THREE.Color(h));
  const tmp = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const k = 0.78 + Math.random() * 0.62;
    const rx = pxX * k;
    const ry = pxY * k * (0.66 + Math.random() * 0.3);
    tmp.copy(cols[(Math.random() * cols.length) | 0]);
    const lift = 0.82 + Math.random() * 0.4;
    tmp.setRGB(Math.min(1, tmp.r * lift), Math.min(1, tmp.g * lift), Math.min(1, tmp.b * lift));
    g.save();
    g.translate(x, y);
    g.rotate(Math.random() * Math.PI);
    // A dark seat under the stone, the stone, then a light rim on the sunward
    // side: three ellipses is enough to read as embedded rather than painted.
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.beginPath();
    g.ellipse(rx * 0.1, ry * 0.18, rx * 1.08, ry * 1.08, 0, 0, 6.284);
    g.fill();
    g.fillStyle = '#' + tmp.getHexString();
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, 6.284);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.ellipse(-rx * 0.18, -ry * 0.26, rx * 0.58, ry * 0.48, 0, 0, 6.284);
    g.fill();
    g.restore();
  }

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
