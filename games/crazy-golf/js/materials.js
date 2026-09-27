/* materials.js — procedural PBR textures and materials for the "real crazy-golf course" look.
 * Everything is painted into canvases at load (tileable noise, blocks, planks, panels...),
 * with a normal map derived from a height field. Built once per kind and shared between
 * holes (they are flagged userData.shared so Scene3D.clear() never disposes them). */

import * as THREE from 'three';

const TEX_CACHE = new Map(), MAT_CACHE = new Map();

/* ---------- seeded helpers ---------- */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/* tileable value noise: fractal sum of wrapped lattices */
function noiseField(W, H, seed, octaves = 4, base = 8) {
  const R = rng(seed), out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = base << o, gy = Math.max(1, Math.round((base << o) * H / W));
    const lat = new Float32Array(gx * gy); for (let i = 0; i < lat.length; i++) lat[i] = R();
    for (let y = 0; y < H; y++) {
      const fy = y / H * gy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % gy;
      for (let x = 0; x < W; x++) {
        const fx = x / W * gx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % gx;
        const a = lat[y0 * gx + x0], b = lat[y0 * gx + x1], c = lat[y1 * gx + x0], d = lat[y1 * gx + x1];
        out[y * W + x] += ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/* build colour + normal (+ roughness) textures from a painter that fills colour and height arrays */
function makeSet(key, W, H, paint, { normalStrength = 2, repeat = [1, 1], rough = false } = {}) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const col = new Uint8ClampedArray(W * H * 4), hgt = new Float32Array(W * H), rgh = rough ? new Float32Array(W * H).fill(0.8) : null;
  paint({ W, H, col, hgt, rgh, set(i, r, g, b) { col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = 255; } });
  const toTex = (data, srgb) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true; return t;
  };
  const nrm = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = hgt[y * W + (x - 1 + W) % W], r = hgt[y * W + (x + 1) % W], u = hgt[((y - 1 + H) % H) * W + x], d = hgt[((y + 1) % H) * W + x];
    let nx = (l - r) * normalStrength, ny = (u - d) * normalStrength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    nrm[i * 4] = (nx * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
  }
  const set = { map: toTex(col, true), normalMap: toTex(nrm, false) };
  if (rgh) { const rd = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const v = rgh[i] * 255; rd[i * 4] = rd[i * 4 + 1] = rd[i * 4 + 2] = v; rd[i * 4 + 3] = 255; } set.roughnessMap = toTex(rd, false); }
  TEX_CACHE.set(key, set);
  return set;
}
const tint = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];

