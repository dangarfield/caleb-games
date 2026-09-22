// Waypoints — turn machine tests. `node game/state.test.mjs`.
//
// These play real games against the real map: a full four-hike solo game is
// driven to its end and the sheet is checked against the rules, because the only
// way to know a turn machine works is to turn it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../mapper/state.js';
import { indexMap, reachable, costRoute, routeTouches } from './rules.js';
import {
  newGame, chooseGoal, chooseStart, rollWeather, checkMove, previewMove,
  commitMove, rest, mustRest, markTrack, writeMountain, gainWater, photograph,
  hikeOver, endHike, journalOptions, chooseJournal, advanceHike, score, mountainValue,
  budgetFor, hasAction, glide, glideTargets, wearCoat,
} from './state.js';

const here = dirname(fileURLToPath(import.meta.url));
// Through the app's own migration, so the tests and the game see the same map:
// a traced file has no board or card on it until `migrate` puts the printed
// sheet back, and a test running against a different map from the game is worse
// than no test at all.
const map = migrate(JSON.parse(readFileSync(join(here, '..', 'assets', 'maps', 'map-01.json'), 'utf8')));
const ix = indexMap(map);
const board = map.board;

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; return; } fail++; console.log(`  FAIL  ${n}${x ? '  ' + x : ''}`); };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);
const fresh = (opts) => {
  const g = newGame(ix, opts);
  chooseGoal(g, opts && opts.goal ? opts.goal : 'a');
  chooseStart(g, ix, 1);
  return g;
};

// ---------------------------------------------------------------- setup
{
  const g = newGame(ix, {});
  eq('a new game wants a goal first', g.phase, 'goal');
  chooseGoal(g, 'b');
  eq('then a start', g.phase, 'start');
  chooseStart(g, ix, 4);
  eq('then you roll', g.phase, 'roll');
  const camp = ix.waypoints.find((w) => w.type === 'campsite' && w.number === 4);
  eq('everyone starts on the rolled campsite', g.players[0].at, camp.id);
  ok('...and cannot go back to it', g.players[0].visited.includes(camp.id));
  eq('a solo game has one player', g.players.length, 1);
}

// ---------------------------------------------------------------- the roll
{
  const g = fresh();
  rollWeather(g, board, 3);
  eq('the roll sets the phase', g.phase, 'move');
  ok('...and a budget off the track', g.budget >= 1 && g.budget <= 6, `${g.budget}`);
  eq('...and moves the shared ring', g.ring.pos, 2);
  const before = g.ring.pos;
  rollWeather(g, board, 3);
  eq('you cannot roll twice in a turn', g.ring.pos, before);
}
{
  // a roll past the end of the side stops on the last space
  const g = fresh();
  const n = board.tracks['top'].length;
  for (let i = 0; i < 20; i++) { g.phase = 'roll'; rollWeather(g, board, 6); }
  eq('the ring stops at the end of the side', g.ring.pos, n - 1);
  ok('...and that is the end of the hike', hikeOver(g, board));
}

// ---------------------------------------------------------------- moving
{
  const g = fresh();
  const p = g.players[0];
  rollWeather(g, board, 2);
  const from = ix.byId.get(p.at);
  const opts = reachable(ix, p.at, budgetFor(g, p), new Set(p.visited));

  ok('something is reachable on a normal turn', opts.length > 0, `${opts.length}`);

  const target = ix.byId.get(opts[0].id);
  const route = [[from.x, from.y], [target.x, target.y]];
  const chk = checkMove(g, ix, p, route, target.id);
  ok('a straight route to a reachable waypoint is legal or merely dear',
    chk.ok || /costs/.test(chk.why || ''), chk.why);

  // you cannot go somewhere you have been
  const back = checkMove(g, ix, p, [[from.x, from.y], [from.x, from.y]], from.id);
  ok('you cannot revisit', !back.ok);
}
{
  // a move marks the track of the waypoint you arrive at
  const g = fresh();
  const p = g.players[0];
  g.budget = 40; g.phase = 'move';
  // Stand him somewhere a bear is actually walkable FROM. A straight line across
  // the park is usually blocked — by the river, by a waypoint in the way, and
  // now by a lake — and which campsite the die gave is not what this test is
  // about.
  let from = null, bear = null;
  for (const a of ix.waypoints) {
    bear = ix.waypoints.find((w) => w.type === 'bear' && w.id !== a.id &&
      !costRouteBlocked(a, w));
    if (bear) { from = a; break; }
  }
  ok('somewhere in the park a bear can be walked to in one line', !!bear);
  p.at = from.id;
  const r = commitMove(g, ix, board, p, [[from.x, from.y], [bear.x, bear.y]], bear.id);
  ok('the move is taken', r.ok, r.why);
  eq('...and the bear track is marked', p.card.marks['bear:0'], 1);
  eq('...and you are standing there', p.at, bear.id);
  ok('...and it is on this hike', p.hikes[0].waypoints.includes(bear.id));
}
function costRouteBlocked(a, b) {
  return !!checkMove({ budget: 999, players: [] }, ix,
    { at: a.id, visited: [], photographed: [], water: 0, actions: [] },
    [[a.x, a.y], [b.x, b.y]], b.id).blocked;
}

