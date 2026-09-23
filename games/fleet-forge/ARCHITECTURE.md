# Fleet Forge — architecture

Static, no build step, no framework, no runtime dependencies. Canvas 2D.
Served from `/games/fleet-forge/`, so **every path is relative** — the old build
used root-absolute `/data/...` and `/images/...` in 89 places and all of them
404 here.

Stage is a fixed **1333x690** virtual space (`VW`/`VH` in `core.js`), scaled and
letterboxed to the window. Lay out against those numbers directly.
**Nothing goes in the top-left `SAFE_TL` box (160x54)** — the arcade's own
"< Games" button lives there.

## Load order (index.html)
`arcade-store.js` → `theme.js` → `core.js` → `data.js` → `geom.js` →
`shipview.js` → `effects.js` → `progress.js` → `save.js` → `opponents.js` →
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

Every module carries baked-in `key`, `displayName`, `desc`, `subtype`,
`damageType`, `turret`, `img` alongside its raw stat keys (`dmg`, `rng`, `ats`,
`fc`, `hlt`, `a`, `r`, `m`, `pu`, `pg`, `ep`, `c`, `w`, `h`, …). `data/data.json`
is the source of truth; `tools/bake-data.py` is provenance, not a build step.

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
- `Geom.validate(...)` → `{ok, errors[], stats}`
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
IndexedDB via `arcade-store.js`, key `calebArcadeData:fleet-forge`, carries
`sid`/`gen` so a stale tab cannot overwrite. **Never use localStorage.**

### `progress.js`
50 levels, 7 tiers, 56 operations, 6 tier gates. `data/progression.json` is
**generated** by `tools/make-progression.js` from `tools/operations.json` — do
not hand-edit it. `Progress.level()`, `tiers`, `tier(n)`, `tierOf(ship)`,
`shipUnlocked/moduleUnlocked/tierUnlocked`, `available()`, `opProgress(op)`,
`upcoming(n)`, `recordBattle(ev)`, `recordFit(ev)`.
**No operation may name an opponent** — fights come from a generated pool, so a
condition may ask about an opponent's TIER and never its identity.
`tools/progression-test.js` asserts that, and 20 other things.

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

The baked roster below is still loaded, still generated, and still what
`editor.html` tunes and `tools/balance.js` fights — the game just no longer
draws from it, and it is the fallback if generation ever fails.

`data/opponents.json` is **generated** by `tools/make-opponents.js`: five
archetypes crossed with the seven tiers, each packed onto a hull from that tier
and checked through `Geom.validate`. `Opponents.pool(tier)`, `draw(tier)`,
`fitFor(o)`, `tierProgress(tier)`. An opponent row is a hull and its placed
modules and nothing else, because nothing else differs between opponents —
difficulty is the fit. `tools/balance.js` checks that tier strength ascends and
that no archetype inside a tier is a walkover.

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
