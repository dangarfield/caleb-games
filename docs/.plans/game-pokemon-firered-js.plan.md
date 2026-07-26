# Run Plan: pokemon-firered-js (multi-run)

> Durable state for the `new-game` run. Read + update at every step.
> **This is a MULTI-RUN game.** Run 1 (DONE) = extraction pipeline + complete Kanto data.
> Run 2 (ACTIVE) = the playable engine, built on top of data/. See "RUN 2" section below.

## RUN 2 — Engine (ACTIVE)
Goal: a real, playable JS engine reading ONLY data/. Modular ES files under
games/pokemon-firered-js/ (multi-file justified for a game this size, like archers/worms).
Dev server: user runs it on :3000 (serves /games/pokemon-firered-js/... — DO NOT start/stop servers).
Test in-browser via chrome-devtools MCP against http://localhost:3000/games/pokemon-firered-js/index.html.

Data contracts (verified):
- Map: {layout:{width,height,primaryTileset,secondaryTileset}, grid[w*h] metatile ids,
  collision[w*h] (0/1), elevation[], warps[{x,y,destMap,destWarpId}], connections[{dir,map,offset}],
  objects[{gfx,x,y,movement,script,...}], music}. Secondary metatile ids start at 640.
- Tileset JSON: {numTilesInPrimary:640, numMetatilesInPrimary:640, numPalsInPrimary:7,
  atlas:{png,width,height,tileSize:8,tilesPerRow:16}, palettes[16][16]{r,g,b},
  metatiles[]{bottom[4],top[4]} each cell {tile,flipX,flipY,palette}, attributes[]{behavior,...}}.
  A metatile = 16x16 = 4 bottom (layer0) + 4 top (layer1, drawn over) 8x8 tiles.
  Atlas PNG: R=G=B=paletteIndex*17, alpha0=transparent. Recover idx=round(R/17),
  color = tileset.palettes[cell.palette][idx]. Primary tiles 0..639 from primary atlas,
  tiles 640+ from secondary atlas (secondary metatile cells reference secondary tiles by
  local index? VERIFY: cell.tile may be global or local — check during keystone).
- Player-facing tiles are 16px metatiles. Largest map 85x80 (1360x1280 px) -> render only viewport.

Engine milestones (build + TEST each):
- [x] M0 Keystone: boot, load PalletTown + tilesets, bake metatiles, render map. VERIFIED
      pixel-perfect via screenshot. Tileset baker/palette/atlas-split all correct.
      NOTE: dev server redirects /index.html -> no trailing slash, breaking relative module
      src. Works with trailing slash + on GH Pages (index.html link). Player sprite=red_normal
      (9 frames 16x32: down/up/left stills + walk; right=flipX of left).
- [x] M1 Overworld: player (red_normal), grid movement + walk anim, collision (map+npc),
      camera follow, warps (onWarp->dest warp id), connections (walk between maps), NPC render
      w/ y-sort, sign interaction hook. VERIFIED in browser: walk/collision/camera all correct.
      Files: input.js, overworld-sprite.js, world.js, map.js, tileset.js, data.js, main.js.
- [x] M2 Encounters + Battle engine: VERIFIED in browser. Gen-3 damage formula (STAB, crit,
      type mult incl x4 dual, burn, random), status (SLP/PSN/PAR/BRN/FRZ), PP, priority/speed
      order, catching (real catch formula, tested 100% at 1hp+sleep), run odds, foe AI, XP+levelup.
      Battle scene UI: battlers/HP boxes/XP bar/menu/fight/bag/party/messages. Fixed double-XP bug
      (endOfTurn after over). Files: pokemon.js, battle.js, battle-scene.js, ui.js, pokemon-sprite.js,
      encounters.js, save.js.
- [x] M3 Party/Bag/Menus: start menu (Pokedex/Pokemon/Bag/Save/Close), party summary w/ HP,
      bag, in-battle switch/bag/potion/ball. VERIFIED party screen in browser. menu.js.
- [x] M4 NPCs/dialogue: interact w/ NPCs + signs, typewriter dialogue boxes w/ paging.
      VERIFIED in browser. Dialogue is ORIGINAL placeholder text (decomp strings are
      copyrighted + not extracted; scripts referenced by name only). dialogue.js.
      Trainer battles: engine supports isTrainer/foeParty; overworld trainer-sight trigger
      is a follow-up (needs script interpreter). Noted as remaining.
