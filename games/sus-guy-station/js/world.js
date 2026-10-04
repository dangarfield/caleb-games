// world.js — geometry, textures and the 32 anomalies for Sus Guy Station (three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
export { THREE };

// ---------- props (assets/props.glb, converted from the uploaded FBX files; all in metres, facing +z) ----------
let PROPS = null;
export function loadProps(url = 'assets/props.glb') {
  return new Promise(res => new GLTFLoader().load(url, g => {
    g.scene.traverse(o => { if (o.isMesh) { const m = o.material; o.material = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, emissive: m.emissive }); } });
    PROPS = {}; ['bench', 'bin', 'extinguisher', 'cctv', 'door', 'teddy', 'guitar'].forEach(n => { PROPS[n] = g.scene.getObjectByName(n); });
    res(PROPS);
  }, undefined, () => res(null)));
}
function prop(name) {
  const src = PROPS && PROPS[name];
  if (!src) return new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: '#999999' }));
  const o = src.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
  o.traverse(m => { if (m.isMesh) m.userData.shared = true; });
  return o;
}
// the extinguisher's own texture (converted from the uploaded TGA), plus a copy with the red paint turned blue for A13
const EXT = {};
function extTexture(o, blue) {
  const k = blue ? 'blue' : 'red';
  if (!EXT[k]) { const t = new THREE.TextureLoader().load(blue ? 'assets/extinguisher_blue.png' : 'assets/extinguisher.png'); t.colorSpace = THREE.SRGBColorSpace; EXT[k] = new THREE.MeshLambertMaterial({ map: t }); }
  o.traverse(m => { if (m.isMesh) m.material = EXT[k]; });
}
function recolor(o, c) { o.traverse(m => { if (m.isMesh && m.material.color) { m.material = m.material.clone(); m.material.color.set(c); m.userData.ownMat = true; } }); }
// ---------- help point (assets/help_point.glb). Signs: "Help Point" by default, "Help Caleb" / "Help Ezra" as
// KHR_materials_variants when the file has them; otherwise A15 falls back to a painted sign over the panel.
let HELP = null;
export function loadHelp(url = 'assets/help_point.glb') {
  return new Promise(res => new GLTFLoader().load(url, async g => {
    const ext = g.parser.json.extensions && g.parser.json.extensions.KHR_materials_variants, variants = {};
    if (ext) {
      const meshes = []; g.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const [vi, v] of ext.variants.entries()) {
        const jobs = [];
        meshes.forEach(o => { const m = o.userData.gltfExtensions && o.userData.gltfExtensions.KHR_materials_variants, hit = m && m.mappings.find(x => x.variants.includes(vi));
          if (hit) jobs.push(g.parser.getDependency('material', hit.material).then(mat => [meshes.indexOf(o), mat])); });
        variants[v.name] = await Promise.all(jobs);
      }
    }
    HELP = { scene: g.scene, variants }; res(HELP);
  }, undefined, () => res(null)));
}
// "Help Caleb" / "Help Ezra" painted into the sign texture itself: the word "Point" is replaced on both labels,
// in the base colour and the glow, matching the lettering under "Help" (measured from the texture: x 330 and 470, baseline 146).
const PAINTED = {};
function paintSign(src, name, ink) {
  const img = src.image, c = cv(img.width, img.height), g = c.getContext('2d'), k = img.width / 1024;
  g.drawImage(img, 0, 0);
  const bg = g.getImageData(320 * k, 175 * k, 1, 1).data;
  g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; g.font = `500 ${31 * k}px ${FONT}`; g.textBaseline = 'alphabetic';
  [330, 470].forEach(x => {
    g.fillRect((x - 4) * k, 121 * k, 78 * k, 30 * k);
    const w = g.measureText(name).width, sx = Math.min(1, (70 * k) / w);   // narrowed to the width of "Point" if longer
    g.save(); g.fillStyle = ink; g.translate(x * k, 146 * k); g.scale(sx, 1); g.fillText(name, 0, 0); g.restore();
    g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  });
  const t = new THREE.CanvasTexture(c); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.channel = src.channel; return t;
}
function paintedMat(base, name) {
  const key = base.uuid + name; if (PAINTED[key]) return PAINTED[key];
  const m = base.clone();
  if (base.map) m.map = paintSign(base.map, name, '#233C83');
  if (base.emissiveMap) m.emissiveMap = paintSign(base.emissiveMap, name, '#030A39');
  return (PAINTED[key] = m);
}
function helpPoint(signName) {
  if (!HELP) return null;
  const o = HELP.scene.clone(true); o.traverse(m => { if (m.isMesh) m.userData.shared = true; });
  const v = signName && HELP.variants[signName];
  if (v) { const ms = []; o.traverse(m => { if (m.isMesh) ms.push(m); }); v.forEach(([i, mat]) => { if (ms[i]) ms[i].material = mat; }); }   // by mesh order: names repeat in this file
  else if (signName) { const who = signName.replace('Help ', ''); o.traverse(m => { if (m.isMesh && m.material.map && m.material.name === 'Help_Point') m.material = paintedMat(m.material, who); }); }
  return o;
}

// ---------- Sus Guy (assets/man2): the Mixamo model converted to man.glb (1.6 MB, was a 4.9 MB FBX); his Walking and
// Breathing Idle clips come from clips.json, with the walk's forward travel taken out so the game moves him instead.
let MAN = null;
const MAN_SCALE = 0.018;   // the model is 100 units tall; 1.8 m
export function loadMan(dir = 'assets/man2/') {
  const model = new Promise((ok, no) => new GLTFLoader().load(dir + 'man.glb', gl => ok(gl.scene), undefined, no));
  const clips = fetch(dir + 'clips.json').then(r => r.json());
  const map = new THREE.TextureLoader().load(dir + 'texture.jpg'); map.colorSpace = THREE.SRGBColorSpace;
  return Promise.all([model, clips]).then(([m, cj]) => {
    m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = new THREE.MeshLambertMaterial({ map, name: o.material.name }); } });   // matte
    m.scale.setScalar(MAN_SCALE);
    const walking = THREE.AnimationClip.parse(cj.walking), idle = THREE.AnimationClip.parse(cj.idle);
    const scene = new THREE.Group(); scene.add(m); scene.updateMatrixWorld(true);
    const sc = m.getObjectByName('mixamorigHips').parent.getWorldScale(new THREE.Vector3()).z;
    MAN = { scene, animations: [walking, idle], speed: cj.walking.travel * sc / walking.duration };   // m/s, matched to his stride
    return MAN;
  }).catch(() => null);
}

