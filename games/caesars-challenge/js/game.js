/* Caesar's Challenge — game.js  (LANE D)
 *
 * The shell: one rAF loop, one pointer handler, one key handler, the screen
 * state machine, scoring/sundial/streak, save + load, hints, stars, unlocks.
 *
 * Screens: 'profile' | 'map' | 'play' | 'done' | 'failed' | 'trophy'
 *
 * Lane modules are pulled in with DYNAMIC import inside boot() on purpose: a
 * static `import { x }` for a name another lane has not exported is a link-time
 * error that leaves a blank canvas with one cryptic line in the console. This
 * way a missing/broken module is reported by name, on screen and in the
 * console, and the rest of the shell still runs.
 *
 * Canvas sizing note: the canvas is 1 device pixel per CSS pixel (no DPR
 * upscale). render.js resets the transform every frame (setTransform(1,0,0,1,0,0))
 * so a DPR scale matrix cannot survive, and its touch-target clamps (buttons
 * >= 64px, hint zone >= 64px) are written in canvas units — under a 2x DPR
 * buffer those would become 32 CSS px, which is too small for a 7-year-old's
 * thumb. Sharpness loses, thumbs and the low-powered tablet win.
 */

import { sfx } from './audio.js';

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */
const SAVE_KEY = 'calebArcadeData:caesars-challenge';
const SAVE_V = 1;
const PROFILE_KEYS = ['caleb', 'ezra'];
const PROFILE_NAMES = { caleb: 'Caleb', ezra: 'Ezra' };
const FONT_UI = "'Segoe UI',system-ui,-apple-system,'Helvetica Neue',sans-serif";
const FONT_DISPLAY = "Georgia,'Times New Roman','Palatino Linotype',serif";
const HINT_COST = 20;                 // denarii, once the free hints are gone
const MAX_MULT = 5;
const PERFECT_BONUS = 250;
const RIVAL_BONUS = 500;
/* Must match the ids in render.js ARTIFACTS, in province order. */
const ARTIFACT_IDS = ['laurel', 'coin', 'amphora', 'gladius', 'scroll',
  'column', 'helmet', 'wheel', 'eagle', 'crown'];
const RIVAL_NAMES = ['Brutus', 'Cassius', 'Vercingetorix', 'Hannibal', 'Boudicca',
  'Arminius', 'Cleopatra', 'Herodes', 'Mithridates', 'Octavianus'];

/* ------------------------------------------------------------------ */
/* dom                                                                 */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('c');
const ctx = canvas && canvas.getContext ? canvas.getContext('2d', { alpha: false }) : null;
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const muteBtn = document.getElementById('muteBtn');
const bootErr = document.getElementById('bootErr');

/* lane modules, filled by boot() */
let R = null;     // render.js
let TH = null;    // theme.js
let LV = null;    // levels.js
let PZ = null;    // puzzles.js
let NUM = null;   // numerals.js

let W = 0, H = 0;
let running = false;
let rafId = 0;
let lastMs = 0;

/* ------------------------------------------------------------------ */
/* small utils                                                         */
/* ------------------------------------------------------------------ */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function inRect(x, y, r, pad) {
  if (!r) return false;
  const p = pad || 0;
  return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p;
}
const _logged = Object.create(null);
function logOnce(key, msg, err) {
  if (_logged[key]) return;
  _logged[key] = 1;
  console.error("Caesar's Challenge: " + msg, err || '');
}
function roman(n) {
  if (NUM && typeof NUM.toRoman === 'function') {
    try { return NUM.toRoman(n); } catch (e) { /* fall through */ }
  }
  return String(n);
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */
const S = {
  screen: 'profile',
  t: 0,               // global clock (s)
  st: 0,              // seconds inside the current screen
  phaseT: 0,          // seconds inside the current play phase
  profile: null,
  data: null,

  // map
  scrollY: 0, scrollV: 0, maxScroll: 0,

  // level
  level: 0, lvl: null, spec: null, prov: null, provIndex: 0,
  pi: 0, puzzle: null, widget: null,
  phase: 'ask',       // 'ask' | 'good' | 'explain' | 'hint'
  solved: 0, mistakes: 0, hintsUsed: 0, hintStage: 0,
  score: 0, streak: 0, bestStreak: 0,
  sundialLeft: 0,
  rival: { pct: 0, name: 'Brutus', done: false },
  pendingFail: false,
  gain: null,
  panel: null,        // {kind, title, answer, text}
  result: null,
  dings: [],

  // chrome
  toast: '', toastT: 0, toastKind: '',
  flash: 0,
  saveWarn: '',
  hidden: false,
  hit: {}
};

const L = { prompt: null, widget: null, mosaic: null, rival: null };

/* ------------------------------------------------------------------ */
/* save / load                                                         */
/* ------------------------------------------------------------------ */
function blankProfile() {
  return {
    stars: {}, best: {}, unlocked: 1, totalScore: 0,
    denarii: 0, trophies: [], bestStreak: 0
  };
}

function freshData() {
  const d = { v: SAVE_V, lastProfile: null, profiles: {} };
  for (let i = 0; i < PROFILE_KEYS.length; i++) d.profiles[PROFILE_KEYS[i]] = blankProfile();
  return d;
}

/** Defensive: any shape of stored JSON must produce a usable save object. */
function normalizeData(raw) {
  const out = freshData();
  if (!raw || typeof raw !== 'object') return out;
  // Older/other shapes: tolerate a bare profiles map, or fields at the root.
  const src = (raw.profiles && typeof raw.profiles === 'object') ? raw.profiles : raw;
  for (let i = 0; i < PROFILE_KEYS.length; i++) {
    const k = PROFILE_KEYS[i];
    const p = src[k];
    if (!p || typeof p !== 'object') continue;
    const o = out.profiles[k];
    if (p.stars && typeof p.stars === 'object') {
      for (const lv in p.stars) {
        const n = parseInt(lv, 10);
        const st = clamp(p.stars[lv] | 0, 0, 3);
        if (n >= 1 && n <= 100 && st > 0) o.stars[n] = st;
      }
    }
    if (p.best && typeof p.best === 'object') {
      for (const lv in p.best) {
        const n = parseInt(lv, 10);
        const b = Math.max(0, Math.min(9999999, p.best[lv] | 0));
        if (n >= 1 && n <= 100 && b > 0) o.best[n] = b;
      }
    }
    o.unlocked = clamp(p.unlocked | 0 || 1, 1, 100);
    o.totalScore = Math.max(0, p.totalScore | 0);
    o.denarii = Math.max(0, p.denarii | 0);
    o.bestStreak = Math.max(0, p.bestStreak | 0);
    if (Array.isArray(p.trophies)) {
      for (let j = 0; j < p.trophies.length; j++) {
        const id = p.trophies[j];
        if (ARTIFACT_IDS.indexOf(id) >= 0 && o.trophies.indexOf(id) < 0) o.trophies.push(id);
      }
    }
    // A profile that has stars but a stale unlock count: unlock past its best.
    for (const lv in o.stars) {
      const n = parseInt(lv, 10) + 1;
      if (n > o.unlocked) o.unlocked = Math.min(100, n);
    }
  }
  if (PROFILE_KEYS.indexOf(raw.lastProfile) >= 0) out.lastProfile = raw.lastProfile;
  return out;
}

function loadData() {
  let raw = null;
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) raw = JSON.parse(s);
  } catch (e) {
    // corrupt JSON, storage blocked, private browsing — start clean, never throw
    raw = null;
  }
  return normalizeData(raw);
}

