#!/usr/bin/env node
/*
 * back-button-check — deterministic truth anchor.
 * Every games/<name>/index.html must contain a back link to the arcade home,
 * and any such link MUST point at exactly ../../index.html. GitHub Pages 404s
 * the trailing-slash form (../../ or /) in production even though it works on
 * localhost — the arcade's single most-repeated bug.
 *
 * The check keys off the LINK, not a specific id (games use both id="backBtn"
 * and id="back-btn"): any <a> whose href resolves to the home page is treated
 * as the back button.
 *
 * Exit 0 = all good. Exit 1 = violations found (blocks commit).
 * Zero dependencies; run with `node .apm/hooks/scripts/back-button-check.js`.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const GAMES = path.join(REPO, 'games');
const GOOD = '../../index.html';
// Bad forms that resolve to the home directory but 404 on GitHub Pages.
const BAD_HOME = new Set(['../../', '../..', '/', '../../.', '../../index.htm']);

function gameIndexFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'research' || entry.name === 'node_modules') continue;
    const idx = path.join(dir, entry.name, 'index.html');
    if (fs.existsSync(idx)) out.push(idx);
  }
  return out;
}

if (!fs.existsSync(GAMES)) {
  console.log('back-button-check: no games/ dir, nothing to check.');
  process.exit(0);
}

const violations = [];
for (const file of gameIndexFiles(GAMES)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(REPO, file);
  // All anchor tags with an href.
  const anchors = src.match(/<a\b[^>]*href=["'][^"']*["'][^>]*>/gi) || [];
  const backLinks = anchors.filter(a => {
    const href = (a.match(/href=["']([^"']*)["']/i) || [])[1] || '';
    return href === GOOD || BAD_HOME.has(href);
  });
  if (backLinks.length === 0) {
    violations.push(`${rel}: no back link to the arcade home found (must link to ${GOOD})`);
    continue;
  }
  for (const a of backLinks) {
    const href = (a.match(/href=["']([^"']*)["']/i) || [])[1];
    if (href !== GOOD) {
      violations.push(`${rel}: back link href is "${href}" (must be "${GOOD}")`);
    }
  }
}

if (violations.length) {
  console.error('back-button-check FAILED:');
  for (const v of violations) console.error('  \u2717 ' + v);
  console.error(`\n${violations.length} violation(s). Back link href MUST be ${GOOD}.`);
  process.exit(1);
}
console.log('back-button-check passed \u2713 (all games link home correctly)');
process.exit(0);
