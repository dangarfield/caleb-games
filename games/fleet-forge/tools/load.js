/* load.js — what the browser's `Data` is, for a node tool.
 *
 * Every headless tool used to build its own `Data` stub out of data.json, and
 * they quietly disagreed: some resolved ship bonuses, none did, and a stub that
 * is a little bit wrong turns a balance run into fiction. One loader now.
 *
 *   var L = require('./load');  var D = L.data();   // {modules, ships, shipList, ...}
 *   L.sandbox(['js/geom.js', 'js/autofit.js'])      // a vm context with Data + those files
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');

function read(p) { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); }

/* geom.js owns the bonus table. Run it in a bare context just to borrow it,
   rather than keeping a second copy of the rules in here. */
function geomOnly() {
  var sb = { console: console, Math: Math, JSON: JSON };
  sb.global = sb; vm.createContext(sb);
  sb.Data = { modules: {}, ships: {} };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/geom.js'), 'utf8'), sb, { filename: 'js/geom.js' });
  return sb.Geom;
}

function data() {
  var core = read('data/modules.json');
  var ships = read('data/ships.json').ships;
  var G = geomOnly();

  Object.keys(ships).forEach(function (k) {
    ships[k].key = k;
    ships[k].bonusList = G.resolveBonus(ships[k].bonus || {});
  });

  /* Same rule as the browser: a hull with no engine cell has no legal fit, and
     which hulls those are is read off the grid — never a name or a level. */
  var shipList = Object.keys(ships).map(function (k) { return ships[k]; })
    .filter(function (s) {
      var g = G.shipGrid(s);
      for (var r = 0; r < g.h; r++)
        for (var c = 0; c < g.w; c++)
          if (G.isEngineCell(g.cells[r][c])) return true;
      return false;
    })
    .sort(function (a, b) {
      return (a.requiredLevelSource || 0) - (b.requiredLevelSource || 0) || a.displayName.localeCompare(b.displayName);
    });

  return {
    keys: core.keys, modules: core.modules, ships: ships, shipList: shipList,
    moduleList: Object.keys(core.modules).map(function (k) { return core.modules[k]; }),
    module: function (k) { return core.modules[k]; },
    ship:   function (k) { return ships[k]; }
  };
}

/* A vm context with `Data` in place and the given game files run into it. */
function sandbox(files, extra, into) {
  var sb = into;
  if (!sb) {
    sb = { console: console, Math: Math, JSON: JSON, Date: Date };
    sb.global = sb; vm.createContext(sb);
    sb.Data = data();
  }
  if (extra) Object.keys(extra).forEach(function (k) { sb[k] = extra[k]; });
  (files || []).forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return sb;
}

module.exports = { ROOT: ROOT, read: read, data: data, sandbox: sandbox };
