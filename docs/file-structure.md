---
color: blue
isContextNode: false
---
# Vault File Structure Rules

Rules governing how voicetree nodes in this vault are created, organized, and maintained. All agents must follow these conventions.

## Graph Structure

```
plan.md                  — Root: project overview, architecture, principles
├── file-structure.md    — THIS FILE: node governance rules
├── new-game-guide.md    — Style guide, conventions, cross-cutting standards
├── deployment.md        — Local dev, GitHub Pages, Express server
└── games-index.md       — Master list of all games
    ├── game-<name>.md   — One file per game (detailed docs)
    └── game-simple.md   — Games without detailed docs
```

## Rules

### 1. One node per game, always under games-index

Every game gets exactly one `game-<name>.md` file. It is a child of `games-index.md` (linked via `[[game-<name>]]` in games-index). New games must add their node here — never as a child of plan.md or floating as an orphan.

### 2. Update existing nodes — don't create new ones

When working on a game (bug fixes, improvements, new features, polish), **edit the existing `game-<name>.md`** directly. Do NOT create new nodes like:
- "Phase 2 improvements for Snake"
- "General improvements across games"
- "Bug fixes round 3"
- "task_fix_drift_controls"

These sprawl the vault. The game's node is the single source of truth for that game.

### 3. Cross-cutting changes go in new-game-guide.md

If improvements apply across multiple games (new CSS convention, updated boilerplate, shared audio pattern, standardized HUD), update `new-game-guide.md`. Do not create a separate node for cross-game work.

### 4. Subagents working on multiple games

When a single invocation/agent is tasked with improving several games at once, it should:
- Edit each relevant `game-<name>.md` with what changed
- Update `new-game-guide.md` if any conventions were established
- Create ONE progress node summarizing the batch of work (not one node per game)

### 5. No task/assignment nodes

Task metadata (agent assignments, status tracking) does not belong in the vault. The vault is documentation, not a task board. Progress nodes from `create_graph` are fine — they document completed work and attach to the task node automatically.

### 6. When to create a new node

A new node is justified only when:
- A **new game** is added (game-<name>.md under games-index)
- A **new structural concern** arises that doesn't fit existing nodes (rare)
- A **progress node** documents completed work via create_graph

A new node is NOT justified for:
- Improvements to an existing game (edit game-<name>.md)
- Batch work across games (one progress node + edit each game doc)
- Deployment/infrastructure changes (edit deployment.md)
- Style/convention changes (edit new-game-guide.md)

### 7. Naming conventions

- Game docs: `game-<directory-name>.md` (matches `games/<name>/`)
- Structural docs: descriptive lowercase with hyphens
- No `task_` prefix, no date suffixes, no `_v2` variants

[[plan]]
