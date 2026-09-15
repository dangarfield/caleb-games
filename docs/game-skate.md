# Skate

A **3D skatepark sandbox** built in Three.js: drop into a bowl park, pump for
speed, ollie off the lip, grind the coping and chain tricks into a combo before
the timer on it runs out. It is a deliberately close port of
[**Godot_Skate**](https://github.com/3deric/Godot_Skate) by Eric Schubert (MIT,
© 2024), keeping the original's assets, animations, physics constants and state
machine rather than reinventing them.

## What was ported, and how faithfully

Every source file under `src/` names the `.gd` file it came from. The port is
line-for-line where the maths allowed it and reasoned where it did not:

| Original | Here | Note |
|---|---|---|
| `global_settings.gd`, `player_settings.gd` | `src/config.js` | Same names, same values. Nothing was "tuned to feel better". |
| `character_controller.gd`, `character_fall.gd` | `src/player.js` | Up-vector tracking, rail queries, balance, wall bounce, the fall tests. |
| `Player_States/*.gd` (10 files) | `src/states.js` | All ten states and every transition, including the odd ones. |
| `character_tricks.gd`, `Tricks/*.gd` (15 files) | `src/tricks.js` | 15 tricks, their input sequences, durations, scores and animations. |
| `character_input.gd`, `character_input_buffer.gd` | `src/input.js` | 4-deep buffer, 0.5 s decay, JUMP pushed on **release**. |
| `character_animation.gd` + the AnimationTree | `src/anim.js` | The BlendSpace2D rebuilt as four weighted actions; two trick slots as one clamped one-shot. |
| `skategame_helpers.gd` | `src/physics.js` | `align`, `kill_orthogonal_velocity`, `landed_perpendicular` etc. port straight across — both engines are right-handed, +Y up, and the controller treats +Z as forward. |
| `Curve3D` / `Path3D` | `src/paths.js` | An arc-length-baked polyline, so grind offsets stay in metres and the ported lines keep their numbers. |
| `park_import.gd` + the README's naming convention | `src/level.js` | Reads `_Col_Floor` / `_Col_Wall` / `_Col_Pipe` / `_Rail_X` node names out of the glTF and builds colliders and grind curves from them. No level format, no hand-placed geometry. |
| `ingame_hud.tscn`, `balance_overlay.gd`, `trick_overlay.gd` | `src/hud.js` + the HTML | Balance crescent, trick label, points line, input-buffer chips. |

**What could not be ported.** Godot's `CharacterBody3D`, its two `ShapeCast3D`s
and `move_and_slide()` have no Three.js equivalent, so `src/physics.js` builds a
world-space triangle soup with a uniform grid over it and does sphere
collide-and-slide plus ray probes. The original's `character_ragdoll.gd` is
replaced by a visual tumble on the model (the physics body stays upright, so the
skater never ends up buried in the floor).

## Features
- **The original character**, `SK_char.glb`, with **all eighteen baked clips**:
  Ground / GroundLeft / GroundRight / GroundBreak blended by the stick, Idle_Stand
  when you are standing still, and Air_Olli, Flip_Kickflip, Grab_IndyGrab,
  Grab_MelonGrab, Grind_5050/Backside/Boardslide/Frontside/SmithGrind and
  Lip_Axlestall/Blunt/Nosestall for the tricks. Coloured from
  `character_data.gd`'s exported defaults (green hoodie, tan jeans, blue helmet).
- **The original park**: Bowlpark plus two quarter-pipe modules at the exact
  transforms from `bowlpark.tscn`, three traffic cones, the kenney.nl grid
  textures projected **triplanar** so the squares stay square over the bowl's
  curve, and the red 5 cm coping rails extruded along the glTF polylines.
- **Ten states**: Setup (menu turntable), Ground, Pipe, Pipesnap, PipesnapAir,
  Air, Grind, Lip, Fall, Reset. Pipesnap is the one that carries you round a
  bowl's transition while gravity still applies.
