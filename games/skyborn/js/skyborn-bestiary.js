// Skyborn bestiary: the 4 unlockable dragons, 6 roaming enemies, 6 region champions. Built from named primitives.
import * as THREE from 'three';
import { buildEmber, buildGriffinKnight, M, mesh, ball, taper, cone, grp, membrane } from './skyborn-models.js';

const DS = THREE.DoubleSide;
const anim = (root, fn) => { root.userData.update = fn; return root; };

// ---------- Dragons ----------
export const DRAGONS = {
  Breeze: { palette: { scale: 0x6fbf7a, belly: 0xe6f2c2, wing: 0xb6e4f2, horn: 0xf4f0e0 }, stretch: [0.86, 0.9, 0.92], scale: 0.9 },
  Ember: { palette: { scale: 0xe2602a, belly: 0xf7c47c, wing: 0xf29a3a, horn: 0xf4e8cc } },
  Frost: { palette: { scale: 0xe8f2fb, belly: 0xbfdcf2, wing: 0x9fd0f2, horn: 0x7fb8e6, we: 0x3a7ab0 }, stretch: [0.86, 0.95, 1.18] },
  Storm: { palette: { scale: 0x6a3f9a, belly: 0xb79ad8, wing: 0x5fb8ff, horn: 0xe6e0ff, we: 0x3a8cff }, stretch: [0.95, 1, 1.05] },
  Tide: { palette: { scale: 0x2f9a8e, belly: 0xa8e6c8, wing: 0x5fd6c0, horn: 0xe6fff4 }, stretch: [0.92, 0.95, 1.12] },
  Gold: { palette: { scale: 0xe2b64a, belly: 0xfff0c0, wing: 0xf6d27a, horn: 0xfff8e6, m: 0.3, r: 0.38 }, stretch: [1.08, 1.08, 1.12], scale: 1.35 }
};
export function buildDragon(kind = 'Ember', opts = {}) {
  const d = DRAGONS[kind] || DRAGONS.Ember, nm = kind.toLowerCase();
  const root = buildEmber({ palette: d.palette, name: nm, title: kind, noRider: opts.noRider });
  const { body, head, tail } = root.userData.parts;
  if (d.stretch) body.scale.set(...d.stretch);
  if (d.scale) root.scale.setScalar(d.scale);
  if (kind === 'Frost') {
    const ice = M('frost_crystal', 0xcfeaff, { r: 0.1, e: 0x6ab8ff, ei: 0.4 });
    [[0, 1.2, 0.2], [0, 1.15, -0.6], [0, 1.0, -1.3]].forEach((p, i) => body.add(mesh('ice_crest', new THREE.OctahedronGeometry(0.28 - i * 0.04, 0).scale(0.5, 1.6, 0.8), ice, p)));
    [-1, 1].forEach(s => head.add(mesh('ice_horn', new THREE.ConeGeometry(0.08, 0.7, 6), ice, [0.2 * s, 0.6, -0.5], [-0.9, 0, 0])));
  }
  if (kind === 'Storm') {
    const spark = M('storm_spark', 0xbfe4ff, { e: 0x7fc8ff, ei: 1.4 });
    const bolts = grp('crackle'); body.add(bolts);
    for (let i = 0; i < 6; i++) bolts.add(mesh('spark', new THREE.OctahedronGeometry(0.12, 0), spark, [Math.sin(i) * 2.5, 0.8 + Math.cos(i * 2) * 0.3, 0.4 - i * 0.2]));
    const u0 = root.userData.update; root.userData.update = (t, s) => { u0(t, s); bolts.children.forEach((b, i) => { b.visible = Math.sin(t * 13 + i * 2.1) > 0.3; b.position.x = Math.sin(t * 7 + i) * 2.8 * (i % 2 ? 1 : -1); }); };
  }
  if (kind === 'Tide') {
    const fin = M('tide_fin', 0x5fd6c0, { side: DS, r: 0.6 });
    const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.7, -0.9, 0.5); s.lineTo(-1.1, 0); s.closePath();
    [[0, 1.0, 0.6], [0, 0.95, -0.4], [0, 0.6, -1.4]].forEach(p => body.add(mesh('back_fin', new THREE.ShapeGeometry(s), fin, p, [0, -Math.PI / 2, 0])));
    tail.add(mesh('tail_fluke', new THREE.CircleGeometry(0.6, 16, 0, Math.PI), fin, [0.75, 0.6, -4.4], [Math.PI / 2, 0, 0], [1.4, 1, 1]));
    [-1, 1].forEach(sx => head.add(mesh('cheek_fin', new THREE.ShapeGeometry(s), fin, [0.4 * sx, 0, -0.1], [0, sx * 0.6, 0], [0.5, 0.5, 0.5])));
  }
  if (kind === 'Gold') {
    const crown = M('gold_crown', 0xfff0b0, { m: 0.4, r: 0.3, e: 0xffc040, ei: 0.3 });
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35; head.add(mesh('crown_horn', new THREE.ConeGeometry(0.07, 0.6, 8), crown, [Math.sin(a) * 0.45, 0.55, -0.25 - Math.abs(a) * 0.2], [-0.6, 0, -a])); }
    body.add(mesh('halo', new THREE.TorusGeometry(1.4, 0.04, 8, 48), crown, [0, 2.2, 0.4], [Math.PI / 2, 0, 0]));
  }
  return root;
}

