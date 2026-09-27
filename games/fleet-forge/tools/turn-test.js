/* turn-test.js — how long a ship takes to come about, and what that costs.
 *
 * The complaint: a warp is supposed to buy you the moment where the other ship
 * is pointing the wrong way, and at the current turn rate it does not — the
 * enemy snaps round before the warp has landed. This measures the snap.
 *
 *   node tools/turn-test.js            # the sweep
 */
'use strict';
var L = require('./load');
var DATA = L.data();

var SCALES = [15, 7.5, 5, 3.75, 3, 2];

function fitSandbox() {
  var sb = L.sandbox(['js/geom.js', 'js/autofit.js']);
  return { Autofit: sb.Autofit, Geom: sb.Geom };
}
var F = fitSandbox();

function simSandbox() {
  return L.sandbox(['js/geom.js', 'js/sim/modules.js', 'js/sim/ai.js', 'js/sim/sim.js']);
}

/* A hull, fitted the same way every time so the only thing moving is the dial.
   A WARP DRIVE IS FORCED IN, because that is the case under test and autofit
   rarely picks one — without it there is no warp, nothing knocks a ship out of
   position, and the measurement has nothing to measure. */
var WARP = DATA.moduleList.filter(function (m) { return m.subtype === 'warp'; })[0];

function fitFor(ship, seed) {
  var fit = F.Autofit.build(ship, { seed: seed, allow: null }, DATA.modules);
  if (!WARP || fit.some(function (p) { return p.moduleId === WARP.key; })) return fit;
  var grid = F.Geom.shipGrid(ship);
  for (var r = 0; r < grid.h; r++) {
    for (var c = 0; c < grid.w; c++) {
      var want = F.Geom.footprint(WARP, c, r);
      var clear = fit.filter(function (q) {
        var f = F.Geom.footprint(DATA.module(q.moduleId), q.col, q.row);
        return !f.some(function (cell) { return want.indexOf(cell) >= 0; });
      });
      /* THE SHIP MUST STILL HAVE A DRIVE. The first version dropped whatever
         was in the way, which on a Hammerhead was its engines — and a ship
         with `turnPower: 0` does not turn at all, at any TURN_SCALE, so every
         reading came out identical and the dial looked dead. It was not the
         dial, it was the harness building a rudderless ship. */
      var drives = clear.filter(function (q) {
        return DATA.module(q.moduleId).subtype === 'engine';
      }).length;
      if (!drives) continue;
      if (F.Geom.canPlace(grid, clear, DATA.modules, WARP.key, c, r, -1).ok)
        return clear.concat([{ moduleId: WARP.key, col: c, row: r }]);
    }
  }
  return fit;
}

var PICKS = ['Light Fighter', 'Hammerhead', 'Arbiter', 'Kronos'];
var hulls = PICKS.map(function (n) {
  return DATA.shipList.filter(function (s) { return s.displayName === n; })[0];
}).filter(Boolean);

/* ---- 1. the turn itself -------------------------------------------------
   `drive` is a proportional controller: rot += err * k * SCALE * dt, so the
   error decays exponentially at r = k * SCALE. Time to bring a 180 degree
   error inside the firing cone is ln(180 / halfCone) / r. Measured by running
   the real controller, not by trusting that algebra. */
function timeToCome(sb, ship, scale) {
  sb.SimModules.C.TURN_SCALE = scale;
  var half = sb.SimModules.C.FACING_CONE / 2;
  var foe = { x: 100, y: 0, brad: 1, mass: 1 };
  ship.x = 0; ship.y = 0; ship.rot = Math.PI;       /* pointing dead away */
  ship.ax = 0; ship.ay = 0;
  var dt = 1 / 60, t = 0;
  while (t < 30) {
    sb.SimAI.drive({ over: true, rnd: 0 }, ship, foe, dt);
    t += dt;
    var err = Math.abs(Math.atan2(foe.y - ship.y, foe.x - ship.x) - ship.rot);
    while (err > Math.PI) err = Math.abs(err - Math.PI * 2);
    if (err <= half) return t;
  }
  return Infinity;
}

console.log('TIME TO COME ABOUT — 180 degrees to inside the firing cone, seconds');
var head = 'hull'.padEnd(15);
SCALES.forEach(function (s) { head += ('x' + (15 / s).toFixed(1)).padStart(9); });
console.log(head);
console.log(''.padEnd(15) + SCALES.map(function (s) {
  return ('s=' + s).padStart(9);
}).join(''));

hulls.forEach(function (h) {
  var sb = simSandbox();
  var w = sb.Sim.create({ playerFit: { shipId: h.key, modules: fitFor(h, 7) },
                          enemyFit:  { shipId: h.key, modules: fitFor(h, 7) } });
  var row = h.displayName.padEnd(15);
  SCALES.forEach(function (sc) {
    var t = timeToCome(sb, w.ships[0], sc);
    row += (t === Infinity ? '-' : t.toFixed(2)).padStart(9);
  });
  console.log(row);
});

/* ---- 2. what it does to a fight ----------------------------------------
   Turning is not free: a ship that cannot come about cannot bring its guns to
   bear, so the cost of slowing it is fights that stall. Measured on mirror
   matches — same hull, same fit both sides — so anything that moves is the
   dial and not the matchup.

   `faceFrac` is the share of the fight each ship spent with the enemy inside
   its firing cone, which is the closest thing to "could it shoot" the sim has.
   `warpWin` is the point of the exercise: after a warp, how long the OTHER
   ship spends pointing the wrong way. */