export const Ls = 10, Wd = 3.6, R = 1.8, Lm = 40, WH = 1.9, TOP = 3.75, UX = Ls + Wd, UZ = -(Lm + Wd);
export const C = { tile: '#F1E8D6', grout: '#D9CCB4', band: '#1F6F78', band2: '#E8572A', low: '#E9DDC6', floor: '#7B6F63', fog: '#EBDCC0', lamp: '#FFF1D6', ink: '#1E1E1E', cream: '#F6EEDC', orange: '#E8572A', teal: '#1F6F78', yellow: '#F3B33D' };
// walkable rectangles [x0, x1, z0, z1] in world space
export const RECT = {
  MP: [-Wd, 0, R, R + Lm], A: [-Wd, 0, -R, R], S: [0, Ls, -R, R], B: [Ls, Ls + Wd, -R, R],
  M: [Ls, Ls + Wd, -R - Lm, -R], C: [Ls, Ls + Wd, -Lm - 3 * R, -Lm - R], S2: [Ls + Wd, 2 * Ls + Wd, -Lm - 3 * R, -Lm - R]
};
export const inR = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];
const walkable = (x, z) => { for (const k in RECT) if (inR(RECT[k], x, z)) return true; return false; };
export function canStand(x, z) {
  const r = 0.3, d = 0.21;
  return [[x + r, z], [x - r, z], [x, z + r], [x, z - r], [x + d, z + d], [x - d, z + d], [x + d, z - d], [x - d, z - d]].every(p => walkable(p[0], p[1]));
}

export const ANOMALIES = [
  ['A01', 'Obvious', 'The lights went out, except one that followed you.'],
  ['A02', 'Noticeable', 'One light was flashing on and off.'],
  ['A03', 'Sneaky', 'One light was missing.'],
  ['A04', 'Sneaky', 'The orange lines on the wall were purple.'],
  ['A05', 'Sneaky', 'The seaside picture was at night.'],
  ['A06', 'Sneaky', 'The dinosaur was looking the other way.'],
  ['A07', 'Sneaky', 'The How to play poster was about guitars.'],
  ['A08', 'Sneaky', 'Two pictures had swapped places.'],
  ['A09', 'Noticeable', 'The staff door was open.'],
  ['A10', 'Noticeable', 'The cupboard door was shaking.'],
  ['A11', 'Sneaky', 'There was one extra grate in the floor.'],
  ['A12', 'Noticeable', 'There was a guitar by the wall.'],
  ['A13', 'Sneaky', 'The fire extinguisher was blue.'],
  ['A14', 'Noticeable', 'The clock was going backwards.'],
  ['A15', 'Sneaky', 'The Help Point sign said your name.'],
  ['A16', 'Noticeable', 'The camera was watching you.'],
  ['A17', 'Noticeable', 'A teddy on the bench turned to look at you.'],
  ['A18', 'Noticeable', 'Balloons were tied to the bin.'],
  ['A19', 'Noticeable', 'Sus Guy was walking backwards.'],
  ['A20', 'Noticeable', 'Sus Guy stopped and looked at you.'],
  ['A21', 'Obvious', 'There were two Sus Guys.'],
  ['A22', 'Obvious', 'Sus Guy was giant!'],
  ['A23', 'Sneaky', "Sus Guy's sandals were yellow."],
  ['A24', 'Obvious', 'Water was coming along the floor.'],
  ['A25', 'Sneaky', 'The clock had no red hand.'],
  ['A26', 'Sneaky', 'The staff door said STUFF ONLY.'],
  ['A27', 'Sneaky', 'The umbrella picture was upside down.'],
  ['A28', 'Sneaky', 'The camera was on the other side of the light.'],
  ['A29', 'Sneaky', 'One grate in the floor was turned round.'],
  ['A30', 'Sneaky', 'The cleaner door was red.'],
  ['A31', 'Sneaky', 'The clock was square.'],
  ['A32', 'Sneaky', 'The bin was on the other wall.']
].map(([id, tier, say]) => ({ id, tier, say }));

// where to point the "what changed" snapshot camera (M local space): [target, from]
const BR = [[0.9, 1.3, -12], [0, 1.6, -6.5]];
export const FOCUS = {
  A01: [[0, 3.4, -14], [0.4, 1.6, -5]], A02: [[0, 3.6, -14.8], [0.4, 1.6, -9]], A03: [[0, 3.6, -21.4], [0.4, 1.6, -13]],
  A04: [[-R, 0.8, -12], [0.6, 1.6, -7]], A05: [[-R, 1.4, -5], [0.8, 1.6, -2]], A06: [[-R, 1.4, -15], [0.8, 1.6, -12]],
  A07: [[-R, 1.4, -29], [0.8, 1.6, -26.6]], A08: [[-R, 1.4, -10], [1.0, 1.6, -1.5]], A09: [[R, 1.1, -27], [-0.8, 1.6, -23]],
  A10: [[R, 1, -36], [-0.8, 1.6, -32]], A11: [[0, 0, -21.5], [0.2, 1.8, -13.5]], A12: [[R - 0.25, 0.5, -12], [-0.6, 1.5, -8.8]],
  A13: [[R - 0.14, 0.35, -25], [-0.7, 1.4, -22.5]], A14: [[-R, 1.55, -10], [0.8, 1.6, -8.2]], A15: [[R - 0.14, 1.35, -33], [-0.5, 1.5, -31.6]],
  A16: [[0.6, 3.3, -38], [0, 1.6, -33]], A17: [[R - 0.3, 0.6, -4], [-0.7, 1.4, -1.8]], A18: [[R - 0.3, 1.3, -7], [-0.7, 1.5, -4.2]],
  A19: BR, A20: BR, A21: BR, A22: [[0.5, 2, -12], [0, 1.6, -5]], A23: BR, A24: [[0, 0, -30], [0, 1.8, -20]],
  A25: [[-R, 1.55, -10], [0.8, 1.6, -8.2]], A26: [[R, 1.45, -27], [-0.8, 1.6, -23]], A27: [[-R, 1.4, -22], [0.8, 1.6, -19.6]],
  A28: [[-0.3, 3.4, -38], [0.3, 1.6, -34]], A29: [[0, 0, -20], [0.2, 1.8, -14]], A30: [[R, 1, -36], [-0.8, 1.6, -32]],
  A31: [[-R, 1.55, -10], [0.8, 1.6, -8.2]], A32: [[-R + 0.3, 0.6, -7.5], [0.7, 1.4, -5]]
};

