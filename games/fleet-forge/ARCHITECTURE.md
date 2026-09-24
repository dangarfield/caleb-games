# Fleet Forge — architecture

Static, no build step, no framework, no runtime dependencies. Canvas 2D.
Served from `/games/fleet-forge/`, so **every path is relative** — the old build
used root-absolute `/data/...` and `/images/...` in 89 places and all of them
404 here.

Stage is a fixed **1333x690** virtual space (`VW`/`VH` in `core.js`), scaled and
letterboxed to the window. Lay out against those numbers directly.
**Nothing goes in the top-left `SAFE_TL` box (160x54)** — the arcade's own
"< Games" button lives there. Fleet Forge styles that button to the handoff's
own back pill, which is narrower (about 99px), and the handoff lays out against
THAT: the arena's hull/modules toggle sits at left 128. So 160 is the arcade's
blanket guard for the default, wider button; where the handoff gives a number,
the handoff wins.

## Load order (index.html)
`arcade-store.js` → `audio.js` → `theme.js` → `core.js` → `data.js` →
`geom.js` → `autofit.js` → `shipview.js` → `modstats.js` → `effects.js` →
`progress.js` → `save.js` → `opponents.js` →
`screens/home.js` → `screens/fleet.js` → `sim/*` → `screens/fitting.js` →
`screens/battle.js` → `screens/result.js` → `boot.js`

## The screens, and the design they come from
The layout is the Claude Design handoff in
`research/space-ship-fitting-game/project/`, at the tablet size the arcade runs
(1333x690). Every box in these files is a number read off `Fleet Forge.dc.html`,
not an interpretation of it. The screen ids below are the handoff's.

| id | file | what it is |
|---|---|---|
| 1g | `screens/home.js` | pilot select — Ezra and Caleb, two separate saves |
| 1aa | `screens/fleet.js` | hangar: tier rail, hull cards (the fit lives on the active card), ops/unlocks |
| 1b | `screens/fitting.js` | fitting bay: module bay, the editor, fitting budget |
| 1c | `screens/battle.js` | arena HUD — read-only, one control (match speed) |
| 1d/1e/1f | `screens/result.js` | one screen, three states (level up / held / wrecked) |

Where a screen departs from the handoff it says so in its own header comment.
The three that matter: hull cards draw the real grid where the design has a
striped placeholder; the fitting editor is finished where the design's is
explicitly not; and the fitting bar carries CLEAR/COPY and a BACK state the
design has no room for, because three clonable layouts need them.

Plain scripts and globals, no modules — the arcade serves files straight off
disk and `type="module"` would mean CORS trouble on `file://` for anyone opening
it directly.

## The contracts

### `theme.js`
`T.{bg,bgMid,bgTop,accent,glow,onAccent,warn,ready,danger,sealed,ink,white,subtitle,muted,faint,panel,panelEdge,hairline,steelLo,steelHi}`,
`T.fam[weapon|defence|utility]`, `T.cat[subtype]`, `T.tintForModule(mod)`,
`T.familyOf(mod)`.
**Three greys, and no fourth:** `T.edge` is every 1px border on every card, row,
tile and control; `T.rule` is the structural hairlines that separate regions
(panel edges, the bar underline); `T.track` is the unfilled part of a bar. A
border drawn with anything else is a bug — canvas gamma makes a 0.02 difference
read as a different colour, and they were drifting.
**Two colours are reserved and they are rules, not preferences:** cyan is UI
only and never a module family; amber means locked or over budget and nothing
else.
Type: `T.head(px,w)` Saira Condensed, `T.body(px,w)` Barlow, `T.mono(px,w)`
IBM Plex Mono — the handoff's three faces, from Google Fonts, every stack
falling back to a system face.
Helpers: `rr(ctx,x,y,w,h,r)`, `fillRR(...,fill)`, `strokeRR(...,stroke,lw)`,
`dashRR(...)`, `text(ctx,s,x,y,{font,fill,align,baseline,track,glow,glowBlur})`
(`track` is letter-spacing, drawn a glyph at a time because canvas has no such
property), `fitText(ctx,s,maxW,font)`, `initials(name)` (the three-letter codes
the design puts on every tile), `stripes`/`stripesRR` (the handoff's repeating
diagonals), `vignette` (its radial grounds), `steelBar`, `hatchDisc`,
`bgGradient(ctx,w,h)`.

