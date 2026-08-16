# Game: Jigsaw (Bonza-style tessellated jigsaw — Netflix "Jigsaw")

Run plan for `/new-game`. Durable state — update at every step.

## Concept (GIVEN — scout skipped)
Netflix Tudum "Jigsaw" (internal id `bonzaJigsaw`). NOT a classic jigsaw: the
image is cut on a **tessellated lattice** (classic square / slash triangles /
diamond / skew_left / skew_right). Pieces are polyominoes of lattice cells,
handed to the player in **portions** (waves of 3–9 pieces; next wave arrives when
the current one is placed). Drag pieces onto the board; they snap to cluster
origins; correct placement melds the piece. Audience: Caleb (7) + Ezra.

Full format + geometry + snapping spec: `games/jigsaw/research/jigsaw-all-puzzles.md`
(read it fully — it has cell polygons, adjacency rules, snapping algorithm).

## Key decisions (from user)
- **Images: fetch from the Netflix CDN at runtime.** Confirmed reachable
  (HTTP 200, 1024×1024). `Content-Type: application/octet-stream`, so fetch as a
  **blob** and decode via `createImageBitmap`/object URL, not a bare `<img src>`.
  This is a deliberate exception to the "no network for core play" rule (user
  chose it over bundling ~118MB). Handle offline/404 gracefully (message, skip).
- **Levels: the 312 DAILY puzzles, in DATE ORDER.** (User overrode an earlier
  "full variety curation".) `levels.json` already generated: 312 levels sorted
  2025-11-23 → 2026-09-30, each with date, title, tessellation, grid, portions.
  Piece counts 13–61, all 5 tessellations appear (classic 102, diamond 88,
  slash 63, skew_left 28, skew_right 31).

## Level data (`games/jigsaw/levels.json`, already built — 549KB)
Each record: `{id (1..312), srcId, date, title, author, tessellation,
cellsPerCluster, size, gridRows, gridCols, pieceCount, imageUrl, portions,
portionsPieceCount, motherPieceId, grid}`. `grid` is gridRows×gridCols of piece
ids (row=y down, col=x right). Source of truth: `jigsaw-all-puzzles.json` (470
puzzles, move to gitignored research/ — see below).

## Geometry essentials (see md for full detail)
- TILE_SIZE = 40 (× uiScale). Cluster width = TILE_SIZE, except **diamond** =
  TILE_SIZE×2. Cluster height = TILE_SIZE. Board = (gridCols/cellsPerCluster)×
  clusterWidth by gridRows×clusterHeight.
- cellsPerCluster: classic 1, slash 2, diamond/skew 4. Odd-row half-cluster
  brickwork stagger for the triangle family.
- Cell→image mapping: piece cells' bbox normalizes as x=col/gridCols,
  y=row/gridRows on the 1024² image.
- Cell polygons + adjacency + render-group rules all transcribed in the md.
- Snapping: point→nearest cluster origin (row=round(y/H), col=round(x/W)*cpc),
  spiral out for a legal (in-board, unoccupied) placement, pick nearest; false
  fit = shake (2 cycles 200ms); correct = meld (no longer draggable).

## CORE MECHANIC — CORRECTED (user, round 2). This is REAL Bonza: relative assembly.
The first build got this wrong (tray + fixed board + ghost image). Replace that
model entirely with the following:
- **No tray, no fixed board, no ghost picture.** There is a pannable, slightly
  zoomable "table" (an unbounded space larger than the image — you can move the
  whole puzzle around). The background shows ONLY the decorative lattice backdrop,
  **NOT the original image**.
- **Pieces are scattered on the table, a set distance apart** (non-overlapping) —
  not in a separate tray/space. When a wave spawns, the **view tweens (pan+zoom)
  to hold all current pieces in view**.
- **Zoom in/out a little** (pinch on touch, wheel/buttons on desktop) — limited
  range. **Pan** by dragging empty background.
- **Drag a piece (or a connected group); it snaps to the shared lattice grid.** A
  piece may be dropped anywhere it does NOT overlap another piece/group.
- **Connection is RELATIVE, piece-to-piece — not to an absolute board slot.** Each
  piece knows its true grid position (from `grid`); the true relative offset
  between two pieces defines whether they connect. When a dropped piece lands
  grid-adjacent to another piece in the CORRECT relative position (they are real
  neighbours, correctly aligned), they **snap together / meld into one group** that
  thereafter moves as a unit.
- **Wrong-adjacency feedback:** when a piece is placed edge-adjacent to a piece it
  is NOT truly adjacent to (wrong neighbour, or right neighbour misaligned), draw a
  **red line along the shared edge** + a **subtle shake on the dragged piece**. The
  piece is NOT locked — the player can move it away. Only correct adjacency melds.
