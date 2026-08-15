# Stars

A Star Battle / "Two Not Touch" logic puzzle, adapted from Netflix Tudum's
"Starstruck" daily. The grid is divided into irregular colored regions; the
player places exactly **1 star in every row, every column and every region**,
and **no two stars may touch, even diagonally**. 801 levels, organized into 9
groups, ramp from a 5×5 tutorial to 11×11 hard boards.

## Features
- **Player select (Caleb / Ezra)** with separate progress, stored under
  `calebArcadeData.stars.<player>` (`{ solved: {globalLevelId:true}, hints }`).
- **801 levels in 9 groups**, distilled from the 864-puzzle source set:
  **Tutorial** (1), **Easy A/B/C**, **Normal A/B**, **Hard A/B/C** — 100 levels
  per lettered group. Each group ramps by grid size (Easy 7→9, Normal 8→11,
  Hard 8→10). Loaded from same-folder `levels.json`. Each record carries a
  `group` field; save state is keyed by the **global** level id (1..801) so a
  level's progress is stable regardless of its position within a group.
- **Two-tier level select** — a group picker (9 cards with per-group progress,
  e.g. "37 / 100") opens that group's scrollable grid of up to 100 numbered
  tiles (1–100 within the group). The 1-level Tutorial group auto-opens. After a
  win, "Next Level" advances within the group; at group end it offers Level
  Select / All Groups.
- **Tap to cycle a cell** empty → ✕ (cross) → ★ (star) → empty. Cross is a
  player aid ("no star here"); star is a placement.
- **Auto-cross on star placement** — placing a star auto-marks crosses on every
  currently-empty cell it forbids (same row, column, region, and the 8
  neighbors). Each auto-cross is tagged to its originating star. Reverting the
  star (★→empty) removes exactly its auto-crosses — or hands a cross over to
  another star still forbidding that cell — while leaving player-placed crosses
  untouched.
- **Drag to paint crosses** — pressing and dragging past a small threshold
  paints crosses across empty cells the pointer passes over (with segment
  interpolation so a fast flick fills the whole line), as a single undo step.
  A stationary tap still cycles.
- **Distance-ordered cascade** — auto-crosses ripple outward from a placed star,
  nearest-first (stagger ∝ distance), for a fluid feel. Cross/star also have
  appear (ink-in / scale-bounce + sparkle) animations.
- **Guided hint system** — a hint opens a technique modal (title + plain-language
  sentence, e.g. "Elimination — the highlighted area needs a ★"), highlights the
  relevant region/row/column, and lets the player **apply** the deduction
  themselves (Place ★ / Mark ✕ or tap the lit cells) rather than auto-solving.
  A 14-rule deduction ladder chooses the simplest valid hint for the current
  board; every suggestion is validated against the level's `solution`. A **15s
  circular countdown ring** gates hints between uses (bare-number label).
- **Undo** (full board-state stack, restores the exact previous `st`+`tag`
  state) and **Reset** (clears the board, itself undoable).
- **Live conflict feedback** — over-placed rows/cols/regions and touching stars
  are ringed in red with a single prioritised message
  (touching → row → column → region).
- Canvas HUD pill (level # + star count), canvas win screen (gold board glow,
  confetti, "Solved!" with 3 stars + hint count), Web Audio SFX.
- Adaptive layout: portrait stacks board over controls; landscape uses a
  left-HUD / centered-board / right-button-stack column layout so the board
  stays large.

## File structure
- `index.html` — the whole game (Canvas 2D, single file, no build step). Player
  select, level select, board rendering, cell interaction (tap-cycle +
  drag-paint), auto-cross/cascade, hint engine, undo, HUD, win screen, SFX.
- `levels.json` — 801 levels (~320 KB): `{id, group, srcId, tier, size, stars,
  regions, solution}`. `regions` is a size×size row-major region-id grid;
  `solution` is the star cells. Fetched at runtime with a candidate-path list so
  it loads under any URL form; falls back to an embedded 5×5 tutorial if the
  fetch fails.
- `research/` (gitignored) — reference material: `starstruck-all-puzzles.json`
  (864-puzzle source, ~1.2 MB), its format `.md`, and `hint-logic.js` (the
  ported hint-technique ladder). Not fetched at runtime.

## Key design decisions
- **Cross state is carried by `tag[]`, not by color.** All crosses render in a
  single deterministic `CROSS_COLOR`; the auto-vs-player distinction lives
  internally in `tag[]` and drives the exact star-revert, the cross hand-over,
  and the `wrong_cross` hint. The earlier two-color scheme (auto-purple vs
  player-white) was removed: `findOtherForbiddingStar` can reassign a cross's
  owner with no player action, so color could change spontaneously and read as a
  glitch — the user reported it as inconsistent coloring.
- **Auto-cross includes the region** (not just row/col/8-neighbors), matching the
  puzzle's constraints; a consequence is that a `fill_cross` hint rule can never
  fire in practice.
- **Hints are validated against the stored `solution`** — star suggestions must
  be solution stars and cross suggestions are filtered against them, so a hint
  can never mislead. If no "clever" technique applies, it falls through to
  revealing one correct next mark.
- **Curated 32-level progression** rather than bundling all 864 puzzles, keeping
  the shipped data small (~12 KB) and the difficulty ramp deliberate.

## Memory
- Built via the `new-game` recipe. `game-reviewer` verdict = **pass** after one
  bounded fix round (8 defects fixed, all confirmed on re-review; remaining items
  are LOW/INFO on synthetic/unreachable viewports).
- Bug: **entering from the hub loaded only 1 of 32 levels + a console 404.** The
  card href was `games/stars` (no trailing slash); `serve` doesn't redirect to
  the trailing-slash form, so `fetch('levels.json')` resolved to
  `/games/levels.json` → 404 → single-tutorial fallback. Fixed by setting the
  card href to `games/stars/` **and** making the loader build a candidate-path
  list (dir-relative first) so it can't 404 regardless of trailing slash.
- Bug: **landscape phone boards were tiny** (`boardSquare()` capped by height
  only → ~20 px cells). Fixed to fit both axes with a landscape column layout.
- Bug: **hint card covered the board / highlighted cell on short screens** — the
  card was measured against the board (circular). Fixed by measuring the card
  from text + viewport only and fitting the board into the remaining space.
- Bug: **drag-paint skipped cells on a fast flick** — `onMove` only marked the
  cell under each pointer sample. Fixed by interpolating cells along the segment
  between samples.
- Decision: single `CROSS_COLOR` (see Key design decisions) in response to user
  feedback about inconsistent cross coloring; the drag-to-paint-crosses gesture
  was also added on user request.
- Expansion: level set grew 32 → **801** (9 groups) on user request, with a
  two-tier group→grid level select. Save state stayed keyed by global level id so
  earlier solves remained valid. Reviewer PASS (delta review of the picker,
  scroll, and cooldown work).
- Bug: **hint cooldown stuck in the disabled state at zero.** The render loop
  (`needsFrame()`) stopped the instant the deadline passed, so the last painted
  frame kept the dim fill/number/ring forever. Fixed by painting one clearing
  frame and zeroing the deadline when `now >= hintCooldownUntil`. Same round:
  cooldown shortened 30s → 15s and the label switched to a bare number (no "s"),
  both per user request.
- Note: the "5 tutorials" a user referenced (`grid.tutorialLevel`) belongs to the
  **Streams** game's `currents-source.json`, a different puzzle. The Star Battle
  source has only 1 `isTutorial` puzzle, so the Tutorial group is a single 5×5.
