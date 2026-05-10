---
color: green
isContextNode: false
---
# Tower Defense

A complete Tower Defense game with Canvas-based rendering, multiple tower types, 9 distinct path layouts, wave-based progression with exponential difficulty scaling, upgrade/sell mechanics, planning phases, and touch + mouse controls. Space-themed styling with particle effects, projectile trails, and smooth tower rotation.

## Features

- **8 Tower Types:** Basic (rapid fire), Archer (long range sniper), Freeze (slows enemies), Splash (area damage), Cannon (heavy splash, wide blast), Sniper (extreme range, huge single-target), Tesla (lightning chains through 3 enemies), Laser (continuous beam)
- **9 Path Layouts:** Classic S-Curve, Zigzag Valley, Spiral Fortress, Diamond Pass, The Comb, Perimeter Loop, Cross Hatch, Snake Pit, The Gauntlet. Path changes every 5 waves; full cycle is 45 waves before repeating.
- **Wave System:** Progressive difficulty with 4 enemy types (normal, fast, tank, boss). Wave 20+ promotes normals to fast; wave 25+ adds shields; wave 30+ spawns extra bosses.
- **Exponential Difficulty:** HP scales as 20 * 1.18^wave (not linear), gold rewards plateau via diminishing returns, spawn intervals tighten to a minimum of 8 frames.
- **Economy:** Gold from kills, spend on towers (25-60g), upgrade for increased damage/range/fire rate, sell for 50% return.
- **Planning Phase:** Pre-wave setup screen with "Send Wave" button. Players place and reposition towers before each wave. Path-change waves show "New path! Rebuild your defenses!"
- **Tower Rotation:** Towers smoothly rotate to face their current target using atan2 and a 0.15 lerp factor with shortest-path angle normalization.
- **Tower Tooltips:** Hover or tap tower buttons to see name, stats (DMG/Range/Rate/Cost), and a gameplay tip. Locked towers show unlock requirements.
- **Visual Polish:** Enemy HP bars, distinct enemy colors/sizes, projectile trails, particle effects on hit/kill, shadow effects, tower level indicators.
- **Controls:** Touch and mouse for placement; tower bar at bottom; upgrade panel on tower click; pause via button or Escape key.
- **Responsive canvas** with 16:10 aspect ratio, mobile meta tags.

## Bug Fixes

- **Infinite loop crash at wave 13 (Critical):** Diagonal path segments in Layout 3 (Diamond) caused `getPathPixels()` and `getPathCells()` to enter an infinite loop when x-distance != y-distance. One axis would overshoot its target and the `while (cx !== b.x || cy !== b.y)` condition never terminated. Fixed by advancing each axis independently: `if (cx !== b.x) cx += dx; if (cy !== b.y) cy += dy;`
- **Path-change waves spawn no enemies (Critical):** `startWave()` returned early on path layout changes before building the spawn queue, causing an infinite planning-phase loop. Fixed by removing the early return so the spawn queue is built during planning.
- **Resize breaks game state (Critical):** Cached `pathPixels`, `pathCells`, and tower pixel positions were never recalculated on window resize. Added a resize handler that recomputes all path data and tower positions from grid coordinates.
- **Multiple endGame() calls per frame:** If several enemies reached the exit in the same frame, `endGame()` was called repeatedly. Fixed by returning from `update()` immediately after game over.
- **Exit marker drawn off-canvas:** Last path waypoint at grid x=20 (beyond 0-19 range) pushed the exit marker off-screen. Clamped exit X with `Math.min()`.
- **Tower positions not updated dynamically:** Tower pixel positions were computed once at placement. Added per-frame recalculation from grid coordinates before shooting logic.
- **lil-gui CDN failure crashes game:** Top-level `new lil.GUI()` threw if the CDN failed. Wrapped in try/catch.

## UI Improvements

- **Planning phase** between every wave with contextual messages and a "Send Wave N" button, replacing auto-start timers.
- **Pause/unpause** button (top center) and Escape key toggle, with blur overlay and "PAUSED" text. Disabled during planning phase to avoid double-idle state.
- **Back button confirmation** dialog during active gameplay to prevent accidental navigation.
- **Tower tooltips** panel beside the tower bar showing stats and descriptions on hover/tap.
- **Smooth tower rotation** tracking targets with lerped angle interpolation.
- **Pause button** repositioned to top center (`left: 50%; transform: translateX(-50%)`).

## Files

- games/towerdefense/index.html

[[games-index]]
