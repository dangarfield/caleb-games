/* engine.js — state, persistence, the drag controller, and the region registry.
 * No game content and no markup beyond tiny DOM helpers.
 *
 * What changed from the previous build, and why:
 *   - drop zones are CLEARED at the top of every render. They used to be
 *     appended inside the region render functions, so the array grew by three
 *     every frame and held references to detached nodes forever.
 *   - save() now persists the whole session (day, discoveries, leads, partial
 *     reveals, desk layout, flags), not just the score. Reloading mid-puzzle
 *     used to keep your finished labels and silently bin your working notes.
 *   - confusion has a consequence: at the cap the day ends and the remaining
 *     visitors go home. No "game over" screen, but not free either.
 *   - there are no quantities. A visitor buys a dose made from the plant, not
 *     the plant, so a pot never empties. What is scarce is KNOWING things:
 *     which specimens you have found, and which of them you can name.
 *   - the desk holds one specimen at a time. Six pots scattered on a workspace
 *     was clutter; one specimen under the lens is the actual gesture.
 *   - naming a specimen wrongly costs a pip of confusion and crosses that page out
 *     for the rest of the day, so you cannot tap your way down the list.
 */

const Engine = (function () {

  var BUILD     = "84";   // bumped on every deploy, shown in the saves panel
  var SAVE_KEY  = "calebArcadeData:dragonseed";   // the store's own key; see js/store.js
  var Store     = ArcadeStore("dragonseed");
  var SAVE_VER  = 5;   // pots and pages came apart; no old save maps onto this
  var MUDDLE_CAP = 3;

  var state = null;

  function freshState() {
    /* A POT is stock and a PAGE is knowledge, and they are separate things to
     * own. You need the page to know what you are holding and the pot to hand
     * any of it over. Gathering fills the shelf with pots you cannot name;
     * Hester's loose leaves come back a place at a time and turn them into
     * things you can put in somebody's hands. Nothing is sold — a visitor
     * asks and you give — so what is scarce is knowing, not coin. */
    var pots = {}, pages = {};
    SPECIMENS.forEach(function (s) {
      if (s.pot)  pots[s.id]  = true;
      if (s.page) pages[s.id] = true;
    });
    var known = {};
    HABITATS.forEach(function (h) { if (h.known) known[h.id] = true; });
    return {
      ver: SAVE_VER,
      dayIndex: 0,
      visitorIndex: 0,
      dayOver: false,
      finished: false,
      served: 0,
      confusion: 0,
      pots: pots,               // { specimenId: true } - a cutting on the shelf
      pages: pages,             // { specimenId: true } - an entry in the book
      papers: [],               // ids of the notes in the drawer, oldest first
      papersRead: {},           // { paperId: true }
      openPaper: null,          // the one opened out in the drawer
      noteAt: {},               // { paperId: {x,y} } where you have shoved it, 0..1 of the drawer
      deskView: "bench",        // "bench" | "drawer"
      prologue: 0,              // which opening panel; -1 once you are past them
      eggFed: {},               // { day: true } - nights the egg settled
      opened: {},               // { habitatId: true } - doors you have got through
      mapPlace: null,           // the shut place the map panel is asking you about
      knownHabitats: known,     // { habitatId: true }  - located on the map
      leads: {},                // { habitatId: true }  - told about, not yet found
      identified: {},           // { specimenId: true } - you know its name
      revealed: {},             // { specimenId: { axis: value } } - lens work
      wrongPages: {},           // { specimenId: { entryId: true } } - crossed out today
      rite: null,               // the six runes, when confusion has filled
      onDesk: null,             // the one specimen under the lens
      look: null,               // the look-closer lightbox: [{id, mode}]
      shelfBig: false,          // the shelves, opened out across the bench
      easyPlants: false,        // draw the painted plants in the book, not the plates
      overlay: null,            // null | "book" | "map"
      bookSpread: 0,        // 0 = the front of the book (the index)
      notes: {},            // { specimenId: { axis: value } } - filed per specimen
      bookQuery: "",
      bookEffect: "",       // browse the book by what a plant is used for
      tripsToday: 0,        // you can go out as often as you like; coming back
                            // empty-handed is what costs you
      flags: {},                // fork choices, for the ending
      coach: 0,             // walkthrough step on day one's first customer; -1 = done
      mapCoach: 0,          // the second walkthrough, on day two, for the map
      clueCoach: 0,         // the third, on day three, for the drawer
      bookPick: null,       // the index entry you last turned to, for the walkthrough
      recipe: null,         // { vid, got:[specimenId] } - a request being filled in parts
      evening: false,       // the card between the last customer and tomorrow
      eveningReply: null,   // { title, body, artId } - the second panel of that card
      eggPick: null,        // the cutting you have picked up but not handed over yet
      eveningsSeen: {},     // { day: true }
      items: [],            // things people have handed you that are not plants
      ending: null,         // which of the three you took
      log: [],
      message: "",
      messageKind: "",
      debug: false,         // the state timeline, open over everything
      modal: null           // transient; never saved
    };
  }

  /* ---------------- persistence ---------------- */
  var saveTimer = null;
  /* THE GAME SAVE IS SACRED. Two things were quietly eating it:
   *
   * 1. A SECOND TAB. An older copy of the shop left open somewhere still saves
   *    — when it renders, and again when it is closed — and it writes the state
   *    it is holding, which is wherever that tab was left. Reload the tab you
   *    were actually playing and you land on the other one's day. Every save
   *    now carries the id of the tab that wrote it and a counter that only goes
   *    up, and a tab refuses to write over a newer save from a different tab.
   *
   * 2. NO ROOM. The browser gives one origin a few megabytes for everything.
   *    setItem throws when it is full, the old code caught that and shrugged,
   *    and from then on the game was writing nothing at all — so a reload
   *    returned you to the last write that fit. The saved states (a debugging
   *    tool) are the fat in the drawer, so if the game save will not fit they
   *    are thrown out on the spot to make room for it.
   */
  var SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  var gen = 0;                     // this tab's save counter
  var saveNote = "";               // why the last write did not go as planned
  var saveAt = 0;                  // when the last write landed
  var savedBytes = 0;

  /* Both the save and the saved states live in the browser's DATABASE now, not
   * on the five-megabyte shelf every game in the arcade shares — see
   * js/store.js. The store is a cache in front of it, so this stays as
   * synchronous as it ever was; the write lands a moment later. */
  function save() {
    var beaten = Store.conflict();
    if (beaten && beaten.sid !== SID) {
      if (saveNote !== "othertab") {
        saveNote = "othertab";
        setMessage("Another copy of the shop is open in a different tab. "
                 + "This one has stopped saving so it cannot overwrite it.", "warn");
      }
      return false;
    }
    gen += 1;
    var snap = { gen: gen, sid: SID };
    var TRANSIENT = { modal: 1, look: 1, shelfBig: 1, noteAt: 1, eggPick: 1 };   // ways of looking, not places you are
    Object.keys(state).forEach(function (k) { if (!TRANSIENT[k]) snap[k] = state[k]; });
    Store.set(null, snap, { guard: true });
    saveNote = ""; saveAt = Date.now(); savedBytes = Store.bytes();
    return true;
  }
  function saveInfo() {
    return { sid: SID, gen: gen, note: saveNote, at: saveAt, bytes: savedBytes,
             snapBytes: Store.bytes("snaps") };
  }
  /* Everything the browser is holding for this origin, biggest first. When the
   * cupboard is full it is usually not this game that filled it — every game in
   * the arcade shares one shelf, and this is the only way to see who is on it. */
  function storageUse() {
    var out = [], total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var n = (localStorage.getItem(k) || "").length + k.length;
        out.push({ key: k, bytes: n });
        total += n;
      }
    } catch (e) { return { total: -1, keys: [] }; }
    out.sort(function (a, b) { return b.bytes - a.bytes; });
    return { total: total, keys: out.slice(0, 6) };
  }
  function saveSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; save(); }, 250);
  }
  function load() {
    try {
      var d = Store.get();
      if (!d || d.ver !== SAVE_VER) return false;         // old save, start clean
      gen = d.gen || 0;                     // carry on counting from what is stored
      savedBytes = Store.bytes();
      var f = freshState();
      Object.keys(f).forEach(function (k) { if (k in d) f[k] = d[k]; });
      state = f;
      return true;
    } catch (e) { return false; }
  }
  function reset() { state = freshState(); snaps = []; saveSnaps(); save(); render(); }

  /* ---------------- the state timeline ----------------
   * The game saves itself at the start of every customer: the whole of state,
   * as it stood when they walked in. Click the day in the top bar for the list
   * of saves; click one and the game goes back to it, and every save after it
   * is deleted, because that run no longer happened. That last part is the
   * point — replaying day 9 five times without it leaves five contradictory
   * futures in one save file. Debugging only. */
  var SNAP_CAP = 1200;                  // sixteen days of everything, with room over
  var BASE_EVERY = 20;                  // a whole state this often; the rest are diffs
  var snaps = [];

  /* The day log is the one part of state that changes on EVERY action and is
   * forty lines long, so keeping it turned each diff into three kilobytes and
   * a full game into a megabyte. It is not worth a byte here: nothing about
   * going back to a moment depends on the log of how you got there. */
  var SNAP_SKIP = { modal: 1, debug: 1, log: 1, message: 1, messageKind: 1 };

  /* ---- and the rest, packed to nothing ----
   *
   * Five keys were 90% of the weight, and all five are the same shape: a fact
   * about each of the 82 plants. `{"n128":true,"n052":true,…}` is a kilobyte to
   * say what eighty-two BITS say, and `revealed` — which axes of which plant you
   * have looked at — was rewriting eight kilobytes of plant values every time
   * you named something, when the values are the plant's own and were never
   * worth storing at all.
   *
   * So: a set of plants becomes a bitmask, base64, 16 characters. Revealed and
   * filed axes become one byte per plant, 112 characters, and the values come
   * back off the specimen when the save is opened. A full sixteen-day game went
   * from 495KB to under 100KB. */
  var PACK_SET  = ["pots", "pages", "identified"];
  var PACK_AXES = ["revealed", "notes"];
  var SNAP_IDS = null, SNAP_IX = null;
  function snapIds() {
    if (!SNAP_IDS) {
      SNAP_IDS = SPECIMENS.map(function (s) { return s.id; });
      SNAP_IX = {};
      SNAP_IDS.forEach(function (id, i) { SNAP_IX[id] = i; });
    }
    return SNAP_IDS;
  }
  function toB64(a) {
    var out = "";
    for (var i = 0; i < a.length; i++) out += String.fromCharCode(a[i]);
    return btoa(out);
  }
  function fromB64(str) {
    var raw; try { raw = atob(str || ""); } catch (e) { return []; }
    var a = [];
    for (var i = 0; i < raw.length; i++) a.push(raw.charCodeAt(i));
    return a;
  }
  function packSet(obj) {
    snapIds();
    var a = [], n = Math.ceil(SNAP_IDS.length / 8), i;
    for (i = 0; i < n; i++) a.push(0);
    Object.keys(obj || {}).forEach(function (id) {
      var at = SNAP_IX[id];
      if (at !== undefined && obj[id]) a[at >> 3] |= (1 << (at & 7));
    });
    return toB64(a);
  }
  function unpackSet(str) {
    snapIds();
    var a = fromB64(str), out = {};
    SNAP_IDS.forEach(function (id, i) {
      if ((a[i >> 3] || 0) & (1 << (i & 7))) out[id] = true;
    });
    return out;
  }
  function packAxes(map) {
    snapIds();
    var a = SNAP_IDS.map(function () { return 0; });
    Object.keys(map || {}).forEach(function (id) {
      var at = SNAP_IX[id];
      if (at === undefined) return;
      AXES.forEach(function (ax, b) { if (ax in (map[id] || {})) a[at] |= (1 << b); });
    });
    return toB64(a);
  }
  function unpackAxes(str) {
    snapIds();
    var a = fromB64(str), out = {};
    SNAP_IDS.forEach(function (id, i) {
      var m = a[i] || 0;
      if (!m) return;
      var sp = Clues.specimenById(id), o = {};
      AXES.forEach(function (ax, b) { if (m & (1 << b)) o[ax] = sp[ax]; });
      out[id] = o;
    });
    return out;
  }

  function snapClone() {
    var o = {};
    Object.keys(state).forEach(function (k) { if (!SNAP_SKIP[k]) o[k] = state[k]; });
    o = JSON.parse(JSON.stringify(o));
    PACK_SET.forEach(function (k) { o[k] = packSet(state[k]); });
    PACK_AXES.forEach(function (k) { o[k] = packAxes(state[k]); });
    return o;
  }
  function snapExpand(d) {
    var o = {};
    Object.keys(d).forEach(function (k) { o[k] = d[k]; });
    PACK_SET.forEach(function (k) { if (typeof o[k] === "string") o[k] = unpackSet(o[k]); });
    PACK_AXES.forEach(function (k) { if (typeof o[k] === "string") o[k] = unpackAxes(o[k]); });
    return o;
  }

  /* Saving the WHOLE of state three hundred times over runs to three megabytes
   * and starts losing the early days to the storage quota, which is exactly the
   * thing you wanted the saves for. Consecutive saves differ in two or three
   * top-level keys, so every twentieth save is whole and the rest record only
   * what changed since the one before. Rebuilding walks back to the nearest
   * whole one and replays forward. */
  function diffOf(prev, now) {
    var d = {}, x = [];
    Object.keys(now).forEach(function (k) {
      if (JSON.stringify(prev[k]) !== JSON.stringify(now[k])) d[k] = now[k];
    });
    Object.keys(prev).forEach(function (k) { if (!(k in now)) x.push(k); });
    return { d: d, x: x };
  }
  function stateAt(i) {
    var base = i;
    while (base >= 0 && !snaps[base].state) base -= 1;
    if (base < 0) return null;                       // corrupt; nothing to rebuild from
    var out = JSON.parse(JSON.stringify(snaps[base].state));
    for (var k = base + 1; k <= i; k++) {
      var s = snaps[k];
      (s.x || []).forEach(function (key) { delete out[key]; });
      Object.keys(s.d || {}).forEach(function (key) { out[key] = s.d[key]; });
    }
    return out;
  }
  /* Kept small ON PURPOSE. These are a debugging convenience sharing one small
   * cupboard with the thing that actually matters, so the whole list is held to
   * one megabyte. When it grows past that the middle is thinned —
   * never the ends — keeping the first save of every day and the last eighty,
   * so "go back to day two" survives however long the game runs. */
  var MAX_SNAP_BYTES = 1000000;
  var KEEP_NEWEST = 80;

  /* Removing a save from the middle would orphan the diff that leans on it, so
     what it changed is folded forward into the next one first. */
  function dropAt(i) {
    if (i < 0 || i >= snaps.length - 1) return false;
    var a = snaps[i], b = snaps[i + 1];
    if (a.state) {
      var full = stateAt(i + 1);
      if (!full) return false;
      b.state = full; delete b.d; delete b.x;
    } else {
      var d = {}, x = (a.x || []).slice();
      Object.keys(a.d || {}).forEach(function (k) { d[k] = a.d[k]; });
      Object.keys(b.d || {}).forEach(function (k) {
        d[k] = b.d[k];
        var at = x.indexOf(k); if (at >= 0) x.splice(at, 1);
      });
      (b.x || []).forEach(function (k) { delete d[k]; if (x.indexOf(k) === -1) x.push(k); });
      b.d = d;
      if (x.length) b.x = x; else delete b.x;
    }
    snaps.splice(i, 1);
    return true;
  }
  function thin() {
    for (var pass = 0; pass < 12; pass++) {
      if (JSON.stringify(snaps).length <= MAX_SNAP_BYTES) return;
      var firstOfDay = {}, i;
      for (i = 0; i < snaps.length; i++)
        if (!(snaps[i].day in firstOfDay)) firstOfDay[snaps[i].day] = i;
      var keep = {};
      Object.keys(firstOfDay).forEach(function (d) { keep[firstOfDay[d]] = 1; });
      for (i = Math.max(0, snaps.length - KEEP_NEWEST); i < snaps.length; i++) keep[i] = 1;
      var dropped = 0, every = 0;
      for (i = snaps.length - 2; i >= 0; i--) {
        if (keep[i]) continue;
        if ((every++ % 2) === 0 && dropAt(i)) dropped++;
      }
      if (!dropped) return;                 // nothing left that may go
    }
  }

  /* If the browser refuses the write, the saves you already have MUST NOT be
   * thrown away — an earlier version shed the oldest third of the list to make
   * room, which quietly deleted day one, which is the day you most want back.
   * The list in memory is left whole and only what gets written to disk is
   * trimmed, newest first, so this session keeps everything either way. */
  /* ---- where the saved states live ----
   *
   * The same database as the save, under ":snaps" — see js/store.js. They used
   * to sit in localStorage, where a full shelf meant the game save could only
   * be written by throwing them out, which is what kept deleting day one. */
  var snapsTrimmed = 0;

  function saveSnaps() {
    thin();
    Store.set("snaps", snaps);
    return true;
  }
  function forgetSnapsOnDisk() { Store.remove("snaps"); }
  function snapsOnDisk() { return Store.working() ? snapsTrimmed : -1; }
  function snapsWhere() { return Store.working() ? "the browser's database" : "this session only"; }

  /* Dropping from the head would orphan the diffs that lean on a whole save
     inside what was dropped, so the new head is rebuilt whole first. */
  function shedOldest(n) {
    if (n <= 0 || n >= snaps.length) { snaps = []; return; }
    var rebuilt = stateAt(n);
    snaps = snaps.slice(n);
    if (rebuilt) { snaps[0].state = rebuilt; delete snaps[0].d; delete snaps[0].x; }
    else snaps = [];
  }
  /* One-letter keys and nothing that is zero. Three hundred rows of
     "served":0,"confusion":0,"doors":0,"papers":0 is real weight when the cupboard
     is this small; `of` comes back off DAYS at read time. */
  function takeSnap(label, byHand) {
    var d = today(), v = visitor();
    var text = label || (v && v.name) || "";
    /* the same customer walking in twice is one arrival, however many times
       the code that greets them runs */
    var last = snaps[snaps.length - 1];
    if (!byHand && last && last.day === (d ? d.day : 0)
        && last.n === state.visitorIndex + 1 && last.l === text) return;
    var now = snapClone();
    var row = { t: Math.round(Date.now() / 1000), day: d ? d.day : 0,
                n: state.visitorIndex + 1, l: text };
    if (byHand) row.h = 1;
    if (state.served) row.s = state.served;
    if (state.confusion) row.r = state.confusion;
    var pots = Object.keys(state.pots).length,
        pages = Object.keys(state.pages).length,
        named = Object.keys(state.identified).length,
        doors = Object.keys(state.opened).length,
        papers = (state.papers || []).length;
    if (pots)   row.p = pots;
    if (pages)  row.g = pages;
    if (named)  row.m = named;
    if (doors)  row.o = doors;
    if (papers) row.w = papers;
    var prev = snaps.length ? stateAt(snaps.length - 1) : null;
    if (!prev || snaps.length % BASE_EVERY === 0) row.state = now;
    else {
      var diff = diffOf(prev, now);
      row.d = diff.d;
      if (diff.x.length) row.x = diff.x;
    }
    snaps.push(row);
    if (snaps.length > SNAP_CAP) shedOldest(snaps.length - SNAP_CAP);
    saveSnaps();
  }
  /* ONE save per customer, taken as they walk in, and nothing else automatic.
   * Saving after every action as well produced four or five near-identical
   * lines per visitor, which made the list harder to read than the game was to
   * replay. `Save now` in the panel is the manual exception. */
  function arrive(v) { applyVisitorGrants(v); takeSnap(v && v.name); }


  function snapList() {
    return snaps.map(function (s, i) {
      var d = DAYS[(s.day || 1) - 1];
      return { i: i, day: s.day, n: s.n, of: d ? d.visitors.length : 0,
               label: s.l || "", at: (s.t || 0) * 1000, hand: !!s.h,
               served: s.s || 0, confusion: s.r || 0, pots: s.p || 0, pages: s.g || 0,
               named: s.m || 0, doors: s.o || 0, papers: s.w || 0 };
    });
  }
  function snapCount() { return snaps.length; }
  function rewind(i) {
    if (i < 0 || i >= snaps.length) return;
    var f = freshState(), packed = stateAt(i);
    if (!packed) return;
    var d = snapExpand(packed);
    Object.keys(f).forEach(function (k) { if (k in d) f[k] = d[k]; });
    state = f;
    snaps = snaps.slice(0, i + 1);      // the futures after this one never happened
    state.debug = false;
    state.modal = null;
    saveSnaps(); save(); render();
  }
  function clearSnaps() { snaps = []; forgetSnapsOnDisk(); render(); }
  function openDebug(on) { state.debug = !!on; render(); }

  /* ---------------- DOM helpers ---------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function btn(cls, label, onClick, aria) {
    var b = el("button", cls, label);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(e); });
    return b;
  }

  /* ---------------- derived ---------------- */
  function today()        { return DAYS[state.dayIndex]; }
  function visitor()      { var d = today(); return d && d.visitors[state.visitorIndex] || null; }
  function hasPot(id)     { return !!(state.pots && state.pots[id]); }
  function hasPage(id)    { return !!(state.pages && state.pages[id]); }
  function isDiscovered(id) { return hasPot(id); }        // "is it on the shelf"
  function isIdentified(id) { return !!state.identified[id]; }
  function onDesk(id)     { return state.onDesk === id; }
  function shelfList()    { return SPECIMENS.filter(function (s) { return hasPot(s.id); }); }
  /* The book shows every page you hold, including the ones you have no cutting
   * for — an empty page is a place to go, because it says where it grows. */
  function bookList()     { return SPECIMENS.filter(function (s) { return hasPage(s.id); }); }
  function habitatAt(cell){ return HABITATS.find(function (h) { return h.cell === cell; }) || null; }
  function habitatsToday(){ return HABITATS.filter(exists); }
  function isLocated(id)  { return !!(state.knownHabitats && state.knownHabitats[id]); }
  function isLead(id)     { return !!(state.leads && state.leads[id]); }
  function openLeads()    { return HABITATS.filter(function (h) { return isLead(h.id); }); }

  /* ---------------- messages ---------------- */
  var msgTimer = null;
  function setMessage(text, kind, sticky) {
    state.message = text || "";
    state.messageKind = kind || "";
    if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
    if (text && !sticky) msgTimer = setTimeout(function () {
      msgTimer = null;
      if (state.message === text) { state.message = ""; render(); }
    }, 5200);
    render();
  }
  function clearMessage() { setMessage(""); }

  /* ---------------- announcements ----------------
   * The strip along the top is easy to miss, and the things worth not missing
   * are the ones with consequences: a visitor served or turned away, a plant
   * named or mis-named, something found. Those get a modal as well as the
   * strip. Small corrections ("you have already been out today") stay on the
   * strip alone — a dialog for every nudge would be exhausting.
   *
   * `then` runs when the modal is dismissed, which is how a served visitor
   * waits for you rather than being swept away by a timer.
   */
  function announce(o) {
    setMessage(o.strip || o.title, o.kind);
    state.modal = o;
    saveSoon(); render();
  }
  function showModal(o) { state.modal = o; render(); }
  function closeModal() {
    var m = state.modal;
    if (m && m.kind === "rite") return;          // the only way out is to finish it
    state.modal = null;
    if (m && typeof m.then === "function") m.then();
    /* a rite laid out while another card was up now takes the floor */
    if (state.rite && !state.modal) state.modal = { kind: "rite" };
    saveSoon(); render();
  }
  function pushLog(line) { state.log.unshift(line); state.log = state.log.slice(0, 40); }

  /* ---------------- the desk: one specimen at a time ---------------- */
  /* The bench and the drawer are the same piece of furniture seen two ways, so
     standing a pot on the desk shuts the drawer — otherwise the specimen you
     just picked is behind a pile of paper. */
  function placeOnDesk(id) {
    if (!isDiscovered(id)) return;
    if (state.deskView === "drawer") { state.deskView = "bench"; state.openPaper = null; }
    state.onDesk = id;
    if (!state.revealed[id]) state.revealed[id] = {};
    if (isIdentified(id)) revealAll(id);
    saveSoon(); render();
  }
  function returnToShelf(id) {
    if (id && state.onDesk !== id) return;
    state.onDesk = null;
    saveSoon(); render();
  }
  function clearDesk() { state.onDesk = null; saveSoon(); render(); }
  var select = placeOnDesk;

  /* ---------------- the lens ---------------- */
  function reveal(id, axis) {
    var s = Clues.specimenById(id); if (!s) return;
    if (!state.revealed[id]) state.revealed[id] = {};
    state.revealed[id][axis] = s[axis];
    saveSoon(); render();
  }
  function revealAll(id) {
    var s = Clues.specimenById(id); if (!s) return;
    state.revealed[id] = {};
    AXES.forEach(function (a) { state.revealed[id][a] = s[a]; });
  }
  function revealedCount(id) { return Object.keys(state.revealed[id] || {}).length; }

  /* ---------------- naming ---------------- */
  /* You may claim any page at any time. Observing first is advice, not a gate —
   * being wrong is what costs, and the cost arrives immediately. */
  function canName() { return true; }
  function paperById(id) { return PAPERS.find(function (n) { return n.id === id; }) || null; }

  function nameAs(specimenId, entryId) {
    if (specimenId === entryId) {
      state.identified[specimenId] = true;
      revealAll(specimenId);
      delete state.notes[specimenId];
      state.overlay = null;
      var sp = Clues.specimenById(specimenId);
      pushLog("Identified " + sp.name + " (" + sp.binomial + ").");
      /* the card shows the page itself, not a description of it */
      announce({ kind: "good", title: "Its page is filled in", pageId: specimenId,
                 body: "You know what this is now, and the book says so.", cta: "Good",
                 strip: "Named: " + sp.name + "." });
      saveSoon();
      return true;
    }
    /* The page is struck out for the day AND it costs a pip straight away.
     * Nothing gates a guess any more, so the guess itself has to be the thing
     * you pay for. */
    if (!state.wrongPages[specimenId]) state.wrongPages[specimenId] = {};
    state.wrongPages[specimenId][entryId] = true;
    var strikes = Object.keys(state.wrongPages[specimenId]).length;
    addMuddle();
    var wrong = Clues.specimenById(entryId), target = Clues.specimenById(specimenId);
    var rev = state.revealed[specimenId] || {};
    var miss = Object.keys(rev).find(function (k) { return wrong[k] !== rev[k]; });
    var why = miss ? "Yours has " + Clues.chipText(miss, rev[miss]) + ". That one does not."
                   : "That is not the one on your desk.";
    announce({ kind: "bad", title: "Not " + wrong.name, artId: entryId,
               body: why + " Ruled out for today, and it cost you a pip.",
               cta: "Look again", strip: "No — not " + wrong.name + "." });
    saveSoon();
    return false;
  }

  /* ---------------- confusion ---------------- */
  /* Getting muddled does not end the day. When your head is full you cast the
   * spell of calm — six runes to put back in order — and when it settles the
   * pips clear and the day carries on. It is friction, not a story: its whole
   * job is to make spamming guesses and hints cost something you notice. */
  function addMuddle(n) {
    state.confusion = Math.min(MUDDLE_CAP, state.confusion + (n || 1));
    /* Lay the runes out, but do not shove them in front of a card that is
     * already explaining WHY you just earned that pip — the rite waits for you
     * to dismiss that first (see closeModal). */
    if (state.confusion >= MUDDLE_CAP && !state.rite) {
      state.rite = Rite.shuffled();
      if (!state.modal) state.modal = { kind: "rite" };
    }
    saveSoon();
  }

  function beginRite() {
    if (!state.rite) state.rite = Rite.shuffled();
    state.modal = { kind: "rite" };
    render();
  }
  /* Returns true when that swap finished the rite. It deliberately does NOT
   * re-render on an ordinary swap: rebuilding the whole modal mid-drag replayed
   * its entrance animation every time, which looked exactly like the dialog
   * slamming shut and reopening. Rite repaints its own row in place instead. */
  /* Commit a whole order at once — what a drag hands back when you let go.
     The row previews the move as you drag, so by the time this is called the
     player has already seen exactly this arrangement. */
  function riteSet(order) {
    if (!state.rite || !order || order.length !== state.rite.length) return false;
    state.rite = order.slice();
    if (Rite.solved(state.rite)) {
      state.rite = null;
      state.confusion = 0;
      state.modal = { kind: "good", title: "Your head clears",
                      body: "The spell settles and the muddle goes out of you. "
                          + "Take your time with the next one.", cta: "Back to work" };
      saveSoon(); render();
      return true;
    }
    saveSoon();
    return false;
  }

  function riteSwap(a, b) {
    if (!state.rite) return false;
    var o = state.rite, t = o[a]; o[a] = o[b]; o[b] = t;
    if (Rite.solved(o)) {
      state.rite = null;
      state.confusion = 0;
      state.modal = { kind: "good", title: "Your head clears",
                      body: "The spell settles and the muddle goes out of you. "
                          + "Take your time with the next one.", cta: "Back to work" };
      saveSoon(); render();
      return true;
    }
    saveSoon();
    return false;
  }

  /* ---------------- giving ---------------- */
  /* "Old Corbin is helped" every single time reads like a receipt. Six ways of
   * saying it, picked at the moment the card goes up so it stays put while the
   * card is on screen. */
  var THANKS = [
    function (n) { return n + " says thank you"; },
    function (n) { return "You helped " + n; },
    function (n) { return n + " has what they came for"; },
    function (n) { return "That's what " + n + " wanted"; },
    function (n) { return n + " goes away happy"; },
    function (n) { return "Sorted, for " + n; }
  ];
  function thanks(name) {
    return THANKS[Math.floor(Math.random() * THANKS.length)](name);
  }

  function give(specimenId) {
    var v = visitor(), s = Clues.specimenById(specimenId);
    if (!v || !s || state.dayOver) return;
    if (v.kind === "visit" || v.kind === "gift" || v.kind === "lead") {
      setMessage("They haven't asked for anything.", "warn"); return;
    }
    if (!isIdentified(specimenId)) {
      setMessage("You don't know what this is yet. Name it in the book first.", "warn");
      return;
    }

    if (v.kind === "recipe") {
      var slot = recipeSlot(specimenId);
      if (slot < 0) { wrongGive(v, s); return; }
      if (!state.recipe || state.recipe.vid !== v.id) state.recipe = { vid: v.id, got: [] };
      state.recipe.got[slot] = specimenId;
      var done = v.needs.every(function (_n, i) { return !!state.recipe.got[i]; });
      if (!done) {
        var left = v.needs.filter(function (_n, i) { return !state.recipe.got[i]; }).length;
        setMessage(s.name + " goes in. " + left + " more to find.", "good");
        saveSoon(); render();
        return;
      }
      state.served += 1;
      clearBookSearch();
      state.recipe = null;
      pushLog("Day " + today().day + " — made up " + v.needs.length + " things for " + v.name + ".");
      announce({ kind: "good", title: thanks(v.name), face: v.emoji, pic: v.pic,
                 artId: specimenId, body: v.reply || "They thank you and go.",
                 cta: "Continue", then: advanceVisitor,
                 strip: "Made up " + v.needs.length + " things for " + v.name + "." });
      saveSoon();
      return;
    }

    if (v.kind === "fork") {
      var out = Clues.forkOutcome(v, specimenId);
      if (!out) { wrongGive(v, s); return; }
      state.flags[out.flag] = true;
      state.served += 1;
      clearBookSearch();
      /* out is the fork option itself, and its words are in `reply` — the same
         field every other visitor uses. This read `out.text`, which does not
         exist, so all six forks handed over a card with nothing on it. */
      var said = out.reply || "They take it and go.";
      pushLog("Day " + today().day + " — " + v.name + ": " + said);
      /* A fork is a decision, not a favour: one of the two ways through is
         often not a kindness at all, so the card is titled with the person
         rather than with a thank-you they may not be giving. */
      announce({ kind: "good", title: v.name + " takes it", face: v.emoji, pic: v.pic,
                 artId: specimenId, body: said, cta: "Continue", then: advanceVisitor,
                 strip: "You chose. " + v.name + " leaves." });
      saveSoon();
      return;
    }

    if (Clues.answers(s, v)) {
      state.served += 1;
      clearBookSearch();
      pushLog("Day " + today().day + " — gave " + s.name + " to " + v.name + ".");
      announce({ kind: "good", title: thanks(v.name), face: v.emoji, pic: v.pic, artId: specimenId,
                 body: v.reply || "They thank you and go.", cta: "Continue", then: advanceVisitor,
                 strip: "Gave " + s.name + " to " + v.name + "." });
      saveSoon();
      return;
    }
    wrongGive(v, s);
  }

  function wrongGive(v, s) {
    addMuddle();
    if (state.dayOver) return;
    announce({ kind: "bad", title: v.name + " shakes their head", face: v.emoji, pic: v.pic, artId: s.id,
               body: "“That isn't what I asked for.”", cta: "Try again",
               strip: "Not what " + v.name + " asked for." });
    saveSoon();
  }

  /* ---------------- the map ----------------
   * A location you have been TOLD about is a lead, not a pin. You read the lead
   * and click the grid square you think it means. Get it right and the place is
   * on your map for good; get it wrong and you have wasted nothing but a guess.
   * Gathering at a located place turns up one specimen you have not seen before.
   */
  /* ---------------- shut places ----------------
   * Finding a place and getting into it are two different things, and this is
   * the critical path: behind twelve of these doors is the only cutting of
   * something somebody asks for later. Bring it a plant the way you bring one
   * to a person; the plant is not used up.
   */
  function isShut(h) { return !!(h && h.shut && !state.opened[h.id]); }
  function setMapPlace(id) { state.mapPlace = id || null; saveSoon(); render(); }

  /* what on your shelf would get you in — named, because you cannot knowingly
   * carry something you cannot name */
  function keysFor(h) {
    if (!h || !h.keys) return [];
    return SPECIMENS.filter(function (s) {
      return h.keys.indexOf(s.effect) !== -1 && hasPot(s.id) && isIdentified(s.id);
    });
  }

  function openPlace(hid, specimenId) {
    var h = HABITATS.find(function (x) { return x.id === hid; });
    var s = Clues.specimenById(specimenId);
    if (!h || !s || !isShut(h)) return;
    if (!isIdentified(specimenId)) {
      setMessage("You don't know what this is yet. Name it in the book first.", "warn");
      return;
    }
    if (h.keys.indexOf(s.effect) === -1) {
      addMuddle();
      if (state.dayOver) return;
      announce({ kind: "bad", title: "No use here", artId: specimenId,
                 body: s.name + " " + Clues.effectText(s.effect) + ". " + h.shut,
                 cta: "Think again", strip: s.name + " is no use at " + h.short + "." });
      return;
    }
    state.opened[hid] = true;
    state.mapPlace = null;
    var got = [];
    ((h.behind && h.behind.pots) || []).forEach(function (id) {
      if (!hasPot(id)) { state.pots[id] = true; got.push(id); }
    });
    ((h.behind && h.behind.pages) || []).forEach(function (id) { state.pages[id] = true; });
    pushLog("Got into " + h.name + " with " + s.name + ".");
    var body = s.name + " did it. " + h.note;
    if (got.length) {
      body += " You come back with " + got.length
            + (got.length === 1 ? " cutting" : " cuttings")
            + " of something that grows nowhere else"
            + (hasPage(got[0]) ? " — and the book already has a leaf for it."
                               : ", and nothing in the book to match it to yet.");
    }
    announce({ kind: "good", title: h.name + " is open", face: h.emoji, scene: h.id,
               artId: got[0] || specimenId, body: body, cta: "Go in",
               strip: "Got into " + h.name + " with " + s.name + "." });
    saveSoon();
  }

  /* Three places do not exist until she makes them, and eight squares change
   * under her. The map is drawn for TODAY, not for the valley as it was. */
  function dayNo() { var d = today(); return d ? d.day : 1; }
  function exists(h) { return !h || !h.from || dayNo() >= h.from; }
  function terrainToday() {
    var rows = TERRAIN.slice();
    TERRAIN_CHANGES.forEach(function (c) {
      if (c.day > dayNo()) return;
      var col = GRID.cols.indexOf(c.cell[0]), row = parseInt(c.cell.slice(1), 10) - 1;
      if (row < 0 || row >= rows.length || col < 0) return;
      rows[row] = rows[row].slice(0, col) + c.code + rows[row].slice(col + 1);
    });
    return rows;
  }
  function changesSoFar() {
    return TERRAIN_CHANGES.filter(function (c) { return c.day <= dayNo(); });
  }
  function changedToday() {
    return TERRAIN_CHANGES.filter(function (c) { return c.day === dayNo(); });
  }

  function probeCell(cell) {
    var h = habitatAt(cell);
    if (h && !exists(h)) h = null;          // it is not there yet
    if (h && isLocated(h.id) && isShut(h)) { state.mapPlace = h.id; saveSoon(); render(); return h; }

    if (h && isLocated(h.id)) return gather(h);

    if (h && isLead(h.id)) {
      delete state.leads[h.id];
      state.knownHabitats[h.id] = true;
      pushLog("Found " + h.name + " at " + cell + ".");
      announce({ kind: "good", title: h.name + " — " + cell, face: h.emoji, scene: h.id, body: h.note,
                 cta: "Marked on the map", strip: "Found " + h.name + " at " + cell + "." });
      saveSoon();
      return h;
    }

    // a place you have not been told about is not out there to be stumbled on
    setMessage(openLeads().length
      ? "Nothing at " + cell + ". Read the note again."
      : "Nothing at " + cell + " but heather and sheep.", "warn");
    return null;
  }

  /* You can go out as many times in a day as you like. The limit is not the
   * clock any more, it is the walk: come back from a place with nothing on you
   * and that is an hour of daylight gone and a pip of confusion earned. Somewhere
   * you have already stripped bare is the one thing the map will not tell you,
   * so a wasted trip is a real mistake and not a dice roll. */
  function gather(h) {
    if (state.dayOver) { setMessage("It's too late in the day to go out.", "warn"); return null; }
    var fresh = SPECIMENS.filter(function (s) { return s.habitat === h.id && !hasPot(s.id); });
    if (!fresh.length) {
      state.tripsToday += 1;
      addMuddle();
      pushLog("Walked out to " + h.name + " and came back with nothing.");
      /* the rite, if this pip filled the last space, waits behind this card —
         closeModal puts it up the moment you dismiss the explanation */
      announce({ kind: "bad", title: "Nothing there for you", face: h.emoji, scene: h.id,
                 body: "You walk out to " + h.name + " and walk back. There is nothing growing "
                     + "there you have not already got on the shelf, and the afternoon is gone.",
                 cta: "Back to the shop",
                 strip: "Went out to " + h.name + " and came back with nothing." });
      saveSoon();
      return null;
    }
    var pick = fresh[Math.floor(Math.random() * fresh.length)];
    state.pots[pick.id] = true;                 // a cutting. NOT a page.
    state.tripsToday += 1;
    pushLog("Brought something new back from " + h.name + ".");
    /* the same card a handed-over cutting gets — one cutting, one overlay,
       wherever it came from */
    newCuttings([pick.id], null, "You come back from " + h.name + " with something. ", h.id);
    saveSoon();
    return pick;
  }

  /* ---------------- days ---------------- */
  /* No timers. A served visitor stays on screen until you dismiss the modal,
   * which is both clearer and one less thing to race in a test. */
  function advanceVisitor() {
    var d = today();
    if (state.visitorIndex + 1 < d.visitors.length) {
      state.visitorIndex += 1;
      arrive(d.visitors[state.visitorIndex]);
      clearMessage();
    } else {
      endDay(null);
    }
    saveSoon(); render();
  }

  function dismissVisitor() {           // for beats where nothing changes hands
    var v = visitor();
    if (!v) return advanceVisitor();
    if (v.reply) pushLog("Day " + today().day + " — " + v.name + ": " + v.reply);
    if (v.reply) {
      announce({ kind: "info", title: v.name, face: v.emoji, pic: v.pic, body: v.reply,
                 cta: "Continue", then: advanceVisitor, strip: v.reply });
      saveSoon();
    } else advanceVisitor();
  }

  /* A gift or a lead only lands once you have actually dealt with that person,
   * which is why grants run on ARRIVAL of the next visitor rather than on a
   * day boundary: plants stopped appearing on the shelf overnight for no
   * reason, and every place you know about now has a face attached to it. */
  function applyVisitorGrants(v) {
    if (!v) return;
    var fresh = [];                       // cuttings that were not already yours
    (v.opens || []).forEach(tellAbout);
    (v.pots  || []).forEach(function (id) {
      if (!hasPot(id)) fresh.push(id);
      state.pots[id] = true;
    });
    /* Pages used to land in silence. Somebody handing you six leaves out of
       Hester's unbound book is as real an event as handing you a cutting, and
       it is the half of the game that turns pots into stock — so it gets said,
       on the same card, with the plates drawn. Only the ones you did not
       already hold count. */
    var newPages = [];
    (v.pages || []).forEach(function (id) {
      if (!hasPage(id) && fresh.indexOf(id) === -1) newPages.push(id);
      state.pages[id] = true;
    });
    (v.papers || []).forEach(function (id) {
      if (state.papers.indexOf(id) === -1) state.papers.push(id);
    });
    if (v.item && state.items.indexOf(v.item) === -1) state.items.push(v.item);
    if (v.kind === "recipe") state.recipe = { vid: v.id, got: [] };
    else if (state.recipe && state.recipe.vid !== v.id) state.recipe = null;
    if (fresh.length || newPages.length) newCuttings(fresh, v.name, null, null, newPages);
  }

  /* Every cutting that reaches the shelf gets the same card, whoever it came
   * from: the picture, how many, and whether the book has a leaf to match it
   * to. A pot used to appear on the shelf in silence when somebody handed it
   * over, and a thing that appears in silence is a thing nobody notices.
   *
   * It never says the NAME. Being handed a cutting is not being told what it
   * is — that is still the book's job, and saying it here would hand over the
   * puzzle with the plant. */
  function newCuttings(ids, from, lead, place, pageIds) {
    if (inPrologue()) return;             // the shop is not open yet
    ids = ids || [];
    pageIds = pageIds || [];
    var n = ids.length, pn = pageIds.length;
    if (!n && !pn) return;
    if (n && !Clues.specimenById(ids[0])) return;

    var named = ids.filter(function (id) { return isIdentified(id); });
    var withPage = ids.filter(function (id) { return hasPage(id); }).length;

    var body = "";
    if (n) {
      body = lead || (n === 1
        ? "One cutting, onto the shelf. "
        : n + " cuttings, onto the shelf. ");
      if (named.length === n) {
        body += (n === 1 ? "You know this one: " : "You know these: ")
              + ids.map(function (id) { return Clues.specimenById(id).name; }).join(", ") + ".";
      } else if (pn) {
        /* the leaves get their own sentence below; saying it twice is noise */
        body = body.replace(/ $/, "");
      } else if (withPage === n) {
        body += n === 1
          ? "There is a leaf for it in the book already — find it and put a name to it."
          : "There are leaves for all of them in the book already — find them and put names to them.";
      } else if (withPage) {
        body += "Some of them have a leaf in the book already. The rest will have to wait.";
      } else {
        body += n === 1
          ? "Nothing in the book matches it yet. It sits unnamed until something does."
          : "Nothing in the book matches them yet. They sit unnamed until something does.";
      }
    }
    /* A leaf is not a plant. It never says WHICH plant — the whole game is
       working that out — so the sentence is about the book, not the name. */
    if (pn) {
      if (body) body += " ";
      if (n) {
        body += pn === 1
          ? "A loose leaf comes with " + (n === 1 ? "it" : "them") + ", and goes into the book."
          : pn + " loose leaves come with " + (n === 1 ? "it" : "them") + ", and go into the book.";
      } else {
        body += pn === 1
          ? "A loose leaf out of Hester's book, and it goes back in."
          : pn + " loose leaves out of Hester's book, and they go back in.";
      }
      body += pn === 1
        ? " One more plant on the shelf can be matched to a page."
        : " " + pn + " more plants on the shelf can be matched to a page.";
      if (n && withPage < n)
        body += n - withPage === 1
          ? " One of the cuttings still has nothing in the book to match."
          : " " + (n - withPage) + " of the cuttings still have nothing in the book to match.";
    }

    /* What the card is called, in the order the player would say it. */
    var what = [];
    if (n)  what.push(n === 1 ? "a cutting" : n + " cuttings");
    if (pn) what.push(pn === 1 ? "a page" : pn + " pages");
    var title = from
      ? from + " leaves you " + what.join(" and ")
      : (n
         ? (n === 1 ? "Something new" : n + " new cuttings")
         : (pn === 1 ? "A new page in the book" : pn + " new pages in the book"));

    announce({ kind: "good", title: title,
               artId: n ? ids[0] : null, artIds: n ? ids : null,
               pageIds: pn ? pageIds : null,
               scene: place || null, body: body,
               cta: n ? "Onto the shelf" : "Into the book",
               strip: [ n ? (n === 1 ? "A new cutting on the shelf." : n + " new cuttings on the shelf.") : null,
                        pn ? (pn === 1 ? "A new page in the book." : pn + " new pages in the book.") : null
                      ].filter(Boolean).join(" ") });
  }

  function recipeGot() { return (state.recipe && state.recipe.got) || []; }
  /* which step of the recipe a plant would fill, or -1 */
  function recipeSlot(specimenId) {
    var v = visitor(), s = Clues.specimenById(specimenId);
    if (!v || v.kind !== "recipe" || !s) return -1;
    var got = recipeGot();
    for (var i = 0; i < v.needs.length; i++)
      if (v.needs[i] === s.effect && !got[i]) return i;
    return -1;
  }

  /* being told about a place gives you a lead, not the place */
  function tellAbout(id) {
    if (!state.knownHabitats) state.knownHabitats = {};
    if (!state.leads) state.leads = {};
    if (state.knownHabitats[id]) return;
    state.leads[id] = true;
  }

  /* ---------------- the drawer ----------------
   * A paper is a thing you pick up, not a tooltip. It carries book pages and
   * directions, and it is DONE when you have taken everything off it — which is
   * why a drawer of fourteen notes still tells you at a glance which two you
   * have not finished with.
   */
  function paperList() {
    return (state.papers || []).map(paperById).filter(Boolean);
  }
  /* Done with means READ and emptied. A note whose pages you happen to have
   * already is not done with until you have actually opened it — otherwise the
   * drawer stamps things you have never looked at, which is worse than useless. */
  function paperDone(n) {
    if (!n || !state.papersRead[n.id]) return false;
    var gives = n.gives || [], pts = n.points || [];
    return gives.every(function (id) { return hasPage(id); })
        && pts.every(function (h) { return isLocated(h) || isLead(h); });
  }
  function readPaper(id) {
    var n = paperById(id);
    if (!n) return;
    state.papersRead[id] = true;
    state.openPaper = id;
    (n.gives || []).forEach(function (pid) { state.pages[pid] = true; });
    (n.points || []).forEach(tellAbout);
    (n.flags || []).forEach(function (f) { state.flags[f] = true; });
    saveSoon(); render();
  }
  function closePaper() { state.openPaper = null; saveSoon(); render(); }

  /* The tick in the corner of a note. Reading one is what hands over its pages
     and its directions, and that cannot be undone — un-reading only clears the
     mark, for a player keeping their own track of what they have been through. */
  function toggleRead(id) {
    if (state.papersRead[id]) delete state.papersRead[id];
    else state.papersRead[id] = true;
    saveSoon(); render();
  }

  /* Where a note is lying in the drawer, as a fraction of it, so it stays put
     when the window changes size. Set during a drag without re-rendering — the
     element is already following the pointer. */
  function setNoteAt(id, x, y, commit) {
    state.noteAt[id] = { x: x, y: y };
    if (commit) { saveSoon(); render(); }
  }
  function setDeskView(v) {
    state.deskView = v === "drawer" ? "drawer" : "bench";
    if (state.deskView === "bench") state.openPaper = null;
    /* pulling the drawer out shuts the book, rolls up the chart, and puts the
       specimen back on the shelf — the drawer is where the desk was. */
    if (state.deskView === "drawer") {
      state.overlay = null; state.bookPick = null; state.onDesk = null;
    }
    saveSoon(); render();
  }
  function hasDrawer() { return (state.papers || []).length > 0; }
  function unreadPapers() {
    return paperList().filter(function (n) { return !paperDone(n); }).length;
  }

  /* ---------------- the prologue ---------------- */
  function prologueStep(n) {
    var max = (typeof PROLOGUE !== "undefined" ? PROLOGUE.length : 0);
    state.prologue = n >= max ? -1 : n;
    saveSoon(); render();
  }
  function inPrologue() {
    return typeof PROLOGUE !== "undefined" && PROLOGUE.length > 0 && state.prologue >= 0;
  }

  /* The opening and the evenings are the same thing wearing the same clothes:
   * full-screen story over a hidden board. Everything that must not tick while
   * a story panel is up — the counter, the typewriter, all three walkthroughs —
   * asks this rather than asking about the prologue alone. */
  function inStory() { return inPrologue() || !!state.evening; }

  function eveningFor(day) {
    return (typeof EVENINGS !== "undefined" &&
            EVENINGS.find(function (e) { return e.day === day; })) || null;
  }

  function endDay(reason) {
    state.dayOver = true;
    state.message = "";
    state.recipe = null;
    if (reason) pushLog("Day " + today().day + " — " + reason);
    /* the evening comes between the last customer and the summary, which is
       where the story lives so the counter can stay being the counter */
    var e = eveningFor(today().day);
    if (e && !state.eveningsSeen[e.day]) {
      state.evening = true;
      /* the story takes the whole screen; a card left over from the last
         customer must not be sitting on top of it */
      if (state.modal && state.modal.kind !== "rite") state.modal = null;
    }
    saveSoon(); render();
  }

  /* The egg is the evening's version of a customer: it wants an effect and you
   * hand it something you can name. Getting it wrong costs nothing but a bad
   * night — this is the one place in the game that never punishes you. */
  /* Picking a cutting up is not the same as handing it over. You choose one,
     the panel shows you what it is and what it does, and then you decide — the
     egg is the one place in the game where you cannot look the plant up first,
     because the book is behind the panel. */
  function setEggPick(id) { state.eggPick = id || null; render(); }

  function feedEgg(specimenId) {
    state.eggPick = null;
    var e = eveningFor(today().day);
    if (!e || !e.egg) return;
    var s = Clues.specimenById(specimenId);
    if (!s) return;
    if (!isIdentified(specimenId)) {
      setMessage("You don't know what this is yet. Name it in the book first.", "warn");
      return;
    }
    var right = s.effect === e.egg.needs;
    if (right) state.eggFed[e.day] = true;
    state.eveningsSeen[e.day] = true;
    pushLog("Night of day " + e.day + " — gave it " + s.name + ".");
    /* the answer is the next panel of the same card, not a modal over a board
       nobody can see behind it */
    var what = e.day < 12 ? "The egg" : "It";
    state.eveningReply = { title: right ? what + " settles" : "A long night",
                           body: right ? e.egg.ok : e.egg.wrong, artId: specimenId };
    saveSoon(); render();
  }

  function eveningChoose(flag, reply) {
    var e = eveningFor(today().day);
    if (!e) return;
    if (flag) state.flags[flag] = true;
    state.eveningsSeen[e.day] = true;
    if (reply) {
      pushLog("Night of day " + e.day + " — " + reply);
      state.eveningReply = { title: e.title, body: reply, artId: "" };
    } else {
      state.evening = false;
    }
    saveSoon(); render();
  }
  function eveningDone() {
    var e = eveningFor(today().day);
    if (e) state.eveningsSeen[e.day] = true;
    state.evening = false;
    state.eveningReply = null;
    saveSoon(); render();
  }

  /* Day one is the book and nothing else. The map turns up behind the brooms
   * on the first evening, and day two is its own short walkthrough. */
  function hasMap() { return state.dayIndex >= 1; }

  function startNextDay() {
    if (state.dayIndex + 1 >= DAYS.length) { state.finished = true; saveSoon(); render(); return; }
    state.dayIndex += 1;
    state.visitorIndex = 0;
    state.dayOver = false;
    state.confusion = 0;
    state.tripsToday = 0;
    state.bookEffect = "";        // don't let yesterday's browse filter follow you
    state.wrongPages = {};
    state.rite = null;
    state.onDesk = null;
    state.overlay = null;
    state.message = "";
    state.recipe = null;
    state.evening = false;
    state.eveningReply = null;
    state.mapPlace = null;
    arrive(today().visitors[0]);
    saveSoon(); render();
  }

  /* Is there anything to think over? The hint lives in the top bar now, beside
   * the confusion it costs, so it has to know when to be there at all. */
  function canHint() {
    if (inStory() || state.finished || state.dayOver || state.modal) return false;
    var v = visitor();
    return !!v && v.kind !== "visit" && v.kind !== "gift" && v.kind !== "lead";
  }

  /* the paid hint */
  function hint() {
    var v = visitor();
    if (!v || v.kind === "visit") return;
    addMuddle();
    if (state.dayOver) return;
    var body;
    if (v.kind === "describe") {
      body = "They named " + Object.keys(v.wants).length + " things: " +
             Object.keys(v.wants).map(function (a) { return Clues.chipText(a, v.wants[a]); }).join(", ") + ".";
    } else if (v.kind === "effect") {
      body = "They need something that " + Clues.effectText(v.needs)
           + ", " + Clues.speciesText(v.who || "human")
           + ". Search the book for it — every page says what it is for and who for.";
    } else {
      body = "Either option is accepted. The difference is what it does to them.";
    }
    announce({ kind: "warn", title: "You think it over", face: v.emoji, pic: v.pic,
               body: body + " That cost you a pip of confusion.", cta: "Right",
               strip: "Hint taken — a pip of confusion." });
    saveSoon();
  }

  /* Helping somebody is the end of a search: the words you typed to find their
   * plant are no use for the next person and reading as if they were is worse
   * than useless. The counter is cleared with it — the pot you just handed over
   * has no business still sitting under the lens for the next customer. Wiped
   * quietly, with the book shut or open. */
  function clearBookSearch() {
    state.bookQuery = "";
    state.bookEffect = "";
    state.bookSpread = 0;
    state.bookPick = null;
    state.onDesk = null;                 // nothing left on the counter
    state.mapPlace = null;
  }

  /* ---------------- overlays ---------------- */
  /* The book, the chart and the drawer are three ways of using the same bench,
     so only one of them is ever out. Opening one puts the others away. */
  function openOverlay(o) {
    if (o === "book" && state.overlay !== "book") { state.bookSpread = 0; state.bookPick = null; }
    if (o) { state.deskView = "bench"; state.openPaper = null; }
    state.overlay = o; saveSoon(); render();
  }
  function closeOverlay() { state.overlay = null; state.bookPick = null; saveSoon(); render(); }

  /* ---------------- look closer ----------------
   * Tap any plant picture and it comes up big. If the book is open at a page
   * AND there is a specimen on the desk, you get both side by side, which is
   * the actual comparison the game is asking you to make — is the thing in my
   * hand the thing on this page? — and until now you had to do it across two
   * inches of screen at thumbnail size.
   *   mode "plant" is the painted specimen, "book" is the line-drawn plate. */
  function lookCloser(id, mode) {
    var items = [];
    function add(sid, m) {
      if (!sid || !Clues.specimenById(sid)) return;
      for (var i = 0; i < items.length; i++)
        if (items[i].id === sid && items[i].mode === m) return;
      items.push({ id: sid, mode: m });
    }
    add(id, mode || "plant");
    var page = state.overlay === "book" ? state.bookPick : null;
    if (mode === "book") add(state.onDesk, "plant");
    else                 add(page, "book");
    state.look = items.length ? items : null;
    render();
  }
  function closeLook() { state.look = null; render(); }

  /* The shelves opened out across the bench. Eighty-two pots at 66px is a
     contact sheet; this is the drawer pulled all the way out. Picking one
     closes it again with that plant on the desk, which is what you opened it
     to do. Not saved: it is a way of looking, not a place you are. */
  /* Easy plant mode. The book's plates are line drawings, which is the point —
     matching a painted thing in your hand to a drawing of it is the puzzle. For
     a younger reader that is a step too far, so this puts the same painted
     picture on both sides and leaves only the words to work from. */
  function setEasyPlants(on) { state.easyPlants = !!on; saveSoon(); render(); }

  function setShelfBig(on) {
    state.shelfBig = !!on;
    if (state.shelfBig) state.overlay = null;   // the book cannot be under it
    render();
  }

  /* A tap, not a click: the picture on the desk is also the handle you drag
     the specimen away by, and letting go after a drag was opening the
     lightbox. If the pointer travelled, it was a drag and nothing else. */
  function onTap(elm, fn) {
    var x0 = null, y0 = null;
    elm.addEventListener("pointerdown", function (e) { x0 = e.clientX; y0 = e.clientY; });
    elm.addEventListener("click", function (e) {
      if (x0 !== null && (Math.abs(e.clientX - x0) > 6 || Math.abs(e.clientY - y0) > 6)) return;
      fn(e);
    });
  }
  function setBookSpread(n) { state.bookSpread = Math.max(0, n); saveSoon(); render(); }
  function setBookQuery(q) { state.bookQuery = q; state.bookSpread = 0; state.bookPick = null; render(); }
  /* which entry you turned to from the index. Only the walkthrough reads it —
   * it is how "you have opened THAT page" is told apart from "you are on some
   * page or other", without the book having to report its layout back. */
  function setBookPick(id) { state.bookPick = id || null; }
  function setBookEffect(e) { state.bookEffect = e || ""; state.bookSpread = 0; saveSoon(); render(); }
  /* Notes belong to the SPECIMEN, not to the book. Filing "blue" against the
   * index while you work out what is on the desk should not still be narrowing
   * the book tomorrow when you open it to read — that made a plain Book click
   * show one flower and look broken. Browsing applies no notes at all. */
  function noteFor(id) { return (id && state.notes[id]) || {}; }
  function toggleFilter(axis, value) {
    var id = state.onDesk;
    if (!id) return;
    if (!state.notes[id]) state.notes[id] = {};
    var n = state.notes[id];
    if (axis in n) { delete n[axis]; }
    else {
      if (Object.keys(n).length >= Clues.filterCap()) {
        setMessage("The filter holds " + Clues.filterCap() + " at once. Drop one first.", "warn");
        return;
      }
      n[axis] = value;
    }
    state.bookSpread = 0;
    state.bookPick = null;          // filtering throws you back to the index
    saveSoon(); render();
  }
  function clearFilter() {
    if (state.onDesk) state.notes[state.onDesk] = {};
    state.bookSpread = 0;
    state.bookPick = null;
    saveSoon(); render();
  }

  /* ---------------- regions & render ---------------- */
  var regions = {};
  function registerRegion(name, fn) { regions[name] = fn; }

  var zones = [];
  function registerZone(elm, handler) { if (elm) zones.push({ el: elm, handler: handler }); }
  function zoneAt(x, y) {
    for (var i = zones.length - 1; i >= 0; i--) {
      var r = zones[i].el.getBoundingClientRect();
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zones[i];
    }
    return null;
  }

  var rafPending = false;
  function render() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; renderNow(); });
  }
  /* Every render rebuilds the DOM, which throws away focus — typing in the book
   * search lost the caret after each keystroke. Remember who had focus and where
   * the caret was, and put it back. Any input with an id gets this for free. */
  function grabFocus() {
    var a = document.activeElement;
    if (!a || !a.id || a === document.body) return null;
    var f = { id: a.id };
    try { f.start = a.selectionStart; f.end = a.selectionEnd; } catch (e) {}
    return f;
  }
  function restoreFocus(f) {
    if (!f) return;
    var n = document.getElementById(f.id);
    if (!n) return;
    n.focus({ preventScroll: true });
    if (f.start != null && n.setSelectionRange)
      try { n.setSelectionRange(f.start, f.end); } catch (e) {}
  }

  var frameNo = 0;
  function frame() { return frameNo; }      // lets a region cache work per pass

  function renderNow() {
    var focus = grabFocus();
    frameNo++;
    zones.length = 0;                       // <- the leak fix: rebuilt every frame
    Object.keys(regions).forEach(function (name) {
      var root = document.getElementById(name);
      if (!root) return;
      clear(root);
      regions[name](root);
    });
    document.body.classList.toggle("is-overlay", !!state.overlay);
    /* which overlay, so the bench can put the right thing under it — the map
       lies on chart paper, not on the leather */
    document.body.setAttribute("data-overlay", state.overlay || "");
    /* and which way the bench is being used, so the drawer can put the drawer
       under itself the way the map puts down chart paper */
    document.body.setAttribute("data-desk", state.deskView || "bench");
    document.body.classList.toggle("is-shelfbig", !!state.shelfBig);
    restoreFocus(focus);
  }

  /* ---------------- drag controller ---------------- */
  var drag = null;

  function scrollerFor(node) {
    for (var n = node; n && n !== document.body; n = n.parentElement) {
      var st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  }

  /* opts.lockAxis === "x" means: a sideways pull picks the thing up, a vertical
   * one scrolls whatever list it is sitting in. Without that, grabbing a pot to
   * scroll the shelves just dangled the pot instead. touch-action:pan-y hands
   * the vertical case to the browser on touch; the mouse case is done by hand
   * below because a mousedown never scrolls anything on its own. */
  function makeDraggable(elm, payload, ghostHTML, opts) {
    opts = opts || {};
    elm.style.touchAction = opts.lockAxis === "x" ? "pan-y" : "none";
    elm.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      drag = { payload: payload, ghost: null, html: ghostHTML || elm.innerHTML,
               startX: e.clientX, startY: e.clientY, active: false,
               lockAxis: opts.lockAxis || null, mode: null, moved: false,
               scroller: opts.lockAxis ? scrollerFor(elm) : null };
      if (drag.scroller) drag.scrollTop0 = drag.scroller.scrollTop;
    });
  }
  function beginGhost(e) {
    drag.active = true;
    var g = el("div", "ghost");
    g.innerHTML = drag.html;
    document.body.appendChild(g);
    document.body.classList.add("is-dragging");
    drag.ghost = g;
    moveGhost(e);
  }
  function moveGhost(e) {
    drag.ghost.style.left = e.clientX + "px";
    drag.ghost.style.top  = e.clientY + "px";
    var z = zoneAt(e.clientX, e.clientY);
    if (z !== drag.overZone) {
      if (drag.overZone) drag.overZone.el.classList.remove("is-drop-target");
      if (z) z.el.classList.add("is-drop-target");
      drag.overZone = z;
    }
  }
  function endDrag(e, cancelled) {
    var d = drag; drag = null;
    if (!d) return;
    if (d.mode === "scroll") {
      /* a scroll gesture must not also count as a tap on the pot it started on */
      if (d.moved) window.addEventListener("click", function once(ev) {
        ev.stopPropagation(); ev.preventDefault();
        window.removeEventListener("click", once, true);
      }, true);
      return;
    }
    if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    if (d.overZone) d.overZone.el.classList.remove("is-drop-target");
    document.body.classList.remove("is-dragging");
    if (!d.active || cancelled) return;
    var z = zoneAt(e.clientX, e.clientY);
    if (z) z.handler(d.payload, e.clientX, e.clientY);
    else setMessage("Nothing there to put it on.", "warn");
  }
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;

    if (!drag.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.mode = (drag.lockAxis === "x" && Math.abs(dy) > Math.abs(dx) && drag.scroller)
        ? "scroll" : "drag";
    }
    drag.moved = true;

    if (drag.mode === "scroll") { drag.scroller.scrollTop = drag.scrollTop0 - dy; return; }
    if (!drag.active) beginGhost(e);
    moveGhost(e);
  }, { passive: true });
  window.addEventListener("pointerup", function (e) { endDrag(e, false); });
  window.addEventListener("pointercancel", function (e) { endDrag(e, true); });

  /* ---------------- boot ---------------- */
  function start() {
    snaps = Store.get("snaps") || [];
    if (!Array.isArray(snaps)) snaps = [];
    var carriedOn = load();
    if (!carriedOn) {
      state = freshState();
      snaps = [];
      forgetSnapsOnDisk();            // a new game starts with a clean history
      arrive(today().visitors[0]);
    }
    state.debug = false;
    /* A game already in progress when saved states arrived has no history at
       all, and "no saves" looks broken, so it gets one for where it stands. */
    if (carriedOn && !snaps.length) takeSnap(null, false);
    if (!state.knownHabitats) { state.knownHabitats = {}; HABITATS.forEach(function (h) { if (h.known) state.knownHabitats[h.id] = true; }); }
    if (!state.leads) state.leads = {};
    window.addEventListener("beforeunload", save);
    render();
  }

  return {
    get state() { return state; },
    MUDDLE_CAP: MUDDLE_CAP,
    el: el, clear: clear, btn: btn,
    today: today, visitor: visitor,
    isDiscovered: isDiscovered, isIdentified: isIdentified, onDesk: onDesk,
    shelfList: shelfList, bookList: bookList,
    habitatAt: habitatAt, isLocated: isLocated, isLead: isLead, openLeads: openLeads,
    placeOnDesk: placeOnDesk, returnToShelf: returnToShelf, clearDesk: clearDesk, select: select,
    reveal: reveal, revealAll: revealAll, revealedCount: revealedCount, canName: canName, nameAs: nameAs,
    give: give, probeCell: probeCell, hint: hint, canHint: canHint, dismissVisitor: dismissVisitor,
    announce: announce, showModal: showModal, closeModal: closeModal,
    addMuddle: addMuddle, setMessage: setMessage, clearMessage: clearMessage, pushLog: pushLog,
    endDay: endDay, startNextDay: startNextDay,
    beginRite: beginRite, riteSwap: riteSwap, riteSet: riteSet,
    openOverlay: openOverlay, closeOverlay: closeOverlay, setBookPick: setBookPick,
    hasPot: hasPot, hasPage: hasPage,
    paperList: paperList, paperById: paperById, paperDone: paperDone,
    readPaper: readPaper, closePaper: closePaper, setDeskView: setDeskView,
    toggleRead: toggleRead, setNoteAt: setNoteAt,
    hasDrawer: hasDrawer, unreadPapers: unreadPapers,
    inPrologue: inPrologue, inStory: inStory, prologueStep: prologueStep, feedEgg: feedEgg, setEggPick: setEggPick,
    isShut: isShut, keysFor: keysFor, openPlace: openPlace, setMapPlace: setMapPlace,
    exists: exists, habitatsToday: habitatsToday, terrainToday: terrainToday, changesSoFar: changesSoFar,
    changedToday: changedToday, dayNo: dayNo,
    recipeGot: recipeGot, recipeSlot: recipeSlot,
    hasMap: hasMap, clearBookSearch: clearBookSearch,
    eveningFor: eveningFor, eveningChoose: eveningChoose, eveningDone: eveningDone,
    snapList: snapList, snapCount: snapCount, rewind: rewind, clearSnaps: clearSnaps,
    snapsOnDisk: snapsOnDisk, snapsWhere: snapsWhere, saveInfo: saveInfo,
    storageUse: storageUse, save: save, BUILD: BUILD,
    lookCloser: lookCloser, closeLook: closeLook, onTap: onTap,
    setShelfBig: setShelfBig, setEasyPlants: setEasyPlants,
    openDebug: openDebug, takeSnap: takeSnap,
    frame: frame,
    setBookSpread: setBookSpread, setBookQuery: setBookQuery, setBookEffect: setBookEffect,
    noteFor: noteFor,
    toggleFilter: toggleFilter, clearFilter: clearFilter,
    registerRegion: registerRegion, registerZone: registerZone,
    zoneCount: function () { return zones.length; },   // tests only
    makeDraggable: makeDraggable, render: render,
    save: save, reset: reset, start: start
  };
})();
