// audio.js — generated WebAudio SFX and sea ambience, plus Dan's two music themes (normal / battle).
// audio.play(name) fires a caption (via ui.caption) when captions are on.

let ctx = null, master = null, sfxBus = null, noiseBuf = null;
let vol = { music: 0.35, sfx: 1 };
let captionFn = null;
let wantSea = false, sea = null;
const CAPTIONS = {
  cannon: 'Cannon fire', splash: 'Splash', clash: 'Swords clash', coins: 'Coins jingle', bell: "Ship's bell rings",
  thud: 'Cannonball hits wood', cheer: 'The crew cheers', dig: 'Digging in the sand', fanfare: 'Trumpets play', creak: 'Timbers creak',
};

export function init({ settings, caption } = {}) {
  captionFn = caption || null;
  if (settings) setVolumes(settings);
  // unlock on the gestures that grant activation; stay armed until the context is running
  const EV = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  const arm = () => EV.forEach(e => document.addEventListener(e, unlock, true));
  const disarm = () => EV.forEach(e => document.removeEventListener(e, unlock, true));
  function unlock() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'running') { apply(); if (playing) disarm(); return; }
    ctx.resume().then(() => { if (ctx.state === 'running') { apply(); if (playing) disarm(); } }, () => {});
  }
  arm();
  document.addEventListener('visibilitychange', () => {
    const a = trackEl(current);
    if (document.hidden) { if (ctx) ctx.suspend().catch(() => {}); if (playing && a) a.pause(); }
    else { if (ctx) ctx.resume().catch(() => {}); if (playing && a) a.play().catch(() => {}); }
  });
}
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  setVolumes(null);
  return ctx;
}
const running = () => ctx && ctx.state === 'running';
function apply() { startMusic(); if (wantSea) startSea(); }

/** settings {music, sfx} 0..100 */
export function setVolumes(s) {
  if (s) vol = { music: (s.music ?? 35) / 100, sfx: (s.sfx ?? 100) / 100 };
  musicVolume();
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.05);
}

// ---------- primitives ----------
function tone(freq, dur, { type = 'sine', vol = 0.2, end, at = 0, bus = sfxBus, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (end) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, freq = 800, q = 1, type = 'bandpass', at = 0, end, bus = sfxBus, attack = 0.005 } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); if (end) f.frequency.exponentialRampToValueAtTime(end, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}

const SFX = {
  cannon() { noise(0.9, { vol: 0.7, freq: 700, end: 90, type: 'lowpass', q: 0.7 }); tone(110, 0.5, { type: 'sine', vol: 0.5, end: 38 }); },
  splash() { noise(0.7, { vol: 0.35, freq: 1800, end: 400, q: 0.6, attack: 0.03 }); },
  clash() { tone(1850, 0.25, { type: 'square', vol: 0.06, end: 1500 }); tone(2630, 0.3, { type: 'triangle', vol: 0.12 }); noise(0.08, { vol: 0.25, freq: 5000, q: 2 }); },
  coins() { [0, 0.06, 0.13, 0.19].forEach((a, i) => tone([2093, 2637, 2349, 3136][i], 0.18, { type: 'triangle', vol: 0.12, at: a })); },
  bell() { tone(880, 1.6, { vol: 0.2 }); tone(2210, 0.9, { vol: 0.06 }); tone(1320, 1.2, { vol: 0.07, at: 0.01 }); },
  click() { tone(900, 0.05, { type: 'triangle', vol: 0.06, end: 600 }); },
  thud() { noise(0.25, { vol: 0.5, freq: 300, type: 'lowpass' }); tone(140, 0.2, { vol: 0.3, end: 60 }); },
  cheer() { noise(1.1, { vol: 0.18, freq: 900, q: 0.8, attack: 0.15 }); [392, 494, 587].forEach((f, i) => tone(f, 0.9, { type: 'sawtooth', vol: 0.025, at: 0.05 * i, attack: 0.1 })); },
  dig() { noise(0.18, { vol: 0.3, freq: 1200, q: 0.5 }); noise(0.12, { vol: 0.2, freq: 500, at: 0.12 }); },
  fanfare() { [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5]].forEach(([f, a]) => tone(f, a === 0.5 ? 0.9 : 0.2, { type: 'square', vol: 0.07, at: a })); },
  creak() { tone(180, 0.5, { type: 'sawtooth', vol: 0.03, end: 140, attack: 0.1 }); },
};
export const SOUNDS = Object.keys(SFX);
/** Play a sound effect by name; shows its caption. opts.caption overrides (false = none). */
export function play(name, opts = {}) {
  const cap = opts.caption === undefined ? CAPTIONS[name] : opts.caption;
  if (cap && captionFn) captionFn(cap);
  if (!running() || !SFX[name] || vol.sfx <= 0) return;
  try { SFX[name](); } catch (e) {}
}
/** Caption-only line for speech. */
export const say = text => { if (captionFn) captionFn(text); };

