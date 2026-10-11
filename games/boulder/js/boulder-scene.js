// Boulder — three.js scene pieces shared by the title wall, the climb demo and the character sheet.
import { WALL, HOLD } from './boulder-core.js';

const PPM = 183; // texture pixels per metre
export function plyTexture(T, layout) {
  const W = WALL.w, H = WALL.h, c = document.createElement('canvas');
  c.width = Math.round(W * PPM); c.height = Math.round(H * PPM);
  const g = c.getContext('2d'); let s = 3;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#c9995f'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 420; i++) {
    g.strokeStyle = `rgba(${90 + rnd() * 40},${55 + rnd() * 25},20,${0.04 + rnd() * 0.07})`;
    g.lineWidth = 1 + rnd() * 3; g.beginPath();
    const x = rnd() * c.width; g.moveTo(x, 0);
    g.bezierCurveTo(x + 30 - rnd() * 60, c.height * .33, x + 30 - rnd() * 60, c.height * .66, x + 20 - rnd() * 40, c.height); g.stroke();
  }
  g.strokeStyle = 'rgba(40,28,18,.4)'; g.lineWidth = 3;
  for (let x = 1.22; x < W; x += 1.22) { g.beginPath(); g.moveTo(x * PPM, 0); g.lineTo(x * PPM, c.height); g.stroke(); }
  for (let y = 1.22; y < H; y += 1.22) { g.beginPath(); g.moveTo(0, c.height - y * PPM); g.lineTo(c.width, c.height - y * PPM); g.stroke(); }
  g.fillStyle = 'rgba(40,28,18,.5)';
  for (let y = .1; y < H; y += .2) for (let x = .1 + (Math.round(y * 5) % 2) * .1; x < W; x += .2) { g.beginPath(); g.arc(x * PPM, c.height - y * PPM, 3.2, 0, 7); g.fill(); }
  if (layout) for (const h of layout.holds) if (h.problem >= 0) {
    g.fillStyle = 'rgba(255,255,255,.10)';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse((h.x + W / 2) * PPM + (rnd() - .5) * 30, c.height - h.y * PPM + 8 + rnd() * 20, 16 + rnd() * 20, 8 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
}

// Geometries are shared between every hold of a type (big memory + upload win).
const GEO = {};
function geoFor(T, key, make) { let g = GEO[key]; if (!g) { g = GEO[key] = make(); g.userData.shared = true; } return g; }
export function holdMesh(T, type, color) {
  const m = new T.MeshStandardMaterial({ color, roughness: .72, metalness: 0, flatShading: type === 'volume' });
  const grp = new T.Group(); let geo, z = 0; const sc = [1, 1, 1];
  switch (type) {
    case 'jug': case 'top':
      geo = geoFor(T, 'sphere', () => new T.SphereGeometry(.12, 32, 20)); sc[0] = 1.1; sc[1] = .75; sc[2] = .6; z = .03;
      if (type === 'top') { sc[0] = 2.2; sc[1] = 1.3; sc[2] = 1; z = .05; m.emissive.set(color); m.emissiveIntensity = .4; }
      break;
    case 'crimp': geo = geoFor(T, 'crimp', () => new T.BoxGeometry(.24, .05, .07)); z = .035; break;
    case 'sloper': geo = geoFor(T, 'sloper', () => { const g = new T.SphereGeometry(.15, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(Math.PI / 2); return g; }); sc[2] = .55; break;
    case 'pinch': geo = geoFor(T, 'pinch', () => { const g = new T.CapsuleGeometry(.045, .14, 8, 20); g.rotateZ(Math.PI / 2); return g; }); z = .045; break;
    case 'pocket': {
      geo = geoFor(T, 'pocket', () => new T.TorusGeometry(.075, .045, 16, 32)); z = .03;
      const hole = new T.Mesh(geoFor(T, 'hole', () => new T.CircleGeometry(.05, 28)), HOLE_MAT(T));
      hole.position.z = .02; grp.add(hole); break;
    }
    case 'volume': geo = geoFor(T, 'volume', () => { const g = new T.ConeGeometry(.36, .22, 3); g.rotateX(Math.PI / 2); return g; }); z = .11; break;
    case 'ledge': geo = geoFor(T, 'ledge', () => new T.BoxGeometry(.7, .08, .16)); z = .08; break;
    case 'foot': geo = geoFor(T, 'foot', () => new T.SphereGeometry(.06, 18, 12)); sc[0] = 1.25; sc[1] = .7; sc[2] = .55; z = .02; break;
  }
  const mesh = new T.Mesh(geo, m); mesh.scale.set(sc[0], sc[1], sc[2]);
  mesh.position.z = z; mesh.castShadow = true; mesh.receiveShadow = false; // self-shadowing small round holds causes striping
  grp.add(mesh); grp.userData.mat = m; grp.userData.base = new T.Color(color);
  return grp;
}
let _hole = null; const HOLE_MAT = T => _hole || (_hole = new T.MeshStandardMaterial({ color: '#1a120c', roughness: 1 }));
export const surfaceZ = type => type === 'volume' ? .18 : type === 'ledge' ? .15 : type === 'top' ? .13 : type === 'sloper' ? .1 : .09;
let _plainPly = null;
function plainPly(T) { if (!_plainPly) { _plainPly = plyTexture(T); _plainPly.userData.shared = true; } return _plainPly; }
export { plainPly };
// Merge many static meshes into one geometry (one draw call per colour).
function merge(T, parts) {
  let n = 0; const gs = parts.map(({ geo, matrix }) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(matrix); n += g.attributes.position.count; return g; });
  const hasUv = gs.every(g => g.attributes.uv), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = hasUv ? new Float32Array(n * 2) : null; let o = 0;
  gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); });
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
// Soft contact shadow under every hold so it sits snugly on the plywood.
let _aoTex = null;
export function aoTexture(T) {
  if (_aoTex) return _aoTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(.55, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _aoTex = new T.CanvasTexture(c); _aoTex.userData.shared = true; return _aoTex;
}
export function aoMaterial(T) { return new T.MeshBasicMaterial({ map: aoTexture(T), transparent: true, depthWrite: false, color: '#000' }); }
export function aoQuad(T, h) {
  const big = h.type === 'volume' || h.type === 'ledge', w = h.r * (big ? 2.5 : 2.9), ht = h.r * (big ? 2.1 : 2.3);
  const m = new T.Mesh(new T.PlaneGeometry(w, ht), aoMaterial(T)); m.position.set(h.x + .01, h.y - .018, .003); m.rotation.z = h.rot || 0; m.renderOrder = 1; return m;
}
export function buildWall(T, layout) {
  const group = new T.Group(), meshes = [], filler = [];
  const ply = new T.Mesh(new T.BoxGeometry(WALL.w, WALL.h, .12), new T.MeshStandardMaterial({ map: layout.holds.length ? plyTexture(T, layout) : plainPly(T), roughness: .9 }));
  ply.position.set(0, WALL.h / 2, -.06); ply.receiveShadow = true; group.add(ply);
  const edge = new T.MeshStandardMaterial({ color: '#2b2420', roughness: .8 });
  const lip = new T.Mesh(new T.BoxGeometry(WALL.w + .1, .08, .2), edge); lip.position.set(0, WALL.h + .04, -.04); group.add(lip);
  const wingMat = new T.MeshStandardMaterial({ map: plainPly(T), color: '#d9c2a3', roughness: .9 }), A = .45, WW = 3.4;
  [-1, 1].forEach(s => {
    const wing = new T.Mesh(new T.BoxGeometry(WW, WALL.h, .12), wingMat);
    wing.position.set(s * (WALL.w / 2 + WW / 2 * Math.cos(A)), WALL.h / 2, WW / 2 * Math.sin(A) - .06);
    wing.rotation.y = -s * A; wing.receiveShadow = true; group.add(wing);
    const trim = new T.Mesh(new T.BoxGeometry(.06, WALL.h + .1, .14), edge); trim.position.set(s * WALL.w / 2, WALL.h / 2, -.02); group.add(trim);
    const wlip = new T.Mesh(new T.BoxGeometry(WW, .08, .2), edge); wlip.position.set(wing.position.x, WALL.h + .04, wing.position.z); wlip.rotation.y = wing.rotation.y; group.add(wlip);
  });
  const buckets = new Map(), tickGeo = geoFor(T, 'tick', () => new T.BoxGeometry(.1, .026, .03)), tickMat = new T.MeshStandardMaterial({ color: '#f5f1e8', roughness: .6 });
  const aoParts = [];
  for (const h of layout.holds) {
    { const q = aoQuad(T, h); q.updateMatrixWorld(true); aoParts.push({ geo: q.geometry, matrix: q.matrixWorld.clone() }); }
    const g = holdMesh(T, h.type, h.color);
    g.position.set(h.x, h.y, 0); g.rotation.z = h.rot; g.userData.hold = h;
    if (h.problem < 0) { // filler: bake into one mesh per colour
      g.updateMatrixWorld(true);
      g.children.forEach(m => { const key = m.material === HOLE_MAT(T) ? 'hole' : h.color + (h.type === 'volume' ? '|f' : ''); if (!buckets.has(key)) buckets.set(key, { mat: m.material, parts: [] }); buckets.get(key).parts.push({ geo: m.geometry, matrix: m.matrixWorld.clone() }); });
      continue;
    }
    if (h.dir) { const tick = new T.Mesh(tickGeo, tickMat); tick.position.set(0, h.r * .72, .08); g.add(tick); }
    if (h.jump) {
      const halo = new T.Mesh(geoFor(T, 'halo' + h.r, () => new T.TorusGeometry(h.r + .08, .014, 6, 32)), new T.MeshStandardMaterial({ color: '#ffd32a', emissive: '#ffd32a', emissiveIntensity: .6 }));
      halo.position.z = .02; g.add(halo); g.userData.halo = halo;
    }
    group.add(g); meshes[h.id] = g;
  }
  if (aoParts.length) { const ao = new T.Mesh(merge(T, aoParts), aoMaterial(T)); ao.renderOrder = 1; group.add(ao); }
  buckets.forEach(({ mat, parts }, key) => {
    const m = new T.Mesh(merge(T, parts), key === 'hole' ? mat : mat.clone()); m.castShadow = key !== 'hole'; m.receiveShadow = false;
    group.add(m); if (key !== 'hole') filler.push({ mesh: m, base: m.material.color.clone() });
  });
  for (const p of layout.problems) {
    const tapeAt = (h, label) => {
      const big = label === 'top', tape = new T.Mesh(new T.BoxGeometry(big ? .42 : .16, big ? .07 : .045, .004), new T.MeshStandardMaterial({ color: label === 'top' ? '#ffd32a' : p.color, roughness: .6 }));
      tape.position.set(h.x, big ? h.y + h.r + .08 : h.y - h.r - .06, .002); tape.rotation.z = (h.id % 2 ? 1 : -1) * .08; group.add(tape);
    };
    p.startIds.forEach(id => { const h = layout.holds[id]; if (h.type !== 'volume' && h.y > .8) tapeAt(h); });
    tapeAt(layout.holds[p.top], 'top');
  }
  return { group, meshes, filler };
}
export function disposeWall(wall) {
  wall.group.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && o.material !== _hole) { if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose(); o.material.dispose(); }
  });
}
export function focusRoute(wall, layout, pi, dim = .72) {
  const ply = new (wall.group.children[0].material.color.constructor)('#8f7457');
  for (const g of wall.meshes) {
    if (!g) continue;
    const h = g.userData.hold, m = g.userData.mat, on = pi == null || h.problem === pi;
    m.color.copy(g.userData.base); if (!on) m.color.lerp(ply, dim);
    if (h.type !== 'top') { m.emissive.set(on && pi != null ? h.color : '#000'); m.emissiveIntensity = on && pi != null ? .12 : 0; }
    else m.emissiveIntensity = on ? .4 : 0;
    if (g.userData.halo) g.userData.halo.visible = on;
  }
  (wall.filler || []).forEach(f => { f.mesh.material.color.copy(f.base); if (pi != null) f.mesh.material.color.lerp(ply, dim); });
}

