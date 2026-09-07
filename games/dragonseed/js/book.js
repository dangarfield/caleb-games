/* book.js — the plant book.
 *
 * The book prints every plant's NAME from the start. That is not a spoiler: the
 * puzzle was never "guess what this is called", it is "work out which of these
 * named entries is the pot in front of you". An entry you have matched to a pot
 * carries an "identified" mark; the rest are just pages you have not placed yet.
 *
 * Layout
 *   browsing            index pages, then one plant per page, two to a spread
 *   naming a specimen   the page area is half as wide, so one plant per SPREAD:
 *                       plate and name on the left leaf, the description, the
 *                       use and the claim button on the right
 *
 * Nothing inside a leaf scrolls. The index measures the leaf and flows exactly
 * as many rows as fit, spilling the rest onto the next page — so you turn pages
 * a lot, which is what a book is for. A plant page shrinks its plate to whatever
 * height is left, the same trick the lens uses.
 *
 * Naming: three observations with the lens before a page can be claimed, a
 * wrong claim strikes that page out for the day, and the third wrong claim on
 * the same specimen costs a pip. The book never narrows itself to one answer —
 * the notes bar is capped at three observations (Clues.filterCap) precisely so
 * it stays a tool rather than a solver.
 */

const Book = (function () {

  /* The "Used for" dropdown. Hidden while the search does the same job — the
   * uses are part of every page's searchable text. Set true to bring it back. */
  var USE_PICKER = false;

  /* how many index rows fit on a leaf, measured from the rendered page */
  var indexCap = 12;
  var measurePending = false;

  /* A page turn snapshots the leaf that is about to go, and the next render
   * lays that snapshot over the new spread and swings it on the spine. The new
   * pages are already underneath, so the animation is pure decoration and can
   * be interrupted by anything without leaving the book in a wrong state. */
  var pending = null;

  function turnTo(n) {
    var cur = Engine.state.bookSpread;
    if (n === cur) return;
    var dir = n > cur ? 1 : -1;
    var leaving = document.querySelector(dir > 0 ? ".leaf--right" : ".leaf--left");
    pending = leaving ? { dir: dir, html: leaving.outerHTML } : null;
    Engine.setBookSpread(n);
  }

  /* ---------- pagination ---------- */
  function buildSpreads(entries, naming) {
    var cap = Math.max(4, indexCap);
    /* No rounding the index up to an even page count: with 23 entries at 11 a
       page that bought a whole spread of blank paper. An odd last index page
       simply faces a blank, which is what a book does. */
    var idxPages = Math.max(1, Math.ceil(entries.length / cap));

    var spreads = [];
    for (var i = 0; i < idxPages; i += 2) {
      spreads.push({ kind: "index",
        left:  { part: i,     items: entries.slice(i * cap, i * cap + cap),           no: i + 1 },
        right: { part: i + 1, items: entries.slice((i + 1) * cap, (i + 1) * cap + cap), no: i + 2 } });
    }

    var first = idxPages + 1;
    if (naming) {
      entries.forEach(function (s, n) { spreads.push({ kind: "split", s: s, no: first + n }); });
    } else {
      for (var j = 0; j < entries.length; j += 2)
        spreads.push({ kind: "pair", a: entries[j], b: entries[j + 1] || null,
                       noA: first + j, noB: first + j + 1 });
    }
    return { spreads: spreads, idxPages: idxPages, first: first, cap: cap,
             pageCount: idxPages + entries.length };
  }

  function spreadOf(built, entries, s, naming) {
    var n = entries.indexOf(s);
    if (n < 0) return 0;
    /* an odd index page count still occupies a whole spread (facing a blank) */
    var idxSpreads = Math.ceil(built.idxPages / 2);
    return idxSpreads + (naming ? n : Math.floor(n / 2));
  }

  /* ---------- the book ---------- */
  function render() {
    var st = Engine.state;
    var sel = st.onDesk;
    var target = sel ? Clues.specimenById(sel) : null;
    var naming = !!(target && !Engine.isIdentified(sel));

    var notes = naming ? Engine.noteFor(sel) : {};
    var all = Engine.bookList();
    var entries = all
      .filter(function (s) {
        if (!Clues.passesFilter(s, notes)) return false;
        if (st.bookEffect && s.effect !== st.bookEffect) return false;
        /* The box says "names" and it means it — but only for plants you have
           already named. Searching the book for a name you have not learned yet
           would hand you the answer; searching for one you have is just finding
           your own page again. (This argument was never passed, so no name has
           ever matched. It does now.) */
        return Clues.search(s, st.bookQuery, Engine.isIdentified(s.id));
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });

    var built = buildSpreads(entries, naming);
    var count = built.spreads.length;
    var at = Math.min(st.bookSpread, count - 1);
    var spread = built.spreads[at];

    var book = Engine.el("section", "book");
    book.setAttribute("aria-label", "The plant book");

    /* the search row is the header; the close button sits at the end of it */
    var tools = Engine.el("div", "book__tools");
    var q = Engine.el("input", "search");
    q.id = "bookSearch";                       // lets the engine restore the caret
    q.type = "search";
    q.placeholder = naming ? "Search by look, or by what it's for"
                           : "Search the book — names, descriptions, uses";
    q.value = st.bookQuery;
    q.setAttribute("aria-label", "Search the book");
    q.addEventListener("input", function () { Engine.setBookQuery(q.value); });
    /* the field is wrapped so "clear search" can sit inside it, reading the same
       way "clear notes" does rather than as a cryptic ✕ next to the book's own
       close button */
    var field = Engine.el("div", "searchfield" + (st.bookQuery ? " searchfield--clearable" : "")
                            + (Coach.has("search") ? " is-coached" : ""));
    field.appendChild(q);
    if (st.bookQuery)
      field.appendChild(Engine.btn("linkbtn linkbtn--inline searchfield__clear", "clear search",
                                   function () { Engine.setBookQuery(""); }));
    tools.appendChild(field);
    tools.appendChild(Engine.btn("iconbtn iconbtn--close", "✕", Engine.closeOverlay, "Close the book"));
    book.appendChild(tools);

    if (USE_PICKER) book.appendChild(renderUsePicker(all));
    if (naming) book.appendChild(renderNotes(sel, notes));

    /* the open book */
    var open = Engine.el("div", "spread" + (spread && spread.kind === "split" ? " spread--split" : ""));
    if (!spread) {
      open.appendChild(blankLeaf("left"));
      open.appendChild(Engine.el("div", "spine"));
      open.appendChild(blankLeaf("right"));
    } else if (spread.kind === "index") {
      open.appendChild(indexLeaf(spread.left,  "left",  built, entries, naming));
      open.appendChild(Engine.el("div", "spine"));
      open.appendChild(indexLeaf(spread.right, "right", built, entries, naming));
    } else if (spread.kind === "split") {
      open.appendChild(plantArtLeaf(spread.s));
      open.appendChild(Engine.el("div", "spine"));
      open.appendChild(plantTextLeaf(spread.s, spread.no, naming, sel));
    } else {
      open.appendChild(plantLeaf(spread.a, spread.noA, "left",  naming, sel));
      open.appendChild(Engine.el("div", "spine"));
      open.appendChild(spread.b ? plantLeaf(spread.b, spread.noB, "right", naming, sel)
                                : blankLeaf("right"));
    }
    if (pending) {
      var turn = Engine.el("div", "turning turning--" + (pending.dir > 0 ? "fwd" : "back"));
      turn.innerHTML = pending.html;
      turn.appendChild(Engine.el("div", "turning__shade"));
      turn.addEventListener("animationend", function () {
        if (turn.parentNode) turn.parentNode.removeChild(turn);
      });
      open.appendChild(turn);
      pending = null;
    }
    wireSwipe(open, at, count);
    book.appendChild(open);

    /* footer: Index, Back, where you are, Turn */
    var foot = Engine.el("nav", "book__foot");
    var toIndex = Engine.btn("bookbtn" + (Coach.has("toIndex") ? " is-coached" : ""),
                             "Index", function () { Engine.setBookPick(null); turnTo(0); });
    toIndex.disabled = at === 0;
    foot.appendChild(toIndex);
    var prev = Engine.btn("bookbtn", "‹ Back", function () { turnTo(at - 1); });
    prev.disabled = at === 0;
    foot.appendChild(prev);

    var where = Engine.el("span", "book__where");
    if (!spread || spread.kind === "index")
      where.textContent = "Index — " + entries.length + " of " + all.length + " entries";
    else if (spread.kind === "split")
      where.textContent = "Page " + spread.no + " of " + built.pageCount;
    else
      where.textContent = (spread.b ? "Pages " + spread.noA + "–" + spread.noB
                                    : "Page " + spread.noA) + " of " + built.pageCount;
    foot.appendChild(where);

    var next = Engine.btn("bookbtn", "Turn ›", function () { turnTo(at + 1); });
    next.disabled = at >= count - 1;
    foot.appendChild(next);
    book.appendChild(foot);

    if (spread && spread.kind === "index") scheduleMeasure();
    return book;
  }

  /* The index flows to fit: measure a rendered row against the leaf and keep
   * the capacity that fills it exactly. One extra render at most, and only when
   * the answer actually changed, so it settles immediately. */
  function scheduleMeasure() {
    if (measurePending) return;
    measurePending = true;
    requestAnimationFrame(function () {
      measurePending = false;
      var body = document.querySelector(".leaf--index .leaf__body");
      if (!body) return;
      var row = body.querySelector(".index__row");
      var head = body.querySelector(".leaf__head");
      var rowH = row ? row.getBoundingClientRect().height : 0;
      /* the heading eats into the rows, so take it off before dividing —
         otherwise the last row is sliced in half by the foot of the page */
      var headH = head ? head.getBoundingClientRect().height +
                         parseFloat(getComputedStyle(head).marginBottom || 0) : 0;
      var h = body.clientHeight - headH;
      if (!rowH || h <= 0) return;
      var cap = Math.max(4, Math.floor(h / rowH));
      if (cap !== indexCap) { indexCap = cap; Engine.render(); }
    });
  }

  /* ---------- swipe to turn ----------
   * touch-action:pan-y hands vertical panning back to the browser, so this only
   * ever claims a sideways drag. A swipe swallows the click that would follow
   * it, or letting go over an index row would also jump you to that page.
   */
  function wireSwipe(open, at, count) {
    var start = null;
    /* Track every gesture, including ones that start on an index row — a swipe
     * beginning over a row is still a swipe. A plain click never moves, so it
     * is never swallowed and the row still takes you to its page. */
    open.addEventListener("pointerdown", function (e) {
      start = { x: e.clientX, y: e.clientY, moved: false };
    });
    open.addEventListener("pointermove", function (e) {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > 10) start.moved = true;
    });
    function finish(e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      var s = start; start = null;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (s.moved) window.addEventListener("click", function once(ev) {
        ev.stopPropagation(); ev.preventDefault();
        window.removeEventListener("click", once, true);
      }, true);
      if (dx < 0 && at < count - 1) turnTo(at + 1);      // pull the page leftward
      else if (dx > 0 && at > 0)    turnTo(at - 1);
    }
    open.addEventListener("pointerup", finish);
    open.addEventListener("pointercancel", function () { start = null; });
  }

  /* ---------- leaves ---------- */
  function shell(side, extra) {
    var leaf = Engine.el("div", "leaf leaf--" + side + (extra ? " " + extra : ""));
    var body = Engine.el("div", "leaf__body");
    leaf.appendChild(body);
    return { leaf: leaf, body: body };
  }
  function folio(leaf, n) { leaf.appendChild(Engine.el("span", "leaf__no", String(n))); }
  function blankLeaf(side) { return Engine.el("div", "leaf leaf--" + side + " leaf--blank"); }

  function indexLeaf(page, side, built, entries, naming) {
    if (!page.items.length && page.part > 0) return blankLeaf(side);
    var s = shell(side, "leaf--index");
    s.body.appendChild(Engine.el("h3", "leaf__head", page.part === 0 ? "Index" : "Index, continued"));

    if (!page.items.length) {
      s.body.appendChild(Engine.el("p", "muted", "Nothing in the book matches that."));
      folio(s.leaf, page.no);
      return s.leaf;
    }

    var list = Engine.el("ol", "index");
    page.items.forEach(function (sp) {
      var known = Engine.isIdentified(sp.id);
      /* A page you hold with no cutting behind it is an errand, and the index
         is where you go looking for one. */
      var nostock = !Engine.hasPot(sp.id);
      var li = Engine.el("li", "index__row");
      var go = Engine.btn("index__link" + (known ? " index__link--known" : "")
                          + (nostock ? " index__link--nostock" : "")
                          + (Coach.has("index:" + sp.id) ? " is-coached" : ""), "", function () {
        Engine.setBookPick(sp.id);
        turnTo(spreadOf(built, entries, sp, naming));
      });
      go.setAttribute("aria-label", "Turn to " + sp.name + (known ? ", identified" : "")
                                    + (nostock ? ", none on the shelf" : ""));

      var thumb = Engine.el("span", "index__art");
      thumb.innerHTML = Plate.book(sp, { w: 32, h: 32 });
      go.appendChild(thumb);
      go.appendChild(Engine.el("span", "index__name", sp.name));
      if (known) go.appendChild(Engine.el("span", "tick", "✓"));
      if (nostock) go.appendChild(Engine.el("span", "index__none", "Don't have any"));
      go.appendChild(Engine.el("span", "index__dots"));
      go.appendChild(Engine.el("span", "index__no", String(built.first + entries.indexOf(sp))));
      li.appendChild(go);
      list.appendChild(li);
    });
    s.body.appendChild(list);
    folio(s.leaf, page.no);
    return s.leaf;
  }

  /* one plant, one page (browsing) */
  function plantLeaf(sp, no, side, naming, sel) {
    var s = shell(side, "leaf--plant");
    plateInto(s.body, sp);
    headingInto(s.body, sp);
    s.body.appendChild(Engine.el("p", "leaf__plateTxt", sp.plate));
    useInto(s.body, sp);
    tagsInto(s.body, sp);
    claimInto(s.body, sp, naming, sel);
    folio(s.leaf, no);
    return s.leaf;
  }

  /* one plant, one spread (naming) — the picture on the left, the words right */
  function plantArtLeaf(sp) {
    var s = shell("left", "leaf--plant leaf--art");
    plateInto(s.body, sp, true);
    headingInto(s.body, sp);
    return s.leaf;                 // one plant, one folio — it lives on the right
  }
  function plantTextLeaf(sp, no, naming, sel) {
    var s = shell("right", "leaf--plant leaf--text");
    s.body.appendChild(Engine.el("p", "leaf__plateTxt", sp.plate));
    useInto(s.body, sp);
    tagsInto(s.body, sp);
    claimInto(s.body, sp, naming, sel);
    folio(s.leaf, no);
    return s.leaf;
  }

  /* ---------- page parts ---------- */
  function plateInto(body, sp, big) {
    var fig = Engine.el("figure", "leaf__plate" + (big ? " leaf__plate--big" : ""));
    fig.innerHTML = Plate.book(sp, big ? { w: 230, h: 230 } : { w: 158, h: 158 });
    /* tapping the plate opens it big — and if something is standing on the
       desk, it comes up alongside so you can hold the two together */
    Engine.onTap(fig, function () { Engine.lookCloser(sp.id, "book"); });
    fig.title = "Look closer";
    body.appendChild(fig);
  }
  function headingInto(body, sp) {
    var known = Engine.isIdentified(sp.id);
    var h = Engine.el("h3", "leaf__name", sp.name);
    body.appendChild(h);
    body.appendChild(Engine.el("p", "leaf__bin", sp.binomial));
    if (!known) return;

    var row = Engine.el("div", "leaf__act");
    var badge = Engine.el("p", "idtag");
    badge.appendChild(Engine.el("span", "tick", "✓"));
    badge.appendChild(document.createTextNode(" identified"));
    row.appendChild(badge);

    /* Once you know what it is, the book is the fastest way to lay hands on it:
       no hunting along the shelf for a plate you half-remember. It shuts the
       book behind you, because the pot is now on the desk and the desk is what
       you want to be looking at. Only when you actually have one, and only when
       the desk is empty — while something is standing on it you are in the
       middle of naming that, not fetching this. */
    if (Engine.hasPot(sp.id) && !Engine.state.onDesk)
      row.appendChild(Engine.btn("leaf__pick", "Pick it up", function () {
        Engine.placeOnDesk(sp.id);
        Engine.closeOverlay();
      }));

    body.appendChild(row);
  }
  function useInto(body, sp) {
    var block = Engine.el("div", "leaf__useblock");
    var lab = Engine.el("h4", "leaf__uselab");
    lab.appendChild(document.createTextNode("Used for"));
    /* WHO it is for is half the answer to any request, so the page says it in
       the heading rather than burying it in Hester's prose. */
    lab.appendChild(Engine.el("span", "leaf__who leaf__who--" + sp.species,
      sp.species === "dragon" ? "dragons" : sp.species === "both" ? "either" : "people"));
    block.appendChild(lab);
    block.appendChild(Engine.el("p", "leaf__useline", Clues.effectText(sp.effect)));
    block.appendChild(Engine.el("p", "leaf__use", sp.use));
    body.appendChild(block);
  }
  function tagsInto(body, sp) {
    var tags = Engine.el("p", "leaf__tags");
    var h = Clues.habitatById(sp.habitat);
    if (h) tags.appendChild(Engine.el("span", "tag", h.emoji + " " + h.name));
    body.appendChild(tags);
    /* The plant's own page says nothing about whether you have a cutting —
       Hester wrote the same page for everything in the vale. The index is where
       that is marked ("Don't have any"), because that is where you go looking
       for an errand; the page itself stays the same page either way. */
  }
  function claimInto(body, sp, naming, sel) {
    if (!naming) return;
    var st = Engine.state;
    var struck = st.wrongPages[sel] && st.wrongPages[sel][sp.id];
    if (struck) {
      body.parentNode.classList.add("leaf--struck");
      body.appendChild(Engine.el("p", "leaf__struck", "Ruled out today."));
    } else {
      body.appendChild(Engine.btn("leaf__claim" + (Coach.has("claim") ? " is-coached" : ""),
                                  "This is it!", function () { Engine.nameAs(sel, sp.id); }));
    }
  }

  /* ---------- the notes bar ---------- */
  function renderNotes(sel, notes) {
    var st = Engine.state;
    var revealed = st.revealed[sel] || {};
    var box = Engine.el("div", "notes");
    var used = Object.keys(notes).length;
    box.appendChild(Engine.el("p", "notes__lead",
      "Filter: " + used + " of " + Clues.filterCap() + " applied"));

    var chips = Engine.el("div", "notes__chips");
    var any = false;
    AXES.forEach(function (axis) {
      if (revealed[axis] == null) return;
      any = true;
      var on = notes[axis] === revealed[axis];
      var c = Engine.btn("chip" + (on ? " chip--on" : "")
                         + (Coach.has("chip:" + axis) ? " is-coached" : ""),
        Clues.chipText(axis, revealed[axis]),
        function () { Engine.toggleFilter(axis, revealed[axis]); });
      c.setAttribute("aria-pressed", on ? "true" : "false");
      chips.appendChild(c);
    });
    if (!any) chips.appendChild(Engine.el("span", "muted", "Examine the plant first."));
    if (used) chips.appendChild(Engine.btn("linkbtn linkbtn--inline", "clear notes", Engine.clearFilter));
    box.appendChild(chips);
    return box;
  }

  function renderUsePicker(all) {
    var st = Engine.state;
    var uses = Clues.effectsIn(all);
    var bar = Engine.el("div", "usebar");
    bar.appendChild(Engine.el("label", "usebar__lab", "Used for"));
    var sel = Engine.el("select", "usesel");
    sel.id = "bookUse";
    sel.setAttribute("aria-label", "Filter the book by what a plant is used for");
    var any = Engine.el("option", null, uses.length ? "anything" : "no pages yet");
    any.value = "";
    sel.appendChild(any);
    uses.forEach(function (u) {
      var o = Engine.el("option", null, u.label);
      o.value = u.key;
      if (st.bookEffect === u.key) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = !uses.length;
    sel.addEventListener("change", function () { Engine.setBookEffect(sel.value); });
    bar.appendChild(sel);
    if (st.bookEffect)
      bar.appendChild(Engine.btn("linkbtn", "show everything", function () { Engine.setBookEffect(""); }));
    return bar;
  }

  /* The page on its own, outside the book — for the card that goes up the
     moment you fill one in. Same parts in the same order as a real leaf, so
     what you are shown is the page you have just earned and not a summary of
     it. No folio and no claim button: there is nothing to press on it. */
  function pageCard(sp) {
    if (!sp) return null;
    var leaf = Engine.el("div", "leaf leaf--plant leaf--card");
    var body = Engine.el("div", "leaf__body");
    leaf.appendChild(body);
    plateInto(body, sp, true);
    headingInto(body, sp);
    body.appendChild(Engine.el("p", "leaf__plateTxt", sp.plate));
    useInto(body, sp);
    tagsInto(body, sp);
    return leaf;
  }

  return { render: render, pageCard: pageCard };
})();
