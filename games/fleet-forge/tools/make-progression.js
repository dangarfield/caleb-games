/* make-progression.js — generate the proposed unlock tree as a markdown table.
 *
 * Ships and modules are allocated from the real data (lr / rl order, base
 * modules only) so the names and counts in the design document cannot drift
 * from what the game actually contains. The OPS table below is hand-authored;
 * everything else is computed.
 *
 *   node tools/make-progression.js > ../../docs/game-fleet-forge-progression.md
 */
var D = require('../data/data.json');

/* LEVEL IS THE DATA'S OWN SCALE. A hull's `lr` and a module's `rl` are the same
   1-50 Required_Level axis, and every one of those fifty levels has at least one
   hull or module sitting on it — so level N simply hands over whatever the
   source data gates at N. Nothing is invented and nothing is allocated.

   TIERS ARE SPACE ARENA'S OWN SHIP CLASSES, at the levels the game opens them.
   Eight classes exist; Galactic Carrier opens at 54 and no hull in this data
   reaches it, so seven are populated and the eighth is left as a marker. */
var LEVELS = 50;
var TIERS = [
  { n: 1, name: 'Fighter',          lr: [1, 3],   from: 1,  to: 3  },
  { n: 2, name: 'Corvette',         lr: [4, 8],   from: 4,  to: 8  },
  { n: 3, name: 'Frigate',          lr: [9, 15],  from: 9,  to: 15 },
  { n: 4, name: 'Cruiser',          lr: [16, 25], from: 16, to: 25 },
  { n: 5, name: 'Battleship',       lr: [26, 36], from: 26, to: 36 },
  { n: 6, name: 'Carrier',          lr: [37, 46], from: 37, to: 46 },
  { n: 7, name: 'Supercarrier',     lr: [47, 53], from: 47, to: 50 }
];

var ships = Object.keys(D.ships).map(function (k) { return D.ships[k]; })
  .filter(function (s) { return s.g.indexOf(4) >= 0 || s.g.indexOf(5) >= 0; })
  .sort(function (a, b) {
    return (a.lr || 0) - (b.lr || 0) || (a.cst || 0) - (b.cst || 0) ||
           a.displayName.localeCompare(b.displayName);
  });
/* Visible 0 = the base tech tree. Visible 1 are Mk.II/III variants and
   Visible 2 are Black Market — both are deliberately NOT on the level ladder:
   the Black Market ones are all rl 0 and several are strictly better than the
   base weapon they shadow, so putting them here hands the best early guns away
   for free. They are a separate reward channel. */
var mods = Object.keys(D.modules).map(function (k) { return D.modules[k]; })
  .filter(function (m) { return m.Visible === 0; })
  .sort(function (a, b) {
    return (a.rl || 0) - (b.rl || 0) || (a.w * a.h) - (b.w * b.h) ||
           a.displayName.localeCompare(b.displayName);
  });

var STARTER_SHIP = ships[0];
var STARTERS = mods.filter(function (m) { return m.rl === 0; });

/* ---- hand-authored operations -------------------------------------------
   `at` is the level at which the operation becomes visible. Two appear per
   level, so from level 3 onward there are always several to choose between and
   you never see the whole list at once. `gate` marks the four that are the
   only way into the next tier. */
/* The operations live in tools/operations.json so the table, the document and
   the game's own data/progression.json all come from one place. `at` is the
   level the operation becomes visible; `gate` marks the four that are the only
   way into the next tier; `c` is the machine-readable condition. */
var OPS = require('./operations.json');


/* ---- allocate the unlocks ------------------------------------------------
   Each tier's hulls and modules, in lr/rl order, dealt across that tier's
   levels: roughly one hull and two modules per level. */
function allocate() {
  var rows = [], lvl, i;
  for (lvl = 1; lvl <= LEVELS; lvl++) {
    var tier = TIERS[0];
    for (i = 0; i < TIERS.length; i++) if (lvl >= TIERS[i].from && lvl <= TIERS[i].to) tier = TIERS[i];
    rows.push({
      level: lvl, tier: tier,
      ships: ships.filter(function (s) { return s.lr === lvl; }),
      mods:  mods.filter(function (m) { return m.rl === lvl; })
    });
  }
  /* the four rl-0 starters ride along with level 1 */
  rows[0].mods = STARTERS.concat(rows[0].mods);
  return rows;
}

var rows = allocate();



/* ---- emit ---------------------------------------------------------------- */
function opsAt(l) { return OPS.filter(function (o) { return o.at === l; }); }

var out = [];
out.push('# Fleet Forge — the unlock tree (proposal)');
out.push('');
out.push('**Operations** are challenges. Completing any one that is currently available');
out.push('gives you a level. **Unlocks** are what each level hands over. Two new operations');
out.push('appear per level and old ones stay available, so there is always a choice of three');
out.push('or four and you never see the whole list — the later ones are not even hinted at');
out.push('until you are close.');
out.push('');
out.push('Four operations are **tier gates** (marked ⇧). They are the only way into the next');
out.push('tier, and each one asks you to beat an opponent **from the tier above** while flying');
out.push('a hull **from the tier you are finishing** — a deliberate step up, and the reason you');
out.push('cannot grind a battleship through the early game.');
out.push('');
out.push('**No operation names an opponent.** Fights come from a generated pool for your tier,');
out.push('so an operation can ask about an opponent\'s *tier* but never its identity. Hulls are');
out.push('different — those are fixed data the player earns, so an operation can name one.');
out.push('');
out.push('**' + LEVELS + ' levels, ' + OPS.length + ' operations, ' +
         (ships.length + 1) + ' hulls and ' + (mods.length + STARTERS.length) + ' modules.**');
