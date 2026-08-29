# Territory

Qix/Xonix/JezzBall territory-capture game, rebuilt (2026-08-29) around a **circular
wheel map**. Steer one marker (4 directions only) off claimed ground into open space,
close the loop back onto claimed ground, and every enclosed pocket with no enemy in it
becomes yours. 24 radial spokes x 6 rings = **144 levels** assembled from **18 mechanics**
that can all run simultaneously. Caleb/Ezra profiles, per-difficulty pass/fail progress,
global Easy/Normal/Hard toggle. Single self-contained file, touch-first, tuned for a
low-powered tablet. The play screen borrows Infinijump's neon-on-starfield look.

## Features

### The wheel map (default screen)
- Dartboard layout: 24 spokes at 15 degrees, 6 rings each. **Centre = easiest, rim = hardest.**
- Spokes alternate **PURE** (12, one per pure mechanic) and **MIXED** (12, each sitting
  between two pure spokes and running both their systems at once, plus more).
- Pure spoke names are drawn **halfway along the spoke, rotated with it and offset
  perpendicular** so the text never sits on the line or the node dots; sized off the wheel
  radius so it stays readable at phone width.
- Node states: locked (grey outline), unlocked (pulsing coloured ring), cleared (filled +
  tick). Hold a node to peek at its name/target/lives, release to play.
- Centre hub: Caleb/Ezra toggle, Easy/Normal/Hard toggle, `N / 144` cleared count for the
  **current profile and difficulty**.
- Gating is deliberately loose: **ring 0 of all 24 spokes is open from the start**, and
  clearing a node opens the next ring out on that spoke only. No cross-spoke gating.
  Unlocks are read from the current difficulty's cleared set, so switching difficulty
  switches which nodes are open.

### 18 mechanics, one engine
Every mechanic is a boolean flag on the level config, so any combination works.

| Mechanic | Behaviour |
|---|---|
| Classic | Bouncing balls in open space |
| Swarm | Many small fast balls |
| Sparx | Enemies patrol the claimed/open frontier; they kill the marker even with no trail out |
| Qix | Big roaming blob that cuts trails |
| Gravity | Balls fall and bounce with randomised restitution; the marker spawns on the TOP border |
| Splitter | Every claim splits each ball in two (capped) |
| Fuse | Stall with a trail out and after 0.4 s a fuse burns the trail from its root toward you |
| Hunter | Homes on the marker — but only while the marker is exposed (trail out) |
| Ice | Momentum steering: slow turns, glides after you let go |
| Wind | A slowly rotating current pushes balls always, and the marker only while exposed |
| Mirror | A second marker mirrors your input inverted; both must survive; higher target % |
| Boss | Big steerer that hunts the live trail; lissajous prowl of mid-field when you are safe |
| Maze | Seeded internal WALL blocks make corridors |
| Shrink | Claimed land erodes from its frontier over time (never the outer border) |
| JezzBall | Steering into open space launches a bi-directional growing wall instead of a trail |
| Portal | A pair of portals teleports the marker (trail intact) and the balls |
| Bomber | Enemies detonate periodically, erasing a patch of claimed land |
| Ghost | Enemies phase through claimed ground/walls in telegraphed windows |

Pure spokes clockwise from top: Classic, Swarm, Sparx, Qix, Gravity, Splitter, Fuse,
Hunter, Ice, Wind, Mirror, Boss — one mechanic each, at every ring.

**Mixed spokes scale with the ring**: they start from their two pure neighbours and top up
from the **full 18-type pool**, `count = min(ring + 2, 5)` → ring 1: 2 types, ring 2: 3,
ring 3: 4, rings 4-6: 5 (the cap is logged to the console on load). Extras are picked
deterministically from `mulberry32(spoke*7919 + ring*104729 + 17)`, so a level is always
the same level. Names auto-generate: "Gravity · Splitter · Boss · Ice · Maze".

### Difficulty — two independent dials
1. **Ring ramp** (automatic): `enemyCount = base(type) + ring`, `speedMult = 1 + 0.16*ring`,
   `enemySize = 1 + 0.06*ring`, `targetPct = 60 + 4*ring` (60-80%), `lives = 3` (-1 at ring 5).
