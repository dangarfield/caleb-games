# Deepfold

A horizontal auto-scrolling shooter in the R-Type mould, rendered entirely as
layered cut paper in Three.js. Drag anywhere to fly — the ship follows your
finger and fires on its own, so nobody has to mash anything. Hold a finger
still and the **Wave Cannon** charges; let go for a beam that goes through
everything. The **Force pod** — a paper disc — docks to the nose or the tail,
eats enemy fire, and can be thrown forward to fight on its own. Three stages,
three bosses, and everything on screen (ship, enemies, canyon, backdrop) is
stacked flat shapes with hard offset drop shadows in a cyan → blue → violet →
pink ramp. It fills the arcade's scrolling-shmup gap: there was a twin-stick
arena shooter (Clash of Space) and a space platformer (Callisto), but no shmup.

Target audience is the Garfield boys (~7+), tablet-touch first. Easy is the
default and is meant to be finishable by the younger one.

## Features

### The cut-paper render kit
- **`paper.js`** — the whole visual identity, as a library. Three hard rules it
  never breaks: `MeshBasicMaterial` only (there are no lights in the scene, and
  a lit material would shade the inside of a shape, which paper does not do);
  `ShapeGeometry`, never `ExtrudeGeometry` (pieces have no thickness — depth is
  z-order plus the shadow one piece throws on the next); and **shadows are
  meshes, not shadow maps** — two copies of the same geometry offset down-right
  at half opacity each.
- Shape generators: `blobShape` (seeded wobbly discs), `ribbonShape`,
  `wedgeShape`, `dartShape`, `spikedShape`, `teardropShape`, `arcBandShape`,
  `ringShape`, `roundRectShape`, `polyShape`, `pathShape`, plus polygon
  inset/outset for concentric contours.
- `contourStack` and `ribbonStack` build the reference art's nested rings and
  parallel bands; `mergeStack` and `mergeShadows` bake a finished assembly down
  to two draw calls. Everything random is seeded (`mulberry32`), so a stage
  built from seed 7 is the same stage on every device and after every reload.
- **`palette.js`** — colour as *ramps*, not swatches: four 12-stop gradients
  (`DEEP` for chrome, `STAGE1/2/3`), and a piece asks for "0.42 along STAGE1"
  rather than a hex, which guarantees it sits correctly against its neighbours
  at 0.35 and 0.49. One global `SHADOW` setting (`0x102a5c`, opacity 0.18,
  offset +0.40/−0.40 world units) because the light in a paper collage is one
  light. One `RIM` near-white sheet (`0xf2fbff`, 0.35 units) under every actor's
  silhouette.
- **`paper-lab.html`** — a standalone preview harness for the kit: every sprite
  and all three stage ramps on one page, with Stage 1/2/3 buttons. It is what
  the look was signed off from, and it is where you look at the art without
  playing to it.

### The three stages
| # | Name | Ramp | Length | Scroll | Canyon | Boss |
|---|---|---|---|---|---|---|
| 1 | Paper Reef | cyan → pink | 100 s | 26 u/s | open, gentle wander | **PAPER HULK** — 150 hp, `aimed` |
| 2 | Coral Cut | teal → coral → cream | 105 s | 28 u/s | pinches to a slot roughly every 12 s | **REEF BREAKER** — 190 hp, `sweep` |
| 3 | Violet Deep | indigo → crimson → peach | 110 s | 30 u/s | open but crowded | **NIGHT BLOOM** — 230 hp, `shutter` |

- Each stage is a **table, not code** (`waves.js`): a row is one formation —
  type, count, spacing in seconds, flight path, entry height, and whether its
  leader carries a power-up. Retuning a stage means editing the table.
- Stage 2 is the squeeze: the turret rows are timed to arrive *with* the
  narrows, so the wall guns are in the slot you have to thread. It is where the
  Force pod stops being a bonus.
- Stage 3 is stage 1's vocabulary with the spaces taken out — worms and
  jellyfish as the backbone, mine fields instead of mine lines, overlapping
  formations so fire arrives from two heights at once.

