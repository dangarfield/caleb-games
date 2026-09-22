// Waypoints — the theme, once somebody has touched the page.
//
// House rules, from `knowledge/audio-patterns.md`: one tune, quiet, looping, no
// mute button and no volume slider. The file is already encoded six decibels
// down so it IS background level wherever it ends up, and nothing is fetched
// until the first gesture — which is also the earliest moment a browser would
// let it play, and a tune that starts before anybody has touched anything is
// startling.

const LEVEL = 0.5;                       // on top of the 6 dB taken off the file
const EVENTS = ['pointerdown', 'touchstart', 'keydown'];

export function music(el) {
  if (!el) return;
  let playing = false;

  const arm = () => EVENTS.forEach((e) => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach((e) => document.removeEventListener(e, start, true));

  function start() {
    disarm();
    el.volume = LEVEL;
    let p;
    try { el.load(); p = el.play(); } catch { arm(); return; }
    // Refused: the browser wanted a different kind of gesture. Wait for the next.
    if (p && p.then) p.then(() => { playing = true; }, arm);
    else playing = true;
  }

  // Tracked with our own flag rather than `el.paused`: once it has been paused
  // for a hidden tab those two say the same thing, and reading `el.paused`
  // leaves the music off for good.
  document.addEventListener('visibilitychange', () => {
    if (!playing) return;
    if (document.hidden) el.pause();
    else el.play().catch(() => {});
  });

  arm();
}
