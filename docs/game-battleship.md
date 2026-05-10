---
color: green
isContextNode: false
---
# Battleship

Full Battleship game with salvo-based firing and cinematic animation view.

## Features
- **Mode select:** vs AI or local 2-player pass-and-play
- **Ship placement:** 5 ships (Carrier 5, Battleship 4, Cruiser 3, Sub 3, Destroyer 2), tap to place with rotate button, auto-place option
- **Salvo firing:** Select up to 5 targets per turn on the enemy grid
- **Cinematic firing view:** Full-screen ocean scene with projectile arcs, hit explosions (fire + sparks + smoke), miss splashes (water droplets + ripples), summary overlay
- **AI opponent:** Hunt-mode targeting (follows up on hits with adjacent cells)
- **Local multiplayer:** Handoff screens between turns to hide boards

## Architecture
Two canvases: `boardCanvas` (dual 10x10 grids) and `firingCanvas` (fullscreen cinematic overlay). Game phases: mode -> place -> select -> firing -> (handoff) -> repeat.

## Files
- games/battleship/index.html

[[games-index]]
