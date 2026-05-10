---
color: green
isContextNode: false
---
# Drift Racer

A top-down arcade drift racing game inspired by "Drifters Don't Brake: Midnight." The car auto-accelerates with no brakes -- drifting is the only way to navigate turns. Built with Phaser 3 on a tile-based open world with pink/purple/blue terrain, PNG car sprites, 27 tracks across 3 series, a full track editor, ghost replay system, and night mode with raycasted headlights. Single self-contained HTML file (~2500 lines).

## Features

- **Auto-acceleration with drift physics** -- car facing angle and velocity angle diverge based on steering; grip determines blend rate. Proper forward/lateral velocity decomposition.
- **27 PNG tracks in 3 series** -- Drift, Don't Break, and Midnight, loaded from a manifest of PNG images on startup.
- **25 selectable car sprites** -- PNG car images with fallback rectangle rendering.
- **Terrain types** -- Road (normal grip), Dirt (low grip, slower), Ice (very low grip, faster), each affecting drift behavior differently.
- **Ghost replay system** -- Top 3 stored ghosts + session ghost + up to 7 failed attempt ghosts. Stored per-track in localStorage.
- **Night mode with headlights** -- Feathered dual-cone raycasted beams with darkness overlay.
- **Track editor** -- Full CRUD with fill tool, Bresenham line drawing, PNG import/export, background reference image overlay, and file picker for loading arbitrary PNG tracks at runtime.
- **Minimap** -- Displayed top-center during gameplay.
- **Timer-based scoring** -- Lap times with "New Best" detection; best times persist in localStorage.
- **Bouncy walls toggle** -- Switch between crash-on-wall (default) and bouncy walls mode (0.3 velocity reflection). Persists in localStorage.
- **Controls** -- Arrow keys / A+D, touch (tap left/right screen halves), mouse click.
- **Level select with series tabs** and track preview thumbnails.
- **Physics tuning panel** via lil-gui (CDN dependency, optional).

## History

1. **v1** -- Narrow-road procedural racer with neon glow aesthetic, seeded track generation (5000 segments), drift combo scoring, and distance-based points. Canvas 2D rendering.
2. **v2 rewrite** -- Complete rewrite after analyzing Steam screenshots. Switched to tile-based open terrain, Phaser 3 engine, 8 built-in ASCII stages, timer-based scoring, ghost replay, night mode, and track editor. Fixed inverted Y-axis steering bug from v1.
3. **PNG track system** -- Replaced ASCII stages with PNG image import. Added manifest-based loading, per-stage tile sizing (20px for PNG tracks vs 60px for built-in), dominant-channel color classification, and file picker for custom tracks.
4. **Track expansion** -- Grew from 8 built-in stages to 27 tracks across 3 series (Drift, Don't Break, Midnight). Added series tab system in level select.
5. **Car sprites** -- Added 25 selectable PNG car images with car selection UI.
6. **Polish and fixes** -- Asset path fixes, stable track keys, ghost stage isolation, glow removal, bouncy walls, editor improvements.

## Track Editor and PNG Import

The editor is fully decoupled from Phaser, using its own canvas. Supports:

- **Drawing tools** -- Tile painting, fill tool, Bresenham line drawing for straight segments.
- **PNG export** -- Save edited tracks as PNG images.
- **PNG import** -- Load tracks from PNG files. Color mapping: white=road, black=void, red=start, green=finish, blue=ice, brown=dirt.
- **Background reference image** -- Load a reference image behind the editor grid (0.4 opacity).
- **Filename convention** -- `trackname-dir.png` where dir is u/d/l/r for car start direction.
- **Manifest system** -- `PNG_TRACK_MANIFEST` array for declarative track registration. Tracks load asynchronously on startup.
- **Per-stage tile size** -- PNG tracks use `tileSize: CAR_W` (20px, 1 pixel = 1 car-width). Built-in stages default to 60px tiles.
- **Color classifier** -- Uses dominant-channel detection with margins (not strict thresholds) to handle non-pure colors like `(117,251,76)` for green.

## Bug Fixes Applied

- **Asset path prefix** -- Removed extra `drift/` prefix from car image paths and all 21 track manifest entries. Added `ASSET_BASE` helper for correct resolution on both localhost and GitHub Pages.
- **Hardcoded builtInCount** -- Replaced `builtInCount = 8` with `PNG_TRACK_MANIFEST.length` so editor stays in sync when tracks are added.
- **Ghost stage bleed** -- Session ghost was a single global variable, not keyed by stage. Completing stage N rendered that ghost on stage N+1. Changed to stage-keyed dictionary matching the pattern used by failed attempts.
- **Stable track keys** -- Times, ghosts, and failed attempts were keyed by positional array index (`stage0`, `stage1`). Adding or reordering tracks shifted all saved data. Now keyed by `series:name` (e.g. `"Don't Break:Don't Break 1"`).
- **Drift glow removal** -- Removed the purple additive-blend glow effect around the car while drifting.
- **Editor BG scroll direction** -- Fixed scroll-to-scale picking wrong axis when shift is held on macOS (shift+scroll converts deltaY to deltaX with opposite sign). Changed to `deltaY || deltaX`.
- **Texture memory leak** -- `createTileLayer()` and `createMinimap()` generated new textures with `Date.now()` keys on every restart without destroying old ones. Fix: use stable keys and destroy before regenerating.
- **"New Best" tie detection** -- Check used `>=` after already inserting the current run, so ties falsely showed "New Best!"

## Performance Notes

The main CPU bottleneck is the raycasted headlight system: 486 DDA raycasts per frame (2 headlights x 3 feathered passes x 81 rays), each up to 200 tile steps, plus two full-screen canvas operations per frame.

**Identified issues and planned mitigations (prioritized):**

- **P0: Fixed-timestep physics** -- Clamped dt causes slow-motion below 20fps. Fix: accumulator-based fixed timestep (16.67ms steps) for identical physics on all devices.
- **P0: Timer accuracy** -- Timer uses clamped dt, running slow on laggy devices and giving artificially better lap times. Fix: use raw unclamped delta for timer.
- **P1: Headlight beam caching** -- Only recast when car moves >2px or rotates >3 degrees. Expected 5-10x fewer raycasts on average.
- **P1: Fixed-rate particle spawning** -- Smoke particles spawn per-frame (120/sec at 60fps, 60/sec at 30fps). Fix: time accumulator for consistent density.
- **P2: Ghost recording rate** -- Records once per frame, causing jittery playback at low FPS. Fix: record at fixed time intervals.
- **P2: Tire marks** -- Unbounded accumulation of draw calls; long angular segments at low FPS. Minor/cosmetic.
- **P3: Canvas overlay dirty flag** -- Darkness and car overlays redraw unconditionally. Fix: only redraw when position/angle exceeds threshold.

Additional notes: Phaser 3 loaded from CDN (game requires internet). lil-gui also from CDN but is optional. Ghost recordings store every frame unbounded, which could hit localStorage limits on long runs.

## Files

- games/drift/index.html

[[games-index]]
