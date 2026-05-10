---
color: green
isContextNode: false
---
# Tower of Hanoi

Disc-stacking puzzle with 10 difficulty levels, 3-4 tower variants, drag-and-drop, and undo.

## Features
- 10 difficulty levels from "Easy Peasy" (2 discs, 3 towers) to "Grandmaster" (7 discs, 3 towers)
- 4-tower support with Frame-Stewart algorithm for optimal move counts
- Drag-and-drop touch controls (10px threshold differentiates tap vs drag)
- Tap-to-select fallback (both input methods work)
- Undo button with full move history
- Menu button returns to level select
- Smooth 3-phase arc animation (up, across, down) with easing
- Canvas HUD pill with moves counter, minimum moves, and timer
- Per-level best scores in localStorage under `calebArcadeData.hanoi.l0` through `l9`
- Rainbow gradient discs with shadows and shine
- Web Audio SFX: pickup, place, invalid move, win fanfare
- Win screen with confetti and perfect detection

## Difficulty Levels
| # | Name | Discs | Towers | Min Moves |
|---|------|-------|--------|----------|
| 1 | Easy Peasy | 2 | 3 | 3 |
| 2 | Warm Up | 3 | 4 | 5 |
| 3 | Novice | 3 | 3 | 7 |
| 4 | Thinker | 4 | 4 | 9 |
| 5 | Puzzler | 5 | 4 | 13 |
| 6 | Tricky | 4 | 3 | 15 |
| 7 | Brain Teaser | 6 | 4 | 17 |
| 8 | Hard | 5 | 3 | 31 |
| 9 | Expert | 6 | 3 | 63 |
| 10 | Grandmaster | 7 | 3 | 127 |

## Files
- games/hanoi/index.html

[[games-index]]
