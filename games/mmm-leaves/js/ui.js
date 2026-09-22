/* mmm-leaves — ui.js
   Everything that lands on the canvas, plus the hit regions the game asks about.
   Design space is a fixed 1333x690; game.js scales it to whatever the tablet is. */

var UI = (function () {
  'use strict';

  var C = Art.C;
  var DW = 1333, DH = 690;

  var geo = {
    DW: DW, DH: DH,
    head: 44,
    boardX: 14, boardY: 52, boardW: 784, boardH: 626,
    railX: 812, railW: 507,
    pad: 42, grass: 32,
    tileGap: 8, tileY: 54,
    trkX: 812, trkY: 170, trkW: 196, cellH: 26, colGap: 56, trkPadBottom: 30,
    /* the right-hand column is laid out to start and finish exactly level with
       the meal tracker beside it: 148 at the top, 608 at the foot */
    mealsX: 1022, mealsY: 170, mealsW: 297, mealsH: 128,
    achX: 1022,   achY: 312,   achW: 297,   achH: 196,
    scoreX: 1022, scoreY: 522, scoreW: 297, scoreH: 108
  };

  // the seven movement tiles span the full width of the rail
  geo.tileW = (geo.railW - geo.tileGap * 6) / 7;
  geo.tileH = geo.tileW;

  geo.N = 8;
  geo.stepX = (geo.boardW - geo.pad * 2) / (geo.N - 1);
  geo.stepY = (geo.boardH - geo.pad * 2 - geo.grass) / (geo.N - 1);
  geo.r = Math.min(geo.stepX, geo.stepY) * 0.30;

  function cx(c) { return geo.boardX + geo.pad + c * geo.stepX; }
  function cy(r) { return geo.boardY + geo.pad + r * geo.stepY; }
  function tileX(i) { return geo.railX + i * (geo.tileW + geo.tileGap); }
  function trkCX(col) { return geo.trkX + 42 + col * geo.colGap; }
  function trkCY(row) { return geo.trkY + 40 + row * geo.cellH; }

  function edgeSeed(r1, c1, r2, c2) { return r1 * 3.1 + c1 * 1.7 + r2 * 5.3 + c2 * 2.9; }

  /* cache the wavy polylines — they never move, and rebuilding them every frame
     would cost more than the whole rest of the render */
  var pathCache = {};
  function edgePath(r1, c1, r2, c2, dot) {
    // a tunnel along a dotted trail follows exactly the curve that was printed
    if (dot) return dottedPath({ r1: r1, c1: c1, r2: r2, c2: c2 });
    var k = r1 + ',' + c1 + '|' + r2 + ',' + c2;
    if (!pathCache[k]) {
      pathCache[k] = Art.path(cx(c1), cy(r1), cx(c2), cy(r2), 4.5,
                              edgeSeed(r1, c1, r2, c2));
    }
    return pathCache[k];
  }
  function resetCache() { pathCache = {}; dotCache = {}; }

  var dotCache = {};

  /* A dotted trail joins two circles that are not neighbours, so the straight
     run between them crosses whatever sits in the way. Arcing around it is not
     enough — a circle sitting near one END of the trail is exactly where an arc
     has no offset left to give. So the trail is routed instead: out of the start
     circle into the diagonal gap between four circles, along the corridors
     between rows and columns, and into the end circle. Corner-cutting can only
     pull the line inward, so smoothing cannot put it back over a disc. */

  function gapPoints(r, c) {                 // the four gaps around a circle
    var out = [];
    [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]].forEach(function (o) {
      var gr = r + o[0], gc = c + o[1];
      if (gr > 0 && gr < geo.N - 1 && gc > 0 && gc < geo.N - 1) out.push([gr, gc]);
    });
    return out;
  }

  function corridor(a, b, rowFirst) {        // staircase between two gaps
    var pts = [a.slice()];
    var cur = a.slice();
    function stepTo(tr, tc) {
      while (Math.abs(cur[0] - tr) > 0.01) { cur[0] += cur[0] < tr ? 1 : -1; pts.push(cur.slice()); }
      while (Math.abs(cur[1] - tc) > 0.01) { cur[1] += cur[1] < tc ? 1 : -1; pts.push(cur.slice()); }
    }
    if (rowFirst) { stepTo(b[0], cur[1]); stepTo(b[0], b[1]); }
    else          { stepTo(cur[0], b[1]); stepTo(b[0], b[1]); }
    return pts;
  }

  function clearance(pts, d) {
    var worst = 1e9;
    for (var r = 0; r < geo.N; r++) {
      for (var c = 0; c < geo.N; c++) {
        if ((r === d.r1 && c === d.c1) || (r === d.r2 && c === d.c2)) continue;
        var px = cx(c), py = cy(r);
        for (var i = 0; i < pts.length; i++) {
          var dx = pts[i].x - px, dy = pts[i].y - py;
          var gap = Math.sqrt(dx * dx + dy * dy) - geo.r;
          if (gap < worst) worst = gap;
        }
      }
    }
    return worst;
  }

  function buildTrail(d, seed) {
    var starts = gapPoints(d.r1, d.c1), ends = gapPoints(d.r2, d.c2);
    var best = null, bestGap = -1e9;

    for (var i = 0; i < starts.length; i++) {
      for (var j = 0; j < ends.length; j++) {
        for (var o = 0; o < 2; o++) {
          var way = corridor(starts[i], ends[j], o === 0);
          var pts = [{ x: cx(d.c1), y: cy(d.r1) }];
          way.forEach(function (w) { pts.push({ x: cx(w[1]), y: cy(w[0]) }); });
          pts.push({ x: cx(d.c2), y: cy(d.r2) });
          var sm = Art.wobble(Art.evenly(Art.chaikin(pts, 3)), 2.6, seed);
          var gap = clearance(sm, d);
          // prefer a clear route, and among clear ones the one that wanders a bit
          var score = gap + (gap > 5 ? way.length * 0.35 : 0);
          if (score > bestGap) { bestGap = score; best = { pts: sm, gap: gap }; }
        }
      }
    }
    if (!best) {
      best = { pts: Art.trail(cx(d.c1), cy(d.r1), cx(d.c2), cy(d.r2), seed, geo.stepY * 0.5),
               gap: 0 };
    }
    return best;
  }

  function canon(d) {
    var a = [d.r1, d.c1], b = [d.r2, d.c2];
    var flip = (a[0] > b[0]) || (a[0] === b[0] && a[1] > b[1]);
    return flip ? { r1: b[0], c1: b[1], r2: a[0], c2: a[1], flip: true }
                : { r1: a[0], c1: a[1], r2: b[0], c2: b[1], flip: false };
  }

  function dottedPath(dIn) {
    var d = canon(dIn);
    var k = d.r1 + ',' + d.c1 + '|' + d.r2 + ',' + d.c2;
    if (!dotCache[k]) {
      var seed = d.r1 * 5.1 + d.c1 * 2.7 + d.r2 * 3.3 + d.c2 * 1.9;
      var built = buildTrail(d, seed);
      dotCache[k] = built.pts;
      dotCache[k + '#gap'] = built.gap;
    }
    return d.flip ? dotCache[k].slice().reverse() : dotCache[k];
  }

  function dottedWorstGap() {
    var w = 1e9;
    Object.keys(dotCache).forEach(function (k) {
      if (k.indexOf('#gap') > 0 && dotCache[k] < w) w = dotCache[k];
    });
    return w;
  }

  /* one static render of the board furniture, kept on an offscreen canvas so the
     per-frame cost on a slow tablet stays low */
  var bg = null;
  function buildBackground(board) {
    bg = document.createElement('canvas');
    bg.width = DW; bg.height = DH;
    var b = bg.getContext('2d');

    b.fillStyle = C.mossDeep; b.fillRect(0, 0, DW, DH);
    Art.bark(b, geo.boardX, geo.boardY, geo.boardW, geo.boardH, 3.5);
    b.strokeStyle = 'rgba(79,90,36,0.5)'; b.lineWidth = 2;
    b.strokeRect(geo.boardX + 1, geo.boardY + 1, geo.boardW - 2, geo.boardH - 2);

    // printed lines — only where the sheet actually prints one
    for (var r = 0; r < geo.N; r++) for (var c = 0; c < geo.N; c++) {
      if (c < geo.N - 1 && Board.hasLink(board, r, c, r, c + 1))
        Art.strokePoints(b, edgePath(r, c, r, c + 1), 'rgba(255,255,255,0.72)', 4.2);
      if (r < geo.N - 1 && Board.hasLink(board, r, c, r + 1, c))
        Art.strokePoints(b, edgePath(r, c, r + 1, c), 'rgba(255,255,255,0.72)', 4.2);
    }
    // dotted trails, arcing clear of whatever sits between their two ends
    board.dottedList.forEach(function (d) {
      Art.strokePoints(b, dottedPath(d), 'rgba(255,255,255,0.55)', 3, [2.5, 8]);
    });

    Art.grass(b, geo.boardX, geo.boardY + geo.boardH - geo.grass, geo.boardW, geo.grass);
  }

  /* ---------------- board ---------------- */

  function drawBoard(ctx, g) {
    var board = g.board;

    // the tunnels already eaten
    ctx.save();
    ctx.shadowColor = 'rgba(240,164,41,0.5)'; ctx.shadowBlur = 9;
    board.lines.forEach(function (ln) {
      var pts = edgePath(ln.r1, ln.c1, ln.r2, ln.c2, ln.dot);
      Art.strokePoints(ctx, pts, '#f0a429', ln.dot ? 8 : 11);
    });
    // the one being drawn right now
    if (g.moving && g.moving.pts) {
      Art.strokePoints(ctx, g.moving.pts, '#f0a429',
                       g.moving.dot ? 8 : 11, null, g.moving.p);
    }
    ctx.restore();

    // the burrow the moth started in, in the hole between the four nest circles
    var nx = cx(3.5), ny = cy(3.5);
    ctx.save();
    ctx.strokeStyle = '#f0a429'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(240,164,41,0.5)'; ctx.shadowBlur = 8;
    board.nest.forEach(function (p) {
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(cx(p[1]), cy(p[0])); ctx.stroke();
    });
    ctx.restore();
    Art.nest(ctx, nx, ny, geo.r * 0.78);

    // circles
    for (var r = 0; r < geo.N; r++) for (var c = 0; c < geo.N; c++) {
      var cell = board.cells[r][c];
      var x = cx(c), y = cy(r);
      if (cell.kind === 'nest') {
        Art.eatenCircle(ctx, x, y, geo.r, null, 0, r * 9 + c, 1);
        continue;
      }
      var eaten = Board.isFilled(board, r, c);
      var pop = g.pops[r + ',' + c];
      if (eaten) {
        var grow = pop === undefined ? 1 : pop;
        Art.eatenCircle(ctx, x, y, geo.r, cell.kind, cell.count, r * 9 + c, grow);
      } else {
        var wob = g.chew && g.chew.r === r && g.chew.c === c ? g.chew.amount : 0;
        var rr = geo.r * (1 + Math.sin(wob * Math.PI * 3) * 0.10);
        Art.foodCircle(ctx, x, y, rr, cell.kind, cell.count);
      }
    }

    // where you can set off from — faint, so it reads as "grabbable" not "go here"
    if (!g.drag && g.sources && !Anim.isBusy()) {
      Object.keys(g.sources).forEach(function (k) {
        var q = k.split(',');
        Art.ring(ctx, cx(+q[1]), cy(+q[0]), geo.r + 3, 'rgba(255,244,214,0.38)', 2);
      });
    }

    // where this move can land
    var live = g.drag ? g.drag.moves : g.targets;
    if (live && live.length && !Anim.isBusy()) {
      var puls = 0.5 + 0.5 * Math.sin(g.clock / 260);
      live.forEach(function (m) {
        var hot = g.drag && g.drag.hover &&
                  g.drag.hover.r2 === m.r2 && g.drag.hover.c2 === m.c2;
        Art.ring(ctx, cx(m.c2), cy(m.r2), geo.r + (hot ? 8 : 4 + puls * 3.5),
                 C.gold, hot ? 5 : 3.5, hot ? 26 : 10 + puls * 12);
      });
    }

    // the elastic the moth is being dragged along
    if (g.drag) {
      ctx.save();
      ctx.strokeStyle = 'rgba(240,164,41,0.75)'; ctx.lineWidth = 9;
      ctx.lineCap = 'round'; ctx.setLineDash([3, 10]);
      ctx.shadowColor = 'rgba(240,164,41,0.5)'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(g.drag.from.x, g.drag.from.y);
      ctx.lineTo(g.drag.x, g.drag.y);
      ctx.stroke();
      ctx.restore();
    }

    // the moth
    var mp = g.mothPos;
    Art.mothAt(ctx, mp.x, mp.y, g.drag ? 1.4 : 1.25, g.mothPhase, mp.ang || 0);

    // drifting leaves and petals over the bark
    ctx.save();
    ctx.beginPath();
    ctx.rect(geo.boardX, geo.boardY, geo.boardW, geo.boardH - geo.grass);
    ctx.clip();
    g.drift.forEach(function (d) {
      ctx.save(); ctx.globalAlpha = d.a;
      if (d.kind === 'leaf') Art.leaf(ctx, d.x, d.y, d.s, d.rot);
      else Art.blossom(ctx, d.x, d.y, d.s * 0.62);
      ctx.restore();
    });
    ctx.restore();
  }

  /* ---------------- rail ---------------- */

  var TILE_LABEL = {
    left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
    leftright: 'LEFT or RIGHT', updown: 'UP or DOWN', dotted: 'DOTTED TRAIL'
  };

  function drawRail(ctx, g) {
    // header band
    ctx.fillStyle = C.mossDeep; ctx.fillRect(0, 0, DW, geo.head);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.textAlign = 'right';
    ctx.fillStyle = C.cream; ctx.font = 'bold 20px Atma, system-ui, sans-serif';
    var title = 'Mmm! Leaves';
    ctx.fillText(title, DW - 18, geo.head / 2 + 1);
    var tw = ctx.measureText(title).width;
    ctx.font = '13px Atma, system-ui, sans-serif'; ctx.fillStyle = 'rgba(247,244,230,0.62)';
    var who = (g.player === 'ezra' ? 'EZRA' : 'CALEB');
    ctx.fillText(who + '   ·   ROUND ' + Math.min(3, g.round + 1) + ' OF 3   ·   TURN ' +
                 Math.min(7, g.turn + 1) + ' OF 7', DW - 18 - tw - 28, geo.head / 2 + 1);
    ctx.textAlign = 'left';

    // the row of movement tiles
    for (var i = 0; i < 7; i++) {
      var st = g.tileState[i];
      var x = tileX(i), y = geo.tileY;
      var flip = (g.flip && g.flip.index === i) ? g.flip.p : null;
      if (flip !== null) {
        var half = flip < 0.5;
        var sx = Math.abs(Math.cos(flip * Math.PI));
        ctx.save();
        ctx.translate(x + geo.tileW / 2, y + geo.tileH / 2);
        ctx.scale(Math.max(0.02, sx), 1 + (1 - sx) * 0.12);
        Art.tile(ctx, -geo.tileW / 2, -geo.tileH / 2, geo.tileW, geo.tileH,
                 g.tiles[i], half, !half);
        ctx.restore();
      } else {
        Art.tile(ctx, x, y, geo.tileW, geo.tileH, g.tiles[i],
                 st === 'down', st === 'current');
        if (st === 'used') {
          ctx.save(); ctx.globalAlpha = 0.72; ctx.fillStyle = '#3d461b';
          Art.roundRect(ctx, x, y, geo.tileW, geo.tileH, 9); ctx.fill();
          ctx.restore();
        }
      }
    }

    var cur = g.tiles[g.turn];
    if (g.turn < 7 && g.tileState[g.turn] !== 'down') {
      // the label belongs to the tile it describes, so it sits under that tile
      var lx = tileX(g.turn) + geo.tileW / 2;
      var ly = geo.tileY + geo.tileH + 19;
      ctx.fillStyle = C.gold;
      ctx.textAlign = 'center';
      fitText2(ctx, TILE_LABEL[cur] || '', lx, ly, geo.tileW + geo.tileGap * 2 + 30, 14);
      ctx.textAlign = 'left';
    }

    drawTracker(ctx, g);
    drawScore(ctx, g);        // meals block at the top, score block at the foot
    drawAchievements(ctx, g);
  }

  function drawTracker(ctx, g) {
    var h = 15 * geo.cellH + 40 + geo.trkPadBottom;
    Art.panel(ctx, geo.trkX, geo.trkY, geo.trkW, h, 10);
    ctx.fillStyle = C.cream; ctx.font = 'bold 12px Atma, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MEAL TRACKER', geo.trkX + geo.trkW / 2, geo.trkY + 17);

    var fns = [Art.nut, Art.leaf, Art.blossom];
    var mealRow = Tracker.meals(g.tracker);

    for (var col = 0; col < 3; col++) {
      // the meal line: everything above it is a complete meal
      for (var row = 0; row < 15; row++) {
        var x = trkCX(col), y = trkCY(row);
        var filled = row < g.tracker.counts[col];
        var pk = row + ':' + col;
        var pop = g.trkPops[pk];
        var sc = pop === undefined ? 1 : pop;

        if (Tracker.hasArrows(row, col)) {
          var lit = filled ? 1 : 0.24;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            ctx.save(); ctx.globalAlpha = lit;
            Art.pip(ctx, x + d[0] * 15, y + d[1] * 15,
                    Math.atan2(-d[1], -d[0]), C.gold, 1);
            ctx.restore();
          });
        }

        ctx.save();
        ctx.translate(x, y); ctx.scale(sc, sc);
        ctx.fillStyle = filled ? '#fff' : 'rgba(255,255,255,0.26)';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.3); ctx.fill();
        if (!filled) {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.3); ctx.stroke();
        }
        if (filled) fns[col](ctx, 0, 0, 0.74, -0.3);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(247,244,230,0.6)'; ctx.font = '10px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['NUT', 'LEAF', 'BLOSSOM'][col], trkCX(col), trkCY(15) + 8);
    }

    // meal line
    if (mealRow > 0) {
      var ly = trkCY(mealRow - 1) + geo.cellH / 2;
      ctx.save();
      ctx.strokeStyle = C.gold; ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(geo.trkX + 10, ly); ctx.lineTo(geo.trkX + geo.trkW - 10, ly);
      ctx.stroke(); ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  /* the chip shape the achievement rows use, reused for the round rows so the
     rail reads as one family of things rather than three kinds of box */
  function chip(ctx, x, y, w, h, fill, left, right, textColor) {
    ctx.fillStyle = fill;
    Art.roundRect(ctx, x, y, w, h, 7); ctx.fill();
    ctx.fillStyle = textColor || C.mossDeep;
    ctx.font = 'bold 12px Atma, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(left, x + 11, y + h / 2 + 4);
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px Atma, system-ui, sans-serif';
    ctx.fillText(right, x + w - 11, y + h / 2 + 5);
    ctx.textAlign = 'left';
  }

  function drawScore(ctx, g) {
    var m = Tracker.meals(g.tracker);
    var cb = Tracker.columnBonus(g.tracker);
    var running = Tracker.roundTotal(g.tracker) + cb.points + Achievements.total(g.achievements);
    var rk = Tracker.rank(running);
    var nx = Tracker.nextRank(running);

    /* ---- meals: big number on the left, the three rounds as chips on the right ---- */
    Art.panel(ctx, geo.mealsX, geo.mealsY, geo.mealsW, geo.mealsH, 10);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(247,244,230,0.62)'; ctx.font = 'bold 11px Atma, system-ui, sans-serif';
    ctx.fillText('MEALS', geo.mealsX + 18, geo.mealsY + 26);

    ctx.fillStyle = C.gold; ctx.font = 'bold 48px Atma, system-ui, sans-serif';
    ctx.fillText(String(m), geo.mealsX + 18, geo.mealsY + 76);

    ctx.fillStyle = 'rgba(247,244,230,0.4)'; ctx.font = '10px Atma, system-ui, sans-serif';
    ctx.fillText('columns ' + cb.full + '/3', geo.mealsX + 18, geo.mealsY + 100);

    var rx = geo.mealsX + 108, rw = geo.mealsW - 108 - 18;
    for (var i = 0; i < 3; i++) {
      var done = g.tracker.rounds[i] !== null;
      var live = !done && g.round === i;
      chip(ctx, rx, geo.mealsY + 16 + i * 34, rw, 30,
           done ? '#8fbf5a' : live ? 'rgba(255,211,42,0.30)' : 'rgba(255,255,255,0.10)',
           'Round ' + (i + 1),
           done ? String(g.tracker.rounds[i]) : live ? '·' : '–',
           done ? C.mossDeep : live ? C.cream : 'rgba(247,244,230,0.45)');
    }

    /* ---- score: big number on the left, where you stand on the right ---- */
    Art.panel(ctx, geo.scoreX, geo.scoreY, geo.scoreW, geo.scoreH, 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(247,244,230,0.62)'; ctx.font = 'bold 11px Atma, system-ui, sans-serif';
    ctx.fillText('SCORE', geo.scoreX + 18, geo.scoreY + 24);

    ctx.fillStyle = C.cream; ctx.font = 'bold 40px Atma, system-ui, sans-serif';
    ctx.fillText(String(running), geo.scoreX + 18, geo.scoreY + 68);

    ctx.fillStyle = C.gold; ctx.font = 'bold 16px Atma, system-ui, sans-serif';
    ctx.fillText(rk.name, geo.scoreX + 108, geo.scoreY + 40);

    ctx.fillStyle = 'rgba(247,244,230,0.55)'; ctx.font = '11px Atma, system-ui, sans-serif';
    ctx.fillText(nx ? (nx.min - running) + ' more for ' + nx.name : 'top of the ladder',
                 geo.scoreX + 108, geo.scoreY + 60);
    if (g.best) {
      ctx.fillStyle = 'rgba(247,244,230,0.38)';
      ctx.fillText('best  ' + g.best.score + '  ·  ' + g.best.rank, geo.scoreX + 108, geo.scoreY + 78);
    }
  }

  function drawAchievements(ctx, g) {
    Art.panel(ctx, geo.achX, geo.achY, geo.achW, geo.achH, 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(247,244,230,0.7)'; ctx.font = 'bold 12px Atma, system-ui, sans-serif';
    ctx.fillText('ACHIEVEMENTS', geo.achX + 16, geo.achY + 26);
    ctx.fillStyle = 'rgba(247,244,230,0.42)'; ctx.font = '10px Atma, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(g.silverPhase ? 'silver' : 'gold until round 3', geo.achX + geo.achW - 16, geo.achY + 26);
    ctx.textAlign = 'left';

    g.achievements.forEach(function (a, i) {
      var y = geo.achY + 44 + i * 48;
      var pulse = g.achFlash[a.id];
      var w = geo.achW - 32;

      /* Solid gold now means CLAIMED. Unclaimed ones borrow the round chips'
         language: a gold tint while they are still worth the gold figure, faint
         white once they have flipped to silver. Filling them solid gold read as
         "already won" at a glance, which is the opposite of the truth. */
      ctx.save();
      if (pulse) { ctx.shadowColor = C.gold; ctx.shadowBlur = 20 * pulse; }
      ctx.fillStyle = a.claimed ? C.gold
                    : (a.silverSide ? 'rgba(255,255,255,0.10)' : 'rgba(255,211,42,0.20)');
      Art.roundRect(ctx, geo.achX + 16, y, w, 40, 7); ctx.fill();
      ctx.restore();
      if (!a.claimed) {
        ctx.strokeStyle = a.silverSide ? 'rgba(255,255,255,0.18)' : 'rgba(255,211,42,0.45)';
        ctx.lineWidth = 1.5;
        Art.roundRect(ctx, geo.achX + 16.75, y + 0.75, w - 1.5, 38.5, 7); ctx.stroke();
      }

      var ink = a.claimed ? C.mossDeep
              : (a.silverSide ? 'rgba(247,244,230,0.55)' : 'rgba(247,244,230,0.92)');
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px Atma, system-ui, sans-serif';
      ctx.fillText(a.letter + '   ' + a.desc, geo.achX + 27, y + 24);

      ctx.textAlign = 'right';
      ctx.font = 'bold 15px Atma, system-ui, sans-serif';
      ctx.fillText(String(a.claimed ? a.points : (a.silverSide ? a.silver : a.gold)),
                   geo.achX + geo.achW - 27, y + 25);

      if (a.claimed) {
        // a drawn tick, so "done" is unmistakable and not just a colour
        var tx = geo.achX + geo.achW - 62, ty = y + 20;
        ctx.save();
        ctx.strokeStyle = C.mossDeep; ctx.lineWidth = 3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(tx - 7, ty);
        ctx.lineTo(tx - 2, ty + 5);
        ctx.lineTo(tx + 7, ty - 6);
        ctx.stroke();
        ctx.restore();
      }
      ctx.textAlign = 'left';
    });
  }

  /* ---------------- overlays ---------------- */

  function dim(ctx, a) {
    ctx.fillStyle = 'rgba(20,26,8,' + a + ')';
    ctx.fillRect(0, 0, DW, DH);
  }

  function bigButton(ctx, x, y, w, h, text, fill) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, fill || '#7fd23c'); grad.addColorStop(1, '#4a9a1f');
    ctx.fillStyle = grad;
    Art.roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Atma, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
  }

  /* ---------------- home ---------------- */

  var PLAYERS = [{ id: 'caleb', name: 'Caleb' }, { id: 'ezra', name: 'Ezra' }];

  var MENU = {
    lx: 500,                                   // centre of the left-hand column
    calebX: 230, ezraX: 500, btnY: 446, btnW: 250, btnH: 64,
    howX: 370, howY: 528, howW: 240, howH: 50
  };

  /* The ladder is drawn as a measuring scale: one vertical axis hard against the
     right edge, a tick reaching left from it at each rank threshold with the
     score by the axis and the rank name out at the far end, and an arrow per
     player pointing right at the exact height of his best score. Because the
     markers sit at the real value rather than snapping to a rung, two boys in
     the same rank do not land on top of each other. */
  var LAD = { axis: 1288, tickX: 1142, nameX: 1134, top: 96, bottom: 616 };

  function ladderMax(g) {
    var top = 0;
    Tracker.RANKS.forEach(function (r) { if (r.min > top) top = r.min; });
    var best = 0;
    Object.keys(g.bests || {}).forEach(function (k) {
      if (g.bests[k] && g.bests[k].score > best) best = g.bests[k].score;
    });
    return Math.max(top + 7, best + 5);
  }

  function ladderY(v, vmax) {
    var t = Math.max(0, Math.min(1, v / vmax));
    return LAD.bottom - t * (LAD.bottom - LAD.top);
  }

  function drawLadder(ctx, g) {
    var vmax = ladderMax(g);
    ctx.textBaseline = 'alphabetic';

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(247,244,230,0.5)';
    ctx.font = '600 11px Atma, system-ui, sans-serif';
    ctx.fillText('THE LADDER', LAD.axis + 30, LAD.top - 26);

    // the axis
    ctx.strokeStyle = 'rgba(247,244,230,0.55)'; ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(LAD.axis, LAD.top - 12);
    ctx.lineTo(LAD.axis, LAD.bottom + 12);
    ctx.stroke();

    var best = 0;
    Object.keys(g.bests || {}).forEach(function (k) {
      if (g.bests[k] && g.bests[k].score > best) best = g.bests[k].score;
    });

    Tracker.RANKS.forEach(function (rk) {
      var y = ladderY(rk.min, vmax);
      var lit = best >= rk.min && best > 0;

      ctx.strokeStyle = lit ? 'rgba(143,191,90,0.95)' : 'rgba(247,244,230,0.30)';
      ctx.lineWidth = lit ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(LAD.tickX, y); ctx.lineTo(LAD.axis, y);
      ctx.stroke();

      /* The score sits just past the axis. It used to be on the inside, where a
         player's arrow landing near that rank covered it up. */
      ctx.textAlign = 'left';
      ctx.fillStyle = lit ? '#b6dd8c' : 'rgba(247,244,230,0.5)';
      ctx.font = '700 13px Atma, system-ui, sans-serif';
      ctx.fillText(String(rk.min), LAD.axis + 9, y + 5);

      // rank name out at the far end of the tick
      ctx.textAlign = 'right';
      ctx.fillStyle = lit ? C.cream : 'rgba(247,244,230,0.62)';
      fitText2(ctx, rk.name, LAD.nameX, y - 5, 190, 16);
    });

    /* one arrow per player, at the exact height of his best */
    var marks = [];
    PLAYERS.forEach(function (pl) {
      var b = g.bests && g.bests[pl.id];
      marks.push({ pl: pl, best: b, v: b ? b.score : 0 });
    });
    marks.sort(function (a, b) { return a.v - b.v; });
    var lastY = -1e9;
    marks.forEach(function (mk) {
      var y = ladderY(mk.v, vmax);
      if (y > lastY - 30 && lastY > -1e8) y = lastY - 30;   // never let two collide
      lastY = y;
      var on = !!mk.best;
      var w = 92, x = LAD.axis - 14 - w;

      ctx.fillStyle = on ? C.gold : 'rgba(247,244,230,0.28)';
      Art.roundRect(ctx, x, y - 14, w, 28, 7); ctx.fill();
      ctx.beginPath();                                       // arrowhead, pointing right
      ctx.moveTo(x + w, y - 9); ctx.lineTo(x + w + 12, y); ctx.lineTo(x + w, y + 9);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = on ? '#2b2b22' : 'rgba(40,46,20,0.8)';
      ctx.textAlign = 'left';
      ctx.font = '700 13px Atma, system-ui, sans-serif';
      ctx.fillText(mk.pl.name, x + 10, y + 5);
      ctx.textAlign = 'right';
      ctx.fillText(on ? String(mk.best.score) : '–', x + w - 10, y + 5);
    });
    ctx.textAlign = 'left';
  }

  function fitText2(ctx, text, x, y, maxW, startPx) {
    var px = startPx;
    do {
      ctx.font = '700 ' + px + 'px Atma, system-ui, sans-serif';
      if (ctx.measureText(text).width <= maxW) break;
      px -= 0.5;
    } while (px > 9);
    ctx.fillText(text, x, y);
  }

  function drawMenu(ctx, g) {
    ctx.fillStyle = C.mossDeep; ctx.fillRect(0, 0, DW, DH);
    Art.bark(ctx, 0, 0, DW, DH, 9.1);
    ctx.save(); ctx.globalAlpha = 0.62; ctx.fillStyle = C.mossDeep;
    ctx.fillRect(0, 0, DW, DH); ctx.restore();

    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';

    ctx.fillStyle = C.cream;
    ctx.font = '700 74px Atma, system-ui, sans-serif';
    ctx.fillText('Mmm! Leaves', MENU.lx, 150);

    ctx.fillStyle = C.gold; ctx.font = '600 19px Atma, system-ui, sans-serif';
    ctx.fillText('scribble your way to dinner', MENU.lx, 184);

    /* a live strip of the game itself: the moth crawls and the circles behind
       it turn to honey, then it loops */
    var x0 = 240, x1 = 760, y = 262, n = 6;
    var head = x0 + ((g.clock / 26) % (x1 - x0 + 90));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var w = 0; w <= 60; w++) ctx.lineTo(x0 + (x1 - x0) * (w / 60), y + Math.sin((w / 60) * 7) * 5);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(240,164,41,0.5)'; ctx.shadowBlur = 9;
    ctx.strokeStyle = '#f0a429'; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i2 = 0; i2 <= 60; i2++) {
      var t = i2 / 60;
      ctx.lineTo(x0 + (Math.min(head, x1) - x0) * t, y + Math.sin(t * 7) * 5);
    }
    ctx.stroke(); ctx.restore();

    var demo = ['nut', 'leaf', 'blossom', 'nut', 'blossom', 'leaf'];
    for (var k = 0; k < n; k++) {
      var cxk = x0 + k * ((x1 - x0) / (n - 1));
      var cyk = y + Math.sin((k / (n - 1)) * 7) * 5;
      if (cxk < head - 12) Art.eatenCircle(ctx, cxk, cyk, 21, demo[k], 1, k * 7, 1);
      else Art.foodCircle(ctx, cxk, cyk, 21, demo[k], (k % 3) + 1);
    }
    Art.mothAt(ctx, Math.min(head, x1 + 60), y - 2, 1.4, g.mothPhase, 0);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(247,244,230,0.85)'; ctx.font = '400 17px Atma, system-ui, sans-serif';
    ctx.fillText('A baby moth under the bark of a scribbly gum. The wind picks', MENU.lx, 352);
    ctx.fillText('your direction — you pick where to burrow, and what to eat.', MENU.lx, 380);

    bigButton(ctx, MENU.calebX, MENU.btnY, MENU.btnW, MENU.btnH, 'Play as Caleb');
    bigButton(ctx, MENU.ezraX, MENU.btnY, MENU.btnW, MENU.btnH, 'Play as Ezra', '#4aa7d8');
    bigButton(ctx, MENU.howX, MENU.howY, MENU.howW, MENU.howH, 'How to play', '#c9a33c');

    drawLadder(ctx, g);
    ctx.textAlign = 'left';
  }

  function menuHit(px, py) {
    if (py >= MENU.btnY && py <= MENU.btnY + MENU.btnH) {
      if (px >= MENU.calebX && px <= MENU.calebX + MENU.btnW) return 'caleb';
      if (px >= MENU.ezraX && px <= MENU.ezraX + MENU.btnW) return 'ezra';
    }
    if (px >= MENU.howX && px <= MENU.howX + MENU.howW &&
        py >= MENU.howY && py <= MENU.howY + MENU.howH) return 'how';
    return null;
  }

  /* ---------------- tutorial ---------------- */

  var TUT = { w: 780, h: 452, x: (DW - 780) / 2, y: 118 };
  TUT.backX = TUT.x + 40; TUT.btnY = TUT.y + TUT.h - 74;
  TUT.nextX = TUT.x + TUT.w - 190;

  var PAGES = [
    { title: 'The wind picks the direction',
      body: 'Each turn one tile is turned over. It tells you which way you are allowed to burrow — and nobody knows the order.' },
    { title: 'Drag the moth to burrow',
      body: 'Put your finger on a circle you have already eaten and drag the moth onto one that glows gold. Which circle you set off from is the whole game.' },
    { title: 'One of each makes a meal',
      body: 'Nuts, leaves and blossoms go onto your tracker. A meal is one of each, so keep the three columns level — a column miles ahead is wasted.' },
    { title: 'Four arrows, one free move',
      body: 'Some tracker circles have four arrows around them. Fill one and you get an extra burrow straight away — and those can chain.' },
    { title: 'Three rounds, then your rank',
      body: 'Your meals are counted at the end of every round and they all add up, so food early is worth the most. Then you find out what you grew into.' }
  ];

  function diagram(ctx, page, x, y, w, h) {
    var mx = x + w / 2, my = y + h / 2;
    if (page === 0) {
      Art.tile(ctx, mx - 170, my - 34, 68, 68, 'right', true, false);
      ctx.fillStyle = C.gold;
      Art.pip(ctx, mx - 60, my, 0, C.gold, 2.2);
      Art.pip(ctx, mx - 30, my, 0, C.gold, 2.2);
      Art.tile(ctx, mx + 20, my - 40, 80, 80, 'right', false, true);
      ctx.fillStyle = C.cream; ctx.font = 'bold 13px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIGHT this turn', mx + 60, my + 60);
    } else if (page === 1) {
      var ys = my;
      ctx.save();
      ctx.shadowColor = 'rgba(240,164,41,0.5)'; ctx.shadowBlur = 8;
      ctx.strokeStyle = '#f0a429'; ctx.lineWidth = 11; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx - 120, ys); ctx.lineTo(mx - 20, ys); ctx.stroke();
      ctx.restore();
      Art.eatenCircle(ctx, mx - 120, ys, 26, 'leaf', 1, 3, 1);
      Art.foodCircle(ctx, mx - 20, ys, 26, 'nut', 2);
      Art.ring(ctx, mx - 20, ys, 32, C.gold, 4, 16);
      Art.foodCircle(ctx, mx + 90, ys, 26, 'blossom', 1);
      Art.mothAt(ctx, mx - 108, ys - 3, 1.4, 0.6, 0);
      ctx.fillStyle = C.cream; ctx.font = 'bold 13px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('drag onto the glowing one', mx - 20, ys + 58);
    } else if (page === 2) {
      var kinds = ['nut', 'leaf', 'blossom'];
      for (var i = 0; i < 3; i++) {
        Art.foodCircle(ctx, mx - 150 + i * 78, my, 26, kinds[i], 1);
        if (i < 2) {
          ctx.fillStyle = C.cream; ctx.font = 'bold 24px Atma, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('+', mx - 111 + i * 78, my + 8);
        }
      }
      ctx.fillStyle = C.cream; ctx.font = 'bold 24px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('=', mx + 44, my + 8);
      ctx.fillStyle = C.gold; ctx.font = 'bold 26px Atma, system-ui, sans-serif';
      ctx.fillText('1 meal', mx + 118, my + 9);
    } else if (page === 3) {
      Art.panel(ctx, mx - 60, my - 52, 120, 104, 10, 'rgba(0,0,0,0.25)');
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        Art.pip(ctx, mx + d[0] * 26, my + d[1] * 26, Math.atan2(-d[1], -d[0]), C.gold, 1.7);
      });
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx, my, 17, 0, 6.3); ctx.fill();
      Art.leaf(ctx, mx, my, 1.25, -0.3);
      ctx.fillStyle = C.gold; ctx.font = 'bold 15px Atma, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('EXTRA MOVE', mx + 76, my + 5);
    } else {
      for (var r = 0; r < 3; r++) {
        chip(ctx, mx - 230, my - 52 + r * 36, 170, 30,
             r === 0 ? '#8fbf5a' : 'rgba(255,255,255,0.12)',
             'Round ' + (r + 1), r === 0 ? '4' : '–',
             r === 0 ? C.mossDeep : 'rgba(247,244,230,0.5)');
      }
      ctx.fillStyle = C.gold; ctx.font = 'bold 26px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Moonlit Moth', mx + 100, my - 4);
      ctx.fillStyle = 'rgba(247,244,230,0.6)'; ctx.font = 'italic 13px Atma, system-ui, sans-serif';
      ctx.fillText('…or better', mx + 100, my + 20);
    }
    ctx.textAlign = 'left';
  }

  function drawTutorial(ctx, g) {
    drawMenu(ctx, g);                       // the tutorial always sits over the home screen
    dim(ctx, 0.72);

    var t = g.tutorial, page = PAGES[t.page];
    Art.panel(ctx, TUT.x, TUT.y, TUT.w, TUT.h, 20, 'rgba(38,45,16,0.97)');
    ctx.strokeStyle = 'rgba(255,211,42,0.35)'; ctx.lineWidth = 2;
    Art.roundRect(ctx, TUT.x + 1, TUT.y + 1, TUT.w - 2, TUT.h - 2, 20); ctx.stroke();

    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(247,244,230,0.45)'; ctx.font = 'bold 11px Atma, system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', TUT.x + 40, TUT.y + 40);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(247,244,230,0.45)'; ctx.font = 'bold 12px Atma, system-ui, sans-serif';
    ctx.fillText('Skip', TUT.x + TUT.w - 40, TUT.y + 40);

    ctx.textAlign = 'left';
    ctx.fillStyle = C.cream; ctx.font = 'bold 28px Atma, system-ui, sans-serif';
    ctx.fillText(page.title, TUT.x + 40, TUT.y + 82);

    diagram(ctx, t.page, TUT.x + 40, TUT.y + 104, TUT.w - 80, 150);

    ctx.fillStyle = 'rgba(247,244,230,0.86)'; ctx.font = '17px Atma, system-ui, sans-serif';
    ctx.textAlign = 'left';
    wrap(ctx, page.body, TUT.x + 40, TUT.y + 292, TUT.w - 80, 25);

    // page dots
    for (var i = 0; i < PAGES.length; i++) {
      ctx.fillStyle = i === t.page ? C.gold : 'rgba(247,244,230,0.25)';
      ctx.beginPath();
      ctx.arc(TUT.x + TUT.w / 2 - (PAGES.length - 1) * 9 + i * 18, TUT.btnY + 24, 5, 0, 6.3);
      ctx.fill();
    }

    if (t.page > 0) bigButton(ctx, TUT.backX, TUT.btnY, 130, 48, 'Back', '#7b8a3e');
    bigButton(ctx, TUT.nextX, TUT.btnY, 150, 48,
              t.page === PAGES.length - 1 ? 'Play' : 'Next');
  }

  function wrap(ctx, text, x, y, maxW, lh) {
    var words = text.split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + n * lh); n++; line = words[i];
      } else { line = test; }
    }
    if (line) ctx.fillText(line, x, y + n * lh);
  }

  function tutorialHit(px, py, g) {
    if (px >= TUT.x + TUT.w - 90 && px <= TUT.x + TUT.w - 30 &&
        py >= TUT.y + 22 && py <= TUT.y + 50) return 'skip';
    if (py >= TUT.btnY && py <= TUT.btnY + 48) {
      if (g.tutorial.page > 0 && px >= TUT.backX && px <= TUT.backX + 130) return 'back';
      if (px >= TUT.nextX && px <= TUT.nextX + 150) return 'next';
    }
    return null;
  }

  function tutorialPages() { return PAGES.length; }

  function drawWildChoice(ctx, g) {
    dim(ctx, 0.55);
    var w = 460, h = 190, x = (DW - w) / 2, y = 250;
    Art.panel(ctx, x, y, w, h, 16, C.cream);
    ctx.fillStyle = C.mossDeep; ctx.font = 'bold 22px Atma, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('A wild circle — take your pick', x + w / 2, y + 42);
    ctx.textAlign = 'left';
    var fns = [Art.nut, Art.leaf, Art.blossom];
    for (var i = 0; i < 3; i++) {
      var bx = x + 40 + i * 130, by = y + 66, bw = 110, bh = 96;
      ctx.fillStyle = ['#ffe6bf', '#d6f5d0', '#ffd9ec'][i];
      Art.roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = C.mossDeep; ctx.lineWidth = 2;
      Art.roundRect(ctx, bx, by, bw, bh, 12); ctx.stroke();
      fns[i](ctx, bx + bw / 2, by + 38, 1.7, -0.3);
      ctx.fillStyle = C.mossDeep; ctx.font = 'bold 13px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['NUT', 'LEAF', 'BLOSSOM'][i], bx + bw / 2, by + 80);
      ctx.textAlign = 'left';
    }
  }

  function wildHit(px, py) {
    var w = 460, x = (DW - w) / 2, y = 250;
    for (var i = 0; i < 3; i++) {
      var bx = x + 40 + i * 130, by = y + 66;
      if (px >= bx && px <= bx + 110 && py >= by && py <= by + 96) return Board.KINDS[i];
    }
    return null;
  }

  function drawRoundEnd(ctx, g) {
    var a = g.roundCard;
    dim(ctx, 0.62 * a.p);
    var w = 520, h = 268, x = (DW - w) / 2;
    var y = 190 - (1 - a.p) * 40;
    ctx.save(); ctx.globalAlpha = a.p;
    Art.panel(ctx, x, y, w, h, 18, C.cream);
    ctx.fillStyle = C.mossDeep;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 30px Atma, system-ui, sans-serif';
    ctx.fillText('Round ' + (a.round + 1) + ' done', x + w / 2, y + 52);

    ctx.font = '15px Atma, system-ui, sans-serif'; ctx.fillStyle = '#5a6330';
    ctx.fillText('meals you can count so far', x + w / 2, y + 82);

    ctx.fillStyle = '#e08c17'; ctx.font = 'bold 72px Atma, system-ui, sans-serif';
    ctx.fillText(String(a.shown), x + w / 2, y + 156);

    if (a.round === 1) {
      ctx.fillStyle = '#b06a00'; ctx.font = 'bold 13px Atma, system-ui, sans-serif';
      ctx.fillText('achievement tiles have flipped to silver', x + w / 2, y + 190);
    }
    bigButton(ctx, x + w / 2 - 100, y + 204, 200, 48,
              a.round === 2 ? 'Final score' : 'Round ' + (a.round + 2));
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function roundBtnHit(px, py, g) {
    var w = 520, x = (DW - w) / 2, y = 190;
    return px >= x + w / 2 - 100 && px <= x + w / 2 + 100 && py >= y + 204 && py <= y + 252;
  }

  function drawGameOver(ctx, g) {
    var o = g.over;
    dim(ctx, 0.72 * o.p);
    var w = 620, h = 458, x = (DW - w) / 2, y = 116;
    ctx.save(); ctx.globalAlpha = o.p;
    Art.panel(ctx, x, y, w, h, 20, C.cream);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = C.mossDeep; ctx.font = 'bold 26px Atma, system-ui, sans-serif';
    ctx.fillText('Three rounds eaten', x + w / 2, y + 48);

    // the breakdown, revealed a line at a time
    var lines = [
      ['Round 1', g.tracker.rounds[0]],
      ['Round 2', g.tracker.rounds[1]],
      ['Round 3', g.tracker.rounds[2]],
      ['Full columns (' + Tracker.columnBonus(g.tracker).full + ')', Tracker.columnBonus(g.tracker).points],
      ['Achievements', Achievements.total(g.achievements)]
    ];
    ctx.font = '16px Atma, system-ui, sans-serif';
    lines.forEach(function (ln, i) {
      if (o.rows <= i) return;
      ctx.textAlign = 'left'; ctx.fillStyle = '#5a6330';
      ctx.fillText(ln[0], x + 90, y + 92 + i * 28);
      ctx.textAlign = 'right'; ctx.fillStyle = C.mossDeep;
      ctx.font = 'bold 16px Atma, system-ui, sans-serif';
      ctx.fillText(String(ln[1] || 0), x + w - 90, y + 92 + i * 28);
      ctx.font = '16px Atma, system-ui, sans-serif';
    });

    if (o.rows >= 5) {
      ctx.strokeStyle = 'rgba(90,99,48,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 90, y + 248); ctx.lineTo(x + w - 90, y + 248); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = C.mossDeep;
      ctx.font = 'bold 20px Atma, system-ui, sans-serif';
      ctx.fillText('Total', x + 90, y + 280);
      ctx.textAlign = 'right'; ctx.fillStyle = '#e08c17';
      ctx.font = 'bold 34px Atma, system-ui, sans-serif';
      ctx.fillText(String(o.score), x + w - 90, y + 282);
    }

    if (o.rankP > 0) {
      ctx.save();
      ctx.globalAlpha = o.rankP; ctx.textAlign = 'center';
      var sc = 0.7 + o.rankP * 0.3;
      ctx.translate(x + w / 2, y + 344); ctx.scale(sc, sc);
      ctx.fillStyle = C.mossDeep;
      ctx.shadowColor = 'rgba(255,211,42,0.9)'; ctx.shadowBlur = 24;
      ctx.font = 'bold 34px Atma, system-ui, sans-serif';
      ctx.fillText(o.rank.name, 0, 0);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5a6330'; ctx.font = 'italic 14px Atma, system-ui, sans-serif';
      ctx.fillText(o.rank.blurb, x + w / 2, y + 370);
      if (o.newBest) {
        ctx.fillStyle = '#e08c17'; ctx.font = 'bold 13px Atma, system-ui, sans-serif';
        ctx.fillText('NEW PERSONAL BEST', x + w / 2, y + 392);
      }
      bigButton(ctx, x + w / 2 - 190, y + 404, 180, 46, 'Play again');
      bigButton(ctx, x + w / 2 + 10, y + 404, 180, 46, 'Menu', '#c9a33c');
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function overHit(px, py) {
    var w = 620, x = (DW - w) / 2, y = 116;
    if (py >= y + 404 && py <= y + 450) {
      if (px >= x + w / 2 - 190 && px <= x + w / 2 - 10) return 'again';
      if (px >= x + w / 2 + 10 && px <= x + w / 2 + 190) return 'menu';
    }
    return null;
  }

  /* banner across the middle for extra moves and claimed achievements */
  function drawBanner(ctx, g) {
    var b = g.banner;
    if (!b) return;
    var p = b.p;
    var slide = (1 - Math.min(1, p * 3)) * 220 - (p > 0.78 ? (p - 0.78) / 0.22 * 220 : 0);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.min(p * 4, (1 - p) * 4));
    ctx.translate(geo.boardX + geo.boardW / 2 + slide, 120);
    ctx.fillStyle = b.color || C.gold;
    ctx.shadowColor = b.color || C.gold; ctx.shadowBlur = 24;
    Art.roundRect(ctx, -180, -26, 360, 52, 26); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.mossDeep; ctx.font = 'bold 22px Atma, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, 0, 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* hit test for a legal target circle */
  function targetHit(px, py, targets) {
    for (var i = 0; i < targets.length; i++) {
      var m = targets[i];
      var dx = px - cx(m.c2), dy = py - cy(m.r2);
      if (dx * dx + dy * dy <= (geo.r + 13) * (geo.r + 13)) return m;
    }
    return null;
  }

  return {
    geo: geo, DW: DW, DH: DH,
    cx: cx, cy: cy, tileX: tileX, trkCX: trkCX, trkCY: trkCY,
    edgePath: edgePath, resetCache: resetCache,
    buildBackground: buildBackground,
    background: function () { return bg; },
    drawBoard: drawBoard, drawRail: drawRail, drawMenu: drawMenu,
    drawWildChoice: drawWildChoice, drawRoundEnd: drawRoundEnd,
    drawGameOver: drawGameOver, drawBanner: drawBanner,
    wildHit: wildHit, roundBtnHit: roundBtnHit, overHit: overHit,
    menuHit: menuHit, targetHit: targetHit, PLAYERS: PLAYERS,
    drawTutorial: drawTutorial, tutorialHit: tutorialHit, tutorialPages: tutorialPages,
    dottedPath: dottedPath, dottedWorstGap: dottedWorstGap,
    TILE_LABEL: TILE_LABEL
  };
})();
