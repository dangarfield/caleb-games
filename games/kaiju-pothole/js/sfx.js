// Sound: Kaiju Pothole's own samples plus a few borrowed from Ember Bay, and the four music tracks. Silent until the first tap.
const BASE = '../_shared/audio/sfx/';
// Kaiju Pothole's own sounds: sfx/*.webm (Opus, mono, levelled to about the same loudness; originals in research/sounds)
const OWN = 'sfx/', OWN_FILES = ['complete-item', 'complete-level', 'gulp-big', 'gulp-mid', 'gulp-small', 'size-up', 'ui-click', 'ui-click-enter-game'];
const FILES = ['fail', 'bump', 'boing', 'horn', 'siren', 'rotors', 'drone', 'boat', 'steam', 'water', 'oink', 'meow', 'chick'];
const GAIN = { achievement: 0.9, boing: 0.5, bump: 0.6, chick: 0.45, fail: 0.6, horn: 0.35, meow: 0.6, oink: 0.55, tap: 0.5, 'waypoint-reached': 0.7, 'waypoint-started': 0.6, siren: 0.25, rotors: 0.35, boat: 0.35, engine: 0.3, fire: 0.35, steam: 0.4, water: 0.4, drone: 0.35, radio: 0.4, reverse: 0.25 };
// ---- MIX: Dan's per-sound tweak knobs. 1 = as it is now. ----
// What you hear = file × GAIN (base mix above) × MIX × the Sounds slider (or, for music, × the Music slider).
// e.g. gulp-big: 1.5 makes the big gulp half as loud again; horn: 0.5 halves the car horn.
export const MIX = {
  // own sounds (sfx/)
  'ui-click': 1, 'ui-click-enter-game': 1, 'gulp-small': 1, 'gulp-mid': 1, 'gulp-big': 1,
  'size-up': 1, 'complete-item': 1, 'complete-level': 1,
  // borrowed from Ember Bay (../_shared/audio/sfx/)
  fail: 1, bump: 1, boing: 1, horn: 0.7, siren: 1, rotors: 1, drone: 1, boat: 1, steam: 1, water: 1, oink: 1, meow: 1, chick: 1,
};
// Per music track, on top of the Music slider.
export const MUSIC_MIX = { gobble: 1, battle: 1, shopping: 1, zen: 1 };
const mix = k => (MIX[k] ?? 1);

let ctx = null, master = null, fxBus = null, musBus = null, muted = false, loading = null;
const vol = { fx: 0.8, music: 0.5 };
const bufs = {}, last = {}, pending = {};
// play a sample; if it is still loading (the first tap), play it as soon as it arrives (if that's quick)
function soon(k, ...a) { if (bufs[k]) return shot(k, ...a); if (!pending[k]) return false; const t0 = performance.now(); pending[k].then(() => { if (performance.now() - t0 < 1200) shot(k, ...a); }); return true; }

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    fxBus = ctx.createGain(); fxBus.gain.value = vol.fx; fxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = vol.music; musBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
  // the music <audio> keeps running while the context is suspended, so pause / resume it too
  const t = current && tracks[current]; if (!t || !t.ok) return;
  if (document.hidden) t.el.pause(); else if (vol.music > 0) t.el.play().catch(() => {});
});

function load() {
  if (loading) return loading;
  const c = ac(), get = async (url, key) => { try { const ab = await (await fetch(url)).arrayBuffer(); bufs[key] = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej)); } catch (e) { /* missing file: that sound is silent */ } };
  // our own UI sounds first, so the very first tap can use them
  for (const f of OWN_FILES) pending[f] = get(OWN + f + '.webm', f);
  for (const f of FILES) pending[f] = get(BASE + f + '.mp3', f);
  return (loading = Promise.all(Object.values(pending)));
}
function shot(k, vol = 1, rate = 1, gap = 0.06, dur = 0) {
  if (!ctx || !bufs[k]) return false; const n = ctx.currentTime; if (n - (last[k] || 0) < gap) return true; last[k] = n;
  const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = bufs[k]; s.playbackRate.value = rate; g.gain.value = (GAIN[k] || 0.5) * mix(k) * vol;
  if (dur) { g.gain.setValueAtTime(g.gain.value, n + dur - 0.15); g.gain.linearRampToValueAtTime(0, n + dur); }
  s.connect(g).connect(fxBus); dur ? s.start(0, 0, dur) : s.start(); return true;
}

// Object ids → a short sample that plays as it drops in (vehicles honk, the helicopter whirrs, boats chug…)
function flavour(id) {
  if (/fire|ambulance|police|polic/.test(id)) return ['siren', 1.2];
  if (/hc_|heli/.test(id)) return ['rotors', 1.2];
  if (/dr_drone/.test(id)) return ['drone', 1];
  if (/^bt_/.test(id)) return ['boat', 1];
  if (/hazard_fire|chip_pan|candle|iron/.test(id)) return ['steam', 1.2];
  if (/hazard_/.test(id)) return ['water', 0.8];
  if (/car|taxi|bus|van|truck|suv|sedan|hatch|coupe|jeep|limo|lemus|cabrio|wagon|pick|rg_|cc_|sp_car/.test(id)) return ['horn', 0.5];
  return null;
}

