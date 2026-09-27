/* music.js — Dan's world themes, cross-faded (house format: knowledge/audio-patterns.md).
 * One looping track per world, audio/crazy-golf-<world-name>.webm. Menus (home, map, shop, trophies, guide from
 * the menus) play the Jungle Ruins theme; a world's screens (hole select, intro, play, pause, result, scorecard,
 * handoff) play that world's theme, falling back to Jungle Ruins until its song is added to TRACKS.
 * Deliberate departures from the house rule, as in cutlass-coast: several tunes that cross-fade, and the files are
 * encoded without the 6dB cut and played at full element volume (Dan found the house level too quiet under the SFX).
 * No mute, no slider. Nothing is fetched until the first gesture. */

// worlds whose song has been encoded into audio/ — add the world id here when a new one lands
export const TRACKS = {
  jungle: 'crazy-golf-jungle-ruins',
  pirate: 'crazy-golf-pirate-cove',
  space: 'crazy-golf-space-station',
  haunted: 'crazy-golf-haunted-house',
  candy: 'crazy-golf-candy-kingdom',
  ice: 'crazy-golf-ice-palace',
  factory: 'crazy-golf-robot-factory',
  desert: 'crazy-golf-pyramid-desert',
};
const DEFAULT = 'jungle', FADE = 1.5, LEVEL = 1;
// pointerdown/touchstart don't grant user activation on a touch screen — only these do
const EVENTS = ['pointerup', 'click', 'touchend', 'keydown'];

const els = {};
let current = DEFAULT, playing = false, fade = null;

function el(id) {
  if (!els[id]) {
    const a = new Audio(); a.preload = 'none'; a.loop = true; a.src = `audio/${TRACKS[id]}.webm`; a.volume = 0;
    els[id] = a;
  }
  return els[id];
}

/* ask for a world's theme (or the menu theme with null); asking for the one already playing does nothing */
export function musicFor(worldId) {
  const want = worldId && TRACKS[worldId] ? worldId : DEFAULT;
  if (want === current) return;
  current = want;
  if (!playing) return;                     // not started yet: start() plays `current`
  const a = el(current), id = current;
  if (!a.paused) { crossfade(); return; }
  // keep the old tune going until the new one is really playing (it's only fetched now), then cross over
  a.volume = 0;
  a.play().then(() => { if (current === id) crossfade(); }, () => crossfade());
}

function crossfade() {
  if (fade) cancelAnimationFrame(fade.raf);
  const from = Object.fromEntries(Object.entries(els).map(([k, a]) => [k, a.volume]));
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
    for (const [id, a] of Object.entries(els)) {
      const target = id === current ? LEVEL : 0;
      a.volume = Math.max(0, Math.min(1, from[id] + (target - from[id]) * k));
      if (k >= 1 && id !== current && !a.paused) { a.pause(); a.currentTime = 0; }   // a finished fade isn't two decoders
    }
    fade = k < 1 ? { raf: requestAnimationFrame(step) } : null;
  };
  fade = { raf: requestAnimationFrame(step) };
}

function start() {
  if (playing) return;                      // stay armed until it's really playing
  const a = el(current); a.volume = LEVEL;
  let p;
  try { p = a.play(); } catch (e) { return; }   // no a.load(): it aborts the play
  const ok = () => { playing = true; EVENTS.forEach(e => document.removeEventListener(e, start, true)); };
  if (p && p.then) p.then(ok, () => {}); else ok();
}
EVENTS.forEach(e => document.addEventListener(e, start, true));

document.addEventListener('visibilitychange', () => {
  if (!playing) return;
  if (document.hidden) Object.values(els).forEach(a => a.pause());
  else { const a = el(current); a.volume = LEVEL; a.play().catch(() => {}); }
});

/* for desktop debugging / tests: which theme is wanted and what each element is doing */
export function musicState() {
  return { current, playing, els: Object.fromEntries(Object.entries(els).map(([k, a]) => [k, { paused: a.paused, vol: +a.volume.toFixed(2), t: +a.currentTime.toFixed(1) }])) };
}
