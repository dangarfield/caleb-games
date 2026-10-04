// audio.js — Web Audio. World bus (hum, steps, train, door rattle) can fade; cues (intro, level pass/fail) play on top.
let ctx = null, master = null, sfx = null, mus = null, humSrc = null, musicLevel = 0.5, volume = 0.8;

// Per-sound level multipliers. 1 = the built-in level; set with sound-lab.html (saved in this browser).
export const SOUNDS = ['hum', 'footsteps', 'train', 'rattle', 'intro', 'pass', 'fail', 'birdsong', 'music'];
// defaults set in the Sound Lab (Oct 2026)
export const DEFAULTS = { hum: 1, footsteps: 0.6, train: 1, rattle: 1, intro: 0.25, pass: 0.45, fail: 0.4, birdsong: 1, music: 1 };
const LKEY = 'mindTheGap:soundLevels', L = { ...DEFAULTS };
try { Object.assign(L, JSON.parse(localStorage.getItem(LKEY) || '{}')); } catch (e) {}
let humGain = null, birdSrc = null, birdGain = null, daylight = false, stepK = 1;
const BIRD = 1.6;   // birdsong.mp3 is quieter than the hum (RMS 0.007 vs 0.012); this matches them at 100%
export const level = n => L[n] ?? DEFAULTS[n] ?? 1;
export const levels = () => ({ ...L });
export function setLevel(n, v, keep = true) {
  L[n] = v; if (keep) try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) {}
  if (n === 'hum' && humGain && !daylight) humGain.gain.setTargetAtTime(0.06 * v, ctx.currentTime, 0.05);
  if (n === 'birdsong' && birdGain) birdGain.gain.setTargetAtTime(BIRD * v, ctx.currentTime, 0.05);
}
export function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = musicLevel * 0.5; mus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  decodeSamples();
  return ctx;
}
// recordings: fetched up front, decoded once the audio context exists (first tap)
const RAW = {}, BUF = {};
const FILES = { footsteps: 'footsteps', train: 'train', birdsong: 'birdsong', intro: 'intro-transition', pass: 'level-pass', fail: 'level-fail' };
Object.entries(FILES).forEach(([n, f]) => { RAW[n] = fetch('audio/' + f + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); });
const BUFP = {};
let decoding = false;
function decodeSamples() {
  if (decoding) return; decoding = true;
  Object.keys(RAW).forEach(n => { BUFP[n] = RAW[n].then(ab => ab && ctx.decodeAudioData(ab)).then(b => (BUF[n] = b || null)).catch(() => null); });
}
// where the audible part of a recording ends (files can carry trailing silence: intro-transition is 5.06 s, sound ends at 2.59 s)
const END = new WeakMap();
function audibleEnd(b) {
  if (END.has(b)) return END.get(b);
  const d = b.getChannelData(0); let i = d.length - 1; while (i > 0 && Math.abs(d[i]) < 0.002) i--;
  const e = Math.min(b.duration, i / b.sampleRate + 0.02); END.set(b, e); return e;
}
// plays a recorded cue on top of everything; resolves to { dur } (audible length, s) or null if the file isn't there
export async function cue(name, vol = 1) {
  ensureAudio();
  const b = await Promise.race([BUFP[name], new Promise(r => setTimeout(() => r(null), 900))]);
  if (!b) return null;
  const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = vol * level(name); s.buffer = b; s.connect(g); g.connect(master); s.start();
  return { dur: audibleEnd(b) };
}
// fade the world sounds (hum, steps, train, rattle) to a level over secs
export function fadeWorld(to, secs) { ensureAudio(); const t = ctx.currentTime; sfx.gain.cancelScheduledValues(t); sfx.gain.setValueAtTime(sfx.gain.value, t); sfx.gain.linearRampToValueAtTime(to * 0.9, t + Math.max(0.01, secs)); }
// footsteps.mp3 (v2) holds 8 steps at a calm walking pace; these are their start times (measured)
const STEPS = [0.14, 0.64, 1.18, 1.66, 2.18, 2.76, 3.28, 3.82];
function slice(buf, from, dur, vol, fade = 0.02) {
  const c = ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + fade);
  g.gain.setValueAtTime(vol, t + Math.max(fade, dur - fade)); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(g); g.connect(sfx); s.start(t, from, dur);
}
export function setMusic(v) { musicLevel = v; if (mus) mus.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.05); }
// master volume for everything (sounds now, music later)
export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }

