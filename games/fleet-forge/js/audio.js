/* audio.js — two themes that cross-fade, and a bank of generated UI cues.
 *
 * THE THEMES ARE FILES, THE CUES ARE NOT.
 * `knowledge/audio-patterns.md` is the house rule: SFX are generated at runtime
 * so a game ships no sound assets, and a theme tune is the exception — encoded
 * to Opus/WebM at 48k with 6dB taken off on the way through, so the file itself
 * is at background level and nothing has to be turned down in JS.
 *
 * MUTE IS THE MUSIC ONLY. The button silences the themes and leaves the cues
 * alone: a tap, a launch and an explosion still answer you, because they are
 * feedback for what you just did, and a player turning the music off in a
 * waiting room is not asking for the buttons to go dead too. Every music
 * volume this file writes goes through `level()`, so nothing can fade a muted
 * track back up behind the switch's back — which is the bug a `muted` flag
 * checked in three places always becomes. The cue bus is not in that path at
 * all now, which is what keeps the two separable.
 *
 * WHERE THIS DEPARTS FROM THE HOUSE RULE
 * The rule says one tune, looping, no fades. Fleet Forge has two — a hangar
 * theme for everything you do between fights and a battle theme for the arena —
 * and Dan asked for them to cross-fade rather than cut. So `Music.play(name)`
 * runs both elements for four seconds, one up and one down, and there is a fade
 * where the rule says there should not be. It also has a mute button, which the
 * rule does not mention. Everything else holds: no volume slider, `loop` on the
 * elements, paused on visibilitychange, and nothing is fetched until the first
 * gesture that could play it.
 *
 * THE CUES ARE PLACEHOLDERS AND ARE MEANT TO BE REPLACED
 * Every one is a couple of oscillators and a filtered noise burst. They are
 * catalogued in `docs/game-fleet-forge-audio.md` with what each is for and where
 * it fires, so swapping the bank for real recordings is a change to this file
 * and nothing else. Add a cue by adding a key to CUES; call it by its name.
 */
