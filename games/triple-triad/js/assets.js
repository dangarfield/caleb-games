/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han.  GNU GPL v3 — see ./LICENSE.
 *
 * Card art from FFVIII mods by MCINDUS (Tripod v1.1, SeeD Reborn v3.2).
 * Sound effects extracted by TekkamanChronos.  Music is property of Square Enix
 * and is streamed from the original project's site rather than bundled.
 *
 * js/assets.js — image loading (card art is lazy, 110 files is 11MB), sprite
 * sheet frame lookup, Web Audio sound effects and the optional BGM stream.
 */
'use strict';

(function (TT) {

  /* Every asset URL goes through here. currentScript.src is the URL the browser
   * actually resolved for this file, so it survives being served from a path
   * without a trailing slash (a bug that bit Stars). */
  TT.BASE = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return s.src.replace(/js\/[^/]*$/, '');
    } catch (e) { /* ignore */ }
    var p = '';
    try { p = location.pathname || ''; } catch (e) { p = ''; }
    if (p && !/\/$/.test(p) && !/\.html?$/i.test(p)) p += '/';
    return p.replace(/[^/]*$/, '');
  })();
  TT.url = function (rel) { return TT.BASE + rel; };

  /* ------------------------------------------------------------------ images */
  var IMG = {
    board: 'img/board-mat.jpg',
    cardBack: 'img/card-back.png',
    cardFrames: 'img/card.png',      // 256x768 -> [0] red, [1] blue, [2] grey
    rank: 'img/rank.png',            // 32x308  -> 11 frames of 32x28, ranks 0..10
    bonus: 'img/bonus.png',          // 96x128  -> [0] +1, [1] -1
    element: 'img/element.png'       // 64x2048 -> 32 frames of 64x64
  };
  TT.img = {};
  var pending = 0;
  var onAssetLoad = null;
  TT.onAssetLoad = function (fn) { onAssetLoad = fn; };

  function loadImage(key, rel) {
    var im = new Image();
    im.decoding = 'async';
    pending++;
    im.addEventListener('load', function () {
      im._ok = true; pending--;
      if (onAssetLoad) onAssetLoad();
    });
    // A missing image must never break the game — everything that draws one
    // checks _ok first and falls back to a flat colour.
    im.addEventListener('error', function () { im._ok = false; pending--; });
    im.src = TT.url(rel);
    TT.img[key] = im;
    return im;
  }
  Object.keys(IMG).forEach(function (k) { loadImage(k, IMG[k]); });
  TT.imagesPending = function () { return pending; };

  /* Card art is loaded on first use: the card viewer would otherwise pull 11MB
   * of PNGs before it drew a single tile. */
  var art = {};
  TT.getArt = function (id) {
    var im = art[id];
    if (im) return im._ok ? im : null;
    im = art[id] = new Image();
    im.decoding = 'async';
    im.addEventListener('load', function () { im._ok = true; if (onAssetLoad) onAssetLoad(); });
    im.addEventListener('error', function () { im._ok = false; });
    im.src = TT.url(TT.cardArt(id));
    return null;
  };
  /* Warm the cache for cards that are about to appear (a hand, a reward row). */
  TT.preloadArt = function (ids) { (ids || []).forEach(function (id) { TT.getArt(id); }); };

  /* Sprite frame helpers — source rectangles inside the sheets. */
  TT.frameCard = function (i) { return { x: 0, y: i * 256, w: 256, h: 256 }; };
  TT.frameRank = function (r) { return { x: 0, y: Math.max(0, Math.min(10, r)) * 28, w: 32, h: 28 }; };
  TT.frameBonus = function (i) { return { x: 0, y: i * 64, w: 96, h: 64 }; };
  TT.frameElement = function (elementId, animFrame) {
    var base = TT.ELEMENT_FRAME[elementId];
    if (base < 0) return null;
    return { x: 0, y: (base + (animFrame % 4)) * 64, w: 64, h: 64 };
  };

  /* Draw a sprite sheet frame, or nothing if the sheet failed to load. */
  TT.drawFrame = function (ctx, img, f, x, y, w, h) {
    if (!img || !img._ok || !f) return false;
    ctx.drawImage(img, f.x, f.y, f.w, f.h, x, y, w, h);
    return true;
  };

  /* ------------------------------------------------------------------- audio
   * Sound is always on: there is no mute state anywhere in the build, so it can
   * never get stuck off.  The seven original SFX are fetched at boot (bytes need
   * no gesture) and decoded as soon as an AudioContext exists, which happens on
   * the very first gesture anywhere on the page.  Anything that fails — blocked
   * fetch over file://, a codec the browser dislikes — falls back to a
   * synthesised tone, so every cue always makes a sound.
   */
  var SFX = {
    card:    'sounds/sound-card.wav',
    select:  'sounds/sound-select.wav',
    turn:    'sounds/sound-turn.wav',
    start:   'sounds/sound-start.wav',
    invalid: 'sounds/sound-invalid.wav',
    special: 'sounds/sound-special.wav',
    back:    'sounds/sound-back.wav'
  };
  /* The extracted wavs are mastered very quietly (peaks 0.12 - 0.30 of full
   * scale), so these gains are boosts, not cuts: they bring every cue up to
   * roughly the same ~0.5 peak, which is actually audible on a phone speaker.
   * A compressor on the master bus catches any overlap. */
  var VOL = { card: 3.4, select: 2.1, turn: 2.8, start: 3.4, invalid: 1.9, special: 1.9, back: 4.4 };
  var buffers = {};      // name -> AudioBuffer (decoded) or null (use the synth)
  var rawBytes = {};     // name -> ArrayBuffer waiting for a context to decode it
  var settled = {};      // name -> true once decode has resolved either way
  var decodedCount = 0, failedCount = 0, startedCount = 0;
  var ac = null;
  var master = null;
  var unlocked = false;
  var activated = false;         // a gesture that actually grants user activation
  var pendingCue = null;         // a cue asked for before the context existed

  /* A context created outside user activation starts suspended and Chrome logs
   * "The AudioContext was not allowed to start...".  On touch, pointerdown does
   * NOT grant activation (only pointerup / touchend / mousedown / keydown /
   * click do), which is exactly how that warning happened: the first tap's
   * pointerdown handler built the context.  So creation waits for a genuine
   * activation; a press before that just remembers its cue. */
  function hasActivation() {
    try {
      if (navigator.userActivation && typeof navigator.userActivation.isActive === 'boolean') {
        return navigator.userActivation.isActive || activated;
      }
    } catch (e) { /* ignore */ }
    return activated;
  }

  function ensureAudio() {
    try {
      if (!ac && !hasActivation()) return null;
      if (!ac) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ac = new Ctor();
        master = ac.createGain();
        master.gain.value = 0.9;
        var tail = master;
        try {
          // soft limiter so boosted cues landing together never clip
          var comp = ac.createDynamicsCompressor();
          comp.threshold.value = -8;
          comp.knee.value = 12;
          comp.ratio.value = 8;
          master.connect(comp);
          tail = comp;
        } catch (e) { /* no compressor: master goes straight out */ }
        tail.connect(ac.destination);
        decodePending();
      }
      if (ac.state !== 'running') { try { ac.resume(); } catch (e) { /* ignore */ } }
    } catch (e) { ac = null; }
    return ac;
  }
  TT.ensureAudio = ensureAudio;

  /* Called from every activation gesture, not just the first: iOS can ignore the
   * first resume(), and the OS can suspend a running context at any time.  The
   * one-sample silent buffer is the classic iOS unlock. */
  function unlockAudio() {
    activated = true;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (!unlocked) {
      unlocked = true;
      try {
        var s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(master);
        s.start(0);
      } catch (e) { /* ignore */ }
    }
    // a cue from the press that preceded this release still gets to be heard
    if (pendingCue && Date.now() - pendingCue.t < 600) {
      var n = pendingCue.name; pendingCue = null;
      play(n, false);
    }
    pendingCue = null;
  }
  TT.unlockAudio = unlockAudio;
  /* Historic name, kept because the player-select handler calls both and any of
   * them is enough: create, resume, decode. */
  TT.loadSfx = unlockAudio;

  /* Belt and braces: any activation-granting gesture anywhere on the page wakes
   * the audio, in the capture phase so the context is already running by the
   * time a canvas handler asks for a sound.  pointerdown/touchstart only nudge a
   * context that already exists — they cannot create one (see hasActivation). */
  ['pointerup', 'touchend', 'mousedown', 'click', 'keydown'].forEach(function (ev) {
    try {
      document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
    } catch (e) { document.addEventListener(ev, unlockAudio, true); }
  });
  ['pointerdown', 'touchstart'].forEach(function (ev) {
    try {
      document.addEventListener(ev, function () { if (ac) ensureAudio(); },
                                { capture: true, passive: true });
    } catch (e) { /* ignore */ }
  });

  function settle(name, buf) {
    if (settled[name]) return;
    settled[name] = true;
    if (buf) { buffers[name] = buf; decodedCount++; }
    else { buffers[name] = null; failedCount++; }
  }
  function decodeOne(name) {
    var bytes = rawBytes[name];
    if (!bytes || !ac || settled[name]) return;
    rawBytes[name] = null;           // decodeAudioData consumes the ArrayBuffer
    try {
      // callback form for Safari, which still lacks the promise overload
      var p = ac.decodeAudioData(bytes,
        function (b) { settle(name, b); },
        function () { settle(name, null); });
      if (p && p.then) p.then(function (b) { settle(name, b); }, function () { settle(name, null); });
    } catch (e) { settle(name, null); }
  }
  function decodePending() {
    Object.keys(SFX).forEach(decodeOne);
  }
  /* Bytes first: fetching needs no gesture, so by the time a kid taps anything
   * the samples are usually already in memory and the first cue is the real one. */
  Object.keys(SFX).forEach(function (name) {
    try {
      fetch(TT.url(SFX[name]))
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(function (b) { rawBytes[name] = b; decodeOne(name); })
        .catch(function () { settle(name, null); });   // silent: synth takes over
    } catch (e) { settle(name, null); }
  });

  function tone(freq, dur, type, vol, endFreq) {
    var ctx = ensureAudio(); if (!ctx) return;
    try {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g); g.connect(master);
      osc.start(); osc.stop(ctx.currentTime + dur);
      startedCount++;
    } catch (e) { /* ignore */ }
  }
  TT.tone = tone;

  var FALLBACK = {
    card:    function () { tone(320, 0.07, 'square', 0.16, 210); },
    select:  function () { tone(700, 0.05, 'triangle', 0.16); },
    turn:    function () { tone(520, 0.09, 'triangle', 0.2); setTimeout(function () { tone(780, 0.1, 'triangle', 0.15); }, 60); },
    start:   function () { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { tone(f, 0.16, 'triangle', 0.2); }, i * 90); }); },
    invalid: function () { tone(170, 0.12, 'square', 0.16, 120); },
    special: function () { [660, 880, 1175].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'sine', 0.2); }, i * 70); }); },
    back:    function () { tone(300, 0.06, 'sine', 0.14, 200); }
  };

  function play(name, retried) {
    var ctx = ensureAudio();
    if (!ctx) {
      // pressed before any activation: play it the moment the context comes up
      pendingCue = { name: name, t: Date.now() };
      return;
    }
    var buf = buffers[name];
    if (!buf) {
      /* The context only exists from the first gesture, so that gesture's own cue
       * can arrive with the decode still in flight.  Give it one 80ms beat —
       * inaudible as latency — rather than firing the synth over a sample that
       * is about to be ready.  Either way exactly one sound plays. */
      if (!settled[name] && !retried) { setTimeout(function () { play(name, true); }, 80); return; }
      (FALLBACK[name] || FALLBACK.select)();
      return;
    }
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var g = ctx.createGain();
      g.gain.value = VOL[name] === undefined ? 2 : VOL[name];
      src.connect(g); g.connect(master);
      src.start();
      startedCount++;
    } catch (e) { (FALLBACK[name] || FALLBACK.select)(); }
  }
  TT.sfx = function (name) { play(name, false); };

  /* Introspection for the test harness (and for a quick console sanity check). */
  TT.audioDebug = function () {
    var pending = 0;
    Object.keys(SFX).forEach(function (n) { if (!settled[n]) pending++; });
    return {
      state: ac ? ac.state : 'none',
      masterGain: master ? master.gain.value : 0,
      unlocked: unlocked,
      activated: activated,
      decoded: decodedCount,
      failed: failedCount,
      pending: pending,
      started: startedCount
    };
  };

  /* ------------------------------------------------------------------- music
   * The 4MB FFVIII track is NOT bundled. It streams from the original project's
   * GitHub Pages site (CORS *). Offline, the promise rejection and the media
   * error event are both swallowed, so the game just plays without music.
   */
  var BGM_URL = 'https://itdelatrisu.github.io/triple-triad-html5/sounds/bgm.mp3';
  var bgm = null;
  var bgmWanted = false;
  TT.startBgm = function () {
    bgmWanted = true;
    try {
      if (!bgm) {
        bgm = new Audio();
        bgm.loop = true;
        bgm.volume = 0.28;
        bgm.preload = 'auto';
        bgm.addEventListener('error', function () { bgm = null; });
        bgm.src = BGM_URL;
      }
      var p = bgm.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked or offline */ });
    } catch (e) { bgm = null; }
  };
  TT.stopBgm = function () {
    bgmWanted = false;
    try { if (bgm) bgm.pause(); } catch (e) { /* ignore */ }
  };
  /* Pause while the tab is hidden without forgetting that music was wanted. */
  TT.pauseBgm = function () { try { if (bgm) bgm.pause(); } catch (e) { /* ignore */ } };
  TT.resumeBgm = function () { if (bgmWanted) TT.startBgm(); };

})(window.TT || (window.TT = {}));
