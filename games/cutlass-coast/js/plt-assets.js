// Cutlass Coast — procedural asset library (Phase 1)
// ES module. No UI dependencies. All geometry + CanvasTextures are generated in code.
// Usage: import { PLT } from './plt-assets.js';
// === PLT ASSETS BEGIN ===
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- utils
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const makeRng = (seed) => mulberry32(typeof seed === 'string' ? hashStr(seed) : ((seed | 0) || 12345));
function hash2(ix, iy, s) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295;
}
function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, s = 0, oct = 3) { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return v / n; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- palette (bright "Plunder" push)
const PAL = {
  woodDark: '#6b4a2b', wood: '#8f633a', woodLight: '#b0834e', deck1: '#caa06a', deck2: '#b98f5a',
  sail: '#f6eed6', sailOld: '#e6d6ae', rope: '#c2a26e', iron: '#3a3d40', brass: '#e0b451',
  sand: '#f2da96', sandWet: '#dcc07e', jungle: '#3c8f3a', jungleLight: '#6fb446', jungleDark: '#2a6a30',
  stone: '#c7bba4', stoneDark: '#a3977f', roof: '#c9653a', whitewash: '#f6f0e3', black: '#26221e',
  steel: '#d9dfe4', skin: '#e9b98f', lantern: '#ffd27a', cloud: '#ffffff', glass: '#ffe39a',
  nation_england: '#c63a2e', nation_france: '#2f5bb0', nation_holland: '#e8812e', nation_spain: '#e6bf3a', nation_pirate: '#2a2622',
};
const NATIONS = ['england', 'france', 'holland', 'spain', 'pirate'];
const nationHex = (n) => PAL['nation_' + (NATIONS.includes(n) ? n : 'pirate')];

// shared animated uniforms (sails, flags)
const U = { uTime: { value: 0 }, uWindStr: { value: 0.6 } };
// shared environment (sky writes, water reads)
const ENV = {
  sunDir: new THREE.Vector3(0.5, 0.8, 0.3).normalize(), sunColor: new THREE.Color('#fff4d6'),
  skyColor: new THREE.Color('#bfe8f5'), ambient: new THREE.Color('#9fd3e6'), night: 0,
};

// ---------------------------------------------------------------- textures
const _texCache = new Map();
function canvasTex(key, w, h, draw, repeat) {
  if (_texCache.has(key)) return _texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  _texCache.set(key, t); return t;
}
function drawFlag(g, w, h, nation) {
  const col = nationHex(nation);
  if (nation === 'england') {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = col;
    g.fillRect(w * 0.42, 0, w * 0.16, h); g.fillRect(0, h * 0.38, w, h * 0.24);
  } else if (nation === 'france') {
    g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff';
    g.fillRect(w * 0.4, 0, w * 0.12, h); g.fillRect(0, h * 0.42, w, h * 0.16);
    g.fillStyle = '#f2cf4a'; g.beginPath(); g.arc(w * 0.46, h * 0.5, h * 0.14, 0, Math.PI * 2); g.fill();
  } else if (nation === 'holland') {
    g.fillStyle = col; g.fillRect(0, 0, w, h / 3); g.fillStyle = '#ffffff'; g.fillRect(0, h / 3, w, h / 3);
    g.fillStyle = '#2a4f9a'; g.fillRect(0, 2 * h / 3, w, h / 3 + 1);
  } else if (nation === 'spain') {
    g.fillStyle = '#fbf3dc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c0302a'; g.lineWidth = h * 0.16; g.lineCap = 'square';
    g.beginPath(); g.moveTo(w * 0.1, h * 0.1); g.lineTo(w * 0.9, h * 0.9); g.moveTo(w * 0.9, h * 0.1); g.lineTo(w * 0.1, h * 0.9); g.stroke();
    g.fillStyle = col; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08);
  } else { // pirate: friendly cartoon skull + crossed bones
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f0e6'; g.strokeStyle = '#f4f0e6';
    g.lineWidth = h * 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.3, h * 0.78); g.lineTo(w * 0.7, h * 0.3); g.moveTo(w * 0.7, h * 0.78); g.lineTo(w * 0.3, h * 0.3); g.stroke();
    g.beginPath(); g.arc(w * 0.5, h * 0.45, h * 0.22, 0, Math.PI * 2); g.fill();
    g.fillRect(w * 0.43, h * 0.55, w * 0.14, h * 0.14);
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(w * 0.44, h * 0.43, h * 0.06, 0, 7); g.arc(w * 0.56, h * 0.43, h * 0.06, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, w * 0.04, h); // hoist shade
}
const textures = {
  flag(nation = 'pirate') { if (!NATIONS.includes(nation)) nation = 'pirate'; return canvasTex('flag_' + nation, 128, 80, (g, w, h) => drawFlag(g, w, h, nation)); },
  sailCloth() {
    return canvasTex('sailCloth', 128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,95,60,0.16)';
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(120,95,60,0.22)'; g.fillRect(0, 2, w, 3); g.fillRect(0, h - 6, w, 4);
      g.fillStyle = 'rgba(120,95,60,0.10)'; g.fillRect(0, h * 0.5, w, 2);
    });
  },
  planks() {
    return canvasTex('planks', 128, 128, (g, w, h) => {
      const r = makeRng(7);
      for (let y = 0; y < h; y += 16) { g.fillStyle = `hsl(30,40%,${46 + r() * 10}%)`; g.fillRect(0, y, w, 16); g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(0, y, w, 1.5); const s = r() * w; g.fillRect(s, y, 1.5, 16); }
    }, true);
  },
  parchment() {
    return canvasTex('parchment', 256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.7);
      gr.addColorStop(0, '#f3e4bf'); gr.addColorStop(1, '#cfb07a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = makeRng(3); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,85,40,${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3); }
    });
  },
  puff() { return canvasTex('fx_puff', 64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }); },
  spark() { return canvasTex('fx_spark', 64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(30, 2, 4, 60); g.fillRect(2, 30, 60, 4); }); },
  chip() { return canvasTex('fx_chip', 32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(4, 12); g.lineTo(26, 4); g.lineTo(28, 20); g.lineTo(8, 28); g.fill(); }); },
  bubble() { return canvasTex('fx_bubble', 64, 64, (g) => { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill(); g.fillStyle = '#fff'; g.fillRect(20, 18, 8, 6); }); },
};

// ---------------------------------------------------------------- materials (shared, one per palette colour)
const _matCache = new Map();
// Performance mode (engine.js readPerf — same localStorage key / ?perf= override): Lambert instead of PBR
// lighting, which is far cheaper per pixel on low-power GPUs. Decided once, before any material is made.
const LOW_QUALITY = (() => {
  try { const q = new URLSearchParams(location.search).get('perf'); if (q === '1' || q === '0') return q === '1'; } catch (e) {}
  try { return localStorage.getItem('peg-leg-ted:perf') === '1'; } catch (e) { return false; }
})();
function std(opts) {
  const o = Object.assign({ roughness: 0.85, metalness: 0, flatShading: true }, opts);
  if (LOW_QUALITY) { delete o.roughness; delete o.metalness; return new THREE.MeshLambertMaterial(o); }
  return new THREE.MeshStandardMaterial(o);
}
function makeSailMat(hex) {
  const m = std({ color: hex, map: textures.sailCloth(), side: THREE.DoubleSide, flatShading: false, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWindStr = U.uWindStr;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWindStr;\nattribute float aBulge;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      float fl = sin(uTime*2.3 + position.x*0.9 + position.y*0.6)*0.6 + sin(uTime*3.9 + position.x*1.7 - position.y)*0.4;
      transformed.z += aBulge * (0.03 + 0.09*uWindStr + 0.018*fl);`);
  };
  m.customProgramCacheKey = () => 'plt_sail';
  return m;
}
function makeFlagMat(nation) {
  const m = std({ map: textures.flag(nation), side: THREE.DoubleSide, flatShading: false, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      float k = max(position.x, 0.0);
      transformed.z += sin(uTime*7.0 - position.x*3.5)*0.13*k;
      transformed.y += sin(uTime*5.0 - position.x*2.5)*0.04*k;`);
  };
  m.customProgramCacheKey = () => 'plt_flag';
  return m;
}
const materials = {
  /** Material for an InstancedMesh (perf): three.js must use a different shader for instanced / instance-coloured
   *  draws, so ONE material shared by both kinds flips its program on every draw call, every frame. Instanced
   *  meshes get their own cached twin instead. colored = the mesh uses setColorAt. */
  inst(name, colored = false) {
    const key = name + (colored ? '|Ic' : '|I');
    if (_matCache.has(key)) return _matCache.get(key);
    const m = materials.get(name).clone(); m.name = key; _matCache.set(key, m); return m;
  },
  get(name) {
    if (_matCache.has(name)) return _matCache.get(name);
    let m;
    if (name === 'vcol') m = std({ vertexColors: true });
    else if (name === 'vcolDouble') m = std({ vertexColors: true, side: THREE.DoubleSide });
    else if (name === 'sail') m = makeSailMat(PAL.sail);
    else if (name === 'sailOld') m = makeSailMat(PAL.sailOld);
    else if (name === 'sailPlain') m = std({ color: PAL.sail, flatShading: true });
    else if (name.startsWith('flag_')) m = makeFlagMat(name.slice(5));
    else if (name === 'lantern') m = std({ color: PAL.lantern, emissive: '#ffae2a', emissiveIntensity: 0.8, flatShading: false });
    else if (name === 'cloud') m = std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25 });
    else if (name === 'steel') m = std({ color: PAL.steel, roughness: 0.4, metalness: 0.3 });
    else if (name === 'water_small') m = std({ color: '#3fd0d0', roughness: 0.2, flatShading: false });
    else if (name.startsWith('#')) m = std({ color: name });
    else m = std({ color: PAL[name] || '#ff00ff' });
    m.name = name; _matCache.set(name, m); return m;
  },
  names() { return ['woodDark', 'wood', 'woodLight', 'sail', 'sailOld', 'rope', 'iron', 'brass', 'sand', 'jungle', 'jungleLight', 'stone', 'roof', 'whitewash', 'black', ...NATIONS.map(n => 'nation_' + n)]; },
  palette: PAL,
};

// ---------------------------------------------------------------- geometry helpers
// All "parts" are non-indexed BufferGeometries with position + normal + color so they can be merged.
function prep(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _v1.set(x, y, z); _s.set(sx, sy, sz);
  _m4.compose(_v1, _q, _s); g.applyMatrix4(_m4); return g;
}
const box = (w, h, d, col, x, y, z, rx, ry, rz) => place(prep(new THREE.BoxGeometry(w, h, d), col), x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, seg, col, x, y, z, rx, ry, rz) => place(prep(new THREE.CylinderGeometry(rt, rb, h, seg), col), x, y, z, rx, ry, rz);
const ico = (r, col, x, y, z, sx = 1, sy = 1, sz = 1, detail = 0) => place(prep(new THREE.IcosahedronGeometry(r, detail), col), x, y, z, 0, 0, 0, sx, sy, sz);
function cylBetween(a, b, r, seg, col) {
  _v2.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v2.length();
  const g = prep(new THREE.CylinderGeometry(r, r, len, seg, 1, true), col);
  _q.setFromUnitVectors(UP, _v2.normalize()); _v1.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); _s.set(1, 1, 1);
  _m4.compose(_v1, _q, _s); g.applyMatrix4(_m4); return g;
}
function merge(list) {
  const g = mergeGeometries(list.filter(Boolean), false);
  for (const p of list) if (p) p.dispose();
  return g;
}
function jitter(g, amt, rng) { // jitter shared positions consistently (by rounded position key)
  const p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(k); if (!o) { o = [(rng() - 0.5) * amt, (rng() - 0.5) * amt, (rng() - 0.5) * amt]; map.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals(); return g;
}
function disposeTree(root) {
  root.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  if (root.parent) root.parent.remove(root);
}
function withDispose(group) { group.dispose = () => disposeTree(group); return group; }
function vmesh(geo, name, matName = 'vcol') { const m = new THREE.Mesh(geo, materials.get(matName)); m.name = name; return m; }
function countTris(root) {
  let t = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return; const g = o.geometry; let n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count / 3);
    t += n * (o.isInstancedMesh ? o.count : 1);
  });
  return Math.round(t);
}
function flagMesh(nation, w = 1.6) {
  const g = new THREE.PlaneGeometry(w, w * 0.62, 8, 2); g.translate(w / 2, 0, 0);
  const m = new THREE.Mesh(g, materials.get('flag_' + (NATIONS.includes(nation) ? nation : 'pirate'))); m.name = 'flag'; return m;
}

// ---------------------------------------------------------------- role-coloured static geometry (ships)
const R = { RAIL: 0, BULW: 1, STRIPE: 2, UPPER: 3, WL: 4, BOTTOM: 5, DECK1: 6, DECK2: 7, BLACK: 8, BRASS: 9, IRON: 10, ROPE: 11, WHITE: 12, GLASS: 13, MAST: 14 };
function roleColor(role, nation, out) {
  switch (role) {
    case R.RAIL: return out.set(PAL.woodDark);
    case R.BULW: return out.set(PAL.woodLight);
    case R.STRIPE: return out.set(nation === 'pirate' ? '#3a3430' : nationHex(nation));
    case R.UPPER: return out.set(PAL.wood);
    case R.WL: return out.set('#4a3220');
    case R.BOTTOM: return out.set('#5e3f25');
    case R.DECK1: return out.set(PAL.deck1);
    case R.DECK2: return out.set(PAL.deck2);
    case R.BLACK: return out.set('#1c1712');
    case R.BRASS: return out.set(PAL.brass);
    case R.IRON: return out.set(PAL.iron);
    case R.ROPE: return out.set(PAL.rope);
    case R.WHITE: return out.set(PAL.whitewash);
    case R.GLASS: return out.set(PAL.glass);
    case R.MAST: return out.set('#7c5732');
  }
  return out.set('#ff00ff');
}
class RoleBuilder {
  constructor() { this.pos = []; this.role = []; }
  tri(a, b, c, r) { this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); this.role.push(r, r, r); }
  quad(a, b, c, d, r) { this.tri(a, b, c, r); this.tri(a, c, d, r); }
  geo(g, r) {
    const n = g.index ? g.toNonIndexed() : g; const p = n.attributes.position.array;
    for (let i = 0; i < p.length; i++) this.pos.push(p[i]);
    for (let i = 0; i < p.length / 3; i++) this.role.push(r);
    if (n !== g) n.dispose(); g.dispose();
  }
  box(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) { this.geo(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), r); }
  cyl(rt, rb, h, seg, r, x, y, z, rx = 0, ry = 0, rz = 0) { this.geo(place(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz), r); }
  line(a, b, rad, seg, r) {
    _v2.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v2.length();
    const g = new THREE.CylinderGeometry(rad, rad, len, seg, 1, true);
    _q.setFromUnitVectors(UP, _v2.normalize()); _v1.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); _s.set(1, 1, 1);
    g.applyMatrix4(_m4.compose(_v1, _q, _s)); this.geo(g, r);
  }
  build(rng) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length), 3));
    g.computeVertexNormals();
    const n = this.role.length, sc = new Float32Array(n);
    for (let i = 0; i < n; i += 3) { const v = rng(); sc[i] = sc[i + 1] = sc[i + 2] = v; }
    g.userData.roles = Uint8Array.from(this.role); g.userData.scorch = sc;
    return g;
  }
}
function paintRoles(g, nation, damage = 0) {
  const roles = g.userData.roles, sc = g.userData.scorch, col = g.attributes.color.array;
  let lastRole = -1;
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] !== lastRole) { roleColor(roles[i], nation, _c); lastRole = roles[i]; }
    let f = 1;
    if (damage > 0) { const s = sc[i]; f = 1 - damage * (0.15 + 0.45 * s); if (s > 1 - damage * 0.4) f *= 0.35; }
    col[i * 3] = _c.r * f; col[i * 3 + 1] = _c.g * f; col[i * 3 + 2] = _c.b * f;
  }
  g.attributes.color.needsUpdate = true;
}
function taperBox(w, h, d, back = 1, front = 1) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setX(i, p.getX(i) * (z < 0 ? back : front)); }
  g.computeVertexNormals(); return g;
}

