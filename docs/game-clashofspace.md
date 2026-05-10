---
color: green
isContextNode: false
---
# Clash of Space

Twin-stick arcade shooter with escalating enemy waves, power-ups, and a retro pixel-art aesthetic.

## Features
- Twin-stick controls: left stick/WASD to move, right stick/mouse to aim and fire
- Dual virtual joysticks on touch devices (move left, aim+fire right)
- 13 enemy types: straight movers, bouncers, homing, splitters (spawn 4 on death), erratic, stealth, growing, orbiting, spawners, teleporters, swarm asteroids
- 5 power-ups: Health Pack, Slow Enemies, Fast Shot, Triple Shot, Pierce Shot (timed duration with UI bars)
- Progressive level system: kill quota per level, increasing enemy variety and difficulty
- Screen shake on hits and explosions
- Multi-layered parallax starfield background (4 canvas layers) with radial gradient and scanline overlay
- Pixel font text rendering system for all in-game text
- jsfxr-based synthesized sound effects (shoot, hit, explosion, powerup, death, level-up, UI hover/click)
- localStorage persistent stats: score, level, rounds, kills, bullets fired, power-ups collected, time played
- Mute and pause buttons
- Minimap showing enemy positions

## Technical
- 6-canvas layered rendering (4 background + main game + foreground overlay)
- Custom pixel font with full alphabet/number definitions
- jsfxr inline sound synthesis library
- requestAnimationFrame game loop with delta time

[[games-index]]
