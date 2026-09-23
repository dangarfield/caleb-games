/* make-opponents.js — build the AI opponent roster.
 *
 * A fit has to be legal or the sim will not fight it, and hand-placing eighty
 * modules on a 13x26 hull in a text editor is not a thing anyone should do. This
 * packs a hull greedily against a recipe and checks the result through the game's
 * own Geom.validate, so an opponent that ships is an opponent that flies.
 *
 * This is the seed roster. `editor.html` is where they get tuned by hand, and a
 * smarter generator can replace the packer later — the output format is the
 * contract, not this file.
 *
 *   node tools/make-opponents.js            # writes data/opponents.json
 *   node tools/make-opponents.js --dry      # report only
 */
var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.join(__dirname, '..');
var DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8'));

/* geom.js is a plain script; give it the globals it expects and pull it in. */
var sandbox = { Data: null, console: console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/geom.js'), 'utf8'), sandbox);
var Geom = sandbox.Geom, CAT = sandbox.CAT;

var MODS = DATA.modules, SHIPS = DATA.ships;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pool(pred) {
  var out = [];
  for (var k in MODS) if (pred(MODS[k])) out.push(MODS[k]);
  /* largest first — big modules only fit while the hull is still open */
  out.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  return out;
}

var P = {
  drive:   pool(function (m) { return m.subtype === 'engine' && (m.ep || 0) > 0; }),
  engine:  pool(function (m) { return m.subtype === 'engine'; }),
  reactor: pool(function (m) { return m.subtype === 'reactor'; }),
  armor:   pool(function (m) { return m.subtype === 'armor'; }),
  shield:  pool(function (m) { return m.subtype === 'shield'; }),
  pd:      pool(function (m) { return m.subtype === 'pointdefense'; }),
  repair:  pool(function (m) { return m.subtype === 'repair'; }),
  mine:    pool(function (m) { return m.subtype === 'mine'; }),
  junk:    pool(function (m) { return m.subtype === 'junk'; }),
  warp:    pool(function (m) { return m.subtype === 'warp'; }),
  ab:      pool(function (m) { return m.subtype === 'afterburner'; }),
  ballistic: pool(function (m) { return m.subtype === 'weapon' && m.damageType === 'ballistic'; }),
  missile:   pool(function (m) { return m.subtype === 'weapon' && m.damageType === 'missile'; }),
  laser:     pool(function (m) { return m.subtype === 'weapon' && m.damageType === 'laser'; })
};

/* Place the biggest module from `list` that is legal at col,row. */
function tryPlace(grid, placements, list, col, row, maxCells) {
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (maxCells && m.w * m.h > maxCells) continue;
    if (Geom.canPlace(grid, placements, MODS, m.key, col, row, -1).ok) {
      placements.push({ moduleId: m.key, col: col, row: row });
      return m;
    }
  }
  return null;
}

/* Greedy row-major pack. Engine cells take drives; device cells take whatever
   the recipe still owes, with power kept positive as we go. */
