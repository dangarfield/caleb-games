/* autofit.js — build a whole fit from a recipe, and place it sensibly.
 *
 * WHY THIS IS ITS OWN FILE
 * Two things need to pack a hull: the AUTOFIT button in the fitting bay, and
 * the tool that generates the AI opponents. Two packers drift apart, which is
 * how the old build ended up with three validators that disagreed — so this is
 * written to be the only one, and the only thing that should differ between a
 * player's autofit and a generated opponent is the options passed in.
 *
 * TODO, and it is a real one: `tools/make-opponents.js` still has its own copy
 * of this logic. It is the packer the shipped roster was balanced against, so
 * it is not being swapped out in the same change that introduces this file —
 * but it should be, and then the `placement` option below is what makes a
 * generated opponent easy or hard without touching a single stat.
 *
 * WHAT MAKES A FIT "SENSIBLE"
 * Nothing in this file decides legality — `Geom.canPlace` is asked for every
 * placement and `Geom.validate` judges the result, same as the hand editor. A
 * fit is sensible when it is legal AND it holds together in the sim:
 *   - it must fly:   one weapon, one reactor, one real drive, power >= 0
 *   - it must last:  plate on the skin, reactors buried
 *   - it must shoot: guns forward, where the shared doctrine points the ship
 * The last two are the `clever` placement mode. `random` exists as its twin so
 * a generated roster can be given deliberately clumsy fits — difficulty in this
 * game is the fit and nothing else, so a bad fit is the only way to make an
 * easy opponent.
 *
 * WHICH WAY IS FORWARD
 * `Geom.shipGrid` rotates the source data once so that ROW 0 IS THE NOSE and
 * the engine cells sit at the high row indices. Every score below reads `front`
 * as `1 - row/(h-1)`. If that ever stops being true, this file is where it
 * shows up first — the plate would migrate to the stern.
 */
