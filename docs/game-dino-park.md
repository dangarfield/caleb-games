# dino-park

**Dino Park** is a cheerful low-poly dinosaur park builder for Caleb and Ezra. The eggs on Dino Island are
hatching and every dino needs a home: build a park the whole town wants to visit, keep the dinos fed and
happy, and if one sneaks off for an ice cream, go and catch it. Nobody gets eaten.

Built from the Claude Design handoff in `games/dino-park/research/design/` (unzipped from
`Design form questions.zip`; `research/` is gitignored). `gameplay.md` is the rules, `Design and Build Spec.md`
the screens and motion, `Dino Park.dc.html` the clickable prototype, and `dino-world.js` the low-poly
engine. The brief that went to Claude Design is `research/claude-design-brief.md`.
The park is **Three.js** (a `<dino-world>` element); every menu and the whole HUD is **HTML** on top, on a
1333×690 stage scaled to fit. Touch only, one finger, landscape.

## Features

- **Three verbs, one finger:** Build (tap a tray tile, then a glowing spot; at most 4 spots are offered and paths
  lay themselves tile by tile), Look after (tap the food / ball / bin bubbles), Catch (tap a runaway dino to
  throw a net; big dinos take 2–3 taps, shown as pips). Tap a dino in its pen for a happy hop. One-finger drag
  pans a little. No pinch, rotate, long-press or menus inside menus.
- **Screens (all from the prototype):** Home (logo, Rexy's story blurb, Caleb / Ezra cards with a dino-avatar
  swap button, Play, Dino Book, How to play), How to play (2 pages × 4 picture cards), Day map (5-park tab strip,
  5 stops per park, locked parks show "Need N stars" or "Open in the Shop"), Dino Shop, Day intro (3 rating
  targets, what raises the rating, the day's "New!" unlock), Play HUD, Escape moment, Egg hatch card, Pause,
  Day result (stars fly in, points breakdown, coins, XP, level up, "New best!", 3-star Rexy ROAR), Dino Book
  (16 dinos, silhouettes until met, Turn around).
- **HUD on the sides and bottom only:** pause (+ Finish day once you have a star, pulsing at 3), Dino Watch
  portraits with ring meters on the left (tap one to glide the camera to it), Rexy's tip bottom-left (tap it to do
  it), the build dock bottom-centre, the park card bottom-right (coins, mood, rating, star bar).
- **Controls intro** every time a day loads: park card → Dino Watch → Rexy's tip → pause → dock, each with a
  label that pops in and out, then the park goes live.
- **Rules (gameplay.md):** no timer; stars are tiers of a park rating that never goes down (dinos, new kinds,
  features, happy visitors, feeds/plays, catches, equally weighted); 150 coins to start each day; visitors buy
  tickets; hunger and fun meters per dino, breakouts when a meter fills plus random breakouts every 45–85 s, one
  runaway at a time; eggs need an empty pen.
