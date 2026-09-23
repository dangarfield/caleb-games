/* editor/fit.js — the fitting half of the opponent editor: a hull, a grid and
 * the group -> family -> module drill-down.
 *
 * The interaction is the game's fitting screen, moved onto a mouse. Pick a
 * module in the browser, click the hull to drop it; click a fitted module to
 * select it, click an empty cell to move it, right-click to pull it off. The
 * module is centred on the cursor and clamped to the hull exactly as
 * screens/fitting.js does it, because a 3x3 plate aimed by its top-left corner
 * is unusable with either a finger or a pointer.
 *
 * NOTHING HERE DECIDES LEGALITY. `Geom.canPlace` is asked and its `why` string
 * is what the pill says — the same bargain screens/fitting.js makes. The grid
 * is drawn by ShipView so an opponent's hull looks identical here, in the
 * hangar and on the ladder.
 *
 * The browser is ordinary DOM: this page is a desktop tool, not the canvas-only
 * tablet game, and a <ul> that the browser scrolls for free beats an
 * immediate-mode list nobody has to touch-drag.
 */
var EditorFit = (function () {
  'use strict';

  var MAX_CELL = 34;
  var PAD = 8;

  var cv = null, ctx = null, browserEl = null;
  var onChange = function () {};
  var ship = null, placements = null;

  var level = 0, groupIx = 0, familyIx = 0;
  var selKey = null;          /* module chosen in the browser */
  var selPlace = -1;          /* index into placements, or -1 */
  var hover = { col: -1, row: -1, ok: false, why: '', on: false };
  var L = null, dirty = true, note = '', noteUntil = 0;

  function say(s) { note = s; noteUntil = Date.now() + 2600; dirty = true; }
  function mark() { dirty = true; }

  /* ---- pools, for the auto-fill ----------------------------------------
   * Built once off `subtype`, largest module first, because a big module only
   * fits while the hull is still open. Same idea as tools/make-opponents.js;
   * that packer is the thorough one and it runs under node, this is the
   * one-click "give me something legal to spar against".
   */
  var pools = null;
  function buildPools() {
    if (pools) return pools;
    var all = [], k;
    for (k in Data.modules) if (Data.modules.hasOwnProperty(k)) all.push(Data.modules[k]);
    all.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    function pick(pred) {
      var out = [];
      for (var i = 0; i < all.length; i++) if (pred(all[i])) out.push(all[i]);
      return out;
    }
    pools = {
      drive:   pick(function (m) { return m.subtype === 'engine' && (m.ep || 0) > 0; }),
      engine:  pick(function (m) { return m.subtype === 'engine'; }),
      reactor: pick(function (m) { return m.subtype === 'reactor'; }),
      armor:   pick(function (m) { return m.subtype === 'armor'; }),
      shield:  pick(function (m) { return m.subtype === 'shield'; }),
      ballistic: pick(function (m) { return m.subtype === 'weapon' && m.damageType === 'ballistic'; }),
      missile:   pick(function (m) { return m.subtype === 'weapon' && m.damageType === 'missile'; }),
      laser:     pick(function (m) { return m.subtype === 'weapon' && m.damageType === 'laser'; })
    };
    return pools;
  }

  function tryPlace(grid, list, arr, col, row, maxCells) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (maxCells && m.w * m.h > maxCells) continue;
      if (Geom.canPlace(grid, arr, Data.modules, m.key, col, row, -1).ok) {
        arr.push({ moduleId: m.key, col: col, row: row });
        return m;
      }
    }
    return null;
  }

  /* Fill whatever is still open on `arr`: drives in the engine band, then
     reactors, then guns, then plate. Power is balanced at the end by trading
     the smallest plate for a reactor, which is the only trade that helps. */
  function autofill(sd, arr, weapon) {
    var P = buildPools(), grid = Geom.shipGrid(sd), r, c, occ;
    weapon = P[weapon] ? weapon : 'ballistic';

    for (r = 0; r < grid.h; r++) for (c = 0; c < grid.w; c++) {
      if (!Geom.isEngineCell(grid.cells[r][c])) continue;
      occ = Geom.occupancy(arr, Data.modules);
      if (occ[r * 1000 + c] !== undefined) continue;
      if (!tryPlace(grid, P.drive, arr, c, r)) tryPlace(grid, P.engine, arr, c, r);
    }
    var order = ['reactor', weapon, 'armor'], want = { reactor: 0.22, armor: 1 };
    want[weapon] = 0.45;
    for (var oi = 0; oi < order.length; oi++) {
      var kind = order[oi], budget = Math.round(grid.capacity * (want[kind] || 0.3));
      for (r = 0; r < grid.h; r++) {
        for (c = 0; c < grid.w; c++) {
          if (budget <= 0) break;
          if (grid.cells[r][c] === 0 || Geom.isEngineCell(grid.cells[r][c])) continue;
          occ = Geom.occupancy(arr, Data.modules);
          if (occ[r * 1000 + c] !== undefined) continue;
          var got = tryPlace(grid, P[kind], arr, c, r, budget);
          if (got) budget -= got.w * got.h;
        }
      }
    }
    var tries = 0;
    while (Geom.summarise(sd, arr, Data.modules).power < 0 && tries++ < 60) {
      var worst = -1, worstCells = Infinity;
      for (var q = 0; q < arr.length; q++) {
        var mm = Data.module(arr[q].moduleId);
        if (!mm || mm.subtype !== 'armor') continue;
        if (mm.w * mm.h < worstCells) { worstCells = mm.w * mm.h; worst = q; }
      }
      if (worst < 0) break;
      var slot = arr[worst];
      arr.splice(worst, 1);
      if (!tryPlace(grid, P.reactor, arr, slot.col, slot.row, worstCells)) { arr.push(slot); break; }
    }
    return arr;
  }

  /* A legal-ish fit for a bare hull, for the test-fight panel's sparring
     partner. Returns the {shipId, modules, ai} the sim wants. */
  function quickFit(shipKey, weapon, ai) {
    var sd = Data.ship(shipKey);
    if (!sd) return null;
    return { shipId: shipKey, modules: autofill(sd, [], weapon), ai: ai || 'brawler' };
  }

  /* ---- the grid -------------------------------------------------------- */

  function layout() {
    var w = cv.clientWidth, h = cv.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { x: PAD, y: PAD, w: w - PAD * 2, h: h - PAD * 2, cw: w, ch: h };
  }

  /* True while any fitted module's art is still in flight, so draw() can ask
     to be called again instead of leaving a tinted rectangle on screen. */
  function artPending() {
    for (var i = 0; i < placements.length; i++) {
      var m = Data.module(placements[i].moduleId);
      if (!m || !m.img) continue;
      var im = Data.moduleImg(m);
      if (im && !im.complete) return true;
    }
    return false;
  }

  function draw() {
    if (!ctx) return;
    var box = layout();
    /* The panel can be hidden behind another tab, and a hidden element
       measures zero — drawing a hull into a 0x0 box is all NaN. */
    if (box.cw <= 0 || box.ch <= 0) { dirty = true; return; }
    ctx.clearRect(0, 0, box.cw, box.ch);
    bgGradient(ctx, box.cw, box.ch);

    if (!ship) {
      text(ctx, 'No hull chosen', box.cw / 2, box.ch / 2,
           { font: '18px "Segoe UI",system-ui,sans-serif', fill: T.subtitle,
             align: 'center', baseline: 'middle' });
      L = null;
      return;
    }

    L = ShipView.layout(ship, box, MAX_CELL);
    ShipView.drawHull(ctx, L, {});
    ShipView.drawModules(ctx, L, placements, { selected: selPlace });

    var sel = selKey ? Data.module(selKey) : null;
    if (sel && hover.on && hover.col >= 0) {
      var pr = L.cellRect(hover.col, hover.row, sel.w, sel.h);
      var tone = hover.ok ? '92,232,155' : '231,76,60';
      fillRR(ctx, pr.x, pr.y, pr.w, pr.h, 4, 'rgba(' + tone + ',0.30)');
      strokeRR(ctx, pr.x, pr.y, pr.w, pr.h, 4, 'rgba(' + tone + ',0.95)', 2.5);
      var pill = hover.ok ? ('Place ' + sel.displayName) : hover.why;
      pillText(ctx, pill, pr, box, hover.ok ? T.cat.engine : T.danger);
    }

    if (note && Date.now() < noteUntil) {
      ctx.font = '14px "Segoe UI",system-ui,sans-serif';
      var nw = ctx.measureText(note).width + 30;
      var nx = (box.cw - nw) / 2, ny = box.ch - 40;
      fillRR(ctx, nx, ny, nw, 30, 15, 'rgba(0,0,0,0.7)');
      text(ctx, note, nx + nw / 2, ny + 15,
           { font: '14px "Segoe UI",system-ui,sans-serif', fill: T.subtitle,
             align: 'center', baseline: 'middle' });
    } else if (note) { note = ''; }
  }

  function pillText(c, s, pr, box, fill) {
    c.font = '14px "Segoe UI",system-ui,sans-serif';
    var pw = c.measureText(s).width + 26;
    var px = Math.max(4, Math.min(box.cw - pw - 4, pr.x + pr.w / 2 - pw / 2));
    var py = (pr.y - 34 < 0) ? pr.y + pr.h + 6 : pr.y - 34;
    fillRR(c, px, py, pw, 28, 14, 'rgba(0,0,0,0.75)');
    text(c, s, px + pw / 2, py + 14,
         { font: '14px "Segoe UI",system-ui,sans-serif', fill: fill,
           align: 'center', baseline: 'middle' });
  }

  /* The module is centred under the cursor and clamped onto the hull — the
     same arithmetic screens/fitting.js uses, for the same reason. */
  function aim(m, cell, grid) {
    var col = cell.col - ((m.w - 1) >> 1), row = cell.row - ((m.h - 1) >> 1);
    if (col < 0) col = 0;
    if (row < 0) row = 0;
    if (col + m.w > grid.w) col = grid.w - m.w;
    if (row + m.h > grid.h) row = grid.h - m.h;
    return { col: col, row: row };
  }

  function cellFromEvent(e) {
    if (!L) return null;
    var r = cv.getBoundingClientRect();
    return L.cellAt(e.clientX - r.left, e.clientY - r.top);
  }

  function onMove(e) {
    hover.on = true;
    hover.col = -1;
    var cell = cellFromEvent(e);
    if (cell && selKey) {
      var m = Data.module(selKey), a = aim(m, cell, L.grid);
      var v = Geom.canPlace(L.grid, placements, Data.modules, selKey, a.col, a.row, -1);
      hover.col = a.col; hover.row = a.row; hover.ok = v.ok; hover.why = v.why || '';
    }
    mark();
  }

  function onLeave() { hover.on = false; hover.col = -1; mark(); }

  function onClick(e) {
    var cell = cellFromEvent(e);
    if (!cell) return;
    if (selKey) {
      var m = Data.module(selKey), a = aim(m, cell, L.grid);
      var v = Geom.canPlace(L.grid, placements, Data.modules, selKey, a.col, a.row, -1);
      if (!v.ok) { say(v.why); return; }
      placements.push({ moduleId: selKey, col: a.col, row: a.row });
      selPlace = placements.length - 1;
      changed();
      return;
    }
    var hitIx = Geom.at(placements, Data.modules, cell.col, cell.row);
    if (hitIx >= 0) { selPlace = hitIx; mark(); renderBrowser(); return; }
    /* empty cell with something picked up: a move, checked against the board
       the module is already on (skipIndex) so it does not collide with itself */
    if (selPlace >= 0) {
      var p = placements[selPlace], pm = Data.module(p.moduleId);
      var b = aim(pm, cell, L.grid);
      var mv = Geom.canPlace(L.grid, placements, Data.modules, p.moduleId, b.col, b.row, selPlace);
      if (!mv.ok) { say(mv.why); return; }
      p.col = b.col; p.row = b.row;
      changed();
      return;
    }
    say('Nothing there');
  }

  function onContext(e) {
    e.preventDefault();
    var cell = cellFromEvent(e);
    if (!cell) return;
    var ix = Geom.at(placements, Data.modules, cell.col, cell.row);
    if (ix < 0) { say('Nothing there'); return; }
    removeAt(ix);
  }

  function removeAt(i) {
    if (i < 0 || i >= placements.length) return;
    placements.splice(i, 1);
    selPlace = -1;
    changed();
  }

  function changed() { mark(); renderBrowser(); onChange(); }

  /* ---- the drill-down browser ------------------------------------------ */

  var counts = null;
  function countFamilies() {
    if (counts) return counts;
    counts = {};
    for (var gi = 0; gi < Data.GROUPS.length; gi++) {
      var g = Data.GROUPS[gi], total = 0;
      for (var fi = 0; fi < g.families.length; fi++) {
        var n = Data.family(g.id, g.families[fi].id).length;
        counts[g.id + '/' + g.families[fi].id] = n;
        total += n;
      }
      counts[g.id] = total;
    }
    return counts;
  }

  /* A couple of raw stat keys per module, straight off the baked data. Which
     keys are worth showing is decided by what the module actually carries, so
     nothing here routes on a display name. */
  var STAT_KEYS = [['dmg', 'DMG'], ['rng', 'RNG'], ['sa', 'SHLD'], ['pdr', 'PD'],
                   ['ep', 'THR'], ['pg', 'PWR+'], ['pu', 'PWR-'], ['hlt', 'HP'],
                   ['m', 'MASS']];
  function statBits(m) {
    var out = [], n = 0;
    for (var i = 0; i < STAT_KEYS.length && n < 3; i++) {
      var v = m[STAT_KEYS[i][0]];
      if (!v) continue;
      out.push(STAT_KEYS[i][1] + ' ' + (Math.abs(v % 1) > 0.001 ? v.toFixed(1) : Math.round(v)));
      n++;
    }
    return out.join('   ');
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function renderBrowser() {
    if (!browserEl) return;
    browserEl.innerHTML = '';
    countFamilies();
    var g = Data.GROUPS[groupIx];

    var head = el('div', 'browse-head');
    if (level > 0) {
      var back = el('button', 'btn small', '‹');
      back.onclick = function () { level -= 1; renderBrowser(); };
      head.appendChild(back);
    }
    var trail = 'Modules';
    if (level >= 1) trail = g.label;
    if (level >= 2) trail = g.label + ' › ' + g.families[familyIx].label;
    head.appendChild(el('span', 'crumb', trail));
    browserEl.appendChild(head);

    var list = el('div', 'browse-list'), i;

    if (level === 0) {
      for (i = 0; i < Data.GROUPS.length; i++) tierRow(list, Data.GROUPS[i].label,
        counts[Data.GROUPS[i].id] + ' modules', i, function (ix) { groupIx = ix; level = 1; renderBrowser(); });
    } else if (level === 1) {
      for (i = 0; i < g.families.length; i++) tierRow(list, g.families[i].label,
        counts[g.id + '/' + g.families[i].id] + ' modules', i,
        function (ix) { familyIx = ix; level = 2; renderBrowser(); });
    } else {
      var mods = Data.family(g.id, g.families[familyIx].id);
      for (i = 0; i < mods.length; i++) modRow(list, mods[i]);
    }
    browserEl.appendChild(list);
  }

  function tierRow(list, label, sub, ix, go) {
    var row = el('button', 'tier');
    row.appendChild(el('span', 'tier-label', label));
    row.appendChild(el('span', 'tier-sub', sub));
    row.appendChild(el('span', 'tier-arrow', '›'));
    row.onclick = function () { go(ix); };
    list.appendChild(row);
  }

  function modRow(list, m) {
    var on = (selKey === m.key);
    var row = el('button', 'modrow' + (on ? ' on' : ''));
    var sw = el('span', 'swatch');
    sw.style.background = T.tintForModule(m);
    row.appendChild(sw);
    var body = el('span', 'modbody');
    body.appendChild(el('span', 'modname', m.displayName));
    body.appendChild(el('span', 'modstats', statBits(m)));
    row.appendChild(body);
    row.appendChild(el('span', 'modsize', m.w + '×' + m.h));
    row.title = m.desc || '';
    row.onclick = function () {
      selKey = on ? null : m.key;
      if (selKey) selPlace = -1;
      mark(); renderBrowser(); onChange();
    };
    list.appendChild(row);
  }

  /* ---- public ----------------------------------------------------------- */

  function tick() {
    if (dirty || (ship && artPending())) { dirty = false; draw(); }
    if (note) dirty = true;
    requestAnimationFrame(tick);
  }

  return {
    init: function (opts) {
      cv = opts.canvas;
      ctx = cv.getContext('2d');
      browserEl = opts.browser;
      onChange = opts.onChange || function () {};
      cv.addEventListener('mousemove', onMove);
      cv.addEventListener('mouseleave', onLeave);
      cv.addEventListener('click', onClick);
      cv.addEventListener('contextmenu', onContext);
      window.addEventListener('resize', mark);
      renderBrowser();
      requestAnimationFrame(tick);
    },

    /* Point the editor at an opponent's own arrays — edits land on the roster
       object, and the roster is what gets exported. */
    edit: function (opponent) {
      ship = opponent && opponent.ship.shipId ? Data.ship(opponent.ship.shipId) : null;
      placements = opponent ? opponent.ship.modules : [];
      selPlace = -1; hover.col = -1; note = '';
      mark(); renderBrowser();
    },

    clear: function () {
      if (!placements) return;
      placements.length = 0;
      selPlace = -1;
      changed();
      say('Grid cleared');
    },
    removeSelected: function () { removeAt(selPlace); },
    selectedPlacement: function () { return selPlace; },
    selectedModule: function () {
      if (selKey) return Data.module(selKey);
      if (selPlace >= 0 && placements[selPlace]) return Data.module(placements[selPlace].moduleId);
      return null;
    },
    autofillCurrent: function (weapon) {
      if (!ship) { say('Pick a hull first'); return; }
      autofill(ship, placements, weapon);
      changed();
      say('Auto-filled the open cells');
    },
    autofill: autofill,
    quickFit: quickFit,
    say: say,
    refresh: mark
  };
})();
