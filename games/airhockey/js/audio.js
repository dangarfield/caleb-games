/* Air Hockey World Cup — audio.js
 *
 * Web Audio SFX, generated at runtime. No assets, no network.
 * Context is created lazily on the first user gesture (Play button).
 *
 *   sfx.init()      -> create/resume context (safe to call repeatedly)
 *   sfx.play(name)  -> no-op until init() has run
 *   sfx.mute(bool)
 *
 * Names: hit, wall, goal, whistle, win, lose, move, charge, ui
 */

let actx = null;
let master = null;
let muted = false;
let voices = 0;
const MAX_VOICES = 16;

function ensure() {
  if (!actx) return null;
  if (actx.state === 'suspended' && actx.resume) actx.resume();
  return actx;
}

function tone(freq, dur, type, vol, endFreq) {
  const ctx = ensure();
  if (!ctx || muted || voices >= MAX_VOICES) return;
  voices++;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
  osc.onended = () => { voices--; };
}

function noise(dur, vol, freq, q) {
  const ctx = ensure();
  if (!ctx || muted || voices >= MAX_VOICES) return;
  voices++;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = freq || 900; filt.Q.value = q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
  src.stop(ctx.currentTime + dur);
  src.onended = () => { voices--; };
}

const RECIPES = {
  hit:     () => { tone(420, 0.06, 'square', 0.14, 220); noise(0.05, 0.06, 1400, 2); },
  wall:    () => { tone(180, 0.05, 'sine', 0.10, 120); },
  goal:    () => { tone(523, 0.12, 'triangle', 0.16); setTimeout(() => tone(659, 0.12, 'triangle', 0.16), 90); setTimeout(() => tone(784, 0.2, 'triangle', 0.16), 180); noise(0.4, 0.05, 600, 0.7); },
  whistle: () => { tone(2100, 0.18, 'sine', 0.10, 2500); },
  win:     () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.16), i * 130)); },
  lose:    () => { [400, 320, 250, 180].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.13), i * 140)); },
  move:    () => { tone(660, 0.14, 'sawtooth', 0.12, 1200); noise(0.12, 0.05, 1600, 1.5); },
  charge:  () => { tone(300, 0.25, 'sawtooth', 0.08, 700); },
  ui:      () => { tone(600, 0.05, 'sine', 0.10); },
};

export const sfx = {
  init() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.9;
        master.connect(actx.destination);
      } catch (e) { actx = null; }
    }
    ensure();
  },
  play(name) { const r = RECIPES[name]; if (r) r(); },
  mute(v) { muted = !!v; },
  isMuted() { return muted; },
};
