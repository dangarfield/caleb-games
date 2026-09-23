/* theme.js — the Fleet Forge visual system.
 *
 * These values are the design's, not the arcade's. Fleet Forge deliberately
 * looks unlike the other games: near-black grounds, one cyan for UI only, and
 * a module palette where every family shifts HUE between its children so a
 * 34px tile reads without a label. Source: the Claude Design handoff in
 * research/space-ship-fitting-game/ (design-spec.md + decisions.md).
 *
 * THE TWO RESERVED COLOURS — these are rules, not preferences:
 *   - Cyan is UI only. Selection, primary actions, your own ship. NEVER a
 *     module family. (Lasers are blue, which is why shields are violet.)
 *   - Amber means locked or over budget. Nothing else. Power readouts sit in
 *     reactor green until they overdraw; hull bars use neutral steel.
 *
 * Fonts come from Google Fonts over the network, which the arcade normally
 * forbids for core play — Dan chose it explicitly. Every stack falls back to
 * system faces, so a failed font load costs the look and not the game.
 */
var T = {
  /* grounds */
  bg:       '#05080B',
  bgMid:    '#0B1218',
  bgTop:    '#101A22',
  panel:    '#0B1218',
  panelUp:  '#101A22',
  panelEdge:'rgba(120,170,200,0.16)',
  hairline: 'rgba(120,170,200,0.16)',

  /* UI — cyan, and only ever UI */
  accent:   '#38C5D8',
  glow:     '#6FE0EE',
  onAccent: '#04080A',          /* text sitting on an accent fill */

  /* states */
  warn:     '#E8A33D',          /* locked, or over budget. nothing else */
  gold:     '#E8A33D',          /* kept as an alias — same thing */
  ready:    '#4FBF7F',          /* ready, owned */
  danger:   '#E4554A',
  sealed:   '#4A5C68',          /* disabled */

  /* text */
  white:    '#EAF5FA',
  ink:      '#DBE8EF',
  subtitle: '#8FA3B0',
  muted:    '#6F8795',
  faint:    '#4A5C68',

  /* structure / hull bars — neutral steel, so amber stays reserved */
  steelLo:  '#7D8F9B',
  steelHi:  '#C7D6DE',

  /* module families. Parent identifies the family; children shift hue. */
  fam: {
    weapon:  '#E4554A',
    defence: '#A07CF0',
    utility: '#4FBF7F'
  },
  cat: {
    ballistic:    '#E4554A',
    missile:      '#F07030',
    laser:        '#5B8CFF',
    armor:        '#7A63CF',
    shield:       '#BB9BFF',
    pointdefense: '#E08AD8',
    reactor:      '#B0D155',
    engine:       '#35B894',
    warp:         '#35B894',
    afterburner:  '#35B894',
    repair:       '#9FE0C4',
    mine:         '#9FE0C4',
    junk:         '#9FE0C4',
    other:        '#6F8795'
  },
  tintFor: function (subtype) { return T.cat[subtype] || T.cat.other; },
  /* Guns all share subtype 'weapon'; their colour comes from what they fire. */
  tintForModule: function (mod) {
    if (!mod) return T.cat.other;
    var k = (mod.subtype === 'weapon' && mod.damageType) ? mod.damageType : mod.subtype;
    return T.cat[k] || T.cat.other;
  },
  /* which of the three parent families a subtype belongs to */
  familyOf: function (mod) {
    if (!mod) return 'utility';
    var s = mod.subtype;
    if (s === 'weapon') return 'weapon';
    if (s === 'armor' || s === 'shield' || s === 'pointdefense') return 'defence';
    return 'utility';
  },

  /* ---- type ------------------------------------------------------------
     Saira Condensed for headings, labels, buttons and ship names — uppercase
     and widely tracked. Barlow for body copy and list rows. IBM Plex Mono for
     every numeral, code, timer and piece of telemetry. */
  head: function (px, w) { return (w || 600) + ' ' + px + 'px "Saira Condensed", "Arial Narrow", system-ui, sans-serif'; },
  body: function (px, w) { return (w || 400) + ' ' + px + 'px Barlow, "Segoe UI", system-ui, sans-serif'; },
  mono: function (px, w) { return (w || 400) + ' ' + px + 'px "IBM Plex Mono", ui-monospace, Menlo, monospace'; }
};

/* ---- canvas helpers ------------------------------------------------------ */

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function fillRR(ctx, x, y, w, h, r, fill) { rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }

