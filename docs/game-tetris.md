---
color: green
isContextNode: false
---
# Tetris

Classic Tetris with SRS rotation, ghost piece, and line clear animations.

## Features
- SRS (Super Rotation System) piece rotation
- Ghost piece preview
- Next piece display
- Line clear animations
- Score and level tracking with increasing speed
- Touch controls: swipe left/right to move, swipe down for soft drop, tap to rotate
- Keyboard: arrow keys

## Bug Fixes (9 total)
1. I-piece rotation pivot wrong (1.5,0.5 -> 1.5,1.5)
2. I-piece shape defined in wrong row
3. clearLines splice logic fragile
4. spawnPiece called during line clear animation
5. lastTime never reset on restart (huge dt on first frame)
6. Double-start on touch devices (click+touchend both firing)
7. Shared object reference between currentPiece and nextPiece
8. Missing null guard for currentPiece during line clears
9. textAlign not reset in drawPanel

## Files
- games/tetris/index.html

[[games-index]]
