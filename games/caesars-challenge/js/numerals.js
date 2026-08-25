// Caesar's Challenge — the Roman numeral engine (LANE A)
// Pure: no DOM, no globals, no randomness except the rng you pass to makeForgery.
//
// The strictness rule that makes everything else easy:
//   a string is a *canonical* Roman numeral iff it is made only of I V X L C D M
//   AND it equals toRoman(loose value of itself).
// That single test rejects IIII, VIIII, XXXX, VV, LL, DD, IL, IC, ID, IM, XD, XM,
// VX, VL, VC, IIV, IXI, IXIX, MMMM ... with no special cases. invalidReason() then
// runs structural checks purely to explain *why*, in words a 7-year-old can read.

/** Descending value table used for greedy encoding. */
export const SYMBOLS = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
  ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
  ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
];

/** The seven letters, ascending. */
export const LETTERS = ['I', 'V', 'X', 'L', 'C', 'D', 'M'];

const VALUE = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
/** The only legal subtractions. */
const SUB_OK = { I: ['V', 'X'], X: ['L', 'C'], C: ['D', 'M'] };
/** Letters that may repeat (up to three times). */
const REPEATABLE = { I: true, X: true, C: true, M: true };

export const MAX_ROMAN = 3999;

/** Letter value, or 0 for anything that isn't a numeral letter. */
export function letterValue(ch) { return VALUE[ch] || 0; }

/** Uppercase + trim; returns '' for non-strings. */
function norm(s) {
  return typeof s === 'string' ? s.trim().toUpperCase() : '';
}

/**
 * Integer 1..3999 -> canonical Roman numeral.
 * @throws {RangeError} outside 1..3999 or non-integer
 */
export function toRoman(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new RangeError('toRoman: not an integer: ' + n);
  }
  if (n < 1 || n > MAX_ROMAN) {
    throw new RangeError('toRoman: out of range 1..3999: ' + n);
  }
  let out = '';
  let left = n;
  for (let i = 0; i < SYMBOLS.length; i++) {
    const sym = SYMBOLS[i][0];
    const val = SYMBOLS[i][1];
    while (left >= val) { out += sym; left -= val; }
  }
  return out;
}

/**
 * Loose parse: any string of numeral letters -> integer using the
 * "smaller before bigger subtracts" scan. Returns null if it isn't made of
 * numeral letters at all (or is empty).
 * Note: loose on purpose — fromRoman('IIII') === 4, fromRoman('IC') === 99.
 * Use isValidRoman() when you need canonical.
 */
export function fromRoman(s) {
  const t = norm(s);
  if (!t || !/^[IVXLCDM]+$/.test(t)) return null;
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const v = VALUE[t[i]];
    const next = i + 1 < t.length ? VALUE[t[i + 1]] : 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** Strict canonical check. Lowercase input is normalised first, then judged. */
export function isValidRoman(s) {
  const t = norm(s);
  if (!t || !/^[IVXLCDM]+$/.test(t)) return false;
  const v = fromRoman(t);
  if (v === null || v < 1 || v > MAX_ROMAN) return false;
  return toRoman(v) === t;
}

/**
 * Why is this string not a canonical numeral? One short kid-readable sentence,
 * or null when the string IS valid.
 */
export function invalidReason(s) {
  const raw = typeof s === 'string' ? s : '';
  const t = norm(s);
  if (!t) return 'Carve some letters first.';
  if (!/^[IVXLCDM]+$/.test(t)) {
    const bad = raw.toUpperCase().split('').find((c) => !/[IVXLCDM]/.test(c) && c.trim() !== '');
    if (bad) return `"${bad}" is not a Roman numeral — only I, V, X, L, C, D and M.`;
    return 'Only the letters I, V, X, L, C, D and M are Roman numerals.';
  }
  if (isValidRoman(t)) return null;

  // 1. V, L and D are never written twice.
  for (const ch of ['V', 'L', 'D']) {
    let count = 0;
    for (const c of t) if (c === ch) count++;
    if (count > 1) return `${ch} is only ever written once, and this has ${count}.`;
  }
  // 2. Four of the same letter in a row.
  const run = /([IVXLCDM])\1{3}/.exec(t);
  if (run) return `You can't put four of the same letter in a row (${run[0]}).`;
  // 3. Illegal subtraction pairs.
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i], b = t[i + 1];
    if (VALUE[a] >= VALUE[b]) continue;
    const ok = SUB_OK[a];
    if (!ok) return `${a} is never taken away from a bigger letter, so ${a}${b} is not allowed.`;
    if (ok.indexOf(b) === -1) {
      return `${a} can only go before ${ok.join(' or ')}, so ${a}${b} is not allowed.`;
    }
    // 4. Legal pair, but doubled up in front: IIX, XXL.
    if (i > 0 && t[i - 1] === a) {
      return `When you take away, use just one ${a}: ${a}${b}, not ${a}${a}${b}.`;
    }
    // 5. Legal pair, but something too big follows it: IXI, XCX.
    if (i + 2 < t.length && VALUE[t[i + 2]] >= VALUE[a]) {
      return `After ${a}${b}, every letter must be smaller than ${a}.`;
    }
  }
  // 6. Too big to write at all.
  const v = fromRoman(t);
  if (v === null || v < 1) return 'Those letters do not add up to a number.';
  if (v > MAX_ROMAN) return 'The biggest Roman numeral is MMMCMXCIX (3999).';
  // 7. Right value, wrong spelling (out of order, uncontracted, e.g. IXIX).
  return `Romans wrote ${v} as ${toRoman(v)}, not ${t}.`;
}

