// Blaze · Ember Bay minigames, batch 2: cat, drop, torch, line, smoke, hazard, sand, foam.
import { THREE, chip, meter, pips, flame, spray, box, cyl, sph, at, mat, icon, C, W, H } from './mg-kit.js';
import { loadPack } from './city-assets.js';

export const TIPS2 = {
  cat: 'Drag your finger to move the yellow end of the ladder. Hold it next to the cat.',
  drop: 'Pull back further for a longer throw, and watch the wind.',
  torch: 'Shine the torch into corners and under things. Chicks hide on the floor and on low furniture.',
  line: 'Draw your line between the fire and the houses, early.',
  smoke: 'Open every window to clear the smoke faster.',
  hazard: 'Look for plugs, candles and things left switched on.',
  sand: 'Fill the gaps nearest the water first.',
  foam: 'Move one slider at a time and watch the tank colour.',
};
const once = f => { let d = false; return (...a) => { if (!d) { d = true; f(...a); } }; };
const hearts = (n, of = 3) => `<span style="display:flex;gap:4px">${Array.from({ length: of }, (_, i) => icon(i < n ? 'close' : 'favorite', 24, i < n ? '#8b8c86' : C.red)).join('')}</span>`;
const bar = '<span style="width:1px;height:28px;background:#3b3c3f"></span>';
const tree = (h = 6) => { const g = new THREE.Group(); g.add(at(cyl(0.35, 0.5, h, '#7a5a3a', 10), 0, h / 2, 0)); [[0, h + 0.6, 0, 2.2], [1.3, h - 0.3, 0.3, 1.6], [-1.2, h - 0.2, -0.3, 1.7], [0.2, h - 0.8, 1.1, 1.4]].forEach(([x, y, z, r]) => g.add(at(sph(r, '#4f8a3a', 10), x, y, z))); return g; };
const kitty = () => { const g = new THREE.Group(), o = '#e8923a'; g.add(at(sph(0.28, o), 0, 0.28, 0), at(sph(0.2, o), 0, 0.5, 0.22), at(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), mat(o)), 0.1, 0.68, 0.22), at(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), mat(o)), -0.1, 0.68, 0.22)); const t = at(cyl(0.04, 0.04, 0.5, o, 6), 0, 0.35, -0.3); t.rotation.x = -0.8; g.add(t); return g; };
async function room(S, id) {
  const P = await loadPack('interiors', './assets/', [id]); const r = P.get(id).clone(true); S.scene.add(r);
  const bb = new THREE.Box3().setFromObject(r), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), ray = new THREE.Raycaster();
  c.y = bb.min.y + 2.55; r.updateMatrixWorld(true);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], walls = dirs.filter(([x, z]) => { ray.set(c, new THREE.Vector3(x, 0, z)); ray.far = Math.max(sz.x, sz.z); const h = ray.intersectObject(r, true)[0]; return h && h.distance > (x ? sz.x : sz.z) * 0.3; });
  const open = dirs.filter(d => !walls.includes(d)); const cd = new THREE.Vector3(); (open.length ? open : [[1, 0], [0, 1]]).forEach(([x, z]) => cd.add(new THREE.Vector3(x, 0, z))); if (cd.lengthSq() < 0.01) cd.set(1, 0, 1); cd.normalize();
  const view = (cam, k = 0.85, y = 3.3, lookY = 0.8) => { cam.position.set(c.x + cd.x * Math.max(sz.x, sz.z) * k * 1.2, y, c.z + cd.z * Math.max(sz.x, sz.z) * k * 1.2); cam.lookAt(c.x, lookY, c.z); return cam.position; };
  return { r, bb, walls, view, c };
}

const fitH = (o, h) => { const b = new THREE.Box3().setFromObject(o), y = b.max.y - b.min.y; if (y > 0.01) o.scale.multiplyScalar(h / y); return o; };
const fitTo = (o, len) => { const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), m = Math.max(sz.x, sz.z); if (m > 0.01) o.scale.multiplyScalar(len / m); return o; };
// Random flat spots on the floor or low furniture tops that the camera can actually see.
function spotsOn(r, bb, cam, n, { maxY = 1.2, minSep = 0.9, size = 0.25, lift = 0.2 } = {}) {
  const ray = new THREE.Raycaster(), out = [], meshes = [], down = new THREE.Vector3(0, -1, 0); r.traverse(o => o.isMesh && meshes.push(o));
  r.updateMatrixWorld(true); cam.updateMatrixWorld();
  const top = bb.min.y + 2.45, hitAt = (x, z) => { ray.set(new THREE.Vector3(x, top, z), down); ray.far = 3; return ray.intersectObjects(meshes, false)[0]; };
  for (let k = 0; k < 600 && out.length < n; k++) {
    const x = bb.min.x + 0.4 + Math.random() * (bb.max.x - bb.min.x - 0.8), z = bb.min.z + 0.4 + Math.random() * (bb.max.z - bb.min.z - 0.8);
    const h = hitAt(x, z); if (!h || !h.face) continue;
    if (h.face.normal.clone().transformDirection(h.object.matrixWorld).y < 0.85 || h.point.y - bb.min.y > maxY) continue;
    if ([[size, 0], [-size, 0], [0, size], [0, -size]].some(([dx, dz]) => { const q = hitAt(x + dx, z + dz); return !q || Math.abs(q.point.y - h.point.y) > 0.04; })) continue;
    if (out.some(p => p.distanceTo(h.point) < minSep)) continue;
    const tgt = h.point.clone().add(new THREE.Vector3(0, lift, 0)), dir = tgt.clone().sub(cam.position), dist = dir.length();
    ray.set(cam.position, dir.normalize()); ray.far = dist; const blk = ray.intersectObjects(meshes, false)[0]; if (blk && blk.distance < dist - 0.15) continue;
    out.push(h.point.clone());
  }
  return out;
}
export const B2 = {};