### `core.js`
`App.init()`, `App.start(screen)`, `App.push/pop/replace(screen)`, `App.ptr`,
`App.inRect(x,y,rect)`.
A **screen** is any object with optional `enter/exit/pause/resume/update(dt)/draw(ctx,dt)`.
Rects are `{x,y,w,h}`.

`UI` is immediate-mode — each widget hit-tests the live pointer as it draws, and
returns `true` on the frame it was tapped:
- `UI.button(ctx,rect,label,{active,disabled,font,fill,radius})`
- `UI.primary(ctx,rect,label,{disabled})`
- `UI.zone(rect)` — tappable region, caller draws
- `UI.held(rect)` — pointer currently down inside
- `UI.scroll(ctx,rect,state,contentH,body)` — drag + momentum, owns the clip;
  `body(ctx,scrollY)` draws content in content space
- `UI.row(rect,clip)` — for a row inside a scroll viewport; `rect` in **screen**
  space, `clip` the viewport

A tap requires press and release in the same rect **and** no drag, so flicking a
list never also selects a row.

### `data.js`
`Data.load(cb,fail)` once at boot. Then `Data.ships`, `Data.modules`,
`Data.shipList`, `Data.ship(key)`, `Data.module(key)`,
`Data.shipImg(ship)`, `Data.moduleImg(mod)` (may return null — draw the tint),
`Data.GROUPS` (group → family tree for the drill-down),
`Data.family(groupId, familyId)` → modules, smallest first.

**Fields are named as the extractor named them** — `requiredLevel`, `powerUse`,
`thrustPower`, `attackSpeed`, `width`, `height` — not the two-letter aliases the
first build used. A module also carries `key`, `displayName`, `description` and
the three derived fields below.

The aliases are gone from the code, and `tools/field-audit.js` is what keeps
them gone: it hangs a booby-trapped getter off every record for each retired
name, runs the fitting bay and the sim over the whole roster, and reports the
file and line of anything that reads one. A missed rename does not throw, it
returns `undefined` and quietly poisons a number, so this is the check that
matters. Run it after touching the data layer.

### Modules — `data/modules.json`
Copied from `research/extracted_module_data/modules_all.json` by
`tools/copy-modules.js`. **A copy, not a bake**, and **nothing is filtered** —
the source file IS the roster. Three things are not carried straight through,
and none of them is a list of names:

- **Nothing is renamed.** Fields keep the extractor's names. `module_keys.json`
  travels with the data as the legend, and its `old` column records what each
  field used to be called — that is history, not a mapping the game applies.
- **`subtype`.** The sim dispatches on it and no extracted field carries it:
  `category` cannot tell a Warp Drive from an Afterburner, because both are
  category 64 with every engine stat at zero. What separates them is the Unity
  behaviour script each module is attached to (`m_Script.m_PathID` in
  `modules_raw/`), sixteen of which cover all 100 modules. An unrecognised
  script is a hard error, so a re-extract that shifts the ids fails loudly
  instead of quietly mistyping half the roster.
- **`damageType` and `turret`**, read off `category` and `fireCone`.

There is no `img` field. Art is named after the key —
`images/modules/<key>.webp`, `images/ships/<key>.webp` — and the extension is
recorded in each data file as `art`, because the source has arrived as both PNG
and webp and the browser should not have to guess which. The copy step reads the
extension off the source file rather than assuming it, refuses a set that is not
all one format, and deletes anything left in the folder that is no longer a
module's or hull's current art — which is what stops a format change leaving a
hundred stale files behind.

### Ships — `data/ships.json`
Ships live in their own file, copied from `research/extracted_ship_data/` by
`tools/copy-ships.js`. **That is a copy, not a bake**: the source is already the
shape the game wants, so the tool renames a handful of fields (`width`→`w`,
`requiredLevelSource`→`lr`, …) and stops. **Nothing is filtered** — every row in
the source becomes a ship, and curating the roster is done in the data by hand,
never by a name pattern or a level threshold in code.

