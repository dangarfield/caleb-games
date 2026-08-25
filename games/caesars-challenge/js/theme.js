/* Caesar's Challenge — theme.js  (LANE B)
 *
 * Imperial-Rome look primitives. Pure drawing helpers, no game state, no DOM
 * queries, no imports. Everything is procedural — no image assets.
 *
 * PUBLIC CONTRACT (other lanes may use ONLY these four + THEME):
 *   THEME
 *   roundRect(ctx,x,y,w,h,r)
 *   fitText(ctx,text,maxW,maxSize,weight,family) -> px size (also sets ctx.font)
 *   carvedText(ctx,text,x,y,size,color[,opts]) -> px size actually used
 *   button(ctx,rect,label[,opts]) -> rect
 *
 * Everything below the "LANE B INTERNAL" banner is shared between theme.js and
 * render.js only (same lane, same owner). Other lanes must not rely on it.
 */

export const THEME = {
  bgStops: ['#0a0a2e', '#141452', '#1a1a6e'],
  accent: '#6c5ce7',
  glow: '#a29bfe',
  sub: '#a0c4ff',
  gold: '#ffd32a',
  danger: '#e74c3c',
  marble: '#e8e2d0',
  stone: '#3a3a6e'
};

/* Display face for numerals / titles (chiselled Roman feel) and the UI face. */
export const FONT_DISPLAY = "Georgia,'Times New Roman','Palatino Linotype',serif";
export const FONT_UI = "'Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif";

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* roundRect — path only, no fill, no stroke                           */
/* ------------------------------------------------------------------ */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, Math.min(Math.abs(w), Math.abs(h)) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* fitText — largest size <= maxSize whose text fits maxW              */
/* Sets ctx.font as a side effect and returns the size in px.          */
/* ------------------------------------------------------------------ */
export function fitText(ctx, text, maxW, maxSize, weight, family) {
  const w8 = weight || 'bold';
  const fam = family || FONT_UI;
  let size = Math.max(6, Math.round(maxSize || 16));
  ctx.font = w8 + ' ' + size + 'px ' + fam;
  const s = String(text == null ? '' : text);
  if (!s.length || !(maxW > 0)) return size;
  let w = ctx.measureText(s).width;
  if (w <= maxW) return size;
  // Proportional guess first (one step), then walk down a couple of px.
  size = Math.max(6, Math.floor(size * (maxW / w)));
  ctx.font = w8 + ' ' + size + 'px ' + fam;
  let guard = 24;
  while (size > 6 && guard-- > 0 && ctx.measureText(s).width > maxW) {
    size -= 1;
    ctx.font = w8 + ' ' + size + 'px ' + fam;
  }
  return size;
}

/* ------------------------------------------------------------------ */
/* carvedText — THE signature effect.                                  */
/* A dark fill offset up-left + a light fill offset down-right around   */
/* the main fill, so the glyph reads as an INSET bevel chiselled into   */
/* stone. Centre-aligned by default.                                   */
/*                                                                     */
/* opts: {family, weight, maxW, align, baseline, glow, glowBlur,       */
/*        dark, light, depth}                                          */
/* ------------------------------------------------------------------ */
export function carvedText(ctx, text, x, y, size, color, opts) {
  const o = opts || {};
  const s = String(text == null ? '' : text);
  const fam = o.family || FONT_DISPLAY;
  const w8 = o.weight || 'bold';
  let px = Math.max(6, size || 16);
  if (o.maxW > 0) px = fitText(ctx, s, o.maxW, px, w8, fam);
  else ctx.font = w8 + ' ' + px + 'px ' + fam;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  const d = Math.max(1, px * (o.depth || 0.045));

  if (o.glow) {
    // Only for a handful of large titles — never inside a loop.
    ctx.save();
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = o.glowBlur || Math.max(10, px * 0.55);
    ctx.fillStyle = color || THEME.marble;
    ctx.fillText(s, x, y);
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  // inset bevel: shadow above-left, highlight below-right
  ctx.fillStyle = o.dark || 'rgba(0,0,0,0.66)';
  ctx.fillText(s, x - d, y - d);
  ctx.fillStyle = o.light || 'rgba(255,255,255,0.34)';
  ctx.fillText(s, x + d, y + d);
  ctx.fillStyle = color || THEME.marble;
  ctx.fillText(s, x, y);
  return px;
}

/* ------------------------------------------------------------------ */
/* button — pill button. Draws only; caller owns hit-testing.          */
/* opts: {kind:'primary'|'gold'|'ghost'|'danger'|'stone', sub, enabled,*/
/*        size, pressed, family, carved}                              */
/* Returns the rect it was given (convenience for `return {a: button(..)}`)
/* ------------------------------------------------------------------ */
const KINDS = {
  primary: { a: '#8878ff', b: '#5546c8', edge: 'rgba(255,255,255,0.30)', text: '#ffffff' },
  gold: { a: '#ffe36e', b: '#d9a406', edge: 'rgba(255,255,255,0.55)', text: '#3a2600' },
  ghost: { a: 'rgba(232,226,208,0.20)', b: 'rgba(58,58,110,0.55)', edge: 'rgba(232,226,208,0.38)', text: '#e8e2d0' },
  danger: { a: '#ff8b7d', b: '#b3271a', edge: 'rgba(255,255,255,0.32)', text: '#ffffff' },
  stone: { a: '#f2ecdc', b: '#9c937c', edge: 'rgba(255,255,255,0.6)', text: '#2a2418' }
};

const _gcache = new Map();
function bodyGrad(ctx, kind, h) {
  const key = kind + '|' + Math.round(h);
  let g = _gcache.get(key);
  if (!g) {
    const k = KINDS[kind] || KINDS.primary;
    // Built in LOCAL space (0..h) so it stays valid for any y — we translate
    // before filling. Never rebuilt per frame.
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, k.a);
    g.addColorStop(1, k.b);
    if (_gcache.size > 48) _gcache.clear();
    _gcache.set(key, g);
  }
  return g;
}

