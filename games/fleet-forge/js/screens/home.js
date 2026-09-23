/* screens/home.js — 1g, the home screen: pick a pilot.
 *
 * Every number in here is the handoff's, read off `Fleet Forge.dc.html` at the
 * tablet size the arcade actually runs (1333x690), because Dan asked for the
 * layout to MATCH and not merely to be themed. So: 248px cards, 68px avatars,
 * a 54px title tracked 12px, 24px between the three blocks, 14px between the
 * cards. Where the design gives a CSS box and canvas has no box model, the
 * measurement is worked out once at the top of the draw and named.
 *
 * The one place it departs: the design's card always says CONTINUE. A pilot who
 * has never played is offered START instead, because telling a seven-year-old
 * to continue a game he has not begun is a small lie the design did not intend.
 */
var HomeScreen = (function () {
  var sel = null;                     /* pilot id under the highlight */

  /* ---- the design's boxes, at 1333x690 -------------------------------- */
  var CARD_W = 248, CARD_H = 258, CARD_GAP = 14;
  var ROW_W  = CARD_W * 2 + CARD_GAP;
  var ROW_X  = (VW - ROW_W) / 2;      /* 535.5 */
  var TOP    = 158;                   /* centred: 60px top pad + (590-394)/2 */
  var TITLE_H = 48.6;                 /* 54px at line-height 0.9 */
  var CARDS_Y = TOP + 74.2 + 24;      /* title block + the 24px gap */
  var FOOT_Y  = CARDS_Y + CARD_H + 24;

  function cardRect(i) {
    return { x: ROW_X + i * (CARD_W + CARD_GAP), y: CARDS_Y, w: CARD_W, h: CARD_H };
  }

  /* ---- background: the design's "live battle render" placeholder ------- */
  function drawBackdrop(ctx) {
    ctx.fillStyle = '#04060A';
    ctx.fillRect(0, 0, VW, VH);

    ctx.strokeStyle = 'rgba(120,170,200,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= VW; x += 52) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VH); }
    for (var y = 0; y <= VH; y += 52) { ctx.moveTo(0, y + 0.5); ctx.lineTo(VW, y + 0.5); }
    ctx.stroke();

    stripes(ctx, { x: 0, y: 0, w: VW, h: VH }, 118,
            'rgba(56,197,216,0.07)', 'rgba(4,6,10,0.85)', 10);
    vignette(ctx, VW, VH, 0.70, 0.90, 0.50, 0.45,
             'rgba(4,6,10,0.25)', 'rgba(3,5,8,0.92)', 0.72);

    text(ctx, 'LIVE BATTLE RENDER · BACKGROUND LOOP', VW / 2, VH - 14,
         { font: T.mono(10.5), fill: '#4A5C68', align: 'center',
           baseline: 'bottom', track: 1 });
  }

  /* ---- one pilot card -------------------------------------------------- */
  function drawCard(ctx, s, r, on) {
    if (on) {
      ctx.save();
      ctx.shadowColor = 'rgba(56,197,216,0.20)'; ctx.shadowBlur = 28;
      var g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, 'rgba(56,197,216,0.16)');
      g.addColorStop(1, 'rgba(6,12,16,0.92)');
      fillRR(ctx, r.x, r.y, r.w, r.h, 10, g);
      ctx.restore();
      strokeRR(ctx, r.x, r.y, r.w, r.h, 10, T.accent, 1);
    } else {
      fillRR(ctx, r.x, r.y, r.w, r.h, 10, 'rgba(6,11,15,0.88)');
      strokeRR(ctx, r.x, r.y, r.w, r.h, 10, T.edge, 1);
    }

    var cx = r.x + r.w / 2;
    hatchDisc(ctx, cx, r.y + 48, 68, on ? T.accent : T.edgeUp);

    text(ctx, s.name.toUpperCase(), cx, r.y + 103,
         { font: T.head(22, 700), fill: on ? '#EAF5FA' : '#C7D6DE',
           align: 'center', baseline: 'middle', track: 3 });

    /* level: a 26px numeral and a small tracked label, sharing a baseline and
       centred as one group — a flex row with gap 7 in the design. */
    var base = r.y + 145;
    ctx.font = T.mono(26, 600);
    var wn = ctx.measureText(String(s.level)).width;
    ctx.font = T.head(11);
    var wl = ctx.measureText('LEVEL').width + 1.8 * 5;
    var gx = cx - (wn + 7 + wl) / 2;
    text(ctx, String(s.level), gx, base,
         { font: T.mono(26, 600), fill: on ? T.accent : '#A9BDC8', baseline: 'alphabetic' });
    text(ctx, 'LEVEL', gx + wn + 7, base,
         { font: T.head(11), fill: on ? '#8FB6C6' : T.muted,
           baseline: 'alphabetic', track: 1.8 });

    /* two mono lines at line-height 1.6 */
    var meta = s.started
      ? [(s.tierName + ' T' + s.tier + ' · ' + s.hull).toUpperCase(),
         s.ops + ' OPS COMPLETE']
      : ['NO FLIGHT RECORD', 'NEW PILOT'];
    var mf = T.mono(10.5), mc = on ? '#8FB6C6' : T.muted;
    text(ctx, fitText(ctx, meta[0], r.w - 20, mf), cx, r.y + 168.4,
         { font: mf, fill: mc, align: 'center', baseline: 'middle' });
    text(ctx, meta[1], cx, r.y + 185.2,
         { font: mf, fill: mc, align: 'center', baseline: 'middle' });

    /* the action */
    var br = { x: r.x + 14, y: r.y + 204, w: r.w - 28, h: 40 };
    if (on) {
      fillRR(ctx, br.x, br.y, br.w, br.h, 6, T.accent);
      text(ctx, s.started ? 'CONTINUE' : 'START', br.x + br.w / 2, br.y + 20,
           { font: T.head(15, 700), fill: T.onAccent, align: 'center',
             baseline: 'middle', track: 2.6 });
    } else {
      strokeRR(ctx, br.x, br.y, br.w, br.h, 6, T.edgeUp, 1);
      text(ctx, 'SELECT', br.x + br.w / 2, br.y + 20,
           { font: T.head(15, 600), fill: '#A9BDC8', align: 'center',
             baseline: 'middle', track: 2.6 });
    }
  }

  return {
    enter: function () { sel = Save.pilot(); Music.to('hangar'); },

    draw: function (ctx) {
      drawBackdrop(ctx);

      text(ctx, 'FLEET FORGE', VW / 2, TOP + TITLE_H / 2,
           { font: T.head(54, 700), fill: '#EAF5FA', align: 'center',
             baseline: 'middle', track: 12,
             glow: 'rgba(56,197,216,0.35)', glowBlur: 40 });
      text(ctx, 'FIT IT · FLY IT · WRECK THEM', VW / 2, TOP + 66.4,
           { font: T.mono(12), fill: T.accent, align: 'center',
             baseline: 'middle', track: 3 });

      var pilots = Save.pilots(), i;
      for (i = 0; i < pilots.length && i < 2; i++) {
        var s = Save.summary(pilots[i].id), r = cardRect(i);
        var on = pilots[i].id === sel;
        drawCard(ctx, s, r, on);
        if (UI.zone(r, on ? 'confirm' : 'select')) {
          /* First tap moves the highlight; a tap on the highlighted card is the
             one that commits. Two taps, and no way to walk into your brother's
             save by mistake. */
          if (on) { Save.use(sel); App.replace(FleetScreen); }
          else sel = pilots[i].id;
        }
      }

      text(ctx, 'PICK A PILOT TO ENTER THE HANGAR', VW / 2, FOOT_Y + 7,
           { font: T.mono(11), fill: T.muted, align: 'center',
             baseline: 'middle', track: 1.4 });
    }
  };
})();
