# Game spec: Kaiju Pothole (v2, built on the Ember Bay asset library)

> Status: DRAFT v2, awaiting approval. v1 described a Canvas 2D game with procedural art. v2 moves to three.js and reuses Ember Bay's converted asset packs, which were built from `ember-bay/research/`. The raw research files (FBX / zip / rar / glTF) are not loaded directly. Ember Bay has already converted them to `.glb.gz` + `index.json`, and those are what this game uses.

## Concept
- **Pitch:** A hungry pothole wakes up under Ember Bay's town. Swallow cones, then cars, then the skyline.
- **Genre:** Swallow / grow, 3D with a tilted top-down camera. Original game code. Shared assets come from the arcade's own Ember Bay library.
- **Audience:** 8–10. Touch-first, and also playable with keyboard and mouse.
- **Living things:** people and animals are in the town, but they are **never swallowed**. When the hole gets close they hop out of the way using their `Jump` / `Run` clips, and animals play their sound. Nothing alive goes in the hole.

## Conventions (hard constraints)
- Back button to `../../index.html` using the `data-arcade-back` snippet. Copy it verbatim from Ember Bay's `index.html`.
- **Single-file exception:** this game can't be one file because it loads the shared GLB packs, the same way Ember Bay does. It follows Ember Bay's layout: `index.html` + `js/` + an import map pinning three@0.160.0 from jsDelivr.
- **Asset location (decide):** **(A)** promote `games/ember-bay/assets` + `audio/sfx` to `games/_shared/` and repoint both games, or **(B)** load from `../ember-bay/assets/` read-only. Recommended: A, so neither game depends on the other's folder. Copying the assets into this game would duplicate tens of MB and is ruled out.
- Persistence through `ArcadeStore("kaiju-pothole")` (`js/arcade-store.js`), not raw localStorage.
- Every hit target is at least 48px. Pause and suspend audio on `visibilitychange`. Audio starts only after the first tap.
- `card.json` uses the build date as `added`. Never hand-edit `index.html`.

## Asset reuse map (everything in the library has a role)
| Pack (loader in `city-assets.js`) | Source | Role in Kaiju Pothole |
|---|---|---|
| `city-props` + `extra-props` | LowPoly City, SimplePoly City | Tier 1–2 swallowables: hydrants, barrels, cones, benches, bus stops, street lights, billboards |
| `city-vehicles` + `extra-vehicles` + `extra-vehicles2` | LowPoly City, Rgsdev (CC0), Cartoon cars, PolyPack boats | Tier 3–4: all ~20 Rgsdev cars (taxi, police, ambulance, monster truck, bus, truck + trailer…). Boats sit in the harbour |
| `extra-air` | Lowpoly helicopter, Drone LVL2, air balloons | Tier 4–5 flyers parked on helipads and fields. Balloons drift low and can be eaten when they dip |
| `city-nature` | LowPoly City | Tier 2–4: bushes, trees, rocks |
| `city-buildings` + `extra-buildings` | LowPoly City, SimplePoly City, FBX building pack | Tier 5–6: houses, shops (bakery, pizza, coffee…), school, bank, sky towers, stadium. The **Fire Station** can't be eaten (Ember Bay's home base) |
| `city-ground` + `city-templates.json` | LowPoly City | Roads, pavements and courts make the ground. Its tiles are cut when the hole passes over |
| `extra-kit` | Blaze kit (made for Ember Bay) | Edge props and blockers that mark the map boundary |
| `hazards/` (15) | made for Ember Bay | **Hazard Sweep** Shopping-List levels: gobble every fire hazard in town (chip pan, frayed cable, iron left on…). The fire-safety tie-in with Ember Bay |
| `interiors/` (9 rooms) | rooms FBX packs | **House Call** levels: a cut-away room is the arena. It's a single baked mesh, so it can't be eaten itself. The hole shrinks to mini scale and eats hazards plus small props placed inside |
| `people/` (23 street chars) | Quaternius Ultimate Animated Characters | Pedestrians from `city-peds.js` walk the pavements and jump clear of the hole, and cheer on the results screen |
| `animals/` (10) | Quaternius farm animals, cat, chicken | Farm-edge field and back gardens. They hop away when the hole is near (oink / meow / chick SFX) |
| `audio/sfx/*.mp3` (21) | Ember Bay | boing = teeter, bump = blocked by a bigger thing, achievement = tier up, waypoint-reached = list item done, horn = car falls in, fail = eaten by a rival, tap = UI, siren / engine / rotors / boat = loop while vehicles of that type fall in |
| `ember-bay-theme.webm` | Ember Bay | Not reused, because it is Ember Bay's identity. New music is open (see Open) |
| `city-palette-1024.jpg` | LowPoly City | Shared palette texture. All LowPoly meshes use one material, which keeps draw calls cheap |

