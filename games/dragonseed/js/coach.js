/* coach.js — the walkthrough on the very first customer.
 *
 * It is a scripted sale, not a list of tips. Each step flashes the exact
 * control you are meant to touch and refuses to move on until you have touched
 * it, so a child can finish their first customer without being told anything
 * out loud. The panel lives in the right rail, in the slot the old day-log
 * held — under the counter, above Book and Map — because that is the one place
 * nothing clickable sits behind.
 *
 * Anchors. A step names the elements to flash, as strings the regions test
 * with `Coach.has()`:
 *
 *   line          the customer's own words
 *   tools         the Book button        search   the book's search field
 *   pot:<id>      that pot on the shelf  index:<id>  that row in the index
 *   obs:<axis>    that lens button       chip:<axis> that filter chip
 *   claim         "This is it!"          give     the drop zone
 *   map           the Map button         mapcell  that square on the map
 *
 * The step is DERIVED from the game state and ratcheted forward, never
 * rewound, so it cannot get out of sync with what you have actually done.
 * Step one is the only timed one: the customer's line flashes for five
 * seconds, long enough to read, and then it moves itself on.
 */

const Coach = (function () {

  var READ_MS = 5000;                 /* how long the customer's line flashes */
  var CLUES   = ["colour", "form", "petals"];   /* the three the script asks for */

  /* The Help card shows these, at any time, on any day — so they stay general.
   * The walkthrough panel shows `live` instead where there is one, which can
   * talk about this particular customer. */
  var STEPS = [
    { text: "Read what the customer is asking for." },

    { text: "Open the book and search for what they need.",
      live: function (t) {
        return Engine.state.overlay === "book"
          ? "Type “" + t.term + "” into the search."
          : "Open the book — the flashing button.";
      } },

    { text: "Find a plant on the shelf and put it on the desk.",
      live: function (t) {
        var st = Engine.state;
        if (st.onDesk !== t.id && st.bookPick !== t.id)
          return "Tap the flashing row in the book, and the flashing pot on the shelf.";
        if (st.onDesk !== t.id) return "Now put the flashing pot on the desk.";
        return backTalk(st);
      } },

    { text: "Examine it with the lens, then tap the clues to filter the book.",
      live: function () {
        return "Use the lens on colour, form and petals — then tap each clue to filter.";
      } },

    { text: "Find its page and press “This is it!”.",
      live: function (t) {
        var st = Engine.state;
        return st.bookPick === t.id ? "That is its page. Press “This is it!”." : backTalk(st);
      } },

    { text: "Give it to the customer.",
      live: function (t) { return "Drag the pot to " + t.who + ", or use the button in the lens."; } }
  ];

  /* the book may be sitting on some other plant's page, in which case the way
     to the one we want is the Index button, and the words must say so */
  function backTalk(st) {
    if (st.overlay !== "book") return "Open the book again — the flashing button.";
    return st.bookSpread > 0 ? "Go back to the Index — the flashing button."
                             : "Tap the flashing row in the book.";
  }

  /* The second walkthrough. Day one is the book and nothing else; the map turns
   * up behind the brooms that evening, so day two gets its own short run. Same
   * panel, same flashing, same rule that it will not move on until you have
   * actually done the thing. */
  var MAP_STEPS = [
    { text: "Open the map — you found it behind the brooms last night.",
      live: function () { return "Open the map — the flashing button."; } },
    { text: "The circled squares are places your aunt knew. Tap one.",
      live: function () { return "Tap the flashing square. That is somewhere she went."; } },
    { text: "Go out as often as you like — but a place you have picked clean costs you.",
      live: function () { return "That one is on the shelf, unnamed — name it in the book like "
                                 + "anything else. Go out again if you want; just not somewhere "
                                 + "you have already stripped."; } },
    { text: "Everywhere else is guesswork until somebody tells you where to look.",
      live: function () { return "Squares nobody has told you about are just heather. "
                                 + "Listen out for directions."; } }
  ];

  var mapRead = 0, mapTimer = null;

  function mapActive() {
    var st = Engine.state;
    return !Engine.inStory() && Engine.hasMap()
           && st.dayIndex === 1 && st.mapCoach >= 0;
  }

  /* a place you already know, still worth walking to — what step two points at */
  function mapTarget() {
    var h = HABITATS.find(function (x) {
      return Engine.isLocated(x.id) && Engine.exists(x) && !Engine.isShut(x) &&
             SPECIMENS.some(function (sp) { return sp.habitat === x.id && !Engine.hasPot(sp.id); });
    });
    return h ? h.cell : null;
  }

  function mapStep() {
    var st = Engine.state, s = st.mapCoach;
    if (s < 0) return -1;
    if (s === 0 && st.overlay === "map") s = 1;
    if (s === 1 && st.tripsToday > 0) s = 2;
    if (s === 2) {
      if (!mapRead) {
        mapRead = Date.now();
        mapTimer = setTimeout(function () { mapTimer = null; Engine.render(); }, READ_MS + 40);
      }
      if (Date.now() - mapRead >= READ_MS) s = 3;
    }
    if (s === 3 && st.overlay !== "map") s = -1;
    if (s !== st.mapCoach) st.mapCoach = s;
    return s;
  }

  function mapAnchors() {
    if (!mapActive()) return [];
    var i = mapStep();
    if (i < 0) return [];
    if (i === 0) return ["map"];
    if (i === 1) return mapTarget() ? ["mapcell"] : [];
    return [];
  }

  /* The third walkthrough. Day three is the day the drawer turns up, and a
   * drawer of paper is no use to anybody who has not been shown that the paper
   * DOES something. */
  var CLUE_STEPS = [
    { text: "Every scrap of paper in this shop is in one drawer. Pull it out.",
      live: function () { return "Open the drawer — the flashing tab."; } },
    { text: "Pick up a note and read it properly.",
      live: function () { return "Tap the flashing note. It opens as a sheet you can shove about."; } },
    { text: "A note gives you something: pages for the book, or somewhere to go.",
      live: function () { return "Whatever was on it is yours now — look at the foot of the sheet."; } },
    { text: "A note you have finished with gets marked, so you can see what still wants you.",
      live: function () { return "Put it down and look at the drawer. That one is done with."; } }
  ];

  var clueRead = 0, clueTimer = null;

  function clueActive() {
    var st = Engine.state;
    return !Engine.inStory() && Engine.hasDrawer()
           && st.dayIndex === 2 && st.clueCoach >= 0;
  }
  function firstNote() {
    var l = Engine.paperList();
    var undone = l.filter(function (n) { return !Engine.paperDone(n); });
    return (undone[0] || l[0] || null);
  }
  function clueStep() {
    var st = Engine.state, s = st.clueCoach;
    if (s < 0) return -1;
    if (s === 0 && st.deskView === "drawer") s = 1;
    if (s === 1 && st.openPaper) s = 2;
    if (s === 2) {
      if (!clueRead) {
        clueRead = Date.now();
        clueTimer = setTimeout(function () { clueTimer = null; Engine.render(); }, READ_MS + 40);
      }
      if (Date.now() - clueRead >= READ_MS) s = 3;
    }
    if (s === 3 && !st.openPaper) s = -1;
    if (s !== st.clueCoach) st.clueCoach = s;
    return s;
  }
  function clueAnchors() {
    if (!clueActive()) return [];
    var i = clueStep(), st = Engine.state;
    if (i < 0) return [];
    if (i === 0) return ["drawer"];
    if (i === 1) { var n = firstNote(); return n ? ["note:" + n.id] : []; }
    return [];
  }

  var VIEW = { line: "visitor", tools: "visitor", give: "visitor",
               pot: "shelf", search: "desk", index: "desk", obs: "desk",
               chip: "desk", claim: "desk", toIndex: "desk",
               map: "visitor", mapcell: "desk", drawer: "desk", note: "desk" };

  var lastStep = null;      /* so the panel's entrance plays once per step */
  var readFrom = 0;         /* when the customer's line started flashing */
  var readTimer = null;

  /* None of the three runs is live while the opening panels are up. The clock
   * on step one starts when the shop does, not when the game does. */
  function active() {
    var st = Engine.state;
    return !Engine.inStory() && st.coach >= 0
           && st.dayIndex === 0 && st.visitorIndex === 0;
  }

  /* everything the script needs to know about this particular customer */
  function target() {
    var v = Engine.visitor();
    if (!v) return null;
    var sp = Clues.canonical(v);
    if (!sp) return null;
    return { id: sp.id, name: sp.name, who: v.name,
             term: v.needs || sp.effect || sp.name.toLowerCase() };
  }

  function filtersOn(id) { return Object.keys(Engine.noteFor(id)).length; }

  /* ratchet: only ever forward, and only on things you have really done */
  function step() {
    var st = Engine.state, s = st.coach;
    if (s < 0) return -1;
    var t = target();
    if (!t) return s;

    if (s === 0) {
      if (!readFrom) {
        readFrom = Date.now();
        readTimer = setTimeout(function () { readTimer = null; Engine.render(); }, READ_MS + 40);
      }
      if (Date.now() - readFrom >= READ_MS) s = 1;
    }
    /* only the right search moves it on: this is the step that teaches you
       that the book is searched by what a plant is FOR */
    if (s === 1 && (st.bookQuery || "").toLowerCase().indexOf(t.term) !== -1) s = 2;
    /* both halves of the match, and only for the right plant of the four */
    if (s === 2 && st.onDesk === t.id && st.bookPick === t.id) s = 3;
    if (s === 3 && filtersOn(t.id) >= Math.min(CLUES.length, Clues.filterCap())) s = 4;
    if (s === 4 && Engine.isIdentified(t.id)) s = 5;
    if (s === 5 && st.served > 0) s = -1;

    if (s !== st.coach) st.coach = s;
    return s;
  }

  /* which elements the current step wants lit */
  function anchors() {
    if (!active()) return mapActive() ? mapAnchors() : clueAnchors();
    var i = step(), st = Engine.state, t = target();
    if (i < 0 || !t) return [];
    if (i === 0) return ["line"];
    if (i === 1) return st.overlay === "book" ? ["search"] : ["tools"];
    if (i === 2) {
      var a = [];
      if (st.onDesk !== t.id) a.push("pot:" + t.id);
      a = a.concat(toPage(st, t));
      return a;
    }
    if (i === 3) {
      /* an axis is either still to be looked at, or looked at and not yet
         filed — flash whichever of the two it is, never both */
      var r = st.revealed[t.id] || {}, n = Engine.noteFor(t.id), out = [];
      CLUES.forEach(function (ax) {
        if (r[ax] == null) out.push("obs:" + ax);
        else if (n[ax] == null) out.push("chip:" + ax);
      });
      return out;
    }
    /* filtering drops you back on the index, so step five usually has to walk
       you to the page before it can point at the claim button */
    if (i === 4) return st.bookPick === t.id ? ["claim"] : toPage(st, t);
    return ["give"];
  }

  /* how to get to the plant's page from wherever the book is now. Turning to
     some other entry hides the index, so the way back is the Index button. */
  function toPage(st, t) {
    if (st.bookPick === t.id) return [];
    if (st.overlay !== "book") return ["tools"];
    return st.bookSpread > 0 ? ["toIndex"] : ["index:" + t.id];
  }

  var cache = { frame: -1, list: [] };
  function list() {
    /* anchors() is asked for by five regions in a row; work it out once */
    var f = Engine.frame ? Engine.frame() : 0;
    if (cache.frame !== f) { cache.frame = f; cache.list = anchors(); }
    return cache.list;
  }
  function has(key) { return list().indexOf(key) !== -1; }

  /* the shop is one column at a time on a phone, so point at the right tab */
  function syncTabs() {
    var a = list()[0] || "";
    var want = VIEW[a.split(":")[0]] || null;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.classList.toggle("is-coached", b.getAttribute("data-view") === want);
    });
  }

  function steps() { return active() ? STEPS : mapActive() ? MAP_STEPS : CLUE_STEPS; }
  function stepNow() {
    return active() ? step() : mapActive() ? mapStep() : clueActive() ? clueStep() : -1;
  }

  function textOf(i, live) {
    var st = steps()[i];
    if (!st) return "";
    if (!live || !st.live) return st.text;
    var t = target();
    return t ? st.live(t) : st.text;
  }

  /* Easy plant mode, offered wherever "How to play" is: on the walkthrough card
     while it is up, and in the help card for ever after. */
  function toggle() {
    var on = !!Engine.state.easyPlants;
    var b = Engine.btn("switch" + (on ? " switch--on" : ""), "",
      function () { Engine.setEasyPlants(!on); },
      on ? "Easy plant mode is on — turn it off"
         : "Easy plant mode is off — turn it on");
    /* the card it sits on moves itself when you click it — pressing the switch
       must not also send the card across the screen */
    b.addEventListener("click", function (e) { e.stopPropagation(); });
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.appendChild(Engine.el("span", "switch__track", ""));
    b.appendChild(Engine.el("span", "switch__label", "Easy plant mode"));
    b.appendChild(Engine.el("span", "switch__hint",
      on ? "the book shows the painted plants"
         : "the book shows the drawn plates"));
    return b;
  }

  function line(cls, n, text) {
    var row = Engine.el("div", "coach__step " + cls);
    row.appendChild(Engine.el("span", "coach__n", String(n)));
    row.appendChild(Engine.el("p", "coach__text", text));
    return row;
  }

  /* Which bottom corner the panel is parked in. It starts bottom left and
     moves out of the way the moment you go near it — hover or tap — because
     the thing it is telling you to press is sometimes underneath it. It stays
     where you put it until you go near it again. */
  var side = "left", lastFlip = 0;
  function flip() {
    /* A tap fires mouseenter AND click on the same element, which flipped the
       card twice and left it exactly where it started. One move per gesture. */
    var now = Date.now();
    if (now - lastFlip < 450) return;
    lastFlip = now;
    side = side === "left" ? "right" : "left";
    Engine.render();
  }

  /* its own fixed region now: over the shop, bottom corner, out of the rail */
  function render(root) {
    syncTabs();
    var run = active() ? "book" : mapActive() ? "map" : clueActive() ? "clue" : null;
    if (!run) { lastStep = null; return; }
    var LIST = steps();
    var i = stepNow();
    if (i < 0 || !LIST[i]) { lastStep = null; return; }

    var turned = lastStep !== run + i;
    lastStep = run + i;

    var box = Engine.el("section", "coach coach--" + side + (turned ? " coach--turn" : ""));
    box.setAttribute("role", "note");
    box.setAttribute("aria-live", "polite");
    /* pointerenter covers mouse and pen; click covers touch, where there is no
       hover at all. The guard above stops the two counting twice. */
    box.addEventListener("pointerenter", flip);
    box.addEventListener("click", flip);

    var head = Engine.el("div", "coach__head");
    head.appendChild(Engine.el("h3", "coach__title", "How to play"));
    var pips = Engine.el("div", "coach__pips");
    LIST.forEach(function (_, k) {
      pips.appendChild(Engine.el("span", "pip" + (k < i ? " pip--done" : k === i ? " pip--now" : "")));
    });
    head.appendChild(pips);
    box.appendChild(head);

    box.appendChild(line("coach__step--now", i + 1, textOf(i, true)));
    if (LIST[i + 1]) box.appendChild(line("coach__step--next", i + 2, textOf(i + 1, false)));

    box.appendChild(Engine.el("p", "coach__of",
      "Step " + (i + 1) + " of " + LIST.length + " — "
      + (run === "map" ? "finding your way about"
         : run === "clue" ? "the drawer under the counter"
         : "this only shows for your first customer")));
    root.appendChild(box);
  }

  Engine.registerRegion("coach", render);

  return { render: render, has: has, toggle: toggle, STEPS: STEPS, MAP_STEPS: MAP_STEPS,
           CLUE_STEPS: CLUE_STEPS, mapTarget: mapTarget, textOf: textOf };
})();
