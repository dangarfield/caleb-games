# Air Hockey World Cup

Table air-hockey styled as a **World Cup knockout**. The player picks 1 of **16
nations**, then plays a 4-round single-elimination bracket — **Round of 16 →
Quarter-final → Semi-final → Final** — each match **first to 7 goals**. Win the
Final to become champions. An **optional Super Cup mode** (toggled at team select)
gives every nation a **signature special move** charged by a meter.

Portrait rink: the player defends the **bottom** goal and drags a mallet in the
bottom half; the CPU defends the **top** goal. Touch-first, tuned for a low-powered
tablet. Two profiles (Caleb / Ezra) keep separate cup counts.

Built (2026-08-29) at the user's request as a **multi-file ES-module** game (they
asked explicitly not to ship one large HTML), following the arcade's
`caesars-challenge` module pattern.

## Files

- `index.html` — shell: overlay, canvas, back button (`../../index.html`), mute
  button, and `<script type="module" src="js/game.js">`. A window `error` handler
  surfaces a module load/parse failure instead of a silent blank canvas.
- `js/game.js` — the shell: rAF loop, pointer input, screen state machine
  (`profile → select → bracket → play → matchover → champion/eliminated`),
  rendering, canvas-drawn HUD pill, bracket progression + round simulation,
  scoring, save/load, and Super Cup glue. Also owns boot (Play button, mute).
- `js/teams.js` — the 16 nations (flag emoji, two colours, AI skill 0..1) and
  `buildBracket(playerId)`.
- `js/physics.js` — puck/mallet circle physics, wall + goal-mouth collision,
  `malletHit` power transfer, `clampMallet` half-court clamp.
- `js/ai.js` — CPU mallet AI (defend / intercept / strike) scaled by team skill
  and a per-round difficulty multiplier.
- `js/moves.js` — Super Cup special-move definitions (6 types), per-team signature
  assignment, meter charging, and `fireMove` effect application.
- `js/audio.js` — Web Audio SFX (hit, wall, goal, whistle, win, lose, move…),
  generated at runtime, lazily initialised on the first user gesture.

## Features

- **16-team World Cup.** Player's team is seeded into a 16-team field; the other 15
  are ordered by skill with a light shuffle so the path varies. Each round the
  player faces a random surviving opponent; the rest of the round is simulated
  (skill-weighted) so the bracket thins 16 → 8 → 4 → 2 realistically.
- **First to 7** per match, canvas-drawn HUD showing both flags + scores + round.
- **Skill-rated CPU** — each nation has a skill rating driving reaction lerp, mallet
  speed and aim; a per-round multiplier ramps the Final harder than the Round of 16.
  Ezra's profile is slightly harder than Caleb's.
- **Touch control** — drag your mallet anywhere in the bottom half; mallet velocity
  is derived from displacement so a fast swipe drives a hard shot.
- **Super Cup mode (optional)** — toggle at team select. Adds a charge meter and a
  tap-to-fire move button; each nation has a signature move:
  - 🔥 **Power Slam** (Brazil, Germany, England) — next strike is an uncapped cannon.
  - 🛡️ **Big Wall** (Spain, Italy, USA) — mallet grows ~1.9× for 5s.
  - ❄️ **Deep Freeze** (France, Croatia, S. Korea) — freezes the opponent's mallet 1.6s.
  - 🧱 **Goal Shield** (Netherlands, Uruguay, Japan) — barrier over your goal for 4s.
  - 🧲 **Magnet** (Argentina, Portugal) — bends the puck at their goal for 2.5s.
  - 🐢 **Slow-Mo** (Belgium, Mexico) — slows the puck for everyone for 2.5s.
  The CPU also charges and fires its team's move.
- **Profiles + persistence** — own localStorage item `calebArcadeData:airhockey`,
  tracking per-profile cups, super cups, matches played and wins.

## Memory

