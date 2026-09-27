/* boot-check.js — run js/data.js exactly as the browser runs it.
 *
 * Every other headless tool goes through tools/load.js, which reads the data
 * files directly — so nothing exercised `js/data.js` itself, the one file that
 * decides which files are fetched, how the art path is built and which family
 * of the fitting bay a module lands in. A typo there is invisible until the
 * game is opened.
 *
 * So: the real file, in a bare context, with `fetch` and `Image` shimmed and
 * nothing else. Then check the things a player would notice first — a module
 * that appears in no family and so cannot be fitted, or art that 404s.
 *
 *   node tools/boot-check.js
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');

var sb = { console: console, Math: Math, JSON: JSON, Date: Date, Promise: Promise,
           Object: Object, Array: Array, String: String, Number: Number,
           /* the loader retries and watchdogs failed art, so it needs timers */
           setTimeout: setTimeout, clearTimeout: clearTimeout };
sb.global = sb; vm.createContext(sb);

var fetched = [];
sb.fetch = function (u) {
  var p = path.join(ROOT, u.replace(/^\.\//, ''));
  fetched.push(u);
  var ok = fs.existsSync(p);
  return Promise.resolve({
    ok: ok, status: ok ? 200 : 404,
    json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8'))); }
  });
};

/* Every `src` the page would set, so each one can be checked against disk.
   THE STUB HAS TO ANSWER. `data.js` holds at most four requests in flight and
   waits for `onload` before starting the next, so a stub that never calls back
   would let exactly four images through and the check would pass on a fifth of
   the art. It reports success on the next tick, like a browser would. */
var asked = [];
sb.Image = function () {
  var o = { complete: false, naturalWidth: 1 };
  Object.defineProperty(o, 'src', {
    set: function (v) {
      asked.push(v);
      setTimeout(function () { o.complete = true; if (o.onload) o.onload(); }, 0);
    }
  });
  return o;
};

['js/geom.js', 'js/data.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
});

var fail = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!ok) fail++;
}

sb.Data.load(function (D) {
  var keys = Object.keys(D.modules);
  console.log('fetched: ' + fetched.join(', ') + '\n');

  check('the roster loaded', keys.length > 0 && Object.keys(D.ships).length > 0,
        keys.length + ' modules, ' + Object.keys(D.ships).length + ' ships');
  check('every hull has a legal fit', D.shipList.length === Object.keys(D.ships).length,
        D.shipList.length + ' flyable');
  check('no hull bonus the sim cannot act on', sb.Data.bonusGaps().length === 0,
        sb.Data.bonusGaps().join(', ') || 'none');

  /* Art. The path is built from the key and the extension the copy tool
     recorded, so a format change that missed one file shows up here. */
  keys.forEach(function (k) { sb.Data.moduleImg(D.modules[k]); });
  Object.keys(D.ships).forEach(function (k) { sb.Data.shipImg(D.ships[k]); });

  /* The queue drains a few at a time, so give it the event loop before asking
     what it asked for. */
  setTimeout(function () { rest(D, keys); }, 50);
});

function rest(D, keys) {
  var missing = asked.filter(function (s) { return !fs.existsSync(path.join(ROOT, s.split('?')[0])); });
  check('every picture the page asks for exists', missing.length === 0,
        asked.length + ' requested' + (missing.length ? ', missing ' + missing.slice(0, 4).join(', ') : ''));

  /* The fitting bay is a drill-down: group -> family -> modules. A module in no
     family cannot be fitted at all, and one in two appears twice. */
  var seen = {}, dup = [], orphan = [];
  sb.Data.GROUPS.forEach(function (g) {
    g.families.forEach(function (f) {
      keys.forEach(function (k) {
        if (!f.match(D.modules[k])) return;
        if (seen[k]) dup.push(k);
        seen[k] = g.id + '/' + f.id;
      });
    });
  });
  keys.forEach(function (k) {
    if (!seen[k]) orphan.push(k + ' (' + D.modules[k].subtype + ')');
  });
  check('every module is in a family', orphan.length === 0, orphan.slice(0, 6).join(', ') || keys.length + ' placed');
  check('no module is in two families', dup.length === 0, dup.join(', ') || 'none');

  console.log('\n' + (fail ? fail + ' failed' : 'all good'));
  process.exit(fail ? 1 : 0);
}
