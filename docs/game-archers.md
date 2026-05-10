---
color: green
isContextNode: false
agent_name: Ari
---
# Archers 3D Game

Top-down arena shooter / roguelite inspired by Archero, rendered in **Three.js** with an orthographic camera. Player auto-fires arrows when stationary, moves via virtual joystick to dodge. Clear 25 stages per chapter across 10 chapters + 1 tutorial. Built with vanilla JS, ES modules, Three.js (via CDN), no build tools.

## Origin
Originally a 2D Canvas version at `games/archers/`. Rewritten as a 3D version at `games/archers-3d/` using Three.js for all gameplay rendering. The 2D canvas is retained as a transparent overlay for HUD, menus, and screen overlays. Game logic (enemies, bullets, skills, equipment) is shared; rendering is split between Three.js (arena, player, enemies, projectiles, effects) and Canvas 2D (HUD, screens, menus).

## Architecture
- **Location:** `games/archers-3d/`
- **Entry:** `index.html` (loads `js/main.js` as ES module, imports Three.js 0.170.0 via CDN importmap)
- **Total code:** ~17,227 lines across 32 JS modules
- **Rendering:** Three.js WebGLRenderer (3D scene) + Canvas 2D overlay (HUD/menus)
- **Camera:** Orthographic, frustum size 23, positioned at Y=32 looking down at 20Z offset
- **Player model:** GLB file (`models/mouse.glb`) loaded via GLTFLoader, with 6 animations (idle, move, draw, recoil, hit, ko)
- **Portrait-only:** Landscape triggers a "rotate your device" overlay
- No build tools, no frameworks, no sprites for enemies

### Tile-Based Distance System
All spatial values expressed in **tile units**, not pixels. `T()` (from `arena.js`) returns current tile size in pixels: `arenaWidth / gridColumns`. Constants in `constants.js` store tile-based values (e.g., `PLAYER_R = 0.396` tiles). Enemy types in `enemyTypes.js` store raw pixel values, auto-converted to tile units at module load via `T_REF = 500/11`.

### File Structure
```
games/archers-3d/
  index.html           - HTML page, two canvases (three-canvas + gameCanvas), importmap for Three.js
  archers-map.json     - Map data (stage layouts)
  models/mouse.glb     - Player character 3D model (animated)
  js/
    main.js           (1566 lines) - Game loop, state machine, update, draw, camera
    state.js          (46 lines)   - Global game state (incl. dying/dead states, projectile arrays)
    constants.js      (17 lines)   - Tile-based spatial constants
    arena.js          (26 lines)   - Arena bounds + T() tile-size function
    player.js         (78 lines)   - createPlayer() with all stat fields
    input.js          (95 lines)   - Keyboard/touch/joystick input (disabled during dying)
    mapData.js        (121 lines)  - Map/grid data loading
    bullets.js        (454 lines)  - Player bullet update, enemy bullet update, collision
    enemies.js        (631 lines)  - Enemy update, attack dispatch, death, spawning
    enemyAI.js        (439 lines)  - 10 AI movement functions + boss phase cycling
    enemyTypes.js     (3770 lines) - 111 enemy type blueprints (pure data)
    enemyDraw.js      (1887 lines) - 30 canvas draw functions for enemy visuals (2D fallback)
    chapters.js       (620 lines)  - 11 chapter defs, themes, stage generation, enemy picking
    skills.js         (372 lines)  - 71 per-run skills, XP, level-up logic
    skillCard.js      (163 lines)  - Skill card UI rendering
    equipment.js      (88 lines)   - 17 persistent items, forge/upgrade system
    storage.js        (156 lines)  - localStorage persistence
    screens.js        (1370 lines) - Armory, level-up, chapter clear, game over UI (2D canvas)
    draw.js           (119 lines)  - drawShape, drawBar, drawArena helpers (2D)
    hud.js            (403 lines)  - In-game HUD (HP, XP, stage, debug toggles)
    particles.js      (122 lines)  - 2D particle effects + bolt arc lightning
    crystals.js       (67 lines)   - Crystal pickup + magnet
    hearts.js         (75 lines)   - Heart pickup + magnet
    orbitals.js       (238 lines)  - Orbiting circles/swords around player
    summons.js        (333 lines)  - Strike swords, star drops, meteor projectiles
    audio.js          (136 lines)  - Web Audio API sound effects (procedural)
    icons.js          (24 lines)   - Preloads skill icon images
    utils.js          (103 lines)  - dist, clamp, pushOutRect, weightedRandom, fmt, dmgVar
    --- 3D-specific modules ---
    renderer3d.js     (220 lines)  - Three.js scene, cameras (ortho+persp), lights, coordinate mapping
    arena3d.js        (666 lines)  - 3D arena: floor, boundary walls, door, steps, water, spikes, level sign
    entities3d.js     (1734 lines) - Player GLB model, enemy 3D meshes, angel, targeting indicators
    effects3d.js      (1088 lines) - 3D projectile visuals: arrows, enemy bullets, orbitals, strikes, stars, meteors
```

