/* map.js — Morrowfen, as a map you actually read.
 *
 * The old version was a list of cards with a "Gather here" button on each, which
 * is a menu wearing a map's clothes. This one is the real gesture: a drawn map
 * with lettered columns and numbered rows. Being told about a place gives you a
 * LEAD — a sentence describing where it is — and you have to work out the square
 * and click it. Get it right and the place is pinned for good.
 *
 * A pinned place can be gathered at any time and turns up one specimen you have
 * never seen. There is no cap on trips: the cost is that walking out to a place
 * with nothing left growing on it earns you a pip of confusion. That is the only way
 * to reach the 25 plants the story never hands you.
 */

const GameMap = (function () {

  /* Whether the leads panel is put away, and how many leads it was showing when
     we last looked — a way of looking at the map rather than a fact about the
     shop, so it lives here and not in the save. */
  var shutLeads = false, lastLeads = -1, wasOpen = false;

  function render() {
    var st = Engine.state;
    var sheet = Engine.el("section", "sheet sheet--map");
    sheet.setAttribute("aria-label", "Map of Morrowfen");

    /* Title, what to do, and the way out — one row. The instruction used to be
       a paragraph of its own under the header, which pushed the chart down the
       screen for a sentence you read once. */
    var leads = Engine.openLeads();
    var bar = Engine.el("header", "sheet__bar");
    bar.appendChild(Engine.el("h2", "sheet__title", "Morrowfen"));
    bar.appendChild(Engine.el("p", "sheet__count", st.tripsToday
      ? "Out " + (st.tripsToday === 1 ? "once" : st.tripsToday + " times")
        + " today. Go again — an empty-handed trip costs a pip."
      : "Click a place to go out to it. An empty-handed trip costs a pip."));

    /* A new lead opens the panel by itself: it is the thing you have just been
       told, and hiding that behind a button you have to know about is worse
       than the old layout was. Put it away and it stays away until the next
       one arrives. */
    /* Opening the chart, or being told about somewhere new, puts the leads back
       in front of you. Without the first of those, one click on a square hid
       them for the rest of the day — you had to know the button was there. */
    if (!wasOpen || leads.length !== lastLeads) shutLeads = false;
    lastLeads = leads.length;
    wasOpen = true;

    bar.appendChild(Engine.btn("iconbtn", "✕", Engine.closeOverlay, "Close the map"));
    sheet.appendChild(bar);

    /* The leads used to sit in the flow above the chart, which shoved the
       squares off the bottom of the screen exactly when you had the most to
       look for. Now they float over a corner of the map instead. */
    if (leads.length && !shutLeads) {
      var box = Engine.el("div", "leads");
      var lh = Engine.el("div", "leads__head");
      lh.appendChild(Engine.el("h3", "leads__title",
        leads.length === 1 ? "You've been told about a place" : "You've been told about " + leads.length + " places"));
      lh.appendChild(Engine.btn("iconbtn leads__x", "✕",
        function () { shutLeads = true; Engine.render(); }, "Put the leads away"));
      box.appendChild(lh);
      leads.forEach(function (h) {
        var n = Engine.el("p", "leads__note");
        n.appendChild(Engine.el("span", "leads__quote", "“" + h.lead + "”"));
        box.appendChild(n);
      });
      box.appendChild(Engine.el("p", "leads__hint", "Work out the square and click it."));
      sheet.appendChild(box);
    }

    /* What she changed, and when. The map is drawn for today, not for the
       valley as it was — three of these places did not exist last week. */
    var fresh = Engine.changedToday();
    if (fresh.length) {
      var box = Engine.el("div", "changed");
      box.appendChild(Engine.el("h3", "changed__title", "The map is not the same today"));
      fresh.forEach(function (c) {
        var row = Engine.el("p", "changed__row");
        row.appendChild(Engine.el("span", "changed__cell", c.cell));
        row.appendChild(document.createTextNode(" " + c.note));
        box.appendChild(row);
      });
      sheet.appendChild(box);
    }

    /* A place you have found and cannot get into asks you for a plant, in the
       same words and with the same drop zone a person would use. Only the one
       you last clicked opens up here — three at once buried the map. */
    var shut = HABITATS.filter(function (h) {
      return Engine.exists(h) && Engine.isLocated(h.id) && Engine.isShut(h);
    });
    var here = shut.find(function (h) { return h.id === st.mapPlace; });
    if (here) sheet.appendChild(renderShut(here));

    sheet.appendChild(renderBoard());

    if (Coach.has("mapcell")) {
      var want = Coach.mapTarget();
      Array.prototype.forEach.call(sheet.querySelectorAll(".mapcell"), function (c) {
        if (c.getAttribute("data-cell") === want) c.classList.add("is-coached");
      });
    }
    /* Under the chart: the way back to the leads in the middle, and the tally
       out on the right. The header row is title, instruction and the way out,
       and a fourth thing in there shoved the close button off the corner. */
    var here = Engine.habitatsToday();
    var pinned = here.filter(function (h) { return Engine.isLocated(h.id); });
    var foot = Engine.el("div", "mapfoot");
    if (!here && shut.length) {
      var tip = Engine.el("p", "shuttip");
      tip.appendChild(Engine.el("span", "shuttip__n", String(shut.length)));
      tip.appendChild(document.createTextNode(shut.length === 1
        ? " place found and shut" : " places found and shut"));
      foot.appendChild(tip);
    }
    if (leads.length)
      foot.appendChild(Engine.btn("leadbtn" + (shutLeads ? "" : " leadbtn--on"),
        (shutLeads ? "Show " : "Hide ") + leads.length
          + (leads.length === 1 ? " lead" : " leads"),
        function () { shutLeads = !shutLeads; Engine.render(); },
        "Places you have been told about"));
    var key = Engine.el("p", "mapkey");
    key.appendChild(Engine.el("span", "mapkey__n", String(pinned.length) + " of " + here.length));
    key.appendChild(document.createTextNode(" places found"));
    foot.appendChild(key);
    sheet.appendChild(foot);
    return sheet;
  }

  function renderShut(h) {
    var row = Engine.el("div", "shut");
    var head = Engine.el("div", "shut__head");
    head.appendChild(Engine.el("span", "shut__pin", h.emoji));
    head.appendChild(Engine.el("span", "shut__name", h.name + " — " + h.cell));
    head.appendChild(Engine.btn("iconbtn shut__x", "✕",
      function () { Engine.setMapPlace(null); }, "Back to the map"));
    row.appendChild(head);
    var pic = typeof Art !== "undefined" && Art.place(h.id, Engine.today().day);
    if (pic) {
      var frame = Engine.el("div", "shut__art");
      frame.innerHTML = Art.img(pic, { alt: h.name });
      row.appendChild(frame);
    }
    row.appendChild(Engine.el("p", "shut__why", h.shut));

    var drop = Engine.el("div", "give give--shut");
    drop.innerHTML = "<span class='give__label'>Drop a pot here</span>" +
                     "<span class='give__sub'>" + h.wants + "</span>";
    Engine.registerZone(drop, function (pl) {
      if (pl.kind === "pot") Engine.openPlace(h.id, pl.id);
    });
    row.appendChild(drop);

    var ready = Engine.keysFor(h);
    if (ready.length) {
      var have = Engine.el("p", "shut__have");
      have.appendChild(Engine.el("span", "shut__havelab", "On your shelf: "));
      ready.slice(0, 4).forEach(function (x) {
        have.appendChild(Engine.btn("bookbtn bookbtn--tiny", x.name,
          function () { Engine.openPlace(h.id, x.id); }));
      });
      row.appendChild(have);
    } else {
      row.appendChild(Engine.el("p", "shut__have",
        "Nothing you can name does that yet. Search the book for what it is asking for."));
    }
    return row;
  }

  function renderBoard() {
    var cols = GRID.cols, rows = GRID.rows;
    var board = Engine.el("div", "mapboard");

    board.appendChild(Engine.el("div", "mapboard__corner"));

    var top = Engine.el("div", "mapboard__cols");
    cols.forEach(function (c) { top.appendChild(Engine.el("span", "mapboard__lab", c)); });
    board.appendChild(top);

    var side = Engine.el("div", "mapboard__rows");
    for (var r = 1; r <= rows; r++) side.appendChild(Engine.el("span", "mapboard__lab", String(r)));
    board.appendChild(side);

    var plot = Engine.el("div", "mapboard__plot");
    var art = Engine.el("div", "mapboard__art");
    art.innerHTML = MapArt.svg();
    plot.appendChild(art);

    var grid = Engine.el("div", "mapgrid");
    grid.style.gridTemplateColumns = "repeat(" + cols.length + ", 1fr)";
    grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";

    for (var row = 1; row <= rows; row++) {
      for (var ci = 0; ci < cols.length; ci++) {
        var cell = cols[ci] + row;
        grid.appendChild(renderCell(cell));
      }
    }
    plot.appendChild(grid);
    board.appendChild(plot);
    return board;
  }

  function renderCell(cell) {
    var h = Engine.habitatAt(cell);
    if (h && !Engine.exists(h)) h = null;        // not there yet
    var found = h && Engine.isLocated(h.id);
    var isTown = cell === GRID.town;

    var b = Engine.el("button", "mapcell"
      + (found ? " mapcell--place" : "")
      + (isTown ? " mapcell--town" : ""));
    b.type = "button";
    b.setAttribute("data-cell", cell);

    if (isTown) {
      b.appendChild(Engine.el("span", "mapcell__pin", "⌂"));
      b.appendChild(Engine.el("span", "mapcell__name", "The Shop"));
      b.setAttribute("aria-label", "Square " + cell + ", the shop");
      b.disabled = true;
      return b;
    }

    if (found) {
      var locked = Engine.isShut(h);
      var exhausted = !locked && !SPECIMENS.some(function (s) {
        return s.habitat === h.id && !Engine.hasPot(s.id); });
      if (exhausted) b.classList.add("mapcell--done");
      if (locked) b.classList.add("mapcell--shut");
      b.appendChild(Engine.el("span", "mapcell__pin", h.emoji));
      b.appendChild(Engine.el("span", "mapcell__name", h.short || h.name));
      b.setAttribute("aria-label", "Square " + cell + ", " + h.name
        + (locked ? ", shut" : exhausted ? ", nothing new grows here" : ", gather here"));
      b.title = h.name + " — " + (locked ? h.shut : h.note);
    } else {
      b.appendChild(Engine.el("span", "mapcell__coord", cell));
      b.setAttribute("aria-label", "Square " + cell);
    }

    /* Reading a lead and then clicking a square is one gesture, so the panel
       gets out of the way as soon as you commit. If the click solved a lead the
       count changes, which opens it again on whatever is left. */
    b.addEventListener("click", function () { shutLeads = true; Engine.probeCell(cell); });
    return b;
  }

  /* The chart has been rolled up. Called by desk.js on any render where the map
     is not the thing on the bench, so that opening it again is a fresh look. */
  function stow() { wasOpen = false; }

  return { render: render, stow: stow };
})();
