# Arcade Context — read this first

The map into this repo's knowledge base. Read this before working, then jump
straight to what's relevant — you never need to crawl all of `docs/`.

## Where things live
- **Working on a specific game?** → read that game's `docs/game-<name>.md` (its features, files, design decisions, and `## Memory` = bug/decision history). That one node is the whole story for that game.
- **Build conventions?** → `knowledge/boilerplate.md`, `knowledge/audio-patterns.md`, `knowledge/ux-patterns.md`. The MUST rules are in `.apm/instructions/arcade-build.instructions.md` (auto-loaded when you touch `games/**`).
- **Doc-vault rules?** → `.apm/instructions/docs-governance.instructions.md` (one node per game, edit-don't-create).
- **Cross-cutting decisions & gotchas (whole arcade)?** → `docs/decisions.memory.md`.
- **The catalogue?** → `docs/games-index.md`.
- **Deployment / dev quirks?** → `docs/deployment.md`.
- **Adding a new game?** → the `new-game` skill orchestrates it (`.apm/skills/new-game/`).

## The two-level memory model
- **Per-game** decisions/bugs → the `## Memory` section inside that `game-<name>.md`.
- **Cross-cutting** decisions (affect the whole arcade) → `docs/decisions.memory.md`.

## Amending an existing game (the cheap path)
Read this map → the one `game-<name>.md` → the one game file. Only that game's
scoped rules load. You do not touch the other 54 games.

## Canonical facts
- Branding: "Garfield Boys' Arcade" (the home page `index.html` title is canonical; `plan.md` still says "Caleb's Arcade" — stale).
- Games live at `games/<name>/index.html`, served static.
