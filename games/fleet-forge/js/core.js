/* core.js — the app: a fixed virtual stage, pointer input, a screen stack, and a
 * small immediate-mode widget set.
 *
 * WHY A VIRTUAL STAGE
 * The arcade is always played at 1333x690 on one tablet. Laying out against a
 * fixed 1333x690 space and scaling it to fit means every position is a real
 * number I can reason about, and the game still looks right in a desktop window
 * while I work on it. The old build used `height:100vh` flex columns and stacked
 * ~240px of chrome, which left the ship grid about 450px on the target device.
 */
var VW = 1333, VH = 690;

/* The arcade's own "< Games" button sits at top-left in every game. Nothing of
 * ours goes in this box, ever. */
var SAFE_TL = { w: 160, h: 54 };

var App = (function () {
  var canvas, ctx, scale = 1, offX = 0, offY = 0, dpr = 1;
  var stack = [], last = 0, running = false;

  /* ---- pointer -------------------------------------------------------- */
  var ptr = {
    x: 0, y: 0, downX: 0, downY: 0, upX: 0, upY: 0,
    down: false, downThisFrame: false, upThisFrame: false,
    dragged: false, dx: 0, dy: 0, claimed: false
  };
  var TAP_SLOP = 10;          // movement past this is a drag, not a tap

  /* Second finger, for pinch. The single `ptr` above stays the one the widgets
     read, so nothing that already works has to know about this. */
  var touches = {}, touchIds = [];
  var pinch = { active: false, scale: 1, dScale: 1, cx: 0, cy: 0, dist: 0 };

  /* Wheel delta accumulated since the last frame, cleared in frame() like
     ptr.dx. Only a desktop produces it — it is here so zoom is testable
     without two fingers, not because the tablet needs it. */
  var wheel = { dy: 0, x: 0, y: 0 };

  function toVirtual(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - offX / dpr) / (scale / dpr),
      y: (e.clientY - r.top  - offY / dpr) / (scale / dpr)
    };
  }

  function trackDown(e, p) {
    if (touches[e.pointerId] === undefined && touchIds.length < 2) touchIds.push(e.pointerId);
    touches[e.pointerId] = { x: p.x, y: p.y };
    refreshPinch(true);
  }
  function trackMove(e, p) {
    if (!touches[e.pointerId]) return;
    touches[e.pointerId].x = p.x; touches[e.pointerId].y = p.y;
    refreshPinch(false);
  }
  function trackUp(e) {
    delete touches[e.pointerId];
    var i = touchIds.indexOf(e.pointerId);
    if (i >= 0) touchIds.splice(i, 1);
    refreshPinch(true);
  }
  /* Two fingers down = a pinch. `dScale` is the change since the last frame,
     which is what a zoom wants to multiply by; `scale` is cumulative. */
  function refreshPinch(reset) {
    if (touchIds.length < 2) {
      pinch.active = false; pinch.dScale = 1; pinch.dist = 0;
      return;
    }
    var a = touches[touchIds[0]], b = touches[touchIds[1]];
    if (!a || !b) { pinch.active = false; pinch.dScale = 1; return; }
    var d = Math.hypot(b.x - a.x, b.y - a.y);
    pinch.cx = (a.x + b.x) / 2; pinch.cy = (a.y + b.y) / 2;
    if (!pinch.active || reset || pinch.dist <= 0) {
      pinch.active = true; pinch.dist = d; pinch.dScale = 1; pinch.scale = 1;
      return;
    }
    pinch.dScale = d / pinch.dist;
    pinch.scale *= pinch.dScale;
    pinch.dist = d;
  }

  function onDown(e) {
    var p = toVirtual(e);
    trackDown(e, p);
    if (touchIds.length > 1) return;          /* the second finger is pinch only */
    ptr.x = ptr.downX = p.x; ptr.y = ptr.downY = p.y;
    ptr.down = true; ptr.downThisFrame = true; ptr.dragged = false;
    ptr.dx = ptr.dy = 0; ptr.claimed = false;
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
  }
  function onMove(e) {
    var p = toVirtual(e);
    trackMove(e, p);
    if (touchIds.length > 1) return;
    ptr.dx += p.x - ptr.x; ptr.dy += p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (ptr.down && Math.hypot(p.x - ptr.downX, p.y - ptr.downY) > TAP_SLOP) ptr.dragged = true;
  }
  function onUp(e) {
    var p = toVirtual(e);
    var wasPinching = touchIds.length > 1;
    trackUp(e);
    if (wasPinching) { ptr.down = false; ptr.dragged = true; return; }  /* not a tap */
    ptr.upX = p.x; ptr.upY = p.y; ptr.x = p.x; ptr.y = p.y;
    ptr.down = false; ptr.upThisFrame = true;
  }

  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /* ---- the arcade's back button, in game units --------------------------
     The back link is an HTML anchor pinned to the WINDOW at a fixed CSS size,
     so how much of the stage it covers depends on how big the stage is: at
     1333 across it is about 117 units wide, and on a small window it is
     proportionally wider. `SAFE_TL` is the static worst case, which is why a
     screen that lays out from it sits further right than the design does.
     This measures the real thing instead, so a bar can put its first control
     exactly where the handoff puts it and still never end up underneath the
     link on a small screen. */
  var safeW = SAFE_TL.w;
  function measureSafe() {
    var el = document.getElementById('backBtn');
    if (!el || !scale) { safeW = SAFE_TL.w; return; }
    var r = el.getBoundingClientRect();
    if (!r.width) { safeW = SAFE_TL.w; return; }
    safeW = (r.right * dpr - offX) / scale;
  }

  /* ---- stage ---------------------------------------------------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = window.innerWidth, ch = window.innerHeight;
    canvas.width  = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    scale = Math.min(canvas.width / VW, canvas.height / VH);
    offX = (canvas.width  - VW * scale) / 2;
    offY = (canvas.height - VH * scale) / 2;
    measureSafe();
  }

  /* ---- the screen transition -------------------------------------------
     One rule for the whole game: whenever the screen stack changes, the new
     screen arrives out of black. It is a fade IN and not a cross-fade because
     an immediate-mode canvas has no second buffer to cross-fade against — the
     outgoing screen stops existing the moment the stack changes — and because
     a fade from black is what a match cut between two dense HUDs wants anyway.

     Input is deliberately NOT blocked during the fade: it is a quarter of a
     second, and a screen that eats the first tap you give it feels broken. */
  var fade = 0, FADE_S = 0.28;
  function beginFade() { fade = 1; }

  /* ---- the mute, on every screen ---------------------------------------
     The one control that outlives the screen stack, so it lives here rather
     than being redrawn by each screen and forgotten by the next one. Screens
     keep out of its way by laying their top-right content out from
     `App.RIGHT_INSET` instead of their own margin. */
  /* The handoff's: a 38px disc pinned at right 18, top 10, on every page. Its
     top bars reserve `0 66px` on the right — 18 + 38 + a 10px gap — which is
     what `RIGHT_INSET` is. */
  var MUTE_SZ = 38, MUTE_M = 18;
  var MUTE = { x: VW - MUTE_M - MUTE_SZ, y: 10, w: MUTE_SZ, h: MUTE_SZ };
  var RIGHT_INSET = MUTE_M + MUTE_SZ + 10;

  function drawMute(ctx) {
    var off = (typeof Music !== 'undefined') && Music.muted();
    var down = UI.held(MUTE);
    var cx = MUTE.x + MUTE.w / 2, cy = MUTE.y + MUTE.h / 2, r = MUTE.w / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = down ? 'rgba(18,32,42,0.95)' : 'rgba(6,12,16,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,170,200,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    soundIcon(ctx, cx, cy, !off, T.accent);
  }

  function toggleMute() {
    if (typeof Music === 'undefined') return;
    var off = Music.mute(!Music.muted());
    if (typeof Save !== 'undefined' && Save.setMuted) Save.setMuted(off);
  }

  /* ---- loop ----------------------------------------------------------- */
  function frame(t) {
    if (!running) return;
    var dt = Math.min((t - last) / 1000, 0.05);   // clamp: a backgrounded tab
    last = t;                                      // must not teleport the sim
    var top = stack[stack.length - 1];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();

    /* Hit-tested BEFORE the screen draws, so it wins the tap: a widget
       hit-tests as it draws, and otherwise whichever happened to be drawn
       first would win — draw order deciding behaviour. Drawn after, so it is
       on top.

       ONLY THE HIT CLAIMS. An earlier version also claimed while the button
       was merely HELD, which quietly broke it: `claimed` is reset on
       pointerdown and nowhere else, so the press frame set it and it was still
       set on the release frame — where `hit()` requires `!claimed` and so
       refused. The button then only worked when press and release landed in
       the same frame, which is to say at random. */
    var muteTap = UI.hit(MUTE);
    if (muteTap) ptr.claimed = true;

    if (top) {
      if (top.update) top.update(dt);
      if (top.draw) top.draw(ctx, dt);
    }
    drawMute(ctx);
    /* Toggled before the cue so that turning sound back ON is audible; turning
       it off swallows its own blip, which is the right way round. */
    if (muteTap) { toggleMute(); Sfx.play('tap'); }

    if (fade > 0) {
      fade -= dt / FADE_S;
      if (fade < 0) fade = 0;
      /* squared, so it clears the picture fast and then lets the last of the
         black go slowly — a linear ramp reads as a flicker at this length */
      ctx.fillStyle = 'rgba(0,0,0,' + (fade * fade).toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }

    ptr.downThisFrame = false; ptr.upThisFrame = false;
    ptr.dx = 0; ptr.dy = 0;
    pinch.dScale = 1; wheel.dy = 0;
    requestAnimationFrame(frame);
  }

  return {
    ptr: ptr, pinch: pinch, wheel: wheel, inRect: inRect,
    /* Where a screen's top-right content has to stop, so it does not sit under
       the mute button. */
    MUTE: MUTE, RIGHT_INSET: RIGHT_INSET,
    /* Where a screen's top-LEFT content has to start, so it does not sit
       under the arcade's back link. Measured, not assumed — see above. */
    safeLeft: function () { return safeW; },
    get ctx() { return ctx; },

    init: function () {
      canvas = document.getElementById('c');
      ctx = canvas.getContext('2d', { alpha: false });
      resize();
      window.addEventListener('resize', resize);
      /* Keys go to whichever screen is on top, if it wants them. The game is
         touch-first and nothing needs a keyboard to play; this is here so a
         screen can carry a developer shortcut without every screen having to
         own a listener and remember to take it off again. Modified keys are
         left to the browser, so Ctrl-R still reloads. */
      window.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var top = stack[stack.length - 1];
        if (top && top.key && top.key(e.key)) e.preventDefault();
      });
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('wheel', function (e) {
        var p = toVirtual(e);
        wheel.dy += e.deltaY; wheel.x = p.x; wheel.y = p.y;
        e.preventDefault();
      }, { passive: false });
      canvas.style.touchAction = 'none';

      /* When the tab is hidden the frame loop stops, but pointer events do not:
         a tap taken just before the app was switched away would otherwise still
         be sitting in `upThisFrame` and fire on the frame after the player comes
         back, on whatever screen is showing by then. Drop it, and restart the
         clock so the first frame back does not carry a huge dt. */
      document.addEventListener('visibilitychange', function () {
        ptr.down = false; ptr.downThisFrame = false; ptr.upThisFrame = false;
        ptr.dragged = false; ptr.claimed = false; ptr.dx = ptr.dy = 0;
        touches = {}; touchIds.length = 0; refreshPinch(true);
        last = performance.now();
      });
    },

    start: function (screen) {
      stack = [screen];
      if (screen.enter) screen.enter();
      beginFade();
      running = true; last = performance.now();
      requestAnimationFrame(frame);
    },
    push: function (s) {
      var top = stack[stack.length - 1];
      if (top && top.pause) top.pause();
      stack.push(s); if (s.enter) s.enter();
      beginFade();
    },
    pop: function () {
      var s = stack.pop(); if (s && s.exit) s.exit();
      var top = stack[stack.length - 1];
      if (top && top.resume) top.resume();
      beginFade();
    },
    replace: function (s) {
      var old = stack.pop(); if (old && old.exit) old.exit();
      stack.push(s); if (s.enter) s.enter();
      beginFade();
    },
    depth: function () { return stack.length; },
    top:   function () { return stack[stack.length - 1]; }
  };
})();

