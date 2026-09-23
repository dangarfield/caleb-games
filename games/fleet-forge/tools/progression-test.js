/* progression-test.js — drive the unlock tree headlessly.
 *
 * Runs the real Progress / Save / Geom code against data/progression.json with
 * a stubbed store, and asserts the ladder actually advances, the gates actually
 * hold, and every operation is reachable.
 *
 *   node tools/progression-test.js
 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8'));
var PROG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/progression.json'), 'utf8'));

var pass = 0, fail = 0;
function check(name, ok, note) {
  if (ok) { pass++; console.log('  ok   ' + name + (note ? '  (' + note + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (note ? '  (' + note + ')' : '')); }
}
function section(s) { console.log('\n' + s); }

/* ---- sandbox ------------------------------------------------------------ */
var sb = { console: console, Math: Math, JSON: JSON, Date: Date, setTimeout: setTimeout,
           clearTimeout: clearTimeout, fetch: null };
sb.global = sb; sb.window = sb;
vm.createContext(sb);

/* a store that just holds an object */
sb.ArcadeStore = function () {
  var v = null, conflict = null;
  return { ready: function (cb) { cb(); }, get: function () { return v; },
           set: function (s, val) { v = val; return true; },
           working: function () { return true; }, conflict: function () { return conflict; },
           flush: function () {} };
};
['js/geom.js', 'js/data.js', 'js/progress.js', 'js/save.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
});

/* hand the loaders their data directly rather than over fetch */
sb.eval = null;
vm.runInContext('Data.__inject = function (d) { }', sb);
/* Data and Progress both read module-scope privates, so drive their real
   load paths with a fetch stub. */
sb.fetch = function (url) {
  var body = url.indexOf('progression') >= 0 ? PROG : DATA;
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
};

var Data = sb.Data, Progress = sb.Progress, Save = sb.Save, Geom = sb.Geom;

function run() {
  return new Promise(function (res) {
    Data.load(function () { Progress.load(function () { Save.ready(function () { res(); }); }); });
  });
}

/* ---- a battle event the tests can bend ---------------------------------- */
function battle(shipKey, over) {
  var ship = Data.ship(shipKey);
  var lay = Save.activeLayout(shipKey) || { modules: [] };
  var sum = Geom.summarise(ship, lay.modules, Data.modules);
  var ev = { kind: 'battle', won: true, reason: 'disarmed', time: 45, health: 0.5,
             modulesLost: 3, shipId: shipKey,
             hullTier: Progress.tierOf(ship), oppTier: Progress.tierOf(ship),
             cells: Geom.shipGrid(ship).capacity, cellsUsed: sum.cellsUsed,
             weapons: sum.weapons, reactors: sum.reactors, turrets: 0,
             subs: {}, types: { ballistic: 1 }, mods: {} };
  for (var k in (over || {})) ev[k] = over[k];
  return ev;
}