## 3D Rendering Layer

### Scene Setup (`renderer3d.js`)
- **Orthographic camera** (primary): frustum size 23, at Y=32 with Z+20 offset from target
- **Perspective camera** (toggle): FOV 40°, same position — switchable at runtime
- **Lights:** ambient (2.0), directional with shadows (2.0, 1024px shadow map), hemisphere fill (1.2)
- **Tone mapping:** LinearToneMapping, exposure 2.0
- **Camera Z-clamping:** soft exponential easing at arena boundaries, configurable via `CAM_VISIBLE_BEYOND_TOP_T` (2) and `CAM_VISIBLE_BEYOND_BOTTOM_T` (1)
- **`snapCamera()`:** instant camera positioning on stage load (no pan animation)
- **Coordinate mapping:** `gameToWorld(gx, gy)` converts game coordinates to 3D world space

### Arena Geometry (`arena3d.js`)
- **Floor:** merged BufferGeometry of individual cell tiles (skipping water cells), canvas-based texture with checkerboard + grid lines
- **Boundary walls:** 1T high box geometry on all 4 sides (top has gap for door)
- **Raised ground plane:** ShapeGeometry at Y=1.01 with hole cutout for arena + stair zone + corridor
- **Door wall:** 5T high extruded shape with doorway cutout, positioned 2T north of arena. Two swinging door panels (4T high) with decorative insets and handles
- **Steps:** 5 equal zones over 2T gap: ground (Y=0) → step 1 (Y=1/3) → step 2 (Y=2/3) → boundary (Y=1) → boundary (Y=1). Risers + treads per step
- **Level sign:** Canvas texture with stage number in gold frame, mounted on south face of door wall (right side)
- **Water tiles:** transparent blue planes at Y=0.01 with bob animation
- **Spike tiles:** grid of red cones
- **Corridor floor:** box behind door wall at boundary height
- **Chapter themes:** per-chapter colors for floor, walls, door, boundary, grid lines

### Player Model (`entities3d.js`)
- **GLB model** loaded once, cloned per stage via `GLTFLoader`
- **Scale:** 0.015
- **6 animations:** idle, move, draw, recoil, hit, ko (mapped from GLB clip names)
- **Animation state machine:** selects animation based on game state (dead→ko, iFrames→hit, moving→move, shooting→draw/recoil, else→idle)
- **Attack speed scaling:** draw/recoil animations scale with `atkSpeedRatio`
- **Run animation speed:** 2.5x base, scaled by `speedMult`
- **iFrame flash:** material opacity pulses between 0.3 and 1.0
- **Y positioning:** linear interpolation from Y=0 (arena floor) to Y=1.0 (boundary) over the 3-zone stair area

### Enemy 3D Meshes (`entities3d.js`)
- **20+ mesh factory functions** (makeBat, makeSlime, makeGoblin, makeSkeleton, etc.)
- **Mesh pooling:** enemies reuse mesh instances via a cache keyed by draw function name
- **Animations:** type-specific (squish for slimes, bob for bats/ghosts, hop for goblins, pulse for bosses)
- **Entrance animation:** enemies fly in from above over 0.8s
- **Health bars:** rendered in 2D canvas, projected from 3D world position

### 3D Effects (`effects3d.js`)
- **Arrow pool** (max 50): elongated cone + cylinder, colored by arrow type, rotated to face travel direction
- **Enemy bullet pool** (max 80): glowing sphere, with lobbed bullet height arc
- **Orbital pool** (max 16): colored torus rings orbiting player position
- **Strike projectile pool** (max 24): sword mesh (blade, tip, crossguard, handle, glow), faces travel direction
- **Star projectile pool** (max 16): core sphere + glow + cone trail, drops from height
- **Meteor projectile pool** (max 8): fireball + glow + trail puffs, parabolic arc height
- **Strike effect pool** (max 16): expanding torus impact rings
- **Crystal/heart pools** (max 40 each): colored gems/hearts at floor level
- **Stuck arrow pool** (max 30): arrows embedded in arena edges
- **Material caching:** `getCachedMaterial()` with quantized opacity to prevent cache pollution