// sail: trapezoid grid hanging down from y=0, belly toward +Z. aBulge drives the shader billow.
function sailGeometry(wTop, wBot, h, cols = 6, rows = 4) {
  const g = new THREE.PlaneGeometry(1, 1, cols, rows), p = g.attributes.position, uv = g.attributes.uv;
  const bulge = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i); // v: 0 top .. 1 bottom
    const w = lerp(wTop, wBot, v), s = (1 - Math.pow(2 * u - 1, 2)) * (0.3 + 0.7 * Math.sin(v * Math.PI * 0.8));
    p.setXYZ(i, (u - 0.5) * w, -v * h, s * w * 0.12);
    bulge[i] = s * Math.max(w, h) * 0.6;
  }
  g.setAttribute('aBulge', new THREE.BufferAttribute(bulge, 1));
  g.computeVertexNormals(); return g;
}
function triSailGeometry(A, B, C, n = 4) { // A,B,C in local XY; belly +Z
  const pos = [], bul = [], uvs = [], idx = [];
  const rowStart = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    rowStart.push(k);
    for (let j = 0; j <= n - i; j++) {
      const a = i / n, b = j / n, c = 1 - a - b;
      const x = A[0] * c + B[0] * a + C[0] * b, y = A[1] * c + B[1] * a + C[1] * b;
      const s = 27 * a * b * c; const size = 2.5;
      pos.push(x, y, s * size * 0.25); bul.push(s * size); uvs.push(x * 0.2, y * 0.2); k++;
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    const a = rowStart[i] + j, b = a + 1, c = rowStart[i + 1] + j;
    idx.push(a, c, b);
    if (j < n - i - 1) { const d = rowStart[i + 1] + j + 1; idx.push(b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aBulge', new THREE.Float32BufferAttribute(bul, 1));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

let _cannonGeo = null;
function cannonGeometry() {
  if (_cannonGeo) return _cannonGeo;
  _cannonGeo = merge([
    cyl(0.075, 0.11, 0.95, 7, PAL.iron, 0, 0, 0.2, Math.PI / 2),
    cyl(0.12, 0.12, 0.1, 7, '#2c2e30', 0, 0, 0.64, Math.PI / 2),
    box(0.36, 0.18, 0.55, PAL.woodDark, 0, -0.15, -0.05),
  ]);
  _cannonGeo.userData.shared = true; return _cannonGeo;
}

// ---------------------------------------------------------------- ships
const SHIP_TYPES = {
  pinnace: { L: 8, B: 2.6, masts: 1, guns: 4, hs: 1.7, sheer: 0.35, castle: 0, fore: 0, tumble: 0 },
  sloop: { L: 10, B: 3.2, masts: 1, guns: 8, hs: 1.8, sheer: 0.4, castle: 0.7, fore: 0, tumble: 0 },
  barque: { L: 12, B: 3.6, masts: 2, guns: 10, hs: 2.0, sheer: 0.45, castle: 0.9, fore: 0.6, tumble: 0 },
  fluyt: { L: 14, B: 4.4, masts: 3, guns: 8, hs: 2.2, sheer: 0.55, castle: 1.4, fore: 0.6, tumble: 1 },
  merchantman: { L: 15, B: 4.4, masts: 3, guns: 12, hs: 2.3, sheer: 0.5, castle: 1.3, fore: 0.8, tumble: 0.2 },
  frigate: { L: 17, B: 4.4, masts: 3, guns: 24, hs: 2.4, sheer: 0.4, castle: 1.0, fore: 0.6, tumble: 0 },
  galleon: { L: 18, B: 5.2, masts: 3, guns: 24, hs: 2.6, sheer: 0.7, castle: 2.2, fore: 1.3, tumble: 0.5, tiers: 2 },
  warGalleon: { L: 22, B: 6.0, masts: 4, guns: 36, hs: 3.0, sheer: 0.8, castle: 2.6, fore: 1.5, tumble: 0.5, tiers: 2 },
};
const MAST_LAYOUT = { 1: [[0.12, 1]], 2: [[0.3, 1], [-0.22, 0.85]], 3: [[0.42, 0.88], [0.04, 1], [-0.4, 0.72]], 4: [[0.46, 0.84], [0.15, 1], [-0.17, 0.8], [-0.44, 0.62]] };
const XF_STD = [0.88, 0.9, 0.93, 0.97, 1, 0.98, 0.82, 0.45, 0];
const XF_TUMBLE = [0.64, 0.68, 0.76, 0.87, 1, 0.99, 0.86, 0.5, 0];
const BANDS = [R.RAIL, R.BULW, R.STRIPE, R.UPPER, R.WL, R.BOTTOM, R.BOTTOM, R.BOTTOM];

function createShip(type = 'sloop', opts = {}) {
  if (!SHIP_TYPES[type]) type = 'sloop';
  const cfg = SHIP_TYPES[type];
  const rng = makeRng(opts.seed != null ? opts.seed : hashStr(type));
  const { L, B, hs, sheer, castle, fore, tumble } = cfg;
  const half = L / 2, W = B / 2, D = B * 0.42, railH = 0.6;
  const xf = XF_STD.map((v, i) => lerp(v, XF_TUMBLE[i], tumble));
  const wf = (t) => t >= 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.55) : 1 - 0.38 * Math.pow(-t, 2.2);
  const hsf = (t) => hs + sheer * t * t + (t < 0 ? sheer * 0.6 * Math.pow(-t, 3) : 0);
  const depth = (t) => D * (t > 0 ? 1 - 0.55 * t * t * t : 1 - 0.25 * t * t * t * t);
  const deckY = (t) => hsf(t) - railH;
  const section = (t) => {
    const w = W * wf(t), h = hsf(t), dk = h - railH, dd = depth(t);
    const ys = [h, h - 0.18, dk - 0.05, dk - 0.45, Math.min(0.35, dk - 0.6), -0.05, -0.5 * dd, -0.88 * dd, -dd];
    return { w, h, dk, dd, ys, xs: xf.map(f => f * w) };
  };
  const zOf = (t, y, dd) => t * half + (t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * (y + dd) * 0.45 : 0);
  const sideX = (t, y) => { // hull half-width at height y
    const s = section(t);
    for (let j = 0; j < 8; j++) if (y <= s.ys[j] && y >= s.ys[j + 1]) return lerp(s.xs[j], s.xs[j + 1], (s.ys[j] - y) / (s.ys[j] - s.ys[j + 1]));
    return s.xs[0];
  };

  const rb = new RoleBuilder();
  // hull loft
  const NS = 18, rings = [], secs = [];
  for (let i = 0; i <= NS; i++) {
    const t = -1 + 2 * i / NS, s = section(t); secs.push(s);
    const ring = [];
    for (let j = 0; j <= 8; j++) ring.push([s.xs[j], s.ys[j], zOf(t, s.ys[j], s.dd)]);
    for (let j = 7; j >= 0; j--) ring.push([-s.xs[j], s.ys[j], zOf(t, s.ys[j], s.dd)]);
    rings.push(ring);
  }
  for (let i = 0; i < NS; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let j = 0; j < 16; j++) rb.quad(a[j], a[j + 1], b[j + 1], b[j], j < 8 ? BANDS[j] : BANDS[15 - j]);
    // inner bulwark lining, rail cap, deck lanes
    const s0 = secs[i], s1 = secs[i + 1], z0 = a[0][2], z1 = b[0][2];
    for (const sg of [1, -1]) {
      const ia0 = Math.max(0, s0.xs[0] - 0.12) * sg, ia1 = Math.max(0, s1.xs[0] - 0.12) * sg;
      const ic0 = Math.max(0, s0.xs[2] - 0.14) * sg, ic1 = Math.max(0, s1.xs[2] - 0.14) * sg;
      rb.quad([ia0, s0.h, z0], [ic0, s0.dk, z0], [ic1, s1.dk, z1], [ia1, s1.h, z1], R.BULW);
      rb.quad([s0.xs[0] * sg, s0.h + 0.01, z0], [ia0, s0.h + 0.01, z0], [ia1, s1.h + 0.01, z1], [s1.xs[0] * sg, s1.h + 0.01, z1], R.RAIL);
    }
    const xd0 = Math.max(0, s0.xs[2] - 0.14), xd1 = Math.max(0, s1.xs[2] - 0.14), LN = 6;
    for (let k = 0; k < LN; k++) {
      const u0 = -1 + 2 * k / LN, u1 = -1 + 2 * (k + 1) / LN;
      rb.quad([xd0 * u0, s0.dk, z0], [xd0 * u1, s0.dk, z0], [xd1 * u1, s1.dk, z1], [xd1 * u0, s1.dk, z1], k % 2 ? R.DECK1 : R.DECK2);
    }
  }
  // transom
  { const r0 = rings[0]; let cy = 0; for (const p of r0) cy += p[1]; cy /= r0.length; const c = [0, cy, r0[0][2]];
    for (let j = 0; j < 16; j++) rb.tri(c, r0[j + 1], r0[j], j === 0 || j === 15 ? R.RAIL : R.UPPER); }
  // rudder + keel strip
  rb.box(0.22, hsf(-1) + D * 0.7, 0.9, R.WL, 0, (hsf(-1) - D * 0.7) / 2 - 0.2, -half - 0.35);

  // gun ports + cannon positions
  const perSide = cfg.guns / 2, rows = perSide > 12 ? 2 : 1, perRow = perSide / rows;
  const guns = []; // {x,y,z,side}
  for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) {
    const t = lerp(-0.5, 0.52, perRow === 1 ? 0.5 : i / (perRow - 1)) + (r ? 0.03 : 0);
    const y = r === 0 ? deckY(t) + 0.28 : deckY(t) - 0.85, z = t * half, sx = sideX(t, y);
    for (const side of [1, -1]) {
      rb.box(0.08, 0.32, 0.36, R.BLACK, side * (sx + 0.02), y, z);
      guns.push({ x: side * (sx - (r ? 0.45 : 0.28)), y, z, side, sx });
    }
  }

  // stern castle
  let castleTop = deckY(-1) + 0.3, castleZ0 = -half + 0.08, group_qd = null;
  if (castle > 0) {
    const clen = L * (cfg.tiers ? 0.28 : 0.22), cz0 = castleZ0, cz1 = cz0 + clen, cmid = (cz0 + cz1) / 2;
    const tm = (cmid / half), tb = (cz0 / half), tf2 = (cz1 / half);
    const wMid = sideX(tm, deckY(tm)) * 2 * 0.97, back = sideX(tb, deckY(tb)) / sideX(tm, deckY(tm)), front = sideX(tf2, deckY(tf2)) / sideX(tm, deckY(tm));
    const y0 = deckY(tm) - 0.3, hgt = castle + 0.3 + (deckY(tb) - deckY(tm)) * 0.5;
    const cy = y0 + hgt / 2;
    rb.geo(place(taperBox(wMid, hgt, clen, back, front), 0, cy, cmid), R.UPPER);
    rb.geo(place(taperBox(wMid * 1.03, 0.22, clen * 1.005, back, front), 0, y0 + hgt - 0.45, cmid), R.STRIPE);
    const top = y0 + hgt;
    rb.geo(place(taperBox(wMid * 0.99, 0.06, clen * 0.99, back, front), 0, top + 0.03, cmid), R.DECK1);
    const xb = wMid / 2 * back, xfr = wMid / 2 * front;
    for (const sg of [1, -1]) rb.line([sg * xb, top + 0.35, cz0], [sg * xfr, top + 0.35, cz1], 0.07, 4, R.RAIL);
    rb.line([-xb, top + 0.35, cz0], [xb, top + 0.35, cz0], 0.07, 4, R.RAIL);
    for (const sg of [1, -1]) for (const zz of [cz0, cmid, cz1]) { const xx = lerp(xb, xfr, (zz - cz0) / clen); rb.box(0.08, 0.35, 0.08, R.RAIL, sg * xx, top + 0.18, zz); }
    // windows
    const nWin = Math.max(2, Math.round(wMid * back / 1.1));
    for (let i = 0; i < nWin; i++) rb.box(0.38, 0.42, 0.06, R.GLASS, lerp(-xb * 0.7, xb * 0.7, nWin === 1 ? 0.5 : i / (nWin - 1)), cy + 0.05, cz0 - 0.03);
    for (const sg of [1, -1]) for (let i = 0; i < 2; i++) rb.box(0.06, 0.38, 0.34, R.GLASS, sg * (lerp(xb, xfr, 0.3 + i * 0.35) + 0.03), cy + 0.05, lerp(cz0, cz1, 0.3 + i * 0.35));
    castleTop = top; group_qd = { y: top, z0: cz0, z1: cz1 };
    if (cfg.tiers) { // poop deck tier
      const l2 = clen * 0.55, z2 = cz0 + l2 / 2, h2 = castle * 0.5, b2 = back, w2 = lerp(wMid * back, wMid, 0.3) * 0.95;
      rb.geo(place(taperBox(w2, h2, l2, 1, 1.05), 0, top + h2 / 2, z2), R.UPPER);
      rb.geo(place(taperBox(w2 * 1.03, 0.18, l2 * 1.01, 1, 1.05), 0, top + h2 - 0.3, z2), R.STRIPE);
      rb.geo(place(taperBox(w2 * 0.99, 0.06, l2 * 0.99, 1, 1.05), 0, top + h2 + 0.03, z2), R.DECK1);
      for (let i = 0; i < 3; i++) rb.box(0.34, 0.34, 0.06, R.GLASS, lerp(-w2 * 0.3, w2 * 0.3, i / 2), top + h2 * 0.5, cz0 - 0.03);
      rb.line([-w2 / 2, top + h2 + 0.3, cz0], [w2 / 2, top + h2 + 0.3, cz0], 0.06, 4, R.RAIL);
      castleTop = top + h2; void b2;
    }
  }
  // forecastle
  if (fore > 0) {
    const fz0 = half * 0.48, fz1 = half * 0.82, fl = fz1 - fz0, fm = (fz0 + fz1) / 2;
    const tm = fm / half, wm = sideX(tm, deckY(tm)) * 2 * 0.95;
    const back = sideX(fz0 / half, deckY(fz0 / half)) / sideX(tm, deckY(tm)), front = sideX(fz1 / half, deckY(fz1 / half)) / sideX(tm, deckY(tm));
    const y0 = deckY(tm) - 0.3, hgt = fore + 0.3;
    rb.geo(place(taperBox(wm, hgt, fl, back, front), 0, y0 + hgt / 2, fm), R.UPPER);
    rb.geo(place(taperBox(wm * 1.03, 0.2, fl * 1.005, back, front), 0, y0 + hgt - 0.4, fm), R.STRIPE);
    rb.geo(place(taperBox(wm * 0.99, 0.06, fl * 0.99, back, front), 0, y0 + hgt + 0.03, fm), R.DECK1);
    const top = y0 + hgt, xb = wm / 2 * back, xfr = wm / 2 * front;
    for (const sg of [1, -1]) rb.line([sg * xb, top + 0.3, fz0], [sg * xfr, top + 0.3, fz1], 0.06, 4, R.RAIL);
    rb.line([-xb, top + 0.3, fz0], [xb, top + 0.3, fz0], 0.06, 4, R.RAIL);
  }

  // masts, yards, rigging
  const Hm = 3.5 + L * 0.78, mastR = 0.1 + L * 0.007;
  const layout = MAST_LAYOUT[cfg.masts];
  const mastInfo = [];
  const group = new THREE.Group(); group.name = 'ship'; group.rotation.order = 'YXZ';
  const sails = [], furls = [], topmasts = [];
  const sailMat = () => materials.get((opts.nation || 'england') === 'pirate' ? 'sailOld' : 'sail');
  let mainIdx = 0;
  layout.forEach(([tf, hf], mi) => {
    if (hf === 1) mainIdx = mi;
    const zm = tf * half, base = deckY(tf), H = Hm * hf, r = mastR * (0.8 + 0.2 * hf);
    const lowerTop = base + H * 0.6, courseY = base + H * 0.5, topY = base + H * 0.93;
    const yc = B * 1.75 * Math.sqrt(hf), yt = yc * 0.74;
    rb.cyl(r * 0.85, r, lowerTop - base + 0.5, 7, R.MAST, 0, (base + lowerTop) / 2, zm);
    rb.cyl(0.07, 0.07, yc, 5, R.MAST, 0, courseY, zm + r + 0.05, 0, 0, Math.PI / 2);
    rb.box(r * 4.5, 0.12, r * 4.5, R.RAIL, 0, lowerTop - 0.1, zm);
    const railY = hsf(tf) + 0.02, rx = sideX(tf, hsf(tf) - 0.1);
    for (const sg of [1, -1]) for (const dz of [0.1, -0.7, -1.4]) rb.line([sg * r * 1.5, lowerTop - 0.15, zm], [sg * (rx + 0.05), railY, zm + dz], 0.028, 3, R.ROPE);
    // topmast group
    const tg = new THREE.Group(); tg.name = 'topmast_' + mi; tg.position.set(0, lowerTop, zm); group.add(tg);
    const topRel = topY - lowerTop;
    const tmGeo = merge([
      cyl(r * 0.5, r * 0.7, topRel + 1.0, 6, '#7c5732', 0, (topRel + 1.0) / 2 - 0.4, 0),
      cyl(0.055, 0.055, yt, 5, '#7c5732', 0, topRel, r * 0.6 + 0.04, 0, 0, Math.PI / 2),
      box(0.18, 0.18, 0.18, PAL.brass, 0, topRel + 0.62, 0),
    ]);
    tg.add(vmesh(tmGeo, 'topmast_mesh_' + mi));
    topmasts.push(tg);
    // sails
    const cH = courseY - 0.12 - (base + 1.35);
    const course = new THREE.Mesh(sailGeometry(yc * 0.92, yc * 0.96, cH), sailMat());
    course.name = `sail_${mi}_course`; course.position.set(0, courseY - 0.1, zm + r + 0.16); group.add(course);
    const tH = topY - courseY - 0.35;
    const top = new THREE.Mesh(sailGeometry(yt * 0.9, yc * 0.88, tH), sailMat());
    top.name = `sail_${mi}_top`; top.position.set(0, topRel - 0.1, r * 0.6 + 0.16); tg.add(top);
    sails.push({ mesh: course, kind: 'course', thr: 0.3 + rng() * 0.65 }, { mesh: top, kind: 'top', thr: 0.45 + rng() * 0.6 });
    const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, yc * 0.8, 6), materials.get('sailPlain'));
    fc.rotation.z = Math.PI / 2; fc.position.set(0, courseY - 0.2, zm + r + 0.15); fc.name = `furl_${mi}_course`; group.add(fc);
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, yt * 0.8, 6), materials.get('sailPlain'));
    ft.rotation.z = Math.PI / 2; ft.position.set(0, topRel - 0.18, r * 0.6 + 0.12); ft.name = `furl_${mi}_top`; tg.add(ft);
    furls.push({ mesh: fc, kind: 'course' }, { mesh: ft, kind: 'top' });
    mastInfo.push({ zm, base, H, r, lowerTop, courseY, topY, yc, yt });
  });
  // bowsprit + jib + stays
  const bowT = 0.86, bowStart = [0, deckY(bowT) + 0.4, zOf(bowT, deckY(bowT), depth(bowT))];
  const bsLen = L * 0.32, ang = 0.33;
  const bowEnd = [0, bowStart[1] + Math.sin(ang) * bsLen, bowStart[2] + Math.cos(ang) * bsLen];
  rb.line([0, bowStart[1] - 0.3, bowStart[2] - 1.2], bowEnd, mastR * 0.7, 6, R.MAST);
  const fm = mastInfo[0];
  rb.line([0, fm.lowerTop - 0.1, fm.zm], bowEnd, 0.035, 3, R.ROPE);
  const lm = mastInfo[mastInfo.length - 1];
  rb.line([0, lm.lowerTop - 0.1, lm.zm], [0, castleTop + 0.2, castleZ0 + 0.2], 0.03, 3, R.ROPE);
  for (let i = 0; i + 1 < mastInfo.length; i++) rb.line([0, mastInfo[i + 1].lowerTop, mastInfo[i + 1].zm], [0, mastInfo[i].base + 0.3, mastInfo[i].zm - 0.2], 0.025, 3, R.ROPE);
  {
    const head = [fm.zm + fm.r + 0.2, fm.lowerTop - 0.3], tack = [bowEnd[2] - 0.4, bowEnd[1] - 0.15], clew = [lerp(fm.zm, bowEnd[2], 0.35), deckY(0.6) + 1.7];
    const jib = new THREE.Mesh(triSailGeometry(head, tack, clew), sailMat());
    jib.rotation.y = -Math.PI / 2; jib.name = 'sail_jib'; group.add(jib);
    sails.push({ mesh: jib, kind: 'jib', thr: 0.35 + rng() * 0.5 });
  }
  // lantern + ensign
  const lanternPos = [0, castleTop + 0.35, castleZ0 - 0.1];
  rb.cyl(0.04, 0.04, 0.9, 4, R.IRON, 0, castleTop + 0.1, castleZ0 - 0.05);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.34), materials.get('lantern'));
  lantern.name = 'lantern'; lantern.position.set(lanternPos[0], lanternPos[1] + 0.25, lanternPos[2]); group.add(lantern);
  const ensH = 1.6 + L * 0.06;
  rb.cyl(0.05, 0.06, ensH, 5, R.MAST, 0, castleTop + ensH / 2, castleZ0 + 0.35);

  // static hull mesh
  const hullGeo = rb.build(rng);
  const hull = new THREE.Mesh(hullGeo, materials.get('vcolDouble')); hull.name = 'hull';
  group.add(hull);
  // cannons (instanced)
  const cannons = new THREE.InstancedMesh(cannonGeometry(), materials.inst('vcol'), guns.length); cannons.name = 'cannons';
  let li = 0, ri = 0;
  guns.forEach((gp, i) => {
    _e.set(0, gp.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0); _q.setFromEuler(_e); _v1.set(gp.x, gp.y, gp.z); _s.set(1, 1, 1);
    cannons.setMatrixAt(i, _m4.compose(_v1, _q, _s));
    const a = new THREE.Object3D(); a.name = gp.side > 0 ? 'muzzle_L' + (li++) : 'muzzle_R' + (ri++);
    a.position.set(gp.side * (Math.abs(gp.x) + 0.95), gp.y, gp.z); a.userData.dir = new THREE.Vector3(gp.side, 0, 0); group.add(a);
  });
  cannons.instanceMatrix.needsUpdate = true; cannons.computeBoundingSphere(); group.add(cannons);
  // flags
  const fw = 1.2 + L * 0.075;
  const mainTG = topmasts[mainIdx], mi0 = mastInfo[mainIdx];
  const flagPivot = new THREE.Group(); flagPivot.name = 'flag_pivot'; flagPivot.position.set(0, mi0.topY - mi0.lowerTop + 0.45, 0); mainTG.add(flagPivot);
  const flag = flagMesh(opts.nation || 'england', fw); flag.position.y = 0; flagPivot.add(flag);
  const ensPivot = new THREE.Group(); ensPivot.name = 'ensign_pivot'; ensPivot.position.set(0, castleTop + ensH - 0.35, castleZ0 + 0.35); group.add(ensPivot);
  const ensign = flagMesh(opts.nation || 'england', fw * 0.9); ensign.name = 'ensign'; ensPivot.add(ensign);
  // anchors
  const wake = new THREE.Object3D(); wake.name = 'wake_anchor'; wake.position.set(0, 0, -half - 0.6); group.add(wake);
  const bowA = new THREE.Object3D(); bowA.name = 'bow_anchor'; bowA.position.set(0, 0, half + 0.5); group.add(bowA);

  group.userData.stats = { type, guns: cfg.guns, masts: cfg.masts, length: L, beam: B };
  group.userData.deckY = deckY; group.userData.halfLength = half; group.userData.castleTop = castleTop;
  group.userData.mastHeight = Hm; group.userData.quarterDeck = group_qd;

  // ---- state + API
  const st = { nation: 'england', sailState: 'full', damage: 0, sinkP: 0, y: 0, pitch: 0, roll: 0, wx: 0, wz: 1, t: 0 };
  function refreshSails() {
    for (const s of sails) {
      const want = st.sailState === 'full' || (st.sailState === 'battle' && s.kind === 'top');
      s.mesh.visible = want && st.damage < s.thr;
    }
    for (const f of furls) f.mesh.visible = st.sailState === 'furl' || (st.sailState === 'battle' && f.kind === 'course');
  }
  group.setSailState = (s) => { st.sailState = (s === 'battle' || s === 'furl') ? s : 'full'; refreshSails(); return group; };
  group.setDamage = (d) => {
    st.damage = clamp(+d || 0, 0, 1); paintRoles(hullGeo, st.nation, st.damage); refreshSails();
    const tilt = st.damage > 0.7 ? (st.damage - 0.7) / 0.3 : 0;
    topmasts.forEach((tg, i) => {
      const k = i === mainIdx ? tilt : (st.damage > 0.88 && i === 0 ? (st.damage - 0.88) / 0.12 : 0);
      tg.rotation.z = (i % 2 ? -1 : 1) * k * 0.55; tg.rotation.x = k * 0.15;
    });
    return group;
  };
  group.setNation = (n) => {
    st.nation = NATIONS.includes(n) ? n : 'pirate';
    const fm = materials.get('flag_' + st.nation); flag.material = fm; ensign.material = fm;
    const sm = materials.get(st.nation === 'pirate' ? 'sailOld' : 'sail'); for (const s of sails) s.mesh.material = sm;
    paintRoles(hullGeo, st.nation, st.damage); return group;
  };
  function applyPose() {
    const p = st.sinkP, sinkY = p > 0 ? -p * p * (Hm + D + 3) - p * 0.8 : 0;
    group.position.y = st.y + sinkY;
    group.rotation.x = st.pitch - p * 0.45;
    group.rotation.z = st.roll + p * 0.25;
    group.visible = p < 0.999;
  }
  group.update = (dt = 0.016, wind, water, t) => {
    st.t += dt; const time = t != null ? t : st.t;
    U.uTime.value = time;
    if (wind) {
      const len = Math.hypot(wind.x || 0, wind.z || 0);
      if (len > 1e-4) { st.wx = wind.x / len; st.wz = wind.z / len; }
      U.uWindStr.value = len <= 1 ? len : Math.min(1, len / 10);
    }
    // flags stream downwind (in ship-local frame)
    const h = group.rotation.y, lx = st.wx * Math.cos(h) - st.wz * Math.sin(h), lz = st.wx * Math.sin(h) + st.wz * Math.cos(h);
    const fy = Math.atan2(-lz, lx);
    flagPivot.rotation.y = fy - mainTG.rotation.y; ensPivot.rotation.y = fy;
    let ty, tp, tr;
    const k = 1 - Math.exp(-dt * 5);
    if (water && water.getHeight) {
      const fx = Math.sin(h), fz = Math.cos(h), px = group.position.x, pz = group.position.z, a = half * 0.7, b = W * 0.9;
      const hb = water.getHeight(px + fx * a, pz + fz * a, time), hsn = water.getHeight(px - fx * a, pz - fz * a, time);
      const hp = water.getHeight(px + fz * b, pz - fx * b, time), hst = water.getHeight(px - fz * b, pz + fx * b, time);
      ty = (hb + hsn + hp + hst) * 0.25; tp = -Math.atan2(hb - hsn, 2 * a) * 0.8; tr = Math.atan2(hp - hst, 2 * b) * 0.8;
    } else {
      ty = Math.sin(time * 1.1) * 0.08; tp = Math.sin(time * 0.8) * 0.015; tr = Math.sin(time * 0.6 + 1) * 0.025;
    }
    st.y += (ty - st.y) * k; st.pitch += (tp - st.pitch) * k; st.roll += (tr - st.roll) * k;
    applyPose();
  };
  group.sink = (p) => { st.sinkP = clamp(+p || 0, 0, 1); applyPose(); return group; };
  group.getState = () => ({ ...st });
  group.dispose = () => { disposeTree(group); };
  group.userData.api = group;

  group.setNation(opts.nation || 'england');
  group.setSailState(opts.sailState || 'full');
  group.setDamage(opts.damage || 0);
  return group;
}
const ships = { create: createShip, types: Object.keys(SHIP_TYPES), TYPES: SHIP_TYPES };

