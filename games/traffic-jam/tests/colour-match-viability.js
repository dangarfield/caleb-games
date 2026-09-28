/*
 * Colour Match + Turning — viability test harness
 * ------------------------------------------------
 * Rules being tested (all cars length 2 unless noted):
 *   - Every car has a colour. Coloured gates sit on the edge of the lot.
 *   - A car can only leave through a gate of its own colour. Any other edge is a wall.
 *   - FORWARD: drive straight until blocked. If it reaches a matching gate it leaves.
 *   - REVERSE (optional rule): back straight up until blocked. Cannot leave backwards.
 *   - TURN LEFT / RIGHT: the car pivots round its front corner:
 *         x x x        x x x
 *         x C x   ->   C C x      (head steps sideways, tail moves up to where the head was)
 *         x C x        x x x
 *     The target cell must be empty. Turning out through a matching gate also leaves.
 *   - Trucks (length 3, optional) never turn, which makes them "fixed-lane" blockers.
 *   - Each action = 1 move. Win when every car has left.
 *
 * Usage:
 *   node colour-match-viability.js            -> runs the default suite, prints a report
 *   In a browser/sandbox:  runViability({ ... }) returns { rows, text }
 */
function runViability(opts = {}) {
  const O = Object.assign({ samples: 30, cap: 120000, deadProbes: 10, probeCap: 20000, sims: 120, simLimit: 80, seed: 1, timeBudgetMs: 25000, suite: null }, opts);
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // ---------- puzzle generation ----------
  function genPuzzle(R, cfg) {
    const { w, h, cars: nCars, colours, trucks = 0, gatesPerColour = 1 } = cfg;
    const occ = new Int8Array(w * h), cars = [];
    const tryPlace = (len, colour, canTurn) => {
      for (let t = 0; t < 200; t++) {
        const d = Math.floor(R() * 4), hr = Math.floor(R() * h), hc = Math.floor(R() * w);
        const cells = []; let ok = true;
        for (let k = 0; k < len; k++) { const r = hr - DR[d] * k, c = hc - DC[d] * k; if (r < 0 || c < 0 || r >= h || c >= w || occ[r * w + c]) { ok = false; break; } cells.push(r * w + c); }
        if (!ok) continue;
        cells.forEach(i => occ[i] = 1); cars.push({ len, colour, canTurn, hr, hc, d }); return true;
      }
      return false;
    };
    for (let i = 0; i < nCars; i++) if (!tryPlace(2, i % colours, true)) return null;
    for (let i = 0; i < trucks; i++) if (!tryPlace(3, -1, false)) return null; // trucks: never turn, may use ANY gate
    const blocks = [];
    for (let i = 0; i < (cfg.blocks || 0); i++) for (let t = 0; t < 50; t++) { const r = 1 + Math.floor(R() * (h - 2)), c = 1 + Math.floor(R() * (w - 2)); if (!occ[r * w + c]) { occ[r * w + c] = 1; blocks.push(r * w + c); break; } }
    // gates: side 0..3 (N,E,S,W) + index along that side
    const gates = new Map(), used = new Set();
    for (let col = 0; col < colours; col++) for (let g = 0; g < gatesPerColour; g++) {
      for (let t = 0; t < 50; t++) {
        const side = Math.floor(R() * 4), idx = Math.floor(R() * (side % 2 ? h : w)), key = side * 16 + idx;
        if (used.has(key)) continue; used.add(key); gates.set(key, col); break;
      }
    }
    return { w, h, cars, gates, blocks };
  }

  // ---------- state + moves ----------
  function makeRules(P, rules) {
    const { w, h, cars, gates } = P, n = cars.length;
    const start = cars.map(c => ({ hr: c.hr, hc: c.hc, d: c.d, out: false }));
    const enc = st => { let s = ''; for (const c of st) s += String.fromCharCode(c.out ? 1 : 2 + (c.hr * w + c.hc) * 4 + c.d); return s; };
    const dec = key => { const st = []; for (let i = 0; i < n; i++) { const v = key.charCodeAt(i); if (v === 1) st.push({ out: true }); else { const x = v - 2, d = x % 4, p = (x - d) / 4; st.push({ hr: Math.floor(p / w), hc: p % w, d, out: false }); } } return st; };
    const gateAt = (r, c, d) => { // leaving cell (r,c) in direction d
      const nr = r + DR[d], nc = c + DC[d];
      if (nr >= 0 && nc >= 0 && nr < h && nc < w) return undefined;
      const idx = d % 2 ? r : c; const g = gates.get(d * 16 + idx);
      return rules.colourBlind ? (g !== undefined ? 0 : undefined) : g;
    };
    const matches = (car, g) => g !== undefined && (rules.colourBlind || car.colour === -1 || g === car.colour);
    function occupancy(st) {
      const g = new Int8Array(w * h).fill(-1);
      (P.blocks || []).forEach(b => g[b] = 99);
      st.forEach((s, i) => { if (s.out) return; const L = cars[i].len; for (let k = 0; k < L; k++) g[(s.hr - DR[s.d] * k) * w + (s.hc - DC[s.d] * k)] = i; });
      return g;
    }
    const inB = (r, c) => r >= 0 && c >= 0 && r < h && c < w;
    function moves(st) {
      const g = occupancy(st), out = [];
      for (let i = 0; i < n; i++) {
        const s = st[i]; if (s.out) continue; const car = cars[i], L = car.len;
        // forward
        let hr = s.hr, hc = s.hc, k = 0;
        const fwdStep = rules.step ? 1 : 99;
        while (k < fwdStep && inB(hr + DR[s.d], hc + DC[s.d]) && g[(hr + DR[s.d]) * w + hc + DC[s.d]] === -1) { hr += DR[s.d]; hc += DC[s.d]; k++; }
        const blockedByEdge = !inB(hr + DR[s.d], hc + DC[s.d]);
        if (blockedByEdge && matches(car, gateAt(hr, hc, s.d)) && (!rules.step || k === 0)) out.push({ i, type: 'exit', to: { out: true } });
        else if (k > 0) out.push({ i, type: 'fwd', to: { hr, hc, d: s.d, out: false } });
        // reverse
        if (rules.reverse) {
          let tr = s.hr - DR[s.d] * (L - 1), tc = s.hc - DC[s.d] * (L - 1), k2 = 0; const lim = rules.step ? 1 : 99;
          while (k2 < lim && inB(tr - DR[s.d], tc - DC[s.d]) && g[(tr - DR[s.d]) * w + tc - DC[s.d]] === -1) { tr -= DR[s.d]; tc -= DC[s.d]; k2++; }
          if (k2 > 0) out.push({ i, type: 'rev', to: { hr: s.hr - DR[s.d] * k2, hc: s.hc - DC[s.d] * k2, d: s.d, out: false } });
        }
        // turns
        if (rules.turns && car.canTurn) for (const t of [3, 1]) {
          const nd = (s.d + t) % 4, nr = s.hr + DR[nd], nc = s.hc + DC[nd];
          if (inB(nr, nc)) { if (g[nr * w + nc] === -1) out.push({ i, type: t === 3 ? 'left' : 'right', to: { hr: nr, hc: nc, d: nd, out: false } }); }
          else if (matches(car, gateAt(s.hr, s.hc, nd))) out.push({ i, type: 'exit-turn', to: { out: true } });
        }
      }
      return out;
    }
    const apply = (st, m) => { const ns = st.slice(); ns[m.i] = m.to; return ns; };
    const done = st => st.every(s => s.out);
    return { start, enc, dec, moves, apply, done, n };
  }

  // ---------- A* solver ----------
  // Heuristic: sum over cars of that car's distance-to-exit on an EMPTY lot where it may stop anywhere
  // along a slide (a relaxation of every real move), so it never over-estimates: optimal results stay exact.
  function carDistTables(P, rules) {
    const { w, h, cars, gates } = P, inB = (r, c) => r >= 0 && c >= 0 && r < h && c < w;
    return cars.map(car => {
      const L = car.len, N = w * h * 4, dist = new Int16Array(N).fill(-1);
      const fits = (hr, hc, d) => { for (let k = 0; k < L; k++) if (!inB(hr - DR[d] * k, hc - DC[d] * k)) return false; return true; };
      const exitOK = (r, c, d) => { const g = gates.get(d * 16 + (d % 2 ? r : c)); return g !== undefined && (rules.colourBlind || car.colour === -1 || g === car.colour); };
      // reverse BFS is awkward; do forward BFS from every state separately would be slow. Instead iterate Bellman-style.
      const INF = 999, D = new Int16Array(N).fill(INF);
      const succ = (hr, hc, d) => {
        const out = []; let exit = false;
        for (let k = 1; ; k++) { const r = hr + DR[d] * k, c = hc + DC[d] * k; if (!inB(r, c)) { if (exitOK(hr + DR[d] * (k - 1), hc + DC[d] * (k - 1), d)) exit = true; break; } out.push([r, c, d]); if (rules.step) { if (!inB(r + DR[d], c + DC[d]) && exitOK(r, c, d)) {} break; } }
        if (!rules.step && !inB(hr + DR[d], hc + DC[d]) && exitOK(hr, hc, d)) exit = true;
        if (rules.step) exit = !inB(hr + DR[d], hc + DC[d]) && exitOK(hr, hc, d);
        if (rules.reverse) for (let k = 1; ; k++) { const r = hr - DR[d] * k, c = hc - DC[d] * k; if (!fits(r, c, d)) break; out.push([r, c, d]); if (rules.step) break; }
        if (rules.turns && car.canTurn) for (const t of [3, 1]) { const nd = (d + t) % 4, r = hr + DR[nd], c = hc + DC[nd]; if (inB(r, c)) out.push([r, c, nd]); else if (exitOK(hr, hc, nd)) exit = true; }
        return { out, exit };
      };
      const S = [];
      for (let hr = 0; hr < h; hr++) for (let hc = 0; hc < w; hc++) for (let d = 0; d < 4; d++) if (fits(hr, hc, d)) S.push([hr, hc, d, succ(hr, hc, d)]);
      let changed = true;
      while (changed) { changed = false; for (const [hr, hc, d, sc] of S) { const i = (hr * w + hc) * 4 + d; let best = sc.exit ? 1 : INF; for (const [r, c, nd] of sc.out) { const v = D[(r * w + c) * 4 + nd]; if (v + 1 < best) best = v + 1; } if (best < D[i]) { D[i] = best; changed = true; } } }
      return D;
    });
  }
  function astar(P, rules, cap) {
    const R = makeRules(P, rules), tabs = carDistTables(P, rules), w = P.w;
    const hOf = st => { let t = 0; for (let i = 0; i < st.length; i++) { const s = st[i]; if (s.out) continue; const v = tabs[i][(s.hr * w + s.hc) * 4 + s.d]; if (v >= 999) return Infinity; t += v; } return t; };
    const k0 = R.enc(R.start), h0 = hOf(R.start); if (h0 === Infinity) return { opt: -1, states: 1, capped: false };
    const gMap = new Map([[k0, 0]]), parent = new Map([[k0, null]]);
    const heap = [[h0, 0, k0]], push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] < x[0] || (heap[p][0] === x[0] && heap[p][1] >= x[1])) break; heap[i] = heap[p]; i = p; } heap[i] = x; };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && (heap[l][0] < last[0] || (heap[l][0] === last[0] && heap[l][1] > last[1]))) m = l; const cmp = m === i ? last : heap[m]; if (r < heap.length && (heap[r][0] < cmp[0] || (heap[r][0] === cmp[0] && heap[r][1] > cmp[1]))) m = r; if (m === i) break; heap[i] = heap[m]; i = m; } heap[i] = last; } return top; };
    let expanded = 0, branch = 0;
    while (heap.length) {
      const [f, g, k] = pop(); if (g !== gMap.get(k)) continue;
      const st = R.dec(k);
      if (R.done(st)) { const path = []; let kk = k; while (parent.get(kk)) { const e = parent.get(kk); path.push(e.m); kk = e.prev; } path.reverse(); return { opt: g, h0, path, states: gMap.size, avgBranch: branch / Math.max(1, expanded), capped: false }; }
      const ms = R.moves(st); expanded++; branch += ms.length;
      for (const m of ms) { const ns = R.apply(st, m), nk = R.enc(ns), ng = g + 1; const old = gMap.get(nk); if (old !== undefined && old <= ng) continue; const hh = hOf(ns); if (hh === Infinity) continue; gMap.set(nk, ng); parent.set(nk, { prev: k, m }); push([ng + hh, ng, nk]); }
      if (gMap.size > cap) return { capped: true, states: gMap.size };
    }
    return { opt: -1, states: gMap.size, capped: false };
  }
  function deadEndSample(P, rules, R0) {
    // Play like a random kid for 3–20 moves, then ask: can this position still be solved?
    const R = makeRules(P, rules); let tested = 0, dead = 0;
    for (let t = 0; t < O.deadProbes; t++) {
      let st = R.start; const n = 3 + Math.floor(R0() * 18);
      for (let m = 0; m < n && !R.done(st); m++) { const ms = R.moves(st); if (!ms.length) break; st = R.apply(st, ms[Math.floor(R0() * ms.length)]); }
      if (R.done(st)) continue;
      const P2 = Object.assign({}, P, { cars: P.cars.map((c, i) => st[i].out ? null : Object.assign({}, c, { hr: st[i].hr, hc: st[i].hc, d: st[i].d })).filter(Boolean) });
      const res = astar(P2, rules, O.probeCap); if (res.capped) continue; tested++; if (res.opt < 0) dead++;
    }
    return tested ? dead / tested : null;
  }

  // ---------- solver ----------
  function solve(P, rules, cap, wantGraph) {
    const R = makeRules(P, rules), k0 = R.enc(R.start);
    const parent = new Map([[k0, null]]), edges = wantGraph ? new Map() : null;
    let q = [k0], depth = 0, goal = null, branch = 0, expanded = 0;
    outer: while (q.length) {
      const nq = [];
      for (const k of q) {
        const st = R.dec(k); if (R.done(st)) { if (!goal) goal = { k, depth }; if (!wantGraph) break outer; continue; }
        const ms = R.moves(st); branch += ms.length; expanded++;
        const kids = wantGraph ? [] : null;
        for (const m of ms) { const nk = R.enc(R.apply(st, m)); if (kids) kids.push(nk); if (!parent.has(nk)) { parent.set(nk, { prev: k, m }); nq.push(nk); } }
        if (kids) edges.set(k, kids);
        if (parent.size > cap) return { capped: true, states: parent.size };
      }
      q = nq; depth++;
    }
    let path = null;
    if (goal) { path = []; let k = goal.k; while (parent.get(k)) { const e = parent.get(k); path.push(e.m); k = e.prev; } path.reverse(); }
    return { capped: false, states: parent.size, opt: goal ? goal.depth : -1, path, avgBranch: expanded ? branch / expanded : 0, edges, parent, R, k0 };
  }

  function deadEndStats(res) {
    // reverse reachability: which explored states can still reach the goal?
    const rev = new Map(); let goals = [];
    for (const [k, kids] of res.edges) for (const c of kids) { if (!rev.has(c)) rev.set(c, []); rev.get(c).push(k); }
    for (const k of res.parent.keys()) if (res.R.done(res.R.dec(k))) goals.push(k);
    const good = new Set(goals), q = goals.slice();
    while (q.length) { const k = q.pop(); for (const p of rev.get(k) || []) if (!good.has(p)) { good.add(p); q.push(p); } }
    const total = res.parent.size, dead = total - good.size;
    const firstMoves = res.edges.get(res.k0) || [], trapFirst = firstMoves.filter(k => !good.has(k)).length;
    return { deadRate: dead / total, trapFirstRate: firstMoves.length ? trapFirst / firstMoves.length : 0 };
  }

  function simulate(P, rules, R0, greedy) {
    const R = makeRules(P, rules); let wins = 0, movesSum = 0;
    for (let s = 0; s < O.sims; s++) {
      let st = R.start, m = 0;
      while (m < O.simLimit && !R.done(st)) {
        const ms = R.moves(st); if (!ms.length) break;
        let pick = null;
        if (greedy) pick = ms.find(x => x.type === 'exit' || x.type === 'exit-turn');
        if (!pick) pick = ms[Math.floor(R0() * ms.length)];
        st = R.apply(st, pick); m++;
      }
      if (R.done(st)) { wins++; movesSum += m; }
    }
    return { rate: wins / O.sims, avgMoves: wins ? movesSum / wins : null };
  }

  // ---------- suite ----------
  const RULESETS = {
    A: { name: 'Slide + reverse + turns', rules: { reverse: true, turns: true } },
    B: { name: 'Slide forward only + turns', rules: { reverse: false, turns: true } },
    C: { name: 'One step at a time + reverse + turns', rules: { reverse: true, turns: true, step: true } },
  };
  const CONFIGS = [
    { label: '4x4 · 3 cars · 2 colours', w: 4, h: 4, cars: 3, colours: 2 },
    { label: '5x5 · 4 cars · 2 colours', w: 5, h: 5, cars: 4, colours: 2 },
    { label: '5x5 · 5 cars · 3 colours', w: 5, h: 5, cars: 5, colours: 3 },
    { label: '6x6 · 6 cars · 3 colours', w: 6, h: 6, cars: 6, colours: 3 },
    { label: '6x6 · 6 cars + 2 trucks · 3 col', w: 6, h: 6, cars: 6, colours: 3, trucks: 2 },
    { label: '5x5 · 7 cars · 2 colours (dense)', w: 5, h: 5, cars: 7, colours: 2 },
    { label: '6x6 · 9 cars · 3 colours (dense)', w: 6, h: 6, cars: 9, colours: 3 },
    { label: '6x6 · 8 cars + 3 cones · 3 col', w: 6, h: 6, cars: 8, colours: 3, blocks: 3 },
    { label: '6x6 · 7 cars + 2 trucks + 2 cones', w: 6, h: 6, cars: 7, colours: 3, trucks: 2, blocks: 2 },
  ];
  const suite = O.suite || Object.keys(RULESETS).flatMap(r => CONFIGS.map(c => [r, c]));
  const t0 = Date.now(), rows = [];
  const pct = a => (a * 100).toFixed(0) + '%', med = a => { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const pRange = a => { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); return `${s[Math.floor(s.length * .1)]}–${s[Math.floor(s.length * .9)]}`; };

  for (const [rk, cfgIn] of suite) {
    const cfg = typeof cfgIn === 'string' ? CONFIGS.find(c => c.label === cfgIn) : cfgIn;
    const RS = RULESETS[rk]; const R0 = rng(O.seed * 1000 + rows.length * 7 + 1);
    let gen = 0, solvable = 0, capped = 0, deadCapped = 0; const interf = [], opts = [], states = [], branch = [], turnShare = [], usesTurn = [], dead = [], trap = [], colourDelta = [], needTurns = [], rnd = [], grd = [], trivial = [];
    while (gen < O.samples && Date.now() - t0 < O.timeBudgetMs) {
      const P = genPuzzle(R0, cfg); if (!P) continue; gen++;
      const res = astar(P, RS.rules, O.cap);
      if (res.capped) { capped++; continue; }
      if (res.opt < 0) continue;
      solvable++; opts.push(res.opt); interf.push(res.opt - res.h0); states.push(res.states); branch.push(res.avgBranch);
      const turns = res.path.filter(m => m.type === 'left' || m.type === 'right' || m.type === 'exit-turn').length;
      turnShare.push(turns / res.opt); usesTurn.push(turns > 0 ? 1 : 0);
      trivial.push(res.opt === P.cars.length ? 1 : 0);
      const dr = deadEndSample(P, RS.rules, R0); if (dr != null) dead.push(dr); else deadCapped++;
      const blind = astar(P, Object.assign({}, RS.rules, { colourBlind: true }), O.cap);
      if (!blind.capped && blind.opt >= 0) colourDelta.push(res.opt - blind.opt);
      const noTurn = astar(P, Object.assign({}, RS.rules, { turns: false }), O.cap);
      needTurns.push(!noTurn.capped && noTurn.opt < 0 ? 1 : 0);
      rnd.push(simulate(P, RS.rules, R0, false).rate); grd.push(simulate(P, RS.rules, R0, true).rate);
    }
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    rows.push({
      rules: rk, rulesName: RS.name, config: cfg.label, generated: gen, solvable: gen ? solvable / gen : 0, capped,
      optMedian: med(opts), optRange: pRange(opts), statesMedian: med(states), branch: avg(branch),
      usesTurns: avg(usesTurn), turnShare: avg(turnShare), needTurns: avg(needTurns), trivial: avg(trivial),
      interference: avg(interf), interfZero: avg(interf.map(x => x === 0 ? 1 : 0)), deep3: avg(interf.map(x => x >= 3 ? 1 : 0)), deepMax: interf.length ? Math.max(...interf) : 0, colourAdds: avg(colourDelta), deadRate: avg(dead), deadSampled: dead.length, deadCapped, trapFirst: avg(trap), randomWin: avg(rnd), greedyWin: avg(grd),
    });
  }

  // ---------- verdicts ----------
  function verdict(r) {
    const notes = []; let score = 0;
    if (r.solvable >= .15) score++; else notes.push('few random layouts are solvable (generator will need many retries)');
    if (r.usesTurns >= .7) score++; else notes.push('turning is often unnecessary');
    if (r.colourAdds >= 1) score++; else notes.push('colour rule rarely changes the solution');
    if (r.interference >= 2) score++; else notes.push('cars rarely get in each other’s way: mostly driving to the gate, not puzzling');
    if (!r.deadSampled || r.deadRate <= .15) score++; else notes.push(`${pct(r.deadRate)} of reachable states are dead ends (needs Undo/Reset)`);
    if (r.greedyWin < .6 && r.randomWin < .4) score++; else notes.push('random tapping solves it too often');
    if (typeof r.statesMedian === 'number' && r.statesMedian < 30000) score++; else notes.push('state space large for live hints');
    return { score, notes };
  }
  const lines = [];
  lines.push('COLOUR MATCH + TURNING — viability report');
  lines.push(`samples/config=${O.samples}  stateCap=${O.cap}  sims=${O.sims}  time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  lines.push('');
  for (const r of rows) {
    const v = verdict(r);
    lines.push(`[${r.rules}] ${r.rulesName}  |  ${r.config}`);
    lines.push(`  solvable ${pct(r.solvable)} of ${r.generated} (solver gave up on ${r.capped}) · optimal moves median ${r.optMedian} (10–90%: ${r.optRange}) · A* states median ${r.statesMedian} · branching ${r.branch.toFixed(1)}`);
    lines.push(`  puzzle depth (extra moves caused by other cars) avg ${r.interference.toFixed(1)} · zero ${pct(r.interfZero)} · depth ≥3 in ${pct(r.deep3)} of layouts (best found ${r.deepMax})`);
    lines.push(`  turns used in ${pct(r.usesTurns)} of solutions (${pct(r.turnShare)} of moves) · unsolvable without turns ${pct(r.needTurns)} · colour adds +${r.colourAdds.toFixed(1)} moves · trivial ${pct(r.trivial)}`);
    lines.push(`  dead ends after random play ${r.deadSampled ? pct(r.deadRate) : 'n/a'} · random player wins ${pct(r.randomWin)} · greedy player wins ${pct(r.greedyWin)}`);
    lines.push(`  score ${v.score}/7${v.notes.length ? ' — ' + v.notes.join('; ') : ''}`);
    lines.push('');
  }
  return { rows, text: lines.join('\n') };
}

if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, isNaN(+v) ? v : +v]));
  console.log(runViability(Object.assign({ timeBudgetMs: 300000 }, args)).text);
}
if (typeof module !== 'undefined') module.exports = { runViability };
