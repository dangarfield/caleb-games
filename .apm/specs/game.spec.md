# Game: <Name>

> The spec template for a new arcade game. Fill this in during step 3 of the
> `new-game` recipe; it becomes the run plan the builder implements against.

## Concept
One-paragraph what-is-it. The genre gap it fills. Target: Garfield boys (~7+, touch tablet).

## Core Mechanic
The single loop that makes it fun, in 2–3 sentences.

## Controls
- Touch: <primary gesture> (touch-first is non-negotiable)
- Keyboard: <fallback for desktop dev>

## Systems Required
- [ ] <e.g. gravity/physics, level progression, score, particles>

## Conventions (from arcade-build.instructions.md + knowledge/)
- [ ] Single self-contained games/<name>/index.html
- [ ] Canvas 2D, dark-theme palette, touch-action:none
- [ ] Back button href = ../../index.html
- [ ] Canvas HUD pill, canvas game-over, calebArcadeData localStorage

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Age-appropriate difficulty; clear start overlay
- [ ] Card added to root index.html; row + count in docs/games-index.md
- [ ] docs/game-<name>.md created (intro, features, files, design decisions, empty ## Memory)

## Handoff Checklist (STOP gates)
- [ ] Concept picked (human)
- [ ] Spec approved (human, optional for trivial games)
- [ ] Reviewer verdict = pass
- [ ] back-button-check hook green
- [ ] Ship approved (human)
