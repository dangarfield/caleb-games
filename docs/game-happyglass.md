---
color: green
isContextNode: false
agent_name: Amit
---
# Happy Glass

Physics-based drawing puzzle. Draw ramps and guides to direct water particles into a glass using as little ink as possible. Uses Planck.js (Box2D) for realistic physics including glass toppling, spinning obstacles, and fire hazards.

## Current State
- Planck.js physics engine (replaced Matter.js for proper concave collision)
- 100 levels in `levels.json` (first 50 curated, last 50 placeholder)
- Star-gated progression: level N requires N total stars to unlock (level 1 always open)
- Level editor with full shape tooling (polygon, circle, line, point, spinning cross, block, hint)
- 3 obstacle physics types: fixed (grey), floating/gravity (orange), fire (red, destroys water with steam effect)
- Reference image overlay in editor from original game screenshots
- Sound effects: plink-based system (click, level select, success, fail, fill progress, steam hiss)
- Two-player support: Play as Caleb or Play as Ezra (separate progress)
- Responsive level select grid (auto-picks best column count 5-20 for screen orientation)

## Features
- Draw freehand lines on canvas to guide water into glass(es)
- Planck.js (Box2D port) physics: 150 max particles, bullet mode, substeps
- Ink limit per level — use less ink for more stars (3-star: <=35%, 2-star: <=65%)
- Levels loaded from `levels.json` (fetched via synchronous XHR), editor saves to localStorage separately
- Obstacle types: rect, polygon, circle, line, point, spinning cross
- 3 physics types per obstacle: fixed (static), floating (dynamic/gravity), fire (destroys water on contact)
- Fire obstacles: animated flame visuals (2x size, 12px base), steam evaporation particles, hissing sound on water contact
- Fire detection via `begin-contact` world listener (reliable across all body types)
- Gravity mode: glass is a dynamic physics body that topples realistically
- Glass rotation: 5 presets (L45, L22.5, None, R22.5, R45) — affects editor, drawing, and physics
- Multiple taps and glasses per level
- Directional taps: down (default), left, right — with initial velocity in tap direction
- Tapered glass shape (bottom 65% width of top) with compound fixtures
- SVG filter liquid effect (gaussian blur + color matrix threshold)
- Multi-canvas layering: main (z:0), water+filter (z:1), glass/obstacles (z:2), HTML UI (z:100)
- Pencil cursor while drawing (4x scale)
- Block zones: polygon no-draw areas that prevent player from drawing inside them
- Hint system: freehand hint lines per level, shown after 3 fails or 4 edits (animated button)
- Two-player mode: "Play as Caleb" / "Play as Ezra" with independent star progress
- Level select: responsive grid (5-20 cols), star count display, lock icons on gated levels
- Star-gated progression: total stars earned = number of levels unlocked
- Animated win/lose banners with spring animations
- Ink bar + fill progress bar in HUD
- White background with grid pattern for game/level select, blue for landing page
- Spawn blocking: proximity check prevents particle pile-up at taps
- Sound system: WebAudio plink oscillators, ascending fill scale, steam hiss (white noise)
- Progress saved to localStorage per player

## Level Editor
- Tools (with colored icons): Cursor, Polygon, Circle, Line, Point, Cross, Block, Hint, Tap, Glass, Erase
- Block tool: draw polygon no-draw zones (click points, close on 1st point or Enter)
- Hint tool: freehand draw hint lines (shown as dashed gold lines in editor)
- Reference image overlay (Off/Start/Solution toggle) from 100 original level screenshots
- Large reference thumbnail in top-right corner (560px tall)
- Enter key completes shapes (1pt=point, 2pt=line, 3+=polygon)
- Click-to-select any object in cursor mode, then change its type
- Glass rotation selector (L45, L22.5, None, R22.5, R45) in properties panel
- Tap direction selector (down, left, right) in properties panel
- Editor test mode with speed toggle (1x / 8x)
- "Level works!" banner shows ink used and suggested limit (used x 3, rounded up to nearest 50)
- << >> navigation (+/-10 levels, snapped to min/max)
- Levels saved to `happyglass-levels` localStorage key (separate from player progress)
- Export: downloads `levels.json` file
- Editor icon in level select: cog at 0.05 opacity (top-right corner)

