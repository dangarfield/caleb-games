import { clamp } from './utils.js';
import { game } from './state.js';

export function drawShape(ctx, x, y, r, shape, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x - r * 0.87, y + r * 0.5);
    ctx.lineTo(x + r * 0.87, y + r * 0.5);
    ctx.closePath();
  } else if (shape === 'square') {
    const s = r * 0.75;
    ctx.rect(x - s, y - s, s * 2, s * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 6;
      if (i === 0) {
        ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      } else {
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    }
    ctx.closePath();
  }
  ctx.fill();
}

export function drawBar(ctx, x, y, w, h, ratio, fg, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = fg || '#2ecc71';
  ctx.fillRect(x - w / 2, y, w * clamp(ratio, 0, 1), h);
}

export function drawArena(ctx, a, theme) {
  const t = theme || {};

  // Arena floor fill
  if (t.floor) {
    ctx.fillStyle = t.floor;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    // Subtle accent noise — alternating cells for texture
    if (t.floorAccent) {
      ctx.fillStyle = t.floorAccent;
      const gs = a.cellSize || 40;
      const cols = Math.ceil(a.w / gs);
      const rows = Math.ceil(a.h / gs);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2 === 0) continue;
          ctx.fillRect(a.x + c * gs, a.y + r * gs, gs, gs);
        }
      }
    }
  }

  // Arena border
  ctx.strokeStyle = t.boundaryEdge || 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);

  // Subtle grid
  ctx.strokeStyle = t.floorGrid || 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  const gs = a.cellSize || 40;
  for (let gx = a.x + gs; gx < a.x + a.w; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, a.y);
    ctx.lineTo(gx, a.y + a.h);
    ctx.stroke();
  }
  for (let gy = a.y + gs; gy < a.y + a.h; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(a.x, gy);
    ctx.lineTo(a.x + a.w, gy);
    ctx.stroke();
  }

  // Boundary area (outside the arena) — draw themed border strips
  if (t.boundary) {
    const bPad = gs * 3; // 3 cells wide boundary on each side
    ctx.fillStyle = t.boundary;
    // Left
    ctx.fillRect(a.x - bPad, a.y - bPad, bPad, a.h + bPad * 2);
    // Right
    ctx.fillRect(a.x + a.w, a.y - bPad, bPad, a.h + bPad * 2);
    // Top
    ctx.fillRect(a.x, a.y - bPad, a.w, bPad);
    // Bottom
    ctx.fillRect(a.x - bPad, a.y + a.h, a.w + bPad * 2, bPad);

    // Boundary detail pattern — horizontal lines on sides
    if (t.boundaryDetail) {
      ctx.strokeStyle = t.boundaryDetail;
      ctx.lineWidth = 1;
      for (let by = a.y; by < a.y + a.h; by += gs) {
        // Left side
        ctx.beginPath();
        ctx.moveTo(a.x - bPad, by);
        ctx.lineTo(a.x, by);
        ctx.stroke();
        // Right side
        ctx.beginPath();
        ctx.moveTo(a.x + a.w, by);
        ctx.lineTo(a.x + a.w + bPad, by);
        ctx.stroke();
      }
    }
  }
}
