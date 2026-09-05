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
- No network calls for core play (Web Audio for SFX, IndexedDB via `arcade-store.js` for saves — see Persistence).

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
- **A new game stores its saves in IndexedDB, through `arcade-store.js` — not in `localStorage`.** Copy `games/potions/js/store.js` into `games/<name>/js/arcade-store.js`, change nothing, and use it: `var Store = ArcadeStore("<gameName>")`, then `Store.ready(cb)` before the first read. It is localStorage's manners over IndexedDB — the game's items are read once at boot and every `get` after that is synchronous. Full usage in `knowledge/arcade-store.md`.
- **The keys do not change:** `calebArcadeData:<gameName>` for the game's own item (the game's object directly — do not nest it under a `<gameName>` key inside its own item), `calebArcadeData:<gameName>:<something>` for a second one. Same names, different cupboard.
- **Why:** `localStorage` is ONE quota of about 5 MB for the whole origin — not per key, not per game. In Sept 2026 it was full: a shared blob at 3.5 MB and a soundboard's base64 audio at 1.2 MB, so writes were failing for every game on the machine, silently, because `setItem` throws and most save paths catch and shrug. IndexedDB is a different cupboard on the same origin with hundreds of megabytes in it, and nothing else in the arcade is in it.
- **Two tabs.** An old tab left open on the same game saves the state IT is holding, and reloading the tab you were playing lands you on the other one's position. Any game whose save is worth keeping should stamp it with `sid` (which tab) and `gen` (a counter that only goes up) and write with `{guard: true}`; the store then refuses a stale tab inside the transaction. Recipe in `knowledge/arcade-store.md`.
- **Legacy — do not change it:** most existing games share ONE `calebArcadeData` object in localStorage with their data under `data.<gameName>`, and some newer ones have their own `calebArcadeData:<game>` item there. Both still work and stay. Never migrate a game off localStorage while fixing something unrelated; the only reason to move one is that it is the game whose saves are actually failing. When you do move one, the store imports whatever it finds under its keys in localStorage on first run and removes it from there, which also gives the shelf its space back.
- Save paths still owe the prune-ladder rules in `docs/decisions.memory.md` (2026-08-23).
- **Known gap:** the hub's ⚙ panel lists `localStorage` keys, so a store-backed game does not appear in it. It wants a second list from `ArcadeStore.list()`.

## When you finish
- The game's `docs/game-<name>.md` node MUST reflect reality (features, files, and any bug fixed appended to its `## Memory` section). This is enforced by the `docs-writeback` hook.

Full boilerplate, audio recipes, UX specs and the save wrapper: see
`knowledge/boilerplate.md`, `knowledge/audio-patterns.md`, `knowledge/ux-patterns.md`,
`knowledge/arcade-store.md`.
