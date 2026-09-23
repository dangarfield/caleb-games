/* screens/battle.js — 1c, the arena. The fight, and nothing but the fight.
 *
 * WHY THIS FILE EXISTS
 * `sim/` is headless on purpose: it owns the battle and knows nothing about a
 * canvas. This file is the other half of that bargain — it reads the world the
 * sim hands back and draws it, and it never calls into the sim beyond
 * `create()` and `step(dt)`. Nothing here decides a hit, a target or a winner.
 *
 * WHAT USED TO BE HERE AND IS NOT ANY MORE
 * This screen used to carry three phases: a briefing that read the enemy fit
 * back to you in prose, the fight, and a result card. The design cut both ends.
 * ENTER ARENA drops you straight into the match, and the result is three
 * screens of its own (1d/1e/1f) because it has to show a level-up the hangar
 * works out after the world is gone. So this file builds a world, draws it,
 * and hands `finish()`'s facts to `onDone`.
 *
 * THE HUD IS READ-ONLY
 * One control: match speed. No fire button, no hotbar, no target picker — the
 * fit decides the fight, which is the whole design. The action feed is the only
 * place the fight narrates itself, and it is built from what the render records
 * show changing, because the sim's event ring carries positions and not names.
 *
 * WHY THE EFFECT ART IS HERE AT ALL
 * The old Phaser build shipped hand-made effect sprites and a config mapping
 * every weapon key to one; the rebuild drew all of it with procedural shapes
 * and never loaded a single PNG. `data/effects.json` is that config, cleaned
 * up and re-measured, and `effects.js` owns the images and the frame geometry.
 * Every sheet's frame rectangles are computed ONCE in `enter` into Float32
 * arrays — the old build called `anims.create()` for every individual
 * explosion. Playing one is an integer index into those arrays, and the entry
 * that plays it is a slot in the same fixed particle pool the sparks use, so a
 * busy frame can never grow anything.
 *
 * FRAME BUDGET
 * The target is a low-power tablet, so `draw` allocates nothing: no array
 * literals, no `.map`/`.filter`, no `new`, no string building in a per-module
 * or per-projectile loop. Every tint, every particle colour, every render
 * record and the whole starfield are built once in `enter`. Projectiles with
 * no sprite of their own are drawn as batched paths — one `stroke()` for every
 * bullet on screen — and below `Z_SPRITE` zoom everything falls back to those
 * batches, because a 53x76 sprite squeezed into three pixels is a texture
 * upload that buys nothing. Module art is skipped entirely below ten pixels a
 * cell.
 *
 * WHY THE CAMERA IS SMOOTHED
 * The old battle scene recomputed zoom every frame straight from the raw
 * distance between the ships, so a strafe of half a cell jerked the whole
 * screen. Position and zoom both chase a target with a frame-rate-independent
 * lerp and an epsilon that snaps the last hair of the gap, so nothing ever
 * shivers around an unreachable value.
 *
 * DEATH RETURNS TO THE MENU. There is no restart button on the result card —
 * that is the arcade's rule, not an oversight.
 */