var Autofit = (function () {

  /* ---- the recipe ------------------------------------------------------
     A recipe is a share of the hull's CELLS per category. They need not sum to
     one: whatever is left over is plated at the end, which is the right answer
     for a leftover cell anyway. */
  var BASE = { weapon: 0.36, shield: 0.14, armor: 0.14, reactor: 0.20, support: 0.04 };

  var PRIORITY = {
    mix:      { },
    weapons:  { weapon: 0.46, shield: 0.10, armor: 0.10, reactor: 0.22, support: 0.02 },
    defence:  { weapon: 0.26, shield: 0.22, armor: 0.22, reactor: 0.20, support: 0.06 },
    /* Speed is mass, not thrust: the sim divides thrust by mass, so the fastest
       hull is the emptiest one that still fights. Fewer, lighter modules, and
       an afterburner on top. */
    speed:    { weapon: 0.32, shield: 0.10, armor: 0.08, reactor: 0.20, support: 0.04 }
  };

  /* How the weapon share splits across damage types. */
  var WEAPONS = {
    mix:       { ballistic: 0.34, missile: 0.33, laser: 0.33 },
    ballistic: { ballistic: 1 },
    missile:   { missile: 1 },
    laser:     { laser: 1 }
  };

  /* ...and how the defence share splits between the two ways of not dying. */
  var ARMOUR = {
    mix:     { shield: 0.5, armor: 0.5 },
    shields: { shield: 0.75, armor: 0.25 },
    armour:  { shield: 0.25, armor: 0.75 }
  };

  /* The named singles a recipe asks for once each, in this order. */
  var SINGLES = {
    mix:      ['pd', 'repair'],
    weapons:  ['pd'],
    defence:  ['repair', 'pd', 'pd'],
    speed:    []   /* warp and burner are engine-mount modules; see build() */
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---- what may be fitted --------------------------------------------- */
  function pools(mods, allow) {
    var by = { ballistic: [], missile: [], laser: [], armor: [], shield: [],
               pd: [], reactor: [], drive: [], engine: [], repair: [], ab: [],
               warp: [], mine: [], junk: [] };
    for (var k in mods) {
      var m = mods[k];
      if (allow && !allow(m)) continue;
      var s = m.subtype;
      if (s === 'weapon' && by[m.damageType]) by[m.damageType].push(m);
      else if (s === 'armor') by.armor.push(m);
      else if (s === 'shield') by.shield.push(m);
      else if (s === 'pointdefense') by.pd.push(m);
      else if (s === 'reactor') by.reactor.push(m);
      else if (s === 'engine') { by.engine.push(m); if ((m.ep || 0) > 0) by.drive.push(m); }
      else if (s === 'repair') by.repair.push(m);
      else if (s === 'afterburner') by.ab.push(m);
      else if (s === 'warp') by.warp.push(m);
      else if (s === 'mine') by.mine.push(m);
      else if (s === 'junk') by.junk.push(m);
    }
    /* Biggest first, because a big module only fits while the hull is open.
       There used to be a lightest-first mode for `speed`; it sorted the ENGINES
       too, so a speed build fitted six 1x1 thrusters (5400 thrust) in place of
       one Grand Ion Drive (12000) and came out the slowest of the four. Speed
       now picks its engines explicitly in `build` instead. */
    for (var p in by) {
      by[p].sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    }
    return by;
  }

  /* ---- where things want to sit ----------------------------------------
     One score per cell per category, in 0..1. Everything is a blend of three
     readings of the hull: how far forward the cell is, how close it is to the
     skin, and how buried it is. */
  function survey(grid) {
    var w = grid.w, h = grid.h;
    var depth = [], r, c;
    /* depth = rings in from the hull's outline, by a cheap flood */
    for (r = 0; r < h; r++) {
      depth.push([]);
      for (c = 0; c < w; c++) depth[r].push(grid.cells[r][c] === 0 ? -1 : 0);
    }
    var queue = [], seen = {};
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (depth[r][c] < 0) continue;
      var onSkin = (r === 0 || c === 0 || r === h - 1 || c === w - 1 ||
                    grid.cells[r - 1][c] === 0 || grid.cells[r + 1][c] === 0 ||
                    grid.cells[r][c - 1] === 0 || grid.cells[r][c + 1] === 0);
      if (onSkin) { depth[r][c] = 1; queue.push(r * 1000 + c); seen[r * 1000 + c] = 1; }
    }
    for (var qi = 0; qi < queue.length; qi++) {
      var key = queue[qi], qr = (key / 1000) | 0, qc = key % 1000;
      var d = depth[qr][qc];
      var nb = [[qr - 1, qc], [qr + 1, qc], [qr, qc - 1], [qr, qc + 1]];
      for (var n = 0; n < 4; n++) {
        var nr = nb[n][0], nc = nb[n][1];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        if (depth[nr][nc] !== 0) continue;
        if (seen[nr * 1000 + nc]) continue;
        depth[nr][nc] = d + 1; seen[nr * 1000 + nc] = 1; queue.push(nr * 1000 + nc);
      }
    }
    var maxD = 1;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) if (depth[r][c] > maxD) maxD = depth[r][c];
    return { depth: depth, maxD: maxD };
  }

  /* 0 = stern, 1 = nose. 0 = buried, 1 = on the skin. */
  function readings(grid, s, r, c) {
    var front = grid.h > 1 ? 1 - r / (grid.h - 1) : 1;
    var d = s.depth[r][c];
    var skin = s.maxD > 1 ? 1 - (d - 1) / (s.maxD - 1) : 1;
    return { front: front, skin: skin, deep: 1 - skin };
  }

  var SCORE = {
    /* Plate is the face the shared doctrine points at the enemy, so FRONT
       leads and skin follows. It is placed before shields for the same reason:
       whichever runs first takes the good forward skin, and it should be the
       armour. */
    armor:   function (v) { return 0.80 * v.front + 0.50 * v.skin; },
    /* a shield projects a bubble from where it sits — skin, barely nose-bound */
    shield:  function (v) { return 0.70 * v.skin + 0.15 * v.front; },
    /* guns forward, and a little off the skin so a graze does not take them */
    weapon:  function (v) { return 0.85 * v.front + 0.25 * v.deep; },
    /* point defence covers the flanks and the stern, where nothing else looks */
    pd:      function (v) { return 0.60 * v.skin + 0.40 * (1 - v.front); },
    /* the reactor is the thing you lose the match by losing: bury it, aft */
    reactor: function (v) { return 0.85 * v.deep + 0.55 * (1 - v.front); },
    support: function (v) { return 0.80 * v.deep + 0.25 * (1 - v.front); }
  };

  /* ---- the pack -------------------------------------------------------- */

  /* Cells that may still take something, scored for one category and ordered
     best first. `random` mode scores by the dice instead, which is the whole of
     what makes a clumsy fit clumsy. */
  function order(grid, s, cat, placements, mods, rng, clever) {
    var out = [], r, c;
    var occ = Geom.occupancy(placements, mods);
    for (r = 0; r < grid.h; r++) {
      for (c = 0; c < grid.w; c++) {
        /* value 4 is engine-only; value 5 is a mixed mount, and engines have
           already had first refusal on it because their passes run first. */
        if (grid.cells[r][c] === 0 || !Geom.isDeviceCell(grid.cells[r][c])) continue;
        if (occ[r * 1000 + c] !== undefined) continue;
        var sc = clever ? (SCORE[cat] || SCORE.support)(readings(grid, s, r, c)) : rng();
        out.push({ r: r, c: c, s: sc });
      }
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out;
  }

  function tryPlace(grid, placements, list, mods, col, row, maxCells) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (maxCells && m.w * m.h > maxCells) continue;
      if (Geom.canPlace(grid, placements, mods, m.key, col, row, -1).ok) {
        placements.push({ moduleId: m.key, col: col, row: row });
        return m;
      }
    }
    return null;
  }

  /* Spend one category's cell budget, best cell first. */
  /* THE TRUE COST OF A MODULE IS ITS CELLS PLUS ITS POWER.
     A 2x2 shield generator occupies four cells and draws 280, which is another
     three and a half cells of reactor somewhere aft — so it really costs seven
     and a half. Charging only the four is why the recipe shares never held: a
     defence build spent its 22% on shields, the power tail quietly ate the rest
     of the hull, and the ship came out with two guns on it. `rpc` is the best
     power a cell of reactor can make; pass it and the shares are comparable. */
  function fill(grid, s, cat, list, budget, placements, mods, rng, clever, room, rpc) {
    if (!list || !list.length || budget <= 0) return budget;
    var cells = order(grid, s, cat, placements, mods, rng, clever);
    for (var i = 0; i < cells.length && budget > 0; i++) {
      /* `room` is how many cells are free BEYOND the ones the current power
         draw has already committed to reactors. Spending past it is how a fit
         ends up unable to power itself and has to be unpicked afterwards. */
      var cap2 = budget;
      if (room) { var left = room(); if (left <= 0) break; cap2 = Math.min(cap2, left); }
      var got = tryPlace(grid, placements, list, mods, cells[i].c, cells[i].r, cap2);
      if (got) {
        budget -= got.w * got.h + (rpc ? (got.pu || 0) / rpc : 0);
        /* the board moved, so the free-cell list is stale — re-read it */
        cells = order(grid, s, cat, placements, mods, rng, clever);
        i = -1;
      }
    }
    return budget;
  }

  /* Redistribute a split over the keys whose pool actually holds something.
     Returns every key, with the unavailable ones at zero. */
  function share(split, byKey) {
    var out = {}, total = 0, k;
    for (k in byKey) {
      var v = (byKey[k] && byKey[k].length) ? (split[k] || 0) : 0;
      out[k] = v; total += v;
    }
    if (total > 0) { for (k in out) out[k] /= total; return out; }
    /* nothing that was asked for exists — spread evenly over what does */
    var live = [];
    for (k in byKey) if (byKey[k] && byKey[k].length) live.push(k);
    for (k in out) out[k] = live.indexOf(k) >= 0 ? 1 / live.length : 0;
    return out;
  }

  /* THE LEADING EDGE — armour caps the frontmost cell of every column.
     This is the one placement rule you can see from across the room, and the
     scores alone never produced it: a score only ranks cells, so a big armour
     budget spills backwards into a brick and a small one stops short of the
     flanking columns. So the nose skin is built explicitly, one cell deep,
     before anything else is allowed to compete for those cells.

     Plates one row deep only, widest first, so a flat nose is capped in one
     piece and nothing hangs back into the rows behind it. A column whose
     frontmost cell is an engine mount is skipped — those take nothing else. */
  function leadingEdge(grid, placements, mods, armorList, heavy) {
    /* One row deep, always — a taller plate hangs back into the rows behind the
       cap and the skin stops being a skin. Widest first so a flat nose is
       capped in one piece; on an armour build, thickest-per-cell first so the
       skin is the best plate the pilot owns rather than merely the widest. */
    var caps = (armorList || []).filter(function (m) { return m.h === 1; });
    caps.sort(heavy
      ? function (a, b) { return ((b.hlt || 0) / b.w) - ((a.hlt || 0) / a.w) || b.w - a.w; }
      : function (a, b) { return b.w - a.w; });
    var spent = 0;
    if (!caps.length) return 0;
    for (var c = 0; c < grid.w; c++) {
      var occ = Geom.occupancy(placements, mods);
      for (var r = 0; r < grid.h; r++) {
        if (grid.cells[r][c] === 0) continue;         /* still outside the hull */
        if (Geom.isEngineCell(grid.cells[r][c])) break;
        if (occ[r * 1000 + c] !== undefined) break;   /* a wider plate got here first */
        var got = tryPlace(grid, placements, caps, mods, c, r);
        if (got) { spent += got.w * got.h; placements[placements.length - 1].edge = 1; }
        break;
      }
    }
    return spent;
  }

  /* ---- the power bill --------------------------------------------------
     Reactors are not a share of the hull, they are a consequence of it. Every
     other module states what it draws, so once the guns and drives are on the
     ship the bill is known exactly and the right number of reactors is an
     arithmetic answer, not a guess. The old recipe reserved a flat 20% of the
     cells for power and then patched the shortfall by swapping plate out at
     the end, which is how a Captain ended up carrying thirty reactors. */

  /* The best power a single cell can be made to produce. Bigger reactors are
     strictly more efficient (50/cell for a 1x1, 81/cell for a 4x4), so this is
     an optimistic number — it is used to RESERVE room, and `feed` below tops up
     for real afterwards if the big one could not be squeezed in. */
  function powerPerCell(list) {
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var v = (list[i].pg || 0) / (list[i].w * list[i].h);
      if (v > best) best = v;
    }
    return best || 1;
  }

  /* Cells a module could still go in. A value-4 cell is engine-only; a value-5
     cell takes either, and engines get first refusal simply by running first —
     which is the "mixed slots prefer engine" rule, enforced by the order of the
     passes rather than by a check. */
  function freeCells(grid, placements, mods) {
    var occ = Geom.occupancy(placements, mods), n = 0;
    for (var r = 0; r < grid.h; r++) {
      for (var c = 0; c < grid.w; c++) {
        var v = grid.cells[r][c];
        if (v === 0 || !Geom.isDeviceCell(v)) continue;
        if (occ[r * 1000 + c] === undefined) n++;
      }
    }
    return n;
  }

  /* Fit reactors until the bill is paid, and stop. Smallest reactor that covers
     what is still owed wins, so the last one does not overshoot by 1300; if
     none covers it, take the biggest that fits and go round again. They go in
     the cells the reactor score likes — buried, aft — because the reactor is
     the module you lose the match by losing. */
  function feed(ship, grid, s, placements, mods, list, rng, clever) {
    if (!list || !list.length) return;
    var small = list.slice().sort(function (a, b) { return (a.pg || 0) - (b.pg || 0); });
    var guard = 0;
    while (guard++ < 120) {
      var st = Geom.summarise(ship, placements, mods);
      var owed = st.powerUse - st.powerGen;
      if (owed <= 0) return;
      var cells = order(grid, s, 'reactor', placements, mods, rng, clever);
      var placed = false;
      for (var i = 0; i < cells.length && !placed; i++) {
        var tight = null, k;
        for (k = 0; k < small.length; k++) {
          if ((small[k].pg || 0) < owed) continue;
          if (Geom.canPlace(grid, placements, mods, small[k].key, cells[i].c, cells[i].r, -1).ok) {
            tight = small[k]; break;
          }
        }
        if (tight) {
          placements.push({ moduleId: tight.key, col: cells[i].c, row: cells[i].r });
          placed = true;
        } else if (tryPlace(grid, placements, list, mods, cells[i].c, cells[i].r)) {
          placed = true;   /* `list` is biggest-first: take the most we can here */
        }
      }
      if (!placed) return;
    }
  }

  /* Take back any reactor the ship turns out not to need. `feed` stops as soon
     as the bill is paid, but it can overshoot on the last one — the tightest
     reactor that COVERS what is owed may still be bigger than what is owed, and
     a cell of wasted power generation is a cell that could have been a gun.
     Smallest first, so what comes back is the least useful power on the ship. */
  function trim(ship, grid, placements, mods, armorList) {
    var i, guard = 0;
    while (guard++ < 40) {
      var idx = -1, small = 1e9;
      for (i = 0; i < placements.length; i++) {
        var m = mods[placements[i].moduleId];
        if (!(m.c & CAT.REACTOR)) continue;
        var area = m.w * m.h;
        if (area >= small) continue;
        var keep = placements.splice(i, 1)[0];
        var ok = Geom.summarise(ship, placements, mods);
        placements.splice(i, 0, keep);
        /* a fit needs at least one reactor whatever the sums say */
        if (ok.power < 0 || ok.reactors < 1) continue;
        idx = i; small = area;
      }
      if (idx < 0) return;
      var gone = placements.splice(idx, 1)[0];
      /* Only if plate can take its place. Pulling a reactor the pilot owns no
         plate to replace opens a hole in the hull, which is a worse trade than
         carrying a little spare power. */
      if (!tryPlace(grid, placements, armorList, mods, gone.col, gone.row,
                    mods[gone.moduleId].w * mods[gone.moduleId].h)) {
        placements.splice(idx, 0, gone);
        return;
      }
    }
  }

  function build(ship, opts, mods) {
    opts = opts || {};
    mods = mods || Data.modules;
    var clever = opts.placement !== 'random';
    var rng = mulberry32(opts.seed === undefined ? (Math.random() * 1e9) | 0 : opts.seed);
    var grid = Geom.shipGrid(ship);
    var s = survey(grid);
    var placements = [];
    var speed = opts.priority === 'speed';

    var prio = PRIORITY[opts.priority] || PRIORITY.mix;
    var recipe = {};
    for (var k in BASE) recipe[k] = prio[k] === undefined ? BASE[k] : prio[k];
    /* The recipe used to hold back a fifth of the hull for reactors. It does
       not any more — `feed` sizes those off the bill — so that fifth would just
       become leftover plate, and the ship would come out with half the guns it
       asked for. Drop the reactor share and give it to the categories that
       were asked for, normalised to leave a little room for the singles.
       These are EFFECTIVE cells: a module's own cells plus the reactor cells
       its draw implies, so the shares now add up against the whole hull. */
    delete recipe.reactor;
    var tot = 0;
    for (k in recipe) tot += recipe[k];
    for (k in recipe) recipe[k] = recipe[k] / tot * 0.92;
    var P = pools(mods, opts.allow);

    /* A recipe may ask for something this pilot has not unlocked — "all laser"
       at level 1, when no laser exists yet. Asking for it and getting a hull
       with no gun on it is the worst possible answer, so a share whose pool is
       empty is redistributed over the ones that are not. */
    var wSplit = share(WEAPONS[opts.weapons] || WEAPONS.mix,
                       { ballistic: P.ballistic, missile: P.missile, laser: P.laser });
    var aSplit = ARMOUR[opts.armour] || ARMOUR.mix;
    var cap = grid.capacity;

    /* How many cells the current power draw has already spoken for. Every fill
       pass stops while this many cells are still free, so `feed` at the end
       always has somewhere to put the reactors the ship has committed to. */
    var RPC = powerPerCell(P.reactor);
    function room() {
      var st = Geom.summarise(ship, placements, mods);
      var owed = Math.max(0, st.powerUse - st.powerGen);
      return freeCells(grid, placements, mods) - Math.ceil(owed / RPC);
    }

    /* 1. THE SKIN. Armour caps the frontmost cell of every column before
          anything else is allowed to compete for it. On an armour build the
          plate is as heavy as the run allows; otherwise it is whatever fits. */
    var edgeCells = clever
      ? leadingEdge(grid, placements, mods, P.armor, opts.armour === 'armour')
      : 0;

    /* 2. ENGINES. Real drives first, sorted by thrust per cell, so the big
          engine block gets the big engine — a hull packed with vectored
          thrusters (ep 0) has no thrust at all. Then whatever else takes an
          engine mount: on a speed build that is the vectored thrusters, which
          are pure turn rate, and everywhere else it is more drive. */
    var byThrust = P.drive.slice().sort(function (a, b) {
      return (b.ep / (b.w * b.h)) - (a.ep / (a.w * a.h)) ||
             ((b.ts || 0) / (b.w * b.h)) - ((a.ts || 0) / (a.w * a.h));
    });
    var byTurn = P.engine.slice().sort(function (a, b) {
      return ((b.ts || 0) / (b.w * b.h)) - ((a.ts || 0) / (a.w * a.h));
    });
    var r, c, pass;

    /* A warp drive and an afterburner are ENGINE-MOUNT modules (c:64), not
       devices — `canPlace` will only seat them in an engine cell, which is why
       asking for them as ordinary singles later got silently nothing. Speed is
       speed AND agility AND warp, so on a speed build they get first call on
       the mounts, but never so many that no real drive is left: two mounts are
       always kept back, and the hull must have room to spare in the first
       place. */
    var lists = [byThrust, speed ? byTurn : byThrust, P.engine];
    for (pass = 0; pass < lists.length; pass++) {
      for (r = 0; r < grid.h; r++) for (c = 0; c < grid.w; c++) {
        if (!Geom.isEngineCell(grid.cells[r][c])) continue;
        if (Geom.occupancy(placements, mods)[r * 1000 + c] !== undefined) continue;
        tryPlace(grid, placements, lists[pass], mods, c, r);
      }
    }

    /* A warp drive and an afterburner are ENGINE-MOUNT modules (c:64), not
       devices — `canPlace` will only seat them in an engine cell, which is why
       asking for them as ordinary singles got silently nothing. They go in
       AFTER the drives, because a mount given to a warp drive is a mount not
       making thrust: on the Broadsword, seating them first turned 7800 thrust
       into 1800. So: any mount the drives left over, and failing that, trade
       the smallest drive for one — but only while the ship keeps most of what
       it had, since a speed build that cannot move is not a speed build. */
    if (speed) {
      [P.warp, P.ab].forEach(function (list) {
        if (!list || !list.length) return;
        for (var rr = grid.h - 1; rr >= 0; rr--) for (var cc = 0; cc < grid.w; cc++) {
          if (!Geom.isEngineCell(grid.cells[rr][cc])) continue;
          if (Geom.occupancy(placements, mods)[rr * 1000 + cc] !== undefined) continue;
          if (tryPlace(grid, placements, list, mods, cc, rr)) {
            placements[placements.length - 1].special = 1; return;
          }
        }
        /* No spare mount. Buy one: find the cheapest patch of engine mounts the
           module would fit in, counted in the thrust that would come off with
           whatever is sitting there — often two 1x1 thrusters rather than one
           big drive — and take it only if the ship keeps most of its thrust. */
        var m0 = list[0], was = Geom.summarise(ship, placements, mods).thrust;
        var bestAt = null, bestCost = 1e12;
        for (var rr2 = 0; rr2 + m0.h <= grid.h; rr2++) {
          for (var cc2 = 0; cc2 + m0.w <= grid.w; cc2++) {
            var occ2 = Geom.occupancy(placements, mods), hit = {}, fine = true, cost = 0;
            for (var a = rr2; a < rr2 + m0.h && fine; a++) {
              for (var b = cc2; b < cc2 + m0.w && fine; b++) {
                if (!Geom.isEngineCell(grid.cells[a][b])) { fine = false; break; }
                var idx2 = occ2[a * 1000 + b];
                /* Never cost out a mount holding the other special. A warp
                   drive makes no thrust, so it looks free to take — which is
                   how the afterburner came along and sat on the warp drive the
                   previous pass had just paid 1800 thrust for. */
                if (idx2 !== undefined) {
                  if (placements[idx2].special) { fine = false; break; }
                  hit[idx2] = 1;
                }
              }
            }
            if (!fine) continue;
            for (var kk in hit) cost += mods[placements[kk].moduleId].ep || 0;
            if (cost < bestCost) { bestCost = cost; bestAt = { c: cc2, r: rr2, hit: hit }; }
          }
        }
        if (!bestAt || was - bestCost < was * 0.6) return;
        var idxs = Object.keys(bestAt.hit).map(Number).sort(function (x, y) { return y - x; });
        var taken = idxs.map(function (i2) { return placements.splice(i2, 1)[0]; });
        if (tryPlace(grid, placements, list, mods, bestAt.c, bestAt.r)) {
          if (Geom.summarise(ship, placements, mods).engines >= 1) {
            placements[placements.length - 1].special = 1; return;
          }
          placements.pop();
        }
        for (var t2 = taken.length - 1; t2 >= 0; t2--) {
          placements.splice(idxs[t2], 0, taken[t2]);
        }
      });
    }

    /* 3. one gun, guaranteed, before anything competes for the room. A twelve
          cell fighter cannot afford to discover at the end that its whole
          budget went on plate. Smallest first: the guarantee is that SOMETHING
          shoots, not that the biggest thing does. */
    var primary = null, best = -1;
    ['ballistic', 'missile', 'laser'].forEach(function (t) {
      if ((wSplit[t] || 0) > best) { best = wSplit[t] || 0; primary = t; }
    });
    var smallestGun = (P[primary] || []).slice().reverse();
    var gunCells = order(grid, s, 'weapon', placements, mods, rng, clever);
    for (var gi = 0; gi < gunCells.length; gi++) {
      if (tryPlace(grid, placements, smallestGun, mods, gunCells[gi].c, gunCells[gi].r)) break;
    }

    /* 4. the named singles. Speed asks for a warp drive as well as a burner —
          it is how a fast hull picks its own range instead of flying there. */
    (SINGLES[opts.priority] || SINGLES.mix).forEach(function (name) {
      var list = P[name];
      if (!list || !list.length || room() <= 0) return;
      var cells = order(grid, s, name === 'pd' ? 'pd' : 'support',
                        placements, mods, rng, clever);
      for (var i = 0; i < cells.length; i++) {
        if (tryPlace(grid, placements, list, mods, cells[i].c, cells[i].r,
                     Math.max(1, room()))) break;
      }
    });

    /* 5. the rest of the defence, and it runs BEFORE the guns. Both want the
          nose and whichever goes first gets it. The skin is only one cell deep;
          what stands behind it should be the rest of the plate, with the guns
          ranked behind that, because the shared doctrine always closes nose-on.
          Run the guns first and they become the outer layer, the first salvo
          strips them, and the fit is a glass cannon nobody asked for — worth
          about forty percent of its fights against the same hull packed at
          random. The skin already spent part of the armour budget, so deduct
          it: not doing so is how a capped nose turns into a brick, and on a
          twelve cell fighter that costs the ship its guns. */
    var defCells = cap * (recipe.shield + recipe.armor);
    var aUse = share(aSplit, { shield: P.shield, armor: P.armor });
    fill(grid, s, 'armor', P.armor,
         Math.max(0, defCells * aUse.armor - edgeCells),
         placements, mods, rng, clever, room, RPC);
    fill(grid, s, 'shield', P.shield, defCells * aUse.shield,
         placements, mods, rng, clever, room, RPC);

    /* 6. weapons, to the recipe's share of the hull. */
    ['ballistic', 'missile', 'laser'].forEach(function (t) {
      var wShare = (wSplit[t] || 0) * recipe.weapon;
      if (wShare <= 0) return;
      fill(grid, s, 'weapon', P[t], cap * wShare, placements, mods,
           rng, clever, room, RPC);
    });

    fill(grid, s, 'support', P.repair, cap * recipe.support,
         placements, mods, rng, clever, room, RPC);

    /* 7. POWER, LAST AND TO THE BILL. */
    feed(ship, grid, s, placements, mods, P.reactor, rng, clever);

    /* 8. an empty cell is a hole in the hull — plate whatever is left. Plate
          draws nothing, so this cannot unbalance the books. */
    fill(grid, s, 'armor', P.armor, cap, placements, mods, rng, clever);

    /* 8b. a single-cell gap the pilot owns no 1x1 plate for is still a hole.
           Offer it to the things that come one cell at a time, cheapest draw
           first, and re-run the bill afterwards so anything hungry is paid for
           rather than left to the shed loop below. */
    /* Only plate and reactors, because only they draw nothing. A gun dropped
       into the last free cell is a gun the ship cannot power, and with no cell
       left to put a reactor in, the shed loop below takes it straight back out
       — along with whatever else was hungrier, which is how a speed build lost
       the warp drive and the afterburner it had been given in step 4. */
    var gap = [P.armor, P.reactor];
    for (var gj = 0; gj < gap.length; gj++) {
      if (!freeCells(grid, placements, mods)) break;
      fill(grid, s, gj ? 'reactor' : 'armor', gap[gj], cap, placements, mods,
           rng, clever);
    }
    feed(ship, grid, s, placements, mods, P.reactor, rng, clever);
    trim(ship, grid, placements, mods, P.armor);

    /* 9. and if the sums still do not work — a narrow hull that simply cannot
          carry what was asked for — shed the hungriest module, never the last
          weapon, reactor or drive, and plate over the hole. */
    var tries = 0;
    while (Geom.summarise(ship, placements, mods).power < 0 && tries++ < 20) {
      var st = Geom.summarise(ship, placements, mods), worst = -1, worstPu = 0;
      for (var z = 0; z < placements.length; z++) {
        var md = mods[placements[z].moduleId];
        if (!(md.pu > worstPu)) continue;
        if ((md.c & CAT.WEAPON) && st.weapons <= 1) continue;
        /* Never an engine-mount module. Shedding one leaves an engine cell that
           only an engine can fill, so the plate that is supposed to close the
           hole cannot go there — and it was quietly eating the warp drive a
           speed build had just traded thrust for. */
        if ((md.c & CAT.REACTOR) || (md.c & CAT.ENGINE)) continue;
        worstPu = md.pu; worst = z;
      }
      if (worst < 0) break;
      var dropped = placements[worst];
      placements.splice(worst, 1);
      tryPlace(grid, placements, P.armor, mods, dropped.col, dropped.row,
               mods[dropped.moduleId].w * mods[dropped.moduleId].h);
      feed(ship, grid, s, placements, mods, P.reactor, rng, clever);
    }

    /* Shedding a 1x2 and patching it with a 1x1 leaves a cell open, so close
       the books on the hull the same way step 8 did. */
    fill(grid, s, 'armor', P.armor, cap, placements, mods, rng, clever);

    return placements;
  }

  return {
    build: build,
    WEAPON_MODES: ['mix', 'ballistic', 'missile', 'laser'],
    ARMOUR_MODES: ['mix', 'shields', 'armour'],
    PRIORITY_MODES: ['mix', 'speed', 'weapons', 'defence'],
    PLACEMENT_MODES: ['clever', 'random']
  };
})();
