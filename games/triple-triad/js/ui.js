/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * js/ui.js — canvas drawing kit shared by every screen: theme colours, round
 * rects, buttons, scrollable-grid plumbing and the card renderer.
 */
'use strict';

(function (TT) {

  TT.COL = {
    bg0: '#0a0a2e', bg1: '#141452', bg2: '#1a1a6e',
    accent: '#6c5ce7', glow: '#a29bfe', sub: '#a0c4ff',
    gold: '#ffd32a', danger: '#e74c3c', good: '#2ecc71',
    you: '#4a8fe7', foe: '#e05a5a'
  };
  var COL = TT.COL;
  var FONT = '"Segoe UI",system-ui,-apple-system,sans-serif';
  TT.font = function (spec) { return spec + ' ' + FONT; };

  TT.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  TT.drawBackground = function (ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COL.bg0); g.addColorStop(0.55, COL.bg1); g.addColorStop(1, COL.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    /* The FFVIII mat is NOT drawn here any more: it is the play area itself and
     * is painted, undimmed and aligned to the 3x3 grid, by the match renderer
     * (see TT.MAT_BOARD and drawBoard in match.js). */
  };

  /* Where the 3x3 board sits inside img/board-mat.jpg (1920x1120).  Measured off
   * the art: the ornate frame's ruled lines are at x 486 and 1435, y 85 and
   * 1036, and the small inner frame is exactly the centre cell of that square —
   * so this rect maps one-to-one onto the nine placement cells. */
  TT.MAT_BOARD = { x: 486, y: 85, w: 949, h: 951 };

  /* ------------------------------------------------------------------ text */
  TT.fitText = function (ctx, text, maxW, size, weight) {
    var s = size;
    for (;;) {
      ctx.font = TT.font((weight ? weight + ' ' : '') + s + 'px');
      if (ctx.measureText(text).width <= maxW || s <= 8) break;
      s -= 1;
    }
    return s;
  };
  TT.ellipsize = function (ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  /* ---------------------------------------------------------------- buttons
   * Buttons are plain rectangles pushed onto a hit-box list; every screen
   * rebuilds its list each frame and input matches against it.
   */
  TT.button = function (ctx, box, label, opts) {
    opts = opts || {};
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var r = opts.radius === undefined ? 13 : opts.radius;
    var style = opts.style || 'primary';
    ctx.save();
    if (style === 'primary' || style === 'gold') {
      var g = ctx.createLinearGradient(x, y, x + w, y + h);
      if (style === 'gold') { g.addColorStop(0, '#e6a700'); g.addColorStop(1, COL.gold); }
      else { g.addColorStop(0, COL.accent); g.addColorStop(1, COL.glow); }
      ctx.fillStyle = g;
      TT.roundRect(ctx, x, y, w, h, r); ctx.fill();
    } else if (style === 'danger') {
      ctx.fillStyle = 'rgba(231,76,60,0.85)';
      TT.roundRect(ctx, x, y, w, h, r); ctx.fill();
    } else {
      ctx.fillStyle = opts.disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)';
      TT.roundRect(ctx, x, y, w, h, r); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
      TT.roundRect(ctx, x, y, w, h, r); ctx.stroke();
    }
    if (opts.disabled) { ctx.globalAlpha = 0.45; }
    ctx.fillStyle = style === 'gold' ? '#2a1c00' : '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var size = opts.size || Math.min(19, Math.round(h * 0.42));
    size = TT.fitText(ctx, label, w - 20, size, 'bold');
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  };

  /* Small pill used for rule tags and stat chips. */
  TT.chip = function (ctx, x, y, label, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    ctx.font = TT.font('bold ' + size + 'px');
    var padX = opts.padX || 9;
    var w = ctx.measureText(label).width + padX * 2;
    var h = opts.h || size + 12;
    ctx.fillStyle = opts.bg || 'rgba(108,92,231,0.32)';
    TT.roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (opts.border !== false) {
      ctx.strokeStyle = opts.borderColor || 'rgba(162,155,254,0.55)';
      ctx.lineWidth = 1;
      TT.roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
    }
    ctx.fillStyle = opts.fg || '#dcd6ff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    return w;
  };

  /* ------------------------------------------------- scrollable grid helpers */
  TT.scroll = {};
  TT.scrollMax = {};
  TT.scrollFor = function (key, contentH, availH) {
    TT.scrollMax[key] = Math.max(0, contentH - availH);
    if (TT.scroll[key] === undefined) TT.scroll[key] = 0;
    TT.scroll[key] = Math.max(0, Math.min(TT.scrollMax[key], TT.scroll[key]));
    return TT.scroll[key];
  };
  /* Clip a hit box to the scroll viewport so a tile hidden under the header is
   * not tappable. */
  TT.pushClipped = function (list, box, top, bot) {
    var y0 = Math.max(box.y, top), y1 = Math.min(box.y + box.h, bot);
    if (y1 - y0 < 14) return;
    var b = {}; for (var k in box) b[k] = box[k];
    b.y = y0; b.h = y1 - y0;
    list.push(b);
  };
  TT.drawScrollHint = function (ctx, W, top, bot, scroll, max) {
    if (max <= 0.5) return;
    var trackH = bot - top, x = W - 8;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    TT.roundRect(ctx, x, top, 4, trackH, 2); ctx.fill();
    var thumbH = Math.max(28, trackH * trackH / (trackH + max));
    ctx.fillStyle = 'rgba(162,155,254,0.6)';
    TT.roundRect(ctx, x, top + (trackH - thumbH) * (scroll / max), 4, thumbH, 2); ctx.fill();
    if (scroll > 1) {
      var gt = ctx.createLinearGradient(0, top, 0, top + 22);
      gt.addColorStop(0, 'rgba(10,10,46,0.92)'); gt.addColorStop(1, 'rgba(10,10,46,0)');
      ctx.fillStyle = gt; ctx.fillRect(0, top, W, 22);
    }
    if (scroll < max - 1) {
      var gb = ctx.createLinearGradient(0, bot - 22, 0, bot);
      gb.addColorStop(0, 'rgba(10,10,46,0)'); gb.addColorStop(1, 'rgba(10,10,46,0.92)');
      ctx.fillStyle = gb; ctx.fillRect(0, bot - 22, W, 22);
    }
  };

  /* Shared screen header: gold title, subtitle, and a back pill on the RIGHT
   * (the HTML "← Games" link owns the top-left). */
  TT.screenChrome = function (ctx, W, H, title, sub, backLabel, backAction, list) {
    var land = H < 520;
    var titleY = land ? 27 : 40, titleSize = land ? (W < 400 ? 18 : 20) : 25;
    var subSize = land ? 12 : 14;
    var subY = land ? 50 : 64;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.gold;
    /* The title is centred between the HTML back link (left, ~110px) and the
     * back pill (right, 106px), so shrink it to fit rather than truncating. */
    var avail = W - 224;
    var fitted = TT.fitText(ctx, title, avail, titleSize, 'bold');
    if (fitted < 15) { fitted = 15; ctx.font = TT.font('bold 15px'); }
    ctx.font = TT.font('bold ' + fitted + 'px');
    ctx.fillText(TT.ellipsize(ctx, title, avail), W / 2, titleY);
    if (sub) {
      ctx.fillStyle = COL.sub;
      ctx.font = TT.font(subSize + 'px');
      if (land && subY - subSize < 47 && W / 2 - ctx.measureText(sub).width / 2 < 124) subY = 47 + subSize + 2;
      ctx.fillText(TT.ellipsize(ctx, sub, W - 40), W / 2, subY);
    }
    if (backLabel) {
      // 94x44 keeps the pill on the 44px minimum touch target
      var b = { x: W - 106, y: land ? 5 : 10, w: 94, h: 44, action: backAction };
      TT.button(ctx, b, backLabel, { style: 'ghost', size: 14, radius: 12 });
      list.push(b);
    }
    return { top: (sub ? subY : titleY) + (land ? 10 : 16), bottom: H - 12 };
  };

  /* ------------------------------------------------------------------- cards
   * One renderer for every context: hand, board, deck grid, reward row.
   * opts:
   *   faceDown   draw card-back.png instead
   *   flip       0..1 flip progress; owner swaps at the halfway squash
   *   fromOwner  owner shown for flip < 0.5
   *   pop        0..1 extra scale for the just-placed bounce
   *   selected   accent ring
   *   locked     unowned: a blank plate showing ONLY the card's level, so the
   *              art, name, ranks and element are all a surprise until it is won
   *   bonus      -1 / 0 / +1 element modifier badge
   *   dim        fade the whole card
   */
  TT.drawCard = function (ctx, card, owner, x, y, size, opts) {
    opts = opts || {};
    var s = size;
    var pop = opts.pop || 0;
    var flip = opts.flip;
    var sx = 1;
    if (flip !== undefined) {
      sx = Math.abs(Math.cos(Math.min(1, Math.max(0, flip)) * Math.PI));
      sx = Math.max(0.05, sx);
      if (flip < 0.5 && opts.fromOwner) owner = opts.fromOwner;
    }
    var scale = 1 + pop * 0.16;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(sx * scale, scale);
    ctx.translate(-s / 2, -s / 2);
    if (opts.dim) ctx.globalAlpha = opts.dim;

    if (opts.faceDown) {
      if (!TT.drawFrame(ctx, TT.img.cardBack, { x: 0, y: 0, w: 256, h: 256 }, 0, 0, s, s)) {
        ctx.fillStyle = '#241a4d';
        TT.roundRect(ctx, 0, 0, s, s, s * 0.08); ctx.fill();
        ctx.strokeStyle = 'rgba(162,155,254,0.5)'; ctx.lineWidth = 2;
        TT.roundRect(ctx, s * 0.08, s * 0.08, s * 0.84, s * 0.84, s * 0.06); ctx.stroke();
      }
      ctx.restore();
      return;
    }

    /* A card you do not own gives nothing away but its level: no art, no name,
     * no ranks, no element. */
    if (opts.locked) {
      ctx.fillStyle = '#191a3a';
      TT.roundRect(ctx, 0, 0, s, s, s * 0.07); ctx.fill();
      ctx.strokeStyle = 'rgba(162,155,254,0.34)'; ctx.lineWidth = Math.max(1.5, s * 0.014);
      TT.roundRect(ctx, s * 0.055, s * 0.055, s * 0.89, s * 0.89, s * 0.05); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = TT.font('bold ' + Math.round(s * 0.13) + 'px');
      ctx.fillText('Lv', s / 2, s * 0.36);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = TT.font('900 ' + Math.round(s * 0.34) + 'px');
      ctx.fillText(String(card.level), s / 2, s * 0.58);
      if (opts.ring) {
        ctx.strokeStyle = opts.ring; ctx.lineWidth = Math.max(2, s * 0.025);
        TT.roundRect(ctx, 1, 1, s - 2, s - 2, s * 0.07); ctx.stroke();
      }
      ctx.restore();
      return;
    }

    /* 1. owner-coloured card background — the real sprite variant from
     * img/card.png (256x768: frame 0 RED, frame 1 BLUE, frame 2 grey).  The
     * artwork on top is transparent around the creature, so this frame is what
     * gives a card its colour: 'you' = blue, 'foe' = red.  The deck builder
     * borrows the same two variants for in-hand / not-in-hand. */
    var frameIdx = owner === 'you' ? 1 : 2;
    if (owner === 'foe') frameIdx = 0;
    if (!TT.drawFrame(ctx, TT.img.cardFrames, TT.frameCard(frameIdx), 0, 0, s, s)) {
      ctx.fillStyle = owner === 'you' ? '#1d3f7a' : '#7a2020';
      TT.roundRect(ctx, 0, 0, s, s, s * 0.07); ctx.fill();
    }

    // 2. artwork (lazy-loaded; a placeholder shows until it lands)
    var art = card ? TT.getArt(card.id) : null;
    if (art) {
      ctx.drawImage(art, 0, 0, s, s);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    }

    // 3. the four ranks, laid out like the original card.js
    {
      var rw = 32 * s / 256, rh = 28 * s / 256, off = s * 0.06;
      var slots = [
        [off + rw / 2, off],
        [off, off + rh],
        [off + rw, off + rh],
        [off + rw / 2, off + rh * 2]
      ];
      var sheet = TT.img.rank;
      for (var i = 0; i < 4; i++) {
        var r = card.ranks[i];
        if (!TT.drawFrame(ctx, sheet, TT.frameRank(r), slots[i][0], slots[i][1], rw, rh)) {
          ctx.fillStyle = '#fff';
          ctx.font = TT.font('bold ' + Math.round(rh * 0.95) + 'px');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = Math.max(1, rh * 0.16);
          var g = r === 10 ? 'A' : String(r);
          ctx.strokeText(g, slots[i][0] + rw / 2, slots[i][1] + rh / 2);
          ctx.fillText(g, slots[i][0] + rw / 2, slots[i][1] + rh / 2);
        }
      }

      // 4. element badge, top-right
      var eid = TT.ELEMENT_ID[card.element];
      if (eid) {
        var ew = 64 * s / 256;
        var f = TT.frameElement(eid, 0);
        var ex = s * 0.94 - ew, ey = s * 0.05;
        if (!TT.drawFrame(ctx, TT.img.element, f, ex, ey, ew, ew)) {
          ctx.fillStyle = TT.ELEMENT_COLOR[eid];
          ctx.beginPath(); ctx.arc(ex + ew / 2, ey + ew / 2, ew * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // element tile modifier for a card sitting on a tile
    if (opts.bonus) {
      var bw = 96 * s / 256, bh = 64 * s / 256;
      var bx = (s - bw) / 2, by = (s - bh) / 2;
      if (!TT.drawFrame(ctx, TT.img.bonus, TT.frameBonus(opts.bonus > 0 ? 0 : 1), bx, by, bw, bh)) {
        ctx.fillStyle = opts.bonus > 0 ? COL.good : COL.danger;
        ctx.font = TT.font('bold ' + Math.round(s * 0.28) + 'px');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(opts.bonus > 0 ? '+1' : '−1', s / 2, s / 2);
      }
    }

    if (opts.selected) {
      ctx.strokeStyle = COL.gold; ctx.lineWidth = Math.max(2.5, s * 0.035);
      ctx.shadowColor = COL.gold; ctx.shadowBlur = 16;
      TT.roundRect(ctx, 1, 1, s - 2, s - 2, s * 0.07); ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (opts.ring) {
      ctx.strokeStyle = opts.ring; ctx.lineWidth = Math.max(2, s * 0.025);
      TT.roundRect(ctx, 1, 1, s - 2, s - 2, s * 0.07); ctx.stroke();
    }
    ctx.restore();
  };

  /* Card + name strip, used by the deck builder, the viewer and the reward row.
   * A locked card gives nothing away about ITSELF (the level on the plate is the
   * only hint), but the caller may pass `lockedLabel` / `lockedSub` to say how
   * it is earned — the viewer uses that to name the rival to beat. */
  TT.drawCardTile = function (ctx, card, x, y, size, opts) {
    opts = opts || {};
    TT.drawCard(ctx, card, opts.owner || 'you', x, y, size, opts);
    var labelH = opts.labelH === undefined ? 22 : opts.labelH;
    if (!labelH) return;
    var ly = y + size + 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var nameSize = Math.max(12, Math.min(17, Math.round(size * 0.11)));
    if (opts.locked) {
      if (!opts.lockedLabel) return;
      ctx.font = TT.font('bold ' + nameSize + 'px');
      ctx.fillStyle = COL.gold;
      ctx.fillText(TT.ellipsize(ctx, opts.lockedLabel, size + 8), x + size / 2, ly);
      if (opts.lockedSub) {
        ctx.font = TT.font(Math.max(10, nameSize - 3) + 'px');
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(TT.ellipsize(ctx, opts.lockedSub, size + 8), x + size / 2, ly + nameSize + 2);
      }
      return;
    }
    ctx.font = TT.font('bold ' + nameSize + 'px');
    ctx.fillStyle = '#fff';
    ctx.fillText(TT.ellipsize(ctx, card.name, size + 8), x + size / 2, ly);
    ctx.font = TT.font(Math.max(10, nameSize - 3) + 'px');
    ctx.fillStyle = COL.sub;
    var eid = TT.ELEMENT_ID[card.element];
    ctx.fillText('L' + card.level + (eid ? ' · ' + TT.ELEMENT_LABEL[eid] : ''),
                 x + size / 2, ly + nameSize + 2);
  };

  /* Toast: brief bottom-of-screen message. */
  var toast = null;
  TT.toast = function (msg) { toast = { msg: msg, t0: performance.now() }; };
  TT.hasToast = function () { return !!toast; };
  TT.drawToast = function (ctx, W, H, now) {
    if (!toast) return;
    var age = now - toast.t0;
    if (age > 2000) { toast = null; return; }
    var a = age < 180 ? age / 180 : (age > 1550 ? Math.max(0, 1 - (age - 1550) / 450) : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = TT.font('bold 14px');
    var tw = ctx.measureText(toast.msg).width;
    var w = Math.min(W - 24, tw + 34), h = 38;
    var x = (W - w) / 2, y = H - 74;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    TT.roundRect(ctx, x, y, w, h, 19); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    TT.roundRect(ctx, x, y, w, h, 19); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(toast.msg, W / 2, y + h / 2);
    ctx.restore();
  };

  TT.inBox = function (b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; };
  TT.hit = function (list, x, y) {
    for (var i = list.length - 1; i >= 0; i--) if (TT.inBox(list[i], x, y)) return list[i];
    return null;
  };

  TT.easeOut = function (t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); };

})(window.TT || (window.TT = {}));