// ---------------------------------------------------------------- the sheet
{
  const g = fresh();
  const p = g.players[0];
  eq('a fresh track is empty', p.card.marks['bear:0'], undefined);
  markTrack(ix, p, 'bear');
  eq('marking fills the first space', p.card.marks['bear:0'], 1);
  markTrack(ix, p, 'bear');
  eq('...then the second', p.card.marks['bear:1'], 1);

  // the bear track's second space carries a kayak
  const t = ix.map.card.tracks.find((x) => x.id === 'bear');
  ok('the second bear space is a special', !!t.spaces[1].act, JSON.stringify(t.spaces[1]));

  // fill it and the eleventh mark does nothing
  for (let i = 0; i < 20; i++) markTrack(ix, p, 'bear');
  eq('a full track takes no more', Object.keys(p.card.marks).filter((k) => k.startsWith('bear:')).length,
    t.spaces.length);
}
{
  const g = fresh();
  const p = g.players[0];
  const m = ix.waypoints.filter((w) => w.type === 'mountain');
  // the UNDERLINED number, not the height: a 800 m summit writes an 8
  eq('a 800 m summit is worth 8', mountainValue({ height: 800 }), 8);
  eq('...and the map can override it', mountainValue({ height: 800, value: 3 }), 3);
  writeMountain(ix, p, m[0]);
  eq('a mountain writes its underlined number', p.card.boxes['mountain:0'], mountainValue(m[0]));
  for (let i = 1; i < 5; i++) writeMountain(ix, p, m[i]);
  // the fifth box is x2
  eq('an x2 box doubles what goes in it', p.card.boxes['mountain:4'], mountainValue(m[4]) * 2);
  ok('...and the whole track stays in scale with the others',
    ix.waypoints.filter((w) => w.type === 'mountain')
      .reduce((n, w) => n + mountainValue(w), 0) < 80);
}
{
  const g = fresh();
  const p = g.players[0];
  const cap = ix.map.card.water.cols * ix.map.card.water.rows;
  gainWater(ix, p, cap + 10);
  eq('the water track cannot overflow', p.water, cap);
}

// ---------------------------------------------------------------- water as movement
{
  const g = fresh();
  const p = g.players[0];
  g.budget = 2; g.phase = 'move';
  p.water = 3;
  eq('water buys movement', budgetFor(g, p, 3), 5);
  eq('...and none if you spend none', budgetFor(g, p, 0), 2);
  // `budgetFor` takes the number of bottles as given — it is `checkMove` that
  // decides how many you actually have, because only `checkMove` knows about
  // the lake you are about to walk past.
  const far = ix.waypoints.find((w) => w.id !== p.at);
  const dry = [[ix.byId.get(p.at).x, ix.byId.get(p.at).y], [far.x, far.y]];
  const asked = checkMove(g, ix, p, dry, far.id, { water: 99 });
  ok('asking to drink ninety-nine bottles drinks what you carry',
    asked.spend <= p.water + asked.fill, `spend ${asked.spend}`);
}
{
  // a coat is worth 3 when the weather is mean, and nothing when it is not
  const g = fresh();
  const p = g.players[0];
  p.actions.push({ kind: 'coat', used: false });
  g.phase = 'move';
  g.budget = 4;
  eq('a coat is not worn on a good day', wearCoat(g, p).ok, false);
  eq('...and pays nothing while it is in the pack', budgetFor(g, p), 4);
  g.budget = 2;
  ok('on a mean day it goes on', wearCoat(g, p).ok);
  eq('...and pays out three', budgetFor(g, p), 5);
  eq('...once', wearCoat(g, p).ok, false);
}

