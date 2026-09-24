/* ai.js — how a ship fights. The same way, for every ship, always.
 *
 * THE RULE THIS FILE ENFORCES
 * Fleet Forge is an auto-battler and difficulty is PURELY the ship fit. There
 * are no per-opponent behaviour blocks, no hidden stats, and no handicaps: both
 * combatants run the identical routine below, and the only reason one of them
 * wins is what is bolted to its hull.
 *
 * An earlier version of this file had a tunable `ai` block per ship —
 * engagement range, thrust, strafe, target priority, and an `aimError` that
 * literally made an opponent miss on purpose. All of it is gone. A ladder whose
 * rungs differ by a secret accuracy penalty is not a ladder of ship designs.
 *
 * What still varies between ships varies because the FIT varies:
 *   - how far out it fights  <- the mean range of the weapons it carries
 *   - how hard it accelerates <- thrust power over mass
 *   - how fast it turns       <- turn power over mass
 *   - what it can hit         <- each weapon's own range and firing cone
 *   - whether it can burn or warp <- whether those modules are fitted
 * Every one of those is read off the ship. None of them is configured.
 *
 * Turrets do not rotate. Every weapon fires along the ship's heading and `fireCone`
 * is measured from it, so putting the target inside the cone is the whole of
 * the AI's job. That is deliberate — do not add turret rotation.
 */
var SimAI = (function () {
  'use strict';

  var DEG = Math.PI / 180;

  /* THE DOCTRINE — one set of numbers, shared by every ship in every battle.
     Changing one of these changes how the whole game fights, which is the
     point: it is a property of the game, not of an opponent. */
  var D = {
    ENGAGE_FRAC:   0.75,  // holds at this fraction of its OWN mean weapon range
    ENGAGE_WANDER: 0.16,  // re-rolled drift, so a pair does not lock into orbit
    CLOSE_AT:      0.70,  // reverses when nearer than this fraction of `want`
    THRUST:        0.85,  // share of available forward/reverse thrust used
    STRAFE:        0.40,  // share used laterally
    STRAFE_PERIOD: 2,     // seconds between strafe re-rolls
    ENGAGE_PERIOD: 3,     // seconds between engagement-distance re-rolls
    BURN_AT:       80,    // afterburner past this separation (units)
    RETREAT_AT:    0.30,  // below this health fraction, open the range and burn
    RETREAT_MUL:   1.60,  // how much further out a hurt ship tries to sit
    WARP_HOME:     0.60   // 0 = warp anywhere, 1 = warp to preferred range
  };

  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /* The only target chooser: the nearest live enemy module inside this
     weapon's range and cone. No priorities — a ship that kills reactors first
     does so because its guns reach them, not because it was told to. */
  function pickTarget(ship, m, enemy) {
    var rng = SimModules.num(m.s.range, 50);
    var half = (SimModules.num(m.s.fireCone, 360) / 2) * DEG;
    var best = null, bestD2 = rng * rng;

    for (var i = 0; i < enemy.modules.length; i++) {
      var t = enemy.modules[i];
      if (!t.alive) continue;
      var dx = t.wx - m.wx, dy = t.wy - m.wy;
      var d2 = dx * dx + dy * dy;
      if (d2 > bestD2) continue;
      if (Math.abs(wrap(Math.atan2(dy, dx) - ship.rot)) > half) continue;
      best = t; bestD2 = d2;
    }
    return best;
  }

  /* Mean range of the weapons still alive, so a ship that loses its long guns
     closes in. Cached; refreshed when something dies. This is the single
     biggest reason two ships behave differently, and it is pure fit. */
  function meanWeaponRange(ship) {
    if (ship.rangeDirty) {
      var sum = 0, n = 0;
      for (var i = 0; i < ship.modules.length; i++) {
        var m = ship.modules[i];
        if (!m.alive || !SimModules.isWeapon(m)) continue;
        sum += SimModules.effectiveRange(m); n++;
      }
      ship.meanRange = n ? sum / n : 50;
      ship.rangeDirty = false;
    }
    return ship.meanRange;
  }

  /* Decides rotation, thrust and strafe. Writes acceleration into the ship;
     sim.js does the integration. Runs whether or not the ship has engines —
     with none, thrust and turn are simply zero and it coasts. */
  function drive(w, ship, enemy, dt) {
    var dx = enemy.x - ship.x, dy = enemy.y - ship.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var diff = wrap(Math.atan2(dy, dx) - ship.rot);
    var mass = ship.mass;

    /* rotation: a proportional controller; mass gives it inertia */
    if (ship.turnPower > 0) {
      var k = (ship.turnPower * ship.shipTurn) / mass;
      ship.rot = wrap(ship.rot + diff * k * SimModules.C.TURN_SCALE * dt);
    }

    ship.ax = 0; ship.ay = 0;
    if (w.over || ship.thrustPower <= 0) return;

    var accel = (ship.thrustPower / mass) * SimModules.C.THRUST_SCALE * ship.thrustMul;

    ship.engageT -= dt;
    if (ship.engageT <= 0) {
      ship.engageVar = (Sim.rnd(w) - 0.5) * D.ENGAGE_WANDER;
      ship.engageT = D.ENGAGE_PERIOD;
    }
    var hurt = ship.healthFrac < D.RETREAT_AT;

    /* `want` is the distance the ship holds at, capped inside its own guns —
       a ship must never settle outside the range of the weapons it carries. */
    var frac = D.ENGAGE_FRAC + ship.engageVar;
    if (frac > 0.95) frac = 0.95;
    if (frac < 0.15) frac = 0.15;
    var want = meanWeaponRange(ship) * frac;
    if (hurt) want *= D.RETREAT_MUL;
    if (want < 2) want = 2;

    var dir = 0;
    if (dist > want && Math.abs(diff) < SimModules.C.FACING_CONE) dir = 1;
    else if (dist < want * D.CLOSE_AT) dir = -1;

    if (dir !== 0) {
      var a = dir > 0 ? ship.rot : ship.rot + Math.PI;
      ship.ax += Math.cos(a) * accel * D.THRUST;
      ship.ay += Math.sin(a) * accel * D.THRUST;
    }

    ship.strafeT -= dt;
    if (ship.strafeT <= 0) {
      ship.strafeDir = (Sim.rnd(w) - 0.5) * 2;
      ship.strafeT = D.STRAFE_PERIOD;
    }
    if (ship.strafeDir) {
      var pa = ship.rot + Math.PI / 2;
      var s = accel * D.STRAFE * SimModules.C.STRAFE_FRACTION * ship.strafeDir;
      ship.ax += Math.cos(pa) * s;
      ship.ay += Math.sin(pa) * s;
    }

    /* afterburner: too far to matter, or hurt enough to want out. Only a ship
       that actually carries one can do this. */
    if (dist > D.BURN_AT || hurt) {
      for (var i = 0; i < ship.modules.length; i++) {
        if (ship.modules[i].subtype === 'afterburner') SimModules.abFire(ship.modules[i]);
      }
    }
  }

  /* Where a warp drive puts the ship: mostly toward its own preferred range,
     with some wander so it is not perfectly predictable. */
  function warpDistance(w, ship, enemy, curDist) {
    var wander = curDist * (0.5 + Sim.rnd(w));
    var want = meanWeaponRange(ship) * D.ENGAGE_FRAC;
    return wander * (1 - D.WARP_HOME) + want * D.WARP_HOME;
  }

  return {
    DOCTRINE: D,
    pickTarget: pickTarget, drive: drive, warpDistance: warpDistance,
    meanWeaponRange: meanWeaponRange, wrap: wrap
  };
})();
