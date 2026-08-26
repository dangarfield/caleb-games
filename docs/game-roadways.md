# Roadways

A city-traffic puzzle in the spirit of *Mini Motorways*. Coloured destinations
open on a tile grid, matching-coloured houses appear around them, and the player
drags roads to connect the two. Cars live at the houses and drive themselves —
house → matching destination, collect one waiting pin, back home — scoring a trip
each round. Pins pile up at the destinations; when a destination exceeds its
hidden capacity a radial countdown appears, and if one ever empties the run is
over. The map starts as a tight crop and the camera zooms out over the first seven
weeks to frame the whole city, the buildable area growing to meet it. Every Sunday
the player picks one of two bundles — road tiles, sometimes with an infrastructure
item (a motorway, or a bridge/tunnel). Fills the arcade's gap for a calm, spatial
logistics/planning game: no reflexes, all thinking. Touch-first, aimed at ~7+, no
reading needed beyond icons and numbers. **Ezra and Caleb are player profiles** (each
carrying its own difficulty tuning and per-city best); a run begins by picking a
profile, then a city (Los Angeles is the only one built so far).

## Features

- **8-directional road network.** Roads are undirected *edges* between adjacent
  tiles, not tile occupancy. One grid step costs one road tile whether orthogonal
  or diagonal — but a diagonal is √2 (≈41.4%) longer to drive, so diagonals buy
  distance at the cost of throughput. A diagonal is refused if the opposing
  diagonal across the same 2×2 block already exists, keeping the network readable,
  and refused again if it would **cut a corner** — the edge runs exactly through the
  point where the two shoulder tiles of its 2×2 block meet, so anything solid on either
  one meant the road was drawn straight across it. Solid means an office body, an office
  driveway (the lot), water or a hill; a **house is the one exemption**. A drag that
  asks for a refused diagonal gets the **L round the outside** instead, at the honest
  cost of two road tiles.
- **A house has one drive, laid like any road but free.** A house is 1×1 and joins
  from any of the 8 directions, but it may hold only **one** road edge — its drive.
  Dragging a new drive in a different direction replaces the old one (which ghosts if
  a car is still driving home along it). The drive **does not cost a road tile** — it
  is free to lay and refunds nothing when erased (so it can't be farmed). Asphalt runs
  to the tile *centre* and the house is drawn over the top, so the road slides
  underneath. Cars on a house tile are always drawn **under** the house (parked or
  moving); the pips below show how many are waiting. A house is drawn in the square
  office idiom: a solid body with a darker facade band carrying the office glazing and
  a door, extruded down-right, its flat top split light-left / dark-right and skewed up
  to a shallow centre peak (see `## Memory` for the iterations). Colour is the only
  identity channel; the old class emblem is gone.
- **An office has a connection point and a driveway.** An office is not a plain
  footprint you touch anywhere. It owns three kinds of tile: the **building**
  proper (no road, no cars), a **driveway** inside the footprint with a bank of
  angled marked spaces along it — **3 for a single office, 7 for a double** —
  and one or two **connection points** that sit *outside* the footprint on
  ordinary land. The connection point is the only tile a road may join — road
  runs there, then cars turn in along the driveway to their own space, where a car
  turns 45° out of the lane, drives up into it, sits for a beat and reverses back
  out along the same line. A driveway is
  public: any car may drive *through* it whether or not it is calling, but no
  road may terminate on it. Twelve variants cover the 2×3 and 3×2 offices in all
  four orientations plus the double office (below). An unroaded connection point
  shows a faint dashed ring — "a road can land here" — and nothing once joined.
- **A double office is two colours in one building.** From day 5, an office may
  arrive as a 3×4 (or 4×3) building split into two coloured halves that share one
  four-tile driveway running right through it, with a connection point at *each*
  end. Both halves queue and can be lost independently, but one road can feed
  both — and because the driveway is public, it doubles as a genuine (slow)
  short cut through the car park. It is deliberately cheaper to sustain per
  colour than two separate offices.
- **Congestion is core.** Cars queue in order on an edge and cannot overtake; a
  full edge blocks entry, so queues back up through junctions into a genuine
  gridlock cascade. What costs a car time at a junction is *waiting* for a
  conflicting movement, never the junction itself: cleared straight through a
  crossroads it keeps every bit of its speed, and only the corner costs velocity —
  a little at 45°, more at 90°, most at a u-turn.
- **Cars see junctions coming and give way by conflict, not by turn.** A car
  brakes on the approach to whatever speed it will be allowed on the far side, so
  it arrives slow rather than slamming to a halt on the tile centre, and stops
  short of the node at a give-way line when it cannot go — which is what makes a
  queue form nose-to-tail behind a junction. Two cars cross a plain intersection
  *at the same time* whenever their two paths through it do not cross: opposing
  through-traffic on complementary sides flows freely, and a right turn hugs its
  own corner. A movement that cuts across someone else's lane — a left turn across
  the oncoming lane, either axis of a crossroads — waits for it to clear.
- **Traffic lights and roundabouts are removed from play.** They were cut from the
  reward pool, the tool palette, the keyboard shortcuts and the legend, so the player
  can no longer obtain or place either. The underlying net/traffic code (the roundabout
  ring synthesis, the light-phase state, the give-way branches that read them) is left
  in place but dormant — `hasLight`/`inRoundabout` are simply never true (see `## Memory`).
- **Pins accumulate at destinations.** Each destination has a hidden capacity;
  past it a radial countdown timer appears. Collecting a pin while it runs adds
  back ~15% of the total, and the timer vanishes entirely once pins fall back
  under the cap. An emptied timer ends the run. The pips are drawn at one fixed
  size — the size that fits *capacity*, not the size that fits the current count —
  so the queue visibly grows and a full-looking box really is full.
- **Square → circle upgrades.** A destination that has stood a while can upgrade
  from square to circle, keeping its footprint but demanding pins faster and more
  volatilely. Only one candidate is rolled per week, from week 3, at p=0.55, and it
  must be at least two weeks old — so most squares never upgrade.
- **Monday→Sunday calendar.** The week is the unit of *rewards and rings*, not of
  spawning: at Sunday 00:00 time stops for the reward choice, and the map's ring
  lands at Monday 00:00. Spawning is on its own clocks (below), which deliberately
  do not reset at the week boundary.
- **Houses spawn on a per-colour demand-vs-supply loop.** Every colour runs its own
  house clock, and the clock's *speed* is that colour's demand-to-supply ratio. Three
  signals, all measured **per office** of that colour so a mature colour with four
  offices does not look permanently desperate:
  - the pin queue is **rising** → those cars cannot keep up → speed up (weight 1.4)
  - the queue is already **deep** → same conclusion from the level (weight 0.6)
  - cars sitting **idle in driveways** → that colour is over-supplied → slow down
    (weight 0.7), plus an extra brake for a *shrinking* queue, which is the earliest
    over-supply signal there is
  Speed multiplies **time**, not the interval, so the difficulty's `houseDays` stays
  readable as "how often at equilibrium" (3.2 days Normal, 2.8 Easy) and a colour that
  flips fast/slow mid-wait keeps the progress it had. Speed is clamped to 0.35×–3.0×,
  i.e. ~9 days per house when drowning in spare cars down to ~1 day when swamped.
  `sim` samples the raw numbers (it owns the pins and the fleet); `spawn.js` owns the
  policy.
- **A run opens on one colour and grows to five.** The board seeds a **single**
  office (colour 0) and its houses; more colours arrive on the office clock, capped at
  **5** of the 8 defined classes and paced to reach that by ~week 11 (Normal) / ~week 12
  (Easy).
- **An office every 4–6 in-game days**, on a clock of its own. Each firing introduces
  the next colour (if the colour schedule says one is due) or, only when a colour is
  genuinely drowning (its house clock pinned near max), hands it a **relief** office —
  so the early game is not stacked with same-colour buildings the board never needed.
  **An office may never open with no houses of its colour** — every arrival seeds one,
  walking the office's colour *parts* so a double office satisfies both halves. An
  office that cannot find room stays *outstanding* rather than being dropped, and the
  cadence clock does not restart until it lands. While one is hunting, the house clocks
  hold station for up to 3 days to stop 1×1 houses filling in the rectangle it needed.
- **Weekly reward bundles.** Two cards; each is a batch of road tiles paired with an
  infrastructure item — **Motorway +1**, or **Bridge/Tunnel +1**. About 22% of Sundays
  one card is a pure Road Bonanza with no item at all. Bridge/Tunnel is withheld from
  the pool until the revealed map actually holds water or mountain, and which of the two
  it is is decided once per run from the map's terrain type. There is no "one more car"
  reward: cars come from houses, earned by sustained demand.
- **Infrastructure.** Motorway = two 1×1 pegs with an airspace link between them,
  fastest travel and no intersection penalty. Bridge/tunnel = variable length span over
  water or mountain, costing one inventory item regardless of length; which one you're
  offered depends on the map's terrain type. (Roundabouts and traffic lights are removed
  — see above.)
- **The camera reveals the whole map over 7 weeks, linearly.** The framed rectangle
  interpolates from the opening playable rect (`start`) to the full playable box
  (`maxBounds` — the bounding box of every non-boundary cell) over `REVEAL_WEEKS = 7`.
  **Both the tile size and the centre are linear in that fraction** (`(week-1 +
  weekProgress)/7`) and depend only on time, not on where the buildings are — so a spawn
  never nudges the view. The **buildable** rect expands in lock-step (every frame, via a
  grow-only `expandTo`, rounded outward), reaching `maxBounds` by the end of week 7 too,
  so tiles become playable as the zoom uncovers them. `REVEAL_WEEKS` is one constant
  shared by the sim (expansion) and the shell (camera). There is **no darkened boundary
  and no frame**: the land beyond the playable rect is drawn as ordinary scenery; a grid
  of buildable spaces is shown only while a tool is being dragged.
- **Free erase, and the tile comes back straight away.** Erasing is free and
  refunds the road tile immediately, whether or not anybody is using it. A segment
  that some car still needs does not vanish: it becomes a translucent, pulsing
  *ghost* — deleted as far as everyone else is concerned, unroutable and unenterable
  — but still drawn and still drivable for the cars that remember driving it,
  because it is their way home. Every car keeps a stack of the roads it has driven
  since leaving its front door, and a road stays until the last car that remembers
  it has driven back along it or got home another way. That is the ghost's entire
  job: an erase behind a car must never cut off its route home.
- **Everything is removable, and right-click removes it.** A tap with the eraser —
  or a right-click with any tool selected — takes the infrastructure on that tile
  (motorway peg, bridge/tunnel mouth) and puts the item back in the wallet; the road
  underneath survives for one more tap. Holding the right (or middle) button and
  dragging erases road without touching the palette.
- **Up to 5 colour classes** (red, yellow, blue, green, purple — the first 5 of the 8
  defined) as absolute categorical matches — a red car only ever serves red pins.
  Colours are introduced gradually from a single starting colour, each arriving as a
  destination plus at least one matching house.
- **Spawn blocking as strategy.** Buildings never bulldoze player road, so paving
  an area denies it to future spawns — with the trade-off that a road-heavy map
  starves the 3×2 footprints new colours need.
- Best score persisted **per city and per profile** in
  `calebArcadeData.roadways.best[levelKey][diff]` (`levelKey` = the map id, or
  `'random'` for the procedural fallback). Canvas HUD pill, canvas game-over screen,
  particles, Web Audio SFX.