// ---------------------------------------------------------------- the camera
{
  const g = fresh();
  const p = g.players[0];
  const from = ix.byId.get(p.at);
  const near = ix.waypoints.find((w) => w.id !== from.id && w.type !== 'campsite' &&
    Math.abs(Math.floor(w.x) - Math.floor(from.x)) + Math.abs(Math.floor(w.y) - Math.floor(from.y)) <= 1);
  const far = ix.waypoints.find((w) =>
    Math.abs(Math.floor(w.x) - Math.floor(from.x)) + Math.abs(Math.floor(w.y) - Math.floor(from.y)) > 2);

  eq('no camera, no photograph', photograph(g, ix, p, near.id).ok, false);
  p.actions.push({ kind: 'camera', used: false });
  eq('too far away is refused', photograph(g, ix, p, far.id).ok, false);
  const r = photograph(g, ix, p, near.id);
  ok('a camera photographs a neighbour', r.ok, r.why);
  ok('...and that waypoint is spent', p.photographed.includes(near.id));
  const chk = checkMove(g, ix, p, [[from.x, from.y], [near.x, near.y]], near.id);
  ok('...so you can never walk to it', !chk.ok, chk.why);
  // A lookout or gear waypoint hands out a fresh camera or backpack when it is
  // marked, so "is there a camera now" is the wrong question — count the one
  // that was spent instead.
  eq('...and the camera that was used is spent',
    p.actions.filter((a) => a.kind === 'camera' && a.used).length, 1);
}

// ---------------------------------------------------------------- journal
{
  const g = fresh();
  const p = g.players[0];
  const bears = ix.waypoints.filter((w) => w.type === 'bear').slice(0, 2).map((w) => w.id);
  p.hikes[0].waypoints = bears;
  p.hikes[0].squares = [0, 1, 2];

  let opts = journalOptions(g, ix, p);
  eq('four entries offered', opts.length, 4);
  eq('2 per waypoint of one type', opts.find((o) => o.id === 'j2').score, 4);
  eq('1 per 2 squares', opts.find((o) => o.id === 'j4').score, 1);

  chooseJournal(g, ix, p, 'j2');
  eq('the score lands on the card', p.card.boxes['journal:1'], 4);
  opts = journalOptions(g, ix, p);
  ok('...and that entry is spent', opts.find((o) => o.id === 'j2').used);
  eq('you cannot score it twice', chooseJournal(g, ix, p, 'j2').ok, false);

  p.hikes[0].endedAtCampsite = true;
  eq('a campsite finish doubles the rest', journalOptions(g, ix, p).find((o) => o.id === 'j1').score, 2);
}

// ---------------------------------------------------------------- solo requirement
{
  const g = fresh({ difficulty: 'easy' });
  const p = g.players[0];
  for (let h = 0; h < 4; h++) {
    p.hikes[p.hikes.length - 1].endedAtCampsite = h === 0;     // one campsite, three misses
    advanceHike(g, ix, board);
  }
  ok('easy: three missed campsites loses', p.lost);
}
{
  const g = fresh({ difficulty: 'easy' });
  const p = g.players[0];
  for (let h = 0; h < 4; h++) {
    p.hikes[p.hikes.length - 1].endedAtCampsite = h !== 0;     // one miss only
    advanceHike(g, ix, board);
  }
  ok('easy: one miss is allowed', !p.lost);
}
{
  const g = fresh({ difficulty: 'hard' });
  const p = g.players[0];
  for (let h = 0; h < 4; h++) {
    p.hikes[p.hikes.length - 1].endedAtCampsite = h !== 0;
    advanceHike(g, ix, board);
  }
  ok('hard: any miss loses', p.lost);
}
{
  const g = fresh({ difficulty: 'hard' });
  const p = g.players[0];
  for (let h = 0; h < 4; h++) {
    p.hikes[p.hikes.length - 1].endedAtCampsite = true;
    advanceHike(g, ix, board);
  }
  ok('hard: four campsites is a clean game', !p.lost);
  eq('...and the game is over', g.phase, 'over');
  ok('...with a result', !!g.results && g.results.length === 1);
}

