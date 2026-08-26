---
applyTo: "games/**"
description: "Non-negotiable build conventions for every Garfield Boys' Arcade game"
---

# Arcade Build Conventions

Mechanical, non-negotiable rules for any file under `games/`. These are MUST rules —
the *how-to-think* detail (boilerplate, audio recipes, UX patterns) lives in
`knowledge/` and is read just-in-time. Keep this file short.

## Structure
- One self-contained `games/<name>/index.html` is the default. Multi-file is allowed only when it genuinely helps; keep it inside `games/<name>/`.
- Canvas 2D for rendering. No frameworks, no build step, no external runtime dependencies.
- No network calls for core play (Web Audio for SFX, `localStorage` for saves).

## Touch & viewport
- Touch-first: `touch-action: none`, pointer events, large tap targets.
- Viewport meta with `user-scalable=no`.

## The back button (most-repeated bug — get it right)
- Every game MUST have a back button whose href is exactly `../../index.html`.
- NOT `../../`, NOT `/`. GitHub Pages 404s the trailing-slash form in production even though it works on localhost.

## Visual identity
- Dark theme, base background `#0a0a2e` (gradient `#0a0a2e → #141452 → #1a1a6e`).
- Palette: accent `#6c5ce7`, glow `#a29bfe`, subtitle `#a0c4ff`, score/gold `#ffd32a`, danger `#e74c3c`.
- HUD as a canvas-drawn pill, top-centre. Game-over screen canvas-drawn (not HTML).

## Persistence
- **A new game gets its OWN localStorage item, and its key MUST START with `calebArcadeData`:** `calebArcadeData:<gameName>` (JSON), where `<gameName>` is the game's folder name — e.g. `calebArcadeData:roadways`. The prefix is the convention: the hub's ⚙ panel lists keys alphabetically, so every `calebArcadeData:*` item clusters with the shared blob, each with its own size and Clear button. Store the game's own object directly — do not nest it under a `<gameName>` key inside its own item.
- **Legacy — do not change it:** most existing games share ONE `calebArcadeData` object with their data under `data.<gameName>`. That still works and stays. Never migrate a game off it, and never switch a game's storage while fixing something unrelated; the only reason to move one is that it is the game whose saves are actually failing.
- Why the split: `localStorage` is ONE ~5 MB quota for the whole origin. A single shared object means every save rewrites all 60+ games' data at once, so one big game wedges the whole arcade and a write can fail for reasons that have nothing to do with the game doing it. Separate items keep both a failure and a "clear this" local to one game. Save paths still owe the prune-ladder rules in `docs/decisions.memory.md` (2026-08-23).

## When you finish
- The game's `docs/game-<name>.md` node MUST reflect reality (features, files, and any bug fixed appended to its `## Memory` section). This is enforced by the `docs-writeback` hook.

Full boilerplate, audio recipes, and UX specs: see `knowledge/boilerplate.md`,
`knowledge/audio-patterns.md`, `knowledge/ux-patterns.md`.
