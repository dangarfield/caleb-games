// summons.js - Strikes (targeted AoE), Stars (homing), Meteors (big AoE)
import { game } from './state.js';
import { dist, dmgVar } from './utils.js';
import { spawnParticles } from './particles.js';
import { T } from './arena.js';

const ELEM_COLORS = {
  fire: '#ff6b2b', ice: '#74b9ff', poison: '#2ecc71', bolt: '#ffd32a'
};

// Timers for periodic summon spawns (one per element per type)
const strikeTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };
const starTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };
const meteorTimers = { fire: 0, ice: 0, poison: 0, bolt: 0 };

export function resetSummonTimers() {
  for (const k of Object.keys(strikeTimers)) {
    strikeTimers[k] = 0; starTimers[k] = 0; meteorTimers[k] = 0;
  }
}

export function updateSummons(dt) {
  const p = game.player;
  if (!p || game.enemies.length === 0) return;

  const elemDmg = p.elementDmgMult || 1;

  // Strikes: every 2.5s per stack, deal instant AoE damage at a random enemy
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.strikes[elem] || 0;
    if (stacks <= 0) continue;
    strikeTimers[elem] -= dt * stacks; // more stacks = faster
    if (strikeTimers[elem] <= 0) {
      strikeTimers[elem] = 2.5;
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        const dmg = 20 * elemDmg;
        target.hp -= dmgVar(dmg);

        // AoE splash
        for (const other of game.enemies) {
          if (other !== target && dist(target.x, target.y, other.x, other.y) < 1.1 * T()) {
            other.hp -= dmgVar(dmg * 0.4);
          }
        }

        // Visual: spawn a burst of particles at the strike point
        spawnParticles(target.x, target.y, ELEM_COLORS[elem], 8, 120);

        // Add a visual strike effect
        game.strikeEffects.push({
          x: target.x, y: target.y, life: 0.4, maxLife: 0.4,
          color: ELEM_COLORS[elem], r: 0.88 * T()
        });

        // Apply elemental status
        applyElemStatus(target, elem, elemDmg);
      }
    }
  }

  // Stars: homing projectiles, spawn every 3s per stack
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.stars[elem] || 0;
    if (stacks <= 0) continue;
    starTimers[elem] -= dt * stacks;
    if (starTimers[elem] <= 0) {
      starTimers[elem] = 3;
      // Spawn a homing star
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        game.starProjectiles.push({
          x: p.x, y: p.y,
          targetIdx: game.enemies.indexOf(target),
          speed: 4.4 * T(),
          dmg: 15 * elemDmg,
          element: elem,
          color: ELEM_COLORS[elem],
          life: 4 // max lifetime
        });
      }
    }
  }

  // Meteors: big AoE, spawn every 5s per stack
  for (const elem of ['fire', 'ice', 'poison', 'bolt']) {
    const stacks = p.meteors[elem] || 0;
    if (stacks <= 0) continue;
    meteorTimers[elem] -= dt * stacks;
    if (meteorTimers[elem] <= 0) {
      meteorTimers[elem] = 5;
      const target = game.enemies[Math.floor(Math.random() * game.enemies.length)];
      if (target) {
        // Meteor starts above and falls to target position
        game.meteorProjectiles.push({
          x: target.x + (Math.random() - 0.5) * 0.66 * T(),
          targetY: target.y,
          y: target.y - 4.4 * T(), // start above
          speed: 7.7 * T(),
          dmg: 35 * elemDmg,
          element: elem,
          color: ELEM_COLORS[elem],
          r: 0.66 * T(), // AoE radius
          life: 2
        });
      }
    }
  }

  // Update star projectiles (homing)
  for (let i = game.starProjectiles.length - 1; i >= 0; i--) {
    const s = game.starProjectiles[i];
    s.life -= dt;
    if (s.life <= 0) { game.starProjectiles.splice(i, 1); continue; }

    // Find target (may have died)
    let target = game.enemies[s.targetIdx];
    if (!target || target.hp <= 0) {
      // Retarget nearest
      let nd = Infinity;
      target = null;
      for (let j = 0; j < game.enemies.length; j++) {
        const d = dist(s.x, s.y, game.enemies[j].x, game.enemies[j].y);
        if (d < nd) { nd = d; target = game.enemies[j]; s.targetIdx = j; }
      }
    }

    if (target) {
      const ang = Math.atan2(target.y - s.y, target.x - s.x);
      s.x += Math.cos(ang) * s.speed * dt;
      s.y += Math.sin(ang) * s.speed * dt;

      // Hit check
      if (dist(s.x, s.y, target.x, target.y) < target.r + 0.176 * T()) {
        target.hp -= dmgVar(s.dmg);
        spawnParticles(s.x, s.y, s.color, 5, 80);
        applyElemStatus(target, s.element, p.elementDmgMult || 1);
        game.starProjectiles.splice(i, 1);
      }
    } else {
      // No enemies left, remove
      game.starProjectiles.splice(i, 1);
    }
  }

  // Update meteor projectiles (falling)
  for (let i = game.meteorProjectiles.length - 1; i >= 0; i--) {
    const m = game.meteorProjectiles[i];
    m.life -= dt;
    m.y += m.speed * dt;

    if (m.life <= 0) { game.meteorProjectiles.splice(i, 1); continue; }

    // Hit ground (reached target Y)
    if (m.y >= m.targetY) {
      // AoE damage
      for (const e of game.enemies) {
        if (dist(m.x, m.y, e.x, e.y) < m.r + e.r) {
          e.hp -= dmgVar(m.dmg);
          applyElemStatus(e, m.element, p.elementDmgMult || 1);
        }
      }
      spawnParticles(m.x, m.y, m.color, 12, 150);
      game.strikeEffects.push({
        x: m.x, y: m.y, life: 0.5, maxLife: 0.5,
        color: m.color, r: m.r
      });
      game.meteorProjectiles.splice(i, 1);
    }
  }

  // Update strike visual effects
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
        other.hp -= dmgVar(3 * elemDmgMult);
        break;
      }
    }
  }
}

export function drawSummons(ctx) {
  const p = game.player;
  if (!p) return;

  // Draw strike effects (expanding rings)
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

  // Draw star projectiles — glow pass then solid pass
  if (game.starProjectiles.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (const s of game.starProjectiles) {
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 0.264 * T(), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.9;
    for (const s of game.starProjectiles) {
      ctx.fillStyle = s.color;
      const sr = 0.132 * T();
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = (Math.PI / 4) * j;
        const r = j % 2 === 0 ? sr : sr * 0.4;
        if (j === 0) ctx.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
        else ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw meteor projectiles — glow pass, solid pass, trail pass
  if (game.meteorProjectiles.length > 0) {
    // Ground shadows
    for (const m of game.meteorProjectiles) {
      const shadowAlpha = 0.15 * (1 - Math.max(0, m.y - m.targetY + 50) / 200);
      if (shadowAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.ellipse(m.x, m.targetY, m.r * 0.6, m.r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Glow
    ctx.save();
    ctx.globalAlpha = 0.2;
    for (const m of game.meteorProjectiles) {
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, 0.396 * T(), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Solid + trail
    for (const m of game.meteorProjectiles) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, 0.22 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.arc(m.x, m.y - 0.176 * T(), 0.132 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(m.x, m.y - 0.308 * T(), 0.066 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
