# Domino Rally

A 3D domino-run builder and toppler for a tablet: drag a finger across a table to lay a
line of dominoes, drop in bells, bridges, rockets and rollercoaster loops, tap the domino that
goes first, then press GO and watch the whole thing fall over. Built with Three.js and
Rapier physics (`games/dominoes/`, multi-file ES modules). Building and running are two
separate phases — while you build there is no physics at all, only a layout model and a
ghost preview; the Rapier world is created at GO and destroyed when you go back to
building. Everything you can unlock is earned through 23 achievements; there is no
currency, no timer, no fail state, and no way to lose anything you have made.

## Features

- **Two-phase play.** Build phase: pure layout editing at render-on-demand frame rates.
  Run phase: a fresh Rapier world, fixed 60 Hz, ends when the table is measurably still.
- **Nine tools in three groups**, separated in the bar by vertical breaks. *Act on what is
  already there:* Look (one finger orbits), Move (one finger pans), Select (put the blue ring
  on a piece), Rub Out (drag-erase). *Add something:* Line, Arc (free curve), One (single
  domino), Tricks. *Beside GO:* First (choose the domino that falls first). Arc, Tricks and
  Rub Out unlock through play.
- **On a mouse, the camera is always reachable without changing tools:** middle-drag orbits,
  right-drag and shift-drag pan, the wheel zooms. Two fingers on a touchscreen orbit and pinch
  for the same reason — the camera is never modal.
- **A rotation dial, and a selection that follows what you just did.** Anything you place is
  immediately selected — a single domino, a trick, or the LAST domino of a line or arc — and a
  blue ring appears under it. A slider then sits just above the bar and turns that piece
  through a full 360°, live, snapping to eighths of a turn. The same dial steers the ghost
  preview for the One and Tricks tools, so you can aim a bridge before letting go. Select
  moves the ring to any other piece; a tap on bare felt clears it, and so does reaching for a
  tool that puts a piece down or picking a trick out of the tray — from that moment the dial is
  aiming the grey ghost, never a piece somewhere else on the table. One drag of the dial is one
  undo entry. There is no separate "Turn" button and no quarter-turn-only rotation: every
  angle is reachable, and placement rects are tested in their own rotated frame.
- **The trick preview is the trick.** Hovering with Tricks draws the item's real parts
  (through the same local-to-world maths the physics layer uses), not a box the size of its
  footprint — you can see which end of the bridge is the ramp before you commit.
- **17 trick items** (16 in the tray; Soft Sand is challenge-only): Wall, Soft Sand, Bell,
  Chimes, Xylophone, Confetti Cannon, Ball Run, **Rocket**, **Fire Jump**, **Loop the Loop**,
  **Slalom Tower**, Springboard, Splitter, Pinwheel, Bridge, Stairs, Tower. Chimes and the
  Xylophone play real pitched notes; multi-part items (Tower, Stairs, Bridge, Pinwheel,
  Springboard and all four launchers) build several rigid bodies and, where needed, Rapier
  joints or welded compounds. Each still declares a `family`, but that is now only the
  tie-break inside a rung — see the tray order below.
- **The Tricks drawer reads as the ladder.** Tiles are ordered by WHEN YOU UNLOCK THEM: the two
  free tricks (Wall, Bell), then one rung per badge in the achievement table's own order, with
  family as the tie-break inside a rung. It used to be grouped by family, which put locked
  Gadgets ahead of tricks the child had already earned — the drawer talked about things you
  could not use before things you could.
- **Four "domino express" launchers.** Each carries three pink trigger dominoes: knock any one of
  them over and an impulse fires once. The **Rocket** goes 564 mm straight up off its pad and lands
  back on the table; **Fire Jump** throws its ball on a 45° arc cleanly through a ring of fire
  102 mm up and 4.7 mm off the ring's centre; **Loop the Loop** sends its ball right round the
  inside of a vertical rollercoaster loop — over the top upside down — and out of the bottom going
  forward, ON the line the child aimed at it, hard enough to take that line down (measured 21 of
  21); the **Slalom Tower** pops a heavy 22 mm ball off the top of a four-ledge tower, which
  zig-zags 143 mm down inside a three-walled box and rolls out of a chute at the bottom into
  whatever the child has lined up in front of it.
- **The Springboard comes loaded.** It arrives with a domino already standing in a slot on its
  far end, so it is a trick a child can actually use: hit the empty near end and the arm whips
  up and flings the passenger 30 mm up and 80 mm forward, which starts the next line for you.
  The whole plank is inside its own blocked footprint, so before this there was no way to put
  anything on it and the item did nothing a wall would not have done.
- **Undo AND redo.** Command pattern, two stacks, redo cleared by any new action, depth
  60. One drag stroke is one undo entry.
- **Four tables** (Small → Huge) and **four budgets** (60 → 500 dominoes), both earned.
  Spacing dial (tight/normal/wide) hard-clamped to at most 0.85 x domino height so no
  setting can produce a chain that fails to propagate.
- **23 achievements** — 16 free-play plus one per challenge. They gate tools, tables,
  budget upgrades, trick items, 4 domino skins and 8 table surfaces. Nothing is bought;
  unlocks are derived from the earned map every time it changes.
- **Seven teaching challenges** with locked preset layouts, a lent item, no fail state and
  unlimited retries: Ring the Bell (Ball Run), Both Sides (Splitter), Over the Wall
  (Bridge), The Big One (spacing), Through the Hoop (Fire Jump), Blast Off (Rocket),
  Down the Tower (Slalom Tower). Each is measured to be winnable by following ITS OWN HINT
  and nothing else. While a challenge is active a gold goal chip sits under the HUD naming
  it, and tapping the chip re-reads the goal and the hint — a faded hint used to be gone
  for good.
- **`← Games` is in the top-left at every moment**, including the player picker and the menu
  and challenge screens, so there is never a state a child can get into with no way back to
  the arcade. `href` is exactly `../../index.html`.
- **A debug "Unlock everything" button** in the ☰ menu (`#mnUnlock` in `index.html`,
  `api.onUnlockAll`). Deliberately isolated to three places — the button, one listener in
  `ui.js`, one `api` method — so it can be deleted without touching anything else.
- **Coaching, not scolding.** Under 60% toppled, the result card diagnoses the run — more
  than one separate cluster, stopped in the first three, or "look at where it stopped" — and
  only ever names a tool the player has actually unlocked.
- **One bottom-centre bar holds every build control**, in the order a child needs it and
  separated by vertical breaks: Look/Move/Select/Rub Out │ Line/Arc/One/Tricks │ Challenges +
  Badges │ undo/redo/style │ First + GO. The rotation dial and then the Tricks tray stack
  above it. Nothing is parked in a screen corner, so no control can cover another at any
  viewport (measured with `elementFromPoint`, not eyeballed).
- **The camera frames the table into the part of the screen the chrome is not on**, and the
  Tricks drawer closes as soon as you pick a trick — so every square of the table is tappable
  with any tool, at every viewport tested.
- **Drawn icons, not emoji.** Every icon in the game is an inline SVG: lucide line icons on
  the controls, game-icons.net filled icons on the content (the 17 tricks, 23 badges, 7
  challenges). Nothing is fetched at runtime — `research/geticons.cjs` inlines the paths into
  `js/icons.js`. 50 glyphs for 18 tricks, 23 badges, 7 challenges and 21 controls, because
  reuse is the rule: challenges 5–7, the three tricks they teach and Loop the Loop all share
  badge glyphs (Round the Bend, Grand Finale, Two Fifty), and `bowling-strike` stayed because the
  Strike badge still uses it. Fire Jump is the one thing that earned a glyph of its own —
  `fire-ring`, because it throws the ball through a ring of fire and a spiral would have lied
  about it.
- **Named saves** plus an automatic last-layout restore, per player.
- **Per-device quality tier** (Low/High) with an adaptive governor, a perf readout, and a
  `?q=low|high` URL override for testing.
