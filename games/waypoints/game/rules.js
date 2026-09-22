// Waypoints — the rules.
//
// This file is the only place a rule of the paper game is written down, and it
// knows nothing about Three.js, canvases or the DOM. Everything in it is a pure
// function of a map and a play state, which means it runs in node and can be
// tested against `assets/maps/map-01.json` without a browser.
//
// The central object is a ROUTE: an array of `[x, y]` points in cell units, from
// the waypoint you are standing on to the waypoint you are moving to. It does
// not matter whether the player drew it on the map, pointed at something and
// walked, or steered there by hand — one route, costed once, here.
//
// Rule text this implements, from `research/rules.pdf`:
//   "Each line (contour or grid) that your route crosses costs 1 movement
//    point, and any intersections of two lines cost 2 movement points. You can
//    only cross the River at a bridge, but doing so costs you no additional
//    movement points. You cannot move through any other waypoints on the way to
//    the waypoint you end your move at."

import { LineIndex, pointInPoly, nearestOnSeg, nearestOnPoly } from './geometry.js';

/** How close a route has to come to a feature to count as having visited it. */
export const TOUCH = 0.035;          // cells — about 175 m
/** How close to a bridge counts as using it. */
export const BRIDGE_R = 0.085;
// How far outside the water a point that was dragged into it ends up. Far enough
// that no rounding puts it back in the lake, well inside TOUCH so standing on the
// shore still counts as having visited it — which is the whole point of being
// pushed there rather than blocked.
export const SHORE = 0.012;              // cells — about 30 m
// How close to the river counts as being ON it, in a kayak. Wide enough that a
// line drawn down a winding river by hand stays in the water.
export const PADDLE = 0.07;              // cells — about 175 m
// How many lines a kayak carries you across for nothing.
export const PADDLE_FREE = 3;
/** How far apart two river ends can be and still be the same river. */
export const JOIN_GAP = 0.25;          // cells — about 1.2 km

/**
 * Stitch a sectioned river back into a network.
 *
 * Every free end is offered its nearest free end within `gap`, and the pairing
 * is greedy from the closest pair outwards so two ends that clearly belong to
 * each other are matched before either gets claimed by something further away.
 * An end with no partner is left alone — that is a spring, and a stream is
 * allowed to start somewhere.
 */
