// Web Audio only — no files. Everything is oscillators and one shared noise buffer.
//
// The interesting problem here is VOLUME OF EVENTS, not synthesis: a 250-domino run
// produces 250 clatters in about six seconds, and naively spawning an oscillator per
// hit both sounds like static and costs real CPU on a tablet. So:
//   - one pre-baked noise buffer is reused for every clatter (no per-hit buffer fill,
//     which was the expensive part of the knowledge/audio-patterns.md recipe),
//   - clatters are rate-limited to MAX_PER_FRAME and MAX_VOICES in flight,
//   - a clatter that is dropped is dropped silently; a wave of dominoes sounds like a
//     wave whether you hear 3 of them per frame or 40.

let ctx = null;
let master = null;
let noiseBuf = null;
let voices = 0;
let frameClatters = 0;

const MAX_VOICES = 16;
const MAX_PER_FRAME = 3;

export function ensureAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      // 0.25 s of white noise, generated once and re-played at different rates and
      // through different filters for every impact sound in the game.
      const n = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Called once per frame from main.js so the per-frame clatter budget refills. */
export function audioFrame() { frameClatters = 0; }

// Mute is a gain change, not a flag checked in every synth function: the graph keeps
// running, so unmuting mid-run does not need any state to be rebuilt.
let muted = false;
export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 0.9;
}
export function isMuted() { return muted; }

function track(node, endsIn) {
  voices++;
  setTimeout(() => { voices--; }, Math.ceil(endsIn * 1000) + 30);
}

function tone(freq, dur, type, vol, endFreq, delay) {
  const c = ensureAudio();
  if (!c) return;
  const t0 = c.currentTime + (delay || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
  track(osc, (delay || 0) + dur);
}

function noise(dur, vol, freq, q, rate, delay) {
  const c = ensureAudio();
  if (!c || !noiseBuf) return;
  const t0 = c.currentTime + (delay || 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rate || 1;
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = freq || 900;
  filt.Q.value = q || 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
  track(src, (delay || 0) + dur);
}

// --- the domino ------------------------------------------------------------
/**
 * One domino hitting the next. `hard` (0..1) comes from the fall speed so the front
 * of the wave is brighter than the tail. Silently dropped when the budget is spent.
 */
export function clatter(hard) {
  if (!ctx && !ensureAudio()) return;
  if (frameClatters >= MAX_PER_FRAME || voices >= MAX_VOICES) return;
  frameClatters++;
  const h = Math.max(0, Math.min(1, hard === undefined ? 0.5 : hard));
  // A wooden tick: short bandpass noise well up the spectrum, plus a tiny body thump.
  noise(0.045, 0.045 + 0.05 * h, 1500 + Math.random() * 1400, 2.2, 0.9 + Math.random() * 0.5);
  if (Math.random() < 0.45) tone(150 + Math.random() * 90, 0.05, 'triangle', 0.02 + 0.02 * h, 90);
}

// --- musical tiles ---------------------------------------------------------
// A struck bell is a fundamental plus an inharmonic partial about 2.76x above it —
// that ratio is what makes it read as "bell" rather than "flute".
export function bell(freq) {
  tone(freq, 1.6, 'sine', 0.16, freq * 0.995);
  tone(freq * 2.76, 1.1, 'sine', 0.07);
  tone(freq * 5.4, 0.5, 'sine', 0.025);
  noise(0.03, 0.05, freq * 3, 3, 1);
}
/** Xylophone / chime bar: a fast, wooden-mallet attack and a short tail. */
export function chime(freq) {
  tone(freq, 0.7, 'triangle', 0.15);
  tone(freq * 2, 0.35, 'sine', 0.05);
  noise(0.02, 0.04, 2600, 2, 1);
}

// --- one-offs --------------------------------------------------------------
export function pop() {
  noise(0.18, 0.22, 1200, 0.7, 1.4);
  tone(880, 0.09, 'square', 0.09, 220);
}
export function confettiWhoosh() {
  noise(0.5, 0.13, 700, 0.6, 0.6);
  for (let i = 0; i < 5; i++) tone(500 + i * 220, 0.4, 'triangle', 0.05, 900 + i * 200, i * 0.05);
}
export function thud() {
  tone(90, 0.32, 'sine', 0.2, 45);
  noise(0.28, 0.13, 260, 0.8, 0.55);
}
export function whoosh() { noise(0.3, 0.09, 480, 0.6, 0.75); }
export function click() { tone(660, 0.045, 'square', 0.05, 520); }
export function place() { noise(0.035, 0.05, 1100, 1.5, 1.1); tone(520, 0.05, 'triangle', 0.04); }
export function erase() { noise(0.09, 0.06, 500, 0.8, 0.7); }
export function go() { for (let i = 0; i < 3; i++) tone([523, 659, 784][i], 0.13, 'triangle', 0.09, null, i * 0.075); }
export function undoBlip() { tone(400, 0.07, 'triangle', 0.05, 300); }
export function redoBlip() { tone(300, 0.07, 'triangle', 0.05, 420); }
export function achievement() {
  const n = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < n.length; i++) tone(n[i], 0.4, 'triangle', 0.1, null, i * 0.09);
}
export function fanfare() {
  const n = [392, 523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < n.length; i++) tone(n[i], 0.55, 'triangle', 0.11, null, i * 0.11);
}
export function fail() { tone(300, 0.3, 'sine', 0.08, 150); }

/** Scales used by the musical tiles — a pentatonic so nothing can sound wrong. */
export const PENT = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
