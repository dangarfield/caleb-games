# Moonbots

Drag-and-drop production game for Caleb and Ezra. Scrap bots (and later aliens) work in buildings. You build blueprints from what they make, and each level adds one part to the centre build.

## Chapters (10 levels each, one new mechanic per level)
1. **To the Moon**: build the rocket, then launch and land on the Moon. Mechanics: slots, two-input converters, upgrades, bot factory, silver/gold makers, molten cooling, day/night + lamps, belts (belt-only), batteries/chargers, meteors.
2. **Moon City**: build a city on the Moon; at the end aliens arrive and beam everyone to Planet Zib. Mechanics: supply crates, full stacks + silo, plant/grow/tap-harvest, power switches, Moonie orders → coins, overheating + ice, park neighbour ×2, moonquake spills (tap bubbles), tourist helpers, signal sequences.
3. **Home Again**: build a teleporter on Planet Zib and party at home. Mechanics: round doors for aliens, TEAM doors (bot + alien), coloured doors, alien snacks/hunger, wobbly doors that swap shape, egg nest temperature, copy machine (×2), alien trader, paint mixing, teleporter charge meter.

Each chapter unlocks when the previous one is complete. Blueprints only appear once everything they cost and use can be made.

## Files
- `index.html`: shell, screens, UI CSS
- `js/game.js`: level data + engine
- `js/art.js`: all placeholder art (icons, workers, doors, patterns, centre builds, finales), the only file to touch for the sprite sheet
- `js/sfx.js`: Web Audio sound effects (no files)
- `js/arcade-store.js`: IndexedDB saves
- `sprite-lab.html` / `sound-lab.html`: asset and sound browsers

## Notes
- Save: `calebArcadeData:moonbots`. Chapter 1 progress is stored under keys `"0"`–`"9"` (original format); chapters 2–3 use `"2-0"`…`"3-9"`.
- Debug: P toggles ×100 production.
- interact.js 1.10.27 is vendored at `js/interact.min.js` (no CDN).
- Music: `music/chapter-1|2|3.webm` loop per chapter (home = chapter 1, map = chapter tab, level = its chapter), `chapter-end.webm` plays on chapter finales. 1.6s cross-fades through the Music gain bus; a missing track falls back to chapter 1.
