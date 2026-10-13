// Skyborn character models: Ember (+ rider) and a Griffin Knight. Built from named primitives.
import * as THREE from 'three';

const mats = {};
export function M(name, color, o = {}) {
  const key = name + ':' + color + ':' + (o.e || 0);
  if (mats[key]) return mats[key];
  return (mats[key] = new THREE.MeshStandardMaterial({ name, color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, side: o.side ?? THREE.FrontSide, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 }));
}
function mesh(name, geo, mat, p, r, s) {
  const m = new THREE.Mesh(geo, mat); m.name = name;
  if (p) m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); if (s) m.scale.set(s[0], s[1], s[2]);
  return m;
}
const grp = (name, p) => { const g = new THREE.Group(); g.name = name; if (p) g.position.set(p[0], p[1], p[2]); return g; };
const ball = (name, r, mat, p, s, seg = 32) => mesh(name, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat, p, null, s);
function taper(name, pts, r0, r1, mat, seg = 28, rad = 18) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false), pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c); const t = i / seg, r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return mesh(name, g, mat);
}
const cone = (name, r, h, mat, p, rot) => mesh(name, new THREE.ConeGeometry(r, h, 16), mat, p, rot);
const mirror = (build) => { const L = grp('left'), R = grp('right'); L.scale.x = -1; L.add(build('L')); R.add(build('R')); return [L, R]; };

function membrane(name, pts, mat, lift) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i]; p.length === 4 ? s.quadraticCurveTo(p[2], p[3], p[0], p[1]) : s.lineTo(p[0], p[1]); }
  const g = new THREE.ShapeGeometry(s, 24); g.rotateX(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, lift(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  return mesh(name, g, mat);
}

function buildRider(o = {}) {
  const skin = M('rider_skin', 0xf0c39c, { r: 0.7 }), tunic = M('rider_tunic', 0x2f6a78, { r: 0.8 }), trousers = M('rider_trousers', 0x3a3550, { r: 0.85 });
  const leather = M('leather', 0x6b3f22, { r: 0.75 }), brass = M('brass', 0xd4a845, { r: 0.35, m: 0.35 }), scarfM = M('rider_scarf', 0x3fa9f5, { r: 0.7, side: THREE.DoubleSide });
  const lens = M('goggle_lens', 0x9fd8f0, { r: 0.15, m: 0.2 });
  const g = grp('rider');
  [-1, 1].forEach(sx => {
    g.add(taper('rider_leg', [[0.13 * sx, 0.05, 0], [0.36 * sx, -0.08, 0.16], [0.44 * sx, -0.42, 0.2]], 0.1, 0.08, trousers, 12, 10));
    g.add(ball('rider_boot', 0.09, leather, [0.45 * sx, -0.48, 0.25], [1, 0.8, 1.5], 16));
    g.add(taper('rider_arm', [[0.2 * sx, 0.52, 0.02], [0.3 * sx, 0.32, 0.28], [0.1 * sx, 0.3, 0.52]], 0.07, 0.055, tunic, 12, 10));
    g.add(ball('rider_hand', 0.06, leather, [0.08 * sx, 0.3, 0.55], null, 12));
    g.add(mesh('goggle_rim', new THREE.TorusGeometry(0.055, 0.016, 8, 20), brass, [0.07 * sx, 0.8, 0.22]));
    g.add(mesh('goggle_lens', new THREE.CircleGeometry(0.05, 20), lens, [0.07 * sx, 0.8, 0.225]));
  });
  g.add(mesh('rider_torso', new THREE.CapsuleGeometry(0.19, 0.3, 8, 18), tunic, [0, 0.36, 0.04], [0.25, 0, 0]));
  g.add(mesh('rider_belt', new THREE.TorusGeometry(0.19, 0.03, 8, 24), leather, [0, 0.22, 0.02], [Math.PI / 2, 0, 0]));
  g.add(ball('rider_head', 0.16, skin, [0, 0.76, 0.1], null, 24));
  g.add(ball('rider_cap', 0.172, leather, [0, 0.8, 0.07], [1, 0.82, 1], 24));
  g.add(mesh('scarf_wrap', new THREE.TorusGeometry(0.12, 0.05, 10, 24), scarfM, [0, 0.6, 0.07], [Math.PI / 2, 0, 0]));
  const sg = new THREE.PlaneGeometry(0.15, 1.3, 1, 16); sg.translate(0, -0.65, 0); sg.rotateX(Math.PI / 2 - 0.15);
  const scarf = mesh('scarf_tail', sg, scarfM, [0, 0.62, -0.06]);
  const base = Float32Array.from(sg.attributes.position.array);
  g.add(scarf);
  g.userData.update = (t, speed = 1) => {
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bz = base[i * 3 + 2], k = Math.min(1, -bz / 1.2) + 0.02;
      p.setX(i, base[i * 3] + Math.sin(t * 9 * speed + bz * 6) * 0.12 * k);
      p.setY(i, base[i * 3 + 1] + Math.sin(t * 7 * speed + bz * 4 + 1) * 0.1 * k);
    }
    p.needsUpdate = true; sg.computeVertexNormals();
  };
  return g;
}

