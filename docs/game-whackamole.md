---
color: green
isContextNode: false
---
# Whack-a-Mole

Tap-the-moles game with 3 mole types and 60-second rounds.

## Features
- 4x3 grid of holes with moles popping up randomly
- 3 mole types: regular (brown, +10pts), golden (gold sparkle, +25pts), bomb (dark with fuse, -15pts)
- Increasing difficulty: faster moles, shorter visibility as score increases
- Touch + mouse via pointerdown events
- Star particle bursts on hit, expanding ring on bomb, floating score text
- 60-second timer with score and best score HUD
- Custom mallet cursor via SVG data URI
- Green grass field with hole rims and grass tufts

## Bug Fixes Applied
- Fixed drawStar rendering invisible shapes (zero-area line paths -> actual star polygons)
- Fixed grass tufts only appearing on holes with active moles
- Fixed effects freeze on game end (render loop now continues until effects decay)

## Files
- games/whackamole/index.html

[[games-index]]
