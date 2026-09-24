/* make-progression.js — build the unlock ladder, as data and as a document.
 *
 *   node tools/make-progression.js            # the markdown table
 *   node tools/make-progression.js --json     # …and data/progression.json
 *
 * THE LADDER IS A HUNDRED LEVELS AND THE ROSTER IS SPREAD OVER IT. The source
 * data's own required level is not the ladder: it runs 1-60 with the items
 * bunched at the bottom, so using it directly gave a crowded early game and a
 * tail that was nothing but hulls. Here the source level only decides ORDER.
 * Position in that order decides the level, so the reward rate is flat from
 * start to finish — a little over one thing per level, the whole way.
 *
 * Nothing here is a list of names. Every rule below reads the roster.
 */
var D = require('./load').data();
var OPS = require('./operations.json');

/* You start on level 1, and every operation is worth exactly one level, so the
   ladder is as long as the operations make it. */
var LEVELS = OPS.length + 1;

/* TIER NAMES ARE SPACE ARENA'S OWN SHIP CLASSES, in the source's tier order.
   Which tiers exist and what is in them comes from the ship data — this is only
   the naming, and a tier the data has beyond this list keeps its number. */
var TIER_NAMES = ['Fighter', 'Corvette', 'Frigate', 'Cruiser',
                  'Battleship', 'Carrier', 'Supercarrier', 'Galactic Carrier'];

/* ---- what there is to give -----------------------------------------------
   Everything — but a REWORK IS NOT AN ITEM OF ITS OWN on this ladder. It is a
   second edition of something, so it arrives a fixed distance behind the thing
   it reworks: v2 five levels after its base, v3 ten.

   It used to take its place in the source order like anything else, and the
   source has no opinion: nine Black Market reworks carry `requiredLevel: 0`,
   which sorted them to the very front and put them in the starting kit — a
   level-1 pilot flying a Railgun v2 twenty levels before the Railgun, and a
   Bunker Shield twenty-six before the shield it upgrades. There was a check
   for exactly that, but it keyed on `visible` (0/1/2) instead of
   `modification`, and it waved `visible: 2` through as "the data's choice".
   The data has no choice to make here; the ladder does.

   So variants are pulled out of the spread entirely, the spread runs on
   everything else — which keeps the drip flat and every level occupied — and
   each variant is then placed against its own base. No name is matched and no
   level is written down: a rework is anything with a `modification`, its base
   is the module of the same `displayName` without one, and a v4 added to the
   data tomorrow would slot in behind its base with nothing changed here. */
var ships = D.shipList.slice();
var mods  = Object.keys(D.modules).map(function (k) { return D.modules[k]; });

function src(x) { return (x.kind === 'ship' ? x.rec.requiredLevelSource : x.rec.requiredLevel) || 0; }

/* Which of the three module families a module belongs to, so the ordering can
   rotate through them and not hand over three plates in a row. A hull is its
   own family because a hull is the headline reward. */
function family(rec, kind) {
  if (kind === 'ship') return 'hull';
  if (rec.subtype === 'weapon') return 'weapon';
  if (rec.subtype === 'armor' || rec.subtype === 'shield' ||
      rec.subtype === 'pointdefense') return 'defence';
  return 'utility';
}

var items = [];
ships.forEach(function (s) { items.push({ kind: 'ship', key: s.key, rec: s, fam: 'hull' }); });
mods.forEach(function (m)  { items.push({ kind: 'module', key: m.key, rec: m, fam: family(m, 'module') }); });
items.forEach(function (x) { x.src = src(x); });

/* ---- reworks and the modules they rework ---------------------------------
   `modification` is the source's own field for this — "" for an original,
   BM.1 for the second edition, BM.2 for the third. `visible` is a different
   field that happens to correlate, and reading it for this is the bug above. */
var VAR_GAP = { 'BM.1': 5, 'BM.2': 10 };
var BASE_OF = {};                       /* displayName -> the original's key  */
mods.forEach(function (m) { if (!m.modification) BASE_OF[m.displayName] = m.key; });

function reworkGap(rec) {
  if (!rec || !rec.modification) return 0;
  if (!BASE_OF[rec.displayName]) return 0;     /* orphan: no original to trail */
  return VAR_GAP[rec.modification] || 0;
}

