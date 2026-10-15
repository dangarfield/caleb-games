# Shapes

A Shapez-style factory game for Caleb and Ezra (7+). Mine shapes from patches, move them on belts through machines that cut, rotate, paint, mix, join and filter them, and deliver them to the Hub. Each of the 20 levels is one order; finishing it speeds the factory up and may unlock a building. After level 20, freeplay hands out random orders.

## Features
- One save per builder (Caleb / Ezra), key `calebArcadeData:shapes`, through `js/arcade-store.js` (IndexedDB). Buildings (with filter rules and teleporter links), level, freeplay speeds and camera are saved. Items on belts are not.
- Home → Who's building → factory are stacked on one floor; going forward scrolls down.
- Turning Miners (sweep): drag across Miners / Link Miners and each one the drag crosses turns to the way the finger was moving as it left that tile (or entered it, for the tile the drag ends on); the last pass wins. Miner tool: a drag that touches an existing Miner becomes a sweep (from anywhere). Cursor: starts a sweep when the drag starts on a Miner, otherwise it pans. Belt tool: the belt path turns any Miners it crosses and lays belts on the empty tiles. Live preview; one undo step.
- Touch: drag to draw belts (auto corners); touch-drag-drop to place other buildings, with a drop-to-cancel ✕; hold 0.5s to delete; two fingers pan and pinch-zoom; Cursor drag pans.
- Tools: Cursor, Rotate (placement direction 0/90/180/270), Copy and paste (after level 11, grid-snapped ↻), Delete box. Undo/Redo, one step per action.
- Upgrades switch on by themselves (items/s per area, 2 → 8 by level 20 in steps of 0.2–0.8, then freeplay +0.1 per order weighted to the slowest area, cap 12; 160 freeplay orders to max everything).
- Filter picker (order quarters with shape / colour / both, or choose yourself); level-complete screen with a working demo of the unlock; Filter unlocks at level 20; freeplay levels keep counting (FREEPLAY 21, 22 …); 3-card freeplay intro, replayable from Upgrades.
- Music: 4 tracks in `music/` (webm), shuffled once per load and looped in that order; starts on the first tap/key; pauses when the tab is hidden or Music is 0. Pause menu shows the current track and a Skip button. Sound and Music sliders (0–100, 0 = Off; defaults Sound 70, Music 60) are saved per builder. SFX: 7 clips in `sfx/` played through Web Audio (tap, tick, placed, remove, cancel, level done; ui-confirm.webm is unused, confirm buttons play tap); mapping is documented above `SFX` in game.js.
- Fast mode (Pause): 0.75× canvas + chunk resolution, no moving chevrons, no menu/card animation, belt items only drawn at tile ≥ 30px, redraw capped at 30fps (sim stays 30 steps/s). Saved per device in the store.
- Performance monitor: hold the Fast mode row for 0.6s to show/hide it (under ← Games): fps, median/95th-percentile frame, draw and sim ms, buildings, belts, items, visible chunks, zoom, resolution.
- Debug: press O (keyboard) to finish the current order and trigger the level-done flow.

## Files
- `index.html`: markup, CSS, back button + `data-arcade-back` snippet.
- `js/game.js`: simulation, chunk-cached rendering, input, HUD, saves.
- `js/shapes-kit.js`: shape renderer, building sprites, menu worlds, demo scenes (shared with the design guide).
- `js/arcade-store.js`: unchanged copy of `games/dragonseed/js/store.js`.
- `card.json`, `card-icon.png`.
- `music/` (Sombre Triangle, Slow Square, Glass Hexagon, Drifting Circle — Suno originals in `research/music/`, Opus 48k, silence trimmed, no level cut) and `sfx/` (Opus mono 64k, trimmed, levelled to ~−23 dB RMS, peaks ≤ −1.5 dB; originals in `research/sounds/`).
- Design guide and build source: `research/Shapes/` (gitignored).

## Design decisions
- Quarter order everywhere (×4 ports left → right, Filter colour pick) is clockwise from top-left: TL, TR, BR, BL. Shape codes store quarters TR, BR, BL, TL internally; `QORD` in game.js maps between them.
- Pastel theme and an HTML HUD over the canvas, both deliberate exceptions to the arcade's dark theme and canvas-HUD-pill rules.
- Performance: 8×8-tile chunks cached as two canvases (floor+belts, machines) at a capped resolution; items drawn from a sprite cache; machines on a fixed 30Hz step, but belt items, tunnel mouths and chevrons move every displayed frame by the real frame time (sub-steps ≤ 1/60s, no interpolation); zero-allocation item drawing; off-screen items simulated but not drawn; menu animations stop when not visible.

## Memory
- 2026-10-15: integrated from the Claude Design build in `research/Shapes/`; placeholder store swapped for the real `arcade-store.js`; ← Games kept as the design's cream pill (top-left, `../../index.html` + arcade-back snippet).
- 2026-10-15: sweep-to-turn Miners (Cursor, Miner and Belt tools); default levels Sound 70 / Music 60.
