// Emberreach world definition, shared by the 3D scene and the Atlas painter.
// u,v in [-1,1] (u east, v south). World is 28.8 x 15 km: x = u*14400, z = v*7500.
export const WORLD = { W: 28800, D: 15000, AX: 1.92 };
export const toWorld = (u, v) => [u * WORLD.W / 2, v * WORLD.D / 2];
export const toUV = (x, z) => [x / (WORLD.W / 2), z / (WORLD.D / 2)];

const P = new Uint8Array(512);
(() => { let s = 1337; const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255]; })();
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
export function perlin(x, y) {
  const X = Math.floor(x), Y = Math.floor(y), xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
  const u = fade(xf), v = fade(yf);
  const aa = P[P[xi] + yi], ab = P[P[xi] + yi + 1], ba = P[P[xi + 1] + yi], bb = P[P[xi + 1] + yi + 1];
  const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
  const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
  return (x1 + v * (x2 - x1)) * 0.7;
}
export function fbm(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * perlin(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export function ridged(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { const r = 1 - Math.abs(perlin(x * f, y * f)); s += a * r * r; n += a; a *= 0.5; f *= 2.07; } return s / n; }
export const hash2 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const REGIONS = [
  { id: 'hearthvale', name: 'Hearthvale', u: 0, v: 0.12, s: 0.44 },
  { id: 'frostfang', name: 'Frostfang Heights', u: -0.66, v: -0.52, s: 0.42 },
  { id: 'stormcrown', name: 'Stormcrown', u: 0.66, v: -0.52, s: 0.42 },
  { id: 'cinder', name: 'Cinder Peaks', u: -0.66, v: 0.58, s: 0.42 },
  { id: 'reach', name: 'Sunken Reach', u: 0.68, v: 0.62, s: 0.42 }
];
export const SKY_ISLES = { u: 0, v: -0.66, alt: 2300, name: 'Sky Isles' };
// [x offset (×1.6), z offset, radius, height offset] from the Sky Isles centre
export const SKY_ISLE_LIST = [[0, 0, 260, 0], [900, 300, 140, 120], [-850, 260, 170, -90], [420, -560, 120, 200], [-520, -520, 130, 60], [1400, -220, 100, 260], [-1500, -100, 110, 160], [0, 700, 90, -40]];
const isleUV = (i, dx = 0, dz = 0) => { const p = SKY_ISLE_LIST[i]; return [SKY_ISLES.u + (p[0] * 1.6 + dx) / 14400, SKY_ISLES.v + (p[1] + dz) / 7500]; };

export function weights(u, v) {
  const wu = u + 0.09 * perlin(u * 3.1 + 7, v * 3.1), wv = v + 0.09 * perlin(u * 3.1, v * 3.1 + 11);
  const w = REGIONS.map(r => { const du = (wu - r.u) * WORLD.AX, dv = wv - r.v; return Math.exp(-(du * du + dv * dv) / (r.s * r.s)); });
  const t = w.reduce((a, b) => a + b, 1e-6);
  return w.map(x => x / t);
}

// Hearthvale, hand placed
export const AERIE = { u: -0.04, v: 0.0 };
export const LAKE = { u: 0.1, v: 0.18, r: 0.045, isle: 0.011 };
export const RIVER = [[0.1, 0.18], [0.115, 0.26], [0.13, 0.33], [0.125, 0.4], [0.1, 0.47], [0.075, 0.54], [0.06, 0.6], [0.05, 0.7]];
const VOLCANO = { u: -0.66, v: 0.58 };
const BUMPS = [
  { u: 0.17, v: -0.12, a: 150, s: 0.035 },
  { u: -0.04, v: 0.0, a: 160, s: 0.03 },
  { u: 0.13, v: 0.37, a: 210, s: 0.05 },
  { u: 0.3, v: 0.12, a: 120, s: 0.08 },
  { u: 0.12, v: 0.66, a: 120, s: 0.03 },
  { u: -0.32, v: 0.36, a: 160, s: 0.04 }
];
function distPoly(u, v, pts) {
  let best = 1e9; const x = u * WORLD.AX;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0] * WORLD.AX, ay = pts[i][1], bx = pts[i + 1][0] * WORLD.AX, by = pts[i + 1][1];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
    const ex = x - (ax + dx * t), ey = v - (ay + dy * t), d = Math.sqrt(ex * ex + ey * ey);
    if (d < best) best = d;
  }
  return best;
}
const dist = (u, v, p) => { const du = (u - p.u) * WORLD.AX, dv = v - p.v; return Math.sqrt(du * du + dv * dv); };

export function landMask(u, v, w) {
  const x = u * WORLD.AX + 5.3; v = v + 2.9;
  const vv = v - 2.9;
  let c = 1 - Math.pow(u * u / 1.04 + vv * vv / 1.0, 1.25) + 0.3 * fbm(x * 1.3 + 3, v * 1.3 - 1, 4) + 0.04 * fbm(x * 9, v * 9, 2);
  c -= 0.95 * w[4];
  c -= 1.1 * Math.exp(-(((u - 0.03) ** 2) * 16) - ((vv - 0.84) ** 2) * 16);
  return sstep(0.02, 0.06, c);
}

const RH = [
  (x, y) => 25 + 260 * Math.pow(0.5 + 0.5 * fbm(x * 4.5, y * 4.5, 5), 1.6) + 60 * ridged(x * 9 + 3, y * 9, 3) + 18 * fbm(x * 24, y * 24, 2),
  (x, y) => 260 + 2000 * Math.pow(ridged(x * 3.6 + 10, y * 3.6, 6), 1.6),
  (x, y) => 560 + 70 * fbm(x * 7, y * 7, 4) + 240 * Math.max(0, ridged(x * 5 + 4, y * 5 - 2, 4) - 0.6),
  (x, y) => 150 + 640 * ridged(x * 4.4 - 7, y * 4.4 + 3, 5),
  (x, y) => -45 + 320 * Math.max(0, fbm(x * 5.5 + 5, y * 5.5, 5) + 0.05)
];