A ship is `key, displayName, tier, w, h, g, ms, ts, lr, bonus, img`. There is no
hull mass: see **Mass** below. `tier` is 0-indexed in the source and 1-indexed in
the UI, and it is what decides which tiers exist — `progression.json` supplies
each tier's NAME where it has one, and a tier the data has but progression does
not still appears, its band derived from its own hulls.

### Hull bonuses
A ship's `bonus` is `{ "<Category><Parameter>": pct }` — `ArmorArmor: 25.5` is
"+25.5% armour on this hull's armour modules". The category half is the SAME bit
field modules carry in `c`, which is what makes it cheap: a bonus applies when
the masks overlap, and no stat needs a special case. `Self` (mask −1) is the
whole ship.

`Geom.resolveBonus` turns a ship's map into a flat list once at load, and
`Geom.applyBonus(mod, list)` returns an EFFECTIVE COPY of a module — never a
mutation, because `Data.modules` is shared by both combatants and every screen,
and the same Chaingun record is the player's and the enemy's at once with their
hulls buffing it differently. The table lives in `geom.js` rather than `data.js`
because every headless tool already loads geom, and two copies would drift.

`data/bonus-keys.json` is the key list the source game defines — data, not a
constant, so a new key shows up in `Data.bonusGaps()` at boot instead of
silently doing nothing. The sim reads `m.s.<stat>`, the effective record, never
`m.mod.<stat>`.

### Mass
**Mass is the fit and only the fit.** The hull used to bring a base mass of its
own (`rm`, 4,500–34,000), which drowned out everything bolted to it — a
Broadsword was 87% hull, so what you fitted moved its handling by a few percent.
The new ship data has no such field.

Both `THRUST_SCALE` and `TURN_SCALE` divide by mass, so removing it multiplied
acceleration and turn rate by 7.9×; they were divided by that, so a middling
hull flies as it did. What changed on purpose is the spread: thrust-to-mass used
to run 0.50–0.73 across the roster (a factor of 1.5), and now runs 2.15–9.96 (a
factor of 4.6). The fit is most of it.

**Never route on a display name.** `subtype` exists precisely because the old
`ModuleFactory` matched English substrings (`'mine'`, `'junk'`, `'repair'`,
`'warp'`, `'afterburner'`).

### `effects.js`
`Effects.ready`, `Effects.cfg` — `data/effects.json`, fetched once when the
script runs. `Effects.sheet(name)` → a spritesheet with its frame rectangles
already computed (`fx`/`fy` Float32Arrays, `frames`, `fps`, `dur`);
`Effects.projectile(family, moduleKey)` → `{img, scale, rot}` for one weapon's
round, `family` being `ballistic`/`missile`/`mine`; `Effects.prime()` warms the
small art when a battle opens; `Effects.background(path)` fetches one 512x512
backdrop on demand — the nine of them are 2.6 MB and a battle uses one.
`scale` is world units per source pixel. Everything degrades: if the config or
a PNG is missing, `ready` is false and `screens/battle.js` draws the procedural
shapes it always had.

### `geom.js`
`CAT.{BALLISTIC:1,MISSILE:2,LASER:4,ARMOR:8,SHIELD:16,POINTDEF:32,ENGINE:64,REACTOR:128,SUPPORT:256,WEAPON}`.
- `Geom.shipGrid(ship)` → `{w,h,cells[row][col],capacity}`, cached, 180° rotation
  already applied. Cell values: `0` none, `1|2|3` device, `4` engine, `5` both.
- `Geom.canPlace(grid, placements, mods, moduleId, col, row, skipIndex)` →
  `{ok, why}`. **The only placement validator. Do not write another one.**
- `Geom.occupancy`, `Geom.footprint`, `Geom.at(placements,mods,col,row)`
- `Geom.summarise(ship, placements, mods)` → cells/power/mass/thrust/counts
- `Geom.validate(...)` → `{ok, errors[], stats}`. The rules are a weapon, a
  POWER SOURCE, an engine, non-negative power and inside capacity. A power
  source is anything with `powerGeneration > 0`, not a reactor: Solar Armor and
  Small Laser v2 generate and draw nothing, so a hull can run without a reactor
  fitted. `sim/modules.js` `makesPower()` is the same rule for the win
  condition — kept separate from `isReactor()`, which decides what explodes.
- `Geom.gridToLocal(col,row,mw,mh,gw,gh)` / `gridToWorld(...,pos,rot,cellSize)`