function build(shipKey, recipe, seed) {
  var ship = SHIPS[shipKey], grid = Geom.shipGrid(ship), placements = [];
  var rng = mulberry32(seed);
  var budget = {}, order = [];
  for (var k in recipe.mix) { budget[k] = Math.round(grid.capacity * recipe.mix[k]); order.push(k); }
  /* reactors, then guns, then screens: power has to exist before it is spent,
     and armour is the filler of last resort. */
  var RANK = { reactor: 0, ballistic: 1, missile: 1, laser: 1, shield: 2, armor: 3 };
  order.sort(function (a, b) { return (RANK[a] === undefined ? 2 : RANK[a]) - (RANK[b] === undefined ? 2 : RANK[b]); });

  var r, c;
  /* 1. engines first — engine cells are scarce and nothing else may use them.
        Real drives before vectored thrusters, or a small hull ends up with a
        full engine bay and no thrust. */
  var pass, lists = [P.drive, P.engine];
  for (pass = 0; pass < 2; pass++) {
    for (r = 0; r < grid.h; r++) for (c = 0; c < grid.w; c++) {
      if (!Geom.isEngineCell(grid.cells[r][c])) continue;
      if (Geom.occupancy(placements, MODS)[r * 1000 + c] !== undefined) continue;
      tryPlace(grid, placements, lists[pass], c, r);
    }
  }
  /* 1b. one gun, guaranteed. A fighter hull is twelve cells: a 40% missile
         budget is five of them, the smallest launcher wants six, and the
         recipe's singles had already taken the room — so the Wing came out of
         the packer with no weapon at all and Geom.validate rejected it. Place
         the SMALLEST weapon of the recipe's primary type before anything else
         competes for the space. Everything after this is decoration. */
  var primary = null, best = -1;
  ['ballistic', 'missile', 'laser'].forEach(function (k) {
    if ((recipe.mix[k] || 0) > best) { best = recipe.mix[k] || 0; primary = k; }
  });
  if (primary && best > 0) {
    var smallest = P[primary].slice().reverse();      /* pools are biggest-first */
    outer1: for (var wr = 0; wr < grid.h; wr++) for (var wc = 0; wc < grid.w; wc++) {
      if (grid.cells[wr][wc] === 0 || Geom.isEngineCell(grid.cells[wr][wc])) continue;
      if (tryPlace(grid, placements, smallest, wc, wr)) break outer1;
    }
  }

  /* 2. the named singles — one warp / afterburner / repair / PD if asked for */
  (recipe.singles || []).forEach(function (name) {
    var list = P[name]; if (!list) return;
    outer: for (var rr = 0; rr < grid.h; rr++) for (var cc = 0; cc < grid.w; cc++) {
      if (tryPlace(grid, placements, list, cc, rr)) break outer;
    }
  });
  /* 3. one pass per category, biggest module first, each to its own budget.
        Interleaving categories cell-by-cell was the first attempt and it
        fragmented the hull: a gun pushed power negative, the next cell became a
        reactor, and the flagship ended up carrying twenty of them. A pass per
        category keeps big modules contiguous and the counts sane. */
  for (var oi = 0; oi < order.length; oi++) {
    var kind = order[oi], list = P[kind] || P.armor;
    for (r = 0; r < grid.h; r++) {
      for (c = 0; c < grid.w; c++) {
        if (budget[kind] <= 0) break;
        if (grid.cells[r][c] === 0 || Geom.isEngineCell(grid.cells[r][c])) continue;
        if (Geom.occupancy(placements, MODS)[r * 1000 + c] !== undefined) continue;
        var got = tryPlace(grid, placements, list, c, r, budget[kind]);
        if (got) budget[kind] -= got.w * got.h;
      }
    }
  }
  /* 4. whatever is still open takes armour — an empty cell is a hole in the hull */
  for (r = 0; r < grid.h; r++) for (c = 0; c < grid.w; c++) {
    if (grid.cells[r][c] === 0 || Geom.isEngineCell(grid.cells[r][c])) continue;
    if (Geom.occupancy(placements, MODS)[r * 1000 + c] !== undefined) continue;
    tryPlace(grid, placements, P.armor, c, r);
  }
  /* 5. and if the sums still do not work, trade the smallest plate for a reactor */
  var tries = 0;
  while (Geom.summarise(ship, placements, MODS).power < 0 && tries++ < 60) {
    /* smallest plates first, and put it back if no reactor will fit the hole —
       an earlier version left the cell empty and then span, because removing
       armour does nothing for a power deficit. */
    var cand = [];
    for (var q = 0; q < placements.length; q++) {
      var mm = MODS[placements[q].moduleId];
      if (mm.subtype === 'armor' || mm.subtype === 'shield') cand.push(q);
    }
    cand.sort(function (a, b) {
      var ma = MODS[placements[a].moduleId], mb = MODS[placements[b].moduleId];
      return (ma.w * ma.h) - (mb.w * mb.h);
    });
    var swapped = false;
    for (var ci = 0; ci < cand.length && !swapped; ci++) {
      var slot = placements[cand[ci]], was = MODS[slot.moduleId];
      placements.splice(cand[ci], 1);
      if (tryPlace(grid, placements, P.reactor, slot.col, slot.row, was.w * was.h)) swapped = true;
      else placements.push(slot);              /* no reactor fits — leave it be */
    }
    if (!swapped) break;
  }
  /* 6. last resort: a narrow hull can simply not carry what the recipe asked
        for — the Raven with two big mine launchers came out 10 short with no
        plate left to trade. Shed the hungriest module (never the last weapon,
        reactor or drive) and plate over the hole. */
  tries = 0;
  while (Geom.summarise(ship, placements, MODS).power < 0 && tries++ < 20) {
    var st = Geom.summarise(ship, placements, MODS), worst = -1, worstPu = 0;
    for (var z = 0; z < placements.length; z++) {
      var md = MODS[placements[z].moduleId];
      if (!(md.pu > worstPu)) continue;
      if ((md.c & CAT.WEAPON) && st.weapons <= 1) continue;
      if ((md.c & CAT.REACTOR) || ((md.c & CAT.ENGINE) && (md.ep || 0) > 0)) continue;
      worstPu = md.pu; worst = z;
    }
    if (worst < 0) break;
    var dropped = placements[worst];
    console.log('     dropped ' + MODS[dropped.moduleId].displayName + ' (pu ' + worstPu + ') — hull could not power it');
    placements.splice(worst, 1);
    tryPlace(grid, placements, P.armor, dropped.col, dropped.row,
             MODS[dropped.moduleId].w * MODS[dropped.moduleId].h);
  }
  return { shipId: shipKey, modules: placements };
}

