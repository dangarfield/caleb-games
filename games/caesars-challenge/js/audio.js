/* Caesar's Challenge — audio.js  (LANE D)
 *
 * Web Audio SFX, generated at runtime. No assets, no network.
 *
 * The AudioContext is created LAZILY inside init(), and init() is only ever
 * called from a real user gesture (the Play button / first pointerdown).
 * Creating it earlier trips the browser autoplay policy and leaves a
 * permanently suspended context.
 *
 *   sfx.init()        -> create/resume the context (safe to call repeatedly)
 *   sfx.play(name)    -> no-op until init() has run
 *   sfx.mute(bool)
 *
 * Names: tap, correct, wrong, star, level, fail, boss, coin
 */

let actx = null;
let master = null;
let muted = false;
let noiseBuf = null;      // one shared 1s white-noise buffer, built once

/* Voice budget: a 7-year-old mashes buttons. Cap simultaneous voices so a
 * low-powered tablet never chokes on oscillator churn. */
let voices = 0;
const MAX_VOICES = 14;

function ensure() {
  if (!actx) return null;
  if (actx.state === 'suspended' && actx.resume) actx.resume();
  return actx;
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const n = Math.floor(actx.sampleRate * 1.0);
  noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function track(node, stopAt) {
  voices++;
  const done = () => { voices = Math.max(0, voices - 1); };
  node.onended = done;
  // belt-and-braces: some engines are shy about onended
  setTimeout(done, Math.max(30, (stopAt - actx.currentTime) * 1000 + 120));
}

/** simple oscillator blip, optional glide to endFreq */
function tone(freq, dur, type, vol, endFreq, delay, detune) {
  const c = ensure();
  if (!c || muted || voices >= MAX_VOICES) return;
  const t0 = c.currentTime + (delay || 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol == null ? 0.12 : vol), t0 + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  track(o, t0 + dur);
}

/** filtered white-noise burst */
function burst(dur, vol, type, f0, f1, q, delay) {
  const c = ensure();
  if (!c || muted || voices >= MAX_VOICES) return;
  const t0 = c.currentTime + (delay || 0);
  const src = c.createBufferSource();
  src.buffer = noise();
  src.playbackRate.value = 1;
  const f = c.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  f.Q.value = q == null ? 1 : q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol == null ? 0.08 : vol), t0 + Math.min(0.03, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.4, dur + 0.05);
  src.stop(t0 + dur + 0.05);
  track(src, t0 + dur);
}

const RECIPES = {
  /* chisel tick — a hammer tap on stone: tight bright noise + a woody knock */
  tap() {
    burst(0.045, 0.09, 'highpass', 2600, 1500, 0.7);
    tone(320, 0.055, 'square', 0.045, 190);
  },
  /* rising chime — two triangle notes, E5 -> A5 */
  correct() {
    tone(659.25, 0.13, 'triangle', 0.12);
    tone(880.0, 0.22, 'triangle', 0.11, null, 0.085);
    tone(1318.5, 0.16, 'sine', 0.045, null, 0.085);
  },
  /* dull thud — chisel slips */
  wrong() {
    tone(190, 0.20, 'sine', 0.15, 88);
    burst(0.13, 0.07, 'lowpass', 480, 180, 0.9);
  },
  /* star ding */
  star() {
    tone(1567.98, 0.30, 'sine', 0.10, null, 0, 4);
    tone(2349.32, 0.18, 'sine', 0.035, null, 0.01);
  },
  /* level fanfare — ascending arpeggio C5 E5 G5 C6 */
  level() {
    const n = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < n.length; i++) {
      tone(n[i], i === 3 ? 0.42 : 0.16, 'triangle', 0.11, null, i * 0.09);
    }
    tone(261.63, 0.5, 'sine', 0.06, null, 0.27);
  },
  /* sad horn — the Senate is not impressed */
  fail() {
    tone(233.08, 0.5, 'sawtooth', 0.075, 174.61);
    tone(116.54, 0.55, 'sine', 0.07, 92);
    burst(0.35, 0.03, 'lowpass', 700, 240, 0.8, 0.05);
  },
  /* crowd roar — broad noise swell for the Colosseum */
  boss() {
    burst(0.85, 0.11, 'bandpass', 320, 900, 0.55);
    burst(0.7, 0.06, 'highpass', 1800, 2600, 0.4, 0.08);
    tone(87.31, 0.6, 'sine', 0.05, 65);
  },
  /* coin clink — denarii */
  coin() {
    tone(1244.5, 0.09, 'square', 0.05);
    tone(1864.7, 0.13, 'square', 0.035, null, 0.045);
    burst(0.06, 0.03, 'highpass', 3800, 3000, 0.6);
  }
};

export const sfx = {
  /** MUST be called from a user gesture. Idempotent. */
  init() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        actx = new AC();
      } catch (e) {
        console.warn("Caesar's Challenge: Web Audio unavailable —", e && e.message);
        actx = null;
        return false;
      }
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(actx.destination);
    }
    ensure();
    return true;
  },
  play(name) {
    if (!actx || muted) return;
    const r = RECIPES[name];
    if (!r) return;
    try {
      ensure();
      r();
    } catch (e) {
      /* never let a sound take the game down */
    }
  },
  mute(b) {
    muted = !!b;
    if (master) master.gain.value = muted ? 0 : 0.9;
    return muted;
  },
  isMuted() { return muted; },
  ready() { return !!actx; }
};
