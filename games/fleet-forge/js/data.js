/* data.js — the fleet data, loaded once.
 *
 * The old build fetched modules.json again on every single grid tap — ten call
 * sites, twenty-four fetches, several inside click handlers. All of it is one
 * request at boot now, and every path is relative: the arcade serves this game
 * from /games/fleet-forge/, so the old root-absolute '/data/...' would 404.
 */
var Data = (function () {
  var D = null, imgCache = {};

  /* base 0, v2 1, v3 2 — the mapping from the source's `modification` field
     lives in `modVariant` (theme.js), so the badge on the art and the order of
     the bay can never disagree. */
  function variantRank(m) {
    var v = (typeof modVariant === 'function') ? modVariant(m) : '';
    return v === 'v3' ? 2 : v === 'v2' ? 1 : 0;
  }

  /* The fitting screen's drill-down: group -> family -> modules. Families are
     read off `subtype`, so nothing here depends on English names. */
  var GROUPS = [
    { id: 'weapons', label: 'Weapons', families: [
      { id: 'ballistic', label: 'Ballistic', match: function (m) { return m.damageType === 'ballistic' && m.subtype === 'weapon'; } },
      { id: 'missile',   label: 'Missile',   match: function (m) { return m.damageType === 'missile'   && m.subtype === 'weapon'; } },
      { id: 'laser',     label: 'Laser',     match: function (m) { return m.damageType === 'laser'     && m.subtype === 'weapon'; } }
    ]},
    { id: 'defence', label: 'Defence', families: [
      { id: 'armor',        label: 'Armour',       match: function (m) { return m.subtype === 'armor'; } },
      { id: 'shield',       label: 'Shields',      match: function (m) { return m.subtype === 'shield'; } },
      { id: 'pointdefense', label: 'Point Def',   match: function (m) { return m.subtype === 'pointdefense'; } }
    ]},
    { id: 'utility', label: 'Utility', families: [
      { id: 'reactor', label: 'Reactors', match: function (m) { return m.subtype === 'reactor'; } },
      { id: 'engine',  label: 'Engines',  match: function (m) { return m.subtype === 'engine' || m.subtype === 'afterburner' || m.subtype === 'warp'; } },
      { id: 'support', label: 'Support',  match: function (m) { return m.subtype === 'repair' || m.subtype === 'mine' || m.subtype === 'junk'; } }
    ]}
  ];

  /* Bonus keys resolve in geom.js — one table, shared with every headless
     tool. `data/bonus-keys.json` is the list the source game defines; it is
     fetched rather than hardcoded so a new key shows up as a boot-time report
     instead of silently doing nothing. */
  var bonusSkipped = [];

  function load(cb, fail) {
    Promise.all([
      fetch('./data/modules.json').then(function (r) {
        if (!r.ok) throw new Error('modules.json ' + r.status); return r.json(); }),
      fetch('./data/ships.json').then(function (r) {
        if (!r.ok) throw new Error('ships.json ' + r.status); return r.json(); }),
      fetch('./data/bonus-keys.json').then(function (r) {
        if (!r.ok) throw new Error('bonus-keys.json ' + r.status); return r.json(); })
    ])
      .then(function (parts) {
        D = { version: parts[0].version, keys: parts[0].keys, modules: parts[0].modules };
        D.ships = parts[1].ships;
        ART.modules = parts[0].art || ART.modules;
        ART.ships   = parts[1].art || ART.ships;

        bonusSkipped = [];
        Object.keys(parts[2]).forEach(function (k) {
          if (!Geom.splitBonusKey(k)) bonusSkipped.push(k);
        });

        Object.keys(D.ships).forEach(function (k) {
          var s = D.ships[k];
          s.key = k;
          s.bonusList = Geom.resolveBonus(s.bonus || {});
          if (s.bonusList.skipped.length) {
            s.bonusList.skipped.forEach(function (x) {
              if (bonusSkipped.indexOf(x) < 0) bonusSkipped.push(x);
            });
          }
        });

        /* A hull with no engine cell can never satisfy "needs at least one
           engine", so it has no legal fit and does not belong in ship select.
           Which hulls those are is read off the grid, never assumed. */
        D.shipList = Object.keys(D.ships).map(function (k) { return D.ships[k]; })
                       .filter(function (s) {
                         var g = Geom.shipGrid(s);
                         for (var r = 0; r < g.h; r++)
                           for (var c = 0; c < g.w; c++)
                             if (Geom.isEngineCell(g.cells[r][c])) return true;
                         return false;
                       })
                       .sort(function (a, b) {
                         return (a.requiredLevelSource || 0) - (b.requiredLevelSource || 0) ||
                                a.displayName.localeCompare(b.displayName);
                       });
        D.moduleList = Object.keys(D.modules).map(function (k) { return D.modules[k]; });
        cb(D);
      })
      .catch(function (e) { (fail || function () {})(e); });
  }

  /* Ship and module art. The file is named after the key — there is no slug
     table any more — and the extension is whatever the copy tool recorded when
     it wrote that data file, so `--png` runs work without a code change.
     Never blocks: a module with no image draws as its category tint. */
  var ART = { ships: 'png', modules: 'webp' };

  function img(kind, name) {
    if (!name) return null;
    var path = 'images/' + kind + '/' + name + '.' + (ART[kind] || 'webp');
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
    shipImg:   function (s) { return img('ships', s.key); },
    moduleImg: function (m) { return img('modules', m.key); },
    pilotImg:  function (id) { return img('pilots', id); },

    /* Bonus keys this build cannot act on — either the key would not split, or
       it names a parameter the sim does not model. Read at boot so a hull that
       advertises a stat doing nothing is visible, not silent. */
    bonusGaps: function () { return bonusSkipped.slice(); },

    /* Every module in a family, cheapest first — the order a player scans in. */
    /* base 0, v2 1, v3 2 — see `modVariant` in theme.js, which owns the
       mapping from the source's `modification` field. */
    familyOrder: variantRank,

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
      /* THE ORDER OF THE BAY: footprint, then name, then version.
         Footprint first because that is the question being asked — the hull
         has a two-cell gap and you want what goes in it, not what is newest.
         Then the name, alphabetically, so a list you have scrolled once is in
         the same order the next time. Then the version last, which puts a
         module and its Black Market rework next to each other rather than
         scattered: two Chainguns, base then v2, adjacent and comparable.

         It used to sort on `requiredLevel` in the middle, which is the SOURCE
         game's level and not this one's ladder — so the order of the bay was
         decided by a number nothing else in the game uses. */
      }).sort(function (a, b) {
        return (a.width * a.height) - (b.width * b.height) ||
               a.displayName.localeCompare(b.displayName) ||
               variantRank(a) - variantRank(b);
      });
    }
  };
})();
