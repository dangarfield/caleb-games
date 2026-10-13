// Skyborn UI helpers: DOM shortcuts, toasts, audio (generated SFX + a generated looping theme), saves.
export const $ = id => document.getElementById(id);
let toastT = 0, bannerT = 0, msgT = 0;
export function toast(text, ms = 2200) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }
export function banner(title, sub = '', ms = 3500) { const el = $('banner'); el.innerHTML = `<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}`; el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), ms); }
export function flash(text, ms = 1000) { const el = $('msg'); el.textContent = text; clearTimeout(msgT); msgT = setTimeout(() => { el.textContent = ''; }, ms); }
export const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

// ---------- Saves (IndexedDB via arcade-store) ----------
const Store = window.ArcadeStore('skyborn');
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0;
export const storeReady = () => new Promise(r => Store.ready(() => r()));
export function loadAll() { const d = Store.get(); if (d) gen = d.gen || 0; return d || null; }
export function saveAll(d) { if (Store.conflict()) return false; gen += 1; Store.set(null, Object.assign({}, d, { gen, sid: SID }), { guard: true }); return true; }

// ---------- Audio ----------
import { loadBank, defaultSfx } from './soundbank.js';
const level = v => (v / 100) ** 2;
let lowpass, ctx, sounds, music, synthBus, windGain, windFilt, windNoise, musicOn = false, nextNote = 0, step = 0, bank = null, windLoop = null;
export const settings = { sfx: 80, mus: 60, voice: 90, fast: false, mon: false, inf: false };
export function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.7; lowpass.connect(ctx.destination);
    sounds = ctx.createGain(); sounds.gain.value = level(settings.sfx); sounds.connect(lowpass);
    music = ctx.createGain(); music.gain.value = level(settings.mus) * 0.55; music.connect(lowpass);
    synthBus = ctx.createGain(); synthBus.connect(music);
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = buf; n.loop = true; windFilt = ctx.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 500; windFilt.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0; n.connect(windFilt); windFilt.connect(windGain); windGain.connect(sounds); n.start(); windNoise = windFilt;
    reloadBank();
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (!musicOn) { musicOn = true; nextNote = ctx.currentTime + 0.2; }
  return ctx;
}
let uwLoop = null, uwGain = null;
export function underwaterAudio(on) {
  if (!ctx) return; lowpass.frequency.setTargetAtTime(on ? 650 : 20000, ctx.currentTime, on ? 0.08 : 0.12);
  const c = bank && bank.cfg.sfx.underwater, id = c && (c.variants || []).find(v => bank.buf[v]);
  if (on && id && !uwLoop) { uwLoop = ctx.createBufferSource(); uwLoop.buffer = bank.buf[id]; uwLoop.loop = true; uwGain = ctx.createGain(); uwGain.gain.value = 0; uwLoop.connect(uwGain); uwGain.connect(ctx.destination); uwLoop.start(); uwGain.gain.setTargetAtTime(((c.level ?? 100) / 100) * level(settings.sfx), ctx.currentTime, 0.25); }
  if (!on && uwLoop) { const l = uwLoop, g = uwGain; g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => { try { l.stop(); } catch (e) {} }, 900); uwLoop = null; uwGain = null; }
}
export function duckMusic() {} // music is never ducked under voice
export function setLevels() { if (!ctx) return; sounds.gain.value = level(settings.sfx); music.gain.value = level(settings.mus) * 0.55; }
// Built-in sounds honour the Sound Lab's level and pitch ± too (set just for the duration of one sfx call).
let pMul = 1, vMul = 1;
export function playSynth(k, arg, pitch = 0, level = 100) { if (!synth[k]) return; pMul = Math.pow(2, ((Math.random() * 2 - 1) * pitch) / 12); vMul = level / 100; try { synth[k](arg); } finally { pMul = 1; vMul = 1; } }
function tone(f, dur, type = 'sine', vol = 0.1, f2, when = 0, bus) {
  if (!ctx) return; if (!bus || bus === sounds) { f *= pMul; if (f2) f2 *= pMul; vol *= vMul; } const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 20), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || sounds); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.08, freq = 800, when = 0) {
  if (!ctx) return; freq *= pMul; vol *= vMul; dur /= Math.sqrt(pMul); const t = ctx.currentTime + when, buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(sounds); s.start(t); s.stop(t + dur);
}
export const synth = {
  flap: () => { noise(0.18, 0.12, 300); tone(90, 0.15, 'sine', 0.08, 60); },
  breath: kind => { if (kind === 'Breeze') { noise(0.35, 0.12, 700); tone(300, 0.3, 'sine', 0.04, 600); return; } if (kind === 'Frost') { tone(1400, 0.25, 'triangle', 0.05, 2200); noise(0.2, 0.05, 4000); } else if (kind === 'Storm') { noise(0.18, 0.12, 2500); tone(180, 0.2, 'sawtooth', 0.05, 900); } else if (kind === 'Tide') { noise(0.3, 0.1, 1200); } else if (kind === 'Gold') { tone(660, 0.3, 'triangle', 0.06, 1320); tone(990, 0.3, 'sine', 0.04); } else { tone(200, 0.25, 'sawtooth', 0.06, 700); noise(0.25, 0.09, 900); } },
  hit: () => { tone(320, 0.12, 'square', 0.05, 160); noise(0.1, 0.08, 1500); },
  pop: () => { noise(0.35, 0.16, 500); tone(150, 0.4, 'sine', 0.1, 50); },
  hurt: () => { tone(300, 0.3, 'sine', 0.12, 120); noise(0.2, 0.1, 400); },
  ching: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'sine', 0.07, null, i * 0.06)); },
  dodge: () => { tone(500, 0.25, 'triangle', 0.06, 1200); },
  light: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.06, null, i * 0.08)); },
  unlock: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.7, 'triangle', 0.07, null, i * 0.12)); },
  roar: () => { tone(110, 0.9, 'sawtooth', 0.08, 55); noise(0.8, 0.08, 220); },
  boom: () => { noise(0.5, 0.18, 180); tone(70, 0.5, 'sine', 0.12, 35); },
  tap: () => tone(700, 0.06, 'sine', 0.05),
  alarm: () => { [880, 660, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.035, null, i * 0.17)); },
  cleared: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.55 : 0.16, 'triangle', 0.06, null, i * 0.1)); tone(1318, 0.5, 'sine', 0.03, null, 0.3); },
  splashIn: () => { noise(0.55, 0.2, 700); noise(0.3, 0.12, 2400, 0.05); tone(180, 0.35, 'sine', 0.06, 70); },
  splashOut: () => { noise(0.4, 0.16, 1400); noise(0.5, 0.08, 3200, 0.06); tone(120, 0.25, 'sine', 0.05, 260); },
  crack: () => { noise(0.12, 0.15, 3000); tone(900, 0.08, 'square', 0.03, 400); }
};
// User sounds from the Sound Lab override the built-in synth; random variant + random pitch within ±range.
// Project audio (sfx/*.webm, music/*.webm) fills any row or music slot that has no file added in the Sound Lab.
const PROJECT_SFX = { flap: 'wing-flap', dodge: 'dodge', wind: 'wind-rush', splashIn: 'water-splash-enter', splashOut: 'water-emerge', underwater: 'underwater', bonk: 'bonk', alarm: 'incoming', hit: 'hit-an-enemy', pop: 'enemy-defeated', hurt: 'you-get-hit', boom: 'big-impact', cleared: 'enemies-cleared', roar: 'champion-appears', ching: 'gems', light: 'tower-lit-beacon', unlock: 'big-unlock', crack: 'egg-tap', tap: 'ui-tap', breath_Breeze: 'dragon-breath-all', breath_Ember: 'dragon-breath-all', breath_Frost: 'dragon-breath-all', breath_Storm: 'dragon-breath-all', breath_Tide: 'dragon-breath-all', breath_Gold: 'dragon-breath-all' };
const PROJECT_MUSIC = { hearthvale: { explore: 'hearthvale-normal', fight: 'hearthvale-battle' }, cinder: { explore: 'cinder-peaks-normal', fight: 'cinder-peaks-battle' }, frostfang: { explore: 'frostfang-normal', fight: 'frostfang-battle' }, stormcrown: { explore: 'stormcrown-normal', fight: 'stormcrown-battle' }, reach: { explore: 'sunken-reach-normal', fight: 'sunken-reach-battle' }, sky: { explore: 'sky-isles-normal', fight: 'sky-isles-battle' } };
const projDec = {};
const projBuf = (dir, f) => projDec[dir + f] || (projDec[dir + f] = fetch(dir + '/' + f + '.webm').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => ctx.decodeAudioData(b)).catch(() => null));
async function addProject(b) {
  const jobs = [];
  for (const [k, f] of Object.entries(PROJECT_SFX)) { const c = b.cfg.sfx[k] || (b.cfg.sfx[k] = defaultSfx(k)); if ((c.variants || []).some(v => b.buf[v])) continue; jobs.push(projBuf('sfx', f).then(buf => { if (buf) { b.buf['p:' + f] = buf; c.variants = ['p:' + f]; } })); }
  for (const [s, m] of Object.entries(PROJECT_MUSIC)) { const t = b.cfg.music.tracks[s] || (b.cfg.music.tracks[s] = { explore: null, fight: null, level: 100 }); for (const mode of ['explore', 'fight']) { if (!m[mode] || (t[mode] && b.buf[t[mode]])) continue; jobs.push(projBuf('music', m[mode]).then(buf => { if (buf) { b.buf['pm:' + m[mode]] = buf; t[mode] = 'pm:' + m[mode]; } })); } }
  await Promise.all(jobs);
}
export async function reloadBank() { if (!ctx) return; const b = await loadBank(ctx); bank = b; applyWindLoop(); refreshMusic(true); await addProject(b); applyWindLoop(); refreshMusic(true); return bank; }
export const getBank = () => bank, getCtx = () => ctx;
export function playSample(key, out) {
  if (!bank) return false; const c = bank.cfg.sfx[key]; if (!c || !c.variants || !c.variants.length) return false;
  const vs = c.variants.filter(v => bank.buf[v]); if (!vs.length) return false;
  const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = bank.buf[vs[(Math.random() * vs.length) | 0]];
  s.playbackRate.value = Math.pow(2, ((Math.random() * 2 - 1) * (c.pitch || 0)) / 12); g.gain.value = (c.level ?? 100) / 100;
  s.connect(g); g.connect(out || sounds); s.start(); return true;
}
export const sfx = {};
Object.keys(synth).forEach(k => { sfx[k] = (...a) => { const key = k === 'breath' ? 'breath_' + (a[0] || 'Ember') : k; if (playSample(key)) return; const c = bank && bank.cfg.sfx[key]; playSynth(k, a[0], c ? c.pitch || 0 : 0, c ? c.level ?? 100 : 100); }; });
sfx.bonk = () => { if (!playSample('bonk')) synth.hurt(); };
synth.bonk = () => synth.hurt();
function applyWindLoop() {
  if (windLoop) { try { windLoop.stop(); } catch (e) {} windLoop = null; }
  const c = bank && bank.cfg.sfx.wind, id = c && c.variants && c.variants.find(v => bank.buf[v]);
  try { windNoise.disconnect(); } catch (e) {}
  if (id) { windLoop = ctx.createBufferSource(); windLoop.buffer = bank.buf[id]; windLoop.loop = true; const g = ctx.createGain(); g.gain.value = (c.level ?? 100) / 100 * 2.5; windLoop.connect(g); g.connect(windGain); windLoop.start(); }
  else windNoise.connect(windGain);
}
// paused = quick fade out (menus, title); it fades back in the same way when flying resumes.
export function wind(speed, paused = false) { if (!ctx) return; windGain.gain.setTargetAtTime(paused ? 0 : Math.min(0.22, Math.max(0, (speed - 25) / 300)), ctx.currentTime, paused ? 0.08 : 0.12); windFilt.frequency.setTargetAtTime(300 + speed * 12, ctx.currentTime, 0.2); if (windLoop) windLoop.playbackRate.setTargetAtTime(0.85 + Math.min(0.5, speed / 300), ctx.currentTime, 0.3); }

