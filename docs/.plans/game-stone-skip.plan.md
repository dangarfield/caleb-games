# Game: Stone Skip (Three.js lake stone-skipping)

Run plan for `/new-game`. Durable state — update at every step.

## Concept (GIVEN — scout skipped)
A cute arcade **stone-skipping** game on a large, detailed Three.js lake. Walk/look
along the shore, pick up rocks (some flatter/better than others), and skip them
across the water. Intuitive touch controls with a real skill ceiling but
low-frustration. Audience: Caleb (7) + Ezra, tablet/touch first.

## Scene (large + detailed — the brief emphasises this)
A sizeable lake environment with variety around the shore:
- **Beaches** (where rocks are scattered to pick up), a few **small edge banks**,
  **piers/jetties**, **reeds** in the shallows, some **long open water** patches,
  an **island**, and a **bridge** (for the "under a bridge" challenge).
- Cute, stylised low-poly/toon look (not photoreal). Soft colours, gentle water
  shader/ripples, skybox, ambient birds/water SFX. Performance-minded for tablets.

## Core control scheme (CONFIRMED with user — the skill mechanic)
A 3-beat timed throw, all touch:
1. **Tap to start** → the throw enters SLOW MOTION (wind-up animation begins).
2. **Timed tap #1 = POWER** — captures how far back the wind-up is at that instant
   (later tap within the swing = bigger backswing = more power). Show the wind-up
   visually so timing is readable.
3. **Timed tap #2 = RELEASE**, double duty:
   - the *timing* sets the **vertical launch angle** (hitting the sweet spot = the
     low, flat angle that skips best; too early/late = lobbed or slammed);
   - the tap must be a **forward FLICK**, and the flick direction sets the
     **horizontal aim** of the stone.
Skill = good power + well-timed flat release + straight flick. Mistakes degrade the
throw (fewer skips / off-line), they do NOT hard-fail — keep it non-frustrating.
Give clear feedback (a sweet-spot indicator/gauge, slow-mo, satisfying skip SFX).

## Rock quality (CONFIRMED — pick from scattered rocks)
- Rocks are scattered on the beach with visibly different shapes: round, flat,
  jagged, oval, etc. **Flatter/rounder-bottomed = more skips**; jagged/heavy = worse.
- Player walks/looks along the shore and picks one up (part of the skill is
  choosing a good rock). Show a subtle quality hint on inspect/pickup.
- Rock properties (flatness, weight, edge) feed the skip physics.

## Skip physics
- Arcade-tuned skip simulation: number of skips depends on entry angle (flat is
  best), speed/power, spin, and rock flatness. Each bounce loses energy; too steep
  an angle = plunk (few/no skips); good flat throw = many skips.
- Fun-first, not a rigid sim; readable cause→effect so kids learn.

## Scoring / challenges (CONFIRMED)
- **Best skip count + distance** tracked (casual high-score chase).
- **~10 target challenges** placed in the scene, e.g.: hit specific **buoys**,
  skip **under the bridge**, **land on the island**, reach a far marker, thread
  between reeds, hit N skips in one throw, etc. (NO ducks.) Completing challenges
  = the progression/goal spine. Track completed challenges per player.
- Cute results/feedback (skip counter popping up per bounce, celebratory SFX).

## Camera / movement
- Tablet-friendly: a controlled camera along the shore (look around / move between
  a few throw spots), then the throw framing. Keep controls minimal and obvious;
  don't demand free-roam FPS movement from a 7-year-old.

