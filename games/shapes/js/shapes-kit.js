/* Shapes kit: the shape renderer, building sprites and world renderer for "Shapes".
   Plain Canvas 2D, no dependencies — written so the game build can lift drawShape / drawBuilding / drawWorld as-is.
   Custom elements for the design guide: <shape-glyph>, <building-sprite>, <building-icon>, <factory-view>. */
(function () {
  'use strict';
  if (window.ShapesKit) return; // loaded twice (e.g. streamed + final): keep the instance the custom elements were defined with
  var INK = '#23213A';
  var COL = { u: '#B4B2C2', r: '#F2545B', g: '#47C46C', b: '#3D85F5', y: '#FFCC33', p: '#A862E6', c: '#2DCDE0', w: '#FFFFFF' };
  var COL_NAME = { u: 'Uncoloured', r: 'Red', g: 'Green', b: 'Blue', y: 'Yellow', p: 'Purple', c: 'Cyan', w: 'White' };
  var CAT = { transport: '#FFC56E', process: '#A3AEFF', colour: '#FFA3C8', other: '#8EDDB9', hub: '#B9B2FF' };
  var WORLD = { bg: '#F4EFE3', grid: '#E6DDC8', rubber: '#8E89AA', rail: '#ABA7C4', edge: '#5F5B7C', chev: '#FFF3CC', port: '#5F5B7C', accent: '#6C5CE7' };

  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')'; }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function setup(c, w, h) {
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px';
    var ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.__dpr = dpr; return ctx;
  }

  /* ---------- Shapes ---------- */
  // Code: 4 quarters TR, BR, BL, TL; each <piece><colour> or "--".
  function parse(code) {
    code = (code || '').trim(); if (code.length !== 8) return null; var q = [];
    for (var i = 0; i < 4; i++) {
      var p = code[2 * i], c = code[2 * i + 1];
      if (p === '-' && c === '-') { q.push(null); continue; }
      if ('CRSW*'.indexOf(p) < 0 || !(COL[c] || c === '*')) return null;
      q.push({ p: p, c: c });
    }
    return q;
  }
  function quarterPath(ctx, i, p, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(i * Math.PI / 2); ctx.beginPath();
    if (p === 'C') { ctx.moveTo(0, 0); ctx.lineTo(0, -r); ctx.arc(0, 0, r, -Math.PI / 2, 0); }
    else if (p === 'R' || p === '*') { var s = r * 0.86; ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.lineTo(s, -s); ctx.lineTo(s, 0); }
    else if (p === 'S') { ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.6); ctx.lineTo(r * 0.84, -r * 0.84); ctx.lineTo(r * 0.6, 0); }
    else { ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.58); ctx.lineTo(r * 0.9, -r * 0.9); ctx.lineTo(r * 0.9, 0); }
    ctx.closePath(); ctx.restore();
  }
  var SX = [1, 1, -1, -1], SY = [-1, 1, 1, -1];
  // One look, 'sticker': each shape sits on a thin soft-grey base, flat colour with a light inner edge, thick ink outline.
  // '*' quarters are Filter wildcards: '**' is skipped, 'P*' = rainbow fill (any colour), '*c' = paint dot (any piece).
  // o.empties: mark '--' quarters with a dotted cross (Filter rules: "must be empty").
  function drawShape(ctx, code, cx, cy, size, o) {
    if (code === '0') { // Filter rule "colour: empty" (only uncoloured shapes)
      var r0 = size * 0.3, l0 = Math.max(1.5, size * 0.055);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r0, 0, 7); ctx.fillStyle = '#FFFDF8'; ctx.fill(); ctx.setLineDash([l0 * 1.3, l0 * 1.1]); ctx.lineWidth = l0; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
      dotCross(ctx, cx, cy, r0 * 0.42, l0); return true;
    }
    if (typeof code === 'string' && code.length === 1 && COL[code]) { // a colour item: a paint blob
      var br = size * 0.3, blw = Math.max(1.5, size * 0.055);
      ctx.beginPath(); ctx.arc(cx, cy, br, 0, 7); ctx.fillStyle = COL[code]; ctx.fill(); ctx.lineWidth = blw; ctx.strokeStyle = INK; ctx.stroke();
      return true;
    }
    var q = Array.isArray(code) ? code : parse(code); if (!q) return false;
    var r = size * 0.41, lw = Math.max(1.5, size * 0.055), i, Q, dd = Math.max(1, size * 0.035);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (i = 0; i < 4; i++) if (q[i] && q[i].p !== '*' && q[i].c !== '*') { quarterPath(ctx, i, q[i].p, cx, cy + dd, r); ctx.fillStyle = 'rgba(35,33,58,.22)'; ctx.fill(); ctx.strokeStyle = 'rgba(35,33,58,.22)'; ctx.lineWidth = lw; ctx.stroke(); }
    for (i = 0; i < 4; i++) {
      Q = q[i]; if (!Q) continue;
      if (Q.p === '*' && Q.c === '*') continue;
      quarterPath(ctx, i, Q.p, cx, cy, r);
      if (Q.c === '*') { var rg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); [COL.r, COL.y, COL.g, COL.c, COL.b, COL.p].forEach(function (c, k) { rg.addColorStop(k / 5, c); }); ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = rg; ctx.fill(); ctx.restore(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); continue; }
      if (Q.p === '*') {
        ctx.save(); ctx.beginPath(); ctx.arc(cx + SX[i] * r * 0.45, cy + SY[i] * r * 0.45, r * 0.3, 0, 7); ctx.fillStyle = COL[Q.c]; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
        quarterPath(ctx, i, Q.p, cx, cy, r); ctx.save(); ctx.setLineDash([lw * 1.4, lw * 1.2]); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(35,33,58,.35)'; ctx.stroke(); ctx.restore(); continue;
      }
      ctx.fillStyle = COL[Q.c]; ctx.fill();
      ctx.save(); ctx.clip(); quarterPath(ctx, i, Q.p, cx, cy, r); ctx.lineWidth = lw * 1.6; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke(); ctx.restore();
      quarterPath(ctx, i, Q.p, cx, cy, r);
      ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
    }
    if (o && o.empties) for (i = 0; i < 4; i++) if (!q[i]) emptyMark(ctx, i, cx, cy, r, lw);
    return true;
  }
  // "Must be empty" quarter: a dashed outline of the empty slot with a dotted cross inside it.
  function emptyMark(ctx, i, cx, cy, r, lw) {
    ctx.save();
    quarterPath(ctx, i, 'R', cx, cy, r * 0.94);
    ctx.setLineDash([lw * 1.2, lw * 1.1]); ctx.lineWidth = Math.max(1.2, lw * 0.7); ctx.strokeStyle = 'rgba(35,33,58,.4)'; ctx.stroke();
    dotCross(ctx, cx + SX[i] * r * 0.47, cy + SY[i] * r * 0.47, r * 0.2, lw);
    ctx.restore();
  }
  function dotCross(ctx, x, y, k, lw) { // a light dashed X with an open centre (no blob where the arms cross)
    var R = [[-1, -0.72], [-0.5, -0.22], [0.22, 0.5], [0.72, 1]];
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1.4, Math.min(lw * 0.7, k * 0.22)); ctx.strokeStyle = 'rgba(35,33,58,.55)'; ctx.beginPath();
    [[1, 1], [1, -1]].forEach(function (d) { R.forEach(function (t) { ctx.moveTo(x + d[0] * k * t[0], y + d[1] * k * t[0]); ctx.lineTo(x + d[0] * k * t[1], y + d[1] * k * t[1]); }); });
    ctx.stroke(); ctx.restore();
  }




  /* ---------- Buildings ---------- */
  // Rot 0 = items flow UP (enter bottom edge, leave top edge). rot k turns the sprite k×90° clockwise.
  // ins / outs = tile columns on the bottom / top edge. cins = colour inputs.
  var BLD = {
    extractor: { name: 'Extractor', w: 1, h: 1, cat: 'other', outs: [0] },
    // Link Extractor: replaces every Extractor once unlocked. Takes items from the one behind it, so a row of them acts as extractor + belt.
    extractor2: { name: 'Link Extractor', w: 1, h: 1, cat: 'other', ins: [0], outs: [0] },
    belt: { name: 'Belt', w: 1, h: 1, cat: 'transport' },
    belt_l: { name: 'Belt (left)', w: 1, h: 1, cat: 'transport' },
    belt_r: { name: 'Belt (right)', w: 1, h: 1, cat: 'transport' },
    // Belt-native join (option): a belt tile whose side rail opens to take a belt from the left / right.
    belt_join_l: { name: 'Belt join (left)', w: 1, h: 1, cat: 'transport' },
    belt_join_r: { name: 'Belt join (right)', w: 1, h: 1, cat: 'transport' },
    splitter: { name: 'Splitter', w: 2, h: 1, cat: 'transport', ins: [0], outs: [0, 1] },
    balancer: { name: 'Balancer', w: 2, h: 1, cat: 'transport', ins: [0, 1], outs: [0, 1] },
    // Merger: 1×1, takes the belt behind it plus one side belt, sends both out the top.
    balancer_l: { name: 'Merger (left)', w: 1, h: 1, cat: 'transport', ins: [0], side: 'L', outs: [0] },
    balancer_r: { name: 'Merger (right)', w: 1, h: 1, cat: 'transport', ins: [0], side: 'R', outs: [0] },
    // Compact splitter: 1×1, takes the belt behind it and sends shapes straight on and out one side, in turn.
    split_l: { name: 'Splitter (left)', w: 1, h: 1, cat: 'transport', ins: [0], outs: [0], sideOut: 'L' },
    split_r: { name: 'Splitter (right)', w: 1, h: 1, cat: 'transport', ins: [0], outs: [0], sideOut: 'R' },
    tunnel_in: { name: 'Tunnel 1', w: 1, h: 1, cat: 'transport', ins: [0], tier: 1 },
    tunnel_out: { name: 'Tunnel 1 exit', w: 1, h: 1, cat: 'transport', outs: [0], tier: 1 },
    // Tunnel 2: same as Tunnel 1 but reaches further (up to 8 tiles under); its own colour so pairs never get mixed up.
    tunnel2_in: { name: 'Tunnel 2', w: 1, h: 1, cat: 'transport', ins: [0], tier: 2 },
    tunnel2_out: { name: 'Tunnel 2 exit', w: 1, h: 1, cat: 'transport', outs: [0], tier: 2 },
    // Teleporter: like a tunnel, but its exit can go anywhere and shapes arrive instantly. Purple, so it never looks like a tunnel.
    teleport_in: { name: 'Teleporter', w: 1, h: 1, cat: 'transport', ins: [0], tier: 3 },
    teleport_out: { name: 'Teleporter exit', w: 1, h: 1, cat: 'transport', outs: [0], tier: 3 },
    cutter: { name: 'Cutter', w: 2, h: 1, cat: 'process', ins: [0], outs: [0, 1] },
    quad: { name: 'Quad Cutter', w: 4, h: 1, cat: 'process', ins: [0], outs: [0, 1, 2, 3] },
    rotator: { name: 'Rotator', w: 1, h: 1, cat: 'process', ins: [0], outs: [0] },
    rotator_ccw: { name: 'Rotator ↺', w: 1, h: 1, cat: 'process', ins: [0], outs: [0] },
    rotator_180: { name: 'Rotator 180', w: 1, h: 1, cat: 'process', ins: [0], outs: [0] },
    combiner: { name: 'Combiner', w: 2, h: 1, cat: 'process', ins: [0, 1], outs: [0] },
    // Painter: shape runs straight through (2 tiles along the flow); colour joins from the left side of the first tile.
    // Shown at rot 1 it reads left → right with the colour coming in from the top.
    painter: { name: 'Painter', w: 1, h: 2, cat: 'colour', ins: [0], outs: [0], side: 'L', sideRow: 1, sideKind: 'c' },
    // Quad versions. Quad Painter: shape from the left side, one colour per quarter on the bottom (TL, TR, BR, BL left→right: clockwise from top-left).
    quad_painter: { name: 'Quad Painter', w: 4, h: 1, cat: 'colour', side: 'L', cins: [0, 1, 2, 3], outs: [3] },
    // Quad Mixer: up to four colours in, one mixed colour out (red + green + blue → white in one go).
    quad_mixer: { name: 'Quad Mixer', w: 4, h: 1, cat: 'colour', cins: [0, 1, 2, 3], couts: [0] },
    // Quad Combiner: up to four non-overlapping pieces in, one shape out.
    quad_combiner: { name: 'Quad Combiner', w: 4, h: 1, cat: 'process', ins: [0, 1, 2, 3], outs: [0] },
    mixer: { name: 'Mixer', w: 2, h: 1, cat: 'colour', cins: [0, 1], couts: [0] },
    // Mixer White: red, green and blue in (one of each, any order), white out of the middle.
    mixer_w: { name: 'Mixer White', w: 3, h: 1, cat: 'colour', cins: [0, 1, 2], couts: [1] },
    // Bin: takes items from any side, so it has no ports.
    bin: { name: 'Bin', w: 1, h: 1, cat: 'other' },
    // Timer: a belt tile with a little display on top showing items per second passing through.
    meter: { name: 'Timer', w: 1, h: 1, cat: 'other', ins: [0], outs: [0] },
    // Filter: lets through what matches its picture (left), everything else goes in its built-in bin (right).
    filter: { name: 'Filter', w: 2, h: 1, cat: 'other', ins: [0], outs: [0] },
    hub: { name: 'Hub', w: 4, h: 4, cat: 'hub' }
  };

  function chevron(ctx, x, y, s, ang, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0); ctx.beginPath();
    ctx.moveTo(-s, s * 0.55); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s, s * 0.55);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }
  function beltStraight(ctx, T, ph, noChev) {
    var bw = T * 0.72, x0 = (T - bw) / 2, e = Math.max(1.2, T * 0.035);
    ctx.fillStyle = WORLD.edge; ctx.fillRect(x0 - e, 0, bw + 2 * e, T);
    ctx.fillStyle = WORLD.rubber; ctx.fillRect(x0, 0, bw, T);
    ctx.fillStyle = WORLD.rail; ctx.fillRect(x0, 0, bw * 0.13, T); ctx.fillRect(x0 + bw * 0.87, 0, bw * 0.13, T);
    if (noChev) return;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, bw, T); ctx.clip();
    var sp = T / 2, off = ((ph || 0) * T) % sp;
    for (var k = -1; k < 3; k++) chevron(ctx, T / 2, T - k * sp - off, bw * 0.2, 0, WORLD.chev, Math.max(1.5, T * 0.07));
    ctx.restore();
  }
  function beltCorner(ctx, T, ph, left, noChev) {
    if (left) { ctx.save(); ctx.translate(T, 0); ctx.scale(-1, 1); }
    var bw = T * 0.72, e = Math.max(1.2, T * 0.035), R = T / 2;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(T, T, R, Math.PI, Math.PI * 1.5); ctx.strokeStyle = WORLD.edge; ctx.lineWidth = bw + 2 * e; ctx.stroke();
    ctx.beginPath(); ctx.arc(T, T, R, Math.PI, Math.PI * 1.5); ctx.strokeStyle = WORLD.rubber; ctx.lineWidth = bw; ctx.stroke();
    ctx.strokeStyle = WORLD.rail; ctx.lineWidth = bw * 0.13;
    ctx.beginPath(); ctx.arc(T, T, R + bw * 0.435, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(T, T, R - bw * 0.435, Math.PI, Math.PI * 1.5); ctx.stroke();
    var L = Math.PI / 2 * R, sp = T / 2, off = ((ph || 0) * T) % sp;
    for (var k = noChev ? 9 : -1; k < 3; k++) {
      var s = k * sp + off; if (s < 0 || s > L) continue; var a = Math.PI + (s / L) * (Math.PI / 2);
      chevron(ctx, T + Math.cos(a) * R, T + Math.sin(a) * R, bw * 0.2, a + Math.PI, WORLD.chev, Math.max(1.5, T * 0.07));
    }
    if (left) ctx.restore();
  }
  function beltJoin(ctx, T, ph, right) {
    if (right) { ctx.save(); ctx.translate(T, 0); ctx.scale(-1, 1); }
    beltStraight(ctx, T, ph);
    var bw = T * 0.72, x0 = (T - bw) / 2, e = Math.max(1.2, T * 0.035), xe = x0 + bw * 0.13 + 0.5;
    ctx.fillStyle = WORLD.edge; ctx.fillRect(0, x0 - e, xe, e); ctx.fillRect(0, x0 + bw, xe, e);
    ctx.fillStyle = WORLD.rubber; ctx.fillRect(0, x0, xe, bw);
    ctx.fillStyle = WORLD.rail; ctx.fillRect(0, x0, x0, bw * 0.13); ctx.fillRect(0, x0 + bw * 0.87, x0, bw * 0.13);
    // merge mark: a small curved arrow from the opening into the lane
    ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = WORLD.chev; ctx.lineWidth = Math.max(1.5, T * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0 + bw * 0.08, T * 0.5); ctx.quadraticCurveTo(T * 0.5, T * 0.5, T * 0.5, T * 0.3); ctx.stroke(); ctx.restore();
    if (right) ctx.restore();
  }
  function port(ctx, cx, y, T, kind, top) {
    var w = T * 0.42, h = T * 0.24, x = cx - w / 2;
    rrect(ctx, x, y, w, h, T * 0.06);
    ctx.fillStyle = kind === 'c' ? '#D6487F' : WORLD.port; ctx.fill();
    ctx.lineWidth = Math.max(1.5, T * 0.045); ctx.strokeStyle = INK; ctx.stroke();
    chevron(ctx, cx, y + h / 2, T * 0.08, 0, WORLD.chev, Math.max(1.2, T * 0.05));
  }
  function bodyBox(ctx, x, y, w, h, T, col, dpr, shadow) {
    var i = T * 0.07;
    rrect(ctx, x + i, y + i, w - 2 * i, h - 2 * i, T * 0.2);
    if (shadow) { ctx.save(); ctx.shadowColor = 'rgba(35,33,58,.25)'; ctx.shadowOffsetY = T * 0.08 * (dpr || 1); ctx.shadowBlur = T * 0.06 * (dpr || 1); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
    else { ctx.fillStyle = col; ctx.fill(); }
    ctx.lineWidth = Math.max(2, T * 0.06); ctx.strokeStyle = INK; ctx.stroke();
    var j = T * 0.17; rrect(ctx, x + j, y + j, w - 2 * j, h - 2 * j - T * 0.05, T * 0.14);
    ctx.fillStyle = mix(col, '#ffffff', 0.42); ctx.fill();
  }
  function ink(ctx, T) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, T * 0.075); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  function blade(ctx, cx, cy, r, ph, T) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((ph || 0) * 0.6); ctx.beginPath();
    for (var k = 0; k < 16; k++) { var a = k / 16 * Math.PI * 2, rr = k % 2 ? r * 0.78 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#E9ECF5'; ctx.fill(); ink(ctx, T); ctx.lineWidth *= 0.7; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
  }
  function drop(ctx, x, y, s, col) {
    ctx.beginPath(); ctx.moveTo(x, y - 0.3 * s); ctx.quadraticCurveTo(x + 0.22 * s, y - 0.02 * s, x + 0.22 * s, y + 0.08 * s);
    ctx.arc(x, y + 0.08 * s, 0.22 * s, 0, Math.PI); ctx.quadraticCurveTo(x - 0.22 * s, y - 0.02 * s, x, y - 0.3 * s);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
  }
  function pie(ctx, r, cols) {
    var n = cols.length; for (var k = 0; k < n; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, k / n * Math.PI * 2, (k + 1) / n * Math.PI * 2); ctx.closePath(); ctx.fillStyle = cols[k]; ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  }
  // Glyphs are centred on (cx,cy) with unit s (one tile in sprites).
  function glyph(ctx, type, cx, cy, s, ph, o) {
    ph = ph || 0; o = o || {}; var k;
    ctx.save(); ctx.translate(cx, cy); ink(ctx, s);
    var head = function (x, y, a) { chevron(ctx, x, y, s * 0.12, a || 0, INK, Math.max(2, s * 0.075)); };
    switch (type) {
      case 'extractor':
        ctx.save(); ctx.rotate(ph * 0.4); ctx.beginPath();
        for (k = 0; k < 12; k++) { var a = k / 12 * Math.PI * 2, rr = k % 2 ? s * 0.2 : s * 0.29; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore(); break;
      case 'splitter':
        ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.3 * s); ctx.lineTo(-0.5 * s, -0.22 * s);
        ctx.moveTo(-0.5 * s, 0.18 * s); ctx.quadraticCurveTo(0.5 * s, 0.18 * s, 0.5 * s, -0.22 * s); ctx.stroke();
        head(-0.5 * s, -0.24 * s); head(0.5 * s, -0.24 * s); break;
      case 'merger':
        ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.3 * s); ctx.lineTo(-0.5 * s, -0.22 * s);
        ctx.moveTo(0.5 * s, 0.3 * s); ctx.quadraticCurveTo(0.5 * s, -0.04 * s, -0.5 * s, -0.04 * s); ctx.stroke();
        head(-0.5 * s, -0.24 * s); break;
      case 'balancer':
        // 2×1: two lanes in at the back, crossing once, two lanes out at the front (same height as the Splitter's glyph)
        ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.3 * s); ctx.bezierCurveTo(-0.5 * s, 0.04 * s, 0.5 * s, 0.04 * s, 0.5 * s, -0.22 * s);
        ctx.moveTo(0.5 * s, 0.3 * s); ctx.bezierCurveTo(0.5 * s, 0.04 * s, -0.5 * s, 0.04 * s, -0.5 * s, -0.22 * s); ctx.stroke();
        head(-0.5 * s, -0.24 * s); head(0.5 * s, -0.24 * s); break;
      case 'split_l': case 'split_r': // straight on, plus a branch peeling off to the side
        ctx.save(); if (type === 'split_r') ctx.scale(-1, 1);
        ctx.beginPath(); ctx.moveTo(0, 0.3 * s); ctx.lineTo(0, -0.2 * s);
        ctx.moveTo(0, 0.14 * s); ctx.quadraticCurveTo(0, -0.04 * s, -0.3 * s, -0.04 * s); ctx.stroke();
        head(0, -0.22 * s); head(-0.33 * s, -0.04 * s, -Math.PI / 2); ctx.restore(); break;
      case 'balancer_l': case 'balancer_r':
        ctx.save(); if (type === 'balancer_r') ctx.scale(-1, 1);
        ctx.beginPath(); ctx.moveTo(0, 0.3 * s); ctx.lineTo(0, -0.2 * s);
        ctx.moveTo(-0.32 * s, 0.06 * s); ctx.quadraticCurveTo(0, 0.06 * s, 0, -0.12 * s); ctx.stroke();
        head(0, -0.22 * s); ctx.restore(); break;
      case 'tunnel_in': case 'tunnel_out':
        // a dark well in the body: shapes drop into it (in) or rise out of it (out); dashes show the way underground
        var isIn = type === 'tunnel_in', wr = s * 0.25;
        rrect(ctx, -wr, -wr, wr * 2, wr * 2, s * 0.1);
        var wg = ctx.createLinearGradient(0, isIn ? wr : -wr, 0, isIn ? -wr : wr); wg.addColorStop(0, '#4A4663'); wg.addColorStop(1, '#16142A');
        ctx.fillStyle = wg; ctx.fill(); ink(ctx, s); ctx.lineWidth *= 0.8; ctx.stroke();
        chevron(ctx, 0, isIn ? -wr * 0.1 : wr * 0.1, s * 0.1, 0, '#fff', Math.max(1.5, s * 0.06));
        ctx.save(); ctx.setLineDash([s * 0.05, s * 0.06]); ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.strokeStyle = 'rgba(35,33,58,.45)';
        ctx.beginPath(); [-0.12, 0.12].forEach(function (x) { if (isIn) { ctx.moveTo(x * s, -wr - s * 0.04); ctx.lineTo(x * s, -s * 0.42); } else { ctx.moveTo(x * s, wr + s * 0.04); ctx.lineTo(x * s, s * 0.42); } }); ctx.stroke(); ctx.restore();
        break;
      case 'cutter': case 'quad':
        // Scissors pointing up. Two straight halves cross at one pivot, 30° apart (each ±15°), so the blades
        // make a V on top and the handles cross over to the other side below. Working: each half closes by 5° and back.
        ctx.scale(o.icon ? 0.92 : 0.8, o.icon ? 0.92 : 0.8);
        var py = 0.04 * s, GREY = '#C4C1CF', olw = Math.max(1.6, s * 0.045);
        var ang = (15 - (o.icon ? 0 : 5 * (0.5 + 0.5 * Math.sin(ph * Math.PI * 1.5)))) * Math.PI / 180;
        if (type === 'quad') { ctx.save(); ctx.setLineDash([s * 0.06, s * 0.08]); ctx.lineWidth = Math.max(1.4, s * 0.04); ctx.strokeStyle = 'rgba(35,33,58,.45)'; ctx.beginPath(); ctx.moveTo(-0.46 * s, py); ctx.lineTo(0.46 * s, py); ctx.stroke(); ctx.restore(); }
        var handle = function (sd) { // sd -1: blade tilts left, handle crosses to the right (and the other way round)
          ctx.save(); ctx.translate(0, py); ctx.rotate(-sd * ang);
          var hx = sd * 0.1 * s, hy = 0.24 * s; // rings sit on the side the handle crosses to, so they never overlap
          [[INK, 0.075 * s + olw * 2, 0.085 * s + olw * 2], [GREY, 0.075 * s, 0.085 * s]].forEach(function (p) {
            ctx.strokeStyle = p[0]; ctx.lineCap = 'round'; ctx.lineWidth = p[1];
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0, 0.12 * s, hx * 0.7, hy - 0.08 * s); ctx.stroke();
            ctx.lineWidth = p[2] * 0.82; ctx.beginPath(); ctx.arc(hx, hy, 0.075 * s, 0, 7); ctx.stroke();
          });
          ctx.restore();
        };
        var blade = function (sd) {
          ctx.save(); ctx.translate(0, py); ctx.rotate(-sd * ang);
          ctx.beginPath(); ctx.moveTo(-0.055 * s, 0.04 * s); ctx.lineTo(0.055 * s, 0.04 * s); ctx.lineTo(0.014 * s, -0.4 * s); ctx.lineTo(-0.014 * s, -0.4 * s); ctx.closePath();
          ctx.fillStyle = GREY; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = olw; ctx.strokeStyle = INK; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -0.04 * s); ctx.lineTo(0, -0.34 * s); ctx.lineWidth = Math.max(1, s * 0.018); ctx.strokeStyle = 'rgba(35,33,58,.3)'; ctx.stroke();
          ctx.restore();
        };
        handle(-1); handle(1); blade(1); blade(-1);
        ctx.beginPath(); ctx.arc(0, py, s * 0.04, 0, 7); ctx.fillStyle = INK; ctx.fill();
        break;
      case 'rotator': case 'rotator_ccw': case 'rotator_180':
        // Turns in its direction, a step at a time: ease through 90° (180° for the 180 variant), rest, repeat.
        var P = 2.6, cyc = Math.floor(ph / P), tt = (ph % P) / P, mv = tt < 0.55 ? tt / 0.55 : 1, ez = mv < 0.5 ? 2 * mv * mv : 1 - Math.pow(-2 * mv + 2, 2) / 2;
        var amt = type === 'rotator_180' ? Math.PI : Math.PI / 2;
        ctx.save(); if (type === 'rotator_ccw') ctx.scale(-1, 1); ctx.rotate((cyc + ez) * amt + (type !== 'rotator_180' ? Math.PI : 0)); // ↻ / ↺ arrows sit turned 180° (icons and placed buildings alike)
        var R = s * 0.19, hs = function (x, y, a) { chevron(ctx, x, y, s * 0.09, a, INK, Math.max(1.8, s * 0.065)); };
        ctx.lineWidth = Math.max(1.8, s * 0.065);
        if (type === 'rotator_180') {
          [0, Math.PI].forEach(function (b) { ctx.beginPath(); ctx.arc(0, 0, R, b - 1.2, b + 0.9); ctx.stroke(); hs(Math.cos(b + 0.9) * R, Math.sin(b + 0.9) * R, b + 0.9 + Math.PI); });
        } else { ctx.beginPath(); ctx.arc(0, 0, R, -2.2, 1.9); ctx.stroke(); hs(Math.cos(1.9) * R, Math.sin(1.9) * R, 1.9 + Math.PI); }
        ctx.restore(); break;
      case 'quad_painter':
        var qc = [COL.r, COL.g, COL.b, COL.y];
        if (o.icon) { [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.2], [0.2, 0.2]].forEach(function (p, k) { drop(ctx, p[0] * s, p[1] * s, s * 0.55, qc[k]); }); }
        else qc.forEach(function (c, k) { drop(ctx, (k - 1.5) * s, 0, s * (0.62 + 0.04 * Math.sin(ph * 1.2 + k)), c); });
        break;
      case 'mixer_w':
        ctx.save(); ctx.rotate(ph * 0.5); pie(ctx, s * 0.26, [COL.r, COL.g, COL.b]); ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, 7); ctx.fillStyle = COL.w; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.03); ctx.strokeStyle = INK; ctx.stroke();
        break;
      case 'quad_mixer':
        ctx.save(); ctx.rotate(ph * 0.4); pie(ctx, s * (o.icon ? 0.3 : 0.3), [COL.r, COL.g, COL.b, COL.w]); ctx.restore();
        break;
      case 'quad_combiner':
        var qcl = s * ((o.icon ? 0.42 : 0.62) + 0.012 * Math.sin(ph * Math.PI));
        drawShape(ctx, 'CrRgSbWy', 0, 0, s * (o.icon ? 0.5 : 0.62));
        ctx.beginPath(); ctx.moveTo(-qcl + 0.1 * s, -0.26 * s); ctx.lineTo(-qcl, -0.26 * s); ctx.lineTo(-qcl, 0.26 * s); ctx.lineTo(-qcl + 0.1 * s, 0.26 * s);
        ctx.moveTo(qcl - 0.1 * s, -0.26 * s); ctx.lineTo(qcl, -0.26 * s); ctx.lineTo(qcl, 0.26 * s); ctx.lineTo(qcl - 0.1 * s, 0.26 * s); ink(ctx, s); ctx.stroke();
        break;
      case 'painter':
        var pc = COL[o.paint || 'r'], dy = o.icon ? 0.03 : 0.42;
        ctx.save(); ctx.translate(0, dy * s); ctx.rotate(-(o.__rot || 0) * Math.PI / 2); drop(ctx, 0, 0, s * (o.icon ? 0.95 : 0.85), pc); ctx.restore();
        if (!o.icon) for (k = 0; k < 3; k++) { var t = ((ph * 0.4 + k / 3) % 1); ctx.beginPath(); ctx.arc((k - 1) * 0.12 * s, (dy - 0.32 - t * (o.icon ? 0.12 : 0.5)) * s, s * 0.055, 0, 7); ctx.fillStyle = pc; ctx.fill(); ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.stroke(); }
        break;
      case 'mixer':
        ctx.save(); ctx.rotate(ph * 0.5); var mr = s * 0.28;
        ctx.beginPath(); ctx.arc(0, 0, mr, 0, 7); ctx.fillStyle = COL.b; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2); ctx.arc(0, mr / 2, mr / 2, Math.PI / 2, -Math.PI / 2, true); ctx.arc(0, -mr / 2, mr / 2, Math.PI / 2, -Math.PI / 2); ctx.closePath(); ctx.fillStyle = COL.r; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, mr, 0, 7); ctx.stroke(); ctx.restore(); break;
      case 'combiner':
        var cl = s * (0.42 + 0.012 * Math.sin(ph * Math.PI));
        drawShape(ctx, 'CuCuRuRu', 0, 0, s * 0.5);
        ctx.beginPath(); ctx.moveTo(-cl + 0.1 * s, -0.24 * s); ctx.lineTo(-cl, -0.24 * s); ctx.lineTo(-cl, 0.24 * s); ctx.lineTo(-cl + 0.1 * s, 0.24 * s);
        ctx.moveTo(cl - 0.1 * s, -0.24 * s); ctx.lineTo(cl, -0.24 * s); ctx.lineTo(cl, 0.24 * s); ctx.lineTo(cl - 0.1 * s, 0.24 * s); ink(ctx, s); ctx.stroke(); break;
      case 'filter':
        funnel(ctx, -0.12 * s, -0.02 * s, s * 1.15);
        ctx.beginPath(); ctx.arc(0.26 * s, 0.14 * s, 0.13 * s, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.stroke();
        ctx.beginPath(); var fk = s * 0.055; ctx.moveTo(0.26 * s - fk, 0.14 * s - fk); ctx.lineTo(0.26 * s + fk, 0.14 * s + fk); ctx.moveTo(0.26 * s + fk, 0.14 * s - fk); ctx.lineTo(0.26 * s - fk, 0.14 * s + fk); ctx.strokeStyle = '#E8505A'; ctx.lineWidth = Math.max(1.8, s * 0.06); ctx.stroke();
        break;
      case 'bin':
        rrect(ctx, -0.2 * s, -0.16 * s, 0.4 * s, 0.42 * s, s * 0.06); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.27 * s, -0.24 * s); ctx.lineTo(0.27 * s, -0.24 * s); ctx.moveTo(-0.07 * s, -0.31 * s); ctx.lineTo(0.07 * s, -0.31 * s);
        ctx.moveTo(-0.07 * s, -0.06 * s); ctx.lineTo(-0.07 * s, 0.16 * s); ctx.moveTo(0.07 * s, -0.06 * s); ctx.lineTo(0.07 * s, 0.16 * s); ctx.stroke(); break;
    }
    ctx.restore();
  }
  var NUB = '#D3D0DB';
  function nub(ctx, T, y, up) {
    ctx.beginPath(); var d = up ? -1 : 1, h = T * 0.18;
    ctx.moveTo(T * 0.34, y); ctx.lineTo(T * 0.5, y + d * h); ctx.lineTo(T * 0.66, y); ctx.closePath();
    ctx.fillStyle = NUB; ctx.fill(); ctx.lineWidth = Math.max(2, T * 0.06); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  }
  // Extractor: a chunky frame with a dark well showing what it pulls out, and an output nub on top.
  function extractorSprite(ctx, T, ph, o) {
    var lw = Math.max(2, T * 0.06), frame = o.link ? CAT.other : NUB, dpr = ctx.__dpr || 1;
    rrect(ctx, T * 0.08, T * 0.1, T * 0.84, T * 0.82, T * 0.24);
    if (o.mode !== 'ghost') { ctx.save(); ctx.shadowColor = 'rgba(35,33,58,.25)'; ctx.shadowOffsetY = T * 0.07 * dpr; ctx.shadowBlur = T * 0.05 * dpr; ctx.fillStyle = frame; ctx.fill(); ctx.restore(); } else { ctx.fillStyle = frame; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
    rrect(ctx, T * 0.21, T * 0.23, T * 0.58, T * 0.56, T * 0.14); ctx.fillStyle = o.well || patchBase(o.item || 'CuCuCuCu'); ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.stroke();
    var it = o.item || 'CuCuCuCu', sc = o.working ? 1 + Math.sin(ph * Math.PI) * 0.03 : 1, cx = T * 0.5, cy = T * 0.51;
    if (it.length === 1) { ctx.beginPath(); ctx.arc(cx, cy, T * 0.15 * sc, 0, 7); ctx.fillStyle = COL[it]; ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.strokeStyle = INK; ctx.stroke(); }
    else drawShape(ctx, it, cx, cy, T * 0.44 * sc);
    port(ctx, T / 2, -T * 0.04, T, 's'); // same output tab as every other machine
  }
  // Tunnel: a portal arch. Entrance has its mouth facing the incoming belt; exit faces the outgoing one.
  // The belt itself comes from the stub pass, so items really slide into / out of the mouth.
  var TUNNEL_COL = { 1: '#FFD45C', 2: '#7FD8E6', 3: '#B7A6FF' };
  // Teleporter: a round purple pad with a glowing ring, not an arch. The entrance's ring spins inwards, the exit's outwards.
  function teleSprite(ctx, T, isIn, o) {
    var lw = Math.max(2, T * 0.06), c = T / 2, ph = o.phase || 0;
    rrect(ctx, T * 0.08, T * 0.08, T * 0.84, T * 0.84, T * 0.24); ctx.fillStyle = '#EFEBFF'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, T * 0.3, 0, 7); ctx.fillStyle = '#6C5CE7'; ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.045); ctx.stroke();
    ctx.save(); ctx.translate(c, c); ctx.rotate((isIn ? -1 : 1) * ph * 1.6);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#D9D1FF'; ctx.lineWidth = Math.max(1.5, T * 0.05);
    for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, T * 0.19, k * 2.094, k * 2.094 + 1.2); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(c, c, T * 0.07, 0, 7); ctx.fillStyle = '#FFFDF8'; ctx.fill();
    // arrow tab on the edge shapes go in (entrance) or come out (exit), in the sprite's own frame: travel is up
    var ty = isIn ? T * 0.94 : T * 0.06;
    rrect(ctx, c - T * 0.13, ty - T * 0.08, T * 0.26, T * 0.16, T * 0.06); ctx.fillStyle = '#5F5B7C'; ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.strokeStyle = INK; ctx.stroke();
    chevron(ctx, c, ty, T * 0.06, 0, '#FFF3CC', Math.max(1.2, T * 0.035));
  }
  function tunnelSprite(ctx, T, isIn, o, tier) {
    if (tier === 3) return teleSprite(ctx, T, isIn, o);
    var lw = Math.max(2, T * 0.06), dpr = ctx.__dpr || 1;
    ctx.save(); if (!isIn) { ctx.translate(0, T); ctx.scale(1, -1); }
    var x = T * 0.06, w = T * 0.88, y0 = T * 0.06, y1 = T * 0.6, r = T * 0.26;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.arcTo(x, y0, x + w, y0, r); ctx.arcTo(x + w, y0, x + w, y1, r); ctx.lineTo(x + w, y1); ctx.closePath();
    if (o.mode !== 'ghost') { ctx.save(); ctx.shadowColor = 'rgba(35,33,58,.25)'; ctx.shadowOffsetY = (isIn ? 1 : -1) * T * 0.06 * dpr; ctx.shadowBlur = T * 0.05 * dpr; ctx.fillStyle = TUNNEL_COL[tier || 1]; ctx.fill(); ctx.restore(); } else { ctx.fillStyle = TUNNEL_COL[tier || 1]; ctx.fill(); }
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
    var hx = T * 0.18, hw = T * 0.64, hr = T * 0.16, hy = T * 0.22;
    ctx.beginPath(); ctx.moveTo(hx, y1); ctx.arcTo(hx, hy, hx + hw, hy, hr); ctx.arcTo(hx + hw, hy, hx + hw, y1, hr); ctx.lineTo(hx + hw, y1); ctx.closePath();
    var g = ctx.createLinearGradient(0, y1, 0, hy); g.addColorStop(0, '#3A3654'); g.addColorStop(1, '#1A1830'); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.stroke();
    ctx.restore();
    // roof arrow points the way shapes travel (up, in the sprite's own frame) on both ends
    chevron(ctx, T / 2, isIn ? T * 0.15 : T * 0.85, T * 0.08, 0, '#fff', Math.max(1.5, T * 0.05));
  }
  function filterArt(ctx, T, o, rot) {
    var lw = Math.max(2, T * 0.06);
    rrect(ctx, T * 0.18, T * 0.2, T * 0.66, T * 0.62, T * 0.14); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
    var it = o.item || 'CuCu****';
    if (it.length === 1 && COL[it]) { ctx.beginPath(); ctx.arc(T * 0.51, T * 0.51, T * 0.15, 0, 7); ctx.fillStyle = COL[it]; ctx.fill(); ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.stroke(); }
    // the picture is what gets through, so it stays upright however the filter is turned
    else { ctx.save(); ctx.translate(T * 0.51, T * 0.51); ctx.rotate(-(rot || 0) * Math.PI / 2); drawShape(ctx, it, 0, 0, T * 0.44, { empties: true }); ctx.restore(); }
    funnel(ctx, T * 1.1, T * 0.3, T * 0.5); // sits above the dashed line to the bin
    ctx.save(); ctx.setLineDash([T * 0.07, T * 0.08]); ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(T * 0.9, T * 0.5); ctx.lineTo(T * 1.3, T * 0.5); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(T * 1.52, T * 0.5, T * 0.21, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); var x = T * 1.52, y = T * 0.5, k = T * 0.09; ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k);
    ctx.strokeStyle = '#E8505A'; ctx.lineWidth = Math.max(2, T * 0.075); ctx.lineCap = 'round'; ctx.stroke();
  }
  function funnel(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    ctx.moveTo(-0.22 * s, -0.18 * s); ctx.lineTo(0.22 * s, -0.18 * s); ctx.lineTo(0.06 * s, 0.03 * s); ctx.lineTo(0.06 * s, 0.2 * s); ctx.lineTo(-0.06 * s, 0.26 * s); ctx.lineTo(-0.06 * s, 0.03 * s); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  }
  function hubFace(ctx, cx, cy, T, ph, pulse) {
    var blink = (ph % 4) > 3.85 ? 0.15 : 1, ex = T * 0.55, ey = -T * 0.3;
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.ellipse(cx + sd * ex, cy + ey, T * 0.26, T * 0.32 * blink, 0, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, T); ctx.stroke();
      if (blink > 0.5) { ctx.beginPath(); ctx.arc(cx + sd * ex + T * 0.05, cy + ey + T * 0.06, T * 0.13, 0, 7); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(cx + sd * ex + T * 0.1, cy + ey, T * 0.045, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(cx + sd * T * 1.0, cy + T * 0.22, T * 0.17, T * 0.11, 0, 0, 7); ctx.fillStyle = 'rgba(255,120,170,.55)'; ctx.fill();
    });
    var open = 0.12 + 0.3 * (pulse || 0);
    ctx.beginPath(); ctx.moveTo(cx - T * 0.42, cy + T * 0.25); ctx.quadraticCurveTo(cx, cy + T * (0.25 + open * 2.4), cx + T * 0.42, cy + T * 0.25); ctx.closePath();
    ctx.fillStyle = '#7A2E4A'; ctx.fill(); ink(ctx, T); ctx.stroke();
  }
  // The Timer's display, centred at 0,0 and always upright.
  function meterBox(ctx, T, txt) {
    var bw = T * 0.86, bh = T * 0.46;
    rrect(ctx, -bw / 2, -bh / 2, bw, bh, T * 0.13); ctx.fillStyle = INK; ctx.fill();
    ctx.lineWidth = Math.max(2, T * 0.07); ctx.strokeStyle = CAT.other; ctx.stroke();
    ctx.fillStyle = '#FFF3CC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(T * 0.27) + "px 'Baloo 2', system-ui, sans-serif"; ctx.fillText(txt, 0, T * 0.02);
  }
  function drawBuilding(ctx, type, rot, T, o) {
    o = o || {}; var d = BLD[type]; if (!d) return; rot = (rot || 0) & 3;
    var w = d.w * T, h = d.h * T, RW = rot % 2 ? h : w, RH = rot % 2 ? w : h, ph = o.phase || 0, dpr = ctx.__dpr || 1;
    ctx.save();
    if (o.mode === 'ghost') ctx.globalAlpha = 0.5;
    ctx.translate((o.x || 0) + RW / 2, (o.y || 0) + RH / 2); ctx.rotate(rot * Math.PI / 2); ctx.translate(-w / 2, -h / 2);
    if (type === 'belt') beltStraight(ctx, T, ph, o.noChev);
    else if (type === 'belt_l') beltCorner(ctx, T, ph, true, o.noChev);
    else if (type === 'belt_r') beltCorner(ctx, T, ph, false, o.noChev);
    else if (type === 'meter') { beltStraight(ctx, T, ph, o.noChev); if (!o.noBox) { ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-rot * Math.PI / 2); meterBox(ctx, T, o.rate == null ? '2.0' : o.rate); ctx.restore(); } }
    else if (type === 'belt_join_l') beltJoin(ctx, T, ph, false);
    else if (type === 'belt_join_r') beltJoin(ctx, T, ph, true);
    else if (type === 'extractor') extractorSprite(ctx, T, ph, o);
    else if (/^(tunnel2?|teleport)_(in|out)$/.test(type)) tunnelSprite(ctx, T, /_in$/.test(type), o, d.tier || 1);
    else if (type === 'extractor2') extractorSprite(ctx, T, ph, Object.assign({}, o, { link: true }));
    else if (type === 'hub') {
      var pu = o.pulse || 0, sc = 1 + pu * 0.008;
      ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
      bodyBox(ctx, 0, 0, w, h, T, CAT.hub, dpr, o.mode !== 'ghost');
      for (var e = 0; e < 4; e++) for (var c = 0; c < 4; c++) {
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(e * Math.PI / 2); ctx.translate(-w / 2, -h / 2);
        port(ctx, c * T + T / 2, h - T * 0.22, T, 's'); ctx.restore();
      }
      if (o.hubFace) hubFace(ctx, w / 2, h / 2 - T * 0.15, T, ph, pu);
      else {
        var cx = w / 2, cy = h / 2 - (o.count ? T * 0.32 : T * 0.1), rr = o.count ? T * 1.02 : T * 1.15;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ink(ctx, T); ctx.stroke();
        if (o.progress > 0) { ctx.beginPath(); ctx.arc(cx, cy, rr - T * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.progress);
        ctx.strokeStyle = WORLD.accent; ctx.lineWidth = T * 0.14; ctx.lineCap = 'round'; ctx.stroke(); }
        if (o.order) drawShape(ctx, o.order, cx, cy, o.count ? T * 1.32 : T * 1.5);
        if (o.count) { // delivered / needed, under the window
          ctx.save(); ctx.font = '800 ' + Math.round(T * 0.5) + "px 'Baloo 2', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var ty = cy + rr + T * 0.42; ctx.lineWidth = Math.max(3, T * 0.12); ctx.strokeStyle = '#FFFDF8'; ctx.lineJoin = 'round'; ctx.strokeText(o.count, cx, ty); ctx.fillStyle = INK; ctx.fillText(o.count, cx, ty); ctx.restore(); }
      }
    } else {
      bodyBox(ctx, 0, 0, w, h, T, CAT[d.cat], dpr, o.mode !== 'ghost');
      (d.ins || []).forEach(function (c) { port(ctx, c * T + T / 2, h - T * 0.2, T, 's'); });
      (d.cins || []).forEach(function (c) { port(ctx, c * T + T / 2, h - T * 0.2, T, 'c'); });
      (d.outs || []).forEach(function (c) { port(ctx, c * T + T / 2, -T * 0.04, T, 's'); });
      if (d.sideOut) { ctx.save(); ctx.translate(T / 2, T / 2); ctx.rotate(d.sideOut === 'L' ? -Math.PI / 2 : Math.PI / 2); ctx.translate(-T / 2, -T / 2); port(ctx, T / 2, -T * 0.04, T, 's'); ctx.restore(); }
      if (d.side) { var sy = (d.sideRow || 0) * T; ctx.save(); ctx.translate(T / 2, sy + T / 2); ctx.rotate(d.side === 'L' ? Math.PI / 2 : -Math.PI / 2); ctx.translate(-T / 2, -T / 2); port(ctx, T / 2, T - T * 0.2, T, d.sideKind || 's'); ctx.restore(); }
      (d.couts || []).forEach(function (c) { port(ctx, c * T + T / 2, -T * 0.04, T, 'c'); });
      var bob = o.working ? Math.sin(ph * Math.PI) * T * 0.008 : 0;
      if (type === 'filter') filterArt(ctx, T, o, rot); else glyph(ctx, type, w / 2, h / 2 + bob, T, o.working === false ? 0 : ph, Object.assign({}, o, { __rot: rot }));
    }
    ctx.restore();
  }
  function drawIcon(ctx, type, size, o) {
    var d = BLD[type]; if (!d) return; o = o || {};
    if (type === 'meter') { ctx.save(); rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.fillStyle = CAT.other; ctx.fill(); ctx.clip(); drawBuilding(ctx, 'meter', 0, size, { phase: o.phase, rate: '2.4' }); ctx.restore(); return; }
    if (type.indexOf('belt') === 0) {
      ctx.save(); rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.fillStyle = CAT.transport; ctx.fill(); ctx.clip();
      drawBuilding(ctx, type, 0, size, { phase: o.phase }); ctx.restore();
      rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.lineWidth = Math.max(2, size * 0.05); ctx.strokeStyle = INK; ctx.stroke(); return;
    }
    if (type === 'extractor' || type === 'extractor2') { drawBuilding(ctx, type, 0, size, { item: 'CuCuCuCu' }); return; }
    if (/^teleport/.test(type)) { ctx.save(); rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.fillStyle = '#FFF4DE'; ctx.fill(); ctx.clip(); ctx.translate(size * 0.06, size * 0.06); teleSprite(ctx, size * 0.88, /_in$/.test(type), { phase: o.phase }); ctx.restore(); return; }
    if (/^(tunnel|teleport)/.test(type)) {
      ctx.save(); rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.fillStyle = '#FFF4DE'; ctx.fill(); ctx.clip();
      ctx.beginPath(); ctx.rect(0, /_in$/.test(type) ? size * 0.45 : 0, size, size * 0.55); ctx.clip(); drawBuilding(ctx, 'belt', 0, size, { phase: o.phase }); ctx.restore();
      drawBuilding(ctx, type, 0, size, {});
      rrect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2); ctx.lineWidth = Math.max(2, size * 0.05); ctx.strokeStyle = INK; ctx.stroke(); return;
    }
    bodyBox(ctx, -size * 0.02, -size * 0.02, size * 1.04, size * 1.04, size, CAT[d.cat], ctx.__dpr, false);
    var s = size * (type === 'splitter' || type === 'balancer' ? 0.54 : type === 'cutter' || type === 'quad' ? 0.9 : d.w >= 2 ? 0.66 : 0.92);
    if (type === 'hub') { hubFace(ctx, size / 2, size / 2, size * 0.3, 0, 0); return; }
    glyph(ctx, type, size / 2, size / 2 + size * 0.02, s, o.phase || 0, Object.assign({ icon: true }, o));
  }

  /* ---------- World ---------- */
  function ellipseTiles(cx, cy, rx, ry) { var t = []; for (var y = Math.floor(cy - ry); y <= cy + ry; y++) for (var x = Math.floor(cx - rx); x <= cx + rx; x++) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) t.push([x, y]); } return t; }
  function line(x, y, dir, n, type) { var out = [], dx = [0, 1, 0, -1][dir], dy = [-1, 0, 1, 0][dir]; for (var i = 0; i < n; i++) out.push({ t: type || 'belt', x: x + dx * i, y: y + dy * i, r: dir }); return out; }
  var STARTER = {
    patches: [
      { kind: 'SuSuSuSu', tiles: ellipseTiles(4.6, 5.6, 2.4, 2.7) },
      { kind: 'RuRuRuRu', tiles: ellipseTiles(20.5, 10.4, 2.2, 1.7) },
      { kind: 'CuCuCuCu', tiles: ellipseTiles(22.6, 3.2, 1.8, 1.5) },
      { kind: 'r', tiles: ellipseTiles(9.4, 10.4, 1.6, 1.4) },
      { kind: 'g', tiles: ellipseTiles(3.2, 11.6, 1.5, 1.2) },
      { kind: 'b', tiles: ellipseTiles(26.5, 8.4, 1.4, 1.6) }
    ],
    buildings: [].concat(
      [{ t: 'extractor', x: 6, y: 6, r: 1 }], line(7, 6, 1, 2),
      [{ t: 'cutter', x: 9, y: 6, r: 1, working: true }, { t: 'bin', x: 10, y: 6, r: 1 }], line(10, 7, 1, 3),
      [{ t: 'extractor', x: 6, y: 4, r: 1 }], line(7, 4, 1, 2),
      [{ t: 'hub', x: 13, y: 4, r: 0 }]
    ),
    ghosts: line(9, 4, 1, 4),
    finger: [12.5, 4.5],
    flows: [
      { pts: [[6.5, 6.5], [9.5, 6.5]], item: 'SuSuSuSu', gap: 0.8 },
      { pts: [[9.5, 7.5], [13.7, 7.5]], item: 'SuSu----', gap: 0.8, toHub: true },
      { pts: [[9.5, 6.5], [10.5, 6.5]], item: '----SuSu', gap: 0.8 },
      { pts: [[6.5, 4.5], [8.85, 4.5]], item: 'SuSuSuSu', gap: 0.62, stopped: true }
    ],
    hubOrder: 'SrSrCbCb', progress: 0.64
  };
  function tilePath(ctx, x, y, t, tl, tr, br, bl) {
    ctx.beginPath(); ctx.moveTo(x + tl, y);
    ctx.arcTo(x + t, y, x + t, y + t, tr); ctx.arcTo(x + t, y + t, x, y + t, br);
    ctx.arcTo(x, y + t, x, y, bl); ctx.arcTo(x, y, x + t, y, tl); ctx.closePath();
  }
  // Fill a tile region: corners where both side neighbours are missing round off (90°);
  // inner corners where both sides are present but the diagonal is missing get a fillet (270°).
  function fillRegion(ctx, tiles, T, ox, oy, r, col) {
    var set = {}; tiles.forEach(function (t) { set[t[0] + ',' + t[1]] = 1; });
    var has = function (x, y) { return !!set[x + ',' + y]; };
    ctx.fillStyle = col;
    tiles.forEach(function (t) {
      var x = t[0], y = t[1], X = ox + x * T, Y = oy + y * T;
      var up = has(x, y - 1), dn = has(x, y + 1), lf = has(x - 1, y), rt = has(x + 1, y);
      tilePath(ctx, X - 0.3, Y - 0.3, T + 0.6, !lf && !up ? r : 0, !rt && !up ? r : 0, !rt && !dn ? r : 0, !lf && !dn ? r : 0); ctx.fill();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (d) {
        var dx = d[0], dy = d[1];
        if (!(has(x + dx, y) && has(x, y + dy) && !has(x + dx, y + dy))) return;
        var px = X + (dx > 0 ? T : 0), py = Y + (dy > 0 ? T : 0);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + dy * r); ctx.arcTo(px, py, px + dx * r, py, r); ctx.closePath(); ctx.fill();
      });
    });
  }
  var MIX = ['CrCrCrCr', 'SySySySy', 'RbRbRbRb', 'WgWgWgWg', 'CpCp--Cp', 'SwSwSwSw', 'CuCuRuRu', 'RcWcRcWc'];
  var LAYOUTS = {
    starter: STARTER,
    tunnelDemo: {
      patches: [{ kind: 'SySySySy', tiles: ellipseTiles(0.6, 1.5, 1.0, 1.3) }, { kind: 'RbRbRbRb', tiles: ellipseTiles(5.5, 3.6, 1.3, 0.8) }],
      buildings: [].concat([{ t: 'extractor', x: 0, y: 1, r: 1 }], line(1, 1, 1, 2), [{ t: 'tunnel_in', x: 3, y: 1, r: 1 }, { t: 'tunnel_out', x: 7, y: 1, r: 1 }], line(8, 1, 1, 2),
        [{ t: 'extractor', x: 5, y: 3, r: 0 }], line(5, 2, 0, 3)),
      flows: [{ pts: [[0.5, 1.5], [10.6, 1.5]], item: 'SySySySy', gap: 0.9, loop: true, hide: [3.05, 6.95] }, { pts: [[5.5, 3.5], [5.5, -0.6]], item: 'RbRbRbRb', gap: 0.9, loop: true }]
    },
    tunnelDrag: {
      patches: [{ kind: 'SySySySy', tiles: ellipseTiles(0.5, 1.5, 0.9, 1.2) }],
      buildings: [].concat([{ t: 'extractor', x: 0, y: 1, r: 1 }], line(1, 1, 1, 1), [{ t: 'tunnel_in', x: 2, y: 1, r: 1 }], line(4, 0, 2, 3)),
      ghosts: [{ t: 'tunnel_out', x: 6, y: 1, r: 1 }], finger: [6.5, 1.5],
      flows: [{ pts: [[0.5, 1.5], [2.45, 1.5]], item: 'SySySySy', gap: 0.9, loop: true }, { pts: [[4.5, -0.6], [4.5, 3.6]], item: 'RuRuRuRu', gap: 0.9, loop: true }]
    },
    chainDemo: {
      patches: [{ kind: 'SySySySy', tiles: [[0, 1], [1, 1], [2, 1], [3, 1], [0, 0], [1, 0], [2, 0], [1, 2], [2, 2], [3, 2]] }],
      buildings: [].concat([0, 1, 2, 3].map(function (x) { return { t: 'extractor2', x: x, y: 1, r: 1 }; }), line(4, 1, 1, 4)),
      flows: [{ pts: [[0.5, 1.5], [8.6, 1.5]], item: 'SySySySy', gap: 0.5, loop: true }]
    },
    joinA: joinDemo(false),
    joinB: joinDemo(true),
    fresh: { patches: STARTER.patches, buildings: [{ t: 'hub', x: 13, y: 4, r: 0 }], flows: [], hubOrder: 'CuCuCuCu', progress: 0 },
    // Menu world: Home (rows 0–14) sits directly above Who's building (rows 15–29); 690px = 15 tiles of 46px.
    // One belt: extractors on Who's building feed it, it runs left, turns up the x=4 column, crosses into Home,
    // turns right and runs into the Hub. Both screens draw this same world, so items carry across the seam.
    menu: (function () {
      var patches = [], sources = [];
      var bld = [].concat(
        line(23, 27, 3, 19),                       // bottom run, flowing west (x 23 → 5)
        [{ t: 'belt_r', x: 4, y: 27, r: 3 }],      // west → north
        line(4, 26, 0, 15),                        // up the x=4 column (y 26 → 12), across the seam
        [{ t: 'belt_r', x: 4, y: 11, r: 0 }],      // north → east
        line(5, 11, 1, 18),                        // into the Hub
        [{ t: 'hub', x: 23, y: 9, r: 0 }]);
      var trunk = [[23.5, 27.5], [4.5, 27.5], [4.5, 11.5], [23.7, 11.5]];
      var blob = function (list) { var seen = {}, out = []; list.forEach(function (e) { ellipseTiles(e[0], e[1], e[2], e[3]).forEach(function (t) { var k = t[0] + ',' + t[1]; if (!seen[k]) { seen[k] = 1; out.push(t); } }); }); return out; };
      // src(extractor x, y, rot, item, feed polyline from extractor centre to the join, distance of the join along the trunk, patch ellipses, feed belts, join tile)
      var src = function (ex, ey, r, item, feed, at, patch, belts, join) {
        bld.push({ t: 'extractor', x: ex, y: ey, r: r });
        patches.push({ kind: item, tiles: blob(patch) });
        sources.push({ at: at, feed: feed, item: item });
        (belts || []).forEach(function (b) { bld.push(b); });
        if (join) { bld = bld.filter(function (b) { return !(b.t === 'belt' && b.x === join[0] && b.y === join[1]); }); bld.push({ t: 'balancer_l', x: join[0], y: join[1], r: join[2] }); }
      };
      // head of the bottom run
      src(24, 27, 3, 'CuCuCuCu', [[24.5, 27.5], [23.5, 27.5]], 0, [[25.3, 27.4, 1.9, 1.3], [24.4, 28.7, 1.3, 0.9]]);
      // from below the bottom run
      src(18, 28, 0, 'RuRuRuRu', [[18.5, 28.5], [18.5, 27.5]], 5, [[18.5, 28.8, 1.6, 1.0], [19.6, 29.4, 1.2, 0.8]], [], [18, 27, 3]);
      src(12, 29, 0, 'WbWbWbWb', [[12.5, 29.5], [12.5, 27.5]], 11, [[12.3, 29.6, 1.8, 0.9], [11.2, 29.2, 1.0, 0.8]], [{ t: 'belt', x: 12, y: 28, r: 0 }], [12, 27, 3]);
      // from the left of the up column
      src(1, 25, 0, 'SySySySy', [[1.5, 25.5], [1.5, 24.5], [4.5, 24.5]], 22, [[1.3, 25.7, 1.4, 1.2], [0.4, 26.6, 1.1, 0.9]], [{ t: 'belt_r', x: 1, y: 24, r: 0 }, { t: 'belt', x: 2, y: 24, r: 1 }, { t: 'belt', x: 3, y: 24, r: 1 }], [4, 24, 0]);
      src(2, 20, 1, 'CrCrCrCr', [[2.5, 20.5], [4.5, 20.5]], 26, [[2.3, 20.4, 1.5, 1.1], [1.2, 21.2, 1.2, 0.9]], [{ t: 'belt', x: 3, y: 20, r: 1 }], [4, 20, 0]);
      src(1, 17, 1, 'RgRgRgRg', [[1.5, 17.5], [4.5, 17.5]], 29, [[1.2, 17.0, 1.4, 1.2], [0.6, 18.2, 1.0, 0.8]], [{ t: 'belt', x: 2, y: 17, r: 1 }, { t: 'belt', x: 3, y: 17, r: 1 }], [4, 17, 0]);
      return { patches: patches, buildings: bld, flows: [{ merge: true, toHub: true, pts: trunk, gap: 0.82, sources: sources }], hubOrder: 'CuCuCuCu', progress: 0.6 };
    })()
  };
  function joinDemo(useBelt) {
    var jl = useBelt ? 'belt_join_l' : 'balancer_l', jr = useBelt ? 'belt_join_r' : 'balancer_r';
    var bld = [
      { t: 'extractor', x: 3, y: 5, r: 0 }, { t: 'belt', x: 3, y: 4, r: 0 }, { t: jr, x: 3, y: 3, r: 0 }, { t: 'belt', x: 3, y: 2, r: 0 }, { t: jl, x: 3, y: 1, r: 0 }, { t: 'belt', x: 3, y: 0, r: 0 },
      { t: 'extractor', x: 6, y: 3, r: 3 }, { t: 'belt', x: 5, y: 3, r: 3 }, { t: 'belt', x: 4, y: 3, r: 3 },
      { t: 'extractor', x: 0, y: 1, r: 1 }, { t: 'belt', x: 1, y: 1, r: 1 }, { t: 'belt', x: 2, y: 1, r: 1 }
    ];
    return {
      patches: [{ kind: 'CuCuCuCu', tiles: ellipseTiles(3.5, 5.9, 1.6, 0.9) }, { kind: 'SySySySy', tiles: ellipseTiles(6.6, 3.5, 0.9, 1.4) }, { kind: 'RbRbRbRb', tiles: ellipseTiles(0.4, 1.5, 0.9, 1.4) }],
      buildings: bld,
      flows: [{ merge: true, pts: [[3.5, 5.5], [3.5, -0.6]], gap: 0.82, sources: [
        { at: 0, feed: [[3.5, 5.5], [3.5, 5.5]], item: 'CuCuCuCu' },
        { at: 2, feed: [[6.5, 3.5], [3.5, 3.5]], item: 'SySySySy' },
        { at: 4, feed: [[0.5, 1.5], [3.5, 1.5]], item: 'RbRbRbRb' }] }]
    };
  }
  function patchBase(kind) { var tint = kind.length === 1 ? kind : kind[1]; return tint !== 'u' ? mix(COL[tint], '#ffffff', 0.62) : '#DCD8E6'; }
  function drawPatch(ctx, p, T, ox, oy, far) {
    var isCol = p.kind.length === 1, base = patchBase(p.kind);
    fillRegion(ctx, p.tiles, T, ox, oy, T * 0.4, base);
    if (far) return;
    p.tiles.forEach(function (t) {
      var x = ox + (t[0] + 0.5) * T, y = oy + (t[1] + 0.5) * T;
      ctx.save(); ctx.globalAlpha = 0.55;
      if (isCol) { ctx.beginPath(); ctx.arc(x, y, T * 0.16, 0, 7); ctx.fillStyle = COL[p.kind]; ctx.fill(); ctx.lineWidth = Math.max(1, T * 0.03); ctx.strokeStyle = INK; ctx.stroke(); }
      else drawShape(ctx, p.kind, x, y, T * 0.5);
      ctx.restore();
    });
  }
  // Rotate a local tile (lx,ly) of a w×h footprint by rot quarter turns clockwise.
  function mapTile(d, rot, lx, ly) {
    var w = d.w, h = d.h;
    return rot === 1 ? [h - 1 - ly, lx] : rot === 2 ? [w - 1 - lx, h - 1 - ly] : rot === 3 ? [ly, w - 1 - lx] : [lx, ly];
  }
  // Ports of a placed building: { tile: port tile (world), next: neighbour tile (world), rot: flow direction }.
  function portsOf(b) {
    var d = BLD[b.t], out = [];
    var add = function (rot, lx, ly, nx, ny, side) { var p = mapTile(d, rot, lx, ly), n = mapTile(d, rot, nx, ny); out.push({ tile: [b.x + p[0], b.y + p[1]], next: [b.x + n[0], b.y + n[1]], rot: rot, side: side }); };
    if (b.t === 'hub') { for (var e = 0; e < 4; e++) for (var c = 0; c < 4; c++) { var p = mapTile(d, e, c, 3), n = mapTile(d, e, c, 4); out.push({ tile: [b.x + p[0], b.y + p[1]], next: [b.x + n[0], b.y + n[1]], rot: e, side: 'in' }); } return out; }
    (d.ins || []).concat(d.cins || []).forEach(function (c) { add(b.r, c, d.h - 1, c, d.h, 'in'); });
    (d.outs || []).concat(d.couts || []).forEach(function (c) { add(b.r, c, 0, c, -1, 'out'); });
    if (d.sideOut) { var so = d.sideOut === 'L' ? 3 : 1, p2 = mapTile(d, b.r, 0, 0), n2 = mapTile(d, b.r, d.sideOut === 'L' ? -1 : 1, 0); out.push({ tile: [b.x + p2[0], b.y + p2[1]], next: [b.x + n2[0], b.y + n2[1]], rot: (b.r + so) & 3, side: 'out' }); }
    if (d.side) { var sr = d.side === 'L' ? 1 : 3, row = d.sideRow || 0, p = mapTile(d, b.r, 0, row), n = mapTile(d, b.r, d.side === 'L' ? -1 : 1, row); out.push({ tile: [b.x + p[0], b.y + p[1]], next: [b.x + n[0], b.y + n[1]], rot: (b.r + sr) & 3, side: 'in' }); }
    return out;
  }
  function drawWorld(ctx, W, H, T, L, ph, o) {
    o = o || {}; var far = T < 22, ox = o.ox || 0, oy = o.oy || 0;
    ctx.fillStyle = WORLD.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = WORLD.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (var x = ((ox % T) + T) % T; x < W; x += T) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (var y = ((oy % T) + T) % T; y < H; y += T) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    if (!far || T > 10) ctx.stroke();
    L.patches.forEach(function (p) { drawPatch(ctx, p, T, ox, oy, far); });
    var hubPulse = 0;
    var isBelt = function (b) { return b.t.indexOf('belt') === 0; };
    if (far) {
      L.buildings.forEach(function (b) {
        var d = BLD[b.t], bw = (b.r % 2 ? d.h : d.w) * T, bh = (b.r % 2 ? d.w : d.h) * T, bx = ox + b.x * T, by = oy + b.y * T;
        if (isBelt(b)) { ctx.fillStyle = WORLD.edge; var th = T * 0.4; if (b.r % 2) ctx.fillRect(bx, by + (T - th) / 2, T, th); else ctx.fillRect(bx + (T - th) / 2, by, th, T); }
        else { ctx.fillStyle = CAT[d.cat]; ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2); }
      });
    } else {
      var patchAt = {}; L.patches.forEach(function (p) { p.tiles.forEach(function (t) { patchAt[t[0] + ',' + t[1]] = p.kind; }); });
      // underground link between a tunnel entrance and the exit ahead of it
      L.buildings.concat(L.ghosts || []).forEach(function (b) {
        if (!/^tunnel2?_in$/.test(b.t)) return; var dx = [0, 1, 0, -1][b.r], dy = [-1, 0, 1, 0][b.r], outT = b.t.replace('_in', '_out'), reach = b.t === 'tunnel2_in' ? 9 : 5;
        for (var k = 2; k <= reach; k++) { var hit = L.buildings.concat(L.ghosts || []).filter(function (q) { return q.t === outT && q.r === b.r && q.x === b.x + dx * k && q.y === b.y + dy * k; })[0];
          if (hit) { ctx.save(); ctx.setLineDash([T * 0.12, T * 0.14]); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(35,33,58,.28)'; ctx.lineWidth = T * 0.1;
            ctx.beginPath(); ctx.moveTo(ox + (b.x + 0.5 + dx * 0.4) * T, oy + (b.y + 0.5 + dy * 0.4) * T); ctx.lineTo(ox + (hit.x + 0.5 - dx * 0.4) * T, oy + (hit.y + 0.5 - dy * 0.4) * T); ctx.stroke(); ctx.restore(); break; } }
      });
      var beltAt = {};
      // 1. belts
      L.buildings.forEach(function (b) { if (!isBelt(b)) return; beltAt[b.x + ',' + b.y] = b; drawBuilding(ctx, b.t, b.r, T, { x: ox + b.x * T, y: oy + b.y * T, phase: ph }); });
      // 2. a belt runs on under any building it connects to
      var stubs = {};
      L.buildings.forEach(function (b) {
        if (isBelt(b)) return;
        portsOf(b).forEach(function (p) {
          if (!beltAt[p.next[0] + ',' + p.next[1]]) return;
          var k = p.tile[0] + ',' + p.tile[1] + ',' + p.rot, st = stubs[k] || (stubs[k] = { x: p.tile[0], y: p.tile[1], rot: p.rot });
          st[p.side] = true;
        });
      });
      Object.keys(stubs).forEach(function (k) {
        var st = stubs[k], X = ox + st.x * T, Y = oy + st.y * T;
        ctx.save();
        if (!(st.in && st.out)) {
          // local frame: flow is up, so 'in' is the bottom half and 'out' the top half; map to world by rot
          var a = 0.45 * T, f = 0.55 * T, r = st.rot, inSide = !!st.in;
          var rect = r === 0 ? (inSide ? [0, a, T, f] : [0, 0, T, f])
                   : r === 1 ? (inSide ? [0, 0, f, T] : [a, 0, f, T])
                   : r === 2 ? (inSide ? [0, 0, T, f] : [0, a, T, f])
                   : (inSide ? [a, 0, f, T] : [0, 0, f, T]);
          ctx.beginPath(); ctx.rect(X + rect[0], Y + rect[1], rect[2], rect[3]); ctx.clip();
        }
        drawBuilding(ctx, 'belt', st.rot, T, { x: X, y: Y, phase: ph });
        ctx.restore();
      });
      // 3. items
      var plen = function (P) { var t = 0; for (var q = 1; q < P.length; q++) t += Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]); return t; };
      var pat = function (P, d) { for (var q = 1; q < P.length; q++) { var l = Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]); if (d <= l || q === P.length - 1) { var t = l ? Math.min(1, d / l) : 0; return [P[q - 1][0] + (P[q][0] - P[q - 1][0]) * t, P[q - 1][1] + (P[q][1] - P[q - 1][1]) * t]; } d -= l; } return P[0]; };
      var item = function (code, p) { drawShape(ctx, code, ox + p[0] * T, oy + p[1] * T, T * 0.56); };
      L.flows.forEach(function (f) {
        if (!f.merge) return;
        var total = plen(f.pts), ns = f.sources.length, slots = Math.ceil((total + 2) / (f.gap * ns)) * ns, C = slots * f.gap;
        for (var k = 0; k < slots; k++) {
          var src = f.sources[k % ns], v = ((k * f.gap + ph) % C + C) % C, fl = plen(src.feed);
          if (f.toHub && v >= total && v < total + 0.25) hubPulse = Math.max(hubPulse, 0.6 * (1 - (v - total) / 0.25));
          if (v < src.at - fl || v > total) continue;
          item(src.item, v < src.at ? pat(src.feed, v - (src.at - fl)) : pat(f.pts, v));
        }
      });
      L.flows.forEach(function (f) {
        if (f.merge) return;
        var P = f.pts, segs = [], total = 0;
        for (var q = 1; q < P.length; q++) { var l = Math.hypot(P[q][0] - P[q - 1][0], P[q][1] - P[q - 1][1]); segs.push(l); total += l; }
        var n = Math.floor(total / f.gap) + 1, cyc = (n + 1) * f.gap;
        for (var k = 0; k <= n; k++) {
          var s2 = f.stopped ? total - k * f.gap - 0.15 : f.loop ? (((k * f.gap + ph + (f.off || 0)) % cyc) + cyc) % cyc : (k * f.gap + (ph % f.gap));
          if (f.toHub && s2 >= total && s2 < total + 0.25) hubPulse = Math.max(hubPulse, 0.6 * (1 - (s2 - total) / 0.25));
          if (s2 < 0 || s2 > total || (f.hide && s2 > f.hide[0] && s2 < f.hide[1])) continue;
          var rem = s2, si = 0; while (si < segs.length - 1 && rem > segs[si]) { rem -= segs[si]; si++; }
          var t = segs[si] ? rem / segs[si] : 0, A = P[si], B = P[si + 1];
          drawShape(ctx, f.items ? f.items[k % f.items.length] : f.item, ox + (A[0] + (B[0] - A[0]) * t) * T, oy + (A[1] + (B[1] - A[1]) * t) * T, T * 0.56);
        }
      });
      // 4. buildings on top
      L.buildings.forEach(function (b) { if (isBelt(b) || b.t === 'hub') return; drawBuilding(ctx, b.t, b.r, T, { x: ox + b.x * T, y: oy + b.y * T, phase: ph, working: b.working, item: b.t.indexOf('extractor') === 0 ? patchAt[b.x + ',' + b.y] : undefined, well: b.t.indexOf('extractor') === 0 ? (patchAt[b.x + ',' + b.y] ? patchBase(patchAt[b.x + ',' + b.y]) : WORLD.bg) : undefined }); });
    }
    L.buildings.forEach(function (b) {
      if (b.t !== 'hub') return;
      if (far) { ctx.fillStyle = CAT.hub; ctx.fillRect(ox + b.x * T, oy + b.y * T, 4 * T, 4 * T); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(ox + b.x * T, oy + b.y * T, 4 * T, 4 * T); return; }
      drawBuilding(ctx, 'hub', 0, T, { x: ox + b.x * T, y: oy + b.y * T, phase: ph, pulse: hubPulse, hubFace: o.hubFace, order: L.hubOrder, progress: L.progress, count: o.count });
    });
    if (!far && L.ghosts && o.ghost !== false) {
      L.ghosts.forEach(function (g, i) {
        var gx = ox + g.x * T, gy = oy + g.y * T;
        ctx.save(); ctx.fillStyle = 'rgba(108,92,231,.14)'; ctx.fillRect(gx + 2, gy + 2, T - 4, T - 4); ctx.restore();
        drawBuilding(ctx, g.t, g.r, T, { x: gx, y: gy, phase: ph, mode: 'ghost' });
      });
      var fx = ox + L.finger[0] * T, fy = oy + L.finger[1] * T;
      ctx.beginPath(); ctx.arc(fx, fy, T * 0.62, 0, 7); ctx.strokeStyle = WORLD.accent; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /* ---------- Animation ticker (~30fps, shared) ---------- */
  var anims = new Set(), running = false, last = 0;
  function tick(t) { if (!anims.size) { running = false; return; } if (t - last > 33) { last = t; anims.forEach(function (el) { el.frame(t / 1000); }); } requestAnimationFrame(tick); }
  function addAnim(el) { anims.add(el); if (!running) { running = true; requestAnimationFrame(tick); } }
  var live = new Set();

  function Base() { return Reflect.construct(HTMLElement, [], new.target); }
  function define(tag, attrs, init) {
    if (customElements.get(tag)) return;
    class E extends HTMLElement {
      static get observedAttributes() { return attrs; }
      connectedCallback() {
        if (!this._c) { this._c = document.createElement('canvas'); this._c.style.display = 'block'; this.appendChild(this._c); }
        this.style.display = 'inline-block'; this.style.lineHeight = '0'; this.style.verticalAlign = 'middle';
        live.add(this); this._t = 0; this.draw();
        if (this.hasAttribute('animate')) addAnim(this); else anims.delete(this);
      }
      disconnectedCallback() { live.delete(this); anims.delete(this); }
      attributeChangedCallback() { if (this._c && this.isConnected) { this.draw(); if (this.hasAttribute('animate')) addAnim(this); else anims.delete(this); } }
      frame(t) { this._t = t; this.draw(); }
      num(n, d) { var v = parseFloat(this.getAttribute(n)); return isNaN(v) ? d : v; }
      draw() { init.call(this); }
    }
    customElements.define(tag, E);
  }
  define('shape-glyph', ['code', 'size', 'empties'], function () {
    var s = this.num('size', 48), pad = Math.ceil(s * 0.12), Wd = s + pad * 2, c = this._c;
    this.style.width = this.style.height = s + 'px'; c.style.margin = (-pad) + 'px';
    var ctx = setup(c, Wd, Wd);
    drawShape(ctx, this.getAttribute('code') || '', Wd / 2, Wd / 2, s, { empties: this.hasAttribute('empties') });
  });
  define('building-sprite', ['type', 'rot', 'tile', 'mode', 'paint', 'hubface', 'order', 'progress', 'animate', 'item'], function () {
    var type = BLD[this.getAttribute('type')] ? this.getAttribute('type') : 'belt', d = BLD[type], T = this.num('tile', 48), rot = this.num('rot', 0) & 3;
    var RW = (rot % 2 ? d.h : d.w) * T, RH = (rot % 2 ? d.w : d.h) * T, pad = Math.round(T * 0.12), c = this._c;
    this.style.width = RW + 'px'; this.style.height = RH + 'px'; c.style.margin = (-pad) + 'px';
    var ctx = setup(c, RW + pad * 2, RH + pad * 2);
    drawBuilding(ctx, type, rot, T, { x: pad, y: pad, phase: this._t, item: this.getAttribute('item') || undefined, mode: this.getAttribute('mode'), paint: this.getAttribute('paint'), working: this.hasAttribute('animate') ? true : undefined,
      hubFace: this.getAttribute('hubface') === '1', order: this.getAttribute('order'), progress: this.num('progress', 0), pulse: this.hasAttribute('animate') && type === 'hub' ? Math.max(0, Math.sin(this._t * 1.2)) : 0 });
  });
  define('building-icon', ['type', 'size', 'animate'], function () {
    var s = this.num('size', 52), pad = Math.round(s * 0.06), c = this._c;
    this.style.width = this.style.height = s + 'px'; c.style.margin = (-pad) + 'px';
    var ctx = setup(c, s + pad * 2, s + pad * 2); ctx.translate(pad, pad);
    drawIcon(ctx, BLD[this.getAttribute('type')] ? this.getAttribute('type') : 'belt', s, { phase: this._t });
  });
  define('factory-view', ['width', 'height', 'tile', 'hubface', 'ox', 'oy', 'ghost', 'animate', 'layout', 'order', 'progress', 'count'], function () {
    var W = this.num('width', 1333), H = this.num('height', 690), T = this.num('tile', 48), c = this._c;
    this.style.width = W + 'px'; this.style.height = H + 'px';
    var ctx = c.__ctx && c.__w === W && c.__h === H ? c.__ctx : (c.__ctx = setup(c, W, H), c.__w = W, c.__h = H, c.__ctx);
    ctx.setTransform(ctx.__dpr, 0, 0, ctx.__dpr, 0, 0);
    var LL = LAYOUTS[this.getAttribute('layout')] || STARTER; if (this.getAttribute('order')) LL = Object.assign({}, LL, { hubOrder: this.getAttribute('order'), progress: this.num('progress', LL.progress || 0) });
    drawWorld(ctx, W, H, T, LL, this._t * 1.0, { hubFace: this.getAttribute('hubface') === '1', ox: this.num('ox', 0), oy: this.num('oy', 0), ghost: this.getAttribute('ghost') !== 'off', count: this.getAttribute('count') || '' });
  });

  define('belt-strip', ['width', 'tile', 'items', 'gap', 'animate'], function () {
    var W = this.num('width', 800), T = this.num('tile', 48), c = this._c;
    this.style.width = W + 'px'; this.style.height = T + 'px';
    var ctx = c.__ctx && c.__w === W ? c.__ctx : (c.__ctx = setup(c, W, T), c.__w = W, c.__ctx);
    ctx.setTransform(ctx.__dpr, 0, 0, ctx.__dpr, 0, 0); ctx.clearRect(0, 0, W, T);
    var ph = this._t * 0.9, n = Math.ceil(W / T), items = (this.getAttribute('items') || 'CuCuCuCu').split(','), gap = this.num('gap', 1.6), cnt = Math.ceil(W / T / gap) + 1;
    for (var i = 0; i < n; i++) drawBuilding(ctx, 'belt', 1, T, { x: i * T, y: 0, phase: ph });
    for (var k = 0; k < cnt; k++) { var px = ((k * gap + ph) % (cnt * gap)) * T - T * 0.5; drawShape(ctx, items[k % items.length], px, T / 2, T * 0.56); }
  });
  // Quarter picker for the Filter: the shape with selected quarters flashing (on/off every half second); others dimmed.
  // Quarter picker for the Filter: the shape as-is, with selected quarters marked by a gently pulsing box.
  define('quarter-pick', ['code', 'sel', 'size', 'animate'], function () {
    var S = this.num('size', 200), pad = Math.ceil(S * 0.08), W = S + pad * 2, c = this._c;
    this.style.width = this.style.height = S + 'px'; c.style.margin = (-pad) + 'px';
    var ctx = setup(c, W, W), code = this.getAttribute('code') || '--------', sel = this.getAttribute('sel') || '1111', cx = W / 2, cy = W / 2;
    drawShape(ctx, code, cx, cy, S * 0.9);
    for (var e = 0; e < 4; e++) if (sel[e] === '1' && code.substr(e * 2, 2) === '--') emptyMark(ctx, e, cx, cy, S * 0.9 * 0.41, Math.max(1.5, S * 0.9 * 0.055));
    var pulse = 0.5 + 0.5 * Math.sin(this._t * 3);
    for (var k = 0; k < 4; k++) {
      if (sel[k] !== '1') continue;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * Math.PI / 2);
      rrect(ctx, S * 0.015, -S * 0.47, S * 0.455, S * 0.455, S * 0.07);
      ctx.fillStyle = 'rgba(108,92,231,' + (0.06 + 0.12 * pulse).toFixed(3) + ')'; ctx.fill();
      ctx.globalAlpha = 0.45 + 0.55 * pulse; ctx.lineWidth = Math.max(3, S * 0.02); ctx.strokeStyle = WORLD.accent; ctx.stroke(); ctx.restore();
    }
  });
  // ---- Working demos: a building at rot 1 (flow left → right) with belts on every port and real items going through it.
  var DEMO_IO = {
    splitter: { ins: [['CuCuCuCu']], outs: [{ items: ['CuCuCuCu'], gap: 1.6 }, { items: ['CuCuCuCu'], gap: 1.6, off: 0.8 }] },
    balancer_l: { ins: [['CrCrCrCr'], ['SbSbSbSb']], outs: [['CrCrCrCr', 'SbSbSbSb']] },
    balancer_r: { ins: [['CrCrCrCr'], ['SbSbSbSb']], outs: [['CrCrCrCr', 'SbSbSbSb']] },
    split_l: { ins: [['CrCrCrCr', 'SbSbSbSb']], outs: [{ items: ['CrCrCrCr'], gap: 1.6 }, { items: ['SbSbSbSb'], gap: 1.6, off: 0.8 }] },
    split_r: { ins: [['CrCrCrCr', 'SbSbSbSb']], outs: [{ items: ['CrCrCrCr'], gap: 1.6 }, { items: ['SbSbSbSb'], gap: 1.6, off: 0.8 }] },
    balancer: { ins: [['CrCrCrCr'], ['SbSbSbSb']], outs: [['CrCrCrCr', 'SbSbSbSb'], ['SbSbSbSb', 'CrCrCrCr']] },
    cutter: { ins: [['CuCuCuCu']], outs: [['----CuCu'], ['CuCu----']] },
    quad: { ins: [['CuCuCuCu']], outs: [['------Cu'], ['Cu------'], ['--Cu----'], ['----Cu--']] }, // TL, TR, BR, BL
    rotator: { ins: [['RgRg----']], outs: [['--RgRg--']] },
    rotator_ccw: { ins: [['RgRg----']], outs: [['Rg----Rg']] },
    rotator_180: { ins: [['RgRg----']], outs: [['----RgRg']] },
    combiner: { ins: [['CuCu----'], ['----RbRb']], outs: [['CuCuRbRb']] },
    quad_combiner: { ins: [['------Ry'], ['Cr------'], ['--Sg----'], ['----Wb--']], outs: [['CrSgWbRy']] }, // TL, TR, BR, BL
    painter: { ins: [['SuSuSuSu'], ['r']], outs: [['SrSrSrSr']] },
    quad_painter: { ins: [['r'], ['g'], ['b'], ['y'], ['CuCuCuCu']], outs: [['CgCbCyCr']] }, // red TL, green TR, blue BR, yellow BL
    mixer: { ins: [['r'], ['g']], outs: [['y']] },
    mixer_w: { ins: [['r'], ['g'], ['b']], outs: [['w']] },
    filter: { ins: [['CuCuCuCu', 'RuRuRuRu']], outs: [{ items: ['CuCuCuCu'], gap: 1.6 }] },
    bin: { ins: [['CuCuCuCu', 'SyRy----']], outs: [] },
    meter: { ins: [['CuCuCuCu', 'RgRgRgRg']], outs: [['CuCuCuCu', 'RgRgRgRg']] }
  };
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  // Demo scene: building at rot 0 (flow bottom → top), centred in a BW×BH px box; every port's belt runs out to the box edge.
  function makeDemo(type, BW, BH, T) {
    var GAP = 0.8, flows = [], bld = [], patches = [], d = BLD[type], base;
    var add = function (t, x, y, r, extra) { var o = { t: t, x: x, y: y, r: r }; if (extra) for (var k in extra) o[k] = extra[k]; bld.push(o); };
    // base scene in tile coords (0..W-1, 0..H-1) + list of belt ends to extend: {x,y,dir,io,items,gap,off,hide}
    var ends = [], W, H;
    if (type === 'belt' || type.indexOf('belt_') === 0) { W = 1; H = 1; add('belt', 0, 0, 0); ends.push({ x: 0, y: 0, dir: 0, io: 'thru', items: ['CrCrCrCr', 'SbSbSbSb', 'RyRyRyRy'] }); }
    else if (/^(tunnel|teleport)/.test(type)) {
      var tn = type.indexOf('teleport') === 0 ? 'teleport' : type.indexOf('tunnel2') === 0 ? 'tunnel2' : 'tunnel';
      W = 3; H = 3; add(tn + '_in', 1, 2, 0); add(tn + '_out', 1, 0, 0); add('belt', 0, 1, 1); add('belt', 1, 1, 1); add('belt', 2, 1, 1);
      ends.push({ x: 1, y: 2, dir: 0, io: 'tunnel', items: ['CrCrCrCr', 'SbSbSbSb'] }); ends.push({ x: 0, y: 1, dir: 1, io: 'cross', items: ['WyWyWyWy'], gap: 1 });
    } else if (type === 'bin') {
      W = 1; H = 2; add('bin', 0, 0, 0); add('belt', 0, 1, 0);
      ends.push({ x: 0, y: 1, tx: 0, ty: 0, dir: 0, io: 'in', items: ['CuCuCuCu', 'SyRy----'] });
    } else if (type === 'extractor' || type === 'extractor2') {
      var two = type === 'extractor2'; W = 3; H = two ? 2 : 1;
      for (var py = 0; py < H; py++) add(type, 1, py, 0);
      ends.push({ x: 1, y: 0, dir: 0, io: 'dig', items: ['CuCuCuCu'], gap: two ? GAP : GAP * 2, from: H - 0.5 });
      patches.push({ kind: 'CuCuCuCu', tiles: [] }); // filled after we know the box
    } else if (d) {
      var P = [];
      (d.ins || []).concat(d.cins || []).forEach(function (c) { P.push({ io: 'in', t: [c, d.h - 1], n: [c, d.h], rot: 0 }); });
      (d.outs || []).concat(d.couts || []).forEach(function (c) { P.push({ io: 'out', t: [c, 0], n: [c, -1], rot: 0 }); });
      if (d.side) { var row = d.sideRow || 0, L = d.side === 'L'; P.push({ io: 'in', t: [0, row], n: [L ? -1 : 1, row], rot: L ? 1 : 3 }); }
      if (d.sideOut) { var L2 = d.sideOut === 'L'; P.push({ io: 'out', t: [0, 0], n: [L2 ? -1 : 1, 0], rot: L2 ? 3 : 1 }); }
      var xs = [0, d.w - 1], ys = [0, d.h - 1]; P.forEach(function (p) { xs.push(p.n[0]); ys.push(p.n[1]); });
      var mx = Math.min.apply(null, xs), my = Math.min.apply(null, ys); W = Math.max.apply(null, xs) - mx + 1; H = Math.max.apply(null, ys) - my + 1;
      add(type, -mx, -my, 0, { working: true });
      var io = DEMO_IO[type] || { ins: [], outs: [] }, ii = 0, oi = 0;
      P.forEach(function (p) {
        var spec = p.io === 'in' ? io.ins[ii++] : io.outs[oi++];
        add('belt', p.n[0] - mx, p.n[1] - my, p.rot);
        ends.push({ x: p.n[0] - mx, y: p.n[1] - my, tx: p.t[0] - mx, ty: p.t[1] - my, dir: p.rot, io: p.io, items: spec ? (Array.isArray(spec) ? spec : spec.items) : null, gap: spec && spec.gap, off: spec && spec.off });
      });
    } else { W = 1; H = 1; }
    var ox = Math.round((BW - W * T) / 2), oy = Math.round((BH - H * T) / 2);
    var X0 = Math.floor(-ox / T), X1 = Math.ceil((BW - ox) / T) - 1, Y0 = Math.floor(-oy / T), Y1 = Math.ceil((BH - oy) / T) - 1;
    var inBox = function (x, y) { return x >= X0 && x <= X1 && y >= Y0 && y <= Y1; };
    var edge = function (cx, cy, dv, fwd) { var s = fwd ? 1 : -1, ex = dv[0] * s, ey = dv[1] * s;
      return ex > 0 ? [(BW - ox) / T, cy] : ex < 0 ? [-ox / T, cy] : ey > 0 ? [cx, (BH - oy) / T] : [cx, -oy / T]; };
    var extend = function (x, y, dir, fwd) { var dv = DIRS[dir], s = fwd ? 1 : -1; for (var k = 1; k < 40; k++) { var nx = x + dv[0] * k * s, ny = y + dv[1] * k * s; if (!inBox(nx, ny)) break; add('belt', nx, ny, dir); } };
    ends.forEach(function (e) {
      var dv = DIRS[e.dir], c = [e.x + 0.5, e.y + 0.5], it = e.items, g = e.gap || GAP;
      if (e.io === 'in') { extend(e.x, e.y, e.dir, false); if (it) flows.push({ pts: [edge(c[0], c[1], dv, false), [e.tx + 0.5, e.ty + 0.5]], items: it, gap: g, off: e.off || 0, loop: true }); }
      else if (e.io === 'out') { extend(e.x, e.y, e.dir, true); if (it) flows.push({ pts: [[e.tx + 0.5, e.ty + 0.5], edge(c[0], c[1], dv, true)], items: it, gap: g, off: e.off || 0, loop: true }); }
      else if (e.io === 'thru' || e.io === 'cross') { extend(e.x, e.y, e.dir, false); extend(e.x, e.y, e.dir, true); flows.push({ pts: [edge(c[0], c[1], dv, false), edge(c[0], c[1], dv, true)], items: it, gap: g, loop: true }); }
      else if (e.io === 'tunnel') { extend(1, 2, 0, false); extend(1, 0, 0, true); var A = edge(1.5, 2.5, dv, false), B = edge(1.5, 0.5, dv, true); flows.push({ pts: [A, B], items: it, gap: g, loop: true, hide: [A[1] - 2.5, A[1] - 0.5] }); }
      else if (e.io === 'dig') { extend(e.x, e.y, 0, true); flows.push({ pts: [[e.x + 0.5, e.from], edge(1.5, 0.5, dv, true)], items: it, gap: g, loop: true }); }
    });
    if (patches.length) { for (var px = X0; px <= X1; px++) for (var qy = 0; qy <= Y1; qy++) patches[0].tiles.push([px, qy]); }
    return { patches: patches, buildings: bld, flows: flows, ox: ox, oy: oy };
  }
  define('building-demo', ['type', 'tile', 'width', 'height', 'animate'], function () {
    var T = this.num('tile', 26), type = this.getAttribute('type') || 'belt', BW = this.num('width', 132), BH = this.num('height', 132), key = type + BW + 'x' + BH + '@' + T;
    if (this._key !== key) { this._key = key; this._L = makeDemo(type, BW, BH, T); }
    var L = this._L, c = this._c;
    this.style.width = BW + 'px'; this.style.height = BH + 'px';
    var ctx = setup(c, BW, BH);
    drawWorld(ctx, BW, BH, T, L, this._t, { ghost: false, ox: L.ox, oy: L.oy });
  });
  window.ShapesKit = { INK: INK, COL: COL, COL_NAME: COL_NAME, CAT: CAT, WORLD: WORLD, BLD: BLD, parse: parse, drawShape: drawShape, drawBuilding: drawBuilding, meterBox: meterBox, drawIcon: drawIcon, drawWorld: drawWorld, fillRegion: fillRegion, portsOf: portsOf, STARTER: STARTER, LAYOUTS: LAYOUTS, makeDemo: makeDemo };
})();
