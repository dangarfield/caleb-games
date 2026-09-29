# summer-champs

**Summer Champs** is a ten-event summer athletics championship for Caleb and Ezra (ages 6–9): 100m, long jump,
triple jump, javelin, discus, high diving, archery, 50m swimming, weightlifting and fencing, against three rivals
(KAI, MIA, ASH). Low-poly **Three.js** stadiums with a broadcast-style navy and gold HTML HUD, on a 1333×690 stage
scaled to fit. Landscape, touch-first; the keyboard works for desktop testing but keys are never shown.

Designed in Claude Design and handed off in `games/summer-champs/research/Summer Olympics Game Design/`
(unzipped from `Summer Olympics Game Design.zip`; `research/` is gitignored). The handoff doc is
`research/.../games/summer-champs/SUMMER-CHAMPS.md`; the visual reference is `Summer Champs UI Kit.dc.html`, and
the measured HUD layout is `HUD Audit.dc.html`. Sound ideas and the audit are in `docs/game-summer-champs-sound.md`.

## Features

- **Championship** (all 10 events in order: medals, 10/8/6/5 points, a medal table, then the podium after event 10,
  where the winner BackFlips), **Practice** (any event), **Records** (per boy: PBs, championships, golds),
  **Settings** (sound effects, performance mode, reset a boy's records by tapping twice).
- **Per boy:** Caleb or Ezra picked on the home screen, each with their own kit colour (6 kits) and records. The
  active boy stands in front celebrating/dancing; the other crouches behind, and they swap with a walk.
- **Controls:** L/R tap pads (⇄ moves both pads to the right), a big action button, a draw-down pad (archery),
  sliders (diving) and parry/attack buttons (fencing). Pause is top-right in events and `← GAMES` is top-left
  on every screen.
- **Theme music** plays all the time and **ducks** while an event needs your input (from the start of the event
  to the finish, and not while paused or on menus). No mute, per the arcade rule. The SOUND EFFECTS setting mutes
  SFX only.
- **Animation:** 24 Quaternius UAL clips in one trimmed GLB, plus about 50 custom pose-authored clips built from
  them at load (`js/sc-anim.js`) and patched by the anim editor's edits (`js/sc-anim-patch.js`).

## Files

- `index.html`: stage and scaling, import map (three 0.184.0 from jsdelivr), fonts (Barlow,
  Barlow Condensed), all the CSS, the arcade-back snippet, `<audio id="theme">`, and a boot through `js/main.js`.
- `js/main.js`: waits for the save store, then imports `sc-ui.js`.
- `js/sc-ui.js`: **the game entry**. Menus, the championship flow, records, settings, keyboard, pause, the home
  scene. `window.__SC` = `{ G, W, EVENTS, startEvent, intro, finishEvent }` for console testing.
- `js/sc-world.js`: renderer, camera, venues, crowd, water FX, athlete factory, the animation loader
  (`assets/summer-champs-anims.glb` with the meshopt decoder), `clipFloor()` foot grounding, the `PERF` flag.
- `js/sc-events-a.js`: 100m, long jump, triple jump, javelin, discus, `TUNE_DEFAULT` (all tuning), `Waggle`, `cpuValue`.
- `js/sc-events-b.js`: high diving, archery, 50m swimming, weightlifting, fencing.
- `js/sc-hud.js`: every in-event HUD element.
- `js/sc-anim.js` + `js/sc-anim-patch.js`: custom clips and the baked editor edits (merge editor exports into the patch).
- `js/sc-audio.js`: one AudioContext; the theme routed through a GainNode (iPad ignores `el.volume`),
  `duckMusic(on)`, `initMusic()`, the `beep()` placeholder SFX and `sfxOut()` for real SFX. `musicState()` for checks.
- `js/sc-save.js`: the save wrapper (below). `js/arcade-store.js` is an unmodified copy of `games/dragonseed/js/store.js`.
- `js/sc-anim-editor.js`: the anim editor's code (it still uses lil-gui, but only on the editor page).
- `assets/summer-champs-anims.glb`: **generated** (see below). `audio/summer-champs-theme.webm`: the theme.
- `tools/anim-editor.html`: the animation editor (dev only; open it directly at `games/summer-champs/tools/anim-editor.html`). `tools/build-anims.mjs` + `tools/package.json`: builds
  the GLB. `tools/anim-manifest.json`: which clips were kept and where from, and which were dropped.

### Rebuilding the animation GLB

The game used to fetch `UAL1_AllAnimations.glb` + `UAL2_AllAnimations.glb` (15 MB, 262 clips, one shared rig) from
a localhost:8000 server, with GitHub copies as a fallback. Now one file ships:

```sh
cd games/summer-champs/tools && npm install      # once
node build-anims.mjs <path>/UAL1_AllAnimations.glb <path>/UAL2_AllAnimations.glb
```

It scans `js/*.js` for every quoted string that names a clip (also with or without `_Loop`, like the runtime alias),
adds `tools/anim-keep.json` `extra` names if that file exists (and removes its `drop` names), copies the UAL2 clips
onto UAL1's bones by name (a name in both libraries keeps UAL1's copy, as the old loader did), drops the rest and the
Root motion tracks, then prunes, resamples, quantizes and meshopt-compresses. The result is **720 KB with 24 clips**, from 15 MB.
**Re-run it whenever the code starts using a new base clip.** A clip that isn't in the GLB silently falls back to
Idle. The source GLBs are Dan's, at `~/.quickwork/.../artifacts/quaternius_gltf/` (CC0, Quaternius).

