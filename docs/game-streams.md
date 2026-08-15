# Streams

Grid path puzzle game. Drag a single continuous path through every cell in a grid, visiting numbered waypoints in sequential order. Walls between cells block passage. Based on Netflix Puzzled's "Currents".

## Features

- Globule/node visual style with flowing blue-cyan gradient path
- Drag to draw path, trace backward to undo
- Numbered waypoints must be visited in sequence
- Walls between cells block movement
- Hint system (highlights next valid move)
- Per-player profiles (Caleb/Ezra) with level progress
- Level select screen
- Web Audio SFX (move, waypoint reached, win, undo)
- 5 test levels (4×4 to 6×6), designed for external level data

## Key Design Decisions

- Single index.html with all logic inline (simple grid puzzle, no build step needed)
- Canvas 2D rendering — grid cells, globule path, walls, waypoints all drawn per frame
- Path is visually thick rounded blobs connected by wide strokes (globule aesthetic)
- Waypoint validation: a waypoint is "reached" only if all lower-numbered waypoints appear earlier in the path
- Level data is a simple array of objects — easy to extend with more boards later

## Memory
