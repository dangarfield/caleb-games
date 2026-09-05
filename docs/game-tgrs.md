# TGRS

(Folder and doc are named `tgrs`; the user-facing title is **TGRS**, subtitle
"Times Garfield Rock Stars".)

A 60-second times-tables speed drill in the mould of *Times Tables Rock Stars*,
built for two brothers of different ages to play against each other and both
feel it is winnable. One mode, no menus of modes: press start, answer mixed ×
and ÷ facts from 1–12 for a minute, type each answer and hit ENTER. What makes
it more than a drill is the layer around it — every player has a **dynamic
handicap** that closes 80% of the skill gap, so the adjusted scores land close
together, and a dashboard shows each boy their speed, their Rock Status and how
their handicap has moved.

The game mode is an approximation of TTRS **Studio**: one minute, all tables to
12×12, an unlimited queue of questions, and a status ladder driven by average
recall speed. Multiplication-only Studio was widened to mixed × and ÷ because
that is what was asked for.

## Features

- **The round** — 60 seconds, a 3-2-1-GO countdown, one point per correct
  answer. Questions come from a **queue**: the current one is large and centre,
  the next two sit above it, dimmed, so you can read ahead. A question never
  repeats inside the visible queue.
- **Question mix** — `a × b` and `(a·b) ÷ a`, both operands 1–12. Division is
  always derived from a product so it is exact, and `÷ 1` is excluded (it isn't
  a times-table fact); `× 1` stays.
- **Forgiving on a wrong answer** — red flash and a shake, try again. After the
  **second** wrong attempt the correct answer is shown for 1.2s and the queue
  moves on, so a 7-year-old can't stall the whole minute on one fact.
- **Numpad with a togglable ENTER side** — large touch keys; the ENTER column
  sits on the right or the left, flipped mid-round with the `⇆ Enter` chip and
  remembered per player. There is deliberately no control for it on the home
  screen — it is set in the moment, by whoever is holding the tablet. Physical
  keyboard works too: digits, Backspace, Enter, Escape to bail out.
- **Players** — an **Edit** chip sits at the end of the name row and is the only
  way into player management, so the home screen is otherwise a row of names and
  a start button. Pressing it opens the selected player's settings — name,
  colour, tables-up-to — which edit **live**: there is no save button, and the
  chips and board update as you type. Edit becomes **Done** and **+ Add**;
  tapping another chip switches the panel to that player. **+ Add** shows the
  same fields blank for a new player, and that one *is* saved on **Done** (or
  when you tap another chip, so a typed name is never silently binned). Removal
  is a button inside the panel with an inline confirm on the chip — no browser
  dialogs. Up to 8 players, duplicate names get a numeric suffix, and a new
  player is offered a colour nobody is using.
- **Dynamic handicap (strong)** — see the design decisions below. Shown on the
  chip, in the HUD, and applied on the results screen as
  `score + handicap = adjusted`.
- **Handicap-change events** — when a player's handicap moves by 2 or more it
  fires an event: a banner on the results screen and a dated entry in the
  dashboard feed ("Ezra is closing the gap — handicap 16 → 13").
- **Rock Status** — the TTRS ladder, read off the *same moving average the
  handicap is built from*: speed = 60 ÷ your average score, so the badge, the
  handicap and your place on the board all come from one number. Thresholds are
  the standard ones — Rock Hero under 1s, Rock Legend 2, Rock Star 3, Headliner
  4, Support Act 5, Breakthrough Artist 6, Unsigned Act 7, Gigger 8, Busker 9,
  Garage Rocker 10, Wannabe over 10. Provisional (purple badge with a `?`) until
  the moving average is a full 5 rounds.
- **Per-player difficulty** — each player has a `maxTable`, the highest number
  the tables go up to: 12 by default, down to 2. Both operands are drawn from
  1..maxTable, so "tables to 6" tops out at 6 × 6. Set from the Add / Edit panel;
  shown under the player's name on the board and on the countdown when it is not
  12. It needs no separate balancing — an easier setting raises that player's
  average, which lowers their handicap by exactly as much.
- **One scrolling dashboard, no tabs** — the board, then the speed chart, then
  the handicap chart and event feed, all visible at once.