// ---------- Roaming enemies ----------
export function buildPirateBalloon() {
  const root = grp('PirateBalloon'), red = M('balloon_red', 0xc23b2c, { r: 0.7 }), cream = M('balloon_cream', 0xf1e3c4, { r: 0.7 }), wood = M('lance_wood', 0x7a5532), rope = M('rope', 0xb89a6a), iron = M('iron', 0x3a3a40, { m: 0.35, r: 0.4 }), cloth = M('pirate_cloth', 0x2f3a5a);
  const env = grp('envelope', [0, 5.2, 0]); root.add(env);
  for (let i = 0; i < 8; i++) { const g = new THREE.SphereGeometry(3.2, 24, 18, i / 8 * Math.PI * 2, Math.PI / 4); env.add(mesh('gore', g, i % 2 ? red : cream, null, null, [1, 1.15, 1])); }
  env.add(mesh('crown_patch', new THREE.SphereGeometry(1.1, 16, 8, 0, 6.283, 0, 0.9), red, [0, 3.5, 0]));
  const gon = grp('gondola', [0, 0, 0]); root.add(gon);
  gon.add(mesh('gondola_hull', new THREE.CylinderGeometry(1.5, 1.2, 1.2, 12), wood));
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([x, z]) => root.add(taper('rope', [[x * 1.1, 0.5, z * 1.1], [x * 1.9, 2.2, z * 1.9]], 0.03, 0.03, rope, 2, 4)));
  gon.add(mesh('cannon', new THREE.CylinderGeometry(0.16, 0.22, 1.4, 12), iron, [0, 0.5, 1.4], [Math.PI / 2.3, 0, 0]));
  [-0.6, 0.6].forEach(x => { gon.add(ball('pirate', 0.28, cloth, [x, 0.9, -0.2], [1, 1.3, 1], 12)); gon.add(ball('pirate_head', 0.2, M('rider_skin', 0xf0c39c), [x, 1.42, -0.2], null, 12)); gon.add(cone('pirate_hat', 0.26, 0.25, M('hat_black', 0x1a1a20), [x, 1.66, -0.2])); });
  gon.add(mesh('jolly_flag', new THREE.PlaneGeometry(0.9, 0.6), M('flag_black', 0x1a1a20, { side: DS }), [0, 1.9, -1.2]));
  return anim(root, t => { root.rotation.y = Math.sin(t * 0.3) * 0.2; gon.rotation.z = Math.sin(t * 1.1) * 0.05; });
}
export function buildWyvern() {
  const w = buildEmber({ palette: { scale: 0x5c8a3a, belly: 0xd8d07a, wing: 0x8ab84a, horn: 0x3a3020 }, name: 'wyvern', title: 'WildWyvern', noRider: true });
  const { legs } = w.userData.parts; legs.slice(2).forEach(l => { l.visible = false; });
  w.scale.setScalar(0.55); return w;
}
export function buildHarpy() {
  const root = grp('Harpy'), feather = M('harpy_feathers', 0x6a4a8a, { side: DS, r: 0.8 }), tip = M('harpy_tips', 0xd8a040, { side: DS }), skin = M('harpy_skin', 0xc8a8d0), eye = M('harpy_eye', 0xffe040, { e: 0xffc020, ei: 0.8 }), talon = M('eye_pupil', 0x2a1608);
  root.add(ball('harpy_body', 0.5, feather, [0, 0, 0], [0.8, 1.2, 0.7], 20));
  root.add(ball('harpy_head', 0.32, skin, [0, 0.82, 0.08], null, 20));
  root.add(cone('harpy_crest', 0.18, 0.5, tip, [0, 1.12, -0.1], [-0.6, 0, 0]));
  [-1, 1].forEach(s => { root.add(ball('harpy_eye', 0.06, eye, [0.12 * s, 0.86, 0.36], null, 10)); });
  const pivots = [];
  [-1, 1].forEach(s => { const sh = grp('harpy_wing', [0.3 * s, 0.4, 0]); const piv = grp('wing'); sh.add(piv); pivots.push([piv, s]); root.add(sh);
    for (let i = 0; i < 6; i++) { const len = 1.6 - i * 0.12, a = 0.15 + i * 0.22; const f = ball('harpy_feather', 0.5, i % 2 ? tip : feather, [s * (0.9 + Math.cos(a) * len * 0.5), -i * 0.05, -Math.sin(a) * len * 0.5], [0.16, 0.03, len], 10); f.rotation.y = s * (Math.PI / 2 - a); piv.add(f); } });
  [-1, 1].forEach(s => { root.add(taper('harpy_leg', [[0.15 * s, -0.5, 0], [0.2 * s, -0.9, 0.15], [0.18 * s, -1.1, 0.25]], 0.08, 0.05, skin, 8, 6)); root.add(cone('talon', 0.05, 0.22, talon, [0.18 * s, -1.2, 0.35], [Math.PI / 2, 0, 0])); });
  return anim(root, t => { pivots.forEach(([p, s]) => { p.rotation.z = s * Math.sin(t * 9) * 0.7; }); root.position.y = Math.sin(t * 9 + 1) * 0.1; });
}
export function buildIceSpirit() {
  const root = grp('IceSpirit'), ice = M('spirit_ice', 0xcfeaff, { r: 0.1, e: 0x6ab8ff, ei: 0.5 }), core = M('spirit_core', 0xffffff, { e: 0xa8dcff, ei: 2 });
  root.add(mesh('spirit_core', new THREE.IcosahedronGeometry(0.5, 1), core));
  const shell = grp('shell'); root.add(shell);
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, b = (i % 3 - 1) * 0.7; const c = mesh('crystal', new THREE.OctahedronGeometry(0.35, 0), ice, [Math.cos(a) * 1.2, b, Math.sin(a) * 1.2], null, [0.6, 2.2, 0.6]); c.lookAt(0, 0, 0); c.rotateX(Math.PI / 2); shell.add(c); }
  [-1, 1].forEach(s => root.add(ball('spirit_eye', 0.09, M('eye_pupil', 0x123050), [0.18 * s, 0.1, 0.44], null, 10)));
  return anim(root, t => { shell.rotation.y = t * 0.8; shell.rotation.x = Math.sin(t * 0.6) * 0.3; root.position.y = Math.sin(t * 1.4) * 0.3; core.emissiveIntensity = 1.6 + Math.sin(t * 5) * 0.5; });
}
export function buildSeaSerpent(o = {}) {
  const S = o.scale || 1, root = grp(o.title || 'SeaSerpent'), sc = M((o.name || 'serpent') + '_scales', o.color || 0x2f7f8a, { r: 0.5 }), belly = M((o.name || 'serpent') + '_belly', o.belly || 0xd8e8a0), finM = M((o.name || 'serpent') + '_fin', o.fin || 0x5fd6c0, { side: DS }), eye = M('serpent_eye', 0xffe040, { e: 0xffa020, ei: 0.8 });
  const pts = [], N = 9; for (let i = 0; i < N; i++) pts.push([0, Math.sin(i * 0.9) * 1.4 * S, -i * 1.6 * S]);
  const bodyMesh = taper('serpent_body', pts, 0.75 * S, 0.12 * S, sc, 60, 16); root.add(bodyMesh);
  const head = grp('serpent_head', [0, 0.3 * S, 0.9 * S]); root.add(head);
  head.add(ball('serpent_skull', 0.85 * S, sc, [0, 0, 0], [0.9, 0.7, 1.3], 24));
  head.add(ball('serpent_jaw', 0.7 * S, belly, [0, -0.35 * S, 0.3 * S], [0.8, 0.35, 1.1], 18));
  [-1, 1].forEach(s => { head.add(ball('serpent_eye', 0.14 * S, eye, [0.5 * s * S, 0.25 * S, 0.5 * S], null, 12)); head.add(membrane('serpent_frill', [[0, 0], [0.9, 0.5], [1.1, -0.3, 1.2, 0.1], [0, -0.4]], finM, () => 0)).scale.setScalar(S); });
  head.children.filter(c => c.name === 'serpent_frill').forEach((f, i) => { f.position.set((i ? 0.6 : -0.6) * S, 0.2 * S, -0.3 * S); f.rotation.set(0, i ? 0.4 : Math.PI - 0.4, 0.3); });
  for (let i = 1; i < N - 1; i++) root.add(cone('serpent_spine', 0.18 * S * (1 - i / N), 0.7 * S * (1 - i / N), finM, [0, pts[i][1] + 0.65 * S * (1 - i / N), pts[i][2]], [-0.4, 0, 0]));
  return anim(root, t => { root.position.y = Math.sin(t * 0.9) * 0.4 * S; head.rotation.x = Math.sin(t * 1.3) * 0.15; root.rotation.y = Math.sin(t * 0.4) * 0.15; });
}

