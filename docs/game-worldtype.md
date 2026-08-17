# Where in the World

(Folder and doc are named `worldtype`; the user-facing title is **Where in the World**.)

A "type the countries of the world" geography game. An accurate world map fills
the screen; the player types a country name into a text box and each correct
guess floods that country green. Forgiving fuzzy matching and a hint system keep
it approachable for ~7-year-olds. Fills a genuine gap — the arcade had trivia
(Treehouse) but no geography/map game.

## Features

- **Two players (Caleb & Ezra)** — the start screen has a Caleb / Ezra selector.
  Each player has their own independently-saved set of found countries, so the
  boys can keep separate progress on the same device and pick up where they left
  off. Selecting a player previews their saved progress ("Caleb: 42 / 176 found").
- **Bundled world map (offline)** — [topojson/world-atlas](https://github.com/topojson/world-atlas)
  `countries-50m.json` (public domain, Natural Earth derived), filtered to the UN
  set and embedded inline as **TopoJSON** in a `<script id="mapdata">` block.
  Decoded at load with inlined `topojson-client` (`topojson.feature/merge/mesh`)
  and drawn via inlined `d3-geo` (`geoNaturalEarth1` + `geoPath`). No network calls
  for core play. **195 countries** — the full UN set. world-atlas 50m omits Tuvalu,
  so it is re-added at build time as a small synthetic polygon near Funafuti (it
  renders as a microstate dot like Nauru/Vatican).
- **Gap-free rendering** — TopoJSON's *shared arcs* mean adjacent countries decode
  to identical border coordinates, so there are no sliver gaps between neighbours.
  Belt-and-suspenders draw order: (1) one dissolved `merge()` land base fill so any
  sub-pixel seam reveals land not ocean, (2) per-country fills only where the colour
  differs from the base, (3) the interior `mesh()` borders as one thin **black**
  stroke (the coastline keeps the lighter purple so land/ocean stays distinct).
- **Natural Earth projection** (`geoNaturalEarth1`) — a smooth, low-distortion
  world projection; the camera scales/translates it each frame for pan/zoom.
- **Pan & zoom camera** — touch pinch-to-zoom + one-finger drag-pan; desktop
  mouse-wheel zoom + click-drag pan. Zoom clamped 1×–14×, pan clamped so the map
  never drifts off screen.
- **Forgiving matching** — input is normalised (lowercase, accents/punctuation/
  spaces stripped), then matched against canonical names, a curated alias table
  (Russia→Russian Federation, USA/UK/DRC/UAE/Swaziland→eSwatini, Burma→Myanmar,
  Ivory Coast→Côte d'Ivoire, Holland→Netherlands, Macedonia→North Macedonia,
  etc.), and finally a bounded Levenshtein fuzzy match (tolerance scales with
  word length: 1 edit for short names, 2 for longer) so minor misspellings pass
  but wrong countries don't.
- **Animated colour reveal** — a correct guess floods the country from land colour
  to green over ~560ms (ease-out tween) with a brief expanding glow outline;
  microstate dots do a little size pop. Countries loaded from a save don't replay
  the tween.
- **Tap-to-hint** — tapping/clicking a country you don't have yet gives a hint for
  *that specific* country (pans to it, gold highlight, capital + fact) instead of a
  random one. It shares the 20s hint cooldown; if the timer is still running a small
  "Hint ready in Ns" toast shows instead. Tapping a found country flashes its name.
- **Correct-guess feedback** — country flashes then fills green (`#2ecc71`),
  counter ticks up, input clears, pleasant chime plays. Already-found guesses give
  a gentle notice; unrecognised input gives a soft buzz + toast.
- **Hint system (capital + fact)** — the Hint button picks a random unmarked
  country, pans/zooms to it and highlights it in gold for **5 seconds** while
  showing its **capital city** and a short kid-friendly **fact** — without naming
  the country, so it's a clue rather than the answer. Capitals/facts for every
  country are bundled inline (`INFO`, keyed by canonical name). 20-second cooldown
  with a live countdown on the button; one hint at a time.
- **Microstate dots** — countries that project to sub-pixel at a given zoom
  (Vatican, Monaco, San Marino, Nauru, Malta, Singapore…) are drawn as a small
  visible dot at their centroid, and the hit-test tries those dots first so they
  stay tappable even when enclosed by a larger host country.
- **Canvas HUD pill** (top-centre) — "Found N / total" + elapsed timer + progress
  bar. A single canvas-drawn **Reset** button sits in the top-right corner. There is
  no "give up / reveal" control — the game only ends on a full clear.
- **In-game reset with confirmation** — the Reset button opens a modal
  "Reset progress?" dialog (Yes, reset / Cancel). Confirming clears just the
  current player's found countries and starts a fresh run; best scores are kept.
- **Canvas win screen** — on a full clear, shows count + time, saves best to
  localStorage, confetti, Play Again button.
- **Web Audio SFX** (no files) — chime on correct, soft buzz on wrong, rising
  arpeggio on hint, victory arpeggio on complete.
- **Persistence (per-player)** — `calebArcadeData.worldtype.players.{caleb,ezra}`
  each store the `found` set **by country name** (not index) plus `bestFound` and
  `bestTime`. Saved on every correct guess and reloaded on Play. Name-based storage
  means a change to the map data / country order can never mis-map old saves; legacy
  index-based entries are ignored on load.

## File Structure

- `games/worldtype/index.html` — the entire self-contained game (inline CSS, JS,
  and the bundled map JSON in a `<script type="application/json">` block).

## Key Design Decisions

- **Map data bundled inline as TopoJSON, not fetched** — the ~194KB `mapdata`
  block is `JSON.parse`d then decoded with `topojson-client` at startup. Guarantees
  fully-offline play. TopoJSON is chosen over per-country GeoJSON specifically for
  its shared-arc topology (the gap fix), and it is far more compact.
- **world-atlas over hand-rolled Natural Earth extract** — the previous bundle
  stored each country as an independent, separately-rounded polygon; shared borders
  no longer coincided, leaving visible ocean slivers between neighbours. world-atlas
  encodes borders as shared arcs, so the gaps are impossible at the data level.
- **Microstates as dots, not fought with resolution** — any world-scale projection
  renders Vatican/Monaco/etc. sub-pixel regardless of source detail, so instead of
  bloating the data they are rendered as centroid dots with a dot-first hit-test.
- **`geoNaturalEarth1` projection** — a smooth compromise world projection; avoids
  Mercator's extreme high-latitude distortion that would confuse young players.
- **Matching order: exact → alias → fuzzy** — exact/alias hits win immediately
  (and auto-submit while typing once ≥3 chars match); fuzzy is a last resort with
  length-scaled Levenshtein tolerance and an early-exit bound, chosen to accept
  kid-level typos ("Germny", "Austrailia") while rejecting genuine wrong answers
  and letter-transpositions of the wrong country.
- **HTML `<input>` for typing, everything else canvas** — the mobile keyboard
  needs a real input element; it's styled to the dark theme and floated over the
  canvas. HUD, map, hint state and summary are all canvas-drawn per convention.
- **DPR-aware canvas** — capped at 2× device-pixel-ratio for crisp borders
  without over-rendering on high-density tablets.
- **Bounding-box culling + affine geo-cache** — per-country projected bbox/centroid
  are measured once at unit scale, then mapped to the live camera with a couple of
  multiplies (d3 applies scale/translate as a pure affine post-transform), so the
  194-country redraw and off-screen culling stay smooth while dragging.

## Memory

- **Gap fix — switched to topojson/world-atlas (2026-08-17).** The reported "too many
  gaps" were a data-topology bug, not a projection bug: the old bundle stored each
  country as an independent polygon rounded to ~2 decimals, so shared borders didn't
  coincide, and the render filled/stroked each country over the ocean gradient with
  no land base, revealing ocean in every seam. Fixed by bundling world-atlas
  `countries-50m.json` as TopoJSON (shared arcs → identical shared borders) and
  rendering land-base fill → per-country fills → interior `mesh()` borders. Country
  count is now **194** (world-atlas 50m has no Tuvalu). Data prepped in
  `research/` (`worldtype-topo.json`, built from `world-atlas-countries-50m.json`
  via prune-unused-arcs → presimplify → simplify(0.25) → quantize(1e4); names
  remapped to the game's canonical set so `INFO`/`ALIASES` still resolve).
  **Tuvalu** (absent from world-atlas 50m) is re-injected as a small synthetic
  polygon arc near Funafuti so the count is the full 195.
- **Persistence changed index→name** as part of the data swap, so the reordered
  country set can't corrupt existing saves; legacy numeric entries are skipped.
- **Reveal tween + tap-to-hint (2026-08-17).** Added an ease-out land→green colour
  flood with a fading glow ring on each correct guess (`revealAt[]` timestamps,
  `lerpColor`), and made tapping an unfound country fire a targeted `giveHint(idx)`
  (refactored out of `useHint`) gated by the shared hint cooldown. Tap detection is
  a single-pointer, no-drag `pointerup` that ignores HUD-button taps (those return
  early in `pointerdown` before `dragStart` is set).

- **Rendering rewritten to d3-geo (Natural Earth projection).** The original
  hand-rolled equirectangular Canvas projection left borders that didn't join
  cleanly. Replaced with inlined `d3-geo` (v3.1.1) + `d3-array` (v3.2.4) using
  `geoNaturalEarth1` + `geoPath` drawing to the Canvas 2D context, with
  `geoContains` for accurate country hit-testing. Both libraries are bundled as
  plain inline `<script>` tags (browser-global UMD branch: d3-array attaches to
  `window.d3`, d3-geo picks it up as its dependency automatically) — no CDN, no
  build step, fully offline. Camera zoom/pan is applied by re-scaling/translating
  the projection each frame.
- **Country set fixed to the UN-standard 195** (193 members + Vatican + Palestine).
  Upgraded 176→200 (Natural Earth 50m to include microstates), then removed the 5
  non-UN entries (Taiwan, Kosovo, Western Sahara, Northern Cyprus, Somaliland).
  Watch out: NE 50m tags Cuba & Kazakhstan as "Sovereignty", Israel & Kosovo as
  "Disputed", Palestine & Western Sahara as "Indeterminate" — the real countries
  among those must be force-included by name or they silently drop.
- **Hint now persists** until the next correct guess (was a 5s timer); 20s cooldown
  before a new hint. Hint shows capital + fact without naming the country.
- **Hover / press-hold reveals the name of a FOUND country only** (not unfound).
- Uncompleted countries get a muted land fill (`#3a3f7a`); found = green `#27ae60`.