export function addEnvironment(T, scene) {
  scene.background = new T.Color('#14100d'); scene.fog = new T.Fog('#14100d', 7, 15);
  scene.add(new T.HemisphereLight('#fff1dc', '#3a2a1e', .9));
  const key = new T.SpotLight('#ffe6c4', 70, 24, .8, .6, 1.4);
  key.position.set(2, 6.5, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00015; key.shadow.normalBias = .025; key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new T.PointLight('#9fb8ff', 7, 14); fill.position.set(-4, 1.5, 4); scene.add(fill);
  const mat = new T.Mesh(new T.BoxGeometry(WALL.w + 4, .3, 2.6), new T.MeshStandardMaterial({ color: '#2b2f3a', roughness: 1 }));
  mat.position.set(0, -.15, 1.25); mat.receiveShadow = true; scene.add(mat);
  const back = new T.Mesh(new T.PlaneGeometry(50, 24), new T.MeshStandardMaterial({ color: '#3a302a', roughness: 1 }));
  back.position.set(0, 10, -4); back.receiveShadow = true; scene.add(back);
  const floor = new T.Mesh(new T.PlaneGeometry(40, 12), new T.MeshStandardMaterial({ color: '#1d1916', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.3, 3); scene.add(floor);
  return { key, fill };
}

// ---------- Climbers: Caleb, Ezra (and the original Pip look) ----------
export const PIP = { skin: '#a8714a', chalk: '#efe6da', tee: '#27324d', legs: '#3a3330', shoe: '#d2452f', sole: '#f5f1e8', hair: '#3b2417', band: '#f5f1e8', bag: '#f08a2c' };
const DEFAULT_LOOK = { skin: '#a8714a', hair: '#3b2417', hairStyle: 'short', tee: '#27324d', legs: '#3a3330', shoes: '#d2452f', bag: '#f08a2c', band: '#f5f1e8', hat: '#e5484d', teePattern: 'plain', teeAccent: '#f5f1e8', teePrint: 'none', teeName: '' };
export const CHARACTERS = {
  caleb: { name: 'Caleb', skin: '#b98260', hair: '#3b2417', hairStyle: 'short', tee: '#27324d', legs: '#3a3330', shoes: '#d2452f', bag: '#f08a2c', band: '#f5f1e8', hat: '#e5484d', teePattern: 'plain', teeAccent: '#f08a2c', teePrint: 'landscape', teeName: '' },
  ezra:  { name: 'Ezra',  skin: '#b98260', hair: '#e0c27a', hairStyle: 'curly', tee: '#2e6f73', legs: '#2b2f3a', shoes: '#3f8ff0', bag: '#f2d23c', band: 'none', hat: '#3f8ff0', teePattern: 'stripes', teeAccent: '#f2d23c', teePrint: 'none', teeName: '' }
};

// Fonts used on canvases (tee prints) and DOM overlays. Injected if the page didn't load them.
const FONTS = [['Lilita+One', 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap'], ['Material+Symbols+Rounded', 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,600,1,0&display=block']];
let fontsP = null, fontsOk = false;
export function ensureFonts() {
  if (fontsP) return fontsP;
  const ready = ([frag, href]) => {
    let l = [...document.querySelectorAll('link[rel="stylesheet"]')].find(x => x.href.includes(frag));
    if (!l) { l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
    return new Promise(res => { try { if (l.sheet && l.sheet.cssRules) return res(); } catch (e) { return res(); } l.addEventListener('load', res, { once: true }); l.addEventListener('error', res, { once: true }); setTimeout(res, 4000); });
  };
  fontsP = Promise.all(FONTS.map(ready))
    .then(() => Promise.all([document.fonts.load("56px 'Lilita One'", 'CALEB'), document.fonts.load("150px 'Material Symbols Rounded'", 'bolt')]))
    .catch(() => {}).then(() => { fontsOk = true; });
  return fontsP;
}
const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; };
// Tee texture: u wraps the torso (0.5 = middle of the back), v = height (1 = shoulders).
export function drawTee(c, L) {
  const cv = c.teeCanvas, g = cv.getContext('2d'), W = cv.width, H = cv.height, A = L.teeAccent || '#f5f1e8';
  g.fillStyle = L.tee; g.fillRect(0, 0, W, H);
  g.fillStyle = A; g.strokeStyle = A;
  let sd = 9; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  switch (L.teePattern) {
    case 'stripes': for (let y = 34; y < H; y += 72) g.fillRect(0, y, W, 26); break;
    case 'half': g.fillRect(W / 2, 0, W / 2, H); break;
    case 'dots': for (let y = 28, r = 0; y < H; y += 64, r++) for (let x = (r % 2) * 32; x <= W; x += 64) { g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); } break;
    case 'zigzag': g.lineWidth = 34; g.lineJoin = 'miter'; g.beginPath(); for (let x = 0, k = 0; x <= W; x += 64, k++) g.lineTo(x, 400 + (k % 2 ? 30 : -30)); g.stroke(); break;
    case 'splat': for (let i = 0; i < 22; i++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 26; [-W, 0, W].forEach(o => { g.beginPath(); g.arc(x + o, y, r, 0, 7); g.fill(); }); for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (rnd() - .5) * r * 3, y + (rnd() - .5) * r * 3, 3 + rnd() * 6, 0, 7); g.fill(); } } break;
  }
  if (fontsOk) {
    const ink = lum(L.tee) > .55 ? '#14100d' : '#f5f1e8', halo = L.teePattern && L.teePattern !== 'plain' ? L.tee : null;
    const text = (str, font, x, y) => { g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; if (halo) { g.lineWidth = 14; g.lineJoin = 'round'; g.strokeStyle = halo; g.strokeText(str, x, y); } g.fillStyle = ink; g.fillText(str, x, y); };
    if (L.teePrint && L.teePrint !== 'none') {
      text(L.teePrint, "150px 'Material Symbols Rounded'", W / 2, 268);
      text(L.teePrint, "60px 'Material Symbols Rounded'", 0, 150); text(L.teePrint, "60px 'Material Symbols Rounded'", W, 150);
    }
    if (L.teeName) text(String(L.teeName).toUpperCase().slice(0, 8), "58px 'Lilita One'", W / 2, 128);
  }
  c.teeTex.needsUpdate = true;
}
export function lookFor(character, over) { return Object.assign({}, DEFAULT_LOOK, CHARACTERS[character] || {}, over || {}); }
const SEG = { ua: .34, fa: .32, th: .44, sh: .43 };
export const BODY_Z = .34;
const TILT = .55;

