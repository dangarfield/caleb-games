import { game } from './state.js';
import { PLAYER_R, ENEMY_BULLET_SPEED } from './constants.js';
import { dist, pushOutRect, circRect, dmgVar } from './utils.js';
import { arena, T } from './arena.js';
import { sfxEnemyDie, sfxPlayerHit, sfxEnemyShoot } from './audio.js';
import { spawnParticles, spawnDmgNumber } from './particles.js';
import { spawnCrystals } from './crystals.js';
import { spawnHeart } from './hearts.js';
import { giveXP } from './skills.js';
import { updateEnemyMovement, updateBossAttackPhase, getCurrentPhase } from './enemyAI.js';
import { getEnemyType } from './enemyTypes.js';
import { getStageScale, getSpeedScale } from './chapters.js';

const SPAWN_FADE_TIME = 0.6; // seconds for enemies to fade in

export function updateEnemies(dt) {
  const a = arena();
  const p = game.player;

  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];

    // Spawn fade-in timer
    if (e._spawnTimer > 0) {
      e._spawnTimer -= dt;
      continue; // skip all logic while fading in
    }

    // Knockback
    if (e.knockback > 0) {
      e.x += e.kbx * dt * 60;
      e.y += e.kby * dt * 60;
      e.knockback -= dt;
    }

    // ─── Movement ───
    if (e.knockback <= 0 && e.ai) {
      updateEnemyMovement(e, p, dt, a, game.obstacles);
      // Push out of water tiles (most enemies can't cross water)
      if (!e._ignoreWater) {
        for (const wt of game.waterTiles || []) {
          const pushed = pushOutRect(e.x, e.y, e.r, wt.x, wt.y, wt.w, wt.h);
          if (pushed) { e.x = pushed.x; e.y = pushed.y; }
        }
      }
    }

    // ─── Shooting ───
    if (e.ai) {
      updateNewAttack(e, p, dt);
    }

    // ─── Body collision with player ───
    if (!e._underground && game.iFrames <= 0 && dist(p.x, p.y, e.x, e.y) < PLAYER_R * T() + e.r) {
      let totalDodge = p.dodgeChance || 0;
      if (p.agility) {
        const missingPct = 1 - p.hp / p.maxHp;
        totalDodge = 1 - (1 - totalDodge) * (1 - missingPct * 0.3);
      }
      if (totalDodge > 0 && Math.random() < totalDodge) {
        spawnParticles(p.x, p.y, '#fff', 3, 60);
      } else if (p.shieldCharges > 0) {
        p.shieldCharges--;
        spawnParticles(p.x, p.y, '#3498db', 8, 120);
      } else {
        let dmg = game.debug.noDmgToPlayer ? 0 : Math.floor(32 * getStageScale(game.chapter, game.stage));
        if (p.greedDmgTaken > 1) dmg = Math.floor(dmg * p.greedDmgTaken);
        dmg = Math.floor(dmgVar(dmg) * (game._retryDmgMult ?? 1));
        p.hp -= dmg;
        p.tookDamageThisStage = true;
        game.iFrames = 0.5 + (p.iFrameBonus || 0);
        sfxPlayerHit();
        game.shakeTimer = 0.12;
        spawnParticles(p.x, p.y, '#fff', 5, 100);
        if (dmg > 0) spawnDmgNumber(p.x, p.y - PLAYER_R * T(), dmg, '#e74c3c');
      }
    }

    // ─── Elemental DoTs ───
    if (e.blazeTimer > 0) {
      e.blazeTimer -= dt;
      // Tick damage every 0.25s (or fallback to continuous)
      e._blazeTick = (e._blazeTick || 0) - dt;
      if (e._blazeTick <= 0) {
        e._blazeTick = e.blazeTickRate || 0.25;
        if (!game.debug.noDmgToEnemy) e.hp -= dmgVar(e.blazeDmg || 3);
      }
      if (Math.random() < dt * 3) spawnParticles(e.x, e.y, '#ff6b2b', 1, 40);
    }
    if (e.freezeTimer > 0) {
      e.freezeTimer -= dt;
      if (e.freezeTimer <= 0 && e.origSpeed) {
        e.speed = e.origSpeed;
      }
    }
    if (e.poisonTimer > 0) {
      e.poisonTimer -= dt;
      if (!game.debug.noDmgToEnemy) e.hp -= dmgVar((e.poisonDmg || 2) * dt);
      if (Math.random() < dt * 2) spawnParticles(e.x, e.y, '#2ecc71', 1, 30);
    }
    if (e.darkCurse > 0) e.darkCurse -= dt;

    // Dark Touch time bomb
    if (e.darkBombTimer > 0) {
      e.darkBombTimer -= dt;
      if (e.darkBombTimer <= 0) {
        // Explode for 100% ATK-boosted damage in AoE
        const bombDmg = game.debug.noDmgToEnemy ? 0 : (e.darkBombDmg || 10);
        e.hp -= dmgVar(bombDmg);
        for (const other of game.enemies) {
          if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.32 * T()) {
            other.hp -= dmgVar(bombDmg);
            spawnParticles(other.x, other.y, '#636e72', 3, 60);
          }
        }
        spawnParticles(e.x, e.y, '#636e72', 8, 120);
        e.darkBombTimer = 0;
      }
    }

    // ─── Death ───
    if (e.hp <= 0) {
      handleDeath(e, p, i);
    }
  }
}