out.push('Mk.II/III variants and the nine Black Market modules are deliberately off this');
out.push('ladder — several Black Market guns are `rl 0` and strictly better than the base');
out.push('weapon they shadow, so they belong in a separate reward channel, not here.');
out.push('');
out.push('| Lv | Tier | Operations unlocked at this level | What the level gives you |');
out.push('|---:|:--|:--|:--|');
for (var i = 0; i < rows.length; i++) {
  var r = rows[i];
  var o = opsAt(r.level - 1).map(function (x) {
    return (x.gate ? '⇧ ' : '') + '**' + x.n + '** — ' + x.d;
  }).join('<br>') || '—';
  var u = [];
  r.ships.forEach(function (s) { u.push('**' + s.displayName + '**'); });
  r.mods.forEach(function (m) { u.push(m.displayName); });
  out.push('| ' + r.level + ' | ' + r.tier.n + ' ' + r.tier.name + ' | ' + o + ' | ' +
           (u.join(' · ') || '—') + ' |');
}
out.push('');

/* Every hull and every base module must appear exactly once IN THE RENDERED
   TABLE. An earlier verifier checked the allocation instead and passed happily
   while two items were dropped at render time — which is the only failure a
   reader would ever see. Check the output, not the intent. */
(function verify() {
  /* `ships` and `mods` are already the complete lists — allocate() no longer
     removes the starters from them, so concatenating STARTER_SHIP/STARTERS here
     would count four modules and one hull twice and report 41/63. */
  var doc = out.join('\n'), missing = [], i;
  var allShips = ships, allMods = mods;
  for (i = 0; i < allShips.length; i++)
    if (doc.indexOf('**' + allShips[i].displayName + '**') < 0)
      missing.push('ship ' + allShips[i].displayName);
  for (i = 0; i < allMods.length; i++)
    if (doc.indexOf(allMods[i].displayName) < 0)
      missing.push('module ' + allMods[i].displayName);
  if (missing.length) {
    console.error('TABLE INCOMPLETE — ' + missing.join(', '));
    process.exit(1);
  }
  console.error('verified: ' + allShips.length + ' hulls and ' + allMods.length +
                ' modules all present, ' + LEVELS + ' levels, ' + OPS.length + ' operations');
})();

/* An operation must never require something the player cannot have yet. */
(function checkOpDeps() {
  var need = { 'Grand Reactor': 0, 'Hammerhead': 0 }, k, bad = [];
  rows.forEach(function (r) {
    r.ships.forEach(function (s) { if (need[s.displayName] !== undefined) need[s.displayName] = r.level; });
    r.mods.forEach(function (m) { if (need[m.displayName] !== undefined) need[m.displayName] = r.level; });
  });
  OPS.forEach(function (o) {
    for (k in need) {
      if (o.d.indexOf(k) >= 0 && need[k] > o.at)
        bad.push(o.n + ' needs ' + k + ' (level ' + need[k] + ') but appears at level ' + o.at);
    }
  });
  if (bad.length) { console.error('OP DEPENDENCY BROKEN — ' + bad.join('; ')); process.exit(1); }
})();

/* The game reads data/progression.json; it and the document above come from the
   same tables, so they cannot drift apart. */
if (process.argv.indexOf('--json') >= 0) {
  var fs = require('fs'), path = require('path');
  var levels = [{ level: 1, tier: 1, ships: [STARTER_SHIP.key],
                  modules: STARTERS.map(function (m) { return m.key; }) }];
  var shipAt = {}, modAt = {};
  shipAt[STARTER_SHIP.key] = 1;
  STARTERS.forEach(function (m) { modAt[m.key] = 1; });
  rows.forEach(function (r) {
    levels.push({ level: r.level, tier: r.tier.n,
                  ships: r.ships.map(function (s) { shipAt[s.key] = r.level; return s.key; }),
                  modules: r.mods.map(function (m) { modAt[m.key] = r.level; return m.key; }) });
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'progression.json'),
    JSON.stringify({
      version: 1, maxLevel: LEVELS,
      tiers: TIERS.map(function (t) {
        return { n: t.n, name: t.name, lr: t.lr,
                 fromLevel: (t.n === 1 ? 1 : t.from), toLevel: t.to };
      }),
      levels: levels, shipLevel: shipAt, moduleLevel: modAt,
      operations: OPS.map(function (o) {
        return { id: o.id, name: o.n, desc: o.d, at: o.at, gate: o.gate || 0, cond: o.c };
      })
    }, null, 1));
  console.error('wrote data/progression.json');
}

console.log(out.join('\n'));
