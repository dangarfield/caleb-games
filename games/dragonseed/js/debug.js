/* debug.js — saved states. A debugging tool, not a feature of the game.
 *
 * The engine saves the whole of state at the start of every customer. This is
 * the list of those saves: click the day in the top bar (it sits above the
 * modal scrim on purpose, so it still works with a card up), or press Shift+D.
 *
 * Opening a save restores it and deletes every save after it, so there is only
 * ever one line of play in the file.
 */

(function () {

  function chip(row, n, k) {
    var c = Engine.el("span", "dbg__chip");
    c.appendChild(Engine.el("b", null, String(n)));
    c.appendChild(document.createTextNode(" " + k));
    row.appendChild(c);
  }

  function clock(ms) {
    var d = new Date(ms);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)
         + ":" + ("0" + d.getSeconds()).slice(-2);
  }

  function render(root) {
    if (!Engine.state.debug) return;

    var list = Engine.snapList();
    var last = list.length - 1;

    var scrim = Engine.el("div", "dbg");
    scrim.addEventListener("click", function (e) {
      if (e.target === scrim) Engine.openDebug(false);
    });
    var card = Engine.el("article", "dbg__card");

    var span = list.length
      ? (list[0].day === list[list.length - 1].day
           ? "day " + list[0].day
           : "day " + list[0].day + " to day " + list[list.length - 1].day)
      : "nothing yet";

    var head = Engine.el("div", "dbg__head");
    head.appendChild(Engine.el("h2", "dbg__title", "Saved states"));
    head.appendChild(Engine.el("span", "dbg__sub",
      list.length + (list.length === 1 ? " save · " : " saves · ") + span
      + " · build " + Engine.BUILD));
    head.appendChild(Engine.btn("dbg__x", "✕", function () { Engine.openDebug(false); }, "Close"));
    card.appendChild(head);

    /* What storage is actually doing, in numbers, because "the save does not
       work" is impossible to chase without them. */
    var info = Engine.saveInfo();
    var kb = function (n) { return n < 0 ? "?" : (n / 1024).toFixed(n > 10240 ? 0 : 1) + "KB"; };
    var line = "game save " + kb(info.bytes) + " · these saves " + kb(info.snapBytes)
             + " in " + Engine.snapsWhere()
             + " · last write " + (info.at ? clock(info.at) : "none yet this visit")
             + " · tab " + info.sid;
    if (info.note === "othertab") line += " · NOT SAVING: another tab is ahead of this one";
    if (info.note === "full")     line += " · NOT SAVING: storage is full";
    if (info.note === "dropped")  line += " · storage is full; the game save had to sweep up to fit";
    card.appendChild(Engine.el("p", "dbg__storage" + (info.note ? " dbg__storage--bad" : ""), line));

    /* Who is actually filling the cupboard. Every game in the arcade shares one
       shelf of about five megabytes, and when it is full NOTHING can save —
       this game included — so the list names the biggest occupants. */
    var use = Engine.storageUse();
    if (use.total >= 0) {
      var near = use.total > 4 * 1024 * 1024;
      var all = Engine.el("p", "dbg__storage" + (near ? " dbg__storage--bad" : ""));
      all.textContent = "the arcade's old 5MB shelf holds " + kb(use.total)
        + (near ? " — FULL, but nothing of this game's is on it: " : ", none of it this game's: ")
        + (use.keys.length
            ? use.keys.map(function (k) {
                var name = k.key.replace(/^calebArcadeData:?/, "");
                if (!name) name = "the arcade's shared save";
                return name + " " + kb(k.bytes);
              }).join(" · ")
            : "empty");
      card.appendChild(all);
    }

    /* If the browser would not take the whole list, say so rather than quietly
       dropping the early days — that is how day one went missing before. */
    var off = Engine.snapsOnDisk();
    if (off) card.appendChild(Engine.el("p", "dbg__warn", off < 0
      ? "The browser will not store any of these. They are held for this session only — "
        + "reloading the page will lose them."
      : "The browser would only store the newest " + (list.length - off) + " of these. "
        + "The rest are held for this session only."));

    card.appendChild(Engine.el("p", "dbg__note",
      "One save per customer, taken the moment they walk in — every customer of every day, "
      + "oldest first. Open one to go back to that moment; the saves under it are deleted."));

    if (!list.length) {
      card.appendChild(Engine.el("p", "dbg__empty", "No saves yet."));
    } else {
      var box = Engine.el("div", "dbg__list");
      var day = null;
      list.forEach(function (s) {
        if (s.day !== day) {
          day = s.day;
          var head = Engine.el("h3", "dbg__day", "Day " + day);
          head.id = "dbgday" + day;
          box.appendChild(head);
        }
        var now = s.i === last;
        var row = Engine.btn("dbg__row" + (now ? " dbg__row--now" : ""), "", function () {
          if (now) { Engine.openDebug(false); return; }
          Engine.rewind(s.i);
        });
        row.appendChild(Engine.el("span", "dbg__n", s.n + (s.of ? "/" + s.of : "")));
        row.appendChild(Engine.el("span", "dbg__who",
          (s.label || "—") + (s.hand ? " · saved by hand" : "")));
        var chips = Engine.el("span", "dbg__chips");
        chip(chips, s.served, "served");
        chip(chips, s.pots, "pots");
        chip(chips, s.pages, "pages");
        chip(chips, s.named, "named");
        if (s.doors)  chip(chips, s.doors, "doors");
        if (s.papers) chip(chips, s.papers, "notes");
        if (s.confusion) chip(chips, s.confusion, "confused");
        row.appendChild(Engine.el("span", "dbg__time", clock(s.at)));
        row.appendChild(chips);
        row.appendChild(Engine.el("span", "dbg__go", now ? "current" : "restore"));
        box.appendChild(row);
      });
      card.appendChild(box);
    }

    var acts = Engine.el("div", "dbg__acts");
    acts.appendChild(Engine.btn("linkbtn dbg__wipe", "Delete all saves", function () {
      Engine.clearSnaps();
    }));
    acts.appendChild(Engine.btn("bookbtn", "Save now", function () {
      Engine.takeSnap(null, true);
      Engine.openDebug(true);
    }));
    acts.appendChild(Engine.btn("primary", "Close", function () { Engine.openDebug(false); }));
    card.appendChild(acts);

    scrim.appendChild(card);
    root.appendChild(scrim);

    /* Day one at the top, and you scroll down through the fortnight. The list
       used to open at the newest save, which is what made the early days look
       like they were not being kept. */
  }

  /* Shift+D reaches it from anywhere, including the evenings and the opening,
     where the top bar is hidden. Never while something is being typed into. */
  window.addEventListener("keydown", function (e) {
    if (!Engine.state) return;
    var t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                                     || t.tagName === "SELECT" || t.isContentEditable);
    if (e.key === "Escape" && Engine.state.debug) { Engine.openDebug(false); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      Engine.openDebug(!Engine.state.debug);
    }
  });

  Engine.registerRegion("debug", render);
})();