// ─── New attack system ───

function updateNewAttack(e, p, dt) {
  // Boss attack phases (pause while underground)
  if (e.attackPhases) {
    if (!e._underground) {
      updateBossAttackPhase(e, dt);
      const phase = getCurrentPhase(e);
      if (phase) {
        fireBossPhase(e, p, phase, dt);
      }
    }
    return;
  }

  // Golem spin-triggered attacks
  if ((e.ai === 'spinThrow' || e.ai === 'spinCharge') && e._spinReady) {
    e._spinReady = false;
    fireAttackPattern(e, p, e.attack, e.attackParams);
    return;
  }

  // Burrow emerge-triggered attacks
  if (e.ai === 'burrow' && e._emergeReady) {
    e._emergeReady = false;
    fireAttackPattern(e, p, e.attack, e.attackParams);
    return;
  }

  // Skip attacks while underground
  if (e._underground) return;

  // Regular timer-based attacks
  if (e.attack === 'none') return;
  const interval = e.attackParams?.shootInterval || e.shootInterval || 2.5;
  if (e.shootTimer === undefined) e.shootTimer = interval * (0.5 + Math.random() * 0.5);
  e.shootTimer -= dt;
  if (e.shootTimer <= 0) {
    e.shootTimer = interval;
    fireAttackPattern(e, p, e.attack, e.attackParams);
  }
}

