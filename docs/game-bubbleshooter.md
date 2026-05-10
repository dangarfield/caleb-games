---
color: green
isContextNode: false
---
# Bubble Shooter

Aim-and-shoot bubble matching game with hexagonal grid.

## Features
- Offset hex grid layout (even rows 11 cols, odd 10)
- Tap/click to aim, dotted aim line with wall bounce preview
- Match-3+ BFS flood fill popping with particle animations
- Disconnected cluster falling (BFS from ceiling row)
- 8 shiny sphere bubble colors drawn as radial gradient
- Score tracking, game over when bubbles reach danger line
- Only spawns colors present in grid
- Touch + mouse controls

## Bug Fix
Fixed `findSlot()` overwrite bug — could place a new bubble on top of an existing one. Added occupancy check to skip filled positions.

## Files
- games/bubbleshooter/index.html

[[games-index]]
