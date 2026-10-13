// Skyborn sound bank: user-supplied music and SFX, stored in IndexedDB and shared by the Sound Lab and the game.
// Config shape: { music: { fade, tracks: { [slot]: { explore, fight, level } } }, sfx: { [key]: { level, pitch, variants: [fileId] } } }

export const MUSIC_SLOTS = [
  { id: 'hearthvale', name: 'Hearthvale', fight: true, note: 'Also plays on the title screen' },
  { id: 'cinder', name: 'Cinder Peaks', fight: true },
  { id: 'frostfang', name: 'Frostfang Heights', fight: true },
  { id: 'stormcrown', name: 'Stormcrown', fight: true },
  { id: 'reach', name: 'Sunken Reach', fight: true },
  { id: 'sky', name: 'Sky Isles', fight: true }
];

export const SFX_TABS = [
  ['flight', 'Flight', 'flight'],
  ['combat', 'Combat', 'swords'],
  ['breath', 'Dragon breath', 'local_fire_department'],
  ['world', 'World & rewards', 'castle'],
  ['ui', 'Menus & UI', 'touch_app'],
  ['voice', 'Voice', 'record_voice_over']
];
export const SFX = [
  ['flap', 'flight', 'Wing flap', 'Each wingbeat while Flap is held (about every 0.45 s).'],
  ['dodge', 'flight', 'Barrel roll / dodge', 'Swipe or the Dodge button. Also plays on a perfect dodge.'],
  ['wind', 'flight', 'Wind rush (loop)', 'Loops all the time while flying. Its volume and brightness follow your speed. Use a seamless loop.', true],
  ['splashIn', 'flight', 'Splash · dive in', 'Diving into the sea (Tide).'],
  ['splashOut', 'flight', 'Splash · come up', 'Bursting back out of the water.'],
  ['underwater', 'flight', 'Underwater (loop)', 'Loops while you’re under the sea with Tide. Fades in when you dive, out when you surface. Use a seamless loop.', true],
  ['bonk', 'flight', 'Bonk', 'Bumping into the ground or a hillside.'],
  ['alarm', 'combat', 'Incoming!', 'A group of enemies arrives.'],
  ['hit', 'combat', 'Hit an enemy', 'Your breath connects.'],
  ['pop', 'combat', 'Enemy defeated', 'A balloon pops, a griffin falls and so on.'],
  ['hurt', 'combat', 'You get hit', 'Losing a heart.'],
  ['boom', 'combat', 'Explosion / thunder', 'Lightning strikes, big impacts and fireworks.'],
  ['cleared', 'combat', 'Enemies cleared', 'The last enemy in a group goes down.'],
  ['roar', 'combat', 'Champion appears', 'A region champion wakes up.'],
  ['breath_Breeze', 'breath', 'Breeze · gust', 'Breeze’s wind breath.'],
  ['breath_Ember', 'breath', 'Ember · fireball', 'Ember’s fire breath.'],
  ['breath_Frost', 'breath', 'Frost · ice shards', 'Frost’s ice breath.'],
  ['breath_Storm', 'breath', 'Storm · lightning', 'Storm’s lightning arc.'],
  ['breath_Tide', 'breath', 'Tide · water jet', 'Tide’s water breath.'],
  ['breath_Gold', 'breath', 'Gold · sunbeam', 'Gold’s sunbeam.'],
  ['ching', 'world', 'Gem / ring', 'Picking up gems, passing a race ring, buying an upgrade.'],
  ['light', 'world', 'Tower lit / beacon', 'Lighting a Dragon Tower or a roost beacon, finding a statue.'],
  ['unlock', 'world', 'Big unlock', 'Favours, new regions, vistas, fanfares, hatching.'],
  ['crack', 'world', 'Egg crack', 'Each tap on the egg.'],
  ['tap', 'ui', 'Button tap', 'Every menu button and toggle.']
].map(([key, tab, name, note, loop]) => ({ key, tab, name, note, loop: !!loop }));

