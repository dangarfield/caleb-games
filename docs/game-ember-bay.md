# ember-bay

**Ember Bay** is an open-town firefighter game for Caleb and Ezra (aimed at about 8). You drive a fire engine
around a low-poly **Three.js** coastal town (mainland, river with two bridges, an island) and answer calls: 22
minigames, each with 3 levels at 3 different spots in town, so 66 tasks. Every 11 tasks is a new rank, from
Trainee Firefighter to Chief of Ember Bay. Finishing all 3 levels of a job earns its badge. All the UI is
HTML/CSS over the WebGL canvas, on a 1333×690 stage scaled to fit. It's landscape and touch-first, and the
keyboard is only there for desktop debugging.

It was designed in Claude Design and handed off in `games/ember-bay/research/Firefighter minigames for threejs/`
(`research/` is gitignored). The game shell is `Ember Bay.dc.html`, and that folder also holds the GUI, minigame,
city-plan and asset-library boards, plus the design run plan (`docs/.plans/game-ember-bay.plan.md`) and the
asset notes (`CLAUDE.md`).

## Features

- **Home + crew:** pick Caleb or Ezra. Each player is a 3D character card (Idle, Victory when selected) with their own progress, rank, story-seen flag and target. Settings are shared.
- **Story** (3 lines from Chief Ember, whose portrait is a live 3D Cowboy_Male bust with a little cheer on each line (`createCrew(..., { bust: true })` in `js/home-crew.js`), each with its own slowly orbiting camera shot: the whole town from the sea, your first call's pin up close, then the fire engine at the station; `c3.storyShot()`), then a **3-step tutorial**: hold to go, tap to steer, follow the arrow.
- **Town HUD:** pause, a target strip (job, level pips, a nav arrow and distance, and a Tasks button), a rotating minimap (tap it to open the Map), ◀ ▶ steer, go/reverse, siren and horn. The steer and drive sides swap in Settings. A **Start** button appears when you stop inside a glowing task ring.
- **Tasks** (all 22 with level pips; tap one to target it), **Map** (top-down snapshot with every open pin; Set target).
- **Task intro** (category, level, place, 3 steps, goal, gesture hint) → **game** (Quit / pause) → **Well done** (level track, Next up, Go there), **Badge** (after level 3, rank-up callout), **Nearly!** (tip, Later / Try again), **All done** (all 66 tasks, badge wall, Free drive).
- **Pause / Settings:** Resume, Restart, Later, Tasks, Home, the **Sound** and **Music** sliders, steer left/right, camera close/far, Fast mode (fewer shadows and people for older iPads), and hold-for-3-seconds reset.
- **Town:** traffic on the road graph (left-hand lanes) that pulls over for the siren, pedestrians on the pavements who jump aside, farm animals, bicycle-model steering, collisions from each model's real footprint, and no driving into the sea or the mountains.
- **Debug (desktop only):** `D` opens a panel to launch any game at any level, Complete 65 or Reset. `W` / `F` win or fail the current minigame. `Esc` pauses. No keys are shown in the UI.

### The 22 minigames (`js/minigames-meta.js` has the intro data)

Fire: Hose Down, Fire Line, Drone Drop, Heli Bucket. Rescue: Cat Rescue, Catch!, Supply Drop, Torch Hunt, Pet
Parade, Heat Seeker. Water: Hydrant Hookup, Sandbag Wall, River Rescue, Hydrant Thaw. Safety: Hazard Hunt, Truck
Check, Power Off, Dispatch, Foam Mixer. Drive: Clear the Road, Race to Rescue.

Most of them run **inside the town** (`js/mgc1.js`, `js/mgc2.js`, via `cityStage` in `js/mg-kit.js` and
`c3.mgBegin/mgEnd`). They borrow the town renderer, and the engine, camera and hidden props are restored on exit.
The indoor and board games (torch, smoke, hazard, heat, line, dispatch) have their own stage. A level is a
difficulty step. There are no timers.

## Sound

- **SFX** (`js/sfx.js`): recorded samples in `audio/sfx/` (mono 64k mp3 made from Dan's files in `research/interiors/sounds/`, decoded once on the first tap; 1.5 MB):
  - **Driving:** **engine** (plays from the top when you move off, then loops 0:11–0:48 while you keep driving, pitch follows speed, fades when you stop), **reverse** beeper (while reversing), **bump** (hitting a building, a car, the sea edge or a mountain; louder when faster), **siren** (loops while on), **horn** (sustains while held, tapers off on release).
  - **Minigames:** **water** (while a hose sprays), **fire** (crackle while flames burn), **steam** (each flame going out), vehicle loops **rotors** (Heli Bucket), **drone** (Drone Drop) and **boat** (River Rescue) while the game runs. Each rescue game has its own "good" sound: Catch! **boing** (pig lands on the cushion) plus an **oink** when a pig appears at a window, Cat Rescue **meow** (at the start and when you grab the cat), Torch Hunt and Pet Parade **chick** cheeps.
  - **Progress and UI:** **waypoint-reached** (pulling into a task ring, finishing a level), **waypoint-started** (Go, picking a firefighter, Set target / Go there), **achievement** (badge, rank up, all done), **fail** (Nearly!), **radio** walkie-talkie (each Chief Ember line, Dispatch start), **tap** (UI buttons).
  - Loops are kept alive by per-frame calls and fade out on their own, and they stay silent while paused or on menus (`sfx.live`). Generated tones remain for good/bad, splash, hiss and thud, and every sample falls back to a generated sound if it can't load.
- **Theme music**, `audio/ember-bay-theme.webm` (155 s, Opus 48k, encoded 6 dB down from `research/ember-bay.m4a`), plays on a loop from the first tap and pauses when the tab is hidden (`js/theme-music.js`). It uses `preload="none"`, stays armed on activation-granting events, and resumes the AudioContext on every armed event until both the element and the context are running.
- **Deliberate exception to `knowledge/audio-patterns.md`:** at Dan's request, Settings has a **Music** slider (♪, `set.mus`) under the **Sound** slider (`set.vol`, SFX + siren). The `<audio>` is routed through Web Audio (`createMediaElementSource` → 0.5 level gain → the music bus in `js/sfx.js`, `setMusicVolume`) rather than `el.volume`, which iPad Safari ignores. 0 = silent; there is still no mute button.

## Files

- `index.html`: stage and scaling hosts (`#city` for the town renderer, `#mg` for own-stage minigames, `#ui` for the screens), the import map (three 0.160.0 + addons + meshoptimizer simplifier from jsdelivr), Archivo and Material Symbols Sharp from Google Fonts, the long-press guards, `js/arcade-store.js`, the arcade-back snippet, and the `← Games` link (static, top-left on every screen).
- `js/main.js`: mounts the game (`window.emberBay` for console checks).
- `js/eb-app.js`: **the game shell**, which is the design's component logic (progress, saves, screens, tutorial, nav arrow, minimap, pause and settings, debug). It runs on a small `Screens` base: `setState` merges straight away and re-renders once per microtask.
- `js/eb-view.js`: **generated** screen markup (plus a hand-added Music slider row — re-add it after regenerating), `view(v, on)` → HTML string. Rebuild it with `node games/ember-bay/tools/dc-to-view.mjs "<…>/Ember Bay.dc.html" games/ember-bay/js/eb-view.js` if the design is exported again.
- `js/eb-dom.js`: morphs that HTML into `#ui`, keeping nodes in place so held buttons, canvases and the slider survive re-renders. It dispatches `data-on-*` handlers and calls `data-ref` refs. `data-k` keys the screen blocks, and `data-keep` nodes keep their children and code-set attributes.
- `js/city-gen-v3.js` (+ `js/city-gen.js` for `GAMES`, the grid and the RNG): seeded town generator (seed 1333) and event solver. It places 66 events.
- `js/city-3d-v2.js`: town renderer, driving, traffic, collisions, pins, minimap snapshot, and the minigame borrow API.
- `js/city-assets.js`: loads the gzipped GLB packs (`DecompressionStream`), people, animals, interiors and hazards. `mergeSkinned()` merges each character's body parts into one skinned mesh (flat colours baked to vertex colours), so a person or animal is one draw call (a cow was 106).
- `js/city-peds.js`, `js/city-markers.js`, `js/home-crew.js`: pedestrians, task markers, home crew portraits.
- `js/mg-kit.js`, `js/minigames.js` (+ `minigames2.js`, `minigames3.js`, `mgc1.js`, `mgc2.js`), `js/minigames-meta.js`: the minigames.
- `js/arcade-store.js`: an unmodified copy of `games/dragonseed/js/store.js`.
- `assets/`: about 39 MB of converted packs. `city-{buildings,ground,vehicles,props,nature}.glb.gz` + `city-assets-index.json` + `city-palette-1024.jpg` (LowPoly City), `city-templates.json` (lot templates), `extra-*.glb.gz` + `.json` (SimplePoly City, Rgsdev vehicles, FBX building pack, cartoon cars, boats, helicopter/drone, the Blaze kit), `people/` (24 street characters, Quaternius), `animals/`, `interiors/` (9 rooms), `hazards/` (15).
- `tools/slim-packs.mjs` (+ `package.json`, `keep-models.json`): strips never-used models from the town packs and pre-simplifies heavy meshes (what used to run at load). Start from the original packs in the design folder; see the file header.
- `tools/`: dev-only converters from the design (`fbx-convert.js`, `kit-models.js`, `simplify-room.js`, `hazards-gen.js`, `chick-gen.js`) and `dc-to-view.mjs`.

## Saves

IndexedDB through `arcade-store.js`, key `calebArcadeData:emberbay` =
`{ gen, sid, crew, set: { vol, mus, steerRight, far, fast }, players: [caleb, ezra] }`. Each player is
`{ lv: { <gameId>: 0–3 }, seenStory, target }`. Writes are stamped with `sid`/`gen` and use `{ guard: true }`.
The design's old `localStorage['blaze-emberbay-save-v1']` is migrated once into the active player.

## Integration notes (2026-10-01)

- The design runtime (`support.js`, React) is not shipped. The template became `js/eb-view.js` + `js/eb-dom.js`, and the component became `js/eb-app.js`, with the logic kept as designed.
- Every `https://esm.sh/three@0.160.0` import became bare `three` / `three/addons/` through the import map, so there's one THREE instance.
- Assets come from the design folder except `city-demo-layout.json` (only used by the design's asset demo) and the 22 non-street characters (knights, zombies, wizards and so on), which nothing loads. `people/index.json` was pruned to match.
- Theme music is back (it was commented out in the design) and tied to the Sound slider. The audio preload fix means `preload` is set before `src`, so nothing is fetched before the first tap.
- The review fixes: the music now wakes a suspended AudioContext on the second tap. The morph no longer strips code-set attributes on kept nodes, and it drops vanished keyed blocks instead of rebuilding their siblings. `openIntro` handles a minigame load failure. A win is ignored once you've left the game, and its timer is cancelled. `pointercancel` releases every held button. The contextmenu guard is inline in the head.
- Checked headless at 1333×690: every screen renders, all 22 minigames load and complete, and saves round-trip.

## Memory

- 2026-10-01: Integrated from the Claude Design handoff (see Integration notes).
- 2026-10-01: Added a dedicated Music volume slider to Settings/pause (separate music bus); Sound slider now covers SFX only.
- 2026-10-01: Performance pass. Measured headless in the drive view: draw calls ~1,500 → ~420, triangles ~2.76M → ~0.57M, download ~31 MB → ~13 MB.
  - Characters merged into one mesh each (`mergeSkinned`), so ~980 character draw calls became ~40.
  - Town instancing split into 96 m tiles (`TILE` in `city-3d-v2.js`) so frustum culling works. Traffic and spinning parts stay as one mesh each.
  - Driving draw distance is 480 m (Fast mode 260 m), with the fog pulled in to hide the edge (`applyRange`). The overview, story and map keep the full view.
  - Animals are hidden and not animated beyond the draw distance.
  - Shadow map 4096 → 2048.
  - Fast mode: a third of the pedestrians, shown only within 80 m, plus the shorter draw distance (shadows already off, pixel ratio 1).
  - Packs slimmed by `tools/slim-packs.mjs`: 174 of 391 models dropped, and heavy meshes pre-simplified. The runtime meshoptimizer CDN import is gone.
- 2026-10-02: Recorded SFX added (engine, siren, horn, water, fire, waypoint reached/started, achievement); see Sound.
- 2026-10-02: More SFX (bump, reverse, steam, meow, chick, oink, boing, rotors, drone, boat, fail, radio, tap) and three story camera shots.
- 2026-10-03: All sound effects halved relative to the music (`SFX_LEVEL = 0.5` on the sfx master in `js/sfx.js`).
- 2026-10-03: Chief Ember's story portrait is now a live 3D character (Cowboy_Male, head and shoulders).
- 2026-10-03: Default levels are now Music 80, Sound 20 (players with a save keep their own settings).
