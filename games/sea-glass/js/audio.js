// Web Audio only — no files. Wave/gull ambience plus the game's SFX.
// Everything is created lazily off a user gesture (ensureAudio resumes).

let ctx = null;
let master = null;
let ambientGain = null;
let ambient = null;      // { src, filter, lfo } for the surf loop
let gullTimer = 0;
let enabled = true;

export function setEnabled(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? 0.9 : 0;
}
export function isEnabled() { return enabled; }

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    master.connect(ctx.destination);
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // brownish noise reads as water far better than white noise
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

/** Rolling surf: looped brown noise through a slowly-swept lowpass. */
export function startAmbience() {
  if (!ensureAudio() || ambient) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(6);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  filter.Q.value = 0.7;

  // Two LFOs at different rates so the surf never sounds metronomic.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.085;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  const swell = ctx.createOscillator();
  swell.frequency.value = 0.13;
  const swellGain = ctx.createGain();
  swellGain.gain.value = 0.16;
  const vol = ctx.createGain();
  vol.gain.value = 0.3;
  swell.connect(swellGain);
  swellGain.connect(vol.gain);

  src.connect(filter);
  filter.connect(vol);
  vol.connect(ambientGain);

  src.start();
  lfo.start();
  swell.start();
  ambientGain.gain.cancelScheduledValues(ctx.currentTime);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, ctx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2.2);
  ambient = { src, filter, lfo, swell, vol };
}

export function fadeAmbience(target, seconds) {
  if (!ctx || !ambientGain) return;
  ambientGain.gain.cancelScheduledValues(ctx.currentTime);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, ctx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(target, ctx.currentTime + seconds);
}

/** Called from the frame loop while beachcombing: an occasional distant gull. */
export function updateAmbience(dt) {
  if (!ctx || !ambient || !enabled) return;
  gullTimer -= dt;
  if (gullTimer <= 0) {
    gullTimer = 7 + Math.random() * 13;
    gull();
  }
}

function gull() {
  const t = ctx.currentTime;
  const base = 900 + Math.random() * 500;
  const calls = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < calls; i++) {
    const at = t + i * (0.22 + Math.random() * 0.1);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base * (1 + i * 0.06), at);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, at + 0.16);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.035, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(g); g.connect(master);
    osc.start(at); osc.stop(at + 0.22);
  }
}

function tone(freq, dur, type, vol, endFreq, delay) {
  if (!ensureAudio()) return;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function burst(dur, vol, freq, q, type, delay) {
  if (!ensureAudio()) return;
  const t = ctx.currentTime + (delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(Math.max(dur, 0.08));
  const filt = ctx.createBiquadFilter();
  filt.type = type || 'bandpass';
  filt.frequency.value = freq;
  filt.Q.value = q || 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// --- game SFX --------------------------------------------------------------

let lastRustle = 0;
/** Pebbles shifting under a swipe. Throttled — swipes fire many pointer events. */
export function rustle(strength) {
  const now = performance.now();
  if (now - lastRustle < 70) return;
  lastRustle = now;
  const s = Math.min(1, Math.max(0.15, strength));
  burst(0.09 + s * 0.09, 0.05 + s * 0.09, 1100 + s * 2200, 0.8);
  if (s > 0.55) burst(0.06, 0.035, 380, 1.4, 'bandpass', 0.03);
}

/** Collect chime — longer + sparklier the rarer the piece. */
export function collect(rarity) {
  const scales = {
    common: [523.25, 659.25],
    uncommon: [523.25, 659.25, 783.99],
    rare: [659.25, 830.61, 987.77, 1318.5],
  };
  const notes = scales[rarity] || scales.common;
  notes.forEach((f, i) => tone(f, 0.34, 'sine', 0.11, f * 1.002, i * 0.058));
  if (rarity === 'rare') {
    for (let i = 0; i < 5; i++) {
      tone(1600 + Math.random() * 1600, 0.16, 'triangle', 0.035, null, 0.2 + i * 0.05);
    }
  }
  burst(0.05, 0.03, 2600, 2);
}

export function ceramicFind() {
  tone(392, 0.5, 'triangle', 0.1, 392);
  tone(587.33, 0.5, 'triangle', 0.09, 587.33, 0.09);
  burst(0.14, 0.06, 900, 1.2);
}

export function pebbleClink(vol) {
  tone(300 + Math.random() * 700, 0.06, 'square', (vol || 0.03) * 0.5);
  burst(0.05, (vol || 0.03), 2200 + Math.random() * 1200, 2.4);
}

export function whoosh(up) {
  burst(0.42, 0.07, up ? 700 : 1600, 0.7, 'lowpass');
  tone(up ? 220 : 900, 0.4, 'sine', 0.05, up ? 900 : 220);
}

export function ping() {
  tone(1200, 0.5, 'sine', 0.09, 400);
  tone(1800, 0.35, 'sine', 0.04, 900, 0.06);
}

export function assembleChime() {
  [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => {
    tone(f, 0.75, 'triangle', 0.1, f, i * 0.13);
  });
  for (let i = 0; i < 10; i++) {
    tone(1400 + Math.random() * 2200, 0.22, 'sine', 0.028, null, 0.55 + i * 0.05);
  }
}

export function unlockFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(f, 0.55, 'triangle', 0.11, f, i * 0.1);
  });
}

export function uiTap() { tone(660, 0.07, 'sine', 0.05, 880); }

export function newSection() {
  burst(0.7, 0.11, 500, 0.6, 'lowpass');
  tone(180, 0.6, 'sine', 0.05, 90);
}
