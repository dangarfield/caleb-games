// Caesar's Challenge — provinces, per-level knobs, and the deterministic
// puzzle generator (LANE A).
//
// Everything here is a pure function of the level number. No Date.now(), no
// Math.random(), no DOM. buildLevel(n) called twice is deep-equal, forever.
//
// Difficulty ramps monotonically over all 100 levels on four axes:
//   1. value range   (maxValue: 10 -> 3999)
//   2. type mix      (13 types unlocked on a fixed ladder, early types decay)
//   3. expression length (1 operator -> 3 operators)
//   4. forgiveness   (maxMistakes 3 -> 2, free hints 3 -> 0, sundial 20s -> 8s)

import { makeRng, pick, shuffle, randInt } from './rng.js';
import {
  SYMBOLS, LETTERS, toRoman, fromRoman, isValidRoman, makeForgery, letterValue
} from './numerals.js';

/* ================================================================== *
 * Provinces
 * ================================================================== */

/** 10 provinces of 10 levels. `index` is the 0-based array index. */
export const PROVINCES = [
  {
    index: 0, numeral: 'I', name: 'Latium', levels: [1, 10], icon: '📜', accent: '#f6b93b',
    blurb: 'The schoolroom. Read your first numerals: I, V and X.'
  },
  {
    index: 1, numeral: 'II', name: 'Etruria', levels: [11, 20], icon: '🏺', accent: '#e58e26',
    blurb: 'The potters teach the shortcut: IV is one less than V.'
  },
  {
    index: 2, numeral: 'III', name: 'Gaul', levels: [21, 30], icon: '🌿', accent: '#78e08f',
    blurb: 'L joins the alphabet — and the first forgers appear.'
  },
  {
    index: 3, numeral: 'IV', name: 'Hispania', levels: [31, 40], icon: '⚖️', accent: '#f8c291',
    blurb: 'Hundreds, weighing scales, and your very own chisel.'
  },
  {
    index: 4, numeral: 'V', name: 'Britannia', levels: [41, 50], icon: '🛡️', accent: '#82ccdd',
    blurb: 'CD and CM at the wall, and numerals multiplied.'
  },
  {
    index: 5, numeral: 'VI', name: 'Germania', levels: [51, 60], icon: '🌩️', accent: '#b8e994',
    blurb: 'Thousands, dated years like MCMXCIV, and division.'
  },
  {
    index: 6, numeral: 'VII', name: 'Aegyptus', levels: [61, 70], icon: '🐍', accent: '#fad390',
    blurb: 'Long tablets all the way up to MMMCMXCIX.'
  },
  {
    index: 7, numeral: 'VIII', name: 'Judaea', levels: [71, 80], icon: '🏜️', accent: '#e77f67',
    blurb: 'Heavier scales and patterns whose jumps keep growing.'
  },
  {
    index: 8, numeral: 'IX', name: 'Asia', levels: [81, 90], icon: '📯', accent: '#cf6a87',
    blurb: 'Secret scrolls written in Caesar’s own cipher.'
  },
  {
    index: 9, numeral: 'X', name: 'Roma', levels: [91, 100], icon: '🏛️', accent: '#ffd32a',
    blurb: 'The gauntlet: every skill you own, then the Triumph.'
  }
];

/** Per-province [firstLevelMax, lastLevelMax] numeral ceiling. Non-decreasing. */
const RANGE_BANDS = [
  [10, 20], [24, 39], [45, 89], [110, 399], [430, 999],
  [1050, 1999], [2100, 3999], [3999, 3999], [3999, 3999], [3999, 3999]
];

/** Flavour titles, one per level slot inside a province. */
const LESSON_WORDS = [
  'Wax Tablet', 'Chalk Line', 'Market Stall', 'Milestone', 'Aqueduct',
  'Scribe’s Desk', 'Forum Steps', 'Watchtower', 'Treasury'
];

/* ================================================================== *
 * Puzzle type ladder
 * ================================================================== */

const TYPE_LADDER = [
  { type: 'decode', from: 1, weight: (d) => 10 - 6.5 * d },
  { type: 'encode', from: 2, weight: (d) => 6 - 2.5 * d },
  { type: 'compare', from: 4, weight: () => 3 },
  { type: 'missing', from: 11, weight: () => 3 },
  { type: 'add', from: 13, weight: () => 4.5 },
  { type: 'subtract', from: 21, weight: () => 4 },
  { type: 'forgery', from: 23, weight: () => 3.2 },
  { type: 'sequence', from: 26, weight: () => 3 },
  { type: 'scales', from: 31, weight: () => 2.8 },
  { type: 'multiply', from: 41, weight: () => 3.4 },
  { type: 'order', from: 44, weight: () => 2.6 },
  { type: 'divide', from: 51, weight: () => 3.2 },
  { type: 'cipher', from: 81, weight: () => 2.2, cap: 2 }
];

const TYPE_BONUS = {
  decode: 0, encode: 10, compare: 5, missing: 15, add: 10, subtract: 15,
  forgery: 20, sequence: 20, scales: 25, multiply: 25, order: 20, divide: 30, cipher: 40
};

const SUB_PAIR_RE = /IV|IX|XL|XC|CD|CM/;