## Conventions (hard constraints — re-state at every hand-off)
- [x] `games/stone-skip/index.html` + `js/` ES modules (multi-file OK; matches librarian/bomb-squad 3D pattern). Three.js via importmap CDN (jsdelivr) — the established 3D exception to "no network".
- [x] Back button href EXACTLY `../../index.html`
- [x] Touch-first: `touch-action:none`, pointer events, large tap targets; viewport `user-scalable=no`
- [x] Dark/cute theme; arcade palette accents (`#6c5ce7`, `#ffd32a`) for UI/HUD; scene itself can be bright/daylight (it's a lake) — keep menus/HUD on-brand
- [x] `calebArcadeData` localStorage, data under `data.stoneSkip`; Caleb/Ezra profiles
- [x] Web Audio SFX. Three.js from CDN is the only network use.

## Checklist
- [x] 1. Frame — concept given (stone skipping, Three.js), audience + touch captured
- [x] 2. Scout — SKIPPED (concept given)
- [x] 3. Spec → this plan; control scheme + rock + scoring confirmed with user
- [x] 4. Build — delegate to game-builder
- [~] 5. Review — game-reviewer PASSED (round 1); builder fixed the 10 non-blocking
      defects (rock framing/placement at all 6 spots, pick-proxy size + intent
      tiebreak, HUD pill left guard, visible arm sleeve, aim retention, challenge
      wording, Space-while-walking guard, flag label order + marker fade, west-lane
      reed cull, storage comment); all 10 re-measured, 12/12 challenges completable,
      0 console errors. PASS accepted (orchestrator spot-check: menu renders, clean
      console, perf healthy — no full round 2 needed for bounded fixes).
- [x] 6. back-button-check green (href `../../index.html`; only external request is three@0.161.0 CDN)
- [x] 7. game-docs-sync → docs/game-stone-skip.md created; games-index.md row + count 61→62 (63 dirs)

## PHASE 3 — user refinements (route with the current fix pass)
- **Special stones = timed spawns, not always-owned.** Once unlocked, a special
  stone has a **1-minute cooldown**; when ready it can APPEAR on the beach among
  the normal scattered rocks to be clicked/picked (in addition to normals). So you
  don't permanently hold it — you catch it when it shows up. (Supersedes "owned
  special stones always selectable in the picker".)
- **Remove the auto-pick button entirely.** Manual pick only (no auto-pick).
  (Supersedes keeping auto-pick as an optional button.)
- **Flick guide = an on-screen DRAWN TRAIL of where the user flicked** (a finger-
  trail line drawn on screen during/after the flick), not just a static arrow.
  (Clarifies/replaces the earlier "flick guide arrow" — still show aim, but the
  key ask is the visible drawn flick trail.)
- **Throw-quality breakdown (bottom-right, minimal, may be removed).** After a
  throw show a small % score for each factor: (1) stone quality incl. inherent
  bonuses, (2) power tap, (3) flick tap timing, (4) vertical flick distance,
  (5) horizontal flick deviation. Keep it tiny/unobtrusive in the bottom-right;
  minimal styling since the user may remove it. [Any more factors? spin? — builder
  note if the model has others; else these 5.]
- **Merge challenges + achievements into ONE thing called "Achievements".** No
  separate "challenges" concept/screen — the original 12 targets are just
  achievements alongside the rest. One Achievements screen, one list.

## PHASE 4 — scatter, quality-panel fade, flick range (user)
- **Scatter rocks more; stop overlap.** Stones overlap each other a lot — spread
  them out more across the beach (bigger min spacing / wider spread), still all
  in-front and tappable. Special stones should appear toward the OUTSIDE of the
  scatter (further out), and their "special ready" label should be more SUBTLE.
- **Throw-quality panel fades out** after 5 seconds OR when you pick up another
  stone (whichever first).
- **Flick range is far too small — ROOT CAUSE: `FLICK_TRIGGER_PX = 58` (fixed px)**
  in `throw-control.js`. `vert` score = `-dy/58` (maxes at 58px up) and the flick
  auto-launches at ~58px. Make the flick usable nearly to the TOP of the screen:
  scale the trigger/vert-reference distance to viewport height (~40-50% of H, not
  58px), and don't auto-fire until the full (scaled) distance or release. The
  drawn flick trail should read as a long upward swipe.

## PHASE 5 — flick 100% needs a much bigger swipe (user)
- 100% vertical flick currently = `h*0.45` (`flickRangeFor`). User wants it to
  require a LOT more travel: **100% = ~75% of screen height** → `flickRangeFor(h)
  = clamp(h * 0.75, ...)`. Bump the clamp ceiling accordingly (e.g. 200..1100) so
  it isn't capped below 0.75·h on tall screens. Auto-launch still only at full
  distance or release; the drawn trail + `vert` score scale to the new range.
- NOTE: reviewer step SKIPPED per user — they will review themselves. Orchestrator
  routes tuning only.

## PHASE 6 — piecewise gauge scoring + subtle instructions (user)
- **Non-linear gauge scoring for the first two taps (power + release timing).**
  The score is NOT linear across the whole bar. Piecewise:
  - INSIDE the gold band → maps **10%..100%** (100% at dead-centre, falling to 10%
    at the gold edges — keep the centre-peaked shape within gold).
  - OUTSIDE the gold band → maps **0%..10%** (across the whole non-gold remainder).
  So landing in gold is always ≥10% and being outside is always ≤10% — a big cliff
  at the gold boundary. Apply to BOTH the power tap and the release-timing tap.
  Reflect this in the throw-quality % readout too.
- **Move the "pick up a stone" / "wind up to throw" instruction prompts to the
  BOTTOM-LEFT and make them much more SUBTLE** (small, low-contrast, out of the
  way) — currently too prominent/central.

## PHASE 7 — trim achievements (user)
- **Remove the 1000-skip achievement (`total1000`); keep the 500 one (`total500`).**
  Achievement count 37 → 36.

## PHASE 8 — special-stone descriptions in the shop (user)
- In the shop/unlock entries for special stones, replace the "washes up on the
  beach / how you get it" lore with a description of **what is SPECIAL about the
  stone** (its gameplay effect), e.g. Golden Skipper = extra skips, Feather = floaty
  long low skips, Heavy Slate = fewer skips but huge distance, Rainbow = cosmetic
  trail, Ancient Rune = glows/(effect). Pull the real effect from the stone defs.
- KEEP the state text the user likes: the **READY** badge and the **"35s until it
  can be found"** cooldown countdown. Just swap the descriptive line for the effect.

## PHASE 9 — progress count on cumulative achievements (user)
- The cumulative total-skip achievements (`total100`, `total500`) should show
  the running total-so-far vs target in their text, e.g. "247 / 500", updating
  live as the player's lifetime skip count grows. (Apply to any similar
  counting/threshold achievement where a running total makes sense.)