/* ------------------------------------------------------------------ *
 * Forgeries
 * ------------------------------------------------------------------ */

/** Un-contracted (long-hand) spellings of the six legal subtractions. */
const UNCONTRACT = {
  IV: 'IIII', IX: 'VIIII', XL: 'XXXX', XC: 'LXXXX', CD: 'CCCC', CM: 'DCCCC'
};
/** Every subtraction a Roman would never make. */
const BAD_PAIRS = [
  ['I', 'L'], ['I', 'C'], ['I', 'D'], ['I', 'M'],
  ['V', 'X'], ['V', 'L'], ['V', 'C'], ['V', 'D'], ['V', 'M'],
  ['X', 'D'], ['X', 'M'], ['L', 'C'], ['L', 'D'], ['L', 'M'], ['D', 'M']
];
/** Value-preserving swaps that break the "written once" rule. */
const DOUBLE_UP = { X: 'VV', C: 'LL', M: 'DD' };

const FOUR_ROW_REASON = 'Romans never wrote four of the same letter in a row.';
const DOUBLE_REASON = 'V, L and D are only ever written once.';
const ORDER_REASON = 'The letters are out of order — the big ones come first.';

function subReason(sm, bg) {
  if (SUB_OK[sm]) {
    return `${sm} can only be taken away from ${SUB_OK[sm].join(' or ')}, so ${sm}${bg} is a fake.`;
  }
  return `${sm} is never taken away from a bigger letter, so ${sm}${bg} is a fake.`;
}

/** Is letter at index i part of a subtractive pair inside t? */
function inSubPair(t, i) {
  const v = VALUE[t[i]];
  if (i > 0 && VALUE[t[i - 1]] < v) return true;
  if (i + 1 < t.length && VALUE[t[i + 1]] > v) return true;
  return false;
}

function pushCandidate(list, family, text, reason, n) {
  if (!text || text === '') return;
  if (isValidRoman(text)) return;          // never, ever ship a valid "forgery"
  if (!/^[IVXLCDM]{1,20}$/.test(text)) return;
  for (const c of list) if (c.text === text) return;
  const loose = fromRoman(text);
  list.push({ family, text, reason, tempting: loose === n });
}

/**
 * A plausible but definitely INVALID variant of toRoman(n).
 * @param {number} n 1..3999
 * @param {() => number} rng
 * @returns {{text:string, reason:string}}
 */
