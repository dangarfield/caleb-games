// Web Audio only — no files. Lake ambience (water + birds + breeze) plus the
// throw / skip / plunk / celebrate SFX.

let ctx = null;
let master = null;
let ambientGain = null;
let started = false;
let birdTimer = 0;
let humOsc = null, humGain = null;

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// There is no mute switch: the lake is always on. (The rail button that used to
// live here is now 🗺️ Map — a silent game is a broken-looking game to a child,
// and the device's own volume keys already do this job.)

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.035 * w) / 1.035;       // pink-ish
    d[i] = last * 3.2;
  }
  return buf;
}

/** Lapping water + a breeze bed. Call once from a user gesture. */
export function startAmbience() {
  if (!ensureAudio() || started) return;
  started = true;

  const buf = noiseBuffer(5);

  // water: band-passed noise with a slow swell
  const water = ctx.createBufferSource();
  water.buffer = buf; water.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass'; wf.frequency.value = 620; wf.Q.value = 0.7;
  const wg = ctx.createGain(); wg.gain.value = 0.28;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.16;
  lfo.connect(lfoG); lfoG.connect(wg.gain);
  water.connect(wf); wf.connect(wg); wg.connect(ambientGain);
  water.start(); lfo.start();

  // breeze: low-passed noise
  const wind = ctx.createBufferSource();
  wind.buffer = buf; wind.loop = true; wind.playbackRate.value = 0.6;
  const nf = ctx.createBiquadFilter();
  nf.type = 'lowpass'; nf.frequency.value = 300;
  const ng = ctx.createGain(); ng.gain.value = 0.2;
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
  const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.13;
  lfo2.connect(lfo2G); lfo2G.connect(ng.gain);
  wind.connect(nf); nf.connect(ng); ng.connect(ambientGain);
  wind.start(); lfo2.start();

  ambientGain.gain.setValueAtTime(0, ctx.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
}

function tone(freq, dur, type, vol, endFreq, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, freq, q, type = 'bandpass', delay = 0, sweepTo = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// --- game sounds -------------------------------------------------------------
export const sfx = {
  select() { tone(880, 0.09, 'sine', 0.14); tone(1320, 0.1, 'sine', 0.08, 0, 0.05); },
  pickup() { tone(523, 0.08, 'triangle', 0.13); tone(784, 0.12, 'triangle', 0.1, 0, 0.06); },
  ui() { tone(660, 0.06, 'square', 0.05); },
  step() { noise(0.13, 0.09, 300, 1.2, 'lowpass'); },

  windUpStart() {
    if (!ensureAudio()) return;
    stopHum();
    humOsc = ctx.createOscillator();
    humGain = ctx.createGain();
    humOsc.type = 'sawtooth';
    humOsc.frequency.setValueAtTime(52, ctx.currentTime);
    humOsc.frequency.linearRampToValueAtTime(105, ctx.currentTime + 2.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    humGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    humGain.gain.linearRampToValueAtTime(0.075, ctx.currentTime + 0.25);
    humOsc.connect(f); f.connect(humGain); humGain.connect(master);
    humOsc.start();
  },
  powerLock(power) {
    tone(300 + power * 500, 0.07, 'square', 0.09);
    noise(0.06, 0.06, 1400, 2);
  },
  release(power) {
    stopHum();
    noise(0.22, 0.16 + power * 0.1, 500, 0.8, 'bandpass', 0, 3200);
    tone(180, 0.14, 'triangle', 0.07, 90);
  },
  skip(n, strength) {
    const p = Math.min(n, 22);
    const f = 520 + p * 78;
    tone(f, 0.055 + 0.02 * strength, 'sine', 0.055 + 0.09 * strength, f * 0.45);
    noise(0.05, 0.05 + 0.06 * strength, 1500 + p * 120, 1.6);
  },
  plunk() {
    tone(230, 0.26, 'sine', 0.15, 62);
    noise(0.3, 0.1, 700, 0.7, 'lowpass', 0, 180);
  },
  land() {
    noise(0.18, 0.13, 420, 1.0, 'lowpass');
    tone(150, 0.1, 'triangle', 0.06, 90);
  },
  buoy() {
    tone(880, 0.3, 'square', 0.07, 700);
    tone(1245, 0.34, 'square', 0.05, 980);
    noise(0.09, 0.08, 2600, 3);
  },
  gate() { tone(700, 0.09, 'triangle', 0.09); tone(1050, 0.1, 'triangle', 0.07, 0, 0.07); },
  /** A special stone washing up on the beach: a small glittery arrival. */
  sparkle() {
    [1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.075, 0, i * 0.06));
    noise(0.4, 0.04, 5200, 2.6, 'bandpass', 0.06);
  },
  record() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 0, i * 0.08));
  },
  fail() { tone(200, 0.2, 'sine', 0.08, 120); },

  // --- phase 2 --------------------------------------------------------------
  /** Coins: one per point band, so a big pay-out sounds bigger. */
  points(n) {
    const k = Math.min(4, 1 + Math.floor(n / 25));
    for (let i = 0; i < k; i++) tone(1180 + i * 210, 0.1, 'triangle', 0.055, 0, i * 0.055);
  },
  buy() {
    [523, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.07));
    noise(0.3, 0.05, 3600, 2.4, 'bandpass', 0.08);
  },
  deny() { tone(320, 0.12, 'square', 0.07, 180); tone(240, 0.16, 'square', 0.05, 140, 0.09); },
  achievement() {
    [659, 880, 1047, 1319, 1760].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 0, i * 0.07));
    noise(0.6, 0.045, 5000, 2.5, 'bandpass', 0.12);
  },
  /** Dead-centre release: a bright little ping so timing feels tactile. */
  perfect() { tone(1568, 0.12, 'sine', 0.09); tone(2093, 0.14, 'sine', 0.06, 0, 0.05); },
  /** Fish leap + gulp. */
  splashBig() {
    noise(0.42, 0.17, 900, 0.7, 'lowpass', 0, 220);
    tone(190, 0.3, 'sine', 0.11, 70);
  },
  gulp() {
    tone(420, 0.14, 'sine', 0.12, 130);
    tone(230, 0.2, 'triangle', 0.09, 90, 0.08);
    noise(0.16, 0.09, 700, 1.4, 'lowpass', 0.02);
  },
  /** Bouncing off a wooden mooring post. */
  wood() {
    tone(430, 0.12, 'triangle', 0.12, 250);
    noise(0.09, 0.09, 1100, 2.2, 'bandpass');
  },
  /** Landing softly on lily pads. */
  leaf() { noise(0.22, 0.1, 2400, 1.2, 'bandpass'); tone(600, 0.09, 'sine', 0.05, 380); },
  bird() {
    if (!ctx) return;
    const base = 1700 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + Math.random() * 0.4);
      tone(f, 0.07 + Math.random() * 0.05, 'sine', 0.028, f * (1.3 + Math.random() * 0.5), i * (0.07 + Math.random() * 0.08));
    }
  },
};

function stopHum() {
  if (humOsc) {
    try {
      humGain.gain.cancelScheduledValues(ctx.currentTime);
      humGain.gain.setValueAtTime(humGain.gain.value, ctx.currentTime);
      humGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      humOsc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* ignore */ }
    humOsc = null; humGain = null;
  }
}
export { stopHum };

/** Called every frame — schedules occasional bird calls. */
export function updateAudio(dt) {
  if (!started) return;
  birdTimer -= dt;
  if (birdTimer <= 0) {
    birdTimer = 3.5 + Math.random() * 7;
    sfx.bird();
  }
}
