---
color: green
isContextNode: false
---
# CyberStream

Swipe-only lane runner. Switch between 3 color-coded lanes to match incoming gates.

## Features
- Swipe up/down to switch between 3 fixed-colour lanes
- Lane determines your colour (Diamond/Red, Hex/Blue, Tri/Green)
- Match incoming gate colours to score
- Difficulty ramps gently: `elapsed/4000`, max difficulty 4

## Simplification
Originally had more complex mechanics that were stripped for kid-friendliness:
- Removed SHIFT button and manual shape cycling
- Removed lane scramble mechanic and 4-lane mode
- Removed space key handler
- Slowed difficulty ramp, raised minimum spawn interval

## Files
- games/cyberstream/index.html

[[games-index]]