function fireAttackPattern(e, p, pattern, params) {
  const ang = Math.atan2(p.y - e.y, p.x - e.x);
  const bulletSpeed = (params?.bulletSpeed || ENEMY_BULLET_SPEED) * T() * (1 - Math.min(p.slowProjectile || 0, 0.6));
  const dmg = Math.floor(20 * getStageScale(game.chapter, game.stage));
  const style = params?.bulletStyle || e.attackParams?.bulletStyle || null;

  switch (pattern) {
    case 'single': {
      pushEnemyBullet(e, ang, bulletSpeed, dmg, undefined, style);
      break;
    }
    case 'bouncySingle': {
      pushEnemyBullet(e, ang, bulletSpeed, dmg, {
        bouncy: true,
        bouncesLeft: params?.bulletBounces || 2,
      }, style);
      break;
    }
    case 'lobSingle': {
      pushEnemyBullet(e, ang, (params?.lobSpeed || 2.86) * T(), dmg, {
        lobbed: true,
        lobArc: params?.lobArc || 0.6,
        lobDist: dist(e.x, e.y, p.x, p.y),
        lobProgress: 0,
      }, style);
      break;
    }
    case 'lobMulti': {
      const count = params?.count || 2;
      const spread = params?.spread || 0.25;
      for (let j = 0; j < count; j++) {
        const off = (j - (count - 1) / 2) * spread;
        pushEnemyBullet(e, ang + off, (params?.lobSpeed || 2.86) * T(), dmg, {
          lobbed: true,
          lobArc: params?.lobArc || 0.6,
          lobDist: dist(e.x, e.y, p.x, p.y),
          lobProgress: 0,
        }, style);
      }
      break;
    }
    case 'fan': {
      const count = params?.count || 3;
      const spread = params?.spread || 0.6;
      const fanOpts = params?.bulletBounce ? { bouncy: true, bouncesLeft: params.bulletBounces || 2 } : {};
      for (let j = 0; j < count; j++) {
        const off = (j - (count - 1) / 2) * (spread / Math.max(count - 1, 1));
        pushEnemyBullet(e, ang + off, bulletSpeed, dmg, fanOpts, style);
      }
      break;
    }
    case 'cardinal': {
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 2;
        pushEnemyBullet(e, a, bulletSpeed, dmg, {
          bouncy: params?.bulletBounce,
          bouncesLeft: params?.bulletBounce ? 2 : 0,
        }, style);
      }
      break;
    }
    case 'cardinal8': {
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4;
        pushEnemyBullet(e, a, bulletSpeed, dmg, {
          bouncy: params?.bulletBounce,
          bouncesLeft: params?.bulletBounce ? (params.bulletBounces || 2) : 0,
        }, style);
      }
      break;
    }
    case 'barrage': {
      const lines = params?.count || 1;
      const bpl = params?.bulletsPerLine || 4;
      const lineSpread = params?.lineSpread || 0.15;
      const delay = params?.burstDelay || 0.12;
      for (let l = 0; l < lines; l++) {
        const lineAng = ang + (l - (lines - 1) / 2) * lineSpread;
        for (let b = 0; b < bpl; b++) {
          const d = b * delay;
          queueDelayedBullet(e, lineAng, bulletSpeed, dmg, d, style);
        }
      }
      break;
    }
    case 'random': {
      const count = params?.count || 8;
      const delay = params?.burstDelay || 0.08;
      for (let j = 0; j < count; j++) {
        const rAng = Math.random() * Math.PI * 2;
        queueDelayedBullet(e, rAng, bulletSpeed * (0.8 + Math.random() * 0.4), dmg, j * delay, style);
      }
      break;
    }
    case 'summon': {
      // Boss summon: spawn an enemy of the given type
      const typeId = params?.spawnType;
      if (typeId) {
        const maxActive = params?.maxActive || 2;
        // Count existing enemies of this type
        const existing = game.enemies.filter(en => en.typeId === typeId).length;
        if (existing < maxActive) {
          const typeDef = getEnemyType(typeId);
          if (typeDef) {
            const a = arena();
            const t2 = T();
            const scale = getStageScale(game.chapter, game.stage);
            const pad2 = 0.88 * t2;
            const sx = a.x + pad2 + Math.random() * (a.w - pad2 * 2);
            const sy = a.y + pad2 + Math.random() * (a.h * 0.5);
            spawnSingleEnemy(typeId, typeDef, scale, sx, sy);
          }
        }
      }
      break;
    }
  }
  sfxEnemyShoot();
}

function fireBossPhase(e, p, phase, dt) {
  if (!e._phaseBurstTimer) e._phaseBurstTimer = 0;
  e._phaseBurstTimer -= dt;
  if (e._phaseBurstTimer <= 0) {
    // Handle pre-action (like bounce) - simplified: we just fire the pattern
    if (phase.pattern === 'summon') {
      fireAttackPattern(e, p, 'summon', phase.params);
      e._phaseBurstTimer = phase.duration; // only once per phase
    } else {
      fireAttackPattern(e, p, phase.pattern, phase.params);
      // Repeat the pattern during the phase duration
      e._phaseBurstTimer = phase.params?.burstDelay
        ? (phase.params.burstDelay * (phase.params.count || phase.params.bulletsPerLine || 1)) + 0.3
        : 1.5;
    }
  }
}

// ─── Bullet helpers ───

function pushEnemyBullet(e, ang, speed, dmg, opts, bStyle) {
  const bx = e.x + Math.cos(ang) * (e.r + 0.09 * T());
  const by = e.y + Math.sin(ang) * (e.r + 0.09 * T());
  const bullet = {
    x: bx, y: by,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    dmg,
    ...opts,
  };
  if (bStyle) bullet.style = bStyle;
  if (opts?.lobbed) {
    bullet.startX = bx;
    bullet.startY = by;
    bullet.targetX = bx + Math.cos(ang) * (opts.lobDist || 150);
    bullet.targetY = by + Math.sin(ang) * (opts.lobDist || 150);
  }
  game.enemyBullets.push(bullet);
}

