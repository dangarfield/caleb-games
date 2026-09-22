# mmm-leaves

A solo roll-and-write, adapted from the paper game **Scribbly Gum** (Joey Games,
design Phil Walker-Harding, illustrations Meredith Walker-Harding, ©2022). You are
a baby moth under the bark of an Australian scribbly gum. Each turn one movement
tile is flipped and everyone — here, just you — may draw a line that way from any
circle already eaten, taking the food in the circle you reach. Nuts, leaves and
blossoms; one of each is a meal. Three rounds of seven turns, then a rank.

The rules PDF is kept at `games/mmm-leaves/research/ScribblyGumRulesWeb.pdf`. The
artwork is **not** copied from it — every visual is drawn in code, in the same
spirit as the printed pad (moss and sage naturals, white food discs, scribbly bark
trails) but brighter and animated. The art was proved out first in
`games/mmm-leaves/research/art-proof/`.

Touch-first, landscape, 1333×690.

## Features

- **9×9 tree**, circles joined by printed wavy lines, plus dotted trails that
  wander diagonally across it and are only usable on a DOTTED tile. The nest and
  its four neighbours start eaten and hold no food, exactly as printed.
- **8 movement tiles** — LEFT, RIGHT, UP, DOWN, LEFT/RIGHT, UP/DOWN and two
  DOTTED. Each round one is discarded face down unseen and the other seven are
  laid out, so you never know which set you are getting.
- **Food**: nut, leaf and blossom in ones, twos and threes, plus wild circles
  that let you choose. Dealt from a balanced bag rather than rolled per cell —
  independent rolls clumped badly, and a tree with no nuts in it cannot make a
  meal.
- **Meal tracker**, 3 columns × 15, filled top down. Six cells carry four arrows
  (staggered down the columns as on the pad); filling one buys an immediate extra
  move in any direction but a dotted one, and extra moves chain.
- **Scoring**: at each round end, a meal is one nut + one leaf + one blossom, so
  your meal count is the smallest column total. That is banked at rounds 1, 2 and
  3 — cumulatively, so early balance is worth three times over. +3 per column
  that reaches 15.
- **3 achievement tiles** drawn at random from a pool of 9, gold side up. Claim
  one in round 1 or 2 for the gold figure; all three flip to silver once round 2
  is over, which is the pad's own solo rule.
- **Rank ladder** instead of the printed solo score scale: Bark Nibbler → Leaf
  Rustler → Blossom Bandit → Gum Glutton → Moonlit Moth → Emperor of the Bark →
  Ghost of the Scribbly Gum. Personal best kept per player device.
- **Animation throughout**: 3D tile flip with a squash landing, the moth crawling
  the line while the scribbly stroke draws on behind it, bite-wobble on the
  circle, food popping and arcing into its tracker cell, gold burst and spinning
  arrow pips on an extra move, counting-up round card with leaf confetti, and a
  final scorecard that reveals a row at a time before the rank lands.
- **Home screen** carries the story and the ladder, no how-to-play wall.

## Files

```
games/mmm-leaves/
  index.html            canvas, styles, back button, script tags
  js/arcade-store.js    copied verbatim from dragonseed, unchanged
  js/art.js             every procedural drawing primitive
  js/board.js           grid, dotted trails, legal moves, food bag
  js/tracker.js         meal tracker, arrow pips, scoring, rank ladder
  js/achievements.js    the pool, per-turn checking, gold/silver flip
  js/anim.js            tweens, particles, confetti, floating text
  js/audio.js           named silent hooks; real sounds to be added later
  js/ui.js              all canvas rendering and hit regions
  js/game.js            state machine, turn loop, input, wiring
  research/             the rules PDF and the art proof
```

## Key design decisions

- **No image assets at all.** Acorns are two beziers and a hatched cap; the
  eucalyptus leaf is two mirrored beziers with a midrib; a gum blossom is sixteen
  radial filaments with dot tips; the moth is seven overlapping body segments
  whose per-segment phase offset *is* the crawl animation. The bark is seeded
  blobs plus grain, deterministic so it does not shimmer.
