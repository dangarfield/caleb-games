# Game: Sea Glass (3D physics beachcombing)

Run plan for `/new-game`. Durable state — update at every step.

## Concept (GIVEN — scout skipped)
A cozy 3D physics beachcombing game: search a section of beach (layers of
pebbles/stones over a hard sand base), swipe to gently move pebbles and uncover
**sea glass** (and ceramic shards), tap to collect. Move along a beach to new
sections (same composition), travel to different beaches (different stone/
pebble/glass/ceramic compositions). Collect toward milestone unlocks; view your
collection as glass tumbling in bottles with real physics (mix or keep separate);
unlock special beachcombing moves on cooldowns. Three.js + cannon-es + PBR
materials. Audience: Caleb (7) + Ezra, tablet/touch-first. Zen, no fail state.

## Tech (matches the arcade 3D pattern)
- Three.js + **cannon-es** via `<script type="importmap">` from jsdelivr CDN
  (same as `games/librarian` — the documented 3D exception to "no network").
- **PBR materials** (MeshStandardMaterial + an environment map / simple HDRI-ish
  gradient env) for wet-stone/glass sheen. Keep it performant.
- ES-module `js/` split. Procedural scene; no heavy asset downloads.
- **PERF IS THE #1 RISK.** A physics pebble layer on a tablet must be capped:
  target ~150–250 dynamic bodies max per section, `allowSleep=true`, sleep idle
  pebbles, instanced rendering for pebbles, capped pixelRatio. Physics only needs
  to be lively near the player's touch; let settled pebbles sleep.

## Core loop (CONFIRMED — physics pebble layer, cannon-es)
- A bounded beach section: a few layers of dynamic pebbles/stones resting on a
  STATIC hard sand floor (+ invisible walls so nothing rolls off).
- **Swipe** across the surface = a gentle push/scatter of nearby pebbles (impart
  impulse to bodies under/near the swipe path) to uncover what's beneath. Should
  feel gentle, not explosive.
- **Sea glass + ceramic shards** are hidden among/under the pebbles. **Tap** a
  visible piece of glass/ceramic to collect it (raycast to the body).
- Pebbles sleep when settled for perf; waking on nearby swipes.

## Beaches & sections (CONFIRMED)
- Multiple **beaches**, each with a distinct composition (stone colour/size mix,
  and which glass colours / ceramic types appear + their rarity weighting).
- Within a beach, **move to another section** (same composition, fresh scatter of
  buried pieces) — a "comb further along" button/gesture that regenerates the
  pebble field + hidden pieces.
- Start with a few beaches; more unlock via milestones.

## Sea glass rarity + ceramics (CONFIRMED)
- **Rarity rating on glass colours** — common (white/green/brown) → uncommon
  (blue/aqua) → rare (pink/red/orange/yellow/purple/black). Rarer = worth more,
  appears less often. Show rarity on collect + in the collection.
- **Ceramics:** each beach has **10 collectible ceramic shards** that, once all 10
  are found, **combine into a unique reconstructed ceramic item** (e.g. a pot/
  plate/tile) → triggers an unlock + a satisfying assemble animation. Per-beach
  ceramic set; completing it is a marquee goal.

## Collection view (CONFIRMED — bottle physics)
- View your collection as sea glass tumbling inside glass **bottles/jars** with
  real physics movement (tilt/shake the bottle → the glass shifts). 
- **Mix together or keep separate:** bottles per colour (separate) or pour into a
  mixed bottle. Pouring/mixing is a physics transfer.
- Show totals: per-colour counts, total weight, rarities, completed ceramics.

## Unlocks (CONFIRMED — all in V1)
- Milestone unlocks from: collecting N of a colour, colour-set completion, total
  weight thresholds, rarities found, completed ceramic items. Unlock → new
  beaches, new bottles, and **special moves**.

## Special moves (CONFIRMED — cooldown-gated)
- **Radar** — pulses/pings to reveal where buried glass is (directional/area hint).
- **Torch / shine** — highlights sea glass (makes glass glint/glow so it stands
  out among pebbles) for a short window.
