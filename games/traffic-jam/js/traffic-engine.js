import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { colourRules } from './colour-solver.js';
import { starsFor } from './traffic-levels.js';
const MATCH_COLOURS = ['#ff4d6d', '#3b82f6', '#ffc72c'];
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const BASE = new URL('assets/', document.baseURI).href;
const HERO = 'sedan-sports';
const PLAYER_CARS = ['race', 'race-future'];
const CARS2 = ['taxi', 'police', 'van', 'suv', 'suv-luxury', 'truck-flat', 'delivery-flat'];
const CARS3 = ['truck', 'delivery', 'firetruck', 'ambulance', 'garbage-truck'];
const BUILD_MID = ['building-a', 'building-b', 'building-c', 'building-d', 'building-f', 'building-g', 'building-h'];
const BUILD_TALL = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c'];
const BUILD_LOW = ['low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c', 'low-detail-building-d', 'low-detail-building-wide-a'];
const ROADS = ['road-straight', 'road-crossroad', 'road-end-round', 'tile-low', 'light-square', 'traffic-light', 'construction-barrier', 'construction-cone', 'dumpster'];
const S = 2;
const DISTRICT_X = [20, 40, 60, 80, 100, 120, 140, 160, 180], ROAD_Z = 3;

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ease = k => 1 - Math.pow(1 - k, 3);
const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const pick = (R, a) => a[Math.floor(R() * a.length)];

// ---------- audio ----------
function makeAudio() {
  let ctx = null, muted = false;
  const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function tone(f, d, type = 'sine', v = .1, f2, delay = 0) {
    if (muted) return; const c = ac(), t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 20), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + .02);
  }
  function noise(d, freq, v = .12, q = 1.2) {
    if (muted) return; const c = ac(), t = c.currentTime;
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  const sfx = {
    click: () => tone(620, .07, 'sine', .08, 900),
    pick: () => tone(420, .06, 'triangle', .06, 520),
    slide: () => noise(.16, 900, .14),
    thud: () => { tone(140, .14, 'sine', .16, 60); noise(.08, 300, .1); },
    honk: () => { tone(392, .22, 'square', .035); tone(494, .22, 'square', .03); },
    nope: () => { tone(220, .09, 'square', .04); tone(180, .12, 'square', .04, null, .09); },
    vroom: () => { tone(80, .6, 'sawtooth', .045, 240); noise(.4, 500, .06); },
    rev: () => { tone(70, .9, 'sawtooth', .05, 300); tone(140, .9, 'square', .015, 420); },
    gate: () => { tone(900, .06, 'sine', .05); tone(1200, .06, 'sine', .05, null, .07); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .28, 'triangle', .09, null, i * .11)),
    star: (i = 0) => tone(880 + i * 220, .18, 'triangle', .08, 1760 + i * 220),
    undo: () => tone(700, .08, 'sine', .07, 450),
    hint: () => { tone(988, .1, 'sine', .06); tone(1319, .16, 'sine', .06, null, .08); },
    whoosh: () => noise(.35, 600, .09, .6),
  };
  return { sfx, setMuted: m => { muted = m; }, unlock: ac };
}

// ---------- rush hour solver ----------
function solveRush(cars, pos, W, H) {
  const n = cars.length, key = p => p.join(','), hero = cars[0];
  const occ = p => { const g = new Int8Array(W * H).fill(-1); for (let i = 0; i < n; i++) { const c = cars[i]; for (let k = 0; k < c.len; k++) { const r = c.axis === 'h' ? c.r : p[i] + k, cc = c.axis === 'h' ? p[i] + k : c.c; g[r * W + cc] = i; } } return g; };
  const seen = new Map([[key(pos), null]]); let q = [pos];
  while (q.length) {
    const nq = [];
    for (const p of q) {
      if (p[0] + hero.len === W) { let k = key(p), first = null; while (seen.get(k)) { const e = seen.get(k); first = e.m; k = e.prev; } return first; }
      const g = occ(p);
      for (let i = 0; i < n; i++) {
        const c = cars[i], lim = c.axis === 'h' ? W : H;
        for (const d of [-1, 1]) {
          let np = p[i];
          while (true) {
            const t = np + d, cell = d < 0 ? t : t + c.len - 1; if (cell < 0 || cell >= lim) break;
            const idx = c.axis === 'h' ? c.r * W + cell : cell * W + c.c; if (g[idx] !== -1) break; np = t;
            const s = p.slice(); s[i] = np; const ks = key(s);
            if (!seen.has(ks)) { seen.set(ks, { prev: key(p), m: [i, np] }); nq.push(s); }
          }
        }
      }
    }
    q = nq; if (seen.size > 400000) return null;
  }
  return null;
}

// ---------- canvas textures ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const haloCache = {};
function haloFor(len) { // one texture per car length so corners stay identical (1x2, 1x3)
  if (haloCache[len]) return haloCache[len];
  const u = 128;
  return haloCache[len] = canvasTex(u, u * len, (c, w, h) => {
    c.lineWidth = 12; c.strokeStyle = '#fff'; rr(c, 10, 10, w - 20, h - 20, 24); c.stroke();
    c.globalAlpha = .28; c.fillStyle = '#fff'; rr(c, 10, 10, w - 20, h - 20, 24); c.fill();
  });
}
const haloTex = canvasTex(128, 128, (c, w, h) => {
  c.lineWidth = 14; c.strokeStyle = '#fff'; rr(c, 12, 12, w - 24, h - 24, 26); c.stroke();
  c.globalAlpha = .28; c.fillStyle = '#fff'; rr(c, 12, 12, w - 24, h - 24, 26); c.fill();
});
function arrowDraw(fill, stroke) {
  return (c, w, h) => { c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = 10; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w - 10, 110); c.lineTo(w * .68, 110); c.lineTo(w * .68, h - 12); c.lineTo(w * .32, h - 12); c.lineTo(w * .32, 110); c.lineTo(10, 110); c.closePath(); c.fill(); c.stroke(); };
}
const arrowTex = canvasTex(128, 256, arrowDraw('#ffd23f', '#3b2f00'));
const stickerTex = canvasTex(128, 256, arrowDraw('#ffffff', '#1f6fd1'));
const chevronTex = canvasTex(256, 128, (c) => {
  c.strokeStyle = '#ffd23f'; c.lineWidth = 16; c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < 3; i++) { const x = 40 + i * 70; c.beginPath(); c.moveTo(x, 24); c.lineTo(x + 40, 64); c.lineTo(x, 104); c.stroke(); }
});
const chevronWhiteTex = canvasTex(256, 128, (c) => {
  c.strokeStyle = '#ffffff'; c.lineWidth = 16; c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < 3; i++) { const x = 40 + i * 70; c.beginPath(); c.moveTo(x, 24); c.lineTo(x + 40, 64); c.lineTo(x, 104); c.stroke(); }
});
const triTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#ffffff'; c.strokeStyle = '#2a2740'; c.lineWidth = 7; c.lineJoin = 'round'; c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w - 8, h - 12); c.lineTo(8, h - 12); c.closePath(); c.stroke(); c.fill(); });
const glowTex = canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.35, 'rgba(255,215,140,.55)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
const beamTex = canvasTex(128, 256, (c, w, h) => { const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,244,200,.9)'); g.addColorStop(1, 'rgba(255,244,200,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(w * .3, h); c.lineTo(w * .7, h); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill(); });
const stripeTex = canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8323c'; c.fillRect(i * w / 8, 0, w / 8, h); } });

const LIGHTS = {
  day: { sky: '#bfe0ef', fog: [34, 75], hemi: ['#ffffff', '#9a93b8', 2.1], sun: ['#fff4e0', 2.6, [-7, 18, 9]], ground: '#a6cf86' },
  golden: { sky: '#f8dcbc', fog: [32, 72], hemi: ['#fff3e2', '#a18cb0', 1.9], sun: ['#ffbe7d', 2.9, [-15, 10, 6]], ground: '#b9cc82' },
  night: { sky: '#161a36', fog: [26, 60], hemi: ['#7d8cd6', '#1a1730', .8], sun: ['#a9b8ff', .6, [-6, 18, 8]], ground: '#2f4636' },
};
const VARIANT_LIGHT = { carpark: 'day', night: 'night', box: 'golden', oneway: 'golden', roadworks: 'golden', colour: 'day', onegate: 'day' };