var VARIANTS = items.filter(function (x) { return reworkGap(x.rec) > 0; });
var PLAIN    = items.filter(function (x) { return reworkGap(x.rec) === 0; });

/* ---- level 1: the starting kit -------------------------------------------
   Whatever the source gates at or below the ladder's first level. In the
   current data that is a hull, a gun, a plate, an engine, a reactor and the
   Black Market pieces the game gives away — enough to fly and fight at once. */
var FIRST = PLAIN.filter(function (x) { return x.src <= 1; });
var REST  = PLAIN.filter(function (x) { return x.src > 1; });

/* ---- the order ------------------------------------------------------------
   Source level is the spine: nothing ever arrives before something the source
   gates earlier. Within one source level a hull leads, then the family rotates
   so two of a kind do not arrive back to back, then the smaller piece first. */
var FAM_ORDER = { hull: 0, weapon: 1, defence: 2, utility: 3 };

function order(list) {
  var by = {}, out = [], last = null;
  list.forEach(function (x) { (by[x.src] = by[x.src] || []).push(x); });
  Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).forEach(function (lv) {
    var pool = by[lv].sort(function (a, b) {
      return FAM_ORDER[a.fam] - FAM_ORDER[b.fam] ||
             (a.rec.visible || 0) - (b.rec.visible || 0) ||
             area(a) - area(b) ||
             a.rec.displayName.localeCompare(b.rec.displayName);
    });
    while (pool.length) {
      var i = 0;
      while (i < pool.length && pool[i].fam === last) i++;
      if (i === pool.length) i = 0;
      last = pool[i].fam;
      out.push(pool.splice(i, 1)[0]);
    }
  });
  return out;
}
function area(x) { return x.kind === 'ship' ? 0 : x.rec.width * x.rec.height; }

var ordered = order(REST);

/* The last hull in the roster is the prize, so it is the last thing handed
   over — whichever hull that turns out to be. */
var prize = ordered.filter(function (x) { return x.kind === 'ship'; }).pop();
if (prize) { ordered.splice(ordered.indexOf(prize), 1); ordered.push(prize); }

/* ---- the spread -----------------------------------------------------------
   By POSITION, not by source level. Spreading by source level would reproduce
   the source's own bunching — most of the roster in the first third and a tail
   of nothing but hulls. By position the rate is flat, and the prize lands on
   the last level because it is the last item. */
var LO = 2, SPAN = LEVELS - LO + 1;
ordered.forEach(function (x, i) { x.level = LO + Math.floor(i * SPAN / ordered.length); });
FIRST.forEach(function (x) { x.level = 1; });

/* A level that is nothing but hulls gives the player something they cannot yet
   put anything on. Where the source offers no module at that level to
   interleave, trade one with a neighbouring level instead — a straight swap, so
   no level is left empty and the count per level does not change. Only levels
   within two of each other and items within two source levels are eligible, so
   the order stays honest. */
function unstack() {
  var by = groupByLevel(ordered), swaps = 0, lv;
  for (lv = LO; lv <= LEVELS; lv++) {
    var here = by[lv] || [];
    if (here.length < 2 || here.some(function (x) { return x.kind === 'module'; })) continue;
    var found = null;
    [lv - 1, lv + 1, lv - 2, lv + 2].some(function (nb) {
      var there = by[nb] || [];
      var m = there.filter(function (x) { return x.kind === 'module'; });
      if (!m.length) return false;
      var cand = nb < lv ? m[m.length - 1] : m[0];
      var hull = here[here.length - 1];
      if (Math.abs(cand.src - hull.src) > 2) return false;
      found = { mod: cand, hull: hull, nb: nb };
      return true;
    });
    if (!found) continue;
    found.mod.level = lv; found.hull.level = found.nb;
    by = groupByLevel(ordered); swaps++;
  }
  return swaps;
}
function groupByLevel(list) {
  var by = {};
  list.forEach(function (x) { (by[x.level] = by[x.level] || []).push(x); });
  return by;
}
var swapped = unstack();