function tone(freq, dur, type = 'sine', vol = 0.1, endFreq, delay = 0, dest) {
  const c = ensureAudio(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.08, freq = 800, q = 1, type = 'bandpass', delay = 0) {
  const c = ensureAudio(), t = c.currentTime + delay, buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  s.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfx); s.start(t); s.stop(t + dur);
}

let lastStep = -1;
export const step = () => {
  if (!BUF.footsteps) return noise(0.07, 0.05, 1300, 1.2);
  let k; do { k = Math.floor(Math.random() * STEPS.length); } while (k === lastStep); lastStep = k;
  if (stepK > 0.01) slice(BUF.footsteps, Math.max(0, STEPS[k] - 0.03), 0.4, 0.6 * level('footsteps') * stepK, 0.01);
};
const chime = () => [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.5, 'sine', 0.12 * level('pass'), null, i * 0.12));
const oops = () => [440, 330, 262].forEach((f, i) => tone(f, 0.35, 'sine', 0.13 * level('fail'), f * 0.9, i * 0.16));
// level pass / fail: the recordings if they're there, otherwise the generated tones. fail resolves to its length (s)
export const pass = async () => { if (!(await cue('pass'))) chime(); };
export const fail = async () => { const r = await cue('fail'); if (!r) { oops(); return 0.7; } return r.dur; };
export const rattle = () => noise(0.05, 0.12 * level('rattle'), 400, 2);
// the train recording trimmed to the part with the train in it (4.0 s to 16.5 s of the file), faded, and kept quiet
export const rumble = () => { if (!BUF.train) return noise(4, 0.12 * level('train'), 110, 0.7, 'lowpass'); slice(BUF.train, 4.0, 12.5, 0.22 * level('train'), 1.5); };

export function startAmbience() {
  const c = ensureAudio();
  if (!humSrc) {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    humSrc = c.createBufferSource(); humSrc.buffer = buf; humSrc.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; const g = c.createGain(); g.gain.value = 0.06 * level('hum'); humGain = g;
    humSrc.connect(f); f.connect(g); g.connect(sfx); humSrc.start();
  }
}
export function stopAmbience() { if (humSrc) { humSrc.stop(); humSrc = null; humGain = null; } }
// footsteps fade out as the way out goes white (1 = normal, 0 = silent)
export const setStepFade = k => { stepK = k; };
const ramp = (p, to, secs) => { const t = ctx.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(to, t + Math.max(0.01, secs)); };
// birdsong loop on its own (the Sound Lab uses this)
export function birds(on, secs = 2) {
  ensureAudio();
  if (on && !birdSrc && BUF.birdsong) {
    birdSrc = ctx.createBufferSource(); birdSrc.buffer = BUF.birdsong; birdSrc.loop = true;
    birdGain = ctx.createGain(); birdGain.gain.value = 0; birdSrc.connect(birdGain); birdGain.connect(sfx); birdSrc.start();
  }
  if (!birdGain) return;
  ramp(birdGain.gain, on ? BIRD * level('birdsong') : 0, secs);
  if (!on) { birdSrc.stop(ctx.currentTime + secs + 0.05); birdSrc = null; birdGain = null; }
}
// the way out: crossfade the tunnel hum into birdsong (and back again for a new run)
export function toDaylight(on, secs = 2) {
  ensureAudio(); daylight = on; birds(on, secs);
  if (humGain) ramp(humGain.gain, on ? 0 : 0.06 * level('hum'), secs);
}
export function suspendAll(on) { if (ctx) on ? ctx.suspend() : ctx.resume(); }
