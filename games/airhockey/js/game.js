/* Air Hockey World Cup — game.js
 *
 * The shell: rAF loop, pointer input, screen state machine, rendering, HUD,
 * bracket progression, scoring, save/load, and Super Cup special-move glue.
 *
 * Screens: 'profile' | 'select' | 'bracket' | 'play' | 'matchover' | 'champion' | 'eliminated'
 *
 * The rink is portrait: player defends the BOTTOM goal, CPU the TOP.
 *
 * SUPER CUP SPINNER: moves are awarded by a periodic animated spinner (with
 * jitter) that lives in a SMALL area in the bottom-right — it no longer covers
 * the rink. Both sides get moves; the PLAYER always gets the first spin.
 *
 * DEBUG MATCH (2026-08-29): a subtle "?" on the main menu opens a random
 * player-vs-CPU match with a live difficulty panel (edits tuning.js TUNE) so
 * the values can be fine-tuned in play.
 */

import { sfx } from './audio.js';
import { TEAMS, teamById, buildBracket } from './teams.js';
import { makePuck, resetPuck, stepPuck, malletHit, clampMallet, clampPuckInside } from './physics.js';
import { makeCpu, cpuThink } from './ai.js';
import { MOVE_TYPES, MOVE_POOL, moveById, randomMoveId, makeEffects, fireMove } from './moves.js';
import { TUNE, setDifficulty, currentDerived, DIFF_MIN, DIFF_MAX, DIFF_STEP } from './tuning.js';

const SAVE_KEY = 'calebArcadeData:airhockey';
const PROFILE_KEYS = ['caleb', 'ezra'];
const PROFILE_NAMES = { caleb: 'Caleb', ezra: 'Ezra' };
const ROUND_NAMES = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
const WIN_GOALS = 7;
const FONT = "'Segoe UI',system-ui,-apple-system,sans-serif";

/* Spinner scheduling (seconds). */
const FIRST_SPIN_AT = 4.0;
const SPIN_PERIOD = 12.0;
const SPIN_JITTER = 4.0;
const SPIN_ANIM = 2.0;

/* Debug difficulty knobs (edit TUNE live). */
/* Debug uses a single Easy->Hard difficulty slider (0..10). See tuning.js. */

/* ---------------- canvas ---------------- */
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
}
resize();
addEventListener('resize', resize);

/* ---------------- save ---------------- */
function loadData() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveData(d) {
  const j = JSON.stringify(d);
  try { localStorage.setItem(SAVE_KEY, j); return localStorage.getItem(SAVE_KEY) === j; }
  catch (e) { return false; }
}
let data = loadData();
function profileData(p) {
  data[p] = data[p] || { cups: 0, superCups: 0, played: 0, wins: 0, bestPlace: 0 };
  if (data[p].bestPlace == null) data[p].bestPlace = 0;   // 0 = no finish yet
  return data[p];
}

/* ---------------- state ---------------- */
const S = {
  screen: 'profile',
  profile: null,
  superCup: false,
  debug: false,
  selIndex: 0,
  field: [],
  playerId: null,
  roundIdx: 0,
  matchup: null,
  survivors: [],
  puck: null, rink: null, cpu: null,
  mallet: { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 20 },
  scoreP: 0, scoreC: 0,
  serving: 1,
  goalFlash: 0, goalText: '',
  countdown: 0,
  matchWon: false,
  pFx: null, cFx: null,
  spinNextAt: 0,
  spinWho: 'player',
  spinCount: 0,
  spin: null,
  toast: '', toastUntil: 0,
  matchTime: 0,
  debugDragging: false,
  demo: null,
};

let pointerId = null;

/* ---------------- input ---------------- */
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.init();
  const p = canvasPos(e);
  if (S.screen === 'profile') { handleProfileTap(p); return; }
  if (S.screen === 'select') { handleSelectTap(p); return; }
  if (S.screen === 'bracket') { S.screen = 'play'; startMatch(); return; }
  if (S.screen === 'matchover') { handleMatchoverTap(p); return; }
  if (S.screen === 'champion' || S.screen === 'eliminated') { handleEndTap(p); return; }
  if (S.screen === 'play') {
    if (S.debug && handleDebugTap(p)) return;
    if (S.superCup && S.pFx && S.pFx.held && hitMoveBtn(p)) { firePlayerMove(); return; }
    pointerId = e.pointerId;
    S.mallet.px = S.mallet.x; S.mallet.py = S.mallet.y;
    S.mallet.x = p.x; S.mallet.y = clampToBottom(p.y);
  }
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (S.screen !== 'play') return;
  if (S.debug && S.debugDragging) {
    e.preventDefault();
    const p = canvasPos(e);
    const g = debugPanelGeom();
    const t = Math.max(0, Math.min(1, (p.x - g.track.x) / g.track.w));
    let d = DIFF_MIN + t * (DIFF_MAX - DIFF_MIN);
    d = Math.round(d / DIFF_STEP) * DIFF_STEP;
    setDifficulty(d); applyDebugSizesLive();
    return;
  }
  if (e.pointerId !== pointerId) return;
  e.preventDefault();
  const p = canvasPos(e);
  S.mallet.x = p.x;
  S.mallet.y = clampToBottom(p.y);
}, { passive: false });

function endPointer(e) { if (e.pointerId === pointerId) pointerId = null; S.debugDragging = false; }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function clampToBottom(y) {
  if (!S.rink) return y;
  const mid = S.rink.y + S.rink.h / 2 + S.mallet.r;
  const bot = S.rink.y + S.rink.h - S.mallet.r;
  return Math.max(mid, Math.min(bot, y));
}

/* ---------------- profile / select taps ---------------- */
function handleProfileTap(p) {
  // subtle "?" debug launcher, bottom-right
  const d = debugIconGeom();
  if (Math.hypot(p.x - d.x, p.y - d.y) <= d.r) { startDebugMatch(); return; }
  const bw = Math.min(W * 0.7, 380), bh = 92, gap = 24;
  const x0 = (W - bw) / 2;
  const y0 = H * 0.34;   // MUST match renderProfile's y0
  PROFILE_KEYS.forEach((key, i) => {
    const y = y0 + i * (bh + gap);
    if (p.x >= x0 && p.x <= x0 + bw && p.y >= y && p.y <= y + bh) {
      S.profile = key;
      S.screen = 'select';
      sfx.play('ui');
    }
  });
}

function handleSelectTap(p) {
  const g = selectGeom();
  if (p.x >= g.tog.x && p.x <= g.tog.x + g.tog.w && p.y >= g.tog.y && p.y <= g.tog.y + g.tog.h) {
    S.superCup = !S.superCup; sfx.play('ui'); return;
  }
  if (p.x >= g.start.x && p.x <= g.start.x + g.start.w && p.y >= g.start.y && p.y <= g.start.y + g.start.h) {
    beginTournament(); sfx.play('whistle'); return;
  }
  for (let i = 0; i < 16; i++) {
    const t = g.tile(i);
    if (p.x >= t.x && p.x <= t.x + t.w && p.y >= t.y && p.y <= t.y + t.h) {
      S.selIndex = i; sfx.play('ui'); return;
    }
  }
}

