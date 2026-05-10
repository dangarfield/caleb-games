---
color: green
isContextNode: false
---
# Endless Runner

Space-themed robot character dodges rocks, cacti, and birds with double jump and ducking.

## Features
- Animated robot with glowing eyes, antenna, jetpack flames on jump
- Obstacles: rocks (polygon), cacti (with arms), birds (animated wings)
- Double jump with jetpack flames, ducking to avoid birds
- 3-layer parallax scrolling, twinkling stars
- Speed ramps from 5 to 14 over time
- Landing particles, crash explosion, particle trail
- Score = distance, localStorage high score
- 800x400 internal resolution, CSS-scaled to viewport

## Bug Fixes Applied
- Fixed player drawn below ground (y initialized to ground line instead of ground minus height)
- Fixed birds too low to duck under (raised spawn height by 10px)
- Fixed mid-air ducking teleporting hitbox to ground level (disabled ducking when airborne)

## Notes
- Coordinate system uses y=0 at top; player.y is the TOP of the sprite
- Collision uses slightly shrunken hitboxes for fair gameplay feel

## Files
- games/runner/index.html

[[games-index]]
