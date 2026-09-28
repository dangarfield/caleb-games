// Colour Match rules (rule set C): one step at a time, forward / reverse / turn left / turn right.
// Cars are length 2. A car leaves only through an edge gate of its own colour.
// P = { w, h, cars:[{hr,hc,d,colour}], gates:[[side,idx,colour]], blocks:[[r,c]] }  side 0N 1E 2S 3W; idx = col for N/S, row for E/W.
export const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];

export function colourRules(P) {
  const { w, h, cars } = P, n = cars.length;
  const gmap = new Map(); (P.gates || []).forEach(([s, i, c]) => gmap.set(s * 16 + i, c));
  const blocked = new Set((P.blocks || []).map(([r, c]) => r * w + c));
  const inB = (r, c) => r >= 0 && c >= 0 && r < h && c < w;
  const gateOut = (r, c, d, colour) => { const g = gmap.get(d * 16 + (d % 2 ? r : c)); return g !== undefined && g === colour; };
  const start = cars.map(c => ({ hr: c.hr, hc: c.hc, d: c.d, out: false }));
  const enc = st => { let s = ''; for (const c of st) s += String.fromCharCode(c.out ? 1 : 2 + (c.hr * w + c.hc) * 4 + c.d); return s; };
  const dec = k => { const st = []; for (let i = 0; i < n; i++) { const v = k.charCodeAt(i); if (v === 1) st.push({ out: true }); else { const x = v - 2, d = x % 4, p = (x - d) / 4; st.push({ hr: Math.floor(p / w), hc: p % w, d, out: false }); } } return st; };
  function occ(st) {
    const g = new Int16Array(w * h).fill(-1); blocked.forEach(b => g[b] = 999);
    st.forEach((s, i) => { if (s.out) return; g[s.hr * w + s.hc] = i; g[(s.hr - DR[s.d]) * w + (s.hc - DC[s.d])] = i; });
    return g;
  }
  // one car's options: returns [{type, to}] ; type: fwd | rev | left | right | exit | exit-left | exit-right
  function carMoves(st, i, g = occ(st)) {
    const s = st[i], out = []; if (s.out) return out; const col = cars[i].colour;
    const free = (r, c) => inB(r, c) && g[r * w + c] === -1;
    const fr = s.hr + DR[s.d], fc = s.hc + DC[s.d];
    if (free(fr, fc)) out.push({ i, type: 'fwd', to: { hr: fr, hc: fc, d: s.d, out: false } });
    else if (!inB(fr, fc) && gateOut(s.hr, s.hc, s.d, col)) out.push({ i, type: 'exit', to: { out: true }, dir: s.d });
    const tr = s.hr - DR[s.d] * 2, tc = s.hc - DC[s.d] * 2;
    if (free(tr, tc)) out.push({ i, type: 'rev', to: { hr: s.hr - DR[s.d], hc: s.hc - DC[s.d], d: s.d, out: false } });
    for (const [t, name] of [[3, 'left'], [1, 'right']]) {
      const nd = (s.d + t) % 4, nr = s.hr + DR[nd], nc = s.hc + DC[nd];
      if (free(nr, nc)) out.push({ i, type: name, to: { hr: nr, hc: nc, d: nd, out: false } });
      else if (!inB(nr, nc) && gateOut(s.hr, s.hc, nd, col)) out.push({ i, type: 'exit-' + name, to: { out: true }, dir: nd });
    }
    return out;
  }
  const moves = st => { const g = occ(st), out = []; for (let i = 0; i < n; i++) out.push(...carMoves(st, i, g)); return out; };
  const apply = (st, m) => { const ns = st.slice(); ns[m.i] = m.to; return ns; };
  const done = st => st.every(s => s.out);

  // admissible heuristic: each car's own distance on an empty lot
  const tabs = cars.map(car => {
    const INF = 999, D = new Int16Array(w * h * 4).fill(INF), S = [];
    const fits = (r, c, d) => inB(r, c) && inB(r - DR[d], c - DC[d]) && !blocked.has(r * w + c) && !blocked.has((r - DR[d]) * w + c - DC[d]);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) for (let d = 0; d < 4; d++) if (fits(r, c, d)) {
      const nx = []; let ex = false;
      const fr = r + DR[d], fc = c + DC[d]; if (fits(fr, fc, d)) nx.push([fr, fc, d]); else if (!inB(fr, fc) && gateOut(r, c, d, car.colour)) ex = true;
      if (fits(r - DR[d], c - DC[d], d)) nx.push([r - DR[d], c - DC[d], d]);
      for (const t of [3, 1]) { const nd = (d + t) % 4, nr = r + DR[nd], nc = c + DC[nd]; if (fits(nr, nc, nd)) nx.push([nr, nc, nd]); else if (!inB(nr, nc) && gateOut(r, c, nd, car.colour)) ex = true; }
      S.push([(r * w + c) * 4 + d, nx, ex]);
    }
    let ch = true; while (ch) { ch = false; for (const [i, nx, ex] of S) { let b = ex ? 1 : INF; for (const [r, c, d] of nx) b = Math.min(b, D[(r * w + c) * 4 + d] + 1); if (b < D[i]) { D[i] = b; ch = true; } } }
    return D;
  });
  const hOf = st => { let t = 0; for (let i = 0; i < n; i++) { const s = st[i]; if (s.out) continue; const v = tabs[i][(s.hr * w + s.hc) * 4 + s.d]; if (v >= 999) return Infinity; t += v; } return t; };

  function solve(from = start, cap = 150000) {
    const k0 = enc(from), h0 = hOf(from); if (h0 === Infinity) return { opt: -1 };
    const gM = new Map([[k0, 0]]), par = new Map([[k0, null]]), heap = [[h0, 0, k0]];
    const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] > b[1]);
    const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (!less(x, heap[p])) break; heap[i] = heap[p]; i = p; } heap[i] = x; };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, mv = last; if (l < heap.length && less(heap[l], mv)) { m = l; mv = heap[l]; } if (r < heap.length && less(heap[r], mv)) { m = r; } if (m === i) break; heap[i] = heap[m]; i = m; } heap[i] = last; } return top; };
    while (heap.length) {
      const [, g, k] = pop(); if (g !== gM.get(k)) continue;
      const st = dec(k);
      if (done(st)) { const path = []; let kk = k; while (par.get(kk)) { const e = par.get(kk); path.push(e.m); kk = e.prev; } return { opt: g, h0, path: path.reverse() }; }
      for (const m of moves(st)) { const ns = apply(st, m), nk = enc(ns), ng = g + 1, o = gM.get(nk); if (o !== undefined && o <= ng) continue; const hh = hOf(ns); if (hh === Infinity) continue; gM.set(nk, ng); par.set(nk, { prev: k, m }); push([ng + hh, ng, nk]); }
      if (gM.size > cap) return { opt: -2 };
    }
    return { opt: -1 };
  }
  return { start, moves, carMoves, apply, done, solve, occ, hOf, n };
}
