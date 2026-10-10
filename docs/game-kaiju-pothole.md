# Kaiju Pothole

Steer a hungry pothole round town and swallow the lot. Ages 8–10, touch-first (drag anywhere; arrows/WASD on desktop).

## Modes
- **Gobble Rush:** 2:00 to grow. Stars for reaching size 3, 5 and 6.
- **Rival Holes:** 3 bots (Rusty, Gloopy, Big Nibbles). A hole at least 1.2× bigger can gobble a smaller one, which loses 30% and respawns 3s later. Easy/Normal/Hard sets bot speed and sight. Stars by finishing place.
- **Shopping List:** 12 levels.
  - 1–6: town lists.
  - 7–9: **Hazard Sweep**, find Ember Bay's fire hazards spread around town.
  - 10–12: **House Call**, a cut-away room is the arena and the hole is toy-sized. Each visit moves on to another room, so all 9 rooms get used.
- **Zen:** no clock. The "% of town eaten" meter fills, and it finishes at 98%. Stars: 15% ★, 40% ★★, 70% ★★★. The Zen card shows the stars and the best % (`zenBest`, per player). A Zen town is saved as you go (`zenRun`: the town seed, the indices of every eaten object, the hole's size, spot, score and counts) every 5 s, on pause and when the page goes away, so a reload or restart carries on in the same town; the card then says how much is gone and has a **New town** chip (tap twice) to throw it away. Finishing, or Restart from the pause menu, also starts a fresh town.

Hole shapes are won by eating things across every game (a long-running list per shape) or by finishing a Shopping level. Two players (Ezra, Caleb), each with their own stars, wins, shapes and Sounds/Music levels.

## Saves
IndexedDB through `js/arcade-store.js` (an unmodified copy of `games/dragonseed/js/store.js`): `ArcadeStore("kaiju-pothole")`, one item `calebArcadeData:kaiju-pothole` holding `{ v, user, users: { ezra, caleb }, perf, gen, sid }`. Every write is stamped with the tab's `sid` and a rising `gen` and goes through `{ guard: true }`, so an old tab left open can't overwrite the one being played; the losing tab stops saving and shows a toast once.

## Files
- `index.html`: UI, styles, arcade favicon (`../../favicon.svg`), `data-arcade-back` snippet, three@0.170.0 + Rapier import map.
- `js/main.js`: boot, menus, HUD, guarded save, audio unlock on activating gestures.
- `js/game.js`: renderer, camera, input, holes, bots, modes, scoring.
- `js/world.js`: town and room builders, BatchedMesh swallowables (with LOD levels), teeter/fall states.
- `js/lod.js`: level of detail and distance culling for the town and the critters (see Performance).
- `js/physics.js`: Rapier bodies around the holes.
- `js/plan.js`, `js/skins.js`: town plan, hole shapes.
- `js/hole.js`: ground-shader discard for the opening, wall and rim, rim skins.
- `js/critters.js`: people and animals. They wander and dodge, and are never swallowed.
- `js/assets.js`: loads and bakes the shared packs.
- `js/sfx.js`: every sound and the four music tracks, with the `MIX` / `MUSIC_MIX` tweak tables.
- `sfx/*.webm`: Kaiju Pothole's own 8 sounds (Opus mono 64k, silence trimmed, levelled to about −18 dB mean). Originals in `research/sounds/`.
- `music/kaiju-{gobble,battle,shopping,zen}.webm`: the four themes, full length (Opus 48k, silence trimmed so the loop is tight, no level cut: the Music slider sets the level). Originals in `research/music/`.

## Sound
- Nothing plays until a gesture that grants activation (`pointerup` / `click` / `touchend` / `keydown`); `sfx.unlock()` retries the music on every one until it is actually playing (the touch-screen "two taps" bug).
- Music: one track at a time, cross-fading. Gobble on the menus and in Gobble Rush, Battle in Rivals, Shopping in Shopping List, Zen in Zen. Pauses with the tab.
- Effects decode once into Web Audio buffers on the first tap and play through the Sounds bus. Own sounds: UI tap / enter, three gulps by size, size-up, list item, level done. Borrowed from Ember Bay (`../_shared/audio/sfx/`): fail, bump, and horn / siren / rotors / drone / boat / steam / water as vehicles and hazards drop in; oink / meow / chick (boing for the rest) when animals dodge.
- **Levels:** each sound = file × `GAIN` (base mix) × `MIX[sound]` × Sounds slider; each track = `MUSIC_MIX[track]` × Music slider. `MIX` and `MUSIC_MIX` are all 1 and exist so single sounds can be turned up or down without touching anything else.

## Shared assets
Every model comes from `games/_shared/assets/` and the borrowed sounds from `games/_shared/audio/sfx/`: Ember Bay's converted library, moved there so both games use one copy (Ember Bay reads it from `../_shared/` too). LowPoly City, SimplePoly City, the FBX building pack, Rgsdev and cartoon cars, PolyPack boats, helicopter, drone, the Blaze kit, 15 hazards, 9 rooms, 23 people, 10 animals.

The loader accepts `.glb.gz` and falls back to `.glb` holding the same gzip bytes (the form the Claude Design prototype stored them in).

## How swallowing works
Real rigid-body physics ([Rapier](https://rapier.rs) 0.14, `@dimforge/rapier3d-compat`, loaded from jsDelivr) is switched on only around the holes (`js/physics.js`).
- **The collar:** each hole carries a ring of floor colliders with a round opening, plus shaft walls below it, and the collar moves with the hole.
- **Near the hole:** anything that could fit becomes a dynamic box body sitting on the collar, so it genuinely tips, slides and drops through the opening. Anything too big becomes a fixed obstacle, so it just sits there.
- **Visibility:** the ground and room-floor materials discard fragments inside any hole, so a falling object can only be seen through the opening.
- **Back off:** bodies that come to rest away from every hole switch back to static.
- **Down the shaft:** things already falling move with the hole, and gravity scales with the hole size so big swallows don't play in slow motion.
- **Limits:** about 90 bodies at most. Hole area grows by half the area of what it eats, capped at r = 18.

## Performance and draw order
- three **0.170.0**, newer than Ember Bay's pinned 0.160, because the game needs `BatchedMesh.addInstance`.
- Every distinct material is one `BatchedMesh` with per-object frustum culling, which brings the whole town to roughly 20 draw calls. Untextured models get their colour baked into vertex colours and share a single material. Textured ones share a material per texture.
- Camera near/far and fog scale with the hole, so the depth buffer stays tight and there's no z-fighting. The ground and the flat pads use polygon offset.
- X-ray: anything standing between the camera and your hole is screen-doored out, so tall buildings never hide it.
- Pixel ratio starts at ≤ 2 (1 in performance mode) and adapts to the frame time. Shadows use PCF at 1024 on touch devices and 2048 elsewhere, snapped to texels.
- House Call takes a top-down height map of the room, so toys and hazards are only placed on clear floor and pets walk round the furniture.
- `?shots` turns on `preserveDrawingBuffer` for screenshot tests. It's off otherwise.
- **LOD (`js/lod.js`).** The LowPoly City props are anything but: a 2 m bin (`props_44`) is 10.5k triangles, the cars 5–6k, the people 5–9k. The whole town was ~2.9M triangles and the title flyover drew ~1.9M a frame (colour + shadow pass) with ~90 people at 5–9k each. Now:
  - At load, every part over 300 triangles gets two simplified copies (≈30% and ≈10%) from meshoptimizer's simplifier (`meshoptimizer@0.22.0` from jsDelivr; if it can't load the game runs at full detail). The packs are faceted, so the mesh is welded by position, simplified, and each new face gets a flat normal plus the palette UV / vertex colour of the original face it matches best; skin weights carry over per vertex. Real image textures (not the palette) are left alone.
  - The LODs sit in the same BatchedMesh; every 150 ms each object picks a level from distance ÷ radius (`near` 20, `far` 60, stretched up to ×3 when zoomed in — camera height 24 m → ×3, 200 m → ×1) with `setGeometryIdAt`, and anything under ~2.5 px (`cull` 300, ground pads excepted) is hidden. Objects in the hole's grip are always full detail. Performance mode switches down sooner (×0.6).
  - Shadows zoomed right out (camera > 130 m from the hole, back on under 110 m): town objects are batched per material *and* building/small, so only the building batches (house, shop, tower, factory, station, stadium) keep casting; small things, trees, people and animals stop, and the sun's shadow map drops from 1024/2048 to 512. At full size that takes ~450k triangles out of the shadow pass. Tunables `shadowFarD` / `shadowNearD` / `shadowFarMap` on `window.__lod`.
  - People and animals swap to their simplified mesh past 30× their radius, stop casting shadows past 45× and are hidden past 140× (their animation stops too).
  - Result: title flyover 1.9M → ~0.3M triangles and 145 → ~25 draws; early Gobble ~90k → ~60k. ~400 ms of simplification at load. Tunables live on `window.__lod`.

## Memory
- 2026-10-06: Moved in from the Claude Design prototype (`research/Hole game concept themes/`). Ember Bay's `assets/` and `audio/sfx/` moved to `games/_shared/` and Ember Bay repointed; `build-index` and `docs-writeback` skip `games/_*` folders.
- 2026-10-06: Music and own sounds encoded from `research/` (they were loading the raw `.m4a` / `.mp3` from `research/`, which isn't deployed). `MIX` / `MUSIC_MIX` multipliers added at 1.
- 2026-10-06: Audio unlock was `pointerdown` once, which a touch screen refuses, so the menu music never started on a tablet until a mode began. Now unlocks on activating gestures and retries.
- 2026-10-06: Saves now guarded against a second tab (`sid` / `gen`).
- 2026-10-06: The dev server redirects `.../kaiju-pothole/index.html` to `.../kaiju-pothole` (no slash), which breaks every relative path; open `.../kaiju-pothole/` locally. GitHub Pages is unaffected.
- 2026-10-06: LOD was too coarse zoomed in (same switch distances at every zoom). The distances now stretch with the camera (×3 at the smallest hole, ×1 fully zoomed out); triangles drawn stay ~50k small → ~360k at max, as before.
- 2026-10-06: Some town buildings could never be eaten, even by a full-size hole (a square 24 m tower has a half-diagonal of 16.8 m, size 6 starts at r 16.2, and the fit test is half-diagonal ≤ r × 1.02; factories went up to 22.7). `World.add` now scales any eatable town object down to a half-diagonal of 16 m (`FIT_MAX`).
- 2026-10-06: Horn `MIX` 0.7 (Dan).
- 2026-10-06: Buildings-only, low-res (512) shadows when zoomed right out (Dan). Note `renderer.info.render.triangles` doesn't reflect the shadow pass for BatchedMesh, so it won't show the saving.
- 2026-10-06: The zoom stretch made the title flyover draw ~670k triangles (its camera is only 62 m up, so it counted as zoomed in). The flyover now uses the plain distances (`lodPass(..., wide)`): ~260k.
- 2026-10-06: Zen stars now 15 / 40 / 70% (were 50 / 75 / 98%). Gobble, Shopping and Zen cards show their score / stars in a centred bottom band matching Rivals' difficulty strip.
- 2026-10-06: Picking a hole shape while scrolled down made the list jump (the whole grid was rebuilt on every pick). It now restyles the cards in place (`markSkin`).
- 2026-10-10: Zen progress survives a reload (`zenRun` in the save; `Game.snapshot()` / `restore()`, same seed → same `world.objs` order). New town chip on the Zen card.
- 2026-10-10: Towns weren't reproducible from a seed: the model queues were built in pack-load order and shuffled with a random sort comparator. Now id-ordered and shuffled with a seeded Fisher–Yates (needed for the Zen save).