const DB = 'skyborn-sound', V = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, V); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files'); if (!d.objectStoreNames.contains('config')) d.createObjectStore('config'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
export const defaults = () => ({ music: { fade: 2, tracks: {} }, sfx: {}, voice: { level: DEFAULT_VOICE } });
// Older setups had one shared "splash" row: copy its files and settings to both new rows.
function migrateSplash(cfg) { const o = cfg.sfx && cfg.sfx.splash; if (!o) return cfg; ['splashIn', 'splashOut'].forEach(k => { if (!cfg.sfx[k]) cfg.sfx[k] = { level: o.level ?? 100, pitch: o.pitch || 0, variants: [...(o.variants || [])] }; }); delete cfg.sfx.splash; return cfg; }
const withLevels = cfg => { if (!cfg.voice || typeof cfg.voice.level !== 'number') cfg.voice = { level: DEFAULT_VOICE }; Object.keys(DEFAULT_LEVELS).forEach(k => { if (!cfg.sfx[k]) cfg.sfx[k] = defaultSfx(k); }); return cfg; };
export async function loadConfig() { try { const c = await tx('config', 'readonly', s => s.get('cfg')); return withLevels(migrateSplash(Object.assign(defaults(), c || {}))); } catch (e) { return withLevels(defaults()); } }
export const saveConfig = cfg => tx('config', 'readwrite', s => s.put(cfg, 'cfg'));
export async function putFile(file) { const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); await tx('files', 'readwrite', s => s.put({ name: file.name, type: file.type, blob: file }, id)); return id; }
export const getFile = id => tx('files', 'readonly', s => s.get(id));
export const delFile = id => tx('files', 'readwrite', s => s.delete(id));
export const allFileIds = () => tx('files', 'readonly', s => s.getAllKeys());
// Dan's tuned levels (Oct 2026): the default for a sound until it's changed in the Sound Lab on a device.
export const DEFAULT_VOICE = 80;   // overall voice level (Sound Lab header)
export const DEFAULT_LEVELS = { flap: 75, dodge: 75, wind: 190, underwater: 185, bonk: 100, alarm: 70, hit: 80, pop: 75, hurt: 75, boom: 80, cleared: 75, roar: 80, ching: 120, tap: 45 };
export const defaultSfx = key => ({ level: DEFAULT_LEVELS[key] ?? 100, pitch: 0, variants: [] });
export const sfxCfg = (cfg, key) => cfg.sfx[key] || (cfg.sfx[key] = defaultSfx(key));
export const trackCfg = (cfg, slot) => cfg.music.tracks[slot] || (cfg.music.tracks[slot] = { explore: null, fight: null, level: 100 });

// Decode everything the config points at into AudioBuffers.
const CACHE = new Map();
export async function loadBank(ctx) {
  const cfg = await loadConfig(), ids = new Set(), buf = {}, names = {};
  Object.values(cfg.sfx).forEach(s => (s.variants || []).forEach(v => ids.add(v)));
  Object.values(cfg.music.tracks).forEach(t => { if (t.explore) ids.add(t.explore); if (t.fight) ids.add(t.fight); });
  await Promise.all([...ids].map(async id => { try { if (CACHE.has(id)) { const c = CACHE.get(id); buf[id] = c.b; names[id] = c.n; return; } const f = await getFile(id); if (!f) return; names[id] = f.name; buf[id] = await ctx.decodeAudioData(await f.blob.arrayBuffer()); CACHE.set(id, { b: buf[id], n: f.name }); } catch (e) { console.warn('sound', id, e); } }));
  return { cfg, buf, names };
}

// One-file sound pack (JSON with base64 audio) for backing up or moving between devices.
export async function exportPack() {
  const cfg = await loadConfig(), ids = new Set(); Object.values(cfg.sfx).forEach(s => (s.variants || []).forEach(v => ids.add(v))); Object.values(cfg.music.tracks).forEach(t => { if (t.explore) ids.add(t.explore); if (t.fight) ids.add(t.fight); });
  const files = {};
  for (const id of ids) { const f = await getFile(id); if (!f) continue; const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f.blob); }); files[id] = { name: f.name, type: f.type, data: b64 }; }
  return new Blob([JSON.stringify({ skybornSoundPack: 1, cfg, files })], { type: 'application/json' });
}
export async function importPack(file) {
  const j = JSON.parse(await file.text()); if (!j.skybornSoundPack) throw new Error('Not a Skyborn sound pack');
  for (const [id, f] of Object.entries(j.files || {})) { const blob = await (await fetch(f.data)).blob(); await tx('files', 'readwrite', s => s.put({ name: f.name, type: f.type, blob }, id)); }
  await saveConfig(Object.assign(defaults(), j.cfg));
}