## PHASE 10 — 0-point "collection" achievements for unlocks (user)
Add achievements that fire when you unlock things. These award **0 Skip Points**
(badge only — avoids unlocks-paying-for-unlocks loop). They show on the
Achievements screen like the rest (with 0 ✨), and count toward the total.
- **Spots:** an achievement for unlocking the shore spots (unlock each new spot →
  achievement; or an "all spots unlocked" badge — builder pick the cleaner: prefer
  one PER new spot so there's a badge trail, each 0 pts). [FLAG which chosen.]
- **Day/night themes:** a 0-pt achievement for unlocking EACH theme (Sunset,
  Misty, Starry Night) — one per theme.
- **All trails:** one 0-pt achievement for owning ALL skip-trail cosmetics.
- **All splashes:** one 0-pt achievement for owning ALL splash cosmetics.
- **All hats:** one 0-pt achievement for owning ALL hat cosmetics.
Derive completion from the save's owned-unlocks so they can't drift. Update the
achievement count accordingly (was 36 + these).

## PHASE 11 — splash cosmetics don't show (user bug)
- Gold / rainbow splash cosmetics aren't visible in play. Wiring exists
  (`fx.setSplash(hex, rainbow)` in fx.js; called once at `main.js:299` as
  `fx.setSplash(save.splash === 'gold' ? 0xffd76a : 0, save.splash === 'rainbow')`).
  Suspects: (a) `setSplash` only runs at load, not re-called when you
  equip/change a splash in the shop; (b) `save.splash` not set on buy/equip;
  (c) the tint IS applied but the droplets are too faint/small/short to read the
  colour. Diagnose and fix so equipping Gold visibly splashes gold and Rainbow
  splashes multicolour, live, without reload — and make the colour actually
  legible on the water.

## PHASE 12 — replace mute button with a Map/overview button (user)
- Remove the sound on/off (mute) button from the side rail (`#sideBtns`). Sound
  stays always-on. (Note: earlier we already dropped mute in one place — ensure NO
  mute button remains anywhere.)
- Add a **Map button** in its place. Pressing it TWEENS the camera up to an
  overhead/bird's-eye view of the lake (a new `overview` camera-rig mode alongside
  spot/travel/follow/result), highlighting the different throw spots (as the spot
  markers already do) AND showing where the PLAYER currently is (highlight the
  current spot distinctly). Tapping a spot from the map (or a spot marker) could
  travel there; at minimum, tapping Map again / a close control tweens back down
  to the current spot. Keep it smooth (ease tween up and back) and touch-friendly.

## PHASE 13 — flip stone spin direction (user)
- Stone spin looks wrong — reverse it both (a) in the hand (held/wind-up) and
  (b) while skimming across the water. Negate the spin/rotation sign in the hand
  render and the in-flight stone render so it spins the natural way for a skim.

## PHASE 14 — map button tweaks (user)
- **Remove the "close map" button** — it's not needed and it overlaps. Closing the
  map is done by pressing the Map (🗺️) rail button again (toggle), and/or tapping
  a spot. Just delete the dedicated close-map control.
- **Move the Map button to the TOP of the side rail** (`#sideBtns`) — it should be
  the first icon in the list.

## PHASE 15 — show distance next to the near-top skip counter (user)
- The live near-top skip counter (`hud.drawCounter`, y≈84, fed by
  `hud.setCounter`) shows only the skip number + "SKIPS". Also show the
  **distance** there during/after the throw (the stone tracks distance —
  `stone.maxDistance` / skip-event `e.distance`). e.g. skip count + "SKIPS" with a
  metres readout beneath/beside it, updating live as the stone travels. Keep it
  tidy and centred like the current counter.

### Mechanic changes (not optional)
- **Manual stone choice.** Player must CHOOSE a stone each throw (no silent
  auto-select). Keep an optional "auto-pick best" button for convenience, but the
  default flow requires the player to tap a scattered rock to pick it.
- **Flick guide UI.** Add a visible aim/flick guide: an arrow/indicator showing
  the flick direction and the low-angle sweet spot, so the player can see where
  they're aiming before the flick.
- **Clear flick-timing cue.** Make it visible and obvious WHEN the flick tap is
  coming (the 3rd beat) — a prominent "FLICK NOW!" cue / pulse / countdown so the
  player isn't guessing the moment.
- **Perfect-release = CENTRE of the gold band, not anywhere in it.** The sweet
  spot is the single centre point of the gold FLAT band; make the quality
  roll-off from that centre MORE SEVERE (precision rewarded). Near-centre = great,
  edges of gold = only okay, outside = poor. (Currently any point in gold seems
  ~equal — change to centre-peaked with a steeper falloff.)

### Currency
- **Skip Points** are the currency. Earned from skips/distance during play AND
  awarded when an achievement unlocks (achievements give a point bonus too).
  Spend them in an **unlock shop** screen. Persist per player.

### Achievements (~30, expand from the 12 challenges)
Skill: 15/20/25 skips in one throw; first perfect (dead-centre) release; 5/25
perfects; 10 throws straight with 5+ skips; 150m / 200m distance. Targets: thread
two reed gates one throw; skip under the bridge and keep skipping; land on a lily
pad; hit 3 buoys (across throws); far island beacon; bounce off a pier post.
Rock mastery: skip with every rock type; 10+ with a "round" (bad) rock; use the
rare golden skipper. Volume: 100 / 500 / 1000 total skips; throw from every spot;
clear all challenges at one spot. Cheeky: plunk 10 times; **a fish jumps up and
swallows your stone** (rare, delightful — needs the fish system below). Keep the
original 12 as the base set.

