/* screens/fleet.js — 1a, the hangar. Fleet, active fit, operations.
 *
 * This is the design's layout, not an interpretation of it. The handoff gives a
 * 58px top bar over a three-column grid of `minmax(0,1fr) 216px 216px`, and at
 * 1333x690 that is 901 / 216 / 216 with a hairline between each. Everything
 * below is that arithmetic done once, at the top, and then used.
 *
 * WHAT THIS REPLACED
 * Five hangar slots, each an independent {shipId, modules}. That model fought
 * the game: the same hull in two slots was two unrelated things, a slot was the
 * thing you owned rather than a ship, and there was nowhere to express that a
 * hull is something you EARN. Now the ship is the unit — tiers along the top,
 * the hulls of that tier as cards, and the one you pick carries its own three
 * layouts.
 *
 * TWO PLACES IT KNOWINGLY DEPARTS FROM THE HANDOFF
 * 1. The hull card's art well is a striped placeholder in the design because no
 *    ship art existed. It exists here — it is the grid you fit on — so the real
 *    hull is drawn over the stripe. The design's own rule is "never hand-draw
 *    ship art"; this is not drawn, it is the data.
 * 2. The pilot chip is tappable and goes back to pilot select. The design has
 *    no route back off the hangar, and two brothers sharing a tablet need one.
 */
