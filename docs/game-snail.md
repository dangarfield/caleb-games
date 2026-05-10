---
color: green
isContextNode: false
---
# Snail

Hold-to-stretch snail game with falling blocks. Matched Fling game's visual style.

## Core Mechanic
- **Hold** (touch/mouse/space): Snail head stretches forward
- **Release**: Tail snaps forward to catch up
- **Danger**: Falling blocks that land on exposed stretched body = game over
- Auto-scrolling world; if tail falls off screen, game over

## Features
- Stretch indicator changes color (green -> yellow -> red) based on danger
- Bonus points for risky long stretches
- Warning indicators on ground where blocks will land
- Difficulty ramps: faster scroll, faster blocks, shorter spawn intervals
- 20 themed levels from "Twilight Meadow" to "Cosmic End"
- Screen shake + red flash on death
- 5 Web Audio SFX: stretch, snap, crash, coin, victory
- localStorage high score via `calebArcadeData.snail`

## Files
- games/snail/index.html

[[games-index]]