- [x] M5 Save/load (calebArcadeData.pokemonFireredJs) w/ party/bag/dex/pos, autosave, start
      overlay, back button ../../index.html. save.js. VERIFIED fresh starter + party persist.
- [x] M6 Wire into arcade: card in root index.html (links to index.html; <base> fix in the
      page handles the dev-server no-trailing-slash redirect + preload-scanner 404). VERIFIED
      boots clean from index.html, 0 console errors. FULL LOOP VERIFIED: Pallet Town -> walk
      north connection -> Route 1 -> grass -> wild Pidgey battle, all unscripted.
- [x] back-button-check: href="../../index.html" exact. Clean console.
- [x] docs sync: game-pokemon-firered-js.md updated to "playable", games-index.md row +
      count bumped (55->56 games, 56->57 dirs), root index.html card added.
- [x] Final UI playtest: MENU->BAG->throw ball->CAUGHT, party+dex+ball count all update. Clean console.
- STOP: human ships.
Note: "complete" per user = keep going until playable + tested. Given scale, target a solid
vertical slice (Pallet->Pewter/Brock) that exercises every system, with all Kanto data loadable.

---

## (RUN 1 — pipeline, COMPLETE below)

## Frame (locked with human)
- **Goal:** From-scratch JS reimplementation of Pokémon FireRed, built ON TOP of
  data files generated from the `pret/pokefirered` decompilation. Engine is finite
  + data-driven; "completeness" is a data-extraction problem, not an engine problem.
- **This run's milestone (human choice):** "Pipeline first, engine second."
  Deliver the extraction pipeline + complete Kanto data files (maps, pokemon, moves,
  scripts, tiles, sprites as JSON/PNG). **Nothing playable at end of this run.**
- **Art/licensing:** Extract assets from the decomp the USER cloned (same posture as
  the locally-hosted ROM in the existing emulator game). Assets are Nintendo/Game Freak
  copyright — fine for private family arcade; do NOT hand-reproduce art/text from memory.
  Build TOOLING that extracts; the tooling reads the cloned repo.
- **Distinct from existing game:** `games/pokemon-firered/` is an EmulatorJS ROM wrapper.
  This is a NEW folder `games/pokemon-firered-js/` — a real engine. Leave the old one alone.

## Directory layout
```
games/pokemon-firered-js/
  research/pokefirered/   <- cloned decomp (gitignored via root `research` rule)
  tools/                  <- extractor scripts (Node)
  data/                   <- generated engine-ready data (JSON + PNG) — COMMITTED
  index.html              <- the engine (LATER run, not now)
```

## Decomp data sources (VERIFIED after clone — 72M, 426 maps, Node v22 available)
- Maps: `data/maps/<Name>/map.json` (Porymap: connections, object_events, warps, bg_events)
  - Layout dims/tilesets: `data/layouts/layouts.json` (width,height,border,primary/secondary tileset,blockdata_filepath)
  - Blockdata: `data/layouts/<Name>/map.bin` (u16 LE per block; low 10 bits = metatile id, bits 10-11 collision, bits 12-15 elevation). border.bin similar.
- Tilesets: `data/tilesets/{primary,secondary}/<name>/` → `tiles.png` (4bpp indexed), `metatiles.bin`
  (each metatile = 8 tiles × u16: tileId low10 + flip bits 10-11 + palette bits 12-15), `metatile_attributes.bin`, `palettes/00.pal`..
