/* desk.js — the centre of the screen and the biggest thing on it.
 *
 * ONE specimen at a time. Several pots scattered across a workspace was clutter
 * and made every one of them small; a single specimen drawn large enough to
 * actually study is the point of the room. Drag another over and it swaps; drag
 * this one back to the rail (or press Escape) and the desk is bare again.
 *
 * The lens is docked BESIDE the book rather than under it, and it carries the
 * selected specimen's plate at the top. That matters: opening the book hides the
 * desk surface, so without a plate in the lens the thing you are trying to
 * identify vanished off screen exactly when you needed to compare it to a page.
 *
 * Book and Map live in the right-hand rail under the visitor, not in a header
 * here, so the desk is all workspace.
 */

(function () {

  function renderDesk(root) {
    var st = Engine.state;

    /* When a specimen is on the desk the lens FLOATS over the right of the
       bench rather than taking a column out of it. Squeezing the bench
       re-cropped the photograph of the desk underneath, so the whole shop
       appeared to shuffle sideways every time you picked something up. */
    var floats = st.onDesk && !st.overlay;
    var wrap = Engine.el("div", "desk__wrap" + (st.overlay ? " desk__wrap--split" : "")
                                             + (floats ? " desk__wrap--float" : ""));
    root.appendChild(wrap);

    var surface = Engine.el("div", "surface" + (floats ? " surface--lens" : ""));
    wrap.appendChild(surface);

    /* The drawer takes over the desk surface. It is a drawer, not a panel:
       you pull it out, the bench goes away, and the notes are lying in it. The
       tab is part of the empty bench: once a specimen is standing on the desk
       the desk is in use, and the handle goes away with everything else. */
    if (Engine.hasDrawer() && (st.deskView === "drawer" || Coach.has("drawer")))
      surface.appendChild(renderDrawerTab());

    if (st.deskView === "drawer" && Engine.hasDrawer()) {
      surface.appendChild(renderDrawer());
      Engine.registerZone(surface, function (payload) {
        if (payload.kind === "pot") { Engine.setDeskView("bench"); Engine.placeOnDesk(payload.id); }
      });
      if (st.onDesk) wrap.appendChild(renderLens(st.onDesk));
      if (st.overlay === "book") wrap.insertBefore(Book.render(), wrap.firstChild);
      if (st.overlay === "map")  wrap.insertBefore(GameMap.render(), wrap.firstChild);
    else GameMap.stow();
      if (st.overlay) surface.classList.add("surface--tucked");
      return;
    }

    if (!st.onDesk) {
      /* An empty desk is the one moment nothing else is going on, so it is
         where the three things you can open live: the book, the chart and the
         drawer, big enough to hit. The moment a specimen is standing here the
         desk is a workbench again and they are gone. */
      var empty = Engine.el("div", "empty");
      empty.appendChild(renderDeskDoors());
      empty.appendChild(Engine.el("p", "empty__hint",
        "Or bring a specimen over from the shelves — drag one, or click it."));
      surface.appendChild(empty);
    } else {
      var s = Clues.specimenById(st.onDesk);
      var known = Engine.isIdentified(s.id);
      var stand = Engine.el("div", "stand" + (known ? " stand--named" : ""));
      stand.tabIndex = 0;
      stand.setAttribute("aria-label", (known ? s.name : "unnamed specimen")
        + ". Drag it to the shelves, or press Escape, to put it back.");
      var art = Engine.el("div", "stand__art");
      art.innerHTML = Plate.art(s, { w: 248, h: 248 });
      /* a tap on the picture opens it big; a drag still drags, because the
         drag controller only starts once the pointer has actually moved */
      Engine.onTap(art, function (e) {
        e.stopPropagation(); Engine.lookCloser(s.id, "plant");
      });
      art.title = "Look closer";
      stand.appendChild(art);
      stand.appendChild(Engine.el("div", "stand__tag" + (known ? "" : " stand__tag--unknown"),
                                  known ? s.name : "unnamed"));
      stand.addEventListener("keydown", function (e) {
        if (e.key === "Escape") Engine.returnToShelf(s.id);
      });
      Engine.makeDraggable(stand, { kind: "pot", id: s.id }, Plate.art(s, { w: 88, h: 88 }));
      surface.appendChild(stand);
    }

    Engine.registerZone(surface, function (payload) {
      if (payload.kind === "pot") Engine.placeOnDesk(payload.id);
    });

    if (st.onDesk) wrap.appendChild(renderLens(st.onDesk));

    if (st.overlay === "book") wrap.insertBefore(Book.render(), wrap.firstChild);
    if (st.overlay === "map")  wrap.insertBefore(GameMap.render(), wrap.firstChild);
    else GameMap.stow();
    if (st.overlay) surface.classList.add("surface--tucked");
  }

  /* The three ways out of an empty desk. */
  /* The three things on the desk, drawn as the things they are: a book you
   * could pick up, a chart folded into eights, a drawer with paper in it. An
   * emoji and a paragraph of explanation was a menu; this is a desk. */
  /* which painted object stands for each of the three things on the desk */
  /* drawer_open, not drawer_front: the background remover ate the drawer front
     and left nothing but the brass handle floating on transparency (97% of
     that file is empty). The open drawer full of paper is the better picture
     for this button anyway — it is what pressing it gives you. */
  var DOOR_ART = { book: "book_closed", map: "map_paper", clues: "drawer_open" };

  var ICON = {
    book:
      '<svg viewBox="0 0 92 92" aria-hidden="true">' +
      '<path d="M20 16h44a8 8 0 0 1 8 8v52a6 6 0 0 1-6 6H24a8 8 0 0 1-8-8V24a8 8 0 0 1 4-8z"' +
      ' fill="#6d3f2a" stroke="#3a2418" stroke-width="2.5"/>' +
      '<path d="M24 20h44v56H26a4 4 0 0 1-4-4V24a4 4 0 0 1 2-4z" fill="#8a5334"/>' +
      '<rect x="28" y="22" width="42" height="52" rx="3" fill="#f6efdc" stroke="#c9b98f" stroke-width="1.6"/>' +
      '<path d="M34 32h30M34 40h30M34 48h22M34 56h26M34 64h18" stroke="#c2b189" stroke-width="2"' +
      ' stroke-linecap="round"/>' +
      '<path d="M18 20v56" stroke="#3a2418" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="62" y="40" width="12" height="14" rx="2.5" fill="#c99a3d" stroke="#7d5a1e" stroke-width="2"/>' +
      '</svg>',
    map:
      '<svg viewBox="0 0 92 92" aria-hidden="true">' +
      '<path d="M8 24 32 16l28 10 24-8v50l-24 8-28-10-24 8z" fill="#efe6cb" stroke="#8c7a52" stroke-width="2.5"' +
      ' stroke-linejoin="round"/>' +
      '<path d="M32 16v50M60 26v50" stroke="#8c7a52" stroke-width="2" stroke-dasharray="4 4"/>' +
      '<path d="M12 46c8-10 18 6 26-4s16 8 26-2 14 2 18 0" stroke="#7f9a6a" stroke-width="2.6" fill="none"' +
      ' stroke-linecap="round"/>' +
      '<path d="M16 62c10-4 16 2 26-2" stroke="#6f8fa8" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M64 44l10 10M74 44l-10 10" stroke="#a8452c" stroke-width="3.4" stroke-linecap="round"/>' +
      '<circle cx="24" cy="34" r="3" fill="#a8452c"/>' +
      '</svg>',
    clues:
      '<svg viewBox="0 0 92 92" aria-hidden="true">' +
      '<path d="M26 20h40v22H26z" fill="#f6efdc" stroke="#c2b189" stroke-width="2" transform="rotate(-5 46 31)"/>' +
      '<path d="M30 16h34v24H30z" fill="#fffaf0" stroke="#c2b189" stroke-width="2" transform="rotate(4 47 28)"/>' +
      '<path d="M36 24h22M36 30h16" stroke="#c2b189" stroke-width="2" stroke-linecap="round"' +
      ' transform="rotate(4 47 28)"/>' +
      '<rect x="10" y="40" width="72" height="38" rx="5" fill="#6d5636" stroke="#3a2c18" stroke-width="2.5"/>' +
      '<rect x="16" y="46" width="60" height="26" rx="3" fill="#8a6f45"/>' +
      '<rect x="36" y="55" width="20" height="7" rx="3.5" fill="#c99a3d" stroke="#7d5a1e" stroke-width="2"/>' +
      '</svg>'
  };

  function renderDeskDoors() {
    var st = Engine.state;
    var row = Engine.el("div", "doors");

    function door(key, label, on, coach, go) {
      var b = Engine.btn("door door--" + key + (on ? " door--on" : "")
                         + (Coach.has(coach) ? " is-coached" : ""), "", go, label);
      var art = Engine.el("span", "door__icon");
      /* the painted object if it exists, the drawn icon if not */
      var pic = typeof Art !== "undefined" && Art.asset(DOOR_ART[key]);
      art.innerHTML = pic ? Art.img(pic, { alt: "" }) : ICON[key];
      b.appendChild(art);
      b.appendChild(Engine.el("span", "door__label", label));
      return b;
    }

    row.appendChild(door("book", "Book", st.overlay === "book", "book",
      function () { Engine.openOverlay(st.overlay === "book" ? null : "book"); }));

    if (Engine.hasMap())
      row.appendChild(door("map", "Map", st.overlay === "map", "map",
        function () { Engine.openOverlay(st.overlay === "map" ? null : "map"); }));

    if (Engine.hasDrawer()) {
      var dr = door("clues", "Drawer", st.deskView === "drawer", "drawer",
                    function () { Engine.setDeskView("drawer"); });
      var left = Engine.unreadPapers();
      if (left) dr.appendChild(Engine.el("span", "door__n", String(left)));
      row.appendChild(dr);
    }
    return row;
  }

  /* ---------------- the clues drawer ----------------
   * Everything ends up here. Every note, torn leaf and handbill in the
   * game ends up in this drawer, and a note you have finished with — its pages
   * in your book, its directions on your map — is stamped so, because by the
   * second week there are fourteen of them and only two that still want you.
   */
  function renderDrawerTab() {
    var open = Engine.state.deskView === "drawer";
    var left = Engine.unreadPapers();
    var b = Engine.btn("drawertab" + (open ? " drawertab--open" : "")
                       + (Coach.has("drawer") ? " is-coached" : ""),
      "", function () { Engine.setDeskView(open ? "bench" : "drawer"); });
    b.appendChild(Engine.el("span", "drawertab__pull", open ? "▾" : "▸"));
    b.appendChild(Engine.el("span", "drawertab__label", open ? "Close the drawer" : "Open the drawer"));
    if (left) b.appendChild(Engine.el("span", "drawertab__n", String(left)));
    return b;
  }

  /* The drawer holds the notes themselves, shrunk. Each one is the real sheet
     — same paper, same hand, same words — drawn at about a third size and
     lying where you left it. Tap one and it grows to full size about its own
     centre, so it does not jump across the drawer as it opens; tap the bare
     wood and it shrinks again. Drag any of them, open or shut.
     They arrive in the order the story gave them to you and lay themselves out
     in rows until you move one, after which that one stays where you put it. */

  /* how many across, given how many there are */
  function perRowFor(total) { return Math.max(3, Math.ceil(Math.sqrt(total * 1.6))); }

  /* The shrunk size, remembered between renders. Every drop re-renders the
     drawer, and if the scale started at its CSS default and was corrected a
     frame later, every drop ended with the whole pile breathing. */
  var pileK = null, upK = null;

  /* Which note was open last time we drew, so opening and shutting can be
     animated: the element is rebuilt each render, so without knowing where it
     came from there is nothing to tween from. */
  var lastOpen = null;

  /* The order the papers are stacked in, most recently touched last. Picking
     one up brings it to the top and it stays there, the way it would if you
     actually pulled it out of a pile. */
  var stack = [];
  function toTop(id) {
    var i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    stack.push(id);
  }

  /* A seeded tilt, so the drawer reads as a pile of loose paper rather than a
     broken grid — and so the same note always lies at the same angle. */
  function tiltOf(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return ((h % 900) / 100 - 4.5).toFixed(2);      // -4.5deg .. +4.5deg
  }

  /* The default resting place of the nth note, as a fraction of the drawer.
     Inset from the edges by roughly half a shrunken note, so nothing arrives
     already hanging over the side. */
  var PADX = 0.17, PADY = 0.21;
  function homeOf(i, total) {
    var perRow = Math.max(3, Math.ceil(Math.sqrt(total * 1.6)));
    var rows = Math.max(1, Math.ceil(total / perRow));
    var col = i % perRow, row = Math.floor(i / perRow);
    return { x: PADX + (col + 0.5) * (1 - 2 * PADX) / perRow,
             y: PADY + (row + 0.5) * (1 - 2 * PADY) / rows };
  }

  function paperInto(box, n) {
    var body = Engine.el("div", "paper__body");
    body.appendChild(Engine.el("h3", "paper__title", n.title));
    body.appendChild(Engine.el("p", "paper__by", n.byline));
    n.body.split("\n\n").forEach(function (para) {
      body.appendChild(Engine.el("p", "paper__p", para));
    });
    var got = [];
    (n.gives || []).forEach(function (pid) {
      var sp = Clues.specimenById(pid);
      if (sp) got.push("the book page for " + sp.name);
    });
    (n.points || []).forEach(function (hid) {
      var h = Clues.habitatById(hid);
      if (h) got.push("where to find " + h.name);
    });
    if (got.length) {
      var tookit = Engine.el("p", "paper__got");
      tookit.appendChild(Engine.el("span", "paper__gotlab", "Taken from this: "));
      tookit.appendChild(document.createTextNode(got.join("; ") + "."));
      body.appendChild(tookit);
    }
    box.appendChild(body);
  }

  /* Shrink the writing until it fits inside the painted margins.
     A sheet is a fixed shape and the drawn paper leaves whatever room it
     leaves, so the words have to give. Comes down in steps and stops at 62%,
     below which it is not worth reading anyway — a note that long gets
     clipped, and that is the note art's fault, not the reader's. */
  function fitText(body) {
    body.style.removeProperty("--fs");
    body.classList.remove("is-tall");
    if (body.scrollHeight <= body.clientHeight + 1) return;
    body.classList.add("is-tall");
    for (var f = 0.96; f >= 0.62; f -= 0.04) {
      body.style.setProperty("--fs", f.toFixed(2));
      if (body.scrollHeight <= body.clientHeight + 1) {
        body.classList.remove("is-tall");
        return;
      }
    }
  }

  function renderDrawer() {
    var st = Engine.state;
    var box = Engine.el("div", "drawer");
    var notes = Engine.paperList();
    if (!notes.length) {
      box.appendChild(Engine.el("p", "surface__hint", "Nothing in the drawer but string."));
      return box;
    }

    /* clicking the bare wood puts the open one down */
    box.addEventListener("pointerdown", function (e) {
      if (e.target === box && st.openPaper) Engine.closePaper();
    });

    var shrunk = [];
    notes.forEach(function (n, i) {
      var up = st.openPaper === n.id;
      var read = !!st.papersRead[n.id];
      var done = Engine.paperDone(n);
      var at = st.noteAt[n.id] || homeOf(i, notes.length);

      /* Each note has its own painted sheet, keyed by paper id. When there is
         one it becomes the background and the drawn edges replace the border;
         when there is not, the plain paper underneath is still the right shape. */
      var sheet = (typeof Art !== "undefined" && Art.note(n.id)) || null;

      var el = Engine.el("div", "note2 paper paper--" + n.kind + " paper--" + n.id
        + (sheet ? " paper--art" : "")
        + (up ? " note2--up" : "") + (done ? " paper--done" : "")
        + (Coach.has("note:" + n.id) ? " is-coached" : ""));
      if (sheet) el.style.backgroundImage = Art.css(sheet);
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("aria-label", n.title + (read ? ", read" : ", unread")
                                    + (up ? ", open" : ""));
      el.style.left = (at.x * 100) + "%";
      el.style.top  = (at.y * 100) + "%";
      var si = stack.indexOf(n.id);
      el.style.zIndex = up ? 90 : 10 + (si >= 0 ? 30 + si : i);

      /* The size and the angle it should end at — and, when it has just been
         opened or shut, the ones it should start from, so the change is a
         movement and not a jump. */
      var kTo   = up ? (upK || 1) : (pileK || 0.2);
      var rotTo = up ? 0 : tiltOf(n.id);
      var justOpened = up && lastOpen !== n.id;
      var justClosed = !up && lastOpen === n.id;
      var kFrom   = justOpened ? (pileK || 0.2) : justClosed ? (upK || 1) : kTo;
      var rotFrom = justOpened ? tiltOf(n.id) : justClosed ? 0 : rotTo;
      el.style.setProperty("--k", String(kFrom));
      el.style.setProperty("--rot", rotFrom + "deg");
      if (justOpened || justClosed) requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.setProperty("--k", String(kTo));
          el.style.setProperty("--rot", rotTo + "deg");
        });
      });
      paperInto(el, n);
      requestAnimationFrame(function () { fitText(el.querySelector(".paper__body")); });
      /* Opened out it wants to be its real size, but never bigger than the
         drawer it is lying in. Measured after it is in the document. */
      if (up) requestAnimationFrame(function () {
        var b = box.getBoundingClientRect();
        if (!b.height) return;
        upK = Math.max(0.4, Math.min(1, (b.width - 28) / el.offsetWidth,
                                        (b.height - 60) / el.offsetHeight));
        el.style.setProperty("--k", String(upK));
        keepIn(el, box);
      });

      /* the tick only exists once you have read it, and taking it off is how
         you tell yourself you have not finished with it after all */
      if (read) {
        var tick = Engine.btn("paper__read", "\u2713",
          function (e) { if (e) e.stopPropagation(); Engine.toggleRead(n.id); },
          "Read — press to mark it unread");
        tick.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        el.appendChild(tick);
      }
      if (done) el.appendChild(Engine.el("span", "paper__done", "done with"));

      shove(el, n, box);
      if (!up) shrunk.push(el);
      el.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (up) Engine.closePaper(); else Engine.readPaper(n.id);
      });
      box.appendChild(el);
    });
    lastOpen = st.openPaper;

    /* One measuring pass once it is all in the document: shrink the pile to
       whatever will actually fit across the drawer, then tuck in any stragglers. */
    var perRow = perRowFor(notes.length);
    requestAnimationFrame(function () {
      var b = box.getBoundingClientRect();
      if (!b.width) return;
      /* Twice the size they were: at a third of that the paintings were too
         small to tell apart, which is the only thing the pile has to do. */
      pileK = Math.max(0.20, Math.min(0.42, (b.width / perRow - 14) / 560));
      shrunk.forEach(function (el) {
        el.style.setProperty("--k", String(pileK));
        keepIn(el, box);
      });
    });
    return box;
  }

  /* Pick a note up and it follows the pointer. Let go without having moved and
     it counts as a tap, which opens or closes it — one gesture, two meanings,
     told apart by whether anything actually moved. */
  /* Nudge a note back inside the drawer if it is hanging over an edge — which
     an open one often is, because it grew. */
  function keepIn(el, box) {
    var b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!b.width || !r.width) return;
    var hx = (r.width / 2 + 6) / b.width, hy = (r.height / 2 + 6) / b.height;
    var x = (r.left + r.width / 2 - b.left) / b.width;
    var y = (r.top + r.height / 2 - b.top) / b.height;
    var cx = Math.min(1 - hx, Math.max(hx, x)), cy = Math.min(1 - hy, Math.max(hy, y));
    if (Math.abs(cx - x) > 0.001) el.style.left = (cx * 100) + "%";
    if (Math.abs(cy - y) > 0.001) el.style.top  = (cy * 100) + "%";
  }

  function shove(el, n, box) {
    var d = null;
    el.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      var b = box.getBoundingClientRect();
      d = { x0: e.clientX, y0: e.clientY, moved: false, b: b };
      toTop(n.id);
      el.style.zIndex = 80;               // straight away, without a re-render
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener("pointermove", function (e) {
      if (!d) return;
      if (!d.moved && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) return;
      d.moved = true;
      el.classList.add("note2--moving");
      var r = el.getBoundingClientRect();
      var hx = (r.width / 2 + 6) / d.b.width, hy = (r.height / 2 + 6) / d.b.height;
      var x = Math.min(1 - hx, Math.max(hx, (e.clientX - d.b.left) / d.b.width));
      var y = Math.min(1 - hy, Math.max(hy, (e.clientY - d.b.top)  / d.b.height));
      el.style.left = (x * 100) + "%";
      el.style.top  = (y * 100) + "%";
      d.at = { x: x, y: y };
    });
    function end() {
      if (!d) return;
      var was = d;
      d = null;
      el.classList.remove("note2--moving");
      if (was.moved && was.at) { Engine.setNoteAt(n.id, was.at.x, was.at.y, true); return; }
      if (Engine.state.openPaper === n.id) Engine.closePaper();
      else Engine.readPaper(n.id);
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", function () { d = null; el.classList.remove("note2--moving"); });
  }

  var LENS_ORDER = [
    { axis: "colour", label: "Colour",  icon: "\u{1F441}" },
    { axis: "form",   label: "Form",    icon: "✿" },
    { axis: "petals", label: "Petals",  icon: "\u{1F522}" },
    { axis: "leaf",   label: "Leaf",    icon: "\u{1F343}" },
    { axis: "stem",   label: "Stem",    icon: "\u{1F33F}" },
    { axis: "scent",  label: "Scent",   icon: "\u{1F443}" },
    { axis: "berry",  label: "Berries", icon: "\u{1FAD0}" },
    { axis: "mark",   label: "Closer",  icon: "✨" }
  ];

  function renderLens(id) {
    var st = Engine.state;
    var s = Clues.specimenById(id);
    var known = Engine.isIdentified(id);
    var r = st.revealed[id] || {};

    var lens = Engine.el("aside", "lens");
    lens.setAttribute("aria-label", "Inspection lens");

    var bar = Engine.el("div", "lens__bar");
    bar.appendChild(Engine.el("span", "lens__eyebrow", known ? "Named" : "Unnamed specimen"));
    bar.appendChild(Engine.btn("iconbtn", "✕", function () { Engine.returnToShelf(id); }, "Put it back"));
    lens.appendChild(bar);

    /* The specimen itself, right under the heading — but only when the book or
       map has covered the desk surface. Otherwise the big card on the desk is
       two inches to the left and a second copy is just clutter. */
    if (st.overlay) {
      var art = Engine.el("div", "lens__art lens__art--big");
      art.innerHTML = Plate.art(s, { w: 212, h: 212 });
      Engine.onTap(art, function () { Engine.lookCloser(s.id, "plant"); });
      art.title = "Look closer";
      lens.appendChild(art);
    }

    if (known) {
      lens.appendChild(Engine.el("h3", "lens__name", s.name));
      lens.appendChild(Engine.el("p", "lens__bin", s.binomial));
    }

    var obs = Engine.el("div", "lens__obs");
    var seen = 0;
    LENS_ORDER.forEach(function (a) {
      if (r[a.axis] == null) return;
      seen++;
      var row = Engine.el("div", "feat");
      row.appendChild(Engine.el("span", "feat__k", a.label));
      row.appendChild(Engine.el("span", "feat__v", Clues.chipText(a.axis, r[a.axis])));
      obs.appendChild(row);
    });
    if (!seen) obs.appendChild(Engine.el("p", "muted", "Examine the plant."));
    lens.appendChild(obs);

    if (!known) {
      var acts = Engine.el("div", "acts");
      LENS_ORDER.forEach(function (a) {
        if (r[a.axis] != null) return;
        acts.appendChild(Engine.btn("act" + (Coach.has("obs:" + a.axis) ? " is-coached" : ""),
                                    a.icon + " " + a.label, function () { Engine.reveal(id, a.axis); }));
      });
      if (!acts.childNodes.length) acts.appendChild(Engine.el("p", "muted", "You've seen everything there is to see."));
      lens.appendChild(acts);

      if (st.overlay === "book") {
        lens.appendChild(Engine.el("p", "lens__cue",
          "Now find its page. Tap the entry you think this is."));
      } else {
        lens.appendChild(Engine.btn("primary", "\u{1F4D6} Name it in the book",
                                    function () { Engine.openOverlay("book"); }));
      }
    } else {
      lens.appendChild(Engine.el("p", "lens__plate", s.plate));
      var ub = Engine.el("div", "lens__useblock");
      ub.appendChild(Engine.el("h4", "lens__uselab", "Used for"));
      ub.appendChild(Engine.el("p", "lens__useline", Clues.effectText(s.effect)));
      ub.appendChild(Engine.el("p", "lens__use", s.use));
      lens.appendChild(ub);
      var v = Engine.visitor();
      if (v && v.kind !== "visit" && !st.dayOver)
        lens.appendChild(Engine.btn("primary", "Give to " + v.name, function () { Engine.give(id); }));
    }

    lens.appendChild(Engine.btn("linkbtn", "Put back on the shelf", function () { Engine.returnToShelf(id); }));
    return lens;
  }

  Engine.registerRegion("desk", renderDesk);
})();
