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
      grid: g, cs: cs,
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
  function drawHull(ctx, L, opts) {
    opts = opts || {};
    var g = L.grid, cs = L.cs, gap = cs > 14 ? 1.5 : 0.5;
    for (var r = 0; r < g.h; r++) {
      for (var c = 0; c < g.w; c++) {
        var v = g.cells[r][c];
        if (v === 0) continue;
        var eng = Geom.isEngineCell(v);
        if (opts.solid) {
          fillRR(ctx, L.x + c * cs + gap, L.y + r * cs + gap, cs - gap * 2, cs - gap * 2,
                 Math.min(3, cs / 5), opts.solid);
        }
        fillRR(ctx, L.x + c * cs + gap, L.y + r * cs + gap, cs - gap * 2, cs - gap * 2,
               Math.min(3, cs / 5),
               eng ? 'rgba(92,232,155,0.13)' : 'rgba(160,196,255,0.10)');
        if (opts.outline !== false && cs > 10) {
          strokeRR(ctx, L.x + c * cs + gap, L.y + r * cs + gap, cs - gap * 2, cs - gap * 2,
                   Math.min(3, cs / 5), eng ? 'rgba(92,232,155,0.28)' : 'rgba(160,196,255,0.16)', 1);
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
      var r = L.cellRect(p.col, p.row, m.w, m.h), tint = T.tintForModule(m);
      var pad = cs > 14 ? 1.5 : 0.5, rad = Math.min(4, cs / 4);

      if (opts.solid) {
        fillRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad, opts.solid);
      }
      fillRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad, tint + '33');
      var im = Data.moduleImg(m);
      if (im && im.complete && im.naturalWidth) {
        ctx.save();
        rr(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad); ctx.clip();
        ctx.globalAlpha = 0.92;
        ctx.drawImage(im, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
        ctx.restore();
      }
      strokeRR(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, rad,
               (opts.selected === i) ? T.white : tint + 'cc', (opts.selected === i) ? 2.5 : 1.2);
    }
  }

  function draw(ctx, ship, placements, box, opts) {
    opts = opts || {};
    var L = layout(ship, box, opts.maxCell);
    drawHull(ctx, L, opts);
    if (placements && placements.length) drawModules(ctx, L, placements, opts);
    return L;
  }

  return { layout: layout, drawHull: drawHull, drawModules: drawModules, draw: draw, cellSize: cellSize };
})();
