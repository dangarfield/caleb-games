---
color: green
isContextNode: false
---
# InfiniJump

Endless vertical platformer where you jump between nodes while dodging spinning barriers.

## Features
- Tap, click, or press Space to jump to the next node
- Spinning barrier arms around each node; timing jumps to avoid them is core gameplay
- Barriers increase: 1-2 bars early, up to 3 (level 10+) and 4 (level 20+)
- 10 named visual themes cycling every 10 levels (Deep Space, Nebula, Solar Flare, etc.) with smooth color transitions
- Slow Time power-up: earned each level, activated via on-screen clock button to slow barriers
- Level progression with per-level score targets (starting at 5, +1 per level)
- Demo/auto-play mode on the menu screen
- 120 twinkling background stars
- Particle effects on jumps and death; screen shake on collision
- Animated death sequence showing the fatal jump hitting a barrier
- Synthesized SFX: jump, death, score, level-up fanfare, slow time activate/end
- localStorage high score (shared calebArcadeData)

## Technical
- Canvas 2D rendering with segment-intersection collision detection
- Web Audio API synthesized sound effects
- requestAnimationFrame loop with color-lerping theme transitions
- Responsive full-screen canvas

[[games-index]]
f