// ---------- textures ----------
const FONT = 'Gabarito, "Segoe UI", system-ui, sans-serif';
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); }
function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const KEEP = new WeakSet(), TEXC = new WeakMap();
const memo = fn => { const m = new Map(); return (...a) => { const k = JSON.stringify(a); if (!m.has(k)) { const c = fn(...a); KEEP.add(c); m.set(k, c); } return m.get(k); }; };
// canvases that never change (tiles, posters, signs...) are drawn once and uploaded once, then reused every lap
export function tex(c, rx = 1, ry = 1) {
  const key = rx + 'x' + ry, hit = KEEP.has(c) && TEXC.get(c);
  if (hit && hit[key]) return hit[key];
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  if (KEEP.has(c)) { t.userData.keep = true; if (!TEXC.has(c)) TEXC.set(c, {}); TEXC.get(c)[key] = t; }
  return t;
}
const cache = {};
function tiles(H, band, edge = C.band2) {
  const key = H + '|' + band + '|' + edge; if (cache[key]) return cache[key];
  const rows = Math.round(H * 10), c = cv(512, rows * 16), g = c.getContext('2d'), r = rnd(7);
  const bt = Math.round((H - 0.92) * 10), bb = Math.round((H - 0.72) * 10);
  g.fillStyle = C.grout; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 16; x++) {
    const col = band && y >= bt && y < bb ? band : band && y >= bb ? C.low : C.tile;
    g.fillStyle = shade(col, (r() - 0.5) * 0.07); g.fillRect(x * 32 + 1, y * 16 + 1, 30, 14);
  }
  if (band) { g.fillStyle = edge; g.fillRect(0, bt * 16 - 4, 512, 4); g.fillRect(0, bb * 16, 512, 4); }
  KEEP.add(c); return (cache[key] = c);
}
function floorCanvas() {
  if (cache.floor) return cache.floor;
  const c = cv(256, 256), g = c.getContext('2d'), r = rnd(3);
  g.fillStyle = C.floor; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, 256, 2);
  KEEP.add(c); return (cache.floor = c);
}
function titleBar(g, t, sub) {
  g.fillStyle = C.cream; g.fillRect(0, 252, 256, 68); g.fillStyle = C.ink; g.textAlign = 'center';
  g.font = `900 30px ${FONT}`; g.fillText(t, 128, sub ? 286 : 296); if (sub) { g.font = `700 16px ${FONT}`; g.fillText(sub, 128, 308); }
}
function seaside(night) {
  const c = cv(256, 320), g = c.getContext('2d');
  g.fillStyle = night ? '#1D2B4A' : '#8FD3E0'; g.fillRect(0, 0, 256, 160);
  if (night) { g.fillStyle = '#F6EEDC'; [[30, 30], [70, 60], [120, 25], [220, 50], [200, 110], [40, 110]].forEach(([x, y]) => g.fillRect(x, y, 3, 3)); }
  g.fillStyle = night ? C.cream : C.yellow; g.beginPath(); g.arc(178, 84, 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = night ? '#173F45' : C.teal; g.fillRect(0, 150, 256, 56);
  g.fillStyle = night ? '#8C7B55' : '#E9C98B'; g.fillRect(0, 206, 256, 46);
  titleBar(g, 'THE SEASIDE', 'by train'); return c;
}
function dino(flip) {
  const c = cv(256, 320), g = c.getContext('2d');
  g.fillStyle = '#3E7C6B'; g.fillRect(0, 0, 256, 252); g.fillStyle = '#2C5E50'; g.fillRect(0, 214, 256, 38);
  g.save(); if (flip) { g.translate(256, 0); g.scale(-1, 1); }
  g.fillStyle = C.cream; g.beginPath(); g.ellipse(118, 168, 70, 38, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.cream; g.lineWidth = 24; g.lineCap = 'round'; g.beginPath(); g.moveTo(160, 152); g.lineTo(198, 82); g.stroke();
  g.beginPath(); g.ellipse(210, 72, 24, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(56, 160); g.lineTo(14, 200); g.lineTo(70, 186); g.fill();
  g.fillRect(84, 192, 18, 34); g.fillRect(138, 192, 18, 34);
  g.fillStyle = C.ink; g.beginPath(); g.arc(218, 67, 4, 0, Math.PI * 2); g.fill(); g.restore();
  titleBar(g, 'DINOSAURS', 'at the museum'); return c;
}
function lost(flip) {
  const c = cv(256, 320), g = c.getContext('2d');
  g.fillStyle = C.cream; g.fillRect(0, 0, 256, 320); g.fillStyle = C.ink; g.fillRect(0, 0, 256, 64);
  g.fillStyle = C.cream; g.textAlign = 'center'; g.font = `900 24px ${FONT}`; g.fillText('LOST PROPERTY', 128, 42);
  g.fillStyle = C.teal; g.beginPath();
  if (flip) { g.arc(90, 170, 44, 0, Math.PI); g.fill(); g.fillRect(87, 114, 6, 56); } else { g.arc(90, 140, 44, Math.PI, 0); g.fill(); g.fillRect(87, 140, 6, 56); }
  g.fillStyle = C.orange; g.fillRect(150, 110, 52, 70); g.fillRect(150, 92, 12, 30); g.fillRect(166, 86, 12, 30); g.fillRect(182, 92, 12, 30);
  g.fillStyle = '#C9BBA2'; for (let i = 0; i < 4; i++) g.fillRect(30, 222 + i * 22, i === 3 ? 120 : 196, 10);
  return c;
}
function rules(wrong) {
  const c = cv(256, 320), g = c.getContext('2d');
  g.fillStyle = C.orange; g.fillRect(0, 0, 256, 320); g.fillStyle = C.cream; g.font = `900 30px ${FONT}`; g.fillText('HOW TO PLAY', 20, 48);
  const L = wrong
    ? [['1', 'Hold the guitar.'], ['2', 'Press a string.'], ['', 'Strum it!'], ['3', 'Play it slowly.'], ['', 'Then faster!'], ['4', 'Practise every day!']]
    : [['1', 'Look at everything.'], ['2', 'Something different?'], ['', 'Turn back!'], ['3', 'All the same?'], ['', 'Keep going!'], ['4', 'Get to Platform 10!']];
  L.forEach(([n, t], i) => {
    const y = 96 + i * 36; g.fillStyle = C.ink;
    if (n) { g.fillStyle = C.yellow; g.beginPath(); g.arc(34, y - 7, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = C.ink; g.font = `900 16px ${FONT}`; g.textAlign = 'center'; g.fillText(n, 34, y - 1); }
    g.textAlign = 'left'; g.font = `800 18px ${FONT}`; g.fillText(t, 56, y);
  });
  return c;
}
function gamePoster() {
  const c = cv(256, 320), g = c.getContext('2d');
  g.fillStyle = C.orange; g.fillRect(0, 0, 256, 320);
  [[90, C.yellow], [60, C.teal], [32, '#173F45']].forEach(([r, col]) => { g.fillStyle = col; g.beginPath(); g.arc(128, 120, r, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = C.cream; g.textAlign = 'center'; g.font = `900 36px ${FONT}`; g.fillText('MIND', 128, 258); g.fillText('THE GAP', 128, 296); return c;
}
function plate(text, bg, fg, w = 256, h = 64, size = 30) {
  const c = cv(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${size}px ${FONT}`;
  text.split('\n').forEach((t, i, a) => g.fillText(t, w / 2, h / 2 + (i - (a.length - 1) / 2) * size * 1.1)); return c;
}
function words(text, fg) {
  const c = cv(512, 128), g = c.getContext('2d'); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT}`;
  g.fillText(text, 256, 68); return c;
}
function clockFace() {
  const c = cv(256, 256), g = c.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = C.ink; for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate(i * Math.PI / 6); g.fillRect(-4, -118, 8, i % 3 ? 18 : 30); g.restore(); }
  return c;
}
function ventCanvas() {
  const c = cv(128, 80), g = c.getContext('2d'); g.fillStyle = '#55585C'; g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#2A2C2F'; for (let i = 0; i < 6; i++) g.fillRect(10, 8 + i * 12, 108, 6); return c;
}
seaside = memo(seaside); dino = memo(dino); lost = memo(lost); rules = memo(rules); gamePoster = memo(gamePoster);
plate = memo(plate); words = memo(words); clockFace = memo(clockFace); ventCanvas = memo(ventCanvas);
export function signCanvas() { return cv(1024, 200); }
export function drawSign(c, n) {
  const g = c.getContext('2d'); g.fillStyle = C.teal; g.fillRect(0, 0, 1024, 200);
  g.fillStyle = C.cream; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `900 104px ${FONT}`;
  g.fillText('Way out ↑', 50, 104);
  g.fillStyle = C.yellow; g.beginPath(); g.arc(880, 100, 80, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.ink; g.textAlign = 'center'; g.font = `900 120px ${FONT}`; g.fillText(String(n), 880, 108);
}

// ---------- materials & primitives ----------
const lam = (o) => new THREE.MeshLambertMaterial(Object.assign({ side: THREE.DoubleSide }, o));
const col = (c) => lam({ color: c });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
// tiled fill for flat wall shapes whose UVs are in metres: same tile size as the walls, rows continue up from the wall
// the wall's tiles start at its left edge (x = -R); the shapes' UVs start at x = 0, so shift by R to line the columns up
const archTile = () => { const t = tex(tiles(WH, null), 1 / 4, 1 / WH); t.offset.x = R / 4; return lam({ map: t }); };
function headerShape() {
  const s = new THREE.Shape(); s.moveTo(-R, WH); s.lineTo(-R, TOP); s.lineTo(R, TOP); s.lineTo(R, WH); s.absarc(0, WH, R, 0, Math.PI, false);
  return new THREE.ShapeGeometry(s, 24);
}
// a tiled arched passage running along local -z from 0 to -L
function passage(L, band, edge) {
  const g = new THREE.Group(), wm = lam({ map: tex(tiles(WH, band, edge), L / 4, 1) });
  const geo = new THREE.PlaneGeometry(L, WH);
  const l = new THREE.Mesh(geo, wm); l.rotation.y = Math.PI / 2; l.position.set(-R, WH / 2, -L / 2);
  const r = new THREE.Mesh(geo, wm); r.rotation.y = -Math.PI / 2; r.position.set(R, WH / 2, -L / 2);
  const ceil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 36, 1, true, Math.PI / 2, Math.PI), lam({ map: tex(tiles(3.2, null), 3, L / 4) }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, WH, -L / 2);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(Wd, L), lam({ map: tex(floorCanvas(), Wd / 2, L / 2) }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, -L / 2);
  const hm = archTile(), hg = headerShape();
  const h1 = new THREE.Mesh(hg, hm), h2 = new THREE.Mesh(hg, hm); h2.position.z = -L;
  g.add(l, r, ceil, fl, h1, h2); return g;
}
function lamps(g, zs, mat) {
  const geo = new THREE.BoxGeometry(0.18, 0.05, 1.5), out = [];
  zs.forEach(z => { const m = new THREE.Mesh(geo, mat); m.position.set(0, WH + R - 0.08, z); g.add(m); out.push(m); }); return out;
}
function poster(g, canvas, x, z, faceRight) {
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.22), col('#1B1B1B'));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.12), lam({ map: tex(canvas) }));
  const s = faceRight ? 1 : -1; fr.position.set(x - s * 0.015, 1.42, z); p.position.set(x - s * 0.025, 1.42, z);
  fr.rotation.y = p.rotation.y = faceRight ? -Math.PI / 2 : Math.PI / 2; g.add(fr, p); return p;
}
// corner room, local: openings on +x and +z, walls on -x and -z.
// Built to the passage's exact profile: the same tile canvas (so the teal band lines up), walls WH high,
// and a cross vault where the two arched roofs meet, so every opening matches the passage arch.
function corner() {
  const g = new THREE.Group(), wm = lam({ map: tex(tiles(WH, C.band), Wd / 4, 1) }), top = archTile();
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Wd), lam({ map: tex(floorCanvas(), Wd / 2, Wd / 2) })); fl.rotation.x = -Math.PI / 2;
  const wall = new THREE.PlaneGeometry(Wd, WH);
  const w = new THREE.Mesh(wall, wm); w.rotation.y = Math.PI / 2; w.position.set(-R, WH / 2, 0);
  const n = new THREE.Mesh(wall, wm); n.position.set(0, WH / 2, -R);
  const half = new THREE.Shape(); half.moveTo(R, WH); half.absarc(0, WH, R, 0, Math.PI, false); half.lineTo(R, WH);
  const hg = new THREE.ShapeGeometry(half, 24);
  const wa = new THREE.Mesh(hg, top); wa.rotation.y = Math.PI / 2; wa.position.x = -R;
  const na = new THREE.Mesh(hg, top); na.position.z = -R;
  const N = 36, vg = new THREE.PlaneGeometry(Wd, Wd, N, N); vg.rotateX(Math.PI / 2);
  const vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) { const x = vp.getX(i), z = vp.getZ(i); vp.setY(i, WH + Math.sqrt(Math.max(0, R * R - Math.min(x * x, z * z)))); }
  vg.computeVertexNormals();
  const vault = new THREE.Mesh(vg, lam({ map: tex(tiles(3.2, null), 1, 1) }));
  const lp = box(0.7, 0.04, 0.7, new THREE.MeshBasicMaterial({ color: C.lamp })); lp.position.y = WH + R - 0.03;
  g.add(fl, w, n, wa, na, vault, lp); return g;
}
// sign passage: symmetric under a 180° turn about its centre, so the fold is invisible
export function buildStatic(scene, signTex) {
  const S = passage(Ls, C.band);
  lamps(S, [-2.5, -7.5], new THREE.MeshBasicMaterial({ color: C.lamp }));
  const gp = gamePoster(); poster(S, gp, -R, -2.5, false); poster(S, gp, R, -7.5, true);
  const back = box(2.26, 0.49, 0.05, col(C.teal)); back.position.set(0, 2.85, -5);
  const sm = lam({ map: signTex, side: THREE.FrontSide });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.43), sm); f.position.set(0, 2.85, -5 + 0.03);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.43), sm); b.position.set(0, 2.85, -5 - 0.03); b.rotation.y = Math.PI;
  S.add(back, f, b);
  [-0.9, 0.9].forEach(x => { const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), col('#333333')); rd.position.set(x, 3.4, -5); S.add(rd); });
  S.rotation.y = -Math.PI / 2; scene.add(S);
  const S2 = S.clone(); S2.position.set(UX, 0, UZ); scene.add(S2);
  const cA = corner(); cA.position.set(-R, 0, 0);
  const cB = corner(); cB.position.set(Ls + R, 0, 0); cB.rotation.y = Math.PI;
  const cC = corner(); cC.position.set(Ls + R, 0, UZ);
  const cB2 = corner(); cB2.position.set(UX + Ls + R, 0, UZ); cB2.rotation.y = Math.PI;
  scene.add(cA, cB, cC, cB2);
}

