# Waypoints — building the game

Build 1 was the sheet: a map authoring tool, the printed board and score card as
data, and a 3D preview of the terrain the contours describe. This is the plan
for build 2 — the game itself.

`game-waypoints.md` is the reference for what exists. This file is the plan for
what does not.

## Who plays it, and how

One of Dan's sons, alone, on a tablet, in landscape, with no keyboard. Single
player, high score, four hikes, about twenty minutes. The arcade's own rules
apply: death or loss returns to the menu rather than restarting; high scores per
player and per difficulty; a story blurb on the home screen instead of
how-to-play; ten lives and an infinite-lives toggle do not apply to this one, but
the solo easy mode's "you can always finish" promise does.

It is a faithful port of the paper game, not a game inspired by it. The paper
rules are the specification; where the 3D world and the rules disagree, the
rules win.

## The rules, as they will be implemented

### Shape of a game
Four hikes, one per side of the weather ring, walked clockwise from the top. Each
hike is several turns. The game ends when the fourth hike ends.

### Setup
1. Choose a goal (a, b, c or d) for the whole game. On paper you spin a pencil;
   here it is a spin or a pick.
2. Roll a d6. That numbered campsite is where hike 1 starts.

### A turn
1. **Roll** one d6. Count that many spaces clockwise along the current hike's
   weather track and circle the space reached. If the roll runs past the end of
   the side, circle the last space instead. **The number in that space is the
   turn's movement points.**
2. **Move or rest.**
   - **Move**: draw a route from your current waypoint to another waypoint you
     have not visited *or photographed*. Costs:
     - every contour or grid line the route crosses: **1**
     - an intersection of two lines: **2**
     - crossing the river: only at a bridge, and **free**
     - you may not pass through another waypoint on the way
     - you may cross your own earlier routes
     - you may spend less than your points as long as you reach a waypoint
   - Optionally cross out any number of water, **+1 movement point each**.
   - **Rest** (or being unable to move): draw nothing, **gain 1 water**.
3. **Mark the waypoint.** Circle the next space on the track matching the
   waypoint's type, left to right. A **Mountain** is different: write its
   underlined height in the next box on the Mountain track, doubled or tripled if
   that box says ×2 or ×3.
4. **Features**, once each, the first time a route passes through:
   - **Lake** → gain 1 water (circle the next space on the water track; if the
     track is full, nothing)
   - **Woodland** → circle the next space on the Bear, Bird *or* Rabbit track

### Special actions
Some track spaces carry a symbol. Circling that space earns the action; using it
crosses the circle out. Several may be used in one turn. An action with arrows
above and below must be used the moment it is circled.

- **Camera** — used immediately. Choose an unvisited waypoint in the same or an
  orthogonally adjacent grid square and mark its track as if visited. Cross off
  its dot: it can never be visited.
- **Glider** — after reaching a Mountain and writing its height, glide in a
  straight line to a non-Mountain waypoint in the same or an adjacent grid
  square, and circle its track. No Lake or Woodland benefits en route.
- **Coat** — when the weather gives 1 or 2 movement points, +3 for that turn.
- **Kayak** — join the river and travel along it, crossing up to 3 grid lines
  free, passing under bridges, then leave it for your waypoint.
- **Backpack** — is a Glider, Coat or Kayak; chosen when used.

### End of a hike
Circling the last space on the side makes that turn the last of the hike. Then
mark your final position with an X and **choose one journal entry to score**:

| | |
|---|---|
| 1 per | different type of waypoint visited this hike |
| 2 per | waypoint of one type visited this hike |
| 3 per | type of waypoint visited at least twice this hike |
| 1 per | 2 different grid squares the route visited, rounded down |

Journal scoring counts only this hike's visited waypoints and squares — not
photographs, not campsites. **Ending at a campsite doubles the entry** (a
campsite passed mid-hike does nothing). An entry type can only be scored once in
a game, and one must be chosen every hike even if it scores nothing.

