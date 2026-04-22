// enemyDraw.js - Canvas drawing functions for each enemy visual type
// Each draw function: (ctx, e, time) → renders the enemy at e.x, e.y

import { drawShape } from './draw.js';

/**
 * Draw an enemy. Dispatches to a type-specific draw function if available,
 * otherwise falls back to the legacy shape-based drawShape.
 */
export function drawEnemy(ctx, e, time) {
  const fn = DRAW_FUNCTIONS[e.draw];
  if (fn) {
    ctx.save();
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;
    fn(ctx, e, time || 0);
    ctx.restore();
  } else {
    // Legacy fallback: colored geometric shape
    ctx.save();
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;
    drawShape(ctx, e.x, e.y, e.r, e.shape || 'circle', e.color);
    ctx.restore();
  }
}

// ─── Drawing functions ───

function drawBat(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const wingFlap = Math.sin(t * 10) * 0.3; // wing animation

  // Body (oval)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.6, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings
  const wingSpread = r * 1.4;
  const wingY = y - r * 0.1;

  ctx.fillStyle = e.colorAlt || e.color;
  // Left wing
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, wingY);
  ctx.quadraticCurveTo(x - wingSpread, wingY - r * (0.8 + wingFlap), x - wingSpread * 0.7, wingY + r * 0.3);
  ctx.lineTo(x - r * 0.3, wingY + r * 0.2);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, wingY);
  ctx.quadraticCurveTo(x + wingSpread, wingY - r * (0.8 + wingFlap), x + wingSpread * 0.7, wingY + r * 0.3);
  ctx.lineTo(x + r * 0.3, wingY + r * 0.2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.15, r * 0.12, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.15, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.15, r * 0.06, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, y - r * 0.15, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawWolf(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const bob = Math.sin(t * 6) * r * 0.05;

  // Body (elongated horizontal oval)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y + bob, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (circle slightly forward)
  ctx.beginPath();
  ctx.arc(x + r * 0.6, y - r * 0.15 + bob, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, y - r * 0.55 + bob);
  ctx.lineTo(x + r * 0.55, y - r * 1.0 + bob);
  ctx.lineTo(x + r * 0.7, y - r * 0.55 + bob);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.65, y - r * 0.55 + bob);
  ctx.lineTo(x + r * 0.85, y - r * 0.95 + bob);
  ctx.lineTo(x + r * 1.0, y - r * 0.5 + bob);
  ctx.fill();

  // Snout
  ctx.fillStyle = e.colorAlt || '#654321';
  ctx.beginPath();
  ctx.ellipse(x + r * 1.0, y - r * 0.1 + bob, r * 0.25, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(x + r * 0.7, y - r * 0.3 + bob, r * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Legs (simple lines)
  ctx.strokeStyle = e.color;
  ctx.lineWidth = r * 0.15;
  ctx.lineCap = 'round';
  const legPhase = Math.sin(t * 8) * r * 0.15;
  // Front
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4, y + r * 0.5 + bob);
  ctx.lineTo(x + r * 0.4 + legPhase, y + r * 1.0 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.1, y + r * 0.5 + bob);
  ctx.lineTo(x + r * 0.1 - legPhase, y + r * 1.0 + bob);
  ctx.stroke();
  // Back
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.4 + bob);
  ctx.lineTo(x - r * 0.5 - legPhase, y + r * 0.95 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y + r * 0.35 + bob);
  ctx.lineTo(x - r * 0.8 + legPhase, y + r * 0.9 + bob);
  ctx.stroke();
}

function drawBomb(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;

  // Body (round)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Dark band
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Fuse
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.4, y - r * 1.4, x + r * 0.3, y - r * 1.6);
  ctx.stroke();

  // Fuse spark
  const sparkAlpha = 0.5 + Math.sin(t * 15) * 0.5;
  ctx.fillStyle = `rgba(255,200,50,${sparkAlpha})`;
  ctx.beginPath();
  ctx.arc(x + r * 0.3, y - r * 1.6, 3, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.arc(x + r * 0.25, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  // Mouth
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.15, r * 0.25, 0, Math.PI);
  ctx.stroke();
}