- Two tunings behind the profiles: Ezra plays Easy, Caleb plays Normal. Forgiveness
  lives entirely in the tuning, never in weakening a mechanic:

  | | Easy (Ezra) | Normal (Caleb) |
  |---|---|---|
  | day length | 12s | 9s |
  | new colour every | 2.75 weeks | 2.5 weeks |
  | max colours | 5 | 5 |
  | pin cap (square/circle) | 8 / 10 | 6 / 8 |
  | countdown | 30s | 20s |
  | square pin interval (base) | 7.5s | 6s |
  | circle pin interval (base) | 4s volatile | 3.2s volatile |
  | baseline weekly roads | 30 | 20 |
  | starting roads | 40 | 30 |
  | house cadence at equilibrium | 2.8 days | 3.2 days |
  | office cadence | 4–6 days | 4–6 days |
  | house density ceiling | 1 per 6 tiles | 1 per 5 tiles |

  A global **`PIN_RATE = 0.8`** throttle multiplies every pin interval (both shapes,
  both difficulties, and the day-10 demand ramp) so pins tick at 80% of the base rate —
  the base intervals above are before that 0.8. Easy and Normal share the 4–6 day office
  cadence deliberately: Easy's 12s day against Normal's 9s is already a third more real
  time to wire the new office up.

## File structure

Seven files, five of them DOM-free. The split exists so the simulation, the
traffic model and the presentation can be built and changed independently.

- `net.js` — `class World`: grid and terrain, playable bounds and radial
  expansion (`expandBounds` symmetric, `expandTo` grow-to-a-target used by the timed
  reveal, `startBounds` kept for it), the road **edge** graph, ghost edges, the
  single-drive-per-house rules (`touchesHouse`, `clearHouseDrivesExcept`,
  `isHouseTile`), buildings, infrastructure validation/storage, and the graph queries
  traffic reads (`linksFrom`, `isIntersection`, and the now-dormant `hasLight`,
  `inRoundabout`, `roundaboutFlowDir`).
- `spawn.js` — `class Generator`: procedural house/destination placement, office
  variant choice (including whether an office is a double), the 1-tile
  destination buffer, colour introduction (one to start, capped at 5), square→circle
  upgrades, and the house floor that keeps supply at or above demand. Houses spawn from
  four whole-map anchor points per colour. Owns the **per-colour house clock** and the
  **4–6 day office clock** (relief offices demand-gated by `RELIEF_SPEED`); `planWeek`
  is now only the opening seed and the square→circle upgrade roll.
- `demand.js` — the single source of truth for how much work one office is: how
  many houses sustain a shape on a given day, and the interval multiplier that
  makes demand rise through a run. Pure functions, no state.
- `traffic.js` — `class Traffic`: Dijkstra pathfinding over the edge graph, the
  car trip state machine, congestion/queueing, intersection and turn penalties,
  the park manoeuvre at an office bay, and the ghost-release handoff.
- `sim.js` — `class Sim`, the orchestrator the shell talks to exclusively:
  calendar, pin generation, destination countdowns, failure, road/infrastructure
  inventory, the Sunday reward choice, score, map expansion, and an event queue.
- `render.js` — all canvas drawing including the camera transform.
- `index.html` — the shell: boot, canvas, camera control, pointer input, tool
  palette, HUD, overlays, Web Audio, main loop.

## Key design decisions

- **A written module contract is the arbiter.** The six files were built by four
  parallel agents against a contract in `docs/.plans/game-roadways.plan.md`
  (exports, entity shapes, method signatures, event shapes) — not against each
  other's code. No agent may unilaterally change a name or shape in it. v1's
  parallel build needed zero integration fixes, which is why v2 scaled the same
  approach to four lanes.
- **Roads as edges, not tiles.** This is what makes the diagonal trade-off
  emergent rather than special-cased: cost is counted in edges (1 each) and
  travel time in `DIR_LEN` (1 or √2), so "same price, slower" falls out of the
  data model instead of a rule.
- **A house is its own gate; an office has a connection point and a driveway.**
  Roads join a house tile itself, from any of the eight directions — no marker
  outside the block. An office is three kinds of tile: **B** body tiles
  (`T_DEST|F_BUILD`, impassable), a **D** driveway strip along one edge
  (`|F_DRIVE`, drivable by anyone, but no road may terminate on it), and one or
  two **C** connection points *outside* the footprint, which are the office's only
  road frontage. Driveway↔driveway and driveway↔C `'drive'` links are synthesised
  in `linksFrom` and are exempt from intersection, light, roundabout and turn
  penalties: they are not road. The **door** is one driveway tile per colour, and a
  car arriving there really parks: it turns 45° out of the lane and drives up into
  that colour's own marked space against the building (see below). The rest of the
  bank is markings only — one car per colour can be in the lot at a time, so the
  other spaces stay empty, exactly as a mostly-idle car park looks.
- **A C tile is `F_GATE` without `F_BUILD`, and its tile stays `T_EMPTY`.** This
  is why connection points needed no validator changes at all: `canAddEdge`
  derives "this is a building" from `tiles[i] === T_HOUSE || T_DEST`, so a C tile
  reads as open land that happens to be joinable, while a driveway (`T_DEST`, no
  `F_GATE`) is automatically refused as a road endpoint. A C tile also does not
  count towards the footprint, so it is not part of the 1-tile buffer test — but
  it must itself be pristine open land, or the office launches with no frontage.
  The one place that convenience bites is anything reasoning about a *region* of
  tiles rather than an endpoint: `canAddRoundabout` has to test `F_GATE` explicitly,
  because a ring tile on a C would emit only its one-way circulation link and cut
  the office off the network. The diagonal corner rule is the mirror image — a C tile
  is a legal *shoulder* precisely because it is open land, while the driveway beside it
  is not.
- **A double office is two dest records sharing one building.** The 3×4 and 4×3
  variants serve two colours from one footprint, one 4-tile driveway and two
  connection points at the driveway's ends. Both records live in `world.dests`
  (so demand, pins, countdowns and failure are per colour, unchanged), and they
  share `parts`, `drive` and `conns`; `complex` points at the primary, `half` is
  the colour's own block, `slot` is 0 or 1. Every tile is owned by the primary, so
  `buildingAt` has one answer per tile. Because the driveway is a through route,
  a car heading for the far bay drives straight over the near one.
- **An edge needs at least one end on open land.** Two footprint endpoints are
  refused even when both are legal gates, because a gate's only interior link is
  its own door — so gate→door→far-gate would drive a car straight through a shop.
  Every building keeps at least one road-capable neighbour, so nothing is
  stranded by the rule (verified: 441 building↔building adjacencies across 20
  worlds, 0 allowed, 0 stranded).
- **Draw order carries the join.** Road layer → cars *on a house tile* → houses →
  house marks → offices → connection-point hints → cars on open road and on
  driveways → countdown clocks. Nothing is painted back on top of a building; the
  "join" is simply asphalt the building covers. A car goes under only on a
  **house** tile, which is what makes arriving and leaving read as driving into the
  building; a car on a **driveway** tile stays in the top pass, because the office
  layer paints the driveway and would swallow it.
- **An office is a paved lot with a building standing on it, and the paving is one
  surface.** `_drawLot` builds a single path — a rounded rect over the whole
  footprint plus a rounded lane whose ends are centred on the *connection points* —
  strokes it once in `COL.casing` and then fills it. Because every internal seam's
  stroke lies inside the union, the fill covers it: the result is one kerb round the
  outside and no seam anywhere. The lane is `COL.asphalt` over a `COL.lot` forecourt —
  same family, one shade apart, so the drive still reads as the bit cars use.
  In all twelve variants the drive tiles and their conns are collinear, which is
  what lets one straight rounded rect serve every case. `_lotPath` builds that path
  without painting it, so `_drawBays` can clip to the same outline.
- **The join is finished by re-laying the road's asphalt across the connection point.**
  Matching widths was not enough. The road layer reads seamless because it is painted
  in two *global* passes — every segment's casing first, then every segment's asphalt
  on top — so no casing ever ends up over asphalt, which is why one road meeting
  another has no dark line across the join. The lot cannot join that party: it is drawn
  per-office, after the cached road layer is blitted, so its kerb (a ring 0.25–0.34
  tiles out from the connection point) lands on top of the road it is meant to meet.
  `_repairJoins` finishes the sandwich locally — for every *roaded* direction out of a
  connection point it strokes that road's own asphalt again, at `LANE_W`, half a tile
  outwards. The kerb survives on the flanks (as casing does at a road T-junction) and
  the road runs straight through. Half a tile is deliberate: it more than covers the
  0.34 ring, and with a round cap it stops inside the neighbouring tile, which by
  definition carries road asphalt there — so the pass can never paint over grass, a
  house or another lot. An *unroaded* connection point is skipped and keeps its kerb
  and its dashed hint ring. Verified by pixel probe in live play: 16/16 samples at
  radius 0.22/0.28/0.32/0.40 in every roaded direction returned exactly `#767d99`,
  and the lane's asphalt inside the lot samples the same value as the road's.
- **The lane's dimensions ARE the road's, to the pixel.** `LANE_W = 0.50` and
  `LANE_KERB = 0.18` are not free numbers: `_paintRoads` strokes casing at `ts*0.68`
  and asphalt at `ts*0.50`, both round-capped, so `0.50 + 0.18 == 0.68` and the
  lane's cap radius (0.25, centred on the connection point) coincides with the
  road's own round cap and junction pad. Road → C → driveway → the building's ground
  is therefore one continuous surface with no step at the mouth. Any other width —
  the first version was 0.58 + 0.16 — leaves a visible shoulder exactly where the
  player is looking.
- **The building is a roof plus a facade, per colour.** `_drawOffice` draws a
  down-right shadow, a `deep`-shade extruded near side, then per colour a `fill`
  roof, a `dark` facade band across the bottom third with a lit parapet edge, a
  glazed window band, and the front door. Every colour gets its **own** facade at the
  bottom of its **own** slice: side-by-side halves share a bottom edge so it reads as
  one continuous facade, and stacked halves come out as two storeys. A round office
  gets the same treatment and comes out a rotunda.
- **The front door is always in the facade, at the end the cars come in from.**
  This projection only draws a block's *bottom* edge as a wall, so deriving the
  door's wall from the side the bay is actually on (the first version, `_doorSide`)
  put it on the roof's far edge on every top-driveway variant. `_entranceFrac`
  instead returns a 0..1 position **along** the facade — hard against the lane if the
  lane runs beside the block, over the bay's own tile if it runs above or below,
  centred on a rotunda — and `_drawEntrance` stands a dark opening with a lit lintel
  on the ground at that point. The doors of a side-by-side double therefore sit
  either side of the seam, each above its own bay. The pass is clipped to the
  silhouette, so a door near a rounded corner is cut by the wall, not left poking out.
- **The windows are one dark glass band, not a row of panes.** Light-on-dark rounded
  panes at tablet sizes are solid blobs and read as grey teeth stuck on the wall.
  `_drawWindows` inverts it: one dark strip, a lit sill, thin light mullions — three
  fills plus `n` thin rects, no per-pane path, and it reads as glass because glass is
  darker than its wall and the bright parts are the frames.
- **The lot is a BANK of spaces, and the whole bank is baked in `net.js`, once.**
  `LOT_SPACES = 3` on a single office, `LOT_SPACES_DBL = 7` on a double — a lot should
  read as a car park, not as one slot per colour. The bank fills the driveway exactly:
  a 45° space's side lines travel `BAY_OUT - BAY_IN = 0.41` along the lane between mouth
  and wall, so with `band` = the number of drive tiles the pitch is `(band - travel)/N`
  (0.5300 on a single, 0.5129 on a double) and the spaces sit at
  `-band/2 + travel/2 + pitch*(k+0.5)`. Which way each one leans is decided by *its own*
  distance to the nearest connection point, not by the part that owns it: a car can only
  arrive through a connection point, so a space leans away from the nearest one. Singles
  have one C and come out uniform; doubles have one at each end and come out `++++---`,
  a herringbone meeting in the middle. `_buildOffice` writes the bank once onto the
  primary as `d.lot = {tx, ty, cx, cy, pitch, spaces[]}` and gives each part the space
  nearest its door (`baySlot`, plus that space's own lean and centre in `bayTX/bayTY`,
  `bayCX/bayCY`). Renderer (`_drawBays`) and traffic (`_beginPark`) read the same
  numbers, so the markings and the parked car cannot disagree, and a new variant needs
  no new art code.
