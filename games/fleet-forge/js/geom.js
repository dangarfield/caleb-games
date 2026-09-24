/* geom.js — the ship grid, and the one place a fit is validated.
 *
 * THE BUG THIS FILE EXISTS TO KILL
 * The old build had three different validators. The fitting screen's overlap
 * check read `m.width || 1` from placements that only ever stored {moduleId,col,row},
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

  /* The ship's `grid` array is stored back-to-front; every consumer in the old
     build rotated it 180 degrees independently. Done once, here. */
  function shipGrid(ship) {
    if (gridCache[ship.key]) return gridCache[ship.key];
    var w = ship.width, h = ship.height, cells = [];
    for (var row = h - 1; row >= 0; row--) {
      var line = [];
      for (var col = w - 1; col >= 0; col--) line.push(ship.grid[row * w + col] || 0);
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
    for (var r = row; r < row + mod.height; r++)
      for (var c = col; c < col + mod.width; c++) out.push(r * 1000 + c);
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
  function canPlace(grid, placements, mods, moduleId, col, row, skipIndex, occIn) {
    var m = mods[moduleId];
    if (!m) return { ok: false, why: 'unknown module' };
    if (col < 0 || row < 0 || col + m.width > grid.w || row + m.height > grid.h)
      return { ok: false, why: 'off the hull' };

    var wantsEngine = (m.category & CAT.ENGINE) !== 0;
    /* `occIn` is for a caller that already maintains an occupancy map — the
       packer asks this question once per candidate module per cell, and
       rebuilding the map each time is what made a 430-cell hull take 450ms. */
    var occ = occIn || occupancy(placements, mods, skipIndex);

    for (var r = row; r < row + m.height; r++) {
      for (var c = col; c < col + m.width; c++) {
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
  /* ---- hull bonuses, resolved ---------------------------------------------
   * A bonus key is `<Category><Parameter>`: `ArmorArmor` is "+x% armour on
   * armour modules". The category half is the SAME bit field modules carry in
   * `category`, which is what makes the hot path cheap — a bonus applies when the
   * masks overlap, and no stat needs a special case.
   *
   * This lives in geom.js rather than data.js because every headless tool
   * already loads geom.js, and two copies of this table would drift.
   */
  var BONUS_CATS = {
    Ballistic: 1, Missile: 2, Laser: 4, AllWeapons: 7,
    Armor: 8, Shield: 16, PointDefense: 32, Engine: 64, Reactor: 128,
    Support: 256, All: 511,
    Self: -1                        /* the ship, not a category of module */
  };
  /* parameter -> the module field it scales. A parameter absent here is one the
     sim does not model; `resolveBonus` reports it rather than dropping it. */
  var BONUS_PARAMS = {
    Armor: 'armor', Reflect: 'reflect', PowerUse: 'powerUse',
    PowerGeneration: 'powerGeneration', Mass: 'mass', Health: 'health',
    ExplosionRadius: 'explosionRadius', ExplosionDamage: 'explosionDamage',
    ThrustPower: 'thrustPower', TurnPower: 'turnSpeed', Damage: 'damage',
    FiringArc: 'fireCone', Range: 'range', ShieldRadius: 'shieldRadius',
    ShieldStrength: 'shieldStrength', MaxRegeneration: 'shieldMaxRegen',
    RegenSpeed: 'shieldRegenSpeed', PenetratingDamage: 'impactPush',
    /* The three disruption bonuses are siblings — mine, rocket and torpedo —
       and each scales that kind's shoot-down chance. Rocket used to scale the
       point-defence RADIUS instead, which is a different stat no bonus key
       mentions, so seven hulls advertised a rocket defence they did not have. */
    RocketDisruptionChance: 'pdMissileShootDownChance',
    MineDisruptionChance: 'pdMineShootDownChance',
    TorpedoDisruptionChance: 'pdTorpedoShootDownChance'
  };
  /* longest first, so `AllWeapons` wins over `All` */
  var BONUS_CAT_ORDER = Object.keys(BONUS_CATS).sort(function (a, b) { return b.length - a.length; });

  function splitBonusKey(k) {
    for (var i = 0; i < BONUS_CAT_ORDER.length; i++) {
      var c = BONUS_CAT_ORDER[i];
      if (k.indexOf(c) !== 0) continue;
      var p = k.slice(c.length);
      if (BONUS_PARAMS[p] !== undefined) {
        return { mask: BONUS_CATS[c], field: BONUS_PARAMS[p], cat: c, param: p };
      }
    }
    return null;
  }

  /* Turn one ship's `{key: pct}` map into the flat list the hot path walks.
     Keys this build cannot act on are collected in `out.skipped`, never
     silently dropped — a hull advertising a stat that does nothing is worse
     than a hull with no bonus at all. */
  function resolveBonus(map) {
    var out = [], skipped = [];
    for (var k in map) {
      var r = splitBonusKey(k);
      if (!r) { skipped.push(k); continue; }
      out.push({ mask: r.mask, field: r.field, pct: map[k] });
    }
    out.skipped = skipped;
    return out;
  }

  /* ---- hull bonuses -------------------------------------------------------
   * A ship's `bonusList` (resolved in data.js) is a list of
   * `{mask, field, pct}`. A bonus applies to a module when their category bits
   * overlap; `mask === -1` means the whole ship and applies to everything.
   *
   * This returns an EFFECTIVE COPY of the module rather than mutating it,
   * because `Data.modules` is shared by both combatants and every screen — the
   * same Chaingun record is the player's and the enemy's at once, and their
   * hulls buff it differently. The copy is per placement, per battle.
   */
  function applyBonus(mod, list) {
    if (!list || !list.length) return mod;
    var pct = null, i;
    for (i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.mask !== -1 && !(b.mask & (mod.category || 0))) continue;
      (pct || (pct = {}))[b.field] = (pct[b.field] || 0) + b.pct;
    }
    if (!pct) return mod;
    var out = {}, k;
    for (k in mod) out[k] = mod[k];
    for (k in pct) {
      if (typeof out[k] !== 'number') continue;   /* absent stat stays absent */
      out[k] = out[k] * (1 + pct[k] / 100);
    }
    return out;
  }

  function summarise(ship, placements, mods) {
    /* MASS IS THE FIT, AND ONLY THE FIT. The hull used to bring a base mass of
       its own (`rm`), which ran 4,500-34,000 and drowned out everything bolted
       to it — a Broadsword was 87% hull, so what you fitted moved its handling
       by a few percent. The new ship data has no such field, and that is the
       better model: a ship is as heavy as what you put on it. */
    var s = {
      cellsUsed: 0, capacity: shipGrid(ship).capacity,
      powerUse: 0, powerGen: 0, mass: 0,
      weapons: 0, reactors: 0, sources: 0, engines: 0, thrust: 0, health: 0, shield: 0,
      dps: 0, mix: { ballistic: 0, missile: 0, laser: 0 }
    };
    var bonus = ship && ship.bonusList;
    for (var i = 0; i < placements.length; i++) {
      var m = mods[placements[i].moduleId];
      if (!m) continue;
      m = applyBonus(m, bonus);
      s.cellsUsed += m.width * m.height;
      s.powerUse  += m.powerUse || 0;
      s.powerGen  += m.powerGeneration || 0;
      s.mass      += m.mass  || 0;
      s.health    += m.health || 0;
      /* mines are armament — they deal damage, and the sim's win condition
         counts them, so the fitting rules must agree. Junk launchers are not:
         they block incoming fire and cannot kill. */
      if ((m.category & CAT.WEAPON) && m.subtype !== 'junk') {
        s.weapons++;
        /* A hangar-grade DPS estimate, not the sim's. `attackSpeed` is the reload
           interval in seconds (see js/sim/modules.js — it is keyed as a rate
           and is not one); a weapon with none cycles as fast as it can, which
           for the beams that carry it is paced elsewhere, so half a second is
           the stand-in. Good enough to compare two fits, which is all the
           number is for. */
        s.dps += (m.damage || 0) / (m.attackSpeed > 0 ? m.attackSpeed : 0.5);
        if (s.mix[m.damageType] !== undefined) s.mix[m.damageType] += m.width * m.height;
      }
      if (m.category & CAT.REACTOR) s.reactors++;
      /* Anything that makes power counts as a power source, reactor or not —
         Solar Armor and Small Laser v2 generate and draw nothing. */
      if ((m.powerGeneration || 0) > 0) s.sources++;
      if ((m.category & CAT.ENGINE) && (m.thrustPower || 0) > 0) { s.engines++; s.thrust += m.thrustPower; }
      /* Shield pool, for the hangar's SHD readout and EHP. `shieldMaxRegen` is the cap the
         sim actually regenerates to; `shieldStrength` is the starting charge — a few plates
         carry one and not the other, so take whichever is there. */
      if (m.category & CAT.SHIELD) s.shield += (m.shieldMaxRegen || m.shieldStrength || 0);
    }
    s.power = s.powerGen - s.powerUse;
    s.ehp = s.health + s.shield;
    return s;
  }

  function validate(ship, placements, mods) {
    var s = summarise(ship, placements, mods), errs = [];
    if (!s.weapons)               errs.push('Needs at least one weapon');
    /* Not "needs a reactor": a hull whose power comes from Solar Armor or a
       Small Laser v2 is powered, and the rule this enforces is that the ship
       can run, not that a particular part is bolted to it. */
    if (!s.sources && !s.reactors) errs.push('Needs a power source');
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
    applyBonus: applyBonus,
    resolveBonus: resolveBonus,
    splitBonusKey: splitBonusKey,
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
