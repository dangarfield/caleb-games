/* shelf.js — the left rail: every specimen you have found.
 *
 * A pot ALWAYS shows its plate. Hiding the art behind a generic pot meant a
 * column of identical tiles and no reason to pick one over another, which is
 * backwards — you can always see a plant, the puzzle is putting a NAME to it.
 *
 * There are no quantities. A visitor buys a dose made from the plant, so the
 * pot never empties. Matching one to its page is the thing that changes, and an
 * identified pot is marked plainly: a lit background, a brass edge and its name
 * written where "unnamed" was.
 *
 * The pot currently on the desk keeps its full brightness and gets a small
 * "on the desk" label. Dimming it made the one you were working on the hardest
 * thing on the rail to see.
 */

(function () {

  function renderShelf(root) {
    var st = Engine.state;
    var list = Engine.shelfList();
    var named = list.filter(function (s) { return Engine.isIdentified(s.id); }).length;

    var big = !!st.shelfBig;

    var head = Engine.el("div", "rail__head");
    head.appendChild(Engine.el("h2", "rail__title", "Shelves"));
    /* "0 of 29 named" plus a title plus a button does not fit in 196px, and
       the title is the last thing that should be truncated */
    head.appendChild(Engine.el("span", "rail__count", named + "/" + list.length + " named"));
    /* Open the shelves out over the bench. At 66px a plant is a stamp, and
       looking at plants is the whole game, so there has to be a way to
       actually look. Choosing one closes it again with that plant on the
       desk — which is the only reason you opened it. */
    /* One button, on the end of the header row, so it costs no height at all. */
    head.appendChild(big
      ? Engine.btn("rack__zoom rack__zoom--close", "\u2715",
          function () { Engine.setShelfBig(false); }, "Back to the desk")
      : Engine.btn("rack__zoom", "\u2922",
          function () { Engine.setShelfBig(true); }, "See the shelves bigger"));
    root.appendChild(head);

    /* the rail is a drop target: drag the pot off the desk to put it back */
    Engine.registerZone(root, function (payload) {
      if (payload.kind === "pot" && Engine.onDesk(payload.id)) Engine.returnToShelf(payload.id);
    });

    if (!list.length) {
      root.appendChild(Engine.el("p", "rail__empty", "Nothing on the shelves yet."));
      return;
    }

    var rack = Engine.el("div", "rack" + (big ? " rack--big" : ""));
    rack.setAttribute("role", "list");
    list.forEach(function (s) {
      var known = Engine.isIdentified(s.id);
      var out = Engine.onDesk(s.id);

      var pot = Engine.el("div", "pot"
        + (known ? " pot--named" : "")
        + (out ? " pot--out" : "")
        + (Coach.has("pot:" + s.id) ? " is-coached" : ""));
      pot.setAttribute("role", "listitem");
      pot.tabIndex = 0;
      pot.setAttribute("aria-label",
        (known ? s.name : "unnamed specimen") + (out ? ", on the desk" : "")
        + ". Enter to put it on the desk.");
      if (out) pot.appendChild(Engine.el("span", "pot__flag", "on the desk"));

      var art = Engine.el("div", "pot__art");
      art.innerHTML = Plate.art(s, big ? { w: 190, h: 190 } : { w: 66, h: 66 });
      pot.appendChild(art);

      var nm = Engine.el("div", "pot__name" + (known ? "" : " pot__name--unknown"),
                          known ? s.name : "unnamed");
      pot.appendChild(nm);

      function toDesk() {
        if (big) Engine.setShelfBig(false);     // shut the drawer behind you
        Engine.placeOnDesk(s.id);
      }
      pot.addEventListener("click", toDesk);
      pot.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toDesk(); }
      });
      /* sideways picks the pot up; up and down scrolls the rail it lives in */
      Engine.makeDraggable(pot, { kind: "pot", id: s.id }, Plate.art(s, { w: 78, h: 78 }),
                           { lockAxis: "x" });

      rack.appendChild(pot);
    });
    root.appendChild(rack);
  }

  Engine.registerRegion("shelf", renderShelf);
})();
