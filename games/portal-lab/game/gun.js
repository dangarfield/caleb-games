// Low-poly portal gun (≈0.62 m long, muzzle toward +z, grip origin at 0,0,0).
// buildGun(THREE, coreHex) → { group, setCore(hex) }. Flat-shaded faces baked into vertex colours.
export function buildGun(T, coreHex = 0x3b8cff) {
  const L = new T.Vector3(0.45, 0.85, 0.3).normalize(), mats = new Map();
  const mat = (hex) => { if (!mats.has(hex)) mats.set(hex, new T.MeshBasicMaterial({ color: hex, vertexColors: true })); return mats.get(hex); };
  const shade = (geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals();
    const n = g.attributes.normal, c = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i += 3) {
      const nx = n.getX(i) + n.getX(i + 1) + n.getX(i + 2), ny = n.getY(i) + n.getY(i + 1) + n.getY(i + 2), nz = n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2);
      const d = (nx * L.x + ny * L.y + nz * L.z) / (Math.hypot(nx, ny, nz) || 1), v = Math.pow(0.58 + 0.42 * Math.max(0, d), 2.2);
      for (let k = 0; k < 3; k++) c.set([v, v, v], (i + k) * 3);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3)); return g;
  };
  const C = { white: 0xe4ecec, dark: 0x2b3438, amber: 0xffb23f, teal: 0x2bf0d6 };
  const root = new T.Group();
  const add = (geo, col, x, y, z, rx = 0, ry = 0, rz = 0, m) => { const o = new T.Mesh(shade(geo), m || mat(col)); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.frustumCulled = false; root.add(o); return o; };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d), cyl = (a, b, h, s = 8) => new T.CylinderGeometry(a, b, h, s);
  // body
  add(box(0.13, 0.12, 0.3), C.white, 0, 0.07, 0.05);
  add(cyl(0.075, 0.09, 0.16, 8), C.white, 0, 0.07, 0.26, Math.PI / 2);
  add(box(0.14, 0.03, 0.22), C.dark, 0, 0.145, 0.06);
  add(box(0.1, 0.012, 0.12), C.teal, 0, 0.162, 0.04);
  add(box(0.015, 0.07, 0.2), C.dark, 0.072, 0.07, 0.06); add(box(0.015, 0.07, 0.2), C.dark, -0.072, 0.07, 0.06);
  add(box(0.017, 0.02, 0.14), C.teal, 0.08, 0.09, 0.07); add(box(0.017, 0.02, 0.14), C.teal, -0.08, 0.09, 0.07);
  // rear power cell
  add(cyl(0.055, 0.055, 0.12, 8), C.dark, 0, 0.08, -0.15, Math.PI / 2);
  add(cyl(0.058, 0.058, 0.04, 8), C.amber, 0, 0.08, -0.15, Math.PI / 2);
  add(box(0.1, 0.1, 0.03), C.white, 0, 0.08, -0.22);
  // grips
  add(box(0.06, 0.15, 0.07), C.dark, 0, -0.06, -0.02, -0.25);
  add(box(0.065, 0.02, 0.075), C.amber, 0, -0.13, -0.04, -0.25);
  add(box(0.05, 0.1, 0.06), C.dark, 0, -0.03, 0.2, 0.15);
  add(box(0.07, 0.02, 0.08), C.dark, 0, -0.005, 0.07);
  // emitter: collar, three prongs, glowing core
  add(cyl(0.095, 0.095, 0.035, 10), C.amber, 0, 0.07, 0.345, Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const p = add(box(0.028, 0.028, 0.13), C.dark, ca * 0.072, 0.07 + sa * 0.072, 0.41); p.lookAt(ca * 0.04, 0.07 + sa * 0.04, 0.5);
    add(box(0.024, 0.024, 0.03), C.white, ca * 0.045, 0.07 + sa * 0.045, 0.47);
  }
  const coreMat = new T.MeshBasicMaterial({ color: coreHex, fog: false });
  add(new T.IcosahedronGeometry(0.045, 1), 0, 0, 0.07, 0.4, 0, 0, 0, coreMat);
  const ringMat = new T.MeshBasicMaterial({ color: coreHex, fog: false, transparent: true, opacity: 0.85 });
  const ring = new T.Mesh(new T.TorusGeometry(0.068, 0.008, 6, 20), ringMat); ring.position.set(0, 0.07, 0.37); root.add(ring);
  return { group: root, setCore: (hex) => { coreMat.color.setHex(hex); ringMat.color.setHex(hex); } };
}
