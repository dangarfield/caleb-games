/* modules.js — what every module does, once per tick, and every damage formula.
 *
 * Renderer-free. Nothing in here touches a canvas, a sprite or a timer; the
 * only outside world it knows is `Sim` (spawning and damage), `SimAI` (target
 * choice) and the baked module data.
 *
 * Every tuning number lives in C below. The old build kept its knobs on a
 * shared lil-gui debug object, which is how a `missileDamageFactor` of 0.1
 * ended up in the live damage path and how both ships were forced to share
 * one personality.
 */
var SimModules = (function () {
  'use strict';

  var DEG = Math.PI / 180;

  var C = {
    /* damage */
    DAMAGE_FLOOR: 1,            // BATTLE.md: never 0 or negative, per shot
    RAMP_START: 30,             // damage ramp begins at 30s...
    RAMP_RATE: 0.02,            // ...and adds 2% of base per second after that
    PEN_MIN_RETAIN: 0.25,       // max(0.25, ddo) on a penetrating hit

    /* ballistics */
    /* BATTLE.md documents 400 units/s, but its own debug slider topped out at
       200 and a 400u/s round crosses a 25-unit engagement gap in 0.06s — six
       whole cells per frame, which is not a tracer, it is a teleport. 150 is
       fast enough to feel instant and slow enough to see and to miss with.
       Collision is swept, so nothing tunnels at any value. */
    BALLISTIC_SPEED: 150,       // units/s

    /* missiles */
    MISSILE_TRACK_DELAY: 0.2,   // s of dumb flight before guidance wakes up
    MISSILE_LAUNCH_ANGLE: 30,   // degrees either side of the ship heading
    /* BATTLE.md's formula is (1 - macc/300) * baseTurnRate, with the old
       build's base working out at ~3 rad/s. At mspd 65 that is a 21-unit
       turning circle for a typical rocket, so at the 15-25 unit ranges ships
       actually fight at, missiles simply flew past and expired — 672 launched,
       12 hits, measured. The formula stays; the base is raised until a missile
       can turn inside the engagement envelope. */
    MISSILE_TURN_RATE: 9.0,     // rad/s at macc 0
    MISSILE_ACC_DIVISOR: 300,   // macc is inverse: turn = (1 - macc/300) * rate
    MISSILE_START_SPEED: 0.3,   // fraction of mspd at launch
    MISSILE_ACCEL: 2.0,         // xmspd per second, so full speed in 0.5s
    MISSILE_RANGE_FACTOR: 1.5,  // a missile may travel 1.5x the weapon's rng, then dies
    MISSILE_FUSE: 0.6,          // proximity fuse floor; `mer` when it is larger
    MISSILE_REACQUIRE: 0.25,    // s between re-locks after losing a target
    MEF_SCALE: 0.01,            // `mef` is 25..150 — a percentage. See note below.

    /* lasers */
    LASER_MIN_DURATION: 0.1,

    /* shields */
    SHIELD_REGEN_DELAY: 2,

    /* repair bays (hardcoded per the wiki, not in the module data) */
    REPAIR_CAPACITY: 2500, REPAIR_RATE: 9, REPAIR_INTERVAL: 0.5, REPAIR_MAX_BAYS: 3,

    /* point defence */
    PD_FIRE_RATE: 5,                 // interceptors per second per turret
    PD_BALLISTIC_INTERCEPT: 0.30,    // no `pd*` field covers bullets; this is the number
    PD_INTERCEPT_SPEED: 50,
    PD_INTERCEPT_HIT_RADIUS: 0.5,
    PD_INTERCEPT_LIFETIME: 2,
    PD_DEBRIS_DAMAGE_SCALE: 100,     // `pdd` is 0.1 — scaled to a useful number vs 15hp junk

    /* junk */
    JUNK_COUNT: 8, JUNK_HEALTH: 15, JUNK_SPEED: 30, JUNK_DECEL: 0.95,
    JUNK_LIFETIME: 10, JUNK_STAGGER: 0.2, JUNK_RADIUS: 0.5,

    /* How far from the enemy a launcher actually wants to sit. `range` on a mine
       or junk launcher is only the "may I fire?" gate — the projectiles
       decelerate to a halt about this far from the muzzle, so a minelayer that
       parks at its nominal 100-unit range lays mines nobody will ever touch.
       That is why mine ships used to stalemate. */
    MINE_ENGAGE: 8, JUNK_ENGAGE: 10,

    /* mines */
    MINE_COUNT: 1, MINE_HEALTH: 15, MINE_SPEED: 25, MINE_DECEL: 0.93,
    MINE_LIFETIME: 10, MINE_TRIGGER: 2, MINE_DEFAULT_RADIUS: 2, MINE_RADIUS: 0.5,

    /* the 0.95/0.93 decel figures above are per 1/60s frame; converted per second */
    DECEL_REF: 60,

    /* power */
    POWER_INTERVAL: 0.5,

    /* warp */
    WARP_BASE_COOLDOWN: 5, WARP_CELL_DIVISOR: 6, WARP_JITTER: 2,

    /* movement — see the note in sim.js on why the old 0.02/0.0001 are gone */
    /* RETUNED WHEN HULL MASS WENT AWAY. Both of these divide by ship mass, and
       mass used to be dominated by the hull's own `rm` (4,500-34,000). The new
       ship data has no such field, so mass is the fit alone and the median
       thrust-to-mass went from 0.57 to 4.51 — a 7.9x jump in acceleration and
       turn rate from a data change, not a design one. Divided by that, so a
       middling hull flies as it did.

       What HAS changed on purpose: the spread. Thrust-to-mass used to run
       0.50-0.73 across the roster, a factor of 1.5 — the hull decided and the
       fit barely mattered. It now runs 2.15-9.96, a factor of 4.6, and what
       you bolt on is most of it. */
    TURN_SCALE: 15, THRUST_SCALE: 1.5, DAMPING: 0.98, STRAFE_FRACTION: 0.3,
    FACING_CONE: Math.PI / 4
  };

  /* raw `missileExplosionForce` runs 25..150 while `damage` is already the per-missile
     damage. Used raw, one MissileBattery cell hit deals 17 * 25 = 425, which is
     why the old build multiplied the whole missile path by a debug 0.1. `mef`
     is a percentage; scaling it here is the honest version of that fudge and
     leaves BATTLE.md's "a 30 damage missile filling a 3x3 does ~9x" intact. */

  function num(v, d) {
    var n = (typeof v === 'number') ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* `attackSpeed` is keyed "Instantanious_Fire_Rate" but the values say otherwise: the
     Hyperion Chaingun is 0.05, the Capital Cannon 3.5, the Torpedo Launcher
     5.3. It is the reload interval in seconds. The old build used 1/ats, which
     gave the biggest gun in the game three shots a second and the chaingun one
     every 3.3s. 0 means "as fast as the weapon can cycle" — for the beam
     weapons that carry it, `msd` is what actually paces them. */
  function reload(mod) {
    var a = num(mod.attackSpeed, 0);
    return a > 0 ? a : 0;
  }

  /* ------------------------------------------------------------------ */
  /* module state                                                        */
  /* ------------------------------------------------------------------ */

  /* `bonus` is the hull's resolved bonus list. Everything below reads `eff`,
     the module as this hull makes it, never the shared record. */
  function init(mod, col, row, bonus) {
    var eff = (typeof Geom !== 'undefined' && Geom.applyBonus)
                ? Geom.applyBonus(mod, bonus) : mod;
    /* BUG 12: the old `parseInt(hlt || 100)` turned a literal 0 into
       maxHealth 0 and every health fraction into NaN. Read it explicitly, and
       a module that really has no health starts destroyed. */
    var mh = num(eff.health, 100);
    if (!(mh > 0)) mh = 0;

    var m = {
      key: mod.key, mod: mod, s: eff, col: col, row: row,
      w: mod.width || 1, h: mod.height || 1,
      cat: mod.category || 0, subtype: mod.subtype || '',
      maxHealth: mh, health: mh, alive: mh > 0,
      armor: num(eff.armor, 0),
      /* `reflect` in the data is 0.4..1 — the fraction of laser damage that gets
         through, i.e. (1 - reflect). The old build divided it by 100. */
      dmgMul: clamp(num(eff.reflect, 1), 0, 1),
      powered: true,
      lx: 0, ly: 0, wx: 0, wy: 0, flash: 0,
      cool: 0, beam: -1,
      shieldMax: 0, shield: 0, shieldCap: 0, shieldRegen: 0, shieldR: 0, sinceHit: 0,
      repairLeft: 0, repairT: 0,
      abOn: false, abT: 0, abCool: 0, abSpeed: 1, abThrust: 1, abDur: 0, abCd: 0,
      pdR: 0, pdCool: 0,
      pend: 0, pendT: 0, pendAngle: 0,
      warpPower: 0
    };

    switch (m.subtype) {
      case 'shield':
        m.shieldR = num(eff.shieldRadius, 0);
        m.shieldMax = num(eff.shieldStrength, 0);
        m.shield = m.shieldMax;
        m.shieldCap = num(eff.shieldMaxRegen, 0);
        m.shieldRegen = num(eff.shieldRegenSpeed, 0);
        m.sinceHit = C.SHIELD_REGEN_DELAY;
        break;
      case 'repair':
        m.repairLeft = C.REPAIR_CAPACITY;
        break;
      case 'pointdefense':
        m.pdR = num(eff.pdRadius, 19);
        break;
      case 'afterburner':
        m.abDur = num(eff.duration, 0) || num(eff.deadCone, 3);
        m.abCd = num(eff.cooldown, 10);
        m.abSpeed = num(eff.movementBoost, 2) || 2;
        m.abThrust = num(eff.turnBoost, 1.5) || 1.5;
        break;
      case 'warp':
        m.warpPower = num(eff.thrustPower, 0) || 1;
        break;
      case 'mine':
      case 'junk':
        /* BUG 11: the old launchers fired from t=0. Start on cooldown. */
        m.cool = reload(mod);
        break;
    }
    return m;
  }

  /* The distance a weapon wants to be used at, which is not always its `range`. */
  function effectiveRange(m) {
    if (m.subtype === 'mine') return C.MINE_ENGAGE;
    if (m.subtype === 'junk') return C.JUNK_ENGAGE;
    return num(m.s.range, 50);
  }

  function isWeapon(m) {
    /* BUG 2: the win condition used `instanceof WeaponModule`, so a ship whose
       only armament was a mine or junk launcher counted as disarmed the moment
       the battle started. Mine launchers carry c:2, junk launchers c:32. */
    return (m.cat & CAT.WEAPON) !== 0 || m.subtype === 'mine' || m.subtype === 'junk';
  }
  function isReactor(m) { return (m.cat & CAT.REACTOR) !== 0; }
  /* A POWER SOURCE IS NOT ALWAYS A REACTOR. Five modules in the data generate
     power without being one — the Solar Armor family, and Small Laser v2,
     which is a gun that feeds the ship. This is a separate predicate rather
     than a wider `isReactor` because that one also decides what explodes when
     it dies, and a solar plate does not take the hull with it. */
  function makesPower(m) {
    return (m.cat & CAT.REACTOR) !== 0 || num(m.s.powerGeneration, 0) > 0;
  }
  function isThruster(m) { return m.subtype === 'engine'; }
  function online(m) { return m.alive && m.powered; }
  function healthFrac(m) { return m.maxHealth > 0 ? m.health / m.maxHealth : 0; }

  /* ------------------------------------------------------------------ */
  /* damage formulas                                                     */
  /* ------------------------------------------------------------------ */

  /* Ballistics and missiles: flat armour reduction, floored at 1. Reflect
     does not apply. */
  function afterArmor(raw, armor) {
    var d = raw - armor;
    return d < C.DAMAGE_FLOOR ? C.DAMAGE_FLOOR : d;
  }
  /* Lasers: reflect only, armour bypassed. The floor belongs on the shot. */
  function afterReflect(raw, mul) {
    var d = raw * mul;
    return d < C.DAMAGE_FLOOR ? C.DAMAGE_FLOOR : d;
  }
  function ramp(t) {
    return t > C.RAMP_START ? 1 + (t - C.RAMP_START) * C.RAMP_RATE : 1;
  }

  /* ------------------------------------------------------------------ */
  /* per-module tick — called exactly once per ship per sub-step          */
  /* ------------------------------------------------------------------ */

  function tick(w, ship, m, enemy, dt) {
    if (m.flash > 0) m.flash -= dt;
    if (!m.alive) return;

    switch (m.subtype) {
      case 'shield':       shieldTick(m, dt); return;
      case 'repair':       return;               /* driven by repairShip, capped at 3 */
      case 'pointdefense': pdTick(w, ship, m, enemy, dt); return;
      case 'afterburner':  afterburnerTick(ship, m, dt); return;
      case 'mine':         mineTick(w, ship, m, enemy, dt); return;
      case 'junk':         junkTick(w, ship, m, enemy, dt); return;
      case 'engine': case 'warp': case 'armor': case 'reactor': return;
      default:
        if (m.cat & CAT.WEAPON) weaponTick(w, ship, m, enemy, dt);
    }
  }

  /* ---- weapons ----------------------------------------------------- */

  function weaponTick(w, ship, m, enemy, dt) {
    if (m.cool > 0) m.cool -= dt;
    if (w.over || !m.powered) return;
    if (m.cool > 0) return;
    if (m.beam >= 0) return;                     /* beam still running */

    var t = SimAI.pickTarget(ship, m, enemy);
    if (!t) return;

    m.cool = reload(m.mod);

    if (m.cat & CAT.LASER)       fireLaser(w, ship, m, enemy, t);
    else if (m.cat & CAT.MISSILE) fireMissile(w, ship, m, enemy, t);
    else                          fireBallistic(w, ship, m, enemy, t);
  }

  /* Straight at the target. There is no accuracy handicap anywhere in this
     game — a shot misses because the target moved or the cone was wrong, never
     because the shooter was told to be worse. */
  function aimAngle(w, ship, m, t) {
    return Math.atan2(t.wy - m.wy, t.wx - m.wx);
  }

  function fireBallistic(w, ship, m, enemy, t) {
    var d = m.mod;
    var a = aimAngle(w, ship, m, t);
    var ss = num(d.shootSpread, 0) * DEG;
    if (ss > 0) a += (Sim.rnd(w) - 0.5) * ss;

    var p = Sim.spawn(w, 0, ship, m);
    if (!p) return;
    p.x = m.wx; p.y = m.wy; p.px = p.x; p.py = p.y;
    p.rot = a;
    p.vx = Math.cos(a) * C.BALLISTIC_SPEED;
    p.vy = Math.sin(a) * C.BALLISTIC_SPEED;
    p.damage = num(d.damage, 1);
    p.recoilForce = num(d.recoilForce, 0); p.recoilPush = num(d.recoilPush, 0); p.impactPush = num(d.impactPush, 0);
    p.antiDamageDropOff = num(d.antiDamageDropOff, 0); p.pen = 0;
    /* BUG 1: the old code compared travelDistance against `this.range`, a
       property that only ever existed on the weapon, never on the Scene — so a
       bullet that missed lived forever. Every shot now carries its own range. */
    p.maxDist = num(d.range, 50);
    p.radius = 0.15;
  }

  function fireMissile(w, ship, m, enemy, t) {
    var d = m.mod, n = Math.max(1, num(d.missileCount, 1));
    for (var i = 0; i < n; i++) {
      var tgt = (i === 0) ? t : SimAI.pickTarget(ship, m, enemy);
      if (!tgt) continue;
      var side = (Sim.rnd(w) > 0.5) ? 1 : -1;
      var a = ship.rot + side * C.MISSILE_LAUNCH_ANGLE * DEG;

      var p = Sim.spawn(w, 1, ship, m);
      if (!p) return;
      var spd = num(d.missileSpeed, 30) || 30;   /* torpedoes ship mspd:0 */
      p.x = m.wx; p.y = m.wy; p.px = p.x; p.py = p.y;
      p.rot = a;
      p.speed = spd * C.MISSILE_START_SPEED;
      p.maxSpeed = spd;
      p.accel = spd * C.MISSILE_ACCEL;
      p.vx = ship.vx; p.vy = ship.vy;             /* missiles inherit ship velocity */
      p.damage = num(d.damage, 1);
      p.expR = num(d.missileExplosionRadius, 0);
      p.expF = num(d.missileExplosionForce, 0) * C.MEF_SCALE;
      p.turn = (1 - num(d.missileAcceleration, 0) / C.MISSILE_ACC_DIVISOR) * C.MISSILE_TURN_RATE;
      if (p.turn < 0) p.turn = 0;
      p.fuel = num(d.missileFlightJitter, 25);
      p.maxLife = num(d.missileLifetime, 4) || 4;
      p.maxDist = num(d.range, 50) * C.MISSILE_RANGE_FACTOR;
      p.tMod = tgt; p.tShip = enemy;
      p.radius = 0.2;
    }
  }

  function fireLaser(w, ship, m, enemy, t) {
    var d = m.mod;
    var dur = num(d.maxShootDuration, 0) || C.LASER_MIN_DURATION;
    var b = Sim.spawnBeam(w, ship, m, enemy, t);
    if (!b) return;
    b.dur = dur; b.t = 0;
    b.range = num(d.range, 50);
    /* BUG 7: the old build clamped every 1/60s tick to >= 1 damage, so any
       beam with a duration of a second dealt at least 60. The floor is a
       property of the shot. */
    b.base = num(d.damage, 1) * dur * ramp(w.time);
    retargetBeam(w, b);
  }

  function retargetBeam(w, b) {
    var t = b.tMod;
    if (!t || !t.alive) { b.perSec = 0; return; }
    var total = afterReflect(b.base, t.dmgMul);
    b.perSec = b.dur > 0 ? total / b.dur : total;
  }

  /* ---- shields ----------------------------------------------------- */

  function shieldTick(m, dt) {
    m.sinceHit += dt;
    if (!m.powered) return;
    if (m.sinceHit >= C.SHIELD_REGEN_DELAY && m.shield < m.shieldCap) {
      m.shield += m.shieldRegen * dt;
      if (m.shield > m.shieldCap) m.shield = m.shieldCap;
    }
  }
  function shieldUp(m) { return m.alive && m.powered && m.shield > 0; }

  /* Returns the damage that leaked through to the module underneath. */
  function shieldAbsorb(m, amount) {
    m.sinceHit = 0;
    if (m.shield <= 0) return amount;
    m.shield -= amount;
    if (m.shield >= 0) return 0;
    var excess = -m.shield;
    m.shield = 0;
    return excess;
  }

  /* ---- point defence ----------------------------------------------- */

  function pdTick(w, ship, m, enemy, dt) {
    if (m.pdCool > 0) m.pdCool -= dt;
    if (w.over || !m.powered || m.pdCool > 0) return;
    /* Missiles and bullets are handled by tryIntercept as they fly past.
       Here the turret shoots at parked debris: mines first, then junk. */
    var hit = Sim.pdScanDebris(w, ship, m, 4) || Sim.pdScanDebris(w, ship, m, 3);
    if (hit) m.pdCool = 1 / C.PD_FIRE_RATE;
  }

  function interceptChance(m, p) {
    var d = m.mod;
    if (p.kind === 1) {
      if (p.maxSpeed < 10) return num(d.pdMineShootDownChance, 0.2);
      if (p.turn <= 0.2)   return num(d.pdTorpedoShootDownChance, 0.25);
      return num(d.pdMissileShootDownChance, 0.4);
    }
    if (p.kind === 4) return num(d.pdMineShootDownChance, 0.2);
    /* BUG 13: this used to be a bare 0.3 buried in a method body. */
    if (p.kind === 0) return C.PD_BALLISTIC_INTERCEPT;
    return 0;
  }

  /* ---- repair bays -------------------------------------------------- */

  /* BUG 5: the old build ticked every module from updateShipPosition AND
     again from its own updater, so bays healed at 2x and the "first 3 only"
     slice was applied to one of the two passes. Called once, from sim.js. */
  function repairShip(w, ship, dt) {
    var used = 0;
    for (var i = 0; i < ship.modules.length && used < C.REPAIR_MAX_BAYS; i++) {
      var b = ship.modules[i];
      if (b.subtype !== 'repair' || !b.alive) continue;
      used++;
      if (!b.powered || b.repairLeft <= 0) continue;
      b.repairT += dt;
      if (b.repairT < C.REPAIR_INTERVAL) continue;
      b.repairT -= C.REPAIR_INTERVAL;

      var worst = null, worstFrac = 1;
      for (var j = 0; j < ship.modules.length; j++) {
        var m = ship.modules[j];
        if (!m.alive || m === b || m.health >= m.maxHealth) continue;
        var f = healthFrac(m);
        if (f < worstFrac) { worstFrac = f; worst = m; }
      }
      if (!worst) continue;
      var amt = C.REPAIR_RATE * C.REPAIR_INTERVAL;
      var room = worst.maxHealth - worst.health;
      if (amt > room) amt = room;
      if (amt > b.repairLeft) amt = b.repairLeft;
      if (amt <= 0) continue;
      worst.health += amt;
      b.repairLeft -= amt;
    }
  }

  /* ---- afterburner --------------------------------------------------- */

  function afterburnerTick(ship, m, dt) {
    if (!m.powered && m.abOn) { m.abOn = false; m.abCool = m.abCd; return; }
    if (m.abOn) {
      m.abT -= dt;
      if (m.abT <= 0) { m.abOn = false; m.abCool = m.abCd; }
    } else if (m.abCool > 0) {
      m.abCool -= dt;
    }
  }
  function abReady(m) { return m.alive && m.powered && !m.abOn && m.abCool <= 0; }
  function abFire(m) {
    if (!abReady(m)) return false;
    m.abOn = true; m.abT = m.abDur;
    return true;
  }

  /* ---- mine launcher ------------------------------------------------ */

  function mineTick(w, ship, m, enemy, dt) {
    if (m.cool > 0) m.cool -= dt;
    /* BUG 11: gates the old build had none of — battle over, no power, and a
       real range check against the enemy. */
    if (w.over || !m.powered || m.cool > 0) return;
    var dx = enemy.x - ship.x, dy = enemy.y - ship.y;
    var rng = num(m.s.range, 50);
    if (dx * dx + dy * dy > rng * rng) return;

    m.cool = reload(m.mod);
    for (var i = 0; i < C.MINE_COUNT; i++) {
      var a = Sim.rnd(w) * Math.PI * 2;            /* mines scatter, per BATTLE.md */
      var spd = C.MINE_SPEED * (0.6 + Sim.rnd(w) * 0.8);
      var p = Sim.spawn(w, 4, ship, m);
      if (!p) return;
      p.x = m.wx; p.y = m.wy; p.px = p.x; p.py = p.y;
      p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
      p.decel = C.MINE_DECEL;
      p.damage = num(m.s.damage, 50);
      p.expR = num(m.s.missileExplosionRadius, 0) || C.MINE_DEFAULT_RADIUS;
      p.expF = num(m.s.missileExplosionForce, 0) * C.MEF_SCALE || 1;
      p.health = C.MINE_HEALTH; p.maxHealth = C.MINE_HEALTH;
      p.maxLife = C.MINE_LIFETIME;
      p.maxDist = rng;
      p.radius = C.MINE_RADIUS;
      p.spin = (Sim.rnd(w) - 0.5) * 2;
    }
  }

  /* ---- junk launcher ------------------------------------------------ */

  function junkTick(w, ship, m, enemy, dt) {
    if (m.cool > 0) m.cool -= dt;

    /* staggered release, on a counter — no per-pellet setTimeout */
    if (m.pend > 0) {
      m.pendT -= dt;
      while (m.pend > 0 && m.pendT <= 0) {
        releaseJunk(w, ship, m);
        m.pend--;
        m.pendT += C.JUNK_STAGGER / C.JUNK_COUNT;
      }
    }

    if (w.over || !m.powered || m.cool > 0 || m.pend > 0) return;
    var dx = enemy.x - ship.x, dy = enemy.y - ship.y;
    var rng = num(m.s.range, 30);
    if (dx * dx + dy * dy > rng * rng) return;

    m.cool = reload(m.mod);
    m.pendAngle = Math.atan2(dy, dx);
    m.pend = C.JUNK_COUNT;
    m.pendT = 0;
  }

  function releaseJunk(w, ship, m) {
    var spread = num(m.s.shootSpread, 10) * DEG;
    var a = m.pendAngle + (Sim.rnd(w) - 0.5) * spread;
    var spd = C.JUNK_SPEED * (0.7 + Sim.rnd(w) * 0.6);
    var p = Sim.spawn(w, 3, ship, m);
    if (!p) return;
    p.x = m.wx; p.y = m.wy; p.px = p.x; p.py = p.y;
    p.vx = Math.cos(a) * spd; p.vy = Math.sin(a) * spd;
    p.decel = C.JUNK_DECEL;
    p.health = C.JUNK_HEALTH; p.maxHealth = C.JUNK_HEALTH;
    p.maxLife = C.JUNK_LIFETIME;
    p.maxDist = num(m.s.range, 30);
    p.radius = C.JUNK_RADIUS;
    p.spin = (Sim.rnd(w) - 0.5) * 3;
  }

  /* ---- reactor chain blast ------------------------------------------ */

  function reactorBlast(w, ship, src) {
    var er = num(src.s.explosionRadius, 0), ed = num(src.s.explosionDamage, 0);
    if (er <= 0 || ed <= 0) return;

    for (var j = 0; j < ship.modules.length; j++) {
      var m = ship.modules[j];
      if (!m.alive || m === src) continue;
      var best = Infinity;
      for (var rr = 0; rr < m.h && best > 0; rr++) {
        for (var cc = 0; cc < m.w && best > 0; cc++) {
          var mc = m.col + cc, mr = m.row + rr;
          for (var sr = 0; sr < src.h; sr++) {
            for (var sc = 0; sc < src.w; sc++) {
              var dc = Math.abs(mc - (src.col + sc));
              var dr = Math.abs(mr - (src.row + sr));
              /* BUG 14: BATTLE.md is explicit that diagonals are NOT affected —
                 "must be in a straight line" — but its own sample code fell
                 through to dc+dr for the diagonal case, and the old build
                 copied that, so a reactor nuked the whole quadrant. Straight
                 lines only. The `explosionRadius` values (1..5) are small enough that this
                 stays a local blast, which is clearly the intent. */
              if (dc !== 0 && dr !== 0) continue;
              var d = dc + dr;
              if (d < best) best = d;
            }
          }
        }
      }
      if (best <= er) Sim.damage(w, ship, m, ed, 'reactor');
    }
  }

  /* ---- power -------------------------------------------------------- */

  function powerPriority(m) {
    if (m.cat & CAT.ENGINE)   return 100;   /* engines, warp, afterburner */
    if (m.cat & CAT.WEAPON)   return 80;
    if (m.cat & CAT.SHIELD)   return 60;
    if (m.cat & CAT.POINTDEF) return 50;    /* point defence, junk launcher */
    if (m.cat & CAT.SUPPORT)  return 30;    /* repair bays */
    return 10;
  }

  /* BUG 6: the old sort was `b - a` and it then shut modules down from the
     front of that list, i.e. highest priority first — lose a reactor and your
     engines and guns went dark while the repair bay hummed away. Lowest goes
     first. `ship.powerOrder` is built once at create time, not per call. */
  function managePower(ship) {
    var gen = 0, use = 0, i, m;
    for (i = 0; i < ship.modules.length; i++) {
      m = ship.modules[i];
      if (!m.alive) continue;
      gen += num(m.s.powerGeneration, 0);
      use += num(m.s.powerUse, 0);
    }
    var deficit = use - gen;
    ship.powerGen = gen; ship.powerUse = use;

    if (deficit <= 0) {
      for (i = 0; i < ship.modules.length; i++) ship.modules[i].powered = true;
      ship.brownout = false;
      return;
    }
    ship.brownout = true;
    var order = ship.powerOrder;
    for (i = 0; i < order.length; i++) {
      m = order[i];
      if (!m.alive) { m.powered = true; continue; }
      var pu = num(m.s.powerUse, 0);
      if (deficit > 0 && pu > 0) {
        m.powered = false;
        deficit -= pu;
      } else {
        m.powered = true;
      }
    }
  }

  function buildPowerOrder(ship) {
    var list = [];
    for (var i = 0; i < ship.modules.length; i++) {
      if (num(ship.modules[i].s.powerUse, 0) > 0) list.push(ship.modules[i]);
    }
    list.sort(function (a, b) {
      return powerPriority(a) - powerPriority(b) ||
             num(b.s.powerUse, 0) - num(a.s.powerUse, 0);
    });
    ship.powerOrder = list;
  }

  return {
    C: C, init: init, tick: tick,
    isWeapon: isWeapon, effectiveRange: effectiveRange, isReactor: isReactor,
    makesPower: makesPower, isThruster: isThruster,
    online: online, healthFrac: healthFrac,
    afterArmor: afterArmor, afterReflect: afterReflect, ramp: ramp,
    shieldUp: shieldUp, shieldAbsorb: shieldAbsorb,
    interceptChance: interceptChance, retargetBeam: retargetBeam,
    repairShip: repairShip, abReady: abReady, abFire: abFire,
    reactorBlast: reactorBlast, managePower: managePower, reload: reload,
    buildPowerOrder: buildPowerOrder, powerPriority: powerPriority,
    num: num
  };
})();
