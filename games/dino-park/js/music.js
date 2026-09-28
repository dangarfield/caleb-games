/* music.js — park themes, cross-faded (house format: knowledge/audio-patterns.md; same shape as crazy-golf's).
 * One looping track per park, audio/dino-park-<park-name>.webm (from Dan's research/<park-name>.m4a).
 * The Day map plays the theme of the park tab that's selected, cross-fading as you tap between them; Home plays the
 * boy's current park; a day's intro, play and result screens play that day's park. Shop, Book and How to play keep
 * whatever was playing. A missing id falls back to 'menu' (not used yet), then Jungle Valley.
 * Encoded without the 6dB cut and played at full element volume, as in crazy-golf (the house level was too quiet under
 * the SFX). No mute, no slider. Nothing is fetched until the first gesture. */

// parks whose song has been encoded into audio/ — add the id here when a new one lands
// ids: menu, jungle, volcano, desert (Sunny Canyon), beach (Coral Bay), snowy
export const TRACKS = {
  jungle: 'dino-park-jungle-valley',
  volcano: 'dino-park-volcano-island',
  desert: 'dino-park-sunny-canyon',
  beach: 'dino-park-coral-bay',
  snowy: 'dino-park-snowy-peaks',
};
const FADE = 1.5, LEVEL = 1;
const EVENTS = ['pointerup', 'click', 'touchend', 'keydown'];   // pointerdown doesn't grant activation on touch

const els = {};
let current = null, playing = false, fade = null;

const pick = id => (id && TRACKS[id]) ? id : TRACKS.menu ? 'menu' : TRACKS.jungle ? 'jungle' : null;
function el(id) {
  if (!els[id]) { const a = new Audio(); a.preload = 'none'; a.loop = true; a.src = `audio/${TRACKS[id]}.webm`; a.volume = 0; els[id] = a; }
  return els[id];
}

/* ask for a park's theme, or the menu theme with null */
export function musicFor(parkId) {
  const want = pick(parkId);
  if (want === current) return;
  current = want;
  if (!playing || !current) { if (!current) crossfade(); return; }
  const a = el(current), id = current;
  if (!a.paused) { crossfade(); return; }
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
      if (k >= 1 && id !== current && !a.paused) { a.pause(); a.currentTime = 0; }
    }
    fade = k < 1 ? { raf: requestAnimationFrame(step) } : null;
  };
  fade = { raf: requestAnimationFrame(step) };
}

function start() {
  if (playing) return;
  if (!current) { current = pick(null); if (!current) return; }   // no music added yet: stay armed
  const a = el(current); a.volume = LEVEL;
  let p; try { p = a.play(); } catch (e) { return; }
  const ok = () => { playing = true; EVENTS.forEach(e => document.removeEventListener(e, start, true)); };
  if (p && p.then) p.then(ok, () => {}); else ok();
}
EVENTS.forEach(e => document.addEventListener(e, start, true));

document.addEventListener('visibilitychange', () => {
  if (!playing) return;
  if (document.hidden) Object.values(els).forEach(a => a.pause());
  else if (current) { const a = el(current); a.volume = LEVEL; a.play().catch(() => {}); }
});

export function musicState() {
  return { current, playing, els: Object.fromEntries(Object.entries(els).map(([k, a]) => [k, { paused: a.paused, vol: +a.volume.toFixed(2) }])) };
}
