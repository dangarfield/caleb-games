# The Wind & The Wall (`games/the-wind-and-the-wall/`)

A story-led 3D climb, narrated. The Wind has left the world and the birds have gone with it; on the hill above Lowmeadow the Earth Giant is walling in the trapped breaths of his old friend. Wren climbs toward him with the last breath of wind in a jar. The camera is behind her, she steers only left and right (a snap assist pulls her into openings), and every wall has an opening carved in a shape the Wind once carried: Wren has to become that shape to get through.

## Play
- **Players:** Caleb or Ezra, picked on the title screen. Each keeps their own climb (stages done, feathers, best Big Run distance).
- **Story:** an illustrated, narrated opening (7 scenes) that plays every time the Prologue is started, then 7 chapters / 29 stages (Prologue + 1-1 … 7-4), each with a narrated intro and outro, climb lines during the run, and an illustrated, narrated epilogue. Text lives in `story.js`.
- **The wheel:** hold to **Hush** (time slows to `HUSH_SLOW` 0.1 divided by how many things the next wall needs: 0.1, 0.05, 0.033…; generated stages also leave `GAP_PER_ACTION` 16 m more run-up per extra thing) and pick a pose, item or spell for the next wall. Wheel colours: Pose paper, Item honey ochre (`--honey` #EDC36A), Magic wind blue. Magic walls are marked in blue (blue wind lines, a blue carved eye, and the blue crack on Thunder walls). 15 poses, 15 items, 10 spells; stages unlock them as the trapped breaths are freed.
- **Tutorials:** step-by-step wheel tutorials (game pauses until each step is done) for the first pose (1-1 Duck), the first item (1-1 crook gate) and the first magic (1-4 Thunder on the leaning wall).
- **In use on the wheel:** poses Duck, Scarecrow, Star, Leaf, Heron, Reach, Moth, Kite; items Gate Key, Apple, Honeycomb, Paper Boat, Leaf Umbrella, Acorn, Mini, Sun Mirror; magic Thunder, Fire, Float, Aero, Rain, Bloom, Holy, Meteor (`ORDER`). Other entries in `NAMES`/`TOOLS`/`DIRS` are retired.
- **Feel:** items use the "Run And Throw Grenade" throw and the item's own honey icon spins through the air; spells use the casting animations, and Fire (flames), Aero (white rings), Bloom (leaves and petals), Holy (golden beam) each have their own trail and impact, alongside Thunder's lightning, Rain, Float and Meteor. Covers leave their own way: goats trot off, bees swarm up, the leaf curtain lifts, shutters fold, leaves burn, fog blows apart, roots and clay sink. Float and Bloom walls play the jump animation over the wall; Wren kneels in the paper boat. Poses are aim-solved from `DIRS` (Duck, Moth, Leaf, Kite reshaped Oct 2026; a pose-editor keyframe for a pose overrides its `DIRS`).
- **New magic on the wheel:** an unlock refreshes the wheel if it is open, and generated stages leave `UNLOCK_LEAD` 45 m between a breath being freed and the first wall that needs it.
- **Cairns:** a checkpoint halfway through each stage; tumbles send you back to the last one.
- **Feathers:** one hidden per stage, off the safe line. Each holds a bird's memory of the Wind, narrated on the outro and in the **Feather Secrets** book, with its picture where the art exists.
- **Dance:** Wren dances at the end of each stage (Mixamo dance clips, looping) with a narrated celebration line. It lasts until the player taps (taps in the first 0.8s are ignored); a "Tap to carry on" hint appears bottom right after 3s.
- **The Big Run:** endless mode, unlocked after the epilogue; best distance per player.
- **Pause:** Music and Sounds sliders (both default 80%, saved), Resume, Walls guide, back to the last cairn, leave to Levels. Dan asked for these in game, an exception to the arcade's no-audio-controls rule. Sounds covers the narration and any sound effects added later.

## Tech
- `index.html` (three.js 0.160 from jsDelivr via an import map; all HUD/menus are HTML), `story.js` (all story text and art briefs), `js/arcade-store.js`.
- **Wren:** `models/wren.glb` (~2.3 MB): the Mixamo character plus all 36 animation clips the game uses, meshopt-compressed with a 1024px WebP colour texture (the original FBX was 20 MB with a 4096px texture, ~89 MB of GPU memory). Loaded with GLTFLoader + MeshoptDecoder; clips go to WrenAnim as `opts.clips`. Falls back to the research FBX files on the local dev server, and to the stand-in capsule rig if neither loads. Rebuild steps: `research/glb-tools/README.md`.
- **Art:** all 97 story pictures in `art/<name>.webp` (450×600 WebP, ~50 KB each, from Dan; the zip is in `research/images/`). Names follow `story.js` (`opening-N`, `epilogue-N`, `prologue-intro`, `1-1-intro`, `1-1-outro`, `1-1-feather`…). Missing art falls back to the painted placeholder.
- **Music:** one track per chapter, `music/music-ch1-the-low-meadows.webm` … `music-ch7-the-crown.webm`: Opus/WebM 48k, 6dB down, leading/trailing silence trimmed so they loop cleanly. Starts on the first activation-granting gesture, follows `applyChapter()` (in play and when browsing chapters on the Levels page) with a 2.5s cross-fade (`MUSIC_FADE`) between two `<audio>` players, paused when the tab is hidden. Volume = `MUSIC_LEVEL` 1.0 × Music slider, dipped 50% (`MUSIC_DUCK` 0.5) while the narrator speaks.
- **Narration:** 195 clips in `voiceover/` (Opus/WebM 32k mono, levelled to −16 LUFS), generated locally with Breeze-TTS-2 (MLX) from `research/voice/audio-script.md` with `research/voice/breeze-tts-mlx/voiceovers.py`. Clip names: `opening-0N`, `epilogue-0N`, `ch<N>-<code>-intro|outro|climb-N|breath|dance|feather`, `ch0-prologue-…`, `dance-0N`, `dance-breath`. In-run lines are matched to clips by their text. Volume = `NARRATION_LEVEL` 0.5 × Sounds slider (0.4 at the defaults); the mix constants sit at the top of the music & narration block.
- **Sound effects:** 10 Uppbeat sounds in `sfx/` (Opus/WebM mono 64k, silence trimmed, levelled ~−19 to −22 LUFS, UI click −26; `wall-bump` cut to its first 2.2 s). Decoded once into Web Audio buffers on the first gesture and played through a gain on the Sounds level (per-sound `SFX_LEVELS` × Sounds slider, tuned in the Sound Lab: ui-click 0.4, jump 0.4, land 0.7, spell 0.6, throw 0.75, unlock 0.6, wall-squeeze 0.5, wall-bump 0.5, cairn-and-complete 0.4, feather 0.5). Hooks: `ui-click` any button/list item, `jump` jump start, `land` jump landing, `spell` / `throw` when a magic / item leaves Wren's hand, `wall-squeeze` through a pose-shaped hole, `wall-bump` on a tumble, `unlock` when a breath is freed (new magic), `cairn-and-complete` at a cairn and on finishing a stage, `feather` when a feather is caught. Originals and `.credit.txt` files in `research/sounds/`.
- **Credits:** no in-game credits screen for now (Dan will design one later); the credits are listed below.
- **Saves:** `calebArcadeData:the-wind-and-the-wall` holds `{ player, music, sounds }`; each boy's climb is `:caleb` / `:ezra`. Saves made in the Claude Design build (localStorage) are picked up on first load.
- **Dev tools (local only):** `animation-studio.html` (its **Walls** tab loads `index.html?wallpreview`: the game runs one wall on a loop and Wren solves it automatically — pick any in-use pose, item, magic, layered or plain gap, a chapter, slow motion, pause/replay; nothing is saved and music is muted), `pose-editor.html` (read the full Mixamo library from `research/animations/`, so they only work on the local dev server) `dialog.html` (every line of story with its picture) and `sound-lab.html` (plays music, two random narration lines and every SFX with the game's mix maths; sliders for the player Music/Sounds levels, `MUSIC_LEVEL`, `NARRATION_LEVEL`, `MUSIC_DUCK`, `MUSIC_FADE` and each `SFX_LEVELS` entry, read from `index.html` on load; "Copy values" gives a block to paste back).

## Credits
Sound effects from Uppbeat (uppbeat.io); originals and credit notes in `research/sounds/`. Uppbeat licence codes / plan still to be added to each `.credit.txt` (Dan).

| Shipped | Uppbeat title | Artist |
|---|---|---|
| `sfx/ui-click.webm` | UI - soft button press | Brukowskij |
| `sfx/jump.webm` | Ninja swish jump | Epic Stock Media |
| `sfx/land.webm` | Footsteps landing on sand after jump (Sneakers) | GFX Sounds |
| `sfx/spell.webm` | Magic spell - light whoosh | Epic Stock Media |
| `sfx/throw.webm` | Knife spinning into wood with quiver | SmartSound FX |
| `sfx/unlock.webm` | Wooden lock mechanism locking | GFX Sounds |
| `sfx/wall-squeeze.webm` | Swish transition | Jam FX |
| `sfx/wall-bump.webm` | Car crash into wall (Light) | SmartSound FX |
| `sfx/cairn-and-complete.webm` | Whoosh & bell ding | OM FX |
| `sfx/feather.webm` | Snowy owl call | SmartSound FX |

## Performance (low-end tablets)
- **Drawing resolution:** the 3D view is drawn at `RES_NORMAL` 1.25× of the 1333×690 layout (never more than the screen shows). **Performance mode** (pause menu switch, saved as `perf` in the store) drops it to `RES_PERF` 0.75×. Left untouched, it measures the first ~6 s of a climb and switches itself on below `AUTO_PERF_FPS` 40 ("Switched on to keep things smooth"); once the player flips the switch their choice sticks.
- **Sky in the scene:** the chapter sky gradient is the scene background and the canvas is opaque (no transparent canvas composited over a CSS sky).
- **Walls built ahead:** the next `PREBUILD_AHEAD` 4 walls are built while the stage intro card is up, then topped up one at a time on quiet frames; spawning takes a ready wall instead of painting canvases mid-run.
- **Instanced scenery:** parallax hills, sheep, trees, stones, tufts and motes are InstancedMeshes driven by proxy Object3Ds (`syncScenery()`); the celebration confetti is one InstancedMesh. ~140 draw calls per frame → ~22.
- **Pooled sprites:** puffs and sparks reuse sprites/materials (`getSprite` / `freeSprite`); the rig no longer allocates per frame.
- Menus, story cards and the Hush wheel still draw the live 3D scene behind them at full rate, by design.
- First load went from ~25 MB to ~7 MB (including the first music track).

## Source
- Designed and built in Claude Design ("Hill Climbing Adventure Game"): design doc, screenshots and the original output are in `research/Hill Climbing Adventure Game/`.

## Memory
- 2026-10-05: installed from the Claude Design output. Models moved out of `research/` (gitignored, so they would not have shipped), art/music/narration wired in, saves moved to arcade-store, three.js switched from unpkg to jsDelivr, arcade back snippet and long-press guards added.
- 2026-10-05: opening now plays every time the Prologue starts; narration at 50%; separate Music and Sounds sliders (80% default) replace the single volume slider.
- 2026-10-05: music at 100% × Music slider (MUSIC_LEVEL 1.0), at Dan's request.
- 2026-10-05: removed the music dip under narration, at Dan's request.
- 2026-10-05: music dips 20% under narration (MUSIC_DUCK 0.8).
- 2026-10-05: music dip under narration changed to 40% (MUSIC_DUCK 0.6).
- 2026-10-05: celebration no longer auto-skips; tap to carry on, with a hint after 3s.
- 2026-10-05: 1-4 gets the full wheel tutorial for its first Thunder (magic) wall; magic wall markings (wind lines, eye, crack) are now blue.
- 2026-10-05: chapter music cross-fades (2.5s) instead of cutting, including on the Levels page; items recoloured honey ochre on the wheel, badges and chips.
- 2026-10-05: added Dan's 9 Uppbeat sound effects (sfx/, Web Audio, Sounds slider) and a Credits screen on the title.
- 2026-10-05: full set of 97 story images (WebP) wired in; story.js paths switched from .jpg to .webp.
- 2026-10-05: per-sound SFX levels (`SFX_LEVELS`), all 0.5 × Sounds slider.
- 2026-10-05: feather pickup sound (Uppbeat "Snowy owl call"), level 0.5.
- 2026-10-05: added sound-lab.html for tuning the mix.
- 2026-10-05: mix from Dan's Sound Lab pass: MUSIC_LEVEL 1.0, NARRATION_LEVEL 0.5, MUSIC_DUCK 0.5, MUSIC_FADE 2.5, per-sound SFX levels (tested at Music 80% / Sounds 80%).
- 2026-10-05: Hush slow-down scales with the number of things the next wall needs; more run-up before multi-thing walls in generated stages.
- 2026-10-05: performance pass: Performance mode + resolution cap, in-scene sky, wall pre-build, instanced scenery and confetti, pooled sprites, Wren + clips as a 2.3 MB GLB (FBX copies removed from models/).
- 2026-10-05: new cairn icon (stroked, matching the wheel icons) for the cairn toast and the progress-bar marker.
- 2026-10-05: audit fixes: reshaped Duck/Moth/Leaf/Kite (and the retired Curl/Bridge/Otter), jump over Float/Bloom walls, kneel in the boat, thrown item icons + throw animation, per-cover exits, unique Fire/Aero/Bloom/Holy effects, wheel refresh + 45 m lead after unlocks; in-game Credits screen removed.
- 2026-10-05: wall preview mode (`?wallpreview`) + Walls tab in the animation studio.
- 2026-10-05: wall preview shows what each wall is (WALL_NOTES); Kite keeps feet on the floor; Float/Bloom scrub the jump clip by distance over the wall (WrenAnim scrub/scrubOff) so Wren lands back into running on time; Bloom grows a tree and Wren jumps, swings from its branch and drops through (still the Scree Wall: scree picture + seedling kept); Holy is a black mist with turning smoke and red embers (Shadow Window); Meteor is an iron-plated, riveted wall (Iron Wall); thrown items are a plain warm glow (no icon) and the red pick badge is gone.
- 2026-10-05: Dan's moth pose from the pose editor baked into BAKED_POSES (a newer local pose-editor keyframe still overrides).
- 2026-10-05: redrew the Honeycomb (bee) wheel icon — wings now clearly on top, head + antenna on the right.
- 2026-10-05: story headers drop page numbers ("Epilogue 3") for pips — one per page in the flow, filled for the current page: opening + Prologue card (8), a stage's end + the next stage's start (2, across chapters too), last stage + epilogue (5). A stage opened on its own from Levels shows none.
- 2026-10-05: Big Run music shuffles all 7 chapter tracks at the start and plays them through, cross-fading as each nears its end (fresh shuffle after the 7th). Feather Secrets picture no longer zooms; thin moss-coloured scrollbars on scrolling panels.
- 2026-10-05: Levels screen: a chapter's stage cards share the full width equally (flex, not a fixed 5-column grid).
