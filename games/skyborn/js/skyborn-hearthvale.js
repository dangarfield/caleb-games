// Hearthvale set dressing: cities, towns, roads, roosts, vistas, statues, chests, camps, ring run, landmarks.
import * as THREE from 'three';
import { height, toWorld, toUV, place, PLACES, RIVER, hash2, placeY, nestGround } from './skyborn-worldgen.js';
import { buildEmber, buildGriffinKnight } from './skyborn-models.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.85, metalness: o.m ?? 0, flatShading: o.flat ?? true, emissive: o.e ?? 0, emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide });
const H = (x, z) => Math.max(height(...toUV(x, z)), 0);
const at = id => { const p = place(id); const [x, z] = toWorld(p.u, p.v); return { x, z, y: H(x, z) }; };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
let sd = 99; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
const shadow = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

export function buildHearthvale(scene, props) {
  const root = new THREE.Group(), anim = []; scene.add(root);
  const stone = std(0xc2b49a), dstone = std(0x8e8270), wood = std(0x7a5532), white = std(0xf1ece2), gold = std(0xe2b64a, { m: 0.3, r: 0.4 }), slate = std(0x5f6470);
  const statueMat = std(0xb9b2a3, { r: 0.95 });
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; root.add(shadow(m)); return m; };

  // Houses for every settlement (one instanced draw)
  const wallG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofG = new THREE.CylinderGeometry(0.62, 0.62, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.27, 0);
  // One instanced pair per settlement: no shared cap, and each town culls on its own.
  const wallMat = std(0xffffff), roofMat = std(0xffffff); let walls = null, roofs = null, nh = 0, MAXH = 0;
  const beginTown = n => { MAXH = n; nh = 0; walls = new THREE.InstancedMesh(wallG, wallMat, n); roofs = new THREE.InstancedMesh(roofG, roofMat, n); };
  const endTown = () => { walls.count = roofs.count = nh; if (!nh) return; [walls, roofs].forEach(m => { m.userData.town = true; m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); root.add(m); }); };
  const STY = {
    hearthvale: [[0xf1ece2, 0xe8dcc4, 0xd9c8a8, 0xf4e6cf], [0xa8452f, 0x8e3b2a, 0x6b4a3a, 0x5f6470, 0xb85a36]],
    cinder: [[0x6a5a50, 0x5a4a42, 0x7a6658, 0x4e423c], [0x3a302c, 0x2e2622, 0x8a3a1c, 0x4a3b35, 0x5e4a3a]],
    frostfang: [[0x8a6a4a, 0x7a5c40, 0x9c7a56, 0xb8c8d6], [0xf2f5fa, 0xe6eef6, 0xdfe8f2, 0xf8fbff, 0xcfdcea]],
    stormcrown: [[0x6a6878, 0x7a788a, 0x5a5868, 0x8a879a], [0x3e3c4a, 0x2f2d3a, 0x4a4858, 0x575566, 0x343242]],
    reach: [[0xf4f1e6, 0xfbf8ee, 0xe9e2cf, 0xf0e8d8], [0x3a8fb0, 0x5fc7c0, 0x2f6f8a, 0xe2b64a, 0x4aa0b8]],
    sky: [[0xffffff, 0xf6f2ff, 0xfdf8ec, 0xf0ecf8], [0xe2b64a, 0xd9a83a, 0xf0c860, 0xc99a30, 0xe8c050]]
  };
  const house = (x, z, ry, w, d, h, st = 'hearthvale') => { const [WALLC, ROOFC] = STY[st] || STY.hearthvale;
    if (nh >= MAXH) return; const y = H(x, z) - 1;
    E.set(0, ry, 0); Q.setFromEuler(E);
    M4.compose(V.set(x, y, z), Q, S.set(w, h, d)); walls.setMatrixAt(nh, M4); walls.setColorAt(nh, C.setHex(WALLC[(rnd() * 4) | 0]));
    M4.compose(V.set(x, y + h, z), Q, S.set(w * 1.05, h * 0.9, d * 1.08)); roofs.setMatrixAt(nh, M4); roofs.setColorAt(nh, C.setHex(ROOFC[(rnd() * 5) | 0])); nh++;
  };
  PLACES.filter(p => ['city', 'town', 'village', 'hamlet'].includes(p.kind) && !p.alt).forEach(p => {
    const [cx, cz] = toWorld(p.u, p.v), n = Math.round(10 + p.size * (p.kind === 'city' ? 460 : 300)); beginTown(n); townBody(p, cx, cz, n); endTown();
  });
  function townBody(p, cx, cz, n) { const R = p.kind === 'city' ? 310 : 70 + p.size * 340, ang = hash2(p.u * 1e3 | 0, 3) * 3;
    for (let i = 0, k = 0; i < n * 4 && k < n; i++) {
      const r = Math.sqrt(rnd()) * R, a = rnd() * 6.283; let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (p.kind === 'city') { const gx = Math.round((x - cx) / 26), gz = Math.round((z - cz) / 20); if ((gx % 4) === 0 || (gz % 5) === 0) continue; x = cx + gx * 26 * Math.cos(ang) - gz * 20 * Math.sin(ang) + (rnd() - 0.5) * 6; z = cz + gx * 26 * Math.sin(ang) + gz * 20 * Math.cos(ang) + (rnd() - 0.5) * 6; }
      const y = H(x, z); if (y < 3 || Math.abs(H(x + 10, z) - y) + Math.abs(H(x, z + 10) - y) > 7) continue;
      const big = p.kind === 'city' ? 1.25 : 1; house(x, z, ang + (p.kind === 'city' ? 0 : rnd() * 3), (8 + rnd() * 6) * big, (10 + rnd() * 8) * big, (6 + rnd() * 5) * big * (p.kind === 'city' ? 1.4 : 1), p.r); k++;
    }
  }

  // Kingsholm: walls, castle, cathedral, bell tower
  const K = at('kingsholm');
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * 6.283, x = K.x + Math.cos(a) * 340, z = K.z + Math.sin(a) * 340, y = H(x, z);
    add(new THREE.BoxGeometry(56, 18, 6), stone, x, y + 7, z, -a + Math.PI / 2);
    if (i % 5 === 0) { add(new THREE.CylinderGeometry(9, 10, 32, 10), stone, x, y + 14, z); add(new THREE.ConeGeometry(11, 16, 10), slate, x, y + 38, z); }
  }
  add(new THREE.BoxGeometry(50, 54, 44), stone, K.x, K.y + 25, K.z);
  [[-28, -24], [28, -24], [-28, 24], [28, 24]].forEach(([dx, dz]) => { add(new THREE.CylinderGeometry(9, 10, 74, 12), stone, K.x + dx, K.y + 35, K.z + dz); add(new THREE.ConeGeometry(12, 26, 12), slate, K.x + dx, K.y + 85, K.z + dz); });
  for (let i = 0; i < 6; i++) { const pole = add(new THREE.CylinderGeometry(0.6, 0.6, 22, 5), wood, K.x - 25 + i * 10, K.y + 62, K.z); const f = add(new THREE.PlaneGeometry(9, 5), std(i % 2 ? 0xd9502e : 0xf2b84a, { side: THREE.DoubleSide }), K.x - 20 + i * 10, K.y + 70, K.z); f.userData.anim = true; anim.push(t => { f.rotation.y = Math.sin(t * 2 + i) * 0.4; }); }
  const cath = { x: K.x + 140 * Math.cos(0.8), z: K.z + 140 * Math.sin(0.8) }; cath.y = H(cath.x, cath.z);
  add(new THREE.BoxGeometry(34, 30, 90), stone, cath.x, cath.y + 15, cath.z, 0.3); add(new THREE.CylinderGeometry(19, 19, 92, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), slate, cath.x, cath.y + 34, cath.z, 0.3);
  add(new THREE.BoxGeometry(18, 60, 18), stone, cath.x + 12, cath.y + 30, cath.z - 44, 0.3); add(new THREE.ConeGeometry(12, 70, 4), slate, cath.x + 12, cath.y + 95, cath.z - 44, 0.3 + Math.PI / 4);
  const bell = at('vista_bell'); add(new THREE.BoxGeometry(16, 80, 16), stone, bell.x, bell.y + 40, bell.z); add(new THREE.ConeGeometry(13, 26, 4), roofsMat(), bell.x, bell.y + 93, bell.z, Math.PI / 4);
  function roofsMat() { return std(0xa8452f); }

  // Gullhaven port
  const G = at('gullhaven');
  add(new THREE.BoxGeometry(260, 6, 18), dstone, G.x + 60, 2, G.z + 160, 0.2);
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group(), hull = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 18), wood), mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 16, 5), wood), sail = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), std(i % 3 ? 0xf1ece2 : 0xc23b2c, { side: THREE.DoubleSide }));
    mast.position.y = 9; sail.position.set(0, 10, 0); sail.rotation.y = Math.PI / 2; b.add(hull, mast, sail); shadow(b);
    const bx = G.x - 60 + i * 34 + (rnd() - 0.5) * 30, bz = G.z + 200 + rnd() * 140; b.userData.anim = true; b.position.set(bx, 0.5, bz); b.rotation.y = rnd() * 6; root.add(b);
    anim.push(t => { b.position.y = 0.5 + Math.sin(t * 1.2 + i) * 0.6; b.rotation.z = Math.sin(t * 0.9 + i) * 0.05; });
  }

  // Windmills around Millbrook + thermal
  const MB = at('millbrook');
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * 6.283 + 0.4, x = MB.x + Math.cos(a) * (420 + rnd() * 200), z = MB.z + Math.sin(a) * (360 + rnd() * 200), y = H(x, z), wm = new THREE.Group(); wm.position.set(x, y, z);
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(4, 6.5, 26, 8), white); tw.position.y = 13; wm.add(tw);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5.8, 8, 8), std(0xa8452f)); cap.position.y = 30; wm.add(cap);
    const blades = new THREE.Group(); blades.position.set(0, 26, 7); wm.add(blades);
    for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(3, 20, 0.5), std(0xe8dcc0)); bl.position.y = 10; const arm = new THREE.Group(); arm.rotation.z = b * Math.PI / 2; arm.add(bl); blades.add(arm); }
    wm.rotation.y = 0.6; wm.userData.anim = true; root.add(shadow(wm)); anim.push(t => { blades.rotation.z = t * 0.9 + i; });
    if (i === 0 && props) props.thermal(x, z, y);
  }
  const sheep = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.6, 3).translate(0, 0.8, 0), std(0xf6f3ea), 260); let ns = 0;
  for (let i = 0; i < 1200 && ns < 260; i++) { const x = MB.x + (rnd() - 0.5) * 1800, z = MB.z + (rnd() - 0.5) * 1400, y = H(x, z); if (y < 4) continue; E.set(0, rnd() * 6, 0); Q.setFromEuler(E); M4.compose(V.set(x, y, z), Q, S.set(1, 1, 1)); sheep.setMatrixAt(ns++, M4); }
  sheep.count = ns; root.add(sheep);

  // Roads between settlements
  const ROADS = [['kingsholm', 'millbrook'], ['kingsholm', 'brindle'], ['millbrook', 'thornby'], ['millbrook', 'ashford'], ['ashford', 'gullhaven'], ['kingsholm', 'dunmere'], ['dunmere', 'tower_bridge'], ['tower_bridge', 'gullhaven'], ['thornby', 'copsey'], ['copsey', 'kingsholm']];
  const roadMat = std(0xc9b48a, { r: 1 });
  ROADS.forEach(([a, b], ri) => {
    const A = at(a), B = at(b), L = Math.hypot(B.x - A.x, B.z - A.z), n = Math.ceil(L / 25), pos = [], idx = [];
    const nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L;
    for (let i = 0; i <= n; i++) { const t = i / n, bend = Math.sin(t * Math.PI) * L * 0.08 * (ri % 2 ? 1 : -1) + Math.sin(t * 9 + ri) * 20, x = A.x + (B.x - A.x) * t + nx * bend, z = A.z + (B.z - A.z) * t + nz * bend;
      pos.push(x + nx * 4, H(x + nx * 4, z + nz * 4) + 0.8, z + nz * 4, x - nx * 4, H(x - nx * 4, z - nz * 4) + 0.8, z - nz * 4);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; root.add(m);
  });

  // Roosts with beacons
  PLACES.filter(p => p.kind === 'roost').forEach((p, i) => {
    const [x, z] = toWorld(p.u, p.v), y = placeY(p), g = new THREE.Group(); g.position.set(x, y, z);
    for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 28, 6), wood); leg.position.set(Math.cos(k * 1.57) * 11, 14, Math.sin(k * 1.57) * 11); g.add(leg); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 2.5, 12), wood); deck.position.y = 28; g.add(deck);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.8, 3, 10), dstone); bowl.position.set(8, 31, 0); g.add(bowl);
    g.userData.anim = !!p.lit; if (p.lit) { const fl = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 8), new THREE.MeshBasicMaterial({ color: 0x6fd0ff })); fl.position.set(8, 36, 0); g.add(fl); anim.push(t => fl.scale.set(1, 1 + Math.sin(t * 8 + i) * 0.2, 1)); }
    root.add(shadow(g));
  });

  // Vistas
  const oak = at('vista_oak'); add(new THREE.CylinderGeometry(6, 10, 80, 9), wood, oak.x, oak.y + 40, oak.z);
  [[0, 90, 0, 34], [22, 76, 10, 24], [-20, 80, -12, 26], [6, 104, -16, 20]].forEach(c => add(new THREE.IcosahedronGeometry(c[3], 1), std(0x4f8a3a), oak.x + c[0], oak.y + c[1], oak.z + c[2]));
  const crag = at('vista_falls'); add(new THREE.CylinderGeometry(14, 36, 130, 8, 4), std(0x8a7f70), crag.x, crag.y + 60, crag.z);
  const head2 = at('vista_head2'); add(new THREE.CylinderGeometry(10, 12, 3, 8), stone, head2.x, head2.y + 1.5, head2.z); add(new THREE.ConeGeometry(4, 9, 6), dstone, head2.x, head2.y + 7, head2.z);

  // Stone dragons: the Sleeping Dragon and 8 statues
  const stoneDragon = (x, y, z, s, ry, pose = 'perch') => { const d = buildEmber(); d.userData.update(0, { pose }); d.traverse(o => { if (o.isMesh) o.material = statueMat; }); d.scale.setScalar(s); d.position.set(x, y, z); d.rotation.y = ry; root.add(shadow(d)); return d; };
  const sl = at('sleeping'); stoneDragon(sl.x, sl.y - 18, sl.z, 16, 1.2);
  PLACES.filter(p => p.kind === 'statue').forEach((p, i) => { const [x, z] = toWorld(p.u, p.v), y = placeY(p); add(new THREE.BoxGeometry(8, 4, 8), dstone, x, y + 2, z); stoneDragon(x, y + 4 + 2.2, z, 2.2, i * 0.8); });

  // Hidden chests
  PLACES.filter(p => p.kind === 'chest').forEach((p, i) => {
    const [x, z] = toWorld(p.u, p.v), y = placeY(p); const g = new THREE.Group(); g.position.set(x, y, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 2.2), wood); box.position.y = 1; const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), gold); lid.position.y = 2;
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: 0xfff2a8 })); g.add(box, lid, sp); g.userData.anim = true; root.add(shadow(g));
    anim.push(t => { sp.position.y = 5 + Math.sin(t * 2 + i) * 0.8; sp.rotation.y = t * 2; });
  });

  // Camps
  const dock = at('camp_dock'), dg = new THREE.Group(); dg.position.set(dock.x, dock.y, dock.z);
  for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 60, 3), wood); leg.position.set(k % 2 ? 14 : -14, 30, k < 2 ? 14 : -14); dg.add(leg); }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(36, 3, 36), wood); deck.position.y = 60; dg.add(deck);
  const ship = new THREE.Group(), env = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(0x9b3a2c)); env.scale.set(16, 14, 44); env.position.y = 26; const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 34), wood); ship.add(env, hull); ship.position.set(40, 66, 0); dg.add(ship);
  dg.userData.anim = true; root.add(shadow(dg)); anim.push(t => { ship.position.y = 66 + Math.sin(t * 0.8) * 2; });
  const yard = at('camp_yard');
  for (let k = 0; k < 5; k++) { const b = new THREE.Group(), env2 = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), std([0xc23b2c, 0xf2b84a, 0x3b6fb3][k % 3])); const gon = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), wood); gon.position.y = -16; b.add(env2, gon); const x = yard.x + (k - 2) * 40, z = yard.z + (rnd() - 0.5) * 50, y = H(x, z); b.position.set(x, y + 60, z); b.userData.anim = true; root.add(shadow(b)); anim.push(t => { b.position.y = y + 60 + Math.sin(t * 0.7 + k) * 3; }); }
  const gr = at('camp_griffin'); add(new THREE.CylinderGeometry(20, 50, 90, 8, 3), std(0x8a7f70), gr.x, gr.y + 40, gr.z);
  const nestG = new THREE.TorusGeometry(16, 5, 8, 18).rotateX(Math.PI / 2); add(nestG, std(0x8a6a3a), gr.x, gr.y + 88, gr.z);
  [0, 2.4].forEach(a => { const g = buildGriffinKnight(); g.userData.update(0, { pose: 'perch' }); g.scale.setScalar(2.4); g.position.set(gr.x + Math.cos(a) * 12, gr.y + 88, gr.z + Math.sin(a) * 12); g.rotation.y = a + 1; root.add(shadow(g)); });


  // Landmarks: Ninestones, Chalk Dragon, Ember Gate, Gullcliff Light, Wend Falls, Egg Nest, Smugglers' Caves
  const st = at('stones'); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; add(new THREE.BoxGeometry(3, 9 + rnd() * 4, 2), dstone, st.x + Math.cos(a) * 26, st.y + 4, st.z + Math.sin(a) * 26, -a); }
  const ch = at('chalk'), chalk = std(0xf7f4ea, { r: 1 });
  for (let i = 0; i < 26; i++) { const t = i / 25, x = ch.x - 180 + t * 360, z = ch.z + Math.sin(t * 9) * 40; const m = add(new THREE.BoxGeometry(16, 0.6, 9 - t * 6), chalk, x, H(x, z) + 0.6, z, -Math.cos(t * 9) * 0.6); }
  [[-1, -1], [1, -1]].forEach(([s]) => { const x = ch.x - 110, z = ch.z + s * 50; add(new THREE.BoxGeometry(60, 0.6, 8), chalk, x, H(x, z) + 0.6, z, s * 0.7); });
  const eg = at('embergate');
  for (let i = 0; i < 7; i++) { const x = eg.x + (i - 3) * 90, z = eg.z + (i - 3) * 40, y = H(x, z); if (i % 3 === 0) { add(new THREE.CylinderGeometry(10, 12, 40 - (i % 2) * 14, 10), dstone, x, y + 18, z); } else add(new THREE.BoxGeometry(80, 10 + rnd() * 10, 7), dstone, x, y + 5, z, -0.42); }
  const lh = at('lighthouse_g'), lhy = Math.max(lh.y, 2);
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(6 - i * 0.4, 6.5 - i * 0.4, 10, 12), i % 2 ? std(0x2a2a30) : white, lh.x, lhy + 5 + i * 10, lh.z);
  const lamp = add(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), lh.x, lhy + 54, lh.z);
  const beamG = new THREE.ConeGeometry(22, 400, 16, 1, true).translate(0, -200, 0).rotateZ(Math.PI / 2), beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })), bg = new THREE.Group(); bg.position.copy(lamp.position); bg.add(beam); root.add(bg); anim.push(t => { bg.rotation.y = t * 0.7; });
  const fa = at('falls'), fall = new THREE.Mesh(new THREE.PlaneGeometry(34, 70), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); fall.position.set(fa.x, Math.max(fa.y, 0) + 30, fa.z); fall.rotation.y = 0.4; root.add(fall);
  const ne = at('nest'), neP = place('nest'), neY = placeY(neP), neLo = nestGround(neP).low; ne.y = neY; if (neY - neLo > 3) add(new THREE.CylinderGeometry(36, 42, neY - neLo + 4, 12), dstone, ne.x, (neY + neLo) / 2 - 2, ne.z); const nest = add(new THREE.TorusGeometry(30, 9, 10, 24).rotateX(Math.PI / 2), std(0x9b7a45), ne.x, ne.y + 6, ne.z);
  const egg = add(new THREE.SphereGeometry(7, 20, 14).scale(1, 1.3, 1), std(0xbfe4f5, { e: 0x7fc8ff, ei: 0.6, flat: false }), ne.x, ne.y + 12, ne.z);
  anim.push(t => { egg.material.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.25; });
  const cv = at('caves'); add(new THREE.TorusGeometry(14, 6, 8, 12, Math.PI), std(0x2a2420), cv.x, 4, cv.z, 0.3);

  // Every other region: roads, city cores, towers, nests, camps, vistas, ring runs
  const CORE = { forge: [0x4a3b35, 0xff6a1a], ice: [0xbfe2f5, 0xe6f4ff], slate: [0x575566, 0x9fb4ff], coral: [0xf4f1e6, 0x3fc4c0], hearthvale: [0xc2b49a, 0x5f6470] };
  const regions = ['cinder', 'frostfang', 'stormcrown', 'reach'];
  regions.forEach(r => {
    const city = PLACES.find(p => p.r === r && p.kind === 'city'), [cx, cz] = toWorld(city.u, city.v), cy = H(cx, cz), cc = CORE[city.style] || CORE.hearthvale;
    const cm = std(cc[0]), am = std(cc[1], { e: city.style === 'forge' ? 0xff5a14 : 0, ei: 0.6 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, hh = 50 + (i % 3) * 22; add(new THREE.CylinderGeometry(9, 11, hh, 8), cm, cx + Math.cos(a) * 60, cy + hh / 2, cz + Math.sin(a) * 60); add(city.style === 'forge' ? new THREE.CylinderGeometry(5, 6, 30, 8) : new THREE.ConeGeometry(12, 26, 8), am, cx + Math.cos(a) * 60, cy + hh + 13, cz + Math.sin(a) * 60); }
    add(new THREE.BoxGeometry(54, 46, 54), cm, cx, cy + 23, cz); add(city.style === 'coral' ? new THREE.SphereGeometry(30, 16, 10, 0, 6.283, 0, 1.6) : new THREE.ConeGeometry(36, 40, 4), am, cx, cy + 46 + (city.style === 'coral' ? 0 : 20), cz, Math.PI / 4);
    PLACES.filter(p => p.r === r && ['town', 'hamlet'].includes(p.kind)).forEach((p, ri) => {
      const [bx, bz] = toWorld(p.u, p.v), L = Math.hypot(bx - cx, bz - cz), n = Math.ceil(L / 30), pos = [], idx = [], nx = -(bz - cz) / L, nz = (bx - cx) / L;
      for (let i = 0; i <= n; i++) { const t = i / n, bend = Math.sin(t * Math.PI) * L * 0.07 * (ri % 2 ? 1 : -1), x = cx + (bx - cx) * t + nx * bend, z = cz + (bz - cz) * t + nz * bend;
        pos.push(x + nx * 4, H(x + nx * 4, z + nz * 4) + 0.8, z + nz * 4, x - nx * 4, H(x - nx * 4, z - nz * 4) + 0.8, z - nz * 4); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, std(r === 'cinder' ? 0x6e6157 : r === 'frostfang' ? 0xe6eef6 : r === 'reach' ? 0xeedca2 : 0x7a788a, { r: 1 })); m.receiveShadow = true; root.add(m);
    });
  });
  PLACES.filter(p => p.kind === 'tower' && p.r !== 'hearthvale' && props).forEach(p => {
    const [x, z] = toWorld(p.u, p.v), ground = Math.max(height(p.u, p.v), 0), base = p.under ? height(p.u, p.v) - 8 : Math.max(placeY(p), ground);
    if (p.float && p.id !== 'stormcrown_tower2') { // a floating rock to stand on
      const rock = std(0x5b5866), top = std(0x5f6e52), g = new THREE.Group(); g.position.set(x, base, z);
      const cn = new THREE.Mesh(new THREE.ConeGeometry(42, 80, 8, 3), rock); cn.rotation.x = Math.PI; cn.position.y = -40; g.add(cn);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(42, 40, 4, 8), top); cap.position.y = -2; g.add(cap); root.add(shadow(g));
    }
    props.tower(x, z, false, base, 54); });
  PLACES.filter(p => p.kind === 'nest').forEach(p => { if (p.r === 'hearthvale') return; const [x, z] = toWorld(p.u, p.v), y = placeY(p), lo = nestGround(p).low; if (y - lo > 3) add(new THREE.CylinderGeometry(36, 42, y - lo + 4, 12), std(0x7d7364), x, (y + lo) / 2 - 2, z); add(new THREE.TorusGeometry(30, 9, 10, 24).rotateX(Math.PI / 2), std(0x9b7a45), x, y + 6, z); });
  PLACES.filter(p => p.kind === 'vista' && p.r !== 'hearthvale' && !p.alt).forEach(p => { const [x, z] = toWorld(p.u, p.v), y = H(x, z); add(new THREE.CylinderGeometry(10, 26, 110, 7, 3), std(p.r === 'frostfang' ? 0xdfe8f2 : p.r === 'cinder' ? 0x3a302c : 0x8a7f70), x, y + 50, z); });
  PLACES.filter(p => p.kind === 'camp' && p.r !== 'hearthvale').forEach((p, ci) => {
    const [x, z] = toWorld(p.u, p.v), y = H(x, z), t = p.camp;
    if (t === 'dock') { const g = new THREE.Group(); g.position.set(x, y, z); for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 60, 3), wood); leg.position.set(k % 2 ? 14 : -14, 30, k < 2 ? 14 : -14); g.add(leg); } const dk = new THREE.Mesh(new THREE.BoxGeometry(36, 3, 36), wood); dk.position.y = 60; g.add(dk); const env = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), std(0x9b3a2c)); env.scale.set(16, 14, 44); env.position.set(40, 92, 0); g.add(env); root.add(shadow(g)); }
    else if (t === 'yard') { for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), std([0xc23b2c, 0xf2b84a, 0x3b6fb3][k % 3])); b.position.set(x + (k - 1.5) * 40, y + 60, z); root.add(shadow(b)); } }
    else if (t === 'griffin' || t === 'wyvern' || t === 'harpy') { add(new THREE.CylinderGeometry(20, 50, 90, 8, 3), std(t === 'wyvern' ? 0x3a302c : t === 'harpy' ? 0x5a5868 : 0x8a7f70), x, y + 40, z); add(new THREE.TorusGeometry(16, 5, 8, 18).rotateX(Math.PI / 2), std(0x8a6a3a), x, y + 88, z); }
    else if (t === 'shrine') { for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283; add(new THREE.OctahedronGeometry(8, 0).scale(1, 2.6, 1), std(0xbfe8ff, { e: 0x7fc8ff, ei: 0.5, t: true, op: 0.85 }), x + Math.cos(a) * 30, y + 20, z + Math.sin(a) * 30); } }
    else if (t === 'grotto') { add(new THREE.TorusGeometry(40, 14, 8, 14, Math.PI), std(0x2a3a40), x, -6, z, 0.4); }
  });

  // Sky Isles: the First Nest (a great old nest with a stone egg) and a cairn on Skytop
  const fn = PLACES.find(p => p.id === 'sky_firstnest'); if (fn) { const [x, z] = toWorld(fn.u, fn.v), y = placeY(fn); add(new THREE.TorusGeometry(26, 8, 10, 24).rotateX(Math.PI / 2), std(0xb8955a), x, y + 6, z); add(new THREE.SphereGeometry(10, 18, 14).scale(1, 1.3, 1), std(0xe8e0d0, { e: 0xfff0c0, ei: 0.25 }), x, y + 14, z); }
  // Cloud Castle landing deck: a round stone terrace on the castle with a glowing gold ring, banners and a soft beam.
  const cc = PLACES.find(p => p.id === 'sky_city'); if (cc) { const [x, z] = toWorld(cc.u, cc.v), y = placeY(cc), top = y + cc.deck;
    add(new THREE.CylinderGeometry(9, 12, cc.deck, 10), stone, x, y + cc.deck / 2, z);
    add(new THREE.CylinderGeometry(24, 20, 5, 24), stone, x, top - 2.5, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 1.4, 8, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 1.2 })); ring.position.set(x, top + 0.6, z); root.add(ring);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(12, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); pad.position.set(x, top + 0.4, z); root.add(pad);
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + 0.4, px = x + Math.cos(a) * 21, pz = z + Math.sin(a) * 21; add(new THREE.CylinderGeometry(0.5, 0.5, 16, 6), std(0x7a5532), px, top + 8, pz); const fl = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), std(k % 2 ? 0x8a6aff : 0xe2b64a, { side: THREE.DoubleSide })); fl.position.set(px + 3.5, top + 14, pz); fl.userData.anim = true; root.add(fl); anim.push(t => { fl.rotation.y = Math.sin(t * 2 + k) * 0.4; }); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 260, 20, 1, true).translate(0, 130, 0), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(x, top, z); root.add(beam);
    ring.userData.anim = pad.userData.anim = beam.userData.anim = true; anim.push(t => { ring.material.emissiveIntensity = 1 + Math.sin(t * 2.4) * 0.4; pad.material.opacity = 0.25 + Math.sin(t * 2.4) * 0.12; }); }
  const sv = PLACES.find(p => p.id === 'sky_vista'); if (sv) { const [x, z] = toWorld(sv.u, sv.v), y = placeY(sv); add(new THREE.CylinderGeometry(8, 10, 3, 8), stone, x, y + 1.5, z); add(new THREE.ConeGeometry(3, 9, 6), dstone, x, y + 7.5, z); }
  return { root, update: t => anim.forEach(f => f(t)) };
}
