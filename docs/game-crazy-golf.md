# crazy-golf

**Crazy Golf!** is 3D mini-golf for Caleb and Ezra. Someone shook the toy box and the
Golden Putter went flying into eight wild worlds. Putt through Jungle Ruins, Pirate
Cove, Space Station, the Haunted House, Candy Kingdom, Ice Palace, Robot Factory and Pyramid Desert, grab gems, earn stars to open the next
world, and see who brings the Golden Putter home first.

Built from the Claude Design handoff in `games/crazy-golf/research/Crazy Golf prototype build/`
(`Design Spec.md` is the spec; `Crazy Golf.dc.html` is the clickable prototype;
`World Looks.dc.html`, `Diorama.dc.html` and `Icon.dc.html` give the art direction and the icon set).
The course is **Three.js**, with a **Flat (orthographic) / 3D (perspective) view switch** in Pause → Settings (saved; Flat is the default), dressed as a real seaside-style crazy-golf course. All UI and the HUD are **HTML** on top,
following the prototype screen by screen, on a 1333×690 stage scaled to fit. It's
touch-first and landscape only. Caleb and Ezra each have their own save.

## Features

- **Screens (all 13 from the design):** Home (a big logo centred in the left half with Shop · Trophies · Guide centred under it; Solo / Caleb vs Ezra,
  player cards), Course map (8 islands in two rows,
  locked shake and toast), Hole select (3×3 tiles, a thumbnail, best scores), Hole intro
  (a fly-in camera, hint, hazards, and this boy's best on the hole), Play HUD, Pause
  (camera speed and view), Hole result (Eagle/Birdie/Par/Bogey/Nice try/Picked up, plus the
  full-screen Hole in One), Scorecard, Pass-and-play handoff, Hazard book, Shop,
  Trophies.
- **Putting:** start a drag within 130px of the ball and pull back. Power is the pull
  length ÷ 200px, and anything under 12% cancels. While you pull you see a rubber band,
  a finger ring, a 270° power arc (lime → sun → orange → coral, Gentle/Medium/Strong!/MAX!),
  and path dots from a real physics preview (7 dots). A putter model
  sits behind the ball and swings when you let go.
- **Controls intro:** the first time each hole is played in a session, the HUD
  pieces (score pill, pause, camera) pop in one by one with labels, following the spec's timeline, then a ghost finger
  shows the drag. Touching the ball skips it, and replays skip it.
- **72 holes**, 9 per world, par 2–5. Worlds 1–4 hazards: windmill (the sails block the tunnel),
  loop-the-loop (needs speed ≥ 5.4 or the ball rolls back), moving ramp (a plank
  sliding across a chasm or water gap), portal (pink in, blue out, with a ground arrow
  for the exit direction), bumper, water / lava (the ball goes back, no penalty), swinging
  vines, stone idol (mouth shortcut), cannon (flies you to another island),
  low-gravity pad, and wobbly ghosts (they spook the ball off-line). Worlds 5–8 add 12 more: Candy Kingdom has
  sugar-rush boost pads (they fire the ball the way the arrows point), sticky toffee (heavy drag) and chocolate rivers (ball goes back);
  Ice Palace has slippery ice (almost no friction) and sliding penguins that knock the ball; Robot Factory has conveyor
  belts (they carry a resting ball too), spinning arms and crusher gates that rise and fall across the path; Pyramid Desert
  has sand traps (heavy drag), quicksand (ball goes back), rolling boulders and a sphinx whose mouth is a shortcut tunnel.
- **Rules (from the spec):** stroke cap is par + 4, and a pickup still earns 1 star.
  Stars: 3 under par (including a hole in one), 2 at par, 1 otherwise. Gems: the ones you pick up
  (3 per hole), plus 1 per star, plus 10 for a hole in one. Worlds open at 15/35/60/85/115/145/175 stars.
  There are no special balls (Dan asked for them to go).
- **No difficulty choice** (Dan asked for it to go). Everything plays and counts as Normal: 7 aim dots, a 0.46 cup and normal
  hazard speed. The Easy/Hard code paths are still in `physics.js` and `state.js` but nothing selects them. On load, any Easy
  or Hard hole bests from older saves are folded into Normal (the lower score wins).
- **Pass and play:** both boys play every hole, and whoever was picked first tees off first.
  The handoff screen shows between every turn. Lowest total wins, and ties show "All square!".
  Restart is hidden in pass-and-play.
- **Cameras:** Overhead is the default and frames the whole hole below the HUD. "Behind" is a
  zoomed follow-cam that turns so the cup is up-screen. Camera speed has 5 steps.
- **Shop:** 8 balls, 8 putters and 8 flags, painted onto the 3D ball, putter and flag.
  Items are bought with gems, per boy, and equipped straight away.
- **Look (v2, Dan: "a more realistic scene"; the new worlds follow the same style):** PBR materials with ACES tone mapping, a room-environment
  reflection map and soft 2048 shadows. The carpet has pile, and the cup is cut into it with a white
  liner. Fairways are raised slabs with capped rails per world: stone kerbs in the Jungle, timber
  planks in Pirate, metal panels with a neon strip in Space, and brick in Haunted. They sit in
  landscaping rather than on a toy plinth: striped lawn and gravel paths, sandy beaches in a sea,
  a station deck, or an overgrown graveyard. Procedural scenery (trees, shrubs, flower beds,
  lamps, palms, crates, dead trees, fences) fills the space round each hole, and a wooden hole sign
  stands by the tee. The hazards are remodelled: a tapered windmill with lattice sails
  (lighthouse, satellite or haunted variants), a steel loop, an iron cannon on a timber carriage,
  a carved stone idol, rock-edged ponds and lava with animated surfaces, rubber-ringed bumpers,
  and plank bridges. All textures are painted procedurally at load (`js/materials.js`) and
  shared between holes, taking about 0.5s per hole build. The new worlds: Candy Kingdom has wafer-pink rails on gingerbread
  with mint carpet in pink sugar, among lollipops, cupcakes, candy canes and gumdrops; Ice Palace has ice-block rails on blue
  carpet in snow, with snowy pines, snowmen and ice blocks; Robot Factory has yellow steel rails on a concrete floor, with
  drums, gears, pipes and little robots; Pyramid Desert has sandstone rails in sand dunes, with cacti, palms, urns and
  obelisks. Belts and boost pads scroll, the quicksand swirls, chocolate ripples, crusher gates show a red lamp while they
  block, penguins waddle to face where they slide, and boulders roll.
- **Sound:** Web Audio SFX for every hazard, gems, cup, stars and the hole-in-one fanfare.
  There's no mute, per the brief.
- **Music:** one looping theme per world, from Dan, in `audio/crazy-golf-<world-name>.webm` (made from
  `research/<world-name>.m4a`). The Jungle Ruins theme starts on the first tap and plays on the menus (home, map, shop,
  trophies, and the guide opened from the menus). A world's screens (hole select, intro, play, pause, result, scorecard,
  pass-and-play handoff, and the guide opened from pause) play that world's theme. Switching cross-fades over 1.5 s: the old
  tune keeps going until the new one is actually playing, since each file is only fetched when first needed. Worlds whose
  song isn't in `TRACKS` play the Jungle Ruins theme. All 8 worlds have their song.
  **Adding a song:** drop `research/<world-name>.m4a` in, encode it, and add the world id to `TRACKS` in `js/music.js`:
  ```sh
  ffmpeg -i research/<world-name>.m4a -vn -map 0:a:0 -c:a libopus -b:a 48k -vbr on -application audio -ar 48000 \
         audio/crazy-golf-<world-name>.webm
  ```
  As in cutlass-coast, this departs from the house audio rule (`knowledge/audio-patterns.md`): several tunes that
  cross-fade, encoded without the 6dB cut and played at full element volume, because Dan found the house level too quiet
  under the SFX. There's no mute and no slider.
