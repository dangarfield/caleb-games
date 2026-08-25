/* Caesar's Challenge — puzzles.js  (LANE C)
 *
 * Puzzle presentation + the five input widgets. Canvas 2D only: no DOM, no
 * `document`, no `window`, no network, no dependencies.
 *
 * PUBLIC CONTRACT (Lane D calls exactly these):
 *   checkAnswer(puzzle, value) -> boolean
 *   formatAnswer(puzzle)       -> string
 *   drawPrompt(ctx, puzzle, rect, t)
 *   createInput(puzzle, hooks) -> widget
 *
 * widget = { kind, layout(rect), draw(ctx, t), pointerDown(x,y), pointerMove(x,y),
 *            pointerUp(x,y), key(e)->bool, getValue(), isComplete(), setEnabled(b),
 *            flash('ok'|'bad'), reveal(puzzle), reset() }
 *
 * answerKind -> widget:
 *   'arabic' -> keypad      (decode, add, subtract, multiply, divide)
 *   'roman'  -> chisel tiles (encode, roman-answer maths, missing, sequence)
 *   'choice' -> choice cards (compare, forgery, missing, cipher, sequence)
 *   'order'  -> ordering tray (order)
 *   'scales' -> balance beam (scales)
 *
 * Conventions honoured here:
 *   - every tap target is >= 64px on its short axis (MIN_TAP)
 *   - `layout(rect)` computes ALL geometry; `draw` only reads it
 *   - gradients are built once and cached, never per frame
 *   - `t` is seconds; widgets integrate their own clamped clock so they are
 *     immune to the absolute time base
 */

import { isValidRoman, fromRoman, toRoman, invalidReason } from './numerals.js';
import { THEME, roundRect, fitText, carvedText, button } from './theme.js';

/* ------------------------------------------------------------------ */
/* constants + tiny utils                                             */
/* ------------------------------------------------------------------ */

const MIN_TAP = 64;                 // touch floor, short axis
const ROMAN_LETTERS = ['I', 'V', 'X', 'L', 'C', 'D', 'M'];
const MAX_DIGITS = 4;               // 1..3999 needs four
const MAX_ROMAN_LEN = 15;           // MMMDCCCLXXXVIII is 15
const FONT_UI = "'Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif";
const FONT_DISPLAY = "Georgia,'Times New Roman','Palatino Linotype',serif";

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

/** strict-ish integer coercion; returns null when it is not an integer. */
function toInt(v) {
  if (typeof v === 'number') return isFinite(v) && Math.floor(v) === v ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    return /^-?\d+$/.test(s) ? parseInt(s, 10) : null;
  }
  return null;
}

function normRoman(s) {
  return typeof s === 'string' ? s.replace(/\s+/g, '').toUpperCase() : '';
}

/* numerals.js is a sibling lane — never let it throw into a draw loop. */
function safeValid(s) { try { return !!isValidRoman(s); } catch (e) { return false; } }
function safeFrom(s) {
  try { const v = fromRoman(s); return (typeof v === 'number' && isFinite(v)) ? v : null; }
  catch (e) { return null; }
}
function safeTo(n) {
  try { const r = toRoman(n); return typeof r === 'string' && r ? r : String(n); }
  catch (e) { return String(n); }
}
function safeReason(s) {
  try { const r = invalidReason(s); return (typeof r === 'string' && r) ? r : null; }
  catch (e) { return null; }
}

function inRect(r, x, y) {
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function mkRect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

function sanitizeRect(rect) {
  return mkRect(
    num(rect && rect.x, 0),
    num(rect && rect.y, 0),
    Math.max(80, num(rect && rect.w, 320)),
    Math.max(80, num(rect && rect.h, 320))
  );
}

/* ------------------------------------------------------------------ */
/* cached gradients — built in LOCAL space (0..h), translate to use    */
/* ------------------------------------------------------------------ */

const _grads = new Map();
function vgrad(ctx, h, key, stops) {
  const hh = Math.max(1, Math.round(h));
  const k = key + '|' + hh;
  let g = _grads.get(k);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, hh);
    for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    if (_grads.size > 72) _grads.clear();
    _grads.set(k, g);
  }
  return g;
}

const SKINS = {
  /* marble keys (digits, chips) */
  stone: { stops: [[0, '#f3ecdb'], [0.55, '#ddd3ba'], [1, '#a89d81']], text: '#2a2418', edge: 'rgba(255,255,255,0.65)', rim: 'rgba(0,0,0,0.34)' },
  /* dark basalt (roman letter tiles, cards) */
  basalt: { stops: [[0, '#4b4b90'], [0.5, '#33336c'], [1, '#1e1e48']], text: THEME.gold, edge: 'rgba(232,226,208,0.34)', rim: 'rgba(0,0,0,0.45)' },
  /* gold submit */
  gold: { stops: [[0, '#ffe882'], [0.5, '#f0bd2a'], [1, '#c08c04']], text: '#3a2600', edge: 'rgba(255,255,255,0.7)', rim: 'rgba(80,50,0,0.5)' },
  /* backspace / neutral action */
  ghost: { stops: [[0, 'rgba(232,226,208,0.26)'], [1, 'rgba(30,30,72,0.62)']], text: THEME.marble, edge: 'rgba(232,226,208,0.34)', rim: 'rgba(0,0,0,0.35)' },
  /* bronze weight discs */
  bronze: { stops: [[0, '#f2c877'], [0.5, '#c9913c'], [1, '#8a5f1e']], text: '#2e1c00', edge: 'rgba(255,255,255,0.6)', rim: 'rgba(50,28,0,0.5)' },
  /* recessed socket / empty slot */
  socket: { stops: [[0, 'rgba(0,0,0,0.46)'], [1, 'rgba(255,255,255,0.10)']], text: THEME.sub, edge: 'rgba(0,0,0,0.5)', rim: 'rgba(232,226,208,0.22)' },
  /* dark tablet panel */
  tablet: { stops: [[0, 'rgba(20,20,82,0.86)'], [1, 'rgba(10,10,46,0.9)']], text: THEME.marble, edge: 'rgba(232,226,208,0.3)', rim: 'rgba(0,0,0,0.4)' },
  /* parchment scroll */
  scroll: { stops: [[0, '#f6ecd2'], [0.5, '#e6d7ae'], [1, '#cdb884']], text: '#3a2a10', edge: 'rgba(255,255,255,0.6)', rim: 'rgba(90,66,26,0.5)' }
};

/* ------------------------------------------------------------------ */
/* drawing primitives (private to Lane C)                             */
/* ------------------------------------------------------------------ */

/** Chunky stone key / tile / card. Draws only. */
function stoneKey(ctx, r, opts) {
  const o = opts || {};
  const skin = SKINS[o.skin] || SKINS.stone;
  const rad = num(o.radius, Math.min(r.w, r.h) * 0.22);
  const press = o.pressed ? Math.max(1.5, r.h * 0.035) : 0;

  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;

  // seated shadow plate (no shadowBlur anywhere)
  roundRect(ctx, r.x, r.y + Math.max(2, r.h * 0.075), r.w, r.h, rad);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  ctx.translate(r.x, r.y + press);
  roundRect(ctx, 0, 0, r.w, r.h, rad);
  ctx.fillStyle = vgrad(ctx, r.h, o.skin || 'stone', skin.stops);
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r.h * 0.028);
  ctx.strokeStyle = skin.rim;
  ctx.stroke();
  // top bevel highlight
  ctx.beginPath();
  ctx.moveTo(rad * 0.8, r.h * 0.13);
  ctx.lineTo(r.w - rad * 0.8, r.h * 0.13);
  ctx.lineWidth = Math.max(1, r.h * 0.022);
  ctx.strokeStyle = skin.edge;
  ctx.stroke();

  if (o.highlight) {
    roundRect(ctx, 1.5, 1.5, r.w - 3, r.h - 3, Math.max(0, rad - 1.5));
    ctx.lineWidth = Math.max(2, r.h * 0.045);
    ctx.strokeStyle = o.highlight;
    ctx.stroke();
  }
  ctx.restore();
  return press;
}

/** Recessed socket — an active drop target (empty order slot, numeral blank). */
function socket(ctx, r, radius, glowA) {
  const rad = num(radius, Math.min(r.w, r.h) * 0.2);
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, Math.min(r.w, r.h) * 0.03);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, Math.max(0, rad - 2));
  ctx.lineWidth = Math.max(1, Math.min(r.w, r.h) * 0.022);
  ctx.strokeStyle = 'rgba(232,226,208,' + (0.2 + 0.45 * clamp(num(glowA, 0), 0, 1)).toFixed(3) + ')';
  ctx.stroke();
  ctx.restore();
}

/** "this piece has moved" placeholder — outline only, deliberately quiet. */
function ghostSocket(ctx, r, radius) {
  const rad = num(radius, Math.min(r.w, r.h) * 0.2);
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, Math.min(r.w, r.h) * 0.018);
  ctx.strokeStyle = 'rgba(232,226,208,0.16)';
  ctx.stroke();
  ctx.restore();
}

/** Vector ✓ (font-independent). */
function iconCheck(ctx, cx, cy, s, col) {
  ctx.save();
  ctx.lineWidth = Math.max(3, s * 0.2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const d = pass === 0 ? s * 0.05 : 0;      // pass 0 = seated shadow
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.42 + d, cy + s * 0.02 + d);
    ctx.lineTo(cx - s * 0.12 + d, cy + s * 0.34 + d);
    ctx.lineTo(cx + s * 0.46 + d, cy - s * 0.36 + d);
    ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.3)' : col;
    ctx.stroke();
  }
  ctx.restore();
}

/** Vector ⌫ (arrow-tab with an x). */
function iconBackspace(ctx, cx, cy, s, col) {
  const w = s * 0.9, h = s * 0.58;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(-w * 0.16, -h * 0.5);
  ctx.lineTo(w * 0.5, -h * 0.5);
  ctx.lineTo(w * 0.5, h * 0.5);
  ctx.lineTo(-w * 0.16, h * 0.5);
  ctx.closePath();
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.02, -h * 0.2);
  ctx.lineTo(w * 0.3, h * 0.2);
  ctx.moveTo(w * 0.3, -h * 0.2);
  ctx.lineTo(-w * 0.02, h * 0.2);
  ctx.lineWidth = Math.max(2, s * 0.085);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Small marble-tablet panel used behind display strips + the prompt. */
function tabletPanel(ctx, r, skinName, radius) {
  const skin = SKINS[skinName] || SKINS.tablet;
  const rad = num(radius, Math.min(r.w, r.h) * 0.12);
  ctx.save();
  ctx.translate(r.x, r.y);
  roundRect(ctx, 0, 0, r.w, r.h, rad);
  ctx.fillStyle = vgrad(ctx, r.h, 'panel-' + (skinName || 'tablet'), skin.stops);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, Math.min(r.w, r.h) * 0.016);
  ctx.strokeStyle = skin.edge;
  ctx.stroke();
  const p = Math.max(3, Math.min(r.w, r.h) * 0.045);
  roundRect(ctx, p, p, r.w - p * 2, r.h - p * 2, Math.max(0, rad - p * 0.5));
  ctx.lineWidth = Math.max(1, Math.min(r.w, r.h) * 0.008);
  ctx.strokeStyle = skin.rim;
  ctx.stroke();
  ctx.restore();
}

