/* audio.js — Web Audio SFX (no files) and the hook for Dan's background theme.
 * Everything is quiet and short (knowledge/audio-patterns.md). There is no mute button, on purpose.
 *
 * THEME TRACK — Dan: to add the song, encode it (see knowledge/audio-patterns.md) to
 *   games/buttons/audio/buttons-theme.webm  and set THEME_URL below to 'audio/buttons-theme.webm'.
 * It then loops at background level from the first tap and pauses when the tab is hidden.
 * While THEME_URL is null nothing is fetched, so there is no 404 in the console. */
export const THEME_URL = 'audio/buttons-theme.webm';   // Dan's song, from research/buttons-song.m4a
const THEME_LEVEL = 0.5;

let ctx = null, master = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlock() { ac(); theme(); }

function tone(f, dur, type, vol, f2, at, dest) {
  const c = ac(); if (!c) return; const t = c.currentTime + (at || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 20), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .1, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + .02);
  return o;
}
function noise(dur, vol, freq, q, at, type, f2) {
  const c = ac(); if (!c) return; const t = c.currentTime + (at || 0);
  const buf = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type || 'bandpass'; fl.frequency.setValueAtTime(freq || 800, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 1;
  const g = c.createGain(); g.gain.setValueAtTime(vol || .08, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
function vib(f, dur, type, vol, rate, depth, at, f2) {
  const c = ac(); if (!c) return; const t = c.currentTime + (at || 0);
  const o = tone(f, dur, type, vol, f2, at); if (!o) return;
  const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + .02);
}
const notes = (list, type, vol, step, len) => list.forEach((f, i) => tone(f, len || step * 1.6, type, vol, 0, i * step));
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

export const sfx = {
  tap() { tone(900, .06, 'sine', .05, 700); },
  zoom() { noise(.28, .035, 500, .8, 0, 'bandpass', 1400); },
  back() { noise(.25, .03, 1400, .8, 0, 'bandpass', 500); },
  squish() { tone(300, .12, 'sine', .12, 120); noise(.08, .04, 400, 2); },
  press() { tone(220, .18, 'square', .05, 90); noise(.12, .05, 300, 1.5); },
  clue() { notes([C5 * 1.5, E5 * 1.5, G5 * 1.5], 'sine', .07, .07); },
  drawer() { noise(.2, .05, 250, 3); tone(140, .12, 'triangle', .05, 110, .08); },
  clunk() { tone(90, .35, 'sine', .22, 45); noise(.2, .1, 180, 1.2); },
  got() { notes([C5, E5, G5, C6], 'triangle', .09, .09); },
  muddle() { for (let i = 0; i < 6; i++) tone(300 + i * 90, .12, 'sawtooth', .025, 600 + i * 120, i * .1); vib(500, .9, 'triangle', .04, 9, 60, .1, 900); },
  win() { notes([C5, E5, G5, C6, G5, C6 * 1.26], 'triangle', .1, .12, .3); noise(.6, .03, 6000, .7, .5, 'highpass'); },
  star() { tone(C6, .14, 'triangle', .07); },
  lose() { tone(500, .3, 'sine', .06, 250); },
  wrong() { vib(150, .45, 'sawtooth', .07, 18, 12, 0, 110); },
  toggle(on) { tone(on ? 660 : 440, .08, 'square', .04); tone(on ? 990 : 330, .1, 'square', .04, 0, .07); },
  giggle() { [0, .1, .2, .3].forEach((t, i) => tone(700 - i * 60, .08, 'square', .025, 900 - i * 60, t)); },
  toast() { tone(1200, .1, 'sine', .04, 1500); },
  clack() { tone(1800, .03, 'square', .03); noise(.03, .05, 2500, 3); },
  whoosh() { noise(1.2, .06, 400, .7, 0, 'bandpass', 2400); },
  splash() { noise(1.4, .12, 900, .6, 0, 'lowpass', 300); for (let i = 0; i < 6; i++) tone(900 + Math.random() * 900, .08, 'sine', .03, 400, .1 + i * .07); },
  flash() { noise(.08, .08, 4000, 1, 0, 'highpass'); tone(2400, .05, 'square', .02, 0, .02); },
  ride() { notes([G5 / 2, C5, E5, G5], 'triangle', .06, .12); },
  /* one per wrong-button gag, played as the gag lands */
  gag(id) { (GAG_SFX[id] || GAG_SFX.duck)(); },
};

const GAG_SFX = {
  duck() { tone(1300, .12, 'square', .04, 1700); tone(1500, .14, 'square', .04, 1100, .5); tone(1400, .12, 'square', .035, 1800, .7); },
  glove() { vib(180, .6, 'triangle', .1, 14, 60, .25, 320); noise(.1, .08, 300, 1, .3); },
  confetti() { noise(.3, .06, 3000, .7, 0, 'highpass'); notes([E5, G5, C6, E5 * 2], 'sine', .05, .08); },
  parp() { vib(233, .8, 'sawtooth', .08, 7, 8, 0, 175); },
  disco() { for (let i = 0; i < 8; i++) { tone(60, .12, 'sine', .15, 40, i * .25); noise(.05, .04, 8000, 1, i * .25 + .125, 'highpass'); } tone(G5, .2, 'square', .03, 0, .5); tone(E5, .2, 'square', .03, 0, 1); },
  pie() { tone(400, .35, 'sine', .05, 900); noise(.35, .16, 500, .8, .35, 'lowpass', 150); },
  cushion() { vib(110, 1.1, 'sawtooth', .07, 26, 30, 0, 70); },
  jack() { notes([C5, 587, E5, 698, G5], 'square', .03, .07); vib(300, .5, 'triangle', .08, 16, 80, .45, 500); },
  bubbles() { for (let i = 0; i < 10; i++) tone(400 + Math.random() * 600, .09, 'sine', .05, 900 + Math.random() * 600, i * .09 + Math.random() * .04); },
  chicken() { tone(900, .15, 'square', .04, 1300); tone(1300, .1, 'square', .04, 700, .18); tone(1000, .35, 'square', .04, 1500, .32); },
  snow() { noise(1.8, .05, 600, .5, 0, 'lowpass', 1400); notes([C6, G5 * 1.5, E5 * 2], 'sine', .03, .3, .5); },
  balloons() { noise(1.2, .05, 300, .6, 0, 'bandpass', 2000); tone(300, 1, 'sine', .04, 1200, .2); },
  flip() { tone(200, .5, 'triangle', .07, 900); tone(900, .5, 'triangle', .07, 200, .55); },
  tickle() { for (let i = 0; i < 9; i++) tone(1100 + (i % 2) * 300, .07, 'square', .025, 0, i * .08); },
  goo() { for (let i = 0; i < 4; i++) tone(260 - i * 30, .25, 'sine', .1, 90, i * .22); noise(.4, .05, 300, 3, 0, 'lowpass'); },
  banana() { tone(1600, .7, 'sine', .06, 300); noise(.15, .08, 250, 1, .7); },
  sneeze() { tone(300, .5, 'triangle', .05, 800); noise(.6, .18, 1800, .5, .55, 'bandpass', 400); },
  tash() { tone(G5, .14, 'triangle', .08); tone(C6, .45, 'triangle', .09, 0, .16); },
  squirt() { noise(.9, .07, 3500, .8, 0, 'bandpass', 1500); },
  raincloud() { for (let i = 0; i < 8; i++) tone(1500 + Math.random() * 500, .05, 'sine', .04, 700, i * .13); },
  frogs() { [0, .3, .6, .9, 1.2].forEach((t, i) => { tone(150 + i * 25, .08, 'square', .06, 0, t); tone(110 + i * 25, .14, 'square', .06, 0, t + .1); }); },
  balls() { for (let i = 0; i < 10; i++) vib(250 + (i % 4) * 90, .16, 'triangle', .05, 20, 80, i * .11); },
  accordion() { [392, 370, 349, 311].forEach((f, i) => { vib(f, .45, 'sawtooth', .035, 5, 5, i * .42); vib(f * 1.5, .45, 'sawtooth', .02, 5, 5, i * .42); }); },
  glitter() { for (let i = 0; i < 14; i++) tone(2000 + Math.random() * 2500, .1, 'sine', .025, 0, i * .07); },
  cuckoo() { [0, .7].forEach(t => { tone(E5 * 1.26, .22, 'sine', .08, 0, t); tone(E5, .3, 'sine', .08, 0, t + .26); }); },
  socks() { for (let i = 0; i < 6; i++) { tone(120, .1, 'sine', .1, 60, i * .2); noise(.08, .05, 400, 1, i * .2); } },
  jelly() { vib(220, 1.2, 'sine', .09, 8, 60); },
  hammer() { tone(1800, .18, 'sine', .05, 2600, .35); noise(.08, .1, 900, 1, .35); tone(2400, .2, 'sine', .04, 1500, .55); },
  spaghetti() { noise(.8, .07, 400, 2, 0, 'bandpass', 2500); tone(300, .2, 'sine', .06, 150, .85); },
  tuba() { vib(58, 1.2, 'sawtooth', .12, 5, 3); vib(87, 1.2, 'sawtooth', .06, 5, 3); },
};

/* ---- background theme (see THEME_URL above) ---- */
let themeEl = null, playing = false;
function theme() {
  if (!THEME_URL) return;
  if (!themeEl) {
    themeEl = new Audio(); themeEl.src = THEME_URL; themeEl.loop = true; themeEl.preload = 'none'; themeEl.volume = THEME_LEVEL;
    document.addEventListener('visibilitychange', () => { if (!playing) return; if (document.hidden) themeEl.pause(); else themeEl.play().catch(() => { }); });
  }
  if (playing) return;
  let p; try { p = themeEl.play(); } catch (e) { return; }
  if (p && p.then) p.then(() => { playing = true; }, () => { }); else playing = true;
}
/* arm on the events that grant activation on a touch screen, and stay armed until something plays */
['pointerup', 'click', 'touchend', 'keydown'].forEach(e => document.addEventListener(e, () => { if (!playing || (ctx && ctx.state !== 'running')) unlock(); }, true));
