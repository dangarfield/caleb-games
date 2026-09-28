# Traffic Jam

3D toy-town traffic puzzles. The player drives into a Three.js town (Kenney car /
city / road models), picks a district and solves car-park puzzles: free the red car,
empty the car park, or send every car to its matching gate. 90 levels in 9 districts
(Quiet Streets → Gridlock City), stars per level, no fail state. v2 (2026-09-28) is
Dan's Claude Design rework, replacing the v1 Canvas 2D Rush Hour game.

## Features

- **Garage title screen**: "Who's driving today?" — tap Caleb's or Ezra's car in the
  3D garage (or the name card) to pick a player; each card shows total stars / 270.
- **District map**: the player's car drives along a road between 9 districts; ‹ › arrows
  (or arrow keys) move between them, "Drive in ›" (or Enter) opens the level grid.
  A district unlocks when 7 of the 10 levels in the previous one are solved
  ("Road closed" card shows progress). Last district is remembered per player.
- **Level grid**: 10 tiles per district, colour-coded by puzzle type, 0–3 stars each;
  a level opens when the previous one is solved. Legend shows the 3 types.
- **3 puzzle types / 7 variants**: Escape (Car Park, Night Shift), Clear-Out
  (Box Junction, One-Way, Roadworks), Gate Match (Colour Match, One Gate).
- **Play HUD** (right sidebar at wide aspect, top/bottom bars when narrow):
  level, type, goal, moves or cars-left, 3-star target or bumps, Hint (two-step:
  "?" shows the move, "▶ Do it" performs it), Undo, Reset. Keyboard: z/u undo,
  h hint, r reset.
- **Tips**: the first level of each variant shows a how-to toast (7s); later levels
  show the 3-star target (3.5s).
- **Win card**: "You did it! / Great driving! / Perfect!", 1–3 popping stars, confetti,
  Levels / Replay / Next.
- Web Audio SFX generated in the engine; **theme music** loops quietly from the first
  tap (no mute button, arcade rule).
- Saves per player in the legacy shared `calebArcadeData` object at
  `trafficJam[player].v2 = { stars, best, lastDistrict }` (v1's `best` is left alone).

## File structure

- `index.html` — UI/HUD layer, ported from the design's `Traffic Jam.dc.html`
  (`<x-dc>` template + `DCLogic` Component) to plain HTML/CSS/vanilla JS: same markup,
  inline styles, Fredoka font, `tjPop/tjRise/tjSlide` animations and Component logic.
  Also holds the theme-music wiring.
- `js/traffic-engine.js` — Three.js engine (`createEngine(host, callbacks)`): model
  loading, garage/map/play scenes, input, puzzle rules, hint, undo, SFX. Imports
  three@0.160 from jsdelivr. Unchanged from the design.
- `js/traffic-levels.js` — `TIERS` (9 districts), `TYPES`, `VARIANTS`, 90 `LEVELS`,
  `starTargets` / `starsFor`. Unchanged.
- `js/colour-solver.js` — Gate Match rules + A* solver (used by the engine's hint).
  Unchanged.
- `assets/{cars,city,roads}/*.glb` + `Textures/colormap.png` — Kenney models (the
  engine resolves `assets/` against `document.baseURI`).
- `audio/traffic-jam-theme.webm` — theme (Opus 48k, −6 dB), from
  `research/traffic-jam.m4a`.
- `tests/colour-match-viability.js` (+ report) — the design's Gate Match rules
  viability harness; runs standalone with `node`.
- `research/` — design zip, Kenney kits, source music, `qa/` screenshots.
- `.versions/index_001–003.html` — v1 history (003 = last Canvas 2D version).

## Key design decisions

- **No Claude Design runtime shipped.** `support.js` + React are replaced by a tiny
  renderer in `index.html`: each render builds the UI as an HTML string and *morphs* it
  into the live DOM (attributes/text patched in place). Every `<sc-if>` becomes an
  always-present keyed `display:contents` wrapper, so a screen's DOM is created once when
  it appears and entrance animations don't replay on every move. `style-active` →
  `.a1/.a2:active` classes; `style-before` (level lock icon) → `.lk::before`.
- **Three.js from jsdelivr** (full-URL imports inside the engine, no import map) — the
  arcade norm for 3D games. Google Fonts + jsdelivr are the only network hosts.
- **Directory URL guard**: the page redirects `/games/traffic-jam` → `/games/traffic-jam/`
  so `assets/` and `js/` resolve (the old trailing-slash trap).
- **Saves kept exactly as designed** in the shared `calebArcadeData` localStorage object
  (not migrated to IndexedDB — the game already lived there). Save writes are wrapped
  in try/catch.
- **Music** follows `knowledge/audio-patterns.md`: `<audio preload="none" loop>`, LEVEL 0.5,
  armed on pointerdown/pointerup/click/touchend/keydown, paused on `visibilitychange`.
  The engine's `setMuted` (read from the design's `trafficJamMuted` key, never set now)
  only affects SFX.
- Dropped the design's unused `toggleMute`/`muteLabel`/`starGoal` render values (no
  template references them; no mute button by arcade rule).

## Memory

### v1 (Canvas 2D, retired 2026-09-28)

- Built via the `new-game` recipe. All 12 embedded levels were generated and
  double-verified solvable — once by the Python authoring solver, once by the
  in-game JS BFS solver — with matching minimum-move counts before ship.

### v2

- 2026-09-28: Replaced with Dan's Claude Design rework (3D Three.js, 90 levels / 9
  districts / 3 types). Design template + Component ported to vanilla JS with a
  morphing renderer; engine, levels and solver copied unchanged. Theme music encoded
  and wired. Verified in a browser at 1333×690 (title → district → levels → play → win
  → replay, no console errors, music starts on first tap, DOM stable across moves).
- 2026-09-28 (review fix): narrow play HUD had "‹ Levels" in the top-left corner (as in the design) — moved to the right end of the top bar so the arcade back-button corner stays clear.
- 2026-09-28: Clear-Out (grid) levels now get the same subtle grey halo under each car as Escape levels (engine makeCar loop, baseHalo #d9d6e4 @ .14).
- 2026-09-28: "← Games" back link is now one persistent element (top-left, above every screen incl. loading, play, win and the wipe) instead of only on title/map; map top bar and narrow play bar shifted right to clear it.
- 2026-09-28: tap picking fixed — pickCar now raycasts the actual car models first (nearest mesh under the finger wins, so tall trucks and cars behind them pick correctly); the old footprint-distance guess is only a near-miss fallback, tightened from 0.55 to 0.35. setPointerCapture wrapped in try/catch.
- 2026-09-28: long-press / right-click no longer opens the browser menu, callout or selection (body CSS + contextmenu preventDefault), per the new arcade rule.