export function button(ctx, rect, label, opts) {
  const o = opts || {};
  const kind = KINDS[o.kind] ? o.kind : 'primary';
  const k = KINDS[kind];
  const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
  const r = Math.min(h / 2, 22 + h * 0.08);
  const enabled = o.enabled !== false;
  const press = o.pressed ? Math.max(1, h * 0.035) : 0;

  ctx.save();
  if (!enabled) ctx.globalAlpha = 0.42;

  // seated shadow (no shadowBlur — a cheap offset plate)
  roundRect(ctx, x, y + Math.max(2, h * 0.09), w, h, r);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();

  ctx.translate(x, y + press);
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fillStyle = bodyGrad(ctx, kind, h);
  ctx.fill();
  // top inner highlight + rim
  ctx.lineWidth = Math.max(1.2, h * 0.035);
  ctx.strokeStyle = k.edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.7, h * 0.16);
  ctx.lineTo(w - r * 0.7, h * 0.16);
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();

  const hasSub = !!o.sub;
  const maxW = w * 0.84;
  const lblSize = o.size || h * (hasSub ? 0.36 : 0.44);
  const ly = hasSub ? h * 0.38 : h * 0.5;
  if (o.carved) {
    carvedText(ctx, label, w / 2, ly, lblSize, k.text, { maxW: maxW, family: o.family || FONT_DISPLAY });
  } else {
    const sz = fitText(ctx, label, maxW, lblSize, 'bold', o.family || FONT_UI);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillText(label, w / 2, ly + Math.max(1, sz * 0.06));
    ctx.fillStyle = k.text;
    ctx.fillText(label, w / 2, ly);
  }
  if (hasSub) {
    const sz2 = fitText(ctx, o.sub, maxW, h * 0.24, 'bold', FONT_UI);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha *= 0.8;
    ctx.fillStyle = k.text;
    ctx.fillText(o.sub, w / 2, h * 0.72);
    void sz2;
  }
  ctx.restore();
  return rect;
}