2. **Global toggle** (per profile): Easy `speed x0.8, enemies -1, target -8, lives +1`;
   Normal as computed; Hard `speed x1.25, enemies +1, target +5`.

Per-mechanic target offsets live in `TUNING.typeTarget` (Mirror +8, because two markers
claim twice as fast). All of this lives in the single `TUNING` object at the top of the
file, together with every speed, radius, interval, cap and FX budget. Colours are the one
thing kept out of TUNING — they sit in `THEME`.

### Play
- Coarse 52 x rows cell grid (rows from screen aspect, 32-46). Cells EMPTY / CLAIMED / WALL / TRAIL.
- 2-cell claimed border ring to start; the marker rides claimed ground and trails into open space.
- **4-directional movement only** (up/down/left/right). On-screen **4-way joypad appears
  wherever you touch** and follows a long drag; arrow keys / WASD are the desktop fallback.
- **True Xonix claiming**: closing a loop turns the trail into permanent claimed wall, splits
  the remaining open space into 4-connected regions, and claims every region with **no enemy
  in it**. A region that still holds an enemy stays open, and a cut-off ball is **never moved**.
- Newly claimed ground **animates in** as a radial reveal from the closing point (dim → white
  leading edge → final gradient) with sparkle particles, not an instant flat fill.
- Reversing into your own trail retracts it instead of killing you; crossing it elsewhere kills.
- HUD pill (name, ring, progress bar with a gold target notch, lives, mechanic dots) that drops
  below the two fixed buttons on narrow phones so nothing overlaps.
- Two fixed buttons: `← Games` top-left (to the arcade), and an **icon-only wheel glyph
  top-right (to the wheel map)** shown only during play. Escape does the same on desktop.
- Win overlay: radial burst rings + confetti + particle showers + glow pulse; lose overlay
  matches. Buttons carry drawn icons: Next Ring ▶, Try Again ↻, Wheel Map ⊞.
- Visuals: twinkling starfield over the Infinijump gradient, neon `shadowBlur` glow with a
  bright core on the marker and every enemy, claimed field drawn with a vertical gradient and
  a brighter glowing frontier edge.
- Web Audio SFX only: draw, claim, death, win, lose, split, wall, shrink, portal, boom.

## File structure
- `games/territory/index.html` — the whole game (~1990 lines): TUNING, THEME, mechanic table,
  storage guards, audio, starfield/particles, wheel map, level generator, grid engine,
  mechanic systems, joypad, HUD/overlays.

## Key design decisions
- **One engine, flags for everything.** Every mechanic is a system gated on `cfg.has.<mech>`,
  so 144 levels are data, not code. Adding a 19th mechanic is a flag + a system + a spoke entry.
- **Grid rendering is one image blit.** The board is painted into a 52 x rows offscreen canvas
  at 1 px per cell (Uint32 writes over ImageData) and drawn scaled with
  `imageSmoothingEnabled = false`. The gradient, the frontier-edge highlight and the fill
  animation are all *colour choices inside that same blit* — the claimed field never costs more
  than one repaint plus one scaled draw. Glow (`shadowBlur`) is spent only on the handful of
  dynamic sprites: marker, enemies, portals, particles, the field frame.
- **4-directional movement is also a correctness decision.** A 4-connected flood fill leaks
  through a diagonal trail; with 4-dir steering (and axis-separated stepping for the ice-slide
  transition) the trail is always 4-connected, so the fill can never leak.
- **Legacy shared storage key.** This game already shipped on `calebArcadeData.territory`, so
  the rebuild stays there rather than moving to `calebArcadeData:territory` and orphaning the
  kids' progress. Reads are fully sanitised; writes merge into the shared blob and never throw.
- **Progress is pass/fail, per profile, per difficulty.** `profiles.<name>.cleared.<difficulty>`
  is a set of level ids. No best-% is stored: a 7-year-old cares whether a node has a tick, and
  a per-difficulty set means Easy progress can't unlock Hard levels.
- **Coarse grid on purpose.** 52 cols (not 96) so each closed loop is worth ~2-4% of the field:
  a level lands in roughly 60-90 s instead of 3 minutes.
