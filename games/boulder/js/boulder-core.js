// Boulder — pure game logic (no three.js): holds, body solver, move rules, route search + grading, wall layouts.
import { WALLS } from './boulder-routes.js';
export const GRADE_COLORS = ['#5fcf7a', '#f2d23c', '#3f8ff0', '#f08a2c', '#e5484d', '#9b6bf0', '#f06fb4', '#f5f1e8', '#2a2522'];
export const GRADE_NAMES = ['green', 'yellow', 'blue', 'orange', 'red', 'purple', 'pink', 'white', 'black'];
export const TOP_COLOR = '#ffd32a';
export const WALL = { w: 8.4, h: 9.6 };
export const LIMBS = ['LH', 'RH', 'LF', 'RF'];
export const LIMB_NAMES = { LH: 'Left hand', RH: 'Right hand', LF: 'Left foot', RF: 'Right foot' };
export const isHand = l => l[1] === 'H';
// r = footprint radius (m), drain = grip lost per second at full load (gentle: walls get harder by moves, not by time)
export const HOLD = {
  jug:    { r: .13, drain: .021, cap: 1, hand: 1, foot: 1, slot: .07 },
  crimp:  { r: .12, drain: .06,  cap: 1, hand: 1, foot: 1, slot: .07 },
  sloper: { r: .15, drain: .06,  cap: 1, hand: 1, foot: 1, slot: .07, footDrain: .018 },
  pinch:  { r: .11, drain: .042, cap: 1, hand: 1, foot: 1, slot: .07 },
  pocket: { r: .12, drain: .055, cap: 1, hand: 1, foot: 0, slot: .07 },
  volume: { r: .38, drain: .042, cap: 2, hand: 1, foot: 1, slot: .13, footDrain: .011 },
  ledge:  { r: .36, drain: 0,    cap: 2, hand: 1, foot: 1, slot: .17, rest: 1 },
  top:    { r: .27, drain: .021, cap: 2, hand: 1, foot: 0, slot: .13 },
  foot:   { r: .07, drain: .06,  cap: 1, hand: 0, foot: 1, slot: .04, footDrain: .02 } // foot chip: feet only
};
export const BODY = { arm: .62, leg: .84, off: { LH: [-.2, .5], RH: [.2, .5], LF: [-.12, -.04], RF: [.12, -.04] } };
export const FOOT_LIMIT = { normal: .08, high: .32 }; // how far above the hip a foot may go
export const DYNO_REACH = .45; // extra reach when jumping
export const CROSS_DRAIN = 1.4;
// Moves. The game always allows all of them; the grader switches each off to find which a route needs.
export const TECH = {
  reach: { name: 'Big reach', icon: 'open_in_full', text: 'Holds are further apart now. Stretch right out, and push up with your feet first.' },
  cross: { name: 'Cross-through', icon: 'swap_horiz', text: 'Sometimes one hand has to reach across the other. It is tiring, so do not stay crossed for long!' },
  side: { name: 'Side pulls', icon: 'back_hand', text: 'Some holds face sideways or down. Look for the arrow and lean your body that way.' },
  high: { name: 'High step', icon: 'stairs', text: 'Put a foot up high, near your hip. Then push up to reach holds you could not before.' },
  dyno: { name: 'Jump!', icon: 'keyboard_double_arrow_up', text: 'Some holds are too far away. Drag your hand to it and when it says JUMP, let go to leap. Keep both feet on first!' },
  mix: { name: 'Mix it up', icon: 'shuffle', text: 'Side pulls and jumps on the same wall. Look at the whole route before you start.' },
  boss: { name: 'Boss wall', icon: 'military_tech', text: 'High steps, jumps and tiny holds. The hardest walls in the gym. Plan first, then climb!' }
};
export const GRADE_TECH = [null, null, null, 'reach', 'side', 'high', 'dyno', 'mix', 'boss'];
export const GRADE_NEEDS = { 0: [], 1: [], 2: [], 3: [], 4: ['side'], 5: ['high'], 6: ['dyno'], 7: ['side', 'dyno'], 8: ['high', 'dyno'] }; // moves each grade must require

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rotFor(type, rnd) {
  if (type === 'crimp' || type === 'ledge') return (rnd() - .5) * .3;
  if (type === 'pinch') return Math.PI / 2 + (rnd() - .5) * .5;
  if (type === 'jug' || type === 'top') return (rnd() - .5) * .6;
  return rnd() * Math.PI * 2;
}
export const GAP = .08;
const DIR_ROT = { left: Math.PI / 2, right: -Math.PI / 2, under: Math.PI };

