/* save.js — what each pilot owns, in IndexedDB via arcade-store.
 *
 * SCHEMA 4 — two pilots, one document.
 *   v1  five hangar slots, each an independent {shipId, modules}
 *   v2  ships, not hangars: own a hull and it carries three layouts
 *   v3  progression — level, operations, and the counters they read
 *   v4  pilots. Ezra and Caleb each get the whole of v3 to themselves.
 *
 * The design's home screen is a pilot select, and two brothers sharing one save
 * is the one thing guaranteed to start a fight — so a pilot is a completely
 * separate game: its own level, its own operations, its own fleet. They share
 * only the stored document, because the arcade store is one key per game and
 * two keys would be two things to go wrong.
 *
 * `state` is the whole document; `cur` is the profile being played, and every
 * accessor below reads `cur`. Nothing outside this file knows there is more
 * than one profile except the home screen.
 *
 * Key is calebArcadeData:fleet-forge. The arcade forbids localStorage: it is
 * one ~5MB quota for the whole origin and in Sept 2026 it was full, so writes
 * were failing silently for every game on the machine. `sid`/`gen` stop a tab
 * left open yesterday from overwriting the tab being played in today.
 */
var Save = (function () {
  var Store = ArcadeStore('fleet-forge');
  var SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  var gen = 0, state = null, cur = null, stalled = false, recovered = '';
  /* Once on, nothing is ever written again this session. See `debugPilot`. */
  var sandbox = false;

  var SLOTS = Progress.MAX_LAYOUTS;          /* 3 layouts per ship */

  /* The two pilots, in the order the home screen shows them. */
  var PILOTS = [{ id: 'ezra', name: 'Ezra' }, { id: 'caleb', name: 'Caleb' }];

  function freshProgress() {
    return {
      level: 1,
      ops: {},                  /* opId -> 1 once completed */
      wins: 0, losses: 0,
      streak: 0, bestStreak: 0,
      winsAtOwnTier: 0,
      streakAtTier: {},         /* oppTier -> current run */
      bestStreakAtTier: {},     /* oppTier -> best run */
      hullWins: {},             /* shipKey -> wins flown in it */
      wonHulls: {},             /* shipKey -> 1 once it has ever won */
      tierHulls: {},            /* oppTier -> [shipKeys that beat it] */
      maxLayouts: 0,            /* most layouts saved on any one ship */
      maxFilled: 0              /* largest hull ever filled to every cell */
    };
  }

  /* One pilot's entire game. */
  function freshProfile() {
    return {
      prog: freshProgress(),
      ships: {},          /* shipKey -> { layouts: [l0,l1,l2], active: 0 } */
      activeShip: '',
      results: {},        /* opponentId -> {wins, losses} */
      beaten: [],         /* opponent ids, in the order beaten */
      played: 0,          /* ms of the last session, for "new pilot" on the card */
      speed: 0            /* match speed, an index into the arena's 1x/2x/4x */
    };
  }

  function fresh() {
    var d = { v: 4, pilots: {}, lastPilot: PILOTS[0].id, muted: false,
              hullView: freshHullView() };
    PILOTS.forEach(function (p) { d.pilots[p.id] = freshProfile(); });
    return d;
  }

  /* HULL / MODULES, remembered separately for each of the three places a ship
     is drawn — the hangar, the fitting bay and the arena want different things
     from the same switch, so they each keep their own answer.
     THE DEFAULTS ALL MEAN THE SAME THING: show the hull's render with the fit
     on top of it. It is only the fitting bay's labels that run the other way —
     there MODULES means the bare grid — so its default is HULL while the other
     two default to MODULES. */
  /* What each view opens on, and — because the arena has a third mode the
     other two do not — what it is even allowed to be set to. A stored value
     outside its view's list is dropped on load rather than trusted. */
  var HULL_VIEWS = { hangar: 'hull', fitting: 'hull', battle: 'damage' };
  var HULL_MODES = { hangar: ['hull', 'modules'],
                     fitting: ['hull', 'modules'],
                     battle: ['hull', 'modules', 'damage'] };
  function freshHullView() {
    var o = {}, k;
    for (k in HULL_VIEWS) o[k] = HULL_VIEWS[k];
    return o;
  }

  function blankEntry() {
    return { layouts: [null, null, null], active: 0 };
  }

  function cleanLayout(l) {
    if (!l || typeof l !== 'object') return null;
    var mods = Array.isArray(l.modules) ? l.modules : [];
    var out = [];
    for (var i = 0; i < mods.length; i++) {
      var p = mods[i];
      if (!p || !Data.module(p.moduleId)) continue;
      if (!(p.col >= 0) || !(p.row >= 0)) continue;
      out.push({ moduleId: p.moduleId, col: p.col | 0, row: p.row | 0 });
    }
    return { name: typeof l.name === 'string' ? l.name : '', modules: out };
  }

  /* Repair one profile in place. Everything a stale save can get wrong about a
     single pilot's game is fixed here, so migrate() only has to decide which
     shape the document is. */
  function fixProfile(pf) {
    if (!pf || typeof pf !== 'object') return freshProfile();
    var f = freshProfile(), k, i;

    if (!pf.prog || typeof pf.prog !== 'object') pf.prog = freshProgress();
    else {
      var fp = freshProgress(), pk;
      for (pk in fp) if (pf.prog[pk] === undefined) pf.prog[pk] = fp[pk];
      if (!(pf.prog.level >= 1)) pf.prog.level = 1;
      if (!pf.prog.ops || typeof pf.prog.ops !== 'object') pf.prog.ops = {};
    }

    pf.ships = (pf.ships && typeof pf.ships === 'object') ? pf.ships : {};
    for (k in pf.ships) {
      if (!Data.ship(k)) { delete pf.ships[k]; continue; }
      var en = pf.ships[k];
      if (!en || typeof en !== 'object') { pf.ships[k] = blankEntry(); continue; }
      if (!Array.isArray(en.layouts)) en.layouts = [null, null, null];
      en.layouts.length = SLOTS;
      for (i = 0; i < SLOTS; i++) en.layouts[i] = cleanLayout(en.layouts[i]);
      if (!(en.active >= 0 && en.active < SLOTS)) en.active = 0;
    }
    if (!Data.ship(pf.activeShip)) pf.activeShip = '';
    if (!pf.results || typeof pf.results !== 'object') pf.results = {};
    if (!Array.isArray(pf.beaten)) pf.beaten = [];
    if (!(pf.played >= 0)) pf.played = f.played;
    /* An older save has no speed at all, which is why this is repaired rather
       than versioned: a missing field is not a broken save. */
    if (!(pf.speed >= 0 && pf.speed < 3)) pf.speed = 0;
    return pf;
  }

  /* A stale save is repaired rather than trusted. v1 caught only a JSON parse
     error, so a structurally old save loaded fine and threw somewhere later. */
  function migrate(d) {
    if (!d || typeof d !== 'object') return fresh();
    var out = fresh(), i;

    if (d.v === 4 && d.pilots && typeof d.pilots === 'object') {
      PILOTS.forEach(function (p) {
        out.pilots[p.id] = fixProfile(d.pilots[p.id]);
      });
      out.lastPilot = out.pilots[d.lastPilot] ? d.lastPilot : PILOTS[0].id;
      /* Mute belongs to the document, not to a pilot: it is a property of the
         room the game is being played in, and switching brother should not
         turn the sound back on in a quiet house. */
      out.muted = !!d.muted;
      var hv = d.hullView && typeof d.hullView === 'object' ? d.hullView : {};
      for (var vk in HULL_VIEWS) {
        if (HULL_MODES[vk].indexOf(hv[vk]) >= 0) out.hullView[vk] = hv[vk];
      }
      return out;
    }

    /* v1 -> v2: every hangar that held a ship becomes that ship's layout 1.
       Done into a v3-shaped profile, which then becomes pilot one. */
    var pf = freshProfile();
    if (!d.v || d.v < 2) {
      var hangars = Array.isArray(d.hangars) ? d.hangars : [];
      for (i = 0; i < hangars.length; i++) {
        var h = hangars[i];
        if (!h || !h.shipId || !Data.ship(h.shipId)) continue;
        if (!pf.ships[h.shipId]) pf.ships[h.shipId] = blankEntry();
        var e = pf.ships[h.shipId], slot = 0;
        while (slot < SLOTS && e.layouts[slot]) slot++;
        if (slot < SLOTS) e.layouts[slot] = cleanLayout({ modules: h.modules });
        if (!pf.activeShip) pf.activeShip = h.shipId;
      }
      pf.results = (d.results && typeof d.results === 'object') ? d.results : {};
      pf.beaten  = Array.isArray(d.beaten) ? d.beaten : [];
    } else {
      /* v2/v3 -> v4: the one game that existed becomes the first pilot's, and
         the second pilot starts clean. Nothing already earned is taken away. */
      pf.prog = d.prog; pf.ships = d.ships; pf.activeShip = d.activeShip;
      pf.results = d.results; pf.beaten = d.beaten;
    }
    out.pilots[PILOTS[0].id] = fixProfile(pf);
    out.lastPilot = PILOTS[0].id;
    return out;
  }

  /* Nothing played yet, on any pilot: one ship, no layouts, level 1, no
     operations done. Used to decide whether a late-arriving save may replace
     what is already in memory. */
  function profileUntouched(pf) {
    if (!pf) return true;
    if (pf.prog.level > 1) return false;
    if (pf.prog.wins || pf.prog.losses) return false;
    for (var k in pf.prog.ops) return false;
    var keys = Object.keys(pf.ships);
    if (keys.length > 1) return false;
    for (var i = 0; i < keys.length; i++) {
      var e = pf.ships[keys[i]];
      for (var j = 0; j < SLOTS; j++) if (e.layouts[j]) return false;
    }
    return true;
  }
  function untouched() {
    if (!state) return true;
    for (var id in state.pilots) if (!profileUntouched(state.pilots[id])) return false;
    return true;
  }

  /* The starting hull. Cheapest flyable ship in tier 1 — Small Fighter, the
     only one the source data prices at zero alongside Heavy Fighter. */
  function seed(pf) {
    if (Object.keys(pf.ships).length) {
      if (!pf.activeShip) pf.activeShip = Object.keys(pf.ships)[0];
      return;
    }
    var first = Progress.tier(1).ships[0];
    if (!first) return;
    pf.ships[first.key] = blankEntry();
    pf.activeShip = first.key;
  }

  return {
    SLOTS: SLOTS,
    PILOTS: PILOTS,

    /* IndexedDB can fail to settle at all — a wedged database, storage
       pressure, a delete left pending by another tab — and arcade-store has no
       timeout, so `ready` never fires and the game sits on its loading screen
       forever. A black screen is the worst thing this can do to someone who
       just wanted to play, so we give the store six seconds (a cold cursor over
       every arcade game's items is not instant on a tablet) and then carry on
       in memory.

       If the store turns up after that, it is adopted rather than thrown away:
       when nothing has been played yet the stored save is loaded properly, and
       when it has, writing is simply switched back on so everything from that
       point survives. Either way the player is told which of the two happened
       instead of being quietly left with a session that evaporates. */
    ready: function (cb) {
      var settled = false, self = this;
      function go(d) {
        if (settled) return;
        settled = true;
        if (d) gen = d.gen || 0;
        state = migrate(d);
        for (var id in state.pilots) seed(state.pilots[id]);
        cur = state.pilots[state.lastPilot];
        cb(state);
      }
      var timer = setTimeout(function () { stalled = true; go(null); }, 6000);
      Store.ready(function () {
        clearTimeout(timer);
        if (!settled) { go(Store.get()); return; }
        /* late arrival */
        var d = Store.get();
        if (untouched()) {                       /* nothing played — adopt it */
          settled = false;
          go(d);
          stalled = false;
          recovered = 'loaded';
        } else {                                 /* keep the session, start saving */
          if (d) gen = d.gen || 0;
          stalled = false;
          recovered = 'saving';
          self.flush();
        }
      });
    },

    stalled: function () { return stalled; },
    /* '' while stalled, then 'loaded' or 'saving' once the store turned up. */
    recovered: function () { return recovered; },

    /* ---- pilots --------------------------------------------------------- */
    pilots: function () { return PILOTS; },
    pilot: function () { return state.lastPilot; },
    pilotName: function (id) {
      for (var i = 0; i < PILOTS.length; i++) if (PILOTS[i].id === id) return PILOTS[i].name;
      return id;
    },
    use: function (id) {
      if (!state.pilots[id]) return false;
      state.lastPilot = id;
      cur = state.pilots[id];
      seed(cur);
      return this.flush();
    },
    /* What the home screen puts on a pilot card, without reaching into the
       profile itself. `hull` is the ship they would fly right now. */
    summary: function (id) {
      var pf = state.pilots[id];
      if (!pf) return null;
      var ops = 0, k;
      for (k in pf.prog.ops) if (pf.prog.ops[k]) ops++;
      var ship = pf.activeShip && Data.ship(pf.activeShip);
      var tierN = ship ? Progress.tierOf(ship) : 1;
      var tier = Progress.tier(tierN);
      return {
        id: id, name: this.pilotName(id),
        level: pf.prog.level, ops: ops,
        wins: pf.prog.wins, losses: pf.prog.losses,
        started: !profileUntouched(pf),
        tier: tierN, tierName: tier ? tier.label : '',
        hull: ship ? ship.displayName : ''
      };
    },

    /* The current pilot's game. Named `get` because that is what it has always
       been to everything outside this file. */
    get: function () { return cur; },
    doc: function () { return state; },

    /* ---- ships ---------------------------------------------------------- */
    owned: function (key) { return !!cur.ships[key]; },
    ownedKeys: function () { return Object.keys(cur.ships); },
    unlockShip: function (key) {
      if (!Data.ship(key) || cur.ships[key]) return false;
      cur.ships[key] = blankEntry();
      var ok = this.flush();
      if (typeof Progress !== 'undefined' && Progress.data) Progress.recheck();
      return ok;
    },
    activeShip: function () { return cur.activeShip; },
    /* ---- match speed ----------------------------------------------------
       Per pilot, because one brother watches fights and the other skips them.
       Pause is deliberately NOT remembered: it is a thing you do during a
       match, not a way you like to watch them. */
    /* ---- sound ---------------------------------------------------------- */
    muted: function () { return !!state.muted; },
    setMuted: function (on) {
      on = !!on;
      if (state.muted === on) return false;
      state.muted = on;
      return this.flush();
    },

    /* ---- hull / modules ------------------------------------------------- */
    hullView: function (view) {
      return (state.hullView && state.hullView[view]) || HULL_VIEWS[view] || 'modules';
    },
    setHullView: function (view, v) {
      /* WHY DAMAGE NEVER STUCK. This guard was written when there were two
         views and it was never widened, so `setHullView('battle', 'damage')`
         returned false and saved nothing — every match opened on whatever was
         last written before DAMAGE existed. The allowed set per place is
         already declared in HULL_MODES; ask it rather than repeating it. */
      var modes = HULL_MODES[view];
      if (!modes || modes.indexOf(v) < 0) return false;
      if (!state.hullView) state.hullView = freshHullView();
      if (state.hullView[view] === v) return false;
      state.hullView[view] = v;
      return this.flush();
    },

    matchSpeed: function () { return cur.speed || 0; },
    setMatchSpeed: function (i) {
      if (!(i >= 0 && i < 3) || cur.speed === i) return false;
      cur.speed = i;
      return this.flush();
    },

    setActiveShip: function (key) {
      if (!cur.ships[key]) return false;
      cur.activeShip = key;
      return this.flush();
    },

    /* ---- layouts -------------------------------------------------------- */
    entry: function (key) { return cur.ships[key] || null; },
    layout: function (key, i) {
      var e = cur.ships[key];
      return e ? e.layouts[i] : null;
    },
    activeLayoutIndex: function (key) {
      var e = cur.ships[key];
      return e ? e.active : 0;
    },
    activeLayout: function (key) {
      var e = cur.ships[key];
      return e ? e.layouts[e.active] : null;
    },
    /* Replaces the array rather than mutating it — the v1 context mutated in
       place under a shallow spread, so the UI diffed an array against itself
       and rows never refreshed. */
    setLayout: function (key, i, layout) {
      var e = cur.ships[key];
      if (!e || i < 0 || i >= SLOTS) return false;
      e.layouts = e.layouts.map(function (l, j) {
        return j === i ? (layout ? cleanLayout(layout) : null) : l;
      });
      var ok = this.flush();
      /* Saving a layout is an event some operations watch — how many layouts a
         ship carries, and whether a hull has ever been filled to every cell.
         Hooked here rather than in the fitting screen so every path that saves
         a layout counts, including the editor. */
      if (typeof Progress !== 'undefined' && Progress.data) {
        Progress.recordFit({ kind: 'fit', shipId: key });
      }
      return ok;
    },
    setActiveLayoutIndex: function (key, i) {
      var e = cur.ships[key];
      if (!e || i < 0 || i >= SLOTS) return false;
      e.active = i;
      return this.flush();
    },
    cloneLayout: function (key, from, to) {
      var l = this.layout(key, from);
      if (!l) return false;
      return this.setLayout(key, to, { name: l.name, modules: l.modules.slice() });
    },

    /* ---- progression ---------------------------------------------------- */
    progress: function () { return cur.prog; },
    /* Wins in a row, reset by a loss. Read by the opponent generator — see
       `Opponents.skillNow`. */
    streak: function () { return (cur.prog && cur.prog.streak) || 0; },
    saveProgress: function () { return this.flush(); },

    /* Fold a finished battle into the running counters. Progress owns the
       conditions; Save owns the tallies, because they are what persists. */
    applyBattle: function (ev) {
      var p = cur.prog, k;
      if (!ev || ev.kind !== 'battle') return;
      if (ev.won) {
        p.wins += 1;
        p.streak += 1;
        if (p.streak > p.bestStreak) p.bestStreak = p.streak;
        p.hullWins[ev.shipId] = (p.hullWins[ev.shipId] || 0) + 1;
        p.wonHulls[ev.shipId] = 1;
        if (ev.oppTier === ev.hullTier) p.winsAtOwnTier += 1;
        k = String(ev.oppTier);
        p.streakAtTier[k] = (p.streakAtTier[k] || 0) + 1;
        if (p.streakAtTier[k] > (p.bestStreakAtTier[k] || 0))
          p.bestStreakAtTier[k] = p.streakAtTier[k];
        if (!p.tierHulls[k]) p.tierHulls[k] = [];
        if (p.tierHulls[k].indexOf(ev.shipId) < 0) p.tierHulls[k].push(ev.shipId);
      } else {
        p.losses += 1;
        p.streak = 0;
        p.streakAtTier[String(ev.oppTier)] = 0;
      }
    },

    /* A layout was saved: remember the most layouts on any one ship, and the
       largest hull ever filled to every cell. */
    applyFit: function (ev) {
      var p = cur.prog, e = ev && cur.ships[ev.shipId];
      if (!e) return;
      var n = 0, i;
      for (i = 0; i < SLOTS; i++) if (e.layouts[i] && e.layouts[i].modules.length) n++;
      if (n > p.maxLayouts) p.maxLayouts = n;
      var ship = Data.ship(ev.shipId);
      if (!ship) return;
      var cap = Geom.shipGrid(ship).capacity;
      for (i = 0; i < SLOTS; i++) {
        var l = e.layouts[i];
        if (!l) continue;
        var used = Geom.summarise(ship, l.modules, Data.modules).cellsUsed;
        if (used >= cap && cap > p.maxFilled) p.maxFilled = cap;
      }
    },

    /* ---- record --------------------------------------------------------- */
    recordResult: function (opponentId, won) {
      var r = cur.results[opponentId] || { wins: 0, losses: 0 };
      if (won) { r.wins++; if (cur.beaten.indexOf(opponentId) < 0) cur.beaten.push(opponentId); }
      else r.losses++;
      cur.results[opponentId] = r;
      return this.flush();
    },

    /* ---- the debug pilot --------------------------------------------------
       A fully-unlocked level-100 profile, in memory only: every hull claimed
       with a flyable autofit in slot one, every operation ticked, and the
       level at the top of the ladder. `sandbox` is latched on before anything
       is touched and never comes off, so `flush` returns without writing for
       the rest of the session — the real save on this machine is not altered,
       and reloading the page brings it straight back.

       It exists because the late game is a hundred levels away and nobody is
       playing through that to check a colour on a Kronos. */
    debugPilot: function () {
      sandbox = true;
      var prog = freshProgress();
      prog.level = Progress.maxLevel ? Progress.maxLevel() : 100;
      Progress.all().forEach(function (o) { prog.ops[o.id] = 1; });
      cur.prog = prog;
      cur.ships = {};
      Data.shipList.forEach(function (sh) {
        var e = blankEntry();
        e.layouts[0] = { modules: Autofit.build(sh, { seed: 1 }, Data.modules) };
        cur.ships[sh.key] = e;
      });
      cur.activeShip = Data.shipList[0].key;
      if (typeof Progress !== 'undefined' && Progress.data) Progress.recheck();
      return true;
    },
    debugging: function () { return sandbox; },

    flush: function () {
      if (sandbox) return true;                  /* the debug pilot is never written */
      if (stalled) return false;                 /* memory-only, nothing to write to */
      if (Store.conflict()) return false;        /* an older tab: stop writing */
      gen += 1;
      var out = {}, k;
      for (k in state) out[k] = state[k];
      out.gen = gen; out.sid = SID;
      Store.set(null, out, { guard: true });
      return true;
    },
    working: function () { return !stalled && Store.working(); },
    conflict: function () { return Store.conflict(); }
  };
})();