/** Verified write. Returns false when the data did not actually stick. */
function saveData(data) {
  let json;
  try { json = JSON.stringify(data); } catch (e) { return false; }
  try {
    localStorage.setItem(SAVE_KEY, json);
    return localStorage.getItem(SAVE_KEY) === json;
  } catch (e) {
    return false;
  }
}

function persist() {
  if (!S.data) return true;
  const ok = saveData(S.data);
  S.saveWarn = ok ? '' : 'Progress could NOT be saved — this device’s storage is full. Tap to hide.';
  return ok;
}

function prof() {
  if (!S.data) S.data = freshData();
  const k = S.profile && S.data.profiles[S.profile] ? S.profile : PROFILE_KEYS[0];
  if (!S.data.profiles[k]) S.data.profiles[k] = blankProfile();
  return S.data.profiles[k];
}

/* ------------------------------------------------------------------ */
/* layout                                                             */
/* ------------------------------------------------------------------ */
/* Mirrors render.drawHudPill's own geometry so the play area can be laid out
 * before the pill is drawn. Kept deliberately in one place. */
function hudBottom() {
  const s = Math.min(W, H);
  const pillH = Math.round(clamp(s * 0.145, 64, 78));
  const pillW = Math.round(Math.min(W - 14, Math.max(300, s * 1.25)));
  const px = Math.round((W - pillW) / 2);
  const py = px < 112 ? 50 : 12;
  return py + pillH;
}

function layoutPlay() {
  if (!W || !H) return;
  const s = Math.min(W, H);
  const colW = clamp(s * 0.075, 22, 84);
  const inset = Math.round(colW + Math.max(8, s * 0.014)) + 2;
  const cw = Math.max(180, W - inset * 2);
  let top = hudBottom() + Math.max(6, s * 0.014);

  // The mosaic is the reward feed — it sits directly under the HUD where the
  // player is already looking, not tucked away at the bottom.
  // Keep it squarish-blocky (~6x2 tiles) so it reads as a mosaic being laid,
  // not as a progress bar — a full-width strip looked exactly like the latter.
  const mh = Math.round(clamp(s * 0.10, 46, 92));
  const mw = Math.round(Math.min(cw, Math.max(170, W * 0.40)));
  L.mosaic = { x: Math.round((W - mw) / 2), y: Math.round(top), w: mw, h: mh };
  top += mh + Math.max(6, s * 0.016);

  let bottom = H - Math.max(8, s * 0.02);
  if (S.spec && S.spec.isBoss) {
    const bh = Math.round(clamp(H * 0.115, 62, 120));
    L.rival = { x: inset, y: Math.round(bottom - bh), w: cw, h: bh };
    bottom -= bh + Math.max(6, s * 0.014);
  } else {
    L.rival = null;
  }

  const avail = Math.max(140, bottom - top);
  const gap = Math.max(6, s * 0.014);
  const promptH = Math.round(avail * 0.36);
  L.prompt = { x: inset, y: Math.round(top), w: cw, h: promptH };
  L.widget = {
    x: inset, y: Math.round(top + promptH + gap),
    w: cw, h: Math.round(avail - promptH - gap)
  };
}

function panelRect() {
  const s = Math.min(W, H);
  const ph = Math.round(Math.min(H * 0.52, Math.max(210, H * 0.44)));
  const pw = Math.round(Math.min(W * 0.94, 560));
  return { x: Math.round((W - pw) / 2), y: Math.round(H - ph - Math.max(10, H * 0.02)), w: pw, h: ph, s: s };
}