## Reference (from the Claude Design handoff)

### Characters

- **Players:** `PLAYERS = { caleb:'CALEB', ezra:'EZRA' }` (`sc-ui.js`). Picked on the home screen (top-right cards).
- **Kits (colour only):** `KITS` in `sc-world.js` — BLUE `#3F72B5`, ORANGE `#E8744F`, GREEN `#4CAF6A`, TEAL `#2BB3A8`, PURPLE `#8B6CD9`, PINK `#F27BA8`. Defaults: Caleb teal, Ezra orange. Kit tints the model's saturated materials; rest navy.
- **Rivals:** `RIVALS` KAI (skill 0.8), MIA (0.6), ASH (0.45) wear the 3 other kits.
- **Home scene:** active player stands front (Caleb → `Celebration`, Ezra → `Dance`); inactive crouches behind (`Crouch_Idle`). Switch: `Crouch_Exit → Walk_Fwd → Celebration/Dance`; other: `Walk_Bwd → Crouch_Enter → Crouch_Idle`. Loops finish before transitions (≤1.2 s wait). Ezra sits to Caleb's right.

---

### Screens and flow (`js/sc-ui.js`)

Home → Championship (straight to Schedule) / Practice (Pick an event) / Records / Settings / Change athlete.
Every menu screen has **MENU** bottom-left (72, bottom 36) → home. `← GAMES` is always top-left. Pause is top-right in events.

- **Schedule:** 10 events, results + medals, UP NEXT, MEDAL TABLE (after event 1), START EVENT.
- **Intro (per event):** how-to rows, player's best, I'M READY.
- **Results:** ranks, NEW PB, points (championship: 10/8/6/5), MENU · TRY AGAIN/SCHEDULE · MEDAL TABLE, next-event button.
- **Medal table → Podium** after event 10 (winner BackFlip).
- **Settings:** Sound, **Performance mode** (reload; no shadows/AA, DPR ≤1.5, low-power GPU), reset records per player (tap twice).

Keyboard: `←` = L pad, `→` = R pad, `Space` = action (keydown). Fencing: parry **W/S/X**, attack **U/J/M**. Keys are never shown on screen.

---

### Events: mechanics, tuning, animations

All tuning lives in `TUNE_DEFAULT` (`sc-events-a.js`), edit the defaults in code (the lil-gui debug panel was removed on 2026-09-29).