// Queues a bullet to fire after a delay
function queueDelayedBullet(e, ang, speed, dmg, delay, bStyle) {
  if (delay <= 0) {
    pushEnemyBullet(e, ang, speed, dmg, undefined, bStyle);
    return;
  }
  if (!game._delayedBullets) game._delayedBullets = [];
  game._delayedBullets.push({
    ex: e.x, ey: e.y, er: e.r,
    ang, speed, dmg, delay, style: bStyle || null,
  });
}

// Called from updateEnemyBullets to process delayed bullets
export function updateDelayedBullets(dt) {
  if (!game._delayedBullets) return;
  for (let i = game._delayedBullets.length - 1; i >= 0; i--) {
    const d = game._delayedBullets[i];
    d.delay -= dt;
    if (d.delay <= 0) {
      const bx = d.ex + Math.cos(d.ang) * (d.er + 0.09 * T());
      const by = d.ey + Math.sin(d.ang) * (d.er + 0.09 * T());
      const nb = {
        x: bx, y: by,
        vx: Math.cos(d.ang) * d.speed,
        vy: Math.sin(d.ang) * d.speed,
        dmg: d.dmg,
      };
      if (d.style) nb.style = d.style;
      game.enemyBullets.push(nb);
      game._delayedBullets.splice(i, 1);
    }
  }
}

// ─── Death handling ───

function handleDeath(e, p, i) {
  sfxEnemyDie();
  spawnParticles(e.x, e.y, e.color, 10, 120);

  // Death Bomb: 100% equipment damage AoE
  if (p.deathBomb) {
    const bombDmg = game.debug.noDmgToEnemy ? 0 : 10 * p.dmgMult;
    for (const other of game.enemies) {
      if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.54 * T()) {
        other.hp -= dmgVar(bombDmg);
        spawnParticles(other.x, other.y, '#ff6b2b', 3, 80);
      }
    }
    spawnParticles(e.x, e.y, '#ff4500', 8, 150);
  }

  // Death Nova: 8 directional projectiles dealing 30% current damage
  if (p.deathNova) {
    const novaDmg = game.debug.noDmgToEnemy ? 0 : 10 * p.dmgMult * 0.3;
    const NOVA_SPEED = 5.5 * T(); // ~250px/s
    for (let n = 0; n < 8; n++) {
      const a = (Math.PI * 2 / 8) * n;
      game.bullets.push({
        x: e.x + Math.cos(a) * 0.22 * T(),
        y: e.y + Math.sin(a) * 0.22 * T(),
        vx: Math.cos(a) * NOVA_SPEED,
        vy: Math.sin(a) * NOVA_SPEED,
        ang: a,
        dmg: novaDmg, pierceLeft: 2, pierceCount: 0, bounces: 0,
        origDmg: novaDmg, isCrit: false, isNova: true
      });
    }
    spawnParticles(e.x, e.y, '#2ecc71', 10, 130);
  }

  // Chilling Blast: frozen enemies AoE freeze on death (no damage, but triggers headshot)
  if (p.chillingBlast && e.freezeTimer > 0) {
    for (const other of game.enemies) {
      if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.76 * T()) {
        other.freezeTimer = 2;
        other.origSpeed = other.origSpeed || other.speed;
        other.speed = 0;
        // Headshot trigger on frozen enemies
        if (p.headshot && other.hp > 0 && Math.random() < 0.125) {
          other.hp = 0;
          spawnParticles(other.x, other.y, '#ffd700', 6, 120);
        }
        spawnParticles(other.x, other.y, '#74b9ff', 3, 80);
      }
    }
    spawnParticles(e.x, e.y, '#74b9ff', 12, 160);
  }

  // Drop crystals
  spawnCrystals(e.x, e.y, Math.floor(e.crystalValue * (p.greedMult || 1)));

  // Heart drops: weighted variable count (avg ~0.70 per kill)
  const hr = Math.random() + (p.heartDropChance || 0);
  const hCount = hr < 0.55 ? 0 : hr < 0.83 ? 1 : hr < 0.94 ? 2 : hr < 0.98 ? 3 : 4;
  for (let hi = 0; hi < hCount; hi++) spawnHeart(e.x, e.y);

  // Heal on kill (1.5% base HP per kill per stack)
  if (p.healOnKillPct > 0) {
    const healAmt = Math.max(1, Math.floor(p.maxHp * p.healOnKillPct));
    p.hp = Math.min(p.hp + healAmt, p.maxHp);
  }

  giveXP(e.xpValue);

  // ─── Split on death ───
  if (e.splitOnDeath) {
    // New system: spawn specific enemy types
    const splitDef = e.splitOnDeath;
    const typeDef = getEnemyType(splitDef.spawnType);
    if (typeDef) {
      const scale = getStageScale(game.chapter, game.stage);
      for (let s = 0; s < splitDef.count; s++) {
        const sa = Math.random() * Math.PI * 2;
        const sx = e.x + Math.cos(sa) * 0.44 * T();
        const sy = e.y + Math.sin(sa) * 0.44 * T();
        spawnSingleEnemy(splitDef.spawnType, typeDef, scale, sx, sy);
      }
    }
  }

  game.enemies.splice(i, 1);
}