- **A new dino every day (Dan):** every day starts with 3 dinos in the park's 5 pens (6 in Snowy Peaks) — the 3 most
  recently met; while fewer than 3 have been met, the next dinos in hatching order fill in (never today's new one). On a
  day that debuts a dino, the first egg you buy hatches it (the day intro's "New!"). Otherwise an egg hatches a met dino
  who isn't in the park, or any met dino. Every egg costs 900. Star targets are the design's: 120 × residents + 100 above
  the resident rating, at 20 / 50 / 100% (so 795 / 935 / 1,165 every day).
- **25 days, 5 parks, 16 dinos.** Parks open on stars alone (10★, 22★, 34★, 46★). Each park has its own hand-designed layout (river valley, lava ridge, canyon rim, coral lagoon,
  frozen summit), with jeeps or a monorail.
- **Coin Jar + Dino Shop:** coins earned in a day go into the boy's jar. The whole shop costs 31,500 (Dan: about 1,500 a day for
  21 days buys everything). Pens (Stone 1,200 / Lava Rock 2,000 / Crystal 2,800 slow the meters by 15 / 25 / 30%), treats
  (Balloon Cart 900, Flower Arch 1,200, Rexy Statue 1,800, Fireworks 2,400), dino colours (one for every dino, 900 or 1,200,
  Golden Rexy 3,000; locked until you've met that dino — they show in the park), and park treats: **Balloon Cart** and **Rexy Statue** appear as a free tile at the end of the tray, one of
  each per day (visitors passing get a mood boost); **Flower Arch** goes over the gate (visitors arrive happier);
  **Fireworks** puts on a show on the result screen and adds 5% to the day's rating. Day 23's "Bonus jar" doubles
  what goes in the jar.
- **On / off:** tap anything you own in the shop to switch it on or off (colours and treats); for pens, tap one to use it.
- **Park level:** XP = happy visitors + 20 per star + 10 per catch, 150 XP a level, +100 coins per level up.
- **Saves:** per boy (avatar, jar, XP, owned items, best stars + rating per day), through
  `ArcadeStore("dino-park")` → `calebArcadeData:dino-park` in IndexedDB, guarded with gen/sid.
- **Sound:** Web Audio SFX for building, feeding, playing, bins, the escape siren, net throws and hits, catches,
  the egg drop / land / crack / hatch, stars, "New best!", the roar and fireworks. No mute.
- **Music:** one looping theme per park, from Dan, in `audio/dino-park-<park-name>.webm` (made from
  `research/<park-name>.m4a`). On the Day map the music cross-fades (1.5 s) to whichever park tab is selected; Home plays
  the boy's current park; a day's intro, play and result play that day's park; Shop, Book and How to play keep what was playing.

## Files

- `index.html`: the shell (Google Fonts Fredoka + Nunito, back button `../../index.html`, `<dino-world>` under `#ui`).
- `css/style.css`: page shell, the stage, and the prototype's keyframes.
- `js/world.js`: the Three.js park — the design's `dino-world.js` with arcade changes marked `ARCADE:` (pixel
  ratio capped at 1.5 and a 1536 shadow map for the tablet; balloon cart / Rexy statue pieces, flower arch,
  fireworks; shop skins; `egg-land`, `hatch-crack` and `firework` events for the SFX). It loads three@0.160.0 from
  jsdelivr, registers `<dino-world>` (commands as element methods, events on `window` `dp:world`) and `<dp-icon>`
  (icons rendered once from the same models in one shared WebGL context, cached as images). The world stops
  rendering on the full-screen menus (`mode: idle`).
- `js/templates.js`: every screen's HTML, **generated** from the prototype's template by a one-off converter
  (`{{ x }}` → `${v.x}`, `<sc-if>` → ternaries, `<sc-for>` → maps, `onClick` → `data-on` handler ids). The only
  hand edit is the tray tile size (it shrinks when treat tiles make the tray long).
- `js/game.js`: the prototype's logic component carried over nearly line for line (`renderVals()` feeds the
  templates), on a small setState + DOM-morph shim instead of React so elements persist and CSS transitions work.
  Also saves, shop effects, SFX hooks and the stage fit. `window.DP` is the game object for desktop debugging.
- `js/data.js`: days, dinos, parks, prices, rating weights, shop, how-to cards (verbatim from the prototype).
- `js/audio.js`: the SFX and `worldSfx()`, which maps park events to sounds. `js/music.js`: park themes (below).
- `js/arcade-store.js`: an unmodified copy of `games/dragonseed/js/store.js`.

**Music:** `TRACKS` in `js/music.js` maps park ids (`jungle`, `volcano`, `desert` = Sunny Canyon, `beach` = Coral Bay,
`snowy`) to files in `audio/`. Encoded as Opus/WebM 48k without the house 6dB cut and played at full volume, as in
crazy-golf. Which park's theme is wanted is decided in `componentDidUpdate` in `js/game.js`. An optional `menu` id
would become the fallback for any park without a song.

## Design decisions

- 2026-09-27: Dan asked for a Jurassic Park-type game, simple and kid-friendly in controls and actions, with a
  low-poly feel, designed in Claude Design first from `research/claude-design-brief.md`.
- 2026-09-28: implemented from the handoff: HTML for the UI, menus and HUD, Three.js for the park. Easy/Normal was
  removed in the design (everything plays Normal). Shop items the prototype only sold (colours and treats) were
  made to do something in the park. Music left for Dan to add.
- Arcade conventions kept: top-left 140×60 left empty for the back button, touch only, no keyboard hints, no mute,
  story blurb instead of how-to on Home, a save per boy.

- 2026-09-28: Dan added a song per park and asked for the music to cross-fade when switching park tabs on the level
  select (Day map). Encoded all five and wired them in.

- 2026-09-28: Dan found he could buy nearly everything after a day or two (about 1,650 coins from Day 1), and wanted
  parks opened by stars, not paid for. Shop prices ×6, the parks row removed from the shop, and parks open on stars.
- 2026-09-28: Dan asked for a colour for every dino, for bought shop items to be switchable on and off, and for each day to
  reveal a new dino from an egg rather than the park's fixed line-up. Added 12 colours, on/off and pen choice, and the
  residents + first-egg logic above (a free egg was tried and dropped — Dan wants eggs paid for) (the design's fixed per-park line-up is no longer used).
- 2026-09-28: Dan clarified: keep 3 dinos at the start of each day (with the day's new dino hatched from a paid egg), and
  price the whole shop at 31,500 (1,500 × 21 days).

## Memory

- 2026-09-28: the prototype's intro screen showed rating targets from whatever park was already built (after a day,
  that included the dinos hatched in it), so they didn't match the day that started. The intro now resets the park
  preview first.