### Unlocks (ALL types; bought with Skip Points in the shop)
- **Special stones** (distinct skip behaviour): Golden Skipper (extra skips),
  Feather Stone (floaty, long low skips), Heavy Slate (fewer skips, huge
  distance), Rainbow Pebble (cosmetic trail), Ancient Rune Stone (glows).
- **New throw spots** — unlock additional shore locations (see expansion).
- **Cosmetics** — skip-trail effects, splash colours, a hat for the hand, etc.
- **Day/night themes** — sunset, night (starry + reflections), misty morning.
- **Arm strength — 2 upgrade levels.** Each raises the power ceiling (throw
  harder/further) AND makes the power bar sweep a little FASTER (so it stays a
  skill test as power grows). Two purchasable tiers.
- **See fish** — an unlock that makes fish visible swimming in the lake
  (also the prerequisite/tie-in for the fish-swallows-stone achievement).

### Lake expansion
- **New throw spots** gated behind unlocks/points: waterfall inlet, rocky point,
  wooden dock w/ boats, lily-pad cove, cliff ledge (high throw), misty far shore.
- **Fish system**: fish swimming under the surface (visible once unlocked);
  occasionally one leaps and can swallow an in-flight stone (achievement trigger).
- **Day/night themes** as above (also unlockable).
- (NO free-play mode — user declined. Challenge-run structure stays.)

### Phase-2 screens
- **Shop / unlocks screen** (spend Skip Points; shows owned/locked, prices).
- **Achievements screen** (~30, completed vs locked, point rewards shown).
- **Stone picker** now front-and-centre in the throw flow (+ owned special stones
  selectable). Theme/spot selection reflects unlocks.

## Acceptance criteria
- [x] Plays with no JS console errors; runs at a decent frame rate on a tablet
- [x] Large detailed lake scene: beaches, piers, edge banks, open patches, reeds, island, bridge
- [x] Pick up scattered rocks with visible quality differences (flatter = better)
- [x] 3-beat throw: tap-to-start slow-mo → timed power tap → timed release flick (vertical from timing, horizontal from flick)
- [x] Skip physics reads clearly: flat + well-timed = many skips; steep = plunk; not frustrating
- [x] Best skip count + distance tracked; ~10 target challenges (buoys, under bridge, land on island, etc.; no ducks)
- [x] Cute arcade feel: SFX, skip-count popups, celebration
- [x] Touch-first controls work fully on tablet; back button `../../index.html`
- [x] Caleb/Ezra profiles; progress (challenges, bests) saved under data.stoneSkip
- [~] Card in root index.html DONE (`.card-stone-skip`, href `games/stone-skip/`); docs/game-stone-skip.md + games-index.md left to game-docs-sync

## PHASE 2 acceptance (builder — verified in-browser, awaiting review)
- [x] Manual stone choice enforced (no stone on arrival; empty tap = deny + "Pick a
      stone first"); optional auto-pick-best button (`#pickBtn`, KeyP)
- [x] Flick guide ("FLICK THIS WAY" arrow trio + "AIM HERE" on the gauge)
- [x] "FLICK NOW!" cue: GET READY… countdown ring → gold pill on beat 3
- [x] Centre-peaked release: `SWEET.center 6 / half 7`; quality 1.00 at centre,
      0.85 at 0.55, 0.58 at the gold edge, 0.12 well outside
- [x] Skip Points: `POINTS { perSkip 3, per10m 2, perfect 8, great 3,
      newBestSkips 15, newBestDistance 12 }` + achievement bonuses (2985 total);
      24 unlocks costing 6750 ✨
- [x] 37 achievements (the original 12 challenges are the base set) in 6 groups,
      Achievements screen shows earned / locked + reward
- [x] Every unlock type applies live: 5 special stones, 6 new spots, 3 themes,
      arm 1+2, See The Fish, 7 cosmetics (hat/trail/splash)
- [x] Fish system: instanced shoals; rare leap can swallow an in-flight stone
      (`fishEat` achievement); debug hook `__stoneSkip.fishChance`
- [x] No free-play mode (challenge-run structure kept)
- [x] Portrait 820×1180 + landscape 1180×820 + 740×360 verified; 0 console errors,
      0 page errors; only network request is the three@0.161.0 jsdelivr module
- [x] Perf: 54–56 draw calls / ~297k tris portrait, 35 / ~296k landscape, capped
      pixel ratio
- [x] Per-player persistence + separation verified (`calebArcadeData.stoneSkip.<id>`)
- [ ] game-reviewer round 2 (builder does NOT self-approve)

## Review-round-2 fixes + PHASE 3 + PHASE 4 acceptance (builder — awaiting review)
Reviewer FAIL items:
- [x] #1 Every one of the 12 spots shows tappable stones straight ahead in portrait
      (`rocky`/`falls` now stand on a generated stone shelf, `spot.shelf` in
      layout.js built by props.js — the same builder now also makes the Cliff
      Ledge, so `LEDGE` was deleted)
- [x] #2 Aim yaw is retained between throws, with an on-screen indicator and a
      re-centre tap
- [x] #3 Release windows widened (`SWEET`), so a decent throw comfortably gets 7+
      skips — locked in by `check.mjs`'s tuning table
- [x] White sweet-spot core drawn on the POWER gauge; hat no longer occludes the
      hand; popups clip-safe; achievement rows fit

PHASE 3:
- [x] A. Special stones wash up among the rocks on a 1-minute cooldown persisted
      as an epoch ms (`save.specialAt`), so the minute survives a reload
- [x] B. Auto-pick button removed entirely (no `#pickBtn`, no KeyP)
- [x] C. Flick guide draws the finger's REAL path (`throwCtl.S.flick.path`)
- [x] D. Bottom-right throw breakdown: Stone / Power / Timing / Flick up / Straight
- [x] E. One merged "Achievements" concept (37, no separate challenges screen)

PHASE 4:
- [x] A. Scatter is measured in SCREEN angle, not metres: `MIN_ANG` 7° with a
      walk-down of wishes, `MAX_REACH` 6.6 m, distance-scaled pick proxies, and
      `rockCount` 4–6. Verified at 390×700, 500×844 and 1024×680: all 12 spots
      have every stone on screen AND clear of the HUD/rail, min gap 52–113 px.
      Specials sit at the far edge of the scatter with a quiet 10 px gold label.
      Bug found: `base + da` turns towards the player's LEFT (layout's `rx` is the
      aim turned the other way), so the rail-side asymmetry (`VIEW_ARC_R`,
      `RAIL_ARC`/`RAIL_LO`, the lateral jitter) had to limit NEGATIVE da.