Then move to the next side, start the next hike from where the last one ended,
and **gain 2 water**.

### Scoring
- **Bear, Bird, Rabbit, Trig** — the highest number circled on each track
- **Mountains** — the sum of the boxes
- **Lookouts, Gear** — 5 for four spaces circled, 15 for five
- **Journal** — the sum of the four entries
- **Goal** — the chosen goal, plus 10 for completing it:
  - a: 2 per Lake visited, +10 for all of them
  - b: 2 per Woodland visited, +10 for all of them
  - c: 1 per Grid square visited, +10 for all of them
  - d: 3 per Bridge crossed, +10 for all of them

**"All of them" is counted off the map, never off the printed sheet.** Map 01 as
traced has 13 lakes, 7 woodlands, 8 bridges and 24 squares where the paper says
9, 9, 7 and 24 - and the map is the truth, because it is the thing being walked.
Every total is derived from the loaded map at runtime, so a map drawn tomorrow
with four lakes scores its own four, and the card prints the number it derived
rather than one baked into the card spec.

The same principle settles what to do about a trace that does not quite close:
nothing. The river's sections stop short of each other where they meet, and the
engine stitches them in its own index rather than editing the map. If the drawn
map reads a certain way to a person, the rules read it that way too.

### Solo
- **Easy** — three of the four hikes must end at a campsite. Two or more that do
  not, and the game is lost.
- **Hard** — all four hikes must end at a new campsite. Any that does not, and
  the game is lost.

Losing still shows the score. The arcade promise is that a hike is always
completable: running out of movement is a rest, not a failure.

## How you play it

### One zoom, four views
The four views are not four modes with buttons between them. They are one
continuous axis - how far your attention is from the ground - and one pinch runs
the whole length of it:

```
    0 ------ 100 --------- 650 ----- 651 ------ 800 ------ 950
    paper    map in hand   his eyes  over the   drone      the whole park
    (read)   (draw here)             shoulder  (look)      (start pick, end)
```

The buttons step between 0, 100, 651, 800 and 950; a pinch or a wheel runs the
axis freely, and 950 to 1000 is a little headroom past macro so the last stop is
not also the end. The map is a sheet of paper the walker is holding, not a panel
over the world: it is a texture on a quad parented to the camera, so it hangs in
front of his face, the ground shows past its edge, and putting it away is the
same gesture as looking up.

Pinched right in, the paper map fills the screen and you draw on it. Pinch out
and the map goes away and you are standing in the park looking around. Keep
going and you lift off into the drone, range-limited from where the hiker is
standing. Further still and the whole park is in frame, which is where the menus,
the start-point pick and the end of the game live. Every crossing is a
transition, not a cut.

### Three ways to take a turn
All three build the same route object, and it is costed the same way whichever
made it.

1. **Point at it.** Tap a spot on the map and an arrow appears ahead of the
   hiker pointing that way. Walk towards it.
2. **Draw it.** Drag a route on the map. It snaps to waypoints, bridges and the
   edges of lakes and woodlands, refuses to be drawn through water, and counts
   its own cost as you drag. Commit it and a line appears on the ground to
   follow in first person.

   **A route is as many lines as you want.** Let go anywhere on open ground and
   that is a corner: drag again from the ring on the tip and the next line
   carries on from there, as many times as it takes to get round a hill. The
   route only finishes when a line ends on a waypoint. What you put down are the
   corners; what is drawn and what is CHARGED FOR is the rounded walk through
   them — centripetal Catmull-Rom, which passes through every corner exactly and
   does not loop out across a contour you were avoiding. The line on the paper
   and the line in the sum are the same line.

   **Undo** takes back the last line. The first press lets go of a waypoint the
   route had reached; after that each one drops a corner, and the last is a
   restart. A whole route thrown away because the last drag went wide is the
   sort of thing that makes a child stop playing.

   **You cannot draw on water.** A finger dragged over a lake does not draw a
   line you are then told off for: the point goes to the nearest shore, about
   30 m out, which is inside the distance that counts as having visited the lake
   — so being pushed out of the water is how you pick its water up. The rounding
   is pushed out with it, because a rounded corner beside a lake would otherwise
   bow into it. And a leg is now blocked if it crosses water ANYWHERE along its
   length, not only if an end lands in it: a straight line clean across a lake
   used to be legal, which it is not on paper either.