// ---------- Sus Guy ----------
function brolly(open) {
  const root = new THREE.Group(), coat = col('#6E7277'), dark = col('#2E2F33'), skin = col('#E8C4A0'), blk = col('#1E1E1E');
  const leg = () => { const m = box(0.14, 0.8, 0.16, dark); m.geometry.translate(0, -0.4, 0); return m; };
  const legL = leg(), legR = leg(); legL.position.set(-0.1, 0.8, 0); legR.position.set(0.1, 0.8, 0);
  const body = new THREE.Group(); body.position.y = 0.8;
  const torso = box(0.5, 0.72, 0.3, coat); torso.position.y = 0.36;
  const scarf = box(0.12, 0.42, 0.02, col(C.yellow)); scarf.position.set(0, 0.42, 0.16);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin); head.position.y = 0.88;
  [-0.05, 0.05].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), blk); e.position.set(x, 0.9, 0.13); body.add(e); });
  const hat = new THREE.Group(); hat.position.y = 1.0;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.15, 16), blk); crown.position.y = 0.08;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20), blk); hat.add(crown, brim);
  const armL = box(0.11, 0.62, 0.13, coat), armR = box(0.11, 0.62, 0.13, coat); armL.position.set(-0.31, 0.36, 0); armR.position.set(0.31, 0.36, 0);
  body.add(torso, scarf, head, hat, armL, armR);
  const um = new THREE.Group(); um.position.set(0.36, 0.08, 0.06);
  if (open) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), blk); sh.position.y = 0.5;
    const cn = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.32, 16, 1, true), blk); cn.position.y = 1.05; um.add(sh, cn);
  } else {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.9, 8), blk); sh.position.y = -0.4; um.add(sh);
  }
  body.add(um); root.add(legL, legR, body);
  return { root, body, legL, legR, hat, phase: 0, hatBase: 1 };
}
// the real model, with a bowler hat on his head and an umbrella in his hand, built in the same flat style
// A23: a copy of his texture with the sandals turned green. The sandal areas are found from the mesh itself:
// triangles skinned mostly to the foot/toe bones, drawn into a UV mask; inside it only the dark brown leather is recoloured (not skin).
let SANDALS = null;
function sandalMap(mesh) {
  if (SANDALS) return SANDALS;
  const src = mesh.material.map || [].concat(mesh.material)[0].map, img = src.image, Wt = img.width, Ht = img.height;
  const c = cv(Wt, Ht), g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const mask = cv(Wt, Ht), mg = mask.getContext('2d'); mg.fillStyle = '#fff';
  const geo = mesh.geometry, uv = geo.attributes.uv, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
  const feet = new Set(mesh.skeleton.bones.map((b, i) => /Foot|Toe/.test(b.name) ? i : -1).filter(i => i >= 0));
  const footy = v => { let w = 0; for (let k = 0; k < 4; k++) if (feet.has(si.getComponent(v, k))) w += sw.getComponent(v, k); return w > 0.5; };
  const n = idx ? idx.count : uv.count;
  for (let t = 0; t < n; t += 3) {
    const vs = [0, 1, 2].map(k => idx ? idx.getX(t + k) : t + k);
    if (!vs.every(footy)) continue;
    mg.beginPath(); vs.forEach((v, k) => { const x = uv.getX(v) * Wt, y = (src.flipY ? 1 - uv.getY(v) : uv.getY(v)) * Ht; k ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); mg.stroke();
  }
  const d = g.getImageData(0, 0, Wt, Ht), m = mg.getImageData(0, 0, Wt, Ht).data, p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!m[i]) continue;
    const r = p[i], gg = p[i + 1], b = p[i + 2], l = 0.3 * r + 0.59 * gg + 0.11 * b;
    if (l < 115 && r > b) { const k = l / 90; p[i] = Math.min(255, 245 * k); p[i + 1] = Math.min(255, 195 * k); p[i + 2] = 30 * k; }   // brown leather -> yellow, same shading
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT;
  return (SANDALS = t);
}
function manWalker(green) {   // the original FBX and its own animations; green = A23 sandals
  const model = skClone(MAN.scene);
  model.traverse(o => { if (o.isMesh) { o.userData.shared = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(model), clip = n => MAN.animations.find(a => a.name === n);
  const walk = mixer.clipAction(clip('walking')), idle = mixer.clipAction(clip('idle'));
  idle.play();
  const root = new THREE.Group(); root.add(model);   // this model already faces +z
  root.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => m.clone()); if (o.material.length === 1) o.material = o.material[0]; o.userData.ownMat = true; } });
  if (green) root.traverse(o => { if (o.isSkinnedMesh) [].concat(o.material).forEach(m => { m.map = sandalMap(o); }); });
  return { root, model, mixer, acts: { walk, idle }, walk, idle, mode: 'idle', hat: null, hatBase: 0 };
}

