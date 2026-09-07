/* look.js — the look-closer lightbox.
 *
 * Tap any plant picture and it comes up as big as the screen allows. If the
 * book is open at a page and there is a specimen on the desk, both come up at
 * once, side by side: the painted thing in your hand next to the drawn plate
 * on the page. That comparison is the whole game, and doing it between two
 * thumbnails two inches apart was asking a lot of a seven-year-old.
 *
 * Escape, the X, or anywhere off the pictures closes it.
 */

(function () {

  function pane(item) {
    var s = Clues.specimenById(item.id);
    if (!s) return null;
    /* The book page prints the plant's name whether or not you have worked out
       that the thing on your desk IS it — so the page pane says the name, and
       the desk pane stays "unnamed specimen" until you have named it. Which is
       exactly the question the two pictures are there to help you answer. */
    var known = item.mode === "book" || Engine.isIdentified(s.id);
    var box = Engine.el("figure", "look__pane look__pane--" + item.mode);

    var art = Engine.el("div", "look__art");
    art.innerHTML = item.mode === "book"
      ? Plate.book(s, { w: 620, h: 620 })
      : Plate.art(s,  { w: 620, h: 620 });
    box.appendChild(art);

    var cap = Engine.el("figcaption", "look__cap");
    cap.appendChild(Engine.el("span", "look__kind",
      item.mode === "book" ? "The page" : "On the desk"));
    cap.appendChild(Engine.el("span", "look__name" + (known ? "" : " look__name--unknown"),
      known ? s.name : "unnamed specimen"));
    if (known) cap.appendChild(Engine.el("span", "look__bin", s.binomial));
    /* what it looks like is worth having under the picture — it is the list of
       things you are meant to be checking off against it */
    cap.appendChild(Engine.el("p", "look__plate", s.plate));
    if (Engine.isIdentified(s.id) || item.mode === "book")
      cap.appendChild(Engine.el("p", "look__use", s.use));
    box.appendChild(cap);
    return box;
  }

  function render(root) {
    var items = Engine.state.look;
    if (!items || !items.length) return;

    var scrim = Engine.el("div", "look");
    scrim.addEventListener("pointerdown", function (e) {
      if (e.target === scrim || e.target.classList.contains("look__row"))
        Engine.closeLook();
    });

    var row = Engine.el("div", "look__row" + (items.length > 1 ? " look__row--two" : ""));
    items.forEach(function (it) {
      var p = pane(it);
      if (p) row.appendChild(p);
    });
    scrim.appendChild(row);

    scrim.appendChild(Engine.btn("iconbtn look__x", "✕", Engine.closeLook, "Close"));
    root.appendChild(scrim);
  }

  Engine.registerRegion("look", render);
})();