// ---------- Cat Rescue: the ladder tip follows your finger (at machine speed) ----------
B2.cat = async (S, ctx) => {
  const L = ctx.level, catH = [5.5, 7, 9][L], reach = [0.9, 0.75, 0.6][L], limit = [60, 55, 50][L];
  S.camera.position.set(6, 5, 15); S.camera.lookAt(0, catH * 0.55, 0);
  let perch;
  if (L === 0) { const t = tree(catH - 0.6); S.scene.add(at(t, 1.5, 0, -1)); perch = new THREE.Vector3(0.6, catH, -0.6); }
  else if (L === 1) { S.scene.add(at(box(8, catH - 0.3, 6, '#e6c9a0'), 1.5, (catH - 0.3) / 2, -3), at(box(8.6, 0.4, 6.6, '#8a4a3a'), 1.5, catH - 0.1, -3), at(box(2.4, 0.9, 0.2, '#d8362d'), 1.5, 2.8, 0.05)); perch = new THREE.Vector3(0.4, catH + 0.1, 0.1); }
  else { S.scene.add(at(cyl(0.12, 0.16, catH, '#5d6066', 10), 1, catH / 2, -0.5), at(box(1.6, 0.14, 0.4, '#5d6066'), 0.4, catH, -0.5), at(sph(0.25, new THREE.MeshBasicMaterial({ color: '#fff4c0' })), -0.2, catH - 0.2, -0.5)); perch = new THREE.Vector3(0.2, catH + 0.07, -0.5); }
  const cat = at(kitty(), perch.x, perch.y, perch.z); cat.rotation.y = 0.6; S.scene.add(cat);
  const truck = new THREE.Group(); truck.add(at(box(2.6, 1.4, 6, C.red), 0, 1.1, 0), at(box(2.62, 0.2, 6.02, '#f2f1ec'), 0, 0.8, 0)); for (const [x, z] of [[-1.2, 2], [1.2, 2], [-1.2, -2], [1.2, -2]]) { const w = at(cyl(0.45, 0.45, 0.3, '#222'), x, 0.45, z); w.rotation.z = Math.PI / 2; truck.add(w); }
  S.scene.add(at(truck, -5, 0, 3));
  const base = new THREE.Vector3(-5, 2.1, 3.5), ladder = at(box(0.7, 0.18, 1, '#c0c4c8'), 0, 0, 0); S.scene.add(ladder, at(cyl(0.6, 0.7, 0.4, '#8a8f94'), base.x, base.y - 0.1, base.z));
  const tip = base.clone().add(new THREE.Vector3(1.5, 1.5, -1)), want = tip.clone();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(S.camera.getWorldDirection(new THREE.Vector3()).negate(), perch);
  const aim = p => { const v = S.rayPlane(p.ndc, plane); if (v) want.copy(v); };
  S.on('down', aim); S.on('move', p => p.pressed && aim(p));
  let hold = 0, time = limit, saved = false, bumps = 0, wob = 0;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    const d = want.clone().sub(tip), maxS = 3.2 * dt; if (d.length() > maxS) d.setLength(maxS); if (act && !saved) tip.add(d);
    const v = tip.clone().sub(base), len = v.length(); ladder.position.copy(base).addScaledVector(v, 0.5); ladder.scale.set(1, 1, len); ladder.lookAt(tip);
    wob = Math.max(0, wob - dt); cat.rotation.z = Math.sin(t * 30) * wob * 0.4;
    if (!act) return;
    const dc = tip.distanceTo(perch);
    if (!saved) {
      if (dc < 1.4 && d.length() / dt > 2.6 && wob <= 0) { bumps++; wob = 0.8; ctx.sfx.bad(); }
      hold = dc < reach ? hold + dt : 0;
      if (hold > 0.7) { saved = true; ctx.sfx.good(); }
      time -= dt;
    } else { cat.position.lerp(tip.clone().add(new THREE.Vector3(0, 0.1, 0)), Math.min(1, dt * 6)); if (cat.position.distanceTo(tip) < 0.3) win(); }
    ch.set(`${icon('pets', 28, C.hv)}${saved ? 'Got it!' : dc < reach ? 'Hold still…' : Math.round(dc * 10) / 10 + ' m'}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (time <= 0 || bumps >= 3) fail();
  });
  return {};
};

// ---------- Supply Drop: pull back and let go ----------
B2.drop = async (S, ctx) => {
  const L = ctx.level, dist = [16, 20, 24][L], wind = [0, 1.6, -2.8][L];
  S.camera.position.set(0, 4.2, 9); S.camera.lookAt(0, 1, -dist * 0.6);
  S.scene.add(at(box(40, 3, dist - 6, '#3f6fa0'), 0, -1.45, -dist / 2 - 1), at(box(40, 0.3, 1.2, '#8a8f94'), 0, 0.05, -2.8), at(box(40, 0.3, 1.2, '#8a8f94'), 0, 0.05, -dist + 2.8));
  S.scene.children.forEach(o => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') o.position.y = 0; });
  const matT = at(cyl(2, 2, 0.1, C.hv, 24), wind * 0.8, 0.06, -dist); S.scene.add(matT, at(cyl(1.1, 1.1, 0.12, C.red, 24), wind * 0.8, 0.07, -dist));
  const walker = new THREE.Group(); walker.add(at(cyl(0.25, 0.25, 1.1, '#2f88c4', 10), 0, 0.9, 0), at(sph(0.22, '#e8c39e'), 0, 1.65, 0)); S.scene.add(at(walker, wind * 0.8 + 3, 0, -dist - 1));
  const sling = new THREE.Group(); sling.add(at(box(0.3, 1.6, 0.3, '#7a5a3a'), -0.6, 0.8, 0), at(box(0.3, 1.6, 0.3, '#7a5a3a'), 0.6, 0.8, 0)); S.scene.add(at(sling, 0, 0, 4));
  const crate = at(box(0.7, 0.7, 0.7, '#c49a5a'), 0, 1.6, 4); crate.add(at(box(0.72, 0.15, 0.72, C.red), 0, 0, 0)); S.scene.add(crate);
  const dots = Array.from({ length: 14 }, () => { const m = sph(0.08, new THREE.MeshBasicMaterial({ color: '#f2f1ec' })); m.visible = false; S.scene.add(m); return m; });
  const flag = at(box(1.2, 0.5, 0.05, C.hv), 0, 5, -dist * 0.5); S.scene.add(flag, at(cyl(0.05, 0.05, 5, '#555'), -0.6, 2.5, -dist * 0.5));
  let pull = null, fly = null, tries = 0, landed = false;
  const V = p => { const dx = (p.x - pull.x) / 60, dy = (p.y - pull.y) / 60, pw = Math.min(1, Math.hypot(dx, dy) / 3.2); return new THREE.Vector3(-dx * 2.2, 3 + pw * 6.5, -(1 + Math.max(0, dy) * 3.6)); };
  S.on('down', p => { if (!fly) pull = { x: p.x, y: p.y, v: new THREE.Vector3(0, 3, -1) }; });
  S.on('move', p => { if (pull) pull.v = V(p); });
  S.on('up', () => { if (pull && pull.v.z < -1.5) { fly = { p: crate.position.clone(), v: pull.v.clone() }; ctx.sfx.thud(); } pull = null; dots.forEach(d => (d.visible = false)); });
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    flag.rotation.y = wind ? Math.sin(t * 6) * 0.2 : 0; flag.position.x = wind * 0.25;
    if (!act) return;
    if (pull) { const q = crate.position.clone(), v = pull.v.clone(); dots.forEach((d, i) => { d.visible = true; for (let s = 0; s < 3; s++) { v.y -= 9.8 * 0.02; q.addScaledVector(v, 0.02); } d.position.copy(q); }); }
    if (fly) {
      fly.v.y -= 9.8 * dt; fly.v.x += wind * dt; fly.p.addScaledVector(fly.v, dt); crate.position.copy(fly.p); crate.rotation.x += dt * 3;
      if (fly.p.y <= 0.35) {
        const hit = fly.p.z < -dist + 3 && fly.p.z > -dist - 3 && Math.hypot(fly.p.x - matT.position.x, fly.p.z - matT.position.z) < 2.2;
        const onLand = fly.p.z < -dist + 3.4 || fly.p.z > -2.2;
        if (hit) { landed = true; ctx.sfx.good(); crate.position.y = 0.35; fly = null; setTimeout(win, 500); }
        else { tries++; ctx.sfx[onLand ? 'thud' : 'splash'](); fly = null; setTimeout(() => { crate.position.set(0, 1.6, 4); crate.rotation.set(0, 0, 0); }, 600); if (tries >= 3) setTimeout(fail, 700); }
      }
    }
    ch.set(`${icon('medical_services', 28, C.hv)}${landed ? 'Delivered!' : 'Throws'} ${hearts(tries)}${bar}${icon('air', 26)}${wind ? (wind > 0 ? '→ ' : '← ') + Math.abs(wind).toFixed(1) : 'No wind'}`);
  });
  return {};
};

// ---------- Torch Hunt: dark room, torch follows your finger ----------
B2.torch = async (S, ctx) => {
  const L = ctx.level, need = [7, 9, 11][L];
  const { r, bb, view } = await room(S, ['room_blue_bedroom', 'room_office', 'room_brown_lounge'][L]);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
  view(S.camera);
  S.scene.background = new THREE.Color('#0b0c10'); S.hemi.intensity = 0.06; S.sun.intensity = 0.02;
  const spot = new THREE.SpotLight('#fff3cf', 60, 18, 0.28, 0.4, 1.4); spot.position.copy(S.camera.position); S.scene.add(spot, spot.target);
  const { loadAnimals } = await import('./city-assets.js'); const SU = await import('three/addons/utils/SkeletonUtils.js');
  let src = null; try { src = (await loadAnimals()).get('animal_chick'); } catch (e) {}
  const spots = spotsOn(r, bb, S.camera, need, { lift: 0.12, minSep: 0.6, size: 0.14 });
  const kits = spots.map((p, i) => {
    const t = new THREE.Group(); let body;
    if (src) { body = SU.clone(src.scene); const mx = new THREE.AnimationMixer(body), c = src.clips[0]; if (c) { const a = mx.clipAction(c); a.time = Math.random() * c.duration; a.play(); } t.userData.mx = mx; fitTo(body, 0.3); t.userData.ph = Math.random() * 6; } else body = kitty();
    t.add(body);
    t.position.copy(p); t.lookAt(S.camera.position.x, p.y, S.camera.position.z); t.userData.toy = true; S.scene.add(t); return t;
  });
  const aim = new THREE.Vector3(cx, 0, cz), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(bb.min.y + 0.1));
  let found = 0;
  const lit = o => { const d = o.position.clone().sub(spot.position).normalize(), a = spot.target.position.clone().sub(spot.position).normalize(); return d.angleTo(a) < spot.angle * 1.1; };
  S.on('move', p => { const v = S.rayPlane(p.ndc, floor); if (v) aim.copy(v); });
  S.on('down', p => {
    const v = S.rayPlane(p.ndc, floor); if (v) aim.copy(v);
    const h = S.pick(p.ndc, kits.filter(t => t.visible)); if (!h) return;
    let o = h.object; while (o && !o.userData.toy) o = o.parent;
    if (o && lit(o)) { o.userData.gone = 1; found++; ctx.sfx.good(); }
  });
  const ch = chip(S), win = once(ctx.win);
  S.onTick((dt, t, act) => {
    spot.target.position.lerp(aim, Math.min(1, dt * 10));
    kits.forEach(k => { k.userData.mx && k.userData.mx.update(dt); if (!k.userData.gone && k.children[0]) { k.children[0].position.y = Math.abs(Math.sin(t * 4 + (k.userData.ph || 0))) * 0.05; k.children[0].rotation.y = Math.sin(t * 1.3 + (k.userData.ph || 0)) * 0.6; } if (k.userData.gone) { k.userData.gone -= dt * 2; k.position.y += dt * 1.2; k.scale.setScalar(Math.max(0.001, k.userData.gone)); if (k.userData.gone <= 0) k.visible = false; } });
    if (!act) { aim.set(cx + Math.sin(t * 0.6) * sx * 0.3, 0, cz + Math.cos(t * 0.5) * sz * 0.3); return; }
    ch.set(`${icon('flutter_dash', 28, C.hv)}Find the chicks${bar}<span style="display:flex;gap:6px">${pips(found, kits.length)}</span>`);
    if (found >= kits.length) win();
  });
  return {};
};

// ---------- Fire Line: draw a break before the fire reaches the houses ----------
B2.line = async (S, ctx) => {
  const treesM = [];
  const L = ctx.level, GW = 26, GH = 16, CELL = 1, ink = [48, 40, 34][L], rate = [0.55, 0.45, 0.36][L];
  S.camera.position.set(0, 21, 12); S.camera.lookAt(0, 0, 0.5);
  const COL = { g: new THREE.Color('#79b24f'), b: new THREE.Color('#ff7a1a'), x: new THREE.Color('#3a302a'), w: new THREE.Color('#8a6b4a') };
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.96, 0.2, CELL * 0.96), new THREE.MeshLambertMaterial(), GW * GH); im.receiveShadow = true; S.scene.add(im);
  const st = new Array(GW * GH).fill('g'), age = new Float32Array(GW * GH), m4 = new THREE.Matrix4();
  const X = i => (i % GW - GW / 2 + 0.5) * CELL, Z = i => (Math.floor(i / GW) - GH / 2 + 0.5) * CELL;
  for (let i = 0; i < GW * GH; i++) { m4.makeTranslation(X(i), 0.1, Z(i)); im.setMatrixAt(i, m4); im.setColorAt(i, COL.g); }
  const HM = ['sp_house_01_c1', 'sp_house_02_c2', 'sp_house_03_c3', 'house_01_v1', 'house_04_v1'];
  const houses = [5, 13, 20].map((c, k) => { const m = S.model && S.model(HM[(k + L) % HM.length]); let g; if (m) { g = fitTo(m, 2.6); } else { g = new THREE.Group(); g.add(at(box(1.8, 1.2, 1.4, '#e6dccb'), 0, 0.8, 0)); } g.rotation.y = Math.PI; S.scene.add(at(g, X(c), 0.2, Z((GH - 2) * GW) + 0.4)); return (GH - 2) * GW + c; });
  if (S.model) { const TM = ['tree_v1', 'tree_v3', 'tree_v5', 'tree1_v2', 'sp_fir_tree']; for (let k = 0; k < 16; k++) { const m = S.model(TM[k % TM.length]); if (!m) break; fitTo(m, 0.9 + Math.random() * 0.4); const i = Math.floor(Math.random() * GW * (GH - 5)); m.position.set(X(i) + (Math.random() - 0.5) * 0.4, 0.2, Z(i)); m.userData.cell = i; S.scene.add(m); treesM.push(m); } const eng = S.model('rg_firetruck'); if (eng) { fitTo(eng, 3.2); eng.position.set(X(GW - 1) + 1.2, 0.2, Z((GH - 1) * GW)); eng.rotation.y = -Math.PI / 2; S.scene.add(eng); } }
  const flames = []; const setC = (i, s) => { st[i] = s; age[i] = 0; im.setColorAt(i, COL[s]); im.instanceColor.needsUpdate = true; if (s === 'b' || s === 'x') treesM.forEach(m => { if (m.userData.cell === i) m.visible = false; }); if (s === 'b') { const f = flame(0.7, false, { smoke: i % 3 === 0 }); f.position.set(X(i), 0.2, Z(i)); f.userData.cell = i; S.scene.add(f); flames.push(f); } };
  const starts = L === 0 ? [11, 12, 13, 14] : L === 1 ? [4, 5, 18, 19, 20] : [3, 4, 11, 12, 20, 21, 22];
  starts.forEach(c => setC(c, 'b'));
  let used = 0, spreadT = 0, drawing = false;
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
  const paint = p => { if (used >= ink) return; const v = S.rayPlane(p.ndc, floor); if (!v) return; const cx = Math.floor(v.x / CELL + GW / 2), cz = Math.floor(v.z / CELL + GH / 2); if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return; const i = cz * GW + cx; if (st[i] === 'g') { setC(i, 'w'); used++; ctx.sfx.tap(); } };
  S.on('down', p => { drawing = true; paint(p); }); S.on('move', p => drawing && paint(p)); S.on('up', () => (drawing = false));
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    flames.forEach(f => f.userData.tick(t));
    if (!act) return;
    spreadT += dt;
    if (spreadT > rate) {
      spreadT = 0; const burning = []; for (let i = 0; i < st.length; i++) if (st[i] === 'b') burning.push(i);
      for (const i of burning) {
        age[i] += 1; const x = i % GW, z = Math.floor(i / GW);
        const nb = [[0, 1, 0.75], [1, 0, 0.35], [-1, 0, 0.35], [0, -1, 0.12]];
        for (const [dx, dz, pr] of nb) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue; const j = nz * GW + nx; if (st[j] === 'g' && Math.random() < pr) setC(j, 'b'); }
        if (age[i] > 3) { st[i] = 'x'; im.setColorAt(i, COL.x); im.instanceColor.needsUpdate = true; const f = flames.find(f => f.userData.cell === i); if (f) { S.scene.remove(f); flames.splice(flames.indexOf(f), 1); } }
      }
      if (houses.some(h => st[h] === 'b' || st[h] === 'x' || st[h - GW] === 'b')) { ctx.sfx.bad(); fail(); }
      else if (!st.includes('b')) win();
    }
    ch.set(`${icon('draw', 28, C.hv)}${meter(1 - used / ink, '#8a6b4a', 140)}${bar}${icon('cottage', 26)}3 safe`);
  });
  return {};
};

// ---------- Smoke Out: open windows to clear the smoke, then find your friend ----------
B2.smoke = async (S, ctx) => {
  const L = ctx.level, nW = [3, 4, 5][L];
  const { r, bb, view, walls } = await room(S, ['room_yellow_lounge', 'room_pink_sitting', 'room_brown_lounge'][L]);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
  view(S.camera, 0.8, 3.2, 1);
  const WL = walls.length ? walls : [[-1, 0], [0, -1]];
  S.scene.background = new THREE.Color('#6d6e6b'); S.scene.fog = new THREE.FogExp2('#7a7b78', 0.3);
  const wins = [];
  for (let i = 0; i < nW; i++) {
    const [wx, wz] = WL[i % WL.length], per = Math.ceil(nW / WL.length), k = (Math.floor(i / WL.length) + 1) / (per + 1) - 0.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.4), new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false, side: THREE.DoubleSide }));
    m.position.set(wx ? cx + wx * (sx / 2 - 0.12) : cx + k * sx * 0.9, 1.6, wz ? cz + wz * (sz / 2 - 0.12) : cz + k * sz * 0.9); m.rotation.y = wx ? -wx * Math.PI / 2 : (wz > 0 ? Math.PI : 0);
    m.userData.win = true; S.scene.add(m); wins.push(m);
  }
  const friend = new THREE.Group(); friend.userData.friend = true; let fmx = null;
  try { const { loadPeople } = await import('./city-assets.js'), SU = await import('three/addons/utils/SkeletonUtils.js'), P = await loadPeople('./assets/', ['person_casual2_female']), src = P.get('person_casual2_female'); const o = SU.clone(src.scene); fmx = new THREE.AnimationMixer(o); const c = src.clips.find(k => /wave/i.test(k.name)) || src.clips.find(k => k.name === 'Idle') || src.clips[0]; if (c) fmx.clipAction(c).play(); friend.add(o); } catch (e) { friend.add(at(cyl(0.18, 0.2, 0.7, C.blue, 10), 0, 0.35, 0), at(sph(0.17, '#e8c39e'), 0, 0.85, 0)); }
  const fs = spotsOn(r, bb, S.camera, 1, { maxY: 0.15, size: 0.3, lift: 1 })[0]; friend.position.copy(fs || new THREE.Vector3(bb.min.x + sx * 0.4, bb.min.y, bb.min.z + sz * 0.35)); friend.lookAt(S.camera.position.x, friend.position.y, S.camera.position.z); S.scene.add(friend);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: C.hv, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(friend.position).add(new THREE.Vector3(0, 0.03, 0)); S.scene.add(ring);
  let open = 0, dens = 0.3, found = false;
  S.on('down', p => {
    const h = S.pick(p.ndc, [...wins.filter(w => !w.userData.open), friend]); if (!h) return;
    let o = h.object; while (o && !o.userData.win && !o.userData.friend) o = o.parent;
    if (o && o.userData.win) { o.userData.open = true; o.material.color.set('#bfe6ff'); open++; ctx.sfx.hiss(); }
    else if (o && o.userData.friend && dens < 0.1) { found = true; ctx.sfx.good(); }
  });
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    const target = 0.3 * (1 - open / nW) + 0.02; dens += (target - dens) * Math.min(1, dt * 1.5); S.scene.fog.density = dens;
    wins.forEach(w => { if (!w.userData.open) w.material.color.setHSL(0.09, 1, 0.75 + Math.sin(t * 4) * 0.08); else w.scale.x = Math.max(0.15, w.scale.x - dt * 2); });
    if (!act) return;
    fmx && fmx.update(dt); ring.material.opacity = dens < 0.1 && !found ? 0.6 + Math.sin(t * 5) * 0.3 : 0;
    ch.set(`${icon('window', 28, C.hv)}<span style="display:flex;gap:6px">${pips(open, nW)}</span>${bar}${icon('person_search', 26, found ? C.hv : '')}${found ? 'Found!' : dens < 0.1 ? 'Tap your friend' : 'Open the windows'}`);
    if (found) win();
  });
  return {};
};

// ---------- Hazard Hunt: tap every fire danger in the room ----------
B2.hazard = async (S, ctx) => {
  const L = ctx.level, need = [5, 6, 7][L];
  const IDS = ['hazard_overloaded_socket', 'hazard_candle_curtain', 'hazard_iron_left_on', 'hazard_heater_towel', 'hazard_cigarette_sofa', 'hazard_extension_daisy', 'hazard_alarm_no_battery', 'hazard_ebike_battery', 'hazard_frayed_cable', 'hazard_clutter', 'hazard_gas_cylinder'].sort(() => Math.random() - 0.5).slice(0, need);
  const [{ r, bb, view }, P] = await Promise.all([room(S, ['room_yellow_lounge', 'room_kitchen_diner', 'room_brown_lounge'][L]), loadPack('hazards', './assets/', IDS)]);
  view(S.camera, 0.85, 3.4, 0.7); S.camera.updateMatrixWorld();
  const spots = spotsOn(r, bb, S.camera, need * 4, { minSep: 1.1, size: 0.3, lift: 0.3 }), meshes = []; r.traverse(o => o.isMesh && meshes.push(o));
  const ray = new THREE.Raycaster(), hz = [];
  for (const id of IDS) {
    const o = P.get(id).clone(true); o.userData.hz = true; o.rotation.y = Math.random() * 6.28;
    for (let k = 0; k < spots.length; k++) {
      const p = spots[k]; if (!p || hz.some(q => q.position.distanceTo(p) < 1.1)) continue;
      o.position.copy(p); o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), dir = c.clone().sub(S.camera.position), d = dir.length();
      ray.set(S.camera.position, dir.normalize()); ray.far = d; const blk = ray.intersectObjects(meshes, false)[0]; if (blk && blk.distance < d - 0.2) continue;
      spots[k] = null; S.scene.add(o); hz.push(o); break;
    }
  }
  let fixed = 0;
  S.on('down', p => {
    const h = S.pick(p.ndc, hz.filter(o => o.visible && !o.userData.fix)); if (!h) return;
    let o = h.object; while (o && !o.userData.hz) o = o.parent; if (!o) return;
    ctx.sfx.good(); fixed++; o.userData.fix = 1;
    const tick = S.div(`position:absolute;left:${p.x - 32}px;top:${p.y - 32}px;width:64px;height:64px;border-radius:50%;background:${C.hv};color:${C.ink};display:flex;align-items:center;justify-content:center;transition:transform .5s,opacity .5s`, icon('check', 44));
    setTimeout(() => { tick.style.transform = 'translateY(-40px)'; tick.style.opacity = 0; }, 500); setTimeout(() => tick.remove(), 1100);
  });
  const ch = chip(S), win = once(ctx.win);
  S.onTick((dt, t, act) => {
    hz.forEach(o => { if (o.userData.fix) { o.userData.fix -= dt * 2.5; o.scale.setScalar(Math.max(0.001, o.userData.fix)); if (o.userData.fix <= 0) o.visible = false; } });
    if (!act) return;
    ch.set(`${icon('search', 28, C.hv)}<span style="display:flex;gap:6px">${pips(fixed, hz.length)}</span>`);
    if (fixed >= hz.length) win();
  });
  return {};
};

// ---------- Sandbag Wall: drag bags into the gaps before the water arrives ----------
B2.sand = async (S, ctx) => {
  const L = ctx.level, cols = [5, 6, 7][L], rows = 2, limit = [40, 36, 32][L];
  S.camera.position.set(0, 4.5, 9); S.camera.lookAt(0, 0.6, 0);
  S.scene.add(at(box(9, 4, 0.4, '#e6c9a0'), 0, 2, -2.5), at(box(2, 2.4, 0.1, '#5b3d2a'), 0, 1.2, -2.25), at(box(3.6, 0.8, 0.12, C.red), 0, 3.1, -2.25), at(box(10, 0.1, 3, '#b7b4ab'), 0, 0.05, -1));
  const water = at(new THREE.Mesh(new THREE.BoxGeometry(40, 1, 12), new THREE.MeshLambertMaterial({ color: '#3f86b8', transparent: true, opacity: 0.85 })), 0, -0.6, 7); S.scene.add(water);
  const bagGeo = new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), bagMat = mat('#c9a86a');
  const bag = () => { const m = new THREE.Mesh(bagGeo, bagMat); m.rotation.z = Math.PI / 2; m.castShadow = true; return m; };
  const slots = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = (c - (cols - 1) / 2) * 1.02 + (r ? 0.3 : 0), y = 0.3 + r * 0.42; const ghost = at(new THREE.Mesh(bagGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 })), x, y, 0.8); ghost.rotation.z = Math.PI / 2; S.scene.add(ghost); slots.push({ x, y, z: 0.8, ghost, full: false, r }); }
  for (let i = 0; i < 6; i++) S.scene.add(at(bag(), 4.2 + (i % 3) * 0.2, 0.25 + Math.floor(i / 3) * 0.4, -0.6 + (i % 2) * 0.3));
  let held = null; const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.8);
  S.on('down', p => { held = bag(); S.scene.add(held); const v = S.rayPlane(p.ndc, plane); if (v) held.position.copy(v); ctx.sfx.tap(); });
  S.on('move', p => { if (held) { const v = S.rayPlane(p.ndc, plane); if (v) held.position.copy(v); } });
  S.on('up', () => {
    if (!held) return; const free = slots.filter(s => !s.full && (s.r === 0 || slots.filter(q => q.r === 0 && !q.full).length === 0 || true));
    let best = null, bd = 1.6; for (const s of free) { const d = Math.hypot(s.x - held.position.x, s.y - held.position.y); if (d < bd) { bd = d; best = s; } }
    if (best) { best.full = true; best.ghost.material = bagMat; held.removeFromParent(); ctx.sfx.thud(); } else held.removeFromParent();
    held = null;
  });
  let time = limit;
  const ch = chip(S), win = once(ctx.win), fail = once(ctx.fail);
  S.onTick((dt, t, act) => {
    water.position.y = -0.6 + (1 - time / limit) * 1.0 + Math.sin(t * 2) * 0.03;
    water.position.z = 7 - (1 - time / limit) * 4.8;
    if (!act) return;
    time -= dt; const n = slots.filter(s => s.full).length;
    ch.set(`${icon('waves', 28, '#8fd0f5')}${n} / ${slots.length}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (n === slots.length) win(); else if (time <= 0) { ctx.sfx.splash(); fail(); }
  });
  return {};
};

