# Game: Streams

## Concept
A grid path puzzle where you drag a single continuous line through every cell in a grid, visiting numbered waypoints in sequential order. Walls block certain moves between adjacent cells. The path must cover the entire grid without crossing itself. Based on Netflix Puzzled's "Currents". Visual style: globule/node aesthetic with flowing connections.

## Core Mechanic
Swipe/drag from cell to cell to draw a path. The path must visit numbered cells (1, 2, 3...) in order and fill every cell in the grid. Walls between cells block passage. Trace backward to undo. Tap highest number to clear entire path.

## Controls
- Touch: drag across cells to draw path (touch-first)
- Mouse: click-drag to draw path
- Tap/click on highest active number to reset path
- Trace backward along path to undo recent moves

## Visual Style
- Globule/node aesthetic — cells are round blob-like nodes
- Connected nodes show a flowing stream/current between them
- Numbered waypoints clearly marked with sequential digits
- Walls shown as solid barriers between adjacent nodes
- Dark background, glowing path (accent colors)
- Satisfying "fill" animation when path is complete

## Level Data
- Levels provided as external data (you'll supply boards later)
- Include 5-6 test boards for development (4×4 and 5×5)
- Format: grid size, numbered cell positions, wall positions

## Systems
- [x] Grid rendering (globule nodes)
- [x] Path drawing via drag
- [x] Sequential waypoint validation
- [x] Wall collision detection
- [x] Path undo (trace back)
- [x] Full-grid coverage check
- [x] Level select
- [x] Per-player profiles (Caleb/Ezra)
- [x] Hint system (show next direction)
- [x] Victory animation
- [x] Web Audio SFX

## Test Boards

### Board 1 (3×3, 2 waypoints, no walls)
```
Size: 3x3
Waypoints: 1@(0,0) 2@(2,2)
Walls: none
Solution: (0,0)(1,0)(2,0)(2,1)(2,2)(1,2)(0,2)(0,1)(1,1)
```

### Board 2 (3×3, 3 waypoints, 1 wall)
```
Size: 3x3
Waypoints: 1@(0,0) 2@(1,1) 3@(2,2)
Walls: (0,0)-(0,1) [wall between row0col0 and row1col0]
Solution: (0,0)(1,0)(2,0)(2,1)(1,1)(0,1)(0,2)(1,2)(2,2)
```

### Board 3 (4×4, 2 waypoints, 2 walls)
```
Size: 4x4
Waypoints: 1@(0,0) 2@(3,3)
Walls: (1,0)-(1,1), (2,2)-(2,3)
Solution: (0,0)(0,1)(0,2)(0,3)(1,3)(1,2)(2,2)(3,2)(3,3)(3,2) — needs validation
```

### Board 4 (4×4, 3 waypoints, no walls)
```
Size: 4x4
Waypoints: 1@(0,0) 2@(1,2) 3@(3,3)
Walls: none
```

### Board 5 (5×5, 4 waypoints, 3 walls)
```
Size: 5x5
Waypoints: 1@(0,0) 2@(2,2) 3@(4,0) 4@(4,4)
Walls: (0,1)-(1,1), (2,3)-(3,3), (3,1)-(3,2)
```

## Conventions
- [x] Single self-contained games/streams/index.html
- [x] Canvas 2D, dark-theme palette, touch-action:none
- [x] Back button href = ../../index.html
- [x] calebArcadeData localStorage
- [x] Viewport meta with user-scalable=no

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Touch-first: full gameplay on tablet with drag
- [ ] Path must visit numbered cells in order
- [ ] Path must fill entire grid
- [ ] Walls block movement correctly
- [ ] Undo by tracing backward
- [ ] Hint system works
- [ ] Level select + player profiles
- [ ] Card added to root index.html
- [ ] docs/game-streams.md created
- [ ] games-index.md updated