A **placement** is `{moduleId, col, row}` and nothing else. Width and height are
looked up in the module data every time — storing them on the placement is what
caused the afterburner bug.

### `shipview.js`
`ShipView.layout(ship, box, maxCell)` → `{grid,cs,x,y,cellAt(px,py),cellRect(c,r,w,h)}`
`ShipView.drawHull(ctx,L,opts)`, `drawModules(ctx,L,placements,{selected,skip})`,
`draw(ctx,ship,placements,box,opts)` → `L`

### `save.js`
Schema **v4**: one stored document holding two pilots. `Save.pilots()`,
`Save.use(id)`, `Save.pilot()`, `Save.summary(id)`; everything else acts on the
pilot currently in play, so no other file knows there is more than one.
`Save.ready(cb)` before anything — it gives IndexedDB six seconds and then
carries on in memory rather than leaving a child on a loading screen, adopting
the store if it turns up late. Then `Save.get()`, `Save.owned/unlockShip`,
`Save.activeShip/setActiveShip`, `Save.layout/setLayout/cloneLayout`,
`Save.activeLayout/activeLayoutIndex/setActiveLayoutIndex`, `Save.progress()`,
`Save.recordResult(id,won)`, `Save.SLOTS` (3), `Save.working()`,
`Save.conflict()`.
`Save.hullView(place)` / `setHullView(place, v)` remember how a ship is drawn in
each of the three places it appears. The allowed values per place live in one
table, `HULL_MODES` — `hangar` and `fitting` take `hull|modules`, `battle` also
takes `damage`, and `battle` defaults to `damage`. A setter that repeats that
list instead of asking the table is how DAMAGE went a fortnight without ever
being saved.
IndexedDB via `arcade-store.js`, key `calebArcadeData:fleet-forge`, carries
`sid`/`gen` so a stale tab cannot overwrite. **Never use localStorage.**

### `progress.js`
100 levels, 8 tiers, 99 operations. `data/progression.json` is
**generated** by `tools/make-progression.js` from `tools/operations.json` — do
not hand-edit it. `Progress.level()`, `tiers`, `tier(n)`, `tierOf(ship)`,
`shipUnlocked/moduleUnlocked/tierUnlocked`, `available()`, `opProgress(op)`,
`upcoming(n)`, `recordBattle(ev)`, `recordFit(ev)`.
**No operation may name an opponent** — fights come from a generated pool, so a
condition may ask about an opponent's TIER and never its identity.
`tools/progression-test.js` asserts that, and 28 other things.

### The hangar's goal panel — `screens/fleet.js`
No side column: the body is one full-width fleet pane, and the goal lives in a
**GOAL** chip in the 58px bar with a drop-down under it (340 wide, on
`App.RIGHT_INSET`, as tall as its contents and never past `PANEL.maxH`).
`panelHits()` runs before any painting, because hit-testing here is paint order
and the panel paints last — it claims the pointer for the scrim so a dismissing
tap cannot land on the hull card behind it, and leaves the bar live so the chip
can shut what it opened.

### The arena camera — `screens/battle.js`
The frame is the midpoint of the two ships, zoomed so the pair fits the safe
band (`HALF_W`/`HALF_H`, the screen less the HUD and the two ship cards), both
position and zoom chasing their target with a per-1/60s lerp.
**Both ships are always whole on screen.** `CAM_FILL` scales the framed box past
the viewport and is 1 for that reason — anything above 1 buys pixels per cell by
pushing their outer edges off the screen. What is framed is the HULL radius
(`ship.rad`), not `brad`, which adds the widest shield: a shield is mostly empty
air and framing it cost a third of the zoom for a translucent ring that reads
perfectly well cropped.

Mid-fight the hulls are nearly touching — a Kronos pair sits 58 units apart with
22 units of ship either side of the gap — so there is no dead air left to
reclaim and tuning `SimAI` `ENGAGE_FRAC` does not move it. Measured 0.75 → 0.30:
separation moved 48 → 39 on the smallest hull and not at all on the rest.

