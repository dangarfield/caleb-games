/* room3d.js — the Three.js room engine from the Claude Design handoff (research/New game design overview/room3d.js).
 * Walls with window holes, KayKit models, code-built props, code-built buttons (shared geometry per shape,
 * shared materials per feature combo), clue things, openable doors/lids/cupboards, the camera (wide view,
 * drag to turn, tap a wall to zoom) and the inspect close-up.
 * Changes for the build: three via the importmap; one shared renderer (gl.js) with a pixel-ratio cap, a 1024
 * shadow map and a quality governor; setRound() swaps the buttons and clue things between rounds without
 * rebuilding the furniture; the inspect close-up reuses one small renderer; dispose() frees the GPU. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getRenderer, detach, disposeScene, governor, isLow } from './gl.js';

const COL = { red: ['#F2424F', '#B8233A', '#FF9AA2'], orange: ['#FF8A2A', '#C45A0E', '#FFBE7A'], yellow: ['#FFD23A', '#CF950A', '#FFF0A0'], green: ['#45C46A', '#22884A', '#9BE8B0'], blue: ['#3C8CF0', '#1E5AB5', '#9CC8FF'], purple: ['#9A5BE0', '#6433A6', '#CFAEF7'], pink: ['#FF7FC0', '#CF4A8C', '#FFC0E0'], white: ['#F7F4EE', '#BDB3A4', '#FFFFFF'], black: ['#3A3442', '#16121C', '#76708A'] };
function poly(n, r1, r2, cy) { const N = r2 ? n * 2 : n, p = []; for (let i = 0; i < N; i++) { const r = r2 && i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI * 2 / N; p.push((50 + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1)); } return 'M' + p.join(' L') + ' Z'; }
const SHAPES = { circle: 'M6 48 A44 44 0 1 0 94 48 A44 44 0 1 0 6 48 Z', square: 'M24 6 H76 Q94 6 94 24 V72 Q94 90 76 90 H24 Q6 90 6 72 V24 Q6 6 24 6 Z', triangle: 'M50 6 Q57 6 61 13 L95 76 Q99 88 86 88 H14 Q1 88 5 76 L39 13 Q43 6 50 6 Z', star: poly(5, 50, 23, 52), heart: 'M50 90 C20 70 4 52 4 32 C4 17 16 6 30 6 C39 6 46 11 50 18 C54 11 61 6 70 6 C84 6 96 17 96 32 C96 52 80 70 50 90 Z', hexagon: poly(6, 47, 0, 48), cloud: 'M26 84 C12 84 4 74 4 63 C4 51 14 44 24 45 C25 30 36 20 50 20 C62 20 71 28 74 39 C86 38 97 48 97 61 C97 74 87 84 74 84 Z', arrow: 'M8 34 H50 V14 Q50 6 57 11 L95 43 Q100 48 95 53 L57 85 Q50 90 50 82 V62 H8 Q3 62 3 57 V39 Q3 34 8 34 Z' };
const CENTER = { circle: [50, 48, 1], square: [50, 48, 1], triangle: [50, 62, .7], star: [50, 54, .66], heart: [50, 42, .85], hexagon: [50, 48, .95], cloud: [51, 58, .8], arrow: [44, 48, .72] };
const PICS = { sun: ['M12 20 A8 8 0 1 0 28 20 A8 8 0 1 0 12 20 Z M20 2 V6 M20 34 V38 M2 20 H6 M34 20 H38 M7.5 7.5 L10.5 10.5 M29.5 29.5 L32.5 32.5 M7.5 32.5 L10.5 29.5 M29.5 10.5 L32.5 7.5', ''], fish: ['M3 20 Q15 6 28 20 Q15 34 3 20 Z M27 20 L38 10 V30 Z', 'M9 17.5 A2.8 2.8 0 1 0 14.6 17.5 A2.8 2.8 0 1 0 9 17.5 Z'], skull: ['M20 3 C10 3 4 10 4 18 C4 24 8 27 12 28.5 V36 H28 V28.5 C32 27 36 24 36 18 C36 10 30 3 20 3 Z', 'M9.5 18 A4.5 4.5 0 1 0 18.5 18 A4.5 4.5 0 1 0 9.5 18 Z M21.5 18 A4.5 4.5 0 1 0 30.5 18 A4.5 4.5 0 1 0 21.5 18 Z'], crown: ['M4 32 L6 10 L14 19 L20 6 L26 19 L34 10 L36 32 Z', ''], lightning: ['M25 2 L7 23 H18 L14 38 L33 15 H22 L26 2 Z', ''] };
const SIZE = { tiny: .26, normal: .38, big: .50, giant: 1.12 };
const INK = '#3B2A4A';
const MODEL_LOADER = new GLTFLoader(), MODEL_CACHE = {};
const HUD_TOP = 100, SHIFT = 50;
const FOV = 42, STAGE_W = 1333, STAGE_H = 690, PANEL = 316;

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55 }, o || {}));

// ---------- buttons (geometry, textures and materials shared) ----------
const geoCache = {};
function shapeGeos(name) {
  if (geoCache[name]) return geoCache[name];
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${SHAPES[name]}"/></svg>`);
  const src = SVGLoader.createShapes(data.paths[0]);
  const sh = src.map(s => { const pts = s.getPoints(20); return { cap: new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.y))), hous: new THREE.Shape(pts.map(p => new THREE.Vector2(50 + (p.x - 50) * 1.13, -(48 + (p.y - 48) * 1.13)))) }; });
  const cap = new THREE.ExtrudeGeometry(sh.map(s => s.cap), { depth: 5, bevelEnabled: true, bevelThickness: 6, bevelSize: 5, bevelOffset: -5, bevelSegments: 5, curveSegments: 20 });
  const hous = new THREE.ExtrudeGeometry(sh.map(s => s.hous), { depth: 3, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelOffset: -2, bevelSegments: 2, curveSegments: 20 });
  for (const g of [cap, hous]) { g.translate(-50, 48, 0); g.scale(.01, .01, .01); }
  return geoCache[name] = { cap, hous };
}
const texCache = {};
function capTexture(f, res) {
  const key = [f.shape, f.color, f.finish, f.sym, res].join('|');
  if (texCache[key]) return texCache[key];
  const [base, deep, light] = COL[f.color] || COL.red;
  const t = canvasTex(res, res, g => {
    g.scale(res / 100, res / 100);
    const gr = g.createLinearGradient(0, 0, 0, 100);
    gr.addColorStop(0, f.finish === 'rubbery' ? base : mix(base, light, .45).getStyle()); gr.addColorStop(.55, base); gr.addColorStop(1, mix(base, deep, .35).getStyle());
    g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
    if (f.finish === 'stripy') { g.save(); g.fillStyle = 'rgba(255,255,255,.55)'; g.translate(50, 50); g.rotate(40 * Math.PI / 180); for (let x = -100; x < 100; x += 16) g.fillRect(x, -100, 7, 200); g.restore(); }
    if (f.finish === 'spotty') { g.fillStyle = 'rgba(255,255,255,.75)'; for (let y = 5; y < 100; y += 20) for (let x = 5; x < 100; x += 20) { g.beginPath(); g.arc(x + ((y / 20 | 0) % 2) * 10, y, 3.8, 0, 7); g.fill(); } }
    if (f.finish !== 'rubbery') { g.save(); g.translate(33, 25); g.rotate(-28 * Math.PI / 180); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(0, 0, 16, 6.5, 0, 0, 7); g.fill(); g.restore(); }
    const sym = f.sym == null || f.sym === '' ? null : String(f.sym);
    if (sym) {
      const [cx, cy, k] = CENTER[f.shape] || CENTER.circle;
      const lightSym = ['yellow', 'white', 'pink'].includes(f.color);
      const fill = lightSym ? INK : '#FFFFFF', stroke = lightSym ? 'rgba(255,255,255,.6)' : 'rgba(40,20,60,.4)';
      if (PICS[sym]) {
        const ps = 1.12 * k; g.save(); g.translate(cx - 20 * ps, cy - 20 * ps); g.scale(ps, ps);
        const p1 = new Path2D(PICS[sym][0]); g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 3.5; g.lineJoin = 'round'; g.lineCap = 'round'; g.fill(p1); g.stroke(p1);
        if (PICS[sym][1]) { g.fillStyle = base; g.fill(new Path2D(PICS[sym][1])); } g.restore();
      } else {
        g.font = `700 ${(sym.length > 1 ? 36 : 50) * k}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = stroke; g.strokeText(sym, cx, cy + 2); g.fillStyle = fill; g.fillText(sym, cx, cy + 2);
      }
    }
  });
  t.repeat.set(.01, .01); t.offset.set(0, 1);
  return texCache[key] = t;
}
const matCache = {};
function btnMats(f, res, faded) {
  const key = [f.shape, f.color, f.finish, f.sym, res, faded ? 1 : 0].join('|');
  if (matCache[key]) return matCache[key];
  const [base, deep] = COL[f.color] || COL.red;
  const map = capTexture(f, res), rub = f.finish === 'rubbery', glow = f.finish === 'glowing';
  const fo = faded ? { transparent: true, opacity: .2, depthWrite: false } : {};
  const cap = new THREE.MeshPhysicalMaterial(Object.assign({ map, roughness: rub ? .85 : .32, clearcoat: rub ? 0 : .7, clearcoatRoughness: .18, emissive: glow ? new THREE.Color(base) : new THREE.Color(0), emissiveMap: glow ? map : null, emissiveIntensity: glow ? .8 : 0 }, fo));
  const side = new THREE.MeshPhysicalMaterial(Object.assign({ color: mix(base, deep, .3), roughness: rub ? .85 : .35, clearcoat: rub ? 0 : .5, emissive: glow ? new THREE.Color(base) : new THREE.Color(0), emissiveIntensity: glow ? .45 : 0 }, fo));
  const hous = new THREE.MeshStandardMaterial(Object.assign({ color: INK, roughness: .55 }, fo));
  return matCache[key] = { cap, side, hous };
}
function makeButton(f, res) {
  const { cap, hous } = shapeGeos(f.shape);
  const m = btnMats(f, res || 128, false);
  const g = new THREE.Group();
  const h = new THREE.Mesh(hous, m.hous), c = new THREE.Mesh(cap, [m.cap, m.side]);
  c.position.z = .035; h.castShadow = c.castShadow = true;
  g.add(h, c);
  g.userData.cap = c; g.userData.hous = h; g.userData.feat = f; g.userData.res = res || 128;
  return g;
}
function setFaded(btn, on) {
  if (btn.userData.faded === on) return; btn.userData.faded = on;
  const m = btnMats(btn.userData.feat, btn.userData.res, on);
  btn.userData.cap.material = [m.cap, m.side]; btn.userData.hous.material = m.hous;
  btn.userData.cap.castShadow = btn.userData.hous.castShadow = !on;
}

// ---------- clue things ----------
function glowTex() { return canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,150,1)'); r.addColorStop(.35, 'rgba(255,225,120,.55)'); r.addColorStop(1, 'rgba(255,225,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }); }
function starTex() { return canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(36, 28, 62, 32); g.quadraticCurveTo(36, 36, 32, 62); g.quadraticCurveTo(28, 36, 2, 32); g.quadraticCurveTo(28, 28, 32, 2); g.fill(); }); }
let GLOW, STAR;
function makeThing(type) {
  const g = new THREE.Group(), add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; g.add(m); return m; };
  if (type === 'note') {
    add(new RoundedBoxGeometry(.42, .52, .03, 2, .03), std('#FFFDF4'), 0, 0, .02).rotation.z = -.08;
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(i === 2 ? .18 : .28, .03, .01), std('#9C8BB0'), i === 2 ? -.05 : 0, .08 - i * .1, .045);
    add(new THREE.SphereGeometry(.05, 16, 12), std('#F2424F'), 0, .22, .06);
  } else if (type === 'parrot') {
    add(new THREE.SphereGeometry(.16, 20, 16), std('#45C46A'), 0, -.05, .12).scale.set(1, 1.3, 1);
    add(new THREE.SphereGeometry(.12, 20, 16), std('#F2424F'), .02, .22, .14);
    add(new THREE.ConeGeometry(.05, .14, 12), std('#FFC93C'), .14, .2, .16).rotation.z = -Math.PI / 2;
    add(new THREE.SphereGeometry(.025, 10, 8), std(INK), .08, .26, .24);
    add(new THREE.CylinderGeometry(.02, .02, .4, 8), std('#A8683E'), 0, -.26, .1).rotation.z = Math.PI / 2;
  } else if (type === 'tv') {
    add(new RoundedBoxGeometry(.58, .44, .3, 3, .06), std('#A8683E'), 0, 0, .15);
    const scr = canvasTex(64, 48, (c) => { for (let y = 0; y < 48; y += 4) { c.fillStyle = y % 8 ? '#5CD6C6' : '#9FF5E6'; c.fillRect(0, y, 64, 4); } });
    add(new THREE.PlaneGeometry(.44, .32), new THREE.MeshBasicMaterial({ map: scr }), -.02, 0, .305);
    add(new THREE.CylinderGeometry(.012, .012, .25, 6), std(INK), -.08, .32, .15).rotation.z = .4;
    add(new THREE.CylinderGeometry(.012, .012, .25, 6), std(INK), .08, .32, .15).rotation.z = -.4;
  } else if (type === 'cookie') {
    add(new THREE.SphereGeometry(.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#F0B860', { side: THREE.DoubleSide }), 0, -.08, .12).scale.set(1.2, .9, .8);
    add(new THREE.BoxGeometry(.2, .06, .01), std('#FFFFFF'), .18, -.05, .2).rotation.z = .3;
  } else {
    add(new THREE.CylinderGeometry(.11, .11, .38, 20), new THREE.MeshPhysicalMaterial({ color: '#8FE0D6', transparent: true, opacity: .55, roughness: .1, clearcoat: 1 }), 0, 0, .14).rotation.z = -.6;
    add(new THREE.CylinderGeometry(.06, .06, .22, 12), std('#FFFDF4'), 0, 0, .14).rotation.z = -.6;
    add(new THREE.CylinderGeometry(.05, .05, .08, 12), std('#A8683E'), .16, .12, .14).rotation.z = -.6;
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(.8); glow.position.z = .05; g.add(glow); g.scale.setScalar(.72);
  const stars = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: STAR, color: i % 2 ? '#FFFFFF' : '#FFD23A', depthWrite: false, transparent: true })); s.position.set([-.3, .32, .05][i], [.3, .12, -.34][i], .3); g.add(s); stars.push(s); }
  g.userData.glow = glow; g.userData.stars = stars;
  return g;
}

// ---------- code-built props ----------
function rbox(w, h, d, mat, r) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r ?? .06, w / 2 - .001, h / 2 - .001, d / 2 - .001)), mat); m.castShadow = m.receiveShadow = true; return m; }
function consoleTex(seed) {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = '#16203C'; g.fillRect(0, 0, 256, 96); let s = seed || 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const cols = ['#7CF4E3', '#FFD23A', '#FF6B7A', '#9BE8B0', '#9CC8FF'];
    for (let y = 10; y < 90; y += 20) for (let x = 10; x < 250; x += 22) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.globalAlpha = .5 + rnd() * .5; g.beginPath(); g.roundRect ? g.roundRect(x, y, 14, 10, 3) : g.rect(x, y, 14, 10); g.fill(); }
    g.globalAlpha = 1;
  });
}
function mapTex() {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#10203A'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(124,244,227,.18)'; g.lineWidth = 1; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.strokeStyle = '#FF6B7A'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(40, 200); g.bezierCurveTo(120, 200, 140, 40, 220, 40); g.bezierCurveTo(300, 40, 280, 190, 330, 170); g.bezierCurveTo(420, 140, 360, 60, 420, 60); g.bezierCurveTo(480, 60, 480, 210, 440, 214); g.lineTo(60, 214); g.stroke();
    g.beginPath(); g.arc(300, 120, 36, 0, 7); g.stroke();
    for (let i = 0; i < 10; i++) { g.fillStyle = i === 9 ? '#FFD23A' : '#7CF4E3'; g.beginPath(); g.arc(60 + i * 42, 236, 7, 0, 7); g.fill(); }
    g.fillStyle = '#FFD23A'; g.font = '700 26px Fredoka, sans-serif'; g.fillText('BIG DIPPER', 24, 34);
  });
}
function globeTex() { return canvasTex(256, 128, (g) => { g.fillStyle = '#6CB8F0'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#7BD66A'; [[40, 40, 30, 22], [70, 80, 18, 26], [140, 50, 34, 20], [190, 86, 24, 16], [220, 36, 16, 12]].forEach(([x, y, a, b]) => { g.beginPath(); g.ellipse(x, y, a, b, .3, 0, 7); g.fill(); }); }); }
function buildPrim(p) {
  const g = new THREE.Group(), c = p.color || '#C8D2E0', w = p.w || 1, h = p.h || 1, d = p.d || .6;
  const body = std(c), dark = std('#2A2F45'), trim = std(mix(c, '#FFFFFF', .25));
  const put = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  switch (p.type) {
    case 'box': put(rbox(w, h, d, body, .08), 0, h / 2, d / 2); break;
    case 'post': put(rbox(.16, h, .16, body, .05), 0, h / 2, 0); break;
    case 'cupboard': {
      put(rbox(w, h, .06, std(mix(c, '#000', .35)), .02), 0, h / 2, .03);
      put(rbox(.08, h, d, body, .03), -w / 2 + .04, h / 2, d / 2); put(rbox(.08, h, d, body, .03), w / 2 - .04, h / 2, d / 2);
      put(rbox(w, .08, d, body, .03), 0, h - .04, d / 2); put(rbox(w, .08, d, body, .03), 0, .04, d / 2);
      const piv = new THREE.Group(); piv.name = 'door'; piv.position.set(-w / 2, 0, d); g.add(piv);
      const door = rbox(w, h, .08, trim, .04); door.position.set(w / 2, h / 2, .04); piv.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), std('#FFD23A')); knob.position.set(w - .16, h / 2, .12); knob.castShadow = true; piv.add(knob);
      break;
    }
    case 'console': {
      put(rbox(w, h * .8, d, body, .08), 0, h * .4, d / 2);
      const top = rbox(w - .06, .1, d * .95, trim, .04); top.position.set(0, h * .82, d * .5); top.rotation.x = .32; g.add(top);
      const pan = new THREE.Mesh(new THREE.PlaneGeometry(w - .3, d * .75), new THREE.MeshBasicMaterial({ map: consoleTex(Math.round(w * 97)) }));
      pan.position.set(0, .06, 0); pan.rotation.x = -Math.PI / 2; top.add(pan);
      for (let i = 0; i < Math.floor(w / .5); i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .06, 12), std(['#FF6B7A', '#FFD23A', '#7CF4E3'][i % 3])); k.rotation.x = Math.PI / 2; k.position.set(-w / 2 + .35 + i * .5, h * .45, d + .02); g.add(k); }
      break;
    }
    case 'screen': {
      put(rbox(w, h, .12, dark, .06), 0, h / 2, .06);
      put(new THREE.Mesh(new THREE.PlaneGeometry(w - .2, h - .2), new THREE.MeshBasicMaterial({ map: mapTex() })), 0, h / 2, .125);
      break;
    }
    case 'window': {
      const fr = std(p.color || '#FFFFFF');
      put(rbox(w + .3, .16, .26, fr, .05), 0, h + .08, .13); put(rbox(w + .44, .18, .36, fr, .05), 0, -.09, .18);
      put(rbox(.16, h, .26, fr, .05), -w / 2 - .08, h / 2, .13); put(rbox(.16, h, .26, fr, .05), w / 2 + .08, h / 2, .13);
      put(rbox(.08, h, .1, fr, .03), 0, h / 2, .05);
      break;
    }
    case 'lever': {
      const s = p.sc || 1, L = new THREE.Group(); L.scale.setScalar(s); g.add(L);
      const pl = rbox(.8, .9, .12, std('#9AA7B8'), .04); pl.position.set(0, .45, .06); L.add(pl);
      const sl = rbox(.12, .6, .03, dark, .01); sl.position.set(0, .45, .125); L.add(sl);
      const piv = new THREE.Group(); piv.position.set(0, .45, .14); piv.rotation.x = .55; L.add(piv);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .7, 12), std('#C9C0D9')); st.position.y = .35; st.castShadow = true; piv.add(st);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.13, 20, 16), std(c, { roughness: .3 })); ball.position.y = .74; ball.castShadow = true; piv.add(ball);
      break;
    }
    case 'globe': {
      put(new THREE.Mesh(new THREE.CylinderGeometry(.14, .32, .12, 20), std('#8A5A34')), 0, .06, 0);
      put(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .6, 10), std('#8A5A34')), 0, .4, 0);
      const s = put(new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 24), std('#fff', { map: globeTex(), roughness: .4 })), 0, 1.1, 0); s.name = 'spin';
      const ring = put(new THREE.Mesh(new THREE.TorusGeometry(.5, .025, 8, 40), std('#FFD23A')), 0, 1.1, 0); ring.rotation.y = Math.PI / 2;
      break;
    }
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- walls ----------
function patternTex(kind, a, b, w, h) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    if (kind === 'stripes') { for (let x = 38; x < w; x += 76) g.fillRect(x, 0, 38, h); }
    else if (kind === 'checker') { for (let y = 0; y < h; y += 52) for (let x = 0; x < w; x += 52) if (((x + y) / 52) % 2) g.fillRect(x, y, 52, 52); }
    else if (kind === 'dots') { for (let y = 26; y < h; y += 52) for (let x = 26; x < w; x += 52) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); } }
    else if (kind === 'planks') { for (let y = 52; y < h; y += 57) g.fillRect(0, y, w, 5); }
    else if (kind === 'stones') { for (let y = 0; y < h; y += 50) for (let x = ((y / 50) % 2) * 46 - 46; x < w; x += 92) { g.beginPath(); g.ellipse(x + 46, y + 25, 38, 19, 0, 0, 7); g.fill(); } }
    else if (kind === 'stars') { for (let i = 0; i < w * h / 1800; i++) { const x = (i * 97) % w, y = (i * 61 + (i * i) % 37) % h; g.beginPath(); g.arc(x, y, i % 4 ? 1.8 : 3, 0, 7); g.fill(); } }
    else if (kind === 'pegboard') { for (let y = 17; y < h; y += 34) for (let x = 17; x < w; x += 34) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
    else if (kind === 'panels') { for (let y = 0; y < h; y += 140) g.fillRect(0, y, w, 5); for (let x = 0; x < w; x += 125) g.fillRect(x, 0, 5, h); }
    else { for (let y = 0; y < h; y += 46) g.fillRect(0, y, w, 3); for (let x = 0; x < w; x += 46) g.fillRect(x, 0, 3, h); }
  });
}
function wallGeo(w, h, holes) {
  if (!holes || !holes.length) return new THREE.PlaneGeometry(w, h);
  const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
  for (const r of holes) { const x0 = r.x / 100 - w / 2, x1 = x0 + r.w / 100, y1 = h / 2 - r.y / 100, y0 = y1 - r.h / 100; const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.lineTo(x0, y0); s.holes.push(p); }
  const g = new THREE.ShapeGeometry(s); const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  return g;
}

/* the inspect close-up: one small renderer for the whole session, the button swapped in and out */
let PV = null;
function preview(pel, f) {
  if (!PV) {
    const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r2.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); r2.setSize(340, 340, false); r2.outputColorSpace = THREE.SRGBColorSpace;
    r2.domElement.style.cssText = 'width:100%;height:100%;display:block';
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#FFFFFF', '#E9B9CF', 1.6)); const dl = new THREE.DirectionalLight('#FFF3E4', 2.6); dl.position.set(2, 4, 5); sc.add(dl); sc.add(new THREE.AmbientLight('#fff', .3));
    const c2 = new THREE.PerspectiveCamera(30, 1, .1, 20); c2.position.set(0, 0, 4.4);
    PV = { r2, sc, c2, b: null, id: 0 };
  }
  const { r2, sc, c2 } = PV;
  pel.appendChild(r2.domElement);
  const b = makeButton(f, 512); b.scale.setScalar(1.75); sc.add(b); PV.b = b;
  let pressed = false, pz = .035;
  const loop = now => { PV.id = requestAnimationFrame(loop); const t = now / 1000; b.rotation.y = Math.sin(t * .9) * .55; b.rotation.x = -.18 + Math.sin(t * .6) * .08; pz += ((pressed ? -.01 : .035) - pz) * .35; b.userData.cap.position.z = pz; r2.render(sc, c2); };
  cancelAnimationFrame(PV.id); PV.id = requestAnimationFrame(loop);
  return {
    setPressed(p) { pressed = !!p; },
    dispose() {
      cancelAnimationFrame(PV.id); sc.remove(b); if (r2.domElement.parentNode) r2.domElement.parentNode.removeChild(r2.domElement);
      /* drop the 512px close-up textures: one per inspected button would add up */
      for (const k in matCache) if (k.includes('|512|')) { const m = matCache[k]; m.cap.dispose(); m.side.dispose(); m.hous.dispose(); delete matCache[k]; }
      for (const k in texCache) if (k.endsWith('|512')) { texCache[k].dispose(); delete texCache[k]; }
    }
  };
}

