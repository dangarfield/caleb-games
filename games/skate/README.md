# skate

A Three.js port of [Godot_Skate](https://github.com/3deric/Godot_Skate) — the
state machine, the physics constants, the animations and the input buffer, all
carried across name for name. See `CREDITS.md` for what came from upstream and
under what licence.

Every park in it is a converted level from the original Tony Hawk's Pro Skater
games, grouped in the menu as **THPS** and **THPS2** — see below for how to
convert your own. The port was built on the upstream project's debug parks
(Bowl Park, the Warehouse) plus a Street Plaza assembled from the same pieces;
those have been retired now that there are real parks to skate.

Two skaters, **Ezra** and **Caleb**, each keep their own best score, their own
per-park bests and their own goal ticks.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` / arrows | push, brake, steer |
| `Space` | hold to crouch, release to ollie |
| `J` / `K` | flip / grab (hold a direction first for a different trick) |
| `L` | grind / lip trick |
| `Q` | switch stance |
| `R` | bail and respawn |

Touch: left thumb-stick; on the right, flip / grab / grind in a row with a wide
JUMP bar under them, in the same order and colours as `J` `K` `L`. Settings (the
gear, top right) switches between the follow camera and the original's fixed
rig.

Three things about the feel that are not the original's, all of them because a
converted THPS level is a building and the debug parks are not:

* **A wall is something you clip, not something you ricochet off.** The original
  mirrors your velocity off any wall you meet at more than about 30 degrees and
  turns you to face the way you now bounce, which in a corridor fires you back
  the way you came. Now a glancing hit keeps your speed and angles you clear —
  a 20 degree clip costs 9% of your speed and 21 degrees of heading, where it
  used to be a 90 degree reversal at a quarter speed. Ride squarely into
  something at speed and you still bounce.
* **Steering is calmer**: 2.8 rad/s on the ground instead of 4.0, and 5.0 in the
  air instead of 7.0. Trick spins are untouched — air steering got its own
  number rather than being slowed along with them.
* **The camera will not let the park get between you and the skater.** It
  sweeps from the skater's head out to where it wants to be and sits in front of
  whatever is in the way, snapping in and easing out so a pillar does not throw
  the view across the level.

Six things the original does not do:

* **Switch stance.** Come back down a quarter pipe rolling tail-first and the
  game restates the way you are *moving* as the way you are *facing*, flipping
  the model and swinging the camera round, instead of making you stop and turn.
* **Going over the lip.** Forward is also the push, so "is forward held?" is
  true on every approach to a quarter pipe and asking it lets nobody ride a
  transition. The ask has to be an ask: press forward *again* after you are on
  the ramp — let go and push back into it as you come over the top — and hold
  it, and you leave over the coping with extra speed. Keep the run-up push held
  and you get the default, which is up in the plane of the ramp and back down
  into it.
* **The plane lock is geometric.** Above the lip you may move up, down and
  sideways along the face of a ramp, but not away from it — a sheet of glass
  standing on the coping that bends as the coping bends, so a bowl carries you
  round instead of throwing you out of it. The original did this from a `_Rail_`
  polyline, which works in the debug parks, where a rail is drawn along every
  coping, and mostly does not in a converted THPS level, where the rails are
  wherever Tony Hawk put something grindable: of seventeen quarter pipes ridden
  up at speed in the Skate Park, seven locked and ten were launched off. It now
  comes from the ramp's own surface normal and a probe back down the
  transition, so it needs nothing but geometry. Across six levels, 42 of 44
  pops off a lip come back down onto the ramp.
* **The lock never argues with the ramp.** Holding the skater exactly in the
  plane means undoing every sideways nudge, and the push that gets a body out
  of a surface it has touched is one of those: on the near-vertical top of a
  transition the skater ended up pinned flat against the wall, sliding down it,
  still held above the lip. So the lock holds only while nothing is being
  touched — the instant the ramp is in the way, the ramp wins. The landing test
  is a plain vertical probe for the same reason: `shape_col_ground` only accepts
  a surface within 60 degrees of the way the skater is standing, and the body
  levels out in the air, so a vertical ramp face could never satisfy it. There
  is a four-second backstop on the lock as well, because a state that can hold
  the player should have an exit that does not depend on being right.
* **The board turns at the apex.** You climb a transition facing up it, and
  without this you come back down still facing up it — or, once any drift along
  the coping is in the mix, facing along the lip, which is how a drop-in turns
  into a skater lying sideways across the top of the ramp with their speed gone.
  Dropping in at 25 degrees off square, 22 of 29 landings came down more than 60
  degrees off the fall line; now 2 of 29 do. As the skater starts to fall the
  board comes round to the fall line, carried by the model's own spin
  animation, and it is put there again as the wheels touch down, since the ramp
  can interrupt the flight before the apex. A spin the player is actually doing
  keeps the body instead.
* **Steepness decides what a ramp is**, not the converter's label. It only tags
  a triangle `pipe` where the level carries one of THPS's vert triggers, and
  plenty of genuinely steep ramp — most of Skatestreet's, all of Skate Heaven's
  sampled — arrives tagged `floor`. Anything leaning more than about 35 degrees
  is a transition.

## Pinning a spot

Half of what is left to do on this port is about places — which ramp sticks,
where the letters should go, which doorway ought to open — and describing one in
words does not work. Press `I` and click the level: each click drops a pin and
prints a line saying where it is, what mesh you are looking at, what the
collision there thinks it is, how far above the floor it sits, the nearest rail
and the nearest scattered prop. `C` copies the lot, `X` clears, `I` again turns
it off. It is a developer tool and nothing about it is on until you press the
key.

    #3 | thps-skware | at 46.2,11.0,-19.0 | mesh SKWARE_Mesh_01
       | collision floor n.y 1.00 | 0.1m above floor
       | rail SKWARE_Rail_011 5.9m away | nearest letter 10.1m | 2.4m from skater

"NO collision" in that line is an answer rather than a failure: it means the
surface is drawn and the skater would go straight through it.

`O` cycles a collision overlay: first the outline over the level you can see,
then the level taken away entirely and the collision standing on its own —
textures off, every plane filled in the colour of what it does and every
triangle still showing — then off. Green floor, red wall, blue pipe. A converted level has two
versions of itself, the one you look at and the one you collide with, and every
awkward bug in this port so far has been a disagreement between the two. Floor
you fall through is a hole in the green. Riding on nothing is green where there
is nothing drawn. A bank that behaves like a wall is red where you expected
green. All three answer themselves by looking.

## Layout

```
index.html          shell, HUD, menus, touch pads
src/config.js       every tunable, lifted from the Godot original
src/physics.js      collide-and-slide over a triangle soup + uniform grid
src/player.js       the character controller
src/states.js       the ten states (ground, pipe, air, grind, lip, fall, ...)
src/paths.js        arc-length-baked rail curves
src/level.js        reads a park out of a glTF by node name
src/levels.js       which parks exist and what you are asked to do in them
src/thps.js         discovery and setup for converted THPS levels
tools/              the THPS level converter (see below)
```

A level is nothing but a naming convention in the glTF — `X_Col_Floor`,
`X_Col_Wall`, `X_Col_Pipe`, `X_Rail_A`, `X_Mesh`. That is how the original does
it, and it is why the converter below needs no engine changes.

---

# Loading original THPS / THPS2 levels

`tools/` converts a level out of the first two Tony Hawk games into a glTF this
game reads with no engine changes at all. **All twenty levels work** — the nine
from THPS1 and the eleven from THPS2:

| THPS1 | | THPS2 | |
|---|---|---|---|
| Warehouse | `skware` | Hangar | `skhan` |
| School | `skschl` | School II | `sksl2` |
| Mall | `skmall` | Marseille | `skmar` |
| Skate Park | `skvans` | New York | `skny` |
| Downtown | `skdown` | Venice Beach | `skven` |
| Downhill Jam | `skjam` | Skatestreet | `skss` |
| Burnside | `skburn` | Philadelphia | `skph` |
| Streets | `sksf` | Bullring | `skbul` |
| Roswell | `skros` | Skate Heaven | `skhvn` |
| | | Bonus Parks 1-2 | `skb1` `skb2` |

Pure Python 3, standard library only. No Blender, no numpy, no bchunk, no
7-Zip, no pip install, no mounting anything.

**No game data is in this repository and none should be.** The levels are
Activision and Neversoft's. `assets/thps/` is gitignored, so a converted park
stays on the machine that converted it.

That means a fresh clone has no parks in it. What travels instead is the
converter: point `tools/build_levels.sh` at your own extracted files and it
rebuilds all twenty in about a minute.

    tools/build_levels.sh                    # research/thps2-tools/out2
    tools/build_levels.sh path/to/extracted

It is deterministic — running it twice gives byte-identical `.glb` files — so
the levels are reproducible without ever being committed.

## Getting the files off the disc

Three steps, because a PlayStation disc image hides its files twice over.

```bash
cd games/skate

# 1. A .bin is the raw CD stream, 2352 bytes per sector, not an .iso. Strip the
#    sync marks and error correction and there is an ISO 9660 filesystem inside.
python3 tools/psx_iso.py "research/Tony Hawk's Pro Skater.bin" --list
python3 tools/psx_iso.py "research/Tony Hawk's Pro Skater.bin" \
    -o research/extracted --only CD.

# 2. The levels are not loose on the disc either — everything is packed into
#    CD.WAD, indexed by CD.HED.
python3 tools/thps_wad.py research/extracted/CD.HED research/extracted/CD.WAD \
    --only sk -o research/levels
```

`thps_wad.py` handles both games, and they index that archive differently:

* **THPS1** stores plain filenames in `CD.HED`, so its 669 entries read straight
  off.
* **THPS2** stores only a **hash** — 1531 records of `<u32 hash> <u32 offset>
  <u32 size>` and not one filename — which is why the community had to
  brute-force the THPS2 filename list. We do not need the whole list, only the
  levels, and a level's name follows an obvious pattern, so the names come back
  by hashing candidates with the game's own CRC and seeing which the index
  already knows. Anything unrecognised still extracts, under its hash.

  `--hunt 4` is how the last three were found: `skph` (Philadelphia), `skbul`
  (Bullring) and `skhvn` (Skate Heaven) are not guessable from the level's
  English name, so it walks every two-to-four character code and keeps the ones
  that have geometry as well as a node table.

Each level is `skXXX.psx` (geometry) plus `skXXX_t.trg` (rails, spawns, goals).
`skXXX_l.psx` is the texture library and `skXXX_o.psx` and `skXXX_2.psx` are
unused here.

## Converting

```bash
cd games/skate
O=research/thps2-tools/out
python3 tools/thps2glb.py $O/skware.psx $O/skware_t.trg --inspect     # look first
python3 tools/thps2glb.py $O/skware.psx $O/skware_t.trg \
    --scale 256 --name "Warehouse" -o assets/thps/skware.glb
```

It writes the `.glb` and registers it in `assets/thps/levels.json`, which is how
the game finds it. Reload and the park is in the level select. Convert another
and it appends.

A level converted before that pass existed can be brought up to date without
the original `.psx`, which matters because `assets/thps/` is gitignored and the
game data may no longer be on this machine:

```bash
python3 tools/glb_deconflict.py assets/thps/*.glb
```

It rewrites the drawn positions in place — nothing added, nothing removed — and
is safe to run twice, since faces it has already separated no longer overlap.

`--inspect` parses everything and writes nothing. Read three things off it:

1. **The triangle counts.** Floor, wall and pipe should all be non-zero. Zero
   pipe means no transitions were found and the park will not be skateable.
2. **The rail line.** `link array points at a rail 91% of the time` means the
   rails chained cleanly. A low percentage means that file does not work the way
   we think — try `--rails-by-order`.
3. **The size.** 256 units per metre is right for THPS1; see below.

## What the file tells us, and what it does not

**The VERT flag is a trigger, not a surface.** Both reference projects describe
`0x0040` as "a quarter pipe's large polygon", which reads like it *is* the
transition. Dumping a real one settles it. The Warehouse's object 206 is a
ribbon of seven profile points swept 4 m wide — a textbook 2.2 m quarter pipe —
and its VERT face is a single invisible quad standing on the lip and running
20 m straight up. It is the "you are in vert" trigger. Collide with it and every
ramp in the park gets an invisible wall along its coping.

So the VERT faces are dropped, and used for what they reliably say instead: the
bottom edge of the quad is the coping. Geometry within `--pipe-reach` of a
coping line and below it is transition (`_Col_Pipe`); everything else is floor
or wall by steepness. In Burnside and Roswell the triggers are whole models of
their own, a fence of them ringing each bowl, which is why the rule is spatial
rather than per-model.

**Not-skateable is not a wall.** It is tempting to send every face flagged
`0x0100` to the wall bucket — it is right there in the file and it means what it
says. But `wall` in this engine means "bounce off it", and a lot of what THPS
marks unskateable is flat ground: carpet in the Mall, grass, road markings.
Measured, that pinned the skater at 5 m/s in a corner for 45 seconds. Steepness
decides instead. Riding across a patch of grass the original would not let you
skate is a much smaller sin than being unable to move.

**The `.trg`'s positions are not divided by 4096.** The reference disassembler
prints node coordinates as `x/4096` to make them human-sized, which reads like a
fixed-point conversion and is not — measured against real geometry, a node's raw
int32 is already in the same units as `object_origin/4096 + vertex`. Divide and
every rail in the park collapses into a 1 m cube at the origin.

**Rails chain through the leading array.** Every node opens with a uint16 count
and that many uint16s. The reference disassembler labels it `unk`; in
THPS3/4/THUG the equivalent array is the `Links` list the Blender importer
chains rails through. Assuming the same here gives 15 clean chains in the
Warehouse and 122 in Downtown, with 91% of links resolving to another rail node.
THPS2 is a bit messier — 64% in the Hangar, 83% in School II — but still chains,
and `--inspect` reports the percentage so a file that disagrees says so.

**Scale.** THPS vertices are 16-bit integers in units nobody wrote down. 256 per
metre is the answer for both games, and it is a measurement rather than a guess: at
256 the Warehouse's quarter pipes come out 2.16 m tall and 2.30 m deep, which is
a real quarter pipe. (`io_thps_scene`'s 2.25 comes from its THUG-era importer
and would put a PS1 park on a 44 cm grid.) If a level from another game comes
out wrong, `--inspect` prints the size and you adjust from there.

**How far you can see is measured, not chosen.** The fog was 46 m to 130 m,
which was right when a converted level was about 135 m across. They are twice
that now: School II is 277 m wide, New York 475, so everything past the middle
of one faded to the background colour and read as sky — a wall a hundred metres
off is not missing, it is painted the same colour as the air. Of the geometry
visible from eye height, 8.6% of Streets and 7.6% of New York was more than
60% fogged; now none of it is. The park says how big it is and the fog follows,
with the far plane just past where the fog finishes, since a far plane beyond
that costs depth precision and buys nothing. Same class of mistake as
`--pipe-reach`: a distance in metres that quietly stopped meaning what it meant.

**Two polygons can share a plane, and a Z-buffer cannot referee it.** The PS1
drew back-to-front with no depth buffer, so an artist could lay a road marking
exactly on the road, a poster exactly on the wall, or draw a dividing wall once
from each of the two rooms it separates, and rely on drawing it second.
Depth-buffered hardware has no such rule: two surfaces at the same depth make the
comparison a coin toss decided by floating point, the winner changes as the
camera moves, and the surface flickers. Casting 500 rays through each level
found 2.4% of them hitting two drawn surfaces less than 4 mm apart. The
converter now gives each such face a layer number, one more than anything it
already overlaps, and pushes it that many 12 mm notches out along its own
normal — 2.4% down to 0.08%, and 12 mm at this scale is under a centimetre of
real-world offset, so nothing looks detached. Collision is untouched: only what
is drawn moves.

**The baked colour IS the lighting.** The PS1 had no lights, it had a number per
vertex. Those come across as glTF vertex colours, which is most of what makes a
level of that era look like itself — but feed them into a lit material and the
level gets lit twice. Survivable in the Warehouse, whose median shade is 50 of
255; fatal in Venice Beach, whose median is 124 with half its faces at or above
the PS1's full brightness, where the whole level turns white. `THPS_EXPOSURE` in
`src/level.js` scales the baked colour back down so the result lands about where
the artist put it while still picking up the sun and the skater's shadow.

## What the converter does not do

* **The `.trg`'s own goals and pickups.** `TrickOb`, `GoalOb` and `PowrUp` nodes
  are all in there and none are wired up. The arcade's objectives are used
  instead: S-K-A-T-E and barrels are scattered onto the park by probing its
  collision, so a converted level gets a checklist without hand-placing anything.
  The `Restart` nodes *are* used — `Re_Start_Skate` is where the run begins, and
  the `Ho_` hotspots parked on individual gaps are deliberately skipped.
* **THPS3 / THPS4 / THUG.** Different formats (`.scn`/`.col`/`.qb`), and
  actually *easier* for rails — their node links are documented. Not done.

## Tests

```bash
cd games/skate/tools
python3 test_thps2glb.py
```

There is no THPS data in the repository, so the converter is checked against a
level synthesised byte by byte to the format both reference implementations
agree on: 29 assertions over parsing, the VERT rule, flag bucketing, winding,
the coordinate change, vertex colours and rail chaining.

`tools/feel_test.mjs` drives the wall rule, the steering rate and the camera
occlusion in a real browser — the wall rule directly, with a known contact, so
the result is about the rule rather than about where a ledge happens to be.

`make_fixture.py --park` writes a second, skateable fixture — flat ground, a
quarter pipe with its trigger curtain, a rail in the `.trg`. `e2e_thps.mjs`
converts it, loads it in a real browser and skates it, which is how the
transition and the rail were confirmed to work rather than merely to parse.

## Where this came from

Two projects did the reverse engineering; this converter is a reimplementation
that borrows their findings, not their code:

* [JayFoxRox/thps2-tools](https://github.com/JayFoxRox/thps2-tools) — the `.psx`
  and `.trg` layouts, and `extract-hed-wad.py`
* [denetii/io_thps_scene](https://github.com/denetii/io_thps_scene) — the
  collision flags, the coordinate convention and the quad winding

Where the two disagree, or where measurement disagrees with both, the source
says so at the point it matters.
