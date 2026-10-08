# Portal Lab (games/portal-lab)

A first-person portal puzzler in three.js with an HTML HUD. Fire a blue and a pink portal, walk through, and find the way out of each test chamber. Designed in Claude Design ("Blink Lab tablet design") and integrated on 2026-10-08. Touch-first, 1333×690 landscape. It was called Blink Lab in the design and was renamed Portal Lab (folder, save key, card, labels, docs) before it shipped.

## How it plays
- **Home:** pick Caleb or Ezra (each has their own cleared chambers, times and Sound/Music levels), then Continue or Chambers.
- **Chambers:** three groups. **Tutorial** (6), **Clearance Blue** (30, one star) and **Clearance Pink** (30, two stars). A group opens when the one before it is done; inside a group each chamber opens when the one before it is cleared.
- **Controls:** floating left stick to move, drag the right side to look, hex buttons for jump, grab/drop, blue and pink. Keys for desktop testing: R D F G move, Space jump, I blue, O pink, T grab, Esc pause. Mouse locks on click (left = blue, right = pink, middle = grab).
- **Guns:** the gun a chamber starts with is in its `gun` field. Tutorial 3's pedestal gives the blue gun, Tutorial 5's (`pedestalGun: "both"`) unlocks pink.
- **Kit:** white panels (portals stick), metal, glass, boxes and droppers, pressure pads and round doors, sentry robots (the only thing that can hurt you), moving platforms, the exit.
- **Results:** time and portals used per chamber, with best time and fewest portals kept per player.

## Saves
IndexedDB through `game/arcade-store.js` (an unmodified copy of `games/dragonseed/js/store.js`): `ArcadeStore("portal-lab")`, one item `calebArcadeData:portal-lab` holding `{ current, players: { caleb, ezra }, perf, gen, sid }`. Writes are guarded (`sid`/`gen`, `{ guard: true }`), so an old tab left open stops saving and shows the conflict panel.

## Files
- `index.html`: head from the design (title, favicon, Chakra Petch / JetBrains Mono / Material Symbols), the contextmenu guard, the `data-arcade-back` snippet, and a `<noscript>` "← Games" link (the real one is the design's, in the view).
- `js/main.js`: mounts the app on `#ui` (`window.portalLab`; the engine is `window.__portalLab`).
- `js/bl-app.js`: **the game shell**, the design's component logic (saves, progress, screens, briefing, results, pause, perf) unchanged, on a small `Screens` base (setState merges and re-renders once per microtask).
- `js/bl-view.js`: **generated** screen markup, `view(v, on)` → HTML string, plus the `:active` styles. Rebuild with `node games/portal-lab/tools/dc-to-view.mjs "games/portal-lab/research/Blink Lab tablet design/Blink Lab 3D v3.dc.html" games/portal-lab/js/bl-view.js` if the design is exported again.
- `js/bl-dom.js`: morphs that HTML into `#ui`, keeping nodes in place. Delegated `data-on-*` handlers get the declaring element as `e.currentTarget` (the engine's touch code needs it). `data-keep` nodes (canvas host, look stick, hurt flash) keep their children and engine-set styles.
- `game/*.js`: the design's engine, unchanged. `game.js` (entry, loads three@0.164.1 from jsDelivr), `world.js`, `assets.js`, `props.js`, `portals.js`, `physics.js`, `input.js`, `character.js`, `gun.js`, `sfx.js` (Web Audio synth effects + the theme).
- `game/levels.json`: every chamber. Format in `research/Blink Lab tablet design/game/LEVELS.md`.
- `audio/portal-lab-theme.webm`: the theme (Opus 48k, −6 dB). The original m4a and an mp3 are in `research/`.
- `tools/dc-to-view.mjs`: the template converter (adapted from Ember Bay's).

## Sound
Synth effects through the Sounds gain, the theme through the Music gain; both sliders in the pause menu and saved per player. Nothing plays before the first tap.

## Performance
Performance mode in the pause menu drops to the Low quality path. P (or holding the Performance row) shows the stats overlay: FPS, CPU ms, draw calls, portal passes, render size and scale.

## Source
- Claude Design handoff: `research/Blink Lab tablet design/` (gitignored). `Blink Lab 3D v3.dc.html` is the game, plus `Level Editor.dc.html`, `Sound Lab.dc.html`, the design doc and `game/LEVELS.md`. The editor and labs are not shipped.
- Level ideas: the project docs `portal/test-chambers-00-06.md` and `portal/puzzle-ideas-30.md`.

## Integration notes (2026-10-08)
- The design runtime (`support.js`, React) is not shipped. The template became `js/bl-view.js` + `js/bl-dom.js`, the component became `js/bl-app.js`, logic as designed. `React.createRef()` became `{ current: null }` objects, filled through ref callbacks at render.
- The "← Games" link is the design's own, rendered by the view exactly as designed (font, styling, and hidden while loading). `index.html` carries a `<noscript>` copy so the back-button check finds a static link.
- The home-page card copies the design doc's card (section 13): grid, bottom fade, Chakra Petch title, "Two portals. One way out.", and the two portal rings as `card-icon.svg`. Those fields are `locked` in `card.json`.
- The arcade-back snippet is the canonical one from `knowledge/arcade-back.md`.
- Checked headless at 1333×690: home, chambers, briefing, play HUD, pause (Sound, Music, Performance), the blue-gun pickup in TU-03, and the touch look stick.

## Memory
