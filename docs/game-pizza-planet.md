# pizza-planet

You're an intergalactic pizza chef. Each alien customer brings a picture ticket;
tap or drag silly toppings (socks, rubber ducks, googly eyes…) onto the dough to
match it **exactly** before their patience runs out. Coins buy new ingredients and
recipes; playing enough shifts (one pizza slice each) and buying every item opens the next of ten planets.

Built from the design handoff in `games/pizza-planet/research/Pizza Picasso game design/`
(`Pizza Planet - Design & Build Spec.md` is the brief; the `.dc.html` prototypes
and `pizza-data.js` are the visual/behaviour reference). Plain HTML/DOM like the
prototypes — no canvas, no React, no runtime — on a 1333×690 stage scaled to fit.
Touch-first, landscape. Two chefs: Caleb and Ezra, each with their own save.

## Features

- **Screens:** Home (pick chef, story blurb) → Galaxy map (10 clay planets, rocket,
  detail panel: locals, new traits, unlock checklist, Fly / Open / Shop) → Shift →
  Shift over → Galaxy. Plus the **Cosmic Pantry** shop and the **Alien Guide**
  (40 species × 3 colours, moods, trait filter, "Mutant" mixer).
- **The shift (60s):** pizza at (690,286), 380px; toppings on it are 96px (`TOP`, 1.5× the prototype). Tap a bin = drop on a free spot
  (best of 18 candidates); drag = place precisely; drag a placed topping to move it
  or off the pizza to remove it; Scrape clears. Dropping a part onto its partner
  (within 36px) makes the recipe; a tap converts a partner already on the pizza
  when the order wants that recipe. **The Everything** (3 parts) combines when the
  other two parts are on the pizza.
- **Exact match** only (placement irrelevant); auto-serve 220ms after exact → gulp
  (380ms) → result chip → next customer at ~1050ms. Patience 40s × trait; bar
  green/amber/red; at 0 "Too slow!". Hints (green ring + count badge / "+") only at
  ≤25% patience.