export const lavaChannel = (u, v) => Math.abs(fbm(u * WORLD.AX * 9 + 2.3, v * 9 - 6.7, 3)) < 0.045;
// Every settlement sits on a flat pad (an island if it would be under the sea), so houses always have ground.
let PADS = null, padBusy = false, READY = false;
function pads() {
  if (PADS || padBusy || !READY) return PADS; padBusy = true;
  PADS = PLACES.filter(p => ['city', 'town', 'village', 'hamlet'].includes(p.kind) && !p.alt).map(p => {
    const R = (70 + (p.size || 0.15) * 340) * 1.15; let t = baseHeight(p.u, p.v);
    return { x: p.u * WORLD.W / 2, z: p.v * WORLD.D / 2, R, t: Math.max(p.port ? 9 : 14, t) };
  });
  padBusy = false; return PADS;
}
export function height(u, v) {
  let h = baseHeight(u, v); const P = pads(); if (!P) return h;
  const x = u * WORLD.W / 2, z = v * WORLD.D / 2;
  for (const p of P) { const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz, R2 = p.R * 1.3; if (d2 > R2 * R2) continue; const k = 1 - sstep(p.R * 0.75, R2, Math.sqrt(d2)); h = lerp(h, h > p.t ? p.t + (h - p.t) * 0.15 : p.t, k); }
  return h;
}
function baseHeight(u, v) {
  const w = weights(u, v), x = u * WORLD.AX + 13.37, y = v + 7.71;
  let h = 0;
  for (let i = 0; i < 5; i++) if (w[i] > 0.002) h += w[i] * RH[i](x, y);
  if (w[3] > 0.05) {
    const dvol = dist(u, v, VOLCANO);
    h += w[3] * (1700 * Math.pow(Math.max(0, 1 - dvol / 0.2), 1.7) - 430 * Math.exp(-((dvol / 0.025) ** 2)));
    if (dvol > 0.05 && lavaChannel(u, v)) h -= 90 * w[3];
  }
  if (w[0] > 0.05) {
    for (const b of BUMPS) { const d = dist(u, v, b); if (d < b.s * 3) h += w[0] * b.a * Math.exp(-((d / b.s) ** 2)) * (0.8 + 0.4 * ridged(x * 30, y * 30, 2)); }
    h += w[0] * 170 * Math.exp(-(((u - 0.29) * WORLD.AX / 0.12) ** 2) - (((v - 0.08) / 0.045) ** 2));
  }
  const lm = landMask(u, v, w);
  h = lerp(-60 + 15 * fbm(x * 3, y * 3, 2), h, lm);
  if (w[4] > 0.15) h = Math.max(h, w[4] * (360 * Math.max(0, fbm(x * 6 + 5, y * 6, 5) - 0.04) - 45));
  if (lm > 0.2) {
    const dr = distPoly(u, v, RIVER), gorge = Math.exp(-((dist(u, v, { u: 0.13, v: 0.37 }) / 0.06) ** 2));
    h = lerp(Math.min(h, 10 + 30 * gorge), h, sstep(0.006, 0.075 - 0.055 * gorge, dr));
    h = lerp(Math.min(h, -6), h, sstep(0.004, 0.011, dr));
    const dl = dist(u, v, LAKE);
    h = lerp(-14, h, sstep(LAKE.r * 0.7, LAKE.r, dl));
    if (dl < LAKE.isle) h = Math.max(h, 22 * (1 - (dl / LAKE.isle) ** 2));
  }
  return h;
}

export function forestAt(u, v, w = weights(u, v)) {
  const x = u * WORLD.AX + 3.3, y = v + 1.7, tw = dist(u, v, { u: -0.27, v: -0.1 });
  return (w[0] + w[1] * 0.8) * Math.min(1, 0.5 + 0.5 * fbm(x * 7, y * 7, 3) + 0.4 * Math.exp(-((tw / 0.11) ** 2)) - 0.25 * Math.exp(-((dist(u, v, { u: -0.2, v: 0.14 }) / 0.09) ** 2)));
}
export function lavaAt(u, v, w = weights(u, v)) { return w[3]; }

const C = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const FIELDS = [0xd2c264, 0xa3c65a, 0x80aa4c, 0xbfb45a, 0xb8d06a, 0x90b552, 0xdccf7c, 0x9cb85c].map(C);
const K = { grass: C(0x7aa64a), grass2: C(0xa0c25c), hedge: C(0x55793a), forest: C(0x4b7334), sand: C(0xe8d69c), rock: C(0x9a8c72), chalk: C(0xe9e4d2),
  tundra: C(0x8f9f7a), frock: C(0x7a8290), snow: C(0xf2f5fa), slate: C(0x5a5968), moss: C(0x627152), srock: C(0x46444f),
  basalt: C(0x4a3b35), ash: C(0x6e6157), ember: C(0x9a4420), rsand: C(0xeedca2), rgrass: C(0x86b85a),
  shallow: C(0x7fd6c8), deep: C(0x2f6f8a), seabed: C(0xd6c79a) };