| # | Event | Controls | Key tuning (defaults) | Scoring / rivals | Clips used |
|---|---|---|---|---|---|
| 1 | **100m sprint** | L R tap | `top 11.39`, waggle `gain .11 decay .18 decayPower .32` | 9 taps/s ≈ 10.00 s. Rivals: KAI 10.5–11.5, MIA 11.5–12.5, ASH 12.5–13.5 s | Blocks_Marks, Blocks_Set (left foot −0.5), Sprint_Enter, Sprint_Loop, Jog_Fwd_Loop, Idle_Loop, Celebration |
| 2 | **Long jump** | L R run → hold JUMP (time freezes, angle rises 0→90°) → release | `top 10.2, takeoffOffset .5, window 3.2, launch .924, angleRate 60` | Perfect (full speed, 45°, at board) 8.95 m. Foul if offset line passes board+0.11. Rivals 5.6–7.4 m | Idle_Loop, Sprint_Loop, NinjaJump_Start, NinjaJump_Idle_Loop, Land_Sand, Idle_No_Loop |
| 3 | **Triple jump** | L R run → tap HOP in window → tap at bottom of each arc (3 semicircle gauge) | `goldDeg 20, distGain 1.278, phaseTime .9, inputOffsetMs 20, edgeQ .85, missQ .55, offQ .65` | Perfect ≈ 18.41 m. Cue says PERFECT/GOOD/LATE/EARLY; degrees shown in arcs; white tick marks each tap. Rivals 12.0–16.1 m | TJ_Hop, TJ_Step (feet auto-angled from calf, slowed to phaseTime), NinjaJump_Idle_Loop, Land_Sand |
| 4 | **Javelin** | L R run → hold THROW before foul line → release for angle | `top 9.5, releaseOffset .5, angleRate 60, power 1.45` | Javelin spawns at exact hand position on release | Javelin_Start, Javelin_Run (Sprint + custom arms), OverhandThrow, Celebration, Idle_No_Loop |
| 5 | **Discus** | L R spin (anticlockwise dial) → hold THROW when arrow in gold → release for angle | `spinRate 1.3, power 17, angleRate 60, sector 90 (±45°), gold 30 (±15°), aimGain 1` | Offline angle = horizontal direction (clamped ±80°); distance best near centre line. Gauges dock down on release | Discus_Ready, Discus_Spin (Turn180_L_RM base + arms), Discus_Release |
| 6 | **High diving (100 m)** | DIVE → Tuck (abs, left) / Twist / Spin sliders (rate change, stay put) | `gravity .72, spinAccel 6, twistAccel 5, maxSpin 9, maxTwist 9, tuckInertia .35, twistTuck .25, maxSpins 5, maxTwists 5, slowmo .3, counterBoost 2` | 100 pts: spins 25 + twists 25 (5 each = full) + entry 50 (head-first 50 → flat 0 → feet-first 25, × straightness, × facing). Splash scales with entry quality; slow-mo in the gold zone; camera follows underwater, swim, surface, celebrate | HD_Stand, HD_Takeoff, HD_Tuck, HD_Entry_Head/Feet, HD_Splat, Swim_Crawl, Water_Celebrate, Water_HeadShake |
| 7 | **Archery** | Drag pad down to draw, release in gold | `wobble .6, drawPx 220, windMax 6, windEffect .07` | 6 arrows, real ring scores. Rivals integer totals, max 50 | Bow_Aim_Neutral, Bow_Shoot, Celebration |
| 8 | **50m swimming** | L R stroke, TURN in window | `top 3, turnWindow 1.5, wallOffset .5, depthOffset −.33, treadDepth −1.37, cpuPace 1` | Marks/Set/Go. Unfinished swimmers finish, then tread water; winner celebrates | Block_Crouch, Dive_Start, Swim_Crawl, Tumble_Turn, Tread_Water, Water_Celebrate |
| 9 | **Weightlifting** | Tap a weight card (60/70/80, then +10/+20/+30) → L R to lift above gold line → STEADY (10 taps) to keep balance | `effort .35, rate .35, liftTime 8, wobble 1, steadyPresses 10, outTime .5` | Best good lift; max 140 kg. Rivals 60–120 kg | Idle_FoldArms_Loop, Lift_Setup, Lift_Clean, Lift_Jerk, Lift_Hold, Lift_Drop, Celebration, BackFlip, Crying |
| 10 | **Fencing** | Parry High/Mid/Low when red target shows, then counter; attack otherwise | `reactMax .95, reactMin .45, lunge 1` | Ladder: start 4th, 3 bouts (win = move up). Bout 3 only scores with parry→counter. Counter window = parry time; counter directions narrow per bout (gold button bg). En garde / Prêts / Allez | Fence_Idle, Strike_/Parry_/Counter_/Hit_ High/Mid/Low, Fence_Victory, Fence_Defeat |

Grounding: `clipFloor()` in `sc-world.js` measures each grounded clip's lowest vertex once and shifts the model so feet touch the floor (swim/water/in-air clips excluded).

---

### HUD system (`js/sc-hud.js`, stage px)

