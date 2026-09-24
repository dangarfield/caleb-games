# Fleet Forge

A ship-fitting auto-battler. You bolt a warship together cell by cell — guns,
reactors, armour, shields, engines — press Battle, and then you don't touch
anything: the ship fights on its own and either your design was good enough or
it wasn't. Winning is a thing you do in the hangar, not with your thumbs. Nine
AI opponents make a ladder, each with a hand-built fit and its own way of
fighting, and you get a full briefing on what one is carrying before you commit.

It fills the arcade's builder gap — there was plenty of twitch and a fair
amount of puzzle, but nothing where the decisions are all made up front.

Target audience is the Garfield boys, tablet-touch first, landscape, 1333x690.

## Where it came from

Fleet Forge started life outside the arcade as a SolidJS + Phaser 3 + Vite
clone of the mobile game *Space Arena*, nine commits between May and December
2025. In September 2026 it was audited and rebuilt.

The audit's decisive finding: **it had only ever worked under `vite dev`.**
`vite.config.js` set `root: 'src'` and `publicDir: '../public'`, and eleven of
its twenty-four runtime `fetch()` calls pointed at files that were neither
imported (so Rollup never bundled them) nor in `publicDir` (so Vite never copied
them). A production build gave you a hangar that could not load a ship. On top
of that the arcade forbids the framework and the build step, and the battle sim
carried about a dozen genuine defects. There was no incremental migration
available, so the old tree became a design reference and a data source and
everything else was rebuilt.

The old tree is parked at `.archive/fleet-forge-legacy/` (gitignored) with its
original git history intact — 14 MB of source, docs and data kept as a design
reference. Its 548 MB `node_modules` and the Netlify CLI cache were deleted on
2026-09-22.

## What was kept

- **The data.** Reverse-engineered *Space Arena* stats, plus five `DATA_*.md`
  tables. Since re-extracted from the APK: the roster is now 56 hulls
  (`data/ships.json`) and 100 modules (`data/modules.json`), each copied from
  `research/` rather than baked.
- **The formulas.** Armour / reflect / penetration, reactor chain explosions,
  shield absorb and overflow, point-defence interception, repair-bay rules.
  `BATTLE.md` (in the archive) documents the intent; the code diverges from it
  in a handful of places and each one is commented where it happens.
- **Two interaction designs**: the three-level module drill-down, and the
  five-slot hangar. The code behind both was replaced.

Everything else — router, context, storage, theme, six stub pages, the build,
the Netlify deploy — went.

## Features

### Goals
One goal is live at a time — the ladder is linear, so the operation for your
level is the only one open. It sits in the hangar's top bar as a **GOAL** chip
with its own progress bar, and tapping it drops a panel holding the goal, the
next unlocks with the level each arrives at, and a dashed row each for what is
still sealed.

### The fleet — tiers, not hangars
Home is your fleet by tier: five tiers down the left (decades of the data's own
`lr` scale), the hulls of that tier as cards, and the ship you pick carries its
own three layouts. The ship is the unit — once you have a hull you have it.
Live stats and a one-line verdict on whether the active layout can fly.

The five hangar slots are gone. They fought the game: the same hull in two slots
was two unrelated things, a slot was the thing you owned rather than a ship, and
there was nowhere to express that a hull is something you earn.

### Fitting
Tapping a module — in the bay or on the hull — opens the **MODULE STATS** card
in the well's top-left corner: the six numbers that matter for that subtype,
off `modstats.js`, which is also what writes the two-stats-plus-power line on
every bay row. The card slides to the bottom-left while a drag or a hover is
happening under it, and back when the corner is clear. The bay is ordered by
footprint, then name, then version, which puts a module and its Black Market
rework side by side — those carry a `v2`/`v3` tag in the accent colour on the
row, on the card and on the art itself.

All three browser levels are visible at once, stacked bottom-up: group row
(Weapons / Defence / Utility) at the bottom, family row (Ballistic / Missile /
Laser…) above it, module list filling the space above that. No drill-down, no
back chevron.

