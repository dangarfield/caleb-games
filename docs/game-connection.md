---
color: green
isContextNode: false
agent_name: Aki
---
# Connection Game

Shape-tracing puzzle game for Caleb's Arcade. Single progressive mode with increasing difficulty.

## Gameplay

Player drags orthogonally through adjacent grid cells to trace a path matching a target sequence shown at the top. All targets are guaranteed findable via DFS validation. Wrong shape during drag triggers an immediate crash (shake + penalty). Timer constantly drains; correct answers give time bonus.

### Progression
- Single mode, starts at 3-shape targets on a 4x3 grid
- Every 25 correct answers, target length increases by 1 (max 6)
- Level-up notification: pulsing gold pill with ascending fanfare
- Timer drain rate increases with score: 0.0008 + score * 0.000012 per frame
- Time bonus per correct answer: +0.12 (~2.5s to break even)

### Grid
- Always 4x3 (12 cells)
- 4 neon shapes: triangle (cyan #00e5ff), square (green #39ff14), cross (pink #ff2d55), circle (purple #bf5af2)
- Each column starts with one shape type
- Column-collapse animation when cells are removed (match-3 style)
- New cells enter from top with easeOutBack animation

### Input
- Drag-based: pointerdown starts path, pointermove extends, pointerup completes
- Backtracking supported (drag back to previous cell)
- Each step validated against target sequence immediately
- Wrong shape = crash effect, shake, time penalty, drag cancelled
- Path auto-evaluates when it reaches target length

### Visual Features
- InfiniJump-inspired deep space gradient background with twinkling stars
- Animated target transitions (old exits up with fade, new enters from below with easeOutBack)
- Ascending C major arpeggio tones during drag (C5, E5, G5, C6, E6, G6)
- Particle explosions on correct matches
- Screen shake on wrong answers
- Score pop animation, timer flash effects (green correct, red wrong)
- Give Up button (top right) saves high score and returns to menu
- High score shown during gameplay, turns gold when beating previous best
- Floating shape demo animation on menu screen
- Tutorial on menu: example shapes with arrows showing drag mechanic

### Storage
- Shared localStorage key: `calebArcadeData.connection.highScore`

## Files

- `games/connection/index.html` — single self-contained HTML file (~1080 lines)
- `index.html` — arcade landing page card (`.card-connection`, cyan-purple-pink gradient)

[[games-index]]
