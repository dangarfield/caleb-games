/* sfx.js: Moonbots sound effects, all generated with Web Audio (no files).
   SFX.bind(ctx, gainNode) once after a user gesture, then SFX.play('name'). */
(function () {
  var ctx = null, out = null, last = {};
  var BOOST = 3.5; // overall SFX loudness; a compressor stops the louder stacks from clipping
  function bind(c, dest) {
    ctx = c;
    var g = c.createGain(); g.gain.value = BOOST;
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    g.connect(comp); comp.connect(dest); out = g;
  }
  function T() { return ctx.currentTime; }
  function tone(f, d, type, v, f2, delay) {
    var t = T() + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v || 0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v, freq, q, delay, ftype) {
    var t = T() + (delay || 0), n = Math.max(1, Math.floor(ctx.sampleRate * d)), buf = ctx.createBuffer(1, n, ctx.sampleRate), a = buf.getChannelData(0);
    for (var i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource(); s.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = ftype || 'bandpass'; f.frequency.value = freq || 800; f.Q.value = q || 1;
    var g = ctx.createGain(); g.gain.setValueAtTime(v || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + d + 0.02);
  }
  var seq = function (notes, step, type, v, d) { notes.forEach(function (f, i) { tone(f, d || step * 1.6, type, v, null, i * step); }); };
  var S = {
    pick:   function () { tone(520, .09, 'triangle', .1, 820); },
    drop:   function () { tone(420, .07, 'square', .05, 260); noise(.06, .05, 1400); },
    snap:   function () { tone(300, .14, 'sine', .09, 170); },
    tap:    function () { tone(880, .05, 'square', .04); },
    build:  function () { noise(.12, .07, 300, 1, 0, 'lowpass'); seq([523, 659, 784], .07, 'triangle', .1); },
    expand: function () { seq([392, 523, 659, 784], .06, 'square', .05); },
    stage:  function () { seq([523, 659, 784, 1047], .09, 'triangle', .12, .25); noise(.3, .04, 4000, .7, .2, 'highpass'); },
    fanfare:function () { seq([523, 523, 659, 784, 659, 784, 1047], .11, 'square', .07, .2); seq([262, 330, 392, 523], .2, 'triangle', .08, .4); },
    clamp:  function () { noise(.08, .14, 200, 1, 0, 'lowpass'); tone(110, .2, 'square', .08, 60); tone(1200, .08, 'triangle', .05, null, .05); },
    merge:  function () { tone(300, .35, 'sine', .1, 900); tone(600, .3, 'triangle', .06, 1600, .05); seq([1047, 1319], .08, 'triangle', .08, .2); },
    upgrade:function () { seq([659, 880, 1175], .07, 'triangle', .09); },
    belt:   function () { tone(200, .12, 'sawtooth', .04, 400); noise(.12, .05, 2000); },
    retract:function () { tone(500, .3, 'sawtooth', .035, 140); },
    warn:   function () { tone(180, .5, 'sine', .08, 120); },
    crack:  function () { noise(.35, .2, 400, .6, 0, 'lowpass'); tone(90, .3, 'square', .07, 40); },
    fix:    function () { seq([392, 523, 784], .06, 'square', .05); noise(.05, .06, 3000, 1, .2); },
    toast:  function () { seq([660, 520], .09, 'triangle', .07); },
    harvest:function () { tone(700, .08, 'triangle', .09, 1100); tone(1100, .1, 'triangle', .07, null, .07); },
    crateLand: function () { tone(900, .5, 'sine', .04, 400); noise(.15, .12, 250, 1, .45, 'lowpass'); },
    crateOpen: function () { noise(.1, .08, 1800); seq([784, 988, 1175], .06, 'triangle', .08, .2); },
    quake:  function () { noise(1.1, .25, 90, .5, 0, 'lowpass'); tone(50, 1, 'sine', .15, 35); },
    coin:   function () { tone(988, .06, 'square', .06); tone(1319, .18, 'square', .06, null, .06); },
    order:  function () { seq([784, 988, 1319], .07, 'square', .05); },
    powerOn:function () { tone(120, .3, 'sawtooth', .06, 440); },
    powerOff:function () { tone(440, .3, 'sawtooth', .05, 100); },
    hot:    function () { noise(.6, .1, 3000, .5, 0, 'highpass'); tone(400, .4, 'sine', .04, 300); },
    cool:   function () { noise(.5, .1, 5000, .4, 0, 'highpass'); },
    chirp:  function () { tone(900, .07, 'sine', .08, 1500); tone(1200, .09, 'sine', .07, 1800, .08); },
    hatch:  function () { noise(.08, .1, 1500); tone(700, .12, 'sine', .08, 1400, .1); tone(1000, .12, 'sine', .08, 1800, .22); },
    munch:  function () { noise(.06, .1, 900); noise(.06, .1, 700, 1, .1); },
    hungry: function () { tone(500, .25, 'sine', .06, 300); },
    trade:  function () { seq([523, 784, 659, 1047], .07, 'triangle', .08); },
    mix:    function () { tone(300, .2, 'sine', .06, 600); noise(.2, .04, 800); },
    beep:   function (i) { tone([660, 880, 1100, 1320][i || 0] || 880, .12, 'square', .06); },
    signal: function () { seq([880, 0, 880, 1320], .1, 'square', .06); tone(1760, .4, 'sine', .05, null, .4); },
    wobble: function () { tone(300, .35, 'sine', .07, 500); tone(500, .35, 'sine', .05, 300, .15); },
    bus:    function () { tone(392, .25, 'square', .06); tone(330, .35, 'square', .06, null, .25); },
    warp:   function () { tone(200, 1.2, 'sawtooth', .05, 1800); noise(1.2, .06, 3000, .4, 0, 'highpass'); },
    launch: function () { noise(2.5, .2, 180, .4, 0, 'lowpass'); tone(80, 2.5, 'sawtooth', .06, 300); },
    landing:function () { noise(.4, .15, 200, 1, 0, 'lowpass'); seq([392, 523, 659, 784], .12, 'triangle', .08, .3); },
    saucer: function () { for (var i = 0; i < 6; i++) tone(600 + (i % 2) * 300, .2, 'sine', .05, 900 - (i % 2) * 300, i * .18); },
    party:  function () { seq([523, 659, 784, 1047, 784, 1047, 1319], .1, 'square', .06, .2); noise(.4, .05, 4000, .6, .1, 'highpass'); }
  };
  var DESC = {
    pick:'pick up a bot or stack', drop:'drop on a valid target', snap:'invalid drop snaps back', tap:'button tap',
    build:'blueprint built', expand:'building expanded to Lv2', stage:'goal stage built', fanfare:'level complete',
    clamp:'rocket part clamps on', merge:'bots merge', upgrade:'upgrade done', belt:'belt connected', retract:'belt winds back',
    warn:'meteor shadow warning', crack:'meteor hits', fix:'building repaired', toast:'hint pops up', harvest:'crop harvested',
    crateLand:'supply crate lands', crateOpen:'crate opened', quake:'moonquake', coin:'coins earned', order:'order filled',
    powerOn:'power switched on', powerOff:'power switched off', hot:'building overheats', cool:'ice cools a building',
    chirp:'alien joins', hatch:'alien egg hatches', munch:'alien eats a snack', hungry:'alien gets hungry', trade:'trade done',
    mix:'paint mixed', beep:'signal beep', signal:'signal sent', wobble:'doors swap shape', bus:'tour bus arrives',
    warp:'teleport beam', launch:'rocket launch', landing:'moon landing', saucer:'alien saucer', party:'home party'
  };
  window.SFX = {
    bind: bind, list: Object.keys(S), desc: DESC,
    play: function (name, a) {
      if (!ctx || !out || !S[name]) return;
      var now = performance.now(); if (last[name] && now - last[name] < 60) return; last[name] = now;
      try { S[name](a); } catch (e) {}
    }
  };
})();