// ---- music tracks: music/*.webm (Opus 48k, full length, silence trimmed so the loop is tight; originals in research/music).
// One loops at a time; switching cross-fades. Level = MUSIC_MIX × the Music slider (musBus). ----
// If a track can't load there is simply no music.
const TRACKS = { gobble: 'music/kaiju-gobble.webm', battle: 'music/kaiju-battle.webm', shopping: 'music/kaiju-shopping.webm', zen: 'music/kaiju-zen.webm' };
const tracks = {}; let current = null, want = 'gobble';
function track(name) {
  if (tracks[name]) return tracks[name];
  const el = new Audio(TRACKS[name]); el.loop = true; el.preload = 'auto';
  const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(el).connect(g).connect(musBus);
  const t = tracks[name] = { el, g, ok: true }; el.addEventListener('error', () => { t.ok = false; });
  return t;
}
function fade(g, to, sec) { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(to, n + sec); }
function playTrack(name, sec = 1.6) {
  want = name; if (!ctx) return;
  if (current === name) { const t = tracks[name]; if (t && t.ok && t.el.paused && vol.music > 0) t.el.play().catch(() => {}); return; }
  const old = current && tracks[current]; current = name;
  if (old) { fade(old.g, 0, sec); const el = old.el; setTimeout(() => { if (tracks[current] !== old) el.pause(); }, sec * 1000 + 120); }
  const t = track(name);
  if (!t.ok) return;
  t.el.currentTime = 0; t.el.play().catch(() => {}); fade(t.g, MUSIC_MIX[name] ?? 1, sec);
}

// Every game event → its sound file, all in one place. Files are decoded on the first tap.
//  own:  sfx/*.webm (made for Kaiju Pothole)   ember: ../_shared/audio/sfx/*.mp3 (borrowed from Ember Bay)
// Nothing is synthesised: an event with no file is simply silent.
export const SOUND_MAP = {
  tap: 'ui-click', enter: 'ui-click-enter-game',
  gulpSmall: 'gulp-small', gulpMid: 'gulp-mid', gulpBig: 'gulp-big',
  sizeUp: 'size-up', listItem: 'complete-item', levelDone: 'complete-level',
  eaten: 'fail', gotRival: 'bump', // ember, Rivals only
};
export const sfx = {
  // Called from every activating gesture (click / pointerup / touchend / keydown). A play() refused on the
  // very first touch (pointerdown doesn't grant activation on a touch screen) is retried on the next one.
  unlock() {
    ac(); load();
    if (!current) return playTrack(want, 1.2);
    const t = tracks[current]; if (t && t.ok && t.el.paused && vol.music > 0 && !document.hidden) t.el.play().catch(() => {});
  },
  // 'gobble' | 'battle' | 'shopping' | 'zen' (cross-fades from whatever is playing)
  music(name) { playTrack(name); },
  // kind: 'fx' | 'music', v: 0..1
  setVolume(kind, v) { vol[kind] = v; if (kind === 'fx' && fxBus) fxBus.gain.value = v; if (kind === 'music') { if (musBus) musBus.gain.value = v; if (ctx) { if (v > 0 && current) { const t = tracks[current]; if (t && t.el.paused) t.el.play().catch(() => {}); } } } },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; },
  get muted() { return muted; },
  get loaded() { return Object.keys(bufs); },
  tap() { soon(SOUND_MAP.tap, 1, 1, 0.05); },
  enter() { soon(SOUND_MAP.enter, 1, 1, 0.2); },
  gulp(tier, id) {
    shot(tier <= 2 ? SOUND_MAP.gulpSmall : tier <= 4 ? SOUND_MAP.gulpMid : SOUND_MAP.gulpBig, 1, 0.92 + Math.random() * 0.16, 0.05);
    const fl = flavour(id || ''); if (fl && tier >= 2) shot(fl[0], 0.7, 1, 0.35, fl[1]); // ember: vehicles honk / siren / whirr as they drop in
  },
  tierUp() { shot(SOUND_MAP.sizeUp, 1, 1, 0.3); },
  listItem() { shot(SOUND_MAP.listItem, 1, 1, 0.15); },
  fanfare() { shot(SOUND_MAP.levelDone, 1, 1, 1); },
  eaten() { shot(SOUND_MAP.eaten); },
  gotRival() { shot(SOUND_MAP.gotRival, 1, 0.8); },
  critter(k) { shot(k, 0.7, 0.95 + Math.random() * 0.15, 0.4); }, // ember: oink / meow / chick when animals dodge the hole
  start() {}, teeter() {}, tick() {},
};