### The bosses
All three share a hull/weak-point shape: a 20-unit body whose 17-unit hull
soaks shots at 0.18× damage and a 9-unit gold weak point that does not. A
player shot **sinks into** the hull for one-fifth damage once, marks itself
spent, and keeps going — only the glowing core stops a shot, which is also
exactly what it looks like. At 45% hp each boss switches to a phase-2 pattern
(faster volleys, wider fans, plus a 10-shot ring every 3.4 s) and the shout
"IT IS ANGRY". Death is a five-stage paper shred, 0.42 s a stage. 5000 points.
- **aimed** — volleys straight at the player.
- **sweep** — ignores the player and walks a fan of fire across the screen on a
  sine. You dodge a pattern instead of out-turning a gun.
- **shutter** — carries a *second* weak point that is shut except for a window
  (1.35 s, 0.72× in phase 2) after each volley. It is worth 2.2× a normal hit,
  and while shut it is not in the collision list at all, so a shot cannot even
  find it.

### The Force pod and the Wave Cannon
- **Force pod** (`force.js`): four states, one button. *Docked* on the nose or
  tail, eating anything that touches it; *out*, flying forward at 96 u/s; *held*
  where it ran out of run (40% of the half-width), indestructible and firing on
  its own every 0.42 s; *back*, recalled at 118 u/s. Contact damage is 20 per
  enemy per 0.18 s, so parking it in a turret nest clears the nest while the
  ship is elsewhere. It docks to the end it launched from — unless the ship has
  flown past it, in which case the nearest end is the tail and it docks there.
  That is how one button moves the pod to the back. It can never be destroyed
  and never collides with the player.
- **Wave Cannon** (`input.js` + `bullets.js`): there is no charge button on
  touch — holding the finger still *is* the button. Sit inside 4 world units of
  a moving anchor for 0.35 s and the cannon winds up; full charge is 1.15 s.
  Moving cancels it, which is the whole decision the mechanic is made of. The
  beam is 8 units thick and worth 5 damage at minimum, 15 units and 16 damage at
  full, lives 0.34 s, and pierces — it carries a stamp that increments per
  firing and each enemy records the last stamp that hit it, so one beam damages
  twenty enemies once each without allocating a set.

### The enemy roster
Six types, all pooled at boot and never allocated from again. An enemy is a
*list* of circles, not one circle, so shooting the tail of a worm works.

| Type | Pool | HP | Score | Behaviour |
|---|---|---|---|---|
| Popcorn drone | 16 | 1 | 100 | Never shoots. Weaving formations; cannon fodder. |
| Spike mine | 12 | 3 | 150 | Never shoots, but touching it kills you. Drifts and spins. |
| Jelly drifter | 8 | 4 | 250 | Slow bob, fires every 2.6 s. |
| Wall turret | 8 | 5 | 200 | Bolted to the rock and travels with it; tracks the ship with its barrel and fires along it every 1.9 s, so the shot is readable before it happens. Clamped to the half-plane above its bracket, so it never shoots into its own slab. |
| Gunship | 8 | 6 | 350 | The heavy. Fires every 2.0 s; `swoop` leans toward the player. |
| Chain worm | 4 | 10 | 300 | Five linked beads sharing **one** hit counter — 10 hp is the whole chain, not a bead. Never shoots; an obstacle that snakes. Each bead lags one step further back along the head's own sine. |

### Power-ups
Three silhouettes so *which* one is falling is a shape question rather than a
colour question; all three carry the arcade's gold. Radius 4.2, 13 s on screen,
+50 score, dropped by flagged carriers 75% of the time (×1.35 on Easy, i.e.
always).
- **SPREAD** — three-way shot for 15 s. The volley rate eases from 0.155 s to
  0.19 s, so it is three times the shots for a slightly slower cadence.
- **SPEED** — the ship answers 1.42× faster for 15 s.
- **SHIELD** — soaks one hit. No timer; it waits until you need it.

