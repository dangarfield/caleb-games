# Arcade back: "← Games" acts as the browser back button

Every game's `← Games` link keeps `href="../../index.html"` (GitHub Pages needs that exact form,
see `back-button-check`), and every `games/<name>/index.html` also carries the snippet below,
pasted unchanged just before `</head>`. `back-button-check` fails a game without it.

What it does:
- A click on any link whose `href` is exactly `../../index.html` calls `history.back()` **when
  the page was opened from the arcade home** (checked via `document.referrer`). Home comes back
  from the browser's cache exactly as it was left, scroll position and all, with no reload.
- Opened any other way (direct URL, bookmark, a dev tool, another site), the link navigates
  normally, so the button never strands anyone or takes them out of the arcade.
- If going back only pops an in-game history entry, or nothing happens within 2.5s, it
  navigates home directly.
- It listens on `document`, so links built in JS (`back.href = …`, framework `h('a', …)`) are
  covered too. A game's own `onclick` that returns `false` (e.g. a "leave this game?" confirm)
  still wins, because the snippet ignores clicks that are already `defaultPrevented`.

Don't write game-specific back logic; if a game needs to save first, do it on `pagehide`
(which fires for back navigation too) or in the link's own `pointerdown`/`click` handler.

```html
<script data-arcade-back>
/* arcade-back v1 (knowledge/arcade-back.md). "← Games" = the browser's back button.
   Any link whose href is exactly ../../index.html goes BACK in history when this page was opened
   from the arcade home, so home comes back as it was left (scroll position, no reload).
   Opened any other way (bookmark, direct URL, dev tool), the link just navigates as normal. */
(function () {
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.getAttribute('href') !== '../../index.html') return;
    var home = new URL(a.href), ref;
    try { ref = new URL(document.referrer); } catch (err) { return; }
    var dir = home.pathname.replace(/index\.html$/, '');
    if (ref.origin !== home.origin || (ref.pathname !== home.pathname && ref.pathname !== dir) || history.length < 2) return;
    e.preventDefault();
    var go = function () { location.href = home.href; };
    // Still on this page after going back (an in-game history entry) or nothing happened: go home directly.
    addEventListener('popstate', go, { once: true });
    var t = setTimeout(go, 2500);
    addEventListener('pagehide', function () { clearTimeout(t); }, { once: true });
    history.back();
  });
})();
</script>
```
