# Dragonseed

*Sixteen days at the plant shop.*

A Strange Horticulture-shaped deduction game. Visitors describe a plant, or
describe a problem; you work out which pot they mean, name it in the book, and
hand it over.

**82 specimens · 17 locations · 16 days · 124 visits · six recurring characters.**
All names, prose and characters are original.

## Running it

Static files, no build step, no dependencies. Open `index.html`.

## Layout of the code

```
index.html          shell: start screen, topbar, 3-column board, mobile tabs
css/style.css       two materials — the shop is dark, and only the things
                    made of paper (the open pages, the map chart) are paper
js/data.js          GENERATED. specimens, habitats, days. Do not hand-edit.
js/art.js           GENERATED. which of the 238 pictures exist and where.
                    Everything that draws asks here first and falls back to
                    the SVG plate, so the game runs with all of the art,
                    some of it, or none
js/plate.js         placeholder art: draws each plant from its own attributes
js/mapart.js        draws Morrowfen from the terrain grid, ink on parchment
js/clues.js         deduction helpers. No DOM, no state.
js/engine.js        state, save/load, drag controller, region registry
js/book.js          the book: an index, then a page per specimen, two open at a time
js/map.js           the map: coordinates, leads, and the daily gathering trip
js/topbar.js        date, served, confusion, the message strip
js/modal.js         the card that stops the room for anything with consequences
js/rite.js          the six runes — the friction that makes guessing cost something
js/shelf.js         left rail
js/desk.js          centre: the desk surface and the lens
js/visitor.js       right rail: the counter, day-end, ending
js/coach.js         the walkthrough card, parked in a bottom corner (it moves
                    to the other one when you go near it), and the easy-plant
                    switch that lives with it. Three walkthroughs — the book on day 1, the map on day 2,
                    the drawer on day 3. Each step flashes its control and gates on it
js/store.js         ArcadeStore — the save and the saved states in IndexedDB,
                    with localStorage's manners. Copied by other arcade games
js/debug.js         saved states — one save per customer, behind the day in
                    the top bar (or Shift+D). Debugging only
js/game.js          boot, mobile tabs, runtime content validator
build/              the content pipeline (Python) — see below
build/evenings.py   the three opening panels and the sixteen evening cards
build/newtext.py    every word anybody speaks, keyed by visitor id. days.py
                    keeps the structure; this keeps the voice
STORY.md            the story as it ships: six people, sixteen days, four choices
STORY-SIMPLE.md     the draft that story was agreed from
DEPENDENCIES.html   GENERATED, and REGENERATED ON EVERY DEPLOY, and it ships
                    IN THIS FOLDER — open it from here, it is never sent
                    separately. Two things at
                    once: the dependency chains and day-by-day audit, AND an
                    editor holding every word in the game — 691 boxes you can
                    type into. Carries the build number and date. Rebuild with
                    `python3 build/deps.py`
build/apply_edits.py  folds an exported dragonseed-edits.json back into the tables
build/endings.py    the last screen: three endings and nine codas
build/papers.py     the fourteen notes in the clues drawer
build/deps.py       emits DEPENDENCIES.html — the unlock chains, day by day
build/artprompts.py emits research/ART_PROMPTS.*.json — one image prompt per
                    plant, person, place, story panel and UI asset
build/artmanifest.py  scans art/ and emits js/art.js. Re-run after adding
                    or removing a picture
art/                the artwork itself: 254 webp files, 22MB. Named exactly
                    as the prompt files say
js/story.js         the full-screen story: the three opening panels day one
                    starts on, and every evening between the days
tests/              fifteen Playwright scripts and how to run them
                    (tests/README.md). Never part of the site
research/           art direction and the source images. Ignored by git, and
                    it must stay that way: the asset zip alone is 170MB
```

## What ships

Everything except `tests/`, `research/` and `build/`. The Python pipeline only
runs on this machine — the game itself is `index.html`, `css/`, `js/` and
`art/`, about 22MB with the pictures, and it works opened straight off the
filesystem.

