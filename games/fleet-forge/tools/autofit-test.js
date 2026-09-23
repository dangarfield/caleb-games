/* autofit-test.js — every hull, every recipe, must come out flyable.
 *   node tools/autofit-test.js            # summary
 *   node tools/autofit-test.js --verbose  # a line per fit
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8'));

var sb = { console: console, Math: Math, JSON: JSON };
sb.global = sb; vm.createContext(sb);
sb.Data = { modules: DATA.modules, ships: DATA.ships,
            module: function (k) { return DATA.modules[k]; },
            ship: function (k) { return DATA.ships[k]; } };
['js/geom.js', 'js/autofit.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
});
var Geom = sb.Geom, Autofit = sb.Autofit;

var verbose = process.argv.indexOf('--verbose') >= 0;
var fails = 0, runs = 0, worst = [];

/* the level gate the player actually plays under: a fit built at level N may
   only use what level N has unlocked */
var PROG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/progression.json'), 'utf8'));
function allowAt(level) {
  return function (m) { return (PROG.moduleLevel[m.key] || 99) <= level; };
}

Object.keys(DATA.ships).forEach(function (key) {
  var ship = DATA.ships[key];
  if ((ship.lr || 0) > 50) return;                 /* the Drone is not flyable */
  var level = ship.lr || 1;
  Autofit.WEAPON_MODES.forEach(function (w) {
    Autofit.ARMOUR_MODES.forEach(function (a) {
      Autofit.PRIORITY_MODES.forEach(function (p) {
        Autofit.PLACEMENT_MODES.forEach(function (pl) {
          runs++;
          var fit = Autofit.build(ship, { weapons: w, armour: a, priority: p,
                                          placement: pl, seed: 7, allow: allowAt(level) },
                                  DATA.modules);
          var v = Geom.validate(ship, fit, DATA.modules);
          var s = v.stats;
          if (!v.ok) {
            fails++;
            console.log('FAIL ' + key + ' lv' + level + ' [' + w + '/' + a + '/' + p + '/' + pl + '] ' +
                        v.errors.join('; '));
          } else if (verbose) {
            console.log('ok   ' + key.padEnd(15) + (w + '/' + a + '/' + p + '/' + pl).padEnd(34) +
                        (s.cellsUsed + '/' + s.capacity).padStart(8) + ' cells  pwr ' +
                        String(s.power).padStart(5) + '  wpn ' + String(s.weapons).padStart(2) +
                        '  dps ' + String(Math.round(s.dps)).padStart(5));
          }
          var used = s.cellsUsed / s.capacity;
          if (used < 0.9) worst.push({ key: key, mode: w + '/' + a + '/' + p + '/' + pl, used: used });
        });
      });
    });
  });
});

worst.sort(function (x, y) { return x.used - y.used; });
if (worst.length) {
  console.log('\nfits leaving cells empty (worst 10):');
  worst.slice(0, 10).forEach(function (x) {
    console.log('  ' + x.key.padEnd(15) + x.mode.padEnd(34) + Math.round(x.used * 100) + '% packed');
  });
}

/* Clever placement has to actually differ from random, or the mode is a lie:
   plate should sit further forward and reactors further aft. */
function centroid(ship, fit, pred) {
  var g = Geom.shipGrid(ship), n = 0, sum = 0;
  fit.forEach(function (p) {
    var m = DATA.modules[p.moduleId];
    if (!pred(m)) return;
    n++; sum += 1 - (p.row + (m.h - 1) / 2) / Math.max(1, g.h - 1);
  });
  return n ? sum / n : null;
}
console.log('\nclever vs random — how far forward each class sits (1 = nose)');
['Hammerhead', 'Warrior', 'Arbiter'].forEach(function (key) {
  var ship = DATA.ships[key];
  var o = { weapons: 'mix', armour: 'mix', priority: 'mix', seed: 3, allow: allowAt(50) };
  var cl = Autofit.build(ship, Object.assign({ placement: 'clever' }, o), DATA.modules);
  var rn = Autofit.build(ship, Object.assign({ placement: 'random' }, o), DATA.modules);
  function row(label, pred) {
    var a = centroid(ship, cl, pred), b = centroid(ship, rn, pred);
    console.log('  ' + key.padEnd(12) + label.padEnd(10) +
                'clever ' + (a === null ? ' --- ' : a.toFixed(2)) +
                '   random ' + (b === null ? ' --- ' : b.toFixed(2)));
  }
  row('armour', function (m) { return m.subtype === 'armor'; });
  row('weapons', function (m) { return m.subtype === 'weapon'; });
  row('reactors', function (m) { return m.subtype === 'reactor'; });
});

console.log('\n' + (runs - fails) + ' of ' + runs + ' fits flyable' +
            (fails ? '   ' + fails + ' FAILED' : ''));

/* ---- and does any of it actually help? -------------------------------
   The layering is a theory until the sim is asked. Same hull, same recipe,
   same seed — only the placement mode differs. If clever does not out-fight
   random, the scores are decoration. */
if (process.argv.indexOf('--fight') >= 0) {
  ['js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  var Sim = sb.Sim;
  function run(a, b, seed) {
    var w = Sim.create({ playerFit: a, enemyFit: b, seed: seed });
    var guard = 0;
    while (!w.over && guard++ < 60000) w.step(1 / 60);
    return w.winner;
  }
  console.log('\nclever vs random, same hull and recipe, 6 seeds each');
  var cw = 0, rw = 0, dr = 0;
  ['Lightning', 'Raven', 'Hammerhead', 'Broadsword', 'Warrior', 'Duke', 'Arbiter']
    .forEach(function (key) {
      var ship = DATA.ships[key], lv = ship.lr || 1, win = 0;
      var o = { weapons: 'mix', armour: 'mix', priority: 'mix', seed: 11, allow: allowAt(lv) };
      var cl = { shipId: key, modules: Autofit.build(ship, Object.assign({ placement: 'clever' }, o), DATA.modules) };
      var rn = { shipId: key, modules: Autofit.build(ship, Object.assign({ placement: 'random' }, o), DATA.modules) };
      for (var s2 = 1; s2 <= 6; s2++) {
        var r2 = run(cl, rn, s2 * 613);
        if (r2 === 'player') { win++; cw++; } else if (r2 === 'enemy') rw++; else dr++;
      }
      console.log('  ' + key.padEnd(13) + 'clever won ' + win + '/6');
    });
  console.log('  overall: clever ' + cw + ' · random ' + rw + ' · draw ' + dr);
}

process.exit(fails ? 1 : 0);