/* ================================================================== */
/* LANE B INTERNAL — shared by theme.js + render.js only.              */
/* ================================================================== */

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* deterministic 0..1 hash — used for marble grain, mosaic tesserae, motes */
export function hash01(i, j) {
  let h = (i | 0) * 374761393 + (j | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function parseHex(hex) {
  let s = String(hex || '#000').replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function withAlpha(hex, a) {
  const c = parseHex(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

/** mix two hex colours, t=0 -> a, t=1 -> b. Returns a hex string. */
export function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  const k = clamp(t, 0, 1);
  const r = Math.round(A[0] + (B[0] - A[0]) * k);
  const g = Math.round(A[1] + (B[1] - A[1]) * k);
  const bl = Math.round(A[2] + (B[2] - A[2]) * k);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** lighten (amt>0) or darken (amt<0) a hex colour by a 0..1 factor. */
export function shade(hex, amt) {
  return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt);
}

/** 5-point star path, then caller fills/strokes. */
export function starPath(ctx, cx, cy, r, inner) {
  const ri = r * (inner || 0.46);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = (i & 1) ? ri : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawStar(ctx, cx, cy, r, fill, stroke, lw) {
  starPath(ctx, cx, cy, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || Math.max(1, r * 0.14); ctx.strokeStyle = stroke; ctx.stroke(); }
}

/** A single laurel leaf pointing along `ang`, length L. Path only. */
export function leafPath(ctx, x, y, L, wid, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x + c * L, ty = y + s * L;
  const nx = -s * wid, ny = c * wid;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * L * 0.5 + nx, y + s * L * 0.5 + ny, tx, ty);
  ctx.quadraticCurveTo(x + c * L * 0.5 - nx, y + s * L * 0.5 - ny, x, y);
  ctx.closePath();
}

/**
 * Laurel wreath / half-wreath. Used by the trophy room, the complete screen
 * and the profile standards. `open` leaves a gap at the top.
 */
export function laurelWreath(ctx, cx, cy, r, col, open) {
  const n = 9;
  const span = open ? Math.PI * 0.78 : Math.PI * 0.95;
  ctx.fillStyle = col;
  for (let side = 0; side < 2; side++) {
    const dir = side ? 1 : -1;
    // stem
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI / 2 + dir * (0.16 + span * (i / 12));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = Math.max(1.2, r * 0.055);
    ctx.strokeStyle = col;
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const a = Math.PI / 2 + dir * (0.18 + span * f);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const L = r * (0.30 + 0.12 * Math.sin(f * Math.PI));
      leafPath(ctx, x, y, L, L * 0.42, a - dir * 1.15);
      ctx.fill();
      leafPath(ctx, x, y, L * 0.85, L * 0.36, a + dir * 0.35);
      ctx.fill();
    }
  }
}

/** Small SPQR-ish eagle glyph (silhouette style), width ~ w. */
export function eagleGlyph(ctx, cx, cy, w, col) {
  const h = w * 0.62;
  ctx.fillStyle = col;
  // wings
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx - w * 0.30, cy - h * 0.55, cx - w * 0.50, cy - h * 0.10);
  ctx.quadraticCurveTo(cx - w * 0.28, cy - h * 0.02, cx - w * 0.10, cy + h * 0.16);
  ctx.lineTo(cx, cy + h * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx + w * 0.30, cy - h * 0.55, cx + w * 0.50, cy - h * 0.10);
  ctx.quadraticCurveTo(cx + w * 0.28, cy - h * 0.02, cx + w * 0.10, cy + h * 0.16);
  ctx.lineTo(cx, cy + h * 0.06);
  ctx.closePath();
  ctx.fill();
  // body + head
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.09, cy - h * 0.05);
  ctx.lineTo(cx + w * 0.09, cy - h * 0.05);
  ctx.lineTo(cx + w * 0.05, cy + h * 0.48);
  ctx.lineTo(cx - w * 0.05, cy + h * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.22, w * 0.085, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.06, cy - h * 0.24);
  ctx.lineTo(cx + w * 0.17, cy - h * 0.18);
  ctx.lineTo(cx + w * 0.06, cy - h * 0.14);
  ctx.closePath();
  ctx.fill();
}

/** Roman numeral for 1..3999 — LOCAL copy so theme/render never import numerals.js. */
const _RN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function romanize(n) {
  let v = Math.floor(n);
  if (!(v > 0) || v > 3999) return String(n);
  let out = '';
  for (let i = 0; i < _RN.length; i++) {
    while (v >= _RN[i][0]) { out += _RN[i][1]; v -= _RN[i][0]; }
  }
  return out;
}

/** Marble plaque / tablet frame. Path + fill + chiselled border. */
export function plaque(ctx, x, y, w, h, opts) {
  const o = opts || {};
  const r = o.r != null ? o.r : Math.min(w, h) * 0.10;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = o.fill || 'rgba(10,10,46,0.72)';
  ctx.fill();
  ctx.lineWidth = o.lw || Math.max(1.5, Math.min(w, h) * 0.02);
  ctx.strokeStyle = o.stroke || 'rgba(232,226,208,0.30)';
  ctx.stroke();
  if (o.inner !== false) {
    const p = Math.max(3, Math.min(w, h) * 0.05);
    roundRect(ctx, x + p, y + p, w - p * 2, h - p * 2, Math.max(0, r - p * 0.5));
    ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.55);
    ctx.strokeStyle = o.innerStroke || 'rgba(0,0,0,0.35)';
    ctx.stroke();
  }
}
