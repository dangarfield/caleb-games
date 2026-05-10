---
color: green
isContextNode: false
---
# Bomberman

Grid-based bomb game with AI enemies, power-ups, and 10 levels.

## Features
- 15x13 grid with indestructible walls and random destructible bricks
- Bombs with 3s timer, cross-pattern explosions, chain reactions
- 3+ AI enemies per level with random wandering
- Power-ups from destroyed bricks (30%): Blast+, Bombs+, Speed+
- 3 lives with invincibility frames
- 10 levels with increasing enemy count and brick density
- Touch d-pad + bomb button, keyboard arrows + space

## Bug Fixes Applied
- Fixed broken wall-sliding movement logic
- Removed bomb collision for player (can walk through own bombs)
- Added walking-into-explosion damage (was only checked at detonation)
- Added grid alignment nudging for smooth corridor entry on touch controls

## Files
- games/bomberman/index.html

[[games-index]]