/* ---- the roster ---------------------------------------------------------
   An opponent is a hull and a recipe. Nothing else. There is no behaviour
   block: every ship in the game runs the identical routine in js/sim/ai.js, so
   the ONLY thing that makes one of these harder than the last is what the
   packer bolts onto it. That is the whole design.

   THE ROSTER IS A POOL, NOT A LADDER.
   The old roster was nine hand-picked rungs and the game walked up it. It does
   not any more: a fight is drawn at random from the pool for the tier you are
   flying, so no operation may ever name an opponent and every tier needs enough
   of them that two fights in a row are not the same fight. So the roster is
   generated — five archetypes crossed with the game's seven tiers, each on a
   hull drawn from that tier's own hull list.

   The archetypes are the five shapes a fit can take, and nothing else varies:
     gunline  kinetic broadside, thick plate
     swarm    rockets, and point defence is your problem
     lance    lasers at range, thin and fast
     bulwark  screens, plate and a repair crew
     warship  balanced, with the toys — warp, afterburner, PD

   `node tools/balance.js --rr` still ranks them; what it has to show now is
   that tier strength ASCENDS, not that any particular pair is in order. Two
   opponents inside one tier being close is the point. */

/* The 7-tier map, which is Space Arena's own ship classes cut at this game's
   level boundaries. It must agree with data/progression.json — the generator
   for that reads the same table. */
var TIERS = [
  { n: 1, name: 'Fighter',      lr: [1, 3] },
  { n: 2, name: 'Corvette',     lr: [4, 8] },
  { n: 3, name: 'Frigate',      lr: [9, 15] },
  { n: 4, name: 'Cruiser',      lr: [16, 25] },
  { n: 5, name: 'Battleship',   lr: [26, 36] },
  { n: 6, name: 'Carrier',      lr: [37, 46] },
  { n: 7, name: 'Supercarrier', lr: [47, 53] }
];

/* One name per archetype per tier, so a pool reads as a pool of ships and not
   as "Gunline T4". */
var ARCHETYPES = [
  { key: 'gunline',
    blurb: 'Kinetic broadside with a cutter to open the tins. It will trade with you all day.',
    /* Pure ballistic is hard-countered by armour and shields — the data says so
       in the Chaingun's own description — and a pool of armoured ships is the
       worst room for it. A little laser keeps it in the fight without turning it
       into the lance. */
    mix: { ballistic: 0.35, laser: 0.12, shield: 0.18, armor: 0.15, reactor: 0.20 },
    singles: ['pd'],
    names: ['Patrol Skiff', 'Scrapper', 'Hammerfall', 'Broadside', 'Ironhand', 'Siegewright', 'Anvil of Kesh'] },

  { key: 'swarm',
    blurb: 'Rockets. A great many rockets. Point defence is your friend here.',
    mix: { missile: 0.40, shield: 0.15, armor: 0.20, reactor: 0.25 },
    singles: ['pd'],
    names: ['Hornet', 'Wasp Nest', 'Locust', 'Swarmhost', 'Stormcloud', 'Hive Chorus', 'Nova Swarm'] },

  { key: 'lance',
    blurb: 'Hangs back and picks at you with light. Thin, fast, allergic to a fair fight.',
    mix: { laser: 0.35, armor: 0.25, shield: 0.15, reactor: 0.25 },
    singles: ['ab'],
    names: ['Needle', 'Pinprick', 'Lancer', 'Inquisitor', 'Whitefire', 'Starlance', 'Judgement'] },

  { key: 'bulwark',
    blurb: 'Slow, shielded and patient. It intends to still be there when you are not.',
    mix: { ballistic: 0.30, shield: 0.25, armor: 0.25, reactor: 0.20 },
    singles: ['repair', 'pd'],
    names: ['Shieldbug', 'Bulwark', 'Turtleback', 'Warden', 'Aegis', 'Bastion', 'Immovable'] },

  { key: 'warship',
    blurb: 'A proper warship. Guns, screens, and a repair crew that works fast.',
    mix: { ballistic: 0.25, laser: 0.20, missile: 0.15, shield: 0.20, reactor: 0.20 },
    singles: ['repair', 'pd', 'ab'],
    names: ['Picket', 'Cutter', 'Sentinel', 'Vanguard', 'Champion', 'Sovereign', 'Mjollnir'] }
];