/* ---- the hulls, in fleet order --------------------------------------------
   The spread above places hulls by SOURCE order, and the source's order is not
   the player's: its tiers overlap, so a tier-1 hull could arrive forty levels
   after a tier-4 one, and inside a tier the hulls came in no size order at all.
   The LEVELS a hull can arrive on are already decided and stay exactly as they
   are — this only decides WHICH hull lands on each of them. Every hull position
   on the ladder is collected and the roster is dealt back into them by tier and
   then by how many cells the hull has, both ascending, so the fleet grows one
   step at a time and the last position gets the largest hull of the top tier.
   Nothing here names a ship; tier and cell count are read off the data. */
function cells(s) {
  var g = s.grid || [], n = 0, i;
  for (i = 0; i < g.length; i++) if (g[i]) n++;
  return n;
}
(function refleet() {
  var hulls = FIRST.concat(ordered).filter(function (x) { return x.kind === 'ship'; });
  var slots = hulls.map(function (x) { return x.level; }).sort(function (a, b) { return a - b; });
  hulls.sort(function (a, b) {
    return (a.rec.tier || 0) - (b.rec.tier || 0) ||
           cells(a.rec) - cells(b.rec) ||
           a.rec.displayName.localeCompare(b.rec.displayName);
  });
  hulls.forEach(function (x, i) { x.level = slots[i]; });
})();

/* ---- the reworks, placed against their own base ----------------------------
   v2 five levels after the module it reworks, v3 ten. Capped at the last level
   that can carry a module — the top level is the prize hull and nothing else,
   so a rework of something unlocking at 97 lands on 99 rather than pushing the
   prize aside. Nothing here can land a rework at or before its base, which is
   the whole point of the exercise. */
var TOP_MOD_LEVEL = LEVELS - 1;
(function placeReworks() {
  var lvl = {};
  PLAIN.forEach(function (x) { lvl[x.key] = x.level; });
  VARIANTS.forEach(function (x) {
    var base = lvl[BASE_OF[x.rec.displayName]];
    if (base === undefined) base = 1;            /* cannot happen; be loud not wrong */
    var at = base + reworkGap(x.rec);
    x.level = at > TOP_MOD_LEVEL ? TOP_MOD_LEVEL : at;
  });
})();

/* ---- what must be true ---------------------------------------------------- */
var rows = [];
(function build() {
  var by = groupByLevel(FIRST.concat(ordered, VARIANTS));
  for (var lv = 1; lv <= LEVELS; lv++) {
    var v = (by[lv] || []).sort(function (a, b) {
      return (a.kind === 'ship' ? 0 : 1) - (b.kind === 'ship' ? 0 : 1) ||
             FAM_ORDER[a.fam] - FAM_ORDER[b.fam] ||
             a.rec.displayName.localeCompare(b.rec.displayName);
    });
    rows.push({
      level: lv,
      ships: v.filter(function (x) { return x.kind === 'ship'; }).map(function (x) { return x.rec; }),
      mods:  v.filter(function (x) { return x.kind === 'module'; }).map(function (x) { return x.rec; }),
      srcs:  v.map(function (x) { return x.src; })
    });
  }
})();

var levelOf = {};
FIRST.concat(ordered, VARIANTS).forEach(function (x) { levelOf[x.key] = x.level; });

var shadowed = [];
(function check() {
  var bad = [], lv, i;
  for (lv = 1; lv <= LEVELS; lv++)
    if (!rows[lv - 1].ships.length && !rows[lv - 1].mods.length) bad.push('level ' + lv + ' gives nothing');
  if (rows[LEVELS - 1].ships.length !== 1 || rows[LEVELS - 1].mods.length)
    bad.push('the last level should be the prize hull and nothing else');
  /* NO REWORK ARRIVES AT OR BEFORE WHAT IT REWORKS, and every one of them sits
     exactly its own gap behind it. Fatal for all of them — the old version
     excused `visible: 2` and that is how nine of them ended up in the starting
     kit. Read off `modification`, the field that actually says what this is,
     and off the key only to find the pair. */
  shadowed = [];
  mods.forEach(function (m) {
    var gap = reworkGap(m);
    if (!gap) return;
    var base = BASE_OF[m.displayName];
    var bl = levelOf[base], vl = levelOf[m.key];
    if (bl === undefined || vl === undefined) { bad.push(m.key + ' is not on the ladder'); return; }
    if (vl <= bl) bad.push(m.key + ' arrives at or before ' + base);
    else if (vl !== bl + gap && vl !== TOP_MOD_LEVEL)
      bad.push(m.key + ' should be ' + gap + ' after ' + base + ' (' + bl + ') but is at ' + vl);
  });
  /* every hull and every module is on the ladder exactly once */
  if (Object.keys(levelOf).length !== items.length)
    bad.push('ladder holds ' + Object.keys(levelOf).length + ' of ' + items.length + ' items');
  if (bad.length) { console.error('LADDER BROKEN — ' + bad.join('; ')); process.exit(1); }
})();

