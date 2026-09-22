// Waypoints — the view stepper. `node game/view.test.mjs`.
//
// Only the arithmetic: which standard view a button press lands on. The camera
// and the paper are judged by looking at them, but "does + walk the list the
// right way" is a question a test answers in a millisecond and a browser
// running at two frames a second answers badly.

// Imported, not reimplemented — a test that carries its own copy of the thing
// it is testing passes whatever the real one does.
import { nextStop, STOPS, clipFor } from './views.js';
console.log('stops:', STOPS.join(', '));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; return; }
  fail++; console.log(`  FAIL  ${name}: got ${got}, want ${want}`);
};
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`);
};

// walking out from the default lands on every stop in turn, then stops
let z = 100;
for (const want of [651, 800, 950]) { z = nextStop(z, 1); eq(`out to ${want}`, z, want); }
eq('nothing past the last stop', nextStop(950, 1), undefined);

// and back in again
for (const want of [800, 651, 100, 0]) { z = nextStop(z, -1); eq(`in to ${want}`, z, want); }
eq('nothing below the first stop', nextStop(0, -1), undefined);

// from anywhere in between, the nearest stop the right side of you
eq('out from mid-band', nextStop(430, 1), 651);
eq('in from mid-band', nextStop(430, -1), 100);
eq('out from just under a stop', nextStop(649, 1), 651);
eq('in from just over a stop', nextStop(653, -1), 651);

// parked exactly on a stop, a press still moves
eq('out when parked on 651', nextStop(651, 1), 800);
eq('in when parked on 651', nextStop(651, -1), 100);
eq('out when parked on 0', nextStop(0, 1), 100);

// and a fraction off it counts as parked, not as a new place to step from
eq('out from 651.4', nextStop(651.4, 1), 800);
eq('in from 650.6', nextStop(650.6, -1), 100);

// ------------------------------------------------- which clip, and how fast
{
  const still = { x: 0, y: 0 };
  // Every branch has to hand back a PAIR. It once handed back nothing at all,
  // because the method was called and never defined, and the game died the
  // moment autopilot started.
  const cases = [
    ['autopilot, strolling', { ...still, auto: true }, 1.4, 'walk'],
    ['autopilot, hurrying', { ...still, auto: true }, 40, 'run'],
    ['forward', { x: 0, y: -1 }, 1.4, 'walk'],
    ['back', { x: 0, y: 1 }, 1.4, 'run_back'],
    ['left', { x: -1, y: 0 }, 1.4, 'run_left'],
    ['right', { x: 1, y: 0 }, 1.4, 'run_right'],
    ['mostly forward, a little right', { x: 0.3, y: -1 }, 1.4, 'walk'],
    ['mostly right, a little forward', { x: 1, y: -0.3 }, 1.4, 'run_right'],
  ];
  for (const [name, input, mps, want] of cases) {
    const got = clipFor(input, mps);
    ok(`${name} is a pair`, Array.isArray(got) && got.length === 2, JSON.stringify(got));
    eq(`${name} -> ${want}`, got[0], want);
    ok(`${name} has a sane rate`, got[1] > 0.2 && got[1] < 3, String(got[1]));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
