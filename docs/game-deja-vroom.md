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
anywhere. The **debug switch** in the pause menu is what swaps that over: on, the
city, the routes and the handling come from the mapper's own IndexedDB, so the
tab just saved next door is the one being driven; off, it is the shipped files
and nothing a browser happens to be holding can change what the boys play. The
dev strip names whichever is live.

**Landscape, tablet first.** Designed and profiled at 1333×690.

## Features

- **Nine reels, 121 runs.** Suburbs, city, beach, countryside, port, city
  centre, factories and the hospital run are the eight you play; the ninth is
  the ending. Each reel has its own camera rectangle; the chase camera never
  shows anything above or below it.
- **Two views.** Macro (the whole reel, rect edges exactly on the viewport
  edges) and micro (a fixed chase offset that never rotates), with a one-second
  tween each way.
- **Two driving models, switchable in the mapper.** *Arcade* is a hand-written
  integrator lifted from the drift game — the nose turns where you point and the
  velocity chases it, and the gap between them is the drift. *Simulated* is the
  original cannon.js `RaycastVehicle`. They share no numbers; the Config tab
  keeps a separate table for each.
- **A story with a spine.** 20 drivers with names, personalities and a line
  each per location — 136 of them, first person, in `data/story.json`, plus
  Margo's 18. The four karts are the Oo brothers and only appear on the water.
- **Margo Plimm's day.** Every reel opens and closes with the sedan, because the
  sedan is how you get from one place to the next, so Margo gets two lines a
  reel and they run in sequence across the whole tape: one surprise party, a
  list of fourteen jobs and eight places to do them in. Her closing line sets
  up the next reel and her opening line there picks the thread up. They live in
  `story.arc` as `{in, out}` pairs, keyed by location.
- **A title beat per reel.** A reel announces itself before the first driver
  arrives — place, what sort of place, and the location's own line. Nothing in
  the story moves itself on: every beat is a press, and the press that clears
  the place card is not the one that sets the car off.
- **An ending, not a ninth stage.** The last reel is one sedan run, no clock and
  nothing scored: Margo pulls into her own street, the ending card says how it
  turned out, the replay loops behind it, and a press goes back to the arcade.
- **Portraits.** All 20 are in: `assets/drivers/<model>.png`, 256×256, drawn
  into a 150px tile on the card, with the driver's initial as the fallback if a
  file ever goes missing. The prompts that made them are in
  `assets/drivers/PROMPTS.md`, and as JSON for an agent in `portraits.json`.
- **A world you can fall off.** Water is a hole. Ramps have exactly one
  entrance — the low end tapers, every other face is a wall. Bridges carry a
  road over a road and you can drive under or over. A level flagged "on water"
  turns that inside out: the water is the road and dry land is the hole.
- **See-through buildings.** Three steps, and no height test anywhere: anything
  that STANDS UP is its own object (the flat ground you drive on merges, because
  a merged mesh cannot fade one piece of itself); each frame the ones within 2
  units of the camera-to-car line are picked out by a plain distance check; a ray
  from the camera to the car decides which of those are actually in the way, and
  they drop to 5% opacity for a quarter of a second. Judging it by how tall a
  thing measured got the hospital reel wrong twice over — its 347 trees measured
  0.77 against a 0.8 line, and its solar panels are flat plates standing a whole
  unit in the air. What a piece measures says nothing about whether it is between
  you and the camera; only the ray knows that. It runs in performance mode too:
  that mode drops the shadows and the pixel ratio, which is where the cost is,
  and a tablet that needs it is exactly the one you do not want losing the car
  behind a tree.
- **An encore between reels.** The last run of a reel does not cut straight to
  the next place. The camera holds the macro view and plays every run of the
  reel back at once — all of them away from their start lines together, the
  whole weave you built one run at a time — then the tape winds the lot back and
  it goes again. Nothing times it out; the tape stops when somebody presses.
  The card says "<place> complete" with the reel's time, which is also
  where each reel's high score is banked. `ENCORE.play` in `index.html` sets how
  hard the forward leg is fast-forwarded.
- **A handicap, not a fail state.** 3 free crashes a run, then 0.1 off the top
  speed each time, floored. The power badge by the pause button shows what is
  left: click it when it is down to hand the speed straight back, or click it at
  full to LOCK it, after which crashes cost nothing at all. The badge counts the
  handicap only - easy mode is a choice, not damage, so it still reads 100. The
  clock counts up: the reel's time is the score.
- **Three difficulties.** Normal, Easy and Easiest. Easy is four fifths of the
  top speed; Easiest is that plus FOUR TIMES the lateral drag, which is the one
  knob that decides how long a slide lasts — the sedan's slide halves in 0.083s
  instead of 0.233s, so the car goes where it is pointed. It is a big multiplier
  on purpose: most of the fleet is already glued down at 0.06. The four karts
  are governed by `roadGrip` (0.005) rather than drag, so this knob will not
  tame the boats however far it is pushed.
- **The switches are per driver.** Difficulty, performance mode, music, sound,
  the debug readout and the power lock are stored per player under
  `dejavroom-opt`, so Caleb's choices are not Ezra's. A settings file from
  before that change became the starting point for both of them, and an old
  `easy: true` migrates to Easy.
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
| `data/deja-vroom-config.json` | The handling: which model, the global settings, and the arcade table for all 21 vehicles. |
| `data/story.json` | Premise, locations, the 20 drivers, a line each per location, and `arc` — Margo's two lines a reel. |
| `models/` | The 121 Kenney GLBs the game actually uses, cut out of the 87 MB of kits in `research/` (gitignored), plus each kit's `Textures/colormap.png`. |
| `js/arcade-store.js` | The arcade's IndexedDB wrapper; high scores live under `calebArcadeData:dejavroom`. |
| `assets/deja-vroom.mp3` | The soundtrack, and the only audio file: every browser decodes MP3, including the Chromium builds with no AAC decoder. Masters are in `research/`. |
| `assets/drivers/` | The 20 portraits at 256×256, plus `PROMPTS.md` and `portraits.json` — the Flux prompts that made them. |
| `lib/` | three.js r128, GLTFLoader, ConvexHull, cannon.js 0.6.2. |

The type (Chicle and Pacifico) comes from Google Fonts over the network —
offline, the UI falls back to a serif.

## Memory

- **2026-09-21 — the arcade car moved twice.** `driveArcade` writes
  `body.position` itself AND hands cannon a velocity; while `world.step()` was
  still being called, cannon integrated that velocity a second time, so every
  arcade car travelled at exactly double its own speed reading and the whole
  21-car table was tuned against that. Dropping `world.step` for the perf win
  removed the doubling too, which halved the game. The calibration now lives in
  one constant: `ARC.carPx` is 18, not the drift game's 36. ×3.33 converts
  px/frame to car lengths a second, and the crash tests carry doubled arcade
  shares (`CRASH_ARM`, `STALL_LIM`) so their absolute thresholds are unchanged.
- **2026-09-21 — one press, one beat.** A single touch arrives twice: the
  `pointerdown`, then the compatibility `mousedown` the browser synthesises
  behind it unless that event is cancelled. One tap was eating two story beats.
  The touch path now calls `preventDefault()` and `begin()` holds a latch that
  is released on the way up.
- **2026-09-21 — timers and frame rate.** The frame delta is clamped at 0.1s,
  so anything counted in frame deltas takes 36 frames to reach 3.6 seconds — at
  5fps that is seven seconds, at 2fps eighteen. The title card's countdown was
  removed in the end (every beat is a press), but the lesson stands for anything
  timed: use a wall-clock deadline, not accumulated deltas.
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
