---
color: blue
isContextNode: false
agent_name: Ayu
---
# Race Maker

Design doc for Scalextric-style slot racer with RCT-inspired track editor. Uses Kenney Racing Kit (112 GLB models, CC0). Two-phase game: build track sequentially then race with hold-to-accelerate controls. Three.js renderer.

## Concept

Two phases:
1. **Build** — Lay track pieces sequentially (RCT-style: click next piece / undo last), then place decorations around the circuit
2. **Race** — Scalextric-style: throttle bar controls max speed, car follows the track slot. Enforced braking on corners.

## Asset Kit

Kenney Racing Kit 2.0 (CC0 license). 112 GLB models, ~1.86MB total.

### Track Pieces (55 road models)
| Category | Pieces | Notes |
|----------|--------|-------|
| Straight | roadStraight, roadStraightLong, roadStraightArrow, roadStraightSkew, roadStraightLongBump | Basic lane segments |
| Corners | roadCornerSmall, roadCornerLarge, roadCornerLarger | 3 radii for tight/wide turns |
| Corner variants | *Border, *Sand, *Wall, *BorderInner, *SandInner, *WallInner | Edge decoration built-in |
| Bridges | roadStraightBridge, roadStraightBridgeStart, roadStraightBridgeMid, roadCornerBridge* | Elevated sections |
| Ramps | roadRamp, roadRampLong, roadRampLongCurved, roadRampWall | Up/down transitions |
| Splits | roadSplit, roadSplitLarge, roadSplitLarger, roadSplitSmall, roadSplitRound* | Forking paths |
| Special | roadStart, roadStartPositions, roadCrossing, roadEnd, roadBump, roadCurved, roadPit* | Start/finish, pits |

### Vehicles (4 cars)
raceCarRed, raceCarGreen, raceCarOrange, raceCarWhite (~106KB each, detailed mesh)

### Decorations (51 models)
- **Barriers:** barrierRed, barrierWhite, barrierWall
- **Fences:** fenceStraight, fenceCurved, rail, railDouble
- **Flags:** flagCheckers, flagCheckersSmall, flagRed, flagGreen, flagTankco
- **Stands:** grandStand, grandStandCovered, grandStandRound, grandStandAwning, grandStandCoveredRound
- **Buildings:** pitsGarage, pitsGarageClosed, pitsGarageCorner, pitsOffice, pitsOfficeCorner, pitsOfficeRoof
- **Lighting:** lightPostLarge, lightPostModern, lightColored, lightRed, lightRedDouble
- **Overhead:** overhead, overheadLights, overheadRound, overheadRoundColored
- **Scenery:** treeLarge, treeSmall, grass, billboard*, tent*, bannerTower*, pylon, ramp
- **Props:** camera_exclusive, radarEquipment

## Architecture

Single `index.html` with Three.js loaded from CDN (ES module importmap). GLB files loaded from `research/kenney_racing-kit/Models/GLTF format/`.

### File Sizes
- Track pieces: 3-15KB each (very lightweight)
- Cars: ~106KB each
- Total kit: ~1.86MB

### Code Structure (inline in index.html)
1. **Scene setup** — Three.js renderer, orthographic camera, lighting (ambient 2.0 + directional 1.0)
2. **Track editor** — Sequential piece placement, undo, snap-to-connector, rotation
3. **Auto-decoration** — Grandstands, trackside props, edge barriers placed algorithmically
4. **Racing engine** — Car physics on track spline, throttle bar, corner braking, AI drivers
5. **UI** — Mode switching, piece palette, lil-gui debug panel, race HUD

## Track Editor Design

### Sequential Placement (RCT-style)
- Start with `roadStart` piece placed automatically
- Show a "ghost" preview of the next piece at the open end
- **Next/Prev** buttons cycle through available piece types
- **Rotate** button (90-degree increments) for piece orientation
- **Place** confirms, **Undo** removes last piece
- Track pieces snap to the open connector of the previous piece
- Track must form a closed loop to be raceable (detect when end connects back to start)
- Auto-close path-finding when loop is near