var FleetScreen = (function () {
  var tierSel = 1;
  var hs = { x: 0, v: 0, grab: false };        /* the hull strip's scroll */
  var panelOpen = false;                       /* the GOAL drop-down */
  var chipRect = null;                         /* where the chip was drawn   */

  /* ---- the design's boxes, at 1333x690 ---------------------------------
     Handoff 1aa: two columns, `minmax(0,1fr) 324px`. There used to be a third,
     a 216px ACTIVE FIT panel between the fleet and the operations. It is gone:
     everything it held now sits on the active hull's own card, where the thing
     being configured and the controls that configure it are in one place, and
     the operations column took half its width. */
  var BAR_H = 58, BAR_L = 140;                 /* 140px reserved for ← Games */
  var BAR_R = App.RIGHT_INSET;                 /* and the mute button's corner */
  var BODY_Y = BAR_H, BODY_H = VH - BAR_H;     /* 58 .. 690 */

  /* THE 324px COLUMN IS GONE. It held OPERATIONS and UNLOCKS behind a two-tab
     toggle — a quarter of the hangar, permanently, for a list with exactly one
     live row in it: the ladder is linear, so there is only ever one goal open.
     The handoff puts that one goal in the bar as a chip and hangs the rest
     under it, which gives the fleet the whole width and costs a tap nobody was
     making anyway. */
  var FLEET = { x: 12, y: BODY_Y + 9, w: VW - 24, h: BODY_H - 18 };
  var RAIL  = { x: FLEET.x, y: FLEET.y, w: FLEET.w, h: 40 };
  var STRIP  = { x: FLEET.x, y: RAIL.y + RAIL.h + 8,
                 w: FLEET.w, h: FLEET.h - RAIL.h - 8 };
  var CARD_W = STRIP.h * 2 / 3, CARD_GAP = 10;  /* portrait 2:3, min 176 */
  /* the drop-down, handoff 1a: 340 wide, 6 under the bar, on the mute
     button's own right inset, and never taller than the screen less 12 */
  var PANEL = { w: 340, x: VW - BAR_R - 340, y: BAR_H + 6, maxH: VH - BAR_H - 18 };
  var PANEL_PAD_X = 11, PANEL_PAD_Y = 10, PANEL_GAP = 5;

  /* THE HANGAR SAYS NOTHING. It used to throw a toast for a locked tier, a
     locked hull, a hull joining the fleet and a fit that will not fly — four
     notices for four things the cards already say in place: a locked tier tab
     is drawn locked, a locked hull carries the level it wants, claiming one
     visibly moves it into the fleet, and an unflyable fit says NOT FLIGHT
     READY on the button you just pressed. A line that repeats what is already
     on screen is noise, so there is no `say` here any more. */
  function k(n) {
    n = Math.round(n || 0);
    return n >= 10000 ? (n / 1000).toFixed(0) + 'k'
         : n >= 1000  ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  /* ---- background ------------------------------------------------------ */
  function drawGround(ctx) {
    /* radial-gradient(120% 140% at 85% 0%, #0d1a24 0%, #05080b 62%) */
    ctx.fillStyle = '#05080B';
    ctx.fillRect(0, 0, VW, VH);
    vignette(ctx, VW, VH, 1.20, 1.40, 0.85, 0.0, '#0D1A24', 'rgba(5,8,11,0)', 0.62);
  }

  /* ---- 58px top bar ---------------------------------------------------- */
  function drawTopBar(ctx) {
    ctx.fillStyle = 'rgba(8,14,19,0.6)';
    ctx.fillRect(0, 0, VW, BAR_H);
    ctx.fillStyle = T.rule;
    ctx.fillRect(0, BAR_H - 1, VW, 1);

    var mid = BAR_H / 2, x = BAR_L;
    ctx.font = T.head(18, 700);
    var w1 = ctx.measureText('FLEET FORGE').width + 3.5 * 10;
    text(ctx, 'FLEET FORGE', x, mid,
         { font: T.head(18, 700), fill: '#E6F1F6', baseline: 'middle', track: 3.5 });
    x += w1 + 14;
    ctx.fillStyle = T.rule;
    ctx.fillRect(x, mid - 10, 1, 20);
    x += 1 + 14;
    ctx.font = T.head(13, 600);
    text(ctx, 'HANGAR', x, mid,
         { font: T.head(13, 600), fill: T.accent, baseline: 'middle', track: 2.4 });
    x += ctx.measureText('HANGAR').width + 2.4 * 6 + 14;

    /* HULL shows the hull on its own; MODULES puts the fit on top of it. */
    var seg = UI.segment(ctx, x, mid - 29 / 2, ['HULL', 'MODULES'],
                         Save.hullView('hangar') === 'hull' ? 0 : 1);
    if (seg.picked >= 0) Save.setHullView('hangar', seg.picked ? 'modules' : 'hull');


    var pilot = drawPilotChip(ctx, mid);
    drawGoalChip(ctx, mid, pilot.x - 14, x + seg.w + 14);
  }

  /* ---- the GOAL chip ---------------------------------------------------
     Handoff 1a: 40 tall, the word GOAL, the objective over a 3px bar, the
     count, a chevron. `flex: 0 1 auto; min-width: 0` in the design, so it
     takes what it needs and gives way to the pilot pill when the bar is
     tight — measured, then clamped to the gap it has been left. */
  function drawGoalChip(ctx, mid, rightX, leftX) {
    var op = Progress.available()[0] || null;
    var pr = op ? Progress.opProgress(op) : null;
    var label = op ? (op.desc || op.name) : 'All goals complete';
    var cnt = pr ? (pr.have + '/' + pr.need) : '';

    ctx.font = T.head(11, 700);
    var wLab = ctx.measureText('GOAL').width + 1.8 * 4;
    ctx.font = T.mono(12);
    var wCnt = cnt ? ctx.measureText(cnt).width : 0;
    /* 12 in, gap 9, the text column, gap 9, the count, 2, the chevron, 10 out */
    var fixed = 12 + wLab + 9 + (cnt ? wCnt + 9 : 0) + 8 + 7 + 10;
    ctx.font = T.body(13, 500);
    var wWant = fixed + Math.min(ctx.measureText(label).width, 280);
    var room = rightX - leftX;
    var w = Math.min(wWant, room);
    if (w < fixed + 40) { chipRect = null; return; }   /* no room to draw it at all */

    var h = 40, r = { x: rightX - w, y: mid - h / 2, w: w, h: h };
    chipRect = r;                 /* so a tap on it is not read as "outside" */
    fillRR(ctx, r.x, r.y, r.w, r.h, 6, 'rgba(232,163,61,0.07)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 6, 'rgba(232,163,61,0.45)', 1);

    var tx = r.x + 12;
    text(ctx, 'GOAL', tx, mid,
         { font: T.head(11, 700), fill: T.warn, baseline: 'middle', track: 1.8 });
    tx += wLab + 9;

    var colW = r.x + r.w - 10 - 7 - 8 - (cnt ? wCnt + 9 : 0) - tx;
    text(ctx, fitText(ctx, label, colW, T.body(13, 500)), tx, pr ? mid - 7 : mid,
         { font: T.body(13, 500), fill: T.ink, baseline: 'middle' });
    if (pr) {
      var by = mid + 7;
      fillRR(ctx, tx, by, colW, 3, 1.5, T.track);
      if (pr.have > 0) {
        fillRR(ctx, tx, by, Math.max(2, colW * pr.have / pr.need), 3, 1.5, T.warn);
      }
      text(ctx, cnt, tx + colW + 9, mid,
           { font: T.mono(12), fill: T.warn, baseline: 'middle' });
    }
    chevron(ctx, r.x + r.w - 10 - 7, mid, panelOpen);

    if (UI.zone(r, 'toggle')) panelOpen = !panelOpen;
  }

  /* Two strokes, mitred, in the 12px the level number would have taken — the
     short arm down-right, the long arm up-right. */
  function tick(ctx, x, cy, colour) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 1, cy + 0.5);
    ctx.lineTo(x + 4.5, cy + 4);
    ctx.lineTo(x + 11, cy - 4.5);
    ctx.stroke();
    ctx.restore();
  }

  /* The design's chevron is a 7x7 square with two borders, rotated: pointing
     down when the panel is shut and up when it is open. */
  function chevron(ctx, x, cy, up) {
    ctx.save();
    ctx.translate(x + 3.5, cy + (up ? 2 : -2));
    ctx.rotate((up ? -135 : 45) * Math.PI / 180);
    ctx.strokeStyle = '#8FA3B0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3.5, -3.5); ctx.lineTo(3.5, 3.5); ctx.lineTo(-3.5, 3.5);
    ctx.stroke();
    ctx.restore();
  }

  /* The pilot pill on the right of the bar: avatar, name over ops, a rule, and
     the level. Its width is measured rather than fixed, because "Captain Ezra"
     and "Captain Caleb" are not the same width and the design pins the right
     edge, not the left. */
  function drawPilotChip(ctx, mid) {
    var s = Save.summary(Save.pilot());
    var name = 'CAPTAIN ' + s.name.toUpperCase();
    ctx.font = T.head(14, 600);
    var wText = ctx.measureText(name).width + 1.4 * name.length;
    ctx.font = T.mono(17, 600);
    var wNum = ctx.measureText(String(s.level)).width;
    ctx.font = T.head(9);
    var wLv = Math.max(wNum, ctx.measureText('LEVEL').width + 1.4 * 5);

    var w = 6 + 32 + 10 + wText + 10 + 1 + 10 + wLv + 13, h = 42;
    var r = { x: VW - BAR_R - w, y: mid - h / 2, w: w, h: h };

    fillRR(ctx, r.x, r.y, r.w, r.h, 22, 'rgba(16,26,34,0.8)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 22, T.edge, 1);

    /* 32 across with a 1px accent ring, as the handoff has it — the pill grew
       four pixels to take it. */
    avatarDisc(ctx, r.x + 6 + 16, mid, 32, Data.pilotImg(s.id), T.accent, 1);
    var tx = r.x + 6 + 32 + 10;
    /* THE NAME SITS ON ITS OWN, CENTRED. It used to carry "34 OPS COMPLETE"
       under it — a number that belongs with the goals, not with who is flying,
       and the design has the pill as avatar, name, rule, level and nothing
       else. The count still exists, at the head of the goal panel. */
    text(ctx, name, tx, mid,
         { font: T.head(14, 600), fill: T.ink, baseline: 'middle', track: 1.4 });

    var dx = tx + wText + 10;
    ctx.fillStyle = T.rule;
    ctx.fillRect(dx, mid - 13, 1, 26);

    var lx = dx + 1 + 10 + wLv / 2;
    text(ctx, String(s.level), lx, mid - 7,
         { font: T.mono(17, 600), fill: T.accent, align: 'center', baseline: 'middle' });
    text(ctx, 'LEVEL', lx, mid + 9,
         { font: T.head(9), fill: T.muted, align: 'center', baseline: 'middle', track: 1.4 });

    if (UI.zone(r, 'back')) App.replace(HomeScreen);
    return r;
  }

  /* ---- tier rail ------------------------------------------------------
     Seven chips on one row. The selected one takes flex 3.4 and is the only one
     that says its name; the first locked one takes 1.1 and shows the level it
     opens at; the rest are flex 1. Four gaps of... no: six gaps of 4px. */
  function tierWeights(tiers) {
    var w = [], firstLocked = -1, i;
    for (i = 0; i < tiers.length; i++) {
      if (!Progress.tierUnlocked(tiers[i].n) && firstLocked < 0) firstLocked = i;
    }
    for (i = 0; i < tiers.length; i++) {
      w.push(tiers[i].n === tierSel ? 3.4 : (i === firstLocked ? 1.1 : 1));
    }
    return { w: w, firstLocked: firstLocked };
  }

  function drawTierRail(ctx) {
    var tiers = Progress.tiers, tw = tierWeights(tiers);
    var gaps = (tiers.length - 1) * 4, total = 0, i;
    for (i = 0; i < tw.w.length; i++) total += tw.w[i];
    var unit = (RAIL.w - gaps) / total, x = RAIL.x;

    for (i = 0; i < tiers.length; i++) {
      var t = tiers[i], cw = tw.w[i] * unit;
      var r = { x: x, y: RAIL.y, w: cw, h: RAIL.h };
      var open = Progress.tierUnlocked(t.n), on = t.n === tierSel;
      var cx = r.x + r.w / 2;

      if (on) {
        var g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        g.addColorStop(0, 'rgba(56,197,216,0.18)');
        g.addColorStop(1, 'rgba(10,18,24,0.6)');
        fillRR(ctx, r.x, r.y, r.w, r.h, 5, g);
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, T.accent, 1);

        /* "T4  CRUISER  2 OF 7", one row, centred as a group. The count is the
           one thing the rail could say that the chips cannot show by colour:
           how much of this tier's fleet you actually have. */
        var prog = Progress.tierProgress(t.n);
        var count = prog.have + ' OF ' + prog.total;
        ctx.font = T.mono(12);
        var wT = ctx.measureText('T' + t.n).width;
        var label = t.label.toUpperCase();
        ctx.font = T.head(17, 700);
        var wL = ctx.measureText(label).width + 2 * label.length;
        ctx.font = T.mono(11);
        var wC = prog.total ? ctx.measureText(count).width + 10 : 0;
        var gx = cx - (wT + 8 + wL + wC) / 2;
        text(ctx, 'T' + t.n, gx, r.y + r.h / 2,
             { font: T.mono(12), fill: T.accent, baseline: 'middle' });
        text(ctx, label, gx + wT + 8, r.y + r.h / 2,
             { font: T.head(17, 700), fill: '#EAF5FA', baseline: 'middle', track: 2 });
        if (prog.total) {
          text(ctx, count, gx + wT + 8 + wL + 10, r.y + r.h / 2,
               { font: T.mono(11), fill: T.muted, baseline: 'middle' });
        }

      } else if (open) {
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, T.edge, 1);
        text(ctx, 'T' + t.n, cx, r.y + 15,
             { font: T.mono(12), fill: '#8FA3B0', align: 'center', baseline: 'middle' });
        /* the green dot: this tier is yours */
        fillRR(ctx, cx - 2.5, r.y + 24, 5, 5, 2.5, T.ready);

      } else if (i === tw.firstLocked) {
        fillRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.07)');
        dashRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.45)');
        text(ctx, 'T' + t.n, cx, r.y + 14,
             { font: T.mono(12), fill: T.warn, align: 'center', baseline: 'middle' });
        text(ctx, 'LV' + t.fromLevel, cx, r.y + 27,
             { font: T.mono(9), fill: T.warn, align: 'center', baseline: 'middle' });

      } else {
        dashRR(ctx, r.x, r.y, r.w, r.h, 5, T.edge);
        text(ctx, 'T' + t.n, cx, r.y + r.h / 2,
             { font: T.mono(12), fill: T.sealed, align: 'center', baseline: 'middle' });
      }

      if (UI.zone(r, open ? 'toggle' : 'deny')) {
        if (open) { tierSel = t.n; hs.x = 0; hs.v = 0; }
        else Sfx.play('deny');
      }
      x += cw + 4;
    }
  }

  /* ---- hull cards ------------------------------------------------------
     A single horizontal scroller: portrait 2:3 cards at the strip's full
     height, which at this size shows about two and a half of them. */
  function drawHullStrip(ctx) {
    var tier = Progress.tier(tierSel), list = (tier && tier.ships) || [];
    var contentW = list.length * (CARD_W + CARD_GAP) - CARD_GAP;
    var max = Math.max(0, contentW - STRIP.w);
    var p = App.ptr;

    if (p.downThisFrame && App.inRect(p.downX, p.downY, STRIP)) { hs.grab = true; hs.v = 0; }
    if (!p.down) hs.grab = false;
    if (hs.grab && p.dx) { hs.x -= p.dx; hs.v = -p.dx; }
    if (!hs.grab) { hs.x += hs.v; hs.v *= 0.92; if (Math.abs(hs.v) < 0.1) hs.v = 0; }
    if (hs.x < 0) { hs.x = 0; hs.v = 0; }
    if (hs.x > max) { hs.x = max; hs.v = 0; }

    var active = Save.activeShip(), pick = -1;
    ctx.save();
    ctx.beginPath(); ctx.rect(STRIP.x, STRIP.y, STRIP.w, STRIP.h); ctx.clip();
    for (var i = 0; i < list.length; i++) {
      var r = { x: STRIP.x + i * (CARD_W + CARD_GAP) - hs.x, y: STRIP.y,
                w: CARD_W, h: STRIP.h };
      if (r.x + r.w < STRIP.x - 4 || r.x > STRIP.x + STRIP.w + 4) continue;
      drawHullCard(ctx, list[i], r, list[i].key === active);
      if (UI.row(r, STRIP)) pick = i;
    }
    ctx.restore();

    /* NO SCROLLBAR. There was a 3px thumb along the foot of the strip, and it
       sat right under the cards' own buttons — a second horizontal rule in a
       row that already has several. A card half off the edge of the screen
       says the strip scrolls perfectly well, and the design does not draw one.
       `max` is still what clamps the drag above; only the indicator is gone. */

    if (pick >= 0) {
      var s = list[pick];
      /* No toast for picking a hull you already own: the card lights up and the
         Active Fit column changes, which is the whole message. A toast would be
         telling you what you are already looking at. */
      if (Save.owned(s.key)) Save.setActiveShip(s.key);
      else if (Progress.shipUnlocked(s)) {
        Save.unlockShip(s.key); Save.setActiveShip(s.key);
      } else Sfx.play('deny');
    }
  }

  /* ONE BOX, WHATEVER STATE IT IS IN.
     Header, well and button are the same height on an active card, an owned
     one and a locked one, so selecting a hull does not resize the thing you
     just looked at. Everything that used to live in the ACTIVE FIT column now
     sits in an overlay pinned to the foot of the ACTIVE card's well — slot
     toggle and fitting bay on one row, the weapon blend under it, and the
     hull/shield/power line under that. An inactive card shows the same three
     numbers in the same place and nothing else. */
  var CARD_PAD = 8, CARD_GAPY = 6, CARD_HEAD = 18, CARD_BTN = 40;

  function drawHullCard(ctx, s, r, active) {
    var owned = Save.owned(s.key), open = Progress.shipUnlocked(s);

    if (active) {
      var g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, 'rgba(56,197,216,0.12)');
      g.addColorStop(1, 'rgba(10,18,24,0.9)');
      fillRR(ctx, r.x, r.y, r.w, r.h, 8, g);
      strokeRR(ctx, r.x, r.y, r.w, r.h, 8, T.accent, 1);
    } else if (open) {
      fillRR(ctx, r.x, r.y, r.w, r.h, 8, 'rgba(11,18,24,0.9)');
      strokeRR(ctx, r.x, r.y, r.w, r.h, 8, T.edge, 1);
    } else {
      fillRR(ctx, r.x, r.y, r.w, r.h, 8, 'rgba(8,13,17,0.7)');
      dashRR(ctx, r.x, r.y, r.w, r.h, 8, T.edge);
    }

    /* header: name left, then how big the hull is, then which tier it is.
       The cell count is what a fit is actually budgeted against — a T4 with 65
       cells and a T4 with 108 are different ships — so it sits beside the tier
       rather than being something you only find in the fitting bay. */
    var hy = r.y + CARD_PAD;
    var badge = 'T' + Progress.tierOf(s);
    var cells = Geom.shipGrid(s).capacity + ' CELLS';
    ctx.font = T.mono(11);
    var bw = ctx.measureText(badge).width + 10;
    var cw = ctx.measureText(cells).width + 8;
    text(ctx, fitText(ctx, s.displayName.toUpperCase(),
                      r.w - CARD_PAD * 2 - bw - cw - 12, T.head(15, 700)),
         r.x + CARD_PAD, hy + CARD_HEAD / 2,
         { font: T.head(15, 700), baseline: 'middle', track: 1.6,
           fill: active ? '#EAF5FA' : open ? '#C7D6DE' : '#5D7280' });

    var br = { x: r.x + r.w - CARD_PAD - bw, y: hy + 1, w: bw, h: 15 };
    text(ctx, cells, br.x - 6, hy + CARD_HEAD / 2,
         { font: T.mono(11), align: 'right', baseline: 'middle',
           fill: active ? '#8FB6C6' : open ? '#6F8795' : '#4A5C68' });
    if (active) {
      fillRR(ctx, br.x, br.y, br.w, br.h, 2, T.accent);
      text(ctx, badge, br.x + br.w / 2, br.y + br.h / 2,
           { font: T.mono(11, 600), fill: '#05080B', align: 'center', baseline: 'middle' });
    } else {
      strokeRR(ctx, br.x, br.y, br.w, br.h, 2,
               open ? T.edgeUp : 'rgba(232,163,61,0.4)', 1);
      text(ctx, badge, br.x + br.w / 2, br.y + br.h / 2,
           { font: T.mono(11), fill: open ? '#8FA3B0' : T.warn,
             align: 'center', baseline: 'middle' });
    }

    /* the well — identical in every state */
    var well = { x: r.x + CARD_PAD, y: hy + CARD_HEAD + CARD_GAPY,
                 w: r.w - CARD_PAD * 2, h: 0 };
    well.h = (r.y + r.h - CARD_PAD - CARD_BTN - CARD_GAPY) - well.y;

    stripesRR(ctx, well.x, well.y, well.w, well.h, 5, 115,
              active ? 'rgba(56,197,216,0.16)' : open ? 'rgba(120,170,200,0.10)'
                                                      : 'rgba(120,170,200,0.07)',
              open ? 'rgba(8,14,19,0.9)' : 'rgba(8,13,17,0.9)', 6);

    var layout = owned && Save.activeLayout(s.key);
    var stats = null, ready = false;
    if (open && layout && layout.modules.length) {
      var v = Geom.validate(s, layout.modules, Data.modules);
      stats = v.stats; ready = v.ok;
    }

    if (open) {
      /* The design's well is a striped placeholder because it had no ship art.
         We have the hull itself, so draw it.

         THE RENDER BOX IS THE WHOLE WELL, IN EVERY STATE. The overlay below is
         positioned over it, not laid out beside it — so selecting a hull does
         not shove its picture upwards to make room for the controls that just
         appeared. It used to inset the foot by however much the panel covered,
         which meant the ship jumped the moment you tapped the card. */
      /* HULL is the ship and nothing else — no grid, no fit, no ground. MODULES
         is the ship with its grid and whatever is bolted to it. */
      var showMods = Save.hullView('hangar') === 'modules';
      var box = { x: well.x + 10, y: well.y + 10, w: well.w - 20, h: well.h - 20 };
      if (owned && showMods) {
        ShipView.draw(ctx, s, (layout || {}).modules, box,
                      { maxCell: 44, solid: active ? '#0A151C' : '#0A1016' });
      } else {
        ShipView.draw(ctx, s, null, box, { maxCell: 44, cells: false, artAlpha: 1 });
      }
    } else {
      text(ctx, 'LOCKED', well.x + well.w / 2, well.y + well.h / 2,
           { font: T.mono(10), fill: '#5D7280', align: 'center', baseline: 'middle', track: 1 });
    }

    if (open) drawCardOverlay(ctx, s, well, active, owned, stats);

    /* the button — one height for all of them, so nothing jumps */
    var b = { x: r.x + CARD_PAD, y: r.y + r.h - CARD_PAD - CARD_BTN,
              w: r.w - CARD_PAD * 2, h: CARD_BTN };
    if (active) {
      if (ready) {
        ctx.save();
        ctx.shadowColor = 'rgba(56,197,216,0.3)'; ctx.shadowBlur = 20;
        fillRR(ctx, b.x, b.y, b.w, b.h, 5, T.accent);
        ctx.restore();
        text(ctx, 'ENTER ARENA', b.x + b.w / 2, b.y + b.h / 2,
             { font: T.head(15, 700), fill: T.onAccent,
               align: 'center', baseline: 'middle', track: 2.6 });
        if (UI.zone(b, 'launch')) launchArena(s.key, layout);
      } else {
        /* A HULL THAT CANNOT FLY GETS THE WAY OUT NEXT TO THE PROBLEM. The
           row was one dead NOT FLIGHT READY button that said no and offered
           nothing; the fix — a default autofit — was two screens away in the
           fitting bay. AUTOFIT takes the narrow half on the left, the verdict
           expands into the rest. */
        var afw = b.w < 260 ? 74 : 92;
        var af = { x: b.x, y: b.y, w: afw, h: b.h };
        var mb = { x: b.x + afw + 6, y: b.y, w: b.w - afw - 6, h: b.h };

        fillRR(ctx, af.x, af.y, af.w, af.h, 5, 'rgba(56,197,216,0.08)');
        strokeRR(ctx, af.x, af.y, af.w, af.h, 5, T.accent, 1);
        text(ctx, 'AUTOFIT', af.x + af.w / 2, af.y + af.h / 2,
             { font: T.head(13, 700), fill: T.accent,
               align: 'center', baseline: 'middle', track: 1.6 });

        fillRR(ctx, mb.x, mb.y, mb.w, mb.h, 5, 'rgba(120,170,200,0.08)');
        strokeRR(ctx, mb.x, mb.y, mb.w, mb.h, 5, T.edge, 1);
        text(ctx, fitText(ctx, 'NOT FLIGHT READY', mb.w - 12, T.head(15, 700)),
             mb.x + mb.w / 2, mb.y + mb.h / 2,
             { font: T.head(15, 700), fill: T.sealed,
               align: 'center', baseline: 'middle', track: 2.6 });

        if (UI.zone(af, 'autofit')) autofitInto(s);
        else UI.zone(mb, 'deny');
      }
    } else if (open) {
      strokeRR(ctx, b.x, b.y, b.w, b.h, 5, T.edgeUp, 1);
      text(ctx, owned ? 'SELECT' : 'CLAIM', b.x + b.w / 2, b.y + b.h / 2,
           { font: T.head(13, 600), fill: '#A9BDC8', align: 'center',
             baseline: 'middle', track: 2.4 });
    } else {
      fillRR(ctx, b.x, b.y, b.w, b.h, 5, 'rgba(232,163,61,0.08)');
      strokeRR(ctx, b.x, b.y, b.w, b.h, 5, 'rgba(232,163,61,0.4)', 1);
      text(ctx, 'LVL ' + Progress.levelOfShip(s.key), b.x + b.w / 2, b.y + b.h / 2,
           { font: T.head(13, 700), fill: T.warn, align: 'center',
             baseline: 'middle', track: 2 });
    }
  }

  /* The panel that sits ON the hull render, pinned to the bottom of the well.
     On the active card it is the whole of the old ACTIVE FIT column; on any
     other owned hull it is just the three numbers, in the same place, so the
     eye does not have to move when you switch between them. */
  function drawCardOverlay(ctx, s, well, active, owned, stats) {
    var pad = 8, rowH = 28, barH = 7, lineH = 13;
    var h = active ? (pad + rowH + 7 + barH + 7 + lineH + pad)
                   : (pad + lineH + pad);
    var y0 = well.y + well.h - h;

    /* the scrim: transparent at the top so the hull is not cut off by a hard
       edge, opaque by the time it reaches the controls */
    ctx.save();
    rr(ctx, well.x, well.y, well.w, well.h, 5); ctx.clip();
    var g = ctx.createLinearGradient(0, y0, 0, well.y + well.h);
    g.addColorStop(0, 'rgba(4,8,11,0)');
    g.addColorStop(active ? 0.42 : 0.55, 'rgba(4,8,11,0.9)');
    g.addColorStop(1, 'rgba(4,8,11,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(well.x, y0, well.w, h);
    ctx.restore();

    var x = well.x + pad, w = well.w - pad * 2, y = y0 + pad;

    if (active) {
      /* left: the three fit slots. A proper segmented toggle, same as the
         fitting bay's own. */
      var key = s.key, act = Save.activeLayoutIndex(key);
      var cw = 26, tw = 2 + Save.SLOTS * cw + (Save.SLOTS - 1) * 3 + 2;
      var tr = { x: x, y: y, w: tw, h: rowH };
      fillRR(ctx, tr.x, tr.y, tr.w, tr.h, 5, 'rgba(6,12,16,0.85)');
      strokeRR(ctx, tr.x, tr.y, tr.w, tr.h, 5, T.edgeUp, 1);
      for (var i = 0; i < Save.SLOTS; i++) {
        var c = { x: tr.x + 2 + i * (cw + 3), y: tr.y + 2, w: cw, h: tr.h - 4 };
        var li = Save.layout(key, i);
        var has = !!(li && li.modules.length);
        var okFit = has && Geom.validate(s, li.modules, Data.modules).ok;
        var on = i === act;
        if (on) fillRR(ctx, c.x, c.y, c.w, c.h, 3, T.accent);
        text(ctx, String(i + 1), c.x + c.w / 2, c.y + c.h / 2,
             { font: T.mono(11, 600), align: 'center', baseline: 'middle',
               fill: on ? T.onAccent : has ? (okFit ? T.ink : T.warn) : '#5D7280' });
        if (UI.zone(c, 'toggle')) Save.setActiveLayoutIndex(key, i);
      }

      /* right: into the fitting bay */
      var fb = { x: tr.x + tw + 7, y: y, w: w - tw - 7, h: rowH };
      fillRR(ctx, fb.x, fb.y, fb.w, fb.h, 5, 'rgba(56,197,216,0.14)');
      strokeRR(ctx, fb.x, fb.y, fb.w, fb.h, 5, T.accent, 1);
      ctx.font = T.head(11, 700);
      var lab = 'FITTING BAY';
      var lw = ctx.measureText(lab).width + 1.4 * lab.length;
      var gx = fb.x + (fb.w - lw - 6 - 9) / 2;
      text(ctx, lab, gx, fb.y + fb.h / 2,
           { font: T.head(11, 700), fill: T.accent, baseline: 'middle', track: 1.4 });
      text(ctx, '\u2192', gx + lw + 6, fb.y + fb.h / 2,
           { font: T.mono(11), fill: T.accent, baseline: 'middle' });
      if (UI.zone(fb, 'open')) App.push(FittingScreen(key, act));

      y += rowH + 7;

      /* the weapon blend, as a bar and nothing else — the percentages that
         used to be written under it are replaced by the three numbers below,
         which are what you actually compare hulls on. */
      var mix = stats ? stats.mix : { ballistic: 0, missile: 0, laser: 0 };
      var tot = mix.ballistic + mix.missile + mix.laser;
      fillRR(ctx, x, y, w, barH, 2, T.track);
      if (tot > 0) {
        var parts = [['ballistic', T.cat.ballistic], ['missile', T.cat.missile],
                     ['laser', T.cat.laser]], cx = x;
        ctx.save();
        rr(ctx, x, y, w, barH, 2); ctx.clip();
        for (var pi = 0; pi < parts.length; pi++) {
          var seg = w * mix[parts[pi][0]] / tot;
          ctx.fillStyle = parts[pi][1];
          ctx.fillRect(cx, y, seg, barH);
          cx += seg;
        }
        ctx.restore();
      }
      y += barH + 7;
    }

    /* HULL / SHD / PWR are the design's three; EHP and DPS are the two numbers
       you actually compare two fits on, and they were only visible from inside
       the fitting bay. An unfitted hull has none of them yet, so it reports the
       two things that ARE true about it instead. */
    var sy = y + lineH / 2, sx = x;
    if (stats) {
      sx = statChip(ctx, 'HULL', k(stats.health), T.ink, sx, sy);
      sx = statChip(ctx, 'SHD',  k(stats.shield), T.cat.shield, sx, sy);
      sx = statChip(ctx, 'PWR',  k(stats.powerGen), T.cat.reactor, sx, sy);
      sx = statChip(ctx, 'EHP',  k(stats.ehp), T.white, sx, sy);
      statChip(ctx, 'DPS', k(stats.dps), T.cat.ballistic, sx, sy);
    } else {
      sx = statChip(ctx, 'CELLS', String(Geom.shipGrid(s).capacity), T.ink, sx, sy);
      statChip(ctx, 'LV', String(s.requiredLevelSource || 1), T.accent, sx, sy);
    }
  }

  /* "HULL 4.8k" — a muted label and a tinted number, returning the next x. */
  function statChip(ctx, label, value, tint, x, y) {
    text(ctx, label, x, y, { font: T.mono(11), fill: T.muted, baseline: 'middle' });
    ctx.font = T.mono(11);
    x += ctx.measureText(label + ' ').width;
    text(ctx, value, x, y, { font: T.mono(11), fill: tint, baseline: 'middle' });
    return x + ctx.measureText(value).width + 6;
  }

  /* Break a string into at most `max` lines that fit `w`. A word longer than
     the line is left to overflow rather than hyphenated — none of the ops text
     has one, and a broken word reads worse than a slightly long line. */
  function wrapText(ctx, str, w, font, max) {
    ctx.font = font;
    var words = String(str || '').split(/\s+/), out = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (line && ctx.measureText(t).width > w) {
        if (out.length === max - 1) {
          /* the last line we are allowed: take the whole remainder and elide */
          out.push(fitText(ctx, line + ' ' + words.slice(i).join(' '), w, font));
          return out;
        }
        out.push(line);
        line = words[i];
      } else line = t;
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  }

  /* ---- the GOAL panel --------------------------------------------------
     Handoff 1a: one drop-down under the chip holding both halves of the old
     column — the goal on top, the unlocks under it, one dashed row each for
     what is still sealed. There are no tabs because there is nothing to
     choose between: these are two readings of the same ladder, and the old
     toggle made you flip between them to answer one question ("what am I
     doing, and what does it get me").

     Rows are measured, not fixed, so the panel is exactly as tall as what is
     in it and never the 614 it is allowed. */
  var ROW_H = 26, HEAD_H = 13, SEAL_H = 26, SECTION_GAP = 8;
  var UNLOCKS = 6, HAD = 3;        /* still to come, and just handed over     */

  function opsDoneCount() {
    var all = Progress.all(), n = 0;
    for (var i = 0; i < all.length; i++) if (Progress.done(all[i].id)) n++;
    return n;
  }

  /* One line each, and the goal card is as tall as its wrapped text. */
  function goalCardH(ctx, op) {
    if (!op) return ROW_H;
    var lines = wrapText(ctx, op.desc || op.name, PANEL.w - PANEL_PAD_X * 2 - 16 - 34,
                         T.body(13, 500), 2);
    return 7 + lines.length * 16 + 5 + 3 + 7;
  }

  function panelRect(ctx) {
    var op = Progress.available()[0] || null;
    /* what you have just been given, then what is still to come */
    var up = Progress.recent(HAD).concat(Progress.upcoming(UNLOCKS));
    var h = PANEL_PAD_Y * 2
          + HEAD_H + PANEL_GAP
          + goalCardH(ctx, op) + PANEL_GAP
          + SEAL_H + PANEL_GAP
          + SECTION_GAP + PANEL_GAP
          + HEAD_H + PANEL_GAP
          + up.length * (ROW_H + PANEL_GAP)
          + SEAL_H;
    if (h > PANEL.maxH) h = PANEL.maxH;
    return { x: PANEL.x, y: PANEL.y, w: PANEL.w, h: h, op: op, up: up };
  }

  /* A section heading: the name left, a reading of where you are right. */
  function panelHead(ctx, x, y, w, left, right) {
    text(ctx, left, x, y + HEAD_H / 2,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });
    text(ctx, right, x + w, y + HEAD_H / 2,
         { font: T.mono(10), fill: '#6F8795', align: 'right', baseline: 'middle' });
    return y + HEAD_H + PANEL_GAP;
  }

  /* The dashed row standing for everything not yet revealed. */
  function sealedRow(ctx, x, y, w, label, n) {
    dashRR(ctx, x, y, w, SEAL_H, 5, T.edge);
    strokeRR(ctx, x + 8, y + (SEAL_H - 9) / 2, 7, 9, 1, T.sealed, 1);
    text(ctx, label, x + 8 + 7 + 6, y + SEAL_H / 2,
         { font: T.body(12), fill: '#5D7280', baseline: 'middle' });
    text(ctx, String(n), x + w - 8, y + SEAL_H / 2,
         { font: T.mono(11), fill: '#6F8795', align: 'right', baseline: 'middle' });
    return y + SEAL_H + PANEL_GAP;
  }

  function drawGoalPanel(ctx) {
    if (!panelOpen) return;
    var R = panelRect(ctx);

    /* the scrim, from under the bar down — the bar itself stays live, so the
       chip can shut what it opened */
    ctx.fillStyle = 'rgba(2,5,8,0.45)';
    ctx.fillRect(0, BODY_Y, VW, VH - BODY_Y);

    fillRR(ctx, R.x, R.y, R.w, R.h, 8, 'rgba(6,11,15,0.97)');
    strokeRR(ctx, R.x, R.y, R.w, R.h, 8, 'rgba(120,170,200,0.22)', 1);

    var x = R.x + PANEL_PAD_X, w = R.w - PANEL_PAD_X * 2, y = R.y + PANEL_PAD_Y;

    /* ---- the goal ---- */
    y = panelHead(ctx, x, y, w, 'GOAL', opsDoneCount() + ' DONE');

    var op = R.op, ch = goalCardH(ctx, op);
    if (op) {
      var pr = Progress.opProgress(op);
      fillRR(ctx, x, y, w, ch, 5, 'rgba(232,163,61,0.06)');
      strokeRR(ctx, x, y, w, ch, 5, 'rgba(232,163,61,0.4)', 1);
      ctx.font = T.mono(11);
      var cnt = pr.have + '/' + pr.need, cw = ctx.measureText(cnt).width;
      var lines = wrapText(ctx, op.desc || op.name, w - 16 - cw - 8, T.body(13, 500), 2);
      for (var li = 0; li < lines.length; li++) {
        text(ctx, lines[li], x + 8, y + 7 + li * 16 + 8,
             { font: T.body(13, 500), fill: T.ink, baseline: 'middle' });
      }
      text(ctx, cnt, x + w - 8, y + 15,
           { font: T.mono(11), fill: T.warn, align: 'right', baseline: 'middle' });
      var by = y + ch - 7 - 3;
      fillRR(ctx, x + 8, by, w - 16, 3, 1.5, T.track);
      if (pr.have > 0) {
        fillRR(ctx, x + 8, by, Math.max(2, (w - 16) * pr.have / pr.need), 3, 1.5, T.warn);
      }
    } else {
      strokeRR(ctx, x, y, w, ch, 5, T.edge, 1);
      text(ctx, 'ALL GOALS COMPLETE', x + w / 2, y + ch / 2,
           { font: T.mono(10), fill: T.ready, align: 'center', baseline: 'middle', track: 1 });
    }
    y += ch + PANEL_GAP;

    var all = Progress.all().length, done = opsDoneCount();
    y = sealedRow(ctx, x, y, w, 'Sealed goals', all - done - (op ? 1 : 0));
    y += SECTION_GAP;

    /* ---- what it unlocks ---- */
    y = panelHead(ctx, x, y, w, 'UNLOCKS', 'LEVEL ' + Progress.level());

    var up = R.up, floor = R.y + R.h - PANEL_PAD_Y - SEAL_H;
    /* The first row still to come is the amber one — the next thing you get.
       Rows above it are things you already have, and they are the accent's, so
       the list reads in one glance as behind me / next / after that. */
    var nextIx = -1;
    for (var n = 0; n < up.length; n++) if (!up[n].had) { nextIx = n; break; }
    for (var i = 0; i < up.length; i++) {
      if (y + ROW_H > floor) break;
      var u = up[i], first = i === nextIx, had = !!u.had;
      if (first) {
        fillRR(ctx, x, y, w, ROW_H, 5, 'rgba(232,163,61,0.06)');
        strokeRR(ctx, x, y, w, ROW_H, 5, 'rgba(232,163,61,0.45)', 1);
      } else if (had) {
        fillRR(ctx, x, y, w, ROW_H, 5, 'rgba(56,197,216,0.05)');
        strokeRR(ctx, x, y, w, ROW_H, 5, 'rgba(56,197,216,0.38)', 1);
      } else {
        strokeRR(ctx, x, y, w, ROW_H, 5, 'rgba(120,170,200,0.14)', 1);
      }
      /* A row you already have shows a tick, not a level: the level it arrived
         on is history, and the only thing worth saying about it is that it is
         yours. Drawn, not typed — a glyph would depend on the font having one
         and would sit on the text baseline rather than in the row. */
      if (had) tick(ctx, x + 8, y + ROW_H / 2, T.accent);
      else text(ctx, String(u.level), x + 8, y + ROW_H / 2,
                { font: T.mono(12, 600), fill: first ? T.warn : '#8FA3B0',
                  baseline: 'middle' });
      /* the kind sits on the SAME line, right — the old column put it on a
         second one and paid 13px a row for it */
      var kindLabel = u.kind === 'ship' ? 'SHIP' : u.family.toUpperCase();
      var kindTint = u.kind === 'ship' ? T.accent : T.fam[u.family] || T.fam.utility;
      ctx.font = T.mono(9.5);
      var kw = ctx.measureText(kindLabel).width + 0.6 * kindLabel.length;
      var nx = x + 8 + 22 + 8;
      /* THE HULL CARD'S OWN TIER BADGE, not a "· T2" glued to the name — same
         mono 11 in a 15-tall outlined pill, so a tier reads the same wherever
         it appears. The badge is measured first and the name is fitted to what
         is left, or a long hull name would push it off the row. */
      var tb = 0;
      if (u.tier) { ctx.font = T.mono(11); tb = ctx.measureText('T' + u.tier).width + 10 + 6; }
      text(ctx, fitText(ctx, u.label, x + w - 8 - kw - 8 - tb - nx, T.body(12, 500)),
           nx, y + ROW_H / 2,
           { font: T.body(12, 500), fill: T.ink, baseline: 'middle' });
      if (u.tier) {
        var bt = first ? T.warn : had ? T.accent : '#8FA3B0';
        ctx.font = T.body(12, 500);
        var bx = nx + ctx.measureText(fitText(ctx, u.label,
                     x + w - 8 - kw - 8 - tb - nx, T.body(12, 500))).width + 6;
        var bw2 = tb - 6, by2 = y + (ROW_H - 15) / 2;
        strokeRR(ctx, bx, by2, bw2, 15, 2, bt + '99', 1);
        text(ctx, 'T' + u.tier, bx + bw2 / 2, by2 + 7.5,
             { font: T.mono(11), fill: bt, align: 'center', baseline: 'middle' });
      }
      text(ctx, kindLabel, x + w - 8 - kw, y + ROW_H / 2,
           { font: T.mono(9.5), fill: kindTint, baseline: 'middle', track: 0.6 });
      y += ROW_H + PANEL_GAP;
    }
    if (!up.length) {
      text(ctx, 'EVERYTHING IS UNLOCKED', x + w / 2, y + ROW_H / 2,
           { font: T.mono(10), fill: T.ready, align: 'center', baseline: 'middle', track: 1 });
      y += ROW_H + PANEL_GAP;
    }
    /* Only the rows still to COME come off the sealed count — the ones you
       already own were never in it. */
    var ahead = 0;
    for (var s2 = 0; s2 < up.length; s2++) if (!up[s2].had) ahead++;
    sealedRow(ctx, x, y, w, 'Sealed unlocks', sealedUnlocks(ahead));
  }

  /* Everything the ladder still owes, less what this panel is already showing.
     Counted off the roster rather than by asking `upcoming` for a thousand
     rows and measuring the answer — this runs every frame the panel is open. */
  function sealedUnlocks(shown) {
    var lv = Progress.level(), n = 0, i;
    for (i = 0; i < Data.shipList.length; i++) {
      if (Progress.levelOfShip(Data.shipList[i].key) > lv) n++;
    }
    var mk = Object.keys(Data.modules);
    for (i = 0; i < mk.length; i++) {
      if (Progress.levelOfModule(mk[i]) > lv) n++;
    }
    n -= shown;
    return n > 0 ? n : 0;
  }

  /* A TAP ANYWHERE BUT THE PANEL SHUTS IT, bar included. Two separate jobs in
     here, and they are not the same rule:

     1. SHUTTING. Any tap outside the panel and outside the chip closes it —
        including in the top bar, which the scrim does not cover. The chip is
        excluded because it has its own toggle: closing here and toggling there
        in the same frame would cancel out and the panel would never shut.
        Closing does NOT swallow the tap in the bar, so mute, GAMES and the
        pilot pill still do their job on the way past, which is what a person
        tapping them meant.

     2. SWALLOWING. Hit-testing is paint order — the first zone drawn under the
        finger claims it — and the panel paints last, so a tap on the scrim
        would otherwise land on the hull card behind it. Only the body is
        swallowed, and only while the panel is up.

     Runs before anything paints, which is why it can claim at all. */
  function panelHits() {
    if (!panelOpen) return;
    var p = App.ptr;
    var R = { x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.maxH };
    var onPanel = App.inRect(p.x, p.y, R);
    var onChip  = chipRect && App.inRect(p.x, p.y, chipRect);

    if (p.upThisFrame && !p.dragged && !onPanel && !onChip) panelOpen = false;
    if (!onPanel && p.y >= BAR_H) p.claimed = true;
  }

  /* Fit the selected hull's selected slot, and only with what this pilot has
     unlocked. The slot is whichever one the card is showing, so the button
     fills the fit you are looking at and not some other one. The card redraws
     from the save, so there is nothing to announce: the button under your
     finger becomes ENTER ARENA.

     ONE RECIPE, NOT THE BAY'S. This button has no menu, so it is not a
     shortcut to the bay's defaults — it is the one fit it makes: ballistic
     guns, mostly armour, weapons first. Plain, sturdy and aggressive, which is
     what a hull that cannot fly wants in order to be able to. Anything else is
     what the fitting bay's own AUTOFIT menu is for. */
  function autofitInto(s) {
    var ix = Save.activeLayoutIndex(s.key);
    var built = Autofit.build(s, {
      weapons: 'ballistic', armour: 'armour', priority: 'weapons',
      allow: function (m) { return Progress.moduleUnlocked(m); }
    }, Data.modules);
    var cur = Save.layout(s.key, ix);
    Save.setLayout(s.key, ix, { name: (cur && cur.name) || '', modules: built });
  }

  /* ---- into the arena --------------------------------------------------
     A fight is DRAWN, never chosen: the opponent comes out of the pool for the
     hull's tier. Nothing here or in progression may name one.

     The result is a screen of its own (1d/1e/1f) and it needs the level-up,
     which only exists once the battle has been folded into progression — so
     the order is: battle ends, we record it, and what comes back is what the
     result screen shows. */
  function launchArena(key, layout) {
    var ship = Data.ship(key);
    var fit = { shipId: key, modules: layout.modules };
    var tier = Progress.tierOf(ship);
    var opp = Opponents.draw(ship);
    if (!opp) { Sfx.play('deny'); return; }
    var fitIx = Save.activeLayoutIndex(key);

    App.push(BattleScreen({
      playerFit: fit,
      enemyFit: Opponents.fitFor(opp),
      opponent: opp,
      fitIndex: fitIx,
      onDone: function (result) {
        App.pop();                                   /* the arena is done */
        if (!result) return;
        Save.recordResult(result.opponentId, result.won);

        /* Hand the battle to progression as a description of WHAT happened,
           never of who it was against. */
        var sum = Geom.summarise(ship, fit.modules, Data.modules);
        var subs = {}, types = {}, mods = {}, turrets = 0;
        for (var i = 0; i < fit.modules.length; i++) {
          var m = Data.module(fit.modules[i].moduleId);
          if (!m) continue;
          subs[m.subtype] = (subs[m.subtype] || 0) + 1;
          mods[m.key] = (mods[m.key] || 0) + 1;
          if (m.subtype === 'weapon' && m.damageType) types[m.damageType] = 1;
          if (m.turret) turrets++;
        }
        var gained = Progress.recordBattle({
          kind: 'battle', won: result.won, reason: result.reason,
          time: result.time, health: result.playerHealth,
          modulesLost: result.modulesLost,
          shipId: key,
          hullTier: tier,
          oppTier: opp.tier || Progress.tierOf(Data.ship(opp.ship.shipId)),
          cells: Geom.shipGrid(ship).capacity, cellsUsed: sum.cellsUsed,
          weapons: sum.weapons, reactors: sum.reactors,
          turrets: turrets, subs: subs, types: types, mods: mods
        });

        App.push(ResultScreen({
          result: result, gained: gained, shipKey: key, opponent: opp,
          modules: fit.modules,
          onRematch: function () { App.pop(); launchArena(key, layout); },
          onRefit:   function () { App.pop(); App.push(FittingScreen(key, fitIx)); },
          onHangar:  function () { App.pop(); }
        }));
      }
    }));
  }

  return {
    enter: function () {
      panelOpen = false; chipRect = null;
      var key = Save.activeShip();
      if (key && Data.ship(key)) tierSel = Progress.tierOf(Data.ship(key));
      hs.x = 0; hs.v = 0;
      Music.to('hangar');
    },
    resume: function () {
      var key = Save.activeShip();
      if (key && Data.ship(key)) tierSel = Progress.tierOf(Data.ship(key));
      Music.to('hangar');
    },
    update: function () {},

    draw: function (ctx) {
      panelHits();
      drawGround(ctx);
      drawTopBar(ctx);
      drawTierRail(ctx);
      drawHullStrip(ctx);
      drawGoalPanel(ctx);
    }
  };
})();
