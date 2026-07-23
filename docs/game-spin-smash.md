# Spin Smash

Beyblade-inspired arena battler with roguelike run progression. Knock spinning tops off the glowing arena edge before they do the same to you. Between waves, pick perks to build your loadout. Between runs, spend shards on permanent upgrades.

## Features

- **Physics-based combat** — mass-weighted collision impulses, restitution 1.3, knockback scales with velocity and mass
- **Dash mechanic** — costs spin energy, grants invulnerability, edge-guard prevents self-ring-outs, post-dash grace timer
- **12 enemy archetypes** — hunter, brute, blaster, mirror, titan, phantom, warden, aura, juker, sawgrinder, sentinel, splitter — each with unique AI and telegraph system
- **Boss every 10 waves** — HP bar, 5 attack patterns (juggernaut dash, chaos spiral, starburst nova, crossfire, shotgun), enrage at 35% health
- **3 arenas** — Circle (waves 1–20), Circle + rotating hexagon (21–40), Oval + orbiting buzzsaw (41+)
- **45 per-run perks** — common/rare/epic/legendary, 6 synergy chains, pick-1-of-3 or skip for shards
- **Build identity system** — perks tagged to 6 archetypes (Mass/Speed/Defense/Ordnance/Sentinel/Core), determines build name (e.g. GUNSLINGER, JUGGERNAUT, OMNI-CHASSIS)
- **8 permanent upgrades** — shard shop between runs (Tungsten Core, Magnetic Bearings, Plasma Thrusters, Shard Harvester, Quick-Charge Relays, Stun Capacitors, Arena Expander, Fabricator Start)
- **3 chassis** — Standard (free), Grip-Tech (heavy, 250 shards), Drift-Pin (fast, 75 shards)
- **Procedural Web Audio SFX** — hit, dash, shoot, explosion, shard collect, wave start, boss spawn, game over, legendary perk, upgrade purchase
- **Touch-first controls** — floating virtual joystick + dash button on mobile; WASD/arrows + spacebar/mouse on desktop
- **Arena shrink** — overtime shrink after 15s per wave, plus per-wave radius reduction on non-boss waves
- **Ascension system** — clearing wave 20 unlocks Arena 2 (strips perks, +100 shards); clearing wave 40 unlocks Arena 3 (strips perks, +500 shards)
- **Autoplaying demo** — main menu shows AI tops fighting at low opacity as background

## Files

- `games/spin-smash/index.html` — complete single-file game (Canvas 2D, no dependencies)
- `games/spin-smash/research/` — reference source files from TopClash v1.39 (gitignored)

## Key Design Decisions

- Single-file Canvas 2D implementation, no frameworks or build step
- Fixed timestep physics (1000/60ms per step, accumulator pattern) for deterministic collisions
- No aim assist on mobile — pure manual control
- Shard economy: 1/3/5 per kill (arena 1/2/3), 2/6 wave clear, 10/30/50 boss kill
- Harvest upgrade applies as multiplier at kill time (not run end)
- Edge = instant death (no knockback-off-then-death delay)
- Perks use the same apply/init/tick/onRev pattern as the source reference

## Memory
