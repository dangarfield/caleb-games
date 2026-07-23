#!/usr/bin/env node
/*
 * docs-writeback — persistence guarantee (advisory).
 * If any games/<name>/** changed vs HEAD, checks that the matching
 * docs/game-<name>.md was also touched. Prints a reminder for any game whose
 * doc node wasn't updated, so game-docs-sync can be run (the docs-writeback hook
 * wires action: invoke-skill:game-docs-sync). Non-blocking (failOnError:false).
 *
 * Run with `node .apm/hooks/scripts/docs-writeback.js`.
 */
const { execSync } = require('child_process');
const path = require('path');

function changed() {
  try {
    const out = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

const files = changed();
const gamesTouched = new Set();
const docsTouched = new Set();
for (const f of files) {
  const g = f.match(/^games\/([^/]+)\//);
  if (g) gamesTouched.add(g[1]);
  const d = f.match(/^docs\/game-(.+)\.md$/);
  if (d) docsTouched.add(d[1]);
}

// Known directory→doc name mismatches (historical; do not rename).
const alias = { towerdefense: 'tower-defense', resincritters: 'resin-animals' };

const missing = [];
for (const game of gamesTouched) {
  const docName = alias[game] || game;
  if (!docsTouched.has(docName)) missing.push({ game, docName });
}

if (missing.length) {
  console.log('docs-writeback: these games changed but their docs node was not updated:');
  for (const { game, docName } of missing) {
    console.log(`  • games/${game}/  → update docs/game-${docName}.md (features / ## Memory)`);
  }
  console.log('Run the game-docs-sync skill to reconcile, and add a docs/decisions.memory.md entry if a cross-cutting decision was made.');
} else if (gamesTouched.size) {
  console.log('docs-writeback: all changed games have updated docs ✓');
} else {
  console.log('docs-writeback: no game changes detected.');
}
process.exit(0);
