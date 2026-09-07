/* visitor.js — the right column: who is at the counter and what they said.
 *
 * Their line IS the puzzle, so nothing here restates it in attribute form. If
 * you want that translation you press Hint and it costs a pip of confusion.
 *
 * A new customer arrives: the card fades up, the line types itself out, and the
 * drop zone and the Hint only appear once they have finished speaking. The
 * typing writes straight into the text node rather than re-rendering, so the
 * rest of the shop stays put and the arrival animation cannot replay
 * mid-sentence.
 */

(function () {

  var CHAR_MS = 18;
  var typer = { key: null, n: 0, done: false, timer: null };
  var animatedFor = null;
  /* set by the render pass, read by the helpers it calls */
  var freshNow = false;

  /* The first four days underline the words that matter — see HI in
   * build/days.py. A seven-year-old reading four lines of speech does not yet
   * know which half of it is the puzzle, so for a fortnight's worth of practice
   * the game points at it, and then stops pointing.
   *
   * The marks have to survive the typewriter, which writes a growing slice of
   * the line, so the ranges are worked out once against the WHOLE line and each
   * one is clipped to however much has been typed. */
  function esc(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function rangesFor(full, hi) {
    var out = [];
    (hi || []).forEach(function (phrase) {
      var from = 0, at;
      while ((at = full.indexOf(phrase, from)) !== -1) {
        out.push([at, at + phrase.length]);
        from = at + phrase.length;
      }
    });
    out.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];                      // overlapping marks would nest tags
    out.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    return merged;
  }
  function lineHTML(full, n, ranges) {
    if (!ranges.length) return esc(full.slice(0, n));
    var out = "", at = 0;
    ranges.forEach(function (r) {
      if (r[0] >= n) return;
      if (r[0] > at) out += esc(full.slice(at, Math.min(r[0], n)));
      out += '<u class="vis__key">' + esc(full.slice(r[0], Math.min(r[1], n))) + "</u>";
      at = Math.min(r[1], n);
    });
    if (at < n) out += esc(full.slice(at, n));
    return out;
  }

  function stopTyping() {
    if (typer.timer) { clearInterval(typer.timer); typer.timer = null; }
  }
  function startTyping(full, ranges) {
    stopTyping();
    typer.timer = setInterval(function () {
      typer.n += 1;
      var node = document.querySelector(".vis__line");
      if (node) node.innerHTML = lineHTML(full, typer.n, ranges);
      if (typer.n >= full.length) { stopTyping(); typer.done = true; Engine.render(); }
    }, CHAR_MS);
  }
  function finishTyping(full) {
    stopTyping();
    typer.n = full.length; typer.done = true;
    Engine.render();
  }

  function renderVisitor(root) {
    var st = Engine.state;

    /* Nothing behind a story panel ticks. The board is only hidden, not absent,
     * so without this the counter renders under the opening panels: the line
     * types itself out to nobody, the arrival animation is spent, and the
     * walkthrough's five-second read clock has run out before the shop opens —
     * which is why the tutorial used to start on step two. The evenings are
     * drawn the same way now (story.js), so they are behind this too. */
    if (Engine.inStory()) return;

    if (st.finished)  return renderEnding(root);
    if (st.dayOver)   return renderDayEnd(root);

    var v = Engine.visitor();
    var d = Engine.today();

    var head = Engine.el("div", "rail__head");
    head.appendChild(Engine.el("h2", "rail__title", "At the counter"));
    head.appendChild(Engine.el("span", "rail__count", (st.visitorIndex + 1) + " of " + d.visitors.length));
    root.appendChild(head);

    if (!v) { root.appendChild(Engine.el("p", "muted", "Nobody, for the moment.")); return; }

    var key = d.day + ":" + st.visitorIndex + ":" + v.id;
    if (typer.key !== key) { stopTyping(); typer = { key: key, n: 0, done: false, timer: null }; }
    var full = "“" + v.line + "”";

    var fresh = animatedFor !== key;
    if (fresh) animatedFor = key;
    /* Everything under the customer's words fades in — once. The rail is
       rebuilt on every state change, and a fresh element replays its entrance,
       so a drop zone that carried .reveal unconditionally flickered every time
       you clicked anything. It arrives with the customer and then sits still. */
    freshNow = fresh;
    var rv = fresh ? " reveal" : "";

    var card = Engine.el("div", "vis" + (fresh ? " vis--arriving" : ""));
    /* A painted face if this customer has one, the emoji if not. Six people
       come back all fortnight, so it is worth recognising them on sight. */
    var faceUrl = v.pic && typeof Art !== "undefined" && Art.person(v.pic);
    if (faceUrl) {
      var face = Engine.el("div", "vis__face vis__face--art");
      face.innerHTML = Art.img(faceUrl, { alt: v.name, w: 132, h: 99, eager: true });
      card.appendChild(face);
    } else {
      card.appendChild(Engine.el("div", "vis__face", v.emoji));
    }
    card.appendChild(Engine.el("h3", "vis__name", v.name));
    if (v.who === "dragon")
      card.appendChild(Engine.el("span", "vis__for", "for a dragon"));
    var ranges = rangesFor(full, v.hi);
    var lineEl = Engine.el("p", "vis__line" + (typer.done ? "" : " vis__line--typing")
                                + (Coach.has("line") ? " is-coached" : ""));
    lineEl.innerHTML = lineHTML(full, typer.done ? full.length : typer.n, ranges);
    card.appendChild(lineEl);
    if (!typer.done) {
      card.style.cursor = "pointer";
      card.title = "Click to hear the rest at once";
      card.addEventListener("click", function () { finishTyping(full); });
    }
    root.appendChild(card);

    /* the drop zone and the Hint wait until they have finished speaking */
    if (!typer.done) {
      if (!typer.timer) startTyping(full, ranges);
      root.appendChild(renderTools());
      return;
    }

    if (v.kind === "visit") {
      root.appendChild(Engine.btn("primary", "Show them out", Engine.dismissVisitor));

    } else if (v.kind === "gift" || v.kind === "lead") {
      /* nothing being asked for: they are handing YOU something. The plants and places
         land when you take it, so a gift has a face on it instead of turning up
         on the shelf overnight for no reason. */
      var box = Engine.el("div", "handover" + rv);
      (v.finds || []).forEach(function (id) {
        var sp = Clues.specimenById(id); if (!sp) return;
        var row = Engine.el("div", "handover__row");
        var art = Engine.el("span", "handover__art");
        art.innerHTML = Plate.art(sp, { w: 44, h: 44 });
        row.appendChild(art);
        row.appendChild(Engine.el("span", "handover__what",
          Engine.isIdentified(id) ? sp.name : "Something you have not seen before"));
        box.appendChild(row);
      });
      if (v.item) {
        var ir = Engine.el("div", "handover__row");
        ir.appendChild(Engine.el("span", "handover__art", "✉"));
        ir.appendChild(Engine.el("span", "handover__what", v.item));
        box.appendChild(ir);
      }
      (v.opens || []).forEach(function (hid) {
        var h = HABITATS.find(function (x) { return x.id === hid; });
        if (!h) return;
        var hr = Engine.el("div", "handover__row");
        hr.appendChild(Engine.el("span", "handover__art", h.emoji));
        hr.appendChild(Engine.el("span", "handover__what", "Where to find " + h.name));
        box.appendChild(hr);
      });
      if (box.childNodes.length) root.appendChild(box);
      root.appendChild(Engine.btn("primary" + rv, "Take it", Engine.dismissVisitor));

    } else if (v.kind === "fork") {
      /* A fork is two right answers with different consequences, and the only
         place that used to say so was the paid hint. The panel says what each
         one would DO — not which plant it is; finding that is still yours. */
      root.appendChild(renderFork(v));
      var fdrop = Engine.el("div", "give" + rv + (Coach.has("give") ? " is-coached" : ""));
      fdrop.innerHTML = "<span class='give__label'>Drop a pot here</span>" +
                        "<span class='give__sub'>whichever you decide on</span>";
      root.appendChild(fdrop);
      Engine.registerZone(fdrop, function (p) { if (p.kind === "pot") Engine.give(p.id); });
      Engine.registerZone(card,  function (p) { if (p.kind === "pot") Engine.give(p.id); });

    } else if (v.kind === "recipe") {
      root.appendChild(renderRecipe(v));
      var rdrop = Engine.el("div", "give" + rv + (Coach.has("give") ? " is-coached" : ""));
      rdrop.innerHTML = "<span class='give__label'>Drop a pot here</span>" +
                        "<span class='give__sub'>one at a time</span>";
      root.appendChild(rdrop);
      Engine.registerZone(rdrop, function (p) { if (p.kind === "pot") Engine.give(p.id); });
      Engine.registerZone(card,  function (p) { if (p.kind === "pot") Engine.give(p.id); });
    } else {
      var drop = Engine.el("div", "give" + rv + (Coach.has("give") ? " is-coached" : ""));
      drop.innerHTML = "<span class='give__label'>Drop a pot here</span>" +
                       "<span class='give__sub'>or use the lens</span>";
      root.appendChild(drop);
      Engine.registerZone(drop, function (p) { if (p.kind === "pot") Engine.give(p.id); });
      Engine.registerZone(card, function (p) { if (p.kind === "pot") Engine.give(p.id); });
    }

    /* the walkthrough is its own fixed card in a bottom corner now (coach.js) */
    root.appendChild(renderTools());   // last, and pinned to the foot of the rail
  }

  /* The two ways to answer a fork, in words. Species is only spelled out when
   * the two differ, because "for a person" twice is noise. */
  function renderFork(v) {
    var opts = (v.fork || []).map(function (f) { return Clues.specimenById(f.plant); })
                             .filter(Boolean);
    var mixed = opts.length === 2 && opts[0].species !== opts[1].species;
    var box = Engine.el("div", "twoways" + (freshNow ? " reveal" : ""));
    box.appendChild(Engine.el("p", "twoways__lab", "Either one will do"));
    opts.forEach(function (sp, i) {
      var row = Engine.el("div", "twoways__row");
      row.appendChild(Engine.el("span", "twoways__n", i === 0 ? "A" : "B"));
      var what = Engine.el("span", "twoways__what",
        "Something that " + Clues.effectText(sp.effect));
      row.appendChild(what);
      if (mixed)
        row.appendChild(Engine.el("span", "twoways__who twoways__who--" + sp.species,
          sp.species === "dragon" ? "for a dragon" : sp.species === "human" ? "for a person" : "either"));
      box.appendChild(row);
    });
    box.appendChild(Engine.el("p", "twoways__foot", "It is your choice which."));
    return box;
  }

  /* A recipe is two or three requests in one visit, handed over one at a time.
   * The checklist is the whole interface: a step you have filled shows the pot
   * you filled it with, and the rest stay as words. */
  function renderRecipe(v) {
    var got = Engine.recipeGot();
    var box = Engine.el("ol", "steps" + (freshNow ? " reveal" : ""));
    v.needs.forEach(function (need, i) {
      var done = got[i], sp = done && Clues.specimenById(done);
      var li = Engine.el("li", "steps__row" + (done ? " steps__row--done" : ""));
      li.appendChild(Engine.el("span", "steps__tick", done ? "✓" : String(i + 1)));
      li.appendChild(Engine.el("span", "steps__what",
        done ? sp.name : (v.steps && v.steps[i]) || Clues.effectText(need)));
      if (!done && v.who === "dragon")
        li.appendChild(Engine.el("span", "steps__who", "dragon"));
      box.appendChild(li);
    });
    return box;
  }

  /* Book and Map live here rather than in a desk header, so the desk is all
   * workspace. They are always reachable, including on a day that has ended. */
  function renderTools() {
    var st = Engine.state;
    var box = Engine.el("section", "rail__tools");
    box.appendChild(Engine.el("h3", "log__title", "On the desk"));
    var row = Engine.el("div", "toolrow");
    var lit = Coach.has("tools") ? " is-coached" : "";
    row.appendChild(Engine.btn("tool" + (st.overlay === "book" ? " tool--on" : "") + lit, "\u{1F4D6} Book",
      function () { Engine.openOverlay(st.overlay === "book" ? null : "book"); }));
    if (Engine.hasMap())
      row.appendChild(Engine.btn("tool" + (st.overlay === "map" ? " tool--on" : "")
                                 + (Coach.has("map") ? " is-coached" : ""), "\u{1F5FA} Map",
        function () { Engine.openOverlay(st.overlay === "map" ? null : "map"); }));
    /* The drawer is reachable from here too, because the big way in is on the
       empty desk and the desk is not always empty. */
    if (Engine.hasDrawer())
      row.appendChild(Engine.btn("tool" + (st.deskView === "drawer" ? " tool--on" : "")
                                 + (Coach.has("drawer") ? " is-coached" : ""),
        "\u{1F5C2} Drawer",
        function () { Engine.setDeskView(st.deskView === "drawer" ? "bench" : "drawer"); }));
    box.appendChild(row);
    return box;
  }

  /* The evening used to live here, as a card in the rail. It is a story beat,
     not a counter action, so it is drawn full-screen in story.js now — the same
     panels the game opens on. */

  function renderDayEnd(root) {
    var st = Engine.state, d = Engine.today();
    var box = Engine.el("div", "dayend");
    box.appendChild(Engine.el("h2", "dayend__title", "Day " + d.day + " is over"));
    box.appendChild(Engine.el("p", "dayend__note", d.note));

    var stats = Engine.el("div", "dayend__stats");
    [["Served", st.served],
     ["Named", Object.keys(st.identified).length + " of " + SPECIMENS.length],
     ["On the shelf", Object.keys(st.pots).length],
     ["In the book", Object.keys(st.pages).length]
    ].forEach(function (p) {
      var s = Engine.el("div", "stat");
      s.appendChild(Engine.el("span", "stat__n", String(p[1])));
      s.appendChild(Engine.el("span", "stat__k", p[0]));
      stats.appendChild(s);
    });
    box.appendChild(stats);

    if (st.dayIndex + 1 < DAYS.length) {
      var next = DAYS[st.dayIndex + 1];
      box.appendChild(Engine.btn("primary", "Open up — day " + next.day + ", " + next.weekday,
                                 Engine.startNextDay));
    } else {
      box.appendChild(Engine.btn("primary", "Close the shop for good", Engine.startNextDay));
    }
    root.appendChild(box);
    root.appendChild(renderTools());
  }

  function renderEnding(root) {
    var st = Engine.state;
    var box = Engine.el("div", "dayend");
    box.appendChild(Engine.el("h2", "dayend__title", "Sixteen days"));
    /* The endings live in the content tables (build/endings.py → ENDINGS,
     * CODAS), not in here. They used to be four English strings hard-coded in
     * this file, left over from a story that no longer exists — they still
     * talked about a warden digging for Alice. */
    var f = st.flags;
    var end = ENDINGS.find(function (e) { return e.flag && f[e.flag]; })
           || ENDINGS.find(function (e) { return !e.flag; });
    if (end) {
      var pic = typeof Art !== "undefined" && Art.story("ending_" + (end.flag || "none"));
      if (pic) {
        var frame = Engine.el("div", "dayend__art");
        frame.innerHTML = Art.img(pic, { alt: end.title, eager: true });
        box.appendChild(frame);
      }
      box.appendChild(Engine.el("p", "dayend__title2", end.title));
      String(end.body || "").split("\n\n").forEach(function (para) {
        box.appendChild(Engine.el("p", "dayend__note", para));
      });
    }
    CODAS.forEach(function (c) {
      if (f[c.flag]) box.appendChild(Engine.el("p", "dayend__coda", c.text));
    });

    var stats = Engine.el("div", "dayend__stats");
    [["Served", st.served],
     ["Named", Object.keys(st.identified).length],
     ["On the shelf", Object.keys(st.pots).length],
     ["In the book", Object.keys(st.pages).length]
    ].forEach(function (p) {
      var s = Engine.el("div", "stat");
      s.appendChild(Engine.el("span", "stat__n", String(p[1])));
      s.appendChild(Engine.el("span", "stat__k", p[0]));
      stats.appendChild(s);
    });
    box.appendChild(stats);

    var choices = Object.keys(st.flags);
    if (choices.length) {
      box.appendChild(Engine.el("h3", "log__title", "What you chose"));
      var ul = Engine.el("div", "log");
      st.log.filter(function (l) { return l.indexOf(":") > 0; }).slice(0, 10).forEach(function (l) {
        ul.appendChild(Engine.el("p", "log__line", l));
      });
      box.appendChild(ul);
    }
    box.appendChild(Engine.btn("primary", "Start again", function () {
      if (confirm("Start the sixteen days over? This clears your book.")) Engine.reset();
    }));
    root.appendChild(box);
  }

  Engine.registerRegion("visitor", renderVisitor);
})();
