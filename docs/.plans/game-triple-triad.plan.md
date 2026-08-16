# Game: Triple Triad (FFVIII card game) — with progression

Run plan for `/new-game`. Durable state — update at every step.

## Concept (GIVEN — scout skipped)
Final Fantasy VIII's **Triple Triad** card game, ported/adapted from
`itdelatrisu/triple-triad-html5` (cloned to `games/triple-triad/research/`).
3×3 board, each player 5 cards, cards have 4 ranks (top/left/right/bottom);
placing a card flips orthogonally-adjacent enemy cards it beats. Plus a
**progression / card-unlock system** the original doesn't have. Audience: Caleb
(7) + Ezra.

## Source (GPL v3 — LICENSE-flag at ship)
`research/triple-triad-html5/` — by Jeffrey Han. **GPL v3**: this is a derivative
work, so PRESERVE attribution + a copy of the GPL license and note it. Surface
the licensing at the ship gate (user's repo/call).
- `js/deck.js` — full **110-card DB** `{id,name,ranks[T,L,R,B],element,level}`,
  levels 1–10, 11 cards each. Level-10 cards ARE the real FF8 characters (Squall,
  Seifer, Edea, Rinoa, Quistis, Zell, Irvine, Selphie, Laguna, Kiros, Ward).
- `js/ai.js` — Random / Offensive / Defensive / Balanced AI. `js/main.js`,
  `js/result.js` — rule resolution. `js/settings.js` — the rule set.
- Rules available: **OPEN, SAME, SAME_WALL, PLUS, COMBO, ELEMENTAL, SUDDEN_DEATH.**
- Elements: NEUTRAL, THUNDER, EARTH, FIRE, ICE, WIND, POISON, WATER, HOLY (element.png sprite).
- Assets: `img/cards/001..110.png` (256×256, ~11MB total), `board-mat.jpg`,
  `element.png`, card-back, icons; `sounds/` sfx (~388KB) + bgm (mp3/ogg).
- Uses `jaws` + `howler` libs — DO NOT port these; reimplement in Canvas 2D +
  Web Audio per arcade conventions.

## Decisions (from user)
- **Audio:** bundle the small SFX (~388KB: card/select/flip/turn/start/invalid/
  special/back) locally. **Async-load BGM from the live URL**
  `https://itdelatrisu.github.io/triple-triad-html5/sounds/bgm.mp3` — verified
  HTTP 200, 4.1MB, `access-control-allow-origin: *` (CORS ok). Don't bundle bgm.
  Loop it; fail silently if offline.
- **Card reward on win:** beat an opponent → offered ~3 cards from that
  opponent's tier that you DON'T already own → pick 1 to keep. (Not FF8 trade
  rules; kid-friendly agency.)
- **On loss:** NO penalty — keep all cards, just retry.
- **Own only 1 of each card** (collection, not duplicates).

## Progression / unlock design (mine to design — think it through)
- **10 opponents**, tiers 1–10, each a real FF8 character (use their card art as
  portrait on the opponent-select screen). A **tutorial level (opponent 0)**
  before/at tier 1 that teaches placement + basic capture.
- **Opponent deck composition (graduated, NOT all top-tier):** a tier-N opponent's
  5-card hand skews to tier N but eases down — e.g. tier 10 = 3×L10, 1×L9, 1×L8;
  general rule: hand = mostly level N with 1–2 cards one/two levels below, and
  lower tiers correspondingly gentler (tier 1 = all L1; tier 4 ≈ 3×L4, 1×L3,
  1×L2). Define a clean formula in the spec so it scales across all 10.
- **Card rewards scale to tier:** the ~3 offered reward cards are drawn from the
  opponent's tier band (around level N), so beating tier N generally yields ~level-N
  cards — steady unlock without brutal difficulty. Never offer a card the player
  already owns; if none left at that tier, widen the band.
- **Unlock gating:** opponent N+1 unlocks after beating opponent N (or after N
  wins) — keep it simple and always-progressing. Tutorial always available.
- **Player starting deck:** a small set of low-level cards so they can immediately
  play tier 1 (e.g. the 11 level-1 cards, or a subset). Enough for a legal 5-card hand.
- **Per-opponent rule config:** each opponent has its own subset of rules enabled
  (data-driven map opponent→rules). Early opponents: none/OPEN only; ramp up
  SAME/PLUS/COMBO/ELEMENTAL/SUDDEN_DEATH at higher tiers. Show active rules before a match.

## Screens
- Player select (Caleb / Ezra) — per-player collection + progress in
  `calebArcadeData.tripleTriad.<player>`.
- Opponent select — 10 FF8 characters (+ tutorial), locked/unlocked, shows tier,
  active rules, portrait (character card art).
- **Card select (deck builder)** — choose your 5-card hand from owned cards;
  **Auto-select button** = picks your best 5 (by rank sum / heuristic);
  **card viewer** to browse the full collection (owned + locked silhouettes),
  showing ranks/element/level.
- Match screen — 3×3 board, hands, turn/score HUD, rule indicators, card-flip
  animations, result screen.
- Reward screen — pick 1 of ~3 tier cards on a win.
- Tutorial — guided explanation of placement + capture (+ maybe one rule).

## Conventions (hard constraints — re-state at every hand-off)
- [x] `games/triple-triad/index.html` (+ bundled assets in that folder; multi-file OK for a ported game). Canvas 2D. No jaws/howler/frameworks — reimplement.
- [x] Back button href EXACTLY `../../index.html`
- [x] `touch-action:none`, viewport `user-scalable=no`, large tap targets (touch-first)
- [x] Dark theme base `#0a0a2e`; accent `#6c5ce7`; gold `#ffd32a`
- [x] `calebArcadeData` localStorage, data under `data.tripleTriad`
- [x] Web Audio SFX (bundled). EXCEPTION: BGM async-loaded from itdelatrisu github.io URL (user decision)
- [x] Preserve GPL attribution + LICENSE (derivative work)

## Round 3 — user tweaks (route to builder AFTER the 6 reviewer fixes land)
1. **Match header: center everything.** Layout the HUD as one centered row:
   `<Opponent> <oppScore> | <turn phase> | <playerScore> <PlayerName>`, e.g.
   `Zell 4 | Your Turn | 6 Caleb`. Opponent score on the LEFT (their cards are on
   the left), player score + player's real name (Caleb/Ezra) on the RIGHT. Keep it
   all centered as a group.
2. **Remove sound on/off toggle** — sound is always ON. Drop the mute button.
3. **Dragging a card to place = full grid size.** While dragging a card to the
   board it must render at the same (larger) size it will be on the grid — always
   the correct larger size, not a shrunk hand size.
4. **Hand card sizing/overlap:** the 5 hand cards should be the correct larger
   size too; they may OVERLAP each other so the rank numbers stay visible. Align
   the top of the 5 hand cards with the top of the play/placed area and the bottom
   of the cards with the bottom of the placed-card area (i.e. hand cards match the
   board card height, fanned/overlapped to fit).
5. **Reward (winning card select) screen: show cards bigger.**
6. **Unlock gating change:** unlocking the next opponent requires **at least 5
   wins** against the previous opponent (not just 1). Track per-opponent win count.
7. **Card select + All-cards views: cards ≥2× bigger.**
8. **Locked cards minimal display:** for locked/unowned cards do NOT show
   name / details / image / stats — show ONLY the level number (no element).
   (Interpreting "unlocked" as locked cards; owned cards still show full detail.
   FLAG if the user meant something else.)
9. **Remove the Credits button entirely** (attribution stays in LICENSE + file
   headers; just no in-game Credits button/screen entry).

## Round 4 — reward cap + audio (route to builder)
10. **Reward band cap (replaces "widen upward indefinitely"):**
    - Max reward level offered = **opponentTier + 1** (never N+2 or higher).
    - The **(N+1) level is capped**: only offered while the player owns **fewer
      than 4** cards of that (N+1) level. Once they own ≥4 of the +1 level, stop
      offering it. (Levels ≤ N are offered freely as unowned.)
    - Prefer higher allowed levels first (N+1 if permitted, else N, then down),
      offer up to 3 unowned choices.
    - **If no eligible unowned card remains, DON'T widen upward** — show a message
      like "No new cards here — beat a tougher rival for higher cards!" (nudge to
      the next opponent). Example: player owns 4 level-5 cards, beats a level-4
      opponent → +1 is level 5, already 4 owned → nothing available → show message.
11. **Sound doesn't play — fix.** Audio in `js/assets.js`: AudioContext created in
    `ensureAudio`, SFX decoded lazily in `loadSfx` (needs a user gesture), `sfx`
    falls back to synth tones if a buffer isn't ready. Investigate why nothing
    plays — likely `loadSfx`/`ensureAudio` not actually triggered on the first
    real gesture, or the context stays `suspended` (resume() is async), or a
    stale `muted`. Ensure SFX reliably play from the first interaction onward.
    (Combine with round-3 item #2: mute button removed, sound always on.)

## Round 5 — selected-card offset in hand
12. When a hand card is selected, the current sideways-margin nudge is too small.
    Make it MUCH bigger — around **1/2 a card width** — so the overlapped cards
    beneath become visible. And it must NOT rise on top of its neighbours: the
    selected card just SLIDES sideways (left for the player's hand, right for the
    opponent's hand) into the gap, staying in-plane, not raised/overlapping above.
    (Refines round-3 #4 overlapping-hand layout.)

## Round 6 — audio gesture, landscape, sort, deck-build layout, board bg
13. **Audio gesture fix (concrete):** console shows "The AudioContext was not
    allowed to start. It must be resumed (or created) after a user gesture." →
    create/resume the AudioContext on an explicit early gesture — e.g. the
    **player-name (Caleb/Ezra) click** on player-select — and call `loadSfx()`
    there too. Supersedes/clarifies round-4 #11.
14. **Force LANDSCAPE.** The game/match should always play in landscape, never
    portrait. On a portrait device either rotate the stage 90° or show a
    "rotate your device" prompt — builder picks the cleanest; intent = never
    render the portrait match layout.
15. **Reverse card sort order** in BOTH the hand/deck selector and the all-cards
    viewer (whatever the current order is, reverse it — presumably so highest
    level / best first).
16. **Deck-build screen layout:** use the vertical space better — bigger images
    for the selected 5-card hand, put the buttons (Auto/Best-5, Fight, etc.)
    to the SIDE of the hand rather than stacked below, and combine the
    "No special rules · vs Zell · Tier 1" info block into a compact single area
    to minimise vertical distance.
17. **Board background = the board image, aligned to card placements.** The 3×3
    board-mat image should line up with the actual card-placement grid on the
    match stage. Remove the dark-blue gradient overlay behind the board — show
    just the board image (no #0a0a2e wash over the play area).

## Round 7 — sort revert + deck-build card bg colors
18. **REVERT round-6 #15.** Card sort in BOTH the deck builder collection and the
    all-cards viewer goes back to **level 1→10 ascending "as before"** (undo the
    reversal). This also fixes the "wall of locked Lv 10 plates on open" issue —
    owned low-level cards appear first naturally.
19. **Build-your-hand card backgrounds — use the RED/BLUE card FRAME VARIANT,
    not a tint.** `img/card.png` is a 256×768, 3-frame sprite: frame 0 = RED
    card background, frame 1 = BLUE, frame 2 = gray (matches the source
    CARD_RED/CARD_BLUE/CARD_GRAY). In the deck-builder collection grid, draw
    UNSELECTED cards on the **red frame (frame 0)** and SELECTED (in-hand) cards
    on the **blue frame (frame 1)** — the actual FF8 card background art, exactly
    as the owner colouring works in-match. NOT a coloured overlay/tint.

## Round 8 — in-match hand geometry + selection slide (supersedes item 12)
20. **Hand column geometry (landscape).** The 5 hand cards form a vertical column
    beside the board, overlapping vertically to span the grid height exactly:
    - TOP edge of the **1st** card aligns horizontally with the **TOP of the 3×3
      grid**.
    - BOTTOM edge of the **5th** card aligns horizontally with the **BOTTOM of the
      grid**.
    - The 5 cards are spaced/overlapped evenly to fit that span (cards are
      board-cell size; they overlap since 5 > 3 rows).
    - The column sits **1/2 a card width to the side** of the grid (player hand to
      the right of the grid, opponent hand to the left).
21. **Selection slide (fix current wrong movement).** Selecting a card does NOT
    bring it to front / raise it above neighbours. Instead it **slides
    horizontally TOWARD the grid** (player's cards slide LEFT toward the board;
    opponent side would slide right) so the selected card is more clearly visible,
    staying in-plane, same size, same vertical position. The current click-move
    behaviour is incorrect — replace it with this toward-the-grid slide.

## Round 9 — split the two card views' sort + locked-card unlock hint
22. **Deck builder ("Build your hand") collection:** sort the player's OWNED cards
    **10→1 (descending, best/highest level first)**. (This view only shows owned
    cards to pick from.)
23. **All-cards viewer:** show all 110 cards **1→10 ascending**. On each LOCKED
    (unowned) card, highlight/label **its level** AND **which rival to beat to
    unlock it** — i.e. the lowest-tier opponent whose reward band can yield that
    card's level. Mapping: a level-L card is first winnable from the rival whose
    tier makes L eligible as a reward (reward cap = tier+1, so tier = L-1, floored
    at tier 1; level-1 cards from tier 1 / tutorial). Show e.g. "Lv 7 · Beat
    <RivalName>". Owned cards still show full detail.
    (This diverges the two views — deck builder desc owned-only, viewer asc all —
    so `displayOrder`/render need a per-view mode.)

## Round 10 — selection tween, turn/winner indicators, rival unlock text
24. **Tween the selection slide.** The selected card's sideways move (toward grid,
    per round 8) should ANIMATE/tween smoothly on both selection and deselection,
    not snap instantly.
25. **Selected card sits a little further from the grid.** Increase the gap between
    the slid selected card and the board edge slightly (INTERPRETATION: currently
    it slides so close it nearly touches/overlaps the grid — leave a clearer gap;
    still slides toward the grid, just doesn't come as close). FLAG to user.
26. **Rivals view: per-rival "what you can win" text.** On each rival, show which
    card levels beating them unlocks, e.g. "Tier 2 · Win Level 1 cards and some
    Level 2". Derive the level range from the ACTUAL reward logic (`rewardChoices`)
    for that tier so the label is truthful; use the user's phrasing style. (If the
    true reward cap = tier+1 differs from the example's numbers, follow the logic
    and note.)
27. **Emphasise who is currently winning** more clearly in the header score — e.g.
    underline / highlight / gold the leading side's score+name (Zell vs Caleb).
    Draw = neither emphasised.
28. **Animated turn indicator:** a downward-facing arrow icon, spinning/animated,
    hovering ABOVE the card stack of whoever's turn it is (player's column when
    it's your turn, opponent's when it's theirs). Moves to the active side each turn.

## Round 11 — smaller starter deck
29. **Player starts with only 5 cards, not all 11 level-1 cards.** Pick 5 starter
    cards (level 1) — enough for exactly one legal hand. (Keeps deck-building
    meaningful: you must win more before you have real choice.) Update the
    starter-grant in the save-init.

## Round 12 — show current card name to the SIDE of the phase text
30. The center phase text ("Your Turn" / "Thinking…") STAYS centered and unchanged.
    Add the active card NAME to the SIDE, centered within the remaining space:
    - **Right** region (between center phase text and the player's score/name on the
      far right) → the PLAYER's currently-selected card name, centered in that gap.
    - **Left** region (between the opponent's score/name on the far left and the
      center phase text) → the OPPONENT's card name as they think/choose/place.
    So header reads: `Opp N  [oppCardName]  | phase |  [playerCardName]  N Player`,
    with each card name centered in its side gap. Blank when no card active on that
    side. Truncate to fit.

## Round 13 — narrow reward band + rival wording + exhausted highlight
31. **Narrow the reward band (change `rewardLevels`).** For a tier-N rival, rewards
    come ONLY from **level N** (the rival's own level) plus **level N+1** (capped:
    offered only while the player owns fewer than 4 of level N+1). Do NOT drop down
    to levels below N any more. So `rewardLevels` = `[N+1 (if <4 owned), N]` — no
    N-1, N-2… tail. (Tier 0 tutorial / tier 1 → level 1 + capped 2.)
    - When nothing in that narrow band is unowned/available → show the existing
      "beat a tougher rival" message (`NO_REWARD_MSG`), don't widen.
32. **Rival-screen wording (`rewardBandText`)** must match the narrowed band:
    e.g. tier 3 → "Win Level 3 cards and some Level 4" (NOT "Level 1–3…"). General
    form: "Win Level N cards and some Level N+1" (top tier 10 = just "Win Level 10
    cards"). Condense the "TIER 3" + this line into clear, tight copy.
33. **Exhausted-rival highlight (make it REALLY clear).** When the player has
    obtained every card that rival can give — i.e. owns all level-N cards AND owns
    ≥4 (the cap) of level N+1 — show a prominent, unmistakable indicator on that
    rival in the rivals list (e.g. a gold "All cards won ✓" badge / distinct
    styling). Derive "exhausted" from the same reward logic so it can't drift.

## Round 14 — regroup header: score+phase together centre, card names outside
34. The CENTRE cluster contains, together: `<Opp> <oppScore> | <phase> |
    <playerScore> <Player>` (e.g. "Zell 5 | Your Turn | 5 Caleb") — scores + names
    + phase grouped centrally, NOT pushed to the far edges. The CARD NAMES
    (round 12) move to the OUTER regions: opponent's active card name in the LEFT
    outer area, player's selected card name in the RIGHT outer area (each centred
    in its outer gap). So: `[opp card name] … Zell 5 | Your Turn | 5 Caleb …
    [player card name]`. Keep the winner emphasis on the leading score within the
    central cluster.

- [x] 1. Frame — concept given (FFVIII Triple Triad + progression), audience captured, source cloned
- [x] 2. Scout — SKIPPED (concept given)
- [x] 3. Spec → this plan
- [x] 3b. Copy needed assets from research/ into games/triple-triad/ (cards, board, element, icons, sfx) + LICENSE/attribution; build card DB + opponent/rule config data
- [x] 4. Build — delegate to game-builder (done: index.html + js/{data,rules,assets,ui,match,screens,game}.js, root landing card added)
- [ ] 5. Review — game-reviewer; loop fixes until pass
- [ ] 6. back-button-check green
- [ ] 7. game-docs-sync → docs/game-triple-triad.md + games-index.md + count; STOP-ship (flag GPL)

## Acceptance criteria
- [x] Plays with no JS console errors (BGM offline failure handled gracefully) — headless sweep at 414×820 / 900×430 / 360×640: 0 console errors, 0 pageerrors, 0 failed requests over `file://` (i.e. BGM unreachable)
- [x] Core Triple Triad rules correct: placement, orthogonal capture by rank, score, board-full win/lose/draw — `resolveMove` differentially tested against the original `result.js` (40k random cases, 0 mismatches); e2e asserts score == owned-slot count and outcome == score every turn
- [x] Configurable rules per opponent (SAME/PLUS/COMBO/ELEMENTAL/OPEN/SUDDEN_DEATH etc.), shown before match — chips on the rival list, the deck builder and the in-match HUD; help overlay explains only the active ones
- [x] 10 tiered opponents (FF8 characters) + tutorial; graduated opponent hands (not all top-tier) — verified 0:1/1/1/1/1 … 10:10/10/10/9/8
- [x] Progressive unlock: beat opponent N → unlocks N+1; card reward = pick 1 of ~3 tier cards you don't own
- [x] Own only 1 of each card; collection persists per player
- [x] Card select screen with Auto-select (best 5) + full card viewer (owned + locked)
- [x] Loss has no penalty (keep cards, retry)
- [x] Caleb/Ezra player select, per-player save
- [x] Touch-first; card-flip animations; result screen
- [x] Card art + board + elements bundled; BGM async from URL; SFX bundled
- [x] Card in root index.html (`href="games/triple-triad/"`); GPL attribution preserved (LICENSE + per-file headers + in-game credits screen). Docs (`docs/game-triple-triad.md`, `games-index.md` count) are step 7 — orchestrator
