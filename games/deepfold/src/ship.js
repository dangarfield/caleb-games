/* ship.js — the player.
 *
 * Flying is an exponential approach to a target point rather than a velocity
 * the finger pushes around. Drag and the ship chases the finger; stop and it
 * settles exactly where the finger is, with no overshoot and nothing to
 * "let go" of. The target sits CFG.ship.fingerOffsetY ABOVE the touch, which
 * is the whole reason the ship is visible on an iPad at all — a thumb covers
 * about eight world units of screen.
 *
 * The hitbox is 1.2 units against a 9-unit sprite. That is not a bug and it is
 * not generosity for its own sake: in a game where the screen fills with paper,
 * a hit has to be something the player can see coming, and the only way to get
 * that is to make the fatal part of the ship the middle of the ship.
 *
 * Nothing here allocates per frame. The shield ring, the charge ring and the
 * flames are built once and shown, hidden and scaled.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { playerShip } from './designs.js';
import { paperPiece, blobShape, ringShape, mergeShadows } from './paper.js';
import { ramp, RIM, GOLD } from './palette.js';

export function createShip(scene, { rampName = 'STAGE1', bullets } = {}) {
  const S = CFG.ship;
  const group = new THREE.Group();
  group.position.z = 1.2;
  if (scene) scene.add(group);

  const art = playerShip({ rampName, len: S.len });
  /* The hull is a rigid assembly — the only thing that moves inside it is the
     flame stack, which is cut without shadows — so its two dozen shadow meshes
     collapse into one. The fills stay separate and recolourable. */
  mergeShadows(art);
  group.add(art);

  /* One ring for the charge wind-up and one for the SHIELD. Both are built at
     boot and never rebuilt; they are shown by opacity, not by add/remove. */
  const chargeRing = paperPiece(
    ringShape(blobShape({ radius: S.len * 0.92, points: 16, wobble: 0.04, seed: 5 }), 0.9),
    RIM, { z: 2.2, shadow: false, opacity: 0 });
  group.add(chargeRing);

  const shieldRing = paperPiece(
    ringShape(blobShape({ radius: S.len * 0.78, points: 18, wobble: 0.03, seed: 9 }), 0.7),
    GOLD, { z: 2.0, shadow: false, opacity: 0 });
  group.add(shieldRing);

  const flames = art.userData.flame;

  const ship = {
    group, art,
    x: 0, y: 0,
    vx: 0, vy: 0,
    alive: true,
    lives: S.lives,
    invuln: 0,
    shield: false,
    spread: 0,               // seconds of SPREAD left
    speed: 0,                // seconds of SPEED left
    fireTimer: 0,
    radius: S.hitRadius,
    reset, update, fire, hit, addPower, place, clearPowers, setVisible,
  };

  function place(x, y) {
    ship.x = x; ship.y = y;
    group.position.x = x;
    group.position.y = y;
  }

  function reset(x, y, keepPowers) {
    place(x, y);
    ship.vx = 0; ship.vy = 0;
    ship.alive = true;
    ship.invuln = S.startInvuln;
    ship.fireTimer = 0;
    if (!keepPowers) clearPowers();
    group.visible = true;
  }

  function clearPowers() {
    ship.shield = false;
    ship.spread = 0;
    ship.speed = 0;
    shieldRing.userData.fill.material.opacity = 0;
  }

  function setVisible(v) { group.visible = v; }

  function addPower(kind) {
    if (kind === 'SHIELD') ship.shield = true;
    else if (kind === 'SPREAD') ship.spread = CFG.powerups.duration;
    else if (kind === 'SPEED') ship.speed = CFG.powerups.duration;
  }

  /* ------------------------------------------------------------ the frame */

  function update(dt, inp, layout, diff) {
    const boost = ship.speed > 0 ? S.speedBoost : 1;

    if (inp.hasPointer) {
      const tx = inp.px;
      const ty = inp.py + S.fingerOffsetY;
      // frame-rate independent exponential approach
      const k = 1 - Math.exp(-S.follow * boost * dt);
      let dx = (tx - ship.x) * k;
      let dy = (ty - ship.y) * k;
      const cap = S.maxSpeed * boost * dt;
      const d = Math.hypot(dx, dy);
      if (d > cap) { dx = dx / d * cap; dy = dy / d * cap; }
      ship.x += dx; ship.y += dy;
      ship.vx = dx / Math.max(dt, 1e-4);
      ship.vy = dy / Math.max(dt, 1e-4);
    } else {
      const want = S.keySpeed * boost;
      const ka = 1 - Math.exp(-S.keyAccel * dt);
      ship.vx += (inp.kx * want - ship.vx) * ka;
      ship.vy += (inp.ky * want - ship.vy) * ka;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
    }

    // Station keeping. The ship lives in the left third; the stage comes to it.
    if (ship.x < layout.shipXMin) { ship.x = layout.shipXMin; ship.vx = 0; }
    if (ship.x > layout.shipXMax) { ship.x = layout.shipXMax; ship.vx = 0; }
    const yLim = 50 - S.yMargin;              // the view is always 100 tall
    if (ship.y > yLim) { ship.y = yLim; ship.vy = 0; }
    if (ship.y < -yLim) { ship.y = -yLim; ship.vy = 0; }

    group.position.x = ship.x;
    group.position.y = ship.y;
    // A little bank into the vertical movement. Paper does not bank, so this
    // is small enough to read as the sheet tilting rather than as a 3D roll.
    group.rotation.z = Math.max(-0.28, Math.min(0.28, ship.vy * 0.0035));

    if (ship.invuln > 0) {
      ship.invuln -= dt;
      const on = Math.floor(performance.now() / (1000 / S.flashHz / 2)) % 2 === 0;
      art.visible = on;
      if (ship.invuln <= 0) { ship.invuln = 0; art.visible = true; }
    }

    if (ship.spread > 0) ship.spread -= dt;
    if (ship.speed > 0) ship.speed -= dt;

    // charge ring: fills as the cannon winds up, snaps off when it fires
    const cm = chargeRing.userData.fill.material;
    if (inp.charging && inp.charge > 0.02) {
      cm.opacity = 0.25 + inp.charge * 0.7;
      const s = 0.55 + inp.charge * 0.55;
      chargeRing.scale.setScalar(s);
      chargeRing.rotation.z += dt * 3.2;
      cm.color.copy(ramp(rampName, 0.1 + 0.85 * (1 - inp.charge)));
    } else if (cm.opacity > 0) {
      cm.opacity = Math.max(0, cm.opacity - dt * 4);
    }

    const sm = shieldRing.userData.fill.material;
    if (ship.shield) {
      sm.opacity = 0.55 + Math.sin(performance.now() * 0.008) * 0.25;
      shieldRing.rotation.z -= dt * 1.4;
    } else if (sm.opacity > 0) {
      sm.opacity = Math.max(0, sm.opacity - dt * 5);
    }

    // exhaust pulse — cheap, and the ship stops looking parked when it hovers
    const f = 1 + Math.sin(performance.now() * 0.02) * 0.12 + (boost > 1 ? 0.35 : 0);
    flames.scale.set(f, 1, 1);

    ship.radius = S.hitRadius * (diff ? diff.playerHitScale : 1);

    // auto-fire: nobody mashes anything
    ship.fireTimer -= dt;
    if (ship.fireTimer <= 0) {
      fire();
      ship.fireTimer = ship.spread > 0 ? S.spreadRate : S.fireRate;
    }
  }

  function fire() {
    if (!bullets || !ship.alive) return;
    const x = ship.x + S.muzzleX, y = ship.y;
    const sp = S.bulletSpeed;
    bullets.firePlayer(x, y, sp, 0, S.bulletDamage);
    if (ship.spread > 0) {
      const a = S.spreadAngle;
      bullets.firePlayer(x, y, Math.cos(a) * sp, Math.sin(a) * sp, S.bulletDamage);
      bullets.firePlayer(x, y, Math.cos(-a) * sp, Math.sin(-a) * sp, S.bulletDamage);
    }
  }

  /* Returns what happened: 'shield' (a free hit was spent), 'dead', or 'safe'
     when the ship was already invulnerable. main.js decides the consequences. */
  function hit() {
    if (ship.invuln > 0 || !ship.alive) return 'safe';
    if (ship.shield) {
      ship.shield = false;
      ship.invuln = S.invulnTime * 0.5;
      return 'shield';
    }
    ship.alive = false;
    return 'dead';
  }

  reset(0, 0);
  return ship;
}
