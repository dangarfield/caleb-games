# Game: Stars (Star Battle / "Two Not Touch")

Run plan for `/new-game`. Durable state — update at every step.

## Concept (GIVEN — scout skipped)
Star Battle logic puzzle, Netflix Tudum "Starstruck" variant. Grid divided into
irregular colored regions. Place exactly **1 star** in every row, every column,
and every region; **no two stars may touch, even diagonally**. Data supplied in
`games/stars/starstruck-all-puzzles.json` (864 puzzles). Audience: Caleb (7) + Ezra.

## Core interaction
- Tap a cell to cycle state: **empty → cross → star → empty**.
- Cross = "definitely no star here" mark (player aid). Star = placement.
- **Auto-cross convenience**: when a star is added, auto-mark crosses on the
  cells its presence forbids (same row, same col, same region, 8 neighbors) —
  BUT only auto-add crosses on currently-empty cells, and *tag them as
  auto-crosses* tied to that star so cycling the star back to empty removes
  exactly those auto-crosses (and no player-placed ones).
- Toggling star → empty must undo the auto-crosses it created (the "sensible
  sequence" the user asked for).

## Buttons (match screenshot: Reset / Undo … Hint / Help)
- **Reset** — clear board to empty (with confirm or single undo-safe step).
- **Undo** — restore previous state exactly (full board-state stack).
- **Hint** — 30s circular countdown cooldown between hints; guided reveal (see below).
- **Help** — rules modal.

## Animations
- Cross appears: quick scale/ink-in pop.
- Star appears: scale + sparkle/glow pop.
- **Cascade**: when a star is placed, the auto-crosses in its row/col/region
  animate in **order of distance** from the star (staggered delay ∝ distance)
  so it ripples out fluidly.
- Win celebration when solved (all rules satisfied).

## Hint system (from screenshot #4 — guided, not just "shown")
- Hint = a modal titled by technique (e.g. "Elimination") + plain-language
  explanation ("The highlighted area needs a ⭐"), with the relevant
  region/row/col highlighted and candidate cells hatched.
- Player then *applies* the suggested change themselves (guided), rather than the
  game auto-filling it. Confirm-to-apply flow.
- **Hint logic spec is pending** — user said the `.md` in games/stars will be
  updated async with hint techniques + logic to code. CHECK BACK before
  finalizing hints. Fallback if absent: derive hints from `solution` +
  standard Star Battle deductions (region/row/col forced placement, elimination).

## Level data strategy
- Source: `starstruck-all-puzzles.json` (regions[][], solution[], size, tier).
- Build a **curated `levels.json`** progression (like streams did) rather than
  bundling all 864: tutorial 5×5 → easy 7×7 → 8×8 → normal 9×9 → hard 9/10×10.
- Counts available: easy 325, normal 200, hard 338, tutorial 1. Sizes 5,7,8,9,10,11.
- Level select + Caleb/Ezra profiles + per-level completion in `calebArcadeData.stars`.

## Region colors
Screenshot palette: purple, green, brown, tan/gold, blue, red/rose, slate. Assign
a fixed accessible palette by region id; keep dark-theme legible.

## Conventions (hard constraints — re-state at every hand-off)
- [x] Single self-contained `games/stars/index.html`, Canvas 2D
- [x] Back button href EXACTLY `../../index.html`
- [x] `touch-action:none`, viewport `user-scalable=no`, large tap targets (touch-first)
- [x] Dark theme base `#0a0a2e`; accent `#6c5ce7`; gold `#ffd32a`
- [x] `calebArcadeData` localStorage, data under `data.stars`
- [x] Web Audio SFX, no network calls for core play (levels.json is a same-folder fetch with an embedded 5×5 fallback)

## Checklist
- [x] 1. Frame — concept given, audience captured
- [x] 2. Scout — SKIPPED (concept given)
- [x] 3. Spec → this plan (trivial-game gate: proceed without formal STOP)
- [x] 3b. Curate levels.json from source JSON — 32 levels (1×5×5, 5×7×7, 10×8×8, 9×9×9, 5×10×10 across tutorial/easy/normal/hard)
- [x] 4. Build — `games/stars/index.html` (~1350 lines, single file)
- [x] 4b. Async hint spec landed (`starstruck-all-puzzles.md` + `hint-logic.js`) — full 14-rule ladder ported, every hint validated against `solution`
- [x] 4c. Post-build user fixes (round 1): drag-to-paint crosses (one undo step per
      gesture, player-tagged, never toggles stars); crosses unified to a single
      deterministic `CROSS_COLOR` (the auto-purple vs player-white split *was* the
      "inconsistent colours" the user saw — deviation, see docs note); ✕ glyph
      shrunk 0.72→0.52 of the cell (help legend 0.24→0.20); Help gained a drag line.
      Re-verified: harness 9/9 stages ALL PASS, fuzz bad=0, Chrome `errors: []` at
      390×844 / 844×390 / 768×1024.
- [x] 4d. Reviewer round-2 fixes (FAIL → fixed): #1 hub card href `games/stars` →
      `games/stars/` *and* a `levelsUrls()` candidate list whose first try is correct
      for `/games/stars`, `/games/stars/` and `…/index.html` (no 404 in any form,
      32 levels everywhere); #3 `boardSquare()` now fits BOTH axes with a landscape
      side-column layout (10×10 cell 20→37 at 844×390, 18→35 at 667×375; 7×7 → 74);
      #4 hint card no longer covers the board — side-docked in landscape, board-
      reserved space + card `scale` in portrait (OVERLAP=false at every viewport;
      narrow-landscape card capped so the board keeps ≥240px, buttons shrink then
      stack, card kept clear of the back button); #5 `onMove` interpolates along the
      segment (plus the release point) so a flick paints every cell — one undo step;
      #6 conflict rings drawn AFTER region borders, lineWidth ≥ max(3.5, cell·0.12),
      red glow + pulsing wash; #7 one prioritised conflict sentence (touch → row →
      col → region), order-independent, no `+N` counter; #8 bottom bar not drawn and
      registers no hitboxes on the win screen; #9 `getPlayerData` memoised;
      #10 `screen` → `view`. Re-verified: harness 13/13 ALL PASS, fuzz 6 viewports
      TOTAL ERRORS 0, extreme viewports (700×300 / 480×320) no off-screen buttons,
      CDP touch snake = full rows + 1 undo step, save/reload persistence intact.
