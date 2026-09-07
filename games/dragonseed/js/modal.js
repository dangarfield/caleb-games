/* modal.js — the thing that happened, in front of you.
 *
 * The strip along the top of the shop is easy to miss, and the moments worth
 * not missing are the ones with consequences: a visitor served or turned away,
 * a plant named or mis-named, a place found, a hint paid for. Those get a card
 * over the room as well as the strip.
 *
 * A modal carrying `then` is a beat in the day — dismissing it is what moves
 * the day on, so a served visitor waits for you instead of being swept off by a
 * timer. Everything else just closes.
 */

(function () {

  var lastKey = null;

  function renderModal(root) {
    var m = Engine.state.modal;
    if (!m) { lastKey = null; return; }

    var rite = m.kind === "rite";
    /* Any render rebuilds this element, and an animation on a fresh element
     * plays again. Only mark it new when the modal itself is new, or every
     * repaint looks like the dialog shutting and reopening. */
    var key = rite ? "rite" : (m.title || "") + "|" + (m.body || "");
    var fresh = key !== lastKey;

    var scrim = Engine.el("div", "scrim" + (fresh ? " is-new" : ""));
    if (!rite) scrim.addEventListener("pointerdown", function (e) {
      if (e.target === scrim) Engine.closeModal();
    });

    var card = Engine.el("div", "modal modal--" + (m.kind || "info")
      + (rite ? " modal--wide" : "") + (fresh ? " is-new" : ""));
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", m.title || "Notice");

    if (rite) {
      /* no dismiss and no button: the only way out is to finish it */
      Rite.render(card);
      scrim.appendChild(card);
      root.appendChild(scrim);
      lastKey = key;
      return;
    }

    if (m.kind === "help") {
      renderHelp(card);
      card.appendChild(Engine.btn("primary modal__cta", "Got it", Engine.closeModal));
      scrim.appendChild(card);
      root.appendChild(scrim);
      lastKey = key;
      return;
    }

    /* A place gets its own picture, and a 4:3 photograph stacked on top of a
       400px card made something tall enough to scroll. So when there is a
       place, the card goes wide and splits: the place down one side with its
       name over it, everything that happened down the other. */
    var scene = m.scene && typeof Art !== "undefined"
              && Art.place(m.scene, Engine.today() ? Engine.today().day : 1);
    var body = card;

    /* A page you have just filled in goes down the left, exactly as it will
       look in the book, with what happened down the right. Stacked, it made a
       card taller than the screen. */
    var pageSp = m.pageId && Clues.specimenById(m.pageId);
    if (pageSp && typeof Book !== "undefined" && Book.pageCard) {
      card.classList.add("modal--scene", "modal--page");
      var pc = Engine.el("div", "modal__page");
      pc.appendChild(Book.pageCard(pageSp));
      card.appendChild(pc);
      body = Engine.el("div", "modal__said");
      card.appendChild(body);
    }

    if (scene) {
      card.classList.add("modal--scene");
      var hab = Clues.habitatById(m.scene);
      var sc = Engine.el("div", "modal__place");
      if (hab) sc.appendChild(Engine.el("h3", "modal__placename", hab.name));
      var frame = Engine.el("div", "modal__scene");
      frame.innerHTML = Art.img(scene, { alt: (hab && hab.name) || "", eager: true });
      sc.appendChild(frame);
      if (hab && hab.note) sc.appendChild(Engine.el("p", "modal__placenote", hab.note));
      card.appendChild(sc);
      body = Engine.el("div", "modal__said");
      card.appendChild(body);
    }

    /* Somebody thanking you, or shaking their head, is the commonest card in
       the game — so the person gets the same treatment a place does: big, down
       the left, with what they said beside them. A 108px thumbnail above three
       lines of text was the smallest that face was ever drawn. */
    var mpic = m.pic && typeof Art !== "undefined" && Art.person(m.pic);
    if (mpic && body === card) {
      card.classList.add("modal--scene", "modal--who");
      var who = Engine.el("div", "modal__who");
      who.innerHTML = Art.img(mpic, { alt: m.title || "", eager: true });
      card.appendChild(who);
      body = Engine.el("div", "modal__said");
      card.appendChild(body);
    } else if (mpic) {
      var mf = Engine.el("div", "modal__face modal__face--art");
      mf.innerHTML = Art.img(mpic, { alt: m.title || "", w: 108, h: 81, eager: true });
      body.appendChild(mf);
    } else if (m.face) {
      body.appendChild(Engine.el("div", "modal__face", m.face));
    }

    /* One plant gets the big plate. Several — a handful of cuttings somebody
       has just put on your counter — get a row of small ones, because "6
       cuttings" means nothing next to a picture of six things. */
    if (m.artIds && m.artIds.length > 1) {
      var row = Engine.el("div", "modal__arts");
      m.artIds.slice(0, 8).forEach(function (id) {
        var q = Clues.specimenById(id);
        if (!q) return;
        var cell = Engine.el("span", "modal__artone");
        cell.innerHTML = Plate.art(q, { w: 74, h: 74 });
        row.appendChild(cell);
      });
      body.appendChild(row);
    } else if (m.artId && !pageSp) {
      var sp = Clues.specimenById(m.artId);
      if (sp) {
        var art = Engine.el("div", "modal__art");
        art.innerHTML = Plate.art(sp, { w: 140, h: 140 });
        Engine.onTap(art, function () { Engine.lookCloser(sp.id, "plant"); });
        art.title = "Look closer";
        body.appendChild(art);
      }
    }

    /* Leaves that arrived with this card. Drawn as the book plate, because that
       is what a page looks like when you turn it up — the line drawing, not the
       colour one off the shelf. No names: which leaf belongs to which pot is
       the game. */
    if (m.pageIds && m.pageIds.length) {
      var leaves = Engine.el("div", "modal__leaves");
      m.pageIds.slice(0, 10).forEach(function (id) {
        var q = Clues.specimenById(id);
        if (!q) return;
        var cell = Engine.el("span", "modal__leaf");
        cell.innerHTML = Plate.book(q, { w: 62, h: 62 });
        cell.title = "A loose leaf out of the book";
        leaves.appendChild(cell);
      });
      if (m.pageIds.length > 10)
        leaves.appendChild(Engine.el("span", "modal__leafmore",
          "+" + (m.pageIds.length - 10)));
      body.appendChild(Engine.el("p", "modal__leaflab",
        m.pageIds.length === 1 ? "A leaf for the book" : "Leaves for the book"));
      body.appendChild(leaves);
    }

    if (m.title) body.appendChild(Engine.el("h2", "modal__title", m.title));
    if (m.sub)   body.appendChild(Engine.el("p", "modal__sub", m.sub));
    if (m.body)  body.appendChild(Engine.el("p", "modal__body", m.body));

    var go = Engine.btn("primary modal__cta", m.cta || "Continue", Engine.closeModal);
    go.id = "modalCta";
    body.appendChild(go);

    scrim.appendChild(card);
    root.appendChild(scrim);

    /* focus the button once per modal, not on every re-render, or typing
       elsewhere would keep yanking the caret back here */
    if (fresh) {
      lastKey = key;
      requestAnimationFrame(function () { var b = document.getElementById("modalCta"); if (b) b.focus(); });
    }
  }

  /* Six lines, in the order you actually do them. The same six drive the
   * walkthrough on the very first customer (coach.js), so they only exist once. */
  function renderHelp(card) {
    card.classList.add("modal--wide");
    card.appendChild(Engine.el("h2", "modal__title", "How to play"));
    card.appendChild(Engine.el("p", "modal__body",
      "Somebody comes in and describes a plant, or describes a problem. Your job is to "
      + "work out which pot they mean."));
    var ol = Engine.el("ol", "howto");
    Coach.STEPS.forEach(function (st) {
      var li = Engine.el("li", "howto__step");
      li.appendChild(Engine.el("span", "howto__n", ""));
      li.appendChild(Engine.el("span", "howto__t", st.text));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    card.appendChild(Engine.el("p", "modal__foot",
      "Guessing wrong crosses that page out for the day and muddles you a little. "
      + "Three pips of confusion and you have to cast the spell of calm — set the six "
      + "runes in order — before you can carry on."));
    card.appendChild(Coach.toggle());
  }

  Engine.registerRegion("modal", renderModal);
})();
