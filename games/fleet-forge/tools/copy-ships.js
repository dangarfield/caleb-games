#!/usr/bin/env node
/* copy-ships.js — bring the extracted ship data into the game.
 *
 * THIS IS A COPY, NOT A BAKE. The old `bake-data.py` derived fields: it read a
 * localisation table to resolve names, matched English substrings to work out
 * what a module was, and slugged display names into image filenames. None of
 * that happens here. `research/extracted_ship_data/ships_targeted.json` is
 * already the shape the game wants, so this renames a handful of fields to the
 * short keys the rest of the code reads, and copies the art.
 *
 * NOTHING IS FILTERED. Every row in the source file becomes a ship. There are
 * no name patterns, no level thresholds, no exclusion lists — the source file
 * IS the roster, and curating it is done there, by hand, not here.
 *
 *   node tools/copy-ships.js [--images] [--src <dir>]
 *
 * `--images` also copies one picture per ship — the upgraded render, since
 * every hull here is its fully-upgraded self. Whatever format the source is in
 * is what gets copied, and the extension is recorded in the data file so the
 * browser does not have to guess.
 */
'use strict';
var fs = require('fs'), path = require('path');

var ROOT = path.join(__dirname, '..');
var argv = process.argv.slice(2);
var SRC = argv.indexOf('--src') >= 0 ? argv[argv.indexOf('--src') + 1]
                                     : path.join(ROOT, 'research');
var WANT_IMAGES = argv.indexOf('--images') >= 0;

/* NOTHING IS RENAMED. Every field keeps the name the extractor gave it. This
   list exists only so a column the game has never read gets reported the first
   time it appears, rather than arriving unnoticed. */
var KNOWN = ['key', 'displayName', 'tier', 'width', 'height', 'grid',
             'baseMovementSpeed', 'baseTurnSpeed', 'requiredLevelSource', 'bonus'];

function main() {
  var srcFile = path.join(SRC, 'extracted_ship_data', 'ships_targeted.json');
  var rows = JSON.parse(fs.readFileSync(srcFile, 'utf8'));

  var ships = {}, seen = {}, unknown = {};
  rows.forEach(function (row) {
    var out = {};
    Object.keys(row).forEach(function (k) {
      out[k] = row[k];
      if (KNOWN.indexOf(k) < 0) unknown[k] = (unknown[k] || 0) + 1;
    });
    if (!out.key) throw new Error('a row has no key');
    if (seen[out.key]) throw new Error('duplicate ship key: ' + out.key);
    seen[out.key] = 1;
    ships[out.key] = out;
  });

  var outFile = path.join(ROOT, 'data', 'ships.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  /* The art extension is recorded rather than assumed — the source has been
     both PNG and webp — so the browser does not have to guess. */
  var art = WANT_IMAGES ? copyImages(ships) : currentArt(path.join(ROOT, 'images', 'ships'));
  fs.writeFileSync(outFile, JSON.stringify({ version: 1, art: art, ships: ships }));

  var n = Object.keys(ships).length;
  console.log('copied ' + n + ' ships -> data/ships.json (' +
              (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB)');

  var un = Object.keys(unknown);
  if (un.length) console.log('  fields the game has not seen before: ' + un.join(', '));

  /* what the roster looks like, so a bad source file is obvious immediately */
  var byTier = {};
  Object.keys(ships).forEach(function (k) {
    var t = ships[k].tier;
    (byTier[t] = byTier[t] || []).push(ships[k]);
  });
  Object.keys(byTier).sort(function (a, b) { return a - b; }).forEach(function (t) {
    var list = byTier[t].map(function (s) { return s.requiredLevelSource || 0; }).sort(function (a, b) { return a - b; });
    console.log('  tier ' + t + ': ' + byTier[t].length + ' ships, levels ' +
                list[0] + '-' + list[list.length - 1]);
  });

  /* every distinct bonus key present, so a new one cannot arrive unnoticed */
  var bk = {};
  Object.keys(ships).forEach(function (k) {
    var b = ships[k].bonus || {};
    Object.keys(b).forEach(function (x) { bk[x] = (bk[x] || 0) + 1; });
  });
  console.log('  ' + Object.keys(bk).length + ' distinct bonus keys across the roster');

  if (!WANT_IMAGES) console.log('  (images skipped — pass --images to copy them; art: ' + art + ')');
}

/* What is already on disk, for a data-only run. */
function currentArt(dir) {
  if (!fs.existsSync(dir)) return 'webp';
  var f = fs.readdirSync(dir).filter(function (x) { return /\.(webp|png)$/.test(x); })[0];
  return f ? path.extname(f).slice(1) : 'webp';
}

/* One picture per ship: the upgraded render, which is the one the game would
   show because every ship here is its fully-upgraded self. The source folder
   also holds an atlas and a handful of skins per hull; those are not copied. */
function copyImages(ships) {
  var dst = path.join(ROOT, 'images', 'ships');
  fs.mkdirSync(dst, { recursive: true });
  var copied = 0, missing = [], bytes = 0, ext = null, mixed = [];
  Object.keys(ships).forEach(function (k) {
    var from = find(path.join(SRC, 'ship_images', k), k + '_upgraded');
    if (!from) { missing.push(k); return; }
    var e = path.extname(from).slice(1);
    if (!ext) ext = e; else if (e !== ext) mixed.push(k + ' (' + e + ')');
    var to = path.join(dst, k + '.' + e);
    fs.copyFileSync(from, to);
    bytes += fs.statSync(to).size;
    copied++;
  });
  console.log('  copied ' + copied + ' images -> images/ships/ (' +
              (bytes / 1048576).toFixed(1) + ' MB of ' + ext + ')');
  if (missing.length) console.log('  NO IMAGE for: ' + missing.join(', '));
  /* One extension for the whole set, because the browser is told one. */
  if (mixed.length) throw new Error('images are not all ' + ext + ': ' + mixed.join(', '));
  stale(dst, ships, ext);
  return ext || 'webp';
}

/* The source has changed format before, so find the file rather than assume
   its extension. */
function find(dir, name) {
  var exts = ['webp', 'png'];
  for (var i = 0; i < exts.length; i++) {
    var p = path.join(dir, name + '.' + exts[i]);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* A format change leaves the old files behind, and a stale `<key>.png` beside a
   fresh `<key>.webp` is 25MB of dead weight nobody notices. */
function stale(dir, ships, ext) {
  var dead = fs.readdirSync(dir).filter(function (f) {
    return !(path.extname(f).slice(1) === ext && ships[path.basename(f, path.extname(f))]);
  });
  if (!dead.length) return;
  dead.forEach(function (f) { fs.unlinkSync(path.join(dir, f)); });
  console.log('  removed ' + dead.length + ' file(s) that are no longer the art for a hull');
}

main();
