/* effects.js — the hand-made effect art, and the sheet bookkeeping for it.
 *
 * WHY THIS FILE EXISTS
 * The old Phaser build shipped a folder of effect sprites and a config that
 * mapped every weapon key to one of them. The rebuild drew all of it with
 * procedural shapes and never touched the art. This is the bridge: it owns
 * `data/effects.json`, the image cache, and the frame geometry of each
 * spritesheet. `screens/battle.js` asks for a sheet once in `enter` and then
 * only ever indexes the arrays it gets back.
 *
 * WHY THE FRAME RECTS ARE PRECOMPUTED
 * The old build called `anims.create(...)` for every explosion — a fresh
 * animation object, generated frame list and all, per bang. A sheet here is
 * described once: two Float32Arrays of source-x and source-y, one entry per
 * frame, built the first time anyone asks and cached forever. Playing an
 * explosion is then an integer index into those arrays.
 *
 * WHY IT LOADS ITSELF
 * One fetch, at boot, the moment this script runs — the same place `data.js`
 * gets its data. Nothing waits on it: every consumer checks `Effects.ready`
 * and falls back to the procedural drawing it already had, so a slow or
 * missing effects.json costs a nicer-looking battle and nothing else.
 *
 * WHY THE BACKGROUNDS ARE NOT PRELOADED
 * `images/effects/bg-*.png` is nine 512x512 PNGs totalling 2.6 MB. A battle
 * uses exactly one of them. `Effects.background(path)` fetches that one, on
 * demand, and the caller draws it only once it has arrived.
 */
var Effects = (function () {
  'use strict';

  var cfg = null, ready = false;
  var imgs = {};                 /* path -> Image (or null where there is no DOM) */
  var sheets = {};               /* name -> built sheet record                    */
  var primed = false;

  /* An <img> per path, at most once. A load failure parks `null` in the cache
     so the caller draws its procedural fallback instead of retrying forever. */
  function image(path) {
    if (imgs.hasOwnProperty(path)) return imgs[path];
    if (typeof Image === 'undefined') { imgs[path] = null; return null; }
    var im = new Image();
    im.onerror = function () { imgs[path] = null; };
    im.src = path;
    imgs[path] = im;
    return im;
  }

  /* The frame geometry of one spritesheet, built once. `fps` 0 means the sheet
     is a bag of variants rather than an animation — the junk sheet's sixteen
     debris chunks — and `dur` is 0 for it. */
  function sheet(name) {
    if (sheets.hasOwnProperty(name)) return sheets[name];
    var d = cfg && cfg.sheets ? cfg.sheets[name] : null;
    if (!d) { sheets[name] = null; return null; }

    var n = d.frames | 0, cols = (d.cols | 0) || n;
    if (n < 1) { sheets[name] = null; return null; }
    var fx = new Float32Array(n), fy = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      fx[i] = (i % cols) * d.fw;
      fy[i] = ((i / cols) | 0) * d.fh;
    }
    var s = {
      name: name, img: image(d.sprite), path: d.sprite,
      fw: d.fw, fh: d.fh, frames: n, cols: cols,
      fps: d.fps || 0, alpha: (d.alpha === undefined ? 1 : d.alpha),
      scale: d.scale || 0,
      dur: d.fps > 0 ? n / d.fps : 0,
      fx: fx, fy: fy
    };
    sheets[name] = s;
    return s;
  }

  /* The sprite record for one weapon, by module key. Families are the three the
     config carries art for — 'ballistic', 'missile', 'mine'. Lasers are a
     stroke, not a sprite, and the palette owns their colour. */
  function projectile(family, key) {
    if (!cfg || !cfg.projectiles) return null;
    var fam = cfg.projectiles[family];
    if (!fam) return null;
    var d = (key && fam[key]) || fam['default'];
    if (!d || !d.sprite) return null;
    var im = image(d.sprite);
    if (!im) return null;
    return { img: im, scale: d.scale || 0.015, rot: d.rotationOffset || 0 };
  }

  /* Warm the small art — every projectile sprite and every sheet. Roughly
     460 KB, of which smoke.png is 327 KB. Called when a battle screen opens,
     not at boot: a player who never fights never pays for it. */
  function prime() {
    if (primed || !cfg) return;
    primed = true;
    var fams = cfg.projectiles, f, k;
    for (f in fams) {
      if (!fams.hasOwnProperty(f)) continue;
      for (k in fams[f]) {
        if (!fams[f].hasOwnProperty(k)) continue;
        if (fams[f][k].sprite) image(fams[f][k].sprite);
      }
    }
    for (k in cfg.sheets) if (cfg.sheets.hasOwnProperty(k)) sheet(k);
  }

  /* One backdrop, on demand. Same cache, so a rematch against the same
     opponent re-uses the image it already has. */
  function background(path) { return path ? image(path) : null; }

  function load(cb) {
    fetch('./data/effects.json')
      .then(function (r) { if (!r.ok) throw new Error('effects.json ' + r.status); return r.json(); })
      .then(function (j) { cfg = j; ready = true; if (cb) cb(j); })
      .catch(function () { cfg = null; ready = false; if (cb) cb(null); });
  }

  if (typeof fetch === 'function') load(null);

  return {
    load: load, prime: prime,
    image: image, sheet: sheet, projectile: projectile, background: background,
    get cfg()   { return cfg; },
    get ready() { return ready; }
  };
})();
