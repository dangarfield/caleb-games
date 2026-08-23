# Traffic Jam

A sliding-block logic puzzle (Rush Hour style). Cars and trucks sit on a 6×6
grid; each vehicle slides only along its own axis and cannot pass through
another vehicle. Clear a path so the special red car can slide out through the
exit gate on the right wall. Fills the sliding-block / Rush Hour gap in the
catalogue. Pitched at the younger Garfield boy (~6): light strategy, one clear
goal, gentle 12-level ramp, no fail state, unlimited undo.

## Features

- 6×6 grid, drag-to-slide vehicles (horizontal cars move left/right, vertical
  cars move up/down); snap to nearest legal cell, blocked by walls + other cars.
- Red star car must reach the green exit gate on the right edge of row 3.
- 12 built-in levels, hand-generated and BFS-verified solvable, ramping from
  2-move to 9-move minimum solutions.
- Move counter + per-level best (fewest moves), plus the theoretical minimum
  shown on the win screen.
- Unlimited **Undo**, **Reset**, and a **Hint** that runs a live BFS solver and
  highlights the next optimal move — so a hint can never mislead.
- Per-player profiles (Caleb / Ezra) with separate best-move records.
- Level select grid showing solved levels (green) with their best move count.
- No fail state / no timer — forgiving by design for a younger player.
- Canvas HUD pill (level · moves · best), canvas win screen with confetti,
  Web Audio SFX (slide, bump, win, select).
- Keyboard fallback for desktop dev (Tab to cycle selection, arrow keys nudge).

## File structure

- `index.html` — the whole game (Canvas 2D, single file, no build step). Level
  data is embedded inline (no `fetch`, so it can't hit the trailing-slash 404
  that bit Stars/Streams). Contains the vehicle model, drag-slide interaction
  with collision, the BFS solver powering the hint, HUD, win screen, level
  select, player profiles, and SFX.

## Key design decisions

- **Levels embedded inline, not fetched.** Avoids the documented `games/<name>`
  vs `games/<name>/` trailing-slash 404 that made Stars/Streams fall back to a
  single tutorial. The card href is still set to `games/traffic-jam/` for
  consistency, but nothing depends on it.
- **Hint via live BFS**, not a stored solution. Every level is small enough that
  a breadth-first search from the current position returns the optimal next move
  instantly, so the hint always reflects the actual board state (including after
  the player has made suboptimal moves) and can never point to a dead end.
- **Red car fixed to row 3 (0-indexed row 2)** with the exit gate on that row —
  the classic Rush Hour convention, keeps the goal unambiguous for a 6-year-old.
- **No fail state.** There is no timer and no losing; the only feedback is the
  move counter and best score, keeping it low-pressure.
- **Difficulty curve** deliberately gentle: minimum-move solutions 2,2,3,3,4,4,
  5,5,6,7,8,9 across the 12 levels.

## Memory

- Built via the `new-game` recipe. All 12 embedded levels were generated and
  double-verified solvable — once by the Python authoring solver, once by the
  in-game JS BFS solver — with matching minimum-move counts before ship.