- **Quality governor:** if the first 120 play frames average under 38 fps, shadows go
  off and the pixel ratio drops to 1, once. Add `?hq` to the URL to disable it.

## Files

- `index.html`: the shell (importmap for three@0.170.0 on jsdelivr, Google Fonts
  Fredoka + Nunito, and the back button `../../index.html`).
- `css/style.css`: the design tokens, buttons, panels and keyframes from the Design System.
- `js/main.js`: the controller. Screen flow, rounds, pass-and-play, input (single
  pointer, pointercancel cancels), sim events → SFX/FX/toasts, and the frame loop. It also
  exposes `window.__cg` for desktop debugging.
- `js/physics.js`: the deterministic sim, with no three.js: walls, circles, movers, zones,
  gaps, triggers, scripted moves (loop, portal, idol, cannon, splash, fall, sink),
  surfaces (ice, toffee, sand), push zones (boost, belt), spinners, crusher gates, the cup, and `predict()` for the aim dots.
- `js/holes.js`: the 72 hole definitions (outlines via `path()` corridors, or ellipses
  plus hazards, gems, decoration props and hints).
- `js/geometry.js`: polygon helpers (fillet, corridor, offset, hull and so on).
- `js/materials.js`: procedural PBR textures (carpet, stone, brick, planks, metal, grass, sand,
  gravel, paving, water and lava) plus cached shared materials.