export function colorAt(u, v, h, slope, w = weights(u, v)) {
  const x = u * WORLD.AX + 13.37, y = v + 7.71, n = 0.5 + 0.5 * fbm(x * 14, y * 14, 2);
  if (h < 0) {
    const t = Math.min(1, -h / 55), sh = mixc(K.seabed, K.shallow, Math.min(1, w[4] * 1.6 + 0.25));
    return mixc(sh, K.deep, t);
  }
  const out = [0, 0, 0];
  const add = (c, k) => { out[0] += c[0] * k; out[1] += c[1] * k; out[2] += c[2] * k; };
  if (w[0] > 0.01) {
    let c = mixc(K.grass, K.grass2, n);
    if (h < 170 && fbm(x * 5 + 20, y * 5, 3) > -0.05) {
      const a = x * 0.94 - y * 0.34, b = x * 0.34 + y * 0.94, fa = a * 62, fb = b * 44;
      const ci = Math.floor(fa), cj = Math.floor(fb);
      c = (fa - ci < 0.07 || fb - cj < 0.07) ? K.hedge : FIELDS[Math.floor(hash2(ci, cj) * FIELDS.length)];
    }
    if (forestAt(u, v, w) > 0.56 * (w[0] + w[1] * 0.8)) c = K.forest;
    if (slope > 0.5) c = mixc(c, u > 0.2 && v < 0.25 ? K.chalk : K.rock, Math.min(1, (slope - 0.5) * 2.5));
    add(c, w[0]);
  }
  if (w[1] > 0.01) {
    let c = h > 900 + 200 * fbm(x * 12, y * 12, 2) ? K.snow : mixc(K.tundra, K.frock, Math.min(1, h / 900));
    if (slope > 0.75 && h < 1600) c = mixc(c, K.frock, 0.7);
    add(c, w[1]);
  }
  if (w[2] > 0.01) { add(slope > 0.45 ? K.srock : mixc(K.slate, K.moss, n), w[2]); }
  if (w[3] > 0.01) {
    let c = mixc(K.basalt, K.ash, Math.min(1, h / 1100) * n);
    if (h < 210) c = mixc(K.ember, c, Math.max(0, (h - 110) / 100));
    add(c, w[3]);
  }
  if (w[4] > 0.01) { add(h < 10 ? K.rsand : mixc(K.rgrass, K.rock, Math.min(1, slope * 1.6)), w[4]); }
  const t = w.reduce((a, b) => a + b, 0) || 1;
  let c = [out[0] / t, out[1] / t, out[2] / t];
  if (h < 6 && w[3] < 0.5) c = mixc(K.sand, c, h / 6);
  return c;
}

// Hearthvale sub-areas and places. kind: city town village hamlet roost vista tower nest camp ring chest statue favour landmark secret
export const SUBAREAS = [
  { id: 'crags', name: 'Aerie Crags', u: -0.04, v: -0.05 },
  { id: 'kingsholm', name: 'Kingsholm', u: 0.17, v: -0.18 },
  { id: 'patchwork', name: 'The Patchwork', u: -0.2, v: 0.2 },
  { id: 'wend', name: 'River Wend', u: 0.17, v: 0.46 },
  { id: 'mirrormere', name: 'Mirrormere', u: 0.06, v: 0.14 },
  { id: 'thornwood', name: 'Thornwood', u: -0.3, v: -0.16 },
  { id: 'downs', name: 'Sleeping Dragon Downs', u: 0.32, v: 0.02 },
  { id: 'gullcliff', name: 'Gullcliff Coast', u: -0.06, v: 0.62 },
  { id: 'embergate', name: 'The Ember Gate', u: -0.34, v: 0.43 }
];
const PL = (id, name, kind, u, v, x = {}) => ({ id, name, kind, u, v, r: 'hearthvale', ...x });
export const PLACES = [
  PL('aerie', 'The Aerie', 'home', AERIE.u, AERIE.v),
  PL('kingsholm', 'Kingsholm', 'city', 0.17, -0.12, { size: 1 }),
  PL('millbrook', 'Millbrook', 'town', -0.2, 0.14, { size: 0.55 }),
  PL('gullhaven', 'Gullhaven', 'town', 0.055, 0.6, { size: 0.45, port: true }),
  PL('thornby', 'Thornby', 'village', -0.27, -0.03, { size: 0.3 }),
  PL('ashford', 'Ashford', 'hamlet', -0.08, 0.3, { size: 0.15 }),
  PL('brindle', 'Brindle', 'hamlet', 0.27, -0.03, { size: 0.15 }),
  PL('copsey', 'Copsey', 'hamlet', -0.14, -0.22, { size: 0.15 }),
  PL('dunmere', 'Dunmere', 'hamlet', 0.23, 0.27, { size: 0.15 }),
  PL('roost_mill', 'Millbrook Roost', 'roost', -0.17, 0.1, { lit: true }),
  PL('roost_kings', 'Kingsholm Roost', 'roost', 0.13, -0.08, { lit: true }),
  PL('roost_gull', 'Gullhaven Roost', 'roost', 0.1, 0.58),
  PL('roost_thorn', 'Thornby Roost', 'roost', -0.25, -0.07),
  PL('roost_downs', 'Downs Roost', 'roost', 0.34, 0.16),
  PL('tower_castle', 'Castle Isle', 'tower', LAKE.u, LAKE.v, { lit: true }),
  PL('tower_bridge', 'Old Kingsbridge', 'tower', 0.135, 0.355, { lit: true }),
  PL('tower_stack', 'Gullcliff Stack', 'tower', -0.03, 0.71),
  PL('nest', 'The Egg Nest', 'nest', 0.31, 0.08),
  PL('camp_dock', 'Pirate Airship Dock', 'camp', -0.13, 0.66),
  PL('camp_yard', 'Thornwood Balloon Yard', 'camp', -0.33, -0.2),
  PL('camp_griffin', 'Griffin Roost', 'camp', 0.38, 0.22),
  PL('ring_gorge', 'Wend Gorge Run', 'ring', 0.13, 0.39),
  PL('ring_roofs', 'Kingsholm Rooftop Run', 'ring', 0.2, -0.15),
  PL('vista_oak', 'Elderheart Oak', 'vista', -0.28, -0.1),
  PL('vista_head', "Dragon's Head", 'vista', 0.25, 0.07),
  PL('vista_bell', 'Bell Tower', 'vista', 0.183, -0.095),
  PL('vista_falls', 'Wend Falls Crag', 'vista', 0.165, 0.41),
  PL('vista_head2', 'Gullcliff Head', 'vista', 0.13, 0.66),
  PL('fav_sheep', 'Shepherd Wren', 'favour', -0.2, 0.14, { quest: 'Chase the pirates off my sheep!', at: 'Millbrook' }),
  PL('fav_lantern', 'Old Tamsin', 'favour', 0.055, 0.6, { quest: 'Carry this lantern to the Gullcliff light.', at: 'Gullhaven' }),
  PL('fav_balloon', 'Pip', 'favour', -0.27, -0.03, { quest: 'My balloon blew away over Thornwood!', at: 'Thornby' }),
  PL('fav_bonfire', 'Captain Merrow', 'favour', 0.17, -0.12, { quest: 'Light the Midsummer bonfire on the Downs.', at: 'Kingsholm' }),
  PL('sleeping', 'The Sleeping Dragon', 'landmark', 0.29, 0.08),
  PL('chalk', 'Chalk Dragon', 'landmark', 0.22, 0.16),
  PL('stones', 'Ninestones', 'landmark', 0.36, 0.02),
  PL('falls', 'Wend Falls', 'landmark', 0.15, 0.42),
  PL('lighthouse_g', 'Gullcliff Light', 'landmark', 0.16, 0.69),
  PL('embergate', 'The Ember Gate', 'landmark', -0.32, 0.38),
  PL('caves', "Smugglers' Caves", 'secret', -0.07, 0.68),
  ...[[-0.36, -0.04], [-0.1, 0.42], [0.2, 0.02], [0.03, -0.18], [0.29, 0.34], [-0.22, 0.44], [0.08, 0.3], [0.38, -0.08]].map((p, i) => PL('statue' + i, 'Dragon statue', 'statue', p[0], p[1])),
  ...[[-0.3, -0.13], [0.1, 0.18], [0.14, 0.42], [-0.07, 0.68], [0.158, -0.15], [0.25, 0.16], [-0.18, 0.05], [0.33, 0.1], [-0.02, 0.48], [0.05, -0.02], [-0.34, 0.24], [0.21, 0.37]].map((p, i) => PL('chest' + i, 'Hidden chest', 'chest', p[0], p[1]))
];

