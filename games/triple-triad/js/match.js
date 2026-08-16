/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * js/match.js — one match: board, hands, turn order, animation timeline,
 * Sudden Death, the tutorial coach and all of the match rendering.
 */
'use strict';

(function (TT) {

  var COL = TT.COL;

  var DEAL_MS = 850;
  var PLACE_MS = 320;
  var FLIP_MS = 420;
  var BANNER_MS = 900;
  var AI_THINK_MS = 620;
  var OVER_FADE_MS = 550;
  /* The coin flip is tilted the player's way: going first is a real advantage
   * and this is a game for a seven-year-old. */
  var PLAYER_FIRST_CHANCE = 0.6;
  /* Selection slide: how far a chosen card travels toward the board, as a
   * fraction of a card.  The resting gap beside the grid is half a card, so
   * anything under 0.5 leaves visible daylight between card and board. */
  var SELECT_SLIDE = 0.32;
  var SLIDE_MS = 170;                // and how long that slide takes, in or out

  var M = null;
  TT.match = function () { return M; };

  function shuffled(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Element tiles. The original also shuffles NEUTRAL into the pool, which
   * yields invisible no-op tiles; we drop it so every tile a kid can see does
   * something. */
  function randomElements() {
    var pool = shuffled([1, 2, 3, 4, 5, 6, 7, 8]);
    var b = [];
    for (var i = 0; i < 9; i++) b[i] = (Math.random() < 0.25 && pool.length) ? pool.pop() : 0;
    return b;
  }

  function coinFlip() { return Math.random() < PLAYER_FIRST_CHANCE ? 'you' : 'foe'; }
  TT.coinFlip = coinFlip;          // exposed so the harness can sample the odds

  function slot(card, owner, handIdx) {
    return {
      card: card, owner: owner, origin: owner, handIdx: handIdx,
      placedAt: 0, flipAt: 0, flipFrom: null, pos: -1
    };
  }

  /**
   * Begin a match.
   * @param opponent one of TT.OPPONENTS
   * @param handIds  the player's five card ids
   * @param opts     { tutorial:bool }
   */
  TT.startMatch = function (opponent, handIds, opts) {
    opts = opts || {};
    var rules = opponent.ruleSet;
    var foeIds = TT.buildOpponentHand(opponent);
    TT.preloadArt(handIds.concat(foeIds));

    var youSlots = handIds.map(function (id, i) { return slot(TT.CARD_BY_ID[id], 'you', i); });
    var foeSlots = foeIds.map(function (id, i) { return slot(TT.CARD_BY_ID[id], 'foe', i); });

    M = {
      opponent: opponent,
      rules: rules,
      els: rules.ELEMENTAL ? randomElements() : null,
      board: new Array(9).fill(null),
      you: youSlots,
      foe: foeSlots,
      all: youSlots.concat(foeSlots),
      // weighted coin flip, except in the tutorial where the coach walks the
      // player through their own first move
      turn: opts.tutorial ? 'you' : coinFlip(),
      phase: 'deal',
      t: performance.now(),
      selected: 0,
      steps: [], stepIdx: 0, stepT: 0,
      banner: null,
      round: 1,
      outcome: null,
      overT: 0,
      invalidAt: 0,
      invalidPos: -1,
      score: { you: 5, foe: 5 },
      handIds: handIds.slice(),
      tutorial: !!opts.tutorial,
      coach: null,
      coachStep: -1,
      firstCaptureSeen: false,
      hits: { hud: [], board: [], hand: [], over: [], coach: [] },
      drag: null,
      // which hand slot is currently sliding out (and which is sliding back)
      slideFx: { you: { idx: -1, prev: -1, t0: 0 }, foe: { idx: -1, prev: -1, t0: 0 } },
      foePick: null,                 // the rival's chosen move, decided as they "think"
      activeCard: null               // the card being played right now, for the HUD
    };
    if (M.tutorial) coachTo(0);
    TT.sfx('start');
    return M;
  };

  TT.endMatch = function () { M = null; };

  /* ---------------------------------------------------------------- tutorial
   * A five-beat coach. 'info' beats freeze the game behind a card with a Next
   * button; 'act' beats just show a hint line and wait for the player to do
   * the thing.
   */
  var COACH = [
    { kind: 'info', title: 'Welcome to Triple Triad!',
      body: 'Selphie will teach you. You each have five cards and take turns filling the 3x3 board.' },
    { kind: 'info', title: 'Read the numbers',
      body: 'Every card has four numbers, one per edge. A is 10 — the best. Those edges are what fight.' },
    { kind: 'act', title: 'Pick a card',
      body: 'Tap one of your cards along the bottom. You can also drag it straight onto the board.' },
    { kind: 'act', title: 'Place it',
      body: 'Now tap an empty square on the board to play that card.' },
    { kind: 'info', title: 'Flipping cards',
      body: 'When your card touches one of Selphie\'s, compare the two facing numbers. Bigger wins, and her card turns blue.' },
    { kind: 'info', title: 'Winning',
      body: 'Fill all nine squares. Whoever owns more cards — on the board plus the one left in hand — wins. Go get her!' }
  ];
  function coachTo(i) {
    if (!M || !M.tutorial) return;
    if (i >= COACH.length) { M.coach = null; M.coachStep = COACH.length; return; }
    M.coachStep = i;
    M.coach = COACH[i];
  }
  function coachEvent(ev) {
    if (!M || !M.tutorial || !M.coach) return;
    if (M.coach.kind !== 'act') return;
    if (ev === 'select' && M.coachStep === 2) coachTo(3);
    else if (ev === 'place' && M.coachStep === 3) coachTo(4);
  }
  function coachFrozen() { return !!(M && M.coach && M.coach.kind === 'info'); }

  /* ------------------------------------------------------------------ layout
   * The match is landscape-only (game.js shows a rotate prompt otherwise), so
   * there is exactly one layout: the rival's hand in a column on the left, the
   * board in the middle, your hand in a column on the right.
   *
   * Hand cards are exactly board-card sized (`Ch === C`) so a card never
   * changes size between hand, drag and board.  Five board-sized cards cannot
   * stand end to end in a three-row height, so each overlaps its neighbour by
   * half a card; every rank number lives in the card's top-left corner, so all
   * twenty stay readable.
   */
  function layout(W, H) {
    /* The HUD is one centred status row.  It is 44px tall (minimum touch
     * target) because the help/quit buttons live in it. */
    var rowH = 44;
    var pillH = H < 470 ? 40 : 46;
    var pillY = 8;
    var hudH = pillY + pillH + 6 + rowH + 6;
    /* A slim band under the HUD is reserved for the turn arrow, which hovers over
     * whichever hand is to move.  It is taken out of the height BEFORE the card
     * size is worked out, so the arrow can never sit on top of a card. */
    var arrowH = Math.max(18, Math.min(28, Math.round(H * 0.055)));
    var avail = H - hudH - arrowH - 10;
    var L = { hudH: hudH, pillH: pillH, pillY: pillY, rowH: rowH, arrowH: arrowH };

    /* Across: half-a-card gap, hand column, board, hand column, half-a-card gap
     * — six card widths in all.  Down: three rows, and the hand columns span
     * exactly that same height (see the spacing below). */
    var C = Math.max(44, Math.min(avail / 3, (W - 24) / 6, 190));
    var bw = C * 3;
    L.C = C; L.Ch = C; L.boardW = bw;
    var groupW = bw + 3 * C;                   // board + 1.5 cards either side
    L.boardX = Math.max(C * 1.5 + 6, (W - groupW) / 2 + C * 1.5);
    L.boardY = hudH + arrowH + Math.max(0, (avail - bw) / 2);
    L.arrowCY = L.boardY - arrowH * 0.55;      // arrow hovers in the reserved band

    /* Each hand is a vertical column resting HALF A CARD clear of the grid's
     * side — the rival's on the left, yours on the right — and the five cards
     * are spread so the first card's top edge is level with the top of the grid
     * and the fifth card's bottom edge is level with the bottom of it.  Five
     * board-sized cards over a three-row height means they overlap by half a
     * card each, which is intended: every rank glyph lives in the top-left
     * corner and stays uncovered. */
    L.foeX = L.boardX - C * 1.5;
    L.youX = L.boardX + bw + C * 0.5;
    L.fanY = L.boardY;
    L.spacing = (bw - C) / 4;                  // === C/2
    /* A selected card slides toward the board by MOST of that resting gap — not
     * all of it — so there is always a visible strip of daylight between the
     * card and the board's edge instead of the two touching. */
    L.slide = C * SELECT_SLIDE;
    L.slideGap = C * 0.5 - L.slide;            // daylight left beside the grid
    return L;
  }
  function handSlotXY(L, which, i) {
    return { x: which === 'you' ? L.youX : L.foeX, y: L.fanY + i * L.spacing };
  }
  function cellXY(L, pos) {
    return { x: L.boardX + (pos % 3) * L.C, y: L.boardY + Math.floor(pos / 3) * L.C };
  }

  /* -------------------------------------------------------------- game logic */
  function recount() {
    var y = 0;
    for (var i = 0; i < M.all.length; i++) if (M.all[i].owner === 'you') y++;
    M.score.you = y;
    M.score.foe = M.all.length - y;
  }
  function hand(which) { return which === 'you' ? M.you : M.foe; }
  function isOver() { return M.you.length < 1 || M.foe.length < 1; }

  /* Selection-slide state, one per hand.  `idx` is the slot sliding out, `prev`
   * the one sliding back, and `t0` when that swap started. */
  function slideFx(which) {
    if (!M.slideFx) M.slideFx = { you: { idx: -1, prev: -1, t0: 0 }, foe: { idx: -1, prev: -1, t0: 0 } };
    return M.slideFx[which];
  }
  function resetSlide() {
    M.slideFx = { you: { idx: -1, prev: -1, t0: 0 }, foe: { idx: -1, prev: -1, t0: 0 } };
  }

  function playCard(which, index, pos, fromXY) {
    if (M.board[pos]) return false;
    var h = hand(which);
    var s = h[index];
    if (!s) return false;
    h.splice(index, 1);
    s.pos = pos;
    s.placedAt = performance.now();
    s.fromX = fromXY ? fromXY.x : null;
    s.fromY = fromXY ? fromXY.y : null;
    M.board[pos] = s;
    M.selected = 0;
    M.foePick = null;
    M.activeCard = s.card;           // the HUD names it while it lands and resolves
    M.activeOwner = which;
    resetSlide();                    // the hand it left keeps no half-finished slide
    TT.sfx('card');

    var res = TT.resolveMove(s.card, which, pos, M.board, M.els, M.rules);
    M.steps = [];
    var first = [];
    var special = res.same ? 'SAME' : (res.plus ? 'PLUS' : null);
    if (res.same) first = first.concat(res.same);
    if (res.plus) first = first.concat(res.plus);
    if (res.captured) first = first.concat(res.captured);
    if (first.length) {
      M.steps.push({ flip: first, banner: special, owner: which,
                     dur: special ? BANNER_MS : FLIP_MS });
    }
    res.combos.forEach(function (wave, i) {
      M.steps.push({ flip: wave, banner: i === 0 ? 'COMBO' : null, owner: which,
                     dur: i === 0 ? BANNER_MS : FLIP_MS });
    });
    M.stepIdx = 0;
    M.phase = 'placing';
    M.t = performance.now();
    coachEvent('place');
    return true;
  }

  function applyStep(step, now) {
    var flipped = 0;
    step.flip.forEach(function (p) {
      var s = M.board[p];
      if (!s || s.owner === step.owner) return;
      s.flipFrom = s.owner;
      s.owner = step.owner;
      s.flipAt = now;
      flipped++;
    });
    if (step.banner) { M.banner = { text: step.banner, t0: now }; TT.sfx('special'); }
    if (flipped) {
      TT.sfx('turn');
      if (step.owner === 'you' && !M.firstCaptureSeen) {
        M.firstCaptureSeen = true;
        if (M.tutorial && M.coachStep === 4) { /* the coach already explains it */ }
      }
    }
    recount();
  }

  function beginOver(now) {
    recount();
    M.outcome = M.score.you > M.score.foe ? 'win' : (M.score.you < M.score.foe ? 'lose' : 'draw');
    M.phase = 'over';
    M.overT = now;
    if (M.outcome === 'draw' && M.rules.SUDDEN_DEATH && M.round < TT.MAX_SUDDEN_DEATH) {
      M.suddenPending = true;
    } else {
      M.suddenPending = false;
      if (TT.onMatchOver) TT.onMatchOver(M.outcome, M);
    }
  }

  /* Sudden Death: replay with the cards each side finished holding (ported from
   * the original restart(false)). Ownership carries over, so the new hands are
   * exactly the five cards each player owned. */
  function suddenDeath(now) {
    M.round++;
    M.you = []; M.foe = [];
    M.all.forEach(function (s) {
      s.origin = s.owner;
      s.pos = -1; s.placedAt = 0; s.flipAt = 0; s.flipFrom = null;
      var into = s.owner === 'you' ? M.you : M.foe;
      s.handIdx = into.length;                 // fresh 0..4 slots for the new hands
      into.push(s);
    });
    M.board = new Array(9).fill(null);
    M.els = M.rules.ELEMENTAL ? randomElements() : null;
    M.steps = []; M.stepIdx = 0;
    M.banner = null;
    M.outcome = null;
    M.suddenPending = false;
    M.selected = 0;
    M.foePick = null;
    M.activeCard = null;
    resetSlide();
    M.turn = coinFlip();
    M.phase = 'deal';
    M.t = now;
    recount();
    TT.sfx('start');
  }

  /* The help overlay freezes the match: every timestamp is shifted forward by
   * the paused duration so nothing snaps when play resumes. */
  TT.matchPause = function (now) { if (M && !M.pausedAt) M.pausedAt = now; };
  TT.matchResume = function (now) {
    if (!M || !M.pausedAt) return;
    var d = now - M.pausedAt;
    M.pausedAt = 0;
    M.t += d; M.stepT += d; M.overT += d; M.invalidAt += d;
    if (M.banner) M.banner.t0 += d;
    M.all.forEach(function (s) {
      if (s.placedAt) s.placedAt += d;
      if (s.flipAt) s.flipAt += d;
    });
    if (M.slideFx) { M.slideFx.you.t0 += d; M.slideFx.foe.t0 += d; }
  };

  TT.matchUpdate = function (now) {
    if (!M || M.pausedAt) return;
    switch (M.phase) {
      case 'deal':
        if (now - M.t >= DEAL_MS) { M.phase = 'turn'; M.t = now; }
        break;
      case 'turn':
        if (coachFrozen()) break;
        if (M.turn === 'foe') {
          /* Decide the move as soon as the rival starts thinking (the board cannot
           * change in between, so the result is identical to deciding at play
           * time) — that lets the HUD name the card they are about to put down. */
          if (!M.foePick) {
            M.foePick = TT.aiMove(M.opponent.ai, M.foe.map(function (s) { return s.card; }),
                                  M.board, M.els, M.rules, 'foe', M.score.foe, M.score.you);
          }
          if (now - M.t >= AI_THINK_MS) {
            var mv = M.foePick;
            var L = TT.lastLayout || layout(innerWidth, innerHeight);
            playCard('foe', mv.index, mv.position, handSlotXY(L, 'foe', M.foe[mv.index].handIdx));
          }
        }
        break;
      case 'placing':
        if (now - M.t >= PLACE_MS) {
          if (M.steps.length) { M.phase = 'resolving'; M.stepIdx = 0; M.stepT = 0; }
          else finishTurn(now);
        }
        break;
      case 'resolving':
        var step = M.steps[M.stepIdx];
        if (!step) { finishTurn(now); break; }
        if (!step.applied) { step.applied = true; M.stepT = now; applyStep(step, now); }
        if (now - M.stepT >= step.dur) {
          M.stepIdx++;
          if (M.stepIdx >= M.steps.length) finishTurn(now);
        }
        break;
      case 'over':
        if (M.suddenPending && now - M.overT >= 1600) suddenDeath(now);
        break;
    }
    if (M.banner && now - M.banner.t0 > BANNER_MS + 260) M.banner = null;
  };

  function finishTurn(now) {
    M.steps = [];
    recount();
    M.activeCard = null;
    if (isOver()) { beginOver(now); return; }
    M.turn = M.turn === 'you' ? 'foe' : 'you';
    M.selected = 0;
    M.foePick = null;
    M.phase = 'turn';
    M.t = now;
    if (M.tutorial && M.coachStep === 4 && M.turn === 'you') coachTo(5);
  }

  TT.matchNeedsFrame = function () {
    if (!M) return false;
    return true;                     // element tiles animate and the turn pulses
  };

  /* ==================================================================== draw */
  TT.matchDraw = function (ctx, W, H, now) {
    if (!M) return;
    var L = layout(W, H);
    TT.lastLayout = L;
    M.hits.hud = []; M.hits.board = []; M.hits.hand = []; M.hits.over = []; M.hits.coach = [];

    drawHud(ctx, W, H, L, now);
    drawBoard(ctx, W, H, L, now);
    drawHand(ctx, W, H, L, now, 'foe');
    drawHand(ctx, W, H, L, now, 'you');
    drawTurnArrow(ctx, L, now);
    if (M.banner) drawBanner(ctx, W, H, now);
    if (M.phase === 'over') drawResult(ctx, W, H, now);
    else if (M.coach) drawCoach(ctx, W, H, L, now);
  };

  function ownerColor(o) { return o === 'you' ? COL.you : COL.foe; }

  /* The status line, as one row across the pill:
   *
   *   [their card]     <Rival> <score> | <phase> | <score> <You>     [your card]
   *
   * Scores, names and phase form ONE cluster centred as a group, so the running
   * score reads right next to whose turn it is.  The rival sits on the LEFT of the
   * cluster because their cards are on the left of the board, the player on the
   * RIGHT for the same reason.  The name of the card each side is playing goes out
   * on that side's flank, centred in the space between the cluster and the pill's
   * edge.  Everything is measured and the font shrinks until it fits, so no two
   * pieces can ever overlap. */
  function hudPhase(now) {
    if (M.phase === 'over') {
      if (M.suddenPending) return { t: 'Sudden Death', c: COL.gold };
      if (M.outcome === 'win') return { t: 'You Win!', c: COL.gold };
      if (M.outcome === 'lose') return { t: 'You Lose', c: COL.danger };
      return { t: 'Draw', c: COL.sub };
    }
    if (M.phase === 'deal') {
      return { t: M.round > 1 ? 'Round ' + M.round : 'Dealing', c: '#fff' };
    }
    if (M.turn === 'you') return { t: 'Your Turn', c: COL.glow };
    /* `wide` is the widest the animated dots ever get: the block is measured at that
     * width so the whole cluster cannot shuffle sideways while the dots cycle. */
    return { t: 'Thinking' + '.'.repeat(1 + (Math.floor(now / 320) % 3)),
             wide: 'Thinking...', c: 'rgba(255,255,255,0.8)' };
  }

  /* The card each side is playing right now, for the HUD's side gaps.  Yours is
   * whatever is selected on your turn; theirs is the card the AI has already
   * picked while it "thinks"; and once a card is in flight it belongs to whoever
   * played it until the flips finish. */
  function activeCardName(which) {
    if (M.phase === 'over' || M.phase === 'deal') return '';
    if (M.phase === 'placing' || M.phase === 'resolving') {
      return (M.activeCard && M.activeOwner === which) ? M.activeCard.name : '';
    }
    if (M.phase !== 'turn' || M.turn !== which || coachFrozen()) return '';
    if (which === 'you') {
      var s = M.you[M.selected];
      return s ? s.card.name : '';
    }
    var f = M.foePick ? M.foe[M.foePick.index] : null;
    return f ? f.card.name : '';
  }

  /* Measure the three blocks of the central cluster — rival score, phase, your
   * score — shrinking the font until the cluster fits the pill with room left on
   * both flanks for the card names. */
  function hudRow(ctx, now, maxW) {
    var phase = hudPhase(now);
    var lead = M.score.you > M.score.foe ? 'you' : (M.score.foe > M.score.you ? 'foe' : null);
    var barC = 'rgba(255,255,255,0.28)';
    var size = 17;
    var MIN_GAP = 14;                      // breathing room either side of the phase
    for (;;) {
      var nameW = Math.max(38, maxW * 0.22);
      ctx.font = TT.font('bold ' + size + 'px');
      var dim = function (side) { return lead && lead !== side ? 'rgba(255,255,255,0.55)' : '#fff'; };
      var left = [
        { t: TT.ellipsize(ctx, M.opponent.name, nameW), c: dim('foe'), s: size, w: 'bold', lead: lead === 'foe', glow: COL.foe },
        { t: ' ' + M.score.foe, c: COL.foe, s: size + 4, w: 'bold', lead: lead === 'foe', glow: COL.foe }
      ];
      var mid = [
        { t: ' |  ', c: barC, s: size, w: '' },
        { t: phase.t, wide: phase.wide, c: phase.c, s: size, w: 'bold' },
        { t: '  | ', c: barC, s: size, w: '' }
      ];
      var right = [
        { t: M.score.you + ' ', c: COL.you, s: size + 4, w: 'bold', lead: lead === 'you', glow: COL.you },
        { t: TT.ellipsize(ctx, TT.playerName(), nameW), c: dim('you'), s: size, w: 'bold', lead: lead === 'you', glow: COL.you }
      ];
      var wide = function (block) {
        var t = 0;
        block.forEach(function (g) {
          ctx.font = TT.font((g.w ? g.w + ' ' : '') + g.s + 'px');
          var own = ctx.measureText(g.t).width;
          g.w2 = g.wide ? ctx.measureText(g.wide).width : own;
          g.off = (g.w2 - own) / 2;          // centre a shrinking string in its slot
          t += g.w2;
        });
        return t;
      };
      var lw = wide(left), mw = wide(mid), rw = wide(right);
      if (lw + mw + rw + MIN_GAP * 2 <= maxW || size <= 10) {
        return { left: left, mid: mid, right: right, lw: lw, mw: mw, rw: rw,
                 size: size, lead: lead, gap: MIN_GAP };
      }
      size -= 1;
    }
  }

  function drawHud(ctx, W, H, L, now) {
    var pillH = L.pillH;
    var px = 126, pw = W - 138, py = L.pillY;
    if (pw < 150) { px = 12; pw = W - 24; }                 // very narrow: drop below the link
    TT.roundRect(ctx, px, py, pw, pillH, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    TT.roundRect(ctx, px, py, pw, pillH, 14); ctx.stroke();

    var cy = py + pillH / 2;
    var inset = 10;
    var row = hudRow(ctx, now, pw - inset * 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // published for the headless harness so the row's geometry is assertable
    M.hud = { pillX: px, pillW: pw, inset: inset, size: row.size, lead: row.lead, segs: [] };

    /* One central cluster — "Zell 5 | Your Turn | 5 Caleb" — centred as a group in
     * the pill, so the scores read next to the phase instead of at the far edges.
     * The leading side is drawn in a glow and underlined; the trailing side's name
     * is dimmed.  On a draw neither is marked. */
    var clusterW = row.lw + row.mw + row.rw;
    var lx = px + (pw - clusterW) / 2;
    var mx = lx + row.lw;
    var rx = mx + row.mw;
    var mark = null;
    var run = function (block, x) {
      block.forEach(function (g) {
        ctx.font = TT.font((g.w ? g.w + ' ' : '') + g.s + 'px');
        ctx.fillStyle = g.c;
        if (g.lead) {
          ctx.save();
          ctx.shadowColor = g.glow; ctx.shadowBlur = 12;
          ctx.fillText(g.t, x + (g.off || 0), cy + 1);
          ctx.restore();
          mark = mark || { x0: x, x1: x, c: g.glow };
          mark.x0 = Math.min(mark.x0, x); mark.x1 = Math.max(mark.x1, x + g.w2);
        } else {
          ctx.fillText(g.t, x + (g.off || 0), cy + 1);
        }
        M.hud.segs.push({ t: g.t, x: x, w: g.w2 });
        x += g.w2;
      });
    };
    run(row.left, lx);
    run(row.mid, mx);
    run(row.right, rx);
    if (mark) {
      ctx.fillStyle = mark.c;
      TT.roundRect(ctx, mark.x0, py + pillH - 8, Math.max(8, mark.x1 - mark.x0), 3, 2);
      ctx.fill();
    }

    /* ...and the card names out on the flanks, each centred in the outer area its
     * own side owns: the rival's to the left of the cluster, yours to the right. */
    var gaps = {
      foe: { x0: px + inset, x1: lx },
      you: { x0: rx + row.rw, x1: px + pw - inset }
    };
    M.hud.cards = {};
    ['foe', 'you'].forEach(function (which) {
      var g = gaps[which];
      var room = g.x1 - g.x0 - 12;
      var name = activeCardName(which);
      M.hud.cards[which] = { text: '', x: g.x0, w: 0, room: room };
      if (!name || room < 26) return;
      var cs = Math.max(11, row.size - 3);
      ctx.font = TT.font('bold ' + cs + 'px');
      var shown = TT.ellipsize(ctx, name, room);
      var tw = ctx.measureText(shown).width;
      var tx = g.x0 + (g.x1 - g.x0 - tw) / 2;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = which === 'you' ? COL.glow : 'rgba(255,255,255,0.82)';
      ctx.fillText(shown, tx, cy + 1);
      ctx.restore();
      M.hud.cards[which] = { text: shown, x: tx, w: tw, room: room };
    });

    // second row: active rules + quit / help (44px tap targets; sound is always on)
    var rowY = py + pillH + 6;
    var btnH = L.rowH, btnW = 48;
    var bx = W - 12 - btnW;
    var help = { x: bx, y: rowY, w: btnW, h: btnH, action: 'help' };
    TT.button(ctx, help, '?', { style: 'ghost', size: 18, radius: 13 });
    M.hits.hud.push(help);
    bx -= btnW + 8;
    var quit = { x: bx, y: rowY, w: btnW, h: btnH, action: 'quit' };
    TT.button(ctx, quit, '✕', { style: 'ghost', size: 16, radius: 13 });
    M.hits.hud.push(quit);

    var on = TT.RULE_KEYS.filter(function (k) { return M.rules[k]; }).map(function (k) { return TT.RULE_LABEL[k]; });
    var txt = on.length ? on.join(' · ') : 'No special rules';
    if (M.round > 1) txt = 'Sudden Death round ' + M.round + ' · ' + txt;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(162,155,254,0.85)';
    var maxW = bx - 22;
    var ts = TT.fitText(ctx, txt, maxW, 12, '');
    ctx.font = TT.font(ts + 'px');
    ctx.fillText(TT.ellipsize(ctx, txt, maxW), 14, rowY + btnH / 2);
  }

  function drawBoard(ctx, W, H, L, now) {
    var C = L.C;
    var animFrame = Math.floor(now / 110) % 4;

    /* The play area IS the mat art, at full strength — no dark wash over it.
     * TT.MAT_BOARD is the 3x3 frame inside the jpg, so scaling that rect onto
     * the placement grid puts the image's own board exactly under the nine
     * cells, and the surrounding paper bleeds out a little past the edge. */
    var pad = Math.max(5, C * 0.06);
    var mat = TT.img.board;
    var bleed = C * 0.2;
    if (mat && mat._ok) {
      var MB = TT.MAT_BOARD;
      var kx = L.boardW / MB.w, ky = L.boardW / MB.h;
      ctx.save();
      TT.roundRect(ctx, L.boardX - bleed, L.boardY - bleed,
                   L.boardW + bleed * 2, L.boardW + bleed * 2, 16);
      ctx.clip();
      ctx.drawImage(mat, L.boardX - MB.x * kx, L.boardY - MB.y * ky,
                    mat.width * kx, mat.height * ky);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,211,42,0.35)'; ctx.lineWidth = 2;
      TT.roundRect(ctx, L.boardX - bleed, L.boardY - bleed,
                   L.boardW + bleed * 2, L.boardW + bleed * 2, 16);
      ctx.stroke();
    } else {
      // the art failed to load: fall back to a panel the grid can read against
      ctx.fillStyle = 'rgba(6,6,26,0.55)';
      TT.roundRect(ctx, L.boardX - pad, L.boardY - pad, L.boardW + pad * 2, L.boardW + pad * 2, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(162,155,254,0.3)'; ctx.lineWidth = 1.5;
      TT.roundRect(ctx, L.boardX - pad, L.boardY - pad, L.boardW + pad * 2, L.boardW + pad * 2, 16);
      ctx.stroke();
    }

    for (var pos = 0; pos < 9; pos++) {
      var p = cellXY(L, pos);
      var s = M.board[pos];
      /* Cell guides only — the art has no interior lines, and a fill here would
       * be the very wash item 17 removed.  A light hairline keeps the nine
       * squares obvious without tinting the board. */
      ctx.strokeStyle = 'rgba(60,30,10,0.35)'; ctx.lineWidth = 1;
      TT.roundRect(ctx, p.x + 2, p.y + 2, C - 4, C - 4, C * 0.07); ctx.stroke();

      // element tile on an empty square
      if (M.els && M.els[pos] && !s) {
        var f = TT.frameElement(M.els[pos], animFrame);
        var es = C * 0.42;
        if (!TT.drawFrame(ctx, TT.img.element, f, p.x + (C - es) / 2, p.y + (C - es) / 2, es, es)) {
          ctx.fillStyle = TT.ELEMENT_COLOR[M.els[pos]];
          ctx.globalAlpha = 0.75;
          ctx.beginPath(); ctx.arc(p.x + C / 2, p.y + C / 2, es * 0.32, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // legal-move highlight while the player holds a card
      if (!s && M.phase === 'turn' && M.turn === 'you' && !coachFrozen()) {
        // gold, because a purple hairline vanishes against the tan mat
        var pulse = 0.4 + 0.25 * Math.sin(now / 380 + pos);
        ctx.strokeStyle = 'rgba(255,211,42,' + pulse.toFixed(3) + ')';
        ctx.lineWidth = 2;
        TT.roundRect(ctx, p.x + 4, p.y + 4, C - 8, C - 8, C * 0.06); ctx.stroke();
      }
      if (pos === M.invalidPos && now - M.invalidAt < 420) {
        ctx.strokeStyle = COL.danger;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1 - (now - M.invalidAt) / 420;
        TT.roundRect(ctx, p.x + 3, p.y + 3, C - 6, C - 6, C * 0.07); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      M.hits.board.push({ x: p.x, y: p.y, w: C, h: C, action: 'cell', pos: pos });
    }

    // cards on top, so a placement animation can fly over its neighbours
    for (var i = 0; i < 9; i++) {
      var sl = M.board[i];
      if (!sl) continue;
      var q = cellXY(L, i);
      var x = q.x, y = q.y, pop = 0, size = C;
      var placing = now - sl.placedAt;
      if (placing < PLACE_MS && sl.fromX !== null && sl.fromX !== undefined) {
        var t = TT.easeOut(placing / PLACE_MS);
        // fly from the hand slot, growing from hand size to board size
        size = L.Ch + (C - L.Ch) * t;
        x = (sl.fromX + (q.x - sl.fromX) * t) + (C - size) / 2 * t;
        y = (sl.fromY + (q.y - sl.fromY) * t) + (C - size) / 2 * t;
        pop = Math.sin(t * Math.PI) * 0.5;
      } else if (placing < PLACE_MS) {
        pop = Math.sin(TT.easeOut(placing / PLACE_MS) * Math.PI) * 0.8;
      }
      var opts = { pop: pop };
      var fa = now - sl.flipAt;
      if (sl.flipAt && fa < FLIP_MS) { opts.flip = fa / FLIP_MS; opts.fromOwner = sl.flipFrom; }
      if (M.els) {
        var b = TT.elementBonus(sl.card, i, M.rules.ELEMENTAL ? M.els : null);
        if (b) opts.bonus = b;
      }
      TT.drawCard(ctx, sl.card, sl.owner, x, y, size, opts);
    }
  }

  function drawHand(ctx, W, H, L, now, which) {
    var h = hand(which);
    var Ch = L.Ch;                         // === L.C: hand cards are board sized
    var faceDown = which === 'foe' && !M.rules.OPEN;
    var dealing = M.phase === 'deal';
    var dealT = dealing ? Math.min(1, (now - M.t) / DEAL_MS) : 1;
    /* Selecting a card slides it SIDEWAYS, TOWARD the grid: yours moves left
     * (the board is on its left), the rival's moves right.  It travels most of
     * the resting gap and stops short of the board, so the card is clear of the
     * neighbour covering it and still has daylight beside the grid.  Nothing
     * else changes — same vertical position, same size, same paint order — so
     * it is never lifted above or in front of a neighbour.
     *
     * The move is tweened both ways: `fx.idx` slides out, `fx.prev` slides back,
     * which also covers moving the selection straight from one card to another. */
    var slide = L.slide === undefined ? Ch * SELECT_SLIDE : L.slide;
    var dir = which === 'you' ? -1 : 1;
    var selIdx = -1;
    for (var i = 0; i < h.length; i++) {
      if (which === 'you' && i === M.selected && M.turn === 'you' &&
          M.phase === 'turn' && !coachFrozen()) selIdx = i;
    }
    var fx = slideFx(which);
    if (fx.idx !== selIdx) { fx.prev = fx.idx; fx.idx = selIdx; fx.t0 = now; }
    var pr = TT.easeOut(Math.min(1, Math.max(0, (now - fx.t0) / SLIDE_MS)));
    var slideOf = function (i) {
      if (i < 0) return 0;
      if (i === fx.idx) return dir * slide * pr;
      if (i === fx.prev) return dir * slide * (1 - pr);
      return 0;
    };

    // 1. resting positions, in fan order (handIdx ascending), plus the slide
    var place = h.map(function (s, i) {
      var p = handSlotXY(L, which, s.handIdx);
      return { x: p.x + slideOf(i), y: p.y };
    });

    /* 2. hit boxes: the whole card, pushed in paint order.  TT.hit() scans the
     *    list backwards, so wherever two cards overlap the tap goes to the one
     *    drawn on top — exactly what the player sees. */
    if (which === 'you') {
      h.forEach(function (s, i) {
        M.hits.hand.push({ x: place[i].x, y: place[i].y, w: Ch, h: Ch, action: 'hand', index: i });
      });
    }

    // 3. paint low slot first so each card overlaps the one before it
    h.forEach(function (s, i) {
      var x = place[i].x, y = place[i].y;
      if (dealing) {
        var d = TT.easeOut(Math.max(0, Math.min(1, (dealT - i * 0.07) / 0.7)));
        // deal in from off-screen, each hand from its own side
        x += (which === 'foe' ? -1 : 1) * (1 - d) * W * 0.6;
      }
      var opts = { faceDown: faceDown, selected: i === selIdx };
      var size = Ch;
      if (M.drag && M.drag.index === i && which === 'you' && M.drag.active) {
        // a dragged card is already the size it will be once placed
        x = M.drag.x - size / 2; y = M.drag.y - size * 0.62;
        opts.selected = true;
      }
      TT.drawCard(ctx, s.card, s.owner, x, y, size, opts);
    });
    // name of the highlighted card, tucked under the board
    if (which === 'you' && h.length && M.selected < h.length && !dealing) {
      var card = h[M.selected].card;
      var eid = TT.ELEMENT_ID[card.element];
      var label = card.name + '  ·  L' + card.level + (eid ? '  ·  ' + TT.ELEMENT_LABEL[eid] : '');
      var ly = L.boardY + L.boardW + 8;
      if (ly <= H - 15) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var ls = TT.fitText(ctx, label, W - 28, 13, 'bold');
        ctx.font = TT.font('bold ' + ls + 'px');
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillText(label, W / 2, ly);
      }
    }
  }

  /* Whose turn is it?  A fat arrow hovers over the active hand — bobbing,
   * pulsing and pointing down at the column it belongs to — and jumps to the
   * other side the moment the turn changes.  It lives in the band the layout
   * reserved above the board, so it never covers a card.  Colour follows the
   * side that owns the turn: blue for you, red for the rival. */
  function drawTurnArrow(ctx, L, now) {
    M.turnArrow = null;
    if (M.phase === 'over' || M.phase === 'deal' || coachFrozen()) return;
    var which = M.turn;
    var cx = (which === 'you' ? L.youX : L.foeX) + L.C / 2;
    var bob = Math.sin(now / 240) * (L.arrowH * 0.14);
    var cy = L.arrowCY + bob;
    var w = Math.max(15, Math.min(34, L.C * 0.28));
    var hh = Math.max(10, L.arrowH * 0.6);
    var col = ownerColor(which);
    var pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now / 240));

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - hh / 2);
    ctx.lineTo(cx + w / 2, cy - hh / 2);
    ctx.lineTo(cx, cy + hh / 2);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // published so the harness can assert which side the arrow sits over
    M.turnArrow = { which: which, x: cx, y: cy, w: w, h: hh };
  }

  function drawBanner(ctx, W, H, now) {
    var age = now - M.banner.t0;
    var a = age < 200 ? age / 200 : (age > BANNER_MS ? Math.max(0, 1 - (age - BANNER_MS) / 260) : 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    var size = Math.min(84, W * 0.19);
    ctx.font = TT.font('900 ' + size + 'px');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = H / 2;
    ctx.shadowColor = COL.gold; ctx.shadowBlur = 34;
    ctx.fillStyle = '#fff';
    ctx.fillText(M.banner.text, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.strokeText(M.banner.text, W / 2, y);
    ctx.restore();
  }

  function drawResult(ctx, W, H, now) {
    var age = now - M.overT;
    var a = Math.min(0.78, (age / OVER_FADE_MS) * 0.78);
    ctx.fillStyle = 'rgba(4,4,20,' + a.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    if (age < OVER_FADE_MS * 0.5) return;

    var title = M.outcome === 'win' ? 'YOU WIN!' : M.outcome === 'lose' ? 'YOU LOSE' : 'DRAW';
    var col = M.outcome === 'win' ? COL.gold : M.outcome === 'lose' ? COL.danger : COL.sub;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var ts = Math.min(58, W * 0.13);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 30;
    ctx.fillStyle = '#fff';
    ctx.font = TT.font('900 ' + ts + 'px');
    var titleY = H / 2 - (M.suddenPending ? 30 : 90);
    ctx.fillText(title, W / 2, titleY);
    ctx.restore();
    ctx.fillStyle = col;
    ctx.font = TT.font('bold 20px');
    ctx.fillText(M.score.you + ' — ' + M.score.foe, W / 2, titleY + ts * 0.72);

    if (M.suddenPending) {
      ctx.fillStyle = '#fff';
      ctx.font = TT.font('bold 17px');
      ctx.fillText('Sudden Death! Replaying with the cards you hold…', W / 2, titleY + ts * 0.72 + 40);
      return;
    }

    var offer = M.outcome !== 'win' || !TT.hasRewardOffer || TT.hasRewardOffer();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = TT.font('14px');
    var note = M.outcome === 'win'
      ? (offer ? 'Beat ' + M.opponent.name + ' — pick a new card!'
               : 'Beat ' + M.opponent.name + ' — but they have no new cards left')
      : (M.outcome === 'lose' ? 'No cards lost. Try again!' : 'Nobody loses a card.');
    ctx.fillText(TT.ellipsize(ctx, note, W - 32), W / 2, titleY + ts * 0.72 + 34);

    var bw = Math.min(268, W - 56), bh = 54, gap = 12;
    var by = titleY + ts * 0.72 + 62;
    var primary = M.outcome === 'win'
      ? { label: offer ? 'Claim a card' : 'Continue', action: 'reward' }
      : { label: 'Play again', action: 'rematch' };
    var b1 = { x: (W - bw) / 2, y: by, w: bw, h: bh, action: primary.action };
    TT.button(ctx, b1, primary.label, { style: M.outcome === 'win' ? 'gold' : 'primary', size: 19 });
    M.hits.over.push(b1);
    var b2 = { x: (W - bw) / 2, y: by + bh + gap, w: bw, h: 46,
               action: M.outcome === 'win' ? 'rematch' : 'rivals' };
    TT.button(ctx, b2, M.outcome === 'win' ? 'Rematch' : 'Choose a rival', { style: 'ghost', size: 16 });
    M.hits.over.push(b2);
    var b3 = { x: (W - bw) / 2, y: by + bh + gap + 46 + 10, w: bw, h: 44, action: 'rivals' };
    if (M.outcome === 'win') { TT.button(ctx, b3, 'Choose a rival', { style: 'ghost', size: 15 }); M.hits.over.push(b3); }
  }

  function drawCoach(ctx, W, H, L, now) {
    var c = M.coach;
    var info = c.kind === 'info';
    if (info) { ctx.fillStyle = 'rgba(4,4,20,0.62)'; ctx.fillRect(0, 0, W, H); }
    var bw = Math.min(430, W - 28);
    var pad = 18;
    ctx.font = TT.font('15px');
    var lines = wrap(ctx, c.body, bw - pad * 2);
    var bh = pad * 2 + 26 + lines.length * 21 + (info ? 56 : 0);
    var bx = (W - bw) / 2;
    var by = info ? (H - bh) / 2 : Math.max(L.hudH + 4, L.boardY - bh - 8);
    if (!info && by + bh > L.boardY) by = Math.max(4, L.boardY - bh - 4);

    ctx.fillStyle = 'rgba(16,14,54,0.95)';
    TT.roundRect(ctx, bx, by, bw, bh, 16); ctx.fill();
    ctx.strokeStyle = COL.glow; ctx.lineWidth = 2;
    TT.roundRect(ctx, bx, by, bw, bh, 16); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = COL.gold;
    ctx.font = TT.font('bold 17px');
    ctx.fillText(TT.ellipsize(ctx, c.title, bw - pad * 2), bx + pad, by + pad);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = TT.font('15px');
    lines.forEach(function (ln, i) { ctx.fillText(ln, bx + pad, by + pad + 26 + i * 21); });

    if (info) {
      var b = { x: bx + bw - pad - 132, y: by + bh - pad - 44, w: 132, h: 44, action: 'coachNext' };
      TT.button(ctx, b, M.coachStep >= COACH.length - 1 ? 'Let’s play!' : 'Next', { size: 16 });
      M.hits.coach.push(b);
      var skip = { x: bx + pad, y: by + bh - pad - 44, w: 108, h: 44, action: 'coachSkip' };
      TT.button(ctx, skip, 'Skip', { style: 'ghost', size: 15 });
      M.hits.coach.push(skip);
    }
  }
  function wrap(ctx, text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  TT.wrapText = wrap;

  /* =================================================================== input */
  function canAct() {
    return M && M.phase === 'turn' && M.turn === 'you' && !coachFrozen();
  }

  TT.matchDown = function (x, y) {
    if (!M) return;
    if (M.phase === 'over') {
      if (M.suddenPending) return;
      var b = TT.hit(M.hits.over, x, y);
      if (b) { TT.sfx('select'); TT.matchAction(b.action); }
      return;
    }
    if (M.coach && M.coach.kind === 'info') {
      var cb = TT.hit(M.hits.coach, x, y);
      if (cb) {
        TT.sfx('select');
        if (cb.action === 'coachSkip') coachTo(COACH.length);
        else coachTo(M.coachStep + 1);
      }
      return;
    }
    var hb = TT.hit(M.hits.hud, x, y);
    if (hb) { TT.sfx('select'); TT.matchAction(hb.action); return; }
    if (!canAct()) return;

    var card = TT.hit(M.hits.hand, x, y);
    if (card) {
      if (M.selected !== card.index) { M.selected = card.index; TT.sfx('select'); }
      coachEvent('select');    // any card tap satisfies the coach, even card 0
      M.drag = { index: card.index, x: x, y: y, x0: x, y0: y, active: false };
      return;
    }
    var cell = TT.hit(M.hits.board, x, y);
    if (cell) tryPlace(cell.pos);
  };

  TT.matchMove = function (x, y) {
    if (!M || !M.drag) return;
    M.drag.x = x; M.drag.y = y;
    if (!M.drag.active && Math.hypot(x - M.drag.x0, y - M.drag.y0) > 10) M.drag.active = true;
  };

  TT.matchUp = function (x, y) {
    if (!M || !M.drag) return;
    var d = M.drag;
    M.drag = null;
    if (!d.active) return;                  // a plain tap already selected it
    if (!canAct()) return;
    var cell = TT.hit(M.hits.board, x, y);
    if (cell) { M.selected = d.index; tryPlace(cell.pos); }
  };

  TT.matchCancel = function () { if (M) M.drag = null; };

  function tryPlace(pos) {
    if (!canAct()) return;
    if (M.board[pos]) {
      M.invalidPos = pos; M.invalidAt = performance.now();
      TT.sfx('invalid');
      TT.toast('That square is taken');
      return;
    }
    if (M.tutorial && M.coach && M.coach.kind === 'act' && M.coachStep === 2) coachTo(3);
    var L = TT.lastLayout || layout(innerWidth, innerHeight);
    var from = handSlotXY(L, 'you', M.you[M.selected].handIdx);
    playCard('you', M.selected, pos, from);
  }

  /* Actions the HUD and result screen raise; game.js supplies the router. */
  TT.matchAction = function (action) {
    if (TT.onMatchAction) TT.onMatchAction(action);
  };

  TT.matchOutcome = function () { return M ? M.outcome : null; };
  TT.matchHandIds = function () { return M ? M.handIds.slice() : []; };
  TT.matchRestartTutorialCoach = function () { if (M && M.tutorial) coachTo(0); };

})(window.TT || (window.TT = {}));
