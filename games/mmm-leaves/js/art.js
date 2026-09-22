/* mmm-leaves — art.js
   Every visual is drawn procedurally. No image files anywhere.
   This is the real module the game will use. */

var Art = (function () {
  'use strict';

  var C = {
    moss:      '#6f7d33',
    mossDeep:  '#4f5a24',
    board:     '#b9c3ae',
    boardDark: '#a7b29c',
    cream:     '#f7f4e6',
    grass:     '#5fb733',
    grassDeep: '#47962a',
    leaf:      '#3fbf4a',
    leafDeep:  '#1f8c33',
    nut:       '#f9a01b',
    nutDeep:   '#c9700a',
    nutCap:    '#8a5a22',
    blossom:   '#ff4fa3',
    blossomDp: '#d61f77',
    wild:      '#39b6e8',
    wildDeep:  '#1a86b8',
    bark:      '#ffffff',
    ink:       '#2b2b22',
    gold:      '#ffd32a'
  };

  /* deterministic noise so the bark looks the same every frame */
  function rnd(seed) {
    var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ---------- background: bark ---------- */

  function bark(ctx, x, y, w, h, seed) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = C.board; ctx.fillRect(x, y, w, h);

    // soft irregular patches, like weathered bark
    ctx.fillStyle = C.boardDark;
    for (var i = 0; i < 11; i++) {
      var cx = x + rnd(seed + i * 3.1) * w;
      var cy = y + rnd(seed + i * 7.7) * h;
      var r  = 26 + rnd(seed + i * 11.3) * 72;
      ctx.globalAlpha = 0.16 + rnd(seed + i * 5.5) * 0.12;
      ctx.beginPath();
      for (var a = 0; a <= 12; a++) {
        var t  = (a / 12) * Math.PI * 2;
        var rr = r * (0.72 + rnd(seed + i * 17 + a) * 0.5);
        var px = cx + Math.cos(t) * rr, py = cy + Math.sin(t) * rr * 0.74;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }

    // vertical grain
    ctx.globalAlpha = 0.04; ctx.strokeStyle = C.mossDeep; ctx.lineWidth = 1;
    for (var g = 0; g < 26; g++) {
      var gx = x + rnd(seed + g * 2.3) * w;
      ctx.beginPath(); ctx.moveTo(gx, y);
      for (var s = 0; s <= h; s += 24) ctx.lineTo(gx + Math.sin((s + g * 40) * 0.02) * 6, y + s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- the scribbly trails between circles ---------- */

  function wavy(ctx, x1, y1, x2, y2, amp, seed, dashed) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    var nx = -dy / len, ny = dx / len;
    ctx.save();
    ctx.strokeStyle = C.bark;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dashed) { ctx.setLineDash([2.5, 7]); ctx.lineWidth = 3.4; ctx.globalAlpha = 0.85; }
    else        { ctx.lineWidth = 5.2; ctx.globalAlpha = 0.95; }
    ctx.beginPath();
    var steps = Math.max(10, Math.round(len / 5));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // wobble fades to zero at both ends so it lands cleanly on the circles
      var taper = Math.sin(t * Math.PI);
      var off = Math.sin(t * 9 + seed) * amp * taper + Math.sin(t * 21 + seed * 2.3) * amp * 0.4 * taper;
      var px = x1 + dx * t + nx * off, py = y1 + dy * t + ny * off;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Canvas centres text on the advance width and the baseline, which is not the
     middle of the mark you can see — swap the font and the glyph shifts. This
     measures the actual ink and centres that instead, so the wild's question
     mark sits in the middle of the droplet whatever face is loaded. */
  var inkCache = {};
  function inkCentre(ctx, text, font) {
    var key = font + '|' + text;
    if (inkCache[key]) return inkCache[key];
    // measureText reports the ink box relative to the CURRENT alignment anchor,
    // so it has to be measured under the same alignment it will be drawn with
    var pf = ctx.font, pa = ctx.textAlign, pb = ctx.textBaseline;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text);
    ctx.font = pf; ctx.textAlign = pa; ctx.textBaseline = pb;
    var o = { dx: 0, dy: 0 };
    if (m.actualBoundingBoxLeft !== undefined && m.actualBoundingBoxAscent !== undefined) {
      o.dx = -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      o.dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    }
    inkCache[key] = o;
    return o;
  }

  function centredGlyph(ctx, text, x, y, font, color) {
    var o = inkCentre(ctx, text, font);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + o.dx, y + o.dy);
  }

  /* ---------- food icons ---------- */

  function nut(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // body
    var g = ctx.createLinearGradient(-6, -4, 6, 8);
    g.addColorStop(0, C.nut); g.addColorStop(1, C.nutDeep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-7, 7, -7.5, -2, 0, -3);
    ctx.bezierCurveTo(7.5, -2, 7, 7, 0, 9);
    ctx.fill();
    // cap
    ctx.fillStyle = C.nutCap;
    ctx.beginPath();
    ctx.moveTo(-7, -2.5);
    ctx.bezierCurveTo(-7, -8, 7, -8, 7, -2.5);
    ctx.bezierCurveTo(4, -0.5, -4, -0.5, -7, -2.5);
    ctx.fill();
    // stalk
    ctx.strokeStyle = C.nutCap; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(0.6, -9.5); ctx.stroke();
    // highlight
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-2.4, 2.4, 1.5, 2.6, -0.3, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  function leaf(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || -0.35); ctx.scale(s, s);
    var g = ctx.createLinearGradient(-4, -9, 4, 9);
    g.addColorStop(0, C.leaf); g.addColorStop(1, C.leafDeep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.bezierCurveTo(5.5, -5, 5.5, 5, 0, 10);
    ctx.bezierCurveTo(-5.5, 5, -5.5, -5, 0, -10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -7.5); ctx.lineTo(0, 8); ctx.stroke();
    ctx.globalAlpha = 0.45;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * 3.2); ctx.lineTo(2.8, i * 3.2 + 2.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 3.2); ctx.lineTo(-2.8, i * 3.2 + 2.4); ctx.stroke();
    }
    ctx.restore();
  }

  function blossom(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // filaments — a gum blossom is a pompom of stamens
    ctx.strokeStyle = C.blossom; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (var i = 0; i < 11; i++) {
      var a = (i / 16) * Math.PI * 2 + 0.2;
      var r = 8.2 + (i % 3) * 1.0;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2.6, Math.sin(a) * 2.6);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
      ctx.fillStyle = i % 2 ? C.blossom : C.blossomDp;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5, 0, 6.3); ctx.fill();
    }
    ctx.fillStyle = C.blossomDp;
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffd9ec';
    ctx.beginPath(); ctx.arc(-0.9, -0.9, 1.3, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  /* The printed wild is a pale blue droplet with a question mark in it — far
     clearer at circle size than three shrunken food icons. */
  function wild(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var g = ctx.createLinearGradient(-8, -10, 8, 10);
    g.addColorStop(0, '#9ed9f7'); g.addColorStop(1, '#5cb6e8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-1.5, -11);
    ctx.bezierCurveTo(7, -8.5, 10, -1, 9, 3.5);
    ctx.bezierCurveTo(7.5, 9.5, 1, 11.5, -3, 10.5);
    ctx.bezierCurveTo(-9, 9, -11, 2.5, -9.5, -2.5);
    ctx.bezierCurveTo(-8, -7.5, -5, -10.5, -1.5, -11);
    ctx.fill();
    // 3px down in screen terms; the context is scaled by s, so divide it back out
    centredGlyph(ctx, '?', -0.4, 0.4 + 3 / s, '700 15px Atma, system-ui, sans-serif', '#1873b5');
    ctx.restore();
  }

  /* a board circle: white disc + food */
  function foodCircle(ctx, x, y, r, kind, count) {
    ctx.save();
    ctx.shadowColor = 'rgba(40,50,30,0.28)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,135,105,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r - 0.6, 0, 6.3); ctx.stroke();

    if (kind === 'wild') { wild(ctx, x, y, r / 12.5); return; }

    var draw = kind === 'nut' ? nut : kind === 'leaf' ? leaf : blossom;
    var s = r / 13;
    if (count === 1) {
      draw(ctx, x, y, s * 1.15, kind === 'leaf' ? -0.3 : 0);
    } else if (count === 2) {
      draw(ctx, x - r * 0.30, y, s * 0.92, kind === 'leaf' ? -0.5 : 0);
      draw(ctx, x + r * 0.30, y, s * 0.92, kind === 'leaf' ? 0.2 : 0);
    } else {
      draw(ctx, x - r * 0.34, y + r * 0.18, s * 0.78, kind === 'leaf' ? -0.7 : 0);
      draw(ctx, x + r * 0.34, y + r * 0.18, s * 0.78, kind === 'leaf' ? 0.35 : 0);
      draw(ctx, x, y - r * 0.32, s * 0.78, kind === 'leaf' ? -0.15 : 0);
    }
  }

  /* ---------- the moth larva ---------- */

  function moth(ctx, x, y, s, phase) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var p = phase || 0;
    // segmented body trailing to the left, undulating
    for (var i = 7; i >= 1; i--) {
      var bx = -i * 6.4;
      var by = Math.sin(p + i * 0.72) * 2.6;
      var rr = 5.6 - i * 0.30;
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ffe2ec';
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(200,170,180,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
      // little legs
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by + rr - 0.6); ctx.lineTo(bx - 1, by + rr + 2.4); ctx.stroke();
      // spot
      if (i % 2 === 0) {
        ctx.fillStyle = C.ink;
        ctx.beginPath(); ctx.arc(bx, by - 1.4, 1.0, 0, 6.3); ctx.fill();
      }
    }
    // head
    var hy = Math.sin(p) * 1.8;
    ctx.fillStyle = '#e8402c';
    ctx.beginPath(); ctx.arc(2, hy, 7.2, 0, 6.3); ctx.fill();
    // a small mouth, not a gaping lower half
    ctx.fillStyle = '#8f1f12';
    ctx.beginPath(); ctx.arc(2.6, hy + 3.6, 2.5, 0.12, Math.PI - 0.12); ctx.fill();
    // antennae
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0.4, hy - 5.6);
    ctx.quadraticCurveTo(-2.4, hy - 13, 1.2, hy - 15.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4.4, hy - 5.6);
    ctx.quadraticCurveTo(6.6, hy - 13.4, 10, hy - 14.4); ctx.stroke();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-0.4, hy - 0.8, 2.7, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(5.0, hy - 0.8, 2.7, 0, 6.3); ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(0.2, hy - 0.6, 1.5, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(5.6, hy - 0.6, 1.5, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  /* ---------- movement tile ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // dir: 'left','right','up','down','leftright','updown','dotted'
  function tile(ctx, x, y, w, h, dir, faceDown, hot) {
    ctx.save();
    ctx.shadowColor = 'rgba(30,40,20,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = faceDown ? C.mossDeep : C.cream;
    roundRect(ctx, x, y, w, h, 9); ctx.fill();
    ctx.restore();

    if (hot) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
      roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 8); ctx.stroke();
    } else {
      ctx.strokeStyle = faceDown ? '#3d461b' : 'rgba(111,125,51,0.5)'; ctx.lineWidth = 1.5;
      roundRect(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 8); ctx.stroke();
    }

    var cx = x + w / 2, cy = y + h / 2;

    if (faceDown) {
      // back of the tile: a small scribble mark
      ctx.strokeStyle = 'rgba(247,244,230,0.35)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i <= 20; i++) {
        var t = i / 20, px = x + 10 + t * (w - 20), py = cy + Math.sin(t * 8) * 9;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore && 0;
      return;
    }

    if (dir === 'dotted') {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.setLineDash([2.5, 6]);
      ctx.beginPath();
      for (var j = 0; j <= 24; j++) {
        var tt = j / 24, qx = x + 10 + tt * (w - 20), qy = cy + Math.sin(tt * 7 + 1) * 10;
        if (j === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(x + 10, cy + Math.sin(1) * 10, 4, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w - 10, cy + Math.sin(8) * 10, 4, 0, 6.3); ctx.fill();
      return;
    }

    var horiz = dir === 'left' || dir === 'right' || dir === 'leftright';
    var both  = dir === 'leftright' || dir === 'updown';
    var L = Math.min(w, h) * 0.40;

    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    if (horiz) { ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy); }
    else       { ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy + L); }
    ctx.stroke();

    // the black dots at the ends, like the printed tiles
    ctx.fillStyle = C.ink;
    function dot(dx2, dy2) { ctx.beginPath(); ctx.arc(cx + dx2, cy + dy2, 5, 0, 6.3); ctx.fill(); }
    function head(dx2, dy2, ax, ay) {
      ctx.beginPath();
      ctx.moveTo(cx + dx2, cy + dy2);
      ctx.lineTo(cx + dx2 - ax + ay * 0.62, cy + dy2 - ay - ax * 0.62);
      ctx.lineTo(cx + dx2 - ax - ay * 0.62, cy + dy2 - ay + ax * 0.62);
      ctx.closePath(); ctx.fill();
    }
    if (horiz) {
      if (dir === 'right' || both) head(L, 0, 9, 0); else dot(L, 0);
      if (dir === 'left'  || both) head(-L, 0, -9, 0); else dot(-L, 0);
    } else {
      if (dir === 'down' || both) head(0, L, 0, 9); else dot(0, L);
      if (dir === 'up'   || both) head(0, -L, 0, -9); else dot(0, -L);
    }
  }

  /* ---------- grass strip ---------- */

  /* The jagged edge is generated in fixed-width steps, so it used to overshoot
     the right edge and stop dead on the left. Start it early and finish it late
     so it runs off both sides of the frame. */
  function grass(ctx, x, y, w, h) {
    var over = 14;
    x -= over; w += over * 2;
    ctx.save();
    ctx.fillStyle = C.grassDeep;
    ctx.beginPath(); ctx.moveTo(x, y + 10);
    for (var i = 0; i <= w; i += 11) {
      ctx.lineTo(x + i + 5.5, y + 10 - (5 + rnd(i * 1.7) * 13));
      ctx.lineTo(x + i + 11, y + 10);
    }
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();

    ctx.fillStyle = C.grass;
    ctx.beginPath(); ctx.moveTo(x, y + 16);
    for (var j = 0; j <= w; j += 9) {
      ctx.lineTo(x + j + 4.5, y + 16 - (3 + rnd(j * 3.3 + 9) * 10));
      ctx.lineTo(x + j + 9, y + 16);
    }
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------- paper label (the white blobby labels in the book) ---------- */

  function label(ctx, x, y, w, h, text, fill, textColor) {
    ctx.save();
    ctx.fillStyle = fill || '#fff';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 1.5);
    ctx.bezierCurveTo(x + w * 0.4, y - 2.5, x + w * 0.7, y + 3.5, x + w - 8, y + 1);
    ctx.quadraticCurveTo(x + w + 3, y + h / 2, x + w - 7, y + h - 1.5);
    ctx.bezierCurveTo(x + w * 0.66, y + h + 3, x + w * 0.3, y + h - 3.5, x + 7, y + h - 1);
    ctx.quadraticCurveTo(x - 3, y + h / 2, x + 8, y + 1.5);
    ctx.fill();
    if (text) {
      ctx.fillStyle = textColor || C.mossDeep;
      ctx.font = 'bold ' + Math.round(h * 0.46) + 'px Atma, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
    }
    ctx.restore();
  }

  return {
    C: C, rnd: rnd, bark: bark, wavy: wavy,
    nut: nut, leaf: leaf, blossom: blossom, wild: wild,
    foodCircle: foodCircle, moth: moth, tile: tile,
    grass: grass, label: label, roundRect: roundRect,
    centredGlyph: centredGlyph
  };
})();

/* ---------- extensions used by the game itself ---------- */

/* The polyline for a scribbly trail. The wobble tapers to nothing at both ends
   so the line lands cleanly on a circle instead of overshooting it. Returned as
   points because the moth walks the same path it draws. */

/* Both path builders step by parameter, so a wavy stretch packs more length into
   the same step and the moth speeds up over the wobbles. Resampling to even
   spacing means the easing curve is the only thing shaping the speed. */
/* Corner-cutting. Each pass replaces a corner with two points a quarter in from
   it, so the result can only move INWARD — which is what makes it safe to run a
   trail down a corridor and then smooth it: it cannot bulge back out into a
   circle it was routed around. */
Art.chaikin = function (pts, iters) {
  var out = pts;
  for (var k = 0; k < (iters || 2); k++) {
    var next = [out[0]];
    for (var i = 0; i < out.length - 1; i++) {
      var a = out[i], b = out[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
};

/* A light hand-drawn wobble, small enough not to eat the clearance the route
   was chosen for. Both ends are pinned. */
Art.wobble = function (pts, amp, seed) {
  var n = pts.length, out = [];
  for (var i = 0; i < n; i++) {
    var t = i / (n - 1);
    var taper = Math.sin(t * Math.PI);
    var prev = pts[Math.max(0, i - 1)], nxt = pts[Math.min(n - 1, i + 1)];
    var dx = nxt.x - prev.x, dy = nxt.y - prev.y, len = Math.hypot(dx, dy) || 1;
    var off = Math.sin(t * 13 + seed) * amp * taper;
    out.push({ x: pts[i].x + (-dy / len) * off, y: pts[i].y + (dx / len) * off });
  }
  return out;
};

Art.evenly = function (pts, count) {
  if (!pts || pts.length < 3) return pts;
  var cum = [0], total = 0, i;
  for (i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    cum.push(total);
  }
  if (total <= 0) return pts;
  count = count || pts.length;
  var out = [], j = 1;
  for (i = 0; i <= count; i++) {
    var want = (i / count) * total;
    while (j < cum.length - 1 && cum[j] < want) j++;
    var span = cum[j] - cum[j - 1] || 1;
    var t = (want - cum[j - 1]) / span;
    out.push({ x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
               y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t });
  }
  return out;
};

Art.path = function (x1, y1, x2, y2, amp, seed, steps) {
  var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  var nx = -dy / len, ny = dx / len;
  steps = steps || Math.max(14, Math.round(len / 5));
  var pts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i / steps, taper = Math.sin(t * Math.PI);
    var off = Math.sin(t * 9 + seed) * amp * taper +
              Math.sin(t * 21 + seed * 2.3) * amp * 0.4 * taper;
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
  }
  return Art.evenly(pts);
};

/* Dotted trails join circles that are NOT neighbours, so a straight line would
   run through whatever sits between them. This arcs clear and wanders on the way,
   the way the printed trails do. */
Art.trail = function (x1, y1, x2, y2, seed, bow, steps) {
  var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  var nx = -dy / len, ny = dx / len;
  steps = steps || Math.max(26, Math.round(len / 5));
  var pts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i / steps, arc = Math.sin(t * Math.PI);
    var off = arc * (bow + Math.sin(t * 5.2 + seed) * bow * 0.42
                         + Math.sin(t * 11.7 + seed * 1.7) * bow * 0.16);
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
  }
  return Art.evenly(pts);
};

Art.strokePoints = function (ctx, pts, color, width, dash, upto) {
  if (!pts || pts.length < 2) return;
  var end = upto === undefined ? pts.length - 1 : Math.max(1, Math.floor(upto * (pts.length - 1)));
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
};

Art.pointAt = function (pts, t) {
  var f = Math.max(0, Math.min(1, t)) * (pts.length - 1);
  var i = Math.floor(f), j = Math.min(pts.length - 1, i + 1), k = f - i;
  var a = pts[i], b = pts[j];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k,
           ang: Math.atan2(b.y - a.y, b.x - a.x) };
};

/* An eaten circle: honey-filled chamber, ragged rim, food ghosted underneath. */
Art.eatenCircle = function (ctx, x, y, r, kind, count, seed, grow) {
  var g = grow === undefined ? 1 : grow;
  ctx.save();
  ctx.globalAlpha = 0.88 * g;
  ctx.fillStyle = '#ffcf5c';
  ctx.beginPath();
  for (var a = 0; a <= 16; a++) {
    var t = (a / 16) * Math.PI * 2;
    var rr = r * g * (0.90 + Art.rnd(seed + a) * 0.16);
    var px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e08c17'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  if (kind && kind !== 'nest' && g > 0.6) {
    ctx.save(); ctx.globalAlpha = 0.34;
    var fn = kind === 'nut' ? Art.nut : kind === 'leaf' ? Art.leaf
           : kind === 'blossom' ? Art.blossom : Art.wild;
    fn(ctx, x, y, (r / 16) * g, -0.3);
    ctx.restore();
  }

  if (g > 0.85) {
    ctx.save();
    ctx.strokeStyle = '#7a4d05'; ctx.lineWidth = 2.6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.34, y + r * 0.02);
    ctx.lineTo(x - r * 0.08, y + r * 0.30);
    ctx.lineTo(x + r * 0.38, y - r * 0.32);
    ctx.stroke(); ctx.restore();
  }
};

/* The nest at the centre of the tree. */
Art.nest = function (ctx, x, y, r) {
  ctx.save();
  // ring of gnawed bark
  ctx.fillStyle = '#ffcf5c';
  ctx.beginPath();
  for (var a = 0; a <= 20; a++) {
    var t = (a / 20) * Math.PI * 2;
    var rr = r * (1.28 + Art.rnd(a * 3.7) * 0.22);
    var px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
    if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#e08c17'; ctx.lineWidth = 2; ctx.stroke();
  // the hole the moth came out of
  var g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r * 0.85);
  g.addColorStop(0, '#6b4a2a'); g.addColorStop(1, '#2f2011');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r * 0.66, 0, 0, 6.3); ctx.fill();
  // a couple of chew marks around the rim
  ctx.strokeStyle = 'rgba(122,77,5,0.65)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (var i = 0; i < 6; i++) {
    var ang = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9);
    ctx.lineTo(x + Math.cos(ang) * r * 1.2, y + Math.sin(ang) * r * 1.2);
    ctx.stroke();
  }
  ctx.restore();
};

