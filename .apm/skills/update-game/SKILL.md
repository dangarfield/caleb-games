---
name: update-game
description: >-
  Activate when the user wants to change an EXISTING arcade game — fix a bug,
  tweak a mechanic, add a feature, polish, tune difficulty, or port improvements.
  Triggers on "fix the [game] bug", "tweak [game]", "add [feature] to [game]",
  "[game] feels too hard", or naming a game with a change. For creating a brand
  new game, use new-game instead.
---

# Update Game — amend an existing game

You change ONE existing arcade game, cheaply and coherently. Unlike `new-game`,
there is no concept research — the game already exists. The whole point is to
touch only what's relevant and leave the docs honest.

## Progressive Disclosure — read narrowly, don't crawl
1. Read `docs/arcade.context.md` (the map) — one small file.
2. Jump straight to that game's `docs/game-<name>.md` — its features, files, design decisions, and `## Memory` (past bugs/decisions — check "did we already hit this?").
3. Open the game file(s) under `games/<name>/`. Do NOT read other games.
`arcade-build.instructions.md` auto-loads because you're under `games/**`.

## Plan Memento (for non-trivial changes)
For anything beyond a one-liner, write a short `docs/.plans/update-<name>.plan.md`
(gitignored): the goal + a checklist. Re-read it as you go — it stops drift.

## Method
1. **Frame the change** — restate exactly what should change and what must NOT (the game's existing behaviour is the baseline).
2. **Check memory first** — read the game node's `## Memory`. If this bug/decision was seen before, use that history.
3. **Make the change** — obey `arcade-build.instructions.md` (back-button href, single-file, palette, touch, a `calebArcadeData`-prefixed save key — and leave a game already on the legacy shared object where it is). Don't regress conventions to get a fix in.
4. **Review** — delegate to `game-reviewer` (own context, read-only) against the rubric, or self-review for trivial changes. On fail, fix; don't weaken the rubric.
5. **Deterministic gate** — `back-button-check` must stay green.
6. **Write back** — update the game's `docs/game-<name>.md`: append the fix/decision to its `## Memory`, update features/files if they changed. Run `game-docs-sync` if needed. The `docs-writeback` hook enforces this. If a cross-cutting decision was made, add a dated entry to `docs/decisions.memory.md`.

## Attention Anchor
On a longer change, re-state the goal + hard constraints at each step so you don't
drift into rewriting things that were fine.

## Boundaries
- One game per run. If a change is cross-cutting (touches many games), that's a
  convention change — update `knowledge/` / the instruction, and edit each
  affected game node; do NOT create a batch progress file (`docs-governance`).
- Never spawn sibling docs (`tetris-fix.md`). Edit the one node.
- Don't touch `server/`, CI, or deploy scripts.
