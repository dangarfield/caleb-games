# Waypoints

An adaptation of *Waypoints* (Explorer Series Map 01 — "Whistling Water National
Park", rules v1.3 by Matthew Dunstan), a paper roll-and-write in which you hike a
national park over four days, drawing trails between waypoints on a topographic
map. Single player, high score.

**Status: build 1 — map authoring only. There is no playable game yet.**
The tool lives at `games/waypoints/mapper.html`.

## What build 1 delivers
A map editor and a live 3D preview, so the world data exists and is correct
before any gameplay is written. The window is split half and half: the flat map
on the left, the terrain it implies on the right. The 3D side rebuilds as you
draw but **never moves the camera** — you can park the view on one hillside and
watch it change as you add rings. "Frame map" is the only thing that resets it.

### The 6x4 grid and the palette
Fixed 6x4 grid of square cells, matching the printed map's 24 grid squares.
Everything is stored in **grid-cell units** (x 0-6, y 0-4), so the data is
resolution-independent and "crossing a grid line" is trivial to compute later.

Tools: Select (V), Contour (C), River (R), Lake (L), Woodland (W), Waypoint (Q),
Bridge (B), Decoration (D), Text (T).

Lines are drawn by clicking point to point. Two things make them behave like
contours rather than loose polylines:

- **They stick to the sheet.** A point dropped near or beyond the map border
  lands exactly on it, so a contour can be anchored edge to edge.
- **They weld.** A loose end dropped on another line's loose end joins the two
  into one contour (same level, or the level-less one adopts the other's).
  Clicking back on a line's own first point closes it into a ring.

**A contour is finished when it closes, or runs from one edge of the sheet to
another** — the two ways a real contour bounds an area.

**A river is different.** A watercourse is drawn in sections that meet each other
at confluences, and it can end by running into a lake, so an end that meets
another river or a lake is finished and is not flagged. The tolerance is the two
channels' own width: if their banks overlap, the water is continuous. On map 01
that separates the real confluences (all within 0.013 of a cell) from the genuine
gaps (0.085 and up) with room to spare, so it is not a number tuned to one map.
The joins are worked out once and cached against the rivers' and lakes' revisions
— the draw loop asks per river and the test is O(ends x courses). Finished ones draw in
solid contour brown; unfinished ones draw amber and dashed with a dot on each
loose end, and the count sits in Map contents. Closing one pulses green.

Waypoint types, matching the printed map's tracks: Bear, Rabbit, Bird, Trig
Point, Mountain (carries a height in metres), Lookout, Gear, Campsite (carries a
number). Keys 1-8. Each is drawn with its salmon "circle this space" ring, as on
the paper map.

### The symbols are the printed ones
Nothing on the map is a hand-drawn approximation any more. Every symbol is cut
straight out of `research/rules.pdf`: the three pages are rendered at 600 dpi,
each symbol's ink is tightened to its own bounding box and the paper is keyed to
alpha, so a PNG carries pure ink on transparency. Mid-greys in the print (the
bridge deck, the lake's waves, the woodland roundel) survive as half-alpha, which
means a symbol can be re-coloured later and keep its tonal structure.

`icons/` holds the set: the eight waypoints, the lake and woodland roundels, the
bridge, the water bottle, and the five ability symbols (camera, glider, coat,
kayak, backpack) for build 2. `icons/_work/` keeps the page renders and the two
scripts that cut them, so the set can be regenerated; the renders are gitignored.

Two needed repair. The **campsite** is printed with a numeral knocked out of the
flame, so the flame's enclosed holes are filled back in and the numeral's box is
recorded as a fraction of the icon (`CAMPSITE_NUM_BOX`) — the map prints the real
campsite number back into that space. The **bridge** sits in a scoring row
between a "3/" and a "+", so anything smaller than 15% of the largest connected
component is dropped before the crop.

**Icons scale with the zoom.** They are drawn inside the map transform with
heights in grid-cell units (`ICON_H`), not at a fixed screen size, so a symbol
holds its position on the map and grows with it. The artwork is 256 px on its
long edge, which is roughly native at the zoom where you place things.

The three decoration marks come from clean line art of the map's own symbols,
traced the same way: `dec-grass`, `dec-pine`, `dec-bushy`. The rules PDF has no
grass or fir — only the Woodland clover — so the map is the right source for
these. Their strokes are doubled at trace time (a distance transform gives the
stroke's half-width, which is then the dilation radius), and each type has its
own `scale` against the base decoration height: a tuft of grass is a quarter of
it, a tree a half.

The bridge's deck and the campsite's pin are the print's mid-greys, which read as
see-through on the map. Both are keyed to solid colour at crop time — the deck to
the pale centre of the ring, the pin to the ring's orange — because the ink and
the grey sit at different alphas, so a tint at draw time would take the ink with
it.

### Everything is anchored on its ring
A waypoint's stored point is the **orange ring you cross off**, not the centre of
its symbol: the ring is where the walker actually stands, so it is what the game
will use. The symbol stands on a line just above it, and can be resized without
moving anything — the Mountain's triangle is drawn at half size, as it is in
print, and its ring and height label stay put.

This changed what a stored coordinate means, so the map schema went to
`waypoints.map/2` and `migrate()` moves every `/1` waypoint down onto its own
ring. Nothing shifts on screen: a symbol lands within 0.003 of a cell of where it
was. `Doc.restore()` accepts any `waypoints.map/*` now and migrates — checking
for an exact schema string would have thrown away the saved map on the first
version bump.

The campsite pin takes the same orange as the ring, keyed in at crop time: the
pin's grey and the flame's ink sit at different alphas in the print, so the two
can be coloured separately and the flame stays dark enough for the number to
knock out of it.

### Lakes and woods are filled with their own symbol
A lake and a wood are not labelled with a roundel, they are **filled** with one.
The tile artwork is **square** — `lake-tile.png` and `woodland-tile.png`, built
by carrying the roundel's own tone out to the corners and keeping the symbol
inside it — so one copy fills the pattern cell exactly, tiles butt together with
no gaps, and there is no seam to line up. Circles could not do that: packing them
either leaves the base colour showing through the gaps or overlaps them into a
lattice.

The disc's tone is read off the artwork rather than assumed (the value that
dominates inside a circle inset from the rim), and the copy stops five pixels
short of the rim, or the roundel's anti-aliased edge shows as a ghost ring in
every tile. `FEATURE_TILE` sets the tile size (0.2 of a cell) and its alpha.

### The board is data, not a photo
The border of the sheet is the **weather track**, and it is the part of the game
you touch every turn: one player rolls a d6, everyone counts that many spaces
clockwise and circles the space reached, and the number in that space is the
movement points everyone gets. Each of the four sides is one hike. Landing on
the last space of a side makes that turn the last of the hike; play then moves
clockwise to the next side.

So it is modelled, in `mapper/board.js`: four tracks of sixteen spaces, each
carrying a value and a weather type, stored in the map JSON and editable space by
space. **Only the number matters mechanically** — the weather symbol is flavour —
which is why the values are what the editor is built around.

The ring wraps the **whole sheet**, not just the map: the left and right tracks
run past the bottom of the map and down the side of the score card, and the
bottom track sits under the card, as printed. `sheetH` is the height the ring has
to contain, which is the map plus whatever is printed below it.

Geometry is in cell units with the sheet's top-left at (0, 0), so the board lives
in the same coordinates as the map. **Nothing on the ring is rotated** — a number
you read sideways is a number you misread — so only the ORDER of the spaces turns
with the walk: the bottom track runs right to left, the left track bottom to top,
both printed the right way up. Down the sides the slot is tall and narrow, so the
number sits above its weather instead of beside it. One radius serves every
circle on the ring, set by those tighter side slots.

The four corner arrows are one colour and differ only in direction; which hike is
live is shown by tinting the block behind the arrow, and the hike number stays
upright whichever way the arrow points.

### The score card
Everything under the title bar is modelled the same way, in `mapper/card.js`:
the bear, rabbit, bird and mountain tracks; lookout, gear and trig; the four
journal entries and the four goals; the water you carry; and the SCORE row. The
title bar carries the series line, the park name and the scale bar.

Three rules keep it looking printed rather than generated. **Every row is the
same height across every column**; **every box is the same size**, stacked in one
column per block with a line running down it to that block's cumulative on the
score row, where the + + + = sit on the line joining them; and **every circle on
the card is the same size** —
one radius worked out from the tightest row and the tightest column, then used
everywhere, so a ten-space track and a five-space track carry the same marks.
That makes the water column's width a real constraint on the whole card, which is
why it gets the room it does. Each track is strung along a rule that runs from
its animal through the circles to its total, so the eye follows the row.

A space can carry a special action AND a value. The action sits behind, sized to
fit the circle by width as well as height, so the **number stays dead centre**.

A blank card shows blank boxes, not zeros: a printed sheet has nothing written on
it until you write something, and a grid of 0s reads as a score of nothing rather
than as a game not yet begun.

It is played on directly. A click circles a space, a second click crosses it out
(a special action is spent), a third clears it. Click a box and type — digits go
straight in, Backspace clears, Esc lets go — because the alternative is hunting
for a field in the sidebar while looking at the card. Clicking a bottle drinks
down to it; clicking a goal chooses it for the game.

**The totals work themselves out** from what is marked, by the rules: an animal
track scores its highest circled number, the mountain track sums what you wrote
(the x2 and x3 spaces are already doubled or tripled when you write them),
lookout and gear score 5 for four circled and 15 for five, trig scores its
highest. The journal and goal figures are written by hand, as on paper, and the
SCORE row adds the four together. So the card is a scorer, not a picture of one.

`tools/board.py` and `underlays/map-01-board.jpg` are how the values were read.
The script fits one homography to all 35 grid intersections and warps the whole
photo through it, giving a squared-up board to read the tracks off. Nothing in
the game loads that image any more — it is source material, and each side's
values total 46 or 47, which is the check that the read is about right.

### Draw order
The map paints in these passes:

0. **The board** — the weather ring and its corner blocks, then the paper itself.
1. **Background** — the traced photo, the level bands.
2. **Contours.**
3. **Lakes and woods** — flat colour, then the tiled symbol.
4. **Decoration background** — the soft radial washes.
5. **The river** — over the washes, under what crosses it.
6. **The grid** — over the ground, under the symbols, so you can see which lines
   a route crosses.
7. **Icons** — bridges, decoration marks, waypoints, then place names.

Everything drawn in map space is clipped to the sheet. A river's round end cap
and a decoration's wash both reach past the point that made them, and neither
belongs off the paper.

### Terrain from contours
**The bare sheet is level 0**, and every contour drawn on it is level 1 or above.
A ring — or an edge-anchored line plus the border it closes against — encloses a
region, and each cell belongs to the innermost region containing it.

Height between two levels is **interpolated by distance**: a cell `d_lo` from the
level below and `d_hi` from the level above sits at
`h_lo + (h_hi - h_lo) * d_lo/(d_lo + d_hi)`. So the ground climbs exactly one
interval per gap whatever the gap's width, and every step gets the same
treatment. The distances come from an exact Euclidean transform (Felzenszwalb &
Huttenlocher), not a chamfer approximation — a chamfer's isolines have corners at
45 degrees, and since height here is a ratio of two distances those corners land
straight in the terrain as facets. The bare sheet has no line to measure from, so it is given one: the
ground falls from the outermost contour to base over **`baseRun`**, the map's own
median contour spacing. That is what makes base-to-1 read like 1-to-2 rather than
a flat plain with a sudden bank at its edge. A few smoothing passes round the
creases where two contours are equidistant.

An edge-anchored contour cuts the sheet in two; the smaller side is raised by
default, flipped per contour from the Selection panel. Labelled summits rise as a
cone above the ground they stand on.

### Water
A river is a valley with water in it, not a trench. The terrain is sampled along
the course, the higher end is taken as the source, and the surface is forced
never to climb going downstream — water does not run uphill. The bed is cut below
that surface and the valley blends back into the surrounding ground at its rim,
so the banks stand above the water by construction. The profile is kept on the
river so the 3D view can lay its water on it rather than on the bed.

A lake's **surface is a mesh, not a plane**. At the shore it sits on the ground
it meets, so there is no hard edge where a flat quad clips into a sloping bank;
from there it eases down to the lowest point of the basin. Vertices that fall
just outside the outline are snapped onto the shoreline rather than dropped —
keeping only fully-inside quads shrank every lake to a sliver. The heights are
averaged a few times and the surface is lit with level normals, or following the
shore picks up every bump in it and the water reads as crumpled foil. The bed
drops away below all of that over a short run.

The land is smoothed first and the water cut into the finished ground afterwards,
followed by two light passes to take the corners off the carve. Both carves blend
from the ground that is already there rather than clipping it to a flat value —
clipping left a crenellated fringe along the rasterised carve boundary.

Contour lines are drawn **in the 3D world**, as bands in the terrain shader —
crossing them is a rules cost, so they have to be visible on the ground.

A contour with no level assigned is ink only — it is drawn dashed in the editor
and ignored by the terrain, so you can trace freely and assign heights after.
**Auto-level rings** sets every closed ring's level from how deeply it nests
(stepping down instead of up where a stack bottoms out in a lake).

### Level colours
One hypsometric ramp in `palette.js` drives both views, so they always agree:
green lowland through yellow and tan to snow. On the flat map each contour's
ground is tinted with its level's colour (largest region first, so inner rings
sit on top), the contour line is inked in a darker relative of the same colour,
and the level number is printed on the line. The **Levels** panel lists every
level in use with its swatch, its elevation and how many contours carry it;
clicking a row selects one. "Tint the bands" turns the fills off for tracing.

### Per-contour level and smoothing
There are no global line defaults. The **Selection** panel sits in the left
column under the tools: pick a line and it gives you its status, a level stepper
reading out the metres it means, and a **Smoothing** slider — both per contour. A newly drawn contour carries the level of whichever
one you last worked on, so drawing a series of rings stays quick.

Smoothing is cardinal-spline tension: 0 draws straight segments between the
points you clicked, 1 curves through them fully. The curve always passes through
every point, so rounding a contour never moves it or shrinks it.

**Corners on the sheet edge stay sharp.** Any span with a control point on the
border is drawn straight, and the whole curve is clamped inside the sheet, so an
edge-anchored contour meets the border cleanly instead of bowing over it.

### Decoration
Grass (Z), pine trees (X) and bushy trees (C). Each is a **single point that
seeds an area**, not a plant: it says what grows around here. The 3D view
scatters it over a radius from a hash of the point's id, so a stand is the same
every rebuild. **Spread** is per point; how thickly it fills is the map's
**Vegetation density**, which scales all three types together — density is a
property of the map, not of each placement. Woodland polygons have their own
**Forest density** (0 to 6), and are planted by area rather than to a flat cap: a
big wood used to get the same 60 trees as a copse, which is why forests read as
thin. The rate is set so 1 is open woodland and 6 is a closed canopy — on this
map a wood is only a few hundredths of a grid square, so the first rate tried
still gave parkland at the top of the slider.

Nothing grows in water. The carves rasterise a wet mask alongside the
heightfield and the scatter rejects any candidate that lands on it,
oversampling so a stand beside a lake still fills out on its dry side.

On the map it is **one glyph where you clicked**, over a soft radial wash for the
area it covers — present, but nothing like as dominating as a woodland polygon.
The wash paints with the background; the glyph paints with the icons, so nothing
covers it. The scatter belongs to the 3D view, where it becomes instanced cones,
canopies or tufts standing on the terrain. Drawing the scatter on the map as well
buried the traced contours under dozens of little symbols.

### Text
A text layer for place names — Golden Plains, Crooks Point, White Peak River.
Each label has its own size (default 0.06), rotation and letter spacing, and is
drawn with a paper-coloured halo so it reads over contours. Picking uses the rotated text box,
so long names are easy to grab and drag.

### Per-map tunables
Vertical exaggeration (default 3x), contour interval (100 m), level-0 elevation,
metres per grid square (5000, measured off the printed scale bar), lake depth,
base run, river depth and bank, smoothing, vegetation and forest density, and
solve resolution (default 56 samples per grid square).

Scale has its own panel, and every default there is the real size: trees x1,
ground cover x1, ground cover density, orbit exaggeration (8), the hiker's
height (1.8 m) and his own multiplier — for when you want to find him from
above rather than check the scale against him.

All stored in the map JSON, so each map can differ.

## Files
- `mapper.html` — the tool shell and layout
- `mapper/palette.js` — grid, colours, waypoint and tool definitions, icon layout
- `mapper/board.js` — the weather tracks: the spec, the geometry, the roll
- `mapper/models.js` — loads the scenery kit and bakes it for instancing
- `mapper/character.js` — the hiker: loads him, measures him, plays his clips
- `tools/build_models.py` — cuts the web-sized model set out of the nature kit
- `tools/build_character.py` — cuts the hiker out of the modular men pack
- `models/` — 33 .glb models and their shared textures (4 MB all in), plus the
  hiker (855 KB)
- `mapper/card.js` — the score card: tracks, journal, goals, water, scoring
- `mapper/icons.js` — loads and re-colours the symbols cut from the rules PDF
- `tools/board.py` — rectifies the whole board photo into cell units
- `icons/*.png` — the printed symbols, ink on transparency
- `icons/_work/` — 600 dpi page renders and the scripts that cut the icons out
- `mapper/state.js` — map model, undo/redo, autosave, geometry helpers, auto-level
- `mapper/editor2d.js` — 2D canvas: pan/zoom, drawing tools, selection, snapping
- `mapper/terrain.js` — contours to heightfield (multigrid Laplace solve)
- `mapper/preview3d.js` — Three.js preview, orbit and eye-level cameras
- `mapper/main.js` — wiring, inspector, file IO
- `maps/map-01.json` — auto-traced first pass, for correction by hand
- `underlays/map-01.jpg` — the photo rectified to the 6x4 grid, for tracing over
- `tools/trace_map.py` — the tracer (photo to rectified image to first-pass JSON)
- `research/` — source photo and rules PDF (gitignored)

### The scenery
The 3D view plants real models from the Stylized Nature MegaKit rather than cones
and spheres: pines, broadleaf and bare trees in the woods, grass, ferns, clover,
bushes and flowers where the decorations are, and loose rock on the tops.

`tools/build_models.py` cuts them down to size. The kit is 86 MB across 68 models
and 2K textures; the script takes the thirty-three the map needs, packs each into
one .glb, strips the normal maps (the preview lights with a Lambert material,
which never reads them) and drops the textures to 512 px. That comes to 4 MB, and
the textures stay EXTERNAL and shared — every tree uses the same bark and leaf
sheets, so embedding them per model would ship the same megabyte a dozen times.

**Ground cover.** The woods and the decorations only account for the places the
map draws something. Everywhere else was bare ground, which is not what open
parkland looks like, so a scatter layer runs over all dry ground outside the
woods: grass and wispy grass, clover, ferns and plants, flowers, mushrooms and
loose stones. Points come from a jittered grid rather than pure random — pure
random clumps and leaves visible holes — and the mix is weighted by elevation, so
the low ground is lush and the tops thin out to stone. Eye level plants a 275 m
disc around the walker at true size and replants when he leaves it; the orbit
view plants the whole park, boosted, on its own budget.

**Metres or span.** A model is planted at a size in metres, but "0.7 m" means
something different for a pine and for a clump of clover. A tree is sized by its
HEIGHT; ground clutter is sized by its longest axis, because a flower clump is
wider than it is tall and scaling it to a metre of height made it two metres
across — that was the field of purple blobs.

A model has several parts (trunk, leaves) with their own materials, so planting a
thousand means one `InstancedMesh` per PART, all sharing the same transforms.
Leaf cards are alpha-TESTED rather than blended: a thousand instanced trees
cannot be depth-sorted, and unsorted blended foliage draws holes through whatever
is behind it.

Everything is planted against a triangle budget — instancing makes the draw calls
cheap however many trees there are, but the triangles are still drawn — and the
whole map is seeded before anything is planted, so the budget is spent across the
park rather than handed out again to each wood. The build chip reports the total.

Scenery loads after the first build and triggers a rebuild when it lands, so the
preview comes up immediately on its primitives and swaps to the models a moment
later. Everything falls back to the primitives if the models are missing.

In the orbit view the scenery is exaggerated 5x, the same way the height is: a
25 m tree on a 15 km map is a third of a pixel. Eye level shows the park at true
size.

### The hiker
One figure on the ground settles any argument about scale: a park you cannot
find a person in is a diagram, and a park with a person standing in it is a
landscape. He is the Adventurer from the Ultimate Modular Men pack, cut down by
`tools/build_character.py` from twenty-four animations to three — idle, walk,
run — which takes him from 1.9 MB to 855 KB, because the sampler keyframes were
nearly the whole file. The UVs go too (the pack is untextured) and the joint
indices and weights narrow to bytes.

He exists whatever the view. In orbit he stands on the ground at true size; at
eye level the camera sits behind his eyes, so walking somewhere in one view is
where you are in the other. **Click the ground and he goes there.** At his real
pace a click across the park is a five-minute wait, so short hops run at true
speed and long ones compress into a few seconds, with the clip and its playback
rate following the speed he is actually making.

Measuring him is not `Box3.setFromObject`: a skinned mesh's vertices are placed
by its BONES, and this model's armature carries a scale of 100 that the mesh
node does not, so that box comes out a hundredth of the real size. The vertices
are walked through the skinning transform instead, every seventh one, once.

### Two presentations of the same park
Far out it is a model on a dark desk — the editor's own look, where the ink
reads and the scenery is deliberately oversized, because a 25 m pine on a 30 km
park is a third of a pixel. Close in it is a place: daylight, a horizon, and
everything at the size it really is. The sky, the haze and the scenery
exaggeration all run off one ramp, so the light and the scale change together.

The exaggeration ramp is **logarithmic** — a wheel tick is a percentage, not a
distance — and quantised to a handful of steps, because changing it rebuilds the
scene and without steps one spin of the wheel would rebuild sixty times.

Zoom goes in to about seven metres. Near plane and fog follow the zoom: a fixed
0.05 near plane is 250 m on this map and clipped the whole park away the moment
you came in close enough to stand beside the hiker.

### Where the ground cover goes
Planting 1 m tufts across a 30 km park at true size is thirty million of them,
so a close view plants a DISC and a far view scatters the whole park sparsely
and oversized. The disc follows the camera — not what the camera is looking at,
because screen density is set by how near the ground is to the eye, and the
ground at the bottom of the frame is the part you judge the grass by.

Inside the disc the points are a phyllotaxis spiral with the radius raised to a
power, so they crowd towards the near ground. Spread evenly over a kilometre the
budget went on ground a few pixels high at the horizon and left the grass at
your feet thin — and thin grass at your feet is exactly what you notice.

## Design decisions
- **Cell units, not pixels.** Keeps maps resolution-independent and makes the
  movement rules (a line crossed costs 1) directly computable.
- **Shapes store the points you clicked**; the smooth curve is derived on demand
  by `resolvePts`, so the ink on the map and the terrain can never disagree.
- **Smoothing is spline tension, not point relaxation.** Laplacian smoothing is
  curve-shortening flow — it rounds a ring by collapsing it. Taubin's
  lambda/mu pair fixes that for dense meshes but still mangles a four-point ring.
  A cardinal spline interpolates every control point at any tension, so the
  shape is preserved by construction.
- **Scenery and symbols get different boosts.** Props are true size at eye level
  and boosted in the orbit view so they are not sub-pixel. Vegetation takes a
  small boost (a big one made pines 180 m tall and the map read as a model
  village); waypoint and bridge markers take a large one, because they are
  symbols that have to stay legible from above.
- **The wet mask is rasterised, not tested geometrically.** Checking each
  scattered plant against every lake polygon and river polyline took a second on
  a map with 150 decorations; a mask lookup is 3 ms.
- **One ramp, two views.** Level colours live in `palette.js` and are used at
  full strength for 3D ground and at low alpha over the photo on the flat map —
  rather than two palettes that drift apart.
- **Height is interpolated, not solved.** Solving the sheet as one Laplace problem
  made every contour affect the whole map and never converged for a large region
  fed by one line. Pinning each region to its own level fixed the locality but
  gave every contour the same fixed-width bank regardless of the gaps around it,
  so base-to-1 climbed over a different distance than 1-to-2. Distance-ratio
  interpolation gives both: equal treatment per gap, and no global coupling.
- **Smooth the land, then carve the water, then smooth lightly.** Carving before
  the main pass let the blur silt up a narrow channel; carving after it with no
  pass at all left the rasterised steps of the carve. Neither order alone works.
- **Migrate on restore, not only on open.** `LAYERS` is the single source of
  truth and `migrate()` fills in an empty array for anything missing — but it
  only ran when a file was opened, so a map restored from `localStorage` kept
  the shape it was saved with and every new layer broke it. Restore migrates now,
  and the renderers treat a missing array as empty rather than throwing.
- **Blend, never clip.** Every carve boundary blends from the existing ground.
  Anywhere a carve clipped to a flat value — the lake's mean shore height, the
  river's rim held up to the waterline — the cut followed the sample grid and
  showed as a jagged fringe.
- **A river's banks come from cutting the bed, not from raising a lip.** Raising
  the rim to guarantee freeboard left a hard step all along the valley edge and
  made the river look like a causeway. The surface is already the running minimum
  of the ground along the course, so the banks are above it anyway.
- **Edge contact is a corner, not a curve.** A spline that rounds where a contour
  meets the border would either lift the end off the paper or bow outside it.
  Border points are treated as hard corners instead.
- **No global line defaults.** Level and smoothing belong to the contour, not to
  a mode you have to remember you are in. New lines inherit from the last one.
- **Snapping and welding have no switches.** Grid snap, point snap and end
  welding are always on; they were toggles nobody wanted to think about. Grid
  snap can still be flipped with `g`, and `wp.autoLevel()` in the console sets
  every closed ring's level from its nesting.
- **3D panning tracks the ground.** The pan rate comes from the view frustum at
  the target's distance, with the vertical term divided by sin(pitch) to undo the
  ground's foreshortening, so the terrain stays under the cursor at any angle.
- **The sheet edge is a contour boundary, not a flat frame.** Where a contour
  runs off the map it pins the border cell it meets; the rest of the border is
  interpolated between those pins. Only a map with no contour touching an edge
  falls back to holding the frame below level 0.
- **Unlevelled contours are ink, not terrain.** Tracing and height assignment are
  separate jobs, and the editor shows which rings still need a level.
- **Props are sized in metres** and boosted only in the orbit view, so eye level
  is a true sanity check of scale.
- **Models are chosen inversely to what they cost.** A set spends the same on
  each model, so the cheap common tuft is the common one — which is both more
  plants for the same triangles and, as it happens, what a meadow looks like.
- **Scale is a set of per-map knobs, and every default is the real size.** Trees,
  ground cover, cover density, orbit exaggeration, and the hiker's height and
  multiplier. A knob away from its default is a deliberate lie about size, and
  the panel says so.
- **The scale came off the printed scale bar, not off a guess.** On the board
  photo the bar runs 298 px against a 300 px grid square, so one square is 5 km.
  It had been 2500 by guess, which made every mountain twice as steep as it
  should be and made the whole park read as a model rather than a landscape.
- **Summits are rounded, not pointed.** A squared falloff is flat at its base and
  steepest in the middle, which put a witch's hat on every peak. Smootherstep
  over a radius near the map's own contour spacing gives a hill with a shoulder.
- **Three.js, not Canvas 2D.** The arcade's default is Canvas 2D; this follows
  the Deepfold/Paperboy/skate precedent of Three.js from the pinned jsdelivr
  build for genuinely 3D games.
- **Autosave** to `calebArcadeData:waypoints-mapper`, its own localStorage item.

## Locked gameplay decisions (for build 2+)
- Views: map-in-hand (terrain visible under the held map), first-person world,
  drone, macro. Two on-screen joysticks; compass and pause top-right.
- Strict movement-point budget from the weather track. Running out is not a fail
  in solo-easy: phone a friend, rest, fade to black, resume. Hikes are always
  completable; only bonus scoring suffers.
- Weather and time of day affect the scene. Wingsuit and kayak movement where
  terrain and gear allow. Special actions collected via a "find a box" moment.

## Testing

`mapper.html#sandbox` opens a throwaway document: nothing is restored from
`localStorage`, nothing is written to it. Use it for **all** automated testing —
the real map autosaves to `calebArcadeData:waypoints-mapper` and is Dan's work.
The flag is read from the hash, not the query string, because the dev server's
clean-URL redirect drops a query string and a safety flag that can silently fail
is worse than none.

## Memory
- 2026-09-14 — Build 1 created. Auto-tracing was explored first (grid detection,
  piecewise-perspective rectification, colour-masked layer extraction, 53
  correctly typed waypoints) but Dan chose to author manually; the tracer and its
  output remain as an optional prefill behind the "Auto-trace draft" button.
- 2026-09-14 — Three.js `onBeforeCompile` string injection needs a trailing
  newline before the original shader source, or the prepended block swallows the
  first `#define` and the fragment shader fails to compile.
- 2026-09-14 — Freehand contour drawing was built and then removed at Dan's
  request: clicking point to point is what he wants. Edge snapping, welding,
  ring closing and per-contour smoothing came out of the same pass and stayed.
- 2026-09-14 — Smoothing by averaging control points shrank closed rings away to
  nothing (curve-shortening flow). Replaced with a cardinal spline whose tension
  the slider drives; it interpolates every point, so no shrinkage at any setting.
- 2026-09-14 — Layout reworked to a half-and-half split (flat map / 3D), 3D
  controls pulled into their own "3D tools" column, global line defaults removed
  in favour of per-contour level and smoothing, sheet-edge corners made sharp,
  and a text layer added with size, rotation and letter spacing.
- 2026-09-14 — `rebuild()` used to re-aim the orbit camera every time, which made
  editing while watching one spot impossible. Framing now happens once, or on
  request via "Frame map".
- 2026-09-14 — Adding the decor layer broke every saved map: `Doc.restore()`
  did not migrate, so `m.decor` was undefined and the first draw threw. Restore
  migrates now; adding a layer to `LAYERS` is enough again.
- 2026-09-14 — Forest density range raised to 6 and its per-area rate raised
  with it: the sampler was placing exactly what it was asked for, the ask was
  just far too low (about 16 trees a hectare at maximum). 17k trees at density 6
  renders at 64 draw calls and 635k triangles.
- 2026-09-14 — Forest density split out as its own control and planted by area;
  lake surfaces became meshes that follow the land down to their lowest point.
- 2026-09-14 — Decoration reworked: nothing spawns in water, props roughly a
  third of their old size, per-placement count replaced by a map-wide Vegetation
  density, and waypoint markers given their own boost so shrinking the scenery
  did not hide them.
- 2026-09-14 — Decoration layer added (grass / pine / bushy) as area seeds rather
  than placed objects, scattered deterministically in 3D; the flat map shows one
  glyph per point over a wash, because the scatter drowned the map. Default
  text size dropped to 0.06.
- 2026-09-14 — Jaggedness traced to the chamfer distance transform (octagonal
  isolines feeding a distance ratio), the 4-neighbour blur (diamond footprint),
  and clipping at the carve boundaries. Exact EDT, separable box-blur Gaussian,
  blend-not-clip carves, res default 40 to 56. Max step between adjacent samples
  14.4 m to ~10 m; the contour hairlines now fade where levels crowd, which was
  smearing steep slopes dark.
- 2026-09-14 — Water made real: rivers get a monotonic surface and a valley,
  lakes a sloped shore. The water surfaces were invisible for a while because a
  lake's ShapeGeometry faces down after being rotated onto the ground plane and a
  river ribbon's winding follows the drawing direction — both are DoubleSide now.
- 2026-09-14 — Height model changed from per-region pinning to distance-ratio
  interpolation so base-to-1 spans the same run as 1-to-2.
- 2026-09-14 — Level colours added to both views, with a legend. Terrain skirts
  now scale with the height they bridge, which fixed the blocky, square-edged
  look; the 3D ramp and lighting were strengthened to match.
- 2026-09-14 — Terrain rebuilt around "the sheet is level 0". Previously one
  contour re-solved the whole map, so adjusting it moved ground everywhere.
- 2026-09-14 — `relax()` skipped the border rows, so ground reaching the sheet
  edge stayed at its seed value. It now relaxes every cell with clamped
  neighbours (no-flux boundary).
- 2026-09-14 — Testing cleared and later wrote to Dan's autosaved map. Added the
  `#sandbox` document so it cannot happen again; never test without it.
- 2026-09-14 — 3D right-drag panning was inverted vertically and ran at a fixed
  rate unrelated to zoom. Both fixed; the ground now stays under the cursor.
- 2026-09-14 — Selection moved to the left column; the Contours, Snapping and
  underlay-note panels removed at Dan's request. Snapping and welding stay on
  permanently; auto-level survives as `wp.autoLevel()` in the console.
- 2026-09-14 — Every map symbol replaced with the artwork from `rules.pdf`, cut
  at 600 dpi with the paper keyed to alpha. The campsite is printed with its
  numeral knocked out of the flame, so the holes are filled and the numeral's box
  recorded, letting the map print the real number back into it; the bridge shares
  its row with a "3/" and a "+", so components under 15% of the largest are
  dropped. The PDF has no grass or tree symbol, only the Woodland feature, so the
  three decoration types keep their drawn glyphs.
- 2026-09-14 — Icons moved inside the map transform with heights in cell units,
  so they scale with the zoom instead of holding a fixed screen size. The
  trig/lookout/gear "boxed" styling went with it — the printed symbols are plain
  line art, not badges.
- 2026-09-14 — Draw order fixed so ground never covers a symbol: background,
  contours, lakes and woodland, decoration wash, then every icon last. The
  decoration wash and its glyph are now drawn in separate passes for this reason.
- 2026-09-14 — The salmon "circle this space" ring sat at 0.66 of the icon height
  and clipped the wide symbols (the bear's legs, the bird's tail). Moved to 0.78,
  and the mountain's height label moved below the ring rather than through it.
- 2026-09-14 — The icons did not appear at all on first run: `icons.js` built its
  paths from a bare `'../icons/'`, which an `Image.src` resolves against the
  DOCUMENT url, not the module's. From `/games/waypoints/mapper.html` that asked
  for `/games/icons/`. Resolved with `new URL('../icons/', import.meta.url)`. The
  first test happened to serve the tool from the site root, where the wrong path
  clamped back to the right one — so serve test copies at the same depth the real
  site uses.
- 2026-09-14 — Decoration marks sourced from the printed MAP rather than the
  rules PDF, which has no grass or fir. The map's broadleaf is the same clover as
  the Woodland roundel, so bushy uses that artwork keyed out of the roundel; the
  fir and grass tufts are drawn to match, since the source photo renders them
  about fifteen pixels across.
- 2026-09-14 — Waypoints re-anchored onto their ring rather than the centre of
  their symbol, because the ring is the position the game will walk to. Schema
  bumped to `waypoints.map/2` with a migration that drops every old point onto
  its own ring, so nothing moves on screen. `Doc.restore()` had been comparing
  the schema string for equality and returning null on a mismatch — one version
  bump would have silently discarded the saved map. It now accepts any
  `waypoints.map/*` and lets `migrate()` do the work.
- 2026-09-14 — Campsite pin recoloured to the ring's orange at crop time rather
  than at draw time: the print puts the pin and the flame at different alphas, so
  a single tint would have taken the flame with it.
- 2026-09-14 — Woodland polygons padded with a mix of the two tree marks. The
  first rate (one tree per 0.0016 of a cell) turned a wood into scratchy texture;
  one per 0.0035 with the trees at 0.07 of a cell reads as a wood.
- 2026-09-14 — Draw order settled: decoration wash, then the river, then the
  grid, then everything with a symbol. The grid sits over the water deliberately
  — crossing a line costs a movement point, so you have to be able to see it.
- 2026-09-14 — Everything in map space is clipped to the sheet. A river's round
  end cap and a decoration's radial wash both spill past the geometry that made
  them, and both were painting onto the margin.
- 2026-09-14 — Lakes and woods filled with a tiled version of their own roundel
  rather than labelled with one. At a 0.17 pitch against a 0.14 symbol the
  roundels touched and it read as wallpaper; 0.21 leaves enough base colour
  between them to read as a texture. The forest tree scatter went with it.
- 2026-09-14 — The lake and woodland fills re-cut as SQUARE tiles. Tiling the
  round roundel meant choosing between gaps and a lattice; carrying the disc's
  own tone out to the corners gives one copy per pattern cell and a seamless
  fill. The disc's tone has to be measured off the artwork and the copy inset
  from the rim, or the roundel's anti-aliased edge ghosts through as a ring in
  every tile.
- 2026-09-14 — Icons rendered as solid colour blocks after a soft refresh. The
  code gated on `naturalWidth > 0`, which a decoding image reports from its
  header while it still has no pixels. `drawImage` of a zero-pixel source is a
  no-op, and a no-op does not composite — so the `destination-in` meant to cut
  the icon out of a filled rectangle left the whole rectangle, and the result was
  cached for the session. Gate on the load event instead, clear the tint and
  pattern caches when loading finishes, and version the icon URLs so a soft
  reload picks up re-cut artwork.
- 2026-09-14 — The 3D contour lines are the map's own polylines draped on the
  terrain, not a shader banding by elevation. The old way invented a ring at
  every interval the ground passed through, so a summit cone rising 400 m above
  the highest drawn contour wore four rings the map never had. The shader still
  does the hypsometric tint; it draws no lines at all.
- 2026-09-14 — `new THREE.Color(r, g, b)` takes components already in the working
  colour space, so a dark olive passed that way came out pale cream after the
  sRGB transfer. Use `setStyle` with the same CSS colour the flat map uses.
- 2026-09-14 — The terrain closes into a block: walls from the terrain's own edge
  samples down to three contour intervals below level 0, and a base. Taking the
  wall tops from the edge samples means a wall can never stand above the ground
  it holds up, including where a river has carved the edge on its way off.
- 2026-09-14 — River ribbons clamped to the sheet and pinned under the ground.
  The carve's surface profile is what the bed was cut against, but where a course
  leaves the map there is no carve, and the unchecked profile floated the ribbon
  over the lip of the block.
- 2026-09-14 — Vegetation rejects anything off the sheet. A wood may run to the
  border and a decoration scatters over a radius, so both were planting trees
  standing on nothing beyond the edge.
- 2026-09-14 — The board stopped being a photo. A rectified picture of the sheet
  looked right and did nothing: the weather track is rolled on every turn, so it
  has to be data. It is now four tracks of sixteen spaces in the map JSON, drawn
  from vectors and the printed weather glyphs, clickable, editable, and playable
  — roll a d6, the marker advances clockwise, a roll past the end stops on the
  last space and that turn ends the hike.
- 2026-09-14 — Landing on the last space does NOT end the hike on the spot. The
  rules make that turn the last one, so the walk still happens; finishing is its
  own button. Auto-advancing skipped a turn every hike.
- 2026-09-14 — The weather values were read off a phone photo where each space is
  about 35 px. The icons are a best-effort read and the numbers are the part that
  matters, so the editor is built around the numbers and every space is
  correctable. Each side summing to 46 or 47 is the signal the read is close.
- 2026-09-14 — The score card joined the board as data: every track, the journal,
  the goals, the water and the SCORE row, drawn from a spec and marked by
  clicking. The totals are derived from the marks by the rules rather than typed,
  so the card adds up as you play; only the journal and goal figures are written
  by hand, as on paper.
- 2026-09-14 — Typing goes straight into a selected box from the keyboard. A
  sidebar field would mean looking away from the card between every entry.
- 2026-09-14 — A space's action symbol has to be fitted to its circle by WIDTH as
  well as height: the camera is half again as wide as it is tall and hung out of
  the ring when sized by height alone.
- 2026-09-14 — "Number the contours" now defaults off.
- 2026-09-14 — The weather ring wraps the whole sheet, card included, as printed:
  the side tracks run down past the map and the bottom track sits under the score
  card. The ring's geometry takes a "how much is printed below the map" figure
  rather than assuming the map is the sheet.
- 2026-09-14 — One row height and one circle radius across the whole card. The
  radius is the minimum over every grid that holds circles, which makes the water
  column's width a constraint on the entire card — it had to be widened, at the
  journal and goal columns' expense, or every circle shrank to bottle size.
- 2026-09-14 — Numbers sit dead centre in their circles. Where a space carries a
  special action as well as a value, the action moved behind the number at low
  opacity instead of sitting beside it.
- 2026-09-14 — Blank boxes, not zeros, until something has been marked. A sheet
  of 0s reads as a score of nothing rather than as a game not yet started.
- 2026-09-14 — Every box on the card made one size and stacked in a single column
  per block, with a rule running down it to that block's cumulative on the score
  row. The score row's cumulatives sit directly under the columns they come from,
  so the + + + = can sit on the line joining them rather than floating between
  boxes that line up with nothing.
- 2026-09-14 — Each section spine is a single rotated line ("JOURNAL · 1 PER
  DAY"), not a pill with a second label alongside it. Two rotated labels in a
  column that narrow were unreadable at any zoom.
- 2026-09-14 — Nothing on the weather ring is rotated any more. The sides' slots
  are tall and narrow, so the number moved above its weather symbol rather than
  beside it, and the spaces became plain rectangles — which also made hit-testing
  an ordinary bounds check instead of an inverse rotation.
- 2026-09-14 — The corner arrows are one colour, differing only in direction. The
  live hike is tinted behind the arrow instead, and the hike number is drawn
  after the rotation so it stays upright.
- 2026-09-14 — The printed water bottle already sits in its own ring, so the
  circle drawn around it was a second one. Dropped.
- 2026-09-14 — Goal rows laid out from measured text widths rather than guessed
  offsets: the "2/" was running under the symbol it belongs to. The column had to
  widen to fit the "+10" once the symbol sat clear of the text.
- 2026-09-14 — River ends that meet another river or run into a lake no longer
  count as loose. The rule was written for contours, which only ever join
  themselves; a river is drawn in sections. On the traced map 01 this clears 12
  of 26 ends, and the remaining 14 are real gaps in the trace — the distances
  fall into two clean groups, 0.013 and below against 0.085 and above, with
  nothing in between.
- 2026-09-14 — The water bottle's crop cut about six pixels off the bottom of its
  ring, so every bottle on the card was drawn with a flat edge. Re-cut from a
  generous box, with the ring found as the largest component not touching the
  crop border and everything outside it masked off, so the neighbouring bottles
  leave no slivers.
- 2026-09-14 — Scenery models from the Stylized Nature MegaKit. Three things
  mattered: the textures are shared and external (every tree uses the same bark
  sheet), the normal maps are stripped (a Lambert material never reads them, so
  they were 600 KB the browser fetched and ignored), and leaves are alpha-TESTED
  (a thousand instanced trees cannot be depth-sorted, and unsorted blended
  foliage draws holes through what is behind it).
- 2026-09-14 — The first triangle budget was per WOODLAND, so seven woods each
  took "half the budget" and the scene came to 5M triangles. The whole map is
  seeded before anything is planted now, which also makes each model one
  instanced mesh for the park rather than one per polygon.
- 2026-09-14 — Slope is no use as a test for where scree goes: interpolating
  between contours leaves gentle slope almost everywhere, so weighting it put
  rocks across the entire park. Height alone, above half the map's range, puts
  them on the tops where they belong.
- 2026-09-14 — The water bottle is cut as a bare glyph like the kayak and the
  other special actions, and the card draws its circle like every other space.
  Baking the printed ring into the icon left no way to size the two apart.
- 2026-09-14 — Metres per grid square was 2500 by guess; the printed scale bar
  measures 298 px against a 300 px square, so a square is 5 km. Halving the
  horizontal scale had doubled every gradient, and the park read as a tabletop
  model. Existing maps keep the figure they were saved with — it is a per-map
  tunable — so a map made before this needs 5000 set in the Terrain panel.
- 2026-09-14 — Summit cones use smootherstep over a radius of 0.9 x the median
  contour spacing. A squared falloff is flat at the base and steepest halfway up,
  so each labelled peak came to a point; and the old 0.55 radius made them
  narrow spikes on top of the hill they were supposed to be.
- 2026-09-14 — A ground-cover layer over everything that is not wood, water or
  decoration. Without it the park was woods and bare ground: the grass only
  appeared where a decoration had been drawn, which is not where grass is. The
  points are a jittered grid (pure random clumps and leaves holes) and the mix is
  elevation-weighted, lush low down and thinning to stone on the tops.
- 2026-09-14 — Ground clutter is scaled by its longest axis, trees by height. A
  flower clump scaled to "0.7 m tall" came out 2 m across, because the model is
  flat and wide; that was the field of purple blobs. The loader now reports both
  `height` and `span` and the planter picks which one the model is sized to.
- 2026-09-14 — The hiker. Cut to three clips (1.9 MB to 855 KB), measured
  through the skinning transform rather than off the bind-pose box — the
  armature carries a scale of 100 that the mesh node does not, so `setFromObject`
  reported him a hundredth of his real height.
- 2026-09-14 — Click-to-move compresses long walks. Real pace over a 5 km grid
  square is an hour; a click across the park has to land in a few seconds, so
  the duration is clamped and the clip and its playback rate follow the speed he
  is actually making rather than the clip being sped up 25x.
- 2026-09-14 — A click is a click under four pixels of travel. Orbiting with a
  trackpad always moves a little, and having the walker set off every time you
  looked around is the kind of helpfulness nobody asked for.
- 2026-09-14 — The frame clamp on the animation loop was 0.05 s, which meant a
  machine drawing four frames a second walked him at a fifth speed. 0.25 s.
- 2026-09-14 — The ground cover disc is centred on the CAMERA, not the orbit
  target, and its points crowd towards the middle on a phyllotaxis spiral.
  Uniform density over a 275 m disc put the budget on the horizon and left the
  foreground bare, which read as no ground cover at all.
- 2026-09-14 — Orbit fog and near plane scale with the zoom, with a real-world
  floor: 600 m to 30 km. A fixed 12–90 was no fog at all from across the map and
  solid soup up close, and a 3 km far plane turned every ridge into a cloud.
- 2026-09-14 — Daylight close in, the dark model view far out, on the same log
  ramp as the scenery exaggeration. A hillside a kilometre away going navy was
  the single thing stopping the close view from looking like a landscape.
- 2026-09-14 — The grid lines are an editing aid for the model view. Standing in
  the park they are a blue line across the grass, so they are left out whenever
  the view is close.
- 2026-09-14 — Ground clutter was up to 1.6 m tall, which is chest height on the
  hiker. A tuft of grass is 0.38 m and a rock is 0.25 m, and the per-instance
  wobble narrowed from 0.7–1.4 to 0.78–1.22.
- 2026-09-15 — The river is drawn in SECTIONS whose ends stop a few hundred
  metres short of each other. On the map that reads as one river, because the
  channel is nearly as wide as the gap; to a hairline centreline test it is a row
  of separate rivers with holes between them, and the rules engine walked a hiker
  straight through. Ten joins are inferred in the index — greedy from the closest
  facing pair outwards, up to 1.2 km — and the map data is left exactly as
  traced. The test that catches it regressing is structural rather than
  numerical: take every bridge away and the park must break apart. Before the
  fix, 100% of it was still reachable; after, 41 of 52 waypoints.
- 2026-09-15 — An end with no partner is a spring, not a gap. Two of map 01's
  river ends sit 2 km and 6 km from any other water, high in the hills, and a
  stream is allowed to start somewhere. Reading every free end as a defect is
  what made the first diagnosis wrong.
- 2026-09-15 — `migrate()` spread the incoming map, which copies its ARRAYS BY
  REFERENCE, so the v1 waypoint shift rewrote the caller's own object: parse a
  file, migrate it, and the thing you parsed had already moved. The layers are
  cloned up front now. Found by routing the tests through the app's own
  migration rather than reading the JSON directly — which is also how the tests
  and the game came to be looking at the same map.
- 2026-09-15 — A mountain writes the UNDERLINED number of its height, not the
  height: an 800 m summit is an 8. Writing 800 made the mountain track worth more
  than the rest of the sheet put together — a test game scored 1235, of which the
  mountains were nearly all of it. With the fix the same game scores 47.
- 2026-09-15 — `#sandbox` in the game meant "do not work" rather than "do not
  persist": the store refused to write, and since it read back from localStorage
  a sandboxed game could not even add a walker. The session's copy is the source
  of truth now and localStorage is only the mirror.
- 2026-09-15 — `fit()` measures the canvas, so calling it before the browser has
  laid the page out frames the sheet to a rectangle that no longer exists — the
  board ended up half off the right-hand side. It runs on the frame after, and
  retries while the canvas still has no size.
- 2026-09-15 — The game page never called `loadIcons()`. Every symbol on the
  sheet is an image cut from the rules PDF, they arrive after the first paint,
  and `drawIcon` returns false until the load event fires — so the board drew
  once with no waypoints, no weather glyphs and no tiled fills, and never asked
  again. One call and a redraw. The mapper had always done it; the new page was
  written without noticing that it had to.
- 2026-09-15 — A `print` mode was added to draw the game's board "cleanly" —
  no unfinished-contour dashes, no loose-end pips, no underlay. It was reverted
  the same day, and the lesson is worth more than the code was: the mapper's
  render had been tuned over days and the job was to REUSE it, not to have a
  second opinion about it. The game and the mapper now share `mapper/sheet.js`,
  which is the only place the sheet is set up, and they render the same region
  to within 16 pixels of 202,100 — all of them antialiasing on one label.
- 2026-09-15 — All 177 contours on map 01 carry `level: null`. Nothing has been
  levelled, which is why the mapper draws them orange-dashed (unfinished) and why
  the game can only draw them in one flat ink. `wp.autoLevel()` in the mapper
  sets every closed ring's level from its nesting.
- 2026-09-15 — Rolling the start campsite used to teleport the player there. The
  die says WHICH campsite; being shown it on the map, with the other five marked,
  and putting a finger on it is the start of the hike. Six campsites drawn, the
  rolled one pulsing, a tap to set off.
- 2026-09-15 — The game's canvas takes three switches from `createSheet`, and
  they are about what the canvas IS, not how the map is drawn: no `underlay`
  (the tracing photo), no `pips` (the markers on line ends that go nowhere), and
  `locked` — pan and zoom only, no drags, no tools, no keys. Verified by hauling
  a contour vertex across the board three times, double-clicking it and pressing
  every editing key: the contour array came back byte-identical and the undo
  stack was still empty. The map itself is drawn by the mapper's code, unchanged.
- 2026-09-15 — The lattice and `costRoute` agree exactly, but only about the
  SAME route. A lattice path thinned to a few corners is a different route and
  chords across the river; costed whole, the lattice's own 84-point path came to
  the 0 it promised and committed. Worth remembering before any future
  path-simplifying: the cost is a property of the line, not of its endpoints.
