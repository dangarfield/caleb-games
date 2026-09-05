/* store.js — ArcadeStore: localStorage's manners, IndexedDB's room.
 *
 * WHY THIS EXISTS
 * localStorage is ONE quota of about five megabytes for the whole origin,
 * shared by every game in the arcade at once. When a soundboard parks a
 * megabyte of base64 in it and the shared blob grows to three, every other
 * game's save starts failing — silently, because setItem throws and most code
 * catches and shrugs. IndexedDB is a different cupboard with hundreds of
 * megabytes in it and nobody else in the arcade is using it.
 *
 * WHAT IT LOOKS LIKE
 * The same keys and the same shape of call as before. IndexedDB is
 * asynchronous, so the whole namespace is read once at boot into memory and
 * every get after that is instant; writes go into memory and are flushed
 * behind you. Nothing else in a game has to know.
 *
 *   var Store = ArcadeStore("potions");     // → keys "calebArcadeData:potions*"
 *   Store.ready(function () {
 *     var save = Store.get();               // the game's own item
 *     Store.set(null, save);                // write it back
 *     Store.set("snaps", list);             // a second item, ":snaps"
 *   });
 *
 * Values are stored as they are — objects, arrays, strings — so there is no
 * JSON.stringify anywhere and no cost to storing something big.
 *
 * TWO TABS
 * Pass {guard:true} on a value carrying `gen` (a counter that only goes up) and
 * `sid` (which tab wrote it) and the write is refused if the stored copy is
 * newer and came from another tab. That is what stops an old tab left open at
 * the start of a day from writing over the tab you are playing in.
 */

