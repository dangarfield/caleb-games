# cutlass-coast

**Cutlass Coast** (was *Peg Leg Ted* until 2026-09-26; Peg Leg Ted is still the old sailor who lends you the Sea Hare).

A remake of Sid Meier's *Pirates!* (1987). Caleb or Ezra starts at age 20 in 1660 aboard the sloop *The Sea Hare* and sails a stylised Caribbean. They trade, fight broadsides, board and sword-duel, earn titles, marry the governor's daughter, rescue four lost family members and dig up treasure from four-piece maps. They retire before age catches up with them, and the final score and rank (Beggar up to King's Advisor) are kept per boy.

The world is three.js (0.170.0, pinned via an import map) with all procedural low-poly assets. Every menu, HUD and panel is HTML/CSS over the canvas, styled from the UI design `research/Pirates! UI Recreation/Peg Leg Ted UI.dc.html` (screens 1a–1k). The spec lives next to it at `research/.../docs/game-peg-leg-ted.spec.md`. Dan's run decisions (all phases, simple assets and locations for now, multi-file, IndexedDB, bigger touch targets, brighter "Plunder" look) override that spec.

## Features

- **1a Title:** two captain cards, Caleb and Ezra. Each shows rank, an age bar, health, last voyage, fortune, family x/4 and top score (points plus the age he retired at), with Continue and New career. New career reveals the nation, difficulty (Apprentice → Swashbuckler) and special skill (Fencing, Gunnery, Navigation, Medicine, Charm) pickers. A harbour-at-dusk scene drifts behind.
- **1b Sailing:**
  - Wind-driven arcade physics, with hold-to-steer ◀ ▶ buttons or a horizontal swipe on the sea (sailing and battle) and sails set to Full, Battle or Furl.
  - Chase camera, wind compass, ship card, chips, and a minimap that opens a full parchment chart.
  - Encounters come with Approach/Ignore and a spyglass. Roaming villains appear, running aground damages the hull, and the calendar advances about one day every 6 s.
  - Food, ageing and a retirement prompt run while sailing.
- **1c Port:** town panel (standing with each nation, gossip) and six building tiles:
  - Governor: titles and land, letter of marque, romance and marriage.
  - Tavern: crew, a round for the crew (+morale, 3 per visit), rumours, family clues, map pieces.
  - Merchant: Sugar, Tobacco, Spices, Hides and food.
  - Shipwright: repair, guns, copper/cotton/extra-gun upgrades, buy and sell ships.
  - V Captain's Log, VI Retire (confirm → retirement).
  - In hostile towns you can only sneak in, and getting caught starts an escape duel.
- **1d Ship battle:** ◀ ▶ steer (or swipe), Sails above one big FIRE button, which fires whichever broadside bears. Hits damage hull, sails and crew. The enemy AI flees or manoeuvres depending on its type. Grapple & Board leads to a duel; the outcomes are capture, sink (the ship goes down in smoke and the crew swim off), escape or defeat.
- **1e Sword duel:** pick a weapon (Rapier, Cutlass or Longsword). The enemy telegraphs High, Mid or Low; parry the matching height to open a counter window, then strike to push him along a 9-cell deck track and off his rail. Crew size and morale nudge the track. Fencing, age and difficulty change the timing windows.
- **1g/1h Captain's Log:** tabs for Status, Fleet & Cargo, Maps and Journal. The Maps tab shows a 2×2 grid of fragments with hints; with 3 or more pieces, Mark on chart shows the dig area.
- **Treasure dig:** walk the captain on the beach, get warmer/colder hints, 5 digs.
- **1j Retirement:** life story, tally, final score and rank. The Hall of Fame shows both boys.
- **1k Pause & Settings:** Resume, Save, Settings, The Story, Quit to title, ← Back to Arcade. Settings cover music and SFX volume, which hand steers (mirrors every HUD), button size, battle speed and captions.
- **Asset lab** (`asset-lab.html`): a viewer for every ship, prop, character, FX and scene, with nation, sail, damage, wireframe, Day/Dusk/Night and a stats readout.

## Files

- `index.html`: the shell. Import map, fonts, `#gl` canvas, `#ui` stage (1333×690, scaled) and the back button (`../../index.html`, shown in every mode).
- `asset-lab.html`: the Phase 1 asset viewer.
- `css/base.css` (tokens, buttons, frames) plus one `css/<mode>.css` per mode.
- `js/arcade-store.js`: the IndexedDB store, an unmodified copy.
- `js/plt-assets.js`: every procedural asset (`PLT`), between the `PLT ASSETS BEGIN/END` markers.
- `js/engine.js`: renderer, view and pointer helpers.
- `js/state.js`: save model, careers, calendar, ageing, modifiers.
- `js/world.js`: map and data tables (towns, islands, goods, ships, encounters, villains, family, treasure, ranks). The first tables in the file are what a future map generator would replace.
- `js/ui.js`, `js/audio.js` (generated WebAudio SFX and captions, plus the two music themes), `js/main.js` (mode registry, `ctx.go` / `ctx.back`, autosave).
- `js/story.js` (the opening story panels), `js/swipe.js` (swipe steering), `js/track.js` (the tracking arrow).
- `images/` (the illustrations, see below) and `audio/` (the two music themes).
- `js/modes/`:
  - `title`, `pause`
  - `sail` (+ `sail-world`, `sail-chart`)
  - `port` (+ `port-common`, `-governor`, `-tavern`, `-merchant`, `-shipwright`)
  - `battle` (+ `-sim`, `-outcome`)
  - `duel` (+ `-logic`, `-scene`)
  - `log` (+ `log-helpers`)
  - `retire`
  - `treasure` (+ `treasure-maps`)

## Design decisions

- **Illustrations:** 138 WebP images in `images/`, generated from `research/image-prompts.md` (3D Pixar-style; faces in the top third). `ui.pic(name)` / `ui.imgUrl(name)` / `ui.moment(name, {title, text})`.
  - Port tiles I–VI: `port-<town>-governor|tavern|merchant|shipwright` (one character per port), plus `port-any-log` and `port-any-retire`. A fade keeps the tile text readable, and the building panel header shows the character.
  - Captains: `captain-<slot>-young|old` (old from 45) on the title cards and the log.
  - Family and villains: avatars in the log list, a portrait on the page, and the villain on his WANTED poster.
  - Battle result card: `moment-prize-taken|ship-sunk|escape|defeat`. There's no picture when the enemy escapes.
  - Moment pop-ups: family rescued, wedding, new title, map piece (tavern and governor) and mutiny warning. Treasure found goes on the dig result card (`moment-treasure-<quest>`).
  - Retirement: `retire-<rank>` fills the left panel.
  - Opening story: `story-intro-1..4` plays when a career starts (`js/story.js`, Skip/Next), and Pause → The Story repeats it with Peg Leg Ted's portrait.
- **Music:** Dan's two themes, encoded Opus/WebM 48k like the house format (`knowledge/audio-patterns.md`) but **without** the 6dB cut, and played at full element volume × the Music slider (Dan found the house level far too quiet under the SFX): `audio/peg-leg-ted-normal.webm` and `audio/peg-leg-ted-battle.webm`, from `research/peg-leg-ted-<name>.m4a`. The normal theme starts on the first tap on the title screen and plays over the whole game. `battle` and `duel` (ship fights, boarding, sneak-in guards, including their outcome cards) switch to the battle theme. Overlays keep whatever is underneath. The switch lives in `main.js markMode()` → `audio.theme()`, which cross-fades over 1 s. Deliberate departures from the house rule, as in fleet-forge: two tunes, a cross-fade, and the Settings music-volume slider scales them.

- **Saves:** stored in IndexedDB via `arcade-store.js` under the key `calebArcadeData:peg-leg-ted` (the old name, kept on purpose so existing careers survive the rename): `{slots:{caleb,ezra:{career, topScore:{points, retiredAge}}}, settings}`. Writes are stamped with sid/gen and use `guard:true`. It autosaves on every mode change and every 30 s.
- **Modes:** each mode is a module `{enter, exit, update}` and owns its scene. `pause` and `log` are overlays. Duel is generic: it returns `duelWon` to `returnTo`, and the caller (battle or port-sneak) applies the rewards.
- **Money:** one purse (`gold`). It pays for everything and is what the final score counts. (Gold ashore and Divide Plunder were removed; old saves fold `fortune` into `gold`.)
- **Crew morale:** drifts down with the days since `lastCheer`; the tavern's "Buy the crew a round" (2 gold per sailor, min 15, up to 3 per port visit) lifts it by 12 and resets the clock.
- **Titles:** they need both fame and standing with a nation, and capturing that nation's enemies raises standing.
- **Touch targets** are bigger than the spec: at least 64px everywhere, primary buttons 76px, steering 100px, FIRE 120px or more. The Large setting grows them further. There are no keyboard hints; desktop debug keys exist in battle.
- **Performance:** pixel ratio is at most 1.5, shadows are off, materials are shared and instancing is used. Busiest scene is about 100 draw calls and 55k triangles; script time is under 1 ms a frame.
  - Instanced meshes use `PLT.materials.inst(name, colored)`, their own cached twin of a shared material. One material shared by instanced and plain meshes makes three.js re-derive the shader on every draw call.
  - Pause and Log freeze the paused scene (`engine.setFrozen`): the last frame stays up and nothing is redrawn.
  - Far islands stay built (hidden, up to 26) rather than being rebuilt when you sail back.
  - HUD writes only when a value changes.
- **Performance mode** (Settings; per device in localStorage `peg-leg-ted:perf`; `?perf=1` / `?perf=0` overrides):
  - Now: 1× resolution and a 30 fps cap.
  - On the next load (a Restart now button appears): no anti-aliasing, Lambert instead of PBR materials, a coarser water grid and about 40% of the island scenery.
  - In the headless software renderer this was about 3× the frame rate at sea, and it looks nearly the same.
- **Approved deviations from arcade defaults:** three.js instead of Canvas 2D, an HTML HUD, the navy/gold/parchment theme, and multi-file.

## Known gaps / next

- The world is a simple hand-authored table of circle-blob islands, so mainland coasts look lumpy. A map generator is planned.
- There is no attacking towns (the land assault was removed on purpose), no shot types, and no day/night cycle at sea. Relations between nations never change,.
- Frame rate is untested on the real tablet (it was checked in headless swiftshader only).

## Memory

- 2026-09-24: first build, all phases 1–8 in one run (assets → shell → six modes built in parallel → integration → review → fix pass). Review verdict: pass. Minor fixes applied: back button in every mode, Charge marches to the gate when no foes remain, Attack prompt shows the odds, plurals, spelled-out compass words, Large-button chip spacing, 12px minimum labels, asset-lab panel fits the screen, and scoring retuned (wealth scored on a √ curve).
- 2026-09-25: open-sea boats 50% faster (`SEA_SPEED = 1.5` in sail.js, player + AI ships) with snappier acceleration. Keyboard for desktop: A/D or ←/→ steer, W/S or ↑/↓ raise/lower sails (sail: Furl↔Battle↔Full; battle: Full/Battle), Space = the open prompt's main button at sea (Approach / Enter Port…) or the spyglass, and FIRE in battle.
- 2026-09-25: Captain's Log "Maps" tab renamed **Quests**; the quest list keeps its scroll position when you tap a quest (render() saves/restores `.lg-scroll` scrollTop). New **Track** (`js/track.js`, `career.track = {type,id}`): villains (their haunt, or their live ship when in sight), family members (once all 4 clues point to a town) and treasure maps (≥3 pieces; also marks the chart). Sailing shows a gold arrow pill under the wind compass ("Rock Brasiliano · Near Campeche · 70 leagues"), tap → Quests tab; a star on the minimap (edge arrow when off-map) and on the chart; "You've reached …" toast on arrival.
- 2026-09-25: **Retreat** in the land assault now sends the squad running for the boats (faster, can't be pinned in melee, still shot at); at the beach they're safe, and if every squad gets back the attack ends as a "Back to the boats" retreat (smaller standing hit). **Pinch to zoom** on the open sea (mouse wheel on desktop), 0.6×–2.4×, remembered for the session. **Sneaking into port:** the guards roll once at the town gate (30%) before the port loads — win the duel and you're in for the rest of the visit; buildings never trigger a fight. **Wind:** softer penalty (straight into the wind keeps 55% speed, was 30%; light winds 0.82×). **Battle:** our ship is 20% faster.
- 2026-09-25: one fleet limit, `world.FLEET_MAX = 8`, shared by the shipwright and battle prizes (the shipwright said "6 of 5" because it capped at 5 while prizes allowed 8). Shipwright fleet list: compact rows, sticky header, visible scrollbar, and it keeps its scroll position when you tap a ship (port `render()` saves/restores scrollTop). Thin visible scrollbars on parchment lists.
- 2026-09-25: no browser long-press / right-click menu (contextmenu + selectstart blocked, touch-callout off). Merchant +/−: a "HOLD for more" bubble while pressed. **Tobacco → Cocoa** (saves migrate `cargo.tobacco` → `cargo.cocoa`). Finger drag-scrolling for every stage list (`ui.dragScroll`): tablets that won't scroll lists under touch-action:none now do, with a little fling, and a drag never counts as a tap. Treasure Mark on chart / Track buttons stacked. Sailing: the harbour prompt appears earlier (125u ring, was 70u), and running into a town's coast takes you straight into port (sneaking in if hostile); also fixed a crash path when stepPlayer continued after leaving.
- 2026-09-25: sailing HUD tidied — ship card, wind and the tracked quest share one panel (top-left, x 170); Spyglass and Log buttons removed from the bottom-right (Space still uses the spyglass); **Captain's Log** is a book-icon button in the header, left of the menu. Merchant: **Buy all** per good and **Fill up** for food. **One difficulty only** (Journeyman; picker removed, old careers migrated). **Esc** = pause / resume (also closes the log). Pause menu: "Save career" removed — it autosaves (note under "Paused").
- 2026-09-25: never stranded off the chart. `world.departurePoint` only picks spots inside the playable area (St Augustine and Campeche used to launch you outside it); old saves are clamped inside on load; and past the edge the ship is no longer frozen — moves that head back in are allowed and a gentle current pushes you inside (`world.EDGE`, `world.inBounds`).
- 2026-09-25: fleet limit back to **5** (`world.FLEET_MAX`) for buying and prizes; a bigger fleet from before is kept, shown as "N ships (max 5)", and you must sell down before adding more.
- 2026-09-25: sailing HUD — ship status card back in the header on its own; wind and the tracked-quest arrow are narrow stacked cards against the left edge (x 16, under the back button).
- 2026-09-25: **Fixed the blank battle screen.** A captured (or beaten) ship furls her sails, but the battle sim had no speed for 'furl', so her position went NaN; the camera target is shared between battles, so that NaN blanked every later fight (UI still showed "Guns bear! FIRE!"). Added `furl` to `SAIL_MULT`, and the camera now snaps its target on the first frame and ignores NaNs. **Swap on capture:** with a full fleet the outcome card offers "Swap a ship" — pick one of yours to give up; cargo that no longer fits goes overboard. **Cargo tons shown next to guns** in the sail card, battle header, shipwright list/buy cards, Captain's Log fleet and the swap list. **One header height:** back button, chips, menu, log and battle wind badge are all 64px (var(--tap)) at top 16.
- 2026-09-25: settings trimmed to Music, Sound effects and Captions (steer-hand swap, button size and battle speed removed; saves forced to the defaults). Header row slimmed to 48px (`--hdr`): back button, chips, menu/log buttons, battle wind and treasure digs. Back button text is now **← Games** (also pause and retirement).
- 2026-09-25: pause menu — '← Back to Games' removed (the header button does that) and 'Quit to title' is now **Choose your captain**. Merchant row order: Sell all · − · + · Buy all (food: note · + · Fill up). index.html and asset-lab.html now link the arcade favicon at the repo root (`../../favicon.svg`, per knowledge/boilerplate.md).
- 2026-09-25: **Governors can hold map pieces** (quest sources of kind `governor` — Port Royal, Martinique were never handled): the Governor tile shows a "Map" badge and the mansion a "Torn map piece" card — free if they like you (standing ≥ 10), for gold if neutral, refused if they don't. Log hints now say "· ask at his mansion". **Treasure vs harbours:** the dig prompt is checked first and replaces a harbour prompt; within 150 of a marked dig site harbours never prompt or pull you in; bumping a coast only enters port when you're within the harbour prompt ring (was a much wider circle round the town). Sun Coins moved to Trinidad's east shore (was 16u from the harbour, "North shore" → "East shore"); Silver Fleet nudged SW, away from Santo Domingo.
- 2026-09-25: **Pardons.** Sneaking into an enemy town (e.g. a Spanish port while sailing for England — the two are at war in 1660), the tavern has a governor's clerk who sells a pardon (200 + 150 × town wealth gold). It unlocks the Governor for that visit; he'll still refuse titles and papers, but will sell you a map piece he holds. Tavern/governor columns now scroll instead of squashing cards.
- 2026-09-25: **Harbour pilot:** heading inbound inside a harbour's prompt ring (125u) the ship shortens sail (battle sails shown) and is capped at half speed; bumping any coast within 195u of a harbour (`BUMP_RING`) now enters port instead of running aground (except near a marked dig site). **Debug (Settings → Show distances, on by default for now):** dashed rings on the sea at each nearby harbour (gold = prompt/slow ring, faint white = bump-to-enter ring) and a readout beside the steering buttons: nearest harbour distance and thresholds, each AI ship's distance (seen < 430, attacks < 40) and the dig-site distance.
- 2026-09-25: town rings re-centred on the **town** (not its harbour) and roughly halved: prompt/slow ring = max(110, harbour offset + 40) ≈ 114u for most towns, bump ring +30. All checks (prompt, half-speed pilot, bump-to-enter, debug readout) measure from the town centre and pick the town whose ring edge is nearest, so neighbouring towns overlap far less.
- 2026-09-25: **Treasure dig:** your treasure map (the pieces you hold; missing quarters shown dark) sits top-right like the sailing minimap — tap to enlarge/close. Every empty hole leaves a **dowsing arrow + ring** on the sand (Bone Village style) pointing roughly at the treasure, coloured by heat (blue cold → yellow warm → red hot); the closer you dig, the truer it points (±45° far, ±8° very close).
- 2026-09-25: chart overlay — tapping a town shows **➤ Track <town>** (tap again to stop); the tracker now supports `{type:'town'}` targets (points at the harbour, 'Spanish port · N leagues').
- 2026-09-25: distances halved again — town prompt/slow ring 55u round the town centre (bump-to-enter 70u), ships sighted < 215 (spawn at ~450), pirates attack < 21, dig prompt < 30 (clears > 69), dig sites keep harbours away within 75. Checked all 24 towns can still be reached: sailing straight in, the prompt fires at 40–55u (or bumping the coast takes you in).
- 2026-09-25: notifications (toasts, incl. Sail ho!/Enter Port prompts) moved to the top centre under the header (battle/duel lower, under their top bars); sound captions moved to the bottom centre.
- 2026-09-25: debug harbour rings + distance readout switched off and the 'Show distances' setting removed (code kept dormant in sail.js; `settings.debug` forced false).
- 2026-09-25: merchant buttons made consistent — one style (`.pm-btn`): sell side (Sell all, −) copper-red, buy side (+, Buy all, Fill up) green; any button that can't be used right now is faded the same way.
- 2026-09-25: 'Mark on chart' merged into **Track**: tracking a treasure map also marks its search circle on the chart (and enables the dig prompt); tracking something else or stopping clears the mark. One button on the treasure page.
- 2026-09-25: arrow-only steer buttons plus swipe steering (`js/swipe.js`) at sea and in battle. Battle: Sails sits above FIRE, and the second-broadside ring is gone. The prize card's choice is now the continue (Add her / Swap one of mine → tap a ship / Let her go). All close buttons are a consistent ✕ (`.x-btn`).
- 2026-09-25: land assault removed entirely (Dan): assault modes and CSS, the Attack prompt, the duel's commandant context, and the cavalry/squad-marker assets. Hostile towns offer only Sneak In / Sail On. Tapping outside the pause menu resumes.
- 2026-09-25: new-career page has waving flags (drawn with the ships' flag art, `PLT.utils.drawFlag`) and skill icons. Every place the text mentions is now a port or a chart label (islands, the Spanish Main, family-clue regions); `placeName` never names an unlabelled islet. Retire moved from the governor to port tile VI; Divide Plunder and gold ashore were removed.
- 2026-09-25: real music replaces the generated shanty (normal everywhere, battle for battle/duel modes).
- 2026-09-25: performance pass (instanced-material fix, frozen redraw under menus, island cache, HUD write-on-change) and Performance mode setting.

- 2026-09-26: renamed Peg Leg Ted → **Cutlass Coast** (folder `games/cutlass-coast/`, this doc, the arcade card). Asset names (`peg-leg-ted-*.webm`, `images/peg-leg-ted.webp`), the save key and the perf key were left as they were. The illustrations were wired in (see Design decisions).