// ---------- layout ----------
export function catalog(walls = WALLS) {
  const out = [];
  walls.forEach((w, wi) => w.problems.forEach((p, slot) => out.push({ wall: wi, slot, grade: p.grade, name: p.name, tech: GRADE_TECH[p.grade] })));
  out.sort((a, b) => a.grade - b.grade || a.wall - b.wall);
  const per = {}; out.forEach(c => { c.k = per[c.grade] = (per[c.grade] || 0) + 1; c.intro = c.k === 1 && !!c.tech; });
  out.forEach((c, i) => { c.index = i; c.count = per[c.grade]; });
  return out;
}
export function buildLayout(wallIndex = 0, walls = WALLS, filler = true) {
  const wall = walls[wallIndex], rnd = mulberry(11 + wallIndex * 97), holds = [], problems = [];
  wall.problems.forEach((p, pi) => {
    const ids = p.holds.map(([type, dx, y, dir, flags]) => {
      const id = holds.length;
      holds.push({ id, type, x: p.cx + dx, y, r: HOLD[type].r, dir: dir || null, jump: !!(flags && flags.includes('J')), color: type === 'top' ? TOP_COLOR : (p.color || GRADE_COLORS[p.grade]), problem: pi, rot: dir ? DIR_ROT[dir] + (rnd() - .5) * .2 : rotFor(type, rnd) });
      return id;
    });
    const start = {}; for (const l in p.start) start[l] = p.start[l] == null ? null : ids[p.start[l]];
    problems.push({ index: pi, grade: p.grade, name: p.name, color: p.color || GRADE_COLORS[p.grade], colorName: GRADE_NAMES[p.grade], holdIds: ids, start, top: ids[ids.length - 1], startIds: [...new Set(Object.values(start).filter(v => v != null))], solution: p.solution, par: p.par, report: p.report, tech: GRADE_TECH[p.grade] });
  });
  if (filler) {
    const used = new Set(wall.problems.map(p => p.color || GRADE_COLORS[p.grade])), pal = GRADE_COLORS.filter(c => !used.has(c));
    const fits = (x, y, r) => holds.every(h => Math.hypot(h.x - x, h.y - y) >= h.r + r + GAP);
    const pool = ['jug', 'crimp', 'sloper', 'pinch', 'pocket', 'jug', 'crimp', 'pinch'];
    const want = Array(8).fill('volume').concat(Array.from({ length: 150 }, () => pool[Math.floor(rnd() * pool.length)]));
    for (const type of want) {
      const r = HOLD[type].r;
      for (let k = 0; k < 300; k++) {
        const x = (rnd() - .5) * (WALL.w - 2 * r - .3), y = r + .2 + rnd() * (WALL.h - 2 * r - .4);
        if (fits(x, y, r)) { holds.push({ id: holds.length, type, x, y, r, dir: null, color: pal[Math.floor(rnd() * pal.length)], problem: -1, rot: rotFor(type, rnd) }); break; }
      }
    }
  }
  return { holds, problems, wall: wallIndex };
}
export function overlaps(layout) {
  const out = [], H = layout.holds;
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++)
    if (Math.hypot(H[i].x - H[j].x, H[i].y - H[j].y) < H[i].r + H[j].r + GAP - 1e-9) out.push([i, j]);
  return out;
}
// stored solution (problem-local indices) -> states of hold ids
export function solutionStates(layout, pi) {
  const p = layout.problems[pi]; if (!p.solution) return null;
  return p.solution.map(a => ({ LH: a[0] == null ? null : p.holdIds[a[0]], RH: a[1] == null ? null : p.holdIds[a[1]], LF: a[2] == null ? null : p.holdIds[a[2]], RF: a[3] == null ? null : p.holdIds[a[3]] }));
}