export async function createEngine(host, cb = {}) {
  const audio = makeAudio();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 220);
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };

  function makeScene(preset) {
    const sc = new THREE.Scene(); const L = LIGHTS[preset];
    sc.background = new THREE.Color(L.sky); sc.fog = new THREE.Fog(L.sky, L.fog[0], L.fog[1]);
    const hemi = new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]);
    const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]); sun.position.set(...L.sun[2]);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: L.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
    sc.add(hemi, sun, sun.target, ground);
    return { sc, hemi, sun, ground };
  }
  const G = makeScene('day'), M = makeScene('day');
  let active = M;
  function setLighting(S0, preset) {
    const L = LIGHTS[preset];
    S0.sc.background.set(L.sky); S0.sc.fog.color.set(L.sky); S0.sc.fog.near = L.fog[0]; S0.sc.fog.far = L.fog[1];
    S0.hemi.color.set(L.hemi[0]); S0.hemi.groundColor.set(L.hemi[1]); S0.hemi.intensity = L.hemi[2];
    S0.sun.color.set(L.sun[0]); S0.sun.intensity = L.sun[1]; S0.sun.position.set(...L.sun[2]); S0.ground.material.color.set(L.ground);
  }

  // ---------- load ----------
  const loader = new GLTFLoader(); const lib = {};
  const list = [HERO, ...PLAYER_CARS, ...CARS2, ...CARS3].map(n => ['cars', n])
    .concat(ROADS.map(n => ['roads', n]))
    .concat([...BUILD_MID, ...BUILD_TALL, ...BUILD_LOW, 'detail-parasol-a'].map(n => ['city', n]));
  let loaded = 0;
  await Promise.all(list.map(([dir, name]) => new Promise(res => {
    const done = () => { loaded++; cb.onProgress && cb.onProgress(loaded / list.length); res(); };
    loader.load(`${BASE}${dir}/${name}.glb`, g => {
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material.map) o.material.map.anisotropy = 4; } });
      lib[name] = g.scene; done();
    }, undefined, done);
  })));
  const clone = n => lib[n] ? lib[n].clone() : new THREE.Group();
  const noShadow = o => { o.traverse(m => { if (m.isMesh) m.castShadow = false; }); return o; };

  // ---------- shared helpers ----------
  let tasks = [];
  const task = fn => { tasks.push(fn); return fn; };
  const tween = (dur, fn, done) => { let t = 0; return task(dt => { t += dt; const k = Math.min(1, t / dur); fn(k); if (k >= 1) { done && done(); return true; } return false; }); };
  const yawOf = d => Math.atan2(d.x, d.z);
  const yawDiff = (a, b) => Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  function fitModel(name, len, width = .6) {
    const body = clone(name); const size = new THREE.Box3().setFromObject(lib[name] || body).getSize(new THREE.Vector3());
    const sx = width / Math.max(size.x, .01) * 1.0, sz = Math.min((len - .2) / size.z, sx * 1.32);
    body.scale.set(sx, sx, sz); return body;
  }
  function placer(parent) {
    return (name, x, z, rot = 0, s = S, shadows = true) => { const o = clone(name); o.scale.setScalar(s); o.position.set(x, 0, z); o.rotation.y = rot; if (!shadows) noShadow(o); parent.add(o); return o; };
  }
  const faceRoad = (dx, dz) => Math.abs(dz) <= Math.abs(dx) && dz !== 0 ? (dz < 0 ? 0 : Math.PI) : (dx < 0 ? Math.PI / 2 : -Math.PI / 2);

  // ---------- view / insets ----------
  function applyView() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const sx = (insets.left - insets.right) / 2, sy = (insets.top - insets.bottom) / 2;
    const Fw = w + 2 * Math.abs(sx), Fh = h + 2 * Math.abs(sy);
    camera.aspect = Fw / Fh; camera.fov = w / h < .75 ? 46 : 36;
    camera.setViewOffset(Fw, Fh, sx > 0 ? 0 : 2 * Math.abs(sx), sy > 0 ? 0 : 2 * Math.abs(sy), w, h);
    camera.updateProjectionMatrix();
  }
  function placeCam(tgt, D, elev, az = 0) {
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(elev) * D, tgt.y + Math.sin(elev) * D, tgt.z + Math.cos(az) * Math.cos(elev) * D);
    camera.lookAt(tgt); camera.updateMatrixWorld();
  }

  // ======================================================================
  // GAME
  // ======================================================================
  let world = null, level = null, cars = [], blocks = [], W = 6, H = 6, LX = 3, LZ = 3;
  let mode = 'menu', inputOn = false, moves = 0, bumps = 0, undoStack = [], won = false, levelIdx = 0, oneWay = false;
  let hintObjs = [], confetti = [], gate = null, glows = [], CM = null;
  const camTarget = new THREE.Vector3(); let playFit = null;
  const cx = c => c - W / 2 + .5, cz = r => r - H / 2 + .5;
  const carCenter = (car, pos = car.pos) => car.axis === 'h' ? new THREE.Vector3(cx(pos) + (car.len - 1) / 2, 0, cz(car.r)) : new THREE.Vector3(cx(car.c), 0, cz(pos) + (car.len - 1) / 2);
  const axisVec = car => car.axis === 'h' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);

  function makeCar(modelName, len, variant, tint) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const body = fitModel(modelName, len); inner.add(body);
    const top = new THREE.Box3().setFromObject(body).max.y;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, len), new THREE.MeshBasicMaterial({ map: haloFor(len), transparent: true, depthWrite: false, opacity: 0 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = .045; halo.renderOrder = 2; g.add(halo);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, len), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); hit.position.y = .55; g.add(hit);
    let arrows = null;
    if (tint) {
      // control pad on the FRONT cell: colour dot + forward / back / left / right arrows
      const pad = new THREE.Group(); pad.position.set(0, top + .035, len / 2 - .5); inner.add(pad);
      const flat = (m, x, z, yaw = 0) => { m.rotation.order = 'YXZ'; m.rotation.y = yaw; m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); m.renderOrder = 6; m.material.depthTest = false; pad.add(m); return m; };
      flat(new THREE.Mesh(new THREE.CircleGeometry(.1, 28), new THREE.MeshBasicMaterial({ color: '#2a2740', transparent: true })), 0, 0);
      flat(new THREE.Mesh(new THREE.CircleGeometry(.074, 28), new THREE.MeshBasicMaterial({ color: tint, transparent: true })), 0, 0).position.y = .002;
      const mk = (x, z) => flat(new THREE.Mesh(new THREE.PlaneGeometry(.19, .19), new THREE.MeshBasicMaterial({ map: triTex, color: tint, transparent: true, depthWrite: false })), x * .235, z * .235, Math.atan2(-x, -z));
      arrows = { fwd: mk(0, 1), rev: mk(0, -1), left: mk(1, 0), right: mk(-1, 0) };
    }
    if (variant === 'night') {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 }));
      beam.rotation.order = 'YXZ'; beam.rotation.y = Math.PI; beam.rotation.x = -Math.PI / 2; beam.position.set(0, .05, len / 2 + .8); beam.renderOrder = 1; g.add(beam);
    }
    return { group: g, inner, halo, hit, arrows };
  }

  function lotTexture(Lw, Lh, lv) {
    const px = 96;
    return canvasTex(Lw * px, Lh * px, (c, w, h) => {
      const ox = (Lw - W) / 2 * px, oy = (Lh - H) / 2 * px;
      if (lv.type === 'colour') {
        c.fillStyle = '#b9c3d8'; c.fillRect(0, 0, w, h);
        for (let r = 0; r < H; r++) for (let q = 0; q < W; q++) { c.fillStyle = (r + q) % 2 ? '#dfe5f1' : '#e8edf6'; rr(c, ox + q * px + 3, oy + r * px + 3, px - 6, px - 6, 14); c.fill(); c.fillStyle = 'rgba(90,100,140,.18)'; c.beginPath(); c.arc(ox + q * px + px / 2, oy + r * px + px / 2, 5, 0, Math.PI * 2); c.fill(); }
        (lv.gates || []).forEach(([side, idx, col]) => {
          const hex = MATCH_COLOURS[col]; c.fillStyle = hex; c.globalAlpha = .55;
          let x = ox, y = oy; if (side === 0) x += idx * px; if (side === 2) { x += idx * px; y += (H - 1) * px; } if (side === 1) { x += (W - 1) * px; y += idx * px; } if (side === 3) y += idx * px;
          const g = side === 0 ? c.createLinearGradient(0, y, 0, y + px) : side === 2 ? c.createLinearGradient(0, y + px, 0, y) : side === 1 ? c.createLinearGradient(x + px, 0, x, 0) : c.createLinearGradient(x, 0, x + px, 0);
          g.addColorStop(0, hex); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x + 3, y + 3, px - 6, px - 6); c.globalAlpha = 1;
        });
      } else if (lv.type === 'rush') {
        c.fillStyle = lv.variant === 'night' ? '#46455a' : '#5b5a70'; c.fillRect(0, 0, w, h);
        for (let r = 0; r < H; r++) for (let q = 0; q < W; q++) { c.fillStyle = (r + q) % 2 ? '#63627a' : '#666580'; rr(c, ox + q * px + 4, oy + r * px + 4, px - 8, px - 8, 10); c.fill(); }
        c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 3; c.setLineDash([12, 10]);
        for (let q = 1; q < W; q++) { c.beginPath(); c.moveTo(ox + q * px, oy + 8); c.lineTo(ox + q * px, oy + H * px - 8); c.stroke(); }
        for (let r = 1; r < H; r++) { c.beginPath(); c.moveTo(ox + 8, oy + r * px); c.lineTo(ox + W * px - 8, oy + r * px); c.stroke(); }
        c.setLineDash([]);
        const y = oy + lv.exitRow * px, grd = c.createLinearGradient(ox + (W - 2) * px, 0, ox + W * px, 0);
        grd.addColorStop(0, 'rgba(255,77,109,0)'); grd.addColorStop(1, 'rgba(255,77,109,.5)'); c.fillStyle = grd; c.fillRect(ox + (W - 2) * px, y + 6, 2 * px, px - 12);
      } else {
        c.fillStyle = '#5e5d73'; c.fillRect(0, 0, w, h);
        const col = { box: '#ffd23f', oneway: '#ffffff', roadworks: '#ff8a3d' }[lv.variant] || '#ffd23f';
        c.save(); c.beginPath(); c.rect(ox, oy, W * px, H * px); c.clip();
        c.strokeStyle = col; c.globalAlpha = lv.variant === 'oneway' ? .35 : .7; c.lineWidth = 6;
        const step = px * .75;
        for (let k = -H * px; k < W * px + H * px; k += step) { c.beginPath(); c.moveTo(ox + k, oy); c.lineTo(ox + k + H * px, oy + H * px); c.stroke(); c.beginPath(); c.moveTo(ox + k + H * px, oy); c.lineTo(ox + k, oy + H * px); c.stroke(); }
        c.restore(); c.globalAlpha = 1;
        c.strokeStyle = col; c.lineWidth = 10;
        if (lv.variant === 'roadworks') c.setLineDash([28, 18]);
        c.strokeRect(ox + 5, oy + 5, W * px - 10, H * px - 10); c.setLineDash([]);
      }
    });
  }

  function glow(parent, x, y, z, s = 1.6, color = '#ffd9a0') {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(s, s, 1); sp.position.set(x, y, z); parent.add(sp); glows.push(sp);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(s * .9, 24), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .45 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, .06, z); parent.add(pool);
  }

  function buildWorld(lv, seed) {
    if (world) G.sc.remove(world);
    world = new THREE.Group(); G.sc.add(world); glows = []; gate = null;
    const R = mulberry(seed * 977 + 13), night = lv.variant === 'night';
    setLighting(G, VARIANT_LIGHT[lv.variant] || 'day');
    W = lv.w; H = lv.h;
    const Lw = W % 2 ? W + 1 : W, Lh = H % 2 ? H + 1 : H; LX = Lw / 2; LZ = Lh / 2;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(Lw, Lh), new THREE.MeshStandardMaterial({ map: lotTexture(Lw, Lh, lv), roughness: .95 }));
    lot.rotation.x = -Math.PI / 2; lot.position.y = .03; lot.receiveShadow = true; world.add(lot);
    const curbMat = new THREE.MeshStandardMaterial({ color: '#f1edf8', roughness: .8 });
    const box = (x, z, sx, sz, hgt, mat, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, hgt, sz), mat); m.position.set(x, y0 + hgt / 2, z); m.castShadow = true; m.receiveShadow = true; world.add(m); return m; };
    box(0, -LZ - .04, Lw + .16, .08, .09, curbMat); box(0, LZ + .04, Lw + .16, .08, .09, curbMat); box(-LX - .04, 0, .08, Lh, .09, curbMat); box(LX + .04, 0, .08, Lh, .09, curbMat);
    if (lv.type === 'rush') {
      const wm = new THREE.MeshStandardMaterial({ color: night ? '#d9772f' : '#ff8a3d', roughness: .7 }), wallH = .34, t = .14, bx = W / 2, bz = H / 2;
      box(0, -bz - t / 2, W + 2 * t, t, wallH, wm, .03); box(0, bz + t / 2, W + 2 * t, t, wallH, wm, .03); box(-bx - t / 2, 0, t, H, wallH, wm, .03);
      const gz0 = cz(lv.exitRow) - .5, gz1 = cz(lv.exitRow) + .5;
      if (gz0 + bz > .01) box(bx + t / 2, (-bz + gz0) / 2, t, gz0 + bz, wallH, wm, .03);
      if (bz - gz1 > .01) box(bx + t / 2, (gz1 + bz) / 2, t, bz - gz1, wallH, wm, .03);
      // boom gate
      const post = box(bx + t / 2, gz0 - .02, .2, .2, .62, new THREE.MeshStandardMaterial({ color: '#2a2740' }), .03);
      const pivot = new THREE.Group(); pivot.position.set(bx + t / 2, .55, gz0 - .02); world.add(pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 1.02), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: .6 }));
      arm.geometry.attributes.uv && (() => { })(); arm.position.z = .53; arm.castShadow = true; pivot.add(arm);
      gate = { pivot, open: false, a: 0 };
      const chev = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .8), new THREE.MeshBasicMaterial({ map: chevronTex, transparent: true, depthWrite: false }));
      chev.rotation.x = -Math.PI / 2; chev.position.set(LX + 1, .06, cz(lv.exitRow)); world.add(chev); world.userData.chev = chev;
      if (night) { glow(world, bx + .2, .9, gz0 - .02, 1.2, '#ff7070'); }
    }
    if (lv.type === 'colour') {
      const wm = new THREE.MeshStandardMaterial({ color: '#7d7898', roughness: .7 }), wallH = .3, t = .14, bx = W / 2, bz = H / 2;
      const gset = new Map((lv.gates || []).map(([sd, i, c]) => [sd * 16 + i, c]));
      const seg = (side, i) => { const hor = side % 2 === 0; const x = hor ? cx(i) : (side === 1 ? bx + t / 2 : -bx - t / 2), z = hor ? (side === 0 ? -bz - t / 2 : bz + t / 2) : cz(i); return { x, z, hor }; };
      for (let side = 0; side < 4; side++) { const n = side % 2 ? H : W; for (let i = 0; i < n; i++) {
        const p = seg(side, i), col = gset.get(side * 16 + i);
        if (col === undefined) { box(p.x, p.z, p.hor ? 1.001 + (i === 0 || i === n - 1 ? t : 0) : t, p.hor ? t : 1.001, wallH, wm, .03); continue; }
        const gm = new THREE.MeshStandardMaterial({ color: MATCH_COLOURS[col], roughness: .5, emissive: MATCH_COLOURS[col], emissiveIntensity: .15 });
        const off = .5 - .06;
        [-off, off].forEach(o => box(p.x + (p.hor ? o : 0), p.z + (p.hor ? 0 : o), .14, .14, 1.05, gm, .03));
        box(p.x, p.z, p.hor ? 1.02 : .16, p.hor ? .16 : 1.02, .16, gm, 1.0);
        const d = DIRV[side], pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: chevronWhiteTex, color: MATCH_COLOURS[col], transparent: true, depthWrite: false }));
        pad.rotation.order = 'YXZ'; pad.rotation.y = yawOf(new THREE.Vector3(d[0], 0, d[1])) - Math.PI / 2; pad.rotation.x = -Math.PI / 2; pad.position.set(p.x + d[0] * .75, .06, p.z + d[1] * .75); pad.renderOrder = 2; world.add(pad);
      } }
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => box(a * (bx + t / 2), b * (bz + t / 2), t, t, wallH, wm, .03));
    }
    // city grid around the lot
    const sx = LX + 1, sz = LZ + 1, RX = sx + 2 * 5, RZn = sz + 2 * 6, RZs = sz + 2 * 3;
    const place = placer(world);
    for (let x = -RX; x <= RX; x += 2) for (let z = -RZn; z <= RZs; z += 2) {
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax < sx && az < sz) continue;
      const stX = ax === sx, stZ = az === sz;
      if (stX && stZ) { place('road-crossroad', x, z, 0, S, false); continue; }
      if (stX) { place('road-straight', x, z, Math.PI / 2, S, false); continue; }
      if (stZ) { place('road-straight', x, z, 0, S, false); continue; }
      place('tile-low', x, z, 0, S, false);
      const north = z < -sz, south = z > sz, dX = Math.abs(ax - sx) / 2, dZ = Math.abs(az - sz) / 2;
      const face = (dZ <= dX || ax < sx) ? (z < 0 ? 0 : Math.PI) : (x < 0 ? Math.PI / 2 : -Math.PI / 2);
      if (south) {
        const d = (z - sz) / 2;
        if (d === 1) { if (R() < .35) place('detail-parasol-a', x + (R() - .5), z - .3, R() * 6, S * 1.2); else if (R() < .25) place('dumpster', x, z - .4, 0, S * 1.3); }
        else if (d >= 2) place(pick(R, BUILD_LOW), x, z, face, S * 1.3);
        continue;
      }
      const ring = Math.max(dX, dZ);
      if (north && ring >= 3) { place(R() < .55 ? pick(R, BUILD_TALL) : pick(R, BUILD_LOW), x, z, face, S * (R() < .5 ? 1.05 : 1.25)); continue; }
      if (north && ring === 2 && R() < .5) { place(pick(R, BUILD_TALL), x, z, face, S * .95); continue; }
      if (!north && ring >= 3) { place(pick(R, BUILD_LOW), x, z, face, S * 1.3); continue; }
      place(pick(R, BUILD_MID), x, z, face, S * 1.05);
    }
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { place('traffic-light', a * (sx + 1.12), b * (sz + 1.12), Math.atan2(-a, -b), S * 1.1); if (night) glow(world, a * (sx + 1.12), 1.05, b * (sz + 1.12), 1.1, '#9dffb0'); });
    for (let x = -RX + 1; x <= RX; x += 4) if (Math.abs(x) > sx + 1) { place('light-square', x, sz + 1.15, Math.PI / 2, S * 1.05); if (night) glow(world, x, 1.3, sz + .75, 2); }
    if (night) {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { glow(world, a * (LX + .3), 1.6, b * (LZ + .3), 2.4); });
      const pl = new THREE.PointLight('#ffd9a0', 22, 16, 1.4); pl.position.set(0, 5, 0); world.add(pl);
    }
    return { Lw, Lh };
  }

  function addCars(lv, seed) {
    cars = []; blocks = []; CM = null;
    const R = mulberry(seed * 31 + 7);
    if (lv.type === 'colour') { addColourCars(lv, R); return; }
    let k2 = Math.floor(R() * CARS2.length), k3 = Math.floor(R() * CARS3.length);
    lv.cars.forEach((d, i) => {
      const [axis, len, r, c, f] = d;
      const hero = lv.type === 'rush' && i === 0;
      const name = hero ? HERO : len === 3 ? CARS3[(k3++) % CARS3.length] : CARS2[(k2++) % CARS2.length];
      const m = makeCar(name, len, lv.variant);
      const facing = hero ? 1 : (f || (R() < .5 ? -1 : 1));
      const car = { i, axis, len, r, c, pos: axis === 'h' ? c : r, facing, hero, alive: true, ...m };
      car.group.position.copy(carCenter(car));
      car.group.rotation.y = yawOf(axisVec(car).multiplyScalar(facing));
      if (hero) { car.halo.material.color.set('#ff4d6d'); car.halo.material.opacity = .9; }
      else if (lv.type === 'rush' || lv.type === 'grid') { car.baseHalo = { color: '#d9d6e4', opacity: .14 }; car.halo.material.color.set('#d9d6e4'); car.halo.material.opacity = .14; }
      world.add(car.group); cars.push(car);
      car.inner.position.y = 3 + R() * 1.5; car.inner.visible = false;
      const delay = .08 + i * .045; let t = 0;
      task(dt => { t += dt; if (t < delay) return false; car.inner.visible = true; const k = Math.min(1, (t - delay) / .38); car.inner.position.y = (1 - ease(k)) * 3; if (k >= 1) { car.inner.position.y = 0; squash(car); return true; } return false; });
    });
    (lv.blocks || []).forEach(([r, c]) => {
      const o = clone('construction-barrier'); o.scale.setScalar(5.2); o.position.set(cx(c), 0, cz(r)); o.rotation.y = (r + c) % 2 ? Math.PI / 2 : 0; world.add(o);
      const cone = clone('construction-cone'); cone.scale.setScalar(4.5); cone.position.set(cx(c) + .32, 0, cz(r) + .32); world.add(cone);
      blocks.push([r, c]);
    });
    updateGate(true);
  }
  function cmCenter(s) { const [dx, dz] = DIRV[s.d]; return new THREE.Vector3(cx(s.hc) - dx * .5, 0, cz(s.hr) - dz * .5); }
  function cmPose(car, s) { car.group.position.copy(cmCenter(s)); car.group.rotation.y = yawOf(new THREE.Vector3(DIRV[s.d][0], 0, DIRV[s.d][1])); car.axis = s.d % 2 ? 'h' : 'v'; }
  function addColourCars(lv, R) {
    const P = { w: lv.w, h: lv.h, cars: lv.cars.map(([hr, hc, d, colour]) => ({ hr, hc, d, colour })), gates: lv.gates, blocks: lv.blocks || [] };
    CM = { rules: colourRules(P), st: null };
    CM.st = CM.rules.start.slice();
    let k2 = Math.floor(R() * CARS2.length);
    lv.cars.forEach(([hr, hc, d, colour], i) => {
      const tint = MATCH_COLOURS[colour], m = makeCar(CARS2[(k2++) % CARS2.length], 2, lv.variant, tint);
      const car = { i, len: 2, colour, alive: true, baseHalo: { color: tint, opacity: .8 }, ...m };
      car.halo.material.color.set(tint); car.halo.material.opacity = .8;
      cmPose(car, CM.st[i]); world.add(car.group); cars.push(car);
      car.inner.position.y = 3 + R() * 1.5; car.inner.visible = false;
      const delay = .08 + i * .06; let t = 0;
      task(dt => { t += dt; if (t < delay) return false; car.inner.visible = true; const k = Math.min(1, (t - delay) / .38); car.inner.position.y = (1 - ease(k)) * 3; if (k >= 1) { car.inner.position.y = 0; squash(car); return true; } return false; });
    });
    cmRefreshArrows();
    (lv.blocks || []).forEach(([r, c]) => { const cone = clone('construction-cone'); cone.scale.setScalar(6); cone.position.set(cx(c), 0, cz(r)); world.add(cone); const o = clone('construction-cone'); o.scale.setScalar(4); o.position.set(cx(c) + .3, 0, cz(r) - .28); world.add(o); blocks.push([r, c]); });
  }
  function cmRefreshArrows() {
    if (!CM) return; const g = CM.rules.occ(CM.st);
    cars.forEach(car => {
      if (!car.arrows || !car.alive) return;
      const ms = CM.rules.carMoves(CM.st, car.i, g), has = t => ms.find(m => m.type === t);
      for (const [k, a] of Object.entries(car.arrows)) {
        const ex = has(k === 'fwd' ? 'exit' : 'exit-' + k), ok = ex || has(k);
        a.visible = !!ok; a.material.color.set(MATCH_COLOURS[car.colour]);
        a.scale.setScalar(ex ? 1.3 : 1); a.userData.exit = !!ex;
      }
    });
  }
  function relDirVec(s, type) {
    const t = type.replace('exit-', ''), d = t === 'left' ? (s.d + 3) % 4 : t === 'right' ? (s.d + 1) % 4 : s.d;
    const v = new THREE.Vector3(DIRV[d][0], 0, DIRV[d][1]); return t === 'rev' ? v.negate() : v;
  }
  function cmApply(car, m, fromUndo) {
    const s0 = CM.st[car.i]; CM.st = CM.rules.apply(CM.st, m); cmRefreshArrows();
    if (!fromUndo) { undoStack.push({ type: 'cm', car, prev: s0 }); moves++; clearHint(); }
    const s1 = CM.st[car.i];
    if (m.type === 'exit' || m.type.startsWith('exit-')) {
      car.alive = false; emitMoves(); audio.sfx.gate();
      const out = relDirVec(s0, m.type);
      const last = cars.every(c => !c.alive); if (last) setTimeout(() => { if (!won && cars.every(c => !c.alive)) finish(); }, 650);
      const after = () => driveAway(car, out, () => { });
      if (m.type !== 'exit') { const y0 = car.group.rotation.y, y1 = yawOf(out), p0 = car.group.position.clone(), head = new THREE.Vector3(cx(s0.hc), 0, cz(s0.hr)); const p1 = head.clone().addScaledVector(out, .5); let dy = ((y1 - y0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI; car.busy = true; car.task = tween(.22, k => { const e = easeInOut(k); car.group.position.set((1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * head.x + e * e * p1.x, 0, (1 - e) * (1 - e) * p0.z + 2 * (1 - e) * e * head.z + e * e * p1.z); car.group.rotation.y = y0 + dy * e; }, () => { car.busy = false; after(); }); }
      else after();
      if (cars.every(c => !c.alive)) inputOn = false;
      return;
    }
    emitMoves(); car.busy = true;
    const p0 = car.group.position.clone(), p1 = cmCenter(s1), y0 = car.group.rotation.y, y1 = yawOf(new THREE.Vector3(DIRV[s1.d][0], 0, DIRV[s1.d][1]));
    let dy = ((y1 - y0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (m.type === 'left' || m.type === 'right') {
      const ctrl = new THREE.Vector3(cx(s0.hc), 0, cz(s0.hr)); audio.sfx.pick();
      tween(.24, k => { const e = easeInOut(k); car.group.position.set((1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * ctrl.x + e * e * p1.x, 0, (1 - e) * (1 - e) * p0.z + 2 * (1 - e) * e * ctrl.z + e * e * p1.z); car.group.rotation.y = y0 + dy * e; }, () => { cmPose(car, s1); car.busy = false; });
    } else { audio.sfx.slide(); tween(.16, k => car.group.position.lerpVectors(p0, p1, ease(k)), () => { cmPose(car, s1); car.busy = false; squash(car); }); }
  }
  function cmSwipe(car, v) {
    const s = CM.st[car.i]; if (!s || s.out) return;
    const r = el.getBoundingClientRect(), c0 = car.group.position.clone().setY(.35), p0 = c0.clone().project(camera);
    const sv = v.clone().normalize(); let best = -1, bd = .45;
    for (let k = 0; k < 4; k++) { const p1 = c0.clone().add(new THREE.Vector3(DIRV[k][0], 0, DIRV[k][1])).project(camera); const a = new THREE.Vector2((p1.x - p0.x) * r.width / 2, -(p1.y - p0.y) * r.height / 2).normalize(); const d = a.dot(sv); if (d > bd) { bd = d; best = k; } }
    if (best < 0) { wobble(car); return; }
    const rel = (best - s.d + 4) % 4, want = ['fwd', 'right', 'rev', 'left'][rel];
    cmTry(car, want, new THREE.Vector3(DIRV[best][0], 0, DIRV[best][1]));
  }
  function cmTry(car, want, dirV) {
    const ms = CM.rules.carMoves(CM.st, car.i);
    const m = ms.find(x => x.type === want || (want === 'fwd' && x.type === 'exit') || x.type === 'exit-' + want);
    if (m) return cmApply(car, m);
    audio.sfx.nope(); const base = car.group.position.clone(); car.busy = true;
    tween(.22, k => car.group.position.copy(base).addScaledVector(dirV || new THREE.Vector3(), Math.sin(k * Math.PI) * .14), () => { car.group.position.copy(base); car.busy = false; });
  }
  function squash(car) { tween(.22, k => { const s = 1 + Math.sin(k * Math.PI) * .08; car.inner.scale.set(1 + (s - 1) * .5, 1 / s, 1 + (s - 1) * .5); }, () => car.inner.scale.set(1, 1, 1)); }

  function heroClear() { const h = cars[0]; return h && h.hero && h.alive && freeRange(h)[1] === W - h.len; }
  function updateGate(instant) {
    if (!gate) return; const open = heroClear();
    if (open !== gate.open && !instant) audio.sfx.gate();
    gate.open = open; if (instant) { gate.a = open ? -1.4 : 0; gate.pivot.rotation.x = gate.a; }
  }

  // ---------- camera fit ----------
  function fitPlay() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1, m = 18, elev = THREE.MathUtils.degToRad(52);
    const pad = .6, ex = W / 2 + pad, ez = H / 2 + pad, pts = [];
    for (const x of [-ex, ex]) for (const z of [-ez, ez]) for (const y of [0, 1]) pts.push(new THREE.Vector3(x, y, z));
    const x0 = insets.left + m, x1 = w - insets.right - m, y0 = insets.top + m, y1 = h - insets.bottom - m;
    const tgt = new THREE.Vector3(); let D = 20;
    const bbox = () => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of pts) { const v = p.clone().project(camera); const X = (v.x + 1) / 2 * w, Y = (1 - v.y) / 2 * h; a = Math.min(a, X); b = Math.max(b, X); c = Math.min(c, Y); d = Math.max(d, Y); } return [a, b, c, d]; };
    for (let it = 0; it < 4; it++) {
      let lo = 4, hi = 140;
      for (let s = 0; s < 28; s++) { const mid = (lo + hi) / 2; placeCam(tgt, mid, elev); const [a, b, c, d] = bbox(); if (b - a <= x1 - x0 && d - c <= y1 - y0) hi = mid; else lo = mid; }
      D = hi; placeCam(tgt, D, elev); const [, , c, d] = bbox();
      tgt.z += (((c + d) / 2) - (y0 + y1) / 2) / h * 2 * D * .38;
    }
    playFit = { D, tgt, elev }; return playFit;
  }

  // ---------- hints ----------
  function restoreHalo(c) { const b = c.baseHalo || (c.hero ? { color: '#ff4d6d', opacity: .9 } : { color: '#ffffff', opacity: 0 }); c.halo.material.color.set(b.color); c.halo.material.opacity = b.opacity; }
  let pendingHint = null;
  function clearHint() {
    if (pendingHint) { pendingHint = null; cb.onHint && cb.onHint(false); }
    hintObjs.forEach(o => { if (o.isCarHalo) { const c = o.car; c.hinted = false; restoreHalo(c); } else o.parent && o.parent.remove(o); });
    hintObjs = [];
  }
  function showHint(car, dir, targetCenter, act) {
    clearHint(); if (act) { pendingHint = act; cb.onHint && cb.onHint(true); } car.hinted = true; car.halo.material.color.set('#ffd23f'); hintObjs.push({ isCarHalo: true, car });
    const ahead = car.group.position.clone().add(dir.clone().multiplyScalar(car.len / 2 + .75));
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(.7, 1.1), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false }));
    arrow.rotation.order = 'YXZ'; arrow.rotation.y = yawOf(dir) + Math.PI; arrow.rotation.x = -Math.PI / 2;
    arrow.userData = { base: ahead.clone(), dir: dir.clone(), isArrow: true }; arrow.renderOrder = 5; world.add(arrow); hintObjs.push(arrow);
    if (targetCenter) {
      const ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, car.len), new THREE.MeshBasicMaterial({ map: haloFor(car.len), color: '#ffd23f', transparent: true, depthWrite: false, opacity: .9 }));
      ghost.rotation.order = 'YXZ'; ghost.rotation.y = car.axis === 'h' ? Math.PI / 2 : 0; ghost.rotation.x = -Math.PI / 2; ghost.position.copy(targetCenter).setY(.05); ghost.renderOrder = 3; world.add(ghost); hintObjs.push(ghost);
    }
    audio.sfx.hint();
  }
  function hint() {
    if (mode !== 'play' || won) return;
    if (pendingHint) { const act = pendingHint; clearHint(); if (inputOn) act(); return; }
    if (level.type === 'colour') {
      const r = CM.rules.solve(CM.st, 80000); if (!r.path || !r.path.length) return;
      const m = r.path[0], car = cars[m.i]; showHint(car, relDirVec(CM.st[m.i], m.type), null, () => cmApply(car, m)); return;
    }
    if (level.type === 'rush') {
      const hero = cars[0];
      if (heroClear()) { showHint(hero, new THREE.Vector3(1, 0, 0), null, () => { hero.exitSpeed = 6; exitCar(hero, 1); }); return; }
      const mv = solveRush(cars.map(c => ({ axis: c.axis, len: c.len, r: c.r, c: c.c })), cars.map(c => c.pos), W, H);
      if (!mv) return; const car = cars[mv[0]];
      showHint(car, axisVec(car).multiplyScalar(Math.sign(mv[1] - car.pos)), carCenter(car, mv[1]), () => commitSlide(car, mv[1], 0));
    } else {
      const g = gridOcc();
      for (const car of cars) { if (!car.alive) continue; for (const s of oneWay ? [car.facing] : [car.facing, -car.facing]) if (scan(car, s, g).exit) { showHint(car, axisVec(car).multiplyScalar(s), null, () => { car.exitSpeed = 6; exitCar(car, s); }); return; } }
    }
  }

  // ---------- rules ----------
  function cellsOf(car, pos = car.pos) { const a = []; for (let k = 0; k < car.len; k++) a.push(car.axis === 'h' ? [car.r, pos + k] : [pos + k, car.c]); return a; }
  function gridOcc(except) {
    const g = new Int16Array(W * H).fill(-1);
    blocks.forEach(([r, c]) => g[r * W + c] = 999);
    cars.forEach(car => { if (!car.alive || car === except) return; cellsOf(car).forEach(([r, c]) => g[r * W + c] = car.i); });
    return g;
  }
  function freeRange(car) {
    const g = gridOcc(car), lim = car.axis === 'h' ? W : H; let lo = car.pos, hi = car.pos;
    const at = p => car.axis === 'h' ? g[car.r * W + p] : g[p * W + car.c];
    while (lo - 1 >= 0 && at(lo - 1) === -1) lo--;
    while (hi + car.len < lim && at(hi + car.len) === -1) hi++;
    return [lo, hi];
  }
  function dragRange(car) {
    const [lo0, hi0] = freeRange(car), lim = car.axis === 'h' ? W : H;
    let lo = lo0, hi = hi0, exLo = false, exHi = false;
    if (level.type === 'rush') exHi = car.hero && hi === W - car.len;
    else { exLo = lo === 0; exHi = hi === lim - car.len; }
    if (oneWay) { if (car.facing > 0) { lo = car.pos; exLo = false; } else { hi = car.pos; exHi = false; } }
    return { lo, hi, exLo, exHi };
  }
  function scan(car, s, g) {
    const lim = car.axis === 'h' ? W : H; let p = s > 0 ? car.pos + car.len : car.pos - 1, free = 0;
    while (p >= 0 && p < lim) { const v = car.axis === 'h' ? g[car.r * W + p] : g[p * W + car.c]; if (v !== -1) return { exit: false, free, blocker: v }; free++; p += s; }
    return { exit: true, free };
  }
  const emitMoves = () => cb.onMoves && cb.onMoves({ moves, bumps, left: cars.filter(c => c.alive).length, canUndo: undoStack.length > 0, heroClear: level && level.type === 'rush' ? heroClear() : false });

  function streetCoord(d) { return d.x > 0 ? LX + 1 : d.x < 0 ? -(LX + 1) : d.z > 0 ? LZ + 1 : -(LZ + 1); }
  function driveAway(car, d, onDone) {
    const reversing = yawDiff(car.group.rotation.y, yawOf(d)) > 2.4;
    const go = () => {
      const start = car.group.position.clone(); const along = start.dot(d), lane = Math.abs(streetCoord(d)) - .5;
      const h2 = new THREE.Vector3(d.z, 0, -d.x), rad = .7, adv = Math.max(.25, lane - along);
      const Q = start.clone().addScaledVector(d, Math.max(0, adv - rad)), C = start.clone().addScaledVector(d, adv), Rr = C.clone().addScaledVector(h2, rad);
      const path = new THREE.CurvePath();
      if (Q.distanceTo(start) > .01) path.add(new THREE.LineCurve3(start, Q));
      path.add(new THREE.QuadraticBezierCurve3(Q, C, Rr));
      path.add(new THREE.LineCurve3(Rr, Rr.clone().addScaledVector(h2, 28)));
      const L = path.getLength(); let dist = 0, v = car.exitSpeed || 4;
      car.task = task(dt => {
        v = Math.min(13, v + dt * 14); dist += v * dt; const u = Math.min(1, dist / L);
        car.group.position.copy(path.getPointAt(u)); car.group.rotation.y = yawOf(path.getTangentAt(u));
        if (u >= 1) { car.group.visible = false; car.task = null; onDone && onDone(); return true; }
        return false;
      });
    };
    if (reversing) { const y0 = car.group.rotation.y; audio.sfx.pick(); car.task = tween(.3, k => { car.group.rotation.y = y0 + Math.PI * easeInOut(k); car.inner.position.y = Math.sin(k * Math.PI) * .45; }, () => { car.inner.position.y = 0; go(); }); }
    else go();
    audio.sfx.vroom();
  }
  function wobble(car) { if (!car || !car.inner) return; tween(.35, k => { car.inner.rotation.z = Math.sin(k * Math.PI * 4) * .12 * (1 - k); car.inner.position.y = Math.sin(k * Math.PI) * .08; }, () => { car.inner.rotation.z = 0; car.inner.position.y = 0; }); }

  function exitCar(car, s) {
    clearHint(); const d = axisVec(car).multiplyScalar(s);
    if (level.type === 'rush') {
      if (car.pos !== W - car.len) moves++;
      won = true; inputOn = false; emitMoves();
      driveAway(car, d, () => { }); setTimeout(finish, 1100);
    } else {
      moves++; car.alive = false; undoStack.push({ type: 'exit', car }); emitMoves();
      driveAway(car, d, () => { });
      if (cars.every(c => !c.alive)) { inputOn = false; setTimeout(() => { if (!won && cars.every(c => !c.alive)) finish(); }, 650); }
    }
  }
  function bump(car, s) {
    clearHint(); const g = gridOcc(); const res = scan(car, s, g); const d = axisVec(car).multiplyScalar(s);
    moves++; bumps++; undoStack.push({ type: 'bump' }); emitMoves();
    const base = carCenter(car), dist = res.free + .14; car.busy = true; audio.sfx.slide();
    tween(.12 + res.free * .045, k => car.group.position.copy(base).addScaledVector(d, dist * k * k), () => {
      audio.sfx.thud(); audio.sfx.honk(); wobble(cars[res.blocker]); wobble(car);
      tween(.28, k => car.group.position.copy(base).addScaledVector(d, dist * (1 - ease(k))), () => { car.group.position.copy(base); car.busy = false; });
    });
  }
  function commitSlide(car, target, fromOffset) {
    const a = axisVec(car), base = carCenter(car), to = target - car.pos;
    if (to !== 0) { clearHint(); undoStack.push({ type: 'slide', car, pos: car.pos }); moves++; car.pos = target; if (car.axis === 'h') car.c = target; else car.r = target; audio.sfx.slide(); updateGate(); emitMoves(); }
    car.busy = true;
    tween(.16 + Math.abs(to - fromOffset) * .03, k => car.group.position.copy(base).addScaledVector(a, fromOffset + (to - fromOffset) * ease(k)), () => { car.group.position.copy(carCenter(car)); car.busy = false; if (to !== 0) squash(car); });
  }
  function finish() {
    won = true; inputOn = false; audio.sfx.win(); burst();
    const min = level.min;
    const stars = starsFor(level, moves, bumps), _old = level.type === 'colour' ? (moves <= min + 1 ? 3 : moves <= min + Math.ceil(min * .4) + 2 ? 2 : 1) : level.type === 'rush' ? (moves <= min ? 3 : moves <= min + Math.ceil(min * .5) + 1 ? 2 : 1) : (bumps === 0 ? 3 : bumps <= 2 ? 2 : 1);
    setTimeout(() => cb.onWin && cb.onWin({ moves, bumps, stars, min }), 650);
  }
  function burst() {
    const cols = ['#ff4d6d', '#ffd23f', '#3ec1d3', '#7bd389', '#a78bfa', '#ff8a3d'], geo = new THREE.PlaneGeometry(.16, .26);
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      m.position.set((Math.random() - .5) * W * .6, .5, (Math.random() - .5) * H * .6);
      m.userData = { v: new THREE.Vector3((Math.random() - .5) * 7, 7 + Math.random() * 6, (Math.random() - .5) * 7), s: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life: 2.6 + Math.random() };
      world.add(m); confetti.push(m);
    }
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.35);
  let drag = null;
  const el = renderer.domElement;
  function pointerRay(e) { const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
  function groundPt() { const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; }
  function screenAxis(car) {
    const r = el.getBoundingClientRect(), c0 = car.group.position.clone().setY(.35), p0 = c0.clone().project(camera), p1 = c0.add(axisVec(car)).project(camera);
    return new THREE.Vector2((p1.x - p0.x) * r.width / 2, -(p1.y - p0.y) * r.height / 2).normalize();
  }
  function pickCar(e) {
    pointerRay(e);
    const live = cars.filter(c => c.alive && !c.busy && !c.task);
    // First choice: a real raycast against the car models — the nearest mesh under the finger wins,
    // so whatever car is visibly under the tap is the one picked (tall trucks included).
    const hits = ray.intersectObjects(live.map(c => c.inner), true);
    if (hits.length) {
      for (const h of hits) { let o = h.object; while (o) { const c = live.find(k => k.inner === o); if (c) return c; o = o.parent; } }
    }
    // Fallback for near-misses (fat fingers): score each car by distance from the tap to its footprint, sampled at roof, mid and base heights.
    // This avoids tall hit-boxes of near cars stealing taps meant for cars behind them.
    let best = null, bestD = .35;
    for (const hgt of [.62, .4, .15]) {
      const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hgt), p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(pl, p)) continue;
      for (const car of live) {
        const c0 = car.group.position, hx = car.axis === 'h' ? car.len / 2 - .05 : .45, hz = car.axis === 'h' ? .45 : car.len / 2 - .05;
        const dx = Math.max(0, Math.abs(p.x - c0.x) - hx), dz = Math.max(0, Math.abs(p.z - c0.z) - hz);
        const d = Math.hypot(dx, dz) + (hgt === .62 ? 0 : hgt === .4 ? .02 : .05);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best && bestD < .03) break;
    }
    return best;
  }
  el.addEventListener('pointerdown', e => {
    audio.unlock();
    if (mode === 'menu') { menuPointer(e); return; }
    if (mode !== 'play' || !inputOn || drag) return;
    const car = pickCar(e); if (!car) return;
    try { el.setPointerCapture(e.pointerId); } catch (_) {} pointerRay(e);
    drag = { car, id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), gp: groundPt(), offset: 0, R: level.type === 'colour' ? null : dragRange(car), hist: [[performance.now(), e.clientX, e.clientY]] };
    if (!car.hero && !car.baseHalo) car.halo.material.color.set('#ffffff');
    car.halo.material.opacity = car.hero || car.baseHalo ? 1 : .75; audio.sfx.pick();
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (level && level.type === 'colour') { if (!drag.fired) { const v = new THREE.Vector2(e.clientX - drag.sx, e.clientY - drag.sy); if (v.length() > 22) { drag.fired = true; cmSwipe(drag.car, v); } } return; }
    const car = drag.car; pointerRay(e); const gp = groundPt(); if (!gp || !drag.gp) return;
    drag.hist.push([performance.now(), e.clientX, e.clientY]); if (drag.hist.length > 6) drag.hist.shift();
    const a = axisVec(car), R0 = drag.R; let off = gp.clone().sub(drag.gp).dot(a);
    const mn = R0.lo - car.pos - (R0.exLo ? 1.8 : 0), mx = R0.hi - car.pos + (R0.exHi ? 1.8 : 0);
    if (off < mn) off = mn - Math.min(.18, (mn - off) * .2); if (off > mx) off = mx + Math.min(.18, (off - mx) * .2);
    drag.offset = off; car.group.position.copy(carCenter(car)).addScaledVector(a, off);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const car = drag.car, R0 = drag.R, now = performance.now(), v = new THREE.Vector2(e.clientX - drag.sx, e.clientY - drag.sy);
    const h0 = drag.hist[0], recent = new THREE.Vector2(e.clientX - h0[1], e.clientY - h0[2]), speed = recent.length() / Math.max(16, now - h0[0]);
    const fired = drag.fired; drag = null;
    if (!car.hinted) restoreHalo(car);
    if (level.type === 'colour') { if (!fired) { if (v.length() < 10) cmTry(car, 'fwd', relDirVec(CM.st[car.i], 'fwd')); else cmSwipe(car, v); } return; }
    const off = Math.max(R0.lo - car.pos - (R0.exLo ? 1.8 : 0), Math.min(R0.hi - car.pos + (R0.exHi ? 1.8 : 0), (() => { const a = axisVec(car); return car.group.position.clone().sub(carCenter(car)).dot(a); })()));
    const tap = v.length() < 10;
    const flick = !tap && speed > .6 && recent.length() > 14;
    if (tap && level.type === 'grid') return flickMove(car, car.facing, 0);
    if (flick) {
      const dot = recent.clone().normalize().dot(screenAxis(car));
      if (Math.abs(dot) < .3) { commitSlide(car, car.pos, off); wobble(car); return; }
      car.exitSpeed = 9; return flickMove(car, Math.sign(dot), off, R0);
    }
    car.exitSpeed = 3;
    const endP = car.pos + off;
    if (R0.exHi && endP > R0.hi + .45) return exitCar(car, 1);
    if (R0.exLo && endP < R0.lo - .45) return exitCar(car, -1);
    commitSlide(car, Math.max(R0.lo, Math.min(R0.hi, Math.round(endP))), off);
  }
  function flickMove(car, s, off, R0 = dragRange(car)) {
    if (oneWay && s !== car.facing) { commitSlide(car, car.pos, off); wobble(car); audio.sfx.nope(); return; }
    if (s > 0 ? R0.exHi : R0.exLo) return exitCar(car, s);
    if (level.type === 'grid') { car.group.position.copy(carCenter(car)); return bump(car, s); }
    const target = s > 0 ? R0.hi : R0.lo;
    if (target === car.pos && Math.abs(off) < .05) { audio.sfx.thud(); wobble(car); }
    commitSlide(car, target, off);
  }
  el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);

  // ======================================================================
  // MENU (garage + district road)
  // ======================================================================
  const menu = { root: new THREE.Group(), players: [], districts: [], station: { type: 'garage' }, sel: 0, car: null, carX: 0, driving: false, traffic: [] };
  M.sc.add(menu.root);
  (function buildMenu() {
    const place = placer(menu.root), root = menu.root;
    // garage floor + backdrop
    const floor = new THREE.Mesh(new THREE.BoxGeometry(15, .12, 7), new THREE.MeshStandardMaterial({ color: '#f3eee4', roughness: .9 }));
    floor.position.set(0, .06, -1.2); floor.receiveShadow = true; root.add(floor);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(15, .125, .3), new THREE.MeshStandardMaterial({ color: '#ffd23f' })); stripe.position.set(0, .065, 2.2); root.add(stripe);
    [-6, -3.2, 3.2, 6].forEach((x, i) => place(['building-e', 'building-g', 'building-f', 'building-e'][i], x, -5.6, 0, S * 1.2));
    place('building-skyscraper-b', 0, -8, 0, S * 1.1);
    [-7.3, 7.3].forEach(x => place('light-square', x, 1.6, x < 0 ? Math.PI / 2 : -Math.PI / 2, S * 1.2));
    const cols = ['#ff4d6d', '#3ec1d3'];
    [-2.4, 2.4].forEach((x, k) => {
      const tt = new THREE.Group(); tt.position.set(x, .12, 0); root.add(tt);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, .22, 48), new THREE.MeshStandardMaterial({ color: '#2a2740', roughness: .6 })); disc.position.y = .11; disc.receiveShadow = true; disc.castShadow = true; tt.add(disc);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.58, .225, 48), new THREE.MeshStandardMaterial({ color: cols[k], roughness: .5 })); ring.position.y = .115; tt.add(ring);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, .23, 48), new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: .7 })); top.position.y = .115; top.receiveShadow = true; tt.add(top);
      const spin = new THREE.Group(); spin.position.y = .23; tt.add(spin);
      const car = new THREE.Group(); const body = fitModel(PLAYER_CARS[k], 2.3, .95); car.add(body); spin.add(car);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.6, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); hit.position.y = .8; tt.add(hit);
      menu.players.push({ tt, spin, car, hit, x, home: new THREE.Vector3(x, .35, 0) });
    });
    // long road
    for (let x = -12; x <= DISTRICT_X[DISTRICT_X.length - 1] + 14; x += 2) {
      if (DISTRICT_X.some(X => Math.abs(x - X) <= 4)) continue;
      place('road-straight', x, ROAD_Z, 0, S, false);
    }
    // districts
    const themes = [
      { patch: '#bfe3a1', mid: 1, tall: 0, parasol: .5, scale: 1 },
      { patch: '#f1dca8', mid: 1, tall: .25, parasol: .2, scale: 1.1 },
      { patch: '#d7d0ea', mid: .4, tall: .8, parasol: 0, scale: 1.15 },
      { patch: '#f6c9b0', mid: .5, tall: .6, parasol: .1, scale: 1.1 },
      { patch: '#c9d3e8', mid: .2, tall: 1, parasol: 0, scale: 1.2 },
      { patch: '#bfe6dc', mid: .8, tall: .2, parasol: .4, scale: 1.05 },
      { patch: '#f3d1e0', mid: .6, tall: .45, parasol: .2, scale: 1.1 },
      { patch: '#d9e0b0', mid: .5, tall: .55, parasol: .1, scale: 1.15 },
      { patch: '#b9bdd6', mid: .1, tall: 1, parasol: 0, scale: 1.25 },
    ];
    DISTRICT_X.forEach((X, k) => {
      const R = mulberry(k * 71 + 5), th = themes[k], g = new THREE.Group(); root.add(g);
      const pl = placer(g);
      const patch = new THREE.Mesh(new THREE.BoxGeometry(11.2, .1, 11.2), new THREE.MeshStandardMaterial({ color: th.patch, roughness: 1 })); patch.position.set(X, -.056, ROAD_Z); patch.receiveShadow = true; g.add(patch);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const x = X + i * 2, z = ROAD_Z + j * 2;
        if (i === 0 && j === 0) { pl('road-crossroad', x, z, 0, S, false); continue; }
        if (j === 0) { pl('road-straight', x, z, 0, S, false); continue; }
        if (i === 0 && Math.abs(j) === 1) { pl('road-straight', x, z, Math.PI / 2, S, false); continue; }
        if (i === 0) { pl('tile-low', x, z, 0, S, false); if (R() < .7) pl('detail-parasol-a', x + (R() - .5), z, R() * 6, S * 1.1); continue; }
        pl('tile-low', x, z, 0, S, false);
        const face = faceRoad(i, j);
        if (j > 0 && Math.abs(j) === 2) { if (R() < th.parasol + .3) pl('detail-parasol-a', x, z, R() * 6, S * 1.2); else pl(pick(R, BUILD_MID), x, z, face, S * .75); continue; }
        if (R() < th.tall) pl(pick(R, BUILD_TALL), x, z, face, S * (.7 + R() * .2));
        else pl(pick(R, BUILD_MID), x, z, face, S * th.scale * .82);
      }
      // barrier for locked
      const bar = new THREE.Group(); g.add(bar);
      [ROAD_Z - .5, ROAD_Z + .5].forEach(z => { const b = clone('construction-barrier'); b.scale.setScalar(5); b.position.set(X - 5.4, 0, z); bar.add(b); });
      [-1.1, 0, 1.1].forEach((dz, q) => { const c = clone('construction-cone'); c.scale.setScalar(4.5); c.position.set(X - 6.2 + (q % 2) * .3, 0, ROAD_Z + dz); bar.add(c); });
      // traffic
      const tr1 = new THREE.Group(); tr1.add(fitModel(pick(R, CARS2), 1.9)); g.add(tr1);
      const tr2 = new THREE.Group(); tr2.add(fitModel(pick(R, CARS3), 2.6)); g.add(tr2);
      menu.traffic.push({ obj: tr1, from: new THREE.Vector3(X + .5, 0, ROAD_Z - 4.6), to: new THREE.Vector3(X + .5, 0, ROAD_Z + 4.6), t: R() });
      menu.traffic.push({ obj: tr2, from: new THREE.Vector3(X + 4.8, 0, ROAD_Z + .5), to: new THREE.Vector3(X - 4.6, 0, ROAD_Z + .5), t: R() });
      menu.districts.push({ X, g, bar });
    });
    // skyline
    const R = mulberry(3);
    for (let x = -14; x <= DISTRICT_X[DISTRICT_X.length - 1] + 14; x += 2.2) place(pick(R, BUILD_LOW), x, -14 - R() * 3, 0, S * (1.4 + R() * .6));
  })();

  function menuDesired() {
    const st = menu.station;
    if (st.type === 'garage') return { tgt: new THREE.Vector3(0, .7, 0), D: 9.4, elev: THREE.MathUtils.degToRad(22), az: 0 };
    const X = DISTRICT_X[st.k];
    if (st.zoom) return { tgt: new THREE.Vector3(X - 1.2, 0, ROAD_Z), D: 19, elev: THREE.MathUtils.degToRad(55), az: 0 };
    return { tgt: new THREE.Vector3(X - 2.2, 0, ROAD_Z), D: 21, elev: THREE.MathUtils.degToRad(46), az: -.12 };
  }
  const menuCam = { pos: new THREE.Vector3(0, 4, 9), tgt: new THREE.Vector3(0, .7, 0) };
  function snapMenuCam() { const d = menuDesired(); placeCam(d.tgt, d.D, d.elev, d.az); menuCam.pos.copy(camera.position); menuCam.tgt.copy(d.tgt); }
  function menuPointer(e) {
    if (menu.station.type !== 'garage' || menu.driving) return;
    pointerRay(e); const hits = ray.intersectObjects(menu.players.map(p => p.hit), false);
    if (hits.length) { const k = menu.players.findIndex(p => p.hit === hits[0].object); cb.onMenuPick && cb.onMenuPick(k); }
  }
  function resetPlayerCars() {
    menu.players.forEach(p => { if (p.car.parent !== p.spin) { p.spin.add(p.car); } p.car.position.set(0, 0, 0); p.car.rotation.set(0, 0, 0); p.car.scale.setScalar(1); p.car.visible = true; });
    menu.car = null; menu.driving = false;
  }
  function setLocks(locks) { menu.districts.forEach((d, k) => { d.bar.visible = !!(locks && locks[k]); }); }
  function parkX(k) { return DISTRICT_X[k] - 7.2; }
  function driveCarTo(k, onDone) {
    const car = menu.car; if (!car) return;
    const fromX = car.position.x, toX = parkX(k), dir = Math.sign(toX - fromX) || 1;
    const laneZ = dir > 0 ? ROAD_Z - .5 : ROAD_Z + .5;
    const wantYaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    menu.driving = true; audio.sfx.vroom();
    const y0 = car.rotation.y, z0 = car.position.z, needFlip = yawDiff(y0, wantYaw) > .2;
    const dur = .5 + Math.abs(toX - fromX) * .035;
    tween(needFlip ? .28 : .01, k2 => { car.rotation.y = y0 + (wantYaw - y0) * easeInOut(k2); car.position.y = Math.sin(k2 * Math.PI) * .4; car.position.z = z0 + (laneZ - z0) * k2; }, () => {
      car.position.y = 0;
      tween(dur, k2 => { car.position.x = fromX + (toX - fromX) * easeInOut(k2); }, () => { menu.driving = false; onDone && onDone(); });
    });
  }

  // ======================================================================
  // PUBLIC
  // ======================================================================
  function loadLevel(lv, idx) {
    tasks = []; confetti = []; clearHint(); drag = null;
    level = lv; levelIdx = idx; moves = 0; bumps = 0; undoStack = []; won = false; oneWay = lv.variant === 'oneway';
    buildWorld(lv, idx + 1); addCars(lv, idx + 1);
    mode = 'play'; active = G; inputOn = true; emitMoves();
    applyView(); const f = fitPlay(); placeCam(f.tgt, f.D, f.elev); camTarget.copy(f.tgt);
    // gentle push-in
    const endPos = camera.position.clone(), startPos = f.tgt.clone().add(endPos.clone().sub(f.tgt).multiplyScalar(1.25));
    camera.position.copy(startPos); camera.lookAt(f.tgt);
    tween(.8, k => { camera.position.lerpVectors(startPos, endPos, easeInOut(k)); camera.lookAt(f.tgt); });
  }
  function undo() {
    if (mode !== 'play' || won || !undoStack.length) return;
    const u = undoStack.pop(); moves = Math.max(0, moves - 1); clearHint();
    if (u.type === 'slide') { const car = u.car, from = car.group.position.clone(); car.pos = u.pos; if (car.axis === 'h') car.c = u.pos; else car.r = u.pos; const to = carCenter(car); tween(.2, k => car.group.position.lerpVectors(from, to, ease(k))); updateGate(); }
    else if (u.type === 'bump') bumps = Math.max(0, bumps - 1);
    else if (u.type === 'cm') {
      const car = u.car; if (car.task) { tasks = tasks.filter(t => t !== car.task); car.task = null; }
      const ns = CM.st.slice(); ns[car.i] = u.prev; CM.st = ns; car.busy = false;
      const wasOut = !car.alive; car.alive = true; car.group.visible = true; cmPose(car, u.prev); car.inner.position.y = 0;
      if (wasOut) { car.inner.scale.setScalar(.01); tween(.25, k => car.inner.scale.setScalar(Math.max(.01, ease(k)))); inputOn = true; }
      cmRefreshArrows();
    }
    else if (u.type === 'exit') {
      const car = u.car; if (car.task) { tasks = tasks.filter(t => t !== car.task); car.task = null; }
      car.alive = true; car.group.visible = true; car.group.position.copy(carCenter(car)); car.group.rotation.y = yawOf(axisVec(car).multiplyScalar(car.facing));
      car.inner.position.y = 0; car.inner.scale.setScalar(.01); tween(.25, k => car.inner.scale.setScalar(Math.max(.01, ease(k)))); inputOn = true;
    }
    audio.sfx.undo(); emitMoves();
  }
  function reset() { if (level && mode === 'play') { loadLevel(level, levelIdx); audio.sfx.undo(); } }

  const api = {
    loadLevel, undo, reset, hint,
    setInsets(o) { insets = { top: 0, right: 0, bottom: 0, left: 0, ...o }; applyView(); if (mode === 'play' && level) { const f = fitPlay(); placeCam(f.tgt, f.D, f.elev); } },
    menuGarage(locks) { mode = 'menu'; active = M; tasks = []; resetPlayerCars(); setLocks(locks); menu.station = { type: 'garage' }; applyView(); snapMenuCam(); },
    menuPick(k, district, locks, onDone) {
      setLocks(locks); const p = menu.players[k]; if (!p || menu.driving) return;
      const car = p.car; const wp = new THREE.Vector3(); car.getWorldPosition(wp); const wy = p.spin.rotation.y + car.rotation.y;
      menu.root.add(car); car.position.copy(wp); car.rotation.set(0, wy, 0); menu.car = car; menu.sel = k; menu.driving = true;
      audio.sfx.rev();
      // 1) hop + spin on the turntable to face the road, 2) drive forward off it, 3) turn right onto the road
      const y0 = wy, dy = ((0 - y0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI, start = wp.clone();
      const r = 1.2, laneZ = ROAD_Z - .5, zc = laneZ - r, cxA = p.x + r;
      tween(.5, q => { car.rotation.y = y0 + dy * easeInOut(q); car.position.y = start.y + Math.sin(q * Math.PI) * .6; }, () => {
        car.rotation.y = 0; const z0 = car.position.z, y1 = car.position.y, L1 = Math.max(.01, zc - z0), L2 = r * Math.PI / 2, T = L1 + L2;
        let d = 0, v = 1.5;
        task(dt => {
          v = Math.min(6, v + dt * 7); d += v * dt; const u = Math.min(d, T);
          if (u <= L1) { car.position.set(p.x, .12 + (y1 - .12) * Math.max(0, 1 - u / Math.min(L1, 1.4)), z0 + u); car.rotation.y = 0; }
          else { const phi = Math.PI - (u - L1) / r, zz = zc + r * Math.sin(phi); car.position.set(cxA + r * Math.cos(phi), zz < 2.2 ? .12 : .12 * Math.max(0, 1 - (zz - 2.2) / .3), zz); car.rotation.y = Math.atan2(Math.sin(phi), -Math.cos(phi)); }
          if (d >= T) { car.position.set(cxA, 0, laneZ); car.rotation.y = Math.PI / 2; tween(.45, q => car.scale.setScalar(1 - .25 * easeInOut(q))); menu.station = { type: 'district', k: district, zoom: false }; driveCarTo(district, onDone); return true; }
          return false;
        });
      });
    },
    menuDistrict(k, locks, zoom = false) {
      setLocks(locks); if (mode !== 'menu') { mode = 'menu'; active = M; tasks = []; }
      if (!menu.car) { const p = menu.players[menu.sel]; menu.root.add(p.car); p.car.position.set(parkX(k), 0, ROAD_Z - .5); p.car.rotation.set(0, Math.PI / 2, 0); p.car.scale.setScalar(.75); menu.car = p.car; menu.station = { type: 'district', k, zoom }; applyView(); snapMenuCam(); return; }
      const moving = menu.station.type !== 'district' || menu.station.k !== k;
      menu.station = { type: 'district', k, zoom };
      if (moving) { if (Math.abs(menu.car.position.x - parkX(k)) > .1) driveCarTo(k); }
      else audio.sfx.whoosh();
    },
    menuReturn(k, locks, sel) { mode = 'menu'; active = M; tasks = []; resetPlayerCars(); setLocks(locks); menu.sel = sel; const p = menu.players[sel]; menu.root.add(p.car); p.car.position.set(parkX(k), 0, ROAD_Z - .5); p.car.rotation.set(0, Math.PI / 2, 0); p.car.scale.setScalar(.75); menu.car = p.car; menu.station = { type: 'district', k, zoom: true }; applyView(); snapMenuCam(); },
    setMuted: m => audio.setMuted(m), sfx: (n, a) => { audio.unlock(); audio.sfx[n] && audio.sfx[n](a); },
    _autoplay: () => { if (!CM) return 'no'; const r = CM.rules.solve(CM.st, 80000); r.path.forEach((m, k) => setTimeout(() => cmApply(cars[m.i], m), k * 380)); return r.path.length; },
    _closeup: (i) => { const c = cars[i].group.position; camera.position.set(c.x, 3.2, c.z + 1.6); camera.lookAt(c.x, .5, c.z); },
    _pick: (x, y) => { const c = pickCar({ clientX: x, clientY: y }); return c ? c.i : -1; },
    _screenAt: (i, h) => { const r = el.getBoundingClientRect(); const p = cars[i].group.position.clone().setY(h).project(camera); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; },
    _screen: i => { const r = el.getBoundingClientRect(); const p = cars[i].group.position.clone().setY(.4).project(camera); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; },
    debug: () => ({ view: camera.view, insets, aspect: camera.aspect, fit: playFit && { D: playFit.D, tz: playFit.tgt.z }, W, H, mode, cars: cars.map(c => ({ i: c.i, pos: c.pos, alive: c.alive })), moves, bumps }),
    dispose() { renderer.setAnimationLoop(null); ro.disconnect(); renderer.dispose(); host.removeChild(el); },
  };

  // ---------- resize + loop ----------
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); applyView(); if (mode === 'play' && level) { const f = fitPlay(); placeCam(f.tgt, f.D, f.elev); } }
  const ro = new ResizeObserver(resize); ro.observe(host);
  let last = performance.now(), tNow = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now; tNow += dt;
    { const cur = tasks; tasks = []; const keep = cur.filter(fn => !fn(dt)); tasks = keep.concat(tasks); }
    if (mode === 'menu') {
      const d = menuDesired(), k = 1 - Math.exp(-dt * 2.6);
      if (menu.station.type === 'garage') { d.az = Math.sin(tNow * .25) * .08; }
      const tmpPos = new THREE.Vector3(d.tgt.x + Math.sin(d.az) * Math.cos(d.elev) * d.D, d.tgt.y + Math.sin(d.elev) * d.D, d.tgt.z + Math.cos(d.az) * Math.cos(d.elev) * d.D);
      menuCam.pos.lerp(tmpPos, k); menuCam.tgt.lerp(d.tgt, k); camera.position.copy(menuCam.pos); camera.lookAt(menuCam.tgt);
      menu.players.forEach((p, i) => { p.spin.rotation.y += dt * (menu.car === p.car ? 0 : .6); });
      menu.traffic.forEach(t => { t.t = (t.t + dt * .09) % 1; t.obj.position.lerpVectors(t.from, t.to, t.t); t.obj.rotation.y = yawOf(t.to.clone().sub(t.from)); const e = Math.min(t.t, 1 - t.t) * 12; t.obj.scale.setScalar(Math.min(1, e)); });
      if (menu.car && !menu.driving) menu.car.children[0].position.y = Math.abs(Math.sin(tNow * 9)) * .015;
      M.sun.position.set(camera.position.x - 7, 18, 9); M.sun.target.position.set(camera.position.x, 0, 0);
    } else {
      cars.forEach(c => { if (c.hero && !c.hinted && c.alive) c.halo.material.opacity = .55 + Math.sin(tNow * 4) * .3; if (c.hinted) c.halo.material.opacity = .6 + Math.sin(tNow * 7) * .4; });
      hintObjs.forEach(o => { if (o.userData && o.userData.isArrow) o.position.copy(o.userData.base).addScaledVector(o.userData.dir, Math.sin(tNow * 6) * .15).setY(.95 + Math.sin(tNow * 6) * .05); });
      if (world && world.userData.chev) world.userData.chev.material.opacity = gate && gate.open ? .6 + Math.sin(tNow * 6) * .4 : .25;
      if (gate) { const want = gate.open ? -1.4 : 0; gate.a += (want - gate.a) * (1 - Math.exp(-dt * 8)); gate.pivot.rotation.x = gate.a; }
      if (CM) cars.forEach(c => { if (c.arrows) for (const a of Object.values(c.arrows)) if (a.userData.exit) a.scale.setScalar(1.2 + Math.sin(tNow * 7) * .15); });
      glows.forEach((g, i) => { g.material.opacity = .85 + Math.sin(tNow * 3 + i) * .08; });
      confetti = confetti.filter(m => { m.userData.v.y -= 14 * dt; m.position.addScaledVector(m.userData.v, dt); m.userData.v.multiplyScalar(.985); m.rotation.x += m.userData.s.x * dt; m.rotation.y += m.userData.s.y * dt; m.userData.life -= dt; if (m.userData.life <= 0 || m.position.y < -1) { m.parent && m.parent.remove(m); return false; } return true; });
    }
    renderer.render(active.sc, camera);
  });
  resize(); snapMenuCam();
  return api;
}