### Difficulty and saves
- **Easy** (the default): enemy fire intervals ×2.2, enemy bullets ×0.66,
  enemy hp ×0.75, boss hp ×0.6, boss fire ×1.8 slower, fan sizes ×0.6, the
  player's hitbox ×0.82, **two extra lives** (5 instead of 3), and — the one
  piece of difficulty that is geometry rather than numbers — stage 2's narrows
  cut to 0.68 of their depth when the walls are built.
- **Normal** is every multiplier at 1.
- Per-player saves for **Caleb** and **Ezra**: best score, furthest stage
  reached, highest stage cleared, run count, and a once-ever "has been shown
  the pod" flag. Plus the shared mute and difficulty settings.
- One localStorage item, `calebArcadeData:deepfold`, with the game's object
  stored **directly** under that key (not nested under a `deepfold` field
  inside itself — that is the legacy shared-blob shape). See `store.js` below.

### Controls
| Action | Touch | Keyboard |
|---|---|---|
| Fly | drag anywhere; the ship follows the finger, held 9 units above it so a thumb never covers it | arrows / **WASD** |
| Fire | automatic, always | automatic |
| Wave Cannon | hold still 0.35 s, release | hold **SPACE**, release |
| Throw / call the pod | the 78 px **POD** pad, bottom right | **SHIFT** |
| Pause / mute | the corner chips | **P** / **M** |
| Restart, next stage | tap anywhere on an end card | **ENTER** |

### Presentation
- **HUD** (`hud.js`): a canvas-drawn pill top-centre (300×54), score, player and
  stage label, lives as little paper darts, a stage progress bar and a boss
  health bar. The 2D canvas sits over the WebGL one with `pointer-events: none`,
  so every touch still reaches the ship. The charge ring is drawn at the
  **ship's** screen position rather than in a corner — a ring in the corner is a
  number, a ring round the ship is the ship winding up.
- **End cards** are cut paper in the world, not HTML: game over, stage clear and
  the all-three-stages win, each with the score, the best line and a tap chip.
- **"Who you're up against"** (`guide.js`): a closed-by-default roster on the
  start card, built lazily on first open. Every row is *rendered from
  `designs.js`* — the same geometry the game flies at you — via a small
  second WebGL context with `preserveDrawingBuffer`, framed by moving the camera
  to each actor's bounding box (never by scaling the actor, which would drag its
  shadow offsets out with it). Every number in it is read out of `config.js`, so
  it cannot drift out of step with the game.
- **Audio** (`audio.js`): entirely generated, no files. One master gain so mute
  is one number; the theme loop is scheduled a quarter-second ahead from the
  frame loop rather than from a timer, because a `setInterval` scheduler drifts
  when the tab is throttled and then catches up in a burst of notes. The shot
  sound is deliberately tiny (25 ms, low gain, pitched away from the theme)
  because auto-fire plays it six times a second for a hundred seconds.
- **Confetti**: every kill bursts torn paper scraps in the stage's own ramp —
  16 for a light enemy, 34 for a gunship or jelly, 46 when the player dies, 70
  for a boss shred, from a 460-instance pool.

## File structure

```
games/deepfold/
  index.html          chrome only — back link, start card, POD pad, corner chips, importmap
  paper-lab.html      standalone art preview for the render kit (all sprites, all three ramps)
  src/
    main.js           wiring and the one frame loop; owns the ORDER things happen in
    config.js         every tunable number in the game, in one place
    camera.js         orthographic view; VIEW_HEIGHT = 100 world units on every device
    palette.js        the four ramps, the one shadow setting, the rim, the backdrop windows
    paper.js          the cut-paper render kit: shapes, contour stacks, shadow meshes, confetti
    designs.js        every actor cut from the kit — ship, pod, six enemies, boss, terrain slab
    background.js     the parallax collage: four sweeps + four cluster layers + a scrim
    terrain.js        the canyon — one periodic profile feeding both geometry and collision
    ship.js           the player: follow-the-finger flight, auto-fire, shield/charge rings
    force.js          the Force pod's four states
    bullets.js        every projectile, instanced and pooled, plus the Wave Cannon beam
    enemies.js        the pooled cast and the three boss variants
    waves.js          the stage director — the three formation tables and the power-ups
    hud.js            the canvas pill, the charge ring, the in-world end cards and callouts
    guide.js          "who you're up against", rendered from designs.js on first open
    input.js          one input object fed by a finger or a keyboard; the hold-still trigger
    states.js         menu / ready / play / paused / dying / over / clear / win
    audio.js          generated SFX and the theme loop
    store.js          the save: probe, verified write, prune ladder
  research/           the paper-art reference image and paper-lab screenshots
```