- [x] B. Breakdown fades after 5 s (`BREAKDOWN_LIFE` + 0.6 s fade) or clears at
      once when the next stone is picked up / the next wind-up starts
- [x] C. Flick range scales with the viewport: `flickRangeFor(h) = clamp(h*0.45,
      120, 720)`, re-computed on resize; the launch only auto-fires at the full
      distance (or on release), so the trail can read as a long upward swipe. The
      `vert` factor divides by that same range, and is capped at 18% of the spin
      weight so the tuning guarantees still hold.
- [x] Re-verified: `check.mjs` all checks passed; `verify.mjs` ALL BROWSER CHECKS
      PASSED (portrait 820×1180 + landscape 1180×820 + 740×360), 0 console
      errors/warnings, 0 page errors, jsdelivr three@0.161.0 the only request
PHASE 5 (flick needs a much bigger swipe — user reviewing this one themselves):
- [x] `flickRangeFor(h) = clamp(h * 0.75, 200, 1100)` (was `clamp(h*0.45, 120,
      720)`). 100% "Flick up" is now ~three quarters of the screen height:
      885 px on a 1180 px-tall portrait screen, 615 px in 820 px landscape. The
      ceiling of 1100 keeps 0.75·h honest up to a 1467 px screen.
- [x] The safety timeout had to follow: `FLICK_MAX` 0.55 s → 1.0 s, because a
      0.75·h swipe takes 500–750 ms even briskly and would otherwise have been
      cut off mid-swipe and scored as weak. Auto-launch still happens ONLY at the
      full distance or on release; `FLICK_MIN_PX` (16) dead zone unchanged.
- [x] The drawn finger-trail and the `vert` breakdown row both divide by the same
      `S.flickRange`, so a shorter flick scores proportionally less; the guide
      arrow is still `flickRange * 0.42` clamped to the space above the gauge.
PHASE 6 (piecewise tap scoring + subtle bottom-left hints):
- [x] A. One shared piecewise curve, `bandScore(off, inPow, spanLo, spanHi)` in
      `skip-physics.js`, used by BOTH `releaseQuality` and `powerQuality`:
      inside the gold band the old centre-peaked shape is rescaled to
      `GOLD_FLOOR (0.10) .. 1.00`, and the whole remainder of the bar is squeezed
      into `0 .. 0.10` (reaching exactly 0 at the end of the bar, per side).
      Release: off 0 → 1.00, 0.26 → 0.91, 0.55 → 0.67, 0.80 → 0.38, 1.00 → 0.10
      (the gold edge), 1.4 → 0.09, bar end → 0. Power: 0.88 → 1.00, full power
      (off 0.86) → 0.31, 0.74 (gold edge) → 0.10, 0.50 → 0.065, 0.06 → 0.
      `RELEASE.IN_DROP/OUT_FALL` and `POWER.DROP/OUT_FALL` are gone.
- [x] The breakdown's Power/Timing rows read these values directly (they already
      came from `S.powerQ` / `releaseQuality`), so the readout is the score.
- [x] Physics follows the same score. Because the score itself is now the cliff,
      the weights around it had to be re-balanced or a release at the edge of the
      GREAT window fell to 5 skips: budget `0.62+0.38·relQ → 0.81+0.19·relQ`,
      `0.91+0.09·powQ → 0.96+0.04·powQ`, `speedFactorFor 0.66+0.34q → 0.81+0.19q`,
      plus a new `missPenalty(q)` (a function of the score alone) that only bites
      BELOW the gold floor: a 0.9 step right at the edge sliding to 0.7 at the end
      of the bar. Dead-centre throws are numerically unchanged (the instrumented
      perfect throw is still 9 skips / 83 m); the gradient is now
      off 0 → 11, 0.4 → 9, 0.72 → 8, 1.0 → 6, 1.2 → 5, 1.6 → 4, 2.4 → 3 skips.
      The reviewer's "a decent throw comfortably gets 7+" still holds.