- **The board has a Garfield / Score switch.** *Garfield* (default) ranks the
  round you just played, handicapped. *Score* ranks the moving average — the mean
  of your last 5 rounds, no allowances, simply who answers the most in a minute.
  Both views show the same columns; the switch changes the sort and which column
  is gold. Raw score, average, high score and handicap are always on the row.
- Web Audio SFX throughout — a rising chime that sharpens with the streak, a
  buzz, countdown beeps, last-5-seconds ticks and a fanfare.

## File structure

- `games/tgrs/index.html` — the whole game: home/dashboard (DOM), play and
  results (canvas), numpad (DOM), model, charts, audio.
- `games/tgrs/js/arcade-store.js` — a verbatim copy of `games/potions/js/store.js`.
  Not modified; do not edit it here.

- **First run creates Caleb, Ezra, Mummy and Daddy** as empty profiles — names
  and colours only, no scores and no history. Created once and stamped
  (`data.seeded`), so deleting a player never brings them back; delete all four
  and the board stays empty, with the chip reading "+ Add a player".
- **The handicap chart and its message feed both show 5**, matching the 5-round
  window the rating is built from — a longer tail was mostly the settling-in from the
  first few rounds, which says nothing about current form.
- **The speed chart is log-scaled.** Seconds per answer runs from about 0.7s to
  20s across one family; on a linear axis a single bad round flattens everyone
  else into one line along the bottom.

## Key design decisions

- **The Garfield Score is the headline number.** `Garfield Score = the round's
  raw score + your handicap`. It is what the board ranks on, what the results
  screen shouts, and the only number the boys are meant to compete on. The raw
  score is always next to it, never replaced by it.
- **Your handicap is set by the 5 rounds BEFORE the one you just played.** A
  player's `rating` is the plain mean of their last 5 scores (`RATING_ROUNDS`) —
  a plain mean rather than an exponential moving average, because anyone can
  check it off the board. The **weakest** rating is the zero mark and everyone
  else carries a penalty: `handicap = −round(rating − floor)`. The round being
  scored is not in its own handicap; it is added to it.
- **`HANDICAP_STRENGTH` is 1.0, and it has to be.** At 0.8 the deliberate 20%
  residual on a 75-point gap was 15 points — wider than Ezra's entire range — so
  the weakest player could never top the board however well he played, which is
  the whole point of the thing. At 1.0, par-for-par everyone lands on the same
  Garfield Score and the round is won by whoever most beats their own average.
- **Two handicaps exist, and keeping them apart is what makes the board honest.**
  The one a *past* round was played off comes from that round's own `par` — the
  mean of the 5 rounds before it — so a round is never inside its own handicap.
  The one a player *carries into their next round* is `p.handicap`, which does
  include what they just scored; that is the number on their chip. The board
  shows the first, the chip shows the second.
- **Both are measured from today's floor** (the weakest current rating). The
  floor is a shared anchor, so it cancels out of any comparison — the ranking
  reduces to how far each player beat their own average, which does not drift.
  That is what lets rounds played days apart sit on one board and still be fair.
  Showing each round's stored Garfield Score instead ranked a stale round above
  a fresh one whenever the floor had moved, and the row stopped adding up.
- **One number, computed one way, on both screens.** The results screen takes its
  headline from `boardRows()` *after* the recompute, so what it shouts is exactly
  what the board shows a second later. An earlier version shouted 22 and then
  displayed 19.
- **"Best" is measured against your own average, not in Garfield points.** A
  first-ever round has no handicap (there is nothing to average yet), so its
  Garfield Score is the raw score and would stand as an unbeatable best forever.
  `bestVsPar` only counts rounds that carried a handicap, and reports points
  above that round's own par, which does not drift as handicaps move.
- **The event feed narrates the leaders, not the chaser.** With the weakest
  player pinned at 0, a floor player improving shows up as *everyone else's*
  handicap easing toward zero rather than as a change on their own row. The
  wording follows: "is pulling away" when a handicap goes more negative, "is
  being reeled in" when it eases.
- **Speed is a per-question mean, not a mean of round means.** A round stores
  `n` (how many questions it timed) as well as `speed`, and the status average
  is `Σ(speed·n)/Σn` over the window. Without this, one lucky two-answer round
  outweighs a thirty-answer one.
- **Every question that leaves the queue is timed, right or wrong** — including
  the ones that time out to a reveal. Timing only the correct answers made
  giving up on the hard facts free, and rewarded it in the ladder.
