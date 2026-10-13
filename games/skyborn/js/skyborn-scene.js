// Emberreach renderer: sky, chunked terrain, water, light, and three camera modes (orbit / title / flight).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge static set dressing into a few big meshes per material and per 2 km cell: far fewer draw calls, still distance-culled.
function batchStatic(root, cell = 2000) {
  const buckets = new Map(), P = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const list = [];
  for (const o of root.children) { if (o.userData.anim) continue; if (o.isMesh) list.push(o); else if (o.isGroup) o.traverse(c => { if (c.isMesh && c !== o) list.push(c); }); }
  for (const o of list) {
    if (o.isInstancedMesh || o.userData.anim || !o.material || !o.material.isMeshStandardMaterial || o.material.transparent || o.material.vertexColors || !o.parent) continue;
    P.setFromMatrixPosition(o.matrixWorld);
    const key = o.material.uuid + '|' + Math.floor(P.x / cell) + ',' + Math.floor(P.z / cell);
    let b = buckets.get(key); if (!b) buckets.set(key, b = { mat: o.material, geos: [] });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {}; b.geos.push(g); o.parent.remove(o);
  }
  let n = 0;
  for (const b of buckets.values()) { const geo = mergeGeometries(b.geos, false); b.geos.forEach(g => g.dispose()); if (!geo) continue; const m = new THREE.Mesh(geo, b.mat); m.castShadow = m.receiveShadow = true; root.add(m); n++; }
  return n;
}
import { height, weights, colorAt, forestAt, toWorld, toUV, place, SKY_ISLES, WORLD, hash2, skySolid, PLACES as PLACES_ } from './skyborn-worldgen.js';
import { buildProps } from './skyborn-props.js';
import { buildUnderwater } from './underwater.js';
import { buildHearthvale } from './skyborn-hearthvale.js';
import { buildDragon } from './skyborn-bestiary.js';

const TOD = {
  golden: { zen: 0x6f8fcf, hor: 0xffd7a8, fog: 0xf2cfaa, sun: 0xffd2a0, si: 2.8, hs: 0xffe2bf, hg: 0x5d5a3a, hi: 1.0, el: 0.2, az: -2.2 },
  day: { zen: 0x4a86de, hor: 0xd4e7f6, fog: 0xcfe0ee, sun: 0xfff3e0, si: 3.0, hs: 0xdfefff, hg: 0x5a6a3a, hi: 1.1, el: 0.85, az: -2.5 },
  dusk: { zen: 0x3b3570, hor: 0xff9a6a, fog: 0xd98a72, sun: 0xff9a5a, si: 2.2, hs: 0xffb48a, hg: 0x3a2e3a, hi: 0.8, el: 0.06, az: -1.9 }
};
const srgb = new THREE.Color();
let TOWNS = null; const townsFor = () => TOWNS || (TOWNS = PLACES_.filter(p => ['city', 'town', 'village', 'hamlet'].includes(p.kind) && !p.alt).map(p => { const [x, z] = toWorld(p.u, p.v); return [x, z, p.kind === 'city' ? 330 : 70 + (p.size || 0.2) * 340]; }));
const TOWN_ROOF = [0.62, 0.3, 0.22], TOWN_WALL = [0.86, 0.8, 0.7];
function colorize(geo, jitter = true, bakeTowns = false) {
  const pos = geo.attributes.position, n = pos.count, hs = new Float32Array(n), cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const [u, v] = toUV(pos.getX(i), pos.getZ(i)); hs[i] = height(u, v); pos.setY(i, hs[i]); }
  const sx = geo.parameters.widthSegments, sz = geo.parameters.heightSegments, dx = geo.parameters.width / sx;
  for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++) {
    const k = j * (sx + 1) + i, h = hs[k], hx = hs[k + (i < sx ? 1 : -1)], hz = hs[k + (j < sz ? sx + 1 : -(sx + 1))];
    const [u, v] = toUV(pos.getX(k), pos.getZ(k)); let c = colorAt(u, v, h, Math.hypot(hx - h, hz - h) / dx);
    if (bakeTowns && h > 2) { const px = pos.getX(k), pz = pos.getZ(k); for (const t of townsFor()) { const d = Math.hypot(px - t[0], pz - t[1]); if (d < t[2]) { const tw = hash2(Math.round(px / 9), Math.round(pz / 9)) < 0.55 ? TOWN_ROOF : TOWN_WALL, kk = 0.75 * (1 - d / t[2]) + 0.15; c = [c[0] + (tw[0] - c[0]) * kk, c[1] + (tw[1] - c[1]) * kk, c[2] + (tw[2] - c[2]) * kk]; break; } } }
    const m = jitter ? 0.94 + 0.12 * hash2(Math.round(pos.getX(k)), Math.round(pos.getZ(k))) : 1;
    srgb.setRGB(c[0] * m, c[1] * m, c[2] * m, THREE.SRGBColorSpace); cols[k * 3] = srgb.r; cols[k * 3 + 1] = srgb.g; cols[k * 3 + 2] = srgb.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo.toNonIndexed();
}

