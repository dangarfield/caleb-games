import { game } from './state.js';
import { PLAYER_R } from './constants.js';
import { dist } from './utils.js';
import { sfxHeal } from './audio.js';
import { spawnParticles } from './particles.js';
import { T } from './arena.js';

const HEART_R = 0.22; // tiles
const HEART_ATTRACT_R = 1.32; // tiles
const HEART_HEAL_PCT = 0.02; // 2% of max HP per heart
const HEART_MAGNET_SPEED = 4.4; // tiles/s

export function spawnHeart(x, y) {
  const ca = Math.random() * Math.PI * 2;
  const cd = (0.22 + Math.random() * 0.44) * T();
  game.hearts.push({
    x: x + Math.cos(ca) * cd,
    y: y + Math.sin(ca) * cd,
    bobPhase: Math.random() * Math.PI * 2
  });
}

export function updateHearts(dt) {
  const p = game.player;
  const attractR = HEART_ATTRACT_R * T() * (p.magnetMult || 1);

  for (let i = game.hearts.length - 1; i >= 0; i--) {
    const h = game.hearts[i];
    h.bobPhase += dt * 4;

    const d = dist(h.x, h.y, p.x, p.y);
    if (d < attractR) {
      const ang = Math.atan2(p.y - h.y, p.x - h.x);
      const speed = HEART_MAGNET_SPEED * T() * (1 - d / attractR);
      h.x += Math.cos(ang) * speed * dt;
      h.y += Math.sin(ang) * speed * dt;
    }
    if (d < (PLAYER_R + HEART_R) * T()) {
      let healAmt = p.maxHp * HEART_HEAL_PCT * (p.heartHealMult || 1);
      // Grace: +0.6% more heal per 1% HP missing
      if (p.grace) {
        const missingPct = 1 - p.hp / p.maxHp;
        healAmt *= (1 + missingPct * 0.6);
      }
      p.hp = Math.min(p.hp + Math.floor(healAmt), p.maxHp);
      sfxHeal();
      spawnParticles(h.x, h.y, '#ff6b81', 4, 60);
      game.hearts.splice(i, 1);
    }
  }
}

// Auto-collect remaining hearts during stage clear
export function magnetAllHearts(dt) {
  const p = game.player;
  for (let i = game.hearts.length - 1; i >= 0; i--) {
    const h = game.hearts[i];
    h.bobPhase += dt * 4;
    if (h._magnetTime === undefined) h._magnetTime = 0;
    h._magnetTime += dt;
    const accel = Math.min(h._magnetTime * 3, 1); // 0→1 over ~0.33s
    const speed = (2 + accel * accel * 14) * T(); // starts slow, ramps up fast
    const d = dist(h.x, h.y, p.x, p.y);
    const ang = Math.atan2(p.y - h.y, p.x - h.x);
    h.x += Math.cos(ang) * speed * dt;
    h.y += Math.sin(ang) * speed * dt;
    if (d < (PLAYER_R + HEART_R + 0.11) * T()) {
      let healAmt = p.maxHp * HEART_HEAL_PCT * (p.heartHealMult || 1);
      // Grace: +0.6% more heal per 1% HP missing
      if (p.grace) {
        const missingPct = 1 - p.hp / p.maxHp;
        healAmt *= (1 + missingPct * 0.6);
      }
      p.hp = Math.min(p.hp + Math.floor(healAmt), p.maxHp);
      sfxHeal();
      game.hearts.splice(i, 1);
    }
  }
}
