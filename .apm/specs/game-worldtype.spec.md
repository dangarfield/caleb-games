# Game: World Type (worldtype)

> Spec for a new arcade game. Filled during step 3 of the `new-game` recipe;
> this is the run plan the builder implements against.

## Concept
A "name the countries of the world" geography game. An accurate world map fills
the screen; the player types country names into a text box, and each correct
guess floods that country green on the map. The goal is simply to recall and
type as many of the world's countries as you can. Fills a true gap — the arcade
has trivia (Treehouse) but no geography/map game. Target: Garfield boys (~7+,
touch tablet). Approachable via zoom/pan + a hint system.

## Core Mechanic
One text input, always focused. Type a country name and press enter (or auto-match
on exact/fuzzy hit). A correct, not-yet-found country animates to green and the
"found N / total" counter ticks up. Fuzzy matching tolerates small spelling
slips and common aliases so a 7-year-old isn't blocked by exact spelling.

## Controls
- Touch: pinch-to-zoom and one-finger drag-to-pan the map. On-screen text field
  for typing (mobile keyboard). Tap the hint button when available. (touch-first
  is non-negotiable)
- Keyboard: type in the text field; Enter submits. Mouse wheel = zoom, drag = pan
  (desktop dev fallback).

## Systems Required
- [ ] Bundled world geometry: simplified world GeoJSON/TopoJSON inline in the HTML
      (offline, ~180–195 sovereign countries), rendered as Canvas 2D polygons with
      an equirectangular (or simple Mercator-ish) projection.
- [ ] Pan/zoom camera (touch pinch + drag, wheel + drag) with clamped bounds.
- [ ] Country name index: canonical name + alias list (USA/United States, UK/
      United Kingdom, DRC/Congo, etc.) + fuzzy match (Levenshtein distance ≤ ~2,
      scaled to word length; case/diacritic-insensitive).
- [ ] Found-state per country; green fill + brief flash/particle on correct guess.
- [ ] HUD pill: "Found N / TOTAL" + timer.
- [ ] Hint system: one hint, 60-second cooldown; on use, reveal (flash + label,
      or temporarily highlight) a random UNMARKED country. Cooldown visible on the
      hint button.
- [ ] Persistence: best score (most countries found) in calebArcadeData.worldtype.
- [ ] Win/summary state when all found (or a "give up / reveal remaining" option
      that shows unmarked countries in a distinct colour).

## Conventions (from arcade-build.instructions.md + knowledge/)
- [ ] Single self-contained games/worldtype/index.html
- [ ] Canvas 2D, dark-theme palette, touch-action:none
- [ ] Back button href = ../../index.html
- [ ] Canvas HUD pill, canvas game-over/summary, calebArcadeData localStorage
- [ ] No network calls for core play (GeoJSON bundled inline; Web Audio SFX)

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Map renders accurately; countries are visually distinct and correctly
      positioned; polygons fill green on a correct guess
- [ ] Fuzzy match accepts minor misspellings + common aliases; rejects wrong/empty
- [ ] Pinch-zoom + drag-pan work on touch; wheel+drag on desktop
- [ ] Hint reveals a random unmarked country; 60s cooldown enforced + shown
- [ ] Age-appropriate; clear start overlay with instructions
- [ ] Card added to root index.html; row + count updated in docs/games-index.md
- [ ] docs/game-worldtype.md created (intro, features, files, design decisions,
      empty ## Memory)

## Handoff Checklist (STOP gates)
- [x] Concept picked (human) — "type the countries of the world" map game
- [ ] Spec approved (human, optional)
- [ ] Reviewer verdict = pass
- [ ] back-button-check hook green
- [ ] Ship approved (human)
