import { game } from './state.js';
import { fmt } from './utils.js';
import { T } from './arena.js';

export function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (speed || 100) * (0.5 + Math.random());
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.25 + Math.random() * 0.3,
      maxLife: 0.25 + Math.random() * 0.3,
      r: 2 + Math.random() * 3,
      color
    });
  }
}

// Floating damage numbers
const dmgNumbers = [];

export function spawnDmgNumber(x, y, amount, color) {
  dmgNumbers.push({
    x: x + (Math.random() - 0.5) * 0.22 * T(),
    y,
    text: fmt(Math.round(amount)),
    color: color || '#fff',
    life: 0.7,
    maxLife: 0.7,
    vy: -1.32 * T(),
  });
}

export function updateBoltArcs(dt) {
  let len = game.boltArcs.length;
  for (let i = len - 1; i >= 0; i--) {
    game.boltArcs[i].life -= dt;
    if (game.boltArcs[i].life <= 0) { game.boltArcs[i] = game.boltArcs[--len]; }
  }
  game.boltArcs.length = len;
}

export function drawBoltArcs(ctx) {
  if (game.boltArcs.length === 0) return;
  ctx.lineWidth = 0.044 * T();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const arc of game.boltArcs) {
    const alpha = arc.life / 0.15;
    // Core line (bright yellow)
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffd32a';
    ctx.beginPath();
    ctx.moveTo(arc.pts[0].x, arc.pts[0].y);
    for (let i = 1; i < arc.pts.length; i++) {
      ctx.lineTo(arc.pts[i].x, arc.pts[i].y);
    }
    ctx.stroke();
    // Wider glow pass (same path, thicker, transparent)
    ctx.globalAlpha = alpha * 0.3;
    ctx.lineWidth = 0.132 * T();
    ctx.stroke();
    ctx.lineWidth = 0.044 * T();
  }
  ctx.globalAlpha = 1;
}

export function updateParticles(dt) {
  let len = game.particles.length;
  for (let i = len - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) { game.particles[i] = game.particles[--len]; }
  }
  game.particles.length = len;
  // Damage numbers
  let dLen = dmgNumbers.length;
  for (let i = dLen - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.y += d.vy * dt;
    d.vy *= 0.95;
    d.life -= dt;
    if (d.life <= 0) { dmgNumbers[i] = dmgNumbers[--dLen]; }
  }
  dmgNumbers.length = dLen;
}

export function drawParticles(ctx) {
  // Batch particles — group by color to minimize state changes
  for (const p of game.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Damage numbers
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const d of dmgNumbers) {
    const alpha = d.life / d.maxLife;
    const scale = 0.8 + (1 - alpha) * 0.4;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(0.264 * T() * scale)}px "Segoe UI",system-ui,sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.055 * T();
    ctx.strokeText(d.text, d.x, d.y);
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}