/* ================================================================== *
 * Small pure helpers
 * ================================================================== */

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function progress(level) { return (level - 1) / 99; }

/** Greedy breakdown of n into [symbol, value] pieces. */
function pieces(n) {
  const out = [];
  let left = n;
  for (let i = 0; i < SYMBOLS.length; i++) {
    while (left >= SYMBOLS[i][1]) { out.push([SYMBOLS[i][0], SYMBOLS[i][1]]); left -= SYMBOLS[i][1]; }
  }
  return out;
}

/** 'V + I + I + I = 5 + 1 + 1 + 1' */
function sumText(n) {
  const ps = pieces(n);
  return ps.map((p) => p[0]).join(' + ') + ' = ' + ps.map((p) => p[1]).join(' + ');
}

const LADDER_TEXT = 'Remember the ladder: I=1, V=5, X=10, L=50, C=100, D=500, M=1000.';

function firstSubPair(r) {
  const m = SUB_PAIR_RE.exec(r);
  return m ? m[0] : null;
}

/* ================================================================== *
 * levelSpec
 * ================================================================== */

/**
 * Per-level knobs. Pure, no rng.
 * @param {number} level 1..100
 */
export function levelSpec(level) {
  const L = clamp(Math.round(level) || 1, 1, 100);
  const pi = Math.floor((L - 1) / 10);
  const province = PROVINCES[pi];
  const slot = (L - 1) % 10;              // 0..9 inside the province
  const d = progress(L);
  const isBoss = L % 10 === 0;

  const band = RANGE_BANDS[pi];
  const maxValue = Math.round(band[0] + (band[1] - band[0]) * (slot / 9));

  const puzzleCount = L === 100 ? 15 : (isBoss ? 12 : 10);
  const maxMistakes = L >= 61 ? 2 : 3;
  const freeHints = L <= 30 ? 3 : (L <= 60 ? 2 : (L <= 90 ? 1 : 0));
  // Sundial bonus window shrinks smoothly 20s -> 8s. Monotonic; boss pressure
  // comes from the rival + extra puzzles, not from a dip in this curve.
  const sundialMs = Math.round(20000 - 12000 * d);

  const types = TYPE_LADDER.filter((t) => L >= t.from).map((t) => t.type);

  let title;
  if (L === 100) title = 'Roma — The Triumph';
  else if (isBoss) title = province.name + ' — Colosseum Duel';
  else title = province.name + ' — ' + LESSON_WORDS[slot];

  return {
    level: L,
    province,
    provinceIndex: pi,
    title,
    isBoss,
    puzzleCount,
    maxMistakes,
    freeHints,
    sundialMs,
    maxValue,
    types
  };
}

/** Derived generator knobs (private). */
function makeCtx(spec) {
  const L = spec.level;
  const d = progress(L);
  return {
    level: L,
    d,
    spec,
    maxValue: spec.maxValue,
    // The ceiling is pinned at 3999 from province VIII on, so the late ramp comes
    // from *where inside the range* values land: take the largest of N draws.
    biasDraws: L <= 60 ? 1 : (L <= 70 ? 2 : (L <= 80 ? 3 : 4)),
    valueFloor: L <= 10 ? 1 : Math.max(1, Math.round(spec.maxValue * 0.18)),
    // Province I keeps to plain additive numerals so a 7-year-old can read them.
    noSub: L <= 10,
    interestingChance: L <= 10 ? 0 : clamp(0.25 + 0.35 * d, 0, 0.65),
    romanChance: L < 31 ? 0 : (L <= 40 ? 0.25 : (L <= 50 ? 0.3 : (L <= 60 ? 0.4
      : (L <= 70 ? 0.55 : (L <= 80 ? 0.6 : 0.65))))),
    maxOps: L <= 60 ? 1 : (L <= 80 ? 2 : 3),
    factors: L <= 60 ? [2, 3, 5] : (L <= 80 ? [2, 3, 4, 5, 6] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]),
    poolSize: L <= 50 ? 4 : (L <= 70 ? 5 : (L <= 90 ? 6 : 7)),
    subsetSize: L <= 50 ? 2 : (L <= 70 ? 3 : 4),
    orderCount: L <= 60 ? 3 : 4,
    orderDescChance: L <= 80 ? 0 : 0.4,
    compareCount: L <= 50 ? 2 : 3,
    compareSmallChance: L <= 20 ? 0 : 0.35,
    seqShown: L <= 70 ? 3 : 4,
    seqStepped: L >= 71,
    cipherLens: L <= 90 ? [4, 5, 6] : [5, 6, 7, 8],
    // Keep numerals on cards / inside long expressions short enough to read on a
    // tablet: 4 cards of MMMDCCCLXXXVIII is unreadable however you lay it out.
    cardMaxLen: L <= 60 ? 12 : 9,
    orderMaxLen: L <= 60 ? 10 : 8,
    exprMaxLen: L <= 60 ? 12 : (L <= 80 ? 9 : 8),
    missingShowValues: L <= 40,
    missingOptions: L <= 60 ? 3 : 4,
    forgeryOptions: L <= 60 ? 3 : 4
  };
}

