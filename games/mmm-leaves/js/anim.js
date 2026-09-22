/* mmm-leaves — anim.js
   Tiny tween + particle engine. Anything that blocks input raises a busy count,
   so the turn loop can simply ask "is something still moving?". */

var Anim = (function () {
  'use strict';

  var tweens = [], parts = [], floats = [], busy = 0;

  var Ease = {
    linear:   function (t) { return t; },
    out:      function (t) { return 1 - Math.pow(1 - t, 3); },
    in:       function (t) { return t * t * t; },
    inOut:    function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back:     function (t) { var c = 1.70158, s = c + 1; return 1 + s * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    bounce:   function (t) {
      var n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
      if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
      t -= 2.625 / d; return n * t * t + 0.984375;
    }
  };

  function run(opts) {
    var tw = {
      t: 0,
      dur: opts.dur || 300,
      delay: opts.delay || 0,
      ease: opts.ease || Ease.out,
      update: opts.update,
      done: opts.done,
      blocking: opts.blocking !== false,
      dead: false
    };
    if (tw.blocking) busy++;
    tweens.push(tw);
    return tw;
  }

  function wait(ms, done) { return run({ dur: ms, update: null, done: done }); }

  function seq(steps) {                     // steps: [{dur, update, done}, ...]
    var i = 0;
    function next() {
      if (i >= steps.length) return;
      var s = steps[i++];
      s = Object.assign({}, s, { done: function () { s.onDone && s.onDone(); next(); } });
      run(s);
    }
    next();
  }

  function burst(x, y, color, count, spread, life) {
    count = count || 14;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = (spread || 2.2) * (0.4 + Math.random());
      parts.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6,
        r: 1.6 + Math.random() * 3, color: color,
        life: life || (420 + Math.random() * 380), age: 0, grav: 0.055,
        spin: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6.3, shape: 'dot'
      });
    }
  }

  function confetti(x, y, w, colors, count) {
    for (var i = 0; i < (count || 60); i++) {
      parts.push({
        x: x + (Math.random() - 0.5) * (w || 300),
        y: y - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3.2, vy: -1 - Math.random() * 3.4,
        r: 3 + Math.random() * 4, color: colors[i % colors.length],
        life: 1500 + Math.random() * 1200, age: 0, grav: 0.10,
        spin: (Math.random() - 0.5) * 0.4, rot: Math.random() * 6.3, shape: 'flake'
      });
    }
  }

  function floatText(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color || '#fff',
                  size: size || 20, age: 0, life: 900 });
  }

  function update(dt) {
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      if (tw.delay > 0) { tw.delay -= dt; continue; }
      tw.t += dt;
      var p = Math.min(1, tw.t / tw.dur);
      try { if (tw.update) tw.update(tw.ease(p), p); }
      catch (err) { p = 1; }
      if (p >= 1) {
        tweens.splice(i, 1);
        if (tw.blocking) busy--;
        try { if (tw.done) tw.done(); } catch (err2) { /* keep the loop alive */ }
      }
    }
    for (var j = parts.length - 1; j >= 0; j--) {
      var q = parts[j];
      q.age += dt;
      q.x += q.vx * (dt / 16.67);
      q.y += q.vy * (dt / 16.67);
      q.vy += q.grav * (dt / 16.67);
      q.vx *= 0.995;
      q.rot += q.spin * (dt / 16.67);
      if (q.age >= q.life) parts.splice(j, 1);
    }
    for (var k = floats.length - 1; k >= 0; k--) {
      var f = floats[k];
      f.age += dt; f.y -= dt * 0.035;
      if (f.age >= f.life) floats.splice(k, 1);
    }
  }

  function draw(ctx) {
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i];
      var a = 1 - q.age / q.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.fillStyle = q.color;
      if (q.shape === 'flake') { ctx.fillRect(-q.r, -q.r * 0.55, q.r * 2, q.r * 1.1); }
      else { ctx.beginPath(); ctx.arc(0, 0, q.r, 0, 6.3); ctx.fill(); }
      ctx.restore();
    }
    for (var j = 0; j < floats.length; j++) {
      var f = floats[j];
      var fa = 1 - f.age / f.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fa);
      ctx.font = 'bold ' + f.size + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,45,20,0.6)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function clear() {
    tweens.length = 0; parts.length = 0; floats.length = 0; busy = 0;
  }

  return {
    Ease: Ease, run: run, wait: wait, seq: seq, burst: burst, confetti: confetti,
    floatText: floatText, update: update, draw: draw, clear: clear,
    isBusy: function () { return busy > 0; },
    particleCount: function () { return parts.length; }
  };
})();