function drawPlant(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const sway = Math.sin(t * 3) * r * 0.05;

  // Vines/roots at base
  ctx.strokeStyle = e.colorAlt || '#27ae60';
  ctx.lineWidth = r * 0.15;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.4, y + r * 0.6);
    ctx.quadraticCurveTo(
      x + i * r * 0.7 + sway, y + r * 1.2,
      x + i * r * 0.5 + sway * 2, y + r * 1.5
    );
    ctx.stroke();
  }

  // Stem
  ctx.strokeStyle = e.colorAlt || '#27ae60';
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(x + sway, y + r * 0.5);
  ctx.lineTo(x + sway * 0.5, y - r * 0.2);
  ctx.stroke();

  // Flower/bulb
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x + sway * 0.5, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Petals
  const petalCount = 5;
  ctx.fillStyle = e.colorAlt || '#5b7fc7';
  for (let i = 0; i < petalCount; i++) {
    const ang = (Math.PI * 2 / petalCount) * i + t * 0.5;
    const px = x + sway * 0.5 + Math.cos(ang) * r * 0.65;
    const py = y - r * 0.3 + Math.sin(ang) * r * 0.65;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(x + sway * 0.5, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawStump(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;

  // Tree rings (top)
  ctx.fillStyle = e.colorAlt || '#6d4c2a';
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.2, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bark body
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.9, y - r * 0.2);
  ctx.lineTo(x - r * 0.8, y + r * 0.7);
  ctx.lineTo(x + r * 0.8, y + r * 0.7);
  ctx.lineTo(x + r * 0.9, y - r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Tree ring lines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.9 * (i / 4), r * 0.5 * (i / 4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Eyes (angry)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y, r * 0.15, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.color === '#2980b9' ? '#1a5276' : '#145a32';
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y + r * 0.02, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.28, y + r * 0.02, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Angry brow lines
  ctx.strokeStyle = e.colorAlt || '#6d4c2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y - r * 0.15);
  ctx.lineTo(x - r * 0.15, y - r * 0.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.45, y - r * 0.15);
  ctx.lineTo(x + r * 0.15, y - r * 0.08);
  ctx.stroke();
}

function drawGolem(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const spin = e._spinAngle || 0;

  ctx.save();
  if (spin > 0) {
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.translate(-x, -y);
  }

  // Body (blocky)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7, y - r * 0.8);
  ctx.lineTo(x + r * 0.7, y - r * 0.8);
  ctx.lineTo(x + r * 0.9, y + r * 0.3);
  ctx.lineTo(x + r * 0.6, y + r * 0.8);
  ctx.lineTo(x - r * 0.6, y + r * 0.8);
  ctx.lineTo(x - r * 0.9, y + r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Rock texture
  ctx.fillStyle = e.colorAlt || '#95a5a6';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y + r * 0.15, r * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Arms (rock fists)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x - r * 1.1, y, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 1.1, y, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (glowing)
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.35, r * 0.12, 0, Math.PI * 2);
  ctx.arc(x + r * 0.25, y - r * 0.35, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSlime(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const squish = 1 + Math.sin(t * 5) * 0.1;
  const squishY = 1 / squish;

  // Body (blobby)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.1, r * squish, r * 0.8 * squishY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shiny highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.2, r * 0.3 * squish, r * 0.2 * squishY, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.1, r * 0.16, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.22, y - r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.22, y - r * 0.08, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkeleton(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const bob = Math.sin(t * 4) * r * 0.05;

  // Skull
  ctx.fillStyle = e.colorAlt || '#f1e7c9';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4 + bob, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Eye sockets
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.45 + bob, r * 0.1, 0, Math.PI * 2);
  ctx.arc(x + r * 0.15, y - r * 0.45 + bob, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Ribcage body
  ctx.strokeStyle = e.colorAlt || '#f1e7c9';
  ctx.lineWidth = r * 0.08;
  // Spine
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.05 + bob);
  ctx.lineTo(x, y + r * 0.5 + bob);
  ctx.stroke();
  // Ribs
  for (let i = 0; i < 3; i++) {
    const ry = y + r * (-0.05 + i * 0.15) + bob;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, ry);
    ctx.quadraticCurveTo(x, ry + r * 0.05, x + r * 0.3, ry);
    ctx.stroke();
  }

  // Bow (on the right side)
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + r * 0.6, y - r * 0.1 + bob, r * 0.5, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();
  // Bowstring
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(
    x + r * 0.6 + Math.cos(-Math.PI * 0.4) * r * 0.5,
    y - r * 0.1 + bob + Math.sin(-Math.PI * 0.4) * r * 0.5
  );
  ctx.lineTo(
    x + r * 0.6 + Math.cos(Math.PI * 0.4) * r * 0.5,
    y - r * 0.1 + bob + Math.sin(Math.PI * 0.4) * r * 0.5
  );
  ctx.stroke();
}

function drawSkull(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const float = Math.sin(t * 3) * r * 0.1;

  // Skull
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1 + float, r * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Jaw (slightly separate)
  ctx.beginPath();
  ctx.arc(x, y + r * 0.35 + float, r * 0.5, 0, Math.PI);
  ctx.fill();

  // Eye sockets (dark)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - r * 0.15 + float, r * 0.18, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.25, y - r * 0.15 + float, r * 0.18, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye glow
  const glowColor = e.colorAlt || e.color;
  ctx.fillStyle = glowColor;
  ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3;
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.15 + float, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.25, y - r * 0.15 + float, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Nose hole
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.05 + float);
  ctx.lineTo(x - r * 0.08, y + r * 0.15 + float);
  ctx.lineTo(x + r * 0.08, y + r * 0.15 + float);
  ctx.closePath();
  ctx.fill();

  // Teeth
  ctx.fillStyle = e.color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.5;
  const teethY = y + r * 0.28 + float;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.rect(x + i * r * 0.12 - r * 0.05, teethY, r * 0.1, r * 0.12);
    ctx.fill();
    ctx.stroke();
  }
}

function drawDragon(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const breathe = Math.sin(t * 2) * r * 0.04;

  // Body (round)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85 + breathe, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = e.colorAlt || '#d35400';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.15, r * 0.5, r * 0.45 + breathe, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly scales
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(x, y + r * 0.15 + i * r * 0.12, r * 0.35, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }

  // Wings (small, stubby)
  ctx.fillStyle = e.color;
  const wingFlap = Math.sin(t * 4) * 0.15;
  // Left
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y - r * 0.3);
  ctx.quadraticCurveTo(x - r * 1.3, y - r * (0.8 + wingFlap), x - r * 1.1, y + r * 0.1);
  ctx.lineTo(x - r * 0.6, y);
  ctx.fill();
  // Right
  ctx.beginPath();
  ctx.moveTo(x + r * 0.6, y - r * 0.3);
  ctx.quadraticCurveTo(x + r * 1.3, y - r * (0.8 + wingFlap), x + r * 1.1, y + r * 0.1);
  ctx.lineTo(x + r * 0.6, y);
  ctx.fill();

  // Head
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.65, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Horns
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y - r * 0.9);
  ctx.lineTo(x - r * 0.35, y - r * 1.25);
  ctx.lineTo(x - r * 0.05, y - r * 0.85);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.2, y - r * 0.9);
  ctx.lineTo(x + r * 0.35, y - r * 1.25);
  ctx.lineTo(x + r * 0.05, y - r * 0.85);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.7, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.15, y - r * 0.7, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.7, r * 0.03, r * 0.06, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.15, y - r * 0.7, r * 0.03, r * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nostrils (fire glow)
  const fireAlpha = 0.4 + Math.sin(t * 8) * 0.3;
  ctx.fillStyle = `rgba(255,100,0,${fireAlpha})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.08, y - r * 0.5, r * 0.05, 0, Math.PI * 2);
  ctx.arc(x + r * 0.08, y - r * 0.5, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrocodile(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const bob = Math.sin(t * 3) * r * 0.03;

  // Body (elongated)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y + bob, r * 1.3, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // Snout (long)
  ctx.beginPath();
  ctx.ellipse(x + r * 1.0, y - r * 0.05 + bob, r * 0.7, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Jaw (lower)
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.9, y + r * 0.15 + bob, r * 0.55, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Teeth
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    const tx = x + r * 0.6 + i * r * 0.2;
    ctx.beginPath();
    ctx.moveTo(tx, y + r * 0.02 + bob);
    ctx.lineTo(tx - r * 0.04, y + r * 0.12 + bob);
    ctx.lineTo(tx + r * 0.04, y + r * 0.12 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // Scales (back bumps)
  ctx.fillStyle = e.colorAlt || e.color;
  for (let i = -2; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * r * 0.35, y - r * 0.5 + bob, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.arc(x + r * 0.7, y - r * 0.2 + bob, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.7, y - r * 0.2 + bob, r * 0.04, r * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (stubby)
  ctx.fillStyle = e.color;
  const legPhase = Math.sin(t * 5) * r * 0.08;
  ctx.beginPath(); ctx.arc(x - r * 0.5 + legPhase, y + r * 0.65 + bob, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.3 - legPhase, y + r * 0.65 + bob, r * 0.12, 0, Math.PI * 2); ctx.fill();

  // Tail
  ctx.strokeStyle = e.color;
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = 'round';
  const tailWag = Math.sin(t * 4) * r * 0.15;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.1, y + bob);
  ctx.quadraticCurveTo(x - r * 1.6, y + tailWag + bob, x - r * 1.8, y - r * 0.2 + tailWag + bob);
  ctx.stroke();
}

function drawSnake(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const slither = Math.sin(t * 6);

  // Body segments (sinusoidal)
  ctx.strokeStyle = e.color;
  ctx.lineWidth = r * 0.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.8, y);
  for (let i = 0; i < 6; i++) {
    const sx = x + r * 0.8 - i * r * 0.45;
    const sy = y + Math.sin(t * 6 + i * 0.8) * r * 0.3;
    ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Belly pattern
  ctx.strokeStyle = e.colorAlt || e.color;
  ctx.lineWidth = r * 0.35;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.6, y);
  for (let i = 0; i < 5; i++) {
    const sx = x + r * 0.6 - i * r * 0.45;
    const sy = y + Math.sin(t * 6 + i * 0.8) * r * 0.3;
    ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Head
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x + r * 0.8, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  ctx.arc(x + r * 0.9, y - r * 0.18, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.9, y + r * 0.18, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x + r * 0.92, y - r * 0.18, r * 0.04, 0, Math.PI * 2);
  ctx.arc(x + r * 0.92, y + r * 0.18, r * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // Tongue
  const tongueFlick = Math.sin(t * 10) > 0.3 ? 1 : 0;
  if (tongueFlick) {
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + r * 1.2, y);
    ctx.lineTo(x + r * 1.5, y - r * 0.1);
    ctx.moveTo(x + r * 1.2, y);
    ctx.lineTo(x + r * 1.5, y + r * 0.1);
    ctx.stroke();
  }

  // Tail tip
  const tailX = x + r * 0.8 - 5 * r * 0.45;
  const tailY = y + Math.sin(t * 6 + 4 * 0.8) * r * 0.3;
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tailX - r * 0.4, tailY - r * 0.1);
  ctx.lineTo(tailX - r * 0.4, tailY + r * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawSpider(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;

  // Legs (8 legs, 4 per side)
  ctx.strokeStyle = e.colorAlt || e.color;
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const legAng = (i - 1.5) * 0.35 + side * 0.15;
      const legPhase = Math.sin(t * 8 + i * 1.2 + side) * r * 0.12;
      const kneeX = x + side * r * 0.6 + Math.cos(legAng) * r * 0.3;
      const kneeY = y - r * 0.2 + i * r * 0.25 + legPhase;
      const footX = x + side * r * 1.2 + Math.cos(legAng) * r * 0.2;
      const footY = kneeY + r * 0.4;
      ctx.beginPath();
      ctx.moveTo(x + side * r * 0.3, y - r * 0.1 + i * r * 0.2);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }
  }

  // Abdomen (back, larger)
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y + r * 0.1, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cephalothorax (front, smaller)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y - r * 0.05, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (multiple small eyes)
  ctx.fillStyle = '#e74c3c';
  const eyeR = r * 0.06;
  ctx.beginPath();
  ctx.arc(x + r * 0.35, y - r * 0.2, eyeR * 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.45, y - r * 0.15, eyeR * 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.3, y - r * 0.1, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.5, y - r * 0.08, eyeR, 0, Math.PI * 2); ctx.fill();

  // Abdomen pattern
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y + r * 0.05, r * 0.2, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fangs
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y + r * 0.05);
  ctx.lineTo(x + r * 0.6, y + r * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.15);
  ctx.lineTo(x + r * 0.6, y - r * 0.3);
  ctx.stroke();
}

function drawWorm(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const burrowScale = e._burrowScale !== undefined ? e._burrowScale : 1;

  if (burrowScale <= 0) return; // fully underground

  ctx.save();
  ctx.globalAlpha *= burrowScale;
  ctx.translate(x, y);
  ctx.scale(burrowScale, burrowScale);

  // Ground hole effect when burrowing
  if (burrowScale < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body segments
  const segments = 4;
  for (let i = segments - 1; i >= 0; i--) {
    const segY = i * r * 0.4;
    const segR = r * (0.9 - i * 0.12);
    const wobble = Math.sin(t * 3 + i * 0.5) * r * 0.05;
    ctx.fillStyle = i % 2 === 0 ? e.color : e.colorAlt || e.color;
    ctx.beginPath();
    ctx.ellipse(wobble, segY - r * 0.3, segR, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, -r * 0.5, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.6, r * 0.12, 0, Math.PI * 2);
  ctx.arc(r * 0.2, -r * 0.6, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.58, r * 0.06, 0, Math.PI * 2);
  ctx.arc(r * 0.18, -r * 0.58, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -r * 0.35, r * 0.2, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawTurret(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const pulse = Math.sin(t * 4) * 0.15;

  // Base (circular platform)
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (cylindrical)
  ctx.fillStyle = '#777';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.3);
  ctx.lineTo(x - r * 0.45, y - r * 0.4);
  ctx.lineTo(x + r * 0.45, y - r * 0.4);
  ctx.lineTo(x + r * 0.5, y + r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Top dome
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Lightning orb
  ctx.fillStyle = `rgba(241,196,15,${0.6 + pulse})`;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Electric arcs
  ctx.strokeStyle = `rgba(241,196,15,${0.4 + pulse})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const arcAng = t * 3 + i * Math.PI * 2 / 3;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.4);
    const mx = x + Math.cos(arcAng) * r * 0.3;
    const my = y - r * 0.4 + Math.sin(arcAng) * r * 0.3;
    ctx.lineTo(mx + (Math.random() - 0.5) * r * 0.1, my + (Math.random() - 0.5) * r * 0.1);
    ctx.lineTo(x + Math.cos(arcAng) * r * 0.5, y - r * 0.4 + Math.sin(arcAng) * r * 0.5);
    ctx.stroke();
  }

  // Rivets
  ctx.fillStyle = '#999';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y, r * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y, r * 0.05, 0, Math.PI * 2); ctx.fill();
}