// ---------------------------------------------------------------- water (Gerstner, 1 draw call)
const WAVES = [ // dir x, dir z, amplitude, wavelength, steepness
  [1, 0.3, 0.32, 22, 0.55], [-0.4, 1, 0.2, 13, 0.55], [0.7, -0.7, 0.11, 7.5, 0.6], [-0.9, -0.2, 0.055, 4.2, 0.6],
].map(([x, z, A, wl, Q]) => { const l = Math.hypot(x, z), k = 2 * Math.PI / wl; return { dx: x / l, dz: z / l, A, k, c: Math.sqrt(9.8 / k), Q }; });
ENV.light = { value: 1 };
const WATER_VS = `
uniform float uTime; uniform vec4 uW[4]; uniform float uQ[4]; uniform float uC[4];
varying vec3 vWorld; varying float vH; varying vec3 vN;
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 disp = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 4; i++) {
    vec2 d = uW[i].xy; float A = uW[i].z; float k = uW[i].w; float Q = uQ[i];
    float f = k * (dot(d, wp.xz) - uC[i] * uTime);
    float cf = cos(f), sf = sin(f);
    disp.x += Q * A * d.x * cf; disp.z += Q * A * d.y * cf; disp.y += A * sf;
    n.x -= d.x * k * A * cf; n.z -= d.y * k * A * cf; n.y -= Q * k * A * sf;
  }
  vec3 p = wp.xyz + disp; vH = disp.y; vWorld = p; vN = normalize(n);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky;
uniform float uTime; uniform float uHasMap; uniform float uLight; uniform sampler2D uMap; uniform vec4 uMapRect;
varying vec3 vWorld; varying float vH; varying vec3 vN;
#include <fog_pars_fragment>
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hsh(i), hsh(i+vec2(1.0,0.0)), u.x), mix(hsh(i+vec2(0.0,1.0)), hsh(i+vec2(1.0,1.0)), u.x), u.y); }
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorld);
  float sh = 0.0;
  if (uHasMap > 0.5) { vec2 uv = (vWorld.xz - uMapRect.xy) / uMapRect.zw;
    if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) sh = texture2D(uMap, uv).r; }
  vec3 col = mix(uDeep, uShallow, smoothstep(0.08, 0.85, sh));
  col = mix(col, uShallow, clamp(vH * 0.55 + 0.12, 0.0, 0.4));
  float diff = 0.6 + 0.4 * max(dot(N, uSunDir), 0.0);
  col *= diff * mix(vec3(1.0), uSunColor, 0.25) * uLight;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, uSky * uLight, fres * 0.4);
  vec3 Rf = reflect(-uSunDir, N); float spec = pow(max(dot(Rf, V), 0.0), 90.0) * 1.1;
  col += uSunColor * spec;
  float n1 = vn(vWorld.xz * 0.45 + vec2(uTime * 0.15, uTime * 0.1));
  float n2 = vn(vWorld.xz * 1.4 - vec2(uTime * 0.2, -uTime * 0.12));
  float crest = smoothstep(0.4, 0.72, vH + n1 * 0.35 - 0.08) * smoothstep(0.35, 0.7, n2);
  float coast = smoothstep(0.8, 0.96, sh) * step(0.55, fract(sh * 9.0 - uTime * 0.35 + n1 * 0.6));
  float coastLine = smoothstep(0.955, 0.99, sh);
  float foam = clamp(max(crest * 0.85, max(coast * 0.8, coastLine)), 0.0, 1.0);
  col = mix(col, uFoam * (0.75 + 0.25 * diff) * uLight, foam);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function waveHeightAt(x, z, t) {
  let px = x, pz = z;
  for (let it = 0; it < 3; it++) {
    let dx = 0, dz = 0;
    for (let i = 0; i < 4; i++) { const w = WAVES[i], f = w.k * (w.dx * px + w.dz * pz - w.c * t), cf = Math.cos(f); dx += w.Q * w.A * w.dx * cf; dz += w.Q * w.A * w.dz * cf; }
    px = x - dx; pz = z - dz;
  }
  let y = 0;
  for (let i = 0; i < 4; i++) { const w = WAVES[i]; y += w.A * Math.sin(w.k * (w.dx * px + w.dz * pz - w.c * t)); }
  return y;
}
function createWater({ size = 400, segments = 128 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments); geo.rotateX(-Math.PI / 2);
  const mapData = new Uint8Array(128 * 128 * 4);
  const mapTex = new THREE.DataTexture(mapData, 128, 128, THREE.RGBAFormat); mapTex.magFilter = THREE.LinearFilter; mapTex.minFilter = THREE.LinearFilter; mapTex.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, {
    uTime: { value: 0 },
    uW: { value: WAVES.map(w => new THREE.Vector4(w.dx, w.dz, w.A, w.k)) }, uQ: { value: WAVES.map(w => w.Q) }, uC: { value: WAVES.map(w => w.c) },
    uDeep: { value: new THREE.Color('#0f8196') }, uShallow: { value: new THREE.Color('#3fd6cf') }, uFoam: { value: new THREE.Color('#ffffff') },
    uSunDir: { value: ENV.sunDir }, uSunColor: { value: ENV.sunColor }, uSky: { value: ENV.skyColor }, uLight: ENV.light,
    uHasMap: { value: 0 }, uMap: { value: mapTex }, uMapRect: { value: new THREE.Vector4(-size / 2, -size / 2, size, size) },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true });
  mat.name = 'water';
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'water'; mesh.frustumCulled = false; mesh.renderOrder = -1;
  const api = {
    mesh, material: mat,
    update(t) { uniforms.uTime.value = t; },
    getHeight(x, z, t = uniforms.uTime.value) { return waveHeightAt(x, z, t) + mesh.position.y; },
    setShallowMap(fn, rect) {
      if (!fn) { uniforms.uHasMap.value = 0; return; }
      const r = rect || { x0: mesh.position.x - size / 2, z0: mesh.position.z - size / 2, size };
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
        const v = clamp(fn(r.x0 + (i + 0.5) / 128 * r.size, r.z0 + (j + 0.5) / 128 * r.size), 0, 1) * 255;
        const o = (j * 128 + i) * 4; mapData[o] = mapData[o + 1] = mapData[o + 2] = v; mapData[o + 3] = 255;
      }
      mapTex.needsUpdate = true; uniforms.uMapRect.value.set(r.x0, r.z0, r.size, r.size); uniforms.uHasMap.value = 1;
    },
    setColors({ deep, shallow, foam } = {}) { if (deep) uniforms.uDeep.value.set(deep); if (shallow) uniforms.uShallow.value.set(shallow); if (foam) uniforms.uFoam.value.set(foam); },
    dispose() { geo.dispose(); mat.dispose(); mapTex.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
  mesh.userData.api = api;
  return api;
}
const water = { create: createWater, heightAt: waveHeightAt };

// ---------------------------------------------------------------- sky
const SKY_PRESETS = {
  day: { top: '#2f8fe0', horizon: '#c4ecf7', bottom: '#9ad8e6', elev: 0.9, azim: 0.6, sun: '#fff3d6', sunI: 2.3, sunSize: 0.012, hemiSky: '#d2efff', hemiGround: '#e7d6a3', hemiI: 1.25, cloud: '#ffffff', lantern: 0.5, light: 1, stars: 0 },
  dusk: { top: '#3a4b8a', horizon: '#ffb070', bottom: '#f09a6a', elev: 0.12, azim: 2.2, sun: '#ffb46e', sunI: 2.2, sunSize: 0.02, hemiSky: '#ffd2b0', hemiGround: '#8a7090', hemiI: 1.45, cloud: '#ffc2a0', lantern: 1.6, light: 0.85, stars: 0.15 },
  night: { top: '#07102a', horizon: '#1f3a66', bottom: '#142a4a', elev: 0.7, azim: -0.8, sun: '#b9cdfa', sunI: 1.1, sunSize: 0.008, hemiSky: '#7090d8', hemiGround: '#2a3450', hemiI: 1.05, cloud: '#56688c', lantern: 3.2, light: 0.36, stars: 1 },
};
const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  float s = dot(d, normalize(uSunDir));
  col += uSunColor * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, s) * 1.2 + pow(max(s, 0.0), 12.0) * 0.28);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function createSky(preset = 'day') {
  const root = new THREE.Group(); root.name = 'sky';
  const su = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uSunDir: { value: ENV.sunDir }, uSunColor: { value: new THREE.Color() }, uSunSize: { value: 0.01 } };
  const domeMat = new THREE.ShaderMaterial({ uniforms: su, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(460, 24, 12), domeMat); dome.name = 'dome'; dome.renderOrder = -10; dome.frustumCulled = false;
  root.add(dome);
  const rng = makeRng(99), sp = [];
  for (let i = 0; i < 420; i++) { const a = rng() * Math.PI * 2, e = Math.asin(0.05 + rng() * 0.95), r = 440; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false, fog: false });
  const stars = new THREE.Points(sg, starMat); stars.name = 'stars'; stars.frustumCulled = false; root.add(stars);
  const cl = [];
  for (let c = 0; c < 8; c++) {
    const a = c / 8 * Math.PI * 2 + rng() * 0.5, r = 260 + rng() * 110, y = 70 + rng() * 60, n = 4 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) { const s = 10 + rng() * 12; cl.push(ico(s, '#ffffff', Math.cos(a) * r + (k - n / 2) * s * 1.2, y + rng() * 6, Math.sin(a) * r + (rng() - 0.5) * s, 1.2, 0.6, 1, 1)); }
  }
  const clouds = new THREE.Mesh(merge(cl), materials.get('cloud')); clouds.name = 'clouds'; root.add(clouds);
  const sun = new THREE.DirectionalLight('#ffffff', 2); sun.name = 'sun';
  sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.near = 1; sc.far = 300;
  const target = new THREE.Object3D(); target.name = 'sun_target'; root.add(target); sun.target = target;
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1); hemi.name = 'hemi';
  root.add(sun, hemi);
  const api = {
    root, dome, stars, clouds, lights: { sun, hemi }, preset,
    setPreset(name) {
      const p = SKY_PRESETS[name] || SKY_PRESETS.day; api.preset = SKY_PRESETS[name] ? name : 'day';
      su.uTop.value.set(p.top); su.uHorizon.value.set(p.horizon); su.uBottom.value.set(p.bottom); su.uSunColor.value.set(p.sun); su.uSunSize.value = p.sunSize;
      ENV.sunDir.set(Math.cos(p.azim) * Math.cos(p.elev), Math.sin(p.elev), Math.sin(p.azim) * Math.cos(p.elev)).normalize();
      ENV.sunColor.set(p.sun); ENV.skyColor.set(p.horizon); ENV.light.value = p.light; ENV.night = p.stars;
      sun.color.set(p.sun); sun.intensity = p.sunI; sun.position.copy(ENV.sunDir).multiplyScalar(120);
      hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGround); hemi.intensity = p.hemiI;
      stars.visible = p.stars > 0; starMat.opacity = p.stars;
      materials.get('cloud').color.set(p.cloud); materials.get('cloud').emissive.set(p.cloud);
      materials.get('cloud').emissiveIntensity = name === 'night' ? 0.1 : 0.3;
      materials.get('lantern').emissiveIntensity = p.lantern;
      return api;
    },
    update(camera) { if (camera) { dome.position.set(camera.position.x, 0, camera.position.z); stars.position.copy(dome.position); } },
    dispose() { disposeTree(root); domeMat.dispose(); starMat.dispose(); sun.dispose(); hemi.dispose(); },
  };
  api.setPreset(preset);
  return api;
}
const sky = { create: createSky, presets: Object.keys(SKY_PRESETS) };

// ---------------------------------------------------------------- colour builder (direct vertex colours)
class ColorBuilder {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, color) { _c.set(color); this.pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) this.col.push(_c.r, _c.g, _c.b); }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); return g;
  }
}
function gableRoof(w, d, h, color, y = 0, overhang = 0.2) { // ridge along X
  const cb = new ColorBuilder(), x = w / 2 + overhang, z = d / 2 + overhang;
  const A = [-x, y, -z], B = [x, y, -z], C = [x, y, z], D = [-x, y, z], E = [-x, y + h, 0], F = [x, y + h, 0];
  cb.quad(D, C, F, E, color); cb.quad(B, A, E, F, color); cb.tri(A, D, E, color); cb.tri(C, B, F, color);
  cb.quad(A, B, C, D, color); // underside
  return cb.build();
}

// ---------------------------------------------------------------- props (instancing-ready)
function palmGeometry(seed = 1) {
  const rng = makeRng(seed + 101), parts = [];
  const h = 5 + rng() * 1.6, bend = 0.8 + rng() * 1.0, segs = 5, pts = [];
  for (let i = 0; i <= segs; i++) { const s = i / segs; pts.push([bend * s * s * 1.5, h * s, 0]); }
  for (let i = 0; i < segs; i++) parts.push(cylBetween(pts[i], pts[i + 1], lerp(0.24, 0.14, i / segs), 6, i % 2 ? '#8e6f45' : '#a4845a'));
  const top = pts[segs], cb = new ColorBuilder(), nF = 7;
  for (let k = 0; k < nF; k++) {
    const a = k / nF * Math.PI * 2 + rng() * 0.4, len = 2.6 + rng() * 0.8, ca = Math.cos(a), sa = Math.sin(a), col = k % 2 ? PAL.jungleLight : '#4f9e3c';
    const sec = [];
    for (let j = 0; j <= 4; j++) {
      const s = j / 4, r = s * len, y = top[1] + 0.7 * s - 1.8 * s * s, w = 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + 0.04;
      const cx = top[0] + ca * r, cz = top[2] + sa * r, px = -sa * w, pz = ca * w;
      sec.push([[cx + px, y - 0.12 * w, cz + pz], [cx, y + 0.1, cz], [cx - px, y - 0.12 * w, cz - pz]]);
    }
    for (let j = 0; j < 4; j++) { const p = sec[j], q = sec[j + 1]; cb.quad(p[0], p[1], q[1], q[0], col); cb.quad(p[1], p[2], q[2], q[1], col); }
  }
  parts.push(cb.build());
  for (let i = 0; i < 3; i++) parts.push(ico(0.2, '#6b4a24', top[0] + Math.cos(i * 2.1) * 0.22, top[1] - 0.25, Math.sin(i * 2.1) * 0.22));
  return merge(parts);
}
function clumpGeometry(seed = 1) {
  const rng = makeRng(seed + 202), parts = [], n = 3 + Math.floor(rng() * 3), cols = [PAL.jungle, PAL.jungleLight, PAL.jungleDark, '#4f9e3c'];
  for (let i = 0; i < n; i++) {
    const r = 0.9 + rng() * 0.9, a = rng() * Math.PI * 2, d = rng() * 1.2;
    const g = ico(r, cols[Math.floor(rng() * cols.length)], Math.cos(a) * d, r * 0.75 + rng() * 0.5, Math.sin(a) * d, 1, 0.85, 1, 0);
    parts.push(g);
  }
  return jitter(merge(parts), 0.25, rng);
}
function rockGeometry(seed = 1) {
  const rng = makeRng(seed + 303);
  const g = prep(new THREE.DodecahedronGeometry(1, 0), rng() > 0.5 ? PAL.stone : PAL.stoneDark);
  place(g, 0, 0.35, 0, 0, rng() * 6, 0, 1 + rng() * 0.4, 0.6 + rng() * 0.3, 1 + rng() * 0.3);
  return jitter(g, 0.3, rng);
}
const instProp = (geometry, matName = 'vcol') => ({ geometry, material: materials.get(matName), dispose() { geometry.dispose(); } });

function houseGeometry() {
  return merge([
    box(2.4, 2, 2.2, PAL.whitewash, 0, 1, 0),
    gableRoof(2.4, 2.2, 1.1, PAL.roof, 2),
    box(0.62, 1.15, 0.08, PAL.woodDark, 0, 0.58, 1.12),
    box(0.5, 0.5, 0.08, '#3d8f8f', -0.8, 1.3, 1.12), box(0.5, 0.5, 0.08, '#3d8f8f', 0.8, 1.3, 1.12),
    box(0.08, 0.5, 0.5, '#3d8f8f', 1.22, 1.3, 0), box(0.08, 0.5, 0.5, '#3d8f8f', -1.22, 1.3, 0),
  ]);
}
function churchGeometry() {
  return merge([
    box(3.6, 3.2, 6.5, PAL.whitewash, 0, 1.6, -0.6),
    gableRoof(6.5, 3.6, 1.6, PAL.roof, 3.2), // ridge along x -> rotate below
    box(2.4, 7, 2.4, PAL.whitewash, 0, 3.5, 3.4),
    box(0.9, 1.1, 2.5, '#3a2c1c', 0, 5.8, 3.4), box(2.5, 1.1, 0.9, '#3a2c1c', 0, 5.8, 3.4),
    cyl(0, 1.9, 2.2, 4, PAL.roof, 0, 8.1, 3.4, 0, Math.PI / 4),
    ico(0.22, PAL.brass, 0, 9.3, 3.4),
    box(1, 1.8, 0.1, PAL.woodDark, 0, 0.9, 4.62),
  ].map((g, i) => i === 1 ? place(g, 0, 0, -0.6, 0, Math.PI / 2, 0) : g));
}
function crateGeometry() {
  const parts = [box(1, 1, 1, PAL.woodLight, 0, 0.5, 0)], e = 0.52, t = 0.1, c = PAL.woodDark;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    parts.push(box(t, 1.04, t, c, a * (0.5 - t / 2 + 0.02), 0.5, b * (0.5 - t / 2 + 0.02)));
    parts.push(box(1.04, t, t, c, 0, 0.5 + a * (0.5 - t / 2 + 0.02), b * (0.5 - t / 2 + 0.02)));
    parts.push(box(t, t, 1.04, c, a * (0.5 - t / 2 + 0.02), 0.5 + b * (0.5 - t / 2 + 0.02), 0));
  }
  parts.push(box(0.06, 1.2, 0.12, c, 0, 0.5, e, 0, 0, 0.78), box(0.12, 1.2, 0.06, c, e, 0.5, 0, 0.78, 0, 0));
  return merge(parts);
}
function barrelGeometry() {
  const prof = []; for (let i = 0; i <= 6; i++) { const s = i / 6; prof.push(new THREE.Vector2(0.42 + Math.sin(s * Math.PI) * 0.1, s * 1.2)); }
  prof.unshift(new THREE.Vector2(0, 0)); prof.push(new THREE.Vector2(0, 1.2));
  return merge([
    prep(new THREE.LatheGeometry(prof, 10), PAL.wood),
    cyl(0.5, 0.5, 0.08, 10, PAL.iron, 0, 0.28, 0), cyl(0.5, 0.5, 0.08, 10, PAL.iron, 0, 0.92, 0),
    cyl(0.44, 0.44, 0.02, 10, PAL.woodLight, 0, 1.2, 0),
  ]);
}
function goldPileGeometry(seed = 5) {
  const rng = makeRng(seed), parts = [ico(0.5, PAL.brass, 0, 0.55, 0, 1.05, 0.35, 0.65, 1)];
  for (let i = 0; i < 10; i++) parts.push(cyl(0.09, 0.09, 0.03, 8, '#f2c65a', (rng() - 0.5) * 0.9, 0.62 + rng() * 0.14, (rng() - 0.5) * 0.5, rng() * 0.8, 0, rng() * 0.8));
  const gems = ['#e0403a', '#3a7ae0', '#3ac06a'];
  for (let i = 0; i < 3; i++) parts.push(place(prep(new THREE.OctahedronGeometry(0.1), gems[i]), (i - 1) * 0.3, 0.72, (rng() - 0.5) * 0.3));
  return merge(parts);
}
function dockGeometry(len = 10) {
  const parts = [], n = Math.round(len / 0.9);
  for (let i = 0; i < n; i++) parts.push(box(3, 0.14, 0.86, i % 2 ? PAL.woodLight : '#bf9560', 0, 0.8, i * 0.9 + 0.45));
  for (let i = 0; i <= 3; i++) for (const s of [-1, 1]) parts.push(cyl(0.14, 0.14, 3.2, 6, PAL.woodDark, s * 1.35, -0.8, i * len / 3));
  parts.push(cyl(0.16, 0.2, 0.5, 6, '#3a2c1c', 1.2, 1.1, len - 0.5), cyl(0.16, 0.2, 0.5, 6, '#3a2c1c', -1.2, 1.1, len - 0.5));
  return merge(parts);
}
function flagPole(nation, h = 5, fw = 1.6) {
  const g = new THREE.Group(); g.name = 'flagpole';
  g.add(vmesh(merge([cyl(0.07, 0.09, h, 6, '#ece4d2', 0, h / 2, 0), ico(0.14, PAL.brass, 0, h + 0.05, 0)]), 'pole'));
  const f = flagMesh(nation, fw); f.position.y = h - fw * 0.35; g.add(f); return g;
}

function createTown({ nation = 'spain', size = 'medium', seed = 3 } = {}) {
  const rng = makeRng(seed + 404), N = { small: 6, medium: 12, large: 20 }[size] || 12, Rr = { small: 9, medium: 13, large: 17 }[size] || 13;
  const g = withDispose(new THREE.Group()); g.name = 'town';
  g.add(vmesh(merge([cyl(Rr + 5, Rr + 6.5, 0.6, 28, '#e6d19a', 0, -0.3, 0), cyl(5, 5, 0.06, 20, PAL.stone, 0, 0.03, 0)]), 'ground'));
  const church = vmesh(churchGeometry(), 'church'); church.position.set(0, 0, -Rr * 0.5 - 2); g.add(church);
  const houses = new THREE.InstancedMesh(houseGeometry(), materials.inst('vcol', true), N); houses.name = 'houses';
  const tints = ['#ffffff', '#fff1c0', '#ffd8c8', '#d6ecff', '#e2f7d0', '#ffe6a8'];
  let placed = 0, tries = 0; const spots = [];
  while (placed < N && tries++ < 400) {
    const a = rng() * Math.PI * 2, d = 7 + rng() * (Rr - 6);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 4 && z < -Rr * 0.5 + 3) continue; // church
    if (Math.abs(x) < 2.6 && z > 0) continue;              // street to the dock
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 3.6)) continue;
    spots.push([x, z]);
    const sc = 0.9 + rng() * 0.35, sy = 0.9 + rng() * 0.5;
    _e.set(0, Math.atan2(-x, -z), 0); _q.setFromEuler(_e); _v1.set(x, 0, z); _s.set(sc, sc * sy, sc);
    houses.setMatrixAt(placed, _m4.compose(_v1, _q, _s)); houses.setColorAt(placed, _c.set(tints[Math.floor(rng() * tints.length)])); placed++;
  }
  houses.count = placed; houses.instanceMatrix.needsUpdate = true; if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
  houses.computeBoundingSphere(); g.add(houses);
  const fp = flagPole(nation, 7, 2); fp.position.set(3.2, 0, -Rr * 0.5 + 1); g.add(fp);
  const dk = vmesh(dockGeometry(10), 'dock'); dk.position.set(0, -0.2, Rr + 3); g.add(dk);
  const pg = palmGeometry(seed), palms = new THREE.InstancedMesh(pg, materials.inst('vcolDouble'), 8); palms.name = 'palms';
  for (let i = 0; i < 8; i++) { const a = rng() * Math.PI * 2, d = Rr + 1 + rng() * 3; _e.set(0, rng() * 6, 0); _q.setFromEuler(_e); _v1.set(Math.cos(a) * d, 0, Math.sin(a) * d); const s = 0.8 + rng() * 0.4; _s.set(s, s, s); palms.setMatrixAt(i, _m4.compose(_v1, _q, _s)); }
  palms.computeBoundingSphere(); g.add(palms);
  const clutter = merge([place(crateGeometry(), 1.8, 0, Rr + 1.5, 0, 0.3), place(crateGeometry(), 2.2, 1, Rr + 1.6, 0, 0.9, 0, 0.8, 0.8, 0.8), place(barrelGeometry(), -1.8, 0, Rr + 1.2), place(barrelGeometry(), -2.6, 0, Rr + 2)]);
  g.add(vmesh(clutter, 'clutter'));
  g.userData.radius = Rr + 5; g.userData.nation = nation;
  return g;
}
function createFort({ nation = 'spain' } = {}) {
  const S = 18, H = 3.4, T = 1.4, parts = [], rng = makeRng(77);
  const wall = (w, d, x, z) => parts.push(box(w, H, d, PAL.stone, x, H / 2, z));
  wall(S, T, 0, -S / 2); wall(T, S, -S / 2, 0); wall(T, S, S / 2, 0);
  const gap = 3.4, fw = (S - gap) / 2; wall(fw, T, -(gap / 2 + fw / 2), S / 2); wall(fw, T, gap / 2 + fw / 2, S / 2);
  for (const [x0, z0, x1, z1] of [[-S / 2, -S / 2, S / 2, -S / 2], [-S / 2, -S / 2, -S / 2, S / 2], [S / 2, -S / 2, S / 2, S / 2], [-S / 2, S / 2, -gap / 2 - 0.6, S / 2], [gap / 2 + 0.6, S / 2, S / 2, S / 2]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.6);
    for (let i = 1; i < n; i++) { const s = i / n; parts.push(box(0.7, 0.7, 0.7, i % 2 ? PAL.stone : PAL.stoneDark, lerp(x0, x1, s) + (z0 === z1 ? 0 : (x0 < 0 ? -0.35 : 0.35)), H + 0.35, lerp(z0, z1, s) + (z0 === z1 ? (z0 < 0 ? -0.35 : 0.35) : 0))); }
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push(cyl(2.7, 3.1, H + 0.8, 6, PAL.stoneDark, x * S / 2, (H + 0.8) / 2, z * S / 2));
    parts.push(cyl(2.9, 2.9, 0.4, 6, PAL.stone, x * S / 2, H + 1, z * S / 2));
  }
  parts.push(box(1.1, H + 1.4, T + 0.6, PAL.stoneDark, -gap / 2 - 0.4, (H + 1.4) / 2, S / 2), box(1.1, H + 1.4, T + 0.6, PAL.stoneDark, gap / 2 + 0.4, (H + 1.4) / 2, S / 2));
  parts.push(box(gap + 1.9, 1, T + 0.6, PAL.stoneDark, 0, H + 0.9, S / 2));
  parts.push(box(S - 1, 0.2, S - 1, '#dcc58c', 0, 0.1, 0));
  parts.push(box(5, 6, 5, PAL.whitewash, 0, 3, -S / 2 + 4), gableRoof(5, 5, 1.6, PAL.roof, 6));
  parts[parts.length - 1] = place(parts[parts.length - 1], 0, 0, -S / 2 + 4);
  const g = withDispose(new THREE.Group()); g.name = 'fort';
  g.add(vmesh(jitter(merge(parts), 0.001, rng), 'walls'));
  const gate = new THREE.Group(); gate.name = 'gate'; gate.position.set(0, 0, S / 2 + 0.2); g.add(gate);
  const leafGeo = merge([box(gap / 2, 2.8, 0.3, PAL.woodDark, gap / 4, 1.4, 0), box(gap / 2, 0.16, 0.34, PAL.iron, gap / 4, 0.7, 0), box(gap / 2, 0.16, 0.34, PAL.iron, gap / 4, 2.1, 0)]);
  const gl = new THREE.Group(); gl.name = 'gate_L'; gl.position.x = -gap / 2; gl.add(vmesh(leafGeo, 'gate_leaf_L'));
  const gr = new THREE.Group(); gr.name = 'gate_R'; gr.position.x = gap / 2; gr.scale.x = -1; const lr = vmesh(leafGeo.clone(), 'gate_leaf_R'); gr.add(lr);
  gate.add(gl, gr);
  const cannons = new THREE.InstancedMesh(cannonGeometry(), materials.inst('vcol'), 6); cannons.name = 'cannons';
  [[-1, 1, Math.PI * 0.75], [1, 1, Math.PI * 0.25], [-1, -1, -Math.PI * 0.75], [1, -1, -Math.PI * 0.25]].forEach(([x, z, a], i) => {
    _e.set(0, Math.PI / 2 - a, 0); _q.setFromEuler(_e); _v1.set(x * S / 2, H + 1.45, z * S / 2); _s.set(1.3, 1.3, 1.3); cannons.setMatrixAt(i, _m4.compose(_v1, _q, _s));
  });
  for (let i = 0; i < 2; i++) { _e.set(0, 0, 0); _q.setFromEuler(_e); _v1.set(i ? 5 : -5, H + 0.35, S / 2); _s.set(1.2, 1.2, 1.2); cannons.setMatrixAt(4 + i, _m4.compose(_v1, _q, _s)); }
  cannons.computeBoundingSphere(); g.add(cannons);
  const fp = flagPole(nation, 6, 2.4); fp.position.set(0, 7.2, -S / 2 + 4); g.add(fp);
  g.openGate = (p) => { gl.rotation.y = -clamp(p, 0, 1) * 1.6; gr.rotation.y = clamp(p, 0, 1) * 1.6; };
  g.userData.api = { gate, openGate: g.openGate }; g.userData.size = S;
  return g;
}
function simpleGroup(name, geo, mat = 'vcol') { const g = withDispose(new THREE.Group()); g.name = name; g.add(vmesh(geo, name + '_mesh', mat)); return g; }
function createChest({ open = false } = {}) {
  const g = withDispose(new THREE.Group()); g.name = 'chest';
  g.add(vmesh(merge([box(1.2, 0.7, 0.8, PAL.wood, 0, 0.35, 0), box(0.12, 0.72, 0.84, PAL.brass, -0.4, 0.35, 0), box(0.12, 0.72, 0.84, PAL.brass, 0.4, 0.35, 0), box(1.24, 0.1, 0.84, PAL.woodDark, 0, 0.05, 0)]), 'base'));
  const lid = new THREE.Group(); lid.name = 'lid'; lid.position.set(0, 0.7, -0.4); g.add(lid);
  const lidGeo = merge([
    place(prep(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI), PAL.woodLight), 0, 0, 0.4, 0, 0, Math.PI / 2),
    place(prep(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8, 1, false, 0, Math.PI), PAL.brass), -0.4, 0, 0.4, 0, 0, Math.PI / 2),
    place(prep(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8, 1, false, 0, Math.PI), PAL.brass), 0.4, 0, 0.4, 0, 0, Math.PI / 2),
    box(0.2, 0.26, 0.08, PAL.brass, 0, -0.05, 0.84),
  ]);
  lid.add(vmesh(lidGeo, 'lid_mesh', 'vcolDouble'));
  const gold = vmesh(goldPileGeometry(), 'gold'); gold.position.y = 0.08; g.add(gold);
  g.setOpen = (o) => { lid.rotation.x = o ? -1.9 : 0; gold.visible = !!o; };
  g.userData.api = { setOpen: g.setOpen }; g.setOpen(open);
  return g;
}
function createDigSite() {
  const parts = [
    cyl(2.6, 2.8, 0.1, 16, PAL.sand, 0, 0.05, 0),
    place(prep(new THREE.SphereGeometry(1.1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#e8cc86'), -0.6, 0.05, -0.4, 0, 0, 0, 1, 0.5, 1),
    cyl(0.6, 0.5, 0.06, 10, '#8a6a3a', 0.8, 0.11, 0.2),
    box(1.6, 0.04, 0.22, '#c0402e', 0.8, 0.14, 0.2, 0, 0.78), box(1.6, 0.04, 0.22, '#c0402e', 0.8, 0.14, 0.2, 0, -0.78),
    cylBetween([-0.2, 0.5, -0.2], [0.35, 1.9, -0.6], 0.05, 5, PAL.woodLight),
    box(0.36, 0.44, 0.05, PAL.iron, -0.28, 0.34, -0.15, 0.3, 0.6, 0.35),
    ico(0.15, '#dcc07e', 1.6, 0.15, -0.6), ico(0.12, '#dcc07e', 1.4, 0.13, 0.9), ico(0.18, '#dcc07e', -1.4, 0.15, 0.7),
  ];
  return simpleGroup('digSite', merge(parts));
}
const props = {
  palm: (seed = 1) => instProp(palmGeometry(seed), 'vcolDouble'),
  jungleClump: (seed = 1) => instProp(clumpGeometry(seed)),
  rock: (seed = 1) => instProp(rockGeometry(seed)),
  town: createTown, fort: createFort,
  dock: () => simpleGroup('dock', dockGeometry(10)),
  crate: () => simpleGroup('crate', crateGeometry()),
  barrel: () => simpleGroup('barrel', barrelGeometry()),
  chest: createChest, digSite: createDigSite, flagPole,
};

// ---------------------------------------------------------------- terrain
function scatter(group, geo, matName, name, count, placeFn) {
  const im = new THREE.InstancedMesh(geo, materials.inst(matName), count); im.name = name; let n = 0;
  for (let i = 0; i < count; i++) { const r = placeFn(i); if (!r) continue; _e.set(0, r.ry || 0, 0); _q.setFromEuler(_e); _v1.set(r.x, r.y, r.z); _s.set(r.s, r.s, r.s); im.setMatrixAt(n++, _m4.compose(_v1, _q, _s)); }
  im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); return im;
}
function createIsland({ radius = 30, height = 8, seed = 1, biome = 'jungle', flatten = [] } = {}) {
  const rng = makeRng(seed + 505), s = (seed * 13) % 997, arid = biome === 'arid';
  const coastR = (a) => radius * (1 + 0.3 * (fbm(Math.cos(a) * 1.2 + 5, Math.sin(a) * 1.2 + 5, s, 3) - 0.5) * 2);
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), f = r / coastR(a);
    let y;
    if (f > 1) y = Math.max(-4, -0.3 - (f - 1) * 10);
    else {
      const land = height * Math.pow(smooth(1.0, 0.4, f), 1.3) * (0.5 + 0.9 * fbm(x * 0.06 + 11, z * 0.06 + 3, s + 1, 3));
      const beach = lerp(0.9, 0.05, smooth(0.8, 1.0, f));
      y = Math.max(beach, land);
    }
    for (const fl of flatten) { const k = smooth(fl.r, fl.r * 0.55, Math.hypot(x - fl.x, z - fl.z)); y = lerp(y, fl.h != null ? fl.h : 1.0, k); }
    return y;
  };
  const FR = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.68, 0.75, 0.82, 0.88, 0.93, 0.97, 1.0, 1.03, 1.08, 1.16, 1.3], SEG = 48;
  const pos = [], col = [], idx = [];
  const colorFor = (x, y, z, f) => {
    if (y < 0.06) return _c.set(PAL.sandWet);
    if (f > 0.78 && y < 1.1) return _c.set(PAL.sand);
    const n = fbm(x * 0.15, z * 0.15, s + 9, 2);
    if (y > height * (arid ? 0.72 : 0.9)) return _c.set(n > 0.5 ? PAL.stone : PAL.stoneDark);
    if (arid) return _c.set(n > 0.62 ? '#8aa650' : n > 0.45 ? '#d4b777' : '#c2a064');
    return _c.set(n > 0.58 ? PAL.jungleLight : n > 0.42 ? PAL.jungle : PAL.jungleDark);
  };
  pos.push(0, heightAt(0, 0), 0); colorFor(0, pos[1], 0, 0); col.push(_c.r, _c.g, _c.b);
  for (let i = 1; i < FR.length; i++) for (let j = 0; j < SEG; j++) {
    const a = j / SEG * Math.PI * 2, R0 = coastR(a) * FR[i], x = Math.cos(a) * R0, z = Math.sin(a) * R0, y = heightAt(x, z);
    pos.push(x, y, z); colorFor(x, y, z, FR[i]); col.push(_c.r, _c.g, _c.b);
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
  for (let i = 1; i < FR.length - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + (j + 1) % SEG, c = a + SEG, d = b + SEG;
    idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const g = withDispose(new THREE.Group()); g.name = 'island';
  const ground = vmesh(geo, 'ground'); g.add(ground);
  const inFlat = (x, z) => flatten.some(fl => Math.hypot(x - fl.x, z - fl.z) < fl.r + 1);
  const pick = (f0, f1, minY) => { for (let k = 0; k < 6; k++) { const a = rng() * Math.PI * 2, f = lerp(f0, f1, rng()), R0 = coastR(a) * f, x = Math.cos(a) * R0, z = Math.sin(a) * R0, y = heightAt(x, z); if (y > minY && !inFlat(x, z)) return { x, y: y - 0.1, z, ry: rng() * 6, s: 0.75 + rng() * 0.5 }; } return null; };
  scatter(g, palmGeometry(seed), 'vcolDouble', 'palms', Math.round(radius * (arid ? 0.5 : 1.1)), () => pick(0.7, 0.9, 0.2));
  scatter(g, clumpGeometry(seed), 'vcol', 'jungle', Math.round(radius * (arid ? 0.3 : 1.6)), () => pick(0.1, 0.72, 0.8));
  scatter(g, rockGeometry(seed), 'vcol', 'rocks', Math.round(radius * (arid ? 0.6 : 0.25)), () => pick(0.2, 1.02, -1));
  const coast = []; for (let j = 0; j < 48; j++) { const a = j / 48 * Math.PI * 2, R0 = coastR(a); coast.push([Math.cos(a) * R0, Math.sin(a) * R0]); }
  g.userData.coast = coast; g.userData.radius = radius; g.userData.heightAt = heightAt;
  g.userData.shallowAt = (wx, wz) => {
    const x = wx - g.position.x, z = wz - g.position.z, f = Math.hypot(x, z) / coastR(Math.atan2(z, x));
    return f <= 1 ? 1 : clamp(1 - (f - 1) / 0.65, 0, 1);
  };
  return g;
}
function createCoastTile({ length = 60, depth = 30, seed = 2 } = {}) {
  const rng = makeRng(seed + 606), s = seed % 997, NX = 30, NZ = 14;
  const zc = (x) => (fbm(x * 0.05 + 3, 1, s, 2) - 0.5) * 8;
  const heightAt = (x, z) => {
    const c = zc(x); if (z > c) return Math.max(-4, -0.3 - (z - c) * 0.7);
    const land = smooth(c - 3, c - 16, z) * 7 * (0.4 + fbm(x * 0.07, z * 0.07, s + 2, 3));
    return Math.max(lerp(0.9, 0.05, smooth(c - 4, c, z)), land);
  };
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = -length / 2 + i / NX * length, z = -depth + j / NZ * (depth + 8), y = heightAt(x, z);
    pos.push(x, y, z);
    const n = fbm(x * 0.15, z * 0.15, s + 5, 2);
    if (y < 0.06) _c.set(PAL.sandWet); else if (z > zc(x) - 4.5 && y < 1.1) _c.set(PAL.sand); else _c.set(n > 0.55 ? PAL.jungleLight : n > 0.4 ? PAL.jungle : PAL.jungleDark);
    col.push(_c.r, _c.g, _c.b);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = withDispose(new THREE.Group()); g.name = 'coastTile'; g.add(vmesh(geo, 'ground'));
  const pk = (z0, z1, minY) => { const x = (rng() - 0.5) * length * 0.95, z = zc(x) - lerp(z0, z1, rng()), y = heightAt(x, z); return y > minY ? { x, y: y - 0.1, z, ry: rng() * 6, s: 0.75 + rng() * 0.5 } : null; };
  scatter(g, palmGeometry(seed), 'vcolDouble', 'palms', Math.round(length * 0.35), () => pk(3, 7, 0.3));
  scatter(g, clumpGeometry(seed), 'vcol', 'jungle', Math.round(length * 0.6), () => pk(7, depth - 2, 0.8));
  const coast = []; for (let i = 0; i <= 20; i++) { const x = -length / 2 + i / 20 * length; coast.push([x, zc(x)]); }
  g.userData.coast = coast; g.userData.heightAt = heightAt;
  g.userData.shallowAt = (wx, wz) => { const x = wx - g.position.x, z = wz - g.position.z; if (Math.abs(x) > length / 2) return 0; if (z < -depth) return 0; const d = z - zc(x); return d <= 0 ? 1 : clamp(1 - d / 14, 0, 1); };
  return g;
}
const terrain = { island: createIsland, coastTile: createCoastTile };

// ---------------------------------------------------------------- characters
function mergeTagged(list) { // list of [geo, tag]
  const tags = []; let off = 0;
  for (const [g, tag] of list) { const n = g.attributes.position.count; if (tag) tags.push({ tag, start: off, count: n }); off += n; }
  const m = merge(list.map(l => l[0])); m.userData.tags = tags; return m;
}
function recolorTag(geo, tag, color) {
  const c = geo.attributes.color; _c.set(color);
  for (const t of geo.userData.tags || []) if (t.tag === tag) for (let i = t.start; i < t.start + t.count; i++) c.setXYZ(i, _c.r, _c.g, _c.b);
  c.needsUpdate = true;
}
const _swordCache = {};
function swordGeometry(type) {
  if (_swordCache[type]) return _swordCache[type];
  let parts;
  if (type === 'cutlass') {
    parts = [box(0.045, 0.045, 0.16, '#3a2a1a', 0, 0, -0.06), box(0.03, 0.2, 0.03, PAL.brass, 0, -0.08, 0.03), box(0.03, 0.03, 0.2, PAL.brass, 0, -0.17, -0.06),
      box(0.015, 0.085, 0.3, PAL.steel, 0, 0, 0.2), box(0.015, 0.09, 0.28, PAL.steel, 0, 0.03, 0.47, -0.18), box(0.015, 0.07, 0.2, PAL.steel, 0, 0.09, 0.67, -0.4)];
  } else if (type === 'longsword') {
    parts = [box(0.045, 0.045, 0.26, '#3a2a1a', 0, 0, -0.1), ico(0.045, PAL.brass, 0, 0, -0.25), box(0.34, 0.045, 0.05, PAL.brass, 0, 0, 0.04),
      box(0.02, 0.07, 1.05, PAL.steel, 0, 0, 0.6), place(prep(new THREE.ConeGeometry(0.05, 0.14, 4), PAL.steel), 0, 0, 1.19, Math.PI / 2, 0, Math.PI / 4, 1, 1, 0.3)];
  } else { // rapier
    parts = [box(0.04, 0.04, 0.16, '#3a2a1a', 0, 0, -0.07), ico(0.04, PAL.brass, 0, 0, -0.16), box(0.24, 0.03, 0.03, PAL.brass, 0, 0, 0.03),
      place(prep(new THREE.SphereGeometry(0.085, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), PAL.brass), 0, 0, 0.05, Math.PI / 2),
      box(0.022, 0.022, 1.0, PAL.steel, 0, 0, 0.58)];
  }
  const g = merge(parts); g.userData.shared = true; _swordCache[type] = g; return g;
}
let _musketGeo = null;
function musketGeometry() {
  if (_musketGeo) return _musketGeo;
  _musketGeo = merge([box(0.07, 0.12, 0.45, PAL.woodDark, 0, -0.03, -0.2), box(0.05, 0.06, 0.5, PAL.wood, 0, 0, 0.25), cyl(0.025, 0.025, 1.1, 5, PAL.iron, 0, 0.03, 0.55, Math.PI / 2)]);
  _musketGeo.userData.shared = true; return _musketGeo;
}
const HAIR = { brown: '#5a3a1e', blond: '#c9974a', black: '#1e1a18', red: '#9a4a22' };
function hairForAge(base, age) {
  const t = clamp((age - 32) / 24, 0, 1); _c.set(base); const r = _c.r, g = _c.g, b = _c.b; _c.set('#d8d8d4');
  return new THREE.Color(lerp(r, _c.r, t), lerp(g, _c.g, t), lerp(b, _c.b, t));
}
function buildRig(sp) {
  const root = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; root.add(body);
  const J = { root, body };
  // legs
  const legGeo = (peg) => {
    const l = [[box(0.21, 0.55, 0.23, sp.trousers, 0, -0.275, 0)]];
    if (peg) l.push([cyl(0.045, 0.06, 0.42, 6, PAL.woodLight, 0, -0.74, 0)]);
    else l.push([box(0.22, 0.4, 0.24, sp.boots, 0, -0.74, 0)], [box(0.22, 0.12, 0.34, sp.boots, 0, -0.89, 0.05)]);
    return mergeTagged(l);
  };
  for (const [nm, x, peg] of [['leg_L', 0.13, false], ['leg_R', -0.13, !!sp.peg]]) {
    const j = new THREE.Group(); j.name = nm; j.position.set(x, 0.95, 0); j.add(vmesh(legGeo(peg), nm + '_mesh')); body.add(j); J[nm] = j;
  }
  // torso
  const torso = new THREE.Group(); torso.name = 'torso'; torso.position.set(0, 0.95, 0); body.add(torso); J.torso = torso;
  const tp = [[box(0.46, 0.2, 0.28, sp.trousers, 0, 0.05, 0)]];
  if (sp.stripes) { for (let i = 0; i < 4; i++) tp.push([box(0.5, 0.155, 0.29, i % 2 ? sp.stripes : sp.coat, 0, 0.16 + i * 0.155, 0)]); }
  else {
    tp.push([box(0.52, 0.62, 0.3, sp.coat, 0, 0.4, 0)], [box(0.56, 0.34, 0.32, sp.coat, 0, -0.06, -0.01)]);
    tp.push([box(0.2, 0.42, 0.02, sp.shirt || '#f4efe2', 0, 0.47, 0.155)]);
    if (sp.trim) tp.push([box(0.04, 0.6, 0.02, sp.trim, 0.13, 0.4, 0.156)], [box(0.04, 0.6, 0.02, sp.trim, -0.13, 0.4, 0.156)]);
  }
  tp.push([box(0.54, 0.08, 0.32, sp.sash || PAL.black, 0, 0.14, 0)], [box(0.1, 0.09, 0.03, PAL.brass, 0, 0.14, 0.165)]);
  if (sp.crossbelts) tp.push([box(0.07, 0.72, 0.02, '#f4efe2', 0, 0.42, 0.16, 0, 0, 0.62)], [box(0.07, 0.72, 0.02, '#f4efe2', 0, 0.42, 0.16, 0, 0, -0.62)]);
  if (sp.musketBack) { const m = musketGeometry().clone(); m.userData = {}; m.rotateX(-Math.PI / 2); m.rotateZ(0.55); m.translate(0.05, 0.1, -0.2); tp.push([m]); }
  torso.add(vmesh(mergeTagged(tp), 'torso_mesh'));
  // head
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.68, 0); torso.add(head); J.head = head;
  const hp = [[box(0.14, 0.1, 0.14, sp.skin, 0, 0.02, 0)], [box(0.3, 0.32, 0.3, sp.skin, 0, 0.21, 0)], [box(0.06, 0.08, 0.07, sp.skin, 0, 0.18, 0.17)],
    [box(0.05, 0.05, 0.02, '#1a1410', 0.075, 0.25, 0.152)]];
  if (sp.patch) hp.push([box(0.09, 0.08, 0.025, '#111', -0.075, 0.25, 0.155)], [box(0.32, 0.025, 0.31, '#111', 0, 0.27, 0.0, 0.25, 0, 0)]);
  else hp.push([box(0.05, 0.05, 0.02, '#1a1410', -0.075, 0.25, 0.152)]);
  hp.push([box(0.32, 0.24, 0.1, sp.hair, 0, 0.23, -0.12), 'hair'], [box(0.32, 0.06, 0.32, sp.hair, 0, 0.38, 0), 'hair']);
  if (sp.beard) hp.push([box(0.28, 0.14, 0.08, sp.hair, 0, 0.08, 0.13), 'hair']);
  const H = sp.hat;
  if (H === 'tricorn') hp.push([cyl(0.37, 0.37, 0.04, 3, sp.trim || sp.hatColor, 0, 0.42, 0)], [cyl(0.34, 0.34, 0.1, 3, sp.hatColor, 0, 0.46, 0)], [cyl(0.15, 0.17, 0.14, 8, sp.hatColor, 0, 0.55, 0)]);
  else if (H === 'wide') hp.push([cyl(0.42, 0.42, 0.04, 10, sp.hatColor, 0, 0.42, 0)], [cyl(0.16, 0.19, 0.2, 8, sp.hatColor, 0, 0.53, 0)], [cyl(0.195, 0.195, 0.05, 8, '#3a2a1a', 0, 0.46, 0)], [box(0.04, 0.34, 0.1, sp.feather || '#f2c94a', 0.18, 0.62, -0.05, -0.5, 0, -0.35)]);
  else if (H === 'bandana') hp.push([box(0.34, 0.13, 0.34, sp.hatColor, 0, 0.37, 0)], [box(0.08, 0.16, 0.05, sp.hatColor, 0.05, 0.26, -0.18, 0.3, 0, 0.3)]);
  else if (H === 'cap') hp.push([cyl(0.165, 0.175, 0.14, 8, sp.hatColor, 0, 0.41, 0)], [ico(0.06, sp.hatColor, 0, 0.5, 0)]);
  else if (H === 'helmet') hp.push([place(prep(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), PAL.steel), 0, 0.37, 0)], [cyl(0.3, 0.3, 0.03, 10, PAL.steel, 0, 0.38, 0)], [box(0.03, 0.12, 0.34, PAL.steel, 0, 0.55, 0)]);
  const headGeo = mergeTagged(hp); head.add(vmesh(headGeo, 'head_mesh')); J.headGeo = headGeo;
  // arms
  for (const [nm, x] of [['arm_L', 0.33], ['arm_R', -0.33]]) {
    const j = new THREE.Group(); j.name = nm; j.position.set(x, 0.6, 0); torso.add(j); J[nm] = j;
    const ap = sp.bareArms
      ? [[box(0.16, 0.22, 0.17, sp.stripes ? sp.coat : sp.coat, 0, -0.1, 0)], [box(0.13, 0.36, 0.14, sp.skin, 0, -0.4, 0)], [box(0.13, 0.13, 0.13, sp.skin, 0, -0.63, 0)]]
      : [[box(0.15, 0.52, 0.17, sp.coat, 0, -0.26, 0)], [box(0.17, 0.08, 0.19, sp.cuff || '#f4efe2', 0, -0.52, 0)], [box(0.12, 0.13, 0.13, sp.skin, 0, -0.62, 0)]];
    j.add(vmesh(mergeTagged(ap), nm + '_mesh'));
  }
  const hand = new THREE.Group(); hand.name = 'hand_R'; hand.position.set(0, -0.64, 0.02); J.arm_R.add(hand); J.hand_R = hand;
  const handL = new THREE.Group(); handL.name = 'hand_L'; handL.position.set(0, -0.64, 0.02); J.arm_L.add(handL); J.hand_L = handL;
  return J;
}
// ---- poses
const G = { by: 0, bz: 0, bx: 0, tx: 0, ty: 0, tz: 0, hx: 0, hy: 0, arx: -0.55, ary: 0, arz: -0.1, alx: -0.25, alz: 0.35, llx: 0.12, lrx: -0.12, llz: 0.05, lrz: -0.05, hdx: 0, hdz: 0 };
const POSE_KEYS = Object.keys(G);
const K = (t, p) => ({ t, p: Object.assign({}, G, p) });
const ACTIONS = {
  strikeHigh: { dur: 0.5, keys: [K(0, {}), K(0.35, { arx: -2.9, ty: 0.35, tx: -0.12, alx: -0.7, alz: 0.6 }), K(0.6, { arx: -0.7, ty: -0.35, tx: 0.3, bz: 0.18, llx: -0.45, lrx: 0.3, hdx: 0.3 }), K(1, {})] },
  strikeMid: { dur: 0.45, keys: [K(0, {}), K(0.3, { arx: -1.5, arz: -1.2, ty: 0.6, alz: 0.7 }), K(0.58, { arx: -1.5, arz: 0.5, ty: -0.6, bz: 0.18, llx: -0.4, lrx: 0.25 }), K(1, {})] },
  strikeLow: { dur: 0.5, keys: [K(0, {}), K(0.3, { arx: -0.2, ty: 0.3, alz: 0.7 }), K(0.58, { arx: -1.1, tx: 0.45, bx: 0.1, by: -0.14, bz: 0.28, llx: -0.8, lrx: 0.5, hdx: 0.7, alx: 0.4, alz: 0.9 }), K(1, {})] },
  parryHigh: { dur: 0.45, keys: [K(0, {}), K(0.3, { arx: -2.55, arz: 0.25, hdz: 1.4, ty: -0.12, alz: 0.6 }), K(0.75, { arx: -2.55, arz: 0.25, hdz: 1.4, ty: -0.12, alz: 0.6 }), K(1, {})] },
  parryMid: { dur: 0.4, keys: [K(0, {}), K(0.3, { arx: -1.2, arz: 0.35, hdx: -0.4, ty: -0.3, alz: 0.6 }), K(0.75, { arx: -1.2, arz: 0.35, hdx: -0.4, ty: -0.3, alz: 0.6 }), K(1, {})] },
  parryLow: { dur: 0.4, keys: [K(0, {}), K(0.3, { arx: -0.6, arz: 0.3, hdx: 1.25, tx: 0.2, by: -0.08, alz: 0.6 }), K(0.75, { arx: -0.6, arz: 0.3, hdx: 1.25, tx: 0.2, by: -0.08, alz: 0.6 }), K(1, {})] },
  hit: { dur: 0.4, keys: [K(0, {}), K(0.18, { tx: -0.38, hx: -0.35, bz: -0.14, arx: -0.15, arz: -0.5, alx: 0.2, alz: 0.7 }), K(1, {})] },
  stagger: { dur: 0.95, keys: [K(0, {}), K(0.18, { tx: -0.42, bz: -0.3, tz: 0.22, hx: -0.3, arx: 0, arz: -0.7, alz: 1.0, llx: 0.4, lrx: -0.35 }), K(0.5, { tx: -0.2, bz: -0.5, tz: -0.25, llx: -0.35, lrx: 0.45, arz: -0.9, alz: 0.8 }), K(0.78, { tx: -0.1, bz: -0.55, tz: 0.1 }), K(1, { bz: -0.5 })] },
};
function loopPose(name, t, out) {
  Object.assign(out, G);
  if (name === 'walk') {
    const w = t * 7; out.llx = Math.sin(w) * 0.6; out.lrx = -Math.sin(w) * 0.6; out.llz = out.lrz = 0;
    out.alx = -Math.sin(w) * 0.5; out.alz = 0.15; out.arx = -0.45 + Math.sin(w) * 0.25; out.by = Math.abs(Math.sin(w)) * 0.05; out.ty = Math.sin(w) * 0.08;
  } else if (name === 'cheer') {
    out.arx = -2.8 + Math.sin(t * 9) * 0.3; out.alx = -2.8 + Math.sin(t * 9 + 3) * 0.3; out.arz = -0.35; out.alz = 0.35;
    out.by = Math.abs(Math.sin(t * 5)) * 0.16; out.hx = -0.2; out.hdx = -0.6;
  } else if (name === 'surrender') {
    out.arx = -3.0; out.alx = -3.0; out.arz = -0.4 + Math.sin(t * 14) * 0.03; out.alz = 0.4; out.tx = 0.08; out.hx = 0.25; out.by = -0.03; out.llx = 0.05; out.lrx = -0.05;
  } else { // idle
    out.by = Math.sin(t * 2) * 0.012; out.tx = Math.sin(t * 2) * 0.02; out.arx = -0.55 + Math.sin(t * 1.6) * 0.05; out.hy = Math.sin(t * 0.5) * 0.15;
  }
  return out;
}
function samplePose(act, p, out) {
  const keys = act.keys; let i = 0; while (i < keys.length - 2 && p > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], u = smooth(0, 1, (p - a.t) / Math.max(1e-4, b.t - a.t));
  for (const k of POSE_KEYS) out[k] = lerp(a.p[k], b.p[k], u);
  return out;
}
function animate(J, st) { // applies st.cur to joints
  const P = st.cur, sl = st.slouch;
  J.body.position.y = P.by - sl * 0.08; J.body.position.z = P.bz; J.body.rotation.x = P.bx;
  J.torso.rotation.set(P.tx + sl, P.ty, P.tz); J.head.rotation.set(P.hx - sl * 0.6, P.hy, 0);
  J.arm_R.rotation.set(P.arx, P.ary, P.arz); J.arm_L.rotation.set(P.alx, 0, P.alz);
  { J.leg_L.rotation.set(P.llx, 0, P.llz); J.leg_R.rotation.set(P.lrx, 0, P.lrz); }
  J.hand_R.rotation.set(P.hdx, 0, P.hdz);
}
const LOOPS = ['idle', 'walk', 'cheer', 'surrender'];
const ACTION_NAMES = ['idle', 'walk', 'strikeHigh', 'strikeMid', 'strikeLow', 'parryHigh', 'parryMid', 'parryLow', 'hit', 'stagger', 'cheer', 'surrender'];
function makeCharacter(name, sp, opts = {}) {
  const J = buildRig(sp), g = J.root; g.name = name; g.dispose = () => disposeTree(g);
  const st = { action: 'idle', t: 0, p: 0, cur: Object.assign({}, G), tgt: Object.assign({}, G), slouch: 0, age: sp.age || 25 };
  let sword = null, weapon = null;
  g.setWeapon = (type) => {
    if (sword) { J.hand_R.remove(sword); sword = null; }
    weapon = type || null;
    if (weapon) { sword = new THREE.Mesh(swordGeometry(weapon), materials.get('vcol')); sword.name = 'sword'; J.hand_R.add(sword); }
    return g;
  };
  g.setAge = (age) => {
    st.age = age; st.slouch = clamp((age - 30) / 28, 0, 1) * 0.24;
    recolorTag(J.headGeo, 'hair', hairForAge(sp.hair, age)); return g;
  };
  g.setAction = (a, o = {}) => {
    if (!ACTIONS[a] && !LOOPS.includes(a)) a = 'idle';
    if (a === st.action && !o.restart && LOOPS.includes(a)) return g;
    st.action = a; st.p = 0; if (sword) sword.visible = a !== 'surrender'; return g;
  };
  g.getAction = () => st.action;
  g.update = (dt = 0.016) => {
    st.t += dt;
    const act = ACTIONS[st.action];
    if (act) {
      st.p += dt / act.dur; samplePose(act, Math.min(1, st.p), st.tgt);
      if (st.p >= 1) { const done = st.action; st.action = 'idle'; if (g.onActionEnd) g.onActionEnd(done); }
    } else loopPose(st.action, st.t, st.tgt);
    const k = 1 - Math.exp(-dt * 26);
    for (const key of POSE_KEYS) st.cur[key] += (st.tgt[key] - st.cur[key]) * k;
    animate(J, st);
    if (g.onUpdate) g.onUpdate(dt, st);
  };
  g.joints = J; g.userData.api = g; g.userData.actions = ACTION_NAMES;
  g.setAge(st.age); g.setWeapon(opts.weapon === undefined ? 'cutlass' : opts.weapon);
  loopPose('idle', 0, st.cur); animate(J, st);
  return g;
}
const SKINS = ['#f0c29a', '#d9a47a', '#b57a52', '#8a5a3a'];
function captain({ who = 'caleb', age = 20, outfit } = {}) {
  let sp, weapon;
  if (who === 'ezra') { sp = { coat: '#2f8a4a', trousers: '#3a5a8a', boots: '#3a2616', skin: '#f0c29a', hair: HAIR.blond, hat: 'wide', hatColor: '#8a5a2b', feather: '#f2c94a', trim: '#e0b451', sash: '#c9402e', cuff: '#f4efe2' }; weapon = 'cutlass'; }
  else if (who === 'enemy') { sp = { coat: '#5a3a7a', trousers: '#2a2a30', boots: '#1a1512', skin: '#e3b08a', hair: HAIR.black, hat: 'tricorn', hatColor: '#1a1a1a', trim: '#c0c0c0', sash: '#8a1f1f', peg: true, patch: true, beard: true }; weapon = 'longsword'; }
  else { sp = { coat: '#c23a2e', trousers: '#efe3c4', boots: '#1f1914', skin: '#f2c7a0', hair: HAIR.brown, hat: 'tricorn', hatColor: '#1c1c1c', trim: '#e0b451', sash: '#1c1c1c', cuff: '#e0b451' }; weapon = 'rapier'; }
  if (outfit && typeof outfit === 'object') Object.assign(sp, outfit);
  sp.age = age;
  const c = makeCharacter('captain_' + who, sp, { weapon });
  c.userData.who = who; return c;
}
function sailorSpec(seed) {
  const rng = makeRng(seed + 808), hats = ['bandana', 'cap', 'bandana', 'none'], hc = ['#c9402e', '#2f5bb0', '#e0b451', '#3c8f3a', '#f4efe2'];
  return { coat: '#f4efe2', stripes: rng() > 0.4 ? (rng() > 0.5 ? '#2f5bb0' : '#c9402e') : null, trousers: ['#c9b489', '#4a5f8a', '#efe3c4', '#8a6038'][Math.floor(rng() * 4)], boots: SKINS[0], skin: SKINS[Math.floor(rng() * SKINS.length)],
    hair: [HAIR.brown, HAIR.black, HAIR.red, HAIR.blond][Math.floor(rng() * 4)], hat: hats[Math.floor(rng() * hats.length)], hatColor: hc[Math.floor(rng() * hc.length)], bareArms: true, beard: rng() > 0.6, sash: '#8a1f1f', age: 25 };
}
function sailor(seed = 1) {
  if (typeof seed === 'object') seed = seed.seed || 1;
  const sp = sailorSpec(seed); sp.boots = sp.skin;
  return makeCharacter('sailor', sp, { weapon: 'cutlass' });
}
function soldierSpec(nation) {
  return { coat: nation === 'pirate' ? '#4a4a4a' : nationHex(nation), trousers: '#e8e2d2', boots: '#1f1914', skin: '#f0c29a', hair: HAIR.brown, hat: nation === 'spain' ? 'helmet' : 'tricorn', hatColor: '#1c1c1c', trim: nation === 'england' ? '#f4efe2' : '#e0b451', crossbelts: true, sash: '#f4efe2', cuff: '#f4efe2', age: 26 };
}
function soldier({ nation = 'spain', musket = true } = {}) {
  const sp = soldierSpec(nation); sp.musketBack = musket;
  const s = makeCharacter('soldier', sp, { weapon: 'rapier' }); s.userData.nation = nation; return s;
}
const characters = { captain, sailor, soldier, actions: ACTION_NAMES, swordGeometry };

// ---------------------------------------------------------------- FX (pooled Points, no per-frame allocation)
const FX_VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale; varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FX_FS = `
uniform sampler2D uMap; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(vC * t.rgb, a);
  #include <colorspace_fragment>
}`;
const _fxScale = { value: 830 }; // ~ viewportHeightPx * 0.5 / tan(fov/2)
class Particles {
  constructor(scene, name, cfg) {
    this.cfg = cfg; const cap = this.cap = cfg.cap;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.age = new Float32Array(cap); this.life = new Float32Array(cap); this.base = new Float32Array(cap); this.a0 = new Float32Array(cap);
    this.cursor = 0; this.alive = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha); g.setAttribute('aColor', this.aCol);
    const m = new THREE.ShaderMaterial({ uniforms: { uMap: { value: cfg.tex }, uScale: _fxScale }, vertexShader: FX_VS, fragmentShader: FX_FS, transparent: true, depthWrite: false, blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m); this.points.name = 'fx_' + name; this.points.frustumCulled = false; this.points.renderOrder = 5;
    this.color = new THREE.Color(cfg.color || '#ffffff');
    if (scene) scene.add(this.points);
  }
  spawn(p, o = {}) {
    const c = this.cfg, n = o.count != null ? o.count : c.count, sp = o.speed != null ? o.speed : c.speed, spread = o.spread != null ? o.spread : (c.spread != null ? c.spread : 1);
    const sz = (o.size != null ? o.size : 1) * c.size[0], rad = o.radius != null ? o.radius : (c.radius || 0);
    if (o.color) _c.set(o.color); else _c.copy(this.color);
    const dir = o.dir;
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.cap;
      if (this.life[i] <= 0) this.alive++;
      const i3 = i * 3;
      let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
      this.pos[i3] = p.x + rx * rad; this.pos[i3 + 1] = p.y + (c.mode === 'flat' ? 0 : ry * rad * 0.5); this.pos[i3 + 2] = p.z + rz * rad;
      let vx, vy, vz;
      if (dir) { vx = dir.x + rx * spread; vy = dir.y + ry * spread; vz = dir.z + rz * spread; }
      else if (c.mode === 'up') { vx = rx * spread; vy = 1 + Math.random() * 0.5; vz = rz * spread; }
      else if (c.mode === 'flat') { vx = rx; vy = 0; vz = rz; }
      else { vx = rx; vy = ry; vz = rz; const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l; }
      const s = sp * (0.6 + Math.random() * 0.6);
      this.vel[i3] = vx * s; this.vel[i3 + 1] = vy * s; this.vel[i3 + 2] = vz * s;
      this.age[i] = 0; this.life[i] = c.life[0] + Math.random() * (c.life[1] - c.life[0]);
      this.base[i] = sz * (0.75 + Math.random() * 0.5); this.a0[i] = c.alpha != null ? c.alpha : 1;
      const v = c.vary ? 1 - Math.random() * c.vary : 1;
      if (c.rainbow && !o.color) { _c.setHSL(Math.random(), 0.9, 0.62); this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b; if (o.color) _c.set(o.color); else _c.copy(this.color); }
      else { this.col[i3] = _c.r * v; this.col[i3 + 1] = _c.g * v; this.col[i3 + 2] = _c.b * v; }
      this.size[i] = this.base[i]; this.alpha[i] = 0;
    }
    this.aCol.needsUpdate = true;
  }
  update(dt) {
    if (this.alive <= 0) return;
    const c = this.cfg, g = c.gravity || 0, dr = Math.max(0, 1 - (c.drag || 0) * dt), s1 = c.size[1] / c.size[0];
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      const a = (this.age[i] += dt);
      if (a >= this.life[i]) { this.life[i] = 0; this.alpha[i] = 0; this.size[i] = 0; this.alive--; continue; }
      const i3 = i * 3;
      this.vel[i3 + 1] -= g * dt; this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (c.floor != null && this.pos[i3 + 1] < c.floor) { this.pos[i3 + 1] = c.floor; this.vel[i3 + 1] = 0; }
      const k = a / this.life[i];
      this.size[i] = this.base[i] * lerp(1, s1, k);
      let al = this.a0[i] * Math.min(1, k * 8) * (1 - k * k);
      if (c.twinkle) al *= 0.55 + 0.45 * Math.sin(a * 30 + i);
      this.alpha[i] = al;
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.alive = 0; this.aAlpha.needsUpdate = true; }
  dispose() { this.points.geometry.dispose(); this.points.material.dispose(); if (this.points.parent) this.points.parent.remove(this.points); }
}
const FX_CFG = () => ({
  cannonSmoke: { cap: 260, tex: textures.puff(), color: '#f2f0ea', vary: 0.18, gravity: -0.5, drag: 1.4, life: [1.8, 2.8], size: [2.2, 7], count: 12, speed: 3, spread: 0.45, mode: 'up', alpha: 0.8, radius: 0.4 },
  muzzleFlash: { cap: 60, tex: textures.spark(), additive: true, color: '#ffc850', drag: 6, life: [0.08, 0.16], size: [3.2, 1.2], count: 5, speed: 5, spread: 0.3 },
  splash: { cap: 420, tex: textures.puff(), color: '#ffffff', gravity: 12, drag: 0.4, life: [0.6, 1.1], size: [0.9, 1.7], count: 28, speed: 6.5, spread: 0.45, mode: 'up', radius: 0.4 },
  woodSplinters: { cap: 240, tex: textures.chip(), color: PAL.woodLight, vary: 0.35, gravity: 12, drag: 0.4, life: [0.8, 1.4], size: [0.55, 0.45], count: 18, speed: 7, radius: 0.3 },
  wake: { cap: 520, tex: textures.puff(), color: '#ffffff', drag: 1.5, life: [2.2, 3.4], size: [1.1, 3.6], count: 2, speed: 0.7, mode: 'flat', alpha: 0.55, radius: 0.5 },
  sinkBubbles: { cap: 240, tex: textures.bubble(), color: '#e8fbff', gravity: -3, drag: 1.2, life: [0.9, 1.7], size: [0.5, 0.9], count: 8, speed: 1, mode: 'up', spread: 0.4, radius: 2.5 },
  sparkle: { cap: 200, tex: textures.spark(), additive: true, color: '#ffd76a', gravity: -0.6, drag: 2, life: [0.6, 1.2], size: [1.3, 0.2], count: 10, speed: 1.2, twinkle: true, radius: 0.8 },
  fireworks: { cap: 900, tex: textures.spark(), additive: true, color: '#ffd76a', rainbow: true, gravity: 3, drag: 1.1, life: [1.2, 2.0], size: [1.6, 0.5], count: 90, speed: 12, twinkle: true },
});
function createFX(scene) {
  const cfg = FX_CFG(), out = { systems: [] };
  for (const k of Object.keys(cfg)) { const p = new Particles(scene, k, cfg[k]); out[k] = p; out.systems.push(p); }
  // cannonballs
  const CAP = 48, g = 14;
  const ballGeo = new THREE.IcosahedronGeometry(0.24, 1);
  const im = new THREE.InstancedMesh(ballGeo, materials.inst('iron'), CAP); im.name = 'fx_cannonballs'; im.count = 0; im.frustumCulled = false;
  if (scene) scene.add(im);
  const pool = []; for (let i = 0; i < CAP; i++) pool.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), owner: null, onHit: null, age: 0, alive: false });
  const active = [];
  const cb = {
    mesh: im, active, gravity: g, seaLevel: 0, water: null, autoSplash: true,
    fire(from, dir, speed = 30, onHit = null, owner = null) {
      let b = null; for (let i = 0; i < CAP; i++) if (!pool[i].alive) { b = pool[i]; break; }
      if (!b) return null;
      b.alive = true; b.age = 0; b.owner = owner; b.onHit = onHit; b.pos.copy(from); b.vel.copy(dir).normalize().multiplyScalar(speed);
      active.push(b); return b;
    },
    kill(b) { const i = active.indexOf(b); if (i >= 0) { active[i] = active[active.length - 1]; active.length--; } b.alive = false; },
    // launch direction to hit `to` from `from` with `speed` (low arc). Writes into out (Vector3) and returns it.
    solve(from, to, speed, out = new THREE.Vector3()) {
      const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-3, h = to.y - from.y, v2 = speed * speed;
      const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
      const th = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * d));
      return out.set(dx / d * Math.cos(th), Math.sin(th), dz / d * Math.cos(th));
    },
    update(dt, t) {
      for (let i = active.length - 1; i >= 0; i--) {
        const b = active[i]; b.age += dt; b.vel.y -= g * dt; b.pos.addScaledVector(b.vel, dt);
        const sea = cb.water ? cb.water.getHeight(b.pos.x, b.pos.z, t) : cb.seaLevel;
        if (b.pos.y < sea || b.age > 12) {
          if (cb.autoSplash && b.age <= 12) { _v3.set(b.pos.x, sea, b.pos.z); out.splash.spawn(_v3); }
          const cbk = b.onHit; active[i] = active[active.length - 1]; active.length--; b.alive = false;
          if (cbk) cbk(b, 'water');
        }
      }
      for (let i = 0; i < active.length; i++) { _m4.makeTranslation(active[i].pos.x, active[i].pos.y, active[i].pos.z); im.setMatrixAt(i, _m4); }
      im.count = active.length; im.instanceMatrix.needsUpdate = true;
    },
    clear() { for (const b of active) b.alive = false; active.length = 0; im.count = 0; },
  };
  out.cannonball = cb;
  let time = 0;
  out.update = (dt) => { time += dt; for (const s of out.systems) s.update(dt); cb.update(dt, time); };
  out.setPixelScale = (h, fovDeg = 45) => { _fxScale.value = h * 0.5 / Math.tan(fovDeg * Math.PI / 360); };
  out.clear = () => { for (const s of out.systems) s.clear(); cb.clear(); };
  out.dispose = () => { for (const s of out.systems) s.dispose(); ballGeo.dispose(); if (im.parent) im.parent.remove(im); im.dispose(); };
  return out;
}
const fx = { create: createFX };

// ---------------------------------------------------------------- scenes
function sceneBase(preset, waterOpts) {
  const root = new THREE.Group(); root.name = 'scene';
  const sk = createSky(preset); root.add(sk.root);
  const wt = createWater(waterOpts); root.add(wt.mesh);
  return { root, sky: sk, water: wt };
}
function finishScene(base, extra) {
  const s = Object.assign(base, extra);
  s.preset = base.sky.preset;
  s.setPreset = (p) => { base.sky.setPreset(p); s.preset = p; };
  s.dispose = () => { base.sky.dispose(); base.water.dispose(); disposeTree(base.root); };
  return s;
}
function titleHarbour() {
  const b = sceneBase('dusk', { size: 520, segments: 110 });
  const isl = createIsland({ radius: 44, height: 13, seed: 7, flatten: [{ x: 8, z: 24, r: 17, h: 1.2 }, { x: -20, z: 8, r: 13, h: 3 }] });
  isl.position.set(-12, 0, -72); b.root.add(isl);
  const town = createTown({ nation: 'england', size: 'medium', seed: 4 }); town.position.set(-12 + 8, 1.2, -72 + 24); b.root.add(town);
  const fort = createFort({ nation: 'england' }); fort.scale.setScalar(0.7); fort.position.set(-12 - 20, 3, -72 + 8); fort.rotation.y = 0.5; b.root.add(fort);
  const sloop = createShip('sloop', { nation: 'england', sailState: 'furl' }); sloop.position.set(6, 0, -10); sloop.rotation.y = 2.2; b.root.add(sloop);
  const gal = createShip('galleon', { nation: 'spain', sailState: 'battle' }); gal.position.set(58, 0, -64); gal.rotation.y = 0.9; b.root.add(gal);
  b.water.setShallowMap((x, z) => isl.userData.shallowAt(x, z));
  const wind = { x: 0.3, z: 0.5 }, tgt = new THREE.Vector3();
  return finishScene(b, {
    ships: { sloop, galleon: gal }, island: isl, town,
    update(dt, t, camera) {
      b.water.update(t); sloop.update(dt, wind, b.water, t); gal.update(dt, wind, b.water, t);
      if (camera) {
        const a = 0.35 + Math.sin(t * 0.045) * 0.3;
        camera.position.set(8 + Math.sin(a) * 36, 7.5 + Math.sin(t * 0.07) * 1.2, -12 + Math.cos(a) * 36);
        tgt.set(-2 + Math.sin(t * 0.03) * 4, 4, -30); camera.lookAt(tgt);
        b.sky.update(camera);
      }
    },
  });
}
function townSquare({ nation = 'spain' } = {}) {
  const b = sceneBase('day', { size: 360, segments: 80 });
  const ground = vmesh(merge([cyl(26, 29, 2.2, 36, PAL.sand, 0, -0.1, 0), cyl(24, 24, 0.02, 36, '#9cc25a', 0, 1.0, -3)]), 'ground'); ground.position.z = -4; b.root.add(ground);
  const back = createIsland({ radius: 46, height: 18, seed: 12 }); back.position.set(-10, 0, -78); b.root.add(back);
  const town = createTown({ nation, size: 'medium', seed: 9 }); town.position.set(0, 1.0, 0); b.root.add(town);
  const fountain = new THREE.Group(); fountain.name = 'fountain';
  fountain.add(vmesh(merge([cyl(1.6, 1.8, 0.7, 10, PAL.stone, 0, 0.35, 0), cyl(0.25, 0.3, 1.6, 8, PAL.stone, 0, 0.8, 0), cyl(0.7, 0.4, 0.25, 8, PAL.stone, 0, 1.6, 0)]), 'fountain_stone'));
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.05, 12), materials.get('water_small')); fw.position.y = 0.66; fountain.add(fw);
  fountain.position.set(0, 1.0, 0); b.root.add(fountain);
  const awn = nation === 'pirate' ? '#3a3430' : nationHex(nation);
  const stall = vmesh(merge([cyl(0.08, 0.08, 2.4, 5, PAL.woodDark, -1.2, 1.2, -0.8), cyl(0.08, 0.08, 2.4, 5, PAL.woodDark, 1.2, 1.2, -0.8), cyl(0.08, 0.08, 2.4, 5, PAL.woodDark, -1.2, 1.2, 0.8), cyl(0.08, 0.08, 2.4, 5, PAL.woodDark, 1.2, 1.2, 0.8),
    box(2.7, 0.08, 2.0, awn, 0, 2.45, 0, 0.12), box(2.3, 0.8, 1.2, PAL.woodLight, 0, 0.4, 0), ico(0.25, '#e8a030', -0.5, 0.95, 0), ico(0.25, '#e04030', 0, 0.95, 0.1), ico(0.25, '#8ac040', 0.5, 0.95, -0.1)]), 'stall');
  stall.position.set(-5.5, 1.0, 3.5); stall.rotation.y = 0.6; b.root.add(stall);
  const sloop = createShip('sloop', { nation, sailState: 'furl' }); sloop.position.set(4.6, 0, 25); b.root.add(sloop);
  const actors = [];
  for (let i = 0; i < 3; i++) { const s = sailor(i + 3); s.setAction('walk'); s.userData.orbit = { r: 6.5 + i * 0.8, a: i * 2.1, sp: 0.18 + i * 0.03 }; s.setWeapon(null); b.root.add(s); actors.push(s); }
  for (let i = 0; i < 2; i++) { const s = soldier({ nation }); s.position.set(i ? 2.2 : -2.2, 1.0, -8.5); b.root.add(s); actors.push(s); }
  b.water.setShallowMap((x, z) => { const d = Math.hypot(x, z + 4) - 28; return d < 0 ? 1 : clamp(1 - d / 16, 0, 1); });
  const tgt = new THREE.Vector3(), wind = { x: 0.2, z: 0.4 };
  return finishScene(b, {
    town, actors, ships: { sloop },
    update(dt, t, camera) {
      b.water.update(t); sloop.update(dt, wind, b.water, t);
      for (const a of actors) {
        const o = a.userData.orbit;
        if (o) { o.a += o.sp * dt; a.position.set(Math.cos(o.a) * o.r, 1.0, Math.sin(o.a) * o.r); a.rotation.y = -o.a + Math.PI; }
        a.update(dt);
      }
      if (camera) {
        const a = 0.55 + Math.sin(t * 0.05) * 0.35;
        camera.position.set(Math.sin(a) * 34, 17 + Math.sin(t * 0.08) * 0.8, Math.cos(a) * 34 + 4); tgt.set(0, 1.5, -1); camera.lookAt(tgt);
        b.sky.update(camera);
      }
    },
  });
}
function duelDeck() {
  const b = sceneBase('day', { size: 360, segments: 90 });
  const ship = createShip('galleon', { nation: 'spain', sailState: 'full' }); b.root.add(ship);
  const dy = (z) => ship.userData.deckY(z / ship.userData.halfLength);
  const DZ = -1.45, qd = ship.userData.quarterDeck || { y: dy(-6), z0: -6.5, z1: -4.5 };
  const player = captain({ who: 'caleb', age: 24 }); player.position.set(0, dy(DZ - 1.1), DZ - 1.1); player.rotation.y = 0; ship.add(player);
  const enemy = captain({ who: 'enemy', age: 45 }); enemy.position.set(0, dy(DZ + 1.1), DZ + 1.1); enemy.rotation.y = Math.PI; ship.add(enemy);
  const crew = [];
  const a1 = sailor(4), a2 = soldier({ nation: 'spain' }), qz = qd.z1 - 1.1;
  a1.position.set(-0.3, qd.y, qz - 0.9); a1.rotation.y = 0.3; a2.position.set(0.3, qd.y, qz + 0.9); a2.rotation.y = Math.PI + 0.3;
  const a3 = sailor(9); a3.position.set(-1.7, dy(2.2), 2.2); a3.rotation.y = 2.2; a3.setWeapon('cutlass');
  for (const a of [a1, a2, a3]) { ship.add(a); crew.push(a); }
  const strikes = ['strikeHigh', 'strikeMid', 'strikeLow'], parries = ['parryHigh', 'parryMid', 'parryLow'];
  let timer = 0, turn = 0, cheerT = 0; a3.setAction('cheer');
  const wind = { x: 0.2, z: 0.6 }, tgt = new THREE.Vector3(), wp = new THREE.Vector3();
  return finishScene(b, {
    ship, actors: { player, enemy, crew },
    update(dt, t, camera) {
      b.water.update(t); ship.update(dt, wind, b.water, t);
      timer -= dt;
      if (timer <= 0) {
        timer = 0.7 + Math.random() * 0.5; turn ^= 1; const k = Math.floor(Math.random() * 3);
        (turn ? a1 : a2).setAction(strikes[k]); (turn ? a2 : a1).setAction(Math.random() < 0.8 ? parries[k] : 'hit');
      }
      cheerT += dt; if (cheerT > 4) { cheerT = 0; a3.setAction(a3.getAction() === 'cheer' ? 'idle' : 'cheer'); }
      player.update(dt); enemy.update(dt); for (const c of crew) c.update(dt);
      if (camera) {
        ship.localToWorld(wp.set(10.5, dy(DZ) + 3.6 + Math.sin(t * 0.3) * 0.25, DZ + Math.sin(t * 0.17) * 0.5));
        camera.position.copy(wp);
        ship.localToWorld(tgt.set(0, dy(DZ) + 1.5, DZ)); camera.lookAt(tgt);
        b.sky.update(camera);
      }
    },
  });
}
const scenes = { titleHarbour, townSquare, duelDeck };

// ---------------------------------------------------------------- export
export const PLT = {
  version: 1, lowQuality: LOW_QUALITY, materials, textures, ships, props, terrain, characters, fx, water, sky, scenes,
  nations: NATIONS, palette: PAL, env: ENV, uniforms: U,
  utils: { makeRng, countTris, fbm, disposeTree, drawFlag },
};
export default PLT;
// === PLT ASSETS END ===
