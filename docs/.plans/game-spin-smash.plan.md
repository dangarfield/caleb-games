# Game: SpinSmash

## Concept
A Beyblade-inspired arena battler with roguelike run progression. Drop into a glowing arena as a spinning top — knock all enemies off the edge before they do the same to you. Between waves, choose run perks. Between runs, spend shards on permanent upgrades.

Genre gap filled: no physics-based arena combat game in the arcade yet.
Target: Garfield boys (~7+, touch tablet).

## Core Mechanic
Move your spinning top with touch/drag. Dash (spacebar/tap) to burst forward with heavy knockback. Collisions use mass + velocity to determine who gets launched. Clear all enemies from the arena to advance. Arena edge = death.

## Controls

### Touch (primary — mobile/tablet)
- **Virtual joystick:** press anywhere on the left ~60% of screen to spawn a joystick at touch point. Move finger relative to that origin to steer (direction + distance = direction + speed).
- **Dash button:** fixed position, bottom-right corner. Large circular tap target, always visible on touch devices.
- Joystick + dash button only render on mobile/touch viewport (detected via pointer:coarse or screen width).

### Mouse (desktop)
- Move toward cursor position (click-and-hold to move, release to stop).
- Left-click to dash in cursor direction.
- Spacebar also dashes.

### Keyboard (desktop fallback)
- WASD / Arrow keys for movement.
- Spacebar for dash.

## Chassis Selection (start of run)
| Chassis | Focus | Traits |
|---------|-------|--------|
| Standard | Balanced Output | Clean handling, reliable impact |
| Grip-Tech | Heavy Control | More mass and bite, lower top-end speed |
| Drift-Pin | Fast Drift | Lighter contact, higher speed, less sluggish drift |

## Player Stats
- Mass (determines knockback dealt/received)
- Radius (visual size, linked to mass but not 1:1)
- Top Speed
- Friction (deceleration rate)
- Dash Amount (fuel bar)
- Dash Regen (how fast dash refills)
- Stun Duration (how long enemies are stunned on hit)

## Enemy Types (12 archetypes)
| Archetype | Color | Size | Behavior | First appears |
|-----------|-------|------|----------|---------------|
| Hunter | #FF00EA | Medium | Chases, dashes at close range | Wave 1 |
| Brute | #FF2A2A | Large | Slow, heavy dash, extra knockback on contact | Wave 2 |
| Blaster | #FFF100 | Medium | Fires 3 projectiles every 2s, doesn't dash | Wave 3 |
| Mirror | #FFFFFF | Small | Copies all player perks, weaker stats (×0.6) | Wave 4 |
| Juker | #FFAA00 | Small | Fast, dashes at oblique angles to bait | Wave 5 |
| Titan | #8A2BE2 | Very Large | Massive, slow, huge knockback | Wave 6 |
| Phantom | #00FF88 | Medium | Cycles invisible/visible, burst on appear | Wave 8 |
| Warden | #FF7A00 | Medium | Stun-immune, dashes | Wave 9 |
| Aura | #8A2BE2 | Large | Fires radial burst + nova when player in aura range | Wave 21+ |
| Sawgrinder | #39FF6A | Medium | Deliberately rides buzzsaw for slingshot | Arena 3 |
| Sentinel | #FF7A3D | Large | Stun-immune, fires fans toward buzzsaw | Arena 3 |
| Splitter | #7CFFF6 | Small | Flees player, fragments into 2 on buzzsaw hit | Arena 3 |

All enemy dashes show a **warning telegraph line and pause** before executing.

## Arenas (3 tiers)
| Arena | Waves | Shape | Hazard |
|-------|-------|-------|--------|
| Arena 1 | 1–20 | Circle | None (pure combat) |
| Arena 2 | 21–40 | Circle + rotating hexagon | Hex shoots from dangerous sides, 2 safe sides shown green |
| Arena 3 | 41+ | Oval | Orbiting buzzsaw that lunges across arena toward player |

- Touching the arena edge = instant death
- Arena slowly shrinks after a delay (not immediately)
- All hazard dashes show warning line + pause

## Progression

### Per-Run Upgrades (pick 1-of-3 between waves, or SKIP for +3 shards)
Rarity tiers: Common, Rare, Epic, Legendary (legendary unlocked at wave 10+).
Synergy perks require their prereq perk to be owned first, appear from wave 10+.
Each perk belongs to a type (Body/Weapon/Disruption/Core/Arena).

**Common (Body):**
- Heavy Plating — Mass +30%, Speed -10%
- Aero Shell — Mass -20%, Top Speed +40%
- Kinetic Bumper — Bounce Restitution +50%
- Gyro-Stabilizer — Agility +40%, Spin decay -10%
- Reinforced Rim — Radius +12%, Mass +12%
- Low Profile — Radius -15%, Mass -10%
- Tight Turn Servos — Friction -2%, Top Speed -5%

**Common (Weapon):**
- Twin Emitter — On Dash, fire 2 projectiles forward
- Rear Guard — On Dash, fire 1 projectile backward
- Side Thrusters — On Dash, fire 2 projectiles perpendicular

**Common (Core):**
- Static Charge — Spin regen +25% when not dashing

**Rare (Body):**
- Magnetic Anchor — High friction near arena edge, resists ring-outs
- Kinetic Battery — Top Speed increases the longer you go without dashing
- Magnet Core — Slightly pulls nearby enemies toward you
- Adrenal Drive — Speed improves as Dash Energy gets lower

**Rare (Weapon):**
- Plasma Orbits — 3 energy blades orbit you, knockback enemies
- Nova Burst — On Dash, fire 8 projectiles radially
- Slow Orbiter — 1 large long-range orbit blade
- Ring Burst — Every 4s, emit ring of 6 slow projectiles
- Trailing Sparks — While dashing, fire projectiles backward

**Rare (Core):**
- Flywheel Tuning — Dash launch speed +15%, Dash duration -1 frame
- Second Wind — When Dash Energy hits 0, refill 30% once per wave

**Rare (Disruption):**
- Phase Shift — Dash grants extra invulnerability, shorter cooldown

**Epic (Body):**
- Ablative Plating — Knockback taken -25%, Mass -10%

**Epic (Weapon):**
- Glitch Mines — Drop explosive trap every 3s
- Shockwave Emitter — Every 5s, emit kinetic repulsor field
- Plasma Wake — Drop voltaic mine at position on Dash
- Focus Lance — On Dash, fire single fast heavy projectile forward
- Spiral Array — Every 2.5s, fire rotating spiral of 4 shots
- Detonator Rounds — On Dash, fire 4 projectiles that nova on impact

**Epic (Body):**
- Siphon Core — Passively drain Dash Energy from nearby enemies

**Epic (Disruption):**
- Stun Lens — Stuns +75%, player knockback -35%

**Epic (Core):**
- Greed Core — +1 Shard per Big Hit, Mass -15%
- Overcharge Core — Max Dash Energy +25%, passive regen -15%

**Legendary:**
- Singularity — Center of arena pulls all tops inward
- Goliath Chassis — Mass ×3, Radius ×1.6, Speed -30%
- Quantum Reactor — Dash cost and cooldown halved
- Barrage Core — On Dash, 12-shot radial burst

**Synergy chains (require prereq owned, wave 10+):**
- Mass chain: Heavy Plating → Plated Treads → Shock Chassis → Gyro-Counterweights
- Speed chain: Aero Shell → Slipstream Frame → Afterburner Vents → Phase Skater
- Defense chain: Stun Lens → Hardened Lens → Retaliation Field → Kinetic Dampers
- Ordnance chain: Nova Burst → Piercing Rounds → Kinetic Warheads → Overpressure Rounds → Stabilized Barrels
- Sentinel chain: Plasma Orbits → Charged Blades → Resonant Field → Centrifugal Stabilizers
- Core chain: Overcharge Core → Capacitor Bank → Overclocked Regen → Singularity Core

### Build Identity System
Perks are tagged to archetypes: MASS, SPEED, DEFENSE, ORDNANCE, SENTINEL, CORE.
The dominant archetype(s) determine a named "build" shown on HUD (e.g., GUNSLINGER, JUGGERNAUT, OMNI-CHASSIS).
The stat bar on the wave-cleared screen shows color-coded segments per archetype contribution.

Pure builds: JUGGERNAUT, BLITZ RUNNER, BULWARK, GUNSHIP, AEGIS BLADE, OVERCLOCKER.
Hybrid builds (top 2 archetypes): STASIS WARD, REACTOR TANK, RAILGUNNER, PULSE WARDEN, OVERDRIVE RACER, FORTRESS, TURRET, GUARDIAN, SKIRMISHER, SIEGE ENGINE, IRON WARDEN, RAMMING SPEED, ARSENAL, GUNSLINGER, WHIRLWIND.
Balanced (no dominant): OMNI-CHASSIS.

Rarity weighting for build scoring: common=1, rare=1.6, epic=2.3, legendary=3.2.
Synergy perks get x1.35 bonus weight.

