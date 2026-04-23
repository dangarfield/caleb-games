// summons.js - Strikes (side-swords), Stars (rapid-drops), Meteors (heavy-balls)
import { game } from './state.js';
import { dist, dmgVar } from './utils.js';
import { spawnParticles } from './particles.js';
import { T, arena } from './arena.js';

const ELEM_COLORS = {
  fire: '#ff6b2b', ice: '#74b9ff', poison: '#2ecc71', bolt: '#ffd32a'
};

// Timers for periodic summon spawns (one per element per type)
const strikeTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };
const starTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };
const meteorTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };

// Alternates left/right for strike sword spawn side
let strikeSideFlip = 1;

export function resetSummonTimers() {
  for (const k of Object.keys(strikeTimers)) {
    strikeTimers[k] = 0; starTimers[k] = 0; meteorTimers[k] = 0;
  }
}

export function updateSummons(dt) {
  const p = game.player;
  if (!p) return;

  const hasEnemies = game.enemies.length > 0;
  const elemDmg = p.elementDmgMult || 1;
  const atkSpeedMult = 1 / (p.cdMult || 1); // higher = faster

  // ─── Spawn new projectiles only when enemies exist ───

  if (hasEnemies) {

  // ─── Strikes: side-swords that launch from player toward enemy ───
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.strikes[elem] || 0;
    if (stacks <= 0) continue;
    const baseInterval = 2.0 / atkSpeedMult;
    strikeTimers[elem] -= dt * stacks;
    if (strikeTimers[elem] <= 0) {
      strikeTimers[elem] = baseInterval;
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        // Spawn sword at player's side, lock angle toward target at launch
        const side = strikeSideFlip;
        strikeSideFlip *= -1;
        const offsetX = side * 0.4 * T();
        const spawnX = p.x + offsetX;
        const spawnY = p.y;
        const ang = Math.atan2(target.y - spawnY, target.x - spawnX);
        game.strikeProjectiles.push({
          x: spawnX,
          y: spawnY,
          ang: ang, // fixed direction, not homing
          speed: 3.0 * T(), // starts slower
          accel: 18.0 * T(), // accelerates fast
          maxSpeed: 14.0 * T(),
          dmg: 20 * elemDmg,
          element: elem,
          color: ELEM_COLORS[elem],
          life: 2,
          side: side,
          hoverTimer: 0.15, // brief hover before launch
        });
      }
    }
  }

  // ─── Stars: rapid-drops from above enemy ───
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.stars[elem] || 0;
    if (stacks <= 0) continue;
    starTimers[elem] -= dt * stacks;
    if (starTimers[elem] <= 0) {
      starTimers[elem] = 2.5;
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        // Star drops from directly above the enemy
        game.starProjectiles.push({
          x: target.x + (Math.random() - 0.5) * 0.3 * T(),
          y: target.y - 3.3 * T(), // start above in game coords
          targetY: target.y,
          startY: target.y - 3.3 * T(),
          speed: 11 * T(), // fast drop
          dmg: 15 * elemDmg,
          element: elem,
          color: ELEM_COLORS[elem],
          life: 2
        });
      }
    }
  }

  // ─── Meteors: heavy-balls from above the door, arc toward target ───
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.meteors[elem] || 0;
    if (stacks <= 0) continue;
    meteorTimers[elem] -= dt * stacks;
    if (meteorTimers[elem] <= 0) {
      meteorTimers[elem] = 5;
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        // Start from above the door (center X, well above arena top)
        const ar = arena();
        const arenaTopY = ar.y;
        const startX = ar.x + ar.w / 2; // center of arena (door X)
        const startY = arenaTopY - 8 * T(); // twice as high
        const ang = Math.atan2(target.y - startY, target.x - startX);
        game.meteorProjectiles.push({
          x: startX,
          y: startY,
          targetX: target.x,
          targetY: target.y,
          startX: startX,
          startY: startY,
          ang: ang,
          speed: 5.5 * T(), // faster
          dmg: 35 * elemDmg,
          element: elem,
          color: ELEM_COLORS[elem],
          r: 0.88 * T(),
          life: 4
        });
      }
    }
  }

  } // end if (hasEnemies) — spawning section

  // ─── Update existing projectiles (always, even with no enemies) ───

  // ─── Update strike projectiles (straight-line accelerating swords) ───
  for (let i = game.strikeProjectiles.length - 1; i >= 0; i--) {
    const s = game.strikeProjectiles[i];
    s.life -= dt;
    if (s.life <= 0) { game.strikeProjectiles.splice(i, 1); continue; }

    // Hover phase
    if (s.hoverTimer > 0) {
      s.hoverTimer -= dt;
      continue;
    }

    // Accelerate
    s.speed = Math.min(s.speed + s.accel * dt, s.maxSpeed);

    // Move in locked direction
    s.x += Math.cos(s.ang) * s.speed * dt;
    s.y += Math.sin(s.ang) * s.speed * dt;

    // Hit check against all enemies in path
    let hit = false;
    for (const e of game.enemies) {
      if (dist(s.x, s.y, e.x, e.y) < e.r + 0.22 * T()) {
        if (!game.debug.noDmgToEnemy) e.hp -= dmgVar(s.dmg);
        // Splash
        for (const other of game.enemies) {
          if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.1 * T()) {
            if (!game.debug.noDmgToEnemy) other.hp -= dmgVar(s.dmg * 0.3);
          }
        }
        spawnParticles(s.x, s.y, s.color, 8, 120);
        applyElemStatus(e, s.element, p.elementDmgMult || 1);
        game.strikeEffects.push({
          x: e.x, y: e.y, life: 0.5, maxLife: 0.5,
          color: s.color, r: 0.66 * T()
        });
        hit = true;
        break;
      }
    }
    if (hit) { game.strikeProjectiles.splice(i, 1); }
  }

  // ─── Update star projectiles (rapid vertical drops) ───
  for (let i = game.starProjectiles.length - 1; i >= 0; i--) {
    const s = game.starProjectiles[i];
    s.life -= dt;
    if (s.life <= 0) { game.starProjectiles.splice(i, 1); continue; }

    // Move downward (increasing y in game coords)
    s.y += s.speed * dt;

    // Hit ground (reached target Y)
    if (s.y >= s.targetY) {
      // Damage enemies near impact
      for (const e of game.enemies) {
        if (dist(s.x, s.y, e.x, e.y) < e.r + 0.33 * T()) {
          if (!game.debug.noDmgToEnemy) e.hp -= dmgVar(s.dmg);
          applyElemStatus(e, s.element, p.elementDmgMult || 1);
        }
      }
      spawnParticles(s.x, s.y, s.color, 5, 80);
      game.starProjectiles.splice(i, 1);
    }
  }

  // ─── Update meteor projectiles (arcing from door toward target) ───
  for (let i = game.meteorProjectiles.length - 1; i >= 0; i--) {
    const m = game.meteorProjectiles[i];
    m.life -= dt;
    // Move along locked angle
    m.x += Math.cos(m.ang) * m.speed * dt;
    m.y += Math.sin(m.ang) * m.speed * dt;

    if (m.life <= 0) { game.meteorProjectiles.splice(i, 1); continue; }

    // Hit check: close enough to target position
    if (dist(m.x, m.y, m.targetX, m.targetY) < 0.33 * T()) {
      for (const e of game.enemies) {
        if (dist(m.x, m.y, e.x, e.y) < m.r + e.r) {
          if (!game.debug.noDmgToEnemy) e.hp -= dmgVar(m.dmg);
          applyElemStatus(e, m.element, p.elementDmgMult || 1);
        }
      }
      spawnParticles(m.x, m.y, m.color, 16, 180);
      // Big ground explosion ring
      game.strikeEffects.push({
        x: m.x, y: m.y, life: 0.7, maxLife: 0.7,
        color: m.color, r: m.r
      });
      game.meteorProjectiles.splice(i, 1);
    }
  }

  // Update strike visual effects (impact rings)
  for (let i = game.strikeEffects.length - 1; i >= 0; i--) {
    game.strikeEffects[i].life -= dt;
    if (game.strikeEffects[i].life <= 0) game.strikeEffects.splice(i, 1);
  }
}