function drawCactus(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const sway = Math.sin(t * 2) * r * 0.02;

  // Main body (tall oval)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x + sway, y, r * 0.5, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left arm
  ctx.beginPath();
  ctx.moveTo(x - r * 0.4 + sway, y - r * 0.1);
  ctx.quadraticCurveTo(x - r * 0.9 + sway, y - r * 0.1, x - r * 0.9 + sway, y - r * 0.5);
  ctx.lineTo(x - r * 0.7 + sway, y - r * 0.5);
  ctx.quadraticCurveTo(x - r * 0.7 + sway, y - r * 0.0, x - r * 0.4 + sway, y + r * 0.05);
  ctx.closePath();
  ctx.fill();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4 + sway, y + r * 0.1);
  ctx.quadraticCurveTo(x + r * 0.85 + sway, y + r * 0.1, x + r * 0.85 + sway, y - r * 0.3);
  ctx.lineTo(x + r * 0.65 + sway, y - r * 0.3);
  ctx.quadraticCurveTo(x + r * 0.65 + sway, y + r * 0.0, x + r * 0.4 + sway, y + r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Darker stripes
  ctx.strokeStyle = e.colorAlt || e.color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.12 + sway, y - r * 0.8);
    ctx.lineTo(x + i * r * 0.12 + sway, y + r * 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Spines
  ctx.strokeStyle = '#f1e7c9';
  ctx.lineWidth = 1;
  const spinePositions = [
    [-0.3, -0.5], [0.35, -0.3], [-0.25, 0.1], [0.3, 0.3],
    [-0.35, -0.2], [0.25, -0.6], [0.0, -0.7], [0.0, 0.5],
  ];
  for (const [sx, sy] of spinePositions) {
    const spX = x + sx * r + sway;
    const spY = y + sy * r;
    const spAng = Math.atan2(sy, sx);
    ctx.beginPath();
    ctx.moveTo(spX, spY);
    ctx.lineTo(spX + Math.cos(spAng) * r * 0.2, spY + Math.sin(spAng) * r * 0.2);
    ctx.stroke();
  }

  // Eyes (angry)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.12 + sway, y - r * 0.25, r * 0.07, 0, Math.PI * 2);
  ctx.arc(x + r * 0.12 + sway, y - r * 0.25, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Angry brows
  ctx.strokeStyle = e.colorAlt || e.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.22 + sway, y - r * 0.38);
  ctx.lineTo(x - r * 0.05 + sway, y - r * 0.32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.22 + sway, y - r * 0.38);
  ctx.lineTo(x + r * 0.05 + sway, y - r * 0.32);
  ctx.stroke();

  // Mouth
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + sway, y - r * 0.08, r * 0.12, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawMage(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const float = Math.sin(t * 2.5) * r * 0.08;

  // Robe body
  ctx.fillStyle = e.colorAlt || '#5d6d7e';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + r * 0.8 + float);
  ctx.lineTo(x - r * 0.4, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.4, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.6, y + r * 0.8 + float);
  ctx.closePath();
  ctx.fill();

  // Robe trim
  ctx.strokeStyle = '#9b59b6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + r * 0.8 + float);
  ctx.lineTo(x + r * 0.6, y + r * 0.8 + float);
  ctx.stroke();

  // Head (hooded)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.35 + float, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Hood peak
  ctx.fillStyle = e.colorAlt || '#5d6d7e';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y - r * 0.15 + float);
  ctx.quadraticCurveTo(x, y - r * 1.1 + float, x + r * 0.45, y - r * 0.15 + float);
  ctx.fill();

  // Eyes (glowing)
  const glowAlpha = 0.6 + Math.sin(t * 4) * 0.3;
  ctx.fillStyle = `rgba(155,89,182,${glowAlpha})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.12, y - r * 0.4 + float, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.12, y - r * 0.4 + float, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Staff
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.6 + float);
  ctx.lineTo(x + r * 0.35, y + r * 0.8 + float);
  ctx.stroke();

  // Staff orb
  ctx.fillStyle = `rgba(155,89,182,${0.5 + Math.sin(t * 5) * 0.3})`;
  ctx.beginPath();
  ctx.arc(x + r * 0.5, y - r * 0.7 + float, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Tornado swirl around staff (when applicable)
  ctx.strokeStyle = `rgba(155,89,182,${0.3 + Math.sin(t * 3) * 0.2})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const swirlAng = t * 4 + i * Math.PI;
    ctx.beginPath();
    ctx.arc(x + r * 0.5 + Math.cos(swirlAng) * r * 0.2, y - r * 0.7 + Math.sin(swirlAng) * r * 0.2 + float, r * 0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSpirit(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const float = Math.sin(t * 2.5) * r * 0.12;
  const pulse = 0.8 + Math.sin(t * 4) * 0.2;

  // Core orb
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y + float, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright core
  ctx.fillStyle = e.colorAlt || '#fff';
  ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.2;
  ctx.beginPath();
  ctx.arc(x, y + float, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Flame wisps
  for (let i = 0; i < 3; i++) {
    const wa = t * 3 + i * Math.PI * 2 / 3;
    const wx = x + Math.cos(wa) * r * 0.4;
    const wy = y + float - r * 0.3 + Math.sin(wa * 1.5) * r * 0.25;
    ctx.fillStyle = e.color;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(wx, wy, r * 0.15, r * 0.25, wa * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.1 + float, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, y - r * 0.1 + float, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawMummy(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const bob = Math.sin(t * 5) * r * 0.08;

  // Body
  ctx.fillStyle = '#d4c5a0';
  ctx.beginPath();
  ctx.ellipse(x, y + bob, r * 0.55, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5 + bob, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Bandage wraps
  ctx.strokeStyle = e.color;
  ctx.lineWidth = r * 0.12;
  for (let i = 0; i < 5; i++) {
    const wy = y - r * 0.6 + i * r * 0.35 + bob;
    const wobble = Math.sin(t * 2 + i) * r * 0.05;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5 + wobble, wy);
    ctx.lineTo(x + r * 0.5 - wobble, wy);
    ctx.stroke();
  }

  // Eyes (glowing through bandages)
  ctx.fillStyle = e.colorAlt || '#e74c3c';
  const glow = 0.5 + Math.sin(t * 4) * 0.3;
  ctx.globalAlpha = glow;
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.55 + bob, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.15, y - r * 0.55 + bob, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Trailing bandage
  ctx.strokeStyle = '#d4c5a0';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  const trail = Math.sin(t * 3) * r * 0.2;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4, y - r * 0.3 + bob);
  ctx.quadraticCurveTo(x + r * 0.8, y - r * 0.1 + trail + bob, x + r * 0.6, y + r * 0.2 + trail + bob);
  ctx.stroke();
}

function drawScarecrow(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const sway = Math.sin(t * 2) * r * 0.04;

  // Stick body (vertical)
  ctx.strokeStyle = '#6d4c2a';
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + sway, y - r * 0.3);
  ctx.lineTo(x + sway * 0.5, y + r * 0.8);
  ctx.stroke();

  // Arms (horizontal stick)
  ctx.beginPath();
  ctx.moveTo(x - r * 0.7 + sway, y + r * 0.0);
  ctx.lineTo(x + r * 0.7 + sway, y + r * 0.0);
  ctx.stroke();

  // Hat
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45 + sway, y - r * 0.45);
  ctx.lineTo(x + r * 0.45 + sway, y - r * 0.45);
  ctx.lineTo(x + r * 0.25 + sway, y - r * 1.0);
  ctx.lineTo(x - r * 0.25 + sway, y - r * 1.0);
  ctx.closePath();
  ctx.fill();
  // Hat brim
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x + sway, y - r * 0.45, r * 0.55, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (burlap sack)
  ctx.fillStyle = '#c4a35a';
  ctx.beginPath();
  ctx.arc(x + sway, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Face (stitched)
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  // X eyes
  const ex = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(x - ex - r * 0.05 + sway, y - r * 0.38);
  ctx.lineTo(x - ex + r * 0.05 + sway, y - r * 0.28);
  ctx.moveTo(x - ex + r * 0.05 + sway, y - r * 0.38);
  ctx.lineTo(x - ex - r * 0.05 + sway, y - r * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + ex - r * 0.05 + sway, y - r * 0.38);
  ctx.lineTo(x + ex + r * 0.05 + sway, y - r * 0.28);
  ctx.moveTo(x + ex + r * 0.05 + sway, y - r * 0.38);
  ctx.lineTo(x + ex - r * 0.05 + sway, y - r * 0.28);
  ctx.stroke();
  // Stitched mouth
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12 + sway, y - r * 0.18);
  ctx.lineTo(x + r * 0.12 + sway, y - r * 0.18);
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * r * 0.08 + sway, y - r * 0.22);
    ctx.lineTo(x + i * r * 0.08 + sway, y - r * 0.14);
    ctx.stroke();
  }

}