3. **Just walk.** Steer with the left stick and the route records itself behind
   you.

With a route drawn, **autopilot** walks it for you: the left stick locks out, the
right stick still looks around, the drone still works, and it can be
fast-forwarded. Because the drawn route is the rules object, autopilot can never
walk something you could not have afforded.

**Start the turn again** is always available until the turn is committed.

### What the world tells you
- Approaching a boundary or a point of interest is announced before you get
  there, not after you have crossed it.
- The hiker stops at the things that matter - water, woodland, animals, trig
  points - and the interaction happens there, in the world.
- **You cannot walk in water and you cannot cross the river** except at a
  bridge. The drawing tool will not draw through water either; drag near a lake
  and the route snaps to its edge and highlights that you are going to visit it.

### What you meet on the way
Everything the route is charged for is now called out as you walk past it — the
beats are worked out once, from the route the rules already costed, so the walk
and the sum cannot disagree. What exists today is the NOTICING. Four of them
want to become something you do rather than something you read:

| on the way | now | wants to be |
|---|---|---|
| crossing a contour or a grid line | a note, "Over the ridge −1" | nothing more. It is already paid for on the map; the note is the receipt. |
| crossing a bridge | a note, "Over the bridge, free" | he should slow on the planks and the camera should look down the river. |
| **reaching a lake** | a note, "Filled a water bottle +1" | **he should stop at the edge, kneel, and fill the bottle — with the bottle appearing on the water track as it happens.** If the track is full the rules give nothing, and the stop should say so rather than miming it. |
| **walking through a wood** | a note, "Into the trees", then the three-way choice on the phone AFTER he arrives | **the choice should happen IN the wood, at the moment he is among the trees** — the walk pauses, the phone asks what he saw, and the animal he picks appears. The rules already hold the choice open (`pending`); it is only the timing that is wrong. |
| **a photograph** | not implemented | the Camera action is earned on the track and must be used the moment it is circled. It should stop the walk, let him aim at one of the unvisited places in this square or the next, and take it — which marks that place and crosses its dot off for good. |
| **wildlife** | not implemented | animals are printed ON the map as bear, bird and rabbit waypoints, so "seeing wildlife" is arriving at one. A beat where the animal is actually there in the world, and startles, is the difference between a token and a moment. |
| the glider, the kayak, the box | not implemented | each is a set-piece: a flight from a mountain, a run down the river, a find. They are the reason to earn the actions. |

The pattern for all of them is the same and is already proved by the woodland
choice: the walk pauses, the phone asks, the rules answer. Nothing in `rules.js`
or `state.js` has to change for any of them — they are moments, not rules.

### What the map tells you
Yellow is this turn. Blue is where you have already been. Red is a route that is
not allowed.

| state | look |
|---|---|
| where you are standing | ring pulsing yellow |
| the route being drawn | yellow, dotted, rounded through its corners |
| the tip you can carry on from | a pulsing yellow ring on the last corner |
| ...and if it is not allowed | the same line in red, with a cross on what blocks it |
| will be activated by this turn's route | border flashing yellow |
| already visited or photographed | solid yellow |
| available, untouched | as printed |

Nothing is solid until it is walked: a dotted line is a plan, a solid one is a
hike. **Undo** takes back the last line and **Start again** clears the lot back
to where you were standing when the weather was rolled; both are offered from the
first corner onwards.

So before you commit a turn you can see exactly what it is going to earn you,
which is the thing the paper game makes you work out in your head.

