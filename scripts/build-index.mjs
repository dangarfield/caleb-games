#!/usr/bin/env node
/**
 * build-index.mjs: generates index.html from index.template.html + games/<slug>/card.json
 *
 *   node scripts/build-index.mjs              build (exits 1 and writes nothing if any card is invalid)
 *   node scripts/build-index.mjs --check      exit 1 if index.html or the README games list is stale (for hooks / pre-commit)
 *   node scripts/build-index.mjs --new-days=14
 *
 * It also regenerates the games list in README.md (between the games:start / games:end markers)
 * and warns about any visible game with no row in docs/games-index.md.
 *
 * Spec: .apm/specs/game-card.spec.md. Never edit index.html (or the README games list) by hand; edit the card.json files.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---pure-start
const DEFAULT_TITLE = { font: 'Bricolage Grotesque', weight: 800, size: 25, color: '#ffffff', letterSpacing: '-0.02em', transform: 'none', style: 'normal', shadow: '0 2px 4px rgba(0,0,0,.3)' };
const DEFAULT_THEMED_SHADOW = '0 2px 6px rgba(0,0,0,.35)';
const DEFAULT_BLURB = { color: 'rgba(255,255,255,.92)', shadow: '0 1px 2px rgba(0,0,0,.25)' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssv = v => String(v).replace(/[;"<>{}]/g, '');
const hex6 = h => (h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h).toLowerCase();
const lum = h => { const n = parseInt(hex6(h).slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const withAlpha = (h, a) => hex6(h) + Math.round(a * 255).toString(16).padStart(2, '0');

// Blurb fit: the card shows at most 2 lines and must never fall back to an ellipsis.
// Glyph advances (px ×100) for Bricolage Grotesque 500 @ 14px, measured in Chrome with canvas.measureText.
// At the arcade's 1333×690 viewport the blurb box is 242px wide; BLURB_LINE_PX keeps a small safety margin.
const BLURB_LINES = 2, BLURB_LINE_PX = 236;
const BLURB_ASCII = [344,373,444,857,882,1325,1058,222,427,406,553,722,230,474,274,494,918,447,817,833,833,839,905,690,904,896,290,262,722,722,722,578,1333,939,932,939,967,838,809,988,992,384,500,933,711,1272,1045,1002,881,1007,924,897,774,1006,919,1340,913,841,784,441,478,420,765,809,396,793,865,777,864,798,531,824,851,363,372,786,360,1277,851,845,865,864,575,748,532,838,765,1157,747,827,700,495,362,464,722];
const BLURB_EXTRA = { '’': 246, '‘': 246, '“': 484, '”': 484, '—': 1074, '–': 729, '…': 988, 'é': 798, '×': 722, '÷': 722, '·': 274, '•': 379, '°': 490, '£': 1004, '€': 1034, '−': 722 };
const glyphPx = ch => { const k = ch.codePointAt(0); if (k >= 32 && k < 127) return BLURB_ASCII[k - 32] / 100; if (ch in BLURB_EXTRA) return BLURB_EXTRA[ch] / 100; return k > 0x2000 ? 18 : 10; };
const textPx = t => [...t].reduce((s, ch) => s + glyphPx(ch), 0);
function blurbLines(text) {
  // Greedy wrap on spaces only (browsers can also break after dashes, so this errs on the safe side).
  const space = glyphPx(' ');
  let lines = 1, w = 0;
  for (const word of text.trim().split(/\s+/)) {
    const ww = textPx(word);
    if (w === 0) w = ww; else if (w + space + ww <= BLURB_LINE_PX) w += space + ww; else { lines++; w = ww; }
    while (w > BLURB_LINE_PX) { lines++; w -= BLURB_LINE_PX; }
  }
  return lines;
}

function validateCard(c, dir, fileExists) {
  const e = [], at = `games/${dir}/card.json`;
  if (c.slug !== dir) e.push(`${at}: "slug" must equal the folder name "${dir}"`);
  if (!c.name) e.push(`${at}: "name" is required`);
  if (!c.blurb) e.push(`${at}: "blurb" is required`);
  else if (c.blurb.length > 110) e.push(`${at}: "blurb" is ${c.blurb.length} chars (max 110)`);
  else if (blurbLines(c.blurb) > BLURB_LINES) e.push(`${at}: "blurb" needs ${blurbLines(c.blurb)} lines on the card (max ${BLURB_LINES}, no ellipsis). Reword it shorter: "${c.blurb}"`);
  if (!DATE_RE.test(c.added || '')) e.push(`${at}: "added" must be YYYY-MM-DD (run scripts/backfill-card-dates.mjs for old games)`);
  if (c.updated && !DATE_RE.test(c.updated)) e.push(`${at}: "updated" must be YYYY-MM-DD`);
  const icon = c.icon || {};
  if (!icon.emoji && !icon.image) e.push(`${at}: "icon" needs "emoji" or "image"`);
  if (icon.image && !fileExists(icon.image)) e.push(`${at}: icon image games/${dir}/${icon.image} not found`);
  if (icon.art && !icon.image) e.push(`${at}: icon "art" needs an "image"`);
  if (c.wordmark && !fileExists(c.wordmark)) e.push(`${at}: wordmark games/${dir}/${c.wordmark} not found`);
  const g = c.background && c.background.gradient;
  if (!Array.isArray(g) || g.length < 2 || g.length > 3 || !g.every(x => HEX_RE.test(x))) e.push(`${at}: "background.gradient" must be 2–3 hex colours`);
  if (c.background && c.background.css && /url\(/i.test(c.background.css)) e.push(`${at}: "background.css" must not use url()`);
  if (c.glow && !HEX_RE.test(c.glow)) e.push(`${at}: "glow" must be a hex colour`);
  return e;
}

function renderCard(c) {
  const themed = !!c.title;
  const t = { ...DEFAULT_TITLE, ...(themed ? { shadow: DEFAULT_THEMED_SHADOW } : {}), ...(c.title || {}) };
  const b = { ...DEFAULT_BLURB, ...(c.blurbStyle || {}) };
  const stops = c.background.gradient;
  const bg = c.background.css || `linear-gradient(145deg, ${stops.join(', ')})`;
  const glow = c.glow || [...stops].sort((x, y) => lum(y) - lum(x))[0];
  const base = `games/${c.slug}/`;
  const href = c.entry || base;
  const icon = c.icon.image ? `<img src="${esc(base + c.icon.image)}" alt="">` : esc(c.icon.emoji);
  const iconClass = c.icon.art ? 'gc-icon gc-art' : 'gc-icon';
  const title = c.wordmark ? `<img class="gc-wordmark" src="${esc(base + c.wordmark)}" alt="${esc(c.name)}">` : esc(c.name);
  const titleStyle = `font-family:'${cssv(t.font)}',sans-serif;font-weight:${Number(t.weight)};font-style:${t.style === 'italic' ? 'italic' : 'normal'};font-size:${Number(t.size)}px;color:${cssv(t.color)};letter-spacing:${cssv(t.letterSpacing)};text-transform:${cssv(t.transform)};text-shadow:${cssv(t.shadow)}`;
  return [
    `    <a href="${esc(href)}" class="gc" data-slug="${esc(c.slug)}" data-added="${esc(c.added)}" style="--bg:${cssv(bg)};--glow:${withAlpha(glow, 0.4)};--glow-hover:${withAlpha(glow, 0.6)}">`,
    `      <span class="${iconClass}" aria-hidden="true">${icon}</span>`,
    `      <span class="gc-new" hidden>NEW</span>`,
    `      <span class="gc-title" style="${titleStyle}">${title}</span>`,
    `      <span class="gc-blurb" style="color:${cssv(b.color)};text-shadow:${cssv(b.shadow)}">${esc(c.blurb)}</span>`,
    `    </a>`,
  ].join('\n');
}

function fontsLink(cards) {
  const fam = new Map();
  for (const c of cards) {
    if (!c.title || !c.title.font || c.title.font === DEFAULT_TITLE.font) continue;
    if (!fam.has(c.title.font)) fam.set(c.title.font, new Set());
    fam.get(c.title.font).add((c.title.style === 'italic' ? 1 : 0) + ',' + Number(c.title.weight || 400));
  }
  if (!fam.size) return '';
  const q = [...fam].sort(([a], [b]) => a.localeCompare(b)).map(([f, set]) => {
    const vs = [...set].map(v => v.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const name = 'family=' + f.replace(/ /g, '+');
    if (vs.some(([i]) => i)) return name + ':ital,wght@' + vs.map(v => v.join(',')).join(';');   // italic needs the ital axis
    const ws = vs.map(v => v[1]);
    return name + (ws.length === 1 && ws[0] === 400 ? '' : ':wght@' + ws.join(';'));
  }).join('&amp;');
  return `<link href="https://fonts.googleapis.com/css2?${q}&amp;display=swap" rel="stylesheet">`;
}

function sortCards(cards) {
  return cards.filter(c => !c.hidden).sort((a, b) => b.added.localeCompare(a.added) || a.name.localeCompare(b.name));
}

function buildIndex({ template, cards, newDays = 14 }) {
  const visible = sortCards(cards);
  const fill = (s, tok, val) => s.split(tok).join(val);
  let html = template;
  html = fill(html, '%%FONTS_LINK%%', fontsLink(visible));
  html = fill(html, '%%COUNT%%', String(visible.length));
  html = fill(html, '%%NEW_DAYS%%', String(newDays));
  html = fill(html, '%%CARDS%%', visible.map(renderCard).join('\n'));
  return { html, visible };
}
const README_START = '<!-- games:start (generated by scripts/build-index.mjs from games/*/card.json; do not edit by hand) -->';
const README_END = '<!-- games:end -->';
function buildReadme(readme, cards) {
  const i = readme.indexOf(README_START), j = readme.indexOf(README_END);
  if (i < 0 || j < i) return null;
  const list = sortCards(cards); // same order as the home page: newest first
  const md = s => String(s).replace(/([\\`*_[\]<>|])/g, '\\$1');
  const body = [`${list.length} games, newest first (the same order as the home page). Each name links to the game's folder.`, '',
    ...list.map(c => `- [**${md(c.name)}**](games/${c.slug}/) — ${md(c.blurb)}`)].join('\n');
  return readme.slice(0, i) + README_START + '\n' + body + '\n' + readme.slice(j);
}
// ---pure-end

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const newDays = Number((argv.find(a => a.startsWith('--new-days=')) || '=14').split('=')[1]) || 14;

const gamesDir = join(ROOT, 'games');
const cards = [], errors = [], warnings = [];
for (const d of readdirSync(gamesDir, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  if (d.name.startsWith('_')) continue; // games/_shared etc: assets used by several games, not a game
  const file = join(gamesDir, d.name, 'card.json');
  if (!existsSync(file) && readdirSync(join(gamesDir, d.name)).length === 0) continue; // empty placeholder folder
  if (!existsSync(file)) { warnings.push(`games/${d.name}: no card.json, so it isn't on the home page`); continue; }
  let c;
  try { c = JSON.parse(readFileSync(file, 'utf8')); }
  catch (err) { errors.push(`games/${d.name}/card.json: invalid JSON (${err.message})`); continue; }
  errors.push(...validateCard(c, d.name, p => existsSync(join(gamesDir, d.name, p))));
  cards.push(c);
}

warnings.forEach(w => console.warn('warn  ' + w));
if (errors.length) {
  errors.forEach(e => console.error('error ' + e));
  console.error(`\n${errors.length} card error(s): index.html NOT written.`);
  process.exit(1);
}

const { html, visible } = buildIndex({ template: readFileSync(join(ROOT, 'index.template.html'), 'utf8'), cards, newDays });
const out = join(ROOT, 'index.html');
const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
const readmeFile = join(ROOT, 'README.md');
const readmeCur = existsSync(readmeFile) ? readFileSync(readmeFile, 'utf8') : '';
const readme = buildReadme(readmeCur, cards);
if (readme === null) { console.error(`README.md is missing the games-list markers:\n  ${README_START}\n  ${README_END}`); process.exit(1); }
const gamesIndex = join(ROOT, 'docs', 'games-index.md');
if (existsSync(gamesIndex)) {
  const gi = readFileSync(gamesIndex, 'utf8');
  for (const c of visible) if (!gi.includes(`games/${c.slug}/`)) console.warn(`warn  games/${c.slug}: no row in docs/games-index.md (run the game-docs-sync skill)`);
  const m = gi.match(/All (\d+) games/);
  if (m && Number(m[1]) !== visible.length) console.warn(`warn  docs/games-index.md says "All ${m[1]} games" but ${visible.length} are on the home page (run the game-docs-sync skill)`);
}

if (check) {
  let stale = false;
  if (current !== html) { console.error('index.html is out of date. Run: node scripts/build-index.mjs'); stale = true; }
  if (readmeCur !== readme) { console.error('README.md games list is out of date. Run: node scripts/build-index.mjs'); stale = true; }
  if (stale) process.exit(1);
  console.log('index.html and README.md are up to date.');
  process.exit(0);
}
if (readmeCur === readme) console.log('README.md games list unchanged.');
else { writeFileSync(readmeFile, readme); console.log(`README.md games list rebuilt (${visible.length} games).`); }
if (current === html) console.log(`index.html unchanged (${visible.length} games).`);
else { writeFileSync(out, html); console.log(`index.html rebuilt: ${visible.length} games shown, ${cards.length - visible.length} hidden.`); }
