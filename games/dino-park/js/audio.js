/* audio.js — generated Web Audio SFX (knowledge/audio-patterns.md). Always on: no mute.
 * The context is created and resumed from the first gesture. Kept soft and short so the
 * park doesn't turn into a slot machine: ticket coins are silent, stall coins a tiny chime. */

let ctx = null, master = null;
export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
['pointerup', 'touchend', 'click', 'keydown'].forEach(e => document.addEventListener(e, ensureAudio, { capture: true, passive: true }));

function tone(freq, dur, type = 'sine', vol = 0.12, end = null, delay = 0) {
  const c = ensureAudio(); if (!c || c.state !== 'running') return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (end) o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.1, f = 800, q = 1, type = 'bandpass', delay = 0, fEnd = null) {
  const c = ensureAudio(); if (!c || c.state !== 'running') return;
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
  select() { tone(520, 0.07, 'triangle', 0.07, 780); },
  nope() { tone(220, 0.12, 'square', 0.04, 170); tone(200, 0.12, 'square', 0.03, 150, 0.1); },
  whoosh(i = 0) { noise(0.22, 0.05, 900 + i * 150, 1.2, 'bandpass', 0, 2600); tone(440 + i * 60, 0.12, 'sine', 0.04, 700 + i * 60); },
  build() { noise(0.16, 0.14, 380, 0.9, 'lowpass'); tone(170, 0.18, 'sine', 0.14, 90); tone(660, 0.1, 'triangle', 0.06, 990, 0.12); },
  path() { tone(740, 0.05, 'triangle', 0.025); },
  coin() { tone(1319, 0.08, 'sine', 0.035); tone(1760, 0.1, 'sine', 0.03, null, 0.05); },
  munch() { for (let i = 0; i < 3; i++) noise(0.07, 0.1, 700, 1.5, 'bandpass', i * 0.13); tone(880, 0.1, 'triangle', 0.05, 1175, 0.4); },
  boing() { tone(260, 0.3, 'sine', 0.12, 620); tone(330, 0.25, 'triangle', 0.04, 780, 0.25); },
  bin() { noise(0.12, 0.1, 2200, 2); tone(390, 0.12, 'square', 0.03, 260); },
  pet() { tone(700, 0.08, 'sine', 0.08, 1100); tone(1000, 0.1, 'sine', 0.06, 1400, 0.08); },
  siren() { for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 820, 0.2, 'triangle', 0.06, null, i * 0.2); },
  net() { noise(0.35, 0.09, 600, 0.9, 'bandpass', 0, 2400); },
  netHit(left = 1) { noise(0.12, 0.13, 500, 1, 'lowpass'); tone(300 + left * 60, 0.14, 'triangle', 0.08, 180); },
  caught() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, null, i * 0.08)); noise(0.3, 0.06, 3000, 1, 'highpass', 0.3); },
  eggDrop() { tone(900, 0.5, 'sine', 0.05, 300); },
  eggLand() { noise(0.1, 0.12, 300, 1, 'lowpass'); tone(140, 0.12, 'sine', 0.1, 90); },
  crack() { for (let i = 0; i < 3; i++) noise(0.04, 0.12, 3200, 3, 'bandpass', i * 0.09); },
  hatch() { tone(500, 0.1, 'sine', 0.1, 1000); [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, null, 0.12 + i * 0.07)); },
  star(i = 0) { tone(880 * Math.pow(1.26, i), 0.24, 'triangle', 0.09); tone(1760 * Math.pow(1.26, i), 0.16, 'sine', 0.04, null, 0.05); },
  best() { [659, 880, 1109, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.035, null, i * 0.06)); },
  roar() { noise(1.1, 0.22, 260, 0.8, 'lowpass', 0, 120); tone(110, 1.0, 'sawtooth', 0.07, 70); tone(160, 0.8, 'sawtooth', 0.04, 90, 0.05); },
  buy() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, null, i * 0.05)); },
  firework() { tone(400, 0.3, 'sine', 0.04, 1400); noise(0.5, 0.12, 900, 0.7, 'lowpass', 0.28, 200); noise(0.4, 0.05, 5000, 1, 'highpass', 0.34); },
};

/* one place that turns the park's events into sounds */
export function worldSfx(d) {
  switch (d.type) {
    case 'placed': sfx.build(); break;
    case 'coins': if (!d.ticket && d.amount >= 8) sfx.coin(); break;
    case 'fixed': d.kind === 'food' ? sfx.munch() : d.kind === 'fun' ? sfx.boing() : sfx.bin(); break;
    case 'pet': sfx.pet(); break;
    case 'escaped': sfx.siren(); break;
    case 'net': sfx.net(); break;
    case 'net-hit': sfx.netHit(d.left); break;
    case 'caught': sfx.caught(); break;
    case 'hatch-start': sfx.eggDrop(); break;
    case 'egg-land': sfx.eggLand(); break;
    case 'hatch-crack': sfx.crack(); break;
    case 'hatched': sfx.hatch(); break;
    case 'nospace': sfx.nope(); break;
    case 'firework': sfx.firework(); break;
  }
}