// ---------- body ----------
export function targetsFor(state, holds) {
  const t = {}, occ = {};
  for (const l of LIMBS) { const id = state[l]; if (id == null) { t[l] = null; continue; } (occ[id] = occ[id] || []).push(l); }
  for (const id in occ) {
    const h = holds[id], ls = occ[id];
    ls.forEach((l, i) => { const s = ls.length > 1 ? (i === 0 ? -1 : 1) * HOLD[h.type].slot : 0; t[l] = [h.x + s, h.y, h.dir]; });
  }
  return t;
}
// Pelvis position so every placed limb can reach. soft = limb being dragged (pulls the body, not required).
export function solve(t, soft, init, opts) {
  const fl = opts && opts.high === false ? FOOT_LIMIT.normal : FOOT_LIMIT.high;
  let sx = 0, sy = 0, sw = 0;
  for (const l of LIMBS) {
    const q = t[l]; if (!q) continue;
    const o = BODY.off[l], h = isHand(l), w = (l === soft ? .5 : 1) * (h ? 1 : 1.2);
    sx += (q[0] - o[0]) * w; sy += (q[1] - o[1] + (h ? -.42 : .62)) * w; sw += w;
  }
  let px = sw ? sx / sw : (init ? init[0] : 0), py = sw ? sy / sw : (init ? init[1] : 1);
  const pass = withSoft => {
    for (const l of LIMBS) {
      const q = t[l]; if (!q || (l === soft && !withSoft)) continue;
      const o = BODY.off[l], hand = isHand(l), R = hand ? BODY.arm : BODY.leg, k = l === soft ? .5 : 1;
      const dx = q[0] - (px + o[0]), dy = q[1] - (py + o[1]), d = Math.hypot(dx, dy) || 1e-6;
      if (d > R) { px += dx / d * (d - R) * k; py += dy / d * (d - R) * k; }
      else if (d < .18) { px -= dx / d * (.18 - d) * k; py -= dy / d * (.18 - d) * k; }
      if (!hand && q[1] > py + fl) py += (q[1] - py - fl) * k;
      if (hand && q[2]) { // side pulls / underclings: body must sit on the right side of the hold
        const sx2 = px + o[0], sy2 = py + o[1];
        if (q[2] === 'left' && sx2 > q[0] - .05) px -= (sx2 - q[0] + .05) * k;
        if (q[2] === 'right' && sx2 < q[0] + .05) px += (q[0] + .05 - sx2) * k;
        if (q[2] === 'under' && sy2 < q[1] + .1) py += (q[1] + .1 - sy2) * k;
      }
    }
    if (py < .6) py = .6;
  };
  for (let i = 0; i < 16; i++) pass(true);
  for (let i = 0; i < 16; i++) pass(false);
  let ok = true;
  for (const l of LIMBS) {
    const q = t[l]; if (!q || l === soft) continue;
    const o = BODY.off[l], hand = isHand(l), R = hand ? BODY.arm : BODY.leg;
    if (Math.hypot(q[0] - px - o[0], q[1] - py - o[1]) > R + .015) ok = false;
    if (!hand && q[1] > py + fl + .02) ok = false;
    if (hand && q[2] === 'left' && px + o[0] > q[0] - .03) ok = false;
    if (hand && q[2] === 'right' && px + o[0] < q[0] + .03) ok = false;
    if (hand && q[2] === 'under' && py + o[1] < q[1] + .08) ok = false;
  }
  return { p: [px, py], ok };
}
// Full move rules: body fits, feet never cross, crossed hands only if allowed, at least one hand and two contacts.
export function validState(s, H, O = {}) {
  const hands = (s.LH != null) + (s.RH != null), feet = (s.LF != null) + (s.RF != null);
  if (!hands || hands + feet < 2) return null;
  const t = targetsFor(s, H), r = solve(t, null, null, { high: O.high !== false });
  if (!r.ok) return null;
  if (feet === 2 && t.LF[0] > t.RF[0] + .02) return null;
  const crossed = hands === 2 && t.LH[0] > t.RH[0] + .04;
  if (crossed && O.cross === false) return null;
  const high = (t.LF && t.LF[1] > r.p[1] + FOOT_LIMIT.normal + .01) || (t.RF && t.RF[1] > r.p[1] + FOOT_LIMIT.normal + .01);
  return { p: r.p, crossed, high: !!high, t };
}
export function canUse(limb, id, state, layout, pi) {
  const h = layout.holds[id]; if (!h || h.problem !== pi) return false;
  const def = HOLD[h.type];
  if (isHand(limb) ? !def.hand : (!def.foot || h.dir === 'under')) return false;
  let n = 0; for (const l of LIMBS) if (l !== limb && state[l] === id) n++;
  return n < def.cap;
}
export function dynoShoulder(s, l, H, p) {
  const o = BODY.off[l], fy = Math.min(H[s.LF].y, H[s.RF].y);
  return [p[0] + o[0], Math.max(p[1], fy + .8) + o[1]];
}
// Can hand l jump from state s (pose p) to jump hold h? Returns the landing state or null.
export function dynoLanding(s, l, id, H, p, O = {}) {
  if (!isHand(l) || !H[id].jump || s[l] == null || s.LF == null || s.RF == null) return null;
  const other = l === 'LH' ? 'RH' : 'LH'; if (s[other] == null) return null;
  // measured from standing tall on both feet, then springing up
  const h = H[id], o = BODY.off[l], tall = dynoShoulder(s, l, H, p), d = Math.hypot(h.x - tall[0], h.y - tall[1]);
  if (d > BODY.arm + DYNO_REACH || h.y <= H[s[l]].y + .15) return null;
  const n = { ...s, [l]: id };
  if (validState(n, H, O)) return n;
  const n2 = { ...n, LF: null, RF: null };
  return validState(n2, H, O) ? n2 : null;
}