function beginTournament() {
  S.debug = false;
  S.playerId = TEAMS[S.selIndex].id;
  S.field = buildBracket(S.playerId);
  S.survivors = S.field.slice();
  S.roundIdx = 0;
  nextMatch();
  const pd = profileData(S.profile); pd.played++; saveData(data);
  S.screen = 'bracket';
}

function nextMatch() {
  const player = teamById(S.playerId);
  const foes = S.survivors.filter(t => t.id !== S.playerId);
  const cpu = foes[Math.floor(Math.random() * foes.length)];
  S.matchup = { player, cpu };
}

/* ---------------- debug match ---------------- */
function startDebugMatch() {
  S.debug = true;
  S.superCup = false;
  S.profile = S.profile || 'caleb';
  setDifficulty(0);            // start at the easiest end of the slider
  // random distinct teams
  const a = Math.floor(Math.random() * TEAMS.length);
  let b = Math.floor(Math.random() * TEAMS.length);
  if (b === a) b = (b + 1) % TEAMS.length;
  S.playerId = TEAMS[a].id;
  S.matchup = { player: TEAMS[a], cpu: TEAMS[b] };
  S.roundIdx = 0;
  S.survivors = TEAMS.slice();
  S.screen = 'play';
  startMatch();
  sfx.play('whistle');
}

function debugReshuffle() {
  const a = Math.floor(Math.random() * TEAMS.length);
  let b = Math.floor(Math.random() * TEAMS.length);
  if (b === a) b = (b + 1) % TEAMS.length;
  S.playerId = TEAMS[a].id;
  S.matchup = { player: TEAMS[a], cpu: TEAMS[b] };
  startMatch();
  sfx.play('ui');
}

/* ---------------- match ---------------- */
function computeRink() {
  const margin = Math.min(W, H) * 0.06;
  const availW = W - margin * 2;
  const availH = H - margin * 2 - 60;
  let w = Math.min(availW, availH / 1.7);
  let h = w * 1.7;
  if (h > availH) { h = availH; w = h / 1.7; }
  const x = (W - w) / 2;
  const y = (H - h) / 2 + 20;
  return { x, y, w, h, goalW: w * 0.38, wallPad: 0 };
}

function startMatch() {
  if (!S.debug) setDifficulty(realMatchDifficulty());
  S.rink = computeRink();
  S.puck = makePuck(S.rink);
  S.cpu = makeCpu(S.rink);
  S.cpu.r = S.rink.w * TUNE.malletR;
  S.mallet.r = S.rink.w * TUNE.malletR;
  S.mallet.x = S.rink.x + S.rink.w / 2;
  S.mallet.y = S.rink.y + S.rink.h * 0.84;
  S.mallet.px = S.mallet.x; S.mallet.py = S.mallet.y;
  S.scoreP = 0; S.scoreC = 0;
  S.serving = 1;
  S.matchWon = false;
  S.goalFlash = 0;
  S.countdown = 1.2;
  S.matchTime = 0;
  resetPuck(S.puck, S.rink, true);
  if (S.superCup) {
    S.pFx = makeEffects(); S.cFx = makeEffects();
    S.spin = null;
    S.spinCount = 0;
    S.spinWho = 'player';
    S.spinNextAt = FIRST_SPIN_AT;
  } else {
    S.pFx = S.cFx = null;
    S.spin = null;
  }
}

/* Real matches map (round, team skill, profile) onto the SAME 0..10 axis the
 * debug slider uses. Kept gentle for kids; we'll bake in the sweet-spot number
 * once you find it from a debug playthrough. */
const REAL_MATCH_MAX = 3.5;   // tournament spans difficulty 0 .. 3.5
function realMatchDifficulty() {
  const roundNorm = (S.roundIdx / 3);                                  // 0..1 (R16 -> Final)
  const skillNorm = (S.matchup.cpu.skill - 0.70) / (0.92 - 0.70);      // 0..1 (weakest -> best team)
  const profNorm = S.profile === 'ezra' ? 1 : 0;                       // Ezra a touch harder
  const factor = 0.55 * roundNorm + 0.35 * skillNorm + 0.10 * profNorm; // 0..1
  const d = factor * REAL_MATCH_MAX;
  return Math.max(DIFF_MIN, Math.min(DIFF_MAX, d));
}

/* ---------------- spinner ---------------- */
function startSpin(who) {
  const result = randomMoveId();
  const idx = MOVE_POOL.indexOf(result);
  const slice = (Math.PI * 2) / MOVE_POOL.length;
  const spins = 4;
  const targetAngle = spins * Math.PI * 2 + (Math.PI * 2 - idx * slice);
  S.spin = { who, t: 0, dur: SPIN_ANIM, result, angle: 0, targetAngle };
  sfx.play('charge');
}

function finishSpin() {
  const sp = S.spin; if (!sp) return;
  const fx = sp.who === 'player' ? S.pFx : S.cFx;
  fx.held = sp.result;
  const m = MOVE_TYPES[sp.result];
  showToast((sp.who === 'player' ? 'You got ' : 'CPU got ') + m.icon + ' ' + m.name);
  sfx.play('move');
  S.spin = null;
  S.spinCount++;
  const nextWho = sp.who === 'player'
    ? (Math.random() < 0.5 ? 'cpu' : 'player')
    : 'player';
  S.spinWho = nextWho;
  S.spinNextAt = S.matchTime + SPIN_PERIOD + (Math.random() * 2 - 1) * SPIN_JITTER;
}

function firePlayerMove() {
  if (!S.pFx.held) return;
  const m = fireMove(S.pFx.held, S.pFx, S.cFx, now());
  if (m) { sfx.play('move'); showToast(m.icon + ' ' + m.name + '!'); }
}
function maybeFireCpuMove() {
  if (!S.cFx || !S.cFx.held) return;
  if (Math.random() < 0.012 * (0.6 + S.matchup.cpu.skill)) {
    const m = fireMove(S.cFx.held, S.cFx, S.pFx, now());
    if (m) { sfx.play('move'); showToast('CPU: ' + m.icon + ' ' + m.name); }
  }
}

function now() { return performance.now() / 1000; }
function showToast(txt) { S.toast = txt; S.toastUntil = now() + 1.8; }

function scoreGoal(who) {
  sfx.play('goal');
  if (who === 1) { S.scoreP++; S.goalText = 'GOAL!'; S.serving = -1; }
  else { S.scoreC++; S.goalText = S.matchup.cpu.name + ' scores'; S.serving = 1; }
  S.goalFlash = 1;
  S.countdown = 1.1;
  resetPuck(S.puck, S.rink, S.serving === 1);
  if (!S.debug && (S.scoreP >= WIN_GOALS || S.scoreC >= WIN_GOALS)) endMatch();
}