function applyElemStatus(e, elem, elemDmgMult) {
  if (elem === 'fire' && !e.blazeTimer) { e.blazeTimer = 2; e.blazeDmg = 3 * elemDmgMult; }
  if (elem === 'ice') { e.freezeTimer = 1; e.origSpeed = e.origSpeed || e.speed; e.speed = (e.origSpeed || e.speed) * 0.15; }
  if (elem === 'poison' && !e.poisonTimer) { e.poisonTimer = 3; e.poisonDmg = 2 * elemDmgMult; }
  if (elem === 'bolt') {
    for (const other of game.enemies) {
      if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.32 * T()) {
        if (!game.debug.noDmgToEnemy) other.hp -= dmgVar(3 * elemDmgMult);
        break;
      }
    }
  }
}

export function drawSummons(ctx) {
  const p = game.player;
  if (!p) return;

  // Draw strike effects (expanding impact rings)
  for (const fx of game.strikeEffects) {
    const alpha = fx.life / fx.maxLife;
    const expandR = fx.r * (1 - alpha * 0.5);
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 0.044 * T();
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, expandR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle = fx.color;
    ctx.fill();
    ctx.restore();
  }

  // Draw strike projectiles (glowing swords)
  for (const s of game.strikeProjectiles) {
    const ang = s.ang || Math.atan2(0, 1);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 0.066 * T();
    ctx.lineCap = 'round';
    const len = 0.33 * T();
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(ang) * len * 0.3, s.y - Math.sin(ang) * len * 0.3);
    ctx.lineTo(s.x + Math.cos(ang) * len * 0.7, s.y + Math.sin(ang) * len * 0.7);
    ctx.stroke();
    // Glow
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 0.22 * T(), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Draw star projectiles (small bright drops)
  for (const s of game.starProjectiles) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 0.22 * T(), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 0.088 * T(), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Draw meteor projectiles
  if (game.meteorProjectiles.length > 0) {
    for (const m of game.meteorProjectiles) {
      // Ground shadow at target position
      const totalDist = Math.sqrt((m.targetX - m.startX) ** 2 + (m.targetY - m.startY) ** 2) || 1;
      const traveled = Math.sqrt((m.x - m.startX) ** 2 + (m.y - m.startY) ** 2);
      const progress = Math.min(1, traveled / totalDist);
      ctx.save();
      ctx.globalAlpha = 0.15 * progress;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.ellipse(m.targetX, m.targetY, m.r * 0.6, m.r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Fireball + trail
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, 0.44 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(m.x, m.y, 0.28 * T(), 0, Math.PI * 2); ctx.fill();
      // Trail puffs
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(m.x, m.y - 0.22 * T(), 0.18 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(m.x, m.y - 0.4 * T(), 0.11 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(m.x, m.y - 0.55 * T(), 0.06 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