**Where the art is served from.** `js/art.js` builds every picture URL from one
base, which defaults to `art/` beside the page. To serve the pictures from
somewhere else, set `window.DRAGONSEED_ART_BASE` (with a trailing slash) before
`js/art.js` loads; `index.html` carries the line, commented out. That covers
every plant, face, place, story panel and note sheet. It does **not** cover the
nine `background-image` rules in `css/style.css` that name `../art/` directly —
the desk, the two shelves, the rain at the window, the desk mat, the open
drawer, the map paper and the start backdrop. Grep for `url("../art/` if the
pictures ever move off the site.

## Changing the words

Open **DEPENDENCIES.html** and type. Every line the player can ever read is on
that page in a box: the three opening panels, all 124 visitors' lines and
replies, every fork outcome, the sixteen evenings (scene, letter, quote, the
egg's two answers, both sides of every choice), the day notes, all 82 plants'
descriptions and uses, the fourteen notes in the drawer, the places and their
leads and what the shut ones say, all 69 "used for" phrases, and the endings
with their codas.

An edited box marks itself, keeps the original underneath with a **put it back**
link, and the toolbar counts the changes; **only what I changed** hides
everything else. The edits live in the browser's database (the same one the game
uses), so they survive closing the tab. **Export changes** hands back a JSON of
just what moved, keyed by ids like `v:v_maren1:line` and `evening:5:letter`:

```
python3 build/apply_edits.py ~/Downloads/dragonseed-edits.json    # --dry to rehearse
python3 build/validate.py && python3 build/emit.py && python3 build/deps.py
```

The applier finds each line in the Python source however it has been wrapped or
escaped, puts the new text in its place re-wrapped the same way, and refuses to
leave a batch half-done. If an edit rewrites a line out from under one of the
day 1–4 underlines, `validate.py` says which — it is a note, not a failure.

## Changing the content

`js/data.js` is generated. Edit the Python tables and regenerate:

```
python3 build/validate.py    # proves the content is playable
python3 build/emit.py        # writes js/data.js
python3 build/deps.py        # writes DEPENDENCIES.html
```

All three run before every deploy, content change or not, so the dependency
page and its build stamp never lag the game.

- `build/taxonomy.py` — the observable axes, their phrasing, effects, the
  locations with their map squares and leads, and the terrain grid
- `build/plants.py` — the 82 specimens
- `build/days.py` — the 16 days and their visitors
- `build/validate.py` — the checks (see below)
- `build/emit.py` — renders `js/data.js`

`validate.py` refuses to pass unless:

- every attribute value exists in the taxonomy
- **no two specimens share a full attribute vector** (everything is separable)
- **no attribute value belongs to only one specimen** (nothing is a giveaway)
- every specimen shares its colour with ≥3 others and its form with ≥3 others
- every `describe` visitor's stated attributes resolve to **exactly one** specimen
- every `effect` visitor has something in stock with that effect on that day
- every answer is discovered and in stock on the day it is asked for
- forks have exactly two options and both are available
- every location sits in a real square, no two share one, and the terrain drawn
  there agrees with what it is (the fen is on marsh, the pike is on a peak) —
  so a lead like "west of the sharp peak" is actually followable on the picture
- every hidden location has a lead, and no known one has a spare

`js/game.js` re-runs the important half of these at boot and logs to the console,
so a hand-edit to `data.js` can't quietly ship an unplayable day.

## Replacing the placeholder art

Every plant is currently drawn by `js/plate.js` from its own attributes — the
petal count, colour, leaf shape, stem, berries and mark are all real, so the
drawing always agrees with the book. Seeded per id, so a plant looks the same
every time.

To use real artwork, give a specimen an `img` field. `Plate.art()` returns an
`<img>` instead and nothing else changes:

```js
{ id:"n128", name:"Gloambell", ..., img:"art/gloambell.png" }
```

You can mix — plants without `img` keep the generated plate.

## The story

Sixteen days in a valley that keeps dragons the way other places keep dogs, and
an egg in your cellar that no dragon ever laid. The whole of it — the world, the
cast, the acts, the living map and the endings — is in **STORY.md**. What
follows is only what the code has to do about it.

**Three things arrive on their own days**, each with its own walkthrough in the
same rail panel: the **book** on day one (the six-step scripted first sale), the
**map** on day two, when you find Hester's chart behind the brooms, and the
**clues drawer** on day three, when you go looking for string.

**Day one opens on the prologue** — four narrative panels over the whole board
(`js/story.js`, `state.prologue`), because starting on a customer assumed the
player already knew what a dragon was and what the shop was for.