## How it gets built

### The shape
The rules are about a **graph and a sheet**. The 3D world is presentation. So the
rules engine is headless and knows nothing about Three.js, and the world asks it
questions.

```
assets/           everything the game loads, and nothing else
  icons/            the 28 printed symbols cut from the rules PDF, + icons.json
  icons/ui/         two Material Symbols (Apache 2.0) for the pinch hint, + its licence
  models/           34 glTF models (the scenery kit + the walker) and 11 textures
  audio/            the theme, Opus in WebM
  maps/             map-01.json — the park itself
  underlays/        the traced photographs; the MAPPER's reference, not the game's

index.html        THE GAME. The only page a player opens.
game/view.js        its whole entry point: the map, the world, and the zoom
mapper.html       the AUTHORING TOOL. Drawing maps and correcting the sheet.
mapper/sheet.js     the one place a sheet is put on a canvas; both pages call it
mapper/editor2d.js  draws the map for both; `locked` makes it a board
mapper/preview3d.js the 3D world, shared with the mapper's preview
mapper/board.js     the weather ring, its geometry, roll()
mapper/card.js      the tracks, journal, goals, water, scoring

game/rules.js     pure: cost a route, what can I reach, what does this route touch
game/state.js     the turn machine: setup -> roll -> move/rest -> marks -> hike end
game/geometry.js  segment maths and the bucketed line index
game/play2d.js    the board as a game: the drag, the overlay, the panel's view
game/views.js     the named zoom stops, pure so node can test them
game/copy.js      every word the game says, in one file, with no DOM
game/tutor.js     the lessons: what to say at each moment of a first game
game/music.js     the theme, armed on the first gesture and never before
game/quality.js   what this machine is allowed, and the governor that corrects it
game/camera.test.mjs  the camera rule, the water marks and what a backpack is
game/phone.js     the panel down the right: a title, a line, buttons, an i, toasts
game/walk.js      walking a planned route: pace, beats, the stops along it
game/sticks.js    the two thumbsticks and their keyboard equivalents
game/pins.js      the sprite pins, each carrying the sheet's own printed icon
game/props.js     placeholder animals, kayak, glider and crate, built at true size

  -- parked, for the shell --
game/store.js     walkers and high scores, per player and per difficulty
game/play-app.js  the game shell: menus, walkers, HUD, score table
```

**The game page renders nothing of its own.** `index.html` is two canvases and a
zoom slider. The map on it is the mapper's renderer, set up by the mapper's own
module with `locked` — no dragging, no tools, no keys; the world on it is the
mapper's own `Preview3D`. If either wants to look different it changes in the
mapper, and the game follows. Nothing is duplicated, so nothing can drift.

The rules engine and the turn machine are finished and tested (246 tests: 68
rules, 94 turns, 42 views, 23 pack, 19 lessons) and now wired into the page. The views were got right first, on purpose: there was no
point hanging a game off a zoom that did not feel like one gesture.

**A map-side moment is shown on the map.** The page never invents a button for
something that belongs on the park or the paper. Choosing where to set off from
glides to macro and plants a pin on each of the six campsites, gold on the one
the die offered, and you tap it; everything else in a turn glides back to the map
in his hands and is done by dragging on the paper. Mid-hike the same pins show
where you are standing and everything the weather leaves in reach, so zooming out
is a way of SEEING the turn rather than of leaving it. The pins are built one unit
tall and scaled by camera distance, so they read the same from the drone and from
macro. Every marker is the same size, and **gold means tap me**: the campsite
the die chose, and the grounds a glider could land on. Nothing else is ever
gold, because when everything was, the one pin the player was being asked to
press looked exactly like the forty he was not. The rest are coloured by what
they ARE — animals warm, high places cool, water blue, trees green, kit orange,
campsites the sheet's own salmon — so a hillside is read the way the paper is.
Where you are standing is the one white marker with a dark rim. Anything already
collected keeps its colour and goes quiet, mixed towards the paper, so a full
map still reads at a glance as what is left.

