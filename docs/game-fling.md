---
color: green
isContextNode: false
---
# Fling!

Wave-based action game where creatures walk along a sine wave and you fling them into the ceiling to score.

## Features
- Composite sine wave with 3 layers, drifting frequencies, and amplitude modulation
- Tap, click, or press Space to shake the wave and fling all creatures airborne
- Fling power depends on creature's wave position (peak = strongest launch)
- Three creature types: normal, fast (wave 3+), and heavy (wave 5+) with different speeds, sizes, and HP
- 3 lives; creatures reaching the left edge cost a life
- Waves of increasing creature count and spawn rate (up to 40 per wave)
- 10 color themes that cycle per wave with smooth tweening transitions
- Ceiling-hit scoring with particle bursts; wave announcements
- Screen shake and red flash on life loss
- Synthesized SFX: fling whoosh, bounce, ceiling chime, fall, game over, high score fanfare, next wave
- localStorage high score (shared calebArcadeData)

## Technical
- Canvas 2D rendering with multi-layer gradient background
- Screen-size-independent fling physics (scaled by reference height)
- Web Audio API with bandpass-filtered noise for shaped sound effects
- requestAnimationFrame with delta-time scaling

[[games-index]]