/* ---------- surfaces ---------- */
export function carpet(hex) {
  return makeSet('carpet' + hex, 256, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 11, 3, 16), R = rng(5);
    for (let i = 0; i < W * H; i++) {
      const fib = R(), k = 0.9 + n[i] * 0.16 + (fib - 0.5) * 0.14;
      const c = tint(base, k); set(i, c[0], c[1], c[2]); hgt[i] = fib * 0.6 + n[i] * 0.4;
    }
  }, { normalStrength: 1.4 });
}
export function stoneBlocks(hex, mortarHex, seed = 3) {
  return makeSet('stone' + hex + seed, 512, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), mort = hexRGB(mortarHex), n = noiseField(W, H, seed, 5, 8), R = rng(seed * 7 + 1);
    const rows = 4, rh = H / rows, tints = [];
    for (let r = 0; r < rows; r++) { let x = -R() * 60; const row = []; while (x < W) { const w = 70 + R() * 80; row.push([x, x + w, 0.82 + R() * 0.3]); x += w; } tints.push(row); }
    for (let y = 0; y < H; y++) {
      const r = Math.floor(y / rh), yy = y - r * rh, row = tints[r];
      for (let x = 0; x < W; x++) {
        const i = y * W + x; let blk = row.find(b => x >= b[0] && x < b[1]) || row[row.length - 1];
        const ex = Math.min(x - blk[0], blk[1] - x), ey = Math.min(yy, rh - yy), edge = Math.min(ex, ey);
        const mortar = edge < 3.5;
        const k = blk[2] * (0.85 + n[i] * 0.3);
        const c = mortar ? tint(mort, 0.9 + n[i] * 0.2) : tint(base, k);
        set(i, c[0], c[1], c[2]);
        hgt[i] = mortar ? 0 : Math.min(1, edge / 10) * 0.7 + n[i] * 0.3;
      }
    }
  }, { normalStrength: 3 });
}
export function bricks(hex, mortarHex) {
  return makeSet('brick' + hex, 512, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), mort = hexRGB(mortarHex), n = noiseField(W, H, 21, 5, 8), R = rng(99), bw = 64, bh = 32, tints = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, row = Math.floor(y / bh), off = (row % 2) * bw / 2, bx = Math.floor((x + off) / bw), key = row * 100 + bx;
      if (!(key in tints)) tints[key] = 0.8 + R() * 0.35;
      const ex = Math.min((x + off) % bw, bw - (x + off) % bw), ey = Math.min(y % bh, bh - y % bh), edge = Math.min(ex, ey), m = edge < 3;
      const c = m ? tint(mort, 0.9 + n[i] * 0.2) : tint(base, tints[key] * (0.88 + n[i] * 0.24));
      set(i, c[0], c[1], c[2]); hgt[i] = m ? 0 : Math.min(1, edge / 6) * 0.8 + n[i] * 0.2;
    }
  }, { normalStrength: 3 });
}
export function planks(hex, seed = 7, vertical = true) {
  return makeSet('plank' + hex + seed + vertical, 512, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, seed, 4, 8), R = rng(seed), pw = 64, tints = [];
    for (let k = 0; k < W / pw + 1; k++) tints.push(0.82 + R() * 0.3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = vertical ? x : y, v = vertical ? y : x, p = Math.floor(u / pw), pu = u % pw;
      const grain = Math.sin((v * 0.05 + n[i] * 6 + p * 3.1) * 3) * 0.5 + 0.5, gap = pu < 2 || pu > pw - 2;
      const k = tints[p] * (0.82 + grain * 0.18 + n[i] * 0.12) * (gap ? 0.45 : 1);
      const c = tint(base, k); set(i, c[0], c[1], c[2]);
      hgt[i] = gap ? 0 : 0.6 + grain * 0.2 + n[i] * 0.2;
      if (!gap && (pu === 10 || pu === pw - 11) && (v % 128 === 20 || v % 128 === 21 || v % 128 === 22)) { set(i, 60, 55, 50); hgt[i] = 1; }
    }
  }, { normalStrength: 2.2 });
}
export function metalPanels(hex) {
  return makeSet('metal' + hex, 512, 512, ({ W, H, set, hgt, rgh }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 31, 4, 16), R = rng(3), ps = 128, tints = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, key = Math.floor(x / ps) * 10 + Math.floor(y / ps);
      if (!(key in tints)) tints[key] = 0.9 + R() * 0.15;
      const ex = Math.min(x % ps, ps - x % ps), ey = Math.min(y % ps, ps - y % ps), seam = Math.min(ex, ey) < 2;
      const rx = x % ps, ry = y % ps, rivet = [10, ps - 10].some(a => [10, ps - 10].some(b => Math.hypot(rx - a, ry - b) < 3.5));
      const brushed = Math.sin(y * 1.7 + n[i] * 4) * 0.03;
      const k = seam ? 0.5 : tints[key] * (0.94 + n[i] * 0.1 + brushed) * (rivet ? 1.15 : 1);
      const c = tint(base, k); set(i, c[0], c[1], c[2]);
      hgt[i] = seam ? 0 : rivet ? 1 : 0.5; rgh[i] = seam ? 0.9 : 0.35 + n[i] * 0.25;
    }
  }, { normalStrength: 2.5, rough: true });
}
export function grass(hex) {
  return makeSet('grass' + hex, 512, 512, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 41, 5, 4), R = rng(8);
    for (let i = 0; i < W * H; i++) {
      const y = Math.floor(i / W), stripe = Math.floor(y / 128) % 2 ? 1.05 : 0.95, blade = R();
      const k = stripe * (0.8 + n[i] * 0.35) * (0.9 + blade * 0.2);
      const c = [base[0] * k * (0.95 + n[i] * 0.1), base[1] * k, base[2] * k * 0.95]; set(i, c[0], c[1], c[2]); hgt[i] = blade * 0.5 + n[i] * 0.5;
    }
  }, { normalStrength: 1.5 });
}
export function sand(hex) {
  return makeSet('sand' + hex, 512, 512, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 51, 5, 4), R = rng(2);
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = Math.floor(i / W), rip = Math.sin((x * 0.06 + y * 0.02 + n[i] * 8)) * 0.5 + 0.5, gr = R();
      const k = 0.88 + n[i] * 0.2 + rip * 0.05 + (gr - 0.5) * 0.08; const c = tint(base, k); set(i, c[0], c[1], c[2]); hgt[i] = rip * 0.5 + gr * 0.3 + n[i] * 0.2;
    }
  }, { normalStrength: 1.2 });
}
export function gravel(hex) {
  return makeSet('gravel' + hex, 256, 256, ({ W, H, set, hgt, col }) => {
    const base = hexRGB(hex), R = rng(61), n = noiseField(W, H, 61, 3, 8);
    for (let i = 0; i < W * H; i++) { const c = tint(base, 0.55 + n[i] * 0.2); set(i, c[0], c[1], c[2]); hgt[i] = 0; }
    for (let s = 0; s < 900; s++) {
      const cx = R() * W, cy = R() * H, r = 3 + R() * 6, k = 0.75 + R() * 0.5, hue = R() * 0.12 - 0.06;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy * 1.2); if (d > r) continue;
        const x = ((Math.round(cx + dx) % W) + W) % W, y = ((Math.round(cy + dy) % H) + H) % H, i = y * W + x, h = Math.sqrt(1 - d / r);
        if (h * 0.8 + 0.2 < hgt[i]) continue;
        hgt[i] = h * 0.8 + 0.2;
        col[i * 4] = base[0] * k * (1 + hue) * (0.8 + h * 0.3); col[i * 4 + 1] = base[1] * k * (0.8 + h * 0.3); col[i * 4 + 2] = base[2] * k * (1 - hue) * (0.8 + h * 0.3);
      }
    }
  }, { normalStrength: 3 });
}
export function paving(hex) {
  return makeSet('paving' + hex, 512, 512, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 71, 5, 8), R = rng(4), s = 128, tints = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, key = Math.floor(x / s) * 10 + Math.floor(y / s); if (!(key in tints)) tints[key] = 0.88 + R() * 0.2;
      const e = Math.min(x % s, s - x % s, y % s, s - y % s), j = e < 3;
      const c = tint(base, j ? 0.6 : tints[key] * (0.88 + n[i] * 0.22)); set(i, c[0], c[1], c[2]); hgt[i] = j ? 0 : Math.min(1, e / 8) * 0.7 + n[i] * 0.3;
    }
  }, { normalStrength: 2.5 });
}
export function concrete(hex, seed = 81) {
  return makeSet('conc' + hex + seed, 256, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, seed, 5, 8), R = rng(seed);
    for (let i = 0; i < W * H; i++) { const sp = R() < 0.03 ? 0.8 : 1, k = (0.88 + n[i] * 0.22) * sp; const c = tint(base, k); set(i, c[0], c[1], c[2]); hgt[i] = n[i]; }
  }, { normalStrength: 1.5 });
}
export function waterNormals() {
  return makeSet('water', 256, 256, ({ W, H, set, hgt }) => {
    const n = noiseField(W, H, 91, 4, 4);
    for (let i = 0; i < W * H; i++) { set(i, 255, 255, 255); hgt[i] = n[i]; }
  }, { normalStrength: 6 });
}
export function lavaTex() {
  return makeSet('lava', 256, 256, ({ W, H, set, hgt }) => {
    const n = noiseField(W, H, 101, 5, 4), m = noiseField(W, H, 102, 3, 8);
    for (let i = 0; i < W * H; i++) {
      const v = Math.abs(n[i] - 0.5) * 2, hot = Math.pow(1 - v, 3) * 0.8 + m[i] * 0.3;
      set(i, 90 + hot * 165, 20 + hot * 150, 10 + hot * 40); hgt[i] = 1 - hot;
    }
  }, { normalStrength: 3 });
}
export function roofTiles(hex) {
  return makeSet('roof' + hex, 256, 256, ({ W, H, set, hgt }) => {
    const base = hexRGB(hex), n = noiseField(W, H, 111, 4, 8), R = rng(12), th = 32, tw = 40, tints = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, row = Math.floor(y / th), off = (row % 2) * tw / 2, key = row * 100 + Math.floor((x + off) / tw);
      if (!(key in tints)) tints[key] = 0.8 + R() * 0.35;
      const yy = y % th, curve = Math.sin(((x + off) % tw) / tw * Math.PI);
      const shade = 0.65 + (yy / th) * 0.45;
      const c = tint(base, tints[key] * shade * (0.9 + n[i] * 0.2)); set(i, c[0], c[1], c[2]); hgt[i] = (yy / th) * 0.7 + curve * 0.3;
    }
  }, { normalStrength: 2.5 });
}
export function thatch() {
  return makeSet('thatch', 256, 256, ({ W, H, set, hgt }) => {
    const n = noiseField(W, H, 121, 4, 16), R = rng(3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, s = Math.sin(x * 0.9 + n[i] * 20) * 0.5 + 0.5, k = 0.7 + s * 0.3 + (R() - 0.5) * 0.1;
      set(i, 190 * k, 158 * k, 92 * k); hgt[i] = s;
    }
  }, { normalStrength: 2 });
}
export function dimples() {
  return makeSet('dimple', 256, 128, ({ W, H, set, hgt }) => {
    for (let i = 0; i < W * H; i++) { set(i, 255, 255, 255); hgt[i] = 1; }
    for (let y = 6; y < H; y += 12) for (let x = (y % 24 ? 6 : 0); x < W; x += 12)
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const d = Math.hypot(dx, dy); if (d > 5) continue; const xx = (x + dx + W) % W, yy = Math.min(H - 1, Math.max(0, y + dy)); hgt[yy * W + xx] = Math.min(hgt[yy * W + xx], d / 5); }
  }, { normalStrength: 2 });
}

/* ---------- materials ---------- */
export function std(key, opts) {
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  const m = new THREE.MeshStandardMaterial(opts); m.userData.shared = true;
  MAT_CACHE.set(key, m); return m;
}
/* a textured standard material whose UV scale is fixed per key */
export function surf(key, set, { color = 0xffffff, rough = 0.85, metal = 0, repeat = null, nScale = 1, env = 1, emissive = null, ei = 0, side = THREE.FrontSide } = {}) {
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  const clone = (t) => { if (!t || !repeat) return t; const c = t.clone(); c.repeat.set(repeat[0], repeat[1]); c.userData.shared = true; c.needsUpdate = true; return c; };
  const o = { color, map: clone(set.map), normalMap: clone(set.normalMap), roughness: rough, metalness: metal, envMapIntensity: env, side };
  if (set.roughnessMap) o.roughnessMap = clone(set.roughnessMap);
  const m = new THREE.MeshStandardMaterial(o);
  m.normalScale.set(nScale, nScale);
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  m.userData.shared = true; MAT_CACHE.set(key, m); return m;
}
