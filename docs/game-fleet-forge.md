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

- **The data.** 41 ships and 91 modules of reverse-engineered *Space Arena*
  stats, plus five `DATA_*.md` tables. The scrapers that produced it are gone,
  so it is irreplaceable. Baked losslessly into `data/data.json`.
- **The formulas.** Armour / reflect / penetration, reactor chain explosions,
  shield absorb and overflow, point-defence interception, repair-bay rules.
  `BATTLE.md` (in the archive) documents the intent; the code diverges from it
  in a handful of places and each one is commented where it happens.
- **Two interaction designs**: the three-level module drill-down, and the
  five-slot hangar. The code behind both was replaced.

Everything else — router, context, storage, theme, six stub pages, the build,
the Netlify deploy — went.

## Features

### The fleet — tiers, not hangars
Home is your fleet by tier: five tiers down the left (decades of the data's own
`lr` scale), the hulls of that tier as cards, and the ship you pick carries its
own three layouts. The ship is the unit — once you have a hull you have it.
Live stats and a one-line verdict on whether the active layout can fly.

The five hangar slots are gone. They fought the game: the same hull in two slots
was two unrelated things, a slot was the thing you owned rather than a ship, and
there was nowhere to express that a hull is something you earn.

### Fitting
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
renderer. Smoothed follow camera, damage shown per module, brownouts visible
when a reactor dies, pause and 1x/2x/4x. Death returns to the hangar — never an
instant restart.

### The opponent editor
`editor.html`, a second static page in the game folder, **not linked from the
arcade**. Pick a hull, fit it with the same validator the game uses, and either
watch a test fight or run a few hundred headlessly for a win rate. Since
difficulty is purely the fit, fitting the ship *is* the whole of designing an
opponent — there is no behaviour panel because there is nothing to put in one.
Export the JSON and paste it over `data/opponents.json`. Auto-generated
opponents are a later phase; this is the format they will write to.

## Files

```
games/fleet-forge/
  index.html            the game
  editor.html           the opponent editor (dev tool, not linked)
  ARCHITECTURE.md       the contract every file here obeys — read first
  data/data.json        41 ships + 91 modules + text + key map, baked
  data/opponents.json   the opponent roster (each stamped with its tier)
  data/progression.json the unlock tree — GENERATED, do not hand-edit
  data/effects.json     which sprite each weapon and blast uses
  images/               module, ship and effect art
  js/
    arcade-store.js     verbatim copy of dragonseed's store
    theme.js            palette + canvas helpers
    progress.js         levels, operations, and the unlock gates
    effects.js          sprite sheets and the effect-art config
    core.js             1333x690 virtual stage, pointer, screen stack, widgets
    data.js             loads data.json once
    geom.js             the grid, and the ONE placement validator
    shipview.js         drawing a hull with its fit
    save.js             the player's save, over arcade-store
    opponents.js        the roster and ladder progress
    screens/            fleet, fitting, ladder, battle
    sim/                modules, ai, sim, selftest (node)
    editor/             store, fit, ai, testfight, app
  tools/
    bake-data.py        legacy src/data/** -> data/data.json (provenance)
    make-opponents.js   packs hulls to a recipe -> data/opponents.json
    balance.js          fights the roster; --rr ranks it
    operations.json     the 54 operations, hand-authored
    make-progression.js operations + data -> progression.json + the design doc
    progression-test.js drives the unlock tree headlessly
```

## Conventions this game leans on

- Back button `href="../../index.html"`, exactly.
- **Nothing in the top-left 160x54 box** — that is the arcade's own button.
- Saves in IndexedDB via `arcade-store.js`, key `calebArcadeData:fleet-forge`,
  carrying `sid`/`gen` so a stale tab cannot overwrite. The one exception is
  `editor.html`, which keeps its working copy in `localStorage` under
  `fleet-forge-editor:` — a dev tool's scratch, never a game save.
- The card in the root `index.html` needs the **trailing slash**
  (`games/fleet-forge/`) because the game loads `js/` files.

## Memory

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

- Three modules have no art and draw as a flat tile: **Fusion Ray**,
  **Arcfusion Array**, **Arsenal Wall**. Fifteen orphan module images exist that
  could be reassigned — a look-and-feel call, not a mechanical one.
- 17 of 41 hulls have no ship art, and all 32 ship images are currently unused
  (hulls draw as grids). Wiring art into ship select would lift that screen.
- The nine parallax backdrops are uncompressed PNG, 240-380 KB each. One is
  loaded per battle, not all nine, but converting them to WebP would roughly
  halve that.
- **Generated opponent pools per tier.** The tier gates need Tier 2, 3 and 4
  opponents and the roster currently has none.
- Audio: nothing yet. Arcade steering is a supplied theme plus subtle action
  sounds, no mute button.
- The **Drone** hull (1x2, two device cells, no engine cell) has no legal fit at
  all. It is offered in ship select and shouldn't be.
