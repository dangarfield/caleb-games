/* mmm-leaves — audio.js
   The theme is a file (research/mmm-leaves.m4a, encoded to Opus/WebM at 48k with
   6dB taken off on the way through, per knowledge/audio-patterns.md). The little
   noises are generated at runtime, so there are no other audio assets.

   No mute button and no volume slider, by house rule: one tune, quiet, looping. */

var Sfx = (function () {
  'use strict';

  var ctxA = null;

  function ensure() {
    if (!ctxA) {
      try { ctxA = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctxA = null; }
    }
    if (ctxA && ctxA.state === 'suspended') ctxA.resume();
    return ctxA;
  }

  function tone(freq, dur, type, vol, endFreq, delay) {
    var c = ensure(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t0 + dur);
    gain.gain.setValueAtTime(vol || 0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, q) {
    var c = ensure(); if (!c) return;
    var buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var gain = c.createGain();
    gain.gain.setValueAtTime(vol || 0.05, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    var filt = c.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq || 900; filt.Q.value = q || 1;
    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start(); src.stop(c.currentTime + dur);
  }

  /* Kept deliberately small and soft — these fire dozens of times a game and sit
     under a looping tune. */
  var CUES = {
    flip:     function () { noise(0.10, 0.05, 1600, 1.4); tone(520, 0.09, 'triangle', 0.05, 760); },
    pick:     function () { tone(660, 0.07, 'sine', 0.05); },
    crawl:    function () { noise(0.26, 0.022, 500, 0.8); },
    chew:     function () { noise(0.07, 0.06, 420, 2.2); noise(0.06, 0.05, 700, 2.2, 0.09); },
    stamp:    function () { tone(880, 0.09, 'sine', 0.06, 1180); },
    extra:    function () { [784, 988, 1319].forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.07, null, i * 0.07); }); },
    achieve:  function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.07, null, i * 0.09); }); },
    roundEnd: function () { [523, 659, 784].forEach(function (f, i) { tone(f, 0.28, 'sine', 0.07, null, i * 0.12); }); },
    gameOver: function () { [880, 740, 587, 440].forEach(function (f, i) { tone(f, 0.34, 'sine', 0.08, null, i * 0.16); }); },
    tap:      function () { tone(440, 0.05, 'sine', 0.04); },
    nope:     function () { tone(200, 0.10, 'sine', 0.05, 150); }
  };

  function init() { ensure(); }
  function play(cue) { var fn = CUES[cue]; if (fn) { try { fn(); } catch (e) { /* never break play */ } } }

  /* ---- the theme ---- */

  var kick = null;              // lets the game retry the start inside its own handler

  function music() {
    var el = document.getElementById('theme');
    if (!el) return;
    var LEVEL = 0.5;                       // on top of the 6dB already off the file
    var playing = false;

    /* `pointerdown` does not reliably count as a user activation — for a touch
       pointer the spec only grants it on pointerup/touchend, which is why the
       first tap did nothing and the second one worked. Listen for the whole
       family and stay armed until the track is actually running, so the tap that
       starts the game is the tap that starts the music. */
    var EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];

    function arm()    { EVENTS.forEach(function (e) { document.addEventListener(e, start, true); }); }
    function disarm() { EVENTS.forEach(function (e) { document.removeEventListener(e, start, true); }); }

    function start() {
      if (playing) return;
      el.volume = LEVEL;
      var p;
      // no el.load() — with preload="none" it aborts the play that follows it
      try { p = el.play(); } catch (e) { return; }
      if (p && p.then) p.then(function () { playing = true; disarm(); }, function () {});
      else { playing = true; disarm(); }
    }

    document.addEventListener('visibilitychange', function () {
      if (!playing) return;
      if (document.hidden) el.pause();
      else el.play().catch(function () {});
    });

    kick = start;
    arm();
  }

  /* The game's own pointer handler calls this too, so a single tap gets three
     attempts — pointerdown, whatever the game does with it, then pointerup and
     click — instead of one. Cheap, and it stops a failed first attempt from
     costing the player a tap. */
  function startMusic() { if (kick) kick(); }

  return { init: init, play: play, music: music, startMusic: startMusic, isEnabled: function () { return true; } };
})();
