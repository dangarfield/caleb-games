# Moonbots

Drag-and-drop production game for Caleb and Ezra. Scrap bots (and later aliens) work in buildings. You build blueprints from what they make, and each level adds one part to the centre build.

## Chapters (10 levels each, one new mechanic per level)
1. **To the Moon**: build the rocket, then launch and land on the Moon. Mechanics: slots, two-input converters, upgrades, bot factory, silver/gold makers, molten cooling, day/night + lamps, belts (belt-only), batteries/chargers, meteors.
2. **Moon City**: build a city on the Moon; at the end aliens arrive and beam everyone to Planet Zib. Mechanics: supply crates, full stacks + silo, plant/grow/tap-harvest, power switches, Moonie orders → coins, overheating + ice, park neighbour ×2, moonquake spills (tap bubbles), tourist helpers, signal sequences.
3. **Home Again**: build a teleporter on Planet Zib and party at home. Mechanics: round doors for aliens, TEAM doors (bot + alien), coloured doors, alien snacks/hunger, wobbly doors that swap shape, egg nest temperature, copy machine (×2), alien trader, paint mixing, teleporter charge meter.
4. **Robo Carnival**: build a fairground for the town; ends with fireworks over the big wheel. Mechanics: ticket queue → coins, full-seat rides, random prize claw, rain clouds (tap away; Big Top shelters neighbours), Lucky Wheel spin bonus, bumper cars eject bots, drum rhythm taps, tall doors for silver+ bots, crowd mood meter (×1.5 / ×0.5), firework launch rack.
5. **Star Race**: build a racing rocket and beat the rival to Saturn. Every level has a rival race bar (finish first for a ★ on the map, no fail). Mechanics: race bar, fuel booster ×2, wear + tap-to-fix, gremlin thieves (tap to shoo, get items back), comet catching, balanced cargo see-saw, slingshot timing meter, solar wind side bonus, hold-to-charge turbo, timed checkpoints.

Each chapter unlocks when the previous one is complete. Blueprints only appear once everything they cost and use can be made.

## Files
- `index.html`: shell, screens, UI CSS
- `js/game.js`: level data + engine
- `js/art.js`: all placeholder art (icons, workers, doors, patterns, centre builds, finales), the only file to touch for the sprite sheet
- `js/sfx.js`: Web Audio sound effects (no files)
- `js/arcade-store.js`: IndexedDB saves
- `sprite-lab.html` / `sound-lab.html`: asset and sound browsers
- `music/`: Opus/WebM encodes of the supplied chapter tracks (originals in `research/music/`, encoded at full level, no 6dB cut, at Dan's request)
- Source of truth for design changes is the Claude Design project (`research/Moonbots/`); local fixes made here (vendored interact.js, `moonbots` save key, order/chirp sounds, sound-lab beeps, debug unlock) need re-applying after each new export.

## Notes
- Save: `calebArcadeData:moonbots`. Chapter 1 progress is stored under keys `"0"`–`"9"` (original format); chapters 2–5 use `"2-0"`…`"5-9"`. Star Race wins are stored in `profiles.<player>.stars`.
- Speed: base ×2 (`BASE_SPEED`); P in a level toggles ×100 for debugging.
- Debug unlock: P on the home or map screen opens every chapter and level for this session (a yellow badge says ALL UNLOCKED / UNLOCK OFF). Nothing is saved, so the boys' progress isn't touched.
- Map: locked chapter tabs show `? ? ?` until unlocked.
- Homepage: chapter-1 rocket progress, carnival skyline, a racer streaking across, Saturn, and bots/aliens that grow with chapters completed.
- interact.js 1.10.27 is vendored at `js/interact.min.js` (no CDN).
- Music: `music/chapter-1…5.webm` loop per chapter (home = chapter 1, map = chapter tab, level = its chapter), `chapter-end.webm` plays on chapter finales. 1.6s cross-fades through the Music gain bus; a missing chapter-4/5 track falls back to chapter 1/2.