// ─── Spawn helpers ───

// Convert tile-based aiParams to pixel values at spawn time.
// enemyAI.js operates in pixels and needs no changes.
const _AI_SPEED = ['lungeSpeed', 'chargeSpeed', 'wanderSpeed', 'dashSpeed', 'bounceSpeed'];
const _AI_DIST = ['lungeRange', 'dashRange', 'preferredDist'];
function scaleAiParams(params, t) {
  if (!params) return {};
  const out = { ...params };
  for (const k of _AI_SPEED) if (out[k] != null) out[k] *= t;
  for (const k of _AI_DIST) if (out[k] != null) out[k] *= t;
  if (out.stalkRange) out.stalkRange = out.stalkRange.map(v => v * t);
  return out;
}

/**
 * Spawn a single enemy from an ENEMY_TYPES definition at a given position.
 */
function spawnSingleEnemy(typeId, typeDef, scale, x, y) {
  const t = T();
  // Push out of walls/water if overlapping
  const r = (typeDef.baseR || 0.29) * 2 * t;
  let sx = x, sy = y;
  for (const ob of game.obstacles) {
    const p = pushOutRect(sx, sy, r + 2, ob.x, ob.y, ob.w, ob.h);
    if (p) { sx = p.x; sy = p.y; }
  }
  for (const wt of game.waterTiles || []) {
    const p = pushOutRect(sx, sy, r + 2, wt.x, wt.y, wt.w, wt.h);
    if (p) { sx = p.x; sy = p.y; }
  }
  game.enemies.push({
    x: sx, y: sy,
    hp: Math.floor(typeDef.baseHp * scale),
    maxHp: Math.floor(typeDef.baseHp * scale),
    r,
    speed: (typeDef.baseSpeed || 0) * getSpeedScale(scale) * t,
    typeId,
    draw: typeDef.draw,
    color: typeDef.color,
    colorAlt: typeDef.colorAlt,
    shape: typeDef.draw,
    ai: typeDef.ai,
    aiParams: scaleAiParams(typeDef.aiParams, t),
    attack: typeDef.attack || 'none',
    attackParams: typeDef.attackParams ? { ...typeDef.attackParams } : {},
    attackPhases: typeDef.attackPhases || null,
    shoots: typeDef.attack !== 'none' || !!typeDef.attackPhases,
    shootInterval: typeDef.attackParams?.shootInterval || 99,
    shootTimer: (typeDef.attackParams?.shootInterval || 2) * (0.5 + Math.random() * 0.5),
    splitOnDeath: typeDef.splitOnDeath || null,
    xpValue: typeDef.xpValue || 10,
    crystalValue: typeDef.crystalValue || 1,
    isBoss: false,
    isChapterBoss: false,
    guaranteedDrop: false,
    moveTimer: Math.random() * 2,
    moveAngle: Math.random() * Math.PI * 2,
    knockback: 0, kbx: 0, kby: 0,
    _spawnTimer: SPAWN_FADE_TIME,
  });
}

/**
 * Spawn a single enemy at a specific position with optional boss properties.
 */