// ---------- search ----------
const COST = { move: 10, crossed: 12, high: 4, dyno: 30 };
const keyOf = s => LIMBS.map(l => s[l] == null ? '-' : s[l]).join(',');
// Cheapest way up (Dijkstra). opts: {cross, high, dyno, side} — false switches that move off.
export function search(layout, pi, opts = {}, maxStates = 60000) {
  const pr = layout.problems[pi], H = layout.holds;
  const O = { cross: opts.cross !== false, high: opts.high !== false, dyno: opts.dyno !== false, side: opts.side !== false };
  const ids = pr.holdIds.filter(id => O.side || !H[id].dir);
  const s0 = { ...pr.start }, v0 = validState(s0, H, O);
  if (!v0) return { ok: false, reason: 'start' };
  const topY = H[pr.top].y, hc = s => { const y = Math.max(s.LH != null ? H[s.LH].y : 0, s.RH != null ? H[s.RH].y : 0); return Math.floor(Math.max(0, topY - y) / 1.25) * COST.move; };
  const f0 = hc(s0), nodes = [{ s: s0, v: v0, g: 0, f: f0, parent: -1, edge: null }], best = new Map([[keyOf(s0), 0]]), buckets = []; buckets[f0] = [0];
  const vcache = new Map(), vset = n => { const v = validState(n, H, O); vcache.set(keyOf(n), v); return v; };
  for (let c = 0; c < buckets.length; c++) {
    const b = buckets[c]; if (!b) continue;
    for (let bi = 0; bi < b.length; bi++) {
      const i = b[bi], nd = nodes[i]; if (nd.f !== c || best.get(keyOf(nd.s)) !== i) continue;
      const s = nd.s;
      if (s.LH === pr.top && s.RH === pr.top) {
        const path = [], edges = []; for (let j = i; j >= 0; j = nodes[j].parent) { path.unshift(nodes[j].s); if (nodes[j].edge) edges.unshift(nodes[j].edge); }
        return { ok: true, path, edges, moves: path.length - 1, cost: nd.g, explored: nodes.length };
      }
      if (nodes.length > maxStates) return { ok: false, reason: 'limit', explored: nodes.length };
      for (const l of LIMBS) {
        const o = BODY.off[l], R = isHand(l) ? BODY.arm : BODY.leg, ax = nd.v.p[0] + o[0], ay = nd.v.p[1] + o[1];
        for (const id of ids) {
          if (id === s[l] || !canUse(l, id, s, layout, pi)) continue;
          const d = Math.hypot(H[id].x - ax, H[id].y - ay);
          if (d > R + .6 + (O.dyno ? DYNO_REACH : 0)) continue;
          let n = { ...s, [l]: id };
          const pk = best.get(keyOf(n)); if (pk !== undefined && nodes[pk].g <= nd.g + COST.move) continue; // already reached as cheaply
          let v = d <= R + .6 ? (vcache.has(keyOf(n)) ? vcache.get(keyOf(n)) : vset(n)) : null, type = 'move';
          if (!v && O.dyno) { const land = dynoLanding(s, l, id, H, nd.v.p, O); if (land) { n = land; v = validState(n, H, O); type = 'dyno'; } }
          if (!v) continue;
          const g = nd.g + (type === 'dyno' ? COST.dyno : COST.move) + (v.crossed ? COST.crossed : 0) + (v.high ? COST.high : 0);
          const k = keyOf(n), prev = best.get(k);
          if (prev !== undefined && nodes[prev].g <= g) continue;
          const f = g + hc(n);
          nodes.push({ s: n, v, g, f, parent: i, edge: { limb: l, type, to: id } }); best.set(k, nodes.length - 1);
          (buckets[f] = buckets[f] || []).push(nodes.length - 1);
        }
      }
    }
  }
  return { ok: false, reason: 'no path', explored: nodes.length };
}
export function solveRoute(layout, pi) { return search(layout, pi); }
// Star targets: generous on purpose (kids should get stars for a tidy climb, not a perfect one).
export function parFor(bestMoves, usedHolds) { const moves = Math.ceil(bestMoves * 1.4) + 4; return { moves, time: Math.round(moves * 5), holds: Math.ceil(usedHolds * 1.35) + 4 }; }
// Grade a custom route from what the grader finds it needs.
export function suggestGrade(g, layout, pi) {
  const r = new Set(g.required);
  if (r.has('high') && r.has('dyno')) return 8; if (r.has('side') && r.has('dyno')) return 7;
  if (r.has('dyno')) return 6; if (r.has('high')) return 5; if (r.has('side')) return 4; if (g.reachAvg >= .9) return 3;
  const types = new Set(); g.path.forEach(s => ['LH', 'RH'].forEach(l => { if (s[l] != null) types.add(layout.holds[s[l]].type); }));
  if (types.has('crimp') || types.has('sloper') || types.has('pocket')) return 2;
  return types.has('pinch') ? 1 : 0;
}