function pointsFor(ctx, type, answerKind) {
  const base = 100 + Math.round(215 * ctx.d) + (TYPE_BONUS[type] || 0)
    + (answerKind === 'roman' ? 15 : 0);
  return clamp(Math.round(base / 5) * 5, 100, 400);
}

/* ================================================================== *
 * Value picking
 * ================================================================== */

function acceptable(v, ctx, opts) {
  if (v < 1 || v > 3999) return false;
  const r = toRoman(v);
  if (ctx.noSub && SUB_PAIR_RE.test(r)) return false;
  if (opts.interesting && !SUB_PAIR_RE.test(r)) return false;
  if (opts.minLen && r.length < opts.minLen) return false;
  if (opts.maxLen && r.length > opts.maxLen) return false;
  return true;
}

/**
 * A value in range that fits the level's letter rules.
 * @param {object} opts {min,max,interesting,minLen,maxLen}
 */
function pickValue(rng, ctx, opts) {
  const o = opts || {};
  let min = Math.max(1, o.min || 1);
  const max = clamp(o.max || ctx.maxValue, min, 3999);
  // Keep later levels off the trivial end of their range, but never squeeze a
  // requested window (the floor can only take 60% of whatever room there is).
  if (!o.noFloor && ctx.valueFloor > 1) {
    min = Math.max(min, Math.min(ctx.valueFloor, Math.floor(max * 0.6)));
    if (min < 1) min = 1;
    if (min > max) min = max;
  }
  const want = Object.assign({}, o);
  if (want.interesting === undefined && !ctx.noSub) {
    want.interesting = rng() < ctx.interestingChance;
  }
  const draws = o.noBias ? 1 : ctx.biasDraws;
  for (let i = 0; i < 60; i++) {
    let best = -1;
    for (let k = 0; k < draws; k++) {
      const v = randInt(rng, min, max);
      if (!acceptable(v, ctx, want)) continue;
      if (best < 0 || (o.low ? v < best : v > best)) best = v;
    }
    if (best > 0) return best;
  }
  // Relax "interesting", then scan for anything legal.
  want.interesting = false;
  for (let i = 0; i < 40; i++) {
    const v = randInt(rng, min, max);
    if (acceptable(v, ctx, want)) return v;
  }
  for (let v = min; v <= max; v++) if (acceptable(v, ctx, want)) return v;
  for (let v = min; v <= max; v++) if (acceptable(v, ctx, {})) return v;
  return min;
}

/** A handful of distinct values obeying the level's rules. */
function pickDistinct(rng, ctx, count, opts) {
  const out = [];
  for (let guard = 0; out.length < count && guard < 300; guard++) {
    const v = pickValue(rng, ctx, opts);
    if (out.indexOf(v) === -1) out.push(v);
  }
  let fill = 1;
  while (out.length < count) { if (out.indexOf(fill) === -1) out.push(fill); fill++; }
  return out;
}

/* ================================================================== *
 * Puzzle factory (guarantees every contract field exists)
 * ================================================================== */

function puzzle(o) {
  return {
    id: o.id || '',
    type: o.type,
    answerKind: o.answerKind,
    prompt: o.prompt,
    display: o.display,
    answer: o.answer,
    choices: o.choices || null,
    scales: o.scales || null,
    hint: o.hint,
    teach: o.teach || '',
    points: o.points
  };
}

/* ================================================================== *
 * Generators — one per type. Each returns a Puzzle or null (retry).
 * ================================================================== */

function genDecode(rng, ctx) {
  const n = pickValue(rng, ctx, {});
  const r = toRoman(n);
  const sub = firstSubPair(r);
  const hint = sub
    ? `${sub} is ${letterValue(sub[1])} − ${letterValue(sub[0])} = ${letterValue(sub[1]) - letterValue(sub[0])}.`
    : (pieces(n).length === 1 ? LADDER_TEXT : `Break it up: ${sumText(n)}.`);
  const teach = sub
    ? 'A smaller letter written BEFORE a bigger one means subtract: IX = 10 − 1 = 9.'
    : 'Letters go biggest first and you add them up: M=1000, D=500, C=100, L=50, X=10, V=5, I=1.';
  return puzzle({
    type: 'decode', answerKind: 'arabic',
    prompt: 'What number is carved here?',
    display: { mode: 'roman', text: r },
    answer: n, hint, teach,
    points: pointsFor(ctx, 'decode', 'arabic')
  });
}

function genEncode(rng, ctx) {
  const n = pickValue(rng, ctx, {});
  const r = toRoman(n);
  const first = pieces(n)[0];
  return puzzle({
    type: 'encode', answerKind: 'roman',
    prompt: 'Carve this number in Roman numerals.',
    display: { mode: 'arabic', text: String(n) },
    answer: r,
    hint: `Start with the biggest piece that fits: ${first[0]} = ${first[1]}.`,
    teach: `Take the biggest numeral that fits, then keep going with what is left: ${n} = ${pieces(n).map((p) => p[1]).join(' + ')}, which is ${pieces(n).map((p) => p[0]).join(' + ')} → ${r}.`,
    points: pointsFor(ctx, 'encode', 'roman')
  });
}

