---
color: green
isContextNode: false
---
# Conquer

Hex-based territory conquest game with campaign and quick play modes.

## Features
- Hex grid map with organic procedural shapes (elliptical trim + seeded noise, flood-fill connectivity)
- Campaign mode with 127 levels on an 8-ring hex overworld map
- Quick Play with configurable players (2-5), map size (small/medium/large/mega), and difficulty (easy/normal/hard)
- Turn-based: select your cell, tap adjacent enemy or neutral cell to attack; all troops minus 1 charge
- Multiple attacks per turn, then end turn; each turn your cells gain +1 troop
- Career mechanics: fog of war, double reinforce, slow start, fortified neutrals, shrinking map
- AI opponents with difficulty-scaled behavior
- HUD shows per-player cell count and total troops
- Particle effects on attacks and captures
- Synthesized SFX: select, attack, capture, fail, victory, defeat, reinforce
- localStorage campaign progress and win tracking (shared calebArcadeData)

## Technical
- Canvas 2D rendering with hex math (pointy-top hexagons)
- Web Audio API synthesized sound effects
- requestAnimationFrame animation loop with troop-march animations

[[games-index]]