// ---------- sea ambience (looped filtered noise with slow swells) ----------
export function ambience(on) { wantSea = !!on; if (on) { if (running()) startSea(); } else stopSea(); }
function startSea() {
  if (sea || !running()) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.2);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.05; lfo.connect(lg); lg.connect(g.gain);
  const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 220; lfo2.connect(lg2); lg2.connect(f.frequency);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(); lfo.start(); lfo2.start();
  sea = { s, g, lfo, lfo2 };
}
function stopSea() {
  if (!sea) return; const x = sea; sea = null;
  x.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => { try { x.s.stop(); x.lfo.stop(); x.lfo2.stop(); } catch (e) {} }, 1500);
}

// ---------- music: two themes from Dan, cross-faded (house format: knowledge/audio-patterns.md) ----------
// <audio id="music-normal|music-battle"> in index.html, Opus/WebM at the source level (no -6dB), loop, preload="none".
// theme('normal'|'battle') is called by main.js on every mode change. Deliberate departures from the house
// rule (as in fleet-forge): two tunes that cross-fade, and the Music volume slider in Settings scales them.
const TRACKS = { normal: null, battle: null };
const LEVEL = 1, FADE_MS = 1000;         // full level: the files are encoded at their own level (Dan: music was far too quiet under the SFX)
let current = 'normal', playing = false, fadeTimer = 0, wanted = null, queued = false;
const trackEl = n => TRACKS[n] || (TRACKS[n] = document.getElementById('music-' + n));
const level = () => LEVEL * vol.music;
function fadeTo(name) {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
  const t0 = Date.now();
  for (const n in TRACKS) { const a = trackEl(n); if (a) a.__from = a.volume; }
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / FADE_MS);
    for (const n in TRACKS) {
      const a = trackEl(n); if (!a) continue;
      const want = n === name ? level() : 0;
      a.volume = Math.max(0, Math.min(1, a.__from + (want - a.__from) * k));
      if (k >= 1 && n !== name && !a.paused) { a.pause(); a.currentTime = 0; } // a finished fade isn't two decoders
    }
    if (k >= 1) { clearInterval(fadeTimer); fadeTimer = 0; }
  }, 40);
}
/** Ask for a theme. Asking for the one already playing does nothing; the last ask in a tick wins
 *  (leaving a battle for the outcome screen and back can ask twice in one go). */
export function theme(name) {
  wanted = TRACKS.hasOwnProperty(name) ? name : 'normal';
  if (queued) return;
  queued = true;
  Promise.resolve().then(() => {
    queued = false;
    if (wanted === current) return;
    current = wanted;
    if (!playing) return;               // not started yet: startMusic() honours `current`
    const a = trackEl(current); if (!a) return;
    if (a.paused) a.volume = 0;         // starts silent, then fades up (its default volume is 1)
    a.play().catch(() => {});
    fadeTo(current);
  });
}
/** Back-compat: music(name) → theme; music(null) is ignored (the normal theme plays over the whole game). */
export function music(name) { if (name) theme(name === 'battle' ? 'battle' : 'normal'); }
function startMusic() {
  if (playing) return;
  const a = trackEl(current); if (!a) return;
  a.volume = level();
  let p; try { p = a.play(); } catch (e) { return; }  // no a.load(): it aborts the play
  if (p && p.then) p.then(() => { playing = true; }, () => {}); else playing = true;
}
function musicVolume() { if (fadeTimer) return; const a = trackEl(current); if (a && playing) a.volume = level(); }