**Drag and drop.** A module already on the hull can be picked up and dropped
somewhere else; drop it anywhere invalid and it goes back where it was; drop it
on the **X strip that appears on the far left during a drag** and it comes off.
Modules in the browser drag straight onto the hull. Tap-select-then-tap-place
still works too, because a tap is faster for laying six of the same plate.
Live green/red validity under the finger throughout, with the reason when red.

**Pinch to zoom** the hull, drag to pan when zoomed in, mouse wheel on a desktop.

**Three layouts per ship**, switchable in place, cloneable into each other, with
one marked as the ship's active fit — that is the one Battle takes.

### The ladder
Nine opponents, easiest first, one rung unlocked at a time and everything
already beaten left open to replay. Before each fight: the opponent's hull, its
armament and defences itemised, and a plain-English description of how it will
fight — **derived entirely from what is bolted to it**, because that is the only
thing that differs. The ladder order is not guesswork; it is whatever
`tools/balance.js --rr` measures.

### Progression — operations and levels
**Operations** are challenges; completing any one that is currently available
gives you a level, and a level hands over a hull and a couple of modules. Two
new operations appear per level and old ones stay, so there are always three or
four to choose from. **30 levels, 54 operations, 40 hulls, 59 modules.**

Four operations are **tier gates** — the only way into the next tier. Each asks
you to beat an opponent **from the tier above** while flying a hull **from the
tier you are finishing**, which is what stops a battleship grinding the early
game. Ordinary wins cannot pass one; the headless test proves it by throwing 40
of them at a gate and checking the level does not move.

**No operation names an opponent.** Fights come from a generated pool for the
player's tier, so a condition may ask about an opponent's *tier* and never its
identity. Hulls are different — those are fixed data the player earns, so an
operation can name one ("win twice flying the Hammerhead").

The tree lives in `data/progression.json`, generated by
`tools/make-progression.js` from `tools/operations.json`. That same run writes
`docs/game-fleet-forge-progression.md`, so the document and the game cannot
drift. **Do not hand-edit the json.** `tools/progression-test.js` drives the
whole thing headlessly (20 assertions).

The two gates that everything funnels through are `Progress.shipUnlocked` and
`Progress.moduleUnlocked`. The fitting browser is filtered in `Data.family`, so
no screen needs to know progression exists.

### Difficulty is the fit, and only the fit
There are no behaviour blocks, no per-opponent tuning and no hidden stats. Every
ship in the game — yours and theirs — runs the identical routine in
`js/sim/ai.js`, whose constants are in one `DOCTRINE` block that belongs to the
game rather than to any ship. What varies between two opponents varies because
the hull and the modules vary:

| what differs | what it comes from |
|---|---|
| how far out it fights | the mean range of the weapons it carries |
| how hard it accelerates | thrust power over mass |
| how fast it turns | turn power over mass |
| what it can hit | each weapon's own range and firing cone |
| whether it can burn or warp | whether those modules are fitted |

Nothing is configured. There is no accuracy handicap anywhere: a shot misses
because the target moved or the cone was wrong, never because the shooter was
told to be worse.

### The battle
Fixed-timestep simulation with pooled projectiles, completely separate from the
renderer. Brownouts visible when a reactor dies, pause and 1x/2x/4x. Death
returns to the hangar — never an instant restart.

Three views of a ship, switched in the HUD and remembered between matches:
**HULL** is the art alone, **MODULES** shows what is fitted, and **DAMAGE** —
the default — shows the cells as a continuous health ramp, green through
yellow and orange to red, black for a cell with no structure, with the overlays
(unpowered, being patched) and the white hit flash still on top.

The camera frames the midpoint of the pair and zooms so **both ships are always
whole on screen**, tightening as they close. It frames the hull, so a shield
bubble may run off the edge; see ARCHITECTURE.md for why that is the only
zoom left to take.

