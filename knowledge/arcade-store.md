# arcade-store — saves that live in IndexedDB

`localStorage` is **one quota of about five megabytes for the whole origin**,
shared by every game in the arcade at once. It is not five megabytes per key and
it is not five megabytes per game: one soundboard parking a megabyte of base64
in it, plus a shared blob that has grown to three, and *every other game's save
starts failing*. Worse, it fails silently — `setItem` throws, and almost every
game catches and shrugs, so the save simply stops happening and the player is
returned to an old state on the next reload with nothing to explain it.

IndexedDB is a different cupboard on the same origin, with hundreds of megabytes
in it, and nothing else in the arcade is using it.

**Every new game stores its saves in IndexedDB through `arcade-store.js`.**
Existing games keep localStorage; see the rule in
`.apm/instructions/arcade-build.instructions.md`.

## What it is

One file, no dependencies, about 230 lines. It gives you localStorage's manners
over IndexedDB: the whole namespace is read once at boot into memory, every
`get` after that is instant and synchronous, and writes go into memory and are
flushed behind you (120ms debounce, plus a flush on `pagehide` and on the tab
being hidden).

Keys are exactly what they were: `calebArcadeData:<gameName>` for the game's own
item, `calebArcadeData:<gameName>:<something>` for a second one.

## Using it

```html
<script src="js/arcade-store.js"></script>
```

```js
var Store = ArcadeStore("roadways");        // = calebArcadeData:roadways

Store.ready(function () {                   // the database has to be opened first
  var save = Store.get() || freshSave();    // the game's own item
  …
  Store.set(null, save);                    // write it back
  Store.set("replays", list);               // a second item, ":replays"
  Store.remove("replays");
});
```

Values are stored **as they are** — objects, arrays, strings — through
IndexedDB's structured clone. There is no `JSON.stringify` anywhere, and no cost
to storing something big.

| call | does |
|---|---|
| `Store.ready(cb)` | runs `cb` once the database is open and this game's items are in memory. Everything else assumes this has happened. |
| `Store.get(sub)` | the value, synchronously. `sub` omitted = the game's own item. |
| `Store.set(sub, value, opts)` | into memory now, into the database in a moment. |
| `Store.remove(sub)` | gone. |
| `Store.flush()` | write immediately (returns nothing; the store already does this on pagehide). |
| `Store.bytes(sub)` | roughly how big that item is. |
| `Store.working()` | false when there is no IndexedDB at all (a private window) — the game still runs, the save is just session-only. |
| `ArcadeStore.list(cb)` | every arcade item in the database, biggest first: `[{key, bytes}]`. For the hub's ⚙ panel. |
| `ArcadeStore.wipe(key, cb)` | delete one item by its full key. |

## Two tabs

An old tab left open on the same game still saves — when it renders, and again
when it is closed — and it writes the state *it* is holding. Reload the tab you
were actually playing in and you land on the other one's position. It is the
most confusing save bug there is, because nothing looks broken.

Give the saved object a `sid` (which tab wrote it) and a `gen` (a counter that
only goes up), pass `{guard: true}`, and a write is refused inside the
transaction when the stored copy is at least as new and came from a different
tab:

```js
var SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
var gen = 0;

function load() {
  var d = Store.get();
  if (d) gen = d.gen || 0;                 // carry on counting from what is stored
  return d;
}
function save(state) {
  if (Store.conflict()) return false;      // an older tab: stop writing, say so
  gen += 1;
  Store.set(null, Object.assign({ gen: gen, sid: SID }, state), { guard: true });
  return true;
}
```

`Store.conflict()` returns the record that beat you, so the game can tell the
player rather than silently doing nothing.

## Migration

The first time a game runs with the store, anything under its keys still sitting
in `localStorage` is imported into the database and then **removed from
localStorage** — the save survives and the arcade's shelf gets the space back.
Nothing else is touched.

## The hub

The hub's ⚙ panel lists `localStorage` keys. Games on the store will not appear
there; it wants a second list from `ArcadeStore.list()`. Until that is done,
"clear this game" for a store-backed game means clearing it from inside the game.

## The file

`games/potions/js/store.js` is the working copy and the reference
implementation. Copy it into `games/<name>/js/arcade-store.js` and change
nothing.

```js
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
```
