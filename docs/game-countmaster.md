---
color: green
isContextNode: false
---
# Count Masters

3D crowd-running game where you steer a growing army through gates and clash with enemies.

## Features
- Three.js 3D scene with perspective camera, shadows, and distance fog
- Drag left/right to steer your crowd along a track
- Math gates with +, -, x, and / operations that grow or shrink your crowd
- Enemy groups to battle — 1-for-1 elimination with animated combat
- Multiple hand-crafted levels with escalating difficulty (5+ levels with multi-phase gate/enemy sequences)
- Level progression with score tracking and continue support
- Synthesized SFX: good gate chime, bad gate buzz, multiply sparkle, battle hits, battle start rumble, victory fanfare, fail, level clear
- localStorage high score and level progress (shared calebArcadeData)

## Technical
- Three.js (v0.160.0) via ES module import map
- WebGLRenderer with PCFSoftShadowMap shadows
- Capsule geometry crowd members with Lambert materials
- Web Audio API synthesized sound effects

[[games-index]]
