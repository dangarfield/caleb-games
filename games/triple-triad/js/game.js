/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * js/game.js — boot, global state, per-player saves, view routing, the input
 * dispatcher and the render loop.
 */
'use strict';

(function (TT) {

  var COL = TT.COL;
  var SAVE_KEY = 'calebArcadeData';
  var GAME_KEY = 'tripleTriad';

  var canvas, ctx, W = 0, H = 0, dpr = 1;
  var dirty = true;
  var helpOpen = false;
  var helpHits = [];
  var portrait = false;          // stage is too tall for the landscape-only match
  var rotateHits = [];           // the rotate prompt's own buttons

  TT.G = {
    view: 'player',
    player: null,
    save: null,
    opponent: null,
    deck: [],
    rewardIds: [],
    rewardPick: null,
    rewardName: '',
    unlockedName: '',
    unlockNote: ''
  };
  var G = TT.G;

  TT.invalidate = function () { dirty = true; };

  /* ------------------------------------------------------------------ saves */
  function readAll() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function writeAll(all) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(all)); } catch (e) { /* full or blocked */ }
  }
  function blankSave() {
    var owned = {};
    TT.STARTER_CARDS.forEach(function (id) { owned[id] = true; });
    return {
      owned: owned,
      beaten: {},
      winsBy: {},                 // tier -> wins against that rival (gates unlocks)
      wins: 0, losses: 0, draws: 0,
      lastHands: {},              // tier -> the five card ids last fought with
      tutorialDone: false
    };
  }
  function normalise(s) {
    if (!s || typeof s !== 'object') return blankSave();
    var b = blankSave();
    if (!s.owned || typeof s.owned !== 'object') s.owned = b.owned;
    // a save from an older build might be missing the starter cards
    TT.STARTER_CARDS.forEach(function (id) { if (s.owned[id] === undefined) s.owned[id] = true; });
    if (!s.beaten || typeof s.beaten !== 'object') s.beaten = {};
    /* Saves written before per-rival win counts existed only know "beaten", so
     * credit those a full unlock rather than re-locking a kid's progress. */
    if (!s.winsBy || typeof s.winsBy !== 'object') {
      s.winsBy = {};
      for (var t = 0; t <= TT.MAX_LEVEL; t++) if (s.beaten[t]) s.winsBy[t] = TT.WINS_TO_UNLOCK;
    }
    ['wins', 'losses', 'draws'].forEach(function (k) {
      if (typeof s[k] !== 'number' || !isFinite(s[k])) s[k] = 0;
    });
    if (!s.lastHands || typeof s.lastHands !== 'object') s.lastHands = {};
    s.tutorialDone = !!s.tutorialDone;
    return s;
  }
  function loadSaveFor(player) {
    var all = readAll();
    var g = all[GAME_KEY];
    return normalise(g && g[player]);
  }
  TT.save = function () {
    if (!G.player) return;
    var all = readAll();
    if (!all[GAME_KEY] || typeof all[GAME_KEY] !== 'object') all[GAME_KEY] = {};
    all[GAME_KEY][G.player] = G.save;
    writeAll(all);
  };
  TT.selectPlayer = function (player) {
    G.player = player;
    G.save = loadSaveFor(player);
    G.opponent = null;
    G.deck = [];
    TT.scroll.rivals = 0;
    TT.save();
  };
  TT.playerName = function () {
    return G.player === 'ezra' ? 'Ezra' : 'Caleb';
  };
  TT.playerSummary = function (player) {
    var s = loadSaveFor(player);
    var owned = 0;
    for (var k in s.owned) if (s.owned[k]) owned++;
    var beaten = 0;
    for (var t = 1; t <= TT.MAX_LEVEL; t++) if (s.beaten[t]) beaten++;
    return owned + ' cards · ' + beaten + '/10 rivals beaten';
  };
  /* Wins recorded against one rival. */
  TT.winsAgainst = function (tier) {
    var n = G.save && G.save.winsBy ? G.save.winsBy[tier] : 0;
    return typeof n === 'number' && isFinite(n) ? n : 0;
  };
  TT.isUnlocked = function (tier) {
    if (tier <= 1) return true;                    // tutorial + first rival
    return TT.winsAgainst(tier - 1) >= TT.WINS_TO_UNLOCK;
  };
  /* Does the just-beaten rival actually have a card to give? */
  TT.hasRewardOffer = function () { return G.rewardIds.length > 0; };
  TT.grantCard = function (id) {
    G.save.owned[id] = true;
    TT.save();
  };

  /* ----------------------------------------------------------------- routing */
  TT.launchMatch = function (tutorial) {
    G.save.lastHands[G.opponent.tier] = G.deck.slice();
    TT.save();
    G.view = 'match';
    helpOpen = false;
    TT.startMatch(G.opponent, G.deck, { tutorial: !!tutorial });
    dirty = true;
  };

  TT.onMatchOver = function (outcome, M) {
    var tier = G.opponent.tier;
    if (outcome === 'win') G.save.wins++;
    else if (outcome === 'lose') G.save.losses++;
    else G.save.draws++;

    if (outcome === 'win') {
      G.save.beaten[tier] = true;
      G.save.winsBy[tier] = TT.winsAgainst(tier) + 1;
      if (tier === 0) G.save.tutorialDone = true;
      var next = TT.OPPONENT_BY_TIER[tier + 1];
      /* The next rival opens on the fifth win, so only that win announces it. */
      var justUnlocked = !!next && next.tier > 1 &&
                         G.save.winsBy[tier] === TT.WINS_TO_UNLOCK;
      G.unlockedName = justUnlocked ? next.name : '';
      /* Otherwise tell them how much further the next rival is. */
      G.unlockNote = '';
      if (!justUnlocked && next && next.tier > 1) {
        var left = TT.WINS_TO_UNLOCK - G.save.winsBy[tier];
        if (left > 0) {
          G.unlockNote = left + (left === 1 ? ' more win' : ' more wins') +
                         ' vs ' + G.opponent.name + ' unlocks ' + next.name;
        }
      }
      G.rewardName = G.opponent.name;
      G.rewardIds = TT.rewardChoices(Math.max(1, tier), G.save.owned);
      G.rewardPick = null;
      TT.preloadArt(G.rewardIds);
    }
    TT.save();
  };

  /* A won card is never silently dropped: leaving the reward screen (or the
   * result screen) without choosing keeps the highlighted card, defaulting to
   * the first one offered. */
  TT.claimPendingReward = function () {
    if (!G.rewardIds.length) return;
    var id = G.rewardPick || G.rewardIds[0];
    TT.grantCard(id);
    TT.toast(TT.CARD_BY_ID[id].name + ' joined your collection!');
    G.rewardPick = null;
    G.rewardIds = [];
  };

  TT.onMatchAction = function (action) {
    switch (action) {
      case 'help': helpOpen = true; TT.matchPause(performance.now()); break;
      case 'quit':
        TT.sfx('back');
        TT.claimPendingReward();
        TT.endMatch();
        G.view = 'rivals';
        break;
      case 'reward':
        TT.endMatch();
        // even with nothing on offer, the reward screen explains why
        G.view = 'reward';
        break;
      case 'rematch':
        TT.claimPendingReward();
        TT.endMatch();
        TT.launchMatch(G.opponent.tier === 0);
        break;
      case 'rivals':
        TT.claimPendingReward();
        TT.endMatch();
        G.view = 'rivals';
        break;
    }
    dirty = true;
  };

  /* Tapping anywhere dismisses the help card. */
  function closeHelp() {
    helpOpen = false;
    TT.sfx('back');
    TT.matchResume(performance.now());
    dirty = true;
  }

  /* Back out one level; also what the hardware/Escape key does. */
  function goBack() {
    if (helpOpen) { closeHelp(); return; }
    if (TT.screenBackConsumed()) { TT.sfx('back'); dirty = true; return; }
    TT.sfx('back');
    switch (G.view) {
      case 'match': TT.claimPendingReward(); TT.endMatch(); G.view = 'rivals'; break;
      case 'viewer': G.view = TT.viewerBackTarget(); break;
      case 'deck': G.view = 'rivals'; break;
      case 'reward': TT.claimPendingReward(); G.view = 'rivals'; break;
      case 'rivals': G.view = 'player'; break;
    }
    dirty = true;
  }

  /* -------------------------------------------------------------- help panel
   * Explains the rules that are actually switched on for this match.
   */
  function drawHelp(now) {
    helpHits = [];
    var rules = TT.match() ? TT.match().rules : (G.opponent ? G.opponent.ruleSet : TT.noRules());
    ctx.fillStyle = 'rgba(4,4,20,0.85)';
    ctx.fillRect(0, 0, W, H);

    var pw = Math.min(460, W - 24);
    var px = (W - pw) / 2;
    var pad = 18;
    ctx.font = TT.font('13px');
    var blocks = [];
    blocks.push({ h: 'How to play' });
    ['Tap one of your cards, then tap an empty square. Dragging works too.',
     'Your card flips a neighbour when the number facing it is bigger.',
     'A on a card means 10. When the board is full, most cards wins.'
    ].forEach(function (t) { blocks.push({ p: t }); });
    var on = TT.RULE_KEYS.filter(function (k) { return rules[k]; });
    blocks.push({ h: on.length ? 'Rules in this match' : 'No special rules in this match' });
    on.forEach(function (k) { blocks.push({ p: TT.RULE_LABEL[k] + ' — ' + TT.RULE_HELP[k] }); });

    // measure
    var lines = [];
    blocks.forEach(function (b) {
      if (b.h) { lines.push({ h: b.h }); return; }
      ctx.font = TT.font('13px');
      TT.wrapText(ctx, b.p, pw - pad * 2).forEach(function (l, i) { lines.push({ t: l, first: i === 0 }); });
    });
    var lh = 18;
    var bodyH = lines.reduce(function (a, l) { return a + (l.h ? 28 : lh) + (l.first ? 3 : 0); }, 0);
    var ph = pad * 2 + bodyH + 54;
    ph = Math.min(ph, H - 20);
    var py = (H - ph) / 2;

    ctx.fillStyle = 'rgba(16,14,54,0.97)';
    TT.roundRect(ctx, px, py, pw, ph, 18); ctx.fill();
    ctx.strokeStyle = COL.glow; ctx.lineWidth = 2;
    TT.roundRect(ctx, px, py, pw, ph, 18); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph - 46); ctx.clip();
    var y = py + pad;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach(function (l) {
      if (l.h) {
        y += 8;
        ctx.fillStyle = COL.gold; ctx.font = TT.font('bold 15px');
        ctx.fillText(l.h, px + pad, y);
        y += 20;
      } else {
        if (l.first) y += 3;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = TT.font('13px');
        ctx.fillText(l.t, px + pad, y);
        y += lh;
      }
    });
    ctx.restore();

    var b = { x: px + (pw - 160) / 2, y: py + ph - pad - 42, w: 160, h: 42, action: 'closeHelp' };
    TT.button(ctx, b, 'Got it', { size: 16 });
    helpHits.push(b);
  }

  /* ------------------------------------------------------------------ input */
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  /* Audio also self-unlocks from a document-level capture listener (assets.js);
   * this is the belt to that braces, and it runs on every press because a
   * context can be suspended again by the OS at any point. */
  function onDown(e) {
    TT.unlockAudio();
    dirty = true;
    var p = pos(e);
    if (rotateState()) {                        // only the prompt's own button
      var rb = TT.hit(rotateHits, p.x, p.y);
      if (rb) { helpOpen = false; goBack(); }
      return;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (helpOpen) {
      closeHelp();
      return;
    }
    if (G.view === 'match') TT.matchDown(p.x, p.y);
    else TT.screenDown(p.x, p.y);
  }
  function onMove(e) {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    if (rotateState()) return;
    dirty = true;
    var p = pos(e);
    if (G.view === 'match') TT.matchMove(p.x, p.y);
    else TT.screenMove(p.x, p.y);
  }
  function onUp(e) {
    dirty = true;
    if (rotateState()) return;
    var p = pos(e);
    if (G.view === 'match') TT.matchUp(p.x, p.y);
    else TT.screenUp(p.x, p.y);
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onCancel() {
    dirty = true;
    if (G.view === 'match') TT.matchCancel();
    else TT.screenCancel();
  }
  function onWheel(e) {
    if (G.view === 'match' || helpOpen) return;
    e.preventDefault();
    TT.screenWheel(e.deltaY);
    dirty = true;
  }
  /* Sound is always on — there is deliberately no mute key or button. */
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Backspace') { goBack(); e.preventDefault(); }
  }

  /* ------------------------------------------------------------------ resize */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Triple Triad is a wide board with a hand on either side of it, so a match
     * is landscape only — the old portrait match layout is never drawn again. */
    portrait = W < H * 1.05;
    dirty = true;
  }

  /* ---------------------------------------------------------- rotate prompt
   * Only the MATCH is gated: the menus (player select, rivals, deck, viewer,
   * reward) still lay out and work in portrait, so nothing here is a trap.  A
   * match in progress is paused so the rival cannot play out of sight, it
   * resumes untouched on the way back to landscape, and the prompt carries its
   * own "Leave match" button on top of the HTML arcade link and Escape.
   */
  function rotateState() { return portrait && G.view === 'match'; }
  TT.isRotatePrompt = rotateState;

  function drawRotate(now) {
    rotateHits = [];
    var cx = W / 2, cy = H / 2;
    var s = Math.max(54, Math.min(W, H) * 0.2);
    ctx.save();
    ctx.translate(cx, cy - s * 0.45);
    // a phone that tips from portrait to landscape, over and over
    var t = (now % 2600) / 2600;
    var turn = t < 0.45 ? 0 : (t < 0.6 ? (t - 0.45) / 0.15 : 1);
    if (t > 0.9) turn = 1 - (t - 0.9) / 0.1;
    ctx.rotate(-turn * Math.PI / 2);
    ctx.strokeStyle = COL.glow;
    ctx.lineWidth = Math.max(3, s * 0.055);
    TT.roundRect(ctx, -s * 0.3, -s * 0.52, s * 0.6, s * 1.04, s * 0.12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(162,155,254,0.18)';
    TT.roundRect(ctx, -s * 0.3, -s * 0.52, s * 0.6, s * 1.04, s * 0.12);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.gold;
    var ts = TT.fitText(ctx, 'Please rotate your device 🔄', W - 40, 24, 'bold');
    ctx.font = TT.font('bold ' + ts + 'px');
    ctx.fillText('Please rotate your device 🔄', cx, cy + s * 0.75);
    ctx.fillStyle = COL.sub;
    ctx.font = TT.font('14px');
    ctx.fillText('Triple Triad plays in landscape', cx, cy + s * 0.75 + 26);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = TT.font('12px');
    ctx.fillText('Your match is paused — nothing is lost', cx, cy + s * 0.75 + 48);

    var b = { x: cx - 80, y: Math.min(H - 58, cy + s * 0.75 + 66), w: 160, h: 46, action: 'leave' };
    TT.button(ctx, b, 'Leave match', { style: 'ghost', size: 15 });
    rotateHits.push(b);
  }

  /* -------------------------------------------------------------- main loop */
  function frame(now) {
    var animating = (G.view === 'match') || TT.hasToast();
    if (dirty || animating) {
      dirty = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      TT.drawBackground(ctx, W, H);
      if (rotateState()) {
        if (TT.match() && !TT.match().pausedAt) TT.matchPause(now);
        drawRotate(now);
        TT.drawToast(ctx, W, H, now);
        requestAnimationFrame(frame);
        return;
      }
      if (G.view === 'match' && TT.match() && TT.match().pausedAt && !helpOpen) TT.matchResume(now);
      if (G.view === 'match') {
        TT.matchUpdate(now);
        TT.matchDraw(ctx, W, H, now);
      } else {
        TT.screenDraw(ctx, W, H, now);
      }
      TT.drawToast(ctx, W, H, now);
      if (helpOpen) drawHelp(now);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------- boot */
  TT.boot = function () {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) TT.pauseBgm();
      else { TT.resumeBgm(); dirty = true; }
    });
    // leaving via the arcade link should not cost them the card they just won
    window.addEventListener('pagehide', function () { TT.claimPendingReward(); });

    TT.onAssetLoad(function () { dirty = true; });

    TT.preloadArt(TT.OPPONENTS.map(function (o) { return o.portrait; }));
    requestAnimationFrame(frame);
  };

})(window.TT || (window.TT = {}));
