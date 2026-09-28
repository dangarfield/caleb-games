/* coaster3d.js — the Big Dipper finale from the Claude Design handoff (research/New game design overview/coaster3d.js).
 * First person from the front car, Bip beside you, one closed spline track: station, lift hill, big drop, the street
 * of the 10 rooms, loop-the-loop, the splash pond, the Muddler's white flag, and back to the station.
 * Changes for the build: three via the importmap, the shared renderer (gl.js), a 1024 shadow map, cached Kenney
 * models, onClack/onSplash hooks for the SFX, and dispose() frees the GPU. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getRenderer, detach, disposeScene, governor, isLow } from './gl.js';
const KCACHE = {};
/* ride speed multiplier: 1 = the prototype's pace. At 1 the whole ride lasts about 84s at 60fps (spec: 60–90s; check with simulateRide()). */
const SPEED = 1;

const INK = '#3B2A4A', RAIL = '#FF6B7A', TIE = '#C9B8E6';
const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55 }, o || {}));
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// Ride path (closed). Station → lift hill → drop → street of 10 room windows → loop → splash pond → Muddler's flag → station.
const PTS = [
  [0, 1.5, 0], [0, 1.5, 14], [0, 3.5, 24], [0, 16, 46], [0, 27, 66], [0, 28.5, 74], [0, 26, 80], [0, 12, 94], [0, 2.6, 108],
  [8, 2.3, 120], [22, 2.6, 127], [60, 3, 129], [100, 3, 129], [140, 3, 129], [180, 3, 129], [214, 3, 129],
  [232, 3.5, 129.4], [244, 8, 130], [248, 15, 130.7], [243, 22, 131.4], [234, 22, 132], [229, 15, 132.6], [232, 7.5, 133.2], [242, 3.5, 133.8], [256, 3.2, 134.4],
  [275, 5, 146], [282, 7, 170], [270, 6, 194], [246, 2.5, 208], [214, .9, 214], [182, 1.2, 215], [150, 4, 212], [110, 7, 205], [72, 9, 200], [36, 6, 199],
  [0, 4, 196], [-30, 3, 182], [-42, 2.4, 150], [-42, 2, 100], [-38, 1.8, 52], [-30, 1.6, 20], [-18, 1.5, 0], [-7, 1.5, -14], [0, 1.5, -6]
];
const SEGI = { lift: [2, 5], drop: [5, 8], turn: [8, 10], rooms: [10, 15], loop: [15, 25], swoop: [25, 28], splash: [28, 30], swoop2: [30, 37], flag: [37, 39], home: [39, 43] };
const ROOMS10 = [['Ticket Booth', '#FFD9A0', '#F2424F'], ['Ice Cream Parlour', '#FFE0EC', '#7FC8F8'], ['Toy Bedroom', '#CFE6FF', '#FFB547'], ['Pizza Kitchen', '#FFF3DC', '#45C46A'], ['Pirate Treasure Hold', '#C99A6B', '#3C8CF0'], ['Spooky Crypt', '#6E5A9E', '#9BD86A'], ["Wizard's Study", '#3F4C8A', '#E4506A'], ["Inventor's Workshop", '#BFD7C9', '#FF8A2A'], ['Space Station', '#2D3C6B', '#48C6E8'], ['Coaster Control Room', '#35406E', '#FFC93C']];
const BTN_COLS = ['#F2424F', '#FF8A2A', '#FFD23A', '#45C46A', '#3C8CF0', '#9A5BE0', '#FF7FC0'];