// ---------------------------------------------------------------- a whole game
{
  // Play four hikes with a fixed die, always taking the cheapest legal move.
  // Nothing here checks a strategy — it checks that four hikes of real turns
  // never reach a state the machine cannot get out of.
  let seed = 7;
  const d6 = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 6) + 1;

  const g = fresh({ difficulty: 'easy', goal: 'c' });
  const p = g.players[0];
  let turns = 0, moves = 0, rests = 0;

  while (g.phase !== 'over' && turns < 400) {
    turns++;
    if (g.phase === 'roll') { rollWeather(g, board, d6()); continue; }
    if (g.phase === 'move') {
      const from = ix.byId.get(p.at);
      const opts = reachable(ix, p.at, budgetFor(g, p, p.water),
        new Set([...p.visited, ...p.photographed]));
      let done = false;
      for (const o of opts) {
        const w = ix.byId.get(o.id);
        const r = commitMove(g, ix, board, p, [[from.x, from.y], [w.x, w.y]], o.id,
          { water: Math.max(0, o.cost - g.budget) });
        if (r.ok) { moves++; done = true; break; }
      }
      if (!done) { rest(g, ix, p); rests++; }
      if (hikeOver(g, board)) endHike(g, ix); else g.phase = 'roll';
      continue;
    }
    if (g.phase === 'journal') {
      const pick = journalOptions(g, ix, p).filter((o) => !o.used)
        .sort((a, b) => b.score - a.score)[0];
      chooseJournal(g, ix, p, pick.id);
      advanceHike(g, ix, board);
      continue;
    }
    break;
  }

  eq('a whole game reaches the end', g.phase, 'over');
  eq('...over four hikes', p.hikes.length, 4);
  eq('...scoring all four journal entries', p.journalUsed.length, 4);
  ok('...having actually moved', moves > 8, `${moves} moves, ${rests} rests`);
  ok('...and never revisited a waypoint',
    new Set(p.visited).size === p.visited.length);

  const s = score(g, ix, p);
  ok('the score adds up', s.total === s.animals + s.gear + s.journal + s.goal,
    JSON.stringify(s));
  ok('...and is a real score', s.total > 0, `${s.total}`);
  ok('the goal is counted off the map', s.goalDetail.of === ix.totals.squares,
    `${s.goalDetail.of} vs ${ix.totals.squares}`);
  console.log(`  full game: ${turns} turns, ${moves} moves, ${rests} rests, ` +
    `${p.visited.length} waypoints, score ${s.total}` + (p.lost ? ' (lost)' : ''));
}

// ------------------------------------------------- the goal, on the card
{
  const g = newGame(ix, {});
  chooseGoal(g, 'c');
  eq('the game knows the goal', g.goal, 'c');
  eq('...and so does the card the player is writing on', g.players[0].card.goal, 'c');
}