export function joinRiverEnds(courses, gap) {
  const ends = [];
  for (const c of courses) {
    ends.push({ id: c.id, at: c.pts[0] });
    ends.push({ id: c.id, at: c.pts[c.pts.length - 1] });
  }
  const pairs = [];
  for (let i = 0; i < ends.length; i++) {
    for (let k = i + 1; k < ends.length; k++) {
      if (ends[i].id === ends[k].id) continue;          // not to itself
      const d = Math.hypot(ends[i].at[0] - ends[k].at[0], ends[i].at[1] - ends[k].at[1]);
      if (d <= gap) pairs.push({ i, k, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);
  const used = new Set();
  const out = [];
  for (const p of pairs) {
    if (used.has(p.i) || used.has(p.k)) continue;
    used.add(p.i); used.add(p.k);
    out.push({ a: ends[p.i].id, b: ends[p.k].id, from: ends[p.i].at, to: ends[p.k].at, d: p.d });
  }
  return out;
}

// ---------------------------------------------------------------- the index

/**
 * Everything the rules need to know about a map, precomputed.
 *
 * Built once per map and reused for every turn. `resolve` is handed in by the
 * caller (the mapper's `resolvePts`) so a shape's drawn points and its smoothed
 * curve can never disagree — the ink on the map is what you are costed against.
 */
export function indexMap(map, resolve) {
  const res = resolve || ((s) => s.pts || []);
  const { cols, rows } = map.grid;

  // Contours and the printed grid are the same thing to the rules: a line that
  // costs 1 to cross. They are kept as separate kinds only so the UI can say
  // which is which.
  const lines = new LineIndex(0.25);
  for (const c of map.contours || []) {
    const pts = res(c);
    if (pts.length > 1) lines.add(`c:${c.id}`, 'contour', pts);
  }
  for (let i = 1; i < cols; i++) lines.add(`g:v${i}`, 'grid', [[i, 0], [i, rows]]);
  for (let j = 1; j < rows; j++) lines.add(`g:h${j}`, 'grid', [[0, j], [cols, j]]);

  // Rivers are a barrier, not a cost. They get their own index so a crossing
  // can be refused rather than charged.
  //
  // A river is DRAWN in sections, and the sections stop a few hundred metres
  // short of each other where they meet — on the map they read as one river,
  // because the channel is nearly as wide as the gap. To a hairline centreline
  // test they are two rivers with a hole between them, and a walker strolls
  // through the hole. So ends that face each other across less than
  // `JOIN_GAP` are joined here, in the index only: the map data stays exactly
  // as it was traced, and the rules read it the way a person reads it.
  const rivers = new LineIndex(0.25);
  const courses = [];
  for (const r of map.rivers || []) {
    const pts = res(r);
    if (pts.length > 1) { rivers.add(`r:${r.id}`, 'river', pts); courses.push({ id: r.id, pts }); }
  }
  const riverJoins = joinRiverEnds(courses, JOIN_GAP);
  for (const j of riverJoins) rivers.add(`r:join:${j.a}-${j.b}`, 'river', [j.from, j.to]);

  const lakes = (map.lakes || []).map((l) => ({ id: l.id, pts: res(l) }))
    .filter((l) => l.pts.length > 2);
  const woods = (map.woodland || []).map((w) => ({ id: w.id, pts: res(w) }))
    .filter((w) => w.pts.length > 2);
  const bridges = (map.bridges || []).map((b) => ({ id: b.id, x: b.x, y: b.y }));
  const waypoints = (map.waypoints || []).map((w) => ({ ...w }));

  return {
    map, cols, rows, lines, rivers, lakes, woods, bridges, waypoints, riverJoins,
    // Every "+10 for all of them" is counted off THIS map, not off the printed
    // sheet: map 01 as traced has 13 lakes where the paper says 9, and the map
    // is the thing being walked.
    totals: {
      lakes: lakes.length,
      woodland: woods.length,
      bridges: bridges.length,
      squares: cols * rows,
    },
    byId: new Map(waypoints.map((w) => [w.id, w])),
  };
}

// ---------------------------------------------------------------- costing

const isWet = (ix, p) => ix.lakes.some((l) => pointInPoly(p, l.pts));

/**
 * The lake this point is IN, if it is properly in one.
 *
 * `slack` forgives the shore: a point pushed just outside the edge, or sitting
 * on it, is not in the water. Without that, a route drawn along a lakeside
 * flickers between legal and blocked on rounding alone.
 */
export function inWater(ix, p, slack = 0) {
  for (const l of ix.lakes) {
    if (!pointInPoly(p, l.pts)) continue;
    const n = nearestOnPoly(p, l.pts);
    if (n.d > slack) return { lake: l, at: n, depth: n.d };
  }
  return null;
}

/**
 * Push a point out of the water, onto the nearest shore.
 *
 * You cannot walk on a lake, so dragging over one does not draw a line you are
 * then told off for: the line goes to the water's edge instead, which is close
 * enough to count as visiting it. Returns the point unchanged if it was dry.
 */
export function toShore(ix, p) {
  const w = inWater(ix, p, 0);
  if (!w) return p;
  const { x, y } = w.at;
  // out along the line from the shore point back to where the finger is is the
  // wrong way — that leads back into the lake. Out is away from the water.
  const dx = x - p[0], dy = y - p[1], d = Math.hypot(dx, dy) || 1;
  return [x + (dx / d) * SHORE, y + (dy / d) * SHORE];
}

/** Every point of a line, kept out of the water. */
export function keepDry(ix, line) {
  return line.map((p) => toShore(ix, p));
}

/** Is this point on the river, near enough to be paddling it? */
function onTheRiver(ix, p) {
  return !!ix.rivers.nearest([p.x, p.y], PADDLE);
}

/**
 * Does this route touch the river at all?
 *
 * The kayak is only worth offering when there is water to put it in — a paddle
 * across a dry hillside is not a thing the game should let a child pick and then
 * wonder why nothing happened.
 */
export function meetsRiver(ix, route) {
  for (let i = 0; i + 1 < route.length; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(route[i + 1][0] - route[i][0],
      route[i + 1][1] - route[i][1]) / PADDLE));
    for (let k = 0; k <= n; k++) {
      const x = route[i][0] + ((route[i + 1][0] - route[i][0]) * k) / n;
      const y = route[i][1] + ((route[i + 1][1] - route[i][1]) * k) / n;
      if (onTheRiver(ix, { x, y })) return true;
    }
  }
  return false;
}

/**
 * Can he put his foot there?
 *
 * The walk's version of the route rules. A drawn route is checked once, by
 * `costRoute`, before it is ever walked — but once he is out there he can steer
 * wherever he likes, and "wherever he likes" has to mean the same places the
 * pencil was allowed to go. Otherwise the river is a barrier on paper and a
 * puddle on foot.
 */
export function stepBlocked(ix, a, b) {
  if (inWater(ix, b, SHORE)) return 'water';
  for (const h of ix.rivers.hits(a, b)) if (!atBridge(ix, h.x, h.y)) return 'river';
  return null;
}

/**
 * Does this leg cross water, rather than merely run along it?
 *
 * Endpoints are not enough: a straight line between two dry points can cut
 * clean across a lake, and on paper that is exactly what you are not allowed to
 * do. Sampled, because a lake is a polygon and the question is about the middle
 * of the leg.
 */
function legInWater(ix, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.02));
  for (let k = 0; k <= n; k++) {
    const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    const w = inWater(ix, p, SHORE);
    if (w) return p;
  }
  return null;
}

