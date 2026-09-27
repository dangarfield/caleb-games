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
     Never blocks: a module with no image draws as its category tint.

     ONE FAILED REQUEST USED TO BLANK A HULL FOR THE WHOLE SESSION. `onerror`
     wrote `null` into the cache and nothing ever cleared it, so a dropped
     connection, a decode that lost a race with memory pressure, or a browser
     that simply gave up on one of 56 images left that ship drawing as an empty
     grid until the page was reloaded — and reloading fixed it, which is what
     makes it look like bad art rather than a bad load.

     So a failed load is retried, three times, backing off 0.4s / 1.2s / 3s,
     with a cache-buster on the retry because a browser will happily serve its
     own failed response back. After that it is marked dead and the caller
     draws its fallback, but the mark expires: ask again half a minute later
     and it tries afresh, up to a hard cap so a genuinely missing file cannot
     turn into a request every time something is drawn.

     Loading is on demand and stays that way — the hangar asks for the art of
     the cards it is drawing and nothing else, which measured at four requests
     in a 250ms burst while walking the whole tier rail. What the queue below
     adds is a ceiling: at most LOAD_MAX in flight at once, so a tier switch on
     a slow connection cannot put six 300KB hulls in the air together and have
     the slowest of them time out. The rest wait their turn. */
  var ART = { ships: 'png', modules: 'webp' };

  var LOAD_MAX = 4;                  /* images in flight at once             */
  var RETRY_MS = [400, 1200, 3000];  /* backoff between attempts             */
  var DEAD_FOR = 30000;              /* how long a give-up sticks            */
  var HARD_CAP = 9;                  /* total attempts, ever, per file       */
  var STALL_MS = 15000;              /* a request that answers neither way   */
  var queue = [], inflight = 0, tries = {}, deadAt = {};

  function pump() {
    while (inflight < LOAD_MAX && queue.length) { inflight++; queue.shift()(); }
  }

  /* Set `src` and count the request. Both handlers free the slot exactly once,
     because a slot that leaks is a loader that stops after four images. */
  function fetchImg(path, im) {
    var n = tries[path] || 0, freed = false;
    function free() { if (freed) return; freed = true; inflight--; pump(); }

    /* A REQUEST THAT NEVER ANSWERS IS WORSE THAN ONE THAT FAILS. A stalled
       connection fires neither handler, so its slot would never come back and
       four of them would stop every image in the game for good. The watchdog
       frees the slot and lets the queue move; the Image is left alone, and if
       it does arrive late it is already in the cache and simply starts
       drawing. */
    var watch = setTimeout(free, STALL_MS);
    function stop() { clearTimeout(watch); }

    im.onload = function () { stop(); free(); };
    im.onerror = function () {
      stop();
      free();
      tries[path] = n + 1;
      if (n + 1 < RETRY_MS.length + 1 && n + 1 < HARD_CAP) {
        /* not a per-frame timer — this fires once per failed image, on a path
           that is already waiting on the network */
        setTimeout(function () { queue.push(function () { fetchImg(path, im); }); pump(); },
                   RETRY_MS[n] || RETRY_MS[RETRY_MS.length - 1]);
      } else {
        imgCache[path] = null;       /* the caller draws its own fallback */
        deadAt[path] = Date.now();
      }
    };
    /* the retry must not be answered from the browser's own failed response */
    im.src = n ? path + '?r=' + n : path;
  }

  function img(kind, name) {
    if (!name) return null;
    var path = 'images/' + kind + '/' + name + '.' + (ART[kind] || 'webp');
    var had = imgCache[path];

    if (had === null) {
      /* given up on — but only for a while, and only so many times */
      if ((tries[path] || 0) >= HARD_CAP) return null;
      if (Date.now() - (deadAt[path] || 0) < DEAD_FOR) return null;
      delete imgCache[path];
      had = undefined;
    }
    if (had !== undefined) return had;

    var im = new Image();
    imgCache[path] = im;
    queue.push(function () { fetchImg(path, im); });
    pump();
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
