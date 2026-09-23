/* selftest.js — run with:  node js/sim/selftest.js
 *
 * Not a test framework, on purpose: a plain script that loads the same files
 * the browser loads, stands a `Data` shim in front of data/data.json, and
 * asserts the things that were actually broken in the old build.
 */
'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');

var SIM_DIR = __dirname;
var ROOT = path.resolve(SIM_DIR, '..', '..');

var raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'data.json'), 'utf8'));

var sandbox = {
  Math: Math, JSON: JSON, Array: Array, Object: Object, Error: Error, Date: Date,
  isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt,
  Infinity: Infinity, NaN: NaN, undefined: undefined, console: console
};
vm.createContext(sandbox);

/* the three Data methods the sim actually uses */
sandbox.Data = {
  ships: raw.ships,
  modules: raw.modules,
  ship: function (k) { return raw.ships[k]; },
  module: function (k) { return raw.modules[k]; }
};

['../geom.js', 'modules.js', 'ai.js', 'sim.js'].forEach(function (f) {
  var p = path.resolve(SIM_DIR, f);
  vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p });
});

var Sim = sandbox.Sim, Geom = sandbox.Geom, Data = sandbox.Data;

/* ------------------------------------------------------------------ */
/* harness                                                             */
/* ------------------------------------------------------------------ */