- **The 45° space is a fight for depth, and the car overhangs the lane, not the wall.**
  Markings run from `BAY_IN = 0.25` (the *edge of the lane's asphalt* — every variant's
  drive tiles are inside the footprint, so the lane has no kerb along its sides at all,
  only round its ends) out to `BAY_OUT = 0.66`, just short of the forecourt wall at 0.69.
  That is 0.41 of forecourt, and a 0.46×0.30 car turned 45° spans 0.54 corner to corner,
  so something must overhang: `BAY_MID = 0.42` puts the deepest corner on 0.689, right
  against the wall, and lets the tail hang 0.10 back over the lane — which is exactly
  what an angled bay looks like, and the car holds its place on the lane anyway while it
  is in there. Every side line is parameterised by its offset along the strip, running
  from `o - s*lead` at the mouth to `o + s*lead` at the wall (`lead = travel/2`), which
  is what lets one formula serve both leans; the bank is painted as **one** fill and
  **one** stroke, and a shared line is drawn once (draw the low edge always, the high
  edge only when it is the last space or the next one leans the other way) so no overlap
  double-darkens. `_drawBays` still clips to `_lotPath` as a safety net. Audited across
  all twelve variants: every space corner on the lot, no car corner across its own side
  line, car depth 0.151–0.689 against a wall at 0.695.
- **Parking is a real dwell in the sim, and a real turn.** `_beginPark`/`_parkStep`
  run a `PARK_DUR = 1.1 s` manoeuvre — 42% turning in, a beat stopped, 42% reversing
  out — during which the car takes no decisions and runs no dynamics but *keeps its
  place on the lane*. So parking genuinely costs the driveway a beat, which is what
  makes a double office's through route slow when both colours are busy. The path is a
  cubic Bézier with one handle along the lane and one along the space's 45° axis, so the
  car pulls away straight, swings, and arrives square in the space — the last stretch is
  a genuine drive up the bay, and reversing out is the same curve backwards, nose still
  forward. Both handles are short (`PARK_BOW = 0.40`, clamped to 0.10–0.20) because the
  space is very nearly *beside* the tile the car stops on: net travel along the lane is
  about zero while both ends of the curve point forward along it, so the path has to
  double back somewhere, and long handles turn that into a visible shunt. The heading is
  lerped from the lane's to the space's rather than taken from the curve's tangent, for
  the same reason — a tangent heading swivels where the path doubles back. 42/42 rather
  than the first cut's 30/30: at 30% the swing peaked near twice cruising speed and
  darted (measured 0.064 tiles/frame at 60 fps).
- **A car turns THROUGH a corner: the two lane lines are crossfaded across the node.**
  Traffic drives `LANE = 0.16` to the right of a road's centre line, so the line a car
  is on and the line it turns onto are *different lines* that merely cross at the node.
  Putting the car on the new line at the node made it step sideways as it turned — the
  snap on the inside corner. `_lanePose` instead extends both lines through the node and
  blends them over `±C` (`CORNER = 0.40`, capped at 0.45 of each link so two corners can
  never overlap) with a smoothstep of the *symmetric* parameter `(t/C + 1)/2`: position
  is continuous because `w = 0.5` exactly at the node, and tangent-continuous at both
  ends because `w' = 0` there. Right turns pass inside the corner, left turns sweep wide,
  a u-turn pivots through the node — all for free, from the geometry. The far half is
  built from the *approach plan* (`nnUX/nnOX/nnAng/nnC`, cut once per link entry) and the
  near half is only enabled when the departure matches the turn the plan called
  (`car.fillet === 1`), because the two halves have to come from the same pair of lines
  or they meet with a step of their own.
- **Pulling away from a standstill is the same trick from the other cause.** A car
  parked at a house gate or backed out of a lot space is sitting up to 0.4 of a tile off
  the lane line and pointed elsewhere, and a u-turn out of a driveway lands on a line a
  full `2*LANE` across the road. Mode 2 (`car.fillet === 2`) blends from the car's
  *actual* pose, along its actual heading, into the lane line over `MERGE = 0.55` (same
  0.45-of-link cap), so it merges out instead of teleporting. Arriving home is the
  mirror: `_beginHomePark` runs the park curve one way in `HOME_PARK_DUR = 0.5 s` and
  ends exactly on the pose `_parkAt` would have snapped to, choosing that pose's heading
  or its reverse — whichever the car is already closer to — so the swing is never more
  than a right angle. `_parkAt` itself stays the truth for spawns and lifts, which are
  teleports by design. Measured over 9,000 frames of a rig with 90° and 45° corners, a
  double office and a u-turn: worst per-frame position step 0.062 tiles, all of it
  inside a park manoeuvre or a merge, and no discontinuity anywhere (desktop Chrome).
- **The drag commits on tile entry, and defers only at a corner.** The moment the
  pointer enters a new tile, that step is laid — the road is never behind the
  finger. The one ambiguous case is an orthogonal step whose pointer is hugging a
  corner of the tile it just entered (within `CORNER = 0.3`): that step is *held*
  for one sample, because the next sample tells us whether the player meant one
  orthogonal step or the first half of a diagonal. Anything else — a clear
  orthogonal, a true diagonal, a lift — flushes the held step immediately, so a
  drag always ends on the tile the finger left.
- **Fast swipes are filled along the true line, not greedily.** When samples
  arrive more than one tile apart, `walkGap` walks the gap choosing, at each step,
  the neighbour with the smallest perpendicular distance to the segment from the
  anchor to the pointer. A greedy "step toward the target" walk back-loads every
  bend into a staircase at the end; this keeps the bends where the player drew
  them.
- **Infrastructure is layered over road, so removal only takes the top layer.**
  `infraAt` returns the topmost piece on a tile (light → motorway peg → bridge
  mouth → roundabout ring), `sim.tryEraseInfra` removes it and refunds the
  inventory item, and the edges underneath survive — one more tap clears those.
  There is no ghost stage for infrastructure: `linksFrom` stops offering the span
  at once, and a car already committed to it finishes the hop from geometry
  `_tryDepart` cached. A *drag* never erases infrastructure, only road, so
  sweeping the eraser across the map cannot cost a motorway you did not aim at.
- **Right/middle button erases without changing the tool.** `eraseBtn` is held
  separately from `tool` so the palette selection survives the gesture. Mouse
  only — a touch `pointerdown` always reports button 0 — so on the tablet the
  eraser tool remains the way in.
- **A ghost is the way home a car remembers.** Every car keeps `trail`, a
  ring-buffered stack (`MAX_TRAIL = 96`) of the undirected road edges it has driven
  since leaving its own front door: pushed as it goes, popped the moment it drives
  back along the same edge, cleared when it gets home. `_edgeHold` counts, per edge,
  how many cars remember it. An erase is refunded at once, but an edge that any car
  still remembers cannot leave the graph — it becomes a ghost, and it is passable for
  exactly the cars that hold it (`_resolveAt` and the Dijkstra consult
  `_holdsEdge(car, …)`; for everybody else the road does not exist). It dies when the
  last holder drives back over it or reaches home. That is what makes an erase behind
  a moving car safe: the reverse of a car's trail is by construction a connected walk
  home, so deleting a road can never cut one off. Ghosts therefore last a whole round
  trip — measured p50 6.5s, p90 13.3s, max 24.8s — instead of the fraction of a
  second they used to. Two valves bound that: `GHOST_GIVEUP = 14s` lifts a car wedged
  mid-hop on a ghost (no re-path can reach it — re-paths only happen at a node), and
  `LOST_GIVEUP = 8` failed attempts lifts a car that can no longer path home at all
  while still holding erased roads open. Redrawing over a ghost costs a tile like any
  other road, because the erase already paid one back.
