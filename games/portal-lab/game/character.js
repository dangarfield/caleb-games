// Low-poly test subject (≈1.75 m, feet at y=0, facing +z) with a procedural run cycle.
// buildCharacter(THREE) → { group, update(dt, speed, airborne), setGun(group|null) }. With a gun set, run and idle switch to a two-handed carry. Flat-shaded faces are baked into vertex colours
// so it reads well with unlit MeshBasicMaterial, like the rest of the game.
export function buildCharacter(T) {
  const L = new T.Vector3(0.45, 0.85, 0.3).normalize();
  const mats = new Map();
  const mat = (hex) => { if (!mats.has(hex)) mats.set(hex, new T.MeshBasicMaterial({ color: hex, vertexColors: true })); return mats.get(hex); };
  const shade = (geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals();
    const n = g.attributes.normal, c = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i += 3) {
      const nx = (n.getX(i) + n.getX(i + 1) + n.getX(i + 2)) / 3, ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, nz = (n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)) / 3;
      const len = Math.hypot(nx, ny, nz) || 1, d = (nx * L.x + ny * L.y + nz * L.z) / len, v = Math.pow(0.58 + 0.42 * Math.max(0, d), 2.2);
      for (let k = 0; k < 3; k++) c.set([v, v, v], (i + k) * 3);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3)); return g;
  };
  const C = { suit: 0xe4ecec, dark: 0x2b3438, amber: 0xffb23f, teal: 0x2bf0d6, visor: 0x061215 };
  const mesh = (geo, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const m = new T.Mesh(shade(geo), mat(col)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 6) => new T.CylinderGeometry(rt, rb, h, s);
  const ico = (r, det = 0) => new T.IcosahedronGeometry(r, det);
  const J = (parent, x, y, z) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const root = new T.Group();
  const hips = J(root, 0, 0.95, 0);
  hips.add(mesh(box(0.34, 0.16, 0.21), C.suit, 0, 0, 0));
  hips.add(mesh(box(0.36, 0.05, 0.23), C.amber, 0, 0.07, 0));
  hips.add(mesh(box(0.08, 0.06, 0.03), C.dark, 0, 0.07, 0.12));
  const spine = J(hips, 0, 0.09, 0);
  spine.add(mesh(cyl(0.135, 0.15, 0.2, 7), C.dark, 0, 0.1, 0, 1, 1, 0.78));
  const chest = J(spine, 0, 0.2, 0);
  chest.add(mesh(cyl(0.2, 0.15, 0.3, 7), C.suit, 0, 0.15, 0, 1, 1, 0.7));
  chest.add(mesh(box(0.2, 0.12, 0.04), C.dark, 0, 0.17, 0.12));
  chest.add(mesh(box(0.16, 0.025, 0.045), C.teal, 0, 0.2, 0.125));
  chest.add(mesh(box(0.27, 0.32, 0.13), C.dark, 0, 0.14, -0.17));
  chest.add(mesh(box(0.035, 0.24, 0.02), C.teal, 0.07, 0.14, -0.24));
  chest.add(mesh(box(0.035, 0.24, 0.02), C.teal, -0.07, 0.14, -0.24));
  chest.add(mesh(cyl(0.035, 0.035, 0.16, 6), C.amber, 0, 0.33, -0.19));
  const neck = J(chest, 0, 0.31, 0.01);
  neck.add(mesh(cyl(0.06, 0.07, 0.07, 6), C.dark, 0, 0.03, 0));
  const head = J(neck, 0, 0.07, 0);
  head.add(mesh(ico(0.14, 1), C.suit, 0, 0.12, 0, 0.92, 1.05, 1));
  head.add(mesh(box(0.21, 0.09, 0.08), C.visor, 0, 0.13, 0.1));
  head.add(mesh(box(0.23, 0.018, 0.085), C.teal, 0, 0.18, 0.1));
  head.add(mesh(box(0.05, 0.05, 0.05), C.dark, 0.13, 0.12, 0));
  head.add(mesh(box(0.05, 0.05, 0.05), C.dark, -0.13, 0.12, 0));
  head.add(mesh(cyl(0.008, 0.012, 0.12, 4), C.dark, 0.1, 0.27, -0.04));
  head.add(mesh(ico(0.018, 0), C.amber, 0.1, 0.335, -0.04));

  const arm = (s) => {
    const sh = J(chest, s * 0.215, 0.26, 0);
    sh.add(mesh(ico(0.08, 0), C.suit, 0, 0, 0, 1.05, 0.85, 1));
    sh.add(mesh(box(0.1, 0.03, 0.1), C.amber, s * 0.01, 0.05, 0));
    sh.add(mesh(cyl(0.055, 0.05, 0.26, 6), C.suit, 0, -0.15, 0));
    const el = J(sh, 0, -0.29, 0);
    el.add(mesh(ico(0.052, 0), C.dark, 0, 0, 0));
    el.add(mesh(cyl(0.05, 0.042, 0.24, 6), C.suit, 0, -0.13, 0));
    el.add(mesh(box(0.1, 0.06, 0.1), C.dark, 0, -0.2, 0));
    const hand = J(el, 0, -0.27, 0);
    hand.add(mesh(box(0.075, 0.09, 0.085), C.dark, 0, -0.03, 0.01));
    hand.add(mesh(box(0.03, 0.05, 0.04), C.dark, s * -0.04, -0.01, 0.04));
    return { sh, el, hand };
  };
  const leg = (s) => {
    const hp = J(hips, s * 0.095, -0.06, 0);
    hp.add(mesh(cyl(0.085, 0.07, 0.42, 6), C.suit, 0, -0.21, 0));
    hp.add(mesh(box(0.15, 0.04, 0.14), C.dark, 0, -0.05, 0));
    const kn = J(hp, 0, -0.43, 0);
    kn.add(mesh(box(0.11, 0.1, 0.06), C.amber, 0, 0, 0.065));
    kn.add(mesh(cyl(0.068, 0.055, 0.4, 6), C.suit, 0, -0.2, 0));
    kn.add(mesh(box(0.12, 0.12, 0.13), C.dark, 0, -0.32, 0));
    const an = J(kn, 0, -0.41, 0);
    an.add(mesh(box(0.12, 0.08, 0.26), C.dark, 0, -0.01, 0.05));
    an.add(mesh(box(0.125, 0.025, 0.265), C.amber, 0, -0.045, 0.05));
    return { hp, kn, an };
  };
  const aL = arm(1), aR = arm(-1), lL = leg(1), lR = leg(-1);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  const gunMount = J(chest, -0.04, -0.1, 0.24); let gun = null, hold = 0;
  const setGun = (g) => { if (gun) gunMount.remove(gun); gun = g || null; if (gun) { gunMount.add(gun); gun.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); } };
  let ph = 0, amt = 0;
  const update = (dt, speed, airborne) => {
    const target = Math.min(1, (speed || 0) / 4.5);
    amt += (target - amt) * Math.min(1, dt * 8);
    ph += dt * (4 + 6 * amt);
    const s = Math.sin(ph), c = Math.cos(ph), a = amt, air = airborne ? 1 : 0;
    hips.position.y = 0.95 - 0.06 * a + 0.05 * a * Math.abs(c) * (1 - air);
    hips.rotation.y = 0.12 * a * s;
    spine.rotation.x = 0.16 * a; spine.rotation.y = -0.18 * a * s;
    head.rotation.x = -0.12 * a; head.rotation.y = 0.08 * a * s;
    const swing = 0.85 * a;
    lL.hp.rotation.x = -swing * s + air * -0.5; lR.hp.rotation.x = swing * s + air * 0.2;
    lL.kn.rotation.x = 0.12 + a * (0.25 + 1.15 * Math.max(0, c)) + air * 0.9;
    lR.kn.rotation.x = 0.12 + a * (0.25 + 1.15 * Math.max(0, -c)) + air * 0.4;
    lL.an.rotation.x = -0.3 * a * Math.max(0, -s); lR.an.rotation.x = -0.3 * a * Math.max(0, s);
    aL.sh.rotation.x = 0.75 * a * s; aR.sh.rotation.x = -0.75 * a * s;
    aL.sh.rotation.z = 0.12 + 0.06 * a; aR.sh.rotation.z = -0.12 - 0.06 * a;
    aL.el.rotation.x = -(0.25 + 1.15 * a + 0.2 * a * Math.max(0, s)); aR.el.rotation.x = -(0.25 + 1.15 * a + 0.2 * a * Math.max(0, -s));
    if (!a) { const b = Math.sin(ph * 0.5) * 0.01; chest.position.y = 0.2 + b; }
    hold += ((gun ? 1 : 0) - hold) * Math.min(1, dt * 10);
    if (hold > 0.001) {
      // two-handed carry: right hand on the rear grip, left hand under the fore-grip; gun bobs with the chest
      const mix = (cur, v) => cur + (v - cur) * hold, br = Math.sin(ph * 0.5) * (1 - a);
      aR.sh.rotation.x = mix(aR.sh.rotation.x, -0.3 - 0.06 * a * s); aR.sh.rotation.z = mix(aR.sh.rotation.z, 0.22); aR.sh.rotation.y = mix(aR.sh.rotation.y, 0.15);
      aR.el.rotation.x = mix(aR.el.rotation.x, -1.35);
      aL.sh.rotation.x = mix(aL.sh.rotation.x, -0.7 + 0.06 * a * s); aL.sh.rotation.z = mix(aL.sh.rotation.z, -0.42); aL.sh.rotation.y = mix(aL.sh.rotation.y, -0.3);
      aL.el.rotation.x = mix(aL.el.rotation.x, -1.05);
      gunMount.rotation.set(0.22 * (1 - a) + 0.06 * a * Math.abs(c) + 0.02 * br - spine.rotation.x * 0.6, 0.06 * a * s, 0.04 * a * s);
      gunMount.visible = true;
    } else { aR.sh.rotation.y = 0; aL.sh.rotation.y = 0; gunMount.visible = !!gun; }
  };
  update(0, 0, false);
  return { group: root, update, setGun };
}
