# Pocket Pros (`games/pocket-pros/`)

Three cue games on three.js tables built to regulation sizes, with a TV-broadcast HTML HUD:
- **English pool:** 7ft table, blue cloth, reds and yellows, blackball rules made easier for kids.
- **9-ball:** 9ft American table, red cloth, 2¼in balls. An "Order" strip at the top centre shows balls 1–9 in their colours: the one to hit next is bigger with a yellow ring, potted ones fade. Hit the lowest number first; any pot carries on; the 9 wins. A foul gives ball in hand anywhere. Break from behind the head string.
- **Snooker:** 12ft table, green cloth, 52.5mm balls, 6, 10 or 15 reds. Red then colour, colours re-spot, then yellow to black. Fouls give at least 4 points. Kid version: no free ball or miss rule; a tied score after the black re-spots the black.

The cup progress and titles are saved for each game. Saved records from before 9-ball and snooker were added still count as English pool.

## Play
- **Modes:** Vs computer, Championship, or Take turns (Caleb and Ezra on one device).
- **Computer players:** Rookie Ron (Easy), Steady Steph (Medium), The Professor (Hard).
- **Championship:** pick a difficulty, then play a quarter-final (race to 1), semi-final (race to 2) and final (race to 3) against that difficulty's three players. Each round's opponent is a bit stronger. Easy: Rookie Ron, Lucky Lou, Chalky Charlie. Medium: Steady Steph, Double Kiss Dan, Smooth Sid. Hard: The Professor, Ice Cool Isla, Maximum Max. Progress saves after every frame, separately for each player and difficulty, and the menu offers Continue. If you lose, you replay that round. Titles won are kept.
- **Race to:** 1, 3 or 5 frames (Vs computer and Take turns). Breaks alternate.
- **Aim:** drag on the table. In cue view, dragging right swings the aim left, like turning the table. A tap aims straight at that point. In top view you point at where to aim. The ‹ › Fine aim buttons and the arrow keys (Shift for fine) nudge it.
- **How to play:** on your first game, short tips walk you through: how to win, moving the white ball, aim, small turns, spin and power. The shot you take is only for practice, and the balls are put back after it. Tips about the view button and the scorebar come on your next go. You only see this once, and there is no switch for it on the menu.
- **? button (top right):** opens How to play at any time. It saves the current frame, runs How to play on a practice rack (no shot counts), then puts the frame back exactly as it was when you finish or skip.
- **View:** the table icon switches to the top view, and the perspective icon switches back to the cue view.
- **Shoot:** pull down on the power bar and let go. Slide back up to cancel. On a keyboard, hold Space and release.
- **Spin:** press the cue ball icon and drag. The spin pad opens and the dot follows your finger, and letting go confirms it. Let go on the Cancel strip to undo. A plain tap opens the pad so you can adjust it there.
- **View:** Top view / Cue view button, or V. While the balls are moving the camera goes to a high TV angle.