// Other regions, using the same template. Key places are hand placed; statues, chests and vistas are scattered on valid land with a fixed seed.
const RIDX = { hearthvale: 0, frostfang: 1, stormcrown: 2, cinder: 3, reach: 4 };
function scatter(r, kind, name, n, seed, box) {
  const out = []; let s = seed;
  const rn = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let a = 0; a < 4000 && out.length < n; a++) {
    const u = box[0] + rn() * (box[1] - box[0]), v = box[2] + rn() * (box[3] - box[2]);
    if (Math.abs(u) > 0.95 || Math.abs(v) > 0.95) continue;
    const wt = weights(u, v)[RIDX[r]], h = height(u, v);
    if (wt < 0.6 || h < 8) continue;
    if (out.some(o => Math.hypot((o.u - u) * WORLD.AX, o.v - v) < 0.05)) continue;
    out.push({ id: r + '_' + kind + out.length, name, kind, u, v, r });
  }
  return out;
}
const R = (r, id, name, kind, u, v, x = {}) => ({ id: r + '_' + id, name, kind, u, v, r, ...x });
const BOX = { cinder: [-0.95, -0.36, 0.3, 0.92], frostfang: [-0.95, -0.36, -0.9, -0.22], stormcrown: [0.36, 0.95, -0.9, -0.22], reach: [0.38, 0.95, 0.32, 0.92] };
const REGION_PLACES = [
  R('cinder', 'city', 'Anvilhold', 'city', -0.48, 0.46, { size: 0.8, style: 'forge' }),
  R('cinder', 'town1', 'Cinderwick', 'town', -0.8, 0.38, { size: 0.45 }), R('cinder', 'town2', 'Slagport', 'town', -0.52, 0.8, { size: 0.4, port: true }),
  R('cinder', 'ham1', 'Ember Hollow', 'hamlet', -0.84, 0.7, { size: 0.15 }), R('cinder', 'ham2', 'Coalbank', 'hamlet', -0.6, 0.36, { size: 0.15 }),
  R('cinder', 'tower1', 'Furnace Crater', 'tower', -0.645, 0.565), R('cinder', 'tower2', 'Behind the Lava Falls', 'tower', -0.8, 0.5), R('cinder', 'tower3', 'Geyser Pillar', 'tower', -0.5, 0.66),
  R('cinder', 'nest', 'The Egg Nest', 'nest', -0.74, 0.76), R('cinder', 'champion', 'The Iron Drake', 'champion', -0.74, 0.76),
  R('cinder', 'camp1', 'Wyvern Roost', 'camp', -0.88, 0.56, { camp: 'wyvern' }), R('cinder', 'camp2', 'Ash Balloon Dock', 'camp', -0.44, 0.76, { camp: 'dock' }), R('cinder', 'camp3', 'Raider Forge', 'camp', -0.58, 0.42, { camp: 'yard' }),
  R('cinder', 'ring1', 'Lava Channel Run', 'ring', -0.7, 0.66), R('cinder', 'ring2', 'Furnace Spiral', 'ring', -0.62, 0.52),
  R('cinder', 'fav1', 'Smith Brogan', 'favour', -0.48, 0.46, { quest: 'Bring back my hammer from the Wyvern Roost!', at: 'Anvilhold' }),
  R('cinder', 'fav2', 'Miner Ottie', 'favour', -0.8, 0.38, { quest: 'Blast open the blocked mine with your fire.', at: 'Cinderwick' }),
  R('cinder', 'fav3', 'Harbour-mistress Vell', 'favour', -0.52, 0.8, { quest: 'Chase the balloons away from my ships.', at: 'Slagport' }),
  R('cinder', 'fav4', 'Old Ashka', 'favour', -0.84, 0.7, { quest: 'Find my goats on the Bone Field.', at: 'Ember Hollow' }),
  R('cinder', 'roost1', 'Anvilhold Roost', 'roost', -0.46, 0.43), R('cinder', 'roost2', 'Cinderwick Roost', 'roost', -0.78, 0.35), R('cinder', 'roost3', 'Slagport Roost', 'roost', -0.54, 0.77), R('cinder', 'roost4', 'Bone Field Roost', 'roost', -0.42, 0.72), R('cinder', 'roost5', 'Ember Hollow Roost', 'roost', -0.86, 0.66),

  R('frostfang', 'city', 'Rimehold', 'city', -0.72, -0.62, { size: 0.8, style: 'ice' }),
  R('frostfang', 'town1', 'Frostmere', 'town', -0.5, -0.4, { size: 0.45 }), R('frostfang', 'town2', 'Icebarrow', 'town', -0.86, -0.42, { size: 0.4, port: true }),
  R('frostfang', 'ham1', 'Mammoth Camp', 'hamlet', -0.46, -0.28, { size: 0.15 }), R('frostfang', 'ham2', 'Pinewatch', 'hamlet', -0.6, -0.72, { size: 0.15 }),
  R('frostfang', 'tower1', 'Crystal Caves', 'tower', -0.84, -0.34), R('frostfang', 'tower2', 'Highpeak', 'tower', -0.62, -0.55), R('frostfang', 'tower3', 'The Ice Floe', 'tower', -0.9, -0.76),
  R('frostfang', 'nest', 'The Egg Nest', 'nest', -0.56, -0.68), R('frostfang', 'champion', 'The Frost Wyrm', 'champion', -0.56, -0.68),
  R('frostfang', 'camp1', 'Griffin Eyrie', 'camp', -0.7, -0.4, { camp: 'griffin' }), R('frostfang', 'camp2', 'Ice Spirit Shrine', 'camp', -0.5, -0.58, { camp: 'shrine' }), R('frostfang', 'camp3', 'Winter Dock', 'camp', -0.82, -0.8, { camp: 'dock' }),
  R('frostfang', 'ring1', 'Frozen Falls Run', 'ring', -0.48, -0.44), R('frostfang', 'ring2', 'Glacier Canyon', 'ring', -0.7, -0.5),
  R('frostfang', 'fav1', 'Queen Isolde', 'favour', -0.72, -0.62, { quest: 'The palace lanterns have gone out. Relight them!', at: 'Rimehold' }),
  R('frostfang', 'fav2', 'Fisher Tor', 'favour', -0.86, -0.42, { quest: 'My boat is frozen in. Melt the ice!', at: 'Icebarrow' }),
  R('frostfang', 'fav3', 'Herder Nanuk', 'favour', -0.46, -0.28, { quest: 'A baby mammoth wandered off. Find it!', at: 'Mammoth Camp' }),
  R('frostfang', 'fav4', 'Skater Lily', 'favour', -0.5, -0.4, { quest: 'Race me down the Frozen Falls!', at: 'Frostmere' }),
  R('frostfang', 'roost1', 'Rimehold Roost', 'roost', -0.7, -0.59), R('frostfang', 'roost2', 'Frostmere Roost', 'roost', -0.52, -0.37), R('frostfang', 'roost3', 'Icebarrow Roost', 'roost', -0.84, -0.45), R('frostfang', 'roost4', 'Mammoth Roost', 'roost', -0.44, -0.25), R('frostfang', 'roost5', 'Pinewatch Roost', 'roost', -0.62, -0.75),

  R('stormcrown', 'city', 'Stormhaven', 'city', 0.56, -0.68, { size: 0.75, style: 'slate' }),
  R('stormcrown', 'town1', 'Rodmark', 'town', 0.76, -0.54, { size: 0.4 }), R('stormcrown', 'town2', 'Ravencliff', 'town', 0.46, -0.38, { size: 0.4 }),
  R('stormcrown', 'ham1', 'Gloomby', 'hamlet', 0.86, -0.4, { size: 0.15 }), R('stormcrown', 'ham2', 'Highfold', 'hamlet', 0.62, -0.32, { size: 0.15 }),
  R('stormcrown', 'tower1', 'The Floating Rocks', 'tower', 0.6, -0.46, { float: 130 }), R('stormcrown', 'tower2', 'Spire Top', 'tower', 0.78, -0.64, { float: 1320 }), R('stormcrown', 'tower3', 'Inside the Eye', 'tower', 0.54, -0.72),
  R('stormcrown', 'nest', 'The Egg Nest', 'nest', 0.7, -0.78), R('stormcrown', 'champion', 'The Storm Titan', 'champion', 0.7, -0.78),
  R('stormcrown', 'camp1', 'Harpy Nests', 'camp', 0.86, -0.7, { camp: 'harpy' }), R('stormcrown', 'camp2', 'Storm-ship Mooring', 'camp', 0.48, -0.56, { camp: 'dock' }), R('stormcrown', 'camp3', 'Harpy Cliff', 'camp', 0.68, -0.42, { camp: 'harpy' }),
  R('stormcrown', 'ring1', 'Floating Rocks Run', 'ring', 0.58, -0.5), R('stormcrown', 'ring2', 'Thunder Gorge', 'ring', 0.74, -0.46),
  R('stormcrown', 'fav1', 'Weather-witch Marn', 'favour', 0.56, -0.68, { quest: 'Catch three sparks from the Lightning Rod!', at: 'Stormhaven' }),
  R('stormcrown', 'fav2', 'Keeper Bolt', 'favour', 0.76, -0.54, { quest: 'Harpies stole the rod-keeper\'s bell.', at: 'Rodmark' }),
  R('stormcrown', 'fav3', 'Courier Pell', 'favour', 0.46, -0.38, { quest: 'Deliver this letter through the storm.', at: 'Ravencliff' }),
  R('stormcrown', 'fav4', 'Dot and Dash', 'favour', 0.86, -0.4, { quest: 'Our kite is stuck on a floating rock!', at: 'Gloomby' }),
  R('stormcrown', 'roost1', 'Stormhaven Roost', 'roost', 0.58, -0.65), R('stormcrown', 'roost2', 'Rodmark Roost', 'roost', 0.74, -0.51), R('stormcrown', 'roost3', 'Ravencliff Roost', 'roost', 0.44, -0.35), R('stormcrown', 'roost4', 'Gloomby Roost', 'roost', 0.84, -0.37), R('stormcrown', 'roost5', 'Highfold Roost', 'roost', 0.64, -0.29),

  R('reach', 'city', 'Coralport', 'city', 0.58, 0.5, { size: 0.75, style: 'coral', port: true }),
  R('reach', 'town1', 'Saltmarsh', 'town', 0.46, 0.62, { size: 0.4, port: true }), R('reach', 'town2', 'Driftwood', 'town', 0.8, 0.36, { size: 0.4, port: true }),
  R('reach', 'ham1', 'Pearlbay', 'hamlet', 0.74, 0.74, { size: 0.15 }), R('reach', 'ham2', 'Gull Rock', 'hamlet', 0.9, 0.6, { size: 0.15 }),
  R('reach', 'tower1', 'Lighthouse Point', 'tower', 0.52, 0.72), R('reach', 'tower2', 'The Sunken Spire', 'tower', 0.72, 0.64, { under: true, water: true }), R('reach', 'tower3', 'Top of the Arch', 'tower', 0.82, 0.48),
  R('reach', 'nest', 'The Egg Nest', 'nest', 0.86, 0.8), R('reach', 'champion', 'The Kraken', 'champion', 0.86, 0.8),
  R('reach', 'camp1', 'Pirate Anchorage', 'camp', 0.62, 0.86, { camp: 'dock' }), R('reach', 'camp2', 'Serpent Grotto', 'camp', 0.78, 0.56, { camp: 'grotto' }), R('reach', 'camp3', "Smugglers' Wreck", 'camp', 0.68, 0.84, { camp: 'yard' }),
  R('reach', 'ring1', 'Arch Run', 'ring', 0.8, 0.46), R('reach', 'ring2', 'Sea-stack Slalom', 'ring', 0.6, 0.7),
  R('reach', 'fav1', 'Admiral Pike', 'favour', 0.58, 0.5, { quest: 'Escort my ship past the Serpent Grotto.', at: 'Coralport' }),
  R('reach', 'fav2', 'Diver Mira', 'favour', 0.46, 0.62, { quest: 'My grandad’s old bell sank to the seabed. Can you find it?', at: 'Saltmarsh' }),
  R('reach', 'fav3', 'Old Barnacle', 'favour', 0.8, 0.36, { quest: 'Light the beacon so the boats come home.', at: 'Driftwood' }),
  R('reach', 'fav4', 'Suki', 'favour', 0.74, 0.74, { quest: 'Gulls stole my pearls! Get them back!', at: 'Pearlbay' }),
  R('reach', 'roost1', 'Coralport Roost', 'roost', 0.6, 0.47), R('reach', 'roost2', 'Saltmarsh Roost', 'roost', 0.44, 0.59), R('reach', 'roost3', 'Driftwood Roost', 'roost', 0.78, 0.33), R('reach', 'roost4', 'Pearlbay Roost', 'roost', 0.72, 0.71), R('reach', 'roost5', 'Gull Rock Roost', 'roost', 0.88, 0.57),

  ...(() => { const S = (id, name, kind, isle, dx, dz, x = {}) => { const [u, v] = isleUV(isle, dx, dz); return R('sky', id, name, kind, u, v, { alt: true, isle, ...x }); };
    return [
      S('city', 'Cloud Castle', 'city', 0, 70, -15, { size: 0.3, style: 'cloud', deck: 58 }),
      S('fav1', 'The Cloud Keeper', 'favour', 0, 70, -15, { quest: 'The Sky Whales are frightened. Fly with them and guide them home.', at: 'Cloud Castle' }),
      S('roost1', 'Cloud Castle Roost', 'roost', 0, 150, 120), S('roost2', 'Far Isle Roost', 'roost', 6, 20, 10), S('roost3', 'High Isle Roost', 'roost', 5, -10, 20),
      S('firstnest', 'The First Nest', 'landmark', 4, 0, 0, { land: true }), S('vista', 'Skytop', 'vista', 3, 0, 0),
      S('chest0', 'Hidden chest', 'chest', 1, 40, -30), S('chest1', 'Hidden chest', 'chest', 2, -60, 40), S('chest2', 'Hidden chest', 'chest', 5, 30, -30), S('chest3', 'Hidden chest', 'chest', 7, 0, 20), S('chest4', 'Hidden chest', 'chest', 0, -170, -110),
      S('statue0', 'Dragon statue', 'statue', 1, -40, 30), S('statue1', 'Dragon statue', 'statue', 2, 60, -50), S('statue2', 'Dragon statue', 'statue', 6, -30, -20),
      S('ring1', 'Island Hop', 'ring', 0, 0, 260),
      R('sky', 'fortress', "Pirate King's Sky Fortress", 'champion', 0.12, -0.78, { alt: true }),
      R('sky', 'whales', 'Sky Whales', 'landmark', 0.14, -0.6, { alt: true, open: true })
    ]; })()
];
// Underwater: deep spots spread right across the Sunken Reach sea (farthest-point sampling, not just near the shore).
function deepSpot(u0, v0, minDepth = -40) { let best = null, bd = 1e9; for (let j = -24; j <= 24; j++) for (let i = -24; i <= 24; i++) { const u = u0 + i * 0.008, v = v0 + j * 0.008; if (Math.abs(u) > 0.95 || Math.abs(v) > 0.95) continue; if (height(u, v) > minDepth || weights(u, v)[4] < 0.5) continue; const d = Math.hypot((u - u0) * WORLD.AX, v - v0); if (d < bd) { bd = d; best = [u, v]; } } return best || [u0, v0]; }
const UNDER = { picked: [] };
function waterScatter(kind, name, n, seed, box) {
  let s = seed; const rn = () => (s = (s * 16807) % 2147483647) / 2147483647, cand = [];
  for (let a = 0; a < 5000 && cand.length < 700; a++) { const u = box[0] + rn() * (box[1] - box[0]), v = box[2] + rn() * (box[3] - box[2]); if (Math.abs(u) > 0.92 || Math.abs(v) > 0.92) continue; if (weights(u, v)[4] < 0.55 || height(u, v) > -18) continue;
    if (REGION_PLACES.some(p => ['city', 'town', 'hamlet', 'camp', 'roost', 'tower', 'nest'].includes(p.kind) && !p.water && Math.hypot((p.u - u) * WORLD.AX, p.v - v) < 0.08)) continue; cand.push([u, v]); }
  const out = [], dd = (a, b) => Math.hypot((a[0] - b[0]) * WORLD.AX, a[1] - b[1]);
  for (let k = 0; k < n && cand.length; k++) { let bi = 0, bv = -1; for (let i = 0; i < cand.length; i++) { const m = UNDER.picked.length ? Math.min(...UNDER.picked.map(p => dd(p, cand[i]))) : rn(); if (m > bv) { bv = m; bi = i; } } const [u, v] = cand.splice(bi, 1)[0]; UNDER.picked.push([u, v]); out.push({ id: 'reach_w' + kind + k, name, kind, u, v, r: 'reach', water: true }); }
  return out;
}
{ const t2 = REGION_PLACES.find(p => p.id === 'reach_tower2'), [tu, tv] = deepSpot(t2.u, t2.v, -42); t2.u = tu; t2.v = tv; UNDER.picked.push([tu, tv]);
  const [bu, bv] = deepSpot(0.6, 0.72, -36); REGION_PLACES.push({ id: 'reach_bell', name: 'The Lost Bell', kind: 'landmark', u: bu, v: bv, r: 'reach', water: true }); UNDER.picked.push([bu, bv]); }
