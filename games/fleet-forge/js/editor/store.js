/* editor/store.js — the editor's working copy of the opponent roster.
 *
 * DEV TOOL, NOT A GAME SCREEN. This file is loaded by editor.html only. It is
 * never loaded by index.html and nothing in js/ outside js/editor/ knows it
 * exists.
 *
 * WHY THIS IS THE ONE PLACE IN FLEET FORGE THAT MAY USE localStorage
 * ARCHITECTURE.md says "never use localStorage" — that rule is about the
 * player's save, which lives in IndexedDB under `calebArcadeData:fleet-forge`
 * so a stale tab cannot clobber it. This is not a save. It is an hour of a
 * developer's typing that must survive an accidental refresh, on a page the
 * player never opens. It writes exactly two keys, both prefixed
 * `fleet-forge-editor:`, and it must never read or write anything beginning
 * `calebArcadeData` — touching the player's save from a tool would be the same
 * bug the IndexedDB rule exists to prevent.
 *
 * NO DOM IN HERE. Everything below runs under node in a vm sandbox, which is
 * how tools can check the import -> edit -> export round trip without a
 * browser. The storage object is injected, not reached for.
 */
var EditorStore = (function () {
  'use strict';

  var K_ROSTER = 'fleet-forge-editor:roster';
  var K_SEL    = 'fleet-forge-editor:selected';

  var store = null;          /* injected; null means "no persistence"        */
  var roster = [];
  var selected = 0;

  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---- shape ------------------------------------------------------------
   * Everything that comes in from a paste, a file or localStorage goes
   * through here. The roster is the contract tools/make-opponents.js writes
   * and js/opponents.js reads, so nothing else is allowed to reach it.
   */
  function cleanPlacement(p) {
    if (!p || typeof p !== 'object') return null;
    if (typeof p.moduleId !== 'string') return null;
    return { moduleId: p.moduleId, col: p.col | 0, row: p.row | 0 };
  }

  function cleanOpponent(o, i) {
    o = o || {};
    var mods = [], src = (o.ship && o.ship.modules) || [], j, p;
    for (j = 0; j < src.length; j++) { p = cleanPlacement(src[j]); if (p) mods.push(p); }
    return {
      id:    typeof o.id === 'string' && o.id ? o.id : ('opponent' + (i + 1)),
      name:  typeof o.name === 'string' && o.name ? o.name : 'Unnamed',
      blurb: typeof o.blurb === 'string' ? o.blurb : '',
      difficulty: Math.max(0, Math.round(Number(o.difficulty) || 0)),
      ship: { shipId: (o.ship && o.ship.shipId) || '', modules: mods }
    };
  }

  /* ---- persistence ------------------------------------------------------ */

  /* Every localStorage call is wrapped: private browsing throws on write, and
     a dev tool that dies because the quota is full is worse than one that
     silently stops remembering. */
  function put(key, val) {
    if (!store) return false;
    if (key.indexOf('fleet-forge-editor:') !== 0) return false;   /* belt and braces */
    try { store.setItem(key, val); return true; } catch (e) { return false; }
  }
  function get(key) {
    if (!store) return null;
    try { return store.getItem(key); } catch (e) { return null; }
  }

  function persist() {
    put(K_ROSTER, toJSON());
    put(K_SEL, String(selected));
  }

  function restore() {
    var raw = get(K_ROSTER);
    if (!raw) return false;
    var r = fromJSON(raw);
    if (!r.ok) return false;
    var s = parseInt(get(K_SEL), 10);
    selected = (isFinite(s) && s >= 0 && s < roster.length) ? s : 0;
    return true;
  }

  function forget() {
    if (!store) return;
    try { store.removeItem(K_ROSTER); store.removeItem(K_SEL); } catch (e) {}
  }

  /* ---- in and out ------------------------------------------------------- */

  function load(list) {
    roster = [];
    for (var i = 0; i < list.length; i++) roster.push(cleanOpponent(list[i], i));
    if (selected >= roster.length) selected = Math.max(0, roster.length - 1);
    return roster;
  }

  function fromJSON(txt) {
    var j;
    try { j = JSON.parse(txt); } catch (e) { return { ok: false, error: 'Not JSON — ' + e.message }; }
    var list = Array.isArray(j) ? j : j.opponents;
    if (!Array.isArray(list)) return { ok: false, error: 'No "opponents" array in that JSON' };
    load(list);
    return { ok: true, count: roster.length };
  }

  /* The same shape and the same indent tools/make-opponents.js writes, so a
     paste into data/opponents.json shows a clean diff. */
  function toJSON() {
    return JSON.stringify({ version: 1, opponents: roster }, null, 1);
  }

  /* ---- editing ---------------------------------------------------------- */

  function uniqueId(base) {
    var id = String(base || 'opponent').toLowerCase().replace(/[^a-z0-9_-]+/g, '') || 'opponent';
    var want = id, n = 2;
    while (byId(want) !== null) { want = id + n; n++; }
    return want;
  }

  function byId(id) {
    for (var i = 0; i < roster.length; i++) if (roster[i].id === id) return roster[i];
    return null;
  }

  function add(shipId) {
    var o = cleanOpponent({ id: uniqueId('newfoe'), name: 'New Opponent',
                            blurb: '', difficulty: roster.length + 1,
                            ship: { shipId: shipId, modules: [] }, ai: {} },
                          roster.length);
    roster.push(o);
    selected = roster.length - 1;
    return o;
  }

  function duplicate(i) {
    if (i < 0 || i >= roster.length) return null;
    var o = copy(roster[i]);
    o.id = uniqueId(roster[i].id);
    o.name = roster[i].name + ' copy';
    roster.splice(i + 1, 0, o);
    selected = i + 1;
    return o;
  }

  function remove(i) {
    if (i < 0 || i >= roster.length) return false;
    roster.splice(i, 1);
    if (selected >= roster.length) selected = Math.max(0, roster.length - 1);
    return true;
  }

  /* The list order IS the ladder order, so moving a row is a real edit. */
  function move(i, delta) {
    var j = i + delta;
    if (i < 0 || i >= roster.length || j < 0 || j >= roster.length) return i;
    var o = roster[i];
    roster.splice(i, 1);
    roster.splice(j, 0, o);
    if (selected === i) selected = j;
    return j;
  }

  /* ---- what the sim and the game want ----------------------------------- */

  /* Identical to Opponents.fitFor — the roster row is the fit. */
  function fitFor(o) {
    return { shipId: o.ship.shipId, modules: o.ship.modules };
  }

  /* Legality is Geom.validate's answer and nobody else's. The extra checks
     here are about the roster file, not about the fit: a duplicate id or a
     missing hull is a bad row even though the grid is fine. */
  function check(o) {
    var ship = o.ship.shipId ? Data.ship(o.ship.shipId) : null;
    var errs = [], v = null;
    if (!ship) {
      errs.push('No hull chosen');
    } else {
      v = Geom.validate(ship, o.ship.modules, Data.modules);
      for (var i = 0; i < v.errors.length; i++) errs.push(v.errors[i]);
    }
    if (!o.id) errs.push('Needs an id');
    if (!o.name) errs.push('Needs a name');
    return { ok: errs.length === 0, errors: errs, stats: v ? v.stats : null };
  }

  function checkAll() {
    var out = [], seen = {}, i;
    for (i = 0; i < roster.length; i++) {
      var r = check(roster[i]);
      if (seen[roster[i].id]) { r.errors.push('Duplicate id'); r.ok = false; }
      seen[roster[i].id] = true;
      out.push({ index: i, id: roster[i].id, ok: r.ok, errors: r.errors, stats: r.stats });
    }
    return out;
  }

  return {
    attach: function (s) { store = s; },
    persist: persist, restore: restore, forget: forget,
    load: load, fromJSON: fromJSON, toJSON: toJSON,
    get list() { return roster; },
    at: function (i) { return roster[i]; },
    byId: byId,
    get selected() { return selected; },
    select: function (i) { if (i >= 0 && i < roster.length) selected = i; return selected; },
    current: function () { return roster[selected] || null; },
    uniqueId: uniqueId,
    add: add, duplicate: duplicate, remove: remove, move: move,
    fitFor: fitFor, check: check, checkAll: checkAll, copy: copy
  };
})();
