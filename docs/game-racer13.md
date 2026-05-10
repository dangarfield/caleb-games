---
color: green
isContextNode: false
---
# Racer 13

Psychedelic WebGL lane racer ported from js13kGames "SUB13". Collect speed boosts but stay under speed 13.

## Features
- WebGL2 3D racing
- Speed boost collection mechanic with speed limit of 13
- Red screen flash with big "13!" text when exceeding limit
- Kid-friendly rewritten text (intro and outro)
- Inline SVG wipeout-style ship icon on landing page

## Source
Ported from `js13kGames/sub13` — 16 JS source files + CSS concatenated into a single 3,358-line `index.html`.

## Notes
- Uses WebGL2 context — won't work on very old browsers
- Body has `pointer-events:none` globally for touch handling; back button needs explicit `pointer-events:auto` override

## Files
- games/racer13/index.html

[[games-index]]
