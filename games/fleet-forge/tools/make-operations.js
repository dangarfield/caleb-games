#!/usr/bin/env node
/* make-operations.js — lay down one operation per level, from the ladder.
 *
 *   node tools/make-progression.js --json   # build the ladder first
 *   node tools/make-operations.js           # then the operations for it
 *   node tools/make-progression.js --json   # fold them back in
 *
 * THE LADDER DECIDES THE TASK, not a list written here. Every level hands
 * something over, so every level's operation is about the thing it handed over:
 *
 *   a level that unlocks a HULL   -> fly it and win, three / five / seven times
 *                                    depending on the tier it belongs to
 *   a level that unlocks a MODULE -> win once with that module fitted
 *
 * An operation at level N is what carries the player from N to N+1, so it is
 * always about something they already have. Nothing asks for a hull they have
 * not earned or a module they cannot fit, and nothing is a trick shot — no
 * "win with nine tenths of your hull intact". The ask is simply: use the new
 * thing, and win with it.
 *
 * WINS PER HULL, BY TIER. Early hulls come thick and fast, so three wins each
 * keeps the pace up; the later ones are rarer and bigger, so they are worth
 * more of the player's time.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var L = require('./load');

var PROG = L.read('data/progression.json');
var D = L.data();

/* Wins asked for a hull, by the tier it belongs to. Read as bands rather than
   a number per tier, so a roster that grows a tier does not need a new entry. */
var WINS_BY_TIER = [
  { upTo: 3, wins: 3 },
  { upTo: 6, wins: 5 },
  { upTo: Infinity, wins: 7 }
];
function winsFor(tier) {
  for (var i = 0; i < WINS_BY_TIER.length; i++)
    if (tier <= WINS_BY_TIER[i].upTo) return WINS_BY_TIER[i].wins;
  return WINS_BY_TIER[WINS_BY_TIER.length - 1].wins;
}

/* Which module a level's operation is about, when the level hands over more
   than one. A weapon is the thing a player wants to try first; failing that,
   the biggest piece, because that is the one that changes a fit most. */
function pickModule(keys) {
  var list = keys.map(function (k) { return D.modules[k]; });
  var guns = list.filter(function (m) { return m.subtype === 'weapon'; });
  var pool = guns.length ? guns : list;
  return pool.sort(function (a, b) {
    return (b.width * b.height) - (a.width * a.height) ||
           a.displayName.localeCompare(b.displayName);
  })[0];
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

var ops = [], byLevel = {};
PROG.levels.forEach(function (l) { byLevel[l.level] = l; });

for (var lv = 1; lv < PROG.maxLevel; lv++) {
  var row = byLevel[lv];
  if (!row || (!row.ships.length && !row.modules.length))
    throw new Error('level ' + lv + ' hands over nothing — no operation to build');

  if (row.ships.length) {
    /* The hull this level handed over. If a level ever hands over two, the
       first is the one the operation is about; the other still unlocks. */
    var ship = D.ships[row.ships[0]];
    var tier = (ship.tier || 0) + 1;
    var n = winsFor(tier);
    ops.push({
      at: lv,
      id: 'fly_' + slug(ship.key),
      n: ship.displayName,
      d: 'Win ' + n + ' battles flying the ' + ship.displayName,
      c: { t: 'hullWins', ship: ship.key, n: n }
    });
  } else {
    var mod = pickModule(row.modules);
    ops.push({
      at: lv,
      id: 'use_' + slug(mod.key),
      n: mod.displayName,
      d: 'Win a battle with the ' + mod.displayName + ' fitted',
      c: { t: 'hasModule', m: mod.key }
    });
  }
}

fs.writeFileSync(path.join(ROOT, 'tools', 'operations.json'), JSON.stringify(ops, null, 1));

var hull = ops.filter(function (o) { return o.c.t === 'hullWins'; });
var mods = ops.length - hull.length;
var wins = hull.reduce(function (a, o) { return a + o.c.n; }, 0) + mods;
console.log(ops.length + ' operations for ' + PROG.maxLevel + ' levels');
console.log('  ' + hull.length + ' fly-the-new-hull, ' + mods + ' fit-the-new-module');
var band = {};
hull.forEach(function (o) { band[o.c.n] = (band[o.c.n] || 0) + 1; });
console.log('  wins asked per hull: ' + Object.keys(band).sort()
  .map(function (k) { return k + ' x' + band[k]; }).join(', '));
console.log('  ' + wins + ' winning battles to reach level ' + PROG.maxLevel);