function endMatch() {
  S.matchWon = S.scoreP > S.scoreC;
  if (S.matchWon) {
    sfx.play('win');
    const pd = profileData(S.profile); pd.wins++;
    S.survivors = S.survivors.filter(t => t.id !== S.matchup.cpu.id);
    simulateRound();
    saveData(data);
  } else {
    sfx.play('lose');
  }
  S.screen = 'matchover';
}

function simulateRound() {
  const others = S.survivors.filter(t => t.id !== S.playerId);
  const winners = [];
  for (let i = 0; i < others.length; i += 2) {
    const a = others[i], b = others[i + 1];
    if (!b) { winners.push(a); continue; }
    const pa = a.skill / (a.skill + b.skill);
    winners.push(Math.random() < pa ? a : b);
  }
  S.survivors = [teamById(S.playerId), ...winners];
}

function handleMatchoverTap() {
  if (S.matchWon) {
    if (S.roundIdx >= 3) {
      const pd = profileData(S.profile);
      if (S.superCup) pd.superCups++; else pd.cups++;
      recordFinish(1);                 // champion = 1st place
      saveData(data);
      S.screen = 'champion';
    } else {
      S.roundIdx++;
      nextMatch();
      S.screen = 'bracket';
    }
  } else {
    // knocked out — place by the round lost: R16=16, QF=8, SF=4, Final=2
    recordFinish([16, 8, 4, 2][S.roundIdx] || 16);
    saveData(data);
    S.screen = 'eliminated';
  }
  sfx.play('ui');
}

/* Track each profile's BEST (lowest-numbered) finishing place. Skips debug. */
function recordFinish(place) {
  if (S.debug) return;
  const pd = profileData(S.profile);
  if (!pd.bestPlace || place < pd.bestPlace) pd.bestPlace = place;
}

/* 1 -> '1st', 2 -> '2nd', 4 -> '4th', 16 -> '16th' */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function handleEndTap() {
  S.screen = 'select';
  sfx.play('ui');
}

/* ---------------- update ---------------- */
let last = performance.now();
function frame(t) {
  let dt = (t - last) / 1000;
  last = t;
  if (dt > 0.05) dt = 0.05;
  if (S.screen === 'play') updatePlay(dt);
  else if (S.screen === 'profile') demoUpdate(dt);
  render();
  requestAnimationFrame(frame);
}

function updatePlay(dt) {
  const tt = now();
  S.mallet.vx = (S.mallet.x - S.mallet.px) / Math.max(dt, 0.001);
  S.mallet.vy = (S.mallet.y - S.mallet.py) / Math.max(dt, 0.001);
  S.mallet.px = S.mallet.x; S.mallet.py = S.mallet.y;
  clampMallet(S.mallet, S.rink, 'bottom');

  if (S.superCup && S.spin) {
    S.spin.t += dt;
    const k = Math.min(1, S.spin.t / S.spin.dur);
    const ease = 1 - Math.pow(1 - k, 3);
    S.spin.angle = S.spin.targetAngle * ease;
    if (k >= 1) finishSpin();
  }

  let playerFrozen = false, cpuFrozen = false;
  let speedMul = 1;
  const baseR = S.rink.w * TUNE.malletR;
  if (S.superCup) {
    S.mallet.r = (S.pFx.bigUntil > tt) ? baseR * 1.8 : baseR;
    S.cpu.r = (S.cFx.bigUntil > tt) ? baseR * 1.8 : baseR;
    playerFrozen = S.pFx.freezeUntil > tt;
    cpuFrozen = S.cFx.freezeUntil > tt;
    if (S.pFx.slowUntil > tt || S.cFx.slowUntil > tt) speedMul = 0.5;
    maybeFireCpuMove();
    if (!S.spin && S.countdown <= 0 && S.matchTime >= S.spinNextAt) {
      startSpin(S.spinWho);
    }
  } else {
    // keep sizes live for the debug panel edits
    S.mallet.r = baseR;
    S.cpu.r = baseR;
  }

  if (S.countdown > 0) { S.countdown -= dt; }
  else {
    S.matchTime += dt;
    const prevCx = S.cpu.x, prevCy = S.cpu.y;
    if (!cpuFrozen) cpuThink(S.cpu, S.puck, S.rink, dt);
    S.cpu.vx = (S.cpu.x - prevCx) / Math.max(dt, 0.001);
    S.cpu.vy = (S.cpu.y - prevCy) / Math.max(dt, 0.001);

    const res = stepPuck(S.puck, S.rink, dt, speedMul);
    if (res.hitWall) sfx.play('wall');

    if (S.superCup) applyMagnet(tt);

    if (!playerFrozen && malletHit(S.puck, S.mallet, 1.0)) {
      sfx.play('hit');
      if (S.superCup && S.pFx.armedPower) { applyPower(); S.pFx.armedPower = false; }
    }
    if (malletHit(S.puck, S.cpu, 1.0)) {
      sfx.play('hit');
      if (S.superCup && S.cFx.armedPower) { applyPowerCpu(); S.cFx.armedPower = false; }
    }

    if (S.superCup) applyShields(tt);

    clampPuckInside(S.puck, S.rink);   // never let a shove trap the puck out of bounds

    if (res.goal === 1) scoreGoal(1);
    else if (res.goal === -1) scoreGoal(-1);
  }

  if (S.goalFlash > 0) S.goalFlash = Math.max(0, S.goalFlash - dt * 1.5);
}

function applyPower() {
  const s = Math.hypot(S.puck.vx, S.puck.vy) || 1;
  const k = Math.max(1.7, 950 / s);
  S.puck.vx *= k; S.puck.vy = -Math.abs(S.puck.vy * k) - 300;
}
function applyPowerCpu() {
  const s = Math.hypot(S.puck.vx, S.puck.vy) || 1;
  const k = Math.max(1.7, 950 / s);
  S.puck.vx *= k; S.puck.vy = Math.abs(S.puck.vy * k) + 300;
}

function applyMagnet(tt) {
  const cx = S.rink.x + S.rink.w / 2;
  const mid = S.rink.y + S.rink.h / 2;
  if (S.pFx.magnetUntil > tt && S.puck.y > mid) {
    S.puck.vx += (cx - S.puck.x) * 2.0;
    S.puck.vy -= 200;
  }
  if (S.cFx.magnetUntil > tt && S.puck.y < mid) {
    S.puck.vx += (cx - S.puck.x) * 2.0;
    S.puck.vy += 200;
  }
}