## Core Game Systems

### Game States
`menu` → `equip` (armory) ↔ `skillInfo` → `playing` ↔ `exiting` → `levelUp` → back to `playing` → `chapterClear` or `dying` → `dead` → back to `equip`

### Death Flow (`dying` → `dead`)
When player HP reaches 0:
1. Enter `dying` state with timer = KO animation duration + 0.3s
2. Joystick disabled, iFrame flashing stopped
3. KO animation plays on player model
4. Existing projectiles/particles continue updating (bullets, summons, orbitals, bolt arcs)
5. Enemies freeze (no movement, no new projectiles)
6. Enemy bullets in flight continue but skip player hit checks
7. Timer expires → `dead` state
8. Game over modal fades in over 0.5s

### Update Flow
Shake timer → player movement (joystick + easing) → auto-fire when stationary → bullet collision → enemy AI/attacks/death → crystal/heart pickups → orbitals → summons → HP regen → invincibility star cycling → death/exit checks.

### Camera System
- **Z-axis follow:** smooth ease toward player Z at rate `1 - exp(-4 * dt)`
- **Z-clamping:** screen edges don't exceed configurable T-units beyond arena edges
- **Soft clamp:** exponential easing toward boundary (`1 - exp(-8 * dt)`)
- **Fallback:** when arena fits within frustum, camera centers on arena
- **Snap:** `snapCamera()` called on stage load to avoid initial pan

### Exiting Phase
When all enemies die: opens door (swing animation 0.63s), spawns angel (if present) simultaneously with door opening. Angel fades in + descends over 1.2s. XP level-ups deferred on angel stages.

### Summons System (`summons.js`)
- **Strikes:** side-swords that launch from player toward enemy. Locked angle (not homing), acceleration from 3→14 T/s, 0.15s hover before launch, splash damage on hit
- **Stars:** rapid-drops from above enemy position. Speed 11 T/s, vertical fall, AoE on ground impact
- **Meteors:** heavy balls from above the door (8T above arena center). Locked angle, 5.5 T/s, splash damage + ground explosion ring
- All elemental: fire/ice/poison/bolt with status effects
- Spawn only when enemies exist; projectile updates always run (continue after enemies die)

### Chapters (11 total)
| Ch | Name | Stages | Theme |
|----|------|--------|-------|
| 0 | Tutorial | 3 | Learn basics |
| 1 | Verdant Prairie | 25 | Grass green floor, forest boundary |
| 2 | Storm Desert | 25 | Desert sand floor |
| 3 | Abandoned Dungeon | 25 | Dark stone |
| 4 | Crystal Mines | 25 | Deep cave blue |
| 5 | Lost Castle | 25 | Dark teal |
| 6 | Cave of Bones | 25 | Purple cave |
| 7 | Barrens of Shadow | 10 | All boss stages |
| 8 | Silent Expanse | 25 | Dark dungeon |
| 9 | Frozen Pinnacle | 25 | Sandy gold |
| 10 | Land of Doom | 25 | Crimson red |

Boss every 5 stages (mini-boss at 5/10/15/20, chapter boss at 25). Chapter 7: `bossInterval: 1`, every stage is a boss with teammates.

### Enemy System
- 111 enemy type blueprints in `enemyTypes.js` (pure data)
- 30 canvas draw functions in `enemyDraw.js` (used for 2D fallback)
- 20+ Three.js mesh factories in `entities3d.js`
- 10 AI movement functions: `hoverLunge`, `stalkCharge`, `stationary`, `lobber`, `randomDash`, `chase`, `spinThrow`, `spinCharge`, `bounce`, `burrow`
- 11 attack patterns: `none`, `single`, `bouncySingle`, `lobSingle`, `lobMulti`, `fan`, `cardinal`, `cardinal8`, `barrage`, `random`, `summon`
- Debug mode: `noDmgToEnemy` honored by bullets, orbitals, summons

### Bullet System
- Player arrows auto-fire at nearest enemy when stationary
- Ricochet, bolt (lightning chain), pierce, bouncy, holy touch mechanics
- Enemy bullets: skip player hit checks during `dying`/`dead` states
- Stuck arrows: cosmetic arrows embedded in arena edges (3D mesh pool)

### Equipment System (Persistent)
- 4 slots: weapon, armor, ring1, ring2
- 17 items: 5 weapons, 5 armors, 7 rings across 5 rarities
- Forge system: max level +5, costs 10/25/50/100/200 gems

### Skill System (Per-Run)
- 71 skills across 15 categories, reset each run
- Earned on level up (choose 1 of 3) or from angel encounters