/** Plain (uncarved) UI text, centre-aligned by default. */
function uiText(ctx, text, x, y, size, col, maxW, align) {
  const sz = fitText(ctx, text, num(maxW, 1e5), size, 'bold', FONT_UI);
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(String(text), x, y + Math.max(1, sz * 0.07));
  ctx.fillStyle = col;
  ctx.fillText(String(text), x, y);
  return sz;
}

/* ------------------------------------------------------------------ */
/* checkAnswer / formatAnswer                                          */
/* ------------------------------------------------------------------ */

/**
 * True when `value` is a correct answer for `puzzle`. Never throws — any
 * malformed input returns false.
 */
export function checkAnswer(puzzle, value) {
  try {
    if (!puzzle || typeof puzzle !== 'object') return false;
    switch (puzzle.answerKind) {
      case 'arabic': {
        const want = toInt(puzzle.answer);
        if (want === null) return false;
        if (typeof value === 'object' || typeof value === 'boolean') return false;
        const got = toInt(value);
        return got !== null && got === want;
      }
      case 'roman': {
        if (typeof value !== 'string') return false;
        const got = normRoman(value);
        if (!got || !safeValid(got)) return false;
        return got === normRoman(puzzle.answer);
      }
      case 'choice': {
        const want = toInt(puzzle.answer);
        const got = toInt(value);
        if (want === null || got === null) return false;
        if (Array.isArray(puzzle.choices) && (want < 0 || want >= puzzle.choices.length)) return false;
        return got === want;
      }
      case 'order': {
        if (!Array.isArray(value) || !Array.isArray(puzzle.answer)) return false;
        if (!puzzle.answer.length || value.length !== puzzle.answer.length) return false;
        for (let i = 0; i < value.length; i++) {
          const a = toInt(value[i]), b = toInt(puzzle.answer[i]);
          if (a === null || b === null || a !== b) return false;
        }
        return true;
      }
      case 'scales': {
        const sc = puzzle.scales;
        if (!sc || !Array.isArray(sc.pool) || !sc.pool.length) return false;
        const target = num(Number(sc.target), num(Number(puzzle.answer), NaN));
        if (!isFinite(target)) return false;
        // The widget submits pool indices, but `puzzle.answer` for a scales puzzle is
        // the target *number* — so accept a bare total too, provided the pool can
        // actually make it. Keeps checkAnswer(p, p.answer) true for every puzzle type.
        if (!Array.isArray(value)) {
          const n = toInt(value);
          return n !== null && n === target && findSubset(sc.pool, target) !== null;
        }
        if (!value.length) return false;
        const seen = Object.create(null);
        let sum = 0;
        for (let i = 0; i < value.length; i++) {
          const idx = toInt(value[i]);
          if (idx === null || idx < 0 || idx >= sc.pool.length) return false;
          if (seen[idx]) return false;           // no index twice
          seen[idx] = true;
          const w = Number(sc.pool[idx] && sc.pool[idx].value);
          if (!isFinite(w)) return false;
          sum += w;
        }
        return sum === target;                    // ANY valid subset counts
      }
      default:
        return false;
    }
  } catch (e) {
    return false;
  }
}

/** Smallest pool subset summing to `target`, as indices; null if none. */
function findSubset(pool, target) {
  if (!Array.isArray(pool) || !pool.length || pool.length > 16) return null;
  if (!isFinite(target)) return null;
  const vals = pool.map(function (p) { return Number(p && p.value) || 0; });
  const n = vals.length;
  let best = null, bestBits = 99;
  for (let mask = 1; mask < (1 << n); mask++) {
    let s = 0, bits = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += vals[i]; bits++; }
    if (s === target && bits < bestBits) {
      const out = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i);
      best = out; bestBits = bits;
    }
  }
  return best;
}

/** Human-readable form of the correct answer (used by hints + reveal). */
export function formatAnswer(puzzle) {
  try {
    if (!puzzle || typeof puzzle !== 'object') return '';
    const ch = Array.isArray(puzzle.choices) ? puzzle.choices : null;
    switch (puzzle.answerKind) {
      case 'arabic': {
        const v = toInt(puzzle.answer);
        return v === null ? '' : String(v);
      }
      case 'roman':
        return normRoman(puzzle.answer);
      case 'choice': {
        const i = toInt(puzzle.answer);
        if (i === null || !ch || !ch[i]) return i === null ? '' : String(i + 1);
        const c = ch[i];
        return String(c.label != null ? c.label : '');
      }
      case 'order': {
        if (!Array.isArray(puzzle.answer)) return '';
        return puzzle.answer.map(function (i) {
          const c = ch && ch[i];
          return c && c.label != null ? String(c.label) : String(i);
        }).join(' < ');
      }
      case 'scales': {
        const sc = puzzle.scales || {};
        const sub = findSubset(sc.pool, Number(sc.target));
        if (sub && sub.length) {
          return sub.map(function (i) {
            const p = sc.pool[i];
            return String(p && p.label != null ? p.label : (p && p.value));
          }).join(' + ');
        }
        return String(sc.targetRoman || safeTo(Number(sc.target)) || '');
      }
      default:
        return '';
    }
  } catch (e) {
    return '';
  }
}

/* ================================================================== */
/* drawPrompt                                                          */
/* ================================================================== */

/*
 * Prompt geometry is measured once per (puzzle, rect) and cached on a WeakMap
 * so the per-frame path never calls measureText.
 */
const _promptCache = new WeakMap();

function tokenWidths(ctx, parts, size) {
  ctx.font = 'bold ' + size + 'px ' + FONT_DISPLAY;
  const out = [];
  for (let i = 0; i < parts.length; i++) out.push(ctx.measureText(String(parts[i])).width);
  return out;
}

/** Wrap tokens into <=maxLines lines, fitting maxW/maxH. Returns line layout. */
function layoutTokenRows(ctx, parts, maxW, maxH, maxSize) {
  const REF = 100;
  const w100 = tokenWidths(ctx, parts, REF);
  const gap100 = REF * 0.34;
  const total = w100.reduce(function (a, b) { return a + b; }, 0) + gap100 * Math.max(0, parts.length - 1);

  function build(lines) {
    // greedy pack into `lines` rows of roughly equal reference width
    const budget = total / lines;
    const rows = [[]];
    let acc = 0;
    for (let i = 0; i < parts.length; i++) {
      const wI = w100[i] + (rows[rows.length - 1].length ? gap100 : 0);
      if (rows.length < lines && acc > 0 && acc + wI > budget * 1.08) {
        rows.push([]); acc = 0;
      }
      rows[rows.length - 1].push(i);
      acc += wI;
    }
    return rows;
  }

  let bestRows = null, bestSize = 0;
  for (let lines = 1; lines <= 3; lines++) {
    const rows = build(lines);
    let widest = 1;
    for (let r = 0; r < rows.length; r++) {
      let w = 0;
      for (let k = 0; k < rows[r].length; k++) w += w100[rows[r][k]] + (k ? gap100 : 0);
      if (w > widest) widest = w;
    }
    const byW = maxW / widest * REF;
    const byH = maxH / (rows.length * 1.24);
    const size = Math.min(maxSize, byW, byH);
    if (size > bestSize) { bestSize = size; bestRows = rows; }
    if (size >= maxSize * 0.98) break;      // already as big as we want
  }
  const size = Math.max(11, Math.floor(bestSize));
  const scale = size / REF;
  const gap = gap100 * scale;
  const rowsOut = bestRows.map(function (row) {
    let w = 0;
    const items = row.map(function (idx, k) {
      const x = w + (k ? gap : 0);
      w = x + w100[idx] * scale;
      return { idx: idx, x: x, w: w100[idx] * scale };
    });
    return { w: w, items: items };
  });
  return { size: size, lineH: size * 1.24, rows: rowsOut };
}

function buildPromptLayout(ctx, puzzle, R) {
  const disp = (puzzle && puzzle.display) || {};
  const mode = disp.mode || 'roman';
  const pad = Math.max(8, Math.min(20, R.w * 0.03));

  const promptSize = clamp(R.h * 0.11, 13, 24);
  const promptH = promptSize * 1.7;
  const panel = mkRect(R.x + pad * 0.5, R.y + promptH, R.w - pad, Math.max(48, R.h - promptH - pad * 0.4));
  const inner = mkRect(panel.x + pad, panel.y + pad * 0.7, Math.max(20, panel.w - pad * 2), Math.max(20, panel.h - pad * 1.4));

  const L = {
    mode: mode,
    pad: pad,
    promptSize: promptSize,
    promptY: R.y + promptH * 0.5,
    promptMaxW: R.w - pad * 2,
    panel: panel,
    inner: inner,
    skin: mode === 'scroll' ? 'scroll' : 'tablet'
  };

  if (mode === 'expr' || mode === 'seq') {
    const parts = Array.isArray(disp.parts) && disp.parts.length
      ? disp.parts.map(function (p) { return String(p); })
      : [String(disp.text || '?')];
    const maxSize = Math.min(inner.h * 0.72, 84);
    L.tokens = layoutTokenRows(ctx, parts, inner.w, inner.h, maxSize);
    L.parts = parts;
  } else if (mode === 'scroll') {
    const text = String(disp.text || '');
    const letters = text.split('');
    // spaced letters: reference-measure the string then scale
    const REF = 100;
    ctx.font = 'bold ' + REF + 'px ' + FONT_DISPLAY;
    let w100 = 0;
    const lw = letters.map(function (c) {
      const w = ctx.measureText(c).width;
      w100 += w;
      return w;
    });
    const track100 = REF * 0.24;
    w100 += track100 * Math.max(0, letters.length - 1);
    const size = Math.max(12, Math.floor(Math.min(inner.h * 0.44, 62, inner.w / Math.max(1, w100) * REF)));
    const sc = size / REF;
    L.letters = letters;
    L.letterW = lw.map(function (w) { return w * sc; });
    L.track = track100 * sc;
    L.letterSize = size;
    L.lineWidth = w100 * sc;
    L.shift = String(disp.shiftRoman || 'III');
  } else if (mode === 'blank') {
    const text = String(disp.text || '');
    const chars = text.split('');
    const REF = 100;
    ctx.font = 'bold ' + REF + 'px ' + FONT_DISPLAY;
    const socketW100 = REF * 0.62;
    let w100 = 0;
    const cw = chars.map(function (c) {
      const w = (c === '_' || c === '?') ? socketW100 : ctx.measureText(c).width;
      w100 += w;
      return w;
    });
    const track100 = REF * 0.1;
    w100 += track100 * Math.max(0, chars.length - 1);
    const size = Math.max(14, Math.floor(Math.min(inner.h * 0.74, 96, inner.w / Math.max(1, w100) * REF)));
    const sc = size / REF;
    L.chars = chars;
    L.charW = cw.map(function (w) { return w * sc; });
    L.track = track100 * sc;
    L.charSize = size;
    L.lineWidth = w100 * sc;
  } else {
    L.text = String(disp.text != null ? disp.text : '');
    L.bigSize = Math.min(inner.h * 0.8, 120);
  }
  return L;
}