- Caleb/Ezra profiles for saves, stats and achievements; the quality tier is stored per
  device, not per player.

## File structure

- `index.html` — shell: canvas, the bottom bar + rotation dial + tray, HUD, all screens, CSS,
  importmap.
- `js/main.js` — orchestrator: boot, frame loop, governor, run lifecycle, the `api` object
  the UI calls into, persistence scheduling.
- `js/sim.js` — the Rapier layer: builds bodies/colliders/joints from a layout, fixed-step
  `step()`, motion-thresholded instance sync, body parking, run event counters.
- `js/tools.js` — pointer arbitration and every tool's gesture, ghost preview (including the
  real-parts trick ghost), the selection and the shared rotation angle, stroke accumulation
  into single undoable commands.
- `js/ui.js` — DOM: screens, palette, the Tricks drawer latch, the hand-rolled rotation dial,
  toasts, achievement list, challenge list, saves, settings, and `chromeInsets()` (how much
  canvas the chrome covers, for the camera fit). Talks to `main.js` only through `api`.
- `js/layout.js` — the authoritative layout model: pieces, items, table, surface caches,
  overlap/blocker tests, serialisation.
- `js/items-def.js` — declarative definition of all 18 items: parts, sizes, masses,
  joints, welded compounds (`attach`), damping/CCD, launch impulses, unlock gate, footprint,
  description. Every dimension in it is either derived arithmetic or a measured number, and
  the comments say which.
- `js/env.js` — Three.js scene, lights, table meshes, the four InstancedMeshes, ghost and
  ring helpers, the `perf` counter object.
- `js/progression.js` — achievements, unlock derivation, table/budget/tool/skin/surface
  gates, stat folding.
- `js/challenges.js` — the seven challenge definitions, preset builders, goal predicates.
- `js/history.js` — command-pattern undo/redo stacks.
- `js/orbit.js` — orbit/pinch/pan camera with bounds, presets, and a fit that frames the table
  into the part of the screen the chrome is not covering (`setInsets`).
- `js/quality.js` — device tiering (ported from sea-glass): weakness score, profiles,
  persisted per-device level.
- `js/consts.js` — domino dimensions, spacing clamp, tables, budgets, colours, skins,
  surfaces, palette, physics constants.
- `js/audio.js` — Web Audio SFX: clicks, taps, the pitched bell/chime/xylophone notes,
  rumble. No audio files.
- `js/fx.js` — the CPU-animated confetti burst (one `THREE.Points` cloud, pooled).
- `js/storage.js` — the shared `calebArcadeData` read/write, per-player namespacing.
- `js/rapier.js` — multi-source Rapier loader (SIMD build first, plain build as fallback).
- `js/icons.js` — GENERATED (`research/geticons.cjs`): 49 inline SVG icons keyed by name,
  built once per name and cached. `icon(name)` returns markup; `paintIcons()` fills in the
  `data-icon` elements of the fixed chrome.

Harnesses live in the gitignored `research/` folder and drive the real UI through Puppeteer:
`dfix.cjs` (the shared driver plus 16 behaviour suites — bells, strike, budget, ch1–ch7, offtable,
load, coach, hint, ladder, tray), `dtricks.cjs` (the four launchers and the loaded Springboard: it
samples the moving body's pose every frame from inside the page and measures apex, ring crossing,
loop radius and inversion, tower descent, the fling, landing and run length — plus an `arm`
scenario asserting that none of them fires untouched), `dsave.cjs` (save/load across a REAL browser
refresh — see below), `drot.cjs`
(selection ring, rotation dial, drawer latch, table reachability), `dmove.cjs` (the Move tool and
the bar's dividers), `dlock.cjs` (bar group order, wrap rows, the blackout) and `ddock2.cjs` (dock
geometry report at six viewports). `geticons.cjs` is not a test: it is the icon generator, and the
only place the upstream icon package versions live.

Three `dtricks` scenarios lay a RECEIVING LINE in front of the trick and assert that it falls
(Slalom, Loop the Loop, Springboard). "The ball did the right thing" and "the run
carried on" are different claims, and Loop the Loop passed the first for a long time while failing
the second — the ball orbited to within 0.0 mm of the wanted radius and came out 56 mm to the side
of the child's line.

Last full sweep, all green: `dfix` 30/30, `dtricks` 33/33, `dsave` 13/13, `drot` 48 passed /
0 failed, `dmove` 24/24, `dlock`
clean at 768×1024 / 1024×768 / 1024×600 / 430×800 —
**headless desktop Chrome under swiftshader software rasterisation at `?q=low`. The target
tablet has never run this game.** Read the geometry numbers as geometry (the physics step is
fixed at 1/60 s, so they are device-independent) and the wall-clock ones as meaningless.

## Key design decisions

- **No physics while building.** The layout model is authoritative; nothing is simulated
  until GO. This is what makes a 500-domino table editable on a low-powered tablet, and
  it is also why placement uses analytic overlap tests rather than collider queries.
- **Fixed 60 Hz with a clamped accumulator** (max 3 substeps per frame, dt clamped to
  0.1 s). Feeding a variable frame delta to Rapier makes chains explode or stall; the
  frame delta is never assigned to the timestep.
- **Fallen, calm bodies are parked as `Fixed`, never slept.** Two gates: dominoes and
  similar pieces must actually have fallen; everything else must have moved more than
  2 mm from its start. Balls, jointed parts and both ends of every compound are marked
  `noPark`. Sleeping alone was not enough — parking removes them from the solver.
- **Motion-thresholded sync.** Each active body's pose is compared against the pose that
  was last *drawn*, not the previous physics pose, so slow creep still accumulates and
  eventually redraws while genuinely-still bodies cost nothing.
- **The end of a run is measured, not asked for.** Rapier's active-body count never
  reaches zero (an untouched standing domino can stay in the active set indefinitely), so
  `step()` returns a three-state code and the run ends after 1.1 s of measured stillness,
  with a 45 s hard stop.
- **Gesture arbitration, stated once and never broken.** Two fingers always orbit or
  pinch and never draw. One finger draws only when a drawing tool is active; with Look
  selected it orbits, with Move selected it pans, with Select selected it moves the blue ring.
  A persistent tool palette plus an on-table ghost preview mean the answer to "what will my
  finger do" is always visible. Select counts as a "drawing" tool only in the narrow sense
  that it wants a table hit — it puts nothing down.
- **Mouse buttons are the one place a gesture is NOT the selected tool.** MIDDLE-drag always
  orbits, RIGHT-drag and shift-drag always pan, the wheel always zooms — in every tool, so an
  adult can look around and slide the view without disturbing the tool a child left selected.
  Both buttons used to pan, which made one of the two dead weight. Middle = orbit is Blender's
  and Google Earth's convention, right = pan is three.js OrbitControls' own default, so this
  pairing is the one arrangement that agrees with both; Unity and Unreal do the opposite and
  there is no single convention to be right about. This is desktop-only sugar and changes
  nothing on the target tablet, which has no buttons at all — panning there is the Move tile.
  A `mousedown` listener also swallows the middle button, because Firefox and Edge start a page
  autoscroll on it and `preventDefault` on `pointerdown` does not suppress the compatibility
  mouse event that triggers it.
- **One angle, not two.** `rotA` in `tools.js` is simultaneously the next placement's angle
  and the selected piece's angle. Selecting a piece adopts its angle, so the dial never jumps
  when the selection changes, and there is no second source of truth to keep in step.
- **The price of one angle: the dial always aims the LAST thing you pointed at.** Picking a
  tool that puts a piece down (`PLACES` = Line, Arc, One, Tricks) clears the selection, and so
  does choosing a trick out of the tray. Otherwise the ring and the ghost both answer to the
  same slider, and a child aiming a bridge is also silently spinning a bell they selected a
  minute ago on the far side of the table. Look, Move, Select and Rub Out deliberately do NOT
  clear it — none of them adds a piece, so "select it, then switch to Look and turn it without
  any risk of drawing" stays a usable move. The guarantee is structural rather than a coat of
  paint: `onRotateLive` / `onRotateCommit` are only reached when `sel` is set, so an empty
  selection means the dial provably cannot move a piece or write history, which is what
  `drot` measures (a full drag leaves the undo depth unchanged).