- **A junction costs a car nothing to be cleared through; the corner costs it
  speed.** Velocity through a node is `1 − V_TURN × turnFraction` (× `V_ROUND` on a
  roundabout's tight ring, floored at `V_FLOOR`), with no term at all for "this is
  an intersection". The give-way already prices the only real cost of a junction,
  which is waiting; charging velocity as well made every crossroads a speed bump.
  The Dijkstra weights still carry `W_INTERSECTION`/`W_LIGHT`/`W_ROUND`, because
  routing *should* prefer the road that will not make it wait.
- **Ghost tiles via an injected occupancy callback.** `World` needs to know
  whether an edge is still needed; `Traffic` needs `World`. Rather than couple them,
  `sim` late-binds an `occupancyFn(x, y, dir)` into the world that forwards to
  `traffic.edgeInUse` — cars on the edge *plus* cars that remember it as their way
  home. That function is deliberately *direction-agnostic* —
  `(x,y,dir)` and `(x+DX[dir], y+DY[dir], OPP[dir])` are the same undirected
  edge — because a directional reading would teleport a car when the road under
  it was erased.
- **Pin claims go through a broker.** `sim` hands `traffic` a
  `{ claim(color), release(destId), collect(destId) }` object each update so two
  cars never chase the same pin. Every claim must be released or collected exactly
  once on every abort path; sim asserts `claimed <= pins`.
- **Camera reveal and map expansion are one mechanism.** Rather than a scripted
  intro zoom plus a separate growth system, the camera always eases toward the
  fit for `world.bounds` — so "start zoomed in and slowly zoom out" is just the
  initial 2.4× multiplier decaying, and every weekly ring extends the same reveal.
- **The camera leads the bounds by `weekProgress` rings, and that is why it never
  jumps.** `refitCamera` aims at the playable rect grown by a *fractional* number of
  rings (hence `Camera.fitForSize`, which does not round cols/rows) and is called every
  frame, so the one-per-week step became a continuous creep. The no-jump property is
  not a special case: at Monday 00:00 bounds grows by one ring while `weekProgress`
  wraps 1→0, so `bounds + progress rings` is the same rectangle before and after. The
  lead is a reparametrisation of the path the one-shot fit already took, not extra
  motion — which is why the `expand` event no longer touches the camera at all. Both
  the size *and* the centre come from the rect after clamping to the grid, so once an
  edge is reached the framing drifts honestly toward the open side instead of aiming
  off the world.
- **Cache tile sizes snap to a 4px ladder.** With `cam.tTs` now moving every frame,
  an unquantised `_pickCacheTs` would land on a new value at nearly every road edit and
  re-rasterise *both* offscreen layers each time. Quantising means an edit rebuilds
  only the cheap road layer, and the terrain layer is redrawn a handful of times a week.
  This is a tablet guard; the cost is at most 4px of crispness.
- **The office cadence is authored; the house rate is derived.** The user's spec puts
  a building on a 3–5 day clock and houses on demand, and where the two compete the
  office wins — house clocks hold station (bounded at 3 days) for an office still
  hunting for room. Both clocks live outside `planWeek` on purpose: a demand-driven
  rate that restarted every Monday would be a weekly schedule wearing a disguise.
- **Every demand signal is normalised per office.** A colour with four offices
  legitimately holds four times the queue. Without the division a mature colour reads
  as permanently desperate and spawns houses until the board is solid.
- **Landing is detected from the world, not from the plan entry.** Plan entries are
  pooled *by plan index*, so a remembered reference silently becomes somebody else's
  entry after `planWeek` clears and refills the plan. The office clock therefore
  compares `world.dests.length` against the length it recorded when it armed.
- **Repathing is amortised and node-aligned.** A car re-paths only when it needs a
  new target or `world.version` changed, and only at its next node — never
  mid-edge. Link objects from `linksFrom` are pooled and reused on the next call,
  so pathfinding allocates nothing steady-state.
- **A junction conflict is a crossing of two chords on a 16-slot circle.** With
  right-hand traffic, the lane a car *arrives* on is slot `2a-1` and the lane it
  *leaves* on is `2b+1` (`a = OPP[arrivalDir]`, `b = exitDir`) around the node's 8
  sides. Two movements conflict iff their chords properly cross — both pairs of
  endpoints interleave. Requiring *both* interleavings is what makes the answer
  symmetric, and symmetry is the whole point: an asymmetric test means the verdict
  depends on which car asks first, i.e. two cars enter the junction on a race in
  frame order. Up to `JCAP = 4` non-conflicting crossings are held per node in
  parallel `Int32Array`s, so a claim is a scan of four integers and allocates
  nothing.
- **Two cars merging into one exit lane is not a lock conflict.** Chords that
  merely *share* an endpoint pass one interleaving test and fail the other, so the
  rule lets both through — deliberately. The exit link's FIFO already refuses the
  second car for lack of room at its entrance, and that is the mechanism that
  should own a merge: modelling it as a junction conflict would stall a car that
  has somewhere legal to be.
- **The approach plan is cut once per link entry, not per frame.** `_planApproach`
  resolves the node *after* the one the car is driving toward and caches the exit
  speed cap, the next link's queue key, and the two side indices the yield test
  needs onto the car. The per-frame check is then nothing but typed-array reads and
  one Map lookup — a per-frame `linksFrom` walk for every car on the map is exactly
  what the module's no-steady-state-allocation contract forbids. The plan is
  re-cut only if `world.version` moved, so a road edit mid-approach costs one
  lookahead rather than being timed out.
- **Braking is solved, not eased.** `v = sqrt(target² + 2·SOFT_BRAKE·d)` against
  the distance to the far node gives the fastest speed from which the car can still
  make its target, so deceleration begins exactly late enough and never overshoots.
  Only a *give-way* measures `d` to the stop line; everything else — a turn, a
  junction it is cleared through, its own driveway — aims at the node itself, since
  a car braking to zero short of a node it must actually reach never gets there.
- **The roundabout ring is synthesised in `linksFrom`, not paved.** `addRoundabout`
  only sets flags; the ring hop out of each of the eight outer tiles is emitted by
  `linksFrom` (skipped when a live player edge already carries that exact hop, so
  the ring never doubles up, but emitted over a *ghost*, since a new traversal may
  not use one and the ring must never break). Two consequences fall out for free:
  the player pays nothing to pave a circle, and road they had already drawn under
  the island survives untouched in the edge mask — merely ignored — so erasing the
  roundabout hands the original crossroads straight back.
- **The island is a node with no links at all.** `linksFrom` returns 0 for the
  centre tile, which is what actually stops cars driving over the painted middle,
  and `canAddEdge` / `_pegOk` / `canAddBridge` / `canAddRoundabout` all refuse
  anything that would *terminate* there — a road under the island would be paid
  for, hidden, and never driven. `audit()` asserts the ring circulates (follow the
  flow from any tile and walk all eight back to the start) and that the island is
  undrivable, because a broken ring is a car trap.
- **The painted circle is the octagon the cars actually drive.** A true circle wide
  enough to reach the corner tiles (1.41 tiles out) has to spill outside the 3×3;
  one that fits leaves the corners driving on grass. So the ring is stroked as the
  eight-tile octagon with round joins, and the one-way arrows are placed on the
  four orthogonal tiles from the world's own `roundaboutFlowDir` — the sign can
  never contradict the traffic.
- **A reward is never offered for an item that cannot be placed.** `_rollOptions`
  gates the Roundabout on `_roundaboutFits()` — a scan of the revealed rect for one
  legal 3×3 — exactly as it already gated Bridge/Tunnel on `_mapHasObstacle()`. The
  measured reason: a fresh `normal` map's week-one rect is 11×8 = 88 tiles, and
  `canAddRoundabout` over it returns `{OOB 25, BUILDING 52, GEOMETRY 3, TERRAIN 8}`
  — three clear blocks, none of them on a junction, so *nothing* was placeable, and
  yet the roundabout was in the very first Sunday pool. Taking that card cost a
  week's reward for an item the player could not put down. The scan is cached on
  `world.version` and invalidated when bounds grow.
- **The one-off items paint their legal tiles, because a tablet has no cursor.**
  A hover preview answers "can I put it here?" only for someone with a mouse. So
  selecting Roundabout or Traffic Lights runs the same validator across the revealed
  rect and rings every legal tile in pulsing **dashed gold** — dashed because a
  *solid* gold ring already means "this lot wants cars", and gold rather than glow
  because these markers sit on asphalt, where a pale ring reads as more road
  furniture. The scan is keyed on `tool|version|wallet|bounds`, so it re-runs on a
  change and never per frame: 0.01 ms for 304 tiles, ~0.2 ms for the full 1120-tile
  grid (desktop Chrome — not measured on the tablet).
- **Gridlock is a legitimate failure, not a bug.** Linear queueing without
  overtaking means an over-subscribed network jams. The `gridlock` metric (0..1)
  is exposed to the HUD and audio so the player can read the cause.
- **Positions in tile units.** Cars expose float `x`/`y` in tile units (centre is
  `x+0.5`, `y+0.5`), never pixels, so the sim is resolution-independent and the
  shell owns all scaling.
- **Sim pushes events, shell reacts.** The sim accumulates typed events and the
  shell calls `drainEvents()` once per frame, keeping audio and particles entirely
  in the shell.
- **A drag stays silent; a deliberate tap owes an answer.** Dragging over an existing
  edge, a building or water is normal play — a silent `false`, still previewed red —
  because one drag crosses dozens of tiles and would machine-gun the feedback. Only
  an empty inventory earns a `deny` event. But a *single tap* placing a roundabout or
  a traffic light is one considered act, so a refusal there flashes the tile red,
  plays `deny`, and pops the reason code as four words ("Needs a junction", "Too near
  a building"). `_tryInfra` still returns a bare silent `false`, so the shell restates
  net.js's reason codes locally and asks the validator itself — `index.html`
  deliberately never imports `net.js`.
- **A refused diagonal becomes the L round the outside.** `stepTo` advances the drag
  anchor whether or not the edge was laid, so a bare refusal mid-drag leaves a hole
  and reads as the input being flaky. When `canAddEdge` refuses a diagonal on geometry
  grounds (an `R_BUILDING` or `R_TERRAIN` corner-cut, or an `R_CROSS` scissor),
  `applyStep` lays the two
  orthogonal legs instead — the finger asked to get from here to there, and going
  round is what it meant. Both legs must be legal and the wallet must cover both, or
  nothing is laid and it denies once: half an L is road hanging in the air.
- **Fixed-scale offscreen layers.** Background and road layers are cached to
  offscreen canvases at a fixed scale and blitted through the camera transform, so
  a continuously zooming camera never triggers a layer repaint.
- **Seeded PRNG.** `mulberry32` throughout, so a run is reproducible for testing.

## Memory

- **2026-08-27 session — profiles, one drive, no lights/roundabouts, a 7-week reveal,
  slower pins, office-style houses.** A batch of tuning + UX + visual changes:
  - **Traffic lights and roundabouts removed from play.** Taken out of the reward pool
    (`sim._rollOptions`), the tool palette + keyboard + legend (`index.html`), and the
    glyphs. Player-facing removal only: the net/traffic implementations (ring synthesis,
    light phases, the give-way branches that read `hasLight`/`inRoundabout`) are left
    dormant and simply never fire, so the deep-dive design notes below still describe
    live-but-unreachable code. A full code rip-out was the explicitly-rejected option.
  - **Camera is a linear 7-week reveal of the whole map, not a per-ring follow.** It
    used to aim at `bounds + weekProgress rings` (reaching the full 40×28 only ~week 15)
    and, mid-session, at the building centroid — which made it jump on every spawn. Now
    tile size and centre both interpolate **linearly** from the opening rect to the full
    playable box over `REVEAL_WEEKS = 7`, as pure functions of time. The old opening 2.4×
    crop was dropped.
  - **The buildable rect expands continuously to match.** `sim._expand()` moved off the
    Monday tick to every frame, growing `bounds` toward `lerp(startBounds → maxBounds)`
    via a new grow-only `world.expandTo(...)` — so newly-uncovered tiles become playable
    as the zoom reveals them, full by end of week 7. `REVEAL_WEEKS` is exported from
    `sim.js` and imported by the shell so camera and expansion can't drift.
  - **No more darkened boundary.** The off-map wash (`COL.offmap`) baked onto boundary
    cells — in *both* the terrain cache and the surround bitmap, which is why an earlier
    "un-dim the surround" did nothing — was removed; the playable-bounds frame and the
    dashed future-extent rect are gone; a land base is painted under everything so beyond
    the playable rect reads as scenery. The plot grid is no longer baked in — it's drawn
    live (`_drawBuildGrid`) only while a tool is being dragged.
  - **Diagonal (corner) water/mountain tiles are true diagonals.** Corner cells used to
    fill the whole tile + a shore wedge; now `_paintTerrainInto` fills only the shape's
    corner half with terrain, leaves the other half green, and draws the shoreline along
    the hypotenuse (`cornerDiagInto`), texture clipped to the terrain triangle. `S_NW`
    etc. taken to mean terrain-in-that-corner (matches the old `OPP_CORNER` shore logic).
  - **Pacing:** start on **one** colour (`START_COLORS = 1`), ramp to **5**
    (`MAX_COLORS`) over ~11–12 weeks (`colorEvery` 2.5 Normal / 2.75 Easy); office
    cadence **4–6** days (was 3–5); relief offices are demand-gated (`RELIEF_SPEED = 2.2`)
    so the early game stops stacking same-colour offices the board never asked for. A
    global **`PIN_RATE = 0.8`** slows every pin interval to 80% ("pins too fast").
  - **Houses redrawn to match the square office**, after two rejected takes (a gradient
    cottage, then a two-shade peaked-roof version): the office box (body + darker facade
    band + `_drawWindows` glazing + `_drawEntrance` door + extrusion + keyline), **no
    roof**, its flat top split vertically (left `c.fill`, right `c.dark`) and skewed up to
    a shallow centre peak. Lesson: when the user says "copy the office," reuse the office
    helpers verbatim rather than inventing a parallel look.
  - **Houses have a single free drive.** A house may hold only one road edge; dragging a
    new one replaces the old (ghosting via the existing trail mechanic if a car needs it).
    The drive is free — `sim.tryRoad`/`tryErase` skip the wallet when `world.touchesHouse`
    is true, so it neither costs nor refunds a tile (no farming). Cars on a house tile now
    always draw *under* the house (the pips carry the waiting-count cue). Consequence: a
    house is now a strict endpoint — you can no longer route a road *through* a house tile.
  - **Menu: Ezra/Caleb are profiles, then a city select.** Names no longer read as
    Easy/Normal (the tuning still rides on the profile). Clicking a name opens a level
    panel built from `maps.json` — Los Angeles playable, "Coming soon" placeholders after
    — and best scores are now **per city × profile** (`best[levelKey][diff]`); old flat
    `best.easy/normal` saves are harmlessly ignored.
- **v1 built the game backwards and was replaced.** The first version put the
  failure clock on the *houses* as patience meters, put pins on houses, used
  4-directional tile-occupancy roads, omitted congestion entirely, and offered
  "one more car" as a reward. All five are now inverted. The v1 lesson that
  survived: congestion was left out on the theory a 7-year-old would find it
  punishing, but the right place for forgiveness turned out to be the difficulty
  table, not a missing mechanic.
- **Drawing a crossroads sounded like an error.** v1's `place()` emitted `deny`
  whenever placement failed, which includes tiles that already hold a road — so
  making a junction fired a burst of 170 Hz error buzzes for a legal move (~26k
  spurious events per soak run). Fixed by narrowing `deny` to an empty road
  budget; the rule is now an explicit contract requirement and was re-verified in
  v2 with an exhaustive ~11,260-case sweep.
- **Delivery popup showed the running total.** The event's `score` is cumulative
  (the HUD needs it) but the shell floated it as points earned, so the 14th trip
  read "+14". The payload now carries an additive `gain` field.
- **The opening board could start single-coloured.** The first house would squat
  the last legal 3×2 destination footprint on the cramped 11×8 starting bounds.
  Fixed with a `'seed'` plan entry that claims every starting destination before
  any house is placed.
- **Colour introduction could stall forever.** Buildings never bulldoze player
  road, so a road-heavy map starves 3×2 footprints — and a strict
  `(week-1) % colorEvery === 0` cadence meant a colour missed for lack of space
  never came back. Fixed with a `due`-count top-up capped at 2 catch-ups per week;
  a deliberately carpet-bombed map went from 3 colours to 7. A house-density cap
  was added at the same time after finding houses reaching ~20% map coverage.
- **Earlier v1 shell defects, all fixed:** corner buttons stayed live behind the
  reward card, the week jingle played twice, portrait patience pips rendered as an
  unreadable 1.4px smudge, the shell hardcoded the grid instead of reading it off
  the sim, and idle cars were invisible (parked exactly on their building).
- **Rebuilding over your own ghost was billed twice.** Drawing a road back over an
  un-refunded ghost charged a second tile, and `_tickGhosts` then saw `!isGhost`
  and paid one back — so the wallet dipped and recovered with no visible cause, and
  fired a `refund` event (with its particle) for a tile that was never refunded.
  A stress run with occupancy forced on half the map showed the road wallet was
  nonetheless *conserved* both before and after the fix, across 1551 frames and 95
  revivals — so the originally-reported symptom, a free road, did not reproduce.
  Rebuilding over your own ghost is now free and works with an empty wallet, since
  the player never got that tile back; revivals in the stress run went 3 → 95.
- **The ghost ledger was not undirected-safe.** It keyed entries by the raw
  `(x, y, dir)` the erase was addressed with, but an edge is undirected — the same
  edge named from its other endpoint is `(x+DX, y+DY, OPP[dir])`. Now canonicalised
  to the endpoint whose dir is 0..3, the same fold `traffic.carsOnEdge` uses. No
  live double-refund existed (`removeEdge` rejects an already-ghost edge) but the
  revive check in `tryRoad` needs the canonical key to recognise its own ghost.
- **A terminal state hung on a transient event.** The shell entered its game-over
  screen only from the `gameover` event, so a dropped event would leave the board
  frozen in `play` with no game-over screen and no restart path — the worst
  possible failure for a 7-year-old. `sim.gameOver` is now also checked as a
  backstop each frame. (`_push` drops the *oldest* events on overflow, so the event
  is not actually droppable today; this is belt-and-braces on a terminal state.)
- **The "future map extent" hint rendered as two stray dashed lines.** The dashed
  rect showing the 40×28 maximum is several times wider than the viewport at the
  opening zoom, so only its top and bottom edges were on screen, with no left or
  right to tie them to a shape. It is now drawn only when the whole rect fits,
  which is exactly when it reads as a frame — mid-game, once the camera has eased
  out far enough.
- **`net.js` now declares `light.greenAxis`.** `render.js` was polling four possible
  field names and falling back to a cosmetic 6s alternation, so the drawn light
  could contradict the light the cars were obeying. World seeds the field, Traffic
  owns the phase, render draws whatever it says.
- **Diagonal drags drew staircases.** Placement was a Bresenham walk re-run only
  when the pointer crossed into a new *tile*, so a smooth 45° drag always arrived
  one tile at a time and got laid as alternating orthogonal steps — diagonals were
  reachable only by tapping single tiles. Replaced with an anchor-based stepper fed
  the continuous pointer position. Measured in desktop Chrome at 760×900 DPR 2 (not
  the tablet): an exact 45° drag now lays 5 diagonals / 0 orthogonals with zero
  rejected attempts, a dead-horizontal drag 5 orthogonals / 0 diagonals, and a
  shallow ~14° drag 4 orthogonals plus the one diagonal where it finally changes
  row.
- **The first join attempt painted a road on the roof.** The join was drawn as
  casing+asphalt aprons *after* the buildings, which read as tarmac on top of the
  house. Deleted entirely: the cached road layer already runs edges to the gate
  tile's centre, and it is blitted before the buildings, so the join is what the
  building *covers*. Only the dashed hint ring on an unconnected gate is drawn
  after.
- **A car crossing the gate→door link drove over the roof.** Cars were the last
  thing drawn, so for ~0.3s per trip a car appeared on top of the building it was
  entering. `_drawCars` now runs twice, once before the buildings for cars whose
  tile is a footprint and whose state is not `idle`, once after for everyone else.
  Parked cars are deliberately excluded — putting them under would resurrect the
  v1 "idle cars are invisible" bug. Cost is one extra `buildingAt` per car per
  frame, which is a typed-array read plus a Map hit.
- **Known caveat: the URL needs its trailing slash.** As a multi-file game,
  `import './sim.js'` resolves relative to the page path. A server that
  301-redirects `games/roadways/index.html` → `games/roadways` makes the import
  resolve one level too high and 404, and nothing boots. The hub card links to
  `games/roadways/` and GitHub Pages does not issue that redirect, so real play is
  unaffected; a boot watchdog shows a load error rather than a blank screen. Also
  noted in `docs/deployment.md`.
- **No perf number here was measured on the boys' tablet.** The world/generator
  lane measured a 0.936ms worst frame, the sim lane 0.0005ms per update with 3.3KB
  of allocation across 120k frames, the traffic lane 0.006–0.027ms per frame at
  40–240 cars with zero steady-state allocation outside Dijkstra (~32 B/call,
  capped at 3–4 calls/frame), and the render lane counted canvas operations only —
  all of it Node, stubbed canvas, or desktop Chrome at 500×760 DPR 2. None of it
  proves anything about the target device. What does carry over is structural: no
  steady-state allocation means no GC pauses, no per-frame sort, and pathfinding is
  amortised and never taken mid-edge. The open question remains the full-surface
  blits at DPR 2 under a continuously easing camera.
- **The browser smoke test that actually mattered.** A real 7-week run at 500×760
  reached 300 trips: one ring of expansion per week (11×8 → 23×20), colours 2 → 4
  on the Easy cadence, 3 of 6 destinations upgraded to circles, 38 cars across 21
  houses (never more than 2 each), `world.audit()` clean, and the camera easing
  102 → 42.5 px/tile over ~5s from the 2.4× opening crop. Headless, the four
  DOM-free modules held every cross-lane invariant over 12 seed/difficulty
  combinations: road wallet conserved, ghost ledger matched the world's ghost set,
  `dest.claimed <= dest.pins`, `carsOnEdge` symmetric from either endpoint, no NaN
  poses, no house over its 2-car cap.
- **The gate model was verified headlessly before it was looked at.** A BFS
  autoplayer over the real net/spawn/traffic/sim modules across 12
  seed/difficulty runs: 1,614 trips, 256 cars, 211 connected gates, 0 stranded
  houses, and 133 orthogonal + 187 diagonal joins landing on gates, with
  `gateOwner` object identity, no car node inside a foreign footprint, and every
  earlier invariant intact. Two of the "failures" that run reported were the
  harness's own: it compared `car.dest`/`car.home` when cars carry `destId`/
  `homeId`, and it flagged the door tile, which is an interior non-gate tile *by
  design* and where a car legitimately stands after collecting.
- **The drag lagged the finger because of a dead zone at the anchor.** The stepper
  refused to move until the pointer was a *full tile* from the anchor's centre
  (`if (hi < 1) break;`), so the road trailed the finger by up to a tile and never
  reached the tile the drag ended on — a measured 13–18 pointer tiles produced 8
  laid edges. Worse, it then stepped greedily toward the pointer, which pushed
  every bend to the end of the stroke. Replaced with commit-on-tile-entry, a
  one-sample corner deferral, and `walkGap`'s perpendicular-distance fill. After
  the rewrite, desktop Chrome 760×900 DPR 2 (*not* the tablet): 45° → 9 pointer
  tiles / 9 road tiles / 8 diagonal edges; 17° shallow → a continuous 8-connected
  line; a straight drag with 0.25-tile tremor → 11/11 dead straight, 0 accidental
  diagonals; a fast swipe with only 6 samples → 11 continuous tiles with the gaps
  filled. Every trial started and ended on the finger with 0 refused edges.
- **Infrastructure had no removal path at all.** `net.js` shipped `addMotorway`/
  `addBridge`/`addLight`/`addRoundabout` with no inverse, so a misplaced motorway
  was permanent and its item lost. Added `infraAt` + the four `remove*` methods,
  each releasing its tile flags only when no *other* span still claims the tile
  (two motorways can share a peg tile), plus `sim.tryEraseInfra` for the refund.
  `audit()` grew the matching invariants: orphaned `F_PEG`/`F_BRIDGE_END`/
  `F_LIGHT`, `F_ROUND` vs `_roundAt` disagreement, and every live piece still
  owning its flags.
- **`_roundAt` stores index+1, so removal had to reindex.** Roundabout lookup is a
  per-tile `_roundAt` holding the array index plus one (so 0 means "none"). A
  plain `splice` left every entry after the hole pointing one slot too high — the
  second roundabout on the map resolved to the wrong object or to nothing.
  `removeRoundabout` now rewrites `_roundAt` for the tail. Verified: after
  removing the first of two, the second still resolves with `flowDir` 4.
- **Removing infrastructure under a moving car had to be safe.** There is no ghost
  stage, so a car mid-hop across a motorway span would have lost its geometry.
  `_tryDepart` caches the link's endpoints when the car commits, and
  `_lightByNode` is rebuilt whenever `world.version` moves, so a removed light
  cannot leave a stale signal reference behind.
- **Junction friction was charged at the moment of departure, so cars never slowed
  down for a junction.** `V_INTERSECTION`/`V_ROUND`/`V_TURN` were applied to the
  link a car was *entering*, which meant it drove the whole previous edge at full
  cruise and changed speed on the tile centre. Measured in a full-lattice stress rig
  (desktop Chrome, *not* the tablet): mean arrival speed was **0.992–0.997 of
  cruise, with 96–97.6% of arrivals at full speed**. With the approach planner the
  same rig gives **mean 0.288–0.311 and 0% at full speed**, trips over 14s went
  7–8 (new) vs 5–8 (old), and frames with at least one car giving way went ~63 →
  ~1537 of ~1681. Throughput was not harmed by making cars cautious.
- **The old junction rule was a full mutex, which is not how a crossroads works.**
  One car at a time per node meant northbound through-traffic waited on southbound
  through-traffic on the opposite side of the road. Under the chord test 896 of
  4096 movement pairs (21.9%) must yield, against 100% for a mutex.
- **The first conflict test was not symmetric, and that is a frame-order race.**
  It checked interleaving one way only, so `N→S` vs `E→S` answered "yields" if one
  car asked and "both go" if the other did. Fixed by requiring both interleavings;
  a 4096-pair sweep against an independent re-implementation of the rule now
  reports 0 asymmetric pairs. Two of the test's own expectations were wrong at the
  same time — a shared *exit* slot is a merge, not a crossing.
- **A plain give-way timeout parked waiting cars on the node centre.** `YIELD_HOLD`
  started as a short timer that simply gave up and let the car proceed, and the
  stop line was only 0.14 tiles from the node. A diagnostic grouping overlapping
  sprite pairs by signature found the dominant case (2788 samples over 8s) was a
  car with `holdT` maxed sitting exactly on an intersection while another departed
  it. A car sprite is 0.46 × 0.30 tiles, so `STOP_LINE` went to 0.42 — the waiting
  car now stops behind the traffic it is giving way to instead of on top of it —
  `YIELD_HOLD` rose to 9.0 to mirror `STUCK_REPATH`, and staleness is handled by
  re-cutting the plan on `world.version` rather than by expiry.
- **Giving way was being painted as a traffic jam.** `car.stuck` drives both
  render's flashing red danger halo and the HUD's gridlock heat glow, and it was set
  the instant a car could not move — so with approach braking every momentary
  give-way lit the map up and pushed the gridlock read to 0.51 with *unchanged*
  throughput. `stuckT` still accumulates from frame one (the re-path and abort
  valves need it) but `stuck` only latches after `STUCK_SOFT = 1.25s`. The reading
  fell to 0.04–0.05, with the halo on ~5–6% of frames.
- **Junction verification, and where it was measured.** All of it desktop Chrome
  against a synthetic full-lattice rig where *every* tile is a 4-way junction (a
  real map is far sparser) — **not** the tablet. 15/15 named conflict cases,
  `JCAP`/release/self-claim correct, 0 asymmetric pairs of 4096. In-browser A/B by
  monkey-patching `_planApproach`/`_mustYield` back to the old behaviour on the live
  sim: 0 illegal concurrent pairs checked every frame against an independent oracle,
  max 2 concurrent crossings observed, `world.audit()` clean after every run, no
  wedged cars. Cost of the whole feature: `traffic.update` with 24 cars went
  0.014ms → 0.020ms mean (worst 0.20ms either way) — about +6µs on a 16.7ms budget.
  Sprite overlap in that all-junction rig rose from 0.48–0.59% to 0.74–0.8% of
  car-pair samples.
- **Cars froze half a tile short of their own front door, flashing red.** The
  approach planner set `exitCap = 0` for the last hop of a trip home — "coming home
  it stops, so brake all the way down" — but `_move` applied the give-way line to
  *any* zero target. So the car solved its deceleration against a point 0.42 tiles
  before the node, halted there, never reached `linkLen`, never arrived, and after
  1.25s latched `stuck` and lit the red jam halo. Nothing could recover it either:
  `STUCK_ABORT` sets `needPath`, but a re-path is only ever taken at a node, and the
  car was permanently mid-link. Two fixes: `_move` now applies `STOP_LINE` only when
  the car is actually *giving way* (a turn, a junction it is allowed through, or its
  own driveway aims at the node itself), and the last hop targets a crawl —
  `ARRIVE_HOME`/`ARRIVE_DEST` — rather than a dead stop, so the node it is braking
  for is one it can still reach. Reproduced and fixed in live play, desktop Chrome,
  *not* the tablet: with the old arithmetic restored at runtime, all 3 cars sat at
  `remain = 0.42` in state `toHome` for 5489 stuck-frames of a 60s run, gridlock
  0.999, and the score stopped dead at 3 (one delivery per car — every car froze on
  its first trip home). Fixed: 13 trips, **0** stuck frames, gridlock 0,
  `world.audit()` clean. `rw.startGame()` *replaces* the Sim,
  so an A/B that captured `rw.sim` beforehand instrumented an orphan the frame loop
  never touched (0 arrivals, byte-identical numbers in both phases). And
  `sim.tryRoad` returns false while `sim.pendingChoice` is set, so any long test
  loop must call `sim.choose(0)` each frame or every road placement is refused from
  the first Sunday onward. Also: the road wallet is `inventory.roads`, not
  `inventory.road`.
- **Verified by driving real pointer events, not by calling the sim.** The final
  check BFS-routed each house to its destination's first gate and drove genuine
  pointer drags along that route at 5 samples per tile: 2/2 houses connected, 2
  destination gates wired, 25s of live play → score 5, 2 cars, `world.audit()`
  clean, road wallet consistent. Right-click was checked the same way: a left-drag
  laid 6 tiles, a right-drag erased all 6 with the *road* tool still selected and
  the wallet restored; a right-click on a degree-8 junction took it to degree 0; a
  right-click on a motorway peg refunded it (inventory 1→2) leaving the degree-8
  road intact. Desktop Chrome, not the tablet.
- **Roundabouts were pure decoration — three separate bugs stacked.** They could be
  placed, refunded and drawn, and did nothing else. (i) No ring existed:
  `addRoundabout` set flags only, so `linksFrom` on a corner tile of the 3×3
  returned `[]` — the four arms of the junction were not joined to each other at
  all, and a roundabout on the only route was a wall. (ii) `linksFrom` on the
  centre still emitted all four arms, so every car drove straight over the painted
  island — the whole 3×3 was, functionally, the crossroads it replaced. (iii)
  `ROUND_FLOW` circulated *clockwise*, which fights the right-hand lane offset
  (`ox = -(vy/h)·LANE`): a clockwise car's lane offset falls on the island side, so
  the sprite would have hugged the middle and traffic would have run against the
  arrows. Fixed by synthesising the ring in `linksFrom`, making the centre a dead
  island nothing may terminate on, flipping the flow to counter-clockwise, adding
  the ring-circulates and island-undrivable invariants to `audit()`, and repainting
  the ring as the octagon the cars actually drive. Verified in live play, desktop
  Chrome (synthetic autoplayer, *not* the tablet): a roundabout dropped on a tile
  already on a live car's route, 75s → 25 trips, **1755** ring hops with **0**
  against the flow, all **8** ring tiles driven, **0** links or sprite-frames
  touching the island, 0 stuck frames, gridlock 0, `world.audit()` clean.
- **A car could be trapped on the island forever.** A car mid-hop *into* the centre
  when the roundabout lands finishes that hop from the geometry `_tryDepart` cached,
  arrives on a node that now emits no links at all, fails to path anywhere, and
  parks. `_think`'s "idle away from home" branch then just re-waits 1.2s and tries
  again — forever — so it sat on the grass showing a stale link, permanently. The
  valve is `_stranded(car)`: a node with **zero** outgoing links can never be driven
  out of (only reachable when the map changed under the car — an erase, or an island
  landing on it), so the car is lifted home and parked instead of camping. A/B in
  live play, desktop Chrome: with the valve stubbed out, the victim spent 1787 of
  1800 frames on the island and was still sitting there `idle`; with it, 151 frames
  (~2.5s, the one park-wait it had already set) and then home and back to work.
- **A roundabout on a spur proves nothing.** Two earlier attempts to observe ring
  traffic measured zero ring frames: placing one at every degree≥3 tile found *no*
  legal site (buildings crowd the 3×3), and a hand-built crossroads got its
  roundabout but the BFS legs had merged elsewhere, leaving it bypassed. The test
  that works is to place it on a tile that is already in a live car's `path` — and,
  for the island trap specifically, on the tile a car is mid-hop *into*.
- **Every junction was a speed bump, because the friction was a blanket multiplier.**
  Arriving anywhere with a degree > 2 cost `V_INTERSECTION = 0.34` of cruise speed
  *before* the turn was even considered, and `V_TURN = 0.72 × turnFraction` came off
  on top — so a car crossing a crossroads dead straight, with nobody in its way, was
  held to about a third of its speed, and almost any turn hit the `V_FLOOR = 0.16`
  clamp. That is not how a junction works: the cost of a junction is *waiting* for a
  conflicting movement, which the give-way already charges. The model is now
  corner-only — `keep = 1 − V_TURN(0.6) × turnFraction`, × `V_ROUND(0.8)` on a
  roundabout ring, floored at `V_FLOOR` — with no term for "this is an
  intersection". Measured on a synthetic lattice in live play (desktop Chrome,
  **not** the tablet), sampling every car's speed on the frame it reaches a node,
  as a fraction of cruise: junction straight-through **0.997 mean, 99% at full
  speed** (n=735) where it used to be ~0.29; junction 45° 0.867 (n=151); junction
  90° 0.715 (n=280); roundabout straight 0.815 and 90° 0.523 (n=222/148);
  non-junction straight 1.000, 100% at full speed. Give-way was not weakened —
  977 frames of cars held at a give-way line in a 300s run, 4 of 5 cars. Anything
  entering a *driveway* still reads ~0.575: that is `KIND_SPEED[K_DRIVE] = 0.55`,
  the driveway's own limit, not junction friction — an early measurement that
  bucketed by node type alone made those samples look like a non-junction slowdown.
- **Ghost roads were a deferred-refund ledger, and the refund is the part that did
  not work.** The tile only came back when the last car vacated, which made the
  wallet depend on traffic the player cannot see: over an 87s instrumented run all
  111 erases of an occupied edge refunded **0** at the moment of the erase, and one
  ghost held a tile for **33 seconds** with a car wedged on it. Redrawing over your
  own ghost had to be free to keep the books straight, which needed a canonically
  keyed ledger (`_ghosts`, `_tickGhosts`, `_trackGhost`/`_untrackGhost`) and a
  78s `STUCK_GIVEUP` valve whose only job was to stop counting a wedged car so the
  refund could land. All of that is gone. The erase refunds immediately; the ghost
  exists purely so a car mid-hop keeps the road under it, and dies when the last car
  steps off; redrawing over one costs a tile like any other road. A car wedged
  mid-hop on a ghost is now lifted home after `GHOST_GIVEUP = 14s` — the only case
  a re-path cannot reach, since re-paths happen only at nodes. The two older ghost
  entries above (double-billed rebuild, undirected-unsafe ledger) are history: that
  ledger no longer exists. Verified in live play, desktop Chrome, **not** the
  tablet: a 600s / 10-week run with a synthetic autoplayer erasing a road out from
  under a car every 12 frames — 2813 ghosts created, 2812 released, lifetimes
  min 0.03s / median 0.42s / p95 0.72s / **max 6.87s**, road wallet exactly equal to
  its predicted value from spend and refund counts, `world.audit()` clean at every
  30s checkpoint, 0 cars left stuck on a ghost. Directed checks: erasing the same
  edge twice (and from the other endpoint) refunds exactly **once**; redrawing over
  a ghost charges exactly one tile and revives it live; the `GHOST_GIVEUP` lift
  moves a wedged car from mid-hop to its own door in one frame, releases the edge
  from the graph, and hands its pin back (`dest.claimed` 7 → 6, `releases` +1).
  **This deliberately supersedes the original spec line "a road segment still
  carrying cars becomes a translucent ghost — still traversable, not refunded, until
  the last car vacates".** The ghost is unchanged; the "not refunded" is not.
- **A ghost that only covered the current hop did not do the job it exists for.**
  The rule above — ghost while a car is *physically on* the edge — protects a car for
  the fraction of a second it spends on one tile, and nothing else. Erase any road
  further back along a car's route and the edge was simply deleted: the car re-paths
  at the next node, and if the erase disconnected it from home the re-path fails and
  it strands (or gets teleported home by a valve). That is the "ghost roads don't
  work" complaint, and the fix is to protect the *route*, not the tile. Each car now
  remembers the roads it has driven since leaving home (`car.trail`, a ring-buffered
  stack of undirected edge slots, `MAX_TRAIL = 96`), `_edgeHold` refcounts those
  memories per edge, and `traffic.edgeInUse` (occupancy + holds) is what `removeEdge`
  asks. So an erase anywhere behind a car ghosts instead of deleting, the ghost is
  passable for the cars that remember it and invisible to everyone else
  (`_holdsEdge` in `_resolveAt` and in the Dijkstra), and it leaves the map when the
  last holder drives back over it or gets home. Because the reverse of a trail is a
  connected walk home by construction, an erase can no longer cut a car off. Verified
  in live play, desktop Chrome, **not** the tablet: erasing a road 5 hops behind a
  car heading home returned `'ghost'` with **zero cars on the edge** (`edgeInUse` 1,
  from the memory alone), refunded +1 immediately, and the car then drove back over
  that road at frame 177 and reached home at frame 230, where the ghost released —
  never before. A stranger car was refused the same edge (`_resolveAt` false) while
  its owner was allowed (true). Across 6 runs / 377s with a road a car remembered
  erased every 12 frames and never redrawn: 219 ghosts, 211 released via
  `releaseGhost`, lifetimes p50 **6.5s**, p90 13.3s, p99 21.4s, max 24.8s (a round
  trip, as intended — the old model's 0.42s median was the tell that it was
  protecting nothing), 0 lifts needed, 0 ghosts left once cars were home, and both
  `_edgeHold` and `_edgeOcc` audited to exactly zero. Consequence worth knowing: a
  ghost still holds its tiles against a *new building* for its whole life (up to
  ~25s), because `canPlaceHouse`/`canPlaceDest` test the raw edge mask. That is kept
  on purpose — nothing should be built on a tile a car is still driving through — but
  it does mean an erase briefly blocks spawns where it used to not.
- **A single waiting person was drawn as big as six.** `_drawPins` fitted the pip
  radius to the *current* count, so one pin was blown up to fill the whole right-hand
  side of the footprint and two looked barely different from one — the count stopped
  reading as a count. The grid is now fitted to `d.cap` and every pip drawn at that
  size whatever the count is, so a queue of one is one small pip and a box that looks
  full is full. Over capacity (or over 9, or below `SMALL_TS`) still degrades to one
  glyph plus a numeral.
- **v2.7 moved offices from corner gates to connection points + driveways.** The
  spec changed the anatomy: a `C` connection point outside the footprint is the
  only road frontage, a `D` driveway strip is public through-road, and each colour
  has a parking bay on it. Twelve variants exist (`1a`–`1d` 2×3, `2a`–`2d` 3×2,
  `3a`/`3b` 3×4 and `3c`/`3d` 4×3 doubles) — the extras beyond the four shapes the
  spec drew are mirrors, so an office is not always forced to face the same way.
  Doubles are gated to day 5+. Interpretation calls worth knowing: "45 deg angle"
  was first read as *angled parking bays* — the pose, not the road geometry — and
  later re-read as what the spec actually wanted, a car turning out of the lane and
  driving into its space (see the park manoeuvre in the design decisions); a `C` tile
  does not count towards the footprint but must be pristine, so it is excluded
  from the 1-tile buffer yet no house may spawn on it.
- **`_colorDests` was incremented twice per office.** `_placeDest` counted every
  part of an office and all three of its callers counted again, so one double
  office read as up to four destinations — which told `_pickDestColor` a colour was
  well served when it had nowhere to drive. Fixed by giving `_countDest(d)` sole
  ownership of the tally and deleting the caller increments.
- **A double office could exclude the colour that asked for it.** The partner
  search picked the two neediest colours, and a brand-new colour has
  `_colorDests === 0`, so an `'intro'` entry could advance `colorsUnlocked` while
  handing the building to two *other* colours — unlocking a colour with no
  destination at all. The requested colour now always takes one half.
- **The double-office ramp was unbounded.** `base + day * 0.01` reaches 1.0 by day
  65, so every late office became a double: measured 13 doubles to 4 singles by
  week 16. Capped at `DOUBLE_PROB_MAX = 0.55` and re-based on `day - DOUBLE_DAY`;
  re-measured at 6–10 doubles per 16-week run. Doubles are meant to be a treat.
- **The weekly road grant treated the opening allowance as a shortfall.**
  `stats.roadsGranted` started at 0 while `roadsSpent` counted the starting tiles,
  so week 1 always looked 30–40 tiles short and every grant took the maximum
  top-up forever. Seeded with `d.startRoads`. Separately, erasing a road refunded
  the tile without un-spending it, so draw-erase-redraw farmed a permanent top-up;
  `tryErase` now decrements `roadsSpent` (floored at 0).
- **The countdown ring swallowed a whole double office.** `_drawTimers` sized and
  centred on the footprint, which on a 3×4 double covers both colours and the
  shared driveway — hiding the very pins it warns about. It now uses `d.half`. The
  same footprint-vs-half slip was fixed in the shell's game-over ring and in
  `openingCentre`, which weighed a double office twice and dragged the framing.
- **A double office read as two shops touching.** Each half drew its own inset and
  white outline. Now the halves share one silhouette: `unionOfHalves(d)` gives the
  bounding box and `_halfSlice` snaps each half's edges to it, so the two fill the
  shape edge to edge under one clip, one seam line and one keyline.
- **Cars were invisible in driveways.** `_drawCars` sent any car standing on a
  building tile to the under-the-roof pass, which predates the buildings layer —
  correct for a house, fatal for a driveway, because `_drawDests` paints the
  driveway on top. A car parked in its own bay simply vanished. The under pass is
  now house tiles only.
- **Through traffic snapped sideways over other cars' bays.** A double office's
  driveway is a public route and its two bays sit in the middle of it, so every
  short-cutting car crossed both and posed at 45°. A speed gate was the wrong fix
  and was measured to be dead code: across 1978 samples a car on a bay never drops
  below 0.867 tiles/s, because collection is instantaneous, so a "stopped in the
  bay" rule would never have fired. `car.destId` is the real signal — it holds the
  bay's part id inbound and is cleared to −1 on collection. Verified in live play,
  desktop Chrome, **not** the tablet: 91 samples of a car in its own bay all posed
  at 135° (driveway axis + 45°) and 98 samples of a car on someone else's bay all
  drew at their travel heading, with zero misclassifications either way.
  *Superseded:* the whole render-side angle snap (`_carParkingAngle`, `_driveAxis`)
  is gone — the 45° pose was the giveaway that there was no dwell to pose *for*.
  Parking is now a real manoeuvre in traffic, so through traffic simply keeps its
  travel heading and nothing needs classifying.
- **A double office tore in half when one colour was in trouble.** The urgency
  "breathe" lift was computed per dest *record*, and a double is two records sharing
  one footprint, so a double with one timer running translated that colour up while
  the other stayed put — and desynced both from the shared outline, which was drawn
  in a separate pass with no lift at all. `_drawDests` now skips secondary records
  (`d.complex !== d`) and `_drawOffice` lifts the whole building once, by the worst
  of `d.parts`. The old separate outline pass is gone.
- **The doorway and the class emblem merged into one dark blob.** Both wanted the
  same 20% of the block: the emblem sat at 17% from the left, and every variant whose
  driveway runs up the left side puts its doorway on the left wall. Resolved at the
  time by giving the emblem the end of the roof *away* from the door
  (`_entranceFrac(p) < 0.5`); moot now the emblem is deleted.
- **A doorway on a side wall read as a window.** It was placed at the block's
  mid-height, i.e. halfway up a wall. It now always stands on the ground at the
  bottom of the facade band.
- **A doorway on a round building floated clear of it.** The rect was placed on the
  bounding box edge, but a circle's wall at facade height is ~0.73r out, not r, so a
  right-hand door landed entirely off the building. A rotunda's door is now centred
  (the only point where the curve reaches the bottom of the band) and the pass is
  clipped to the silhouette. `_drawRimEntrance`, which rotated an opening onto the
  rim at the bay's bearing, is gone with `_doorSide` — see the roof-edge entry below.
- **One shared facade band left a stacked double's back half a flat plate.** The band
  was measured from the union's bottom edge, so on a 3×4 only the lower colour got a
  wall, windows and a parapet. Each colour now takes a facade at the bottom of its own
  slice — which still comes out as one continuous facade when the halves are
  side-by-side, and as two storeys when they are stacked.
- **A house is a cached sprite, not eight live canvas ops.** The cottage body (offset
  silhouette, wall, gable, lit pitch, door, two windows, keyline, shadow) is ~8 ops,
  and a busy map carries ~100 houses. All eight class colours are painted once into a
  one-row atlas at `SPRITE_TS = 96` with `SPRITE_PAD = 12` of shadow margin and
  blitted with a single scaled `drawImage` each, exactly like the terrain and road
  layers. Only the count-dependent car pips stay live.
- **Render cost of the whole visual overhaul, measured on desktop Chrome, NOT the
  tablet.** A synthetic worst case — all twelve office variants placed at once, 133
  houses, 344 road tiles, `world.audit()` clean — costs 0.34–0.62 ms per
  `renderer.render()` across ts 18/26/34/48, peaking at ts ≈ 26 where the most detail
  is on screen at once (300 renders per sample, dpr 2, 760×900 canvas). That is ~4% of
  a 60 fps budget here; the tablet is unmeasured and the honest expectation is a
  single-digit-millisecond frame there.
- **Three unexplained dark rectangles on the buildings, and what each one was.**
  (1) A **rooftop plant room** — a plain dark rounded rect on the roof meant to read
  as an AC housing. At tablet sizes it read as a bug, so it is deleted. (2) The
  **window row**, when it was light rounded panes: solid pale blobs, i.e. "grey
  teeth". Now one dark glazed band. (3) The **doorway**, on any variant whose
  driveway runs along the top (`1c`, `1d`, `2b`, `2d`, `3a`, `3b`): the door was
  drawn in whichever wall the bay touched, and this projection only renders the
  *bottom* edge as a wall, so a top-side door landed on the roof's far edge as a
  floating rectangle. The door is now always in the facade. The remaining dark shape
  on a roof was the **class emblem** (circle/square/star/diamond/…), kept at the time
  as a colour-blind identity badge matching that colour's houses and pins — it has
  since been cut too (see the emblem entry below).
- **The office lane left a shoulder where it met the road.** It was 0.58 asphalt +
  0.16 kerb, outer 0.74, against a road of 0.50 asphalt inside a 0.68 casing — so the
  join at the connection point stepped out by 0.03 of a tile on each side and the
  kerb visibly kinked. Fixed by making the lane the road: `LANE_W = 0.50`,
  `LANE_KERB = 0.18`. Any future change to `_paintRoads`' stroke widths must be
  mirrored in those two constants or the mouth de-laminates again.
- **`buildingAt(conn)` is truthy, and it hid cars at the join.** `_buildOffice` sets
  `_buildAt[i] = owner` for connection-point tiles too (traffic needs "same
  building?" to work there), so an under-the-roof test written as "is there a
  building here, and is it not a driveway?" caught a car sitting on a C tile — i.e. a
  car turning in off the road vanished at the exact moment the seamless join is meant
  to read. The test is now the tile *type*: only `tileAt() === T_HOUSE` goes under.
  Live probe of a C tile: `{buildingAt: true, isDriveway: false, tile: T_EMPTY}`.
- **The parked car's nose crossed the building's keyline.** `BAY_OFF = 0.44` plus half
  a car length (0.23) reaches 0.67 from the lane centre, against a wall at 0.69 and a
  keyline `ts*0.045` wide straddling it. `0.42` clears it. And the bay markings, when
  they used the full half-tile along the lane, landed exactly on the footprint's own
  edge and read as something poking out of the kerb — `0.33` keeps them inside.
- **Verification of the park manoeuvre (live, desktop Chrome — NOT the tablet).** A
  `3c` double office with houses of both colours wired to its west connection point:
  a car finishing its trip logged `lane [13.50, 3.66]` (lane centre 3.5 + the 0.16
  lateral offset), `bay [13.50, 3.08]` (door centre 3.5 − `BAY_OFF`), and its angle
  easing 0 → −1.57 rad, i.e. from east-along-the-lane to square-on into the space.
  The screenshot shows it nose-in between its own two bay lines, under its own
  colour's door, drawn *on top* of the paving, while the other colour's car drives
  past on the lane. `world.audit()` clean throughout; console silent.
  Re-measured render cost on the twelve-variant rig with 178 houses and 1531 edges:
  **0.10–0.65 ms** per `render()` across ts 10→96, still peaking at ts ≈ 26 (dpr 2,
  1520×1800 canvas, 24 renders per sample) — no regression from the entrance clip.
  Setup note for the next rig: the two starting offices have no roads, so their
  countdowns end the game in ~6 in-game days; clear their `pins` each step to keep a
  long synthetic run alive.
- **The lot's kerb still cut the road in half, even at matching widths.** Matching
  `LANE_W`/`LANE_KERB` to the road's strokes fixed the *shoulder* (above) but not the
  *seam*: the dark ring the lot strokes round its outside still landed on top of the
  road at the connection point, because the lot is drawn per-office after the cached
  road layer, whereas road-road joins are seamless only because casing and asphalt are
  two separate global passes over *all* segments. Fixed by `_repairJoins`, which replays
  the asphalt pass locally out of each roaded connection point. Any future thing that
  draws over the road layer near a joinable tile owes the same repair.
- **The bay leaned the wrong way, and only measuring the turn caught it.** The first
  45° version pointed `bayT` at the *farther* end of the drive strip. On every
  single-connection variant that is backwards — `bays[]` always picks the drive tile
  farthest from the conn — so the slant faced the traffic and the first live capture
  logged `laneDeg 90 → bayDeg 135` as a **−135°** turn: the car hairpinned on the spot
  instead of nosing in. It looked plausible in a screenshot. Fixed by leaning away from
  the *nearest* conn, measured along the lane. Re-verified live: `turnDeg +45` on every
  park, 18/18 parts lean with the traffic.
- **A car at 45° did not fit the bay, and parked cars draw over the office.** A
  0.46×0.30 car turned 45° spans 0.537 of depth; kerb-to-wall was only 0.32, so the
  front corner reached 0.769 against a wall at 0.69 — and because a car on a driveway
  is in the *top* pass, it would have read as a car parked on the roof. Fixed by
  starting the markings at the lane's asphalt edge (0.25 — legitimate, the lane has no
  side kerb), narrowing the bay to `half = 0.29`, and setting the depth from the wall
  instead of the middle of the space: `BAY_MID = 0.42` (the old `BAY_OFF`, renamed)
  lands the deepest corner on 0.689 and hangs the tail 0.10 over the lane on purpose.
  Live re-capture on a `2d`: `carDepth [0.151, 0.689]`, `carAlong [-0.189, 0.349]`
  inside markings of ±0.495.
- **The two bays of a double crossed into an X.** With the corrected lean the two
  bays lean *towards* each other, and each ran its full slant forward from its own
  tile centre out of adjacent tiles — so their deep ends crossed. Same cause put one
  corner of every single variant's markings ~0.15 tiles outside the lot. Fixed
  structurally by spreading the slant either side of the bay's tile centre
  (`lead = run/2`), which caps the along-lane extent at ±0.495; the clip to `_lotPath`
  stays as a belt-and-braces guard.
- **The class emblems are gone, from houses and offices both.** They were defended
  once as a second identity channel behind hue (see the three-dark-rectangles entry),
  and that was the wrong call at tablet zoom: the shapes are small dark blobs that read
  as debris on the roof, and on an office they competed with the doorway and the pin
  queue for the same few pixels. The `emblem()` function is deleted, `CLASS` no longer
  carries an `emblem` field, and with the roof to itself the pin queue is now centred
  and sized to the roof rather than pushed to one end. Hue plus the pin queue carries
  identity. `_drawHouseMarks` is pips-only and its zoom gate rose to `ts < 26`.
- **The corner "snap" was a POSITION jump, and an angle hack had been hiding it.**
  `_pose` used to snap the drawn heading harder for the first `s < 0.3` of a link "just
  after a turn". That made the *car sprite* line up sooner and left the real defect —
  the car stepping `2*LANE` sideways onto the new lane line at the node — looking like a
  steering problem. Deleted, and replaced with the lane-line crossfade. The lesson is
  procedural: instrument the *position* per frame before touching the drawing. A jump
  detector logging `hypot(dx,dy)` each frame found six real discontinuities in minutes
  (0.239 orthogonal and 0.407 diagonal out of a house park pose; 0.32 = exactly `2*LANE`
  on the u-turn out of a driveway; 0.24 on arriving home) that no amount of watching had
  isolated, and every one of them was elsewhere than the corner being complained about.
- **The lot audit was wrong before the code was.** The first Node check compared the
  parked car's extent against the space's side lines evaluated at a *single* depth, so
  it reported corners crossing lines they never touched, and I nearly "fixed" correct
  geometry. A 45° space's side lines move along the lane as depth increases; the check
  has to evaluate each line at the depth of the corner it is testing. Re-derived, all
  twelve variants pass unchanged. Trust an audit only after checking its own algebra
  against one hand-worked case.
- **The park curve has to double back, which rules out a tangent heading.** The space
  is very nearly *beside* the tile the car stops on: both ends of the path point forward
  along the lane, and net travel along it is about zero, so the cubic necessarily
  reverses its along-lane direction in the middle. Taking the heading from the curve's
  tangent therefore swivels the car through 90°+ at that point. Fixed by lerping the
  heading from the lane's to the space's, and by keeping both Bézier handles short
  (0.10–0.20) so the doubling-back is small. Same reason arriving home picks the nearer
  of the target heading and its reverse — otherwise the car spins 180° on the doorstep.
- **Browser-rig gotchas (they cost an hour each).** `window.__rw` exposes the shell, but:
  cars live at `sim.traffic.cars`, not `sim.cars`. `sim.update` early-returns while
  `sim.gameOver` is true, so a rig must force `gameOver = false` (and `pendingChoice =
  null`) *every* frame. `demand.claim(color)` will hand out the map generator's own
  unreachable destinations unless their `pins`/`claimed` are zeroed first — the symptom
  is every car claiming, failing to path, releasing, and backing off forever, i.e.
  `moved: 0`. A rig destination's `pins` must also be kept below its `cap` or the
  overflow countdown ends the game. And the page's own rAF loop keeps advancing between
  devtools evaluations, so any screenshot of a specific frame needs `sim.update` and
  `cam.setTarget` stubbed out (with a `window.__restore`) first. Map generation is random
  per load, so the rig's clear region must be re-scanned after every reload.
- **Diagonals cut corners because `canAddEdge` never looked sideways.** The diagonal
  branch validated only its two endpoints and the opposing diagonal, and *both endpoints
  of a corner-cutter are perfectly legal open land* — so the edge was drawn straight
  through the point where the two **shoulder** tiles `(nx,y)` and `(x,ny)` meet, which
  was a wall, a lot, a lake or a hillside. Fixed with a shoulder test: `T_WATER` or
  `T_MOUNTAIN` → `R_TERRAIN`, `T_DEST` (body *or* driveway) → `R_BUILDING`. A **house**
  is the one exemption — a single tile that joins from all eight directions, so a
  diagonal past its corner reads as a road going by a cottage rather than through it.
  Two traps worth remembering:
  - **It cannot be a flag test.** A house carries `F_BUILD` too, so `flags & F_BUILD`
    catches houses. The tile *type* is the discriminator.
  - **The driveway (lot) counts, and that is fine for joinability.** Refusing driveway
    shoulders takes away exactly one of a connection point's four diagonals, which
    looked at first like it would break the diagonal office join. Measured instead of
    assumed: every C tile still has 4–5 legal joins, 1–2 of them diagonal.
  Verified live across `normal`/`water`/`mountain` maps, with both endpoints held to
  pristine open land so a refusal can only come from a shoulder: every shoulder class
  returned exactly its expected code, 0 mismatches out of ~320 diagonals per map, and
  house-corner diagonals both allowed and actually laid with a clean `audit()`.
- **The L fallback covers terrain corners too, and `R_TERRAIN` is safe to trigger on
  even though an endpoint in water answers the same code.** That case self-rejects: both
  candidate Ls run through the offending endpoint, so both legs fail and nothing is laid.
  Verified by real synthetic drags: a legal diagonal costs 1 tile, and a corner-cutter
  refused on either `R_TERRAIN` or `R_BUILDING` lays the L round the clear shoulder for
  2 — 0 when that L happened to exist already, which is the same drag reversed.
- **The roundabout was not broken — it was unplaceable, and silent about it.** Reported
  as "I can't place any roundabouts", and the placement code was correct. Three separate
  causes, all needing fixing: (1) `_tryInfra` returns a bare `false`, and the only
  guidance was a hover preview, which does not exist on a touch screen — so a failed tap
  was indistinguishable from a dead button; (2) on a week-one 11×8 rect there was often
  no legal 3×3 *at all*, yet the roundabout sat in the first Sunday pool; (3) the 3×3
  did not exclude office connection points, so a legal-looking placement would have
  severed an office. Lesson: "X doesn't work" on a rule-gated tool is usually the rule
  being invisible, not the rule being wrong — check what the player is told before
  changing what the code does.
- **The junction test was lax, not strict.** It counted every live edge-end *inside* the
  3×3, so a plain straight road through the middle scored 3 and qualified — the tool
  offered a roundabout in the middle of a road with nothing to give way to, and once the
  legal-spot overlay painted those, it carpeted the map. Rewritten to count **arms**:
  edges leaving the block. Straight road → `R_GEOMETRY`; a true crossroads places with
  ring flow `[4,6,6,4,-1,0,2,2,0]`.
- **`_tryInfra` and `tryRoad` early-return on `gameOver`, which silently poisons a rig.**
  Chasing "`tryRoundabout` returns false while `canAddRoundabout` returns 0 and the
  inventory is 3", I nearly filed a phantom bug. The rig had expanded bounds with no
  roads, houses overflowed, `gameOver` went true, and every placement call became a
  no-op. `world.addRoundabout` directly worked fine. Freeze `sim.update` and hold
  `gameOver = false` before trusting any placement result. Two other "failures" the same
  session were also the rig: a tile that was `T_MOUNTAIN` (so the third arm had never
  been laid) and a junction built at the edge of `bounds` (so two arms could not leave
  the block). Dump the grid before doubting the rule.
- **The density ceiling, not the demand loop, was setting the house rate.** After
  wiring the per-colour demand-vs-supply clock, a run pinned at `SPEED_MAX` produced
  16 houses in 21 days and a run pinned at `SPEED_MIN` produced 15 — a 2% spread from
  an 8.6× difference in clock speed. `_houseBudget()` at 11 tiles/house was answering,
  not the demand signal. Dropped to 5 (Easy 6) and the same test gave 15 vs 36. Lesson
  for any feedback loop bolted onto an existing generator: measure the *spread*, not
  just that the inputs move. A ceiling that used to be generous relative to a fixed
  schedule can be the binding constraint the moment the schedule becomes dynamic.
- **`_placeDest` refused the whole office when the dice picked a footprint that did
  not fit.** It chose one office *kind* (2×3 single, 3×2 single, 3×4 double), scanned
  exhaustively for that kind only, and returned null. On a board already holding two
  offices the 3×4 double routinely has nowhere to go, so a 3–5 day cadence measured
  8.7 days. Now falls back **down** to the single kinds (never up to a double — that is
  a difficulty beat gated on `DOUBLE_DAY` and a willing partner, not a consolation
  prize), rebuilding `colors` as `[color]` so a single office cannot inherit a
  partner's colour.
- **The office clock was silently losing spawns to `MAX_TRIES`.** Instrumented on the
  11×8 opening board: the first office fired on time at day ~4.6, burned all six
  retries against a board that had no legal 3×2, set `done` and vanished; nothing
  appeared until day 9. A 3×2 footprint genuinely does not always fit, and dropping the
  spawn is the wrong answer. Offices are now *outstanding* until they land — the
  cadence clock does not run while one is pending, and a dead plan entry is re-armed.
  Guard: `_officeWait` is reset only on a **fresh** fire, never on a re-arm, or the
  bounded house hold would renew itself forever.
- **`sim.dayLength` and `generator.dayLength` are separate fields.** Speeding up the
  calendar in a browser test by setting only `sim.dayLength` made the office clock look
  broken — 21 game days with no office — because the generator was still timing 3–5
  days at 9s each. Worse, `_rollOffice()` runs in the constructor, so a `dayLength`
  changed afterwards does not affect the *first* interval. Real play sets both from
  `DIFF`; any harness has to set both, before the first roll.
- **`window.__rw.startGame()` builds a NEW sim, so a held `sim` reference goes stale.**
  A test that grabbed `rw.sim`, called `rw.startGame()`, then kept using the old
  reference reported day 32 of a run that had been replaced — the numbers were real,
  just from the abandoned sim. Re-read `rw.sim` after every `startGame`.
- **A demand loop cannot be measured on a run that is not allowed to lose.** Holding
  `gameOver = false` and nulling the loss timers to "get a longer sample" produces the
  pathological case only: queues climb forever, every colour pins at `SPEED_MAX`, the
  board fills with houses, and offices then cannot find room for 20 days. In real play
  an unserved colour ends the run first. The honest measurement drains pins at a
  plausible rate — which gave 17 houses and 3.45-day office gaps over 30 days, with
  per-colour speeds visibly split (0.35 for the two drained colours, 1.7 for the one
  falling behind).