- `js/scene.js`: the Three.js course. It builds a hole, animates the hazards, and runs
  the camera (fit / behind / menu / fly-in), particles, ball/flag/putter skins and snapshots.
- `js/ui.js`: HTML templates for every screen, plus the world sky and fog backdrops.
- `js/data.js`: players, the 8 worlds, the 24 hazards (two Hazard Book pages), shop and result labels (from the prototype).
- `js/state.js`: saves through `ArcadeStore("crazy-golf")` → `calebArcadeData:crazy-golf`
  (IndexedDB), guarded with gen/sid. Stars and bests are per boy (stored under Normal); gems and
  items are per boy.
- `js/icons.js`: the design's icon SVG set plus icons for the new worlds and hazards. `js/audio.js`: the SFX. `js/music.js`: the world themes and cross-fades (`musicFor(worldId)` is called from `go()` in main.js).
- `js/arcade-store.js`: an unmodified copy of `games/dragonseed/js/store.js`.
- `tests/solver.mjs`: `node tests/solver.mjs [world] [hole]` plays every hole headlessly
  with the real physics (a beam search over putts, guided by a walking-distance field)
  and fails if a hole can't be finished within par. `GEOM=1` runs the geometry checks only.

## Design decisions

- Dan asked for an HTML UI + HUD with Three.js ortho for the game, so this breaks
  from the arcade's "canvas HUD pill / canvas game over" rule and its dark palette in the
  same way Pizza Planet does. The look comes from the design system. The arcade back
  button lives in the top-left 140×60, and the design keeps that area clear on every screen.
- Physics is flat 2D on the felt. Loops, cannons, portals, the idol, splashes and falls are
  scripted moves with a fake height for the visuals. That keeps it deterministic, so the
  solver test uses exactly the game's physics.
- Chasms are painted over the felt rather than cut out of it, because a hole touching the
  felt's edge breaks triangulation.
- The home screen shows the Jungle's first hole as a live diorama. Hole select and the scorecard
  show a blurred static render, and the other screens hide the canvas to save the tablet's battery.
- "Best scores" (hole select, map, trophies, scorecard) is each boy's best on every hole of a world added up.
  It shows once he has a score on all 9 holes, however and whenever they were played.

## Memory

