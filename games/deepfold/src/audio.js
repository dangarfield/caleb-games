/* audio.js — every sound in the game, generated. No files.
 *
 * One master gain so mute is one number. The theme is a short loop scheduled
 * a quarter of a second ahead from the frame loop rather than from a timer:
 * a setInterval scheduler drifts when the tab is throttled and then catches up
 * in a burst of notes, which sounds exactly as bad as it reads.
 *
 * Auto-fire means the shot sound plays six times a second for a hundred
 * seconds, so it is deliberately tiny — 25ms, low gain, and pitched away from
 * the theme's notes. A shooter's gun sound is the one place where "nice on its
 * own" and "nice six times a second" are different problems.
 */
import { CFG } from './config.js';

export function createAudio({ muted = false } = {}) {
  let ctx = null, master = null, sfxGain = null;
  let whine = null, whineGain = null;

  const A = CFG.audio;

  const api = {
    muted: !!muted,
    ready: false,
    ensure, setMuted, shot, podShot, charge, beam, pop, hit, power, bossRoar,
    bossHit, hurt, uiClick, attachTheme,
  };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = api.muted ? 0 : A.master;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = A.sfx;
      sfxGain.connect(master);
      api.ready = true;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setMuted(m) {
    api.muted = !!m;
    if (master) master.gain.setTargetAtTime(api.muted ? 0 : A.master, ctx.currentTime, 0.02);
    themeMuted(api.muted);
  }

  /* ------------------------------------------------------------ primitives */

  function tone(freq, dur, type, vol, endFreq, dest) {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), c.currentTime + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, vol, freq, q) {
    const c = ensure();
    if (!c) return;
    if (!noiseBuf) {
      // one second of noise, reused forever — building a buffer per explosion
      // is an allocation in the middle of the busiest frame there is
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq || 900, c.currentTime);
    f.Q.value = q === undefined ? 1 : q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  }

  /* --------------------------------------------------------------- the SFX */

  const L = A.levels;

  /* A little off the note, every time. Six identical clicks a second is a
     machine gun; six clicks a second that are each slightly different is a
     ship firing. */
  function vary() { return 1 + (Math.random() - 0.5) * A.pitchVary; }

  function shot() {
    const f = 760 * vary();
    tone(f, 0.042, 'square', L.shot, f * 0.55);
  }
  function podShot() {
    const f = 1020 * vary();
    tone(f, 0.038, 'triangle', L.podShot, f * 0.62);
  }
  function uiClick() { tone(520, 0.06, 'triangle', L.ui, 780); }

  /* An enemy taking a hit without dying: a tick, barely there, but the
     difference between shooting a thing and shooting past it. */
  function hurt() { tone(300 * vary(), 0.03, 'square', L.hurt, 220); }

  /* The charge whine is one oscillator held open for as long as the finger is
     still, so it has to be stoppable from anywhere. `on` false always lands. */
  function charge(on, level) {
    // Called every frame with false, which must not be the thing that creates
    // an AudioContext before the player has touched anything.
    if (!on && !whine) return;
    const c = ensure();
    if (!c) return;
    if (on) {
      if (!whine) {
        whine = c.createOscillator();
        whineGain = c.createGain();
        whine.type = 'sawtooth';
        whine.frequency.setValueAtTime(180, c.currentTime);
        whineGain.gain.setValueAtTime(0.0001, c.currentTime);
        whineGain.gain.exponentialRampToValueAtTime(L.charge, c.currentTime + 0.12);
        whine.connect(whineGain); whineGain.connect(sfxGain);
        whine.start();
      }
      whine.frequency.setTargetAtTime(180 + 900 * (level || 0), c.currentTime, 0.08);
    } else if (whine) {
      const w = whine, wg = whineGain;
      whine = null; whineGain = null;
      wg.gain.cancelScheduledValues(c.currentTime);
      wg.gain.setTargetAtTime(0.0001, c.currentTime, 0.03);
      w.stop(c.currentTime + 0.16);
    }
  }

  /* The Wave Cannon. Loud FOR this game, because it happens about twice a
     minute and it is the biggest thing the player can do. */
  function beam(level) {
    tone(220 + 140 * level, 0.42, 'sawtooth', L.beam, 70);
    tone(880 + 400 * level, 0.30, 'triangle', L.beam * 0.7, 180);
    noise(0.3, L.beam * 0.7, 1400, 0.8);
  }

  function pop(big) {
    const v = big ? L.popBig : L.pop;
    const f = (big ? 220 : 380) * vary();
    tone(f, big ? 0.24 : 0.12, 'square', v, big ? 70 : 120);
    noise(big ? 0.26 : 0.12, v * 0.9, big ? 600 : 1100, 0.7);
  }

  /* The weak point. Pitched away from everything else so that in the middle of
     a boss pattern you can hear that you are hitting the right thing. */
  function bossHit() { tone(150 * vary(), 0.07, 'square', L.bossHit, 90); }

  function hit() {
    tone(300, 0.45, 'sine', L.hit, 70);
    tone(150, 0.5, 'square', L.hit * 0.5, 45);
    noise(0.35, L.hit * 0.55, 400, 0.5);
  }

  function power() {
    tone(523.25, 0.1, 'sine', L.power);
    setTimeout(() => tone(659.25, 0.1, 'sine', L.power), 70);
    setTimeout(() => tone(783.99, 0.16, 'sine', L.power * 1.1), 140);
  }

  function bossRoar() {
    tone(70, 1.1, 'sawtooth', L.roar, 42);
    tone(105, 1.0, 'square', L.roar * 0.5, 60);
    noise(1.0, L.roar * 0.7, 300, 0.4);
  }

  /* The theme is not generated. It is a file, wired in index.html and started
     by main.js's music() on the first gesture — see knowledge/audio-patterns.md.
     Muting from the M key reaches it through `themeEl`. */
  let themeEl = null;
  function attachTheme(el) { themeEl = el; }
  function themeMuted(m) { if (themeEl) themeEl.muted = !!m; }

  return api;
}