- (Others later, e.g. wave-wash / sieve.) Each has a visible cooldown.

## Screens
- Player select (Caleb / Ezra) — per-player collection + progress in
  `calebArcadeData.seaGlass.<player>`.
- Beach select / travel (locked/unlocked beaches, composition preview).
- Beachcombing view (the physics section: swipe to dig, tap to collect, section
  advance, special-move buttons + cooldowns, HUD of session finds).
- Collection view (bottles + physics, mix/separate, totals, rarity, ceramics).
- Unlocks / milestones screen.

## Conventions (hard constraints — re-state at every hand-off)
- [x] `games/sea-glass/index.html` + `js/` ES modules. three + cannon-es via importmap CDN (the 3D exception).
- [x] Back button href EXACTLY `../../index.html`
- [x] Touch-first: `touch-action:none`, pointer events, large tap targets; viewport `user-scalable=no`
- [x] Arcade palette accents on menus/HUD (`#6c5ce7`, `#ffd32a`); scene can be bright beach daylight; keep menus on-brand
- [x] `calebArcadeData` localStorage, data under `data.seaGlass`; Caleb/Ezra profiles
- [x] Web Audio SFX (waves/gulls ambience, collect chime, dig rustle). three+cannon CDN is the only network use
- [x] PERF: cap dynamic bodies, sleep settled pebbles, instance pebble meshes, cap pixelRatio — must run on a tablet

## PHASE 2 — user refinements (route to builder)
Status: 1–13 all built and verified in a headless tablet-sized browser (portrait +
landscape). Notes: #3's percentages now live ONLY in the Collection (see P3 #17);
#13 "Pank!" was verified with a real pink pick — 9→10 fires the milestone, unlocks
the Thin Jar and persists.

1. **More variation** in the background AND the default (non-moveable) positions
   of the beach, and re-vary each time you comb a new section. KEEP the current
   colours + background variations + the non-movable layout style the user likes;
   just add more variety within that.
2. **Zoom** — allow zooming in a little (pinch on touch / wheel + buttons), limited range.
3. **Show the % chance / rarity probability** of the stones (glass colours) — display
   each colour's spawn % so the player knows the odds.
4. **Better tide animation** — improve the water/tide (nicer wash in/out, foam).
5. **Consistent button positions across ALL screens/menus** — buttons FIXED at the
   BOTTOM in the same place on every screen, so scrollable content (e.g. the
   milestone list) scrolls ABOVE the fixed bottom buttons.
6. **Remove the sound button and the change-player button** entirely.
7. **Rename "jar" → "Collection"** for consistency (name AND the nav link) — one
   consistent term/link.
8. **Comb-further cooldown: 30 seconds** (like a special move; visible cooldown).
9. **Make these achievements 3× harder** (and tweak names accordingly): radar-ping
   use, beachcomber's-shine use, "fifty finds", "heavy pockets", "kilo of sea
   glass", "twenty-five whites". Triple each threshold and rename to match the new
   numbers.