- **The marker is always the fastest thing on the field** (16 cells/s vs 5.2-9.5 for enemies),
  so escaping is a decision, not a dice roll.
- **Forgiveness over purity**: trail retraction, 1.6 s respawn invulnerability, no timers,
  claimed land is never lost on death, and progress is monotonic — every closed loop claims at
  least its own trail, so the target is always reachable no matter where the balls are.

## Memory
- **Hunter/Boss camping deadlock.** Both originally homed on the marker unconditionally, so they
  parked next to it on claimed ground and the level could never be started. Fixed: they only
  home while a marker is *exposed* (has a live trail); otherwise hunters drift and the boss
  prowls mid-field.
- **Wind dragged idle markers to their death.** Wind was applied to the marker every frame, so
  standing still on the border drifted the marker into open space, opened a trail the player
  never asked for, and cost a life. Fixed: wind affects the marker only while it has a trail out.
- **Gravity levels were unplayable from the bottom.** Gravity balls settle onto the floor, which
  is exactly where the marker spawned. Fixed: gravity levels spawn the marker on the top border.
- **Diagonal trails leaked the flood fill.** A 4-connected fill walks straight through a diagonal
  line of trail cells. Fixed by moving the marker axis-separately (x step, then y step), which
  marks the corner cell and seals the diagonal — and later by dropping diagonals from steering
  altogether.
- **The `claim.rewardMaxFrac` / relocate hack is gone (removed 2026-08-29).** The first build
  couldn't reach the target with strict Xonix rules, so it claimed small enemy-occupied regions
  anyway and *teleported* the trapped ball to the nearest open cell. Players hated the teleport,
  and rightly: the drawn line is supposed to be a permanent wall. Both the fraction hack and
  `relocate()` were deleted. The real problem was never the region rule — it was that 8-dir
  movement made clean sliver-carving awkward. With 4-dir movement a bot carving 7x4 pockets
  reaches 81% of a ring-5 Hard field (target 85%) and 99-100% of an empty one, so strict "claim
  only enemy-free regions" accumulates fine. **Do not reintroduce a teleport.**
- **Sparx-only levels became instant wins.** Once the "no enemies anywhere → keep the biggest
  region open" special case went away with that hack, the pure Sparx spoke had no enemy in the
  open field at all (sparx ride the claimed frontier), so the first closed loop claimed 100% of
  the board. Fixed in the level generator, not the claim rule: every level is guaranteed at least
  one non-sparx roamer loose in the open field.
- **Qix and Boss ground along the walls.** Both had their velocity recomputed from a steering
  target every frame, which overwrote the reflection `moveEnemy` had just applied, so they stuck
  to an edge and shivered. Fixed with three things: reflect `e.dir` from the post-bounce velocity,
  a `bounceCd` window that suppresses wander/steering right after a bounce, and a `keepInside()`
  inward nudge. Measured headlessly: both now spend 0% of a 60 s run within `r + 1.2` cells of a
  bound (was most of the run), and the boss idles on a slow lissajous instead of hovering dead
  centre.
- **Balls bounced on their centre but broke trails with their edge.** A ball would visually
  overlap claimed ground before turning, and could break a trail that looked untouched. Both
  tests now use the edge (centre ± radius on the axis of travel); a headless sweep measures 0.00
  cells of worst-case overlap between a ball edge and claimed ground.
- **`keys` was being rebound, not cleared.** `startLevel` did `keys = {}`, which swapped the
  object out from under anything holding a reference (the headless bots steered a dead object and
  scored 0% everywhere). Now `keys` is `const` and `clearKeys()` resets its fields.
- **Balance and behaviour are measured headlessly**, not by eye: the script is extracted and run
  in Node against a stubbed canvas/localStorage for all 432 level-configs (144 levels x 3
  difficulties, 0 errors), plus 4-dir carving bots, per-mechanic assertions, and storage-abuse
  tests (corrupt JSON, junk fields, legacy save migration, a `setItem` that always throws).
  **Perf was NOT measured on the tablet** — the argument is structural (one image blit for the
  field, glow only on a dozen sprites, a particle cap that drops glow above 60 particles), not a
  benchmark.
