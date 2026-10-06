// Ember Bay: slim the town model packs (run once after the packs or the town layout change).
//   cd games/ember-bay/tools && npm install && node slim-packs.mjs ../../_shared/assets keep-models.json
// 1. Drops every model that is never used. keep-models.json lists the ids to keep: everything the town
//    generator places (seed 1333) + every id the minigames load (found by running all 66 levels) + every
//    id quoted in js/*.js. The *.json indexes are left untouched, so the generator's indices still line up;
//    a dropped model simply has no mesh (partsOf() returns []).
// 2. Simplifies heavy meshes (>= 7k triangles) offline, exactly as city-assets.js used to at load time:
//    weld on position+uv, meshoptimizer simplify to 30% with locked borders (palette UVs don't bleed),
//    keep only if it saves >15%, then re-facet (flat normals).
// Output overwrites <assets>/{city,extra}-*.glb.gz. ALWAYS start from the originals (copy
// research/Firefighter minigames for threejs/assets/{city,extra}-*.glb.gz into ../../_shared/assets first): running it on
// already-slimmed packs would simplify the heavy meshes a second time.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [dir, keepFile] = process.argv.slice(2);
const KEEP = new Set(JSON.parse(fs.readFileSync(keepFile, 'utf8')));
await MeshoptSimplifier.ready;
const io = new NodeIO();

function simplifyPrim(doc, prim) {
  const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
  if (!P) return 0;
  const n = I ? I.getCount() : P.getCount(); if (n / 3 < 7000) return 0;
  const map = new Map(), pos = [], uv = [], idx = new Uint32Array(n), a = [0, 0, 0], t = [0, 0];
  for (let k = 0; k < n; k++) {
    const v = I ? I.getScalar(k) : k; P.getElement(v, a); if (U) U.getElement(v, t); else t[0] = t[1] = 0;
    const key = Math.round(a[0] * 500) + ',' + Math.round(a[1] * 500) + ',' + Math.round(a[2] * 500) + ',' + Math.round(t[0] * 2000) + ',' + Math.round(t[1] * 2000);
    let r = map.get(key); if (r === undefined) { r = map.size; map.set(key, r); pos.push(a[0], a[1], a[2]); uv.push(t[0], t[1]); } idx[k] = r;
  }
  const [out] = MeshoptSimplifier.simplify(idx, new Float32Array(pos), 3, Math.floor(n / 3 * 0.3) * 3, 0.008, ['LockBorder']);
  if (out.length > n * 0.85) return 0;
  const fp = new Float32Array(out.length * 3), fu = new Float32Array(out.length * 2), fn = new Float32Array(out.length * 3);
  for (let k = 0; k < out.length; k++) { const v = out[k]; fp.set(pos.slice(v * 3, v * 3 + 3), k * 3); fu.set(uv.slice(v * 2, v * 2 + 2), k * 2); }
  for (let k = 0; k < out.length; k += 3) { // flat normal per triangle
    const ax = fp[k * 3], ay = fp[k * 3 + 1], az = fp[k * 3 + 2], ux = fp[k * 3 + 3] - ax, uy = fp[k * 3 + 4] - ay, uz = fp[k * 3 + 5] - az, vx = fp[k * 3 + 6] - ax, vy = fp[k * 3 + 7] - ay, vz = fp[k * 3 + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let j = 0; j < 3; j++) fn.set([nx, ny, nz], (k + j) * 3);
  }
  for (const s of prim.listSemantics()) prim.setAttribute(s, null);
  prim.setIndices(null);
  const buf = doc.getRoot().listBuffers()[0];
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(fp).setBuffer(buf));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(fn).setBuffer(buf));
  if (U) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(fu).setBuffer(buf));
  return n / 3 - out.length / 3;
}

for (const f of fs.readdirSync(dir).filter(f => /^(city|extra)-.*\.glb\.gz$/.test(f))) {
  const file = path.join(dir, f), before = fs.statSync(file).size;
  const doc = await io.readBinary(new Uint8Array(zlib.gunzipSync(fs.readFileSync(file))));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  let dropped = 0, kept = 0;
  // A model is a named node under the unnamed root wrapper (LowPoly: the mesh node; extras: a group).
  const tops = []; const walk = n => { if (!n.getName() && !n.getMesh() && n.listChildren().length) n.listChildren().forEach(walk); else tops.push(n); };
  scene.listChildren().forEach(walk);
  for (const n of tops) { if (KEEP.has(n.getName())) kept++; else { n.dispose(); dropped++; } }
  await doc.transform(prune({ keepAttributes: true, keepIndices: true }));
  let saved = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) saved += simplifyPrim(doc, p);
  await doc.transform(prune({ keepAttributes: true, keepIndices: true }));
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, zlib.gzipSync(bin, { level: 9 }));
  console.log(f.padEnd(26), 'kept', String(kept).padStart(3), 'dropped', String(dropped).padStart(3), 'tris simplified -' + Math.round(saved), (before / 1e6).toFixed(2) + ' MB ->', (fs.statSync(file).size / 1e6).toFixed(2) + ' MB');
}