- 2026-08-29 — Created. User asked for an air-hockey game with a 16-team World Cup
  team-select and an optional Super Cup mode with special moves ("implement the
  game first, then give me ideas for the moves"). Built base game + a first cut of
  6 special moves (signature per nation). Multi-file ES modules per the user's
  explicit request to avoid one large HTML.
- Open follow-ups if revisited: move ideas were proposed to the user for
  refinement; the initial 6 are a starting set, not final. Consider a
  best-of / penalties tiebreak and a visible mini-bracket view.
- 2026-08-29 (revision) — Kid-friendly rebalance + spinner rework at the user's
  request ("far too hard for the kids"):
  - Bigger mallets (MALLET_R_FRAC 0.052 -> 0.078) and a bigger puck (0.032 -> 0.040).
  - Light puck (`#f4f7ff`) with a dark accent ring + centre dot for visibility on
    the dark table.
  - Slower puck (MAX_PUCK_SPEED 2600 -> 1350, more friction, gentler bounces/strikes).
  - Much weaker, slower CPU: ai.js compresses team skill into a ~0.10..0.42 band,
    low reaction lerp and 340..640 px/s speed, with wobble that grows as skill
    drops. Round multiplier ramps only gently (0.80 -> 1.1) so the Final stays
    beatable by a child.
  - **Super Cup moves are now awarded by an animated SPINNER**, not fixed per
    nation. A six-slice wheel (Power Slam, Big Wall, Deep Freeze, Goal Shield,
    Magnet, Slow-Mo) spins and lands on a random move. Both player and CPU get
    spins; the PLAYER always gets the first spin (~4s in), then spins recur
    periodically (~12s +/- 4s jitter) alternating with a lean toward the player.
    You hold one move at a time and tap the bottom-right button to fire it.
    moves.js dropped per-team signatures (`TEAM_MOVE`/`moveForTeam`) and the
    charge meter; game.js gained `startSpin`/`finishSpin` + `drawSpinner`.
- 2026-08-29 (revision 3) — UX + debug tooling:
  - Spinner moved into a SMALL bottom-right widget (with a little dark disc only
    under the wheel) so it no longer covers the rink; the held-move button sits
    just above it, also bottom-right.
  - Removed the always-on mute button (top-right) entirely — sound is always on.
  - Added a hidden DEBUG match: a subtle translucent "?" on the profile screen
    (bottom-right) starts a random team-vs-team match with `S.debug` on, no
    win condition, and an on-canvas difficulty panel. New `js/tuning.js` holds a
    live `TUNE` bag (puck max speed/friction/size, mallet size, CPU speed floor +
    per-skill, CPU react floor + per-skill, skill cap, hesitation toggle);
    physics.js and ai.js now read TUNE every frame. Panel has −/+ per knob plus
    Hes toggle, Reset, New (reshuffle teams), Exit. Header shows the current
    matchup and the derived effective CPU numbers (`cpuEffective`).
  - Current shipped tuning: puck max 1350 px/s, friction 0.9968, mallet 0.078w,
    puck 0.040w, CPU skill cap 0.32, speed 210 + s·360 px/s, react 0.035 + s·0.16.
    Round multipliers 0.70/0.80/0.90/1.0 (Ezra +0.05). Effective CPU ranges from
    ~228 px/s (weakest team, R16) to ~304 px/s (best team, Ezra Final); player
    puck travels up to 1350 px/s, so the CPU can never keep up with a real shot.
- 2026-08-29 (revision 4) — Debug simplified to ONE Easy->Hard slider:
  - tuning.js reworked to a single-axis model: `TUNE.difficulty` (0..10) linearly
    blends an EASY preset (d=0) and a HARD preset (d=10) across every attribute
    at once — CPU speed, reaction, aim jitter, hesitation chance, puck max speed,
    mallet size and puck size. `setDifficulty(d)` / `applyDifficulty()` recompute
    the derived TUNE.* fields; ai.js and physics.js just read them.
  - ai.js `cpuThink(cpu, puck, rink, dt)` no longer takes skill/diffMul — it reads
    TUNE directly, so the debug slider and real matches share ONE axis.
  - game.js debug panel is now a single slider (drag or tap, −/+ nudge by 0.5,
    New = reshuffle teams, Exit). Header shows the derived CPU/puck numbers live.
    Debug match starts at difficulty 0 (easiest).
  - Real matches map onto the same axis via `realMatchDifficulty()`:
    roundBase [2,3,4,5] for R16..Final + up to +1.5 for team skill (0.70..0.92)
    + 0.7 for Ezra. So weakest R16 (Caleb) ≈ 2.0 and best Final (Ezra) ≈ 7.2.
    These are placeholders to be re-anchored once the user picks the sweet-spot
    number from a debug playthrough.
  - EASY(d0): CPU 190px/s, react 0.038, jitter 0.11w, hesitate 0.28, puck 1300px/s,
    mallet 0.086w, puck 0.044w.  HARD(d10): CPU 950px/s, react 0.34, jitter 0.008w,
    hesitate 0, puck 1750px/s, mallet 0.056w, puck 0.032w.
- 2026-08-29 (revision 5) — Per-profile trophies + best finish on the name buttons:
  - profileData gained `bestPlace` (0 = no finish yet). `recordFinish(place)` keeps
    the LOWEST-numbered place a profile has reached; called on champion (place 1)
    and on elimination (place by round lost: R16=16, QF=8, SF=4, Final=2). Debug
    matches never record. `ordinal(n)` formats 1->1st, 2->2nd, 16->16th.
  - The "Who's playing?" buttons are taller (74->92px) and now show a stats line
    under each name: `🏆 <total trophies (cups + superCups)>  ·  Best: <ordinal>`.
    Profile-tap hitbox height updated to match.
- 2026-08-29 (revision 6) — Attract mode behind the main menu:
  - Added a self-contained AI-vs-AI demo rally that plays dimmed behind the
    "Who's playing?" screen. It uses its OWN rink/puck/mallets (`S.demo`) and
    never touches real match state. Two `demoDriver` auto-controllers knock the
    puck around at a lively-but-not-frantic cap; goals just reset the puck after
    a short pause. `demoUpdate` runs from frame() only while screen==='profile'
    and re-inits on resize; `demoRender` draws it (globalAlpha 0.42) then
    renderProfile lays a 0.35 scrim over it so the menu text stays crisp. Random
    two teams each time the menu is shown.
- 2026-08-29 (revision 7) — Fixed puck-stuck-in-corner bug (demo + real):
  - Root cause: rounded corners are cosmetic but physics uses a square rink, so a
    mallet could shove the puck into the true rectangular corner (outside the
    rounded visual → looked "off the grid") and pin it there.
  - physics.js gained `clampPuckInside(puck, rink)` — a hard bounds clamp that
    forces the puck back inside the walls after any shove/special move, leaving
    only the goal mouth open. Called every frame after mallet hits in BOTH the
    real match loop and the demo.
  - Demo also gets a stuck-watchdog: if puck speed stays < 70px/s for > 1.6s it
    re-serves from centre (`demoServe`). New `demo.stuckTimer`.
- 2026-08-29 (revision 8) — Merged the Play overlay into the profile screen:
  - Removed the HTML #overlay + Play button entirely; the game now boots straight
    to S.screen='profile' with the AI-vs-AI demo running behind it. Audio still
    starts on the first pointerdown (sfx.init in the pointer handler), which is a
    valid user gesture. renderProfile now draws the '🏒 Air Hockey / World Cup'
    title above the Who's-playing heading, the Caleb/Ezra buttons, and the blurb —
    all one screen over the live demo. Cleaned the now-unused #overlay CSS;
    #bootErr repositioned as a standalone centered error box.
- 2026-08-29 (revision 9) — Portrait enforcement / rotate prompt:
  - Added a CSS-only #rotate overlay (animated phone icon + "Please rotate your
    device" message) shown via `@media (orientation: landscape) and (pointer:
    coarse)` — i.e. touch devices held in landscape. It hides the canvas + back
    button while shown. Portrait is never blocked, and desktops (fine pointer,
    can't rotate) are never blocked so the game still plays there. No JS/game-loop
    changes.
- 2026-08-29 (revision 10) — England flag fix:
  - The England flag emoji ('🏴' tag sequence) doesn't render on many
    devices (showed a plain black flag). Added a `drawFlag(team, x, cy, F, align)`
    helper in game.js that DRAWS England's St George's Cross on the canvas (white
    field + red cross + thin border) and falls back to the emoji for the other 15
    teams. Routed all flag render sites through it: select grid, bracket vs card,
    HUD pill (left/right aligned), debug matchup label, and champion screen. The
    teams.js England entry keeps flag '🏴' as an unused fallback string.
