---
paths:
  - "docs/**"
---

# Docs Governance

Rules for the `docs/` knowledge base — the project's traversable KB. Think of
`docs/` as the longest-running pull-request description: every change should
leave it readable to the next agent who walks in cold.

## The one absolute rule
**One `game-<name>.md` per game. Always. Edit it, never spawn siblings.**
Fix a bug in Tetris → edit `game-tetris.md`. Add a level editor to Archers →
append a section to `game-archers.md`. Never create `tetris-bug-fix.md`,
`archers-round-3.md`, `task_<id>.md`, or any dated work-log file.

## What a game node contains
- One-paragraph what-is-it.
- Features — what the game does, the systems it has.
- File structure — if multi-file, list each with a one-line description.
- Key design decisions — the things you'd regret forgetting.
- `## Memory` — running list of non-obvious bugs caught + how fixed, and any per-game decisions (this is the per-game memory; see the memory model below).
  - NEW game docs use the heading `## Memory`. EXISTING docs already carry a bug-history section under varied headings (`## Bug Fixes`, `## Bug Fixes Applied`, etc.) — those ARE the per-game memory; leave them as-is (do not churn/rename). When you next materially edit such a doc you may rename its heading to `## Memory`, but never do a bulk rename pass.

What does NOT belong in a node: task IDs, agent assignments, TODO lists,
progress tracking, dated work logs. The vault is documentation, not a journal.

## Where things go (don't create a new file for these)
- A per-game bug/decision → the `## Memory` section of that `game-<name>.md`.
- A cross-cutting decision (affects the whole arcade) → `docs/decisions.memory.md` (dated entry).
- A cross-game convention (CSS, audio, HUD) → `knowledge/` + the `arcade-build` instruction.
- A deployment/dev quirk → `docs/deployment.md`.
- The read-first map into the KB → `docs/arcade.context.md`.

A new top-level `docs/` file is justified only for a genuinely new structural
concern (rare) or a new game (then it's `game-<name>.md`).

## The memory model (two levels)
- **Per-game (specific):** the `## Memory` section inside each `game-<name>.md`. Does not pollute other games' context.
- **Cross-cutting (shared):** `docs/decisions.memory.md` — dated, arcade-wide decisions and gotchas. Reviewed periodically.

## Naming & format
- Game docs: `game-<directory-name>.md` where possible. Tolerate existing mismatches (`game-tower-defense.md` ↔ `games/towerdefense/`); don't create new ones; don't rename old ones (breaks inbound links).
- No YAML frontmatter and no `[[wikilinks]]` on new docs (legacy Voicetree artifacts — leave on old files, don't add to new).
- Lowercase-with-hyphens filenames. No `task_` prefix, no date stamps, no `_v2`.
- Terse, factual voice: present tense for current state, past tense for bug fixes.
