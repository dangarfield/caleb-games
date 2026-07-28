# Bomb Squad

3D bomb defusal puzzle game built with Three.js. A procedurally-generated bomb appears centre-screen; the player rotates it via touch/mouse orbit controls and taps components in the correct order shown on the HUD. Wrong tap or timeout = instant explosion, resetting the level. Seeded generation ensures deterministic puzzles.

## Features

- **5 bomb shapes**: cube, cylinder, sphere, suitcase, briefcase — each with unique slot layouts.
- **7 component types**: wires (5 colours), buttons (4 colours), keypad (4-digit code), switches (A-D), turn key (brass/silver/copper), hold button (timed press), pressure valve (rapid taps).
- **Screw panels**: obfuscation covers that hide components; tap screws to remove (costs time, not a failure condition).
- **Seeded procedural generation**: Mulberry32 PRNG, same seed = same bomb every time.
- **3-6 solution steps** per bomb scaling with level.
- **10-second timer** per bomb, instant-fail on wrong tap or timeout.
- **5 rounds per level**, fail any round = restart level from round 1.
- **Progression**: 6 ranks (Recruit → Legend), component unlocks gated by level, increasing decoy density.
- **Web Audio SFX**: wire snip, button click, explosion, success jingle — all generated at runtime.
- **Particle effects**: explosion and spark systems using Three.js point clouds.
- **Instruction HUD**: left-side vertical panel showing solve sequence with highlighted current step.

## File Structure

- `games/bomb-squad/index.html` — entry point, HTML shell, styles, script imports.
- `games/bomb-squad/js/main.js` — game loop, state machine, raycasting, init.
- `games/bomb-squad/js/bomb-generator.js` — seeded generation pipeline (pick shape → fill slots → choose solution → validate).
- `games/bomb-squad/js/shapes/` — one file per bomb shape defining body mesh + face/slot registry.
- `games/bomb-squad/js/components/` — one file per component type (mesh + interaction + variants).
- `games/bomb-squad/js/screw-panel.js` — screw panel cover meshes and unscrew interaction.
- `games/bomb-squad/js/hud.js` — instruction panel, timer display, level info.
- `games/bomb-squad/js/audio.js` — Web Audio SFX generation.
- `games/bomb-squad/js/particles.js` — explosion/spark particle systems.
- `games/bomb-squad/js/progression.js` — levels, ranks, unlocks, per-player localStorage persistence.

## Key Design Decisions

- Multi-file structure justified by complexity (10+ distinct systems). Single HTML file would exceed maintainability.
- Three.js loaded via CDN importmap (no build step). ES modules throughout.
- Assembly pipeline: all slots filled first, solution targets chosen from placed components after — cleaner than pre-determining solution then filling around it.
- Uniqueness validation ensures each solution instruction maps to exactly one component on the bomb (no ambiguous duplicates).
- Screw panels max 1 covering a solution target, ensuring 10s remains feasible.
- OrbitControls for bomb rotation, raycasting for tap interaction on individual component meshes.

## Memory