### Where opponents come from
Nowhere on disk. A contact is generated the moment you press ENTER ARENA or
TEST, out of `data/ships.json` for the hull and `data/progression.json` for
what is allowed on it, and `autofit.js` packs it. The pool is the hulls of your
hull's own tier, up to and including the next unlock in that tier — tier 1
takes no next rung. Difficulty is purely the fit, so the AUTOFIT menu's options
are rolled per contact, including the placement mode the menu never shows.

## Files

```
games/fleet-forge/
  index.html            the game
  ARCHITECTURE.md       the contract every file here obeys — read first
  data/ships.json       56 hulls, copied from research/
  data/modules.json     100 modules + the field legend, copied from research/
  data/bonus-keys.json  the hull-bonus keys the source game defines
  data/progression.json the unlock tree — GENERATED, do not hand-edit
  data/effects.json     which sprite each weapon and blast uses
  images/               module, ship and effect art (webp, named by key)
  js/
    arcade-store.js     verbatim copy of dragonseed's store
    theme.js            palette + canvas helpers
    progress.js         levels, operations, and the unlock gates
    effects.js          sprite sheets and the effect-art config
    core.js             1333x690 virtual stage, pointer, screen stack, widgets
    data.js             loads the three data files once
    geom.js             the grid, and the ONE placement validator
    shipview.js         drawing a hull with its fit
    modstats.js         the one stat table — the bay row and the stats card
    save.js             the player's save, over arcade-store
    opponents.js        the pool rule, and generating a contact
    screens/            fleet, fitting, ladder, battle
    sim/                modules, ai, sim, selftest (node)
  tools/
    copy-ships.js       research/ -> data/ships.json (+ --images)
    copy-modules.js     research/ -> data/modules.json (+ --images)
    load.js             one headless `Data` for every tool below
    autofit-test.js     every hull x every recipe must come out flyable
    balance.js          generates a pool and fights it; --rr ranks it
    operations.json     the 54 operations, hand-authored
    make-progression.js the 100-level ladder -> progression.json + the doc
    make-operations.js  one operation per level, read off that ladder
    progression-test.js drives the unlock tree headlessly
    field-audit.js      catches any code still reading a retired field name
    skill-curve.js      measures what the hidden skill dial is worth
    boot-check.js       runs js/data.js the way the browser does
```

## Conventions this game leans on

- Back button `href="../../index.html"`, exactly.
- **Nothing in the top-left 160x54 box** — that is the arcade's own button.
- Saves in IndexedDB via `arcade-store.js`, key `calebArcadeData:fleet-forge`,
  carrying `sid`/`gen` so a stale tab cannot overwrite.
- The card in the root `index.html` needs the **trailing slash**
  (`games/fleet-forge/`) because the game loads `js/` files.

## Memory

### 2026-09-24 — a rework trails the thing it reworks
Nine Black Market v2s were in the starting kit: a level-1 pilot had a Railgun v2
twenty levels before the Railgun and a Bunker Shield twenty-six before its base.
Cause: the ladder uses the source's `requiredLevel` purely as a sort key, and
those nine carry `requiredLevel: 0` — not "level zero" but "no shop level, this
is black-market stock" — so they sorted to the very front. There WAS a check for
a variant arriving before its base, but it keyed on `visible` (0/1/2) rather
than `modification`, and it waved `visible: 2` through as "the data's choice".

Variants are now pulled out of the spread entirely: the spread runs on
everything else, which keeps the drip flat and every level occupied, and each
rework is then placed at its base's level + 5 (BM.1) or + 10 (BM.2), capped at
99 so the top level stays the prize hull alone. Keyed on `modification` and a
shared `displayName`, so a v4 added to the data tomorrow slots in behind its
base with no code change. The check is now fatal for every rework and asserts
the exact gap, not merely "not before". Level 1 went from 14 modules to five —
Chaingun, Vulcan Cannon, Small Steel Armor, Small Ion Drive, Small Reactor.

Two things fell out of it. The generator deadlocks on any ladder move —
operations are written against the ladder and the ladder is validated against
the operations — so `--bootstrap` downgrades that one check to a warning for
the first of the three passes; the last pass still has to come out clean. And
the ladder walk in `progression-test.js` flew only the roomiest owned hull, so
when the Grand Ion Drive landed on a level whose best hull has no 2x3 block of
engine cells it reported a dead end that was not there — six owned hulls could
seat it. It now flies the roomiest hull that can actually take the part, which
is what a player does, and still fails when nothing owned can.