The mapper's own waypoint posts — a twenty-six metre pole with a cone or a ball
on top, which is how you see where a waypoint is while you are placing one — are
turned off in the game (`v3.posts = false`). They are the right thing in the
mapper and scaffolding in the park, and two sets of markers for the same places
is one set too many.

**The mapper is not the game, but they draw the same board.** `mapper.html` is
where a map gets drawn and the printed sheet gets corrected; `index.html` is what
gets played. `mapper/sheet.js` is the ONE place either of them sets the sheet up
— same underlay, same icons, same everything — because every time that setup was
written out twice it drifted, and the game once shipped with no symbols at all
for want of a single `loadIcons` call. `Editor2D` also grew a `play` hook that
takes the pointer, disables every tool and draws the game's overlay inside the
map transform. The game passes `persist: false` when it opens the document, so a
game in progress can never be written into the mapper's autosave.

The game does not get an opinion about how the board looks. If the render wants
changing, it changes in the mapper and the game follows.

`rules.js` is the only place a rule is written down, and it is testable in node
without a browser. That is where correctness lives, and it is built first.


**The pack is one door.** Water is spent from the turn screen, because it is
spent every other turn and burying that deep is just a longer way of doing it.
Everything else — kayak, glider, coat, camera — is behind **Open backpack**, and
the bag lists everything he owns whether or not it works where he is standing: a
greyed kayak saying "you have to be beside the river" teaches the rule, while a
kayak that simply is not there teaches him the game lost his boat. `kit()` on
`Play2D` is the only place that decides what is offered, and it answers in the
rules' own terms — a kayak needs `meetsRiver` either under his feet or along the
line he is drawing, a glider needs a mountain AND somewhere in reach to land on,
the coat needs a day mean enough to be worth it. A backpack is a wildcard the
rules spend in place of anything, so the bag counts one as whatever it is asked
for, or the menu and the rule would disagree in front of him.

The kayak is taken out *before* the line is drawn and is not spent until the move
is committed, so getting it out, looking at the river and changing his mind costs
nothing. `Play2D.how` is the one place that says how this turn is being
travelled, and every sum about the drafted line is told about it.


**Four pages before anything is asked of you.** "Show me how" opens with what
the game IS — four days, a park, the weather decides how far, lines cost you,
everything you reach counts — one idea a page, with a dot per page so the end is
visible. The first thing the game used to do was ask for a mission, which is a
word that means nothing to someone who does not yet know there is a park.

**The tutorial is words, not rails.** "Show me how" on the title screen turns on
a set of lessons that say the one thing to do next — "Put your finger on the
flashing ring and drag it somewhere new" — and nothing else changes: every
button still works, nothing is disabled, and there is no "press this now"
sequence to get stuck in. `tutor.js` works out which lesson applies by LOOKING AT
THE GAME rather than by counting steps taken, so a child who wanders off, draws
three lines the wrong way round and comes back is told the right thing about
wherever he actually is. The specific lessons beat the general ones — "not that
way" wins over "draw your walk" — and that ordering is what the tests pin down.
It is pure, so node can read every word of it.

**What the line costs is a number at the top.** It changes while his finger is
moving, and it goes red the moment the line costs more than the day can pay for:
"this walk 7 of 9" is the whole game in four words. A bottle of water can be
drunk at any point — while drawing, which is exactly when a line one over budget
needs one, and out on the walk itself. Drinking now crosses the bottle off the
card as well as taking it off the count; before, it vanished from the sheet
entirely, which told him he had never had it.

### The two hard parts
**Costing a route.** Every contour is a polyline, the grid is 5 verticals and 3
horizontals, the rivers are polylines the route may not cross except at a bridge.
Cost is the number of crossings, with an intersection of two lines counting 2.
The same routine answers "what can I reach with 4 points", which is what makes a
turn legible - and it runs on every pointer-move while a route is being dragged,
so it is segment-versus-segment against a bucketed index of the map's polylines,
not a loop over all 177 contours.