function applyShields(tt) {
  const cx = S.rink.x + S.rink.w / 2;
  if (S.pFx.shieldUntil > tt) {
    const sy = S.rink.y + S.rink.h - S.puck.r - 6;
    if (S.puck.y > sy && Math.abs(S.puck.x - cx) < S.rink.goalW / 2) {
      S.puck.y = sy; S.puck.vy = -Math.abs(S.puck.vy) * 0.95;
    }
  }
  if (S.cFx.shieldUntil > tt) {
    const sy = S.rink.y + S.puck.r + 6;
    if (S.puck.y < sy && Math.abs(S.puck.x - cx) < S.rink.goalW / 2) {
      S.puck.y = sy; S.puck.vy = Math.abs(S.puck.vy) * 0.95;
    }
  }
}

/* ---------------- bottom-right widgets ---------------- */
function spinnerGeom() {
  const r = Math.min(W, H) * 0.11;
  return { x: W - r - 18, y: H - r - 18, r };
}
function moveBtnGeom() {
  const r = Math.min(W, H) * 0.075;
  const sp = spinnerGeom();
  return { x: W - r - 20, y: sp.y - sp.r - r - 12, r };
}
function hitMoveBtn(p) {
  const b = moveBtnGeom();
  return Math.hypot(p.x - b.x, p.y - b.y) <= b.r;
}
function debugIconGeom() {
  const r = Math.min(W, H) * 0.045;
  return { x: W - r - 16, y: H - r - 16, r };
}

/* ---------------- render ---------------- */
function render() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0a2e'); g.addColorStop(0.5, '#141452'); g.addColorStop(1, '#1a1a6e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (S.screen === 'profile') return renderProfile();
  if (S.screen === 'select') return renderSelect();
  if (S.screen === 'bracket') return renderBracket();
  if (S.screen === 'play' || S.screen === 'matchover') { renderMatch(); if (S.screen === 'matchover') renderMatchover(); return; }
  if (S.screen === 'champion') return renderChampion();
  if (S.screen === 'eliminated') return renderEliminated();
}

function centerText(txt, x, y, font, color, glow) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 24; }
  ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0;
}

/* Word-wrap centered text into lines that fit maxW; draws from y downward. */
function wrapText(txt, x, y, maxW, lineH, font, color) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = txt.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
}

/* Draw a team's flag. England is drawn as a real St George's Cross on the
 * canvas because the England flag emoji (a tag sequence) doesn't render on many
 * devices. Every other team uses its emoji. `F` is the emoji font size; the
 * drawn flag is sized to match. align: 'center' (default) | 'left' | 'right'. */