### 2026-09-24 — mute is the music's switch, not everything's
It silenced the generated-cue bus as well, so turning the theme off also killed
every tap, launch and explosion — feedback for what the player just did, which
nobody asks to lose when they turn music down in a waiting room. `setMuted` no
longer touches the cue bus and `play()` no longer early-returns on the flag;
`muted` now means the music only. Checked headlessly: with mute on the theme
element sits at volume 0 and a cue still builds its oscillators.

### 2026-09-24 — a ship does not die in one bang
A death was one explosion sheet, one smoke, two spark bursts, all on the hull's
centre — on a 44-cell capital that reads as a firework going off somewhere
behind the ship. It is a chain now: twelve module-sized blasts walking across
the wreck over about a second, each on a real module of the hull that just
died, then the big one at the centre. Queued in a fixed array with a countdown
each and ticked in the update loop — no `setTimeout` per blast, per the house
rules — and the positions are frozen when the chain is scheduled, so the fire
stays where the ship broke rather than following the drifting wreck.
`END_DELAY` went 1.0 -> 1.9 so the chain finishes before the result screen.

The blasts vary by spark count and whether smoke plays, NEVER by sheet scale:
scaling an explosion sheet at event time is the old bug that had a module blast
swamping the ship it happened on, and that rule holds here too.

### 2026-09-24 — a button that says no now offers the fix
NOT FLIGHT READY was the whole width of the hull card and did nothing: it named
the problem and left the answer — a default autofit — two screens away in the
fitting bay. It is split now, AUTOFIT narrow on the left in the accent and the
verdict expanding into the rest. The button fits the slot the card is showing
(`Save.activeLayoutIndex`) with ONE recipe — ballistic, mostly armour, weapons
first — because it has no menu: it is not a shortcut to the bay's defaults, it
is the plain sturdy fit a grounded hull wants. `Progress.moduleUnlocked` filters
it, so it cannot reach past the unlock tree. Nothing is announced —
the hangar never speaks — because the row under your finger becomes ENTER ARENA.

### 2026-09-24 — the hangar's 324px column became a chip
OPERATIONS and UNLOCKS had a permanent quarter of the hangar behind a two-tab
toggle. The ladder is linear — one operation per level, so only ever ONE row is
live — and the two tabs were two readings of the same ladder, which meant
flipping between them to answer one question: what am I doing, and what does it
get me. The handoff's answer is a GOAL chip in the top bar carrying the live
objective and its bar, and one drop-down under it holding the goal, the
unlocks, and a dashed row each for what is still sealed. The fleet gets the
whole width. `OP`/`OPS` is `GOAL` everywhere it is shown, and the pilot pill
dropped `34 OPS COMPLETE` — that count belongs with the goals and is at the
head of the panel.

Two things worth keeping: the panel paints last but hit-testing is paint order,
so `panelHits()` runs BEFORE anything draws and claims the pointer for the
scrim — otherwise a tap meant to dismiss the panel lands on the hull card
behind it. And the scrim starts below the 58px bar, exactly as the design has
it, so the chip can still shut what it opened.

### 2026-09-24 — DAMAGE never persisted, because the setter was never widened
`Save.setHullView` opened with `if (v !== 'hull' && v !== 'modules') return
false`. It was written when there were two views and DAMAGE was added without
touching it, so every `setHullView('battle','damage')` returned false and saved
nothing — the arena reopened on whatever had been written before the view
existed. The allowed values per place were already declared one screen above in
`HULL_MODES`; the guard now asks that table. A default (`battle: 'damage'`) that
is right in the data is no use if the writer refuses the value.