- **15 tricks in 5 families**, matched against the tail of the input buffer,
  longest sequence first — so UP+X gives a Boardslide where bare X gives a
  Frontside Grind. Rotation accumulates while a trick is live and is reported
  rounded to 15° ("Kickflip 360").
- **Balance**: a grind or a lip randomises a drift direction and the crescent
  starts to swing. Push the opposite way to reverse it; let it pass 45° and you
  bail. The crescent sits on the left for a lip and is rotated 90° for a grind,
  exactly as `set_balance_view(true, PI/2)` does.
- **Combo scoring**: 300 a trick (upstream's `int(base_score)` — every trick
  carries a `difficulty` that the original never spends, and neither does this),
  multiplied by the number of tricks in the chain, plus 100 per quarter-turn of
  rotation. Rotation pay is the one scoring addition this port makes; the
  original tracks the angle and shows it but never cashes it in.
- **Touch-first**: a left thumb-stick that also fires the discrete UP/DOWN/LEFT/
  RIGHT the trick sequences need, and four right-hand buttons.
- **Web Audio SFX** (the original ships silent): a rolling rumble whose filter
  opens with speed and brightens into a metallic hiss on a grind, an ollie pop,
  a landing thump, a bail sweep.
- **Best score** saved through `arcade-store.js` (IndexedDB, `calebArcadeData:skate`).

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Push | **W**, or hold **Space** | stick **up**, or hold **JUMP** |
| Ollie | release **Space** | release **JUMP** |
| Steer / spin in the air | **A / D** | stick left / right |
| Brake and kickturn | **S** | stick down |
| Take a ramp over the lip | hold **W** | hold **up** on the stick |
| Switch stance | **Q** / automatic | automatic |
| Flip / Grab | **J** / **K** | **FLIP** / **GRAB** |
| Grind or lip | **L** | **GRIND** |
| Get back up | **R**, or hold **W**/**Space** | tap **JUMP** |
| Pause | **Esc** | the **II** chip |

Holding a direction *before* the trick button changes the trick: UP+J is a
Heelflip rather than a Kickflip, UP+K a Melon rather than an Indy, DOWN+L a
Backside Grind or a Blunt.

The three trick keys are **J K L**, not the original's F G X, so they fall under
the right hand in the same order and colours as the on-screen buttons — flip
(blue), grab (yellow), grind (red) in a row, with a wide green **JUMP** bar
underneath. There is no SWITCH button: landing backwards swaps the board's ends
on its own, and **Q** is there for the rest. The recent-input chips show the key
rather than an Xbox face button, because sitting right above the buttons the
Xbox colours were teaching the wrong mapping (Xbox puts B on red and Y on
yellow; here grind is red and grab is yellow).

## Files
```
games/skate/
  index.html            shell, HUD, menus, importmap (three@0.170.0 via jsdelivr)
  CREDITS.md            what came from upstream, and its MIT licence
  js/arcade-store.js    the shared IndexedDB store, copied unchanged
  src/config.js         GlobalSettings + PlayerSettings, name for name
  src/paths.js          arc-length polyline curves (stands in for Curve3D)
  src/physics.js        triangle soup, grid broadphase, collide-and-slide, helpers
  src/level.js          glTF -> colliders + rails by naming convention; triplanar shader
  src/input.js          input buffer + keyboard + touch stick and buttons
  src/tricks.js         the 15 tricks and the combo system
  src/anim.js           AnimationMixer, ground blend space, trick one-shots, tumble
  src/player.js         CharacterController + the fall tests
  src/states.js         the ten states
  src/hud.js            balance crescent, trick label, points, input chips
  src/audio.js          Web Audio SFX (new in this port)
  src/main.js           boot, scene, camera, level assembly, game loop
  src/thps.js           discovery + setup for converted Tony Hawk levels
  assets/*.glb, *.png   upstream character, park, pipe, cone and grid textures
  assets/thps/          converted THPS levels, if any (gitignored)
  tools/psx_iso.py      raw PlayStation .bin -> the files on the disc
  tools/thps_wad.py     CD.HED/CD.WAD -> the level files (both games)
  tools/thps2glb.py     THPS1/2 .psx + .trg -> .glb converter
  tools/thps_psx.py     the .psx reader (geometry, collision flags, vertex colour)
  tools/thps_trg.py     the .trg reader (rails, spawns)
  tools/glb.py          a minimal binary glTF writer
  tools/make_fixture.py synthesises a format-legal .psx/.trg to test against
  tools/test_thps2glb.py  35 assertions over the whole conversion
  tools/e2e_thps.mjs    converts a fixture park, loads it in a browser, skates it
  README.md             how to play it, and how to convert a THPS level
```

## Loading original THPS / THPS2 levels

`games/skate/tools/` converts a level out of the first two Tony Hawk games into
a glTF the existing loader reads with **no engine changes at all**. All twenty
levels work: the nine from THPS1 (Warehouse, School, Mall, Skate Park, Downtown,
Downhill Jam, Burnside, Streets, Roswell) and the eleven from THPS2 (Hangar,
School II, Marseille, New York, Venice Beach, Skatestreet, Philadelphia,
Bullring, Skate Heaven, and two small bonus parks) — with their ramps, bowls
and rails.

Pure Python 3, standard library only: no Blender, no numpy, no bchunk, no
7-Zip, no pip install. `games/skate/README.md` has the full instructions.
Three steps, because a PlayStation disc hides its files twice over:

1. `psx_iso.py` reads the raw `.bin` — 2352-byte CD sectors with sync marks and
   error correction wrapped around each 2048-byte payload, an ISO 9660
   filesystem inside that.
2. `thps_wad.py` unpacks `CD.WAD` via `CD.HED`. The two games index that archive
   differently and that is the whole reason the tool exists: THPS1 stores plain
   filenames (669 entries), THPS2 stores only a **hash** — 1531 records of
   `<u32 hash> <u32 offset> <u32 size>` and not one filename, which is why the
   community had to brute-force the THPS2 filename list. We only want the
   levels, and a level's name follows an obvious pattern, so the names come back
   by hashing candidates with the game's own CRC and seeing which the index
   already knows. `--hunt 4` walks every two-to-four character code and keeps
   the ones that have geometry as well as a node table, which is how `skph`
   (Philadelphia), `skbul` (Bullring) and `skhvn` (Skate Heaven) turned up —
   none of them guessable from the level's English name.
3. `thps2glb.py` turns a pair into `X_Col_Floor` / `X_Col_Wall` / `X_Col_Pipe` /
   `X_Rail_nnn` / `X_Mesh`, which is the naming convention `src/level.js`
   already speaks.

### Five things that had to be measured rather than read

The two reverse-engineering projects this is built on get most of it right, and
on each of these the file said something other than what the documentation did.

**The VERT flag (`0x0040`) is a trigger, not a surface.** Both projects describe
it as "a quarter pipe's large polygon", which reads like it *is* the transition.
The Warehouse's object 206 settles it: a ribbon of seven profile points swept
4 m wide — a textbook 2.2 m quarter pipe — whose VERT face is one invisible quad
standing on the lip and running 20 m straight up. It is the "you are in vert"
trigger. Collided with, every ramp gets an invisible wall along its coping.

So the VERT faces are dropped and used for what they do reliably say: the bottom
edge is the coping. Geometry within `--pipe-reach` of a coping line and below it
becomes `_Col_Pipe`. The rule is spatial rather than per-model because Burnside
and Roswell put the triggers in models of their own, a fence of them ringing
each bowl.

**Not-skateable (`0x0100`) is not a wall.** `wall` here means "bounce off it",
and much of what THPS marks unskateable is flat ground — carpet in the Mall,
grass, road markings. Routing it to wall pinned the skater at 5 m/s in a corner
of the Mall and Downtown for 45 seconds. Steepness decides instead; riding over
grass the original would not allow is a far smaller sin than not moving.

**The `.trg`'s node positions are not divided by 4096.** The reference
disassembler prints them as `x/4096` to make them human-sized, which reads like
a fixed-point conversion and is not. Divided, every rail collapses into a 1 m
cube at the origin.

**Rails chain through each node's leading uint16 array**, which the reference
disassembler labels `unk`. In THPS3/4/THUG the equivalent array is the `Links`
list the Blender importer walks. Assuming the same gives 15 clean chains in the
Warehouse and 122 in Downtown, with 91% of links resolving to another rail node.
THPS2 is messier — 64% in the Hangar, 83% in School II — but still chains, and
`--inspect` reports the percentage so a file that disagrees says so.

**The baked colour IS the lighting, so it must not be lit again.** The PS1 had
no lights, it had a number per vertex. Those come across as glTF vertex colours
and are most of what makes a level of that era look like itself — but a lit
material lights them a second time. The Warehouse survives it (median shade 50
of 255); Venice Beach does not (median 124, half its faces at or above the PS1's
full brightness) and the whole level renders white. `THPS_EXPOSURE` in
`src/level.js` scales the baked colour down so the result lands about where the
artist put it while still picking up the sun's direction and the skater's
shadow.

### Scale

256 THPS units per metre for both games, and that is a measurement: at 256 the
Warehouse's quarter pipes come out 2.16 m tall and 2.30 m deep, which is a real
quarter pipe. (`io_thps_scene`'s 2.25 comes from its THUG-era importer and would put a
PS1 park on a 44 cm grid.)

### Distribution

**No game data is in this repository and none should be.** The levels are
Activision and Neversoft's; `games/skate/assets/thps/` is gitignored, so a
converted park stays on the machine that converted it. With nothing there the
manifest 404s, the level select shows the three built-in parks, and nothing
breaks.

### Not done

Textures (they live in a sibling `sk*_l.psx` library), and the `.trg`'s own
goals and pickups — `TrickOb`, `GoalOb` and `PowrUp` are all in there and none
are wired up. The arcade's own objectives are used instead: S-K-A-T-E and
barrels are scattered onto each park by probing its collision, so a converted
level gets a checklist without anyone hand-placing anything. The `Restart` nodes
*are* used, preferring `Re_Start_Skate` over the two-player start and the `Ho_`
hotspots parked on individual gaps. THPS2 renamed them — its Hangar calls the
real one just `Start` and carries a `Re_Start_2P_NY` belonging to another level
— so the choice is by exact name first, and never a two-player, dummy or
secret-area start.

### Tests

`tools/test_thps2glb.py` — 35 assertions against a level synthesised byte by
byte to the format, since there is no THPS data here to test against.
`tools/e2e_thps.mjs` converts a second, skateable fixture, loads it in a real
browser and rides it, which is how the transition and the rail were confirmed to
work rather than merely to parse. All twenty converted levels are then loaded
and ridden for 45 s each of seeded random input: no page errors, no NaN, and
between them every state the machine has.

## Riding a building instead of a bowl

Three changes came out of playing the converted levels, and all three exist
because a THPS park is corridors, pillars and doorways where the debug parks
are open ground.

- **Wall contact is a deflection, not a ricochet.** `character_controller.gd`
  mirrors your velocity off any wall met at more than about 30 degrees and turns
  you to face the bounce. In a corridor that fires you back the way you came and
  the level stops being skateable. Now anything short of `WALL_HEAD_ON` (0.82)
  drops the into-the-wall component, keeps the along-the-wall one almost whole
  and adds a small push clear of the surface: measured, a 20-degree clip costs
  9% of your speed and 21 degrees of heading, and a 45-degree one 31% and 48
  degrees. The full reversal is kept for what it was for — riding squarely into
  something at speed — and a slow square hit now stops against the wall instead
  of pinging backwards.
- **Steering eased off**: `rot` 4.0 → 2.8, `rot_kickturn` 6.0 → 4.5. Air
  steering moved to its own `rot_air` (5.0) so that slowing it did not also slow
  trick rotation, which still runs at `rot_jump` 7.0.
- **The camera refuses to be blocked.** It sweeps three rays from the skater's
  head to where it wants to sit and pulls in front of anything in the way,
  snapping in and easing out so passing a pillar does not throw the view across
  the park. It will go to 0.6 m — nearly first person — rather than leave the
  view buried in a wall, which is what a corner of Downtown demands. Measured
  over 30 s of riding Downtown: 0 frames with the skater behind geometry, down
  from 3%.

Plus one on the converter: **about one collision triangle in eight is flagged
invisible**, and in every level they are overwhelmingly steep — barriers penning
you in and boxes thrown round fiddly scenery. Kept, they are exactly what they
sound like. `--invisible floors` (the default now) keeps the flat ones, which
are smoothed collision over stepped geometry and worth having, and drops the
rest. `--rail-max-gap` also cuts rail chains at implausible joints: the link
reading is right almost everywhere (median gap 2 m, nine in ten under 11 m) but
a handful per level jump 30-40 m, which draws a rail through the middle of the
park that you can accidentally grind onto.

## Three things that are NOT the original's behaviour

All three came out of play, and each is commented at the point it happens:

1. **Taking a ramp over the lip is a deferred, latched decision.** You are
   holding forward as you hit a quarter pipe *because that is how you got there*,
   so holding forward cannot by itself mean "eject" — the original throws you off
   the pipe the instant any vertical input is down, and bleeds 0.5 off your up
   axis doing it. Here every valid snap goes into Pipesnap, and the question is
   asked once, `LIP_HOLD_TIME` (0.2 s) later: are you **still** pushing, with
   forward or with the jump button? Let go in that window and you have chosen the
   transition — you ride it up and back down. Still pushing and you leave, with
   **forward** speed added (`LIP_PUSH`), never an upward pop: the climb up the
   transition is already doing the lifting, and what was missing was the
   horizontal carry to land somewhere else. The Air state's up-alignment then
   levels the skater out as usual.

   The heading it leaves along is `ctrl.ride_dir`, the last horizontal direction
   you were genuinely travelling in, and that indirection is load-bearing:
   snapped to a transition your horizontal speed falls to ~0 and the body's own
   forward axis tips towards vertical, so neither is any use as "the way I am
   going" at the moment you leave. Measured on a plaza ramp at a controlled
   approach — holding: `pipe → pipesnap → air` leaving with horizontal 3.0 and
   only its own 2.0 of climb, carrying well past the ramp; letting go:
   `pipe → pipesnap → pipe → ground`, never past the ramp, back where it started.

2. **The stance switches to match where you are going.** Ride up a quarter pipe
   and come back down and you are rolling tail-first: the board is travelling one
   way and pointing the other, and in the original pushing then *fights* your own
   momentum until you have scrubbed it all off and turned round. A switch here
   means one thing — **make the way you are MOVING the way you are FACING** — and
   it fires on its own, every physics tick you are on a surface (`ground` or
   `pipe`), as soon as you are squarely backwards (`FAKIE_DOT`) above walking
   pace. It is deliberately NOT "turn round": pressing **Q** / **SWITCH** while
   already rolling forwards does nothing, because turning a forward-rolling
   skater round would just leave them going backwards.

   Velocity is untouched, so no speed and no line is lost — only which end of the
   board is the nose. Three things move together: the body yaws 180 in one frame
   because the physics needs it to; a dedicated `turn` group on the model starts
   at the opposite 180 and unwinds over `SWITCH_SPIN_TIME`, so what you *see* is
   the skater spinning round rather than teleporting; and the chase camera's yaw
   rate is kicked up for a third of a second so it swings behind you promptly.
   Measured on a plaza ramp: ride in at −z, `pipe → pipesnap` at the apex, back on
   `ground` facing +z with velocity +9.2 and climbing to max — pushing now
   accelerates instead of fighting. A `SWITCH_COOLDOWN` stops it flip-flopping,
   and it scores 200 as a Revert when you ask for it by hand, which keeps a
   switch landing inside a combo.

3. **Rolling off an edge is not a jump, and not a trick.** `player_ground.gd`
   adds `GRIND_END_UP_VEL` — three metres a second straight up, 60% of a full
   ollie — every time the ground probe misses while riding, and
   `character_tricks.gd` scores an Olli on *any* entry to the air because
   `_start_trick` matches it unconditionally. Between them, driving off the top
   of a quarter pipe into a bowl pops you into the air and pays you for a trick
   you did not do. The pop is gone from the Ground state (Grind keeps it, which
   is what the constant is named for), and an Olli now needs an actual pop:
   every `handleJump` and the over-the-lip launch set `ctrl.popped`, and
   `Air.enter` checks it. Measured rolling off both a ledge and the bowl coping:
   vertical velocity at launch 0, ollis 0, score 0.
4. **Up pushes.** In the original the only full-rate push is the jump button
   held down; Up gives a quarter-rate creep, so anyone who assumes forward means
   forward gets 1.5 m/s² and eight seconds to top speed. Up now pushes at the
   same rate as the button (`G.PUSH_ACC`, a shade above the original's 0.1), and
   holding both does not stack. Standing start to 11.5 m/s: 1.4 s either way.
5. **The ground probe is Godot's length, not longer.** See below — this one was a
   bug, not a choice.

## Design decisions
- **Fixed 60 Hz physics.** Every ported constant assumes Godot's default tick, so
  the loop accumulates real time and steps `1/60` up to five times a frame.
- **Multi-file, not one `index.html`.** The arcade's default is a single file, but
  this is a 1 400-line port of a twelve-directory Godot project; keeping the
  original's file boundaries is what makes it checkable against the source.
- **The camera never turns.** `player_character.tscn` fixes the camera's
  orientation and only follows the skater's position (lerped at `delta * 10`),
  which is what gives the original its diorama look. Kept exactly, including the
  38° fov — widened only on portrait screens so a phone still sees the bowl.
- **No tone mapping.** ACES crushed the charcoal grid to black; Godot renders this
  project linearly, so the renderer does too.
- **The ground probe reaches 0.3 m, not 0.65 m.** Godot's downward ShapeCast is a
  0.2 m sphere swept `RAY_GROUND_DIST` from the body origin. The port originally
  added a 0.55 m tail to that, and the result was the **double ollie**: a jump
  "landed" while still half a metre in the air, got floor-snapped back down with
  its upward velocity intact, and took off again — one press, two Air_Olli clips,
  four times the score. Instrumented, a single ollie was
  `ground→air` (Olli), `air→ground` **7 ticks later**, `ground→air` (Olli again).
  With the probe at Godot's length it is one of each, and ten seconds of riding a
  flat still shows zero state changes, so nothing was destabilised to get it.
- **Street Plaza's ramps were 180 degrees out.** `test_pipe.glb` opens towards
  -z at rotation 0, which is not what it looks like it should do; all four
  original placements faced outwards, so riding at one bounced you off its back
  wall and reversed your facing. The orientation is now probed and written down
  in `levels.js` rather than guessed, and there are six ramps, pulled in to 14 m.
- **Collision meshes are visible.** In `bowlpark.tscn` the `_Col_Floor` and
  `_Col_Pipe` meshes *are* the park you look at; only `_Col_Wall` is hidden.
- **Two deliberate softenings for a seven-year-old**, both commented in
  `src/states.js`: `player_fall.gd` only leaves a bail when you press Up, so here
  Jump works too and the upstream `FALL_TIMER` (2 s — set but never spent in the
  original) picks you up on its own; and `player_reset.gd` waits for another Up
  press before handing control back, where this waits a quarter of a second.
  Everything else that differs from the GDScript is a difference the engine
  forced, and says so at the point it happens.

## Memory
