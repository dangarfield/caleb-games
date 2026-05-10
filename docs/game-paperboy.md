---
color: green
isContextNode: false
---
# Paperboy 3D

3D newspaper delivery game built with Three.js where you ride a bicycle down suburban streets, throwing papers to subscriber mailboxes while dodging obstacles.

## Features
- Full 3D environment with Three.js: houses, trees, fences, mailboxes, street lamps
- 5 house types (Yellow, Blue Roof, Gray, Large Yellow, Stained Glass) with subscriber/non-subscriber distinction
- Throw newspapers left (Q), right (E), or auto-aim nearest (Space); touch tap left/right side
- Steer with Arrow keys / WASD
- Obstacles: pedestrians, cars, dogs, trash cans, brick walls, rolling tires, puddles
- Training course section at end of each street with ramps, targets, water hazards, red wall barriers
- Street progress bar, lives (3 hearts), limited paper supply (15)
- Street summary screen showing deliveries hit/missed
- Multiple streets with increasing difficulty
- Web Audio API synthesized sound effects (throw whoosh, delivery ding, crash, window break, level complete jingle)

## Technical
- Three.js r128 with PerspectiveCamera, shadow maps (PCFSoft), fog
- Reusable MeshStandardMaterial pool for all objects
- Animated bike rider with pedaling legs and spinning wheels
- Responsive resize handling

[[games-index]]
