/* audio.js — generated Web Audio SFX (knowledge/audio-patterns.md). Always on: no mute.
 * The context is created and resumed from the first gesture. */

let ctx = null, master = null;
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
['pointerup', 'touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, ensureAudio, { capture: true, passive: true }));

function tone(freq, dur, type = 'sine', vol = 0.12, end = null, delay = 0) {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (end) o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.1, f = 800, q = 1, type = 'bandpass', delay = 0, fEnd = null) {
  const c = ensureAudio(); if (!c) return;
  const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(fl); fl.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
}

export const sfx = {
  tap() { tone(660, 0.06, 'triangle', 0.05); },
  putt(p = 0.5) { noise(0.05, 0.18 + p * 0.1, 2400, 2); tone(900 - p * 250, 0.07, 'triangle', 0.1); },
  wall(v = 3) { const k = Math.min(1, v / 8); noise(0.04, 0.05 + k * 0.1, 1500, 3); tone(330, 0.05, 'square', 0.02 + k * 0.03); },
  bumper() { tone(220, 0.25, 'sine', 0.16, 880); tone(440, 0.18, 'triangle', 0.06, 1200, 0.02); },
  splash() { noise(0.5, 0.2, 1200, 0.8, 'lowpass', 0, 250); tone(500, 0.2, 'sine', 0.08, 120); },
  sizzle() { noise(0.6, 0.14, 4000, 1, 'highpass'); tone(300, 0.3, 'sawtooth', 0.04, 90); },
  gloop() { tone(180, 0.35, 'sine', 0.14, 70); tone(260, 0.2, 'triangle', 0.05, 110, 0.12); },
  sinkSand() { noise(0.9, 0.12, 500, 0.7, 'lowpass', 0, 120); tone(220, 0.7, 'sine', 0.06, 60); },
  bonk() { tone(140, 0.18, 'square', 0.08, 70); noise(0.12, 0.1, 300, 1, 'lowpass'); },
  whack() { noise(0.12, 0.14, 1800, 1.2); tone(520, 0.12, 'triangle', 0.06, 260); },
  fall() { tone(600, 0.55, 'sine', 0.12, 90); },
  portal() { tone(300, 0.35, 'sine', 0.1, 1400); tone(450, 0.35, 'triangle', 0.05, 1800, 0.05); },
  portalOut() { tone(1400, 0.2, 'sine', 0.07, 500); },
  idol() { noise(0.5, 0.12, 180, 1, 'lowpass'); tone(90, 0.5, 'sine', 0.12, 60); },
  cannonIn() { tone(400, 0.12, 'triangle', 0.08, 200); },
  boom() { noise(0.7, 0.35, 400, 0.7, 'lowpass', 0, 60); tone(120, 0.5, 'sine', 0.25, 40); },
  land() { noise(0.12, 0.12, 600, 1); tone(200, 0.1, 'sine', 0.08, 120); },
  loop() { tone(300, 0.7, 'triangle', 0.07, 900); noise(0.7, 0.04, 2000, 2); },
  loopFail() { tone(500, 0.5, 'triangle', 0.07, 200); },
  vine() { noise(0.25, 0.1, 1800, 1.5, 'bandpass', 0, 600); },
  spook() { tone(700, 0.45, 'sine', 0.07, 350); tone(705, 0.45, 'sine', 0.05, 340, 0.02); },
  ghostPass() { tone(900, 0.3, 'sine', 0.06, 1500); },
  gem() { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.18, 'sine', 0.08, null, i * 0.06)); },
  lip() { noise(0.08, 0.1, 900, 2); tone(700, 0.1, 'square', 0.03); },
  sink() { tone(520, 0.15, 'sine', 0.14, 260); noise(0.18, 0.08, 1300, 2, 'bandpass', 0.08); tone(784, 0.12, 'triangle', 0.08, null, 0.25); },
  star(i = 0) { tone(880 * Math.pow(1.26, i), 0.22, 'triangle', 0.09); },
  good() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.09, null, i * 0.09)); },
  meh() { [523, 494, 440].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, null, i * 0.12)); },
  fanfare() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.05, null, i * 0.1));
    [523, 659, 784, 1047].forEach(f => tone(f, 1.2, 'triangle', 0.07, null, 0.55));
    for (let i = 0; i < 6; i++) tone(1568 + i * 120, 0.12, 'sine', 0.05, null, 0.6 + i * 0.08);
  },
  pop() { tone(500, 0.08, 'sine', 0.08, 900); },
  nope() { tone(220, 0.15, 'square', 0.05, 170); },
  buy() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, null, i * 0.05)); },
};