### `autofit.js`
`Autofit.build(ship, opts, mods)` packs a whole hull and returns placements.
`opts` is `{weapons, armour, priority, placement, seed, allow}` — the first
three are the AUTOFIT menu's toggles, `placement` is `clever` or `random`, and
`allow(mod)` is the unlock gate (the fitting bay passes `Progress.moduleUnlocked`).
Nothing here decides legality: `Geom.canPlace` is asked for every placement and
`Geom.validate` judges the result, same as the hand editor.
**Row 0 is the nose** (`Geom.shipGrid` rotates the source data once), and every
placement score reads `front` as `1 - row/(h-1)`.

The build order is the design, and it is this:

1. **The skin.** Armour caps the frontmost solid cell of every column, one row
   deep, before anything else may compete for it — widest plate first, or
   thickest-per-cell on an armour recipe. This is a hard rule, not a score:
   scores only rank cells, so a big budget spilled backwards into a brick and a
   small one never reached the flanking columns.
2. **Engines.** Real drives first, sorted by thrust per cell. A value-5 cell is
   a mixed mount and engines get first refusal on it simply because their pass
   runs first. A warp drive and an afterburner are engine-mount modules (`c:64`)
   and only a `speed` recipe seats them — into a spare mount, or by trading the
   cheapest patch of drives for one, never below 60% of the thrust it had.
3. **One gun, guaranteed**, so a twelve-cell fighter cannot discover at the end
   that its whole budget went on plate.
4. **Defence, then weapons.** Plate behind the skin with the guns ranked behind
   that: the shared doctrine always closes nose-on, so guns placed first become
   the outer layer and the first salvo strips them. Worth about 40 percentage
   points in clever-vs-random.
5. **Reactors, last and sized to the bill.** `feed` fits the smallest reactor
   that covers what is still owed; `trim` takes back any the ship turns out not
   to need. There is no reactor share in the recipe — that fifth of the hull
   used to become leftover plate.

Two things make the shares mean anything. **A module costs its cells plus its
power**: a 2x2 shield generator occupies four cells and draws 280, which is
another three and a half cells of reactor aft, so it is charged seven and a
half. And **every fill leaves room for the reactors the current draw implies**,
so a pass can never spend the hull into a fit that cannot power itself.

`tools/autofit-test.js` builds every hull against every recipe — 3,840 fits, all
of which must be flyable — and `--fight` puts clever up against random on the
same hull and recipe.

### `opponents.js`
**The opponent is built when you press ENTER ARENA, not picked off a list.**
`Opponents.draw(tier)` calls `generate(tier)`: a hull is drawn from that tier,
`Autofit` packs it, and the AUTOFIT menu's own options are rolled at random —
including the `placement` mode the menu never shows, because a clumsily placed
fit is the only honest way to make an easy opponent when difficulty is purely
the fit. The fit is built with what a pilot flying *that* hull would have
unlocked, so a tier 1 skiff cannot turn up carrying a Fusion Turret. The row it
returns is shaped exactly like a roster row, so nothing downstream can tell the
difference; `id` is the hull (`gen:Hammerhead`), because `beaten` is keyed on it
and a save that grew an entry per recipe would grow without bound.

THERE IS NO ROSTER. `data/opponents.json`, `tools/make-opponents.js` and
`editor.html` are deleted. The roster was a second packer that never saw
`autofit.js`, so its fits drifted from the game's own rules; it knew nothing
about a save, so its rows ignored what the player had reached; and it was the
last place a fight could come from that the pool rule below did not allow.

`Opponents.poolFor(ship)` is the whole rule, and the hull the player brought is
its only input — not their level, not the band their level sits in:

1. every hull of that hull's tier;
2. the ceiling is that hull's own unlock level, moved up to the **next unlock
   in the same tier** where there is one — above tier 1 only;
3. drop everything in the tier above the ceiling.

The pool cannot come back empty: the player's own hull is always in it. Tier 1
takes no next rung, so a Light Fighter meets Light Fighters until something
bigger is earned.

`Opponents.draw(ship)` generates against that pool, `fitFor(o)` hands the sim
the fit. An opponent is a hull and its placed modules and nothing else, because
nothing else differs between opponents — difficulty is the fit.
`tools/balance.js` generates its own five archetypes a tier, with `autofit.js`,
and checks that tier strength ascends and that no archetype inside a tier is a
walkover.