## Architecture
- `games/happyglass/index.html` — all game code in one `<script>` IIFE (~2400 lines)
- `games/happyglass/levels.json` — 100 level definitions (first 50 curated, last 50 placeholder)
- `games/happyglass/research/level-screenshots/` — 200 reference images (level_XXX_start.jpg and level_XXX_end.jpg for levels 1-100)
- `games/happyglass/research/all-levels-video.mp4` — source video of original game (100 levels)
- Uses Planck.js CDN v1.0.0
- State machine: menu -> levelSelect -> drawing -> simulating -> won/lost
- Editor state machine: editor -> editorTest (with backup/restore)
- Physics: PPM=30, World gravity=(0,10), dynamic glasses with compound fixtures (left wall, right wall, bottom), water spawned as bullet circles
- Collision categories: TAP_CATEGORY=0x0004, WATER_CATEGORY=0x0002, LINE_CATEGORY=0x0001
- Canvas sizing: fullscreen (innerWidth x innerHeight), responsive resize handler

## Level Data Format
Each level in `levels.json` is an object:
```json
{
  "taps": [{"x": 0.5, "y": 0.08, "dir": "down"}],
  "glasses": [{"x": 0.5, "y": 0.75, "rotation": 0}],
  "inkLimit": 500,
  "gravity": true,
  "obstacles": [
    {"type": "polygon", "physics": "fixed", "vertices": [{"x":0.1,"y":0.5},...]},
    {"type": "circle", "physics": "fire", "cx": 0.5, "cy": 0.5, "r": 0.05},
    {"type": "line", "physics": "floating", "x1": 0.2, "y1": 0.4, "x2": 0.8, "y2": 0.6},
    {"type": "point", "physics": "fixed", "x": 0.5, "y": 0.5},
    {"type": "cross", "physics": "fixed", "x": 0.5, "y": 0.5, "size": 0.1}
  ],
  "blocks": [{"vertices": [{"x":0.1,"y":0.1},{"x":0.3,"y":0.1},{"x":0.3,"y":0.3},{"x":0.1,"y":0.3}]}],
  "hints": [[[x1,y1],[x2,y2],...], ...]
}
```
- All coordinates are 0-1 normalized (fraction of screen width/height)
- `taps[].dir`: "down" (default), "left", "right"
- `glasses[].rotation`: radians (0, +/-0.393, +/-0.785 for 22.5/45 degrees)
- `obstacles[].physics`: "fixed" (static grey), "floating" (dynamic orange), "fire" (red, destroys water)
- `blocks`: polygon no-draw zones (player can't draw inside)
- `hints`: array of polylines (each is array of [x,y] points in pixels)
- `gravity`: if true, glass is dynamic body (can topple)

## normalizeLevel Function
Called on every level during load. Important behavior:
- Converts legacy `faucet`/`glass` single objects to `taps`/`glasses` arrays
- Strips legacy per-glass `w`/`h` (now uses global GLASS_W/GLASS_H constants)
- **Preserves** `rotation` on glasses
- Converts legacy `glassGravity` to `gravity`

## Level Loading Order
1. Default empty 100-level array created
2. `levels.json` loaded via synchronous XHR (base layer)
3. `happyglass-levels` localStorage overlaid on top (editor overrides)

## localStorage Keys
- `calebArcadeData` -> `happyglass_caleb.stars` / `happyglass_ezra.stars` — player star progress arrays
- `happyglass-levels` — editor level data (JSON array, overrides levels.json when present)
- `happyglass-lastEditLevel` — last edited level index (integer)

## Level Select Grid Algorithm
Tries column counts 5-20, picks whichever maximizes cell size:
```
for c in 5..20:
  rows = ceil(totalLevels / c)
  cellSize = floor(min(availW/c, availH/rows) * 0.7)
  pick max cellSize
```
This auto-adapts to landscape (more cols) or portrait (fewer cols, more rows).

## Progression System
- Total stars earned = number of levels unlocked (level 1 always free)
- Each level awards 1-3 stars based on ink efficiency (<=35% = 3 stars, <=65% = 2 stars, else 1 star)
- Stars displayed next to "Happy Glass" title on level select
- Locked levels show grey background + lock icon, clicks ignored

## How to Extract More Screenshots from the Video

If any level screenshots are incorrect or missing, use this process:

```bash
# 1. Extract frames at 1fps from the video (first 18min covers levels 1-100)
mkdir -p /tmp/hg-frames
ffmpeg -i research/all-levels-video.mp4 -t 1080 -vf "fps=1" -q:v 3 /tmp/hg-frames/frame_%04d.jpg

# 2. OCR the level number from each frame
# The level text is at crop region: 80x12+32+27 (from top-left of 144x256 frame)
# Enlarge 800%, grayscale, level adjust for clean OCR
for i in $(seq 1 1080); do
  fname=$(printf "frame_%04d.jpg" $i)
  magick "/tmp/hg-frames/$fname" -crop 80x12+32+27 +repage -resize 800% \
    -grayscale Rec709Luminance -level "30%,70%" /tmp/hg-frames/ocr_t.png
  tesseract /tmp/hg-frames/ocr_t.png /tmp/hg-frames/ocr_r --psm 7 \
    -c "tessedit_char_whitelist=Level0123456789 " 2>/dev/null
  num=$(grep -oE '[0-9]+' /tmp/hg-frames/ocr_r.txt | head -1)
  echo "$i,$num"
done > level_map.csv

# 3. For each level, take first frame (start/layout) and last frame (solution)
# Copy to research/level-screenshots/level_XXX_start.jpg and level_XXX_end.jpg
```

**Known OCR issues:**
- Level 5 gets misread as "6" (the 5/6 glyphs are similar at this resolution)
- Level 69 gets misread as "9" (leading digit dropped)
- A few other levels may need manual verification by viewing the frame

**To fix a specific level manually:**
```bash
# View frames around the expected time (each level ~10-12 seconds)
# Level N is roughly at second: (sum of previous level durations)
# Look at the frame visually to confirm the level number
open /tmp/hg-frames/frame_XXXX.jpg
cp /tmp/hg-frames/frame_XXXX.jpg research/level-screenshots/level_NNN_start.jpg
```

## Controls
- Draw: touch drag or mouse drag on canvas
- Play button: starts physics simulation after drawing
- Undo: removes last drawn line
- Give Up / Retry / Next Level buttons on result screens
- Editor: cursor selects objects, drawing tools place new ones, Enter completes shapes
- Hint button: appears after 3 fails or 4 edits, toggles hint line overlay

## Key Technical Decisions
- Planck.js over Matter.js: Matter.js uses convex hull for compound bodies, making concave glass shapes impossible to collide correctly. Planck.js (Box2D) allows individual fixtures per body.
- Glass bottom fixture positioned at visual bottom line (center at `botY`, half-height `wt/2`) to eliminate air gap
- SVG filter with large render radius (`WATER_RADIUS*3`) for visual liquid merging
- Fire detection via world `begin-contact` listener + `waterBodySet` (Set for O(1) lookup) — more reliable than iterating per-body contact lists
- Spinning cross uses RevoluteJoint between static anchor and dynamic cross body (45 degree default rotation)
- Drawn lines use Box fixtures (not Edge+Circle) for consistent collision thickness
- Spawn blocking via proximity check against recent water particles (not AABB query which detects the tap itself)
- Levels loaded from disk (XHR levels.json) then overlaid with localStorage editor edits
- Speed toggle runs physics loop N times per frame (identical behavior, just faster)
- normalizeLevel strips legacy w/h but preserves rotation on glasses

Note: original happy glass game and design review: https://www.gamedeveloper.com/design/happy-glass---design-analysis

[[games-index]]