### Persistence (localStorage)
Stored under `calebArcadeData.archers`: `bestStage`, `coins`, `chaptersCleared`, `inventory`, `equipped`, `nextIid`, `debug`.

### HUD (2D Canvas Overlay)
- Top center: XP bar with level indicator
- Top right: gems count + pause button
- Bottom right: stage indicator (fades out)
- Pause screen: debug toggles (invincible player, invincible enemies), skill list

## Key Design Decisions
1. **Hybrid rendering** — Three.js for gameplay visuals, Canvas 2D for UI/menus/HUD
2. **No build tools** — vanilla JS ES modules, Three.js via CDN importmap
3. **GLB player model** — animated character loaded via GLTFLoader, all other entities procedural 3D meshes
4. **Mesh pooling** — arrows, bullets, effects use fixed-size pools to avoid GC pressure
5. **Material caching** — `getCachedMaterial()` with quantized opacity prevents unbounded cache growth
6. **Dual camera** — orthographic (default) and perspective (toggle) maintained simultaneously
7. **Game-to-world mapping** — `gameToWorld()` and `worldScale()` bridge 2D game logic coordinates with 3D positions
8. **Tile-based distances** — all spatial values in tile units via `T()`, consistent across screen sizes
9. **Data-driven enemies** — blueprints in `enemyTypes.js`, logic in separate modules
10. **Procedural audio** — Web Audio API, no audio files

## Input
- Keyboard: Arrow keys / WASD
- Touch: Virtual joystick (drag from touch point, disabled during dying/dead)
- Auto-fires arrows when not moving
- Level-up: tap card or press 1/2/3 keys

## Pause Menu
- **Close button** (top right, X icon, 32px·s): resumes via `game.state = game._pausedFrom || 'playing'`
- **Quit button** (top left, red, 56px·s wide): returns to chapter select via `game.returnToEquip = true`
- Buttons drawn in `games/archers-3d/js/hud.js`, registered in `pauseClickRegions` for hit-testing

## Tile-Based Distance System (implementation details)

Beyond the design-decision summary above: `enemyTypes.js` (3770 lines) uses an auto-conversion block at module load that divides all spatial fields by `T_REF = 500/11`, avoiding 100+ manual edits in that data file. `enemies.js` has `scaleAiParams()` that converts tile-based aiParams to pixels at spawn time, so `enemyAI.js` only needed fallback-default updates rather than structural rewrites.

Modules that were intentionally **not** converted (they operate in already-pixel/UI space): `enemyDraw.js` (draws relative to enemy position/radius, already world-space pixels at render time), `screens.js`, `hud.js`, `draw.js` (use arena() bounds directly for UI layout). Caveat: the `T_REF = 500/11` reference assumes original tuning was done at 500px arena width — if tuning was at a different width, tile values would be slightly off.

## Bolt Chain Lightning (visual + range)

Bolt chain range was 80px (nearly invisible); raised to 200px — still less than ricochet's 300px because bolt triggers per-hit while ricochet only fires once per arrow. Added a visible lightning arc effect: pre-computed 4-segment zigzag between source and chained enemy, yellow with glow (no shadowBlur — kept cheap), 150ms lifetime, swap-removed on life≤0. Wired across:
- `state.js` — `boltArcs: []` array
- `bullets.js` — `spawnBoltArc()` pre-computes the zigzag geometry
- `particles.js` — `updateBoltArcs(dt)` and `drawBoltArcs(ctx)` (core line + wider glow pass)
- `main.js` — reset on `nextStage`, update + draw in main loop

## Level Editor (`games/archers/edit.html`)

Standalone level editor for designing stage layouts. Targets the **legacy 2D Archers source** (the editor predates the 3D rewrite); the export schema is consumed by both versions via `archers-map.json`. ES modules import `chapters.js`, `enemyTypes.js`, `constants.js` from the game source. All editor state persists in localStorage.

### Groups & stage structure

Stages are organized into groups in the left panel:
- `common` — shared default stage designs (25 by default), used across all chapters
- `angel` — angel encounter stages (5 by default)
- `ch0` — Tutorial chapter (3 stages + 1 final boss)
- `ch1` .. `ch10` — per-chapter stages

Each stage has a `type`: `stage`, `angel`, `boss`, `final_boss`. Within a group, sorting is `stage → angel → boss → final_boss`.

### Chapter config