### Transitions
`core.js` owns one rule for the whole game: any change to the screen stack —
`start`, `push`, `pop`, `replace` — arrives out of black over 280ms, alpha
squared so the picture clears fast and the last of the black goes slowly. It is
a fade IN and not a cross-fade because an immediate-mode canvas has no second
buffer to cross-fade against: the outgoing screen stops existing the moment the
stack changes. Input is deliberately not blocked during it.

The arena has an opening of its own, handoff 1c's `battleCountdown`:

| phase | to | what is on screen |
| --- | --- | --- |
| `intro` | 1.10s | black easing to a 0.86 dim, the versus card, no HUD |
| `c3` `c2` `c1` | 3.65s | dim drops to 0.50, HUD fades up, ENGAGING IN 3/2/1 |
| `fight` | 4.15s | FIGHT and the dim fade out together over 500ms |
| `live` | — | the sim runs |

The arena is **drawn** from the first frame — the fight fades up behind the card
rather than appearing when the card leaves — but `world.step` is not called and
nothing shoots until `live`. The opening runs on real time and cannot be paused
or fast-forwarded, because it is not part of the match.

### Music
One rule: the battle theme owns the fight AND its result, so VICTORY and WRECKED
keep it and ENTER ARENA from there starts another fight without a music change.
It drops back to the hangar theme only when the player actually leaves, via
REFIT or HANGAR. Cross-fade is 4s.

Every screen SAYS which theme it wants in `enter`/`resume` — `result.js` asserts
`battle` rather than assuming nobody changed it, because it cannot assume:
tearing the arena down is `App.pop()`, which RESUMES the hangar underneath and
asks for the hangar theme, and only then is the result screen pushed. That is
two asks in one tick and the first of them is wrong.

So `Music.to` records the ask and applies it on a microtask: **the last caller
in a tick wins, and no fade starts for the ones before it.** Acting on the
intermediate value starts a four-second cross-fade that the next statement
immediately reverses — inaudible at 60fps, a real swell when timers are coarse
(a backgrounded tab clamps them to ~1s), and a bug waiting for whoever adds a
third screen to that sequence.

## House rules
- No `console.log` on a per-frame or per-hit path. The old build had ~50,
  including 4-8 lines per laser per frame.
- No `alert()` — draw the message.
- No per-pellet / per-hit `setTimeout`. Stagger with counters in the update loop.
- Allocate nothing per frame in a hot loop: no `.filter()`/`.sort()` per
  projectile per frame, no `new` inside the innermost loop. Pool projectiles.
- The target is a low-power tablet. Budget the frame, then add features.

### Progression — `data/progression.json`
Generated; never hand-edited. `tools/make-progression.js` builds a **100-level
ladder** and `tools/make-operations.js` writes one operation per level from it:

```
node tools/make-progression.js --json --bootstrap   # the ladder
node tools/make-operations.js                       # the operations for it
node tools/make-progression.js --json               # fold them back in, clean
```

`--bootstrap` downgrades the operation-dependency check to a warning, and only
that check. The operations are written against the ladder and the ladder is
validated against the operations, so any change that moves a level makes the
first pass fail on operations the second pass is about to rewrite. The third
pass runs without the flag and must pass.

**A rework is not an item of its own on this ladder.** Anything with a
`modification` is pulled out of the spread and placed against the module of the
same `displayName` without one: `BM.1` five levels after its base, `BM.2` ten,
capped at level 99 so the top level stays the prize hull alone. Nothing is
name-matched and no level is written down. Do NOT read `visible` for this —
it is a different field that merely correlates, and reading it is how nine
Black Market pieces ended up in the starting kit.

The source data's required level is NOT the ladder. It runs 1-60 with the roster
bunched at the bottom, which gave a crowded early game and a tail of nothing but
hulls. Here the source level decides only the ORDER; position in that order
decides the level, so the reward rate is flat — a little over one thing per level
the whole way. Level 1 is whatever the source gates at or below 1; the last hull
in the order is the prize and lands on level 100 alone.

Every level's operation is about what that level handed over — fly the new hull
and win three, five or seven times depending on its tier, or win once with the
new module fitted. An operation at level N is what carries the player from N to
N+1, so it is always about something they already have.

`tools/progression-test.js` walks the whole ladder to the top, flying what each
operation names. An operation nobody can satisfy is a dead end no table
inspection finds — only playing it does.
