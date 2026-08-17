# Stone Skip

A cute arcade **stone-skipping** game on a large, detailed Three.js lake. Pick a
flat rock off the beach and skip it across the water with a timing-based throw,
chasing skip counts, completing achievements, and spending Skip Points on a big
tree of unlocks (special stones, new shore spots, day/night themes, arm strength,
cosmetics, and fish). Built for tablets (touch-first), for Caleb (7) and Ezra.

## Features
- **Large stylised lake scene** (procedural, low-poly/toon): beaches, piers/
  jetties, small edge banks, reeds in the shallows (instanced), long open-water
  patches, an island, and a bridge. Animated water, gradient sky, ambient
  birds/water SFX. **12 throw spots** around the shore (6 base + 6 unlockable).
- **3-beat timed throw** (the skill mechanic):
  1. Tap to start → slow-motion, the wind-up draws back. The **power gauge has a
     white centre sweet-spot marker** — tap near the centre for the best power.
  2. A timed tap sets **power**.
  3. A timed **release flick** — the *timing* sets the vertical launch angle
     (a gold FLAT band with a **centre-peaked sweet spot**: dead-centre = perfect,
     steep roll-off to the edges) and the *flick direction* sets horizontal aim.
     The flick is a real drawn **finger-trail**; a full 100% vertical flick is a
     long swipe of **~75% of screen height** (`flickRangeFor(h)=clamp(h*0.75,
     200,1100)`), and it only launches at full distance or on release.
  Mistakes degrade the throw (fewer skips / off-line), never hard-fail — aim
  authority is deliberately weak so a bad flick bends the shot rather than beaching it.
- **Pick-your-rock (manual only, no auto-pick):** rocks scattered on the beach in
  several shapes with visible quality; flatter/discs skip far more than round/
  jagged pebbles. Scatter is spaced by screen-angle so rocks don't overlap across
  portrait/landscape/phone.
- **Special stones as timed beach spawns:** once unlocked, a special stone appears
  toward the outside of the scatter on a ~1-minute cooldown (persisted as epoch-ms;
  card shows a READY badge or a countdown) — you catch it when it shows up rather
  than holding it permanently. Each has a distinct effect: Golden Skipper (lots of
  extra skips), Feather (floaty, ~⅓ more long low skips), Heavy Slate (half the
  skips but huge distance), Ancient Rune (more skips AND distance), Rainbow Pebble
  (rainbow trail, skips like a good flat stone).
- **Arcade skip physics:** skip count is decided at first contact from angle +
  power + spin + rock flatness, then bounces decay geometrically. Per-bounce
  skip-count popups + skip/plunk SFX.
- **Throw-quality breakdown** (bottom-right, minimal, auto-fades after ~5s or on
  next pickup): a % per factor — Stone quality, Power tap, Flick timing, Flick-up
  distance, Straightness.
- **48 Achievements** (the original 12 target challenges merged in — one unified
  "Achievements" concept, no separate challenges): skill milestones, trick/target
  shots (buoys, under the bridge, land on the island, thread reeds, lily-pad,
  pier-post bounce), rock mastery, volume, and cheeky ones (plunk 10, a fish leaps
  and swallows your stone) — 36 award Skip Points. Plus **12 zero-point "Collection"
  badges** (one per throw spot unlocked, one per day/night theme, and all-trails /
  all-splashes / all-hats) that are trophies only, so buying unlocks never pays for
  more unlocks. Counting achievements show live progress (e.g. "247 / 500").
- **Skip Points economy + shop:** points earned from play (skips/distance) and
  from achievement unlocks; spent in a shop on **24 unlocks across 6 types** —
  special stones, new throw spots, cosmetics (skip trails, splash colours, hats),
  day/night themes (sunset, misty, starry night), **arm strength ×2** (raises the
  power ceiling AND speeds the gauges), and **See The Fish** (fish become visible
  in the lake).
- **Fish system:** shoals swim under the surface once See-The-Fish is unlocked;
  occasionally one leaps and can swallow an in-flight stone (a rare, delightful
  achievement trigger).
- **Best skip count + best distance** tracked; **Caleb/Ezra profiles** with fully
  independent progress saved under `data.stoneSkip.<player>` (points, owned
  unlocks, achievements, equipped cosmetics, theme, special-stone cooldown, stats).
- Canvas-2D HUD pill + canvas result card layered over the WebGL view, on the
  arcade brand; Web Audio SFX (no audio files — noise buffers + oscillators).

## File structure
Multi-file 3D game (the accepted arcade 3D pattern; Three.js via importmap CDN),
22 ES modules:
- `index.html` — shell, importmap (jsdelivr `three@0.161.0`), HUD DOM, back button.
- `js/main.js` — boot, game loop, state routing, input, screen panels (shop,
  achievements, player select).