### 2026-09-24 — a reactor is not the only thing that makes power
Both the fitting validator and the sim's win condition counted reactors. Five
modules in the data generate power without being one — the Solar Armor family
and Small Laser v2, which is a gun that feeds the ship — so a legal solar hull
was rejected in the bay, and in the arena it was declared out of the fight the
moment its last reactor died, or from frame one if it never had one. Both now
ask for a power source (`powerGeneration > 0`). `isReactor` was deliberately
NOT widened: it also decides what detonates on death, and a solar plate does not
take the hull with it. Two meanings had been sharing one predicate.

### 2026-09-24 — the camera was framing the shield, not the ship
`updateCamera` framed `ship.brad` — hull radius plus the widest shield bubble.
On a Hammerhead that is 8.8 cells of ship inside a 22.4-cell framing circle, so
a third of the zoom was being spent on empty air around a translucent ring.
Framing `ship.rad` instead put the arena between 30% and 60% closer on every
hull with nothing cropped. Going closer than that is not available: measured
mid-fight the hulls are nearly touching, and dropping `SimAI.ENGAGE_FRAC` from
0.75 to 0.30 barely moved separation. `CAM_FILL` exists as the dial that buys
more by cropping, and is set to 1.

### 2026-09-24 — `icon()` saved the canvas and never restored it
`ctx.save()` with no matching restore, so everything drawn after the pause glyph
was in that icon's 24-unit space — the speed labels, quit and mute went
off-screen and the toggle landed on the rail. `soundIcon()` had grown a second
`ctx.restore()` to compensate, which hid it. Found by instrumenting `fillRR` and
comparing the logged coordinates against the rendered pixels; no amount of
reading the HUD code found it, because the HUD code was correct.

### 2026-09-24 — thresholds the game never reaches
Module art in the arena was gated at `cs >= 10` pixels per cell. Measured, the
camera ran 6.4-8.0 for whole matches, so MODULES mode had been drawing coloured
plates and no pictures for its entire life. Two more of the same shape: `pad`
and `rad` STEPPED at `cs > 14`, which is why the grid appeared to resize
mid-fight, and cell value `5` was drawn as engine-only when it is both device
and engine — 245 cells across 46 of the 56 hulls. Measure the range a constant
actually sees before choosing it.

### 2026-09-24 — `var` after `return` in an immediate-mode screen
`STATS`, the stats card's geometry, was declared below the fitting screen's
`return {}`. The `var` hoists but the assignment never runs, so it was
`undefined` at the first draw — an error nowhere near the cause. Layout
constants go above the return, with the rest of the layout.

### 2026-09-22 — rebuilt from the legacy Vite project
Audited the old tree, found it had never worked outside `vite dev`, and rebuilt
on the arcade's conventions. Kept the data and the formulas; replaced everything
else. Details above.

### 2026-09-22 — the afterburner bug, finally
Logged in the old `TODO.md` as "afterburners don't fit into the correct engine
slots", and guessed at there as a category-flag problem. It wasn't: the data was
always right (`AfterBurner1x2` is `c:64`). The cause was
`FittingSceneCanvas.jsx:179` — the overlap check read `m.w || 1` from placements
that only ever stored `{moduleId, col, row}`, so **every module already on the
hull was treated as 1x1** and only its top-left cell was protected. Engine bands
were already occupied by ion drives whose lower cells were invisible to the
check. A second, correct overlap check sat thirty lines below it and the two
disagreed. Fixed structurally: `Geom.canPlace` is now the only validator in the
codebase and it looks dimensions up in the module data every time. A placement
still carries only `{moduleId, col, row}` — storing `w`/`h` on it is what caused
this, so don't.

### 2026-09-22 — bugs fixed in the sim port
Carried across from the audit and each covered by `js/sim/selftest.js` (46
assertions): ballistics that missed were never retired (`travelDistance >
this.range` where `this.range` was never set, so every miss leaked a live
object); the win condition counted `instanceof WeaponModule` so a mine-armed
ship died on its first hit, checked engines where the spec says reactors, and
was never called from mine or reactor-chain kills; ships integrated position
without `dt`; a ship stopped dead in space when its last engine died instead of
coasting; modules were updated twice a frame so afterburners ticked at 2x and
repair bays healed at 2x with the three-bay cap bypassed; power triage shut down
engines and weapons *first*; a per-tick damage floor gave any laser a guaranteed
60 damage a second regardless of its stats; a debug `missileDamageFactor` of 0.1
sat in the live damage path; modules could be destroyed twice; junk launchers
did nothing because the collision function was never called.

