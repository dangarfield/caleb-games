// Waypoints — the backpack. `node game/pack.test.mjs`
//
// `kit()` is the one place that decides what a child is offered, and every
// wrong answer it can give is a bad one: offer a kayak on a hilltop and he
// spends it on nothing; hide one beside the river and the rule he was taught
// looks like a lie. So it is tested against the real map, through the real
// methods, with a stand-in for the only thing node cannot have — the canvas.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../mapper/state.js';
import { indexMap } from './rules.js';
import { newGame, chooseGoal, chooseStart, rollWeather } from './state.js';
import { Play2D } from './play2d.js';

const here = dirname(fileURLToPath(import.meta.url));
const map = migrate(JSON.parse(readFileSync(join(here, '..', 'assets', 'maps', 'map-01.json'), 'utf8')));
const ix = indexMap(map);
const board = map.board;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; return; } fail++; console.log(`  FAIL  ${n}${x ? '  ' + x : ''}`); };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

// A Play2D without a board to draw on. Everything the pack asks about lives in
// the game state, so the methods are borrowed rather than reimplemented — a
// test that copies the logic it is testing proves only that it can copy.
function bench({ at, gear = [], budget = 4, draft = null } = {}) {
  const g = newGame(ix, { players: ['Test'] });
  chooseGoal(g, 'a');
  chooseStart(g, ix, 1);
  rollWeather(g, board, 3);
  g.budget = budget;
  const p = g.players[0];
  if (at) p.at = at;
  for (const kind of gear) p.actions.push({ kind, used: false });
  const self = Object.create(Play2D.prototype);
  Object.assign(self, { g, ix, board, draft, kayak: false, ed: { draw() {} }, onChange() {} });
  return self;
}

const idOf = (type) => (ix.waypoints.find((w) => w.type === type) || {}).id;
const MOUNTAIN = idOf('mountain');
const TRIG = idOf('trig');

// ---------------------------------------------------------------- what is in it
{
  const s = bench({ gear: ['kayak', 'coat'] });
  const k = s.kit();
  eq('the bag counts what is unused', k.count, 2);
  eq('a kayak you own', k.kayak.own, 1);
  eq('a glider you do not', k.glider.have, 0);
}
{
  // `useAction` spends a backpack in place of anything, so the bag has to say
  // you have the thing, or the menu and the rule disagree.
  const s = bench({ gear: ['backpack'] });
  const k = s.kit();
  eq('a backpack stands in for a kayak', k.kayak.have, 1);
  eq('and for a glider', k.glider.have, 1);
  eq('but it is still one item', k.count, 1);
}

// ---------------------------------------------------------------- where it works
{
  const s = bench({ at: MOUNTAIN, gear: ['glider', 'kayak'] });
  const k = s.kit();
  ok('a glider flies off a mountain', k.glider.can);
  ok('a kayak does not launch off a mountain', !k.kayak.can, k.kayak.why);
  eq('and says why', k.kayak.why, 'you have to be beside the river');
}
{
  const s = bench({ at: TRIG, gear: ['glider'] });
  const k = s.kit();
  ok('no glider off a trig point', !k.glider.can);
  eq('and says why', k.glider.why, 'you have to be on a mountain');
}
{
  const s = bench({ at: TRIG, gear: ['kayak'] });
  eq('taking a kayak out on dry land fails', s.useKayak().ok, false);
  eq('and nothing is out', s.kit().out.kayak, false);
}

// ---------------------------------------------------------------- the river
{
  // A line drawn along the river is what makes a kayak a kayak, so the bag has
  // to look at the route being drawn and not only at the ground underfoot.
  const r = (map.rivers || [])[0];
  const pts = r ? r.pts.slice(0, 6).map((q) => [q[0], q[1]]) : null;
  if (pts && pts.length > 1) {
    const s = bench({ at: TRIG, gear: ['kayak'], draft: { pts, line: pts, fixed: pts.length } });
    ok('a route down the river offers the kayak', s.kit().kayak.can);
    eq('and it comes out', s.useKayak().ok, true);
    eq('the turn now knows it is a paddle', s.how.kayak, true);
    s.stowKayak();
    eq('and it goes back in', s.how.kayak, false);
  } else {
    ok('the map has a river to paddle', false, 'no river geometry found');
  }
}

// ---------------------------------------------------------------- the coat
{
  const s = bench({ gear: ['coat'], budget: 5 });
  ok('no coat on a kind day', !s.kit().coat.can);
  eq('and it will not come out', s.useCoat().ok, false);
  s.g.budget = 2;
  ok('a coat on a mean one', s.kit().coat.can);
  eq('and it goes on', s.useCoat().ok, true);
  ok('the coat is on', s.kit().out.coat);
  eq('not twice', s.useCoat().ok, false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