export function makeClimber(T, look) {
  const mat = c => new T.MeshStandardMaterial({ color: c, roughness: .78 });
  const M = { skin: mat('#a8714a'), chalk: mat('#efe6da'), tee: mat('#27324d'), legs: mat('#3a3330'), shoe: mat('#d2452f'), sole: mat('#f5f1e8'), hair: mat('#3b2417'), band: mat('#f5f1e8'), bag: mat('#f08a2c'), hat: mat('#e5484d'), ink: new T.MeshStandardMaterial({ color: '#1a1210', roughness: .35 }) };
  const root = new T.Group(), head = new T.Group(); root.add(head);
  const add = (geo, m, parent = root) => { const o = new T.Mesh(geo, m); o.castShadow = true; parent.add(o); return o; };
  const cyl = (r, m) => add(new T.CylinderGeometry(r, r * .92, 1, 14), m);
  const sph = (r, m, p = root) => add(new T.SphereGeometry(r, 18, 12), m, p);
  const c = { root, head, M };
  c.teeCanvas = document.createElement('canvas'); c.teeCanvas.width = 1024; c.teeCanvas.height = 512;
  c.teeTex = new T.CanvasTexture(c.teeCanvas); c.teeTex.colorSpace = T.SRGBColorSpace; c.teeTex.anisotropy = 4;
  M.teeArt = new T.MeshStandardMaterial({ map: c.teeTex, roughness: .8 });
  const tg = new T.CapsuleGeometry(.15, .24, 8, 32); tg.rotateY(Math.PI);
  { const p = tg.attributes.position, uv = tg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + .27) / .54); }
  c.torso = add(tg, M.teeArt); c.torso.scale.set(1.22, 1, .78);
  c.pelvis = add(new T.SphereGeometry(.15, 18, 12), M.legs); c.pelvis.scale.set(1.15, .72, .85);
  c.neck = cyl(.05, M.skin);
  const skull = add(new T.SphereGeometry(.15, 28, 20), M.skin, head); skull.scale.set(.94, 1.04, .98);
  [-1, 1].forEach(s => { const e = sph(.036, M.skin, head); e.scale.set(.55, 1, .85); e.position.set(s * .142, -.01, 0); });
  [-1, 1].forEach(s => {
    const eye = sph(.021, M.ink, head); eye.position.set(s * .052, .008, -.136); eye.scale.set(1, 1.25, .7);
    const glint = add(new T.SphereGeometry(.006, 8, 6), M.chalk, head); glint.position.set(s * .052 + .006, .016, -.15);
    const brow = add(new T.BoxGeometry(.046, .011, .012), M.hair, head); brow.position.set(s * .054, .052, -.14); brow.rotation.z = -s * .14;
  });
  const nose = sph(.019, M.skin, head); nose.position.set(0, -.014, -.15);
  const mouth = add(new T.TorusGeometry(.03, .0075, 6, 16, Math.PI), M.ink, head); mouth.position.set(0, -.048, -.138); mouth.rotation.z = Math.PI;
  const capGeo = new T.SphereGeometry(.158, 28, 16, 0, Math.PI * 2, 0, Math.PI * .56);
  const mk = () => { const g = new T.Group(); head.add(g); return g; };
  c.hair = { short: mk(), curly: mk(), beanie: mk() };
  const cap = p => { const m = add(capGeo, M.hair, p); m.scale.set(.95, 1.03, 1); m.rotation.x = TILT; return m; };
  cap(c.hair.short);
  cap(c.hair.curly);
  for (let k = 0; k < 26; k++) {
    const th = .15 + (k % 6) * .23, ph = k * 2.39996;
    const d = new T.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    d.applyAxisAngle(new T.Vector3(1, 0, 0), TILT * .6);
    if (d.z < -.35 && d.y < .55) continue;
    const b = sph(.052, M.hair, c.hair.curly); b.position.copy(d.multiplyScalar(.152));
  }
  { const g = c.hair.beanie, dome = add(new T.SphereGeometry(.168, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.hat, g); dome.scale.y = 1.12;
    const rim = add(new T.TorusGeometry(.162, .034, 10, 32), M.hat, g); rim.rotation.x = Math.PI / 2; rim.position.y = .01;
    const pom = sph(.05, M.hat, g); pom.position.y = .2; g.position.y = .03; g.rotation.x = .18; }
  c.band = add(new T.TorusGeometry(.146, .022, 10, 32), M.band, head);
  c.band.position.set(0, Math.cos(TILT) * .05, Math.sin(TILT) * .05); c.band.rotation.x = TILT - Math.PI / 2;
  c.bag = add(new T.CylinderGeometry(.065, .06, .11, 16), M.bag);
  c.bagRim = add(new T.TorusGeometry(.064, .012, 6, 18), M.chalk);
  c.limbs = {};
  for (const l of ['LH', 'RH', 'LF', 'RF']) {
    const hand = l[1] === 'H';
    c.limbs[l] = hand
      ? { sleeve: sph(.068, M.tee), a: cyl(.052, M.skin), b: cyl(.046, M.skin), joint: sph(.05, M.skin), end: sph(.066, M.chalk) }
      : { a: cyl(.078, M.legs), b: cyl(.062, M.legs), joint: sph(.066, M.legs), end: add(new T.BoxGeometry(.11, .085, .22), M.shoe), sole: add(new T.BoxGeometry(.115, .02, .23), M.sole) };
  }
  applyLook(c, look || DEFAULT_LOOK);
  return c;
}
export function applyLook(c, look) {
  const L = Object.assign({}, DEFAULT_LOOK, look), M = c.M;
  M.skin.color.set(L.skin); M.hair.color.set(L.hair); M.tee.color.set(L.tee); M.legs.color.set(L.legs);
  M.shoe.color.set(L.shoes); M.bag.color.set(L.bag); M.hat.color.set(L.hat);
  for (const k in c.hair) c.hair[k].visible = k === (c.hair[L.hairStyle] ? L.hairStyle : 'short');
  const bandOn = L.band && L.band !== 'none' && L.hairStyle !== 'beanie';
  c.band.visible = !!bandOn; if (bandOn) M.band.color.set(L.band);
  c.look = L; drawTee(c, L);
  if (!fontsOk) ensureFonts().then(() => drawTee(c, c.look));
}

