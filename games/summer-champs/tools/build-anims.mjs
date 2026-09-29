#!/usr/bin/env node
// Summer Champs: build ONE trimmed animation library from Quaternius UAL1 + UAL2.
//
//   node games/summer-champs/tools/build-anims.mjs <UAL1_AllAnimations.glb> <UAL2_AllAnimations.glb>
//
// What it does:
//   1. Loads UAL1 (mesh + skeleton + clips) as the base and UAL2 (same rig) as a clip donor.
//   2. Works out which clips the game uses: every quoted string in games/summer-champs/js/*.js
//      that names a clip (also tries the name without "_Loop", like the runtime ALIAS does),
//      plus anything listed in tools/anim-keep.json -> "extra".
//   3. Copies the used UAL2 clips onto UAL1's bones by bone name (one rig, one model).
//      A name in both libraries keeps UAL1's copy, the same rule the old loader used.
//   4. Drops every other clip, the Root motion tracks (the game strips them at runtime anyway),
//      then prunes, dedups, resamples (lossless keyframe reduction) and meshopt-compresses.
//   5. Writes games/summer-champs/assets/summer-champs-anims.glb + a clip manifest.
//
// Needs (once, in games/summer-champs/tools):  npm install
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const [ual1, ual2] = process.argv.slice(2);
if (!ual1 || !ual2) { console.error('usage: build-anims.mjs <UAL1.glb> <UAL2.glb>'); process.exit(1); }

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const base = await io.read(ual1);
const donor = await io.read(ual2);
const baseRoot = base.getRoot(), donorRoot = donor.getRoot();

// ---- 1. which clips does the game reference? ----
const all = new Map();                 // clip name -> { lib, anim }
for (const a of baseRoot.listAnimations()) all.set(a.getName(), { lib: 1, anim: a });
for (const a of donorRoot.listAnimations()) if (!all.has(a.getName())) all.set(a.getName(), { lib: 2, anim: a });

const src = fs.readdirSync(path.join(GAME, 'js')).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(GAME, 'js', f), 'utf8')).join('\n');
const literals = new Set();
for (const m of src.matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)) literals.add(m[1]);
const keepCfg = fs.existsSync(path.join(HERE, 'anim-keep.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'anim-keep.json'), 'utf8')) : {};
for (const n of keepCfg.extra || []) literals.add(n);

const keep = new Set();
for (const s of literals) {
  for (const n of [s, s.replace(/_Loop$/, ''), s + '_Loop']) if (all.has(n)) keep.add(n);
}
for (const n of keepCfg.drop || []) keep.delete(n);

// ---- 2. copy used UAL2 clips onto UAL1 bones ----
const nodeByName = new Map(baseRoot.listNodes().map(n => [n.getName(), n]));
const copyAcc = acc => base.createAccessor(acc.getName())
  .setArray(acc.getArray().slice()).setType(acc.getType()).setNormalized(acc.getNormalized())
  .setBuffer(baseRoot.listBuffers()[0]);
let copied = 0, missingBones = new Set();
for (const name of keep) {
  const { lib, anim } = all.get(name);
  if (lib !== 2) continue;
  const out = base.createAnimation(name);
  const samplers = new Map();
  for (const ch of anim.listChannels()) {
    const tgtName = ch.getTargetNode()?.getName();
    const tgt = nodeByName.get(tgtName);
    if (!tgt) { missingBones.add(tgtName); continue; }
    const s = ch.getSampler();
    let ns = samplers.get(s);
    if (!ns) {
      ns = base.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
      samplers.set(s, ns); out.addSampler(ns);
    }
    out.addChannel(base.createAnimationChannel().setTargetNode(tgt).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
  copied++;
}

// ---- 3. drop unused clips + Root motion ----
for (const a of baseRoot.listAnimations()) {
  if (!keep.has(a.getName())) { disposeAnim(a); continue; }
  for (const ch of a.listChannels()) if (ch.getTargetNode()?.getName() === 'Root') ch.dispose();
  const used = new Set(a.listChannels().map(ch => ch.getSampler()));
  for (const s of a.listSamplers()) if (!used.has(s)) s.dispose();
}
// Samplers keep their accessors alive after the animation goes, so drop them explicitly.
function disposeAnim(a) {
  for (const ch of a.listChannels()) ch.dispose();
  for (const s of a.listSamplers()) s.dispose();   // prune() then drops the accessors nobody uses
  a.dispose();
}

await base.transform(
  prune(), dedup(), resample({ tolerance: 1e-4 }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const outDir = path.join(GAME, 'assets'); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'summer-champs-anims.glb');
await io.write(outFile, base);

const kept = [...keep].sort();
const unused = [...all.keys()].filter(n => !keep.has(n)).sort();
fs.writeFileSync(path.join(HERE, 'anim-manifest.json'), JSON.stringify({
  built: new Date().toISOString().slice(0, 10), sources: [path.basename(ual1), path.basename(ual2)],
  kept: kept.map(n => ({ name: n, from: 'UAL' + all.get(n).lib })), unusedCount: unused.length, unused,
}, null, 2) + '\n');

const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`UAL1 ${kb(ual1)} + UAL2 ${kb(ual2)}  ->  ${path.relative(process.cwd(), outFile)} ${kb(outFile)}`);
console.log(`kept ${kept.length} clips (${copied} from UAL2), dropped ${unused.length}`);
if (missingBones.size) console.log('UAL2 bones with no UAL1 match (tracks skipped):', [...missingBones].join(', '));