const OP_SYMBOL = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
const OP_PROMPT = {
  add: 'Add these numerals.',
  subtract: 'Take the second numeral away from the first.',
  multiply: 'Multiply these numerals.',
  divide: 'Divide the first numeral by the second.'
};

function genArith(type, rng, ctx) {
  const max = ctx.maxValue;
  const ops = ctx.maxOps > 1 ? randInt(rng, 1, ctx.maxOps) : 1;
  const parts = [];
  const working = [];
  let v;

  // First operation decides the puzzle's type label.
  if (type === 'multiply') {
    const f = pick(rng, ctx.factors.filter((x) => x * 2 <= max)) || 2;
    const a = pickValue(rng, ctx, { min: 2, max: Math.floor(max / f), maxLen: ctx.exprMaxLen });
    if (a * f > max || a * f < 1) return null;
    parts.push(toRoman(a), OP_SYMBOL.multiply, toRoman(f));
    working.push(String(a), OP_SYMBOL.multiply, String(f));
    v = a * f;
  } else if (type === 'divide') {
    const f = pick(rng, ctx.factors.filter((x) => x * 2 <= max)) || 2;
    const q = pickValue(rng, ctx, { min: 2, max: Math.floor(max / f), maxLen: ctx.exprMaxLen });
    const a = q * f;
    if (a > max || q < 1) return null;
    parts.push(toRoman(a), OP_SYMBOL.divide, toRoman(f));
    working.push(String(a), OP_SYMBOL.divide, String(f));
    v = q;
  } else if (type === 'subtract') {
    const a = pickValue(rng, ctx, { min: 3, maxLen: ctx.exprMaxLen });
    if (a < 2) return null;
    // Small subtrahend: keeps the ANSWER big (the hard part is carving it back).
    const b = pickValue(rng, ctx, { min: 1, max: a - 1, low: true, noFloor: true, maxLen: ctx.exprMaxLen });
    if (b >= a) return null;
    parts.push(toRoman(a), OP_SYMBOL.subtract, toRoman(b));
    working.push(String(a), OP_SYMBOL.subtract, String(b));
    v = a - b;
  } else {
    const a = pickValue(rng, ctx, { max: Math.max(1, max - 1), maxLen: ctx.exprMaxLen });
    const b = pickValue(rng, ctx, { min: 1, max: Math.max(1, max - a), maxLen: ctx.exprMaxLen });
    if (a + b > max) return null;
    parts.push(toRoman(a), OP_SYMBOL.add, toRoman(b));
    working.push(String(a), OP_SYMBOL.add, String(b));
    v = a + b;
  }

  // Extra + / - steps for the long-tablet provinces.
  for (let i = 1; i < ops; i++) {
    const canSub = v > 2;
    const canAdd = v < max - 1;
    let op;
    if (canSub && canAdd) op = rng() < 0.5 ? 'add' : 'subtract';
    else if (canAdd) op = 'add';
    else if (canSub) op = 'subtract';
    else break;
    if (op === 'add') {
      const b = pickValue(rng, ctx, { min: 1, max: Math.max(1, max - v), maxLen: ctx.exprMaxLen });
      if (v + b > max) break;
      parts.push(OP_SYMBOL.add, toRoman(b));
      working.push(OP_SYMBOL.add, String(b));
      v += b;
    } else {
      const b = pickValue(rng, ctx, { min: 1, max: v - 1, low: true, noFloor: true, maxLen: ctx.exprMaxLen });
      if (b >= v) break;
      parts.push(OP_SYMBOL.subtract, toRoman(b));
      working.push(OP_SYMBOL.subtract, String(b));
      v -= b;
    }
  }

  if (v < 1 || v > 3999) return null;
  const answerKind = rng() < ctx.romanChance ? 'roman' : 'arabic';
  const hint = `In numbers that is ${working.join(' ')}.`;
  const teach = answerKind === 'roman'
    ? `Turn every numeral into a number, work from left to right, then carve the answer back in numerals: ${working.join(' ')} = ${v} = ${toRoman(v)}.`
    : `Turn every numeral into a number and work from left to right: ${working.join(' ')} = ${v}.`;
  return puzzle({
    type, answerKind,
    prompt: ops > 1 ? 'Work along the tablet from left to right.' : OP_PROMPT[type],
    display: { mode: 'expr', parts: parts.concat(['=', '?']) },
    answer: answerKind === 'roman' ? toRoman(v) : v,
    hint,
    teach,
    points: pointsFor(ctx, type, answerKind)
  });
}

