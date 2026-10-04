/* store.js — ArcadeStore: localStorage's manners, IndexedDB's room.
 * Reference copy of games/dragonseed/js/store.js (see knowledge/arcade-store.md).
 *
 *   var Store = ArcadeStore("dragonseed");     // → keys "calebArcadeData:dragonseed*"
 *   Store.ready(function () {
 *     var save = Store.get();               // the game's own item
 *     Store.set(null, save);                // write it back
 *     Store.set("snaps", list);             // a second item, ":snaps"
 *   });
 *
 * TWO TABS
 * Pass {guard:true} on a value carrying `gen` (a counter that only goes up) and
 * `sid` (which tab wrote it) and the write is refused if the stored copy is
 * newer and came from another tab.
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

  var made = {};
  function ArcadeStore(ns) {
    if (made[ns || ""]) return made[ns || ""];
    var base = PREFIX + (ns ? ":" + ns : "");
    var cache = {}, dirty = {}, timer = null, loaded = false, readyQ = [];
    var conflict = null;

    function keyFor(sub) { return sub ? base + ":" + sub : base; }

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
            var got = st.get(k);
            got.onsuccess = function () {
              var was = got.result;
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
      conflict: function () { return conflict; },
      clearConflict: function () { conflict = null; },
      flush: flush
    };
    api.getItem = api.get; api.setItem = api.set; api.removeItem = api.remove;

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });

    made[ns || ""] = api;
    boot();
    return api;
  }

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