**Tiers are computed, not hand-picked.** Each index entry's `max(w, d)` footprint becomes its tier, so every model in every pack is placed and can be swallowed with no hand curation. Thresholds (metres): T1 ≤ 1.2 · T2 ≤ 2.5 · T3 ≤ 5 · T4 ≤ 9 · T5 ≤ 16 · T6 > 16.

## Controls
- **Touch:** drag anywhere. A floating joystick ring appears under the thumb.
- **Desktop:** arrows / WASD, or mouse-follow while the button is held.
- Speed scales gently with hole radius.

## Core rules
- The world is a 12×12-block town generated by `city-gen-v3.js`, rings by tier: park and centre → streets → harbour and outskirts. Boundary is a river plus kit blockers.
- **Swallow:** an object falls in when its footprint radius is ≤ 0.85·r and its centre is inside the hole. Objects between 0.85r and 1.1r over the rim tilt and wobble (boing).
- **Hole rendering:** a stencil cut-out in the ground. Falling objects tilt toward the centre and sink under the ground plane. No physics engine; each object steps idle → teeter → fall → gone.
- **Growth:** mass = footprint area. The radius grows with sqrt(mass), tuned so a skilled 2-minute run reaches T6. Each tier up plays achievement, a shockwave ring and a camera pull-back.
- **Perf:** InstancedMesh per model ID. People and animals are limited to 40 on screen, from the nearest pool. DPR is capped at 2. 60fps target on a mid-range tablet.

## Modes
1. **Gobble Rush:** 2:00. Stars for reaching T3 / T5 / T6.
2. **Rival Holes:** 2:00 with 3 bots (Rusty, Gloopy, Big Nibbles). A hole can swallow another if it's 1.2× bigger. The eaten hole loses 30% of its mass and respawns after 3s (fail SFX). Nobody is eliminated. Ranked by size at the end, 3 / 2 / 1 stars. Easy / Normal / Hard sets bot speed and chase range.
3. **Shopping List:** 12 levels:
   - 1–6 town lists (e.g. 6 hydrants, 2 taxis, 1 helicopter)
   - 7–9 **Hazard Sweep**: find every hazard spread around town
   - 10–12 **House Call**: room arenas built from interiors + hazards

   Stars depend on time left.
4. **Zen:** no timer and no bots. A "% of town eaten" meter runs, with confetti at 100%.

## Progression
- Stars unlock 8 rim skins at 3 / 6 / 10 / 15 / 20 / 26 / 32 / 40 stars: Hazard Stripes, Lava, Daisy, Checker, Neon, Bubblegum, Galaxy, Gold.
- Save: `ArcadeStore("kaiju-pothole")` → `{ stars:{mode:{level:n}}, skins:[], skin, mute, difficulty }`.

## Screens
Title (3D town flyover with an idle hole, Play, modes, skins, mute, back) → Mode / level select → HUD (timer, size meter with tier icons, list or rank panel, pause) → Results (stars, best, cheering pedestrians, Replay / Next / Menu). UI is drawn in the DOM over the canvas, in Bungee + Nunito.

## Home-page card
- **Name:** Kaiju Pothole
- **Blurb:** Steer a hungry pothole round Ember Bay and swallow the whole town.
- **Icon:** 🕳️
- **Title font:** Bungee (Google Fonts), the same as the game's title screen
- **Palette:** bg `#FFC93C` · ink `#1E1B2E` · accent `#FF6B4A` · secondary `#3CB4E6` · tertiary `#7ED957`
- **added:** build date (YYYY-MM-DD), set when `card.json` is written

## Acceptance
- All 4 modes are playable start to finish on touch and on keyboard.
- Every model ID in the city, extra, hazard and interior indexes appears in at least one map (checked by a dev-only count).
- People and animals are never swallowed. The back button works. No console errors.
- Saves persist through ArcadeStore. Audio is muted until the first tap.

## Open (needs a human call)
1. Asset location: A (`games/_shared/`) or B (load from `../ember-bay/`).
2. Licences: Rgsdev is confirmed CC0, and Ember Bay credits Quaternius as CC0. No licence file was found for LowPoly City, SimplePoly City, the FBX building pack, Cartoon cars, PolyPack boats, the helicopter, the drone, the cat or the room packs. These are already in Ember Bay, but confirm they're fine to reuse in a second game.
3. Music: none for now, a short generated loop, or a new track supplied by you.