// ---------- Music: user tracks per region, explore/fight variants, crossfaded. Falls back to the built-in theme. ----------
let want = { slot: 'title', fight: false }, cur = null, playing = [];
export function setMusic(slot, fight) { if (want.slot === slot && want.fight === !!fight) return; want = { slot, fight: !!fight }; refreshMusic(); }
function pickTrack() {
  if (!bank) return null; const T = bank.cfg.music.tracks, has = (s, m) => T[s] && T[s][m] && bank.buf[T[s][m]] ? { slot: s, mode: m, id: T[s][m], level: T[s].level ?? 100 } : null;
  const { slot, fight } = want, region = want.region || slot;
  // Title plays Hearthvale's explore track. Champion fights and Ring Runs use the region's Fight track (no slots of their own).
  if (slot === 'title') return has('hearthvale', 'explore');
  return (fight && has(slot, 'fight')) || has(slot, 'explore');
}
export function setMusicHome(region) { want.home = region; }
function refreshMusic(force) {
  if (!ctx || !synthBus) return; const next = pickTrack(), fade = bank ? bank.cfg.music.fade ?? 2 : 2, now = ctx.currentTime;
  if (!force && cur && next && cur.id === next.id) return; if (!next && !cur && !force) return;
  let offset = 0; if (cur && next && cur.slot === next.slot) offset = (now - cur.start) % bank.buf[next.id].duration;
  playing.forEach(p => { p.g.gain.cancelScheduledValues(now); p.g.gain.setValueAtTime(p.g.gain.value, now); p.g.gain.linearRampToValueAtTime(0, now + fade); setTimeout(() => { try { p.s.stop(); } catch (e) {} }, fade * 1000 + 100); });
  playing = []; cur = null;
  synthBus.gain.cancelScheduledValues(now); synthBus.gain.setValueAtTime(synthBus.gain.value, now); synthBus.gain.linearRampToValueAtTime(next ? 0 : 1, now + fade);
  if (!next) return;
  const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = bank.buf[next.id]; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(music);
  s.start(now, offset); g.gain.linearRampToValueAtTime(next.level / 100 / 0.55, now + fade);
  cur = { ...next, start: now - offset }; playing.push({ s, g });
}
export const musicNow = () => cur ? { ...cur, name: bank.names[cur.id] } : null;