export function spawnEnemyAt(typeId, typeDef, scale, x, y, opts = {}) {
  const t = T();
  const bossScale = opts.bossScale || 1;
  const bossCount = typeDef.bossCount || 1;
  for (let bc = 0; bc < bossCount; bc++) {
    const offsetX = bossCount > 1 ? (bc - (bossCount - 1) / 2) * 0.66 * t : 0;
    game.enemies.push({
      x: x + offsetX, y,
      hp: Math.floor(typeDef.baseHp * scale * bossScale),
      maxHp: Math.floor(typeDef.baseHp * scale * bossScale),
      r: (typeDef.baseR || 0.29) * 2 * t,
      speed: (typeDef.baseSpeed || 0) * getSpeedScale(scale) * t,
      typeId,
      draw: typeDef.draw,
      color: typeDef.color,
      colorAlt: typeDef.colorAlt,
      shape: typeDef.draw,
      ai: typeDef.ai,
      aiParams: scaleAiParams(typeDef.aiParams, t),
      attack: typeDef.attack || 'none',
      attackParams: typeDef.attackParams ? { ...typeDef.attackParams } : {},
      attackPhases: typeDef.attackPhases || null,
      shoots: typeDef.attack !== 'none' || !!typeDef.attackPhases,
      shootInterval: typeDef.attackParams?.shootInterval || (typeDef.attackPhases ? 0 : 99),
      shootTimer: (typeDef.attackParams?.shootInterval || 2) * (0.5 + Math.random() * 0.5),
      splitOnDeath: typeDef.splitOnDeath || null,
      xpValue: typeDef.xpValue || 10,
      crystalValue: typeDef.crystalValue || 1,
      isBoss: opts.isBoss || false,
      isChapterBoss: opts.isChapterBoss || false,
      guaranteedDrop: (opts.guaranteedDrop || false) && bc === 0,
      boss: typeDef.boss || false,
      moveTimer: Math.random() * 2,
      moveAngle: Math.random() * Math.PI * 2,
      knockback: 0, kbx: 0, kby: 0,
      _spawnTimer: SPAWN_FADE_TIME,
    });
  }
}

/**
 * Spawn enemies for a stage from definitions (from genStageEnemies).
 */
export function spawnEnemies(enemyDefs) {
  const a = arena();
  const p = game.player;

  const t = T();
  for (const d of enemyDefs) {
    let ex, ey, tries = 0;
    const r = d.r || 0.29 * t;
    const pad = 0.88 * t; // ~1 tile padding from walls
    do {
      ex = a.x + pad + Math.random() * (a.w - pad * 2);
      ey = a.y + pad + Math.random() * (a.h * 0.4);
      tries++;
    } while (tries < 50 && (
      dist(ex, ey, p.x, p.y) < 3.08 * t ||
      game.obstacles.some(ob => circRect(ex, ey, r + 4, ob.x, ob.y, ob.w, ob.h)) ||
      (game.waterTiles || []).some(wt => circRect(ex, ey, r + 4, wt.x, wt.y, wt.w, wt.h))
    ));

    game.enemies.push({
      x: ex, y: ey,
      hp: d.hp, maxHp: d.hp, r: d.r,
      speed: d.speed,
      typeId: d.typeId || null,
      draw: d.draw || null,
      color: d.color,
      colorAlt: d.colorAlt || null,
      shape: d.shape || d.draw || 'circle',
      ai: d.ai || null,
      aiParams: d.aiParams ? { ...d.aiParams } : {},
      attack: d.attack || 'none',
      attackParams: d.attackParams ? { ...d.attackParams } : {},
      attackPhases: d.attackPhases || null,
      shoots: d.shoots || false,
      shootInterval: d.shootInterval || 2.2,
      shootTimer: (d.shootInterval || 2.2) * (0.5 + Math.random() * 0.5),
      splitOnDeath: d.splitOnDeath || null,
      xpValue: d.xpValue,
      crystalValue: d.crystalValue,
      isBoss: d.isBoss || false,
      isChapterBoss: d.isChapterBoss || false,
      guaranteedDrop: d.guaranteedDrop || false,
      moveTimer: Math.random() * 2,
      moveAngle: Math.random() * Math.PI * 2,
      knockback: 0, kbx: 0, kby: 0,
      _spawnTimer: SPAWN_FADE_TIME,
    });
  }
}
