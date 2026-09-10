import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { weld, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [,, inFile, outFile] = process.argv;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(inFile);
const root = doc.getRoot();

const names = () => root.listNodes().map(n => n.getName());
const before = { nodes: root.listNodes().length, meshes: root.listMeshes().length, names: new Set(names()) };

// The 22251x794 panorama PNG is 17.4MB of the 23.5MB file — and it is bigger
// than the max texture size on plenty of tablets. It is a hidden decorative
// backdrop, so it goes down to 4096 wide as WebP.
for (const tex of root.listTextures()) {
  tex.setImage(new Uint8Array(fs.readFileSync('panorama-4096.webp')));
  tex.setMimeType('image/webp');
  console.log('texture ->', tex.getName(), 'webp', tex.getImage().byteLength, 'bytes');
}
doc.createExtension(EXTTextureWebP).setRequired(true);

// Deliberately NO prune/dedup/join/instance: node names and the parent/child
// naming are load-bearing (ROLE_RULES, the "Name_1" fold, mailbox suffixes),
// and shared geometry would break the topple/flap pivots that edit geometry.
await doc.transform(
  weld(),
  reorder({ encoder: MeshoptEncoder }),
  // 16-bit positions: at 14 the 900-unit level would step by ~5cm.
  quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
doc.createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

await io.write(outFile, doc);
const after = { nodes: root.listNodes().length, meshes: root.listMeshes().length, names: new Set(names()) };
const lost = [...before.names].filter(n => !after.names.has(n));
console.log(JSON.stringify({
  nodes: [before.nodes, after.nodes], meshes: [before.meshes, after.meshes],
  namesLost: lost.length, sampleLost: lost.slice(0, 8),
}, null, 1));

// ---------------------------------------------------------------------------
// How to run this (needs network, so the cloud workspace rather than the local VM):
//
//   npm install @gltf-transform/core @gltf-transform/extensions \
//               @gltf-transform/functions meshoptimizer
//   node pack-level.mjs paper-level.glb paper-level.opt.glb
//
// It expects panorama-4096.webp beside it — the backdrop texture, resized from
// the 22251x794 PNG in the source file. To remake that:
//
//   python3 -c "from PIL import Image; im=Image.open('panorama.png'); \
//     im.resize((4096, round(794*4096/22251)), Image.LANCZOS) \
//       .save('panorama-4096.webp','WEBP',quality=82,method=6)"
//
// Result: 23.5MB -> 1.5MB, same 1635 nodes, same 972 meshes, no names lost.