### Piece Connection System
- Each piece has entry/exit points (position + direction vector)
- When placing, the new piece's entry aligns to the previous piece's exit
- Collision detection prevents overlapping pieces
- Visual indicator (green/red ghost) shows valid/invalid placement
- Connection data hardcoded per piece type (not derived from geometry)

### Decoration Phase
- After closing the circuit, switch to decoration mode
- Click anywhere near the track to place decorations
- Palette of decoration categories (barriers, trees, stands, etc.)
- Free rotation and placement (not grid-snapped)
- Delete mode to remove placed decorations

### Auto-Decoration System
- Triggered by button or on quick-race
- Uses seeded RNG for reproducibility
- **Grandstands**: Placed along straights with +0.5 X offset, rotation 90deg. Corner stands on outside of curves only. Density controlled by "tracks per stand" parameter.
- **Edge barriers**: Border/wall/sand pieces placed adjacent to track edges
- **Trackside props**: Trees, lights, flags, barriers, pylons scattered 1-2 cells from track. Tents NOT rotated. Uses weighted random pool.
- Dual occupied-cell system: lightweight (centerline) for edge placement, full (bounding boxes) for stand placement

## Racing Mechanics

### Throttle Bar Control
- Vertical touch bar on right side of screen (60vh tall, curved edges)
- Bottom = 0 mph, Top = 180 mph (linear scale)
- Touch position controls the maximum speed the car will accelerate to
- Three horizontal markers at corner speed limits (60, 100, 140 mph)
- Speed number shown at thumb position while touching
- Spacebar = full throttle (180 mph) for keyboard players
- Release = coast deceleration (no brake button)

### Corner Speed Limits & Penalties
| Corner Type | Speed Limit | Penalty Brake Target |
|-------------|-------------|---------------------|
| Small (tight) | 60 mph | 40 mph |
| Large (medium) | 100 mph | 80 mph |
| Larger (wide) | 140 mph | 120 mph |

- If entering a corner above the limit: hard auto-brake (rate: 30 units/s^2) to (limit - 20mph)
- **Penalty persists for entire corner** — cannot accelerate above brake target until back on a straight
- Cannot accelerate above corner limit while in a corner (even without penalty)
- Braking zones mapped via spline piece boundaries using arc-length parameterization
- Visual indicators: speed turns red, red pulsing vignette overlay

