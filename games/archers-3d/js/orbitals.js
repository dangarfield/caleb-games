// orbitals.js - Orbiting circles, swords, and shield guards
import { game } from './state.js';
import { dist, dmgVar } from './utils.js';
import { spawnParticles } from './particles.js';
import { T } from './arena.js';
import { isEnemyAlive } from './enemies.js';

// Element colors
const ELEM_COLORS = {
  fire: '#ff6b2b', ice: '#74b9ff', poison: '#2ecc71', bolt: '#ffd32a', obsidian: '#636e72'
};

// Each orbital: { type: 'circle'|'sword'|'shield', element, angle, hitCooldowns: Map }
// hitCooldowns prevents hitting same enemy repeatedly (0.5s cooldown per enemy)

export function initOrbitals() {
  game.orbitals = [];
}

export function rebuildOrbitals() {
  // Called after picking a skill to rebuild orbital list from player properties
  const p = game.player;
  if (!p) return;
  game.orbitals = [];

  // Circles — 2 orbs per skill stack, placed opposite each other
  for (const [elem, count] of Object.entries(p.circles)) {
    for (let i = 0; i < count; i++) {
      game.orbitals.push({ type: 'circle', element: elem, angle: 0, hitCooldowns: new Map(), dmgTimer: 0 });
      game.orbitals.push({ type: 'circle', element: elem, angle: 0, hitCooldowns: new Map(), dmgTimer: 0 });
    }
  }

  // Swords
  for (const [elem, count] of Object.entries(p.swords)) {
    for (let i = 0; i < count; i++) {
      game.orbitals.push({ type: 'sword', element: elem, angle: 0, hitCooldowns: new Map(), dmgTimer: 0 });
    }
  }

  // Shield Guards
  for (let i = 0; i < (p.shieldGuards || 0); i++) {
    game.orbitals.push({ type: 'shield', element: 'ice', angle: 0, hitCooldowns: new Map(), dmgTimer: 0 });
  }

  // Spread angles evenly, maximally separating similar orbitals
  // Group by type, then interleave types, alternating elements within each type
  const byType = new Map(); // type → [orbitals...]
  for (const o of game.orbitals) {
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type).push(o);
  }
  // Within each type, sort so same elements aren't adjacent (round-robin by element)
  for (const [, arr] of byType) {
    const byElem = new Map();
    for (const o of arr) {
      if (!byElem.has(o.element)) byElem.set(o.element, []);
      byElem.get(o.element).push(o);
    }
    const elemArrays = [...byElem.values()];
    arr.length = 0;
    let maxE = 0;
    for (const ea of elemArrays) maxE = Math.max(maxE, ea.length);
    for (let r = 0; r < maxE; r++) {
      for (const ea of elemArrays) {
        if (r < ea.length) arr.push(ea[r]);
      }
    }
  }
  // Interleave types: round-robin across type groups
  const typeArrays = [...byType.values()];
  const sorted = [];
  let maxLen = 0;
  for (const arr of typeArrays) maxLen = Math.max(maxLen, arr.length);
  for (let round = 0; round < maxLen; round++) {
    for (const arr of typeArrays) {
      if (round < arr.length) sorted.push(arr[round]);
    }
  }
  game.orbitals = sorted;

  const n = game.orbitals.length;
  game.orbitals.forEach((o, i) => {
    o.angle = (Math.PI * 2 / n) * i;
  });
}