- **Honey, not ink.** On paper you fill circles in with a pen. Drawn dark, the
  board went muddy, so an eaten circle fills honey-gold with a ragged rim and the
  food ghosted underneath, and the tunnel between eaten circles is a glowing amber
  stroke. That contrast is what makes the board read at a glance.
- **Trail wobble tapers to zero at both ends**, so a wavy line lands cleanly on
  its circles instead of overshooting them. The same polyline is cached and reused
  for drawing the line and for walking the moth along it.
- **Static furniture is pre-rendered** to an offscreen canvas once per game — the
  bark, all 144 printed lines, the dotted trails, the grass — so the per-frame
  cost on a weak tablet is only the circles and the animation.
- **One tap per move.** Legal destinations are highlighted and tapped directly;
  the source is inferred. Under LEFT/RIGHT and UP/DOWN both sets light up at once.
- **Deviation from the arcade palette, deliberate.** The house style is the dark
  `#0a0a2e` theme. Dan asked for the Scribbly Gum look and bright colours, so this
  game uses moss/sage/grass naturals instead. The back button, its top-left
  keep-out, the 1333×690 target and the IndexedDB store all follow the house
  rules.
- **Rank bands were calibrated, not guessed.** Eight full games of random play
  scored 17–46, mean 29. The ladder is set so careless play tops out mid-table and
  the last rung needs planning.
- **Nothing may kill the frame loop.** A tap on "Round 2" while the card was still
  counting up nulled the card mid-tween and took the whole animation loop down
  with it. Tween callbacks are now guarded and wrapped, and the rAF loop
  re-registers even if a draw throws.

## Memory

- 2026-09-22 — Built. Verified headless at 1333×690: full 21-turn games played
  through to the rank screen, no console errors, final score independently
  re-computed and matched, 60fps with GPU disabled, letterboxes cleanly at
  1024×768 and 1600×720.
- 2026-09-22 — Fixed a freeze: tapping the round-end button before the count-up
  animation finished threw inside `Anim.update`, which stopped the loop and hung
  the game. Guarded the card tweens, cleared in-flight animations on round
  advance, and made both the tween runner and the frame loop exception-safe.
- 2026-09-22 — Food was originally rolled per cell and clumped badly (one board
  came out almost all blossom, which makes meals impossible). Replaced with a
  dealt, shuffled bag of exactly 23 circles per food type plus 6 wilds.
- 2026-09-22 — The "eat every circle in one row" achievement was unreachable in 21
  turns; relaxed to six in a row.
- Audio is deliberately silent. `js/audio.js` has the named cues already wired in
  at every call site, so adding sounds later is a change to that file alone.
- 2026-09-22 — Declutter pass at Dan's request. The four circles around the nest
  now start joined to it by honey tunnels (they were already eaten but drew as
  floating discs). Dotted trails cut from 7 to 4 and faded; printed lines thinned
  to 4.2px at 72% white; bark blobs and grain roughly halved; drifting leaves cut
  from 9 to 5 and made smaller and fainter; unlit arrow pips dropped to 24%; the
  decorative KURINGGAI label removed. The separate MEALS and SCORE panels merged
  into one, so the rail is two panels instead of four.
- 2026-09-22 — Moth, panels, home screen and tutorial, all at Dan's request.
  **Moth**: crawling left, a plain rotation put it on its back. `Art.mothAt` now
  mirrors across its own axis past a quarter turn, so the head leads and the legs
  stay underneath. Its resting pose keeps the direction it arrived from instead of
  snapping back to face right. The head's dark lower half read as a gaping jaw and
  is now a small mouth.
  **Rail**: the meals block is two panes — big gold meal count on the left, the
  three rounds as chips on the right in the achievement-row style (green with the
  number once banked, gold outline for the round in progress, grey dash for a
  round not reached). The score block is the same shape: big number left, rank and
  distance to the next rank on the right.
  **Home screen** rebuilt: centred title, a live strip of the game itself with the
  moth crawling a tunnel and turning the circles to honey behind it, Play and How
  to play, and the rank ladder as one row of chips that fill in green as they are
  reached. Chip labels auto-shrink to fit, because "Ghost of the Scribbly Gum" does
  not fit at the same size as the others.
  **Tutorial**: a five-page overlay with drawn diagrams — tile flip, tap a glowing
  circle, one of each makes a meal, four arrows buy an extra move, three rounds
  then a rank. Opens automatically the first time Play is pressed, and from the
  How to play button after that; `seenTutorial` is stored alongside the best score.
