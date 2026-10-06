// Level of detail for the town's BatchedMeshes.
//
// WHY: the LowPoly City props aren't low poly. A 2 m bin is 10.5k triangles, a car 5–6k, and with ~1,850
// objects the town is ~2.9M triangles, drawn twice a frame (colour + the sun's shadow map). On the target
// tablet that's the frame budget gone before the game does anything.
//
// WHAT: every model part over LOD_MIN_TRIS gets two cheaper copies, made once at load with meshoptimizer's
// simplifier, and added to the same BatchedMesh as the original. Each object then swaps which geometry its
// instance draws (setGeometryIdAt) by how big it is on screen, and anything smaller than a couple of pixels
// is hidden outright. Things in the hole's grip (state ≠ 0) are always full detail.
//
// The packs are faceted (every face has its own vertices, coloured by where its UVs sit in the palette
// texture), so a plain simplify can't collapse anything. We weld by position, simplify the welded mesh, then
// give every new triangle a flat normal and the colour (centroid UV / vertex colour) of the original face
// that matches it best. That keeps the flat-shaded look and the palette colours.
import * as THREE from 'three';

const MESHOPT = 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js';
let S = null;
export async function initLod() {
  try { const m = await import(MESHOPT); await m.MeshoptSimplifier.ready; S = m.MeshoptSimplifier; }
  catch (e) { console.warn('LOD: simplifier unavailable, full detail only (distance culling still on)', e); }
}

// ---- tunables (also on window.__lod for live tweaking from the dev panel / console) ----
export const LOD = {
  minTris: 300,          // parts below this stay as they are
  // [share of the triangles to aim for, errors to try in turn (as a share of the model's size)]. The first error
  // that gets near the target wins; dense models (a 10k-triangle bin) need the looser ones to get anywhere.
  steps: [
    [0.3, [0.01, 0.02, 0.03]],
    [0.1, [0.03, 0.05, 0.08]],
  ],
  // distance ÷ object radius. With the 48° camera at 690px tall, 20 ≈ 39px radius on screen, 60 ≈ 13px, 300 ≈ 2.6px.
  near: 20, far: 60, cull: 300,
  // people and animals (critters.js): simplified copy past critterNear, no shadow past critterShadow, hidden past critterCull
  critterNear: 30, critterShadow: 45, critterCull: 140,
  // Zoomed in (a small hole, the camera low) only a little of the town is on screen and the eye is close, so the
  // switch distances stretch by up to zoomMax; at full zoom-out (camera ~200 m up) they're as above.
  zoomMax: 3, zoomLowY: 24, zoomHighY: 200, zoomK: 1,
  // Shadows when zoomed right out (camera further than shadowFarD from the hole; back under shadowNearD to undo):
  // only buildings cast them, people and animals and small things don't, and the shadow map drops to shadowFarMap.
  shadowFarD: 130, shadowNearD: 110, shadowFarMap: 512, farShadows: false,
  every: 150,            // ms between passes over the objects
  perfScale: 0.6,        // performance mode switches down sooner
  stats: { parts: 0, tris0: 0, tris1: 0, tris2: 0, ms: 0 },
};
window.__lod = LOD;

// Real image textures (not the palette) would smear with the centroid-UV trick, so they keep full detail.
const simplifiable = mat => !mat.map || mat.name === 'city_palette';

// geometry → [lod1, lod2] (cached on the geometry; empty when not worth it)
export function lodsFor(geo, mat) {
  if (geo.userData.lods) return geo.userData.lods;
  const out = geo.userData.lods = [];
  const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  if (!S || tris < LOD.minTris || !simplifiable(mat)) return out;
  const t0 = performance.now();
  try {
    const W = weld(geo); let prev = tris;
    for (const [share, errs] of LOD.steps) {
      const target = Math.max(36, Math.floor(tris * share)) * 3;
      let idx;
      for (const err of errs) { [idx] = S.simplify(W.index, W.pos, 3, target, err); if (idx.length <= target * 1.3) break; }
      const n = idx.length / 3;
      if (n > prev * 0.7 || n < 4) break;            // not enough of a saving to be worth a level
      out.push(rebuild(geo, W, idx)); prev = n;
    }
  } catch (e) { console.warn('LOD: simplify failed', e); out.length = 0; }
  const st = LOD.stats; st.parts++; st.tris0 += tris; st.tris1 += out[0] ? out[0].index.count / 3 : tris; st.tris2 += out[1] ? out[1].index.count / 3 : out[0] ? out[0].index.count / 3 : tris; st.ms += performance.now() - t0;
  return out;
}