function promptLayout(ctx, puzzle, R) {
  const key = R.x + ':' + R.y + ':' + R.w + ':' + R.h;
  let e = _promptCache.get(puzzle);
  if (!e || e.key !== key) {
    e = { key: key, L: buildPromptLayout(ctx, puzzle, R) };
    if (_promptCache.set) _promptCache.set(puzzle, e);
  }
  return e.L;
}

/**
 * Draw `puzzle.prompt` (small line, top) plus `puzzle.display` (the big centre
 * content) inside `rect`. Nothing ever overflows `rect`.
 */
export function drawPrompt(ctx, puzzle, rect, t) {
  if (!ctx || !puzzle || typeof puzzle !== 'object') return;
  const R = sanitizeRect(rect);
  const tt = num(t, 0);
  let L;
  try { L = promptLayout(ctx, puzzle, R); }
  catch (e) { return; }

  ctx.save();

  /* --- prompt line ------------------------------------------------ */
  const prompt = String(puzzle.prompt == null ? '' : puzzle.prompt);
  if (prompt) uiText(ctx, prompt, R.x + R.w / 2, L.promptY, L.promptSize, THEME.sub, L.promptMaxW);

  /* --- display panel --------------------------------------------- */
  tabletPanel(ctx, L.panel, L.skin);
  const cx = L.inner.x + L.inner.w / 2;
  const cy = L.inner.y + L.inner.h / 2;

  switch (L.mode) {
    case 'arabic':
      carvedText(ctx, L.text, cx, cy, L.bigSize, THEME.marble, { maxW: L.inner.w, family: FONT_DISPLAY });
      break;

    case 'expr':
    case 'seq': {
      const tk = L.tokens;
      const totalH = tk.rows.length * tk.lineH;
      let y = cy - totalH / 2 + tk.lineH / 2;
      for (let r = 0; r < tk.rows.length; r++) {
        const row = tk.rows[r];
        const x0 = cx - row.w / 2;
        for (let k = 0; k < row.items.length; k++) {
          const it = row.items[k];
          const s = L.parts[it.idx];
          const mx = x0 + it.x + it.w / 2;
          if (s === '?') {
            const pulse = 0.62 + 0.38 * Math.sin(tt * 3.2);
            ctx.save();
            ctx.globalAlpha *= 0.65 + 0.35 * pulse;
            carvedText(ctx, '?', mx, y, tk.size, THEME.gold, { family: FONT_DISPLAY });
            ctx.restore();
          } else if (/^[-+*/×÷=−–]$/.test(s)) {
            carvedText(ctx, s, mx, y, tk.size * 0.92, THEME.glow, { family: FONT_DISPLAY });
          } else {
            carvedText(ctx, s, mx, y, tk.size, THEME.marble, { family: FONT_DISPLAY });
          }
          // faint separator dots between sequence terms
          if (L.mode === 'seq' && k < row.items.length - 1) {
            const nx = x0 + row.items[k + 1].x;
            ctx.fillStyle = 'rgba(232,226,208,0.28)';
            ctx.beginPath();
            ctx.arc((x0 + it.x + it.w + nx) / 2, y, Math.max(1.5, tk.size * 0.045), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        y += tk.lineH;
      }
      break;
    }

    case 'scroll': {
      // ciphertext in spaced letters on the parchment, plus the shift note
      const topY = L.inner.y + L.inner.h * 0.38;
      let x = cx - L.lineWidth / 2;
      for (let i = 0; i < L.letters.length; i++) {
        carvedText(ctx, L.letters[i], x + L.letterW[i] / 2, topY, L.letterSize, '#3a2a10', {
          family: FONT_DISPLAY, dark: 'rgba(90,66,26,0.5)', light: 'rgba(255,255,255,0.6)'
        });
        x += L.letterW[i] + L.track;
      }
      const noteSize = clamp(L.inner.h * 0.16, 12, 26);
      uiText(ctx, 'Caesar shifted every letter by ' + L.shift,
        cx, L.inner.y + L.inner.h * 0.78, noteSize, '#6b4c17', L.inner.w * 0.95);
      break;
    }

    case 'blank': {
      let x = L.inner.x + (L.inner.w - L.lineWidth) / 2;
      const pulse = 0.5 + 0.5 * Math.sin(tt * 3.4);
      for (let i = 0; i < L.chars.length; i++) {
        const c = L.chars[i];
        const w = L.charW[i];
        if (c === '_' || c === '?') {
          const h = L.charSize * 0.92;
          socket(ctx, mkRect(x, cy - h / 2, w, h), Math.min(w, h) * 0.18, pulse);
        } else {
          carvedText(ctx, c, x + w / 2, cy, L.charSize, THEME.marble, { family: FONT_DISPLAY });
        }
        x += w + L.track;
      }
      break;
    }

    case 'roman':
    default:
      carvedText(ctx, L.text, cx, cy, L.bigSize, THEME.gold, { maxW: L.inner.w, family: FONT_DISPLAY });
      break;
  }
  ctx.restore();
}

/* ================================================================== */
/* widget common mixin                                                 */
/* ================================================================== */

function attachCommon(w, kind, hooks) {
  const h = hooks || {};
  w.kind = kind;
  w.enabled = true;
  w.revealed = false;
  w._rect = mkRect(0, 0, 0, 0);
  w._clock = 0;
  w._lastT = null;
  w._flashKind = null;
  w._flashAt = -1;
  w._sparks = [];
  w._down = null;

  w._hooks = {
    onSubmit: typeof h.onSubmit === 'function' ? h.onSubmit : function () {},
    onChange: typeof h.onChange === 'function' ? h.onChange : function () {},
    sfx: typeof h.sfx === 'function' ? h.sfx : function () {}
  };

  /** advance the widget's own clock from the (seconds) frame time */
  w._dt = 0;
  w._tick = function (t) {
    const tv = num(t, 0);
    const dt = this._lastT === null ? 1 / 60 : clamp(tv - this._lastT, 0, 0.1);
    this._lastT = tv;
    this._clock += dt;
    this._dt = dt;
    // sparks
    const sp = this._sparks;
    for (let i = sp.length - 1; i >= 0; i--) {
      const p = sp[i];
      p.life -= dt;
      if (p.life <= 0) { sp.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
    }
    return dt;
  };

  w._spark = function (x, y, n) {
    const sp = this._sparks;
    const count = Math.min(num(n, 7), 24 - sp.length);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 90 + Math.random() * 190;
      sp.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.22 + Math.random() * 0.22, max: 0.44 });
    }
  };

  w._drawSparks = function (ctx) {
    const sp = this._sparks;
    if (!sp.length) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < sp.length; i++) {
      const p = sp[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.strokeStyle = 'rgba(255,211,42,' + (a * 0.9).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.012, p.y - p.vy * 0.012);
      ctx.stroke();
    }
    ctx.restore();
  };

  /** 0..1 progress of the active flash, or null */
  w._flashP = function () {
    if (!this._flashKind) return null;
    if (this._flashAt < 0) this._flashAt = this._clock;
    const life = this._flashKind === 'bad' ? 0.42 : 0.5;
    const p = (this._clock - this._flashAt) / life;
    if (p >= 1) { this._flashKind = null; this._flashAt = -1; return null; }
    return p;
  };

  w.setEnabled = function (b) {
    this.enabled = !!b;
    if (!this.enabled) this._down = null;
  };

  w.flash = function (kindName) {
    this._flashKind = (kindName === 'bad') ? 'bad' : 'ok';
    this._flashAt = -1;
    return this;
  };

  w._emitChange = function () {
    try { this._hooks.onChange(this.getValue()); } catch (e) { /* host error, ignore */ }
  };
  w._emitSubmit = function () {
    try { this._hooks.onSubmit(this.getValue()); } catch (e) { /* host error, ignore */ }
  };
  w._tap = function () { try { this._hooks.sfx('tap'); } catch (e) { /* ignore */ } };

  /* default no-ops so Lane D can always call the full surface */
  if (!w.pointerMove) w.pointerMove = function () {};
  if (!w.pointerUp) w.pointerUp = function () {};
  if (!w.key) w.key = function () { return false; };

  /**
   * Wrap a widget's own render with the shared shake / dim / flash chrome.
   * `body(ctx)` draws in (already transformed) widget space.
   */
  w._frame = function (ctx, t, body) {
    this._tick(t);
    const p = this._flashP();
    ctx.save();
    if (!this.enabled) ctx.globalAlpha *= 0.45;
    let sx = 0;
    if (p !== null && this._flashKind === 'bad') {
      sx = Math.sin(p * Math.PI * 7) * (1 - p) * Math.max(4, this._rect.w * 0.012);
      ctx.translate(sx, 0);
    }
    try { body.call(this, ctx, p); } catch (e) { /* never break the host loop */ }
    ctx.restore();
    // flash veil over the widget area (after restore so shake doesn't move it)
    if (p !== null) {
      const R = this._rect;
      ctx.save();
      const glow = this._flashKind === 'bad' ? '231,76,60' : '255,211,42';
      ctx.globalAlpha = (1 - p) * 0.3;
      roundRect(ctx, R.x, R.y, R.w, R.h, Math.min(24, R.h * 0.06));
      ctx.fillStyle = 'rgba(' + glow + ',0.5)';
      ctx.fill();
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(' + glow + ',0.9)';
      ctx.stroke();
      ctx.restore();
    }
    this._drawSparks(ctx);
  };

  return w;
}

/* Shared submit-row geometry: [⌫][ ✓ ] with a 64px floor. */
function actionRow(x, y, w, h, gap) {
  const backW = clamp(w * 0.3, MIN_TAP, 150);
  const okW = Math.max(MIN_TAP, w - backW - gap);
  return {
    back: mkRect(x, y, backW, h),
    ok: mkRect(x + backW + gap, y, okW, h)
  };
}

function drawActionRow(ctx, rows, opts) {
  const o = opts || {};
  const bs = Math.min(rows.back.w, rows.back.h);
  stoneKey(ctx, rows.back, { skin: 'ghost', pressed: o.backPressed, radius: Math.min(rows.back.w, rows.back.h) * 0.26 });
  iconBackspace(ctx, rows.back.x + rows.back.w / 2,
    rows.back.y + rows.back.h / 2 + (o.backPressed ? 2 : 0), bs * 0.5, THEME.marble);

  const okOn = o.okEnabled !== false;
  ctx.save();
  if (!okOn) ctx.globalAlpha *= 0.4;
  stoneKey(ctx, rows.ok, { skin: 'gold', pressed: o.okPressed, radius: Math.min(rows.ok.w, rows.ok.h) * 0.26 });
  const s = Math.min(rows.ok.h * 0.62, rows.ok.w * 0.4);
  iconCheck(ctx, rows.ok.x + rows.ok.w / 2, rows.ok.y + rows.ok.h / 2 + (o.okPressed ? 2 : 0), s, '#3a2600');
  ctx.restore();
}

