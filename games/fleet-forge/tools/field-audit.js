/* field-audit.js — find every place the code still reads a module or ship by
 * its old two-letter name.
 *
 * The data files carry the extractor's own field names now. A reader that was
 * not updated does not throw, it just gets `undefined` — a quietly wrong number
 * rather than a crash, which is the worst kind of bug to ship. So every record
 * gets a booby-trapped getter for each retired name: reading it records the
 * source line that did so and returns undefined, exactly as it would have.
 *
 * `module_keys.json` supplies the list of retired names — the same file the
 * copy tool uses as the legend — so this cannot drift from the rename.
 *
 *   node tools/field-audit.js
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var L = require('./load');

var KEYS = L.read('research/extracted_module_data/module_keys.json');
var OLD_MODULE = [];
Object.keys(KEYS).forEach(function (k) {
  if (KEYS[k].old && KEYS[k].old !== k) OLD_MODULE.push(KEYS[k].old);
});
/* The ships' own retired names. Their source field list is short enough to say
   outright, and copy-ships.js carries the same list as KNOWN. */
var OLD_SHIP = ['w', 'h', 'g', 'ms', 'ts', 'lr'];

var seen = {};

function note(prop) {
  var st = new Error().stack.split('\n'), at = '?';
  for (var i = 2; i < st.length; i++) {
    if (st[i].indexOf('field-audit') >= 0 || st[i].indexOf('load.js') >= 0) continue;
    var m = st[i].match(/\(?((?:js|tools)[\/][^):]*):(\d+):/);
    if (m) { at = m[1] + ':' + m[2]; break; }
  }
  var key = at + '  .' + prop;
  seen[key] = (seen[key] || 0) + 1;
}

/* A getter costs nothing until it is read, unlike a Proxy, which taxes every
   property access on the object — and these records are read millions of times
   in a full sweep. */
function trap(obj, olds) {
  for (var i = 0; i < olds.length; i++) {
    if (olds[i] in obj) continue;            /* a name still in use is not retired */
    (function (p) {
      Object.defineProperty(obj, p, { get: function () { note(p); }, configurable: true });
    })(olds[i]);
  }
  return obj;
}

var D = L.data();
Object.keys(D.modules).forEach(function (k) { trap(D.modules[k], OLD_MODULE); });
Object.keys(D.ships).forEach(function (k)   { trap(D.ships[k], OLD_SHIP); });

var sb = { console: console, Math: Math, JSON: JSON, Date: Date };
sb.global = sb; vm.createContext(sb); sb.Data = D;
L.sandbox(['js/geom.js', 'js/autofit.js', 'js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js'], null, sb);

/* `Geom.applyBonus` hands back a PLAIN COPY when the hull has bonuses, and the
   sim reads that copy rather than the record, so the effective-stat path would
   otherwise be invisible. Re-trapping each copy is far too slow for the full
   sweep, so it is switched on for a small second pass instead. */
var realApply = sb.Geom.applyBonus;
function watchEffective(on) {
  sb.Geom.applyBonus = on
    ? function (mod, list) { return trap(realApply(mod, list), OLD_MODULE); }
    : realApply;
}
watchEffective(false);

var PROG = L.read('data/progression.json');
function allowAt(lv) { return function (m) { return (PROG.moduleLevel[m.key] || 99) <= lv; }; }

function sweep(hulls) {
  hulls.forEach(function (ship) {
    sb.Autofit.WEAPON_MODES.forEach(function (w) {
      sb.Autofit.ARMOUR_MODES.forEach(function (a) {
        sb.Autofit.PRIORITY_MODES.forEach(function (p) {
          [50, 75, 100].forEach(function (sk) {
            var fit = sb.Autofit.build(ship, {
              weapons: w, armour: a, priority: p, skill: sk, seed: 7,
              allow: allowAt(PROG.shipLevel[ship.key] || PROG.maxLevel)
            }, D.modules);
            sb.Geom.validate(ship, fit, D.modules);
            sb.Geom.summarise(ship, fit, D.modules);
          });
        });
      });
    });
  });
}

/* Pass one: every hull through every recipe — geom.js and autofit.js end to end. */
sweep(D.shipList);

/* Pass two: the same, plus the effective-stat path, over a couple of hulls. */
watchEffective(true);
var few = [D.shipList[0], D.shipList[D.shipList.length - 1]];
sweep(few);

/* Pass three: real battles, which is the sim. */
few.forEach(function (ship, i) {
  var other = few[(i + 1) % few.length];
  var f1 = sb.Autofit.build(ship, { weapons: 'mix', armour: 'mix', priority: 'mix',
                                    skill: 100, seed: 3, allow: allowAt(60) }, D.modules);
  var f2 = sb.Autofit.build(other, { weapons: 'laser', armour: 'shields', priority: 'weapons',
                                     skill: 50, seed: 4, allow: allowAt(60) }, D.modules);
  var w = sb.Sim.create({ playerFit: { shipId: ship.key, modules: f1 },
                          enemyFit:  { shipId: other.key, modules: f2 }, seed: 11 });
  for (var t = 0; t < 900 && !w.over; t++) sb.Sim.step(w, 1 / 60);
});

var rows = Object.keys(seen).sort();
if (!rows.length) { console.log('clean — nothing reads a retired field name'); process.exit(0); }
console.log(rows.length + ' read site(s) still on a retired field name:\n');
rows.forEach(function (r) { console.log('  ' + r + '   x' + seen[r]); });
process.exit(1);