function drawOneEyedBat(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const wingFlap = Math.sin(t * 8) * 0.25;

  // Body
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.6, r * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings
  const wingSpread = r * 1.3;
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y - r * 0.1);
  ctx.quadraticCurveTo(x - wingSpread, y - r * (0.7 + wingFlap), x - wingSpread * 0.7, y + r * 0.3);
  ctx.lineTo(x - r * 0.3, y + r * 0.2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y - r * 0.1);
  ctx.quadraticCurveTo(x + wingSpread, y - r * (0.7 + wingFlap), x + wingSpread * 0.7, y + r * 0.3);
  ctx.lineTo(x + r * 0.3, y + r * 0.2);
  ctx.fill();

  // Single large eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Laser charging glow
  const charge = 0.2 + Math.sin(t * 6) * 0.15;
  ctx.fillStyle = `rgba(231,76,60,${charge})`;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawDarkAngel(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const float = Math.sin(t * 2) * r * 0.06;

  // Body (dark armor)
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.7 + float);
  ctx.lineTo(x - r * 0.4, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.4, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.5, y + r * 0.7 + float);
  ctx.closePath();
  ctx.fill();

  // Deteriorated wings (torn, dark)
  ctx.fillStyle = 'rgba(100,50,50,0.5)';
  const wingFlap = Math.sin(t * 2.5) * 0.08;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, y - r * 0.15 + float);
  ctx.quadraticCurveTo(x - r * 1.3, y - r * (0.5 + wingFlap) + float, x - r * 0.9, y + r * 0.3 + float);
  ctx.lineTo(x - r * 0.6, y + r * 0.1 + float);
  ctx.lineTo(x - r * 0.35, y + float);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, y - r * 0.15 + float);
  ctx.quadraticCurveTo(x + r * 1.3, y - r * (0.5 + wingFlap) + float, x + r * 0.9, y + r * 0.3 + float);
  ctx.lineTo(x + r * 0.6, y + r * 0.1 + float);
  ctx.lineTo(x + r * 0.35, y + float);
  ctx.fill();

  // Wing bone structure
  ctx.strokeStyle = 'rgba(80,30,30,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, y - r * 0.1 + float);
  ctx.lineTo(x - r * 1.0, y - r * 0.4 + float);
  ctx.moveTo(x - r * 0.7, y - r * 0.25 + float);
  ctx.lineTo(x - r * 0.8, y + r * 0.15 + float);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, y - r * 0.1 + float);
  ctx.lineTo(x + r * 1.0, y - r * 0.4 + float);
  ctx.moveTo(x + r * 0.7, y - r * 0.25 + float);
  ctx.lineTo(x + r * 0.8, y + r * 0.15 + float);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#ffeaa7';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.35 + float, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // Blonde hair
  ctx.fillStyle = '#fdcb6e';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.42 + float, r * 0.25, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.25, y - r * 0.35 + float);
  ctx.quadraticCurveTo(x - r * 0.35, y - r * 0.1 + float, x - r * 0.2, y + r * 0.05 + float);
  ctx.lineTo(x - r * 0.15, y - r * 0.3 + float);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.25, y - r * 0.35 + float);
  ctx.quadraticCurveTo(x + r * 0.35, y - r * 0.1 + float, x + r * 0.2, y + r * 0.05 + float);
  ctx.lineTo(x + r * 0.15, y - r * 0.3 + float);
  ctx.fill();

  // Eyes (menacing red)
  const glow = 0.6 + Math.sin(t * 4) * 0.3;
  ctx.fillStyle = `rgba(231,76,60,${glow})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.1, y - r * 0.38 + float, r * 0.05, 0, Math.PI * 2);
  ctx.arc(x + r * 0.1, y - r * 0.38 + float, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawDemon(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const breathe = Math.sin(t * 2) * r * 0.03;

  // Body (muscular torso)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y + r * 0.6 + breathe);
  ctx.lineTo(x - r * 0.7, y - r * 0.2 + breathe);
  ctx.lineTo(x - r * 0.4, y - r * 0.5 + breathe);
  ctx.lineTo(x + r * 0.4, y - r * 0.5 + breathe);
  ctx.lineTo(x + r * 0.7, y - r * 0.2 + breathe);
  ctx.lineTo(x + r * 0.6, y + r * 0.6 + breathe);
  ctx.closePath();
  ctx.fill();

  // Gargoyle wings
  ctx.fillStyle = e.colorAlt || '#555';
  const wingFlap = Math.sin(t * 3) * 0.1;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y - r * 0.3 + breathe);
  ctx.quadraticCurveTo(x - r * 1.4, y - r * (0.8 + wingFlap) + breathe, x - r * 1.2, y + r * 0.1 + breathe);
  ctx.lineTo(x - r * 0.8, y + r * 0.2 + breathe);
  ctx.lineTo(x - r * 0.5, y - r * 0.1 + breathe);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.3 + breathe);
  ctx.quadraticCurveTo(x + r * 1.4, y - r * (0.8 + wingFlap) + breathe, x + r * 1.2, y + r * 0.1 + breathe);
  ctx.lineTo(x + r * 0.8, y + r * 0.2 + breathe);
  ctx.lineTo(x + r * 0.5, y - r * 0.1 + breathe);
  ctx.fill();

  // Head
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.55 + breathe, r * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Horns (large, curved)
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y - r * 0.8 + breathe);
  ctx.quadraticCurveTo(x - r * 0.5, y - r * 1.3 + breathe, x - r * 0.3, y - r * 1.1 + breathe);
  ctx.lineTo(x - r * 0.1, y - r * 0.75 + breathe);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.2, y - r * 0.8 + breathe);
  ctx.quadraticCurveTo(x + r * 0.5, y - r * 1.3 + breathe, x + r * 0.3, y - r * 1.1 + breathe);
  ctx.lineTo(x + r * 0.1, y - r * 0.75 + breathe);
  ctx.fill();

  // Eyes (fiery)
  const glow = 0.6 + Math.sin(t * 5) * 0.3;
  ctx.fillStyle = `rgba(255,100,0,${glow})`;
  ctx.beginPath();
  ctx.arc(x - r * 0.12, y - r * 0.58 + breathe, r * 0.07, 0, Math.PI * 2);
  ctx.arc(x + r * 0.12, y - r * 0.58 + breathe, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (fanged)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.42 + breathe, r * 0.12, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.08, y - r * 0.42 + breathe);
  ctx.lineTo(x - r * 0.04, y - r * 0.33 + breathe);
  ctx.lineTo(x, y - r * 0.42 + breathe);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.08, y - r * 0.42 + breathe);
  ctx.lineTo(x + r * 0.04, y - r * 0.33 + breathe);
  ctx.lineTo(x, y - r * 0.42 + breathe);
  ctx.fill();

  // Claws
  ctx.strokeStyle = '#333';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + side * r * 0.7, y + r * 0.1 + i * r * 0.08 + breathe);
      ctx.lineTo(x + side * r * 0.9, y + r * 0.05 + i * r * 0.08 + breathe);
      ctx.stroke();
    }
  }

  // Tail
  ctx.strokeStyle = e.color;
  ctx.lineWidth = r * 0.1;
  const tailWag = Math.sin(t * 2.5) * r * 0.1;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.55 + breathe);
  ctx.quadraticCurveTo(x + r * 0.4 + tailWag, y + r * 0.8 + breathe, x + r * 0.3 + tailWag, y + r * 1.0 + breathe);
  ctx.stroke();
}

function drawChest(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const shimmer = Math.sin(t * 3) * 0.15;

  // Base (wooden box)
  ctx.fillStyle = e.colorAlt || '#8B4513';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.8, y - r * 0.3, r * 1.6, r * 1.0, r * 0.1);
  ctx.fill();

  // Lid
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.roundRect(x - r * 0.85, y - r * 0.7, r * 1.7, r * 0.5, [r * 0.15, r * 0.15, 0, 0]);
  ctx.fill();

  // Metal bands
  ctx.strokeStyle = '#c0965c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y - r * 0.25);
  ctx.lineTo(x + r * 0.8, y - r * 0.25);
  ctx.stroke();

  // Lock
  ctx.fillStyle = `rgba(255,215,0,${0.7 + shimmer})`;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.25, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.04, y - r * 0.2, r * 0.08, r * 0.1, 1);
  ctx.fill();

  // Sparkle
  const sparkAng = t * 2;
  ctx.fillStyle = `rgba(255,255,200,${0.4 + shimmer})`;
  for (let i = 0; i < 3; i++) {
    const sa = sparkAng + i * Math.PI * 2 / 3;
    const sx = x + Math.cos(sa) * r * 0.6;
    const sy = y - r * 0.5 + Math.sin(sa) * r * 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Special entity draw (not in registry, called directly) ───

export function drawAngel(ctx, x, y, r, t) {
  const float = Math.sin(t * 2) * r * 0.1;

  // Body (white robe)
  ctx.fillStyle = '#f5f6fa';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.8 + float);
  ctx.lineTo(x - r * 0.35, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.35, y - r * 0.2 + float);
  ctx.lineTo(x + r * 0.5, y + r * 0.8 + float);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = '#ffeaa7';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4 + float, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Halo
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.75 + float, r * 0.25, r * 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Wings
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const wingFlap = Math.sin(t * 3) * 0.1;
  // Left wing
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y - r * 0.15 + float);
  ctx.quadraticCurveTo(x - r * 1.2, y - r * (0.6 + wingFlap) + float, x - r * 0.8, y + r * 0.2 + float);
  ctx.lineTo(x - r * 0.3, y + r * 0.1 + float);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y - r * 0.15 + float);
  ctx.quadraticCurveTo(x + r * 1.2, y - r * (0.6 + wingFlap) + float, x + r * 0.8, y + r * 0.2 + float);
  ctx.lineTo(x + r * 0.3, y + r * 0.1 + float);
  ctx.fill();

  // Eyes (kind)
  ctx.fillStyle = '#74b9ff';
  ctx.beginPath();
  ctx.arc(x - r * 0.1, y - r * 0.42 + float, r * 0.05, 0, Math.PI * 2);
  ctx.arc(x + r * 0.1, y - r * 0.42 + float, r * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#b2bec3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.32 + float, r * 0.08, 0.2, Math.PI - 0.2);
  ctx.stroke();
}


function drawBee(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const wingBuzz = Math.sin(t * 25) * 0.25;

  // Body (oval, yellow with black stripes)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.7, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stripes
  ctx.fillStyle = e.colorAlt || '#2d3436';
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x - r * 0.6, y + i * r * 0.3 - r * 0.08, r * 1.2, r * 0.16);
  }

  // Wings
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y - r * 0.7 - wingBuzz * r, r * 0.5, r * 0.7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.4, y - r * 0.7 - wingBuzz * r, r * 0.5, r * 0.7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.15, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.07, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.3, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Stinger
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.lineTo(x - r * 0.1, y + r * 0.7);
  ctx.lineTo(x + r * 0.1, y + r * 0.7);
  ctx.closePath();
  ctx.fill();
}

function drawBlob(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const wobble = Math.sin(t * 4) * r * 0.08;

  // Body (amorphous blob shape)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.2);
  ctx.quadraticCurveTo(x - r * 0.8, y - r - wobble, x, y - r + wobble * 0.5);
  ctx.quadraticCurveTo(x + r * 0.8, y - r + wobble, x + r, y + r * 0.2);
  ctx.quadraticCurveTo(x + r * 0.5, y + r, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.5, y + r, x - r, y + r * 0.2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.35, r * 0.25, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.15, r * 0.2, 0, Math.PI * 2);
  ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
  ctx.arc(x + r * 0.25, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawDragonfly(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const wingFlap = Math.sin(t * 15) * 0.2;

  // Long thin body
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.3, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = e.colorAlt || e.color;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.9, r * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // 4 wings (2 pairs)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const wingLen = r * 1.3;
  // Upper wings
  ctx.beginPath();
  ctx.ellipse(x - wingLen * 0.5, y - r * 0.3, wingLen * 0.5, r * 0.2, -0.4 + wingFlap, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + wingLen * 0.5, y - r * 0.3, wingLen * 0.5, r * 0.2, 0.4 - wingFlap, 0, Math.PI * 2);
  ctx.fill();
  // Lower wings
  ctx.beginPath();
  ctx.ellipse(x - wingLen * 0.4, y + r * 0.1, wingLen * 0.4, r * 0.15, -0.2 + wingFlap * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + wingLen * 0.4, y + r * 0.1, wingLen * 0.4, r * 0.15, 0.2 - wingFlap * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.95, r * 0.15, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y - r * 0.95, r * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Tail segments
  ctx.fillStyle = e.color;
  for (let i = 1; i <= 3; i++) {
    const segR = r * 0.2 * (1 - i * 0.15);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.5 + i * r * 0.3, segR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIceAngel(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const float = Math.sin(t * 2) * 3;
  const wingSpread = r * 1.4;

  // Halo (icy)
  ctx.strokeStyle = 'rgba(116,185,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.9 + float, r * 0.5, r * 0.15, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Wings (crystalline ice)
  ctx.fillStyle = 'rgba(116,185,255,0.3)';
  // Left wing
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y - r * 0.2 + float);
  ctx.lineTo(x - wingSpread, y - r * 0.8 + float);
  ctx.lineTo(x - wingSpread * 0.8, y + r * 0.4 + float);
  ctx.lineTo(x - r * 0.2, y + r * 0.2 + float);
  ctx.fill();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y - r * 0.2 + float);
  ctx.lineTo(x + wingSpread, y - r * 0.8 + float);
  ctx.lineTo(x + wingSpread * 0.8, y + r * 0.4 + float);
  ctx.lineTo(x + r * 0.2, y + r * 0.2 + float);
  ctx.fill();

  // Wing edges (icy glint)
  ctx.strokeStyle = e.colorAlt || '#dfe6e9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y - r * 0.2 + float);
  ctx.lineTo(x - wingSpread, y - r * 0.8 + float);
  ctx.lineTo(x - wingSpread * 0.8, y + r * 0.4 + float);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y - r * 0.2 + float);
  ctx.lineTo(x + wingSpread, y - r * 0.8 + float);
  ctx.lineTo(x + wingSpread * 0.8, y + r * 0.4 + float);
  ctx.stroke();

  // Body (robed figure)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.1 + float, r * 0.4, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = e.colorAlt || '#dfe6e9';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5 + float, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (cold blue glow)
  ctx.fillStyle = '#0984e3';
  ctx.beginPath();
  ctx.arc(x - r * 0.12, y - r * 0.55 + float, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.12, y - r * 0.55 + float, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawIceGrassHand(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;
  const sway = Math.sin(t * 3) * 0.15;

  // Base mound (icy ground)
  ctx.fillStyle = e.colorAlt || '#00cec9';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.5, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ice grass blades (5 fingers reaching up)
  ctx.strokeStyle = e.color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.2;
  const angles = [-0.4, -0.2, 0, 0.2, 0.4];
  for (let i = 0; i < 5; i++) {
    const baseAngle = angles[i] + sway * (i % 2 === 0 ? 1 : -1);
    const bladeHeight = r * (1.2 + (i === 2 ? 0.3 : 0));
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(baseAngle) * r * 0.3, y + r * 0.3);
    ctx.quadraticCurveTo(
      x + Math.sin(baseAngle) * r * 0.5,
      y - bladeHeight * 0.5,
      x + Math.sin(baseAngle + sway) * r * 0.6,
      y - bladeHeight
    );
    ctx.stroke();
  }

  // Ice crystals on tips
  ctx.fillStyle = '#dfe6e9';
  for (let i = 0; i < 5; i++) {
    const baseAngle = angles[i] + sway * (i % 2 === 0 ? 1 : -1);
    const bladeHeight = r * (1.2 + (i === 2 ? 0.3 : 0));
    const tipX = x + Math.sin(baseAngle + sway) * r * 0.6;
    const tipY = y - bladeHeight;
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMaceSkeleton(ctx, e, t) {
  const r = e.r;
  const x = e.x, y = e.y;

  // Body (armored skeleton)
  ctx.fillStyle = e.colorAlt || '#2d3436';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.1, r * 0.5, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Armor plates
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y - r * 0.2);
  ctx.lineTo(x - r * 0.6, y + r * 0.4);
  ctx.lineTo(x + r * 0.6, y + r * 0.4);
  ctx.lineTo(x + r * 0.5, y - r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Skull head
  ctx.fillStyle = '#f1e7c9';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5, r * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Eye sockets
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(x - r * 0.13, y - r * 0.55, r * 0.1, 0, Math.PI * 2);
  ctx.arc(x + r * 0.13, y - r * 0.55, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Mace (held to the side)
  const maceSwing = Math.sin(t * 3) * 0.3;
  const maceX = x + r * 0.7;
  const maceY = y - r * 0.3;

  // Handle
  ctx.strokeStyle = '#6d4c2a';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y);
  ctx.lineTo(maceX + Math.cos(maceSwing) * r * 0.2, maceY + Math.sin(maceSwing) * r * 0.5);
  ctx.stroke();

  // Mace head (spiked ball)
  const headX = maceX + Math.cos(maceSwing) * r * 0.2;
  const headY = maceY + Math.sin(maceSwing) * r * 0.5;
  ctx.fillStyle = '#636e72';
  ctx.beginPath();
  ctx.arc(headX, headY, r * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Spikes
  ctx.fillStyle = '#95a5a6';
  for (let i = 0; i < 6; i++) {
    const sa = (i / 6) * Math.PI * 2;
    const sx = headX + Math.cos(sa) * r * 0.25;
    const sy = headY + Math.sin(sa) * r * 0.25;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(sa) * r * 0.12, sy + Math.sin(sa) * r * 0.12);
    ctx.lineTo(sx + Math.cos(sa + 0.5) * r * 0.05, sy + Math.sin(sa + 0.5) * r * 0.05);
    ctx.lineTo(sx + Math.cos(sa - 0.5) * r * 0.05, sy + Math.sin(sa - 0.5) * r * 0.05);
    ctx.closePath();
    ctx.fill();
  }
}

// ─── Registry ───

const DRAW_FUNCTIONS = {
  bat: drawBat,
  wolf: drawWolf,
  bomb: drawBomb,
  plant: drawPlant,
  stump: drawStump,
  golem: drawGolem,
  slime: drawSlime,
  skeleton: drawSkeleton,
  skull: drawSkull,
  dragon: drawDragon,
  crocodile: drawCrocodile,
  snake: drawSnake,
  spider: drawSpider,
  worm: drawWorm,
  turret: drawTurret,
  cactus: drawCactus,
  mage: drawMage,
  chest: drawChest,
  spirit: drawSpirit,
  mummy: drawMummy,
  scarecrow: drawScarecrow,
  oneEyedBat: drawOneEyedBat,
  darkAngel: drawDarkAngel,
  demon: drawDemon,
  bee: drawBee,
  blob: drawBlob,
  dragonfly: drawDragonfly,
  iceAngel: drawIceAngel,
  iceGrassHand: drawIceGrassHand,
  maceSkeleton: drawMaceSkeleton,
};
