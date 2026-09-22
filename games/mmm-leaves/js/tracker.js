/* mmm-leaves — tracker.js
   The meal tracker: three columns of fifteen, filled top down. Some cells carry
   four arrows; filling one of those buys an extra move. Scoring lives here too. */

var Tracker = (function () {
  'use strict';

  var COLS = ['nut', 'leaf', 'blossom'];
  var ROWS = 15;

  /* The printed sheet staggers its four-arrow cells down the three columns.
     [row, column] pairs, zero based. */
  var ARROW_CELLS = [[2, 0], [4, 1], [6, 2], [8, 0], [10, 1], [12, 2]];

  function hasArrows(row, col) {
    for (var i = 0; i < ARROW_CELLS.length; i++) {
      if (ARROW_CELLS[i][0] === row && ARROW_CELLS[i][1] === col) return true;
    }
    return false;
  }

  function create() {
    return { counts: [0, 0, 0], rounds: [null, null, null] };
  }

  function colIndex(kind) { return COLS.indexOf(kind); }

  /* Fill n cells of one food. A full column of fifteen takes no more.
     Returns {cells:[{row,col}], extras:n} — extras are the arrow cells hit. */
  function add(tr, kind, n) {
    var ci = colIndex(kind);
    var cells = [], extras = 0;
    if (ci < 0) return { cells: cells, extras: 0 };
    for (var i = 0; i < n; i++) {
      if (tr.counts[ci] >= ROWS) break;
      var row = tr.counts[ci];
      tr.counts[ci]++;
      cells.push({ row: row, col: ci });
      if (hasArrows(row, ci)) extras++;
    }
    return { cells: cells, extras: extras };
  }

  function isFull(tr, kind) { return tr.counts[colIndex(kind)] >= ROWS; }

  /* A meal is one nut, one leaf and one blossom: the lowest row where all
     three columns are filled, which is simply the smallest column count. */
  function meals(tr) { return Math.min(tr.counts[0], tr.counts[1], tr.counts[2]); }

  function bankRound(tr, roundIndex) {
    tr.rounds[roundIndex] = meals(tr);
    return tr.rounds[roundIndex];
  }

  function columnBonus(tr) {
    var full = 0;
    for (var i = 0; i < 3; i++) if (tr.counts[i] >= ROWS) full++;
    return { full: full, points: full * 3 };
  }

  function roundTotal(tr) {
    return (tr.rounds[0] || 0) + (tr.rounds[1] || 0) + (tr.rounds[2] || 0);
  }

  function finalScore(tr, achievementPoints) {
    return roundTotal(tr) + columnBonus(tr).points + (achievementPoints || 0);
  }

  /* The rank ladder replaces the printed solo score scale. */
  /* Steps of 5 up to 40. Set from simulation rather than feel: across ~13,000
     simulated games the standard deviation was ~5.8 at every human-like skill
     level, and 40 is about the 95th percentile of a decent kid's play — roughly
     one game in seventeen now, one in nine once they are good. The structural
     ceiling is 50 (about 26 meals, 3 for a full column, at most 21 from three
     achievements), so a top rung of 40 still leaves headroom for a blinder.
     See research/sim.js. */
  var RANKS = [
    { min: 0,  name: 'Bark Nibbler',       blurb: 'You had a chew. It counts.' },
    { min: 5,  name: 'Sap Sipper',         blurb: 'A taste for the good stuff.' },
    { min: 10, name: 'Leaf Rustler',       blurb: 'The tree has noticed you.' },
    { min: 15, name: 'Blossom Bandit',     blurb: 'Nothing pink is safe.' },
    { min: 20, name: 'Gum Glutton',        blurb: 'Three square meals and then some.' },
    { min: 25, name: 'Midnight Muncher',   blurb: 'The bark never sleeps, and nor do you.' },
    { min: 30, name: 'Moonlit Moth',       blurb: 'You ate your way to the wings.' },
    { min: 35, name: 'Emperor of the Bark', blurb: 'The whole trunk answers to you.' },
    { min: 40, name: 'Ghost of the Scribbly Gum', blurb: 'They still tell stories about the scribbles.' }
  ];

  function rank(score) {
    var out = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) out = RANKS[i];
    return out;
  }

  function nextRank(score) {
    for (var i = 0; i < RANKS.length; i++) if (score < RANKS[i].min) return RANKS[i];
    return null;
  }

  return {
    COLS: COLS, ROWS: ROWS, ARROW_CELLS: ARROW_CELLS, RANKS: RANKS,
    hasArrows: hasArrows, create: create, add: add, isFull: isFull,
    meals: meals, bankRound: bankRound, columnBonus: columnBonus,
    roundTotal: roundTotal, finalScore: finalScore, rank: rank, nextRank: nextRank,
    colIndex: colIndex
  };
})();