function genCompare(rng, ctx) {
  const count = ctx.compareCount;
  const wantSmallest = rng() < ctx.compareSmallChance;
  const spread = Math.max(1, Math.round(ctx.maxValue * (0.25 - 0.15 * ctx.d)));
  const base = pickValue(rng, ctx, { min: Math.min(2, ctx.maxValue), maxLen: ctx.cardMaxLen });
  const drawn = [base];
  for (let guard = 0; drawn.length < count && guard < 200; guard++) {
    const lo = Math.max(1, base - spread);
    const hi = Math.min(ctx.maxValue, base + spread);
    const v = pickValue(rng, ctx, { min: lo, max: hi, maxLen: ctx.cardMaxLen });
    if (drawn.indexOf(v) === -1) drawn.push(v);
  }
  for (let fill = 1; drawn.length < count; fill++) if (drawn.indexOf(fill) === -1) drawn.push(fill);
  // Shuffle so the first card is never a tell.
  const vals = shuffle(rng, drawn);
  const sorted = vals.slice().sort((a, b) => a - b);
  if (sorted[0] === sorted[sorted.length - 1]) return null;
  const target = wantSmallest ? sorted[0] : sorted[sorted.length - 1];
  const answer = vals.indexOf(target);
  const label = wantSmallest
    ? (count === 2 ? 'Which numeral is smaller?' : 'Which numeral is the smallest?')
    : (count === 2 ? 'Which numeral is larger?' : 'Which numeral is the largest?');
  return puzzle({
    type: 'compare', answerKind: 'choice',
    prompt: label,
    display: { mode: 'expr', parts: vals.map((v) => toRoman(v)) },
    answer,
    choices: vals.map((v) => ({ label: toRoman(v), sub: '' })),
    hint: 'Read each one as a number first, then compare those numbers.',
    teach: `Compare from the left: ${sorted.map((v) => toRoman(v) + ' = ' + v).join(', ')}.`,
    points: pointsFor(ctx, 'compare', 'choice')
  });
}

function genOrder(rng, ctx) {
  const k = ctx.orderCount;
  const desc = rng() < ctx.orderDescChance;
  const vals = pickDistinct(rng, ctx, k, { maxLen: ctx.orderMaxLen });
  if (new Set(vals).size < k) return null;
  const shown = shuffle(rng, vals);
  const wanted = shown.slice().sort((a, b) => (desc ? b - a : a - b));
  const answer = wanted.map((v) => shown.indexOf(v));
  return puzzle({
    type: 'order', answerKind: 'order',
    prompt: `Drag the numerals into order, ${desc ? 'largest' : 'smallest'} first.`,
    display: { mode: 'expr', parts: shown.map((v) => toRoman(v)) },
    answer,
    choices: shown.map((v) => ({ label: toRoman(v), sub: '' })),
    hint: 'Turn each numeral into a number, then line the numbers up.',
    teach: `${wanted.map((v) => toRoman(v)).join(desc ? ' > ' : ' < ')} because ${wanted.join(desc ? ' > ' : ' < ')}.`,
    points: pointsFor(ctx, 'order', 'order')
  });
}

/** Any subtraction a Roman would never make, as it appears inside a string. */
const BAD_SUB_RE = /I[LCDM]|V[XLCDM]|X[DM]|L[CDM]|DM/;
const FOUR_ROW_RE = /([IVXLCDM])\1{3}/;

/**
 * Values for which an illegal-subtraction fake is constructible (99 -> IC,
 * 1999 -> MIM, 5 -> VX). Built as (bigger − smaller) plus a head made only of
 * letters at least as big as the big letter.
 */
function subFakeValues(ctx) {
  const pairs = [['I', 'L'], ['I', 'C'], ['I', 'D'], ['I', 'M'], ['V', 'X'], ['V', 'L'],
  ['V', 'C'], ['V', 'D'], ['V', 'M'], ['X', 'D'], ['X', 'M'], ['L', 'C'], ['L', 'D'],
  ['L', 'M'], ['D', 'M']];
  const out = [];
  for (const [sm, bg] of pairs) {
    const d = letterValue(bg) - letterValue(sm);
    for (let m = 0; m <= 3; m++) {
      for (let k = 0; k <= 3; k++) {
        const head = m * 1000 + k * letterValue(bg);
        if (bg === 'M' && k > 0) continue;          // M's already counted by m
        const n = head + d;
        if (n >= 1 && n <= ctx.maxValue && out.indexOf(n) === -1) out.push(n);
      }
    }
  }
  return out;
}

function genForgery(rng, ctx) {
  const count = ctx.forgeryOptions;
  // Province III teaches repeat-count fakes; from province VI on, half the coins
  // are illegal-subtraction fakes (IC, IL, VX) as the ladder in the spec asks.
  const wantSub = ctx.level >= 51 && rng() < 0.5;
  const wantFour = ctx.level <= 40;
  const subPool = wantSub ? subFakeValues(ctx) : null;

  let n = pickValue(rng, ctx, { min: Math.min(4, ctx.maxValue), maxLen: ctx.cardMaxLen - 2 });
  let fake = makeForgery(n, rng);
  for (let attempt = 0; attempt < 8; attempt++) {
    const good = wantSub ? BAD_SUB_RE.test(fake.text)
      : (wantFour ? FOUR_ROW_RE.test(fake.text) : true);
    if (good) break;
    n = wantSub && subPool.length
      ? pick(rng, subPool)
      : pickValue(rng, ctx, { min: Math.min(4, ctx.maxValue), maxLen: ctx.cardMaxLen - 2 });
    fake = makeForgery(n, rng);
  }
  if (isValidRoman(fake.text)) return null;          // paranoia: never ship a valid fake
  const reals = [];
  for (let guard = 0; reals.length < count - 1 && guard < 200; guard++) {
    const v = pickValue(rng, ctx, { maxLen: ctx.cardMaxLen });
    const r = toRoman(v);
    if (r !== fake.text && reals.indexOf(r) === -1) reals.push(r);
  }
  for (let fill = 1; reals.length < count - 1; fill++) {
    const r = toRoman(fill);
    if (r !== fake.text && reals.indexOf(r) === -1) reals.push(r);
  }
  const labels = shuffle(rng, reals.concat([fake.text]));
  const answer = labels.indexOf(fake.text);
  if (answer < 0) return null;
  return puzzle({
    type: 'forgery', answerKind: 'choice',
    prompt: 'One of these coins is a forgery. Which one?',
    display: { mode: 'expr', parts: labels.slice() },
    answer,
    choices: labels.map((r) => ({ label: r, sub: '' })),
    hint: 'Look for a rule being broken: four of a letter in a row, a doubled V, L or D, or a bad take-away.',
    teach: `${fake.text} is the fake. ${fake.reason}`,
    points: pointsFor(ctx, 'forgery', 'choice')
  });
}

