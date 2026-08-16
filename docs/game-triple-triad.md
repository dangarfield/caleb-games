# Triple Triad

Final Fantasy VIII's **Triple Triad** card game, adapted from the GPL v3 project
`itdelatrisu/triple-triad-html5`, with an original **card-collecting progression
system** on top. Play a 3×3 board with 5 cards each; placing a card flips
orthogonally-adjacent enemy cards it out-ranks. Beat tiered FF8-character rivals
to win new cards and unlock the next opponent.

## Features
- **110-card database** (levels 1–10, 11 per level), ported verbatim from the
  source `deck.js` (`{id, name, ranks:[top,left,right,bottom], element, level}`).
  The level-10 cards are the real FF8 characters (Squall, Seifer, Edea, Rinoa,
  Quistis, Zell, Irvine, Selphie, Laguna, Kiros, Ward).
- **All 7 optional rules**, per-opponent and shown before each match: OPEN, SAME,
  SAME_WALL, PLUS, COMBO, ELEMENTAL, SUDDEN_DEATH.
- **10 tiered rivals + a tutorial** (FF8 characters as portraits). Opponent hands
  are **graduated** (not all top-tier): tier N ≈ 3×level-N + 1×(N-1) + 1×(N-2),
  clamped; tier 1 = all level 1.
- **Progression / unlock:** beating a rival lets you win a card; unlocking the
  next rival requires **5 wins** against the previous one. Tutorial and tier 1
  are always open. Losing has no penalty (keep all cards, retry).
- **Card reward on win:** offered up to 3 unowned cards; reward level is capped at
  the opponent's tier **+1**, and the +1 level is only offered while you own
  fewer than 4 of it. If nothing is eligible, it shows a "beat a tougher rival"
  message rather than handing out higher cards.
- **Collection: one of each card.** Starts with the 11 level-1 cards so you can
  field a legal hand immediately. Persists per player.
- **Deck builder** — pick your 5-card hand from owned cards; **Auto-select /
  Best 5** button; unselected cards tinted red, selected blue; compact combined
  info line; action buttons beside the hand. **Card viewer** browses all 110
  (owned show full detail; locked show only their level).
- **AI:** four personalities from the source (random / offensive / defensive /
  balanced), chosen by tier; greedy 1-ply (intentionally beatable for kids).
- **Match feel:** landscape-locked stage, board-mat art aligned to the placement
  grid, first move ~60% player / 40% opponent, card-flip/capture animations,
  Web Audio SFX, streamed BGM.
- **Player select (Caleb / Ezra)** with independent collections + progress.

## File structure
Multi-file (justified — 12MB of bundled card art), classic `<script src>` (not ES
modules) so it runs over `file://`; one global namespace `TT`.
- `index.html` — shell, GPL/attribution header, script order.
- `js/data.js` — 110-card DB, elements, rule metadata, 11-rival roster,
  progression tuning, `NO_REWARD_MSG`.
- `js/rules.js` — `resolveMove` (all rule resolution), the AI personalities,
  `bestFive`, `buildOpponentHand`, `rewardChoices`.
- `js/assets.js` — sprite-sheet frame maths, lazy card-art loader, Web Audio SFX
  (+ synth fallbacks), streamed BGM, gesture-gated AudioContext.
- `js/ui.js` — theme, buttons, chips, scroll, the one card renderer.
- `js/match.js` — the match engine, board/hand layout (landscape), HUD.
- `js/screens.js` — player select, rival select, deck builder, card viewer,
  reward pick.
- `js/game.js` — boot, saves, routing, help overlay, input, rAF loop.
- `img/` — 110 card PNGs + board mat, element/rank/frame sprite sheets, card back
  (~12MB). `sounds/` — 7 SFX wavs (~388KB). `LICENSE` — GPL v3 verbatim.
- `research/` (gitignored) — the cloned source repo + headless test harnesses.

## Key design decisions
- **GPL v3 (derivative work):** `LICENSE` bundled verbatim, attribution to Jeffrey
  Han (itdelatrisu) + asset credits (MCINDUS, UltimeciaFFB, chrfb, TekkamanChronos)
  and the Square Enix disclaimer in per-file headers. (An in-game Credits screen
  was removed at the user's request; attribution lives in the files + LICENSE.)
- **Reused the source's rules + AI, reimplemented the engine.** `resolveMove` was
  differentially tested against the original `result.js` (40k random cases, 0
  mismatches); jaws/howler were NOT ported (Canvas 2D + Web Audio instead).
- **BGM streamed, not bundled** (user decision): loaded from
  `https://itdelatrisu.github.io/triple-triad-html5/sounds/bgm.mp3` (CORS `*`);
  fails silently offline. The only external request. SFX are bundled locally.
- **Save shape:** `calebArcadeData.tripleTriad.<caleb|ezra>` =
  `{ owned:{id:true}, beaten:{tier:true}, wins, losses, draws, lastHands:{tier:[ids]}, tutorialDone }`.
  Unlock = `wins[tier-1] >= 5` (tier ≤ 1 always open).
- **Landscape-locked:** the match only renders in landscape; portrait shows a
  "rotate your device" prompt and pauses the match (menus still work in portrait).

## Memory
- Built via the `new-game` recipe (concept given; scout skipped). Source cloned to
  `research/`. Reviewer PASS after one fix round; several later rounds of
  user-directed UI/economy tweaks applied directly (review skipped per user).
- Reviewer-caught bug: **card-viewer "Back" was a dead no-op** trapping touch-only
  players — `drawViewer` dispatched `action:'deck'` but `act()` had no `case
  'deck'`, and `G.opponent` was only cleared on player-select. Fixed with the
  missing case + a `viewerFrom` breadcrumb resolver shared by the button and the
  Escape path.
- Bug: **AudioContext blocked** ("was not allowed to start… after a user
  gesture"). The context was created too late. Fixed by creating + resuming it and
  calling `loadSfx()` inside the player-name click handler (fired on pointerup with
  a real user-activation check); cues pressed before activation are queued and
  played on release.
- Bug: **HUD centre message overlapped the opponent name** at phone widths — later
  superseded by a rebuilt centered header `Opp N | phase | N Player`.
- Bug: **unclaimed reward silently forfeited** on Rematch/Esc — now auto-claims the
  first offered card on exit (+ a `pagehide` listener).
- Reward economy iterated with the user: capped at tier +1, +1 gated to <4 owned,
  and **no upward widening** (shows a message when nothing's eligible) so a young
  player isn't handed cards far above their level.
- Card sort was reversed then reverted to ascending level 1→10 (a reversed viewer
  opened on a wall of locked "Lv 10" plates).
- AI is deliberately left as the faithful greedy 1-ply port (beatable for the kids)
  after the user opted not to strengthen it.