- **Counter:** 6 → 24 bins (planet's 6 + 2 per earlier planet, per `PPDATA.counter`),
  shuffled every shift, one row ≤8 else two rows, never scrolls. Unowned items are
  shown locked "In shop" and never ordered.
- **Traits — all implemented:** Regular; Sleepy (nods off at 72%/42%, tap the alien
  to wake before it will serve); Change of heart (❓ bubble 2s before 50%, swaps an
  item, +15% patience); Impatient; Snacker (steals one correct topping at ~62%,
  visible munch); Gobbler (8–12 toppings); VIP (−20% patience per wrong topping;
  parts of an ordered recipe don't count as wrong); Twins (two heads, two ticket
  sections, one pizza); Mystery (silhouettes, tap to reveal for −5%; hints skip
  hidden items).
- **Economy:** every planet has a multiplier `PPDATA.planetMult(i)` = 1 + 0.25×i
  (×1 Crust Moon … ×3.25 The Great Oven), shown as a 🪙 ×N chip on the Galaxy panel.
  Exact order = (12 + 2 × toppings + patience×10) × trait × planet, a recipe counting
  as 2 toppings; near miss = accuracy×8×planet.
- **Pizza slices, not stars:** every finished shift that fed at least one monster
  earns 1 slice on that planet (`save.shifts[planetId]`), shown on Shift over, under
  each planet on the map and as a total on Home/Galaxy/Shop. (★★★ survives only as
  the per-customer Perfecto/Almost/Blegh feedback.)
- **Opening a planet** (level L+1) needs **L + 2 slices on the planet before it** —
  3 on Crust Moon … 11 on Gloopiter, 63 shifts in all — **and every one of its 6
  ingredients + 4 recipes**. Each planet's 10 items together cost
  `PPDATA.PLANET_COST[t]` (450 Sockhollow … 4,550 The Great Oven), sized so a kid
  (est. ~145 coins a shift on Crust Moon) can afford them in those same shifts.
- **Leaving mid-shift** (🪐 top-right) needs a second tap within 2.5s — the shift's
  coins aren't banked.
- **Sound:** generated Web Audio — squish, combo chime, gulp, coin, alien gibberish
  on arrival, snore, wake boing, munch, VIP buzz, shop/open fanfares.
- **Theme music:** `audio/pizza-planet-theme.webm` (from `research/pizza-planet.m4a`,
  Opus 48k, −6dB per `knowledge/audio-patterns.md`), loops, starts on the first
  interaction. A speaker/muted SVG toggle sits top-right on every screen and the
  choice is saved (`muted` in the save). This departs from the arcade's
  "no mute button" rule because Dan asked for it.
- **Debug panel** (spec §9): `D` on a keyboard, or hold the Home logo 1.2s.
  Preview planet (everything unlocked, never saves), timers on/off, patience 15–90s,
  combo hints, +500 coins, reset chef.

## Files

- `games/pizza-planet/index.html` — the whole game (data, art, screens, shift).
- `games/pizza-planet/js/arcade-store.js` — unmodified copy of `games/dragonseed/js/store.js`.
- `games/pizza-planet/audio/pizza-planet-theme.webm` — theme (0.8MB, 2:04 loop).
- `games/pizza-planet/research/` — the design handoff (reference only, gitignored).

Inside `index.html`: `PPART`/`PPDATA` content data (ported from `pizza-data.js`,
localStorage helpers stripped) → `PPArt` (topping/monster/planet/scene/chef markup,
cached as strings) → game IIFE (saves, screens, shift, audio, debug). `window.__PP`
is a test hook.

## Design decisions

- **DOM, not canvas** — Dan asked for "just the html". The prototypes' CSS clay art
  ports 1:1; the shift rebuilds only the region that changed (tops, ticket, tray
  when hints change, customer on mood change) to stay light on the tablet.
- **Top-right corner is the music toggle** (48px, inside the scaled stage); headers stop at x≈1253.
- **Top-left is the arcade's.** The prototype's in-shift "‹ back to Galaxy" and the
  shop/guide "Galaxy" buttons moved to the top-right; logos start at x=150.
- **Space screens** use the arcade dark gradient `#0a0a2e → #141452 → #1a1a6e` with
  the starfield; the shift and the shop keep the warm pizzeria / planet scenes.
- **Saves** in IndexedDB via `ArcadeStore("pizza-planet")` → `calebArcadeData:pizza-planet`
  = `{ active, profiles: { caleb, ezra }, gen, sid }`, guarded against stale tabs.
  Both chefs start fresh: Crust Moon owned, 50 coins (spec §7 release defaults).
- **Final planet renamed "The Great Oven"** (id stays `pizza`) — spec §11 flagged
  "Planet Pizza" as too close to the game name. One string in the data to revert.
- Galaxy opens on a planet that is *ready* to open, else the current one (the
  prototype jumped to the next locked planet, which on a fresh save hid "Fly there").

## Memory

- 2026-09-23: built. Review pass fixed: VIP charged −20% for placing the first
  part of an ordered combo (unavoidable penalty); Galaxy unlock chips overflowed the
  card; Gobbler totals ran 6–15 not 8–12; shop/guide targets under 44px; Twins
  ticket could clip into the tray (compact rows); Mystery hints gave away hidden
  items; accidental mid-shift exit; "1 monsters".
- 2026-09-23: added theme music + mute toggle (Dan's request). Balancing reviewed with Dan (375 coins / 13 customers on Crust Moon): he's happy with it as is.
- 2026-09-23: "can't hear the music" — the write-back of the music build hadn't landed (device file was the pre-music version); re-committed. Briefly added an AAC fallback; removed at Dan's request — one WebM only, Safari not a target.
- 2026-09-23: shift cut 150s → 60s (Dan). Rewards rebalanced: per-topping pay so bigger later-planet orders pay more (~33 coins/order on Crust Moon, ~45 Splashtopia, ~53 Great Oven, served instantly) and stars moved to 40/80/120 so 3★ needs ~4 perfect orders a minute. Prices unchanged.
- 2026-09-23: later planets now pay more (×1…×3.25) so there's a reason to push on rather than farm Crust Moon; star targets and prices scale by the same multiplier. Modelled length: Dan ~19 one-minute shifts to reach the Great Oven (~67 to buy everything); the boys ~48 (~168), estimate.
- 2026-09-24: Dan wanted "level + 2 shifts per level" and assumed you had to buy everything to progress — it was only 3 key items. Changed: opening a planet now requires all 10 of its items; prices re-sized per planet to the level+2 pace (kid estimate). Galaxy shows stars / ingredients / recipes progress chips; shop Key tags removed.
- 2026-09-24: counter icons now fill their bins (up to 124px on one row, ~66px on two; names one line); toppings on the pizza doubled to 128px (combo drop radius and tap-spread scaled to suit).
- 2026-09-24: both too big — pizza toppings now 96px (1.5×), counter icons capped at 96px on one row / ~60px on two.
- 2026-09-24: stars replaced by pizza slices — 1 per shift played (needs ≥1 monster fed); opening the next planet needs level + 2 slices on the current one, so the level+2 pace is exact rather than estimated. Old `stars` in saves are ignored.
