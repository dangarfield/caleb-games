#!/usr/bin/env node
/**
 * validate-maps.mjs — check maps.json before the browser sees it.
 *
 * The game loads maps.json LIVE (maps.js `loadBundle` fetches it on every page
 * load), so there is NO build step — editing the file and reloading is enough for
 * new cities to appear in the level select. This script exists only to catch author
 * mistakes early: it runs the exact same `compileBundle` the game uses and prints
 * what each map compiled to, so a typo doesn't just silently drop a city.
 *
 *   node games/roadways/validate-maps.mjs            # checks ./maps.json next to it
 *   node games/roadways/validate-maps.mjs some.json  # or a path you give
 *
 * Exit code 0 = every map compiled; 1 = at least one map was skipped (or the file
 * could not be read), so it is safe to use in a pre-commit hook or CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compileBundle } from './maps.js';

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(process.argv[2] || `${here}/maps.json`);

let raw;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`✗ could not read/parse ${path}\n  ${e.message}`);
  process.exit(1);
}

const { maps, errors } = compileBundle(raw);

console.log(`maps.json → ${path}`);
console.log(`Compiled ${maps.length} playable map(s):\n`);
maps.forEach((m, i) => {
  const s = m.start, p = m.playable;
  const sz = (r) => `${r.x1 - r.x0 + 1}×${r.y1 - r.y0 + 1}`;
  console.log(
    `  ${i + 1}. ${m.name}  (id ${m.id})\n` +
    `       grid ${m.cols}×${m.rows} · start ${sz(s)} @ (${s.x0},${s.y0}) · ` +
    `playable ${sz(p)} @ (${p.x0},${p.y0}) · water ${m.water} · mountain ${m.mountain} · ${m.terrain}`
  );
});

if (errors.length) {
  console.log(`\n✗ ${errors.length} map(s) SKIPPED — these will not appear in the game:`);
  for (const e of errors) console.log(`    ${e}`);
  process.exit(1);
}
console.log(`\n✓ all maps compiled clean.`);
