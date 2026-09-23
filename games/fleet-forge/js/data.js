/* data.js — the fleet data, loaded once.
 *
 * The old build fetched modules.json again on every single grid tap — ten call
 * sites, twenty-four fetches, several inside click handlers. All of it is one
 * request at boot now, and every path is relative: the arcade serves this game
 * from /games/fleet-forge/, so the old root-absolute '/data/...' would 404.
 */
var Data = (function () {
  var D = null, imgCache = {};

  /* The fitting screen's drill-down: group -> family -> modules. Families are
     read off the baked `subtype`, so nothing here depends on English names. */
  var GROUPS = [
    { id: 'weapons', label: 'Weapons', families: [
      { id: 'ballistic', label: 'Ballistic', match: function (m) { return m.damageType === 'ballistic' && m.subtype === 'weapon'; } },
      { id: 'missile',   label: 'Missile',   match: function (m) { return m.damageType === 'missile'   && m.subtype === 'weapon'; } },
      { id: 'laser',     label: 'Laser',     match: function (m) { return m.damageType === 'laser'     && m.subtype === 'weapon'; } }
    ]},
    { id: 'defence', label: 'Defence', families: [
      { id: 'armor',        label: 'Armour',       match: function (m) { return m.subtype === 'armor'; } },
      { id: 'shield',       label: 'Shields',      match: function (m) { return m.subtype === 'shield'; } },
      { id: 'pointdefense', label: 'Point Defence',match: function (m) { return m.subtype === 'pointdefense'; } }
    ]},
    { id: 'utility', label: 'Utility', families: [
      { id: 'reactor', label: 'Reactors', match: function (m) { return m.subtype === 'reactor'; } },
      { id: 'engine',  label: 'Engines',  match: function (m) { return m.subtype === 'engine' || m.subtype === 'afterburner' || m.subtype === 'warp'; } },
      { id: 'support', label: 'Support',  match: function (m) { return m.subtype === 'repair' || m.subtype === 'mine' || m.subtype === 'junk'; } }
    ]}
  ];

  function load(cb, fail) {
    fetch('./data/data.json')
      .then(function (r) {
        if (!r.ok) throw new Error('data.json ' + r.status);
        return r.json();
      })
      .then(function (json) {
        D = json;
        /* A hull with no engine cell can never satisfy "needs at least one
           engine", so it has no legal fit and does not belong in ship select.
           The Drone (1x2, two device cells, no engine bay) is the only one. */
        D.shipList = Object.keys(D.ships).map(function (k) { return D.ships[k]; })
                       .filter(function (s) {
                         var g = Geom.shipGrid(s);
                         for (var r = 0; r < g.h; r++)
                           for (var c = 0; c < g.w; c++)
                             if (Geom.isEngineCell(g.cells[r][c])) return true;
                         return false;
                       })
                       .sort(function (a, b) { return (a.lr || 0) - (b.lr || 0) || a.displayName.localeCompare(b.displayName); });
        D.moduleList = Object.keys(D.modules).map(function (k) { return D.modules[k]; });
        cb(D);
      })
      .catch(function (e) { (fail || function () {})(e); });
  }

  /* Ship and module art. Never blocks: a module with no image draws as its
     category tint, which is what the three art-less modules do today. */
  function img(kind, name) {
    if (!name) return null;
    var path = 'images/' + kind + '/' + name + '.webp';
    if (imgCache[path] !== undefined) return imgCache[path];
    var im = new Image();
    im.onerror = function () { imgCache[path] = null; };
    im.src = path;
    imgCache[path] = im;
    return im;
  }

  return {
    get all()     { return D; },
    get ships()   { return D.ships; },
    get modules() { return D.modules; },
    get shipList(){ return D.shipList; },
    GROUPS: GROUPS,
    load: load,
    ship:   function (k) { return D.ships[k]; },
    module: function (k) { return D.modules[k]; },
    shipImg:   function (s) { return img('ships', s.img); },
    moduleImg: function (m) { return img('modules', m.img); },

    /* Every module in a family, cheapest first — the order a player scans in. */
    family: function (groupId, familyId) {
      var g = GROUPS.filter(function (x) { return x.id === groupId; })[0];
      if (!g) return [];
      var f = g.families.filter(function (x) { return x.id === familyId; })[0];
      if (!f) return [];
      return D.moduleList.filter(function (m) {
        if (!f.match(m)) return false;
        /* Progression gates what can be fitted. Checked here so every caller —
           fitting screen, editor, anything later — gets the same list, and so
           no screen has to know about it. */
        if (typeof Progress !== 'undefined' && Progress.data && !Progress.moduleUnlocked(m)) return false;
        return true;
      }).sort(function (a, b) {
        return (a.w * a.h) - (b.w * b.h) || (a.rl || 0) - (b.rl || 0) ||
               a.displayName.localeCompare(b.displayName);
      });
    }
  };
})();
