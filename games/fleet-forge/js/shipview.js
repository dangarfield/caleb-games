/* shipview.js — drawing a ship's grid with its fitted modules.
 *
 * Shared by the hangar, ship select, the fitting screen and the opponent editor,
 * so a hull looks the same everywhere and there is one place to fix it.
 */
var ShipView = (function () {

  /* Largest cell size that fits the hull in `box`, capped so a 4x10 corvette
     does not render as a wall of huge squares next to a 12x12 battleship. */
  function cellSize(grid, box, max) {
    return Math.min(box.w / grid.w, box.h / grid.h, max || 999);
  }

  function layout(ship, box, maxCell) {
    var g = Geom.shipGrid(ship), cs = cellSize(g, box, maxCell);
    return {
      ship: ship, grid: g, cs: cs,
      x: box.x + (box.w - g.w * cs) / 2,
      y: box.y + (box.h - g.h * cs) / 2,
      /* pointer -> cell, or null outside the hull */
      cellAt: function (px, py) {
        var c = Math.floor((px - this.x) / cs), r = Math.floor((py - this.y) / cs);
        if (c < 0 || r < 0 || c >= g.w || r >= g.h) return null;
        return { col: c, row: r };
      },
      cellRect: function (c, r, w, h) {
        return { x: this.x + c * cs, y: this.y + r * cs, w: (w || 1) * cs, h: (h || 1) * cs };
      }
    };
  }

  /* The bare hull: device cells, engine cells, holes.
     `opts.solid` is a colour laid down under every cell before its tint. The
     hull's own fills are translucent, so on a striped card ground the stripes
     read straight through the ship and the two layers fight each other. With a
     solid under them the ship is one opaque layer sitting ON the background,
     which is what it is. */
  /* The hull's own render, behind its cells.
   *
   * `shipGrid` rotates the source grid 180 degrees so row 0 is the nose, and
   * the art is drawn nose-up, so the two already agree — no rotation, and the
   * picture lands on the grid's bounding box. Their aspect ratios match to
   * within a few percent across the roster (a 3x5 fighter is 639x1024), so
   * stretching to the box is close enough to look deliberate.
   *
   * It is drawn UNDER the cells and over `opts.solid`, so a hole in the hull is
   * still a hole — the art shows through the cell tints rather than replacing
   * them, and the grid stays the thing you read. */
  var ART_ALPHA = 0.75;
  /* The render lands on the grid's own bounding box. It was briefly drawn a
     tenth larger so the silhouette spilled past the cells; that is off again,
     so the picture and the grid are the same rectangle. */
  var ART_SCALE = 1;

  /* ---- the plates on the grid --------------------------------------------
     EVERY PLATE SITS AT 0.9, fitted or not. Both an empty cell and a module
     are things bolted to the hull, so both are surfaces; the tenth that is
     left lets the hull's own render breathe through the whole grid instead of
     only through its holes. `base` is the plate; the tint over it is what
     says device cell, engine mount, or which category of module. One place to
     tune all of it.

     AN EMPTY CELL IS COLOURED BY WHAT IT WILL TAKE. The grid's own encoding
     already says it and the render was throwing half of it away: 1/2/3 take a
     device, 4 takes an engine, and 5 takes EITHER — and 5 was being drawn as
     a plain engine mount, so 245 cells across the roster were lying about
     what you could put on them. Three cases now:

        device only  -> light grey
        engine only  -> blue
        either       -> both, split corner to corner

     `MOD_TINT` is the alpha of a module's category tint over its own plate, as
     a hex pair on the end of a #rrggbb: 0.20. */
  var CELL = {
    base:       'rgba(10,16,22,0.9)',       /* under a fitted module        */
    device:     'rgba(199,214,222,0.9)',    /* takes a device: light grey   */
    engine:     'rgba(91,140,255,0.9)',     /* takes an engine: blue        */
    /* The border carries the same weight a fitted module's does — 1.2px of a
       deeper cut of the plate's own colour — so an empty cell is a tile like
       any other rather than a flat patch beside them. A module sits on a dark
       plate and is outlined in something brighter than it; an empty cell is a
       light plate, so its outline goes the other way and is darker. Same
       contrast, opposite direction. */
    edgeDevice: 'rgba(74,92,104,0.85)',
    edgeEngine: 'rgba(30,56,130,0.85)',
    edgeW:      1.2,
    /* A one-pixel lift along the top inside edge. It is what makes the tile
       read as a raised plate rather than a painted square, and it is the only
       thing on the grid that is not flat. */
    lift:       'rgba(255,255,255,0.35)',
    liftEngine: 'rgba(255,255,255,0.28)'
  };
  var MOD_BASE = CELL.base;
  var MOD_TINT = '33';

  /* ---- ONE SWITCH, FOR TRYING THE OTHER WAY ROUND ------------------------
     'plate'  — a fitted module brings its own ground: the dark plate with its
                category tint over it. The grid underneath is not drawn.
     'cells'  — a fitted module keeps the ground it is bolted to: the grey and
                blue of the cells it covers show straight through, and the only
                thing the category colours is the border.
     Nothing else changes between the two; flip this line to go back. */
  var MODULE_BG = 'cells';

  /* One empty cell's plate. A cell that takes either kind is painted as two
     triangles about the leading diagonal — device in the top-left half,
     engine in the bottom-right — rather than as a third colour, so it reads
     as "this one and that one" and not as a category of its own. The split is
     clipped to the rounded rect so the corners stay the same shape as every
     other cell. */
  function plate(ctx, x, y, w, h, rad, dev, eng) {
    if (!(dev && eng)) {
      fillRR(ctx, x, y, w, h, rad, eng ? CELL.engine : CELL.device);
      return;
    }
    ctx.save();
    rr(ctx, x, y, w, h, rad); ctx.clip();
    ctx.fillStyle = CELL.device;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CELL.engine;
    ctx.beginPath();
    ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* …and its edge, halved the same way. */
  function plateEdge(ctx, x, y, w, h, rad, dev, eng, cs) {
    var lw = CELL.edgeW;
    if (!(dev && eng)) {
      strokeRR(ctx, x, y, w, h, rad, eng ? CELL.edgeEngine : CELL.edgeDevice, lw);
      lift(ctx, x, y, w, rad, eng ? CELL.liftEngine : CELL.lift, cs);
      return;
    }
    var halves = [[CELL.edgeDevice, 0], [CELL.edgeEngine, 1]];
    for (var i = 0; i < 2; i++) {
      ctx.save();
      ctx.beginPath();
      if (halves[i][1] === 0) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); }
      else { ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
      ctx.closePath(); ctx.clip();
      strokeRR(ctx, x, y, w, h, rad, halves[i][0], lw);
      ctx.restore();
    }
    lift(ctx, x, y, w, rad, CELL.lift, cs);
  }

  /* The highlight along the top inside edge. Skipped on a small cell, where a
     one-pixel line across a twelve-pixel tile is noise rather than shape. */
  function lift(ctx, x, y, w, rad, colour, cs) {
    if (cs < 18) return;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + rad + 1, y + 1.5);
    ctx.lineTo(x + w - rad - 1, y + 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawArt(ctx, L, opts) {
    if (opts.art === false || !L.ship || typeof Data === 'undefined') return;
    var im = Data.shipImg(L.ship);
    if (!im || !im.complete || !im.naturalWidth) return;
    var g = L.grid, cs = L.cs;
    var k = opts.artScale === undefined ? ART_SCALE : opts.artScale;
    var w = g.w * cs * k, h = g.h * cs * k;
    ctx.save();
    ctx.globalAlpha = (opts.artAlpha === undefined ? ART_ALPHA : opts.artAlpha) *
                      (opts.alpha === undefined ? 1 : opts.alpha);
    ctx.drawImage(im, L.x - (w - g.w * cs) / 2, L.y - (h - g.h * cs) / 2, w, h);
    ctx.restore();
  }

  /* Which cells a fit covers, as one byte per grid square. A cell under a
     module is never seen — the module's own plate goes over it and is the
     same solid 0.9 — so drawing it is a rounded rect and a stroke thrown
     away, for every fitted cell of every hull on screen. `draw` works this
     out once and hands it to `drawHull`; a caller that draws the two halves
     itself can pass `placements` instead and have it worked out here. */
  function coverOf(L, placements, skip) {
    var g = L.grid, mask = new Uint8Array(g.w * g.h), i, c, r;
    for (i = 0; i < placements.length; i++) {
      /* the one being dragged is not drawn, so its cells are empty again */
      if (i === skip) continue;
      var p = placements[i], m = Data.module(p.moduleId);
      if (!m) continue;
      for (r = 0; r < m.height; r++)
        for (c = 0; c < m.width; c++) {
          var cc = p.col + c, rw = p.row + r;
          if (cc >= 0 && rw >= 0 && cc < g.w && rw < g.h) mask[rw * g.w + cc] = 1;
        }
    }
    return mask;
  }

  function drawHull(ctx, L, opts) {
    opts = opts || {};
    var g = L.grid, cs = L.cs, gap = cs > 14 ? 1.5 : 0.5;
    var cover = opts.cover ||
                (opts.placements ? coverOf(L, opts.placements, opts.skip) : null);
    /* HULL means the hull. `cells: false` draws the picture and nothing else —
       no grid, no ground under it — for the toggle's HULL side, where the
       question is what the ship looks like and not what will fit on it. The
       ground exists to stop a striped card reading through a translucent
       grid; with no grid there is nothing to read through, and the art's own
       alpha does the masking. */
    if (opts.cells === false) { drawArt(ctx, L, opts); return; }

    /* `solid` is laid over the background first where it is asked for, then the
       art, then the cells — so the stripes on a hangar card still cannot read
       through, and the ship still does. */
    if (opts.solid) {
      ctx.fillStyle = opts.solid;
      for (var r0 = 0; r0 < g.h; r0++)
        for (var c0 = 0; c0 < g.w; c0++)
          if (g.cells[r0][c0] !== 0)
            ctx.fillRect(L.x + c0 * cs, L.y + r0 * cs, cs, cs);
    }
    drawArt(ctx, L, opts);
    for (var r = 0; r < g.h; r++) {
      for (var c = 0; c < g.w; c++) {
        var v = g.cells[r][c];
        if (v === 0) continue;
        var under = cover && cover[r * g.w + c];    /* a module is over it */
        /* On 'plate' a covered cell is not drawn at all — the module's own
           ground goes over it. On 'cells' it IS drawn, because it is what the
           module shows through; only its border is left off, since the module
           draws its own and two nested outlines per cell is a mess. */
        if (under && MODULE_BG !== 'cells') continue;
        /* Both are asked of the grid's own encoding, so a cell that takes
           either kind answers yes twice. `solid` went down before the art,
           above — laying it again here would paint over the ship. */
        var dev = Geom.isDeviceCell(v), eng = Geom.isEngineCell(v);
        var px = L.x + c * cs + gap, py = L.y + r * cs + gap, pw = cs - gap * 2;
        var rad0 = Math.min(3, cs / 5);
        plate(ctx, px, py, pw, pw, rad0, dev, eng);
        if (!under && opts.outline !== false && cs > 10) {
          plateEdge(ctx, px, py, pw, pw, rad0, dev, eng, cs);
        }
      }
    }
  }

  /* The fitted modules on top of the hull. */
  function drawModules(ctx, L, placements, opts) {
    opts = opts || {};
    var cs = L.cs;
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i], m = Data.module(p.moduleId);
      if (!m) continue;
      if (opts.skip === i) continue;
      var r = L.cellRect(p.col, p.row, m.width, m.height), tint = T.tintForModule(m);
      var pad = cs > 14 ? 1.5 : 0.5, rad = Math.min(4, cs / 4);

      if (MODULE_BG !== 'cells') {
        fillRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad, MOD_BASE);
        fillRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad,
               tint + MOD_TINT);
      }
      var im = Data.moduleImg(m);
      if (im && im.complete && im.naturalWidth) {
        ctx.save();
        rr(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad); ctx.clip();
        ctx.globalAlpha = 1;
        /* contain, not stretch: a 1x3 railgun's picture squeezed into a 3x1
           slot is a smear, and every module's art is drawn at its own
           proportions. */
        drawContain(ctx, im, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
        ctx.restore();
      }
      strokeRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad,
               (opts.selected === i) ? T.white : tint + 'cc', (opts.selected === i) ? 2.5 : 1.2);
      drawVariant(ctx, m, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
    }
  }

  function draw(ctx, ship, placements, box, opts) {
    opts = opts || {};
    var L = layout(ship, box, opts.maxCell);
    var fit = (placements && placements.length) ? placements : null;
    if (fit && !opts.cover) opts.cover = coverOf(L, fit, opts.skip);
    drawHull(ctx, L, opts);
    if (fit) drawModules(ctx, L, placements, opts);
    return L;
  }

  return { layout: layout, drawHull: drawHull, drawModules: drawModules,
           drawArt: drawArt, draw: draw, cellSize: cellSize, coverOf: coverOf };
})();