// ---------- Champions ----------
export function buildFlagship() {
  const root = grp('CaptainGalesFlagship'), ship = grp('ship'); root.add(ship);
  const wood = M('ship_wood', 0x6a4528, { r: 0.8 }), dark = M('ship_wood_dark', 0x3e2816, { r: 0.85 }), deckM = M('ship_deck', 0xa8814e, { r: 0.9 }), trim = M('brass', 0xd4a845, { r: 0.35, m: 0.35 }), gold = M('gold_leaf', 0xf0c24a, { r: 0.3, m: 0.5 });
  const iron = M('iron', 0x3a3a40, { m: 0.35, r: 0.4 }), red = M('flagship_red', 0x8a1f24, { r: 0.7 }), red2 = M('balloon_red', 0xc23b2c, { r: 0.7 }), cream = M('balloon_cream', 0xf1e3c4, { r: 0.7 }), rope = M('rope', 0xb89a6a, { r: 0.9 });
  const glass = M('stern_glass', 0xffd27a, { e: 0xffa830, ei: 1.4 }), black = M('flag_black', 0x1a1a20, { side: DS }), bone = M('bone', 0xf1ead6), sailM = M('sail', 0xf1e3c4, { side: DS }), coat = M('captain_coat', 0x7a1c22), skin = M('rider_skin', 0xf0c39c), hatM = M('hat_black', 0x1a1a20);
  const L = 16, Wd = 2.3;
  // Hull: a deformed box. Pointed bow (+z), rounded stern, V-bottom, sheer that rises at both ends.
  const hg = new THREE.BoxGeometry(Wd * 2, 4, L, 10, 8, 40), hp = hg.attributes.position, cols = [], cA = new THREE.Color(0x7a5232), cB = new THREE.Color(0x5e3e24), cW = new THREE.Color(0x2e1e10), cG = new THREE.Color(0xd4a845);
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i); const t = (z + L / 2) / L, yb = (y + 2) / 4;
    let w = 1; if (t > 0.62) w = 1 - Math.pow((t - 0.62) / 0.38, 1.7) * 0.97; if (t < 0.12) w = 0.82 + 0.18 * Math.sin(t / 0.12 * Math.PI / 2);
    w *= 0.38 + 0.62 * Math.pow(yb, 0.55); x *= w;
    if (y > 0) y += (t > 0.78 ? Math.pow((t - 0.78) / 0.22, 2) * 1.6 : 0) + (t < 0.2 ? Math.pow((0.2 - t) / 0.2, 2) * 2.4 : 0);
    else y += t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 2.2 : 0;
    hp.setXYZ(i, x, y, z);
    const band = Math.floor(yb * 9), c = (band === 6 || band === 2) ? cW : band === 8 ? cG : (band % 2 ? cA : cB); cols.push(c.r, c.g, c.b);
  }
  hg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); hg.computeVertexNormals();
  ship.add(mesh('hull', hg, new THREE.MeshStandardMaterial({ name: 'hull_planks', vertexColors: true, roughness: 0.8, flatShading: false })));
  ship.add(mesh('keel', new THREE.BoxGeometry(0.4, 0.5, L * 0.86), dark, [0, -2.1, -0.4]));
  // Decks
  const deckS = new THREE.Shape(); const outline = []; for (let i = 0; i <= 24; i++) { const t = i / 24, z = -L / 2 + t * L; let w = 1; if (t > 0.62) w = 1 - Math.pow((t - 0.62) / 0.38, 1.7) * 0.97; if (t < 0.12) w = 0.82 + 0.18 * Math.sin(t / 0.12 * Math.PI / 2); outline.push([Wd * 0.95 * w, z]); }
  deckS.moveTo(outline[0][0], outline[0][1]); outline.forEach(p => deckS.lineTo(p[0], p[1])); [...outline].reverse().forEach(p => deckS.lineTo(-p[0], p[1]));
  const deck = mesh('deck', new THREE.ShapeGeometry(deckS), deckM, [0, 2.02, 0], [Math.PI / 2, 0, 0]); deck.scale.y = -1; ship.add(deck);
  for (let k = -6; k <= 6; k++) ship.add(mesh('deck_plank_line', new THREE.BoxGeometry(0.03, 0.02, L * 0.7), dark, [k * 0.33, 2.04, 0.2]));
  // Rails + balusters
  const railPts = s => outline.filter((_, i) => i > 1 && i < 23).map(p => new THREE.Vector3(p[0] * s, 2.9 + (p[1] > L * 0.28 ? Math.pow((p[1] / (L / 2) - 0.56) / 0.44, 2) * 1.2 : 0), p[1]));
  [1, -1].forEach(s => { const pts = railPts(s); ship.add(mesh('rail', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.09, 6), trim)); pts.forEach((p, i) => { if (i % 1 === 0) ship.add(mesh('baluster', new THREE.CylinderGeometry(0.05, 0.06, p.y - 2.05, 5), wood, [p.x, (p.y + 2.05) / 2, p.z])); }); });
  // Stern castle with lit windows + quarterdeck rail
  const sc = grp('stern_castle', [0, 2, -L / 2 + 1.9]); ship.add(sc);
  sc.add(mesh('stern_cabin', new THREE.BoxGeometry(Wd * 1.7, 2.2, 3.4), wood, [0, 1.1, 0]));
  sc.add(mesh('stern_roof', new THREE.BoxGeometry(Wd * 1.85, 0.25, 3.7), dark, [0, 2.3, 0]));
  for (let k = -2; k <= 2; k++) { sc.add(mesh('stern_window', new THREE.PlaneGeometry(0.5, 0.7), glass, [k * 0.75, 1.1, -1.72], [0, Math.PI, 0])); sc.add(mesh('window_frame', new THREE.TorusGeometry(0.36, 0.05, 4, 4), gold, [k * 0.75, 1.1, -1.74], [0, 0, Math.PI / 4])); }
  [1, -1].forEach(s => { for (let k = 0; k < 3; k++) sc.add(mesh('side_window', new THREE.PlaneGeometry(0.45, 0.55), glass, [s * Wd * 0.86, 1.15, -1 + k * 0.9], [0, s * Math.PI / 2, 0])); });
  sc.add(mesh('stern_carving', new THREE.TorusGeometry(1.1, 0.12, 6, 20, Math.PI), gold, [0, 2.05, -1.75]));
  for (let k = -3; k <= 3; k++) sc.add(mesh('quarter_baluster', new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), trim, [k * 0.55, 2.75, -1.6]));
  sc.add(mesh('quarter_rail', new THREE.BoxGeometry(Wd * 1.75, 0.1, 0.1), gold, [0, 3.1, -1.6]));
  // Lanterns
  const lanterns = [];
  [[1.9, 4.6, -L / 2 + 0.3], [-1.9, 4.6, -L / 2 + 0.3], [0, 4.4, L / 2 - 0.6]].forEach(p => { const lg = grp('lantern', p); lg.add(mesh('lantern_cage', new THREE.CylinderGeometry(0.22, 0.28, 0.6, 6), iron)); const gl = mesh('lantern_glow', new THREE.SphereGeometry(0.2, 10, 8), M('lantern_glow', 0xffe0a0, { e: 0xffb040, ei: 2 })); lg.add(gl); lanterns.push(gl); ship.add(lg); });
  // Forecastle, bowsprit, dragon figurehead
  ship.add(mesh('forecastle', new THREE.BoxGeometry(Wd * 1.3, 0.9, 2.4), wood, [0, 2.45, L / 2 - 3.2]));
  ship.add(mesh('bowsprit', new THREE.CylinderGeometry(0.12, 0.2, 6, 8), wood, [0, 4.2, L / 2 + 1.7], [Math.PI / 2 - 0.35, 0, 0]));
  const fig = grp('figurehead', [0, 2.9, L / 2 + 0.25]); ship.add(fig);
  fig.add(taper('figure_neck', [[0, -0.6, -0.4], [0, 0.2, 0.3], [0, 0.6, 0.9]], 0.36, 0.22, gold, 12, 8));
  fig.add(ball('figure_head', 0.38, gold, [0, 0.75, 1.15], [0.8, 0.7, 1.3], 14));
  [1, -1].forEach(s => { fig.add(cone('figure_horn', 0.07, 0.5, gold, [0.18 * s, 1.05, 0.85], [-0.9, 0, 0])); fig.add(ball('figure_eye', 0.07, red2, [0.22 * s, 0.85, 1.4], null, 8)); });
  // Masts, yards, furled sails, crow's nest
  [[0, 3.2], [0, -2.6]].forEach(([x, z], i) => { const h = i ? 6.5 : 7.5, mg = grp('mast', [x, 2, z]); ship.add(mg);
    mg.add(mesh('mast_pole', new THREE.CylinderGeometry(0.13, 0.2, h, 8), wood, [0, h / 2, 0]));
    mg.add(mesh('yard', new THREE.CylinderGeometry(0.07, 0.07, 4.4, 6), wood, [0, h * 0.62, 0], [0, 0, Math.PI / 2]));
    mg.add(mesh('furled_sail', new THREE.CylinderGeometry(0.2, 0.2, 4, 8), sailM, [0, h * 0.62 - 0.22, 0], [0, 0, Math.PI / 2]));
    mg.add(mesh('sail', new THREE.PlaneGeometry(3.6, h * 0.42, 6, 4).translate(0, -h * 0.21, 0), sailM, [0, h * 0.6, 0.1]));
    if (!i) { mg.add(mesh('crows_nest', new THREE.CylinderGeometry(0.55, 0.45, 0.5, 10, 1, true), wood, [0, h - 0.6, 0])); mg.add(mesh('crows_floor', new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10), dark, [0, h - 0.85, 0])); } });
  // Envelopes: one great striped hull-balloon and two side balloons, with ribs, fins and rigging
  const env = (name, pos, r, len, c1, c2) => { const g = grp(name, pos);
    for (let i = 0; i < 12; i++) g.add(mesh('gore', new THREE.SphereGeometry(r, 28, 18, i / 12 * Math.PI * 2, Math.PI / 6), i % 2 ? c1 : c2, null, null, [1, 0.92, len]));
    for (let k = -2; k <= 2; k++) { const zz = k * r * len * 0.36, rr = r * Math.sqrt(1 - Math.pow(zz / (r * len), 2)); g.add(mesh('envelope_rib', new THREE.TorusGeometry(rr * 1.005, 0.07, 6, 32), dark, [0, 0, zz], null, [1, 0.92, 1])); }
    g.add(ball('nose_cap', r * 0.25, trim, [0, 0, r * len * 0.98], [1, 1, 0.5], 12));
    [[0, 1], [1, 0], [-1, 0]].forEach(([fx, fy]) => { const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(r * 0.9, -r * 0.5); fin.lineTo(r * 0.9, r * 0.25); fin.lineTo(0, r * 0.45); fin.closePath(); const m = mesh('tail_fin', new THREE.ShapeGeometry(fin), M('fin_red', 0x8a1f24, { side: DS }), [fx * r * 0.7, fy * r * 0.62, -r * len * 0.82]); m.rotation.set(0, Math.PI / 2, fy ? Math.PI / 2 : 0); if (fx < 0) m.rotation.z = Math.PI; g.add(m); });
    return g; };
  const main = env('main_envelope', [0, 13.2, -0.2], 3.6, 2.15, red, cream); ship.add(main);
  const sideL = env('side_envelope', [4.6, 10.6, 0.6], 1.9, 2.2, red2, cream), sideR = env('side_envelope', [-4.6, 10.6, 0.6], 1.9, 2.2, red2, cream); ship.add(sideL, sideR);
  [1, -1].forEach(s => ship.add(taper('outrigger', [[s * Wd * 0.9, 3.6, 0.6], [s * 3.2, 7, 0.6], [s * 4.6, 8.8, 0.6]], 0.14, 0.1, dark, 8, 6)));
  const ropeTo = (a, b) => ship.add(taper('rigging', [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.2, (a[2] + b[2]) / 2], b], 0.035, 0.035, rope, 4, 4));
  [-5.5, -2.5, 0.5, 3.5, 6].forEach(z => [1, -1].forEach(s => ropeTo([s * Wd * 0.85, 2.9, z], [s * 2.4, 10.2, z * 0.92])));
  [1, -1].forEach(s => [-1.5, 2.5].forEach(z => ropeTo([s * Wd * 0.85, 2.9, z], [s * 4.6, 9, z * 0.6])));
  ropeTo([0, 4.9, L / 2 + 3.9], [0, 12, 6.8]); ropeTo([0, 9.4, 3.2], [0, 12.4, 4]); ropeTo([0, 8.4, -2.6], [0, 12.2, -3.6]);
  // Propellers + rudder
  const props = [];
  [1, -1].forEach(s => { const pg = grp('propeller', [s * 2.6, 3.4, -L / 2 - 0.2]); pg.add(mesh('prop_shaft', new THREE.CylinderGeometry(0.14, 0.14, 1.4, 8), iron, [0, 0, 0.6], [Math.PI / 2, 0, 0])); pg.add(ball('prop_hub', 0.25, trim, null, null, 10));
    const blades = grp('prop_blades'); for (let k = 0; k < 4; k++) { const bl = mesh('prop_blade', new THREE.BoxGeometry(0.34, 1.6, 0.06), wood, [0, 0.8, 0]); const arm = grp('arm'); arm.rotation.z = k * Math.PI / 2; arm.add(bl); blades.add(arm); } pg.add(blades); props.push(blades); ship.add(pg);
    ship.add(taper('prop_strut', [[s * Wd * 0.7, 2.2, -L / 2 + 1], [s * 2.6, 3.4, -L / 2 - 0.1]], 0.1, 0.08, iron, 4, 6)); });
  const rud = new THREE.Shape(); rud.moveTo(0, 0); rud.lineTo(-1.6, -0.2); rud.lineTo(-1.4, -2.6); rud.lineTo(0, -3); rud.closePath();
  ship.add(mesh('rudder', new THREE.ExtrudeGeometry(rud, { depth: 0.16, bevelEnabled: false }).translate(0, 0, -0.08), dark, [0, 1.4, -L / 2 + 0.2], [0, Math.PI / 2, 0]));
  // Broadside cannons with port lids + bow chasers
  for (let i = 0; i < 5; i++) [1, -1].forEach(s => { const z = -4.2 + i * 1.9, w = 0.92 * Wd; const c = mesh('broadside_cannon', new THREE.CylinderGeometry(0.15, 0.22, 1.3, 10), iron, [s * (w + 0.35), 0.6, z], [0, 0, s * Math.PI / 2]); ship.add(c); ship.add(mesh('cannon_muzzle', new THREE.TorusGeometry(0.17, 0.05, 6, 12), iron, [s * (w + 1), 0.6, z], [0, Math.PI / 2, 0])); ship.add(mesh('gunport_lid', new THREE.BoxGeometry(0.06, 0.6, 0.7), red, [s * (w + 0.1), 1.15, z], [0, 0, s * 0.6])); });
  [1, -1].forEach(s => ship.add(mesh('bow_chaser', new THREE.CylinderGeometry(0.13, 0.18, 1.4, 10), trim, [s * 0.5, 3.2, L / 2 - 1.7], [Math.PI / 2, 0, 0])));
  // Anchor
  const an = grp('anchor', [1.7, 0.4, L / 2 - 3.2]); an.add(mesh('anchor_shank', new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), iron)); an.add(mesh('anchor_arms', new THREE.TorusGeometry(0.55, 0.07, 6, 12, Math.PI), iron, [0, -0.6, 0], [0, 0, Math.PI])); ship.add(an);
  // Captain Gale + crew
  const person = (pos, coatM, captain) => { const g = grp(captain ? 'captain_gale' : 'pirate_crew', pos);
    g.add(mesh('body', new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), coatM, [0, 0.55, 0])); g.add(ball('head', 0.22, skin, [0, 1.2, 0], null, 12));
    if (captain) { g.add(mesh('tricorn', new THREE.ConeGeometry(0.42, 0.26, 3), hatM, [0, 1.42, 0])); g.add(mesh('hat_band', new THREE.TorusGeometry(0.26, 0.04, 4, 12), gold, [0, 1.36, 0], [Math.PI / 2, 0, 0])); g.add(mesh('coat_tails', new THREE.ConeGeometry(0.36, 0.6, 8, 1, true), coatM, [0, 0.25, 0])); g.add(mesh('cutlass', new THREE.BoxGeometry(0.05, 0.9, 0.12), M('steel', 0xd8dce2, { m: 0.6, r: 0.25 }), [0.4, 0.7, 0.25], [0.5, 0, 0])); g.add(mesh('epaulette', new THREE.BoxGeometry(0.62, 0.08, 0.2), gold, [0, 0.92, 0])); }
    else g.add(mesh('bandana', new THREE.SphereGeometry(0.23, 10, 6, 0, 6.283, 0, 1.4), red2, [0, 1.25, 0]));
    ship.add(g); return g; };
  const cap = person([0, 4.55, -L / 2 + 2.6], coat, true); cap.scale.setScalar(1.25);
  const crew = [person([1.1, 2.05, 2], M('crew_shirt', 0xe8dcc0)), person([-1.2, 2.05, -0.8], M('crew_shirt2', 0x2f3a5a)), person([0.5, 2.05, -3.5], M('crew_shirt', 0xe8dcc0)), person([0, 7.9 + 2, 3.2], M('crew_shirt2', 0x2f3a5a))];
  // Flags
  const flag = mesh('jolly_roger', new THREE.PlaneGeometry(2.4, 1.5, 8, 2).translate(1.2, 0, 0), black, [0, 18.2, -0.6]); ship.add(flag); ship.add(mesh('flag_pole', new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), iron, [0, 17.6, -0.6]));
  flag.add(ball('skull', 0.26, bone, [1.2, 0.12, 0.03], [1, 1, 0.3], 10)); flag.add(mesh('crossbone', new THREE.BoxGeometry(0.9, 0.09, 0.04), bone, [1.2, -0.28, 0.03], [0, 0, 0.5])); flag.add(mesh('crossbone', new THREE.BoxGeometry(0.9, 0.09, 0.04), bone, [1.2, -0.28, 0.03], [0, 0, -0.5]));
  const pens = [[0, 10.6, 3.2], [0, 9.6, -2.6]].map(p => { const pn = new THREE.Shape(); pn.moveTo(0, 0); pn.lineTo(1.6, 0.18); pn.lineTo(0, 0.36); pn.closePath(); const m = mesh('pennant', new THREE.ShapeGeometry(pn, 6), red2, p, [0, Math.PI / 2, 0]); ship.add(m); return m; });
  const fbase = Float32Array.from(flag.geometry.attributes.position.array);
  root.scale.setScalar(1.55);
  return anim(root, t => {
    root.rotation.z = Math.sin(t * 0.6) * 0.035; root.rotation.x = Math.sin(t * 0.45) * 0.02; ship.position.y = Math.sin(t * 0.5) * 0.4;
    props.forEach((p, i) => { p.rotation.z = t * 14 * (i ? -1 : 1); });
    const fp = flag.geometry.attributes.position; for (let i = 0; i < fp.count; i++) { const x = fbase[i * 3]; fp.setZ(i, Math.sin(t * 6 + x * 2.2) * 0.18 * x / 2.4); } fp.needsUpdate = true;
    pens.forEach((p, i) => { p.rotation.x = Math.sin(t * 5 + i) * 0.25; });
    lanterns.forEach((l, i) => { l.material.emissiveIntensity = 1.6 + Math.sin(t * 9 + i * 2) * 0.35 + Math.random() * 0.2; });
    crew.forEach((c, i) => { c.rotation.y = Math.sin(t * 0.7 + i * 2) * 0.8; c.position.y += Math.sin(t * 3 + i) * 0.002; });
    cap.rotation.y = Math.sin(t * 0.4) * 0.5;
  });
}
export function buildIronDrake() {
  const d = buildEmber({ palette: { scale: 0x7a7a84, belly: 0x9a8a6a, wing: 0x5a5a64, horn: 0xc9a24a, m: 0.4, r: 0.35, we: 0x401a0a }, name: 'irondrake', title: 'IronDrake', noRider: true });
  const { body, head } = d.userData.parts, ember = M('drake_furnace', 0xff8030, { e: 0xff5a14, ei: 2 }), brass = M('brass', 0xd4a845, { r: 0.35, m: 0.35 });
  body.add(ball('furnace_heart', 0.45, ember, [0, -0.1, 1.55], [1, 1, 0.5], 16));
  for (let i = 0; i < 7; i++) body.add(mesh('rivet_band', new THREE.TorusGeometry(0.95 - Math.abs(i - 3) * 0.06, 0.035, 6, 32), brass, [0, 0, -1.2 + i * 0.42], null, [1.05, 0.95, 1]));
  [-1, 1].forEach(s => body.add(mesh('gear', new THREE.TorusGeometry(0.35, 0.09, 6, 12), brass, [0.98 * s, 0.25, 0.3], [0, Math.PI / 2, 0])));
  [-1, 1].forEach(s => head.add(ball('furnace_eye', 0.1, ember, [0.42 * s, 0.14, 0.31], null, 10)));
  d.scale.setScalar(3.2);
  const u0 = d.userData.update; d.userData.update = (t, s) => { u0(t, s); ember.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.6; body.children.filter(c => c.name === 'gear').forEach(g => { g.rotation.x = t * 2; }); };
  return d;
}
export const buildFrostWyrm = () => { const w = buildSeaSerpent({ scale: 3.4, name: 'frostwyrm', title: 'FrostWyrm', color: 0xdfeefa, belly: 0x9fc8e6, fin: 0x7fb8e6 }); return w; };
export function buildStormTitan() {
  const root = grp('StormTitan'), cloud = M('titan_cloud', 0x4a4858, { r: 1 }), dark = M('titan_dark', 0x2e2c3a, { r: 1 }), glow = M('titan_eye', 0xdff0ff, { e: 0x9fd0ff, ei: 2.5 }), bolt = M('titan_bolt', 0xffffff, { e: 0xbfe4ff, ei: 3 });
  const puffs = [[0, 0, 0, 5], [4, 1, -1, 3.6], [-4, 1, -1, 3.6], [2.5, 3.6, -0.5, 3.2], [-2.5, 3.6, -0.5, 3.2], [0, 4.6, -1.4, 3], [6.5, -1.4, -1, 2.6], [-6.5, -1.4, -1, 2.6], [0, -3.4, 0, 3.4]];
  puffs.forEach((p, i) => root.add(ball('titan_puff', p[3], i % 2 ? cloud : dark, [p[0], p[1], p[2]], null, 18)));
  [-1, 1].forEach(s => { root.add(ball('titan_eye', 0.8, glow, [1.6 * s, 1.2, 4.3], [1, 0.6, 0.4], 16)); root.add(mesh('titan_brow', new THREE.BoxGeometry(2, 0.5, 0.6), dark, [1.6 * s, 2.2, 4.4], [0, 0, -0.3 * s])); });
  root.add(mesh('titan_mouth', new THREE.TorusGeometry(1.2, 0.3, 8, 20, Math.PI), dark, [0, -1, 4.6], [0, 0, Math.PI]));
  const bolts = [];
  [-1, 1].forEach(s => { const g = grp('arm_bolt', [6.5 * s, -2, 0]); for (let i = 0; i < 5; i++) g.add(mesh('bolt_seg', new THREE.BoxGeometry(0.25, 1.4, 0.25), bolt, [Math.sin(i * 2) * 0.5, -i * 1.2, 0], [0, 0, (i % 2 ? 0.5 : -0.5)])); root.add(g); bolts.push(g); });
  return anim(root, t => { root.children.forEach((c, i) => { if (c.name === 'titan_puff') c.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.04); }); bolts.forEach((b, i) => { b.visible = Math.sin(t * 9 + i * 3) > 0.2; }); glow.emissiveIntensity = 2 + Math.sin(t * 4) * 0.8; });
}
export function buildKraken() {
  const root = grp('Kraken'), skin = M('kraken_skin', 0x9a3a5a, { r: 0.55 }), sucker = M('kraken_sucker', 0xf0b8c0), eye = M('kraken_eye', 0xffe040, { e: 0xffa020, ei: 1 }), pupil = M('eye_pupil', 0x2a1608);
  root.add(ball('kraken_mantle', 3, skin, [0, 3.2, -1], [1, 1.5, 1.1], 28));
  [-1, 1].forEach(s => { root.add(ball('kraken_eye', 0.8, eye, [1.9 * s, 2, 1.6], null, 16)); root.add(ball('kraken_pupil', 0.4, pupil, [2.1 * s, 2, 2.2], [0.5, 1.2, 0.5], 12)); });
  const arms = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, g = grp('tentacle', [Math.cos(a) * 2, 0, Math.sin(a) * 2]); g.rotation.y = -a + Math.PI / 2;
    g.add(taper('tentacle', [[0, 0, 0], [0, 1.5, 2.5], [0, 4, 4.5], [0, 7, 5], [0, 9, 3.5]], 0.8, 0.12, skin, 30, 10));
    for (let k = 1; k < 5; k++) g.add(ball('sucker', 0.18, sucker, [0, k * 1.7, 2 + k * 0.6], null, 8)); root.add(g); arms.push(g); }
  return anim(root, t => { arms.forEach((g, i) => { g.rotation.x = Math.sin(t * 1.2 + i) * 0.25 - 0.2; g.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.15; }); root.position.y = Math.sin(t * 0.6) * 0.4; });
}
export function buildSkyFortress() {
  const root = grp('PirateKingsSkyFortress'), rock = M('fortress_rock', 0x7a6a5a, { r: 0.95 }), stone = M('fortress_stone', 0x5a5a64), black = M('flag_black', 0x1a1a20, { side: DS }), gold = M('brass', 0xd4a845, { r: 0.35, m: 0.35 }), red = M('balloon_red', 0xc23b2c, { r: 0.7 }), iron = M('iron', 0x3a3a40, { m: 0.35, r: 0.4 });
  root.add(mesh('fortress_rock', new THREE.ConeGeometry(14, 22, 9, 3), rock, [0, -11, 0], [Math.PI, 0, 0]));
  root.add(mesh('fortress_base', new THREE.CylinderGeometry(14, 14, 3, 18), stone, [0, 1.5, 0]));
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; root.add(mesh('fortress_tower', new THREE.CylinderGeometry(2, 2.3, 10, 10), stone, [Math.cos(a) * 11, 8, Math.sin(a) * 11])); root.add(mesh('tower_roof', new THREE.ConeGeometry(2.6, 3.6, 10), red, [Math.cos(a) * 11, 14.8, Math.sin(a) * 11]));
    root.add(mesh('fortress_cannon', new THREE.CylinderGeometry(0.4, 0.55, 3, 10), iron, [Math.cos(a) * 13.4, 6, Math.sin(a) * 13.4], [Math.PI / 2, -a + Math.PI / 2, 0], null)); }
  root.add(mesh('keep', new THREE.BoxGeometry(9, 14, 9), stone, [0, 10, 0])); root.add(mesh('keep_crown', new THREE.CylinderGeometry(5.5, 5.5, 1.2, 6), gold, [0, 17.6, 0]));
  root.add(mesh('pole', new THREE.CylinderGeometry(0.2, 0.2, 8, 6), iron, [0, 21, 0])); root.add(mesh('king_flag', new THREE.PlaneGeometry(4, 2.4), black, [2, 23.5, 0]));
  [[-9, 24, 0], [9, 24, 0], [0, 26, -9]].forEach((p, i) => root.add(ball('fortress_balloon', 5, i ? red : M('flagship_red', 0x8a1f24, { r: 0.7 }), p, [1, 1.2, 1.6], 20)));
  return anim(root, t => { root.position.y = Math.sin(t * 0.4) * 0.8; root.rotation.y = t * 0.03; });
}

export const BESTIARY = {
  dragons: { Breeze: () => buildDragon('Breeze'), Ember: () => buildDragon('Ember'), Frost: () => buildDragon('Frost'), Storm: () => buildDragon('Storm'), Tide: () => buildDragon('Tide'), Gold: () => buildDragon('Gold') },
  enemies: { 'Pirate Balloon': buildPirateBalloon, 'Griffin Knight': buildGriffinKnight, 'Wild Wyvern': buildWyvern, 'Harpy': buildHarpy, 'Ice Spirit': buildIceSpirit, 'Sea Serpent': () => buildSeaSerpent() },
  champions: { "Captain Gale's Flagship": buildFlagship, 'The Iron Drake': buildIronDrake, 'The Frost Wyrm': buildFrostWyrm, 'The Storm Titan': buildStormTitan, 'The Kraken': buildKraken, "Pirate King's Sky Fortress": buildSkyFortress }
};