- `js/throw-control.js` — the 3-beat timing state machine (power tap + white
  centre, release timing→angle, flick→aim, `flickRangeFor`). Pure/testable.
- `js/skip-physics.js` — arcade skip simulation (pure/testable).
- `js/rocks.js` — scattered-rock spawning (screen-angle spacing), shapes/quality,
  special-stone beach spawns, pick selection.
- `js/stones.js` — special-stone definitions + skip behaviour.
- `js/progression.js` — Skip Points economy, 24 unlocks, 48 achievements (36
  point-paying + 12 zero-point collection badges), cooldowns.
- `js/targets.js` — achievement/target definitions + completion checks (was
  `challenges.js`; challenges are now merged into Achievements). Pure/testable.
- `js/themes.js` — day/night lighting themes (sunset/misty/starry).
- `js/camera-rig.js` — spot/travel/follow/result/**overview** camera modes,
  yaw-limited look, aim retention + re-centre. The Map button (🗺️, replaced the
  old mute — sound is always on) tweens to the overview: a top-down lake view
  highlighting all 12 spots and marking the current one.
- `js/hand.js` — first-person hand/arm, held stone, hat cosmetics.
- `js/hud.js` — canvas HUD pill, gauges (power + release with sweet-spot cores),
  flick trail + aim guide, "FLICK NOW" cue, throw-quality panel, result card.
- `js/audio.js` — Web Audio SFX + ambience. `js/fx.js` — splashes/ripples/popups/trails.
- `js/storage.js` — `calebArcadeData.stoneSkip.<player>`. `js/util.js` — helpers.
- `js/world/` — `terrain.js`, `heightfield.js`, `water.js`, `sky.js`,
  `layout.js` (12 spots incl. generated stone shelves, flags, achievement props),
  `props.js` (instanced reeds/trees/lily-pads/planks, throw-lane culling),
  `fish.js` (shoals + leap-and-swallow).

## Key design decisions
- **Three.js via importmap CDN (jsdelivr)** is the only network use — the
  documented 3D exception (same as `game-librarian` / `game-bomb-squad`).
- **Forgiving-but-skilful:** weak aim authority + centre-peaked (not flat) release
  sweet spot + a big 75%-screen flick range. A great throw is precise; a sloppy
  one still skips, never hard-fails — non-frustrating for a 7-year-old.
- **Special stones are caught, not owned:** the 1-minute cooldown beach-spawn model
  keeps them special without a permanent picker, and rewards showing up to play.
- **Progression via Skip Points** earned from both play and achievements, so kids
  always make progress toward the 24 unlocks (a long chase, not a grind wall).
- **Scatter spacing measured in screen-angle**, not metres, so one rule keeps
  rocks non-overlapping and in-front across all viewports and all 12 spots.
- Pure logic modules (`throw-control`, `skip-physics`, `targets`, `layout`,
  `heightfield`) import under bare node for headless testing.

## Memory
- Built via the `new-game` recipe (concept given; scout skipped). Phase-1 reviewer
  **PASS**; then a large phase-2 progression build plus phases 3–5 of user
  refinements (all with per-round headless verification).
- Phase-1 fixes: rocks spawned BEHIND the player at 2 spots; oversized pick proxies
  selecting the wrong rock; HUD pill underlapping the back button; invisible arm
  sleeve; aim reset every throw; challenge text/flag mismatch; desktop Space firing
  while walking; `west`-spot reeds reading as swamp.
- Phase-2 blocker (caught by reviewer): the icon rail vanished for returning players
  because `showPanel('player')` hid `#sideBtns` and the tutorial-skip path never
  restored it → fixed in `hideOverlay()`. Also HUD beat-3 collisions fixed.
- Phase-3/4 blocker: pickup stones spawned OUTSIDE the portrait FOV at Rocky Point
  and Waterfall Inlet — root cause a **sign error in the scatter cone** (`layout.js`
  defines the spot's right vector as `rx=-fz, rz=fx`, so positive `da` turned aim
  the wrong way and the rail-side guard narrowed the wrong half). Fixed by making
  the asymmetry explicit and standing `rocky`/`falls`/`cliff` stones on a generated
  stone shelf; verified tappable in-front at all 12 spots.
- Phase-4/5 tuning: throw-quality panel auto-fades (5s / next pickup); flick range
  scaled to viewport height then raised to 75% (`clamp(h*0.75,200,1100)`), with
  `FLICK_MAX` bumped 0.55s→1.0s so a genuine long swipe isn't auto-fired mid-stroke;
  `roundHero` achievement lowered to 6 skips (arm-0 ceiling for that rock) and
  Golden Skipper `budgetMul` raised so the 25-skip achievement is reachable.
- Perf: ~56–94 draw calls, ~296k tris, pixelRatio capped 1.75 with adaptive
  downscale to 0.85; props instanced (≈3k reeds, ≈2.9k trees).