/* ================================================================== */
/* WIDGET 1 — arabic keypad                                            */
/* ================================================================== */

function makeKeypad(puzzle, hooks) {
  const w = attachCommon({}, 'arabic', hooks);
  w.text = '';
  w.pressed = null;         // key id currently held

  /* Two arrangements. TALL (the normal one): a display strip on top and a
     phone-style 3x4 pad under it. WIDE: used when the area is too short for
     four 64px rows but wide enough to sit the display beside a 4x3 pad —
     this is what keeps every key above the tap floor in landscape. */
  const TALL_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['back', '0', 'ok']];
  const WIDE_ROWS = [['1', '2', '3', '4'], ['5', '6', '7', '8'], ['9', '0', 'back', 'ok']];

  w.layout = function (rect) {
    const R = sanitizeRect(rect);
    this._rect = R;
    const gap = clamp(Math.min(R.w, R.h) * 0.025, 6, 14);
    const tallNeeds = 4 * MIN_TAP + 3 * gap + 46 + gap * 1.5;   // 4 rows + a minimum display
    const wide = R.h < tallNeeds && R.w >= R.h * 1.35;

    let rowsDef, x0, y0, keyW, keyH;
    if (wide) {
      rowsDef = WIDE_ROWS;
      const leftW = clamp(R.w * 0.34, 170, 380);
      const dispH = clamp(R.h * 0.55, 74, 200);
      this.display = mkRect(R.x, R.y + (R.h - dispH) / 2, leftW, dispH);
      keyH = clamp((R.h - gap * 2) / 3, 40, 130);
      const gw = R.w - leftW - gap * 1.5;
      keyW = Math.min((gw - gap * 3) / 4, keyH * 1.8);
      const padW = keyW * 4 + gap * 3;
      x0 = R.x + leftW + gap * 1.5 + (gw - padW) / 2;
      y0 = R.y + (R.h - (keyH * 3 + gap * 2)) / 2;
    } else {
      rowsDef = TALL_ROWS;
      let dispH = clamp(R.h * 0.24, 54, 130);
      let availH = R.h - dispH - gap * 1.5;
      if ((availH - gap * 3) / 4 < MIN_TAP) {
        dispH = Math.max(36, R.h - gap * 1.5 - (4 * MIN_TAP + gap * 3));
        availH = R.h - dispH - gap * 1.5;
      }
      keyH = clamp((availH - gap * 3) / 4, 40, 120);
      keyW = Math.min((Math.min(R.w, 620) - gap * 2) / 3, keyH * 1.7);
      const padW = keyW * 3 + gap * 2;
      const gridH = keyH * 4 + gap * 3;
      x0 = R.x + (R.w - padW) / 2;
      // keys are capped, so centre the whole stack rather than leaving a hole
      const oy = Math.max(0, (R.h - (dispH + gap * 1.5 + gridH)) * 0.5);
      y0 = R.y + oy + dispH + gap * 1.5;
      this.display = mkRect(R.x + (R.w - Math.max(padW, R.w * 0.62)) / 2, R.y + oy,
        Math.max(padW, R.w * 0.62), dispH);
    }

    this.keys = [];
    for (let r = 0; r < rowsDef.length; r++) {
      for (let c = 0; c < rowsDef[r].length; c++) {
        const id = rowsDef[r][c];
        this.keys.push({
          id: id,
          type: id === 'back' ? 'back' : (id === 'ok' ? 'ok' : 'digit'),
          rect: mkRect(x0 + c * (keyW + gap), y0 + r * (keyH + gap), keyW, keyH)
        });
      }
    }
    this.keyH = keyH;
    this.wide = wide;
    return this;
  };

  w.getValue = function () { return this.text; };
  w.isComplete = function () { return this.text.length > 0; };

  w.reset = function () {
    this.text = '';
    this.revealed = false;
    this.enabled = true;
    this._flashKind = null;
    this._sparks.length = 0;
    this._emitChange();
    return this;
  };

  w.reveal = function (p) {
    this.text = String(formatAnswer(p || puzzle) || '').slice(0, MAX_DIGITS + 2);
    this.revealed = true;
    return this;
  };

  w._type = function (d) {
    if (this.revealed) { this.text = ''; this.revealed = false; }
    if (this.text.length >= MAX_DIGITS) return;
    if (this.text === '0') this.text = '';
    this.text += d;
    this._emitChange();
  };
  w._back = function () {
    if (this.revealed) { this.text = ''; this.revealed = false; this._emitChange(); return; }
    if (!this.text.length) return;
    this.text = this.text.slice(0, -1);
    this._emitChange();
  };
  w._go = function () {
    if (!this.isComplete()) return false;
    this._emitSubmit();
    return true;
  };

  w._hit = function (x, y) {
    for (let i = 0; i < this.keys.length; i++) if (inRect(this.keys[i].rect, x, y)) return this.keys[i];
    return null;
  };

  w.pointerDown = function (x, y) {
    if (!this.enabled) return false;
    const k = this._hit(x, y);
    if (!k) return false;
    this.pressed = k.id;
    this._tap();
    return true;
  };
  w.pointerMove = function (x, y) {
    if (!this.enabled || !this.pressed) return false;
    const k = this._hit(x, y);
    if (!k || k.id !== this.pressed) this.pressed = null;
    return true;
  };
  w.pointerUp = function (x, y) {
    if (!this.enabled) { this.pressed = null; return false; }
    const id = this.pressed;
    this.pressed = null;
    if (!id) return false;
    const k = this._hit(x, y);
    if (!k || k.id !== id) return false;
    if (k.type === 'digit') { this._type(k.id); this._spark(k.rect.x + k.rect.w / 2, k.rect.y + 6, 5); }
    else if (k.type === 'back') this._back();
    else this._go();
    return true;
  };

  w.key = function (e) {
    if (!this.enabled || !e || typeof e.key !== 'string') return false;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { this._tap(); this._type(k); return true; }
    if (k === 'Backspace' || k === 'Delete') { this._tap(); this._back(); return true; }
    if (k === 'Enter' || k === ' ') { this._tap(); this._go(); return true; }
    return false;
  };

  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      /* display strip */
      const d = this.display;
      tabletPanel(c, d, 'tablet');
      const shown = this.text || '';
      const col = this.revealed ? '#6ee7a0' : THEME.gold;
      if (shown) {
        carvedText(c, shown, d.x + d.w / 2, d.y + d.h * 0.52, d.h * 0.62, col,
          { maxW: d.w * 0.8, family: FONT_DISPLAY });
      } else {
        c.save();
        c.globalAlpha *= 0.45;
        carvedText(c, 'tap the numbers', d.x + d.w / 2, d.y + d.h * 0.52,
          Math.min(d.h * 0.3, 22), THEME.sub, { maxW: d.w * 0.86, family: FONT_UI });
        c.restore();
      }
      /* keys */
      const okOn = this.isComplete();
      for (let i = 0; i < this.keys.length; i++) {
        const k = this.keys[i];
        const pr = this.pressed === k.id;
        if (k.type === 'digit') {
          const off = stoneKey(c, k.rect, { skin: 'stone', pressed: pr, radius: Math.min(k.rect.w, k.rect.h) * 0.24 });
          carvedText(c, k.id, k.rect.x + k.rect.w / 2, k.rect.y + k.rect.h / 2 + off,
            k.rect.h * 0.56, '#2a2418', { maxW: k.rect.w * 0.7, family: FONT_DISPLAY });
        } else if (k.type === 'back') {
          stoneKey(c, k.rect, { skin: 'ghost', pressed: pr, radius: Math.min(k.rect.w, k.rect.h) * 0.24 });
          iconBackspace(c, k.rect.x + k.rect.w / 2, k.rect.y + k.rect.h / 2 + (pr ? 2 : 0),
            Math.min(k.rect.w, k.rect.h) * 0.5, THEME.marble);
        } else {
          c.save();
          if (!okOn) c.globalAlpha *= 0.4;
          stoneKey(c, k.rect, { skin: 'gold', pressed: pr, radius: Math.min(k.rect.w, k.rect.h) * 0.24 });
          iconCheck(c, k.rect.x + k.rect.w / 2, k.rect.y + k.rect.h / 2 + (pr ? 2 : 0),
            Math.min(k.rect.w, k.rect.h) * 0.5, '#3a2600');
          c.restore();
        }
      }
    });
  };

  return w;
}

/* ================================================================== */
/* WIDGET 2 — roman chisel tiles                                       */
/* ================================================================== */

