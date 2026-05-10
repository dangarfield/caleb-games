---
color: green
isContextNode: false
agent_name: Amy
---
# Tilt Maze Game

Physics-based tilt maze game with 100 levels across 4 categories. CSS 3D perspective tilting, DOM-based rendering, procedural maze generation, sound effects, and confetti animations.

## Features
- **100 levels** across 4 categories: Normal, Multi-Ball, Holes, Everything
- **Level select menu**: Tabbed category picker with 5x5 level grid, completion tracking (localStorage)
- **CSS 3D perspective**: `perspective: 800px` + `rotateX`/`rotateY` on maze element for real 3D tilting
- **DOM-based rendering**: Walls, balls, holes, goal as HTML divs with CSS styling — walls have rounded caps via ::before/::after
- **Exponential drag physics**: `velocity *= pow(1-drag, elapsed)` for natural momentum — no velocity cap, drag naturally limits speed
- **Multi-ball mode**: 2-4 colored balls (red, blue, green, purple) start in corners, goal in center. All must be in goal simultaneously — balls don't freeze individually
- **Smart hole placement**: Holes placed at dead ends and corners of the maze (natural trap spots), then BFS validates all paths remain solvable
- **Sound effects**: Web Audio API synth — wall bounce (intensity-scaled), ball-in-goal chime, level complete fanfare, hole fall descending tone, game start swoosh
- **Confetti system**: Canvas particle system with physics (gravity, spin, fade). Big burst on level complete, mini burst when ball enters goal
- **Win banner**: Animated pop-in text with elastic bounce on level complete
- **Maze shake**: Screen shake animation on hole fall
- **Goal pulse**: Dashed goal ring with pulsing glow animation
- **Black holes**: Radial gradient with swirling shadow animation
- **Auto-advance**: Loads next level automatically after 1.5s, waits for joystick re-engage
- **Auto-retry**: Falling in hole resets level after 1.2s
- **Large joystick**: 100px circle with 35px travel range for fine-grained control
- **Scales to fill screen**: Maze CSS-scaled based on viewport size
- **Mobile responsive**: Flexbox layout, joystick sidebar on desktop, stacks below on mobile
- **Gyroscope support**: Device tilt on mobile (iOS permission handling)

## Level Types
- **Normal** (1-25): Single ball, top-left to bottom-right, increasing maze size (5x5 to 14x16)
- **Multi-Ball** (26-50): 2-4 balls in corners, goal in center, all must reach goal simultaneously
- **Holes** (51-75): Single ball with black holes at dead ends/corners, BFS-validated solvable
- **Everything** (76-100): Multi-ball + holes combined

## Controls
- Joystick: click/tap and drag to tilt
- Gyroscope: tilt device (auto-detected, iOS permission on first touch)
- Space: restart level
- Escape: back to level select

## Architecture
Single `index.html` file, ~750 lines. Procedural maze generation (recursive backtracking + 12% wall removal for loops). Smart hole placement at structural maze features. BFS path validation.

## Files Changed
- games/maze/index.html
- index.html (arcade hub — updated card icon and description)

### NOTES
- Maze uses recursive backtracking + random wall removal for interesting layouts with multiple paths
- Holes placed at dead ends (1 open neighbor) and corners (2 perpendicular neighbors) for strategic placement
- BFS validates all ball starts can reach goal after hole placement; removes holes until solvable
- Wall collision uses cap-rolling (ball smoothly rolls around wall endpoints)
- Gyroscope needs iOS 13+ permission request via DeviceOrientationEvent.requestPermission()

[[games-index]]
