---
color: green
isContextNode: false
---
# Worms

Hedgewars-inspired artillery combat game featuring turn-based strategy with destructible terrain, 28 weapons, expressive worm sprites, and AI opponents. Players take turns moving worms across procedurally generated landscapes, using an arsenal of projectile, melee, and utility weapons to eliminate the opposing team.

## Features

- **Turn-based combat** with 2 teams (human vs AI) on destructible 2D terrain
- **28 weapons** spanning projectiles, melee, walking entities, placed items, terrain tools, movement utilities, and air strikes
- **Procedural terrain** using Perlin noise with caves, overhangs, and plateaus
- **11 biomes** each with unique terrain textures, sky themes, water styles, and edge details
- **AI opponent** with difficulty-aware weapon selection and auto-ending turns
- **Expressive worm sprites** with facial expressions, weapon animations, and death sequences
- **Persistent environmental hazards** including fire particles, gas clouds, and proximity mines
- **Sound effects** via WebAudio (ZzFX)

## Architecture

Two separate codebases exist:

- **Legacy monolith** (`index.html`): Single-file game with inline SVG graphics, supported by `styles.css`, `game.js`, `noise.js`, and `zzfx.js`. This version received the visual overhaul, weapons expansion, and 404 fixes.
- **Modular version** (`index-modular.html` + `js/` folder): 25 ES module Hedgewars port totaling ~23,000 lines. A faithful port of Hedgewars Pascal source with gear/state machine systems, bit-flag message passing, and a complex AI action queue.

The two versions share nothing and are maintained independently.

## Visual Overhaul

### Terrain Generation
- Custom Perlin noise with fractal Brownian motion (6 octaves), seeded from `Date.now()` for unique terrain each game
- 2D noise field carves caves and overhangs; secondary noise pass creates jutting terrain near surface
- Per-pixel rendering with noise-based color variation, dithering, and depth darkening
- Biome-specific edge details: grass blades, snow caps, hanging vines, flowers, crater marks, concrete gravel

### Biomes (11 total)
Grasslands, Desert, Arctic, Hell (lava water + glowing terrain), Space (stars + nebula), Jungle, Medieval (castle silhouettes), Cheese (Swiss cheese holes), Manhattan (city skyline + lit windows), Cartoon (rainbow arcs), Construction (crane silhouettes)

### Sky and Water
- 3-stop gradient sky per biome with parallax scrolling and biome-specific backgrounds
- Multi-frequency animated wave surface (3 sine layers) with foam highlights and specular reflections
- Lava variant for Hell biome

### Worm Sprites
- Pill/capsule body with team-colored gradient shading
- Expressive eyes with pupils and shine; facial expressions change with HP (determined, scared, hurt)
- Visible weapon in hand with arm following aim angle
- Walk animation with proper feet; death animation with tombstone and rising angel

### Explosions
- Radial fire gradient (white core to dark edge), smoke ring with rising puffs, flying sparks
- Crater visuals with scorch gradient, depth shading, and random burn marks

## Weapons

28 total weapons (6 original + 22 added):

**Projectile**: Cluster Bomb (splits into 5 bomblets), Banana Bomb (powerful cluster variant), Holy Hand Grenade (100 damage, massive radius), Homing Missile (locks onto nearest enemy), Mortar (splits into 4 fragments), Petrol Bomb (leaves burning fire), Hadouken (zero-gravity energy ball)

**Melee**: Baseball Bat (huge horizontal knockback), Fire Punch (strong upward launch), Prod (tiny nudge for ledge kills)

**Walking Entities**: Sheep (walks and explodes on contact), Super Sheep (walks then flies, user-guided), Old Woman (slow walker, 6s fuse), Skunk (leaves poison gas trail)

**Placed Items**: Mine (proximity trigger, 1.5s arm time), Dynamite (5s fuse)

**Terrain Tools**: Blowtorch (horizontal tunnel), Pneumatic Drill (vertical tunnel), Girder (place 80px bridge)

**Movement**: Ninja Rope (grappling hook with pendulum physics), Parachute (slow fall with horizontal control)

**Air/Super**: Napalm Strike (airstrike + lingering fire), Concrete Donkey (bounces 8 times destroying terrain)

## Bug Fixes

### Controls and Movement (Modular Version)
- **Human always goes first**: `randomizeFirstTurn()` now scans for human clan first instead of random selection
- **Movement speed 4.5x increase**: `cHHStepTicks` reduced from 6 to 2, walk step increased to 3px per call (~90px/sec)
- **dx = -0 bug**: Left movement set `dx = -0` which broke `facingLeft` getter; fixed to use `-cLittle`
- **AI turn blocking**: AI turns now auto-end when hedgehog becomes undriven instead of waiting full 45s timer

### 404 Audit
- All resource references (styles.css, game.js, noise.js, zzfx.js) confirmed loading correctly
- All graphics are inline SVG and base64-encoded bitmaps with no external image/audio dependencies
- **Missing back button restored**: Added standard arcade back button (`← Games`) lost during SVG-based rewrite

## Files
- games/worms/index.html (legacy monolith)
- games/worms/index-modular.html + js/ folder (modular version, 25 ES modules)
- games/worms/styles.css
- games/worms/game.js, noise.js, zzfx.js

[[games-index]]