// ---------- the main passage, one anomaly (or none) ----------
export function buildMain(id, live, name) {
  const has = a => id === a, ups = [];
  const g = passage(Lm, C.band, has('A04') ? '#7A4FB0' : C.band2);   // A04: the orange edge lines turn purple
  const on = new THREE.MeshBasicMaterial({ color: C.lamp }), off = new THREE.MeshBasicMaterial({ color: '#8E8A80' });
  const zs = []; for (let i = 0; i < 12; i++) if (!(has('A03') && i === 6)) zs.push(-1.6 - i * 3.3);
  const ls = lamps(g, zs, has('A01') ? off : on);
  if (has('A02')) { const fm = new THREE.MeshBasicMaterial({ color: C.lamp }); ls[4].material = fm; ups.push((dt, t) => fm.color.set(Math.sin(t * 23) + Math.sin(t * 7.3) > -0.3 ? C.lamp : '#5E5A52')); }
  if (has('A01') && live) {
    const fl = box(0.18, 0.05, 1.5, on), pl = new THREE.PointLight(C.lamp, 6, 9, 1.4); fl.position.y = WH + R - 0.08; pl.position.y = 3.2;
    g.add(fl, pl); ups.push((dt, t, p) => { const z = Math.min(-0.8, Math.max(-Lm + 1, p.z)); fl.position.z = pl.position.z = z; });
  }
  // left wall
  poster(g, seaside(has('A05')), -R, has('A08') ? -15 : -5, false);
  poster(g, dino(has('A06')), -R, has('A08') ? -5 : -15, false);
  poster(g, lost(has('A27')), -R, -22, false);
  poster(g, rules(has('A07')), -R, -29, false);
  const clock = new THREE.Group(); clock.position.set(-R + 0.06, 1.55, -10);
  const rim = col('#2B2B2B'), dial = lam({ map: tex(clockFace()) });
  const face = has('A31') ? new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.66), [dial, rim, rim, rim, rim, rim])
    : new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), [rim, dial, rim]);
  if (!has('A31')) face.rotation.z = -Math.PI / 2; clock.add(face);
  const hand = (len, w, c, x) => { const m = box(0.01, len, w, col(c)); m.geometry.translate(0, len / 2 - 0.03, 0); m.position.x = x; clock.add(m); return m; };
  const hh = hand(0.17, 0.035, C.ink, 0.04), mh = hand(0.26, 0.025, C.ink, 0.045), sh = hand(0.28, 0.012, '#D23B2A', 0.05);
  const t0 = new Date(), base = t0.getHours() % 12 * 3600 + t0.getMinutes() * 60 + t0.getSeconds();
  const setHands = s => { hh.rotation.x = -(s / 43200) * Math.PI * 2; mh.rotation.x = -(s / 3600) * Math.PI * 2; sh.rotation.x = -(Math.floor(s) / 60) * Math.PI * 2; };
  if (has('A25')) sh.visible = false;
  setHands(base); g.add(clock);
  if (live) ups.push((dt, t) => setHands(has('A14') ? base - t * 1.0 : base + t));
  // ceiling camera (model; lens points +x, so -PI/2 aims it back down the passage)
  const cam = prop('cctv'); cam.position.set(has('A28') ? -0.6 : 0.6, 3.58, -38); cam.rotation.y = -Math.PI / 2; g.add(cam);
  const tiny = cam.getObjectByName('led'); if (tiny) tiny.visible = false;
  // the model's own LED is 1 cm across; a bigger one in exactly the same spot on the camera body
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshBasicMaterial({ color: '#FF2A1F' })); led.position.set(0.243, -0.265, -0.031); cam.add(led);
  if (live) ups.push((dt, t, p) => {
    if (led) led.visible = Math.floor(t) % 2 === 0;
    if (has('A16')) { const target = Math.atan2(-(p.z + 38), p.x - cam.position.x); cam.rotation.y += (target - cam.rotation.y) * Math.min(1, dt * 3); }
  });
  // right wall (models from assets/props.glb)
  const place = (o, x, y, z, ry = -Math.PI / 2) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
  place(prop('bench'), R - 0.27, 0, -4);
  if (has('A17')) {
    const ted = place(prop('teddy'), R - 0.31, 0.327, -4);   // sits on the seat top (measured from the bench model)
    if (live) ups.push((dt, t, p) => { const target = Math.atan2(p.x - (R - 0.3), p.z + 4); ted.rotation.y += (target - ted.rotation.y) * Math.min(1, dt * 3); });
  }
  const bin = new THREE.Group(); bin.add(prop('bin'));   // free-standing, 1 m tall, wide face to the passage
  if (has('A18')) {
    ['#E8572A', '#F3B33D', '#1F6F78', '#D94F8C', '#4C8BF5'].forEach((c, i) => {
      const a = (i - 2) * 0.32, h = 1.75 + (i % 2) * 0.22, bx = Math.sin(a) * 0.32, bz = 0.05 + Math.cos(a) * 0.05;
      const bal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), lam({ color: c })); bal.scale.y = 1.18; bal.position.set(bx, h, bz);
      const len = Math.hypot(bx, h - 0.98), str = box(0.006, len, 0.006, col('#F6EEDC'));
      str.position.set(bx / 2, (h + 0.98) / 2, bz / 2); str.rotation.z = -Math.atan2(bx, h - 0.98);
      bin.add(bal, str);
      if (live) ups.push((dt, t) => { bal.position.x = bx + Math.sin(t * 1.3 + i) * 0.02; });
    });
  }
  if (has('A32')) place(bin, -R + 0.3, 0, -7.5, Math.PI / 2); else place(bin, R - 0.3, 0, -7);
  const pitch = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.63, 32, 1, Math.PI / 2, Math.PI), col(C.yellow));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(R - 0.05, 0.012, -12); g.add(pitch);
  if (has('A12')) {   // the guitar model, leaning back against the right wall on the busker pitch (front faces the passage)
    const lean = new THREE.Group(), gtr = prop('guitar'); gtr.rotation.x = -0.27; lean.add(gtr);   // top tips 0.27 m towards the wall
    place(lean, R - 0.32, 0, -12);
  }
  const vm = lam({ map: tex(ventCanvas()) });
  [-17, -20, -23].concat(has('A11') ? [-26] : []).forEach(z => { const v = box(0.7, 0.02, 0.45, vm); v.position.set(0, 0.01, z); if (has('A29') && z === -20) v.rotation.y = Math.PI / 2; g.add(v); });
  const ex = prop('extinguisher'); extTexture(ex, has('A13')); place(ex, R - 0.14, 0, -25);   // A13: the blue version of its texture
  const door = (z, c, label, ajar) => {
    const d = prop('door'), leaf = d.getObjectByName('leaf') || d;
    recolor(leaf, c);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshLambertMaterial({ map: tex(words(label, c === '#8C9196' ? C.ink : C.cream)), transparent: true, depthWrite: false }));
    pl.material.polygonOffset = true; pl.material.polygonOffsetFactor = -2;
    pl.position.set(-0.368, 1.45, 0.0182); leaf.add(pl);   // ray-tested: the leaf's front surface is z 0.018 all around the sign
    place(d, R, 0, z); d.userData.leaf = leaf;
    if (ajar) {
      leaf.rotation.y = 0.45;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.76), new THREE.MeshBasicMaterial({ color: '#FFD27A' })); glow.position.set(0, 0.88, 0.01); d.add(glow);
      if (live) { const wl = new THREE.PointLight('#FFC66A', 3, 5, 1.5); wl.position.set(R - 0.7, 1.2, z - 0.3); g.add(wl); }
    }
    return d;
  };
  door(-27, '#8C9196', has('A26') ? 'STUFF ONLY' : 'STAFF ONLY', has('A09'));
  const cup = door(-36, has('A30') ? '#C8372D' : '#2E5E9E', 'CLEANER', false);
  if (has('A10') && live) ups.push((dt, t, p) => { const near = Math.abs(p.z + 36) < 4.5; cup.userData.leaf.rotation.y = near ? Math.sin(t * 31) * 0.035 : 0; cup.userData.rattle = near; });
  // help point against the right wall, front facing into the passage. A15: its sign says Help <player>
  const hp = helpPoint(has('A15') ? 'Help ' + (name || 'Caleb') : null);
  if (hp) place(hp, R - 0.14, 0, -33);
  if (has('A24')) {
    const wm = waterMesh(); g.add(wm); let len = live ? 0.01 : 12;
    const fit = () => { wm.material.uniforms.uFront.value = -Lm + len; }; fit();
    ups.push((dt, t) => { wm.material.uniforms.uTime.value = t; });
    if (live) ups.push((dt, t, p) => { if (p.z < -1 && -Lm + len < p.z - 2.5 && len < Lm - 2) { len += dt * 0.8; fit(); } });
  }
  if (live) {
    // He starts round the far corner (in the next sign passage), sets off before you can see down the passage,
    // turns into it, walks its whole length past you, and fades out as he reaches the first corner.
    const SX = R + 4.5, SZ = -Lm - R, back = has('A19');
    const ws = [], mk = lane => {
      const b = MAN ? manWalker(has('A23')) : brolly(has('A23'));
      b.lane = lane; b.leg = 0; b.root.position.set(SX, 0, SZ - (lane - 0.8));   // offset so two walkers stay side by side round the turn
      b.head = -Math.PI / 2; b.root.rotation.y = b.head + (back ? Math.PI : 0);
      if (has('A22')) { b.root.scale.setScalar(1.7); if (b.body) b.body.rotation.x = 0.3; }
      if (back && b.walk) b.walk.timeScale = -1;
      g.add(b.root); ws.push(b);
    };
    if (has('A21')) { mk(0.4); mk(1.2); } else mk(has('A22') ? 0.5 : 0.9);
    let st = 'wait', tip = 0, stopped = false;
    const pose = (b, m) => {
      if (!b.mixer || b.mode === m) return;
      const from = b.acts ? b.acts[b.mode] : (b.mode === 'walk' ? b.walk : b.idle), to = b.acts ? b.acts[m] : (m === 'walk' ? b.walk : b.idle);
      to.reset().play(); from.crossFadeTo(to, 0.35, false); b.mode = m;
    };
    const fade = (b, a) => b.root.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.transparent = a < 1; m.opacity = a; m.depthWrite = a > 0.6; }); });
    ups.push((dt, t, p) => {
      if (st === 'wait') st = 'walk';   // sets off as soon as the lap is built (while you're still in the sign passage)
      ws.forEach(b => {
        if (!b.root.visible) return;
        const pos = b.root.position, dz = p.z - pos.z, dx = p.x - pos.x;
        if (has('A20') && st === 'walk' && !stopped && b.leg === 1 && dz > 0 && dz < 3.2) { st = 'stop'; stopped = true; }
        if (st === 'walk') {
          const v = (MAN ? MAN.speed : 1.25) * dt * (has('A22') ? 1.7 : 1);   // giant: longer strides
          if (b.leg === 0) { pos.x -= v; if (pos.x <= b.lane) { pos.x = b.lane; b.leg = 1; } }
          else pos.z += v;
          const want = b.leg === 0 ? -Math.PI / 2 : 0;
          b.head += (want - b.head) * Math.min(1, dt * 6);           // smooth turn at the corner
          b.root.rotation.y = b.head + (back ? Math.PI : 0);
          if (b.mixer) pose(b, 'walk');
          else { b.phase += dt * 6.5; b.legL.rotation.x = Math.sin(b.phase) * 0.45; b.legR.rotation.x = -Math.sin(b.phase) * 0.45; }
        }
        if (st === 'stop') {
          b.root.rotation.y = Math.atan2(dx, dz); tip += dt; if (b.hat) b.hat.position.y = b.hatBase + Math.max(0, Math.sin(tip * 2.4)) * 0.16;
          if (b.mixer) pose(b, 'idle'); else b.legL.rotation.x = b.legR.rotation.x = 0;   // A20: stops, turns and looks at you
          if (tip > 10) st = 'walk';   // A20: looks at you for 10 seconds
        }
        if (b.mixer) b.mixer.update(dt);
        if (b.leg === 1 && pos.z > -3) { const a = Math.max(0, (1.2 - pos.z) / 4.2); fade(b, a); if (a <= 0) b.root.visible = false; }
      });
    });
    g.userData.walkers = ws;
  }
  g.userData.update = (dt, t, p) => ups.forEach(f => f(dt, t, p));
  return g;
}