## Key design decisions

**Three.js rather than the arcade's default Canvas 2D.** A deliberate,
Dan-requested departure, with the same precedent as skate, callisto,
driven-wild and paperboy: `three@0.170.0` from the jsDelivr importmap those
games already use. The reason is specific to this game's look — a screen can
carry several hundred separate paper pieces at once (a backdrop of nested
contour clusters, seven bands per terrain chunk across fourteen chunks, fifty
pooled actors each built of a dozen layers), and in Canvas 2D that is several
hundred path fills per frame on the CPU. As geometry it is a handful of merged
draw calls on the GPU and the CPU does nothing but move transforms. It also
buys instancing for free: a hundred and fifty bullets cost six draws, and 460
confetti scraps cost one. There is still no build step and no dependency beyond
three itself.

**Fake offset shadow meshes rather than shadow maps.** Every piece's shadow is
two extra copies of its own geometry, offset down-right and drawn at half
opacity each, before the piece itself. It is the whole reason the art reads as
cut card. Real shadow maps would need lights, a render target and a depth pass
per frame, and would produce a *soft, correct* shadow — which is the wrong
look; the reference art's shadows are hard, uniform and all in the same
direction. There is exactly one global `SHADOW` setting and nothing may
override it, because the illusion dies the moment two pieces in the same
picture are lit from different places. The cost is two draws per piece at build
time only: `mergeShadows` collapses every shadow under a rigid assembly into
one mesh, which is why the rigid actors (drone, mine, gunship, ship, pod) are
merged whole and the articulated ones (worm beads, the jellyfish's bell, the
turret's dome, the boss's body) are merged one rigid sub-assembly at a time.
Anything that moves after its shadow is baked slides out from under it.

**The terrain profile is periodic, which is what makes chunk recycling
seamless.** The canyon is a conveyor of seven chunks a side that recycles by
moving a chunk one loop-length to the right — reusing geometry built for a
different stretch of world. That is only correct if the profile *repeats* with
exactly that loop length, so `profileAt(x)` is a sum of three sines whose
wavelengths all divide `LOOP` (= 7 chunks × 90 units = 630). It is continuous
everywhere, periodic to the floating-point bit, and needs no per-recycle
rebuild. The kit's own `designs.terrainSlab` could not be used for this: it cuts
its profile from a seed it keeps to itself, so chunk N+1's left edge has no idea
what height chunk N's right edge finished at — a conveyor of those has a hard
vertical step at every join, on a straight line, at a regular interval. The
chunks are therefore built from `paper.js`'s `ribbonStack` against this file's
own function instead, and they look identical. One profile feeds **both** the
geometry and the collision line, so the drawn surface and the thing that kills
you cannot drift apart; the invariant (`x === home − shift (mod LOOP)` for every
chunk) is exposed on the terrain object so it can be checked from outside. The
stage-2 pinch rides on top as a *one-sided* raised cosine squared — one-sided
because a plain sine would push the walls apart by as much as it pulls them
together, and half the stage would then have no visible wall at all.