export async function createRoom(el, opts) {
  const R = opts.room, dims = R.dims;
  let SPARK_EVERY = R.easy ? 2.6 : 4.8, SPARK_BASE = R.easy ? .16 : .04;   // clue things twinkle more often when 'Make it easier' is on
  const W = dims.back[0] / 100, H = dims.back[1] / 100, D = dims.left[0] / 100;
  await document.fonts.load('700 50px Fredoka').catch(() => { });
  GLOW = GLOW || glowTex(); STAR = STAR || starTex();

  const renderer = getRenderer(el), cv = renderer.domElement, gov = governor();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, STAGE_W / STAGE_H, .1, 200);
  camera.setViewOffset(STAGE_W, STAGE_H, PANEL / 2, 0, STAGE_W, STAGE_H);
  const dim = R.dark ? .8 : 1;
  scene.add(new THREE.HemisphereLight('#FFF8F0', R.ground || '#E9B9CF', 1.5 * dim));
  const sun = new THREE.DirectionalLight('#FFF3E4', 2.4 * dim); sun.position.set(W * .35, H * 1.8, D + 5); sun.castShadow = true;
  const sr = Math.max(W, D) / 2 + 2;
  sun.shadow.mapSize.set(1024, 1024); if (isLow()) sun.castShadow = false; Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 1, far: 40 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 5;
  scene.add(sun); scene.add(new THREE.AmbientLight('#FFFFFF', .35));
  const fill = new THREE.PointLight(R.fill || '#FFE6F0', 10, 18, 1.4); fill.position.set(0, H * .65, D / 2 + .5); scene.add(fill);

  const room = new THREE.Group(); scene.add(room);
  const taps = [];
  const wallInfo = (wall, x, y, depth) => {
    switch (wall) {
      case 'back': return { p: new THREE.Vector3(x / 100 - W / 2, H - y / 100, -D / 2 + depth), n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0), ry: 0 };
      case 'left': return { p: new THREE.Vector3(-W / 2 + depth, H - y / 100, D / 2 - x / 100), n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, -1), ry: Math.PI / 2 };
      case 'right': return { p: new THREE.Vector3(W / 2 - depth, H - y / 100, -D / 2 + x / 100), n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, 1), ry: -Math.PI / 2 };
      default: return { p: new THREE.Vector3(x / 100 - W / 2, depth, -D / 2 + y / 100), n: new THREE.Vector3(0, 1, 0), t: new THREE.Vector3(1, 0, 0), rx: -Math.PI / 2 };
    }
  };
  const orient = (obj, wi) => { obj.position.copy(wi.p); if (wi.rx) obj.rotation.x = wi.rx; else obj.rotation.y = wi.ry; };

  // shell
  const mkWall = (geo, tex, wall) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: .92, side: THREE.DoubleSide })); m.receiveShadow = true; m.userData = { type: 'wall', wall }; room.add(m); taps.push(m); return m; };
  const [wk, wa, wb] = R.wall, [fk, fa, fb] = R.floor;
  const sideA = mix(wa, '#000', .05).getStyle(), sideB = mix(wb, '#000', .05).getStyle();
  const back = mkWall(wallGeo(W, H, R.windows), patternTex(wk, wa, wb, dims.back[0], dims.back[1]), 'back'); back.position.set(0, H / 2, -D / 2);
  const left = mkWall(new THREE.PlaneGeometry(D, H), patternTex(wk, sideA, sideB, dims.left[0], dims.left[1]), 'left'); left.position.set(-W / 2, H / 2, 0); left.rotation.y = Math.PI / 2;
  const right = mkWall(new THREE.PlaneGeometry(D, H), patternTex(wk, sideA, sideB, dims.right[0], dims.right[1]), 'right'); right.position.set(W / 2, H / 2, 0); right.rotation.y = -Math.PI / 2;
  const floorPlaneY = 0; const floor = mkWall(new THREE.PlaneGeometry(W, D), patternTex(fk, fa, fb, dims.floor[0], dims.floor[1]), 'floor'); floor.rotation.x = -Math.PI / 2;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: R.ceil, roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; room.add(ceil);
  const slabMat = std(R.slab, { roughness: .6 }), trimMat = std(mix(R.slab, '#FFFFFF', .35), { roughness: .6 });
  const box = (w, h, d, x, y, z, mat, r) => { const m = rbox(w, h, d, mat, r ?? .08); m.position.set(x, y, z); room.add(m); return m; };
  box(W + .9, .5, D + .5, 0, -.27, .1, slabMat, .15);
  box(.45, H + .9, D + .5, -W / 2 - .245, H / 2, .1, slabMat, .15);
  box(.45, H + .9, D + .5, W / 2 + .245, H / 2, .1, slabMat, .15);
  box(W + .9, .45, D + .5, 0, H + .245, .1, slabMat, .15);
  box(W, .16, .08, 0, .08, -D / 2 + .04, trimMat, .03);
  box(.08, .16, D, -W / 2 + .04, .08, 0, trimMat, .03);
  box(.08, .16, D, W / 2 - .04, .08, 0, trimMat, .03);

  // outside the windows (clipped to the room's opening so it only shows through windows)
  const outStart = room.children.length;
  if (R.outside === 'space') {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: canvasTex(1024, 512, (g) => { const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#0A1030'); gr.addColorStop(1, '#23306A'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512); for (let i = 0; i < 500; i++) { g.fillStyle = i % 5 ? '#FFFFFF' : '#9FF5E6'; g.globalAlpha = .4 + (i % 7) / 10; g.beginPath(); g.arc((i * 137) % 1024, (i * 71 + i * i % 53) % 512, i % 9 ? 1.4 : 2.6, 0, 7); g.fill(); } }) }));
    sky.position.set(0, H / 2, -D / 2 - 14); room.add(sky);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(2.4, 40, 30), std('#FF9FC6', { map: canvasTex(256, 128, (g) => { for (let y = 0; y < 128; y += 16) { g.fillStyle = (y / 16) % 2 ? '#FFB3CF' : '#FF8FB8'; g.fillRect(0, y, 256, 16); } }), emissive: '#40203A', roughness: .8 }));
    planet.position.set(W * .18, H * .78, -D / 2 - 9); room.add(planet);
    const rings = new THREE.Mesh(new THREE.TorusGeometry(3.6, .18, 8, 60), std('#FFD23A', { emissive: '#403010' })); rings.position.copy(planet.position); rings.rotation.x = 1.25; room.add(rings);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(.7, 24, 18), std('#E8EEF5', { emissive: '#303848' })); moon.position.set(W * .38, H * .5, -D / 2 - 7); room.add(moon);
  }
  let coasterTrain = null;
  const loader = MODEL_LOADER, cache = MODEL_CACHE;
  const load = m => cache[m] || (cache[m] = loader.loadAsync(opts.baseURL + m + (m.startsWith('dungeon/') || m.startsWith('kenney/') ? '.glb' : '.gltf')).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return g.scene; }));
  if (R.outside === 'coaster') {
    const oz = -D / 2;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(120, 50), new THREE.MeshBasicMaterial({ map: canvasTex(64, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6FC0EE'); gr.addColorStop(.7, '#DDF4FF'); gr.addColorStop(1, '#F5FBFF'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); }) }));
    sky.position.set(0, 18, oz - 40); room.add(sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), std('#9BDB7A', { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, oz - 20.4); room.add(ground);
    const kt = m => load('kenney/' + m).then(s => { const o = s.clone(true); o.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.set('#FFE6EE'); n.castShadow = false; n.receiveShadow = false; } }); return o; });
    const cg = new THREE.Group(); cg.rotation.y = Math.PI / 2; cg.scale.setScalar(1.6); cg.position.set(-3, -1.2, oz - 7); room.add(cg);
    const Y = 3.2, pieces = [['coaster-steel-straight', 0, -10], ['coaster-steel-straight', 0, -6], ['coaster-steel-looping', 0, 0], ['coaster-steel-straight', -1, 2], ['coaster-steel-straight-hill-complete', -1, 6], ['coaster-steel-straight', -1, 10], ['coaster-steel-straight', -1, 14]];
    await Promise.all(pieces.map(async ([m, x, z]) => { const o = await kt(m); o.position.set(x, Y, z); cg.add(o); }));
    await Promise.all([[0, -8], [0, -4], [-1, 4], [-1, 12], [-1, 16]].map(async ([x, z]) => { const o = await kt('support-large'); o.position.set(x, 0, z); o.scale.set(1, Y - 1, 1); cg.add(o); }));
    const tr = new THREE.Group(); cg.add(tr); coasterTrain = tr;
    const f = await kt('coaster-train-front'); f.position.set(0, Y - .7, 0); tr.add(f);
    for (let i = 1; i < 3; i++) { const c = await kt('coaster-train'); c.position.set(0, Y - .7, -1.4 * i); tr.add(c); }
    await Promise.all([[-14, -18, 3], [-9, -26, 2.4], [6, -24, 3.2], [13, -16, 2.6], [18, -28, 3], [-18, -12, 2.2]].map(async ([x, z, s], i) => { const o = await kt(i % 2 ? 'tree' : 'tree-large'); o.position.set(x, 0, oz + z); o.scale.setScalar(s); room.add(o); }));
  }

  const outRoots = room.children.slice(outStart);
  if (outRoots.length) {
    // stencil portal: the window holes write stencil=1, everything outside only draws where stencil==1
    for (const r of (R.windows || [])) {
      const pm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, side: THREE.DoubleSide });
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(r.w / 100, r.h / 100), pm);
      portal.position.set(r.x / 100 + r.w / 200 - W / 2, H - r.y / 100 - r.h / 200, -D / 2 - .01); portal.renderOrder = -10; room.add(portal);
    }
    outRoots.forEach(r => r.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); Object.assign(o.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp }); o.renderOrder = 10; } }));
  }
  // door glow + exit sign
  const dr = R.doorRect, dcx = (dr.x + dr.w / 2) / 100 - W / 2, dh = dr.h / 100;
  const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(dr.w / 100 - .1, dh - .05), new THREE.MeshBasicMaterial({ map: canvasTex(128, 256, (g) => { const r = g.createRadialGradient(64, 150, 5, 64, 150, 150); r.addColorStop(0, '#FFFBE0'); r.addColorStop(.5, '#FFD65C'); r.addColorStop(1, '#FFB547'); g.fillStyle = r; g.fillRect(0, 0, 128, 256); }) }));
  glowPlane.position.set(dcx, dh / 2, -D / 2 + .01); room.add(glowPlane);
  const exitTex = canvasTex(256, 96, (g) => { g.fillStyle = '#45C46A'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#fff'; g.font = '700 64px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 128, 52); });
  const em = std('#2E9E50');
  const exit = new THREE.Mesh(new RoundedBoxGeometry(.8, .3, .08, 2, .04), [em, em, em, em, new THREE.MeshBasicMaterial({ map: exitTex }), em]);
  exit.position.set(dcx, dh + .32, -D / 2 + .06); room.add(exit);
  const doorLight = new THREE.PointLight('#FFD65C', 0, 6, 1.5); doorLight.position.set(dcx, 1.4, -D / 2 + .8); room.add(doorLight);

  // models + props
  const named = {}, movers = [], spinners = []; let doorObj = null;
  await Promise.all(R.models.map(async (md, mi) => {
    let obj;
    if (md.prim) obj = buildPrim(md.prim);
    else { const src = await load(md.m); obj = src.clone(true); if (md.tint) obj.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.set(md.tint); } }); }
    if (md.wall === 'floor') { obj.position.set(md.wx / 100 - W / 2, md.base || 0, -D / 2 + (md.wy || 0) / 100); obj.rotation.y = md.rot || 0; }
    else { const wi = wallInfo(md.wall, md.wx, 0, md.off || 0); obj.position.set(wi.p.x, md.base || 0, wi.p.z); obj.rotation.y = wi.ry; if (md.move) movers.push({ obj, base: obj.position.clone(), t: wi.t, amp: md.move.amp, speed: md.move.speed || .6 }); }
    if (md.s) obj.scale.setScalar(md.s);
    obj.userData = { type: 'wall', wall: md.wall };
    const sp = obj.getObjectByName('spin'); if (sp) spinners.push(sp);
    room.add(obj); taps.push(obj);
    named[md.name] = obj; obj.userData.mi = mi;
    if (md.door) { doorObj = obj; obj.userData = { type: 'wall', wall: 'back' }; }
  }));
  const byMi = {}; for (const k in named) byMi[named[k].userData.mi ?? -1] = named[k];

  const drawers = {};
  for (const d of R.drawers) {
    const [inst, node] = d.node.split(':'); const n = named[inst] && named[inst].getObjectByName(node);
    if (n) { n.userData = { type: 'drawer', id: d.id, wall: d.wall }; drawers[d.id] = { node: n, axis: d.axis || 'y', amt: d.amt ?? 1.3, rb: n.rotation[d.axis === 'x' ? 'x' : 'y'], pb: n.position.clone(), cur: 0, goal: 0 }; }
  }
  const moverObjs = new Set(movers.map(m => m.obj));
  const attachTo = (g, mi) => { const o = mi != null ? byMi[mi] : null; if (o && moverObjs.has(o)) o.attach(g); };

  let btns = {};
  const addButtons = list => { for (const b of list) {
    const g = makeButton(b, 128); g.scale.setScalar(SIZE[b.size] || .38);
    orient(g, wallInfo(b.wall, b.x, b.y, b.depth + (b.inD ? .06 : b.wall === 'floor' ? .02 : .01)));
    Object.assign(g.userData, { type: 'button', id: b.id, wall: b.wall, basePos: g.position.clone(), n: wallInfo(b.wall, 0, 0, 0).n, giant: b.size === 'giant', rub: b.finish === 'rubbery' });
    room.add(g); taps.push(g); btns[b.id] = g; attachTo(g, b.mi);
  } };
  addButtons(R.buttons);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.66, .06, 12, 60), new THREE.MeshBasicMaterial({ color: '#FFC93C' })); ring.position.z = .06;

  let things = {};
  const addThings = list => { for (const t of list) {
    const g = makeThing(t.type);
    if (t.wall === 'floor') { const wi = wallInfo('floor', t.x, t.y, 0); g.position.set(wi.p.x, (t.inD ? .12 : .3) + t.depth, wi.p.z); }
    else orient(g, wallInfo(t.wall, t.x, t.y, t.depth + .01));
    Object.assign(g.userData, { type: 'thing', id: t.id, wall: t.wall, phase: Math.random() * 6 });
    room.add(g); taps.push(g); things[t.id] = g; attachTo(g, t.mi);
  } };
  addThings(R.things);
  const unhook = o => { if (o.parent) o.parent.remove(o); const i = taps.indexOf(o); if (i >= 0) taps.splice(i, 1); };

  // ---------- camera ----------
  const tanH = Math.tan(FOV / 2 * Math.PI / 180), aspect = STAGE_W / STAGE_H, visFrac = (STAGE_W - PANEL) / STAGE_W;
  const kW = Math.max(W / 10, H / 5);
  const WIDE = { pos: new THREE.Vector3(0, H * .72, D / 2 + 10.2 * kW), tgt: new THREE.Vector3(0, H * .4, -.4) };
  const cam = { pos: WIDE.pos.clone(), tgt: WIDE.tgt.clone(), up: new THREE.Vector3(0, 1, 0) };
  const goal = { pos: cam.pos.clone(), tgt: cam.tgt.clone(), up: cam.up.clone() };
  let shiftCur = 0, nearGoal = .1, nearCur = .1, view = { zoom: null }, zoomWall = null, focus = null, pending = null, drag = 0, dragGoal = 0, walking = false;
  const fitD = (PH, min) => Math.max(min, (PH / 2) / ((STAGE_H / 2 - (HUD_TOP - 0) / 2 - 8) / (STAGE_H / 2)) / 100 / tanH);
  const DIST = { back: fitD(dims.back[1], 6.4), left: fitD(dims.left[1], 6.8), right: fitD(dims.right[1], 6.8), floor: 7.2 };
  const clampFocus = (w, f) => {
    const d = DIST[w], hy = tanH * d * 100, hx = tanH * d * aspect * visFrac * 100 * .96;
    const [PW, PH] = dims[w]; const c = (v, h, P) => h * 2 >= P ? P / 2 : Math.max(h, Math.min(P - h, v));
    // usable screen band is y=HUD_TOP..STAGE_H; content is shifted down by SHIFT px
    const k = (STAGE_H / 2) / hy, upper = (STAGE_H / 2 + SHIFT - HUD_TOP) / k, lower = PH - (STAGE_H / 2 - SHIFT - 6) / k;
    const lo = Math.min(upper, lower), hi = Math.max(upper, lower);
    return { x: c(f.x, hx, PW), y: Math.max(lo, Math.min(hi, f.y)) };
  };
  const setGoal = () => {
    if (walking) { nearGoal = .1; goal.pos.set(dcx, 1.5, -D / 2 + .7); goal.tgt.set(dcx, 1.4, -D / 2 - 3); goal.up.set(0, 1, 0); return; }
    nearGoal = zoomWall ? Math.max(.1, DIST[zoomWall] - (zoomWall === 'floor' ? 1.3 : 2.35)) : .1;
    if (!zoomWall) { goal.pos.copy(WIDE.pos); goal.tgt.copy(WIDE.tgt); goal.up.set(0, 1, 0); return; }
    const f = clampFocus(zoomWall, focus), wi = wallInfo(zoomWall, f.x, f.y, 0);
    goal.tgt.copy(wi.p); goal.pos.copy(wi.p).addScaledVector(wi.n, DIST[zoomWall]);
    if (zoomWall === 'floor') { goal.pos.z += .01; goal.up.set(0, 0, -1); } else goal.up.set(0, 1, 0);
  };

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const cssScale = () => cv.getBoundingClientRect().width / STAGE_W || 1;
  const toWallPx = (w, p) => w === 'back' ? { x: (p.x + W / 2) * 100, y: (H - p.y) * 100 } : w === 'left' ? { x: (D / 2 - p.z) * 100, y: (H - p.y) * 100 } : w === 'right' ? { x: (p.z + D / 2) * 100, y: (H - p.y) * 100 } : { x: (p.x + W / 2) * 100, y: (p.z + D / 2) * 100 };
  const onDown = e => { down = { x: e.clientX, y: e.clientY, drag, focus: focus && { ...focus }, moved: false }; };
  const onMove = e => {
    if (!down || !view.interactive) return; const s = cssScale(), dx = (e.clientX - down.x) / s, dy = (e.clientY - down.y) / s;
    if (!down.moved && Math.hypot(dx, dy) > 10) down.moved = true; if (!down.moved) return;
    if (!zoomWall) dragGoal = Math.max(-.3, Math.min(.3, down.drag + dx * .0035));
    else { const k = 2 * tanH * DIST[zoomWall] / STAGE_H * 100; focus = clampFocus(zoomWall, { x: down.focus.x - dx * k, y: down.focus.y - dy * k }); setGoal(); }
  };
  const onUp = e => {
    if (!down) return; const moved = down.moved; down = null; if (moved || !view.interactive) return;
    const r = cv.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = [];
    for (const h of ray.intersectObjects(taps, true)) {
      let o = h.object; while (o && !(o.userData && o.userData.type)) o = o.parent; if (!o) continue;
      if (o.userData.type === 'button' && o.userData.faded && !view.tapFaded) { /* faded still tappable */ }
      hits.push({ h, u: o.userData });
    }
    if (!hits.length) return;
    const near = hits[0].h.distance;
    const pri = x => x.u.type === 'button' || x.u.type === 'thing' ? 0 : x.u.type === 'drawer' ? (drawers[x.u.id] && drawers[x.u.id].goal ? 2 : 1) : 3;
    let best = hits[0];
    for (const x of hits) { if (x.h.distance - near > .9) break; if (pri(x) < pri(best)) best = x; }
    if (pri(best) === 2) { const alt = hits.find(x => pri(x) < 2 && x.h.distance - near < 1.6); if (alt) best = alt; }
    const u = best.u; pending = { wall: u.wall, ...toWallPx(u.wall, room.worldToLocal(best.h.point.clone())) };
    opts.onTap({ type: u.type, id: u.id, wall: u.wall });
  };
  const onCancel = () => { down = null; };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onCancel);

  // ---------- loop ----------
  let raf = 0, last = performance.now(), doorCur = 0, doorGoal = 0, selId = null;
  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (gov(now)) sun.castShadow = false;
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000, k = 1 - Math.exp(-dt * 5.5);
    cam.pos.lerp(goal.pos, k); cam.tgt.lerp(goal.tgt, k); cam.up.lerp(goal.up, k).normalize();
    drag += ((zoomWall ? 0 : dragGoal) - drag) * k; room.rotation.y = drag;
    const shiftGoal = zoomWall && !walking ? SHIFT : 0; if (Math.abs(shiftGoal - shiftCur) > .3) { shiftCur += (shiftGoal - shiftCur) * k; camera.setViewOffset(STAGE_W, STAGE_H, PANEL / 2, -shiftCur, STAGE_W, STAGE_H); }
    nearCur += (nearGoal - nearCur) * k; if (Math.abs(camera.near - nearCur) > .01) { camera.near = nearCur; camera.updateProjectionMatrix(); }
    camera.position.copy(cam.pos); camera.up.copy(cam.up); camera.lookAt(cam.tgt);
    doorCur += (doorGoal - doorCur) * (1 - Math.exp(-dt * 3)); if (doorObj) doorObj.rotation.y = -1.9 * doorCur; doorLight.intensity = doorCur * 25;
    for (const id in drawers) { const d = drawers[id]; d.cur += (d.goal - d.cur) * (1 - Math.exp(-dt * 7)); if (d.axis === 'slide') { d.node.position.set(d.pb.x + d.amt * d.cur, d.pb.y + .35 * Math.sin(Math.PI * Math.min(1, d.cur)), d.pb.z); } else d.node.rotation[d.axis] = d.rb + d.amt * d.cur; }
    for (const m of movers) m.obj.position.copy(m.base).addScaledVector(m.t, m.amp * Math.sin(t * m.speed * 2));
    for (const s of spinners) s.rotation.y = t * .5;
    if (coasterTrain) coasterTrain.position.z = ((t * 2.2) % 30) - 12;
    for (const id in things) { const u = things[id].userData; const cyc = ((t + u.phase) % SPARK_EVERY) / SPARK_EVERY, burst = cyc < .18 ? Math.sin(cyc / .18 * Math.PI) : 0; u.glow.material.opacity = SPARK_BASE + .55 * burst; u.glow.scale.setScalar(.7 + .35 * burst); u.stars.forEach((s, i) => { const v = burst * Math.max(0, Math.sin(cyc / .18 * Math.PI * 2 + i * 1.3)); s.scale.setScalar(.05 + .17 * v); s.material.opacity = v; }); }
    for (const id in btns) { const g = btns[id], u = g.userData; if (u.giant) g.position.copy(u.basePos).addScaledVector(u.n, .05 + .05 * Math.sin(t * 2.4)); if (u.rub) { const s = SIZE[u.feat.size] || .38; g.scale.set(s * (1 + .03 * Math.sin(t * 2.6)), s * (1 - .03 * Math.sin(t * 2.6)), s); } }
    if (ring.parent) { const p = 1 + .08 * Math.sin(t * 6); ring.scale.set(p, p, 1); }
    renderer.render(scene, camera);
  };
  setGoal(); raf = requestAnimationFrame(tick);

  return {
    setView(v) {
      const prevZoom = view.zoom; view = v; walking = !!v.walking;
      if (v.easy != null) { SPARK_EVERY = v.easy ? 2.6 : 4.8; SPARK_BASE = v.easy ? .16 : .04; }
      if (v.zoom !== prevZoom || walking) {
        zoomWall = v.zoom || null;
        if (zoomWall) { const [PW, PH] = dims[zoomWall]; focus = clampFocus(zoomWall, pending && pending.wall === zoomWall ? { x: pending.x, y: pending.y } : { x: PW / 2, y: PH / 2 }); dragGoal = 0; }
        setGoal();
      }
      const fs = new Set(v.faded || []); for (const id in btns) setFaded(btns[id], fs.has(id));
      const tk = new Set(v.taken || []); for (const id in things) if (tk.has(id) && things[id].parent) { things[id].parent.remove(things[id]); const i = taps.indexOf(things[id]); if (i >= 0) taps.splice(i, 1); }
      const op = new Set(v.open || []); for (const id in drawers) drawers[id].goal = op.has(id) ? 1 : 0;
      doorGoal = v.doorOpen ? 1 : 0;
      if (v.sel !== selId) { if (ring.parent) ring.parent.remove(ring); selId = v.sel; if (selId && btns[selId]) btns[selId].add(ring); }
    },
    /* next round: new buttons and clue things, same furniture; drawers shut, camera back to wide */
    setRound(buttons, thingList) {
      if (ring.parent) ring.parent.remove(ring); selId = null;
      for (const id in btns) unhook(btns[id]); for (const id in things) unhook(things[id]);
      btns = {}; things = {}; addButtons(buttons); addThings(thingList);
      for (const id in drawers) drawers[id].goal = 0;
    },
    preview,
    dispose() {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onCancel);
      disposeScene(scene); scene.clear();
      for (const k in texCache) delete texCache[k]; for (const k in matCache) delete matCache[k];
      detach();
    }
  };
}