function makeChisel(puzzle, hooks) {
  const w = attachCommon({}, 'roman', hooks);
  w.text = '';
  w.pressed = null;

  w.layout = function (rect) {
    const R = sanitizeRect(rect);
    this._rect = R;
    const gap = clamp(R.w * 0.018, 5, 12);
    let dispH = clamp(R.h * 0.3, 74, 170);

    // one row of 7 tiles if each is wide enough for a thumb, else 4 + 3
    const oneRowW = (R.w - gap * 6) / 7;
    const letterRows = oneRowW >= MIN_TAP ? [ROMAN_LETTERS.slice()] : [ROMAN_LETTERS.slice(0, 4), ROMAN_LETTERS.slice(4)];
    const rows = letterRows.length + 1;         // + action row

    let availH = R.h - dispH - gap * 1.5;
    if (availH / rows < MIN_TAP) {
      dispH = Math.max(56, R.h - gap * 1.5 - rows * MIN_TAP);
      availH = R.h - dispH - gap * 1.5;
    }
    // cap the row height: 64px is the floor, ~112 is as tall as a key should
    // ever get, and the block is bottom-anchored so it stays in thumb reach.
    const rowH = clamp((availH - gap * (rows - 1)) / rows, 40, 112);
    const blockH = rowH * rows + gap * (rows - 1);
    // rows are capped, so centre the display + keys stack in the rect
    const oy = Math.max(0, (R.h - (dispH + gap * 1.5 + blockH)) * 0.5);
    const y0 = R.y + oy + dispH + gap * 1.5;
    const maxW = Math.min(R.w, 700);
    const bx = R.x + (R.w - maxW) / 2;

    this.display = mkRect(R.x + (R.w - maxW) / 2, R.y + oy, maxW, dispH);
    this.tiles = [];
    for (let r = 0; r < letterRows.length; r++) {
      const row = letterRows[r];
      const tw = (maxW - gap * (row.length - 1)) / row.length;
      for (let i = 0; i < row.length; i++) {
        this.tiles.push({
          id: row[i],
          rect: mkRect(bx + i * (tw + gap), y0 + r * (rowH + gap), tw, rowH)
        });
      }
    }
    this.actions = actionRow(bx, y0 + letterRows.length * (rowH + gap), maxW, rowH, gap);
    return this;
  };

  w.getValue = function () { return this.text; };
  w.isComplete = function () { return this.text.length > 0 && safeValid(this.text); };

  w.reset = function () {
    this.text = '';
    this.revealed = false;
    this.enabled = true;
    this._flashKind = null;
    this._sparks.length = 0;
    this._emitChange();
    return this;
  };

  w.reveal = function (p) {
    this.text = normRoman(formatAnswer(p || puzzle)).slice(0, MAX_ROMAN_LEN);
    this.revealed = true;
    return this;
  };

  w._type = function (L) {
    if (this.revealed) { this.text = ''; this.revealed = false; }
    if (this.text.length >= MAX_ROMAN_LEN) return;
    this.text += L;
    this._emitChange();
  };
  w._back = function () {
    if (this.revealed) { this.text = ''; this.revealed = false; this._emitChange(); return; }
    if (!this.text.length) return;
    this.text = this.text.slice(0, -1);
    this._emitChange();
  };
  w._go = function () {
    if (!this.isComplete()) return false;
    this._emitSubmit();
    return true;
  };

  w._hit = function (x, y) {
    for (let i = 0; i < this.tiles.length; i++) if (inRect(this.tiles[i].rect, x, y)) return this.tiles[i].id;
    if (inRect(this.actions.back, x, y)) return 'back';
    if (inRect(this.actions.ok, x, y)) return 'ok';
    return null;
  };

  w.pointerDown = function (x, y) {
    if (!this.enabled) return false;
    const id = this._hit(x, y);
    if (!id) return false;
    this.pressed = id;
    this._tap();
    return true;
  };
  w.pointerMove = function (x, y) {
    if (!this.enabled || !this.pressed) return false;
    if (this._hit(x, y) !== this.pressed) this.pressed = null;
    return true;
  };
  w.pointerUp = function (x, y) {
    if (!this.enabled) { this.pressed = null; return false; }
    const id = this.pressed;
    this.pressed = null;
    if (!id || this._hit(x, y) !== id) return false;
    if (id === 'back') this._back();
    else if (id === 'ok') this._go();
    else {
      this._type(id);
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.tiles[i].id === id) {
          const r = this.tiles[i].rect;
          this._spark(r.x + r.w / 2, r.y + r.h * 0.25, 8);
        }
      }
    }
    return true;
  };

  w.key = function (e) {
    if (!this.enabled || !e || typeof e.key !== 'string') return false;
    const k = e.key;
    if (k.length === 1 && ROMAN_LETTERS.indexOf(k.toUpperCase()) >= 0) {
      this._tap();
      this._type(k.toUpperCase());
      return true;
    }
    if (k === 'Backspace' || k === 'Delete') { this._tap(); this._back(); return true; }
    if (k === 'Enter' || k === ' ') { this._tap(); this._go(); return true; }
    return false;
  };

  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      const d = this.display;
      tabletPanel(c, d, 'tablet');
      const s = this.text;
      const numY = d.y + d.h * 0.38;
      const subY = d.y + d.h * 0.76;
      const valid = s.length > 0 && safeValid(s);

      if (s) {
        carvedText(c, s, d.x + d.w / 2, numY, d.h * 0.46,
          this.revealed ? '#6ee7a0' : THEME.gold, { maxW: d.w * 0.86, family: FONT_DISPLAY });
      } else {
        c.save();
        c.globalAlpha *= 0.45;
        carvedText(c, 'chisel the letters', d.x + d.w / 2, numY,
          Math.min(d.h * 0.24, 22), THEME.sub, { maxW: d.w * 0.86, family: FONT_UI });
        c.restore();
      }

      /* THE teaching payload: live decimal value of what has been carved */
      const lineSize = Math.min(d.h * 0.2, 24);
      if (!s) {
        // nothing to teach yet
      } else if (valid) {
        const v = safeFrom(s);
        uiText(c, '= ' + (v === null ? '?' : v), d.x + d.w / 2, subY, lineSize, '#9ff5c0', d.w * 0.86);
      } else {
        const why = safeReason(s) || 'not a real numeral yet';
        uiText(c, why, d.x + d.w / 2, subY, lineSize, THEME.danger, d.w * 0.9);
      }

      /* one letter size for all seven tiles: fit the widest glyph (M) once so
         I and M are not carved at wildly different sizes */
      let lsize = 24;
      if (this.tiles.length) {
        const t0 = this.tiles[0].rect;
        lsize = fitText(c, 'M', t0.w * 0.62, t0.h * 0.52, 'bold', FONT_DISPLAY);
      }
      for (let i = 0; i < this.tiles.length; i++) {
        const tl = this.tiles[i];
        const pr = this.pressed === tl.id;
        const off = stoneKey(c, tl.rect, { skin: 'basalt', pressed: pr, radius: Math.min(tl.rect.w, tl.rect.h) * 0.2 });
        carvedText(c, tl.id, tl.rect.x + tl.rect.w / 2, tl.rect.y + tl.rect.h / 2 + off,
          lsize, THEME.gold, { family: FONT_DISPLAY });
      }
      drawActionRow(c, this.actions, {
        backPressed: this.pressed === 'back',
        okPressed: this.pressed === 'ok',
        okEnabled: valid
      });
    });
  };

  return w;
}

/* ================================================================== */
/* WIDGET 3 — choice cards                                             */
/* ================================================================== */

function makeChoices(puzzle, hooks) {
  const w = attachCommon({}, 'choice', hooks);
  const choices = (Array.isArray(puzzle && puzzle.choices) ? puzzle.choices : []).slice(0, 6);
  w.choices = choices;
  w.selected = -1;
  w.pressed = -1;
  w.revealIdx = -1;
  w._commitAt = -1;

  w.layout = function (rect) {
    const R = sanitizeRect(rect);
    this._rect = R;
    const n = Math.max(1, this.choices.length);
    const gap = clamp(R.h * 0.025, 8, 18);
    this.cards = [];

    let cols = 1, rows = n;
    const vertH = (R.h - gap * (n - 1)) / n;
    if (n >= 2 && n <= 4 && R.w >= R.h * 1.35 && (R.w - gap * (n - 1)) / n >= 160) {
      // landscape: one wide row of big cards beats a stack in a 620px lane
      cols = n; rows = 1;
    } else if (n >= 3 && vertH < MIN_TAP + 20) {
      cols = 2; rows = Math.ceil(n / 2);
    }
    const cw = (R.w - gap * (cols - 1)) / cols;
    let chH = Math.max(46, (R.h - gap * (rows - 1)) / rows);
    // a single row must not become a full-height billboard
    if (rows === 1) chH = Math.min(chH, Math.max(MIN_TAP + 40, R.h * 0.7));
    // keep single-column cards from becoming absurd slabs on a wide screen
    const useW = cols === 1 ? Math.min(cw, 620) : cw;
    const gridW = useW * cols + gap * (cols - 1);
    const gridH = chH * rows + gap * (rows - 1);
    const x0 = R.x + (R.w - gridW) / 2;
    const y0 = R.y + Math.max(0, (R.h - gridH) * 0.42);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), cIdx = i % cols;
      this.cards.push(mkRect(x0 + cIdx * (useW + gap), y0 + r * (chH + gap), useW, chH));
    }
    return this;
  };

  w.getValue = function () { return this.selected; };
  w.isComplete = function () { return this.selected >= 0; };

  w.reset = function () {
    this.selected = -1;
    this.pressed = -1;
    this.revealIdx = -1;
    this.revealed = false;
    this._commitAt = -1;
    this.enabled = true;
    this._flashKind = null;
    this._sparks.length = 0;
    this._emitChange();
    return this;
  };

  w.reveal = function (p) {
    const i = toInt((p || puzzle || {}).answer);
    this.revealIdx = (i === null) ? -1 : i;
    this.revealed = true;
    return this;
  };

  w._flushCommit = function () {
    if (this._commitAt < 0) return;
    this._commitAt = -1;
    this._emitSubmit();
  };

  w._choose = function (i) {
    if (i < 0 || i >= this.cards.length) return false;
    this._flushCommit();
    this.selected = i;
    this._emitChange();
    const r = this.cards[i];
    this._spark(r.x + r.w / 2, r.y + r.h * 0.3, 8);
    // brief press animation before committing so it feels deliberate
    this._commitAt = this._clock + 0.1;
    return true;
  };

  w._hit = function (x, y) {
    for (let i = 0; i < this.cards.length; i++) if (inRect(this.cards[i], x, y)) return i;
    return -1;
  };

  w.pointerDown = function (x, y) {
    if (!this.enabled) return false;
    const i = this._hit(x, y);
    if (i < 0) return false;
    this.pressed = i;
    this._tap();
    return true;
  };
  w.pointerMove = function (x, y) {
    if (!this.enabled || this.pressed < 0) return false;
    if (this._hit(x, y) !== this.pressed) this.pressed = -1;
    return true;
  };
  w.pointerUp = function (x, y) {
    if (!this.enabled) { this.pressed = -1; return false; }
    const i = this.pressed;
    this.pressed = -1;
    if (i < 0 || this._hit(x, y) !== i) return false;
    return this._choose(i);
  };

  w.key = function (e) {
    if (!this.enabled || !e || typeof e.key !== 'string') return false;
    const k = e.key;
    if (/^[1-6]$/.test(k)) {
      const i = parseInt(k, 10) - 1;
      if (i < this.cards.length) { this._tap(); this._choose(i); return true; }
      return false;
    }
    if (k === 'Enter' && this.selected >= 0) { this._tap(); this._emitSubmit(); return true; }
    return false;
  };

  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      for (let i = 0; i < this.cards.length; i++) {
        const r = this.cards[i];
        const ch = this.choices[i] || {};
        const isSel = this.selected === i;
        const isRev = this.revealIdx === i;
        const pr = this.pressed === i || (isSel && this._commitAt >= 0);
        const hl = isRev ? '#6ee7a0' : (isSel ? THEME.gold : null);
        const off = stoneKey(c, r, {
          skin: 'basalt', pressed: pr, highlight: hl,
          radius: Math.min(r.w, r.h) * 0.18
        });
        const hasSub = ch.sub != null && String(ch.sub) !== '';
        const label = String(ch.label != null ? ch.label : (i + 1));
        const lblY = r.y + r.h * (hasSub ? 0.4 : 0.5) + off;
        carvedText(c, label, r.x + r.w / 2, lblY, r.h * (hasSub ? 0.42 : 0.5),
          isRev ? '#9ff5c0' : THEME.marble, { maxW: r.w * 0.86, family: FONT_DISPLAY });
        if (hasSub) {
          uiText(c, String(ch.sub), r.x + r.w / 2, r.y + r.h * 0.76 + off,
            Math.min(r.h * 0.2, 20), THEME.sub, r.w * 0.86);
        }
        // number key hint (desktop) in the corner
        if (i < 6) {
          c.save();
          c.globalAlpha *= 0.4;
          uiText(c, String(i + 1), r.x + r.w * 0.075, r.y + r.h * 0.2 + off,
            Math.min(r.h * 0.18, 16), THEME.sub, r.w * 0.2);
          c.restore();
        }
      }
      if (this._commitAt >= 0 && this._clock >= this._commitAt) this._flushCommit();
    });
  };

  return w;
}

