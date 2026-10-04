// Ember Bay sound: recorded samples (audio/sfx/*.mp3, decoded once on the first tap) for the engine, siren,
// horn, water, fire, waypoints and achievements; small generated tones for UI blips. One master gain = the
// Sound slider. Every sample falls back to the old generated sound if it hasn't loaded.
let ctx = null, master = null, musicBus = null, sirenNode = null, vol = 0.2, mus = 0.8;
function ac() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = vol * SFX_LEVEL; master.connect(ctx.destination); musicBus = ctx.createGain(); musicBus.gain.value = mus; musicBus.connect(ctx.destination); setTimeout(loadSamples); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Hidden tab: suspend everything (siren included); back in front: resume.
document.addEventListener('visibilitychange', () => { if (ctx) (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {}); });
// All sound effects sit at half their original level under the music (Dan, Oct 2026); the Sound slider scales from there.
const SFX_LEVEL = 0.5;
export function setVolume(v) { vol = v; if (master) master.gain.value = v * SFX_LEVEL; }
// Settings has two sliders: Sound (SFX + siren, the master gain) and Music (the theme tune's own bus).
export function setMusicVolume(v) { mus = v; if (musicBus) musicBus.gain.value = v; }
export const audioCtx = () => ac();
export const musicOut = () => (ac(), musicBus);
function tone(f, dur, { type = 'square', v = 0.2, t = 0, f2 } = {}) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur, { v = 0.25, t = 0, lp = 1200 } = {}) {
  const c = ac(), n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = v;
  s.connect(f).connect(g).connect(master); s.start(c.currentTime + t);
}
// ---- samples ----
const FILES = { siren: 'siren', horn: 'horn', engine: 'engine', water: 'water', fire: 'fire', reached: 'waypoint-reached', started: 'waypoint-started', achievement: 'achievement',
  bump: 'bump', reverse: 'reverse', steam: 'steam', meow: 'meow', chick: 'chick', oink: 'oink', boing: 'boing', rotors: 'rotors', drone: 'drone', boat: 'boat', fail: 'fail', radio: 'radio', tap: 'tap' };
const GAIN = { siren: 0.32, horn: 0.5, engine: 0.3, water: 0.9, fire: 0.35, reached: 0.85, started: 0.85, achievement: 1,
  bump: 1, reverse: 0.22, steam: 1, meow: 0.9, chick: 0.55, oink: 0.7, boing: 0.8, rotors: 0.5, drone: 0.6, boat: 0.6, fail: 0.7, radio: 0.9, tap: 0.6 };
// Loop windows (s): engine starts from the top, then loops 0:11 to 0:48; the horn sustains while held.
const LOOP = { siren: [0.05, 14.95], horn: [0.4, 1.9], engine: [11, 48], water: [0.3, 5.4], fire: [0.5, 23.5], reverse: [0, 5.5], rotors: [0.3, 19.6], drone: [2, 8.2], boat: [0.3, 15.3] };
const bufs = {}, loops = {}, dog = {};
let live = true; // false while paused or on a menu: the engine / water / fire loops stay quiet
let loading = null;
function loadSamples() {
  if (loading) return loading;
  const c = ac();
  loading = Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    try { const ab = await (await fetch('audio/sfx/' + f + '.mp3')).arrayBuffer(); bufs[k] = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej)); }
    catch (e) { console.warn('sfx ' + k + ' did not load', e); }
  }));
  return loading;
}
function shot(k, vol = 1, off = 0, dur = 0) {
  const b = bufs[k]; if (!b) return false;
  const c = ac(), s = c.createBufferSource(), g = c.createGain(), n = c.currentTime; s.buffer = b; g.gain.setValueAtTime(GAIN[k] * vol, n);
  if (dur) { g.gain.setValueAtTime(GAIN[k] * vol, n + dur - 0.12); g.gain.linearRampToValueAtTime(0, n + dur); }
  s.connect(g).connect(master); dur ? s.start(0, off, dur) : s.start(0, off); return true;
}
let lastBump = 0;
// A held loop: one per key. hold() starts it (or keeps the running one), release() fades it out.
function hold(k, { fadeIn = 0.03, vol = 1 } = {}) {
  const st = loops[k]; if (st) return st;
  const b = bufs[k]; if (!b) return null;
  const c = ac(), src = c.createBufferSource(), g = c.createGain(), w = LOOP[k];
  src.buffer = b; src.loop = true; if (w) { src.loopStart = w[0]; src.loopEnd = Math.min(w[1], b.duration); }
  g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(GAIN[k] * vol, c.currentTime + fadeIn);
  src.connect(g).connect(master); src.start(0, k === 'engine' ? 0 : (w ? w[0] : 0));
  return (loops[k] = { src, g });
}
function release(k, t = 0.25) {
  const st = loops[k]; if (!st) return; delete loops[k]; clearTimeout(dog[k]);
  const n = ctx.currentTime; st.g.gain.cancelScheduledValues(n); st.g.gain.setValueAtTime(st.g.gain.value, n); st.g.gain.linearRampToValueAtTime(0, n + t);
  try { st.src.stop(n + t + 0.05); } catch (e) {}
}
// Watchdog loops (engine, water, fire): kept alive by being called every frame; they fade out on their own
// once the calls stop (paused, menu, minigame over, tab hidden).
function keep(k, ms, t) { clearTimeout(dog[k]); dog[k] = setTimeout(() => release(k, t), ms); }

