// Hand-built low-poly kit (flat colours, flat shading) in the LowPoly City style.
// Each model: { id, name, cat, group } — meshes grouped per colour; rig/rotor parts are separate meshes
// positioned at their pivot (userData.spin / userData.rig describe how they move).
export function buildKit(T, BGU) {
  const C = {
    wood: '#b07a4c', woodDk: '#7a5234', stone: '#b8b3a7', stoneDk: '#8f8a80', tar: '#55585e', line: '#f1efe6', kerb: '#d9d5ca',
    red: '#e0483c', yellow: '#f4c430', blue: '#3b7dd8', green: '#58b35a', steel: '#9aa3ab', dark: '#34373c', sand: '#e6d29a',
    bag: '#c8b07a', bagDk: '#a88f5c', rubber: '#d4574a', rope: '#e9e2cf', white: '#f4f4ef', orange: '#f08a2c',
  };
  const mats = {};
  const mat = c => mats[c] || (mats[c] = new T.MeshStandardMaterial({ name: 'kit_' + c.slice(1), color: c, roughness: 0.9, metalness: 0, flatShading: true }));
  const prep = g => { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.computeVertexNormals(); return g; };
  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  function model(id, name, cat, fn, { norm = true } = {}) {
    const parts = new Map(); // part → colour → geos
    const add = (col, geo, m, part = 'main') => { const g = prep(geo.clone()); if (m) g.applyMatrix4(m); const P = parts.get(part) || parts.set(part, new Map()).get(part); (P.get(col) || P.set(col, []).get(col)).push(g); };
    const box = (col, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, part) => add(col, new T.BoxGeometry(w, h, d), M(x, y, z, rx, ry, rz), part);
    const cyl = (col, r1, r2, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, part) => add(col, new T.CylinderGeometry(r1, r2, h, seg), M(x, y, z, rx, ry, rz), part);
    const bar = (col, r, a, b, part, seg = 6) => { const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), L = d.length(); const g = new T.CylinderGeometry(r, r, L, seg); const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); add(col, g, new T.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1)), part); };
    // side-profile prism: pts [[z,y]...] in the z/y plane, extruded across x from x0 to x1
    const prism = (col, pts, x0, x1, part) => { const s = new T.Shape(pts.map(([z, y]) => new T.Vector2(z, y))); const g = new T.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false }); g.applyMatrix4(new T.Matrix4().makeRotationY(-Math.PI / 2)); g.translate(x1, 0, 0); add(col, g, null, part); };
    const meta = {};
    fn({ add, box, cyl, bar, prism, C, meta });
    const out = new T.Group(); out.name = id; const all = [];
    for (const [part, cols] of parts) for (const [col, geos] of cols) {
      const g = BGU.mergeGeometries(geos, false); const m = new T.Mesh(g, mat(col)); m.name = id + '#' + (part === 'main' ? all.length : part + '_' + all.length); m.userData.part = part; all.push(m); out.add(m);
    }
    const box0 = new T.Box3().setFromObject(out), c = box0.getCenter(new T.Vector3());
    const shift = norm ? new T.Vector3(-c.x, -box0.min.y, -c.z) : new T.Vector3();
    for (const m of all) m.geometry.translate(shift.x, shift.y, shift.z);
    // movable parts: re-centre geometry on their pivot, place the mesh at the pivot
    for (const m of all) { const pv = meta[m.userData.part]; if (!pv) continue; const p = new T.Vector3(...pv.pivot).add(shift); m.geometry.translate(-p.x, -p.y, -p.z); m.position.copy(p); if (pv.spin) m.userData.spin = pv.spin; if (pv.rig) m.userData.rig = pv.rig; }
    let tris = 0; for (const m of all) { m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); tris += m.geometry.attributes.position.count / 3; }
    const f = new T.Box3().setFromObject(out).getSize(new T.Vector3());
    return { group: out, info: { id, name, cat, src: 'kit', w: +f.x.toFixed(2), h: +f.y.toFixed(2), d: +f.z.toFixed(2), tris: Math.round(tris), mats: all.length } };
  }
  const list = [];
  // Bridge approach ramp: 24 m, road level (+z end) up to the 4 m deck (-z end). Origin = low end centre line, road level.
  list.push(model('bridge_ramp', 'Bridge ramp', 'ground', ({ prism, box, C }) => {
    const L = 24, H = 4, z0 = 12, z1 = -12, y = z => H * (z0 - z) / L;
    prism(C.stone, [[z0, 0], [z1, H - 0.02], [z1, -3], [z0, -3]], -9, 9);
    prism(C.tar, [[z0, 0.03], [z1, H + 0.03], [z1, H - 0.1], [z0, -0.1]], -6, 6);
    for (const s of [-1, 1]) {
      prism(C.kerb, [[z0, 0.15], [z1, H + 0.15], [z1, H - 0.1], [z0, -0.1]], s < 0 ? -8.6 : 6, s < 0 ? -6 : 8.6);
      prism(C.stoneDk, [[z0, 1.05], [z1, H + 1.05], [z1, H - 0.1], [z0, -0.1]], s < 0 ? -9 : 8.6, s < 0 ? -8.6 : 9);
    }
    const ang = Math.atan2(H, L);
    for (let z = z0 - 2; z > z1 + 1; z -= 4) box(C.line, 0.25, 0.04, 2, 0, y(z) + 0.06, z, ang);
  }, { norm: false }));
  // Jetty: 3 m deck, 20 m long on piles, bollards + ladder at the end
  list.push(model('hb_jetty', 'Jetty', 'ground', ({ box, cyl, C }) => {
    const Y = 2.6;
    for (let z = -9.5; z <= 9.6; z += 0.5) box(z % 1 === 0 ? C.wood : C.woodDk, 3, 0.12, 0.46, 0, Y, z);
    for (const s of [-1, 1]) { box(C.woodDk, 0.2, 0.25, 20, s * 1.4, Y - 0.18, 0); for (let z = -9.5; z <= 9.5; z += 3.8) cyl(C.woodDk, 0.16, 0.16, Y + 0.3, 6, s * 1.55, (Y + 0.3) / 2 - 0.2, z); }
    for (const s of [-1, 1]) { cyl(C.dark, 0.14, 0.18, 0.4, 7, s * 1.1, Y + 0.26, 9); cyl(C.dark, 0.2, 0.2, 0.06, 7, s * 1.1, Y + 0.48, 9); }
    for (let y = 0.4; y < Y; y += 0.35) box(C.steel, 0.6, 0.05, 0.05, 0.6, y, 10.05);
    for (const s of [-1, 1]) box(C.steel, 0.05, Y + 0.6, 0.05, 0.6 + s * 0.3, Y / 2 + 0.2, 10.05);
    cyl(C.orange, 0.3, 0.3, 0.12, 10, -1.3, Y + 0.6, -6, Math.PI / 2, 0, 0); box(C.woodDk, 0.1, 0.9, 0.1, -1.3, Y + 0.4, -6.2);
  }));
  // Slipway: 5 m wide concrete ramp, 30 m long, 2.5 m drop, grooved surface, kerbs + winch post at the top (-z)
  list.push(model('hb_slipway', 'Slipway', 'ground', ({ prism, box, cyl, C }) => {
    const L = 30, H = 2.5, z0 = -15, z1 = 15, ang = Math.atan2(H, L), y = z => 0.1 + H * (z1 - z) / L;
    prism(C.stone, [[z1, 0.1], [z0, H + 0.1], [z0, 0], [z1, 0]], -2.5, 2.5);
    for (const s of [-1, 1]) prism(C.stoneDk, [[z1, 0.35], [z0, H + 0.35], [z0, 0], [z1, 0]], s < 0 ? -2.9 : 2.5, s < 0 ? -2.5 : 2.9);
    for (let z = z0 + 1.5; z < z1 - 0.5; z += 1.5) box(C.stoneDk, 4.6, 0.04, 0.12, 0, y(z) + 0.02, z, -ang);
    box(C.stoneDk, 1.2, 0.8, 1.2, 0, H + 0.5, z0 - 0.6); cyl(C.yellow, 0.3, 0.3, 0.9, 8, 0, H + 1.05, z0 - 0.6, 0, 0, Math.PI / 2); cyl(C.dark, 0.08, 0.08, 1.2, 6, 0, H + 1.05, z0 - 0.6, 0, 0, Math.PI / 2);
  }));
  // Turntable ladder rig (Cat Rescue): turntable yaws, base section pitches, two fly sections slide out, cage at the tip.
  list.push(model('lr_ladder_rig', 'Ladder rig', 'vehicles', ({ box, cyl, bar, C, meta }) => {
    const hy = 0.9; // pivot height of the ladder above the turntable base
    cyl(C.dark, 1.1, 1.2, 0.35, 12, 0, 0.175, 0, 0, 0, 0, 'turntable'); box(C.red, 1.4, 0.7, 1.2, 0, 0.7, 0.2, 0, 0, 0, 'turntable'); box(C.steel, 0.5, 0.6, 0.5, 0, hy, -0.2, 0, 0, 0, 'turntable');
    const section = (part, w, len, z0, col) => { for (const s of [-1, 1]) box(col, 0.12, 0.28, len, s * w / 2, hy + 0.35, z0 + len / 2, 0, 0, 0, part); for (let z = z0 + 0.3; z < z0 + len; z += 0.4) box(C.steel, w, 0.06, 0.06, 0, hy + 0.37, z, 0, 0, 0, part); };
    const at = (part, dz) => { meta[part] = { pivot: [0, hy + 0.35, -0.4 + dz], rig: { role: part } }; };
    section('base', 1.0, 6, -0.4, C.white); at('base', 0); meta.base.rig = { role: 'base', pitch: [0, 75] };
    for (const [part, w, dz, col] of [['fly1', 0.86, 1.0, C.steel], ['fly2', 0.72, 2.0, C.white]]) { const y = hy + 0.35 + (part === 'fly1' ? 0.18 : 0.34); for (const s of [-1, 1]) box(col, 0.1, 0.22, 5.4, s * w / 2, y, -0.4 + dz + 2.7, 0, 0, 0, part); for (let z = 0.3; z < 5.4; z += 0.4) box(C.steel, w, 0.05, 0.05, 0, y + 0.02, -0.4 + dz + z, 0, 0, 0, part); meta[part] = { pivot: [0, y, -0.4 + dz], rig: { role: part, slide: [0, 5] } }; }
    const cz = -0.4 + 2 + 5.6, cy = hy + 0.35 + 0.34;
    box(C.red, 1.2, 0.08, 0.9, 0, cy - 0.4, cz + 0.45, 0, 0, 0, 'cage');
    for (const [x, z] of [[-0.58, 0], [0.58, 0], [-0.58, 0.9], [0.58, 0.9]]) bar(C.red, 0.035, [x, cy - 0.4, cz + z], [x, cy + 0.6, cz + z], 'cage');
    for (const z of [0, 0.9]) bar(C.red, 0.035, [-0.58, cy + 0.6, cz + z], [0.58, cy + 0.6, cz + z], 'cage');
    for (const x of [-0.58, 0.58]) bar(C.red, 0.035, [x, cy + 0.6, cz], [x, cy + 0.6, cz + 0.9], 'cage');
    meta.cage = { pivot: [0, cy, cz], rig: { role: 'cage', staysLevel: true } };
    meta.turntable = { pivot: [0, 0, 0], rig: { role: 'turntable', yaw: [-180, 180] } };
  }));
  // Sandbags
  const bag = (add, x, y, z, ry, C, dk) => add(dk ? C.bagDk : C.bag, new T.SphereGeometry(1, 7, 4), M(x, y, z, 0, ry, 0, 0.36, 0.13, 0.22));
  list.push(model('sb_sandbag', 'Sandbag', 'props', ({ add, C }) => bag(add, 0, 0.13, 0, 0, C)));
  list.push(model('sb_wall', 'Sandbag wall (2.4 m)', 'props', ({ add, C }) => {
    for (let row = 0; row < 3; row++) { const n = 4 - (row === 2 ? 1 : 0), off = row % 2 ? 0.33 : 0; for (let i = 0; i < n; i++) bag(add, -1 + i * 0.66 + off, 0.12 + row * 0.22, (row === 0 ? 0.12 : 0) * (i % 2 ? 1 : -1), (i * 0.37 + row) % 0.3 - 0.15, C, (i + row) % 3 === 0); }
    for (let i = 0; i < 4; i++) bag(add, -1 + i * 0.66, 0.12, 0.42, 0.1 * (i % 2), C, i % 2);
  }));
  // Police tape: two posts, 5 m of striped tape
  list.push(model('pt_police_tape', 'Police tape (5 m)', 'props', ({ box, cyl, C }) => {
    for (const s of [-1, 1]) { cyl(C.white, 0.05, 0.05, 1.0, 6, s * 2.5, 0.5, 0); cyl(C.dark, 0.2, 0.22, 0.08, 8, s * 2.5, 0.04, 0); cyl(C.red, 0.055, 0.055, 0.14, 6, s * 2.5, 0.75, 0); }
    for (let i = 0; i < 10; i++) box(i % 2 ? C.dark : C.yellow, 0.5, 0.08, 0.012, -2.25 + i * 0.5, 0.9 - Math.sin((i + 0.5) / 10 * Math.PI) * 0.06, 0);
  }));
  // Playground
  list.push(model('pg_pad', 'Playground surface', 'ground', ({ box, C }) => { box(C.rubber, 14, 0.06, 10, 0, 0.03, 0); box(C.kerb, 14.4, 0.04, 10.4, 0, 0.02, 0); }));
  list.push(model('pg_swings', 'Swings', 'props', ({ bar, box, C }) => {
    const H = 2.4, W = 3.6;
    for (const s of [-1, 1]) { bar(C.red, 0.06, [s * W / 2, 0, -0.9], [s * W / 2, H, 0]); bar(C.red, 0.06, [s * W / 2, 0, 0.9], [s * W / 2, H, 0]); }
    bar(C.red, 0.07, [-W / 2 - 0.1, H, 0], [W / 2 + 0.1, H, 0]);
    for (const x of [-0.8, 0.8]) { for (const dx of [-0.22, 0.22]) bar(C.steel, 0.015, [x + dx, H, 0], [x + dx, 0.5, 0], 'main', 4); box(C.dark, 0.5, 0.05, 0.22, x, 0.48, 0); }
  }));
  list.push(model('pg_slide', 'Slide', 'props', ({ box, bar, prism, C }) => {
    const P = 1.6;
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) bar(C.blue, 0.05, [x, 0, z - 1.6], [x, P + 0.9, z - 1.6]);
    box(C.wood, 1.1, 0.08, 1.1, 0, P, -1.6); for (const s of [-1, 1]) box(C.blue, 0.05, 0.05, 1.0, s * 0.5, P + 0.8, -1.6);
    for (let y = 0.3; y < P; y += 0.35) box(C.steel, 0.9, 0.05, 0.05, 0, y, -2.12);
    prism(C.yellow, [[-1.05, P + 0.02], [1.8, 0.3], [2.3, 0.3], [2.3, 0.22], [1.8, 0.22], [-1.05, P - 0.06]], -0.4, 0.4);
    for (const s of [-1, 1]) prism(C.yellow, [[-1.05, P + 0.3], [1.8, 0.58], [2.3, 0.58], [2.3, 0.3], [1.8, 0.3], [-1.05, P]], s < 0 ? -0.46 : 0.4, s < 0 ? -0.4 : 0.46);
  }));
  list.push(model('pg_seesaw', 'Seesaw', 'props', ({ box, cyl, C, meta }) => {
    box(C.blue, 0.3, 0.5, 0.3, 0, 0.25, 0); box(C.yellow, 3.6, 0.08, 0.3, 0, 0.55, 0, 0, 0, 0.12, 'beam');
    for (const x of [-1.6, 1.6]) { box(C.red, 0.4, 0.06, 0.34, x, 0.55 + Math.tan(0.12) * x + 0.05, 0, 0, 0, 0.12, 'beam'); cyl(C.dark, 0.03, 0.03, 0.5, 5, x + 0.25 * Math.sign(-x), 0.8 + Math.tan(0.12) * x, 0, 0, 0, Math.PI / 2, 'beam'); }
    meta.beam = { pivot: [0, 0.55, 0], rig: { role: 'beam', roll: [-12, 12] } };
  }));
  list.push(model('pg_roundabout', 'Roundabout', 'props', ({ cyl, bar, C, meta }) => {
    cyl(C.dark, 0.2, 0.25, 0.2, 8, 0, 0.1, 0);
    cyl(C.green, 1.2, 1.2, 0.1, 12, 0, 0.3, 0, 0, 0, 0, 'deck'); cyl(C.yellow, 0.12, 0.12, 0.9, 6, 0, 0.75, 0, 0, 0, 0, 'deck');
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05; bar(C.yellow, 0.035, [x, 0.35, z], [x * 0.5, 0.95, z * 0.5], 'deck'); bar(C.yellow, 0.035, [x * 0.5, 0.95, z * 0.5], [0, 1.1, 0], 'deck'); }
    meta.deck = { pivot: [0, 0.3, 0], spin: { axis: 'y', speed: 1.2 } };
  }));
  list.push(model('pg_climber', 'Climbing frame', 'props', ({ bar, box, C }) => {
    const S = 2.2, H = 1.8, n = 3;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = -S / 2 + i * S / n, z = -S / 2 + j * S / n; if (i % n === 0 || j % n === 0) bar(i + j & 1 ? C.red : C.blue, 0.04, [x, 0, z], [x, H, z]); }
    for (const y of [0.6, 1.2, H]) for (let i = 0; i <= n; i++) { const t = -S / 2 + i * S / n; bar(C.yellow, 0.03, [-S / 2, y, t], [S / 2, y, t]); bar(C.yellow, 0.03, [t, y, -S / 2], [t, y, S / 2]); }
    box(C.green, S * 0.66, 0.06, S * 0.66, 0, H * 0.66, 0);
  }));
  return list;
}