/** Is this river crossing at a bridge? */
function atBridge(ix, x, y) {
  return ix.bridges.some((b) => Math.hypot(b.x - x, b.y - y) <= BRIDGE_R);
}

/**
 * What a route costs, and why.
 *
 * Returns `{ cost, crossings, bridges, blocked }`. `blocked` is null for a legal
 * route, or `{ reason, at }` for one that cannot be drawn at all — through water,
 * across the river away from a bridge, or through another waypoint.
 *
 * On "an intersection of two lines costs 2": counting each line crossed
 * separately already gives 2 where two lines meet, because the route crosses
 * both of them. The rule is written out on paper to stop you claiming a corner
 * as one crossing; here it falls out of the counting and needs no special case.
 */
export function costRoute(ix, route, opts = {}) {
  const from = opts.from || null;            // waypoint id you set off from
  const to = opts.to || null;                // waypoint id you are heading for
  // In a kayak you are IN the river rather than looking for a way over it: it
  // stops being a barrier, and the lines you cross while you are on the water
  // are free — up to three of them, after which you are walking again.
  const kayak = !!opts.kayak;
  let freeLeft = kayak ? PADDLE_FREE : 0;
  const crossings = [];
  const bridges = new Set();
  let blocked = null;

  for (let i = 0; i < route.length - 1 && !blocked; i++) {
    const a = route[i], b = route[i + 1];

    // in the water is not a route — and neither is straight across it
    const wet = legInWater(ix, a, b);
    if (wet) { blocked = { reason: 'water', at: wet }; break; }

    // The river stops you unless you are on a bridge. Where it stops you is
    // found FIRST, so the lines crossed after that point are not charged: a
    // blocked route still reports what its legal part cost, which is what the
    // meter shows while you are dragging past something you cannot cross.
    let cut = Infinity;
    for (const h of ix.rivers.hits(a, b)) {
      if (atBridge(ix, h.x, h.y)) {
        const br = ix.bridges.find((x) => Math.hypot(x.x - h.x, x.y - h.y) <= BRIDGE_R);
        if (br) bridges.add(br.id);
      } else if (!kayak) {
        cut = h.t;
        blocked = { reason: 'river', at: [h.x, h.y] };
        break;
      }
    }

    for (const h of ix.lines.hits(a, b)) {
      if (h.t >= cut) continue;
      // A line crossed while you are on the water is a line you paddled under.
      if (freeLeft > 0 && onTheRiver(ix, h)) { freeLeft--; h.free = true; continue; }
      crossings.push(h);
    }
  }

  // you cannot pass through a waypoint that is not where you started or ended
  const through = blocked ? [] : waypointsOn(ix, route, from, to);
  if (!blocked && through.length) {
    blocked = { reason: 'waypoint', at: [through[0].x, through[0].y], id: through[0].id };
  }

  return { cost: crossings.length, crossings, bridges: [...bridges], blocked };
}