- 2026-09-27: built from the Claude Design handoff. The QA review fixed these: a ghost ball
  could stop inside a wall and get trapped; changing difficulty mid-round saved the round
  under the wrong difficulty; pointercancel fired the shot and a second finger could take over
  the aim; particle geometry and per-hole arrays leaked on reloads; restart could be used in
  pass-and-play, and a replay double-counted round gems; the drawn cup didn't match
  the difficulty's cup size; the label on the last pass-and-play result was wrong; the last save
  could be lost on quick exit (now flushed on hide, pagehide and back); the hole-select thumbnail
  used a stale camera; and aiming muted the vine and ghost sounds.
- 2026-09-27: Dan didn't like the toy-diorama assets, wanted a more realistic scene with the ortho
  camera kept, and asked for a bit more power. The course was restyled as a real crazy-golf course
  (see Look), full-power roll went up 25% (MAX_SPEED 10.5 → 12.25, about 18 units), and all 36 holes
  still solve within par (more aces are now possible for a perfect putter). He also asked for an ortho/perspective
  switch, added as Pause → Settings → View (Flat / 3D). Two related fixes: backdrop-filter over the WebGL canvas
  hid the pause and result overlays in software compositing, so the canvas itself is blurred instead;
  and settings taps no longer replay the panel's pop-in animation.
- 2026-09-27: Dan said the windmill angle was wrong. The sails had been skewed diagonally so they'd show in the flat view, and the
  tower was wider than the physics block. Now the sails turn about the path direction, square-on to the tee just in front of
  the tunnel mouth, so a blade pointing down covers the mouth exactly when the physics blocks it. The tower footprint is the
  block (d along the path, w across) and the arched mouths match the gap width. From overhead the sails are seen edge-on.
  Power went up another 25% (MAX_SPEED 12.25 → 14.37, full roll about 22.5 units). All 36 holes still solve within par, and a
  perfect putter can now ace 27 of them. The putter was a mallet (head along the stroke); it's now a blade across the line with the
  shaft rising from the heel.
- 2026-09-27: Dan couldn't see the last changes on his folder: one file had been written stale by the deploy, which is now
  checked by md5 after every commit. He asked for four more worlds with obstacles and for special balls to go. Added Candy
  Kingdom, Ice Palace, Robot Factory and Pyramid Desert (36 more holes, 12 new hazards, see Features), opening at 85/115/145/175
  stars. The map now shows two rows of four islands. Old saves are padded out to 8 worlds on load. The special-ball button,
  the special-ball rules and their Hazard Book page are gone; the intro card now shows the boy's best on the hole. All 72 holes
  solve within par.
- 2026-09-27: Dan asked for the "Rescue the Golden Putter" story blurb to go from the home screen. The left half now has just the
  logo, centred in the space, with the Shop, Trophies and Guide buttons centred along the bottom.
- 2026-09-27: Dan couldn't see best rounds filling in. They only counted a full 9-hole run from hole 1 at one difficulty,
  and picking single holes or quitting early never set one. He asked for it to be the best hole scores added together,
  worded to match: it's now "Best scores", the sum of each hole's best, so it fills in from holes already played.
- 2026-09-27: Dan asked for the difficulty setting to go and for everything to count as medium. The Easy/Normal/Hard
  choice is gone from the home screen, the pause settings, the trophies screen and the scorecard. Everything plays as Normal,
  and old Easy/Hard bests are merged into Normal on load. The home screen's player cards grew to fill the space.
- 2026-09-27: Dan started adding music, one song per world, with cross-fades and Jungle Ruins playing from the start. Encoded and wired
  the three he'd added (Jungle Ruins, Pirate Cove, Space Station); the other worlds use the Jungle Ruins theme until theirs arrive.
- 2026-09-27: the other five songs arrived (Haunted House, Candy Kingdom, Ice Palace, Robot Factory, Pyramid Desert), so every world
  now has its own theme.
- 2026-09-27: Dan asked for no penalty when the ball drops down a gap or into water, lava, chocolate or quicksand. The ball still goes
  back to where it was putted from, but there's no extra stroke; the toast now says "Try again". The Hazard Book text was
  updated, and the solver no longer adds a penalty stroke.