### Collision System
- Proximity check: cars within ~0.4 world units on spline AND overlapping lanes (blend < 0.4)
- **Rear-end**: Car behind going faster gets braked to (front car's speed - 20mph)
- **Lane-switch bump**: The car changing lanes is penalised
- AI-vs-AI collisions follow same rules
- Visual: same red braking indicator as corners

### AI Drivers
- 3 AI cars (green, orange, white) with configurable skill (0.3-1.0)
- Same corner braking and collision rules as player
- Random lane switching every 3-7 seconds
- Player starts 4th (configurable)

### Race Config (defaults)
```javascript
topSpeed: 8,          // ~180 mph
acceleration: 6,
coastDecel: 4,
aiTopSpeed: 7.5,      // ~168 mph
aiAcceleration: 6,
aiSkill: 0.7,
cornerBrakeRate: 30,
cornerPenalty: 0.89,  // ~20 mph
startOffset: 4.3,     // world units behind start line
startSpacing: 0.5,    // world units between grid positions
carScale: 0.2,
```

### Grid Positioning
- Start offset and spacing in world units (consistent across all track lengths)
- t=0 on spline = first track piece entry = start line
- Cars placed behind start line by offset distance
- Lanes alternate left/right per grid position
- Cars visible on track during editing (spawned when track closes)

### Race Camera
- Orthographic, frustum size 6 during race (zoomed in from editor's 12)
- Isometric offset (8, 8, 8) from car
- Position lerp 0.04, look-at lerp 0.06 for smooth easing
- Camera pans to player car during 3-2-1 countdown
- Arrow keys for panning in editor mode

### Spline System
- CatmullRomCurve3, closed, tension 0.3
- Height-aware: interpolates Y from piece prevCursor.y to exit Y
- Ramps use smoothstep (S-curve) for height
- Speed bumps use sine hump
- Arc-length parameterization via getPointAt() for uniform speed
- Piece boundaries recorded during spline build for brake zone mapping

## Race UI Layout
- **Top center**: Lap counter + race time (HUD bar)
- **Right side**: Throttle bar with speed limit markers
- **Left center**: Switch lane button (circular, arrows icon)
- **Bottom right**: Current speed (mph, large monospace, turns red on braking)
- **Finish**: Styled modal with time, best time, Race Again / Exit buttons

## Controls

| Mode | Input | Action |
|------|-------|--------|
| Editor | Click/Tap | Place piece |
| Editor | Arrow keys | Pan camera |
| Editor | R / rotate button | Rotate piece 90deg |
| Editor | Z / undo button | Remove last piece |
| Editor | Tab / button | Switch to decor mode |
| Decor | Click/Tap | Place selected decoration |
| Decor | Scroll / buttons | Rotate decoration |
| Decor | X / delete button | Remove decoration |
| Decor | "Race!" button | Start race |
| Race | Throttle bar (touch) | Control max speed |
| Race | Space (keyboard) | Full throttle |
| Race | S / Lane button | Switch lane |
| Race | Escape | Exit race |

## Quick Race
- "Race!" button on main menu overlay
- Loads first saved track from localStorage (prefers "demo-1")
- Auto-decorates the track
- Starts race immediately with countdown

## Tech Stack
- Three.js (CDN via importmap, ES module)
- GLTFLoader for .glb files
- OrbitControls for editor camera
- lil-gui for debug/config panel
- localStorage for track saves + best times

## Ground & Visuals
- Editor mode: dark ground (0x2a2a2a), dark clear color (0x1a1a1a), grid visible
- Race mode: grass green ground (0x4d8f6e matching GLB grass material baseColorFactor), no grid
- Ground uses MeshStandardMaterial (lit by scene lights, matches grass piece appearance)
- Fog matches clear color in both modes

## Grid System (Measured from GLBs)
- 1 tile = 1 unit in X and Z
- roadStraight: 1x1 (x:0-1, z:-1 to 0), height 0.02
- roadCornerSmall: 1x1
- roadCornerLarge: 2x2
- roadCornerLarger: 3x3
- roadStraightLong: 1x2
- roadRamp: 1x1, height 0.27
- roadStraightBridge: 1x1, height 0.52
- raceCarRed: ~0.55 wide, 1.35 long, height 0.33
- All pieces sit at origin corner (min 0,0,-d to max w,h,0)

## Status
- All phases implemented in `games/race-maker/index.html`
- Scene, track editor with ghost preview, piece cycling, rotation, undo, loop closure
- Auto-decoration with grandstands, edge barriers, trackside props
- Racing with spline following, throttle bar, corner speed limits, penalty braking
- 3 AI drivers with collision detection
- 3-2-1-GO countdown, lap counter, finish modal with best times
- Quick Race from main menu
- lil-gui debug panel for all race/decor parameters

### NOTES

- Track pieces are very small (3-15KB) so loading the full set on demand is fine
- Piece connection system uses hardcoded exitX/exitZ/exitAngle per piece def
- Left corners reuse same GLB with scale.x = -1 (mirror)
- Corner speed limits mapped per-piece via splinePieceMap (arc-length converted boundaries)
- Splits deferred -- single-path only for now
- No engine sound (removed by design)
- Speed displayed in mph
- Tents placed without rotation to avoid overlapping track

[[games-index]]