- **Win = all pieces connected into a single assembled group** (the full picture
  emerges from the pieces themselves as they join; there is no ghost/peek). Each
  piece always renders its own correct slice of the image, wherever it sits.
- **Waves/portions:** deal portion 1 scattered; when the current dealt pieces are
  all connected into the assembly, deal the next portion (again scatter + view
  tween to fit). Shuffle within a portion.
- Image rendering stays as the working build had it: clip to the piece polygon and
  draw the full image translated to the piece's true anchor (geometrically exact),
  so each piece shows the right content at any table position.

## Conventions (hard constraints — re-state at every hand-off)
- [x] Single self-contained `games/jigsaw/index.html`, Canvas 2D
- [x] Back button href EXACTLY `../../index.html`
- [x] `touch-action:none`, viewport `user-scalable=no`, large tap targets (touch-first drag)
- [x] Dark theme base `#0a0a2e`; accent `#6c5ce7`; gold `#ffd32a`
- [x] `calebArcadeData` localStorage, data under `data.jigsaw`
- [x] Web Audio SFX. EXCEPTION: image fetch from CDN is allowed (user decision)

## Checklist
- [x] 1. Frame — concept given (Bonza tessellated jigsaw), audience captured
- [x] 2. Scout — SKIPPED (concept given)
- [x] 3. Spec → this plan
- [x] 3b. Curate levels.json — 312 dailies in date order (user instruction)
- [x] 3c. Move jigsaw-all-puzzles.json + .md into games/jigsaw/research/ (gitignored) before ship
- [x] 4. Build — `games/jigsaw/index.html` (~1470 script lines) + card in root index.html
- [x] 4-rework. Core mechanic rebuilt as real relative-assembly Bonza (see
      "CORE MECHANIC — CORRECTED" above). Tray, fixed board and ghost image are
      gone; `index.html` is ~1890 lines. New model:
      - **Legal translations.** The lattice tiles the infinite plane. A translation
        that preserves every cell's `idx` (so the shape survives) is *legal*:
        classic any (dr,dc); slash dc even; triangle dc ≡ 2·dr (mod 4). Its pixel
        shift is exactly `(dc·pitch, dr·clusterH)`, `pitch = clusterW/cellsPerCluster`.
        These form a subgroup, so composing them stays legal.
      - **A group IS one legal translation.** `{ dr, dc, pieces[], cells[], polys[],
        edges[], ax, ay }`. Plane cell = `(r+dr, c+dc)`; `occ: Map "R:C" -> group`.
        Overlap test = set test. Correct relative position ⟺ **equal (dr,dc)**.
        `ax/ay` is the transient off-lattice drag/settle offset only.
      - **Drop.** `findPlacement` walks legal candidates in rings around the drop
        anchor, nearest-first, skips any that fail the occupancy test, and prefers a
        candidate that actually joins if one is within a kid-friendly assist radius
        (`max(TILE·0.8, 26/zoom)`). No legal spot ⇒ tween back.
      - **Join.** `settleJoins` welds every touching pair with equal (dr,dc) into one
        group (repeatedly, so chains collapse in one drop); the biggest group keeps
        its identity and bitmap. Melded groups still drag as one unit.
      - **Wrong adjacency.** `recomputeBadEdges` finds cells whose plane neighbour
        belongs to a group with a *different* offset and draws the exact shared edge
        (`sharedSeg`, integral vertices) in red + shakes the dropped group. Never
        locks: the piece stays draggable.
      - **Table.** `cam {x,y,s}` with `sMin = 0.34·sFit`, `sMax = 1.9·sFit`; pinch,
        wheel, ±/fit buttons, pan by dragging the backdrop, pan clamped to content
        ±42% viewport. Waves tween (pan+zoom, easeInOut) to frame the table, floored
        at `0.72·sFit` so pieces stay readable; the tween's `must`-see box is the
        **union of the standing assembly and the fresh wave**, so at the floor it
        centres on both instead of chasing the new pieces. Win re-fits to the whole
        finished picture.
      - **Repaint.** The loop is idle-stopping (`busy()`), so every non-animated
        state change kicks it via a `dirty` flag (`needFrame()`): pointer/wheel
        handlers, camera clamps and tween starts. The ± buttons and `+`/`-` keys
        glide over 200 ms anchored on the view centre; wheel and pinch stay instant
        so they track the input.
      - **Scatter.** Wave 1 around the picture centre; later waves in a *band hugging
        one edge* of the assembly (portrait: above/below, landscape: left/right — a
        ring would double the framed extent, and a blob a radius out makes the player
        pan), offset `0.6·TILE`, spread along that edge by `max(edge, 1.5·√area)`
        clamped to the viewport room at the zoom floor. Golden-angle spiral per piece,
        `SCATTER_GAP = 0.3·TILE`.
      - **Rendering.** Group baked to an offscreen bitmap per zoom level, stretched
        mid-pinch; the whole group is clipped as ONE path so joined pieces have **no
        seam** (shared cell edges cancel inside one clip region) — only the outer
        silhouette is stroked. Procedural deterministic backdrop, no ghost picture.
