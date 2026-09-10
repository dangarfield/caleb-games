---
color: green
isContextNode: false
---
# Paperboy

3D newspaper round built on a Blender-modelled street: ride the bike down the
pavement, throw papers into subscribers' boxes, dodge the traffic and the dogs,
then take the jump course at the end of the week. Rebuilt from scratch in
Sept 2026 on the `paper-level.glb` set; the original single-file April prototype
is kept at `research/paperboy-prototype-2026-04.html`.

## Features
- Two riders — Caleb and Ezra — each with a saved furthest day and high score
- Seven days, MONDAY to SUNDAY, generated once so every replay of a day matches:
  40 obstacles on Monday and seven more each day to 82 on Sunday
- 17 obstacle types with procedural models and subtle wheel/leg animation:
  dogs, cars, trikes, pedestrians, jackhammer men, RC cars, runaway tyres,
  lawnmowers, wheelbarrows, unicyclists, stereos and paper pickups
- Scoring: window 10, mailbox 250 (the flap swings), paper pickup 50 (refills
  the bag), running man / jackhammer 25, target 200 (its box is stretched
  upwards so a lofted throw counts), hay bale 25 (it topples over)
- 5 lives for the whole week, shown as the boy's caps; a crash offers TRY AGAIN
  with two seconds of gold-flash invulnerability
- 8 papers, two rows of four; each throw spends one and an empty bag flashes
  NO PAPERS!
- Kerbs block sideways and can only be crossed at a dropped kerb; a kerb face
  taken side-on is a crash. Ramps launch him; the rivers are fatal unless he
  takes a bridge or jumps them
- Cheering crowd in the bleachers at the finish with confetti; the mailboxes
  show the current day
- Sound: a looping theme (`audio/theme.mp3`) plus seventeen synthesised effects
  — throw, glass, mailbox chime, target flourish, bale thump, a caught
  pedestrian, pickup, jump, landing, crash, empty bag, get-ready/go, day done,
  game over, respawn, button clicks. There is no mute control: the theme
  starts by itself on the first touch or key press and stays on
- Keyboard or on-screen pads (steer, gears, throw); GET READY / GO intro,
  pause and quit panels, all in the boy's own colours and the Anta typeface
- Enemy planner (E) for placing and routing obstacles, with import/export

## Technical
- Three.js r170 via importmap, ES modules under `src/`; `index.html` is the shell
  and `paperboy-research.html` redirects to it
- `paper-level.opt.glb` (1.5MB) is the packed level: meshopt-compressed with
  quantised attributes and a resized backdrop texture, made by
  `tools/pack-level.mjs` from the 23.5MB `paper-level.glb`, which is kept as the
  source and used as a fallback
- Name-driven collision: `ROLE_RULES` maps object names to roles, colliders are
  bucketed along X, and papers test a separate stretched box
- Runtime patches for gaps in the .blend (`src/patches.js`): the road slab is
  extended over the last stretch of section 2, the junction paint is cloned to
  the fourth crossing, and the scale dummy is hidden. Each one probes first and
  retires when the model is fixed
- Detail level (`src/quality.js`): pixel ratio, shadow map size and cadence,
  crowd density and confetti volume; drops itself to Low if frames average over
  22ms and remembers the choice
- Crowd and confetti are InstancedMesh; every obstacle model merges its static
  boxes into one vertex-coloured mesh on a shared material. The finish costs
  ~35 draw calls, the street 28-43
- Sound in `src/audio.js`: one AudioContext opened on the first gesture, effects
  built from oscillators and filtered noise per `knowledge/audio-patterns.md`
  (no sample files), and the theme as a streamed `<audio>` element rather than a
  decoded buffer — two minutes of stereo would be tens of megabytes in memory.
  The source `research/paperboy-full.mp3` (2.9MB, 195kbps, with cover art) is
  re-encoded to 96kbps stereo at `audio/theme.mp3` (1.4MB)
- Both `index.html` files retire any service worker controlling the origin.
  Nothing in the arcade registers one, so a worker here is always foreign —
  left over from another project sharing port 3000 — and it breaks audio by
  trying to `cache.put()` the 206 Partial Content responses the browser asks
  for when it streams the theme
- Saves live in `calebArcadeData:paperboy` in localStorage (plan, planner view,
  rider profiles, detail level) — not yet moved to `arcade-store.js`

## Memory
- 2026-09-09: rebuilt as the shipping game at `games/paperboy/index.html`.
  Fixed along the way: Blender euler order for the ortho camera ('ZYX', not
  'XYZ'); animation stutter from crank tracks that overshoot 360deg per cycle;
  road markings classified as kerbs once slope replaced absolute rise; a
  restart replaying the clamped fall pose; the mailbox flap and hay bale pivots
  (loose boxes whose geometry is baked at the world origin, so a pivot group
  alone flung them across the map); and the level's missing tarmac from
  x 174.875 to 221.25.
- Known gaps: the revealed target sign is modelled as 250 but a target scores
  200; day progression on crossing the finish is a placeholder until the seven
  days are properly defined.

[[games-index]]