// Merge vertices that share a position; remember which original faces touch each welded vertex.
function weld(geo) {
  const P = geo.attributes.position, I = geo.index ? geo.index.array : null, nv = P.count;
  const remap = new Uint32Array(nv), keys = new Map(), pos = [], rep = [];
  for (let i = 0; i < nv; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
    let w = keys.get(k); if (w === undefined) { w = pos.length / 3; keys.set(k, w); pos.push(x, y, z); rep.push(i); } remap[i] = w;
  }
  const nt = I ? I.length / 3 : nv / 3, index = new Uint32Array(nt * 3);
  for (let i = 0; i < nt * 3; i++) index[i] = remap[I ? I[i] : i];
  // faces per welded vertex (CSR)
  const nw = pos.length / 3, cnt = new Uint32Array(nw + 1);
  for (let i = 0; i < index.length; i++) cnt[index[i] + 1]++;
  for (let i = 0; i < nw; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(0, nw), faces = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) faces[fill[index[i]]++] = (i / 3) | 0;
  // each original face: its normal, and the attributes we'll copy (centroid UV, centroid colour)
  const fn = new Float32Array(nt * 3), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const uv = geo.attributes.uv, col = geo.attributes.color, fuv = uv && new Float32Array(nt * 2), fcol = col && new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    A.fromBufferAttribute(P, a); B.fromBufferAttribute(P, b); C.fromBufferAttribute(P, c);
    B.sub(A); C.sub(A); B.cross(C).normalize(); fn[t * 3] = B.x; fn[t * 3 + 1] = B.y; fn[t * 3 + 2] = B.z;
    if (fuv) { fuv[t * 2] = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3; fuv[t * 2 + 1] = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3; }
    if (fcol) for (let k = 0; k < 3; k++) fcol[t * 3 + k] = (col.getComponent(a, k) + col.getComponent(b, k) + col.getComponent(c, k)) / 3;
  }
  // rep: one original vertex per welded one, for per-vertex attributes that only depend on position (skin weights)
  return { pos: new Float32Array(pos), rep, index, cnt, faces, fn, fuv, fcol };
}

