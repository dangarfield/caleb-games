// Ember Bay theme: one quiet looping tune (file is encoded 6 dB down, knowledge/audio-patterns.md).
// Routed through Web Audio into the sfx master gain rather than el.volume, because iPad Safari
// ignores el.volume; it plays into the sfx music bus, whose level is the Settings Music slider.
// Armed on activation-granting events; stays armed until play() really resolves.
import { audioCtx, musicOut } from './sfx.js';

export function music(src = 'audio/ember-bay-theme.webm', LEVEL = 0.5) {
  const el = document.createElement('audio');
  el.preload = 'none'; el.loop = true; el.src = src; // preload before src, or the file is fetched at once
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  // pointerdown / touchstart do NOT grant activation on a touch screen; the others do.
  const EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  let playing = false, gain = null;
  const arm = () => EVENTS.forEach(e => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach(e => document.removeEventListener(e, start, true));
  function route() {
    if (gain) return;
    const c = audioCtx();
    gain = c.createGain(); gain.gain.value = LEVEL;
    c.createMediaElementSource(el).connect(gain).connect(musicOut());
  }
  function start() {
    if (playing) return;
    // Resume the context on EVERY armed event: the first touch (pointerdown) creates it suspended,
    // and only a later activation-granting event can wake it. Stay armed until both are running.
    let c = null;
    try { route(); c = audioCtx(); } catch (e) { el.volume = LEVEL; }
    let p; try { p = el.play(); } catch (e) { return; }   // never el.load() first: it aborts the play
    const running = () => !c || c.state === 'running';
    Promise.all([p, c && c.resume()]).then(() => { if (running()) { playing = true; disarm(); } }, () => {});
  }
  const vis = () => {
    if (!playing) return;
    if (document.hidden) el.pause();
    else { audioCtx(); el.play().catch(() => {}); }
  };
  document.addEventListener('visibilitychange', vis);
  arm();
  return { el, state: () => ({ playing, paused: el.paused }), dispose() { disarm(); document.removeEventListener('visibilitychange', vis); el.pause(); el.remove(); } };
}
