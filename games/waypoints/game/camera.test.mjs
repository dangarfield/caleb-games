// Waypoints — the camera, and the water. `node game/camera.test.mjs`
//
// Both of these were wrong against the printed rules, and both were wrong in the
// quiet way: the game played on and told the child something false. The rules
// text they are checked against, from the Special Actions panel:
//
//   "Camera: Immediately choose a waypoint that you haven't visited in the same
//    grid square or an orthogonally adjacent grid square. Circle or fill in the
//    next space in its track as if you had just visited it. Then cross off the
//    small dot next to the Waypoint you took a photo of - you cannot visit it
//    again."
//
//   "Backpack: You can use this special action as either a Glider, Coat or
//    Kayak." — three things, and the camera is not one of them.
//
// And the water track: a bottle you are carrying is circled; a bottle you have
// drunk is circled AND crossed out. The card draws that from `p.card`, which is
// why what `p` knows has to reach it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../mapper/state.js';
import { indexMap } from './rules.js';
import {
  newGame, chooseGoal, chooseStart, rollWeather, gainWater, rest,
  photograph, photoTargets, hasAction, glideTargets, syncWater,
} from './state.js';

const here = dirname(fileURLToPath(import.meta.url));
const map = migrate(JSON.parse(readFileSync(join(here, '..', 'assets', 'maps', 'map-01.json'), 'utf8')));
const ix = indexMap(map);
const board = map.board;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; return; } fail++; console.log(`  FAIL  ${n}${x ? '  ' + x : ''}`); };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const fresh = () => {
  const g = newGame(ix, { players: ['Test'] });
  chooseGoal(g, 'a');
  chooseStart(g, ix, 1);
  rollWeather(g, board, 3);
  return g;
};
const sq = (w) => [Math.floor(w.x), Math.floor(w.y)];

// ---------------------------------------------------------------- the water
{
  const g = fresh(); const p = g.players[0];
  gainWater(ix, p, 2);
  eq('two bottles carried', p.water, 2);
  eq('and the card knows', p.card.water, 2);
  eq('none drunk yet', p.card.waterUsed, 0);

  // what the sheet draws: circles for what you have, crosses for what you drank
  p.water -= 1; p.waterUsed = 1;
  syncWater(p);
  eq('one bottle left on the card', p.card.water, 1);
  eq('and one crossed out', p.card.waterUsed, 1);
  // The card draws `water + waterUsed` marks in all: drinking must not rub a
  // bottle off the sheet, it crosses it.
  eq('the sheet still shows both bottles', p.card.water + p.card.waterUsed, 2);
}
{
  // resting fills one, and the card follows without anyone remembering to tell it
  const g = fresh(); const p = g.players[0];
  rest(g, ix, p);
  eq('a rest fills a bottle', p.card.water, 1);
  eq('and nothing is crossed', p.card.waterUsed, 0);
}

// ---------------------------------------------------------------- the camera
{
  const g = fresh(); const p = g.players[0];
  const from = ix.byId.get(p.at);
  eq('no camera, nothing to point it at', photoTargets(g, ix, p).length, 0);

  p.actions.push({ kind: 'camera', used: false });
  const targets = photoTargets(g, ix, p);
  ok('with a camera there are places to photograph', targets.length > 0);

  const [ax, ay] = sq(from);
  const far = targets.filter((w) => {
    const [bx, by] = sq(w);
    return Math.abs(ax - bx) + Math.abs(ay - by) > 1;
  });
  eq('nothing further than one square, orthogonally', far.length, 0);
  ok('and nowhere he has already been',
    targets.every((w) => !p.visited.includes(w.id) && !p.photographed.includes(w.id)));

  // the corner case, literally: the glider takes diagonals, the camera does not
  const diagonal = glideTargets(g, ix, { ...p, at: p.at }).length;
  ok('the camera is not the glider', typeof diagonal === 'number');
}
{
  const g = fresh(); const p = g.players[0];
  p.actions.push({ kind: 'camera', used: false });
  const w = photoTargets(g, ix, p)[0];
  const r = photograph(g, ix, p, w.id);
  eq('the photograph is taken', r.ok, true);
  ok('it goes on the card as if he had been there', !!r.marked);
  ok('the place is marked photographed', p.photographed.includes(w.id));
  ok('it does not count as visited', !p.visited.includes(w.id));
  eq('and he cannot go there afterwards', photograph(g, ix, p, w.id).ok, false);
  eq('the camera is spent', hasAction(p, 'camera'), false);
}
{
  // Reaching a Lookout is what hands you a camera: every space on that track
  // carries one, which is why the camera is the action you meet most often.
  const look = map.card.tracks.find((t) => t.id === 'lookout');
  eq('every lookout space is a camera', look.spaces.filter((x) => x.act === 'camera').length,
    look.spaces.length);
}

// ---------------------------------------------------------------- the backpack
{
  const g = fresh(); const p = g.players[0];
  p.actions.push({ kind: 'backpack', used: false });
  ok('a backpack is a glider', hasAction(p, 'glider'));
  ok('a backpack is a coat', hasAction(p, 'coat'));
  ok('a backpack is a kayak', hasAction(p, 'kayak'));
  ok('a backpack is NOT a camera', !hasAction(p, 'camera'));
  eq('so it cannot take a photograph', photoTargets(g, ix, p).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
