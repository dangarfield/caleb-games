# Run Plan — World Type (worldtype)

Durable state for this `new-game` run. Read + update at every step.

## Goal (attention anchor — re-state at every hand-off)
Build ONE new arcade game: **World Type** — type the countries of the world onto an
accurate bundled world map; correct guesses flood the country green. Touch pinch-zoom +
drag-pan. Fuzzy spelling + aliases. Hint = 1 random unmarked country, 60s cooldown.

Hard constraints (the rubric): single self-contained `games/worldtype/index.html`,
Canvas 2D, dark-theme palette, `touch-action:none`, back button href EXACTLY
`../../index.html`, canvas HUD pill + canvas summary, `calebArcadeData` localStorage,
NO network calls for core play (GeoJSON bundled inline), age-appropriate for ~7+.

## Concept decisions (locked)
- Map data: **bundle world GeoJSON inline** (offline, accurate) — user-confirmed.
- Scope: all sovereign countries (~176 from the dataset); hint system keeps it approachable.
- Build from scratch (no portable licensed source).

## Spec
Full spec: `.apm/specs/game-worldtype.spec.md`

## Checklist
- [x] 1. Frame — concept given by user (overrode scout shortlist)
- [x] 2. Scout — done; user then supplied own concept, so shortlist superseded
- [x] 3. Spec — written to `.apm/specs/game-worldtype.spec.md`; run plan created
- [ ] 3b. STOP — spec approval (optional; skipped per user's execute-directly preference)
- [x] 3c. Map data prepped — see "Map data" section below
- [x] 4. Build — game-builder produced games/worldtype/index.html + wired card into
        index.html, games-index.md row + count bump (63 games/64 dirs), game-worldtype.md
- [x] 4b. User change requests folded in: Caleb/Ezra players, per-player persistence
        of the found-set, capital+fact hint (5s highlight), in-game Reset w/ confirm
- [x] 5. Review — inline QA (structural: balanced delims, all identifiers resolved,
        INFO JSON parses; wiring intact; features verified). Builder also ran a full
        runtime simulation with zero errors on its base build.
- [x] 6. Deterministic gate — back-button-check GREEN across all 62 games (replicated
        the hook's exact logic in Python; worldtype href = ../../index.html confirmed)
- [x] 7. Sync docs — game-worldtype.md updated for the new features; index row + count set
- [ ] 7b. STOP — human ships (commit flagged AI-assisted)

## Map data (prepped for builder)
- Source: Natural Earth 110m admin-0 countries (PUBLIC DOMAIN).
- Simplified to `games/worldtype/research/worldtype-map.json`: 176 countries,
  ~137KB, 8821 points. Schema:
  `{countries:[{name,iso2,iso3,continent,polys:[[[lon,lat],...]]}]}`.
  lon/lat in degrees; equirectangular projection verified accurate
  (`research/worldtype-preview.png`). Antarctica excluded.
- Builder: bundle this JSON inline (offline). Canonical names use NAME_LONG, so add
  an ALIAS table for kid-friendly typing: Russia->Russian Federation, USA/US->United
  States, UK->United Kingdom, Congo->Republic/DR Congo, Swaziland->eSwatini,
  UAE->United Arab Emirates, Czechia->Czech Republic, Burma->Myanmar, etc.

## REVIEW/FIX RUN (2026-08-17) — remove map gaps via topojson/world-atlas
User feedback: "too many gaps" between countries. Root cause (code review): the
bundled `worldtype-map50.json` stores each country as an INDEPENDENT polygon rounded
to ~2 decimals; shared borders don't coincide → sliver gaps showing ocean. The
render loop fills+strokes each country over the ocean gradient with NO land base,
so every gap reveals ocean. d3-geo swap changed projection but not data topology.

Fix (user-requested source): switch to **topojson/world-atlas** — shared-arc
topology means adjacent countries decode to IDENTICAL border coords → gap-free.
Prepped in `games/worldtype/research/`:
- `worldtype-topo.json` (193.7KB): world-atlas countries-50m, filtered to the UN set,
  names remapped to the game's canonical names, pruned unused arcs, presimplified +
  simplified (quantile 0.25) + re-quantized (1e4). 194 countries, 0 dup names,
  `merge()`/`mesh()` validated. Only **Tuvalu** absent (not in world-atlas 50m) → 194.
- `topojson-client.min.js` (7KB): inline at runtime to decode (offline, no CDN).
Rendering technique (belt-and-suspenders no-gap): (1) fill `merge()` LAND base as one
path in land color; (2) fill found/hint/revealed countries on top; (3) stroke
`mesh()` interior borders once. Microstates (Vatican/Monaco/Nauru/…) collapse to
sub-pixel at world scale → render a min-size dot at centroid + centroid hit-test
fallback. Persistence switched index→name (data reorder no longer corrupts saves).
Projection kept: geoNaturalEarth1 (the good, gap-free choice; gaps were never the
projection). Build delegated to game-builder; QA-reviewer agent skipped per user.

STATUS: DONE. index.html now bundles the TopoJSON + inlined topojson-client; draw()
does land-base → per-country fills (microstate dots) → mesh borders; countryAt has a
dot-first + nearest-centroid hit fallback; persistence is name-based. Verified: all
inline scripts parse (vm.Script), 1 mapdata block parses as Topology w/ 194 geoms,
back button = ../../index.html, no `.polys` remnants. Visual proof rendered in
`research/world.png` + `research/europe.png` — continuous land, crisp shared borders,
zero ocean slivers, microstate dots visible. Docs (game-worldtype.md, games-index.md)
updated to 194 + new architecture. Not committed (human ships).

## Notes / risks
- Fuzzy matching must not be so loose that wrong answers pass. Levenshtein scaled to
  word length + curated alias table.
- Projection + pan/zoom math is the main build risk — mitigated: equirectangular
  projection already verified against the prepped data.
- Inline JSON (~137KB) keeps the file self-contained and offline.