/* ---- immediate-mode widgets ---------------------------------------------
 * Each widget hit-tests the live pointer as it draws. A tap counts only when
 * the press and the release are both inside the same rect and the finger did
 * not travel far enough to be a drag — which is what stops a flick through a
 * module list from also selecting whatever it started on.
 */
var UI = (function () {
  var p = App.ptr;

  function hit(r) {
    return !p.claimed && p.upThisFrame && !p.dragged &&
           App.inRect(p.upX, p.upY, r) && App.inRect(p.downX, p.downY, r);
  }
  function held(r) { return p.down && App.inRect(p.x, p.y, r); }

  return {
    hit: hit, held: held,

    /* A tappable region with no chrome of its own — the caller draws.
       Every widget below plays a cue on the frame it fires, so sound is a
       property of being tapped rather than something every call site has to
       remember. `cue` names a more specific one; leaving it out gets the
       everyday blip. */
    zone: function (r, cue) {
      var h = hit(r);
      if (h) { p.claimed = true; Sfx.play(cue || 'tap'); }
      return h;
    },

    /* The handoff's segmented control: 3px of padding round tabs of 5px 10px,
       radius 6 outside and 4 in, 11px condensed caps tracked 1.6, the active
       one filled with the accent. Returns the index tapped, or -1, and reports
       its own width so the caller can lay out what follows it.

       `measure` draws nothing and only returns the width, for a bar that has to
       know how wide this is before it decides where things go. */
    segment: function (ctx, x, y, labels, active, measure, height) {
      var PAD = 3, TPX = 10, TPY = 5, TRACK = 1.6, FS = 11;
      /* The control is 29 tall by default — padding plus one 5px/10px tab. A
         caller on a row of 38px pills passes 38 so it lines up with them, the
         way the handoff's arena bar does; the tabs keep their own size and
         sit in the middle of it. */
      var H = height || 29;
      var ih = 29 - PAD * 2, i, w = PAD, ws = [];
      ctx.font = T.head(FS, 700);
      for (i = 0; i < labels.length; i++) {
        var tw = ctx.measureText(labels[i]).width + TRACK * labels[i].length + TPX * 2;
        ws.push(tw); w += tw + (i ? PAD : 0);
      }
      w += PAD;
      var box = { x: x, y: y, w: w, h: H };
      if (measure) return { w: w, h: H, picked: -1, rect: box };

      fillRR(ctx, box.x, box.y, box.w, box.h, 6, 'rgba(10,16,21,0.85)');
      strokeRR(ctx, box.x, box.y, box.w, box.h, 6, 'rgba(120,170,200,0.2)', 1);

      var tx = x + PAD, ty = y + (H - ih) / 2, picked = -1;
      for (i = 0; i < labels.length; i++) {
        var t = { x: tx, y: ty, w: ws[i], h: ih };
        if (i === active) fillRR(ctx, t.x, t.y, t.w, t.h, 4, T.accent);
        text(ctx, labels[i], t.x + t.w / 2, t.y + t.h / 2,
             { font: T.head(FS, 700), align: 'center', baseline: 'middle', track: TRACK,
               fill: i === active ? '#04080A' : '#8FA3B0' });
        if (UI.zone(t, 'toggle') && i !== active) picked = i;
        tx += ws[i] + PAD;
      }
      return { w: w, h: H, picked: picked, rect: box };
    },

    button: function (ctx, r, label, opts) {
      opts = opts || {};
      var down = held(r), on = opts.active, off = opts.disabled;
      var fill = off ? 'rgba(255,255,255,0.06)'
               : on  ? T.accent
               : down ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)';
      fillRR(ctx, r.x, r.y, r.w, r.h, opts.radius || 12, fill);
      strokeRR(ctx, r.x, r.y, r.w, r.h, opts.radius || 12,
               on ? T.glow : T.panelEdge, on ? 2 : 1);
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2,
           { font: opts.font || 'bold 17px "Segoe UI",system-ui,sans-serif',
             fill: off ? T.faint : (opts.fill || T.white),
             align: 'center', baseline: 'middle' });
      if (off) return false;
      var h = hit(r); if (h) { p.claimed = true; Sfx.play(opts.cue || 'tap'); }
      return h;
    },

    /* The primary action — gradient, the arcade's Play-button look. */
    primary: function (ctx, r, label, opts) {
      opts = opts || {};
      if (opts.disabled) return UI.button(ctx, r, label, opts);
      var g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, T.accent); g.addColorStop(1, T.glow);
      var down = held(r);
      ctx.save(); if (down) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(0.97, 0.97); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
      fillRR(ctx, r.x, r.y, r.w, r.h, 14, g);
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2,
           { font: 'bold 20px "Segoe UI",system-ui,sans-serif', align: 'center', baseline: 'middle' });
      ctx.restore();
      var h = hit(r); if (h) { p.claimed = true; Sfx.play(opts.cue || 'confirm'); }
      return h;
    },

    /* Drag-scrollable viewport with momentum. `body(ctx, scrollY)` draws the
       content; the widget owns the clip, the drag and the glide. */
    scroll: function (ctx, r, state, contentH, body) {
      if (state.y === undefined) { state.y = 0; state.v = 0; state.grab = false; }
      var max = Math.max(0, contentH - r.h);

      if (p.downThisFrame && App.inRect(p.downX, p.downY, r)) { state.grab = true; state.v = 0; }
      if (!p.down) state.grab = false;
      if (state.grab && p.dy) { state.y -= p.dy; state.v = -p.dy; }
      if (!state.grab) {
        state.y += state.v;
        state.v *= 0.92;
        if (Math.abs(state.v) < 0.1) state.v = 0;
      }
      if (state.y < 0)   { state.y = 0;   state.v = 0; }
      if (state.y > max) { state.y = max; state.v = 0; }

      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.translate(0, -state.y);
      body(ctx, state.y);
      ctx.restore();

      if (max > 0) {                                   // slim track, right edge
        var th = Math.max(30, r.h * (r.h / contentH));
        var ty = r.y + (r.h - th) * (state.y / max);
        fillRR(ctx, r.x + r.w - 5, ty, 3, th, 2, 'rgba(255,255,255,0.22)');
      }
      return state;
    },

    /* True when a tap landed in `r` and the pointer never turned into a drag —
       for rows inside a scroll viewport. */
    row: function (r, clip, cue) {
      if (clip && !App.inRect(p.upX, p.upY, clip)) return false;
      var h = hit(r); if (h) { p.claimed = true; Sfx.play(cue || 'select'); }
      return h;
    }
  };
})();