function genMissing(rng, ctx) {
  const n = pickValue(rng, ctx, { min: Math.min(6, ctx.maxValue), minLen: 2, maxLen: 7 });
  const r = toRoman(n);
  if (r.length < 2) return null;
  const idx = randInt(rng, 0, r.length - 1);
  const truth = r[idx];
  const shown = r.slice(0, idx) + '_' + r.slice(idx + 1);
  // Only letters that do NOT rebuild the number may be decoys, so the answer is unique.
  const wrong = LETTERS.filter((ch) => {
    if (ch === truth) return false;
    const t = r.slice(0, idx) + ch + r.slice(idx + 1);
    return !(isValidRoman(t) && fromRoman(t) === n);
  }).sort((a, b) => Math.abs(LETTERS.indexOf(a) - LETTERS.indexOf(truth))
    - Math.abs(LETTERS.indexOf(b) - LETTERS.indexOf(truth)));
  const want = Math.min(ctx.missingOptions - 1, wrong.length);
  if (want < 2) return null;
  const nearby = wrong.slice(0, Math.min(wrong.length, want + 2));
  const decoys = shuffle(rng, nearby).slice(0, want);
  const labels = shuffle(rng, decoys.concat([truth]));
  const answer = labels.indexOf(truth);
  if (answer < 0) return null;
  return puzzle({
    type: 'missing', answerKind: 'choice',
    prompt: `This tablet should say ${n}. Which letter was chiselled away?`,
    display: { mode: 'blank', text: shown },
    answer,
    choices: labels.map((ch) => ({ label: ch, sub: ctx.missingShowValues ? String(letterValue(ch)) : '' })),
    hint: `Add up the letters you can still see, then work out the gap up to ${n}.`,
    teach: `${n} is written ${r}, because ${sumText(n)}. The missing letter is ${truth} = ${letterValue(truth)}.`,
    points: pointsFor(ctx, 'missing', 'choice')
  });
}

function genSequence(rng, ctx) {
  const shown = ctx.seqShown;
  const cap = Math.min(3999, Math.max(ctx.maxValue, 20));
  const stepped = ctx.seqStepped && rng() < 0.5;
  const maxStep = ctx.level <= 40 ? 12 : (ctx.level <= 60 ? 25 : (ctx.level <= 80 ? 60 : 250));
  const descend = ctx.level >= 61 && rng() < 0.35;

  let terms = null;
  for (let attempt = 0; attempt < 60 && !terms; attempt++) {
    // A row of five numerals is the widest thing on screen — prefer short terms,
    // then relax rather than give up the type entirely.
    const lenCap = attempt < 45 ? ctx.exprMaxLen + 1 : 99;
    const step = randInt(rng, 1, maxStep) * (descend ? -1 : 1);
    const bump = stepped ? randInt(rng, 1, Math.max(1, Math.round(maxStep / 3))) : 0;
    const start = descend
      ? randInt(rng, Math.floor(cap / 2), cap)
      : randInt(rng, 1, Math.max(1, Math.floor(cap / 3)));
    const list = [start];
    let cur = start;
    let s = step;
    let ok = true;
    for (let i = 0; i < shown; i++) {
      cur += s;
      s += descend ? -bump : bump;
      if (cur < 1 || cur > cap) { ok = false; break; }
      list.push(cur);
    }
    if (ok && list.some((v) => toRoman(v).length > lenCap)) ok = false;
    if (ok && new Set(list).size === list.length) terms = { list, step, bump };
  }
  if (!terms) return null;

  const list = terms.list;
  const answerVal = list[list.length - 1];
  const visible = list.slice(0, list.length - 1);
  const asChoice = ctx.level < 51;
  const jumps = [];
  for (let i = 1; i < list.length; i++) jumps.push(list[i] - list[i - 1]);

  let choices = null;
  let answer;
  let answerKind;
  if (asChoice) {
    const opts = [answerVal];
    for (let guard = 0; opts.length < 3 && guard < 120; guard++) {
      const wobble = randInt(rng, 1, Math.max(1, Math.abs(terms.step)));
      const cand = rng() < 0.5 ? answerVal + wobble : answerVal - wobble;
      if (cand >= 1 && cand <= 3999 && opts.indexOf(cand) === -1) opts.push(cand);
    }
    for (let fill = 1; opts.length < 3; fill++) if (opts.indexOf(fill) === -1) opts.push(fill);
    const labels = shuffle(rng, opts);
    answerKind = 'choice';
    answer = labels.indexOf(answerVal);
    if (answer < 0) return null;
    choices = labels.map((v) => ({ label: toRoman(v), sub: '' }));
  } else {
    answerKind = 'roman';
    answer = toRoman(answerVal);
  }

  const hint = terms.bump
    ? `The jumps keep growing: ${jumps.slice(0, -1).join(', then ')}.`
    : `Every step ${terms.step < 0 ? 'goes down' : 'goes up'} by ${Math.abs(terms.step)}.`;
  const teach = `In numbers: ${visible.join(', ')} → ${answerVal}. ${terms.bump
    ? 'The jump itself changes each time, so work out the jumps before the next term.'
    : `Add ${terms.step} each time, so the next numeral is ${toRoman(answerVal)}.`}`;

  return puzzle({
    type: 'sequence', answerKind,
    prompt: 'What comes next in the pattern?',
    display: { mode: 'seq', parts: visible.map((v) => toRoman(v)).concat(['?']) },
    answer, choices, hint, teach,
    points: pointsFor(ctx, 'sequence', answerKind)
  });
}