/* ---- icons ---------------------------------------------------------------
 * Lucide (ISC licence, lucide.dev), drawn as canvas paths rather than loaded as
 * images so a glyph can be tinted and scaled to any size without a fetch. The
 * originals are kept beside the game in `images/ui/` — if one of these is ever
 * edited, edit the SVG to match, because that file is what the next person will
 * read. Every icon is authored on Lucide's 24x24 grid with a 2px round-capped
 * stroke; `size` is the box it is drawn into and the stroke scales with it.
 */
function icon(ctx, name, cx, cy, size, colour, weight) {
  var k = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.strokeStyle = colour;
  ctx.lineWidth = weight || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (name === 'pause') {
    rr(ctx, 6, 4, 4, 16, 1); ctx.stroke();
    rr(ctx, 14, 4, 4, 16, 1); ctx.stroke();
  } else if (name === 'x') {
    ctx.beginPath();
    ctx.moveTo(18, 6); ctx.lineTo(6, 18);
    ctx.moveTo(6, 6);  ctx.lineTo(18, 18);
    ctx.stroke();
  }
  ctx.restore();
}

/* An INSIDE stroke, like a CSS border.
 *
 * Canvas centres a stroke on its path, so a 1px border drawn on the box edge
 * puts half a pixel outside it and half in — and once the stage is scaled to the
 * window that half-pixel lands between device pixels and the browser resolves it
 * by spreading the line over two, at half strength each. The result is a hairline
 * that is both fatter and paler than the design's `1px solid`, which is exactly
 * the "subtly different grey" it reads as. Insetting by half the line width puts
 * the whole stroke inside the box, the way `box-sizing: border-box` does. */
function strokeRR(ctx, x, y, w, h, r, stroke, lw) {
  var o = (lw || 1) / 2;
  rr(ctx, x + o, y + o, Math.max(0, w - lw), Math.max(0, h - lw), Math.max(0, r - o));
  ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke();
}

/* `track` is letter-spacing in px, which canvas has no property for — the text
   is drawn a glyph at a time. The design leans on wide tracking for every
   uppercase label, so it is worth the loop. */
function text(ctx, s, x, y, opts) {
  opts = opts || {};
  ctx.font = opts.font || T.body(14);
  ctx.fillStyle = opts.fill || T.ink;
  ctx.textAlign = opts.track ? 'left' : (opts.align || 'left');
  ctx.textBaseline = opts.baseline || 'alphabetic';
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur || 18; }

  if (opts.track) {
    var i, ch, total = 0;
    for (i = 0; i < s.length; i++) total += ctx.measureText(s[i]).width + opts.track;
    total -= opts.track;
    var cx = x;
    if (opts.align === 'center') cx = x - total / 2;
    else if (opts.align === 'right') cx = x - total;
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + opts.track;
    }
  } else {
    ctx.fillText(s, x, y);
  }
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
}

/* Measured truncation with an ellipsis — module names run from "Vulcan" to
   "Gaussian War Shotgun". */
function fitText(ctx, s, maxW, font) {
  ctx.font = font || ctx.font;
  if (ctx.measureText(s).width <= maxW) return s;
  var lo = 0, hi = s.length;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

/* The design's ground is flat near-black with a faint grid, not a gradient. */
function bgGradient(ctx, w, h) {
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,170,200,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 0; x <= w; x += 52) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (var y = 0; y <= h; y += 52) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
}

/* A steel bar — structure and hull, never amber. */
function steelBar(ctx, x, y, w, h, frac, tint) {
  fillRR(ctx, x, y, w, h, h / 2, 'rgba(120,170,200,0.14)');
  if (frac <= 0) return;
  var g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, tint || T.steelLo);
  g.addColorStop(1, tint || T.steelHi);
  fillRR(ctx, x, y, Math.max(2, w * Math.min(1, frac)), h, h / 2, g);
}

/* ---- the design's two backgrounds ---------------------------------------
 * The handoff leans on CSS gradients canvas has no equivalent for. These are
 * the three that actually carry the look, written once here rather than
 * open-coded on every screen.
 */

/* `repeating-linear-gradient(<deg>, a 0 band, b band 2*band)`.
 *
 * CSS measures the angle clockwise from "up", and the bands run PERPENDICULAR
 * to that line. Rotating the context by (deg - 90) makes the rotated x-axis the
 * gradient line, so plain vertical bands come out at the right angle; the
 * half-diagonal is how far they have to run to cover the corners. */
