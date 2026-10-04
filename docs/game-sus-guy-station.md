# Sus Guy Station (`games/sus-guy-station/`)

An "Exit 8"-style spot-the-difference walk through a tiled London Underground passage, in three.js with an HTML HUD. You walk the same passage again and again. Sometimes one thing in it is different (an anomaly). If something is different, turn back. If everything is the same, keep going. Get the platform sign up to **Platform 10** and you're out into daylight. A wrong call sends you back to 0.

## Play
- **Players:** Caleb or Ezra, picked on the home poster. Each keeps their own count of anomalies found and their best (fastest) time out.
- **Rules (How to play):** 1. Look at everything. 2. Something different? Turn back! 3. All the same? Keep going! 4. Get to Platform 10 to get out!
- **Moving (touch):** hold the yellow arrow (Walk) button, bottom left, to walk. It fades in when a run starts and drops to 25% after 10 s; arrow only, no shadow or pressed state; any other touch on the screen only looks around (slide to look), so you can stop and look without walking, or walk and look with two fingers at once. Tap twice on the screen to turn round. Walk lets go by itself whenever a menu or popup opens.
- **Sus Guy:** a man in a bowler hat with an umbrella walks the passage towards you each lap. Some anomalies are about him.
- **Oops / Well spotted:** a wrong call shows "Oops! Back to 0" with a picture of what you missed. Finding a new anomaly shows "Well spotted!".
- **Things I found:** a gallery of the 32 anomalies (Obvious / Noticeable / Sneaky). Tap one you've found to see it again.
- **Way out:** after level 10 the tunnel hum crossfades into birdsong and the exit goes white.
- **Pause:** Keep playing, plus Sounds and Music sliders. These are saved.

## Anomalies (32)
Lights (out with one following you, flashing, missing), wall stripes purple, posters changed (seaside at night, the dinosaur looking the other way, a guitar How to play poster, two pictures swapped, the umbrella picture upside down), staff door open / reading STUFF ONLY, cupboard door shaking, cleaner door red, floor grates (an extra one, one turned round), a guitar by the wall, a blue fire extinguisher, the clock (backwards, no red hand, square), **the Help Point sign saying your name**, the CCTV camera (watching you, or on the other side of the light), a teddy on the bench turning to look, balloons on the bin, the bin on the other wall, Sus Guy (walking backwards, stopping to look at you, two of him, giant, yellow sandals) and water coming along the floor.

## Tech
- `index.html` (DOM HUD and screens) plus ES modules: `js/world.js` (passage geometry, canvas textures, props, the 32 anomalies), `js/game.js` (loop, input, laps, UI), `js/audio.js` (Web Audio), `js/arcade-store.js`. three.js 0.160 from unpkg through an import map. GlitchPass postprocessing for the intro and the "back to 0" moment. The composer is built at load and `compileAll()` precompiles every material for the screen *and* for the composer's render target (a different shader variant), plus one warm-up `composer.render()` at boot, so the first glitch (only 130 ms in the intro) doesn't stall compiling shaders.
- **Models (`assets/`):** `props.glb` (bench, bin, CCTV camera, extinguisher, guitar, lamps... converted from the research FBX files), `help_point.glb` (the Help Point from `Gates_And_Vending.fbx`, with "Help Point" / "Help Caleb" / "Help Ezra" as KHR_materials_variants), `man2/man.glb` + `clips.json` (Sus Guy, a Mixamo model with Walking and Breathing Idle).
- Saves go through `js/arcade-store.js` as `calebArcadeData:sus-guy-station`: per player `done` and `best`, the last player, the music level and the anomalies seen.
- **Sound:** recorded SFX in `audio/` (footsteps, train, intro transition, level pass/fail, birdsong) decoded into Web Audio. The tunnel hum and the door rattle are generated. Per-sound levels were set in `sound-lab.html` and are baked in as `DEFAULTS` in `js/audio.js` (any local Sound Lab overrides live in localStorage `mindTheGap:soundLevels`).
- **Music:** `audio/sus-guy-station-theme.webm`, Opus/WebM 48k from Dan's master (`research/mind-the-gap-theme-original.m4a`). Unlike other games it is **not** 6dB down: Dan balanced the in-game levels against the master, so it was re-encoded at the same loudness (−15.2 LUFS before and after). `<audio>` with preload none, started on the first activation-granting gesture, paused when the tab is hidden; the Music slider sets its volume.
- **Boot:** the player cards are drawn from the save as soon as the store is read; the font and the three models load alongside and the 3D world is swapped in behind the home screen when ready. Tapping Play (or Things I found) before then shows "Getting ready…" and carries on when it's loaded.
- **Debug:** desktop keys (R/F walk, D/G step, ←/→ turn, Q turn round, Esc pause, I info) and a debug panel to jump to any level or anomaly. None of this is shown on the tablet UI.

## Source
- Designed in Claude Design as "Mind the Gap" / "Mind the Change": the design docs, title screens and uploads are in `research/Mind the Change design doc/`. The shipped game is that session's `games/mind-the-gap` output, renamed to `sus-guy-station` (folder, card slug, store key, theme file).