var ArcadeStore = (function () {

  var DB_NAME = "arcade", DB_STORE = "kv", DB_VER = 1;
  var PREFIX  = "calebArcadeData";
  var db = null, dbState = "cold", waiting = [];   // cold | opening | open | off

  function open(then) {
    if (dbState === "open") return then(db);
    if (dbState === "off")  return then(null);
    waiting.push(then);
    if (dbState === "opening") return;
    dbState = "opening";
    var req;
    try { req = indexedDB.open(DB_NAME, DB_VER); }
    catch (e) { return done(null); }
    req.onupgradeneeded = function () {
      try { req.result.createObjectStore(DB_STORE); } catch (e) {}
    };
    req.onsuccess  = function () { db = req.result; done(db); };
    req.onerror    = function () { done(null); };
    req.onblocked  = function () { done(null); };
    function done(handle) {
      dbState = handle ? "open" : "off";
      var q = waiting; waiting = [];
      q.forEach(function (f) { try { f(handle); } catch (e) {} });
    }
  }

  /* One instance per game, however many times it is asked for: two caches over
     the same keys would drift apart within a minute. */
  var made = {};
  function ArcadeStore(ns) {
    if (made[ns || ""]) return made[ns || ""];
    var base = PREFIX + (ns ? ":" + ns : "");
    var cache = {}, dirty = {}, timer = null, loaded = false, readyQ = [];
    var conflict = null;

    function keyFor(sub) { return sub ? base + ":" + sub : base; }

    /* Everything for this game, in one pass, plus anything still sitting in the
       old localStorage home — imported and then taken off that shelf, which is
       both the migration and a favour to every other game. */
    function boot() {
      open(function (handle) {
        if (!handle) return finish();
        var tx, req;
        try {
          tx = handle.transaction(DB_STORE, "readonly");
          req = tx.objectStore(DB_STORE).openCursor();
        } catch (e) { return finish(); }
        req.onsuccess = function () {
          var c = req.result;
          if (c) {
            if (String(c.key).indexOf(base) === 0) cache[c.key] = c.value;
            c.continue();
            return;
          }
          finish();
        };
        req.onerror = function () { finish(); };
      });

      function finish() {
        migrate();
        loaded = true;
        var q = readyQ; readyQ = [];
        q.forEach(function (f) { try { f(api); } catch (e) {} });
      }
    }

    function migrate() {
      var moved = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k || k.indexOf(base) !== 0) continue;
          if (!(k in cache)) {
            var raw = localStorage.getItem(k), v = raw;
            try { v = JSON.parse(raw); } catch (e) {}
            cache[k] = v; dirty[k] = 1;
          }
          moved.push(k);
        }
        moved.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* no localStorage at all is fine */ }
      if (moved.length) flushSoon();
    }

    function flushSoon() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 120);
    }
    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      var keys = Object.keys(dirty);
      if (!keys.length) return;
      dirty = {};
      open(function (handle) {
        if (!handle) return;
        var tx;
        try { tx = handle.transaction(DB_STORE, "readwrite"); }
        catch (e) { return; }
        var st = tx.objectStore(DB_STORE);
        keys.forEach(function (k) {
          var v = cache[k];
          if (v === undefined) { try { st.delete(k); } catch (e) {} return; }
          if (v && v.__guard) {
            /* compare-and-set: an older tab must not win */
            var got = st.get(k);
            got.onsuccess = function () {
              var was = got.result;
              /* >= not >: two tabs that loaded the same save hold the same
                 counter, so the second one to write is the stale one */
              if (was && was.sid && was.sid !== v.sid && (was.gen || 0) >= (v.gen || 0)) {
                conflict = was;
                return;
              }
              try { st.put(strip(v), k); } catch (e) {}
            };
            return;
          }
          try { st.put(v, k); } catch (e) {}
        });
      });
    }
    function strip(v) {
      var o = {};
      Object.keys(v).forEach(function (k) { if (k !== "__guard") o[k] = v[k]; });
      return o;
    }

    var api = {
      /* call this before reading anything */
      ready: function (cb) {
        if (loaded) { if (cb) cb(api); return; }
        if (cb) readyQ.push(cb);
        if (dbState === "cold" || dbState === "opening" || dbState === "open") boot();
      },
      isReady:  function () { return loaded; },
      working:  function () { return dbState !== "off"; },
      get:      function (sub) { return cache[keyFor(sub)]; },
      set:      function (sub, value, opts) {
        var k = keyFor(sub);
        if (opts && opts.guard && value) value.__guard = 1;
        cache[k] = value; dirty[k] = 1;
        flushSoon();
        return true;
      },
      remove:   function (sub) {
        var k = keyFor(sub);
        cache[k] = undefined; dirty[k] = 1; flushSoon();
      },
      bytes:    function (sub) {
        try { return JSON.stringify(cache[keyFor(sub)] || "").length; } catch (e) { return -1; }
      },
      /* the last write this store refused, and who beat it to it */
      conflict: function () { return conflict; },
      clearConflict: function () { conflict = null; },
      flush: flush
    };
    /* localStorage's own names, for code being moved over */
    api.getItem = api.get; api.setItem = api.set; api.removeItem = api.remove;

    /* nothing is lost to a closing tab */
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });

    made[ns || ""] = api;
    boot();
    return api;
  }

  /* For the hub: every arcade item in the database, biggest first. */
  ArcadeStore.list = function (then) {
    open(function (handle) {
      if (!handle) return then([]);
      var out = [], req;
      try { req = handle.transaction(DB_STORE, "readonly").objectStore(DB_STORE).openCursor(); }
      catch (e) { return then([]); }
      req.onsuccess = function () {
        var c = req.result;
        if (c) {
          var n = -1;
          try { n = JSON.stringify(c.value).length; } catch (e) {}
          out.push({ key: String(c.key), bytes: n });
          c.continue();
          return;
        }
        out.sort(function (a, b) { return b.bytes - a.bytes; });
        then(out);
      };
      req.onerror = function () { then([]); };
    });
  };
  ArcadeStore.wipe = function (key, then) {
    open(function (handle) {
      if (!handle) return then && then(false);
      try {
        var tx = handle.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = function () { then && then(true); };
      } catch (e) { then && then(false); }
    });
  };

  return ArcadeStore;
})();
