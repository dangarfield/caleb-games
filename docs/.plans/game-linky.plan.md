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
- [~] Spec → plan (this file)
- [ ] Build (game-builder)
- [ ] Review (game-reviewer) — loop until pass
- [ ] back-button-check green
- [ ] game-docs-sync
- [ ] STOP — human ships
