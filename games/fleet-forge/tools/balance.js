/* balance.js — fight the generated pool against itself, so the tiers are
 * checked before anyone plays them.
 *
 * WHAT THIS CHECKS NOW
 * The roster used to be a ladder and this file checked that rung N+1 beat rung
 * N. It is a pool now: a fight is drawn at random from your tier, so the claim
 * to verify is not "Needle beats Hornet" but "a tier 5 ship beats a tier 4 one,
 * and inside a tier the five archetypes are close enough that a draw from the
 * pool is not a coin toss between trivial and impossible".
 *
 * Not a test — a tuning instrument. It prints; you read it.
 *
 *   node tools/balance.js          # per-tier spread + the tier ascent check
 *   node tools/balance.js --rr     # plus a full round robin (slow)
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8'));
var OPP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/opponents.json'), 'utf8')).opponents;

var sb = { console: console, Math: Math, JSON: JSON, Date: Date };
sb.global = sb; vm.createContext(sb);
sb.Data = { module: function (k) { return DATA.modules[k]; },
            ship: function (k) { return DATA.ships[k]; },
            modules: DATA.modules, ships: DATA.ships };
['js/geom.js', 'js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
});
var Sim = sb.Sim;

function fit(o) { return { shipId: o.ship.shipId, modules: o.ship.modules }; }

function run(a, b, seed) {
  var w = Sim.create({ playerFit: a, enemyFit: b, seed: seed });
  var guard = 0;
  while (!w.over && guard++ < 60000) w.step(1 / 60);
  return w;
}

/* a vs b over `n` seeds; returns how many a won */
function duel(a, b, n, salt) {
  var wins = 0, times = [], to = 0;
  for (var s = 1; s <= n; s++) {
    var w = run(fit(a), fit(b), s * (salt || 613));
    if (w.winner === 'player') wins++;
    if (w.reason === 'timeout') to++;
    times.push(w.time);
  }
  times.sort(function (x, y) { return x - y; });
  return { wins: wins, median: times[(n / 2) | 0], to: to };
}

var tiers = [];
OPP.forEach(function (o) { if (tiers.indexOf(o.tier) < 0) tiers.push(o.tier); });
tiers.sort(function (a, b) { return a - b; });

/* ---- 1. inside each tier ------------------------------------------------
   Every opponent against every other in its own tier. A pool works when these
   land somewhere near the middle; a 0 or a perfect score means one archetype
   on that tier's hulls is not really in the same fight as the rest. */
console.log('inside each tier — every opponent vs its tier peers, 3 seeds each way\n');
tiers.forEach(function (t) {
  var pool = OPP.filter(function (o) { return o.tier === t; });
  var score = {}, played = {};
  pool.forEach(function (o) { score[o.id] = 0; played[o.id] = 0; });
  for (var a = 0; a < pool.length; a++) {
    for (var b = 0; b < pool.length; b++) {
      if (a === b) continue;
      var d = duel(pool[a], pool[b], 3, 613);
      score[pool[a].id] += d.wins;
      played[pool[a].id] += 3;
    }
  }
  console.log('  TIER ' + t);
  pool.forEach(function (o) {
    var pct = played[o.id] ? Math.round(100 * score[o.id] / played[o.id]) : 0;
    console.log('    ' + o.name.padEnd(16) + o.ship.shipId.padEnd(16) +
                String(score[o.id] + '/' + played[o.id]).padStart(7) +
                String(pct + '%').padStart(6) +
                (pct <= 10 || pct >= 90 ? '   << outlier' : ''));
  });
  console.log('');
});

/* ---- 2. does a tier actually beat the one below it? ---------------------
   The whole progression rests on this: a tier gate asks you to beat an
   opponent from the tier above, and levelling hands you a bigger hull. If a
   tier does not out-fight the one under it, the gate is noise. */
console.log('tier ascent — each tier fought against the tier below, 2 seeds per pair');
for (var i = 1; i < tiers.length; i++) {
  var lo = OPP.filter(function (o) { return o.tier === tiers[i - 1]; });
  var hi = OPP.filter(function (o) { return o.tier === tiers[i]; });
  var hiWins = 0, total = 0;
  for (var x = 0; x < hi.length; x++) {
    for (var y = 0; y < lo.length; y++) {
      var d = duel(hi[x], lo[y], 2, 131);
      hiWins += d.wins; total += 2;
    }
  }
  var pct = Math.round(100 * hiWins / total);
  console.log('  T' + tiers[i] + ' over T' + tiers[i - 1] + '   ' +
              String(hiWins + '/' + total).padStart(8) + String(pct + '%').padStart(6) +
              (pct >= 70 ? '' : '   << the tiers are not separated here'));
}

/* ---- 3. the whole pool, if asked ---------------------------------------- */
if (process.argv.indexOf('--rr') >= 0) {
  console.log('\nround robin — every opponent against every other, 2 seeds each way');
  var all = {};
  OPP.forEach(function (o) { all[o.id] = 0; });
  for (var a2 = 0; a2 < OPP.length; a2++) {
    for (var b2 = 0; b2 < OPP.length; b2++) {
      if (a2 === b2) continue;
      var d2 = duel(OPP[a2], OPP[b2], 2, 977);
      all[OPP[a2].id] += d2.wins;
    }
  }
  var rank = OPP.slice().sort(function (p, q) { return all[p.id] - all[q.id]; });
  console.log('\nweakest to strongest:');
  rank.forEach(function (o, k) {
    console.log('  ' + String(k + 1).padStart(2) + '. T' + o.tier + ' ' +
                o.name.padEnd(16) + String(all[o.id]).padStart(4) + ' wins');
  });
  /* The pool is healthy when the ranking rises with tier. Count inversions. */
  var inv = 0;
  for (var m = 0; m < rank.length; m++)
    for (var n = m + 1; n < rank.length; n++)
      if (rank[m].tier > rank[n].tier) inv++;
  console.log('\n' + inv + ' tier inversions out of ' +
              (rank.length * (rank.length - 1) / 2) + ' pairs');
}