/* ------------------------------------------------------------------ */
/* text helpers                                                        */
/* ------------------------------------------------------------------ */
function wrapLines(text, maxW, size, family) {
  ctx.font = 'bold ' + size + 'px ' + (family || FONT_UI);
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Shrink the type until the WHOLE string fits both maxW and maxH. A teach card
 * that silently drops its last line is worse than one in smaller letters, so
 * nothing is ever truncated — only scaled down (to a 10px floor).
 */
function fitLines(text, maxW, maxH, size, family) {
  let sz = Math.max(10, Math.round(size));
  let lines = wrapLines(text, maxW, sz, family);
  let guard = 16;
  while (guard-- > 0 && sz > 10 && lines.length * sz * 1.32 > maxH) {
    sz = Math.max(10, Math.round(sz * 0.92));
    lines = wrapLines(text, maxW, sz, family);
  }
  return { lines: lines, size: sz, lh: sz * 1.32 };
}

function paintLines(fit, cx, top, color, family) {
  ctx.font = 'bold ' + fit.size + 'px ' + (family || FONT_UI);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y0 = top + fit.lh * 0.5;
  for (let i = 0; i < fit.lines.length; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(fit.lines[i], cx + 1, y0 + i * fit.lh + 1);
    ctx.fillStyle = color;
    ctx.fillText(fit.lines[i], cx, y0 + i * fit.lh);
  }
  return fit.lines.length * fit.lh;
}

/** Centred paragraph laid out downward from `top`. Returns height used. */
function drawWrapped(text, cx, top, maxW, maxH, size, color, family) {
  return paintLines(fitLines(text, maxW, maxH, size, family), cx, top, color, family);
}

/** Centred paragraph whose block is vertically centred on `midY`. */
function drawWrappedMid(text, cx, midY, maxW, maxH, size, color, family) {
  const fit = fitLines(text, maxW, maxH, size, family);
  const h = fit.lines.length * fit.lh;
  return paintLines(fit, cx, midY - h / 2, color, family);
}

/* ------------------------------------------------------------------ */
/* screen transitions                                                  */
/* ------------------------------------------------------------------ */
function setScreen(name) {
  S.screen = name;
  S.st = 0;
  S.hit = {};
  placeMute(name);
}

/**
 * The mute button is the one piece of DOM chrome that floats over the canvas,
 * so it has to dodge whatever the current screen draws in that corner. Every
 * screen leaves the top-right free EXCEPT the map, whose "Trophies" chip lives
 * there — on the map it drops to the bottom-right, which is outside the level
 * nodes in both orientations.
 */
function placeMute(name) {
  if (!muteBtn) return;
  if (name === 'map') {
    muteBtn.style.top = 'auto';
    muteBtn.style.bottom = '12px';
  } else {
    muteBtn.style.top = '6px';
    muteBtn.style.bottom = 'auto';
  }
}

function provinceOf(level) {
  const list = (LV && Array.isArray(LV.PROVINCES)) ? LV.PROVINCES : null;
  const idx = clamp(Math.floor((clamp(level, 1, 100) - 1) / 10), 0, 9);
  const p = list && list[idx] ? list[idx] : { index: idx, name: 'Provincia', accent: null };
  return { idx: idx, p: p };
}

function goProfile() {
  setScreen('profile');
  const pv = provinceOf(1);
  if (R) R.setProvince(pv.idx, false, pv.p.accent);
  if (R && R.fx) R.fx.clear();
}

function goMap() {
  setScreen('map');
  S.widget = null;
  const p = prof();
  const pv = provinceOf(p.unlocked);
  S.provIndex = pv.idx;
  S.prov = pv.p;
  if (R) R.setProvince(pv.idx, false, pv.p.accent);
  if (R && R.fx) R.fx.clear();
  S.scrollV = 0;
}

function goTrophy() {
  setScreen('trophy');
}

function startLevel(n) {
  const level = clamp(n | 0, 1, 100);
  let built = null;
  try {
    built = LV.buildLevel(level);
  } catch (e) {
    logOnce('build' + level, 'buildLevel(' + level + ') threw', e);
  }
  if (!built || !built.puzzles || !built.puzzles.length) {
    logOnce('build-empty' + level, 'buildLevel(' + level + ') returned no puzzles');
    showToast('That tablet is cracked — try another level.', 'bad');
    goMap();
    return;
  }
  let spec = built.spec;
  if (!spec) {
    try { spec = LV.levelSpec(level); } catch (e) { spec = null; }
  }
  spec = spec || {};
  S.level = level;
  S.lvl = built;
  S.spec = {
    level: level,
    isBoss: !!spec.isBoss,
    puzzleCount: built.puzzles.length,
    maxMistakes: clamp(spec.maxMistakes | 0 || 3, 1, 5),
    freeHints: Math.max(0, spec.freeHints | 0),
    sundialMs: Math.max(0, spec.sundialMs | 0) || 12000,
    provinceIndex: spec.provinceIndex != null ? spec.provinceIndex : provinceOf(level).idx,
    title: spec.title || ''
  };
  const pv = provinceOf(level);
  S.provIndex = S.spec.provinceIndex != null ? clamp(S.spec.provinceIndex, 0, 9) : pv.idx;
  S.prov = (LV && LV.PROVINCES && LV.PROVINCES[S.provIndex]) || pv.p;

  S.pi = 0; S.solved = 0; S.mistakes = 0; S.hintsUsed = 0; S.hintStage = 0;
  S.score = 0; S.streak = 0; S.pendingFail = false; S.gain = null; S.panel = null;
  S.rival = { pct: 0, name: RIVAL_NAMES[S.provIndex] || 'Brutus', done: false };
  S.widget = null;

  if (R) {
    R.setProvince(S.provIndex, S.spec.isBoss, S.prov && S.prov.accent);
    if (R.fx) { R.fx.clear(); R.fx.dust(W, H); }
  }
  setScreen('play');
  layoutPlay();
  if (!nextPuzzle()) return;
  sfx.play(S.spec.isBoss ? 'boss' : 'tap');
}

const widgetHooks = {
  onSubmit(value) { submit(value); },
  onChange() { /* nothing to do — the widget owns its own display */ },
  sfx(name) { sfx.play(name || 'tap'); }
};

function nextPuzzle() {
  if (!S.lvl || S.pi >= S.lvl.puzzles.length) { finishLevel(); return false; }
  const p = S.lvl.puzzles[S.pi];
  S.puzzle = p;
  S.hintStage = 0;
  S.gain = null;
  S.panel = null;
  S.phase = 'ask';
  S.phaseT = 0;
  S.sundialLeft = S.spec.sundialMs;
  layoutPlay();
  let w = null;
  try {
    w = PZ.createInput(p, widgetHooks);
  } catch (e) {
    logOnce('mkinput' + p.type, 'createInput failed for puzzle type "' + p.type + '"', e);
  }
  if (!w || typeof w.draw !== 'function' || typeof w.layout !== 'function') {
    logOnce('badinput' + (p && p.type), 'createInput returned no usable widget for type "' + (p && p.type) + '"');
    showToast('This tablet is unreadable — skipping it.', 'bad');
    S.pi++;
    S.widget = null;
    return nextPuzzle();
  }
  S.widget = w;
  try { w.layout(L.widget); } catch (e) { logOnce('layout', 'widget.layout threw', e); }
  try { if (w.setEnabled) w.setEnabled(true); } catch (e) { /* optional */ }
  return true;
}

function sundialPct() {
  const ms = S.spec ? S.spec.sundialMs : 0;
  if (!ms) return 0;
  return clamp(S.sundialLeft / ms, 0, 1);
}

function multiplier() {
  return clamp(1 + Math.floor(S.streak / 2), 1, MAX_MULT);
}

function submit(value) {
  if (S.screen !== 'play' || S.phase !== 'ask' || !S.puzzle) return;
  let ok = false;
  try {
    ok = !!PZ.checkAnswer(S.puzzle, value);
  } catch (e) {
    logOnce('check' + S.puzzle.type, 'checkAnswer threw for type "' + S.puzzle.type + '"', e);
    ok = false;
  }
  if (ok) onCorrect(); else onWrong();
}

function onCorrect() {
  const p = S.puzzle;
  S.streak++;
  if (S.streak > S.bestStreak) S.bestStreak = S.streak;
  const mult = multiplier();
  const base = Math.max(10, p.points | 0 || 100);
  const bonus = Math.round(base * 0.5 * sundialPct());
  const gain = base * mult + bonus;
  S.score += gain;
  S.solved++;
  S.pi++;
  const pr = prof();
  pr.denarii = Math.min(999999, pr.denarii + 1);
  S.gain = { gain: gain, mult: mult, bonus: bonus };
  S.phase = 'good';
  S.phaseT = 0;
  sfx.play('correct');
  if (S.streak >= 4 && S.streak % 4 === 0) sfx.play('coin');
  if (R && R.fx && L.prompt) {
    R.fx.spark(L.prompt.x + L.prompt.w / 2, L.prompt.y + L.prompt.h * 0.62, 20);
  }
  try { if (S.widget && S.widget.flash) S.widget.flash('ok'); } catch (e) { /* optional */ }
  try { if (S.widget && S.widget.setEnabled) S.widget.setEnabled(false); } catch (e) { /* optional */ }
}

function onWrong() {
  const p = S.puzzle;
  S.streak = 0;
  S.mistakes++;
  S.pi++;
  S.flash = 0.4;
  sfx.play('wrong');
  let ans = '';
  try { ans = PZ.formatAnswer(p); } catch (e) { logOnce('fmt', 'formatAnswer threw', e); }
  S.panel = {
    kind: 'explain',
    title: 'Not quite',
    answer: ans ? String(ans) : '',
    text: p.teach || p.hint || 'Look at the letters again — a smaller letter before a bigger one means take it away.'
  };
  S.phase = 'explain';
  S.phaseT = 0;
  try { if (S.widget && S.widget.flash) S.widget.flash('bad'); } catch (e) { /* optional */ }
  try { if (S.widget && S.widget.reveal) S.widget.reveal(p); } catch (e) { /* optional */ }
  try { if (S.widget && S.widget.setEnabled) S.widget.setEnabled(false); } catch (e) { /* optional */ }
  if (S.mistakes >= S.spec.maxMistakes) S.pendingFail = true;
}

function dismissPanel() {
  if (S.phase === 'hint') {
    S.panel = null;
    S.phase = 'ask';
    S.phaseT = 0;
    try { if (S.widget && S.widget.setEnabled) S.widget.setEnabled(true); } catch (e) { /* optional */ }
    sfx.play('tap');
    return;
  }
  if (S.phase === 'explain') {
    S.panel = null;
    sfx.play('tap');
    if (S.pendingFail) { failLevel(); return; }
    nextPuzzle();
  }
}

function useHint() {
  if (S.screen !== 'play' || S.phase !== 'ask' || !S.puzzle) return;
  const free = S.spec.freeHints | 0;
  const pr = prof();
  if (S.hintsUsed < free) {
    S.hintsUsed++;
  } else if (pr.denarii >= HINT_COST) {
    pr.denarii -= HINT_COST;
    S.hintsUsed++;
    sfx.play('coin');
    persist();
  } else {
    showToast('No denarii for a hint — take your best guess!', 'bad');
    sfx.play('wrong');
    return;
  }
  S.hintStage++;
  const deep = S.hintStage >= 2;
  const text = deep
    ? (S.puzzle.teach || S.puzzle.hint || 'Count the letters from biggest to smallest.')
    : (S.puzzle.hint || S.puzzle.teach || 'Count the letters from biggest to smallest.');
  S.panel = {
    kind: 'hint',
    title: deep ? 'Teaching Scroll' : 'Scroll of Advice',
    answer: '',
    text: text
  };
  S.phase = 'hint';
  S.phaseT = 0;
  try { if (S.widget && S.widget.setEnabled) S.widget.setEnabled(false); } catch (e) { /* optional */ }
  sfx.play('tap');
}

function finishLevel() {
  const total = S.lvl ? S.lvl.puzzles.length : 1;
  const stars = (S.mistakes === 0 && S.hintsUsed === 0) ? 3 : (S.mistakes <= 1 ? 2 : 1);
  if (stars === 3) S.score += PERFECT_BONUS;
  const selfPct = clamp(S.solved / Math.max(1, total), 0, 1);
  const beatRival = !!(S.spec.isBoss && selfPct >= S.rival.pct);
  if (beatRival) S.score += RIVAL_BONUS;

  const pr = prof();
  const key = String(S.level);
  const prevStars = pr.stars[key] | 0;
  const prevBest = pr.best[key] | 0;
  const newBest = S.score > prevBest;
  pr.stars[key] = Math.max(prevStars, stars);
  if (newBest) pr.best[key] = S.score;
  pr.totalScore = Math.max(0, pr.totalScore) + S.score;
  if (S.bestStreak > pr.bestStreak) pr.bestStreak = S.bestStreak;
  const reward = 5 + stars * 5 + (S.spec.isBoss ? 10 : 0) + (beatRival ? 15 : 0);
  pr.denarii = Math.min(999999, pr.denarii + reward);
  if (S.level >= pr.unlocked) pr.unlocked = Math.min(100, S.level + 1);

  // province cleared -> artifact
  let artifact = null;
  if (S.level % 10 === 0) {
    const id = ARTIFACT_IDS[clamp(Math.floor((S.level - 1) / 10), 0, 9)];
    if (id && pr.trophies.indexOf(id) < 0) {
      pr.trophies.push(id);
      artifact = id;
    }
  }

  S.result = {
    level: S.level, stars: stars, score: S.score,
    best: Math.max(prevBest, S.score), isBoss: !!S.spec.isBoss,
    newBest: newBest && prevBest > 0, artifact: artifact,
    beatRival: beatRival, reward: reward, solved: S.solved, total: total
  };
  S.widget = null;
  setScreen('done');
  S.dings = [];
  for (let i = 0; i < stars; i++) S.dings.push(0.30 + i * 0.32);
  sfx.play('level');
  if (beatRival) sfx.play('boss');
  if (R && R.fx) R.fx.laurel(W, H);
  persist();
}

/** The failed screen prints its tip on ONE line, so a long teach paragraph
 *  gets scaled down to unreadable. Send a short sentence instead. */
function shortTip(p) {
  let t = String((p && (p.hint || p.teach)) || '').trim();
  if (!t) return '';
  const stop = t.search(/[.!?](\s|$)/);
  if (stop > 12) t = t.slice(0, stop + 1);
  if (t.length > 76) t = t.slice(0, 74).replace(/[\s,;:]+\S*$/, '') + '…';
  return t;
}

function failLevel() {
  const total = S.lvl ? S.lvl.puzzles.length : 1;
  const last = S.puzzle;
  S.result = {
    level: S.level, solved: S.solved, total: total,
    teach: shortTip(last)
  };
  S.widget = null;
  setScreen('failed');
  sfx.play('fail');
  if (R && R.fx) R.fx.clear();
}

function showToast(msg, kind) {
  S.toast = String(msg || '');
  S.toastKind = kind || '';
  S.toastT = 2.6;
}

/* ------------------------------------------------------------------ */
/* update                                                             */
/* ------------------------------------------------------------------ */
function update(dt) {
  if (S.toastT > 0) S.toastT = Math.max(0, S.toastT - dt);
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 1.8);
  if (R && R.fx) R.fx.update(dt);

  if (S.screen === 'map') {
    if (Math.abs(S.scrollV) > 1) {
      S.scrollY += S.scrollV * dt;
      S.scrollV *= Math.pow(0.0025, dt);      // ~heavy inertia damping
      if (S.scrollY < 0) { S.scrollY = 0; S.scrollV = 0; }
      if (S.scrollY > S.maxScroll) { S.scrollY = S.maxScroll; S.scrollV = 0; }
    } else {
      S.scrollV = 0;
    }
    return;
  }

  if (S.screen === 'done') {
    while (S.dings.length && S.st >= S.dings[0]) {
      S.dings.shift();
      sfx.play('star');
    }
    return;
  }

  if (S.screen !== 'play') return;

  if (S.phase === 'ask' && !S.hidden) {
    // The sundial only scales the TIME BONUS. Running out never fails a puzzle
    // or a level — that is deliberate: this has to stay kind for a 7-year-old.
    if (S.sundialLeft > 0) S.sundialLeft = Math.max(0, S.sundialLeft - dt * 1000);
    if (S.spec.isBoss && !S.rival.done) {
      const total = Math.max(1, S.lvl.puzzles.length);
      const per = Math.max(4, (S.spec.sundialMs / 1000) * 1.35);
      S.rival.pct = clamp(S.rival.pct + dt / (per * total), 0, 1);
      if (S.rival.pct >= 1) {
        S.rival.done = true;
        showToast(S.rival.name + ' finished first — carve on, the crowd is yours!', 'bad');
      }
    }
  }

  if (S.phase === 'good' && S.phaseT > 0.85) {
    if (S.pi >= S.lvl.puzzles.length) finishLevel();
    else nextPuzzle();
  }
}

