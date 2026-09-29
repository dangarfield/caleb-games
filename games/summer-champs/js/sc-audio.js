// Summer Champs: audio. One AudioContext for the theme tune and the SFX.
//
// Theme (knowledge/audio-patterns.md): one quiet looping tune, no mute, no music setting.
// It plays the whole time and DUCKS while an event wants the player's input (startEvent),
// coming back up when the event finishes, is paused or is quit.
//
// The <audio> element is routed through a GainNode rather than using el.volume, because
// iPad Safari ignores el.volume (it is read-only there); a GainNode works everywhere.
const LEVEL = 0.5;      // normal level, on top of the 6dB already taken off in the encode
const DUCKED = 0.14;    // while the player is doing an event (about -11dB under LEVEL)
const RAMP = 0.35;      // seconds (time constant) for duck / unduck

let ctx = null, musicGain = null, sfxGain = null, wantDuck = false, playing = false, sfxOn = true;

export function audioCtx(){
  if (!ctx){
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = ctx.createGain(); sfxGain.gain.value = 1; sfxGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** Where SFX connect. Silent when the SOUND EFFECTS setting is off (music is unaffected). */
export function sfxOut(){ audioCtx(); return sfxGain; }
export function setSfx(on){ sfxOn = !!on; }
export function sfxEnabled(){ return sfxOn; }

/** Tiny tone, the old sfx() beep, kept for UI taps until real sounds land (see SOUND-SUGGESTIONS.md). */
export function beep(f = 660, d = 0.06, type = 'square', v = 0.05){
  if (!sfxOn) return;
  try {
    const c = audioCtx(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d);
    o.connect(g).connect(sfxGain); o.start(); o.stop(c.currentTime + d);
  } catch {}
}

/** Duck the theme while an event needs input (true) and bring it back after (false). */
export function duckMusic(on){
  wantDuck = !!on;
  if (!musicGain) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setTargetAtTime(wantDuck ? DUCKED : LEVEL, t, RAMP);
}

/** Arm the theme: it starts on the first gesture that grants user activation. */
export function initMusic(){
  const el = document.getElementById('theme');
  if (!el) return;
  // pointerdown / touchstart do NOT grant activation on a touch screen; the others do.
  const EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  const arm = () => EVENTS.forEach(e => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach(e => document.removeEventListener(e, start, true));
  function route(){
    if (musicGain) return;
    const c = audioCtx();
    musicGain = c.createGain(); musicGain.gain.value = wantDuck ? DUCKED : LEVEL;
    c.createMediaElementSource(el).connect(musicGain).connect(c.destination);
  }
  function start(){
    if (playing) return;                         // stay armed until it is really playing
    try { route(); } catch {}
    let p; try { p = el.play(); } catch { return; }   // never el.load() first: it aborts the play
    if (p && p.then) p.then(() => { playing = true; disarm(); }, () => {});
    else { playing = true; disarm(); }
  }
  document.addEventListener('visibilitychange', () => {
    if (!playing) return;
    if (document.hidden) el.pause();
    else { if (ctx && ctx.state === 'suspended') ctx.resume(); el.play().catch(() => {}); }
  });
  arm();
}
/** For checks in the console: { playing, ducked, gain }. */
export const musicState = () => ({ playing, ducked: wantDuck, gain: musicGain ? +musicGain.gain.value.toFixed(3) : null });
