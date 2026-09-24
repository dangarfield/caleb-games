/* autofit-test.js — every hull, every recipe, must come out flyable.
 *   node tools/autofit-test.js            # summary
 *   node tools/autofit-test.js --verbose  # a line per fit
 */
var L = require('./load');

/* The skill dial, swept: every hull and every recipe must come out flyable at
   every one of these, not only at the two ends. */
var SKILLS = [50, 75, 100];
var sb = L.sandbox(['js/geom.js', 'js/autofit.js']);
var Geom = sb.Geom, Autofit = sb.Autofit, DATA = sb.Data;

var verbose = process.argv.indexOf('--verbose') >= 0;
var fails = 0, runs = 0, worst = [];

/* the level gate the player actually plays under: a fit built at level N may
   only use what level N has unlocked */
var PROG = L.read('data/progression.json');
function allowAt(level) {
  return function (m) { return (PROG.moduleLevel[m.key] || 99) <= level; };
}

/* Every hull the game would let you fly, which is what `shipList` means — no
   level threshold standing in for a ship, and no names. A hull that cannot be
   fitted is a FAILURE to report, not a row to skip. */
DATA.shipList.forEach(function (ship) {
  var key = ship.key;
  /* the LADDER level the hull arrives at, which is the scale `moduleLevel`
     answers in — its source level is a different axis entirely */
  var level = PROG.shipLevel[ship.key] || PROG.maxLevel;
  Autofit.WEAPON_MODES.forEach(function (w) {
    Autofit.ARMOUR_MODES.forEach(function (a) {
      Autofit.PRIORITY_MODES.forEach(function (p) {
        SKILLS.forEach(function (sk) {
          runs++;
          var fit = Autofit.build(ship, { weapons: w, armour: a, priority: p,
                                          skill: sk, seed: 7, allow: allowAt(level) },
                                  DATA.modules);
          var v = Geom.validate(ship, fit, DATA.modules);
          var s = v.stats;
          if (!v.ok) {
            fails++;
            console.log('FAIL ' + key + ' lv' + level + ' [' + w + '/' + a + '/' + p + '/sk' + sk + '] ' +
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
/* A spread of hulls across the roster, smallest to largest, without naming
   any. Sampling beats a fixed list: the roster is curated in the data, and a
   named hull that has since been cleared out turns a check into a crash. */
function sample(n) {
  var all = DATA.shipList.slice().sort(function (a, b) {
    return Geom.shipGrid(a).capacity - Geom.shipGrid(b).capacity;
  });
  if (all.length <= n) return all;
  var out = [];
  for (var i = 0; i < n; i++) out.push(all[Math.round(i * (all.length - 1) / (n - 1))]);
  return out;
}

function centroid(ship, fit, pred) {
  var g = Geom.shipGrid(ship), n = 0, sum = 0;
  fit.forEach(function (p) {
    var m = DATA.modules[p.moduleId];
    if (!pred(m)) return;
    n++; sum += 1 - (p.row + (m.height - 1) / 2) / Math.max(1, g.h - 1);
  });
  return n ? sum / n : null;
}
console.log('\nclever vs random — how far forward each class sits (1 = nose)');
sample(3).forEach(function (ship) {
  var key = ship.key;
  var o = { weapons: 'mix', armour: 'mix', priority: 'mix', seed: 3, allow: allowAt(50) };
  var cl = Autofit.build(ship, Object.assign({ skill: 100 }, o), DATA.modules);
  var rn = Autofit.build(ship, Object.assign({ skill: 50 }, o), DATA.modules);
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
  L.sandbox(['js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js'], null, sb);
  var Sim = sb.Sim;
  function run(a, b, seed) {
    var w = Sim.create({ playerFit: a, enemyFit: b, seed: seed });
    var guard = 0;
    while (!w.over && guard++ < 60000) w.step(1 / 60);
    return w.winner;
  }
  console.log('\nclever vs random, same hull and recipe, 6 seeds each');
  var cw = 0, rw = 0, dr = 0;
  sample(7).forEach(function (ship) {
      var key = ship.key, lv = PROG.shipLevel[ship.key] || PROG.maxLevel, win = 0;
      var o = { weapons: 'mix', armour: 'mix', priority: 'mix', seed: 11, allow: allowAt(lv) };
      var cl = { shipId: key, modules: Autofit.build(ship, Object.assign({ skill: 100 }, o), DATA.modules) };
      var rn = { shipId: key, modules: Autofit.build(ship, Object.assign({ skill: 50 }, o), DATA.modules) };
      for (var s2 = 1; s2 <= 6; s2++) {
        var r2 = run(cl, rn, s2 * 613);
        if (r2 === 'player') { win++; cw++; } else if (r2 === 'enemy') rw++; else dr++;
      }
      console.log('  ' + key.padEnd(13) + 'clever won ' + win + '/6');
    });
  console.log('  overall: clever ' + cw + ' · random ' + rw + ' · draw ' + dr);
}

process.exit(fails ? 1 : 0);
