/* scene.js — the 3D course: builds a hole from its data as a "real" seaside-style crazy-golf
 * course (carpet, capped rails, landscaping, painted props, PBR lighting), keeps it in step
 * with the Sim, and owns the orthographic camera. All UI is HTML on top (see ui.js). */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { offset, convexHull, fillet, ccw, ellipse, pointInPoly, bounds } from './geometry.js';
import { BALL_R, moverPos, windmillAngle, plankOffset, sweepAngle, pistonLift, zonePoly } from './physics.js';
import * as TX from './materials.js';

export const STAGE_W = 1333, STAGE_H = 690;
const SLAB = 0.3, RAIL_W = 0.2, RAIL_H = 0.3, GROUND = -SLAB;

/* per-world course dressing */
export const LOOKS = {
  jungle: {
    bg: '#4E8436',
    felt: '#3E8A3A', flag: '#FFC93C', exposure: 1.0,
    hemi: ['#EAF4FF', '#5B7A3A', 0.55], sun: ['#FFF0D6', 2.6], env: 0.45,
    rail: () => TX.surf('j-rail', TX.stoneBlocks('#A39A84', '#6B655A', 3), { repeat: [0.8, 1.6], rough: 0.9, nScale: 1.2 }),
    cap: () => TX.surf('j-cap', TX.concrete('#CFC7B3'), { repeat: [0.7, 0.7], rough: 0.8 }),
    slab: () => TX.surf('j-slab', TX.stoneBlocks('#8B8474', '#5E594F', 5), { repeat: [0.8, 1.6], rough: 0.95 }),
    ground: () => TX.surf('j-ground', TX.grass('#5C9A40'), { repeat: [0.12, 0.12], rough: 0.95, nScale: 0.7 }),
    border: () => TX.surf('j-border', TX.gravel('#B9AA8C'), { repeat: [0.45, 0.45], rough: 1, nScale: 1.2 }),
  },
  pirate: {
    bg: '#1D7FA6',
    felt: '#3C8A44', flag: '#E8453C', exposure: 1.05, sea: true,
    hemi: ['#F2FAFF', '#7FB9C9', 0.6], sun: ['#FFF8EA', 2.8], env: 0.55,
    rail: () => TX.surf('p-rail', TX.planks('#8A5A2E', 7, true), { repeat: [0.9, 1.8], rough: 0.85, nScale: 1 }),
    cap: () => TX.surf('p-cap', TX.planks('#B07A43', 9, false), { repeat: [0.6, 0.6], rough: 0.8 }),
    slab: () => TX.surf('p-slab', TX.planks('#6B4424', 13, true), { repeat: [0.9, 1.8], rough: 0.9 }),
    ground: () => TX.surf('p-ground', TX.sand('#E3C88F'), { repeat: [0.14, 0.14], rough: 1, nScale: 0.8 }),
    border: () => TX.surf('p-border', TX.planks('#9C6B3C', 17, false), { repeat: [0.5, 0.5], rough: 0.85 }),
  },
  space: {
    bg: '#23263A',
    felt: '#2E7A62', flag: '#4FF0E0', exposure: 1.0, glow: '#4FF0E0',
    hemi: ['#C8D2FF', '#252A48', 0.55], sun: ['#E8ECFF', 2.4], env: 0.9,
    rail: () => TX.surf('s-rail', TX.metalPanels('#7C849C'), { repeat: [1.2, 1.2], rough: 1, metal: 0.75, nScale: 0.8 }),
    cap: () => TX.surf('s-cap', TX.metalPanels('#B9C0D0'), { repeat: [1.2, 1.2], rough: 1, metal: 0.85, nScale: 0.5 }),
    slab: () => TX.surf('s-slab', TX.metalPanels('#6A718E'), { repeat: [1.2, 1.2], rough: 1, metal: 0.6 }),
    ground: () => TX.surf('s-ground', TX.metalPanels('#2B2F42'), { repeat: [0.16, 0.16], rough: 1, metal: 0.5, nScale: 0.9 }),
    border: () => TX.surf('s-border', TX.paving('#1E2130'), { repeat: [0.4, 0.4], rough: 0.7, metal: 0.3 }),
  },
  haunted: {
    bg: '#2C4028',
    felt: '#2F6A39', flag: '#FF8A2A', exposure: 0.95, glow: '#B496FF',
    hemi: ['#B8B0E8', '#2A2238', 0.5], sun: ['#D6D0FF', 2.0], env: 0.35,
    rail: () => TX.surf('h-rail', TX.bricks('#5E4148', '#3A3036'), { repeat: [0.9, 1.8], rough: 0.9, nScale: 1.2 }),
    cap: () => TX.surf('h-cap', TX.concrete('#A29EAC', 83), { repeat: [0.7, 0.7], rough: 0.85 }),
    slab: () => TX.surf('h-slab', TX.bricks('#4A3440', '#2E262C'), { repeat: [0.9, 1.8], rough: 0.95 }),
    ground: () => TX.surf('h-ground', TX.grass('#34502F'), { repeat: [0.12, 0.12], rough: 1, nScale: 0.8 }),
    border: () => TX.surf('h-border', TX.gravel('#77707E'), { repeat: [0.45, 0.45], rough: 1, nScale: 1.2 }),
  },
  candy: {
    bg: '#F6C3DA',
    felt: '#34A382', flag: '#FF7AB6', exposure: 1.02,
    hemi: ['#FFF4FA', '#E8A7C6', 0.62], sun: ['#FFF3E6', 2.6], env: 0.6,
    rail: () => TX.surf('c-rail', TX.bricks('#F59AC2', '#FFF3F8'), { repeat: [0.9, 1.8], rough: 0.55, nScale: 0.6 }),
    cap: () => TX.surf('c-cap', TX.concrete('#FFF6EC', 71), { repeat: [0.7, 0.7], rough: 0.45, nScale: 0.4 }),
    slab: () => TX.surf('c-slab', TX.bricks('#B8743F', '#7E4A26'), { repeat: [0.9, 1.8], rough: 0.8 }),
    ground: () => TX.surf('c-ground', TX.sand('#F9CFE1'), { repeat: [0.14, 0.14], rough: 0.9, nScale: 0.5 }),
    border: () => TX.surf('c-border', TX.gravel('#FBEFF5'), { repeat: [0.45, 0.45], rough: 0.8, nScale: 0.8 }),
  },
  ice: {
    bg: '#CFE7F3',
    felt: '#3C5BA6', flag: '#4FC3F7', exposure: 1.0,
    hemi: ['#F4FBFF', '#9CC4D8', 0.65], sun: ['#F4F8FF', 2.5], env: 0.8,
    rail: () => TX.surf('i-rail', TX.stoneBlocks('#DDEFF8', '#9CC4D8', 13), { repeat: [0.8, 1.6], rough: 0.25, nScale: 0.7, env: 1.4 }),
    cap: () => TX.surf('i-cap', TX.concrete('#FFFFFF', 72), { repeat: [0.7, 0.7], rough: 0.6, nScale: 0.4 }),
    slab: () => TX.surf('i-slab', TX.stoneBlocks('#A9CFE0', '#7EA7BD', 15), { repeat: [0.8, 1.6], rough: 0.3, env: 1.2 }),
    ground: () => TX.surf('i-ground', TX.sand('#F2F7FA'), { repeat: [0.12, 0.12], rough: 0.9, nScale: 0.5 }),
    border: () => TX.surf('i-border', TX.gravel('#D3E2EB'), { repeat: [0.45, 0.45], rough: 0.9, nScale: 0.8 }),
  },
  factory: {
    bg: '#3A3F47',
    felt: '#3C8A44', flag: '#FFC93C', exposure: 1.05,
    hemi: ['#E6ECF4', '#4A4E56', 0.6], sun: ['#FFF4E0', 2.5], env: 0.8,
    rail: () => TX.surf('f-rail', TX.metalPanels('#D9A21B'), { repeat: [1.2, 1.2], rough: 1, metal: 0.55, nScale: 0.7 }),
    cap: () => TX.surf('f-cap', TX.metalPanels('#3A3D44'), { repeat: [1.2, 1.2], rough: 1, metal: 0.8, nScale: 0.5 }),
    slab: () => TX.surf('f-slab', TX.metalPanels('#5D636C'), { repeat: [1.2, 1.2], rough: 1, metal: 0.6 }),
    ground: () => TX.surf('f-ground', TX.concrete('#6C7078', 74), { repeat: [0.14, 0.14], rough: 0.95, nScale: 0.8 }),
    border: () => TX.surf('f-border', TX.paving('#50545B'), { repeat: [0.4, 0.4], rough: 0.8, metal: 0.2 }),
  },
  desert: {
    bg: '#E3BE78',
    felt: '#4B9A48', flag: '#3DB7F0', exposure: 1.0,
    hemi: ['#FFF6E4', '#C9A064', 0.6], sun: ['#FFEACC', 2.9], env: 0.45,
    rail: () => TX.surf('d-rail', TX.stoneBlocks('#D8B878', '#A4844C', 17), { repeat: [0.8, 1.6], rough: 0.9, nScale: 1.1 }),
    cap: () => TX.surf('d-cap', TX.concrete('#EAD7A8', 75), { repeat: [0.7, 0.7], rough: 0.85 }),
    slab: () => TX.surf('d-slab', TX.stoneBlocks('#C19A5C', '#8C6B3A', 19), { repeat: [0.8, 1.6], rough: 0.95 }),
    ground: () => TX.surf('d-ground', TX.sand('#E4C387'), { repeat: [0.12, 0.12], rough: 1, nScale: 0.8 }),
    border: () => TX.surf('d-border', TX.paving('#CDB080'), { repeat: [0.4, 0.4], rough: 0.95 }),
  },
};

const col = (c) => new THREE.Color(c);
const FX_GEO = new THREE.SphereGeometry(0.08, 6, 5);   // shared by every particle, never disposed
/* plain painted material, cached */
const paint = (c, rough = 0.6, metal = 0, extra = {}) => {
  const key = `paint:${c}:${rough}:${metal}:${JSON.stringify(extra)}`;
  return TX.std(key, { color: col(c), roughness: rough, metalness: metal, ...extra });
};
const glowMat = (c, i = 1) => TX.std(`glow:${c}:${i}`, { color: col(c), emissive: col(c), emissiveIntensity: i, roughness: 0.4 });