function makeBip() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 32, 24), std('#EEF3F8', { roughness: .35 })); body.scale.set(1, 1.04, .95); g.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(.27, 32), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (c) => { c.fillStyle = '#133443'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); c.fillStyle = '#7CF4E3'; c.beginPath(); c.arc(42, 54, 12, 0, 7); c.fill(); c.beginPath(); c.arc(86, 54, 12, 0, 7); c.fill(); c.lineWidth = 9; c.strokeStyle = '#7CF4E3'; c.lineCap = 'round'; c.beginPath(); c.arc(64, 70, 26, .2, Math.PI - .2); c.stroke(); }) }));
  face.position.set(0, .05, .4); g.add(face);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .22, 8), std(INK)); ant.position.y = .5; g.add(ant);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), std('#F2424F', { emissive: '#601018' })); tip.position.y = .63; g.add(tip);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .28, 6, 12), std('#D8E3EC')); arm.position.set(s * .44, .25, .05); arm.rotation.z = s * -2.5; g.add(arm); g.userData['arm' + (s > 0 ? 'R' : 'L')] = arm; }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeMuddler() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), std('#8BD45A')); body.scale.set(1, .95, .9); body.position.y = 1; g.add(body);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), std('#FFFFFF')); e.position.set(s * .32, 1.3, .78); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), std(INK)); p.position.set(s * .32, 1.3, .98); g.add(p); }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.26, .06, 8, 20, Math.PI), std(INK)); mouth.position.set(0, .88, .86); mouth.rotation.z = Math.PI; g.add(mouth);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .12, 32), std('#7B4FC9')); brim.position.y = 1.78; brim.rotation.z = -.08; g.add(brim);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, .95, 28), std('#9A6BE8')); hat.position.y = 2.3; hat.rotation.z = -.14; g.add(hat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.73, .74, .18, 28), std('#FFC93C')); band.position.y = 1.95; band.rotation.z = -.12; g.add(band);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .1, 20), std('#F2424F')); hb.position.set(.05, 2.3, .66); hb.rotation.x = Math.PI / 2; g.add(hb);
  const arm = new THREE.Group(); arm.position.set(.9, 1.2, 0); g.add(arm);
  const a = new THREE.Mesh(new THREE.CapsuleGeometry(.16, .5, 6, 12), std('#8BD45A')); a.position.y = .35; arm.add(a);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6, 8), std('#8A5A34')); pole.position.set(0, 1.5, 0); arm.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05, 8, 4), std('#FFFFFF', { side: THREE.DoubleSide })); flag.position.set(.82, 2.3, 0); arm.add(flag);
  g.userData.arm = arm; g.userData.flag = flag;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeHouse(i, name, wall, accent) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(15, 11, 9, 3, .6), std(wall)); shell.position.y = 5.5; shell.castShadow = shell.receiveShadow = true; g.add(shell);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(16.4, 2.2, 10.4, 3, .9), std(accent)); roof.position.y = 11.6; roof.castShadow = true; g.add(roof);
  const winTex = canvasTex(512, 320, (c) => {
    c.fillStyle = wall; c.fillRect(0, 0, 512, 320);
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < 512; x += 64) c.fillRect(x, 0, 32, 320);
    c.fillStyle = 'rgba(40,20,60,.18)'; c.fillRect(0, 250, 512, 70);
    for (let k = 0; k < 22; k++) { const x = 30 + (k * 97) % 460, y = 30 + (k * 53 + i * 17) % 200, r = 12 + (k % 3) * 6; c.fillStyle = INK; c.beginPath(); c.arc(x, y + 3, r + 3, 0, 7); c.fill(); c.fillStyle = BTN_COLS[(k + i) % 7]; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(x - r * .3, y - r * .35, r * .4, r * .2, -.5, 0, 7); c.fill(); }
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.5), new THREE.MeshBasicMaterial({ map: winTex })); win.position.set(0, 5.2, -4.52); win.rotation.y = Math.PI; g.add(win);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1, .08, 8, 4), std('#FFFFFF')); frame.scale.set(8.1, 4.9, 1); frame.rotation.z = Math.PI / 4; frame.position.set(0, 5.2, -4.56); g.add(frame);
  const signTex = canvasTex(1024, 160, (c) => { c.fillStyle = '#FFF6E6'; c.fillRect(0, 0, 1024, 160); c.fillStyle = accent; c.beginPath(); c.arc(80, 80, 56, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '700 70px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), 80, 84); c.fillStyle = INK; c.font = '700 76px Fredoka, sans-serif'; c.textAlign = 'left'; c.fillText(name, 160, 86); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(0, 9.6, -4.53); sign.rotation.y = Math.PI; g.add(sign);
  return g;
}

/* the track: spline, parallel-transported frames, segment boundaries. Shared by the ride and simulateRide() */
function buildTrack() {
  const curve = new THREE.CatmullRomCurve3(PTS.map(p => new THREE.Vector3(...p)), true, 'centripetal', .5);
  const N = 3000, L = curve.getLength();
  const Ps = [], Ts = [], Us = [];
  let up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u % 1), t = curve.getTangentAt(u % 1).normalize();
    up = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize();
    Ps.push(p); Ts.push(t); Us.push(up.clone());
  }
  // segment boundaries (as ride fraction) from the control points
  const uOf = (k) => { const q = new THREE.Vector3(...PTS[k % PTS.length]); let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = Ps[i].distanceToSquared(q); if (d < bd) { bd = d; bi = i; } } return bi / N; };
  const SEG = {}; for (const k in SEGI) SEG[k] = [uOf(SEGI[k][0]), SEGI[k][1] >= PTS.length ? 1 : uOf(SEGI[k][1])]; SEG.home[1] = 1;
  // level the horizon everywhere except in and around the loop
  const lw = u => { const a = SEG.loop[0] - .012, b = SEG.loop[1] + .03; if (u < a - .02 || u > b + .03) return 1; if (u > a && u < b) return 0; return u <= a ? (a - u) / .02 : (u - b) / .03; };
  for (let i = 0; i <= N; i++) { const w = lw(i / N); if (w > 0) { const t = Ts[i], lv = new THREE.Vector3(0, 1, 0).sub(t.clone().multiplyScalar(t.y)).normalize(); Us[i].lerp(lv, w).normalize(); } }
  for (let pass = 0; pass < 6; pass++) for (let i = 1; i < N; i++) { Us[i].addVectors(Us[i - 1], Us[i + 1]).add(Us[i]).normalize(); const t = Ts[i]; Us[i].sub(t.clone().multiplyScalar(Us[i].dot(t))).normalize(); }
  const frameAt = (u) => { const f = ((u % 1) + 1) % 1 * N, i = Math.floor(f), k = f - i, j = Math.min(N, i + 1); return { p: Ps[i].clone().lerp(Ps[j], k), t: Ts[i].clone().lerp(Ts[j], k).normalize(), up: Us[i].clone().lerp(Us[j], k).normalize() }; };
  return { curve, N, L, Ps, Ts, Us, SEG, frameAt };
}

