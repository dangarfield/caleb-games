import { game } from './state.js';
import { BULLET_SPEED, BULLET_R, BASE_SHOOT_CD, ENEMY_BULLET_SPEED, ENEMY_BULLET_R, PLAYER_R } from './constants.js';
import { dist, circRect, clamp, dmgVar, lineHitsRect } from './utils.js';
import { arena, T } from './arena.js';
import { sfxShoot, sfxHit, sfxEnemyShoot, sfxPlayerHit } from './audio.js';
import { spawnParticles, spawnDmgNumber } from './particles.js';
import { getInput } from './input.js';
import { updateDelayedBullets } from './enemies.js';

export function updateShooting(dt) {
  game.shootTimer -= dt;
  const p = game.player;
  let shootCD = BASE_SHOOT_CD * p.cdMult;
  // Fury: +0.4% attack speed per 1% HP missing (gradual scaling)
  if (p.fury) {
    const missingPct = 1 - p.hp / p.maxHp;
    shootCD *= 1 / (1 + missingPct * 0.4);
  }
  const input = getInput();

  // Find best target: prefer clear line-of-sight, fallback to nearest
  let shootTarget = null;
  if (!input.moving && game.enemies.length > 0) {
    let nearest = null, nd = Infinity;
    let nearestClear = null, ncd = Infinity;
    for (const e of game.enemies) {
      if (e._spawnTimer > 0 || e._underground) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < nd) { nd = d; nearest = e; }
      if (d < ncd) {
        let blocked = false;
        for (const ob of game.obstacles) {
          if (lineHitsRect(p.x, p.y, e.x, e.y, ob.x, ob.y, ob.w, ob.h)) { blocked = true; break; }
        }
        if (!blocked) { ncd = d; nearestClear = e; }
      }
    }
    shootTarget = nearestClear || nearest;
    if (shootTarget) game._shootAngle = Math.atan2(shootTarget.y - p.y, shootTarget.x - p.x);
  }
  game._shootTarget = shootTarget; // expose for targeting indicator

  // Delay first shot by 12ms when transitioning from moving to aiming
  if (shootTarget && !game._wasAiming) {
    game._wasAiming = true;
    if (game.shootTimer <= 0) game.shootTimer = 0.015;
  }
  if (!shootTarget) game._wasAiming = false;

  if (shootTarget && game.shootTimer <= 0) {
    game.shootTimer = shootCD;
    const ang = game._shootAngle;
    let effectiveDmgMult = p.dmgMult;
    // Rage: damage scales with missing HP (proportional)
    if (p.rage) {
      const missingPct = 1 - p.hp / p.maxHp;
      effectiveDmgMult *= (1 + missingPct);
    }

    const baseDmg = 10 * effectiveDmgMult;
    // Apply crit (includes crit aura bonus)
    const applyCrit = () => {
      let mult = 1;
      const critAuraBonus = p._critAuraActive ? 0.45 * (p.critAuraStacks || 0) : 0;
      const totalCrit = p.critChance + critAuraBonus;
      if (totalCrit > 0 && Math.random() < totalCrit) mult = p.critDmg || 2;
      return mult;
    };

    // Collect all arrow directions: { angle, dmgMult }
    const arrows = [];

    // Main arrow + front arrows: spread evenly from center
    const frontCount = 1 + (p.frontArrows || 0);
    const frontSpread = 0.06;
    for (let f = 0; f < frontCount; f++) {
      const offsetAng = ang + (f - (frontCount - 1) / 2) * frontSpread;
      arrows.push({ angle: offsetAng, dmgMult: 1 });
    }

    // Rear arrow
    if (p.rearShot) {
      arrows.push({ angle: ang + Math.PI, dmgMult: 0.6 });
    }

    // Diagonal arrows (45-degree offset)
    if (p.diagonalArrows) {
      arrows.push({ angle: ang + Math.PI / 4, dmgMult: 0.6 });
      arrows.push({ angle: ang - Math.PI / 4, dmgMult: 0.6 });
    }

    // Side arrows (perpendicular)
    if (p.sideArrows) {
      arrows.push({ angle: ang + Math.PI / 2, dmgMult: 0.5 });
      arrows.push({ angle: ang - Math.PI / 2, dmgMult: 0.5 });
    }

    // Fire each arrow direction, plus multishot trailing copies behind
    const trailSpacing = 0.88 * T(); // ~40px between trailing arrows
    for (const arr of arrows) {
      fireBullet(arr.angle, baseDmg * arr.dmgMult * applyCrit(), 0);
      for (let s = 1; s <= p.extraShots; s++) {
        fireBullet(arr.angle, baseDmg * arr.dmgMult * applyCrit(), s * trailSpacing, true);
      }
    }

    sfxShoot();
  }
}

