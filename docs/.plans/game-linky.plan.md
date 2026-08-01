# Run Plan — Linky (Flow Free clone)

## Concept
Linky: connect matching colored dots by drawing pipes across a grid. Pipes cannot
cross, and a level is solved only when **every cell** is filled (Flow Free rules).
Genre gap: no pure pipe/flow connection puzzle in the arcade. Target: Garfield boys
(~7+, touch tablet).

## Core Mechanic
Drag from one colored dot to its twin, filling cells along the path. Two pipes can't
overlap; drawing over an existing pipe truncates it. Win = all pairs connected AND
all cells covered.

## Controls
- Touch: drag from a dot along adjacent cells to its pair (touch-first).
- Keyboard/mouse: click-drag equivalent for desktop dev.

## Systems Required
- [ ] Grid model (5x5 → 9x9), cell state, pipe paths
- [ ] Drag-to-connect input with truncation on overlap
- [ ] Win detection (all pairs joined + full coverage)
- [ ] 50 levels, provably solvable (embedded solution paths)
- [ ] Level progression + persistence (per player)
- [ ] Player select: Caleb / Ezra (per-player progress)
- [ ] Hint system (reveals part of a solution path)
- [ ] Canvas HUD pill, canvas win screen, particles

## Level generation — CRITICAL
Levels MUST be provably solvable AND fully-covering. Approach: **generate by
construction** — partition the full grid into contiguous paths (each path = one
color pair, endpoints = path ends) so the solution is the generator's own
partition. Store solution paths in the level data. A self-test (runnable in-page
via `?selftest`) must verify every level: endpoints valid, solution paths are
adjacent-step chains, no overlap, full coverage. 50 levels, sizes 5x5..9x9,
node counts increasing with size.

## Conventions
- [ ] Single self-contained games/linky/index.html (data file allowed if it helps)
- [ ] Canvas 2D, dark-theme palette, touch-action:none, back button ../../index.html
- [ ] Canvas HUD pill, canvas win screen, calebArcadeData localStorage
- [ ] Caleb Games palette; flow colors themselves are vivid dot colors (like Flow Free)

## Acceptance Criteria
- [ ] Plays with no console errors
- [ ] All 50 levels pass the embedded self-test (provably solvable + full coverage)
- [ ] Player select Caleb/Ezra with separate progress
- [ ] Hint works
- [ ] Card in root index.html; row + count in docs/games-index.md
- [ ] docs/game-linky.md created

## Steps / Gates
- [x] Frame (concept given)
- [x] Spec → plan (this file)
- [x] Build (game-builder, Opus 5) — DONE. games/linky/{index.html,levels.js,tools/gen-levels.mjs}, docs/game-linky.md; wired root index.html + games-index.md (57 games). All 50 levels verify full coverage; ?selftest present.
  - NOTE: fixed broken agent frontmatter first (bad tool names → zero tools; invalid model). Now tools=Read/Write/Edit/Grep/Glob/Bash, model=claude-opus-5.
- [x] Review (game-reviewer, Opus 5) — PASS, zero defects. ?selftest all 50 pass in-browser.
- [x] back-button-check green (href=../../index.html confirmed line 111)
- [x] Independent verify by orchestrator: all 50 solutions valid + full coverage (separate code path)
- [x] game-docs-sync — docs verified accurate; recorded dev-server ?selftest quirk in game Memory; project memory written.
- [ ] STOP — human ships (awaiting)