// Simplified welded index → a faceted geometry with the same attributes as the original
// (position, flat normal, uv / colour from the best-matching face, anything else — skinIndex, skinWeight — per vertex).
function rebuild(geo, W, idx) {
  const nt = idx.length / 3, P = W.pos;
  const pos = new Float32Array(nt * 9), nor = new Float32Array(nt * 9), uv = new Float32Array(nt * 6), col = W.fcol && new Float32Array(nt * 9);
  const extra = Object.keys(geo.attributes).filter(k => !['position', 'normal', 'uv', 'color'].includes(k)).map(k => {
    const a = geo.attributes[k]; return { k, a, out: new a.array.constructor(nt * 3 * a.itemSize) };
  });
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(); let o = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    A.fromArray(P, a * 3); B.fromArray(P, b * 3).sub(A); C.fromArray(P, c * 3).sub(A); B.cross(C);
    if (B.lengthSq() < 1e-14) continue; B.normalize();
    // the original face that best matches: same facing, and sharing the most corners
    let best = -1, score = -9;
    for (const v of [a, b, c]) for (let j = W.cnt[v]; j < W.cnt[v + 1]; j++) {
      const f = W.faces[j], fi = W.index;
      let s = B.x * W.fn[f * 3] + B.y * W.fn[f * 3 + 1] + B.z * W.fn[f * 3 + 2];
      for (let k = 0; k < 3; k++) { const q = fi[f * 3 + k]; if (q === a || q === b || q === c) s += 0.25; }
      if (s > score) { score = s; best = f; }
    }
    for (const v of [a, b, c]) {
      pos[o * 3] = P[v * 3]; pos[o * 3 + 1] = P[v * 3 + 1]; pos[o * 3 + 2] = P[v * 3 + 2];
      nor[o * 3] = B.x; nor[o * 3 + 1] = B.y; nor[o * 3 + 2] = B.z;
      if (W.fuv && best >= 0) { uv[o * 2] = W.fuv[best * 2]; uv[o * 2 + 1] = W.fuv[best * 2 + 1]; }
      if (col && best >= 0) { col[o * 3] = W.fcol[best * 3]; col[o * 3 + 1] = W.fcol[best * 3 + 1]; col[o * 3 + 2] = W.fcol[best * 3 + 2]; }
      for (const e of extra) { const n = e.a.itemSize, src = W.rep[v]; for (let c = 0; c < n; c++) e.out[o * n + c] = e.a.getComponent(src, c); }
      o++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, o * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, o * 3), 3));
  if (geo.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(uv.slice(0, o * 2), 2));
  if (geo.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(col.slice(0, o * 3), 3));
  for (const e of extra) g.setAttribute(e.k, new THREE.BufferAttribute(e.out.slice(0, o * e.a.itemSize), e.a.itemSize, e.a.normalized));
  const ix = new Uint32Array(o); for (let i = 0; i < o; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// One pass over the objects: pick each one's level from its size on screen. Cheap (no allocation), throttled.
// wide: the title flyover. Its camera sits fairly low (62 m) but looks across the whole town, so no zoom stretch.
export function lodPass(world, cam, perf, force, wide) {
  const now = performance.now(); if (!force && now - (world._lodT || 0) < LOD.every) return; world._lodT = now;
  const zy = Math.min(1, Math.max(0, (LOD.zoomHighY - cam.position.y) / (LOD.zoomHighY - LOD.zoomLowY)));
  LOD.zoomK = wide ? 1 : 1 + (LOD.zoomMax - 1) * zy;
  const k = (perf ? LOD.perfScale : 1) * LOD.zoomK, near = LOD.near * k, far = LOD.far * k, cull = LOD.cull * k;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  for (const o of world.objs) {
    if (o.state === 3 || !o.inst) continue;
    const dx = o.x - cx, dy = o.y + o.h * 0.5 - cy, dz = o.z - cz, r = Math.max(o.fd, o.h * 0.5, 0.15);
    const q = Math.sqrt(dx * dx + dy * dy + dz * dz) / r;
    let lvl = o.state !== 0 ? 0 : q < near ? 0 : q < far ? 1 : q < cull || o.pad ? 2 : 3;
    if (lvl === o.lod) continue;
    const was = o.lod; o.lod = lvl;
    for (const [bm, id, ids] of o.inst) {
      if (lvl === 3) { bm.setVisibleAt(id, false); continue; }
      if (was === 3) bm.setVisibleAt(id, true);
      if (ids) bm.setGeometryIdAt(id, ids[Math.min(lvl, ids.length - 1)]);
    }
  }
}

// People and animals: swap each mesh to its simplified copy by size on screen, drop the shadow further out,
// and hide them when they'd be a few pixels tall. Returns whether the critter is drawn (so its animation runs).
export function critterLod(cr, cam) {
  if (!cr.meshes) {
    cr.meshes = []; cr.lod = 0; cr.shadow = true;
    cr.obj.traverse(m => { if (m.isMesh && m.geometry) { m.userData.levels = [m.geometry, ...lodsFor(m.geometry, [].concat(m.material)[0])]; cr.meshes.push(m); } });
  }
  const p = cr.obj.position, c = cam.position;
  const q = Math.hypot(p.x - c.x, p.y + 0.8 - c.y, p.z - c.z) / Math.max(cr.rad, 0.45);
  const z = LOD.zoomK;
  if (q > LOD.critterCull * z) return false;
  const lvl = q < LOD.critterNear * z ? 0 : 1, sh = !LOD.farShadows && q < LOD.critterShadow * z;
  if (lvl !== cr.lod) { cr.lod = lvl; for (const m of cr.meshes) { const L = m.userData.levels; m.geometry = L[Math.min(lvl, L.length - 1)]; } }
  if (sh !== cr.shadow) { cr.shadow = sh; for (const m of cr.meshes) m.castShadow = sh; }
  return true;
}