/* ---- tiers ----------------------------------------------------------------
   A tier opens at the level its first hull arrives and closes where the next
   one opens. Both come off the ladder, so a roster change moves them. */
var TIERS = (function () {
  var by = {};
  ships.forEach(function (s) { (by[(s.tier || 0) + 1] = by[(s.tier || 0) + 1] || []).push(s); });
  var ns = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
  /* Names go by POSITION, not by the source's tier index: the data numbers its
     classes 0-6 and 8, with 7 empty, so indexing by number would leave the top
     tier unnamed and every name after the gap wrong. There are as many classes
     as there are populated tiers, and they are in order. */
  var out = ns.map(function (n, i) {
    var lv = by[n].map(function (s) { return levelOf[s.key]; }).sort(function (a, b) { return a - b; });
    return { n: n, name: TIER_NAMES[i] || ('Tier ' + n), from: lv[0], to: lv[lv.length - 1] };
  });
  for (var i = 0; i < out.length - 1; i++) out[i].to = out[i + 1].from - 1;
  out[0].from = 1;
  out[out.length - 1].to = LEVELS;
  /* The band on the ladder, which is what a player can act on. The hulls' own
     spread is not it: the source's tiers overlap on level, so tier 1 holds a
     hull that does not arrive until level 45. */
  out.forEach(function (t) { t.levelRange = [t.from, t.to]; });
  return out;
})();
function tierAt(lv) {
  for (var i = TIERS.length - 1; i >= 0; i--) if (lv >= TIERS[i].from) return TIERS[i];
  return TIERS[0];
}

/* ---- the document --------------------------------------------------------- */
function opsAt(l) { return OPS.filter(function (o) { return o.at === l; }); }

var out = [];
out.push('# Fleet Forge — the unlock ladder');
out.push('');
out.push('**Operations** are challenges. Completing the one you are on gives you a level,');
out.push('and the level hands over a hull, a module, or both. ' + OPS.length + ' operations,');
out.push('so ' + LEVELS + ' levels: you start on 1 and finish on ' + LEVELS + '.');
out.push('');
out.push('**No operation names an opponent.** Fights come from a generated pool for your');
out.push('tier, so an operation can ask about an opponent\'s *tier* but never its identity.');
out.push('');
out.push('**' + ships.length + ' hulls and ' + mods.length + ' modules**, spread by position');
out.push('in the source order rather than by the source level itself — the source bunches');
out.push('its roster in the first third and thins to almost nothing above level 50, so using');
out.push('it directly gave a crowded early game and a tail of nothing but hulls.');
out.push('');
out.push('| Lv | Tier | Operation | Ship | Module | Source |');
out.push('|---:|:--|:--|:--|:--|---:|');
rows.forEach(function (r) {
  var o = opsAt(r.level).map(function (x) {
    return (x.gate ? '⇧ ' : '') + '**' + x.n + '** — ' + x.d;
  }).join('<br>') || '—';
  var s = sorted(r.srcs);
  out.push('| ' + r.level + ' | ' + tierAt(r.level).n + ' ' + tierAt(r.level).name + ' | ' + o + ' | ' +
           (r.ships.map(function (x) { return '**' + x.displayName + '**'; }).join('; ') || '—') + ' | ' +
           (r.mods.map(function (x) { return x.displayName; }).join('; ') || '—') + ' | ' + s + ' |');
});
out.push('');
function sorted(a) {
  var u = a.slice().sort(function (x, y) { return x - y; });
  return u[0] === u[u.length - 1] ? String(u[0]) : u[0] + '–' + u[u.length - 1];
}

/* Check the RENDERED table, not the intent: an earlier verifier checked the
   allocation and passed happily while two items were dropped at render time,
   which is the only failure a reader would ever see. */