- [x] 4e. Level set 32 → **801** (9 groups) + two-tier level select + hint-cooldown
      tweaks. `buildGroups()` derives `GROUPS` from each record's `group` field and
      stamps `lv._gi` (group index) / `lv._ni` (1-based number inside the group);
      labels come from `groupLabel()` (`easyA` → "Easy A"). New view state
      `menu | groupSelect | levelSelect | playing | won`: menu → 9-card group picker
      (adaptive 1–4 columns, per-group "37 / 100", count drops to its own line on
      narrow cards) → that group's 1–100 tile grid (adaptive 4–10 cols, tiles
      40–78px, drag/wheel scroll with clipped hitboxes + scrollbar/edge fades, lands
      on the level you last played or the first unsolved). Back chain grid →
      groupSelect → menu. Progress still saved under `data.stars.<player>.solved`
      keyed by the **global** id; `groupProgress`/`totalSolved` memoised in
      `progressCache`, invalidated on save; `getPlayerData`/`savePlayerData` refuse
      to write when no profile is chosen. Tutorial (1 level) auto-opens instead of
      drawing a 1-tile grid. Win panel: "Next Level" advances within the group,
      then falls back to "Level Select" / "All Groups"; HUD ☰ → that group's grid.
      Portrait board guarantee raised to `min(zoneH*0.62, n*36)` for the new 11×11
      boards. Hint cooldown 30s → **15s**, bare number (no "s"), and `needsFrame()`
      paints one clearing frame at zero so the button visibly returns to ACTIVE.
      Re-verified: harness 14/14 ALL PASS (all 801 solutions + hint ladder solves
      all 801), grouped-picker flow clean at 7 viewports (`selMax.groupSelect = 0`
      everywhere, all 100 tiles reachable, nothing off-screen, no console errors),
      cooldown probe 15→1 → active at 0 → second hint granted, fuzz TOTAL ERRORS 0,
      extreme viewports OK, `file://` fallback still opens the tutorial.
- [x] 4f. Cosmetic: picker subtitle vs the fixed HTML back link. `selectChrome()`
      drew the centred progress line at y≈47 on short screens (`H < 520`), which
      clipped under `#backBtn` (x 12–118, y 12–47) at narrow short viewports. Base
      `subY` moved 47 → 52, and when the measured line would still start left of
      x=122 it drops to `BACK_B + subSize + 2` (62); the title also shrinks 20 → 18px
      when `H < 520 && W < 390` so it clears the link too. Verified with a
      `fillText`-instrumented probe comparing exact glyph boxes against the live
      `#backBtn` rect at 10 viewports (320×480, 360×480, 375×480, 390×500, 320×568,
      390×844, 844×390, 667×375, 480×320, 1024×768): zero overlaps. Group picker
      still shows all 9 cards without scrolling at 320/360/375×480 (cards ≥69px);
      harness 14/14 ALL PASS, grouped-picker/extreme/fuzz/verify probes unchanged.
- [x] 5. Review — game-reviewer PASS (2 rounds: 8 defects fixed, all confirmed; remaining items LOW/INFO on synthetic viewports, non-blocking). Single CROSS_COLOR ruled acceptable.
- [x] 6. back-button-check green (href `../../index.html`; research/ gitignored)
- [x] 7. game-docs-sync → docs/game-stars.md created; games-index.md row added + count 58→59 (60 dirs). STOP-ship (commit flagged AI-assisted).
  - NOTE: actual level mix is 1×5×5, 5×7×7, 10×8×8, 11×9×9, 5×10×10 = 32 (reviewer correction)

## Acceptance criteria
- [x] Plays with no JS console errors (Chrome, portrait + landscape, menu → select → play → win: `errors: []`)
- [x] Tap cycles empty→cross→star→empty; star→empty removes its auto-crosses (and hands a cross over if another star still forbids it)
- [x] 1 star per row/col/region, no-touch (incl. diagonal) enforced on win-check; live "too many" / "cannot touch" warnings
- [x] Undo restores exact previous state (full `st`+`tag` snapshots; 40-mutation byte-exact test); Reset clears and is undoable
- [x] Hint: 30s circular cooldown ring, guided apply (Place ★ / Mark ✕ or tap the lit cells), technique modal with icon + title + plain sentence
- [x] Cross/star appear animations; distance-ordered cascade on star placement (stagger ∝ distance, nearest first)
- [x] Win celebration — gold board glow, confetti, "Solved!" panel with 3 stars + hint count
- [x] Level select + Caleb/Ezra profiles + progress saved under `data.stars.<player>.solved`
- [x] Card in root index.html (`.card-stars`, 🌟, `href="games/stars/"` — trailing slash required so `levels.json` resolves)
- [ ] docs/game-stars.md; games-index.md count bumped — owned by game-docs-sync, NOT the builder