/* Moth with a heading, for walking a path. */
Art.mothAt = function (ctx, x, y, s, phase, ang) {
  ctx.save();
  ctx.translate(x, y);
  if (ang) {
    ctx.rotate(ang);
    // past a quarter turn the sprite is upside down; mirroring across its own
    // axis keeps the head leading and the legs underneath
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
  }
  Art.moth(ctx, 0, 0, s, phase);
  ctx.restore();
};

/* A soft glowing ring, for legal-move targets. */
Art.ring = function (ctx, x, y, r, color, width, glow) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width || 3.5;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke();
  ctx.restore();
};

/* An arrow pip, used around four-arrow tracker cells. */
Art.pip = function (ctx, x, y, ang, color, size) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = color;
  var s = size || 1;
  ctx.beginPath();
  ctx.moveTo(4 * s, 0); ctx.lineTo(-3 * s, 3.4 * s); ctx.lineTo(-3 * s, -3.4 * s);
  ctx.closePath(); ctx.fill();
  ctx.restore();
};

/* A soft panel behind the rail groups. */
Art.panel = function (ctx, x, y, w, h, r, fill) {
  ctx.save();
  ctx.fillStyle = fill || 'rgba(61,70,27,0.55)';
  Art.roundRect(ctx, x, y, w, h, r || 10);
  ctx.fill();
  ctx.restore();
};
