/* story.js — the full-screen story: the opening panels, and every evening.
 *
 * Day one used to start on a customer, which assumed the player knew what a
 * dragon was and what the shop was for. It opens on three panels instead.
 *
 * The evenings used to be a card in the rail, wedged between the last customer
 * and the day's summary, competing with the shelf and the book for attention at
 * the one moment in the day when nothing else is happening. They are the same
 * shape of thing as the opening — a scene, sometimes a letter, sometimes a
 * choice — so they are drawn the same way: over the board, on their own.
 *
 * A region like any other, drawn while state.prologue is a real index or
 * state.evening is set, and gone the moment neither is true.
 */

(function () {

  /* ---------- the furniture both halves share ---------- */

  /* Two columns: the picture as big as the screen will take, and the words
     beside it. The side the picture sits on alternates page by page, so
     sixteen evenings do not read as sixteen copies of the same slide. Nothing
     scrolls — the words column is the only thing that can, and only if a very
     long evening leaves it no choice. */
  function card(root, flip, hasScene) {
    var scrim = Engine.el("div", "pro");
    var art = Engine.el("article", "pro__card"
      + (flip ? " pro__card--flip" : "")
      + (hasScene ? "" : " pro__card--solo"));
    art.setAttribute("role", "document");
    scrim.appendChild(art);
    root.appendChild(scrim);
    var body = Engine.el("div", "pro__body");
    art.appendChild(body);
    body.card = art;                  // so scene() can hang the picture beside it
    return body;
  }

  function paras(art, text) {
    String(text || "").split("\n\n").forEach(function (para) {
      art.appendChild(Engine.el("p", "pro__p", para));
    });
  }

  /* The picture for tonight, if there is one. It goes above the heading, the
     way a plate goes above a chapter. */
  function sceneUrl(key) {
    return (typeof Art !== "undefined" && Art.story(key)) || null;
  }
  function scene(body, key, alt) {
    var url = sceneUrl(key);
    if (!url || !body.card) return;
    var box = Engine.el("div", "pro__scene");
    box.innerHTML = Art.img(url, { alt: alt || "", eager: true });
    body.card.insertBefore(box, body.card.firstChild);
  }

  /* The chosen cutting, standing in for tonight's scene. Same slot, same size,
     so picking one up does not move the words. */
  function plantScene(body, sp) {
    if (!body.card) return;
    var box = Engine.el("div", "pro__scene pro__scene--plant");
    box.innerHTML = Plate.art(sp, { w: 460, h: 460 });
    body.card.insertBefore(box, body.card.firstChild);
  }

  function quote(art, line) {
    var q = Engine.el("div", "pro__quote");
    q.appendChild(Engine.el("p", "pro__quoteline", "“" + line + "”"));
    q.appendChild(Engine.el("p", "pro__quotewho", "— written in the book, a long time ago"));
    art.appendChild(q);
  }

  /* ---------- the opening ---------- */

  function renderPrologue(root) {
    var st = Engine.state;
    var i = Math.max(0, Math.min(st.prologue, PROLOGUE.length - 1));
    var panel = PROLOGUE[i];
    var last = i === PROLOGUE.length - 1;
    var key = "prologue_" + i;
    var art = card(root, i % 2 === 1, !!sceneUrl(key));

    var pips = Engine.el("div", "pro__pips");
    PROLOGUE.forEach(function (_, k) {
      pips.appendChild(Engine.el("span", "pip" + (k < i ? " pip--done" : k === i ? " pip--now" : "")));
    });
    art.appendChild(pips);

    scene(art, key, panel.title);
    art.appendChild(Engine.el("h1", "pro__title", panel.title));
    paras(art, panel.body);
    if (panel.quote) quote(art, panel.quote);

    var acts = Engine.el("div", "pro__acts");
    if (i > 0)
      acts.appendChild(Engine.btn("linkbtn", "Back", function () { Engine.prologueStep(i - 1); }));
    acts.appendChild(Engine.btn("primary", last ? "Open the shop" : "Go on",
      function () { Engine.prologueStep(i + 1); }));
    art.appendChild(acts);

    if (!last)
      art.appendChild(Engine.btn("linkbtn pro__skip", "Skip the beginning",
        function () { Engine.prologueStep(PROLOGUE.length); }));
  }

  /* ---------- the evening ---------- */

  /* What the egg can be handed: everything on the shelf you can put a name to.
     There is no dragging here — the board is behind the panel — so the cuttings
     come as a list, and only the named ones, because you cannot offer a thing
     you cannot name. */
  function eggChoices() {
    var st = Engine.state;
    return Object.keys(st.pots || {})
      .filter(function (id) { return Engine.isIdentified(id); })
      .map(function (id) { return Clues.specimenById(id); })
      .filter(Boolean)
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /* Before the twelfth night it is an egg; after that it is out and asleep in
     your coat. "It" was doing all the work in this panel and the reader had
     just been told about a shepherd, a fire or a vote — so "it" read as the
     news. Everything here names the thing in the cellar instead. */
  function eggWord(day) { return day < 12 ? "The egg" : "The hatchling"; }

  function renderEggAsk(art, e) {
    var box = Engine.el("div", "eve2__egg");
    box.appendChild(Engine.el("h3", "eve2__eggtitle",
      eggWord(e.day) + " wants something"));
    if (e.egg.asks) box.appendChild(Engine.el("p", "eve2__eggasks", e.egg.asks));
    box.appendChild(Engine.el("p", "eve2__eggwhat",
      "Give it something that " + Clues.effectText(e.egg.needs) + "."));

    var picks = eggChoices();
    if (!picks.length) {
      box.appendChild(Engine.el("p", "eve2__none",
        "There is nothing on the shelf you could put a name to. Not tonight, then."));
    } else {
      var list = Engine.el("div", "eve2__pots");
      picks.forEach(function (s) {
        var b = Engine.btn("eve2__pot", "", function () { Engine.setEggPick(s.id); }, s.name);
        var thumb = Engine.el("span", "eve2__thumb");
        thumb.innerHTML = Plate.art(s, { w: 30, h: 30 });
        b.appendChild(thumb);
        b.appendChild(Engine.el("span", "eve2__potname", s.name));
        list.appendChild(b);
      });
      box.appendChild(list);
    }
    art.appendChild(box);
  }

  /* You have picked a cutting up. Before it goes anywhere you get the page you
     would have got out of the book: what it is, what it is for, and who for.
     The egg is the one place you cannot go and look, so the reminder comes to
     you — and then you say yes. Beside the words, and no scrolling, like every
     other page of the story. */
  function renderEggConfirm(root, e, sp) {
    var art = card(root, e.day % 2 === 0, true);
    art.appendChild(Engine.el("p", "pro__kicker", "Night of day " + e.day));
    plantScene(art, sp);
    art.appendChild(Engine.el("h1", "pro__title", sp.name));
    if (sp.binomial) art.appendChild(Engine.el("p", "pro__latin", sp.binomial));

    var block = Engine.el("div", "eve2__what");
    var lab = Engine.el("h4", "eve2__whatlab");
    lab.appendChild(document.createTextNode("Used for"));
    lab.appendChild(Engine.el("span", "leaf__who leaf__who--" + sp.species,
      sp.species === "dragon" ? "dragons" : sp.species === "both" ? "either" : "people"));
    block.appendChild(lab);
    block.appendChild(Engine.el("p", "eve2__whatline", Clues.effectText(sp.effect)));
    if (sp.use) block.appendChild(Engine.el("p", "eve2__whatuse", sp.use));
    art.appendChild(block);

    art.appendChild(Engine.el("p", "pro__prompt",
      eggWord(e.day) + " wants something that " + Clues.effectText(e.egg.needs) + "."));

    var acts = Engine.el("div", "pro__acts");
    acts.appendChild(Engine.btn("linkbtn", "Pick something else",
      function () { Engine.setEggPick(null); }));
    acts.appendChild(Engine.btn("primary", "Give it " + sp.name,
      function () { Engine.feedEgg(sp.id); }));
    art.appendChild(acts);
  }

  function renderEvening(root) {
    var e = Engine.eveningFor(Engine.today().day);
    if (!e) { Engine.eveningDone(); return; }
    var st = Engine.state;

    /* a cutting picked up, not yet handed over */
    if (e.egg && !st.eveningReply && st.eggPick) {
      var held = Clues.specimenById(st.eggPick);
      if (held) { renderEggConfirm(root, e, held); return; }
    }

    var key = "evening_" + (e.day < 10 ? "0" : "") + e.day;
    var art = card(root, e.day % 2 === 0, !!sceneUrl(key));

    art.appendChild(Engine.el("p", "pro__kicker", "Night of day " + e.day));

    /* the second panel: what the egg did with it, or what the choice cost.
       The picture stays up — you are still in the same night. */
    if (st.eveningReply) {
      scene(art, key, e.title);
      art.appendChild(Engine.el("h1", "pro__title", st.eveningReply.title));
      var gave = st.eveningReply.artId && Clues.specimenById(st.eveningReply.artId);
      if (gave) {
        var plate = Engine.el("div", "eve2__plate");
        plate.innerHTML = Plate.art(gave, { w: 96, h: 96 });
        plate.appendChild(Engine.el("span", "eve2__platename",
          "you gave " + (e.day < 12 ? "the egg " : "it ") + gave.name));
        art.appendChild(plate);
      }
      paras(art, st.eveningReply.body);
      var done = Engine.el("div", "pro__acts");
      done.appendChild(Engine.btn("primary", "Close up for the night", Engine.eveningDone));
      art.appendChild(done);
      return;
    }

    scene(art, key, e.title);
    art.appendChild(Engine.el("h1", "pro__title", e.title));
    paras(art, e.body);

    if (e.letter) {
      var note = Engine.el("div", "eve2__letter");
      note.appendChild(Engine.el("p", "eve2__letterbody", e.letter));
      art.appendChild(note);
    }
    if (e.quote) quote(art, e.quote);
    if (e.egg) renderEggAsk(art, e);

    if (e.choice) {
      art.appendChild(Engine.el("p", "pro__prompt", e.choice.prompt));
      var opts = Engine.el("div", "eve2__opts");
      e.choice.options.forEach(function (o) {
        opts.appendChild(Engine.btn("evebtn", o.label, function () {
          Engine.eveningChoose(o.flag, o.reply);
        }));
      });
      art.appendChild(opts);
    }

    /* A night with a choice in it has no way past the choice: the two options
       are the only way out of the panel. Every other night closes itself. */
    if (!e.choice) {
      var acts = Engine.el("div", "pro__acts");
      acts.appendChild(Engine.btn(e.egg ? "linkbtn" : "primary",
        e.egg ? "Leave " + (e.day < 12 ? "the egg" : "it") + " be tonight"
              : "Close up for the night", Engine.eveningDone));
      art.appendChild(acts);
    }
  }

  /* ---------- the region ---------- */

  function render(root) {
    if (!Engine.inStory()) { document.body.classList.remove("is-story"); return; }
    document.body.classList.add("is-story");
    if (Engine.inPrologue()) renderPrologue(root);
    else renderEvening(root);
  }

  Engine.registerRegion("story", render);
})();