**The zoom axis.** One scalar drives the camera, the map's opacity and scale, the
control scheme and which sticks are live. Getting the hand-offs to feel like one
gesture rather than three snaps is most of the work in the world layer, and it is
worth prototyping on its own before anything is hung off it.

**The macro view was rebuilding the park, over and over.** Re-planting the
ground cover means a full rebuild — a third of a second — and the patch it is
planted around is worked out from the camera, which moves on every frame of a
zoom glide. One press of the minus button was therefore five or six complete
rebuilds of a nine-million-triangle park, which is exactly what "the macro view
is suffering" feels like. The camera now moves freely and the cover is re-planted
once, a beat after it settles. The wide build is also a cheaper build: standing
in the park a tuft of grass is a real thing at your feet, and from macro it is a
fraction of a pixel, so the wide view's scenery budgets are cut — 9.8M triangles
down to 3.5M for a picture that looks the same from fifteen kilometres up.

**The theme.** `waypoints.m4a` encoded to Opus-in-WebM at 48k with six decibels
taken off (3.4 MB to 1.3 MB), per `knowledge/audio-patterns.md`: one tune, quiet,
looping, no mute button, nothing fetched until the first pointer or key event,
paused when the tab is hidden. And the arcade's `← Games` link is in its usual
corner — on the title screen, because mid-hike that corner is the park.

### Read the rules again
Two things were wrong against the printed rules, and both were wrong in the
quiet way: the game played on and told the child something false.

**The water.** A bottle you are carrying is circled; a bottle you have drunk is
circled AND crossed out. The card draws its bottles from `p.card`, which keeps
its own copy of the two numbers — and nothing ever wrote `p.card.waterUsed`. So
drinking took the bottle off the count and the sheet showed no cross and no
change: it said he still had every bottle he had ever found. There is one
`syncWater(p)` now and every path that moves water calls it.

**The camera is not about animals.** From the Special Actions panel: *"Camera:
Immediately choose a waypoint that you haven't visited in the same grid square or
an orthogonally adjacent grid square. Circle or fill in the next space in its
track as if you had just visited it. Then cross off the small dot next to the
Waypoint you took a photo of — you cannot visit it again."* It is a free extra
waypoint, handed to you by every space on the Lookout track, and the game never
offered it once. It works like the glider now: take it out of the pack, the
places in range light up on the paper and in the park, drag to one. Thinner
dotted line, because it is a sight line rather than a walk, and a tighter reach
— the glider takes the corners of the square, the camera does not, which is in
the rules rather than in anyone's idea of what ought to be fair.

Two more fell out of the same page. A backpack substitutes for *"either a
Glider, Coat or Kayak"* — three things, and the camera is not one of them; ours
stood in for anything. And the animal moments stopped borrowing the camera's
language: the wood asks what you want to LOOK for and an animal you walk up on
is one you WATCH, so "take a photo" means one thing in this game and it is the
rule.

**Nothing said the zoom was a gesture.** The whole game is one axis — the map in
his hands at one end, the park as a model at the other — and the plus and minus
buttons are discoverable without hinting that pinching does the same thing, on
the axis the game is actually built around. So a pill pulses beside those buttons
when the game loads: the Material Symbols `pinch_zoom_in` glyph and the words
*Pinch to zoom*, or `mouse` and *Scroll to zoom* on a machine with no
touchscreen, because the same words there would be a lie. It goes the moment he
zooms by any means — pinch, wheel, buttons, keys, all of which pass through
`setZoom` — and gives up on its own after twenty seconds rather than pulsing at
an empty room. The icons are the library's own SVGs, vendored rather than
fetched, and drawn as CSS masks so they take the interface's gold instead of
arriving black.