/* ================================================================== */
/* WIDGET 4 — ordering tray                                            */
/* ================================================================== */

function makeOrder(puzzle, hooks) {
  const w = attachCommon({}, 'order', hooks);
  // 5 is the cap: at 380px a 6th slot would fall under the 64px tap floor.
  const choices = (Array.isArray(puzzle && puzzle.choices) ? puzzle.choices : []).slice(0, 5);
  w.choices = choices;
  w.slots = choices.map(function () { return -1; });   // slot -> choice index
  w.drag = null;
  w.pressed = null;

  w.layout = function (rect) {
    const R = sanitizeRect(rect);
    this._rect = R;
    const n = Math.max(1, this.choices.length);
    const gap = clamp(R.w * 0.015, 5, 12);
    const labelH = clamp(R.h * 0.08, 16, 26);
    const btnH = clamp(R.h * 0.2, MIN_TAP, 84);

    // rows: [labels][slots][gap][tray rows][ ... ][submit]
    const trayRows = n > 4 ? 2 : 1;
    const bodyH = R.h - labelH - btnH - gap * 3;
    const slotH = clamp(bodyH * 0.46, 44, 112);
    const trayH = clamp((bodyH - slotH - gap) / trayRows, 44, 112);
    // keep chips from turning into slabs on a wide screen
    const rowW = Math.min(R.w, 660);
    const rx = R.x + (R.w - rowW) / 2;

    const slotW = (rowW - gap * (n - 1)) / n;
    const sy = R.y + labelH + gap * 0.5;
    this.labelY = R.y + labelH * 0.5;
    this.slotRects = [];
    for (let i = 0; i < n; i++) this.slotRects.push(mkRect(rx + i * (slotW + gap), sy, slotW, slotH));

    // slots sit under the label rail; the tray is anchored just above the
    // submit button so the flow reads bottom (source) -> top (answer row)
    const trayBlockH = trayH * trayRows + gap * (trayRows - 1);
    const ty = Math.max(sy + slotH + gap * 1.5,
      R.y + R.h - btnH - gap * 1.5 - trayBlockH);
    const perRow = Math.ceil(n / trayRows);
    const tw = (rowW - gap * (perRow - 1)) / perRow;
    this.trayRects = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      this.trayRects.push(mkRect(rx + c * (tw + gap), ty + r * (trayH + gap), tw, trayH));
    }
    // "drop anywhere below the slots" returns a chip to the tray
    const zoneTop = sy + slotH + gap * 0.5;
    this.trayZone = mkRect(R.x, zoneTop, R.w, Math.max(trayBlockH, ty + trayBlockH - zoneTop));
    this.okRect = mkRect(R.x + R.w * 0.22, R.y + R.h - btnH, R.w * 0.56, btnH);
    return this;
  };

  w.getValue = function () {
    const out = [];
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] >= 0) out.push(this.slots[i]);
    return out;
  };
  w.isComplete = function () {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] < 0) return false;
    return this.slots.length > 0;
  };

  w.reset = function () {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = -1;
    this.drag = null;
    this.pressed = null;
    this.revealed = false;
    this.enabled = true;
    this._flashKind = null;
    this._sparks.length = 0;
    this._emitChange();
    return this;
  };

  w.reveal = function (p) {
    const ans = (p || puzzle || {}).answer;
    if (Array.isArray(ans)) {
      for (let i = 0; i < this.slots.length; i++) {
        const v = toInt(ans[i]);
        this.slots[i] = (v === null || v < 0 || v >= this.choices.length) ? -1 : v;
      }
    }
    this.revealed = true;
    return this;
  };

  /** where is choice `ci` currently? -> slot index or -1 (in the tray) */
  w._slotOf = function (ci) {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] === ci) return i;
    return -1;
  };
  w._firstEmpty = function () {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] < 0) return i;
    return -1;
  };

  w._place = function (ci, slot) {
    const from = this._slotOf(ci);
    if (from === slot) return;
    const occupant = this.slots[slot];
    if (from >= 0) this.slots[from] = -1;
    if (occupant >= 0 && from >= 0) this.slots[from] = occupant;   // swap
    // if the chip came from the tray, any occupant is simply bumped back to
    // the tray — the tray is implicit (anything not in `slots`).
    this.slots[slot] = ci;
    this.revealed = false;
    this._emitChange();
    const r = this.slotRects[slot];
    this._spark(r.x + r.w / 2, r.y + r.h * 0.3, 6);
  };
  w._toTray = function (ci) {
    const from = this._slotOf(ci);
    if (from < 0) return;
    this.slots[from] = -1;
    this.revealed = false;
    this._emitChange();
  };

  w._chipRect = function (ci) {
    const s = this._slotOf(ci);
    return s >= 0 ? this.slotRects[s] : this.trayRects[ci];
  };

  w._hitChip = function (x, y) {
    for (let i = 0; i < this.choices.length; i++) {
      const r = this._chipRect(i);
      if (inRect(r, x, y)) return i;
    }
    return -1;
  };
  w._hitSlot = function (x, y) {
    for (let i = 0; i < this.slotRects.length; i++) if (inRect(this.slotRects[i], x, y)) return i;
    return -1;
  };

  w.pointerDown = function (x, y) {
    if (!this.enabled) return false;
    const ci = this._hitChip(x, y);
    if (ci >= 0) {
      const r = this._chipRect(ci);
      this.drag = { ci: ci, x: x, y: y, ox: x - r.x, oy: y - r.y, moved: false, from: this._slotOf(ci) };
      this.pressed = 'chip' + ci;
      this._tap();
      return true;
    }
    if (inRect(this.okRect, x, y)) { this.pressed = 'ok'; this._tap(); return true; }
    return false;
  };

  w.pointerMove = function (x, y) {
    if (!this.enabled) return false;
    if (this.drag) {
      if (Math.abs(x - this.drag.x) > 6 || Math.abs(y - this.drag.y) > 6) this.drag.moved = true;
      this.drag.x = x;
      this.drag.y = y;
      return true;
    }
    if (this.pressed === 'ok' && !inRect(this.okRect, x, y)) this.pressed = null;
    return false;
  };

  w.pointerUp = function (x, y) {
    if (!this.enabled) { this.drag = null; this.pressed = null; return false; }
    const pressed = this.pressed;
    this.pressed = null;
    const d = this.drag;
    this.drag = null;

    if (d) {
      if (!d.moved) {
        // tap: tray -> next empty slot, placed -> back to tray
        if (d.from >= 0) this._toTray(d.ci);
        else {
          const s = this._firstEmpty();
          if (s >= 0) this._place(d.ci, s);
        }
        return true;
      }
      const slot = this._hitSlot(x, y);
      if (slot >= 0) this._place(d.ci, slot);
      else if (inRect(this.trayZone, x, y)) this._toTray(d.ci);
      return true;
    }
    if (pressed === 'ok' && inRect(this.okRect, x, y)) {
      if (this.isComplete()) this._emitSubmit();
      return true;
    }
    return false;
  };

  w.key = function (e) {
    if (!this.enabled || !e || typeof e.key !== 'string') return false;
    const k = e.key;
    if (/^[1-6]$/.test(k)) {
      const ci = parseInt(k, 10) - 1;
      if (ci >= this.choices.length) return false;
      this._tap();
      if (this._slotOf(ci) >= 0) this._toTray(ci);
      else {
        const s = this._firstEmpty();
        if (s >= 0) this._place(ci, s);
      }
      return true;
    }
    if (k === 'Backspace' || k === 'Delete') {
      this._tap();
      for (let i = this.slots.length - 1; i >= 0; i--) {
        if (this.slots[i] >= 0) { this.slots[i] = -1; this._emitChange(); break; }
      }
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      this._tap();
      if (this.isComplete()) this._emitSubmit();
      return true;
    }
    return false;
  };

  w._drawChip = function (c, r, ci, pressed, ghost) {
    const ch = this.choices[ci] || {};
    const off = stoneKey(c, r, {
      skin: 'stone', pressed: pressed,
      radius: Math.min(r.w, r.h) * 0.2,
      alpha: ghost ? 0.7 : 1,
      highlight: this.revealed ? '#6ee7a0' : null
    });
    const hasSub = ch.sub != null && String(ch.sub) !== '';
    carvedText(c, String(ch.label != null ? ch.label : ci + 1),
      r.x + r.w / 2, r.y + r.h * (hasSub ? 0.42 : 0.5) + off,
      r.h * (hasSub ? 0.4 : 0.46), '#2a2418', { maxW: r.w * 0.84, family: FONT_DISPLAY });
    if (hasSub) {
      uiText(c, String(ch.sub), r.x + r.w / 2, r.y + r.h * 0.76 + off,
        Math.min(r.h * 0.2, 16), '#5b5340', r.w * 0.86);
    }
    if (!ghost && this._slotOf(ci) < 0) {
      // desktop key hint, only while the chip is still in the tray
      c.save();
      c.globalAlpha *= 0.45;
      uiText(c, String(ci + 1), r.x + r.w * 0.12, r.y + r.h * 0.2 + off,
        Math.min(r.h * 0.18, 15), '#5b5340', r.w * 0.2);
      c.restore();
    }
  };

  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      const R = this._rect;
      const lblSize = Math.min(20, Math.max(11, R.h * 0.045));
      /* smallest -> largest guide rail */
      uiText(c, 'smallest', R.x + R.w * 0.11, this.labelY, lblSize, THEME.sub, R.w * 0.24);
      uiText(c, 'largest', R.x + R.w * 0.89, this.labelY, lblSize, THEME.sub, R.w * 0.24);
      c.save();
      c.globalAlpha *= 0.5;
      c.strokeStyle = THEME.glow;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(R.x + R.w * 0.24, this.labelY);
      c.lineTo(R.x + R.w * 0.74, this.labelY);
      c.stroke();
      c.beginPath();
      c.moveTo(R.x + R.w * 0.74, this.labelY);
      c.lineTo(R.x + R.w * 0.72, this.labelY - 5);
      c.lineTo(R.x + R.w * 0.72, this.labelY + 5);
      c.closePath();
      c.fillStyle = THEME.glow;
      c.fill();
      c.restore();

      /* slots */
      for (let i = 0; i < this.slotRects.length; i++) {
        const r = this.slotRects[i];
        if (this.slots[i] < 0) {
          socket(c, r, Math.min(r.w, r.h) * 0.2, 0.3 + 0.3 * Math.sin(this._clock * 2.6 + i));
          c.save();
          c.globalAlpha *= 0.4;
          uiText(c, '?', r.x + r.w / 2, r.y + r.h / 2, Math.min(r.h * 0.34, 26), THEME.sub, r.w * 0.6);
          c.restore();
        }
      }
      /* tray positions whose chip has been placed — quiet placeholders */
      for (let i = 0; i < this.trayRects.length; i++) {
        const tr = this.trayRects[i];
        if (this._slotOf(i) >= 0) ghostSocket(c, tr, Math.min(tr.w, tr.h) * 0.2);
      }
      /* chips (skip the dragged one — drawn last) */
      for (let i = 0; i < this.choices.length; i++) {
        if (this.drag && this.drag.moved && this.drag.ci === i) continue;
        const s = this._slotOf(i);
        const r = s >= 0 ? this.slotRects[s] : this.trayRects[i];
        this._drawChip(c, r, i, this.pressed === 'chip' + i && !(this.drag && this.drag.moved));
      }
      /* submit */
      const okOn = this.isComplete();
      c.save();
      if (!okOn) c.globalAlpha *= 0.4;
      stoneKey(c, this.okRect, { skin: 'gold', pressed: this.pressed === 'ok', radius: this.okRect.h * 0.3 });
      iconCheck(c, this.okRect.x + this.okRect.w / 2,
        this.okRect.y + this.okRect.h / 2 + (this.pressed === 'ok' ? 2 : 0),
        Math.min(this.okRect.h * 0.55, 40), '#3a2600');
      c.restore();

      /* dragged chip on top */
      if (this.drag && this.drag.moved) {
        const base = this._chipRect(this.drag.ci);
        const gr = mkRect(this.drag.x - this.drag.ox, this.drag.y - this.drag.oy, base.w, base.h);
        const slot = this._hitSlot(this.drag.x, this.drag.y);
        if (slot >= 0) {
          const sr = this.slotRects[slot];
          c.save();
          roundRect(c, sr.x, sr.y, sr.w, sr.h, Math.min(sr.w, sr.h) * 0.2);
          c.lineWidth = 3;
          c.strokeStyle = THEME.gold;
          c.stroke();
          c.restore();
        }
        this._drawChip(c, gr, this.drag.ci, false, true);
      }
    });
  };

  return w;
}

