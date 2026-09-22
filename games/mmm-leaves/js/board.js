/* mmm-leaves — board.js
   The tree. Rebuilt to match the printed Kuringgai sheet, which was measured off
   the rules PDF circle by circle (see research/printed-board.json):

     8 x 8 grid, 64 circles
     the four centre circles are the nest — pre-eaten, no food, and NOT joined
       to each other; each has exactly two printed lines leading out
     92 of the 112 possible orthogonal lines are printed, so 20 neighbours are
       not joined at all — that sparseness is what makes the paper game tight
     14 dotted trails, each joining two circles that are NOT neighbours,
       usually a knight's move apart
     food: per type 13 singles, 3 doubles and 1 triple — 22 items each — plus
       9 wild circles

   Boards are generated per game to the same recipe rather than reprinting the
   one sheet, so the boys are not memorising a fixed layout. Pure model, no
   drawing, no DOM. */

var Board = (function () {
  'use strict';

  var N = 8;
  var KINDS = ['nut', 'leaf', 'blossom'];
  var NEST = [[3, 3], [3, 4], [4, 3], [4, 4]];
  var LINKS_TARGET = 92;          // of 112 possible
  var DOTTED_TARGET = 14;
  /* the shapes the printed trails take, as (dRow, dCol) with signs applied
     later — 8 knight moves, 2 straight twos, 2 straight threes, 1 long knight */
  var DOTTED_SHAPES = [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [1, 2],
                       [0, 2], [0, 2], [0, 3], [0, 3], [1, 3], [2, 1]];

  function key(r, c) { return r + ',' + c; }
  function edgeKey(r1, c1, r2, c2) {
    return (r1 < r2 || (r1 === r2 && c1 <= c2))
      ? r1 + ',' + c1 + '|' + r2 + ',' + c2
      : r2 + ',' + c2 + '|' + r1 + ',' + c1;
  }
  function inBounds(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function isNest(r, c) {
    for (var i = 0; i < NEST.length; i++) if (NEST[i][0] === r && NEST[i][1] === c) return true;
    return false;
  }

  /* mulberry32 — small seeded PRNG so a board can be replayed from its seed */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------------- food ---------------- */

  function dealFood(rand) {
    /* Exactly the printed mix. Dealt from a bag, never rolled per cell: an
       independent roll clumps, and a tree with no nuts in it cannot make a meal. */
    var bag = [];
    KINDS.forEach(function (k) {
      for (var i = 0; i < 13; i++) bag.push({ kind: k, count: 1 });
      for (var j = 0; j < 3; j++)  bag.push({ kind: k, count: 2 });
      bag.push({ kind: k, count: 3 });
    });
    for (var w = 0; w < 9; w++) bag.push({ kind: 'wild', count: 1 });
    shuffle(bag, rand);

    var cells = [], bi = 0;
    for (var r = 0; r < N; r++) {
      cells[r] = [];
      for (var c = 0; c < N; c++) {
        if (isNest(r, c)) { cells[r][c] = { kind: 'nest', count: 0 }; continue; }
        cells[r][c] = bag[bi++] || { kind: 'leaf', count: 1 };
      }
    }
    return cells;
  }

  /* ---------------- printed lines ---------------- */

  function allOrthEdges() {
    var e = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (c < N - 1) e.push([r, c, r, c + 1]);
      if (r < N - 1) e.push([r, c, r + 1, c]);
    }
    return e;                                   // 112 of them
  }

  function degrees(links) {
    var d = {};
    Object.keys(links).forEach(function (k) {
      var p = k.split('|');
      d[p[0]] = (d[p[0]] || 0) + 1;
      d[p[1]] = (d[p[1]] || 0) + 1;
    });
    return d;
  }

  function connected(links) {
    var seen = {}, stack = ['0,0'], n = 0;
    var adj = {};
    Object.keys(links).forEach(function (k) {
      var p = k.split('|');
      (adj[p[0]] = adj[p[0]] || []).push(p[1]);
      (adj[p[1]] = adj[p[1]] || []).push(p[0]);
    });
    while (stack.length) {
      var v = stack.pop();
      if (seen[v]) continue;
      seen[v] = true; n++;
      (adj[v] || []).forEach(function (w) { if (!seen[w]) stack.push(w); });
    }
    return n === N * N;
  }

  function buildLinks(rand) {
    var links = {};
    allOrthEdges().forEach(function (e) { links[edgeKey(e[0], e[1], e[2], e[3])] = true; });

    /* The nest block is never joined to itself on the printed sheet — the moth
       sits in the hole between the four circles. */
    delete links[edgeKey(3, 3, 3, 4)];
    delete links[edgeKey(4, 3, 4, 4)];
    delete links[edgeKey(3, 3, 4, 3)];
    delete links[edgeKey(3, 4, 4, 4)];

    /* Each nest circle keeps exactly two ways out, as printed: it has three
       outward neighbours, so one of the three goes. */
    NEST.forEach(function (nc) {
      var r = nc[0], c = nc[1];
      var out = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(function (p) {
        return inBounds(p[0], p[1]) && !isNest(p[0], p[1]);
      });
      shuffle(out, rand);
      while (out.length > 2) {
        var drop = out.pop();
        delete links[edgeKey(r, c, drop[0], drop[1])];
      }
    });

    /* Thin the rest down to the printed count, but never strand a circle (every
       one keeps at least two lines) and never split the tree in two. */
    var pool = Object.keys(links).filter(function (k) {
      var p = k.split('|');
      return !(isNest(+p[0].split(',')[0], +p[0].split(',')[1]) ||
               isNest(+p[1].split(',')[0], +p[1].split(',')[1]));
    });
    shuffle(pool, rand);

    var guard = 0;
    while (Object.keys(links).length > LINKS_TARGET && pool.length && guard++ < 4000) {
      var k = pool.pop();
      var p = k.split('|');
      var d = degrees(links);
      if ((d[p[0]] || 0) <= 2 || (d[p[1]] || 0) <= 2) continue;
      delete links[k];
      if (!connected(links)) links[k] = true;
    }
    return links;
  }

  /* ---------------- dotted trails ---------------- */

  function buildDotted(rand, links) {
    var dotted = {}, list = [], used = {};
    var shapes = shuffle(DOTTED_SHAPES.slice(), rand);

    shapes.forEach(function (sh) {
      for (var attempt = 0; attempt < 200; attempt++) {
        var dr = sh[0] * (rand() < 0.5 ? -1 : 1);
        var dc = sh[1] * (rand() < 0.5 ? -1 : 1);
        if (rand() < 0.5) { var t = dr; dr = dc; dc = t; }
        var r1 = Math.floor(rand() * N), c1 = Math.floor(rand() * N);
        var r2 = r1 + dr, c2 = c1 + dc;
        if (!inBounds(r2, c2)) continue;
        if (isNest(r1, c1) || isNest(r2, c2)) continue;      // the nest has no trails
        var ek = edgeKey(r1, c1, r2, c2);
        if (used[ek] || links[ek]) continue;
        used[ek] = true;
        dotted[ek] = true;
        list.push({ r1: r1, c1: c1, r2: r2, c2: c2 });
        return;
      }
    });
    return { map: dotted, list: list };
  }

  /* ---------------- assembly ---------------- */

  function create(seed) {
    var rand = rng(seed);
    var cells = dealFood(rand);
    var links = buildLinks(rand);
    var dot = buildDotted(rand, links);

    var filled = {};
    NEST.forEach(function (nc) { filled[key(nc[0], nc[1])] = true; });

    return {
      N: N, seed: seed,
      cells: cells,
      links: links,                    // printed solid lines, by edgeKey
      dotted: dot.map,                 // printed dotted trails, by edgeKey
      dottedList: dot.list,            // same, ordered, for drawing
      filled: filled,
      drawn: {},                       // lines the moth has already tunnelled
      lines: [],                       // ordered, for redraw
      nest: NEST,
      start: { r: 3.5, c: 3.5 },       // the hole the moth starts in
      moth: { r: 3.5, c: 3.5 }
    };
  }

  function isFilled(b, r, c) { return !!b.filled[key(r, c)]; }
  function hasLink(b, r1, c1, r2, c2) { return !!b.links[edgeKey(r1, c1, r2, c2)]; }

  var DIRS = {
    left:  [[0, -1]],
    right: [[0,  1]],
    up:    [[-1, 0]],
    down:  [[1,  0]],
    leftright: [[0, -1], [0, 1]],
    updown:    [[-1, 0], [1, 0]]
  };

  /* Every legal move for this tile: tunnel from a circle already eaten, along a
     printed line, into a circle not yet eaten. */
  function legalMoves(b, tile) {
    var out = [], seen = {};

    function push(r1, c1, r2, c2, dot) {
      if (!inBounds(r2, c2)) return;
      if (!isFilled(b, r1, c1)) return;
      if (isFilled(b, r2, c2)) return;
      var ek = edgeKey(r1, c1, r2, c2);
      if (!dot && !b.links[ek]) return;          // no printed line, no move
      if (dot && !b.dotted[ek]) return;
      if (b.drawn[ek]) return;
      var k = r2 + ',' + c2 + (dot ? 'd' : '');
      if (seen[k]) return;
      seen[k] = true;
      out.push({ r1: r1, c1: c1, r2: r2, c2: c2, dot: !!dot });
    }

    if (tile === 'dotted') {
      b.dottedList.forEach(function (d) {
        push(d.r1, d.c1, d.r2, d.c2, true);
        push(d.r2, d.c2, d.r1, d.c1, true);
      });
      return out;
    }

    var deltas = DIRS[tile] || [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (!isFilled(b, r, c)) continue;
      for (var i = 0; i < deltas.length; i++) {
        push(r, c, r + deltas[i][0], c + deltas[i][1], false);
      }
    }
    return out;
  }

  /* An extra move goes any direction except along a dotted trail. */
  function extraMoves(b) {
    var seen = {}, uniq = [];
    ['left', 'right', 'up', 'down'].forEach(function (d) {
      legalMoves(b, d).forEach(function (m) {
        var k = m.r2 + ',' + m.c2;
        if (!seen[k]) { seen[k] = true; uniq.push(m); }
      });
    });
    return uniq;
  }

  function apply(b, m) {
    b.filled[key(m.r2, m.c2)] = true;
    b.drawn[edgeKey(m.r1, m.c1, m.r2, m.c2)] = true;
    b.lines.push({ r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2, dot: m.dot });
    b.moth.r = m.r2; b.moth.c = m.c2;
    return b.cells[m.r2][m.c2];
  }

  function eatenCount(b) {
    var n = 0;
    Object.keys(b.filled).forEach(function (k) {
      var p = k.split(','); if (!isNest(+p[0], +p[1])) n++;
    });
    return n;
  }

  /* How many circles are eaten in the fullest single row. */
  function bestRow(b) {
    var best = 0;
    for (var r = 0; r < N; r++) {
      var n = 0;
      for (var c = 0; c < N; c++) if (isFilled(b, r, c) && !isNest(r, c)) n++;
      if (n > best) best = n;
    }
    return best;
  }

  function edgeEaten(b) {
    var n = 0;
    Object.keys(b.filled).forEach(function (k) {
      var p = k.split(','), r = +p[0], c = +p[1];
      if (isNest(r, c)) return;
      if (r === 0 || c === 0 || r === N - 1 || c === N - 1) n++;
    });
    return n;
  }

  return {
    N: N, KINDS: KINDS, NEST: NEST,
    create: create, key: key, edgeKey: edgeKey, isNest: isNest, inBounds: inBounds,
    isFilled: isFilled, hasLink: hasLink,
    legalMoves: legalMoves, extraMoves: extraMoves, apply: apply,
    eatenCount: eatenCount, bestRow: bestRow, edgeEaten: edgeEaten, rng: rng
  };
})();