['cinder', 'frostfang', 'stormcrown', 'reach'].forEach((r, i) => {
  if (r === 'reach') { REGION_PLACES.push(...scatter(r, 'statue', 'Dragon statue', 2, 1000 + i * 17, BOX[r]), ...scatter(r, 'chest', 'Hidden chest', 3, 2000 + i * 31, BOX[r]), ...waterScatter('statue', 'Sunken dragon statue', 6, 7001, BOX[r]), ...waterScatter('chest', 'Sunken chest', 9, 7013, BOX[r]), ...scatter(r, 'vista', 'Vista', 5, 3000 + i * 13, BOX[r])); return; }
  REGION_PLACES.push(...scatter(r, 'statue', 'Dragon statue', 8, 1000 + i * 17, BOX[r]), ...scatter(r, 'chest', 'Hidden chest', 12, 2000 + i * 31, BOX[r]), ...scatter(r, 'vista', 'Vista', 5, 3000 + i * 13, BOX[r]));
});
PLACES.push(...REGION_PLACES);
SUBAREAS.push(
  ...[['Mount Furnace', -0.66, 0.6], ['Forge Ruins', -0.44, 0.42], ['Lava Falls', -0.8, 0.46], ['The Bone Field', -0.44, 0.74], ['Ashlands', -0.72, 0.36], ['Obsidian Coast', -0.58, 0.86], ['Geyser Flats', -0.5, 0.62]].map(([n, u, v]) => ({ id: 'c_' + n, name: n, u, v, r: 'cinder' })),
  ...[['Glacier Palace', -0.74, -0.64], ['Mammoth Valley', -0.46, -0.32], ['Crystal Caves', -0.84, -0.36], ['Highpeak', -0.62, -0.54], ['Floe Sea', -0.88, -0.8], ['Frozen Waterfall', -0.48, -0.46], ['Aurora Fields', -0.6, -0.8]].map(([n, u, v]) => ({ id: 'f_' + n, name: n, u, v, r: 'frostfang' })),
  ...[['Shattered Plateau', 0.56, -0.44], ['Lightning Rod Spire', 0.78, -0.62], ['The Eye', 0.54, -0.7], ['Rainwall', 0.42, -0.6], ['Thunder Gorge', 0.74, -0.46], ['Cloudbreak Cliffs', 0.86, -0.74]].map(([n, u, v]) => ({ id: 's_' + n, name: n, u, v, r: 'stormcrown' })),
  ...[['Sunken Ruins', 0.72, 0.64], ['Lighthouse Point', 0.52, 0.72], ['Arch of the Sea', 0.82, 0.48], ['Shipwreck Graveyard', 0.68, 0.86], ['Coral Gardens', 0.62, 0.58], ['Kelp Isles', 0.86, 0.7]].map(([n, u, v]) => ({ id: 'r_' + n, name: n, u, v, r: 'reach' }))
);
export const REGION_BOUNDS = {
  hearthvale: { u0: -0.54, u1: 0.63, v0: -0.3, v1: 0.86 },
  cinder: { u0: -1, u1: -0.24, v0: 0.2, v1: 0.955 }, frostfang: { u0: -1, u1: -0.24, v0: -0.955, v1: -0.2 },
  stormcrown: { u0: 0.24, u1: 1, v0: -0.955, v1: -0.2 }, reach: { u0: 0.24, u1: 1, v0: 0.2, v1: 0.955 },
  sky: { u0: -0.3, u1: 0.3, v0: -0.96, v1: -0.36 }
};
// float = metres above the local ground (towers on floating rocks / the spire tip), never below it.
// Egg Nests are wide (about 40 m), so they sit on the highest ground under their rim, never half-buried on a slope.
const NEST_Y = new Map();
export function nestGround(p) { if (NEST_Y.has(p.id)) return NEST_Y.get(p.id); const [x, z] = toWorld(p.u, p.v); let mx = -1e9, mn = 1e9; for (let r = 0; r <= 44; r += 11) for (let a = 0; a < 12; a++) { const h = Math.max(height(...toUV(x + Math.cos(a * 0.524) * r, z + Math.sin(a * 0.524) * r)), 0); if (h > mx) mx = h; if (h < mn) mn = h; } const v = { top: mx, low: mn }; NEST_Y.set(p.id, v); return v; }
export const placeY = p => p.kind === 'nest' && !p.alt ? nestGround(p).top : p.isle != null ? SKY_ISLES.alt + SKY_ISLE_LIST[p.isle][3] + 3 : p.alt ? SKY_ISLES.alt + 20 : p.water ? height(p.u, p.v) : Math.max(height(p.u, p.v), 0) + (p.float || 0);