10. **Collected ceramic items visible in the Collection** view (show the assembled
    ceramic pieces you've completed).
11. **Remove per-jar labels** attached to the jars in the collection (the summary +
    list below is fine; just no floating label on each jar).
12. **6 beach locations** (was ~3) — add up to 6 beaches with distinct compositions.

13. **New milestone "Pank!"** — collect 10 pink sea glass ("pank" = beachcomber
    slang for pink) → unlocks a **thin jar** (a new bottle shape for the collection).

## PHASE 3 — user corrections (route to builder)
Status: 14–21 all built and verified. Highlights: the comb cooldown is now an
absolute deadline armed by every path that hands out a fresh section, so nothing
can disarm it early; the collection world is no longer stepped once every piece is
parked (which also doubled the frame rate there); pebble size bands dropped ~20%
with three fine/small beaches and three coarse ones, and the pit floor is painted
with bedded-in shingle so a thinner pile of loose stones still reads as a beach.

14. **No zoom buttons** — mouse wheel + touch pinch only (remove the on-screen ± zoom buttons). (Refines P2#2.)
15. **Sheet hint / bottom-sheet NOT scrollable/draggable** — make it static (don't let it scroll or be dragged).
16. **Comb-further timer does NOT reset to active when the active window ends** —
    fix so the cooldown behaves correctly (once it runs, it counts down; it should
    not flip straight back to ready in a loop). (Refines P2#8 — the 30s cooldown must
    actually gate, not immediately re-arm.)
17. **Don't show the rarity % on the beaches main screen** — remove it from the main
    combing screen (keep it in the collection/rarity view only). (Refines P2#3.)
18. **`cname` span always 2 lines, never overflow** — the colour-name label must
    always render on 2 lines and not overflow; widen the container or wrap as needed.
19. **Sea glass is far too BIG in the Collection** — scale the collected glass pieces
    down substantially in the bottle/collection view.
20. **Collection glass should be PHYSICS-based, settling** — it currently jitters/
    moves around too much instead of resting. Fix so the glass behaves like real
    physics: settles and rests in the jar, only moves when tilted/shaken/poured
    (damping, sleep, sensible mass/restitution — no perpetual jitter).
21. **Pebbles are too big generally** — reduce pebble size overall. AND some beaches
    should be mostly SMALLER pebbles (add small-pebble composition variety across
    the 6 beaches). (Refines beach compositions.)

## PHASE 4 — reviewer fixes (in progress; prior agent died on auth/stall) + new item
Reviewer fixes 1-7: back-button/HUD overlap <500px; bury most finds so swiping
matters; nicer water; tighter portrait camera; locked-card text overlap; root card
copy/icon ("jar"→Collection, 🥣→beachcombing); "1 piece" singular. (Some applied
before the agent died — verify + finish.)
NEW: **When all pieces on a section are collected while the comb-further cooldown
is still counting down, clear the cooldown IMMEDIATELY** so the player can comb a
new section right away. AND make it **clear that everything's been found** (a
"All found! Comb further →" state/message).

STATUS (two builder agents died on API timeouts mid-pass; orchestrator finished):
- Items 1 (HUD `@media (max-width:520px)` reposition off the back button), 2
  (`buryExposedFinds` line-of-sight burial so swiping matters), 5 (lockmsg reserves
  height), 6 (root card: 🐚 + "build your Collection"), 7 ("1 piece") — DONE by the
  agents before they died. Verified in code.
- Item 8 (all-found → clear cooldown + message) — HUD side (`setCombAllFound`,
  "All found — Comb further →" label, `.allfound` class) was built; the main.js
  trigger was NOT (agent died at "Now the main.js logic"). **Orchestrator wired it
  directly**: `onTapFind` detects `finds.length === 0` → `combReadyAt = 0` +
  `hud.setCombAllFound(true)` + toast; `armCombCooldown` resets the flag on a fresh
  section. Loads clean (no JS errors; only favicon 404).
- Items 3 (nicer water) + 4 (tighter portrait camera) — NOT verified done; the
  agents may not have reached them. RE-CHECK before final ship; low severity.

## PHASE 5 — low-spec tablet performance (user)
User hits real stutter on a low-spec tablet — **worst on ENTERING a beach and
SWIPING** (both physics/CPU-bound: section build runs a big synchronous prewarm;
a swipe wakes the whole pile). Collection view untested but likely worse (2nd
physics world). Diagnosis note: this harness can't give a trustworthy FPS (rAF
capped at 120, software GL), but devicePixelRatio=2 and PBR+shadows+~240 bodies
are the structural drivers. Auto-detect a **Low** quality profile AND a **manual
in-game toggle** (persist choice per-device/save). Apply on Low:
- **Cheaper pebble shading** — drop PBR/env `MeshStandardMaterial` on pebbles →
  flat/lambert (unlit or MeshLambert). KEEP sea glass shiny/translucent.
- **Lower pixelRatio** — cap ~1.0–1.25 on Low (currently ~1.65; device is dpr 2).
- **Shadows OFF** on Low (or a cheap blob).
- **PHYSICS (the actual symptom — beach entry + swipe):** on Low, reduce the
  pebble body cap (~240 → ~120–150), and cut the section-build prewarm cost
  (fewer warm-up steps / spread across frames / lighter settle) so entering a
  beach doesn't hitch. Re-tune find burial for the smaller pile so swiping still
  matters. Clamp solver iterations lower on Low. Consider capping how many bodies
  a single swipe can wake.
- **Auto-detect:** pick Low by default on likely-weak devices (e.g. low
  hardwareConcurrency / deviceMemory / small+dpr heuristics) — but always expose
  a **Quality: Low/High toggle** in-game so the user can force it. Persist it.
- Keep High as the current look for capable devices.

## PHASE 6 — default to Low on tablets (user)
- Auto-detect should default to **Low on any tablet/touch device** (not just weak
  ones). Detect touch/tablet (pointer:coarse / touch capability / mobile-ish UA)
  → Low by default. Desktop/mouse (fine pointer, no touch) → High by default.
  Keep the manual toggle + persistence: a saved choice still wins over auto.

## PHASE 7 — 30Hz step + Rapier port (user)
User accepted the honest trade-offs and wants BOTH:
- **30Hz physics step on Low** (High stays 60Hz). `FIXED_STEP` currently `1/60`,
  `MAX_SUBSTEPS 3`. CAVEAT: a deep sphere pile can jitter/sink at 30Hz — mitigate
  with more substeps at the lower rate, stronger settle/sleep, and (Rapier)
  higher solver/CCD as needed. Tune so the pile stays stable.
- **Port physics from cannon-es → Rapier.js (Rust/Wasm)** via importmap CDN
  (`@dimforge/rapier3d-compat` from jsdelivr; async `RAPIER.init()` before world
  use). Both physics worlds (beach pile + collection bottles). Keep everything
  behaviourally equivalent: primitive colliders only (ball/cuboid — already the
  case), sleep, the swipe-wake cap, the frame-sliced build, raycast tap-collect,
  bottle tilt/shake/pour. Preserve the Low/High quality profile hooks
  (solverIterations→Rapier equivalent, body caps, step rate). This is a LARGE,
  timeout-prone rewrite — do it methodically, keep it working, verify both worlds.

## PHASE 8 — keep 240 stones on ALL profiles (user)
- Pebble count must stay **240 on Low as well as High** (`pebblePerMesh: 80` on
  both — don't drop Low to 45/135). Density is not up for trade. Keep every OTHER
  Low lever (Lambert pebbles, pixelRatio ~1.15, shadows off, 30Hz step, lower
  solver iterations, swipe-wake cap, Rapier, and especially the FRAME-SLICED
  section build so entry doesn't hitch at 240 on Low). Re-tune burial back for the
  full 240 pile (revert any Low-135 burial tweak). The collection piece cap can
  stay lower on Low if you like — this is specifically the beach pebble pile.

## PHASE 9 — shrink colliders, rectangular static rim, match bg texture (user)
1. **Shrink pebble collision spheres further** (visual stays the same size → more
   overlap/interpenetration, which the user is fine with). Fewer solver contacts
   per step = CPU win. Keep the pile stable (don't shrink so far stones fall
   through gaps / the floor).
2. **Bring back the static-stone barrier/rim around the top of the pit** (it
   existed before) BUT **simplify its collider to a single rectangular edge** —
   i.e. a fixed cuboid rim/frame (the containment wall) instead of a ring of many
   static stone bodies. Cheapest possible containment; stones can press against a
   simple box edge rather than dynamic pile spilling out.
3. **The prerendered background-stone texture looks too different from the movable
   stones** — reconcile them: make the shingle-bed / static backdrop texture match
   the palette + look of the actual dynamic pebbles for the current beach (same
   colours/size feel) so the fixed surround and the movable pile read as one beach,
   not two materials.

## PHASE 11 — restore pebble density to ≥250 (user)
- The lphys rewrite dropped real pebbles to 120 (High) / 84 (Low). User wants
  **≥250 pebbles on BOTH profiles**. Now cheap because awake-set means idle
  pebbles cost ~0 (frozen: no sim, no matrix upload) — total count only affects
  section-build time + GPU fill, not steady state. Bump loose-pebble count so both
  profiles have ≥250 (e.g. 3 meshes × ~84 = 252). Keep the frame-sliced build so
  entry doesn't hitch; re-tune burial for the fuller pile. Verify awake returns to
  0 and idle matrix uploads stay 0 at 250+.

## PHASE 12 — move the special-move buttons off the right edge (user)
- The special-move buttons (`#moveBar` — Radar / Shine / Wash) currently sit as a
  vertical column on the RIGHT and get in the way in PORTRAIT. Move them to a
  horizontal ROW along the BOTTOM, sitting ABOVE the fixed bottom nav links
  (Comb/Collection/Beaches/Milestones) — i.e. stacked just above `--navh`. At
  minimum fix portrait; landscape can keep the side column if that reads better,
  or match — builder's call, but portrait must not overlap the beach/edge.
  STATUS: builder died on API timeout after doing PHASE 11 (pebbles = 252 on both
  profiles, CAPACITY 96) but before moveBar. Orchestrator finished moveBar
  directly: `#moveBar` now a bottom-centred horizontal row at
  `bottom:calc(var(--navh)+10px+safe-area)`; `#tips` bumped above it. PHASE 11
  (252 pebbles) verified in code + syntax-clean; awake-set/idle-upload not re-run
  live (harness limits) — trust the awake-set design + tablet test.

## PHASE 13 — dual physics engine: Rapier on High, lphys on Low (user)
- User wants **Rapier rigid-body physics on the HIGH profile** and the current
  **lphys (custom awake-set) on LOW**, BOTH at ~500 pebbles. So the quality
  profile now selects the physics BACKEND, not just tuning knobs.
- Rapier code was fully removed (rapier.js + rphys.js deleted, not in git) — must
  be RECONSTRUCTED and re-added to the importmap (`@dimforge/rapier3d-compat`),
  alongside lphys. Both physics worlds (beach + collection jar) must work under
  either backend, chosen at build/init time by the profile.
- Both profiles ~500 loose pebbles (per-mesh 167 × 3 = 501; CAPACITY 168 already).
- Live quality toggle should switch engines cleanly (rebuild the section/world on
  switch is acceptable — a full live hot-swap of engine mid-pile isn't required).
- NOTE: no QA execution requested by user — make the changes, keep it syntactically
  + structurally sound, don't run the browser verification harness.
- HONEST RISK (told to user): large build, doubles physics surface; 500 Rapier
  bodies is heavy — that's why we left Rapier. Proceeding per explicit user ask.
- STATUS: BUILT (not run — user forbade the browser/QA pass, so there are NO
  runtime or FPS results for this phase; the tablet test is the real check).
  What landed:
  * `js/phys.js` — the backend selector: `initEngine(want)` (awaits the wasm once,
    behind the loading screen), `activeEngine()`, `engineInfo()`, and
    `makeWorld(opts)`, which returns an lphys or a Rapier world wearing the SAME
    surface. `Body` is re-exported from lphys and shared verbatim.
  * `js/rapier.js` — lazy, failure-tolerant loader (dynamic import, so Low never
    downloads the wasm; falls back to lphys if the CDN or the wasm fails).
  * `js/rphys.js` — the reconstructed Rapier backend: same SoA arrays, same awake
    set, same method names as lphys, plus mirror/shadow arrays so game-side writes
    to the SoA get pushed into Rapier. Parking a stone makes it a FIXED body rather
    than calling `rb.sleep()` — sleeping a body in a dense pile makes it integrate
    without resolving and it sinks through the floor.
  * Containment is chosen by CAPABILITY, not engine name: `world.hardWalls` picks
    real static boxes (`buildStatics`, `jarStatics`) + an escape-only clamp on
    Rapier, and the position clamp on lphys.
  * `quality.js`: `high.engine = 'rapier'`, `low.engine = 'lphys'`, plus
    `?engine=`/`?e=` to pin one; `pebblePerMesh` stays 167 (×3 = 501) on both.
  * The quality toggle is async and does a clean rebuild when the engine changes.

## PHASE 14 — BUG: Rapier (High) crashes on comb/rebuild (user-reported, orchestrator-reproduced)
- REPRODUCED live on High (`?q=high`, engine confirmed rapier): combing to a new
  section / rebuilding throws, repeatedly:
  `Uncaught Error: recursive use of an object detected which would lead to unsafe
  aliasing in rust`, then `RuntimeError: unreachable`. The rAF loop keeps running
  (frames advance) but the physics world is dead after — nothing moves, taps do
  nothing. Matches user: "completed picking up all stones, clicked comb → couldn't
  click anything, nothing moved."
- Cause: Rapier `-compat` RE-ENTRANCY / use-after-free on the rebuild path. Classic
  triggers: calling into the world (step/query/createRigidBody/removeRigidBody)
  while already inside a Rapier callback (`forEachActiveRigidBody`), or
  `world.free()` + recreate while a build generator / pump is mid-step, or the
  section-build generator stepping the world re-entrantly during `createWorld()`.
  Must be fixed on the Rapier backend (`js/rphys.js`) + the comb/rebuild sequencing
  in `main.js` (`combFurther`→`buildSection`→`sectionBuilder` generator + `pumpBuild`
  + `createWorld`). Ensure no world call happens inside a Rapier iteration callback,
  and that a rebuild fully tears down / rebuilds the world OUTSIDE any step.
- COMMIT IS HELD until this is fixed + re-validated on High (and spot-checked Low).

- [x] 2. Scout — SKIPPED (concept given)
- [x] 3. Spec → this plan; physics/goal/scope confirmed with user (all features V1; radar+torch moves; rarity; 10-shard ceramics)
- [x] 4. Build — game-builder: games/sea-glass/index.html + js/ (14 modules), root index.html card added
- [ ] 5. Review — game-reviewer; loop fixes until pass (watch FPS on tablet sizes)
- [ ] 6. back-button-check green
- [ ] 7. game-docs-sync → docs/game-sea-glass.md + games-index.md + count; STOP-ship

## Acceptance criteria
- [x] Opens with no JS console errors; runs at a usable frame rate on a tablet (cap bodies/pixelRatio; pebbles sleep)
- [x] Physics pebble layer over a hard sand floor; swipe gently scatters nearby pebbles to uncover pieces
- [x] Tap to collect sea glass / ceramic shards (raycast); satisfying collect feedback
- [x] Multiple beaches with different compositions; advance to fresh sections within a beach
- [x] Glass colour rarity (common→rare) shown on collect + in collection
- [x] 10 ceramic shards per beach → combine into a unique ceramic item → unlock + animation
- [x] Collection view with bottle physics (glass tumbles), mix vs separate, totals/weight/rarity/ceramics
- [x] Milestone unlocks (colours/weight/rarity/ceramics → beaches/bottles/moves)
- [x] Special moves: Radar (reveal buried glass) + Torch (highlight glass), each cooldown-gated
- [x] Caleb/Ezra profiles; progress saved under data.seaGlass
- [x] Touch-first; back button `../../index.html`; PBR materials for stone/glass sheen
- [x] Card in root index.html (`games/sea-glass/`, `.card-sea-glass`)
- [ ] docs/game-sea-glass.md; games-index.md count bumped — orchestrator does the docs sync after review