export const sfx = {
  unlock() { ac(); loadSamples(); },
  state: () => ({ loaded: Object.keys(bufs), loops: Object.keys(loops), live }), // console checks
  reached() { shot('reached') || sfx.good(); },
  // Crash: hitting a building or car (strength ~ speed in m/s). Rate-limited so a scrape isn't a drum roll.
  bump(v = 6) { const n = performance.now(); if (n - lastBump < 350) return; lastBump = n; shot('bump', Math.min(1, 0.35 + Math.abs(v) / 12)) || sfx.thud(); },
  steam() { shot('steam') || sfx.hiss(); }, // a flame goes out
  meow() { shot('meow'); },
  oink() { shot('oink'); },
  boing() { shot('boing') || sfx.good(); }, // pig lands on the cushion
  chick() { const b = bufs.chick; if (b) shot('chick', 1, Math.random() * Math.max(0, b.duration - 1.2), 1.1); else sfx.good(); },
  radio() { shot('radio'); }, // Chief Ember / dispatch walkie-talkie
  // Vehicle loops for the minigames (rotors, drone, boat): call every frame while it's flying / moving.
  amb(k) { if (live && hold(k, { fadeIn: 0.3 })) keep(k, 400, 0.5); },
  started() { shot('started') || sfx.tap(); },
  achievement() { shot('achievement') || sfx.badge(); },
  // Fire engine: call every frame while driving with the speed in m/s. Starts from the top when moving off.
  // Set by the game shell: false while paused or on a menu screen, which also silences any running loops.
  live(on) { live = !!on; if (!live) ['engine', 'reverse', 'water', 'fire', 'horn', 'rotors', 'drone', 'boat'].forEach(k => release(k, 0.3)); },
  engine(v) {
    if (!live) return;
    const a = Math.abs(v || 0);
    if (v < -0.3 && hold('reverse')) keep('reverse', 250, 0.15); // reversing beeper
    if (a < 0.5 && !loops.engine) return;
    if (a >= 0.5) { const st = hold('engine', { fadeIn: 0.08 }); if (st) st.src.playbackRate.setTargetAtTime(0.85 + Math.min(a / 15, 1) * 0.3, ctx.currentTime, 0.2); }
    if (a >= 0.5) keep('engine', 400, 0.6); // stopped (or no more calls): fade out; moving off again restarts it
  },
  water(on) { if (live && on && hold('water', { fadeIn: 0.05 })) keep('water', 250, 0.25); },
  fire(on) { if (live && on && hold('fire', { fadeIn: 0.4 })) keep('fire', 400, 0.8); },
  horn(on) {
    if (on) { release('horn', 0.02); if (!hold('horn', { fadeIn: 0.01 })) { tone(392, 0.35, { v: 0.12 }); tone(494, 0.35, { v: 0.1 }); } }
    else release('horn', 0.18); // taper off quickly, no hard stop
  },
  tap() { shot('tap') || tone(880, 0.06, { type: 'triangle', v: 0.12 }); },
  good() { tone(660, 0.1, { type: 'triangle', v: 0.18 }); tone(990, 0.14, { type: 'triangle', v: 0.16, t: 0.08 }); },
  bad() { tone(220, 0.25, { type: 'sawtooth', v: 0.1, f2: 140 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', v: 0.2, t: i * 0.11 })); },
  fail() { if (shot('fail')) return; [392, 330, 262].forEach((f, i) => tone(f, 0.28, { type: 'triangle', v: 0.16, t: i * 0.16 })); },
  badge() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', v: 0.2, t: i * 0.1 })); tone(1568, 0.6, { type: 'triangle', v: 0.16, t: 0.55 }); },
  splash() { noise(0.35, { v: 0.2, lp: 2200 }); },
  hiss() { noise(0.12, { v: 0.12, lp: 4000 }); },
  thud() { tone(120, 0.18, { type: 'sine', v: 0.3, f2: 60 }); },
  siren(on) {
    if (bufs.siren) { if (on) hold('siren', { fadeIn: 0.15 }); else { release('siren', 0.35); if (sirenNode) { sirenNode.o.stop(); sirenNode.l.stop(); sirenNode = null; } } return; }
    const c = ac();
    if (on && !sirenNode) {
      const o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 760; l.frequency.value = 0.9; lg.gain.value = 220; g.gain.value = 0.045;
      l.connect(lg).connect(o.frequency); o.connect(g).connect(master); o.start(); l.start(); sirenNode = { o, l, g };
    } else if (!on && sirenNode) { sirenNode.o.stop(); sirenNode.l.stop(); sirenNode = null; }
  },
};
