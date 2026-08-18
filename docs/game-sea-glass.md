# Sea Glass

A cozy 3D physics beachcombing game (Three.js, with its own physics — see below).
Comb a section of
beach — layers of pebbles resting on hard sand — by swiping to push stones aside
and uncover **sea glass** and **ceramic shards** hidden beneath, then tap to
collect. Travel between beaches with different compositions, chase colour-rarity
and ceramic goals, view your finds as glass tumbling in physics bottles, and
unlock new beaches, bottles, and beachcombing moves. Zen, no fail state.
Touch-first, for Caleb (7) and Ezra.

## Features
- **Physics pebble layer, on one of TWO backends:** ~501 loose pebbles (167 × 3
  instanced meshes) resting in a bounded pit. **Swipe** gently scatters nearby
  stones; the pile re-parks after a swipe and costs nothing at rest. **Tap**
  collects a piece (raycast). The quality profile picks the engine:
  **High = Rapier** rigid bodies (real contacts, friction, rolling; wasm via
  jsdelivr), **Low = `js/lphys.js`**, the game's own position-based sphere
  relaxation (no wasm to download, no contact manifolds). Both wear the same
  interface, so the beach and the collection jars are written once — see
  "Key design decisions".
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
- **Quality profile (Low / High)** for low-spec devices — auto-detected
  (biased to Low on weak hardware) with a manual **Quality** toggle on the
  beach-select bar that flips live and persists (`calebArcadeData.seaGlass.quality`,
  device-wide). The profile also selects the **physics engine**: High → Rapier,
  Low → lphys. Low: Lambert pebbles (glass stays PBR), pixelRatio ~1.15, shadows
  off, 45Hz / 1 relaxation pass, a smaller awake set (40 vs 96 stones may move at
  once), a swipe wakes far fewer stones, the section build is sliced across frames
  behind a "Raking the beach…" tip, and the collection uses fewer bodies. The
  pebble COUNT is the same (~501) on both: a parked stone is not simulated, hashed
  or uploaded, so density is no longer a quality knob. Flipping the toggle when the
  engine changes rebuilds the world and re-rakes the section (the same work as
  "comb further"); `?q=low|high` and `?engine=lphys|rapier` pin either choice.
- **Player select (Caleb / Ezra)** with independent progress under
  `calebArcadeData.seaGlass.<player>`. Web Audio ambience + SFX (waves, gulls,
  collect chime, pebble rustle), fully procedural.

## File structure
Multi-file 3D game (accepted arcade 3D pattern; three + Rapier via importmap CDN),
20 ES modules under `js/`:
- `index.html` — shell, importmap (jsdelivr `three@0.161.0` + `three/addons/` +
  `@dimforge/rapier3d-compat@0.20.0`), HUD DOM, fixed bottom-button bar, back button.
- `js/main.js` — boot (awaits the physics backend behind the loading screen),
  screen routing, game loop, input, cooldowns, the quality/engine toggle.
- `js/phys.js` — the physics backend SELECTOR: `initEngine`, `activeEngine`,
  `makeWorld` (returns an lphys or a Rapier world with the same surface), `Body`.
- `js/lphys.js` — the Low backend: the game's own position-based sphere relaxation
  (SoA typed arrays, awake set, spatial-hash separation, consumer clamp function).
- `js/rphys.js` — the High backend: Rapier rigid bodies behind lphys's surface
  (mirror/shadow arrays, awake set implemented as FIXED-body parking).
- `js/rapier.js` — lazy, failure-tolerant Rapier loader (`await init()`, falls back
  to lphys); dynamic import, so Low never downloads the wasm.
- `js/physics.js` — the beach world: builds it on the active backend, holds the
  pebbles AND the finds, and owns the containment (static boxes on Rapier, the
  position clamp on lphys).
- `js/pebbles.js` — instanced pebble field, layering, body/mesh sync, sleep.
- `js/scene-beach.js` — beach scene, sand pit, water/tide, camera fit.
- `js/env.js` — PBR environment map + procedural shingle-bed floor texture.
- `js/finds.js` — buries sea glass + ceramic shards by depth; exposure control.
- `js/dig.js` — swipe-to-scatter interaction (impulse to nearby bodies).
- `js/data.js` — the 6 beaches (stone size bands, colour mixes, rarity weights,
  ceramic sets), glass colour + rarity definitions, milestone/unlock table.
- `js/moves.js` — Radar + Torch special moves + cooldowns.
- `js/assemble.js` — 10-shard → ceramic-item assembly + animation.
- `js/collection.js` — bottle-physics collection view (its own small world, on the
  same backend as the beach), mix/separate/pour, totals.
- `js/unlocks.js` — milestone checks + unlock grants.
- `js/hud.js` — screen chrome, HUD, session-finds tally, cooldown rings.
- `js/quality.js` — Low/High quality profiles (including which physics ENGINE each
  one runs), weak-device auto-detect, `?q=` / `?engine=` overrides, persistence,
  live setter.
- `js/storage.js` — `calebArcadeData.seaGlass.<player>` + device-wide settings
  (`readSetting`/`writeSetting`, e.g. `seaGlass.quality`).

