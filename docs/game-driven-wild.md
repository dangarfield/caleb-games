---
color: green
isContextNode: false
---
# Speed Racer (formerly DR1V3N WILD)

3D WebGL racing game ported from js13kGames. Play as Caleb (yellow car, #8) or Ezra (blue car, #4) across 5 stage tracks. Renamed from "DR1V3N WILD" to "Speed Racer" — title screen, home page card, and browser tab all reflect the new name. Folder path stays `games/driven-wild/` (URL stable).

## Features
- WebGL2 3D rendering (~2730 lines)
- Player select: Caleb or Ezra with custom car colors, roof numbers, license plates
- 5 stages: Desert Highway, Mountain Pass, Coastal Drive, Canyon Run, Night Ride
- Auto-accelerate with tap left/right steering for touchscreen
- Per-player and per-stage high scores in localStorage
- Menu flow: Title -> Player Select -> Stage Select -> Game -> Game Over
- Jump ramps with 360° flip animation + 5-second 30% speed boost (see below)

## Source
Consolidated from `js13kGames/dr1v3n-wild` (13 JS files) into a single `index.html`. Music data arrays from zzfxM inlined.

## Touch Controls
- Auto-accelerate always on
- Left 40% of screen = steer left
- Right 40% of screen = steer right
- Binary left/right zones (not analog) for kid-friendliness

## Mobile/Tablet Performance
- Adaptive WebGL resolution scaling (0.65x default, 0.4x-1.0x based on FPS)
- Reduced sky complexity: 40 clouds/parallax (vs 99), halved sun glow
- Aggressive shadow culling at 10k distance (vs 20k)
- AI vehicle cap: 6 (vs 10)
- FPS monitoring: auto-degrades below 30fps, recovers above 50fps
- Desktop rendering fully unaffected

## Jump Ramp System

Two procedural ramps per stage, each in a single random lane (not full road width). 3D orange ramp object (cubeMesh with chevron stripe), 8 colored road segments as approach warning. No terrain height modification — the road stays flat; the ramp is a 3D object plus a trigger zone.

**Trigger:** player Z within -200 to +600 of ramp AND player X within ±700 of ramp lane. Direct vy=25 impulse on entry. `lastJumpPeakZ` prevents re-trigger.

**Flip animation:** 0.45s smoothStep-eased 360° front flip, fast enough to complete mid-air. `drawPitch` resets to 0 on landing. Gentle gravity reduction (+0.7/frame) keeps the car airborne ~0.5s. Lands wheels-down every time.

**Speed boost:** 5-second duration, +2 accel/frame to target 260 (~30% above normal ~200). HUD shows 'BOOST!' / 'FLIP!' indicators. AI vehicles ride over ramps normally — no flip, no boost. Camera stays at track level so the car appears to jump above the viewport (intentional drama). Tunable constants live at the top of `custom.js`.

## Bug Fixes
1. **GitHub Pages 404** — js13kGames source had a leftover trailing-slash redirect script (`if(!location.pathname.endsWith('/'))location.replace(location.pathname+'/')`) that redirected `/games/driven-wild/index.html` to `/games/driven-wild/index.html/`, which 404s on GitHub Pages (only — localhost dev servers handle trailing slashes differently). Removed the script entirely. No other game in the arcade has this pattern.

## Files
- games/driven-wild/index.html
- games/driven-wild/custom.js (arcade customizations + perf optimizations + jump ramp system)
