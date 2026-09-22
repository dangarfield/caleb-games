# Deja Vroom

(Folder and doc are named `deja-vroom`; the user-facing title is **Déjà Vroom**,
subtitle "every driver in town, all at once".)

A **time-rewind driving** game in the mould of *Does Not Commute* — the mechanics
reverse-engineered from the genre, everything else original. Each reel is one
town at one moment. You drive one car from its start to its exit line, and then
you drive the next one — while the first is still out there, repeating exactly
what you just did. By the fifteenth run the streets are full of your own
mistakes, and the only traffic you have to dodge is yourself.

Built around a mapper (`mapper.html`) that lays out the city, the routes and the
handling, and exports both to `data/`. The game reads those files, so it runs
anywhere; when the mapper's IndexedDB has something in it that wins instead, and
the dev strip says which source is live.

**Landscape, tablet first.** Designed and profiled at 1333×690.

## Features

- **Nine reels, 120-odd runs.** Suburbs, city, beach, countryside, port, city
  centre, factories, the hospital run and an encore. Each reel has its own
  camera rectangle; the chase camera never shows anything above or below it.
- **Two views.** Macro (the whole reel, rect edges exactly on the viewport
  edges) and micro (a fixed chase offset that never rotates), with a one-second
  tween each way.
- **Two driving models, switchable in the mapper.** *Arcade* is a hand-written
  integrator lifted from the drift game — the nose turns where you point and the
  velocity chases it, and the gap between them is the drift. *Simulated* is the
  original cannon.js `RaycastVehicle`. They share no numbers; the Config tab
  keeps a separate table for each.
- **20 drivers with names, personalities and a line each per location** —
  136 of them, first person, in `data/story.json`. The four karts are the Oo
  brothers and they only appear on the water.
- **A world you can fall off.** Water is a hole. Ramps have exactly one
  entrance — the low end tapers, every other face is a wall. Bridges carry a
  road over a road and you can drive under or over. A level flagged "on water"
  turns that inside out: the water is the road and dry land is the hole.
- **See-through buildings.** Anything tall between the camera and the car drops
  to 5% opacity while it is in the way.
- **The tape remembers where you got to.** One slot per driver, holding the
  reel, the run, the clock so far and that reel's banked traffic — written the
  moment a run lands, so the worst a shut lid costs is the run you were on. The
  title screen's big button reads *Roll the tape* on a fresh save and *Pick up
  the tape* after that, naming the reel and run underneath. A reel you have a
  time on can be started again straight from the score board, and doing that
  while another reel is part way through asks first.
- **A handicap, not a fail state.** Three free crashes a run, then 0.1 off the
  top speed each time, floored, resettable from the badge by the pause button.
  The clock counts up: the scene's time is the score.
- **70s neon UI.** Chicle and Pacifico, a sunset behind every overlay, and a
  synthesised soundtrack of engine, bumps and tape rewind over the *Deja Vroom*
  track.

## Files

| Path | What it is |
|------|------------|
| `index.html` | The game. Single file, three.js + cannon.js from `lib/`. |
| `mapper.html` | The authoring tool: Capture, Build, City, Routes, Config. Writes IndexedDB, exports to `data/`. |
| `data/deja-vroom-city.json` | 2206 placements — the whole town. |
| `data/deja-vroom-routes.json` | 9 reels, their cameras, every run's car, start and exit. |
| `data/story.json` | Premise, locations, drivers, and the per-location line for each driver. |
| `models/` | The 121 Kenney GLBs the game actually uses, cut out of the 87 MB of kits in `research/` (gitignored), plus each kit's `Textures/colormap.png`. |
| `assets/deja-vroom.mp3` | The soundtrack, MP3 96k. The one every browser can play. Masters are in `research/`. |
| `assets/drivers/*.png` | The 20 driver portraits, 256x256. Prompts in `research/portrait-prompts/`. |
| `js/arcade-store.js` | Copied from dragonseed, unchanged. Best times and the resume slot per player, in IndexedDB. |
| `data/deja-vroom-config.json` | The handling tables, exported from the Config tab. |
| `lib/` | three.js r128, GLTFLoader, ConvexHull, cannon.js 0.6.2. |

Driver portraits live at `assets/drivers/<model>.png`; without one the card
draws the initial on a warm tile.

## Memory

- **2026-09-22 — carrying on where you left off.** The resume slot holds one
  reel and no more: its index, the run, the clock, and the runs already banked
  as traffic. Earlier reels' traffic is deliberately dropped — it is 320 KB per
  reel at the worst (17 runs of 12 s at 30 Hz) and nothing ever replays it
  again. That size is also why it lives in the arcade's IndexedDB rather than
  localStorage, which is one 5 MB shelf shared by every game here. It is written
  at a run boundary rather than every frame, which is both cheap and right: you
  cannot quit your way out of a crash. Finishing reel 9 is the one thing that
  clears it.

- **2026-09-21 — the soundtrack would not play.** It shipped as AAC in an
  `.m4a`, which Safari and Chrome play and a *plain Chromium build refuses
  outright* — `MEDIA_ERR_SRC_NOT_SUPPORTED`, "the element has no supported
  sources", because the open build carries no AAC decoder. The `<audio>` now
  offers MP3 first and the AAC second. Anything shipped as audio in this arcade
  wants an MP3 alongside it.
- **2026-09-21 — which handling table wins.** The game loads
  `data/deja-vroom-config.json` first and then lets the mapper's IndexedDB copy
  override it field by field, so a machine with no mapper still gets Dan's
  tuning and a machine with one drives with whatever he changed a minute ago.
  The debug line names both sources.

- **2026-09-21 — the frame.** `world.step()` was being called every frame in
  arcade mode for a result nobody read: a broadphase pass over 968 bodies, 4.3 ms
  of a 16.6 ms frame. The arcade model moves the car itself and the replay cars
  are kinematic, so it is simply not called. Ray queries went from walking all
  2206 city bodies to a 4-unit grid: `driveArcade` 2.21 ms → 0.35 ms.
- **2026-09-21 — fonts.** Chicle and Pacifico come from Google Fonts over the
  network; both sandboxes here block `fonts.gstatic.com`, so they could not be
  self-hosted. If the cabinet ever plays offline, drop the two TTFs into
  `assets/fonts/` and add `@font-face` rules — the CSS already falls back to
  real cursive faces rather than a sans.
- **2026-09-20 — the exit line.** The goal sits on the top edge of the camera
  rectangle by design, so the car is already past the top of the frame when it
  crosses. The off-screen crash now exempts a corridor around the gate;
  without it, crossing the line was a coin toss.
- **2026-09-20 — surfaces.** The surface map keeps one kind per cell (the
  highest), which meant a bridge or a road over the river deleted the water
  underneath it. Water is recorded separately over its full footprint, so a boat
  floats under bridges; 764 of 2437 river cells were affected.