/**
 * Weight denominations. Every one is a SHORT numeral (<= 5 letters) so seven of
 * them still fit on a tablet, and they read like real Roman market weights.
 */
const DENOMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90,
  100, 150, 200, 250, 300, 400, 500, 600, 750, 800, 900, 1000, 1200, 1500, 2000, 2500, 3000];

function genScales(rng, ctx) {
  const k = clamp(ctx.subsetSize + (rng() < 0.3 ? 1 : 0), 2, 4);
  const usable = DENOMS.filter((v) => v <= ctx.maxValue);
  if (usable.length < ctx.poolSize + 1) return null;

  // The target is whatever a small set of real weights adds up to, so a valid
  // subset exists by construction.
  const wantMin = Math.min(Math.round(ctx.maxValue * 0.35), ctx.maxValue - 1);
  let parts = null;
  for (let attempt = 0; attempt < 60 && !parts; attempt++) {
    const bag = shuffle(rng, usable).slice(0, k);
    if (new Set(bag).size !== k) continue;
    const sum = bag.reduce((a, b) => a + b, 0);
    if (sum < 3 || sum > ctx.maxValue) continue;
    if (attempt < 45 && sum < wantMin) continue;   // keep the ramp; relax at the end
    parts = bag;
  }
  if (!parts) {
    const bag = usable.slice(0, k);
    if (bag.reduce((a, b) => a + b, 0) > ctx.maxValue) return null;
    parts = bag;
  }
  const target = parts.reduce((a, b) => a + b, 0);
  if (target < 1 || target > 3999) return null;

  const pool = parts.map((v) => ({ label: toRoman(v), value: v }));
  const heavyDecoy = ctx.level >= 51;
  for (let guard = 0; pool.length < ctx.poolSize && guard < 400; guard++) {
    const wantHeavy = heavyDecoy && pool.length === parts.length;
    const room = usable.filter((v) => !pool.some((p) => p.value === v)
      && (wantHeavy ? v > target : v < target));
    const v = room.length ? pick(rng, room) : pick(rng, usable.filter((x) => !pool.some((p) => p.value === x)));
    if (v === undefined) break;
    pool.push({ label: toRoman(v), value: v });
  }
  if (pool.length < 4) return null;
  const mixed = shuffle(rng, pool);

  return puzzle({
    type: 'scales', answerKind: 'scales',
    prompt: 'Balance the scales: pick weights that add up to the numeral on the left.',
    display: { mode: 'roman', text: toRoman(target) },
    answer: target,
    scales: { target, targetRoman: toRoman(target), pool: mixed },
    hint: `The left pan holds ${target}. Start with the biggest weight that is not too heavy.`,
    teach: `${parts.map((v) => toRoman(v)).join(' + ')} = ${toRoman(target)}, because ${parts.join(' + ')} = ${target}.`,
    points: pointsFor(ctx, 'scales', 'scales')
  });
}

/* ---- cipher ------------------------------------------------------ */

const CIPHER_WORDS = {
  4: ['ROMA', 'TOGA', 'GOLD', 'WINE', 'ARCH'],
  5: ['FORUM', 'TUNIC', 'EAGLE', 'VILLA', 'GAMES'],
  6: ['CAESAR', 'LEGION', 'SENATE', 'COLUMN', 'SHIELD', 'TEMPLE'],
  7: ['GLADIUS', 'CHARIOT', 'TRIUMPH', 'EMPEROR', 'SOLDIER'],
  8: ['AQUEDUCT', 'COLISEUM', 'STANDARD', 'SENATORS']
};

const A_CODE = 65;
function caesar(word, shift) {
  let out = '';
  for (const ch of word) {
    const i = ch.charCodeAt(0) - A_CODE;
    out += String.fromCharCode(A_CODE + ((i + shift) % 26 + 26) % 26);
  }
  return out;
}