export const LANDMARKS = [
  ...PLACES,
  { id: 'seastack', name: 'Gullcliff Stack', kind: 'unknown', u: -0.03, v: 0.71, r: 'hearthvale' },
  { id: 'furnace', name: 'Mount Furnace', kind: 'landmark', ...VOLCANO, r: 'cinder' },
  { id: 'bones', name: 'The Bone Field', kind: 'landmark', u: -0.44, v: 0.76, r: 'cinder' },
  { id: 'forge', name: 'Forge Ruins', kind: 'landmark', u: -0.44, v: 0.44, r: 'cinder' },
  { id: 'palace', name: 'Glacier Palace', kind: 'landmark', u: -0.74, v: -0.6, r: 'frostfang' },
  { id: 'mammoth', name: 'Mammoth Valley', kind: 'landmark', u: -0.46, v: -0.32, r: 'frostfang' },
  { id: 'plateau', name: 'Shattered Plateau', kind: 'landmark', u: 0.54, v: -0.42, r: 'stormcrown' },
  { id: 'spire', name: 'Lightning Rod Spire', kind: 'landmark', u: 0.78, v: -0.64, r: 'stormcrown' },
  { id: 'lighthouse', name: 'Old Lighthouse Point', kind: 'landmark', u: 0.52, v: 0.72, r: 'reach' },
  { id: 'arch', name: 'Arch of the Sea', kind: 'landmark', u: 0.82, v: 0.48, r: 'reach' },
  { id: 'wrecks', name: 'Shipwreck Graveyard', kind: 'landmark', u: 0.68, v: 0.86, r: 'reach' }
];
export const place = id => LANDMARKS.find(p => p.id === id);