- Top strip: `← GAMES` (28,28) · event bug (x 206) · score/attempt block (right edge x 1233) · pause (1245,28).
- Bottom-centre bar 460×58 at (436,604): SPEED / RHYTHM / POWER / BALANCE. ⇄ pad-swap left of it (364,613).
- Tap pads 170×170 at y 492 (L x 28, R x 1135). ⇄ moves L next to R (`localStorage['sc.padsRight']`).
- Action button 280×100 at (527,492); GOLD ZONE tag above it (y 418 with run-up bar, else 452); run-up bar 460×22 at y 462.
- Top-centre instruments at y 116 (angle 294w, discus pair 484w, triple arcs 516w, fencing scoreboard 468w at y 108). Angle/discus gauges dock down on release.
- Cue text: centred, as low as possible without overlap (334 / 400 / 506 / fencing 608).
- Full measurements: `HUD Audit.dc.html`. Open items there (archery bar 8 px high, ⇄ position in lifting, bug width).

---

### Animation editor

`tools/anim-editor.html` (open it directly): grouped by event, offset whole clip or edit keyframes per limb (`up/fwd/out` vectors, wrist roll), prop offsets (`_props`), notes, and **Copy report** → paste to Claude → merge into `sc-anim-patch.js`. "Apply live in game" stores `localStorage['sc.animPatch.live']`. Editor state: `sc.animEditor.v2`.

---

### Saved data

- **Player saves** are in IndexedDB through `js/arcade-store.js`: one item, `calebArcadeData:summer-champs` = `{ player, sound, kit:{caleb,ezra}, rec:{caleb,ezra}, perf, padsRight }`, where `rec.<who>` = `{ best:{eventId:value}, champs, golds }`. Wrapped by `js/sc-save.js` (`SAVE.get('rec.caleb')` dotted paths, the same names the design used).
- **Dev-only keys stay in localStorage** (written only by the anim editor on Dan's desktop): `sc.animPatch.live`, `sc.animEditor.v2`.

---

## Design decisions

- 2026-09-29: Dan designed Summer Champs in Claude Design ("pretty much working") and asked for it to be integrated
  properly, following the handoff's gaps: the theme music (plays all the time, quiet while an event needs input,
  back up when it finishes), the animations pulled in properly and combined, and a sound audit plus suggestions to read.
- 2026-09-29: integrated as a multi-file game (it's roughly 300 KB of modules). Arcade changes: the arcade-back snippet,
  favicon, no long-press, player saves moved from localStorage to arcade-store, the debug panel and lil-gui loaded only
  on localhost / `?debug`, the anim editor moved to `tools/`, CDN switched from unpkg to jsdelivr, and the two UAL
  libraries turned into one trimmed GLB.
- Music: the handoff asked for a music on/off setting and a podium fanfare. There's no music setting, because the arcade has
  no mute; the SOUND EFFECTS toggle stays and mutes SFX only. The fanfare is in the sound suggestions.
- Kept from the design: Barlow Condensed broadcast look, `← GAMES` top-left, MENU bottom-left, pause top-right.

- 2026-09-29: Dan asked to remove the lil-gui debug panel from the game (`js/sc-debug.js` deleted; lil-gui is out of
  the game's import map and saved `sc.tune` overrides are no longer read, so `TUNE_DEFAULT` is the only tuning).
  The anim editor page keeps its own lil-gui. The practice/event intro's MENU button now sits just left of
  I'M READY, because at bottom-left it overlapped the longer instructions (fencing, diving).
- 2026-09-29: the card title is italic like the real logo. `card.json` `title.style: "italic"` is new, arcade-wide:
  schema, `build-index.mjs` (font-style plus the `ital,wght` axis in the Google Fonts link) and the card spec.

- 2026-09-29: Dan reworked the discus layout in Claude Design: its own field (90° sector, 30° gold wedge, arcs every
  10 m from 20 to 80 m with signs, a stand parallel to the boundary 3× further back with its own crowd, the athlete in the
  ring). Most of it was already in the integrated copy; the new export added hiding the javelin runway `r` in discus.

## Memory

- 2026-09-29: the discus field was replaced by the javelin one because the venue set its default with
  `queueMicrotask(() => info.setThrowField('javelin', {}))`, which ran after the event had set discus. It's now
  called synchronously when the venue is built (`js/sc-world.js`, throw venue).
- 2026-09-29: the custom clips and the `sc-anim-patch.js` edits are still built in the browser at load (a fraction
  of a second). They could be baked into the GLB later (build them in a page, export them with three's GLTFExporter,
  then merge them in `build-anims.mjs`), but that would stop the editor's "use edits in game" live patching, so it
  waits until the animation tuning is finished.