- [ ] 5. Review — game-reviewer; loop fixes until pass
- [ ] 6. back-button-check green
- [ ] 7. game-docs-sync → docs/game-jigsaw.md + games-index.md + count; STOP-ship

## Acceptance criteria
- [x] Plays with no JS console errors (image failure handled gracefully)
- [x] Loads a daily puzzle; image fetched from CDN and rendered (`<img>` first —
      browsers sniff the bytes despite `application/octet-stream`; blob +
      `createImageBitmap` as fallback; friendly retry card if both fail)
- [x] Pannable/zoomable table with the procedural lattice backdrop only — the
      source picture is NEVER drawn as a background ghost (only inside pieces, plus
      the small hero thumbnail on the win screen)
- [x] Pieces scatter on the table, non-overlapping, and the view tweens to frame them
- [x] Drag a piece or a joined group; it snaps to the shared lattice; a drop that
      would overlap is rejected
- [x] Relative piece-to-piece joining; joined pieces move as one unit and show no seam
- [x] Wrong adjacency ⇒ red line on the shared edge + shake, no meld, still draggable
- [x] Next portion arrives when everything dealt is one group; win when all one group
- [x] All 5 tessellations solve end to end into a single group (headless harness)
- [x] Level select (date-ordered, 11 month sections) + Caleb/Ezra profiles + per-level completion saved
- [x] Completion celebration
- [x] Card in root index.html (`href="games/jigsaw/"`, `.card-jigsaw`, 🧩)
- [ ] docs/game-jigsaw.md; games-index.md count bumped — step 7, orchestrator/docs-sync

## Build verification (headless puppeteer, request-interception — no server process)
Re-run after the 4-rework. Real `PointerEvent`s at the canvas; the CDN is served a
synthetic 1024² PNG by the interceptor.
- Loads at both `/games/jigsaw/` and `/games/jigsaw` → 312 levels, 0 console errors
  (the only 404 in the log is the harness's own `favicon.ico`).
- **Geometry, in-page, all 312 levels:** 83,183 cells tile the board exactly with
  integral in-bounds vertices; 244,730 neighbour pairs symmetric and sharing exactly
  one edge; every piece edge-connected; `legalDelta` matches idx-preservation
  exactly; legal-delta pixel shifts exact. 0 failures.
- **Per tessellation** (classic 0, diamond 4, slash 12, skew_left 17, skew_right 22),
  tablet 820×1180: wave-1 scatter non-overlapping, on-screen, 0 red edges; a real
  drag of one true neighbour onto another melds them (group count −1, merged size
  correct) and the merged group then drags as one unit; a real drag to an
  adjacent-but-wrong offset ≥1.6× the assist radius away gives red edges + shake,
  no meld, and the piece is still movable; then solved end to end → 1 group, `won`.
- **Framing:** wave-by-wave walk gives 41–82 px per cluster on a 820×1180 tablet
  (32–46 landscape 900×430), never below the `0.72·sFit` floor, 0 overlaps; win
  re-fits the whole picture. Each spawn tween frames the union of the assembly and
  the new wave: measured every wave on tablet/landscape/phone, the assembly is in
  view (whole, except one heavy mid-solve frame where it is partly in view at the
  zoom floor) and every new-wave piece is in view, with the nearest fresh piece
  0.5–1.0 cluster widths from the assembly and none far-and-off-screen.
- **No seam:** the biggest group is baked and every internal seam pixel-compared
  against a plain draw of the source image — 61-piece assembly, 229 internal seams,
  687 samples: worst channel difference **0** (control samples 0 too).
- **Pan/zoom:** ± buttons, wheel, pinch out/in, fit button, and pan by dragging the
  backdrop all verified; dragging the table never moves a piece.
- **Immediate repaint:** the loop is idle-stopping, so a screenshot pair taken with
  nothing moving is byte-identical. From that idle state a single tap on `+`, `−` or
  `⤢` — with no other interaction — changes the pixels within 70 ms, finishes its
  200 ms glide, and leaves no tween pending.
- Heaviest level (61 pieces, slash, waves 5/9/10/10/9/9/9) solved on 820×1180; a
  61-piece level solved on a 390×760 phone with a mid-solve rotation to 760×390 →
  assembly intact, nothing stranded.
- CDN blocked → `imgError` card, and its Levels button returns to the picker.
- `calebArcadeData.jigsaw.<player>.solved` written; back button href is exactly
  `../../index.html` (106×40 tap target).