(function verify() {
  var doc = out.join('\n'), missing = [];
  ships.forEach(function (s) { if (doc.indexOf('**' + s.displayName + '**') < 0) missing.push('ship ' + s.key); });
  mods.forEach(function (m)  { if (doc.indexOf(m.displayName) < 0) missing.push('module ' + m.key); });
  if (missing.length) { console.error('TABLE INCOMPLETE — ' + missing.join(', ')); process.exit(1); }
  console.error('verified: ' + ships.length + ' hulls and ' + mods.length + ' modules all present, ' +
                LEVELS + ' levels, ' + OPS.length + ' operations, ' + swapped + ' hull/module swaps');
  console.error('  ' + VARIANTS.length + ' reworks placed behind their own base (v2 +' +
                VAR_GAP['BM.1'] + ', v3 +' + VAR_GAP['BM.2'] + ', capped at ' + TOP_MOD_LEVEL + ')');
})();

/* An operation must never ask for a module the player cannot have yet. */
(function checkOpDeps() {
  var bad = [];
  OPS.forEach(function (o) {
    var c = o.c || {};
    if (c.t === 'hasModule' && (levelOf[c.m] === undefined || levelOf[c.m] > o.at))
      bad.push(o.n + ' needs ' + c.m + ' (level ' + levelOf[c.m] + ') at level ' + o.at);
    var subs = c.t === 'has' ? [c.sub] : (c.t === 'hasAll' ? c.subs : []);
    (subs || []).forEach(function (sub) {
      var first = mods.filter(function (m) { return m.subtype === sub; })
                      .map(function (m) { return levelOf[m.key]; })
                      .sort(function (a, b) { return a - b; })[0];
      if (first === undefined || first > o.at)
        bad.push(o.n + ' needs a ' + sub + ' (first at level ' + first + ') at level ' + o.at);
    });
    if (c.t === 'only') {
      var f = mods.filter(function (m) { return m.damageType === c.dt; })
                  .map(function (m) { return levelOf[m.key]; })
                  .sort(function (a, b) { return a - b; })[0];
      if (f === undefined || f > o.at) bad.push(o.n + ' needs a ' + c.dt + ' weapon at level ' + o.at);
    }
  });
  if (!bad.length) return;
  /* THE BOOTSTRAP DEADLOCK. The operations are written against the ladder and
     the ladder is validated against the operations, so any change that moves a
     level makes step one fail on operations that step two is about to rewrite.
     `--bootstrap` downgrades this one check to a warning for that first pass
     only; the third pass runs without it and must come out clean. */
  if (process.argv.indexOf('--bootstrap') >= 0) {
    console.error('BOOTSTRAP — ' + bad.length + ' operations are stale; run make-operations.js next');
    return;
  }
  console.error('OP DEPENDENCY BROKEN — ' + bad.join('; '));
  process.exit(1);
})();

/* The game reads data/progression.json; it and the document come from the same
   tables, so they cannot drift apart. */
if (process.argv.indexOf('--json') >= 0) {
  var fs = require('fs'), path = require('path');
  var levels = [], shipAt = {}, modAt = {};
  rows.forEach(function (r) {
    levels.push({ level: r.level, tier: tierAt(r.level).n,
                  ships: r.ships.map(function (s) { shipAt[s.key] = r.level; return s.key; }),
                  modules: r.mods.map(function (m) { modAt[m.key] = r.level; return m.key; }) });
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'progression.json'),
    JSON.stringify({
      version: 1, maxLevel: LEVELS,
      tiers: TIERS.map(function (t) {
        return { n: t.n, name: t.name, levelRange: t.levelRange, fromLevel: t.from, toLevel: t.to };
      }),
      levels: levels, shipLevel: shipAt, moduleLevel: modAt,
      operations: OPS.map(function (o) {
        return { id: o.id, name: o.n, desc: o.d, at: o.at, gate: o.gate || 0, cond: o.c };
      })
    }, null, 1));
  console.error('wrote data/progression.json — ' + ships.length + ' hulls, ' + mods.length +
                ' modules over ' + LEVELS + ' levels, ' + OPS.length + ' operations');
}

console.log(out.join('\n'));