## Key design decisions
- **three (+ Rapier on High) via importmap CDN (jsdelivr)** is the only network use
  — the documented 3D exception (same as `game-librarian`). Rapier is imported
  dynamically, so the Low profile never fetches the wasm at all, and if it cannot be
  fetched the game falls back to lphys instead of failing to boot.
- **ONE physics interface, two implementations.** Both backends expose the same SoA
  typed arrays (`px/py/pz`, `qx..qw`, `vx/vy/vz`, `moved`, `alive`, `tag`, …), the
  same awake-set bookkeeping and the same methods, so `pebbles.js`, `finds.js` and
  `collection.js` contain no engine branches — the only thing anyone asks is the
  CAPABILITY flag `world.hardWalls` (does this backend have static colliders?).
- **The awake set is the cost model on both backends.** A stone at rest is not
  integrated, not hashed, and its instance matrix is not re-uploaded; `maxAwake`
  caps how many may move at once (96 High / 40 Low). That is why ~501 pebbles are
  affordable on a tablet, and why the profile no longer thins the pile.
- **Rapier gotcha, worth remembering:** never call `rb.sleep()` on a body in a dense
  pile — it keeps being integrated without being resolved and sinks through the
  floor. Parking a stone instead makes it a **FIXED** body (out of every island, but
  still in the broad phase, so awake stones rest on it), and its collider is what
  holds the pile up.
- **Containment follows the backend.** lphys has no statics: the pit floor and rim
  are a position clamp applied to the awake set, which in a position-based scheme IS
  the collision response (velocity is derived from the position delta afterwards).
  Rapier gets real floor/rim boxes, and its clamp shrinks to a "flung out of the
  world" rescue — a clamp that pushed positions every step would keep re-waking the
  bodies it touched and the pile would never be allowed to sleep.
- **Performance-first rendering:** instanced pebble meshes, capped pixelRatio
  (~1.65, auto-degrading), and neither world is stepped once everything has parked.
- **Comb cooldown is an absolute deadline** (`combReadyAt`) armed by the one path
  that builds a fresh section, so nothing can silently re-arm it (the earlier bug
  was a stored remaining-seconds counter that `startBeach()` zeroed).
- **Collection settling:** floor/wall clamps only bounce genuine impacts and
  otherwise absorb, plus a settle pass parks calm bodies — this fixed a jitter
  where a naive velocity-reflect clamp let gravity keep pumping the resting heap.
- Fixed bottom-button bar on every screen; scrollable content scrolls above it.
  No sound button, no change-player button (removed per user).

## Memory
- **Rapier/High crash on comb/rebuild (fixed):** never destroy a body or collider
  in a LIVE Rapier world. A `setBodyType`'d object destroyed mid-life panics
  `world.step()` (`RuntimeError: unreachable`); the wasm is `panic=abort`, so
  wasm-bindgen's borrow flags latch and every later call throws "recursive use of
  an object detected which would lead to unsafe aliasing in rust" — the world is
  permanently dead (rAF keeps running, but nothing moves and taps do nothing).
  Symptom: collect everything → Comb further → input dead. Fix: `rphys.js` pools
  bodies + colliders and STOWS retired ones on a far shelf (never destroys in a
  live world); only `dispose()` frees the whole world at once, after which `dead`
  makes every method a no-op. Plus a `_stepping` re-entrancy guard + `_deferred`
  queue for removes arriving mid-step, and createWorld/rebuild swap the new world
  in before disposing the old.
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
- **Dual physics backend** (user ask): Rapier on High, lphys on Low, ~501 pebbles on
  both. Reconstructed `js/rapier.js` + `js/rphys.js` (they had been deleted by the
  lphys rewrite and were not in git) and added `js/phys.js` as the selector, so
  there is now exactly ONE physics interface with two implementations behind it.
  Notes worth keeping:
  * A parked Rapier body is made **FIXED**, never `rb.sleep()`ed. Sleeping a body in
    a dense pile makes it integrate without being resolved and it sinks through the
    floor — this was the original reason Rapier was dropped.
  * Game code writes straight into the SoA arrays (a shake sets `vx[i]`, a find
    nudges `position.y`, the clamps move positions). The Rapier backend keeps shadow
    copies and pushes any difference in before the step; `place`/`setQuat`/`setEuler`
    push immediately because they are allowed on a PARKED body, which the pre-step
    sync (awake set only) would never see; and un-parking reseeds the body from the
    mirror, so a divergence always self-heals.
  * `moved[i]` is set only where the transform actually changed, which is what keeps
    a settling pile from re-uploading instance matrices every frame on either engine.
  * The soft position clamp is lphys-only. On Rapier it would fight the solver every
    step and the pile would never sleep, so the pit gets real floor/rim boxes sized
    TIGHTER than the clamp's insets (floor top exactly y=0, rim faces at ±PIT.hw/hd,
    jar floors 6mm above the jar clamp) and the clamp shrinks to an escape rescue.
  * Known behavioural differences, unverified at runtime (no QA pass was run for this
    change — the user asked for code only): lphys's neighbour-wake (`wakePenFrac`)
    has no Rapier equivalent, since a FIXED neighbour simply holds; `world.passes` is
    inert on Rapier; and the spawn-overlap bake has not been watched on Rapier.