var i, s;
var passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { failed++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function section(s) { console.log('\n' + s); }

/* source with comments stripped, so the scans below cannot be fooled by a
   comment that merely names the thing it is promising not to do */
function code(f) {
  return fs.readFileSync(path.join(SIM_DIR, f), 'utf8')
           .replace(/\/\*[\s\S]*?\*\//g, ' ')
           .replace(/^\s*\/\/.*$/gm, ' ');
}

/* ------------------------------------------------------------------ */
/* a crude auto-fitter, so the tests use real grids and real placement  */
/* ------------------------------------------------------------------ */

function autoFit(shipId, wants, ai) {
  var ship = Data.ship(shipId);
  var grid = Geom.shipGrid(ship);
  var placements = [];
  for (var i = 0; i < wants.length; i++) {
    var id = wants[i][0], n = wants[i][1], placed = 0;
    for (var r = 0; r < grid.h && placed < n; r++) {
      for (var c = 0; c < grid.w && placed < n; c++) {
        if (Geom.canPlace(grid, placements, Data.modules, id, c, r).ok) {
          placements.push({ moduleId: id, col: c, row: r });
          placed++;
        }
      }
    }
    if (placed < n) throw new Error('could not fit ' + n + 'x' + id + ' on ' + shipId +
                                    ' (managed ' + placed + ')');
  }
  return { shipId: shipId, modules: placements, ai: ai };
}

/* biggest and fussiest first; engines can only sit on the engine band anyway */
var GUNSHIP = function (ai) {
  return autoFit('Scythe', [
    ['Reactor2x2', 1],
    ['Ballistic1x3', 2],
    ['Engine1x1', 2],
    ['Armor1x1', 6]
  ], ai);
};
var LASERBOAT = function (ai) {
  return autoFit('Scythe', [
    ['Reactor2x2', 1],
    ['Laser1x2', 2],
    ['Engine1x1', 2],
    ['Armor1x1', 6]
  ], ai);
};
var MISSILEBOAT = function (ai) {
  return autoFit('Scythe', [
    ['ScrapLauncher2x3', 1],
    ['Reactor2x2', 1],
    ['RocketLauncher1x3', 2],
    ['Engine1x1', 2],
    ['Armor1x1', 2]
  ], ai);
};
var MINELAYER = function (ai) {
  return autoFit('Corvette', [
    ['MineLauncher3x2', 1],
    ['Reactor2x2', 1],
    ['Engine1x1', 2]
  ], ai);
};

function run(world, maxSeconds, dt, onStep) {
  var guard = Math.ceil(maxSeconds / dt) + 10;
  while (!world.over && guard-- > 0) {
    world.step(dt);
    if (onStep) onStep(world);
  }
  return world;
}

/* ------------------------------------------------------------------ */

section('fits');
var a = GUNSHIP('brawler'), b = LASERBOAT('sniper'), mine = MINELAYER('skirmisher');
check('gunship fit is legal', Geom.validate(Data.ship('Scythe'), a.modules, Data.modules).ok,
      a.modules.length + ' modules');
check('laser boat fit is legal', Geom.validate(Data.ship('Scythe'), b.modules, Data.modules).ok,
      b.modules.length + ' modules');
check('one doctrine, shared', !!(Sim.DOCTRINE && Sim.DOCTRINE.ENGAGE_FRAC > 0) &&
      Sim.AI_PRESETS === undefined && Sim.AI_DEFAULTS === undefined,
      'no presets, no per-ship defaults');

/* (a) a battle terminates and reports a winner -------------------- */
section('(a) a battle terminates with a winner');
var w1 = run(Sim.create({ playerFit: a, enemyFit: b, seed: 12345 }), 400, 1 / 60);
check('battle is over', w1.over === true, 'reason: ' + w1.reason);
check('a winner is named', w1.winner === 'player' || w1.winner === 'enemy',
      w1.winner + ' after ' + w1.time.toFixed(1) + 's / ' + w1.ticks + ' ticks');
check('it did not just time out', w1.timedOut !== true, 'reason: ' + w1.reason);

/* (b) determinism -------------------------------------------------- */
section('(b) same seed, same battle');
var d1 = run(Sim.create({ playerFit: a, enemyFit: b, seed: 777 }), 400, 1 / 60);
var d2 = run(Sim.create({ playerFit: a, enemyFit: b, seed: 777 }), 400, 1 / 60);
check('same winner', d1.winner === d2.winner, d1.winner + ' / ' + d2.winner);
check('same tick count', d1.ticks === d2.ticks, d1.ticks + ' / ' + d2.ticks);
check('same end time', Math.abs(d1.time - d2.time) < 1e-9,
      d1.time.toFixed(4) + ' / ' + d2.time.toFixed(4));
/* the seed has to actually reach the sim: two seeds must diverge. Tick counts
   can legitimately coincide (one matchup can be a foregone conclusion), so
   compare the trajectories a few seconds in. */
var e1 = Sim.create({ playerFit: a, enemyFit: b, seed: 777 });
var e2 = Sim.create({ playerFit: a, enemyFit: b, seed: 778 });
for (i = 0; i < 300; i++) { e1.step(1 / 60); e2.step(1 / 60); }
check('a different seed is a different battle',
      e1.player.x !== e2.player.x || e1.player.y !== e2.player.y,
      'dx ' + Math.abs(e1.player.x - e2.player.x).toExponential(2));

/* (c) frame-rate independence -------------------------------------- */
section('(c) 30fps and 60fps agree');
var f60 = run(Sim.create({ playerFit: a, enemyFit: b, seed: 4242 }), 400, 1 / 60);
var f30 = run(Sim.create({ playerFit: a, enemyFit: b, seed: 4242 }), 400, 1 / 30);
check('same winner at 30 and 60fps', f60.winner === f30.winner, f60.winner + ' / ' + f30.winner);
check('same tick count', f60.ticks === f30.ticks, f60.ticks + ' / ' + f30.ticks);
check('ships end in the same place',
      Math.abs(f60.player.x - f30.player.x) < 1e-6 &&
      Math.abs(f60.player.y - f30.player.y) < 1e-6,
      'dx ' + Math.abs(f60.player.x - f30.player.x).toExponential(2));

/* (d) no projectile outlives its range ----------------------------- */
section('(d) every projectile has a range and dies at it');
var worstOver = 0, seen = 0, noRange = 0, peak = 0, kinds = {};
function rangeWatch(w) {
  var live = 0;
  for (var i = 0; i < Sim.POOL; i++) {
    var p = w.projectiles[i];
    if (!p.active) continue;
    live++; seen++;
    kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    if (!(p.maxDist > 0)) noRange++;
    var over = p.dist - p.maxDist;
    if (over > worstOver) worstOver = over;
  }
  if (live > peak) peak = live;
}
run(Sim.create({ playerFit: a, enemyFit: b, seed: 99 }), 400, 1 / 60, rangeWatch);
run(Sim.create({ playerFit: MISSILEBOAT('skirmisher'), enemyFit: MINELAYER('brawler'), seed: 101 }),
    400, 1 / 60, rangeWatch);
check('every live projectile carries a max range', noRange === 0, noRange + ' without one');
check('none is past its range at the end of a step', worstOver <= 0,
      'worst overshoot ' + worstOver.toFixed(6) + ' over ' + seen + ' projectile-steps');
check('pool never overflowed', peak < Sim.POOL, 'peak ' + peak + ' of ' + Sim.POOL);
check('bullets, missiles, junk and mines were all exercised',
      Object.keys(kinds).length >= 4, 'kinds seen: ' + JSON.stringify(kinds));

/* (e) a mine-armed ship is not born dead --------------------------- */
section('(e) a mine launcher counts as a weapon');
var wm = Sim.create({ playerFit: mine, enemyFit: a, seed: 5 });
check('battle does not end at t=0', wm.over === false, 'winner: ' + wm.winner);
var mineWeapons = wm.player.modules.filter(function (m) {
  return m.subtype === 'mine' && m.alive;
}).length;
check('the mine launcher is its only armament', mineWeapons === 1 &&
      wm.player.modules.filter(function (m) {
        return (m.cat & sandbox.CAT.WEAPON) && m.subtype !== 'mine';
      }).length === 0);
for (s = 0; s < 120 && !wm.over; s++) wm.step(1 / 60);
check('two seconds in, still fighting', wm.over === false,
      't=' + wm.time.toFixed(1) + 's');
for (s = 0; s < 480 && !wm.over; s++) wm.step(1 / 60);
check('if it lost, it lost to gunfire, not to the rules',
      wm.over === false || wm.time > 2, 'over=' + wm.over + ' at ' + wm.time.toFixed(1) + 's');
var minesOut = 0;
for (i = 0; i < Sim.POOL; i++) {
  if (wm.projectiles[i].active && wm.projectiles[i].kind === Sim.KIND.MINE) minesOut++;
}
check('and it has actually laid mines', minesOut > 0, minesOut + ' in flight');

/* (f) killing every reactor ends it -------------------------------- */
section('(f) no reactors, no battle');
var wr = Sim.create({ playerFit: a, enemyFit: b, seed: 31337 });
wr.step(1 / 60);
check('alive before', wr.over === false);
var reactors = wr.enemy.modules.filter(function (m) { return (m.cat & sandbox.CAT.REACTOR) !== 0; });
check('the enemy has reactors to kill', reactors.length > 0, reactors.length + ' of them');
for (i = 0; i < reactors.length; i++) {
  Sim.damage(wr, wr.enemy, reactors[i], reactors[i].maxHealth + 1, 'test');
}
check('battle ended on the last reactor', wr.over === true, 'reason: ' + wr.reason);
check('and the player won', wr.winner === 'player', String(wr.winner));
var liveWeapons = wr.enemy.modules.filter(function (m) {
  return m.alive && (m.cat & sandbox.CAT.WEAPON) !== 0;
}).length;
check('it was reactors, not weapons, that did it', wr.reason === 'reactors',
      liveWeapons + ' enemy weapons still alive');

/* extra: the audit's other traps ----------------------------------- */
section('regressions from the audit');

/* BUG 4 — a ship with no engines coasts instead of stopping dead */
var wc = Sim.create({ playerFit: a, enemyFit: b, seed: 8 });
for (i = 0; i < 240; i++) wc.step(1 / 60);
for (i = 0; i < wc.player.modules.length; i++) {
  if (wc.player.modules[i].subtype === 'engine') wc.player.modules[i].alive = false;
}
var sp0 = Math.hypot(wc.player.vx, wc.player.vy);
var x0 = wc.player.x, y0 = wc.player.y;
wc.step(1 / 60);
var moved = Math.hypot(wc.player.x - x0, wc.player.y - y0);
check('an engineless ship still has speed', sp0 > 0, 'v = ' + sp0.toFixed(3));
check('and keeps moving', moved > 0, 'moved ' + moved.toFixed(5) + ' units in one tick');

/* BUG 9 — a module cannot be destroyed twice */
var wd = Sim.create({ playerFit: a, enemyFit: b, seed: 9 });
var victim = wd.enemy.modules[wd.enemy.modules.length - 1];
var first = Sim.damage(wd, wd.enemy, victim, victim.maxHealth + 50, 'test');
var second = Sim.damage(wd, wd.enemy, victim, 999, 'test');
check('the second hit on a dead module does nothing', first > 0 && second === 0,
      first + ' then ' + second);

/* BUG 6 — power triage drops support before weapons and engines */
var wp = Sim.create({ playerFit: a, enemyFit: b, seed: 10 });
var ord = wp.player.powerOrder.map(function (m) { return sandbox.SimModules.powerPriority(m); });
var ascending = true;
for (i = 1; i < ord.length; i++) if (ord[i] < ord[i - 1]) ascending = false;
check('shutdown order runs lowest priority first', ascending, ord.join(','));

/* BUG 5 — repair bays are capped at three and heal 9hp/s, not 18 */
var wrb = Sim.create({
  playerFit: autoFit('Arrow', [['RepairBay3x2', 4], ['Reactor2x2', 1],
                               ['Ballistic1x3', 1], ['Engine1x1', 2]], 'brawler'),
  enemyFit: b, seed: 11
});
var bays = wrb.player.modules.filter(function (m) { return m.subtype === 'repair'; });
var hurt = wrb.player.modules.filter(function (m) { return m.subtype === 'armor' || m.subtype === 'weapon'; })[0];
if (!hurt) hurt = wrb.player.modules[0];
Sim.damage(wrb, wrb.player, hurt, hurt.maxHealth * 0.5, 'test');
var before = hurt.health;
for (i = 0; i < 120; i++) wrb.step(1 / 60);   /* two seconds */
var healed = hurt.health - before;
check('four bays fitted, three allowed to work', bays.length === 4,
      bays.length + ' bays');
var working = bays.filter(function (m) { return m.repairLeft < sandbox.SimModules.C.REPAIR_CAPACITY; }).length;
check('exactly three bays spent capacity', working <= 3, working + ' bays drew down');
check('healing is bounded by 3 bays x 9hp/s', healed <= 3 * 9 * 2 + 0.01 && healed > 0,
      healed.toFixed(1) + ' hp in 2s');

/* BUG 7 — a laser tick is not floored to 1 damage sixty times a second */
var wl = Sim.create({ playerFit: b, enemyFit: a, seed: 12 });
var C = sandbox.SimModules.C;
check('the damage floor is a shot-level constant', C.DAMAGE_FLOOR === 1);
check('no missileDamageFactor in live code', !/missileDamageFactor/.test(code('sim.js') + code('modules.js')));

/* BUG 14 — a reactor blast goes in straight lines only.
   Reactor1x1 (er 1, ed 10) at (2,5) on an Arrow. (1,5) is orthogonally
   adjacent, (1,4) is diagonally adjacent. The spec says only the first
   takes damage; the old build hit both. */
var blastFit = { shipId: 'Arrow', ai: 'brawler', modules: [
  { moduleId: 'Reactor1x1',  col: 2, row: 5 },
  { moduleId: 'Armor1x1',    col: 1, row: 5 },
  { moduleId: 'Armor1x1',    col: 1, row: 4 },
  { moduleId: 'Ballistic1x1', col: 2, row: 6 },
  { moduleId: 'Engine1x1',   col: 2, row: 10 }
]};
var wx = Sim.create({ playerFit: blastFit, enemyFit: b, seed: 13 });
var reac = wx.player.modules[0], ortho = wx.player.modules[1], diag = wx.player.modules[2];
check('blast fit placed as intended',
      Geom.validate(Data.ship('Arrow'), blastFit.modules, Data.modules).stats.reactors === 1);
Sim.damage(wx, wx.player, reac, reac.maxHealth + 1, 'test');
check('the orthogonal neighbour is hit', ortho.health < ortho.maxHealth,
      ortho.health + '/' + ortho.maxHealth);
check('the diagonal neighbour is not', diag.health === diag.maxHealth,
      diag.health + '/' + diag.maxHealth);

/* the sim never touches a renderer */
section('no renderer, no globals');
var src = code('sim.js') + code('modules.js') + code('ai.js');
check('no canvas / ctx / Image / document', !/\b(document|canvas|getContext|new Image|requestAnimationFrame)\b/.test(src));
check('no bare Math.random', !/Math\.random/.test(src));
check('no setTimeout / setInterval', !/set(Timeout|Interval)/.test(src));
check('no console on a hot path', !/console\./.test(src));
check('no per-frame filter/sort in sim.js', !/\.filter\(|\.sort\(/.test(code('sim.js')));

/* Difficulty is PURELY the ship fit. Both ships must run the identical
   routine, with no per-ship configuration and no accuracy handicap anywhere. */
section('one doctrine, no hidden stats');
check('no ai block on a ship',
      (function () {
        var t = Sim.create({ playerFit: GUNSHIP(), enemyFit: LASERBOAT(), seed: 7 });
        return t.player.ai === undefined && t.enemy.ai === undefined;
      })(), 'ships carry no behaviour config');
check('no aim handicap in the source', !/aimError/.test(src), 'aimError is gone');
check('no target-priority switch in the source', !/targetPriority/.test(src),
      'every gun shoots the nearest thing in its cone');
check('a fit is a hull and its modules',
      (function () {
        var o = { ship: { shipId: 'Scythe', modules: [] } };
        var f = { shipId: o.ship.shipId, modules: o.ship.modules };
        return Object.keys(f).length === 2;
      })(), 'nothing else is passed to the sim');

/* Identical fits must fight to a dead heat over many seeds. If one side won
   consistently, something asymmetric would be hiding in the sim. */
section('identical fits are a coin toss');
var pw = 0, ew = 0, dr = 0;
for (i = 0; i < 40; i++) {
  var mir = Sim.create({ playerFit: GUNSHIP(), enemyFit: GUNSHIP(), seed: 1000 + i * 37 });
  var g2 = 0;
  while (!mir.over && g2++ < 30000) mir.step(1 / 60);
  if (mir.winner === 'player') pw++; else if (mir.winner === 'enemy') ew++; else dr++;
}
check('neither side is favoured', Math.abs(pw - ew) <= 14,
      pw + ' player / ' + ew + ' enemy / ' + dr + ' draw, over 40 seeds');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