`ArmorGeneratorModule` was flagged in the audit as a live crash. It isn't — the
bake proved there is no armour-generator module in the data at all (`c:256`
holds only `RepairBay3x2`), so it could never be constructed. Dead code, not a
crash. Not ported.

### 2026-09-22 — the ladder is measured, not guessed
`tools/balance.js --rr` runs every opponent against every other. The first
hand-ordered roster had the laser boat at difficulty 3 beating hulls three tiers
above it. Re-ordered to the measured ranking, which came out perfectly
transitive. Re-run it after touching any recipe or AI block.

### 2026-09-22 — weapon tint
Every gun in the data carries `subtype: 'weapon'`, for which `T.cat` has no
entry, so all 51 of them drew in the grey fallback. `T.tintForModule(mod)` hops
to `damageType` for weapons; use it rather than `T.tintFor(m.subtype)`.

### 2026-09-22 — difficulty is the fit, nothing else
The first build gave every opponent an `ai` block: engagement range, thrust,
strafe, target priority, warp aggression, and an `aimError` that made an
opponent miss on purpose. Dan's correction: *"difficulty is PURELY about the
ship fit, there is no additional behaviour or hidden stats, it is an auto
battler with no difference in terms of logic applied other than the modules."*
He is right, and a ladder whose rungs differ by a secret accuracy penalty is not
a ladder of ship designs. All of it is gone — `SimAI.DOCTRINE` is one shared
constant block, `pickTarget` always takes the nearest thing in the cone, and
`aimAngle` points straight at the target. `Sim.AI_PRESETS` / `AI_DEFAULTS` are
gone, opponents carry no `ai` key, and the editor lost its Behaviour tab.
A fit passed to the sim is now `{shipId, modules}` and nothing else.

Removing the blocks changed the balance, as it had to: Needle had been living
off the sniper preset and dropped from rung 6 to rung 5. The ladder was re-ranked
from a fresh round robin. Two selftest assertions guard the rule now: no ship
carries an `ai` field, and forty mirror matches of identical fits come out 22/18
— if either side were favoured, something asymmetric would be hiding in the sim.

### 2026-09-22 — the effect art was not being used
All 25 sprites in `images/effects/` were copied across in the rebuild and then
ignored: the renderer drew everything procedurally because that is how I briefed
it. Now wired up via `data/effects.json`, carried over from the old build's
`visual-effects.json` with relative paths and re-measured sheet layouts (the old
loader had `junk-01.png` as 736x182; it is 736x184, which is exactly 2x92).
Per-weapon ballistic and missile sprites, the 14-frame explosion sheet, the
25-frame smoke sheet, the 16-chunk junk sheet, the repair sheet, the energy
sheet over browned-out modules, and one seeded nebula backdrop per battle behind
the procedural starfield. An animated sprite is a slot in the same fixed 240-entry
particle pool with a frame counter — it does not allocate.

Deliberately left procedural: laser beams and point-defence interceptors, which
are drawn as one batched stroke each and would lose that if they took per-weapon
colours. The old config's `missile_trail` emitter is also not used — a smoke puff
per missile every few frames would empty the pool in about a second.

### 2026-09-22 — explosion scale, back to the original
The first wiring kept the old config's per-category scales but then multiplied
them at the event by the blast radius — a module blast could reach 6.4 cells
against a 3.2-cell original, and an invented `ship` scale of 0.5 drew a 16-cell
fireball. The original was simpler than that and did not modulate at all:
`createExplosion(x, y, scale)` did `setScale(scale)` on a 32px sheet, one fixed
number per category, so a module blast is **32 x 0.1 = 3.2 grid cells** and
nothing changes it. Restored verbatim, including the `reactor` scale of 0.15 that
had been dropped; `ship` now uses that same 0.15 rather than an invented number.
**Do not reintroduce event-time modulation** — it is what made blasts swamp the
ship they happened on.

