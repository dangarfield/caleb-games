---
color: green
isContextNode: false
---
# Bottle Sort

A liquid sort puzzle game where players sort colored liquids into bottles so each bottle contains only one color. Features 50 hand-crafted levels plus procedural generation, 5 visual themes, 10 gameplay mechanics, a tilt-pour bottle animation, drag-and-drop interaction, and a landscape-optimized level select screen with star ratings and progress tracking.

## Features
- Glass-like bottle rendering with rounded bodies, neck openings, and internal shine highlights
- 12 bright, distinct liquid colors with gradient highlights per layer
- Tap-to-select and drag-and-drop interaction (both work simultaneously)
- Pour rules: top contiguous same-color layers pour together; destination must match top color or be empty; max capacity per bottle
- Full undo stack (limited to 3 undos on some levels) and restart
- Move counter per level with par-based 1-3 star ratings
- Win detection when all bottles are single-color or empty
- Canvas-drawn win screen with gold title, confetti particles, and Next Level button
- Web Audio SFX: select chime, pour sweep + noise, invalid buzz, ascending win arpeggio
- Progress saved per-level (stars, best moves, highest unlocked) in localStorage under `calebArcadeData.bottlesort`
- Style guide compliant: dark theme (#0a0a2e), pill HUD, gradient buttons, frosted back button, start overlay
- Landing page card with water-themed blue gradient

## Level System
- **50 hand-crafted levels** with curated mechanic introductions, plus procedural generation for levels 51+
- Start with 4 colors + 2 empty bottles; difficulty scales up to 12 colors
- `getLevelConfig()` uses cascading if-blocks; levels 51+ use modular arithmetic for procedural mechanic assignment

### Themes (every 10 levels)
1. **Deep Ocean** (1-10) - Blue tones
2. **Enchanted Forest** (11-20) - Green tones
3. **Volcanic Core** (21-30) - Red/orange tones
4. **Deep Space** (31-40) - Purple tones
5. **Candy Land** (41-50) - Pink tones

### Mechanics

| Mechanic | Description | First Appears |
|---|---|---|
| Par / stars | 1-3 star rating based on move count | Level 2 |
| Limited undo | Only 3 undos per level | Level 4 |
| Fewer empties | Only 1 empty bottle | Level 6 |
| Mystery layers | Hidden as '?' until topmost | Level 7 |
| Bomb timer | Countdown with pulse warning | Level 10 |
| Variable layers | 4, 5, or 6 layer bottles | Level 12 |
| Locked layers | Bottom layers frozen until exposed | Level 13 |
| Capped bottles | Cork blocks pouring, decrements each move | Level 17 |
| Rainbow levels | Single-hue gradient shades to sort | Level 20 |
| More empties | 3 empty bottles (breather) | Level 21 |
| Bonus empty | Power-up earned by 3-starring bonus levels | Level 21 |
| Color merge | Two colors combine into a third | Level 27 |

### Level Select Screen
- Landscape-optimized layout with adaptive columns (8 min landscape, 5 min portrait)
- Themed section cards with left accent edge bars and gradient fills
- Each cell shows level number, 3-star rating, and mechanic indicator dots (colored by type)
- Next-unlocked level pulses with a breathing glow animation via `requestAnimationFrame`
- Locked levels show lock icon; completed levels get theme-gradient fill
- Touch-drag scrolling with scroll clamping and top/bottom fade edges
- Title header with total star count and progress bar

### Save System
- Migrates from old `{level: N}` format to per-level data
- Stores stars, best moves, highest unlocked level, and bonus power-ups

## Pour Animation
The pour uses a 5-phase physical bottle tilt animation:

| Phase | Time | Action |
|---|---|---|
| Lift | 0-18% | Source bottle arcs up to above destination via `sin(p * PI) * 40` vertical offset |
| Tilt | 18-28% | Rotates ~75 degrees toward destination around neck pivot point |
| Pour | 28-68% | Holds tilted; liquid streams straight down with highlight stripe |
| Untilt | 68-78% | Rotates back to upright |
| Return | 78-100% | Arcs back to original grid position |

- Bottle rotates around its neck using `ctx.translate/rotate/translate` so the opening stays fixed
- Source bottle layers update in real-time during pour (draining/filling)
- Tilt direction determined by relative x positions of source and destination
- Splash particles spawn at destination impact point with gravity
- Duration: 900ms + 100ms per layer, cubic ease-in-out on all transitions
- Source bottle drawn on top of all others during animation

Earlier iterations used a blob-on-arc animation (replaced) and then a multi-phase stream animation with rise/stream/settle phases (also replaced by the tilt animation).

## Interaction

### Drag-and-Drop
- `pointerdown` on a bottle records it as potential drag source
- `pointermove` past 10px threshold enters drag mode with `setPointerCapture`
- Dragged bottle drawn semi-transparent at cursor, offset above finger
- Only the hovered drop target highlights (subtle shadow glow, not full selection lift)
- Drop on valid target triggers pour from the drop position; otherwise cancels
- Pour animation starts from the drag-drop position, returns to grid slot
- Delta-based movement: bottle tracks dx/dy from grab point instead of snapping center to cursor

### Tap Fallback
- Tap to select (bottle lifts with purple highlight), tap destination to pour, tap same to deselect

### Toolbar (top-right)
- Buttons: Undo, Restart, Back (to level select), Bonus Bottle (when available)
- Pill-shaped with semi-transparent backgrounds
- HTML back button (top-left) always returns to arcade hub

### Cursor Feedback
- `grab` on hoverable bottles, `grabbing` during drag, `pointer` on buttons/cells, `default` elsewhere

## Bug Fixes
- Fixed `Uncaught IndexSizeError` from `ctx.arc()` receiving negative radius when splash particle alpha drops below zero; added `Math.max(..., 0)` guard
- Solvable level generation guaranteed by creating solved state then Fisher-Yates shuffling all layers

## Files
- games/bottlesort/index.html

[[games-index]]