### Made to run on a tablet
The park is nine and a half million triangles of scenery and it is meant to be
played by an eight-year-old on whatever tablet is in the house. Five things were
costing that machine most of its frames, and none of them were the game.

**The sheet was drawn twice per finger movement.** `Play2D` repainted the printed
map on every pointer event, and the page then repainted it again from `repaint`.
Now the board defers to the page (`deferDraw`) and the page coalesces into one
animation frame: thirty drag frames went from seventy-one full sheet repaints to
thirty-four.

**Every marker in the park was rebuilt on every finger movement.** `markers()`
tore down and recreated sixty pin groups from `repaint`. Nothing about them
changes while a line is being drawn, so they are rebuilt only when a one-line
signature of what they SHOW changes — sixty rebuilds during a drag became one.

**The grass was being drawn through a whole drag.** The park behind the paper
stays — hills, woods, the river, the flowers round the edge of the sheet: that
is what the map is held up against and it is worth its triangles. But a route
being dragged repaints the sheet, re-costs the line and re-renders the park on
every frame, and five and a half million triangles of ground cover planted round
the camera is the difference between that being smooth and being a slideshow. So
the cover comes off for exactly as long as his finger is moving and is back the
instant he lets go — and at the zoom a route is drawn at, the paper fills the
screen, so there is nothing to see it go. The first version dropped it whenever
the map was up, which left a flat green field behind the sheet; a park with no
grass in it is not the saving it looked like.

**Zooming out rebuilt the park, five or six times.** See the note above: the
cover re-plant is now debounced to a beat after the camera settles.

**Everything was drawn at whatever resolution the screen claimed.** There are
three tiers now (`quality.js`), guessed from memory, cores and screen before a
frame is drawn: device pixel ratio, antialiasing, heightfield resolution, the
2D sheet's backing store and the scenery budgets all come off that one dial. A
governor then watches real frames — the median over a second, twice running, so
one rebuild hitch cannot trigger it — and steps the tier down if the guess was
generous: the pixels first, because nobody sees that, and the scenery second.
It stops after two steps, because a game that degrades forever looks broken.

Measured on the software renderer the tests run against, a thirty-frame drag went
from 33.7 s to 20.2 s with the park still behind the paper the whole time it is
being looked at.

### The order
1. ~~**`rules.js` with tests.**~~ **Done** — 52 tests against the real map.
2. ~~**Play it on the sheet alone.**~~ **Done** — 62 more tests, and a full
   four-hike game driven through the page.
3. ~~**The zoom axis.**~~ **Done** — one scalar from the map at his nose out to
   the whole park as a model, with the sheet a texture on a quad parented to the
   camera. 18 more tests on the named stops, which are pure and so testable in
   node; the rest was got right in a browser, because a tween measured at the
   headless renderer's 1.5 fps is always caught mid-flight.
4. ~~**Setup and a turn, on the map.**~~ **Done** — goal, the campsite pinned in
   the park and tapped, the weather roll, a route dragged on the held paper with
   its cost read back, committed, the card filling in, the journal, four hikes
   and a score. Driven end to end in a browser.

5. ~~**The rest of a turn in the world.**~~ **Done** — drawing a route now only
   PLANS it. The view drops to third person, the route is painted on the ground
   with a chevron ahead of him and a post at the far end, and two sticks walk it,
   with autopilot, fast, and the walk and run clips. Everything the route is
   charged for is called out as he passes it.
6. ~~**The shell, the front of it.**~~ **Done** — a title screen over the turning
   park with the walker picked from the phone; every dialog in a phone panel down
   the right with an ⓘ that explains the turn you are on; the weather chosen by
   stopping a spinner showing the next six spaces, and the sky fading over five
   seconds to match.

