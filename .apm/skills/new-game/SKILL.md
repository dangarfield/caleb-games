---
name: new-game
description: >-
  Activate when the user asks to add, create, or build a new game for the
  Garfield Boys' Arcade. Orchestrates concept research, spec, build, card,
  review, and docs sync end-to-end with human STOP gates. Handles a named
  concept ("add a fishing game") or proposes one from genre gaps.
---

# New Game: the orchestrator recipe

You drive the end-to-end creation of ONE new arcade game by composing existing
primitives. You carry the *sequence and the gates*. The conventions come from
`arcade-build.instructions.md` + `knowledge/`, and the code comes from `game-builder`.

## Ingredients
- `game-scout` (agent): proposes concepts from genre gaps.
- `game.spec.md` (`.apm/specs/`): the spec template to fill, including its **Home-page card** section.
- `game-card.spec.md` (`.apm/specs/`): the poster-card contract (`games/<name>/card.json`).
- `game-builder` (agent): implements to conventions and writes `card.json`.
- `game-reviewer` (agent): QA against the rubric, including the card checklist.
- `game-docs-sync` (skill): reconciles docs after ship.
- `back-button-check`, `cards-index`, `docs-writeback` (hooks): deterministic gates.

## Plan Memento (do this first, non-negotiable)
Before building, write a run plan to `docs/.plans/game-<name>.plan.md` (gitignored):
the filled spec plus a live checklist of the steps below. Read and update it at every
step. This is durable state OUTSIDE the context window, and it defeats long-session drift.

## Method
1. **Frame.** Is the concept given (advanced) or do you propose one (starter)? Capture the age/difficulty target and any open-source game to port.
2. **Scout** *(skip if the concept is given).* Delegate to `game-scout`, which returns a shortlist. **STOP: the human picks the concept.**
3. **Spec.** Fill `game.spec.md` for the chosen concept, including the Home-page card section (name, blurb, icon, font, palette). This becomes the run plan. **STOP: approve the spec** (optional for trivial games).
4. **Build.** Delegate to `game-builder` (own context). It reads the spec + `knowledge/`, obeys `arcade-build.instructions.md`, and produces the game.
5. **Card.** `game-builder` writes `games/<name>/card.json` per `game-card.spec.md`:
   - `"added"` = **today's date** (`YYYY-MM-DD`). This is what puts the game first on the home page with a NEW badge.
   - The title font and palette come from what the game *actually uses* (its title screen, CSS variables, hero colours). If the game has no type identity yet, choose one and use the same Google Font in the game's title screen, so the card and the game match.
   - **Never edit `index.html`.** The `cards-index` hook regenerates it when `card.json` is saved. If the hook reports card errors, fix the card.
6. **Review.** Delegate to `game-reviewer` (own context, read-only). It uses the game rubric plus the card checklist in `game-card.spec.md`. On **fail**, route the defects back to `game-builder` for a bounded fix pass, and loop until it passes. The reviewer's rubric may not be weakened to pass.
7. **Deterministic gate.** `back-button-check` and `node scripts/build-index.mjs --check` must be green. This is the mechanical truth anchor and it overrides opinion.
8. **Sync docs.** Run `game-docs-sync` to flesh out `docs/game-<name>.md` and confirm `games-index.md` + count. The `docs-writeback` hook enforces this. **STOP: the human ships** (commit flagged AI-assisted).

## Attention Anchor (at every hand-off)
When you move between steps (scout→pick, build→card→review, review→fix), restate the
goal and the hard constraints (the conventions rubric plus "single-file,
back-button `../../index.html` with the `data-arcade-back` snippet, age-appropriate, touch-first, `card.json` with
today's `added` date, never hand-edit `index.html`"). This stops a long
autonomous run from silently drifting off the spec.

## Gates are dials
For a low-stakes game, keep only "pick concept" and "ship". For a ported game with
licensing questions, keep them all. With gates set to notify-not-block, a run can
go from concept to shipped autonomously. The `cards-index` gate is never optional.

## Boundary
Orchestrate only. Do not write game code (that's the builder) or invent the concept (that's the scout).
One new game = one run of this recipe. Never create a per-game or per-genre primitive.
To restyle an *existing* game's card, use `/refresh-card <slug>` rather than this recipe.