- [x] B. `hud.drawPrompt` no longer draws a centred panel: the passive step hints
      ("Pick up a stone" / "WIND UP to throw") are 13·scale / 11·scale text at
      x = 14·scale, stacked above the stone chip in the BOTTOM-LEFT, alpha ~0.62
      main / ~0.43 sub, with a barely-there 2.2 rad/s breath. The loud timed cues
      (FLICK NOW!, PERFECT!, POWER SPOT ON) are untouched.
PHASE 7 (retire the 1000-skip achievement):
- [x] `total1000` ("A Thousand Skips", 160 ✨) removed from `ACHIEVEMENTS`;
      `total500` stays as the top volume tier. `ACH_TOTAL` is derived from the
      array, so the count is 37 → 36 everywhere (HUD pill, achievements screen
      header, player cards) with no hard-coded numbers to chase. Total achievement
      pay-out 2985 → 2825 ✨ against a 6750 ✨ shop, which still leaves the shop
      throw-points-funded as designed.
- [x] Old saves: `achCount()` filters by the live list, so a save holding
      `total1000: true` keeps its points and is simply not counted. `storage.js`
      `playerSummary()` counted raw keys, which would have shown "37 of 36" on the
      player-select card — it now intersects with `ACHIEVEMENTS` too. Nothing is
      deleted from the save (no destructive migration).
PHASE 8 (special-stone cards describe the EFFECT, not the lore):
- [x] Each of the five `SPECIAL_STONES` in `stones.js` gained an `effect` line
      written from its own numbers, so the card can never drift from the physics:
      Rainbow "Leaves a rainbow trail — skips like a good flat stone"
      (budgetMul 1 / speedMul 1 — honestly cosmetic), Feather "Floaty: lots of
      long, low skips (about a third more)" (1.34), Slate "Half the skips, but
      huge hops and way more distance" (0.5 / 1.34), Rune "Glows purple: more
      skips AND more distance" (1.2 / 1.08), Golden "Lots of extra skips — the
      best skimmer in the lake" (1.75, the highest of any stone).
- [x] The shop's Special-stones rows are now GENERATED from `SPECIAL_STONES`
      (`desc: s.effect` + a `STONE_PRICE` map), so shop and bag always agree, and
      the bag card renders `specialById(o.id).effect` in place of the old "Washes
      up among the stones, then waits a minute" prose.
- [x] The state text the user asked to keep is untouched: `✨ ON THE BEACH`,
      `READY / WASHING UP`, `${secs}s / UNTIL IT RETURNS`. Verified on a save
      owning all five with two ready and three mid-cooldown: every card shows its
      effect line plus its live badge (51s / 36s / 16s counted down correctly).
