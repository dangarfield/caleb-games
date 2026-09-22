/* mmm-leaves — game.js
   State machine, turn loop, input and wiring. Nothing draws here; nothing
   decides rules here either. This file is the referee. */

(function () {
  'use strict';

  var Store = ArcadeStore('mmmLeaves');
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');

  var DW = UI.DW, DH = UI.DH;
  var view = { scale: 1, ox: 0, oy: 0 };

  /* Every blocking duration in one place. A turn used to cost about 2.2s of
     animation before you could act again; across 26 moves that is a minute of
     waiting. These roughly halve it. */
  var T = {
    flip:      300,   // tile turning over
    crawl:     300,   // moth walking a printed line
    crawlDot:  360,   // ...along a dotted trail, which is longer
    crawlDrag: 150,   // committed by dragging — the moth is already there
    chew:      150,
    pop:       200,   // the eaten circle blooming
    fly:       260,   // food arcing to the tracker
    flyStagger: 70,
    betweenTurns: 120,
    roundIntro:   420
  };

  var TILE_SET = ['left', 'right', 'up', 'down', 'leftright', 'updown', 'dotted', 'dotted'];

  var g = {
    state: 'menu',
    clock: 0,
    board: null, tracker: null, achievements: [],
    tiles: [], tileState: [],
    round: 0, turn: 0,
    targets: [], moving: null, flyers: [],
    mothPos: { x: 0, y: 0, ang: 0 },
    pops: {}, trkPops: {}, chew: null, achFlash: {},
    banner: null, flip: null, roundCard: null, over: null,
    drift: [], extras: 0, silverPhase: false,
    pendingWild: null, best: null, bests: {}, player: 'caleb', seed: 0, mothFacing: 0,
    tutorial: { page: 0 }, tutorialFrom: 'menu', seenTutorial: false,
    drag: null, sources: {}, mothPhase: 0
  };

  /* ---------------- helpers ---------------- */

  function banner(text, color, dur) {
    g.banner = { text: text, color: color || Art.C.gold, p: 0 };
    Anim.run({
      dur: dur || 1500, ease: Anim.Ease.linear, blocking: false,
      update: function (_, raw) { if (g.banner) g.banner.p = raw; },
      done: function () { g.banner = null; }
    });
  }

  function makeDrift() {
    g.drift = [];
    for (var i = 0; i < 5; i++) {
      g.drift.push({
        x: UI.geo.boardX + Math.random() * UI.geo.boardW,
        y: UI.geo.boardY + Math.random() * UI.geo.boardH,
        vx: -0.09 - Math.random() * 0.14, vy: 0.05 + Math.random() * 0.12,
        s: 0.9 + Math.random() * 0.6, rot: Math.random() * 6.3,
        spin: (Math.random() - 0.5) * 0.008,
        a: 0.10 + Math.random() * 0.10,
        kind: i % 2 ? 'leaf' : 'blossom'
      });
    }
  }

  function updateDrift(dt) {
    var k = dt / 16.67;
    g.drift.forEach(function (d) {
      d.x += d.vx * k; d.y += d.vy * k; d.rot += d.spin * k;
      if (d.x < UI.geo.boardX - 20) { d.x = UI.geo.boardX + UI.geo.boardW + 20; }
      if (d.y > UI.geo.boardY + UI.geo.boardH + 20) { d.y = UI.geo.boardY - 20; }
    });
  }

  /* Resting pose keeps whichever way it was last heading, so a moth that
     burrowed left does not snap round to face right the moment it stops. */
  function mothTo(r, c, facing) {
    if (facing !== undefined) g.mothFacing = facing;
    var left = g.mothFacing === Math.PI;
    g.mothPos.x = UI.cx(c) + (left ? -13 : 13);
    g.mothPos.y = UI.cy(r) - 3;
    g.mothPos.ang = g.mothFacing || 0;
  }

  /* ---------------- game setup ---------------- */

  function newGame(player) {
    if (player) g.player = player;
    g.seed = (Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0;
    g.board = Board.create(g.seed);
    g.tracker = Tracker.create();
    g.achievements = Achievements.pick(Board.rng(g.seed ^ 0x9e3779b9));
    g.round = 0; g.turn = 0;
    g.targets = []; g.moving = null; g.flyers = [];
    g.pops = {}; g.trkPops = {}; g.chew = null; g.achFlash = {};
    g.banner = null; g.flip = null; g.roundCard = null; g.over = null;
    g.extras = 0; g.silverPhase = false; g.pendingWild = null;
    Anim.clear();
    UI.resetCache();
    UI.buildBackground(g.board);
    makeDrift();
    g.mothFacing = 0;
    mothTo(g.board.start.r, g.board.start.c, 0);
    g.state = 'play';
    startRound();
  }

  function startRound() {
    // shuffle the eight, throw one away face down, lay the other seven out
    var bag = TILE_SET.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    bag.pop();
    g.tiles = bag;
    g.tileState = ['down', 'down', 'down', 'down', 'down', 'down', 'down'];
    g.turn = 0;

    banner('Round ' + (g.round + 1), '#8fbf5a', 1400);
    Anim.wait(T.roundIntro, flipTile);
  }

  function flipTile() {
    if (g.turn >= 7) { endRound(); return; }
    Sfx.play('flip');
    g.flip = { index: g.turn, p: 0 };
    Anim.run({
      dur: T.flip, ease: Anim.Ease.inOut,
      update: function (p) { if (g.flip) g.flip.p = p; },
      done: function () {
        g.flip = null;
        g.tileState[g.turn] = 'current';
        openTurn();
      }
    });
  }

  function groupSources() {
    g.sources = {};
    g.targets.forEach(function (m) {
      var k = m.r1 + ',' + m.c1;
      (g.sources[k] = g.sources[k] || []).push(m);
    });
  }

  function openTurn() {
    g.targets = Board.legalMoves(g.board, g.tiles[g.turn]);
    groupSources();
    if (!g.targets.length) {
      banner('No move this turn', '#e8a04a', 1500);
      Anim.wait(700, finishTurn);
    }
  }

  /* ---------------- a move ---------------- */

  function doMove(m, viaDrag) {
    g.targets = []; g.sources = {}; g.drag = null;
    var pts = UI.edgePath(m.r1, m.c1, m.r2, m.c2, m.dot);
    g.moving = { pts: pts, p: 0, dot: m.dot, move: m };
    Sfx.play('crawl');

    Anim.run({
      dur: viaDrag ? T.crawlDrag : (m.dot ? T.crawlDot : T.crawl),
      ease: viaDrag ? Anim.Ease.out : Anim.Ease.inOut,
      update: function (p) {
        g.moving.p = p;
        var at = Art.pointAt(pts, p);
        g.mothPos.x = at.x; g.mothPos.y = at.y; g.mothPos.ang = at.ang;
      },
      done: function () { chew(m); }
    });
  }

  function chew(m) {
    g.moving = null;
    var cell = Board.apply(g.board, m);
    Sfx.play('chew');
    g.chew = { r: m.r2, c: m.c2, amount: 0 };
    g.pops[m.r2 + ',' + m.c2] = 0;
    var dx = m.c2 - m.c1;
    mothTo(m.r2, m.c2, dx < 0 ? Math.PI : dx > 0 ? 0 : undefined);

    Anim.run({
      dur: T.chew, ease: Anim.Ease.linear,
      update: function (p) { if (g.chew) g.chew.amount = p; },
      done: function () {
        g.chew = null;
        Anim.run({
          dur: T.pop, ease: Anim.Ease.back,
          update: function (p) { g.pops[m.r2 + ',' + m.c2] = p; },
          done: function () { delete g.pops[m.r2 + ',' + m.c2]; }
        });
        Anim.burst(UI.cx(m.c2), UI.cy(m.r2), '#ffcf5c', 12, 2.0);
        if (cell.kind === 'wild') {
          g.pendingWild = { r: m.r2, c: m.c2 };
          g.state = 'wild';
        } else {
          collect(cell.kind, cell.count, m.r2, m.c2);
        }
      }
    });
  }

  var FOOD_COLOR = { nut: '#f9a01b', leaf: '#3fbf4a', blossom: '#ff4fa3' };

  function collect(kind, count, r, c) {
    var res = Tracker.add(g.tracker, kind, count);
    var fromX = UI.cx(c), fromY = UI.cy(r);

    if (!res.cells.length) {
      Anim.floatText(fromX, fromY - 28, 'column full', '#ffdca8', 15);
      Anim.wait(160, function () { afterCollect(0); });
      return;
    }

    var landed = 0;
    res.cells.forEach(function (cellRef, i) {
      var tx = UI.trkCX(cellRef.col), ty = UI.trkCY(cellRef.row);
      var flyer = { kind: kind, x: fromX, y: fromY, p: 0 };
      g.flyers.push(flyer);
      Anim.run({
        dur: T.fly, delay: i * T.flyStagger, ease: Anim.Ease.inOut,
        update: function (p) {
          flyer.p = p;
          // arc the food up and over into its cell
          flyer.x = fromX + (tx - fromX) * p;
          flyer.y = fromY + (ty - fromY) * p - Math.sin(p * Math.PI) * 70;
        },
        done: function () {
          g.flyers.splice(g.flyers.indexOf(flyer), 1);
          Sfx.play('stamp');
          var pk = cellRef.row + ':' + cellRef.col;
          g.trkPops[pk] = 0;
          Anim.run({
            dur: 240, ease: Anim.Ease.back, blocking: false,
            update: function (q) { g.trkPops[pk] = 0.3 + q * 0.7; },
            done: function () { delete g.trkPops[pk]; }
          });
          Anim.burst(tx, ty, FOOD_COLOR[kind], 7, 1.5, 380);
          landed++;
          if (landed === res.cells.length) afterCollect(res.extras);
        }
      });
    });
  }

  function afterCollect(extras) {
    // stats the achievements read
    var st = { board: g.board, tracker: g.tracker, stats: g.stats };
    var won = Achievements.check(g.achievements, st);
    won.forEach(function (a, i) {
      g.achFlash[a.id] = 1;
      Anim.run({
        dur: 1200, delay: i * 300, ease: Anim.Ease.linear, blocking: false,
        update: function (_, raw) { g.achFlash[a.id] = 1 - raw; },
        done: function () { delete g.achFlash[a.id]; }
      });
      Anim.confetti(UI.geo.achX + UI.geo.achW / 2, UI.geo.achY + 60,
                    260, ['#ffd32a', '#8fbf5a', '#ff4fa3', '#39b6e8'], 36);
      Sfx.play('achieve');
      banner(a.title + '  +' + a.points, '#8fbf5a', 1700);
    });

    if (extras > 0) {
      g.extras += extras;
    }
    if (won.length) {
      Anim.wait(380, nextStep);
    } else {
      nextStep();
    }
  }

  function nextStep() {
    if (g.extras > 0) {
      g.extras--;
      var moves = Board.extraMoves(g.board);
      if (moves.length) {
        Sfx.play('extra');
        banner('EXTRA MOVE', '#ffd32a', 1500);
        var mid = UI.cx(g.board.moth.c), midY = UI.cy(g.board.moth.r);
        Anim.burst(mid, midY, '#ffd32a', 26, 3.4, 700);
        g.targets = moves;
        groupSources();
        return;
      }
    }
    finishTurn();
  }

  function finishTurn() {
    g.tileState[g.turn] = 'used';
    g.extras = 0;
    g.turn++;
    if (g.turn >= 7) { endRound(); return; }
    Anim.wait(T.betweenTurns, flipTile);
  }

  /* ---------------- round and game end ---------------- */

  function endRound() {
    var banked = Tracker.bankRound(g.tracker, g.round);
    Sfx.play('roundEnd');
    g.roundCard = { round: g.round, shown: 0, target: banked, p: 0 };
    g.state = 'roundEnd';
    Anim.run({
      dur: 380, ease: Anim.Ease.out,
      update: function (p) { if (g.roundCard) g.roundCard.p = p; },
      done: function () {
        Anim.run({
          dur: 620, ease: Anim.Ease.out,
          update: function (p) { if (g.roundCard) g.roundCard.shown = Math.round(p * banked); },
          done: function () {
            if (!g.roundCard) return;
            Anim.confetti(DW / 2, 300, 420,
                          ['#ffd32a', '#8fbf5a', '#ff4fa3', '#39b6e8', '#f9a01b'], 70);
          }
        });
      }
    });
  }

  function advanceRound() {
    // the player can tap through the card while it is still counting up, so
    // drop anything still in flight before the next round sets up
    Anim.clear();
    g.round++;
    g.roundCard = null;
    if (g.round >= 3) { endGame(); return; }
    if (g.round === 2) {
      Achievements.flipToSilver(g.achievements);
      g.silverPhase = true;
    }
    g.state = 'play';
    startRound();
  }

  function endGame() {
    var achPts = Achievements.total(g.achievements);
    var score = Tracker.finalScore(g.tracker, achPts);
    var rk = Tracker.rank(score);
    var prev = g.bests[g.player];
    var newBest = !prev || score > prev.score;
    if (newBest) {
      g.bests[g.player] = { score: score, rank: rk.name };
      g.best = g.bests[g.player];
    }
    try {
      var save = Store.get() || {};
      save.players = save.players || {};
      var me = save.players[g.player] || { plays: 0 };
      me.plays = (me.plays || 0) + 1;
      if (newBest) { me.score = score; me.rank = rk.name; }
      save.players[g.player] = me;
      save.seenTutorial = save.seenTutorial || g.seenTutorial;
      Store.set(null, save);
    } catch (e) { /* saves are best effort */ }

    g.state = 'over';
    g.over = { p: 0, rows: 0, score: score, rank: rk, rankP: 0, newBest: newBest };
    Sfx.play('gameOver');

    Anim.run({
      dur: 360, ease: Anim.Ease.out,
      update: function (p) { if (g.over) g.over.p = p; },
      done: function () {
        var steps = [];
        for (var i = 1; i <= 5; i++) {
          (function (n) {
            steps.push({ dur: 220, update: null, onDone: function () { if (g.over) g.over.rows = n; } });
          })(i);
        }
        steps.push({ dur: 400, update: null, onDone: function () {
          if (!g.over) return;
          Anim.run({
            dur: 520, ease: Anim.Ease.back,
            update: function (p) { if (g.over) g.over.rankP = p; },
            done: function () {
              if (!g.over) return;
              Anim.confetti(DW / 2, 240, 560,
                            ['#ffd32a', '#8fbf5a', '#ff4fa3', '#39b6e8', '#f9a01b'], 110);
            }
          });
        } });
        Anim.seq(steps);
      }
    });
  }

  /* stats the achievements need that the board does not hold */
  g.stats = { wild: 0, triples: 0 };

  /* ---------------- tutorial ---------------- */

  function openTutorial(from) {
    g.tutorial = { page: 0 };
    g.tutorialFrom = from;
    g.state = 'tutorial';
  }

  function closeTutorial() {
    if (!g.seenTutorial) {
      g.seenTutorial = true;
      try {
        var cur = Store.get() || {};
        cur.seenTutorial = true;
        Store.set(null, cur);
      } catch (e) { /* saves are best effort */ }
    }
    if (g.tutorialFrom === 'play') newGame(g.player);
    else g.state = 'menu';
  }

  /* ---------------- input ---------------- */

  function toDesign(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.ox) / view.scale,
      y: (clientY - rect.top - view.oy) / view.scale
    };
  }

  function sourceHit(p) {
    var best = null, bd = 1e9;
    Object.keys(g.sources).forEach(function (k) {
      var q = k.split(','), r = +q[0], c = +q[1];
      var dx = p.x - UI.cx(c), dy = p.y - UI.cy(r);
      var d = dx * dx + dy * dy;
      if (d < (UI.geo.r + 16) * (UI.geo.r + 16) && d < bd) { bd = d; best = { r: r, c: c, moves: g.sources[k] }; }
    });
    return best;
  }

  function dragHover(p) {
    if (!g.drag) return null;
    return UI.targetHit(p.x, p.y, g.drag.moves);
  }

  function onPointerDown(e) {
    var p = toDesign(e.clientX, e.clientY);
    Sfx.init();
    Sfx.startMusic();

    if (g.state === 'menu') {
      var mh = UI.menuHit(p.x, p.y);
      if (mh === 'caleb' || mh === 'ezra') {
        Sfx.play('tap');
        g.player = mh;
        g.best = g.bests[mh] || null;
        if (g.seenTutorial) newGame(mh); else openTutorial('play');
      } else if (mh === 'how') {
        Sfx.play('tap'); openTutorial('menu');
      }
      return;
    }
    if (g.state === 'tutorial') {
      var th = UI.tutorialHit(p.x, p.y, g);
      if (th === 'next') {
        Sfx.play('tap');
        if (g.tutorial.page >= UI.tutorialPages() - 1) closeTutorial();
        else g.tutorial.page++;
      } else if (th === 'back') { Sfx.play('tap'); g.tutorial.page--; }
      else if (th === 'skip')   { Sfx.play('tap'); closeTutorial(); }
      return;
    }
    if (g.state === 'wild') {
      var kind = UI.wildHit(p.x, p.y);
      if (kind) {
        var w = g.pendingWild;
        g.pendingWild = null; g.state = 'play'; g.stats.wild++;
        Sfx.play('tap');
        collect(kind, 1, w.r, w.c);
      }
      return;
    }
    if (g.state === 'roundEnd') {
      if (UI.roundBtnHit(p.x, p.y, g)) { Sfx.play('tap'); advanceRound(); }
      return;
    }
    if (g.state === 'over') {
      if (g.over.rankP < 1) return;
      var hit = UI.overHit(p.x, p.y);
      if (hit === 'again') { Sfx.play('tap'); newGame(); }
      else if (hit === 'menu') { Sfx.play('tap'); Anim.clear(); g.over = null; g.state = 'menu'; }
      return;
    }

    if (g.state !== 'play' || Anim.isBusy() || !g.targets.length) return;

    /* Pick up the moth from a circle already eaten and drag it to where you
       want to burrow. Grabbing the source is the point: several circles can
       often reach the same place, and which one you leave from changes the tree. */
    var src = sourceHit(p);
    if (src) {
      g.drag = { r: src.r, c: src.c, moves: src.moves,
                 x: p.x, y: p.y, hover: null, from: { x: UI.cx(src.c), y: UI.cy(src.r) } };
      g.mothPos.x = p.x; g.mothPos.y = p.y;
      Sfx.play('pick');
      return;
    }

    // tapping a highlighted circle still works, so a fumbled drag is not a dead end
    var m = UI.targetHit(p.x, p.y, g.targets);
    if (m) { Sfx.play('tap'); doMove(m); }
  }

  function onPointerMove(e) {
    if (!g.drag) return;
    var p = toDesign(e.clientX, e.clientY);
    g.drag.x = p.x; g.drag.y = p.y;
    var was = g.drag.hover;
    g.drag.hover = dragHover(p);
    if (g.drag.hover && g.drag.hover !== was) Sfx.play('tap');
    var dx = p.x - g.drag.from.x;
    g.mothPos.x = p.x; g.mothPos.y = p.y;
    g.mothPos.ang = dx < -6 ? Math.PI : 0;
    g.mothFacing = g.mothPos.ang;
  }

  function onPointerUp(e) {
    if (!g.drag) return;
    var p = toDesign(e.clientX, e.clientY);
    var m = dragHover(p);
    var src = g.drag;
    g.drag = null;
    if (m) { doMove(m, true); return; }
    // nothing under the finger — the moth crawls back where it came from
    Sfx.play('nope');
    var sx = g.mothPos.x, sy = g.mothPos.y;
    var tx = UI.cx(src.c) + (g.mothFacing === Math.PI ? -13 : 13), ty = UI.cy(src.r) - 3;
    Anim.run({
      dur: 150, ease: Anim.Ease.out,
      update: function (t) {
        g.mothPos.x = sx + (tx - sx) * t;
        g.mothPos.y = sy + (ty - sy) * t;
      },
      done: function () { mothTo(src.r, src.c); }
    });
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  /* ---------------- loop ---------------- */

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var s = Math.min(w / DW, h / DH);
    view.scale = s;
    view.ox = (w - DW * s) / 2;
    view.oy = (h - DH * s) / 2;
    view.dpr = dpr;
  }
  window.addEventListener('resize', resize);
  resize();

  var last = 0;
  function frame(now) {
    try { render(now); }
    catch (err) { if (window.console) console.error('frame', err); }
    requestAnimationFrame(frame);
  }

  function render(now) {
    var dt = Math.min(48, now - last || 16);
    last = now;
    g.clock += dt;
    // the wriggle used to tick at a fixed rate whatever the moth was doing
    g.mothPhase += dt * ((g.moving || g.drag) ? 0.021 : 0.009);
    Anim.update(dt);
    updateDrift(dt);

    var dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3d461b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);

    if (g.state === 'menu') {
      UI.drawMenu(ctx, g);
    } else if (g.state === 'tutorial') {
      UI.drawTutorial(ctx, g);
    } else {
      var bg = UI.background();
      if (bg) ctx.drawImage(bg, 0, 0);
      UI.drawBoard(ctx, g);
      UI.drawRail(ctx, g);

      // food in flight
      g.flyers.forEach(function (f) {
        var fn = f.kind === 'nut' ? Art.nut : f.kind === 'leaf' ? Art.leaf : Art.blossom;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8;
        fn(ctx, f.x, f.y, 1.5 - f.p * 0.7, -0.3 + f.p * 2);
        ctx.restore();
      });

      Anim.draw(ctx);
      UI.drawBanner(ctx, g);

      if (g.state === 'wild') UI.drawWildChoice(ctx, g);
      if (g.state === 'roundEnd' && g.roundCard) UI.drawRoundEnd(ctx, g);
      if (g.state === 'over' && g.over) UI.drawGameOver(ctx, g);
    }
  }

  /* ---------------- boot ---------------- */

  /* Canvas never triggers a font download — it just falls back for any face the
     page has not already loaded some other way. The body and the back button pull
     in 400 and 600, so 700 was never fetched and every bold string on the canvas
     (the wild circle's question mark included) quietly rendered in system-ui.
     Each weight has to be asked for by name. */
  var WEIGHTS = ['400 20px Atma', '500 20px Atma', '600 20px Atma', '700 20px Atma'];

  function fontReady(then) {
    if (!document.fonts || !document.fonts.load) { then(); return; }
    var fired = false;
    var go = function () { if (!fired) { fired = true; then(); } };
    var waits = WEIGHTS.map(function (f) {
      return document.fonts.load(f).catch(function () {});
    });
    Promise.all(waits).then(function () {
      return document.fonts.ready;
    }).then(go, go);
    setTimeout(go, 1500);            // never let a slow font hold up the game
  }

  Store.ready(function () {
    var save = Store.get() || {};
    UI.PLAYERS.forEach(function (pl) {
      var rec = save.players && save.players[pl.id];
      if (rec && typeof rec.score === 'number') {
        g.bests[pl.id] = { score: rec.score, rank: rec.rank };
      }
    });
    g.best = g.bests[g.player] || null;
    if (save.seenTutorial) g.seenTutorial = true;
    makeDrift();
    Sfx.music();
    fontReady(function () { requestAnimationFrame(frame); });
  });

  // expose for the headless test harness only
  window.__mmm = { g: g, newGame: newGame, UI: UI, view: view };
})();
