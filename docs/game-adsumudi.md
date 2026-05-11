# Adsumudi

A digital emulation of the [Adsumudi](https://www.adsumudimathgame.com/) card-based mental math game. The card is a hexagon with 5 colored slices for the small numbers and one black slice at the top holding the "ADSUMUDI" logo. The center white circle shows the target ("Adsumudi's answer"). Combine the five small numbers with + − × ÷ to reach the target. Math evaluates **left to right** — no PEMDAS — so `3 + 4 × 2 = 14`, matching how kids actually compute the path with physical cards.

## Features

- **Hexagonal SVG card** with 5 colored number sections (red, yellow, pink, teal, navy) plus black logo area at top. Flat-top hex matching the official card geometry. Numbers rotate to follow the section angle like the official online tool.
- **Multi-color ADSUMUDI logo** rendered as SVG text in the top slice, with the card type ("CLASSIC" / "FUN ONES") and play level ("EASY" / "MEDIUM" / ...) printed underneath as sub-labels.
- **Play Level** pills: EASY (any 2+ numbers), MEDIUM (3+), HARD (4+), MONSTROUS (all 5 required).
- **Card Type** pills: CLASSIC (all four operators, larger numbers up to 30) and FUN ONES (numbers 1–12, only + and − needed; × and ÷ disabled).
- **Card Difficulty** 1–3 stars — read-only indicator randomly assigned per card. Controls number pool and target range behind the scenes.
- **Operator buttons** as round dark teal circles (+ − × ÷) under the hex; black pill RESET button beneath.
- **Live expression strip** showing the running computation: `3 + 4 × 2 = 14`. Equals-value highlights green when it matches the target AND meets the play-level minimum.
- **Win check** requires both correct answer AND enough numbers used. A correct answer using too few numbers shakes the expression strip as a hint.
- **Stats** in the top HUD: Solved (lifetime), current Streak, Best streak — persisted to `localStorage` under `calebArcadeData.adsumudi`.
- Confetti burst + chime cascade + center-number flash on every solved card.
- Card auto-deals after a brief win animation. Streak resets when you change Play Level or Card Type.
- Keyboard: `1–5` select number slice, `+ − * /` operators, `r`/Backspace/Esc to reset, `n` for a new card.

## File structure

Single-file `games/adsumudi/index.html` — uses Google Fonts (Barlow Condensed) for the number display, no other external assets, no build step.

## Key design decisions

- **Left-to-right evaluation, not PEMDAS.** A 7-year-old playing a physical Adsumudi card thinks "3 plus 4 is 7, times 2 is 14" — they apply operators in the order they pick them. Forcing PEMDAS here would silently change the running total mid-build and confuse kids. The official online tool also evaluates left-to-right.
- **Card generator works by construction.** Pick 5 numbers, then random-walk a chain of operations of length `[minNumbersForLevel..5]` over a random subset; the final value becomes the target. This guarantees every card has at least one solution that satisfies the play level. Constraints during the walk: no negative intermediate results, no non-integer division. Cards where the target equals one of the printed numbers are rejected (trivial).
- **Monstrous mode forces useCount = 5** so the cards always have a solution using all five tiles.
- **SVG polygon-based hex.** A black `hex_bg` polygon provides the background/logo area; 5 colored section polygons overlay it (matching the official card geometry). No strokes between sections. White circle and target number sit on top. Click-targeting is the full polygon area per section.
- **Streak resets on settings change.** Otherwise you can grind streak on EASY then bump modes and inherit the streak unfairly. Card difficulty is random per card (not user-controlled) so it doesn't reset streak.
- **No "collect 5 cards to win" overall goal.** The physical game has that mechanic but the online tool doesn't — it just streams cards, and the same here. Streak + best-streak are the goal.
- **Card-type label inside the logo slice.** The official tool puts "FUN ONES" and "EASY" right under the ADSUMUDI wordmark inside the top black slice, so we do the same — it's a clear at-a-glance reminder of current mode without taking screen space.

## How it was built

Built from scratch off the [adsumudimathgame.com online tool](https://www.adsumudimathgame.com/online-math-games-for-kid) — looked at screenshots of the hex card layout, mapped slice colors, ported the play-level / card-type / card-difficulty controls. No research clone — the game is small enough to implement directly.

## Color palette

| Slice (clockwise from top) | Hex |
|---|---|
| 0 (logo, top) | `#0d0d1a` black |
| 1 (top-right, red) | `#f0504e` |
| 2 (bottom-right, yellow) | `#f2ca37` |
| 3 (bottom, pink) | `#f16b9d` |
| 4 (bottom-left, teal) | `#0ba9b2` |
| 5 (top-left, blue/navy) | `#0a4a7a` |

Page background: `#2496c4` (bright teal).
Operator buttons: `#1a6b8c` (darker teal).
Reset button: `#0d0d1a` black pill.

## Bug fixes / notes

- Card difficulty changed from user-selectable (in Help modal) to randomly assigned per card. Stars rendered as SVG polygons inside the top black section.
- SVG rewritten to match official Adsumudi card geometry: flat-top hex with polygon sections (not pie-slice paths), no black borders between sections.
- Target number and section numbers use Barlow Condensed font; target auto-sizes smaller for 3-digit numbers (≥100).
