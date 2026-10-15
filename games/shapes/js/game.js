/* Shapes — Garfield Boys' Arcade. Game logic, rendering, touch input and UI.
   Rendering: the world is cut into 8×8-tile chunks. Each chunk keeps two cached canvases (floor + belts,
   then machines on top), re-drawn only when something in it changes or the zoom settles. Every frame only
   blits those, plus the items on visible belts (from a sprite cache) and the Hub. Off-screen items are
   simulated but never drawn. Simulation runs at a fixed 30 steps a second. */
(function () {
  'use strict';
  var K = window.ShapesKit, BLD = K.BLD;
  var $ = function (s) { return document.querySelector(s); };
  var INK = '#23213A', FLOOR = '#F4EFE3', GRID = '#E6DDC8', PUR = '#6C5CE7';
  var FULL_DPR = Math.min(1.5, window.devicePixelRatio || 1), DPR = FULL_DPR;
  /* Fast mode (Pause menu). Trades looks for speed on low-powered tablets:
     - canvas and chunk caches at 0.75× resolution (about half the pixels of 1×)
     - no moving belt chevrons, no menu-world animation, no building-card demo animation
     - shapes on belts are only drawn when zoomed in (tile ≥ 30px)
     - the screen redraws at most 30 times a second (the simulation still runs 30 steps a second) */
  var fast = false, mon = false, perf = { fr: [], sim: 0, rnd: 0, last: 0, n: 0, lastDraw: 0 };
  var CS = 8, STEP = 1 / 30, GAP = 0.5;
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

  /* ================= data ================= */
  var LV = [['CuCuCuCu', 30], ['RuRuRuRu', 40], ['CuCu----', 50], ['--CuCu--', 60], ['CrCrCrCr', 60], ['SySySySy', 80], ['CuCuRuRu', 80], ['SrSrCbCb', 100],
    ['Wu------', 100], ['CpCp--Cp', 120], ['SwSwSwSw', 120], ['RcWcRcWc', 140], ['CrSgCrSg', 160], ['Wu----Wu', 160], ['SpCySpCy', 200], ['CwRwSwWw', 200],
    ['SbSbWyWy', 250], ['CcRpCcRp', 300], ['WrWgWbWw', 350], ['SwCpRyWc', 400]];
  // level whose completion unlocks it (0 = from the start)
  var UNLOCK = { belt: 0, belt_l: 0, belt_r: 0, extractor: 0, bin: 0, cutter: 2, rotator: 3, rotator_ccw: 3, rotator_180: 3, painter: 4, mixer: 5, mixer_w: 15, combiner: 6,
    splitter: 7, balancer_l: 7, balancer_r: 7, filter: 20, quad: 8, extractor2: 9, quad_combiner: 10, quad_painter: 12, tunnel_in: 3, tunnel_out: 3, balancer: 13, tunnel2_in: 16, tunnel2_out: 16, split_l: 17, split_r: 17, teleport_in: 18, teleport_out: 18, meter: 19 };
  var COPY_AT = 11; // Copy and paste: its own reward level
  var MULT = { belt: 1, belt_l: 1, belt_r: 1, splitter: 1, balancer_l: 1, balancer_r: 1, balancer: 1, tunnel_in: 1, tunnel_out: 1, tunnel2_in: 1, tunnel2_out: 1, split_l: 1, split_r: 1, teleport_in: 1, teleport_out: 1,
    cutter: 0.5, quad: 0.25, rotator: 0.5, rotator_ccw: 0.5, rotator_180: 0.5, combiner: 0.5, quad_combiner: 0.25, painter: 0.33, quad_painter: 0.25, mixer: 0.4, mixer_w: 0.4,
    extractor: 0.4, extractor2: 0.4, filter: 1, bin: 1, meter: 1 };
  var AREA = { cutter: 'processing', quad: 'processing', rotator: 'processing', rotator_ccw: 'processing', rotator_180: 'processing', combiner: 'processing', quad_combiner: 'processing',
    painter: 'painting', quad_painter: 'painting', mixer: 'painting', mixer_w: 'painting', extractor: 'extractor', extractor2: 'extractor' };
  var FAM = [
    [['belt', ['belt']], ['splitter', ['splitter', 'split_l', 'split_r']], ['merger', ['balancer_l', 'balancer_r', 'balancer']], ['tunnel', ['tunnel_in', 'tunnel2_in', 'teleport_in']]],
    [['cutter', ['cutter', 'quad']], ['rotator', ['rotator', 'rotator_ccw', 'rotator_180']], ['combiner', ['combiner', 'quad_combiner']]],
    [['painter', ['painter', 'quad_painter']], ['mixer', ['mixer', 'mixer_w']]],
    [['extractor', ['extractor']], ['filter', ['filter']], ['meter', ['meter']], ['bin', ['bin']]]
  ];
  // [name, tag, tag colour, material icon, short line]
  var INFO = {
    teleport_in: ['Teleporter', '', '', '', 'Sends shapes instantly to its exit, anywhere on the map.'],
    mixer_w: ['Mixer', 'White', PUR, '', 'Red + green + blue make white in one go.'],
    meter: ['Timer', '', '', '', 'Sits on a belt and shows how many items pass each second.'],
    copy: ['Copy and paste', '', '', '', 'Draw a box round part of your factory, then drop a copy anywhere. Turn it with ↻.'],
    belt: ['Belt', '', '', '', 'Carries shapes along.'], splitter: ['Splitter', '', '', '', 'Sends shapes left and right in turn.'], balancer: ['Balancer', '', '', '', 'Shares two belts out evenly.'],
    split_l: ['Splitter', '', '', 'turn_left', 'Sends shapes straight on and out to the left, in turn.'], split_r: ['Splitter', '', '', 'turn_right', 'Sends shapes straight on and out to the right, in turn.'],
    balancer_l: ['Merger', '', '', 'turn_left', 'Joins a belt coming in from the left.'], balancer_r: ['Merger', '', '', 'turn_right', 'Joins a belt coming in from the right.'],
    tunnel_in: ['Tunnel', '1', '#C98F00', '', 'Hops shapes up to 4 tiles under belts.'], tunnel2_in: ['Tunnel', '2', '#1597AA', '', 'Hops shapes up to 8 tiles under belts.'],
    cutter: ['Cutter', '', '', '', 'Cuts a shape into a left and a right half.'], quad: ['Cutter', '×4', PUR, '', 'Cuts a shape into four quarters.'],
    rotator: ['Rotator', '↻', PUR, '', 'Turns a shape a quarter, clockwise.'], rotator_ccw: ['Rotator', '↺', PUR, '', 'Turns a shape a quarter, anticlockwise.'], rotator_180: ['Rotator', '180°', PUR, '', 'Turns a shape upside down.'],
    combiner: ['Joiner', '', '', '', 'Joins two halves into one shape.'], quad_combiner: ['Joiner', '×4', PUR, '', 'Joins up to four pieces into one shape.'],
    painter: ['Painter', '', '', '', 'Paints the whole shape one colour.'], quad_painter: ['Painter', '×4', PUR, '', 'Paints each quarter its own colour.'], mixer: ['Mixer', '', '', '', 'Mixes two colours into a new one.'],
    extractor: ['Miner', '', '', '', 'Digs shapes or colours out of a patch.'], extractor2: ['Link Miner', '', '', '', 'Digs, and passes shapes along a row.'],
    filter: ['Filter', '', '', '', 'Lets your picked shape through. Bins the rest.'], bin: ['Bin', '', '', '', 'Throws shapes away.']
  };
  var CYC = [['belt', 'extractor'], ['processing', 'belt'], ['extractor', 'processing'], ['painting', 'belt'], ['extractor', 'painting'], ['processing', 'painting']];
  var INC = { belt: [0.4, 0.4, 0.6, 0.6, 0.8, 0.8, 0.6, 0.6, 0.6, 0.6], extractor: [0.2, 0.4, 0.4, 0.6, 0.8, 0.8, 0.8, 0.8, 0.6, 0.6], processing: [0.4, 0.6, 0.6, 0.8, 0.8, 0.8, 0.8, 0.6, 0.6], painting: [0.2, 0.6, 0.6, 0.8, 0.8, 0.8, 0.8, 0.8, 0.6] };
  var AREAS = ['belt', 'extractor', 'processing', 'painting'];
  var AREA_INFO = { belt: ['Belts', 'Belts, splitters, tunnels', 'belt'], extractor: ['Miners', 'Digging up shapes', 'extractor'], processing: ['Machines', 'Cutters, rotators, joiners', 'cutter'], painting: ['Painting', 'Painters and mixers', 'painter'] };
  var MIX = { rg: 'y', rb: 'p', gb: 'c', yb: 'w', pg: 'w', cr: 'w' };

  function speedsAt(level) {
    var v = { belt: 2, extractor: 2, processing: 2, painting: 2 }, c = { belt: 0, extractor: 0, processing: 0, painting: 0 };
    for (var n = 1; n < Math.min(level, 20); n++) CYC[(n - 1) % 6].forEach(function (k) { v[k] += (INC[k][c[k]++] || 0.2); });
    return v;
  }
  function gainAt(level) {
    if (level >= 20) return [];
    var c = { belt: 0, extractor: 0, processing: 0, painting: 0 };
    for (var n = 1; n < level; n++) CYC[(n - 1) % 6].forEach(function (k) { c[k]++; });
    return CYC[(level - 1) % 6].map(function (k) { return [k, INC[k][c[k]] || 0.2]; });
  }
  function fmt(x) { return String(Math.round(x * 100) / 100); }

  /* ================= shapes ================= */
  function qs(code) { return [code.slice(0, 2), code.slice(2, 4), code.slice(4, 6), code.slice(6, 8)]; }
  function isCol(c) { return c.length === 1; }
  function empty(q) { return q.every(function (x) { return x === '--'; }); }
  function only(code, keep) { var q = qs(code); for (var i = 0; i < 4; i++) if (keep.indexOf(i) < 0) q[i] = '--'; return empty(q) ? null : q.join(''); }
  function rot(code, k) { var q = qs(code), o = []; for (var i = 0; i < 4; i++) o[(i + k) % 4] = q[i]; return o.join(''); }
  function overlap(a, b) { var A = qs(a), B = qs(b); for (var i = 0; i < 4; i++) if (A[i] !== '--' && B[i] !== '--') return true; return false; }
  function merge(list) { var o = ['--', '--', '--', '--']; list.forEach(function (c) { qs(c).forEach(function (x, i) { if (x !== '--') o[i] = x; }); }); return o.join(''); }
  function paint(code, col) { return qs(code).map(function (x) { return x === '--' ? x : x[0] + col; }).join(''); }
  function mix(a, b) { if (a === b) return a; return MIX[a + b] || MIX[b + a] || null; }
  function matches(item, rule) {
    if (!rule) return true;
    if (rule === '0') return !isCol(item) && qs(item).every(function (x) { return x === '--' || x[1] === 'u'; });
    if (rule.length === 1) return item === rule;
    if (isCol(item)) return false;
    var I = qs(item), Rr = qs(rule);
    for (var i = 0; i < 4; i++) {
      var r = Rr[i], x = I[i];
      if (r === '**') continue;
      if (r === '--') { if (x !== '--') return false; continue; }
      if (x === '--') return false;
      if (r[0] !== '*' && r[0] !== x[0]) return false;
      if (r[1] !== '*' && r[1] !== x[1]) return false;
    }
    return true;
  }
  function randomOrder(rnd) {
    var n = 2 + Math.floor(rnd() * 3), q = ['--', '--', '--', '--'], idx = [0, 1, 2, 3].sort(function () { return rnd() - 0.5; });
    for (var i = 0; i < n; i++) q[idx[i]] = 'CRSW'[Math.floor(rnd() * 4)] + 'urgbypcw'[Math.floor(rnd() * 8)];
    return q.join('');
  }

  /* ================= world ================= */
  var G = null;                // current player's game
  var grid = new Map();        // tile → building
  var blds = [];               // all buildings
  var bchunk = new Map();      // chunk → Set of buildings touching it (±1 tile)
  var patches = new Map();     // tile → patch kind
  var patchDone = new Set();
  var uid = 0;
  function tk(x, y) { return (x + 32768) * 65536 + (y + 32768); }
  function ck(cx, cy) { return (cx + 30000) * 60000 + (cy + 30000); }
  function at(x, y) { return grid.get(tk(x, y)); }
  function isBelt(t) { return t === 'belt' || t === 'belt_l' || t === 'belt_r'; }
  function noRot(t) { return isBelt(t) || t === 'bin' || t === 'meter'; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function addPatch(kind, cx, cy, rx, ry) {
    for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !(x >= -3 && x <= 2 && y >= -3 && y <= 2)) patches.set(tk(x, y), kind);
    }
  }
  function seedPatches() {
    addPatch('CuCuCuCu', -9, -0.5, 2.6, 2.2); addPatch('RuRuRuRu', 7.5, -7.5, 2.2, 1.8); addPatch('r', -7.5, 7.5, 1.8, 1.5);
    addPatch('g', 2.5, 9.5, 1.8, 1.4); addPatch('b', 10.5, 4.5, 1.6, 1.8); addPatch('SuSuSuSu', -15.5, -10.5, 2.2, 1.8);
    addPatch('CuCuCuCu', 14.5, 12.5, 2, 1.6); addPatch('WuWuWuWu', 24.5, -15.5, 2, 1.6); addPatch('RuRuRuRu', -20.5, 12.5, 2, 1.8);
  }
  function ensurePatches(cx, cy) {
    var k = ck(cx, cy); if (patchDone.has(k)) return; patchDone.add(k);
    var mx = cx * CS + CS / 2, my = cy * CS + CS / 2, d = Math.hypot(mx, my);
    if (d < 30) return;
    var r = rng(hash(cx, cy)); if (r() > 0.3) return;
    var pool = ['CuCuCuCu', 'RuRuRuRu', 'SuSuSuSu', 'r', 'g', 'b'];
    if (d > 45) pool.push('WuWuWuWu', 'WuWuWuWu', 'SuSuSuSu');
    addPatch(pool[Math.floor(r() * pool.length)], cx * CS + 2 + r() * 4, cy * CS + 2 + r() * 4, 1.4 + r() * 1.4, 1.2 + r() * 1.2);
  }
  function mapTile(w, h, r, lx, ly) { return r === 1 ? [h - 1 - ly, lx] : r === 2 ? [w - 1 - lx, h - 1 - ly] : r === 3 ? [ly, w - 1 - lx] : [lx, ly]; }
  function dims(t, r) { var d = BLD[t]; return r % 2 ? [d.h, d.w] : [d.w, d.h]; }
  function tilesOf(t, x, y, r) { var dm = dims(t, r), o = []; for (var i = 0; i < dm[0]; i++) for (var j = 0; j < dm[1]; j++) o.push([x + i, y + j]); return o; }

  function makePorts(b) {
    var d = b.d, r = b.r, P = [];
    var add = function (io, k, lx, ly, nx, ny, dir) { var t = mapTile(d.w, d.h, r, lx, ly), n = mapTile(d.w, d.h, r, nx, ny); P.push({ io: io, k: k, tx: b.x + t[0], ty: b.y + t[1], nx: b.x + n[0], ny: b.y + n[1], dir: dir }); };
    (d.ins || []).forEach(function (c) { add('in', 's', c, d.h - 1, c, d.h, r); });
    (d.cins || []).forEach(function (c) { add('in', 'c', c, d.h - 1, c, d.h, r); });
    if (d.side) { var row = d.sideRow || 0, L = d.side === 'L'; add('in', d.sideKind || 's', 0, row, L ? -1 : 1, row, (r + (L ? 1 : 3)) & 3); }
    (d.outs || []).forEach(function (c) { add('out', 's', c, 0, c, -1, r); });
    if (d.sideOut) { var L3 = d.sideOut === 'L'; add('out', 's', 0, 0, L3 ? -1 : 1, 0, (r + (L3 ? 3 : 1)) & 3); }
    (d.couts || []).forEach(function (c) { add('out', 'c', c, 0, c, -1, r); });
    b.ins = P.filter(function (p) { return p.io === 'in'; }); b.outs = P.filter(function (p) { return p.io === 'out'; });
    b.inb = b.ins.map(function () { return null; }); b.outb = b.outs.map(function () { return null; });
  }
  function create(t, x, y, r, extra) {
    var d = BLD[t], dm = dims(t, r), b = { id: ++uid, t: t, x: x, y: y, r: r, rw: dm[0], rh: dm[1], d: d, tm: 0, pend: null, rr: 0 };
    if (isBelt(t) || t === 'meter') { b.items = []; b.inDir = r; b.outDir = t === 'belt' || t === 'meter' ? r : t === 'belt_r' ? (r + 1) & 3 : (r + 3) & 3; if (t === 'meter') { b.mlog = []; b.rate = '0'; } }
    else if (t !== 'hub') makePorts(b);
    if (t === 'filter' || t === 'teleport_in') b.rule = (extra && extra.rule) || null;
    if (t === 'filter') { // every Filter has settings from the start: Level shape, all quarters, shape + colour
      b.fs = extra && extra.fs ? JSON.parse(JSON.stringify(extra.fs)) : { mode: 'order', sel: [true, true, true, true], match: 'both', own: qs(G ? order() : 'CuCuCuCu'), q: 0 };
      if (G && b.fs.mode === 'order') b.rule = ruleFor(b.fs); // follows the current level shape
    } // teleporter: rule = 'x,y' of its exit
    if (/^(?:tunnel2?|teleport)_out$/.test(t)) b.q = [];
    if (/^(?:tunnel2?|teleport)_(in|out)$/.test(t)) b.lane = [];
    return b;
  }
  function chunkRange(b) { return [Math.floor((b.x - 1) / CS), Math.floor((b.y - 1) / CS), Math.floor((b.x + b.rw) / CS), Math.floor((b.y + b.rh) / CS)]; }
  function touchChunks(b, add) {
    var c = chunkRange(b);
    for (var cx = c[0]; cx <= c[2]; cx++) for (var cy = c[1]; cy <= c[3]; cy++) {
      var k = ck(cx, cy), s = bchunk.get(k); if (!s) { s = new Set(); bchunk.set(k, s); }
      if (add) s.add(b); else s.delete(b);
      var ch = chunks.get(k); if (ch) ch.dirty = true;
    }
  }
  function place(b) {
    if (/^extractor/.test(b.t)) { var pcx = Math.floor(b.x / CS), pcy = Math.floor(b.y / CS); for (var ex = pcx - 1; ex <= pcx + 1; ex++) for (var ey = pcy - 1; ey <= pcy + 1; ey++) ensurePatches(ex, ey); }
    blds.push(b); tilesOf(b.t, b.x, b.y, b.r).forEach(function (t) { grid.set(tk(t[0], t[1]), b); }); touchChunks(b, true);
    // neighbours may now show belt stubs
    touchNeighbours(b); topoDirty = true; return b;
  }
  function removeB(b) {
    var i = blds.indexOf(b); if (i >= 0) blds.splice(i, 1);
    tilesOf(b.t, b.x, b.y, b.r).forEach(function (t) { if (grid.get(tk(t[0], t[1])) === b) grid.delete(tk(t[0], t[1])); });
    touchChunks(b, false); touchNeighbours(b); topoDirty = true; if (selB === b) selB = null;
  }
  function touchNeighbours(b) { for (var x = b.x - 1; x <= b.x + b.rw; x++) for (var y = b.y - 1; y <= b.y + b.rh; y++) { var n = at(x, y); if (n && n !== b) { var c = chunkRange(n); for (var cx = c[0]; cx <= c[2]; cx++) for (var cy = c[1]; cy <= c[3]; cy++) { var ch = chunks.get(ck(cx, cy)); if (ch) ch.dirty = true; } } } }
  var topoDirty = true, beltList = [], machList = [], tunList = [];
  function rebuildTopo() {
    topoDirty = false; beltList = []; machList = []; tunList = [];
    blds.forEach(function (b) { if (b.items) { beltList.push(b); var n = at(b.x + DX[b.outDir], b.y + DY[b.outDir]); b.toHub = !!(n && n.t === 'hub'); } else if (/^(?:tunnel2?|teleport)_(in|out)$/.test(b.t)) tunList.push(b); else if (b.t !== 'hub') machList.push(b); });
    // tunnel pairs
    blds.forEach(function (b) {
      if (!/^(?:tunnel2?|teleport)_in$/.test(b.t)) return; b.pair = null;
      if (b.t === 'teleport_in') { var tp = (b.rule || '').split(','), tn = tp.length === 2 ? at(+tp[0], +tp[1]) : null; if (tn && tn.t === 'teleport_out' && tn.x === +tp[0] && tn.y === +tp[1]) { b.pair = tn; b.dist = 0; } return; }
      var outT = b.t.replace('_in', '_out'), reach = b.t === 'tunnel2_in' ? 9 : 5;
      for (var k = 1; k <= reach; k++) { var n = at(b.x + DX[b.r] * k, b.y + DY[b.r] * k); if (!n) continue; if (n.t === b.t && n.r === b.r) break; if (n.t === outT && n.r === b.r) { b.pair = n; b.dist = k; break; } }
    });
    // Order belts downstream-first, so each one moves after the belt it feeds. Then a queued shape always sees where the
    // shape ahead of it is *this* frame, and a full belt keeps exact half-tile spacing instead of gaining a little per tile.
    var feeds = new Map(), byKey = new Map(), outL = [], seen = new Set();
    beltList.forEach(function (b) { byKey.set(tk(b.x, b.y), b); });
    beltList.forEach(function (b) { var n = byKey.get(tk(b.x + DX[b.outDir], b.y + DY[b.outDir])); b._next = n && n.inDir === b.outDir ? n : null; if (b._next) { var l = feeds.get(b._next); if (!l) feeds.set(b._next, l = []); l.push(b); } });
    var walk = function (start) { var st = [start]; while (st.length) { var b = st.pop(); if (seen.has(b)) continue; seen.add(b); outL.push(b); var l = feeds.get(b); if (l) for (var i = 0; i < l.length; i++) st.push(l[i]); } };
    beltList.forEach(function (b) { if (!b._next) walk(b); });
    beltList.forEach(function (b) { if (!seen.has(b)) walk(b); }); // loops
    beltList = outL;
    beltCount = beltList.length;
    tunPairs = blds.filter(function (b) { return b.pair; });
    tunPairs.forEach(function (b) { var p = b.pair, x0 = Math.min(b.x, p.x), x1 = Math.max(b.x, p.x), y0 = Math.min(b.y, p.y), y1 = Math.max(b.y, p.y);
      for (var cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++) for (var cy = Math.floor(y0 / CS); cy <= Math.floor(y1 / CS); cy++) { var ch = chunks.get(ck(cx, cy)); if (ch && !ch._tl) { ch.dirty = true; } } });
  }
  var tunPairs = [];
  // Teleporter beam: leaves the entrance the way shapes travel into it, and arrives at the exit from behind,
  // along the exit's own direction. Drawn as a soft glow, a bright core, and sparks running from entrance to exit.
  // Beam: a straight run out of the entrance (the way shapes go in), a curve across, and a straight run into the exit
  // along the exit's own direction, so both ends clearly show which way they face.
  function beamPath(a, b) {
    var ax = a.x + 0.5, ay = a.y + 0.5, bx = b.x + 0.5, by = b.y + 0.5, S = 1.1;
    var sx = ax + DX[a.r] * S, sy = ay + DY[a.r] * S, ex = bx - DX[b.r] * S, ey = by - DY[b.r] * S;
    var L = Math.hypot(ex - sx, ey - sy), k = Math.max(0.8, Math.min(3.5, L * 0.4));
    return [ax, ay, sx, sy, sx + DX[a.r] * k, sy + DY[a.r] * k, ex - DX[b.r] * k, ey - DY[b.r] * k, ex, ey, bx, by];
  }
  function bez(p, t) { var u = 1 - t; return [u * u * u * p[2] + 3 * u * u * t * p[4] + 3 * u * t * t * p[6] + t * t * t * p[8], u * u * u * p[3] + 3 * u * u * t * p[5] + 3 * u * t * t * p[7] + t * t * t * p[9]]; }
  function beamAt(p, u) { // position along the whole beam, 0 → 1
    var l1 = Math.hypot(p[2] - p[0], p[3] - p[1]), l3 = Math.hypot(p[10] - p[8], p[11] - p[9]), l2 = Math.max(0.5, Math.hypot(p[8] - p[2], p[9] - p[3]) * 1.15), Lt = l1 + l2 + l3, d = u * Lt;
    if (d < l1) return [p[0] + (p[2] - p[0]) * d / l1, p[1] + (p[3] - p[1]) * d / l1];
    if (d < l1 + l2) return bez(p, (d - l1) / l2);
    var f = (d - l1 - l2) / l3; return [p[8] + (p[10] - p[8]) * f, p[9] + (p[11] - p[9]) * f];
  }
  function drawBeam(p, T, hx, hy, ph, alpha) {
    var X = function (v) { return v * T + hx; }, Y = function (v) { return v * T + hy; };
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(X(p[0]), Y(p[1])); ctx.lineTo(X(p[2]), Y(p[3]));
    ctx.bezierCurveTo(X(p[4]), Y(p[5]), X(p[6]), Y(p[7]), X(p[8]), Y(p[9])); ctx.lineTo(X(p[10]), Y(p[11]));
    ctx.strokeStyle = 'rgba(108,92,231,.18)'; ctx.lineWidth = T * 0.34; ctx.stroke();
    ctx.strokeStyle = 'rgba(108,92,231,.55)'; ctx.lineWidth = T * 0.13; ctx.stroke();
    ctx.strokeStyle = 'rgba(239,235,255,.95)'; ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.stroke();
    ctx.fillStyle = '#FFFDF8';
    for (var i = 0; i < 4; i++) { var q = beamAt(p, (ph * 0.5 + i / 4) % 1); ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), Math.max(1.5, T * 0.06), 0, 7); ctx.fill(); }
    ctx.restore();
  }



  /* ================= simulation ================= */
  var beltCount = 0;
  function rate(t) { return G.sp[AREA[t] || 'belt'] * (MULT[t] == null ? 1 : MULT[t]); }
  function beltTPS() { return G.sp.belt * GAP; }
  function acceptInto(tg, item, dir, fx, fy) {
    if (!tg) return false;
    if (tg.items) { // belt: only from behind
      if (dir !== tg.inDir) return false;
      var last = tg.items[tg.items.length - 1]; if (last && last.p < GAP) return false;
      var p0 = last ? last.p - GAP : 0; if (p0 < 0 || p0 > 0.3) p0 = 0;
      tg.items.push({ c: item, p: p0 }); return true;
    }
    if (tg.t === 'hub') {
      if (fx + DX[dir] < tg.x || fx + DX[dir] >= tg.x + 4 || fy + DY[dir] < tg.y || fy + DY[dir] >= tg.y + 4) return false;
      deliver(item); return true;
    }
    if (tg.t === 'bin') { clickSoft(); return true; } // from any side
    // Link Miners pass shapes on from any side except the one they push out of, so chains can turn corners
    if (tg.t === 'extractor2' && fx + DX[dir] === tg.x && fy + DY[dir] === tg.y && !(fx === tg.x + DX[tg.r] && fy === tg.y + DY[tg.r])) {
      if (tg.inb[0] != null) return false; tg.inb[0] = item; return true;
    }
    if (tg.t === 'teleport_in' && fx + DX[dir] === tg.x && fy + DY[dir] === tg.y) {
      var lnT = tg.lane, lsT = lnT[lnT.length - 1]; if (lsT && lsT.p < GAP) return false;
      var p0T = lsT ? lsT.p - GAP : 0; if (p0T < 0 || p0T > 0.3) p0T = 0; lnT.push({ c: item, p: p0T }); return true;
    }
    for (var i = 0; i < tg.ins.length; i++) {
      var p = tg.ins[i];
      if (p.nx === fx && p.ny === fy && p.dir === dir) {
        if (!ANYKIND[tg.t] && (p.k === 'c') !== isCol(item)) return false;
        if (/^(?:tunnel2?|teleport)_in$/.test(tg.t)) { var ln = tg.lane, lst = ln[ln.length - 1]; if (lst && lst.p < GAP) return false; var lp0 = lst ? lst.p - GAP : 0; if (lp0 < 0 || lp0 > 0.3) lp0 = 0; ln.push({ c: item, p: lp0 }); return true; }
        if (tg.inb[i] != null) return false;
        tg.inb[i] = item; return true;
      }
    }
    return false;
  }
  var ANYKIND = { split_l: 1, split_r: 1, tunnel_in: 1, tunnel2_in: 1, teleport_in: 1, splitter: 1, balancer: 1, balancer_l: 1, balancer_r: 1, filter: 1, extractor2: 1 };
  var simN = 0;
  function stepBelts(dt) {
    var v = beltTPS() * dt; simN++;
    for (var i = 0; i < beltList.length; i++) {
      var b = beltList[i], it = b.items; if (!it.length) continue;
      for (var q0 = 0; q0 < it.length; q0++) if (it[q0].s !== simN) it[q0].pp = it[q0].p;
      var f = it[0], lim = b.toHub ? 1.45 : 1, nx = b.x + DX[b.outDir], ny = b.y + DY[b.outDir], tgB = at(nx, ny);
      // Free road ahead: the front item may run past the end by up to one step, and that overshoot is carried onto the
      // next tile, so speed never drops at a tile edge. Queued: it stops a full gap behind the next belt's last item.
      var arrB = tgB && (tgB.items || tgB.lane), cap = arrB && arrB.length ? 1 + arrB[arrB.length - 1].p - GAP : Infinity;
      var addF = f.s === simN ? 0 : v; // an item that just crossed over has already moved this step
      f.p = Math.min(f.p + addF, Math.max(cap, f.p));
      if (f.p >= lim) {
        var over = f.p - lim, wasP = f.pp;
        if (acceptInto(tgB, f.c, b.outDir, b.x, b.y)) {
          it.shift(); if (b.mlog) b.mlog.push(beltClock);
          // the next item becomes the front: it still moves this step, staying a gap behind the one that just left
          if (it.length) { var nf = it[0]; nf.p = Math.min(nf.p + (nf.s === simN ? 0 : v), f.p - GAP); }
          if (tgB.items) { var nl = tgB.items[tgB.items.length - 1]; nl.p = over; nl.s = simN; nl.pp = (wasP == null ? lim : wasP) - lim; }
          else if (tgB.lane && tgB.lane.length) { var tl = tgB.lane, nl2 = tl[tl.length - 1]; nl2.p = tl.length > 1 ? Math.min(over, tl[tl.length - 2].p - GAP) : over; nl2.s = simN; }
        } else f.p = lim;
      }
      for (var j = 1; j < it.length; j++) it[j].p = Math.min(it[j].p + (it[j].s === simN ? 0 : v), it[j - 1].p - GAP);
    }
  }
  function pushOut(m) {
    for (var j = 0; j < m.outs.length; j++) {
      if (m.outb[j] == null) continue; var p = m.outs[j];
      if (acceptInto(at(p.nx, p.ny), m.outb[j], p.dir, p.tx, p.ty)) m.outb[j] = null;
    }
  }
  var QORD = [3, 0, 1, 2]; // port i → quarter: TL, TR, BR, BL
  var PROC = {
    splitter: function (m) { var a = m.inb[0]; if (a == null) return null; var o = m.rr, out = [null, null]; if (m.outb[o] != null) o = 1 - o; if (m.outb[o] != null) return null; m.rr = 1 - o; out[o] = a; return { use: [0], out: out }; },
    balancer_l: function (m) { var k = m.rr; if (m.inb[k] == null) k = 1 - k; if (m.inb[k] == null) return null; m.rr = 1 - k; return { use: [k], out: [m.inb[k]] }; },
    balancer: function (m) { var k = m.inb[m.rr] != null ? m.rr : 1 - m.rr; if (m.inb[k] == null) return null; var o = m.rr2 || 0, out = [null, null]; if (m.outb[o] != null) o = 1 - o; if (m.outb[o] != null) return null; m.rr = 1 - k; m.rr2 = 1 - o; out[o] = m.inb[k]; return { use: [k], out: out }; },
    cutter: function (m) { var a = m.inb[0]; if (a == null) return null; return { use: [0], out: [only(a, [2, 3]), only(a, [0, 1])] }; },
    // Quarter order on every ×4 building is clockwise from top-left: ports left→right = TL, TR, BR, BL (codes store TR, BR, BL, TL).
    quad: function (m) { var a = m.inb[0]; if (a == null) return null; return { use: [0], out: QORD.map(function (k) { return only(a, [k]); }) }; },
    rotator: function (m) { var a = m.inb[0]; return a == null ? null : { use: [0], out: [rot(a, 1)] }; },
    rotator_ccw: function (m) { var a = m.inb[0]; return a == null ? null : { use: [0], out: [rot(a, 3)] }; },
    rotator_180: function (m) { var a = m.inb[0]; return a == null ? null : { use: [0], out: [rot(a, 2)] }; },
    combiner: function (m) { var a = m.inb[0], b = m.inb[1]; if (a == null || b == null) return null; if (overlap(a, b)) { m.bad = true; return null; } m.bad = false; return { use: [0, 1], out: [merge([a, b])] }; },
    quad_combiner: function (m) {
      // Joins as soon as 2–4 pieces are waiting, whichever inputs they are on. No waiting for the rest.
      var use = [], got = [], missing = 0;
      for (var i = 0; i < m.ins.length; i++) { if (m.inb[i] != null) { use.push(i); got.push(m.inb[i]); } else if (at(m.ins[i].nx, m.ins[i].ny)) missing++; }
      if (got.length < 2) return null;
      for (var a = 0; a < got.length; a++) for (var b = a + 1; b < got.length; b++) if (overlap(got[a], got[b])) { m.bad = true; return null; }
      m.bad = false;
      return { use: use, out: [merge(got)] };
    },
    painter: function (m) { // paints when paint is waiting; otherwise the shape passes straight through, unpainted
      var s = m.inb[0], c = m.inb[1]; if (s == null) return null;
      if (c == null) return { use: [0], out: [s] }; // no paint waiting (or nothing on the paint input): pass the shape straight through
      return { use: [0, 1], out: [paint(s, c)] };
    },
    quad_painter: function (m) {
      var s = m.inb[4]; if (s == null) return null; var q = qs(s), use = [4];
      for (var i = 0; i < 4; i++) { var conn = !!at(m.ins[i].nx, m.ins[i].ny), k = QORD[i]; if (m.inb[i] != null) { use.push(i); if (q[k] !== '--') q[k] = q[k][0] + m.inb[i]; } else if (conn) return null; }
      return { use: use, out: [q.join('')] };
    },
    mixer: function (m) { var a = m.inb[0], b = m.inb[1]; if (a == null || b == null) return null; var c = mix(a, b); if (!c) { m.bad = true; return null; } m.bad = false; return { use: [0, 1], out: [c] }; },
    mixer_w: function (m) { // one of each primary, any order
      var a = m.inb[0], b = m.inb[1], c = m.inb[2]; if (a == null || b == null || c == null) return null;
      var ok = [a, b, c].sort().join('') === 'bgr'; m.bad = !ok; return ok ? { use: [0, 1, 2], out: ['w'] } : null;
    },
    filter: function (m) { var a = m.inb[0]; if (a == null) return null; return { use: [0], out: [matches(a, m.rule) ? a : null] }; }
  };
  PROC.balancer_r = PROC.balancer_l;
  PROC.split_l = PROC.split_r = PROC.splitter; // straight on and to the side, in turn
  function stepMachines(dt) {
    for (var i = 0; i < machList.length; i++) {
      var m = machList[i]; pushOut(m);
      if (m.t === 'extractor' || m.t === 'extractor2') {
        var kind = patches.get(tk(m.x, m.y)); m.tm = Math.max(m.tm - dt, -STEP);
        if (m.outb[0] == null) {
          if (m.t === 'extractor2' && m.inb[0] != null && (m.rr || m.tm > 0 || !kind)) { m.outb[0] = m.inb[0]; m.inb[0] = null; m.rr = 0; }
          else if (kind && m.tm <= 0) { m.outb[0] = kind; m.tm += 1 / rate(m.t); if (m.tm < 0) m.tm = 0; m.rr = 1; }
        }
        continue;
      }
      var fn = PROC[m.t]; if (!fn) continue;
      if (m.pend) {
        m.tm -= dt;
        if (m.tm <= 0) {
          var free = true; for (var j = 0; j < m.pend.length; j++) if (m.pend[j] != null && m.outb[j] != null) free = false;
          if (free) { for (j = 0; j < m.pend.length; j++) if (m.pend[j] != null) m.outb[j] = m.pend[j]; m.pend = null; machineClick(); pushOut(m); }
        }
      }
      if (!m.pend) { var res = fn(m); if (res) { res.use.forEach(function (k) { m.inb[k] = null; }); m.pend = res.out; m.tm += 1 / rate(m.t); if (m.tm < 0) m.tm = 0; } else if (m.tm < 0) m.tm = 0; }
    }
  }
  // Tunnel ends: the entrance lane runs from the tile edge to 0.6 (under the arch), then the shape goes
  // underground and travels the straight distance at belt speed; the exit lane runs from 0.4 (under its arch) to the edge.
  var MOUTH_IN = 0.6, MOUTH_OUT = 0.4;
  function stepTunnel(m, dt) {
    var tps = beltTPS(), v = tps * dt, ln = m.lane, i, j;
    if (/_in$/.test(m.t)) {
      var pr = m.pair;
      var front0 = ln.length ? ln[0].p : 0;
      for (i = 0; i < ln.length; i++) { ln[i].p += v; if (i) ln[i].p = Math.min(ln[i].p, ln[i - 1].p - GAP); }
      // under the arch: hand over with the time already run past the mouth, so the trip takes exactly its length
      while (ln.length && ln[0].p >= MOUTH_IN && pr && pr.q.length < 3 + m.dist * 2) {
        var o = ln[0].p - MOUTH_IN, base = m.t === 'teleport_in' ? 0 : Math.max(0.05, (m.dist - (MOUTH_IN - MOUTH_OUT)) / tps);
        pr.q.push({ c: ln.shift().c, t: base - o / tps });
      }
      // backed up: the queue stops half way into the tile, in plain sight, instead of under the arch
      var full = !pr || pr.q.length >= 3 + m.dist * 2;
      if (ln.length) ln[0].p = Math.min(ln[0].p, full ? Math.max(0.5, Math.min(front0, MOUTH_IN)) : MOUTH_IN);
      for (i = 1; i < ln.length; i++) ln[i].p = Math.min(ln[i].p, ln[i - 1].p - GAP);
      return;
    }
    for (var q = 0; q < m.q.length; q++) m.q[q].t -= dt;
    var po = m.outs[0], nbo = at(po.nx, po.ny), lim2 = nbo && nbo.t === 'hub' ? 1.45 : 1;
    // move what is already out, hand the front on, then let waiting shapes out behind it (using fresh positions)
    for (j = 0; j < ln.length; j++) { ln[j].p += v; if (j) ln[j].p = Math.min(ln[j].p, ln[j - 1].p - GAP); }
    if (ln.length && ln[0].p >= lim2) {
      var over = ln[0].p - lim2;
      if (acceptInto(nbo, ln[0].c, po.dir, po.tx, po.ty)) {
        ln.shift();
        if (nbo && nbo.items && nbo.items.length) { var it2 = nbo.items, nl = it2[it2.length - 1]; nl.p = it2.length > 1 ? Math.min(over, it2[it2.length - 2].p - GAP) : over; }
      } else ln[0].p = lim2;
    }
    while (m.q.length && m.q[0].t <= 0) {
      var lst = ln[ln.length - 1], maxP = lst ? lst.p - GAP : lim2; if (maxP < MOUTH_OUT) break;
      var qi = m.q.shift(); ln.push({ c: qi.c, p: Math.min(MOUTH_OUT + (-qi.t) * tps, maxP) });
    }
  }
  var chevPh = 0;
  /* Motion is continuous: everything you can see moving (belt items, tunnel mouths, chevrons) advances every
     displayed frame by the real time since the last one, in sub-steps of at most 1/60s. Nothing is interpolated,
     so a shape is always exactly where its belt has carried it. Machines (cut, paint, mine…) tick at a fixed 30Hz. */
  var beltClock = 0;
  function moveBelts(dt) {
    var n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n; beltClock += dt;
    for (var s = 0; s < n; s++) {
      chevPh += beltTPS() * h;
      for (var i = 0; i < tunList.length; i++) if (/_in$/.test(tunList[i].t)) stepTunnel(tunList[i], h); // entrances
      stepBelts(h);
      for (i = 0; i < tunList.length; i++) if (/_out$/.test(tunList[i].t)) stepTunnel(tunList[i], h); // exits
    }
  }
  function sim(dt) { if (topoDirty) rebuildTopo(); stepMachines(dt); moveBelts(dt); }

  /* ================= orders & progress ================= */
  function lvlNum() { return G.level > 20 ? 21 + (G.fpN || 0) : G.level; }
  function order() { return G.level <= 20 ? LV[G.level - 1][0] : G.fpOrder; }
  function need() { return G.level <= 20 ? LV[G.level - 1][1] : Math.min(1000, 450 + 50 * G.fpN); }
  function deliver(item) {
    if (item !== order() || doneOpen) return;
    G.got++; deliverSound(); hubPulse = 1; pillDirty = true;
    if (G.got >= need()) completeOrder();
  }
  var doneOpen = false;
  function completeOrder() {
    var lvl = G.level; fanfare();
    if (lvl <= 20) {
      G.level++; G.got = 0;
      if (G.level > 20) { G.fsp = speedsAt(21); G.fpN = 0; G.fpOrder = randomOrder(Math.random); }
      G.sp = G.level <= 20 ? speedsAt(G.level) : G.fsp;
      if (G.level >= UNLOCK.extractor2 + 1) blds.slice().forEach(function (b) { if (b.t === 'extractor') { removeB(b); place(create('extractor2', b.x, b.y, b.r)); } });
      openDone(lvl);
    } else {
      // freeplay: +0.1 items/s to one area, weighted towards the slowest; cap 12
      var s = G.fsp, open = AREAS.filter(function (k) { return s[k] < 12; });
      if (open.length) { var mn = Math.min.apply(null, open.map(function (k) { return s[k]; })), w = open.map(function (k) { return Math.exp(-(s[k] - mn) / 0.15); }), tot = w.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * tot, pick = open[0];
        for (var i = 0; i < open.length; i++) { r -= w[i]; if (r <= 0) { pick = open[i]; break; } }
        s[pick] = Math.round(Math.min(12, s[pick] + 0.1) * 10) / 10; toast('speed', AREA_INFO[pick][0] + ' +0.1 items/s'); }
      G.fpN++; G.got = 0; G.fpOrder = randomOrder(Math.random); G.sp = G.fsp;
    }
    refreshFilters();
    pillDirty = true; buildBar(); saveSoon();
  }
  function unlocked(t) { return (UNLOCK[t] != null ? UNLOCK[t] : 99) < G.level; }

  /* ================= rendering ================= */
  var cv = $('#world'), ctx = cv.getContext('2d'), VW = 0, VH = 0;
  var cam = { x: -4, y: 0, T: 46 }, renderT = 46, zoomSettle = 0;
  var chunks = new Map(), spriteCache = new Map(), frameNo = 0, hubPulse = 0;
  function resize() {
    VW = innerWidth; VH = innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    ['#pHome', '#pPick'].forEach(function (s, i) { var p = $(s); p.style.top = (i * VH) + 'px'; p.style.height = VH + 'px'; });
    $('#strip').style.height = (3 * VH) + 'px';
    ['#fvHome', '#fvPick'].forEach(function (s) { var f = $(s); f.setAttribute('width', VW); f.setAttribute('height', VH); });
    setStripPos(false);
  }
  function hexMix(a, b, t) { var A = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), B = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); }); return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')'; }
  function patchBase(kind) { var c = kind.length === 1 ? kind : kind[1]; return c === 'u' ? '#DCD8E6' : hexMix(K.COL[c], '#ffffff', 0.62); }
  function sprite(code, px) {
    var k = code + '|' + px, c = spriteCache.get(k);
    if (!c) {
      var s = Math.ceil(px * 1.25); c = document.createElement('canvas'); c.width = c.height = Math.ceil(s * DPR);
      var x = c.getContext('2d'); x.scale(DPR, DPR); K.drawShape(x, code, s / 2, s / 2, px); c._s = s;
      spriteCache.set(k, c); if (spriteCache.size > 800) spriteCache.delete(spriteCache.keys().next().value);
    }
    return c;
  }
  function renderChunk(ch, cx, cy, T) {
    var px = CS * T, cd = Math.min(DPR, 1024 / px), w = Math.ceil(px * cd);
    ['base', 'mid', 'top'].forEach(function (n) { if (!ch[n]) ch[n] = document.createElement('canvas'); if (ch[n].width !== w) { ch[n].width = w; ch[n].height = w; } });
    var b = ch.base.getContext('2d'), t = ch.top.getContext('2d'), far = T < 20, ox = -cx * CS * T, oy = -cy * CS * T;
    // wipe every pixel of both caches first: the canvases are rounded up to whole pixels, so clearing in tile units
    // could leave the last row and column holding bits of whatever was drawn there before
    t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, w, w);
    var mctx = ch.mid.getContext('2d'); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, w, w); mctx.setTransform(cd, 0, 0, cd, 0, 0); mctx.__dpr = cd;
    b.setTransform(1, 0, 0, 1, 0, 0); b.fillStyle = FLOOR; b.fillRect(0, 0, w, w);
    [b, t].forEach(function (c) { c.setTransform(cd, 0, 0, cd, 0, 0); c.__dpr = cd; });
    if (T >= 14) { b.strokeStyle = GRID; b.lineWidth = 1; b.beginPath(); for (var i = 0; i <= CS; i++) { b.moveTo(i * T + 0.5, 0); b.lineTo(i * T + 0.5, px); b.moveTo(0, i * T + 0.5); b.lineTo(px, i * T + 0.5); } b.stroke(); }
    // patches (one region per kind, with a 1-tile ring so corners round correctly across chunk edges)
    for (var ex = cx - 1; ex <= cx + 1; ex++) for (var ey = cy - 1; ey <= cy + 1; ey++) ensurePatches(ex, ey);
    var byKind = {};
    for (var y = cy * CS - 1; y <= cy * CS + CS; y++) for (var x = cx * CS - 1; x <= cx * CS + CS; x++) { var kd = patches.get(tk(x, y)); if (kd) (byKind[kd] = byKind[kd] || []).push([x, y]); }
    Object.keys(byKind).forEach(function (kd) {
      K.fillRegion(b, byKind[kd], T, ox, oy, T * 0.4, patchBase(kd));
      if (far) return;
      b.save(); b.globalAlpha = 0.55;
      byKind[kd].forEach(function (p) {
        if (p[0] < cx * CS || p[0] >= cx * CS + CS || p[1] < cy * CS || p[1] >= cy * CS + CS) return;
        var X = ox + (p[0] + 0.5) * T, Y = oy + (p[1] + 0.5) * T;
        if (kd.length === 1) { b.beginPath(); b.arc(X, Y, T * 0.16, 0, 7); b.fillStyle = K.COL[kd]; b.fill(); b.lineWidth = 1; b.strokeStyle = INK; b.stroke(); }
        else K.drawShape(b, kd, X, Y, T * 0.5);
      });
      b.restore();
    });
    if (!far) tunPairs.forEach(function (tb) {
      if (tb.t === 'teleport_in') return;
      var p = tb.pair, x0 = Math.min(tb.x, p.x), x1 = Math.max(tb.x, p.x), y0 = Math.min(tb.y, p.y), y1 = Math.max(tb.y, p.y);
      if (x1 < cx * CS || x0 >= cx * CS + CS || y1 < cy * CS || y0 >= cy * CS + CS) return;
      b.save(); b.setLineDash([T * 0.14, T * 0.16]); b.lineCap = 'round'; b.strokeStyle = 'rgba(35,33,58,.3)'; b.lineWidth = T * 0.12;
      b.beginPath(); b.moveTo(ox + (tb.x + 0.5) * T, oy + (tb.y + 0.5) * T); b.lineTo(ox + (p.x + 0.5) * T, oy + (p.y + 0.5) * T); b.stroke(); b.restore();
    });
    b = mctx; // from here on, belts and the belt strips under ports go on the middle layer
    // belt strips under building ports are drawn here without arrows; their arrows are drawn live with the belts'
    ch.stubs = []; var stub = function (x, y, d, p0, p1) { ch.stubs.push([x, y, d, p0, p1]); };
    var set = bchunk.get(ck(cx, cy)); if (!set) { ch.dirty = false; ch.T = T; return; }
    set.forEach(function (m) {
      var X = ox + m.x * T, Y = oy + m.y * T;
      if (m.items) {
        if (far) { // zoomed out: a flat strip from the tile's in-edge to its middle, and from the middle to its out-edge
          b.fillStyle = '#5F5B7C'; var th = T * 0.4, h2 = th / 2, cxm = X + T / 2, cym = Y + T / 2;
          [[(m.inDir + 2) & 3], [m.outDir]].forEach(function (q) { var d = q[0];
            if (d === 0) b.fillRect(cxm - h2, Y, th, T / 2 + h2); else if (d === 2) b.fillRect(cxm - h2, cym - h2, th, T / 2 + h2);
            else if (d === 1) b.fillRect(cxm - h2, cym - h2, T / 2 + h2, th); else b.fillRect(X, cym - h2, T / 2 + h2, th); });
        }
        else {
          K.drawBuilding(b, m.t, m.r, T, { x: X, y: Y, phase: 0, noChev: true, noBox: true });
          if (m.toHub) { var hx = X + DX[m.outDir] * T, hy = Y + DY[m.outDir] * T, d = m.outDir, a = 0.45 * T, f = 0.55 * T;
            var rc = d === 0 ? [0, a, T, f] : d === 1 ? [0, 0, f, T] : d === 2 ? [0, 0, T, f] : [a, 0, f, T];
            b.save(); b.beginPath(); b.rect(hx + rc[0], hy + rc[1], rc[2], rc[3]); b.clip(); K.drawBuilding(b, 'belt', d, T, { x: hx, y: hy, phase: 0, noChev: true }); b.restore(); stub(m.x + DX[d], m.y + DY[d], d, 0, 0.55); }
        }
        return;
      }
      if (m.t === 'hub') return;
      if (far) { t.fillStyle = K.CAT[m.d.cat] || '#ccc'; t.fillRect(X + 1, Y + 1, m.rw * T - 2, m.rh * T - 2); t.strokeStyle = INK; t.lineWidth = 1.5; t.strokeRect(X + 1, Y + 1, m.rw * T - 2, m.rh * T - 2); return; }
      if (m.t === 'bin' || m.t === 'teleport_in') { // a belt appears on every side something feeds it
        for (var d = 0; d < 4; d++) {
          var nx2 = m.x - DX[d], ny2 = m.y - DY[d], src = at(nx2, ny2); if (!src) continue;
          var feeds = src.items ? src.outDir === d : (src.outs || []).some(function (p) { return p.nx === m.x && p.ny === m.y && p.dir === d; });
          if (!feeds) continue;
          var a1 = 0.45 * T, f1 = 0.55 * T, rc1 = d === 0 ? [0, a1, T, f1] : d === 1 ? [0, 0, f1, T] : d === 2 ? [0, 0, T, f1] : [a1, 0, f1, T];
          b.save(); b.beginPath(); b.rect(X + rc1[0], Y + rc1[1], rc1[2], rc1[3]); b.clip(); K.drawBuilding(b, 'belt', d, T, { x: X, y: Y, phase: 0, noChev: true }); b.restore(); stub(m.x, m.y, d, 0, 0.55);
        }
      }
      // belts run on under the machine where a belt connects
      m.ins.concat(m.outs).forEach(function (p) {
        var nb = at(p.nx, p.ny); if (!nb) return;
        var tunEnd = /^(?:tunnel|teleport)/.test(m.t);
        if (!nb.items && !tunEnd && !/^(?:tunnel|teleport)/.test(nb.t)) return; // a belt runs under any port that meets a belt or a tunnel end (both sides)
        if (nb.t === 'hub' && p.io === 'out') { // and the belt carries on under the Hub's edge
          var HX = ox + p.nx * T, HY = oy + p.ny * T, d0 = p.dir, a0 = 0.45 * T, f0 = 0.55 * T, rc0 = d0 === 0 ? [0, a0, T, f0] : d0 === 1 ? [0, 0, f0, T] : d0 === 2 ? [0, 0, T, f0] : [a0, 0, f0, T];
          b.save(); b.beginPath(); b.rect(HX + rc0[0], HY + rc0[1], rc0[2], rc0[3]); b.clip(); K.drawBuilding(b, 'belt', d0, T, { x: HX, y: HY, phase: 0, noChev: true }); b.restore(); stub(p.nx, p.ny, d0, 0, 0.55);
        }
        var PX = ox + p.tx * T, PY = oy + p.ty * T, a = 0.45 * T, f = 0.55 * T, r = p.dir, inS = p.io === 'in';
        var rect = r === 0 ? (inS ? [0, a, T, f] : [0, 0, T, f]) : r === 1 ? (inS ? [0, 0, f, T] : [a, 0, f, T]) : r === 2 ? (inS ? [0, 0, T, f] : [0, a, T, f]) : (inS ? [a, 0, f, T] : [0, 0, f, T]);
        b.save(); b.beginPath(); b.rect(PX + rect[0], PY + rect[1], rect[2], rect[3]); b.clip(); K.drawBuilding(b, 'belt', p.dir, T, { x: PX, y: PY, phase: 0, noChev: true }); b.restore(); stub(p.tx, p.ty, p.dir, inS ? 0 : 0.45, inS ? 0.55 : 1);
      });
      K.drawBuilding(t, m.t, m.r, T, { x: X, y: Y, phase: 0, item: /^extractor/.test(m.t) ? patches.get(tk(m.x, m.y)) : (m.t === 'filter' ? (m.rule || '********') : undefined), paint: 'r' });
    });
    ch.dirty = false; ch.T = T;
  }
  var BP = [0, 0];
  function beltPosTo(b, p, out) { // same maths as beltPos, written into out (no garbage per item per frame)
    var cx = b.x + 0.5, cy = b.y + 0.5, ex = cx - DX[b.inDir] * 0.5, ey = cy - DY[b.inDir] * 0.5, xx = cx + DX[b.outDir] * 0.5, xy = cy + DY[b.outDir] * 0.5;
    if (b.inDir === b.outDir) { out[0] = ex + (xx - ex) * p; out[1] = ey + (xy - ey) * p; return out; }
    if (p < 0) { out[0] = ex + DX[b.inDir] * p; out[1] = ey + DY[b.inDir] * p; return out; }
    if (p > 1) { out[0] = xx + DX[b.outDir] * (p - 1); out[1] = xy + DY[b.outDir] * (p - 1); return out; }
    var ox = ex + xx - cx, oy = ey + xy - cy, a0 = Math.atan2(ey - oy, ex - ox), a1 = Math.atan2(xy - oy, xx - ox), da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    var a = a0 + da * p; out[0] = ox + Math.cos(a) * 0.5; out[1] = oy + Math.sin(a) * 0.5; return out;
  }
  function beltPos(b, p) {
    var cx = b.x + 0.5, cy = b.y + 0.5, ex = cx - DX[b.inDir] * 0.5, ey = cy - DY[b.inDir] * 0.5, xx = cx + DX[b.outDir] * 0.5, xy = cy + DY[b.outDir] * 0.5;
    if (b.inDir === b.outDir) return [ex + (xx - ex) * p, ey + (xy - ey) * p];
    if (p < 0) return [ex + DX[b.inDir] * p, ey + DY[b.inDir] * p];   // still on the way in (between sim steps)
    if (p > 1) return [xx + DX[b.outDir] * (p - 1), xy + DY[b.outDir] * (p - 1)]; // sliding on under the Hub
    var ox = ex + xx - cx, oy = ey + xy - cy, a0 = Math.atan2(ey - oy, ex - ox), a1 = Math.atan2(xy - oy, xx - ox), da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    var a = a0 + da * p; return [ox + Math.cos(a) * 0.5, oy + Math.sin(a) * 0.5];
  }
  function w2s(x, y) { return [(x - cam.x) * cam.T + VW / 2, (y - cam.y) * cam.T + VH / 2]; }
  function s2w(sx, sy) { return [(sx - VW / 2) / cam.T + cam.x, (sy - VH / 2) / cam.T + cam.y]; }
  function render(now) {
    frameNo++;
    var T = cam.T;
    if (Math.abs(renderT - T) > 0.01 && now - zoomSettle > 160 && !pinch) renderT = T;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = FLOOR; ctx.fillRect(0, 0, VW, VH);
    var tl = s2w(0, 0), br = s2w(VW, VH);
    var c0x = Math.floor(tl[0] / CS), c0y = Math.floor(tl[1] / CS), c1x = Math.floor(br[0] / CS), c1y = Math.floor(br[1] / CS);
    var budget = pinch ? 1 : 2, vis = [];
    for (var cx = c0x; cx <= c1x; cx++) for (var cy = c0y; cy <= c1y; cy++) {
      var k = ck(cx, cy), ch = chunks.get(k); if (!ch) { ch = { dirty: true }; chunks.set(k, ch); }
      ch.seen = frameNo;
      if ((ch.dirty || ch.T !== renderT) && budget > 0 && (!pinch || !ch.base)) { renderChunk(ch, cx, cy, renderT); budget--; }
      vis.push([ch, cx, cy]);
    }
    if (budget > 0 && !pinch) { // prepare the ring just off-screen so panning doesn't hitch
      for (var px0 = c0x - 1; px0 <= c1x + 1 && budget > 0; px0++) for (var py0 = c0y - 1; py0 <= c1y + 1 && budget > 0; py0++) {
        if (px0 >= c0x && px0 <= c1x && py0 >= c0y && py0 <= c1y) continue;
        var kk = ck(px0, py0), cr = chunks.get(kk); if (!cr) { cr = { dirty: true }; chunks.set(kk, cr); }
        cr.seen = frameNo; if (cr.dirty || cr.T !== renderT) { renderChunk(cr, px0, py0, renderT); budget--; }
      }
    }
    // chunks are drawn on whole pixels, edge to edge, so neighbouring chunks never overlap or leave a hairline gap
    var layer = function (n) { vis.forEach(function (v) { var ch = v[0]; if (!ch[n]) return; var s = w2s(v[1] * CS, v[2] * CS), e = w2s((v[1] + 1) * CS, (v[2] + 1) * CS), x0 = Math.round(s[0]), y0 = Math.round(s[1]); ctx.drawImage(ch[n], x0, y0, Math.round(e[0]) - x0, Math.round(e[1]) - y0); }); };
    // teleporter beams go on the floor: belts are drawn into the floor cache, so the beam is laid into it here, before anything else
    var drawBeams = function () { if (T < 14) return; var bph = now / 1000; tunPairs.forEach(function (tb) { if (tb.t !== 'teleport_in') return; drawBeam(beamPath(tb, tb.pair), T, hx, hy, bph, 1); }); };
    layer('base');
    var hx = VW / 2 - cam.x * T, hy = VH / 2 - cam.y * T, fs = frameNo; // world → screen: x * T + hx
    drawBeams(); // on the floor, under belts and buildings
    layer('mid');
    if (T >= 20 && !fast) { // moving chevrons: every visible belt, two per tile, one stroke for the lot
      var cs = T * 0.144, off = chevPh % GAP;
      ctx.beginPath();
      for (var vi = 0; vi < vis.length; vi++) { var set = bchunk.get(ck(vis[vi][1], vis[vi][2])); if (!set) continue; set.forEach(function (b) {
        if (!b.items || b._cf === fs) return; b._cf = fs;
        for (var k = 0; k < 2; k++) {
          var p = off + k * GAP; beltPosTo(b, p, BP); var ax = BP[0], ay = BP[1]; beltPosTo(b, Math.min(1, p + 0.02), BP);
          var fx = BP[0] - ax, fy = BP[1] - ay, fl = Math.sqrt(fx * fx + fy * fy) || 1; fx /= fl; fy /= fl;
          var rx = -fy, ry = fx, X = ax * T + hx, Y = ay * T + hy;
          ctx.moveTo(X - rx * cs - fx * cs * 0.55, Y - ry * cs - fy * cs * 0.55); ctx.lineTo(X + fx * cs * 0.45, Y + fy * cs * 0.45); ctx.lineTo(X + rx * cs - fx * cs * 0.55, Y + ry * cs - fy * cs * 0.55);
        }
      }); }
      var seenS = {}; // arrows on the short belt strips under ports, same phase as the belts
      for (var vs = 0; vs < vis.length; vs++) { var sl = vis[vs][0].stubs; if (!sl) continue;
        for (var si = 0; si < sl.length; si++) { var st = sl[si], key = st[0] + ',' + st[1] + ',' + st[2] + ',' + st[3]; if (seenS[key]) continue; seenS[key] = 1;
          var dx = DX[st[2]], dy = DY[st[2]], bx = st[0] + 0.5 - dx * 0.5, by = st[1] + 0.5 - dy * 0.5, rx2 = -dy, ry2 = dx;
          for (var kk = -1; kk < 3; kk++) { var pc = off + kk * GAP; if (pc < st[3] + 0.04 || pc > st[4] - 0.04) continue;
            var X2 = (bx + dx * pc) * T + hx, Y2 = (by + dy * pc) * T + hy;
            ctx.moveTo(X2 - rx2 * cs - dx * cs * 0.55, Y2 - ry2 * cs - dy * cs * 0.55); ctx.lineTo(X2 + dx * cs * 0.45, Y2 + dy * cs * 0.45); ctx.lineTo(X2 + rx2 * cs - dx * cs * 0.55, Y2 + ry2 * cs - dy * cs * 0.55); } } }
      ctx.strokeStyle = '#FFF3CC'; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    if (T >= (fast ? 30 : 20)) { // items on visible belts
      var px = Math.round(T * 0.56);
      for (var vj = 0; vj < vis.length; vj++) { var set2 = bchunk.get(ck(vis[vj][1], vis[vj][2])); if (!set2) continue; set2.forEach(function (b) {
        if (!b.items || !b.items.length || b._if === fs) return; b._if = fs;
        for (var i = 0; i < b.items.length; i++) { var it = b.items[i]; beltPosTo(b, it.p, BP); var sp = sprite(it.c, px), hs = sp._s / 2; ctx.drawImage(sp, BP[0] * T + hx - hs, BP[1] * T + hy - hs, sp._s, sp._s); }
      }); }
    }
    if (T >= 20) {
      var lpx = Math.round(T * 0.56);
      blds.forEach(function (b) { if (!b.lane || !b.lane.length) return;
        var s0 = w2s(b.x, b.y); if (s0[0] < -T || s0[1] < -T || s0[0] > VW + T || s0[1] > VH + T) return;
        b.lane.forEach(function (it) { var wx = b.x + 0.5 + DX[b.r] * (it.p - 0.5), wy = b.y + 0.5 + DY[b.r] * (it.p - 0.5), s = w2s(wx, wy), sp = sprite(it.c, lpx); ctx.drawImage(sp, s[0] - sp._s / 2, s[1] - sp._s / 2, sp._s, sp._s); });
      });
    }
    layer('top');
    if (T >= 14) { // Timers: items per second over the last 4 seconds, refreshed 4× a second
      var upd = frameNo % 15 === 0;
      for (var vm = 0; vm < vis.length; vm++) { var setm = bchunk.get(ck(vis[vm][1], vis[vm][2])); if (!setm) continue; setm.forEach(function (b) {
        if (!b.mlog || b._mf === fs) return; b._mf = fs;
        if (b.born == null) b.born = beltClock;
        if (upd) { var cut = beltClock - 4; while (b.mlog.length && b.mlog[0] < cut) b.mlog.shift(); var span = Math.min(4, beltClock - b.born); b.rate = span > 0.5 ? fmt(Math.round(b.mlog.length / span * 10) / 10) : '…'; }
        ctx.save(); ctx.translate((b.x + 0.5) * T + hx, (b.y + 0.5) * T + hy); K.meterBox(ctx, T, b.rate); ctx.restore();
      }); }
    }
    // the Hub is live: order, ring, count, pulse
    var hb = G.hub, hs = w2s(hb.x, hb.y); hubPulse *= 0.9;
    if (T < 20) { ctx.fillStyle = K.CAT.hub; ctx.fillRect(hs[0], hs[1], 4 * T, 4 * T); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(hs[0], hs[1], 4 * T, 4 * T); }
    else K.drawBuilding(ctx, 'hub', 0, T, { x: hs[0], y: hs[1], pulse: hubPulse, order: order(), progress: G.got / need(), count: G.got + '/' + need() });
    ctx.__dpr = DPR;
    drawOverlay(now); tutTarget(now);
    if (chunks.size > 260) chunks.forEach(function (ch, key) { if (frameNo - ch.seen > 120) chunks.delete(key); });
  }

  /* ================= tools & overlays ================= */
  var tool = 'build', selFam = 'belt', famVar = {}, placeRot = 0, selB = null;
  var gest = null, pinch = null, ptrs = new Map();
  var area = null;      // {x0,y0,x1,y1} for copy / delete box
  var paste = null;     // {items:[{t,x,y,r,rule}], x, y, w, h}
  var lp = null;        // long press {x,y,t0,b}
  var tun = null;       // tunnel being placed: {t, x, y, r, k}  (entrance at x,y; exit k tiles ahead in direction r)
  function isTunIn(t) { return /^(?:tunnel2?|teleport)_in$/.test(t); }
  var INLINE = { split_l: 1, split_r: 1, balancer_l: 1, balancer_r: 1, meter: 1 };
  function autoRot(t, x, y) {
    if (!INLINE[t]) return -1;
    var eb = at(x, y); if (eb && eb.items) return eb.inDir; // only when dropped onto a belt: keep its flow. Otherwise Rotate decides.
    return -1;
  }
  function feedDir(x, y) {
    for (var d = 0; d < 4; d++) { var n = at(x - DX[d], y - DY[d]); if (!n) continue;
      if (n.items && n.outDir === d) return d;
      if (n.outs && n.outs.some(function (p) { return p.nx === x && p.ny === y && p.dir === d; })) return d; }
    return -1;
  }
  function teleMove(x, y) { if (tun.moving === 'in') { tun.x = x; tun.y = y; } else { tun.ex = x; tun.ey = y; } }
  function teleOk() { return tun && !(tun.ex === tun.x && tun.ey === tun.y) && canPlace('teleport_out', tun.ex, tun.ey, tun.er) && canPlace(tun.t, tun.x, tun.y, tun.r); }
  function tunExit() { return tun.tele ? [tun.ex, tun.ey, tun.er] : [tun.x + DX[tun.r] * tun.k, tun.y + DY[tun.r] * tun.k, tun.r]; }
  function tunReach(t) { return t === 'tunnel2_in' ? 9 : 5; }
  var editIgnore = null;
  function tunTargets() { // every tile the moving end could go on, in all four directions
    if (tun.moving === 'in') {
      var o2 = [], ot2 = tun.t.replace('_in', '_out');
      for (var d2 = 0; d2 < 4; d2++) { if (!canPlace(ot2, tun.fx, tun.fy, d2)) continue;
        for (var k2 = 2; k2 <= tunReach(tun.t); k2++) { var x2 = tun.fx - DX[d2] * k2, y2 = tun.fy - DY[d2] * k2; if (canPlace(tun.t, x2, y2, d2)) o2.push({ d: d2, k: k2, x: x2, y: y2 }); } }
      return o2;
    }
    var out = [], ot = tun.t.replace('_in', '_out');
    for (var d = 0; d < 4; d++) { if (!canPlace(tun.t, tun.x, tun.y, d)) continue;
      for (var k = 2; k <= tunReach(tun.t); k++) { var x = tun.x + DX[d] * k, y = tun.y + DY[d] * k; if (canPlace(ot, x, y, d)) out.push({ d: d, k: k, x: x, y: y }); } }
    return out;
  }
  function famVars(id) { for (var g = 0; g < FAM.length; g++) for (var i = 0; i < FAM[g].length; i++) if (FAM[g][i][0] === id) return FAM[g][i][1]; return [id]; }
  function placeType() { var v = famVars(selFam), t = v[famVar[selFam] || 0]; if (t === 'extractor' && unlocked('extractor2')) t = 'extractor2'; return t; }
  function ghostAt(t, wx, wy) { var dm = dims(t, noRot(t) ? 0 : placeRot); return [Math.floor(wx - dm[0] / 2 + 0.5), Math.floor(wy - dm[1] / 2 + 0.5)]; }
  function minerFacing(x, y, wx, wy) {
    for (var d = 0; d < 4; d++) { var n = at(x + DX[d], y + DY[d]); if (n && n.items && n.inDir === d) return d; }
    var ox = wx - (x + 0.5), oy = wy - (y + 0.5);
    if (Math.max(Math.abs(ox), Math.abs(oy)) < 0.12) return placeRot;
    return Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? 1 : 3) : (oy > 0 ? 2 : 0);
  }
  function canPlace(t, x, y, r) {
    var ok = true;
    tilesOf(t, x, y, r).forEach(function (p) { var e = at(p[0], p[1]); if (e && editIgnore && editIgnore.indexOf(e) >= 0) e = null; if (e && (e.t === 'hub' || !e.items)) ok = false; if (/^extractor/.test(t) && !patches.get(tk(p[0], p[1]))) ok = false; });
    return ok;
  }
  function tileRect(x, y, w, h, fill, stroke, dash) {
    var s = w2s(x, y), T = cam.T; ctx.save(); if (fill) { ctx.fillStyle = fill; ctx.fillRect(s[0], s[1], w * T, h * T); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; if (dash) ctx.setLineDash([8, 6]); ctx.strokeRect(s[0] + 1.5, s[1] + 1.5, w * T - 3, h * T - 3); } ctx.restore();
  }
  function handlesOf(a) { var x0 = a.x0, y0 = a.y0, x1 = a.x1 + 1, y1 = a.y1 + 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2; return [[x0, y0, 'nw'], [mx, y0, 'n'], [x1, y0, 'ne'], [x1, my, 'e'], [x1, y1, 'se'], [mx, y1, 's'], [x0, y1, 'sw'], [x0, my, 'w']]; }
  function normArea(a) { return { x0: Math.min(a.x0, a.x1), y0: Math.min(a.y0, a.y1), x1: Math.max(a.x0, a.x1), y1: Math.max(a.y0, a.y1) }; }
  function drawOverlay(now) {
    var T = cam.T;
    if (selB && tool === 'cursor') tileRect(selB.x, selB.y, selB.rw, selB.rh, 'rgba(108,92,231,.22)', PUR);
    if (clash) { if (now > clash.until) clash = null; else clash.tiles.forEach(function (p) { tileRect(p[0], p[1], 1, 1, 'rgba(231,76,60,.45)', '#E74C3C'); }); }
    if (gest && gest.kind === 'belt' && gest.path) {
      ctx.save(); ctx.globalAlpha = 0.55;
      beltPlan(gest.path).forEach(function (p) { var s = w2s(p.x, p.y); K.drawBuilding(ctx, p.t, p.r, T, { x: s[0], y: s[1] }); });
      ctx.restore();
    }
    if (gest && gest.kind === 'ghost') {
      var t = placeType(), ar = autoRot(t, gest.gx, gest.gy), gr = ar >= 0 ? ar : noRot(t) ? 0 : placeRot, dm = dims(t, gr), ok = canPlace(t, gest.gx, gest.gy, gr);
      tileRect(gest.gx, gest.gy, dm[0], dm[1], ok ? 'rgba(108,92,231,.16)' : 'rgba(231,76,60,.28)', ok ? PUR : '#E74C3C', true);
      var s = w2s(gest.gx, gest.gy); ctx.save(); ctx.globalAlpha = 0.6; K.drawBuilding(ctx, t, gr, T, { x: s[0], y: s[1], item: /^extractor/.test(t) ? patches.get(tk(gest.gx, gest.gy)) : undefined }); ctx.restore();
      ctx.beginPath(); ctx.arc(gest.sx, gest.sy, 28, 0, 7); ctx.strokeStyle = PUR; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (tun && tool === 'tunnel' && tun.tele) {
      var ok = teleOk(), ot2 = 'teleport_out', hx2 = -cam.x * T + VW / 2, hy2 = -cam.y * T + VH / 2;
      drawBeam(beamPath({ x: tun.x, y: tun.y, r: tun.r }, { x: tun.ex, y: tun.ey, r: tun.er }), T, hx2, hy2, now / 1000, ok ? 0.85 : 0.4);
      ctx.save(); ctx.globalAlpha = 0.65; var q1 = w2s(tun.x, tun.y), q2 = w2s(tun.ex, tun.ey); K.drawBuilding(ctx, tun.t, tun.r, T, { x: q1[0], y: q1[1] }); K.drawBuilding(ctx, ot2, tun.er, T, { x: q2[0], y: q2[1] }); ctx.restore();
      tileRect(tun.x, tun.y, 1, 1, null, PUR); tileRect(tun.ex, tun.ey, 1, 1, ok ? null : 'rgba(231,76,60,.28)', ok ? PUR : '#E74C3C', true);
    }
    if (tun && tool === 'tunnel' && !tun.tele) {
      tunTargets().forEach(function (c) { tileRect(c.x, c.y, 1, 1, 'rgba(108,92,231,.14)'); });
      var ex = tun.x + DX[tun.r] * tun.k, ey = tun.y + DY[tun.r] * tun.k, ot = tun.t.replace('_in', '_out'), a1 = w2s(tun.x + 0.5, tun.y + 0.5), a2 = w2s(ex + 0.5, ey + 0.5);
      ctx.save(); ctx.setLineDash([T * 0.14, T * 0.14]); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(108,92,231,.7)'; ctx.lineWidth = T * 0.1; ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.65; var s1 = w2s(tun.x, tun.y), s2 = w2s(ex, ey); K.drawBuilding(ctx, tun.t, tun.r, T, { x: s1[0], y: s1[1] }); K.drawBuilding(ctx, ot, tun.r, T, { x: s2[0], y: s2[1] }); ctx.restore();
      tileRect(ex, ey, 1, 1, null, PUR, true); tileRect(tun.x, tun.y, 1, 1, null, PUR);
    }
    if (area && (tool === 'copy' || tool === 'delete')) {
      var a = normArea(area), red = tool === 'delete', col = red ? '#E74C3C' : PUR;
      tileRect(a.x0, a.y0, a.x1 - a.x0 + 1, a.y1 - a.y0 + 1, red ? 'rgba(231,76,60,.16)' : 'rgba(108,92,231,.12)', col, true);
      if (!gest || gest.kind !== 'area-new') handlesOf(a).forEach(function (h) { var s = w2s(h[0], h[1]); ctx.beginPath(); ctx.arc(s[0], s[1], 9, 0, 7); ctx.fillStyle = '#FFFDF8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); });
    }
    if (paste && tool === 'paste') {
      paste.items.forEach(function (it) { tilesOf(it.t, it.x, it.y, it.r).forEach(function (p) { var e = at(p[0], p[1]); if (e) tileRect(p[0], p[1], 1, 1, e.t === 'hub' ? 'rgba(35,33,58,.25)' : 'rgba(231,76,60,.35)'); }); });
      ctx.save(); ctx.globalAlpha = 0.6; paste.items.forEach(function (it) { var s = w2s(it.x, it.y); K.drawBuilding(ctx, it.t, it.r, T, { x: s[0], y: s[1] }); }); ctx.restore();
      tileRect(paste.x, paste.y, paste.w, paste.h, 'rgba(108,92,231,.1)', PUR);
    }
    if (lp && !lp.fired) {
      var pr = Math.min(1, (now - lp.t0) / 500);
      if (pr > 0.12) { ctx.beginPath(); ctx.arc(lp.sx, lp.sy, 40, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke(); }
      if (pr >= 1) { lp.fired = true; if (lp.b && lp.b.t !== 'hub') { run({ rm: [snap(lp.b)], add: [], label: 'Removed ' + INFO[lp.b.t === 'extractor2' ? 'extractor2' : (INFO[lp.b.t] ? lp.b.t : 'belt')][0] }); popSound(); } gest = null; showCancel(false); }
    }
    placePillbar();
  }
  function snap(b) { return { t: b.t, x: b.x, y: b.y, r: b.r, rule: b.rule, fs: b.fs }; }
  function beltPlan(path) {
    var out = [];
    for (var i = 0; i < path.length; i++) {
      var p = path[i], nx = path[i + 1], pv = path[i - 1], outD, inD;
      outD = nx ? dirTo(p, nx) : (pv ? dirTo(pv, p) : 0);
      if (pv) inD = dirTo(pv, p);
      else { var ex = at(p.x, p.y); inD = ex && ex.items && nx ? ex.inDir : outD; }
      var t = inD === outD ? 'belt' : outD === ((inD + 1) & 3) ? 'belt_r' : outD === ((inD + 3) & 3) ? 'belt_l' : 'belt';
      out.push({ t: t, x: p.x, y: p.y, r: t === 'belt' ? outD : inD });
    }
    return out;
  }
  function dirTo(a, b) { return b.x > a.x ? 1 : b.x < a.x ? 3 : b.y > a.y ? 2 : 0; }

  /* ================= commands (undo / redo) ================= */
  var undoS = [], redoS = [];
  function findSnap(s) { var e = at(s.x, s.y); return e && e.t === s.t && e.x === s.x && e.y === s.y && e.r === s.r ? e : null; }
  function applyCmd(c) {
    c.rm.forEach(function (s) { var e = findSnap(s); if (e) removeB(e); });
    c.add.forEach(function (s) { tilesOf(s.t, s.x, s.y, s.r).forEach(function (p) { var e = at(p[0], p[1]); if (e && e.t !== 'hub') removeB(e); }); place(create(s.t, s.x, s.y, s.r, s)); });
  }
  function withPairs(rm) {
    if (topoDirty) rebuildTopo(); var all = rm.slice();
    rm.forEach(function (s) { var e = findSnap(s); if (!e) return; var p = null;
      if (/^(?:tunnel2?|teleport)_in$/.test(e.t)) p = e.pair; else if (/^(?:tunnel2?|teleport)_out$/.test(e.t)) p = blds.filter(function (b) { return b.pair === e; })[0];
      if (p && !all.some(function (q) { return q.x === p.x && q.y === p.y && q.t === p.t; })) all.push(snap(p)); });
    return all;
  }
  function run(c) { if (!c.rm.length && !c.add.length) return; c.rm = withPairs(c.rm); applyCmd(c); undoS.push(c); if (undoS.length > 80) undoS.shift(); redoS.length = 0; undoUI(); saveSoon(); }
  function undo() { var c = undoS.pop(); if (!c) return; sfx('cancel'); applyCmd({ rm: c.add, add: c.rm }); redoS.push(c); toast('undo', 'Undid: ' + (c.label || 'that')); undoUI(); saveSoon(); }
  function redo() { var c = redoS.pop(); if (!c) return; sfx('cancel', 1.25); applyCmd(c); undoS.push(c); toast('redo', 'Redid: ' + (c.label || 'that')); undoUI(); saveSoon(); }
  function undoUI() { $('#redoBtn').classList.toggle('hidden', !redoS.length); $('#undoBtn').style.opacity = undoS.length ? 1 : 0.45; }
  function withReplaced(adds) { // the new pieces always win: remove whatever they cover (except the Hub)
    var rm = new Map(), keep = [];
    adds.forEach(function (s) {
      var blocked = false; tilesOf(s.t, s.x, s.y, s.r).forEach(function (p) { var e = at(p[0], p[1]); if (e && e.t === 'hub') blocked = true; });
      if (blocked) return; keep.push(s);
      tilesOf(s.t, s.x, s.y, s.r).forEach(function (p) { var e = at(p[0], p[1]); if (e) rm.set(e.id, snap(e)); });
    });
    return { rm: Array.from(rm.values()), add: keep };
  }

  /* ================= input ================= */
  function tileOf(sx, sy) { var w = s2w(sx, sy); return { x: Math.floor(w[0]), y: Math.floor(w[1]), wx: w[0], wy: w[1] }; }
  function overCancel(sx, sy) { var r = $('#cancel').getBoundingClientRect(); return Math.hypot(sx - (r.left + r.width / 2), sy - (r.top + r.height / 2)) < 44; }
  function showCancel(on, hot) { dragging = !!on; var c = $('#cancel'); c.classList.toggle('on', !!on); c.classList.toggle('hot', !!hot); syncRot(); }
  var dragging = false;
  function pairEnds(b) { if (!b || !/^(?:tunnel2?|teleport)_(in|out)$/.test(b.t)) return null; if (topoDirty) rebuildTopo(); var inB = /_in$/.test(b.t) ? b : blds.filter(function (q) { return q.pair === b; })[0]; return inB && inB.pair ? [inB, inB.pair] : null; }
  function startEdit() {
    var ends = pairEnds(selB); if (!ends) return; var inB = ends[0], outB = ends[1], mv = selB === inB ? 'in' : 'out';
    editIgnore = [inB, outB];
    tun = inB.t === 'teleport_in' ? { t: inB.t, x: inB.x, y: inB.y, r: inB.r, tele: true, ex: outB.x, ey: outB.y, er: outB.r } : { t: inB.t, x: inB.x, y: inB.y, r: inB.r, k: inB.dist, fx: outB.x, fy: outB.y };
    tun.moving = mv; tun.edit = [snap(inB), snap(outB)];
    tool = 'tunnel'; selB = null; tickSound(); showPillbar(); buildBar(); updateCard();
  }
  function syncRot() { // the floating Rotate shows only when a turnable building is picked and nothing is being dragged
    var turnSel = tool === 'cursor' && canTurn(selB);
    var show = inGame && ((tool === 'build' && !noRot(placeType())) || turnSel) && !dragging && !modalOpen;
    $('#editFab').classList.toggle('on', !!(inGame && tool === 'cursor' && !dragging && !modalOpen && pairEnds(selB)));
    var r = $('#rotFab'); r.classList.toggle('on', show); r.querySelector('.rtab').style.transform = 'rotate(' + (turnSel ? selB.r : placeRot) * 90 + 'deg)';
  }
  cv.addEventListener('pointerdown', function (e) {
    camAnim = null; try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.button === 1 || e.button === 2) { gest = { kind: 'pan', lx: e.clientX, ly: e.clientY, moved: true }; return; }
    if (ptrs.size === 2) { gest = null; lp = null; showCancel(false); startPinch(); return; }
    if (ptrs.size > 2) return;
    startGesture(e.clientX, e.clientY);
  });
  cv.addEventListener('pointermove', function (e) {
    var p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (pinch) { movePinch(); return; }
    if (gest) moveGesture(e.clientX, e.clientY);
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; zoomSettle = performance.now(); } return; }
    if (gest) endGesture(e.clientX, e.clientY, e.type === 'pointercancel');
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function zoomAt(sx, sy, f) {
    var w = s2w(sx, sy); cam.T = Math.max(14, Math.min(80, cam.T * f));
    cam.x = w[0] - (sx - VW / 2) / cam.T; cam.y = w[1] - (sy - VH / 2) / cam.T; zoomSettle = performance.now();
  }
  function startPinch() { var a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 }; }
  function movePinch() {
    var a = Array.from(ptrs.values()); if (a.length < 2) return;
    var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
    cam.x -= (mx - pinch.mx) / cam.T; cam.y -= (my - pinch.my) / cam.T; zoomAt(mx, my, d / pinch.d);
    pinch.d = d; pinch.mx = mx; pinch.my = my;
  }
  function startGesture(sx, sy) {
    var t = tileOf(sx, sy), b = at(t.x, t.y), now = performance.now();
    lp = null;
    if ((tool === 'cursor' || tool === 'build') && b && b.t !== 'hub') lp = { sx: sx, sy: sy, t0: now, b: b };
    if (tool === 'cursor') { gest = { kind: 'pan', sx: sx, sy: sy, lx: sx, ly: sy, moved: false, b: b }; return; }
    if (tool === 'build') {
      var pt = placeType();
      if (isBelt(pt)) { gest = { kind: 'belt', sx: sx, sy: sy, path: [{ x: t.x, y: t.y }], moved: false, b: b }; dragTick(1); }
      else { var g = ghostAt(pt, t.wx, t.wy); gest = { kind: 'ghost', sx: sx, sy: sy, gx: g[0], gy: g[1], moved: false, b: b }; if (/^extractor/.test(pt)) { placeRot = minerFacing(g[0], g[1], t.wx, t.wy); buildBar(); } showCancel(true); }
      return;
    }
    if (tool === 'copy' || tool === 'delete') {
      if (area) { // grab a handle?
        var a = normArea(area), hit = null;
        handlesOf(a).forEach(function (h) { var s = w2s(h[0], h[1]); if (Math.hypot(s[0] - sx, s[1] - sy) < 30) hit = h[2]; });
        if (hit) { area = a; gest = { kind: 'handle', h: hit }; return; }
      }
      area = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; gest = { kind: 'area-new' }; hidePillbar(); return;
    }
    if (tool === 'paste') { gest = { kind: 'paste', w0: s2w(sx, sy), ox: paste.x, oy: paste.y }; }
    if (tool === 'tunnel') { gest = { kind: 'tunnel' }; moveGesture(sx, sy); }
  }
  var EDGE = { tunnel: 1, 'area-new': 1, handle: 1, paste: 1 };
  function dragSig() {
    if (!gest) return '';
    if (gest.kind === 'belt') return 'b' + gest.path.length + ',' + (gest.path[gest.path.length - 1].x) + ',' + (gest.path[gest.path.length - 1].y);
    if ((gest.kind === 'area-new' || gest.kind === 'handle') && area) return 'a' + area.x0 + ',' + area.y0 + ',' + area.x1 + ',' + area.y1;
    if (gest.kind === 'tunnel' && tun) return 't' + tun.x + ',' + tun.y + ',' + tun.r + ',' + (tun.k || 0) + ',' + (tun.ex || 0) + ',' + (tun.ey || 0);
    if (gest.kind === 'paste' && paste) return 'p' + paste.x + ',' + paste.y;
    return '';
  }
  function moveGesture(sx, sy) { var s0 = dragSig(); moveGesture0(sx, sy); var s1 = dragSig(); if (s1 && s1 !== s0) dragTick(gest && gest.kind === 'belt' ? gest.path.length : 0); }
  function moveGesture0(sx, sy) {
    var t = tileOf(sx, sy); gest.cx = sx; gest.cy = sy; // last finger position, for edge scrolling
    if (lp && Math.hypot(sx - lp.sx, sy - lp.sy) > 10) lp = null;
    if (gest.kind === 'pan') { if (!gest.moved && Math.hypot(sx - gest.sx, sy - gest.sy) < 8) return; gest.moved = true; cam.x -= (sx - gest.lx) / cam.T; cam.y -= (sy - gest.ly) / cam.T; gest.lx = sx; gest.ly = sy; return; }
    if (gest.kind === 'belt') {
      var path = gest.path, last = path[path.length - 1];
      if (t.x === last.x && t.y === last.y) return; gest.moved = true;
      if (path.length > 1 && path[path.length - 2].x === t.x && path[path.length - 2].y === t.y) { path.pop(); return; }
      while (last.x !== t.x || last.y !== t.y) { // step one tile at a time, along the longer axis first
        var dx = t.x - last.x, dy = t.y - last.y, n = Math.abs(dx) >= Math.abs(dy) ? { x: last.x + Math.sign(dx), y: last.y } : { x: last.x, y: last.y + Math.sign(dy) };
        path.push(n); last = n; if (path.length > 400) break;
      }
      return;
    }
    if (gest.kind === 'ghost') { var pt2 = placeType(), g = ghostAt(pt2, t.wx, t.wy); gest.gx = g[0]; gest.gy = g[1]; gest.sx = sx; gest.sy = sy; gest.moved = true; if (/^extractor/.test(pt2)) { var nr = minerFacing(g[0], g[1], t.wx, t.wy); if (nr !== placeRot) { placeRot = nr; buildBar(); $('#cPrevRot').style.transform = 'rotate(' + placeRot * 90 + 'deg)'; } } showCancel(true, overCancel(sx, sy)); return; }
    if (gest.kind === 'area-new') { area.x1 = t.x; area.y1 = t.y; return; }
    if (gest.kind === 'handle') { var h = gest.h; if (h.indexOf('w') >= 0) area.x0 = Math.min(t.x, area.x1); if (h.indexOf('e') >= 0) area.x1 = Math.max(t.x, area.x0); if (h.indexOf('n') >= 0) area.y0 = Math.min(t.y, area.y1); if (h.indexOf('s') >= 0) area.y1 = Math.max(t.y, area.y0); return; }
    if (gest.kind === 'tunnel' && tun && tun.tele) { teleMove(t.x, t.y); gest.sx = sx; gest.sy = sy; return; }
    if (gest.kind === 'tunnel') { // exit snaps to the nearest valid tile, in any direction; the entrance turns to face it
      var best = null; tunTargets().forEach(function (c) { var dd = Math.hypot(c.x + 0.5 - t.wx, c.y + 0.5 - t.wy); if (!best || dd < best.dd) best = { dd: dd, c: c }; });
      if (best && (best.c.d !== tun.r || best.c.k !== tun.k)) { tun.r = best.c.d; tun.k = best.c.k; if (tun.moving === 'in') { tun.x = best.c.x; tun.y = best.c.y; } }
      return;
    }
    if (gest.kind === 'paste') { var nx = gest.ox + Math.round(t.wx - gest.w0[0]), ny = gest.oy + Math.round(t.wy - gest.w0[1]); movePaste(nx - paste.x, ny - paste.y); }
  }
  function endGesture(sx, sy, cancelled) {
    var g = gest; gest = null; var firedLP = lp && lp.fired; lp = null; showCancel(false);
    if (cancelled || firedLP) return;
    if (g.kind === 'pan' && !g.moved) {
      selB = g.b && g.b.t !== 'hub' ? g.b : null;
      if (selB && selB.t === 'filter') openFilter(selB);
      updateCard(); return;
    }
    if (g.kind === 'belt') {
      if (!g.moved && g.b && g.b.t === 'filter') { openFilter(g.b); return; }
      if (!g.moved && g.b && g.b.items) return;
      var plan = beltPlan(g.path).filter(function (p) { var e = at(p.x, p.y); return !e || e.items; });
      var rm = [], add = [];
      plan.forEach(function (p) { var e = at(p.x, p.y); if (e) { if (e.t === p.t && e.r === p.r) return; rm.push(snap(e)); } add.push({ t: p.t, x: p.x, y: p.y, r: p.r }); });
      if (add.length) { run({ rm: rm, add: add, label: add.length + ' belt' + (add.length > 1 ? 's' : '') }); placeSound(); }
      return;
    }
    if (g.kind === 'ghost') {
      if (overCancel(sx, sy)) { cancelSound(); return; }
      var t = placeType();
      if (!g.moved && g.b && g.b.t === 'filter') { openFilter(g.b); return; }
      var pr0 = noRot(t) ? 0 : placeRot;
      var ar0 = autoRot(t, g.gx, g.gy); if (ar0 >= 0) pr0 = ar0;
      if (!canPlace(t, g.gx, g.gy, pr0)) { if (g.moved || !g.b) toast('block', "Can't build there"); return; }
      if (t === 'teleport_in') {
        var fd = feedDir(g.gx, g.gy), er = fd >= 0 ? fd : placeRot, sx0 = g.gx + DX[er] * 3, sy0 = g.gy + DY[er] * 3;
        tun = { t: t, x: g.gx, y: g.gy, r: er, tele: true, ex: sx0, ey: sy0, er: er };
        tool = 'tunnel'; showPillbar(); buildBar(); placeSound(); return;
      }
      if (isTunIn(t)) { // entrance dropped: suggest an exit 2 tiles ahead, as a preview to drag, then ✓ / ✕
        var fd2 = feedDir(g.gx, g.gy), want = fd2 >= 0 ? fd2 : placeRot;
        tun = { t: t, x: g.gx, y: g.gy, r: want, k: 2 }; var c0 = tunTargets(), best = null;
        c0.forEach(function (c) { var sc = (c.d === want ? 0 : 10) + Math.abs(c.k - 2); if (!best || sc < best.sc) best = { sc: sc, c: c }; });
        if (!best) { tun = null; toast('block', 'No room for the exit'); return; }
        tun.r = best.c.d; tun.k = best.c.k; tool = 'tunnel'; showPillbar(); buildBar(); placeSound(); return;
      }
      var rm2 = []; tilesOf(t, g.gx, g.gy, pr0).forEach(function (p) { var e = at(p[0], p[1]); if (e && !rm2.some(function (s) { return s.x === e.x && s.y === e.y; })) rm2.push(snap(e)); });
      run({ rm: rm2, add: [{ t: t, x: g.gx, y: g.gy, r: pr0 }], label: INFO[t] ? INFO[t][0] : t }); placeSound(); return;
    }
    if (g.kind === 'area-new' || g.kind === 'handle') { area = normArea(area); showPillbar(); return; }
    if (g.kind === 'paste' || g.kind === 'tunnel') { showPillbar(); }
  }

  // copy / paste / delete
  function areaBuildings() { var a = normArea(area), s = new Set(); for (var x = a.x0; x <= a.x1; x++) for (var y = a.y0; y <= a.y1; y++) { var e = at(x, y); if (e && e.t !== 'hub') s.add(e); } return Array.from(s); }
  function copyOk() {
    var a = normArea(area), list = areaBuildings().filter(function (b) { return b.x >= a.x0 && b.y >= a.y0 && b.x + b.rw - 1 <= a.x1 && b.y + b.rh - 1 <= a.y1; });
    if (topoDirty) rebuildTopo();
    list = list.filter(function (b) { if (/^(?:tunnel2?|teleport)_in$/.test(b.t)) return b.pair && list.indexOf(b.pair) >= 0; if (/^(?:tunnel2?|teleport)_out$/.test(b.t)) return list.some(function (q) { return q.pair === b; }); return true; });
    if (!list.length) { toast('block', 'Nothing to copy there'); return; }
    paste = { items: list.map(function (b) { return { t: b.t, x: b.x + 2, y: b.y + 2, r: b.r, rule: b.rule, fs: b.fs, link: b.t === 'teleport_in' && b.pair ? list.indexOf(b.pair) : -1 }; }), x: a.x0 + 2, y: a.y0 + 2, w: a.x1 - a.x0 + 1, h: a.y1 - a.y0 + 1 };
    paste.src = list.map(snap);
    area = null; tool = 'paste'; showPillbar(); buildBar();
  }
  function movePaste(dx, dy) { if (!dx && !dy) return; paste.x += dx; paste.y += dy; paste.items.forEach(function (it) { it.x += dx; it.y += dy; }); }
  function rotatePaste() { // a quarter turn clockwise on the grid, about the box centre
    var p = paste, cx = p.x + p.w / 2, cy = p.y + p.h / 2, nw = p.h, nh = p.w, nx = Math.round(cx - nw / 2), ny = Math.round(cy - nh / 2);
    p.items = p.items.map(function (it) {
      var ts = tilesOf(it.t, it.x, it.y, it.r).map(function (q) { return [nx + (p.h - 1 - (q[1] - p.y)), ny + (q[0] - p.x)]; });
      var t = it.t, r = t === 'bin' ? 0 : (it.r + 1) & 3;
      return { t: t, r: r, x: Math.min.apply(null, ts.map(function (q) { return q[0]; })), y: Math.min.apply(null, ts.map(function (q) { return q[1]; })), rule: it.rule, fs: it.fs, link: it.link };
    });
    p.x = nx; p.y = ny; p.w = nw; p.h = nh;
  }
  function pasteList() { return paste.items.map(function (i) { var L = i.link >= 0 ? paste.items[i.link] : null; return { t: i.t, x: i.x, y: i.y, r: i.r, rule: L ? L.x + ',' + L.y : i.rule, fs: i.fs }; }); }
  function pasteOk() {
    var c = withReplaced(pasteList()); c.label = 'paste'; run(c); placeSound();
    toast('content_paste', 'Pasted ' + c.add.length + (c.rm.length ? ' · replaced ' + c.rm.length : ''));
    movePaste(2, 2); // the next copy waits two tiles on, as the first one did
  }
  function moveOk() {
    var c = withReplaced(pasteList()), seen = {};
    c.rm.concat(paste.src).forEach(function (s) { seen[s.t + '@' + s.x + ',' + s.y] = s; });
    c.rm = Object.keys(seen).map(function (k) { return seen[k]; }); c.label = 'move';
    run(c); placeSound(); toast('open_with', 'Moved ' + c.add.length);
  }
  function deleteOk() { var l = areaBuildings(); run({ rm: l.map(snap), add: [], label: 'remove ' + l.length }); popSound(); toast('delete', 'Removed ' + l.length); area = null; hidePillbar(); }
  var pillMode = null;
  function showPillbar() {
    var pb = $('#pillbar'), h = '';
    var PBS = { x: 'cancel', tunx: 'cancel', copyok: 'confirm', delok: 'none', pasteok: 'none', moveok: 'none', tunok: 'none' };
    var B = function (id, ic, cls) { return '<button class="pb ' + (cls || '') + '" data-pb="' + id + '" data-sfx="' + (PBS[id] || 'tap') + '"><span class="mi">' + ic + '</span></button>'; };
    if (tool === 'copy' && area) { pillMode = 'area'; h = B('x', 'close') + B('copyok', 'check', 'ok'); }
    else if (tool === 'delete' && area) { pillMode = 'area'; h = B('x', 'close') + B('delok', 'delete', 'del'); }
    else if (tool === 'paste') { pillMode = 'paste'; h = B('x', 'close') + B('rot', 'rotate_right') + B('moveok', 'open_with', 'ok') + B('pasteok', 'library_add', 'ok'); }
    else if (tool === 'tunnel' && tun) { pillMode = 'tunnel'; h = B('tunx', 'close') + (tun.tele ? B('telerot', 'rotate_right') : '') + B('tunok', 'check', 'ok'); }
    else { hidePillbar(); return; }
    pb.innerHTML = h; pb.classList.remove('hidden');
  }
  function hidePillbar() { $('#pillbar').classList.add('hidden'); pillMode = null; }
  function placePillbar() {
    if (!pillMode) return; var pb = $('#pillbar'), r;
    if (pillMode === 'tunnel' && tun) { var te = tunExit(), mx = Math.max(tun.x, te[0]), my = Math.max(tun.y, te[1]); r = [mx + 1, my + 1]; }
    else if (pillMode === 'area' && area) { var a = normArea(area); r = [a.x1 + 1, a.y1 + 1]; } else if (pillMode === 'paste' && paste) r = [paste.x + paste.w, paste.y + paste.h]; else return;
    var s = w2s(r[0], r[1]), w = pb.offsetWidth || 120;
    pb.style.left = Math.max(8, Math.min(VW - w - 8, s[0] - w)) + 'px'; pb.style.top = Math.max(76, Math.min(VH - 190, s[1] + 12)) + 'px';
  }
  $('#pillbar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pb]'); if (!b) return; var id = b.dataset.pb;
    if (id === 'x') { area = null; paste = null; if (tool === 'paste') tool = 'copy'; hidePillbar(); buildBar(); }
    if (id === 'tunx') { var wasEdit = tun && tun.edit; tun = null; editIgnore = null; tool = wasEdit ? 'cursor' : 'build'; hidePillbar(); buildBar(); updateCard(); }
    if (id === 'telerot' && tun && tun.tele) { if (tun.moving === 'in') tun.r = (tun.r + 1) & 3; else tun.er = (tun.er + 1) & 3; tickSound(); }
    if (id === 'tunok' && tun) {
      if (tun.tele && !teleOk()) { toast('block', "Can't put the exit there"); return; }
      var te2 = tunExit(), ot = tun.t.replace('_in', '_out'), ex = te2[0], ey = te2[1], rm = [];
      (tun.edit || []).forEach(function (s0) { rm.push(s0); });
      [[tun.x, tun.y], [ex, ey]].forEach(function (p) { var e = at(p[0], p[1]); if (e && !rm.some(function (q) { return q.x === e.x && q.y === e.y && q.t === e.t; })) rm.push(snap(e)); });
      run({ rm: rm, add: [{ t: tun.t, x: tun.x, y: tun.y, r: tun.r, rule: tun.tele ? ex + ',' + ey : undefined }, { t: ot, x: ex, y: ey, r: te2[2] }], label: tun.tele ? 'teleporter' : 'tunnel' }); placeSound();
      var wasEdit2 = !!tun.edit; if (!wasEdit2) placeRot = tun.r; tun = null; editIgnore = null; tool = wasEdit2 ? 'cursor' : 'build'; hidePillbar(); buildBar(); updateCard();
    }
    if (id === 'copyok') copyOk();
    if (id === 'delok') deleteOk();
    if (id === 'rot') rotatePaste();
    if (id === 'pasteok') pasteOk(); // stay in paste mode: copy again, or ✕ when done (earlier copies stay)
    if (id === 'moveok') { moveOk(); paste = null; tool = 'cursor'; hidePillbar(); buildBar(); updateCard(); }
  });
  addEventListener('keydown', function (e) { // desktop debugging only; nothing in the UI mentions keys
    if (!inGame || modalOpen) return;
    if (e.key === 'r' || e.key === 'R') rotateTap();
    if ((e.key === 'o' || e.key === 'O') && !doneOpen) { G.got = need() - 1; deliver(order()); } // debug: finish the current order
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.key === 'Escape') { area = null; paste = null; hidePillbar(); setTool('cursor'); }
  });

  /* ================= tutorial =================
     Level 1 coaches the first factory, one step at a time. Replay it from Pause ("How to play"). */
  var tut = { on: false, step: 0, seen: false };
  var TUT = [
    { slot: 'extractor', text: 'Select the <b>Miner</b>.', icon: 'extractor', done: function () { return tool === 'build' && selFam === 'extractor'; } },
    { target: 'patch', text: 'Press on the grey <b>circle patch</b> to build it there.', icon: 'extractor', done: function () { return blds.some(function (b) { return /^extractor/.test(b.t); }); } },
    { slot: 'belt', text: 'Now select the <b>Belt</b>.', icon: 'belt', done: function () { return tool === 'build' && selFam === 'belt'; } },
    { target: 'hub', text: 'Draw a belt with your finger from the Miner to the <b>Hub</b>.', icon: 'belt', done: function () { return G.got > 0; } },
    { text: 'Shapes are arriving! Fill the order at the top to finish the level.', icon: 'hub', done: function () { return G.got >= 3; } },
    { text: 'Too slow? Build <b>another Miner and belt</b> to the Hub to speed it up.', icon: 'extractor', done: function () { return G.level > 1 || blds.filter(function (b) { return /^extractor/.test(b.t); }).length >= 2; }, last: true }
  ];
  function tutStart() { tut.on = true; tut.step = 0; renderTut(); }
  function tutTick() {
    if (!tut.on) return; var s = TUT[tut.step];
    if (s.done()) { tut.step++; if (tut.step >= TUT.length) { tut.on = false; $('#coach').classList.add('hidden'); clearSlotPulse(); return; } renderTut(); }
  }
  function clearSlotPulse() { document.querySelectorAll('.slot.pulse').forEach(function (e) { e.classList.remove('pulse'); }); }
  function renderTut() {
    var s = TUT[tut.step], c = $('#coach'); c.classList.remove('hidden');
    $('#coachIc').setAttribute('type', s.icon); $('#coachTx').innerHTML = s.text;
    $('#coachDots').innerHTML = TUT.map(function (_, i) { return '<i class="' + (i === tut.step ? 'on' : '') + '"></i>'; }).join('');
    clearSlotPulse(); if (s.slot) { var el = document.querySelector('[data-fam="' + s.slot + '"]'); if (el) el.classList.add('pulse'); }
  }
  function tutTarget(now) {
    if (!tut.on) return; var s = TUT[tut.step], wx, wy;
    if (s.target === 'patch') { wx = -8.5; wy = 0; } else if (s.target === 'hub') { wx = 0; wy = 0; } else return;
    var p = w2s(wx, wy), r = cam.T * (s.target === 'hub' ? 2.6 : 2.2) * (1 + 0.06 * Math.sin(now / 260));
    ctx.save(); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.strokeStyle = PUR; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -now / 40; ctx.stroke(); ctx.restore();
  }

  /* ================= HUD ================= */
  var pillDirty = true, toastT = 0;
  function toast(ic, tx) { if (ic === 'block') cancelSound(); $('#toastIc').textContent = ic; $('#toastTx').textContent = tx; var t = $('#toast'); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2200); }
  function updatePill() {
    pillDirty = false; var n = need();
    $('#pillShape').setAttribute('code', order());
    $('#pillLvl').textContent = G.level > 20 ? 'FREEPLAY ' + lvlNum() : 'LEVEL ' + G.level;
    $('#pillCnt').textContent = G.got + ' / ' + n;
    $('#ring').setAttribute('stroke-dasharray', (113.1 * Math.min(1, G.got / n)).toFixed(1) + ' 113.1');
    $('#ring').setAttribute('stroke-opacity', G.got ? 1 : 0);
  }
  function setTool(t) { tun = null; editIgnore = null; tool = t; setTimeout(syncRot, 0); if (t !== 'copy' && t !== 'delete') area = null; if (t !== 'paste') paste = null; hidePillbar(); buildBar(); updateCard(); }
  function rotateTap() { if (tool !== 'build' || noRot(placeType())) return; placeRot = (placeRot + 1) & 3; tickSound(); buildBar(); updateCard(); syncRot(); }
  function buildBar() { setTimeout(syncRot, 0);
    var tools = [['cursor', 'arrow_selector_tool'], ['copy', 'content_copy'], ['delete', 'delete']].filter(function (x) { return x[0] !== 'copy' || G.level > COPY_AT; });
    $('#tools').innerHTML = tools.map(function (x) {
      var id = x[0], act = (id === 'cursor' && tool === 'cursor') || (id === 'copy' && (tool === 'copy' || tool === 'paste')) || (id === 'delete' && tool === 'delete');
      var dim = id === 'rotate' && !(tool === 'build' && !noRot(placeType()));
      var tab = id === 'rotate' ? '<span class="rtab" style="transform:rotate(' + (placeRot * 90) + 'deg)"><span><i></i></span></span>' : '';
      return '<button class="slot ' + (act ? 'sel' : '') + (dim ? ' dim' : '') + '" data-tool="' + id + '"><span class="mi">' + x[1] + '</span>' + tab + '</button>';
    }).join('');
    var html = [];
    FAM.forEach(function (grp) {
      var items = grp.filter(function (f) { return unlocked(f[1][0]); }); if (!items.length) return;
      if (html.length) html.push('<div class="vdiv" style="background:#E6DDC8"></div>');
      html.push('<div class="grp">' + items.map(function (f) {
        var id = f[0], vars = f[1].filter(unlocked), shown = f[1][famVar[id] || 0]; if (id === 'extractor' && unlocked('extractor2')) shown = 'extractor2';
        return '<button class="slot ' + ((tool === 'build' || tool === 'tunnel') && selFam === id ? 'sel' : '') + '" data-fam="' + id + '"><building-icon type="' + shown + '" size="44"></building-icon>' + (vars.length > 1 ? '<span class="badge">' + vars.length + '</span>' : '') + '</button>';
      }).join('') + '</div>');
    });
    $('#bboxes').innerHTML = html.join('');
  }
  $('#bottom').addEventListener('click', function (e) {
    var t = e.target.closest('[data-tool]'), f = e.target.closest('[data-fam]'); ensureAudio();
    if (t) { var id = t.dataset.tool; tickSound();
      if (id === 'rotate') rotateTap(); else if (id === 'cursor') setTool('cursor'); else setTool(id); }
    if (f) { selFam = f.dataset.fam; tickSound(); setTool('build'); }
  });
  function updateCard() { setTimeout(syncRot, 0);
    var c = $('#card'), t = null;
    if (tool === 'build' || tool === 'tunnel') t = placeType(); else if (tool === 'cursor' && selB) t = selB.t;
    if (t && /_out$/.test(t)) t = t.replace('_out', '_in');
    var demo = $('#cDemo');
    if (!t || !INFO[t]) { c.classList.add('hidden'); demo.removeAttribute('animate'); return; }
    c.classList.remove('hidden');
    var inf = INFO[t]; $('#cName').textContent = inf[0]; $('#cIcon').textContent = inf[3]; $('#cTag').textContent = inf[1]; $('#cTag').style.color = inf[2] || PUR; if (t === 'mixer_w') {
      var dw = function (c) { return '<i style="display:inline-block;width:18px;height:18px;border-radius:9px;border:2px solid #23213A;background:' + K.COL[c] + '"></i>'; };
      $('#cDesc').innerHTML = '<span style="display:flex;align-items:center;gap:4px;font-size:14px;font-weight:800;line-height:1">' + dw('r') + '+' + dw('g') + '+' + dw('b') + '=' + dw('w') + '</span>';
      $('#cDesc').style.cssText = 'display:flex;flex-direction:column;gap:4px';
    } else if (t === 'mixer') { // colour recipes instead of words
      var dot = function (c) { return '<i style="display:inline-block;width:16px;height:16px;border-radius:8px;border:2px solid #23213A;background:' + K.COL[c] + '"></i>'; };
      var row = function (h) { return '<span style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:800;line-height:1">' + h + '</span>'; };
      $('#cDesc').innerHTML = [['r', 'g', 'y'], ['r', 'b', 'p'], ['g', 'b', 'c']].map(function (m) { return row(dot(m[0]) + '+' + dot(m[1]) + '=' + dot(m[2])); }).join('') + row('(' + dot('r') + '+' + dot('g') + ')+' + dot('b') + '=' + dot('w'));
      $('#cDesc').style.cssText = 'display:flex;flex-direction:column;gap:4px';
    } else { $('#cDesc').textContent = inf[4]; $('#cDesc').style.cssText = ''; }
    $('#cSpeed').textContent = fmt(rate(t));
    if (demo.getAttribute('type') !== t) demo.setAttribute('type', t);
    demo.setAttribute('tile', BLD[t] && BLD[t].w >= 4 ? 26 : 52); if (fast) demo.removeAttribute('animate'); else demo.setAttribute('animate', '');
    $('#cPrevRot').style.transform = tool === 'build' && !noRot(t) ? 'rotate(' + placeRot * 90 + 'deg)' : 'none';
    var fam = tool === 'build' ? selFam : null, vars = fam ? famVars(fam) : [];
    $('#cVars').classList.toggle('hidden', vars.length < 2);
    $('#cVars').innerHTML = vars.map(function (v, i) { var ok = unlocked(v), s = ok && (famVar[fam] || 0) === i;
      return '<button class="vb ' + (s ? 'sel' : '') + (ok ? '' : ' lock') + '" data-var="' + i + '"><building-icon type="' + v + '" size="34"></building-icon>' + (ok ? '' : '<span class="mi lk">lock</span>') + '</button>'; }).join('');
  }
  $('#cVars').addEventListener('click', function (e) { var b = e.target.closest('[data-var]'); if (!b || b.classList.contains('lock')) return; famVar[selFam] = +b.dataset.var; tickSound(); buildBar(); updateCard(); });
  $('#rotFab').addEventListener('click', function () { if (tool === 'cursor' && canTurn(selB)) turnSelected(); else rotateTap(); });
  // Cursor: turn a placed building a quarter clockwise where it stands. If its new footprint would hit anything, it doesn't turn:
  // the button flashes red and shakes, and the clash shows on the map for a moment.
  function canTurn(b) { return !!b && b.t !== 'hub' && !noRot(b.t) && !/^(?:tunnel|teleport)/.test(b.t); }
  var clash = null;
  function turnSelected() {
    var b = selB, nr = (b.r + 1) & 3, bad = [];
    tilesOf(b.t, b.x, b.y, nr).forEach(function (p) { var e = at(p[0], p[1]); if ((e && e !== b) || (/^extractor/.test(b.t) && !patches.get(tk(p[0], p[1])))) bad.push(p); });
    if (bad.length) {
      var f = $('#rotFab'); f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); setTimeout(function () { f.classList.remove('bad'); }, 420);
      clash = { tiles: bad, until: performance.now() + 450 }; cancelSound(); return;
    }
    var s0 = snap(b), s1 = { t: b.t, x: b.x, y: b.y, r: nr, rule: b.rule };
    run({ rm: [s0], add: [s1], label: 'turn' }); placeSound();
    selB = at(b.x, b.y); updateCard();
  }
  $('#editFab').addEventListener('click', function () { startEdit(); });
  $('#undoBtn').addEventListener('click', function () { ensureAudio(); undo(); });
  $('#redoBtn').addEventListener('click', function () { ensureAudio(); redo(); });
  $('#upBtn').addEventListener('click', function () { openModal('mUp'); renderUp(); });
  $('#pauseBtn').addEventListener('click', function () { openModal('mPause'); $('#pauseBtns').classList.remove('hidden'); paused = true; });
  // Tap the order pill: glide back to the Hub at the standard zoom.
  var camAnim = null;
  $('#pill').addEventListener('click', function () {
    camAnim = { t0: performance.now(), d: 450, x0: cam.x, y0: cam.y, T0: cam.T, x1: 0, y1: 0, T1: 46 };
  });
  function stepCam(now) {
    if (!camAnim) return; var a = camAnim, k = Math.min(1, (now - a.t0) / a.d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    cam.x = a.x0 + (a.x1 - a.x0) * e; cam.y = a.y0 + (a.y1 - a.y0) * e; cam.T = a.T0 + (a.T1 - a.T0) * e;
    if (k >= 1) { camAnim = null; zoomSettle = now; saveSoon(); }
  }

  /* ================= modals ================= */
  var modalOpen = null, paused = false;
  function openModal(id) {
    $('#modals').classList.remove('hidden'); ['mUp', 'mPause', 'mFilter', 'mDone', 'mFp', 'mReset'].forEach(function (m) { $('#' + m).classList.toggle('hidden', m !== id); });
    modalOpen = id; syncRot(); $('#fQp').toggleAttribute('animate', id === 'mFilter'); ($('#dDemo') || document.createElement('i')).toggleAttribute('animate', id === 'mDone');
  }
  function closeModal() {
    if (modalOpen === 'mFilter') applyFilter();
    if (modalOpen === 'mDone') return doneNext();
    $('#modals').classList.add('hidden'); modalOpen = null; paused = false; syncRot(); $('#fQp').removeAttribute('animate'); ($('#dDemo') || document.createElement('i')).removeAttribute('animate');
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
  $('#scrim').addEventListener('click', closeModal);
  function renderUp() {
    var g = gainAt(G.level), gm = {}; g.forEach(function (x) { gm[x[0]] = x[1]; });
    $('#upRows').innerHTML = AREAS.map(function (k) {
      var v = G.sp[k], locked = k === 'painting' && G.level < 4, nx = !locked && gm[k];
      return '<div class="uprow"><div class="upic"><building-icon type="' + AREA_INFO[k][2] + '" size="44"></building-icon></div>' +
        '<div style="display:flex;flex-direction:column;gap:3px"><span style="font-size:22px;font-weight:700;line-height:1">' + AREA_INFO[k][0] + '</span><span style="font-size:14px;color:#6B6780;line-height:1.15">' + AREA_INFO[k][1] + '</span></div>' +
        (locked ? '<span style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;color:#6B6780"><span class="mi" style="font-size:18px">lock</span>Comes with the Painter</span>'
          : '<div style="position:relative"><div class="upbar"><i style="width:' + (v / 12 * 100) + '%"></i><b style="left:' + (v / 12 * 100) + '%;width:' + (nx ? nx / 12 * 100 : 0) + '%"></b></div>' + (nx ? '<span class="upnext">+' + fmt(nx) + ' next</span>' : '') + '</div>') +
        '<div style="display:flex;align-items:baseline;justify-content:flex-end;gap:4px;white-space:nowrap"><span style="font-size:26px;font-weight:800;line-height:1">' + (locked ? '–' : fmt(v)) + '</span><span style="font-size:13px;font-weight:600;color:#6B6780">items/s</span></div></div>';
    }).join('');
    var un = Object.keys(UNLOCK).filter(function (t) { return UNLOCK[t] === G.level && INFO[t]; });
    $('#upNext').innerHTML = G.level > 20 ? '<shape-glyph code="' + order() + '" size="44"></shape-glyph><span style="font-size:18px;font-weight:700">Each freeplay order adds +0.1 items/s to one area (up to 12)</span>'
      : '<shape-glyph code="' + order() + '" size="44"></shape-glyph><span style="font-size:18px;font-weight:700;line-height:1.1">Finish level ' + G.level + ' to get</span><div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">' +
        g.map(function (x) { return '<span class="chip"><building-icon type="' + AREA_INFO[x[0]][2] + '" size="28"></building-icon>' + AREA_INFO[x[0]][0] + ' +' + fmt(x[1]) + '</span>'; }).join('') +
        un.map(function (t) { return '<span class="chip"><building-icon type="' + t + '" size="28"></building-icon>' + INFO[t][0] + (INFO[t][1] ? ' ' + INFO[t][1] : '') + '</span>'; }).join('') + '</div>';
    $('#fpReplay').classList.toggle('hidden', G.level <= 20);
  }
  $('#fpReplay').addEventListener('click', function () { openFp(); });

  // level done
  var doneLevel = 0;
  function openDone(lvl) {
    doneOpen = true; doneLevel = lvl;
    var types = Object.keys(UNLOCK).filter(function (t) { return UNLOCK[t] === lvl && INFO[t] && !/^(belt_|balancer_r|split_r|rotator_)/.test(t); });
    $('#dOrder').setAttribute('code', LV[lvl - 1][0]); $('#dTitle').textContent = 'Level ' + lvl + ' done!';
    // every new building gets its own working demo, name and line
    if (lvl === COPY_AT) types.push('copy');
    $('#dNew').classList.toggle('hidden', !types.length);
    var one = types.length === 1;
    $('#dNew').style.cssText = 'width:100%;display:grid;gap:14px;grid-template-columns:' + (one ? '1fr' : 'repeat(' + types.length + ',minmax(0,1fr))');
    $('#dNew').innerHTML = types.map(function (t) {
      var inf = INFO[t], tag = inf[1] ? '<span style="color:' + (inf[2] || PUR) + '">' + inf[1] + '</span>' : '';
      var demo = '<div style="border-radius:14px;overflow:hidden;line-height:0;border:3px solid #23213A;flex-shrink:0"><' + (t === 'copy' ? 'copy-demo' : 'building-demo') + ' type="' + t + '" tile="' + (one ? 44 : 38) + '" width="' + (one ? 264 : 250) + '" height="' + (one ? 220 : 170) + '" animate=""></' + (t === 'copy' ? 'copy-demo' : 'building-demo') + '></div>';
      var text = '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start"><span style="font-size:14px;font-weight:800;letter-spacing:.08em;line-height:1;color:#fff;background:#6C5CE7;border-radius:8px;padding:6px 10px">NEW</span>' +
        '<span style="display:flex;align-items:center;gap:8px;font-size:' + (one ? 34 : 28) + 'px;font-weight:800;line-height:1;white-space:nowrap">' + (t === 'copy' ? '<span class="mi" style="font-size:' + (one ? 40 : 32) + 'px;color:#6C5CE7">content_copy</span>' : '<building-icon type="' + t + '" size="' + (one ? 44 : 36) + '"></building-icon>') + inf[0] + tag + '</span>' +
        '<span style="font-size:' + (one ? 18 : 16) + 'px;line-height:1.3;color:#3A3654">' + inf[4] + '</span></div>';
      return '<div style="background:#F4EFE3;border-radius:22px;padding:14px;display:' + (one ? 'grid;grid-template-columns:auto minmax(0,1fr);gap:20px;align-items:center' : 'flex;flex-direction:column;gap:12px;align-items:center') + '">' + demo + text + '</div>';
    }).join('');
    var ex = [];
    if (lvl === 4) ex.push(['palette', 'Colour patches']);
    $('#dExtras').innerHTML = ex.map(function (x) { return '<span class="chip" style="font-size:16px;padding:5px 10px 5px 6px"><span class="mi" style="font-size:20px;color:#6C5CE7">' + x[0] + '</span>' + x[1] + '</span>'; }).join('');
    $('#dNextG').setAttribute('code', order());
    openModal('mDone'); $('#mDone').style.width = types.length > 1 ? (types.length * 290 + 60) + 'px' : '780px';
  }
  function doneNext() { doneOpen = false; $('#dNew').innerHTML = ''; $('#modals').classList.add('hidden'); modalOpen = null; ($('#dDemo') || document.createElement('i')).removeAttribute('animate'); updateCard(); if (doneLevel === 20) openFp(); if (doneLevel === 1) openStory(RECAP); }
  $('#dNext').addEventListener('click', doneNext);

  // freeplay intro
  var fpStep = 0;
  var FP = [
    ['<shape-glyph code="SpCySpCy" size="70"></shape-glyph><shape-glyph code="CwRwSwWw" size="70"></shape-glyph><shape-glyph code="RySc--Wp" size="70"></shape-glyph><span class="mi" style="font-size:48px;color:#6C5CE7">help</span>', 'Freeplay! Any shape, any time', 'The Hub now asks for random shapes. Build one big machine that can make every one of them.'],
    ['<shape-glyph code="CuCuCuCu" size="60"></shape-glyph><span class="mi arrow">arrow_forward</span><building-icon type="quad" size="64"></building-icon><span class="mi arrow">arrow_forward</span><div style="display:grid;grid-template-columns:repeat(2,44px);gap:4px"><shape-glyph code="------Cr" size="44"></shape-glyph><shape-glyph code="Sg------" size="44"></shape-glyph><shape-glyph code="----Wb--" size="44"></shape-glyph><shape-glyph code="--Ry----" size="44"></shape-glyph></div><span class="mi arrow">arrow_forward</span><building-icon type="filter" size="64"></building-icon>', 'Filters pick the pieces', 'Cut shapes into quarters and paint them. Then set Filters to a quarter, a colour, or both, so each belt carries only the pieces you need.'],
    ['<div style="display:flex;flex-direction:column;gap:6px"><building-icon type="filter" size="44"></building-icon><building-icon type="filter" size="44"></building-icon><building-icon type="filter" size="44"></building-icon></div><span class="mi arrow">arrow_forward</span><building-icon type="quad_combiner" size="70"></building-icon><span class="mi arrow">arrow_forward</span><shape-glyph code="CrSgWbRy" size="90"></shape-glyph>', 'Join them into anything', 'Feed the Filters into a Joiner ×4. When a new order comes, change the Filters and the same machine makes the new shape.']
  ];
  var STORY = FP, storyDone = null;
  var AR = '<span class="mi arrow">arrow_forward</span>';
  var HUB = function (code, px) { return '<span style="width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.round(px * 0.22) + 'px;background:#B9B2FF;border:3px solid #23213A;box-shadow:0 4px 0 #23213A;display:grid;place-items:center"><span style="width:' + Math.round(px * 0.7) + 'px;height:' + Math.round(px * 0.7) + 'px;border-radius:50%;background:#fff;border:3px solid #23213A;display:grid;place-items:center"><shape-glyph code="' + code + '" size="' + Math.round(px * 0.5) + '"></shape-glyph></span></span>'; };
  var INTRO = [
    ['<building-icon type="extractor" size="64"></building-icon>' + AR + '<building-icon type="belt" size="64"></building-icon>' + AR + HUB('CuCuCuCu', 84), 'Feed the Hub!', 'Dig up shapes, send them along belts, and give the Hub the shape it asks for.']
  ];
  var RECAP = [
    ['<building-icon type="extractor" size="56"></building-icon>' + AR + '<building-icon type="belt" size="56"></building-icon>' + AR + HUB('CuCuCuCu', 76) + '<span class="mi" style="font-size:48px;color:#47C46C">check_circle</span>', "That's a factory!", 'Every level the Hub asks for a new shape. Fill the order to finish the level.'],
    ['<building-icon type="cutter" size="56"></building-icon><building-icon type="rotator" size="56"></building-icon><building-icon type="painter" size="56"></building-icon><building-icon type="combiner" size="56"></building-icon>' + AR + '<shape-glyph code="SrSrCbCb" size="76"></shape-glyph>', 'New level? New machines!', 'Cutters, rotators, painters and more unlock as you go, and your factory gets faster.']
  ];
  function openStory(pages, onDone) { STORY = pages; storyDone = onDone || null; fpStep = 0; renderFp(); openModal('mFp'); }
  function openFp() { openStory(FP); }
  function renderFp() {
    var s = STORY[fpStep], last = fpStep >= STORY.length - 1;
    $('#fpBody').innerHTML = '<div class="fpvis">' + s[0] + '</div><span style="font-size:34px;font-weight:800;line-height:1.05;text-align:center;white-space:nowrap">' + s[1] + '</span><span style="font-size:18px;line-height:1.35;color:#3A3654;text-align:center;max-width:560px">' + s[2] + '</span>';
    $('#fpDots').innerHTML = STORY.map(function (_, i) { return '<i class="' + (i === fpStep ? 'on' : '') + '"></i>'; }).join('');
    $('#fpDots').style.visibility = STORY.length > 1 ? 'visible' : 'hidden';
    $('#fpBack').style.opacity = fpStep ? 1 : 0.3; $('#fpNextT').textContent = last ? "Let's go" : 'Next'; $('#fpNextI').textContent = last ? 'check' : 'arrow_forward';
  }
  $('#fpBack').addEventListener('click', function () { if (fpStep) { fpStep--; renderFp(); } });
  $('#fpNext').addEventListener('click', function () { if (fpStep < STORY.length - 1) { fpStep++; renderFp(); } else { var cb = storyDone; storyDone = null; closeModal(); if (cb) cb(); } });

  // filter picker
  var fb = null, fs = null;
  function openFilter(b) {
    fb = b; var oq = qs(order().length === 8 ? order() : 'CuCuCuCu');
    fs = b.fs || { mode: 'order', sel: [true, true, true, true], match: 'both', own: oq.slice(), q: 0 };
    renderFilter(); openModal('mFilter');
  }
  function ruleFor(f) { var keep = fs; fs = f; var r = filterRule(); fs = keep; return r; }
  function refreshFilters() {
    blds.forEach(function (b) {
      if (b.t !== 'filter' || !b.fs || b.fs.mode !== 'order') return;
      var nr = ruleFor(b.fs); if (nr === b.rule) return; b.rule = nr;
      var c = chunkRange(b); for (var x = c[0]; x <= c[2]; x++) for (var y = c[1]; y <= c[3]; y++) { var ch = chunks.get(ck(x, y)); if (ch) ch.dirty = true; }
    });
  }
  function filterRule() {
    var oq = qs(order());
    if (fs.mode === 'own') return fs.own.join('');
    var picked = oq.map(function (q, i) { return fs.sel[i] ? q : '**'; });
    if (fs.match === 'colour') { var tl = [3, 0, 1, 2], pick = null; tl.forEach(function (i) { if (!pick && fs.sel[i] && oq[i] !== '--') pick = oq[i]; }); return pick ? pick[1] : (tl.some(function (i) { return fs.sel[i]; }) ? '0' : (oq.find(function (q) { return q !== '--'; }) || 'Cu')[1]); }
    return picked.map(function (q) { return q === '**' || q === '--' ? q : fs.match === 'shape' ? q[0] + '*' : q; }).join('');
  }
  function renderFilter() {
    var oq = qs(order());
    $('#tabOrderG').setAttribute('code', order()); $('#tabOrderT').textContent = 'Level ' + lvlNum() + ' shape';
    $('#tabOrder').classList.toggle('sel', fs.mode === 'order'); $('#tabOwn').classList.toggle('sel', fs.mode === 'own');
    var qp = $('#fQp');
    if (fs.mode === 'order') { qp.setAttribute('code', order()); qp.setAttribute('sel', fs.sel.map(function (v) { return v ? '1' : '0'; }).join('')); }
    else { qp.setAttribute('code', fs.own.join('')); qp.setAttribute('sel', [0, 1, 2, 3].map(function (i) { return i === fs.q ? '1' : '0'; }).join('')); }
    var mid = $('#fMid');
    if (fs.mode === 'order') {
      var save = fs.match, opts = [['both', 'MATCH', 'MATCH'], ['shape', 'MATCH', 'ANY'], ['colour', 'ANY', 'MATCH']];
      mid.innerHTML = opts.map(function (o) { fs.match = o[0]; var code = filterRule(); return '<button class="opt ' + (save === o[0] ? 'sel' : '') + '" data-m="' + o[0] + '"><shape-glyph code="' + code + '" size="58" empties=""></shape-glyph><span><span>Shape: <b>' + o[1] + '</b></span><span>Colour: <b>' + o[2] + '</b></span></span></button>'; }).join('');
      fs.match = save;
    } else {
      var cur = fs.own[fs.q];
      mid.innerHTML = '<div style="display:flex;flex-direction:column;gap:18px;align-items:center"><div style="display:grid;grid-template-columns:repeat(5,52px);gap:6px">' +
        ['-', 'C', 'R', 'S', 'W'].map(function (p) { var on = p === '-' ? cur === '--' : cur !== '--' && cur[0] === p; return '<button class="pk ' + (on ? 'sel' : '') + '" data-p="' + p + '">' + (p === '-' ? '<span style="position:absolute;inset:11px;border:2px dashed #9C97AE;border-radius:6px"></span>' : '<shape-glyph code="' + (p + 'u').repeat(4) + '" size="38"></shape-glyph>') + '</button>'; }).join('') +
        '</div><div style="width:80%;height:3px;background:#E6DDC8;border-radius:2px"></div><div style="display:grid;grid-template-columns:repeat(4,50px);gap:10px;opacity:' + (cur === '--' ? 0.35 : 1) + '">' +
        ['u', 'r', 'g', 'b', 'y', 'p', 'c', 'w'].map(function (c) { return '<button class="sw ' + (cur !== '--' && cur[1] === c ? 'sel' : '') + '" data-c="' + c + '" style="background:' + K.COL[c] + '"></button>'; }).join('') + '</div></div>';
    }
    $('#fOut').setAttribute('code', filterRule());
  }
  $('#tabOrder').addEventListener('click', function () { fs.mode = 'order'; renderFilter(); });
  $('#tabOwn').addEventListener('click', function () { fs.mode = 'own'; renderFilter(); });
  $('#fPick').addEventListener('click', function (e) {
    var r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, i = x >= 0 ? (y < 0 ? 0 : 1) : (y >= 0 ? 2 : 3);
    if (fs.mode === 'order') fs.sel[i] = !fs.sel[i]; else fs.q = i; tickSound(); renderFilter();
  });
  $('#fMid').addEventListener('click', function (e) {
    var m = e.target.closest('[data-m]'), p = e.target.closest('[data-p]'), c = e.target.closest('[data-c]'), cur = fs.own[fs.q];
    if (m) fs.match = m.dataset.m;
    if (p) fs.own[fs.q] = p.dataset.p === '-' ? '--' : p.dataset.p + (cur === '--' ? 'u' : cur[1]);
    if (c && cur !== '--') fs.own[fs.q] = cur[0] + c.dataset.c;
    tickSound(); renderFilter();
  });
  function applyFilter() {
    if (!fb) return; var rule = filterRule(); fb.fs = fs; if (fb.rule !== rule) { fb.rule = rule; var c = chunkRange(fb); for (var x = c[0]; x <= c[2]; x++) for (var y = c[1]; y <= c[3]; y++) { var ch = chunks.get(ck(x, y)); if (ch) ch.dirty = true; } }
    fb = null; saveSoon();
  }

  // Animated picture for the Copy and paste unlock: box a little line, a see-through copy slides out, then it's built.
  customElements.define('copy-demo', class extends HTMLElement {
    connectedCallback() {
      var W = +this.getAttribute('width') || 264, H = +this.getAttribute('height') || 220, c = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1);
      c.width = W * d; c.height = H * d; c.style.width = W + 'px'; c.style.height = H + 'px'; c.style.display = 'block'; this.appendChild(c);
      var x = c.getContext('2d'), T = Math.floor(Math.min(W / 5.4, H / 4.6)), ox = Math.round((W - 4 * T) / 2), oy = Math.round((H - 4 * T) / 2), self = this, t0 = performance.now();
      var LINE = [['extractor', 0, 0, 1, 'CuCuCuCu'], ['belt', 1, 0, 1], ['cutter', 2, 0, 1], ['belt', 3, 0, 1], ['belt', 3, 1, 1]];
      var drawSet = function (dx, dy, a) { x.save(); x.globalAlpha = a; LINE.forEach(function (b) { K.drawBuilding(x, b[0], b[3], T, { x: ox + (b[1] + dx) * T, y: oy + (b[2] + dy) * T, item: b[4], noChev: true }); }); x.restore(); };
      var box = function (dx, dy, col, fill) { x.save(); x.fillStyle = fill; x.fillRect(ox + dx * T, oy + dy * T, 4 * T, 2 * T); x.setLineDash([8, 6]); x.lineWidth = 3; x.strokeStyle = col; x.strokeRect(ox + dx * T + 1.5, oy + dy * T + 1.5, 4 * T - 3, 2 * T - 3); x.restore(); };
      (function loop(now) {
        if (!self.isConnected) return;
        var k = ((now - t0) / 4200) % 1, e = function (u) { u = Math.max(0, Math.min(1, u)); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
        x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = '#F4EFE3'; x.fillRect(0, 0, W, H);
        x.strokeStyle = '#E6DDC8'; x.lineWidth = 1; x.beginPath(); for (var i = -1; i * T < W; i++) { x.moveTo(ox % T + i * T + 0.5, 0); x.lineTo(ox % T + i * T + 0.5, H); } for (var j = -1; j * T < H; j++) { x.moveTo(0, oy % T + j * T + 0.5); x.lineTo(W, oy % T + j * T + 0.5); } x.stroke();
        drawSet(0, 0, 1);
        if (k > 0.08 && k < 0.42) box(0, 0, '#6C5CE7', 'rgba(108,92,231,' + (0.14 * e((k - 0.08) / 0.1)) + ')');
        if (k >= 0.3 && k < 0.78) { var m = e((k - 0.32) / 0.3); drawSet(0, 2 * m, 0.55); box(0, 2 * m, '#6C5CE7', 'rgba(108,92,231,.08)'); }
        if (k >= 0.78) drawSet(0, 2, Math.min(1, (k - 0.78) / 0.05) * (k > 0.95 ? (1 - (k - 0.95) / 0.05) : 1));
        requestAnimationFrame(loop);
      })(t0);
    }
  });

  /* ================= audio =================
     Dan asked for no sounds or music, so every sound hook is a no-op. Keep the hooks so audio can be added later. */
  // Sound / Music sliders (0–100, 0 shows "Off") are saved for each builder. Nothing plays yet: applyVol() is where
  // the gain nodes get set once sounds exist (squared curve, as in knowledge/audio-patterns.md).
  var settings = { sound: 70, music: 60 };
  function ensureAudio() { startMusic(); initSfx(); return null; }
  /* Music: the four tracks in music/, shuffled once per load, then played in that order forever.
     Starts on the first tap or key (browsers block sound before that). Volume follows the Music slider (squared curve);
     at 0 it pauses. Pauses while the tab is hidden. Skip and the track name live in the Pause menu. */
  var TRACKS = ['drifting-circle', 'glass-hexagon', 'slow-square', 'sombre-triangle'];
  (function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } })(TRACKS);
  var music = new Audio(), trackI = 0, musicOn = false;
  music.preload = 'auto';
  music.addEventListener('ended', function () { playTrack(trackI + 1); });
  music.addEventListener('error', function () { if (musicOn) setTimeout(function () { playTrack(trackI + 1); }, 500); });
  function trackName(i) { return TRACKS[i].split('-').map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join(' '); }
  function playTrack(i) {
    trackI = (i + TRACKS.length) % TRACKS.length; music.src = 'music/' + TRACKS[trackI] + '.webm';
    $('#trackName').textContent = trackName(trackI);
    if (settings.music > 0 && !document.hidden) { var p = music.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function startMusic() { if (musicOn) return; musicOn = true; applyVol(); playTrack(0); }
  function applyVol() {
    music.volume = Math.pow(settings.music / 100, 2); if (sfxGain) sfxGain.gain.value = Math.pow(settings.sound / 100, 2);
    if (!musicOn) return;
    if (settings.music <= 0) music.pause(); else if (music.paused && !document.hidden && music.src) { var p = music.play(); if (p && p.catch) p.catch(function () {}); }
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { addEventListener(ev, function first() { removeEventListener(ev, first, true); startMusic(); initSfx(); }, true); });
  document.addEventListener('visibilitychange', function () { if (!musicOn) return; if (document.hidden) music.pause(); else applyVol(); });
  $('#trackName').textContent = trackName(0);
  function slider(id, key) {
    var el = $('#' + id), lab = $('#' + id + 'V');
    var show = function () { lab.textContent = settings[key] ? settings[key] : 'Off'; el.style.setProperty('--v', settings[key] + '%'); };
    el.addEventListener('input', function () { settings[key] = +el.value; show(); applyVol(); if (G) { var P = data.players[G.name]; P.sound = settings.sound; P.music = settings.music; } saveSoon(); });
    return function () { el.value = settings[key]; show(); };
  }
  var syncSnd = slider('snd', 'sound'), syncMus = slider('mus', 'music');
  function loadSettings(P) { settings.sound = P.sound == null ? 70 : P.sound; settings.music = P.music == null ? 60 : P.music; syncSnd(); syncMus(); applyVol(); }
  /* Sound effects: 7 short clips in sfx/, decoded once into Web Audio buffers (instant, overlapping, cheap).
     Volume follows the Sound slider (squared curve). Map:
       tap      – any button or selection (one document-level listener; buttons opt out with data-sfx)
       (confirm buttons – Play, a builder, Resume, Next, Copy ✓, Clear it… – also play tap)
       tick     – drawing belts (each new tile, pitch rising), dragging tunnel / teleporter ends, resizing boxes, moving a paste
       placed   – anything built: a belt line, a building, a tunnel / teleporter, a paste or move, a turn
       remove   – hold-to-delete, Delete box
       cancel   – any ✕ / close, drop on the cancel spot, Undo (Redo higher), and anything refused
       levelDone – finishing a level */
  var SFX = ['tap', 'confirm', 'tick', 'placed', 'remove', 'cancel', 'levelDone'], FILES = { tap: 'ui-tap', confirm: 'ui-confirm', tick: 'tick', placed: 'placed', remove: 'remove', cancel: 'cancel', levelDone: 'level-done' };
  var AC = null, sfxGain = null, bufs = {}, lastPlay = {};
  function initSfx() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    sfxGain = AC.createGain(); sfxGain.connect(AC.destination); sfxGain.gain.value = Math.pow(settings.sound / 100, 2);
    SFX.forEach(function (k) { fetch('sfx/' + FILES[k] + '.webm').then(function (r) { return r.arrayBuffer(); }).then(function (a) { return new Promise(function (ok, no) { AC.decodeAudioData(a, ok, no); }); }).then(function (b) { bufs[k] = b; }).catch(function () {}); });
  }
  var SFX_VOL = { tick: 0.5 }; // per-sound level on top of the Sound slider
  function sfx(k, rate, gap) {
    if (!AC || !bufs[k] || settings.sound <= 0) return;
    var now = performance.now(); if (now - (lastPlay[k] || 0) < (gap || 35)) return; lastPlay[k] = now;
    var s = AC.createBufferSource(); s.buffer = bufs[k]; if (rate) s.playbackRate.value = rate;
    if (SFX_VOL[k] != null) { var gv = AC.createGain(); gv.gain.value = SFX_VOL[k]; s.connect(gv); gv.connect(sfxGain); } else s.connect(sfxGain);
    s.start();
  }
  function dragTick(n) { sfx('tick', n ? 1 + Math.min(0.25, n * 0.0125) : 1, 45); }
  function machineClick() {} function clickSoft() {} function deliverSound() {} function updateHum() {}
  function placeSound() { sfx('placed'); } function popSound() { sfx('remove'); } function tickSound() {} function fanfare() { sfx('levelDone', 1, 300); }
  function cancelSound() { sfx('cancel'); }
  document.addEventListener('click', function (e) { // UI sounds for every button and selection
    var el = e.target.closest && e.target.closest('[data-sfx], button, .slot, .vb, .pk, .sw, .opt, .tab, .pcard');
    if (!el || el.id === 'backBtn') return;
    var k = el.dataset.sfx || 'tap'; if (k === 'confirm') k = 'tap'; // confirm buttons use the tap sound
    if (k !== 'none') sfx(k);
  }, true);

  /* ================= saves ================= */
  var Store = window.ArcadeStore ? window.ArcadeStore('shapes') : null, data = null, saveT = 0;
  var SID = Math.random().toString(36).slice(2, 8);
  function fresh() { return { sound: 70, music: 60, level: 1, got: 0, cam: { x: -4, y: 0, T: 46 }, b: [], belts: [], fpN: 0, fpOrder: null, fsp: null }; }
  function loadData() { var d = Store && Store.get(); if (!d || !d.players) d = { v: 1, players: { caleb: fresh(), ezra: fresh() }, settings: { sound: 70, music: 60 }, gen: 0 }; return d; }
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 1500); }
  function saveNow() {
    if (!data || !G || noSave) return; clearTimeout(saveT);
    var P = data.players[G.name]; P.level = G.level; P.got = G.got; P.cam = { x: cam.x, y: cam.y, T: cam.T }; P.fpN = G.fpN; P.fpOrder = G.fpOrder; P.fsp = G.fsp; P.sound = settings.sound; P.music = settings.music; P.tutSeen = true;
    P.b = blds.filter(function (b) { return b.t !== 'hub'; }).map(function (b) { var o = [b.t, b.x, b.y, b.r]; if (b.rule || b.fs) o.push(b.rule || null); if (b.fs) o.push(b.fs); return o; });
    delete P.belts; // buildings only: items in transit are not saved
    data.sid = SID; data.gen = (data.gen || 0) + 1;
    if (Store) Store.set(null, data);
  }
  addEventListener('pagehide', function () { if (inGame) saveNow(); });
  setInterval(function () { if (inGame) saveNow(); updateHum(); }, 10000);

  function loadPlayer(name) {
    var P = data.players[name] || (data.players[name] = fresh());
    loadSettings(P);
    grid.clear(); blds = []; bchunk.clear(); chunks.clear(); undoS = []; redoS = []; selB = null;
    G = { name: name, level: P.level || 1, got: P.got || 0, fpN: P.fpN || 0, fpOrder: P.fpOrder || randomOrder(Math.random), fsp: P.fsp || null };
    G.sp = G.level <= 20 ? speedsAt(G.level) : (G.fsp || (G.fsp = speedsAt(21)));
    G.hub = place(create('hub', -2, -2, 0));
    (P.b || []).forEach(function (o) { if (BLD[o[0]]) place(create(o[0], o[1], o[2], o[0] === 'bin' ? 0 : o[3], { rule: o[4], fs: o[5] })); });
    refreshFilters(); // a save made on an older order picks up the current one
    cam.x = P.cam ? P.cam.x : -4; cam.y = P.cam ? P.cam.y : 0; cam.T = P.cam ? P.cam.T : 46; renderT = cam.T;
    tool = 'build'; selFam = 'belt'; famVar = {}; placeRot = 0; area = null; paste = null; hidePillbar();
    rebuildTopo(); buildBar(); updateCard(); undoUI(); pillDirty = true;
    tut.on = false; $('#coach').classList.add('hidden');
    if (G.level === 1) setTimeout(function () { if (inGame && G.level === 1) openStory(INTRO, tutStart); }, 900);
  }

  /* ================= screens ================= */
  var step = 0, inGame = false;
  function setStripPos(anim) {
    var s = $('#strip'), g = $('#game');
    if (!anim) { s.style.transition = g.style.transition = 'none'; requestAnimationFrame(function () { s.style.transition = g.style.transition = ''; }); }
    s.style.transform = 'translateY(' + (-Math.min(step, 2) * VH) + 'px)';
    g.style.transform = step >= 2 ? 'translateY(0)' : 'translateY(' + ((2 - step) * VH) + 'px)';
    $('#fvHome').toggleAttribute('animate', step === 0 && !fast); $('#fvPick').toggleAttribute('animate', step === 1 && !fast);
  }
  function hud(on) {
    var tf = { pill: ['translateX(-50%)', 'translateX(-50%) translateY(-110px)'], tr: ['none', 'translateY(-110px)'], card: ['none', 'translateX(380px)'], bottom: ['translateX(-50%)', 'translateX(-50%) translateY(170px)'] };
    Object.keys(tf).forEach(function (id, i) { var el = $('#' + id); el.style.transform = tf[id][on ? 0 : 1]; el.style.transitionDelay = on ? (i * 60) + 'ms' : '0ms'; });
    $('#hudLayer').style.visibility = on ? 'visible' : 'hidden'; setTimeout(syncRot, 0);
  }
  function renderCards() {
    var P = [['caleb', 'Caleb', '#FFD9DB', 'CrCrCrCr'], ['ezra', 'Ezra', '#D6E5FF', 'WbWbWbWb']];
    $('#cards').innerHTML = P.map(function (p) {
      var s = data.players[p[0]] || fresh(), lvl = s.level || 1, ord = lvl <= 20 ? LV[lvl - 1][0] : (s.fpOrder || 'CuCuCuCu'), n = lvl <= 20 ? LV[lvl - 1][1] : Math.min(1000, 450 + 50 * (s.fpN || 0)), got = s.got || 0;
      return '<button class="pcard" data-sfx="confirm" data-p="' + p[0] + '"><div class="avatar" style="background:' + p[2] + '"><shape-glyph code="' + p[3] + '" size="124"></shape-glyph></div><div class="pname">' + p[1] + '</div>' +
        '<div class="pinfo"><shape-glyph code="' + ord + '" size="40"></shape-glyph><div style="flex:1;display:flex;flex-direction:column;gap:6px;text-align:left"><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:600;line-height:1.1"><span>' + (lvl > 20 ? 'Freeplay ' + (21 + (s.fpN || 0)) : 'Level ' + lvl) + '</span><span>' + got + ' / ' + n + '</span></div><div class="bar"><i style="width:' + Math.min(100, got / n * 100) + '%"></i></div></div></div></button>';
    }).join('');
  }
  // Hold a player card for 0.8s: ask to wipe that builder's factory and start again.
  var holdT = 0, held = false, resetWho = null;
  $('#cards').addEventListener('pointerdown', function (e) {
    var c = e.target.closest('[data-p]'); if (!c) return; held = false; clearTimeout(holdT);
    c.style.transition = 'transform .8s'; c.style.transform = 'scale(.96)';
    holdT = setTimeout(function () { held = true; c.style.transform = ''; openReset(c.dataset.p); }, 800);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { $('#cards').addEventListener(ev, function (e) { clearTimeout(holdT); var c = e.target.closest && e.target.closest('[data-p]'); if (c) { c.style.transform = ''; c.style.transition = ''; } }, true); });
  function openReset(who) {
    resetWho = who; var nm = who === 'caleb' ? 'Caleb' : 'Ezra', s = data.players[who] || fresh();
    $('#rName').textContent = nm; $('#rInfo').textContent = (s.level > 20 ? 'Freeplay ' + (21 + (s.fpN || 0)) : 'Level ' + (s.level || 1)) + ' · ' + ((s.b || []).length) + ' buildings';
    openModal('mReset');
  }
  $('#rYes').addEventListener('click', function () {
    if (!resetWho) return; data.players[resetWho] = fresh(); if (Store) { Store.set(null, data); Store.flush && Store.flush(); }
    if (G && G.name === resetWho) loadPlayer(resetWho);
    resetWho = null; closeModal(); renderCards(); toast('restart_alt', 'Fresh start!');
  });
  $('#rNo').addEventListener('click', function () { resetWho = null; closeModal(); });
  $('#cards').addEventListener('click', function (e) { var c = e.target.closest('[data-p]'); if (!c) return; if (held) { held = false; return; } ensureAudio(); tickSound(); loadPlayer(c.dataset.p); step = 2; setStripPos(true); hud(false); setTimeout(function () { inGame = true; hud(true); }, 760); });
  $('#playBtn').addEventListener('click', function () { ensureAudio(); tickSound(); renderCards(); step = 1; setStripPos(true); });
  $('#skipBtn').addEventListener('click', function () { if (!musicOn) startMusic(); else playTrack(trackI + 1); });
  $('#howBtn').addEventListener('click', function () { closeModal(); openStory(INTRO, tutStart); });
  $('#coachX').addEventListener('click', function () { tut.on = false; $('#coach').classList.add('hidden'); clearSlotPulse(); });
  $('#switchBtn').addEventListener('click', function () { saveNow(); closeModal(); inGame = false; hud(false); renderCards(); step = 1; setStripPos(true); updateHum(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  addEventListener('resize', resize);

  /* ================= loop ================= */
  var last = performance.now(), acc = 0, humT = 0;
  function frame(now) {
    var dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    if (dt === 0 && now === last) { requestAnimationFrame(frame); return; } // same timestamp twice (some hosts do this): nothing has moved, skip the redraw
    last = now;
    if (inGame && G) {
      var t0 = performance.now();
      if (!paused) { if (topoDirty) rebuildTopo(); acc += dt; var n = 0; while (acc >= STEP && n < 4) { stepMachines(STEP); acc -= STEP; n++; } if (n === 4) acc = 0; moveBelts(dt); }
      stepCam(now);
      if (gest && EDGE[gest.kind] && gest.cx != null) { // finger near a screen edge: scroll that way and keep the drag going
        var EM = 70, ex1 = gest.cx < EM ? -1 : gest.cx > VW - EM ? 1 : 0, ey1 = gest.cy < EM ? -1 : gest.cy > VH - EM ? 1 : 0;
        if (ex1 || ey1) { var spd = 9 * dt; cam.x += ex1 * spd; cam.y += ey1 * spd; moveGesture(gest.cx, gest.cy); }
      }
      var t1 = performance.now(), drew = false;
      if (!fast || now - perf.lastDraw >= 31) { render(now); perf.lastDraw = now; drew = true; }
      var t2 = performance.now();
      if (mon) { perf.sim += t1 - t0; if (drew) { perf.rnd += t2 - t1; perf.nd = (perf.nd || 0) + 1; perf.fr.push(now - (perf.prevDraw || now)); perf.prevDraw = now; } perf.n++; if (now - perf.last > 500) monUpdate(now); }
      if (pillDirty) updatePill();
      if (frameNo % 10 === 0) tutTick();
      if ((humT += dt) > 0.5) { humT = 0; updateHum(); }
    }
    requestAnimationFrame(frame);
  }
  function monUpdate(now) {
    var fr = perf.fr.slice(1).sort(function (a, b) { return a - b; }), med = fr.length ? fr[fr.length >> 1] : 0, worst = fr.length ? fr[Math.floor(fr.length * 0.95)] : 0;
    var items = 0; beltList.forEach(function (b) { items += b.items.length; });
    var vis = 0; chunks.forEach(function (ch) { if (frameNo - ch.seen < 2) vis++; });
    $('#perf').innerHTML = '<b style="color:' + (med <= 20 ? '#7CE0A0' : med <= 40 ? '#FFD45C' : '#FF8A80') + '">' + (med ? Math.round(1000 / med) : 0) + ' fps</b>' + (fast ? ' <span style="color:#FFD45C">FAST</span>' : '') +
      '<br>frame ' + med.toFixed(1) + ' ms · worst ' + worst.toFixed(1) +
      '<br>draw ' + (perf.nd ? (perf.rnd / perf.nd).toFixed(1) : '0') + ' ms · sim ' + (perf.n ? (perf.sim / perf.n).toFixed(2) : '0') + ' ms' +
      '<br>' + (blds.length - beltList.length - 1) + ' buildings · ' + beltList.length + ' belts' +
      '<br>' + items + ' items · ' + vis + ' chunks · zoom ' + Math.round(cam.T) + ' · ' + DPR.toFixed(2) + 'x';
    perf.fr = []; perf.sim = 0; perf.rnd = 0; perf.n = 0; perf.nd = 0; perf.last = now;
  }
  function setFast(on) {
    fast = !!on; DPR = fast ? 0.75 : FULL_DPR; spriteCache.clear(); chunks.clear(); resize();
    $('#fastBtn').classList.toggle('on', fast); $('#fastSw').classList.toggle('on', fast);
    ['#fvHome', '#fvPick'].forEach(function (s) { $(s).classList.toggle('fastoff', fast); });
    if (fast) { $('#fvHome').removeAttribute('animate'); $('#fvPick').removeAttribute('animate'); } else setStripPos(false);
    saveDevice();
  }
  function setMon(on) { mon = !!on; if (!mon) $('#perf').innerHTML = ''; $('#perf').classList.toggle('hidden', !mon); perf.last = 0; perf.fr = []; saveDevice(); }
  // Fast mode and the monitor belong to this device, not to a builder: they sit in data.device, outside data.players,
  // so switching builder or clearing one never changes them. Saved straight away, from any screen.
  function saveDevice() { if (!data || booting) return; data.device = { fast: fast, mon: mon }; if (Store && !noSave) Store.set(null, data); }
  var booting = false;
  (function () { // tap = Fast mode on/off · hold = show/hide the performance monitor
    var btn = $('#fastBtn'), t = 0, heldF = false;
    btn.addEventListener('pointerdown', function () { heldF = false; clearTimeout(t); t = setTimeout(function () { heldF = true; setMon(!mon); }, 600); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, function () { clearTimeout(t); }); });
    btn.addEventListener('click', function () { if (heldF) { heldF = false; return; } setFast(!fast); });
  })();
  function boot() {
    data = loadData();
    seedPatches(); resize(); step = 0; setStripPos(false); hud(false);
    var dev = data.device || { fast: !!data.fast, mon: !!data.mon }; delete data.fast; delete data.mon; data.device = dev;
    booting = true; if (dev.fast) setFast(true); if (dev.mon) setMon(true); booting = false;
    loadPlayer('caleb'); inGame = false;
    requestAnimationFrame(frame);
  }
  var go = function () { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { if (Store) Store.ready(boot); else boot(); }); };
  go();
  // test harness: using it turns saving off for this tab, so experiments never reach the real save
  var noSave = false;
  window.__shapes = { get G() { noSave = true; return G; }, blds: function () { noSave = true; return blds; }, place: function (t, x, y, r, rule) { noSave = true; run({ rm: [], add: [{ t: t, x: x, y: y, r: r, rule: rule }] }); }, cam: cam, sim: function (dt) { noSave = true; sim(dt); }, done: function (lvl) { noSave = true; openDone(lvl); }, clear: function () { noSave = true; blds.slice().forEach(function (b) { if (b.t !== 'hub') removeB(b); }); } };
})();
