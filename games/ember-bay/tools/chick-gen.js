// Hen + chick from Low_Poly_Chicken_v1_001.glb. build(THREE, scene) → { hen, chick, classify }.
// World coords after baking: y up (2.74–14.03), +z = beak.
export function classify(x, y, z) {
  if (Math.abs(x) > 0.45 && Math.abs(x) < 0.85 && y > 11.9 && y < 12.5 && z > 3.7 && z < 4.2) return 'eye';
  if (y > 12.75 && z > -0.5) return 'comb';
  if (z > 4.55 && y > 11.2) return 'beak';
  if (z > 3.4 && y > 9.6 && y < 11.35 && Math.abs(x) < 1.0) return 'wattle';
  if (z < -2.6 && y > 8.6) return 'tail';
  if (y < 4.7) return 'leg';
  return 'body';
}
const COL = { eye: 0x1a1a1a, comb: 0xd8342c, wattle: 0xd8342c, beak: 0xf0a020, leg: 0xf0a020, tail: 0xf4efe4, body: 0xf4efe4 };
const CHICK = { eye: 0x1a1a1a, beak: 0xf08a1c, leg: 0xf08a1c, body: 0xffd84a, tail: 0xffd84a, comb: 0xffd84a, wattle: 0xffd84a };
function colourise(THREE, geo, pal) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  // per-face colour from centroid class (flat low-poly look)
  const idx = geo.index;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), d = idx.getX(t + 2);
    const k = classify((p.getX(a) + p.getX(b) + p.getX(d)) / 3, (p.getY(a) + p.getY(b) + p.getY(d)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(d)) / 3);
    col.setHex(pal[k]).convertSRGBToLinear();
    for (const v of [a, b, d]) col.toArray(c, v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
export function build(THREE, scene, debug) {
  scene.updateMatrixWorld(true);
  const src = [];
  scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.deleteAttribute('uv'); src.push(g); } });
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const make = (pal, shape, height, name) => {
    const grp = new THREE.Group(); grp.name = name;
    src.forEach((g0, i) => {
      const g = g0.clone().toNonIndexed(); g.setIndex([...Array(g.attributes.position.count).keys()]);
      if (i > 0) { const c = new Float32Array(g.attributes.position.count * 3).fill(0.01); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
      else colourise(THREE, g, pal);
      if (shape) shape(g.attributes.position);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat()); m.name = name + (i ? '_eye' + i : '_body'); m.material.name = name + '_mat'; grp.add(m);
    });
    const box = new THREE.Box3().setFromObject(grp), s = height / (box.max.y - box.min.y), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    grp.children.forEach(m => { m.geometry.translate(-cx, -box.min.y, -cz); m.geometry.scale(s, s, s); });
    return grp;
  };
  const dbg = { eye: 0x000000, comb: 0xff0000, wattle: 0xff00ff, beak: 0xffaa00, leg: 0x00aa00, tail: 0x0066ff, body: 0xdddddd };
  // chick: collapse comb onto the crown, wattle back under the beak, tail feathers into a stub; slightly bigger head
  const chickShape = p => {
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = classify(x, y, z);
      if (y > 12.3 && z > -0.8 && k !== 'beak') y = 12.3 + (y - 12.3) * 0.12;
      if (k === 'wattle') z = 3.4 + (z - 3.4) * 0.15;
      if (z < -2.2 && y > 7.5) { z = -2.2 + (z + 2.2) * 0.35; y = 7.5 + (y - 7.5) * 0.45; }
      if (y > 10.2) { const f = Math.min(1, (y - 10.2) / 1.2) * 0.22; x *= 1 + f; z = 2 + (z - 2) * (1 + f); y = 10.2 + (y - 10.2) * (1 + f); }
      p.setXYZ(i, x, y, z);
    }
  };
  return {
    hen: make(debug ? dbg : COL, null, 0.42, 'hen'),
    chick: make(debug ? dbg : CHICK, chickShape, 0.11, 'chick'),
  };
}
