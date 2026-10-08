# UX Patterns

The shared in-game UI conventions. Read when building the HUD, game-over, or the
landing-page card.

## Three.js / WebGL games: the UI is HTML/CSS

If the game renders with Three.js (or any WebGL), **every piece of UI is DOM**: HUD,
menus, title screen, pause, settings, dialogs, tooltips, on-screen controls and the
game-over / victory screen. Nothing UI-related is drawn in WebGL (no text sprites,
no textured planes for buttons) or on an extra 2D canvas.

- Stack a full-screen `#ui` layer over the renderer canvas (`position:fixed; inset:0;
  pointer-events:none`) and give each interactive panel `pointer-events:auto`, so
  touches on empty space still reach the 3D scene.
- Crisp text at any DPR, real tap targets, CSS transitions and accessibility come free,
  and the scene can drop its resolution on a slow tablet without blurring the UI.
- In-world labels that must track a 3D object (name tags, damage numbers) are DOM
  elements positioned from `vector.project(camera)` each frame. They are not sprites.
- The HUD pill and game-over specs below still describe the look. Build them in CSS.

The canvas-drawn HUD pill and game-over below apply to **Canvas 2D games only**.

## HUD pill (canvas-drawn, top center, Canvas 2D games)

```
Position: centered horizontally, y = 14
Background: rgba(0,0,0,0.4), roundRect radius 14
Border: rgba(255,255,255,0.1) 1px stroke
Height: 52–54px, width: dynamic
```

Score: `bold 24px` white. Labels: `bold 14px` muted white. Progress bar:
`#a29bfe` fill, 3–4px height.

## Game over screen (Canvas 2D games: canvas-drawn, NOT HTML)

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

## Pause menu

Every game has one (pause button top-right). It always carries the **Sound** and **Music** sliders
(recipe in `knowledge/audio-patterns.md` → *Volume sliders*) as well as the game's own options, and — in a
Three.js game with a Fast mode — the Fast mode row that doubles as the performance monitor's hold target.

## Performance monitor (Three.js games)

A hidden debug overlay: three.js Stats (FPS / ms / MB — tap it to switch panel) plus a line of renderer
numbers, top-left directly under "← Games". **P** toggles it; on the tablet, **hold the Fast mode row in the
pause menu for ~0.6s** (the hold must not also flip Fast mode). Remembered in the settings.

```js
import Stats from 'three/addons/libs/stats.module.js';
const stats = new Stats();
stats.dom.style.cssText = 'position:fixed;top:64px;left:12px;z-index:9998;cursor:pointer;opacity:.9;display:none';
const monInfo = document.createElement('div');
monInfo.style.cssText = 'position:fixed;top:118px;left:12px;z-index:9998;padding:3px 6px;background:rgba(0,0,16,.75);color:#0ff;font:600 11px/1.35 monospace;white-space:pre;pointer-events:none;display:none';
document.body.append(stats.dom, monInfo);
let monOn = false, monHeld = false, draws = 0, monT = 0;
const showMon = v => { monOn = !!v; stats.dom.style.display = monInfo.style.display = monOn ? 'block' : 'none'; };
const toggleMon = () => { settings.mon = !monOn; showMon(settings.mon); save(); };
addEventListener('keydown', e => { if ((e.key === 'p' || e.key === 'P') && !e.repeat) toggleMon(); });
{ // hold the Fast mode row; its buttons ignore the click that ends a hold:  if (monHeld) { monHeld = false; return; }
  const row = fastModeRow; let t = 0; const cancel = () => clearTimeout(t);
  row.addEventListener('pointerdown', () => { cancel(); monHeld = false; t = setTimeout(() => { monHeld = true; toggleMon(); }, 600); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => row.addEventListener(ev, cancel));
}
// at the end of every animation frame (drew = whether renderer.render ran this frame):
function monTick(now, drew) {
  if (!monOn) return;
  stats.update(); if (drew) draws++;
  if (now - monT >= 1000) {
    const r = renderer.info.render, c = renderer.domElement;
    monInfo.textContent = `redraws ${draws}/s\n${r.calls} calls · ${Math.round(r.triangles / 1000)}k tris\n${c.width}×${c.height}`;
    draws = 0; monT = now;
  }
}
```

Worked example: `games/pocket-pros/index.html` (search `performance monitor`).
