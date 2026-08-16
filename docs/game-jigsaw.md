# Jigsaw

A Bonza-style tessellated jigsaw, adapted from Netflix Tudum's "Jigsaw"
(internal id `bonzaJigsaw`). NOT a classic jigsaw: the source image is cut on a
tessellated lattice (squares, triangles, diamonds or skewed parallelograms), and
pieces are polyominoes of those lattice cells. It is a **relative-assembly**
puzzle — there is no fixed board and no picture to peek at. Pieces are scattered
on a pannable, zoomable table; you fit them to **each other**, and the picture
emerges from the assembled pieces themselves.

## Features
- **Relative assembly** — each piece knows its true grid position; two pieces
  connect only when placed grid-adjacent in the correct relative alignment. On a
  correct fit they meld into one group that thereafter moves as a single unit.
- **Pannable / zoomable table** — an unbounded space; pan by dragging the
  backdrop, zoom with pinch (touch), wheel, or ⤢/−/+ buttons (limited range).
  The background shows only a decorative lattice; the original image is never
  drawn on it.
- **Wave dealing (portions)** — pieces arrive in waves; the next wave is dealt
  once the current pieces are all connected. On each wave the view tweens
  (pan+zoom) to frame the union of the existing assembly and the new pieces.
- **Wrong-adjacency feedback** — placing a piece edge-adjacent to a piece it
  isn't truly adjacent to draws a pulsing red line along the shared edge and
  shakes the dropped group; it is not locked, so the player can move it away.
- **5 tessellations** — classic (square), slash (half-square triangles),
  diamond, skew_left, skew_right (quarter triangles). Each has its own cell
  polygons, adjacency rule and odd-row brickwork stagger.
- **312 daily puzzles in date order** (2025-11-23 → 2026-09-30), level select
  chunked into month sections with completion ticks.
- **Player select (Caleb / Ezra)** with separate progress under
  `calebArcadeData.jigsaw.<player>.solved` (keyed by level id).
- Kid-friendly snap assist radius, staggered spawn-in, join SFX, confetti win
  screen, canvas-drawn HUD pill and controls.

## File structure
- `index.html` — the whole game (Canvas 2D, single file, no build step). Lattice
  geometry, piece polygons, group model, snapping, pan/zoom + view tweens, wave
  dealing, wrong-edge detection, level select, SFX, win screen.
- `levels.json` — 312 daily puzzles (~549 KB): `{id, srcId, date, title, author,
  tessellation, cellsPerCluster, size, gridRows, gridCols, pieceCount, imageUrl,
  portions, portionsPieceCount, motherPieceId, grid}`. `grid` is
  gridRows×gridCols of piece ids (row = y down, col = x right). Fetched with a
  candidate-path list so it loads under any URL form.
- `research/` (gitignored) — reference material: `jigsaw-all-puzzles.json` (470
  puzzles, ~1.9 MB source) and `jigsaw-all-puzzles.md` (format + full board
  geometry / cell polygons / adjacency / snapping spec). Not used at runtime.

## Key design decisions
- **Images fetched from the Netflix CDN at runtime** — a deliberate, user-approved
  exception to the "no network for core play" rule (bundling all images would be
  ~118 MB). Loaded `<img>`-first (the CDN sends no CORS header, so
  `fetch`+`createImageBitmap` fails in-browser while `<img>` decodes fine; the
  canvas is tainted but the game only ever draws, never reads pixels). Blob is the
  fallback. A CDN failure shows a friendly "picture not available" card with a way
  back to level select — never a crash.
- **A group is one legal lattice translation.** The lattice tiles the infinite
  plane; a translation that preserves every cell's shape index is *legal*
  (classic any (dr,dc); slash dc even; triangle dc ≡ 2·dr mod 4). A group is
  fully described by one such (dr,dc) plus its member pieces. Two groups are in
  correct relative position **iff their (dr,dc) are equal** — that single equality
  is the whole "true neighbours, correctly aligned" test, and overlap testing is a
  pure occupancy-map set test (no polygon intersection).
- **No image cropping — clip-to-polygon and draw the full image at the piece's
  anchor.** The source md's crop rule is off by half a cell for non-cluster-aligned
  pieces; clipping a group as one path and drawing the whole image once is
  geometrically exact and leaves no seams between joined pieces.
- **Curated to the 312 dailies in date order** (user instruction), from the
  470-puzzle source; unscheduled puzzles and collections are excluded.

## Memory
- Built via the `new-game` recipe (concept given; scout skipped).
- Major rework mid-build: the first build implemented the WRONG mechanic — a tray
  of pieces dropped onto a fixed board that showed a ghost of the picture. Real
  Bonza is relative assembly (fit pieces to each other on a pannable table, no
  ghost). The entire model was rebuilt: pannable/zoomable table, scattered pieces,
  view-tween-to-fit on each wave, relative piece-to-piece snapping into moving
  groups, red-edge + shake on wrong adjacency, win when all one connected group.
- Data fact used to simplify the model: across all 312 levels the cumulative
  dealt set is connected (exactly 1 component) at every wave, so the solved state
  is always one growing assembly (no permanently-separate islands to join).
- Bug: **faint white seam between connected pieces.** Each piece was clipped
  separately (antialiasing every internal edge) and stroked with a light border.
  Fixed by clipping a group as a single path and drawing the image once, and
  removing the per-piece stroke — verified pixel-identical to the source image
  (worst channel diff 0 over a 61-piece assembly).
- Bug: **spawn too spread out → fit-tween zoomed out too far.** Tightened the
  scatter spacing, spawned later waves in a compact blob beside the assembly, and
  floored the fit zoom so pieces stay a comfortable size.
- Bug: **spawn view-tween didn't include the existing assembly**, so the assembled
  part fell off-screen on a new wave. Fixed to tween to the union bounding box of
  assembly + new wave (floor-clamped).
- Bug: **zoom −/+ buttons didn't repaint until the next pointer event.** The
  render loop only drew while a tween/drag was active; the button handler mutated
  the camera without kicking a frame. Fixed with a `dirty`/`needFrame()` flag
  (loop draws on `busy() || dirty`), and the buttons/keys now glide the zoom over
  ~200 ms; every pointer/wheel handler also calls `needFrame()`.
