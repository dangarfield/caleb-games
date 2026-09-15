# Skate — credits and licence

This game is a Three.js port of **Godot_Skate** by Eric Schubert (3deric).

- Upstream: https://github.com/3deric/Godot_Skate
- Upstream licence: MIT, Copyright (c) 2024 Eric Schubert

## What was taken from the original

- `assets/SK_char.glb` — the rigged character and all eighteen baked animation
  clips (Ground, GroundLeft, GroundRight, GroundBreak, Idle, Idle_Stand,
  Air_Olli, Flip_Kickflip, Grab_IndyGrab, Grab_MelonGrab, Grind_5050,
  Grind_Backside, Grind_Boardslide, Grind_Frontside, Grind_SmithGrind,
  Lip_Axlestall, Lip_Blunt, Lip_Nosestall).
  The characters are based on modified low-res MetaHuman characters by Epic Games.
- `assets/T_default_grey.png` — the grid texture (by kenney.nl), applied
  triplanar as the original's materials do.
- The `_Col_Floor` / `_Col_Wall` / `_Col_Pipe` / `_Rail_X` node-naming convention
  that the original's import script relies on, which is still how `src/level.js`
  reads a level here and what `tools/thps2glb.py` writes.
- `Bowlpark.glb`, `Warehouse.glb`, `test_pipe.glb`, `cone.glb` and
  `T_default_orange.png` were used too — the debug parks, the quarter-pipe
  module, the traffic cone and the second grid texture. The port was built on
  them; they were removed once every park in the game was a converted one. They
  are still in the upstream repository if they are ever wanted back.
- The physics constants, the ten-state character state machine, the input buffer
  and every trick's input sequence, score and animation, ported line for line
  from the GDScript. Each source file names the `.gd` file it came from.

## What is new in this port

- The Three.js renderer, the collide-and-slide (Godot's CharacterBody3D and its
  ShapeCast3Ds do not exist here), the arc-length curve maths that replaces
  Curve3D, the HUD as HTML/SVG rather than Godot Control nodes, touch controls,
  Web Audio sound effects, a tumble instead of the original's ragdoll, and
  rotation scoring on combos.