function drawFlag(team, x, cy, F, align) {
  align = align || 'center';
  if (team.id === 'eng') {
    const w = F * 1.35, h = F * 0.95;
    let left = align === 'center' ? x - w / 2 : (align === 'left' ? x : x - w);
    const top = cy - h / 2;
    ctx.save();
    // white field
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left, top, w, h);
    // red St George's cross
    const bar = Math.max(2, h * 0.18);
    ctx.fillStyle = '#ce1124';
    ctx.fillRect(left, cy - bar / 2, w, bar);              // horizontal
    ctx.fillRect(x0Center(left, w) - bar / 2, top, bar, h); // vertical
    // thin border so the white field reads on light backgrounds
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeRect(left, top, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.font = `${F}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(team.flag, x, cy);
  ctx.restore();
}
function x0Center(left, w) { return left + w / 2; }

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderProfile() {
  demoRender();   // live AI-vs-AI match behind the menu
  // slightly darken over the demo so the menu text stays crisp
  ctx.fillStyle = 'rgba(10,10,46,0.4)'; ctx.fillRect(0, 0, W, H);
  centerText('🏒 Air Hockey', W / 2, H * 0.13, `bold ${Math.min(W * 0.08, 48)}px ${FONT}`, '#fff', '#a29bfe');
  centerText('World Cup', W / 2, H * 0.13 + Math.min(W * 0.06, 38), `bold ${Math.min(W * 0.05, 30)}px ${FONT}`, '#ffd32a', '#6c5ce7');
  centerText('Who’s playing?', W / 2, H * 0.29, `600 ${Math.min(W * 0.045, 22)}px ${FONT}`, '#a0c4ff');
  const bw = Math.min(W * 0.7, 380), bh = 92, gap = 24;
  const x0 = (W - bw) / 2, y0 = H * 0.34;
  PROFILE_KEYS.forEach((key, i) => {
    const y = y0 + i * (bh + gap);
    ctx.fillStyle = i === 0 ? 'rgba(108,92,231,0.9)' : 'rgba(162,155,254,0.85)';
    roundRect(x0, y, bw, bh, 16); ctx.fill();
    // name (upper part of the button)
    centerText(PROFILE_NAMES[key], W / 2, y + bh * 0.34, `bold ${Math.min(W * 0.055, 28)}px ${FONT}`, '#fff');
    // stats line: total trophies + best finish
    const pd = profileData(key);
    const trophies = (pd.cups || 0) + (pd.superCups || 0);
    const best = pd.bestPlace ? ordinal(pd.bestPlace) : '—';
    const stat = `🏆 ${trophies}   ·   Best: ${best}`;
    centerText(stat, W / 2, y + bh * 0.72, `600 ${Math.min(W * 0.038, 17)}px ${FONT}`, '#ffe9a8');
  });
  // blurb below the buttons
  const blurbY = y0 + 2 * bh + gap + Math.min(H * 0.06, 44);
  const blurb = 'Pick 1 of 16 nations and knock out the world to lift the cup — slide your mallet, first to 7 wins. Optional Super Cup mode gives every team a special move!';
  wrapText(blurb, W / 2, blurbY, Math.min(W * 0.8, 520), Math.min(W * 0.04, 18) * 1.35, `600 ${Math.min(W * 0.04, 18)}px ${FONT}`, 'rgba(255,255,255,0.8)');
  // subtle debug "?" launcher
  const d = debugIconGeom();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.stroke();
  centerText('?', d.x, d.y, `bold ${d.r}px ${FONT}`, 'rgba(255,255,255,0.7)');
  ctx.globalAlpha = 1;
}

function selectGeom() {
  const top = H * 0.2;
  const gridW = Math.min(W * 0.92, 560);
  const cell = gridW / 4;
  const gx = (W - gridW) / 2;
  const gy = top;
  const tileGap = cell * 0.12;
  const tile = (i) => {
    const cx = i % 4, cy = Math.floor(i / 4);
    return { x: gx + cx * cell + tileGap / 2, y: gy + cy * cell + tileGap / 2, w: cell - tileGap, h: cell - tileGap };
  };
  const gridBottom = gy + cell * 4;
  const tog = { x: (W - Math.min(W * 0.8, 420)) / 2, y: gridBottom + 16, w: Math.min(W * 0.8, 420), h: 56 };
  const start = { x: (W - Math.min(W * 0.6, 300)) / 2, y: tog.y + tog.h + 16, w: Math.min(W * 0.6, 300), h: 62 };
  return { tile, tog, start };
}

function renderSelect() {
  centerText('Pick your team', W / 2, H * 0.11, `bold ${Math.min(W * 0.06, 32)}px ${FONT}`, '#fff', '#a29bfe');
  const g = selectGeom();
  for (let i = 0; i < 16; i++) {
    const t = g.tile(i); const team = TEAMS[i];
    const sel = i === S.selIndex;
    ctx.fillStyle = sel ? 'rgba(255,211,42,0.22)' : 'rgba(255,255,255,0.06)';
    roundRect(t.x, t.y, t.w, t.h, 12); ctx.fill();
    ctx.lineWidth = sel ? 3 : 1;
    ctx.strokeStyle = sel ? '#ffd32a' : 'rgba(255,255,255,0.18)';
    roundRect(t.x, t.y, t.w, t.h, 12); ctx.stroke();
    ctx.fillStyle = team.c1; ctx.beginPath();
    ctx.arc(t.x + t.w / 2, t.y + t.h * 0.34, t.w * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = team.c2; ctx.stroke();
    drawFlag(team, t.x + t.w / 2, t.y + t.h * 0.34, t.w * 0.30, 'center');
    centerText(team.name, t.x + t.w / 2, t.y + t.h * 0.78, `600 ${Math.max(9, t.w * 0.13)}px ${FONT}`, '#e8ecff');
  }
  ctx.fillStyle = S.superCup ? 'rgba(255,107,53,0.28)' : 'rgba(255,255,255,0.06)';
  roundRect(g.tog.x, g.tog.y, g.tog.w, g.tog.h, 14); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = S.superCup ? '#ff6b35' : 'rgba(255,255,255,0.2)';
  roundRect(g.tog.x, g.tog.y, g.tog.w, g.tog.h, 14); ctx.stroke();
  const label = S.superCup ? '⚡ SUPER CUP: ON — spin for special moves!' : '⚡ Super Cup mode: OFF (tap to enable special moves)';
  centerText(label, W / 2, g.tog.y + g.tog.h / 2, `600 ${Math.min(W * 0.035, 16)}px ${FONT}`, S.superCup ? '#ffd7bd' : '#a0c4ff');
  ctx.fillStyle = '#6c5ce7'; roundRect(g.start.x, g.start.y, g.start.w, g.start.h, 14); ctx.fill();
  centerText('Enter the Cup ▶', W / 2, g.start.y + g.start.h / 2, `bold ${Math.min(W * 0.05, 24)}px ${FONT}`, '#fff');
}

function renderBracket() {
  const p = S.matchup.player, c = S.matchup.cpu;
  centerText(ROUND_NAMES[S.roundIdx], W / 2, H * 0.2, `bold ${Math.min(W * 0.07, 38)}px ${FONT}`, '#ffd32a', '#6c5ce7');
  centerText(`${S.survivors.length} teams left`, W / 2, H * 0.28, `600 ${Math.min(W * 0.04, 20)}px ${FONT}`, '#a0c4ff');
  drawFlag(p, W * 0.32, H * 0.45, Math.min(W * 0.16, 90), 'center');
  drawFlag(c, W * 0.68, H * 0.45, Math.min(W * 0.16, 90), 'center');
  centerText(p.name, W * 0.32, H * 0.55, `bold ${Math.min(W * 0.045, 22)}px ${FONT}`, '#fff');
  centerText(c.name, W * 0.68, H * 0.55, `bold ${Math.min(W * 0.045, 22)}px ${FONT}`, '#fff');
  centerText('vs', W / 2, H * 0.45, `bold ${Math.min(W * 0.06, 30)}px ${FONT}`, '#e74c3c');
  if (S.superCup) {
    centerText('⚡ Super Cup — spin for moves during play', W / 2, H * 0.63, `600 ${Math.min(W * 0.04, 18)}px ${FONT}`, '#ffd7bd');
  }
  centerText('First to 7 goals wins', W / 2, H * 0.7, `600 ${Math.min(W * 0.04, 18)}px ${FONT}`, '#a0c4ff');
  const bw = Math.min(W * 0.6, 300), bh = 62, bx = (W - bw) / 2, by = H * 0.78;
  ctx.fillStyle = '#6c5ce7'; roundRect(bx, by, bw, bh, 14); ctx.fill();
  centerText('Face off! 🏒', W / 2, by + bh / 2, `bold ${Math.min(W * 0.05, 24)}px ${FONT}`, '#fff');
}

function renderMatch() {
  const rk = S.rink; if (!rk) return;
  const rinkR = Math.min(rk.w, rk.h) * 0.14;
  ctx.fillStyle = '#12123a';
  roundRect(rk.x, rk.y, rk.w, rk.h, rinkR); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(162,155,254,0.5)';
  roundRect(rk.x, rk.y, rk.w, rk.h, rinkR); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rk.x, rk.y + rk.h / 2); ctx.lineTo(rk.x + rk.w, rk.y + rk.h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rk.x + rk.w / 2, rk.y + rk.h / 2, rk.w * 0.16, 0, Math.PI * 2); ctx.stroke();
  const cx = rk.x + rk.w / 2, gh = rk.goalW;
  ctx.strokeStyle = S.matchup.cpu.c1; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx - gh / 2, rk.y); ctx.lineTo(cx + gh / 2, rk.y); ctx.stroke();
  ctx.strokeStyle = S.matchup.player.c1;
  ctx.beginPath(); ctx.moveTo(cx - gh / 2, rk.y + rk.h); ctx.lineTo(cx + gh / 2, rk.y + rk.h); ctx.stroke();

  const tt = now();
  if (S.superCup) {
    if (S.pFx.shieldUntil > tt) drawShield(cx, rk.y + rk.h - 8, gh, S.matchup.player.c1);
    if (S.cFx.shieldUntil > tt) drawShield(cx, rk.y + 8, gh, S.matchup.cpu.c1);
  }

  drawPuck(S.puck);
  drawMallet(S.mallet, S.matchup.player.c1, S.matchup.player.c2, S.superCup && S.pFx.freezeUntil > tt);
  drawMallet(S.cpu, S.matchup.cpu.c1, S.matchup.cpu.c2, S.superCup && S.cFx.freezeUntil > tt);

  drawHud();

  if (S.countdown > 0) {
    centerText(Math.ceil(S.countdown), W / 2, rk.y + rk.h / 2, `bold ${rk.w * 0.2}px ${FONT}`, 'rgba(255,255,255,0.9)', '#6c5ce7');
  }
  if (S.goalFlash > 0) {
    ctx.globalAlpha = S.goalFlash * 0.5;
    ctx.fillStyle = '#ffd32a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    centerText(S.goalText, W / 2, H * 0.4, `bold ${Math.min(W * 0.1, 60)}px ${FONT}`, '#fff', '#ff6b35');
  }
  if (S.superCup) {
    if (S.pFx.held) drawMoveButton(tt);
    if (S.spin) drawSpinner();
  }
  if (S.debug) drawDebugPanel();
  if (S.toast && S.toastUntil > tt) {
    ctx.globalAlpha = Math.min(1, (S.toastUntil - tt) / 0.6);
    centerText(S.toast, W / 2, H * 0.16, `bold ${Math.min(W * 0.05, 24)}px ${FONT}`, '#fff', '#ff6b35');
    ctx.globalAlpha = 1;
  }
}

function drawShield(cx, y, w, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = 0.8; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.stroke();
  ctx.globalAlpha = 0.25; ctx.lineWidth = 20; ctx.stroke();
  ctx.restore();
}

/* Light puck with a dark accent ring so it stands out on the dark table. */
function drawPuck(p) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#f4f7ff';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#12123a'; ctx.lineWidth = Math.max(3, p.r * 0.28);
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#1a1a4a';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMallet(m, c1, c2, frozen) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = c2;
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.30, 0, Math.PI * 2); ctx.fill();
  if (frozen) {
    ctx.strokeStyle = '#66e0ff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  const pill = { w: Math.min(W * 0.86, 460), h: 54 };
  const x = (W - pill.w) / 2, y = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(x, y, pill.w, pill.h, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; roundRect(x, y, pill.w, pill.h, 14); ctx.stroke();
  const p = S.matchup.player, c = S.matchup.cpu;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  drawFlag(p, x + 14, y + pill.h / 2, 22, 'left');
  ctx.textAlign = 'left';
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = '#ffd32a';
  ctx.fillText(S.scoreP, x + 52, y + pill.h / 2);
  ctx.textAlign = 'right';
  drawFlag(c, x + pill.w - 14, y + pill.h / 2, 22, 'right');
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = '#ffd32a';
  ctx.fillText(S.scoreC, x + pill.w - 46, y + pill.h / 2);
  ctx.textAlign = 'center'; ctx.font = `600 13px ${FONT}`; ctx.fillStyle = '#a0c4ff';
  const label = S.debug ? 'DEBUG · ' + S.matchup.player.name + ' vs ' + S.matchup.cpu.name
    : ROUND_NAMES[S.roundIdx] + (S.superCup ? ' · Super Cup' : '');
  ctx.fillText(label, W / 2, y + pill.h / 2);
}

function drawMoveButton(tt) {
  const b = moveBtnGeom();
  const held = S.pFx.held;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,107,53,0.92)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = MOVE_TYPES[held].color;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
  centerText(MOVE_TYPES[held].icon, b.x, b.y - b.r * 0.1, `${b.r}px ${FONT}`, '#fff');
  centerText('TAP!', b.x, b.y + b.r + 12, `bold 13px ${FONT}`, '#ffd32a');
}

/* Small spinning wheel in the bottom-right — does NOT cover the rink. */
function drawSpinner() {
  const sp = S.spin;
  const g = spinnerGeom();
  const cx = g.x, cy = g.y, R = g.r;
  // subtle disc backdrop only under the wheel
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4,4,22,0.55)'; ctx.fill();
  ctx.restore();

  const label = sp.who === 'player' ? 'Your spin!' : 'CPU spin';
  centerText(label, cx, cy - R - 14, `bold ${Math.min(W * 0.035, 16)}px ${FONT}`,
    sp.who === 'player' ? '#ffd32a' : '#a0c4ff');

  const n = MOVE_POOL.length;
  const slice = (Math.PI * 2) / n;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sp.angle);
  for (let i = 0; i < n; i++) {
    const m = MOVE_TYPES[MOVE_POOL[i]];
    const a0 = i * slice, a1 = a0 + slice;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
    ctx.fillStyle = m.color; ctx.globalAlpha = 0.9; ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    const am = a0 + slice / 2;
    const ix = Math.cos(am) * R * 0.64, iy = Math.sin(am) * R * 0.64;
    ctx.save(); ctx.translate(ix, iy); ctx.rotate(-sp.angle);
    ctx.font = `${R * 0.26}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.icon, 0, 0);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#12123a'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#a29bfe'; ctx.stroke();
  ctx.restore();

  // fixed pointer at top of the wheel
  ctx.beginPath();
  ctx.moveTo(cx, cy - R - 2);
  ctx.lineTo(cx - 10, cy - R - 18);
  ctx.lineTo(cx + 10, cy - R - 18);
  ctx.closePath();
  ctx.fillStyle = '#ffd32a'; ctx.fill();
}

