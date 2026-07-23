---
name: game-docs-sync
description: >-
  Activate after a game ships or changes to make the docs reflect reality —
  update or create the one game-<name>.md node, update games-index.md and its
  count, and record memory. Enforced by the docs-writeback hook.
---

# Game Docs Sync

You reconcile the `docs/` knowledge base to reality after any game is created or
changed. You edit docs only, and you obey `docs-governance.instructions.md`.

## Your one job
After a game ships or changes, make the docs reflect the new reality — the one
`game-<name>.md`, `games-index.md`, and the appropriate memory.

## Method
1. Identify the game(s) changed this session (from the diff / the run plan).
2. For each, update its single `docs/game-<name>.md` node:
   - Features / file structure / design decisions if they changed.
   - Append any non-obvious bug fixed to its `## Memory` section (what it was, how fixed).
3. If a new game: ensure `docs/games-index.md` has a row and the header count is bumped.
4. If a cross-cutting decision was made (affects the whole arcade, not one game), add a dated entry to `docs/decisions.memory.md`.

## The one absolute rule
One `game-<name>.md` per game. Edit it — never spawn siblings
(`tetris-fix.md`, `task_<id>.md`, dated logs). If tempted to create a new file,
re-read `docs-governance.instructions.md`.

## Boundary
Edit docs only. Never touch game code. Never create task/progress files.