export const WIND = [
  [[-0.04, 0.0], [0.05, -0.08], [0.17, -0.12]],
  [[-0.04, 0.0], [-0.2, 0.12], [-0.27, -0.03]],
  [[0.17, -0.12], [0.3, -0.02], [0.32, 0.14], [0.14, 0.34]],
  [[0.14, 0.34], [0.1, 0.47], [0.055, 0.6]],
  [[0.17, -0.12], [0.1, -0.34], [0.02, -0.66]],
  [[0.32, 0.14], [0.5, 0.3], [0.62, 0.55]],
  [[-0.27, -0.03], [-0.45, -0.25], [-0.62, -0.45]]
];
READY = true;

export const CASTLE_TOWERS = [[0, 0, 26, 140], [60, 36, 15, 92], [-56, 40, 15, 100], [20, -60, 13, 80], [-30, -50, 11, 70]];
const ISLE_XZ = SKY_ISLE_LIST.map(p => { const [cx, cz] = toWorld(SKY_ISLES.u, SKY_ISLES.v); return [cx + p[0] * 1.6, cz + p[1], p[2], SKY_ISLES.alt + p[3] + 3]; });
// Returns the height of the solid top under (x,z) if you're above it, and a push-out vector if you're inside an island's rock or a tower.
export function skySolid(x, z, y) {
  if (y < SKY_ISLES.alt - 700) return null; let top = -1e9, push = null;
  ISLE_XZ.forEach(([ix, iz, r, t], i) => {
    const dx = x - ix, dz = z - iz, d = Math.hypot(dx, dz); if (d > r * 1.05 + 30) return;
    if (y >= t - 6 && d < r) top = Math.max(top, t);
    else if (y < t - 6) { const depth = t - y, rr = r * (1 - depth / (1.6 * r)); if (depth < 1.6 * r && d < rr + 6) push = [dx / (d || 1), dz / (d || 1), rr + 6 - d]; }
    if (i === 0) CASTLE_TOWERS.forEach(q => { const tx = ix + q[0], tz = iz + q[1], tr = q[2] + 4, th = t + q[3] + q[3] * 0.45, dd = Math.hypot(x - tx, z - tz); if (dd > tr + 10) return;
      if (y >= t + q[3] - 4 && dd < tr) top = Math.max(top, Math.min(y, th)); else if (y < t + q[3] && y > t - 6 && dd < tr) push = [(x - tx) / (dd || 1), (z - tz) / (dd || 1), tr - dd]; });
  });
  return { top, push };
}