- **The dial is hand-rolled from pointer events, not an `<input type=range>`.** Three reasons,
  all of which matter on the target tablet: `touch-action: none` is inherited from the body and
  a native thumb drag is a UA touch behaviour that could be disabled out from under us; a 44 px
  thumb is two lines of CSS here and a vendor-pseudo-element fight there; and a tap anywhere on
  the track should jump straight to that angle.
- **Rotating live means refreshing one piece, not rebuilding the table.** A dial drag calls
  `sim.refreshDominoTransform` / `refreshItemTransform` for the piece under the ring. A full
  `sim.build()` per pointermove would re-derive every part and re-upload the whole instance
  matrix buffer, which on a 300-domino table is the difference between a dial that tracks a
  finger and one that trails it. Safe only because build mode has no physics bodies. The
  drag's start and end angles are what get banked, so one drag is one undo entry.
- **`fit()` frames the table into the UNCOVERED band of the screen.** The canvas is the whole
  viewport and the chrome floats over it, so "the table fits the screen" and "the table fits
  the part of the screen you can touch" are different statements — and `fit()` used to make the
  first one. `orbit.setInsets(top, bottom)` (fed from `ui.chromeInsets()`) reserves the top row
  and the bar + dial; `fit()` solves the vertical extent against what is left and then slides
  the target along screen-up so the table is centred in that band. The reserve deliberately
  EXCLUDES the Tricks tray, because a table that resized every time the drawer opened would be
  worse than one that is slightly small. In landscape the width usually sets the radius anyway,
  so the reserve is free there and the shift alone lifts the table off the dock; in portrait the
  table does come out smaller, which is the correct trade against a front edge you cannot touch.
