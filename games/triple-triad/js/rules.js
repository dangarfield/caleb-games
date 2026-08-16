/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * js/rules.js — move resolution and the opponent AI.
 * resolveMove() is a rewrite of the original CardResult (js/result.js) as a
 * pure function over board POSITIONS instead of mutable card objects; the AI
 * personalities follow the original js/ai.js heuristics.
 */
'use strict';

(function (TT) {

  var TOP = TT.TOP, LEFT = TT.LEFT, RIGHT = TT.RIGHT, BOTTOM = TT.BOTTOM;

  /* The four orthogonal neighbours of a board position, as
   * [rank slot on the source, neighbour position, rank slot it faces]. */
  function neighbours(pos) {
    var out = [];
    if (pos % 3 !== 0) out.push([LEFT, pos - 1, RIGHT]);
    if (pos % 3 !== 2) out.push([RIGHT, pos + 1, LEFT]);
    if (pos > 2) out.push([TOP, pos - 3, BOTTOM]);
    if (pos < 6) out.push([BOTTOM, pos + 3, TOP]);
    return out;
  }
  TT.neighbours = neighbours;

  /* Rank slots of a position that face the edge of the board. */
  function walls(pos) {
    var out = [];
    if (pos % 3 === 0) out.push(LEFT);
    if (pos % 3 === 2) out.push(RIGHT);
    if (pos < 3) out.push(TOP);
    if (pos > 5) out.push(BOTTOM);
    return out;
  }

  /* A card's rank on one side after the element tile under it is applied.
   * Matching element: +1, any other non-neutral element: -1 (never clamped —
   * the original does not clamp either). */
  function effectiveRank(card, pos, slot, els) {
    var r = card.ranks[slot];
    if (els && els[pos]) r += (TT.ELEMENT_ID[card.element] === els[pos]) ? 1 : -1;
    return r;
  }
  TT.effectiveRank = effectiveRank;

  /* The element modifier shown on an occupied tile (+1 / -1 / 0). */
  TT.elementBonus = function (card, pos, els) {
    if (!els || !els[pos]) return 0;
    return (TT.ELEMENT_ID[card.element] === els[pos]) ? 1 : -1;
  };

  /**
   * Resolve placing `card` (owned by `owner`) at `position`.
   * `board` is an array of 9 slots, each null or { card, owner }.
   * `els` is an array of 9 element ids, or null when ELEMENTAL is off.
   * Returns { captured, same, plus, combos, capturedCount } where captured /
   * same / plus / combos hold board POSITIONS. `same` and `plus` are null
   * unless the rule fired; `combos` is an ordered list of chained flip waves.
   */
  TT.resolveMove = function (card, owner, position, board, els, rules) {
    var captured = [];
    var same = rules.SAME ? [] : null;
    var plus = null;
    var combos = [];
    var capturedCount = 0;
    var sums = rules.PLUS ? {} : null;
    var sumOrder = rules.PLUS ? [] : null;
    var elements = rules.ELEMENTAL ? els : null;

    // A snapshot of ownership that COMBO mutates while it simulates chains.
    var owners = null;
    if (rules.COMBO) {
      owners = new Array(9);
      for (var i = 0; i < 9; i++) owners[i] = board[i] ? board[i].owner : null;
    }

    function captures(srcCard, srcPos, srcSlot, srcOwner, tgtPos, tgtSlot, tgtOwner) {
      var tgt = board[tgtPos];
      if (!tgt) return false;
      if (srcOwner === tgtOwner) return false;
      return effectiveRank(srcCard, srcPos, srcSlot, elements) >
             effectiveRank(tgt.card, tgtPos, tgtSlot, elements);
    }

    // ---- per-side results, plus SAME_WALL detection on the border ----------
    var sameWall = false;
    var side = neighbours(position);
    for (var s = 0; s < side.length; s++) {
      var srcSlot = side[s][0], tgtPos = side[s][1], tgtSlot = side[s][2];
      var tgt = board[tgtPos];
      if (!tgt) continue;
      var srcRank = card.ranks[srcSlot];
      var tgtRank = tgt.card.ranks[tgtSlot];
      // SAME and PLUS compare RAW ranks; only capture uses element bonuses.
      if (same && srcRank === tgtRank) same.push(tgtPos);
      if (sums) {
        var sum = srcRank + tgtRank;
        if (!sums[sum]) { sums[sum] = []; sumOrder.push(sum); }
        sums[sum].push(tgtPos);
      }
      if (captures(card, position, srcSlot, owner, tgtPos, tgtSlot, tgt.owner)) captured.push(tgtPos);
    }
    var w = walls(position);
    for (var k = 0; k < w.length; k++) if (card.ranks[w[k]] === 10) sameWall = true;

    if (!captured.length) captured = null;

    // ---- SAME --------------------------------------------------------------
    if (same) {
      var valid = false;
      var minSize = (sameWall && rules.SAME_WALL) ? 1 : 2;
      if (same.length >= minSize) {
        for (var i2 = 0; i2 < same.length; i2++) {
          if (board[same[i2]].owner !== owner) { valid = true; capturedCount++; }
        }
      }
      if (valid) {
        sums = null;                       // SAME wins over PLUS
        captured = filterCaptured(captured, same, owners, owner);
        calcCombo(same);
      } else same = null;
    }

    // ---- PLUS --------------------------------------------------------------
    if (sums) {
      for (var i3 = 0; i3 < sumOrder.length; i3++) {
        var list = sums[sumOrder[i3]];
        if (list.length < 2) continue;
        var ok = false;
        for (var j = 0; j < list.length; j++) {
          if (board[list[j]].owner !== owner) { ok = true; capturedCount++; }
        }
        if (ok) {
          plus = list;
          captured = filterCaptured(captured, plus, owners, owner);
          calcCombo(plus);
          break;
        }
        capturedCount = 0;                 // matches the original's reset
      }
      sums = null;
    }

    if (captured) capturedCount += captured.length;

    /* Drop from `captured` anything already handled by SAME/PLUS, and mark the
     * survivors as flipped on the COMBO ownership snapshot (they flip, but do
     * not themselves start a chain). */
    function filterCaptured(cap, resultList, own, newOwner) {
      if (!cap) return null;
      var out = [];
      for (var i = 0; i < cap.length; i++) {
        if (resultList.indexOf(cap[i]) !== -1) continue;
        if (own) own[cap[i]] = newOwner;
        out.push(cap[i]);
      }
      return out.length ? out : null;
    }

    /* SAME/PLUS victims now attack their own neighbours; each wave is pushed
     * onto `combos` and chains until nothing new flips. */
    function calcCombo(resultList) {
      if (!owners) return;
      for (var i = 0; i < resultList.length; i++) owners[resultList[i]] = owner;
      var hit = {};
      var any = false;
      for (var i2 = 0; i2 < resultList.length; i2++) {
        var pos = resultList[i2];
        if (board[pos].owner === owner) continue;   // was already ours
        var c = board[pos].card;
        var ns = neighbours(pos);
        for (var n = 0; n < ns.length; n++) {
          var np = ns[n][1];
          if (captures(c, pos, ns[n][0], owners[pos], np, ns[n][2], owners[np])) {
            if (!hit[np]) { hit[np] = true; any = true; capturedCount++; }
          }
        }
      }
      if (!any) return;
      var wave = Object.keys(hit).map(Number);
      combos.push(wave);
      calcCombo(wave);
    }

    return {
      captured: captured, same: same, plus: plus, combos: combos,
      capturedCount: capturedCount
    };
  };

  /* =========================================================== the opponent
   * Four personalities from the original ai.js.  Each returns
   * { index, position } — which card in `hand` to play and where.
   * `hand` is an array of card records; `owner` is the AI's owner tag.
   */

  function emptySpaces(board) {
    var out = [];
    for (var i = 0; i < 9; i++) if (!board[i]) out.push(i);
    return out;
  }

  /* How exposed a card would be at a position:
   * (10 * open sides) - sum(ranks on those sides), element-adjusted. Higher
   * means more vulnerable, so the AI minimises it. */
  function rankDiff(card, position, board, els) {
    var total = 0, sides = 0;
    var ns = neighbours(position);
    for (var i = 0; i < ns.length; i++) {
      if (!board[ns[i][1]]) { total += card.ranks[ns[i][0]]; sides++; }
    }
    if (els && els[position]) {
      total += ((TT.ELEMENT_ID[card.element] === els[position]) ? 1 : -1) * sides;
    }
    return Math.max(sides * 10 - total, 0);
  }

  function boardRankDiff(board, els, owner) {
    var total = 0;
    for (var i = 0; i < 9; i++) {
      if (board[i] && board[i].owner === owner) total += rankDiff(board[i].card, i, board, els);
    }
    return total;
  }

  /* Exposure the AI already has pointing INTO `position` from its own cards —
   * filling that square removes it, so it is subtracted. */
  function sideRankDiff(position, board, els, owner) {
    var total = 0, sides = 0;
    var ns = neighbours(position);
    for (var i = 0; i < ns.length; i++) {
      var np = ns[i][1], slot = ns[i][2];
      var slotCard = board[np];
      if (!slotCard || slotCard.owner !== owner) continue;
      total += slotCard.card.ranks[slot];
      if (els && els[np]) total += (TT.ELEMENT_ID[slotCard.card.element] === els[np]) ? 1 : -1;
      sides++;
    }
    return sides * 10 - total;
  }

  function useMinRankDiff(hand, board, els, owner, spaces) {
    var base = boardRankDiff(board, els, owner);
    var best = null, bestVal = Infinity, bestLevel = -1;
    // Hold the strong cards back, except when going second on the last turn.
    var lowest = (spaces.length % 2 > 0) || hand.length !== 2;
    for (var i = 0; i < spaces.length; i++) {
      var sp = spaces[i];
      var side = sideRankDiff(sp, board, els, owner);
      for (var h = 0; h < hand.length; h++) {
        var c = hand[h];
        var val = base + rankDiff(c, sp, board, els) - side;
        var better = val < bestVal ||
          (val === bestVal && (lowest ? c.level < bestLevel : c.level > bestLevel));
        if (better) { bestVal = val; bestLevel = c.level; best = { index: h, position: sp }; }
      }
    }
    return best;
  }

  var PERSONALITY = {
    /* Plays anywhere. Used for the tutorial and the first real rival. */
    random: function (ctx) {
      var spaces = emptySpaces(ctx.board);
      return {
        index: Math.floor(Math.random() * ctx.hand.length),
        position: spaces[Math.floor(Math.random() * spaces.length)]
      };
    },

    /* Grabs the most cards it can, with the cheapest card that manages it. */
    offensive: function (ctx) {
      var spaces = emptySpaces(ctx.board);
      var lowest = (spaces.length % 2 > 0) || ctx.hand.length !== 2;
      var best = null, maxCap = -1, bestLevel = -1;
      for (var i = 0; i < spaces.length; i++) {
        for (var h = 0; h < ctx.hand.length; h++) {
          var c = ctx.hand[h];
          var n = TT.resolveMove(c, ctx.owner, spaces[i], ctx.board, ctx.els, ctx.rules).capturedCount;
          var better = n > maxCap ||
            (n === maxCap && (lowest ? c.level < bestLevel : c.level > bestLevel));
          if (better) { maxCap = n; bestLevel = c.level; best = { index: h, position: spaces[i] }; }
        }
      }
      if (maxCap === 0) best = useMinRankDiff(ctx.hand, ctx.board, ctx.els, ctx.owner, spaces) || best;
      return best;
    },

    /* Ignores captures; just parks cards where they are hardest to flip. */
    defensive: function (ctx) {
      return useMinRankDiff(ctx.hand, ctx.board, ctx.els, ctx.owner, emptySpaces(ctx.board));
    },

    /* Weighs captures against exposure, and loosens up when behind. */
    balanced: function (ctx) {
      var spaces = emptySpaces(ctx.board);
      var lowest = (spaces.length % 2 > 0) || ctx.hand.length !== 2;
      var losing = ctx.thisScore < ctx.thatScore;
      var best = null, maxCap = -1, bestDiff = 41, bestLevel = -1;
      for (var i = 0; i < spaces.length; i++) {
        for (var h = 0; h < ctx.hand.length; h++) {
          var c = ctx.hand[h];
          var n = TT.resolveMove(c, ctx.owner, spaces[i], ctx.board, ctx.els, ctx.rules).capturedCount;
          var diff = rankDiff(c, spaces[i], ctx.board, ctx.els);
          var ok = false;
          if (maxCap === -1) ok = true;
          else if (n > maxCap) ok = (n > 2 || bestDiff - diff > -5 || losing);
          else if (n === maxCap) {
            ok = diff < bestDiff ||
              (diff === bestDiff && (lowest ? c.level < bestLevel : c.level > bestLevel));
          } else if (n === maxCap - 1 && !losing) ok = (bestDiff - diff > 5);
          if (ok) {
            maxCap = n; bestDiff = diff; bestLevel = c.level;
            best = { index: h, position: spaces[i] };
          }
        }
      }
      if (maxCap === 0 && spaces.length !== 9) {
        best = useMinRankDiff(ctx.hand, ctx.board, ctx.els, ctx.owner, spaces) || best;
      }
      return best;
    }
  };

  /** Pick the AI's move. Falls back to a legal random move if a heuristic
   *  somehow returns nothing, so a turn can never stall. */
  TT.aiMove = function (kind, hand, board, els, rules, owner, thisScore, thatScore) {
    var ctx = {
      hand: hand, board: board, rules: rules, owner: owner,
      els: rules.ELEMENTAL ? els : null,
      thisScore: thisScore, thatScore: thatScore
    };
    var fn = PERSONALITY[kind] || PERSONALITY.balanced;
    var mv = null;
    try { mv = fn(ctx); } catch (e) { mv = null; }
    if (!mv || mv.position === undefined || mv.position === null || board[mv.position]) {
      mv = PERSONALITY.random(ctx);
    }
    return mv;
  };

  /* Deck-builder auto-pick: strongest five owned cards. Total rank drives it,
   * with a nudge toward 10s because they trigger Same Wall and are unbeatable
   * on that side. */
  TT.cardPower = function (card) {
    var tens = 0;
    for (var i = 0; i < 4; i++) if (card.ranks[i] === 10) tens++;
    return TT.rankSum(card) + tens * 1.5;
  };
  TT.bestFive = function (ownedIds) {
    return ownedIds.slice()
      .map(function (id) { return TT.CARD_BY_ID[id]; })
      .filter(Boolean)
      .sort(function (a, b) {
        var d = TT.cardPower(b) - TT.cardPower(a);
        if (d) return d;
        return b.level - a.level || a.id - b.id;
      })
      .slice(0, 5)
      .map(function (c) { return c.id; });
  };

  /* An opponent's five cards for a tier: graded levels from TT.handLevels,
   * random picks inside each level, never a duplicate. */
  TT.buildOpponentHand = function (opponent) {
    if (opponent.tier === 0) return TT.TUTORIAL_HAND.slice();
    var want = TT.handLevels(opponent.tier);
    var used = {}, out = [];
    want.forEach(function (lvl) {
      for (var d = 0; d <= TT.MAX_LEVEL; d++) {
        var tries = [lvl - d, lvl + d];
        for (var t = 0; t < tries.length; t++) {
          var pool = (TT.CARDS_BY_LEVEL[tries[t]] || []).filter(function (c) { return !used[c.id]; });
          if (pool.length) {
            var pick = pool[Math.floor(Math.random() * pool.length)];
            used[pick.id] = true; out.push(pick.id);
            return;
          }
        }
      }
    });
    return out;
  };

  /* Reward candidates the player does not own, in a deliberately NARROW band: a
   * rival hands out cards of their OWN level, plus a taste of the level above.
   *
   *   - level `tier` (clamped to 1..MAX_LEVEL) is the rival's own level, and is
   *     always in the band;
   *   - level `tier + 1` is the stretch prize, and it dries up once the player
   *     already owns TT.STRETCH_OWNED_CAP of that level (so a level-4 rival stops
   *     giving level 5s after four of them);
   *   - nothing BELOW the rival's level is offered: farming Selphie can never
   *     fill a level-9 gap, and a level-8 rival never hands back level 2s.
   *
   * Highest allowed level first.  The band is never widened in either direction:
   * when nothing in it is missing the caller shows "beat a tougher rival"
   * instead of handing out a card this rival has no business giving.
   */
  TT.rewardLevels = function (tier, owned) {
    var top = Math.max(1, Math.min(TT.MAX_LEVEL, tier));
    var levels = [];
    var stretch = Math.min(TT.MAX_LEVEL, top + 1);
    if (stretch > top) {
      var have = 0;
      (TT.CARDS_BY_LEVEL[stretch] || []).forEach(function (c) { if (owned[c.id]) have++; });
      if (have < TT.STRETCH_OWNED_CAP) levels.push(stretch);
    }
    levels.push(top);
    return levels;
  };
  /* The same band, in words a seven-year-old can act on: "Win Level 3 cards and
   * some Level 4".  Derived from TT.rewardLevels above (with an empty collection,
   * i.e. the widest the band ever gets) so the promise on the rival list can
   * never drift from what the reward screen actually offers. */
  TT.rewardBandText = function (tier) {
    var levels = TT.rewardLevels(tier, {});
    var top = Math.max(1, Math.min(TT.MAX_LEVEL, tier));
    var stretch = levels.indexOf(top + 1) >= 0 ? top + 1 : 0;
    return 'Win Level ' + top + ' cards' + (stretch ? ' and some Level ' + stretch : '');
  };

  TT.rewardChoices = function (tier, owned) {
    var levels = TT.rewardLevels(tier, owned);
    var out = [];
    for (var b = 0; b < levels.length && out.length < TT.REWARD_COUNT; b++) {
      var pool = (TT.CARDS_BY_LEVEL[levels[b]] || []).filter(function (c) { return !owned[c.id]; });
      // shuffle the level so repeat wins do not always offer the same card
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      for (var p = 0; p < pool.length && out.length < TT.REWARD_COUNT; p++) out.push(pool[p].id);
    }
    return out;
  };

  /* Has this rival nothing left to give?  Asked of the very same function that
   * hands the prizes out, so the "all cards won" badge on the rival list cannot
   * disagree with the reward screen. */
  TT.rewardExhausted = function (tier, owned) {
    return TT.rewardChoices(tier, owned).length === 0;
  };

})(window.TT || (window.TT = {}));