Smoke is the one deliberate deviation, and it is in `data/effects.json` where it
can be seen. The original multiplied the same scale by 0.5 onto a 256px sheet
for every blast, which is 12.8 cells of cloud per destroyed module. That reads
fine when one module dies; this build's capital ships shed twenty in a second
and the fight disappears behind grey. Module smoke is pulled to 0.125 (3.2
cells), a reactor to 0.25, a ship going down keeps the original 0.5, and
missiles, mines and junk no longer smoke at all.

### 2026-09-22 — schema 2: ships own layouts
`Save` went from five hangar slots to `ships{key: {layouts[3], active}}` plus
`activeShip`. v1 saves migrate: each non-empty hangar becomes that ship's first
layout. `Progress` is new and holds the tier table and the two functions that
will one day gate things — `shipUnlocked` and `moduleUnlocked`, both returning
true right now. When progression arrives it lands in that file and nowhere else.

### 2026-09-22 — the loading screen could hang forever
Found while testing: if IndexedDB never settles — a wedged database, a delete
left pending by another tab — `arcade-store` has no timeout, its `ready` never
fires, and the game sits on "LOADING FLEET DATA…" permanently. A black screen is
the worst thing this can do to someone who just wanted to play. `Save.ready` now
gives the store two seconds and then carries on with an in-memory save, and the
game says so in the corner rather than lying about having saved. The store
itself was not touched — the arcade's rule is to copy `store.js` and change
nothing.

### 2026-09-22 — pinch and wheel in core
`core.js` tracks a second pointer and exposes `App.pinch = {active, scale,
dScale, cx, cy}`; the second finger deliberately does not disturb `App.ptr`, so
drags keep working during a pinch. `App.wheel.dy` accumulates and is cleared
each frame like `ptr.dx`. Both are shared input, not fitting-specific.

### 2026-09-22 — the unlock tree
`Progress` went from two functions that always said yes to the real thing:
levels, operations, tier gates, and gating of both hulls and modules. Save
schema 3 adds `prog` — level, completed operations, and the counters the
conditions read (wins, streaks, streak by opponent tier, wins per hull, hulls
that have ever won, layouts saved, largest hull ever filled). A v2 save keeps
its ships and starts at level 1.

Conditions are data, not code paths: 26 condition types in one dispatch table,
so a new operation is a line in `tools/operations.json` and a re-run of the
generator. Battle events are built in `ladder.js` from the result plus the fit
that was flown; fit events are hooked in `Save.setLayout`, so every path that
saves a layout counts — including the editor.

Two things the generator's own checks caught while building it: an operation
offered a level before the hull it required existed, and level 1 was both
hard-coded and allocated, silently swallowing two unlocks. The first verifier
checked the allocation and passed; it now checks the rendered output, which is
the only thing a reader ever sees.

**The opponent roster is lopsided for this** — seven of the nine are Tier 1 and
the other two are Tier 5, so the tier-2/3/4 gates have nothing to fight. That is
expected: the roster is hand-made and pools are to be generated per tier later.

## Still to do

- `BallisticPenetratingDamage` is wired to `impactPush` and should target
  `recoilPush` — pierce is currently read off the wrong pair.
- Autofit is bonus-blind: it packs a hull without reading that hull's bonuses,
  and nothing in the UI shows them either.
- Level 1 hands over 15 items, 9 of them Black Market. Generous enough that the
  first hour has no shopping to do.
- Audio: music only. The synthesised UI sounds are in `audio.js`; combat has
  none yet — see the sample list in the session notes (gun/hit/pop need three
  variants each, everything else one or two).
- The nine parallax backdrops are uncompressed PNG, 240-380 KB each. One is
  loaded per battle, not all nine, but converting them to WebP would roughly
  halve that.
- On a long bay row the stat line elides badly (`DPS 18 · DMG …  PWR 100`) —
  the left half is measured against what the right-aligned power draw leaves.