7. **The stops.** Mostly done — a lake stops him to kneel and fill a bottle; a
   wood stops him, he says what he wants a picture of, and that animal grows in
   on the path in front of him to be photographed. The gear crate is still to
   build.

   Three things had to be true before a stop read as a moment rather than as a
   pause. The walk's progress line stops painting itself over the phone, or the
   panel asking him to photograph a bear says `68%` a fifth of a second later.
   The camera frames on the ANIMAL and not on a fixed distance, because a bear
   and a rabbit shot from the same three metres are one good photograph and one
   empty field — and it leans further OVER the small ones, since the park's
   ground cover stands about a metre tall and a rabbit photographed from a
   rabbit's height is a photograph of grass. And the camera is kept above the
   ground: anything behind him is behind him in three dimensions, so a walker
   climbing a slope had a camera several metres inside it, which is a black
   screen with no way to tell why.

   Nothing finishes itself. Every stop waits for the button — a moment that
   times out is a moment he was not part of — and the note ("bottle filled",
   "backpack in your pack") comes when he presses it rather than when he walks
   up. The notes themselves moved to the top of the screen: they are the park
   telling him something, and the phone is often away when it happens.

   Arriving is the exact point. "Close enough" was a twentieth of a cell, which
   on this map is a hundred and twenty-five metres — he stopped in the next field
   and the game said he was there. It is ten metres now, and the last step puts
   him on the point itself.

   The destination is marked with the same disc marker the rest of the park
   uses, held at a constant size on the screen. It was a hundred and forty
   metres of gold pole — visible over a hill, and unmistakably scaffolding.
   Everywhere he has already walked is drawn in the same gold as the line he is
   drawing now: a hike is one continuous thing, and the old blue made the map
   look like two games played on top of each other.
8. **The specials.** Done — the kayak and the glider are both real, both taken
   out of a pack that knows where they work, the camera fires at the woodland
   stop, and a gear point is a box on the ground he kneels at.

   **A flight is drawn, not chosen from a list.** The glider first offered its
   landing grounds as lines of text on the phone — "lookout, 1.3 km away" —
   which asks a child to match words to a map he is already holding. Taking the
   glider out now lights every landing ground on the paper (and on the park),
   and he drags from where he stands to the one he wants: a straight dotted
   line, because a glider goes over everything in between, which is the whole
   reason to take one.
9. **The rest of the shell**: difficulty, the end-of-game card, high-score table,
   audio.

<details><summary>The original plan, for the record</summary>

1. **`rules.js` with tests.** Route costing, reachability, water and river
   blocking, feature detection, grid squares, the four journal entries, the four
   goals derived from the map, the seven tracks. Tests run in node against
   `maps/map-01.json`.
2. **Play it on the sheet alone.** A play mode in the mapper: roll, drag a route
   with snapping and live cost, the yellow states on pins and features, commit,
   watch the card fill in, restart the turn. No 3D. This is the thing to play
   against the paper game to check the rules agree.
3. **The zoom axis.** Map to first person to drone to macro as one gesture, with
   the hiker walking and the route recording behind him.
4. **The two together.** Draw in the map view, walk it in the world, the ground
   line, the direction arrow, autopilot and fast-forward, the proximity calls and
   the stop-and-interact moments.
5. **Specials in the world.** The glider flight, the kayak run down the river,
   the camera moment, the "find a box" beat.
6. **Weather and time of day**, driven by the space circled on the weather track,
   so the sky is telling you what the roll gave you.
7. **The shell.** Home screen and blurb, player select, difficulty, the
   end-of-game card, high scores, audio, the controls introducing themselves.

</details>

Gates at 2, 4 and 7.

### Calls made
- **Players are an array from day one**, even though the first game is solo. The
  paper game is multiplayer with a shared weather roll, and retrofitting that
  into a single-player state model is a rewrite.
- **The route is the rules object.** Drawn, pointed at or walked, it is one thing
  and it is costed once, in one place.
- **Nothing is auto-routed.** Choosing where to cross the contours is the game.
  Autopilot walks a route you drew; it never picks one.
- **Everything the sheet totals is derived from the map**, so the game travels to
  map 02 without a line of code changing.