- **The status gate and the status average use the same window.** Both are "the
  last 10 rounds that actually had answers". They used to differ, which let a
  full ladder title be awarded off a sample of one.
- **The handicap chart gets a point per recompute, not per change.** Its x axis
  is rounds; if players only got a point when their own value moved, two lines
  at the same x would not be the same moment.
- **Saves are in IndexedDB via `arcade-store.js`**, key `calebArcadeData:tgrs`,
  with the `sid`/`gen` two-tab guard and `{guard:true}` writes. History is
  capped on the way in (50 rounds, 60 handicap points, 40 events) rather than
  pruned after a refusal, and `Store.working()` is checked at boot so a private
  window says so before the minute is played, not after.
- **The home screen is DOM, the game is canvas.** The dashboard is tables and
  charts, which DOM does better; the HUD pill and the game-over screen are
  canvas-drawn per the arcade conventions.
- **A provisional status is a UI preview, not a weaker rule.** The award still
  needs a full 10-round window; below that the same calculation is shown, marked
  as provisional. Without it a family that has played six rounds sees nothing but
  "New Artist" on every row, which tells them nothing about how they are doing.
- **Nothing is named after the real product** beyond the mechanics, which aren't
  copyrightable. "TGRS / Times Garfield Rock Stars" is the family's own name for
  it.

## Memory

- **Ten rounds of zero answers used to promote you to Rock Hero.** `studioSpeed`
  returns `null` when no round in the window has answers, and `null <= 1` is
  `true` in JS, so the ladder loop matched the top rung and the screen printed
  "Rock Hero · 0.0s average". Fixed by returning early on a null average and
  gating the status on the same filtered window the average uses.
- **A `NaN` rating poisoned the entire board, not just its owner.** The
  handicap baseline is `Math.max(...ratings)`, so one player with a missing
  `rating` made every player's handicap `NaN`, which serialised to `null` on
  disk. `loadData` now rebuilds a missing rating from the last round's score and
  the baseline only considers finite ratings.
- **"Play Again" stacked a render loop each time.** The game-over loop was still
  pumping when `startRound()` requested a fresh one, so ten replays meant eleven
  full draw passes per frame. Fixed with a `loopId` token that every chain
  checks before it draws.
- **The enter-side chip sat on top of the HUD pill from 560px to ~715px wide** —
  exactly the tablet's landscape width. The pill's drop-down threshold was
  raised to 760px.
- **A numpad key you slid off stayed lit**, because `pointerup` used
  `e.target.closest('.key')`, which is null once the finger has left the key.
  It now clears every `.down` the way `pointercancel` already did.
- **The board drops columns rather than side-scrolling on a phone.** Raw last
  score, best adjusted, speed and round count carry `.opt` and are hidden under
  560px, leaving player / status / adjusted / handicap — the four that matter —
  fitting without a horizontal scroll. Speed has its own pane anyway.
- **Every handicap read as 0 and every Garfield Score collapsed to the raw
  score** on any save written before rounds carried a `par`. `hcapForPar` returns
  0 for a missing par, so the board showed Caleb 85 / Ezra 7 with a dash under
  "best vs avg" — the handicap system silently absent rather than broken. The
  seed could not repair it either, because it only fires when nobody has played.
  `loadData` now rebuilds `par` for any round that lacks one — it is just the
  mean of the 5 rounds before it, so it is recoverable exactly from the history —
  and boot runs a silent `recomputeHandicaps` so ratings and handicaps come onto
  the current formula before anything is drawn.
- **Pre-flip handicap history had to go, including the zeroes.** Handicaps used to
  be positive, so those points cannot be plotted against the current negative
  ones. Clearing only the players who had a positive value left anyone sitting on
  0 with orphaned points, so one positive value anywhere now clears the series for
  everyone, and the silent boot recompute gives each player a fresh first point so
  the chart is not blank afterwards.
- **Clearing the temporary dummy data.** The seeded players were the only ones
  ever given ids beginning `dummy` (a real player's is `p` + a timestamp), so
  `loadData` drops exactly those, along with any events pointing at them, and
  re-points `lastId` if it was one of them. Deleting the seed code alone would
  not have done it — a save already holding those players would have kept showing
  them, the same way the missing-`par` bug survived a code change earlier. The
  filter can be deleted once no save can still contain them.