**The evenings are drawn the same way.** The card between the last customer and
the day's summary used to sit in the rail, competing with the shelf and the book
at the one moment of the day when nothing else is happening. It is the same
shape of thing as the opening — a scene, sometimes one of Alice's letters,
sometimes a choice — so it gets the same full-screen treatment
(`state.evening`, and `state.eveningReply` for what the egg did with what you
gave it, drawn as the second panel of the same card rather than a modal over a
board nobody can see). `Engine.inStory()` is prologue-or-evening: the counter,
the typewriter and all three walkthroughs sit still behind either. There is no
dragging in the evening — the egg is offered a list of the cuttings you can put
a name to, because you cannot hand over a thing you cannot name.

**Every cutting that reaches the shelf raises a card.** Handed over the counter,
dug up on the fell, it makes no difference: `Engine.newCuttings()` puts up the
same overlay — the plate (a row of small ones when several arrive at once), who
it came from, how many, and whether the book already holds a leaf to match it
to. It never says the plant's **name** unless you have already identified it:
being handed a cutting is not being told what it is, and that is still the
book's job. Nothing pops behind the opening panels — the card is skipped while
`inPrologue()`.

**Pots and pages are separate things to own.** `state.pots` is stock and
`state.pages` is knowledge; you need both to serve anybody. A cutting handed
over the counter comes with its leaf, a cutting you dig up does not, and Hester's
loose leaves come back to the book a habitat at a time. The index marks a page
with no cutting behind it **Don't have any** — those read as errands, and the
plant's page names the place it grows. `build/plants.py` carries this as
`start = "both" | "pot" | "page" | ""`; eleven of each at the start, six
ready to hand over on day one.

**The book fetches.** A plant you have identified and hold a cutting of carries
a **Pick it up** button beside the ✓ on its page: it puts the pot on the desk
and shuts the book, so a plant you can name never has to be hunted for along the
shelf again. It is absent when the desk already has something on it (you are
naming that, not fetching this) and when you hold no cutting. While fixing it I
found the search box had been lying: its placeholder says "names" but the
`known` argument was never passed to `Clues.search`, so no name had ever
matched. Now an **identified** plant is findable by typing its name — an
unidentified one still is not, because that would hand over the answer.

**Helping somebody clears the counter.** The words you typed to find their plant
are no use to the next person and actively misleading if they linger, so serving
a visitor wipes `bookQuery`, `bookEffect`, the browse filter, the open spread —
and the pot under the lens, and any map place being asked about
(`Engine.clearBookSearch()`, called at each of the three places `served` goes
up). It happens with the book shut: the book is back at the index and the desk
is empty by the time anyone looks at either.

**Nothing is in `localStorage` any more.** The save and the saved states both
live in IndexedDB, through `js/store.js` (`ArcadeStore`) — a cache in front of
the database that keeps localStorage's manners, so the rest of the engine stays
synchronous. `localStorage` is ONE quota of about 5MB for the whole origin,
shared by every game in the arcade; on this machine a shared blob at 3.5MB and a
soundboard's base64 audio at 1.2MB had filled it, so writes were failing for
everybody. IndexedDB is a different cupboard with hundreds of megabytes in it.
Keys follow the same shape (`calebArcadeData:dragonseed`, `…:snaps`), anything found in the
old home on first run is imported and then removed from it, and the same file is
documented for every future arcade game in `knowledge/arcade-store.md`.

**The game save is defended from two things that were quietly eating it**
(`Engine.save()`):

*A second tab.* An old copy of the shop left open in another tab still writes
its own state — on any action, and again when it is closed — so reloading the
tab you were actually playing landed you wherever the other one was left,
usually the start of that day. Every save now carries the id of the tab that
wrote it and a counter that only goes up; a tab refuses to write over a newer
save from a different tab and says so on the message strip instead.

*No room.* This is what moving to IndexedDB fixed. While both lived on the 5MB
shelf, a full shelf meant the game save could only be written by throwing the
saved states out — which is exactly what kept deleting day one. The saved states
are still capped at 1MB and thinned from the middle when they exceed it, never
from the ends: the first save of every day and the last eighty survive.

