/* rite.js — the six runes.
 *
 * Getting muddled no longer ends your day. When your head fills up you cast
 * the spell of calm: six carved runes come out of order and you put them back,
 * fewest marks on the left, most on the right. Each one that lands in its place
 * ticks. Six ticks and the spell settles, the confusion clears, and the day
 * carries on exactly where it was.
 *
 * It is deliberately a small tedious thing. Its only job is to make spamming
 * guesses and hints cost you something you notice, without inventing a story
 * consequence or a standing to nurse. Nothing else in the game reads it.
 */

const Rite = (function () {

  var COUNT = 6;

  /* a stave with N marks, plus a different head per rune so they are told
     apart at a glance and not only by counting */
  var HEADS = [
    'M50 16 l0 12',
    'M38 18 l12 12 l12 -12',
    'M50 14 l-12 14 l24 0 z',
    'M38 16 l24 0 M50 16 l0 14',
    'M50 14 a9 9 0 1 0 .1 0',
    'M38 14 l24 18 M62 14 l-24 18'
  ];

  function runeSvg(n, settled) {
    var ink = settled ? "#5f7a4a" : "#e6d9b4";
    var o = ['<svg viewBox="0 0 100 130" width="46" height="60" aria-hidden="true" focusable="false">'];
    o.push('<path d="' + HEADS[n] + '" fill="none" stroke="' + ink + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>');
    o.push('<line x1="50" y1="30" x2="50" y2="112" stroke="' + ink + '" stroke-width="6" stroke-linecap="round"/>');
    for (var i = 0; i <= n; i++) {
      var y = 44 + i * 11;
      o.push('<line x1="50" y1="' + y + '" x2="' + (i % 2 ? 68 : 32) + '" y2="' + (y + 6) +
             '" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>');
    }
    o.push('</svg>');
    return o.join("");
  }

  function shuffled() {
    var a = [], i;
    for (i = 0; i < COUNT; i++) a.push(i);
    do {
      for (i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
      }
    } while (solved(a) || settledCount(a) > 2);   // never open already half-done
    return a;
  }
  function solved(a) { return a.every(function (v, i) { return v === i; }); }
  function settledCount(a) { return a.filter(function (v, i) { return v === i; }).length; }

  /* ---------- drag to reorder ----------
   * You pick a rune up and it comes with you: a copy follows the pointer, the
   * space it left becomes a dashed slot, and the runes it passes shuffle out of
   * its way so you can see the row you are about to make. Nothing is committed
   * until you let go — before that it is all preview, and dropping it back
   * where it started changes nothing.
   *
   * Everything repaints the row in place. Calling Engine.render() mid-drag
   * rebuilt the modal and restarted its open animation, which read as the
   * dialog shutting and reopening under your finger.
   */
  var drag = null;            // { value, home, at, order, ghost }
  var rowEl = null;
  var countEl = null;

  /* Where in the row the pointer is, as an insertion index 0..COUNT-1. Measured
     from the slots that are actually on screen, so it survives wrapping. */
  function indexAt(x, y) {
    if (!rowEl) return null;
    var kids = rowEl.children, best = null, bestD = Infinity;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var d = Math.abs(x - cx) + Math.abs(y - cy) * 0.35;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* the row as it would be if you let go now: the held rune lifted out and put
     back in at `at` */
  function preview(order, home, at) {
    var a = order.slice();
    var v = a.splice(home, 1)[0];
    a.splice(at, 0, v);
    return a;
  }

  function moveGhost(e) {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.left = e.clientX + "px";
    drag.ghost.style.top  = e.clientY + "px";
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    moveGhost(e);
    var at = indexAt(e.clientX, e.clientY);
    if (at == null || at === drag.at) return;
    drag.at = at;
    repaint();
  }

  function onUp() {
    if (!drag) { detach(); return; }
    var d = drag;
    drag = null;
    detach();
    /* dropped back where it came from: nothing happened */
    if (d.at === d.home) { repaint(); return; }
    if (!Engine.riteSet(preview(d.order, d.home, d.at))) repaint();
  }

  function detach() {
    if (drag && drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    var g = document.querySelector(".ghost--rune");
    if (g && g.parentNode) g.parentNode.removeChild(g);
    document.body.classList.remove("is-riting", "is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }

  /* redraw just the runes and the counter, keeping the card itself untouched */
  function repaint() {
    var order = Engine.state.rite;
    if (!rowEl || !order) return;
    var shown = drag ? preview(order, drag.home, drag.at) : order;
    Engine.clear(rowEl);
    fill(rowEl, shown);
    if (countEl) countEl.textContent = settledCount(shown) + " of " + COUNT + " in place";
  }

  /* ---------- the card ---------- */
  function render(card) {
    var order = Engine.state.rite || [];
    var done = settledCount(order);
    rowEl = null; countEl = null;

    card.appendChild(Engine.el("h2", "modal__title", "You're confused!"));
    var say = Engine.el("p", "modal__body");
    say.appendChild(document.createTextNode("Too many guesses and your head has gone woolly. Cast "));
    say.appendChild(Engine.el("b", "rite__spell", "the spell of calm"));
    say.appendChild(document.createTextNode(": drag the runes so the marks run fewest on the "
      + "left to most on the right."));
    card.appendChild(say);

    var row = Engine.el("div", "runes");
    rowEl = row;
    fill(row, order);
    card.appendChild(row);

    countEl = Engine.el("p", "rite__count", done + " of " + COUNT + " in place");
    card.appendChild(countEl);
  }

  function fill(row, order) {
    order.forEach(function (v, i) {
      /* the slot the held rune would land in is drawn as a hole, not a rune —
         the rune itself is under the pointer */
      if (drag && i === drag.at) {
        var hole = Engine.el("div", "rune rune--hole" + (v === i ? " rune--hole-set" : ""));
        hole.setAttribute("aria-hidden", "true");
        hole.appendChild(Engine.el("span", "rune__holemark", v === i ? "\u2713" : String(v + 1)));
        row.appendChild(hole);
        return;
      }
      var settled = v === i;
      var r = Engine.el("div", "rune" + (settled ? " rune--set" : "")
                              + (drag ? " rune--shifting" : ""));
      r.setAttribute("data-slot", String(i));
      r.setAttribute("role", "button");
      r.tabIndex = 0;
      r.setAttribute("aria-label", (v + 1) + " marks, position " + (i + 1) + (settled ? ", in place" : ""));
      r.innerHTML = runeSvg(v, settled);
      if (settled) r.appendChild(Engine.el("span", "rune__tick", "\u2713"));

      r.addEventListener("pointerdown", function (e) {
        if (drag) return;
        e.preventDefault();
        var live = Engine.state.rite;
        drag = { value: live[i], home: i, at: i, order: live.slice(), ghost: null };
        /* a copy of the rune, following the pointer */
        var g = Engine.el("div", "ghost ghost--rune");
        g.innerHTML = '<div class="rune rune--held">' + runeSvg(drag.value, false) + '</div>';
        document.body.appendChild(g);
        drag.ghost = g;
        moveGhost(e);
        document.body.classList.add("is-riting", "is-dragging");
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        repaint();
      });
      /* keyboard: pick a rune, then use the arrows to walk it along the row */
      r.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        if (!step) return;
        var to = i + step;
        if (to < 0 || to >= COUNT) return;
        e.preventDefault();
        if (!Engine.riteSwap(i, to)) { repaint(); focusSlot(to); }
      });
      row.appendChild(r);
    });
  }

  function focusSlot(i) {
    requestAnimationFrame(function () {
      var n = document.querySelector('.rune[data-slot="' + i + '"]');
      if (n) n.focus();
    });
  }

  return { render: render, shuffled: shuffled, solved: solved, COUNT: COUNT };
})();
