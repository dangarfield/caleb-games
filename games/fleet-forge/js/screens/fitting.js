/* screens/fitting.js — fitting modules onto a hull, by hand.
 *
 * WHY THIS FILE EXISTS
 * A fit is a spatial thing, so the screen is direct manipulation: you pick a
 * module up and you put it down. The screen this replaces was tap-select then
 * tap-place, and nothing already on the hull could ever be moved — you deleted
 * it and placed it again, so nudging one plate sideways on a 27-row battleship
 * was a delete, a re-select and a re-aim. Here everything is dragged: a module
 * on the hull, or a card in the browser. Tap-select-then-tap is kept alongside
 * it, because six identical armour plates in a row is six taps and only two of
 * them should ever have to be a gesture.
 *
 * NOTHING IN HERE DECIDES LEGALITY. `Geom.canPlace` is asked and whatever it
 * answers is what the screen draws, including its `why` string; `Geom.validate`
 * is the only thing that says a fit is flyable. The old build had three
 * validators that disagreed — one of them read `m.width || 1` off a placement that
 * never carries `width` — and that is the afterburner-won't-fit bug. There is no
 * second check in this file, not even a cheap early-out, because a cheap
 * early-out is a second validator. Moving a module asks that same one function
 * with `skipIndex` set to the module's own index, so it is tested against the
 * board it is already standing on rather than against itself.
 *
 * THE BROWSER IS A STACK, NOT A DRILL-DOWN
 * Bottom to top: the three groups, then the chosen group's families, then the
 * modules filling everything above. All three levels are on screen at once, so
 * changing family is one tap instead of two taps up and two back down, and
 * there is no chevron and no remembered position to get wrong.
 *
 * WHY A WORKING COPY
 * `placements` is this screen's own array of {moduleId,col,row} and nothing
 * else. `Save.setLayout` is handed a fresh copy and is the only way anything
 * reaches the store — the old build mutated the saved array in place, so
 * backing out of fitting still changed the ship.
 *
 * FRAME BUDGET
 * The target is a low-power tablet. draw() never calls `Data.family()`: the
 * card list is rebuilt only when the group or family selection changes.
 * `Geom.canPlace` allocates an occupancy map, so it is asked once per
 * (module, cell, board) and the answer cached; `Geom.validate` once per edit;
 * `ShipView.layout` once per zoom or pan. Rectangles handed to widgets come
 * out of fixed objects and a small scratch pool, not out of a literal per row.
 */