PHASE 9 (running totals on the counting achievements):
- [x] Optional `prog(stats, save) -> [have, need, unit?]` on an achievement, read
      through `achProgress(a, save)` (clamps to the target, tolerates a missing
      save or a throwing accessor, returns null when there is nothing to count).
      15 of the 36 achievements now count: `total100`/`total500` from
      `stats.totalSkips` (the brief's "247 / 500"), `perfect5`/`perfect25`,
      `streak10`, `plunk10`, `buoy3`, `allKinds`, `roundHero`, `everySpot`, and
      the one-throw records `skip15/20/25` + `dist150/200`, which count from the
      personal best (`save.bestSkips` / `bestDistance`, the latter with an `m`).
- [x] Deliberately NOT counted: one-off trick shots (`fishEat`, `lilyPad`,
      `beacon`, `postBounce`, `perfect1`, `goldenUse`, `reedsDouble`,
      `bridgeSkip`), the 12 lake targets, and `spotSweep` — four of the six spots
      hold a single target, so it would read "0 / 1", the exact uselessness the
      brief's "where it reads naturally" excludes.
- [x] Rendered on the achievements screen as a small gold chip inside the
      description line (`.row .ds .cnt`), so the row still explains itself.
      Earned rows drop the chip and keep the ✓ + pay-out exactly as before.
- [x] Verified in-browser: 43 / 500 mid-run and 53 / 500 after the next throw
      (10 skips), i.e. the count is the real lifetime total and moves with play;
      a planted 247-skip save renders "247 / 500", "12 / 15", "133 / 150m",
      "2 / 6", "4 / 10"; marking `total100` earned turns that row into ✓ with no
      chip. `check.mjs` all checks passed; `verify.mjs` ALL BROWSER CHECKS PASSED
      (portrait + landscape, 0 console/page errors, jsdelivr three@0.161.0 still
      the only request).
PHASE 10 (collection achievements for the shop):
- [x] 12 new `badge: true` achievements in a `Collection` group, taking the total
      36 → 48: one per THROW SPOT (`have_rocky/dock/lily/falls/pier/island` — the
      per-spot approach, so each new place you buy is its own trophy), one per
      THEME (`have_sunset/night/autumn`), and one each for owning a whole set:
      `allTrails` (2), `allSplashes` (2), `allHats` (3).
- [x] A badge pays **0 ✨**. Unlocks are bought WITH Skip Points, so paying points
      for owning an unlock would part-fund the next purchase — a loop. `check.mjs`
      asserts it as a rule: `a.badge -> a.pts === 0`, everything else `pts > 0`.
      Rows render `✓BADGE` / `🏅BADGE` instead of a pay-out, and the screen header
      says "N of 48 earned — most pay ✨ Skip Points".
- [x] Completion is DERIVED from the owned-unlocks map, never from a counter, so
      it cannot drift: `settleBadges(save)` recomputes and retro-marks silently.
      A planted save owning the whole shop with an empty `achievements` map earns
      all 12 on load with its balance untouched.
- [x] Verified live (`p10.mjs`, 24 checks): an "old" save (500 ✨, four spots + two
      hats) silently gains exactly 4 badges with 500 ✨ still on disk; buying the
      Wizard Hat mid-play moves 500 → 310 (exactly the 190 price) while the badge
      count goes 4 → 5 and `Every Hat` flips to `✓BADGE`; `allHats` counts
      `2 / 3` then `3 / 3`; Collection renders last, 12 rows, all ≥ 52 px tall,
      no row ever shows "+0 ✨"; survives reload.
PHASE 11 (the splash cosmetics were invisible in play):
- [x] ROOT CAUSE: the droplets were `MeshLambertMaterial`. The daylight rig adds up
      to ~1.7x irradiance (hemi 0.95 + sun 0.85), so a lit droplet multiplied its
      cosmetic tint straight past 1.0 and clamped to white. Gold and Rainbow were
      genuinely in the buffer — as white spray, i.e. identical to plain water.
- [x] FIX (`fx.js`): droplets are UNLIT `MeshBasicMaterial` with `fog: false`, so
      the colour on screen is the colour the player bought, at any distance. A
      white `color` attribute is set on the geometry so three.js defines
      `USE_COLOR` and the per-instance tint reaches the fragment shader. Each
      droplet keeps a small random brightness (0.82..1.0) so unlit spray still
      reads as spray, and a tinted splash throws 1.45x the droplets so the colour
      reads from the shore. `puff()` passes `PUFF_SAND` explicitly so dry-land dust
      never inherits a water cosmetic.
- [x] Verified in RENDERED PIXELS (`p11b.mjs`, 24 checks, 0 console errors). The
      measurement had to be built carefully: a whole-frame gold count is worthless
      (the lake already contains gold flags, and at sunset the sky and sand), and
      it cannot follow the stone either — under software GL the page runs ~7 fps
      and the stone covers ~3.5 m per frame, so the spray is far behind it by
      sampling time. So `main.js` records `lastSplash` at the skip event and the
      probe samples a 120 px box around that point while its droplets are alive,
      via a new `sampleFrame()` hook (re-render + `gl.readPixels`; a composited
      WebGL canvas reads back black). Results: plain `gold 0 / white 94`, Gold
      `gold 193 / white 0`, Rainbow `13 hues / white 0`, un-equip `gold 2 /
      white 129`, Gold @ Long Pier `154`, Gold @ Sunset `166`, Rainbow @ Sunset
      `13 hues`. Every change took effect on equip with no reload.
PHASE 12 (drop the mute button, add a 🗺️ map):
- [x] The mute button is GONE — no mute/sound/volume control anywhere in the DOM,
      no `#muteBtn`, sound is simply always on. The rail keeps six 54 px buttons
      with 🗺️ `#mapBtn` in the freed slot.
- [x] New `overview` mode on the camera rig, eased in and out (`easeInOut`), with
      the overhead height derived from the LIVE camera
      (`h = OVERVIEW_FIT / min(tanV, tanH) * 1.04`), so portrait parks at ~464 m
      and landscape at ~323 m and both frame the whole lake. Tapping 🗺️ again or
      `#mapClose` tweens smoothly back down; opening any panel tears it down.
      Throw controls and gauges are suppressed while up, and `hand.setHidden(true)`
      stops a camera-parented fist and hat brim hovering over the lake.
- [x] Three separate systems fight an overhead shot and all three are tweened with
      the climb: `THREE.Fog` (`syncMapAtmosphere()`), the water shader's own haze
      (`uHazeRange` / `water.setHazeRange`), and the hand/hat visibility above.
- [x] The map IS the lake, not a second drawing of it: the same markers, scaled 8x
      (a 1.85 m disc becomes 15 m ≈ a 70 px tap target) with label world-scale
      growing with distance (`k = clamp(d/55, 0.22, 26) * l.mapK`) so text keeps a
      constant on-screen size from 400 m up. Current spot = gold name pill + dark
      arrow, locked = a red 🔒 chip, unlocked = purple name pill; locked discs go
      `#8b90a8` at 0.3 opacity. Tapping an unlocked spot from up there travels to it.
- [x] Three real legibility bugs the screenshots exposed, all fixed: (a) the `🔒`
      tag was stacked in `y` above the name, which from straight overhead only
      changes DEPTH — it is now a square chip on the pin, and locked spots drop
      their name pill; (b) markers looked half-ghosted because the huge transparent
      water mesh sits at nearly the same camera distance and sorts after them — in
      map mode they become UI (`depthTest = false` + `renderOrder` 24..32); (c) the
      south-shore labels collided, so they alternate an inward x/z offset
      (`mapLabZ = inward * (i % 2 ? 9 : 18.5)`) — overhead, the ground plane IS the
      screen, so separation must be horizontal.
- [x] Verified (`p12.mjs`, ~45 checks, 0 console errors) in BOTH orientations:
      eased tween (blend caught mid-flight), parked `camY 464` portrait / `323`
      landscape, all 12 spots on screen at scale 8, tag census "1 gold, 6 padlock,
      5 purple name", throw + centre buttons hidden with `#mapClose` shown, a
      pixel spread proving a real lake and not flat haze, tap-to-travel restores
      everything, tapping a locked spot keeps the map up, rotating while up
      re-frames, toggling twice is clean, and the game is still playable after.
PHASE 13 (the stone was spinning backwards):
- [x] Both spins negated so a skimmed stone turns the natural way (clockwise seen
      from above): `skip-physics.js` `s.spinRoll -= (s.spin * 26 + 7) * h` for the
      stone in flight, and `hand.js` `holder.rotation.y -= dt * (0.4 + d * 2.2)`
      for the stone held in the hand. Both carry a comment saying why, and they
      match each other so the spin does not flip at release.
- [x] Verified (`p13.mjs`, 8 checks, 0 console errors) through a new `stoneRoll`
      debug getter that reports the RENDERED `stoneMesh.rotation.y`: in hand
      -0.577 → -0.937 over six samples (monotone), in flight -1.44 → -95.12 across
      37 frames of an 8-skip throw, never flipping back mid-flight.
PHASE 14 (🗺️ leads the rail; the close-map button goes):
- [x] `#mapClose` ("✖ CLOSE MAP") is DELETED — the button, its `#centreBtn, #mapClose`
      CSS pair, its listener and its show/hide calls in `openMap`/`closeMap`. It
      shared the top-centre slot with ⟲ CENTRE AIM and overlapped the rest of the
      HUD for no gain: 🗺️ already toggles, and tapping a spot already travels.
- [x] 🗺️ is now the FIRST child of `#sideBtns`, i.e. the top icon (measured tops
      64 / 128 / 192 / 256 / 320 / 384 — mapBtn, spots, shop, achievements, bag,
      help). The rail is still six 54 px buttons and still fits a 740x360 phone.
- [x] Because the way out is now only the lit rail button, `drawMapHint` grew a
      third line, "Tap 🗺️ again to come back down", in gold under "tap a spot to
      walk there" (panel 56 -> 76 px). A way out you cannot see is not a way out.
- [x] Verified (`p15.mjs` section A + the reworked `p12.mjs`, 0 console errors):
      `#mapClose` gone from the DOM, from the stylesheet and from every button's
      text; NO visible floating `body > button` at all while the map is up (the
      "nothing overlaps" check); 🗺️ lit while up; 🗺️ again eases down and lands at
      `camY 2` with the map state torn down; tapping Willow / West still travels and
      closes; tapping a locked spot still keeps the map up; portrait 464 m and
      landscape 323 m unchanged; playable afterwards.
PHASE 15 (distance beside the live skip count):
- [x] `hud.setCounter(n, dist)` now carries metres (`state.counterDist`, cleared
      whenever the counter clears), and `main.js` calls it EVERY FRAME from the
      stone-alive branch with `stone.maxDistance` — not only on skip events — so the
      metres run up smoothly between bounces. The skip event passes `e.distance`.
- [x] `drawCounter` keeps the big gold number, and its caption line is now
      "SKIPS · 128 m": the unit word, a faint dot and the gold metres, measured and
      centred as ONE group so an `8` and a `128` both sit squarely under the number.
      One line, not a third row, so the block does not reach into the popups.
- [x] Verified (`p15.mjs` section B, 0 console errors) by recording every
      `fillText`: 15 of 25 flight frames drew the readout, each with a metres value;
      the drawn metres equal the stone's own distance on that frame to within 1 m
      (`1 SKIP · 30 m (real 1/30m)` … `2 SKIPS · 54 m (real 2/53.7m)`); they only
      ever rise; they rise on frames where the skip count did NOT change (proving
      it is live, not per-skip); `SKIP` becomes `SKIPS` at 2; gold `#ffd32a`, level
      with the word (y 164), to its right, the pair centred (mid 386 vs 410); the
      final live 59 m matches the result card's 58.6 m; and both vanish when the
      counter clears.
Regression sweep after PHASES 10-15:
- [x] `check.mjs` all checks passed (48 achievements, 24 unlocks, 12 lake targets,
      18 of 48 counting). `verify.mjs` ALL BROWSER CHECKS PASSED in portrait and
      landscape, 0 page errors, 0 console errors, 0 game warnings, and the only
      external request is still `cdn.jsdelivr.net/npm/three@0.161.0`. Its two
      PHASE 7 assertions that hard-coded "36 achievements" were updated to the
      PHASE 10 total via a single `ACH_TOTAL` constant.
- [x] Re-run after PHASES 14 + 15: `verify.mjs` ALL BROWSER CHECKS PASSED again
      (portrait + landscape, 0 page errors, 0 console errors, 0 warnings, jsdelivr
      three@0.161.0 still the only request), and `p12.mjs` re-ran clean end to end
      with the new rail order and no close-map control.
- [ ] game-reviewer round 3 (builder does NOT self-approve)
