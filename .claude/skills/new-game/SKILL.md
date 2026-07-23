---
name: new-game
description: >-
  Activate when the user asks to add, create, or build a new game for the
  Garfield Boys' Arcade. Orchestrates concept research, spec, build, review,
  and docs sync end-to-end with human STOP gates. Handles a named concept
  ("add a fishing game") or proposes one from genre gaps.
---

# New Game — the orchestrator recipe

You drive the end-to-end creation of ONE new arcade game by composing existing
primitives. You carry the *sequence and the gates* — not the conventions (those
come from `arcade-build.instructions.md` + `knowledge/`) and not the code (that's
`game-builder`).

## Ingredients
- `game-scout` (agent) — propose concepts from genre gaps.
- `game.spec.md` (`.apm/specs/`) — the spec template to fill.
- `game-builder` (agent) — implement to conventions + wire in.
- `game-reviewer` (agent) — QA against the rubric.
- `game-docs-sync` (skill) — reconcile docs after ship.
- `back-button-check` + `docs-writeback` (hooks) — deterministic gates.

## Plan Memento (do this first — non-negotiable)
Before building, write a run plan to `docs/.plans/game-<name>.plan.md` (gitignored):
the filled spec + a live checklist of the steps below. Read and update it at every
step. This is durable state OUTSIDE the context window — it defeats long-session drift.

## Method
1. **Frame.** Concept given (advanced) or propose one (starter)? Capture age/difficulty target and any open-source source to port.
2. **Scout** *(skip if concept given).* Delegate to `game-scout`; it returns a shortlist. **STOP — human picks the concept.**
3. **Spec.** Fill `game.spec.md` for the chosen concept → the run plan. **STOP — approve spec** (optional for trivial games).
4. **Build.** Delegate to `game-builder` (own context). It reads the spec + `knowledge/`, obeys `arcade-build.instructions.md`, produces the game + wiring.
5. **Review.** Delegate to `game-reviewer` (own context, read-only). On **fail**, route defects back to `game-builder` for a bounded fix pass; loop until pass. The reviewer's rubric may not be weakened to pass.
6. **Deterministic gate.** `back-button-check` (and siblings) must be green — mechanical truth anchor, overrides opinion.
7. **Sync docs.** Run `game-docs-sync` to flesh out `docs/game-<name>.md` and confirm `games-index.md` + count. The `docs-writeback` hook enforces this. **STOP — human ships** (commit flagged AI-assisted).

## Attention Anchor (at every hand-off)
When you move between steps (scout→pick, build→review, review→fix), re-state the
goal and the hard constraints (the conventions rubric + "single-file,
back-button `../../index.html`, age-appropriate, touch-first") so a long
autonomous run does not silently drift off the spec.

## Gates are dials
For a low-stakes game keep only "pick concept" and "ship". For a ported game with
licensing questions, keep them all. With gates set to notify-not-block, a run can
go concept→shipped autonomously.

## Boundary
Orchestrate only. Do not write game code (builder) or invent the concept (scout).
One new game = one run of this recipe. Never create a per-game or per-genre primitive.
