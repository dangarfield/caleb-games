---
color: green
isContextNode: false
---
# Tron

Classic Tron lightcycle game against an AI opponent with neon glow visuals and round-based scoring.

## Features
- Player vs CPU on a 25x25 grid, avoid crashing into walls, trails, or opponent
- Best-of-5 rounds (first to 3 wins)
- AI uses flood-fill lookahead, center preference, wall avoidance, and aggression scaling with difficulty
- Speed increases each round (base 6 cells/sec + 0.5 per round)
- Smooth interpolated movement between grid cells (eased lerp)
- Neon glow trails with bright white inner core, glowing cycle heads
- Crash particle explosions (40 particles per crash)
- Countdown timer (3-2-1-GO!) before each round
- Swipe gestures (20px threshold) + tap screen quadrants + Arrow keys / WASD
- Continuous engine hum audio that changes pitch with speed
- Synthesized sound effects: turn clicks, countdown ticks, crash noise, win/lose fanfares
- localStorage total wins tracking (via shared calebArcadeData)

## Technical
- Canvas 2D rendering with responsive full-viewport grid sizing
- Web Audio API with oscillator-based tones, frequency sweeps, and white noise
- requestAnimationFrame with delta-time update loop
- Flood-fill-based AI with configurable lookahead depth

[[games-index]]
