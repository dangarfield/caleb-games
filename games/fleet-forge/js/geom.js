/* geom.js — the ship grid, and the one place a fit is validated.
 *
 * THE BUG THIS FILE EXISTS TO KILL
 * The old build had three different validators. The fitting screen's overlap
 * check read `m.w || 1` from placements that only ever stored {moduleId,col,row},
 * so every already-placed module was treated as 1x1 and only its top-left cell
 * was protected. That is the afterburner-won't-fit bug: the engine band looked
 * free because the ion drive's lower cells were invisible. A second, correct
 * check sat thirty lines below it, and the battle scene had a third.
 * There is now exactly one, and it looks dimensions up in the module data.
 */
var CAT = {
  BALLISTIC: 1, MISSILE: 2, LASER: 4, ARMOR: 8, SHIELD: 16,
  POINTDEF: 32, ENGINE: 64, REACTOR: 128, SUPPORT: 256
};
CAT.WEAPON = CAT.BALLISTIC | CAT.MISSILE | CAT.LASER;

var Geom = (function () {
  var gridCache = {};

  /* The ship's `g` array is stored back-to-front; every consumer in the old
     build rotated it 180 degrees independently. Done once, here. */
  function shipGrid(ship) {
    if (gridCache[ship.key]) return gridCache[ship.key];
    var w = ship.w, h = ship.h, cells = [];
    for (var row = h - 1; row >= 0; row--) {
      var line = [];
      for (var col = w - 1; col >= 0; col--) line.push(ship.g[row * w + col] || 0);
      cells.push(line);
    }
    var g = { w: w, h: h, cells: cells, capacity: 0 };
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) if (cells[r][c] !== 0) g.capacity++;
    gridCache[ship.key] = g;
    return g;
  }

  function isEngineCell(v) { return v === 4 || v === 5; }
  function isDeviceCell(v) { return v === 1 || v === 2 || v === 3 || v === 5; }

  /* Every cell a placement covers. The single source of a module's footprint. */
  function footprint(mod, col, row) {
    var out = [];
    for (var r = row; r < row + mod.h; r++)
      for (var c = col; c < col + mod.w; c++) out.push(r * 1000 + c);
    return out;
  }

  /* A map of occupied cell -> placement index, built from real module sizes. */
  function occupancy(placements, mods, skipIndex) {
    var occ = {};
    for (var i = 0; i < placements.length; i++) {
      if (i === skipIndex) continue;
      var p = placements[i], m = mods[p.moduleId];
      if (!m) continue;
      var f = footprint(m, p.col, p.row);
      for (var j = 0; j < f.length; j++) occ[f[j]] = i;
    }
    return occ;
  }

  /* Can `moduleId` sit at col,row? `skipIndex` lets a module be tested against
     the board it is already on (for a move). Returns a reason, not just false,
     so the UI can say why. */
  function canPlace(grid, placements, mods, moduleId, col, row, skipIndex) {
    var m = mods[moduleId];
    if (!m) return { ok: false, why: 'unknown module' };
    if (col < 0 || row < 0 || col + m.w > grid.w || row + m.h > grid.h)
      return { ok: false, why: 'off the hull' };

    var wantsEngine = (m.c & CAT.ENGINE) !== 0;
    var occ = occupancy(placements, mods, skipIndex);

    for (var r = row; r < row + m.h; r++) {
      for (var c = col; c < col + m.w; c++) {
        var v = grid.cells[r][c];
        if (v === 0) return { ok: false, why: 'off the hull' };
        if (wantsEngine && !isEngineCell(v)) return { ok: false, why: 'engines need an engine cell' };
        if (!wantsEngine && !isDeviceCell(v)) return { ok: false, why: 'that cell is engine-only' };
        if (occ[r * 1000 + c] !== undefined) return { ok: false, why: 'something is already there' };
      }
    }
    return { ok: true };
  }

  /* What a fit adds up to. Detection is by category bit, never by an English
     display-name substring the way the old shipCalculations.js did it — and
     "has an engine" means real thrust, so a Warp Drive (c:64, ep:0) no longer
     counts as one. */
  function summarise(ship, placements, mods) {
    var s = {
      cellsUsed: 0, capacity: shipGrid(ship).capacity,
      powerUse: 0, powerGen: 0, mass: ship.rm || 0,
      weapons: 0, reactors: 0, engines: 0, thrust: 0, health: 0, shield: 0,
      dps: 0, mix: { ballistic: 0, missile: 0, laser: 0 }
    };
    for (var i = 0; i < placements.length; i++) {
      var m = mods[placements[i].moduleId];
      if (!m) continue;
      s.cellsUsed += m.w * m.h;
      s.powerUse  += m.pu || 0;
      s.powerGen  += m.pg || 0;
      s.mass      += m.m  || 0;
      s.health    += m.hlt || 0;
      /* mines are armament — they deal damage, and the sim's win condition
         counts them, so the fitting rules must agree. Junk launchers are not:
         they block incoming fire and cannot kill. */
      if ((m.c & CAT.WEAPON) && m.subtype !== 'junk') {
        s.weapons++;
        /* A hangar-grade DPS estimate, not the sim's. `ats` is the reload
           interval in seconds (see js/sim/modules.js — it is keyed as a rate
           and is not one); a weapon with none cycles as fast as it can, which
           for the beams that carry it is paced elsewhere, so half a second is
           the stand-in. Good enough to compare two fits, which is all the
           number is for. */
        s.dps += (m.dmg || 0) / (m.ats > 0 ? m.ats : 0.5);
        if (s.mix[m.damageType] !== undefined) s.mix[m.damageType] += m.w * m.h;
      }
      if (m.c & CAT.REACTOR) s.reactors++;
      if ((m.c & CAT.ENGINE) && (m.ep || 0) > 0) { s.engines++; s.thrust += m.ep; }
      /* Shield pool, for the hangar's SHD readout and EHP. `smr` is the cap the
         sim actually regenerates to; `sa` is the starting charge — a few plates
         carry one and not the other, so take whichever is there. */
      if (m.c & CAT.SHIELD) s.shield += (m.smr || m.sa || 0);
    }
    s.power = s.powerGen - s.powerUse;
    s.ehp = s.health + s.shield;
    return s;
  }

  function validate(ship, placements, mods) {
    var s = summarise(ship, placements, mods), errs = [];
    if (!s.weapons)               errs.push('Needs at least one weapon');
    if (!s.reactors)              errs.push('Needs at least one reactor');
    if (!s.engines)               errs.push('Needs at least one engine');
    if (s.power < 0)              errs.push('Not enough power');
    if (s.cellsUsed > s.capacity) errs.push('Over capacity');
    return { ok: errs.length === 0, errors: errs, stats: s };
  }

  /* Grid cell -> offset from the ship's centre, in cells. */
  function gridToLocal(col, row, mw, mh, gw, gh) {
    return { x: (col + mw / 2) - gw / 2, y: (row + mh / 2) - gh / 2 };
  }
  /* ...and out into the world, for a ship at `pos` facing `rot`. */
  function gridToWorld(col, row, mw, mh, gw, gh, pos, rot, cellSize) {
    var l = gridToLocal(col, row, mw, mh, gw, gh);
    var a = rot + Math.PI / 2, cos = Math.cos(a), sin = Math.sin(a), cs = cellSize || 1;
    return { x: pos.x + (l.x * cos - l.y * sin) * cs,
             y: pos.y + (l.x * sin + l.y * cos) * cs };
  }

  return {
    shipGrid: shipGrid, isEngineCell: isEngineCell, isDeviceCell: isDeviceCell,
    footprint: footprint, occupancy: occupancy, canPlace: canPlace,
    summarise: summarise, validate: validate,
    gridToLocal: gridToLocal, gridToWorld: gridToWorld,
    /* which placement, if any, covers this cell */
    at: function (placements, mods, col, row) {
      var occ = occupancy(placements, mods);
      var i = occ[row * 1000 + col];
      return i === undefined ? -1 : i;
    }
  };
})();