/* shape helpers: our (x,z) → THREE.Shape (x,-z), extruded up the y axis after rotateX(-π/2) */
function shapeOf(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return s;
}
function extrude(shape, depth, bevel = 0, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments });
  g.rotateX(-Math.PI / 2);
  return g;
}
function flat(shape) { const g = new THREE.ShapeGeometry(shape, 6); g.rotateX(-Math.PI / 2); return g; }
function circlePts(x, z, r, n = 28) { const o = []; for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; o.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } return ccw(o); }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
/* deterministic per-hole randomness for scenery */
function seeded(n) { let s = (n * 2654435761) >>> 0 || 7; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
/* a knobbly rock/foliage blob: an indexed sphere pushed about by smooth noise (so normals stay smooth) */
function lumpy(r, detail = 1, amt = 0.22, seed = 1) {
  const g = new THREE.SphereGeometry(r, 14 + detail * 4, 10 + detail * 3), p = g.attributes.position;
  const k1 = 1.7 + (seed % 5) * 0.37, k2 = 2.3 + (seed % 7) * 0.29, ph = seed * 1.13;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r, y = p.getY(i) / r, z = p.getZ(i) / r;
    const n = Math.sin(x * k1 * 3 + ph) * Math.sin(y * k2 * 3 + ph * 0.7) * Math.sin(z * k1 * 2.4 + ph * 1.3) + 0.5 * Math.sin((x + y + z) * k2 * 4 + ph);
    const s = 1 + n * amt * 0.7; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  g.computeVertexNormals(); return g;
}

/* ball skins painted as equirect textures */
function ballTexture(id) {
  return canvasTex(256, 128, (g, w, h) => {
    const fill = (c) => { g.fillStyle = c; g.fillRect(0, 0, w, h); };
    switch (id) {
      case 'beach': { const cs = ['#FF6B57', '#fff', '#3DB7F0', '#fff', '#FFC93C', '#fff']; cs.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 6, 0, w / 6 + 1, h); }); break; }
      case 'melon': fill('#7ED957'); for (let i = 0; i < 12; i++) { g.fillStyle = '#2E8B3E'; g.fillRect(i * w / 12, 0, w / 24, h); } break;
      case 'eye': fill('#fff'); g.fillStyle = '#3DB7F0'; g.beginPath(); g.ellipse(w * 0.25, h / 2, 26, 30, 0, 0, 7); g.fill(); g.fillStyle = '#0B3640'; g.beginPath(); g.ellipse(w * 0.25, h / 2, 12, 14, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.25 - 5, h / 2 - 6, 4, 0, 7); g.fill(); break;
      case 'lava': { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#FFE08A'); gr.addColorStop(0.45, '#FF6B2A'); gr.addColorStop(1, '#B8261B'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#7a1a10'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo((i * 71) % w, (i * 37) % h); g.lineTo((i * 113) % w, (i * 53 + 40) % h); g.stroke(); } break; }
      case 'planet': fill('#3DB7F0'); g.fillStyle = '#8BD94A'; [[40, 40, 24], [150, 80, 30], [210, 30, 18], [100, 100, 14]].forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0, 0, 7); g.fill(); }); break;
      case 'pumpkin': fill('#FF8A2A'); for (let i = 0; i < 10; i++) { g.fillStyle = '#F07515'; g.fillRect(i * w / 10, 0, 5, h); } break;
      case 'disco': fill('#9A6BFF'); g.fillStyle = '#fff'; for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); } break;
      default: fill('#F7F7F4');
    }
  });
}
function flagTexture(item) {
  return canvasTex(128, 80, (g, w, h) => {
    const id = item.id, bg = item.bg;
    if (id === 'pirate') { g.fillStyle = '#2B2B36'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w * .45, h / 2, 14, 0, 7); g.fill(); g.fillStyle = '#2B2B36'; g.fillRect(w * .45 - 8, h / 2 - 4, 5, 5); g.fillRect(w * .45 + 3, h / 2 - 4, 5, 5); }
    else if (id === 'star') { g.fillStyle = '#3DB7F0'; g.fillRect(0, 0, w, h); g.fillStyle = '#FFF6E4'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(w * .45 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.fill(); }
    else if (id === 'rainbow') { ['#FF6B57', '#FFC93C', '#8BD94A', '#3DB7F0', '#9A6BFF'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / 5, w, h / 5 + 1); }); }
    else if (id === 'galaxy') { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3B2C85'); gr.addColorStop(1, '#C77DFF'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc((i * 37) % w, (i * 23) % h, 1.6, 0, 7); g.fill(); } }
    else { g.fillStyle = bg.startsWith('#') ? bg : '#E8453C'; g.fillRect(0, 0, w, h); if (id === 'ghost') { g.fillStyle = '#2B1C4F'; g.beginPath(); g.arc(w * .38, h * .42, 5, 0, 7); g.arc(w * .56, h * .42, 5, 0, 7); g.fill(); } }
    // cloth weave
    g.fillStyle = 'rgba(0,0,0,.06)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  });
}
function stripeTex(a, b, n = 8) { return canvasTex(64, 256, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * h / n, w, h / n + 1); } }); }
function signTex(num, par) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#F4EBD6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1F4D3A'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#1F4D3A'; g.font = '700 84px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), w / 2, h * 0.42);
    g.font = '700 30px Nunito, system-ui, sans-serif'; g.fillText(`PAR ${par}`, w / 2, h * 0.8);
  });
}

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    { const pm = new THREE.PMREMGenerator(this.r); this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
    this.scene.environment = this.envTex;
    this.ortho = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 200);
    this.persp = new THREE.PerspectiveCamera(30, STAGE_W / STAGE_H, 0.5, 400);
    this.cam = this.ortho; this.projection = 'ortho';
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_R);
    this.fx = [];
    this.view = { mode: 'overhead', tx: 0, tz: 0, el: 1.0, az: 0, zoom: 1 };
    this.camSmooth = 3;
    this.clock = 0;
    this.setSize(STAGE_W, STAGE_H, 1);
  }

  setSize(w, h, pr) { this.W = w; this.H = h; this.r.setPixelRatio(this.low ? Math.min(pr, 1) : pr); this.r.setSize(w, h, false); }

  clear() {
    this.root.traverse(o => {
      if (o.geometry && o.geometry !== FX_GEO) o.geometry.dispose();
      const m = o.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm.userData && mm.userData.shared) return; if (mm.map && !(mm.map.userData && mm.map.userData.shared)) mm.map.dispose(); mm.dispose(); });
    });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.fx = []; this.gravPads = []; this.blinkers = []; this.seaStrips = null; this.arrows = []; this.lavaBits = []; this.flows = [];
    this.gears = []; this.mills = []; this.sweepers = []; this.pistons = []; this.belts = []; this.swirls = []; this.planks = []; this.movers = []; this.bumpers = []; this.portals = []; this.cannons = []; this.swing = null;
  }

  /* ---------- building a hole ---------- */
  load(worldId, hole, W, skins) {
    const t0 = performance.now();
    this.clear();
    const L = LOOKS[worldId]; this.look = L; this.worldId = worldId; this.hole = hole; this.world = W;
    this.hemi.color = col(L.hemi[0]); this.hemi.groundColor = col(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color = col(L.sun[0]); this.sun.intensity = L.sun[1];
    this.r.toneMappingExposure = L.exposure;
    this.scene.environment = this.envTex; this.scene.environmentIntensity = L.env; this.holeNum = skins.holeNum;
    this.scene.background = col(L.bg || '#2a3a2a');
    const R = this.root;
    const add = (m, cast = false, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; R.add(m); return m; };

    const isl = W.islands, bb = bounds(isl); this.bb = bb;
    const decos = (hole.deco || []).map(d => ({ kind: d[0], x: d[1], z: d[2] }));
    const cupR = skins.cupR || 0.46;
    const cupIsland = isl.findIndex(p => pointInPoly(W.cup[0], W.cup[1], p));

    /* --- ground --- */
    this.beaches = null;
    if (L.sea) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.waterMat('sea'));
      sea.rotation.x = -Math.PI / 2; sea.position.y = GROUND - 0.28; add(sea, false, true);
      const beaches = hole.islands ? isl.map(p => ccw(fillet(offset(p, 1.5), 0.8))) : [ccw(fillet(offset(convexHull(isl.flat().concat(decos.map(d => [d.x, d.z]))), 1.6), 2.2, 6))];
      for (const d of decos) if (!beaches.some(p => pointInPoly(d.x, d.z, p))) beaches.push(ellipse(d.x, d.z, 1.5, 1.2, 22));
      for (const p of beaches) {
        const g = extrude(shapeOf(p), 0.3, 0.12, 8); g.translate(0, GROUND - 0.42, 0);
        add(new THREE.Mesh(g, [L.ground(), TX.surf('p-beachside', TX.sand('#C9A96E'), { repeat: [0.5, 0.5], rough: 1 })]), false, true);
        const foam = new THREE.Mesh(flat(shapeOf(offset(p, 0.35), [p])), TX.std('foam', { color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.3 }));
        foam.position.y = GROUND - 0.27; R.add(foam); this.flows.push({ m: foam, foam: true });
      }
      this.beaches = beaches;
    } else {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), L.ground()); g.rotation.x = -Math.PI / 2; g.position.y = GROUND; add(g, false, true);
      // world UVs so the grass/deck texture tiles at a fixed size
      const uv = g.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
    }
    // paths / decking border around each fairway
    isl.forEach((p, k) => {
      const b = new THREE.Mesh(flat(shapeOf(offset(p, RAIL_W + 0.75))), L.border()); b.position.y = GROUND + 0.004 + k * 0.001; add(b, false, true);
      if (worldId === 'space') { const strip = new THREE.Mesh(flat(shapeOf(offset(p, RAIL_W + 0.8), [offset(p, RAIL_W + 0.7)])), glowMat('#4FF0E0', 1.4)); strip.position.y = GROUND + 0.01; R.add(strip); }
    });

    /* --- fairways: slab, carpet (with the cup cut out), capped rails --- */
    const feltMat = TX.surf('felt' + L.felt, TX.carpet(L.felt), { repeat: [0.9, 0.9], rough: 1, nScale: 0.6, env: 0.2 });
    isl.forEach((p, k) => {
      const outer = offset(p, RAIL_W), cutout = k === cupIsland ? [circlePts(W.cup[0], W.cup[1], cupR, 32)] : [];
      const slab = extrude(shapeOf(outer, cutout), SLAB, 0, 8); slab.translate(0, -SLAB, 0);
      add(new THREE.Mesh(slab, [feltMat, L.slab()]), false, true);
      const fg = flat(shapeOf(p, cutout)); fg.translate(0, 0.002, 0);
      add(new THREE.Mesh(fg, feltMat), false, true);
      const rail = extrude(shapeOf(outer, [p]), RAIL_H, 0, 8);
      add(new THREE.Mesh(rail, [L.cap(), L.rail()]), true, true);
      const cap = extrude(shapeOf(offset(p, RAIL_W + 0.035), [offset(p, -0.02)]), 0.05, 0.012, 8); cap.translate(0, RAIL_H, 0);
      add(new THREE.Mesh(cap, [L.cap(), L.cap()]), true, true);
    });

    /* --- tee mat + hole sign --- */
    { const mat = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.03, 0.8, 2, 0.012), paint('#23452C', 0.95));
      mat.position.set(W.tee[0], 0.016, W.tee[1]); add(mat, false, true);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.7), paint('#F2F2EE', 0.7)); line.position.set(W.tee[0] - 0.4, 0.018, W.tee[1]); R.add(line); }
    this.buildSign(W, isl, hole);

    this.buildZones(W, L); this.buildHazards(W, L, worldId);
    this.buildCup(W, skins.flag, cupR); this.buildGems(W); this.buildBall(skins.ball); this.buildPutter(skins.putter);
    for (const d of decos) this.deco(d, worldId);
    this.scenery(W, isl, decos, worldId);

    // what the camera frames: the course plus its border and props
    this.plinths = isl.map(p => offset(p, 1.2)).concat(decos.map(d => ellipse(d.x, d.z, 0.9, 0.9, 8)));
    const c = new THREE.Vector3(bb.cx, 0, bb.cz);
    this.sun.position.set(c.x - 9, 20, c.z - 11); this.sun.target.position.copy(c);
    const sc = this.sun.shadow.camera, ext = Math.max(bb.w, bb.d) * 0.72 + 4;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
    this.fit = this.fitView(0, 0.98);
    Object.assign(this.view, { mode: 'overhead', ...this.fit });
    this.applyView();
    this.loadMs = performance.now() - t0;
  }

  waterMat(kind) {
    const n = TX.waterNormals();
    if (!this.waterNormal) { this.waterNormal = n.normalMap.clone(); this.waterNormal.userData.shared = true; this.waterNormal.repeat.set(0.35, 0.35); this.waterNormal.needsUpdate = true; }
    return TX.std('water:' + kind, { color: col(kind === 'sea' ? '#1D7FA6' : kind === 'icy' ? '#3E9CC4' : '#1E6F86'), roughness: 0.06, metalness: 0.1, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.2, transparent: kind !== 'sea', opacity: 0.92 });
  }

  /* a line of rocks round a pond or pit edge */
  rockEdge(pts, color, size = 0.13, step = 0.26) {
    let L = 0; const segs = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, l]); L += l; }
    const n = Math.max(8, Math.floor(L / step)), R = seeded(pts.length * 13 + Math.round(pts[0][0] * 10));
    const geo = lumpy(size, 1, 0.3, 3), mesh = new THREE.InstancedMesh(geo, TX.surf('rock' + color, TX.concrete(color, 87), { repeat: [2, 2], rough: 0.95 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let want = i / n * L, k = 0; while (want > segs[k][2] && k < segs.length - 1) { want -= segs[k][2]; k++; }
      const [a, b, l] = segs[k], u = want / (l || 1);
      const sc = 0.8 + R() * 0.6;
      p.set(a[0] + (b[0] - a[0]) * u, 0.02 + size * 0.3 * sc, a[1] + (b[1] - a[1]) * u);
      q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)); s.set(sc * 1.2, sc * 0.7, sc);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; this.root.add(mesh);
  }

  buildSign(W, isl, hole) {
    // a little wooden hole sign on the path near the tee, out of the fairway
    const [tx, tz] = W.tee, clear = (x, z) => !isl.some(p => pointInPoly(x, z, offset(p, RAIL_W + 0.25)));
    let spot = null;
    for (let r = 0.9; r < 3 && !spot; r += 0.3) for (let a = -Math.PI / 2; a < Math.PI * 1.5 && !spot; a += Math.PI / 8) {
      const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; if (clear(x, z) && isl.some(p => pointInPoly(x, z, offset(p, RAIL_W + 0.7)))) spot = [x, z];
    }
    if (!spot) return;
    const g = new THREE.Group(); g.position.set(spot[0], GROUND, spot[1]); this.root.add(g);
    const wood = TX.surf('signwood', TX.planks('#7A5230', 23, true), { repeat: [0.5, 0.5], rough: 0.85 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), wood); post.position.y = 0.5; post.castShadow = true; g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.05), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signTex(this.holeNum || '', hole.par), roughness: 0.8 }), wood]);
    board.position.set(0, 1.05, 0.03); board.castShadow = true; g.add(board);
  }

  buildZones(W, L) {
    const R = this.root; this.lavaBits = []; this.belts = []; this.swirls = [];
    const flatMesh = (pts, mat, y) => { const m = new THREE.Mesh(flat(shapeOf(pts)), mat); m.position.y = y; m.receiveShadow = true; R.add(m); return m; };
    const rim = (pts, mat, y = 0.014, w = 0.1) => { const m = new THREE.Mesh(flat(shapeOf(offset(pts, w), [pts])), mat); m.position.y = y; R.add(m); return m; };
    for (const z of W.zones) {
      const sh = shapeOf(z.pts);
      switch (z.t) {
        case 'grav': {
          const disc = new THREE.Mesh(flat(sh), TX.surf('gravpad', TX.metalPanels('#5B6B8A'), { repeat: [1.5, 1.5], rough: 1, metal: 0.7, emissive: '#1FB8B0', ei: 0.35 }));
          disc.position.y = 0.012; disc.receiveShadow = true; R.add(disc);
          const ring = rim(z.pts, glowMat('#4FF0E0', 1.6), 0.016);
          const inner = new THREE.Mesh(flat(shapeOf(offset(z.pts, -0.35), [offset(z.pts, -0.45)])), glowMat('#8FFFF4', 1.2)); inner.position.y = 0.016; R.add(inner);
          ring.userData.pulse = true; inner.userData.pulse = true;
          this.gravPads.push(ring, inner);
          continue;
        }
        case 'ice': {
          // a slick sheet of ice laid into the carpet, with a frosty edge
          flatMesh(z.pts, TX.std('icesheet', { color: col('#D6F1FF'), roughness: 0.04, metalness: 0.05, envMapIntensity: 1.8, transparent: true, opacity: 0.9 }), 0.01);
          const cracks = canvasTex(256, 256, (g, w, h) => { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; const r = seeded(5); for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); } }, true);
          cracks.repeat.set(0.3, 0.3);
          flatMesh(offset(z.pts, -0.05), new THREE.MeshBasicMaterial({ map: cracks, transparent: true, opacity: 0.5, depthWrite: false }), 0.013);
          rim(z.pts, paint('#FFFFFF', 0.7), 0.012, 0.08);
          continue;
        }
        case 'toffee': {
          flatMesh(z.pts, TX.std('toffee', { color: col('#C27428'), roughness: 0.18, metalness: 0.05, envMapIntensity: 1.3 }), 0.012);
          rim(z.pts, TX.std('toffee-edge', { color: col('#8E4E17'), roughness: 0.25 }), 0.016, 0.09);
          const b = bounds([z.pts]);
          for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09 + (i % 3) * 0.03, 10, 8), TX.std('toffee', {})); d.scale.y = 0.35; d.position.set(b.cx + ((i * 37) % 10 / 10 - 0.5) * b.w * 0.6, 0.02, b.cz + ((i * 53) % 10 / 10 - 0.5) * b.d * 0.6); R.add(d); }
          continue;
        }
        case 'sand': {
          // a raked bunker, a shade paler than the ground round it
          flatMesh(z.pts, TX.surf('bunker', TX.sand('#F0DCA4'), { repeat: [0.5, 0.5], rough: 1, nScale: 1.4 }), 0.008);
          rim(z.pts, TX.surf('bunker-lip', TX.sand('#B99B5E'), { repeat: [0.5, 0.5], rough: 1 }), 0.012, 0.07);
          continue;
        }
        case 'quick': {
          flatMesh(z.pts, TX.surf('quicksand', TX.sand('#B08A52'), { repeat: [0.5, 0.5], rough: 1, nScale: 1.2 }), 0.006);
          const b = bounds([z.pts]);
          const sw = canvasTex(256, 256, (g, w, h) => { g.strokeStyle = 'rgba(70,45,20,.55)'; g.lineWidth = 7; for (let k = 0; k < 3; k++) { g.beginPath(); for (let a = 0; a < 9; a += 0.08) { const r = a * 13; g.lineTo(w / 2 + Math.cos(a + k * 2.09) * r, h / 2 + Math.sin(a + k * 2.09) * r); } g.stroke(); } const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 40); gr.addColorStop(0, 'rgba(50,30,10,.7)'); gr.addColorStop(1, 'rgba(50,30,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
          const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ map: sw, transparent: true, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.position.set(b.cx, 0.011, b.cz); m.scale.set(b.w * 0.95, b.d * 0.95, 1); R.add(m); this.swirls.push(m);
          rim(z.pts, TX.surf('bunker-lip', TX.sand('#B99B5E'), { repeat: [0.5, 0.5], rough: 1 }), 0.012, 0.07);
          continue;
        }
        case 'boost': case 'belt': {
          const h = z.h, len = h.len || 1.6, wd = h.w || 1.2, belt = z.t === 'belt';
          const g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = -(h.a || 0); R.add(g);
          const tex = belt
            ? canvasTex(128, 64, (c, w, hh) => { c.fillStyle = '#26282C'; c.fillRect(0, 0, w, hh); c.fillStyle = '#3A3D43'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 6, hh); c.fillStyle = '#FFC93C'; c.beginPath(); c.moveTo(70, 18); c.lineTo(92, 32); c.lineTo(70, 46); c.lineTo(78, 32); c.fill(); }, true)
            : canvasTex(128, 64, (c, w, hh) => { c.fillStyle = '#FF3E8A'; c.fillRect(0, 0, w, hh); c.fillStyle = '#FFE36B'; for (const x of [10, 74]) { c.beginPath(); c.moveTo(x, 6); c.lineTo(x + 30, 32); c.lineTo(x, 58); c.lineTo(x + 16, 58); c.lineTo(x + 46, 32); c.lineTo(x + 16, 6); c.fill(); } }, true);
          const tile = belt ? 0.8 : 0.9; tex.repeat.set(len / tile, 1);
          const mat = belt ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1 }) : new THREE.MeshStandardMaterial({ map: tex, emissive: col('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.4 });
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, wd), mat); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.012; pl.receiveShadow = true; g.add(pl);
          if (belt) for (const e of [-1, 1]) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, wd + 0.04, 14), paint('#9AA0A8', 0.3, 0.9)); roll.rotation.x = Math.PI / 2; roll.position.set(e * len / 2, 0.02, 0); g.add(roll); }
          else { const frame = new THREE.Mesh(flat(shapeOf(offset(z.pts, 0.06), [z.pts])), glowMat('#FFE36B', 1.2)); frame.position.y = 0.014; R.add(frame); }
          this.belts.push({ tex, spd: belt ? 1.1 : 2.4, tile });
          continue;
        }
        case 'choc': {
          const basin = flatMesh(z.pts, paint('#2A140A', 1), 0.004); void basin;
          const n = TX.waterNormals();
          if (!this.chocNormal) { this.chocNormal = n.normalMap.clone(); this.chocNormal.userData.shared = true; this.chocNormal.repeat.set(0.25, 0.25); this.chocNormal.needsUpdate = true; }
          flatMesh(offset(z.pts, -0.04), TX.std('choc', { color: col('#6A3818'), roughness: 0.22, metalness: 0.05, normalMap: this.chocNormal, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.1 }), 0.01);
          this.rockEdge(offset(z.pts, 0.06), '#EFB9D2', 0.12, 0.22);
          continue;
        }
        default: {
          const water = z.t === 'water', frozen = this.worldId === 'ice';
          // a sunken basin: dark rim + surface just below the carpet
          flatMesh(z.pts, paint(water ? '#14303A' : '#2A0E08', 1), 0.004);
          if (water) flatMesh(offset(z.pts, -0.04), this.waterMat(frozen ? 'icy' : 'pond'), 0.01);
          else {
            const lt = TX.lavaTex();
            if (!this.lavaMap) { this.lavaMap = lt.map.clone(); this.lavaMap.userData.shared = true; this.lavaMap.repeat.set(0.6, 0.6); this.lavaMap.needsUpdate = true; }
            flatMesh(offset(z.pts, -0.04), TX.std('lava', { map: this.lavaMap, emissive: col('#FF5A1F'), emissiveMap: this.lavaMap, emissiveIntensity: 1.6, roughness: 0.7 }), 0.012);
            const b = bounds([z.pts]);
            for (let i = 0; i < 5; i++) { const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat('#FFD27A', 2)); s2.position.set(b.cx + (i - 2) * b.w * 0.17, 0.02, b.cz + ((i % 2) - 0.5) * b.d * 0.3); s2.userData.ph = i * 1.3; R.add(s2); this.lavaBits.push(s2); }
          }
          this.rockEdge(offset(z.pts, 0.06), water ? (frozen ? '#E8F4FA' : this.worldId === 'desert' ? '#C8A66A' : '#9A9282') : '#3A2A26', 0.12, 0.22);
        }
      }
    }
    if (L) void L;
  }

  buildHazards(W, L, wid) {
    const R = this.root;
    const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; R.add(m); return m; };
    // wall blocks and loop rails
    for (const b of W.blocks) {
      if (b.idol || b.windmill) continue;
      if (b.rail) {
        const g = extrude(shapeOf(b.pts), 0.26, 0.02, 4);
        add(new THREE.Mesh(g, [paint('#D8DDE6', 0.25, 0.9), paint('#B9C0CC', 0.3, 0.9)]));
        continue;
      }
      const g = extrude(shapeOf(b.pts), RAIL_H + 0.05, 0, 4);
      add(new THREE.Mesh(g, [L.cap(), L.rail()]));
      const cap = extrude(shapeOf(offset(b.pts, 0.035)), 0.05, 0.012, 4); cap.translate(0, RAIL_H + 0.05, 0);
      add(new THREE.Mesh(cap, [L.cap(), L.cap()]));
    }
    for (const c of W.circles) {
      if (c.tag === 'bumper') {
        const g = new THREE.Group(); g.position.set(c.x, 0, c.z);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 1.02, c.r * 1.08, 0.08, 28), paint('#2A2A2E', 0.5, 0.6)); base.position.y = 0.04; g.add(base);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.7, c.r * 0.75, 0.46, 28), paint('#D8342B', 0.28, 0.1)); post.position.y = 0.3; post.castShadow = true; g.add(post);
        const rub = new THREE.Mesh(new THREE.TorusGeometry(c.r * 0.84, c.r * 0.16, 12, 32), paint('#141416', 0.85)); rub.rotation.x = Math.PI / 2; rub.position.y = 0.2; rub.castShadow = true; g.add(rub);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.55, c.r * 0.7, 0.08, 28), paint('#F2F2EE', 0.3)); top.position.y = 0.57; g.add(top);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(c.r * 0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glowMat('#FFD24A', 1.2)); lamp.position.y = 0.61; g.add(lamp);
        R.add(g); this.bumpers.push({ g, h: c.h, t: 9, lamp });
      } else if (!c.hub) this.post(c, wid);
    }
    // chasms + sliding planks
    for (const gp of W.gaps) {
      const water = gp.h.water, rot = -Math.atan2(gp.dz, gp.dx);
      const cv = canvasTex(64, 128, (g2, w2, h2) => {
        const gr = g2.createLinearGradient(0, 0, w2, 0);
        if (water) { gr.addColorStop(0, '#0C3F55'); gr.addColorStop(0.5, '#1D7FA6'); gr.addColorStop(1, '#0C3F55'); }
        else { gr.addColorStop(0, '#020304'); gr.addColorStop(0.3, '#0E1216'); gr.addColorStop(0.7, '#0E1216'); gr.addColorStop(1, '#020304'); }
        g2.fillStyle = gr; g2.fillRect(0, 0, w2, h2);
      });
      const pit = new THREE.Mesh(new THREE.PlaneGeometry(gp.len, gp.w), new THREE.MeshBasicMaterial({ map: cv }));
      pit.rotation.x = -Math.PI / 2; pit.rotation.z = rot; pit.position.set(gp.x, 0.004, gp.z); R.add(pit);
      for (const s of [-1, 1]) {   // steel edge strips
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, gp.w), paint('#8A8F98', 0.35, 0.9));
        lip.position.set(gp.x + gp.dx * s * gp.len / 2, 0.02, gp.z + gp.dz * s * gp.len / 2); lip.rotation.y = rot; R.add(lip);
      }
      const pg = new THREE.Group();
      const deckMat = wid === 'space' ? paint('#AEB6C8', 0.35, 0.85) : TX.surf('bridge', TX.planks('#9B6A3A', 29, false), { repeat: [1.2, 1.2], rough: 0.8 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(gp.len + 0.5, 0.09, gp.pw), deckMat);
      deck.position.y = 0.03; deck.castShadow = true; deck.receiveShadow = true; pg.add(deck);
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(gp.len + 0.5, 0.07, 0.06), wid === 'space' ? glowMat('#4FF0E0', 0.9) : paint('#5E3B1E', 0.8)); rail.position.set(0, 0.1, s * (gp.pw / 2 - 0.03)); rail.castShadow = true; pg.add(rail); }
      pg.rotation.y = rot; R.add(pg);
      this.planks.push({ g: pg, gp });
    }
    for (const wm of W.windmills) this.mills.push(this.windmill(wm, wid));
    for (const sw of W.sweepers) this.sweepers.push(this.sweeper(sw, wid));
    for (const p of W.pistons) this.pistons.push(this.piston(p, wid));
    for (const lp of W.loops) this.loop(lp, wid);
    for (const tr of W.triggers) {
      const h = tr.h;
      if (tr.t === 'portal') { this.portals.push(this.ring(h.a, '#FF5FD2', null), this.ring(h.b, '#4FF0E0', h.dir)); }
      else if (tr.t === 'cannon') this.cannons.push(this.cannon(h));
      else if (tr.t === 'idol') { if (h.kind === 'sphinx') this.sphinx(h); else this.idol(h); }
    }
    this.movers = W.movers.map(m => m.t === 'vine' ? this.vine(m) : m.t === 'roller' ? this.roller(m) : this.ghost(m));
  }

  post(c, wid) {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); this.root.add(g);
    const sh = (m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    if (wid === 'candy') {
      // a candy-cane bollard
      const cane = sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.8, c.r * 0.85, 1.0, 20), new THREE.MeshStandardMaterial({ map: stripeTex('#E8453C', '#FFF8F2', 10), roughness: 0.3 })));
      cane.position.y = 0.5; cane.rotation.y = 0.4;
      sh(new THREE.Mesh(new THREE.SphereGeometry(c.r * 0.82, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint('#FFF8F2', 0.3))).position.y = 1.0;
      return;
    }
    if (wid === 'ice') {
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.85, c.r, 0.9, 8), TX.std('icepost', { color: col('#CDEBFA'), roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.6 }))).position.y = 0.45;
      sh(new THREE.Mesh(lumpy(c.r * 0.95, 1, 0.2, 5), paint('#FFFFFF', 0.8))).position.y = 0.92;
      return;
    }
    if (wid === 'desert') {
      const sst = TX.surf('sandcol', TX.concrete('#D9BD83', 76), { repeat: [1.2, 1.2], rough: 0.95 });
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.8, c.r * 0.9, 1.1, 16), sst)).position.y = 0.55;
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 1.05, c.r * 0.8, 0.22, 16), sst)).position.y = 1.2;
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.82, c.r * 0.82, 0.08, 16), paint('#2F6FB0', 0.5))).position.y = 1.02;
      return;
    }
    if (wid === 'haunted') {
      const t = sh(new THREE.Mesh(new RoundedBoxGeometry(c.r * 2, 1.0, c.r * 0.9, 3, 0.2), TX.surf('tomb', TX.concrete('#8E8A99', 89), { repeat: [1.5, 1.5], rough: 0.95 })));
      t.position.y = 0.5; t.rotation.z = 0.06;
    } else if (wid === 'space') {
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.9, c.r, 0.8, 20), paint('#C7CEDB', 0.3, 0.9))).position.y = 0.4;
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.92, c.r * 0.92, 0.08, 20), glowMat('#FFB23E', 1.4))).position.y = 0.62;
    } else {
      sh(new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.9, c.r, 1.0, 16), TX.surf('pillar', TX.concrete('#B5AC96', 85), { repeat: [1.2, 1.2], rough: 0.95 }))).position.y = 0.5;
      sh(new THREE.Mesh(new THREE.BoxGeometry(c.r * 2.3, 0.18, c.r * 2.3), TX.surf('pillarcap', TX.concrete('#C9C0A9', 86), { rough: 0.9 }))).position.y = 1.08;
    }
  }

  windmill(wm, wid) {
    const h = wm.h, R = this.root, w = h.w || 3.4, d = h.d || 1.5, gap = h.gap || 1.05;
    const g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = -h.a; R.add(g);
    const S = {
      jungle:  { body: TX.surf('mill-j', TX.stoneBlocks('#BDB39A', '#7D7565', 9), { repeat: [0.6, 1.2], rough: 0.9 }), roof: TX.surf('thatch', TX.thatch(), { repeat: [0.8, 0.8], rough: 1 }), sail: '#EFE6D2', spar: '#6B4A2A' },
      pirate:  { body: TX.surf('mill-p', TX.planks('#F1ECE2', 31, true), { repeat: [0.8, 1.2], rough: 0.7 }), roof: TX.surf('roof-r', TX.roofTiles('#B8412E'), { repeat: [0.9, 0.9], rough: 0.8 }), sail: '#F4F0E6', spar: '#7A4A22', stripe: true },
      space:   { body: TX.surf('mill-s', TX.metalPanels('#C9D0DE'), { repeat: [0.8, 0.8], rough: 1, metal: 0.8 }), roof: paint('#8E97B4', 0.3, 0.9), sail: '#2F57C9', spar: '#C9D0DE', solar: true },
      haunted: { body: TX.surf('mill-h', TX.planks('#4A3F52', 33, true), { repeat: [0.8, 1.2], rough: 0.9 }), roof: TX.surf('roof-h', TX.roofTiles('#3A3046'), { repeat: [0.9, 0.9], rough: 0.9 }), sail: '#CFC7B6', spar: '#2E2630', tatty: true },
      candy:   { body: TX.surf('mill-c', TX.planks('#FFE7F1', 35, true), { repeat: [0.8, 1.2], rough: 0.5 }), roof: TX.surf('roof-c', TX.roofTiles('#7A4424'), { repeat: [0.9, 0.9], rough: 0.5 }), sail: '#FFF4B8', spar: '#FF7AB6', stripe: '#FF7AB6' },
    }[wid] || { body: TX.surf('mill-j', TX.stoneBlocks('#BDB39A', '#7D7565', 9), { repeat: [0.6, 1.2], rough: 0.9 }), roof: TX.surf('roof-r', TX.roofTiles('#B8412E'), { repeat: [0.9, 0.9], rough: 0.8 }), sail: '#EFE6D2', spar: '#6B4A2A' };
    // tapered tower whose footprint is exactly the physics block: d along the path, w across it
    const Hh = 2.1, ax = d / 2 + 0.05, az = w / 2, taper = 0.66;
    const oct = (h2, open = false) => { const geo = new THREE.CylinderGeometry(taper, 1, h2, 8, 1, open); geo.rotateY(Math.PI / 8); return geo; };
    const tower = new THREE.Mesh(oct(Hh), S.body); tower.scale.set(ax, 1, az); tower.position.y = Hh / 2; tower.castShadow = tower.receiveShadow = true; g.add(tower);
    if (S.stripe) for (const [y0, y1] of [[0.3, 0.7], [1.1, 1.5]]) {
      const k0 = 1 - (1 - taper) * y0 / Hh, k1 = 1 - (1 - taper) * y1 / Hh;
      const geo = new THREE.CylinderGeometry(k1 * 1.012, k0 * 1.012, y1 - y0, 8, 1, true); geo.rotateY(Math.PI / 8);
      const band = new THREE.Mesh(geo, paint(typeof S.stripe === 'string' ? S.stripe : '#C8392B', 0.6)); band.scale.set(ax, 1, az); band.position.y = (y0 + y1) / 2; g.add(band);
    }
    const roofGeo = new THREE.ConeGeometry(taper * 1.18, 1.1, S.solar ? 16 : 8); roofGeo.rotateY(Math.PI / 8);
    const roof = new THREE.Mesh(roofGeo, S.roof); roof.scale.set(ax, 1, az); roof.position.y = Hh + 0.55; roof.castShadow = true; g.add(roof);
    // tunnel mouths on the entrance and exit faces, the width of the physics gap
    for (const sx of [-1, 1]) {
      const face = new THREE.Group(); face.position.set(sx * (ax + 0.012), 0, 0); face.rotation.y = -sx * Math.PI / 2; g.add(face);
      const hole = new THREE.Shape(); hole.moveTo(-gap / 2, 0); hole.lineTo(-gap / 2, 0.42); hole.absarc(0, 0.42, gap / 2, Math.PI, 0, true); hole.lineTo(gap / 2, 0); hole.lineTo(-gap / 2, 0);
      const dark = new THREE.Mesh(new THREE.ShapeGeometry(hole, 12), paint('#09090C', 1)); face.add(dark);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(gap / 2 + 0.04, 0.045, 6, 18, Math.PI), paint(wid === 'space' ? '#4FF0E0' : '#F2EDE2', 0.6)); trim.position.y = 0.42; face.add(trim);
    }
    // a lit window on the camera-facing side for character
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), wid === 'haunted' ? glowMat('#FFC857', 1.6) : paint('#2E3A48', 0.2, 0.3));
    win.position.set(0, 1.3, az * (1 - (1 - taper) * 1.3 / Hh) + 0.02); g.add(win);
    // sails: square-on to the tee, turning about the path direction, just in front of the tunnel mouth.
    // A blade pointing straight down covers the mouth — that's exactly when the physics blocks it.
    const hubY = 1.6, bladeL = hubY - 0.12;
    const hub = new THREE.Group(); hub.position.set(-(ax + 0.16), hubY, 0); g.add(hub);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 10), paint(S.spar, 0.5, wid === 'space' ? 0.8 : 0)); axle.rotation.z = Math.PI / 2; axle.position.x = 0.12; hub.add(axle);
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), paint(S.spar, 0.5, wid === 'space' ? 0.8 : 0)); hubM.rotation.z = Math.PI / 2; hub.add(hubM);
    const n = wm.blades, sails = new THREE.Group(); hub.add(sails);
    const spar = paint(S.spar, 0.7, wid === 'space' ? 0.8 : 0), cloth = S.solar ? TX.std('solar', { color: col('#20378A'), roughness: 0.2, metalness: 0.6, emissive: col('#1A2E88'), emissiveIntensity: 0.3, side: THREE.DoubleSide }) : paint(S.sail, 0.9, 0, { side: THREE.DoubleSide });
    for (let k = 0; k < n; k++) {
      const arm = new THREE.Group(); arm.rotation.x = k * Math.PI * 2 / n; sails.add(arm);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, bladeL, 0.07), spar); bar.position.y = -bladeL / 2; bar.castShadow = true; arm.add(bar);
      const L0 = 0.3, L1 = bladeL, wdt = 0.46, len = (L1 - L0) * (S.tatty ? 0.8 : 1);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.015, len, wdt), cloth); panel.position.set(-0.02, -(L0 + len / 2), wdt / 2 + 0.035); panel.castShadow = true; arm.add(panel);
      for (let j = 0; j <= 5; j++) { const lath = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, wdt + 0.04), spar); lath.position.set(-0.035, -(L0 + (L1 - L0) * j / 5), wdt / 2 + 0.035); arm.add(lath); }
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, L1 - L0, 0.03), spar); edge.position.set(-0.035, -(L0 + L1) / 2, wdt + 0.055); arm.add(edge);
    }
    return { wm, sails };
  }

  loop(lp, wid) {
    const R = 1.0 + BALL_R, pts = [];
    for (let i = 0; i <= 64; i++) { const th = i / 64 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(th) * R, R - Math.cos(th) * R + 0.03, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const g = new THREE.Group(); g.position.set(lp.x, 0, lp.z); g.rotation.y = -Math.atan2(lp.dz, lp.dx); this.root.add(g);
    const steel = paint('#D9DEE6', 0.22, 1), accent = wid === 'haunted' ? paint('#7B5CC4', 0.35, 0.6) : wid === 'space' ? glowMat('#4FF0E0', 0.8) : wid === 'candy' ? paint('#FF7AB6', 0.35) : wid === 'ice' ? paint('#4FC3F7', 0.3, 0.3) : paint('#D8342B', 0.35, 0.3);
    for (const s of [-1, 1]) { const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.055, 10, true), steel); tube.position.z = s * 0.3; tube.castShadow = true; g.add(tube); }
    for (let i = 0; i < 16; i++) {
      const th = i / 16 * Math.PI * 2, tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.64), i % 2 ? steel : accent);
      tie.position.set(Math.sin(th) * R, R - Math.cos(th) * R + 0.03, 0); tie.rotation.z = -th; g.add(tie);
    }
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, R * 2, 8), steel); leg.position.set(0, R, s * 0.5); g.add(leg); const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 12), paint('#555A63', 0.5, 0.8)); ft.position.set(0, 0.02, s * 0.5); g.add(ft); }
  }

  ring(p, color, dir) {
    // portal lies flat on the green like a glowing hole, so the ball visibly rolls into it
    const g = new THREE.Group(); g.position.set(p[0], 0, p[1]); this.root.add(g);
    const flat = new THREE.Group(); flat.rotation.x = -Math.PI / 2; flat.position.y = 0.06; g.add(flat);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 14, 40), paint('#9AA2B0', 0.25, 1)); frame.castShadow = true; flat.add(frame);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 10, 40), TX.std('ring:' + color, { color: col(color), emissive: col(color), emissiveIntensity: 1.6, roughness: 0.3 })); tor.position.z = 0.04; flat.add(tor);
    const sw = canvasTex(128, 128, (c2, w2, h2) => { const gr = c2.createRadialGradient(w2 / 2, h2 / 2, 4, w2 / 2, h2 / 2, w2 / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); c2.fillStyle = gr; c2.fillRect(0, 0, w2, h2); c2.strokeStyle = 'rgba(255,255,255,.6)'; c2.lineWidth = 4; for (let k = 0; k < 3; k++) { c2.beginPath(); for (let a = 0; a < 5; a += 0.1) { const r = a * 11; c2.lineTo(w2 / 2 + Math.cos(a + k * 2.1) * r, h2 / 2 + Math.sin(a + k * 2.1) * r); } c2.stroke(); } });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 32), new THREE.MeshBasicMaterial({ map: sw, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); disc.position.z = -0.02; flat.add(disc);
    if (dir != null) {
      const sh = new THREE.Shape([new THREE.Vector2(0.55, 0), new THREE.Vector2(0.1, 0.32), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.1, -0.32)]);
      const ar = new THREE.Mesh(new THREE.ShapeGeometry(sh), glowMat(color, 1.2));
      ar.rotation.x = -Math.PI / 2; ar.rotation.z = -dir; ar.position.set(p[0] + Math.cos(dir) * 0.45, 0.016, p[1] + Math.sin(dir) * 0.45);
      this.root.add(ar); this.arrows.push(ar);
    }
    return { g, tor, disc, face: false };
  }

  cannon(h) {
    const g = new THREE.Group(); g.position.set(h.x, 0, h.z); this.root.add(g);
    const a = Math.atan2(h.to[1] - h.z, h.to[0] - h.x); g.rotation.y = -a;
    const iron = paint('#2C3036', 0.45, 0.85), wood = TX.surf('carriage', TX.planks('#6E4424', 37, false), { repeat: [1.5, 1.5], rough: 0.85 });
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), wood); carriage.position.set(0.1, 0.3, 0); carriage.castShadow = true; g.add(carriage);
    const barrel = new THREE.Group(); barrel.position.set(0.2, 0.62, 0); barrel.rotation.z = 0.42; g.add(barrel);
    const pts = [[0.26, -0.9], [0.3, -0.7], [0.34, 0.2], [0.3, 0.75], [0.38, 0.82], [0.38, 0.9], [0.24, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
    const tube = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), iron); tube.rotation.z = -Math.PI / 2; tube.castShadow = true; barrel.add(tube);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), iron); knob.position.x = -0.98; barrel.add(knob);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.23, 16), paint('#050506', 1)); mouth.rotation.y = -Math.PI / 2; mouth.position.x = 0.905; mouth.rotation.y = Math.PI / 2; barrel.add(mouth);
    for (const s of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 20), wood); wh.rotation.x = Math.PI / 2; wh.position.set(0.1, 0.32, s * 0.42); wh.castShadow = true; g.add(wh);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 24), iron); tyre.position.set(0.1, 0.32, s * 0.47); g.add(tyre);
    }
    // the rolling-in ramp at the back
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.55), wood); ramp.position.set(-0.55, 0.05, 0); ramp.rotation.z = -0.12; g.add(ramp);
    const land = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), TX.std('landring', { color: col('#F2F2EE'), roughness: 0.6, transparent: true, opacity: 0.9 }));
    land.rotation.x = -Math.PI / 2; land.position.set(h.to[0], 0.014, h.to[1]); this.root.add(land);
    return { g, barrel, h, kick: 9 };
  }

  idol(h) {
    const s = h.size || 2.2, g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = -h.face; this.root.add(g);
    const stone = TX.surf('idolstone', TX.stoneBlocks('#A69C84', '#7A725F', 11), { repeat: [0.9, 1.8], rough: 0.95, nScale: 1.4 });
    const head = new THREE.Mesh(new RoundedBoxGeometry(s, 2.0, s, 3, 0.18), stone); head.position.y = 1.0; head.castShadow = head.receiveShadow = true; g.add(head);
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.22, s * 0.9, 2, 0.06), stone); brow.position.set(s / 2 + 0.08, 1.52, 0); g.add(brow);
    for (const z of [-0.45, 0.45]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.34), paint('#1E1A14', 1)); eye.position.set(s / 2 + 0.01, 1.3, z); g.add(eye); }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.3), stone); nose.position.set(s / 2 + 0.1, 0.98, 0); g.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 1.0), paint('#0B0906', 1)); mouth.position.set(s / 2 + 0.01, 0.32, 0); g.add(mouth);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(lumpy(0.3, 1, 0.35, i + 4), paint(i % 2 ? '#4F8F3A' : '#5DA044', 1)); m.scale.set(1.3, 0.45, 1.1); m.position.set((i % 3 - 1) * 0.6, 2.02, (Math.floor(i / 3) - 0.5) * 0.8); m.castShadow = true; g.add(m); }
    const exit = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 24), stone); exit.rotation.x = Math.PI / 2; exit.position.set(h.to[0], 0.05, h.to[1]); this.root.add(exit);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), paint('#0B0906', 1)); hole.rotation.x = -Math.PI / 2; hole.position.set(h.to[0], 0.012, h.to[1]); this.root.add(hole);
  }

  /* a spinning arm across the path (factory spinner / desert scarab spinner) */
  sweeper(sw, wid) {
    const g = new THREE.Group(); g.position.set(sw.x, 0, sw.z); this.root.add(g);
    const desert = wid === 'desert';
    const hubMat = desert ? TX.surf('sandcol', TX.concrete('#D9BD83', 76), { repeat: [1.2, 1.2], rough: 0.95 }) : paint('#3A3D44', 0.35, 0.85);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 20), hubMat); base.position.y = 0.25; base.castShadow = base.receiveShadow = true; g.add(base);
    const arms = new THREE.Group(); arms.position.y = 0.22; g.add(arms);
    const stripes = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#FFC93C'; c.fillRect(0, 0, w, h); c.fillStyle = '#1E1F22'; for (let x = -32; x < w; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, 0); c.lineTo(x + 32, 0); c.lineTo(x + 16, h); c.fill(); } }, true);
    stripes.repeat.set(sw.len / 0.5, 1);
    const armMat = desert ? TX.surf('scarabwood', TX.planks('#7A5230', 51, false), { repeat: [1, 1], rough: 0.8 }) : new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5, metalness: 0.3 });
    for (let k = 0; k < sw.arms; k++) {
      const arm = new THREE.Group(); arm.rotation.y = -k * Math.PI * 2 / sw.arms; arms.add(arm);
      const bar = new THREE.Mesh(new RoundedBoxGeometry(sw.len, 0.2, sw.r * 2, 2, 0.05), armMat); bar.position.x = sw.len / 2; bar.castShadow = true; arm.add(bar);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 12), desert ? paint('#2F6FB0', 0.4, 0.3) : paint('#D8342B', 0.4, 0.3)); tip.position.set(sw.len - 0.06, 0.02, 0); arm.add(tip);
    }
    const cap = new THREE.Mesh(desert ? new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16), desert ? paint('#2E7A62', 0.2, 0.7) : paint('#FFC93C', 0.4, 0.4));
    cap.position.y = desert ? 0.46 : 0.5; cap.castShadow = true; g.add(cap);
    if (desert) cap.scale.z = 1.3;   // a scarab-shell dome
    return { sw, arms };
  }

  /* a crusher gate: a striped block that rises out of a slot across the path */
  piston(p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = -Math.atan2(p.dz, p.dx); this.root.add(g);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(p.d + 0.08, p.w), paint('#0E0F11', 1)); slot.rotation.x = -Math.PI / 2; slot.position.y = 0.006; g.add(slot);
    const stripes = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#FFC93C'; c.fillRect(0, 0, w, h); c.fillStyle = '#1E1F22'; for (let x = -64; x < w; x += 48) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, 0); c.lineTo(x + 48, 0); c.lineTo(x + 24, h); c.fill(); } }, true);
    stripes.repeat.set(p.w / 1.2, 1);
    const side = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5, metalness: 0.3 }), top = paint('#8E949C', 0.35, 0.85);
    const st2 = stripes.clone(); st2.repeat.set(p.w / 0.6, 1); st2.rotation = Math.PI / 2; st2.needsUpdate = true;
    const topS = new THREE.MeshStandardMaterial({ map: st2, roughness: 0.5, metalness: 0.3 });
    const H = 0.62, block = new THREE.Mesh(new THREE.BoxGeometry(p.d, H, p.w), [side, side, topS, top, side, side]);
    block.castShadow = block.receiveShadow = true; g.add(block);
    const lamps = [];
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), paint('#3A3D44', 0.4, 0.85)); post.position.set(0, 0.45, s * (p.w / 2 + 0.22)); post.castShadow = true; g.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x33ff66, emissiveIntensity: 1.4 })); lamp.position.set(0, 0.95, s * (p.w / 2 + 0.22)); g.add(lamp); lamps.push(lamp);
    }
    return { p, block, lamps, H, up: null };
  }

  /* a sliding penguin or a rolling boulder that trundles along a fixed track */
  roller(m) {
    const g = new THREE.Group(); this.root.add(g);
    const r = m.r, peng = m.h.kind === 'penguin';
    const body = new THREE.Group(); g.add(body);
    if (peng) {
      const black = paint('#1C2230', 0.45), white = paint('#F7F7F4', 0.5), orange = paint('#FF9A2E', 0.4);
      const torso = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 20, 14), black); torso.scale.set(0.9, 1.25, 0.9); torso.position.y = r * 1.15; torso.castShadow = true; body.add(torso);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 18, 12), white); belly.scale.set(0.6, 1.1, 0.8); belly.position.set(r * 0.4, r * 1.05, 0); body.add(belly);
      const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 18, 12), black); head.position.y = r * 2.35; head.castShadow = true; body.add(head);
      for (const z of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), white); eye.position.set(r * 0.45, r * 2.45, z * r * 0.22); body.add(eye);
        const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 8, 6), black); pup.position.set(r * 0.56, r * 2.45, z * r * 0.22); body.add(pup);
        const wing = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 12, 8), black); wing.scale.set(0.5, 1.3, 0.25); wing.position.set(0, r * 1.2, z * r * 0.85); wing.rotation.x = z * 0.35; body.add(wing);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 10, 6), orange); foot.scale.set(1.4, 0.35, 0.9); foot.position.set(r * 0.35, r * 0.08, z * r * 0.35); body.add(foot);
      }
      const beak = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.4, 10), orange); beak.rotation.z = -Math.PI / 2; beak.position.set(r * 0.72, r * 2.28, 0); body.add(beak);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, r * 0.1, 8, 20), paint('#E8453C', 0.8)); scarf.rotation.x = Math.PI / 2; scarf.position.y = r * 1.92; body.add(scarf);
    } else {
      const rock = new THREE.Mesh(lumpy(r, 1, 0.25, 11), TX.surf('boulder', TX.stoneBlocks('#B58E5A', '#8A6A3E', 21), { repeat: [1, 1], rough: 0.95, nScale: 1.5 }));
      rock.castShadow = true; rock.position.y = r; body.add(rock);
      return { m, g, body, spin: rock, roll: true };
    }
    return { m, g, body, waddle: true };
  }

  /* the desert version of the idol: a sphinx whose mouth-tunnel is the shortcut */
  sphinx(h) {
    const s = h.size || 2.2, g = new THREE.Group(); g.position.set(h.x, 0, h.z); g.rotation.y = -h.face; this.root.add(g);
    const stone = TX.surf('sphinx', TX.stoneBlocks('#D6B274', '#A58550', 23), { repeat: [0.9, 1.8], rough: 0.95, nScale: 1.2 });
    const sh = (m) => { m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    // the lion body lies along the local x axis (face towards +x)
    sh(new THREE.Mesh(new RoundedBoxGeometry(s, 0.9, s * 0.8, 3, 0.18), stone)).position.set(0, 0.45, 0);
    for (const z of [-1, 1]) { const paw = sh(new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.3, 0.34, 2, 0.1), stone)); paw.position.set(s / 2 - 0.2, 0.15, z * s * 0.3); }
    const head = sh(new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.0, 0.85, 3, 0.2), stone)); head.position.set(s / 2 - 0.5, 1.35, 0);
    // striped nemes headdress
    const nemes = canvasTex(64, 128, (c, w, hh) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2F6FB0' : '#E9C24A'; c.fillRect(0, i * hh / 8, w, hh / 8 + 1); } });
    const cloth = new THREE.MeshStandardMaterial({ map: nemes, roughness: 0.6 });
    for (const z of [-1, 1]) { const lap = sh(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.16), cloth)); lap.position.set(s / 2 - 0.35, 1.05, z * 0.52); lap.rotation.x = -z * 0.12; }
    const hood = sh(new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth)); hood.position.set(s / 2 - 0.55, 1.78, 0); hood.scale.set(1, 0.7, 1.05);
    for (const z of [-0.2, 0.2]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.16), paint('#1E1A14', 1)); eye.position.set(s / 2 - 0.04, 1.5, z); g.add(eye); }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.16), stone); nose.position.set(s / 2 - 0.02, 1.3, 0); g.add(nose);
    // the tunnel mouth at ground level, between the paws
    const mouth = new THREE.Shape(); const gw = 0.5; mouth.moveTo(-gw, 0); mouth.lineTo(-gw, 0.25); mouth.absarc(0, 0.25, gw, Math.PI, 0, true); mouth.lineTo(gw, 0); mouth.lineTo(-gw, 0);
    const dark = new THREE.Mesh(new THREE.ShapeGeometry(mouth, 12), paint('#0B0906', 1)); dark.rotation.y = Math.PI / 2; dark.position.set(s / 2 + 0.012, 0, 0); g.add(dark);
    const exit = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 24), stone); exit.rotation.x = Math.PI / 2; exit.position.set(h.to[0], 0.05, h.to[1]); this.root.add(exit);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), paint('#0B0906', 1)); hole.rotation.x = -Math.PI / 2; hole.position.set(h.to[0], 0.012, h.to[1]); this.root.add(hole);
  }

  vine(m) {
    const h = m.h, g = new THREE.Group(); this.root.add(g);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), paint('#4B6B2A', 0.9)); g.add(stem);
    const bob = new THREE.Group(); g.add(bob);
    const knot = new THREE.Mesh(lumpy(m.r * 0.9, 1, 0.25, 9), paint('#3F7A2E', 0.9)); knot.castShadow = true; bob.add(knot);
    for (let i = 0; i < 9; i++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), paint(i % 2 ? '#5DA044' : '#4C8F36', 0.8)); lf.scale.set(1.6, 0.25, 0.8); lf.position.set(Math.cos(i * 1.7) * 0.36, 0.1 + i * 0.12, Math.sin(i * 1.7) * 0.36); lf.rotation.y = i; lf.castShadow = true; bob.add(lf); }
    // a gnarled tree branch overhead that the vine hangs from
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 4, 8), paint('#5A4330', 0.9)); branch.rotation.z = Math.PI / 2; branch.rotation.y = -(h.a || 0) + Math.PI / 2; branch.position.set(h.x, 6.6, h.z); branch.castShadow = true; this.root.add(branch);
    return { m, g, stem, bob, pivot: new THREE.Vector3(h.x, 6.5, h.z) };
  }

  ghost(m) {
    const g = new THREE.Group(); this.root.add(g);
    const prof = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a) * m.r, 0.55 + Math.cos(a) * m.r)); }
    prof.reverse(); for (let i = 1; i <= 4; i++) prof.push(new THREE.Vector2(m.r * (1 + i * 0.03), 0.55 - i * 0.14));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), TX.std('ghostbody', { color: col('#F4F1FF'), emissive: col('#BBAAFF'), emissiveIntensity: 0.55, roughness: 0.6, transparent: true, opacity: 0.88 }));
    g.add(body);
    for (const x of [-0.17, 0.17]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), paint('#1C1230', 0.5)); e.scale.set(1, 1.3, 0.5); e.position.set(x, 0.72, m.r * 0.92); g.add(e); }
    const mo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), paint('#1C1230', 0.5)); mo.scale.set(1.2, 0.8, 0.5); mo.position.set(0, 0.5, m.r * 0.97); g.add(mo);
    return { m, g, ghost: true };
  }

  buildCup(W, flagItem, cr) {
    const R = this.root, [x, z] = W.cup;
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr, SLAB - 0.02, 32, 1, true), paint('#F2F2EE', 0.35, 0.2, { side: THREE.DoubleSide })); liner.position.set(x, -SLAB / 2, z); liner.receiveShadow = true; R.add(liner);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(cr, 32), paint('#2A2F2C', 0.9)); bottom.rotation.x = -Math.PI / 2; bottom.position.set(x, -SLAB + 0.03, z); R.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(cr, 0.015, 6, 36), paint('#F6F6F2', 0.3, 0.2)); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.004, z); R.add(rim);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 10), paint('#F4F2EC', 0.35, 0.1)); pole.position.set(x, 1.25 - 0.2, z); pole.castShadow = true; R.add(pole);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), paint('#D8342B', 0.3)); tip.position.set(x, 2.28, z); R.add(tip);
    const geo = new THREE.PlaneGeometry(1.0, 0.62, 12, 5); geo.translate(0.5, 0, 0);
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(flagItem), side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(x + 0.03, 1.9, z); flag.castShadow = true; R.add(flag);
    flag.userData.base = geo.attributes.position.array.slice();
    this.flag = flag;
  }

  buildGems(W) {
    const mat = TX.std('gem', { color: col('#FF4FA3'), emissive: col('#FF2E8E'), emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.2, envMapIntensity: 2 });
    this.gems = W.gems.map(([x, z]) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat);
      m.scale.y = 1.3; m.position.set(x, 0.5, z); m.castShadow = true; this.root.add(m); return m;
    });
  }

  buildBall(skin) {
    const d = TX.dimples();
    const mat = new THREE.MeshStandardMaterial({ map: ballTexture(skin.id), normalMap: d.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: skin.id === 'disco' ? 0.15 : 0.32, metalness: skin.id === 'disco' ? 0.5 : 0.02 });
    if (skin.id === 'lava') { mat.emissive = col('#ff5a1a'); mat.emissiveIntensity = 0.5; }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), mat);
    this.ball.castShadow = true; this.root.add(this.ball);
    this.ball.position.set(this.world.tee[0], BALL_R, this.world.tee[1]);
    this.glow = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.5, BALL_R * 2.0, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.root.add(this.glow);
  }

  buildPutter(p) {
    // a blade putter: the head lies across the line of the putt (face square to the ball),
    // with the shaft rising from the heel and leaning away like a player standing beside the ball
    const g = new THREE.Group();
    const shaftMat = p.s3 ? new THREE.MeshStandardMaterial({ map: stripeTex(p.s3[0], p.s3[1], 12), roughness: 0.4 }) : paint(p.shaft, 0.3, 0.6);
    const headMat = p.glow ? glowMat(p.head, 0.9) : paint(p.head, 0.3, 0.7);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.15, 0.18, 2, 0.04), headMat); head.position.set(0, 0.075, 0); g.add(head);
    const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 10), headMat); hosel.position.set(0.24, 0.2, -0.02); g.add(hosel);
    const shaftG = new THREE.Group(); shaftG.position.set(0.24, 0.26, -0.02); shaftG.rotation.z = -0.32; g.add(shaftG);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.033, 1.7, 10), shaftMat); shaft.position.y = 0.85; shaftG.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.42, 10), paint('#1A1A1C', 0.9)); grip.position.y = 1.55; shaftG.add(grip);
    head.castShadow = shaft.castShadow = grip.castShadow = true;
    const pivot = new THREE.Group(); pivot.add(g);
    this.putter = pivot; this.putterInner = g; pivot.visible = false; this.root.add(pivot);
  }

  /* hand-placed props from the hole data */
  deco(d, wid) {
    const g = new THREE.Group(); g.position.set(d.x, GROUND, d.z); this.root.add(g);
    this.prop(g, d.kind, wid, Math.round(d.x * 13 + d.z * 7));
  }

  prop(g, kind, wid, seed = 1) {
    const R = seeded(seed + 17);
    const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    const stone = TX.surf('propstone', TX.concrete('#B3AA93', 88), { repeat: [1.5, 1.5], rough: 0.95 });
    const bark = TX.surf('bark', TX.planks('#5B4130', 41, true), { repeat: [2, 2], rough: 1, nScale: 2 });
    const leaf = (c) => paint(c, 0.85);
    switch (kind) {
      case 'pillar': m(new THREE.CylinderGeometry(0.4, 0.46, 1.9, 14), stone, 0, 0.95); m(new THREE.BoxGeometry(1.1, 0.26, 1.1), stone, 0, 2.0); m(lumpy(0.35, 1, 0.3, seed), leaf('#4F8F3A'), 0.2, 2.2, 0.1).scale.set(1.4, 0.5, 1.2); break;
      case 'bush': case 'shrub': { const n = 3 + Math.floor(R() * 2); for (let i = 0; i < n; i++) m(lumpy(0.5 + R() * 0.3, 1, 0.25, seed + i), leaf(['#3E7F32', '#4A9139', '#35702C'][i % 3]), (i - n / 2) * 0.5, 0.45 + R() * 0.2, (R() - 0.5) * 0.5); break; }
      case 'tree': { m(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8), bark, 0, 0.9); for (let i = 0; i < 5; i++) m(lumpy(0.7 + R() * 0.3, 1, 0.22, seed + i), leaf(['#3B7A2F', '#468C36', '#2F6A28'][i % 3]), (R() - 0.5) * 1.0, 2.1 + R() * 0.7, (R() - 0.5) * 1.0); break; }
      case 'flowers': { const bed = m(new THREE.CylinderGeometry(0.7, 0.75, 0.2, 18), TX.surf('mulch', TX.gravel('#5A3E2A'), { repeat: [1, 1], rough: 1 }), 0, 0.1); bed.scale.z = 0.7; for (let i = 0; i < 14; i++) { const a = R() * 7, r = R() * 0.55; m(new THREE.SphereGeometry(0.07, 6, 5), paint(['#F2D14A', '#E8453C', '#F4F0F2', '#B35CE0'][i % 4], 0.6), Math.cos(a) * r, 0.28, Math.sin(a) * r * 0.7); } break; }
      case 'rock': m(lumpy(0.35 + R() * 0.35, 1, 0.3, seed), stone, 0, 0.2).scale.set(1.3, 0.7, 1); break;
      case 'lamp': { m(new THREE.CylinderGeometry(0.04, 0.06, 2.0, 8), paint('#2A2E33', 0.4, 0.8), 0, 1.0); m(new THREE.SphereGeometry(0.15, 12, 10), glowMat(wid === 'haunted' ? '#FFB84A' : '#FFF1C8', 1.6), 0, 2.08); break; }
      case 'idolHead': { m(new RoundedBoxGeometry(1.3, 1.7, 1.3, 3, 0.15), stone, 0, 0.85); for (const z of [-0.3, 0.3]) m(new THREE.BoxGeometry(0.08, 0.18, 0.24), paint('#1E1A14', 1), z * 0 + 0.66, 1.15, z); m(new THREE.BoxGeometry(0.08, 0.3, 0.6), paint('#1E1A14', 1), 0.66, 0.5, 0); m(lumpy(0.5, 1, 0.3, seed), leaf('#4F8F3A'), 0, 1.75, 0).scale.set(1.4, 0.4, 1.3); break; }
      case 'palm': { if (wid === 'desert') g.scale.setScalar(0.7); const lean = 0.08 + R() * 0.08; for (let i = 0; i < 7; i++) m(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 10), bark, i * lean * 0.9, 0.25 + i * 0.47, 0); const top = new THREE.Group(); top.position.set(7 * lean * 0.9, 3.35, 0); g.add(top);
        for (let k = 0; k < 7; k++) { const lf = new THREE.Mesh(lumpy(0.8, 1, 0.1, seed + k), leaf(k % 2 ? '#3F8F43' : '#4DA052')); lf.scale.set(1.5, 0.08, 0.35); const a = k * Math.PI * 2 / 7; lf.position.set(Math.cos(a) * 0.95, -0.25, Math.sin(a) * 0.95); lf.rotation.y = -a; lf.rotation.z = -0.45; lf.castShadow = true; top.add(lf); }
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), paint('#5A3A1E', 0.7)); c.position.set(Math.cos(k * 2) * 0.15, -0.12, Math.sin(k * 2) * 0.15); top.add(c); } break; }
      case 'barrels': { const wood = TX.surf('barrel', TX.planks('#8B5A2B', 43, true), { repeat: [2, 1], rough: 0.85 }), band = paint('#3A3C40', 0.5, 0.8);
        for (const [x, s] of [[0, 1], [0.85, 0.85]]) { const pts = [[0.33, 0], [0.4, 0.25], [0.42, 0.5], [0.4, 0.75], [0.33, 1]].map(([r, y]) => new THREE.Vector2(r * s, y * s)); m(new THREE.LatheGeometry(pts, 18), wood, x, 0, 0); for (const y of [0.15, 0.85]) m(new THREE.TorusGeometry(0.38 * s, 0.025, 6, 20), band, x, y * s).rotation.x = Math.PI / 2; m(new THREE.CircleGeometry(0.33 * s, 18), wood, x, s - 0.001, 0).rotation.x = -Math.PI / 2; } break; }
      case 'crate': { const w = TX.surf('crate', TX.planks('#A9804E', 47, false), { repeat: [1.5, 1.5], rough: 0.85 }); const s = 0.6 + R() * 0.3; m(new THREE.BoxGeometry(s, s, s), w, 0, s / 2).rotation.y = R(); break; }
      case 'rope': { m(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 10), bark, 0, 0.45); m(new THREE.TorusGeometry(0.12, 0.04, 6, 12), paint('#C9A66B', 1), 0, 0.7).rotation.x = Math.PI / 2; break; }
      case 'crystal': { m(new THREE.OctahedronGeometry(0.5, 0), TX.std('crys1', { color: col('#FF5FD2'), emissive: col('#FF5FD2'), emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2 }), 0, 0.85).scale.y = 1.8; m(new THREE.OctahedronGeometry(0.3, 0), TX.std('crys2', { color: col('#4FF0E0'), emissive: col('#4FF0E0'), emissiveIntensity: 0.7, roughness: 0.1 }), 0.55, 0.5, 0.25).scale.y = 1.6; m(lumpy(0.45, 1, 0.3, seed), TX.surf('moonrock', TX.concrete('#7A7690', 90), { rough: 1 }), 0.1, 0.12, -0.2).scale.set(1.4, 0.5, 1.2); break; }
      case 'antenna': { const metal = paint('#C7CEDB', 0.3, 0.9); m(new THREE.CylinderGeometry(0.1, 0.16, 2.8, 10), metal, 0, 1.4); const dish = m(new THREE.SphereGeometry(0.65, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), paint('#E4E8F0', 0.35, 0.6, { side: THREE.DoubleSide }), 0, 2.2, 0); dish.rotation.x = 2.2; const l = m(new THREE.SphereGeometry(0.12, 10, 8), TX.std('blink', { color: col('#FF5FD2'), emissive: col('#FF5FD2'), emissiveIntensity: 1.5 }), 0, 2.9, 0); this.blinkers.push(l); break; }
      case 'crater': { const rim = m(new THREE.TorusGeometry(0.55, 0.16, 8, 22), TX.surf('moonrock', TX.concrete('#7A7690', 90), { rough: 1 }), 0, 0.02); rim.rotation.x = Math.PI / 2; rim.scale.z = 0.5; break; }
      case 'pipe': { const metal = paint('#8E97AC', 0.35, 0.9); const p = m(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 14), metal, 0, 0.2); p.rotation.z = Math.PI / 2; m(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), paint('#FFB23E', 0.4, 0.4), -0.7, 0.2).rotation.z = Math.PI / 2; break; }
      case 'tomb': { const t = TX.surf('tomb', TX.concrete('#8E8A99', 89), { repeat: [1.5, 1.5], rough: 0.95 }); m(new RoundedBoxGeometry(0.8, 1.1, 0.28, 3, 0.2), t, 0, 0.55).rotation.z = 0.08; m(new RoundedBoxGeometry(0.6, 0.85, 0.25, 3, 0.16), t, 0.85, 0.42, 0.3).rotation.z = -0.14; break; }
      case 'pumpkin': { const p = m(new THREE.SphereGeometry(0.42, 18, 12), paint('#E8761E', 0.55), 0, 0.36); p.scale.set(1.25, 0.82, 1.1); m(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 6), paint('#4E6A2A', 0.8), 0, 0.78); m(new THREE.PlaneGeometry(0.28, 0.14), glowMat('#FFB84A', 1.5), 0, 0.38, 0.47); break; }
      case 'deadtree': { m(new THREE.CylinderGeometry(0.1, 0.2, 2.4, 7), paint('#3A3036', 0.95), 0, 1.2); for (let i = 0; i < 4; i++) { const b = m(new THREE.CylinderGeometry(0.03, 0.07, 1.1, 6), paint('#3A3036', 0.95), 0, 1.5 + i * 0.25, 0); b.rotation.set(R() - 0.5, R() * 6, 0.9 + R() * 0.4); b.position.x += Math.cos(i * 2) * 0.35; b.position.z += Math.sin(i * 2) * 0.35; } break; }
      /* candy kingdom */
      case 'lollipop': { const c = ['#FF5FA8', '#8B5CF6', '#FFB23E', '#3DB7F0'][seed % 4]; m(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), paint('#FFF8F2', 0.4), 0, 0.9);
        const tex = canvasTex(128, 128, (g2, w2, h2) => { g2.fillStyle = '#FFF8F2'; g2.fillRect(0, 0, w2, h2); g2.strokeStyle = c; g2.lineWidth = 14; g2.beginPath(); for (let a = 0; a < 14; a += 0.1) { const r = a * 4.4; g2.lineTo(w2 / 2 + Math.cos(a) * r, h2 / 2 + Math.sin(a) * r); } g2.stroke(); });
        const disc = m(new THREE.CylinderGeometry(0.6, 0.6, 0.16, 32), [paint(c, 0.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 })], 0, 2.2); disc.rotation.x = Math.PI / 2; disc.rotation.z = R() * 0.4; break; }
      case 'cupcake': { const cc = ['#FFB8D6', '#FFF1C8', '#C9A6FF'][seed % 3]; const pts = [[0.42, 0], [0.55, 0.55], [0.6, 0.58]].map(([r, y]) => new THREE.Vector2(r, y)); m(new THREE.LatheGeometry(pts, 20), paint('#E97BA8', 0.6), 0, 0);
        const ic = m(lumpy(0.55, 1, 0.12, seed), paint(cc, 0.35), 0, 0.72); ic.scale.set(1.1, 0.7, 1.1); m(lumpy(0.3, 1, 0.1, seed + 1), paint(cc, 0.35), 0, 1.05); m(new THREE.SphereGeometry(0.13, 12, 10), paint('#D8342B', 0.2), 0, 1.3);
        for (let i = 0; i < 8; i++) { const a = i * 0.8; m(new THREE.BoxGeometry(0.1, 0.03, 0.03), paint(['#3DB7F0', '#FFC93C', '#8BD94A'][i % 3], 0.5), Math.cos(a) * 0.42, 0.9, Math.sin(a) * 0.42).rotation.y = a; } break; }
      case 'candycane': { const mat = new THREE.MeshStandardMaterial({ map: stripeTex('#E8453C', '#FFF8F2', 14), roughness: 0.3 }); m(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 14), mat, 0, 1.0);
        const hook = m(new THREE.TorusGeometry(0.32, 0.12, 12, 20, Math.PI), mat, 0.32, 2.0); hook.rotation.z = 0; break; }
      case 'gumdrop': { for (let i = 0; i < 3; i++) { const c = ['#FF5FA8', '#8BD94A', '#FFB23E', '#8B5CF6', '#3DB7F0'][(seed + i) % 5]; const d = m(new THREE.SphereGeometry(0.34 - i * 0.05, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), TX.std('gum' + c, { color: col(c), roughness: 0.35, transparent: true, opacity: 0.92 }), (i - 1) * 0.6, 0, (i % 2) * 0.4); d.scale.y = 1.3; } break; }
      /* ice palace */
      case 'snowpine': { m(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 8), bark, 0, 0.3); for (let i = 0; i < 3; i++) { m(new THREE.ConeGeometry(0.9 - i * 0.22, 0.9, 10), paint('#2F5E46', 0.9), 0, 0.85 + i * 0.55); m(new THREE.ConeGeometry(0.78 - i * 0.22, 0.35, 10), paint('#FFFFFF', 0.85), 0, 1.15 + i * 0.55); } break; }
      case 'snowman': { const sn = paint('#FFFFFF', 0.85); m(new THREE.SphereGeometry(0.5, 18, 12), sn, 0, 0.45); m(new THREE.SphereGeometry(0.36, 18, 12), sn, 0, 1.1); m(new THREE.SphereGeometry(0.26, 16, 12), sn, 0, 1.6);
        m(new THREE.ConeGeometry(0.05, 0.25, 8), paint('#FF8A2A', 0.5), 0.3, 1.6).rotation.z = -Math.PI / 2; for (const z of [-0.09, 0.09]) m(new THREE.SphereGeometry(0.035, 8, 6), paint('#1C1C1E', 0.5), 0.23, 1.68, z);
        m(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 14), paint('#1C1C1E', 0.5), 0, 1.95); m(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), paint('#1C1C1E', 0.5), 0, 1.8);
        m(new THREE.TorusGeometry(0.28, 0.06, 8, 18), paint('#E8453C', 0.8), 0, 1.38).rotation.x = Math.PI / 2; break; }
      case 'iceblock': { const ice = TX.std('iceblock', { color: col('#BFE6FA'), roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.8, envMapIntensity: 1.8 }); const n = 2 + (seed % 2); for (let i = 0; i < n; i++) { const sz = 0.55 + R() * 0.3; const b = m(new RoundedBoxGeometry(sz, sz, sz, 2, 0.06), ice, (i - n / 2) * 0.55, sz / 2 + (i === 2 ? 0.6 : 0), (R() - 0.5) * 0.4); b.rotation.y = R(); } break; }
      /* robot factory */
      case 'drum': { const c = ['#2F6FB0', '#D8342B', '#FFC93C'][seed % 3]; const n = 1 + (seed % 2); for (let i = 0; i < n; i++) { m(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 20), paint(c, 0.45, 0.6), i * 0.72, 0.48, 0); for (const y of [0.2, 0.76]) m(new THREE.TorusGeometry(0.345, 0.025, 6, 20), paint('#2A2C30', 0.4, 0.8), i * 0.72, y).rotation.x = Math.PI / 2; } break; }
      case 'gear': { const metal = paint('#9AA0A8', 0.3, 0.9), gg = new THREE.Group(); gg.position.y = 0.95; gg.rotation.x = Math.PI / 2; gg.rotation.z = R(); g.add(gg);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 24), metal); hub.castShadow = true; gg.add(hub); for (let i = 0; i < 10; i++) { const tth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.26), metal); const a = i / 10 * Math.PI * 2; tth.position.set(Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66); tth.rotation.y = -a; tth.castShadow = true; gg.add(tth); }
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12), paint('#2A2C30', 0.5, 0.6)); gg.add(hole);
        m(new THREE.BoxGeometry(0.3, 0.3, 0.5), paint('#3A3D44', 0.4, 0.8), 0, 0.15); this.gears = this.gears || []; this.gears.push(gg); break; }
      case 'robot': { const shell = paint(['#C7CEDB', '#FFC93C', '#3DB7F0'][seed % 3], 0.35, 0.7), dark = paint('#2A2C30', 0.4, 0.8);
        for (const z of [-0.18, 0.18]) m(new THREE.BoxGeometry(0.18, 0.55, 0.18), dark, 0, 0.28, z);
        m(new RoundedBoxGeometry(0.55, 0.6, 0.7, 2, 0.08), shell, 0, 0.85); m(new RoundedBoxGeometry(0.45, 0.4, 0.45, 2, 0.08), shell, 0, 1.4);
        for (const z of [-0.1, 0.1]) m(new THREE.SphereGeometry(0.06, 10, 8), glowMat('#4FF0E0', 1.5), 0.23, 1.44, z);
        m(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), dark, 0, 1.75); const l = m(new THREE.SphereGeometry(0.06, 10, 8), TX.std('blink', { color: col('#FF5FD2'), emissive: col('#FF5FD2'), emissiveIntensity: 1.5 }), 0, 1.92); this.blinkers.push(l);
        for (const z of [-0.45, 0.45]) m(new THREE.BoxGeometry(0.14, 0.5, 0.14), dark, 0.05, 0.85, z).rotation.x = z > 0 ? -0.3 : 0.3; break; }
      /* pyramid desert */
      case 'cactus': { const cg = paint('#4E8F43', 0.75); m(new THREE.CapsuleGeometry(0.22, 1.5, 6, 12), cg, 0, 0.95);
        for (const s2 of [-1, 1]) { const y = 0.9 + (s2 > 0 ? 0.3 : 0); m(new THREE.CapsuleGeometry(0.13, 0.35, 4, 10), cg, s2 * 0.33, y, 0).rotation.z = Math.PI / 2; m(new THREE.CapsuleGeometry(0.13, 0.45, 4, 10), cg, s2 * 0.5, y + 0.3, 0); }
        if (seed % 2) m(new THREE.SphereGeometry(0.1, 10, 8), paint('#FF5FA8', 0.5), 0, 1.95); break; }
      case 'urn': { const pts = [[0.2, 0], [0.34, 0.15], [0.4, 0.4], [0.32, 0.7], [0.18, 0.82], [0.24, 0.92]].map(([r, y]) => new THREE.Vector2(r, y)); m(new THREE.LatheGeometry(pts, 20), paint('#B8653A', 0.8), 0, 0); m(new THREE.TorusGeometry(0.37, 0.03, 6, 20), paint('#2F6FB0', 0.6), 0, 0.45).rotation.x = Math.PI / 2; break; }
      case 'obelisk': { const sst = TX.surf('sandcol', TX.concrete('#D9BD83', 76), { repeat: [1.2, 1.2], rough: 0.95 }); m(new THREE.BoxGeometry(0.9, 0.3, 0.9), sst, 0, 0.15); const o = m(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 4), sst, 0, 1.6); o.rotation.y = Math.PI / 4; const tp = m(new THREE.ConeGeometry(0.24, 0.35, 4), paint('#E9C24A', 0.3, 0.8), 0, 3.07); tp.rotation.y = Math.PI / 4; break; }
      case 'fence': { const iron = paint('#1E1C22', 0.5, 0.8); for (let i = 0; i < 5; i++) { m(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), iron, (i - 2) * 0.22, 0.5); m(new THREE.ConeGeometry(0.05, 0.12, 6), iron, (i - 2) * 0.22, 1.05); } m(new THREE.BoxGeometry(1.0, 0.04, 0.04), iron, 0, 0.8); m(new THREE.BoxGeometry(1.0, 0.04, 0.04), iron, 0, 0.25); break; }
    }
  }

  /* extra landscaping round the course so it sits in a place, not on a plinth */
  scenery(W, isl, decos, wid) {
    const R = seeded(Math.round(W.cup[0] * 31 + W.cup[1] * 17 + W.tee[0] * 7));
    const kinds = { jungle: ['tree', 'bush', 'flowers', 'rock', 'bush', 'tree', 'lamp'], pirate: ['palm', 'rock', 'barrels', 'crate', 'rope', 'palm'], space: ['crate', 'pipe', 'lamp', 'antenna', 'crate', 'crystal'], haunted: ['deadtree', 'tomb', 'fence', 'pumpkin', 'lamp', 'deadtree'], candy: ['lollipop', 'gumdrop', 'cupcake', 'candycane', 'gumdrop', 'lollipop'], ice: ['snowpine', 'snowpine', 'iceblock', 'snowman', 'rock', 'snowpine'], factory: ['crate', 'drum', 'gear', 'pipe', 'lamp', 'robot', 'drum'], desert: ['cactus', 'palm', 'rock', 'urn', 'cactus', 'obelisk'] }[wid] || ['rock'];
    const bb = bounds(isl), placed = decos.map(d => [d.x, d.z]);
    const blocked = (x, z) => isl.some(p => pointInPoly(x, z, offset(p, RAIL_W + 1.0))) || placed.some(q => Math.hypot(q[0] - x, q[1] - z) < 1.6);
    const onLand = (x, z) => !this.beaches || this.beaches.some(p => pointInPoly(x, z, offset(p, -0.5)));
    let tries = 0, n = 0;
    while (n < 26 && tries++ < 400) {
      const x = bb.x0 - 5 + R() * (bb.w + 10), z = bb.z0 - 3.5 + R() * (bb.d + 7);
      if (blocked(x, z) || !onLand(x, z)) continue;
      const g = new THREE.Group(); g.position.set(x, GROUND, z); g.rotation.y = R() * 6.28; this.root.add(g);
      this.prop(g, kinds[n % kinds.length], wid, n * 7 + 3);
      placed.push([x, z]); n++;
    }
  }

  /* ---------- camera ---------- */
  /* fit the hole into the free area of the stage (below the HUD pill) for azimuth az, elevation el */
  fitView(az, el) {
    const pts = []; for (const p of (this.plinths || this.world.islands)) for (const q of p) pts.push(q);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const place = (tx, tz) => { const d = 50; cam.position.set(tx + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, tz + Math.cos(az) * Math.cos(el) * d); cam.lookAt(tx, 0, tz); cam.updateMatrixWorld(); };
    const c = this.bb; place(c.cx, c.cz);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const v = new THREE.Vector3();
    for (const [x, z] of pts) for (const y of [-0.45, 1.4]) { v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const topPad = 96, botPad = 26, sidePad = 30, availW = STAGE_W - sidePad * 2, availH = STAGE_H - topPad - botPad;
    const upp = Math.max((x1 - x0) / availW, (y1 - y0) / availH);     // world units per px
    // centre of the free area in camera space
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + (topPad - botPad) / 2 * upp;
    // convert camera-space offset back to a ground target
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const tgt = new THREE.Vector3(c.cx, 0, c.cz).addScaledVector(right, cx).addScaledVector(up, cy);
    // project onto ground along the view direction
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir); const k = -tgt.y / dir.y; tgt.addScaledVector(dir, k);
    return { tx: tgt.x, tz: tgt.z, az, el, upp };
  }
  /* 'ortho' (flat, the original look) or 'persp' (real depth); both frame the same area */
  setProjection(p) { this.projection = p === 'persp' ? 'persp' : 'ortho'; this.cam = this.projection === 'persp' ? this.persp : this.ortho; this.applyView(); }
  applyView() {
    const v = this.view, hw = STAGE_W / 2 * v.upp, hh = STAGE_H / 2 * v.upp;
    const place = (cam, d) => { cam.position.set(v.tx + Math.sin(v.az) * Math.cos(v.el) * d, Math.sin(v.el) * d, v.tz + Math.cos(v.az) * Math.cos(v.el) * d); cam.lookAt(v.tx, 0, v.tz); };
    if (this.projection === 'persp') {
      const cam = this.persp, d = hh * 1.08 / Math.tan(cam.fov * Math.PI / 360);   // same visible height at the target
      place(cam, d); cam.near = Math.max(0.5, d * 0.2); cam.far = d * 4 + 100; cam.aspect = STAGE_W / STAGE_H; cam.updateProjectionMatrix();
    } else {
      const cam = this.ortho; place(cam, 60);
      cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.near = 1; cam.far = 200; cam.updateProjectionMatrix();
    }
  }
  setMode(mode) { this.view.mode = mode; }
  flyIn() { this.fly = { t: 0, dur: 2.6 }; }

  updateCamera(dt, sim) {
    const v = this.view, f = this.fit;
    let goal;
    if (v.mode === 'behind' && sim) {
      const b = sim.b, c = this.world.cup, a = Math.atan2(c[0] - b.x, c[1] - b.z);   // azimuth so camera sits behind the ball
      const az = a + Math.PI;
      const fx = Math.sin(a), fz = Math.cos(a);
      goal = { tx: b.x + fx * 2.6, tz: b.z + fz * 2.6, az, el: 0.72, upp: f.upp / 1.75 };
    } else if (v.mode === 'menu') {
      goal = { ...f, az: Math.sin(this.clock * 0.25) * 0.12, upp: f.upp * 0.96 };
    } else goal = { ...f };
    const k = 1 - Math.exp(-dt * (v.mode === 'behind' ? this.camSmooth : 4));
    let daz = goal.az - v.az; while (daz > Math.PI) daz -= Math.PI * 2; while (daz < -Math.PI) daz += Math.PI * 2;
    v.tx += (goal.tx - v.tx) * k; v.tz += (goal.tz - v.tz) * k; v.az += daz * k; v.el += (goal.el - v.el) * k; v.upp += (goal.upp - v.upp) * k;
    if (this.fly) {
      this.fly.t += dt; const u = Math.min(1, this.fly.t / this.fly.dur), e = 1 - Math.pow(1 - u, 3);
      const tee = this.world.tee;
      const s = { tx: tee[0] + 3, tz: tee[1] - 1, az: -0.35, el: 0.62, upp: f.upp / 1.9 };
      v.tx = s.tx + (goal.tx - s.tx) * e; v.tz = s.tz + (goal.tz - s.tz) * e; v.az = s.az + (goal.az - s.az) * e; v.el = s.el + (goal.el - s.el) * e; v.upp = s.upp + (goal.upp - s.upp) * e;
      if (u >= 1) this.fly = null;
    }
    this.applyView();
  }

  /* stage px → point on the ball plane */
  ground(px, py) {
    const ndc = new THREE.Vector2(px / STAGE_W * 2 - 1, -(py / STAGE_H * 2 - 1));
    this.ray.setFromCamera(ndc, this.cam);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out) ? [out.x, out.z] : null;
  }
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    return [(v.x + 1) / 2 * STAGE_W, (1 - v.y) / 2 * STAGE_H];
  }

  /* ---------- per-frame sync ---------- */
  update(dt, sim, hz, state) {
    this.clock += dt;
    const t = sim ? sim.t : this.clock;
    for (const mm of this.mills || []) mm.sails.rotation.x = -windmillAngle(mm.wm, t, hz);
    for (const gg of this.gears || []) gg.rotation.y += dt * 0.6;
    for (const sp of this.sweepers || []) sp.arms.rotation.y = -sweepAngle(sp.sw, t, hz);
    for (const pp of this.pistons || []) {
      const k = pistonLift(pp.p, t, hz), up = k >= 0.5;
      pp.block.position.y = -pp.H / 2 + k * (pp.H - 0.02) + 0.01 * (1 - k);
      pp.block.visible = k > 0.02;
      if (up !== pp.up) { pp.up = up; for (const l of pp.lamps) { const c = up ? 0xff3b30 : 0x33ff66; l.material.color.setHex(c); l.material.emissive.setHex(c); } }
    }
    for (const bl of this.belts || []) bl.tex.offset.x = -(this.clock * bl.spd / bl.tile) % 1;
    for (const sw of this.swirls || []) sw.rotation.z = this.clock * 0.9;
    if (this.chocNormal) { this.chocNormal.offset.x = this.clock * 0.05; this.chocNormal.offset.y = this.clock * 0.01; }
    for (const p of this.planks || []) { const off = plankOffset(p.gp, t, hz); p.g.position.set(p.gp.x + p.gp.nx * off, 0, p.gp.z + p.gp.nz * off); }
    for (const mv of this.movers || []) {
      const [x, z] = moverPos(mv.m, t, hz);
      if (mv.roll || mv.waddle) {
        const px = mv.g.position.x, pz = mv.g.position.z, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
        mv.g.position.set(x, 0, z);
        if (d > 1e-4 && d < 1) {
          if (mv.roll) { const axis = new THREE.Vector3(dz, 0, -dx).normalize(); mv.spin.rotateOnWorldAxis(axis, d / mv.m.r); }
          else { const want = -Math.atan2(dz, dx); let da = want - mv.body.rotation.y; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; mv.body.rotation.y += da * Math.min(1, dt * 10); }
        }
        if (mv.waddle) { mv.body.rotation.x = Math.sin(this.clock * 9) * 0.12; mv.body.position.y = Math.abs(Math.sin(this.clock * 9)) * 0.03; }
      } else if (mv.ghost) { mv.g.position.set(x, 0.12 + Math.sin(this.clock * 2.4 + x) * 0.14, z); mv.g.rotation.y = Math.sin(this.clock * 0.9) * 0.3; }
      else {
        mv.bob.position.set(x, 0.48, z);
        const a = mv.pivot, b = new THREE.Vector3(x, 0.6, z), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
        mv.stem.position.copy(mid); mv.stem.scale.set(1, len, 1); mv.stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
      }
    }
    for (const bp of this.bumpers || []) { bp.t += dt; const k = bp.t < 0.35 ? Math.sin(bp.t / 0.35 * Math.PI) : 0; bp.g.scale.set(1 + k * 0.18, 1 - k * 0.2, 1 + k * 0.18); bp.lamp.scale.setScalar(1 + k * 0.6); }
    if (this.waterNormal) { this.waterNormal.offset.x = this.clock * 0.02; this.waterNormal.offset.y = this.clock * 0.013; }
    if (this.lavaMap) { this.lavaMap.offset.x = this.clock * 0.03; this.lavaMap.offset.y = Math.sin(this.clock * 0.3) * 0.05; }
    for (const f of this.flows || []) if (f.foam) f.m.material.opacity = 0.4 + Math.sin(this.clock * 1.4) * 0.15;
    for (const c of this.cannons || []) { c.kick += dt; const k = c.kick < 0.4 ? Math.sin(c.kick / 0.4 * Math.PI) : 0; c.barrel.position.x = 0.25 - k * 0.3; }
    for (const p of this.portals || []) { if (p.face) p.g.rotation.y = this.view.az; p.disc.rotation.z += dt * 2; p.tor.material.emissiveIntensity = 0.55 + Math.sin(this.clock * 4) * 0.2; }
    for (const s of this.lavaBits || []) s.position.y = 0.02 + Math.max(0, Math.sin(this.clock * 2 + s.userData.ph)) * 0.12;
    for (const g of this.gravPads || []) if (g.userData.pulse) { const k = 1 + Math.sin(this.clock * 3) * 0.04; g.scale.set(k, 1, k); }
    for (const l of this.blinkers || []) l.material.emissiveIntensity = Math.sin(this.clock * 5) > 0 ? 1.8 : 0.2;
    // flag wave
    if (this.flag) {
      const pos = this.flag.geometry.attributes.position, base = this.flag.userData.base;
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(x * 4 - this.clock * 5) * 0.08 * x); }
      pos.needsUpdate = true;
    }
    // gems
    if (this.gems) this.gems.forEach((g, i) => {
      const taken = sim && sim.gemsTaken[i];
      if (taken && g.visible) { g.visible = false; this.burst(g.position.x, 0.5, g.position.z, '#FF4FA3', 14, 2.6); }
      g.rotation.y += dt * 2; g.position.y = 0.5 + Math.sin(this.clock * 2.6 + i) * 0.1;
    });
    // ball
    if (sim && this.ball) {
      const b = sim.b, B = this.ball, prev = B.position.clone();
      B.visible = !b.hidden && sim.mode !== 'sunk';
      B.position.set(b.x, b.y + (sim.inGrav && sim.mode === 'roll' ? 0.18 + Math.sin(this.clock * 6) * 0.05 : 0), b.z);
      B.scale.setScalar(Math.max(0.01, b.scale));
      const mv = B.position.clone().sub(prev); mv.y = 0; const d = mv.length();
      if (d > 1e-5 && d < 2) { const axis = new THREE.Vector3(mv.z, 0, -mv.x).normalize(); B.rotateOnWorldAxis(axis, d / BALL_R); }
      this.glow.visible = B.visible; this.glow.position.set(b.x, 0.014, b.z);
      this.glow.material.opacity = sim.mode === 'rest' && state && state.showRing ? 0.28 + Math.sin(this.clock * 3) * 0.12 : 0;
    }
    // putter
    if (this.putter && state) {
      const a = state.aim;
      if (a && sim) {
        this.putter.visible = true;
        const ang = Math.atan2(a.dz, a.dx), back = 0.35 + a.power * 1.1;
        this.putter.position.set(sim.b.x - Math.cos(ang) * back, 0, sim.b.z - Math.sin(ang) * back);
        this.putter.rotation.y = -ang + Math.PI / 2;
        this.putterInner.rotation.x = 0;
      } else if (this.swing) {
        this.swing.t += dt; const u = Math.min(1, this.swing.t / 0.25);
        const ang = this.swing.ang, back = this.swing.back * (1 - u) - 0.25 * u;
        this.putter.position.set(this.swing.x - Math.cos(ang) * back, 0, this.swing.z - Math.sin(ang) * back);
        if (this.swing.t > 0.6) { this.swing = null; this.putter.visible = false; }
      } else this.putter.visible = false;
    }
    this.updateFx(dt);
    this.updateCamera(dt, sim);
    this.r.render(this.scene, this.cam);
  }
  swingPutter(sim, aim) { this.swing = { t: 0, ang: Math.atan2(aim.dz, aim.dx), back: 0.35 + aim.power * 1.1, x: sim.lastRest[0], z: sim.lastRest[1] }; }
  hitBumper(h) { const b = (this.bumpers || []).find(x => x.h === h); if (b) b.t = 0; }
  kickCannon() { for (const c of this.cannons || []) c.kick = 0; }

  /* ---------- tiny particle bursts ---------- */
  burst(x, y, z, color, n = 12, speed = 2, grav = 6, size = 0.08) {
    const mat = new THREE.MeshBasicMaterial({ color: col(color), transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(FX_GEO, mat.clone()); m.position.set(x, y, z); m.scale.setScalar(size / 0.08);
      const a = Math.random() * Math.PI * 2, u = 0.3 + Math.random() * 0.7;
      m.userData = { vx: Math.cos(a) * speed * u, vy: speed * (0.6 + Math.random() * 0.8), vz: Math.sin(a) * speed * u, life: 0.7 + Math.random() * 0.4, age: 0, grav };
      this.root.add(m); this.fx.push(m);
    }
  }
  updateFx(dt) {
    this.fx = this.fx.filter(m => {
      const u = m.userData; u.age += dt;
      if (u.age > u.life) { this.root.remove(m); m.material.dispose(); return false; }
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt; u.vy -= u.grav * dt;
      m.material.opacity = 1 - u.age / u.life; return true;
    });
  }

  lowQuality() {
    if (this.low) return; this.low = true;
    this.r.shadowMap.enabled = false;
    this.root.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { mm.needsUpdate = true; }); });
    this.setSize(this.W, this.H, 1);
  }
  render() { this.r.render(this.scene, this.cam); }
  snapshot() { this.r.render(this.scene, this.cam); return this.canvas.toDataURL('image/jpeg', 0.8); }
}
export { zonePoly };