run().then(function () {
  section('boot');
  check('progression loaded', Progress.maxLevel() === 50, Progress.maxLevel() + ' levels');
  check('starts at level 1', Progress.level() === 1);
  check('starting hull owned', Save.ownedKeys().length === 1, Save.ownedKeys()[0]);

  section('the gates actually gate');
  var locked = Data.shipList.filter(function (s) { return !Progress.shipUnlocked(s); });
  check('most hulls are locked at level 1', locked.length === Data.shipList.length - 1,
        locked.length + ' of ' + Data.shipList.length + ' locked');
  /* Whatever the data gates at level 1, and nothing above it. Checked against
     the tree rather than a hardcoded count — the Vulcan Cannon is rl 1 and
     belongs here, which an earlier magic number got wrong. */
  var mods = Data.family('weapons', 'ballistic');
  var expect = 0, mk;
  for (mk in Data.modules)
    if (Data.modules[mk].Visible === 0 && Data.modules[mk].rl <= 1 &&
        Data.modules[mk].subtype === 'weapon' && Data.modules[mk].damageType === 'ballistic') expect++;
  check('only level-1 weapons offered', mods.length === expect,
        mods.map(function (m) { return m.displayName; }).join(', ') + ' (expected ' + expect + ')');
  var above = mods.filter(function (m) { return m.rl > 1; });
  check('nothing above the level is offered', above.length === 0,
        above.map(function (m) { return m.displayName; }).join(', '));
  check('tier 2 is shut', !Progress.tierUnlocked(2));

  section('an operation grants a level');
  var before = Progress.level();
  var g = Progress.recordBattle(battle(Save.activeShip()));
  check('winning once levelled up', Progress.level() === before + 1,
        'level ' + Progress.level() + ' via ' + (g[0] && g[0].op.name));
  check('the level unlocked a hull', g[0] && g[0].unlocks.ships.length > 0,
        g[0] && g[0].unlocks.ships.join(', '));

  section('the tier gate holds');
  /* grind ordinary wins and confirm the ladder stalls at the last level of
     tier 1 until the step-up is actually done */
  var guard = 0;
  while (Progress.level() < 3 && guard++ < 400) {
    Progress.recordBattle(battle(Save.activeShip(), {
      time: 5 + (guard % 30), health: 0.5 + (guard % 5) / 10,
      reason: guard % 2 ? 'reactors' : 'disarmed', modulesLost: guard % 3
    }));
  }
  check('reached the last level of tier 1', Progress.level() === 3, 'level ' + Progress.level());
  var gate = Progress.currentGate();
  check('a gate is in the way', !!gate, gate && gate.name);
  var stuck = Progress.level();
  for (var i = 0; i < 40; i++) Progress.recordBattle(battle(Save.activeShip(), { time: 3 }));
  check('ordinary wins cannot pass it', Progress.level() === stuck, 'still level ' + stuck);
  var gained = Progress.recordBattle(battle(Save.activeShip(), { hullTier: 1, oppTier: 2 }));
  check('the step-up passes it', Progress.level() === stuck + 1,
        'level ' + Progress.level() + ' via ' + (gained[0] && gained[0].op.name));
  check('tier 2 is now open', Progress.tierUnlocked(2));

  section('every operation is reachable');
  var kinds = {}, unknown = [];
  PROG.operations.forEach(function (o) { kinds[o.cond.t] = 1; });
  var known = ['wins','streak','winsAtOwnTier','streakAtTier','hullWins','twoHulls','layouts',
               'fillCells','ownTier','health','time','reason','noLoss','cells','newHull',
               'fullWin','minWeapons','minReactors','minTurrets','has','without','hasAll',
               'hasModule','allTypes','only','step'];
  Object.keys(kinds).forEach(function (k) { if (known.indexOf(k) < 0) unknown.push(k); });
  check('no condition type without an implementation', unknown.length === 0, unknown.join(', '));

  var gates = PROG.operations.filter(function (o) { return o.gate; });
  check('six tier gates', gates.length === 6, gates.map(function (o) { return o.name; }).join(', '));
  var named = PROG.operations.filter(function (o) {
    return /Skiff|Scrapper|Hornet|Gardener|Needle|Bulwark|Inquisitor|Warden|Mjollnir/.test(o.desc);
  });
  check('no operation names an opponent', named.length === 0,
        named.map(function (o) { return o.name; }).join(', '));

  section('unlocks add up');
  var shipN = Object.keys(PROG.shipLevel).length, modN = Object.keys(PROG.moduleLevel).length;
  check('every flyable hull is on the tree', shipN === Data.shipList.length, shipN + ' hulls');
  var baseN = 0, k2;
  for (k2 in Data.modules) if (Data.modules[k2].Visible === 0) baseN++;
  check('every base module is on the tree', modN === baseN, modN + ' modules');
  var maxShip = 0, maxMod = 0;
  for (k2 in PROG.shipLevel) maxShip = Math.max(maxShip, PROG.shipLevel[k2]);
  for (k2 in PROG.moduleLevel) maxMod = Math.max(maxMod, PROG.moduleLevel[k2]);
  check('nothing unlocks past the last level', maxShip <= 50 && maxMod <= 50,
        'hulls to ' + maxShip + ', modules to ' + maxMod);

  section('an operation never needs what it cannot have');
  var bad = [];
  PROG.operations.forEach(function (o) {
    if (o.cond.t === 'hasModule' && (PROG.moduleLevel[o.cond.m] || 99) > o.at)
      bad.push(o.name + ' needs ' + o.cond.m + ' at level ' + PROG.moduleLevel[o.cond.m]);
    if (o.cond.t === 'hullWins' && (PROG.shipLevel[o.cond.ship] || 99) > o.at)
      bad.push(o.name + ' needs ' + o.cond.ship + ' at level ' + PROG.shipLevel[o.cond.ship]);
  });
  check('no operation precedes its own requirement', bad.length === 0, bad.join('; '));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.log('THREW: ' + (e && e.stack || e));
  process.exit(1);
});