- Species/base stats: `src/data/pokemon/species_info.h` (C designated-init `[SPECIES_X] = { .baseHP = .. }`)
- Moves: `src/data/battle_moves.h` (`[MOVE_X] = { .power=.. .type=.. }`)
- Learnsets: `src/data/pokemon/level_up_learnsets.h` (`LEVEL_UP_MOVE(lvl, MOVE_X)`), pointers in `level_up_learnset_pointers.h`
- Evolutions: `src/data/pokemon/evolution.h`
- Type chart: `gTypeEffectiveness[336]` in `src/battle_main.c` line ~312 (triplets attacker,defender,x-multiplier; TYPE_ENDTABLE/FORESIGHT sentinels)
- Items: `src/data/items.json` (ALREADY JSON — resolve constants, decode \n)
- Wild encounters: `src/data/wild_encounters.json` (ALREADY JSON — has encounter_rates + per-map mon lists)
- Trainers: `src/data/trainers.h` + `src/data/trainer_parties.h`
- Text decode: `charmap.txt` (byte→char map); per-map `data/maps/<Name>/text.inc`, scripts `scripts.inc`; global `data/event_scripts.s`
- Pokemon sprites: `graphics/pokemon/<name>/{front,back}.png` (4bpp indexed) + `normal.pal`, `icon.png`
- Overworld sprites: `graphics/object_events/pics/people/*.png`
- Constants (needed to resolve enum names→indices): `include/constants/*.h` (species, moves, items, abilities, maps)

## Checklist (this run)
- [x] Frame locked (scope + art + repo location) — human answered
- [x] Structure created; root `.gitignore` already covers `research`
- [~] Clone pret/pokefirered into research/ (background, ID brvd3hy7m)
- [ ] Verify decomp paths; write research/EXTRACTION-NOTES.md mapping source->output
- [ ] Fill game.spec.md-style spec into this plan (pipeline milestone)
- [ ] STOP: approve spec (optional)
- [x] Delegate to builders (used general-purpose; game-builder agent type misconfigured): write extractors + generate data
      - [x] pokemon base stats + species list (species.json, 412 incl NONE)
      - [x] moves + learnsets + type chart (moves.json 355, learnsets.json 411, type-chart.json 110 matchups)
      - [x] items (items.json, 375 rows / 308 unique)
      - [x] wild encounters (encounters.json, 124 maps, FireRed variant)
      - [x] trainers + parties (trainers.json, 743 trainers, 742 parties)
      - [x] maps (grid, collision, warps, objects, connections) — 425 maps, 0 skipped (Builder B)
      - [x] tilesets -> spritesheets + palettes — 68 tilesets JSON+PNG atlas (Builder B)
      - [x] pokemon + overworld sprites -> PNG/sheets — 389 species/1241 imgs, 96 OW sheets (Builder B)
      - [~] scripts/text -> charmap decoder done; full event-script->JSON VM deferred to later run (documented)
      - [x] data manifest.json + maps/index.json + tools/README documenting the format
- [x] Review: cross-ref integrity — 0 unresolved refs (learnsets->moves 4040, encounters->species 2080,
      trainers->species/moves 1754, map->tileset, warps 1294, connections 120). All 504 JSON parse. Grids non-empty.
- [x] Full pipeline re-runnable via `node tools/extract-all.js` (graphics+manifest wired in); byte-identical determinism verified.
- [x] Deterministic gate: back-button-check N/A (no engine yet) — noted in docs
- [x] Docs: docs/game-pokemon-firered-js.md created; intentionally NOT in root arcade index (nothing playable yet)
- [ ] STOP: human ships (commit flagged AI-assisted)

## Hard constraints (re-state at every hand-off)
- Data files are the product this run. Engine reads ONLY generated data later.
- No hand-authored copyrighted assets — extract from cloned decomp only.
- Extractors must be re-runnable + deterministic; document source->output mapping.
- Keep it inside games/pokemon-firered-js/. New folder, don't touch pokemon-firered/.
- Vanilla, no build step for the eventual engine. Extractors are Node dev-tools (ok).

## SPEC — Pipeline milestone (this run)

### Concept
A re-runnable Node extraction pipeline (`tools/`) that reads the cloned `pret/pokefirered`
decomp and emits clean, engine-ready data (`data/`): the complete Kanto dataset the
future JS engine will consume. The engine reads ONLY `data/`; completeness = data coverage.

### Deliverables (data/ — committed)
1. `data/species.json` — all species: base stats, types, catchRate, expYield, growthRate,
   gender ratio, abilities, evYield, evolutions, dex number. Constants resolved to strings.
