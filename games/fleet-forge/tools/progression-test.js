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
var L = require('./load');
var DATA = L.data();
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
['js/geom.js', 'js/autofit.js', 'js/data.js', 'js/progress.js', 'js/save.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
});

/* hand the loaders their data directly rather than over fetch */
sb.eval = null;
vm.runInContext('Data.__inject = function (d) { }', sb);
/* Data and Progress both read module-scope privates, so drive their real
   load paths with a fetch stub. */
/* data.js now fetches three files, so the stub answers by name. */
var CORE  = L.read('data/modules.json');
var SHIPS = L.read('data/ships.json');
var BKEYS = L.read('data/bonus-keys.json');
sb.fetch = function (url) {
  var body = url.indexOf('progression') >= 0 ? PROG
           : url.indexOf('ships.json')   >= 0 ? SHIPS
           : url.indexOf('bonus-keys')   >= 0 ? BKEYS
           : CORE;
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
};

var Data = sb.Data, Progress = sb.Progress, Save = sb.Save, Geom = sb.Geom;

function run() {
  return new Promise(function (res) {
    Data.load(function () { Progress.load(function () { Save.ready(function () { res(); }); }); });
  });
}

/* ---- a battle event the tests can bend ---------------------------------- */
/* The fit the player would actually be flying. An empty layout made every
   fit-based operation unsatisfiable, so the ladder stalled on the first one and
   the test blamed the ladder rather than the harness.
   A player facing "win with two guns fitted" refits for it, so the harness
   tries the autofit recipes in turn and flies the first one that satisfies
   something currently on offer. */
var RECIPES = [
  { weapons: 'mix',       armour: 'mix',     priority: 'mix' },
  { weapons: 'mix',       armour: 'mix',     priority: 'weapons' },
  { weapons: 'mix',       armour: 'armour',  priority: 'defence' },
  { weapons: 'mix',       armour: 'shields', priority: 'defence' },
  { weapons: 'ballistic', armour: 'mix',     priority: 'weapons' },
  { weapons: 'laser',     armour: 'mix',     priority: 'weapons' },
  { weapons: 'missile',   armour: 'mix',     priority: 'weapons' }
];

function fitWith(shipKey, recipe) {
  var ship = Data.ship(shipKey);
  return sb.Autofit.build(ship, {
    weapons: recipe.weapons, armour: recipe.armour, priority: recipe.priority,
    skill: 100, seed: 7,
    allow: function (m) { return Progress.moduleUnlocked(m); }
  }, Data.modules);
}

/* The best hull the player owns — the one they would actually take out. */
function bestHull() {
  var best = Save.activeShip(), cap = 0;
  Save.ownedKeys().forEach(function (k) {
    var c = Geom.shipGrid(Data.ship(k)).capacity;
    if (c > cap) { cap = c; best = k; }
  });
  return best;
}

/* One sortie, flown the way the operation asks: in the hull it names, or with
   the module it names bolted on. That is what a player reads and does — and
   an operation the harness cannot satisfy this way is one the player cannot
   satisfy either, which is the whole point of walking the ladder here. */
var sortieN = 0;
function sortie(over) {
  var want = Progress.available()[0] || null;
  var shipKey = bestHull(), fit;

  if (want && want.cond.t === 'hullWins' && Save.owned(want.cond.ship)) {
    shipKey = want.cond.ship;
  }
  var recipe = RECIPES[sortieN++ % RECIPES.length];
  fit = fitWith(shipKey, recipe);

  if (want && want.cond.t === 'hasModule') {
    fit = forceModule(shipKey, fit, want.cond.m);
    /* THE BIGGEST HULL IS NOT ALWAYS THE ONE THAT TAKES THE PIECE. A 2x3 engine
       needs a 2x3 block of ENGINE cells, and the roomiest hull owned may not
       have one — the harness used to fly it anyway, fail to seat the module and
       sit on that level for ever, reporting a dead end that is not there. A
       player handed a part their current hull cannot take flies one that can,
       so the harness does too: the roomiest hull that can actually seat it.
       If none can, the fit comes back without it and the ladder IS stuck,
       which is the dead end this walk exists to find. */
    if (!fit.some(function (q) { return q.moduleId === want.cond.m; })) {
      var alt = '', cap = 0;
      Save.ownedKeys().forEach(function (k) {
        var c = Geom.shipGrid(Data.ship(k)).capacity;
        if (c <= cap) return;
        var f = forceModule(k, fitWith(k, recipe), want.cond.m);
        if (f.some(function (q) { return q.moduleId === want.cond.m; })) { alt = k; cap = c; }
      });
      if (alt) { shipKey = alt; fit = forceModule(alt, fitWith(alt, recipe), want.cond.m); }
    }
  }
  return battleFrom(shipKey, fit, over);
}