export async function mountWorld(container, opts = {}) {
  const view = opts.view || 'orbit', tod = TOD[opts.tod] || TOD.golden; let mode = view;
  const hooks = {};
  const touch = matchMedia('(pointer: coarse)').matches;
  const Qp = { pr: Math.min(devicePixelRatio || 1, touch ? 1.25 : 1.5), R: 6400, shadow: 2048, trees: 420 };
  let lodNear = 3200, lodMid = 5200, fastMode = false;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, preserveDrawingBuffer: view !== 'game', logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Qp.pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 3, 90000);

  const sunDir = new THREE.Vector3(Math.cos(tod.az) * Math.cos(tod.el), Math.sin(tod.el), Math.sin(tod.az) * Math.cos(tod.el)).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: new THREE.Color(tod.zen) }, hor: { value: new THREE.Color(tod.hor) }, sun: { value: new THREE.Color(tod.sun) }, dir: { value: sunDir } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: 'varying vec3 vP; uniform vec3 zen, hor, sun, dir; void main(){ float h = max(vP.y, 0.0); vec3 c = mix(hor, zen, pow(h, 0.55)); float d = max(dot(vP, dir), 0.0); c += sun * (pow(d, 600.0) * 2.0 + pow(d, 12.0) * 0.35); c = mix(c, hor * 0.92, smoothstep(0.0, -0.25, vP.y)); gl_FragColor = vec4(c, 1.0); }'
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.Fog(tod.fog, 2500, 17000);
  const hemi = new THREE.HemisphereLight(tod.hs, tod.hg, tod.hi); scene.add(hemi);
  const sun = new THREE.DirectionalLight(tod.sun, tod.si);
  sun.castShadow = true; sun.shadow.mapSize.set(Qp.shadow, Qp.shadow); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 2;
  Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 8000 });
  scene.add(sun, sun.target);

  // Terrain: one coarse world mesh + detail tiles streamed around the focus point.
  const uCenter = { value: new THREE.Vector2() }; let R = Qp.R;
  const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
  baseMat.onBeforeCompile = sh => { sh.uniforms.uCenter = uCenter; sh.vertexShader = 'uniform vec2 uCenter;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n float dC = distance((modelMatrix * vec4(position,1.0)).xz, uCenter); transformed.y -= 40.0 * (1.0 - smoothstep(${(Qp.R * 0.72).toFixed(1)}, ${(Qp.R * 0.85).toFixed(1)}, dC));`); };
  const baseGeo = half => colorize(new THREE.PlaneGeometry(WORLD.W * 1.06, WORLD.D * 1.1, half ? 180 : touch ? 260 : 360, half ? 95 : touch ? 136 : 190).rotateX(-Math.PI / 2), true, true);
  const base = new THREE.Mesh(baseGeo(false), baseMat); base.receiveShadow = true; scene.add(base);
  const tileMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
  const T = 1200, tiles = new Map();
  const pineG = new THREE.ConeGeometry(4.6, 15, 7).translate(0, 10, 0), broadG = new THREE.IcosahedronGeometry(6.2, 0).translate(0, 9, 0), trunkG = new THREE.CylinderGeometry(0.8, 1.1, 5, 5).translate(0, 2.5, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5532, flatShading: true });
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), col = new THREE.Color();
  const LOD = [{ seg: 40, trees: 1 }, { seg: 24, trees: 0.6 }, { seg: 12, trees: 0.25 }];
  const treeTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#6a4a2a'; x.fillRect(30, 50, 4, 14); x.fillRect(94, 48, 5, 16);
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 2); x.lineTo(54, 52); x.lineTo(10, 52); x.closePath(); x.fill();
    x.beginPath(); x.arc(96, 28, 22, 0, 7); x.fill(); x.beginPath(); x.arc(84, 36, 14, 0, 7); x.arc(108, 36, 14, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const cross = (u0, u1, w, h) => { const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), b = a.clone().rotateY(Math.PI / 2), uv = g => { const p = g.attributes.uv; for (let i = 0; i < p.count; i++) p.setX(i, u0 + p.getX(i) * (u1 - u0)); }; uv(a); uv(b); const m = mergeGeometries([a, b]); return m; };
  const pineX = cross(0, 0.5, 11, 19), broadX = cross(0.5, 1, 14, 16);
  const cutMat = new THREE.MeshLambertMaterial({ map: treeTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const lodFor = d => d < lodNear ? 0 : d < lodMid ? 1 : 2;
  function makeTile(ix, iz, lod = 0) {
    const g = new THREE.Group(), cx = (ix + 0.5) * T, cz = (iz + 0.5) * T, L = LOD[lod]; g.userData.lod = lod;
    const geo = new THREE.PlaneGeometry(T, T, L.seg, L.seg).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    const m = new THREE.Mesh(colorize(geo, true, lod === 2), tileMat); m.receiveShadow = true; m.castShadow = false; g.add(m);
    if (!L.trees) { scene.add(g); return g; }
    const flat = lod > 0, N = Math.round(Qp.trees * L.trees), pines = new THREE.InstancedMesh(flat ? pineX : pineG, flat ? cutMat : treeMat, N), broads = new THREE.InstancedMesh(flat ? broadX : broadG, flat ? cutMat : treeMat, N), trunks = new THREE.InstancedMesh(trunkG, trunkMat, flat ? 1 : N);
    let np = 0, nb = 0, nt = 0;
    for (let a = 0; a < 1800 && nt < N; a++) {
      const x = cx + (hash2(ix * 977 + a, iz) - 0.5) * T, z = cz + (hash2(iz * 911 + a, ix + 3) - 0.5) * T, [u, v] = toUV(x, z), w = weights(u, v), h = height(u, v);
      if (h < 6 || w[3] > 0.45 || w[2] > 0.5 || (w[1] > 0.4 && h > 1300)) continue;
      const sl = Math.abs(height(...toUV(x + 15, z)) - h) + Math.abs(height(...toUV(x, z + 15)) - h);
      if (sl > 14) continue;
      const f = forestAt(u, v, w), dense = f > 0.56 * (w[0] + w[1] * 0.8) && f > 0.12, r = hash2(a, ix * 31 + iz);
      if (!dense && r > 0.03) continue;
      const s = 0.8 + hash2(a, 7) * 0.7, pine = w[1] > 0.35 || h > 260 || hash2(a, 9) < 0.3;
      E.set(0, hash2(a, 11) * 6, 0); Q.setFromEuler(E); M4.compose(V.set(x, h - 1, z), Q, S.set(s, s * (0.85 + hash2(a, 13) * 0.5), s));
      if (pine) { pines.setMatrixAt(np, M4); col.setHSL(0.3 + hash2(a, 5) * 0.06, 0.38, w[1] > 0.4 ? 0.2 : 0.24 + hash2(a, 6) * 0.06); pines.setColorAt(np++, col); }
      else { broads.setMatrixAt(nb, M4); col.setHSL(0.22 + hash2(a, 5) * 0.08, 0.45, 0.3 + hash2(a, 6) * 0.08); broads.setColorAt(nb++, col); }
      if (!flat) trunks.setMatrixAt(nt, M4); nt++;
    }
    pines.count = np; broads.count = nb; trunks.count = flat ? 0 : nt;
    [pines, broads, trunks].forEach(o => { o.castShadow = false; o.receiveShadow = !flat; if (o.count) { o.computeBoundingSphere(); g.add(o); } });
    scene.add(g); return g;
  }
  const focusV = new THREE.Vector3();
  function streamTiles(budget) {
    const fx = Math.floor(focusV.x / T), fz = Math.floor(focusV.z / T), rad = Math.ceil(R / T), want = [];
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const ix = fx + dx, iz = fz + dz, cx = (ix + 0.5) * T, cz = (iz + 0.5) * T;
      if (Math.abs(cx) > WORLD.W * 0.53 || Math.abs(cz) > WORLD.D * 0.55) continue;
      const d = Math.hypot(cx - focusV.x, cz - focusV.z); if (d < R) want.push([d, ix + ',' + iz, ix, iz, lodFor(d)]);
    }
    const keep = new Set(want.map(w => w[1])), drop = g => { scene.remove(g); g.traverse(o => { if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); };
    for (const [k, g] of tiles) if (!keep.has(k)) { drop(g); tiles.delete(k); }
    want.sort((a, b) => a[0] - b[0]);
    for (const w of want) {
      if (budget <= 0) break; const cur = tiles.get(w[1]);
      if (!cur) { tiles.set(w[1], makeTile(w[2], w[3], w[4])); budget--; }
      else if (cur.userData.lod !== w[4] && Math.abs(cur.userData.lod - w[4]) >= 1 && (w[4] < cur.userData.lod || w[0] > (cur.userData.lod === 0 ? lodNear + 300 : lodMid + 300))) { drop(cur); tiles.set(w[1], makeTile(w[2], w[3], w[4])); budget--; }
    }
  }

  const wg = new THREE.PlaneGeometry(WORLD.W * 3.4, WORLD.D * 4.6, 160, 110).rotateX(-Math.PI / 2);
  const wp = wg.attributes.position, wc = new Float32Array(wp.count * 3), deep = new THREE.Color(0x2a6f96), shallow = new THREE.Color(0x3fc4c0), tmp = new THREE.Color();
  for (let i = 0; i < wp.count; i++) { const [u, v] = toUV(wp.getX(i), wp.getZ(i)); let k = 0; if (Math.abs(u) < 1.15 && Math.abs(v) < 1.15) { const hh = height(u, v), w = weights(u, v)[4]; k = Math.max(0, Math.min(1, (hh + 55) / 50)) * (0.35 + 0.65 * Math.min(1, w * 1.6)); } tmp.copy(deep).lerp(shallow, k); wc[i * 3] = tmp.r; wc[i * 3 + 1] = tmp.g; wc[i * 3 + 2] = tmp.b; }
  wg.setAttribute('color', new THREE.BufferAttribute(wc, 3));
  const uTime = { value: 0 };
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.18, metalness: 0.1, flatShading: true, side: THREE.DoubleSide });
  waterMat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += sin(position.x * 0.004 + uTime * 0.9) * 1.4 + cos(position.z * 0.005 + uTime * 0.7) * 1.1;'); };
  const water = new THREE.Mesh(wg, waterMat);
  water.receiveShadow = true; scene.add(water);
  const uw = buildUnderwater(scene); let uwState = false, fogSave = null;
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), new THREE.MeshBasicMaterial({ color: 0x1f4f6a })); seabed.rotation.x = -Math.PI / 2; seabed.position.y = -70; scene.add(seabed);

  const props = buildProps(scene), hv = buildHearthvale(scene, props);
  let ember = null;
  const setDragon = kind => { if (ember) scene.remove(ember); ember = buildDragon(kind || 'Ember'); ember.scale.multiplyScalar(1.6); ember.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(ember); };
  setDragon(opts.dragon || 'Ember');
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const fire = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), fireMat.clone()); m.visible = false; scene.add(m); return { m, v: new THREE.Vector3(), life: 0 }; });

  const LM = id => { const l = place(id); const [x, z] = toWorld(l.u, l.v); return new THREE.Vector3(x, Math.max(height(l.u, l.v), 0), z); };
  const [six, siz] = toWorld(SKY_ISLES.u, SKY_ISLES.v);
  const off = (id, x, y, z, ty = 0) => [LM(id).add(new THREE.Vector3(x, y, z)), LM(id).add(new THREE.Vector3(0, ty, 0))];
  const POST = {
    'Whole map': [new THREE.Vector3(0, 17000, 17500), new THREE.Vector3(0, 0, 600)],
    'Hearthvale': [LM('aerie').add(new THREE.Vector3(1400, 2300, 6200)), LM('aerie').add(new THREE.Vector3(1400, 0, 1200))],
    'The Aerie': [props.aerieTop.clone().add(new THREE.Vector3(170, 50, 200)), props.aerieTop.clone().add(new THREE.Vector3(0, -20, 0))],
    'Kingsholm': off('kingsholm', 650, 380, 760, 80),
    'Millbrook': off('millbrook', 520, 260, 620, 30),
    'Kingsbridge': off('tower_bridge', 260, 90, 220, 20),
    'Gullhaven': off('gullhaven', -600, 300, 700, 20),
    'Thornwood': off('vista_oak', 700, 320, 800, 60),
    'Sleeping Dragon Downs': off('sleeping', -900, 420, 1100, 150),
    'Cinder Peaks': off('furnace', 4500, 2400, 3600, 1100),
    'Frostfang': off('palace', 4000, 2000, 4600, 600),
    'Stormcrown': off('plateau', -3800, 2200, 4000, 800),
    'Sunken Reach': off('lighthouse', -1500, 900, 2600, 0),
    'Sky Isles': [new THREE.Vector3(six + 3000, SKY_ISLES.alt + 900, siz + 3800), new THREE.Vector3(six, SKY_ISLES.alt, siz)]
  };

  let controls = null, fly = null;
  if (view === 'orbit') {
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.maxDistance = 30000; controls.minDistance = 30;
    const p = POST[opts.postcard] || POST['Hearthvale']; camera.position.copy(p[0]); controls.target.copy(p[1]);
  }
  let tween = null;
  const goTo = name => { const p = POST[name]; if (!p || !controls) return; tween = { a: camera.position.clone(), b: p[0].clone(), ta: controls.target.clone(), tb: p[1].clone(), t: 0 }; };

  if (view === 'flight' || view === 'game') {
    fly = { perch: null, soar: false, stun: 0, pos: LM('aerie').add(new THREE.Vector3(-300, 320, 500)), yaw: 0.6, pitch: 0, bank: 0, speed: 38, rollT: 0, idle: 0, input: { x: 0, y: 0, flap: false, dive: false }, cam: new THREE.Vector3(), shake: 0 };
    fly.cam.copy(fly.pos).add(new THREE.Vector3(0, 10, -30));
    if (view === 'flight') addEventListener('message', e => { const d = e.data; if (!d || !d.skyborn) return;
      if (d.skyborn === 'input') { Object.assign(fly.input, d); if (d.x || d.y || d.flap || d.dive) fly.idle = 0; }
      if (d.skyborn === 'roll') { fly.rollT = 0.55; fly.rollDir = d.dir || 1; fly.idle = 0; }
      if (d.skyborn === 'breath') breathe(); });
  }
  const fwd = new THREE.Vector3();
  function breathe() { const f = fire.find(o => o.life <= 0) || fire[0]; ember.getWorldDirection(fwd); f.m.position.copy(ember.position).addScaledVector(fwd, 9).y += 3; f.v.copy(fwd).multiplyScalar(120); f.life = 1; f.m.visible = true; }

  const resize = () => { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); new ResizeObserver(resize).observe(container);
  let visible = true; new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(container);

  const clock = new THREE.Clock(); let t = 0, first = true, cullT = 0, perfT = 0, perfN = 0, curPR = Qp.pr, autoQ = view === 'game', cullFar = 1e9;
  [props.root, hv.root].forEach(r => r && batchStatic(r));
  const cullList = [], cullV = new THREE.Vector3(); [props.root, hv.root].forEach(r => r && r.children.forEach(o => { if ((!o.isInstancedMesh || o.userData.town) && !o.userData.keep) cullList.push(o); }));
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  const groundAt = (x, z, y) => { const g = Math.max(height(...toUV(x, z)), 0); if (y == null) return g; const s = skySolid(x, z, y); return s ? Math.max(g, s.top) : g; };
  const floorAt = (x, z, y) => fly && fly.canSwim && !(y > 1000) ? height(...toUV(x, z)) + 2 : groundAt(x, z, y);
  let lastF = 0;
  const frame = () => {
    if (!visible || document.hidden) { clock.getDelta(); return; }
    if (fastMode) { const now = performance.now(); if (now - lastF < 31) return; lastF = now; }
    const dt = Math.min(clock.getDelta(), 0.05); t += dt;
    props.update(t); hv.update(t);
    uTime.value = t;
    let pose = { flap: 0.3 };
    if (controls) {
      if (tween) { tween.t = Math.min(1, tween.t + dt * 0.45); const k = tween.t * tween.t * (3 - 2 * tween.t); camera.position.lerpVectors(tween.a, tween.b, k); controls.target.lerpVectors(tween.ta, tween.tb, k); if (tween.t >= 1) tween = null; }
      controls.update();
      const a = t * 0.25; ember.position.copy(props.aerieTop).add(new THREE.Vector3(Math.cos(a) * 120, 40 + Math.sin(t * 0.7) * 10, Math.sin(a) * 120)); ember.rotation.set(0, -a, -0.35);
    } else if (mode === 'title') {
      const a = t * 0.05 + 2.2; camera.position.copy(props.aerieTop).add(new THREE.Vector3(Math.cos(a) * 420, 60, Math.sin(a) * 420)); camera.lookAt(props.aerieTop.x, props.aerieTop.y + 20, props.aerieTop.z);
      const b = t * 0.32; ember.position.copy(props.aerieTop).add(new THREE.Vector3(Math.cos(b) * 95, 45 + Math.sin(t * 0.9) * 8, Math.sin(b) * 95)); ember.rotation.set(0, -b, -0.38);
    } else if (fly && fly.perch) {
      const f = fly, P = f.perch; f.pos.lerp(P.pos, Math.min(1, dt * 4)); f.speed = 0; f.pitch = 0; f.bank = 0;
      ember.position.copy(f.pos); ember.rotation.set(0, f.yaw, 0);
      dir.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      // showCam (0..1) pulls the perched camera back and tilts it up, e.g. for fireworks over the Aerie.
      f.showK = (f.showK || 0) + (((f.showCam || 0) > (f.showK || 0) ? 1 : -1) * Math.min(Math.abs((f.showCam || 0) - (f.showK || 0)), dt * 0.9));
      const sk = f.showK * f.showK * (3 - 2 * f.showK);
      tgt.copy(f.pos).addScaledVector(dir, -38 - sk * 150).addScaledVector(up, 16 + sk * 40); f.cam.lerp(tgt, Math.min(1, dt * 3)); camera.position.copy(f.cam);
      camera.up.set(0, 1, 0); camera.lookAt(tgt.copy(f.pos).addScaledVector(dir, 40 + sk * 60).addScaledVector(up, 4 + sk * 70));
      pose = { pose: 'perch' };
    } else if (fly) {
      const f = fly, I = f.input; f.idle += dt;
      let sx = I.x, sy = -I.y;
      if (f.stun > 0) { f.stun -= dt; sx *= 0.3; sy = 0.4; }
      if (view === 'flight' && f.idle > 3) { const ahead = groundAt(f.pos.x + Math.sin(f.yaw) * 300, f.pos.z + Math.cos(f.yaw) * 300); sy = THREE.MathUtils.clamp(((ahead + 260) - f.pos.y) / 150, -0.6, 0.8); sx = 0.2 + Math.sin(t * 0.11) * 0.3; }
      const [u, v] = toUV(f.pos.x, f.pos.z); if ((Math.abs(u) > 0.97 || Math.abs(v) > 0.97) && (u * Math.sin(f.yaw) + v * Math.cos(f.yaw) * 0.52) > 0) { const want = Math.atan2(-f.pos.x, -f.pos.z); let d = want - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); sx = THREE.MathUtils.clamp(-d, -1, 1); }
      f.yaw -= sx * 0.95 * dt;
      let assist = 0;
      if (!f.swim) { for (const tt of [0.5, 0.85, 1.2]) { const ahead = Math.max(8, f.speed * tt), ax = f.pos.x + Math.sin(f.yaw) * ahead, az = f.pos.z + Math.cos(f.yaw) * ahead, ay = f.pos.y + Math.sin(f.pitch) * ahead, need = floorAt(ax, az, f.pos.y) + 5 - ay; if (need > 0) assist = Math.max(assist, Math.min(0.8, need / ahead * 1.3 + 0.05)); } }
      // Dive really dives: steep nose-down, and only levels out (not climbs) in the last half-second before the ground.
      let impact = 9; if (I.dive) for (const tt of [0.2, 0.35, 0.5]) { const ah = Math.max(6, f.speed * tt), ax = f.pos.x + Math.sin(f.yaw) * ah, az = f.pos.z + Math.cos(f.yaw) * ah; if (f.pos.y + Math.sin(f.pitch) * ah < floorAt(ax, az, f.pos.y) + 4) { impact = tt; break; } }
      const pTarget = I.dive ? (impact <= 0.5 ? -0.05 : -0.95) : (assist > 0 ? Math.max(sy * 0.55 + (I.flap ? 0.35 : 0), assist) : sy * 0.55 + (I.flap ? 0.35 : 0));
      f.pitch += (pTarget - f.pitch) * Math.min(1, dt * (I.dive ? 4.5 : 3));
      f.bank += ((sx * 0.75) - f.bank) * Math.min(1, dt * 4);
      const cruise = f.soar ? 120 : 37 + (f.boost || 0);
      f.speed += (-Math.sin(f.pitch) * 16 + (I.flap ? 10 : 0) - (f.speed - cruise) * (f.soar ? 1.2 : 0.35)) * dt; f.speed = THREE.MathUtils.clamp(f.speed, 22, f.soar ? 130 : 95 + (f.boost || 0));
      if (f.soar) f.pitch *= 0.9;
      dir.set(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch));
      f.pos.addScaledVector(dir, f.speed * dt); f.pos.y += (I.flap ? 11 : -1.5) * dt + assist * 14 * dt;
      { const ss = skySolid(f.pos.x, f.pos.z, f.pos.y); if (ss && ss.push) { f.pos.x += ss.push[0] * ss.push[2]; f.pos.z += ss.push[1] * ss.push[2]; f.speed *= 0.85; f.shake = 0.3; if (!(f.bumpCD > 0) && hooks.onBump) { hooks.onBump(); f.bumpCD = 1.2; } } }
      const g = groundAt(f.pos.x, f.pos.z, f.pos.y), sea = height(...toUV(f.pos.x, f.pos.z));
      f.swim = !!f.canSwim && g <= 0 && (I.dive || f.pos.y < -1);
      const floor = f.swim ? sea + 4 : g + 4;
      if (f.swim && f.pos.y < floor) { f.pos.y = floor; f.pitch = Math.max(f.pitch, 0.05); }
      else if (f.pos.y < floor) {
        // Never get stuck in a slope: pop clear above the highest nearby ground and keep a little speed.
        const hit = f.speed > 55 && f.pitch < -0.25 && !(f.bumpCD > 0); let top = floor; const ax = f.pos.x + Math.sin(f.yaw) * 8, az = f.pos.z + Math.cos(f.yaw) * 8; top = Math.max(top, groundAt(ax, az) + 4);
        f.pos.y = top + 1.5; f.pitch = Math.max(f.pitch, hit ? 0.2 : 0.12); f.speed = Math.max(28, f.speed * (hit ? 0.875 : 0.97)); f.shake = hit ? 0.2 : 0.4; f.bumpCD = 1.2; if (hit && hooks.onBump) hooks.onBump(); }
      if (f.bumpCD > 0) f.bumpCD -= dt;
      if (!f.swim && f.pos.y < 2 && g <= 0) { if (f.pos.y < -1) { f.pos.y = Math.min(2, f.pos.y + 40 * dt); f.pitch = Math.max(f.pitch, 0.25); } else { f.pos.y = 2; f.pitch = Math.max(f.pitch, 0.1); } }
      // The height limit is never less than 700 m above the ground below, so high mountains (Frostfang) stay reachable.
      f.pos.y = Math.min(f.pos.y, Math.max(f.ceiling || 2600, g + 700));
      // Dodge: two quick barrel rolls on an ease-in-out curve, with a sidestep that follows the same curve.
      const RD = 0.55, ez = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      let roll = 0;
      if (f.rollT > 0) {
        if (f.rollT >= RD - 1e-4 || f.rollK == null) f.rollK = 0;
        f.rollT = Math.max(0, f.rollT - dt); const k = 1 - f.rollT / RD, e = ez(k), de = e - ez(f.rollK); f.rollK = k;
        roll = e * Math.PI * 4 * (f.rollDir || 1);
        f.pos.x += -Math.cos(f.yaw) * 22 * de * (f.rollDir || 1); f.pos.z += Math.sin(f.yaw) * 22 * de * (f.rollDir || 1);
        if (f.rollT === 0) f.rollK = null;
      }
      ember.position.copy(f.pos); ember.rotation.set(0, 0, 0); ember.rotateY(f.yaw); ember.rotateX(-f.pitch); ember.rotateZ(f.bank * 0.9 - roll);
      tgt.copy(f.pos).addScaledVector(dir, -32).addScaledVector(up, 9 + Math.max(0, -f.pitch) * 6);
      f.cam.lerp(tgt, Math.min(1, dt * 4)); camera.position.copy(f.cam);
      if (f.shake > 0) { f.shake -= dt; camera.position.x += (Math.random() - 0.5) * f.shake * 4; camera.position.y += (Math.random() - 0.5) * f.shake * 4; }
      camera.up.set(0, 1, 0); camera.lookAt(tgt.copy(f.pos).addScaledVector(dir, 30).addScaledVector(up, 3)); camera.rotateZ(-f.bank * 0.3);
      const fov = 55 + Math.max(0, f.speed - 38) * 0.45; if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
      pose = { flap: I.flap ? 1 : 0.15, tuck: I.dive ? 1 : 0 };
    }
    if (hooks.onFrame) hooks.onFrame(dt, t);
    ember.userData.update(t, pose);
    fire.forEach(o => { if (o.life <= 0) return; o.life -= dt * 1.4; o.m.position.addScaledVector(o.v, dt); o.m.scale.setScalar(1 + (1 - o.life) * 2.5); o.m.material.opacity = Math.max(0, o.life); if (o.life <= 0) o.m.visible = false; });
    const focus = controls ? controls.target : ember.position, camH = controls ? camera.position.distanceTo(controls.target) : 300;
    focusV.copy(camH > 9000 ? camera.position.clone().setY(0).lerp(focus, 0.5) : focus); uCenter.value.set(focusV.x, focusV.z);
    streamTiles(first ? 60 : camH > 9000 ? 0 : 2); first = false;
    tiles.forEach(g => { g.visible = camH < 12000; });
    cullT -= dt; if (fastMode && cullT <= 0) { cullT = 0.4; const cp = camera.position, far = camH > 9000 ? 1e9 : cullFar; for (const o of cullList) { let u = o.userData.cull; if (!u) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()); u = o.userData.cull = { off: c.sub(o.position), r: b.getSize(new THREE.Vector3()).length() / 2 }; } if (u.r > 1500) continue; cullV.copy(o.position).add(u.off); o.visible = cullV.distanceToSquared(cp) < (far + u.r) * (far + u.r); } }
    perfT += dt; perfN++; if (perfT > 2) { const fps = perfN / perfT; perfT = 0; perfN = 0; if (autoQ && fps < 40 && curPR > 0.6) { curPR = Math.max(0.6, curPR - 0.15); renderer.setPixelRatio(curPR); resize(); } else if (autoQ && fps > 57 && curPR < Qp.pr) { curPR = Math.min(Qp.pr, curPR + 0.1); renderer.setPixelRatio(curPR); resize(); } }
    sun.position.copy(focus).addScaledVector(sunDir, 3000); sun.target.position.copy(focus);
    const sc = Math.min(4000, Math.max(600, camH * 0.9)); Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc }); sun.shadow.camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    if (controls) { scene.fog.near = 2500 + camH * 0.6; scene.fog.far = 17000 + camH * 1.3; }
    // Underwater: teal fog, no sky, and tell the game (overlay, muffled sound, splash).
    const uwNow = camera.position.y < -0.5;
    if (uwNow !== uwState) { uwState = uwNow; if (uwNow) { fogSave = [scene.fog.color.getHex(), scene.fog.near, scene.fog.far]; scene.fog.color.setHex(0x1d6a7a); sky.visible = false; scene.background = new THREE.Color(0x1d6a7a); } else if (fogSave) { scene.fog.color.setHex(fogSave[0]); scene.fog.near = fogSave[1]; scene.fog.far = fogSave[2]; sky.visible = true; scene.background = null; } if (hooks.onUnderwater) hooks.onUnderwater(uwNow); }
    if (uwState) { scene.fog.near = 6; scene.fog.far = 260; }
    uw.update(dt, t, camera, ember ? ember.position : null, uwState, !!(fly && fly.swim));
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
  const setQuality = fast => {
    fastMode = fast; curPR = fast ? 0.7 : Qp.pr; renderer.setPixelRatio(curPR); renderer.shadowMap.enabled = !fast; sun.castShadow = !fast;
    R = fast ? 3200 : Qp.R; lodNear = fast ? 1200 : 3200; lodMid = fast ? 2400 : 5200;
    LOD[0].seg = fast ? 20 : 40; LOD[1].seg = fast ? 8 : 24; LOD[2].seg = fast ? 4 : 12; LOD[1].trees = fast ? 0.45 : 0.6; LOD[2].trees = fast ? 0 : 0.25;
    base.geometry.dispose(); base.geometry = baseGeo(fast);
    // Clouds are hundreds of puffs: in Fast mode use fewer, simpler puffs.
    [props.clouds, props.storm].forEach(m => { if (!m) return; m.userData.full = m.userData.full || m.count; m.userData.geo1 = m.userData.geo1 || m.geometry; m.userData.geo0 = m.userData.geo0 || new THREE.IcosahedronGeometry(1, 0); m.geometry = fast ? m.userData.geo0 : m.userData.geo1; m.count = fast ? Math.floor(m.userData.full * 0.4) : m.userData.full; });
    cullFar = fast ? 3000 : 1e9; scene.fog.near = fast ? 1800 : 2500; scene.fog.far = fast ? 12000 : 17000; autoQ = fast;
    tiles.forEach(g => { scene.remove(g); g.traverse(o => { if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }); }); tiles.clear(); first = true;
    if (!fast) cullList.forEach(o => { o.visible = true; });
    resize();
  };
  // Time of day: blend between two presets (k 0..1). Underwater keeps its teal fog until you surface.
  const cA = new THREE.Color(), cB = new THREE.Color(), lerpC = (a, b, k) => cA.setHex(a).lerp(cB.setHex(b), k);
  const setTOD = (na, nb, k) => { const a = TOD[na] || TOD.golden, b = TOD[nb] || a, L = (x, y) => x + (y - x) * k;
    sky.material.uniforms.zen.value.copy(lerpC(a.zen, b.zen, k)); sky.material.uniforms.hor.value.copy(lerpC(a.hor, b.hor, k)); sky.material.uniforms.sun.value.copy(lerpC(a.sun, b.sun, k));
    const el = L(a.el, b.el), az = L(a.az, b.az); sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    sun.color.copy(lerpC(a.sun, b.sun, k)); sun.intensity = L(a.si, b.si); hemi.color.copy(lerpC(a.hs, b.hs, k)); hemi.groundColor.copy(lerpC(a.hg, b.hg, k)); hemi.intensity = L(a.hi, b.hi);
    const fc = lerpC(a.fog, b.fog, k).getHex(); if (uwState && fogSave) fogSave[0] = fc; else scene.fog.color.setHex(fc); };
  return { setTOD, quality: Qp, goTo, postcards: Object.keys(POST), breathe, scene, camera, renderer, fly, hooks, setDragon, setQuality, get ember() { return ember; }, setMode: m => { mode = m; }, LM, props, groundAt };
}