/* ================================================================== */
/* WIDGET 5 — balance scales                                           */
/* ================================================================== */

/** Pick the weight-pool arrangement giving the biggest discs inside `box`.
 *  Prefers any arrangement that stays on the 64px tap floor; if none can,
 *  returns the roomiest one so the caller can still lay something out. */
function poolGrid(box, n, gap, maxDisc) {
  let best = null, roomiest = null;
  for (let perRow = 1; perRow <= n; perRow++) {
    const rows = Math.ceil(n / perRow);
    const d = Math.min((box.w - gap * (perRow - 1)) / perRow,
      (box.h - gap * (rows - 1)) / rows, maxDisc);
    const cand = { perRow: perRow, rows: rows, d: d };
    if (!roomiest || d > roomiest.d) roomiest = cand;
    if (d >= MIN_TAP && (!best || d > best.d)) best = cand;
  }
  return best || roomiest;
}

function makeScales(puzzle, hooks) {
  const w = attachCommon({}, 'scales', hooks);
  const sc = (puzzle && puzzle.scales) || {};
  const pool = (Array.isArray(sc.pool) ? sc.pool : []).slice(0, 12);
  w.pool = pool;
  w.target = num(Number(sc.target), num(Number(puzzle && puzzle.answer), 0));
  w.targetRoman = String(sc.targetRoman || safeTo(w.target));
  w.picked = [];            // pool indices, in tap order
  w.angle = 0;
  w.vel = 0;
  w.pressed = null;

  w.layout = function (rect) {
    const R = sanitizeRect(rect);
    this._rect = R;
    const n = Math.max(1, this.pool.length);
    const gap = clamp(Math.min(R.w, R.h) * 0.022, 6, 14);
    const btnH = clamp(R.h * 0.19, MIN_TAP, 84);
    const reserved = btnH + gap * 1.5;

    /* The beam is the teaching object, and it needs HEIGHT: stacked under a
       two-row weight pool in a 600px-tall landscape rect it was left ~120px,
       which shrank the pans and pan captions to ~8px. So in a wide, short rect
       the pool and the submit button go in a column BESIDE the scale. */
    const wide = R.w >= R.h * 1.45 && R.h < 420;
    let beamBox, poolBox, grid;

    if (wide) {
      const leftW = Math.max(R.w * 0.5, R.w - 420);
      const rx = R.x + leftW + gap, rw = R.w - leftW - gap;
      poolBox = mkRect(rx, R.y, rw, Math.max(MIN_TAP, R.h - reserved));
      grid = poolGrid(poolBox, n, gap, 104);
      beamBox = mkRect(R.x, R.y, leftW, R.h);
      this.okRect = mkRect(rx + rw * 0.08, R.y + R.h - btnH, rw * 0.84, btnH);
    } else {
      // give the pool the least height that keeps the discs on the tap floor
      const fracs = [0.30, 0.38, 0.46, 0.54];
      for (let i = 0; i < fracs.length; i++) {
        const h = Math.max(MIN_TAP, R.h * fracs[i]);
        const box = mkRect(R.x, R.y + R.h - reserved - h, R.w, h);
        const g2 = poolGrid(box, n, gap, 104);
        if (!grid || g2.d > grid.d) { poolBox = box; grid = g2; }
        if (g2.d >= MIN_TAP) { poolBox = box; grid = g2; break; }
      }
      this.okRect = mkRect(R.x + R.w * 0.22, R.y + R.h - btnH, R.w * 0.56, btnH);
    }

    const disc = Math.max(24, grid.d);
    const rowW = disc * grid.perRow + gap * (grid.perRow - 1);
    const colH = disc * grid.rows + gap * (grid.rows - 1);
    if (!wide && colH < poolBox.h) {
      // bottom-align the pool to its content and hand the slack to the beam
      poolBox = mkRect(poolBox.x, poolBox.y + poolBox.h - colH, poolBox.w, colH);
    }
    if (!wide) beamBox = mkRect(R.x, R.y, R.w, Math.max(60, poolBox.y - R.y - gap));

    const px0 = poolBox.x + (poolBox.w - rowW) / 2;
    const py0 = poolBox.y + (poolBox.h - colH) / 2;
    this.poolRects = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / grid.perRow), c = i % grid.perRow;
      this.poolRects.push(mkRect(px0 + c * (disc + gap), py0 + r * (disc + gap), disc, disc));
    }
    this.beam = beamBox;

    /* Beam geometry, budgeted as fractions of the beam area's height D so the
       lowest thing (a fully tilted pan plus its caption) always stays inside:
       0.22 pivot + 0.20 max drop + 0.12 hang + 0.19 bowl + 0.20 caption. */
    const b = this.beam;
    const D = Math.min(b.h, 400);                 // the scale never grows past this
    this.D = D;
    const top = b.y + (b.h - D) * 0.4;
    this.standBottom = top + D * 0.86;            // short enough not to read as a tower
    this.pivot = { x: b.x + b.w / 2, y: top + D * 0.22 };
    this.armLen = Math.min(b.w * 0.34, 230);
    this.panR = clamp(Math.min(this.armLen * 0.55, D * 0.19), 22, 92);
    this.hangLen = clamp(D * 0.12, 12, 46);
    this.maxTilt = Math.min(0.3, Math.asin(clamp(D * 0.2 / Math.max(1, this.armLen), 0, 1)));
    this.capSize = clamp(D * 0.1, 12, 22);
    /* Caption width: the two pan captions are 2*armLen apart, so giving each
       0.9*armLen still leaves a clear gap — and stops 'MCCXL = 1240' being
       squeezed to ~10px on a phone by a bowl-sized budget. */
    this.capW = Math.max(this.panR * 2.2, Math.min(this.armLen * 0.9, b.w * 0.42));
    this.discMini = clamp(this.panR * 0.32, 8, 18);
    return this;
  };

  w.getValue = function () { return this.picked.slice(); };
  w.isComplete = function () { return this.picked.length > 0; };
  w.sum = function () {
    let s = 0;
    for (let i = 0; i < this.picked.length; i++) s += Number(this.pool[this.picked[i]] && this.pool[this.picked[i]].value) || 0;
    return s;
  };

  w.reset = function () {
    this.picked.length = 0;
    this.revealed = false;
    this.enabled = true;
    this.pressed = null;
    this._flashKind = null;
    this._sparks.length = 0;
    this._emitChange();
    return this;
  };

  w.reveal = function (p) {
    const s2 = ((p || puzzle || {}).scales) || {};
    const target = num(Number(s2.target), this.target);
    const sub = findSubset(this.pool, target);
    this.picked = sub ? sub.slice() : this.picked;
    this.revealed = true;
    return this;
  };

  w._add = function (i) {
    if (this.picked.indexOf(i) >= 0) return false;
    this.picked.push(i);
    this.revealed = false;
    this._emitChange();
    const r = this.poolRects[i];
    this._spark(r.x + r.w / 2, r.y + r.h * 0.3, 6);
    return true;
  };
  w._remove = function (i) {
    const k = this.picked.indexOf(i);
    if (k < 0) return false;
    this.picked.splice(k, 1);
    this.revealed = false;
    this._emitChange();
    return true;
  };

  /** pan hang points for the current animated tilt (beam ends) */
  w._pans = function () {
    const a = this.angle, p = this.pivot, L = this.armLen;
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    return {
      left: { x: p.x - dx, y: p.y - dy },
      right: { x: p.x + dx, y: p.y + dy }
    };
  };

  /** rect of the mini disc slot `k`, stacked up from the right pan's chord */
  w._panDiscRect = function (k, panCx, panCy) {
    const per = 4;
    const s = this.discMini * 2;
    const row = Math.floor(k / per), col = k % per;
    const cnt = Math.min(this.picked.length - row * per, per);
    const rowW = cnt * s + (cnt - 1) * 3;
    const x = panCx - rowW / 2 + col * (s + 3);
    const bottom = panCy + this.hangLen - row * (s + 3);
    return mkRect(x, bottom - s, s, s);
  };

  w._hit = function (x, y) {
    for (let i = 0; i < this.poolRects.length; i++) {
      if (this.picked.indexOf(i) >= 0) continue;
      if (inRect(this.poolRects[i], x, y)) return { kind: 'pool', i: i };
    }
    const pans = this._pans();
    // right pan: any mini disc, else the pan bowl (removes the last)
    for (let k = this.picked.length - 1; k >= 0; k--) {
      const r = this._panDiscRect(k, pans.right.x, pans.right.y);
      if (inRect(r, x, y)) return { kind: 'pan', i: this.picked[k] };
    }
    const bowl = mkRect(pans.right.x - this.panR, pans.right.y + this.hangLen - this.panR * 0.5,
      this.panR * 2, this.panR * 0.95);
    if (this.picked.length && inRect(bowl, x, y)) {
      return { kind: 'pan', i: this.picked[this.picked.length - 1] };
    }
    if (inRect(this.okRect, x, y)) return { kind: 'ok', i: -1 };
    return null;
  };

  w.pointerDown = function (x, y) {
    if (!this.enabled) return false;
    const h = this._hit(x, y);
    if (!h) return false;
    this.pressed = h.kind + ':' + h.i;
    this._tap();
    return true;
  };
  w.pointerMove = function (x, y) {
    if (!this.enabled || !this.pressed) return false;
    const h = this._hit(x, y);
    if (!h || this.pressed !== h.kind + ':' + h.i) this.pressed = null;
    return true;
  };
  w.pointerUp = function (x, y) {
    if (!this.enabled) { this.pressed = null; return false; }
    const was = this.pressed;
    this.pressed = null;
    if (!was) return false;
    const h = this._hit(x, y);
    if (!h || was !== h.kind + ':' + h.i) return false;
    if (h.kind === 'pool') this._add(h.i);
    else if (h.kind === 'pan') this._remove(h.i);
    else if (this.isComplete()) this._emitSubmit();
    return true;
  };

  w.key = function (e) {
    if (!this.enabled || !e || typeof e.key !== 'string') return false;
    const k = e.key;
    if (/^[1-9]$/.test(k)) {
      const i = parseInt(k, 10) - 1;
      if (i >= this.pool.length) return false;
      this._tap();
      if (this.picked.indexOf(i) >= 0) this._remove(i); else this._add(i);
      return true;
    }
    if (k === 'Backspace' || k === 'Delete') {
      this._tap();
      if (this.picked.length) { this.picked.pop(); this._emitChange(); }
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      this._tap();
      if (this.isComplete()) this._emitSubmit();
      return true;
    }
    return false;
  };

  w._pan = function (c, cx, cy) {
    const R = this.panR, hang = this.hangLen;
    c.save();
    // two ropes
    c.strokeStyle = 'rgba(232,226,208,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx - R * 0.8, cy + hang);
    c.moveTo(cx, cy);
    c.lineTo(cx + R * 0.8, cy + hang);
    c.stroke();
    // bowl
    c.beginPath();
    c.moveTo(cx - R, cy + hang);
    c.quadraticCurveTo(cx, cy + hang + R * 0.85, cx + R, cy + hang);
    c.closePath();
    c.fillStyle = '#a5762b';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.stroke();
    c.restore();
  };

  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      const dt = clamp(this._dt, 0, 0.05);
      /* spring the beam toward the tilt the current load implies.
         diff > 0 -> the right pan is too LIGHT -> it rises -> negative angle. */
      const diff = this.target - this.sum();
      const norm = clamp(diff / Math.max(1, Math.abs(this.target)), -1, 1);
      // ease the response so a 10-out-of-70 miss is still visibly off level
      const shaped = (norm < 0 ? -1 : 1) * Math.pow(Math.abs(norm), 0.55);
      const goal = -shaped * this.maxTilt;             // radians, clamped tilt
      const k = 34, damp = 7.5;
      this.vel += (goal - this.angle) * k * dt - this.vel * damp * dt;
      this.vel = clamp(this.vel, -8, 8);
      this.angle += this.vel * dt;
      if (Math.abs(goal - this.angle) < 0.0008 && Math.abs(this.vel) < 0.004) {
        this.angle = goal; this.vel = 0;
      }
      const balanced = this.sum() === this.target;

      const b = this.beam, p = this.pivot;
      const pans = this._pans();

      /* stand: a slim fluted column on a plinth */
      const D2 = this.D || Math.min(b.h, 400);
      const footY = this.standBottom - Math.max(6, D2 * 0.05);
      const colTop = Math.max(6, D2 * 0.035), colBot = Math.max(9, D2 * 0.055);
      c.save();
      c.fillStyle = 'rgba(88,88,150,0.92)';
      c.beginPath();
      c.moveTo(p.x - colTop, p.y);
      c.lineTo(p.x + colTop, p.y);
      c.lineTo(p.x + colBot, footY);
      c.lineTo(p.x - colBot, footY);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(232,226,208,0.3)';
      c.lineWidth = 1.5;
      c.stroke();
      const plw = colBot * 3.4, plh = Math.max(6, D2 * 0.05);
      roundRect(c, p.x - plw / 2, footY, plw, plh, plh * 0.3);
      c.fillStyle = 'rgba(120,120,180,0.9)';
      c.fill();
      c.stroke();
      /* a soft contact shadow so the plinth sits ON something. Squashed circle
         rather than ctx.ellipse — same shape, no API-support question. */
      const shW = plw * 0.85, shH = Math.max(2.5, plh * 0.34);
      c.save();
      c.translate(p.x, footY + plh);
      c.scale(1, shH / shW);
      c.beginPath();
      c.arc(0, 0, shW, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,0.26)';
      c.fill();
      c.restore();
      c.restore();

      /* beam */
      c.save();
      c.translate(p.x, p.y);
      c.rotate(this.angle);
      const bh = Math.max(6, this.armLen * 0.055);
      roundRect(c, -this.armLen, -bh / 2, this.armLen * 2, bh, bh / 2);
      c.fillStyle = balanced ? THEME.gold : '#cbb27a';
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
      // pivot cap
      c.beginPath();
      c.arc(p.x, p.y, Math.max(5, bh * 0.9), 0, Math.PI * 2);
      c.fillStyle = balanced ? THEME.gold : '#e8e2d0';
      c.fill();

      this._pan(c, pans.left.x, pans.left.y);
      this._pan(c, pans.right.x, pans.right.y);

      /* left pan = the fixed target, carved on a marble block sitting in the pan */
      const blockW = this.panR * 1.55, blockH = this.panR * 0.72;
      const bx2 = pans.left.x - blockW / 2, by2 = pans.left.y + this.hangLen - blockH;
      stoneKey(c, mkRect(bx2, by2, blockW, blockH), { skin: 'stone', radius: blockH * 0.2 });
      carvedText(c, this.targetRoman, pans.left.x, by2 + blockH * 0.5,
        blockH * 0.62, '#2a2418', { maxW: blockW * 0.84, family: FONT_DISPLAY });
      uiText(c, this.targetRoman + ' = ' + this.target, pans.left.x,
        pans.left.y + this.hangLen + this.panR * 0.5 + this.capSize * 0.9,
        this.capSize, THEME.gold, this.capW || this.panR * 2.2);

      /* right pan = the chosen weights */
      for (let k2 = 0; k2 < this.picked.length; k2++) {
        const r = this._panDiscRect(k2, pans.right.x, pans.right.y);
        c.save();
        c.beginPath();
        c.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
        c.fillStyle = '#e0ab52';
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = 'rgba(60,34,0,0.55)';
        c.stroke();
        c.restore();
        const pv = this.pool[this.picked[k2]] || {};
        uiText(c, String(pv.label != null ? pv.label : pv.value), r.x + r.w / 2, r.y + r.h / 2,
          Math.max(9, r.w * 0.42), '#2e1c00', r.w * 0.9);
      }
      /* running total, in one carved caption under the pan */
      const s = this.sum();
      const totY = pans.right.y + this.hangLen + this.panR * 0.5 + this.capSize * 0.9;
      const totText = s > 0 ? (s < 4000 ? safeTo(s) + ' = ' + s : String(s)) : 'empty';
      carvedText(c, totText, pans.right.x, totY, this.capSize * 1.25,
        balanced ? '#9ff5c0' : THEME.marble, { maxW: this.capW || this.panR * 2.4, family: FONT_DISPLAY });

      if (balanced) {
        uiText(c, 'balanced!', p.x, b.y + Math.min(18, b.h * 0.07),
          Math.min(22, b.h * 0.1), THEME.gold, b.w * 0.5);
      }

      /* weight pool */
      for (let i = 0; i < this.poolRects.length; i++) {
        const r = this.poolRects[i];
        const used = this.picked.indexOf(i) >= 0;
        const pv = this.pool[i] || {};
        if (used) {
          ghostSocket(c, r, r.w / 2);
          continue;
        }
        const off = stoneKey(c, r, {
          skin: 'bronze', pressed: this.pressed === 'pool:' + i, radius: r.w / 2
        });
        carvedText(c, String(pv.label != null ? pv.label : pv.value),
          r.x + r.w / 2, r.y + r.h * 0.44 + off, r.h * 0.34, '#2e1c00',
          { maxW: r.w * 0.78, family: FONT_DISPLAY });
        uiText(c, '= ' + (pv.value != null ? pv.value : '?'), r.x + r.w / 2, r.y + r.h * 0.74 + off,
          Math.max(9, r.h * 0.15), '#4a3208', r.w * 0.8);
      }

      /* submit */
      const okOn = this.isComplete();
      c.save();
      if (!okOn) c.globalAlpha *= 0.4;
      stoneKey(c, this.okRect, { skin: 'gold', pressed: this.pressed === 'ok:-1', radius: this.okRect.h * 0.3 });
      iconCheck(c, this.okRect.x + this.okRect.w / 2,
        this.okRect.y + this.okRect.h / 2 + (this.pressed === 'ok:-1' ? 2 : 0),
        Math.min(this.okRect.h * 0.55, 40), '#3a2600');
      c.restore();
    });
  };

  return w;
}

