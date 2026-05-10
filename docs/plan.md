---
color: blue
isContextNode: false
---
# Caleb's Arcade

A browser-based game arcade for my son Caleb. Many games, all touch-optimized for tablet play, served as a static site.

## Purpose

Create a collection of high-quality games playable through a browser on Caleb's tablet. Every game is a standalone HTML/CSS/JS file using Canvas 2D — no build tools, no frameworks, no external dependencies.

## Architecture

```
/index.html              — Landing page with game cards grid
/games/<name>/index.html — Each game, self-contained
/server/index.js         — Express server (optional, for RPS AI icons)
/package.json            — npm start runs serve on port 5000
```

## Core Principles

- **Single-file games** — all HTML/CSS/JS in one `index.html`. Ideally keep it one file, otherwise break it into multiple js files should that make more sense
- **Canvas 2D** for all rendering (no DOM game elements)
- **Touch-first** — `touch-action: none`, pointer events, large tap targets
- **No external dependencies** — Web Audio for SFX, localStorage for saves
- **Consistent UI** — dark theme, frosted-glass back button, gradient buttons

[[file-structure]]
[[new-game-guide]]
[[deployment]]
[[games-index]]
