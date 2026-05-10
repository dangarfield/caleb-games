---
color: green
isContextNode: false
---
# Petri

Agar.io-style cell growth game set in a petri dish, with 10 themed levels and diverse enemy cell types.

## Features
- Eat cells smaller than you to grow; avoid larger predators
- 8 cell types: nutrients, passive, fleeing, hunters (chase you), swarm (pack attack), splitters (multiply), toxic (spikes, don't touch), predators (large, relentless)
- 10 levels from "Primordial Soup" to "The Abyss", each with unique color scheme, world radius, target mass, and enemy mix
- Boost button (touch/keyboard) for speed burst that drains energy
- Biological visual style: wobbling cell membranes, nuclei, organelles, spikes on toxic cells
- Absorb particles, background floating particles with twinkle effect
- Ambient drone audio, danger pulse when threatened, absorb/death/level-up sound effects (Web Audio API)
- localStorage high score (via shared calebArcadeData)
- Mouse, touch, or WASD movement controls
- Demo mode with AI-controlled player on menu screen
- Spatial hash grid for efficient collision detection

## Technical
- Canvas 2D rendering with camera zoom that scales to player size
- Circular world boundary per level
- requestAnimationFrame game loop

[[games-index]]
