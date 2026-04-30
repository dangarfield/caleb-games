import { game } from './state.js';
import { CRYSTAL_R, CRYSTAL_ATTRACT_R, CRYSTAL_MAGNET_SPEED, PLAYER_R } from './constants.js';
import { dist } from './utils.js';
import { sfxCoin } from './audio.js';
import { spawnParticles } from './particles.js';
import { T } from './arena.js';
import { isEnemyAlive } from './enemies.js';

export function spawnCrystals(x, y, count) {
  for (let c = 0; c < count; c++) {
    const ca = Math.random() * Math.PI * 2;
    const cd = (0.33 + Math.random() * 0.55) * T();
    game.crystals.push({
      x: x + Math.cos(ca) * cd,
      y: y + Math.sin(ca) * cd,
      value: 1, life: 8, bobPhase: Math.random() * Math.PI * 2
    });
  }
}

export function updateCrystals(dt) {
  const p = game.player;
  const attractR = CRYSTAL_ATTRACT_R * T() * (p.magnetMult || 1);
  // Crystals can only be collected after all enemies are dead
  const canCollect = game.enemies.every(e => !isEnemyAlive(e));

  for (let i = game.crystals.length - 1; i >= 0; i--) {
    const c = game.crystals[i];
    c.bobPhase += dt * 4;
    // Only tick lifetime when collectible (don't expire while fighting)
    if (canCollect) c.life -= dt;
    if (c.life <= 0) { game.crystals.splice(i, 1); continue; }

    if (canCollect) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < attractR) {
        const ang = Math.atan2(p.y - c.y, p.x - c.x);
        const speed = CRYSTAL_MAGNET_SPEED * T() * (1 - d / attractR);
        c.x += Math.cos(ang) * speed * dt;
        c.y += Math.sin(ang) * speed * dt;
      }
      if (d < (PLAYER_R + CRYSTAL_R) * T()) {
        game.runCoins += c.value;
        sfxCoin();
        spawnParticles(c.x, c.y, '#a29bfe', 4, 60);
        game.crystals.splice(i, 1);
      }
    }
  }
}

// Auto-collect remaining crystals during stage clear
export function magnetAllCrystals(dt) {
  const p = game.player;
  for (let i = game.crystals.length - 1; i >= 0; i--) {
    const c = game.crystals[i];
    c.bobPhase += dt * 4;
    if (c._magnetTime === undefined) c._magnetTime = 0;
    c._magnetTime += dt;
    const accel = Math.min(c._magnetTime * 3, 1); // 0→1 over ~0.33s
    const speed = (2 + accel * accel * 14) * T(); // starts slow, ramps up fast
    const d = dist(c.x, c.y, p.x, p.y);
    const ang = Math.atan2(p.y - c.y, p.x - c.x);
    c.x += Math.cos(ang) * speed * dt;
    c.y += Math.sin(ang) * speed * dt;
    if (d < (PLAYER_R + CRYSTAL_R + 0.11) * T()) {
      game.runCoins += c.value;
      sfxCoin();
      game.crystals.splice(i, 1);
    }
  }
}