**The backdrop/actor contrast rule.** A field made of contours will happily
swallow a seven-unit enemy cut from the same ramp. Two mechanisms stop it, and
both are asserted rather than assumed. First, every actor carries a near-white
rim sheet under its silhouette — one constant `RIM` colour, never per-object,
because a rim that varies stops being a signal and goes back to being
decoration. Second, `BACKDROP_WINDOW` clamps each backdrop layer's slice of the
ramp into a window per stage, so scenery is kept out of whichever end of the
ramp the actors are using: STAGE3 is hot from about 0.45 up (crimson and peach
are the actors' colours on that stage) so its backdrop is confined to
0.06–0.42 and receded 1.4×. STAGE2 is the declared exception — its ramp is
colourful at every point and has no quiet zone, so its separation is **hue**
(coral and cream actors on a green and teal field) backed by the rim. That is
written down in the palette rather than left implicit, because the next person
to retune that ramp needs to know the safety net is hue and not value. The same
rule drove stage 3's terrain bands running *down* the ramp instead of up: the
low end of STAGE3 is the same violet the backdrop is made of, and on a stage
with mine fields in open water a wall that vanishes into the scenery is a
fairness problem rather than a cosmetic one.

**A house ramp and a stage ramp.** The ship, the pod, the pickups, the bullets
and the end cards are cut from STAGE1 and never recut: the player's own colour
language has to survive a change of world. A stage's ramp dresses the backdrop,
the terrain and the cast. Changing stage therefore means cutting the art again
— the backdrop, fourteen terrain chunks and all fifty-odd pooled enemies —
which costs about what booting costs, so it happens with the stage-clear card
on screen and never during play.

**A tiny hitbox on a big sprite.** The ship is nine units nose to tail and its
kill-me radius is 1.2 (0.98 on Easy). That is not generosity for its own sake:
on a screen this full of paper, a hit has to be something the player can see
coming, and the only way to get that is to make the fatal part of the ship the
middle of the ship. Terrain is checked against a separate, 2.4× bigger circle
with 0.4 units of grace on top, because clipping a cliff with a wingtip and
living looks like a bug where surviving a bullet through the wing does not.

**Respawn in place, no checkpoint rewind.** Losing thirty seconds of progress is
the kind of punishment that ends the session for a seven-year-old. The ship
comes back where it died after 0.85 s with 2.1 s of invulnerable flashing, which
is enough to get clear on.

**The stage can never silently fail to end.** Advancing to the boss has a tidy
condition (every formation dispatched and drained) and a clock. If a stream ever
fails to drain — a spawn that found its pool full and was dropped, a type that
leaves the field some way the code has not thought of — the tidy condition never
comes true and the stage would run forever with no way out *and no way to lose*.
So 12 seconds past the stage's length the remaining formations are binned and
the boss comes anyway. A stage that ends untidily is much better than one that
cannot end.

**The pod gets told.** The Force pod is the best thing in the game and it is a
circle that sits in front of the ship saying nothing about itself — Dan could
not identify it cold. So the first run a player ever flies gets two paper
labels, one on the pod and one on the button that throws it, for 5.5 seconds or
until it is thrown. Once per player, ever, written down in the save.

**Every number lives in `config.js`.** The rule for that file: if a value would
ever be argued about ("the beam is too weak", "Ezra keeps dying on the third
wave"), it lives there and nowhere else. Gameplay modules read through `CFG` and
none of them carry a literal that matters. Width-dependent values are written as
*fractions* of the half-width and resolved at runtime, so the game plays the
same on a 4:3 iPad and a 19.5:9 phone, and rotating the tablet mid-run re-fits
the play box rather than stranding the ship against a boundary that has moved.

**Saves: probe, verify, prune.** `localStorage` is one ~5 MB quota for the whole
origin and a refused write is silent, so `store.js` follows the three rules from
`docs/decisions.memory.md` (2026-08-23): it probes at boot so a browser that
will not store anything says so before an hour of play, not after; it reads
every write back and compares it, rolling the value back in memory if it did not
land so the HUD never shows a best score that is not saved; and a refused write
climbs a three-rung prune ladder, giving up run counts and then the pod-hint
flag before it admits defeat. A best score a child actually set is never
dropped. Sizes are counted in characters, because that is the unit browsers
quote their 5 MB in.

**`window.PaperStorm`.** One debug handle exposing everything the game owns, so
a wave can be tuned from the console without a rebuild and a harness can check
that a stage got where it says it got. `PaperStorm.goStage(3)` drops straight
into stage 3 with the current score and lives, which is how you look at the
crossfire without flying the first two stages first.

## Memory
