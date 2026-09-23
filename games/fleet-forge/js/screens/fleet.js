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
  var opsTab = 'ops';                          /* 'ops' | 'unlocks' */
  var msg = null, msgT = 0;

  /* ---- the design's boxes, at 1333x690 ---------------------------------
     Handoff 1aa: two columns, `minmax(0,1fr) 324px`. There used to be a third,
     a 216px ACTIVE FIT panel between the fleet and the operations. It is gone:
     everything it held now sits on the active hull's own card, where the thing
     being configured and the controls that configure it are in one place, and
     the operations column took half its width. */
  var BAR_H = 58, BAR_L = 140, BAR_R = 18;     /* 140px reserved for ← Games */
  var BODY_Y = BAR_H, BODY_H = VH - BAR_H;     /* 58 .. 690 */
  var OPS_W = 324;
  var OPS_X = VW - OPS_W;

  var FLEET = { x: 12, y: BODY_Y + 9, w: OPS_X - 24, h: BODY_H - 18 };
  var RAIL  = { x: FLEET.x, y: FLEET.y, w: FLEET.w, h: 40 };
  var STRIP  = { x: FLEET.x, y: RAIL.y + RAIL.h + 8,
                 w: FLEET.w, h: FLEET.h - RAIL.h - 8 };
  var CARD_W = STRIP.h * 2 / 3, CARD_GAP = 10;  /* portrait 2:3, min 176 */
  var OPS   = { x: OPS_X + 1 + 10, y: BODY_Y + 9, w: OPS_W - 1 - 20, h: BODY_H - 18 };

  function say(s) { msg = s; msgT = 3.5; }
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
    text(ctx, 'HANGAR', x, mid,
         { font: T.head(13, 600), fill: T.accent, baseline: 'middle', track: 2.4 });

    drawPilotChip(ctx, mid);
  }

  /* The pilot pill on the right of the bar: avatar, name over ops, a rule, and
     the level. Its width is measured rather than fixed, because "Captain Ezra"
     and "Captain Caleb" are not the same width and the design pins the right
     edge, not the left. */
  function drawPilotChip(ctx, mid) {
    var s = Save.summary(Save.pilot());
    var name = 'CAPTAIN ' + s.name.toUpperCase(), sub = s.ops + ' OPS COMPLETE';
    ctx.font = T.head(14, 600);
    var wName = ctx.measureText(name).width + 1.4 * name.length;
    ctx.font = T.mono(10);
    var wSub = ctx.measureText(sub).width;
    var wText = Math.max(wName, wSub);
    ctx.font = T.mono(17, 600);
    var wNum = ctx.measureText(String(s.level)).width;
    ctx.font = T.head(9);
    var wLv = Math.max(wNum, ctx.measureText('LEVEL').width + 1.4 * 5);

    var w = 6 + 28 + 10 + wText + 10 + 1 + 10 + wLv + 13, h = 42;
    var r = { x: VW - BAR_R - w, y: mid - h / 2, w: w, h: h };

    fillRR(ctx, r.x, r.y, r.w, r.h, 22, 'rgba(16,26,34,0.8)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 22, T.edge, 1);

    hatchDisc(ctx, r.x + 6 + 14, mid, 28, 'rgba(140,190,215,0.25)');
    var tx = r.x + 6 + 28 + 10;
    text(ctx, name, tx, mid - 7,
         { font: T.head(14, 600), fill: T.ink, baseline: 'middle', track: 1.4 });
    text(ctx, sub, tx, mid + 9, { font: T.mono(10), fill: T.muted, baseline: 'middle' });

    var dx = tx + wText + 10;
    ctx.fillStyle = T.rule;
    ctx.fillRect(dx, mid - 13, 1, 26);

    var lx = dx + 1 + 10 + wLv / 2;
    text(ctx, String(s.level), lx, mid - 7,
         { font: T.mono(17, 600), fill: T.accent, align: 'center', baseline: 'middle' });
    text(ctx, 'LEVEL', lx, mid + 9,
         { font: T.head(9), fill: T.muted, align: 'center', baseline: 'middle', track: 1.4 });

    if (UI.zone(r, 'back')) App.replace(HomeScreen);
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
        else say('Tier ' + t.n + ' opens at level ' + t.fromLevel);
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

    if (max > 0) {          /* the strip's own rule, so it reads as scrollable */
      var tw2 = STRIP.w * (STRIP.w / contentW);
      fillRR(ctx, STRIP.x + (STRIP.w - tw2) * (hs.x / max), STRIP.y + STRIP.h - 3,
             tw2, 3, 1.5, T.edge);
    }

    if (pick >= 0) {
      var s = list[pick];
      /* No toast for picking a hull you already own: the card lights up and the
         Active Fit column changes, which is the whole message. A toast would be
         telling you what you are already looking at. */
      if (Save.owned(s.key)) Save.setActiveShip(s.key);
      else if (Progress.shipUnlocked(s)) {
        Save.unlockShip(s.key); Save.setActiveShip(s.key);
        say(s.displayName + ' joined your fleet');
      } else say(s.displayName + ' unlocks at level ' + Progress.levelOfShip(s.key));
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

    /* header: name left, tier badge right */
    var hy = r.y + CARD_PAD;
    var badge = 'T' + Progress.tierOf(s);
    ctx.font = T.mono(11);
    var bw = ctx.measureText(badge).width + 10;
    text(ctx, fitText(ctx, s.displayName.toUpperCase(),
                      r.w - CARD_PAD * 2 - bw - 8, T.head(15, 700)),
         r.x + CARD_PAD, hy + CARD_HEAD / 2,
         { font: T.head(15, 700), baseline: 'middle', track: 1.6,
           fill: active ? '#EAF5FA' : open ? '#C7D6DE' : '#5D7280' });

    var br = { x: r.x + r.w - CARD_PAD - bw, y: hy + 1, w: bw, h: 15 };
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
      ShipView.draw(ctx, s, owned ? (layout || {}).modules : null,
                    { x: well.x + 10, y: well.y + 10,
                      w: well.w - 20, h: well.h - 20 },
                    { maxCell: 44, solid: active ? '#0A151C' : '#0A1016' });
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
      } else {
        fillRR(ctx, b.x, b.y, b.w, b.h, 5, 'rgba(120,170,200,0.08)');
        strokeRR(ctx, b.x, b.y, b.w, b.h, 5, T.edge, 1);
      }
      text(ctx, ready ? 'ENTER ARENA' : 'NOT FLIGHT READY', b.x + b.w / 2, b.y + b.h / 2,
           { font: T.head(15, 700), fill: ready ? T.onAccent : T.sealed,
             align: 'center', baseline: 'middle', track: 2.6 });
      if (UI.zone(b, ready ? 'launch' : 'deny')) {
        if (ready) launchArena(s.key, layout);
        else say(Geom.validate(s, (layout && layout.modules) || [], Data.modules)
                     .errors[0] || 'Fit is not flight ready');
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
      statChip(ctx, 'LV', String(s.lr || 1), T.accent, sx, sy);
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

  /* ---- operations / unlocks column (324px) ----------------------------- */
  function drawOps(ctx) {
    ctx.fillStyle = 'rgba(4,8,11,0.85)';
    ctx.fillRect(OPS_X, BODY_Y, OPS_W, BODY_H);
    ctx.fillStyle = T.rule;
    ctx.fillRect(OPS_X, BODY_Y, 1, BODY_H);

    var showOps = opsTab === 'ops';
    var all = Progress.all(), done = 0;
    for (var i = 0; i < all.length; i++) if (Progress.done(all[i].id)) done++;

    text(ctx, showOps ? 'OPERATIONS' : 'UNLOCKS', OPS.x, OPS.y + 7,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });
    text(ctx, showOps ? (done + '/' + all.length + ' DONE')
                     : ('NEXT ' + Progress.upcoming(12).length),
         OPS.x + OPS.w, OPS.y + 7,
         { font: T.mono(10), fill: T.muted, align: 'right', baseline: 'middle' });

    var toggleH = 31, y = OPS.y + 14 + 5;
    var floor = OPS.y + OPS.h - toggleH - 5;

    if (showOps) y = drawOpList(ctx, y, floor);
    else         y = drawUnlockList(ctx, y, floor);

    /* OPS / UNLOCKS toggle, at the foot of the column */
    var tr = { x: OPS.x, y: OPS.y + OPS.h - toggleH, w: OPS.w, h: toggleH };
    fillRR(ctx, tr.x, tr.y, tr.w, tr.h, 6, 'rgba(10,16,21,0.8)');
    strokeRR(ctx, tr.x, tr.y, tr.w, tr.h, 6, T.edgeUp, 1);
    var hw = (tr.w - 6 - 3) / 2;
    ['OPS', 'UNLOCKS'].forEach(function (lab, j) {
      var on = (j === 0) === showOps;
      var r = { x: tr.x + 3 + j * (hw + 3), y: tr.y + 3, w: hw, h: tr.h - 6 };
      if (on) fillRR(ctx, r.x, r.y, r.w, r.h, 4, T.accent);
      text(ctx, lab, r.x + r.w / 2, r.y + r.h / 2,
           { font: T.head(11, 700), fill: on ? T.onAccent : '#8FA3B0',
             align: 'center', baseline: 'middle', track: 1.6 });
      if (UI.zone(r, 'toggle')) opsTab = j === 0 ? 'ops' : 'unlocks';
    });
  }

  function drawOpList(ctx, y, floor) {
    var list = Progress.available(), gate = Progress.currentGate();
    /* the gate first when there is one — it is the wall, not one of the choices */
    if (gate) {
      list = [gate].concat(list.filter(function (o) { return o.id !== gate.id; }));
    }
    var shown = 0, LH = 14;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], pr = Progress.opProgress(o);
      var near = pr.need > 1 && pr.have / pr.need >= 0.5;

      /* The description WRAPS rather than being cut off with an ellipsis: an
         operation you cannot read the second half of is not an objective, and
         the row is cheap to make taller. Two lines is the cap — past that the
         text wants shortening, not more room. */
      ctx.font = T.mono(10);
      var cnt = pr.have + '/' + pr.need;
      var cw = ctx.measureText(cnt).width;
      var lines = wrapText(ctx, o.desc || o.name, OPS.w - 16 - cw - 8,
                           T.body(12, 500), 2);
      var rowH = 19 + LH * lines.length;

      if (y + rowH > floor - 27) break;                /* leave room for the seal */
      var r = { x: OPS.x, y: y, w: OPS.w, h: rowH };

      if (near || o === gate) {
        fillRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.06)');
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.4)', 1);
      } else {
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, T.edge, 1);
      }

      for (var li = 0; li < lines.length; li++) {
        text(ctx, lines[li], r.x + 8, r.y + 6 + LH * li + 7,
             { font: T.body(12, 500), fill: T.ink, baseline: 'middle' });
      }
      /* the count sits on the first line, where the eye starts */
      text(ctx, cnt, r.x + r.w - 8, r.y + 13,
           { font: T.mono(10), fill: near ? T.warn : '#8FA3B0',
             align: 'right', baseline: 'middle' });

      var bw = r.w - 16, byy = r.y + rowH - 10;
      fillRR(ctx, r.x + 8, byy, bw, 3, 1.5, T.track);
      if (pr.have > 0) {
        fillRR(ctx, r.x + 8, byy, Math.max(2, bw * pr.have / pr.need), 3, 1.5,
               near ? T.warn : '#8FA3B0');
      }
      y += rowH + 5;
      shown++;
    }

    /* one sealed row standing for everything not yet revealed: the whole tree
       less what is on offer and what is already done. */
    var ops = Progress.all(), d = 0;
    for (var h = 0; h < ops.length; h++) if (Progress.done(ops[h].id)) d++;
    var hidden = ops.length - Progress.available().length - d;
    if (hidden > 0 && y + 27 <= floor) {
      dashRR(ctx, OPS.x, y, OPS.w, 27, 5, T.edge);
      text(ctx, hidden === 1 ? 'Sealed op' : hidden + ' sealed ops', OPS.x + 8, y + 13.5,
           { font: T.body(12), fill: '#5D7280', baseline: 'middle' });
      strokeRR(ctx, OPS.x + OPS.w - 15, y + 9, 7, 9, 1, T.sealed, 1);
      y += 27 + 5;
    }
    if (!shown && hidden <= 0) {
      text(ctx, 'ALL OPERATIONS COMPLETE', OPS.x + OPS.w / 2, y + 14,
           { font: T.mono(10), fill: T.ready, align: 'center', baseline: 'middle', track: 1 });
    }
    return y;
  }

  function drawUnlockList(ctx, y, floor) {
    text(ctx, 'YOU ARE LEVEL ' + Progress.level(), OPS.x + 2, y + 7,
         { font: T.mono(10), fill: T.muted, baseline: 'middle' });
    y += 14 + 5;

    var up = Progress.upcoming(12);
    for (var i = 0; i < up.length; i++) {
      if (y + 39 > floor) break;
      var u = up[i], first = i === 0;
      var r = { x: OPS.x, y: y, w: OPS.w, h: 39 };
      if (first) {
        fillRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.06)');
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, 'rgba(232,163,61,0.45)', 1);
      } else {
        strokeRR(ctx, r.x, r.y, r.w, r.h, 5, T.edge, 1);
      }
      text(ctx, String(u.level), r.x + 8, r.y + 13,
           { font: T.mono(12, 600), fill: first ? T.warn : '#8FA3B0', baseline: 'middle' });
      var tx = r.x + 8 + 26 + 8;
      text(ctx, fitText(ctx, u.label, r.w - (tx - r.x) - 8, T.body(12, 500)), tx, r.y + 13,
           { font: T.body(12, 500), fill: T.ink, baseline: 'middle' });
      var kindLabel = u.kind === 'ship' ? 'SHIP' : u.family.toUpperCase();
      var kindTint = u.kind === 'ship' ? T.accent : T.fam[u.family] || T.fam.utility;
      text(ctx, kindLabel, tx, r.y + 27,
           { font: T.mono(9.5), fill: kindTint, baseline: 'middle', track: 0.6 });
      y += 39 + 5;
    }
    if (!up.length) {
      text(ctx, 'EVERYTHING IS UNLOCKED', OPS.x + OPS.w / 2, y + 14,
           { font: T.mono(10), fill: T.ready, align: 'center', baseline: 'middle', track: 1 });
    }
    return y;
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
    var opp = Opponents.draw(tier);
    if (!opp) { say('No contacts at tier ' + tier); return; }
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
    update: function (dt) { if (msgT > 0) { msgT -= dt; if (msgT <= 0) msg = null; } },

    draw: function (ctx) {
      drawGround(ctx);
      drawTopBar(ctx);
      drawTierRail(ctx);
      drawHullStrip(ctx);
      drawOps(ctx);

      if (msg) {
        ctx.font = T.mono(11);
        var mw = ctx.measureText(msg).width + 28;
        fillRR(ctx, FLEET.x, VH - 40, mw, 26, 13, 'rgba(4,8,11,0.88)');
        strokeRR(ctx, FLEET.x, VH - 40, mw, 26, 13, T.edge, 1);
        text(ctx, msg, FLEET.x + 14, VH - 27,
             { font: T.mono(11), fill: '#8FB6C6', baseline: 'middle' });
      }
    }
  };
})();