// A soaring theme in D major: I V vi IV, arpeggio + pad + bass, 96 bpm, loops forever.
const CH = [[62, 66, 69, 74], [57, 61, 64, 69], [59, 62, 66, 71], [55, 59, 62, 67]];
const MEL = [74, 76, 78, 81, 78, 76, 74, 73, 71, 73, 74, 76, 74, null, 69, 71];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function tickMusic() {
  if (!ctx || !musicOn) return;
  const beat = 60 / 96 / 2;
  while (nextNote < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % 4, chord = CH[bar], when = nextNote - ctx.currentTime, i = step % 8;
    if (synthBus.gain.value > 0.001) {
    tone(mtof(chord[i % 4] + (i >= 4 ? 12 : 0)), beat * 1.6, 'triangle', 0.035, null, when, synthBus);
    if (i === 0) { tone(mtof(chord[0] - 24), beat * 7.5, 'sine', 0.06, null, when, synthBus); chord.forEach(n => tone(mtof(n), beat * 7.8, 'sine', 0.012, null, when, synthBus)); }
    const m = MEL[(step >> 1) % 16]; if (step % 2 === 0 && m && Math.floor(step / 32) % 2 === 1) tone(mtof(m), beat * 1.8, 'sine', 0.04, null, when, synthBus); }
    nextNote += beat; step++;
  }
}
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