// ---------- Foam Mixer: match the colour with three sliders ----------
B2.foam = async (S, ctx) => {
  const L = ctx.level, tol = [0.16, 0.12, 0.09][L], limit = [40, 35, 30][L];
  S.camera.position.set(0, 2.2, 6); S.camera.lookAt(0, 1.5, 0);
  S.scene.add(at(box(12, 5, 0.2, '#cfd3d6'), 0, 2.5, -1.2));
  const tank = at(cyl(0.9, 0.9, 2.2, new THREE.MeshLambertMaterial({ color: '#888' }), 24), -1.4, 1.2, 0), cap = at(cyl(0.95, 0.95, 0.15, '#8a8f94', 24), -1.4, 2.35, 0), goal = at(cyl(0.6, 0.6, 1.4, new THREE.MeshLambertMaterial({ color: '#888' }), 24), 1.6, 0.8, 0);
  S.scene.add(tank, cap, goal, at(box(1.6, 0.1, 1.6, '#555'), 1.6, 0.05, 0));
  const T = [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6], V = [0.5, 0.5, 0.5];
  goal.material.color.setRGB(T[0], T[1], T[2]);
  const panel = S.div('position:absolute;right:40px;top:120px;width:300px;border-radius:16px;background:#1c1d1f;padding:22px;display:flex;flex-direction:column;gap:18px;pointer-events:auto');
  const cols = ['#d8362d', '#4caf50', '#2f88c4'];
  const sl = cols.map((c, i) => { const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = 50; r.style.cssText = `width:100%;height:44px;accent-color:${c}`; r.addEventListener('input', () => (V[i] = r.value / 100)); const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:12px'; row.innerHTML = `<span style="width:32px;height:32px;border-radius:8px;background:${c};flex-shrink:0"></span>`; row.appendChild(r); panel.appendChild(row); return r; });
  const mixB = document.createElement('div'); mixB.style.cssText = `height:72px;border-radius:12px;background:${C.hv};color:${C.ink};display:flex;align-items:center;justify-content:center;gap:10px;font-weight:900;font-stretch:125%;font-size:26px;text-transform:uppercase;cursor:pointer`; mixB.innerHTML = icon('science', 36) + 'Mix'; panel.appendChild(mixB);
  const sp = spray(S, { from: new THREE.Vector3(-0.5, 1.8, 0), color: '#ffffff', rate: 60 }); sp.target.set(1.6, 1.6, 0);
  let time = limit, tries = 0, ok = false;
  const diff = () => Math.hypot(V[0] - T[0], V[1] - T[1], V[2] - T[2]);
  const win = once(ctx.win), fail = once(ctx.fail);
  mixB.addEventListener('pointerdown', () => { if (!S.active || S.paused || ok) return; if (diff() < tol) { ok = true; ctx.sfx.good(); sp.on = true; sp.from.set(-0.5, 1.8, 0); setTimeout(win, 1200); } else { tries++; ctx.sfx.bad(); if (tries >= 3) fail(); } });
  const ch = chip(S);
  S.onTick((dt, t, act) => {
    tank.material.color.setRGB(V[0], V[1], V[2]); sp.onHit = null;
    if (!act) return;
    if (!ok) time -= dt;
    const close = Math.max(0, 1 - diff() / 0.8);
    ch.set(`${icon('palette', 28, C.hv)}${meter(close, close > 1 - tol / 0.8 ? '#4caf50' : '#e5e043', 140)}${bar}${hearts(tries)}${bar}${icon('timer', 26)}${Math.max(0, Math.ceil(time))}s`);
    if (time <= 0 && !ok) fail();
  });
  return {};
};