2. `data/moves.json` — all moves: power, type, accuracy, pp, effect, priority, target, flags.
3. `data/learnsets.json` — species → [{level, move}].
4. `data/type-chart.json` — attacker×defender → multiplier (0/0.5/1/2), from gTypeEffectiveness.
5. `data/items.json` — cleaned from decomp items.json (name, price, pocket, description, effect).
6. `data/encounters.json` — per-map wild encounter tables (land/water/rock/fishing + rates).
7. `data/trainers.json` — trainers + parties (class, name, party mons w/ level/moves/items).
8. `data/maps/<Name>.json` — per map: dims, tile-grid (metatile ids), collision, elevation,
   warps, connections, object_events (npc gfx/pos/movement/script ref), bg_events, encounter ref.
9. `data/maps/index.json` — map manifest + connection graph.
10. `data/tilesets/<name>.json` + `.png` — packed tile atlas + metatile definitions + palettes.
11. `data/sprites/pokemon/<dex>.png` (+ index) — front/back/icon composited w/ palette.
12. `data/sprites/overworld/<name>.png` (+ index) — object-event sprites.
13. `data/text/<Map>.json` + scripts as event-command JSON (best-effort; document coverage).
14. `data/manifest.json` — top-level index of everything + generation metadata.
15. `tools/README.md` — how to re-run; source→output mapping for each extractor.

### Extractors (tools/ — Node, re-runnable, deterministic)
- `parse-c.js` shared helper: resolve `#define`/enum constants from include/constants/*.h.
- `extract-species.js`, `extract-moves.js`, `extract-learnsets.js`, `extract-typechart.js`,
  `extract-items.js`, `extract-encounters.js`, `extract-trainers.js`, `extract-maps.js`,
  `extract-tilesets.js` (PNG decode via pure-JS, no native deps), `extract-sprites.js`,
  `extract-text.js`, `build-manifest.js`, and `extract-all.js` runner.
- Prefer zero npm deps; if PNG encode/decode needs a lib, use a single vendored pure-JS one
  under tools/vendor/ and document it. No native modules.

### Acceptance (data completeness + format sanity — NOT playability)
- [ ] extract-all.js runs clean start-to-finish on the cloned decomp (document any skipped map).
- [ ] species/moves/items/type-chart counts match decomp (e.g. 411 species slots, ~354 moves).
- [x] All maps emit a JSON with a non-empty tile grid + resolved warps/connections.
      (Decomp has 425 maps, not 426 — map_groups.json confirms; 425/425 emitted, 0 skipped.)
- [x] Tileset PNGs + metatile JSON produced for every referenced tileset (68/68).
- [ ] No constant left unresolved as a raw `SPECIES_`/`MOVE_`/`ITEM_` string where an index is expected
      (string names are fine as labels; just no broken/missing lookups).
- [ ] manifest.json + tools/README.md document the full source→output mapping.
- [ ] NO engine/index.html this run. NO copyrighted asset hand-authored — all extracted.

### Out of scope this run (LATER runs)
- The engine (index.html), rendering, battle loop, save system, arcade wiring, back button.
- Audio extraction (music/SFX) — note as future.

## Notes / decisions log
- 2026-07-24: Human chose "Pipeline first, engine second" + clone into research/. Original
  pixel-art-vs-rip question folded into: extract real assets from the cloned decomp.
- Decomp verified: 72M, 426 maps, layouts.json + map.bin blockdata, standard pret C-macro
  formats, items.json/wild_encounters.json already JSON, type chart in battle_main.c.
- 2026-07-24 (Builder B): binary/graphics/maps extraction done. Pure-JS PNG decode+encode
  (tools/lib/png.js, built-in zlib only, zero npm). Outputs: 68 tilesets (JSON+index-encoded
  RGBA atlas PNG), 425 maps (JSON grid/collision/elevation/warps/connections/objects) +
  maps/index.json connection graph, 389 pokemon (1241 front/back/icon RGBA PNGs incl. form
  subdirs) + 96 overworld sheets. Tile atlases store 4-bit palette INDEX per pixel (R=G=B=idx*17,
  alpha 0 = transparent) because GBA tiles are palette-agnostic — engine recolors via metatile
  palette. Decomp map count is 425 not 426 (plan estimate). tiles.png shipped decoded (no LZ77).
  Runner: tools/extract-graphics.js (extract-all should also call it). Deterministic (byte-stable
  re-runs verified). Nothing could NOT be decoded.
- (append as we go)