function fireBullet(ang, dmg, trailDist, fadeIn) {
  const p = game.player;
  const td = trailDist || 0; // distance behind the arrow origin
  const t = T();
  game.bullets.push({
    x: p.x + Math.cos(ang) * (PLAYER_R + 0.09) * t - Math.cos(ang) * td,
    y: p.y + Math.sin(ang) * (PLAYER_R + 0.09) * t - Math.sin(ang) * td,
    vx: Math.cos(ang) * BULLET_SPEED * t,
    vy: Math.sin(ang) * BULLET_SPEED * t,
    ang,
    dmg, pierceLeft: 1 + p.pierce, pierceCount: 0, bounces: 0,
    isCrit: dmg > 10 * p.dmgMult,
    origDmg: dmg,
    opacity: fadeIn ? 0 : 1,
    fadeDistLeft: fadeIn ? td : 0
  });
}

function spawnBoltArc(x1, y1, x2, y2) {
  // Pre-compute 4-segment zigzag between source and target
  const segs = 4;
  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const mx = x1 + (x2 - x1) * t;
    const my = y1 + (y2 - y1) * t;
    // Perpendicular offset for jaggedness
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len, py = dx / len;
    const off = (Math.random() - 0.5) * 0.53 * T();
    pts.push({ x: mx + px * off, y: my + py * off });
  }
  pts.push({ x: x2, y: y2 });
  game.boltArcs.push({ pts, life: 0.15 });
}

function spawnStuckArrow(x, y, ang) {
  if (!game.stuckArrows) game.stuckArrows = [];
  const a = arena();
  // Clamp to arena edges so arrows don't appear outside the play area
  const cx = clamp(x, a.x, a.x + a.w);
  const cy = clamp(y, a.y, a.y + a.h);
  game.stuckArrows.push({ x: cx, y: cy, ang, life: 0.6 });
}