// ------------------------------------------------- the gear that was missing
{
  // THE KAYAK. Earned on the track for two years and read by nothing: a route
  // the river blocked was blocked whether or not you had a boat.
  const g = fresh();
  const p = g.players[0];
  g.budget = 60; g.phase = 'move';
  let pair = null;
  for (const a of ix.waypoints) {
    for (const b of ix.waypoints) {
      if (a.id === b.id || pair) continue;
      const r = [[a.x, a.y], [b.x, b.y]];
      const walk = checkMove({ ...g, budget: 60 }, ix,
        { ...p, at: a.id, visited: [], photographed: [], actions: [] }, r, b.id);
      if (walk.blocked && walk.blocked.reason === 'river') pair = { a, b, r };
    }
  }
  ok('the map has a pair the river keeps apart', !!pair);
  if (pair) {
    p.at = pair.a.id;
    const dry = checkMove(g, ix, p, pair.r, pair.b.id, { kayak: true });
    eq('asking for a kayak you have not got says so', dry.why, 'you have no kayak');

    p.actions.push({ kind: 'kayak', used: false });
    const wet = checkMove(g, ix, p, pair.r, pair.b.id, { kayak: true });
    ok('with a kayak the river is no longer a wall',
      !wet.blocked || wet.blocked.reason !== 'river', wet.why);
    // Cheaper how: three of the lines you cross while on the water are free.
    // Not measurable against the walking cost — a route down a river is blocked
    // on foot, and a blocked route only reports what its legal prefix cost.
    const down = (map.rivers || [])[0].pts.slice(0, 40);
    ok('walking down a river is walking IN it, so it is refused',
      costRoute(ix, down).blocked.reason === 'river');
    let all = 0;
    for (let i = 0; i + 1 < down.length; i++) all += ix.lines.hits(down[i], down[i + 1]).length;
    const paddled = costRoute(ix, down, { kayak: true });
    ok('...but paddling it is allowed', !paddled.blocked);
    eq('and three of the lines it crosses are free', all - paddled.cost, 3);
    ok('...only three', all > 3 && paddled.cost > 0, `${all} crossings in all`);

    // and a kayak is no use where there is no water
    const dryLand = [[0.2, 0.2], [0.4, 0.25]];
    const nope = checkMove(g, ix, p, dryLand, pair.b.id, { kayak: true });
    eq('a kayak on a dry hillside is refused', nope.why, 'that route never meets the river');
  }
}
{
  // THE GLIDER. Same story: earned, stored, never read.
  const g = fresh();
  const p = g.players[0];
  const mtn = ix.waypoints.find((w) => w.type === 'mountain');
  p.at = mtn.id;
  const near = glideTargets(g, ix, p);
  eq('no glider in the pack, nowhere to glide', near.length, 0);

  p.actions.push({ kind: 'glider', used: false });
  const targets = glideTargets(g, ix, p);
  ok('from a mountain, with a glider, there is somewhere to land', targets.length > 0);
  ok('...and never another mountain', targets.every((w) => w.type !== 'mountain'));
  ok('...and never more than one square away', targets.every((w) =>
    Math.abs(Math.floor(w.x) - Math.floor(mtn.x)) <= 1
    && Math.abs(Math.floor(w.y) - Math.floor(mtn.y)) <= 1));

  const r = glide(g, ix, p, targets[0].id);
  ok('the glide is taken', r.ok, r.why);
  eq('...and you come down where you landed', p.at, targets[0].id);
  ok('...and it counts as visited', p.visited.includes(targets[0].id));
  // Not `hasAction`: landing marks a track, and a track space can hand you
  // fresh gear — including a backpack, which stands in for a glider.
  ok('...and the glider itself is spent',
    p.actions.find((a) => a.kind === 'glider').used === true);

  // you cannot launch from flat ground
  const g2 = fresh();
  const p2 = g2.players[0];
  p2.actions.push({ kind: 'glider', used: false });
  const flat = ix.waypoints.find((w) => w.type === 'bear');
  p2.at = flat.id;
  eq('no launching off a bear', glide(g2, ix, p2, ix.waypoints.find((w) =>
    w.type === 'bird').id).why, 'you have to launch off a mountain');
}

// ------------------------------------- water you find on the way, spent on it
{
  const g = fresh();
  const p = g.players[0];
  g.phase = 'move';
  // Any legal route that walks past a lake it has not seen. Rather than hunting
  // the map for a route that happens to fit a budget, set the weather so the
  // bottles are exactly what closes the gap.
  let leg = null;
  for (const a of ix.waypoints) {
    if (leg) break;
    for (const b of ix.waypoints) {
      if (a.id === b.id) continue;
      const r = [[a.x, a.y], [b.x, b.y]];
      const lakes = routeTouches(ix, r).lakes;
      const c = costRoute(ix, r, { from: a.id, to: b.id });
      if (lakes.length && !c.blocked && c.cost > lakes.length) {
        leg = { a, b, r, cost: c.cost, lakes: lakes.length }; break;
      }
    }
  }
  ok('the map has a route that walks past a lake', !!leg);
  if (leg) {
    p.at = leg.a.id;
    p.water = 0;
    g.budget = leg.cost - leg.lakes;          // short by exactly the bottles

    const dry = checkMove(g, ix, p, leg.r, leg.b.id);
    eq('with no bottle it is out of reach', dry.ok, false);
    eq('...but it knows the lakes are on the way', dry.fill, leg.lakes);
    eq('...so you are carrying what you have not picked up yet', dry.carrying, leg.lakes);

    const drunk = checkMove(g, ix, p, leg.r, leg.b.id, { water: leg.lakes });
    eq('the bottles you fill on the way can be drunk on the way',
      drunk.budget, g.budget + leg.lakes);
    ok('...which is exactly enough', drunk.ok, drunk.why);

    const r = commitMove(g, ix, board, p, leg.r, leg.b.id, { water: leg.lakes });
    ok('the move is taken', r.ok, r.why);
    eq('filled on the way, drunk on the way, none left over', p.water, 0);
    eq('...and the card knows they were used', p.waterUsed, leg.lakes);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
