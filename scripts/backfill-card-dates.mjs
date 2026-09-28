#!/usr/bin/env node
/**
 * One-off: fills a missing "added" date in games/<slug>/card.json with the date of the
 * first git commit that touched games/<slug>/. Cards that already have "added" are left alone.
 *   node scripts/backfill-card-dates.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry-run');
const ORDER = ['$schema', 'slug', 'name', 'blurb', 'added', 'updated', 'entry', 'hidden', 'icon', 'wordmark', 'title', 'blurbStyle', 'background', 'glow', 'locked', 'source'];
const today = new Date().toISOString().slice(0, 10);

for (const d of readdirSync(join(ROOT, 'games'), { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const file = join(ROOT, 'games', d.name, 'card.json');
  if (!existsSync(file)) continue;
  const card = JSON.parse(readFileSync(file, 'utf8'));
  if (card.added) continue;
  let date = '';
  try {
    date = execFileSync('git', ['log', '--reverse', '--format=%as', '--', `games/${d.name}`], { cwd: ROOT }).toString().trim().split('\n')[0];
  } catch {}
  card.added = date || today;
  const sorted = Object.fromEntries([...ORDER.filter(k => k in card).map(k => [k, card[k]]), ...Object.entries(card).filter(([k]) => !ORDER.includes(k))]);
  console.log(`${d.name.padEnd(22)} added ${card.added}${date ? '' : '  (no git history, used today)'}`);
  if (!dry) writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
}
