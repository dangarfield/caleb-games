// Shared converter used by run_script: FBX → baked, named, per-material meshes (metres, origin bottom-centre).
export async function makeConverter() {
  const T = await import('https://esm.sh/three@0.160.0');
  const { FBXLoader } = await import('https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js');
  const { GLTFExporter } = await import('https://esm.sh/three@0.160.0/examples/jsm/exporters/GLTFExporter.js');
  const BGU = await import('https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js');
  const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const mgr = new T.LoadingManager(); mgr.setURLModifier(() => blank);
  const texCache = new Map();
  const loadTex = async (blob, name) => {
    if (texCache.has(name)) return texCache.get(name);
    const img = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    const t = new T.Texture(img); t.name = name; t.colorSpace = T.SRGBColorSpace; t.flipY = false; t.needsUpdate = true;
    texCache.set(name, t); return t;
  };
  async function convert(buf, { id, texFor, forceMetres, lengthAlongZ, scale = 1, obj }) {
    const root = obj || new FBXLoader(mgr).parse(buf, ''); root.updateMatrixWorld(true);
    const box0 = new T.Box3().setFromObject(root), s0 = box0.getSize(new T.Vector3());
    const unit = forceMetres ? 1 : Math.max(s0.x, s0.y, s0.z) > 150 ? 0.01 : 1;
    const byMat = new Map();
    root.traverse(n => {
      if (!n.isMesh) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const src = n.geometry.clone(); src.applyMatrix4(n.matrixWorld);
      for (const a of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(a)) src.deleteAttribute(a);
      if (!src.attributes.uv) src.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      if (!src.attributes.normal) src.computeVertexNormals();
      const parts = src.groups.length > 1 ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
      const ni = src.index ? src.toNonIndexed() : src;
      for (const g of parts) {
        const m = mats[g.materialIndex] || mats[0];
        const sub = new T.BufferGeometry();
        for (const a of ['position', 'normal', 'uv']) { const at = ni.attributes[a]; sub.setAttribute(a, new T.BufferAttribute(at.array.slice(g.start * at.itemSize, (g.start + g.count) * at.itemSize), at.itemSize)); }
        const key = m.name + '|' + (m.color ? m.color.getHexString() : '');
        (byMat.get(key) || byMat.set(key, { m, geos: [] }).get(key)).geos.push(sub);
      }
    });
    const out = new T.Group(); out.name = id;
    let tris = 0; const all = [];
    for (const [key, { m, geos }] of byMat) {
      let g = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
      g = BGU.mergeVertices(g, 1e-4);
      g.scale(unit * scale, unit * scale, unit * scale);
      const mat = new T.MeshStandardMaterial({ name: m.name, color: m.map || texFor ? 0xffffff : (m.color || new T.Color(1, 1, 1)).clone(), roughness: 0.85, metalness: 0 });
      if (texFor) { const tb = await texFor(m.name); if (tb) mat.map = await loadTex(tb, m.name); else if (m.color) mat.color.copy(m.color); }
      const mesh = new T.Mesh(g, mat); mesh.name = id + '#' + all.length; all.push(mesh); out.add(mesh);
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    const box = new T.Box3().setFromObject(out), sz = box.getSize(new T.Vector3());
    const rot = lengthAlongZ && sz.x > sz.z * 1.15;
    for (const mesh of all) {
      if (rot) mesh.geometry.rotateY(Math.PI / 2);
    }
    const box2 = new T.Box3().setFromObject(out), c = box2.getCenter(new T.Vector3());
    for (const mesh of all) { mesh.geometry.translate(-c.x, -box2.min.y, -c.z); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); }
    const f = new T.Box3().setFromObject(out).getSize(new T.Vector3());
    return { group: out, info: { id, w: +f.x.toFixed(2), h: +f.y.toFixed(2), d: +f.z.toFixed(2), tris: Math.round(tris), mats: all.length, unit, rotated: rot } };
  }
  async function exportGLB(groups) {
    const scene = new T.Group(); groups.forEach(g => scene.add(g));
    return new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 1024 });
  }
  const gz = async buf => new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const parse = buf => { const r = new FBXLoader(mgr).parse(buf, ''); r.updateMatrixWorld(true); return r; };
  return { T, convert, exportGLB, gz, parse, GLTFExporter };
}
