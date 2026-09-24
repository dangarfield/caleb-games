/* skill-curve.js — does the hidden skill dial actually do anything?
 *
 * `Autofit`'s `skill` runs 50 to 100 and blends the cell scores with noise,
 * shuffles the module pools, and decides whether the nose gets capped. All of
 * that is a claim about the RESULT: that a skill 60 fit loses to a skill 100
 * one more often than a skill 90 fit does. A linear blend does not have to
 * produce a linear win rate, and if the middle of the dial turns out to be
 * flat then the dial has two settings and a lot of arithmetic.
 *
 * So: build the same hull at each skill and fight it against itself at 100.
 *
 *   node tools/skill-curve.js            # four hulls across the tiers
 *   node tools/skill-curve.js --all      # every hull (slow)
 *
 * Not a test — an instrument. It prints; you read it.
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var L = require('./load');
var DATA = L.data();
var PROG = L.read('data/progression.json');

var fitSb = L.sandbox(['js/geom.js', 'js/autofit.js']);
var Autofit = fitSb.Autofit, Geom = fitSb.Geom;

var simSb = { console: console, Math: Math, JSON: JSON, Date: Date };
simSb.global = simSb; vm.createContext(simSb);
simSb.Data = DATA;
['js/geom.js', 'js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), simSb, { filename: f });
});
var Sim = simSb.Sim;

var SKILLS = [50, 60, 70, 80, 90, 100];
var SEEDS  = 20;
var SAMPLE = ['Light Fighter', 'Hammerhead', 'Javelin', 'Arbiter'];

function fitAt(ship, skill, seed) {
  var lvl = PROG.shipLevel[ship.key] || PROG.maxLevel;
  var mods = Autofit.build(ship, {
    weapons: 'mix', armour: 'mix', priority: 'mix',
    skill: skill, seed: seed,
    allow: function (m) { return (PROG.moduleLevel[m.key] || 99) <= lvl; }
  }, DATA.modules);
  return { shipId: ship.key, modules: mods, ok: Geom.validate(ship, mods, DATA.modules).ok };
}

function fight(a, b, seed) {
  var w = Sim.create({ playerFit: a, enemyFit: b, seed: seed });
  var guard = 0;
  while (!w.over && guard++ < 60000) w.step(1 / 60);
  return w.winner;
}

/* `a` at `skill` against `a` at 100, both sides of the arena so position
   cannot be the reason either of them won. */
function rate(ship, skill) {
  var wins = 0, n = 0;
  for (var i = 0; i < SEEDS; i++) {
    var lo = fitAt(ship, skill, 100 + i);
    var hi = fitAt(ship, 100, 200 + i);
    if (!lo.ok || !hi.ok) continue;
    if (fight(lo, hi, 7000 + i) === 'player') wins++;
    n++;
    if (fight(hi, lo, 8000 + i) === 'enemy') wins++;
    n++;
  }
  return n ? wins / n : 0;
}

var all = process.argv.indexOf('--all') >= 0;
var ships = DATA.shipList.filter(function (s) {
  return all || SAMPLE.indexOf(s.displayName) >= 0;
});

console.log('\nwin rate against the same hull fitted at skill 100');
console.log('(50% means the dial did nothing; lower is a worse fit)\n');
console.log('  ' + 'hull'.padEnd(16) + SKILLS.map(function (k) {
  return String(k).padStart(6);
}).join(''));

var totals = SKILLS.map(function () { return 0; });
ships.forEach(function (ship) {
  var row = SKILLS.map(function (k, i) {
    var r = rate(ship, k);
    totals[i] += r;
    return (Math.round(r * 100) + '%').padStart(6);
  });
  console.log('  ' + ship.displayName.padEnd(16) + row.join(''));
});
console.log('  ' + 'MEAN'.padEnd(16) + totals.map(function (t) {
  return (Math.round(t / ships.length * 100) + '%').padStart(6);
}).join('') + '\n');