/* Drop a module onto a fit, turfing out whatever is in the way — which is
   exactly what a player does when they are handed a new piece and told to go
   and use it. */
function forceModule(shipKey, fit, modKey) {
  if (fit.some(function (p) { return p.moduleId === modKey; })) return fit;
  var ship = Data.ship(shipKey), grid = Geom.shipGrid(ship);
  for (var r = 0; r < grid.h; r++) {
    for (var c = 0; c < grid.w; c++) {
      var want = Geom.footprint(Data.module(modKey), c, r);
      var clear = fit.filter(function (p) {
        var f = Geom.footprint(Data.module(p.moduleId), p.col, p.row);
        return !f.some(function (cell) { return want.indexOf(cell) >= 0; });
      });
      if (Geom.canPlace(grid, clear, Data.modules, modKey, c, r, -1).ok)
        return clear.concat([{ moduleId: modKey, col: c, row: r }]);
    }
  }
  return fit;
}

function battle(shipKey, over) {
  var lay = Save.activeLayout(shipKey);
  var fit = (lay && lay.modules && lay.modules.length)
              ? lay.modules : fitWith(shipKey, RECIPES[0]);
  return battleFrom(shipKey, fit, over);
}

function battleFrom(shipKey, fit, over) {
  var ship = Data.ship(shipKey);
  var sum = Geom.summarise(ship, fit, Data.modules);
  /* what the fit is made of, which is what a fit-based operation asks about */
  var subs = {}, types = {}, turrets = 0, mods = {};
  fit.forEach(function (p) {
    var m = Data.module(p.moduleId);
    if (!m) return;
    subs[m.subtype] = (subs[m.subtype] || 0) + 1;
    if (m.subtype === 'weapon' && m.damageType) types[m.damageType] = 1;
    if (m.turret) turrets++;
    mods[m.key] = 1;
  });
  var ev = { kind: 'battle', won: true, reason: 'disarmed', time: 45, health: 0.5,
             modulesLost: 3, shipId: shipKey,
             hullTier: Progress.tierOf(ship), oppTier: Progress.tierOf(ship),
             cells: Geom.shipGrid(ship).capacity, cellsUsed: sum.cellsUsed,
             weapons: sum.weapons, reactors: sum.reactors, turrets: turrets,
             subs: subs, types: types, mods: mods };
  for (var k in (over || {})) ev[k] = over[k];
  return ev;
}

