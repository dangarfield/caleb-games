/* screens/result.js — 1d, 1e and 1f. One screen, three states.
 *
 * The handoff draws these as three separate mockups, but they are the same
 * layout throughout: a `1fr | 340px` grid, a 54px verdict over four stat tiles
 * over a flexible middle over three buttons, and a right rail of the ops and
 * unlocks the match moved. Only four things change between them:
 *
 *   1d  win, an op cleared   VICTORY, cyan glow · LEVEL UP card · what unlocked
 *   1e  win, nothing cleared VICTORY, no glow   · LEVEL HELD    · what is waiting
 *   1f  defeat               WRECKED, red glow  · LEVEL HELD    · post-match read
 *
 * So it is one file with a state, not three files with one layout copied three
 * times. The button ORDER never changes — the design is explicit about that —
 * only which of them carries the accent: REMATCH on a win, REFIT on a loss,
 * because after a loss the thing to do is change the fit.
 *
 * `res` comes from the arena, `gained` from Progress.recordBattle. Nothing here
 * writes to the save: by the time this screen exists, all of that has happened.
 */
function ResultScreen(o) {
  var res = o.result, gained = o.gained || [];
  var won = !!res.won, up = gained.length > 0;
  var shipKey = o.shipKey, ship = Data.ship(shipKey);
  var opponent = res.opponent || o.opponent || { name: 'CONTACT' };

  /* ---- the design's boxes, at 1333x690 -------------------------------- */
  var RAIL_W = 340;
  var L = { x: 20, y: 58, w: VW - RAIL_W - 40, h: VH - 58 - 16 };
  var R = { x: VW - RAIL_W + 1 + 14, y: 12, w: RAIL_W - 1 - 28, h: VH - 24 };
  var TILE_H = 48, BTN_H = 44, GAP = 11;
  var TITLE_H = 49.7;                 /* 54px at line-height 0.92 */
  var HEAD_H = TITLE_H + 6 + 15.6;

  var MID_Y = L.y + HEAD_H + GAP + TILE_H + GAP;
  var BTN_Y = L.y + L.h - BTN_H;
  var MID_H = BTN_Y - GAP - MID_Y;

  /* ---- what the three states change ----------------------------------- */
  var verdict = won ? 'VICTORY' : 'WRECKED';
  var verdictInk = won ? (up ? '#EAF5FA' : T.ink) : '#F6DEDB';
  var verdictGlow = up ? 'rgba(56,197,216,0.35)' : (won ? null : 'rgba(228,85,74,0.35)');
  var groundHi = up ? '#0F2730' : (won ? '#0C1D24' : '#2A1114');
  var subInk = up ? T.accent : (won ? '#8FA3B0' : T.cat.ballistic);

  function mmss(t) {
    var s = t | 0, mm = (s / 60) | 0, ss = s % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function k(n) {
    n = Math.round(n || 0);
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  /* ---- the right rail's rows, worked out once ------------------------- */

  /* Ops that moved but did not finish, most nearly done first — the design's
     "Progressed" block. An op with no partial state (win this one fight) never
     appears here, because 0/1 is not progress. */
  function progressed() {
    var list = Progress.available(), out = [], i;
    for (i = 0; i < list.length; i++) {
      var pr = Progress.opProgress(list[i]);
      if (pr.need <= 1 || pr.have <= 0) continue;
      out.push({ op: list[i], pr: pr });
    }
    out.sort(function (a, b) { return (b.pr.have / b.pr.need) - (a.pr.have / a.pr.need); });
    return out.slice(0, 3);
  }

  var prog = progressed();
  var unlocked = [];
  for (var gi = 0; gi < gained.length; gi++) {
    var u = gained[gi].unlocks;
    for (var si = 0; si < u.ships.length; si++) {
      var sh = Data.ship(u.ships[si]);
      if (sh) unlocked.push({ label: sh.displayName, sub: 'SHIP · T' + Progress.tierOf(sh),
                              tint: T.accent, code: initials(sh.displayName) });
    }
    for (var mi = 0; mi < u.modules.length; mi++) {
      var md = Data.module(u.modules[mi]);
      if (md) unlocked.push({ label: md.displayName,
                              sub: T.familyOf(md).toUpperCase() + ' · ' +
                                   md.w + '×' + md.h,
                              tint: T.fam[T.familyOf(md)] || T.fam.utility,
                              code: initials(md.displayName) });
    }
  }
  var next = Progress.upcoming(1)[0] || null;

  /* ---- left column ----------------------------------------------------- */

  function drawGround(ctx) {
    ctx.fillStyle = '#05080B';
    ctx.fillRect(0, 0, VW, VH);
    vignette(ctx, VW, VH, 0.85, 1.20, 0.22, 0.20, groundHi, 'rgba(5,8,11,0)', 0.68);
    ctx.fillStyle = T.rule;
    ctx.fillRect(VW - RAIL_W, 0, 1, VH);
    ctx.fillStyle = 'rgba(5,9,13,0.85)';
    ctx.fillRect(VW - RAIL_W + 1, 0, RAIL_W - 1, VH);
  }

  function drawHead(ctx) {
    text(ctx, verdict, L.x, L.y + TITLE_H / 2,
         { font: T.head(54, 700), fill: verdictInk, baseline: 'middle', track: 5,
           glow: verdictGlow, glowBlur: 30 });
    var line = 'ARENA · ' + (ship ? ship.displayName.toUpperCase() : '?') +
               ' FIT ' + ((res.fitIndex || 0) + 1) + ' · ' + mmss(res.time) +
               ' · VS ' + opponent.name.toUpperCase();
    text(ctx, fitText(ctx, line, L.w, T.mono(12)), L.x, L.y + TITLE_H + 6 + 7.8,
         { font: T.mono(12), fill: subInk, baseline: 'middle', track: 1 });
  }

  function tile(ctx, x, w, value, label, tint, edge, fill) {
    var y = L.y + HEAD_H + GAP;
    fillRR(ctx, x, y, w, TILE_H, 6, fill || 'rgba(10,16,21,0.7)');
    strokeRR(ctx, x, y, w, TILE_H, 6, edge || T.edge, 1);
    text(ctx, value, x + 9, y + 7 + 10.5,
         { font: T.mono(16), fill: tint || '#EAF5FA', baseline: 'middle' });
    text(ctx, label, x + 9, y + 7 + 21 + 6.5,
         { font: T.head(10), fill: tint || T.muted, baseline: 'middle', track: 1.4 });
  }

  function drawTiles(ctx) {
    var w = (L.w - 24) / 4, x = L.x;
    tile(ctx, x, w, k(res.dmgOut), 'DAMAGE OUT'); x += w + 8;
    tile(ctx, x, w, k(res.dmgIn), 'DAMAGE IN',
         won ? null : '#FF8A80',
         won ? null : 'rgba(228,85,74,0.35)',
         won ? null : 'rgba(228,85,74,0.08)'); x += w + 8;
    tile(ctx, x, w, Math.round(res.accuracy * 100) + '%', 'ACCURACY'); x += w + 8;
    /* The one tile that is colour-coded by what it says: none is green, some is
       amber, and losing them in a fight you lost is red. */
    var lost = res.modulesLost;
    tile(ctx, x, w, String(lost), 'MODULES LOST',
         lost === 0 ? '#7FE0A8' : won ? '#F0BF72' : '#FF8A80',
         lost === 0 ? 'rgba(79,191,127,0.4)' : won ? 'rgba(232,163,61,0.4)' : 'rgba(228,85,74,0.35)',
         lost === 0 ? 'rgba(79,191,127,0.08)' : won ? 'rgba(232,163,61,0.08)' : 'rgba(228,85,74,0.08)');
  }

  /* On a win the middle is the hull; on a loss it is the reason you are reading
     this instead of a victory. */
  function drawMiddle(ctx) {
    if (!won) {
      fillRR(ctx, L.x, MID_Y, L.w, MID_H, 8, 'rgba(232,163,61,0.07)');
      strokeRR(ctx, L.x, MID_Y, L.w, MID_H, 8, 'rgba(232,163,61,0.4)', 1);
      ctx.save();
      ctx.translate(L.x + 17, MID_Y + 16); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = T.warn; ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      text(ctx, 'POST-MATCH READ', L.x + 34, MID_Y + 19,
           { font: T.head(15, 700), fill: '#F0BF72', baseline: 'middle', track: 1.6 });
      var body = res.why || 'They out-fought you.';
      wrapText(ctx, body, L.x + 34, MID_Y + 42, Math.min(420, L.w - 50), 19,
               { font: T.body(13), fill: '#E8D6B8', baseline: 'middle' });
      return;
    }

    stripesRR(ctx, L.x, MID_Y, L.w, MID_H, 8, 115,
              up ? 'rgba(56,197,216,0.10)' : 'rgba(120,170,200,0.08)',
              'rgba(7,12,16,0.85)', 8);
    strokeRR(ctx, L.x, MID_Y, L.w, MID_H, 8, T.edge, 1);
    if (ship) {
      ShipView.draw(ctx, ship, o.modules || [],
                    { x: L.x + 24, y: MID_Y + 24, w: L.w - 48, h: MID_H - 48 },
                    { maxCell: 34 });
    }
  }

  function drawButtons(ctx) {
    /* Order is fixed; only the accent moves. */
    /* On a win the first button starts a fresh fight, and the opponent is
       drawn again rather than replayed — so it says what it does. */
    var lab = [won ? 'ENTER ARENA' : 'REMATCH', 'REFIT', 'HANGAR'];
    var accent = won ? 0 : 1;
    var flex = [won ? 1.3 : 1, won ? 1 : 1.3, 1];
    var total = flex[0] + flex[1] + flex[2], unit = (L.w - 16) / total, x = L.x;
    for (var i = 0; i < 3; i++) {
      var w = flex[i] * unit, r = { x: x, y: BTN_Y, w: w, h: BTN_H };
      if (i === accent) {
        ctx.save();
        ctx.shadowColor = 'rgba(56,197,216,0.28)'; ctx.shadowBlur = 22;
        fillRR(ctx, r.x, r.y, r.w, r.h, 6, T.accent);
        ctx.restore();
        text(ctx, lab[i], r.x + r.w / 2, r.y + r.h / 2,
             { font: T.head(16, 700), fill: T.onAccent, align: 'center',
               baseline: 'middle', track: 3 });
      } else {
        strokeRR(ctx, r.x, r.y, r.w, r.h, 6,
                 i === 2 ? T.edge : T.edgeUp, 1);
        text(ctx, lab[i], r.x + r.w / 2, r.y + r.h / 2,
             { font: T.head(14, 600), fill: i === 2 ? '#8FA3B0' : T.ink,
               align: 'center', baseline: 'middle', track: 2.4 });
      }
      if (UI.zone(r, i === 0 ? 'launch' : i === 1 ? 'open' : 'back')) {
        if (i === 0) o.onRematch();
        else if (i === 1) o.onRefit();
        else o.onHangar();
      }
      x += w + 8;
    }
  }

  /* ---- right rail ------------------------------------------------------ */

  function railLabel(ctx, s, y) {
    text(ctx, s, R.x, y + 6.5,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2.4 });
    return y + 13 + 7;
  }

  function levelCard(ctx, y) {
    var h = 56;
    if (up) {
      var g = ctx.createLinearGradient(R.x, y, R.x, y + h);
      g.addColorStop(0, 'rgba(56,197,216,0.2)');
      g.addColorStop(1, 'rgba(8,16,21,0.8)');
      fillRR(ctx, R.x, y, R.w, h, 8, g);
      strokeRR(ctx, R.x, y, R.w, h, 8, T.accent, 1);

      var from = gained[0].level - 1, to = gained[gained.length - 1].level;
      ctx.font = T.mono(15);
      var w1 = ctx.measureText(String(from)).width;
      ctx.font = T.mono(14);
      var w2 = ctx.measureText('→').width;
      var gx = R.x + 12;
      text(ctx, String(from), gx, y + 28,
           { font: T.mono(15), fill: T.muted, baseline: 'middle' });
      text(ctx, '→', gx + w1 + 6, y + 28,
           { font: T.mono(14), fill: T.muted, baseline: 'middle' });
      text(ctx, String(to), gx + w1 + 6 + w2 + 6, y + 28,
           { font: T.mono(30, 600), fill: T.accent, baseline: 'middle' });

      ctx.font = T.mono(30, 600);
      var tx = gx + w1 + 6 + w2 + 6 + ctx.measureText(String(to)).width + 12;
      text(ctx, 'LEVEL UP', tx, y + 21,
           { font: T.head(17, 700), fill: '#EAF5FA', baseline: 'middle', track: 2 });
      text(ctx, opsDone() + ' OPS COMPLETE', tx, y + 38,
           { font: T.mono(10), fill: '#8FB6C6', baseline: 'middle' });
    } else {
      fillRR(ctx, R.x, y, R.w, h, 8, 'rgba(10,16,21,0.75)');
      strokeRR(ctx, R.x, y, R.w, h, 8, T.edge, 1);
      text(ctx, String(Progress.level()), R.x + 12, y + 28,
           { font: T.mono(30, 600), fill: '#A9BDC8', baseline: 'middle' });
      ctx.font = T.mono(30, 600);
      var lx = R.x + 12 + ctx.measureText(String(Progress.level())).width + 12;
      text(ctx, 'LEVEL HELD', lx, y + 21,
           { font: T.head(17, 700), fill: T.ink, baseline: 'middle', track: 2 });
      text(ctx, won ? 'NO OP COMPLETED THIS MATCH' : 'OPS NEVER ROLL BACK', lx, y + 38,
           { font: T.mono(10), fill: T.muted, baseline: 'middle' });
    }
    return y + h + 7;
  }

  function opsDone() {
    var all = Progress.all(), n = 0;
    for (var i = 0; i < all.length; i++) if (Progress.done(all[i].id)) n++;
    return n;
  }

  /* An icon tile, a name, a sub-line: the shape every rail row shares. */
  function railRow(ctx, y, h, iconSize, o2) {
    fillRR(ctx, R.x, y, R.w, h, 7, o2.bg);
    strokeRR(ctx, R.x, y, R.w, h, 7, o2.edge, 1);
    var iy = y + (h - iconSize) / 2;
    fillRR(ctx, R.x + 10, iy, iconSize, iconSize, 6, o2.iconBg);
    strokeRR(ctx, R.x + 10, iy, iconSize, iconSize, 6, o2.iconEdge, 1);
    text(ctx, o2.code, R.x + 10 + iconSize / 2, iy + iconSize / 2,
         { font: T.mono(iconSize >= 40 ? 12 : 11, 600), fill: o2.codeTint,
           align: 'center', baseline: 'middle' });

    var tx = R.x + 10 + iconSize + 10, tw = R.w - (tx - R.x) - 10 - (o2.tail ? 24 : 0);
    text(ctx, fitText(ctx, o2.title.toUpperCase(), tw, T.head(15, 700)), tx, y + h / 2 - 8,
         { font: T.head(15, 700), fill: o2.titleTint, baseline: 'middle', track: 1.4 });
    if (o2.bar) {
      var bw = tw;
      fillRR(ctx, tx, y + h / 2 + 5, bw, 4, 2, T.track);
      fillRR(ctx, tx, y + h / 2 + 5, Math.max(2, bw * o2.bar), 4, 2, T.warn);
      text(ctx, o2.tail, R.x + R.w - 10, y + h / 2 - 8,
           { font: T.mono(10), fill: T.warn, align: 'right', baseline: 'middle' });
    } else {
      text(ctx, fitText(ctx, o2.sub, tw, T.mono(10)), tx, y + h / 2 + 8,
           { font: T.mono(10), fill: o2.subTint, baseline: 'middle' });
    }
    if (o2.tail && !o2.bar) {
      text(ctx, o2.tail, R.x + R.w - 10, y + h / 2,
           { font: T.mono(11), fill: T.accent, align: 'right', baseline: 'middle' });
    }
    return y + h + 7;
  }

  function drawRail(ctx) {
    var y = R.y;
    y = levelCard(ctx, y);

    if (up) {
      y = railLabel(ctx, 'OP CLEARED', y);
      for (var i = 0; i < gained.length && i < 2; i++) {
        y = railRow(ctx, y, 58, 40, {
          bg: 'rgba(56,197,216,0.12)', edge: T.accent,
          iconBg: 'rgba(56,197,216,0.2)', iconEdge: T.accent, codeTint: '#BDF1F8',
          code: initials(gained[i].op.name),
          title: gained[i].op.name, titleTint: '#EAF5FA',
          sub: (gained[i].op.desc || '').toUpperCase(), subTint: '#8FB6C6',
          tail: '+1'
        });
      }
    }

    if (prog.length) {
      y = railLabel(ctx, 'PROGRESSED', y);
      for (var j = 0; j < prog.length; j++) {
        if (y + 52 > R.y + R.h - 58) break;
        y = railRow(ctx, y, 52, 36, {
          bg: 'rgba(232,163,61,0.07)', edge: 'rgba(232,163,61,0.45)',
          iconBg: 'rgba(232,163,61,0.12)', iconEdge: 'rgba(232,163,61,0.5)',
          codeTint: '#F0BF72', code: initials(prog[j].op.name),
          title: prog[j].op.name, titleTint: '#F6E3C2',
          bar: prog[j].pr.have / prog[j].pr.need,
          tail: prog[j].pr.have + '/' + prog[j].pr.need
        });
      }
    }

    if (up && unlocked.length) {
      y = railLabel(ctx, 'UNLOCKED AT LEVEL ' + gained[gained.length - 1].level, y);
      for (var u2 = 0; u2 < unlocked.length && y + 52 <= R.y + R.h - 58; u2++) {
        y = railRow(ctx, y, 52, 36, {
          bg: 'rgba(79,191,127,0.1)', edge: 'rgba(79,191,127,0.5)',
          iconBg: 'rgba(176,209,85,0.14)', iconEdge: 'rgba(176,209,85,0.55)',
          codeTint: '#C9E07C', code: unlocked[u2].code,
          title: unlocked[u2].label, titleTint: '#E2F6EA',
          sub: unlocked[u2].sub, subTint: unlocked[u2].tint
        });
      }
    } else if (next) {
      y = railLabel(ctx, 'HOLD', y);
      text(ctx, fitText(ctx, 'NO UNLOCKS · NEXT AT LEVEL ' + next.level, R.w, T.mono(11)),
           R.x, y + 7, { font: T.mono(11), fill: T.muted, baseline: 'middle' });
      text(ctx, fitText(ctx, next.label.toUpperCase() + ' WAITING THERE', R.w, T.mono(11)),
           R.x, y + 24, { font: T.mono(11), fill: T.muted, baseline: 'middle' });
    }

    /* the footer note: what the next tier costs, pinned to the bottom */
    var tier = Progress.tier(Math.min(7, (ship ? Progress.tierOf(ship) : 1) + 1));
    if (tier && Progress.level() < tier.fromLevel) {
      var fy = R.y + R.h - 50;
      fillRR(ctx, R.x, fy, R.w, 50, 7, 'rgba(232,163,61,0.07)');
      dashRR(ctx, R.x, fy, R.w, 50, 7, 'rgba(232,163,61,0.5)');
      ctx.save();
      ctx.translate(R.x + 14, fy + 25); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = T.warn; ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
      text(ctx, fitText(ctx, 'NEXT: ' + tier.label, R.w - 38, T.head(14, 700)),
           R.x + 29, fy + 18,
           { font: T.head(14, 700), fill: '#F0BF72', baseline: 'middle', track: 1.4 });
      text(ctx, 'TIER ' + tier.n + ' UNLOCKS AT LEVEL ' + tier.fromLevel, R.x + 29, fy + 34,
           { font: T.mono(10), fill: '#D9B177', baseline: 'middle' });
    }
  }

  /* Canvas has no text wrapping; the post-match read is the one place here
     that needs more than one line. */
  function wrapText(ctx, s, x, y, maxW, lh, opts) {
    ctx.font = opts.font;
    var words = s.split(' '), line = '', i;
    for (i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, y, opts); y += lh; line = words[i];
      } else line = test;
    }
    if (line) text(ctx, line, x, y, opts);
  }

  return {
    enter: function () {
      /* THE RESULT SCREEN OWNS THE BATTLE THEME, and says so rather than
         assuming nobody has changed it. It cannot assume: the arena is torn
         down with `App.pop()`, which RESUMES the hangar underneath, and the
         hangar's `resume` asks for the hangar theme — so between the last shot
         and this screen appearing the music had already been switched. Both
         calls land in the same tick, so re-asserting it here is inaudible; it
         is the one that decides.

         VICTORY and WRECKED are the end of the fight, not the start of the next
         errand. The battle theme carries over them and ENTER ARENA from here
         starts another fight without a music change; it drops back to the
         hangar only when the player actually leaves, via REFIT or HANGAR. */
      Music.to('battle');
      /* The level-up flourish, if there is one, on top of the verdict — they
         are different pieces of news and both are worth hearing. */
      Sfx.play(won ? 'win' : 'lose');
      if (up) Sfx.play('levelup', 0.5);   /* scheduled on the audio clock */
    },

    draw: function (ctx) {
      drawGround(ctx);
      drawHead(ctx);
      drawTiles(ctx);
      drawMiddle(ctx);
      drawButtons(ctx);
      drawRail(ctx);
    }
  };
}