**Saved states** (`js/debug.js`) is the debugging tool. **One save per customer,
taken the moment they walk in, and nothing else automatic** — 124 for a full
sixteen days, about 33KB. Saving after every action as well gave four or five
near-identical lines per visitor and made the list harder to read than the game
was to replay. A save is never taken twice for the same arrival however many
times the code that greets them runs, and "Save now" in the panel is the manual
exception. Click the day
in the top bar — it sits at `z-index: 450`, deliberately above the modal scrim,
because the moment you want a save is the moment a card is up — or press
Shift+D, which also works during the evenings and the opening where the top bar
is hidden. Every save from every day is in the one list, oldest first, so day
one is what you see when it opens. Click a save and `Engine.rewind(i)` restores
it **and deletes every save after it**, so the file only ever holds one line of
play. "Save now" adds one by hand. A game already in progress when this arrived
takes one save on load, so the list is never empty.

The panel's third line lists **everything the browser is holding for this
origin, biggest first** — every game in the arcade shares one shelf, and when
the cupboard is full it is usually not this game that filled it. The second line
is the storage readout — how big the game save is, how
big the saved states are, when the last write landed, and this tab's id, turning
red when a write is being refused. The subtitle says how many saves there are,
**which days they span** and the **build number** (`Engine.BUILD`, bumped on every deploy) — between
them those settle the two questions a missing early day always turns out to be:
whether the saves are really gone, and whether the page is running the build you
think it is. If the browser ever refuses to store the whole list, the panel says
so in as many words; the list in memory is never trimmed to make room, because
shedding the oldest third is exactly how day one used to disappear.

**The saves are packed, not stored.** Five keys were ninety per cent of the
weight and all five are the same shape — a fact about each of the 82 plants.
`{"n128":true,…}` is a kilobyte to say what eighty-two BITS say, so a set of
plants (`pots`, `pages`, `identified`) is now a bitmask in base64: 16
characters. `revealed` and `notes` — which axes of which plant you have looked
at or filed — are one byte per plant, 112 characters, and the VALUES are not
stored at all: they are the plant's own, and come back off the specimen when the
save is opened (`packSet`/`packAxes`/`snapExpand`). Row metadata uses
one-letter keys and omits anything that is zero. A full sixteen-day game:

| | bytes |
|---|---|
| whole copies of state, no diffs | 3.0MB |
| diffs, day log included | 1.0MB |
| diffs, day log dropped | 495KB |
| **packed** | **69KB** |
| **packed, one save per customer** | **33KB** |

Three hundred whole copies of `state` came to three megabytes and began losing
the early days to the storage quota — the exact thing the saves exist to
prevent. So every twentieth save is whole and the rest record **only the
top-level keys that changed** since the one before (`diffOf`/`stateAt`), which
brings a full playthrough down by half again (the day log is left out of
snapshots entirely — it changed on every single action and was most of the
weight). Rebuilding walks back to the nearest
whole save and replays forward; shedding under quota pressure rebuilds the new
head whole first, so no diff is ever orphaned.

**A fork says what both answers would do.** Two right answers with different
consequences used to look exactly like one right answer you had not found, and
the only thing that spelled it out was the paid hint. The counter now lists both
in words — "something that gives an hour or two of bright, harmless energy" /
"something that raises weeping blisters on the skin" — with a species tag when
the two options are for different species, and "it is your choice which"
underneath. It never names the plants: finding which pot does that is still the
puzzle.

