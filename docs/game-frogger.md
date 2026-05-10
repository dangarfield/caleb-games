---
color: green
isContextNode: false
---
# Frogger

Classic frog road-and-river crossing game with pixel-art style and progressive difficulty.

## Features
- 13x15 grid with 5 road lanes (cars and trucks) and 5 river lanes (logs and turtles)
- Turtles periodically dive underwater, creating timed hazards
- 5 home spots to fill per level; filling all advances to the next level
- 30-second timer per life
- Swipe (touch) and arrow key controls
- Speed and vehicle count scale with level progression
- 3 lives; death by car, drowning, or timer expiry
- Colored vehicles: yellow, blue, red, green cars and red, purple, orange trucks
- Synthesized SFX: hop sweep, squish noise, bubble drown, goal chime, level complete fanfare, all-goals arpeggio, game over
- localStorage high score (shared calebArcadeData)

## Technical
- Canvas 2D rendering with responsive cell sizing (adapts to screen)
- Pixel-art image rendering mode (image-rendering: pixelated)
- Web Audio API with LFO-modulated oscillator for bubble/drown effect
- Input queue system for buffered movement

[[games-index]]
