/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * js/screens.js — every non-match screen: player select, rival select, the deck
 * builder, the 110-card viewer and the reward pick.
 */
'use strict';

(function (TT) {

  var COL = TT.COL;
  var hits = [];
  var pending = null;
  var drag = null;
  var detail = null;          // card shown in the viewer's popup
  var viewerFilter = 0;       // 0 = all levels
  var viewerFrom = 'rivals';  // where Back out of the viewer should land

  function G() { return TT.G; }

  /* --------------------------------------------------------- input plumbing
   * Chrome buttons fire on pointerdown for snappiness; anything inside a
   * scrolling list is marked `scrolls` and fires on pointerup, but only if the
   * finger did not drag (otherwise a flick would launch a match).  A button may
   * also ask for `onUp` when it must run inside a gesture that grants user
   * activation — pointerdown does not, on touch (see the player buttons, which
   * start the audio).
   */
  TT.screenDown = function (x, y) {
    var b = TT.hit(hits, x, y);
    if (b && !b.scrolls && !b.onUp) { TT.sfx('select'); act(b); return; }
    pending = b;
    var key = currentScrollKey();
    if (key) drag = { key: key, y0: y, s0: TT.scroll[key] || 0, moved: false };
  };
  TT.screenMove = function (x, y) {
    if (!drag) return;
    var dy = y - drag.y0;
    if (!drag.moved && Math.abs(dy) > 8) drag.moved = true;
    if (drag.moved) {
      var max = TT.scrollMax[drag.key] || 0;
      TT.scroll[drag.key] = Math.max(0, Math.min(max, drag.s0 - dy));
    }
  };
  TT.screenUp = function (x, y) {
    if (pending && (!drag || !drag.moved) && TT.inBox(pending, x, y)) {
      TT.sfx('select'); act(pending);
    }
    pending = null; drag = null;
  };
  TT.screenCancel = function () { pending = null; drag = null; };
  TT.screenWheel = function (dy) {
    var key = currentScrollKey();
    if (!key) return;
    var max = TT.scrollMax[key] || 0;
    TT.scroll[key] = Math.max(0, Math.min(max, (TT.scroll[key] || 0) + dy));
  };
  function currentScrollKey() {
    if (detail) return null;
    switch (G().view) {
      case 'rivals': return 'rivals';
      case 'deck': return 'deck';
      case 'viewer': return 'viewer';
      default: return null;
    }
  }

  /* --------------------------------------------------------------- routing */
  function go(view) { G().view = view; }

  function act(b) {
    var g = G();
    switch (b.action) {
      case 'pickPlayer':
        /* This is the game's first real button, and it fires from pointerup —
         * an event that grants user activation on touch as well as desktop — so
         * the AudioContext is created, resumed and handed its samples right
         * here.  Every later SFX therefore runs on a context that is already
         * 'running', and Chrome never gets the chance to log "The AudioContext
         * was not allowed to start". */
        TT.unlockAudio();
        TT.loadSfx();
        TT.selectPlayer(b.player);
        go('rivals');
        TT.startBgm();
        break;
      case 'switchPlayer': go('player'); break;
      case 'rivals': g.opponent = null; go('rivals'); break;
      case 'deck': go('deck'); break;
      case 'viewer':
        // remember the way in so Back always has somewhere real to go
        viewerFrom = g.view === 'deck' ? 'deck' : 'rivals';
        go('viewer');
        break;

      case 'rival': {
        var o = TT.OPPONENT_BY_TIER[b.tier];
        if (!TT.isUnlocked(o.tier)) {
          var prev = TT.OPPONENT_BY_TIER[o.tier - 1];
          TT.sfx('invalid');
          TT.toast('Beat ' + prev.name + ' ' + TT.WINS_TO_UNLOCK + ' times first (' +
                   TT.winsAgainst(prev.tier) + '/' + TT.WINS_TO_UNLOCK + ')');
          return;
        }
        g.opponent = o;
        if (o.tier === 0) {                       // the tutorial deals for you
          g.deck = TT.TUTORIAL_PLAYER_HAND.filter(function (id) { return g.save.owned[id]; });
          if (g.deck.length < 5) g.deck = TT.bestFive(ownedIds());
          TT.launchMatch(true);
          return;
        }
        g.deck = suggestDeck();
        go('deck');
        break;
      }

      case 'toggleCard': {
        var i = g.deck.indexOf(b.id);
        if (i >= 0) g.deck.splice(i, 1);
        else if (g.deck.length >= 5) { TT.sfx('invalid'); TT.toast('Five cards only — tap one to drop it'); return; }
        else g.deck.push(b.id);
        break;
      }
      case 'auto': g.deck = TT.bestFive(ownedIds()); TT.toast('Picked your best five'); break;
      case 'clearDeck': g.deck = []; break;
      case 'fight':
        if (g.deck.length !== 5) { TT.sfx('invalid'); TT.toast('Pick five cards'); return; }
        TT.launchMatch(false);
        break;

      case 'filter': viewerFilter = b.level; TT.scroll.viewer = 0; break;
      case 'detail': detail = TT.CARD_BY_ID[b.id]; break;
      case 'closeDetail': detail = null; break;

      case 'pickReward': g.rewardPick = b.id; break;
      case 'takeReward':
        if (!g.rewardPick) { TT.sfx('invalid'); TT.toast('Tap a card first'); return; }
        TT.grantCard(g.rewardPick);
        TT.toast(TT.CARD_BY_ID[g.rewardPick].name + ' joined your collection!');
        g.rewardPick = null; g.rewardIds = [];
        go('rivals');
        break;
      case 'skipReward': g.rewardPick = null; g.rewardIds = []; go('rivals'); break;
    }
  }
  /* Every action changes something visible, so the exported entry point always
   * asks for a repaint.  The pointer handlers mark the canvas dirty themselves,
   * but calls arriving from anywhere else would otherwise sit on a stale frame
   * (and therefore a stale hit list). */
  TT.screenAct = function (b) { act(b); TT.invalidate(); };
  TT.screenGo = function (view) { go(view); TT.invalidate(); };
  /* The hit list this frame published — introspection for the headless harness,
   * mirroring TT.match().hits for the board. */
  TT.screenHits = function () { return hits; };

  /* Escape / hardware-back closes the card popup before leaving the screen. */
  TT.screenBackConsumed = function () {
    if (!detail) return false;
    detail = null;
    return true;
  };

  /* Where the card viewer backs out to — the deck builder only if that is
   * genuinely where we came from AND a rival is still selected. */
  TT.viewerBackTarget = function () {
    return (viewerFrom === 'deck' && G().opponent) ? 'deck' : 'rivals';
  };

  function ownedIds() {
    var o = G().save.owned, out = [];
    TT.CARDS.forEach(function (c) { if (o[c.id]) out.push(c.id); });
    return out;
  }
  TT.ownedIds = ownedIds;

  /* The two card lists read in deliberately DIFFERENT orders, because they
   * answer different questions — one helper each so neither drifts by accident.
   *
   * Deck builder (owned cards only): level 10 -> 1, strongest first.  You are
   * picking five cards to fight with, so the best you own must be the first
   * thing under your thumb; ties inside a level break on rank sum.
   *
   * Card viewer (all 110): level 1 -> 10, FF8's own card-list order, so the
   * collection reads like the game's own index and a beginner's cards sit at
   * the top instead of a wall of locked plates.
   */
  function deckOrder(ids) {
    return ids.slice().sort(function (a, b) {
      var ca = TT.CARD_BY_ID[a], cb = TT.CARD_BY_ID[b];
      return (cb.level - ca.level) || (TT.rankSum(cb) - TT.rankSum(ca)) || (ca.id - cb.id);
    });
  }
  function viewerOrder(cards) { return cards.slice(); }

  /* Reuse the hand this rival was last fought with (kept per tier, so a hand
   * built for Zell is never suggested against Squall); otherwise auto-pick. */
  function suggestDeck() {
    var g = G();
    var last = (g.save.lastHands[g.opponent.tier] || []).filter(function (id) { return g.save.owned[id]; });
    if (last.length === 5) return last.slice();
    return TT.bestFive(ownedIds());
  }

  /* Column count / tile size for a card grid, given the size we would like a
   * card to be.  Cards are deliberately chunky — a phone shows two per row. */
  function cardGrid(W, want) {
    var cols = Math.max(2, Math.round((W - 24) / want));
    var tile = (W - 24 - (cols - 1) * 8) / cols;
    return { cols: cols, tile: tile };
  }

  /* =============================================================== drawing */
  TT.screenDraw = function (ctx, W, H, now) {
    hits = [];
    switch (G().view) {
      case 'player': drawPlayer(ctx, W, H, now); break;
      case 'rivals': drawRivals(ctx, W, H, now); break;
      case 'deck': drawDeck(ctx, W, H, now); break;
      case 'viewer': drawViewer(ctx, W, H, now); break;
      case 'reward': drawReward(ctx, W, H, now); break;
    }
    if (detail) drawDetail(ctx, W, H, now);
  };

  /* --------------------------------------------------------- player select */
  function drawPlayer(ctx, W, H, now) {
    var land = H < 520;
    var ts = Math.min(46, W * 0.115);
    var bw = Math.min(320, W - 56), bh = land ? 62 : 76, gap = 16;
    var lead = land ? 18 : 34;
    // centre the whole block, but never under the HTML back link
    var blockH = ts + 26 + lead + bh * 2 + gap;
    var y0 = Math.max(58, (H - blockH) / 2);
    var titleY = y0 + ts * 0.85;
    var subY = titleY + 26;

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.shadowColor = COL.gold; ctx.shadowBlur = 22;
    ctx.fillStyle = COL.gold;
    ts = TT.fitText(ctx, 'TRIPLE TRIAD', W - 32, ts, '900');
    ctx.font = TT.font('900 ' + ts + 'px');
    ctx.fillText('TRIPLE TRIAD', W / 2, titleY);
    ctx.restore();
    ctx.fillStyle = COL.sub;
    ctx.font = TT.font((land ? 13 : 15) + 'px');
    ctx.fillText('Collect cards. Beat all ten rivals.', W / 2, subY);

    var top = subY + lead;
    ['caleb', 'ezra'].forEach(function (p, i) {
      // onUp: the audio has to start inside an activation-granting gesture
      var b = { x: (W - bw) / 2, y: top + i * (bh + gap), w: bw, h: bh, action: 'pickPlayer', player: p, onUp: true };
      var g2 = ctx.createLinearGradient(b.x, b.y, b.x + bw, b.y + bh);
      if (p === 'caleb') { g2.addColorStop(0, '#6c5ce7'); g2.addColorStop(1, '#a29bfe'); }
      else { g2.addColorStop(0, '#0984e3'); g2.addColorStop(1, '#74b9ff'); }
      ctx.fillStyle = g2;
      TT.roundRect(ctx, b.x, b.y, bw, bh, 18); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = TT.font('bold ' + (land ? 22 : 26) + 'px');
      ctx.fillText(p === 'caleb' ? 'Caleb' : 'Ezra', b.x + 22, b.y + bh / 2 - 8);
      var st = TT.playerSummary(p);
      ctx.font = TT.font('12px');
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(st, b.x + 22, b.y + bh / 2 + 14);
      ctx.textAlign = 'center';
      hits.push(b);
    });
  }

  /* ---------------------------------------------------------- rival select */
  function drawRivals(ctx, W, H, now) {
    var g = G();
    var owned = ownedIds().length;
    var box = TT.screenChrome(ctx, W, H, 'Choose a Rival',
      TT.playerName() + ' · ' + owned + '/110 cards', 'Players', 'switchPlayer', hits);

    // action row (sound is always on, so "My cards" has the row to itself)
    var rowH = 44;
    var bw = Math.min(220, W - 48);
    var b1 = { x: (W - bw) / 2, y: box.top, w: bw, h: rowH, action: 'viewer' };
    TT.button(ctx, b1, 'My cards', { style: 'ghost', size: 15 });
    hits.push(b1);

    var top = box.top + rowH + 10, bot = box.bottom;
    var avail = bot - top;
    var list = TT.OPPONENTS;
    var rowGap = 8;
    // tall enough for name / blurb / prize line / rules without them touching
    var rH = W < 420 ? 92 : 98;
    var contentH = list.length * (rH + rowGap);
    var sc = TT.scrollFor('rivals', contentH, avail);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, avail); ctx.clip();
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      var y = top - sc + i * (rH + rowGap);
      if (y > bot || y + rH < top) {
        TT.pushClipped(hits, { x: 12, y: y, w: W - 24, h: rH, action: 'rival', tier: o.tier, scrolls: true }, top, bot);
        continue;
      }
      drawRivalRow(ctx, W, o, 12, y, W - 24, rH, now);
      TT.pushClipped(hits, { x: 12, y: y, w: W - 24, h: rH, action: 'rival', tier: o.tier, scrolls: true }, top, bot);
    }
    ctx.restore();
    TT.drawScrollHint(ctx, W, top, bot, sc, TT.scrollMax.rivals);
  }

  function drawRivalRow(ctx, W, o, x, y, w, h, now) {
    var unlocked = TT.isUnlocked(o.tier);
    var beaten = !!G().save.beaten[o.tier];
    /* "Nothing left to give" comes from the reward function itself, so the badge
     * below cannot promise (or deny) a prize the win screen would disagree with. */
    var done = unlocked && TT.rewardExhausted(o.tier, G().save.owned);
    ctx.fillStyle = done ? 'rgba(255,211,42,0.13)'
      : (unlocked ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)');
    TT.roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = done ? COL.gold : (beaten ? 'rgba(255,211,42,0.55)'
      : (unlocked ? 'rgba(162,155,254,0.4)' : 'rgba(255,255,255,0.08)'));
    ctx.lineWidth = done ? 3 : (beaten ? 2 : 1);
    TT.roundRect(ctx, x, y, w, h, 14); ctx.stroke();

    // portrait: the character's own level-10 card art
    var ps = h - 16;
    var px = x + 8, py = y + 8;
    var art = TT.getArt(o.portrait);
    ctx.save();
    TT.roundRect(ctx, px, py, ps, ps, 9); ctx.clip();
    if (art) {
      ctx.drawImage(art, px, py, ps, ps);
      if (!unlocked) { ctx.fillStyle = 'rgba(6,6,26,0.72)'; ctx.fillRect(px, py, ps, ps); }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py, ps, ps);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    TT.roundRect(ctx, px, py, ps, ps, 9); ctx.stroke();

    var tx = px + ps + 12;
    var tw = x + w - tx - 12;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = TT.font('bold 18px');
    ctx.fillStyle = unlocked ? '#fff' : 'rgba(255,255,255,0.4)';
    var name = unlocked ? o.name : '???';
    ctx.fillText(TT.ellipsize(ctx, name, tw - 70), tx, y + 26);

    // tier badge / trophy on the right, with the win tally under it
    ctx.textAlign = 'right';
    ctx.font = TT.font('bold 12px');
    ctx.fillStyle = beaten ? COL.gold : 'rgba(255,255,255,0.45)';
    ctx.fillText(o.tier === 0 ? 'TUTORIAL' : (beaten ? '★ TIER ' + o.tier : 'TIER ' + o.tier), x + w - 12, y + 24);
    var mine = TT.winsAgainst(o.tier);
    var next = TT.OPPONENT_BY_TIER[o.tier + 1];
    if (unlocked && o.tier > 0) {
      var needed = next && next.tier > 1;
      ctx.font = TT.font('bold 11px');
      ctx.fillStyle = needed && mine < TT.WINS_TO_UNLOCK ? COL.sub : 'rgba(255,255,255,0.4)';
      ctx.fillText(needed ? mine + '/' + TT.WINS_TO_UNLOCK + ' wins' : mine + ' wins', x + w - 12, y + 42);
    }

    ctx.textAlign = 'left';
    ctx.font = TT.font('12px');
    ctx.fillStyle = COL.sub;
    var prev = TT.OPPONENT_BY_TIER[o.tier - 1];
    var line = o.blurb;
    if (!unlocked) {
      line = prev
        ? 'Locked — win ' + TT.WINS_TO_UNLOCK + ' vs ' + prev.name +
          ' (' + TT.winsAgainst(prev.tier) + '/' + TT.WINS_TO_UNLOCK + ')'
        : 'Locked';
    }
    ctx.fillText(TT.ellipsize(ctx, line, tw - (unlocked && o.tier > 0 ? 76 : 0)), tx, y + 44);

    /* What this rival is actually worth — straight from the reward maths, which
     * only ever gives their own level plus a taste of the next one.  Once the
     * player has taken all of it the line becomes a loud gold badge instead. */
    if (done) {
      ctx.font = TT.font('bold 12px');
      var bl = 'ALL CARDS WON ✓';
      var bw2 = Math.min(tw, ctx.measureText(bl).width + 20);
      ctx.fillStyle = COL.gold;
      TT.roundRect(ctx, tx, y + 50, bw2, 20, 10); ctx.fill();
      ctx.fillStyle = '#2a1c00';
      ctx.textBaseline = 'middle';
      ctx.fillText(bl, tx + 10, y + 61);
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.font = TT.font('bold 12px');
      ctx.fillStyle = unlocked ? 'rgba(255,211,42,0.9)' : 'rgba(255,211,42,0.4)';
      ctx.fillText(TT.ellipsize(ctx, '🏆 ' + TT.rewardBandText(o.tier), tw), tx, y + 62);
    }

    var on = TT.RULE_KEYS.filter(function (k) { return o.ruleSet[k]; }).map(function (k) { return TT.RULE_LABEL[k]; });
    ctx.font = TT.font('bold 11px');
    ctx.fillStyle = unlocked ? 'rgba(162,155,254,0.95)' : 'rgba(162,155,254,0.4)';
    var rt = on.length ? on.join(' · ') : 'Basic rules only';
    ctx.fillText(TT.ellipsize(ctx, rt, tw), tx, y + h - 12);
  }

  /* ---------------------------------------------------------- deck builder */
  /* The rival, the tier and the rules in ONE line, so the block above the cards
   * costs a single row instead of a title, a subtitle and a chip strip. */
  function matchInfo(o) {
    var on = TT.RULE_KEYS.filter(function (k) { return o.ruleSet[k]; })
                         .map(function (k) { return TT.RULE_LABEL[k]; });
    return 'vs ' + o.name + ' · Tier ' + o.tier + ' · ' +
           (on.length ? on.join(' · ') : 'No special rules');
  }

  function drawDeck(ctx, W, H, now) {
    var g = G();
    var o = g.opponent;
    var box = TT.screenChrome(ctx, W, H, 'Build your hand', matchInfo(o), 'Rivals', 'rivals', hits);

    var y = box.top;
    var availAll = box.bottom - y;

    /* Top block: the five chosen cards as one row, with the actions in a column
     * beside them rather than stacked underneath.  The row is sized to fill its
     * share of the height as well as the width, so the cards are as big as the
     * screen allows instead of a fixed 78px. */
    var bh = 46, bGap = 8, btnW = Math.max(104, Math.min(150, W * 0.19));
    var btnsH = bh * 3 + bGap * 2;
    var blockH = Math.max(96, Math.min(availAll * 0.46, 200));
    var slotGap = 8;
    var slot = Math.min((W - 24 - btnW - 12 - slotGap * 4) / 5, blockH);
    blockH = Math.max(slot, btnsH);
    var handW = slot * 5 + slotGap * 4;
    var sx0 = 12 + Math.max(0, (W - 24 - btnW - 12 - handW) / 2);
    var sy = y + (blockH - slot) / 2;

    for (var i = 0; i < 5; i++) {
      var sxp = sx0 + i * (slot + slotGap);
      var id = g.deck[i];
      if (id) {
        TT.drawCard(ctx, TT.CARD_BY_ID[id], 'you', sxp, sy, slot, {});
        hits.push({ x: sxp, y: sy, w: slot, h: slot, action: 'toggleCard', id: id });
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        TT.roundRect(ctx, sxp, sy, slot, slot, slot * 0.1); ctx.fill();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(162,155,254,0.5)'; ctx.lineWidth = 2;
        TT.roundRect(ctx, sxp, sy, slot, slot, slot * 0.1); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // action column, vertically centred on the hand row
    var bx = W - 12 - btnW;
    var by = y + (blockH - btnsH) / 2;
    var bf = { x: bx, y: by, w: btnW, h: bh, action: 'fight' };
    TT.button(ctx, bf, g.deck.length === 5 ? 'Fight!' : g.deck.length + '/5', {
      style: g.deck.length === 5 ? 'gold' : 'ghost', size: 16, disabled: g.deck.length !== 5
    });
    hits.push(bf);
    var ba = { x: bx, y: by + bh + bGap, w: btnW, h: bh, action: 'auto' };
    TT.button(ctx, ba, 'Best 5', { style: 'ghost', size: 14 }); hits.push(ba);
    var bc = { x: bx, y: by + (bh + bGap) * 2, w: btnW, h: bh, action: 'viewer' };
    TT.button(ctx, bc, 'All cards', { style: 'ghost', size: 14 }); hits.push(bc);

    y += blockH + 6;

    // owned-card grid, best cards first (level 10 -> 1)
    var ids = deckOrder(ownedIds());
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = TT.font('12px');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Your collection — tap to add or remove', W / 2, y + 10);
    y += 16;

    var top = y, bot = box.bottom;
    var avail = bot - top;
    /* Big cards: aim for ~190px tiles, more than twice the old size so the ranks
     * are readable at arm's length — but never taller than the strip they scroll
     * in, which would leave half a row of dead space. */
    var grid = cardGrid(W, 190);
    var tile = Math.min(grid.tile, Math.max(84, avail - 34)), cols = grid.cols;
    var cw = tile + 8, rh = tile + 34;
    var gx0 = (W - (cols * cw - 8)) / 2;
    var rows = Math.ceil(ids.length / cols);
    var sc = TT.scrollFor('deck', rows * rh + 6, avail);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, Math.max(0, avail)); ctx.clip();
    for (var k = 0; k < ids.length; k++) {
      var col = k % cols, row = Math.floor(k / cols);
      var cx = gx0 + col * cw, cy = top - sc + row * rh;
      var card = TT.CARD_BY_ID[ids[k]];
      var chosen = g.deck.indexOf(card.id) >= 0;
      if (cy < bot && cy + rh > top) {
        /* The real card-background variants do the talking: BLUE frame (the
         * 'you' sprite) for the five in your hand, RED frame (the 'foe' sprite)
         * for everything still on the bench.  Same art the match uses for card
         * ownership, so it reads instantly — no overlay, no tint. */
        TT.drawCardTile(ctx, card, cx, cy, tile, {
          labelH: 30,
          owner: chosen ? 'you' : 'foe',
          ring: chosen ? COL.gold : null,
          dim: chosen ? 1 : 0.96
        });
        if (chosen) {
          var n = g.deck.indexOf(card.id) + 1;
          var br = Math.max(11, tile * 0.1);
          ctx.fillStyle = COL.gold;
          ctx.beginPath(); ctx.arc(cx + tile - br, cy + br, br, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a1c00';
          ctx.font = TT.font('bold ' + Math.round(br * 1.2) + 'px');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n), cx + tile - br, cy + br + 1);
        }
      }
      TT.pushClipped(hits, { x: cx, y: cy, w: tile, h: tile + 4, action: 'toggleCard', id: card.id, scrolls: true }, top, bot);
    }
    ctx.restore();
    TT.drawScrollHint(ctx, W, top, bot, sc, TT.scrollMax.deck);
  }

  /* ----------------------------------------------------------- card viewer */
  function drawViewer(ctx, W, H, now) {
    var g = G();
    var ownedCount = ownedIds().length;
    var box = TT.screenChrome(ctx, W, H, 'Card Collection',
      ownedCount + ' of 110 collected', 'Back', TT.viewerBackTarget(), hits);

    // level filter chips
    var fy = box.top;
    // 11 chips + 10 four-pixel gaps have to fit inside the screen with a margin
    var chipW = Math.max(24, Math.min(40, (W - 24 - 40) / 11));
    var totalW = chipW * 11 + 10 * 4;
    var fx = (W - totalW) / 2;
    var labels = ['All', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    for (var i = 0; i < labels.length; i++) {
      var lvl = i === 0 ? 0 : i;
      var bx = fx + i * (chipW + 4);
      var on = viewerFilter === lvl;
      // eleven chips cannot each be 44 wide on a phone, so the drawn pill stays
      // small while the tap area is stretched to the full 44 vertically
      var b = { x: bx - 1, y: fy - 5, w: chipW + 2, h: 44, action: 'filter', level: lvl };
      ctx.fillStyle = on ? 'rgba(255,211,42,0.85)' : 'rgba(255,255,255,0.1)';
      TT.roundRect(ctx, bx, fy, chipW, 34, 10); ctx.fill();
      if (!on) { ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; TT.roundRect(ctx, bx, fy, chipW, 34, 10); ctx.stroke(); }
      ctx.fillStyle = on ? '#2a1c00' : 'rgba(255,255,255,0.8)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = TT.font('bold 13px');
      ctx.fillText(labels[i], bx + chipW / 2, fy + 18);
      hits.push(b);
    }

    var top = fy + 42, bot = box.bottom;
    var avail = bot - top;
    var pool = viewerOrder(TT.CARDS.filter(function (c) { return !viewerFilter || c.level === viewerFilter; }));
    // ~190px tiles: twice the old size, but never taller than the visible strip
    var grid = cardGrid(W, 190);
    var tile = Math.min(grid.tile, Math.max(84, avail - 36)), cols = grid.cols;
    var cw = tile + 8, rh = tile + 36;
    var gx0 = (W - (cols * cw - 8)) / 2;
    var rows = Math.ceil(pool.length / cols);
    var sc = TT.scrollFor('viewer', rows * rh + 8, avail);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, Math.max(0, avail)); ctx.clip();
    for (var k = 0; k < pool.length; k++) {
      var col = k % cols, row = Math.floor(k / cols);
      var cx = gx0 + col * cw, cy = top - sc + row * rh;
      var card = pool[k];
      var have = !!g.save.owned[card.id];
      if (cy < bot && cy + rh > top) {
        /* A locked card still gives nothing away about itself — the plate shows
         * only its level — but the strip underneath names the rival who first
         * hands that level out, so the collection doubles as a to-do list. */
        TT.drawCardTile(ctx, card, cx, cy, tile, have ? { labelH: 32 } : {
          locked: true, labelH: 32,
          lockedLabel: 'Beat ' + TT.unlockRivalFor(card.level).name,
          lockedSub: 'Lv ' + card.level + ' card'
        });
      }
      TT.pushClipped(hits, { x: cx, y: cy, w: tile, h: tile + 6, action: 'detail', id: card.id, scrolls: true }, top, bot);
    }
    ctx.restore();
    TT.drawScrollHint(ctx, W, top, bot, sc, TT.scrollMax.viewer);
  }

  function drawDetail(ctx, W, H, now) {
    ctx.fillStyle = 'rgba(4,4,20,0.8)';
    ctx.fillRect(0, 0, W, H);
    hits.push({ x: 0, y: 0, w: W, h: H, action: 'closeDetail' });
    var card = detail;
    var have = !!G().save.owned[card.id];
    var s = Math.min(260, W * 0.66, H * 0.46);
    var pw = Math.min(360, W - 32);
    /* Owned: card + name + level/element + ranks + status + Close.
     * Locked: card (level only) + how to earn it + Close — nothing about the
     * card itself is given away, but the rival to beat is spelled out. */
    var ph = have ? s + 178 : s + 134;
    var px = (W - pw) / 2, py = (H - ph) / 2;
    ctx.fillStyle = 'rgba(16,14,54,0.97)';
    TT.roundRect(ctx, px, py, pw, ph, 18); ctx.fill();
    ctx.strokeStyle = have ? COL.gold : 'rgba(162,155,254,0.5)'; ctx.lineWidth = 2;
    TT.roundRect(ctx, px, py, pw, ph, 18); ctx.stroke();

    TT.drawCard(ctx, card, 'you', (W - s) / 2, py + 16, s, { locked: !have });
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (have) {
      ctx.fillStyle = '#fff';
      ctx.font = TT.font('bold 20px');
      ctx.fillText(TT.ellipsize(ctx, card.name, pw - 28), W / 2, py + s + 44);
      ctx.fillStyle = COL.sub;
      ctx.font = TT.font('13px');
      var eid = TT.ELEMENT_ID[card.element];
      ctx.fillText('Level ' + card.level + '  ·  ' + (eid ? TT.ELEMENT_LABEL[eid] : 'No element'), W / 2, py + s + 66);
      ctx.font = TT.font('bold 14px');
      ctx.fillStyle = '#fff';
      var g2 = function (r) { return r === 10 ? 'A' : String(r); };
      ctx.fillText('Top ' + g2(card.ranks[0]) + '   Left ' + g2(card.ranks[1]) +
                   '   Right ' + g2(card.ranks[2]) + '   Bottom ' + g2(card.ranks[3]),
                   W / 2, py + s + 90);
      ctx.font = TT.font('12px');
      ctx.fillStyle = COL.gold;
      ctx.fillText('In your collection', W / 2, py + s + 112);
    } else {
      ctx.font = TT.font('13px');
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Level ' + card.level + ' card — not collected yet', W / 2, py + s + 44);
      ctx.font = TT.font('bold 15px');
      ctx.fillStyle = COL.gold;
      ctx.fillText(TT.ellipsize(ctx, 'Beat ' + TT.unlockRivalFor(card.level).name + ' to win it', pw - 28),
                   W / 2, py + s + 70);
    }

    var cb = { x: (W - 150) / 2, y: py + ph - 56, w: 150, h: 44, action: 'closeDetail' };
    TT.button(ctx, cb, 'Close', { style: 'ghost', size: 15 });
    hits.push(cb);
  }

  /* ---------------------------------------------------------------- reward */
  function drawReward(ctx, W, H, now) {
    var g = G();
    var ids = g.rewardIds;
    var box = TT.screenChrome(ctx, W, H, 'You beat ' + g.rewardName + '!',
      ids.length ? 'Choose one card to keep' : 'No new cards from this rival',
      null, null, hits);
    var y = box.top + 8;

    /* Nothing this rival is allowed to give away is still missing (their cards
     * are capped at one level above their tier), so say so plainly instead of
     * handing over something they should not own. */
    if (!ids.length) {
      var mw = Math.min(360, W - 40);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      ctx.font = TT.font('bold 17px');
      var msg = TT.NO_REWARD_MSG;
      var lines = TT.wrapText(ctx, msg, mw);
      var blockH = lines.length * 24 + 24 + 52;
      var my = box.top + Math.max(10, (box.bottom - box.top - blockH) / 2);
      lines.forEach(function (ln, i) { ctx.fillText(ln, W / 2, my + i * 24); });
      var sb = { x: (W - 240) / 2, y: my + lines.length * 24 + 24, w: 240, h: 52, action: 'skipReward' };
      TT.button(ctx, sb, 'Continue', { size: 17 });
      hits.push(sb);
      return;
    }

    /* The prize cards are the point of the screen, so make them as big as the
     * space allows: try every column count and keep whichever gives the largest
     * card.  On a phone that means two across and one below, not three squeezed
     * into a row. */
    var n = ids.length;
    var gap = 12, labelH = 32;
    var footerH = 42 + 14 + 56 + (g.unlockedName || g.unlockNote ? 34 : 0);
    var space = box.bottom - box.top - 8;
    var best = { s: 0, cols: n };
    for (var c = 1; c <= n; c++) {
      var rows = Math.ceil(n / c);
      var byW = (W - 28 - gap * (c - 1)) / c;
      var byH = (space - footerH - (rows - 1) * gap) / rows - labelH;
      var cand = Math.min(byW, byH);
      if (cand > best.s) best = { s: cand, cols: c, rows: rows };
    }
    var s = Math.max(72, Math.min(240, best.s));
    var cols = best.cols, rows = Math.ceil(n / cols);
    var gridH = rows * (s + labelH) + (rows - 1) * gap;
    y = box.top + Math.max(4, (space - gridH - footerH) / 2);

    var lastY = y;
    for (var i = 0; i < n; i++) {
      var col = i % cols, row = Math.floor(i / cols);
      var inRow = Math.min(cols, n - row * cols);
      var rowX = (W - (inRow * s + gap * (inRow - 1))) / 2;
      var cx = rowX + col * (s + gap);
      var cy = y + row * (s + labelH + gap);
      var card = TT.CARD_BY_ID[ids[i]];
      var sel = g.rewardPick === card.id;
      TT.drawCardTile(ctx, card, cx, cy, s, { labelH: labelH, selected: sel });
      hits.push({ x: cx, y: cy, w: s, h: s + labelH, action: 'pickReward', id: card.id });
      lastY = cy;
    }
    var by = lastY + s + labelH + 20;
    ctx.textAlign = 'center'; ctx.fillStyle = COL.sub; ctx.font = TT.font('13px');
    ctx.fillText(g.rewardPick ? 'Keep ' + TT.CARD_BY_ID[g.rewardPick].name + '?' : 'Tap a card to choose it',
                 W / 2, by);
    var bw = Math.min(280, W - 48);
    var b = { x: (W - bw) / 2, y: by + 14, w: bw, h: 56, action: 'takeReward' };
    TT.button(ctx, b, 'Keep this card', { style: 'gold', size: 18, disabled: !g.rewardPick });
    hits.push(b);
    if (g.unlockedName) {
      ctx.fillStyle = COL.gold; ctx.font = TT.font('bold 14px');
      ctx.fillText('New rival unlocked: ' + g.unlockedName, W / 2, by + 94);
    } else if (g.unlockNote) {
      ctx.fillStyle = COL.sub; ctx.font = TT.font('13px');
      ctx.fillText(TT.ellipsize(ctx, g.unlockNote, W - 32), W / 2, by + 94);
    }
  }

  /* Attribution deliberately lives in the LICENSE file and the header comment of
   * every source file rather than an in-game screen — see ../LICENSE. */

})(window.TT || (window.TT = {}));