**An empty desk offers the three things you can open.** Nothing is standing on
the bench, so the bench shows the way in instead: three tiles carrying drawn
objects rather than labels — a clasped book, a chart folded into eights with an
X on it, a drawer with paper sticking out (`ICON` in `js/desk.js`, inline SVG in
the game's own ink and brass). One word under each and nothing else; the map
appears once you have it, the drawer once it exists, with a count of the notes
you have not read. Put a specimen down and they
are gone — the desk is a workbench again, and the drawer's tab goes with them.
The rail keeps small Book / Map / Clues buttons for exactly that case, so
nothing is ever unreachable with a pot on the desk. All three tiles carry the
same coach anchors as the rail buttons, so a walkthrough step flashes both.

**The clues drawer** is a drawer with loose paper in it: every note is the
real sheet drawn at about a third size, lying at its own angle, draggable, and
tapped open to full size about its own centre. A tick in the bottom-left corner
appears once you have read one, and taking it off marks it unread again. It
(`js/desk.js`, `build/papers.py`) takes over the desk
surface. Notes are cards lying in a drawer; tapping one opens it as a fixed,
pointer-draggable sheet with a grip and a cross. A note is **done with** only
once it has been read *and* everything it carries has been taken, which is why
`paperDone` checks `papersRead` first — stamping a note the player has never
opened is worse than not stamping at all.

**The map is drawn for today.** `Engine.terrainToday()` replays
`TERRAIN_CHANGES` up to the current day, and `Engine.exists(h)` hides the three
places that do not come into existence until she makes them. `mapart.js` has
three new grounds — burnt over, lake bed, gorge.

**Species is half of an effect request.** Every plant is `human`, `dragon` or
`both`, and ten effects exist for both species as two different plants. A
visitor carries `who`; `Clues.answers` checks it, the book page prints it, and
the search matches on it. `validate.py` caps at two plants per *effect and
species* rather than per effect, so the pair rule survives the extra axis.

**Shut places are the critical path.** All twelve hidden locations want a plant
before they let you in (`GATES` in `taxonomy.py`), and behind twelve of them is
the only cutting of something a customer asks for later — so the map and the
drawer are not optional. The doors chain: coast→crag, bed→cave→barrow,
cave→gorge, valley→garden. What a door gives you is a **cutting, not a page**,
same as gathering.

**The closure is what keeps it fair.** `validate.py` no longer asks "is it on the
shelf". It simulates a player who does everything available — takes what people
hand over, reads every note, walks every lead, opens every door whose key is on
the shelf, and loops until nothing more opens — and proves every request has an
answer by the day it is asked, every door has two ways in, and no door opens
before you are told where it is. `lazytest.mjs` proves the other half: a
counter-only player gets stuck on day 6.

## The systems

**No quantities.** A visitor is buying a dose made *from* the plant, not the
plant, so a pot never empties and there is no `×3` to track. What is scarce is
knowledge: which specimens you have found, and which of them you have matched to
a page. An identified pot is marked plainly on the rail — a lit ground, a brass
edge, and its name written where "unnamed" used to be.

The pot currently on the desk keeps its full brightness and gets a small "on the
desk" label. Dimming it made the one you were working on the hardest thing on
the rail to find.

**One specimen at a time.** Selecting a plant — clicking it on the rail, or
dragging it over — puts it on the desk, and that is what you are working on.
The desk holds exactly one, drawn large enough to actually study. Drag another
over and it swaps. Drag it back to the shelf rail to put it away (or use the
link in the lens, or press Escape).

Opening the book or the map covers the desk surface, so the lens carries the
selected specimen's plate at the top of its panel — under the **Unnamed
specimen** heading, beside the open pages. Without it the thing you were trying
to identify vanished off screen at exactly the moment you needed to compare it
to a page. When the surface is showing there is no second copy: the big card is
right there.

**Book and Map live in the right-hand rail**, under the visitor, rather than in
a header over the desk. The desk is then all workspace.

**Discovery.** A specimen you have never found has no pot and no page. 57 of the
82 arrive through the story. The other 25 only exist if you go looking, which
means the map.

**The map.** A drawn 10x8 map of Morrowfen with lettered columns and numbered
rows. Being told about a place does not pin it — it gives you a **lead**, a
sentence describing where it is ("High on the northern tops, west of the sharp
peak"). You read the map, work out the square, and click it. Right, and the
place is yours for good; wrong, and you have spent nothing but a guess. A pinned
place turns up one specimen you have not seen before. **You can go out as often
in a day as you like**, and the cost is not the clock but the walk: come back
from somewhere you have already stripped bare and that is a pip of confusion
(`state.tripsToday` counts the trips; the walk itself is never refused except
after the day has ended). Five places are known at the start; the other nine are
leads.

The terrain drawing and the location list are checked against each other at
build time, so the leads always describe the picture the player is looking at.

**A fork's reply.** `Clues.forkOutcome()` hands back the fork OPTION, whose
words are in `reply` like every other visitor's. `give()` read `out.text`, which
does not exist, so all six forks — days 2, 7, 10, 12, 14 and the ending on 16 —
handed over a card with nothing written on it. Fixed; the card is titled
"<name> takes it" rather than a thank-you, because one of the two ways through a
fork is usually not a kindness.

**The hint, in two goes.** Press Hint once and the request is restated in the
game's own words. Press it again on the same customer and you are told the
answer outright: the plant's name, its picture, and — if it is not on your shelf
— which place it grows at and its map square, or that the place is shut, or that
you have not found it yet. A third press repeats that for free. `state.hints`
counts presses per `day:index:visitorId`, so the next customer starts over. The
first two cost a pip of confusion each. Where several plants would answer,
`reachable()` picks the one the player can actually lay hands on: something on
the shelf beats something at a place you can walk to, which beats something
behind a shut door. An eight-year-old who is stuck is not helped by a second,
subtler clue — he is helped by being shown the flower.

**Arrivals.** Whatever a customer hands over gets one card, on their way out:
the cuttings drawn as colour plates, and the loose leaves drawn as the book's
own line plates on paper, labelled "leaves for the book". Pages used to land in
silence, which hid half of what the game gives you — 57 of them arrive as pages
alone, across 16 gifts on days 2 to 14, mostly from Nan and Tom. The card never
says which leaf is which plant: matching them is the game. `newCuttings(ids,
from, lead, place, pageIds)` builds it and `modal.js` draws `m.pageIds`.

**Naming.** Claim any page at any time — observing first is advice, not a gate.
Being wrong is what costs: the page is struck out for the rest of the day and it
takes a pip of confusion straight away.

**The book prints every plant's name from the start.** That is not a spoiler:
the puzzle was never "guess what this is called", it is "work out which of these
named entries is the pot in front of you". The index is alphabetical by name,
and an entry you have matched to a pot carries a green ✓; on its page it carries
an "identified" badge. That is how the source game works too — the book is a
printed reference, not a diary.

**The book is a book on the desk, not a sheet laid over it.** Only the open
spread is paper — the search, the Used for picker, the notes bar and the footer
take the dark of the shop around them. The spread has a gutter that darkens
toward the spine, the block of leaves showing under the bottom edge, and a
shadow onto the desk. The map works the same way: dark chrome, and only the
chart itself on paper.

**The lens never scrolls.** The specimen's plate is the one elastic thing in
that panel — it shrinks to whatever height is left after the observations and
the buttons, so the content always fits. `overflow-y: auto` is a floor, not the
plan; it only bites once the plate has hit its minimum.

**The book.** A real book. An index at the front — named entries alphabetically,
then unnamed ones in the order your aunt pressed them, each with her drawing and
her note, dotted leaders and a page number. Behind the index, one page per
specimen, two open at a time across a spine. Click an index row to turn to that
page; Back and Turn move a spread at a time; and a sideways swipe across the
open book turns it too — left pulls the page forward, right pulls it back.

A turn snapshots the leaf you are leaving and swings it on the spine over the
spread that has already rendered underneath, with a shadow sweeping across it as
it goes. It is decoration only: interrupt it whenever you like and the book is
still on the right page. `prefers-reduced-motion` skips it.

A swipe swallows the click that would follow it, so a swipe starting on an index
row turns the page rather than jumping to that row. A plain click never moves,
so it is never swallowed and the row still works. On a phone the two open pages stack
and scroll, because a spread does not fit.

**Every page shows what the plant is for, from day one.** Your aunt drew the
plate, described it, and wrote down the use — she never got round to the name.
An unnamed page is the drawing, the description and the use over a blank ruled
label; naming one fills in the name and the binomial.

That is the better loop, and it is the one the source game runs on. A visitor
asks for something that breaks a fever, you look "breaks a fever" up under
**Used for**, and the book shows you a deep red cup of six petals — now go and
work out which pot on the shelf that is. Withholding the use until you had
already named the plant made effect requests a guess with nowhere to start.

The lens still says nothing about the use of an unnamed specimen on your desk.
The book knows what each *drawing* is for; the pot in front of you is still an
unknown, and joining the two up is the whole job.

**The notes bar.** You file up to three of your own observations against the
index and the book re-paginates around them. Three is deliberate: it narrows the
book to a handful of pages to flip through and never finishes the job. The book
never dims itself down to one answer.

**Nothing inside a leaf scrolls.** The index measures a rendered row against the
leaf and flows exactly as many as fit, spilling the rest onto the next page — so
the page count follows the window and you turn pages a lot, which is what a book
is for. A plant page shrinks its plate to whatever height is left, the same trick
the lens uses, and short windows tighten the type rather than growing a
scrollbar. (The words leaf keeps `overflow-y: auto` as a floor: losing the claim
button off the bottom of a very short window would be worse than a scrollbar on
that one leaf.)

**Two layouts.** Browsing gives one plant per page, two to a spread. With a
specimen on the desk the page area is half as wide, so it becomes one plant per
SPREAD: the plate and the name on the left leaf, the description, the use and
the claim button on the right.

Notes belong to the **specimen**, not to the book — `state.notes[specimenId]`.
They follow that plant around, survive closing and reopening the book, and are
thrown away when you name it. Opening the book to read, with nothing on the
desk, is always the whole book.

**One plant, one use.** The effects table went from 36 keys to 73, and it cost
almost nothing, because the specific use was already written on every plant.
`heal` used to cover seven plants that did completely different things —
Butterdale closes a wound, Weeping Belle soothes a sting, Common Trouse is for
tired eyes — so the note was promoted to the key. Nine deliberate pairs remain
where the pair is the point: the two heart tinctures, the two poison-testers,
the two things that put a person to sleep. Nothing has three, and the validator
enforces it. An effect request is now a real question.

**Searching by use.** The free-text search covers the drawing's description and
what the plant is for on every page, so "fever" finds the thing that breaks one
from day one. Names and binomials only match on pages you have filled in —
otherwise typing a name you had merely guessed would confirm it for you.

There is also a **Used for** dropdown, currently switched off: the search does
the same job because every page's use is part of its searchable text. Flip
`USE_PICKER` in `book.js` to bring it back.

The book has no title bar. The search row is the header, with the close button
parked at its end; Index sits in the footer beside Back and Turn, where the
other page-turning controls are.

The field takes the whole header row, short of the close button, in both the
wide and the narrow layout — searching is the main verb of the book and it
should look like the place you start. Focus lights it hard: brass border, a
brass ring around it and the placeholder brightening with it.

A search with something in it grows a **clear search** link inside the right end
of the field, worded and styled like **clear notes** under the notes bar,
because they do the same kind of thing. The browser's own tiny `×` is hidden —
at that size, against the paper, nobody found it. The room for the link is only
reserved when the link is there, so an empty search uses the full width.

**The first four days underline the words that matter** — "hasn't slept",
"burning up", "Blue, little heads all bunched together". A seven-year-old
reading four lines of speech does not yet know which half of it is the puzzle,
so for four days the game points at it and then stops. A describe-visitor's
marks are generated from the same table that writes the sentence, so they match
to the letter; everything else is picked by hand in `HI` in `build/days.py`, and
the build asserts every phrase really occurs in its line. The marks survive the
typewriter: the ranges are worked out once against the whole line and clipped to
however much has been typed (`js/visitor.js`).

**The counter.** Each arrival plays once: the card slides in, and the request
types itself out a character at a time before the drop zone fades in under it.
(The **Hint** button lives in the top bar, immediately right of the confusion meter
that pays for it — `Engine.canHint()` decides whether it is there at all, so it
is absent for gifts, leads, chats, a finished day and any story panel.) Waiting for the sentence to finish is the point — it stops you
reaching for a pot before you have read what was asked for. Clicking the card
skips to the end. The animation is keyed to the visitor, so any of the dozens of
re-renders that happen while they stand there leaves the card alone.

There is no "day so far" panel. It was a list of things you had just been told
about in a modal, taking up the space the counter wanted. The log behind it is
still kept — the ending screen uses it to recap the choices you made.

**Learning the game.** Six steps, held in `Coach.STEPS` and shown two ways. The
**?** in the header opens them as a **How to play** card, at any time — those
are the general, any-day words. And on the very first customer of the very
first day the same six become a scripted sale, in a panel in the right-hand
rail, in the slot the old day-log held — under the counter, above Book and Map
— with no way to dismiss it.

That slot was chosen because nothing sits behind it. Pinning each step beside
the thing it described sounded right and read badly: the bar kept landing on
top of the very control the step was telling you to press. In the rail it can
be as loud as it likes, so it is — brass, lit, and slowly pulsing.

It shows **two steps at once**: the one you are on in full, and the next one
under it in half-light. One step alone left first-timers reading a single
sentence with no idea what it was leading to.

**The shop flashes the exact control.** A step names its anchors — `line`,
`tools`, `search`, `pot:<id>`, `index:<id>`, `obs:<axis>`, `chip:<axis>`,
`claim`, `give`, `toIndex` — and whichever region owns that element asks
`Coach.has()` and puts `is-coached` on it. That is one flashing ring, and on a
button or a chip a brightness pulse with it. The customer's line gets a warm
wash behind the words instead, because a ring round a paragraph reads as an
error. On a phone only one column is on screen at a time, so the tab holding
the anchor lights up too.

**And it will not move on until you have done it.** The gates are real:

| step | flashes | moves on when |
|---|---|---|
| 1 | the customer's own words | five seconds have passed — long enough to read |
| 2 | the Book button, then the search field | the search actually contains what they need ("sleep") |
| 3 | that pot on the shelf, and that row in the index | both, and only for the right plant of the four the search found |
| 4 | the lens buttons for colour, form and petals, then those three chips | all three are filed against the index |
| 5 | **This is it!** | the plant is named |
| 6 | the drop zone | the customer is served |

Step two is the one that teaches the whole game — that the book is searched by
what a plant is *for* — so typing anything else does not count. Step three is
the matching lesson, and needs the pot **and** the page, which is why the
engine keeps `state.bookPick`: the entry you last turned to from the index.
Applying a filter throws the book back to the index and clears it, so step five
walks you to the page again before it points at the claim button. Wherever the
book has wandered, something is always flashing — the Index button if nothing
else — and the words change to match what is lit.

Only step one is on a clock. Everything else waits.

The walkthrough is derived, not stored: `Coach.step()` reads the actual game
state and ratchets forward, so it cannot get out of sync with what the player
has really done, and it never goes backwards if they undo something. Finishing
the first sale ends it for good. Every pulse is dropped under
`prefers-reduced-motion`.

**Announcements.** The strip along the top of the shop is easy to miss, and the
moments worth not missing are the ones with consequences: a visitor served or
turned away, a plant named or mis-named, a place found, a hint paid for. Those
raise a card over the room as well as the strip. Small corrections ("you have
nothing at C4 but heather and sheep") stay on the strip alone.

A modal carrying `then` is a beat in the day — dismissing it is what moves the
day on, so a served visitor waits for you instead of being swept away by a
timer. There are no timers left in the visitor flow at all.

**Picking a pot up vs scrolling the shelves.** A sideways pull picks the pot up;
up and down scrolls the rail it is sitting in (`makeDraggable(..., {lockAxis:
"x"})`). Before that, grabbing a pot to scroll just dangled the pot.
`touch-action: pan-y` hands the vertical case to the browser on touch; the mouse
case is done by hand, because a mousedown never scrolls anything on its own. A
scroll gesture swallows the click that would otherwise follow it.

**Confusion, and the spell of calm.** Three pips and your head has gone woolly:
you are handed six carved runes out of order and you put them back — fewest
marks on the left, most on the right — and the pips clear and the day carries on
exactly where it was. Each rune that lands in its place ticks; six ticks and it
closes. There is no dismissing it.

The meter is `state.confusion`, capped at `Engine.MUDDLE_CAP`, and it is fed by
`Engine.addMuddle()`. Note that "dread" survives as a plant EFFECT — two plants
fill the drinker with one and a shut place asks for it as a key — and that is
unrelated to the meter.

That is all it is: a small tedious thing whose only job is to make spamming
guesses and hints cost something you notice. No story weight, no standing to
nurse, nothing else in the game reads it. The day never ends early and there is
no losing.

A rite laid out while another card is up waits its turn — being told *why* you
just earned that pip comes first (see `closeModal`).

The rite repaints only its own row of runes as you drag. `Engine.riteSwap`
returns whether that swap finished it and deliberately does not re-render:
rebuilding the whole modal mid-drag recreated the element, which replayed its
entrance animation and read exactly like the dialog slamming shut and reopening
under your finger. The entrance animations are on an `is-new` class that is only
applied when the modal itself is new, so any other re-render is silent too.

## Saving

One key, `calebArcadeData:dragonseed`, holding the whole session — day,
discoveries, leads, partial reveals, per-specimen notes, the specimen on the
desk, the walkthrough step, fork flags, and the running log the ending screen
recaps. Bumping
`SAVE_VER` in `engine.js` starts players clean
(it is at 3).