Each chapter group (`ch0`–`ch10`) has editable config:
- `stageCount` (int) — total stages in the chapter at gameplay time
- `angelStages` (string) — comma-separated 1-indexed stage numbers, e.g. `"5,15,25"`
- `bossStages` (string) — comma-separated 1-indexed stage numbers, e.g. `"10,20,30"`
- Final boss is implicit (last stage of the chapter)

### Entity legend system

Each stage maintains its own `el` (entity legend) mapping single chars to entity typeKeys. This is the key design decision: it prevents index drift when adding new entity types — adding new enemies never breaks existing stage data. Char pool: `123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`.

**Special entities (all groups):** `_player`, `_angel`, `_chest`, `_enemy1`, `_enemy2`, `_enemy3`. The `_enemyN` keys are generic slots replaced programmatically at runtime. Only one `_player` per stage (editor enforces).

**Chapter-specific entities:** `ch0`–`ch10` groups also expose enemies/bosses from that chapter's `enemyPool` and `bossPool` (read from `chapters.js` + `enemyTypes.js`), using their actual `ENEMY_TYPES` typeKey (e.g. `greenBat`, `bossRedPlant`).

Common and Angel groups only show special entities.

### Terrain types

`0` floor (chequerboard), `1` wall, `2` water (`~`), `3` spikes (`^`).

### Editor features

- Grid: default 11×15, width always odd (3–49), height 3–50. Zoomable cells 8–64px. Pan with middle-click or alt-click.
- Two layers: terrain and entities, opacity crossfade.
- Place: left-click. Erase: right-click. Rect fill: shift-click. Flood fill: F key.
- Copy/paste: Ctrl+C / Ctrl+V copies the current stage onto another.
- Undo: Ctrl+Z, up to 50 steps.
- Add/remove stages: `+` per group, `x` per row (hover to reveal).
- Export/Import: JSON v2 (registry + maps + config).
- Entity legend drawn beside the grid with placed-entity counts.

**Keyboard shortcuts:** `1/2/3` enemies 1/2/3, `W` wall, `T`/`E`/`Tab` toggle layer, `F` flood fill, `Ctrl+Z` undo, `Ctrl+C`/`Ctrl+V` copy/paste, `+`/`-`/scroll zoom.

### localStorage keys

- `archers-map` — map data (stage grids)
- `archers-stage-registry` — group memberships and types
- `archers-chapter-config` — per-chapter stage count + angel/boss indices
- `archers-map-last` — last edited stage `{ group, id }`

### Export schema (`archers-map.json` v2)

```json
{
  "version": 2,
  "registry": { "<groupId>": [{ "id": "<groupId>-<n>", "type": "stage|angel|boss|final_boss" }, ...] },
  "maps":     { "<id>": { "w": 11, "h": 15, "t": "00010...", "e": ".....1...", "el": { "1": "_player" } } },
  "config":   { "ch0": { "stageCount": 3, "angelStages": "", "bossStages": "" }, ... }
}
```

Per stage: `t` is the terrain grid as a flat string of length `w*h` (each char is a base-36 terrain ID); `e` is the entity grid (`.` = empty, anything else looks up into `el`). Cell `(x, y)` is at string index `y*w + x` (row-major, top-left origin). A stage missing from `maps` is treated as default: all floor, player at bottom-center.

### Reading and writing programmatically

To **read** a stage: parse JSON v2, find `registry[groupId]` to get `id` + `type`, look up `maps[id]`. For each cell at `(x,y)`: `terrain = parseInt(t[y*w+x], 36)`, `entity = el[e[y*w+x]]` (or null if `.`). Chapter config in `config[groupId]` gives stage count and angel/boss indices.

To **write** a stage: ensure the `id` exists in `registry[groupId]` with the right `type`. Build `t`, `el`, and `e` strings. Always keep `w` odd.

## Bug Fixes
1. **Arrow OOB margin too loose** — player arrows and enemy bullets used a 20px out-of-bounds margin on all sides of the arena, making them visibly fly past the arena edge before disappearing. Tightened to `BULLET_R` / `ENEMY_BULLET_R` on left/right/bottom. Top stays at 20px because the door wall extends above the arena and absorbs arrows there before they hit OOB. (`games/archers/js/bullets.js`)

## Files (legacy 2D source — `games/archers/`)
The 2D archers source is preserved primarily for the level editor. Notable files:
- `games/archers/edit.html` — level editor
- `games/archers/js/chapters.js` — chapter definitions (enemy pools, boss pools)
- `games/archers/js/enemyTypes.js` — enemy type definitions (typeKeys, stats, colors)
- `games/archers/js/constants.js` — `TOTAL_CHAPTERS=10`, `STAGES_PER_CHAPTER=25`, etc.