/* speed model, one step (the same maths the ride uses) */
const H_TOP = 28.5;
function stepSpeed(v, u, y, dt, SEG) {
  if (u < SEG.lift[0]) return 3.2; if (u < SEG.lift[1] - .004) return 3.6;
  if (u > .955) return Math.max(2.4, v - dt * 5);
  const target = Math.max(6.5, Math.sqrt(2 * 9.8 * Math.max(0, H_TOP + 1.5 - y)) * .82); return v + (target - v) * Math.min(1, dt * 2.2);
}
/* how long the ride takes at a steady 60fps, and when each part starts (for tuning; used by tests/ride-time) */
export function simulateRide(speedMul = SPEED) {
  const T = buildTrack(); let s = 0, v = 3, t = 0; const dt = 1 / 60, at = {};
  while (s < T.L && t < 600) { const u = s / T.L; for (const k in T.SEG) if (at[k] == null && u >= T.SEG[k][0]) at[k] = +t.toFixed(1); v = stepSpeed(v, u, T.frameAt(u).p.y, dt * speedMul, T.SEG); s += v * dt * speedMul; t += dt; }
  return { seconds: +t.toFixed(1), length: +T.L.toFixed(0), at };
}

export async function createRide(el, opts) {
  await document.fonts.load('700 50px Fredoka').catch(() => { });
  const W = el.clientWidth || 1333, H = el.clientHeight || 690;
  const renderer = getRenderer(el), gov = governor();
  const scene = new THREE.Scene();
  scene.background = canvasTex(8, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#5DB6EC'); g.addColorStop(.55, '#BFE6FF'); g.addColorStop(1, '#F2FAFF'); c.fillStyle = g; c.fillRect(0, 0, 8, 256); });
  scene.fog = new THREE.Fog('#DCF1FF', 90, 330);
  const camera = new THREE.PerspectiveCamera(72, W / H, .08, 600);
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#A8DE88', 1.4));
  const sun = new THREE.DirectionalLight('#FFF3E4', 2.2); sun.position.set(60, 120, 40); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); if (isLow()) sun.castShadow = false;
  Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 10, far: 400 }); sun.target.position.set(120, 0, 110); scene.add(sun, sun.target);

  // ground, paths, pond
  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 64), std('#9BDB7A', { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(120, 0, 110); ground.receiveShadow = true; scene.add(ground);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(22, 48), std('#5BC0EB', { roughness: .15, metalness: .1 })); pond.rotation.x = -Math.PI / 2; pond.position.set(212, .06, 214); scene.add(pond);
  const rim = new THREE.Mesh(new THREE.RingGeometry(22, 24, 48), std('#FFE9C2')); rim.rotation.x = -Math.PI / 2; rim.position.set(212, .07, 214); scene.add(rim);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(220, 7), std('#FFE9C2', { roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(118, .05, 145); path.receiveShadow = true; scene.add(path);
  for (let k = 0; k < 14; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(4 + (k % 3) * 1.5, 16, 12), std('#FFFFFF', { roughness: 1 })); c.scale.set(2.2, .7, 1); c.position.set(-80 + k * 32, 60 + (k * 7) % 20, 330 - (k % 4) * 90); scene.add(c); }

  // track
  const { curve, N, L, Ps, Ts, Us, SEG, frameAt } = buildTrack();
  const offsetCurve = (dr, du) => { const pts = []; for (let i = 0; i < N; i += 2) { const r = new THREE.Vector3().crossVectors(Ts[i], Us[i]).normalize(); pts.push(Ps[i].clone().addScaledVector(r, dr).addScaledVector(Us[i], du)); } return new THREE.CatmullRomCurve3(pts, true); };
  const railMat = std(RAIL, { roughness: .35, metalness: .2 });
  for (const [dr, du, rad] of [[-.55, 0, .09], [.55, 0, .09], [0, -.42, .16]]) { const m = new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(dr, du), 3000, rad, 8, true), railMat); m.castShadow = true; scene.add(m); }
  const nt = Math.floor(L / .9), ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, .1, .22), std(TIE), nt), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < nt; k++) { const f = frameAt(k / nt), r = new THREE.Vector3().crossVectors(f.t, f.up).normalize(); const basis = new THREE.Matrix4().makeBasis(r, f.up, f.t); Q.setFromRotationMatrix(basis); M.compose(f.p.clone().addScaledVector(f.up, -.12), Q, S); ties.setMatrixAt(k, M); }
  ties.castShadow = true; scene.add(ties);

  // Kenney pieces: supports, train, trees
  const loader = new GLTFLoader(), base = opts.baseURL;
  const get = (m) => (KCACHE[m] || (KCACHE[m] = loader.loadAsync(base + 'kenney/' + m + '.glb').then(g => g.scene))).then(sc => sc.clone(true));
  const [supSrc, carSrc, treeA, treeB] = await Promise.all([get('support-large'), get('coaster-train-front'), get('tree-large'), get('tree')]);
  const lilac = std('#E4D9F5', { roughness: .6 });
  supSrc.traverse(o => { if (o.isMesh) { o.material = lilac; o.castShadow = true; } });
  for (let k = 0; k < 240; k++) {
    const u = k / 240; if (u > SEG.loop[0] - .005 && u < SEG.loop[1] - .02) continue;
    const f = frameAt(u), h = f.p.y - .6; if (h < 1.2 || f.up.y < .6) continue;
    const s = supSrc.clone(); s.position.set(f.p.x, 0, f.p.z); s.scale.set(2.4, h, 2.4); scene.add(s);
  }
  const trees = [];
  for (let k = 0; k < 90; k++) {
    const a = k * 2.399, r = 30 + (k * 37) % 260, x = 120 + Math.cos(a) * r, z = 110 + Math.sin(a) * r;
    let ok = true; for (let i = 0; i < N; i += 20) { const p = Ps[i]; if ((p.x - x) ** 2 + (p.z - z) ** 2 < 100) { ok = false; break; } }
    if (!ok || (x > 20 && x < 225 && z > 120 && z < 160) || (x - 212) ** 2 + (z - 214) ** 2 < 900) continue;
    const t = (k % 3 ? treeA : treeB).clone(); t.position.set(x, 0, z); t.scale.setScalar(4 + (k % 5)); t.rotation.y = k; t.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(t); trees.push(t);
  }
  // the 10 rooms you escaped, along the street, windows facing the track
  ROOMS10.forEach(([name, wall, accent], i) => { const h = makeHouse(i, name, wall, accent); h.position.set(30 + i * 19.5, 0, 140); scene.add(h); });
  // station
  const plat = new THREE.Mesh(new RoundedBoxGeometry(8, 1.1, 22, 2, .3), std('#FFF6E6')); plat.position.set(-4.4, .55, 4); plat.receiveShadow = true; scene.add(plat);
  const canopy = new THREE.Mesh(new RoundedBoxGeometry(12, .6, 24, 2, .3), std('#F2424F')); canopy.position.set(-1.5, 7.2, 4); canopy.castShadow = true; scene.add(canopy);
  for (const z of [-6, 14]) for (const x of [-7, 4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 7, 12), std('#FFC93C')); c.position.set(x, 3.6, z); scene.add(c); }
  const stTex = canvasTex(1024, 200, (c) => { c.fillStyle = '#FFC93C'; c.fillRect(0, 0, 1024, 200); c.fillStyle = INK; c.font = '700 120px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BIG DIPPER', 512, 108); });
  const stSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), new THREE.MeshBasicMaterial({ map: stTex })); stSign.position.set(-1.5, 8.6, 16.1); scene.add(stSign);
  // Muddler with the white flag
  const mud = makeMuddler(); mud.scale.setScalar(2.2); mud.position.set(-49, 0, 88); mud.rotation.y = Math.PI / 2 + .5; scene.add(mud);
  // your car + Bip
  const car = new THREE.Group(); scene.add(car);
  const carM = carSrc.clone(); carM.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set('#FFFFFF'); } }); carM.scale.setScalar(2.4); carM.rotation.y = Math.PI; carM.position.y = -.28; car.add(carM);
  const bip = makeBip(); bip.position.set(.56, 1.12, 1.05); bip.rotation.y = -2.25; bip.scale.setScalar(.66); car.add(bip);
  // splash particles
  const NP = 220, drops = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 8, 6), std('#DFF4FF', { roughness: .1, transparent: true, opacity: .9 }), NP); drops.count = 0; scene.add(drops);
  const dv = []; let splashT = -1;

  // ride timing
  const speedMul = opts.speed || SPEED;
  let s = (typeof opts.startAt === 'string' ? (SEG[opts.startAt] ? SEG[opts.startAt][0] - .004 : 0) : (opts.startAt || 0)) * L, v = 3, last = performance.now(), raf = 0, phase = '', done = false, paused = false;
  const hTop = 28.5;
  let clackN = -1;
  const setPhase = (p) => { if (p !== phase) { phase = p; opts.onPhase && opts.onPhase(p); } };
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (gov(now)) sun.castShadow = false;
    const dt = Math.min(.05, (now - last) / 1000) * speedMul; last = now; if (paused) { renderer.render(scene, camera); return; }
    const u = (s / L) % 1, f = frameAt(u);
    // speed: station/lift are chain-driven; after the crest it's gravity with a floor, then brakes into the station
    v = stepSpeed(v, u, f.p.y, dt, SEG);
    s += v * dt;
    if (phase === 'lift' && opts.onClack) { const c = Math.floor(s / 1.6); if (c !== clackN) { clackN = c; opts.onClack(); } }
    const uu = s / L;
    if (uu >= 1 && !done) { done = true; setPhase('photo'); setTimeout(() => opts.onDone && opts.onDone(), 900); }
    const pu = uu % 1;
    setPhase(done ? 'photo' : pu < SEG.lift[0] ? 'station' : pu < SEG.lift[1] ? 'lift' : pu < SEG.drop[1] ? 'drop' : pu < SEG.rooms[0] ? 'turn' : pu < SEG.rooms[1] ? 'rooms' : pu < SEG.loop[1] ? 'loop' : pu < SEG.splash[0] ? 'swoop' : pu < SEG.splash[1] ? 'splash' : pu < SEG.flag[0] ? 'swoop2' : pu < SEG.flag[1] ? 'flag' : 'home');
    const F = frameAt(done ? 0 : pu), r = new THREE.Vector3().crossVectors(F.t, F.up).normalize();
    car.position.copy(F.p).addScaledVector(F.up, .1); car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r.clone().negate(), F.up, F.t));
    const look = frameAt((done ? 0 : pu) + 9 / L);
    camera.position.copy(F.p).addScaledVector(F.up, 1.75).addScaledVector(r, .36).addScaledVector(F.t, -.35);
    camera.up.copy(F.up);
    const tgt = look.p.clone().addScaledVector(look.up, 1.1);
    if (phase === 'rooms') tgt.addScaledVector(r, 3.2);
    if (phase === 'flag') { const m = mud.position.clone().setY(4); tgt.lerp(m, .45); }
    camera.lookAt(tgt);
    const t = now / 1000;
    bip.rotation.z = Math.sin(t * 3) * .06; bip.userData.armL.rotation.z = -2.5 + (phase === 'drop' || phase === 'loop' || phase === 'splash' ? Math.sin(t * 9) * .4 - .5 : 0); bip.userData.armR.rotation.z = 2.5 - (phase === 'drop' || phase === 'loop' ? .6 : 0);
    mud.userData.arm.rotation.z = Math.sin(t * 4) * .35; const fp = mud.userData.flag.geometry.attributes.position; for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(t * 6 + fp.getX(i) * 3) * .12 * (fp.getX(i) + .8)); fp.needsUpdate = true;
    if (phase === 'splash' && splashT < 0) { splashT = t; opts.onSplash && opts.onSplash(); drops.count = NP; for (let i = 0; i < NP; i++) dv[i] = { p: F.p.clone().addScaledVector(F.t, 4 + Math.random() * 3).add(new THREE.Vector3((Math.random() - .5) * 3, 0, (Math.random() - .5) * 3)), v: new THREE.Vector3((Math.random() - .5) * 9, 6 + Math.random() * 9, (Math.random() - .5) * 9).addScaledVector(r, (Math.random() > .5 ? 1 : -1) * 4) }; }
    if (splashT >= 0) { for (let i = 0; i < drops.count; i++) { const d = dv[i]; d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt); M.compose(d.p, Q.identity(), S.setScalar(Math.max(.1, 1 - (t - splashT) / 2.4))); drops.setMatrixAt(i, M); } S.set(1, 1, 1); drops.instanceMatrix.needsUpdate = true; if (t - splashT > 2.6) drops.count = 0; }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);
  return { pause(p) { paused = !!p; }, length: L, dispose() { cancelAnimationFrame(raf); disposeScene(scene); scene.clear(); detach(); } };
}