var Audio2 = (function () {
  'use strict';

  /* ---- the shared context ---------------------------------------------- */
  var ctxA = null, bus = null;
  var CUE_LEVEL = 0.55;               /* how loud every generated cue is */
  var muted = false;                  /* THE MUSIC's mute, not the cues'      */

  function ensure() {
    if (!ctxA) {
      try {
        ctxA = new (window.AudioContext || window.webkitAudioContext)();
        bus = ctxA.createGain();
        /* One place to set how loud every generated cue is, so a cue is written
           at a sensible relative level and never at an absolute one. */
        bus.gain.value = CUE_LEVEL;
        bus.connect(ctxA.destination);
      } catch (e) { ctxA = null; }
    }
    if (ctxA && ctxA.state === 'suspended') ctxA.resume();
    return ctxA;
  }

  /* ---- the two primitives every cue is made of -------------------------
     `cueDelay` shifts a whole cue on the audio clock rather than on a timer,
     so "play this half a second after that one" costs no setTimeout and stays
     in sync if the main thread stutters. */
  var cueDelay = 0;

  function tone(freq, dur, type, vol, endFreq, delay) {
    var c = ensure(); if (!c) return;
    var t0 = c.currentTime + cueDelay + (delay || 0);
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(gain); gain.connect(bus);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q, delay, endFreq) {
    var c = ensure(); if (!c) return;
    var t0 = c.currentTime + cueDelay + (delay || 0);
    var n = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq || 900, t0);
    if (endFreq) filt.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 40), t0 + dur);
    filt.Q.value = q || 1;
    var gain = c.createGain();
    gain.gain.setValueAtTime(vol || 0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(filt); filt.connect(gain); gain.connect(bus);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---- the catalogue ----------------------------------------------------
     Keep them SHORT and QUIET. These fire on every tap, under a looping tune,
     on a tablet held by a child. Anything longer than about a fifth of a second
     stops being feedback and starts being a noise the game makes at you. */
  var CUES = {
    /* --- the everyday ones, one per kind of press --- */
    tap:     function () { tone(1180, 0.045, 'square', 0.028, 1480); },
    select:  function () { tone(760, 0.06, 'triangle', 0.05, 1140);
                           noise(0.05, 0.02, 2600, 2.0); },
    toggle:  function () { tone(920, 0.05, 'square', 0.035, 1220);
                           tone(1380, 0.05, 'square', 0.018, null, 0.035); },
    back:    function () { tone(700, 0.08, 'triangle', 0.045, 420); },
    deny:    function () { tone(200, 0.16, 'sawtooth', 0.05, 130);
                           noise(0.10, 0.03, 340, 1.2); },

    /* --- menus --- */
    open:    function () { tone(420, 0.16, 'sine', 0.05, 1260);
                           noise(0.16, 0.022, 700, 0.8, 0, 2600); },
    close:   function () { tone(1180, 0.13, 'sine', 0.042, 420);
                           noise(0.12, 0.018, 2400, 0.8, 0, 600); },
    confirm: function () { [740, 988, 1318].forEach(function (f, i) {
                             tone(f, 0.13, 'triangle', 0.05, null, i * 0.045); }); },

    /* --- the fitting bay --- */
    grab:    function () { tone(540, 0.05, 'square', 0.035, 700); },
    place:   function () { tone(300, 0.07, 'square', 0.045, 190);
                           noise(0.06, 0.04, 1100, 1.6); },
    strip:   function () { noise(0.20, 0.05, 1800, 0.7, 0, 260);
                           tone(420, 0.16, 'sawtooth', 0.04, 110); },
    autofit: function () { [520, 700, 940, 1260].forEach(function (f, i) {
                             tone(f, 0.10, 'square', 0.03, null, i * 0.05); });
                           noise(0.32, 0.02, 900, 0.7, 0, 3200); },

    /* --- the arena --- */
    launch:  function () { tone(160, 0.55, 'sawtooth', 0.06, 620);
                           noise(0.55, 0.035, 300, 0.6, 0, 2400); },
    win:     function () { [523, 659, 784, 1047].forEach(function (f, i) {
                             tone(f, 0.26, 'triangle', 0.06, null, i * 0.09); }); },
    lose:    function () { [440, 349, 262].forEach(function (f, i) {
                             tone(f, 0.34, 'sine', 0.06, null, i * 0.13); });
                           noise(0.5, 0.025, 260, 0.7); },
    levelup: function () { [659, 880, 1175, 1568].forEach(function (f, i) {
                             tone(f, 0.30, 'triangle', 0.055, null, i * 0.075); });
                           noise(0.42, 0.018, 1600, 0.9, 0.05, 5200); }
  };

  /* A cue is fire-and-forget: an unknown name is silence, never a throw, so a
     call site can name a cue that does not exist yet without taking the game
     down with it. */
  function play(name, delay) {
    var fn = CUES[name];
    if (!fn) return;
    cueDelay = delay || 0;
    try { fn(); } catch (e) {}
    cueDelay = 0;
  }

  /* ---- the themes ------------------------------------------------------- */
  var TRACKS = { hangar: null, battle: null };
  var current = '', armed = false, playing = false, fadeTimer = 0;
  var LEVEL = 0.5;                       /* on top of the 6dB off the files */
  var FADE_MS = 4000;

  /* The one place a theme's target volume comes from. Muting is a change to
     this, so a fade already in flight lands on silence instead of fighting it. */
  function level() { return muted ? 0 : LEVEL; }

  function el(name) {
    if (!TRACKS[name]) TRACKS[name] = document.getElementById('music-' + name);
    return TRACKS[name];
  }

  /* Both elements move together: whichever is wanted goes up, everything else
     goes down, and anything that reaches zero is paused so a finished fade is
     not two decoders running for nothing. */
  function fadeTo(name) {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
    var t0 = Date.now();
    fadeTimer = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / FADE_MS);
      for (var n in TRACKS) {
        var a = el(n); if (!a) continue;
        var want = (n === name) ? level() : 0;
        var from = a.__from === undefined ? a.volume : a.__from;
        a.volume = Math.max(0, Math.min(1, from + (want - from) * k));
        if (k >= 1) {
          a.__from = undefined;
          if (n !== name) { a.pause(); a.currentTime = 0; }
        }
      }
      if (k >= 1) { clearInterval(fadeTimer); fadeTimer = 0; }
    }, 40);
  }

  /* Ask for a theme. Safe to call every time a screen is entered — asking for
     the one already playing does nothing.

     THE LAST CALLER IN A TICK WINS, and no fade starts for the ones before it.
     This matters because tearing a screen down and putting the next one up is
     two calls in one tick and the FIRST of them is usually wrong: ending a
     fight does `App.pop()`, which resumes the hangar underneath and asks for
     the hangar theme, and only then pushes the result screen, which asks for
     the battle theme back. Acting on the intermediate value starts a four
     second cross-fade that the next statement immediately reverses — inaudible
     at 60fps, a real swell when timers are coarse, and a bug waiting for
     whoever adds a third screen to that sequence. So the ask is recorded and
     applied once, on a microtask, after the tick that made it has finished. */
  var wanted = null, queued = false;

  function music(name) {
    wanted = name;
    if (queued) return;
    queued = true;
    Promise.resolve().then(apply);
  }

  function apply() {
    queued = false;
    var name = wanted;
    if (name === null || name === current) return;
    current = name;
    if (!playing) return;                /* not started yet; `start` will honour it */
    var a = el(name);
    if (a) {
      /* An element that is not already sounding starts SILENT — its default
         volume is 1, and fading "in" from there is a four-second fade DOWN to
         background level, which is the opposite of the ask and startlingly
         loud on the first frame. */
      if (a.paused) a.volume = 0;
      for (var n in TRACKS) { var b = el(n); if (b) b.__from = b.volume; }
      a.play().catch(function () {});
      fadeTo(name);
    }
  }

  /* pointerdown and touchstart do NOT grant user activation on a touch screen —
     only pointerup, touchend, click and keydown do. Arming the first two alone
     is the "music needs two taps" bug, and it does not show on a desktop mouse. */
  var EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];

  function start() {
    if (playing) return;                 /* stay armed until it really plays */
    ensure();                            /* the same gesture unlocks the cues */
    var a = el(current || 'hangar');
    if (!a) return;
    a.volume = level();
    var p;
    try { p = a.play(); } catch (e) { return; }
    function ok() {
      playing = true;
      EVENTS.forEach(function (e2) { document.removeEventListener(e2, start, true); });
    }
    if (p && p.then) p.then(ok, function () {}); else ok();
  }

  /* Mute is immediate: every theme element drops, whether or not a fade is
     running. Unmuting brings the current theme straight back rather than
     fading, because the player just asked for sound and waiting four seconds
     for it reads as broken. The cue bus is deliberately untouched — this
     switch is the music's. */
  function setMuted(on) {
    muted = !!on;
    for (var n in TRACKS) {
      var a = el(n); if (!a) continue;
      a.__from = undefined;
      if (muted) a.volume = 0;
      else if (n === current) {
        a.volume = LEVEL;
        if (playing && a.paused) a.play().catch(function () {});
      }
    }
    return muted;
  }

  function arm() {
    if (armed) return;
    armed = true;
    current = current || 'hangar';
    EVENTS.forEach(function (e) { document.addEventListener(e, start, true); });
    document.addEventListener('visibilitychange', function () {
      if (!playing) return;              /* never started; leave it alone */
      for (var n in TRACKS) {
        var a = el(n); if (!a) continue;
        if (document.hidden) a.pause();
        else if (n === current) a.play().catch(function () {});
      }
    });
  }

  return { arm: arm, music: music, play: play, cues: CUES,
           setMuted: setMuted, muted: function () { return muted; } };
})();

/* Short names, because these are called from everywhere. */
var Sfx = { play: function (n, d) { Audio2.play(n, d); } };
var Music = { to: function (n) { Audio2.music(n); }, arm: function () { Audio2.arm(); },
              mute: function (on) { return Audio2.setMuted(on); },
              muted: function () { return Audio2.muted(); } };