function stripes(ctx, r, deg, a, b, band) {
  var R = Math.hypot(r.w, r.h) / 2 + band * 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate((deg - 90) * Math.PI / 180);
  for (var x = -R; x < R; x += band * 2) {
    ctx.fillStyle = a; ctx.fillRect(x, -R, band, R * 2);
    ctx.fillStyle = b; ctx.fillRect(x + band, -R, band, R * 2);
  }
  ctx.restore();
}

/* Same, clipped to a rounded rect — hull card art, avatars, module wells. */
function stripesRR(ctx, x, y, w, h, rad, deg, a, b, band) {
  ctx.save();
  rr(ctx, x, y, w, h, rad); ctx.clip();
  stripes(ctx, { x: x, y: y, w: w, h: h }, deg, a, b, band);
  ctx.restore();
}

/* `radial-gradient(<pw>% <ph>% at <cx>% <cy>%, inner 0%, outer <stop>%)` — the
   vignette that keeps the home screen's battle loop from competing with the
   type sitting on top of it. */
function vignette(ctx, w, h, pw, ph, cx, cy, inner, outer, stop) {
  var rx = w * pw, ry = h * ph, mx = w * cx, my = h * cy;
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(1, ry / rx);
  var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, inner);
  g.addColorStop(stop, outer);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(-w, -h * 2, w * 2, h * 4);
  ctx.restore();
}

/* A dashed rounded-rect outline. The design uses `border: 1px dashed` for every
   locked or empty thing, and a solid line there reads as available. */
function dashRR(ctx, x, y, w, h, rad, stroke, dash) {
  ctx.save();
  ctx.setLineDash(dash || [5, 4]);
  strokeRR(ctx, x, y, w, h, rad, stroke, 1);
  ctx.restore();
}

/* The grey ladder, named so nothing invents a rung.
     track   the unfilled part of a bar — the quietest thing on screen
     rule    the structural hairlines: panel edges, the top bar's underline,
             the divider in the fitting budget. These separate REGIONS rather
             than outline objects, so they stay a step below a border.
     edge    every 1px border on a card, row, tile or panel
     edgeUp  the border on a tappable control that has no fill of its own —
             SELECT, REVERT, the toggle shells. One step up from `edge`,
             because a thing you can press should look like one.
   The handoff's own CSS varies between 0.14 and 0.16 from screen to screen. At
   canvas gamma, on a tablet, none of those hold their own — these are lifted
   from the mock by eye on the real device, and the point of naming them is that
   one value does every border, so the panels read as one system. Keep the
   hierarchy if you change them: edge above rule above track. */
T.track  = 'rgba(120,170,200,0.16)';   /* the unfilled part of a bar        */
T.rule   = 'rgba(120,170,200,0.24)';   /* hairlines that separate regions   */
T.edge   = 'rgba(120,170,200,0.32)';   /* every border on a card/row/tile   */
T.edgeUp = 'rgba(120,170,200,0.40)';   /* ...on a tappable control          */

/* The pilot avatar: a hatched disc. No portraits exist and the design does not
   ask for any — it is a placeholder in the handoff too. */
function hatchDisc(ctx, cx, cy, d, edge) {
  var r = d / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  stripes(ctx, { x: cx - r, y: cy - r, w: d, h: d }, 135, '#1B2B36', '#0F1C25', 5);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = edge || T.accent; ctx.lineWidth = 1; ctx.stroke();
}

/* A three-letter code for a name. The design labels every tile in the arena
   feed and the result screens with one ("AC2", "SHB", "RCT") and no such code
   exists in the data, so it is derived: initials for a multi-word name, the
   first three letters otherwise, with any trailing digit kept because the
   mark numbers are what tell two variants of a gun apart. */
function initials(name) {
  var s = String(name || '?').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  var parts = s.split(' ').filter(function (p) { return p.length; });
  if (!parts.length) return '???';
  var tail = parts[parts.length - 1];
  var digit = /^[0-9IVX]+$/.test(tail) ? tail.slice(0, 1) : '';
  if (parts.length >= 3) return (parts[0][0] + parts[1][0] + parts[2][0]);
  if (parts.length === 2) return (parts[0][0] + parts[1][0] + (digit || parts[1][1] || parts[0][1] || '')).slice(0, 3);
  return parts[0].slice(0, 3);
}