/** Waypoints the route runs over, other than its own two ends. */
export function waypointsOn(ix, route, fromId, toId) {
  const out = [];
  for (const w of ix.waypoints) {
    if (w.id === fromId || w.id === toId) continue;
    for (let i = 0; i < route.length - 1; i++) {
      if (nearestOnSeg([w.x, w.y], route[i], route[i + 1]).d <= TOUCH) { out.push(w); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- what it touched

/**
 * The features and squares a route passes through.
 *
 * A lake counts as visited when the route reaches its shore: you cannot walk
 * into the water, so touching the edge is what "moving through it" means here.
 * A woodland you genuinely walk through, so being inside it counts.
 */
export function routeTouches(ix, route) {
  const lakes = new Set(), woods = new Set(), squares = new Set();

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];

    for (const l of ix.lakes) {
      if (lakes.has(l.id)) continue;
      if (touchesPoly(a, b, l.pts, TOUCH)) lakes.add(l.id);
    }
    for (const w of ix.woods) {
      if (woods.has(w.id)) continue;
      if (pointInPoly(a, w.pts) || pointInPoly(b, w.pts) || touchesPoly(a, b, w.pts, 0)) {
        woods.add(w.id);
      }
    }
    // the grid squares the leg passes over, sampled finely enough that a leg
    // clipping a corner still counts it
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      const sx = Math.min(ix.cols - 1, Math.max(0, Math.floor(x)));
      const sy = Math.min(ix.rows - 1, Math.max(0, Math.floor(y)));
      squares.add(sy * ix.cols + sx);
    }
  }
  return { lakes: [...lakes], woodland: [...woods], squares: [...squares] };
}

/** Does segment a-b come within `pad` of a polygon's outline (or cross it)? */
function touchesPoly(a, b, pts, pad) {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const p = pts[j], q = pts[i];
    if (segHit(a, b, p, q)) return true;
    if (pad > 0 && (nearestOnSeg(a, p, q).d <= pad || nearestOnSeg(b, p, q).d <= pad)) return true;
  }
  return false;
}

function segHit(a1, a2, b1, b2) {
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = d(b1, b2, a1), d2 = d(b1, b2, a2), d3 = d(a1, a2, b1), d4 = d(a1, a2, b2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// ---------------------------------------------------------------- reachability

/**
 * The cheapest cost to every point on the map from where you are standing.
 *
 * The player draws their own route and is charged for the one they drew — this
 * does not pick a route for them. What it is for is telling them the truth about
 * what is POSSIBLE: which waypoints are within this turn's budget, so the map
 * can dim the ones that are not.
 *
 * It is a Dijkstra over a lattice, four-neighbour. Four rather than eight
 * because cost here is lines crossed, not distance, and a staircase of small
 * steps crosses exactly the lines a diagonal would — while a diagonal would let
 * a path cut the corner at an intersection and dodge a line it should have paid
 * for.
 *
 * The lattice's edge costs depend only on the map, so they are built once and
 * cached on the index; a turn is then pure array work.
 */
export function buildLattice(ix, res = 0.02) {
  if (ix._lat && ix._lat.res === res) return ix._lat;
  const w = Math.round(ix.cols / res) + 1, h = Math.round(ix.rows / res) + 1;
  const at = (i, j) => [i * res, j * res];
  // cost to step right from (i,j), and down from (i,j); 255 means impassable
  const right = new Uint8Array(w * h), down = new Uint8Array(w * h);
  const wet = new Uint8Array(w * h);

  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (isWet(ix, at(i, j))) wet[j * w + i] = 1;
  }

  const step = (a, b) => {
    if (ix.rivers.hits(a, b).some((x) => !atBridge(ix, x.x, x.y))) return 255;
    return Math.min(254, ix.lines.hits(a, b).length);
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    right[k] = (i + 1 < w && !wet[k] && !wet[k + 1]) ? step(at(i, j), at(i + 1, j)) : 255;
    down[k] = (j + 1 < h && !wet[k] && !wet[k + w]) ? step(at(i, j), at(i, j + 1)) : 255;
  }
  ix._lat = { res, w, h, right, down, wet };
  return ix._lat;
}

/** Minimum cost from one point to every lattice node. `Infinity` where unreachable. */
export function costField(ix, from, maxCost = 60) {
  const lat = buildLattice(ix);
  const { w, h, right, down, wet } = lat;
  const dist = new Float32Array(w * h).fill(Infinity);
  const si = Math.max(0, Math.min(w - 1, Math.round(from[0] / lat.res)));
  const sj = Math.max(0, Math.min(h - 1, Math.round(from[1] / lat.res)));
  const start = sj * w + si;
  if (wet[start]) return { lat, dist };

  // Costs are small integers, so a bucket queue beats a heap and never has to
  // compare anything: every edge is 0..254 and the frontier only moves forward.
  const buckets = Array.from({ length: maxCost + 1 }, () => []);
  dist[start] = 0; buckets[0].push(start);
  for (let d = 0; d <= maxCost; d++) {
    const q = buckets[d];
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      if (dist[k] !== d) continue;                 // a stale entry
      const i = k % w, j = (k / w) | 0;
      const push = (nk, c) => {
        if (c >= 255) return;
        const nd = d + c;
        if (nd <= maxCost && nd < dist[nk]) { dist[nk] = nd; buckets[nd].push(nk); }
      };
      if (i + 1 < w) push(k + 1, right[k]);
      if (i > 0) push(k - 1, right[k - 1]);
      if (j + 1 < h) push(k + w, down[k]);
      if (j > 0) push(k - w, down[k - w]);
    }
  }
  return { lat, dist };
}

