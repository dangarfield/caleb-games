/* mmm-leaves — achievements.js
   Three bonus goals drawn at the start. Claim one in rounds 1 or 2 and it pays
   the gold figure; after that the tile has flipped to silver and pays less. */

var Achievements = (function () {
  'use strict';

  var POOL = [
    { id: 'row',     title: 'Clean Sweep',   desc: 'Eat 6 circles in one row',     gold: 7, silver: 4,
      test: function (s) { return Board.bestRow(s.board) >= 6; } },
    { id: 'wild',    title: 'Wild Child',    desc: 'Eat 3 wild circles',           gold: 6, silver: 3,
      test: function (s) { return s.stats.wild >= 3; } },
    { id: 'nuts',    title: 'Nut Job',       desc: 'Collect 10 nuts',              gold: 5, silver: 3,
      test: function (s) { return s.tracker.counts[0] >= 10; } },
    { id: 'leaves',  title: 'Leaf It Out',   desc: 'Collect 10 leaves',            gold: 5, silver: 3,
      test: function (s) { return s.tracker.counts[1] >= 10; } },
    { id: 'blossom', title: 'Sweet Tooth',   desc: 'Collect 10 blossoms',          gold: 5, silver: 3,
      test: function (s) { return s.tracker.counts[2] >= 10; } },
    { id: 'edge',    title: 'Edge Walker',   desc: 'Eat 7 circles on the border',  gold: 7, silver: 4,
      test: function (s) { return Board.edgeEaten(s.board) >= 7; } },
    { id: 'triples', title: 'Greedy Guts',   desc: 'Eat three 3-food circles',     gold: 6, silver: 3,
      test: function (s) { return s.stats.triples >= 3; } },
    { id: 'balance', title: 'Balanced Diet', desc: 'Get 6 of every food',          gold: 6, silver: 3,
      test: function (s) { return s.tracker.counts[0] >= 6 && s.tracker.counts[1] >= 6 && s.tracker.counts[2] >= 6; } },
    { id: 'long',    title: 'Long Haul',     desc: 'Eat 16 circles',               gold: 7, silver: 4,
      test: function (s) { return Board.eatenCount(s.board) >= 16; } }
  ];

  var LETTERS = ['A', 'B', 'C'];

  function pick(rand) {
    var bag = POOL.slice();
    var out = [];
    for (var i = 0; i < 3; i++) {
      var j = Math.floor(rand() * bag.length);
      var a = bag.splice(j, 1)[0];
      out.push({
        letter: LETTERS[i], id: a.id, title: a.title, desc: a.desc,
        gold: a.gold, silver: a.silver, test: a.test,
        claimed: false, points: 0, silverSide: false
      });
    }
    return out;
  }

  /* Solo rule from the pad: every tile flips to silver once round 2 is over. */
  function flipToSilver(list) {
    list.forEach(function (a) { if (!a.claimed) a.silverSide = true; });
  }

  /* Check after every turn. Returns the ones claimed this instant. */
  function check(list, state) {
    var won = [];
    list.forEach(function (a) {
      if (a.claimed) return;
      if (a.test(state)) {
        a.claimed = true;
        a.points = a.silverSide ? a.silver : a.gold;
        won.push(a);
      }
    });
    return won;
  }

  function total(list) {
    return list.reduce(function (n, a) { return n + (a.claimed ? a.points : 0); }, 0);
  }

  return { POOL: POOL, pick: pick, flipToSilver: flipToSilver, check: check, total: total };
})();
