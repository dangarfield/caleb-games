# UX Patterns

The shared in-game UI conventions. Read when building the HUD, game-over, or the
landing-page card.

## HUD pill (canvas-drawn, top center)

```
Position: centered horizontally, y = 14
Background: rgba(0,0,0,0.4), roundRect radius 14
Border: rgba(255,255,255,0.1) 1px stroke
Height: 52–54px, width: dynamic
```

Score: `bold 24px` white. Labels: `bold 14px` muted white. Progress bar:
`#a29bfe` fill, 3–4px height.

## Game over screen (canvas-drawn, NOT HTML)

1. Fade-in black overlay (globalAlpha 0 → 0.6).
2. Title "Game Over" — large, white, accent shadow glow blur 30.
3. Score — `#ffd32a` gold.
4. Play Again button — gradient fill, roundRect radius 12, ~200×50px.

Victory variant: `#ffd32a` glow title + confetti particles.

## Landing-page card (games/<name>/card.json)

The home page is generated. Write `games/<name>/card.json` per `.apm/specs/game-card.spec.md`
(`"added"` = ship date) and let the `cards-index` hook rebuild `index.html`. Never edit
`index.html` by hand. Still add a row to `docs/games-index.md` and bump its count.

## No long-press menus (touch and mouse)

A child holds a button down; the browser answers with "Copy / Look up / Save image", a
selection handle, or a right-click menu, and the game is gone behind it. Every game ships
this, whatever else it does:

```css
body {
  -webkit-touch-callout: none;   /* iOS long-press callout */
  -webkit-user-select: none;
  user-select: none;             /* no selection handles on hold */
  -webkit-user-drag: none;       /* no ghost-drag of images/links */
}
img, a, canvas { -webkit-user-drag: none; }
input, textarea { -webkit-user-select: text; user-select: text; }  /* only real text fields */
```

```js
// Long-press on touch and right-click / hold on a mouse both raise 'contextmenu'.
document.addEventListener('contextmenu', e => e.preventDefault());
```

- It goes on `body`, not on individual buttons — HUD, cards, overlays and the canvas all need it, and a per-element rule always misses one.
- Links count too: the `<- Games` back link must not offer "Open in new tab" on a hold.
- Do not rely on `touch-action: none` for this — it stops panning and zoom, not the callout or the menu.
- Check it: hold the mouse down on a button for 2s and right-click the canvas — nothing should appear.
