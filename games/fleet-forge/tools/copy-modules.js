#!/usr/bin/env node
/* copy-modules.js — bring the extracted module data into the game.
 *
 * THIS IS A COPY, NOT A BAKE, in the same spirit as copy-ships.js. The old
 * `bake-data.py` matched English substrings to decide what a module was and
 * slugged display names into image filenames. None of that happens here.
 *
 * NOTHING IS FILTERED. Every row in `modules_all.json` becomes a module. The
 * source file IS the roster; curating it is done there, not here.
 *
 * Three things are not carried straight through, and all three come from data
 * rather than from a list of names:
 *
 *   1. NOTHING IS RENAMED. Every field keeps the name the extractor gave it —
 *      `requiredLevel`, `powerUse`, `thrustPower` — because a two-letter alias
 *      saves a few KB and costs every reader. `module_keys.json` travels with
 *      the data as the legend; its `old` column records what each field used to
 *      be called, for reading old saves and old commits.
 *
 *   2. `subtype`. The sim dispatches on it (engine vs warp vs afterburner,
 *      mine vs rocket, point defence vs junk) and it is in no extracted field:
 *      `category` cannot tell a Warp Drive from an Afterburner, because both
 *      are category 64 with every engine stat at zero. What DOES separate them
 *      is the Unity behaviour script each module is attached to, which is in
 *      `modules_raw/<key>.json` as `m_Script.m_PathID`. Sixteen scripts cover
 *      all 100 modules, one per behaviour, so BEHAVIOUR below maps script to
 *      subtype. An unrecognised script is a hard error listing its members —
 *      if the ids shift on a re-extract this fails loudly instead of quietly
 *      mistyping half the roster.
 *
 *   3. `damageType` and `turret`, both read straight off `category` and
 *      `fireCone`.
 *
 *   node tools/copy-modules.js [--images] [--src <dir>]
 *
 * `--images` copies one picture per module, named by key. Whatever format the
 * source is in is what gets copied — no conversion, and the extension is
 * recorded in the data file so the browser does not have to guess.
 */
'use strict';
var fs = require('fs'), path = require('path');

var ROOT = path.join(__dirname, '..');
var argv = process.argv.slice(2);
var SRC = argv.indexOf('--src') >= 0 ? argv[argv.indexOf('--src') + 1]
                                     : path.join(ROOT, 'research');
var WANT_IMAGES = argv.indexOf('--images') >= 0;

var DATA_DIR = path.join(SRC, 'extracted_module_data');

/* Unity behaviour script -> what the sim calls that behaviour. One entry per
   distinct script in the source; the members are listed so a shifted id is
   obvious when the tool reports the grouping. 'byCategory' means the script is
   shared by two families the category bit already separates. */
var BEHAVIOUR = {
  676:  'byCategory',   /* armour plates and reactors share one script */
  1086: 'weapon',       /* chainguns, railguns, mass drivers, their turrets */
  1026: 'weapon',       /* piercing ballistics */
  433:  'weapon',       /* shotguns */
  660:  'weapon',       /* lasers, pulse lasers, fusion */
  746:  'weapon',       /* rockets and rocket turrets */
  595:  'weapon',       /* torpedoes */
  708:  'weapon',       /* EMP launcher — the disruption effect is not modelled */
  425:  'mine',
  533:  'junk',
  1102: 'pointdefense',
  743:  'shield',
  610:  'repair',
  243:  'engine',
  546:  'warp',
  834:  'afterburner'
};

/* The category bits that name a subtype on their own. Mirrors CAT in geom.js. */
var CAT_SUBTYPE = [
  [8,   'armor'],
  [16,  'shield'],
  [32,  'pointdefense'],
  [128, 'reactor'],
  [256, 'repair']
];

/* Weapon category bits -> what the projectile is. */
var CAT_DAMAGE = [[1, 'ballistic'], [2, 'missile'], [4, 'laser']];

