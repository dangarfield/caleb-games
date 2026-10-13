// Skyborn voiceover: Rider, Narrator and favour characters. Files live in voice/<id>.webm with optional -v2, -v3… variants.
import { ensureAudio, settings, duckMusic, getBank } from './ui.js';
const VARIANTS = {"barrier-cinder":1,"barrier-frostfang":1,"barrier-reach":1,"barrier-sky":1,"barrier-stormcrown":1,"champ-again":1,"champ-cinder":1,"champ-frostfang":1,"champ-hearthvale":1,"champ-left":1,"champ-reach":1,"champ-reinforce":3,"champ-rematch":1,"champ-sky":1,"champ-stormcrown":1,"combat-bonk":4,"combat-camp":1,"combat-campdone":1,"combat-clear1":1,"combat-clear2":1,"combat-clear3":1,"combat-clear4":1,"combat-crash":3,"combat-dodge":4,"combat-enemies":1,"combat-here":3,"combat-incoming":4,"combat-lowhp":3,"combat-ouch":4,"combat-wave":3,"egg-appear":1,"egg-got":1,"egg-nofire":3,"ending":1,"fanfare":1,"fav-cinder-fav1-thanks":1,"fav-cinder-fav1":1,"fav-cinder-fav2-thanks":1,"fav-cinder-fav2":1,"fav-cinder-fav3-thanks":1,"fav-cinder-fav3":1,"fav-cinder-fav4-thanks":1,"fav-cinder-fav4":1,"fav-done":3,"fav-fav-balloon-thanks":1,"fav-fav-balloon":1,"fav-fav-bonfire-thanks":1,"fav-fav-bonfire":1,"fav-fav-lantern-thanks":1,"fav-fav-lantern":1,"fav-fav-sheep-thanks":1,"fav-fav-sheep":1,"fav-frostfang-fav1-thanks":1,"fav-frostfang-fav1":1,"fav-frostfang-fav2-thanks":1,"fav-frostfang-fav2":1,"fav-frostfang-fav3-thanks":1,"fav-frostfang-fav3":1,"fav-frostfang-fav4-thanks":1,"fav-frostfang-fav4":1,"fav-reach-fav1-thanks":1,"fav-reach-fav1":1,"fav-reach-fav2-thanks":1,"fav-reach-fav2":1,"fav-reach-fav3-thanks":1,"fav-reach-fav3":1,"fav-reach-fav4-thanks":1,"fav-reach-fav4":1,"fav-sky-fav1-thanks":1,"fav-sky-fav1":1,"fav-start":3,"fav-stormcrown-fav1-thanks":1,"fav-stormcrown-fav1":1,"fav-stormcrown-fav2-thanks":1,"fav-stormcrown-fav2":1,"fav-stormcrown-fav3-thanks":1,"fav-stormcrown-fav3":1,"fav-stormcrown-fav4-thanks":1,"fav-stormcrown-fav4":1,"find-almost":1,"find-chest":4,"find-discovered":3,"find-firstnest":1,"find-glint":1,"find-glintno":1,"find-roost":3,"find-soar":3,"find-soargo":3,"find-splash":1,"find-spotted":3,"find-statue":3,"find-statues":1,"find-vista":1,"find-whales":1,"find-wind":4,"hatch-crack1":1,"hatch-crack2":1,"hatch-ember":1,"hatch-frost":1,"hatch-gold":1,"hatch-storm":1,"hatch-tap":1,"hatch-tide":1,"hatch-wobble":3,"hatchery-next":1,"home-welcome":3,"intro-1":1,"intro-2":1,"intro-3":1,"intro-4":1,"intro-5":1,"nest-calm":1,"nest-locked":3,"nest-wake":1,"region-0":1,"region-1":1,"region-2":1,"region-3":1,"region-4":1,"region-5":1,"ring-beatbro":1,"ring-best":3,"ring-bronze":1,"ring-done":1,"ring-gate":1,"ring-go":3,"ring-gold":1,"ring-silver":1,"ring-timeout":3,"title-name":1,"title-story":1,"tower-done":1,"tower-land":3,"tower-lit":4,"tower-lit3":1,"wp-down":3,"wp-land":3,"wp-up":3,"wp-water":1};
export const VOICE_LINES = VARIANTS;
// Overall voice level from the Sound Lab (0–100%, default 100), on top of the pause-menu Voice slider.
export const voiceLevel = () => Math.min(100, (getBank()?.cfg?.voice?.level) ?? 80) / 100;
export const voiceGain = () => Math.pow((settings.voice ?? 90) / 100, 2) * 1.15 * voiceLevel();
const cache = {}, last = {};
let cur = null, curPri = 0;
// Lines that can happen a lot only speak now and then.
const COOLDOWN = { 'combat-ouch': 6, 'combat-bonk': 8, 'combat-lowhp': 20, 'find-wind': 25, 'find-spotted': 20, 'find-chest': 4, 'combat-incoming': 15, 'combat-enemies': 15, 'find-soar': 20, 'find-soargo': 40, 'tower-land': 10, 'egg-nofire': 10, 'combat-here': 10, 'find-discovered': 10, 'home-welcome': 30, 'champ-left': 20, 'find-glint': 20, 'find-glintno': 20 };
const pick = id => { const n = VARIANTS[id]; if (!n) return null; const k = 1 + ((Math.random() * n) | 0); return k === 1 ? id : id + '-v' + k; };
async function load(ac, f) { if (!cache[f]) cache[f] = fetch('voice/' + f + '.webm').then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => ac.decodeAudioData(b)).catch(() => null); return cache[f]; }
// priority: 1 chatter, 2 normal, 3 important (champions, eggs, favours). A higher line cuts a lower one off; equal or lower waits its turn (skipped).
export async function vo(id, pri = 2) {
  if (!id || !VARIANTS[id] || (settings.voice ?? 90) <= 0) return;
  const now = performance.now() / 1000, cd = COOLDOWN[id] || 0; if (cd && last[id] && now - last[id] < cd) return;
  if (cur && pri <= curPri) return;
  const ac = ensureAudio(); if (!ac) return; last[id] = now;
  const f = pick(id), buf = await load(ac, f); if (!buf) return;
  if (cur && pri <= curPri) return;
  if (cur) { try { cur.stop(); } catch (e) {} }
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = voiceGain();
  s.connect(g); g.connect(ac.destination); s.start(); cur = s; curPri = pri; duckMusic(true);
  s.onended = () => { if (cur === s) { cur = null; curPri = 0; duckMusic(false); } };
}
// Sound Lab preview: one specific file (e.g. 'combat-ouch-v2'), at the current voice gain.
export async function playVoiceFile(f) { const ac = ensureAudio(); if (!ac) return null; const buf = await load(ac, f); if (!buf) return null; const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = voiceGain(); s.connect(g); g.connect(ac.destination); s.start(); return s; }
// Play one line to the end (for the intro); resolves when it finishes or is stopped. Nothing else talks over it.
export async function voLine(f) { stopVoice(); const s = await playVoiceFile(f); if (!s) return false; cur = s; curPri = 9; return new Promise(r => { s.onended = () => { if (cur === s) { cur = null; curPri = 0; } r(true); }; }); }
export const stopVoice = () => { if (cur) { try { cur.stop(); } catch (e) {} cur = null; curPri = 0; duckMusic(false); } };
export const favVoice = id => 'fav-' + id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
export const hasVoice = id => !!VARIANTS[id];
