// Waypoints — rules tests. `node game/rules.test.mjs` from the game folder.
//
// These run against the real traced map, not a fixture, because the rules only
// matter if they are right about the map that is actually being walked.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from '../mapper/state.js';
import {
  indexMap, costRoute, routeTouches, reachable, costField,
  journalScores, journalValue, goalScore, waypointsOn,
  inWater, toShore, keepDry, SHORE, TOUCH,
} from './rules.js';
import { smoothPath } from './geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
// Through the app's own migration, so the tests and the game see the same map:
// a traced file has no board or card on it until `migrate` puts the printed
// sheet back, and a test running against a different map from the game is worse
// than no test at all.
const map = migrate(JSON.parse(readFileSync(join(here, '..', 'assets', 'maps', 'map-01.json'), 'utf8')));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${got}, want ${want}`);

// The tests cost routes against the points as DRAWN, not the smoothed curve, so
// they do not need the mapper's spline. The game passes `resolvePts` in.
const ix = indexMap(map);
const wp = (id) => ix.byId.get(id);

console.log(`map: ${ix.waypoints.length} waypoints, ${ix.totals.lakes} lakes, ` +
  `${ix.totals.woodland} woodland, ${ix.totals.bridges} bridges, ${ix.totals.squares} squares`);

// ---------------------------------------------------------------- index
ok('every waypoint has a type', ix.waypoints.every((w) => w.type));
{
  // A waypoint is a RING drawn on the paper, and four of map 01's bottom-edge
  // rings straddle the edge by 50-250 m. That is the trace, not a bug, so the
  // tolerance is one ring — but anything further out would be a real mistake.
  const R = 0.08;
  const out = ix.waypoints.filter((w) =>
    w.x < -R || w.y < -R || w.x > ix.cols + R || w.y > ix.rows + R);
  ok('no waypoint is more than a ring off the sheet', out.length === 0,
    out.map((w) => `${w.id} ${w.x},${w.y}`).join(' '));
  const edge = ix.waypoints.filter((w) => w.y > ix.rows || w.x > ix.cols || w.x < 0 || w.y < 0);
  if (edge.length) console.log(`  note: ${edge.length} waypoint rings straddle the sheet edge`);
}
eq('six campsites', ix.waypoints.filter((w) => w.type === 'campsite').length, 6);
ok('campsites numbered 1-6',
  [...new Set(ix.waypoints.filter((w) => w.type === 'campsite').map((w) => w.number))]
    .sort().join(',') === '1,2,3,4,5,6');
ok('every mountain has a height',
  ix.waypoints.filter((w) => w.type === 'mountain').every((w) => w.height > 0));
eq('totals come off the map', ix.totals.squares, map.grid.cols * map.grid.rows);

// ---------------------------------------------------------------- costing
{
  // a zero-length route crosses nothing
  const r = costRoute(ix, [[0.5, 0.5], [0.5, 0.5]]);
  eq('a route to nowhere costs nothing', r.cost, 0);
  ok('...and is not blocked', r.blocked === null);
}
{
  // crossing the printed grid line x=1 exactly once, in open ground
  const r = costRoute(ix, [[0.9, 0.05], [1.1, 0.05]]);
  ok('a grid line costs 1', r.cost >= 1, `cost ${r.cost}`);
  ok('...and is charged as a grid line', r.crossings.some((c) => c.kind === 'grid'));
}
{
  // A leg right across the park is stopped by the river, wherever you draw it:
  // the White Peak runs the width of map 01 and there are only eight bridges.
  const r = costRoute(ix, [[0.05, 2.0], [5.95, 2.0]]);
  ok('the river cuts the park in two', r.blocked && r.blocked.reason === 'river',
    JSON.stringify(r.blocked));
  ok('...and a blocked route still reports what its legal part cost',
    r.crossings.length === r.cost, `${r.crossings.length} vs ${r.cost}`);
}
{
  // Straight routes between waypoints: most cost something, and none of them
  // ever costs more than the crossings it recorded.
  let legal = 0, priced = 0, dearest = 0, mismatched = 0;
  for (const a of ix.waypoints) for (const b of ix.waypoints) {
    if (a === b) continue;
    const r = costRoute(ix, [[a.x, a.y], [b.x, b.y]], { from: a.id, to: b.id });
    if (r.blocked) continue;
    legal++;
    if (r.cost > 0) priced++;
    if (r.cost > dearest) dearest = r.cost;
    if (r.crossings.length !== r.cost) mismatched++;
  }
  eq('cost is exactly the crossings recorded', mismatched, 0);
  ok('some straight routes are legal', legal > 50, `${legal}`);
  ok('...and most of them cross something', priced > legal * 0.9, `${priced}/${legal}`);
  ok('...and the dearest is a real hike', dearest >= 8, `${dearest}`);
  console.log(`  straight routes: ${legal} legal, dearest ${dearest} points`);
}
{
  // A legal route costs the same walked backwards. A BLOCKED one need not:
  // the cost reported is the cost of the legal part, and which part is legal
  // depends on which end you set off from.
  let checked = 0, asym = 0, blockAsym = 0;
  for (const a of ix.waypoints) for (const b of ix.waypoints) {
    if (a.id >= b.id) continue;
    const f = costRoute(ix, [[a.x, a.y], [b.x, b.y]], { from: a.id, to: b.id });
    const r = costRoute(ix, [[b.x, b.y], [a.x, a.y]], { from: b.id, to: a.id });
    if (!!f.blocked !== !!r.blocked) blockAsym++;
    if (f.blocked || r.blocked) continue;
    checked++;
    if (f.cost !== r.cost) asym++;
  }
  ok('there are legal routes to check', checked > 50, `${checked}`);
  eq('a legal route costs the same walked backwards', asym, 0);
  eq('...and a route is blocked from both ends or neither', blockAsym, 0);
}
{
  // a route through a lake is not a route
  const lake = ix.lakes[0];
  const c = lake.pts.reduce((s, p) => [s[0] + p[0] / lake.pts.length, s[1] + p[1] / lake.pts.length], [0, 0]);
  const r = costRoute(ix, [[c[0], c[1]], [c[0] + 0.01, c[1]]]);
  ok('you cannot walk in the water', r.blocked && r.blocked.reason === 'water',
    JSON.stringify(r.blocked));
}

// ---------------------------------------------------------------- the river
{
  // find a leg that crosses a river away from any bridge
  let blockedSomewhere = false, bridgedSomewhere = false;
  for (const b of ix.bridges) {
    // straight through the bridge: allowed, and free of river charge
    const r = costRoute(ix, [[b.x - 0.05, b.y - 0.05], [b.x + 0.05, b.y + 0.05]]);
    if (!r.blocked && r.bridges.includes(b.id)) bridgedSomewhere = true;
  }
  ok('a bridge lets you over the river', bridgedSomewhere);

  const riv = map.rivers[0];
  const p = riv.pts[Math.floor(riv.pts.length / 2)];
  const q = riv.pts[Math.floor(riv.pts.length / 2) + 1] || riv.pts[0];
  // step across the river at right angles to it, mid-course
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * 0.06, ny = dx / len * 0.06;
  const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const r = costRoute(ix, [[mid[0] - nx, mid[1] - ny], [mid[0] + nx, mid[1] + ny]]);
  blockedSomewhere = !!(r.blocked && r.blocked.reason === 'river');
  ok('the river stops you away from a bridge', blockedSomewhere, JSON.stringify(r.blocked));
}

// ---------------------------------------------------------------- the river as a barrier
{
  // The river is drawn in sections whose ends stop a few hundred metres short of
  // each other. On the map that reads as one river; to a hairline centreline test
  // it is a row of separate rivers with holes between them, and a walker strolls
  // straight through. These are the tests that catch that regressing.
  // A river drawn in one piece needs NO stitching, and this map's is. The test
  // is that the stitching is CORRECT when it happens, not that it happens —
  // asserting a join count made the suite fail the day the map got better.
  ok('every inferred join is a short one',
    ix.riverJoins.every((j) => j.d <= 0.25), JSON.stringify(ix.riverJoins.map((j) => +j.d.toFixed(3))));
  ok('...and no section is joined to itself', ix.riverJoins.every((j) => j.a !== j.b));
  console.log(`  river: ${map.rivers.length} sections, ${ix.riverJoins.length} joins inferred`);

  // The real test of a barrier: take the bridges away and the park must break
  // apart. If it does not, the river is decorative and the bridge rule is dead.
  const noBridges = JSON.parse(JSON.stringify(map));
  noBridges.bridges = [];
  const nb = indexMap(noBridges);
  const start = ix.waypoints.find((w) => w.type === 'campsite' && w.number === 1);

  const all = reachable(ix, start.id, 250).length;
  const cut = reachable(nb, start.id, 250).length;
  eq('with bridges you can get everywhere', all, ix.waypoints.length - 1);
  ok('without bridges you cannot', cut < all, `${cut} vs ${all}`);
  ok('...and a real part of the park is cut off', cut <= all * 0.85, `${cut}/${all}`);
  console.log(`  bridges removed leaves ${cut}/${all} waypoints reachable`);

  const { lat, dist } = costField(nb, [start.x, start.y], 250);
  let reached = 0, dry = 0;
  for (let k = 0; k < dist.length; k++) if (!lat.wet[k]) { dry++; if (dist[k] < Infinity) reached++; }
  ok('the far bank is genuinely unreachable without a bridge', reached < dry * 0.9,
    `${Math.round((reached / dry) * 100)}% still reachable`);
}

// ---------------------------------------------------------------- waypoints in the way
{
  const a = ix.waypoints[0], b = ix.waypoints[1];
  const through = waypointsOn(ix, [[a.x, a.y], [b.x, b.y]], a.id, b.id);
  ok('a route does not trip over its own ends', !through.some((w) => w.id === a.id || w.id === b.id));

  // a route drawn straight over a third waypoint is refused
  let found = null;
  for (const c of ix.waypoints) {
    if (c === a) continue;
    for (const d of ix.waypoints) {
      if (d === a || d === c) continue;
      const hit = waypointsOn(ix, [[c.x, c.y], [d.x, d.y]], c.id, d.id);
      if (hit.length) { found = [c, d, hit]; break; }
    }
    if (found) break;
  }
  ok('you cannot pass through another waypoint', !!found,
    found ? '' : '(no such pair on this map — not necessarily a bug)');
}

// ---------------------------------------------------------------- what it touched
{
  const t = routeTouches(ix, [[0.05, 2.0], [5.95, 2.0]]);
  ok('crossing the map visits several squares', t.squares.length >= 6, `${t.squares.length}`);
  ok('...and no square index is out of range',
    t.squares.every((s) => s >= 0 && s < ix.totals.squares));

  const lake = ix.lakes[0];
  const c = lake.pts.reduce((s, p) => [s[0] + p[0] / lake.pts.length, s[1] + p[1] / lake.pts.length], [0, 0]);
  const t2 = routeTouches(ix, [[c[0] - 0.6, c[1]], [c[0] + 0.6, c[1]]]);
  ok('a route over a lake visits it', t2.lakes.includes(lake.id), JSON.stringify(t2.lakes));
}

// ---------------------------------------------------------------- reachability
{
  const start = ix.waypoints.find((w) => w.type === 'campsite' && w.number === 1);
  const t0 = Date.now();
  const near = reachable(ix, start.id, 3);
  const far = reachable(ix, start.id, 12);
  const ms = Date.now() - t0;
  ok('a small budget reaches few waypoints', near.length < far.length,
    `${near.length} vs ${far.length}`);
  ok('a bigger budget never reaches fewer',
    near.every((n) => far.some((f) => f.id === n.id)));
  ok('reachable never includes where you are standing',
    !far.some((w) => w.id === start.id));
  ok('costs are within budget', far.every((w) => w.cost <= 12));
  ok('two turns of reachability are quick', ms < 4000, `${ms} ms`);
  console.log(`  reach: ${near.length} at 3 points, ${far.length} at 12 (${ms} ms for both)`);

  const visited = new Set(far.slice(0, 3).map((w) => w.id));
  const after = reachable(ix, start.id, 12, visited);
  ok('visited waypoints drop out', after.length === far.length - visited.size,
    `${after.length} vs ${far.length - visited.size}`);
}
{
  // the cost field must never be cheaper than crossing nothing
  const start = ix.waypoints[0];
  const { dist } = costField(ix, [start.x, start.y], 20);
  let neg = 0;
  for (const d of dist) if (d < 0) neg++;
  eq('no negative costs', neg, 0);
}

// ---------------------------------------------------------------- journal
{
  const bear = ix.waypoints.filter((w) => w.type === 'bear').slice(0, 3).map((w) => w.id);
  const bird = ix.waypoints.filter((w) => w.type === 'bird').slice(0, 1).map((w) => w.id);
  const hike = { waypoints: [...bear, ...bird], squares: [1, 2, 3, 4, 5] };
  const j = journalScores(hike, ix);
  eq('1 per different type', j.j1, 2);
  eq('2 per waypoint of one type', j.j2, 6);          // three bears
  eq('3 per type visited twice', j.j3, 3);            // bears only
  eq('1 per 2 squares, rounded down', j.j4, 2);       // five squares

  eq('a campsite finish doubles it', journalValue({ ...hike, endedAtCampsite: true }, ix, 'j2'), 12);
  eq('...and does nothing mid-hike', journalValue(hike, ix, 'j2'), 6);

  const camp = ix.waypoints.find((w) => w.type === 'campsite');
  const j2 = journalScores({ waypoints: [...bear, camp.id], squares: [] }, ix);
  eq('campsites do not score in the journal', j2.j1, 1);
}

// ---------------------------------------------------------------- goals
{
  const all = ix.lakes.map((l) => l.id);
  const g = goalScore(ix, 'a', { lakes: all.slice(0, 2) });
  eq('2 per lake', g.score, 4);
  ok('...and not complete', !g.complete);
  const gAll = goalScore(ix, 'a', { lakes: all });
  eq('all the lakes on THIS map pays the bonus', gAll.score, all.length * 2 + 10);
  eq('...counted off the map, not the printed 9', gAll.of, ix.totals.lakes);

  const gc = goalScore(ix, 'c', { squares: Array.from({ length: 24 }, (_, i) => i) });
  eq('all 24 squares', gc.score, 24 + 10);
}

// ------------------------------------------------- the rounded route
// A drawn route is smoothed before it is costed, so the line on the paper and
// the line being charged for are the same line. What matters is that smoothing
// never MOVES the points the player put down.
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const two = smoothPath([[1, 1], [2, 2]]);
  eq('two points are already a line', two.length, 2);
  ok('...and are left alone', near(two[0][0], 1) && near(two[1][1], 2));

  const pts = [[1, 1], [2, 1], [2, 2], [3, 2]];
  const line = smoothPath(pts, 6);
  ok('smoothing adds points', line.length > pts.length);
  ok('it starts exactly where you started',
    near(line[0][0], 1) && near(line[0][1], 1));
  ok('it ends exactly on the waypoint you reached',
    near(line[line.length - 1][0], 3) && near(line[line.length - 1][1], 2));
  for (const c of pts.slice(1, -1)) {
    ok(`it passes through the corner ${c}`,
      line.some((q) => near(q[0], c[0]) && near(q[1], c[1])));
  }
  // centripetal, so a tight corner rounds rather than loops out across a
  // contour the player was avoiding
  const xs = line.map((q) => q[0]), ys = line.map((q) => q[1]);
  ok('it does not overshoot the corners by much',
    Math.min(...xs) > 0.85 && Math.max(...xs) < 3.15 &&
    Math.min(...ys) > 0.85 && Math.max(...ys) < 2.15);

  // and the cost is the cost of the line that is drawn
  const a = wp(ix.waypoints[0].id);
  const straight = costRoute(ix, [[a.x, a.y], [a.x + 0.4, a.y + 0.4]]);
  const rounded = costRoute(ix, smoothPath([[a.x, a.y], [a.x + 0.4, a.y + 0.4]]));
  eq('a two-point route costs the same either way', rounded.cost, straight.cost);
}

// ------------------------------------------------- you cannot walk on water
{
  const lake = ix.lakes[0];
  const mid = lake.pts.reduce((a, p) => [a[0] + p[0] / lake.pts.length,
    a[1] + p[1] / lake.pts.length], [0, 0]);

  ok('the middle of a lake is in the water', !!inWater(ix, mid, SHORE));
  const dry = toShore(ix, mid);
  ok('...and the shore it is pushed to is not', !inWater(ix, dry, SHORE));
  ok('...and is close enough to count as visiting it',
    routeTouches(ix, [dry, dry]).lakes.includes(lake.id) ||
    Math.min(...lake.pts.map((q) => Math.hypot(q[0] - dry[0], q[1] - dry[1]))) < TOUCH,
    `${Math.min(...lake.pts.map((q) => Math.hypot(q[0] - dry[0], q[1] - dry[1]))).toFixed(4)}`);
  ok('a dry point is left exactly where it was', toShore(ix, [0.02, 0.02])[0] === 0.02);

  // straight ACROSS a lake is not a route, even with both ends on dry land
  const span = Math.max(...lake.pts.map((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1])));
  const a = [mid[0] - span * 2.2, mid[1]], b = [mid[0] + span * 2.2, mid[1]];
  const across = costRoute(ix, [a, b]);
  ok('a leg straight across a lake is blocked, not merely costly',
    across.blocked && across.blocked.reason === 'water');

  // and a smoothed line is pulled back out of the water
  const wetLine = [[mid[0] - span * 2, mid[1]], mid, [mid[0] + span * 2, mid[1]]];
  ok('a drawn line through a lake has points in it', wetLine.some((q) => inWater(ix, q, SHORE)));
  ok('...and none once it is kept dry',
    keepDry(ix, wetLine).every((q) => !inWater(ix, q, SHORE)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