- **The launchers fire an IMPULSE, not a ramp, and it is honest about being a cheat.** A real
  loop-the-loop needs `v > sqrt(g*r)` at the top — 1.57 m/s for a 50 mm loop — and a marble
  rolling off the Ball Run leaves at 0.33 m/s. No slope that fits on this table closes a factor
  of five, so the mechanism is the fling itself (the child's own words were "auto triggering a
  domino fling"). A part carries `launch: [ix, iy, iz]` in newton-seconds in ITEM-LOCAL axes;
  `sim.js` records it at build time, and when a pink `'launch'` trigger is seen to have tipped
  past 40° the item is queued and the impulse applied after Rapier's active-body traversal
  (mutating bodies mid-traversal is the same hazard as parking them mid-traversal). Every
  impulse in `items-def.js` is written as mass × target speed with the mass computed from the
  part's own volume and density, then re-measured by `dtricks.cjs`; where a number came out of
  the harness rather than the arithmetic the comment says so.
- **A trigger is three normal dominoes, not one big one, because nothing docks.** Dominoes are
  laid every `gap` from where the STROKE started, so the gap between the last one placed and a
  trick's trigger is uniformly distributed across a whole spacing. Tipping is arithmetic: a
  domino pivots on its front edge, so at gap `g` it first touches at height
  `sqrt(48² - (g - 7.5)²)` mm, and a strike at or below the 24 mm CoM leans the target instead
  of tipping it. Two consequences are baked in: each launcher's blocked footprint stops 10 mm
  behind its trigger centre (so the worst case is 43.6 mm → a 31.6 mm contact, clear of the
  CoM), and the trigger is three pink dominoes side by side at exactly one domino's mass each
  (73 mm of aim, and the domino-on-domino arithmetic above is then the arithmetic that actually
  applies). `sim.js` guards the launch per ITEM as well as per part, so the two triggers that
  fall afterwards are just dominoes falling — without that guard a squarely-arriving chain
  would apply the impulse three times.
- **Launch triggers have NO arm gate**, unlike the bells and marbles. They fire on `justFell`,
  and a spawn transient cannot tip a domino 40° off upright; gating them on `armed` would only
  add a way for a trick to silently not go off. `dtricks.cjs`'s `arm` scenario measures this by
  putting all three launchers on the table untouched and asserting `launched === 0`.
- **Geometry stops a rolling body; damping cannot.** Measured on the Rocket's landed tube:
  angular damping alone left a dead-steady 12.5 mm/s roll that had not decayed at all after
  43 s (Rapier damps the spin, and contact friction feeds it straight back out of the undamped
  translation), and adding `ldamp 0.5` only halved it — still five times the stillness threshold,
  so every Rocket run ran to the 45 s cap. Parking was not available either: `sim.js` forces
  `noPark` on both ends of every compound. The fix is two crossed fins welded to the tube at
  different heights, so it comes to rest on two edges. One fin alone stopped the roll but left
  it balanced on a knife edge, rocking for six seconds.
- **Spec fields added for the launchers:** `attach: <index>` (an extra collider on another
  part's body, then `recomputeMassPropertiesFromColliders` — overlapping colliders each
  contribute their full mass, verified against `rb.mass()`), `ldamp`/`adamp`/`ccd`, and `yaw`,
  which adds to the item's own yaw so a part can be turned WITHIN the item. `tools.js`'s ghost
  preview applies `yaw` too, or the preview would stop matching what gets built.
- **Loop the Loop is DRIVEN round its loop, not rolled, and that decision is arithmetic.** A
  ball cannot be rolled round a 110 mm loop built out of boxes, for two independent measured
  reasons. (1) Two neighbouring facet planes each tangent to the running circle meet at radius
  `r/cos(θ/2)`, *outside* the ball's path, so every joint is a sharp concave corner in the
  ball's centre path; with restitution 0 the `v·sin θ` component is lost at each one, costing
  `cos(2π/N)^N ≈ exp(−2π²/N)` of speed per turn — 0.29 at N=16, 0.54 at N=32, 0.73 at N=64.
  (2) Fatally, at the 2.7 m/s needed to hold the top the ball travels 45 mm per 1/60 s step
  against a 10.8 mm facet chord: four facets per step, about eight steps for the whole 346 mm
  circumference, and steps-per-loop only scales as `√R`, so a bigger loop does not help and this
  table has no room for one anyway. Built as a real collider track it measured **12% energy
  retention** against the ~64% the facet model alone predicts, and stalled at y 0.084 of the
  0.100 it needed. So the ball is put on rails: a new spec field `carry: [cy, r, xdrift, vmin]`
  makes `sim.js` watch the part until it reaches the item's local z = 0, switch it to
  `KinematicPositionBased`, and drive it once round a circle of radius `r` about item-local
  `(0, cy, 0)` — integrating `v² = v0² − (10/7)g·r(1 − cos φ)`, i.e. real rolling-sphere energy,
  so it slows over the top like a ball and not like a clock hand — then hand it back to the
  physics at the bottom with 0.85 of its entry speed, because a loop that gives everything back
  reads as a cheat. Two consequences worth knowing: the carry must advance BEFORE
  `world.step()` (that is what `setNextKinematicTranslation` means), and because the drive
  ignores colliders the track's facet count could drop 32 → 16 and its rails could lose their
  `fric: 0` — the visuals got cheaper as a side effect of the physics getting honest. The
  release velocity is along the item's forward axis rather than the true helical tangent: 13°
  sideways would walk the ball off a 46 mm apron. `xdrift` is a **delta from wherever the ball is
  standing when the drive picks it up**, not an absolute item-local x, so the run-up does not have
  to sit on the item's centre line — see the helix-direction note in Memory.
- **Gate 2: a spent Springboard is parked.** `T_FLIPPER` used to carry `noPark` on the general
  rule that a frozen trick could not be hit twice. But a Springboard is one-shot by
  construction — it carries exactly one passenger and throws it — and a near-balanced arm
  resting on a static post chatters against it for ever: the plank moved more than `MOVE_EPS2`
  on 1191 frames of a 1770-frame run and its three welded parts on ~1500, against 25–35 for
  ordinary spent dominoes, so `syncActive()` never returned "still" and what ended the run was
  `main.js`'s 45 s cap. It needed its own parking gate rather than the existing two, because it
  is a see-saw: it pivots about its own centre, so its origin never travels the 2 mm gate 1 asks
  for however hard it is hit, and it never topples either. Gate 2 = "has fired". Parking the arm
  silences its welded lips and counterweight for free, because `syncActive()` only moves an
  attached part when its parent moved. Run time 44.9 s → 3.2 s. (The Wrecking Ball was on this
  gate too, for the same reason, until it was removed.)
- **Spacing is clamped, not trusted.** The user-facing dial only moves inside the safe
  band below 0.85 x domino height (van Leeuwen's propagation limit is about 0.87), so no
  UI setting can produce a run that refuses to topple.
- **Strike geometry decides how tall a step may be, and it is written down.** A domino
  pivots on its front bottom edge, so it first touches the next face at horizontal reach
  `spacing - DOM_T` and height `sqrt(DOM_H^2 - reach^2)` above its own base — and that first
  contact is the HIGHEST the contact ever gets, because further rotation only lowers the tip.
  Measured: tight 44.1 mm, normal 40.3 mm, wide 34.6 mm. A target standing `rise` higher has
  its centre of mass at `rise + 24 mm`, and a strike at or below the CoM only leans on it, so
  the usable rise is at most ~10.6 mm even at the widest spacing. The arithmetic lives in the
  header comment of `items-def.js`; anything that climbs must respect it.
- **Blockers are height-aware.** `isBlocked(x, z, y)` only obstructs what is below a
  blocker's top, which is what lets a bridge deck pass over a 50 mm wall. Every item carries
  a `clearY` (the height of its own walkable deck) and both placement paths in `tools.js`
  pass it. Calling `isBlocked` without `y` asks the older question ("is anything here at
  all") and is deliberately what the eraser and item preview use.
- **Falling is detected two ways.** Height alone (centre drops 30% of domino height) misses a
  domino that has toppled into something and stopped leaning at 50-60 degrees, which made a
  genuinely-completed run report ~60% and then coach the child to fix a chain that had
  already worked. The test is now height OR more than 40 degrees off upright
  (`2*(qx^2+qz^2) > 0.234`, which is yaw-independent), gated to gate-0 parts so the parking
  rules for everything else are untouched.
- **Strokes join at a full gap, not wherever the finger went down.** A continuation stroke
  starts its arc-length walk at s = 0 and the 0.6-gap overlap test then refuses everything
  inside that, so joins came out one and a half gaps wide — 33 mm against a 40.8 mm
  propagation limit, i.e. a coin flip. `strokeToDominoes` now offsets the walk by however
  much is needed for the first domino to land a full gap from the nearest existing one. One
  `nearestDomino()` per stroke, none per domino, and only when `avoid` is set so challenge
  presets are still built to the letter.
- **Quality tier is a device setting.** Any touch device starts on Low. Profiles are baked
  at module load, so changing tier reloads the page rather than trying to rebuild live.
- **Adaptive governor, one-way.** Every 90 rendered frames, if the average frame exceeds
  27 ms it steps down a ladder — pixel ratio 1.0, shadows off, pixel ratio 0.85, domino
  cap x0.7 — skipping rungs that are already spent. It never climbs back, so it cannot
  oscillate.
- **Noisy triggers must ARM before they can fire.** A bell, chime or cannon is dropped into
  the world with a settling twitch, and an unarmed impact test heard that twitch as a strike —
  so items rang at GO before anything reached them. Each trigger becomes armed only once it
  has been measurably calm (`ARM_V2 = 4e-5`, `ARM_W2 = 0.04`), after which the impact
  thresholds (`v2 > 4e-4` for the bell and chimes) apply.
- **Loading a layout conforms it to what the player owns.** `conformLayout()` downgrades
  table, surface, skin and spacing to the earned set and deletes anything now beyond the kerb;
  it is called by both the autoload and the named-save load, and it goes straight through the
  model rather than through history because a load starts a fresh history.
- **One bar, so nothing CAN cover anything.** Every build control shares a single centred
  `#bar` inside the click-through `#dock` (`pointer-events: none` with `auto` on its children,
  so the gaps between pills are still table you can draw on). Controls that share one flex row
  cannot overlap by construction, which is a stronger guarantee than the old arrangement of a
  centred palette plus a corner rail plus a corner GO — that one shipped a bug where GO covered
  the Start tool below ~674 CSS px. Verified by `elementFromPoint` at each control's centre at
  430/500/600/768/1024/1280 px wide with the tray open: every control returns itself.
- **The bar wraps, it never scrolls, and how many rows it takes is a measured budget.**
  `touch-action: none` is inherited from the body, so a horizontally-scrolling bar could not be
  dragged by a finger at all. A `@media (max-width: 640px)` tier shrinks the tiles (never below
  a 44 px target) purely so the bar wraps to two rows instead of three. Measured dock height
  (headless desktop Chrome, software rasterisation): with the drawer shut, 181 px at 900×700 and
  768×1024, 203 px at 430×800, 165 px at 500×753 — the bar plus the rotation dial's ~48 px row.
  With the Tricks drawer open it reaches 306 px (44% of screen) at 900×700 and 383 px (48%) at
  430×800, which is why the drawer now closes the moment you pick a trick: you are never aiming
  a tap while it is up. The 430 px case is a phone, not the target device, and is left as-is
  rather than pixel-tuned — packing that only holds in headless Chrome is not worth chasing on a
  device the game has never run on.
- **The Tricks drawer is a latch, not a mirror of the tool.** Tricks opens it, picking a trick
  closes it, leaving the tool closes it. It used to stay open for as long as the Tricks tool was
  selected, i.e. for the whole time you were placing tricks.
- **Locked things are blacked out, not hidden.** A locked tool or trick keeps its place in the
  bar or tray, goes dark (`rgba(0,0,0,0.55)` behind an icon dimmed to `opacity: .62`) and wears a
  padlock badge, so a child can see how many toys are still to come — which is the only thing that
  makes an achievement ladder legible. Tapping one names it and says it is locked rather than
  doing nothing. The dimming used to be `filter: grayscale(1) brightness(0.22)`, needed only
  because emoji glyphs ignore `color`; inline SVG paints with `currentColor`, so the class can
  just change the colour. The padlock badge is a `::after` with a URL-encoded lucide `lock` as a
  CSS `mask` (`--lockmask` on `:root`), because `content` cannot hold an `<svg>`.
- **Two icon sets, one per surface, inlined rather than fetched.** Controls use
  [lucide](https://lucide.dev) (ISC) line icons; content — tricks, badges, challenge chips — uses
  [game-icons.net](https://game-icons.net) (CC BY 3.0) filled icons. The split is by surface and
  the two are never mixed inside one row: a stroke icon stays legible at the 17-21 px the bar
  shrinks to, while a trick needs a recognisable silhouette, and game-icons is the only set with a
  domino, a pinwheel and a bowling strike in one style (lucide has no stairs,
  bridge or domino at all). Neither is a runtime dependency: `research/geticons.cjs` inlines 49
  paths into `js/icons.js` (45 KB of strings, cached per name), so the game makes **zero requests**
  for icons — an icon that arrives late is a bar full of empty boxes on a slow tablet connection,
  and an icon *font* is a whole download to draw 49 shapes. `js/icons.js` is generated; edit the
  generator's name lists, not the module. Attribution for CC BY 3.0 is in the About text.
- **Every icon is an inline `<svg>` sized `1em` and painted `currentColor`.** That one choice is
  why the swap from emoji touched no layout: each of the pre-existing "shrink the bar" media
  queries still sizes the icons through `font-size` without knowing they are not text, and
  selected-white, locked-dim and gold-toast colouring all come free from the rules that were
  already there. Measured dock heights at six viewports are unchanged from the emoji build, so
  the camera-fit insets did not need re-tuning.
- **Rub Out sits next to Select, not at the end of the build group.** The first group in the bar
  is Look, Move, Select, Rub Out — the four tools that act on what is ALREADY on the table —
  and everything past the first vertical break adds to it. Picking a piece and getting rid of a
  piece are the same kind of act, and a child who has just tapped the wrong thing reaches for the
  undo/rub-out end of the bar rather than past four tools that add more.
- **Challenges and Badges are reachable from the bar AND the ☰ menu.** Two ways in is
  deliberate: the bar is where a child will actually look, and the menu stays a complete index.
- **Own physics sync, not `RapierPhysics.js`.** The Three.js addon uses a variable
  timestep and discards instance rotation; both are fatal here.
- **Four InstancedMeshes total** — one per primitive (domino box, generic box, sphere,
  cylinder) with preallocated `instanceColor`, `DynamicDrawUsage` and
  `frustumCulled = false`. A full 500-domino table with items on it measures 3 draw calls.

## Memory

- **A save did not survive a browser refresh** (reported by the child). Not reproducible here:
  every flow round-trips — clean profile, boot without `?q=low`, save → GO → refresh, Load after
  refresh, both brothers, and a deliberately near-full `localStorage` (79 × 64 KB of junk until
  `QuotaExceededError`, after which the 1335-byte dominoes save still wrote and still survived).
  Two things were nevertheless established and both are now fixed. **(1) No suite could have
  caught it.** `dfix.cjs`'s `openPage` registers a `page.evaluateOnNewDocument` that clears and
  re-seeds `calebArcadeData`, and that init script re-runs on EVERY navigation *including a
  reload* — so a harness built on it structurally cannot test persistence across a refresh, and
  `sLoad` only ever read a hand-seeded creation. `research/dsave.cjs` opens the page RAW (it
  borrows `dfix`'s helpers but not its page factory) and reloads for real. **(2) With this code,
  the only way the report can be true is a silent write failure** — private browsing, storage
  disabled by policy, a full quota, or partitioned storage. `writeAll` caught and ignored every
  exception and nothing checked the bytes landed, so the child got the success chime either way.
  It now reads the value back and compares, returns a boolean, and exposes `saveWorked()`;
  `persistNow` toasts once; and writes MERGE onto the on-disk tree (a `dirty` Set of sub-keys
  overlaid on a fresh read) instead of rewriting a boot-time `cachedRoot` snapshot, which could
  otherwise clobber another tab or another game's slice of the shared key.
- **A save could be listed but not stored — a phantom.** The Saves list renders
  `api.state().creations`, i.e. the in-memory object, so a refused write still showed a row that
  vanished on refresh. `saveCreation` now rolls the creation (and `stats.saveCount`) back when
  `savePlayer` returns false, and says so in plain language.
- **The save hint was wiped by its own re-render.** `doSave()` ends with `renderSaves()`, which
  rebuilt the panel and cleared the hint line — so both the new storage-refused message and the
  pre-existing "All N slots are full" message flashed and disappeared. `setSaveHint` now parks a
  `pendingHint` that survives exactly one `renderSaves()`.
- **The Tricks drawer was in declaration order, which reads as random.** It is now ordered by the
  ladder: rank = the index in `ACHIEVEMENTS` of the item's `unlock` badge, so a child sees roughly
  the order they will earn things in. `unlock: null` (Wall, Bell) sorts first at −1; an unknown key
  sorts last at 99, so a typo is visible rather than silent; `family` and then declaration order are
  only tie-breaks inside a rung. `dfix`'s `tray` suite pins the whole sequence — Wall, Bell, Ball
  Run, Splitter, Chimes, Xylophone, Springboard, Pinwheel, Bridge, Loop the Loop, Stairs, Tower,
  Confetti Cannon, Fire Jump, Rocket, Slalom Tower — and also asserts that a fresh profile never
  shows a locked trick above an open one. Soft Sand is absent on purpose: it is `hidden: true`, a
  challenge prop, never a tile.
- **The run would never end.** Two causes, both non-obvious. (1) The instance sync marked
  "something moved" for every body in Rapier's active set whether or not it had actually
  moved, so "nothing moved" was unreachable. Fixed by comparing each pose against the
  pose last *drawn* with a threshold (`MOVE_EPS2 = 4e-10`, `MOVE_EPSQ = 2e-4`) and
  returning a three-state code from `step()`. (2) Untouched standing dominoes can sit in
  Rapier's active set for a long time, so `activeBodies() === 0` is not an end-of-run
  signal. The test is now 1.1 s of measured stillness.
- **`tools.js` called a nonexistent `updateRings()`** from `setTool`, `setItemType` and
  `setMode`. Because `pickPlayer` calls `setMode('build')` before `setTool('line')`, the
  throw aborted player selection and left the tool on `look` — so one finger orbited and
  no dominoes could be placed at all. `abandon()` already clears every preview; the calls
  were simply deleted.
- **The player picker was a one-way door.** `.screen` overlays are z-index 50 and the
  fixed back button is z-index 30, so at boot there was no way back to the arcade without
  choosing a player. The picker pane now carries its own `../../index.html` link. Raising
  the fixed button above the overlays was rejected: on a narrow phone the pane is full
  width and the button would sit on top of its title.
- **`beginChallenge` did not call `rebuildSurfaces(L)`.** `startChallenge()` pushes locked
  items straight into `L.items`, bypassing the normal placement path that maintains the
  surface/blocker cache, so bridges and walls in a challenge preset were invisible to
  placement tests.
- **`quality.detectionInfo()` returns an object, not a string** — the settings blurb was
  concatenating `[object Object]`. Destructure it.
- **A 90-degree perpendicular join between two straight lines does not reliably propagate
  a chain.** This is physics, not a bug: a domino falling side-on into the flat face of
  the next line rarely tips it. The Arc tool is the intended way to turn a corner, and the
  hint text says so. Do not "fix" it by shrinking spacing — spacing is already clamped.
- **Measured chain reliability** (single straight line, Huge table, High profile): tight
  111/117 (95%), normal 92/92 (100%), wide 76/76 (100%). All three spacing settings are
  inside the safe band.
- Frame cost, Low profile, 250 dominoes all awake at GO: fps min 42 / median 60, physics
  0.10 ms median and 0.30 ms peak, 3 draw calls, active bodies drain 250 to 52. Measured
  under software rasterisation on a desktop, so treat GPU cost as unrepresentative of a
  real tablet and CPU cost as optimistic.
- **The Bridge could not be placed where its own hint told the child to place it.** The
  bridge in challenge 3 has to straddle a wall, but placement asked the height-free
  `isBlocked(x, z)`, so the wall refused the drop at exactly the spot the hint names. Fixed by
  giving each item a `clearY` and passing it from both placement paths in `tools.js`. (An
  item's `foot` is only the ghost box — it does not gate placement.)
- **The old Bridge was physically impossible to walk a chain over.** Its steps rose 16 mm,
  and a domino's strike at 24 mm-ish contact height lands at or below the CoM of a target
  16 mm higher, so the up-flight jammed into a stable leaning arch — measured 4 of 24 fallen,
  stalled at 53-63 degrees. Rebuilt as 7 shallow 8 mm steps each way plus a 4 mm deck: the
  deck still clears the 50 mm wall (56 - 4 = 52 mm underside) and every step is inside the
  ~10.6 mm limit. Now 24 of 24, and the sandbox crossing is 100% at tight, normal and wide.
  The bridge is 688 mm long as a result, and its `foot` was set so the drop ghost is drawn at
  the real length — a child can see it will not fit before letting go. Stairs keep the 16 mm
  rise: they only ever cascade downwards.
- **The fall counter undercounted a run that had actually worked.** With height-only
  detection, dominoes that toppled and came to rest leaning at 50-60 degrees never registered,
  so a completed bridge crossing reported "15 of 24" and the coach then told the child to
  repair a chain that had finished. Added the 40-degree tipped test (see design decisions).
- **Stroke joins were a coin flip at tight spacing** — the same three strokes placed 190 and
  died at the joint one run, then placed 195 and toppled all of them the next, on a millimetre
  of phase. Fixed with the join-phase offset in `strokeToDominoes`.
- **Balls never came to rest**, so runs sat at the stillness test until the 45 s hard stop.
  Balls (`MESH.BALL`) now get `setLinearDamping(0.3).setAngularDamping(0.3)`; nothing else is
  damped, because damping a domino changes how a chain propagates.
- **Bells and chimes rang the moment GO was pressed** — their own settling twitch read as a
  strike. Fixed with the ARM gate; the impact threshold is `v2 > 4e-4` once armed.
- **Loading a save made under a bigger table left a stale surface rectangle** — dominoes
  could be placed in mid-air off the edge, and pieces beyond the kerb could be neither
  reached nor rubbed out. `conformLayout()` now runs on both load paths.
- **The HUD kept the sandbox budget when a challenge started.** `updateHud`'s memo compared
  only placed and fallen, both 0 on a fresh challenge table, so it early-returned and the HUD
  still read "0/60". The budget is part of the memo now.
- **Challenge 4 is winnable; a test harness saying otherwise was wrong twice.** Two harness
  defects, not game defects: (1) opening a challenge switches the table and re-fits the
  camera, so a world-to-screen map solved beforehand is off by exactly `radiusBefore /
  radiusAfter`; (2) a seeded save without the `firstfall` achievement leaves the Arc tool
  locked, so `tool('arc')` is a no-op and an intended U-turn is drawn as a 90-degree corner
  (which by design does not propagate). With both corrected, ch4 completes through the real UI
  at 195 built / 195 fallen. Its goal of 150 was NOT lowered.
- **Live-module introspection beats debug hooks.** `sim.js` exports its registry
  (`export { P as parts }`), so a Puppeteer `page.evaluate(async () => (await
  import('./js/sim.js')).parts)` resolves to the *same* module instance and can read every
  part's pose, fall flag and gate. Same trick for `orbit.js`'s `cam` and `env.js`'s `perf`.
  No temporary instrumentation needs to be added to shipped code — and note challenge layouts
  are never autosaved, so localStorage cannot answer questions about them.
- **Locked tricks were indistinguishable from unlocked ones.** `renderPalette` had always put
  a `.locked` class on unearned tray items, and `buildTray` renders all 14 whatever you own — but
  the stylesheet only ever styled `.tool.locked` (a flat `opacity: .3`) and never
  `.trayitem.locked`. So on a fresh profile 12 of the 14 tricks looked completely available,
  and the only feedback was a hint line after the tap failed. Both now share one blacked-out +
  padlocked treatment. Worth remembering as a class of bug: a class was being applied correctly
  by JS for a rule that did not exist in the CSS, which no amount of behavioural testing finds.
- **The bottom chrome was three fixed elements in three places** (centred `#palette`, a
  right-hand `#rail`, a corner `#go`) and is now one `#bar`. That collapsed several problems at
  once — the palette/GO overlap could not recur, `setRunMode` went from four display toggles to
  one, and `#perf` had to move from bottom-left to top-left because a full-width bar now covers
  the bottom-left corner on any portrait width. `research/dlock.cjs` is the harness for the new
  layout: group order, wrap-row count, the blackout, and that run mode hides the whole bar and
  building brings it back.
- **Panning was mouse-only, so on the target device the view could not be slid at all.**
  `orbit.js` had had `panBy` from day one, but the only ways to reach it were middle-drag,
  right-drag and shift-drag. A tablet has none of those. Fixed with a Move tool tile rather
  than a new gesture, because every one-finger gesture is already spoken for.
- **A flex divider stranded at the end of a wrapped row needs `visibility`, not `display`.**
  Setting `display: none` on it changes the wrapping, which re-strands a different one — an
  oscillation. `tidySeparators()` hides stranded breaks with `visibility: hidden` so they keep
  their box and the layout it was judged from stays true.
- **Placement rects were axis-aligned, so free rotation would have been silently wrong.** The
  overlap tests only agreed with the drawn shape at 0/90/180/270°, which was fine while rotation
  was a quarter-turn button. Every test now transforms the point into the rect's own frame —
  two extra multiplies — before the dial was allowed to produce arbitrary angles.
- **The dock grew, and the front strip of the table stopped being tappable.** Adding the
  rotation dial put the dock's top edge at y = 384 of 700 with the Tricks drawer open, so a tap
  aimed at world z = +0.20 hit a tray icon and placed nothing. The `bells` and `ch1` harness
  suites went red overnight with no change to bells, sand or marbles. Two fixes, both at the
  root: `fit()` now reserves the chrome (see design decisions), and the drawer closes when you
  pick a trick. Verified by projecting a 5×5 grid of table points through the live camera and
  asking `elementFromPoint` what is on top of each: 0 of 25 covered at 900×700, 768×1024,
  430×800 and 500×753, against 1–3 of 25 before.
- **Every "aim at a fraction of the window" line in a harness was a latent bug**, and the fit
  change detonated all of them at once: `calibrate()`'s pass-1 triangle spread off the table's
  front edge, and the `budget` suite's stroke started past the far corner of the 2.6 × 1.9 table
  and so placed 3 dominoes instead of 74 (a stroke that starts off the table correctly places
  nothing). `dfix.cjs` and `drot.cjs` now aim by projecting WORLD points through the game's own
  camera — the exact inverse of `orbit.makeRay`'s NDC maths, no taps and no solve — and `drot`'s
  `tap` throws if the point it computed is not over the canvas. A mis-aimed harness that reports
  a working feature as broken costs more than the bug it was looking for.
- **The `ch1` harness solution had rotted against the game.** `challenges.js` moved challenge 1's
  bell from z = 0.36 to z = 0.24 (its own comment explains why: at 0.36 the marble arrived under
  the 0.05 m/s the bell needs and the challenge became a coin toss the child could not read).
  Nobody moved the harness's far-side domino stroke, which ran z 0.15 → 0.32 — straight through
  the bell, shielding the thing the marble was meant to hit. The marble now does the whole job,
  which is what the challenge teaches. Not a game defect; a stale test.
- The `perf` object carries `msPhys`, `awake`, `pixelRatio`, `shadows` and `dominoCap` only.
  Frame rate, draw time and draw-call count are frame-loop locals plus
  `renderer.info.render.calls`, formatted straight into the debug overlay — a harness that
  reads them off `perf` gets `undefined`, and must either turn the overlay on and scrape it or
  measure frames itself.
- **The challenge goal chip printed the NAME of its icon.** It read `gi-arch-bridge 3. Over the
  Wall — tap to read the goal again`, because `main.js` had always glued `c.icon` onto the front of
  a string that `setGoal` assigned with `textContent`. That was invisible while icons were emoji
  characters and became garbage the moment they became names. Fixed by `setGoal(text, iconName)`
  rendering the chip as HTML — the icon through `icon()`, the text still through `esc()` — and
  `dfix`'s `hint` suite now checks "the goal chip draws its icon rather than naming it" so it
  cannot come back silently. The general lesson: replacing a representation quietly breaks every
  place the old one was concatenated into a string, and only the places a test actually reads
  will tell you.
- **A harness asserts a mechanism, so changing the mechanism reddens it — and that is the point.**
  The icon swap put `dlock` red (it probed the computed `filter` and the `::after` emoji
  codepoint, both of which no longer exist) and `dmove` red (it asserted the old
  `look move select |` group order). Both were rewritten to the new mechanism — `dlock` now checks
  `.ic` opacity, tile colour, that *every* tile draws an `svg`, and that the padlock is a masked
  data-URI — and it was one of those rewrites that surfaced the goal-chip bug above.
- **Choosing a trick left the old selection turning under the dial.** With a piece selected
  (blue ring) you could tap Tricks, pick a bell, and the dial you then dragged to aim the grey
  ghost was ALSO rotating whatever had been selected before — one angle driving two things at
  once, with only one of them on screen. Fixed at the root rather than in the tray handler:
  entering any placing tool clears the ring (see design decisions), which closes the same hole
  for One, Line and Arc, and `setItemType` clears it too for the case where Tricks is already
  the tool. `drot` grew a section for it — including that Look / Select / Rub Out still keep the
  ring, because the fix must not cost the "select it, then turn it safely" move.
- **The Bowling Ball was removed, not fixed.** It never worked: a heavy ball rolling down a lane
  shoves the first domino or two off their bases and is then riding over the wreckage, deflected
  off the line, so it did not read as a bowling strike to the child who asked for one. The
  `bowling-strike` icon stays in `js/icons.js` because the free-play **Strike** badge still uses
  it. The same measurement is why challenge 7's goal asks for 2 knocked over by the tower ball
  rather than the 3 first written: measured repeatedly, the whole 17-domino line goes down and
  exactly 2 of them are credited to the ball, and asking for 3 would have been asking for the
  Bowling Ball back.
- **Removing the Bowling Ball left a DEAD RUNG in the middle of the ladder, and only measuring
  found it.** The **Strike** badge asked for "10 dominoes with one ball", the Bowling Ball had
  been its obvious answer, and the replacement reasoning — "the Ball Run's marble counts too,
  and 10 is inside its reach" — was written without measuring. It is not: `bestBallKnock`
  credits a ball for each domino that falls within 60 mm of it while it is moving, and the
  collapse wave outruns every ball in this game, so a marble rolled into a 24-domino line is
  credited with exactly **1**. That rung hands out the Springboard AND the Pinwheel, so the
  ladder was broken in the middle for anyone who had not already earned it. Re-gated to
  `bestBallKnock >= 1 && fell >= 25` — a ball has to START a run of 25, which is what a child
  means by a strike — and `research/dfix.cjs` grew a permanent `strike` suite that seeds the
  rung BELOW this one and asserts both the earnability and the 1-credit measurement the gate
  is shaped around. The lesson: deleting a feature can strand the achievement that gated on
  it, and a plausible sentence about what the replacement "should" manage is not a measurement.
- **A launcher trigger the child's line could not reach.** The Slalom's trigger started 70 mm
  behind the tower, which put its front face 27 mm from the back wall — and a 48 mm domino needs
  31 mm of reach just to pass 40°, so it could not fire *even in principle*: measured, it shoved
  forward 17 mm, jammed on the wall and rested at 25.7°. Moved to 100 mm back (57 mm of wall
  clearance, so 56° even after that shove).
- **Then the SAME trick failed for a different reason, and this one was the real lesson.** With
  the trigger reachable, ch6 still reported `launched=0` and ch7 got 9 of 30 fallen. Nothing
  docks or snaps in this game: line dominoes are quantised from the stroke's start, so the last
  one landed 47–51 mm short and only *leaned* on the trigger. Fixed by the two changes in the
  design decisions above (10 mm blocked margin, three one-domino-mass triggers). All three
  launcher challenges now complete by their own hints. Worth remembering as a class: "the child
  can aim at it" and "the chain can actually tip it" are different questions, and the second one
  is arithmetic that has to be written down.
- **The Rocket's apex is a measured number and it MOVED when something unrelated changed.**
  0.0215 N·s on a 5.725e-3 kg compound is 3.75 m/s on paper; it measured 467 mm while the
  trigger was one slab weighing 3.2 dominoes, and 564 mm once the trigger became three light
  ones — because the trigger stands 55 mm back and a 48 mm domino falls *onto* the tube, so the
  heavy one was clouting the rocket on its way out. The comment in `items-def.js` was corrected
  to the new measurement rather than the impulse being re-tuned to hit the old prediction.
- **A launcher harness handed out a fraudulent PASS.** With the Rocket dropped at z 0.30 on a
  1.40 m table it drifted off the far edge and `sim.js` correctly culled it to the sunk pose
  y = −9 — which satisfied a check that read "comes back down and settles: `end y < 0.12`". The
  scenario moved mid-table and the check grew two more clauses (`end y > 0`, and lands within
  the table's own depth). A cull is a legal ending; it is not the ending being tested.
- **The Slalom's ball left the tower 26° off axis** (started x −0.018, finished x −0.475) and
  sailed clean past a domino line laid down the middle: the bottom ledge is rolled, so it dumps
  the ball sideways, and the flat chute hands that sideways speed straight on. Fixed with a
  funnel into a 28 mm channel — and note a bare channel measured WORSE than none, because the
  ball came down hugging one wall, met the rail's end face square on and stopped dead 47 mm
  short of the lip. The funnel opens to the full 62 mm at the mouth so anything the ledges can
  deliver is led in rather than blocked. It needed the new `yaw` spec field to build.
- **`bestBallKnock = 0` was a momentum problem, not an energy one.** The Slalom's ball is 22 mm
  and strikes at 11 mm — below a domino's 24 mm CoM — so at density 450 and again at 1600 it
  leaned on the line and stopped. Density 6000 (33.5 g, a 22 mm steel bearing) takes the whole
  line down; the launch impulse was rescaled with the mass to keep the same 0.39 m/s nudge off
  the top ledge. A steeper chute was tried first and made it ricochet backwards.
- **A harness aim bug that hid behind a plausible explanation.** ch5 placed 0 dominoes; the
  first diagnosis (`calibrate()` defaulting to a 1.30 × 0.95 table, so the homography
  extrapolated) was real but not sufficient, and ch5 still placed 0 after it. The camera radius
  goes 3.071 → 4.504 when a challenge opens *on the same medium table*, because the sandbox was
  sitting at `topFit()`'s tighter fit and `applyTable()` refits from scratch — a 1.47× aim error.
  The comment saying `reaim()` was unnecessary "because all three tables are medium" named the
  wrong invariant: what matters is the camera radius, not the table. ch6 had been PASSING with
  the bad aim, because a long enough line still crossed the launch pad. A green from a mis-aimed
  harness is worse than a red.
- **"Loop the Loop" was a hoop the ball was thrown through, and the child noticed.** The item
  was named for a rollercoaster loop and did not have one — it flung its ball on a 45° arc
  through a standing ring. Split in two rather than argued about: the thrown-through-a-ring
  trick is now **Fire Jump** (`id: 'firejump'`, `gi-fire-ring`, ring re-coloured to read as
  fire), and **Loop the Loop** (`id: 'coaster'`) is a real vertical loop the ball goes right
  round the inside of. Challenge 5, "Through the Hoop", stayed pointed at Fire Jump, which is
  the trick it actually teaches. Both are measured: Fire Jump crosses its ring plane 4.7 mm off
  centre at y 0.102; the coaster orbits at 40.0 mm against 40 wanted, worst radial error 0.0 mm,
  three frames inverted over the top, peak y exactly 0.100.
- **The coaster's first build was a physical collider loop and it was not fixable by
  arrangement.** 3/6 at best (peak y 0.068, 12% energy retention). Facet-corner losses and the
  timestep-vs-chord ratio are both in the design decisions above; the point to remember is that
  a *tangent* circle of boxes still collides — every pair of adjacent tangent planes meets
  outside the running circle, so a "smooth" faceted track is a ring of concave corners. Three
  arrangements were tried before the arithmetic was done, which was the wrong order.
- **The Loop the Loop looped perfectly and could not start the next line — two separate bugs, both
  invisible from the ball's own trace.** The child's report was "if you place a domino at the end of
  the loop it doesn't get knocked down", and the harness had been watching only whether the ball
  stayed on the circle, which it did throughout.
  (1) **The helix drifted the wrong way.** A loop of track has to drift sideways over its turn —
  a planar loop hangs its descending quarter over its own approach, and building one measured the
  ball meeting the back of the ribbon 20 mm before the mouth at 0.35 m/s peak against 1.66, never
  getting round at all. But the drift ran entry at x 0 → exit at x +56 mm, so the ball came out
  56 mm to the side of the line the child had aimed at the thing: a 13-domino receiving line on the
  centre line was passed 32 mm clear and 0 of it fell. Fixed by running the drift **−XS → 0**: the
  loop is parked 56 mm to the left of its own exit, so the exit is on the centre line. The trigger
  is three ordinary dominoes with nothing to do with the ball's path and stayed put. Since the run-up
  is no longer at item-local x 0, `advanceCarries()` now takes `xdrift` as a delta from where it
  picked the ball up; an absolute x teleported the ball 56 mm sideways the instant the drive engaged.
  (2) **A 3.3 g ball cannot topple a domino, however fast it goes.** With the aim fixed the ball
  arrived on target at 1.4 m/s, hit the first domino, **slid it 7.6 mm forward and left it standing**
  (`fallen 0`, `bestBallKnock 0`). Energy was never short — 1.2e-4 J against the 2.95e-5 J a topple
  costs. Momentum was: a 24 mm ball on the table strikes 12 mm up, half way to the domino's 24 mm
  centre of mass, so the blow kicks the base out from under it and it rocks backwards onto its heel.
  The only cure for a low strike is mass. **The Slalom Tower had already measured this same wall and
  the same fix** (its ball is 33.5 g because 2.5 g and 8.9 g toppled nothing), which is the lesson
  worth carrying: two items, one physical fact, and the second one was rediscovered from scratch.
  Density 450 → 3000 (3.3 g → 21.7 g, exit momentum 0.027 N·s) with the launch impulse scaled to
  match (0.0055 → 0.037 N·s, since it sizes a 45 mm run-up at 1.7 m/s). **21 of 21 fall, 100%,
  `bestBallKnock` 3.**
- **The Springboard was an item with no way to use it.** Its blocked footprint covers the whole
  plank, so a child could never place a domino on it; it did nothing a wall would not have done.
  It now comes loaded, and getting a loaded board to behave took six measured passes, each of
  which failed for a different reason and each of which is a note in `items-def.js`:
  (1) a bare see-saw cannot throw a domino — one falling domino carries ~2.4 mJ and lifting the
  passenger 20 mm costs ~2.0 mJ before a single loss, and a rotating arm throws up-and-BACK;
  measured, the plank turned 1.1° in total. So the whip only *triggers*; a launch impulse throws.
  (2) The loaded passenger's 3.95e-3 N·m pinned the plank against a falling domino's ~2.5e-3
  N·m, so nothing moved at all until a counterweight cut the net bias to 0.5e-3 N·m.
  (3) The passenger toppled SIDEWAYS during the settle (to x +30 mm) — turning it broadside buys
  stability along the plank and spends it across the plank, where the footprint is 7.5 mm.
  (4) The first slot did not fix that, and the arithmetic says why: a domino tilting on its
  bottom edge escapes a lip of height h across gap g at `sin θ = g/h`, and it passes its own
  point of no return at `atan(3.75/24)` = 8.9°, so the slot only holds if `g/h < 0.157`. At 4 mm
  tall and 1 mm a side the ratio is 0.25, it reached 14° and levered over the top. 8 mm and
  0.5 mm gives 0.063.
  (5) The slot has no front (the fling needs that open), so it also needed a rest post: with only
  the spring holding the arm, the settle swing dipped the tip and the passenger slid forward out
  of its own slot at 10.5 mm.
  (6) The run then took 44.9 s, ended by the hard cap. Fixed by parking a spent arm (gate 2
  above) — NOT by damping. `adamp: 3` and a ten-fold stiffer motor spring were both tried first
  and neither moved the number, which is what identified it as contact/motor solver noise rather
  than free oscillation.
- **The Wrecking Ball was fixed, then removed.** Worth keeping the arithmetic, because it is the
  general case for any hinged trick. It did nothing at all when a domino hit it: head 8.6 mm at
  91 mm/s, `launched: 0`, 16 of 27 fell, run to the 44.9 s cap. It cannot be *powered* by a domino
  — the pendulum (rod 8.3 g + 41 g head, `I ≈ 2.18e-4 kg·m²` about the pivot, CoM 64 mm below it)
  needs `mgd = 31 mJ per radian` against the **2.4 mJ** one falling domino releases, a factor of
  13 — and its trigger also asked for 141 mm/s of head speed, which a domino cannot deliver, so it
  did not even make a noise. The fix was a spec field `boost: <newton-seconds>`: a launch with no
  direction of its own, shoving the part along its own horizontal velocity at the moment it fires
  (direction-free because a wrecking ball can be hit from either side, where a baked item-local
  `launch` vector would be right for one child's chain and backwards for the next). 0.03 N·s gave
  `ω = J·0.064/I = 8.8 rad/s`, 0.62 m/s through the bottom of the arc, 27 of 27 falling. **The
  child then asked for the item to be removed**, so it is gone — with it went the `boost`
  mechanism (nothing else used it), `T_PENDULUM`, the `wrecked` badge and the `gi-wrecking-ball`
  glyph. The Tower moved onto Bridge Builder's rung so that Tumbling Tower, and the Confetti
  Cannon behind it, stay reachable; old saves may still carry `wrecked: 1` and nothing reads it.
- **A harness assertion that a failure also satisfies is not an assertion — again.** The
  Springboard's settle check read `t.path.slice(20, 40)`, but `readTrack` trims `path` to the
  first frame the body moved, and for this passenger that frame is the one it was FLUNG. So the
  check was reading the flight and calling it the settle: it reported a healthy 24 mm on a run
  where the passenger was airborne at the time. Fixed by reading the raw untrimmed track. This is
  the same shape as the Rocket's fraudulent PASS above (a cull satisfying "comes back down and
  settles") and it is now the third time in this game, so it is also in
  `docs/decisions.memory.md` as an arcade-wide rule.
- **The bottom dock is bottom-anchored, so growing it pushed the tray off the TOP of the screen —
  and `touch-action: none` meant you could not scroll it back.** With the 18th trick added, the
  column (tray + rotation dial + a bar that has wrapped to three rows) is tall enough at
  1024×600 and 430×800 that the tray's first row sat above y = 0. The tiles were laid out and
  had non-zero rects, so nothing looked broken from the code's point of view; they were simply
  unreachable, permanently, because the body disables touch scrolling globally. Fixed at the
  root rather than by trimming the tray: `#dock` takes `max-height: calc(100dvh - 74px -
  safe-area)`, the bar and dial stay `flex: 0 0 auto`, and the TRAY is the one thing that
  shrinks and scrolls (`min-height: 0; flex: 0 1 auto; overflow-y: auto`, plus an explicit
  `touch-action: pan-y` — the body's `none` is inherited — and `overscroll-behavior: contain`
  so a flick at the end of the list does not drag the page). `min-height: 0` is the load-bearing
  half: without it a flex child refuses to shrink below its content height and the column stays
  too tall whatever the max-height says.
- **And the harness had been asserting the wrong thing about it.** `dlock.cjs`'s visibility test
  was `r.width > 0 && r.height > 0`, which is true of a tile that has been pushed clean off the
  screen — so it reported green for the exact bug above. `vis()` now requires the whole rect to
  be inside the viewport AND `elementFromPoint` at its centre to land on the tile itself, and
  the report names every unreachable tile rather than only counting locked ones (a tray you
  cannot reach the top of is the same defect whichever kind of tile it swallows). Green at
  768×1024, 1024×768, 1024×600 and 430×800.