function hullsOfTier(t) {
  var out = [];
  for (var k in SHIPS) {
    var lr = SHIPS[k].lr || 0;
    if (lr >= t.lr[0] && lr <= t.lr[1]) out.push(k);
  }
  out.sort(function (a, b) {
    return (SHIPS[a].lr || 0) - (SHIPS[b].lr || 0) || a.localeCompare(b);
  });
  return out;
}

/* Spread the archetypes across the tier's hulls rather than cycling them, so a
   tier with six hulls shows five different ones instead of the same two.
   The hulls are sorted small-to-large, so a straight i->hull mapping handed the
   first archetype the smallest hull in EVERY tier and the last one the biggest,
   which is a difficulty gradient hiding inside what is supposed to be a pool of
   equals. Rotating by tier breaks that up. */
function hullFor(hulls, i, n, tier) {
  if (!hulls.length) return null;
  var j = (i + (tier || 0)) % n;
  return hulls[Math.min(hulls.length - 1, Math.floor(j * hulls.length / n))];
}

var ROSTER = [];
TIERS.forEach(function (t) {
  var hulls = hullsOfTier(t);
  if (!hulls.length) { console.log('NO HULLS IN TIER ' + t.n); return; }
  ARCHETYPES.forEach(function (a, i) {
    var hull = hullFor(hulls, i, ARCHETYPES.length, t.n);
    ROSTER.push({
      id: a.key + '_t' + t.n,
      name: a.names[t.n - 1] || (a.names[0] + ' ' + t.n),
      hull: hull,
      tier: t.n,
      /* Difficulty is a sort key inside the pool, not a hidden stat — nothing
         in the sim ever reads it. */
      difficulty: (t.n - 1) * ARCHETYPES.length + i + 1,
      seed: t.n * 1009 + i * 97 + 11,
      blurb: a.blurb,
      mix: a.mix,
      singles: a.singles
    });
  });
});

var out = [], bad = 0;
ROSTER.forEach(function (o) {
  if (!SHIPS[o.hull]) { console.log('MISSING HULL ' + o.hull + ' for ' + o.id); bad++; return; }
  var f = build(o.hull, { mix: o.mix, singles: o.singles }, o.seed);
  var v = Geom.validate(SHIPS[o.hull], f.modules, MODS);
  var s = v.stats;
  console.log(
    (v.ok ? 'ok   ' : 'FAIL ') + ('T' + o.tier) + ' ' + o.id.padEnd(13) + o.hull.padEnd(15) +
    String(f.modules.length).padStart(3) + ' mods  ' +
    (s.cellsUsed + '/' + s.capacity).padStart(8) + ' cells  pwr ' +
    String(s.power).padStart(5) + '  wpn ' + String(s.weapons).padStart(2) +
    '  rct ' + s.reactors + '  eng ' + s.engines +
    (v.ok ? '' : '   << ' + v.errors.join('; ')));
  if (!v.ok) bad++;
  /* An opponent's TIER is what the progression system is allowed to ask about
     — never its identity, because fights come from a generated pool. It is the
     tier its hull belongs to, so it cannot disagree with the tier table. */
  out.push({ id: o.id, name: o.name, blurb: o.blurb, difficulty: o.difficulty,
             tier: o.tier, ship: { shipId: f.shipId, modules: f.modules } });
});

/* Every tier has to be fightable, or the game dead-ends at a gate. */
var missing = [];
TIERS.forEach(function (t) {
  var n = out.filter(function (o) { return o.tier === t.n; }).length;
  if (n < 2) missing.push('T' + t.n + ' has ' + n);
});
if (missing.length) { console.log('\nTHIN POOL: ' + missing.join(', ')); bad++; }

if (process.argv.indexOf('--dry') < 0) {
  if (bad) { console.log('\n' + bad + ' invalid — not written'); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, 'data/opponents.json'),
                   JSON.stringify({ version: 2, opponents: out }, null, 1));
  console.log('\nwrote data/opponents.json (' + out.length + ' opponents, ' +
              TIERS.length + ' tiers)');
} else if (bad) { process.exit(1); }