export function buildEmber(opts = {}) {
  const pal = opts.palette || { scale: 0xe2602a, belly: 0xf7c47c, wing: 0xf29a3a, horn: 0xf4e8cc };
  const nm = opts.name || 'ember';
  const scale = M(nm + '_scales', pal.scale, { r: pal.r ?? 0.55, m: pal.m ?? 0 }), belly = M(nm + '_belly', pal.belly, { r: 0.65, m: pal.m ?? 0 });
  const wingM = M(nm + '_membrane', pal.wing, { r: 0.7, side: THREE.DoubleSide, e: pal.we || 0, ei: 0.8 }), horn = M(nm + '_horn', pal.horn, { r: 0.45, m: pal.m ?? 0 });
  const eyeW = M('eye_white', 0xfdfaf2, { r: 0.3 }), pupil = M('eye_pupil', 0x2a1608, { r: 0.2 });
  const leather = M('leather', 0x6b3f22, { r: 0.75 }), brass = M('brass', 0xd4a845, { r: 0.35, m: 0.35 });
  const root = grp(opts.title || 'Ember'), body = grp(nm + '_body'); root.add(body);
  body.add(ball('torso', 1, scale, [0, 0, 0], [1.05, 0.95, 1.6]));
  body.add(ball('belly', 1, belly, [0, -0.24, 0.12], [0.86, 0.74, 1.42]));
  body.add(ball('chest', 0.86, scale, [0, 0.12, 1.0], [1, 1, 1.1]));
  body.add(ball('chest_belly', 0.7, belly, [0, -0.12, 1.2], [1, 0.95, 1]));
  body.add(taper('neck', [[0, 0.2, 1.2], [0, 0.78, 2.0], [0, 1.36, 2.45], [0, 1.62, 2.86]], 0.64, 0.38, scale));
  body.add(taper('neck_belly', [[0, -0.1, 1.55], [0, 0.55, 2.22], [0, 1.15, 2.7], [0, 1.4, 3.0]], 0.42, 0.26, belly));
  const head = grp('head', [0, 1.68, 3.02]); body.add(head);
  head.add(ball('skull', 0.5, scale, [0, 0, 0], [1.05, 0.92, 1.1]));
  head.add(ball('snout', 0.38, scale, [0, -0.1, 0.5], [0.95, 0.74, 1.25]));
  head.add(ball('jaw', 0.33, belly, [0, -0.32, 0.4], [0.86, 0.46, 1.15]));
  [-1, 1].forEach(sx => {
    head.add(ball('nostril', 0.045, pupil, [0.13 * sx, 0.0, 0.95], null, 12));
    head.add(ball('eye', 0.16, eyeW, [0.3 * sx, 0.13, 0.24], null, 24));
    head.add(ball('pupil', 0.095, pupil, [0.4 * sx, 0.14, 0.31], null, 16));
    head.add(ball('eye_glint', 0.03, eyeW, [0.46 * sx, 0.2, 0.35], null, 10));
    head.add(ball('brow', 0.2, scale, [0.27 * sx, 0.28, 0.2], [1, 0.4, 0.9], 16));
    head.add(taper('horn', [[0.22 * sx, 0.3, -0.12], [0.34 * sx, 0.52, -0.46], [0.36 * sx, 0.58, -0.86]], 0.12, 0.02, horn, 16, 12));
    head.add(cone('frill', 0.09, 0.32, horn, [0.42 * sx, -0.05, -0.18], [0, 0, -1.8 * sx]));
  });
  const tail = grp('tail', [0, 0.05, -1.3]); body.add(tail);
  tail.add(taper('tail', [[0, 0, 0], [0, -0.15, -1.3], [0.2, 0, -2.5], [0.5, 0.3, -3.5], [0.72, 0.56, -4.2]], 0.62, 0.06, scale, 40));
  tail.add(mesh('tail_spade', new THREE.OctahedronGeometry(0.36, 1), horn, [0.8, 0.62, -4.45], [0, 0.3, 0], [1, 0.22, 1.5]));
  [[0, 1.88, 2.55, 0.1], [0, 1.5, 2.05, 0.12], [0, 1.08, 1.4, 0.14], [0, 0.98, 0.55, 0.15], [0, 0.98, -0.35, 0.15], [0, 0.82, -1.15, 0.14]].forEach(s => body.add(cone('spine', s[3], s[3] * 2.4, horn, [s[0], s[1], s[2]], [-0.5, 0, 0])));
  [[0, 0.32, -0.9, 0.12], [0, 0.1, -1.9, 0.1], [0.3, 0.33, -3.0, 0.08]].forEach(s => tail.add(cone('tail_spine', s[3], s[3] * 2.4, horn, [s[0], s[1], s[2]], [-0.7, 0, 0])));

  const pivots = [];
  mirror(side => {
    const sh = grp('shoulder_' + side, [0.72, 0.72, 0.55]), piv = grp('wing_' + side); sh.add(piv); pivots.push(piv);
    piv.add(taper('wing_arm', [[0, 0, 0], [1.2, 0.36, -0.2], [2.2, 0.5, 0.1]], 0.24, 0.12, scale, 20, 12));
    [[4.7, 0.32, -0.4], [4.1, 0.12, -1.55], [3.0, 0.02, -2.25]].forEach(t => piv.add(taper('wing_finger', [[2.2, 0.5, 0.1], [(2.2 + t[0]) / 2, (0.5 + t[1]) / 2 + 0.04, (0.1 + t[2]) / 2], t], 0.09, 0.035, scale, 12, 8)));
    piv.add(cone('wing_claw', 0.06, 0.24, horn, [2.3, 0.56, 0.3], [1.3, 0, 0]));
    piv.add(membrane('wing_membrane', [[0, 0.2], [2.2, 0.1], [4.7, -0.4], [4.1, -1.55, 4.0, -0.8], [3.0, -2.25, 3.2, -1.6], [0.1, -1.7, 1.4, -1.6], [0, 0.2]], wingM, x => 0.5 * Math.min(1, x / 2.2) - 0.18 * Math.max(0, (x - 2.2) / 2.5)));
    return sh;
  }).forEach(s => body.add(s));

  const legs = [];
  [[-0.72, -0.45, -0.8, 1], [0.72, -0.45, -0.8, 1], [-0.62, -0.38, 1.05, 0.8], [0.62, -0.38, 1.05, 0.8]].forEach(L => {
    const k = L[3], lg = grp('leg', [L[0], L[1], L[2]]); legs.push(lg); body.add(lg);
    lg.add(ball('thigh', 0.48 * k, scale, [0, -0.05, 0], [0.7, 1, 1.1]));
    lg.add(taper('shin', [[0, -0.2, 0], [0, -0.72 * k, 0.16], [0, -1.02 * k, -0.04]], 0.26 * k, 0.17 * k, scale, 14, 12));
    lg.add(ball('foot', 0.24 * k, belly, [0, -1.1 * k, 0.14], [1, 0.5, 1.4], 20));
    [-0.12, 0, 0.12].forEach(cx => lg.add(cone('claw', 0.055, 0.2, horn, [cx * k, -1.12 * k, 0.48 * k], [Math.PI / 2, 0, 0])));
  });

  const saddle = grp('saddle', [0, 0.9, 0.2]); body.add(saddle);
  saddle.add(ball('saddle_pad', 0.7, leather, [0, 0, 0], [0.75, 0.2, 0.6], 24));
  saddle.add(ball('saddle_cantle', 0.42, leather, [0, 0.12, -0.32], [1, 0.45, 0.28], 20));
  saddle.add(mesh('saddle_pommel', new THREE.CylinderGeometry(0.05, 0.07, 0.28, 12), brass, [0, 0.2, 0.42]));
  body.add(mesh('girth', new THREE.TorusGeometry(1.0, 0.05, 8, 40), leather, [0, 0, 0.2], null, [1.08, 0.98, 1]));
  [-1, 1].forEach(sx => body.add(mesh('stirrup', new THREE.TorusGeometry(0.1, 0.025, 8, 16), brass, [0.66 * sx, 0.3, 0.3])));
  const rider = opts.noRider ? null : buildRider(); if (rider) { rider.position.set(0, 1.08, 0.15); body.add(rider); } else { body.remove(saddle); body.children.filter(c => c.name === 'girth' || c.name === 'stirrup').forEach(c => body.remove(c)); }
  root.userData.parts = { body, head, tail, pivots, legs };

  root.userData.update = (t, s = {}) => {
    const flap = s.flap ?? 0.4, tuck = s.tuck ?? 0, perch = s.pose === 'perch';
    const a = perch ? 0.25 : 0.14 + Math.sin(t * (3 + flap * 6)) * (0.18 + flap * 0.75) * (1 - tuck);
    pivots.forEach(p => { p.rotation.z = perch ? 0.55 : a - tuck * 0.35; p.rotation.y = perch ? -1.35 : -tuck * 1.15; p.rotation.x = perch ? 0.25 : 0; });
    legs.forEach(l => { l.rotation.x = perch ? 0 : 0.95 + tuck * 0.3; });
    tail.rotation.y = Math.sin(t * 1.6) * 0.18; tail.rotation.x = perch ? 0.25 : Math.sin(t * 1.3) * 0.05 + tuck * 0.15;
    head.rotation.x = Math.sin(t * 1.1) * 0.05 - (perch ? 0.1 : 0); head.rotation.y = Math.sin(t * 0.7) * (perch ? 0.3 : 0.08);
    body.position.y = perch ? 0 : Math.sin(t * (3 + flap * 6) + 1.2) * 0.12 * (1 - tuck);
    if (rider) rider.userData.update(t, perch ? 0.4 : 1 + tuck);
  };
  return root;
}