// a beam: bright along the middle, soft at the sides, fading out towards its far (lower) end
function rayCanvas() {
  const c = cv(64, 256), x = c.getContext('2d'), gy = x.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(255,255,255,1)'); gy.addColorStop(0.5, 'rgba(255,255,255,.45)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gy; x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in'; const gx = x.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gx; x.fillRect(0, 0, 64, 256);
  return c;
}
rayCanvas = memo(rayCanvas);
// A24 water: low-poly, faceted ripples (flat shading from screen derivatives), glints from the ceiling lamps,
// a wobbly foamy leading edge and foam along the walls. The front moves by a uniform, so the mesh never changes.
const WATER_VS = `
uniform float uTime; varying vec3 vW; varying vec2 vL;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  p.y += sin(p.x * 3.1 + uTime * 1.7 + p.z * 0.9) * 0.012 + sin(p.z * 2.3 - uTime * 2.4) * 0.014 + sin((p.x + p.z) * 5.0 + uTime * 3.1) * 0.006;
  vL = p.xz; vW = (modelMatrix * vec4(p, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform float uTime, uFront, uHalf; varying vec3 vW; varying vec2 vL;
#include <fog_pars_fragment>
void main() {
  float wob = sin(vL.x * 4.0 + uTime * 2.0) * 0.12 + sin(vL.x * 9.0 - uTime * 3.0) * 0.05;
  float d = uFront + wob - vL.y;                 // how far behind the leading edge (m)
  if (d < 0.0) discard;
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float diff = clamp(dot(n, normalize(vec3(0.3, 1.0, 0.4))), 0.0, 1.0);
  vec3 col = mix(vec3(0.09, 0.30, 0.42), vec3(0.30, 0.64, 0.74), diff * 0.85 + 0.15);
  float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  vec3 R = reflect(-V, n);
  col += vec3(1.0, 0.95, 0.84) * pow(clamp(R.y, 0.0, 1.0), 60.0) * 0.9 + fres * 0.22;   // lamp glints overhead
  float foam = max(smoothstep(0.4, 0.0, d), smoothstep(0.14, 0.0, uHalf - abs(vL.x)) * 0.55);
  foam *= 0.65 + 0.35 * sin(vL.x * 21.0 + vL.y * 13.0 + uTime * 4.0);
  col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam, 0.0, 1.0));
  gl_FragColor = vec4(pow(col, vec3(2.2)), mix(0.8, 0.96, foam) * smoothstep(0.0, 0.05, d));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function waterMesh() {
  const geo = new THREE.PlaneGeometry(Wd - 0.02, Lm, 14, 140); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -Lm / 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFront: { value: -Lm }, uHalf: { value: (Wd - 0.02) / 2 } }]) });
  const m = new THREE.Mesh(geo, mat); m.position.y = 0.02; m.frustumCulled = false; return m;
}
export function buildExit() {
  const g = passage(Lm, C.band);
  lamps(g, [-1.6, -4.9], new THREE.MeshBasicMaterial({ color: C.lamp }));
  const st = col('#9A9187');
  for (let i = 0; i < 7; i++) { const s = box(Wd, 0.2 * (i + 1), 0.45, st); s.position.set(0, 0.1 * (i + 1), -6 - i * 0.45); g.add(s); }
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(Wd, TOP), new THREE.MeshBasicMaterial({ color: '#FFFDF4', fog: false })); sky.position.set(0, TOP / 2, -9.4); g.add(sky);
  // god rays: soft additive beams from the top of the opening, slanting down the stairs towards you
  const rayTex = tex(rayCanvas()), rays = [];
  [[-1.2, 0.9, 0.95, 0.10], [-0.5, 0.6, 0.85, -0.05], [0.15, 1.1, 1.0, 0.04], [0.85, 0.7, 0.9, -0.08], [1.35, 0.5, 0.8, 0.12]].forEach(([x, wdt, tilt, yaw], i) => {
    const len = 8.5, m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, len), new THREE.MeshBasicMaterial({ map: rayTex, color: '#FFF1CC', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.rotation.set(-tilt, yaw, 0); m.position.set(x, TOP - 0.2 - Math.cos(tilt) * len / 2, -9.3 + Math.sin(tilt) * len / 2);
    m.userData.ph = i * 1.7; g.add(m); rays.push(m);
  });
  // dust motes drifting in the light
  const N = 160, pos = new Float32Array(N * 3), dust = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * Wd * 0.9; pos[i * 3 + 1] = 0.3 + Math.random() * (TOP - 0.5); pos[i * 3 + 2] = -9 + Math.random() * 7; }
  dust.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(dust, new THREE.PointsMaterial({ color: '#FFF6DA', size: 0.035, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); g.add(motes);
  const sc = signCanvas(); drawSign(sc, 10);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.43), lam({ map: tex(sc) })); sg.position.set(0, 2.95, -5); g.add(sg);
  g.userData.update = (dt, t) => {
    rays.forEach(r => { r.material.opacity = 0.24 + 0.1 * Math.sin(t * 0.6 + r.userData.ph); });
    const a = dust.attributes.position;
    for (let i = 0; i < N; i++) { let y = a.getY(i) + dt * (0.04 + (i % 5) * 0.012); if (y > TOP - 0.2) y = 0.3; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.03); }
    a.needsUpdate = true;
  };
  return g;
}

export function disposeGroup(g) {
  g.traverse(o => {
    if (o.userData.shared) { if (o.userData.ownMat) o.material.dispose(); return; }
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !m.map.userData.keep) m.map.dispose(); m.dispose(); });
  });
  if (g.parent) g.parent.remove(g);
}
