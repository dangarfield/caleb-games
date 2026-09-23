/* sim.js — the battle, with no renderer anywhere in it.
 *
 * Nothing here touches a canvas, an Image, a tween or a timer. The screen that
 * draws a battle reads state off the object `create()` returns and never calls
 * back in. That separation is the point: the whole thing runs under node, which
 * is how selftest.js can check it.
 *
 * Fixed timestep. `step(dt)` accumulates real time and advances the world in
 * 1/60 sub-steps, so 30fps and 60fps produce identical battles.
 *
 * Everything that flies lives in one preallocated pool with an `active` flag.
 * Nothing in the per-frame path allocates, sorts or filters — the old build
 * rebuilt a sorted module list for every projectile on every frame and that was
 * the hot spot.
 */
var Sim = (function () {
  'use strict';

  var FIXED = 1 / 60;
  var MAX_SUBSTEPS = 8;
  var POOL = 512;
  var BEAMS = 32;
  var EVENTS = 96;
  var START_SEPARATION = 80;
  var DEFAULT_MAX_TIME = 240;

  /* projectile kinds */
  var K_BALLISTIC = 0, K_MISSILE = 1, K_INTERCEPT = 2, K_JUNK = 3, K_MINE = 4;

  var M = null;   /* SimModules, bound lazily so load order does not matter */
  function mods() { return M || (M = SimModules); }

  /* ------------------------------------------------------------------ */
  /* seeded PRNG — no bare Math.random anywhere in the sim               */
  /* ------------------------------------------------------------------ */

  function rnd(w) {
    w.seed |= 0;
    w.seed = (w.seed + 0x6D2B79F5) | 0;
    var t = w.seed;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ------------------------------------------------------------------ */
  /* pools                                                               */
  /* ------------------------------------------------------------------ */

  function newProj() {
    return {
      active: false, gen: 0, idx: 0, kind: 0, side: 0, ship: null, src: null,
      x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, rot: 0, spin: 0,
      speed: 0, maxSpeed: 0, accel: 0, decel: 0, turn: 0,
      dmg: 0, rf: 0, rp: 0, ip: 0, ddo: 0, pen: 0,
      dist: 0, maxDist: 0, life: 0, maxLife: 0, fuel: 0,
      expR: 0, expF: 0, health: 0, maxHealth: 0, radius: 0,
      tMod: null, tShip: null, tIdx: -1, tGen: -1, pdDone: false, relock: 0
    };
  }
  function resetProj(p) {
    p.didHit = 0;
    p.x = p.y = p.px = p.py = p.vx = p.vy = p.rot = p.spin = 0;
    p.speed = p.maxSpeed = p.accel = p.decel = p.turn = 0;
    p.dmg = p.rf = p.rp = p.ip = p.ddo = p.pen = 0;
    p.dist = p.maxDist = p.life = p.maxLife = p.fuel = 0;
    p.expR = p.expF = p.health = p.maxHealth = p.radius = 0;
    p.tMod = null; p.tShip = null; p.tIdx = -1; p.tGen = -1; p.pdDone = false;
    p.relock = 0;
  }
  function newBeam() {
    return {
      active: false, side: 0, ship: null, mod: null, tShip: null, tMod: null,
      tIdx: -1, tGen: -1, t: 0, dur: 0, base: 0, perSec: 0, range: 0,
      x1: 0, y1: 0, x2: 0, y2: 0, hitting: false
    };
  }

  /* Shots fired, for accuracy. Bullets and missiles only — debris, mines and
     interceptors are not aimed shots and would flatter the number. */
  function countShot(w, kind, ship) {
    if (ship && (kind === K_BALLISTIC || kind === K_MISSILE)) ship.shotsFired += 1;
  }

  function spawn(w, kind, ship, src) {
    for (var i = 0; i < POOL; i++) {
      var idx = (w.pnext + i) % POOL;
      var p = w.projectiles[idx];
      if (p.active) continue;
      w.pnext = (idx + 1) % POOL;
      resetProj(p);
      p.active = true; p.gen++; p.idx = idx;
      p.kind = kind; p.side = ship.side; p.ship = ship; p.src = src;
      w.liveProjectiles++;
      if (kind === K_JUNK || kind === K_MINE) w.debrisCount++;
      countShot(w, kind, ship);
      return p;
    }
    return null;   /* pool full — drop the shot rather than grow the array */
  }
  function kill(w, p) {
    if (!p.active) return;
    p.active = false;
    if (p.kind === K_JUNK || p.kind === K_MINE) w.debrisCount--;
    p.tMod = null; p.tShip = null; p.ship = null; p.src = null;
    w.liveProjectiles--;
  }

  function spawnBeam(w, ship, mod, tShip, tMod) {
    for (var i = 0; i < BEAMS; i++) {
      var b = w.beams[i];
      if (b.active) continue;
      b.active = true; b.side = ship.side; b.ship = ship; b.mod = mod;
      b.tShip = tShip; b.tMod = tMod; b.tIdx = -1; b.tGen = -1;
      b.t = 0; b.dur = 0; b.base = 0; b.perSec = 0; b.range = 0;
      b.x1 = mod.wx; b.y1 = mod.wy; b.x2 = mod.wx; b.y2 = mod.wy;
      b.hitting = false;
      mod.beam = i;
      return b;
    }
    return null;
  }
  function killBeam(w, b) {
    if (!b.active) return;
    b.active = false;
    if (b.mod && b.mod.beam !== -1) b.mod.beam = -1;
    b.mod = null; b.ship = null; b.tMod = null; b.tShip = null;
  }

  /* events: a fixed ring the renderer drains after each step() */
  function event(w, type, x, y, a) {
    if (w.eventCount >= EVENTS) return;
    var e = w.events[w.eventCount++];
    e.type = type; e.x = x; e.y = y; e.a = a || 0;
  }

  /* ------------------------------------------------------------------ */
  /* ships                                                               */
  /* ------------------------------------------------------------------ */

  function buildShip(w, fit, side) {
    var sd = Data.ship(fit.shipId);
    if (!sd) throw new Error('unknown ship ' + fit.shipId);
    var grid = Geom.shipGrid(sd);

    var ship = {
      side: side, fit: fit, ship: sd, key: sd.key,
      gw: grid.w, gh: grid.h,
      x: 0, y: 0, rot: 0, vx: 0, vy: 0, ax: 0, ay: 0,
      mass: mods().num(sd.rm, 0),
      maxSpeed: mods().num(sd.ms, 6), shipTurn: mods().num(sd.ts, 1),
      thrustPower: 0, turnPower: 0, speedMul: 1, thrustMul: 1,
      modules: [], powerOrder: [],
      healthFrac: 1, maxHealthTotal: 0,
      destroyed: false, brownout: false, powerGen: 0, powerUse: 0,
      rad: 0, brad: 0, cos: 1, sin: 0,
      meanRange: 50, rangeDirty: true,
      engageT: 0, engageVar: 0, strafeT: 0, strafeDir: 0,
      powerT: 0, warpT: 0, warpCd: 0, warpPower: 0,
      /* Tallies for the post-match read. Damage is counted in the one damage()
         funnel; shots are counted where they are fired and where they connect,
         so accuracy is hits over shots and not an estimate. */
      dmgOut: 0, dmgIn: 0, shotsFired: 0, shotsHit: 0
    };

    var list = fit.modules || [];
    for (var i = 0; i < list.length; i++) {
      var md = Data.module(list[i].moduleId);
      if (!md) continue;
      var m = mods().init(md, list[i].col, list[i].row);
      m.ship = ship;
      var l = Geom.gridToLocal(m.col, m.row, m.w, m.h, grid.w, grid.h);
      m.lx = l.x; m.ly = l.y;
      ship.mass += mods().num(md.m, 0);
      ship.maxHealthTotal += m.maxHealth;
      ship.modules.push(m);
    }
    if (!(ship.mass > 0)) ship.mass = 1;

    ship.rad = 0.5 * Math.sqrt(grid.w * grid.w + grid.h * grid.h) + 1;
    var shieldR = 0;
    for (i = 0; i < ship.modules.length; i++) {
      if (ship.modules[i].shieldR > shieldR) shieldR = ship.modules[i].shieldR;
    }
    ship.brad = ship.rad + shieldR;

    mods().buildPowerOrder(ship);
    mods().managePower(ship);
    return ship;
  }

  /* One pass per ship per sub-step: world positions, live thrust and turn,
     afterburner multipliers, health fraction. The old build walked the module
     list several times a frame and updated some modules twice (BUG 5). */
  function refreshShip(ship) {
    var a = ship.rot + Math.PI / 2;
    var cos = Math.cos(a), sin = Math.sin(a);
    ship.cos = cos; ship.sin = sin;

    var thrust = 0, turn = 0, warp = 0, hp = 0, sm = 1, tm = 1;
    var ms = ship.modules;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      m.wx = ship.x + (m.lx * cos - m.ly * sin);
      m.wy = ship.y + (m.lx * sin + m.ly * cos);
      if (!m.alive) continue;
      hp += m.health;
      if (!m.powered) continue;
      if (m.subtype === 'engine') {
        thrust += mods().num(m.mod.ep, 0);
        turn   += mods().num(m.mod.ts, 0);
      } else if (m.subtype === 'warp') {
        warp += m.warpPower;
      } else if (m.subtype === 'afterburner' && m.abOn) {
        sm *= m.abSpeed; tm *= m.abThrust;
      }
    }
    ship.thrustPower = thrust; ship.turnPower = turn; ship.warpPower = warp;
    ship.speedMul = sm; ship.thrustMul = tm;
    ship.healthFrac = ship.maxHealthTotal > 0 ? hp / ship.maxHealthTotal : 0;
  }

  /* BUG 3: `ship.pos.x += ship.velocity.x` with no dt, and damping applied once
     per *frame*. Both are per second now.
     BUG 4: this whole block used to sit inside `if (engines.length > 0)`, so a
     ship stopped dead in space the instant its last engine died. Thrust and
     turn go to zero; momentum does not. */
  function integrate(ship, dt) {
    ship.vx += ship.ax * dt;
    ship.vy += ship.ay * dt;

    var damp = Math.pow(mods().C.DAMPING, 60 * dt);
    ship.vx *= damp; ship.vy *= damp;

    var max = ship.maxSpeed * ship.speedMul;
    var sp = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (sp > max && sp > 0) {
      ship.vx = (ship.vx / sp) * max;
      ship.vy = (ship.vy / sp) * max;
    }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
  }

  /* ------------------------------------------------------------------ */
  /* damage                                                              */
  /* ------------------------------------------------------------------ */

  /* Every damage source in the sim ends up here, which is the only way the
     win condition can be checked after all of them (BUG 2). */
  function damage(w, ship, m, amount, src, proj) {
    /* BUG 9: BaseModule.takeDamage had no alive guard, so a module could be
       destroyed twice — two explosions, and a reactor that chained twice. */
    if (!m.alive || !(amount > 0)) return 0;

    /* `ship` is the side TAKING the damage; the other side dealt it. Counted
       here because this is the single funnel every damage source goes through,
       so nothing can deal damage without being tallied. */
    ship.dmgIn += amount;
    var other = (w.ships[0] === ship) ? w.ships[1] : w.ships[0];
    if (other) other.dmgOut += amount;
    /* Accuracy is shots that connected over shots fired, so a round is credited
       ONCE however many modules it punches through — `proj` is passed only from
       the paths where a fired round lands. */
    if (proj && !proj.didHit) { proj.didHit = 1; if (other) other.shotsHit += 1; }

    m.health -= amount;
    m.flash = 0.1;
    if (m.health > 0) return amount;

    m.health = 0;
    m.alive = false;
    ship.rangeDirty = true;
    event(w, 'destroy', m.wx, m.wy, Math.max(m.w, m.h));

    if (mods().isReactor(m)) mods().reactorBlast(w, ship, m);
    mods().managePower(ship);
    checkOut(w, ship);
    return amount;
  }

  function shieldHit(w, ship, sh, raw) {
    var d = mods().afterArmor(raw, sh.armor);
    var leak = mods().shieldAbsorb(sh, d);
    if (leak > 0) damage(w, ship, sh, leak, 'shield');
  }

  /* BUG 2, all three halves of it: the old check counted `instanceof
     WeaponModule` (so mine/junk ships died instantly), looked at engines
     (c&64) where BATTLE.md says reactors (c&128), and was never reached from
     mine hits or reactor chain kills. */
  function checkOut(w, ship) {
    if (w.over || ship.destroyed) return;
    var wep = false, rea = false;
    for (var i = 0; i < ship.modules.length; i++) {
      var m = ship.modules[i];
      if (!m.alive) continue;
      if (!wep && mods().isWeapon(m)) wep = true;
      if (!rea && mods().isReactor(m)) rea = true;
      if (wep && rea) return;
    }
    ship.destroyed = true;
    w.over = true;
    w.winner = ship.side === 0 ? 'enemy' : 'player';
    w.reason = !wep ? 'disarmed' : 'reactors';
    event(w, 'shipdown', ship.x, ship.y, 0);
  }

  /* ------------------------------------------------------------------ */
  /* geometry helpers                                                    */
  /* ------------------------------------------------------------------ */

  function toLocalX(ship, x, y) { return (x - ship.x) * ship.cos + (y - ship.y) * ship.sin; }
  function toLocalY(ship, x, y) { return -(x - ship.x) * ship.sin + (y - ship.y) * ship.cos; }

  /* earliest entry parameter of a segment into an axis-aligned box, or -1 */
  function segBox(x0, y0, dx, dy, minx, miny, maxx, maxy) {
    var t0 = 0, t1 = 1, ta, tb, s;
    if (dx > -1e-9 && dx < 1e-9) { if (x0 < minx || x0 > maxx) return -1; }
    else {
      ta = (minx - x0) / dx; tb = (maxx - x0) / dx;
      if (ta > tb) { s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (dy > -1e-9 && dy < 1e-9) { if (y0 < miny || y0 > maxy) return -1; }
    else {
      ta = (miny - y0) / dy; tb = (maxy - y0) / dy;
      if (ta > tb) { s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  /* earliest entry parameter of a segment into a circle, or -1 */
  function segCircle(x0, y0, dx, dy, cx, cy, r) {
    var fx = x0 - cx, fy = y0 - cy;
    if (fx * fx + fy * fy <= r * r) return 0;
    var a = dx * dx + dy * dy;
    if (a < 1e-12) return -1;
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - r * r;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    disc = Math.sqrt(disc);
    var t = (-b - disc) / (2 * a);
    if (t < 0 || t > 1) return -1;
    return t;
  }

  /* broadphase: does this step's segment come near the ship's bubble at all?
     One circle test rejects a ship before any module is looked at. */
  function nearShip(ship, x0, y0, dx, dy, pad) {
    return segCircle(x0, y0, dx, dy, ship.x, ship.y, ship.brad + pad) >= 0;
  }

  /* ------------------------------------------------------------------ */
  /* projectiles                                                         */
  /* ------------------------------------------------------------------ */

  function updateProjectiles(w, dt) {
    for (var i = 0; i < POOL; i++) {
      var p = w.projectiles[i];
      if (!p.active) continue;
      switch (p.kind) {
        case K_BALLISTIC: stepBallistic(w, p, dt); break;
        case K_MISSILE:   stepMissile(w, p, dt);   break;
        case K_INTERCEPT: stepIntercept(w, p, dt); break;
        case K_JUNK:      stepDebris(w, p, dt, false); break;
        case K_MINE:      stepDebris(w, p, dt, true);  break;
      }
    }
  }

  function advance(p, dt) {
    p.px = p.x; p.py = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    var dx = p.x - p.px, dy = p.y - p.py;
    p.dist += Math.sqrt(dx * dx + dy * dy);
    p.life += dt;
  }

  /* Does any enemy debris sit on this segment? Junk is the point of the junk
     launcher and the old build never once called checkJunkCollision (BUG 10). */
  function debrisBlock(w, p, x0, y0, dx, dy) {
    if (w.debrisCount === 0) return -1;
    var best = -1, bi = -1;
    for (var i = 0; i < POOL; i++) {
      var d = w.projectiles[i];
      if (!d.active || (d.kind !== K_JUNK && d.kind !== K_MINE)) continue;
      if (d.side === p.side) continue;
      var t = segCircle(x0, y0, dx, dy, d.x, d.y, d.radius + p.radius);
      if (t < 0) continue;
      if (best < 0 || t < best) { best = t; bi = i; }
    }
    return bi;
  }

  function hitDebris(w, d, amount) {
    d.health -= amount;
    if (d.health <= 0) {
      event(w, d.kind === K_MINE ? 'mineblast' : 'junkbreak', d.x, d.y, 0);
      if (d.kind === K_MINE) detonateMine(w, d);
      kill(w, d);
      return true;
    }
    return false;
  }

  /* ---- point defence in flight -------------------------------------- */

  function tryIntercept(w, p, foe) {
    if (p.pdDone) return;
    for (var i = 0; i < foe.modules.length; i++) {
      var pd = foe.modules[i];
      if (pd.subtype !== 'pointdefense' || !pd.alive || !pd.powered) continue;
      if (pd.pdCool > 0) continue;
      var dx = p.x - pd.wx, dy = p.y - pd.wy;
      if (dx * dx + dy * dy > pd.pdR * pd.pdR) continue;
      p.pdDone = true;                       /* one turret gets one go at it */
      var chance = mods().interceptChance(pd, p);
      if (chance <= 0) return;
      pd.pdCool = 1 / mods().C.PD_FIRE_RATE;
      if (rnd(w) >= chance) return;
      var ic = spawn(w, K_INTERCEPT, foe, pd);
      if (!ic) return;
      ic.x = pd.wx; ic.y = pd.wy; ic.px = ic.x; ic.py = ic.y;
      ic.speed = mods().C.PD_INTERCEPT_SPEED;
      ic.maxLife = mods().C.PD_INTERCEPT_LIFETIME;
      ic.maxDist = mods().C.PD_INTERCEPT_SPEED * mods().C.PD_INTERCEPT_LIFETIME;
      ic.radius = 0.1;
      /* BUG 13: the old interceptor held a bare object reference and kept
         homing on projectiles that had already been destroyed and recycled.
         Pool index plus generation — a recycled slot no longer matches. */
      ic.tIdx = p.idx; ic.tGen = p.gen;
      return;
    }
  }

  function stepIntercept(w, p, dt) {
    var t = (p.tIdx >= 0) ? w.projectiles[p.tIdx] : null;
    if (!t || !t.active || t.gen !== p.tGen) { kill(w, p); return; }

    var dx = t.x - p.x, dy = t.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < mods().C.PD_INTERCEPT_HIT_RADIUS) {
      event(w, 'intercept', t.x, t.y, 0);
      kill(w, t); kill(w, p);
      return;
    }
    var a = Math.atan2(dy, dx);
    p.rot = a;
    p.vx = Math.cos(a) * p.speed;
    p.vy = Math.sin(a) * p.speed;
    advance(p, dt);
    if (p.life > p.maxLife || p.dist > p.maxDist) kill(w, p);
  }

  /* ---- ballistics ---------------------------------------------------- */

  function stepBallistic(w, p, dt) {
    advance(p, dt);
    /* BUG 1: a bullet that misses is retired at its weapon's range. */
    if (p.dist > p.maxDist) { kill(w, p); return; }

    var foe = w.ships[1 - p.side];
    tryIntercept(w, p, foe);
    if (!p.active) return;

    var x0 = p.px, y0 = p.py, dx = p.x - p.px, dy = p.y - p.py;

    var di = debrisBlock(w, p, x0, y0, dx, dy);
    if (di >= 0) {
      var deb = w.projectiles[di];
      hitDebris(w, deb, p.dmg);
      /* a piercing round spends one layer punching through the trash */
      if (p.rf > 0) { p.rf -= 4; if (p.rf < 0) p.rf = 0; }
      else { kill(w, p); return; }
    }

    if (!nearShip(foe, x0, y0, dx, dy, p.radius)) return;

    /* shields sit outside the hull; whichever is entered first wins */
    var lx0 = toLocalX(foe, x0, y0), ly0 = toLocalY(foe, x0, y0);
    var lx1 = toLocalX(foe, p.x, p.y), ly1 = toLocalY(foe, p.x, p.y);
    var ldx = lx1 - lx0, ldy = ly1 - ly0;

    var shT = -1, shM = null, i, m, t;
    for (i = 0; i < foe.modules.length; i++) {
      m = foe.modules[i];
      if (m.subtype !== 'shield' || !mods().shieldUp(m)) continue;
      t = segCircle(x0, y0, dx, dy, m.wx, m.wy, m.shieldR);
      if (t >= 0 && (shT < 0 || t < shT)) { shT = t; shM = m; }
    }

    var maxPen = Math.ceil(p.rf / 4);
    var from = -1e-6, guard = 0;

    while (guard++ < 12) {
      var first = (guard === 1);
      var bT = -1, bM = null;
      for (i = 0; i < foe.modules.length; i++) {
        m = foe.modules[i];
        if (!m.alive) continue;
        t = segBox(lx0, ly0, ldx, ldy,
                   m.lx - m.w / 2, m.ly - m.h / 2, m.lx + m.w / 2, m.ly + m.h / 2);
        if (t < 0 || t <= from) continue;
        if (bT < 0 || t < bT) { bT = t; bM = m; }
      }

      /* the bubble is outside the hull, so it only ever gets the first say */
      if (first && shM && shT >= 0 && (bT < 0 || shT <= bT)) {
        shieldHit(w, foe, shM, p.dmg * w.damageMultiplier);
        event(w, 'shieldhit', x0 + dx * shT, y0 + dy * shT, 0);
        kill(w, p);
        return;
      }
      if (bT < 0) return;

      var raw = p.dmg * w.damageMultiplier;
      if (p.pen > 0) {
        var keep = p.ddo > mods().C.PEN_MIN_RETAIN ? p.ddo : mods().C.PEN_MIN_RETAIN;
        raw *= Math.pow(keep, p.pen);
      }
      damage(w, foe, bM, mods().afterArmor(raw, bM.armor), 'ballistic', p);
      event(w, 'hit', x0 + dx * bT, y0 + dy * bT, 0);

      p.pen++;
      if (p.pen >= maxPen) { kill(w, p); return; }
      var chance = p.ip > 0 ? Math.min(1, p.rp / p.ip) : 1;
      if (rnd(w) >= chance) { kill(w, p); return; }
      from = bT;
    }
    kill(w, p);
  }

  /* ---- missiles ------------------------------------------------------ */

  function stepMissile(w, p, dt) {
    var foe = w.ships[1 - p.side];
    tryIntercept(w, p, foe);
    if (!p.active) return;

    if (p.speed < p.maxSpeed) {
      p.speed += p.accel * dt;
      if (p.speed > p.maxSpeed) p.speed = p.maxSpeed;
    }
    if (p.fuel > 0) p.fuel -= dt;

    var tgt = p.tMod;
    if (tgt && !tgt.alive) { p.tMod = null; tgt = null; }
    /* re-lock when the target dies, rather than flying on blind forever */
    if (!tgt && p.fuel > 0) {
      p.relock -= dt;
      if (p.relock <= 0) {
        p.relock = mods().C.MISSILE_REACQUIRE;
        tgt = nearestModule(foe, p.x, p.y);
        p.tMod = tgt;
      }
    }
    if (p.life > mods().C.MISSILE_TRACK_DELAY && p.fuel > 0 && tgt) {
      var want = Math.atan2(tgt.wy - p.y, tgt.wx - p.x);
      var d = SimAI.wrap(want - p.rot);
      var lim = p.turn * dt;
      if (d > lim) d = lim; else if (d < -lim) d = -lim;
      p.rot += d;
    }

    p.px = p.x; p.py = p.y;
    var vx = Math.cos(p.rot) * p.speed + p.vx;
    var vy = Math.sin(p.rot) * p.speed + p.vy;
    p.x += vx * dt; p.y += vy * dt;
    var mdx = p.x - p.px, mdy = p.y - p.py;
    p.dist += Math.sqrt(mdx * mdx + mdy * mdy);
    p.life += dt;

    if (p.life > p.maxLife || p.dist > p.maxDist) { kill(w, p); return; }

    var di = debrisBlock(w, p, p.px, p.py, mdx, mdy);
    if (di >= 0) {
      hitDebris(w, w.projectiles[di], p.dmg);
      event(w, 'explosion', p.x, p.y, 0.5);
      kill(w, p);
      return;
    }

    if (!nearShip(foe, p.px, p.py, mdx, mdy, p.radius)) return;

    var lx0 = toLocalX(foe, p.px, p.py), ly0 = toLocalY(foe, p.px, p.py);
    var ldx = toLocalX(foe, p.x, p.y) - lx0, ldy = toLocalY(foe, p.x, p.y) - ly0;

    var shT = -1, shM = null, i, m, t;
    for (i = 0; i < foe.modules.length; i++) {
      m = foe.modules[i];
      if (m.subtype !== 'shield' || !mods().shieldUp(m)) continue;
      t = segCircle(p.px, p.py, mdx, mdy, m.wx, m.wy, m.shieldR);
      if (t >= 0 && (shT < 0 || t < shT)) { shT = t; shM = m; }
    }

    /* box hit and proximity in one pass: a warhead that sails half a cell wide
       of the hull still goes off, which is what `mer` is for. */
    var lx1 = lx0 + ldx, ly1 = ly0 + ldy;
    var fuse = p.expR > mods().C.MISSILE_FUSE ? p.expR : mods().C.MISSILE_FUSE;
    var bT = -1, bM = null, nearD = Infinity;
    for (i = 0; i < foe.modules.length; i++) {
      m = foe.modules[i];
      if (!m.alive) continue;
      var rl = m.lx - m.w / 2, rr2 = m.lx + m.w / 2;
      var rt = m.ly - m.h / 2, rb = m.ly + m.h / 2;
      t = segBox(lx0, ly0, ldx, ldy, rl, rt, rr2, rb);
      if (t >= 0 && (bT < 0 || t < bT)) { bT = t; bM = m; }
      var cx = lx1 < rl ? rl : (lx1 > rr2 ? rr2 : lx1);
      var cy = ly1 < rt ? rt : (ly1 > rb ? rb : ly1);
      var ddx = lx1 - cx, ddy = ly1 - cy;
      var dd = ddx * ddx + ddy * ddy;
      if (dd < nearD) { nearD = dd; if (bT < 0) bM = m; }
    }
    var fx = 0, fy = 0, fused = false;
    if (bT < 0 && nearD <= fuse * fuse && bM) {
      /* go off against the hull, not out in space: a blast centred a radius
         away from the plating is a blast that does nothing */
      var qx = lx1 < bM.lx - bM.w / 2 ? bM.lx - bM.w / 2
             : (lx1 > bM.lx + bM.w / 2 ? bM.lx + bM.w / 2 : lx1);
      var qy = ly1 < bM.ly - bM.h / 2 ? bM.ly - bM.h / 2
             : (ly1 > bM.ly + bM.h / 2 ? bM.ly + bM.h / 2 : ly1);
      fx = foe.x + (qx * foe.cos - qy * foe.sin);
      fy = foe.y + (qx * foe.sin + qy * foe.cos);
      fused = true;
      bT = 1;
    }

    if (shM && shT >= 0 && (bT < 0 || shT <= bT)) {
      shieldHit(w, foe, shM, p.dmg * w.damageMultiplier);
      event(w, 'shieldhit', p.px + mdx * shT, p.py + mdy * shT, 0);
      kill(w, p);
      return;
    }
    if (bT < 0) return;

    var hx = fused ? fx : p.px + mdx * bT;
    var hy = fused ? fy : p.py + mdy * bT;
    if (p.expR > 0) explode(w, foe, p, hx, hy);
    else {
      /* BUG 8, half of it: no debug `missileDamageFactor` in the damage path. */
      damage(w, foe, bM, mods().afterArmor(p.dmg * w.damageMultiplier, bM.armor), 'missile', p);
    }
    event(w, 'explosion', hx, hy, p.expR > 0 ? p.expR : 0.6);
    kill(w, p);
  }

  /* BUG 8, the other half: BATTLE.md is explicit that a blast multiplies by
     the number of cells it covers — "a 30 damage missile hitting all 9 cells
     of a 3x3 armour plate is 270". The old code counted the cells and then
     threw the count away, damaging each module exactly once. */
  /* BATTLE.md, verbatim:
       distance   = distanceToExplosion(module)      // to the module, not a cell
       falloff    = 1 - distance / explosionRadius
       perCell    = baseDamage * explosionForce * falloff - armour, min 1
       total      = perCell * cellsHit
     The old build did the cell count and then threw it away, damaging each
     module once. It also measured falloff per cell, which with the 1.2-unit
     blast radii in this data meant every hit landed on the 1-damage floor. */
  function explode(w, foe, p, hx, hy) {
    var r2 = p.expR * p.expR;
    var blx = toLocalX(foe, hx, hy), bly = toLocalY(foe, hx, hy);
    for (var i = 0; i < foe.modules.length; i++) {
      var m = foe.modules[i];
      if (!m.alive) continue;
      var rl = m.lx - m.w / 2, rr2 = m.lx + m.w / 2;
      var rt = m.ly - m.h / 2, rb = m.ly + m.h / 2;
      var qx = blx < rl ? rl : (blx > rr2 ? rr2 : blx);
      var qy = bly < rt ? rt : (bly > rb ? rb : bly);
      var ddx = blx - qx, ddy = bly - qy;
      var d2 = ddx * ddx + ddy * ddy;
      if (d2 > r2) continue;

      var cells = 0;
      for (var row = 0; row < m.h; row++) {
        for (var col = 0; col < m.w; col++) {
          var cx = rl + col + 0.5 - blx, cy = rt + row + 0.5 - bly;
          if (cx * cx + cy * cy <= r2) cells++;
        }
      }
      if (!cells) continue;

      var falloff = 1 - Math.sqrt(d2) / p.expR;
      if (falloff < 0) falloff = 0;
      var perCell = mods().afterArmor(
        p.dmg * p.expF * falloff * w.damageMultiplier, m.armor);
      damage(w, foe, m, perCell * cells, 'missile', p);
    }
  }

  /* ---- junk and mines ------------------------------------------------ */

  function stepDebris(w, p, dt, isMine) {
    advance(p, dt);
    var d = Math.pow(p.decel, mods().C.DECEL_REF * dt);
    p.vx *= d; p.vy *= d;
    p.rot += p.spin * dt;

    if (p.life > p.maxLife || p.dist > p.maxDist) {
      if (isMine) { event(w, 'mineblast', p.x, p.y, 0); }
      kill(w, p);
      return;
    }
    if (!isMine) return;

    var foe = w.ships[1 - p.side];
    var trig = mods().C.MINE_TRIGGER;
    var dx = p.x - foe.x, dy = p.y - foe.y;
    var reach = foe.rad + trig;
    if (dx * dx + dy * dy > reach * reach) return;

    for (var i = 0; i < foe.modules.length; i++) {
      var m = foe.modules[i];
      if (!m.alive) continue;
      var ex = m.wx - p.x, ey = m.wy - p.y;
      if (ex * ex + ey * ey <= trig * trig) {
        detonateMine(w, p);
        kill(w, p);
        return;
      }
    }
  }

  function detonateMine(w, p) {
    var foe = w.ships[1 - p.side];
    var r2 = p.expR * p.expR;
    event(w, 'explosion', p.x, p.y, p.expR);
    for (var i = 0; i < foe.modules.length; i++) {
      var m = foe.modules[i];
      if (!m.alive) continue;
      var dx = m.wx - p.x, dy = m.wy - p.y;
      if (dx * dx + dy * dy > r2) continue;
      /* mines are shield-softened, per the module description */
      var raw = p.dmg * p.expF * w.damageMultiplier;
      var sh = shieldOver(foe, m);
      if (sh) { shieldHit(w, foe, sh, raw); continue; }
      damage(w, foe, m, mods().afterArmor(raw, m.armor), 'mine', p);
    }
  }

  function nearestModule(ship, x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < ship.modules.length; i++) {
      var m = ship.modules[i];
      if (!m.alive) continue;
      var dx = m.wx - x, dy = m.wy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function shieldOver(ship, m) {
    for (var i = 0; i < ship.modules.length; i++) {
      var s = ship.modules[i];
      if (s.subtype !== 'shield' || !mods().shieldUp(s)) continue;
      var dx = m.wx - s.wx, dy = m.wy - s.wy;
      if (dx * dx + dy * dy <= s.shieldR * s.shieldR) return s;
    }
    return null;
  }

  /* point defence sweeping parked debris, called from modules.js */
  function pdScanDebris(w, ship, pd, kind) {
    if (w.debrisCount === 0) return false;
    for (var i = 0; i < POOL; i++) {
      var d = w.projectiles[i];
      if (!d.active || d.kind !== kind || d.side === ship.side) continue;
      var dx = d.x - pd.wx, dy = d.y - pd.wy;
      if (dx * dx + dy * dy > pd.pdR * pd.pdR) continue;
      hitDebris(w, d, mods().num(pd.mod.pdd, 0.1) * mods().C.PD_DEBRIS_DAMAGE_SCALE);
      event(w, 'pdshot', d.x, d.y, 0);
      return true;
    }
    return false;
  }

  /* ---- laser beams --------------------------------------------------- */

  function updateBeams(w, dt) {
    for (var i = 0; i < BEAMS; i++) {
      var b = w.beams[i];
      if (!b.active) continue;
      var src = b.mod;
      if (!src.alive || !src.powered || w.over) { killBeam(w, b); continue; }

      b.x1 = src.wx; b.y1 = src.wy;
      b.t += dt;

      var t = b.tMod;
      if (t && !t.alive) t = null;
      if (t) {
        var dx = t.wx - src.wx, dy = t.wy - src.wy;
        var dd = Math.sqrt(dx * dx + dy * dy);
        var half = (mods().num(src.mod.fc, 360) / 2) * (Math.PI / 180);
        if (dd > b.range || Math.abs(SimAI.wrap(Math.atan2(dy, dx) - b.ship.rot)) > half) t = null;
      }
      if (!t) {
        t = SimAI.pickTarget(b.ship, src, b.tShip);
        b.tMod = t;
        mods().retargetBeam(w, b);
      }

      if (!t) {
        b.hitting = false;
        b.x2 = src.wx + Math.cos(b.ship.rot) * b.range;
        b.y2 = src.wy + Math.sin(b.ship.rot) * b.range;
      } else {
        /* junk on the line soaks the beam instead — lasers can be distracted */
        var bx = t.wx - src.wx, by = t.wy - src.wy;
        var di = debrisBlockBeam(w, b.side, src.wx, src.wy, bx, by);
        if (di >= 0) {
          var deb = w.projectiles[di];
          b.hitting = true; b.x2 = deb.x; b.y2 = deb.y;
          hitDebris(w, deb, b.perSec * dt);
        } else {
          b.hitting = true; b.x2 = t.wx; b.y2 = t.wy;
          damage(w, b.tShip, t, b.perSec * dt, 'laser');
          if (!t.alive) { b.tMod = null; }
        }
      }
      if (b.t >= b.dur) killBeam(w, b);
    }
  }

  function debrisBlockBeam(w, side, x0, y0, dx, dy) {
    if (w.debrisCount === 0) return -1;
    var best = -1, bi = -1;
    for (var i = 0; i < POOL; i++) {
      var d = w.projectiles[i];
      if (!d.active || (d.kind !== K_JUNK && d.kind !== K_MINE)) continue;
      if (d.side === side) continue;
      var t = segCircle(x0, y0, dx, dy, d.x, d.y, d.radius);
      if (t < 0) continue;
      if (best < 0 || t < best) { best = t; bi = i; }
    }
    return bi;
  }

  /* ---- warp ---------------------------------------------------------- */

  function updateWarp(w, ship, foe, dt) {
    if (ship.warpPower <= 0 || w.over) return;
    if (ship.warpCd <= 0) ship.warpCd = warpCooldown(w, ship);
    ship.warpT += dt;
    if (ship.warpT < ship.warpCd) return;
    ship.warpT = 0;
    ship.warpCd = warpCooldown(w, ship);

    var dx = foe.x - ship.x, dy = foe.y - ship.y;
    var cur = Math.sqrt(dx * dx + dy * dy);
    var want = SimAI.warpDistance(w, ship, foe, cur);
    if (want < 4) want = 4;
    var a = rnd(w) * Math.PI * 2;
    ship.x = foe.x + Math.cos(a) * want;
    ship.y = foe.y + Math.sin(a) * want;
    ship.rot = Math.atan2(foe.y - ship.y, foe.x - ship.x);
    ship.vx = 0; ship.vy = 0;
    event(w, 'warp', ship.x, ship.y, 0);

    /* missiles chasing this ship lose the lock */
    for (var i = 0; i < POOL; i++) {
      var p = w.projectiles[i];
      if (p.active && p.kind === K_MISSILE && p.tMod && p.tMod.ship === ship) p.tMod = null;
    }
  }

  function warpCooldown(w, ship) {
    var cells = ship.gw * ship.gh;
    var C2 = mods().C;
    return C2.WARP_BASE_COOLDOWN +
           (cells / Math.max(1, ship.warpPower) / C2.WARP_CELL_DIVISOR) +
           rnd(w) * C2.WARP_JITTER;
  }

  /* ------------------------------------------------------------------ */
  /* the sub-step                                                        */
  /* ------------------------------------------------------------------ */

  function substep(w, dt) {
    var a = w.ships[0], b = w.ships[1];

    if (!w.over) {
      w.time += dt;
      w.damageMultiplier = mods().ramp(w.time);
    }

    refreshShip(a); refreshShip(b);

    w.powerT += dt;
    if (w.powerT >= mods().C.POWER_INTERVAL) {
      w.powerT -= mods().C.POWER_INTERVAL;
      mods().managePower(a); mods().managePower(b);
    }

    SimAI.drive(w, a, b, dt);
    SimAI.drive(w, b, a, dt);
    updateWarp(w, a, b, dt);
    updateWarp(w, b, a, dt);

    integrate(a, dt); integrate(b, dt);
    refreshShip(a); refreshShip(b);

    /* each module exactly once (BUG 5) */
    var i;
    for (i = 0; i < a.modules.length; i++) mods().tick(w, a, a.modules[i], b, dt);
    for (i = 0; i < b.modules.length; i++) mods().tick(w, b, b.modules[i], a, dt);
    mods().repairShip(w, a, dt);
    mods().repairShip(w, b, dt);

    updateBeams(w, dt);
    updateProjectiles(w, dt);

    w.ticks++;

    if (!w.over && w.time >= w.maxTime) {
      w.over = true;
      w.timedOut = true;
      w.reason = 'timeout';
      w.winner = a.healthFrac === b.healthFrac ? 'draw'
               : (a.healthFrac > b.healthFrac ? 'player' : 'enemy');
    }
  }

  /* ------------------------------------------------------------------ */
  /* public                                                              */
  /* ------------------------------------------------------------------ */

  function create(opts) {
    opts = opts || {};
    var w = {
      seed: (opts.seed === undefined ? 1 : opts.seed) | 0,
      time: 0, ticks: 0, acc: 0, powerT: 0,
      damageMultiplier: 1,
      over: false, winner: null, reason: null, timedOut: false,
      maxTime: opts.maxTime || DEFAULT_MAX_TIME,
      projectiles: new Array(POOL), liveProjectiles: 0, debrisCount: 0, pnext: 0,
      beams: new Array(BEAMS),
      events: new Array(EVENTS), eventCount: 0,
      ships: null,
      step: null
    };
    for (var i = 0; i < POOL; i++) w.projectiles[i] = newProj();
    for (i = 0; i < BEAMS; i++) w.beams[i] = newBeam();
    for (i = 0; i < EVENTS; i++) w.events[i] = { type: '', x: 0, y: 0, a: 0 };

    var p = buildShip(w, opts.playerFit, 0);
    var e = buildShip(w, opts.enemyFit, 1);
    var sep = opts.separation || START_SEPARATION;
    p.x = -sep / 2; p.y = 0; p.rot = 0;
    e.x = sep / 2;  e.y = 0; e.rot = Math.PI;
    w.ships = [p, e];
    w.player = p; w.enemy = e;

    refreshShip(p); refreshShip(e);
    checkOut(w, p); checkOut(w, e);

    w.step = function (dt) { return step(w, dt); };
    return w;
  }

  /* Fixed timestep with an accumulator: identical results at any frame rate. */
  function step(w, dt) {
    w.eventCount = 0;
    if (!(dt > 0)) return 0;
    if (dt > 0.25) dt = 0.25;
    w.acc += dt;
    var n = 0;
    while (w.acc >= FIXED && n < MAX_SUBSTEPS) {
      var wasOver = w.over;
      substep(w, FIXED);
      w.acc -= FIXED;
      n++;
      /* stop on the tick the battle ends — otherwise a 30fps caller would run
         one more sub-step than a 60fps one and the two would disagree about
         where the wreckage came to rest. */
      if (!wasOver && w.over) break;
    }
    if (w.acc < 1e-9) w.acc = 0;
    return n;
  }

  return {
    create: create,
    step: function (w, dt) { return step(w, dt); },
    rnd: rnd, spawn: spawn, spawnBeam: spawnBeam, kill: kill,
    damage: damage, event: event, pdScanDebris: pdScanDebris,
    FIXED: FIXED, POOL: POOL, BEAMS: BEAMS,
    KIND: { BALLISTIC: K_BALLISTIC, MISSILE: K_MISSILE, INTERCEPT: K_INTERCEPT,
            JUNK: K_JUNK, MINE: K_MINE },
    /* No AI_PRESETS / AI_DEFAULTS. Every ship fights the same way; the doctrine
       is SimAI.DOCTRINE and it is a property of the game, not of a fit. */
    get DOCTRINE() { return SimAI.DOCTRINE; }
  };
})();