/**
 * Which waypoints this turn's budget can reach.
 *
 * `visited` is the set of waypoint ids already visited or photographed — the
 * rules forbid returning to either.
 */
export function reachable(ix, fromId, budget, visited = new Set()) {
  const from = ix.byId.get(fromId);
  if (!from) return [];
  const { lat, dist } = costField(ix, [from.x, from.y], Math.max(0, budget));
  const out = [];
  for (const w of ix.waypoints) {
    if (w.id === fromId || visited.has(w.id)) continue;
    const i = Math.max(0, Math.min(lat.w - 1, Math.round(w.x / lat.res)));
    const j = Math.max(0, Math.min(lat.h - 1, Math.round(w.y / lat.res)));
    const d = dist[j * lat.w + i];
    if (d <= budget) out.push({ id: w.id, type: w.type, cost: d });
  }
  return out.sort((a, b) => a.cost - b.cost);
}

// ---------------------------------------------------------------- scoring

/** The four journal entries, scored against one hike's visits. */
export function journalScores(hike, ix) {
  const types = (hike.waypoints || [])
    .map((id) => ix.byId.get(id))
    .filter((w) => w && w.type !== 'campsite')       // campsites never count
    .map((w) => w.type);
  const count = new Map();
  for (const t of types) count.set(t, (count.get(t) || 0) + 1);

  const different = count.size;
  const mostOfOne = Math.max(0, ...count.values());
  const twiceOver = [...count.values()].filter((n) => n >= 2).length;
  const squares = (hike.squares || []).length;

  return {
    j1: 1 * different,
    j2: 2 * mostOfOne,
    j3: 3 * twiceOver,
    j4: 1 * Math.floor(squares / 2),
  };
}

/** A journal entry doubles when the hike finishes at a campsite. */
export function journalValue(hike, ix, which) {
  const v = journalScores(hike, ix)[which] || 0;
  return hike.endedAtCampsite ? v * 2 : v;
}

/** The chosen goal's score, with its completion bonus taken off the map's own totals. */
export function goalScore(ix, goal, seen) {
  const spec = {
    a: { per: 2, key: 'lakes' },
    b: { per: 2, key: 'woodland' },
    c: { per: 1, key: 'squares' },
    d: { per: 3, key: 'bridges' },
  }[goal];
  if (!spec) return { score: 0, n: 0, of: 0, complete: false };
  const n = (seen[spec.key] || []).length;
  const of = ix.totals[spec.key];
  const complete = of > 0 && n >= of;
  return { score: n * spec.per + (complete ? 10 : 0), n, of, complete };
}