// Make sure nothing you need to land on or fly to sits inside a cliff: move steep spots to the nearest gentle ground.
(() => {
  const slopeAt = (u, v) => { const [x, z] = toWorld(u, v); let mn = 1e9, mx = -1e9; for (let a = 0; a < 8; a++) { const h = height(...toUV(x + Math.cos(a * 0.785) * 16, z + Math.sin(a * 0.785) * 16)); if (h < mn) mn = h; if (h > mx) mx = h; } return mx - mn; };
  const RI = { hearthvale: 0, frostfang: 1, stormcrown: 2, cinder: 3, reach: 4 };
  PLACES.forEach(p => {
    if (p.alt || p.water || p.float || p.under || !['roost', 'tower', 'nest', 'statue', 'chest', 'vista', 'camp', 'landmark'].includes(p.kind)) return;
    const nest = p.kind === 'nest'; if (slopeAt(p.u, p.v) < 30 && (!nest || height(p.u, p.v) >= 8)) return; // Egg Nests must also be on dry land
    for (let ring = 1; ring <= (nest ? 140 : 24); ring++) { let best = null, bs = 1e9; const n = ring * 8;
      for (let k = 0; k < n; k++) { const a = k / n * 6.283, u = p.u + Math.cos(a) * ring * 0.0025 / WORLD.AX, v = p.v + Math.sin(a) * ring * 0.0025; if (Math.abs(u) > 0.95 || Math.abs(v) > 0.95 || height(u, v) < 8) continue; if (RI[p.r] != null && weights(u, v)[RI[p.r]] < (nest ? 0.3 : 0.45)) continue; const sl = slopeAt(u, v); if (sl < 22 && sl < bs) { bs = sl; best = [u, v]; } }
      if (best) { const same = PLACES.filter(q => q !== p && q.u === p.u && q.v === p.v); p.u = best[0]; p.v = best[1]; same.forEach(q => { q.u = best[0]; q.v = best[1]; }); return; } }
  });
})();