function genCipher(rng, ctx) {
  const len = pick(rng, ctx.cipherLens);
  const bank = CIPHER_WORDS[len];
  if (!bank || bank.length < 3) return null;
  const words = shuffle(rng, bank);
  const word = words[0];
  const decoys = words.slice(1, 3);
  const shift = randInt(rng, 1, 5);
  const enc = caesar(word, shift);
  const labels = shuffle(rng, [word].concat(decoys));
  const answer = labels.indexOf(word);
  if (answer < 0 || decoys.length < 2) return null;
  const shiftRoman = toRoman(shift);
  return puzzle({
    type: 'cipher', answerKind: 'choice',
    prompt: `Caesar slid every letter forward by ${shiftRoman}. What does the scroll say?`,
    display: { mode: 'scroll', text: enc, shiftRoman },
    answer,
    choices: labels.map((w) => ({ label: w, sub: '' })),
    hint: `${shiftRoman} is ${shift}, so step each letter ${shift} back: ${enc[0]} → ${word[0]}.`,
    teach: `A shift of ${shift} slides the whole alphabet along, so A becomes ${caesar('A', shift)}. To read the scroll, slide every letter back by ${shift}.`,
    points: pointsFor(ctx, 'cipher', 'choice')
  });
}

const GENERATORS = {
  decode: genDecode,
  encode: genEncode,
  add: (r, c) => genArith('add', r, c),
  subtract: (r, c) => genArith('subtract', r, c),
  multiply: (r, c) => genArith('multiply', r, c),
  divide: (r, c) => genArith('divide', r, c),
  compare: genCompare,
  order: genOrder,
  forgery: genForgery,
  missing: genMissing,
  sequence: genSequence,
  scales: genScales,
  cipher: genCipher
};

/* ================================================================== *
 * Type deck
 * ================================================================== */

function buildDeck(spec, rng) {
  const L = spec.level;
  const d = progress(L);
  const count = spec.puzzleCount;
  const provinceFrom = spec.province.levels[0];
  const unlocked = TYPE_LADDER.filter((t) => L >= t.from);

  const used = {};
  const deck = [];
  const capOf = {};
  for (const t of unlocked) capOf[t.type] = t.cap || count;

  function take(type) {
    if ((used[type] || 0) >= capOf[type]) return false;
    used[type] = (used[type] || 0) + 1;
    deck.push(type);
    return true;
  }

  // 1. Open gently: always a read-or-carve warm-up.
  const warm = unlocked.some((t) => t.type === 'encode') && rng() < 0.35 ? 'encode' : 'decode';
  take(warm);

  // 2. Teach whatever this province introduced (that is already unlocked).
  const fresh = unlocked.filter((t) => t.from >= provinceFrom).map((t) => t.type);
  for (const type of fresh) { if (deck.length < count) take(type); }

  // 3. Fill by weight, damping repeats so the mix stays varied.
  const weights = {};
  for (const t of unlocked) weights[t.type] = Math.max(0.2, t.weight(d));
  for (const type of deck) weights[type] *= 0.45;

  while (deck.length < count) {
    let total = 0;
    const avail = unlocked.filter((t) => (used[t.type] || 0) < capOf[t.type]);
    if (!avail.length) { deck.push('decode'); continue; }
    for (const t of avail) total += weights[t.type];
    let roll = rng() * total;
    let chosen = avail[avail.length - 1].type;
    for (const t of avail) { roll -= weights[t.type]; if (roll <= 0) { chosen = t.type; break; } }
    take(chosen);
    weights[chosen] *= 0.45;
  }

  // Keep the warm-up first; shuffle the rest so guaranteed types are spread out.
  const head = deck[0];
  const tail = shuffle(rng, deck.slice(1));
  return [head].concat(tail);
}

/* ================================================================== *
 * buildLevel
 * ================================================================== */

/**
 * Deterministic level content. Seeded only by `level`.
 * @param {number} level 1..100
 * @returns {{level:number, spec:object, puzzles:object[]}}
 */
export function buildLevel(level) {
  const spec = levelSpec(level);
  const rng = makeRng((Math.imul(spec.level, 0x9e3779b1) ^ 0x5eed2024) >>> 0);
  const ctx = makeCtx(spec);
  const deck = buildDeck(spec, rng);
  const puzzles = [];
  const seen = Object.create(null);

  for (let i = 0; i < spec.puzzleCount; i++) {
    const type = deck[i] || 'decode';
    let made = null;
    for (let attempt = 0; attempt < 26 && !made; attempt++) {
      const cand = GENERATORS[type] ? GENERATORS[type](rng, ctx) : null;
      if (!cand) continue;
      const sig = cand.type + '|' + JSON.stringify(cand.display) + '|' + JSON.stringify(cand.answer);
      if (seen[sig] && attempt < 22) continue;
      seen[sig] = true;
      made = cand;
    }
    if (!made) made = genDecode(rng, ctx);   // decode can always be generated
    made.id = 'L' + spec.level + '-P' + (i + 1);
    puzzles.push(made);
  }

  return { level: spec.level, spec, puzzles };
}