export function makeForgery(n, rng) {
  const r = toRoman(n);
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  const cand = [];

  // A. Un-contracted long-hand: IX -> VIIII, XL -> XXXX ...
  for (const pair of Object.keys(UNCONTRACT)) {
    const at = r.indexOf(pair);
    if (at >= 0) {
      pushCandidate(cand, 'long', r.slice(0, at) + UNCONTRACT[pair] + r.slice(at + 2), FOUR_ROW_REASON, n);
    }
  }
  // B. Four in a row: stretch the trailing repeatable letter to four.
  {
    const last = r[r.length - 1];
    if (REPEATABLE[last]) {
      let runLen = 0;
      for (let i = r.length - 1; i >= 0 && r[i] === last; i--) runLen++;
      if (runLen < 4) pushCandidate(cand, 'four', r + last.repeat(4 - runLen), FOUR_ROW_REASON, n);
    }
    // and any interior run of three -> four
    const three = /([IXCM])\1\1/.exec(r);
    if (three) {
      pushCandidate(cand, 'four', r.slice(0, three.index) + three[1].repeat(4) + r.slice(three.index + 3),
        FOUR_ROW_REASON, n);
    }
  }
  // C. Doubled five-letter, value preserved: X -> VV, C -> LL, M -> DD.
  for (let i = 0; i < r.length; i++) {
    const swap = DOUBLE_UP[r[i]];
    if (swap && !inSubPair(r, i)) {
      pushCandidate(cand, 'double', r.slice(0, i) + swap + r.slice(i + 1), DOUBLE_REASON, n);
    }
  }
  // C2. Doubled five-letter by repeating one that is already there.
  for (let i = 0; i < r.length; i++) {
    if (r[i] === 'V' || r[i] === 'L' || r[i] === 'D') {
      pushCandidate(cand, 'double', r.slice(0, i + 1) + r[i] + r.slice(i + 1), DOUBLE_REASON, n);
    }
  }
  // D. Illegal subtraction that still *reads* as n: IC for 99, MIM for 1999, VX for 5.
  for (const [sm, bg] of BAD_PAIRS) {
    const d = VALUE[bg] - VALUE[sm];
    if (d > n) continue;
    const rest = n - d;
    if (rest === 0) {
      pushCandidate(cand, 'badsub', sm + bg, subReason(sm, bg), n);
      continue;
    }
    let head;
    try { head = toRoman(rest); } catch (e) { continue; }
    let allBig = true;
    for (const c of head) if (VALUE[c] < VALUE[bg]) { allBig = false; break; }
    if (allBig) pushCandidate(cand, 'badsub', head + sm + bg, subReason(sm, bg), n);
  }
  // E. Out of order: swap two neighbours, or rotate.
  for (let i = 0; i < r.length - 1; i++) {
    if (r[i] === r[i + 1]) continue;
    pushCandidate(cand, 'order', r.slice(0, i) + r[i + 1] + r[i] + r.slice(i + 2), ORDER_REASON, n);
  }
  if (r.length > 1) {
    pushCandidate(cand, 'order', r[r.length - 1] + r.slice(0, r.length - 1), ORDER_REASON, n);
    pushCandidate(cand, 'order', r.slice(1) + r[0], ORDER_REASON, n);
  }

  // Prefer forgeries that loosely read as n — those are the tempting ones.
  // Choose a FAMILY first, then a member, so one family (numbers with many M/C/X
  // to double up, say) cannot swamp the others.
  // A swapped-letter fake is only convincing if it still reads as n (XIX -> IXX);
  // an arbitrary swap deep inside a long numeral just looks like gibberish.
  const usable = cand.filter((c) => c.family !== 'order' || c.tempting);
  if (usable.length) {
    const families = [];
    for (const c of usable) if (families.indexOf(c.family) === -1) families.push(c.family);
    const fam = families[Math.floor(roll() * families.length) % families.length];
    const inFam = usable.filter((c) => c.family === fam);
    const tempting = inFam.filter((c) => c.tempting);
    const members = tempting.length ? tempting : inFam;
    const chosen = members[Math.floor(roll() * members.length) % members.length];
    if (!isValidRoman(chosen.text)) return { text: chosen.text, reason: chosen.reason };
  }

  // Belt and braces: hand-checked classics, all invalid by construction.
  const CLASSICS = [
    { text: 'IIII', reason: FOUR_ROW_REASON },
    { text: 'XXXX', reason: FOUR_ROW_REASON },
    { text: 'VV', reason: DOUBLE_REASON },
    { text: 'LL', reason: DOUBLE_REASON },
    { text: 'DD', reason: DOUBLE_REASON },
    { text: 'IC', reason: subReason('I', 'C') },
    { text: 'IL', reason: subReason('I', 'L') },
    { text: 'VX', reason: subReason('V', 'X') }
  ];
  const fb = CLASSICS[Math.floor(roll() * CLASSICS.length) % CLASSICS.length];
  return { text: fb.text, reason: fb.reason };
}
