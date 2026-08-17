# Sea Glass

A cozy 3D physics beachcombing game (Three.js + cannon-es). Comb a section of
beach — layers of pebbles resting on hard sand — by swiping to push stones aside
and uncover **sea glass** and **ceramic shards** hidden beneath, then tap to
collect. Travel between beaches with different compositions, chase colour-rarity
and ceramic goals, view your finds as glass tumbling in physics bottles, and
unlock new beaches, bottles, and beachcombing moves. Zen, no fail state.
Touch-first, for Caleb (7) and Ezra.

## Features
- **Physics pebble layer (cannon-es):** dynamic pebbles on a static sand floor
  inside a bounded pit. **Swipe** gently scatters nearby stones; pebbles sleep
  when settled. **Tap** collects a piece (raycast). Body count is capped (~≤240
  pebbles + finds + statics) and the pile re-parks after a swipe.
- **6 beaches**, each a distinct composition — stone size band (fine shingle →
  coarse) and colour mix, which glass colours appear + their rarity weighting,
  and a ceramic set. Some beaches are mostly small pebbles. Beaches unlock via
  milestones; a beach-select/travel screen shows locked/unlocked.
- **Comb further:** advance to a fresh section of the same beach (re-varied
  layout + new buried pieces) on a **30-second cooldown**.
- **Glass colour rarity** (common → uncommon → rare); the spawn **% is shown in
  the Collection** rarity view (not on the combing screen).
- **Ceramics:** each beach hides **10 ceramic shards**; collecting all 10
  **assembles a unique reconstructed ceramic item** (unlock + assemble animation).
  Completed ceramics are displayed in the Collection.
- **Collection view (bottle physics):** finds tumble inside glass jars as small
  pieces that **settle and rest** (proper damping/sleep — no jitter), moving only
  when tilted/shaken or **poured** (mix into one jar vs keep separate by colour).
  Shows per-colour counts, total weight, rarities, and completed ceramics. No
  floating per-jar labels. (The screen/nav term is consistently "Collection".)
- **Special moves (cooldown-gated):** **Radar** reveals where buried glass is;
  **Torch/Shine** makes sea glass glint so it stands out among the pebbles.
- **Milestones/unlocks:** ~15 milestones (colour counts, colour sets, total
  weight, rarities, completed ceramics) unlock beaches, bottles, and moves —
  including **"Pank!"** (10 pink glass → a thin jar). A scrollable milestone list
  sits above the fixed bottom buttons.
- **Zoom:** wheel + touch-pinch (limited range; no on-screen zoom buttons).
- **PBR look:** MeshStandardMaterial + a generated environment map for wet-stone
  and frosted-glass sheen. Bright beach daylight; menus/HUD on the arcade brand.
- **Player select (Caleb / Ezra)** with independent progress under
  `calebArcadeData.seaGlass.<player>`. Web Audio ambience + SFX (waves, gulls,
  collect chime, pebble rustle), fully procedural.

## File structure
Multi-file 3D game (accepted arcade 3D pattern; three + cannon-es via importmap
CDN), 15 ES modules under `js/`:
- `index.html` — shell, importmap (jsdelivr `three@0.161.0` + `cannon-es@0.20.0`),
  HUD DOM, fixed bottom-button bar, back button.
- `js/main.js` — boot, screen routing, game loop, input, cooldowns.
- `js/physics.js` — cannon-es world setup (gravity, sleep, solver, statics).
- `js/pebbles.js` — instanced pebble field, layering, body/mesh sync, sleep.
- `js/scene-beach.js` — beach scene, sand pit, water/tide, camera fit.
- `js/env.js` — PBR environment map + procedural shingle-bed floor texture.
- `js/finds.js` — buries sea glass + ceramic shards by depth; exposure control.
- `js/dig.js` — swipe-to-scatter interaction (impulse to nearby bodies).
- `js/data.js` — the 6 beaches (stone size bands, colour mixes, rarity weights,
  ceramic sets), glass colour + rarity definitions, milestone/unlock table.
- `js/moves.js` — Radar + Torch special moves + cooldowns.
- `js/assemble.js` — 10-shard → ceramic-item assembly + animation.
- `js/collection.js` — bottle-physics collection view, mix/separate/pour, totals.
- `js/unlocks.js` — milestone checks + unlock grants.
- `js/hud.js` — screen chrome, HUD, session-finds tally, cooldown rings.
- `js/storage.js` — `calebArcadeData.seaGlass.<player>`.

## Key design decisions
- **three + cannon-es via importmap CDN (jsdelivr)** is the only network use — the
  documented 3D exception (same as `game-librarian`).
- **Performance-first physics:** ~240-body cap, `allowSleep`, instanced pebble
  meshes, capped pixelRatio (~1.65, auto-degrading), and the collection world is
  not stepped once every piece has parked — buys ~2× the frame budget there.
- **Comb cooldown is an absolute deadline** (`combReadyAt`) armed by the one path
  that builds a fresh section, so nothing can silently re-arm it (the earlier bug
  was a stored remaining-seconds counter that `startBeach()` zeroed).
- **Collection settling:** floor/wall clamps only bounce genuine impacts and
  otherwise absorb, plus a settle pass parks calm bodies — this fixed a jitter
  where a naive velocity-reflect clamp let gravity keep pumping the resting heap.
- Fixed bottom-button bar on every screen; scrollable content scrolls above it.
  No sound button, no change-player button (removed per user).

## Memory
- Built via the `new-game` recipe (concept given; scout skipped). Reviewer **PASS**
  — all hard constraints green, all phase-2/3 refinements verified, ~120 fps with
  the body cap honoured, only the two CDN requests, persistence confirmed.
- Delivered across three phases: V1 (physics dig, beaches, rarity, ceramics,
  bottle collection, unlocks, radar/torch), phase 2 (13 refinements: more
  variation, zoom, better tide, fixed bottom buttons, remove sound/change-player,
  "Collection" naming, 30s comb cooldown, tripled achievements, ceramics in
  collection, no jar labels, 6 beaches, "Pank!" milestone), phase 3 (8 corrections:
  wheel/pinch-only zoom, static bottom-sheet, comb-cooldown gating fix, rarity %
  moved to Collection only, 2-line `cname`, smaller + settling collection glass,
  smaller pebbles + small-pebble beach variety).
- User note on terminology: "PDR materials" in the brief was read as **PBR**
  (physically-based rendering).
- Reviewer-flagged fixes applied in a bounded pass (back-button/HUD overlap on
  <500px, most finds now genuinely buried so swiping matters, nicer water,
  tighter portrait camera, locked-card text, root-card copy/icon, "1 piece").
