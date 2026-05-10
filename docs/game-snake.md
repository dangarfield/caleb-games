---
color: green
isContextNode: false
---
# Snake

Classic snake game with gradient coloring, particle effects, and responsive canvas.

## Features
- 20x20 grid, responsive canvas (max 420px)
- Gradient green-to-teal snake with rounded segments, directional eyes on head
- Red pulsing food with glow effect
- Particle explosions on food eat and death
- Speed starts at 140ms, decreases by 3ms per food (min 60ms)
- Swipe touch (15px threshold) + arrow keys + WASD
- localStorage best score

## Bug Fix
Fixed critical crash where `snake` was `undefined` when `draw()` first executed, killing the requestAnimationFrame render loop permanently. Fixed by initializing all game state variables with safe defaults at declaration.

## Files
- games/snake/index.html

[[games-index]]