/* ---------------- debug panel ---------------- */
/* ---------------- debug panel (single Easy->Hard slider) ---------------- */
function debugPanelGeom() {
  const pw = Math.min(W * 0.82, 420);
  const ph = 128;
  const x = (W - pw) / 2;
  const y = 74;
  // slider track
  const pad = 22;
  const track = { x: x + pad, y: y + 70, w: pw - pad * 2, h: 8 };
  return { x, y, pw, ph, track };
}

function diffToKnobX(g) {
  const t = (TUNE.difficulty - DIFF_MIN) / (DIFF_MAX - DIFF_MIN);
  return g.track.x + t * g.track.w;
}

function drawDebugPanel() {
  const g = debugPanelGeom();
  ctx.save();
  ctx.fillStyle = 'rgba(4,4,22,0.85)';
  roundRect(g.x, g.y, g.pw, g.ph, 12); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(162,155,254,0.5)';
  roundRect(g.x, g.y, g.pw, g.ph, 12); ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#ffd32a';
  ctx.fillText('⚙ Difficulty', g.x + 14, g.y + 18);
  // derived readout
  const d = currentDerived();
  ctx.textAlign = 'right';
  ctx.font = `11px ${FONT}`; ctx.fillStyle = '#a0c4ff';
  ctx.fillText(`CPU ${d.cpuSpeed}px/s · react ${d.cpuReact} · puck ${d.puckMaxSpeed}px/s`, g.x + g.pw - 14, g.y + 18);

  // Easy / Hard end labels
  ctx.textAlign = 'left'; ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = '#26de81';
  ctx.fillText('Easy', g.track.x, g.y + 44);
  ctx.textAlign = 'right'; ctx.fillStyle = '#e74c3c';
  ctx.fillText('Hard', g.track.x + g.track.w, g.y + 44);

  // track
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(g.track.x, g.track.y, g.track.w, g.track.h, 4); ctx.fill();
  const kx = diffToKnobX(g);
  // filled portion
  const grad = ctx.createLinearGradient(g.track.x, 0, g.track.x + g.track.w, 0);
  grad.addColorStop(0, '#26de81'); grad.addColorStop(1, '#e74c3c');
  ctx.fillStyle = grad;
  roundRect(g.track.x, g.track.y, kx - g.track.x, g.track.h, 4); ctx.fill();
  // knob
  ctx.beginPath(); ctx.arc(kx, g.track.y + g.track.h / 2, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#6c5ce7'; ctx.stroke();
  // big value
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = '#12123a';
  ctx.fillText(TUNE.difficulty.toFixed(1), kx, g.track.y + g.track.h / 2);

  // −/+ nudge buttons and footer actions
  const by = g.y + g.ph - 30;
  const bw = 34, bh = 24;
  drawSmallBtn(g.x + 14, by, bw, bh, '−');
  drawSmallBtn(g.x + 14 + bw + 6, by, bw, bh, '+');
  drawSmallBtn(g.x + g.pw - 14 - 64, by, 64, bh, 'New');
  drawSmallBtn(g.x + g.pw - 14 - 64 - 6 - 56, by, 56, bh, 'Exit');
  // current matchup label — flags drawn (England needs a real cross)
  const mlY = by + bh / 2, mlCx = g.x + g.pw / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `11px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('vs', mlCx, mlY);
  drawFlag(S.matchup.player, mlCx - 16, mlY, 14, 'right');
  drawFlag(S.matchup.cpu, mlCx + 16, mlY, 14, 'left');
  ctx.restore();
}

function drawSmallBtn(x, y, w, h, label) {
  ctx.fillStyle = 'rgba(108,92,231,0.55)';
  roundRect(x, y, w, h, 6); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  roundRect(x, y, w, h, 6); ctx.stroke();
  ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function applyDebugSizesLive() {
  // reflect size changes immediately mid-rally
  if (S.rink) {
    S.mallet.r = S.rink.w * TUNE.malletR;
    S.cpu.r = S.rink.w * TUNE.malletR;
    if (S.puck) S.puck.r = S.rink.w * TUNE.puckR;
  }
}

function handleDebugTap(p) {
  const g = debugPanelGeom();
  if (p.x < g.x || p.x > g.x + g.pw || p.y < g.y || p.y > g.y + g.ph) return false;

  // slider drag/tap zone (generous vertical band around the track)
  if (p.y >= g.track.y - 22 && p.y <= g.track.y + 30 &&
      p.x >= g.track.x - 18 && p.x <= g.track.x + g.track.w + 18) {
    const t = Math.max(0, Math.min(1, (p.x - g.track.x) / g.track.w));
    let d = DIFF_MIN + t * (DIFF_MAX - DIFF_MIN);
    d = Math.round(d / DIFF_STEP) * DIFF_STEP;
    setDifficulty(d); applyDebugSizesLive(); sfx.play('ui');
    S.debugDragging = true;
    return true;
  }

  // footer buttons
  const by = g.y + g.ph - 30;
  const bw = 34, bh = 24;
  if (p.y >= by && p.y <= by + bh) {
    const minusX = g.x + 14, plusX = g.x + 14 + bw + 6;
    const newX = g.x + g.pw - 14 - 64, exitX = g.x + g.pw - 14 - 64 - 6 - 56;
    if (p.x >= minusX && p.x <= minusX + bw) { setDifficulty(TUNE.difficulty - DIFF_STEP); applyDebugSizesLive(); sfx.play('ui'); return true; }
    if (p.x >= plusX && p.x <= plusX + bw) { setDifficulty(TUNE.difficulty + DIFF_STEP); applyDebugSizesLive(); sfx.play('ui'); return true; }
    if (p.x >= newX && p.x <= newX + 64) { debugReshuffle(); return true; }
    if (p.x >= exitX && p.x <= exitX + 56) { S.debug = false; S.screen = 'profile'; sfx.play('ui'); return true; }
  }
  return true; // swallow taps inside the panel
}

function renderMatchover() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  const won = S.matchWon;
  centerText(won ? 'You win! 🎉' : 'You lost', W / 2, H * 0.36, `bold ${Math.min(W * 0.09, 52)}px ${FONT}`, won ? '#ffd32a' : '#e74c3c', won ? '#6c5ce7' : null);
  centerText(`${S.scoreP} – ${S.scoreC}`, W / 2, H * 0.47, `bold ${Math.min(W * 0.1, 56)}px ${FONT}`, '#fff');
  const msg = won ? (S.roundIdx >= 3 ? 'Tap to lift the cup' : 'Tap for the next round') : 'Tap to continue';
  centerText(msg, W / 2, H * 0.6, `600 ${Math.min(W * 0.045, 22)}px ${FONT}`, '#a0c4ff');
}

function renderChampion() {
  centerText('🏆', W / 2, H * 0.28, `${Math.min(W * 0.24, 140)}px ${FONT}`, '#ffd32a', '#ff6b35');
  const title = S.superCup ? 'SUPER CUP CHAMPIONS!' : 'WORLD CUP CHAMPIONS!';
  centerText(title, W / 2, H * 0.46, `bold ${Math.min(W * 0.07, 40)}px ${FONT}`, '#ffd32a', '#6c5ce7');
  const champTeam = teamById(S.playerId);
  const champF = Math.min(W * 0.06, 30);
  ctx.font = `bold ${champF}px ${FONT}`;
  const nameW = ctx.measureText(champTeam.name).width;
  const flagW = champF * 1.4;
  const groupLeft = W / 2 - (flagW + nameW) / 2;
  drawFlag(champTeam, groupLeft, H * 0.55, champF, 'left');
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.font = `bold ${champF}px ${FONT}`;
  ctx.fillText(champTeam.name, groupLeft + flagW, H * 0.55);
  const pd = profileData(S.profile);
  centerText(`${PROFILE_NAMES[S.profile]} · Cups: ${pd.cups}  Super Cups: ${pd.superCups}`, W / 2, H * 0.64, `600 ${Math.min(W * 0.04, 18)}px ${FONT}`, '#a0c4ff');
  centerText('Tap to play again', W / 2, H * 0.75, `600 ${Math.min(W * 0.045, 20)}px ${FONT}`, '#a29bfe');
}

function renderEliminated() {
  centerText('Knocked out', W / 2, H * 0.4, `bold ${Math.min(W * 0.08, 46)}px ${FONT}`, '#e74c3c');
  centerText(`Reached: ${ROUND_NAMES[S.roundIdx]}`, W / 2, H * 0.5, `600 ${Math.min(W * 0.045, 22)}px ${FONT}`, '#a0c4ff');
  centerText('Tap to try again', W / 2, H * 0.62, `600 ${Math.min(W * 0.045, 20)}px ${FONT}`, '#a29bfe');
}

/* ---------------- attract-mode demo (behind the main menu) ---------------- */
/* A self-contained AI-vs-AI rally that plays behind the "Who's playing?" screen.
 * It uses its OWN rink/puck/mallets and never touches real match state. Two
 * simple auto-controllers knock the puck around; goals just reset the puck. */
function demoInit() {
  const rk = computeRink();
  const r = rk.w * 0.072;
  const a = TEAMS[Math.floor(Math.random() * TEAMS.length)];
  let bi = Math.floor(Math.random() * TEAMS.length);
  if (TEAMS[bi].id === a.id) bi = (bi + 1) % TEAMS.length;
  const b = TEAMS[bi];
  S.demo = {
    rink: rk,
    top: a, bottom: b,
    puck: { x: rk.x + rk.w / 2, y: rk.y + rk.h / 2, vx: (Math.random() * 2 - 1) * 300, vy: (Math.random() < 0.5 ? -1 : 1) * 360, r: rk.w * 0.040 },
    mTop: { x: rk.x + rk.w / 2, y: rk.y + rk.h * 0.16, px: 0, py: 0, vx: 0, vy: 0, r },
    mBot: { x: rk.x + rk.w / 2, y: rk.y + rk.h * 0.84, px: 0, py: 0, vx: 0, vy: 0, r },
    scoreTop: 0, scoreBot: 0,
    resetIn: 0,
    stuckTimer: 0,
  };
}

function demoDriver(m, puck, rk, half, dt) {
  // Chase the puck when it's on our half, otherwise drift back to a guard spot.
  const mid = rk.y + rk.h / 2;
  const onMyHalf = half === 'top' ? puck.y < mid : puck.y > mid;
  const goalX = rk.x + rk.w / 2;
  let tx, ty;
  if (onMyHalf) {
    // line up behind the puck (own-goal side) and push it toward the far goal
    const ownGoalY = half === 'top' ? rk.y : rk.y + rk.h;
    const dirx = goalX - puck.x;
    const diry = (mid - puck.y);
    const dl = Math.hypot(dirx, diry) || 1;
    tx = puck.x - (dirx / dl) * m.r * 0.8;
    ty = puck.y + (half === 'top' ? -1 : 1) * m.r * 0.9;
    // if the puck is behind us toward our goal, get goal-side
    if ((half === 'top' && puck.y < m.y) || (half === 'bottom' && puck.y > m.y)) {
      ty = half === 'top' ? puck.y - m.r : puck.y + m.r;
      tx = puck.x;
    }
  } else {
    tx = goalX + (puck.x - goalX) * 0.35;
    ty = half === 'top' ? rk.y + rk.h * 0.14 : rk.y + rk.h * 0.86;
  }
  // clamp to own half
  tx = Math.max(rk.x + m.r, Math.min(rk.x + rk.w - m.r, tx));
  if (half === 'top') ty = Math.max(rk.y + m.r, Math.min(mid - m.r, ty));
  else ty = Math.max(mid + m.r, Math.min(rk.y + rk.h - m.r, ty));
  // move with a moderate speed cap (lively but not frantic)
  const react = 0.16, maxSpeed = 620;
  m.px = m.x; m.py = m.y;
  let dx = (tx - m.x) * react, dy = (ty - m.y) * react;
  const step = Math.hypot(dx, dy), maxStep = maxSpeed * dt;
  if (step > maxStep && step > 0) { const k = maxStep / step; dx *= k; dy *= k; }
  m.x += dx; m.y += dy;
  m.vx = (m.x - m.px) / Math.max(dt, 0.001);
  m.vy = (m.y - m.py) / Math.max(dt, 0.001);
}

function demoServe(D, rk) {
  D.puck.x = rk.x + rk.w / 2; D.puck.y = rk.y + rk.h / 2;
  D.puck.vx = (Math.random() * 2 - 1) * 300; D.puck.vy = (Math.random() < 0.5 ? -1 : 1) * 360;
  D.stuckTimer = 0;
}

function demoUpdate(dt) {
  if (!S.demo || (S.demo.rink && (S.demo.rink.w !== computeRink().w))) demoInit();
  const D = S.demo, rk = D.rink;
  if (D.resetIn > 0) {
    D.resetIn -= dt;
    if (D.resetIn <= 0) demoServe(D, rk);
    return;
  }
  demoDriver(D.mTop, D.puck, rk, 'top', dt);
  demoDriver(D.mBot, D.puck, rk, 'bottom', dt);
  const res = stepPuck(D.puck, rk, dt, 1);
  malletHit(D.puck, D.mTop, 1.0);
  malletHit(D.puck, D.mBot, 1.0);
  clampPuckInside(D.puck, rk);   // never trap the puck out of bounds in a corner
  if (res.goal === 1) { D.scoreBot++; D.resetIn = 0.7; return; }
  else if (res.goal === -1) { D.scoreTop++; D.resetIn = 0.7; return; }

  // stuck-watchdog: if the puck creeps along too slowly for ~1.6s (e.g. pinned
  // in a corner by a mallet), re-serve it from the centre.
  const speed = Math.hypot(D.puck.vx, D.puck.vy);
  if (speed < 70) {
    D.stuckTimer += dt;
    if (D.stuckTimer > 1.6) demoServe(D, rk);
  } else {
    D.stuckTimer = 0;
  }
}

function demoRender() {
  const D = S.demo; if (!D) return;
  const rk = D.rink;
  ctx.save();
  ctx.globalAlpha = 0.42;   // dim so the menu stays readable
  // table
  const rinkR = Math.min(rk.w, rk.h) * 0.14;
  ctx.fillStyle = '#12123a';
  roundRect(rk.x, rk.y, rk.w, rk.h, rinkR); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(162,155,254,0.5)';
  roundRect(rk.x, rk.y, rk.w, rk.h, rinkR); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rk.x, rk.y + rk.h / 2); ctx.lineTo(rk.x + rk.w, rk.y + rk.h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(rk.x + rk.w / 2, rk.y + rk.h / 2, rk.w * 0.16, 0, Math.PI * 2); ctx.stroke();
  const cx = rk.x + rk.w / 2, gh = rk.goalW;
  ctx.strokeStyle = D.top.c1; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx - gh / 2, rk.y); ctx.lineTo(cx + gh / 2, rk.y); ctx.stroke();
  ctx.strokeStyle = D.bottom.c1;
  ctx.beginPath(); ctx.moveTo(cx - gh / 2, rk.y + rk.h); ctx.lineTo(cx + gh / 2, rk.y + rk.h); ctx.stroke();
  drawPuck(D.puck);
  drawMallet(D.mTop, D.top.c1, D.top.c2, false);
  drawMallet(D.mBot, D.bottom.c1, D.bottom.c2, false);
  ctx.restore();
}

/* ---------------- boot ---------------- */
/* No Play overlay — load straight into the combined title/profile screen with
 * the AI-vs-AI demo running behind it. Audio can't start until a user gesture,
 * so the first pointerdown (on a profile button) calls sfx.init(). */
const overlay = document.getElementById('overlay');
if (overlay) overlay.classList.add('hidden');
S.screen = 'profile';

requestAnimationFrame((t) => { last = t; frame(t); });
