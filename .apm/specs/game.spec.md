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
- [ ] Back button href = ../../index.html, plus the data-arcade-back snippet (knowledge/arcade-back.md)
- [ ] UI layer: Three.js/WebGL game → all HUD, menus, overlays and game-over in HTML/CSS over the canvas; Canvas 2D game → canvas HUD pill + canvas game-over
- [ ] Own save item keyed calebArcadeData:<gameName>
- [ ] Pause menu with Sound + Music sliders (0–100, default 80, saved) plus the game's own options
- [ ] Three.js game → Stats performance monitor under "← Games", toggled by P and by holding the Fast mode row

## Home-page card
- Name on title screen:
- Blurb (fits 2 card lines, ~65 chars, what you do):
- Icon (emoji or image path):
- Title font (Google Font) + why:
- Palette (2–3 hex) + pattern idea:
- added: <ship date, YYYY-MM-DD>

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Age-appropriate difficulty; clear start overlay
- [ ] games/<name>/card.json written (added = ship date); build-index.mjs --check green; row + count in docs/games-index.md
- [ ] docs/game-<name>.md created (intro, features, files, design decisions, empty ## Memory)

## Handoff Checklist (STOP gates)
- [ ] Concept picked (human)
- [ ] Spec approved (human, optional for trivial games)
- [ ] Reviewer verdict = pass
- [ ] back-button-check hook green
- [ ] Ship approved (human)
