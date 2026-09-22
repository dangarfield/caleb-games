// Waypoints — the lessons. `node game/tutor.test.mjs`
//
// The tutorial reads the game rather than counting steps, so what has to be
// true is that every moment of a first game maps to the RIGHT sentence — and
// that the specific cases beat the general ones, because "not that way" and
// "draw your walk" are both true of a line that will not work.

import { LESSONS, lessonFor } from './tutor.js';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; return; } fail++; console.log(`  FAIL  ${n}${x ? '  ' + x : ''}`); };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);
const at = (v) => { const l = lessonFor(v); return l ? l.id : null; };

// ---------------------------------------------------------------- the shape
{
  eq('every lesson has an id, a title and a line',
    LESSONS.filter((l) => l.id && l.title && l.line && typeof l.at === 'function').length,
    LESSONS.length);
  const ids = new Set(LESSONS.map((l) => l.id));
  eq('the ids are unique', ids.size, LESSONS.length);
  // Written for an eight-year-old: the instruction is one short sentence.
  const longest = Math.max(...LESSONS.map((l) => l.line.length));
  ok('no lesson line runs past 90 characters', longest <= 90, `longest is ${longest}`);
}

// ---------------------------------------------------------------- a first game
{
  eq('the mission comes first', at({ phase: 'goal' }), 'goal');
  eq('then where you wake up', at({ phase: 'start', startPick: null }), 'camp');
  eq('then tapping the gold pin', at({ phase: 'start', startPick: 3 }), 'camp-tap');
  eq('then the weather', at({ phase: 'roll' }), 'roll');
  eq('then drawing a line', at({ phase: 'move' }), 'draw');
  eq('mid-drag it keeps going', at({ phase: 'move', drawing: true }), 'draw-on');
  eq('a finished line talks about cost',
    at({ phase: 'move', drawing: true, draft: { ok: true, cost: 4 } }), 'cost');
  eq('a bad line says try another way',
    at({ phase: 'move', drawing: true, draft: { ok: false, why: 'lake' } }), 'bad');
  eq('stuck beats draw', at({ phase: 'move', stuck: true }), 'stuck');
  eq('walking has its own lesson', at({ phase: 'move', screen: 'walk' }), 'walk');
  eq('the wood asks for a photo', at({ phase: 'move', pending: 1 }), 'trees');
  eq('the journal at the end of a day', at({ phase: 'journal' }), 'journal');
  eq('and a last word', at({ phase: 'over' }), 'over');
}

// ---------------------------------------------------------------- safety
{
  eq('nothing to say about a phase it does not know', at({ phase: 'nonsense' }), null);
  eq('and nothing at all without a game', at(null), null);
  ok('a lesson that throws is skipped rather than fatal',
    lessonFor({ get phase() { throw new Error('boom'); } }) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