- 2026-09-22 — **Board rebuilt from a measurement of the printed sheet.** Every
  circle on the Kuringgai diagram was detected, classified by colour and sized to
  separate singles from doubles from triples; every possible connector was scored
  for brightness; the dotted trails were isolated and traced to their endpoints.
  Findings are in `research/printed-board.json`. What changed:
  * 8x8 (64 circles), not 9x9. The nest is the four centre circles as a 2x2
    block, NOT joined to each other, each with exactly two printed lines out.
  * Food is the printed mix: per type 13 singles, 3 doubles, 1 triple — 22 items
    each, not the 36 the first build dealt — plus 9 wild circles, not 6.
  * Only 92 of the 112 possible orthogonal lines are printed, so 20 pairs of
    neighbours are not joined at all. The first build joined every neighbour,
    which is why the player was never once squeezed.
  * 14 dotted trails, each joining two circles that are NOT neighbours (usually a
    knight's move apart), arcing clear of whatever sits between them. The first
    build had short diagonal hops between adjacent circles.
  * The wild circle is now the printed pale-blue droplet with a question mark,
    instead of three shrunken food icons that merged into a smudge at board size.
  Boards are generated per game to that recipe rather than reprinting the one
  sheet, with guards so no circle is stranded and the tree never splits in two.
  Random play now scores 15–22 (mean 18) where it used to score 17–46 (mean 29),
  so the rank ladder came down to 0 / 14 / 20 / 26 / 32 / 38 / 45.
- 2026-09-22 — Drag to move, at Dan's request: put a finger on a circle already
  eaten and drag the moth onto one that glows. A dashed honey elastic follows the
  finger, the target under it swells, and letting go anywhere else crawls the moth
  home. Tapping a highlighted circle still works as a fallback so a fumbled drag
  is not a dead end. Grabbable circles carry a faint cream ring.
- 2026-09-22 — Theme music wired. `research/mmm-leaves.m4a` encoded to
  `audio/mmm-leaves-theme.webm` (Opus, 48k VBR, -6dB, 2.4MB → 938KB) per
  `knowledge/audio-patterns.md`; nothing is fetched until the first gesture
  (verified in the headless test), no mute button, pauses on a hidden tab. The
  runtime SFX in `js/audio.js` are now real: tile flips, pick-up, crawl, chew,
  stamp, extra move, achievement, round end, game over.
- 2026-09-22 — Also: favicon link added (it was missing entirely); the game is
  called "Mmm! Leaves" in all user-facing text, including the home-page card and
  the games index; the header moved to the top right; the meal tracker got bottom
  padding so NUT / LEAF / BLOSSOM are not jammed against the panel edge; the grass
  now runs off both sides of the frame, not just the right.
- 2026-09-22 — Pace and motion, at Dan's request.
  **Snappier.** Every blocking duration now sits in one `T` table at the top of
  `js/game.js`. A turn cost about 2.2s of animation before you could act again —
  across 26 moves that is a minute of watching. Measured drag-to-ready is now a
  median of 1.12s. The biggest win: a move committed by dragging uses a 150ms
  crawl with an ease-out instead of the full 300ms ease-in-out, because the
  player has already dragged the moth to the target and watching it re-walk the
  line is dead time. Tile flip 480→300, chew 260→150, circle pop 320→200, food
  flight 420→260 with the stagger 130→70, gap between turns 240→120, drag
  spring-back 220→150.
  **The crawl was already tweened** — cubic ease-in-out along the tunnel — but
  two things were wrong underneath it. The path generator steps by parameter, not
  by distance, so a wavy stretch packed more length into the same step and the
  moth sped up over the wobbles; paths are now resampled to even spacing
  (`Art.evenly`) so the easing curve is the only thing shaping the speed. And the
  body wriggle ran off `clock` at a fixed rate whatever the moth was doing; it now
  has its own accumulator that runs ~2.3x faster while moving or being dragged.
- 2026-09-22 — Dotted trails no longer cross any other circle. Arcing them around
  the obstruction was not enough: a bowed line has no offset left near its own
  ends, which is exactly where the awkward circles sat, and 39 of 40 generated
  boards still had an overlap. Trails are now *routed* instead — out of the start
  circle into the diagonal gap between four circles, along the corridors between
  rows and columns, into the end circle. Every combination of start gap, end gap
  and turn order is tried and scored on clearance, preferring a clear route and
  then a wandering one. Corner-cutting (`Art.chaikin`) smooths the staircase and
  can only pull the line inward, so it cannot bulge back over a disc; a 2.6px
  wobble on top keeps the hand-drawn look. Checked across 40 fresh boards:
  0 overlaps, minimum clearance 12.5px, median 13.5px (`dotcheck.js`).
- 2026-09-22 — Removed the "banked R1 … R2 … R3 …" line from the round-done card
  at Dan's request; the card is 32px shorter and the button moved up with it.
- 2026-09-22 — Typeface, tile row and rail layout.
  **Atma** (Google Fonts) is now the face for everything, hosted rather than
  vendored — the convention in `arcade-build.instructions.md` was amended to
  allow linked Google Fonts as the one exception to the no-network rule, since a
  font that fails to load just falls back to `system-ui` and the game plays on.
  Canvas does not re-measure when a webfont lands, so the first frame waits on
  `document.fonts.ready` with a 1.2s escape hatch.
  **The seven movement tiles now fill the rail** — width is derived from the rail
  (`(railW - 6*gap)/7`) rather than fixed at 62px, and the height follows so they
  stay square.
  **The achievements and score panes swapped**, and the right-hand column is now
  laid out to start and finish exactly level with the meal tracker beside it:
  148 at the top, 608 at the foot. Meals 148–276, achievements 290–486,
  score 500–608.
- 2026-09-22 — Caleb and Ezra, with separate high scores.
  Two buttons on the home screen — **Play as Caleb** and **Play as Ezra** — so
  there is no player-select step to get through; pressing one starts that boy's
  game. Whoever is playing is named in the in-game header, and the score pane
  shows their best, not a shared one.
  The ladder moved off the bottom of the screen: it is now a **fixed vertical
  scale down the right-hand side**, top rank at the top, with a gold arrow and
  name tag beside the rung each boy has reached and their best score on it. Both
  on the same rung stack rather than overlap. Rungs light green up to the higher
  of the two.
  Saves changed shape: `calebArcadeData:mmmLeaves` now holds
  `{ players: { caleb: {score, rank, plays}, ezra: {…} }, seenTutorial }`. The old
  single unattributed `best` is not migrated — it could not be assigned to either
  boy honestly, so the ladder starts empty.
- 2026-09-22 — Ladder redrawn as a measuring scale, plus three fixes.
  **The ladder** is now an axis, not a stack of chips: one vertical line hard
  against the right edge, a tick reaching left from it at each rank threshold
  with the score just past the axis and the rank name out at the far end of the
  tick, and a gold arrow per boy pointing right at the exact height of his best
  score. Markers sit at the real value rather than snapping to a rung, so two
  close scores read as two heights; if they would still collide they are pushed
  apart. The tick scores moved to the outside of the axis after a marker landing
  near a threshold covered one up.
  **Music started on the second tap, not the first.** `el.load()` immediately
  before `el.play()` aborts the play it precedes — the promise rejects, the
  handler re-arms, and the next tap works. With `preload="none"` the play() call
  fetches on its own, so the load() is gone. Verified: nothing requested before
  the gesture, one click and the track is running.
  **The wild circle's question mark was not in Atma.** Canvas never triggers a
  font download — it silently falls back for any face the page has not already
  pulled in some other way. The body and back button use 400 and 600, so weight
  700 was never fetched and every `bold` canvas string rendered in system-ui.
  Boot now calls `document.fonts.load` for 400/500/600/700 and waits on all of
  them. The glyph also sits on its measured ink rather than its em box, so it
  centres in the droplet whatever face is loaded (nudged 5px down to Dan's eye).
  **Achievement colours were back to front.** Solid gold read as "already won",
  when it actually meant "not yet claimed, worth the gold figure". Solid gold
  now means claimed, with a drawn tick beside the points so it is not carried by
  colour alone; unclaimed ones borrow the round chips' language — a gold tint and
  outline while still worth gold, faint white once flipped to silver.
- 2026-09-22 — Ladder regraded to even steps of 6 up to 48 — nine rungs, so the
  scale reads like a ruler rather than a set of arbitrary jumps. Two new ranks
  fill the gaps: Sap Sipper at 6 and Midnight Muncher at 30. Full ladder:
  0 Bark Nibbler / 6 Sap Sipper / 12 Leaf Rustler / 18 Blossom Bandit /
  24 Gum Glutton / 30 Midnight Muncher / 36 Moonlit Moth / 42 Emperor of the Bark /
  48 Ghost of the Scribbly Gum. Random play scores 15–22, so it lands mid-table.
  Wild circle's question mark nudged to 3px below centre.
- 2026-09-22 — Music, second attempt. The first fix (dropping `el.load()`) did
  not settle it, and the test that "passed" had been launched with
  `--autoplay-policy=no-user-gesture-required`, which disables the very thing
  under test — a worthless check. Re-run with Chrome's real policy, one click
  starts the track and a single touch tap does too, so the remaining fault could
  not be reproduced here. Rather than guess: the handler is now armed on
  pointerdown, pointerup, click, touchend and keydown, stays armed until the
  element is genuinely playing (not merely until play() was called), and the
  game's own pointer handler calls `Sfx.startMusic()` as well. That gives one
  physical tap three or four attempts instead of one.
  **Lesson for the next game: never verify an autoplay fix with the autoplay
  policy switched off.**
- 2026-09-22 — Ladder set from simulation, not feel. `research/sim.js` loads the
  real board/tracker/achievements modules and plays the game headlessly, so the
  rules simulated are the rules shipped. ~13,000 games across four skill levels
  plus 140 with Monte Carlo lookahead standing in for optimal play:

  | player | mean | sd | p90 | p95 | max |
  |---|---|---|---|---|---|
  | random taps | 21.4 | 5.7 | 29 | 31 | 41 |
  | kid, 45% random moves | 30.8 | 5.9 | 38 | 40 | 48 |
  | kid, 25% random moves | 32.6 | 5.8 | 40 | 42 | 48 |
  | every move played well | 34.5 | 5.6 | 42 | 44 | 50 |
  | lookahead (~optimal) | 42.8 | 4.1 | 48 | 48 | 50 |

  The standard deviation is ~5.8 at every human-like level, and the structural
  ceiling is 50 — about 26 meals banked over three rounds, 3 for one full column
  (two is arithmetically possible but wrecks the meal count), and at most 21 from
  three achievements. Nothing beat 50 in 13,000 games.
  The old top rung of 48 sat at the 95th percentile of *lookahead* play — around
  one game in 1,300 for a child. Ladder reset to steps of 5 topping at 40, which
  a decent kid reaches roughly one game in seventeen, one in nine once they are
  good, and which still leaves ten points of headroom for a blinder.
  Rerun with `node research/sim.js fast` or `node research/sim.js hit`.
- 2026-09-22 — Home-page card moved to the end of the grid in the root
  index.html; wild circle's question mark settled at 1.5px below centre. Card icon changed from the fallen-leaf emoji to the caterpillar (U+1F41B) — not used by any other card.