## Research Reference
Full source code (TopClash v1.39) saved at `games/spin-smash/research/`:
- `data.js` — Complete PERK_DB with all apply/init/tick/onRev functions, UPGRADE_DEFS with cost curves, CHASSIS_DEFS, PERK_ARCHETYPES mapping, BUILD_NAMES, draft logic (getDraftCards), synergy unlock system
- `engine.js` — Physics loop, collision resolution (mass-weighted impulses, restitution, anti-lockout separation), arena geometry (circle/oval), dash mechanics (fuel/cooldown/edge-guard), hexagon hazard, buzzsaw hazard (patrol-telegraph-lunge-return), camera zoom, mobile joystick, aim assist
- `entities.js` — Top class (player stats, dash, perks), Enemy class (12 archetypes with AI behaviors), Boss class (5 attack patterns, health, telegraph), Projectile, Particle
- `ui.js` — Draft screen (3 cards + skip), build identity meter, ascension screens, upgrade shop, chassis select, toasts, HUD
- `utils.js` — Vec2, Utils helpers, ObjectPool
- `audio.js` — Procedural Web Audio SFX (hit, dash, explosion, shard, wave-start, boss-spawn, game-over, legendary, upgrade)

## Key Differences from Source (our implementation)
- Single `index.html` file (no separate .js modules)
- Use `calebArcadeData.spinsmash` for localStorage (not `topspin_neon_save`)
- No CrazyGames SDK (no ads, no CG.happytime, no CG.requestRewarded)
- No daily rewards system
- No rewarded ad revive — just die
- No mobile aim assist — pure manual aiming only
- Canvas-drawn HUD/game-over (not HTML overlays for in-game, HTML OK for menus)
- Our color palette (background #0a0a2e, accent #6c5ce7, glow #a29bfe)
- Back button href = ../../index.html
- Start screen: autoplaying demo (AI vs AI at low opacity) behind the menu UI
- Menu shows: game title, shard count, best wave, Arena 1/2/3 buttons (unlocked ones only), "Upgrades" button
- Upgrades view: permanent upgrades shop + chassis select + back button
- Chassis selection lives in the upgrades view (not a separate pre-run screen)

### Permanent Upgrades (shard shop, between runs)
| Upgrade | Max Level | Effect per Level |
|---------|-----------|-----------------|
| Tungsten Core | 30 | +15% Impact Mass |
| Magnetic Bearings | 30 | +10% Spin Retention (faster Dash uptime) |
| Plasma Thrusters | 30 | +15% Velocity Output |
| Shard Harvester | 30 | +10% Shard Yield |
| Quick-Charge Relays | 30 | -5% Dash Cooldown |
| Stun Capacitors | 30 | +5% Stun Duration |
| Arena Expander | 10 | +2% Arena Radius |
| Fabricator Start | 12 | +1 Random Common/Rare Perk at run start |

### Shards
- Collected by eliminating enemies (fly out on KO, must collect before they fade)
- Spent on permanent upgrades between runs
- Shard Harvester multiplies yield

## Systems Required
- [x] 2D physics (velocity, mass, collision impulse, friction)
- [x] Arena boundary (ellipse/circle geometry, death on touch)
- [x] Dash mechanic (fuel bar, cooldown/regen)
- [x] Wave system (spawn patterns, escalating difficulty)
- [x] Enemy AI (per-type behaviors above)
- [x] Per-run upgrade picker (between waves)
- [x] Permanent upgrade shop (between runs, shard cost)
- [x] Shard economy (collect, save, spend)
- [x] Arena hazards (rotating hex, saw)
- [x] Particle effects (knockback sparks, dash trail, shard pickup)
- [x] Arena shrink timer
- [x] Warning line system for enemy dashes

## Conventions (from arcade-build.instructions.md + knowledge/)
- [x] Single self-contained games/spin-smash/index.html
- [x] Canvas 2D, dark-theme palette, touch-action:none
- [x] Back button href = ../../index.html
- [x] Canvas HUD pill, canvas game-over, calebArcadeData localStorage

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Age-appropriate difficulty; clear start overlay
- [ ] Card added to root index.html; row + count in docs/games-index.md
- [ ] docs/game-spin-smash.md created

## Start Screen & Menu Flow

### Main Menu (state: 'menu')
- **Background:** autoplaying demo — two AI tops fighting in the arena at reduced opacity (0.3–0.4), giving a preview of gameplay. Simple AI: both chase each other and dash periodically.
- **Overlay (arcade-style, matching other games):**
  - Game title "SPIN SMASH" with glow
  - Shard count + Best Wave display
  - **Arena buttons:** "ARENA 1" always shown. "ARENA 2" and "ARENA 3" shown only when unlocked. Clicking starts run at that arena's starting wave.
  - **"UPGRADES" button** — opens upgrade view
- **Back button** (top-left, `../../index.html`) — always visible

### Upgrades View (sub-screen of menu)
- Shows all permanent upgrades (buy with shards)
- Shows chassis selection (Standard free, Grip-Tech 250, Drift-Pin 75) — current chassis highlighted
- Shard balance shown at top
- "BACK" button returns to main menu

### In-Game HUD (canvas-drawn pill, top-center)
- Wave number, Shard count, Dash energy bar, Build name + archetype meter

### Wave-Cleared Screen (HTML overlay)
- "WAVE CLEARED: UPGRADE MODULE"
- Build identity bar
- 3 perk cards (pick 1) or skip (+3 shards)

### Game Over (canvas-drawn)
- "SHATTERED" title
- Wave reached, shards earned, quip
- "PLAY AGAIN" button, "MENU" button

## Build Checklist
- [x] Concept picked
- [x] Spec written
- [x] Per-run upgrades supplied
- [ ] Build game
- [ ] Review pass
- [ ] back-button-check green
- [ ] Docs sync
- [ ] Ship


## Detailed Physics & Entity Specs

### Physics System

**Fixed Timestep:**
- `fixedDtMs = 1000 / 60` (~16.667 ms per step)
- Accumulator pattern: each `requestAnimationFrame` adds elapsed ms to `accumulator`, then drains in `fixedDtMs` chunks (max 50 steps per frame)
- Mobile devices cap catch-up to 3 physics steps per rendered frame to preserve input responsiveness
- `dtf` (delta-time-factor) = 1.0 per step at 60fps; all multipliers are tuned to this baseline

**Force Application:**
- `entity.applyForce(force)` → `vel += force * (1 / mass)`

**Friction Model (per-frame multiplicative decay):**
- `vel *= Utils.decayPow(friction, dtf)` where `decayPow(factor, dtf) = Math.pow(factor, dtf)`
- This correctly scales the per-frame friction factor across variable timesteps

**Max Speed Clamping:**
- If `vel.mag() > curMaxSpeed`, velocity is clamped: `vel = vel.norm() * curMaxSpeed`
- During dash: `curMaxSpeed = Math.min(25, maxSpeed * 1.15)`
- Otherwise: `curMaxSpeed = maxSpeed * (1 + adrenalSpeedBonus)`

**Collision Resolution (mass-weighted impulses):**
1. **Overlap separation** — push entities apart proportional to inverse mass:
   - `a.pos -= normal * overlap * (b.mass / totalMass)`
   - `b.pos += normal * overlap * (a.mass / totalMass)`
2. **Impulse calculation:**
   - `relVel = b.vel - a.vel`
   - `velAlongNormal = dot(relVel, normal)`
   - Skip if separating (`velAlongNormal > 0`)
   - `e = min(a.restitution, b.restitution)`
   - `jVal = -(1 + e) * velAlongNormal / (1/a.mass + 1/b.mass)`
   - Apply: `a.vel -= normal * jVal * (1/a.mass)`, `b.vel += normal * jVal * (1/b.mass)`
   - Knockback-taken multipliers (`knockbackTakenMult`) scale the impulse on the player side
3. **Anti-lockout separation** (`minSep = 6.5`):
   - After impulse, if `postVelAlongNormal < 6.5`, inject additional separation velocity split by mass ratio
   - Prevents high-mass entities from grinding/sticking

**Restitution values:**
- Base Entity: 1.25
- Top (player & enemy): 1.3 (bouncier, air-hockey snap)

---

### Player Top Stats (exact values from source)

**Base Top constructor (isPlayer=true):**
| Stat | Value |
|------|-------|
| radius | 25.2 |
| mass | 4 (constructor), then ×1.1 not applied here — see startRun |
| restitution | 1.3 |
| spin | 100 |
| maxSpin | 100 |
| spinDecay | 0.05 |
| speed | 1.9 |
| maxSpeed | 21 |
| friction | 0.94 |
| dashCooldownMax | 20 frames |
| dashDuration | 8 frames (then ×0.65 in startRun → 5 frames) |
| dashCost | 50 spin |
| dashGraceMax | 30 frames (player), 10 frames (enemy) |

**startRun modifications to player:**
- `speed *= 1.1`
- `maxSpeed *= 1.3`
- `dashDuration = round(dashDuration * 0.65)` → effectively 5 frames

**Chassis modifiers (applied after startRun base):**
| Chassis | friction | speed mult | maxSpeed mult | mass mult |
|---------|----------|-----------|--------------|----------|
| Standard | 0.94 (unchanged) | 1.0 | 1.0 | 1.0 |
| Grip-Tech (`flat`) | 0.88 (set) | ×0.8 | 1.0 | ×1.2 |
| Drift-Pin (`spike`) | 0.965 (set) | ×1.15 | ×1.45 | ×0.85 |

**Permanent upgrade modifiers (compound per level):**
| Upgrade | Formula |
|---------|---------|
| Tungsten Core (mass) | `mass *= (1 + level * 0.15)` |
| Magnetic Bearings (spin) | `spinDecay *= (1 - level * 0.10)` |
| Plasma Thrusters (speed) | `speed *= (1 + level * 0.15)`, `maxSpeed *= (1 + level * 0.15)` |
| Quick-Charge Relays (cooldown) | `dashCooldownMax = max(20, round(dashCooldownMax * (1 - level * 0.05)))` |
| Stun Capacitors (stun) | `stunDurationMult = 1 + level * 0.05` |
| Arena Expander | `arenaExpansionMult = 1 + level * 0.02` (applied to arena radius, not player) |

---

### Dash Mechanics

**Fuel cost:** `spin -= dashCost` (50 spin)

**Cooldown:** `dashCooldown = dashCooldownMax` (20 frames base); cannot dash while cooldown > 0 or spin < dashCost

**Invulnerability:** `invulnTimer = max(invulnTimer, dashDuration)` — player is invuln for the entire dash duration

**Edge guard (`getDashLaunchSpeed`):**
- Calculates `safeDistance` = distance from current position to arena boundary along dash direction (quadratic solve for circle, generalized for ellipse)
- Computes `travelFactor` from friction geometric series over dash frames
- Caps launch speed: `cappedSpeed = min(dashSpeed, safeDistance / travelFactor)`
- If capped, sets `dashEdgeGuard = frames + 8` to keep calling `keepDashInsideArena`

**`keepDashInsideArena`:**
- If position exceeds arena boundary: clamp position inside, zero outward velocity component, cancel dash (`dashTimer = 0`, `invulnTimer = 0`)

**Grace timer:** After dash ends, `dashGraceTimer = dashGraceMax` (30 frames for player). During grace, touching the arena edge does NOT kill — provides edge-death immunity post-dash.

**Post-dash brake:** When `dashTimer` transitions from >0 to ≤0, apply one-time `vel *= 0.6`

**Dash launch speed:** `maxSpeed * 1.0 * dashSpeedMult` (before edge-guard cap)

**Player dash contact with enemy:**
- Extra knockback: `enemyTop.applyForce(fromPlayerToEnemy * 10 * dealtMult)`
- Brake: `playerTop.vel *= 0.62`
- Invuln cancel: `playerTop.invulnTimer = 0`

---

### Enemy Archetypes

All enemies get base multipliers after archetype assignment:
- `mass *= 2.5`
- `speed *= 1.5`
- `maxSpeed *= 1.5`
- `knockbackDealtMult = 0.8`

| Archetype | Color | mass | speed | maxSpeed | radius | Special |
|-----------|-------|------|-------|----------|--------|---------|
| hunter | #FF00EA | 3.5 | 1.1 | 14 | 25.2 | Dashes at player when <150 dist, timer>400, telegraph 30 frames |
| brute | #FF2A2A | 8 | 0.6 | 9 | 30.8 | Dashes at player when <180 dist, timer>100, telegraph 45 frames; extra +40 force on dash-contact |
| blaster | #FFF100 | 4 | 1.0 | 21 | 25.2 | Fires 3 projectiles (120° spread) every 120 frames; does not dash |
| mirror | #FFFFFF | 2.4 | 0.72 | 12.6 | 25.2 | Copies all player perks; stats = base×0.6 |
| titan | #8A2BE2 | 16 | 0.45 | 7 | 39.2 | Slow, massive; visual aura ring at r=150 (cosmetic) |
| phantom | #00FF88 | 3 | 1.4 | 21 | 25.2 | 90-frame cycle: invisible (alpha=0.06) for 60 frames, then appears + force burst (dir×12) for 30 frames |
| warden | #FF7A00 | 5 | 0.8 | 10 | 28 | stunImmune=true; dashes when <190 dist, timer>150, telegraph 35 frames |
| aura | #8A2BE2 | 12 | 0.55 | 8 | 35 | auraRadius=115; every 280 frames if player within aura: fires 14 radial projectiles + nova |
| juker | #FFAA00 | 1.6 | 1.7 | 24 | 21 | Dashes at oblique angle (±0.55–0.85 rad offset from player direction), timer>70, <230 dist, telegraph 20 frames |
| sawgrinder | #39FF6A | 6.5 | 1.15 | 15 | 27 | Seeks buzzsaw for slingshot knockback; dashes toward saw if <340 dist and >60, telegraph 26 frames, grindCooldown=260; also dashes at player if <170 dist, timer>160, telegraph 32 frames |
| sentinel | #FF7A3D | 9 | 0.35 | 4 | 32 | stunImmune=true; barely moves; fires 5-shot fan toward buzzsaw every 130 frames when saw is <300 dist |
| splitter | #7CFFF6 | 2.2 | 1.25 | 16 | 22 | Flees player (inverted chase direction); fragments into 2 smaller copies on buzzsaw hit; does not dash |

**Splitter fragments:** radius×0.6, mass×0.5, color=#FFFFFF, initial vel = 14 in spread direction, lifetime 420 frames, auto-dies when expired.

---

### Enemy Scaling

**Wave 5+ scaling multiplier:**
- Loop from wave 3 to current wave, accumulating `scaleMultiplier += increment` each iteration
- Base increment = 0.15 per wave
- Post wave 21: increment = `0.15 + floor((wave - 21) / 5) * 0.10` (accelerates in tiers of 5)
- Applied to: mass, knockbackDealtMult, speed, maxSpeed

**Wave 15+ bonus:** `knockbackDealtMult *= 1.5`

**Post-ascension nerfs (Arena 2, wave 21+):**
- `mass *= 0.4`
- `speed *= 0.4`
- `maxSpeed *= 0.45`
- `knockbackDealtMult *= 0.4`

**Arena 3 additional modifier (ascendedTier2, wave 41+):**
- `mass *= 0.85`
- `speed *= 0.85`
- `maxSpeed *= 0.85`
- `knockbackDealtMult *= 0.85`
- Stacks on top of the Arena 2 nerfs

---

### Boss System

**Stats (per bossIndex, 0-based — bossIndex = floor(wave/10) - 1):**
| Stat | Formula |
|------|---------|
| radius | `65 + bossIndex * 5` |
| mass | `(300 + bossIndex * 20) * 2.2` |
| speed | `(0.6 + bossIndex * 0.05) * 2.5` |
| maxSpeed | `(10 + bossIndex * 1.2) * 1.8` |
| maxHealth | `round(((10 + bossIndex * 5) * 2.5) * 0.7)` |
| knockbackDealtMult | `(1.5 + bossIndex * 0.3) * 2.5` |

- stunImmune = true
- Boss appears every 10 waves (`bossEvery = 10`)
- Enrage threshold: health < maxHealth × 0.35 → speedMult = 1.2, faster attack fire rates

**Player dash damage to boss:** 0.5 per hit, dashHitCooldown = 15 frames between hits

**Projectile damage to boss:** 1 per hit (via `onProjectileHit`)

**Attack Patterns (5 attacks, Fisher-Yates shuffled queue):**

1. **Juggernaut Dash (attack 0):**
   - Telegraph: 60 frames, tracks player direction
   - Dash force: `(22 + bossIndex * 2) * (enraged ? 1.25 : 1.0)`
   - Duration: 25 frames
   - During dash: fires 2 perpendicular projectiles every 4 frames
   - Cooldown after: enraged 40, normal 60

2. **Chaos Spiral (attack 1):**
   - Telegraph: 60 frames
   - Duration: enraged 120, normal 90 frames
   - Fire rate: every 3 (enraged) or 5 frames
   - Arms: `2 + (bossIndex >= 1 ? 1 : 0) + (enraged && bossIndex >= 2 ? 1 : 0)`
   - Projectile speed: `6 + bossIndex * 0.5`
   - Spin rate: enraged 0.2, normal 0.12 rad/frame
   - Cooldown after: enraged 40, normal 60

3. **Starburst Nova (attack 2):**
   - Telegraph: 60 frames
   - Total duration: 180 frames, fires 3 bursts (at frame thresholds 180/120/60)
   - Shots per burst: `16 + bossIndex * 4`
   - Alternating offset between bursts
   - Projectile speed: `3 + bossIndex + (burstNumber * 1.5)`
   - Cooldown after: enraged 45, normal 70

4. **Crossfire (attack 3):**
   - Telegraph: 60 frames, tracks player direction
   - Duration: enraged 75, normal 60 frames
   - Fires 4 projectiles (cardinal directions from aim angle) every 4 (enraged) or 6 frames
   - Projectile speed: `6 + bossIndex * 0.5`
   - Cooldown after: enraged 40, normal 50

5. **Shotgun Blast (attack 4):**
   - Telegraph: 60 frames, tracks player direction
   - Fires once immediately: `9 + bossIndex * 2 + (enraged ? 4 : 0)` shots
   - Spread: 0.7 radians total wedge
   - Projectile speed: `7 + bossIndex * 0.5`
   - Recoil: velocity += direction × -9
   - Recovery duration: 20 frames
   - Cooldown after: enraged 45, normal 65

---

### Arena Mechanics

**Circle (Arena 1/2):**
- `baseRadius = 400` (fixed world units, never changes with window size)
- Shape: `'circle'`

**Oval (Arena 3):**
- `baseRadiusY = 308`
- `baseRadiusX = baseRadiusY * 1.85` (= 569.8)
- Shape: `'oval'`

**Normalized distance (boundary test):**
- `dx = (pos.x - center.x) / radiusX`
- `dy = (pos.y - center.y) / radiusY`
- `normalizedDist = sqrt(dx² + dy²)`
- If > 1.0: outside arena (death for entities with dashGraceTimer ≤ 0)

**Per-wave arena shrink (non-boss, non-ascended):**
- `shrinkRate = 0.02 * 0.4` = 0.008 per wave
- `shrinkFloor = 1 - (1 - 0.5) * 0.4` = 0.8 (minimum 80% of base)
- `shrink = max(shrinkFloor, 1 - wave * shrinkRate)`
- Applied: `radius = baseRadius * expansionMult * shrink`
- Boss waves and ascended (wave 21+) use full radius (no per-wave shrink)

**Overtime shrink (within a wave):**
- Delay: starts at `15 * 60 = 900` frames (~15s)
- Duration: completes over `30 * 60 = 1800` frames (~30s)
- `shrinkProgress = min(1, (matchTimer - delay) / duration)`
- Easing: smoothstep `= t² * (3 - 2t)`
- `minRadius = player.radius * 2.5` (= 63 with base radius 25.2)
- `arena.radius = waveStartRadius + (minRadius - waveStartRadius) * easedProgress`
- Same formula applied to radiusX/radiusY for oval arena

**Arena expansion upgrade:** `+2% per level` → `arenaExpansionMult = 1 + level * 0.02`

---

### Hexagon Hazard (Arena 2, waves 21–40, non-boss)

**Properties:**
- radius: 70
- spinRate: 0.006 rad/frame
- Only spawns when `ascended && !ascendedTier2 && !isBossWave`

**Telegraph system:**
- `telegraphMax = 150` frames
- When telegraph activates: 2 safe sides chosen (opposite each other, e.g. sides 0 and 3)
- Safe sides shown green; dangerous sides shown red with escalating glow
- After telegraph reaches 0: fires from all 4 dangerous sides

**Firing:**
- 6 projectiles per dangerous side, spread across full edge width (offsets: -0.85, -0.5, -0.15, 0.15, 0.5, 0.85 of halfSide angle)
- Projectile stats: speed 7.4, radius 6, mass 2.5, color #8A2BE2
- Spawns at 92% of hex radius along the side's angle

**Cooldown:** Random 240–360 frames between volleys; also requires `Math.random() < 0.004` per frame to actually trigger telegraph

**Collision with tops:** Any top within `hex.radius + top.radius * 0.6` of arena center gets pushed outward with inward velocity reflected ×1.6 plus outward force of 6

---

### Buzzsaw Hazard (Arena 3, wave 41+, non-boss)

**Properties:**
- `bladeRadius = 46`
- Orbits at `radiusX * 0.82` / `radiusY * 0.82` from arena center
- Only spawns when `ascendedTier2 && !isBossWave`

**State machine:** `patrol → telegraph → lunge → return → patrol`

**Patrol:**
- `orbitSpeed = 0.0095` rad/frame
- `modeTimer` = random 150–240 frames before next lunge
- 40% chance to reverse orbit direction when transitioning to telegraph

**Telegraph (55 frames):**
- First 25 frames: tracks player position (dotted red line shows aim)
- At 30 frames remaining (`LOCK_AT = 30`): locks aim direction (solid red line)
- Final 30 frames: aim is frozen, player can commit to dodge
- Position stays at `lungeFrom` (current rim point)

**Lunge:**
- `lungeProgress += 0.0405` per frame
- Travel distance: `max(radiusX, radiusY) * 2.4` along locked direction
- Linear interpolation from `lungeFrom` to `lungeTo`
- Completes when `lungeProgress >= 1`

**Return:**
- Glides back to nearest rim point at `returnProgress += 0.03` per frame
- Linear interpolation from current position to rim point
- When complete: resumes patrol at the return angle

**Hit effect:**
- `KNOCKBACK_POWER = 46` (reduced to 1 during player spawn invuln)
- Force: `outward * KNOCKBACK_POWER * target.mass`
- Enemies: 70-frame daze (`applyDaze(70)`)
- Player: `invulnTimer = 0` (no daze on player)
- Screen shake: 11
- Hit cooldown: 40 frames per target (stored in WeakMap)
- Position correction: target pushed to `hitRange + 4` from saw center

**Swept collision detection:**
- Projects target position onto the line segment between previous and current saw positions
- Prevents tunneling through targets at high lunge speed

**Splitter fragmentation:** Splitters hit by buzzsaw fragment into 2 smaller copies (not just knocked away)

**Spawn invulnerability for player:** 180 frames (~3s) at wave start in Arena 3; during this time buzzsaw knockback is reduced to near-zero (KNOCKBACK_POWER=1)

---

### Collision Details

**Big hit threshold:** `jVal >= 45`
- Triggers: screen shake (min 13, scaled by jVal×0.28), hitFlash=1.0, squash=1.5
- Daze on enemy: `clamp(45 + (jVal - 45) * 1.8, 45, 180)` frames × player stunDurationMult
- Greed Core: +1 shard per big hit (if perk owned)
- Big-hit nova / retaliation field trigger (45-frame cooldown each)

**Bigger hit:** `jVal >= 45 * 1.3 = 58.5`
- Hit-stop: `min(4, jVal * 0.08)` frames (max once per 18-frame cooldown window)

**Player dash contact:**
- Extra knockback: `+10 * PLAYER_HIT_ADVANTAGE * dealtMult` force on enemy
- Player brake: `vel *= 0.62`
- Invuln cancel: `invulnTimer = 0`
- 12 particles spawned at enemy position

**Orbit blade hits:**
- Knockback: `25 * orbitKnockbackMult`
- Daze: `orbitDazeFrames` if set
- Hit cooldown: 8 frames
- Multi-hit: only hits one target per check unless `orbitMultiHit = true`

**Projectile hits:**
- Force: `direction * mass * 30 * knockbackMult`
- Creates explosion at impact point
- Impact pulse nova if `impactPulse > 0`
- Piercing: decrements `pierceRemaining`, tracks hit targets in a Set

**Brute special:** If brute is dashing on contact, applies additional `+40` force to the other entity

---

### Camera System

**baseCameraScale calculation:**
- Circle arena: `baseCameraScale = (min(canvasWidth, canvasHeight) * fillFactor) / (baseRadius * expansionMult * 2)`
  - fillFactor: 0.99 touch, 0.95 desktop
- Oval arena: `baseCameraScale = min(widthScale, heightScale)`
  - `widthScale = (canvasWidth * fillFactor) / (baseRadiusX * expansionMult * 2)`
  - `heightScale = (canvasHeight * fillFactor) / (baseRadiusY * expansionMult * 2)`
  - fillFactor: 0.99 touch, 0.78 desktop

**Dash zoom:** During player dash, target scale = `baseCameraScale * 1.06`

**Smooth interpolation:**
- `cameraScale = targetScale + (cameraScale - targetScale) * decayPow(0.85, dtf)`
- Decay of 0.85 per frame gives smooth zoom transitions

**Screen shake:**
- Max: 13 (clamped)
- Decay: `screenShake *= decayPow(0.8, dtf)`; zeroed below 0.5
- Applied as random translation in draw: `translate(rand(-shake, shake), rand(-shake, shake))`

---

### Particle System

**Object pools:** Both particles and projectiles use `ObjectPool` (factory + reset pattern) to avoid GC churn

**Glow budget per frame:**
- Desktop: `Particle.GLOW_BUDGET = 25`
- Mobile: `Particle.GLOW_BUDGET = 3`
- Counter reset each draw frame: `Particle.glowDrawnThisFrame = 0`
- Glowing particles use `globalCompositeOperation = 'lighter'` + `shadowBlur = 10`

**Particle limits:**
- `typicalParticleLimit`: 70 desktop, 32 mobile
- Hard limit: `typicalParticleLimit * 2` (140 desktop, 64 mobile)
- When exceeding hard limit, oldest particles are spliced and released to pool

**Trail system:**
- Each top maintains a `trail` array of position Vec2s
- Max 5 points per top: `maxTrailPoints = round(5 / max(0.1, dtf))`
- Rendered as connected line segments with the top's color
- Trail width = radius (normal) or radius×1.4 (during dash)
- Alpha: 0.2 normal, 0.5 during dash; composite mode 'lighter'

**Projectile limits:** `maxProjectiles = 80`; when exceeded, oldest is shifted and released to pool

## Detailed Perk, Progression & Audio Specs

### Complete Perk Database

#### Common — Body

| id | name | desc | apply logic |
|----|------|------|-------------|
| `gyroscopic` | Gyro-Stabilizer | Agility +40%, Spin decay -10% | `turnSpeed *= 1.4; spinDecay *= 0.9` |
| `lead_core` | Heavy Plating | Mass +30%, Speed -10% | `mass *= 1.3; speed *= 0.9` |
| `hollow_shell` | Aero Shell | Mass -20%, Top Speed +40% | `mass *= 0.8; maxSpeed *= 1.4; speed *= 1.2` |
| `rubber_band` | Kinetic Bumper | Bounce Restitution +50% | `restitution = min(1.8, restitution * 1.5)` |
| `reinforced_rim` | Reinforced Rim | Radius +12%, Mass +12% | `radius *= 1.12; mass *= 1.12` |
| `low_profile` | Low Profile | Radius -15%, Mass -10% | `radius *= 0.85; mass *= 0.9` |
| `tight_turn` | Tight Turn Servos | Friction -2%, Top Speed -5% | `friction = clamp(friction - 0.02, 0.5, 0.995); maxSpeed *= 0.95` |

#### Common — Weapon

| id | name | desc | onRev logic |
|----|------|------|-------------|
| `twin_emitter` | Twin Emitter | On Dash, fire 2 projectiles forward in narrow spread | Fire 2 projectiles at facing ± 0.15 rad, speed 11, radius 5, mass 2 |
| `rear_guard` | Rear Guard | On Dash, fire 1 projectile backward | Fire 1 projectile at facing + π, speed 10, radius 6, mass 2 |
| `side_thrusters` | Side Thrusters | On Dash, fire 2 projectiles perpendicular | Fire 2 projectiles at facing ± π/2, speed 9, radius 5, mass 2 |

#### Common — Core

| id | name | desc | apply logic |
|----|------|------|-------------|
| `static_charge` | Static Charge | Spin regen +25% when not dashing | `spinRegenMult *= 1.25` |

#### Rare — Body

| id | name | desc | logic |
|----|------|------|-------|
| `edge_anchor` | Magnetic Anchor | Friction massively increases near arena edge | tick: if circular arena & dist > 80% of arena radius & not dashing → `vel *= decayPow(0.85, dtf)`. **Excluded in oval arena (Arena 3).** |
| `momentum_shift` | Kinetic Battery | Top Speed increases while not dashing | init: store baseMaxSpeed. tick: if not on dashCooldown → `maxSpeed = min(baseMaxSpeed * 1.5, maxSpeed + 0.05 * dtf)`, else reset to baseMaxSpeed |
| `magnet_core` | Magnet Core | Pulls nearby enemies toward you | tick: enemies within 180px get force `dir.mult(0.12 * dtf)` toward player |
| `adrenal_drive` | Adrenal Drive | Speed improves as Dash Energy gets lower | tick: `adrenalSpeedBonus = (1 - spin/maxSpin) * 0.35`. apply: store baseSpeedForAdrenal |

#### Rare — Weapon

| id | name | desc | logic |
|----|------|------|-------|
| `orbit_shards` | Plasma Orbits | 3 energy blades orbit you | init: `orbitAngle=0, orbitShards=3`. tick: `orbitAngle += 0.1 * dtf` |
| `spin_burst` | Nova Burst | On Dash, fire 8 projectiles outward | onRev: 8 projectiles at evenly spaced angles (2π/8 * i), speed 12, radius 6, mass 2 |
| `slow_orbiter` | Slow Orbiter | 1 large long-range orbit blade | isSynergy, synergyWith: orbit_shards. init: `orbitShards = max(current,1), orbitRadiusBonus = max(current,45)`. tick: `orbitAngle += 0.045 * dtf` |
| `ring_burst` | Ring Burst | Every 4s, emit ring of 6 slow projectiles | init: ringTimer=0. tick: every 240 frames → 6 projectiles at 2π/6 * i, speed 6, radius 5, mass 2 |
| `dash_trailer` | Trailing Sparks | While dashing, fire projectile backward | tick: if dashTimer>0 & random < 0.22*dtf → 1 projectile backward, speed 8, radius 4, mass 1.5 |

#### Rare — Core

| id | name | desc | apply logic |
|----|------|------|-------------|
| `flywheel` | Flywheel Tuning | Dash launch speed +15%, duration -1 frame | `dashSpeedMult *= 1.15; dashDuration = max(4, dashDuration - 1)` |
| `second_wind` | Second Wind | When Dash Energy hits 0, refill 30% once/wave | init: secondWindReady=true. tick: if spin≤0 & ready → `spin = maxSpin * 0.3`, set ready=false, spawn particle |

#### Rare — Disruption

| id | name | desc | apply/onRev logic |
|----|------|------|-------------------|
| `feint_dash` | Phase Shift | Dash grants extra invuln, shorter cooldown | apply: `dashCooldownMax = max(20, dashCooldownMax * 0.7)`. onRev: `invulnTimer = max(invulnTimer, dashDuration + 25)` |

#### Epic — Body

| id | name | desc | apply logic |
|----|------|------|-------------|
| `ablative_plating` | Ablative Plating | Knockback taken -25%, Mass -10% | `knockbackTakenMult *= 0.75; mass *= 0.9` |
| `vampire_core` | Siphon Core | Passively drain Dash Energy from nearby enemies | tick: enemies within 150px → `e.spin -= 0.18*dtf, t.spin += 0.18*dtf` (capped at maxSpin). 7% chance per dtf to spawn red particle |

#### Epic — Weapon

| id | name | desc | logic |
|----|------|------|-------|
| `edge_mines` | Glitch Mines | Drop explosive trap every 3s | init: mineTimer=0. tick: every 180 frames → addMine at player pos |
| `pulse_nova` | Shockwave Emitter | Every 5s, emit kinetic repulsor field | init: novaTimer=0. tick: every 300 frames → createNova(pos, radius=200, power=20) |
| `trailblazer` | Plasma Wake | Drop voltaic mine on Dash | onRev: addMine at pos with `{armTimer:10, radius:5, triggerRadius:35, explosionRadius:90, power:9}` |
| `focus_lance` | Focus Lance | On Dash, fire single fast heavy projectile forward | onRev: 1 projectile at facing, speed 18, radius 9, mass 4 |
| `spiral_array` | Spiral Array | Every 2.5s, fire rotating spiral of 4 shots | init: spiralTimer=0, spiralAngle=0. tick: every 150 frames → spiralAngle+=0.4, fire 4 at spiralAngle + π/2 * i, speed 7, radius 5, mass 2 |
| `detonator_rounds` | Detonator Rounds | On Dash, fire 4 projectiles that nova on impact | onRev: 4 projectiles at 2π/4 * i + facing angle, speed 10, radius 6, mass 2.5 |

#### Epic — Disruption

| id | name | desc | apply logic |
|----|------|------|-------------|
| `stun_lens` | Stun Lens | Stuns +75%, player knockback -35% | `stunDurationMult *= 1.75; knockbackTakenMult *= 0.65` |

#### Epic — Core

| id | name | desc | apply logic |
|----|------|------|-------------|
| `greed_core` | Greed Core | +1 Shard per Big Hit, Mass -15% | `mass *= 0.85`. (Engine awards +1 runShard on big-hit detection) |
| `overcharge_core` | Overcharge Core | Max Dash Energy +25%, passive regen -15% | `maxSpin *= 1.25; spin = min(spin, maxSpin); spinRegenMult *= 0.85` |

#### Legendary

| id | name | desc | logic |
|----|------|------|-------|
| `gravity_rift` | Singularity | Center of arena pulls all tops inward | globalApply: `Engine.arenaModifiers.gravityRift = true` |
| `juggernaut` | Goliath Chassis | Mass ×3, Radius ×1.6, Speed -30% | `mass *= 3.0; radius *= 1.6; speed *= 0.7; maxSpeed *= 0.85` |
| `overdrive` | Quantum Reactor | Dash cost and cooldown halved | `dashCost = max(10, floor(dashCost*0.5)); dashCooldownMax = max(20, floor(dashCooldownMax*0.5))` |
| `barrage_core` | Barrage Core | On Dash, 12-shot radial burst at reduced power | onRev: 12 projectiles at 2π/12 * i, speed 9, radius 4, mass 1.3 |

#### Synergy — MASS Chain (base: `lead_core` / Heavy Plating)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `plated_treads` | Plated Treads | rare | `lead_core` | Mass +20%, Knockback Dealt +20% | `mass *= 1.2; knockbackDealtMult *= 1.2` |
| `shock_chassis` | Shock Chassis | epic | `plated_treads` | Mass +15%, Big Hits release knockback pulse | `mass *= 1.15; bigHitNova = true` |
| `gyro_counterweights` | Gyro-Counterweights | epic | `shock_chassis` | +10% Speed, tighter turning, no drawback | `speed *= 1.1; maxSpeed *= 1.1; friction = clamp(friction-0.01, 0.5, 0.995)` |

#### Synergy — SPEED Chain (base: `hollow_shell` / Aero Shell)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `slipstream_frame` | Slipstream Frame | rare | `hollow_shell` | Top Speed +15%, Friction reduced | `maxSpeed *= 1.15; friction = clamp(friction-0.015, 0.5, 0.995)` |
| `afterburner_vents` | Afterburner Vents | epic | `slipstream_frame` | Dash speed +20%, Cooldown -10% | `dashSpeedMult *= 1.2; dashCooldownMax = max(20, round(dashCooldownMax*0.9))` |
| `phase_skater` | Phase Skater | epic | `afterburner_vents` | Top Speed +15%, KB Taken -20% | `maxSpeed *= 1.15; speed *= 1.05; knockbackTakenMult *= 0.8` |

#### Synergy — DEFENSE Chain (base: `stun_lens` / Stun Lens)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `hardened_lens` | Hardened Lens | epic | `stun_lens` | KB Taken -15%, Stun +20% | `knockbackTakenMult *= 0.85; stunDurationMult *= 1.2` |
| `retaliation_field` | Retaliation Field | epic | `hardened_lens` | Taking Big Hit releases KB pulse | `retaliationField = true` |
| `kinetic_dampers` | Kinetic Dampers | epic | `retaliation_field` | +10% Speed, no drawback | `speed *= 1.1; maxSpeed *= 1.1` |

#### Synergy — ORDNANCE Chain (base: `spin_burst` / Nova Burst)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `piercing_rounds` | Piercing Rounds | rare | `spin_burst` | Projectiles pierce +1 enemy | `projPierce += 1` |
| `kinetic_warheads` | Kinetic Warheads | epic | `piercing_rounds` | Projectile Knockback +50% | `projKnockbackMult *= 1.5` |
| `overpressure_rounds` | Overpressure Rounds | epic | `kinetic_warheads` | Pierce +1 more, small KB pulse on impact | `projPierce += 1; projImpactPulse = max(current, 55)` |
| `stabilized_barrels` | Stabilized Barrels | epic | `overpressure_rounds` | +10% Speed, no drawback | `speed *= 1.1; maxSpeed *= 1.1` |

#### Synergy — SENTINEL Chain (base: `orbit_shards` / Plasma Orbits)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `charged_blades` | Charged Blades | epic | `orbit_shards` | Orbit KB +40%, blades daze enemies | `orbitKnockbackMult *= 1.4; orbitDazeFrames = max(current, 35)` |
| `resonant_field` | Resonant Field | epic | `charged_blades` | Orbit blades can multi-hit per cycle | `orbitMultiHit = true` |
| `centrifugal_stabilizers` | Centrifugal Stabilizers | epic | `resonant_field` | +10% Speed, no drawback | `speed *= 1.1; maxSpeed *= 1.1` |

#### Synergy — CORE Chain (base: `overcharge_core` / Overcharge Core)

| id | name | rarity | prereq | desc | apply logic |
|----|------|--------|--------|------|-------------|
| `capacitor_bank` | Capacitor Bank | epic | `overcharge_core` | Max Dash +15%, Dash Cost -10% | `maxSpin *= 1.15; dashCost = max(10, floor(dashCost*0.9))` |
| `overclocked_regen` | Overclocked Regen | epic | `capacitor_bank` | Spin Regen +30%, Cooldown -10% | `spinRegenMult *= 1.3; dashCooldownMax = max(20, round(dashCooldownMax*0.9))` |
| `singularity_core` | Singularity Core | epic | `overclocked_regen` | Dash releases knockback pulse on launch | onRev: `createNova(pos, radius=110, power=7)` |

### Perk Archetype Tags (PERK_ARCHETYPES)

Six archetypes: `mass`, `speed`, `defense`, `ordnance`, `sentinel`, `core`.
Each perk has weight 1.0 for its primary archetype, optional secondary at <1.0.

| id | primary (w) | secondary (w) |
|----|-------------|---------------|
| gyroscopic | speed(1) | — |
| lead_core | mass(1) | — |
| hollow_shell | speed(1) | — |
| rubber_band | mass(1) | — |
| orbit_shards | sentinel(1) | — |
| spin_burst | ordnance(1) | — |
| edge_anchor | defense(1) | — |
| momentum_shift | speed(1) | — |
| edge_mines | ordnance(1) | defense(0.3) |
| pulse_nova | defense(1) | ordnance(0.4) |
| vampire_core | core(1) | defense(0.3) |
| trailblazer | ordnance(1) | — |
| stun_lens | defense(1) | — |
| greed_core | core(1) | — |
| gravity_rift | sentinel(0.7) | ordnance(0.7) |
| juggernaut | mass(1) | — |
| overdrive | core(1) | — |
| feint_dash | speed(1) | defense(0.4) |
| static_charge | core(1) | — |
| reinforced_rim | mass(1) | — |
| low_profile | speed(1) | defense(0.4) |
| tight_turn | speed(1) | — |
| second_wind | core(1) | defense(0.4) |
| adrenal_drive | speed(1) | core(0.4) |
| magnet_core | sentinel(1) | — |
| flywheel | speed(1) | core(0.4) |
| ablative_plating | defense(1) | — |
| overcharge_core | core(1) | — |
| twin_emitter | ordnance(1) | — |
| rear_guard | ordnance(1) | — |
| side_thrusters | ordnance(1) | — |
| slow_orbiter | sentinel(1) | — |
| ring_burst | ordnance(1) | — |
| dash_trailer | ordnance(1) | — |
| focus_lance | ordnance(1) | — |
| spiral_array | ordnance(1) | — |
| detonator_rounds | ordnance(1) | — |
| barrage_core | ordnance(1) | — |
| plated_treads | mass(1) | — |
| shock_chassis | mass(1) | defense(0.3) |
| gyro_counterweights | speed(0.7) | mass(0.5) |
| slipstream_frame | speed(1) | — |
| afterburner_vents | speed(1) | core(0.3) |
| phase_skater | speed(1) | defense(0.3) |
| hardened_lens | defense(1) | — |
| retaliation_field | defense(1) | ordnance(0.3) |
| kinetic_dampers | defense(0.6) | speed(0.6) |
| piercing_rounds | ordnance(1) | — |
| kinetic_warheads | ordnance(1) | — |
| overpressure_rounds | ordnance(1) | defense(0.2) |
| stabilized_barrels | speed(0.6) | ordnance(0.5) |
| charged_blades | sentinel(1) | — |
| resonant_field | sentinel(1) | — |
| centrifugal_stabilizers | speed(0.6) | sentinel(0.5) |
| capacitor_bank | core(1) | — |
| overclocked_regen | core(1) | — |
| singularity_core | core(1) | defense(0.3) |

### Draft System Logic (`getDraftCards`)

**Algorithm:**
1. Build a `pool` from PERK_DB, filtering out:
   - Already-owned perks (by id, passed as `excludedIds`)
   - `edge_anchor` if current arena shape is oval (Arena 3)
   - Legendaries if `!legendaryAllowed` (gate: wave < 10 OR already have one this run)
   - Synergy perks where prereq is NOT owned (`!excluded.has(p.prereq)`)
   - Synergy perks that fail the per-wave random chance (`Math.random() >= synergyChance`)
2. For each of 3 card slots:
   - Roll rarity weight: `rarityWeight = Math.random() + (currentWave * 0.05)`
   - Determine allowed rarity:
     - `> 1.9` AND legendary allowed → legendary
     - `> 1.3` → epic (allows epic + rare + common)
     - `> 0.8` → rare (allows rare + common)
     - else → common only
   - Filter pool to matching rarity tier (inclusive downward)
   - If no valid cards at that rarity → fall back to entire remaining pool
   - Pick random from valid pool; remove chosen card from pool (no duplicates)
3. Return array of 0–3 perk objects.

**Rarity weight formula examples:**
- Wave 1: `random + 0.05` → range 0.05–1.05 (mostly common/rare)
- Wave 10: `random + 0.5` → range 0.5–1.5 (mostly rare/epic)
- Wave 20: `random + 1.0` → range 1.0–2.0 (epic dominant, legendary possible)
- Wave 40: `random + 2.0` → range 2.0–3.0 (legendary almost guaranteed if available)

**Synergy unlock system:**
- `SYNERGY_UNLOCK_WAVE = 10` — synergy perks cannot appear before wave 10
- `SYNERGY_RAMP_WAVES = 24` — ramps linearly over 24 waves after unlock
- `SYNERGY_MIN_CHANCE = 0.10` (10% at wave 10)
- `SYNERGY_MAX_CHANCE = 0.55` (55% at wave 34+)
- Formula: `chance = 0.10 + clamp((wave - 10) / 24, 0, 1) * (0.55 - 0.10)`
- Each synergy perk must pass this random gate independently during pool filtering

**Legendary gate:**
- `isLegendaryUnlocked(wave)` → `wave >= 10`
- Only 1 legendary per run (`legendaryUsed` flag)
- Legendary rarity weight threshold: > 1.9

**Skip option:** Player receives +3 shards (`Engine.runShards += 3`) and advances wave.

### Permanent Upgrade System (UPGRADE_DEFS)

| key | name | desc | cost formula `cost(lvl)` | base max |
|-----|------|------|--------------------------|----------|
| mass | Tungsten Core | +15% Impact Mass | `9 + lvl*10 + surcharge(lvl, 40)` | 10 |
| spin | Magnetic Bearings | +10% Spin Retention | `6 + lvl*8 + surcharge(lvl, 32)` | 10 |
| speed | Plasma Thrusters | +15% Velocity Output | `9 + lvl*10 + surcharge(lvl, 40)` | 10 |
| harvest | Shard Harvester | +10% Shard Yield | `5 + lvl*6 + surcharge(lvl, 24)` | 10 |
| cooldown | Quick-Charge Relays | -5% Dash Cooldown | `30 + lvl*50 + surcharge(lvl, 200)` | 10 |
| stun | Stun Capacitors | +5% Stun Duration | `35 + lvl*50 + surcharge(lvl, 200)` | 10 |
| arenaExpand | Arena Expander | +2% Arena Radius | `round((20 + lvl*20) / 3)` | 10 |
| fabricator | Fabricator Start | +1 Random Common/Rare Perk at run start | `205 + lvl*420` | 2 |

**Max level calculation (`getUpgradeMax`):**
- Base max from table above
- `arenaExpand`: always stays at its defined max (10), never gets bonuses
- `fabricator`: gets +10 from Arena 2, but NOT +10 from Arena 3 (capped)
- All others: +10 if arena2Unlocked, +10 more if arena3Unlocked → total max 30

**Arena 3 tier surcharge (`arena3TierSurcharge(lvl, perTierPow)`):**
- Only applies to levels 20–29 (the Arena 3 bonus range)
- `tier = lvl - 19` (1..10)
- Surcharge = `round(perTierPow * tier * tier)` — quadratic cost ramp
- For `mass` at lvl 25: surcharge = `round(40 * 6 * 6)` = 1440 extra shards

**Upgrade application in `startRun`:**
- `player.mass *= (1 + upgrades.mass * 0.15)`
- `player.spinDecay *= (1 - upgrades.spin * 0.10)`
- `player.speed *= (1 + upgrades.speed * 0.15)`
- `player.maxSpeed *= (1 + upgrades.speed * 0.15)`
- `player.dashCooldownMax = max(20, round(dashCooldownMax * (1 - upgrades.cooldown * 0.05)))`
- `player.stunDurationMult = 1 + upgrades.stun * 0.05`

### Chassis System (CHASSIS_DEFS)

| id | name | stat | desc | cost |
|----|------|------|------|------|
| `standard` | Standard | Balanced Output | Clean handling with reliable impact. | 0 (free) |
| `flat` | Grip-Tech | Heavy Control | More mass and bite, lower top-end speed. | 250 |
| `spike` | Drift-Pin | Fast Drift | Lighter contact, higher speed, less sluggish drift. | 75 |

**Chassis stat modifications in `startRun` (applied AFTER permanent upgrades):**
- `standard`: no modifications (baseline)
- `flat` (Grip-Tech): `friction = 0.88; speed *= 0.8; mass *= 1.2`
- `spike` (Drift-Pin): `friction = 0.965; speed *= 1.15; maxSpeed *= 1.45; mass *= 0.85`

All player chassis also get base multipliers before chassis mods:
- `speed *= 1.1; maxSpeed *= 1.3; dashDuration = round(dashDuration * 0.65)`

### Build Identity System

**`computeBuildScores(perks)` algorithm:**
1. Initialize scores object: `{ mass:0, speed:0, defense:0, ordnance:0, sentinel:0, core:0 }`
2. For each owned perk:
   - Look up `PERK_ARCHETYPES[perk.id]` → tag weights (e.g. `{ ordnance: 1, defense: 0.3 }`)
   - Determine rarity weight `w` from `RARITY_BUILD_WEIGHT`:
     - common: 1, rare: 1.6, epic: 2.3, legendary: 3.2
   - If perk has a `prereq` (is a synergy evolution): `w *= 1.35`
   - For each archetype tag: `scores[archetype] += tag_weight * w`

**`getBuildIdentity(perks)` classification:**
1. Compute scores, filter to non-zero entries, sort descending
2. Calculate `total`, `topShare = top.score / total`
3. Count meaningful archetypes (those with ≥16% share)
4. Classification:
   - **OMNI-CHASSIS**: `topShare < 0.40` AND `meaningfulCount >= 3`
   - **Pure**: `topShare >= 0.68` (or only one archetype has score)
   - **Hybrid**: everything else → keyed by top 2 archetype ids alphabetically joined

**BUILD_NAMES_PURE:**
| archetype | name |
|-----------|------|
| mass | JUGGERNAUT |
| speed | BLITZ RUNNER |
| defense | BULWARK |
| ordnance | GUNSHIP |
| sentinel | AEGIS BLADE |
| core | OVERCLOCKER |

**BUILD_NAMES_HYBRID** (key = sorted pair joined with `_`):
| key | name |
|-----|------|
| core_defense | STASIS WARD |
| core_mass | REACTOR TANK |
| core_ordnance | RAILGUNNER |
| core_sentinel | PULSE WARDEN |
| core_speed | OVERDRIVE RACER |
| defense_mass | FORTRESS |
| defense_ordnance | TURRET |
| defense_sentinel | GUARDIAN |
| defense_speed | SKIRMISHER |
| mass_ordnance | SIEGE ENGINE |
| mass_sentinel | IRON WARDEN |
| mass_speed | RAMMING SPEED |
| ordnance_sentinel | ARSENAL |
| ordnance_speed | GUNSLINGER |
| sentinel_speed | WHIRLWIND |

Fallback for unlisted hybrid: `"ARCHNAME1/ARCHNAME2 HYBRID"`.
No perks: name = `"UNSPECIALIZED"`, color = `var(--text-muted)`.

### Shard Economy

**Enemy kill rewards (per ring-out):**
- Arena 1 (not ascended): 1 shard
- Arena 2 (ascended): 3 shards
- Arena 3 (ascendedTier2): 5 shards

**Boss kill rewards:**
- Arena 1: 10 shards
- Arena 2: 30 shards
- Arena 3: 50 shards

**Wave clear bonus:**
- Arena 1: 2 shards
- Arena 2/3: 6 shards

**Ascension bonuses (one-time per run, added to runShards):**
- Arena 2 ascension: +100 shards
- Arena 3 ascension: +500 shards

**Harvest upgrade (applied at run end in `triggerGameOver`):**
- `harvestBonus = floor(runShards * (upgrades.harvest * 0.10))`
- Total banked = runShards + harvestBonus
- Effectively +10% yield per harvest level

**Top score bonus formula (`topScoreRewardForWave(wave)`):**
- `base = 2 + floor(wave / 5) * 2`
- If `wave >= 21`: `base += floor((wave - 20) / 3) * 2`
- If ascended: `return base * 3`
- Otherwise: `return base`
- Awarded each wave that beats the stored bestWave (cumulative per run)

**Greed Core:** +1 shard per "Big Hit" triggered (separate from kill reward).

**Skip draft:** +3 shards added to runShards immediately.

### Ascension System

**Arena 2 trigger:**
- Triggers when `this.wave === 20` at wave-clear (clearing wave 20)
- Also triggers if ALL permanent upgrades are maxed on wave 21 clear (edge case)
- Awards +100 shards, strips all perks, resets player to fresh Top with chassis mods
- Sets `ascended = true`, `SaveSystem.data.arena2Unlocked = true`
- Player starts Arena 2 at wave 21
- On subsequent runs: can start directly at wave 21 via main menu button

**Arena 3 trigger:**
- `arena3TriggerWave = 41` (set as Engine property)
- Triggers when `this.wave === (arena3TriggerWave - 1)` → wave 40 clear
- Awards +500 shards, strips all perks, resets player to fresh Top with chassis mods
- Sets `ascendedTier2 = true`, `SaveSystem.data.arena3Unlocked = true`
- Player starts Arena 3 at wave 41
- On subsequent runs: can start directly at wave 41 via main menu button

**Post-ascension player reset (both arenas):**
- Perks array cleared entirely
- New Top created at center with base multipliers: `speed*=1.1, maxSpeed*=1.3, dashDuration*=0.65`
- Chassis mods re-applied (flat/spike)
- Permanent upgrades NOT re-applied after ascension (they were already applied at startRun)

### Audio System (Procedural Web Audio)

**Architecture:**
```
AudioContext
├── SFX chain: compressor → masterGain → limiter → ctx.destination
└── BGM chain: bgmGain → bgmFilter (lowpass) → ctx.destination
```

**Compressor settings:**
- threshold: -10 dB, knee: 15, ratio: 4
- attack: 0.015s (slow → allows transient punch)
- release: 0.1s

**Limiter (brick-wall, end of SFX chain):**
- threshold: -6 dBFS, knee: 0, ratio: 20:1
- attack: 0.001s, release: 0.05s

**Master gain:** 0.45 default (maps to sfxVolume)
**BGM gain:** 0.35 default (maps to musicVolume)

**BGM lowpass filter (muffle):**
- Normal: cutoff 20000 Hz (effectively off)
- Muffled (menu/pause): ramps to 1200 Hz over 0.35s
- Stays UN-muffled during draft screen

**Voice management:**
- `maxTotalVoices = 24` (hard cap across all sounds)
- `maxPerType = 4` (cap per sound category)
- Each voice tracked with `endsAt` timestamp, auto-removed on expiry
- `tryAcquireVoice(type, duration)` → returns false if caps exceeded

**Noise buffer:** 2-second pre-generated white noise buffer at context sample rate.

**SFX Recipes:**

| SFX | Voice type | Implementation |
|-----|-----------|----------------|
| `playHit(force, isPlayer)` | 'hit' | Skip if force<10. normalizedForce = min(1, force/60). baseFreq = isPlayer?300:200. freqStart = baseFreq - norm*50 → freqEnd = freqStart*0.1. vol = 0.2 + norm*0.2. Sine tone 0.15s + noise(0.1s, 4000→1000Hz, vol*0.5) |
| `playDash(isPlayer)` | 'dash' | vol = isPlayer?0.25:0.15. Noise(0.25s, 4000→300Hz, vol) + triangle(300→100Hz, 0.25s, vol*0.5) |
| `playShoot()` | 'shoot' | Triangle 1200→200Hz, 0.12s, vol=0.2, attack=0.005 |
| `playExplosion(power)` | 'explosion' | vol = min(0.3, power*0.03). Noise(0.25s, 1800→200Hz, vol*0.5) + sine(120→50Hz, 0.3s, vol) + delayed sine(800→600Hz, 0.08s, vol*0.35) at +20ms |
| `playShard()` | 'shard' | Sine 1200Hz steady 0.1s vol=0.2, then +50ms sine 1600Hz steady 0.15s vol=0.2 |
| `playWaveStart()` | 'waveStart' | Square(200→600Hz, 0.5s, 0.15, filter 400→2000Hz) + triangle(300→900Hz, 0.5s, 0.15) |
| `playBossSpawn()` | 'bossSpawn' | Sawtooth(120→40Hz, 2.0s, 0.3, filter 1000→100Hz) + square(60→30Hz, 2.0s, 0.3, filter 500→50Hz) + noise(1.5s, 3000→200Hz, 0.2) |
| `playGameOver()` | 'gameOver' | Sawtooth(300→20Hz, 1.5s, 0.25, filter 1000→100Hz) + noise(1.5s, 2000→50Hz, 0.15) |
| `playLegendary()` | 'legendary' | Power chord: square(440Hz steady, 1.0s, 0.1, attack=0.05, filter 2000→400Hz) + triangle(660Hz steady, 1.2s, 0.1, attack=0.1) + sine(880Hz steady, 1.5s, 0.1, attack=0.15) |
| `playUpgrade()` | 'upgrade' | Ratchet cluster: 6 clicks at offsets [0, 45, 85, 140, 175, 230]ms — each is a noise band (25ms, ~1800Hz*variance, Q=6) + filtered square. 2 metallic clinks at 50ms and 200ms (triangle bandpass ~1400/1900Hz, 0.18s). Final low thunk at 280ms (sine 180→90Hz, 0.12s, vol=0.08) |
| `playUIHover()` | 'ui' | Triangle 800Hz steady, 0.04s, vol=0.03 |
| `playUIClick()` | 'ui' | Square 1200→800Hz, 0.06s, vol=0.02, filter 2000Hz |

### Game Over

**GAMEOVER_QUIPS** — wave-range tiers with sample lines:

| Wave range | Sample quips |
|-----------|--------------|
| 0–2 | "The game barely started and so did you." / "That wasn't a run. That was a warm up lap." / "Even the tutorial enemies are embarrassed for you." |
| 3–7 | "Not bad. For someone like you." / "A solid effort, assuming the bar was on the floor." / "At this rate, you'll never get out of Arena 1." |
| 8–14 | "Okay, you've clearly done this before." / "Close to Arena 2. Not there though." / "Now we're getting somewhere." |
| 15–24 | "Now THAT'S a respectable run." / "You're starting to scare the enemies." / "You... did that?" |
| 25–39 | "Okay show off." / "That was impressive and you know it." / "Someone's been practicing in secret." |
| 40–59 | "Alright, who taught you that?" / "That's not luck anymore." / "Incredible." |
| 60–79 | "I'm impressed. And a little scared." / "Are you even using your hands right now?" / "You're making this look unfairly easy." |
| 80–99 | "Okay this is just unfair... to everyone." / "HOW??" / "At this point you're basically the final boss." |
| 100+ (∞) | "I don't really know how this is possible..." / "I didn't even design the game to go this far..." / "Are you hacking???!" |

**Selection:** `getGameOverQuip(wave)` → finds first tier where `wave <= tier.max`, picks random line.

**Score display (game over screen):**
- Wave reached (`go-wave`)
- Total shards earned (`go-shards` = runShards + harvestBonus)
- Top score bonus line (if new record this run): wave number + cumulative bonus amount
- Quip from GAMEOVER_QUIPS
- Total shard bank (animated counter from old→new)

### Wave-Cleared Screen (Draft)

**Header:** "WAVE CLEARED: UPGRADE MODULE" (shown via `showDraft(wave)`)

**Build identity badge (top of draft screen):**
- Current build name (e.g. "GUNSLINGER") colored by dominant archetype
- Archetype meter bar: segmented horizontal bar with color-coded segments per archetype contribution (percentage width, box-shadow glow)

**Card layout:** 3 perk cards in a grid. Each card contains:
1. **Type line:** `"RARITY // TYPE"` (e.g. "EPIC // WEAPON")
2. **Archetype chips:** Color-coded chip per archetype tag (sorted by weight desc). Tags < 0.8 weight get `arch-chip-minor` styling.
3. **Synergy ribbon** (if applicable):
   - For evolution perks (has `prereq`): `"EVOLUTION // FROM PERKNAME"`
   - For synergy perks (has `synergyWith`): `"SYNERGY // PAIRS WITH PERKNAME"`
4. **Name:** Bold perk name
5. **Description:** Perk desc text

**Card CSS class:** `card ${rarity}` — rarity determines border color/glow

**Legendary locked message (shown above cards):**
- If wave < 10: "LEGENDARY MODULES LOCKED UNTIL WAVE 10"
- If already have legendary this run: "LEGENDARY MODULE ALREADY INSTALLED THIS RUN"

**Skip button:** Below cards — "SKIP (+3 SHARDS)" — adds 3 to runShards, shows toast, advances wave.

**Legendary feedback:** If any offered card is legendary → `Engine.triggerLegendaryFeedback()` (screen flash + legendary SFX).

**All-modded state:** If pool is empty (all perks owned), shows single card: "SYSTEM // COMPLETE — Fully Modded — No duplicate modules remain. Continue the run."

**After pick/skip:** Wave increments, screen closes, next wave starts. (In source: midgame ad fires here for non-onboarding runs — we skip this.)

## UI Polish (applied post-build)

### Arena Interior
- Fill: `#07111A` (very dark blue-black)
- Grid: cyan lines at 60px spacing, `rgba(0,243,255,0.08)`, clipped to arena ellipse/circle

### In-Game HUD (canvas-drawn, NOT a centered pill)
**Top-Left (stacked):**
- Pause button (28×28 square, cyan border, || icon)
- "WAVE" label (11px cyan) + wave number (26px bold white)
- "SHARDS" label (11px gold) + shard count (18px bold white)
- "BUILD" label (10px muted) + build name (14px bold white) + archetype color bar (110×5px, segments proportional to build scores)

**Top-Right:**
- "DASH CORE" label (11px white, right-aligned)
- Dash energy bar (180×12px, cyan fill, dark bg, cyan border)
- "(SPACEBAR / CLICK) DASH" or "(TAP) DASH" hint (10px muted)

### Wave-Cleared (Draft) Screen
- "CURRENT BUILD" label + archetype color bar (300px wide, segments proportional) + build name
- Perk cards show colored archetype chip (e.g. "MASS" in red) for primary tag
- Archetype colors: mass=#FF2A2A, speed=#00F3FF, defense=#00FF88, ordnance=#FF00EA, sentinel=#8A2BE2, core=#FFF100

### Landscape Optimization
- All menu overlays use reduced padding/margins on landscape
- Overlay uses flex-direction:row where possible
- Upgrade list uses 2-column grid on wider screens
- Draft cards in a non-wrapping horizontal row