// Grip along a path: each position held ~3 s while the next limb moves (it recovers meanwhile).
export function simulateGrip(layout, path, edges, secs = 3) {
  const H = layout.holds, st = { LH: 1, RH: 1, LF: 1, RF: 1 }; let min = 1, rests = 0;
  const phase = (s, secs) => {
    let hands = 0, feet = 0, rest = false, safe = false;
    for (const l of LIMBS) { if (s[l] == null) continue; isHand(l) ? hands++ : feet++; if (HOLD[H[s[l]].type].rest) rest = true; }
    const crossed = s.LH != null && s.RH != null && H[s.LH].x > H[s.RH].x + .04, feetF = [1.8, 1.2, .8][feet];
    for (let k = 0; k < secs * 10; k++) for (const l of LIMBS) {
      const id = s[l]; if (id == null) { st[l] = Math.min(1, st[l] + (isHand(l) ? .05 : .025)); continue; }
      const def = HOLD[H[id].type];
      let rate = isHand(l) ? def.drain * (hands === 2 ? .5 : 1) * feetF * (crossed ? CROSS_DRAIN : 1) : (def.footDrain ?? def.drain * .35) * (hands ? 1 : 2);
      if (rest) rate -= .06; if (def.rest) rate = -.08;
      if (isHand(l) && H[id].type === 'jug' && hands === 2 && feet === 2) rate = -.05;
      if (rate < 0) safe = true;
      if (rate > 0 && st[l] <= .1) rate *= .2;
      st[l] = Math.max(0, Math.min(1, st[l] - rate / 10));
      if (isHand(l)) min = Math.min(min, st[l]);
    }
    return safe;
  };
  path.forEach((s0, i) => {
    const mv = edges[i] && edges[i].limb;
    if (phase(s0, secs - 1)) rests++;
    if (mv) { const s = { ...s0 }; s[mv] = null; phase(s, 1); }
  });
  return { min, rests };
}
// What a route asks of you: moves used, moves required (switching each off), stretch, grip margin.
export function gradeRoute(layout, pi) {
  const r = search(layout, pi); if (!r.ok) return { ok: false, reason: r.reason };
  const H = layout.holds, used = new Set();
  let reachSum = 0, reachN = 0, reachMax = 0;
  r.path.forEach((s, i) => {
    const v = validState(s, H, {});
    if (v.crossed) used.add('cross'); if (v.high) used.add('high');
    if ((s.LH != null && H[s.LH].dir) || (s.RH != null && H[s.RH].dir)) used.add('side');
    const e = r.edges[i - 1];
    if (e) {
      if (e.type === 'dyno') used.add('dyno');
      if (isHand(e.limb) && e.type === 'move') { const o = BODY.off[e.limb], d = Math.hypot(H[e.to].x - v.p[0] - o[0], H[e.to].y - v.p[1] - o[1]) / BODY.arm; reachSum += d; reachN++; reachMax = Math.max(reachMax, d); }
    }
  });
  const required = [...used].filter(t => !search(layout, pi, { [t]: false }, 20000).ok);
  const g = simulateGrip(layout, r.path, r.edges);
  return { ok: true, moves: r.moves, used: [...used], required, reachAvg: reachN ? reachSum / reachN : 0, reachMax, minGrip: g.min, rests: g.rests, path: r.path, edges: r.edges };
}
