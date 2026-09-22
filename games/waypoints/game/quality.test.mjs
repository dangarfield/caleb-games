// Waypoints — what each machine is allowed. `node game/quality.test.mjs`
//
// The tier is a guess, and a guess that is wrong in the generous direction is
// the expensive one: a four-year-old tablet handed the full park plays at four
// frames a second and the child puts it down. So the cases that matter here are
// the mean ones — little memory, few cores, a phone that claims eight of them.

import { TIERS, guessTier, lower, median } from './quality.js';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; return; } fail++; console.log(`  FAIL  ${n}${x ? '  ' + x : ''}`); };
const eq = (n, g, w) => ok(n, g === w, `got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`);

const nav = (o) => ({ userAgent: 'Mozilla/5.0', ...o });
const win = (o = {}) => ({ screen: { width: 1280 }, devicePixelRatio: 1, ...o });
const PAD = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
const DROID = 'Mozilla/5.0 (Linux; Android 11; SM-T500) AppleWebKit/537.36 Mobile';

// ---------------------------------------------------------------- the tiers
{
  for (const t of ['low', 'mid', 'high']) {
    const q = TIERS[t];
    ok(`${t} says how many pixels`, q.pixels > 0 && q.pixels <= 2);
    ok(`${t} says a heightfield resolution`, q.res >= 32 && q.res <= 64);
    ok(`${t} scales the scenery`, q.scenery > 0 && q.scenery <= 1);
  }
  ok('low is cheaper than mid, which is cheaper than high',
    TIERS.low.pixels <= TIERS.mid.pixels && TIERS.mid.pixels <= TIERS.high.pixels
    && TIERS.low.scenery < TIERS.high.scenery && TIERS.low.res < TIERS.high.res);
  ok('only the bottom tier turns antialiasing off', !TIERS.low.aa && TIERS.mid.aa && TIERS.high.aa);
}

// ---------------------------------------------------------------- guessing
{
  eq('a plain desktop gets the lot', guessTier(nav({ hardwareConcurrency: 8, deviceMemory: 16 }), win()), 'high');
  eq('a desktop short of memory gets mid',
    guessTier(nav({ hardwareConcurrency: 8, deviceMemory: 4 }), win()), 'mid');
  eq('two cores is low whatever else it says',
    guessTier(nav({ hardwareConcurrency: 2, deviceMemory: 16 }), win()), 'low');
  eq('2GB is low whatever else it says',
    guessTier(nav({ hardwareConcurrency: 8, deviceMemory: 2 }), win()), 'low');
  eq('a cheap Android tablet is low',
    guessTier(nav({ userAgent: DROID, hardwareConcurrency: 4, deviceMemory: 3, maxTouchPoints: 5 }), win()), 'low');
  eq('a good Android tablet earns mid',
    guessTier(nav({ userAgent: DROID, hardwareConcurrency: 8, deviceMemory: 6, maxTouchPoints: 5 }), win()), 'mid');
  // Safari reports neither deviceMemory nor much else, so a big backing store
  // is the only signal an iPad gives that it can drive itself.
  eq('a retina iPad earns mid on its screen alone',
    guessTier(nav({ userAgent: PAD, maxTouchPoints: 5 }), win({ screen: { width: 1180 }, devicePixelRatio: 2 })), 'mid');
  eq('a touch laptop is still a laptop',
    guessTier(nav({ hardwareConcurrency: 12, deviceMemory: 16, maxTouchPoints: 10 }), win({ screen: { width: 1920 }, devicePixelRatio: 2 })), 'mid');
  eq('nothing known at all does not crash', typeof guessTier({}, {}), 'string');
}

// ---------------------------------------------------------------- stepping down
{
  eq('high steps to mid', lower('high'), 'mid');
  eq('mid steps to low', lower('mid'), 'low');
  eq('low is the bottom', lower('low'), null);
}

// ---------------------------------------------------------------- the median
{
  eq('the middle of an odd run', median([10, 60, 12]), 12);
  eq('the middle of an even run', median([10, 20, 30, 40]), 25);
  eq('nothing is nothing', median([]), 0);
  // One 300ms hitch while the scenery rebuilds must not read as a slow machine.
  const sixty = Array(59).fill(16.7).concat([300]);
  ok('a single hitch does not move the median', median(sixty) < 20, `${median(sixty)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