run().then(function () {
  section('boot');
  check('progression loaded', Progress.maxLevel() === PROG.maxLevel, Progress.maxLevel() + ' levels');
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
  /* Whatever the LADDER hands over at level 1 — not what the source gates at 1.
     The two parted company when the ladder became a hundred levels of its own. */
  var expect = 0, mk;
  for (mk in Data.modules)
    if (PROG.moduleLevel[mk] === 1 &&
        Data.modules[mk].subtype === 'weapon' && Data.modules[mk].damageType === 'ballistic') expect++;
  check('only level-1 weapons offered', mods.length === expect,
        mods.map(function (m) { return m.displayName; }).join(', ') + ' (expected ' + expect + ')');
  var above = mods.filter(function (m) { return (PROG.moduleLevel[m.key] || 99) > 1; });
  check('nothing above the level is offered', above.length === 0,
        above.map(function (m) { return m.displayName; }).join(', '));
  check('tier 2 is shut', !Progress.tierUnlocked(2));

  section('an operation grants a level');
  /* The first operation is "fly the starting hull and win three times", so one
     win is not a level any more — the count is. */
  var first = Progress.available()[0];
  check('the first operation is the starting hull', first && first.cond.t === 'hullWins' &&
        first.cond.ship === Save.activeShip(), first && first.name);
  var before = Progress.level(), rose = 0;
  for (var w = 0; w < first.cond.n; w++) {
    var g = Progress.recordBattle(sortie());
    if (g.length) rose = Progress.level();
  }
  check('the stated number of wins levelled up', Progress.level() === before + 1,
        first.cond.n + ' wins in the ' + Data.ship(first.cond.ship).displayName +
        ' -> level ' + Progress.level());
  var lvl2 = PROG.levels[Progress.level() - 1];
  check('the level unlocked a hull', lvl2.ships.length > 0, lvl2.ships.join(', '));

  section('the ladder climbs')
  /* No gates: every operation is worth one level, so a run of sorties climbs
     one rung at a time and never two. The recipes rotate, so the fit-based
     operations are reachable without the harness being told what they want. */
  var start = Progress.level(), jumped = 0, guard = 0;
  while (Progress.level() < start + 12 && guard++ < 600) {
    var was = Progress.level();
    Progress.recordBattle(sortie({
      time: 5 + (guard % 30), health: 0.96, modulesLost: 0,
      reason: guard % 2 ? 'reactors' : 'disarmed'
    }));
    if (Progress.level() - was > 1) jumped++;
  }
  check('twelve more levels were reached', Progress.level() === start + 12,
        'level ' + Progress.level() + ' after ' + guard + ' sorties');
  check('never more than one level per battle', jumped === 0, jumped + ' double jumps');
  check('a higher tier opened on the way', Progress.tierUnlocked(2));

  section('every operation is reachable');
  var kinds = {}, unknown = [];
  PROG.operations.forEach(function (o) { kinds[o.cond.t] = 1; });
  var known = ['wins','streak','winsAtOwnTier','streakAtTier','hullWins','twoHulls','layouts',
               'fillCells','ownTier','health','time','reason','noLoss','cells','newHull',
               'fullWin','minWeapons','minReactors','minTurrets','has','without','hasAll',
               'hasModule','allTypes','only','step'];
  Object.keys(kinds).forEach(function (k) { if (known.indexOf(k) < 0) unknown.push(k); });
  check('no condition type without an implementation', unknown.length === 0, unknown.join(', '));

  check('one operation per level below the last',
        PROG.operations.length === PROG.maxLevel - 1,
        PROG.operations.length + ' operations for ' + PROG.maxLevel + ' levels');
  var ats = {}, dupe = [];
  PROG.operations.forEach(function (o) { if (ats[o.at]) dupe.push(o.at); ats[o.at] = 1; });
  check('no level carries two operations', dupe.length === 0, dupe.join(', '));

  /* Checked against the real thing, not a list written here. An opponent's
     name is its hull plus a CALLSIGN, and the callsigns are the only part of
     it that is not a hull — so they are what an operation must never mention.
     They are read straight out of `js/opponents.js`, not copied, because a
     copy is how this check quietly stops checking anything. Hull names are
     excluded: a hull is fixed data the player earns and an operation may name
     one. */
  var hullNames = {};
  Data.shipList.forEach(function (sp) { hullNames[sp.displayName] = 1; });
  var src = require('fs').readFileSync(require('path').join(L.ROOT, 'js/opponents.js'), 'utf8');
  var block = src.match(/var CALLSIGN = \[([\s\S]*?)\];/);
  var oppNames = {};
  (block ? block[1].match(/'([^']+)'/g) || [] : []).forEach(function (q) {
    var n = q.slice(1, -1);
    if (!hullNames[n]) oppNames[n] = 1;
  });
  if (!Object.keys(oppNames).length) throw new Error('no callsigns found in js/opponents.js');
  var named = PROG.operations.filter(function (o) {
    return Object.keys(oppNames).some(function (nm) { return o.desc.indexOf(nm) >= 0; });
  });
  check('no operation names an opponent', named.length === 0,
        named.map(function (o) { return o.name; }).join(', '));

  var hullOps = PROG.operations.filter(function (o) { return o.cond.t === 'hullWins'; });
  var modOps  = PROG.operations.filter(function (o) { return o.cond.t === 'hasModule'; });
  check('every operation is fly-a-hull or fit-a-module',
        hullOps.length + modOps.length === PROG.operations.length,
        hullOps.length + ' hull, ' + modOps.length + ' module');
  /* the hull an operation names must be the one its own level handed over */
  var wrong = hullOps.filter(function (o) { return PROG.shipLevel[o.cond.ship] !== o.at; });
  check('each hull operation is about the hull that level gave',
        wrong.length === 0, wrong.map(function (o) { return o.name; }).slice(0, 4).join(', '));
  var wrongM = modOps.filter(function (o) { return PROG.moduleLevel[o.cond.m] !== o.at; });
  check('each module operation is about a module that level gave',
        wrongM.length === 0, wrongM.map(function (o) { return o.name; }).slice(0, 4).join(', '));

  section('unlocks add up');
  var shipN = Object.keys(PROG.shipLevel).length, modN = Object.keys(PROG.moduleLevel).length;
  check('every flyable hull is on the tree', shipN === Data.shipList.length, shipN + ' hulls');
  check('every module is on the tree', modN === Object.keys(Data.modules).length,
        modN + ' modules');
  var maxShip = 0, maxMod = 0;
  for (k2 in PROG.shipLevel) maxShip = Math.max(maxShip, PROG.shipLevel[k2]);
  for (k2 in PROG.moduleLevel) maxMod = Math.max(maxMod, PROG.moduleLevel[k2]);
  check('nothing unlocks past the last level',
        maxShip <= PROG.maxLevel && maxMod <= PROG.maxLevel,
        'hulls to ' + maxShip + ', modules to ' + maxMod + ' of ' + PROG.maxLevel);

  section('the whole ladder can be walked');
  /* The one test that matters: play it to the top. An operation nobody can
     satisfy is a dead end the player hits and never leaves, and no amount of
     checking the table finds that — only flying it does. */
  var sorties = 0, stuckAt = 0;
  while (Progress.level() < PROG.maxLevel && sorties < 4000) {
    var before2 = Progress.level();
    Progress.recordBattle(sortie({
      time: 4 + (sorties % 40), health: 0.97, modulesLost: 0,
      reason: sorties % 2 ? 'reactors' : 'disarmed'
    }));
    sorties++;
    if (Progress.level() === before2 && sorties - stuckAt > 200) break;
    if (Progress.level() > before2) stuckAt = sorties;
  }
  check('reached the last level', Progress.level() === PROG.maxLevel,
        'level ' + Progress.level() + ' after ' + sorties + ' sorties');
  var last = PROG.levels[PROG.maxLevel - 1];
  check('the last level hands over the prize hull',
        last.ships.length === 1 && !last.modules.length, last.ships.join(', '));
  check('the prize hull is owned', Save.owned(last.ships[0]), last.ships[0]);
  var unowned = Data.shipList.filter(function (sp) { return !Save.owned(sp.key); });
  check('every hull is owned at the top', unowned.length === 0,
        unowned.map(function (sp) { return sp.key; }).slice(0, 5).join(', '));
  var lockedMods = Object.keys(Data.modules)
    .filter(function (k) { return !Progress.moduleUnlocked(Data.modules[k]); });
  check('every module is unlocked at the top', lockedMods.length === 0,
        lockedMods.slice(0, 5).join(', '));

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