## Rules
- The table stays open after the break. The first colour you pot legally becomes yours.
- Fouls give the opponent 2 shots (pub rules: once they pot one of theirs, the spare shot is gone and they just carry on; only 1 shot if they're already on the black): potting the cue ball, missing everything, hitting the wrong colour or the black first, or potting an opponent's ball.
- If the cue ball goes in, it's ball in hand anywhere in the D.
- Potting the black after all seven of your colours wins the frame. Potting it early, or fouling on it, loses the frame. If the black goes in on the break, the balls are re-racked.

- **Menu:** the header and the Play button stay in the same place whatever you pick.
- **Sound and Music sliders (pause menu):** Sound sets every sound effect (master gain), Music sets the theme music (its own bus). Both 0–100, default 80, applied squared, "Off" at 0, saved with the settings. Moving Sound plays a ball click.
- **Performance monitor (debug):** three.js Stats (FPS / ms / MB, tap to switch) plus redraws per second, draw calls, triangles, canvas size and quality mode, top left under "← Games". Toggled with **P**, or by holding the Fast mode row in the pause menu for ~0.6s (a hold doesn't flip Fast mode). Remembered in the settings.
- **Player cards:** under each name, a small count of that player's wins for the game, play type and computer level picked (e.g. "3 wins"); in The Cup it shows cups won at that level. There is no stats line under the Play button.
- **Fast mode (pause menu):** for slow tablets. Turns off the shadow map and the spotlight (the other lights are turned up to make up for it) and puts a soft dark spot under each ball instead (one instanced draw). Drops the clearcoat/sheen layers, uses low-poly balls and cheaper cloth texture filtering, draws at 1× resolution and at most ~30 times a second. If frames still take over ~24ms it lowers the 3D resolution in steps down to 60% (the HTML UI stays sharp), and raises it again when there's headroom. The computer works out its shot in a Web Worker, so the game keeps running smoothly however long it thinks. The choice is saved.
- **Performance (both modes):** the table is only redrawn when something changes (balls, cue, aim, camera), and shadows are only recomputed when a ball or the cue moves. The table's ~45 meshes are merged into one per material after it's built (`mergeTable`), so a frame is ~24–30 draw calls instead of ~66. Outside fast mode the computer works out its shot in ~6ms slices between frames. While it thinks, its cue does slow practice strokes back and forth.
- **AI worker:** built at runtime from this file's own source between the `// @worker-a` / `@worker-a-end` and `// @worker-b` / `@worker-b-end` markers (table geometry, physics, rules, shot planning), so it always matches the game. Code between those markers must stay free of DOM and THREE at the top level. If the worker can't start or errors, the game falls back to the time-sliced planner.

## Tech
- A single `index.html`, with three.js 0.160 loaded from jsDelivr through an import map. All the UI is DOM, as `knowledge/ux-patterns.md` requires.
- Custom physics with 1ms substeps: sliding and rolling friction, spin, cushion segments with pocket jaws, and capture circles for the pockets.
- The computer finds ghost-ball shots, simulates up to 42 of them, and scores each one on what it pots, whether it fouls and how good the next shot looks. Each level adds a different amount of aim and power noise.
- Saves go through `js/arcade-store.js` as `calebArcadeData:pocket-pros`: match wins per player in `wins` keyed `<game>-ai-<level>` / `<game>-pvp`, cup titles keyed by game and level, and the last setup used.
- **SFX samples** in `audio/sfx/` (WAV, mono 44.1k, ~185KB total; trimmed to the transient from Dan's mp3s in `research/`, peaks evened out so the code sets the level). Decoded into AudioBuffers on the first gesture; the old synth sounds stand in until they arrive.
  - Ball on ball: `ball-hit-soft` and `ball-hit-hard` blended by impact speed (soft alone under ~1m/s, hard alone over ~2.6m/s, a mix between); volume rises with speed, ±12% volume and ±5% pitch jitter so repeats differ, faster hits slightly brighter.
  - Cue strike: `cue-hit-soft` → `cue-hit` blended by shot power.
  - Pot: `ball-in-pocket`, louder the faster the ball drops in; the white is pitched slightly lower.
  - Break: the first big hit (>2.2m/s) within 1.5s of a break shot plays `multi` (the pack scattering) and ducks the individual clicks under it for 0.9s. A soft snooker break doesn't trigger it.
  - Still synthesised: cushion thuds, the foul sting, applause.
- **Music:** one theme per game in `audio/` — `pocket-pros-pool.webm` (English pool, the default), `pocket-pros-american.webm` (9-ball), `pocket-pros-snooker.webm` (snooker). Opus/WebM 48k, encoded 6dB down from Dan's m4a masters in `research/` per `knowledge/audio-patterns.md`. Each `<audio>` (preload none) is routed through Web Audio (iPad ignores `el.volume`) into a music bus the Music slider sets. Starts on the first activation-granting gesture; picking a different game on the menu cross-fades over 1.6s (`applyGame` → `playTheme`), and a faded-out track pauses and resumes where it left off. Pauses when the tab is hidden.

## Source
- Designed in Claude Design: `research/Pool game design concepts/` (`Pool Concepts.dc.html` concept board, the original `games/english-pool/` build, its plan and doc). The shipped `index.html` is that build, renamed to `pocket-pros` with the music added.