function main() {
  var rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'modules_all.json'), 'utf8'));
  var keys = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'module_keys.json'), 'utf8'));

  var modules = {}, seen = {}, unknown = {}, byScript = {}, badScript = {};

  rows.forEach(function (row) {
    var out = {};
    Object.keys(row).forEach(function (k) {
      out[k] = row[k];
      /* a field the legend does not describe is reported, never silently kept
         in the dark — it means the extractor grew a column */
      if (!keys[k]) unknown[k] = (unknown[k] || 0) + 1;
    });
    if (!out.key) throw new Error('a row has no key');
    if (seen[out.key]) throw new Error('duplicate module key: ' + out.key);
    seen[out.key] = 1;

    var script = scriptOf(out.key);
    (byScript[script] = byScript[script] || []).push(out.key);

    var beh = BEHAVIOUR[script];
    if (!beh) { (badScript[script] = badScript[script] || []).push(out.key); beh = null; }

    out.subtype    = beh === 'byCategory' ? fromCategory(out.category) : beh;
    out.damageType = damageOf(out.category);
    /* A gun that can bear on anything is a turret. Mines and junk also fire
       over 180 degrees but are not guns, so subtype gates it. */
    out.turret     = out.subtype === 'weapon' && (out.fireCone || 0) >= 180;

    modules[out.key] = out;
  });

  var bad = Object.keys(badScript);
  if (bad.length) {
    bad.forEach(function (s) {
      console.error('UNKNOWN behaviour script ' + s + ': ' + badScript[s].join(', '));
    });
    throw new Error('add these scripts to BEHAVIOUR in tools/copy-modules.js — ' +
                    'refusing to write a roster with untyped modules');
  }

  var outFile = path.join(ROOT, 'data', 'modules.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  /* The art extension is recorded rather than assumed — the source has been
     both PNG and webp — so the browser does not have to guess. */
  var art = WANT_IMAGES ? copyImages(modules) : currentArt(path.join(ROOT, 'images', 'modules'));
  /* the legend travels with the data: `module_keys.json` says what every short
     field is and where it came from, which is the only documentation these
     two-letter names have. */
  fs.writeFileSync(outFile, JSON.stringify({ version: 1, art: art, keys: keys, modules: modules }));

  var n = Object.keys(modules).length;
  console.log('copied ' + n + ' modules -> data/modules.json (' +
              (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB)');

  var un = Object.keys(unknown);
  if (un.length) console.log('  fields the legend does not describe: ' + un.join(', '));

  report(modules, byScript);
  if (!WANT_IMAGES) console.log('  (images skipped — pass --images to copy them; art: ' + art + ')');
}

/* What is already on disk, for a data-only run. */
function currentArt(dir) {
  if (!fs.existsSync(dir)) return 'webp';
  var f = fs.readdirSync(dir).filter(function (x) { return /\.(webp|png)$/.test(x); })[0];
  return f ? path.extname(f).slice(1) : 'webp';
}

/* The behaviour script a module is attached to, from the raw extract. */
function scriptOf(key) {
  var f = path.join(DATA_DIR, 'modules_raw', key + '.json');
  if (!fs.existsSync(f)) throw new Error('no raw record for ' + key + ' — cannot type it');
  var raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  var id = raw.m_Script && raw.m_Script.m_PathID;
  if (!id) throw new Error('no behaviour script on ' + key);
  return id;
}

function fromCategory(c) {
  for (var i = 0; i < CAT_SUBTYPE.length; i++)
    if (c & CAT_SUBTYPE[i][0]) return CAT_SUBTYPE[i][1];
  return null;
}

function damageOf(c) {
  for (var i = 0; i < CAT_DAMAGE.length; i++)
    if (c & CAT_DAMAGE[i][0]) return CAT_DAMAGE[i][1];
  return null;
}

/* What the roster looks like, so a bad source file is obvious immediately. */
function report(modules, byScript) {
  var subs = {}, lvl = [];
  Object.keys(modules).forEach(function (k) {
    var m = modules[k];
    var s = m.subtype === 'weapon' ? 'weapon/' + m.damageType : m.subtype;
    (subs[s] = subs[s] || []).push(k);
    lvl.push(m.requiredLevel || 0);
  });
  lvl.sort(function (a, b) { return a - b; });
  console.log('  levels ' + lvl[0] + '-' + lvl[lvl.length - 1] + ', ' +
              Object.keys(modules).filter(function (k) { return modules[k].turret; }).length + ' turrets');
  Object.keys(subs).sort().forEach(function (s) {
    console.log('    ' + pad(s, 16) + subs[s].length);
  });
  var vis = {};
  Object.keys(modules).forEach(function (k) {
    var v = modules[k].visible;
    vis[v] = (vis[v] || 0) + 1;
  });
  console.log('  visible: ' + Object.keys(vis).sort().map(function (v) {
    return v + '=' + vis[v];
  }).join('  ') + '   (0 is the base tech tree)');
  console.log('  ' + Object.keys(byScript).length + ' behaviour scripts:');
  Object.keys(byScript).sort(function (a, b) { return byScript[b].length - byScript[a].length; })
    .forEach(function (s) {
      console.log('    ' + pad(s + ' -> ' + BEHAVIOUR[s], 26) + byScript[s].length +
                  '  ' + byScript[s].slice(0, 4).join(', ') +
                  (byScript[s].length > 4 ? ', …' : ''));
    });
}

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

/* One picture per module, named by key. No slug table: the key IS the
   filename, which is why `img` no longer exists as a field. */
function copyImages(modules) {
  var dst = path.join(ROOT, 'images', 'modules');
  fs.mkdirSync(dst, { recursive: true });

  var copied = 0, missing = [], bytes = 0, ext = null, mixed = [];
  Object.keys(modules).forEach(function (k) {
    var from = find(path.join(SRC, 'module_images'), k);
    if (!from) { missing.push(k); return; }
    var e = path.extname(from).slice(1);
    if (!ext) ext = e; else if (e !== ext) mixed.push(k + ' (' + e + ')');
    var to = path.join(dst, k + '.' + e);
    fs.copyFileSync(from, to);
    bytes += fs.statSync(to).size;
    copied++;
  });
  console.log('  copied ' + copied + ' images -> images/modules/ (' +
              (bytes / 1048576).toFixed(1) + ' MB of ' + ext + ')');
  if (missing.length) console.log('  NO IMAGE for: ' + missing.join(', '));
  /* One extension for the whole set, because the browser is told one. */
  if (mixed.length) throw new Error('images are not all ' + ext + ': ' + mixed.join(', '));
  stale(dst, modules, ext);
  return ext || 'webp';
}

/* The source has changed format before, so find the file rather than assume
   its extension. */
function find(dir, key) {
  var exts = ['webp', 'png'];
  for (var i = 0; i < exts.length; i++) {
    var p = path.join(dir, key + '.' + exts[i]);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* A format change leaves the old files behind, and a stale `<key>.png` next to
   a fresh `<key>.webp` is 100 files of dead weight nobody notices. */
function stale(dir, modules, ext) {
  var dead = fs.readdirSync(dir).filter(function (f) {
    return !(path.extname(f).slice(1) === ext && modules[path.basename(f, path.extname(f))]);
  });
  if (!dead.length) return;
  dead.forEach(function (f) { fs.unlinkSync(path.join(dir, f)); });
  console.log('  removed ' + dead.length + ' file(s) that are no longer the art for a module');
}

main();