var SEEDS = [3, 7, 11, 19];

/* A WARP, ON A SCHEDULE. Waiting for a real one does not work: the cooldown is
   base 5s plus cells/6, which is 81s on an Arbiter and 154s on a Kronos —
   longer than the match — and the hulls small enough to warp often have no
   spare device cells to put a drive in. So the fight is interrupted every
   WARP_EVERY seconds by the same teleport `updateWarp` performs: a random
   bearing at the AI's own preferred distance, the jumper facing its foe, the
   victim left pointing wherever it was. Then the victim is watched.

   Scripted so the only thing that changes between runs is the dial. */
var WARP_EVERY = 12;

function fight(sb, ship, scale, seed) {
  sb.SimModules.C.TURN_SCALE = scale;
  var half = sb.SimModules.C.FACING_CONE / 2;
  var w = sb.Sim.create({
    playerFit: { shipId: ship.key, modules: fitFor(ship, seed) },
    enemyFit:  { shipId: ship.key, modules: fitFor(ship, seed) },
    seed: seed
  });
  var A = w.ships[0], B = w.ships[1];
  if (!A.turnPower) return null;
  var dt = 1 / 30, t = 0, frames = 0, facing = [0, 0];
  var marks = [], AT = [0.5, 1, 2], live = [], next = WARP_EVERY, jumps = 0;

  function errOf(a, b) {
    var e = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - a.rot);
    while (e > Math.PI) e = Math.abs(e - Math.PI * 2);
    return e;
  }
  function warp(jumper, foe) {
    var cur = Math.hypot(foe.x - jumper.x, foe.y - jumper.y);
    var want = sb.SimAI.warpDistance(w, jumper, foe, cur);
    if (want < 4) want = 4;
    var a = sb.Sim.rnd(w) * Math.PI * 2;
    jumper.x = foe.x + Math.cos(a) * want;
    jumper.y = foe.y + Math.sin(a) * want;
    jumper.rot = Math.atan2(foe.y - jumper.y, foe.x - jumper.x);
    jumper.vx = 0; jumper.vy = 0;
    jumps++;
    live.push({ t0: t, victim: foe, foe: jumper, seen: [] });
  }

  while (!w.over && t < 180) {
    w.step(dt); t += dt; frames++;
    if (errOf(A, B) <= half) facing[0]++;
    if (errOf(B, A) <= half) facing[1]++;

    if (t >= next) { next += WARP_EVERY; warp(jumps % 2 ? A : B, jumps % 2 ? B : A); }

    for (var i = live.length - 1; i >= 0; i--) {
      var ev = live[i], age = t - ev.t0;
      while (ev.seen.length < AT.length && age >= AT[ev.seen.length]) {
        ev.seen.push(errOf(ev.victim, ev.foe));
      }
      if (ev.seen.length === AT.length) { marks.push(ev.seen); live.splice(i, 1); }
    }
  }
  return {
    time: t, timeout: !w.over,
    face: (facing[0] + facing[1]) / (2 * Math.max(1, frames)),
    marks: marks
  };
}

function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }

console.log('');
/* A warp drive is 1x2 of device cells and a small hull has none to spare once
   it is fitted, so the warp half of this runs on whatever can actually carry
   one. Which hulls those are is printed, not assumed. */
var flown = [];
console.log('WHAT IT COSTS — mirror matches, ' + SEEDS.length + ' seeds each');
console.log('                                                 how far off target the OTHER ship');
console.log('                                                 still is, after a warp');
console.log('scale   slower   mean fight   timeouts   in-cone    +0.5s     +1s      +2s');
SCALES.forEach(function (sc) {
  var times = [], outs = 0, faces = [], marks = [], flew = {};
  hulls.forEach(function (h) {
    var sb = simSandbox();
    SEEDS.forEach(function (sd) {
      var r = fight(sb, h, sc, sd);
      if (!r) return;                  /* this hull cannot carry a warp drive */
      flew[h.displayName] = 1;
      times.push(r.time); faces.push(r.face);
      if (r.timeout) outs++;
      marks = marks.concat(r.marks);
    });
  });
  flown = Object.keys(flew);
  function deg(ix) {
    return (mean(marks.map(function (m) { return m[ix]; })) * 180 / Math.PI).toFixed(0) + '\u00b0';
  }
  console.log(
    String(sc).padEnd(8) +
    ('x' + (15 / sc).toFixed(1)).padEnd(9) +
    (mean(times).toFixed(1) + 's').padStart(10) +
    (outs + '/' + times.length).padStart(11) +
    ((mean(faces) * 100).toFixed(0) + '%').padStart(10) +
    (marks.length ? deg(0) : '-').padStart(9) +
    (marks.length ? deg(1) : '-').padStart(9) +
    (marks.length ? deg(2) : '-').padStart(9) +
    (marks.length ? '   (n=' + marks.length + ')' : ''));
});

console.log('');
console.log('hulls that could carry a warp drive and still fly: ' +
            (flown.length ? flown.join(', ') : 'none'));