function BattleScreen(opts) {
  'use strict';

  opts = opts || {};
  var onDone = opts.onDone || function () {};
  var opponent = opts.opponent ||
                 { id: 'unknown', name: 'Unknown Contact', blurb: '', difficulty: 0 };

  /* ---- 1c layout -------------------------------------------------------
     The handoff's arena HUD, at 1333x690. There is no brief screen and no
     result screen in here any more: ENTER ARENA drops you straight into the
     fight, and the fight hands its result to ResultScreen. What is left is
     read-only telemetry plus one control — match speed — because the fit is
     what decides the fight. */
  var SPEEDS   = [1, 2, 4];
  var SPD_LBL  = ['', '1\u00d7', '2\u00d7', '4\u00d7'];   /* cell 0 is the pause icon */
  var SPD_CELL = 40, SPD_CH = 30;
  /* The speed rail and the way out sit together in the top right, the rail
     first and the quit square beside it, because they are the only two things
     on this screen the player may touch. */
  var QUIT_SZ  = 36, QUIT_GAP = 10;
  var SPD      = { x: VW - 20 - QUIT_SZ - QUIT_GAP - 175, y: 14, w: 175, h: 36 };
  var BTN_QUIT = { x: VW - 20 - QUIT_SZ, y: 14, w: QUIT_SZ, h: QUIT_SZ };
  var TOAST    = { x: VW - 22, y: 60, n: 5, gap: 7 };
  var TOAST_SZ = [14, 13, 13, 12.5, 12];
  var TOAST_A  = [1, 0.9, 0.7, 0.5, 0.22];
  var PANEL_W  = 268, PANEL_H = 92;
  var P_PANEL  = { x: 20, y: VH - 16 - 92, w: PANEL_W, h: PANEL_H };
  var E_PANEL  = { x: VW - 20 - PANEL_W, y: VH - 16 - 92, w: PANEL_W, h: PANEL_H };
  /* Only shown when the world could not be built — otherwise the match runs to
     its own end and the result screen is the way out. */
  var BTN_BAIL = { x: VW / 2 - 110, y: VH - 90, w: 220, h: 46 };
  /* Every match needs a way out. Where it goes is the caller's business — the
     hangar when the fight came from ENTER ARENA, the fitting bay when it came
     from TEST — so quitting is just `onDone(null)` and the caller decides.
     (Its rectangle is declared with the speed rail above, since they are one
     row.) */

  /* ---- camera ---------------------------------------------------------- */
  /* The stage centre the battle is framed around, and the half-extents the
     two ships must stay inside. The band avoids the HUD pill at the top. */
  var CX = VW / 2, CY = 378;
  var HALF_W = 620, HALF_H = 274;
  var CAM_MARGIN = 6;          /* cells of air around the widest bubble     */
  var CAM_ZMIN = 2.2, CAM_ZMAX = 26;
  var CAM_POS_RATE = 0.12;     /* fraction of the gap closed per 1/60s      */
  var CAM_ZOOM_RATE = 0.06;
  var CAM_POS_EPS = 0.02, CAM_ZOOM_EPS = 0.004;
  var cam = { x: 0, y: 0, z: 8, tx: 0, ty: 0, tz: 8 };

  /* ---- drawing constants (no string built in a loop, ever) -------------- */
  var TINT_STEPS = 6;              /* health buckets per module tint         */
  var C_DEAD     = 'rgba(6,6,20,0.88)';
  var C_DEAD_EDGE= 'rgba(255,255,255,0.09)';
  var C_UNPOWERED= 'rgba(3,4,18,0.52)';
  var C_OFFLINE  = 'rgba(3,4,18,0.26)';  /* under the energy sprite          */
  var C_HULL     = 'rgba(160,196,255,0.07)';
  var C_SHIELD   = T.cat.shield;
  var C_BULLET   = 'rgba(255,236,190,0.95)';
  var C_INTERCEPT= T.cat.pointdefense;
  var C_MISSILE  = T.cat.missile;
  var C_MTRAIL   = 'rgba(255,169,77,0.32)';
  var C_JUNK     = 'rgba(194,168,120,0.85)';
  var C_MINE     = T.cat.mine;
  var C_BEAM     = T.cat.laser;
  var C_BEAM_CORE= 'rgba(255,255,255,0.9)';
  var C_STAR     = ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.34)', 'rgba(255,255,255,0.55)'];

  /* particle palette; every alpha it is ever drawn at is baked here so the
     draw loop only ever indexes an array */
  var PC_HEX  = ['#ffd32a', '#ff7a5c', '#ffffff', '#5c8cff', '#b78cff', '#c2a878', '#ff6b9d'];
  var PC_GOLD = 0, PC_FIRE = 1, PC_WHITE = 2, PC_SHIELD = 3, PC_PD = 4, PC_JUNK = 5,
      PC_PINK = 6;
  var PA_STEPS = 8;
  var PC = null;                   /* flat: ci * PA_STEPS + alphaStep        */

  var P_N = 240;                   /* the whole particle budget, fixed       */
  var particles = null, pCursor = 0;

  /* ---- sprite effects -------------------------------------------------- */
  /* The five spritesheets, in a fixed order so the pool can name one with an
     integer. `sheets` is null whenever the art is unavailable, and every draw
     path checks it and falls back to the shapes it drew before. */
  var SH_EXPL = 0, SH_SMOKE = 1, SH_REPAIR = 2, SH_ENERGY = 3, SH_JUNK = 4;
  var SHEET_NAMES = ['explosion', 'smoke', 'repair', 'energy', 'junk'];
  var sheets = null;

  /* explosion sizes, in world units, resolved from the config once */
  var EX_MISSILE = 0, EX_MINE = 1, EX_JUNK = 2, EX_MODULE = 3, EX_SHIP = 4;
  var EX_NAMES = ['missile', 'mine', 'junk', 'module', 'ship'];
  var expSize = null;              /* Float32Array, world units              */
  var smkSize = null;              /* the matching smoke size, 128 x scale    */

  var projFX = null;               /* module key -> {img,scale,rot}          */
  var Z_SPRITE = 3.2;              /* below this zoom, batched shapes win    */
  var REPAIR_SHOW = 0.5;           /* how long the repair sparkle lingers    */
  var fxClock = 0;                 /* drives the looping overlay animations  */
  var eFrame = 0;                  /* energy sheet frame, once per draw      */

  /* ---- parallax backdrop ----------------------------------------------- */
  /* One 512x512 PNG per battle, chosen from the seed so a given fight always
     looks the same, and fetched only when that fight opens. Nine of them at
     2.6 MB is not something a tablet should swallow at boot for a screen it
     may never reach. */
  var bgImg = null, bgScale = 2.2, bgAlpha = 0.5, bgPar = 0.04;

  /* ---- starfield ------------------------------------------------------- */
  var STAR_N = 150;
  var starX = null, starY = null, starL = null, starS = null;

  /* ---- state ----------------------------------------------------------- */
  var handedOver = false;          /* onDone fires exactly once              */
  var world = null, error = null;
  /* Speed is remembered per pilot — one brother watches every fight, the other
     skips them, and neither should have to say so again each match. Pause is
     not remembered: it is something you do during a match, not a way you like
     to watch them. */
  var paused = false, speedIx = Save.matchSpeed();

  /* ---- the opening ------------------------------------------------------
     Handoff 1c's `battleCountdown`: Fade in, Countdown 3/2/1, Fight, Live.
     The arena is DRAWN from the first frame — the fight fades up behind the
     card rather than appearing when the card leaves — but the sim does not run
     and nothing shoots until `live`. Timings are cumulative seconds. */
  var INTRO = [
    { k: 'intro', end: 1.10 },
    { k: 'c3',    end: 1.95 },
    { k: 'c2',    end: 2.80 },
    { k: 'c1',    end: 3.65 },
    { k: 'fight', end: 4.15 },   /* FIGHT holds, then fades over its last 500ms */
    { k: 'live',  end: 1e9 }
  ];
  var introT = 0;

  function phase() {
    for (var i = 0; i < INTRO.length; i++) if (introT < INTRO[i].end) return INTRO[i].k;
    return 'live';
  }
  function live() { return introT >= INTRO[4].end; }

  /* How black the arena is. 1 at the very first frame, so the screen genuinely
     fades in FROM black; 0.86 behind the versus card; 0.5 behind the count, so
     the battlefield is already readable while you wait; and out over FIGHT. */
  function dimNow() {
    if (introT < 0.45) return 1 - 0.14 * (introT / 0.45);
    if (introT < INTRO[0].end) return 0.86;
    if (introT < INTRO[0].end + 0.25) return 0.86 - 0.36 * ((introT - INTRO[0].end) / 0.25);
    if (introT < INTRO[3].end) return 0.5;
    if (introT < INTRO[4].end) return 0.5 * (1 - (introT - INTRO[3].end) / 0.5);
    return 0;
  }
  /* The HUD is absent for the versus card and fades up with the countdown. */
  function hudOp() {
    if (introT <= INTRO[0].end) return 0;
    var k = (introT - INTRO[0].end) / 0.3;
    return k >= 1 ? 1 : k;
  }
  var endT = 0, END_DELAY = 1.0;   /* let the last explosion play out        */
  var prepared = false;
  var clockSec = -1, clockStr = '0:00';

  var pShip = null, eShip = null;  /* render records, built once in enter    */
  var pName = '', eName = '';

  var tintFill = {}, tintEdge = {};

  /* small xorshift so the starfield and the sparks do not touch Math.random
     on a hot path and do not disturb the sim's own seeded stream */
  var rs = 0x2f6e2b1 ^ 0;
  function rnd() {
    rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; rs |= 0;
    return ((rs >>> 0) % 100000) / 100000;
  }

  function nz(v, d) {
    var n = (typeof v === 'number') ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }

  /* ---------------------------------------------------------------- */
  /* setup                                                             */
  /* ---------------------------------------------------------------- */

  function hexRGB(h, out) {
    var v = parseInt(h.charAt(0) === '#' ? h.slice(1) : h, 16);
    out[0] = (v >> 16) & 255; out[1] = (v >> 8) & 255; out[2] = v & 255;
    return out;
  }

  /* A module's tint key. `subtype` is 'weapon' for all 51 guns, which would
     paint every one of them the grey "other" tint, so weapons resolve through
     their damage type — the three keys T.cat already carries for them. */
  function tintKey(mod) {
    if (mod.subtype === 'weapon') return mod.damageType || 'other';
    return mod.subtype || 'other';
  }

  /* Every tint, at every damage bucket, as a finished rgba string. A module
     that is losing health slides toward T.danger; the draw loop just indexes. */
  function buildTints() {
    var base = [0, 0, 0], dang = [0, 0, 0], k, i;
    hexRGB(T.danger, dang);
    for (k in T.cat) {
      if (!T.cat.hasOwnProperty(k)) continue;
      hexRGB(T.cat[k], base);
      var fills = new Array(TINT_STEPS), edges = new Array(TINT_STEPS);
      for (i = 0; i < TINT_STEPS; i++) {
        var t = (i / (TINT_STEPS - 1)) * 0.8;           /* 0 = healthy       */
        var r = Math.round(base[0] + (dang[0] - base[0]) * t);
        var g = Math.round(base[1] + (dang[1] - base[1]) * t);
        var b = Math.round(base[2] + (dang[2] - base[2]) * t);
        fills[i] = 'rgba(' + r + ',' + g + ',' + b + ',0.34)';
        edges[i] = 'rgba(' + r + ',' + g + ',' + b + ',0.88)';
      }
      tintFill[k] = fills; tintEdge[k] = edges;
    }
  }

  function buildParticleColours() {
    PC = new Array(PC_HEX.length * PA_STEPS);
    var c = [0, 0, 0];
    for (var i = 0; i < PC_HEX.length; i++) {
      hexRGB(PC_HEX[i], c);
      for (var a = 0; a < PA_STEPS; a++) {
        PC[i * PA_STEPS + a] = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' +
                               (((a + 1) / PA_STEPS) * 0.95).toFixed(3) + ')';
      }
    }
  }

  /* One pool entry serves a spark (kind 0), a ring (kind 1) and an animated
     spritesheet (kind 2). An explosion is a slot with a frame counter, not a
     new object — `rot` and `sheet` exist on every entry so the sheet kinds
     need nothing allocated when they fire. */
  function buildParticles() {
    particles = new Array(P_N);
    for (var i = 0; i < P_N; i++) {
      particles[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0,
                       life: 0, max: 1, size: 1, ci: 0, kind: 0,
                       rot: 0, sheet: 0 };
    }
    pCursor = 0;
  }

  /* A flat field the size of the stage, scrolled modulo itself. No giant
     offscreen tile surfaces — the old build built several thousand pixels of
     them and then drew one screen's worth. */
  function buildStars() {
    starX = new Float32Array(STAR_N);
    starY = new Float32Array(STAR_N);
    starL = new Uint8Array(STAR_N);
    starS = new Float32Array(STAR_N);
    for (var i = 0; i < STAR_N; i++) {
      starX[i] = rnd() * VW;
      starY[i] = rnd() * VH;
      starL[i] = (rnd() * 3) | 0;
      starS[i] = 1 + rnd() * 1.6;
    }
  }

  /* ---- effect art ------------------------------------------------------ */

  /* Every sheet's frame rectangles, every explosion size and every weapon's
     projectile sprite, resolved exactly once. If anything is missing — no
     effects.json, a 404 on a PNG — `sheets` stays null and the whole renderer
     falls back to the procedural shapes. */
  function buildEffects() {
    sheets = null; projFX = null; expSize = null;
    if (typeof Effects === 'undefined' || !Effects.ready) return;
    Effects.prime();

    var arr = new Array(SHEET_NAMES.length), i, s;
    for (i = 0; i < SHEET_NAMES.length; i++) {
      s = Effects.sheet(SHEET_NAMES[i]);
      if (!s || !s.img) return;
      arr[i] = s;
    }
    sheets = arr;

    /* Sizes exactly as the old build did it: the category scale multiplies the
       sprite's own frame size, which is what Phaser's setScale meant when one
       world unit was one grid cell. Explosion is 32px x scale, and nothing
       modulates it at the event — the original had a single number per category
       and that is what keeps a blast in proportion to the ship.
       Smoke is the one place this deviates: the original multiplied the same
       scale by 0.5 onto a 256px sheet for every blast, which is 12.8 cells per
       destroyed module. That works when one module dies; a capital ship here
       sheds twenty in a second and the cloud buries the battle. The multiplier
       is per category in the config instead — see its _note. */
    var cfg = Effects.cfg;
    expSize = new Float32Array(EX_NAMES.length);
    smkSize = new Float32Array(EX_NAMES.length);
    for (i = 0; i < EX_NAMES.length; i++) {
      var e = cfg.explosions ? cfg.explosions[EX_NAMES[i]] : null;
      var sc = nz(e && e.scale, 0.1);
      expSize[i] = sc * arr[SH_EXPL].fw;
      smkSize[i] = sc * arr[SH_SMOKE].fw * nz(e && e.smoke, 0.5);
    }

    projFX = Object.create(null);
    resolveFit(opts.playerFit);
    resolveFit(opts.enemyFit);
  }

  /* One lookup per distinct module in a fit, keyed by the module key the sim
     already carries on the firing module — so the draw loop only ever does a
     property read on a prototype-less map. */
  function resolveFit(fit) {
    var list = (fit && fit.modules) || [], i;
    for (i = 0; i < list.length; i++) {
      var id = list[i].moduleId;
      if (projFX[id] !== undefined) continue;
      var mod = Data.module(id);
      if (!mod) continue;
      var fam = null;
      if (mod.subtype === 'mine') fam = 'mine';
      else if (mod.subtype === 'weapon' && mod.damageType === 'ballistic') fam = 'ballistic';
      else if (mod.subtype === 'weapon' && mod.damageType === 'missile') fam = 'missile';
      if (!fam) continue;
      projFX[id] = Effects.projectile(fam, id);
    }
  }

  /* FNV-1a, so the backdrop a given fight gets is stable across sessions and
     machines rather than whatever Math.random said first. */
  function hashStr(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }

  function pickBackdrop() {
    bgImg = null;
    if (typeof Effects === 'undefined' || !Effects.ready) return;
    var sf = Effects.cfg.starfield;
    if (!sf || !sf.sets) return;

    var names = [], k;
    for (k in sf.sets) if (sf.sets.hasOwnProperty(k)) names.push(k);
    if (!names.length) return;
    names.sort();

    var h = hashStr(String(opponent.id)) ^ ((opts.seed === undefined ? 1234 : opts.seed) | 0);
    if (h < 0) h = -h;
    var list = sf.sets[names[h % names.length]];
    if (!list || !list.length) return;
    bgImg = Effects.background(list[((h / 11) | 0) % list.length]);

    var L = sf.layer || {};
    bgScale = nz(L.tileScale, 2.2);
    bgAlpha = nz(L.alpha, 0.5);
    bgPar   = nz(L.parallax, 0.04);
  }

  /* One record per module: the state object the sim owns, plus the tint table
     and the image this renderer wants. Built once, so the per-frame loop never
     looks a tint up by string or touches Data. `ph` and `rept` are this
     renderer's own memory of the module's health, which is how a repair bay's
     work is noticed without the sim having to announce it. */
  function buildShipRecord(ship) {
    var recs = new Array(ship.modules.length), i;
    for (i = 0; i < ship.modules.length; i++) {
      var m = ship.modules[i], k = tintKey(m.mod);
      recs[i] = {
        m: m,
        fills: tintFill[k] || tintFill.other,
        edges: tintEdge[k] || tintEdge.other,
        img: Data.moduleImg(m.mod),
        isShield: m.subtype === 'shield',
        ph: m.health, rept: 0
      };
    }

    /* the bare hull behind the modules, as local cell centres */
    var g = Geom.shipGrid(ship.ship), n = 0, r, c;
    for (r = 0; r < g.h; r++) for (c = 0; c < g.w; c++) if (g.cells[r][c] !== 0) n++;
    var cells = new Float32Array(n * 2), j = 0;
    for (r = 0; r < g.h; r++) {
      for (c = 0; c < g.w; c++) {
        if (g.cells[r][c] === 0) continue;
        cells[j++] = (c + 0.5) - g.w / 2;
        cells[j++] = (r + 0.5) - g.h / 2;
      }
    }
    return { ship: ship, mods: recs, cells: cells, cellCount: n };
  }

  /* A module whose health went up since the last frame is being patched. The
     sim does not raise an event for it — it does not need to, and the renderer
     asking it to would be the renderer leaking into the model. */
  function stepShipFX(rec, dt) {
    if (!rec) return;
    for (var i = 0; i < rec.mods.length; i++) {
      var r = rec.mods[i], m = r.m;
      if (m.health > r.ph + 0.0001 && m.alive) r.rept = REPAIR_SHOW;
      else if (r.rept > 0) r.rept -= dt;
      r.ph = m.health;
    }
  }

  /* ---------------------------------------------------------------- */
  /* particles — one fixed pool, nothing allocated after enter          */
  /* ---------------------------------------------------------------- */

  /* Takes the slot at the cursor if it is free, otherwise the oldest thing in
     a short window. A burst can never grow the pool, and a busy frame steals
     from the dimmest sparks rather than dropping the explosion. */
  function take() {
    for (var i = 0; i < P_N; i++) {
      var ix = (pCursor + i) % P_N;
      if (!particles[ix].active) { pCursor = (ix + 1) % P_N; return particles[ix]; }
    }
    var p = particles[pCursor];
    pCursor = (pCursor + 1) % P_N;
    return p;
  }

  function burst(x, y, n, ci, speed, life, size) {
    for (var i = 0; i < n; i++) {
      var p = take();
      var a = rnd() * Math.PI * 2, s = speed * (0.35 + rnd() * 0.65);
      p.active = true; p.kind = 0; p.ci = ci;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.max = life * (0.6 + rnd() * 0.7); p.life = p.max;
      p.size = size * (0.6 + rnd() * 0.8);
    }
  }

  function ring(x, y, ci, radius, life) {
    var p = take();
    p.active = true; p.kind = 1; p.ci = ci;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    p.max = life; p.life = life; p.size = radius;
  }

  /* An animated sheet, playing once, on a pool slot. `max` is the sheet's own
     authored duration so the frame index is just how far through its life the
     slot is. No object, no timer, no animation built per bang. */
  function playSheet(x, y, si, size, drift) {
    var sh = sheets[si];
    if (sh.dur <= 0) return;
    var p = take();
    p.active = true; p.kind = 2; p.sheet = si; p.ci = 0;
    p.x = x; p.y = y;
    if (drift) {
      var a = rnd() * Math.PI * 2;
      p.vx = Math.cos(a) * drift; p.vy = Math.sin(a) * drift;
    } else { p.vx = 0; p.vy = 0; }
    p.rot = rnd() * Math.PI * 2;
    p.max = sh.dur; p.life = sh.dur;
    p.size = size;
  }

  /* The ring is drained the instant it is filled — sim.js clears it at the top
     of every step(), so anything not read here is gone. With the art loaded an
     explosion is a sheet plus a thinner spark burst; without it, it is the
     ring-and-sparks this screen has always drawn. */
  function drainEvents(w) {
    var fx = sheets !== null;
    for (var i = 0; i < w.eventCount; i++) {
      var e = w.events[i], a = e.a, sz;
      switch (e.type) {
        case 'hit':
          burst(e.x, e.y, 3, PC_FIRE, 6, 0.28, 0.10); break;

        case 'explosion':
          if (fx) {
            playSheet(e.x, e.y, SH_EXPL, expSize[EX_MISSILE], 0);
            burst(e.x, e.y, 4, PC_GOLD, 6, 0.5, 0.12);
          } else {
            ring(e.x, e.y, PC_FIRE, (a > 0.5 ? a : 0.5) * 2.2, 0.34);
            burst(e.x, e.y, 8, PC_FIRE, 9, 0.46, 0.16);
            burst(e.x, e.y, 3, PC_GOLD, 5, 0.6, 0.12);
          }
          break;

        case 'shieldhit':
          ring(e.x, e.y, PC_SHIELD, 1.4, 0.26);
          burst(e.x, e.y, 3, PC_SHIELD, 5, 0.3, 0.09);
          break;

        case 'destroy':
          if (fx) {
            playSheet(e.x, e.y, SH_EXPL, expSize[EX_MODULE], 0);
            playSheet(e.x, e.y, SH_SMOKE, smkSize[EX_MODULE], 1.5);
            burst(e.x, e.y, 5, PC_FIRE, 10, 0.7, 0.16);
          } else {
            ring(e.x, e.y, PC_GOLD, (a > 1 ? a : 1) * 1.6, 0.4);
            burst(e.x, e.y, 10, PC_FIRE, 10, 0.7, 0.18);
            burst(e.x, e.y, 4, PC_WHITE, 7, 0.34, 0.12);
          }
          break;

        case 'shipdown':
          if (fx) {
            playSheet(e.x, e.y, SH_EXPL, expSize[EX_SHIP], 0);
            playSheet(e.x, e.y, SH_SMOKE, smkSize[EX_SHIP], 2.5);
            burst(e.x, e.y, 14, PC_FIRE, 16, 1.2, 0.26);
            burst(e.x, e.y, 6, PC_GOLD, 12, 1.0, 0.2);
          } else {
            ring(e.x, e.y, PC_GOLD, 14, 0.9);
            ring(e.x, e.y, PC_WHITE, 9, 0.6);
            burst(e.x, e.y, 26, PC_FIRE, 16, 1.2, 0.28);
            burst(e.x, e.y, 10, PC_GOLD, 12, 1.0, 0.2);
          }
          break;

        case 'intercept':
          burst(e.x, e.y, 4, PC_PD, 7, 0.24, 0.09); break;
        case 'pdshot':
          burst(e.x, e.y, 2, PC_PD, 5, 0.2, 0.08); break;

        case 'junkbreak':
          if (fx) playSheet(e.x, e.y, SH_EXPL, expSize[EX_JUNK], 0);
          burst(e.x, e.y, 5, PC_JUNK, 6, 0.5, 0.14);
          break;

        case 'mineblast':
          if (fx) {
            playSheet(e.x, e.y, SH_EXPL, expSize[EX_MINE], 0);
            burst(e.x, e.y, 5, PC_PINK, 9, 0.5, 0.14);
          } else {
            ring(e.x, e.y, PC_PINK, 3, 0.4);
            burst(e.x, e.y, 9, PC_FIRE, 11, 0.6, 0.18);
          }
          break;

        case 'warp':
          ring(e.x, e.y, PC_PD, 7, 0.5);
          burst(e.x, e.y, 8, PC_PD, 6, 0.45, 0.13);
          break;
      }
    }
  }

  function stepParticles(dt) {
    for (var i = 0; i < P_N; i++) {
      var p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.kind !== 1) {                       /* rings stay where they burst */
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.94; p.vy *= 0.94;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* camera                                                            */
  /* ---------------------------------------------------------------- */

  /* Frame the midpoint of the two ships and zoom so both bubbles stay inside
     the band with a margin. Both the position and the zoom chase their target
     with a lerp whose rate is expressed per 1/60s and converted for the real
     dt, so a 30fps frame moves exactly as far as two 60fps frames — and an
     epsilon closes the last sliver, because a value that never quite arrives
     is a value that shimmers. */
  function updateCamera(dt, snap) {
    if (!world) return;
    var a = world.ships[0], b = world.ships[1];
    cam.tx = (a.x + b.x) / 2;
    cam.ty = (a.y + b.y) / 2;

    var rad = a.brad > b.brad ? a.brad : b.brad;
    var px = Math.abs(a.x - b.x) / 2 + rad + CAM_MARGIN;
    var py = Math.abs(a.y - b.y) / 2 + rad + CAM_MARGIN;
    if (!(px > 1)) px = 1;
    if (!(py > 1)) py = 1;
    var z = HALF_W / px, zy = HALF_H / py;
    if (zy < z) z = zy;
    if (z > CAM_ZMAX) z = CAM_ZMAX; else if (z < CAM_ZMIN) z = CAM_ZMIN;
    cam.tz = z;

    if (snap) { cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; return; }

    var kp = 1 - Math.pow(1 - CAM_POS_RATE, dt * 60);
    var kz = 1 - Math.pow(1 - CAM_ZOOM_RATE, dt * 60);
    cam.x += (cam.tx - cam.x) * kp;
    cam.y += (cam.ty - cam.y) * kp;
    cam.z += (cam.tz - cam.z) * kz;
    if (Math.abs(cam.tx - cam.x) < CAM_POS_EPS)  cam.x = cam.tx;
    if (Math.abs(cam.ty - cam.y) < CAM_POS_EPS)  cam.y = cam.ty;
    if (Math.abs(cam.tz - cam.z) < CAM_ZOOM_EPS) cam.z = cam.tz;
  }

  /* ---------------------------------------------------------------- */
  /* the battlefield                                                   */
  /* ---------------------------------------------------------------- */

  var TAU = Math.PI * 2;

  /* One frame of a sheet. The source rectangle is read out of the arrays built
     in `enter`; nothing is computed and nothing is allocated. The unrotated
     path skips the transform entirely, which is the common one. */
  function blit(ctx, sh, f, x, y, size, rot) {
    if (!(size > 0)) return;
    if (size < 4) size = 4;
    var h = size / 2;
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sh.img, sh.fx[f], sh.fy[f], sh.fw, sh.fh, -h, -h, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(sh.img, sh.fx[f], sh.fy[f], sh.fw, sh.fh, x - h, y - h, size, size);
    }
  }

  /* The hand-painted backdrop: one 512x512 tile, scaled up and scrolled at a
     fraction of the star layers so it reads as very far away. At tileScale 2.2
     that is a 1126px tile over a 1333x690 stage — at most six drawImage calls,
     and usually four. Drawn only once it has arrived; the fight starts on the
     procedural field and the nebula fades in behind it. */
  function drawBackdrop(ctx) {
    var im = bgImg;
    if (!im || !im.complete || !im.naturalWidth) return;
    var tw = im.naturalWidth * bgScale, th = im.naturalHeight * bgScale;
    if (!(tw > 8) || !(th > 8)) return;

    var ox = -(cam.x * cam.z * bgPar) % tw; if (ox > 0) ox -= tw;
    var oy = -(cam.y * cam.z * bgPar) % th; if (oy > 0) oy -= th;

    ctx.globalAlpha = bgAlpha;
    for (var y = oy; y < VH; y += th) {
      for (var x = ox; x < VW; x += tw) ctx.drawImage(im, x, y, tw, th);
    }
    ctx.globalAlpha = 1;
  }

  /* A cheap parallax field: one screenful of points, scrolled modulo the
     stage. Three layers, three fillStyle changes, no surfaces. */
  function drawStars(ctx) {
    drawBackdrop(ctx);
    for (var l = 0; l < 3; l++) {
      ctx.fillStyle = C_STAR[l];
      var p = 0.10 + l * 0.13;
      for (var i = 0; i < STAR_N; i++) {
        if (starL[i] !== l) continue;
        var sx = (starX[i] - cam.x * cam.z * p) % VW; if (sx < 0) sx += VW;
        var sy = (starY[i] - cam.y * cam.z * p) % VH; if (sy < 0) sy += VH;
        ctx.fillRect(sx, sy, starS[i], starS[i]);
      }
    }
  }

  function drawShip(ctx, rec) {
    var ship = rec.ship, cs = cam.z, i;
    var sx = (ship.x - cam.x) * cs + CX;
    var sy = (ship.y - cam.y) * cs + CY;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ship.rot + Math.PI / 2);
    if (ship.destroyed) ctx.globalAlpha = 0.55;

    /* bare hull under the fit, so holes read as holes */
    if (cs >= 5) {
      var half = cs * 0.5 - (cs > 14 ? 1.2 : 0.4), side = half * 2;
      ctx.fillStyle = C_HULL;
      ctx.beginPath();
      for (i = 0; i < rec.cellCount; i++) {
        ctx.rect(rec.cells[i * 2] * cs - half, rec.cells[i * 2 + 1] * cs - half, side, side);
      }
      ctx.fill();
    }

    var rad = cs > 14 ? 3 : 1.5, pad = cs > 14 ? 1.2 : 0.4;
    var art = cs >= 10;                 /* below this a cell is a smudge     */
    var fx = art && sheets !== null;
    for (i = 0; i < rec.mods.length; i++) {
      var r = rec.mods[i], m = r.m;
      var mw = m.w * cs - pad * 2, mh = m.h * cs - pad * 2;
      var x = m.lx * cs - m.w * cs / 2 + pad, y = m.ly * cs - m.h * cs / 2 + pad;

      if (!m.alive) {
        fillRR(ctx, x, y, mw, mh, rad, C_DEAD);
        strokeRR(ctx, x, y, mw, mh, rad, C_DEAD_EDGE, 1);
        continue;
      }
      var hf = m.maxHealth > 0 ? m.health / m.maxHealth : 1;
      var step = ((1 - hf) * (TINT_STEPS - 1)) | 0;
      if (step < 0) step = 0; else if (step > TINT_STEPS - 1) step = TINT_STEPS - 1;

      fillRR(ctx, x, y, mw, mh, rad, r.fills[step]);
      if (art && r.img && r.img.complete && r.img.naturalWidth) {
        ctx.globalAlpha = ship.destroyed ? 0.5 : 0.9;
        ctx.drawImage(r.img, x, y, mw, mh);
        ctx.globalAlpha = ship.destroyed ? 0.55 : 1;
      }
      strokeRR(ctx, x, y, mw, mh, rad, r.edges[step], 1.1);

      /* a module with no power gets the energy sheet crackling over it —
         the flat dim panel it used to get is the fallback for zoom levels
         where a 64px sprite is not worth uploading */
      if (!m.powered) {
        if (fx) {
          fillRR(ctx, x, y, mw, mh, rad, C_OFFLINE);
          var es = (mw < mh ? mw : mh) * 1.1;
          ctx.globalAlpha = sheets[SH_ENERGY].alpha * (ship.destroyed ? 0.55 : 1);
          blit(ctx, sheets[SH_ENERGY], eFrame, x + mw / 2, y + mh / 2, es, 0);
          ctx.globalAlpha = ship.destroyed ? 0.55 : 1;
        } else {
          fillRR(ctx, x, y, mw, mh, rad, C_UNPOWERED);
        }
      }

      /* and a module a bay is patching gets the repair sheet over it */
      if (fx && r.rept > 0) {
        var rf = (((1 - r.rept / REPAIR_SHOW) * sheets[SH_REPAIR].frames) | 0);
        if (rf < 0) rf = 0;
        else if (rf >= sheets[SH_REPAIR].frames) rf = sheets[SH_REPAIR].frames - 1;
        ctx.globalAlpha = sheets[SH_REPAIR].alpha * (ship.destroyed ? 0.55 : 1);
        blit(ctx, sheets[SH_REPAIR], rf, x + mw / 2, y + mh / 2,
             (mw < mh ? mw : mh) * 1.2, 0);
        ctx.globalAlpha = ship.destroyed ? 0.55 : 1;
      }

      if (m.flash > 0) {
        var fa = m.flash / 0.1; if (fa > 1) fa = 1;
        ctx.globalAlpha = fa * 0.75;
        fillRR(ctx, x, y, mw, mh, rad, '#ffffff');
        ctx.globalAlpha = ship.destroyed ? 0.55 : 1;
      }
    }

    /* shield bubbles, alpha tracking what is left in them */
    ctx.strokeStyle = C_SHIELD;
    ctx.lineWidth = cs * 0.09 > 1 ? cs * 0.09 : 1;
    for (i = 0; i < rec.mods.length; i++) {
      var sr = rec.mods[i], sm = sr.m;
      if (!sr.isShield || !sm.alive || !sm.powered) continue;
      if (!(sm.shieldMax > 0) || !(sm.shield > 0) || !(sm.shieldR > 0)) continue;
      ctx.globalAlpha = 0.10 + 0.42 * (sm.shield / sm.shieldMax);
      ctx.beginPath();
      ctx.arc(sm.lx * cs, sm.ly * cs, sm.shieldR * cs, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* One pass sorts the live pool into fixed index buckets, then each kind is
     drawn as a single batched path — or, where the weapon has art of its own
     and the camera is close enough for it to read, as a rotated sprite. The
     split is decided once per frame, not per projectile. */
  var bBall = null, bMiss = null, bIcpt = null, bJunk = null, bMine = null;
  var bBallS = null, bMissS = null;
  var nBall = 0, nMiss = 0, nIcpt = 0, nJunk = 0, nMine = 0, nBallS = 0, nMissS = 0;
  var spriteMode = false;

  function bucketProjectiles(w) {
    nBall = nMiss = nIcpt = nJunk = nMine = nBallS = nMissS = 0;
    spriteMode = sheets !== null && cam.z >= Z_SPRITE;
    var ps = w.projectiles, fx;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!p.active) continue;
      switch (p.kind) {
        case Sim.KIND.BALLISTIC:
          fx = (spriteMode && p.src) ? projFX[p.src.key] : null;
          if (fx) bBallS[nBallS++] = i; else bBall[nBall++] = i;
          break;
        case Sim.KIND.MISSILE:
          fx = (spriteMode && p.src) ? projFX[p.src.key] : null;
          if (fx) bMissS[nMissS++] = i; else bMiss[nMiss++] = i;
          break;
        case Sim.KIND.INTERCEPT: bIcpt[nIcpt++] = i; break;
        case Sim.KIND.JUNK:      bJunk[nJunk++] = i; break;
        case Sim.KIND.MINE:      bMine[nMine++] = i; break;
      }
    }
  }

  function drawProjectiles(ctx, w) {
    var cs = cam.z, ps = w.projectiles, i, p, x, y, px, py, fx;

    /* junk — the debris sheet's sixteen chunks, one per projectile, picked off
       the pool index so a given chunk keeps its shape for its whole life */
    if (nJunk) {
      if (spriteMode) {
        var jsh = sheets[SH_JUNK], jbase = jsh.scale * jsh.fw * cs;
        ctx.globalAlpha = jsh.alpha;
        for (i = 0; i < nJunk; i++) {
          p = ps[bJunk[i]];
          x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
          blit(ctx, jsh, p.idx % jsh.frames, x, y, jbase, p.rot);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = C_JUNK;
        ctx.beginPath();
        for (i = 0; i < nJunk; i++) {
          p = ps[bJunk[i]];
          x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
          var jr = p.radius * cs; if (jr < 1.2) jr = 1.2;
          var jc = Math.cos(p.rot) * jr, js = Math.sin(p.rot) * jr;
          ctx.moveTo(x + jc, y + js);
          ctx.lineTo(x - js, y + jc);
          ctx.lineTo(x - jc, y - js);
          ctx.lineTo(x + js, y - jc);
          ctx.closePath();
        }
        ctx.fill();
      }
    }

    /* mines — the mine sprite, pulsing, or the procedural dot */
    if (nMine) {
      var pulse = 0.72 + 0.28 * Math.sin(w.time * 5);
      if (spriteMode) {
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        for (i = 0; i < nMine; i++) {
          p = ps[bMine[i]];
          fx = p.src ? projFX[p.src.key] : null;
          if (!fx) continue;
          x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot + fx.rot);
          var ms = fx.img.naturalHeight * fx.scale * cs * pulse;
          if (ms < 4) ms = 4;
          ctx.drawImage(fx.img, -ms / 2, -ms / 2, ms, ms);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = C_MINE;
        ctx.globalAlpha = 0.55 + 0.35 * pulse;
        ctx.beginPath();
        for (i = 0; i < nMine; i++) {
          p = ps[bMine[i]];
          x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
          var mr = p.radius * cs * pulse; if (mr < 1.5) mr = 1.5;
          ctx.moveTo(x + mr, y);
          ctx.arc(x, y, mr, 0, TAU);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /* missile exhaust stays a batched stroke whether or not the dart is art —
       a smoke puff per missile per frame would empty the particle pool in
       about a second */
    if (nMiss || nMissS) {
      ctx.strokeStyle = C_MTRAIL;
      ctx.lineWidth = cs * 0.14 > 1 ? cs * 0.14 : 1;
      ctx.beginPath();
      for (i = 0; i < nMiss; i++) {
        p = ps[bMiss[i]];
        x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
        ctx.moveTo(x - Math.cos(p.rot) * cs * 1.3, y - Math.sin(p.rot) * cs * 1.3);
        ctx.lineTo(x, y);
      }
      for (i = 0; i < nMissS; i++) {
        p = ps[bMissS[i]];
        x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
        ctx.moveTo(x - Math.cos(p.rot) * cs * 1.3, y - Math.sin(p.rot) * cs * 1.3);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    /* missiles with art */
    for (i = 0; i < nMissS; i++) {
      p = ps[bMissS[i]];
      fx = projFX[p.src.key];
      if (!fx) continue;
      drawProjSprite(ctx, p, fx, cs);
    }

    /* missiles without — the old dart */
    if (nMiss) {
      ctx.fillStyle = C_MISSILE;
      ctx.beginPath();
      for (i = 0; i < nMiss; i++) {
        p = ps[bMiss[i]];
        x = (p.x - cam.x) * cs + CX; y = (p.y - cam.y) * cs + CY;
        var dc = Math.cos(p.rot), ds = Math.sin(p.rot);
        var ln = cs * 0.42; if (ln < 2) ln = 2;
        var wd = ln * 0.45;
        ctx.moveTo(x + dc * ln, y + ds * ln);
        ctx.lineTo(x - dc * ln - ds * wd, y - ds * ln + dc * wd);
        ctx.lineTo(x - dc * ln + ds * wd, y - ds * ln - dc * wd);
        ctx.closePath();
      }
      ctx.fill();
    }

    /* bullets with art */
    for (i = 0; i < nBallS; i++) {
      p = ps[bBallS[i]];
      fx = projFX[p.src.key];
      if (!fx) continue;
      drawProjSprite(ctx, p, fx, cs);
    }

    /* bullets without — short tracers from last position to this one */
    if (nBall) {
      ctx.strokeStyle = C_BULLET;
      ctx.lineWidth = cs * 0.08 > 1 ? cs * 0.08 : 1;
      ctx.beginPath();
      for (i = 0; i < nBall; i++) {
        p = ps[bBall[i]];
        px = (p.px - cam.x) * cs + CX; py = (p.py - cam.y) * cs + CY;
        x  = (p.x  - cam.x) * cs + CX; y  = (p.y  - cam.y) * cs + CY;
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    /* interceptors — purple, blunter, obviously not a bullet */
    if (nIcpt) {
      ctx.strokeStyle = C_INTERCEPT;
      ctx.lineWidth = cs * 0.16 > 1.5 ? cs * 0.16 : 1.5;
      ctx.beginPath();
      for (i = 0; i < nIcpt; i++) {
        p = ps[bIcpt[i]];
        px = (p.px - cam.x) * cs + CX; py = (p.py - cam.y) * cs + CY;
        x  = (p.x  - cam.x) * cs + CX; y  = (p.y  - cam.y) * cs + CY;
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /* One weapon's round, nose along its travel direction. `scale` in the config
     is world units per source pixel, so the size follows the camera the same
     way a ship does; `rotationOffset` is there because every sprite in the set
     is painted pointing up. */
  function drawProjSprite(ctx, p, fx, cs) {
    var im = fx.img;
    if (!im.complete || !im.naturalWidth) return;
    var w2 = im.naturalWidth * fx.scale * cs;
    var h2 = im.naturalHeight * fx.scale * cs;
    if (h2 < 4) { h2 = 4; w2 = 4 * (im.naturalWidth / im.naturalHeight); }
    ctx.save();
    ctx.translate((p.x - cam.x) * cs + CX, (p.y - cam.y) * cs + CY);
    ctx.rotate(p.rot + fx.rot);
    ctx.drawImage(im, -w2 / 2, -h2 / 2, w2, h2);
    ctx.restore();
  }

  function drawBeams(ctx, w) {
    var cs = cam.z, any = false, i, b;
    for (i = 0; i < w.beams.length; i++) if (w.beams[i].active) { any = true; break; }
    if (!any) return;

    ctx.strokeStyle = C_BEAM;
    ctx.lineWidth = cs * 0.22 > 2 ? cs * 0.22 : 2;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (i = 0; i < w.beams.length; i++) {
      b = w.beams[i];
      if (!b.active) continue;
      ctx.moveTo((b.x1 - cam.x) * cs + CX, (b.y1 - cam.y) * cs + CY);
      ctx.lineTo((b.x2 - cam.x) * cs + CX, (b.y2 - cam.y) * cs + CY);
    }
    ctx.stroke();

    ctx.strokeStyle = C_BEAM_CORE;
    ctx.lineWidth = cs * 0.07 > 1 ? cs * 0.07 : 1;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (i = 0; i < w.beams.length; i++) {
      b = w.beams[i];
      if (!b.active) continue;
      ctx.moveTo((b.x1 - cam.x) * cs + CX, (b.y1 - cam.y) * cs + CY);
      ctx.lineTo((b.x2 - cam.x) * cs + CX, (b.y2 - cam.y) * cs + CY);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx) {
    var cs = cam.z;
    for (var i = 0; i < P_N; i++) {
      var p = particles[i];
      if (!p.active) continue;
      var f = p.life / p.max;
      var x = (p.x - cam.x) * cs + CX, y = (p.y - cam.y) * cs + CY;
      /* the cull margin follows the thing's own size: a ship-death sheet is
         sixteen world units across and would otherwise vanish the moment its
         centre left the stage */
      var cull = p.size * cs * 0.6 + 40;
      if (x < -cull || x > VW + cull || y < -cull || y > VH + cull) continue;

      if (p.kind === 2) {
        var sh = sheets && sheets[p.sheet];
        if (!sh || !sh.img.complete || !sh.img.naturalWidth) continue;
        var fr = (((1 - f) * sh.frames) | 0);
        if (fr < 0) fr = 0; else if (fr >= sh.frames) fr = sh.frames - 1;
        ctx.globalAlpha = sh.alpha;
        blit(ctx, sh, fr, x, y, p.size * cs, p.rot);
        ctx.globalAlpha = 1;
        continue;
      }

      var a = (f * PA_STEPS) | 0;
      if (a >= PA_STEPS) a = PA_STEPS - 1; else if (a < 0) a = 0;
      if (p.kind === 1) {
        var rr2 = (1 - f) * p.size * cs + 1;
        ctx.strokeStyle = PC[p.ci * PA_STEPS + a];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rr2, 0, TAU);
        ctx.stroke();
      } else {
        var s = p.size * cs; if (s < 1) s = 1;
        ctx.fillStyle = PC[p.ci * PA_STEPS + a];
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* HUD                                                               */
  /* ---------------------------------------------------------------- */

  /* The clock is the only string the fight rebuilds, and only when the whole
     second changes. The design prints it zero-padded: 01:47. */
  function clock(t) {
    var sec = t | 0;
    if (sec !== clockSec) {
      clockSec = sec;
      var mm = (sec / 60) | 0, ss = sec % 60;
      clockStr = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    return clockStr;
  }

  /* ---------------------------------------------------------------- */
  /* the action feed                                                   */
  /* ---------------------------------------------------------------- */
  /* The design's toasts are plain text with no panel behind them, newest on
     top pushing the rest down, five deep, the fifth nearly gone.
     WHERE THE LINES COME FROM: the sim's event ring carries positions, not
     damage numbers or module names, and it is a hot path I am not widening for
     a caption. Everything below is read off the render records this screen
     already walks every frame — a module that was alive last frame and is not
     now, a shield that just went flat, a reactor bus that just browned out. */

  var toasts = [];                     /* newest first, at most five */
  var lastDmgOut = 0, dmgAccum = 0, dmgTimer = 0;
  var pBrown = false, eBrown = false;

  function toast(msg, tint) {
    toasts.unshift({ s: msg, tint: tint || T.ink });
    if (toasts.length > TOAST.n) toasts.length = TOAST.n;
  }

  /* A module's display name is far too long for a 14px line — the design uses
     three-letter codes, and `initials` in theme.js is where one comes from. */
  function code(mod) { return initials(mod.displayName || mod.key); }

  function watchShip(rec, mine) {
    if (!rec) return;
    for (var i = 0; i < rec.mods.length; i++) {
      var r = rec.mods[i];
      if (r.wasAlive === undefined) { r.wasAlive = r.m.alive; r.wasShield = r.m.shield; continue; }
      if (r.wasAlive && !r.m.alive) {
        toast(code(r.m.mod) + (mine ? ' LOST' : ' DOWN'), mine ? T.warn : T.ink);
      }
      if (r.isShield && r.wasShield > 0 && r.m.shield <= 0) {
        toast('SHIELD BREACH · ' + (mine ? 'YOU' : eName.toUpperCase()),
              mine ? T.warn : T.cat.shield);
      }
      r.wasAlive = r.m.alive; r.wasShield = r.m.shield;
    }
  }

  /* One damage line a second, so the feed reads as a fight and not a log. */
  function watchDamage(w, dt) {
    dmgAccum += w.player.dmgOut - lastDmgOut;
    lastDmgOut = w.player.dmgOut;
    dmgTimer += dt;
    if (dmgTimer < 1) return;
    dmgTimer = 0;
    if (dmgAccum >= 1) toast('DMG OUT · ' + Math.round(dmgAccum), '#F0F7FA');
    dmgAccum = 0;

    if (w.player.brownout !== pBrown) {
      pBrown = w.player.brownout;
      if (pBrown) toast('POWER BROWNOUT · YOU', T.warn);
    }
    if (w.enemy.brownout !== eBrown) {
      eBrown = w.enemy.brownout;
      if (eBrown) toast('POWER BROWNOUT · THEM', T.ready);
    }
  }

  function drawToasts(ctx) {
    var y = TOAST.y;
    for (var i = 0; i < toasts.length; i++) {
      ctx.save();
      ctx.globalAlpha = TOAST_A[i];
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
      text(ctx, toasts[i].s, TOAST.x, y + TOAST_SZ[i] / 2,
           { font: T.mono(TOAST_SZ[i]), fill: toasts[i].tint,
             align: 'right', baseline: 'middle', track: 0.6 });
      ctx.restore();
      y += TOAST_SZ[i] + TOAST.gap;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 1c chrome                                                         */
  /* ---------------------------------------------------------------- */

  function arenaGround(ctx) {
    ctx.fillStyle = '#04060A';
    ctx.fillRect(0, 0, VW, VH);
    vignette(ctx, VW, VH, 0.90, 1.20, 0.50, 0.45, '#0A151D', 'rgba(4,6,10,0)', 0.70);
    ctx.strokeStyle = 'rgba(120,170,200,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= VW; x += 46) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VH); }
    for (var y = 0; y <= VH; y += 46) { ctx.moveTo(0, y + 0.5); ctx.lineTo(VW, y + 0.5); }
    ctx.stroke();
  }

  /* LIVE pill, top centre. Width is measured because the clock is mono and the
     label is tracked, and the design pins the centre. */
  function drawClockPill(ctx, w) {
    var on = live();
    var lab = on ? 'LIVE' : 'READY';
    var t = clock(w.time);
    ctx.font = T.head(11);
    var wl = ctx.measureText(lab).width + 2 * lab.length;
    ctx.font = T.mono(15);
    var wt = ctx.measureText(t).width + 1 * t.length;
    var pw = 16 + 7 + 12 + wl + 12 + wt + 16, ph = 32;
    var x = (VW - pw) / 2, y = 14;

    fillRR(ctx, x, y, pw, ph, 16, 'rgba(6,12,16,0.82)');
    strokeRR(ctx, x, y, pw, ph, 16, T.edge, 1);
    var mid = y + ph / 2;
    fillRR(ctx, x + 16, mid - 3.5, 7, 7, 3.5, on ? T.cat.ballistic : T.muted);
    text(ctx, lab, x + 16 + 7 + 12, mid,
         { font: T.head(11), fill: '#8FA3B0', baseline: 'middle', track: 2 });
    text(ctx, t, x + 16 + 7 + 12 + wl + 12, mid,
         { font: T.mono(15), fill: '#EAF5FA', baseline: 'middle', track: 1 });
  }

  /* pause . 1x . 2x . 4x — the only thing the player may touch, plus the way
     out beside it. Pause is a state like any other speed, so when it is on it
     wears the same accent fill the speed buttons wear; it used to get a dim
     grey highlight of its own, which read as "unavailable" rather than "this
     is the one you are in". */
  function drawSpeed(ctx) {
    fillRR(ctx, SPD.x, SPD.y, SPD.w, SPD.h, 8, 'rgba(6,12,16,0.85)');
    strokeRR(ctx, SPD.x, SPD.y, SPD.w, SPD.h, 8, T.edgeUp, 1);
    for (var i = 0; i < 4; i++) {
      var r = { x: SPD.x + 3 + i * (SPD_CELL + 3), y: SPD.y + 3, w: SPD_CELL, h: SPD_CH };
      var on = i === 0 ? paused : (!paused && speedIx === i - 1);
      if (on) fillRR(ctx, r.x, r.y, r.w, r.h, 5, T.accent);
      if (i === 0) {
        icon(ctx, 'pause', r.x + r.w / 2, r.y + r.h / 2, 15,
             on ? T.onAccent : '#8FA3B0', 2);
      } else {
        text(ctx, SPD_LBL[i], r.x + r.w / 2, r.y + r.h / 2,
             { font: T.mono(12, on ? 600 : 400),
               fill: on ? T.onAccent : '#8FA3B0',
               align: 'center', baseline: 'middle' });
      }
      if (UI.zone(r, 'toggle')) {
        if (i === 0) paused = !paused;
        else { paused = false; speedIx = i - 1; Save.setMatchSpeed(speedIx); }
      }
    }
  }

  /* Live shield charge across a ship's shield modules. */
  function shieldNow(ship) {
    var cur = 0;
    for (var i = 0; i < ship.modules.length; i++) {
      var m = ship.modules[i];
      if (m.subtype === 'shield' && m.alive) cur += m.shield > 0 ? m.shield : 0;
    }
    return cur;
  }

  function kfmt(n) {
    n = Math.round(n || 0);
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  /* The two status panels are identical in structure and width; only the
     border, the name tint and the badge differ. */
  function statusPanel(ctx, r, o) {
    fillRR(ctx, r.x, r.y, r.w, r.h, 8, 'rgba(6,12,16,0.85)');
    strokeRR(ctx, r.x, r.y, r.w, r.h, 8, o.edge, 1);

    var x = r.x + 11, w2 = r.w - 22, y = r.y + 9;

    ctx.font = T.mono(10);
    var bw = ctx.measureText(o.badge).width + 8;
    text(ctx, fitText(ctx, o.name.toUpperCase(), w2 - bw - 7, T.head(15, 700)), x, y + 9,
         { font: T.head(15, 700), fill: o.nameTint, baseline: 'middle', track: 1.6 });
    strokeRR(ctx, x + w2 - bw, y + 2, bw, 14, 2, o.badgeEdge, 1);
    text(ctx, o.badge, x + w2 - bw / 2, y + 9,
         { font: T.mono(10), fill: o.badgeTint, align: 'center', baseline: 'middle' });
    text(ctx, o.meta, x, y + 27, { font: T.mono(10), fill: o.metaTint, baseline: 'middle' });

    y = r.y + 9 + 34 + 7;
    statBar(ctx, x, y, w2, 'SHD', o.shd, o.shdMax, T.cat.shield, '#8A6AD8', '#BB9BFF', '#D3C0FF');
    y += 13 + 7;
    statBar(ctx, x, y, w2, 'HULL', o.hull, o.hullMax, '#A9BDC8', T.steelLo, T.steelHi, T.ink);
  }

  function statBar(ctx, x, y, w2, label, cur, max, labelTint, c0, c1, valTint) {
    text(ctx, label, x, y + 6,
         { font: T.head(11), fill: labelTint, baseline: 'middle', track: 1.4 });
    var bx = x + 32 + 7, bw = w2 - 32 - 7 - 46 - 7 * 2, by = y + 2;
    fillRR(ctx, bx, by, bw, 9, 2, T.track);
    var f = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
    if (f > 0) {
      var g = ctx.createLinearGradient(bx, by, bx + bw, by);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      fillRR(ctx, bx, by, Math.max(2, bw * f), 9, 2, g);
    }
    text(ctx, kfmt(cur), x + w2, y + 6,
         { font: T.mono(11), fill: valTint, align: 'right', baseline: 'middle' });
  }

  function drawStatus(ctx, w) {
    var pd = Data.ship(w.player.key), ed = Data.ship(w.enemy.key);
    var dist = Math.round(Math.hypot(w.enemy.x - w.player.x, w.enemy.y - w.player.y));

    statusPanel(ctx, P_PANEL, {
      edge: T.edge, nameTint: '#EAF5FA',
      name: pd ? pd.displayName : 'YOUR SHIP',
      badge: 'T' + (pd ? Progress.tierOf(pd) : 1),
      badgeEdge: T.accent, badgeTint: T.accent, metaTint: T.muted,
      meta: 'FIT ' + (opts.fitIndex === undefined ? 1 : opts.fitIndex + 1) +
            ' · ' + w.player.modules.length + ' MODULES',
      shd: shieldNow(w.player), shdMax: pShieldMax,
      hull: w.player.healthFrac * w.player.maxHealthTotal, hullMax: w.player.maxHealthTotal
    });

    statusPanel(ctx, E_PANEL, {
      edge: 'rgba(228,85,74,0.4)', nameTint: '#F6E8E6',
      name: ed ? ed.displayName : 'CONTACT',
      badge: 'T' + (opponent.tier || (ed ? Progress.tierOf(ed) : 1)),
      badgeEdge: 'rgba(228,85,74,0.6)', badgeTint: '#FF8A80', metaTint: '#B98B86',
      meta: opponent.name.toUpperCase() + ' · ' + dist + ' M',
      shd: shieldNow(w.enemy), shdMax: eShieldMax,
      hull: w.enemy.healthFrac * w.enemy.maxHealthTotal, hullMax: w.enemy.maxHealthTotal
    });
  }

  /* ---- the opening, drawn ----------------------------------------------
     Handoff 1c. The dim sheet first, then whichever card the phase is on. All
     of it is painted OVER the arena and under the HUD chrome, so the fight is
     visibly warming up behind the card rather than cutting in when it goes. */
  function drawOpening(ctx, w) {
    var d = dimNow();
    if (d > 0) {
      ctx.fillStyle = 'rgba(2,4,6,' + d.toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    var ph = phase();
    if (ph === 'intro') drawVersus(ctx, w);
    else if (ph === 'c3' || ph === 'c2' || ph === 'c1') drawCount(ctx, ph);
    else if (ph === 'fight') drawFight(ctx);
  }

  /* Fade a whole card in over its first 220ms, so nothing pops. */
  function cardAlpha(from) {
    var k = (introT - from) / 0.22;
    return k >= 1 ? 1 : k < 0 ? 0 : k;
  }

  function drawVersus(ctx, w) {
    var pd = Data.ship(w.player.key), ed = Data.ship(w.enemy.key);
    var tier = opponent.tier || (ed ? Progress.tierOf(ed) : 1);
    var tn = Progress.tier(tier);
    var cy = VH / 2;

    ctx.save();
    ctx.globalAlpha = cardAlpha(0.15);

    text(ctx, 'ARENA \u00b7 ' + ((tn && tn.label) || 'TIER').toUpperCase() + ' T' + tier,
         VW / 2, cy - 74,
         { font: T.mono(12), fill: T.accent, align: 'center', baseline: 'middle', track: 4 });

    /* two names either side of a VS, measured so the pair centres as a group */
    var pn = (pd ? pd.displayName : 'YOUR HULL').toUpperCase();
    var en = (ed ? ed.displayName : 'CONTACT').toUpperCase();
    ctx.font = T.head(44, 700);
    var pw2 = ctx.measureText(pn).width + 4 * pn.length;
    var ew = ctx.measureText(en).width + 4 * en.length;
    ctx.font = T.head(20, 600);
    var vw = ctx.measureText('VS').width + 3 * 2;
    var gap = 34;
    var left = VW / 2 - (pw2 + gap + vw + gap + ew) / 2;

    text(ctx, pn, left, cy - 4,
         { font: T.head(44, 700), fill: '#EAF5FA', baseline: 'middle', track: 4 });
    text(ctx, 'CAPTAIN ' + Save.summary(Save.pilot()).name.toUpperCase() +
              ' \u00b7 T' + Progress.tierOf(pd) +
              ' \u00b7 FIT ' + ((opts.fitIndex === undefined ? 0 : opts.fitIndex) + 1),
         left, cy + 30,
         { font: T.mono(12), fill: T.accent, baseline: 'middle' });

    text(ctx, 'VS', left + pw2 + gap, cy - 4,
         { font: T.head(20, 600), fill: '#6F8795', baseline: 'middle', track: 3 });

    var ex = left + pw2 + gap + vw + gap;
    text(ctx, en, ex, cy - 4,
         { font: T.head(44, 700), fill: '#F6DEDB', baseline: 'middle', track: 4 });
    /* the pilot handle, not the hull — the hull is the 44px line above it */
    var handle = (opponent.callsign || opponent.name).toUpperCase();
    text(ctx, handle + ' \u00b7 T' + tier, ex, cy + 30,
         { font: T.mono(12), fill: '#FF8A80', baseline: 'middle' });
    ctx.restore();
  }

  function drawCount(ctx, ph) {
    var n = ph === 'c3' ? '3' : ph === 'c2' ? '2' : '1';
    var from = ph === 'c3' ? INTRO[0].end : ph === 'c2' ? INTRO[1].end : INTRO[2].end;
    /* each digit lands hard and then eases back — the pop is the tick */
    var k = (introT - from) / 0.85;
    var sc = 1 + 0.16 * Math.max(0, 1 - k * 4.5);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.72) / 0.28);
    text(ctx, 'ENGAGING IN', VW / 2, VH / 2 - 78,
         { font: T.head(14, 600), fill: '#A9BDC8', align: 'center',
           baseline: 'middle', track: 4 });
    ctx.translate(VW / 2, VH / 2 + 22);
    ctx.scale(sc, sc);
    ctx.shadowColor = 'rgba(56,197,216,0.45)'; ctx.shadowBlur = 50;
    text(ctx, n, 0, 0,
         { font: T.mono(150, 600), fill: T.accent, align: 'center', baseline: 'middle' });
    ctx.restore();
  }

  function drawFight(ctx) {
    /* The band and the word fade together over the whole 500ms — this IS the
       "fade out after 500ms", not a hold followed by a cut. */
    var k = (introT - INTRO[3].end) / 0.5;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);

    var bh = 118, by = VH / 2 - bh / 2;
    var g = ctx.createLinearGradient(0, 0, VW, 0);
    g.addColorStop(0, 'rgba(56,197,216,0)');
    g.addColorStop(0.5, 'rgba(56,197,216,0.16)');
    g.addColorStop(1, 'rgba(56,197,216,0)');
    ctx.fillStyle = g; ctx.fillRect(0, by, VW, bh);
    ctx.fillStyle = 'rgba(56,197,216,0.35)';
    ctx.fillRect(0, by, VW, 1); ctx.fillRect(0, by + bh - 1, VW, 1);

    /* and it drifts outward as it goes, so the word leaves rather than blinks */
    ctx.translate(VW / 2, VH / 2);
    ctx.scale(1 + 0.08 * k, 1 + 0.08 * k);
    ctx.shadowColor = 'rgba(56,197,216,0.6)'; ctx.shadowBlur = 40;
    text(ctx, 'FIGHT', 0, 0,
         { font: T.head(96, 700), fill: '#EAF5FA', align: 'center',
           baseline: 'middle', track: 16 });
    ctx.restore();
  }

  var pShieldMax = 0, eShieldMax = 0;
  function measureShields(w) {
    function cap(ship) {
      var t = 0;
      for (var i = 0; i < ship.modules.length; i++) {
        var m = ship.modules[i];
        if (m.subtype === 'shield') t += (m.shieldCap || m.shieldMax || 0);
      }
      return t;
    }
    pShieldMax = cap(w.player); eShieldMax = cap(w.enemy);
  }

  function prepare(ctx) {
    prepared = true;
    if (world) {
      pName = fitText(ctx, Data.ship(world.player.key).displayName, 210, T.head(15, 700));
      eName = fitText(ctx, Data.ship(world.enemy.key).displayName, 210, T.head(15, 700));
    }
  }

  /* ---------------------------------------------------------------- */
  /* the result                                                        */
  /* ---------------------------------------------------------------- */
  /* This screen no longer PRESENTS a result — the design gives that its own
     three states (1d/1e/1f) and they need the level-up the hangar works out.
     All that happens here is assembling the facts while the world is still
     alive, then handing them over. */

  var result = null;

  function finish() {
    var w = world;
    var won = w.winner === 'player';
    var resWhy;

    if (w.reason === 'timeout') {
      resWhy = w.winner === 'draw' ? 'The clock ran out, dead even'
                                   : 'The clock ran out — ' +
                                     (won ? 'you were ahead on hull'
                                          : 'they were ahead on hull');
    } else if (w.reason === 'disarmed') {
      resWhy = won ? opponent.name + ' lost its last weapon'
                   : 'Your last weapon was shot away';
    } else {
      resWhy = won ? opponent.name + ' lost its last reactor'
                   : 'Your last reactor was destroyed';
    }


    /* How many of the player's modules died. Progression asks for this ("win
       without losing a single module") and it is only knowable here, while the
       world is still alive. */
    var lost = 0, pm = w.player.modules;
    for (var mi = 0; mi < pm.length; mi++) if (!pm[mi].alive) lost++;

    result = { opponentId: opponent.id, opponent: opponent, won: won,
               winner: w.winner, reason: w.reason, why: resWhy, time: w.time,
               playerHealth: w.player.healthFrac, enemyHealth: w.enemy.healthFrac,
               modulesLost: lost, moduleCount: pm.length,
               /* the four numbers the design's result screens report */
               dmgOut: w.player.dmgOut, dmgIn: w.player.dmgIn,
               accuracy: w.player.shotsFired > 0
                         ? w.player.shotsHit / w.player.shotsFired : 0,
               fitIndex: opts.fitIndex === undefined ? 0 : opts.fitIndex };
  }

  /* The world can fail to build — a fit the sim will not accept. There is no
     brief screen to fall back on now, so say so and offer the way out. */
  function drawFailed(ctx) {
    arenaGround(ctx);
    text(ctx, 'LAUNCH FAILED', VW / 2, VH / 2 - 30,
         { font: T.head(34, 700), fill: T.danger, align: 'center',
           baseline: 'middle', track: 6 });
    text(ctx, error || 'This fit could not be launched', VW / 2, VH / 2 + 6,
         { font: T.body(14), fill: T.subtitle, align: 'center', baseline: 'middle' });
    fillRR(ctx, BTN_BAIL.x, BTN_BAIL.y, BTN_BAIL.w, BTN_BAIL.h, 6, T.accent);
    text(ctx, 'HANGAR', BTN_BAIL.x + BTN_BAIL.w / 2, BTN_BAIL.y + BTN_BAIL.h / 2,
         { font: T.head(15, 700), fill: T.onAccent, align: 'center',
           baseline: 'middle', track: 2.4 });
    if (UI.zone(BTN_BAIL, 'back')) onDone(null);
  }

  /* ---------------------------------------------------------------- */
  /* the screen                                                        */
  /* ---------------------------------------------------------------- */

  return {
    enter: function () {
      Music.to('battle');
      buildTints();
      buildParticleColours();
      buildParticles();
      buildStars();
      buildEffects();
      pickBackdrop();

      try {
        world = Sim.create({ playerFit: opts.playerFit, enemyFit: opts.enemyFit,
                             seed: (opts.seed === undefined ? 1234 : opts.seed) });
      } catch (e) {
        world = null;
        error = 'Cannot start this battle — ' + (e && e.message ? e.message : e);
      }

      if (world) {
        measureShields(world);
        pShip = buildShipRecord(world.player);
        eShip = buildShipRecord(world.enemy);
        bBall = new Int16Array(Sim.POOL); bMiss = new Int16Array(Sim.POOL);
        bIcpt = new Int16Array(Sim.POOL); bJunk = new Int16Array(Sim.POOL);
        bMine = new Int16Array(Sim.POOL);
        bBallS = new Int16Array(Sim.POOL); bMissS = new Int16Array(Sim.POOL);
        updateCamera(0, true);
      }
    },

    exit: function () {
      world = null; pShip = null; eShip = null; particles = null;
      bBall = bMiss = bIcpt = bJunk = bMine = bBallS = bMissS = null;
      sheets = null; projFX = null; expSize = null; bgImg = null;
    },

    update: function (dt) {
      /* core.js already clamps, but a screen that trusts its caller for this
         is a screen that teleports the sim the first frame back from a lock
         screen. */
      if (!(dt > 0)) return;
      if (dt > 0.05) dt = 0.05;
      if (!world) return;
      fxClock += dt;
      if (fxClock > 3600) fxClock -= 3600;

      /* The opening runs on real time and cannot be paused or fast-forwarded:
         it is not part of the match. Everything below it — the sim, the feed,
         the damage watcher — is held until it is over. */
      if (!live()) {
        var was = phase();
        introT += dt;
        var now = phase();
        if (now !== was && now !== 'live') Sfx.play(now === 'fight' ? 'launch' : 'tap');
        updateCamera(dt, false);
        return;
      }

      if (!paused) {
        /* the sim is a fixed timestep with its own accumulator, so scaling
           dt on the way in is the whole of the fast-forward */
        world.step(dt * SPEEDS[speedIx]);
        drainEvents(world);
        stepParticles(dt);
        stepShipFX(pShip, dt);
        stepShipFX(eShip, dt);
        /* the action feed, read off what just changed */
        watchShip(pShip, true);
        watchShip(eShip, false);
        watchDamage(world, dt * SPEEDS[speedIx]);
      }
      updateCamera(dt, false);

      /* The last explosion gets a beat to play out, and then the match is
         handed over — the result is three screens of its own now. */
      if (world.over && !handedOver) {
        endT += dt;
        if (endT >= END_DELAY) { handedOver = true; finish(); onDone(result); }
      }
    },

    draw: function (ctx) {
      if (!prepared) prepare(ctx);

      if (!world) { drawFailed(ctx); return; }

      /* the looping overlay frame, computed once and read by every module */
      if (sheets !== null) {
        var esh = sheets[SH_ENERGY];
        eFrame = ((fxClock * esh.fps) | 0) % esh.frames;
        if (eFrame < 0) eFrame = 0;
      }

      arenaGround(ctx);
      drawStars(ctx);

      bucketProjectiles(world);
      drawShip(ctx, pShip);
      drawShip(ctx, eShip);
      drawProjectiles(ctx, world);
      drawBeams(ctx, world);
      drawParticles(ctx);

      drawOpening(ctx, world);

      /* The HUD is part of the match, so it arrives with the countdown rather
         than sitting over the versus card. */
      var ho = hudOp();
      if (ho > 0) {
        ctx.save();
        ctx.globalAlpha = ho;
        drawClockPill(ctx, world);
        drawStatus(ctx, world);
        ctx.restore();
      }
      drawSpeed(ctx);
      if (live()) drawToasts(ctx);

      if (!handedOver) {
        var q = BTN_QUIT, hot = UI.held(q);
        fillRR(ctx, q.x, q.y, q.w, q.h, 8,
               hot ? 'rgba(228,85,74,0.22)' : 'rgba(6,12,16,0.85)');
        strokeRR(ctx, q.x, q.y, q.w, q.h, 8, hot ? '#FF8A80' : '#E4554A', 1);
        icon(ctx, 'x', q.x + q.w / 2, q.y + q.h / 2, 17,
             hot ? '#FF8A80' : '#E4554A', 2);
        if (UI.zone(q, 'back')) { handedOver = true; onDone(null); return; }
      }
    }
  };
}