export function updateOrbitals(dt) {
  const p = game.player;
  if (!p || game.orbitals.length === 0) return;

  const orbitR = 0.99 * T(); // distance from player center
  const orbitSpeed = 2.5; // radians per second
  const circleHitR = 0.396 * T(); // hit radius for circles
  const swordHitR = 0.484 * T(); // swords have bigger hit area
  const shieldHitR = 0.352 * T();

  const elemDmgMult = p.elementDmgMult || 1;

  for (const o of game.orbitals) {
    o.angle += orbitSpeed * dt;
    if (o.angle > Math.PI * 2) o.angle -= Math.PI * 2;

    const ox = p.x + Math.cos(o.angle) * orbitR;
    const oy = p.y + Math.sin(o.angle) * orbitR;

    // Decrease cooldowns
    for (const [key, val] of o.hitCooldowns) {
      o.hitCooldowns.set(key, val - dt);
      if (val - dt <= 0) o.hitCooldowns.delete(key);
    }

    const hitR = o.type === 'sword' ? swordHitR : o.type === 'shield' ? shieldHitR : circleHitR;

    // Shield guard: block enemy bullets
    if (o.type === 'shield') {
      for (let i = game.enemyBullets.length - 1; i >= 0; i--) {
        const b = game.enemyBullets[i];
        if (dist(ox, oy, b.x, b.y) < shieldHitR + 0.132 * T()) {
          game.enemyBullets.splice(i, 1);
          spawnParticles(ox, oy, '#74b9ff', 3, 60);
        }
      }
    }

    // Damage enemies on contact
    o.dmgTimer -= dt;
    if (o.dmgTimer <= 0) {
      o.dmgTimer = 0.3; // tick every 0.3s

      for (const e of game.enemies) {
        if (!isEnemyAlive(e)) continue;
        if (dist(ox, oy, e.x, e.y) < hitR + e.r) {
          const eKey = game.enemies.indexOf(e);
          if (o.hitCooldowns.has(eKey)) continue;
          o.hitCooldowns.set(eKey, 0.5);

          let dmg = 0;
          const color = ELEM_COLORS[o.element] || '#fff';

          if (o.type === 'circle') {
            dmg = 8 * elemDmgMult;
            // Apply elemental status
            if (o.element === 'fire' && !e.blazeTimer) { e.blazeTimer = 2; e.blazeDmg = 3 * elemDmgMult; }
            if (o.element === 'ice') { e.freezeTimer = 0.8; e.origSpeed = e.origSpeed || e.speed; e.speed = (e.origSpeed || e.speed) * 0.15; }
            if (o.element === 'poison' && !e.poisonTimer) { e.poisonTimer = 3; e.poisonDmg = 2 * elemDmgMult; }
            if (o.element === 'bolt') {
              // small chain
              for (const other of game.enemies) {
                if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.32 * T()) {
                  if (!game.debug.noDmgToEnemy) other.hp -= dmgVar(4 * elemDmgMult);
                  spawnParticles(other.x, other.y, '#ffd32a', 1, 40);
                  break;
                }
              }
            }
            if (o.element === 'obsidian') { dmg = 12 * elemDmgMult; }
          } else if (o.type === 'sword') {
            dmg = 15 * elemDmgMult;
            // Swords also apply their element
            if (o.element === 'fire' && !e.blazeTimer) { e.blazeTimer = 2; e.blazeDmg = 4 * elemDmgMult; }
            if (o.element === 'ice') { e.freezeTimer = 1; e.origSpeed = e.origSpeed || e.speed; e.speed = (e.origSpeed || e.speed) * 0.15; }
            if (o.element === 'poison' && !e.poisonTimer) { e.poisonTimer = 3; e.poisonDmg = 3 * elemDmgMult; }
            if (o.element === 'bolt') {
              for (const other of game.enemies) {
                if (other !== e && dist(e.x, e.y, other.x, other.y) < 1.54 * T()) {
                  if (!game.debug.noDmgToEnemy) other.hp -= dmgVar(6 * elemDmgMult);
                  spawnParticles(other.x, other.y, '#ffd32a', 2, 50);
                  break;
                }
              }
            }
          }

          if (dmg > 0) {
            if (!game.debug.noDmgToEnemy) e.hp -= dmgVar(dmg);
            spawnParticles(ox, oy, color, 2, 50);
          }
        }
      }
    }
  }
}

export function drawOrbitals(ctx) {
  const p = game.player;
  if (!p || game.orbitals.length === 0) return;

  const orbitR = 0.99 * T();

  // Orbitals
  for (const o of game.orbitals) {
    const ox = p.x + Math.cos(o.angle) * orbitR;
    const oy = p.y + Math.sin(o.angle) * orbitR;
    const color = ELEM_COLORS[o.element] || '#fff';

    if (o.type === 'circle') {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(ox, oy, 0.154 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ox, oy, 0.066 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (o.type === 'sword') {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.066 * T();
      ctx.lineCap = 'round';
      const outAng = o.angle;
      const len = 0.264 * T();
      ctx.beginPath();
      ctx.moveTo(ox - Math.cos(outAng) * len * 0.4, oy - Math.sin(outAng) * len * 0.4);
      ctx.lineTo(ox + Math.cos(outAng) * len * 0.6, oy + Math.sin(outAng) * len * 0.6);
      ctx.stroke();
      const perpAng = outAng + Math.PI / 2;
      const cg = 0.088 * T();
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(perpAng) * cg, oy + Math.sin(perpAng) * cg);
      ctx.lineTo(ox - Math.cos(perpAng) * cg, oy - Math.sin(perpAng) * cg);
      ctx.stroke();
      ctx.restore();
    } else if (o.type === 'shield') {
      ctx.save();
      ctx.shadowColor = '#74b9ff'; ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#74b9ff';
      ctx.beginPath(); ctx.arc(ox, oy, 0.176 * T(), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.033 * T();
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.restore();
    }
  }
}