function FittingScreen(shipKey, layoutIndex) {

  /* ---- 1b, at 1333x690 -------------------------------------------------
     The handoff's fitting bay: a 58px bar over `244px | 1fr | 216px`. The bar
     reserves 140px on the left for the arcade's own "< Games" button, which is
     also why nothing of ours may enter the top-left 160x54 box.

     The centre is the one place this screen does NOT follow the design. The
     handoff draws a dashed slot grid and a striped hull placeholder and says so
     itself — "the slot editor is intentionally unfinished". Ours is finished:
     it is the real hull, the real modules, drag and drop, pinch zoom. So the
     centre keeps its own behaviour inside the design's box. */
  var BAR_H = 58, BAR_L = 140;
  var BAR_R = App.RIGHT_INSET;                 /* keep clear of the mute button */
  var BODY_Y = BAR_H, BODY_H = VH - BAR_H;
  var BAY_W = 244, BUD_W = 216;
  var BUD_X = VW - BUD_W, CENTRE_X = BAY_W, CENTRE_W = VW - BAY_W - BUD_W;

  var BAY = { x: 10, y: BODY_Y + 9, w: BAY_W - 20, h: BODY_H - 18 };
  var BUD = { x: BUD_X + 1 + 11, y: BODY_Y + 9, w: BUD_W - 1 - 22, h: BODY_H - 18 };

  /* bay rows, top down: header, the three groups, the family tabs, the list */
  var BAY_HEAD_H = 14, GROUP_H = 25, FAM_H = 25;
  var GROUPROW = { x: BAY.x, y: BAY.y + BAY_HEAD_H + 6, w: BAY.w, h: GROUP_H };
  var FAMROW   = { x: BAY.x, y: GROUPROW.y + GROUP_H + 6, w: BAY.w, h: FAM_H };
  var LISTR    = { x: BAY.x, y: FAMROW.y + FAM_H + 6,
                   w: BAY.w, h: BAY.y + BAY.h - (FAMROW.y + FAM_H + 6) };

  /* the editor: the design's dashed well is `inset: 16px` of the centre cell */
  var WELL     = { x: CENTRE_X + 16, y: BODY_Y + 16, w: CENTRE_W - 32, h: BODY_H - 32 };

  /* The MODULE STATS card, the handoff's "Editor corner" one: 216 wide, ten in
     from the well's own corner. Declared up here with the rest of the layout
     because everything below the screen's `return` is a function declaration —
     a `var` down there hoists but never runs, which is a quiet undefined at
     the first draw rather than an error anywhere near the cause. */
  var STATS    = { w: 216, pad: 10, dx: 10, dy: 10 };

  /* THE CARD GETS OUT OF THE WAY. It is pinned to the well's top-left corner,
     which is also where the left column of a hull sits once the view is zoomed
     — so on a big ship you end up dragging a module underneath it and dropping
     blind. It slides to the bottom-left corner of the same well while anything
     is happening under it, and comes back when the corner is clear again.
     DODGE_IN is the margin that counts as "under it"; DODGE_OUT is wider, so
     leaving does not immediately re-trigger entering; and the hold keeps it
     away long enough that a drag skirting the edge does not make it bounce. */
  var DODGE_IN = 12, DODGE_OUT = 44, DODGE_HOLD = 0.4, DODGE_RATE = 0.22;
  var dodgeK = 0, dodgeWant = 0, dodgeHold = 0;

  /* The hull gets the WHOLE well and sits dead centre in it. An earlier version
     reserved a lane on the left for the strip target and pushed the ship off
     centre to make room; the design says otherwise — the target is absolutely
     positioned over the left of the slot grid and the ship does not move for
     it. So the target is an overlay, drawn only mid-drag, and its hit area is
     the drawn circle rather than a full-height strip, which is what keeps it
     from swallowing drops meant for the cells underneath. */
  var GRIDBOX  = { x: WELL.x + 12, y: WELL.y + 12, w: WELL.w - 24, h: WELL.h - 46 };
  var DELZ     = { x: WELL.x + 34, y: BODY_Y + BODY_H / 2 - 46, w: 92, h: 92 };

  var CARD_H = 44, CARD_STEP = 50;
  /* The design's editor well is far bigger than its hull placeholder, and a
     3x5 fighter at 34px a cell is lost in it. The cap only ever binds on SMALL
     hulls — a 27-row battleship is limited by the box long before this. */
  var MAX_CELL = 64, ZMIN = 1, ZMAX = 4;
  var DRAG_SLOP = 14;

  /* Fixed rects reused inside one draw call — nothing allocated per row. */
  var SC = [];
  var i0;
  for (i0 = 0; i0 < 8; i0++) SC.push({ x: 0, y: 0, w: 0, h: 0 });
  var CARD_R = { x: 0, y: 0, w: 0, h: 0 };
  var BAR_BTN = [];
  for (i0 = 0; i0 < 6; i0++) BAR_BTN.push({ x: 0, y: 0, w: 0, h: 0 });
  var FIT_CELL = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 },
                  { x: 0, y: 0, w: 0, h: 0 }];
  /* Where the COPY menu hangs, filled in as the bar is drawn so the menu can be
     hit-tested before everything else and painted after it. */
  var copyOpen = false, COPY_MENU = { x: 0, y: 0, w: 0, h: 0 }, copyTo = -1;
  var COPY_ROW = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  var COPY_BTN = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];

  /* AUTOFIT. `armed` is the second press the design asks for: applying strips
     the fit and rebuilds it, which is not something to do on a stray tap. */
  var autoOpen = false, autoArmed = false;
  var AUTO_MENU = { x: 0, y: 0, w: 0, h: 0 };
  var AUTO_SEG = [], AUTO_BTN = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  for (i0 = 0; i0 < 12; i0++) AUTO_SEG.push({ x: 0, y: 0, w: 0, h: 0 });
  var auto = { weapons: 'mix', armour: 'mix', priority: 'mix' };
  var AUTO_GROUPS = [
    { key: 'weapons',  label: 'Weapons',  opts: ['mix', 'ballistic', 'missile', 'laser'] },
    { key: 'armour',   label: 'Armour',   opts: ['mix', 'shields', 'armour'],
      text: { mix: 'Mix', shields: 'Mostly shields', armour: 'Mostly armour' } },
    { key: 'priority', label: 'Priority', opts: ['mix', 'speed', 'weapons', 'defence'] }
  ];

  /* ---- state ----------------------------------------------------------- */
  var ship = null, grid = null;
  var placements = [];            /* the working copy; {moduleId,col,row}     */
  var dirty = false;
  var stamp = 0;                  /* bumped on every edit; busts the caches   */

  var groupIx = 0, familyIx = 0;
  var rows = [], rowsKey = '';
  var scroll = {}, gHS = { x: 0 }, fHS = { x: 0 };
  var listRect = LISTR;
  var listGrabY = 0;

  var selKey = null;              /* module chosen in the browser             */
  var selPlace = -1;              /* index into placements, or -1             */

  var stats = null, errors = null, statsDirty = true;
  var msg = null, msgT = 0;
  var hasHover = false;           /* a mouse is present, so hover is real     */

  /* zoom / pan of the hull, applied by rebuilding the ShipView layout */
  var zoom = 1, panX = 0, panY = 0, baseCs = 1, L = null, viewDirty = true;

  /* the one cached answer from the one validator */
  var chkKey = '', chkOk = false, chkWhy = '';

  /* the drag machine */
  var drag = {
    mode: 'none',                 /* none | pendGrid | pendList | drag | pan  */
    src: '',                      /* grid | list                              */
    moduleId: '', from: -1,       /* from = index in placements, or -1        */
    offC: 0, offR: 0,             /* where in the module the finger grabbed   */
    homeCol: 0, homeRow: 0,       /* where it came from, for the return trip  */
    col: -1, row: -1, ok: false, why: '', over: false
  };

  function say(s) { msg = s; msgT = 3.4; }
  /* Is this point under an open menu? The menus are drawn last and hit-tested
     first; everything else has to stay out of their way. */
  function overMenu(x, y) {
    return (copyOpen && App.inRect(x, y, COPY_MENU)) ||
           (autoOpen && App.inRect(x, y, AUTO_MENU));
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---- stat lines -------------------------------------------------------
   * Two or three numbers that actually matter for the subtype. Routed on
   * `subtype`, never on an English name — that is what the copy step derives
   * it for.
   */
  function num(v) {
    if (v === undefined || v === null) return '0';
    return (Math.abs(v % 1) > 0.001) ? v.toFixed(1) : String(Math.round(v));
  }

  /* The row's second line: the two stats that matter most for that kind of
     module, then the power draw — off `ModStats`, which is the same table the
     MODULE STATS card shows. Two places reading one table, so the row can
     never claim a number the card does not. */
  function statLine(m) { return ModStats.brief(m); }


  /* Built once per group/family change, never in draw(). Each row carries
     everything a card needs, so the per-frame path is pure drawing. */
  function buildRows() {
    var g = Data.GROUPS[groupIx], f = g.families[familyIx];
    var key = g.id + '/' + f.id;
    if (rowsKey === key) return;
    var list = Data.family(g.id, f.id);
    rows = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      rows.push({
        m: m, key: m.key, name: m.displayName, size: m.width + '\u00d7' + m.height,
        code: initials(m.displayName), line: statLine(m),
        parts: ModStats.briefParts(m), tint: T.tintForModule(m)
      });
    }
    rowsKey = key;
    scroll.y = 0; scroll.v = 0;
  }

  /* How many modules a family holds, for the chip subtitles. Walks the module
     list, so it is counted once at enter and never again. */
  var counts = {};
  function countFamilies() {
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
  }

  function groupLabel(i) { return Data.GROUPS[i].label; }
  function famLabel(i)   { return Data.GROUPS[groupIx].families[i].label; }

  /* ---- the hull's view ---------------------------------------------------
   * ShipView owns the grid maths. Zoom and pan are expressed as the box handed
   * to it: a box exactly grid-sized at the zoomed cell size, offset by the pan,
   * with maxCell pinned to that same cell size. The layout that comes back has
   * the cellAt/cellRect the rest of the screen uses, so there is one hit-test
   * and it is ShipView's.
   */
  function rebuildView() {
    var cs = baseCs * zoom;
    var w = grid.w * cs, h = grid.h * cs;
    L = ShipView.layout(ship,
      { x: GRIDBOX.x + (GRIDBOX.w - w) / 2 + panX,
        y: GRIDBOX.y + (GRIDBOX.h - h) / 2 + panY, w: w, h: h }, cs);
    viewDirty = false;
  }

  function clampPan() {
    var cs = baseCs * zoom;
    var ox = Math.max(0, (grid.w * cs - GRIDBOX.w) / 2);
    var oy = Math.max(0, (grid.h * cs - GRIDBOX.h) / 2);
    panX = clamp(panX, -ox, ox);
    panY = clamp(panY, -oy, oy);
  }

  /* Scale by `k` about a stage point, so the cell under the fingers stays
     under the fingers. */
  function zoomAbout(k, px, py) {
    var z1 = clamp(zoom * k, ZMIN, ZMAX);
    if (z1 === zoom) return;
    var cs0 = baseCs * zoom, cs1 = baseCs * z1;
    var x0 = GRIDBOX.x + (GRIDBOX.w - grid.w * cs0) / 2 + panX;
    var y0 = GRIDBOX.y + (GRIDBOX.h - grid.h * cs0) / 2 + panY;
    var u = (px - x0) / cs0, v = (py - y0) / cs0;
    panX = (px - u * cs1) - GRIDBOX.x - (GRIDBOX.w - grid.w * cs1) / 2;
    panY = (py - v * cs1) - GRIDBOX.y - (GRIDBOX.h - grid.h * cs1) / 2;
    zoom = z1;
    clampPan();
    viewDirty = true;
  }

  function resetView() { zoom = 1; panX = 0; panY = 0; viewDirty = true; }

  /* ---- the one legality question ---------------------------------------
   * Cached on (module, cell, skipIndex, board) so a finger held still over one
   * cell asks Geom.canPlace once, not sixty times a second. `stamp` is the
   * board: it changes on every edit, so the cache can never answer stale.
   */
  function checkCell(moduleId, col, row, skip) {
    var k = moduleId + '|' + col + '|' + row + '|' + skip + '|' + stamp;
    if (k === chkKey) return chkOk;
    chkKey = k;
    var v = Geom.canPlace(grid, placements, Data.modules, moduleId, col, row, skip);
    chkOk = v.ok; chkWhy = v.why || '';
    return chkOk;
  }

  function edited() { stamp++; statsDirty = true; dirty = true; chkKey = ''; }

  function place(col, row, moduleId) {
    var v = Geom.canPlace(grid, placements, Data.modules, moduleId, col, row, -1);
    if (!v.ok) { say(v.why); return false; }
    placements.push({ moduleId: moduleId, col: col, row: row });
    edited();
    return true;
  }

  function removeAt(i) {
    if (i < 0 || i >= placements.length) return;
    placements.splice(i, 1);
    selPlace = -1;
    edited();
  }

  function selectedModule() {
    if (selKey) return Data.module(selKey);
    if (selPlace >= 0 && placements[selPlace]) return Data.module(placements[selPlace].moduleId);
    return null;
  }

  /* ---- layouts ---------------------------------------------------------- */
  function snapshot() {
    var out = [];
    for (var i = 0; i < placements.length; i++)
      out.push({ moduleId: placements[i].moduleId, col: placements[i].col, row: placements[i].row });
    return out;
  }

  function commit() {
    var cur = Save.layout(shipKey, layoutIndex);
    var ok = Save.setLayout(shipKey, layoutIndex,
                            { name: (cur && cur.name) || '', modules: snapshot() });
    if (ok) dirty = false; else say('That fit could not be saved — storage is not answering');
    return ok;
  }

  /* An untouched empty slot stays empty — committing it would turn "Empty"
     into a real but module-less layout the moment you glanced at it. */
  function commitIfWorthIt() {
    if (dirty || Save.layout(shipKey, layoutIndex)) commit();
  }

  function loadLayout(i) {
    layoutIndex = i;
    placements = [];
    var l = Save.layout(shipKey, i);
    if (l && l.modules) {
      for (var j = 0; j < l.modules.length; j++) {
        var p = l.modules[j];
        if (Data.module(p.moduleId)) placements.push({ moduleId: p.moduleId, col: p.col, row: p.row });
      }
    }
    dirty = false; selPlace = -1; cancelDrag();
    stamp++; statsDirty = true; chkKey = '';
  }

  /* ---- the drag machine --------------------------------------------------
   * pendGrid  finger is down on a fitted module; a tap still selects it
   * pendList  finger is down on a browser card; a vertical flick still scrolls
   * drag      something is in the air and follows the finger
   * pan       finger is down on bare hull; drags the view when zoomed in
   * A drag ends exactly one way: the drop is legal and it lands, or it is not
   * and the module goes back where it was. There is no third outcome, which is
   * why a grid drag never removes the placement up front — it stays in the
   * array, hidden from the hull, and `skipIndex` keeps it out of its own way.
   */
  function cancelDrag() {
    drag.mode = 'none'; drag.src = ''; drag.from = -1; drag.moduleId = '';
    drag.col = -1; drag.over = false;
  }

  function cardAt(px, py) {
    if (!App.inRect(px, py, listRect)) return -1;
    var i = Math.floor((py - listRect.y + scroll.y) / CARD_STEP);
    if (i < 0 || i >= rows.length) return -1;
    if (py - listRect.y + scroll.y - i * CARD_STEP > CARD_H) return -1;
    return i;
  }

  function beginDown(p) {
    var c;
    if (App.inRect(p.downX, p.downY, GRIDBOX)) {
      c = L.cellAt(p.downX, p.downY);
      var ix = c ? Geom.at(placements, Data.modules, c.col, c.row) : -1;
      if (ix >= 0) {
        var pl = placements[ix];
        drag.mode = 'pendGrid'; drag.src = 'grid';
        drag.from = ix; drag.moduleId = pl.moduleId;
        drag.offC = c.col - pl.col; drag.offR = c.row - pl.row;
        drag.homeCol = pl.col; drag.homeRow = pl.row;
      } else {
        drag.mode = 'pan'; drag.src = '';
      }
      return;
    }
    if (App.inRect(p.downX, p.downY, listRect)) {
      var ci = cardAt(p.downX, p.downY);
      listGrabY = scroll.y;
      if (ci >= 0) {
        drag.mode = 'pendList'; drag.src = 'list';
        drag.from = -1; drag.moduleId = rows[ci].key;
        var m = rows[ci].m;
        drag.offC = (m.width - 1) >> 1; drag.offR = (m.height - 1) >> 1;
      }
    }
  }

  function promote(p) {
    if (drag.mode === 'pendGrid') {
      if (p.dragged) { drag.mode = 'drag'; selPlace = -1; }
      return;
    }
    if (drag.mode === 'pendList') {
      var dx = p.x - p.downX, dy = p.y - p.downY;
      /* Sideways out of the list is a drag; up and down is the list scrolling.
         Leaving the bay altogether is a drag whatever the angle — and the bay
         is on the LEFT now, so "out" means to the right of it. */
      if (p.x > listRect.x + listRect.w || (Math.abs(dx) > DRAG_SLOP && Math.abs(dx) > Math.abs(dy))) {
        drag.mode = 'drag';
        scroll.y = listGrabY; scroll.v = 0; scroll.grab = false;
      } else if (Math.abs(dy) > DRAG_SLOP) {
        drag.mode = 'none';                 /* the list keeps it */
      }
    }
  }

  /* Where the thing in the air would land, and whether it may. */
  function aim(p) {
    drag.over = App.inRect(p.x, p.y, DELZ);
    drag.col = -1;
    if (drag.over || !App.inRect(p.x, p.y, GRIDBOX)) return;
    var c = L.cellAt(p.x, p.y);
    if (!c) return;
    var m = Data.module(drag.moduleId);
    if (!m) return;
    var col = clamp(c.col - drag.offC, 0, grid.w - m.width);
    var row = clamp(c.row - drag.offR, 0, grid.h - m.height);
    drag.col = col; drag.row = row;
    drag.ok = checkCell(drag.moduleId, col, row, drag.from);
    drag.why = chkWhy;
  }

  function drop() {
    if (drag.over) {
      if (drag.src === 'grid') { removeAt(drag.from); Sfx.play('strip'); say('Module removed from the hull'); }
      else { Sfx.play('deny'); say('There was nothing on that cell to remove'); }
      cancelDrag(); return;
    }
    if (drag.col < 0) { Sfx.play('back'); say(drag.src === 'grid' ? 'Dropped off the hull — put back where it was'
                              : 'Dropped off the hull — nothing was fitted'); cancelDrag(); return; }
    if (!drag.ok) { Sfx.play('deny'); say(drag.why || 'It will not go there — put back where it was'); cancelDrag(); return; }
    if (drag.src === 'grid') {
      var pl = placements[drag.from];
      if (pl) { pl.col = drag.col; pl.row = drag.row; edited(); }
    } else {
      placements.push({ moduleId: drag.moduleId, col: drag.col, row: drag.row });
      edited();
    }
    Sfx.play('place');
    cancelDrag();
  }

  /* A tap on the hull. With a card selected that is a placement, legal or not —
     an illegal one says why rather than doing nothing. With nothing selected it
     picks up whatever is under the finger. */
  function gridTap(p) {
    var c = L.cellAt(p.upX, p.upY);
    if (!c) return;
    if (selKey) {
      var m = Data.module(selKey);
      if (!m) return;
      place(clamp(c.col - ((m.width - 1) >> 1), 0, grid.w - m.width),
            clamp(c.row - ((m.height - 1) >> 1), 0, grid.h - m.height), selKey);
      return;                                /* selection is kept, on purpose */
    }
    var ix = Geom.at(placements, Data.modules, c.col, c.row);
    selPlace = ix;
    if (ix < 0) say('Nothing is fitted on that cell');
  }

  /* ---- drawing ---------------------------------------------------------- */
  /* ---- the fitting budget (216px) -------------------------------------
     The design's right rail: Power, then a second neutral budget, then the
     weapon mix, a rule, four derived numbers, an advisory, and TEST.

     Its second bar is CPU. This game has no CPU — Space Arena's budgets are
     power and the grid itself — so the neutral bar is CELLS, which is the
     constraint a player actually runs into. Same role, same colour, true. */
  function budgetBar(ctx, y, label, labelTint, value, valueTint, frac, fill) {
    text(ctx, label, BUD.x, y + 7,
         { font: T.head(12), fill: labelTint, baseline: 'middle', track: 1.6 });
    text(ctx, value, BUD.x + BUD.w, y + 7,
         { font: T.mono(12), fill: valueTint, align: 'right', baseline: 'middle' });
    fillRR(ctx, BUD.x, y + 19, BUD.w, 7, 2, T.track);
    if (frac > 0) {
      fillRR(ctx, BUD.x, y + 19, Math.max(2, BUD.w * Math.min(1, frac)), 7, 2, fill);
    }
    return y + 26 + 6;
  }

  function kfm(n) {
    n = Math.round(n || 0);
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  function drawBudget(ctx) {
    ctx.fillStyle = 'rgba(6,11,15,0.8)';
    ctx.fillRect(BUD_X, BODY_Y, BUD_W, BODY_H);
    ctx.fillStyle = T.rule;
    ctx.fillRect(BUD_X, BODY_Y, 1, BODY_H);

    if (!stats) return;                  /* first frame, before update() ran */
    var s2 = stats, y = BUD.y;
    text(ctx, 'FITTING BUDGET', BUD.x, y + 6.5,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });
    y += 13 + 6;

    var over = s2.power < 0;
    y = budgetBar(ctx, y, 'POWER', T.cat.reactor,
                  Math.round(s2.powerUse) + ' / ' + Math.round(s2.powerGen),
                  over ? T.warn : T.ink,
                  s2.powerGen > 0 ? s2.powerUse / s2.powerGen : (s2.powerUse > 0 ? 1 : 0),
                  over ? T.warn : T.cat.reactor);

    var full = s2.cellsUsed > s2.capacity;
    y = budgetBar(ctx, y, 'CELLS', '#A9BDC8',
                  s2.cellsUsed + ' / ' + s2.capacity, full ? T.warn : T.ink,
                  s2.capacity > 0 ? s2.cellsUsed / s2.capacity : 0,
                  full ? T.warn : '#A9BDC8');

    /* weapon mix */
    text(ctx, 'WEAPON MIX', BUD.x, y + 7,
         { font: T.head(12), fill: '#8FA3B0', baseline: 'middle', track: 1.6 });
    var mix = s2.mix, tot = mix.ballistic + mix.missile + mix.laser;
    fillRR(ctx, BUD.x, y + 19, BUD.w, 7, 2, T.track);
    if (tot > 0) {
      ctx.save();
      rr(ctx, BUD.x, y + 19, BUD.w, 7, 2); ctx.clip();
      var cx2 = BUD.x, parts = [['ballistic', T.cat.ballistic], ['missile', T.cat.missile],
                                ['laser', T.cat.laser]];
      for (var pi = 0; pi < 3; pi++) {
        var seg = BUD.w * mix[parts[pi][0]] / tot;
        ctx.fillStyle = parts[pi][1]; ctx.fillRect(cx2, y + 19, seg, 7);
        cx2 += seg;
      }
      ctx.restore();
    }
    var pc = function (n) { return tot ? Math.round(100 * n / tot) : 0; };
    text(ctx, tot ? ('BAL ' + pc(mix.ballistic) + '% · MSL ' + pc(mix.missile) +
                     '% · LAS ' + pc(mix.laser) + '%') : 'NO WEAPONS FITTED',
         BUD.x, y + 33, { font: T.mono(9.5), fill: '#8FA3B0', baseline: 'middle' });
    y += 41 + 6;

    ctx.fillStyle = T.rule;
    ctx.fillRect(BUD.x, y, BUD.w, 1);
    y += 1 + 6;

    /* four derived numbers. The design lists EHP / DPS / SPEED / LOCK; this
       game has no lock time, and thrust is what stands in for speed. */
    var lines = [['EHP', kfm(s2.ehp)], ['DPS', String(Math.round(s2.dps))],
                 ['THRUST', kfm(s2.thrust)], ['GUNS', String(s2.weapons)]];
    for (var li = 0; li < lines.length; li++) {
      text(ctx, lines[li][0], BUD.x, y + 7,
           { font: T.mono(12), fill: T.muted, baseline: 'middle' });
      text(ctx, lines[li][1], BUD.x + BUD.w, y + 7,
           { font: T.mono(12), fill: T.ink, align: 'right', baseline: 'middle' });
      y += 15 + 4;
    }
    y += 2;

    /* the advisory: whatever the one validator says, verbatim */
    var ok = !errors || !errors.length;
    var noteTint = ok ? T.ready : T.warn;
    var noteText = ok ? 'Flight ready. Nothing is over budget.' : errors.join('. ') + '.';
    var nh = 40;
    fillRR(ctx, BUD.x, y, BUD.w, nh, 4, ok ? 'rgba(79,191,127,0.07)' : 'rgba(232,163,61,0.07)');
    strokeRR(ctx, BUD.x, y, BUD.w, nh, 4, ok ? 'rgba(79,191,127,0.4)' : 'rgba(232,163,61,0.45)', 1);
    ctx.save();
    ctx.translate(BUD.x + 11, y + 11); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = noteTint; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
    wrapLines(ctx, noteText, BUD.x + 21, y + 11, BUD.w - 28, 14,
              { font: T.body(11.5), fill: noteTint, baseline: 'middle' }, 2);

    /* TEST, pinned to the foot */
    var tr = { x: BUD.x, y: BUD.y + BUD.h - 40, w: BUD.w, h: 40 };
    fillRR(ctx, tr.x, tr.y, tr.w, tr.h, 5, 'rgba(56,197,216,0.14)');
    strokeRR(ctx, tr.x, tr.y, tr.w, tr.h, 5, T.accent, 1);
    text(ctx, 'TEST', tr.x + tr.w / 2, tr.y + tr.h / 2,
         { font: T.head(14, 700), fill: T.accent, align: 'center',
           baseline: 'middle', track: 2.4 });
    if (UI.zone(tr, 'launch')) testFit();
  }

  /* Canvas has no wrapping; the advisory is the one place here that needs it. */
  function wrapLines(ctx, str, x, y, maxW, lh, opts, maxLines) {
    ctx.font = opts.font;
    var words = str.split(' '), line = '', out = [], i;
    for (i = 0; i < words.length; i++) {
      var probe = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(probe).width > maxW && line) { out.push(line); line = words[i]; }
      else line = probe;
      if (out.length >= maxLines) break;
    }
    if (line && out.length < maxLines) out.push(line);
    for (i = 0; i < out.length; i++) {
      text(ctx, fitText(ctx, out[i], maxW, opts.font), x, y + i * lh, opts);
    }
  }

  /* TEST: fly this fit against a real contact from your tier, without it
     counting. A fit you can try is a fit you can reason about. */
  function testFit() {
    var v = Geom.validate(ship, placements, Data.modules);
    if (!v.ok) { say(v.errors[0]); return; }
    var opp = Opponents.draw(ship);
    if (!opp) { say('No contacts at your tier to test against'); return; }
    App.push(BattleScreen({
      playerFit: { shipId: shipKey, modules: placements.slice() },
      enemyFit: Opponents.fitFor(opp),
      opponent: opp,
      fitIndex: layoutIndex,
      onDone: function (r) {
        App.pop();
        say(!r ? 'Test abandoned'
               : (r.won ? 'Test flight: beat ' + opp.name
                        : 'Test flight: ' + opp.name + ' won'));
      }
    }));
  }

  /* Art if there is any, the category tint if there is not. Aspect is the
     module's own w:h so a 1x5 railgun does not render as a square. */
  function drawArt(ctx, m, bx, by, bw, bh, tint, alpha) {
    var ar = m.width / m.height, aw = bw, ah = bh;
    if (ar > 1) ah = bh / ar; else aw = bw * ar;
    var ax = bx + (bw - aw) / 2, ay = by + (bh - ah) / 2;
    var rad = Math.min(6, aw / 4, ah / 4);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    fillRR(ctx, ax, ay, aw, ah, rad, tint + '2e');
    var im = Data.moduleImg(m);
    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      rr(ctx, ax, ay, aw, ah, rad); ctx.clip();
      drawContain(ctx, im, ax, ay, aw, ah);
      ctx.restore();
    }
    strokeRR(ctx, ax, ay, aw, ah, rad, tint + 'aa', 1.2);
    drawVariant(ctx, m, ax, ay, aw, ah);
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }

  /* One module row, the design's: a 34px code tile carrying a family stripe,
     the name, a mono stat line, and the FOOTPRINT on the right — not a stock
     count, because nothing in this game is consumed. */
  function drawCard(ctx, row, x, y, w, h, on, hot) {
    var tint = row.tint;
    if (on) {
      fillRR(ctx, x, y, w, h, 5, tint + '1f');
      strokeRR(ctx, x, y, w, h, 5, tint + '80', 1);
    } else {
      if (hot) fillRR(ctx, x, y, w, h, 5, 'rgba(255,255,255,0.05)');
      strokeRR(ctx, x, y, w, h, 5, T.edge, 1);
    }

    /* the tile: the module's own art when there is any, its code when not */
    var tx = x + 5, ty = y + (h - 34) / 2;
    fillRR(ctx, tx, ty, 34, 34, 4, tint + '14');
    var im = Data.moduleImg(row.m);
    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      rr(ctx, tx + 1, ty + 1, 32, 32, 3); ctx.clip();
      ctx.globalAlpha = 0.9;
      drawContain(ctx, im, tx + 1, ty + 1, 32, 32);
      ctx.restore();
    } else {
      text(ctx, row.code, tx + 17, ty + 17,
           { font: T.mono(12, 600), fill: on ? '#F0F7FA' : tint,
             align: 'center', baseline: 'middle' });
    }
    drawVariant(ctx, row.m, tx, ty, 34, 34);
    strokeRR(ctx, tx, ty, 34, 34, 4, tint + '66', 1);
    ctx.fillStyle = tint;                      /* the family stripe */
    ctx.fillRect(tx, ty, 12, 3);

    ctx.font = T.mono(10);
    var fw = ctx.measureText(row.size).width;
    var nx = tx + 34 + 8, nw = x + w - 5 - fw - 8 - nx;
    /* THE NAME, AND WHICH VERSION OF IT. Twenty-eight modules are Black Market
       reworks that keep the base module's name, so the bay lists two Chainguns
       and two Railguns at different numbers. The tag goes after the name in the
       accent, and the name is measured against the room the tag leaves — not
       the other way round, or a long name would push the tag off the card and
       the two rows would look identical again. */
    var vfont = T.mono(10, 600), vtag = modVariant(row.m), vw2 = 0;
    if (vtag) { ctx.font = vfont; vw2 = ctx.measureText(vtag).width + 5; }
    var nfont = T.body(13, on ? 600 : 500), ny = y + h / 2 - 8;
    var shown = fitText(ctx, row.name, nw - vw2, nfont);
    text(ctx, shown, nx, ny,
         { font: nfont, fill: on ? '#F0F7FA' : T.ink, baseline: 'middle' });
    if (vtag) {
      ctx.font = nfont;
      text(ctx, vtag, nx + ctx.measureText(shown).width + 5, ny,
           { font: vfont, fill: T.accent, baseline: 'middle' });
    }
    /* two stats left, the power draw right — see `ModStats.briefParts` */
    var sy = y + h / 2 + 8;
    ctx.font = T.mono(9.5);
    var pw = row.parts.pwr ? ctx.measureText(row.parts.pwr).width : 0;
    text(ctx, fitText(ctx, row.parts.left, nw - pw - 8, T.mono(9.5)), nx, sy,
         { font: T.mono(9.5), fill: T.muted, baseline: 'middle' });
    if (row.parts.pwr) {
      text(ctx, row.parts.pwr, nx + nw, sy,
           { font: T.mono(9.5), fill: T.muted, align: 'right', baseline: 'middle' });
    }
    text(ctx, row.size, x + w - 5, y + h / 2,
         { font: T.mono(10), fill: '#A9BDC8', align: 'right', baseline: 'middle' });
  }

  /* WEP / DEF / UTIL — three equal tabs, the chosen one filled with its own
     family colour. Returns the index tapped, or -1. */
  function drawGroupRow(ctx, r, activeIx) {
    var n = Data.GROUPS.length, gap = 4, cw = (r.w - gap * (n - 1)) / n, picked = -1;
    for (var i = 0; i < n && i < SC.length; i++) {
      var cr = SC[i];
      cr.x = r.x + i * (cw + gap); cr.y = r.y; cr.w = cw; cr.h = r.h;
      var fam = GROUP_FAM[Data.GROUPS[i].id] || 'utility';
      var tint = T.fam[fam];
      var on = i === activeIx;
      if (on) fillRR(ctx, cr.x, cr.y, cr.w, cr.h, 3, tint);
      else strokeRR(ctx, cr.x, cr.y, cr.w, cr.h, 3, tint + '66', 1);
      text(ctx, GROUP_TAB[Data.GROUPS[i].id] || Data.GROUPS[i].label.toUpperCase(),
           cr.x + cr.w / 2, cr.y + cr.h / 2,
           { font: T.head(12, on ? 700 : 600),
             fill: on ? '#140708' : GROUP_INK[Data.GROUPS[i].id] || tint,
             align: 'center', baseline: 'middle', track: 1.6 });
      if (UI.zone(cr, 'toggle')) picked = i;
    }
    return picked;
  }

  /* The chosen group's families as three equal buttons filling the bay's
     width — the design's, and a good deal easier to hit than the underlined
     words that were here before. Each carries its own family colour. */
  function drawFamilyRow(ctx, r, activeIx) {
    var fams = Data.GROUPS[groupIx].families, n = fams.length, picked = -1;
    var gap = 4, cw = (r.w - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) {
      var cr = SC[i];
      cr.x = r.x + i * (cw + gap); cr.y = r.y; cr.w = cw; cr.h = r.h;
      var tint = FAM_TINT(i), on = i === activeIx;
      if (on) {
        fillRR(ctx, cr.x, cr.y, cr.w, cr.h, 3, tint + '38');
        strokeRR(ctx, cr.x, cr.y, cr.w, cr.h, 3, tint, 1);
      } else {
        strokeRR(ctx, cr.x, cr.y, cr.w, cr.h, 3, tint + '59', 1);
      }
      var lab = fams[i].label.toUpperCase();
      text(ctx, fitText(ctx, lab, cr.w - 6, T.head(11, on ? 700 : 600)),
           cr.x + cr.w / 2, cr.y + cr.h / 2,
           { font: T.head(11, on ? 700 : 600), fill: on ? lift(tint) : tint,
             align: 'center', baseline: 'middle', track: 1.4 });
      if (UI.zone(cr, 'toggle')) picked = i;
    }
    return picked;
  }

  /* A pale version of a family colour, for the label on its own filled chip. */
  function lift(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * 0.55);
    g = Math.round(g + (255 - g) * 0.55);
    b = Math.round(b + (255 - b) * 0.55);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* A family's own colour, so a 34px tile and its tab agree. */
  function FAM_TINT(i) {
    var fams = Data.GROUPS[groupIx].families;
    var list = Data.family(Data.GROUPS[groupIx].id, fams[i].id);
    return list.length ? T.tintForModule(list[0]) : T.cat.other;
  }
  var GROUP_TAB = { weapons: 'WEP', defence: 'DEF', utility: 'UTIL' };
  var GROUP_FAM = { weapons: 'weapon', defence: 'defence', utility: 'utility' };
  var GROUP_INK = { weapons: '#FF8A80', defence: '#C4ADF8', utility: '#7FE0A8' };

  /* The module list body. Named, not a literal, so the per-frame path does not
     allocate a closure. */
  var pickKey = false, pickVal = null;
  function drawListBody(c2) {
    var x = listRect.x + 2, w = listRect.w - 16;
    for (var i = 0; i < rows.length; i++) {
      var cy = listRect.y + i * CARD_STEP;
      var sy = cy - scroll.y;
      if (sy + CARD_H < listRect.y - 4 || sy > listRect.y + listRect.h + 4) continue;
      CARD_R.x = x; CARD_R.y = sy; CARD_R.w = w; CARD_R.h = CARD_H;
      drawCard(c2, rows[i], x, cy, w, CARD_H, selKey === rows[i].key, UI.held(CARD_R));
      if (UI.row(CARD_R, listRect)) {
        /* Tapping the chosen card again puts it down — a second tap on the
           same card should never be a dead tap. */
        pickKey = true;
        pickVal = (selKey === rows[i].key) ? null : rows[i].key;
      }
    }
  }

  /* The strip target: a soft outer disc, a bright inner ring, an X, and the
     caption under it. Only ever visible mid-drag, and it overlays the slot grid
     rather than displacing it — the hull stays centred in the well. Amber is
     reserved for locked and over budget, so removal is the danger red. */
  function drawDeleteZone(ctx) {
    var hot = drag.over;
    var cx = DELZ.x + DELZ.w / 2, cy = DELZ.y + DELZ.h / 2;

    /* the outer disc: a radial wash, not a ring, so it reads as a zone */
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
    g.addColorStop(0, hot ? 'rgba(228,85,74,0.34)' : 'rgba(228,85,74,0.22)');
    g.addColorStop(0.7, hot ? 'rgba(228,85,74,0.12)' : 'rgba(228,85,74,0.05)');
    g.addColorStop(1, 'rgba(228,85,74,0)');
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(228,85,74,0.6)' : 'rgba(228,85,74,0.35)';
    ctx.lineWidth = 1; ctx.stroke();

    ctx.save();
    if (hot) { ctx.shadowColor = 'rgba(228,85,74,0.45)'; ctx.shadowBlur = 26; }
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = hot ? 'rgba(228,85,74,0.40)' : 'rgba(228,85,74,0.25)';
    ctx.fill();
    ctx.strokeStyle = hot ? '#FF8A80' : '#E4554A';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    /* the X, as two bars rather than a glyph — a font's multiplication sign
       sits off-centre and changes size between the three faces */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = hot ? '#FFFFFF' : '#FFD9D5';
    [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
      ctx.save(); ctx.rotate(a);
      rr(ctx, -11, -1.5, 22, 3, 1.5); ctx.fill();
      ctx.restore();
    });
    ctx.restore();

    text(ctx, 'DROP TO STRIP', cx, cy + 46 + 14,
         { font: T.head(12, 700), fill: hot ? '#FF8A80' : '#E4554A',
           align: 'center', baseline: 'middle', track: 2.4,
           glow: 'rgba(0,0,0,0.9)', glowBlur: 8 });
  }

  /* The thing in the air, under the finger. */
  function drawGhost(ctx) {
    var m = Data.module(drag.moduleId);
    if (!m) return;
    var cs = Math.min(baseCs * zoom, 30);
    var w = m.width * cs, h = m.height * cs;
    var p = App.ptr;
    var gx = p.x - (drag.offC + 0.5) * cs, gy = p.y - (drag.offR + 0.5) * cs;
    ctx.globalAlpha = 0.85;
    drawArt(ctx, m, gx, gy, w, h, T.tintForModule(m));
    ctx.globalAlpha = 1;
    strokeRR(ctx, gx - 2, gy - 2, w + 4, h + 4, 6, 'rgba(255,255,255,0.55)', 1.5);
  }

  function drawPill(ctx, s, cx, y, ok) {
    var f = T.mono(11);
    ctx.font = f;
    var w = ctx.measureText(s).width + 22;
    var x = clamp(cx - w / 2, GRIDBOX.x + 6, GRIDBOX.x + GRIDBOX.w - w - 6);
    fillRR(ctx, x, y, w, 24, 3, 'rgba(5,8,11,0.86)');
    strokeRR(ctx, x, y, w, 24, 3, ok ? 'rgba(79,191,127,0.6)' : 'rgba(228,85,74,0.6)', 1);
    text(ctx, s, x + w / 2, y + 12,
         { font: f, fill: ok ? T.ready : '#FF8A80', align: 'center', baseline: 'middle' });
  }

  function drawPreview(ctx, m, col, row, ok, why) {
    var pr = L.cellRect(col, row, m.width, m.height);
    var tone = ok ? '79,191,127' : '228,85,74';
    fillRR(ctx, pr.x, pr.y, pr.w, pr.h, 4, 'rgba(' + tone + ',0.30)');
    strokeRR(ctx, pr.x, pr.y, pr.w, pr.h, 4, 'rgba(' + tone + ',0.95)', 2.5);
    drawPill(ctx, (ok ? m.displayName : why).toUpperCase(), pr.x + pr.w / 2,
             (pr.y - 30 < GRIDBOX.y) ? pr.y + pr.h + 6 : pr.y - 30, ok);
  }

  /* ---- the screen ------------------------------------------------------- */
  return {
    enter: function () {
      Music.to('hangar');
      ship = Data.ship(shipKey) || null;
      placements = [];
      msg = null; msgT = 0; copyOpen = false;
      selKey = null; selPlace = -1;
      dodgeK = 0; dodgeWant = 0; dodgeHold = 0;
      groupIx = 0; familyIx = 0; rowsKey = ''; rows = [];
      scroll = {}; gHS.x = 0; fHS.x = 0;
      cancelDrag();
      resetView();
      if (!ship) return;
      grid = Geom.shipGrid(ship);
      baseCs = ShipView.cellSize(grid, GRIDBOX, MAX_CELL);
      rebuildView();
      if (!(layoutIndex >= 0 && layoutIndex < Save.SLOTS)) layoutIndex = 0;
      loadLayout(layoutIndex);
      countFamilies();
      buildRows();
    },

    exit: function () {},

    update: function (dt) {
      if (msgT > 0) { msgT -= dt; if (msgT <= 0) msg = null; }
      if (!ship) return;
      var p = App.ptr;

      /* A pointer that moves while it is up is a mouse; only then is a hover
         preview something the player asked for. */
      if (!p.down && (p.dx || p.dy)) hasHover = true;

      /* ---- zoom ---- */
      /* Core accumulates the wheel and clears it each frame, the same way it
         does ptr.dx. A wheel is a desktop convenience for testing; the tablet
         pinches. */
      if (App.wheel.dy) zoomAbout(Math.pow(0.998, App.wheel.dy), App.wheel.x, App.wheel.y);
      if (App.pinch.active) {
        cancelDrag();
        if (App.pinch.dScale !== 1 && App.inRect(App.pinch.cx, App.pinch.cy, GRIDBOX))
          zoomAbout(App.pinch.dScale, App.pinch.cx, App.pinch.cy);
      }
      if (viewDirty) rebuildView();

      /* ---- the gesture ----
         Resolved before anything draws, so the hull, the stats strip and the
         description panel all report the same frame's truth. */
      /* A menu floats OVER the slot grid, and the grid claims every tap inside
         itself right here in update() — before draw() gets to hit-test the
         menu at all. So a tap under an open menu is not the editor's to take:
         without this guard, opening AUTOFIT and pressing APPLY placed a module
         on the hull instead. */
      if (p.downThisFrame && !App.pinch.active && !overMenu(p.downX, p.downY)) beginDown(p);
      if (p.down && (drag.mode === 'pendGrid' || drag.mode === 'pendList')) promote(p);
      if (drag.mode === 'drag') aim(p);
      if (drag.mode === 'pan' && p.down && p.dragged && zoom > 1 && (p.dx || p.dy)) {
        panX += p.dx; panY += p.dy; clampPan(); viewDirty = true; rebuildView();
      }

      if (p.upThisFrame) {
        if (overMenu(p.upX, p.upY)) cancelDrag();
        else if (drag.mode === 'drag') { drop(); p.claimed = true; }
        else if ((drag.mode === 'pendGrid' || drag.mode === 'pan') && !p.dragged &&
                 App.inRect(p.upX, p.upY, GRIDBOX)) {
          gridTap(p); p.claimed = true; cancelDrag();
        } else cancelDrag();
      }
      if (!p.down && drag.mode !== 'none' && !p.upThisFrame) cancelDrag();

      /* The list must not glide away underneath a module being dragged out. */
      if (drag.mode === 'drag' && drag.src === 'list') { scroll.grab = false; scroll.v = 0; }

      if (statsDirty) {
        var v = Geom.validate(ship, placements, Data.modules);
        stats = v.stats; errors = v.errors; statsDirty = false;
      }

      /* ---- the stats card dodging ---- */
      var selM = selectedModule();
      if (!selM) { dodgeWant = 0; dodgeHold = 0; }
      else {
        /* Dodging into the finger is no better than standing in front of it,
           so the corner it is running TO has to be clear as well. When both
           corners are busy it holds whatever it was doing rather than flapping
           between two bad positions. */
        var busyHome = statsBusy(selM, 0), busyAway = statsBusy(selM, 1);
        if (busyHome && !busyAway) { dodgeWant = 1; dodgeHold = DODGE_HOLD; }
        else if (busyAway && !busyHome) { dodgeWant = 0; dodgeHold = 0; }
        else if (!busyHome) {
          if (dodgeHold > 0) dodgeHold -= dt; else dodgeWant = 0;
        }
      }
      dodgeK += (dodgeWant - dodgeK) * (1 - Math.pow(1 - DODGE_RATE, dt * 60));
      if (Math.abs(dodgeWant - dodgeK) < 0.002) dodgeK = dodgeWant;
    },

    draw: function (ctx) {
      /* radial-gradient(110% 130% at 50% 30%, #0c1a23 0%, #05080b 65%) */
      ctx.fillStyle = '#05080B';
      ctx.fillRect(0, 0, VW, VH);
      vignette(ctx, VW, VH, 1.10, 1.30, 0.50, 0.30, '#0C1A23', 'rgba(5,8,11,0)', 0.65);

      if (!ship) {
        text(ctx, 'NO SUCH HULL', VW / 2, VH / 2,
             { font: T.head(22, 700), fill: T.subtitle, align: 'center',
               baseline: 'middle', track: 3 });
        var br = { x: VW / 2 - 90, y: VH / 2 + 30, w: 180, h: 40 };
        strokeRR(ctx, br.x, br.y, br.w, br.h, 5, T.edgeUp, 1);
        text(ctx, 'HANGAR', br.x + br.w / 2, br.y + br.h / 2,
             { font: T.head(13, 600), fill: T.ink, align: 'center',
               baseline: 'middle', track: 2 });
        if (UI.zone(br, 'back')) App.pop();
        return;
      }

      var p = App.ptr, i;

      /* the menus get first refusal on the tap, before anything under them */
      copyMenuHit();
      autoMenuHit();

      drawTopBar(ctx);
      drawBay(ctx);
      drawEditor(ctx, p);
      drawBudget(ctx);

      /* last, over everything: the drag, then the one menu */
      if (drag.mode === 'drag') { drawDeleteZone(ctx); drawGhost(ctx); }
      copyMenuDraw(ctx);
      autoMenuDraw(ctx);
    }
  };

  /* ---- the 58px bar ----------------------------------------------------
     Hull, tier badge, the fit toggle, then six actions. Two of them open a
     menu; the menus are hit-tested before everything else and painted after
     it, which is the whole of what "on top" means in an immediate-mode UI. */
  function drawTopBar(ctx) {
    ctx.fillStyle = 'rgba(8,14,19,0.6)';
    ctx.fillRect(0, 0, VW, BAR_H);
    ctx.fillStyle = T.rule;
    ctx.fillRect(0, BAR_H - 1, VW, 1);

    var mid = BAR_H / 2, x = BAR_L;
    var name = ship.displayName.toUpperCase();
    ctx.font = T.head(16, 700);
    var nw = ctx.measureText(name).width + 2.4 * name.length;
    text(ctx, name, x, mid,
         { font: T.head(16, 700), fill: '#EAF5FA', baseline: 'middle', track: 2.4 });
    x += nw + 8;

    var badge = 'T' + Progress.tierOf(ship);
    ctx.font = T.mono(11, 600);
    var bw = ctx.measureText(badge).width + 10;
    fillRR(ctx, x, mid - 8, bw, 16, 2, T.accent);
    text(ctx, badge, x + bw / 2, mid,
         { font: T.mono(11, 600), fill: '#05080B', align: 'center', baseline: 'middle' });
    x += bw + 8;

    x = drawFitToggle(ctx, x, mid);

    /* Here the switch means the opposite way round: the fitting bay always
       shows the fit, so HULL adds the hull's render behind it and MODULES
       leaves the grid bare. */
    var seg = UI.segment(ctx, x + 10, mid - 29 / 2, ['HULL', 'MODULES'],
                         Save.hullView('fitting') === 'hull' ? 0 : 1);
    if (seg.picked >= 0) Save.setHullView('fitting', seg.picked ? 'modules' : 'hull');

    /* the actions, right to left so the primary keeps the edge */
    var rx = VW - BAR_R;
    rx = barBtn(ctx, BAR_BTN[0], rx, mid, 'SAVE', 'primary', function () {
      Sfx.play('confirm');
      if (commit()) App.pop();
    });
    rx = barBtn(ctx, BAR_BTN[1], rx, mid, 'CANCEL', '', function () {
      Sfx.play('back');
      App.pop();                       /* the working copy is discarded with it */
    });

    rx -= 8;                           /* the design's 1px rule, with air */
    ctx.fillStyle = 'rgba(120,170,200,0.2)';
    ctx.fillRect(rx, mid - 11, 1, 22);
    rx -= 9;

    rx = barBtn(ctx, BAR_BTN[2], rx, mid, 'AUTOFIT', 'accent', function () {
      autoOpen = !autoOpen; autoArmed = false; copyOpen = false;
      Sfx.play(autoOpen ? 'open' : 'close');
    }, autoOpen);
    AUTO_MENU.w = 336;
    AUTO_MENU.x = BAR_BTN[2].x + BAR_BTN[2].w - AUTO_MENU.w;
    AUTO_MENU.y = BAR_H + 2;
    AUTO_MENU.h = autoMenuHeight();

    rx = barBtn(ctx, BAR_BTN[3], rx, mid, 'COPY', 'menu', function () {
      copyOpen = !copyOpen; autoOpen = false;
      Sfx.play(copyOpen ? 'open' : 'close');
      if (copyOpen) copyTo = (layoutIndex + 1) % Save.SLOTS;
    }, copyOpen);
    COPY_MENU.w = 254;
    COPY_MENU.x = BAR_BTN[3].x + BAR_BTN[3].w - COPY_MENU.w;
    COPY_MENU.y = BAR_H + 2;
    COPY_MENU.h = copyMenuHeight();

    rx = barBtn(ctx, BAR_BTN[4], rx, mid, 'REVERT', '', function () {
      loadLayout(layoutIndex);
      say(dirty ? 'Your changes are gone — back to the saved fit'
                : 'Reloaded the saved fit; nothing had changed');
    });
    barBtn(ctx, BAR_BTN[5], rx, mid, 'CLEAR', '', function () {
      if (!placements.length) { Sfx.play('deny'); say('The hull is already empty'); return; }
      placements = []; selPlace = -1; edited();
      Sfx.play('strip'); say('Every module stripped off the hull');
    });
  }

  /* One right-aligned bar button; returns the next right edge. `kind` is
     'primary' (filled), 'accent' (outlined in cyan, carries a caret), 'menu'
     (a caret) or '' (plain). */
  function barBtn(ctx, r, rx, mid, label, kind, fn, on) {
    var caret = (kind === 'accent' || kind === 'menu');
    var prim = kind === 'primary', acc = kind === 'accent';
    var font = T.head(12, prim || acc ? 700 : 600), track = prim ? 2 : 1.8;
    ctx.font = font;
    var w = ctx.measureText(label).width + track * label.length +
            (prim ? 28 : 22) + (caret ? 15 : 0);
    r.x = rx - w; r.y = mid - 16; r.w = w; r.h = 32;

    if (prim) fillRR(ctx, r.x, r.y, r.w, r.h, 4, T.accent);
    else if (acc || on) {
      fillRR(ctx, r.x, r.y, r.w, r.h, 4, 'rgba(56,197,216,0.14)');
      strokeRR(ctx, r.x, r.y, r.w, r.h, 4, T.accent, 1);
    } else strokeRR(ctx, r.x, r.y, r.w, r.h, 4, T.edgeUp, 1);

    var ink = prim ? T.onAccent : (acc || on) ? T.accent : '#A9BDC8';
    text(ctx, label, r.x + (caret ? 11 : r.w / 2), mid,
         { font: font, fill: ink, align: caret ? 'left' : 'center',
           baseline: 'middle', track: track });
    if (caret) {
      text(ctx, '▾', r.x + r.w - 10, mid,
           { font: T.mono(11), fill: (acc || on) ? T.accent : T.muted,
             align: 'right', baseline: 'middle' });
    }
    if (UI.zone(r, 'tap')) fn();
    return r.x - 8;
  }

  /* FIT 1 / 2 / 3 — the hangar's segmented toggle, doing the same job. The
     inactive cells say what is in that slot without a word: ink for a fit that
     flies, amber for one that does not, sealed for an empty one. */
  function drawFitToggle(ctx, x, mid) {
    var cw = 34, h = 31;
    var w = 3 + Save.SLOTS * cw + (Save.SLOTS - 1) * 3 + 3;
    var r = { x: x, y: mid - h / 2, w: w, h: h };
    fillRR(ctx, r.x, r.y, r.w, r.h, 6, 'rgba(10,16,21,0.8)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 6, T.edgeUp, 1);

    for (var i = 0; i < Save.SLOTS; i++) {
      var c = FIT_CELL[i];
      c.x = r.x + 3 + i * (cw + 3); c.y = r.y + 3; c.w = cw; c.h = h - 6;
      var on = i === layoutIndex;
      var saved = Save.layout(shipKey, i);
      var has = !!(saved && saved.modules.length);
      var ok = has && Geom.validate(ship, saved.modules, Data.modules).ok;
      if (on) fillRR(ctx, c.x, c.y, c.w, c.h, 4, T.accent);
      text(ctx, String(i + 1) + ((on && dirty) ? '•' : ''), c.x + c.w / 2, c.y + c.h / 2,
           { font: T.mono(12, 600), align: 'center', baseline: 'middle',
             fill: on ? T.onAccent : (!has ? '#5D7280' : ok ? T.ink : T.warn) });
      if (UI.zone(c, 'toggle') && i !== layoutIndex) {
        commitIfWorthIt();
        loadLayout(i);
        Save.setActiveLayoutIndex(shipKey, i);
        copyOpen = false; autoOpen = false;
        say('Now editing fit ' + (i + 1));
      }
    }
    return r.x + r.w;
  }

  /* ---- the COPY menu --------------------------------------------------- */
  function copyMenuHeight() { return 13 + 20 + 10 + (Save.SLOTS - 1) * 44 + 10 + 40 + 10 + 36 + 13; }

  function copyRects() {
    var n = 0, y = COPY_MENU.y + 13 + 20 + 10;
    for (var i = 0; i < Save.SLOTS; i++) {
      if (i === layoutIndex) continue;
      var r = COPY_ROW[n];
      r.x = COPY_MENU.x + 13; r.y = y; r.w = COPY_MENU.w - 26; r.h = 36;
      r.slot = i;
      y += 44; n++;
    }
    var by = COPY_MENU.y + COPY_MENU.h - 13 - 36, bx = COPY_MENU.x + 13;
    var bw = COPY_MENU.w - 26 - 8, unit = bw / 2.3;
    COPY_BTN[0].x = bx;               COPY_BTN[0].y = by; COPY_BTN[0].w = unit;       COPY_BTN[0].h = 36;
    COPY_BTN[1].x = bx + unit + 8;    COPY_BTN[1].y = by; COPY_BTN[1].w = unit * 1.3; COPY_BTN[1].h = 36;
  }

  function copyMenuHit() {
    if (!copyOpen) return;
    copyRects();
    var p = App.ptr, n = Save.SLOTS - 1, i;
    for (i = 0; i < n; i++) if (UI.zone(COPY_ROW[i], 'toggle')) copyTo = COPY_ROW[i].slot;
    if (UI.zone(COPY_BTN[0], 'close')) { copyOpen = false; return; }
    if (UI.zone(COPY_BTN[1], 'confirm')) {
      commit();
      if (Save.cloneLayout(shipKey, layoutIndex, copyTo)) say('Fit ' + (copyTo + 1) + ' has been replaced by this one');
      else say('There is nothing in this fit to copy');
      copyOpen = false;
      return;
    }
    swallow(COPY_MENU, BAR_BTN[3], function () { copyOpen = false; });
  }

  /* A tap outside an open menu closes it, and must not also hit whatever it
     landed on — otherwise dismissing the menu edits the ship. */
  function swallow(menu, opener, close) {
    var p = App.ptr;
    if (!p.upThisFrame || p.claimed) return;
    if (App.inRect(p.upX, p.upY, menu)) { p.claimed = true; return; }
    close();
    if (!App.inRect(p.upX, p.upY, opener)) p.claimed = true;
  }

  function copyMenuDraw(ctx) {
    if (!copyOpen) return;
    /* The bar can open this menu partway through the very draw that paints it,
       in which case the hit pass at the top of the frame ran while it was still
       closed and never built the rects. Build them here too — cheap, and the
       alternative is reading `undefined.toUpperCase()`. */
    copyRects();
    ctx.globalAlpha = 1;
    panel(ctx, COPY_MENU, T.edgeUp);
    var x = COPY_MENU.x + 13, w = COPY_MENU.w - 26;
    text(ctx, 'COPY FIT ' + (layoutIndex + 1) + ' TO', x, COPY_MENU.y + 13 + 10,
         { font: T.head(14, 700), fill: '#EAF5FA', baseline: 'middle', track: 2.2 });
    text(ctx, (Save.SLOTS - 1) + ' SLOTS', x + w, COPY_MENU.y + 13 + 10,
         { font: T.mono(10), fill: T.muted, align: 'right', baseline: 'middle' });

    var warn = null;
    for (var i = 0; i < Save.SLOTS - 1; i++) {
      var r = COPY_ROW[i], on = r.slot === copyTo;
      var saved = Save.layout(shipKey, r.slot);
      var has = !!(saved && saved.modules.length);
      var ok = has && Geom.validate(ship, saved.modules, Data.modules).ok;
      var tag = !has ? 'EMPTY' : ok ? 'READY' : 'OVERFIT';
      var tagInk = !has ? T.muted : ok ? T.ready : T.warn;
      if (on) {
        fillRR(ctx, r.x, r.y, r.w, r.h, 6, 'rgba(56,197,216,0.12)');
        strokeRR(ctx, r.x, r.y, r.w, r.h, 6, T.accent, 1);
      } else strokeRR(ctx, r.x, r.y, r.w, r.h, 6, T.edge, 1);
      radio(ctx, r.x + 10 + 7, r.y + r.h / 2, on);
      text(ctx, 'FIT ' + (r.slot + 1), r.x + 34, r.y + r.h / 2,
           { font: T.head(14, 700), fill: on ? '#EAF5FA' : '#C7D6DE',
             baseline: 'middle', track: 1.6 });
      text(ctx, tag, r.x + r.w - 10, r.y + r.h / 2,
           { font: T.mono(10), fill: tagInk, align: 'right', baseline: 'middle' });
      if (on && has) warn = 'Fit ' + (r.slot + 1) + ' already holds modules. Copying overwrites it.';
    }

    var ny = COPY_ROW[Save.SLOTS - 2].y + 36 + 10;
    /* Amber whether or not a slot is about to be overwritten: it is the same
       kind of line as AUTOFIT's, and the two menus sat side by side reading in
       two different colours. */
    notice(ctx, x, ny, w, 40,
           warn || 'Copying replaces the whole of that fit.', true);

    menuBtn(ctx, COPY_BTN[0], 'CANCEL', false);
    menuBtn(ctx, COPY_BTN[1], 'COPY', true);
  }

  /* ---- the AUTOFIT menu ------------------------------------------------ */
  function autoMenuHeight() {
    return 14 + 19 + 12 + AUTO_GROUPS.length * (13 + 6 + 26) + AUTO_GROUPS.length * 12 +
           40 + 12 + 38 + 14;
  }

  function autoRects() {
    var x = AUTO_MENU.x + 14, w = AUTO_MENU.w - 28;
    var y = AUTO_MENU.y + 14 + 19 + 12, k = 0;
    for (var g = 0; g < AUTO_GROUPS.length; g++) {
      var opts = AUTO_GROUPS[g].opts, n = opts.length;
      var cw = (w - 4 * (n - 1)) / n;
      for (var i = 0; i < n; i++, k++) {
        var r = AUTO_SEG[k];
        r.x = x + i * (cw + 4); r.y = y + 13 + 6; r.w = cw; r.h = 26;
        r.group = g; r.opt = opts[i];
      }
      y += 13 + 6 + 26 + 12;
    }
    var by = AUTO_MENU.y + AUTO_MENU.h - 14 - 38;
    var bw = w - 8, unit = bw / 2.4;
    AUTO_BTN[0].x = x;              AUTO_BTN[0].y = by; AUTO_BTN[0].w = unit;       AUTO_BTN[0].h = 38;
    AUTO_BTN[1].x = x + unit + 8;   AUTO_BTN[1].y = by; AUTO_BTN[1].w = unit * 1.4; AUTO_BTN[1].h = 38;
  }

  function autoMenuHit() {
    if (!autoOpen) return;
    autoRects();
    var k = 0, g, i;
    for (g = 0; g < AUTO_GROUPS.length; g++) {
      for (i = 0; i < AUTO_GROUPS[g].opts.length; i++, k++) {
        if (UI.zone(AUTO_SEG[k], 'toggle')) {
          auto[AUTO_GROUPS[g].key] = AUTO_SEG[k].opt;
          autoArmed = false;            /* the recipe moved — confirm again */
        }
      }
    }
    if (UI.zone(AUTO_BTN[0], 'close')) { autoOpen = false; autoArmed = false; return; }
    if (UI.zone(AUTO_BTN[1], autoArmed ? 'autofit' : 'confirm')) {
      if (!autoArmed) { autoArmed = true; return; }
      applyAutofit();
      autoOpen = false; autoArmed = false;
      return;
    }
    swallow(AUTO_MENU, BAR_BTN[2], function () { autoOpen = false; autoArmed = false; });
  }

  function applyAutofit() {
    var built = Autofit.build(ship, {
      weapons: auto.weapons, armour: auto.armour, priority: auto.priority,
      placement: 'clever',
      /* Only what this pilot has earned. The autofit is a shortcut through the
         work, not around the unlock tree. */
      allow: function (m) { return Progress.moduleUnlocked(m); }
    }, Data.modules);
    placements = built;
    selPlace = -1; selKey = null;
    edited();
    var v = Geom.validate(ship, placements, Data.modules);
    say(v.ok ? 'Autofitted — ' + placements.length + ' modules'
             : 'Autofit: ' + v.errors[0]);
  }

  function autoMenuDraw(ctx) {
    if (!autoOpen) return;
    autoRects();                    /* see copyMenuDraw — same reason */
    ctx.globalAlpha = 1;
    panel(ctx, AUTO_MENU, T.accent);
    var x = AUTO_MENU.x + 14, w = AUTO_MENU.w - 28;
    text(ctx, 'AUTOFIT', x, AUTO_MENU.y + 14 + 9,
         { font: T.head(15, 700), fill: '#EAF5FA', baseline: 'middle', track: 2.4 });
    text(ctx, fitText(ctx, ship.displayName.toUpperCase() + ' · FIT ' + (layoutIndex + 1),
                      w - 80, T.mono(10)),
         x + w, AUTO_MENU.y + 14 + 9,
         { font: T.mono(10), fill: T.muted, align: 'right', baseline: 'middle' });

    var k = 0, g, i;
    for (g = 0; g < AUTO_GROUPS.length; g++) {
      var grp = AUTO_GROUPS[g];
      text(ctx, grp.label.toUpperCase(), x, AUTO_SEG[k].y - 6 - 6,
           { font: T.head(10), fill: '#8FA3B0', baseline: 'middle', track: 2 });
      for (i = 0; i < grp.opts.length; i++, k++) {
        var r = AUTO_SEG[k], on = auto[grp.key] === r.opt;
        var lab = (grp.text && grp.text[r.opt]) || r.opt;
        if (on) {
          fillRR(ctx, r.x, r.y, r.w, r.h, 4, 'rgba(56,197,216,0.18)');
          strokeRR(ctx, r.x, r.y, r.w, r.h, 4, T.accent, 1);
        } else strokeRR(ctx, r.x, r.y, r.w, r.h, 4, T.edgeUp, 1);
        text(ctx, fitText(ctx, lab.toUpperCase(), r.w - 6, T.head(11, on ? 700 : 600)),
             r.x + r.w / 2, r.y + r.h / 2,
             { font: T.head(11, on ? 700 : 600), fill: on ? '#EAF5FA' : '#8FA3B0',
               align: 'center', baseline: 'middle', track: 1.3 });
      }
    }

    notice(ctx, x, AUTO_BTN[0].y - 12 - 40, w, 40,
           autoArmed ? 'Press APPLY again to strip this fit and rebuild it.'
                     : 'Apply strips the current fit and rebuilds it. Press apply twice to confirm.',
           true);
    menuBtn(ctx, AUTO_BTN[0], 'CANCEL', false);
    menuBtn(ctx, AUTO_BTN[1], autoArmed ? 'CONFIRM' : 'APPLY', true);
  }

  /* ---- the bits both menus are made of --------------------------------- */
  function panel(ctx, r, edge) {
    fillRR(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 12, 'rgba(4,8,11,0.82)');
    fillRR(ctx, r.x, r.y, r.w, r.h, 10, 'rgba(8,15,20,0.98)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 10, edge, 1);
  }
  function radio(ctx, cx, cy, on) {
    ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = on ? T.accent : T.edgeUp; ctx.lineWidth = 1; ctx.stroke();
    if (!on) return;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = T.accent; ctx.fill();
  }
  /* ---- MODULE STATS -------------------------------------------------------
     The handoff's "Editor corner" card: pinned inside the well's own dashed
     box, 216 wide, ten in from its corner, so it sits over the empty space to
     the left of the hull rather than taking a column away from the budget.

     It appears when a module is selected — either picked out of the bay or
     tapped on the hull — and it shows the six the type is worth showing, off
     `ModStats`, two to a line. Its border, its badge and its first stat all
     carry the module's own category colour, which is how you tell at a glance
     that this card is about the thing you just tapped. */
  /* Where the card is, for a given dodge position k (0 top, 1 bottom). One
     function, so the thing that decides whether the card is in the way and the
     thing that draws it can never disagree about where it is. */
  function statsRect(m, k) {
    if (!m) return null;
    var P = STATS.pad, lines = Math.ceil(ModStats.table(m).length / 2);
    var h = P + 13 + 7 + 46 + 7 + (lines * 16 - 4) + P;
    var top = WELL.y + STATS.dy, bot = WELL.y + WELL.h - STATS.dy - h;
    return { x: WELL.x + STATS.dx, y: top + (bot - top) * k, w: STATS.w, h: h };
  }

  /* Is something going on under the card's HOME corner? The pointer counts
     when it is down or when a mouse is hovering; a finger that has been lifted
     is nowhere, and the card should not hide from where it last was. During a
     drag the module travels with the pointer, so the test grows by its own
     half-size — the card dodges the module, not just the finger. */
  function statsBusy(m, k) {
    var r = statsRect(m, k);
    if (!r) return false;
    var p = App.ptr;
    if (!p.down && !hasHover) return false;
    var pad = dodgeWant ? DODGE_OUT : DODGE_IN;
    if (drag.mode === 'drag') {
      var dm = Data.module(drag.moduleId), cs = L ? L.cs : 0;
      if (dm) pad += Math.max(dm.width, dm.height) * cs / 2;
    }
    return p.x > r.x - pad && p.x < r.x + r.w + pad &&
           p.y > r.y - pad && p.y < r.y + r.h + pad;
  }

  function drawModuleStats(ctx, m) {
    if (!m) return;
    var rows = ModStats.table(m), tint = T.tintForModule(m);
    var box = statsRect(m, dodgeK);
    var P = STATS.pad, x = box.x, y = box.y, w = box.w;
    var h = box.h;

    fillRR(ctx, x, y, w, h, 8, 'rgba(6,11,15,0.94)');
    strokeRR(ctx, x, y, w, h, 8, tint + '59', 1);

    /* header: the label left, the module's family right */
    var hy = y + P + 6;
    text(ctx, 'MODULE STATS', x + P, hy,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });
    var badge = ModStats.label(m);
    ctx.font = T.mono(10);
    var bw = ctx.measureText(badge).width + 8;
    strokeRR(ctx, x + w - P - bw, hy - 6.5, bw, 13, 2, tint + '80', 1);
    text(ctx, badge, x + w - P - bw / 2, hy,
         { font: T.mono(10), fill: tint, align: 'center', baseline: 'middle' });

    /* identity: a 46px tile, the name, the footprint */
    var ty = hy + 6.5 + 7;
    fillRR(ctx, x + P, ty, 46, 46, 4, tint + '1a');
    strokeRR(ctx, x + P, ty, 46, 46, 4, tint + '80', 1);
    var im = Data.moduleImg(m);
    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      rr(ctx, x + P + 1, ty + 1, 44, 44, 3); ctx.clip();
      drawContain(ctx, im, x + P + 1, ty + 1, 44, 44);
      ctx.restore();
    } else {
      text(ctx, initials(m.displayName), x + P + 23, ty + 23,
           { font: T.mono(13, 600), fill: '#F0F7FA', align: 'center', baseline: 'middle' });
    }
    drawVariant(ctx, m, x + P, ty, 46, 46);
    ctx.fillStyle = tint;                      /* the same family stripe as the row */
    ctx.fillRect(x + P, ty, 15, 3);
    var nx = x + P + 46 + 8, nw = w - P * 2 - 46 - 8;
    var cvt = modVariant(m), cvw = 0;
    if (cvt) { ctx.font = T.mono(10, 600); cvw = ctx.measureText(cvt).width + 5; }
    var cn = fitText(ctx, m.displayName, nw - cvw, T.body(13, 600));
    text(ctx, cn, nx, ty + 17,
         { font: T.body(13, 600), fill: '#F0F7FA', baseline: 'middle' });
    if (cvt) {
      ctx.font = T.body(13, 600);
      text(ctx, cvt, nx + ctx.measureText(cn).width + 5, ty + 17,
           { font: T.mono(10, 600), fill: T.accent, baseline: 'middle' });
    }
    text(ctx, m.width + '×' + m.height, nx, ty + 33,
         { font: T.mono(11), fill: '#A9BDC8', baseline: 'middle' });

    /* the numbers, two to a line, label left and value right in each half */
    var gx = x + P, gw = (w - P * 2 - 12) / 2, gy = ty + 46 + 7 + 6;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var cx = gx + (i % 2) * (gw + 12), cy = gy + ((i / 2) | 0) * 16;
      text(ctx, r.k, cx, cy,
           { font: T.mono(12), fill: '#6F8795', baseline: 'middle' });
      text(ctx, r.v, cx + gw, cy,
           { font: T.mono(12), align: 'right', baseline: 'middle',
             fill: r.tone === 'key' ? tint : r.tone === 'pwr' ? '#B0D155' : '#DBE8EF' });
    }
  }

  function notice(ctx, x, y, w, h, msg2, amber) {
    fillRR(ctx, x, y, w, h, 5, amber ? 'rgba(232,163,61,0.07)' : 'rgba(120,170,200,0.05)');
    strokeRR(ctx, x, y, w, h, 5, amber ? 'rgba(232,163,61,0.4)' : T.edge, 1);
    ctx.save();
    ctx.translate(x + 11, y + 11); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = amber ? T.warn : T.muted; ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
    /* A notice that is not a warning is a hint, and every other hint in the game
       is T.muted. It was reading a shade brighter than the hint under the hull,
       which made two pieces of the same kind of text look like two ranks. */
    wrapLines(ctx, msg2, x + 21, y + 11, w - 30, 14,
              { font: T.body(11), fill: amber ? '#F0BF72' : T.muted, baseline: 'middle' }, 2);
  }
  function menuBtn(ctx, r, label, primary) {
    if (primary) fillRR(ctx, r.x, r.y, r.w, r.h, 5, T.accent);
    else strokeRR(ctx, r.x, r.y, r.w, r.h, 5, T.edgeUp, 1);
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2,
         { font: T.head(primary ? 13 : 12, primary ? 700 : 600),
           fill: primary ? T.onAccent : '#A9BDC8',
           align: 'center', baseline: 'middle', track: primary ? 2.4 : 2 });
  }

  /* ---- the module bay (244px) ------------------------------------------ */
  function drawBay(ctx) {
    ctx.fillStyle = 'rgba(6,11,15,0.8)';
    ctx.fillRect(0, BODY_Y, BAY_W, BODY_H);
    ctx.fillStyle = T.rule;
    ctx.fillRect(BAY_W - 1, BODY_Y, 1, BODY_H);

    /* The design puts a "BAL · 12" count up here. It was the three-letter code
       for the open family and how many modules it holds — which the family tab
       right below already says by being lit, and the count of a list you can
       see. Dropped. */
    text(ctx, 'MODULE BAY', BAY.x, BAY.y + 7,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });

    var g = drawGroupRow(ctx, GROUPROW, groupIx);
    var f = drawFamilyRow(ctx, FAMROW, familyIx);
    if (g >= 0 && g !== groupIx) { groupIx = g; familyIx = 0; }
    else if (f >= 0 && f !== familyIx) { familyIx = f; }
    buildRows();

    pickKey = false; pickVal = null;
    UI.scroll(ctx, LISTR, scroll, rows.length * CARD_STEP + 6, drawListBody);
    if (pickKey) { selKey = pickVal; selPlace = -1; chkKey = ''; }
  }

  /* ---- the editor ------------------------------------------------------ */
  function drawEditor(ctx, p) {
    /* the design's dashed well and its 34px grid paper */
    dashRR(ctx, WELL.x, WELL.y, WELL.w, WELL.h, 10, T.edge);
    ctx.save();
    rr(ctx, WELL.x, WELL.y, WELL.w, WELL.h, 10); ctx.clip();
    ctx.strokeStyle = 'rgba(120,170,200,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var ox = WELL.x + (WELL.w % 34) / 2, oy = WELL.y + (WELL.h % 34) / 2, q;
    for (q = ox; q <= WELL.x + WELL.w; q += 34) { ctx.moveTo(q + 0.5, WELL.y); ctx.lineTo(q + 0.5, WELL.y + WELL.h); }
    for (q = oy; q <= WELL.y + WELL.h; q += 34) { ctx.moveTo(WELL.x, q + 0.5); ctx.lineTo(WELL.x + WELL.w, q + 0.5); }
    ctx.stroke();
    ctx.restore();

    if (zoom > 1.001) {
      text(ctx, '×' + zoom.toFixed(1), WELL.x + WELL.w - 10, WELL.y + 14,
           { font: T.mono(10), fill: T.sealed, align: 'right', baseline: 'middle' });
    }

    /* the hull */
    var skip = (drag.mode === 'drag' && drag.src === 'grid') ? drag.from : -1;
    ctx.save();
    ctx.beginPath(); ctx.rect(GRIDBOX.x, GRIDBOX.y, GRIDBOX.w, GRIDBOX.h); ctx.clip();
    ShipView.drawHull(ctx, L, { art: Save.hullView('fitting') === 'hull',
                                placements: placements, skip: skip });
    ShipView.drawModules(ctx, L, placements, { selected: selPlace, skip: skip });

    if (drag.mode === 'drag' && drag.col >= 0) {
      drawPreview(ctx, Data.module(drag.moduleId), drag.col, drag.row, drag.ok, drag.why);
    } else if (drag.mode !== 'drag' && selKey && App.inRect(p.x, p.y, GRIDBOX) && (p.down || hasHover)) {
      /* The tap-to-place preview: same validator, same cache. */
      var hm = Data.module(selKey), hc = L.cellAt(p.x, p.y);
      if (hm && hc) {
        var col = clamp(hc.col - ((hm.w - 1) >> 1), 0, grid.w - hm.w);
        var row = clamp(hc.row - ((hm.h - 1) >> 1), 0, grid.h - hm.h);
        drawPreview(ctx, hm, col, row, checkCell(selKey, col, row, -1), chkWhy);
      }
    }
    ctx.restore();

    /* ---- ONE LINE, ONE PLACE ---------------------------------------------
       The bay used to have two ways of telling you something: a hint centred
       under the grid, and a toast that flew in over the bottom-left for a
       couple of seconds and left again. They said the same KIND of thing, so
       they are one line now, pinned to the bottom-right corner of the well.
       It is always there, so nothing arrives or departs; it just changes what
       it says. What it says, in order of what matters most:

          what just happened  >  what you are dragging  >  what is selected
                              >  what to do next

       Right-aligned into the corner, so the hull sits clear of it and a long
       sentence grows leftwards into empty space rather than pushing the grid
       around. */
    var sel = selectedModule();
    /* The card goes over the well, above the hull and under nothing — drawn
       here rather than with the grid because it is about the SELECTION, which
       is what this block is for. */
    drawModuleStats(ctx, sel);

    var line = msg ? msg
             : copyOpen ? 'Copying replaces the whole of that fit'
             : (drag.mode === 'drag') ? 'Drop on free cells, or on ✕ to remove'
             : sel ? (sel.desc || sel.displayName)
             : (selPlace >= 0) ? 'Drag it anywhere, or onto ✕'
             : 'Tap a module, then tap the hull — or drag it across';
    var say_ = !!msg || copyOpen;
    wrapLines(ctx, line, WELL.x + WELL.w - 6, WELL.y + WELL.h - 30,
              WELL.w * 0.62, 15,
              { font: T.body(12), align: 'right', baseline: 'middle',
                fill: say_ ? '#E8C53D' : T.muted }, 2);
  }

  function groupKey(i) { return Data.GROUPS[i].id; }
  function famKey(i)   { return Data.GROUPS[groupIx].id + '/' + Data.GROUPS[groupIx].families[i].id; }
}
