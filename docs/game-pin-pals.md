# Pin Pals (games/pin-pals)

Ten-pin bowling for Caleb and Ezra on one tablet (target 1333 × 690 landscape). Three.js scene,
cannon-es pin physics, all UI in HTML/CSS over the canvas. Built in Claude Design; the design guide and the original bundle are in `games/pin-pals/research/Pinfall bowling game design/` (gitignored).

## Play
1. **Line up**: drag sideways to pick a board (1–39).
2. **Pull back**: drag down. Depth sets the power cap (Soft / Medium / Full). Pull angle sets the wrist (hook side).
3. **Hold**: keep still. The sight bubble centres, the ring fills, then it turns brass with a "tock". That's Ready.
4. **Flick**: swipe up and let go. Speed comes from flick speed, line from flick direction, and spin from wrist + the stroke's bow.
5. **Steer**: while the ball is on the oil, swipe left/right to nudge spin (±30%, ±40% on Easy). It can't flip the hook.

## Modes & players
Classic (10 frames) or Quick (5).
- **Two player**: Caleb and Ezra (or either one solo), alternating frames, with a hand-off screen between turns.
- **vs AI**: Caleb or Ezra against 1–3 AI opponents (Rusty, Penny, Duke), each set to Easy (scores about 40–60), Medium (60–102) or Hard (90–120). Each AI turn can be watched or skipped
  (skipped turns are simulated instantly, then shown in a toast). "Always skip AI turns" is on the AI hand-off card and in Pause.
Each player has his own Easy/Normal setting, bumpers, best score, wins and Ready-release stats.

## Ball shop & ball characters
Pins are the currency, earned per player: 1 for every pin knocked down, +10 for a strike, +5 for a spare, +25 for a multiplayer win, +20 for a new best (Classic).
Each ball plays differently. Before any throw, use the ball button (bottom right, shown once you own 2+) to swap between owned balls.

| Ball | Price | Type | What it does |
|---|---|---|---|
| Classic | free | All-rounder | Baseline: 7.0 kg, every multiplier ×1 |
| Midnight | 100 | Arrow | Release wobble ×0.45, hook ×0.6 |
| Marble | 200 | Heavy | 8.2 kg, impact ×1.35, hook ×0.75 |
| Candy | 350 | Spinner | 5.6 kg, hook ×1.45, glancing hits up to +80% impact |
| Ocean | 500 | Curler | Swipe spin ×1.6, hook ×1.25 |
| Lava | 750 | Wrecker | 8.6 kg, impact ×1.5, pin-on-pin ×1.3 |
| Gold | 1000 | Champion | Impact ×1.2, hook ×1.15, wobble ×0.7 |
| Galaxy | 1500 | Super spinner | Hook ×1.7, glancing hits up to +100% impact |

The angle bonus scales with how side-on the ball meets the pin (0 head-on, 1 a full side-swipe). The result receipt flags "Angle hit" or "Heavy hit" when a bonus fired.
AI balls: Easy uses Classic, Medium Marble, Hard Gold. All stats are in the `BALLS` table.

## Tech
- `index.html` (single file) + `js/arcade-store.js` (unchanged copy of the arcade store) + `js/pinfall-sfx.js` (every sound, shared with `sound-lab.html`).
- `sound-lab.html` is a dev page for tuning per-sound gain, pitch spread and the music/effects balance. Not linked from the arcade.
- Saves: IndexedDB via ArcadeStore, key `calebArcadeData:pinfall` (kept from the working name so play-test saves carry over). A game in progress resumes on the hand-off screen.
- three.js 0.165 and cannon-es 0.20 from unpkg (import map). No model or texture files: lathe pins, canvas textures.
- Render on demand. Fast mode: render scale 1, no shadow map, physics at 1/90. Performance monitor: P, or hold Fast mode in Pause.
- SFX are recorded files in `sfx/` (Opus/WebM, mono 64k, silence trimmed; originals in `research/sounds/`), played through Web Audio on the sounds bus with per-sound gains from the Sound lab. The tension hum is generated.
- Music: three tracks in `music/` (Opus/WebM 48k, full level, not dropped 6dB, by Dan's choice; originals in `research/music/`), on the music bus. The Sound and Music sliders in Pause set the levels.

## Tuning knobs (top of the script)
Ready window 1.2 s / 2.0 s (Easy) · hook accel 1.1 m/s² × spin · oil ends at −11 m · lane drag 0.08 / 0.35 m/s².
Speed caps 6.0 / 7.5 / 9.0 m/s, reached at a 2000 px/s flick. `PUNCH` (impact boost on top of the solver): ball → pin 0.18 × ball speed,
pin → pin 0.2 × impact speed (above 1 m/s), plus a gentler tip-over spin. Ball-pin and pin-pin contacts use stiffness 5e7 / relaxation 2 so impacts aren't soaked up.

## Lanes & music
The lane (Maple · Cosmic · Iron) is chosen top right on the start screen and saved for everyone. Effects are cosmetic only.
Music: `games/pin-pals/music/pinfall-maple.webm`, `pinfall-cosmic.webm` and `pinfall-metal.webm` loop per lane. Each lane plays its own track, and switching lanes crossfades over about 1.5 s. Missing files are skipped. Levels and the music/effects crossfade are tuned in `sound-lab.html`.

## UI theme per lane
Each lane sets CSS tokens on `body[data-alley]`: `--brass` (primary: go, best, coins, strike cells), `--acc2` (secondary: spare cells, emphasis), `--acc3` (tertiary), `--onAcc` (text on accent), `--panelRGB` and `--sheet` (surfaces), plus `--ink`, `--mut` and `--line`. Golden Lanes uses brass and ivory, Cosmic Bowl cyan and magenta on indigo, and Metal Stage molten orange and steel on near-black.

## Lane fonts
Golden Lanes uses Bricolage Grotesque. Cosmic Bowl uses Orbitron (titles, big numbers, hood sign) with Rajdhani for the HUD. Metal Stage uses New Rocker (titles, best score, "Strike!", hood sign) with Barlow Condensed for the HUD.

## Names
The game is called Pin Pals, in `games/pin-pals/` (it started as `pinfall`, and the save keys stay `calebArcadeData:pinfall` and `:pinfall-sound`). The lanes are Maple Alley, Neon Galaxy and Riff Arena; the hood signs read "Pin Pals", "NEON GALAXY" and "RIFF ARENA".

## Log
- 2026-10-09: Moved from the Claude Design bundle into `games/pin-pals/`. SFX re-encoded mp3 → WebM into `sfx/`, music re-encoded at full level, card `added` set to the ship date. Checked in a headless browser at 1333×690: no console errors, "← Games" on top on every screen (start, shop, hand-off, in game, pause) and it returns home via history.
- 2026-10-09: Moved from `games/pinfall/` to `games/pin-pals/` to match the title. Save keys unchanged.
- 2026-10-09: AI difficulty retuned (it was too hard: Easy ~111, Medium ~149, Hard ~183 over 40 simulated games each). Each AI now has a `target` score range (Easy 40–60, Medium 60–102, Hard 90–120) and `aiWobble()` scales its aim wobble by how far ahead of target pace it is (×0.5–×4). Simulated 80 games each: Easy avg 53 (p10–p90 46–62), Medium 82 (73–90), Hard 106 (95–117); the odd late strike streak can still push one a little past the top.
