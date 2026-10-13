# Skyborn

A dragon-flying adventure across Emberreach, for Caleb and Ezra (7+). Three.js world, HTML/CSS UI, touch-first, 1333×690 landscape.

## Play
- **Left stick:** bank and climb. **Flap** (hold): climb, uses stamina (the ring). **Dive** (hold): tuck and speed up. **Breath:** auto-aims at the nearest enemy in front. **Swipe right side:** barrel roll (dodge; a just-in-time roll gives a free hit).
- **Keyboard (desktop testing):** R D F G or the arrow keys steer (like WASD), K flap (hold), I dive (hold), J breath, O roll, U soar, P performance monitor.
- **Soar** appears high up: fast cruise that clears the Atlas in big sweeps, and drops out when enemies appear.
- **Land** near towers, roosts, vistas, the Aerie and towns. Perched: Take off, Breath lights tower braziers, roosts unlock fast travel and dragon swap, vistas clear the map, towns offer favours.
- **Wind streams** (golden dotted lines on the Atlas) carry you fast.

## Intro
A **New flight** opens with the story: a dialog over the world at the Aerie, one narrated line per page (`intro-1`…`intro-5`). Each page auto-advances when its line ends; **Next** jumps ahead, **Skip** ends it, the last page's **Fly!** starts play. Continue skips the intro. No images, just the dialog.

## Loop
Light the 3 Dragon Towers in a region → the champion appears at the Egg Nest → win → carry the egg to the Aerie (no breath, raiders chase) → hatch → new dragon opens the next region.
- Start with Breeze. Hearthvale champion → egg hatches Ember (heat-proof) → Cinder Peaks
- Cinder → Storm → Stormcrown · Stormcrown → Frost → Frostfang · Frostfang → Tide → Sunken Reach · Reach → Gold → Sky Isles → Pirate King's Sky Fortress (ending)

## Each region
6–8 sub-areas, 1 city + towns and hamlets, 3 towers, 1 champion, 3 raider camps (3 waves, then rebuild after 10 min), 2 Ring Runs (gold/silver/bronze, brother's best shown), 5 roosts, 5 vistas, 8 statues, 12 chests, 4 villager favours.

## Files
- `index.html`, `css/skyborn.css`, `js/game.js` (main), `js/combat.js`, `js/screens.js`, `js/ui.js` (audio, saves)
- World: `js/skyborn-worldgen.js` (heightmap, regions, every place), `skyborn-scene.js` (renderer, streamed terrain, flight), `skyborn-props.js`, `skyborn-hearthvale.js` (set dressing), `skyborn-atlas.js` (parchment map painter)
- Models: `skyborn-models.js` (Ember + rider, Griffin Knight), `skyborn-bestiary.js` (dragons, enemies, champions)
- Saves: IndexedDB via `js/arcade-store.js`, key `calebArcadeData:skyborn`, one object holding both boys plus settings.
- Favour portraits: add `img/<favour id>.png` and list it in `PORTRAITS` at the top of `js/game.js`; a placeholder shows until then.

## Sunken Reach seabed
- With Tide, hold Dive over the sea to swim. Once you're under, you stay under until you climb out.
- On the seabed: 9 of the 12 chests, 6 of the 8 dragon statues, the Sunken Spire Dragon Tower and the Lost Bell (Diver Mira's favour). They're spread across the whole sea using farthest-point sampling.
- Set dressing: coral, swaying kelp, rocks, fish schools, jellyfish, a few sunken houses (not a city) and wrecks.
- Underwater you get teal fog, a light-ray overlay, muffled sound (low-pass), a splash going in and out, and bubbles.

## Testing
- Press **=** on the title screen for a debug flight: every region and dragon, max upgrades, 99,999 gems, every roost lit and the whole map revealed. It never saves and never touches Caleb's or Ezra's saves.
- Once you've beaten a champion, flying near its nest (or the Sky Fortress) shows **REMATCH** for a re-fight. That's +150 gems, with no egg.

## Sound Lab
- `soundlab.html` lets you drop in your own audio. Music: an Explore and a Fight track for each region, with crossfades. The title plays Hearthvale’s Explore track; champion fights and Ring Runs use the region’s Fight track. SFX: 22 sounds in 5 tabs, each with several variants, its own level and a ± pitch spread.
- Stored in IndexedDB (`skyborn-sound`) on the device. Export/Import makes a one-file pack (JSON with base64 audio) for moving between devices.
- The game (`js/ui.js`) plays user sounds where they exist and falls back to the built-in synth everywhere else.

## Notes
- Theme music is generated with Web Audio (no file yet). Swap in an Uppbeat track later per knowledge/audio-patterns.md.
- three.js r184 loads from unpkg through a pinned import map.

## Shipped audio (project files)
- Built by `games/skyborn/research/process-audio.py` (rerun after adding files: `python3 games/skyborn/research/process-audio.py [music|sfx|voice]`).
- **Music** `music/<region>-<normal|battle>.webm` from Dan's Suno tracks in `research/music` — Opus 48k, **no −6dB** (Dan's call), silence trimmed, peaks ≤ −1 dBTP. Music slider defaults to **60**. Mapping in `PROJECT_MUSIC` (`js/ui.js`); All six regions have Explore and Fight tracks.
- **SFX** `sfx/*.webm` from `research/sounds` — mono 64k, levelled to −18 LUFS (wind-rush and underwater are seamless loops at −24). Mapping in `PROJECT_SFX`.
- **Voice** `voice/<id>.webm` from `research/voice/voiceover-wav` — mono Opus 40k, gently compressed and maximised to about −11 LUFS, peaks ≤ −1 dBTP. The Sound Lab has a Voice tab listing every line and take, with an overall Voice level (0–100%, saved in the sound config as `voice.level`) on top of the pause-menu Voice slider.
- Credits: `<original>.credit.txt` beside each original; the Uppbeat SFX licence codes are still to be supplied.
- A Sound Lab file always wins over the project file for the same slot.

## Atlas map pictures (pre-baked)
- The parchment map is shipped as images in `images/atlas/` (`world.webp` + one per region, 1333×690, about 1MB in all). Painting them live from the heightmap took seconds on the tablet and left the map stuck on "Unrolling the map…".
- They are fetched in the background 1.5 s after the game loads, so the map opens straight away. If an image fails to load, the game falls back to painting it.
- The 3D world stops drawing while the Atlas is open (`world.setPaused`), and starts again when it closes.
- **If the world changes** (heightmap, rivers, landmarks), re-bake: open `research/bake-atlas.html` on the dev server, press Bake, save the downloads over `images/atlas/`, and bump `?v=` in `loadBaked` (`js/screens.js`).