export function updateBullets(dt) {
  const a = arena();
  const p = game.player;

  // Player bullets
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ang = Math.atan2(b.vy, b.vx);
    // Trailing multishot arrows: stay hidden until they've traveled past their spawn offset
    if (b.opacity < 1) {
      b.fadeDistLeft -= BULLET_SPEED * T() * dt;
      if (b.fadeDistLeft <= 0) b.opacity = 1;
      else continue; // skip all collision/effects while hidden
    }

    // Wall/boundary handling
    let oob = false;
    const br = BULLET_R * T();
    if (p.bouncy && b.bounces < 1 && !b.isHoly) {
      let bounced = false;
      if (b.x < a.x + br) { b.x = a.x + br; b.vx *= -1; bounced = true; }
      else if (b.x > a.x + a.w - br) { b.x = a.x + a.w - br; b.vx *= -1; bounced = true; }
      else if (b.y < a.y + br) { b.y = a.y + br; b.vy *= -1; bounced = true; }
      else if (b.y > a.y + a.h - br) { b.y = a.y + a.h - br; b.vy *= -1; bounced = true; }
      if (bounced) {
        b.bounces++;
        b.dmg = b.origDmg * 0.5; // -50% damage per bounce
      }
    }
    // OOB check (always, for bounced-out or non-bouncy bullets)
    if (b.x < a.x - br || b.x > a.x + a.w + br || b.y < a.y - 20 || b.y > a.y + a.h + br) oob = true;
    if (oob) { if (!b.isHoly) spawnStuckArrow(b.x, b.y, b.ang); game.bullets.splice(i, 1); continue; }

    // Obstacle collision — bounce off if bouncy, else destroy
    let hitOb = false;
    if (p.bouncy && !b.isHoly) {
      for (const ob of game.obstacles) {
        if (circRect(b.x, b.y, br, ob.x, ob.y, ob.w, ob.h)) {
          // Determine bounce direction based on overlap
          const cx = b.x, cy = b.y;
          const nearX = Math.max(ob.x, Math.min(cx, ob.x + ob.w));
          const nearY = Math.max(ob.y, Math.min(cy, ob.y + ob.h));
          const dx = cx - nearX, dy = cy - nearY;
          if (Math.abs(dx) > Math.abs(dy)) {
            b.vx *= -1; b.x = dx > 0 ? ob.x + ob.w + br : ob.x - br;
          } else {
            b.vy *= -1; b.y = dy > 0 ? ob.y + ob.h + br : ob.y - br;
          }
          b.bounces++;
          b.dmg = b.origDmg * 0.5;
          break;
        }
      }
    } else {
      for (const ob of game.obstacles) {
        if (circRect(b.x, b.y, br, ob.x, ob.y, ob.w, ob.h)) { hitOb = true; break; }
      }
      if (hitOb) { if (!b.isHoly) spawnStuckArrow(b.x, b.y, b.ang); game.bullets.splice(i, 1); continue; }
    }

    // Enemy hit
    let hit = false;
    if (!b._hitEnemies) b._hitEnemies = new Set();
    for (const e of game.enemies) {
      if (e._underground || e._spawnTimer > 0) continue;
      if (b._hitEnemies.has(e)) continue; // already pierced through this one
      if (dist(b.x, b.y, e.x, e.y) < br + e.r) {
        // Dark Curse damage amplification
        let actualDmg = b.dmg;
        if (e.darkCurse > 0) actualDmg *= 1.25; // 25% more damage while cursed
        if (game.debug.noDmgToEnemy) actualDmg = 0;
        else actualDmg = dmgVar(actualDmg);
        e.hp -= actualDmg;
        if (actualDmg > 0) spawnDmgNumber(e.x, e.y - e.r, actualDmg, '#fff');
        const kbStr = 0.005;
        e.knockback = 0.01;
        e.kbx = b.vx * kbStr;
        e.kby = b.vy * kbStr;
        sfxHit();
        spawnParticles(b.x, b.y, e.color, 3, 80);

        // Holy Touch: standard arrows spawn perpendicular blue projectiles from enemy center
        if (p.holyTouchStacks > 0 && !b.isHoly && !b.ricochetCount) {
          const holyDmg = actualDmg * 0.6;
          const t = T();
          for (const perpOff of [Math.PI / 2, -Math.PI / 2]) {
            const ha = b.ang + perpOff;
            const hb = {
              x: e.x, y: e.y,
              vx: Math.cos(ha) * BULLET_SPEED * t * 0.8,
              vy: Math.sin(ha) * BULLET_SPEED * t * 0.8,
              ang: ha,
              dmg: holyDmg, pierceLeft: 0, pierceCount: 0, bounces: 0,
              origDmg: holyDmg, isCrit: false, isHoly: true,
              _hitEnemies: new Set([e])
            };
            game.bullets.push(hb);
          }
        }

        // Elemental effects
        const elemBaseDmg = 10 * p.dmgMult;
        const elemMult = p.elementDmgMult || 1;
        let elementalApplied = false;

        if (p.blaze) {
          // Fire DoT: 18% equipment damage every 0.25s for 2s (7 ticks)
          e.blazeTimer = 2;
          e.blazeDmg = elemBaseDmg * 0.18 * elemMult;
          e.blazeTickRate = 0.25;
          elementalApplied = true;
        }
        if (p.freeze && Math.random() < 0.3) {
          // Freeze for 2s + 10% damage on hit
          e.freezeTimer = 2;
          e.origSpeed = e.origSpeed || e.speed;
          e.speed = 0; // fully frozen
          const freezeDmg = elemBaseDmg * 0.10 * elemMult;
          if (p.elementBurst && p.critChance > 0 && Math.random() < p.critChance) {
            e.hp -= dmgVar(freezeDmg * (p.critDmg || 2));
          } else {
            e.hp -= dmgVar(freezeDmg);
          }
          elementalApplied = true;
        }
        if (p.poisonTouch && !e.poisonTimer) {
          // 35% equipment damage per second until death
          e.poisonTimer = 999;
          e.poisonDmg = elemBaseDmg * 0.35 * elemMult;
          elementalApplied = true;
        }
        if (p.bolt) {
          // Chain lightning: 25% equipment damage to nearby
          const boltDmg = elemBaseDmg * 0.25 * elemMult;
          let boltFinalDmg = boltDmg;
          if (p.elementBurst && p.critChance > 0 && Math.random() < p.critChance) {
            boltFinalDmg = boltDmg * (p.critDmg || 2);
          }
          for (const other of game.enemies) {
            if (other !== e && dist(e.x, e.y, other.x, other.y) < 4.4 * T()) {
              other.hp -= dmgVar(boltFinalDmg);
              spawnParticles(other.x, other.y, '#ffd32a', 2, 60);
              spawnBoltArc(e.x, e.y, other.x, other.y);
              break; // max one chain per hit
            }
          }
          elementalApplied = true;
        }
        if (p.darkTouch && !e.darkBombTimer) {
          // Time bomb: explodes after 1s for 100% ATK boost damage
          e.darkBombTimer = 1;
          e.darkBombDmg = elemBaseDmg * p.dmgMult * elemMult;
          spawnParticles(e.x, e.y, '#636e72', 2, 40);
        }

        // Headshot: 12.5% chance to instantly kill (any HP)
        if (p.headshot && e.hp > 0 && Math.random() < 0.125) {
          e.hp = 0;
          spawnParticles(e.x, e.y, '#ffd700', 6, 120);
        }

        b._hitEnemies.add(e);
        b.pierceLeft--;
        b.pierceCount++;
        // Pierce damage reduction: -33% per enemy pierced
        if (b.pierceLeft > 0) {
          b.dmg = b.origDmg * Math.pow(0.67, b.pierceCount);
          continue; // keep going through more enemies
        }
        // No pierce left — bullet is consumed
        hit = true;
        // Ricochet: bounce to nearest enemy at -30% per hit, 3 total hits
        const ricoCount = b.ricochetCount || 0;
        if (p.ricochet && ricoCount < 2 && !b.isHoly) {
          let nearestOther = null, nearDist = 6.6 * T();
          for (const other of game.enemies) {
            if (other === e || other.hp <= 0) continue;
            const od = dist(b.x, b.y, other.x, other.y);
            if (od < nearDist) { nearDist = od; nearestOther = other; }
          }
          if (nearestOther) {
            const ra = Math.atan2(nearestOther.y - b.y, nearestOther.x - b.x);
            const ricoDmg = b.origDmg * Math.pow(0.7, ricoCount + 1);
            game.bullets.push({
              x: b.x, y: b.y,
              vx: Math.cos(ra) * BULLET_SPEED * T(),
              vy: Math.sin(ra) * BULLET_SPEED * T(),
              ang: ra,
              dmg: ricoDmg, pierceLeft: 1, pierceCount: 0, bounces: 0,
              origDmg: ricoDmg, isCrit: b.isCrit, ricochetCount: ricoCount + 1
            });
          }
        }
        break;
      }
    }
    if (hit) game.bullets.splice(i, 1);
  }

  // Process delayed bullets (boss barrages etc.)
  updateDelayedBullets(dt);

  // Enemy bullets
  for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
    const b = game.enemyBullets[i];
    const slowMult = 1 - Math.min(p.slowProjectile || 0, 0.6);

    if (b.lobbed) {
      // Lobbed/arcing projectile: moves in parabolic arc, ignores obstacles
      b.lobProgress = (b.lobProgress || 0) + dt * (b.vx !== undefined ? Math.sqrt(b.vx * b.vx + b.vy * b.vy) : 130) / Math.max(b.lobDist || 150, 50) * slowMult;
      if (b.lobProgress >= 1) {
        // Landed at target
        b.x = b.targetX;
        b.y = b.targetY;
        b.lobbed = false; // becomes a ground-hit, remove below
        game.enemyBullets.splice(i, 1);
        // Check player hit at landing
        if (game.state !== 'dying' && game.state !== 'dead' && game.iFrames <= 0 && dist(b.targetX, b.targetY, p.x, p.y) < (ENEMY_BULLET_R + PLAYER_R + 0.18) * T()) {
          applyEnemyBulletHit(b, p);
        }
        spawnParticles(b.targetX, b.targetY, '#ff2d55', 3, 40);
        continue;
      }
      // Interpolate position along arc
      const t = b.lobProgress;
      b.x = b.startX + (b.targetX - b.startX) * t;
      b.y = b.startY + (b.targetY - b.startY) * t - Math.sin(t * Math.PI) * (b.lobArc || 0.6) * (b.lobDist || 150) * 0.4;
      // Lobbed bullets skip obstacle collision (fly over walls)
    } else {
      // Standard straight-line movement
      b.x += b.vx * slowMult * dt;
      b.y += b.vy * slowMult * dt;

      // Bouncy bullets bounce off arena walls
      const ebr = ENEMY_BULLET_R * T();
      if (b.bouncy && b.bouncesLeft > 0) {
        let bounced = false;
        if (b.x < a.x + ebr) { b.x = a.x + ebr; b.vx *= -1; bounced = true; }
        else if (b.x > a.x + a.w - ebr) { b.x = a.x + a.w - ebr; b.vx *= -1; bounced = true; }
        if (b.y < a.y + ebr) { b.y = a.y + ebr; b.vy *= -1; bounced = true; }
        else if (b.y > a.y + a.h - ebr) { b.y = a.y + a.h - ebr; b.vy *= -1; bounced = true; }
        if (bounced) b.bouncesLeft--;
      } else {
        // Out of bounds check
        if (b.x < a.x - ebr || b.x > a.x + a.w + ebr || b.y < a.y - 20 || b.y > a.y + a.h + ebr) {
          game.enemyBullets.splice(i, 1); continue;
        }
      }

      // Obstacle collision (non-lobbed, non-bouncy only)
      if (!b.bouncy) {
        let hitOb = false;
        for (const ob of game.obstacles) {
          if (circRect(b.x, b.y, ebr, ob.x, ob.y, ob.w, ob.h)) { hitOb = true; break; }
        }
        if (hitOb) { game.enemyBullets.splice(i, 1); continue; }
      }
    }

    // Hit player (skip during dying/dead — player already down)
    if (game.state !== 'dying' && game.state !== 'dead' && game.iFrames <= 0 && dist(b.x, b.y, p.x, p.y) < (ENEMY_BULLET_R + PLAYER_R) * T()) {
      // Agility: dodge per % missing HP
      let totalDodge = p.dodgeChance || 0;
      if (p.agility) {
        const missingPct = 1 - p.hp / p.maxHp;
        totalDodge = 1 - (1 - totalDodge) * (1 - missingPct * 0.3);
      }
      if (totalDodge > 0 && Math.random() < totalDodge) {
        spawnParticles(p.x, p.y, '#fff', 3, 60);
        game.enemyBullets.splice(i, 1);
        continue;
      }
      applyEnemyBulletHit(b, p);
      game.enemyBullets.splice(i, 1);
    }
  }
}

function applyEnemyBulletHit(b, p) {
  if (p.shieldCharges > 0) {
    p.shieldCharges--;
    spawnParticles(p.x, p.y, '#3498db', 8, 120);
  } else {
    let dmg = game.debug.noDmgToPlayer ? 0 : b.dmg;
    // Greed: enemies deal +20% damage per stack
    if (p.greedDmgTaken > 1) dmg = Math.floor(dmg * p.greedDmgTaken);
    dmg = Math.floor(dmgVar(dmg) * (game._retryDmgMult ?? 1));
    p.hp -= dmg;
    p.tookDamageThisStage = true;
    game.iFrames = 0.3 + (p.iFrameBonus || 0);
    sfxPlayerHit();
    game.shakeTimer = 0.12;
    spawnParticles(p.x, p.y, '#e74c3c', 4, 100);
    if (dmg > 0) spawnDmgNumber(p.x, p.y - PLAYER_R * T(), dmg, '#e74c3c');
  }
}
