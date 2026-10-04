// Procedural home fire-safety hazards (low-poly, flat-shaded, metres, base at y=0). buildHazards(THREE) → [{id,name,obj}]
export function buildHazards(THREE) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...o });
  const E = (c, k = 2) => M(c, { emissive: c, emissiveIntensity: k, roughness: 1 });
  const mat = {
    flameO: E(0xff6a13, 2), flameY: E(0xffc629, 2.4), ember: E(0xff3b0a, 1.6), spark: E(0xfff3a0, 3), led: E(0xff2020, 2.5), bar: E(0xff5a1a, 1.8),
    char: M(0x1d1712), smoke: M(0x5d5d60, { transparent: true, opacity: 0.82 }), smokeL: M(0x9a9a9d, { transparent: true, opacity: 0.6 }),
    white: M(0xf1efe9), plastic: M(0xe6e3dc), black: M(0x1b1b1d), steel: M(0xb9bcc0, { metalness: 0.6, roughness: 0.35 }), copper: M(0xc26a2c, { metalness: 0.7, roughness: 0.3 }),
    card: M(0xb98c56), card2: M(0xa47a47), paper: M(0xe9e6dc), paper2: M(0xcfcac0), fabric: M(0x7a2331), towel: M(0x3d6fb4), curtain: M(0xd8c79a),
    wax: M(0xf4ecd6), wall: M(0xe7e1d6), gas: M(0x1f4fa8, { metalness: 0.2, roughness: 0.5 }), brass: M(0xc9a13a, { metalness: 0.7, roughness: 0.35 }), board: M(0x7fa3c9), batt: M(0x2c2f33), oil: M(0xe0b43a),
  };
  const add = (g, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  const box = (g, w, h, d, m, x, y, z, ry = 0) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, 0, ry);
  const cyl = (g, rt, rb, h, m, x, y, z, seg = 10) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
  const tube = (g, pts, r, m) => add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), pts.length * 6, r, 5), m);
  const flame = (g, x, y, z, h, r) => {
    const t = (rnd() - 0.5) * 0.25;
    add(g, new THREE.ConeGeometry(r, h, 5), mat.flameO, x, y + h / 2, z, t, rnd() * 6, -t);
    add(g, new THREE.ConeGeometry(r * 0.55, h * 0.62, 5), mat.flameY, x, y + h * 0.31, z + r * 0.25, 0, rnd() * 6, 0);
  };
  const flames = (g, n, cx, y, cz, rad, hMin, hMax) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * rad, h = hMin + rnd() * (hMax - hMin); flame(g, cx + Math.cos(a) * d, y, cz + Math.sin(a) * d, h, h * 0.28); } };
  const puffs = (g, n, x, y, z, r, rise, m = mat.smoke) => { for (let i = 0; i < n; i++) { const k = i / n, s = r * (0.6 + k * 0.9); add(g, new THREE.IcosahedronGeometry(s, 0), m, x + (rnd() - 0.5) * r * 2 * (0.5 + k), y + k * rise, z + (rnd() - 0.5) * r * 1.5 * (0.5 + k), rnd() * 3, rnd() * 3, 0); } };
  const sparks = (g, n, x, y, z, r) => { for (let i = 0; i < n; i++) add(g, new THREE.OctahedronGeometry(r * (0.5 + rnd() * 0.6), 0), mat.spark, x + (rnd() - 0.5) * r * 6, y + rnd() * r * 5, z + (rnd() - 0.5) * r * 6, rnd() * 3, rnd() * 3, 0); };
  const plug = (g, x, y, z, ry = 0) => { box(g, 0.05, 0.045, 0.035, mat.black, x, y, z, ry); };
  const out = [], H = (id, name, fn) => { const g = new THREE.Group(); g.name = 'hazard_' + id; fn(g); out.push({ id: 'hazard_' + id, name, obj: g }); };

  H('fire_small', 'Small fire', g => { cyl(g, 0.45, 0.45, 0.01, mat.char, 0, 0, 0, 9); flames(g, 6, 0, 0.01, 0, 0.25, 0.3, 0.65); for (let i = 0; i < 6; i++) add(g, new THREE.DodecahedronGeometry(0.03, 0), mat.ember, (rnd() - 0.5) * 0.7, 0.02, (rnd() - 0.5) * 0.7); });
  H('fire_large', 'Large fire', g => { cyl(g, 1, 1, 0.01, mat.char, 0, 0, 0, 11); flames(g, 12, 0, 0.01, 0, 0.65, 0.6, 1.5); puffs(g, 5, 0, 1.6, 0, 0.35, 0.8); });
  H('smoke', 'Smoke cloud', g => { puffs(g, 9, 0, 0.35, 0, 0.3, 1.5); puffs(g, 5, 0.25, 1.2, 0.1, 0.28, 0.6, mat.smokeL); });
  H('chip_pan', 'Chip pan fire', g => {
    box(g, 0.6, 0.88, 0.6, mat.white, 0, 0, 0); box(g, 0.6, 0.02, 0.6, mat.black, 0, 0.88, 0); box(g, 0.5, 0.35, 0.01, mat.black, 0, 0.3, 0.3);
    cyl(g, 0.15, 0.13, 0.12, mat.steel, -0.12, 0.9, -0.08); cyl(g, 0.14, 0.14, 0.005, mat.oil, -0.12, 1.0, -0.08); box(g, 0.22, 0.025, 0.035, mat.black, 0.1, 0.98, -0.08);
    flames(g, 7, -0.12, 1.0, -0.08, 0.1, 0.25, 0.6); puffs(g, 4, -0.12, 1.55, -0.08, 0.14, 0.5);
  });
  H('candle_curtain', 'Candle by curtain', g => {
    box(g, 0.5, 0.04, 0.3, mat.card2, 0, 0.8, 0); for (const [x, z] of [[-0.22, -0.12], [0.22, -0.12], [-0.22, 0.12], [0.22, 0.12]]) box(g, 0.035, 0.8, 0.035, mat.card2, x, 0, z);
    cyl(g, 0.055, 0.045, 0.012, mat.white, 0.05, 0.84, 0.03); cyl(g, 0.022, 0.022, 0.14, mat.wax, 0.05, 0.852, 0.03); flame(g, 0.05, 0.992, 0.03, 0.06, 0.016);
    for (let i = 0; i < 7; i++) box(g, 0.1, 1.9, 0.03, mat.curtain, -0.3 + i * 0.1, 0.05, -0.2 + (i % 2) * 0.04);
  });
  H('overloaded_socket', 'Overloaded socket', g => {
    box(g, 0.6, 0.7, 0.04, mat.wall, 0, 0, -0.02); box(g, 0.16, 0.09, 0.012, mat.plastic, 0, 0.3, 0.006);
    box(g, 0.07, 0.07, 0.06, mat.white, -0.035, 0.31, 0.04); box(g, 0.07, 0.07, 0.06, mat.white, -0.035, 0.36, 0.1); box(g, 0.07, 0.07, 0.06, mat.white, 0.04, 0.3, 0.07);
    [[-0.07, 0.33, 0.13], [0, 0.39, 0.14], [-0.04, 0.43, 0.1], [0.08, 0.33, 0.1], [0.04, 0.27, 0.11]].forEach(([x, y, z], i) => { plug(g, x, y, z); tube(g, [[x, y + 0.02, z + 0.02], [x + 0.02 * i - 0.04, 0.12, z + 0.08], [x + 0.06 * (i - 2), 0.005, z + 0.25 + i * 0.03]], 0.006, mat.black); });
    sparks(g, 5, 0.02, 0.36, 0.12, 0.012); puffs(g, 3, 0, 0.5, 0.12, 0.05, 0.2, mat.smokeL);
  });
  H('extension_daisy', 'Daisy-chained extensions', g => {
    const L = [[-0.45, 0.1], [0.05, -0.12], [0.5, 0.15]];
    L.forEach(([x, z], i) => { box(g, 0.34, 0.045, 0.07, mat.white, x, 0, z, i * 0.3 - 0.3); for (let k = 0; k < 4; k++) plug(g, x - 0.12 + k * 0.08, 0.045, z, i * 0.3 - 0.3); });
    tube(g, [[-0.28, 0.02, 0.05], [-0.15, 0.01, 0.1], [-0.1, 0.01, -0.15]], 0.007, mat.white); tube(g, [[0.22, 0.02, -0.08], [0.3, 0.01, 0.1], [0.33, 0.01, 0.12]], 0.007, mat.white);
    for (let k = 0; k < 6; k++) tube(g, [[-0.5 + k * 0.2, 0.06, 0], [-0.55 + k * 0.22, 0.01, 0.35], [-0.6 + k * 0.25, 0.005, 0.6]], 0.005, mat.black);
    sparks(g, 3, 0.5, 0.08, 0.15, 0.012);
  });
  H('frayed_cable', 'Frayed cable', g => {
    tube(g, [[-0.6, 0.01, 0.1], [-0.3, 0.01, -0.05], [-0.06, 0.01, 0.02]], 0.009, mat.black); tube(g, [[0.06, 0.01, 0.02], [0.3, 0.01, 0.12], [0.6, 0.01, -0.02]], 0.009, mat.black);
    [[0, -0.005], [0, 0.005], [0.004, 0]].forEach(([dy, dz], i) => tube(g, [[-0.06, 0.01 + dy, 0.02 + dz], [0, 0.02 + dy + i * 0.008, 0.03 + dz], [0.06, 0.01 + dy, 0.02 + dz]], 0.0035, mat.copper));
    plug(g, 0.63, 0, -0.02); cyl(g, 0.12, 0.12, 0.003, mat.char, 0, 0, 0.02, 9); sparks(g, 6, 0, 0.03, 0.02, 0.012);
  });
  H('heater_towel', 'Towel on heater', g => {
    box(g, 0.55, 0.32, 0.14, mat.steel, 0, 0.03, 0); box(g, 0.08, 0.03, 0.2, mat.black, -0.2, 0, 0); box(g, 0.08, 0.03, 0.2, mat.black, 0.2, 0, 0);
    for (let i = 0; i < 3; i++) box(g, 0.46, 0.022, 0.02, mat.bar, 0, 0.1 + i * 0.07, 0.07);
    box(g, 0.42, 0.02, 0.2, mat.towel, -0.02, 0.35, 0); box(g, 0.42, 0.2, 0.02, mat.towel, -0.02, 0.17, 0.1); box(g, 0.42, 0.14, 0.02, mat.towel, -0.02, 0.23, -0.1);
    puffs(g, 4, 0, 0.45, 0.04, 0.07, 0.4, mat.smokeL); flames(g, 2, 0.1, 0.37, 0.05, 0.03, 0.08, 0.14);
  });
  H('cigarette_sofa', 'Cigarette on sofa arm', g => {
    box(g, 0.25, 0.62, 0.9, mat.fabric, 0, 0, 0); box(g, 0.29, 0.06, 0.94, mat.fabric, 0, 0.62, 0);
    add(g, new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), mat.white, 0, 0.687, 0.05, 0, 0, Math.PI / 2); add(g, new THREE.CylinderGeometry(0.0052, 0.0052, 0.012, 6), mat.ember, 0.045, 0.687, 0.05, 0, 0, Math.PI / 2);
    cyl(g, 0.05, 0.05, 0.002, mat.char, 0.04, 0.68, 0.05, 8); puffs(g, 5, 0.05, 0.72, 0.05, 0.025, 0.3, mat.smokeL);
  });
  H('alarm_no_battery', 'Smoke alarm, battery out', g => {
    box(g, 0.6, 0.03, 0.4, mat.card2, 0, 0, 0); cyl(g, 0.065, 0.07, 0.035, mat.white, -0.08, 0.03, 0, 16); cyl(g, 0.025, 0.025, 0.005, mat.paper2, -0.08, 0.065, 0, 12);
    box(g, 0.05, 0.004, 0.035, mat.plastic, -0.01, 0.03, 0.07, 0.4); box(g, 0.026, 0.045, 0.017, mat.batt, 0.12, 0.03, 0.02, 0.6); box(g, 0.008, 0.006, 0.006, mat.steel, 0.12, 0.075, 0.02);
  });
  H('gas_cylinder', 'Gas cylinder', g => {
    cyl(g, 0.15, 0.15, 0.5, mat.gas, 0, 0.02, 0, 14); cyl(g, 0.14, 0.14, 0.02, mat.black, 0, 0, 0, 14); cyl(g, 0.06, 0.15, 0.07, mat.gas, 0, 0.52, 0, 14);
    cyl(g, 0.025, 0.025, 0.05, mat.brass, 0, 0.59, 0, 8); add(g, new THREE.TorusGeometry(0.08, 0.012, 5, 12), mat.gas, 0, 0.66, 0, 0, 0, 0);
  });
  H('ebike_battery', 'Overheating e-bike battery', g => {
    box(g, 0.4, 0.1, 0.13, mat.batt, 0, 0, 0); box(g, 0.28, 0.13, 0.15, mat.batt, 0, 0, 0); box(g, 0.012, 0.012, 0.004, mat.led, 0.15, 0.06, 0.066);
    box(g, 0.14, 0.05, 0.08, mat.black, 0.45, 0, 0.2); tube(g, [[0.2, 0.04, 0], [0.32, 0.01, 0.1], [0.4, 0.02, 0.2]], 0.005, mat.black); tube(g, [[0.52, 0.03, 0.2], [0.7, 0.01, 0.25], [0.9, 0.3, 0.3]], 0.005, mat.black);
    sparks(g, 4, -0.1, 0.12, 0, 0.014); flames(g, 3, -0.08, 0.13, 0, 0.06, 0.12, 0.28); puffs(g, 5, -0.05, 0.35, 0, 0.08, 0.6);
  });
  H('clutter', 'Clutter blocking exit', g => {
    [[0.5, 0.4, 0.4, 0, 0, 0, 0.1], [0.4, 0.35, 0.4, 0.05, 0.4, 0.02, -0.15], [0.3, 0.25, 0.3, 0.02, 0.75, -0.02, 0.2], [0.45, 0.3, 0.35, 0.55, 0, 0.15, -0.3]].forEach(([w, h, d, x, y, z, r], i) => box(g, w, h, d, i % 2 ? mat.card2 : mat.card, x, y, z, r));
    for (let i = 0; i < 12; i++) box(g, 0.36, 0.018, 0.27, i % 2 ? mat.paper : mat.paper2, -0.5 + (rnd() - 0.5) * 0.03, i * 0.018, 0.1, (rnd() - 0.5) * 0.3);
    for (let i = 0; i < 7; i++) box(g, 0.36, 0.018, 0.27, i % 2 ? mat.paper : mat.paper2, -0.45, i * 0.018, -0.3, 0.6 + (rnd() - 0.5) * 0.3);
  });
  H('iron_left_on', 'Iron left on', g => {
    box(g, 1.1, 0.025, 0.34, mat.board, 0, 0.85, 0); add(g, new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), mat.steel, 0, 0.43, 0, 0, 0, 0.9); add(g, new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), mat.steel, 0, 0.43, 0, 0, 0, -0.9);
    cyl(g, 0.09, 0.09, 0.002, mat.char, 0.2, 0.875, 0, 9); box(g, 0.24, 0.05, 0.11, mat.board.clone(), 0.2, 0.877, 0).material = mat.white; box(g, 0.16, 0.05, 0.03, mat.black, 0.22, 0.927, 0);
    box(g, 0.01, 0.01, 0.01, mat.led, 0.12, 0.927, 0.05); puffs(g, 4, 0.2, 0.95, 0, 0.04, 0.3, mat.smokeL);
    tube(g, [[0.32, 0.9, 0], [0.5, 0.7, 0.2], [0.6, 0.01, 0.4]], 0.005, mat.black);
  });
  return out;
}