const _a = { x: 0, y: 0, z: 0 };
function ik(T, A, C, l1, l2, pole) {
  const d0 = A.distanceTo(C), d = Math.min(Math.max(d0, .05), (l1 + l2) * .999);
  const dir = C.clone().sub(A).normalize();
  const end = A.clone().addScaledVector(dir, d);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const po = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const B = A.clone().addScaledVector(dir, along).addScaledVector(po, h);
  return { B, end };
}
const UP = { x: 0, y: 1, z: 0 };
function seg(T, mesh, a, b) {
  const v = b.clone().sub(a), len = v.length();
  mesh.position.copy(a).addScaledVector(v, .5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
  mesh.scale.y = len;
}
// P = pelvis [x, y] (wall-local), ends = {LH:[x,y,z], ...}
export function poseClimber(T, c, P, ends) {
  const V = (x, y, z) => new T.Vector3(x, y, z), z = BODY_Z, [px, py] = P;
  c.pelvis.position.set(px, py, z);
  c.torso.position.set(px, py + .27, z);
  c.neck.position.set(px, py + .53, z); c.neck.scale.y = .1;
  c.head.position.set(px, py + .71, z + .01);
  c.bag.position.set(px, py + .02, z + .15); c.bagRim.position.set(px, py + .075, z + .15); c.bagRim.rotation.x = Math.PI / 2;
  for (const l in c.limbs) {
    const L = c.limbs[l], hand = l[1] === 'H', s = l[0] === 'L' ? -1 : 1;
    const A = hand ? V(px + s * .2, py + .5, z) : V(px + s * .12, py - .04, z - .02);
    const C = V(...ends[l]);
    const pole = hand ? V(s * .8, -1, .6) : V(s, .1, .9);
    const { B, end } = ik(T, A, C, hand ? SEG.ua : SEG.th, hand ? SEG.fa : SEG.sh, pole.normalize());
    seg(T, L.a, A, B); seg(T, L.b, B, end); L.joint.position.copy(B);
    if (hand) { L.sleeve.position.copy(A); L.end.position.copy(end); }
    else { L.end.position.set(end.x, end.y + .02, end.z + .05); L.sole.position.set(end.x, end.y - .03, end.z + .05); }
  }
}
export function danglePoint(l, P) {
  const s = l[0] === 'L' ? -1 : 1, [px, py] = P;
  return l[1] === 'H' ? [px + s * .3, py + .02, BODY_Z + .1] : [px + s * .14, py - .82, BODY_Z + .08];
}