/* ------------------------------------------------------------------ */
/* draw                                                               */
/* ------------------------------------------------------------------ */
function draw() {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  switch (S.screen) {
    case 'profile': drawProfile(); break;
    case 'map': drawMap(); break;
    case 'play': drawPlay(); break;
    case 'done': drawDone(); break;
    case 'failed': drawFailed(); break;
    case 'trophy': drawTrophy(); break;
    default: drawMap(); break;
  }
  if (S.flash > 0) {
    ctx.fillStyle = 'rgba(231,76,60,' + (S.flash * 0.32).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  drawToast();
  drawSaveWarn();
}

function profilesForRender() {
  const out = {};
  for (let i = 0; i < PROFILE_KEYS.length; i++) {
    const k = PROFILE_KEYS[i];
    const p = S.data.profiles[k] || blankProfile();
    out[k] = {
      name: PROFILE_NAMES[k], stars: p.stars, unlocked: p.unlocked,
      trophies: p.trophies
    };
  }
  return out;
}

function drawProfile() {
  const out = R.drawProfileSelect(ctx, W, H, S.t, profilesForRender());
  S.hit.profiles = (out && out.rects) || [];
  if (R.fx) R.fx.draw(ctx);
}

function drawMap() {
  const p = prof();
  const view = {
    provinces: (LV && LV.PROVINCES) || [],
    progress: { stars: p.stars, unlocked: p.unlocked },
    scrollY: S.scrollY,
    profileName: PROFILE_NAMES[S.profile] || 'Scribe'
  };
  const out = R.drawLevelMap(ctx, W, H, S.t, view);
  S.hit.map = out;
  S.maxScroll = (out && out.maxScroll) || 0;
  if (S.scrollY > S.maxScroll) S.scrollY = S.maxScroll;
  if (R.fx) R.fx.draw(ctx);
  // denarii purse, bottom-left, out of the way of the road
  const s = Math.min(W, H);
  const sz = Math.round(clamp(s * 0.032, 13, 20));
  ctx.font = 'bold ' + sz + 'px ' + FONT_UI;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const purse = p.denarii + ' denarii';
  const cr = sz * 0.42;
  ctx.beginPath();
  ctx.arc(12 + cr, H - 12 - sz * 0.35, cr, 0, Math.PI * 2);
  ctx.fillStyle = '#d9d3c0';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#8a6a1c';
  ctx.stroke();
  const tx = 12 + cr * 2 + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(purse, tx + 1, H - 11);
  ctx.fillStyle = '#ffd32a';
  ctx.fillText(purse, tx, H - 12);
}

function drawPlay() {
  R.drawBackground(ctx, W, H, S.t);

  if (S.puzzle && L.prompt) {
    try {
      PZ.drawPrompt(ctx, S.puzzle, L.prompt, S.t);
    } catch (e) {
      logOnce('prompt' + S.puzzle.type, 'drawPrompt threw for type "' + S.puzzle.type + '"', e);
    }
  }
  if (S.widget) {
    try {
      S.widget.draw(ctx, S.t);
    } catch (e) {
      logOnce('wdraw', 'widget.draw threw', e);
    }
  }

  const total = S.lvl ? S.lvl.puzzles.length : 1;
  if (L.mosaic) R.drawMosaic(ctx, L.mosaic, S.solved, total, S.level);

  if (S.spec.isBoss && L.rival) {
    R.drawBossRival(ctx, L.rival, S.t, {
      pct: S.rival.pct, name: S.rival.name,
      selfPct: clamp(S.solved / Math.max(1, total), 0, 1),
      lead: (S.solved / Math.max(1, total)) >= S.rival.pct ? 'you' : 'rival'
    });
  }

  if (R.fx) R.fx.draw(ctx);

  if (S.phase === 'good' && S.gain && L.prompt) {
    const k = clamp(S.phaseT / 0.85, 0, 1);
    const a = 1 - k * k;
    const cx = L.prompt.x + L.prompt.w / 2;
    const cy = L.prompt.y + L.prompt.h * 0.5 - k * L.prompt.h * 0.35;
    ctx.save();
    ctx.globalAlpha = a;
    const s = Math.min(W, H);
    TH.carvedText(ctx, '+' + S.gain.gain, cx, cy, s * 0.085, '#ffd32a',
      { maxW: L.prompt.w * 0.6, family: FONT_DISPLAY });
    if (S.gain.mult > 1) {
      ctx.font = 'bold ' + Math.round(s * 0.036) + 'px ' + FONT_UI;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a29bfe';
      ctx.fillText('laurel ×' + S.gain.mult, cx, cy + s * 0.062);
    }
    ctx.restore();
  }

  if (S.panel) drawPanel();

  const hud = R.drawHudPill(ctx, W, {
    levelLabel: 'LEVEL ' + roman(S.level),
    provinceName: (S.prov && S.prov.name) || '',
    index: S.pi, total: total,
    score: S.score, streak: multiplier() > 1 ? multiplier() : 0,
    mistakes: S.mistakes, maxMistakes: S.spec.maxMistakes,
    sundialPct: sundialPct(),
    hintsLeft: Math.max(0, (S.spec.freeHints | 0) - S.hintsUsed)
  });
  S.hit.hint = hud && hud.hintRect;
}

function drawPanel() {
  const p = panelRect();
  const isHint = S.panel.kind === 'hint';
  const tint = isHint ? '#a29bfe' : '#e74c3c';
  const a = clamp(S.phaseT * 5, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(4,4,20,' + (0.52 * a).toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  TH.roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) * 0.075);
  ctx.fillStyle = 'rgba(12,10,40,0.95)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, Math.min(p.w, p.h) * 0.012);
  ctx.strokeStyle = tint;
  ctx.stroke();

  const cx = p.x + p.w / 2;
  TH.carvedText(ctx, S.panel.title, cx, p.y + p.h * 0.14, p.h * 0.115,
    isHint ? '#e8e2d0' : tint, { maxW: p.w * 0.82, family: FONT_DISPLAY });

  let y = p.y + p.h * 0.30;
  if (S.panel.answer) {
    ctx.font = 'bold ' + Math.round(p.h * 0.055) + 'px ' + FONT_UI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a0c4ff';
    ctx.fillText('The answer was', cx, y);
    TH.carvedText(ctx, S.panel.answer, cx, y + p.h * 0.115, p.h * 0.145, '#ffd32a',
      { maxW: p.w * 0.78, family: FONT_DISPLAY });
    y += p.h * 0.235;
  }
  // Lay the button out FIRST so the teach text knows exactly how much room it
  // has: it shrinks to fit that gap rather than losing its last line.
  const bh = Math.round(clamp(p.s * 0.13, 64, 78));
  const btn = {
    x: Math.round(p.x + p.w * 0.16), y: Math.round(p.y + p.h - bh - Math.max(10, p.h * 0.05)),
    w: Math.round(p.w * 0.68), h: bh
  };

  const textTop = y + p.h * 0.05;
  const textMaxH = Math.max(p.h * 0.12, btn.y - Math.max(10, p.h * 0.035) - textTop);
  drawWrapped(S.panel.text, cx, textTop, p.w * 0.84, textMaxH,
    Math.round(p.h * 0.062), 'rgba(255,255,255,0.86)', FONT_UI);

  TH.button(ctx, btn, isHint ? 'Keep going' : 'Got it', { kind: isHint ? 'primary' : 'gold' });
  ctx.restore();
  S.hit.panelBtn = btn;
}

function drawDone() {
  const r = S.result || {};
  const out = R.drawLevelComplete(ctx, W, H, S.t, {
    level: r.level, stars: r.stars, score: r.score, best: r.best,
    isBoss: r.isBoss, newBest: r.newBest, artifact: r.artifact, t: S.st
  });
  S.hit.done = out;
  if (R.fx) R.fx.draw(ctx);
  // reward line under the buttons is not part of render's contract — put the
  // denarii tally at the very bottom edge so it never collides with a rect.
  const s = Math.min(W, H);
  ctx.font = 'bold ' + Math.round(clamp(s * 0.032, 13, 20)) + 'px ' + FONT_UI;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const line = '+' + (r.reward | 0) + ' denarii' + (r.beatRival ? '  ·  you beat ' + S.rival.name + '!' : '');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(line, W / 2 + 1, H - 5);
  ctx.fillStyle = '#ffd32a';
  ctx.fillText(line, W / 2, H - 6);
}

function drawFailed() {
  const r = S.result || {};
  const out = R.drawLevelFailed(ctx, W, H, S.t, {
    level: r.level, solved: r.solved, total: r.total, teach: r.teach, t: S.st
  });
  S.hit.failed = out;
  if (R.fx) R.fx.draw(ctx);
}

function drawTrophy() {
  const out = R.drawTrophyRoom(ctx, W, H, S.t, prof().trophies);
  S.hit.trophy = out;
  if (R.fx) R.fx.draw(ctx);
}

function drawToast() {
  if (S.toastT <= 0 || !S.toast) return;
  const s = Math.min(W, H);
  const a = clamp(S.toastT / 0.4, 0, 1);
  const h = Math.round(clamp(s * 0.095, 42, 64));
  const w = Math.round(Math.min(W * 0.9, 470));
  const el = 2.6 - S.toastT;                    // seconds since it appeared
  const shake = (S.toastKind === 'bad' && el < 0.45)
    ? Math.sin(el * 62) * 7 * (1 - el / 0.45) : 0;
  const x = Math.round((W - w) / 2 + shake);
  const y = Math.round(H - h - Math.max(12, H * 0.035));
  ctx.save();
  ctx.globalAlpha = a;
  TH.roundRect(ctx, x, y, w, h, h * 0.34);
  ctx.fillStyle = 'rgba(6,6,26,0.92)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = S.toastKind === 'bad' ? '#e74c3c' : '#ffd32a';
  ctx.stroke();
  drawWrappedMid(S.toast, x + w / 2, y + h * 0.5, w * 0.9, h * 0.78,
    Math.round(h * 0.30), '#e8e2d0', FONT_UI);
  ctx.restore();
}

function drawSaveWarn() {
  if (!S.saveWarn) { S.hit.warn = null; return; }
  const s = Math.min(W, H);
  const h = Math.round(clamp(s * 0.09, 40, 60));
  const w = Math.round(Math.min(W * 0.94, 520));
  const y = Math.round(Math.max(hudBottom() + 6, H * 0.06));
  const r = { x: Math.round((W - w) / 2), y: y, w: w, h: h };
  ctx.save();
  TH.roundRect(ctx, r.x, r.y, r.w, r.h, h * 0.28);
  ctx.fillStyle = 'rgba(70,10,10,0.92)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e74c3c';
  ctx.stroke();
  drawWrappedMid('⚠ ' + S.saveWarn, r.x + r.w / 2, r.y + r.h * 0.5, r.w * 0.9,
    r.h * 0.8, Math.round(h * 0.26), '#ffd9d4', FONT_UI);
  ctx.restore();
  S.hit.warn = r;
}

/* ------------------------------------------------------------------ */
/* input                                                              */
/* ------------------------------------------------------------------ */
let ptrId = null;
let drag = null;

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  const sx = r.width ? canvas.width / r.width : 1;
  const sy = r.height ? canvas.height / r.height : 1;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

function onDown(e) {
  if (!running) return;
  if (ptrId !== null) return;
  ptrId = e.pointerId;
  const p = toCanvas(e);
  drag = { x0: p.x, y0: p.y, lx: p.x, ly: p.y, lt: performance.now(), moved: false, target: null, scroll0: S.scrollY, v: 0 };
  if (e.cancelable) e.preventDefault();
  sfx.init();

  if (S.saveWarn && inRect(p.x, p.y, S.hit.warn)) {
    S.saveWarn = '';
    return;
  }

  if (S.screen === 'profile') {
    const list = S.hit.profiles || [];
    for (let i = 0; i < list.length; i++) {
      if (inRect(p.x, p.y, list[i].rect)) {
        drag.target = 'profile:' + list[i].key;
        return;
      }
    }
    return;
  }

  if (S.screen === 'map') {
    const m = S.hit.map;
    S.scrollV = 0;
    if (m) {
      if (inRect(p.x, p.y, m.profileRect)) { drag.target = 'swap'; return; }
      if (inRect(p.x, p.y, m.trophyRect)) { drag.target = 'trophy'; return; }
      const nodes = m.nodes || [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = p.x - n.x, dy = p.y - n.y;
        const rr = n.r * 1.25;
        if (dx * dx + dy * dy <= rr * rr) { drag.target = 'node:' + n.level; break; }
      }
    }
    drag.kind = 'scroll';
    return;
  }

  if (S.screen === 'play') {
    if (S.panel) {
      if (inRect(p.x, p.y, S.hit.panelBtn, 8) && S.phaseT > 0.25) drag.target = 'panel';
      else if (S.phaseT > 0.7) drag.target = 'panel';   // tap anywhere, after a beat
      return;
    }
    if (inRect(p.x, p.y, S.hit.hint)) { drag.target = 'hint'; return; }
    if (S.phase === 'ask' && S.widget && S.widget.pointerDown) {
      drag.kind = 'widget';
      try { S.widget.pointerDown(p.x, p.y); } catch (err) { logOnce('wdown', 'widget.pointerDown threw', err); }
    }
    return;
  }

  if (S.screen === 'done') {
    const d = S.hit.done;
    if (d) {
      if (inRect(p.x, p.y, d.nextRect)) drag.target = 'next';
      else if (inRect(p.x, p.y, d.retryRect)) drag.target = 'retry';
      else if (inRect(p.x, p.y, d.mapRect)) drag.target = 'map';
    }
    return;
  }

  if (S.screen === 'failed') {
    const f = S.hit.failed;
    if (f) {
      if (inRect(p.x, p.y, f.retryRect)) drag.target = 'retry';
      else if (inRect(p.x, p.y, f.mapRect)) drag.target = 'map';
    }
    return;
  }

  if (S.screen === 'trophy') {
    const tr = S.hit.trophy;
    if (tr && inRect(p.x, p.y, tr.backRect)) drag.target = 'map';
    else drag.target = 'map';
    return;
  }
}

function onMove(e) {
  if (!running || ptrId === null || e.pointerId !== ptrId || !drag) return;
  const p = toCanvas(e);
  if (e.cancelable) e.preventDefault();
  const dx = p.x - drag.x0, dy = p.y - drag.y0;
  if (!drag.moved && (dx * dx + dy * dy) > 100) drag.moved = true;

  if (drag.kind === 'scroll') {
    S.scrollY = clamp(drag.scroll0 - dy, 0, S.maxScroll);
    const now = performance.now();
    const dtms = Math.max(8, now - drag.lt);
    drag.v = -((p.y - drag.ly) / dtms) * 1000;
    drag.lt = now;
    drag.lx = p.x; drag.ly = p.y;
    return;
  }
  if (drag.kind === 'widget' && S.widget && S.widget.pointerMove) {
    try { S.widget.pointerMove(p.x, p.y); } catch (err) { logOnce('wmove', 'widget.pointerMove threw', err); }
  }
}

function onUp(e) {
  if (ptrId === null || (e && e.pointerId !== ptrId)) return;
  const had = drag;
  ptrId = null;
  drag = null;
  if (!running || !had) return;
  const p = e ? toCanvas(e) : { x: had.lx, y: had.ly };

  if (had.kind === 'widget' && S.widget && S.widget.pointerUp) {
    try { S.widget.pointerUp(p.x, p.y); } catch (err) { logOnce('wup', 'widget.pointerUp threw', err); }
    return;
  }
  if (had.kind === 'scroll') {
    if (had.moved) {
      S.scrollV = clamp(had.v, -4200, 4200);
      return;
    }
    S.scrollV = 0;
  }
  if (had.moved && had.kind !== 'scroll' && had.target !== 'panel') return;
  if (!had.target) return;

  const t = had.target;
  if (t.indexOf('profile:') === 0) {
    pickProfile(t.slice(8));
    return;
  }
  if (t.indexOf('node:') === 0) {
    const lv = parseInt(t.slice(5), 10) || 1;
    const pr = prof();
    if (lv <= pr.unlocked) {
      sfx.play('tap');
      startLevel(lv);
    } else {
      sfx.play('wrong');
      showToast('Locked — finish level ' + pr.unlocked + ' first!', 'bad');
    }
    return;
  }
  switch (t) {
    case 'swap': sfx.play('tap'); goProfile(); break;
    case 'trophy': sfx.play('tap'); goTrophy(); break;
    case 'hint': useHint(); break;
    case 'panel': dismissPanel(); break;
    case 'next':
      if (S.result && S.result.level < 100) { sfx.play('tap'); startLevel(S.result.level + 1); }
      else { sfx.play('tap'); goMap(); }
      break;
    case 'retry': sfx.play('tap'); startLevel(S.result ? S.result.level : S.level); break;
    case 'map': sfx.play('tap'); goMap(); break;
    default: break;
  }
}

function onWheel(e) {
  if (!running || S.screen !== 'map') return;
  S.scrollY = clamp(S.scrollY + e.deltaY, 0, S.maxScroll);
  S.scrollV = 0;
  if (e.cancelable) e.preventDefault();
}

function pickProfile(key) {
  if (PROFILE_KEYS.indexOf(key) < 0) return;
  S.profile = key;
  S.data.lastProfile = key;
  const pr = prof();
  S.bestStreak = pr.bestStreak | 0;
  persist();
  sfx.play('tap');
  goMap();
}

function onKey(e) {
  if (!running) {
    if (overlay && !overlay.classList.contains('hidden') && (e.key === 'Enter' || e.key === ' ')) {
      start();
      e.preventDefault();
    }
    return;
  }
  const k = e.key;

  if (S.screen === 'play') {
    if (S.panel) {
      if (k === 'Enter' || k === ' ' || k === 'Escape') { dismissPanel(); e.preventDefault(); }
      return;
    }
    if (k === 'Escape') { goMap(); e.preventDefault(); return; }
    if (k === 'h' || k === 'H') { useHint(); e.preventDefault(); return; }
    if (S.phase === 'ask' && S.widget && S.widget.key) {
      let used = false;
      try { used = !!S.widget.key(e); } catch (err) { logOnce('wkey', 'widget.key threw', err); }
      if (used) { e.preventDefault(); return; }
    }
    return;
  }

  if (S.screen === 'map') {
    const step = Math.max(60, H * 0.25);
    if (k === 'ArrowDown' || k === 'PageDown') { S.scrollY = clamp(S.scrollY + step, 0, S.maxScroll); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'PageUp') { S.scrollY = clamp(S.scrollY - step, 0, S.maxScroll); e.preventDefault(); }
    else if (k === 'Enter') { startLevel(prof().unlocked); e.preventDefault(); }
    else if (k === 't' || k === 'T') { sfx.play('tap'); goTrophy(); e.preventDefault(); }
    else if (k === 'Escape') { goProfile(); e.preventDefault(); }
    return;
  }

  if (S.screen === 'done') {
    if (k === 'Enter') {
      if (S.result && S.result.level < 100) startLevel(S.result.level + 1); else goMap();
      e.preventDefault();
    } else if (k === 'r' || k === 'R') { startLevel(S.result ? S.result.level : S.level); e.preventDefault(); }
    else if (k === 'Escape' || k === 'm' || k === 'M') { goMap(); e.preventDefault(); }
    return;
  }

  if (S.screen === 'failed') {
    if (k === 'Enter' || k === 'r' || k === 'R') { startLevel(S.result ? S.result.level : S.level); e.preventDefault(); }
    else if (k === 'Escape' || k === 'm' || k === 'M') { goMap(); e.preventDefault(); }
    return;
  }

  if (S.screen === 'trophy') {
    if (k === 'Escape' || k === 'Enter') { goMap(); e.preventDefault(); }
    return;
  }

  if (S.screen === 'profile') {
    if (k === '1') pickProfile(PROFILE_KEYS[0]);
    else if (k === '2') pickProfile(PROFILE_KEYS[1]);
  }
}

/* ------------------------------------------------------------------ */
/* resize                                                             */
/* ------------------------------------------------------------------ */
function resize() {
  const w = Math.max(200, Math.floor(window.innerWidth || document.documentElement.clientWidth || 360));
  const h = Math.max(260, Math.floor(window.innerHeight || document.documentElement.clientHeight || 640));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  W = w; H = h;
  if (R) R.onResize(W, H);
  layoutPlay();
  if (S.widget && L.widget) {
    try { S.widget.layout(L.widget); } catch (e) { logOnce('relayout', 'widget.layout threw on resize', e); }
  }
  S.scrollY = clamp(S.scrollY, 0, S.maxScroll);
}

/* ------------------------------------------------------------------ */
/* loop                                                               */
/* ------------------------------------------------------------------ */
function frame(now) {
  rafId = requestAnimationFrame(frame);
  let dt = (now - lastMs) / 1000;
  lastMs = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 1 / 30);
  S.t += dt;
  S.st += dt;
  S.phaseT += dt;
  update(dt);
  draw();
}

function start() {
  if (running) return;
  sfx.init();
  if (overlay) overlay.classList.add('hidden');
  running = true;
  resize();
  if (S.data && S.data.lastProfile && S.data.profiles[S.data.lastProfile]) {
    S.profile = S.data.lastProfile;
    S.bestStreak = prof().bestStreak | 0;
    goMap();
  } else {
    goProfile();
  }
  lastMs = performance.now();
  if (!rafId) rafId = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* boot                                                               */
/* ------------------------------------------------------------------ */
function fatal(msg) {
  console.error("Caesar's Challenge: " + msg);
  if (bootErr) {
    bootErr.textContent = msg;
    bootErr.classList.remove('hidden');
  }
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Cannot start';
  }
  if (ctx) {
    W = canvas.width = Math.max(200, window.innerWidth || 360);
    H = canvas.height = Math.max(260, window.innerHeight || 640);
    ctx.fillStyle = '#0a0a2e';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 18px ' + FONT_UI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('Caesar’s Challenge failed to load', W / 2, H / 2 - 16);
    ctx.font = 'bold 14px ' + FONT_UI;
    ctx.fillStyle = '#a0c4ff';
    ctx.fillText(msg.slice(0, 90), W / 2, H / 2 + 14);
  }
}

function need(mod, name, fns, missing) {
  if (!mod) { missing.push(name + ' (module failed to load)'); return; }
  for (let i = 0; i < fns.length; i++) {
    if (typeof mod[fns[i]] !== 'function') missing.push(name + '.' + fns[i]);
  }
}

async function boot() {
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Loading…'; }
  if (!ctx) { fatal('This browser has no 2D canvas.'); return; }

  const mods = ['./theme.js', './render.js', './numerals.js', './levels.js', './puzzles.js'];
  const loaded = [];
  for (let i = 0; i < mods.length; i++) {
    try {
      loaded.push(await import(mods[i]));
    } catch (e) {
      console.error("Caesar's Challenge: could not load " + mods[i], e);
      loaded.push(null);
    }
  }
  TH = loaded[0]; R = loaded[1]; NUM = loaded[2]; LV = loaded[3]; PZ = loaded[4];

  const missing = [];
  need(TH, 'theme.js', ['roundRect', 'carvedText', 'button', 'fitText'], missing);
  need(R, 'render.js', ['initRender', 'onResize', 'setProvince', 'drawBackground',
    'drawHudPill', 'drawMosaic', 'drawLevelMap', 'drawLevelComplete', 'drawLevelFailed',
    'drawProfileSelect', 'drawTrophyRoom', 'drawBossRival'], missing);
  if (R && (!R.fx || typeof R.fx.update !== 'function')) missing.push('render.js fx');
  need(NUM, 'numerals.js', ['toRoman', 'fromRoman', 'isValidRoman'], missing);
  need(LV, 'levels.js', ['levelSpec', 'buildLevel'], missing);
  if (LV && !Array.isArray(LV.PROVINCES)) missing.push('levels.js PROVINCES');
  need(PZ, 'puzzles.js', ['checkAnswer', 'formatAnswer', 'drawPrompt', 'createInput'], missing);

  if (missing.length) {
    fatal('Missing module exports: ' + missing.join(', '));
    return;
  }

  S.data = loadData();
  try {
    R.initRender(canvas, ctx);
  } catch (e) {
    fatal('render.initRender failed: ' + (e && e.message));
    return;
  }
  resize();

  // one static frame so the marble shows through the start overlay
  try {
    const pv = provinceOf(1);
    R.setProvince(pv.idx, false, pv.p.accent);
    R.drawBackground(ctx, W, H, 0);
  } catch (e) {
    logOnce('bg', 'drawBackground failed on the preview frame', e);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    S.hidden = !!document.hidden;
    // Coming back from a locked tablet: never bill the sundial for that time.
    lastMs = performance.now();
  });

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const m = sfx.mute(!sfx.isMuted());
      muteBtn.classList.toggle('off', m);
      muteBtn.innerHTML = m ? '&#128263;' : '&#128266;';
      if (!m) { sfx.init(); sfx.play('tap'); }
    });
  }
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Play';
    startBtn.addEventListener('click', start);
  }
}

boot();
