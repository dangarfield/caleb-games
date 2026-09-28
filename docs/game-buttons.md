# buttons

**Buttons!** is a 3D find-the-real-button room escape for Caleb and Ezra. Buttonland opens tomorrow, with the best
ride ever, the Big Dipper, but the cheeky Button Muddler has filled the park with pretend buttons and locked every
door. Only one button in each room is real, and Bip the robot has clues to find it. Escape all 10 rooms, then ride
the Big Dipper.

Built from the Claude Design handoff in `games/buttons/research/New game design overview/` (`Buttons Spec.md` is the
spec; `Buttons 3D.dc.html` is the clickable prototype; `room3d.js` and `coaster3d.js` are its Three.js engines; `Btn`,
`Chip`, `Icon`, `Bip`, `Muddler .dc.html` are the 2D parts). The rooms and the ride are **Three.js**; every screen,
the HUD and the overlays are **HTML** on top, on a 1333×690 stage scaled to fit, the same way as Crazy Golf.
Touch-first, landscape only. Caleb and Ezra each have their own save.

## Features

- **Screens (all from the design):** Home (the story in 4 picture lines, Caleb/Ezra player cards, Play, Button Book),
  Park map (10 stops, the next room pulses with Bip and "Play!", locked stops, the Big Dipper card), Room intro (name
  card slams down, CLUNK!, the Muddler waves and runs off), Controls intro (first room of the session only: Bip's
  clues, Drag to turn, Tap a wall, Back out, Pause, 1.7s each, tap to skip), Play, Inspect, Muddler mix-up, Win,
  Wrong-button gag, Free-clue offer, Pause, Button Book, Big Dipper ride and On-ride photo.
- **Rooms:** Ticket Booth, Ice Cream Parlour, Toy Bedroom, Pizza Kitchen, Pirate Treasure Hold, Spooky Crypt, Wizard's
  Study, Inventor's Workshop, Space Station, Coaster Control Room. About 30 → 240 buttons. KayKit furniture, openable
  fridges, ovens, chests, coffins, cupboards and lockers, real window holes (the Space Station looks out on a planet,
  the Control Room on the coaster, through a stencil portal).
- **Controls:** one-finger drag turns the room ±17°. Tap a wall (or a button on it) to zoom to that wall; drag pans
  when zoomed; Back out (bottom-left) returns. Tap a clue thing to collect it. Tap a drawer/cupboard (zoomed) to open
  it. Pressing a button takes two taps: tap it, then PRESS on the inspect card (the close-up sways ±28° so the symbol
  stays readable).
- **Three rounds per room:** after a correct press in rounds 1–2, "Got one!" fills a pip, the Muddler spins in, the
  buttons swirl and the room is re-generated behind the overlay (new buttons, target, clues and clue things; the
  furniture stays). "Round 2 of 3!" starts the next round. The door opens only after round 3.
- **Stars and time:** start with 3, each wrong press costs 1, never below 1. The timer runs in play and while
  inspecting, and stops on pause and overlays. Stars and time carry across the three rounds.
- **Clue generator** (`js/rooms.js` `genRoom`, the prototype's, kept as is): tiers by room (1–2 tier 1, 3–5 up to tier
  2, 6–10 all), greedy weakest-first selection, a recolour fallback so exactly one button matches, a positive clue
  first, 1 clue up front and 3–5 in clue things. Rooms 8–10 add the Muddler's fib (purple card) and a Bip clue that
  exposes it (the fib gets a FIB! stamp and is struck through). 30% chance the target has the player's initial ("It's
  the first letter of your name"). The giant floor button is never the answer in rooms 1–5, 12% from room 6.
  `node games/buttons/tests/clues.mjs [n]` generates n × 3 rounds for each room and checks it.
- **Clue things:** note, parrot, TV, fortune cookie, message in a bottle, at 72% size, twinkling briefly every 4.8s
  (every 2.6s while "Make it easier" is on), hidden inside openables, on furniture, up high, down low or in corners.
- **Free clue:** after the 2nd wrong press in a round, Bip offers one; "Yes please" collects the next hidden clue.
- **Make it easier (pause):** ON/OFF switch. Buttons the found clues rule out fade to 20% (still tappable). Saved, and
  stays on across rooms and rounds until switched off.
- **Wrong-button gags (30):** every one is animated. The first five follow the prototype (Rubber Duck Drop, Boxing Glove
  Spring, Confetti Shower, Trumpet Parp, Disco Lights); the other 25 are new (Custard Pie Splat, Whoopee Cushion,
  Jack-in-the-Box, Bubble Storm, Rubber Chicken, Indoor Snow, Balloon Float-Away, Upside-Down Room, Tickle Feather,
  Green Goo Drip, Banana Peel Slip, Giant Sneeze, Moustache on Bip, Squirty Flower, Tiny Rain Cloud, Frog Chorus, Bouncy
  Ball Flood, Sad Accordion, Glitter Bomb, Cuckoo Clock, Sock Rain, Jelly Wobble, Squeaky Hammer, Spaghetti Drop, Tuba
  Blast): an SVG/CSS prop, a keyframe and its own Web Audio SFX each. Upside-Down Room, Giant Sneeze and Jelly Wobble
  move the 3D room itself. Gags you haven't found come first, so the Button Book fills up. Auto-continues after 3.8s.
- **Button Book:** 30 tiles per boy, "???" until found; tap one for its SFX word, name and description.
- **Big Dipper:** first person from the front car, Bip beside you: station, lift hill (clack SFX), big drop, the street
  of the 10 rooms, loop-the-loop, splash pond (splash SFX), the Muddler's white flag, back to the station, photo flash.
  About 84s at 60fps. Captions, a progress bar and Skip. Unlocks when that boy has cleared room 10.
