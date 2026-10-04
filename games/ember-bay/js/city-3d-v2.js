// Blaze · Ember Bay v2: real-asset 3D view of a generated town (1 unit = 1 m).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCityAssets, partsOf, loadAnimals } from './city-assets.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createPedestrians } from './city-peds.js';
import { makeMarker, setMarkerDim } from './city-markers.js';
import { sfx } from './sfx.js';

const ENGINE_FLIP = false;
const EVCOL = { fire: '#d8362d', rescue: '#e5e043', water: '#2f88c4', safety: '#f2f1ec', drive: '#3b3c3f' };

export async function createCity3D(host, { onSelect, hud: showHud = true } = {}) {
  let paused = false, fast = false, chaseD = 24, cityBounds = null, story = null;
  // Draw distance while driving (m): the far plane culls whole tiles; fog fades them out before the edge.
  const TILE = 96, RANGE = 480, RANGE_FAST = 260, range = () => (fast ? RANGE_FAST : RANGE);
  const FOG_FAR = { near: 700, far: 1700, cam: 2600 };
  function applyRange() {
    if (!scene.fog) return;
    const near = mode === 'drive' && !(mg && !mg.drive);
    if (near) { const r = range(); scene.fog.near = r * 0.55; scene.fog.far = r * 0.95; camera.far = r; }
    else if (!mg) { scene.fog.near = FOG_FAR.near; scene.fog.far = FOG_FAR.far; camera.far = FOG_FAR.cam; }
    camera.updateProjectionMatrix();
  }
  const lib = await loadCityAssets();
  const zoo = await loadAnimals().catch(e => { console.warn('animals', e); return null; });
  const sandFixed = new WeakSet();
  let mixers = [], spinners = [], bridges = [], peds = null, pedTok = 0, engDim = { hw: 1.3, hl: 4.2 };
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, rm = new THREE.Matrix4(), tm = new THREE.Matrix4();
  // deck height on a bridge seg: 24 m ramps up to a 4 m deck
  const deckY = (x, z) => { for (const b of bridges) if (x > b.x && x < b.x + b.w && z > b.z && z < b.z + b.d) return Math.min(4, Math.min(z - b.z, b.z + b.d - z) / 24 * 4); return 0; };
  const renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  const el = renderer.domElement; el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  host.appendChild(el);
  const hud = document.createElement('div');
  hud.style.cssText = "position:absolute;left:16px;bottom:16px;padding:8px 12px;border-radius:8px;background:rgba(28,29,31,.85);color:#f2f1ec;font:500 12px 'JetBrains Mono',monospace;pointer-events:none;white-space:pre";
  host.appendChild(hud); if (!showHud) hud.style.display = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfdde4'); scene.fog = new THREE.Fog('#cfdde4', 700, 1700);
  const hemi = new THREE.HemisphereLight('#ffffff', '#a9a597', 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e8', 1.6);
  sun.position.set(-260, 480, 220); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); // 4096 was 64 MB of GPU memory; 2048 is 16 MB sun.shadow.autoUpdate = false; sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 1500 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2600);
  const controls = new OrbitControls(camera, el);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4; controls.maxDistance = 2200;

  let root = new THREE.Group(); scene.add(root);
  let beacons = new Map(), engine = null, spawn = null, off = { x: 0, z: 0 }, mode = 'overview', selCall = null;
  const drive = { h: 0, v: 0, keys: {} };
  const W = (x, z) => new THREE.Vector3(x - off.x, 0, z - off.z);
  const groundMat = new THREE.MeshLambertMaterial({ color: '#5da83f' });
  const layerMats = new Map();
  const layerMat = (m, k) => { const key = m.uuid + k; if (!layerMats.has(key)) { const c = m.clone(); c.polygonOffset = true; c.polygonOffsetFactor = -k * 1.5; c.polygonOffsetUnits = -k * 6; layerMats.set(key, c); } return layerMats.get(key); };
  // static collision: oriented boxes in a 20 m hash grid
  let solids = new Map(), instRefs = new Map(), curC = null, mg = null, traffic = { cars: [], byIi: new Map() };
  const CELL = 20, ck = (i, j) => i * 100003 + j;
  const fpCache = new Map();
  function footprint(info) {
    if (fpCache.has(info.id)) return fpCache.get(info.id);
    const G = 1, hw = Math.max(0.5, info.w / 2 + 1), hd = Math.max(0.5, info.d / 2 + 1), nx = Math.ceil(hw * 2 / G), nz = Math.ceil(hd * 2 / G), grid = new Uint8Array(nx * nz), v = new THREE.Vector3(), tri = [0, 0, 0];
    for (const pt of partsOf(lib.meshes[info.id])) {
      const pos = pt.geometry.attributes.position, idx = pt.geometry.index, n = idx ? idx.count : pos.count, o = pt.offset || { x: 0, y: 0, z: 0 };
      for (let i = 0; i < n; i += 3) {
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
        for (let j = 0; j < 3; j++) { const q = idx ? idx.getX(i + j) : i + j; const x = pos.getX(q) + o.x, y = pos.getY(q) + o.y, z = pos.getZ(q) + o.z; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y > y1) y1 = y; }
        if (y1 < 1.4) continue;
        const i0 = Math.max(0, Math.floor((x0 + hw) / G)), i1 = Math.min(nx - 1, Math.floor((x1 + hw) / G)), j0 = Math.max(0, Math.floor((z0 + hd) / G)), j1 = Math.min(nz - 1, Math.floor((z1 + hd) / G));
        for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) grid[b * nx + a] = 1;
      }
    }
    const boxes = [], used = new Uint8Array(nx * nz);
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      if (!grid[b * nx + a] || used[b * nx + a]) continue;
      let a1 = a; while (a1 + 1 < nx && grid[b * nx + a1 + 1] && !used[b * nx + a1 + 1]) a1++;
      let b1 = b; while (b1 + 1 < nz) { let ok = true; for (let q = a; q <= a1; q++) if (!grid[(b1 + 1) * nx + q] || used[(b1 + 1) * nx + q]) { ok = false; break; } if (!ok) break; b1++; }
      for (let q = b; q <= b1; q++) for (let p = a; p <= a1; p++) used[q * nx + p] = 1;
      boxes.push({ cx: (a + a1 + 1) / 2 * G - hw, cz: (b + b1 + 1) / 2 * G - hd, hw: (a1 - a + 1) * G / 2, hd: (b1 - b + 1) * G / 2 });
    }
    fpCache.set(info.id, boxes); return boxes;
  }
  function addSolid(info, rows) {
    const tree = /^tree/.test(info.base);
    if (!tree) {
      const fb = footprint(info);
      for (const r of rows) { const cs = Math.cos(r[4]), sn = Math.sin(r[4]); for (const q of fb) { const lx = q.cx * r[5], lz = q.cz * r[7], x = r[1] - off.x + lx * cs + lz * sn, z = r[3] - off.z - lx * sn + lz * cs, bhw = q.hw * r[5], bhd = q.hd * r[7], ext = Math.hypot(bhw, bhd); const b = { x, z, cs, sn, hw: bhw, hd: bhd, h: info.h * r[6] + r[2] };
        for (let i = Math.floor((x - ext) / CELL); i <= Math.floor((x + ext) / CELL); i++) for (let j = Math.floor((z - ext) / CELL); j <= Math.floor((z + ext) / CELL); j++) { const k = ck(i, j); (solids.get(k) || solids.set(k, []).get(k)).push(b); } } }
      return;
    }
    for (const r of rows) {
      const hw = tree ? 0.5 : info.w * r[5] / 2, hd = tree ? 0.5 : info.d * r[7] / 2; if (hw * hd < 0.02) continue;
      const x = r[1] - off.x, z = r[3] - off.z, cs = Math.cos(r[4]), sn = Math.sin(r[4]), ext = Math.hypot(hw, hd);
      const b = { x, z, cs, sn, hw, hd, h: info.h * r[6] + r[2] };
      for (let i = Math.floor((x - ext) / CELL); i <= Math.floor((x + ext) / CELL); i++) for (let j = Math.floor((z - ext) / CELL); j <= Math.floor((z + ext) / CELL); j++) { const k = ck(i, j); (solids.get(k) || solids.set(k, []).get(k)).push(b); }
    }
  }
  // push a circle (x,z,rad) out of any solid; returns pushed amount
  const push = new THREE.Vector2();
  function collide(p, rad, minH = 0) {
    let hit = false; const seen = new Set();
    for (let i = Math.floor((p.x - rad) / CELL); i <= Math.floor((p.x + rad) / CELL); i++) for (let j = Math.floor((p.z - rad) / CELL); j <= Math.floor((p.z + rad) / CELL); j++) for (const b of solids.get(ck(i, j)) || []) {
      if (seen.has(b) || b.h < minH) continue; seen.add(b);
      const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.cs - dz * b.sn, lz = dx * b.sn + dz * b.cs;
      const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
      let ox = lx - qx, oz = lz - qz, d = Math.hypot(ox, oz);
      if (d >= rad) continue;
      if (d < 1e-4) { const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz); if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; d = -px; } else { ox = 0; oz = Math.sign(lz) || 1; d = -pz; } } else { ox /= d; oz /= d; }
      const m = rad - d, wx = ox * b.cs + oz * b.sn, wz = -ox * b.sn + oz * b.cs;
      p.x += wx * m; p.z += wz * m; hit = true;
    }
    return hit;
  }
  const dispose = o => o.traverse(n => { if (n.isInstancedMesh) n.dispose(); });

  // ---- traffic: street cars drive the road graph (left-hand lanes); parking-lot cars stay put ----
  const CAR_FLIP = 0, Yax = new THREE.Vector3(0, 1, 0), tm4 = new THREE.Matrix4(), toff = new THREE.Matrix4(), rm2 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), dirty = new Set();
  function setupTraffic(c) {
    const T = { cars: [], byIi: new Map(), segs: c.segs || [], nodeSegs: new Map() };
    for (const sg of T.segs) for (const nd of [sg.a, sg.b]) (T.nodeSegs.get(nd.id) || T.nodeSegs.set(nd.id, []).get(nd.id)).push(sg);
    const parks = []; c.inst.forEach(r => { const info = lib.index[r[0]]; if (info && /^parking/.test(info.base)) parks.push({ x: r[1], z: r[3], cs: Math.cos(r[4]), sn: Math.sin(r[4]), hw: info.w * r[5] / 2 + 0.5, hd: info.d * r[7] / 2 + 0.5 }); });
    const inPark = (x, z) => parks.some(p => { const dx = x - p.x, dz = z - p.z, lx = dx * p.cs - dz * p.sn, lz = dx * p.sn + dz * p.cs; return Math.abs(lx) < p.hw && Math.abs(lz) < p.hd; });
    c.inst.forEach((r, ii) => {
      const info = lib.index[r[0]]; if (!info || !(/^(car|jeep|pickup|truck|van|taxi)/.test(info.base) || /^cc_/.test(info.id)) || /tractor|rg_|fire/.test(info.id) || inPark(r[1], r[3])) return;
      let best = null, bd = 1e9;
      for (const sg of T.segs) { const px = Math.max(sg.x, Math.min(sg.x + sg.w, r[1])), pz = Math.max(sg.z, Math.min(sg.z + sg.d, r[3])), d = Math.hypot(px - r[1], pz - r[3]); if (d < bd) { bd = d; best = sg; } }
      if (!best || bd > 8) return;
      const ax = best.a.x, az = best.a.z, bx = best.b.x, bz = best.b.z, L = Math.hypot(bx - ax, bz - az) || 1;
      const t = Math.max(0, Math.min(1, ((r[1] - ax) * (bx - ax) + (r[3] - az) * (bz - az)) / (L * L)));
      const car = { ii, sx: r[5], sy: r[6], sz: r[7], seg: best, dir: Math.random() < 0.5 ? 1 : -1, t, v: 0, vmax: 6 + Math.random() * 4, x: r[1], z: r[3], yaw: r[4] };
      T.cars.push(car); T.byIi.set(ii, car);
    });
    return T;
  }
  function updateTraffic(dt) {
    if (!traffic.cars.length) return;
    const ex = engine ? engine.position.x + off.x : 1e9, ez = engine ? engine.position.z + off.z : 1e9;
    const bySeg = new Map(); for (const c of traffic.cars) (bySeg.get(c.seg) || bySeg.set(c.seg, []).get(c.seg)).push(c);
    const mo = mg && mg.o ? { x: mg.o.x + off.x, z: mg.o.z + off.z, r: (mg.r || 30) + 12 } : null;
    for (const c of traffic.cars) {
      const sg = c.seg, ax = sg.a.x, az = sg.a.z, L = Math.hypot(sg.b.x - ax, sg.b.z - az) || 1, fx = (sg.b.x - ax) / L * c.dir, fz = (sg.b.z - az) / L * c.dir;
      let block = 1e9; const dxE = ex - c.x, dzE = ez - c.z, fe = dxE * fx + dzE * fz; if (fe > 0 && fe < 16 && Math.abs(dxE * fz - dzE * fx) < 3.4) block = fe;
      for (const o of bySeg.get(sg)) if (o !== c && o.dir === c.dir) { const d = (o.t - c.t) * c.dir * L; if (d > 0 && d < block) block = d; }
      const want = block < 7 ? 0 : block < 14 ? c.vmax * (block - 7) / 7 : c.vmax;
      c.v += Math.max(-12 * dt, Math.min(4 * dt, want - c.v)); c.t += c.dir * c.v * dt / L;
      if (c.t > 1 || c.t < 0) {
        const nd = c.t > 1 ? sg.b : sg.a, opts = (traffic.nodeSegs.get(nd.id) || []).filter(q => q !== sg), nx = opts.length ? opts[Math.floor(Math.random() * opts.length)] : sg;
        if (nx === sg) { c.dir = -c.dir; c.t = Math.max(0, Math.min(1, c.t)); } else { c.seg = nx; if (nx.a.id === nd.id) { c.dir = 1; c.t = 0; } else { c.dir = -1; c.t = 1; } }
        continue;
      }
      const px = ax + (sg.b.x - ax) * c.t + fz * 2.4, pz = az + (sg.b.z - az) * c.t - fx * 2.4, k = Math.min(1, dt * 6);
      c.x += (px - c.x) * k; c.z += (pz - c.z) * k;
      let dy = Math.atan2(fx, fz) - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 5);
      const hide = mo && Math.hypot(c.x - mo.x, c.z - mo.z) < mo.r;
      ts.set(hide ? 0 : c.sx, hide ? 0 : c.sy, hide ? 0 : c.sz);
      tm4.compose(tp.set(c.x - off.x, deckY(c.x, c.z), c.z - off.z), tq.setFromAxisAngle(Yax, c.yaw + CAR_FLIP), ts);
      for (const [im, k2, o] of instRefs.get(c.ii) || []) { if (o) im.setMatrixAt(k2, toff.multiplyMatrices(tm4, rm2.makeTranslation(o.x, o.y, o.z))); else im.setMatrixAt(k2, tm4); dirty.add(im); }
    }
    dirty.forEach(im => (im.instanceMatrix.needsUpdate = true)); dirty.clear();
  }
  function carPush(cp, rad) { let hit = false; for (const c of traffic.cars) { const dx = cp.x - (c.x - off.x), dz = cp.z - (c.z - off.z), d = Math.hypot(dx, dz), m = rad + 1.2 - d; if (m > 0 && d > 1e-3) { cp.x += dx / d * m; cp.z += dz / d * m; hit = true; } } return hit; }
  function drivable(x, z) {
    const cx = x + off.x, cz = z + off.z, T = (curC && curC.terrain) || {}, inR = (r, m = 0) => cx >= r.x + m && cx <= r.x + r.w - m && cz >= r.z + m && cz <= r.z + r.d - m;
    if ((T.mountains || []).some(r => inR(r, 6))) return false;
    if ((T.land || []).some(r => inR(r)) || (T.sand || []).some(r => inR(r))) return true;
    return bridges.some(b => cx > b.x - 1 && cx < b.x + b.w + 1 && cz > b.z - 1 && cz < b.z + b.d + 1);
  }

  function build(c, gen) {
    scene.remove(root); dispose(root); root = new THREE.Group(); scene.add(root); beacons = new Map(); solids = new Map(); instRefs = new Map(); curC = c; mixers = []; spinners = []; peds = null; bridges = (c.segs || []).filter(s => s.bridge);
    off = { x: c.TW / 2, z: c.TD / 2 };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: '#3d7ea8' })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.7; sea.receiveShadow = true; root.add(sea);
    for (const L of (c.terrain && c.terrain.land) || []) { const g = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.5, L.d), groundMat); g.position.set(L.x + L.w / 2 - off.x, -0.33, L.z + L.d / 2 - off.z); g.receiveShadow = true; root.add(g); }
    { const LR = (c.terrain && c.terrain.land) || [], onL = (x, z) => LR.some(q => x >= q.x && x <= q.x + q.w && z >= q.z && z <= q.z + q.d);
      for (const r of c.inst) { const info = lib.index[r[0]]; if (!info || !/^sand/.test(info.base) || r.length !== 8 || sandFixed.has(r)) continue; sandFixed.add(r); const hd = (info.d || 34) * (r[7] || 1) / 2 + 4, sx = Math.sin(r[4]), sz = Math.cos(r[4]); if (!onL(r[1] + sx * hd, r[3] + sz * hd) && onL(r[1] - sx * hd, r[3] - sz * hd)) r[4] += Math.PI; } }
    { const pm = new THREE.MeshLambertMaterial({ color: '#3f8fc0', emissive: '#0b2a40', side: THREE.DoubleSide }), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
      for (const r of c.inst) { const info = lib.index[r[0]]; if (!info || !/^water_/.test(info.base) || r.length !== 8) continue;
        for (const part of partsOf(lib.meshes[info.id])) { const g = part.geometry, P = g.attributes.position, idx = g.index, out = []; let top = -1e9; for (let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
          const tri = (x, y, z) => { if ([x, y, z].every(i => P.getY(i) < top - 0.5) && Math.abs(P.getY(x) - P.getY(y)) < 0.01 && Math.abs(P.getY(x) - P.getY(z)) < 0.01) for (const i of [x, y, z]) out.push(P.getX(i), top - 0.25, P.getZ(i)); };
          if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)); else for (let i = 0; i < P.count; i += 3) tri(i, i + 1, i + 2);
          if (!out.length) continue; const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); wg.computeVertexNormals();
          const wm = new THREE.Mesh(wg, pm); wm.matrixAutoUpdate = false; wm.matrix.compose(pp.set(r[1] - off.x, r[2], r[3] - off.z), qq.setFromAxisAngle(AX.y, r[4]), ss.set(r[5], r[6], r[7])); if (part.offset) wm.matrix.multiply(mm.makeTranslation(part.offset.x, part.offset.y, part.offset.z)); wm.receiveShadow = true; root.add(wm); } } }
    const groups = new Map();
    traffic = setupTraffic(c);
    c.inst.forEach((r, i) => { const a = groups.get(r[0]); a ? a.push(i) : groups.set(r[0], [i]); });
    const tint = new Map(c.tints);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const [pi, list] of groups) {
      const info = lib.index[pi], parts = partsOf(lib.meshes[info.id]); if (!parts.length) continue;
      const tinted = list.some(i => tint.has(i) && tint.get(i) !== '#ffffff');
      const flat = /^(road_|green_|parking|land|sand|water|park_|basketball)/.test(info.base);
      const layer = !flat ? 0 : /^road_/.test(info.base) ? 3 : /^(parking|land|basketball|park_)/.test(info.base) ? 2 : /^green_/.test(info.base) ? 1 : 0;
      if (!flat) for (const part of parts) if (part.material && part.material.side !== THREE.DoubleSide) { part.material.side = THREE.DoubleSide; part.material.shadowSide = THREE.FrontSide; }
      // One InstancedMesh per model per TILE x TILE m tile, so the camera's frustum and draw distance can
      // actually skip what's off screen (one mesh spread over the whole town is always "in view").
      // Moving traffic and spinning parts stay as one mesh (their instances change place).
      const movers = list.some(ii => traffic.byIi.has(ii)), tiles = new Map();
      for (const ii of list) { const r = c.inst[ii], k = Math.floor(r[1] / TILE) + ',' + Math.floor(r[3] / TILE); (tiles.get(k) || tiles.set(k, []).get(k)).push(ii); }
      for (const part of parts) for (const sub of (movers || part.spin ? [list] : [...tiles.values()])) {
        const im = new THREE.InstancedMesh(part.geometry, layer ? layerMat(part.material, layer) : part.material, sub.length);
        const bases = part.spin ? [] : null;
        sub.forEach((ii, k) => {
          const r = c.inst[ii];
          m4.compose(p.set(r[1] - off.x, r[2] + layer * 0.03, r[3] - off.z), q.setFromAxisAngle(Y, r[4]), s.set(r[5], r[6], r[7]));
          if (part.offset) m4.multiply(tm.makeTranslation(part.offset.x, part.offset.y, part.offset.z));
          if (bases) bases.push(m4.clone());
          im.setMatrixAt(k, m4); (instRefs.get(ii) || instRefs.set(ii, []).get(ii)).push([im, k, part.offset || null]); if (traffic.byIi.has(ii)) im.frustumCulled = false;
          if (tinted) im.setColorAt(k, col.set(tint.get(ii) || '#ffffff'));
        });
        im.computeBoundingSphere();
        if (bases) { im.frustumCulled = false; spinners.push({ im, bases, axis: AX[part.spin.axis] || AX.y, speed: part.spin.speed || 20, a0: Math.random() * 6 }); }
        im.castShadow = !flat && info.h > 0.6; im.receiveShadow = true;
        root.add(im);
      }
      if (!flat && info.h > 0.7 && !parts[0].spin && !/bridge/.test(info.base)) addSolid(info, list.filter(ii => !traffic.byIi.has(ii)).map(ii => c.inst[ii]));
    }
    if (zoo) for (const a of c.animals || []) {
      const src = zoo.get(a.id); if (!src) continue;
      const o = SkeletonUtils.clone(src.scene); o.traverse(m => { if (m.isMesh) m.castShadow = false; }); o.position.set(a.x - off.x, 0, a.z - off.z); o.rotation.y = a.yaw; root.add(o);
      const clip = src.clips.find(k => k.name === 'Idle') || src.clips[0];
      if (clip) { const mx = new THREE.AnimationMixer(o); const act = mx.clipAction(clip); act.time = Math.random() * clip.duration; act.play(); mixers.push({ mx, o }); }
    }
    const byId = {}; gen.GAMES.forEach(g => (byId[g.id] = g));
    for (const e of c.events) {
      const gm = byId[e.gid], grp = makeMarker({ cat: gm.cat, icon: gm.icon, call: e.call });
      grp.position.copy(W(e.x, e.z)); grp.position.y = deckY(e.x, e.z); root.add(grp); beacons.set(e.call, grp);
    }
    engine = new THREE.Group();
    const ft = lib.meshes.rg_firetruck;
    if (ft) { const body = new THREE.Group(); for (const pt of partsOf(ft)) { const m = new THREE.Mesh(pt.geometry, pt.material); m.castShadow = false; body.add(m); } body.rotation.y = ENGINE_FLIP ? Math.PI : 0; engine.add(body); }
    else { const truck = lib.index.filter(e => e.base === 'truck').sort((a, b) => a.d - b.d)[0]; const tm = truck && lib.meshes[truck.id]; if (tm) { const mat = tm.material.clone(); mat.color.set('#ff5a4a'); const m = new THREE.Mesh(tm.geometry, mat); m.castShadow = true; engine.add(m); } }
    spawn = c.spawn; engine.position.copy(W(spawn.x, spawn.z)); engine.rotation.y = spawn.yaw; drive.h = spawn.yaw; drive.v = 0;
    { const bt = document.createElement('canvas'); bt.width = bt.height = 64; const x = bt.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bt), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05; engine.add(blob); engine.userData.blob = blob; }
    root.add(engine);
    { const b = new THREE.Box3().setFromObject(engine.children[0] || engine), sz = b.getSize(new THREE.Vector3()); if (sz.x > 0.5) engDim = { hw: Math.min(sz.x, sz.z) / 2, hl: Math.max(sz.x, sz.z) / 2 }; engine.userData.blob.scale.set(engDim.hw * 2.6, engDim.hl * 2.3, 1); }
    { const tok = ++pedTok, pr = root; createPedestrians(c, pr, { off, near: spawn }).then(p => { if (tok === pedTok) peds = p; }).catch(e => console.warn('pedestrians: ' + (e && e.message) + ' ' + (e && e.stack))); }
    const span = Math.max(c.TW, c.TD);
    renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
    if (!build.done) { camera.position.set(span * 0.35, span * 0.62, span * 0.78); controls.target.set(0, 0, 0); build.done = true; }
  }

  function setPins(list) { for (const it of list) { const b = beacons.get(it.call); if (!b) continue; b.visible = it.visible; setMarkerDim(b, it.dim); } }
  function setSel(call) {
    if (selCall && beacons.get(selCall)) beacons.get(selCall).scale.setScalar(1);
    selCall = call; const b = call && beacons.get(call); if (!b) return;
    b.scale.setScalar(1.7);
    if (mode !== 'drive') { const d = camera.position.clone().sub(controls.target).setLength(140); controls.target.copy(b.position); camera.position.copy(b.position).add(d); }
  }
  function view(name) {
    mode = name; story = null; controls.enabled = name !== 'drive';
    if (name === 'overview') { camera.position.set(220, 400, 500); controls.target.set(0, 0, 0); }
    if (name === 'top') { camera.position.set(0, 900, 1); controls.target.set(0, 0, 0); }
    if (name === 'street' && engine) {
      const fwd = new THREE.Vector3(-Math.sin(engine.rotation.y), 0, -Math.cos(engine.rotation.y));
      controls.target.copy(engine.position).add(new THREE.Vector3(0, 3, 0)); camera.position.copy(engine.position).addScaledVector(fwd, -24).add(new THREE.Vector3(0, 8, 0));
    }
    if (name === 'drive' && engine) drive.h = engine.rotation.y;
    applyRange();
  }

  let down = null;
  el.addEventListener('pointerdown', e => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  el.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 400) return;
    const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const objs = []; beacons.forEach(b => b.visible && b.traverse(o => o.isMesh && o.userData.call && objs.push(o)));
    const hit = ray.intersectObjects(objs, false)[0]; if (hit && onSelect) onSelect(hit.object.userData.call);
  });
  const keyMap = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ShiftLeft: 'boost', ShiftRight: 'boost' };
  const kd = e => { if (mode !== 'drive' || !keyMap[e.code]) return; drive.keys[keyMap[e.code]] = true; e.preventDefault(); };
  const ku = e => { if (keyMap[e.code]) drive.keys[keyMap[e.code]] = false; };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); });
  ro.observe(host);
  { const w = host.clientWidth || 800, h = host.clientHeight || 600; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  let raf = 0, last = performance.now(), errs = 0;
  const chase = new THREE.Vector3(), look = new THREE.Vector3();
  const frame = now => {
    raf = requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    try { step(now); } catch (e) { if (errs++ < 3) console.error('city3d frame: ' + (e && e.message), e && e.stack); }
  };
  const m4s = new THREE.Matrix4();
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // Animals: hidden (and not animated) beyond the draw distance; they are skinned, so never frustum-culled.
    { const r2 = (mode === 'drive' ? range() : 1e5) ** 2; for (const a of mixers) { const vis = a.o.position.distanceToSquared(camera.position) < r2; a.o.visible = vis; if (vis) a.mx.update(dt); } }
    { const t = now / 1000; beacons.forEach(b => b.visible && b.userData.marker && b.userData.marker.update(t, camera)); }
    if (peds && engine && !(mg && !mg.drive)) peds.update(dt, { fast, camera, engine, moving: mode === 'drive' && Math.abs(drive.v) > 1.2, vel: drive.v, heading: drive.h, ...engDim });
    for (const sp of spinners) { rm.makeRotationAxis(sp.axis, sp.a0 + now / 1000 * sp.speed); sp.bases.forEach((b, k) => sp.im.setMatrixAt(k, m4s.multiplyMatrices(b, rm))); sp.im.instanceMatrix.needsUpdate = true; }
    updateTraffic(dt);
    if (mg && !mg.drive) { if (mg.hook) mg.hook(dt, now); }
    else if (mode === 'drive' && engine) {
      sfx.engine(drive.v); // engine loop follows the speed; fades out when stopped
      const K = drive.keys, top = K.boost ? 22 : 15;
      if (K.f) drive.v = Math.min(top, drive.v + 9 * dt); else if (K.b) drive.v = Math.max(-5, drive.v - 12 * dt); else drive.v *= Math.pow(0.4, dt);
      const sIn = (K.l ? 1 : 0) - (K.r ? 1 : 0), maxSt = 0.62 - Math.min(0.36, Math.abs(drive.v) / 60), st0 = drive.st || 0, want = sIn * maxSt, rate = (sIn && Math.sign(want - st0) === Math.sign(sIn)) ? 4.5 : 8;
      drive.st = st0 + Math.max(-dt * rate, Math.min(dt * rate, want - st0));
      if (sIn && Math.abs(drive.v) > 10) drive.v *= 1 - dt * 0.18 * Math.abs(drive.st) / 0.3;
      const WB = engDim.hl * 1.15, prevP = engine.position.clone(), prevH = drive.h;
      const f0x = Math.sin(drive.h), f0z = Math.cos(drive.h), rx = engine.position.x - f0x * WB / 2 + f0x * drive.v * dt, rz = engine.position.z - f0z * WB / 2 + f0z * drive.v * dt;
      drive.h += drive.v * dt / WB * Math.tan(drive.st);
      engine.rotation.y = drive.h;
      const fwd = new THREE.Vector3(Math.sin(drive.h), 0, Math.cos(drive.h));
      engine.position.set(rx + fwd.x * WB / 2, engine.position.y, rz + fwd.z * WB / 2);
      { const rad = engDim.hw + 0.1, n = 3; let hit = false;
        for (let it = 0; it < 2; it++) for (let k = 0; k < n; k++) { const o = (k / (n - 1) * 2 - 1) * (engDim.hl - rad); const cp = { x: engine.position.x + fwd.x * o, z: engine.position.z + fwd.z * o }, bx = cp.x, bz = cp.z; if (collide(cp, rad) | carPush(cp, rad)) { hit = true; engine.position.x += cp.x - bx; engine.position.z += cp.z - bz; } }
        if (hit) { if (Math.abs(drive.v) > 1.5) sfx.bump(drive.v); drive.v *= -0.25; if (!drive.bump || now - drive.bump > 300) drive.bump = now; } }
      if (!drivable(engine.position.x + fwd.x * engDim.hl, engine.position.z + fwd.z * engDim.hl) || !drivable(engine.position.x - fwd.x * engDim.hl, engine.position.z - fwd.z * engDim.hl)) { if (Math.abs(drive.v) > 2) sfx.bump(drive.v); engine.position.copy(prevP); drive.h = prevH; engine.rotation.y = prevH; drive.v *= -0.2; }
      engine.position.y = deckY(engine.position.x + off.x, engine.position.z + off.z);
      let cd = chaseD; for (; cd > 6; cd -= 2) { const cp = { x: engine.position.x - fwd.x * cd, z: engine.position.z - fwd.z * cd }; if (!collide(cp, 1, 3.5)) break; }
      drive.cd = drive.cd ? drive.cd + (cd - drive.cd) * Math.min(1, dt * (cd < drive.cd ? 12 : 2)) : cd;
      { let dh = drive.h - (drive.ch ?? drive.h); dh = Math.atan2(Math.sin(dh), Math.cos(dh)); drive.ch = (drive.ch ?? drive.h) + dh * Math.min(1, dt * 4); } const cf = new THREE.Vector3(Math.sin(drive.ch), 0, Math.cos(drive.ch));
      chase.copy(engine.position).addScaledVector(cf, -drive.cd).add(new THREE.Vector3(0, 5 + drive.cd * 0.17, 0)); camera.position.lerp(chase, cd < drive.cd ? 0.35 : 0.1);
      look.copy(engine.position).addScaledVector(cf, 10).add(new THREE.Vector3(0, 2, 0)); camera.lookAt(look);
      hud.textContent = `DRIVE  ${Math.round(Math.abs(drive.v) * 3.6)} km/h\n↑↓ ←→ or WASD · Shift = boost`;
      if (mg && mg.hook) mg.hook(dt, now);
    } else if (mode === 'story' && story) {
      // Story shots: a slow orbit around the subject; changing shot flies the camera across to the next one.
      story.a += dt * story.spin;
      const want = new THREE.Vector3(story.c.x + Math.cos(story.a) * story.r, story.c.y + story.h, story.c.z + Math.sin(story.a) * story.r), k = 1 - Math.exp(-dt * 1.8);
      camera.position.lerp(want, k); story.look.lerp(story.c, k); camera.lookAt(story.look);
    } else { controls.update(); hud.textContent = 'Drag to orbit · right-drag to pan · scroll or pinch to zoom · tap a beacon'; }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    build, setPins, setSel, view,
    setPaused(b) { paused = !!b; },
    setKey(k, on) { drive.keys[k] = !!on; },
    clearKeys() { drive.keys = {}; },
    setChase(d) { chaseD = d; },
    setFast(b) { fast = !!b; applyRange(); renderer.setPixelRatio(b ? 1 : Math.min(devicePixelRatio || 1, 1.5)); sun.castShadow = !b; renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;  const w = host.clientWidth, h = host.clientHeight; if (w && h) renderer.setSize(w, h, false); },
    engineCity() { return engine ? { x: engine.position.x + off.x, z: engine.position.z + off.z, h: drive.h, v: drive.v } : null; },
    placeEngine(x, z, h) { if (!engine) return; engine.position.set(x - off.x, 0, z - off.z); engine.rotation.y = h; drive.h = h; drive.v = 0; },
    // Top-down orthographic snapshot of the town for the map screens. Returns { url, x0, z0, x1, z1 } in city coords.
    snapshotTop(c, px = 1400) {
      const L = (c.terrain && c.terrain.land) || []; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const r of L) { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d); }
      const pad = 20; x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
      const w = x1 - x0, d = z1 - z0, cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 1, 3000);
      cam.position.set((x0 + x1) / 2 - off.x, 1200, (z0 + z1) / 2 - off.z); cam.up.set(0, 0, -1); cam.lookAt(cam.position.x, 0, cam.position.z);
      const ow = host.clientWidth || 800, oh = host.clientHeight || 600, pr = renderer.getPixelRatio(), fog = scene.fog; scene.fog = null;
      beacons.forEach(b => (b.userData._v = b.visible, b.visible = false));
      renderer.setPixelRatio(1); renderer.setSize(px, Math.round(px * d / w), false); renderer.render(scene, cam);
      const url = el.toDataURL('image/jpeg', 0.85);
      beacons.forEach(b => (b.visible = b.userData._v)); scene.fog = fog; renderer.setPixelRatio(pr); renderer.setSize(ow, oh, false);
      return { url, x0, z0, x1, z1 };
    },
    // ---- minigames inside the town ----
    THREE, scene, camera, renderer, sun, hemi, lib, zoo, W, deckY, engDim: () => engDim,
    get city() { return curC; }, engineObj: () => engine, drive,
    isLand(x, z) { const T = (curC && curC.terrain) || {}; return [...(T.land || []), ...(T.sand || [])].some(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d); },
    mgBegin({ x, z, r = 30, drive: drv = false } = {}) {
      if (mg) this.mgEnd();
      const o = W(x, z); o.y = deckY(x, z); const sc = sun.shadow.camera;
      mg = { drive: drv, hook: null, hidden: [], peds: [], o, r, s: { cp: camera.position.clone(), cq: camera.quaternion.clone(), near: camera.near, far: camera.far, fov: camera.fov, mode, ep: engine && engine.position.clone(), eh: drive.h, ev: engine ? engine.visible : true, sp: sun.position.clone(), st: sun.target.position.clone(), sb: [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far], hi: hemi.intensity, si: sun.intensity } };
      beacons.forEach(b => { b.userData._mv = b.visible; b.visible = false; });
      camera.near = 0.25; camera.far = 1200; camera.updateProjectionMatrix(); controls.enabled = false; drive.keys = {}; drive.v = 0;
      if (drv) { mode = 'drive'; if (engine) drive.h = engine.rotation.y; applyRange(); }
      else { mode = 'mg'; sun.target.position.copy(o); sun.position.copy(o).add(new THREE.Vector3(-30, 56, 26)); Object.assign(sc, { left: -r * 1.5, right: r * 1.5, top: r * 1.5, bottom: -r * 1.5, near: 1, far: 260 }); sc.updateProjectionMatrix(); sun.shadow.autoUpdate = true; }
      if (peds) for (const p of peds.peds) { const q = p.o || p.obj || p.root; if (q && q.visible && q.position.distanceTo(o) < r + 15) { q.visible = false; mg.peds.push(q); } }
      return o;
    },
    mgEnd() {
      if (!mg) return; const s = mg.s, sc = sun.shadow.camera;
      for (const [im, k, m] of mg.hidden) { im.setMatrixAt(k, m); im.instanceMatrix.needsUpdate = true; }
      mg.peds.forEach(q => (q.visible = true));
      beacons.forEach(b => { if ('_mv' in b.userData) { b.visible = b.userData._mv; delete b.userData._mv; } });
      camera.clearViewOffset(); camera.near = s.near; camera.far = s.far; camera.fov = s.fov; camera.updateProjectionMatrix(); camera.position.copy(s.cp); camera.quaternion.copy(s.cq);
      if (engine && s.ep) { engine.position.copy(s.ep); engine.rotation.y = s.eh; engine.visible = s.ev; } drive.h = s.eh; drive.v = 0; drive.keys = {};
      hemi.intensity = s.hi; sun.intensity = s.si;
      sun.position.copy(s.sp); sun.target.position.copy(s.st); [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = s.sb; sc.updateProjectionMatrix(); sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
      mode = s.mode; controls.enabled = mode !== 'drive'; mg = null;
      try { renderer.render(scene, camera); } catch (e) {}
      applyRange();
    },
    setMgHook(f) { if (mg) mg.hook = f; },
    hideWhere(test) {
      if (!mg || !curC) return 0; let n = 0; const zero = new THREE.Matrix4().makeScale(0, 0, 0), m = new THREE.Matrix4();
      curC.inst.forEach((r, ii) => { const info = lib.index[r[0]]; if (!info || !test(r, info)) return; for (const [im, k] of instRefs.get(ii) || []) { im.getMatrixAt(k, m); mg.hidden.push([im, k, m.clone()]); im.setMatrixAt(k, zero); im.instanceMatrix.needsUpdate = true; } n++; });
      return n;
    },
    near(x, z, r, test) {
      if (!curC) return []; const out = [];
      curC.inst.forEach((q, ii) => { const d = Math.hypot(q[1] - x, q[3] - z); if (d > r) return; const info = lib.index[q[0]]; if (!info || (test && !test(info, q))) return; out.push({ ii, id: info.id, base: info.base, x: q[1], y: q[2], z: q[3], yaw: q[4], w: info.w * q[5], d: info.d * q[7], h: info.h * q[6], top: info.h * q[6] + q[2], dist: d }); });
      return out.sort((a, b) => a.dist - b.dist);
    },
    model(id, shadow = true) {
      const m = lib.meshes[id]; if (!m) return null; const g = new THREE.Group();
      for (const pt of partsOf(m)) { const o = new THREE.Mesh(pt.geometry, pt.material); if (pt.offset) o.position.set(pt.offset.x, pt.offset.y, pt.offset.z); o.castShadow = shadow; o.receiveShadow = true; o.userData.shared = true; if (pt.spin) o.userData.spin = pt.spin; g.add(o); }
      return g;
    },
    _debug: () => ({ traffic, peds, engine, camera, controls, drive, THREE, renderer, scene, sun, root }),
    // Chief Ember's three story lines, each its own shot: 0 = the whole town from the sea, 1 = a call pin up
    // close (call = {x, z} in city coords), 2 = the fire engine waiting at the station.
    storyShot(i, call, snap = false) {
      if (!curC) return;
      const span = Math.max(curC.TW, curC.TD), look = story ? story.look : new THREE.Vector3();
      let s;
      if (i === 1 && call) { const c = W(call.x, call.z); c.y = deckY(call.x, call.z) + 3; s = { c, r: 48, h: 26, spin: 0.14 }; }
      else if (i === 2 && engine) { const c = engine.position.clone().add(new THREE.Vector3(0, -2.5, 0)), h = engine.rotation.y; s = { c, r: 20, h: 11, spin: -0.12, a: Math.atan2(Math.cos(h), Math.sin(h)) + 0.5 }; } // looks just below the engine so it sits above the story panel
      else s = { c: new THREE.Vector3(0, 0, 0), r: span * 0.42, h: span * 0.26, spin: 0.05 }; // whole town, but close enough to read the streets
      if (s.a === undefined) s.a = Math.atan2(camera.position.z - s.c.z, camera.position.x - s.c.x);
      if (!story) look.copy(controls.target);
      story = { ...s, look };
      if (snap) { camera.position.set(s.c.x + Math.cos(s.a) * s.r, s.c.y + s.h, s.c.z + Math.sin(s.a) * s.r); look.copy(s.c); camera.lookAt(look); }
      mode = 'story'; controls.enabled = false; applyRange();
    },
    resetEngine() { if (engine && spawn) { engine.position.copy(W(spawn.x, spawn.z)); engine.rotation.y = spawn.yaw; drive.h = spawn.yaw; drive.v = 0; } },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); controls.dispose(); dispose(root); renderer.dispose(); el.remove(); hud.remove(); },
  };
}