/* ================================================================== */
/* inert fallback (never let a malformed puzzle break the play screen)  */
/* ================================================================== */

function makeInert(puzzle, hooks) {
  const w = attachCommon({}, 'none', hooks);
  w.layout = function (rect) { this._rect = sanitizeRect(rect); return this; };
  w.draw = function (ctx, t) {
    this._frame(ctx, t, function (c) {
      const R = this._rect;
      tabletPanel(c, R, 'tablet');
      uiText(c, 'no input for this puzzle', R.x + R.w / 2, R.y + R.h / 2,
        Math.min(22, R.h * 0.12), THEME.sub, R.w * 0.8);
    });
  };
  w.pointerDown = function () { return false; };
  w.getValue = function () { return null; };
  w.isComplete = function () { return false; };
  w.reveal = function () { this.revealed = true; return this; };
  w.reset = function () { return this; };
  return w;
}

/* ================================================================== */
/* createInput                                                         */
/* ================================================================== */

/**
 * Build the input widget for `puzzle`. `hooks = {onSubmit, onChange, sfx}`.
 * `layout(rect)` must be called before the first `draw`.
 */
export function createInput(puzzle, hooks) {
  const kind = puzzle && puzzle.answerKind;
  try {
    switch (kind) {
      case 'arabic': return makeKeypad(puzzle, hooks);
      case 'roman': return makeChisel(puzzle, hooks);
      case 'choice': return makeChoices(puzzle, hooks);
      case 'order': return makeOrder(puzzle, hooks);
      case 'scales': return makeScales(puzzle, hooks);
      default: return makeInert(puzzle, hooks);
    }
  } catch (e) {
    return makeInert(puzzle, hooks);
  }
}
