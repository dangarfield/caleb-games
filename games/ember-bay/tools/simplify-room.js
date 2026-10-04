// Simplify a gzipped GLB (static meshes) to ~target triangles with meshoptimizer. Used from run_script.
export async function simplifyGLB(blob, target, err = 0.004) {
  const { MeshoptSimplifier: S } = await import('https://esm.sh/meshoptimizer@0.21.0'); await S.ready;
  const T = await import('https://esm.sh/three@0.160.0');
  const { GLTFLoader } = await import('https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
  const { GLTFExporter } = await import('https://esm.sh/three@0.160.0/examples/jsm/exporters/GLTFExporter.js');
  const BGU = await import('https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js');
  const buf = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const g = await new GLTFLoader().parseAsync(buf, '');
  const meshes = []; g.scene.traverse(o => o.isMesh && meshes.push(o));
  const triOf = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  const before = meshes.reduce((a, m) => a + triOf(m.geometry), 0), ratio = Math.min(1, target / before);
  let after = 0;
  for (const m of meshes) {
    const keepUV = !!m.material.map;
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const a of Object.keys(geo.attributes)) if (a !== 'position' && !(keepUV && a === 'uv')) geo.deleteAttribute(a);
    geo = BGU.mergeVertices(geo, 1e-4);
    const tris = triOf(geo);
    if (ratio < 1 && tris > 1500) {
      const idx = new Uint32Array(geo.index.array), pos = new Float32Array(geo.attributes.position.array), uv = geo.attributes.uv;
      const want = Math.max(3, Math.floor(tris * ratio) * 3);
      const [out] = S.simplify(idx, pos, 3, want, err, []);
      const remap = new Map(), P = [], U = [], ni = new Uint32Array(out.length);
      out.forEach((v, i) => { let r = remap.get(v); if (r === undefined) { r = remap.size; remap.set(v, r); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); if (uv) U.push(uv.getX(v), uv.getY(v)); } ni[i] = r; });
      geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); if (U.length) geo.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); geo.setIndex(new T.BufferAttribute(ni, 1));
    }
    geo = geo.toNonIndexed(); geo.computeVertexNormals();
    m.geometry = geo; after += triOf(geo);
  }
  const glb = await new GLTFExporter().parseAsync(g.scene, { binary: true, maxTextureSize: 1024 });
  const gz = await new Response(new Blob([glb]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return { gz, before, after: Math.round(after) };
}