- **On-ride photo:** the boy's button, Bip, the Muddler with his flag, total time and stars; saved to his page.
- **Sound:** Web Audio SFX, no mute button. Background theme: Dan's song (`research/buttons-song.m4a`, 2:59) encoded to `audio/buttons-theme.webm` (Opus 48k, -6dB, 1.3 MB), looping at background level from the first tap and paused when the tab is hidden.

## Files

- `index.html`: the shell (importmap for three@0.170.0 on jsdelivr, Google Fonts Fredoka + Nunito, back button
  `../../index.html`).
- `css/style.css`: tokens, chunky buttons, clue cards and every keyframe (the prototype's, the 2D parts', and the 25
  new gags' `g-*`).
- `js/main.js`: the controller (screens, room state machine, HUD, overlays, gags, the ride, actions, timer) and the
  `window.__btn` debug hook (`__btn.room(n)`, `__btn.go('book')`, `__btn.ride('loop')`, `__btn.win()`, `__btn.found()`,
  `__btn.wrong('tuba')`, `__btn.hold(true)`, `__btn.tap(type,id)`, `__btn.skip()`, `__btn.target()`).
- `js/rooms.js`: the 10 room layouts, model bounds, openables, `layoutRoom` and `genRoom`, lifted from the prototype.
  No DOM or three.js, so node can import it.
- `js/room3d.js`: the handoff's room engine, adapted (see Design decisions).
- `js/coaster3d.js`: the handoff's ride, adapted; `simulateRide()` reports the ride length and when each part starts.
- `js/gl.js`: the shared WebGL renderer, pixel-ratio cap, quality governor and GPU clean-up.
- `js/ui2d.js`: Btn, Icon, Chip, Bip and Muddler as HTML-string functions.
- `js/gags.js`: the 30 gag props. `js/audio.js`: SFX and the theme hook. `js/state.js`: saves.
- `js/arcade-store.js`: an unmodified copy of `games/dragonseed/js/store.js`.
- `tests/clues.mjs`: the clue generator test.
- `assets/`: only the models the game loads (KayKit Furniture, Restaurant, Dungeon, Halloween, Prototype and Space Base
  bits; Kenney Coaster Kit pieces and its colormap), about 3 MB. `assets/LICENSES/` has the packs' CC0 licences.
  The full downloaded packs live in `research/packs/` (gitignored) if a new model is needed.

## Design decisions

- As with Crazy Golf, the design replaces the arcade's dark theme and canvas HUD: HTML UI in the design's palette.
  The top-left 140×60 stays clear for the back button on every screen (the Green Goo Drip starts right of it).
- The prototype's localStorage key `buttons.v1` became IndexedDB via ArcadeStore (arcade rule), and its difficulty
  keys are gone: scores are per boy only.
- Gag order: any gag the boy hasn't found yet (all 30 are animated now), else a random one.
- One shared WebGL renderer for rooms and the ride, and one small one for the inspect close-up, reused all session,
  so a tablet never runs out of contexts. Pixel ratio capped at 1.5, shadow maps 1024. If the first 90 frames of a
  scene average under 36 fps, shadows go off and the pixel ratio drops to 1 (add `?hq` to the URL to stop that).
- Rounds 2 and 3 swap only the buttons and clue things into the existing scene (`setRound`), rather than rebuilding
  the room. Restarting the same room does the same. Leaving a room or the ride frees its GPU memory.
- `stencil: true` on the renderer: three r163+ turned it off by default, and the window portals need it.
- Clue things twinkle faster while "Make it easier" is on (the prototype tied that to its old Easy mode).
- Landmark name tags are dropped in 3D (the KayKit models read clearly), as the spec allows.
- The on-ride photo is saved on Skip too, as in the prototype.

## Controls

Touch only. Drag to turn the room; tap a wall to look closer; Back out; tap clue things to collect; tap a button,
then PRESS; Pause (top right) for Keep playing / Make it easier / Restart room / Park map.

## Save format

`ArcadeStore('buttons')` → IndexedDB item `calebArcadeData:buttons`, guarded with gen/sid:

```
{ v: 1, gen, sid,
  boys: { Caleb: { rooms: { [n]: { s: bestStars, t: bestSeconds } }, gags: [ids], photos: [{ date, stars, time }] },
          Ezra:  { … } },
  settings: { player: 'Caleb' | 'Ezra', easier: false } }
```

Room n is open when that boy has cleared room n-1; the Big Dipper when he has cleared room 10.

## Known gaps

- Not yet tested on the real tablet; the frame budget with 240 buttons (about 500 meshes) is the thing to watch. The
  governor should cope.
- No second zoom level onto a single piece of furniture (optional in the spec).
- The gags were checked by eye at a single moment each; timing polish is possible.

## Memory

- 2026-09-28: Theme song added — Dan's `research/buttons-song.m4a` encoded per knowledge/audio-patterns.md to `audio/buttons-theme.webm` (1.3 MB) and `THEME_URL` set in `js/audio.js`.
- 2026-09-28: Room intro card (Room N of 10 / name / blurb / round pips) no longer re-renders and re-slams on each intro beat — only the CLUNK / Muddler wave / run-off layer (`#introStep`, `introStepHTML()` in js/main.js) swaps underneath it (Dan: re-rendering was confusing).
- 2026-09-28: Bip's clue panel now runs the full right-hand side (top 10 → bottom, 670px tall) with the Pause button (66px) built into its header; clue chips 46px and tighter cards so 7 clues fit without scrolling (Dan: 6 clues didn't fit). Controls-intro 'Pause' label moved to match.