export function buildGriffinKnight() {
  const fur = M('griffin_fur', 0xc8954a, { r: 0.85 }), white = M('griffin_feathers_white', 0xf1e9d8, { r: 0.8 });
  const brown = M('griffin_feathers', 0x8a5a2e, { r: 0.8, side: THREE.DoubleSide }), tip = M('griffin_feather_tips', 0x4a3220, { r: 0.8, side: THREE.DoubleSide });
  const beak = M('griffin_beak', 0xf2b630, { r: 0.4 }), dark = M('eye_pupil', 0x2a1608, { r: 0.2 });
  const steel = M('knight_steel', 0xc3cad3, { r: 0.32, m: 0.35 }), crimson = M('knight_crimson', 0xb3262a, { r: 0.7, side: THREE.DoubleSide });
  const leather = M('leather', 0x6b3f22, { r: 0.75 }), gold = M('brass', 0xd4a845, { r: 0.35, m: 0.35 }), wood = M('lance_wood', 0x7a5532, { r: 0.7 });
  const root = grp('GriffinKnight'), body = grp('griffin_body'); root.add(body);
  body.add(ball('hindquarters', 0.8, fur, [0, 0, -0.35], [0.82, 0.78, 1.3]));
  body.add(ball('chest', 0.78, white, [0, 0.12, 0.72], [0.9, 0.95, 1.0]));
  body.add(taper('neck', [[0, 0.3, 0.9], [0, 0.82, 1.3], [0, 1.15, 1.48]], 0.44, 0.3, white, 20, 16));
  const head = grp('head', [0, 1.3, 1.62]); body.add(head);
  head.add(ball('head', 0.36, brown, [0, 0, 0], [0.9, 0.95, 1.1]));
  head.add(cone('beak', 0.15, 0.48, beak, [0, -0.05, 0.48], [Math.PI / 2, 0, 0]));
  head.add(cone('beak_hook', 0.07, 0.2, beak, [0, -0.13, 0.68], [Math.PI, 0, 0]));
  [-1, 1].forEach(sx => {
    head.add(ball('eye_ring', 0.08, beak, [0.22 * sx, 0.1, 0.17], null, 12));
    head.add(ball('pupil', 0.05, dark, [0.27 * sx, 0.11, 0.2], null, 10));
    head.add(cone('ear_tuft', 0.07, 0.3, brown, [0.18 * sx, 0.3, -0.18], [-0.9, 0, -0.3 * sx]));
  });
  const tail = grp('tail', [0, 0.1, -1.3]); body.add(tail);
  tail.add(taper('tail', [[0, 0, 0], [0, -0.3, -0.8], [0, -0.1, -1.6], [0, 0.25, -2.1]], 0.12, 0.05, fur, 24, 10));
  tail.add(ball('tail_tuft', 0.18, brown, [0, 0.3, -2.2], [1, 1, 1.5], 16));
  const pivots = [];
  mirror(side => {
    const sh = grp('shoulder_' + side, [0.55, 0.45, 0.65]), piv = grp('wing_' + side); sh.add(piv); pivots.push(piv);
    piv.add(taper('wing_arm', [[0, 0, 0], [0.9, 0.22, -0.15], [1.7, 0.3, 0]], 0.2, 0.1, brown, 16, 10));
    piv.add(membrane('wing_coverts', [[0, 0.25], [1.7, 0.12], [2.2, -0.2, 2.1, 0.1], [1.4, -1.0, 2.0, -0.8], [0.1, -1.1, 0.8, -1.3], [0, 0.25]], brown, x => 0.3 * Math.min(1, x / 1.7)));
    for (let i = 0; i < 8; i++) {
      const a = -0.25 - i * 0.2, len = 1.35 - i * 0.07;
      const f = ball('primary_feather', 0.5, i % 2 ? tip : brown, [1.7 + Math.cos(a) * len * 0.5, 0.28 - i * 0.012, Math.sin(a) * len * 0.5], [0.13, 0.025, len], 12);
      f.rotation.y = Math.PI / 2 - a; piv.add(f);
    }
    return sh;
  }).forEach(s => body.add(s));
  const legs = [];
  [[-0.42, -0.35, 0.85, 'talon'], [0.42, -0.35, 0.85, 'talon'], [-0.45, -0.4, -0.75, 'paw'], [0.45, -0.4, -0.75, 'paw']].forEach(L => {
    const lg = grp('leg', [L[0], L[1], L[2]]); legs.push(lg); body.add(lg);
    const talon = L[3] === 'talon';
    lg.add(taper('shin', [[0, 0, 0], [0, -0.45, 0.1], [0, -0.75, 0]], talon ? 0.14 : 0.22, talon ? 0.09 : 0.15, talon ? beak : fur, 12, 10));
    if (talon) [-0.08, 0, 0.08].forEach(cx => lg.add(cone('talon', 0.04, 0.2, dark, [cx, -0.8, 0.12], [Math.PI / 2, 0, 0])));
    else lg.add(ball('paw', 0.17, fur, [0, -0.8, 0.06], [1, 0.6, 1.3], 14));
  });
  const k = grp('knight', [0, 0.78, 0.15]); body.add(k);
  k.add(ball('saddle_pad', 0.5, leather, [0, -0.04, 0], [0.8, 0.22, 0.75], 20));
  [-1, 1].forEach(sx => {
    k.add(taper('knight_leg', [[0.14 * sx, 0.06, 0], [0.34 * sx, -0.06, 0.18], [0.4 * sx, -0.42, 0.22]], 0.11, 0.09, steel, 12, 10));
    k.add(ball('pauldron', 0.14, steel, [0.24 * sx, 0.62, 0.05], [1, 0.8, 1], 16));
  });
  k.add(mesh('knight_torso', new THREE.CapsuleGeometry(0.21, 0.32, 8, 18), steel, [0, 0.38, 0.04], [0.15, 0, 0]));
  k.add(mesh('tabard', new THREE.BoxGeometry(0.34, 0.5, 0.02), crimson, [0, 0.32, 0.27], [0.15, 0, 0]));
  k.add(ball('helmet', 0.17, steel, [0, 0.82, 0.06], [1, 1.1, 1.05], 24));
  k.add(mesh('visor_slit', new THREE.BoxGeometry(0.2, 0.025, 0.04), dark, [0, 0.84, 0.23]));
  const plume = taper('plume', [[0, 0.98, 0.05], [0, 1.12, -0.18], [0, 1.02, -0.5], [0, 0.85, -0.75]], 0.07, 0.03, crimson, 16, 10); k.add(plume);
  const arm = grp('lance_arm', [0.3, 0.42, 0.1]); arm.rotation.y = 0.14; k.add(arm);
  arm.add(taper('knight_arm', [[0, 0, 0], [0.04, -0.12, 0.25], [0, -0.05, 0.42]], 0.07, 0.06, steel, 10, 8));
  const lance = grp('lance', [0.06, -0.1, 0.42]); lance.rotation.x = -0.05; arm.add(lance);
  lance.add(mesh('lance_shaft', new THREE.CylinderGeometry(0.03, 0.065, 3.6, 16), wood, [0, 0, 1.3], [Math.PI / 2, 0, 0]));
  lance.add(cone('lance_tip', 0.06, 0.45, steel, [0, 0, 3.32], [Math.PI / 2, 0, 0]));
  lance.add(cone('vamplate', 0.16, 0.3, steel, [0, 0, 0.15], [-Math.PI / 2, 0, 0]));
  const pen = new THREE.Shape(); pen.moveTo(0, 0); pen.lineTo(-0.55, 0.12); pen.lineTo(0, 0.26); pen.closePath();
  lance.add(mesh('pennant', new THREE.ShapeGeometry(pen), crimson, [0, 0.05, 2.9], [0, Math.PI / 2, 0]));
  const shield = grp('shield', [-0.34, 0.42, 0.18]); shield.rotation.y = -1.2; k.add(shield);
  shield.add(mesh('shield_face', new THREE.CylinderGeometry(0.34, 0.34, 0.05, 32), crimson, [0, 0, 0], [Math.PI / 2, 0, 0]));
  shield.add(mesh('shield_rim', new THREE.TorusGeometry(0.34, 0.03, 8, 32), gold));
  shield.add(ball('shield_boss', 0.08, gold, [0, 0, 0.04], [1, 1, 0.6], 12));
  root.userData.update = (t, s = {}) => {
    const flap = s.flap ?? 0.6, perch = s.pose === 'perch';
    const a = perch ? 0.2 : 0.12 + Math.sin(t * (4 + flap * 6)) * (0.25 + flap * 0.7);
    pivots.forEach(p => { p.rotation.z = a; p.rotation.y = perch ? -1.2 : 0; });
    legs.forEach((l, i) => { l.rotation.x = perch ? 0 : (i < 2 ? 0.6 : 1.1); });
    tail.rotation.y = Math.sin(t * 2) * 0.25; head.rotation.y = Math.sin(t * 0.9) * 0.2;
    plume.rotation.x = Math.sin(t * 8) * 0.05; body.position.y = perch ? 0 : Math.sin(t * (4 + flap * 6) + 1.2) * 0.1;
  };
  return root;
}
export { buildRider, mesh, ball, taper, cone, grp, membrane };
