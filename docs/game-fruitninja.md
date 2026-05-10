---
color: green
isContextNode: false
---
# Fruit Ninja

Swipe-to-slice fruit game with physics-based launching and combo scoring.

## Features
- 6 fruit types: watermelon, orange, apple, lemon, blueberry, kiwi — each with unique gradients and seed details
- Physics-based fruit arcs with gravity
- Slice detection via line-circle intersection (quadratic discriminant)
- Fruit halves split animation with visible inner flesh and seeds
- Bombs (~12% spawn rate) — game over on slice
- 3 lives, lose one per missed fruit
- Combo system: multi-fruit slices within 45 frames trigger multiplier
- Juice particle bursts, slice trail with glow
- Difficulty scales with score: faster spawns, more fruits per burst

## Bug Fixes Applied
- Fixed flickering seeds (was using Math.random in draw — replaced with deterministic offsets)
- Fixed division-by-zero in slice detection when touch points are identical
- Increased combo window from 30 to 45 frames
- Added floating red "X" visual feedback on missed fruits

## Files
- games/fruitninja/index.html

[[games-index]]
