// skillCard.js - Shared skill card rendering for pause menu and skills info screen
import { getSkillIcon } from './icons.js';

const F = '"Segoe UI",system-ui,sans-serif';
function fontB(W, base, s) { return `bold ${Math.round(base * s)}px ${F}`; }
function font(W, base, s) { return `${Math.round(base * s)}px ${F}`; }

/**
 * Draw a skill card.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 *   skill, x, y, w, h, s (scale), W (canvas width),
 *   stacks (current), isDebug, unlocked (bool, for skill info screen)
 */
export function drawSkillCard(ctx, opts) {
  const { skill, x, y, w, h, s, W, stacks, isDebug, unlocked } = opts;
  const isActive = stacks > 0;
  const isLocked = unlocked === false; // explicitly locked in skill info
  // In skills info screen (unlocked passed), unlocked=true means full opacity
  // In pause menu (unlocked not passed), use stacks to determine
  const isInfoScreen = unlocked !== undefined;

  // Card background
  const highlighted = isInfoScreen ? !isLocked : isActive;
  ctx.fillStyle = highlighted ? 'rgba(108,92,231,0.25)' : 'rgba(255,255,255,0.04)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8 * s); ctx.fill();
  if (highlighted) {
    ctx.strokeStyle = 'rgba(162,155,254,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8 * s); ctx.stroke();
  }

  const alpha = isLocked ? 0.35 : 1;
  ctx.globalAlpha = alpha;

  // Icon
  const iconSize = h - 14 * s;
  const iconCx = x + iconSize / 2 + 8 * s;
  const iconCy = y + h / 2;
  const img = getSkillIcon(skill.id);
  if (img) {
    ctx.drawImage(img, iconCx - iconSize / 2, iconCy - iconSize / 2, iconSize, iconSize);
  } else {
    ctx.font = Math.round(iconSize * 0.55) + 'px ' + F;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(skill.icon, iconCx, iconCy);
  }

  // Name
  const nameX = x + iconSize + 18 * s;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = highlighted ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.font = fontB(W, 13, s);
  ctx.fillText(skill.name, nameX, y + 16 * s);

  // Description as pills
  ctx.font = font(W, 9, s);
  const pillH = 14 * s;
  const pillR = pillH / 2;
  const pillPadX = 6 * s;
  const pillGap = 3 * s;
  // Split desc on commas or natural breaks for multiple pills
  const descParts = skill.desc.split(',').map(p => p.trim()).filter(p => p.length > 0);
  let px = nameX;
  const pillY = y + 30 * s;
  for (const label of descParts) {
    const tw = ctx.measureText(label).width;
    const pw = tw + pillPadX * 2;
    // Don't overflow card
    if (px + pw > x + w - 8 * s) break;
    ctx.fillStyle = highlighted ? 'rgba(162,155,254,0.15)' : 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(px, pillY - pillH / 2, pw, pillH, pillR); ctx.fill();
    ctx.fillStyle = highlighted ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + pw / 2, pillY);
    px += pw + pillGap;
  }

  // Stack count button group (top right) — only for maxStacks > 1 and ≤ 10
  const rightPad = x + w - 6 * s;
  if (skill.maxStacks > 1 && skill.maxStacks <= 5) {
    const grpH = 16 * s;
    const grpY = y + 6 * s;
    const maxS = skill.maxStacks;
    const labels = [];
    for (let n = 1; n <= maxS; n++) labels.push('' + n);
    const selIdx = stacks - 1; // -1 means none selected
    const bPad = 5 * s;
    const bGap = 1 * s;
    const bR = 3 * s;
    ctx.font = fontB(W, 8, s);
    const bWidths = labels.map(l => ctx.measureText(l).width + bPad * 2);
    const totalW = bWidths.reduce((a, b) => a + b, 0) + bGap * (labels.length - 1);
    const grpX = rightPad - totalW;
    let bx = grpX;
    for (let i = 0; i < labels.length; i++) {
      const bw = bWidths[i];
      const isSel = i === selIdx;
      ctx.fillStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(bx, grpY, bw, grpH, bR); ctx.fill();
      ctx.strokeStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, grpY, bw, grpH, bR); ctx.stroke();
      ctx.fillStyle = isSel ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], bx + bw / 2, grpY + grpH / 2);
      bx += bw + bGap;
    }
  } else if (skill.maxStacks > 5 && skill.maxStacks <= 10) {
    const grpH = 13 * s;
    const grpY = y + 6 * s;
    const maxS = skill.maxStacks;
    const labels = [];
    for (let n = 1; n <= maxS; n++) labels.push('' + n);
    const selIdx = stacks - 1;
    const bPad = 3 * s;
    const bGap = 1 * s;
    const bR = 3 * s;
    ctx.font = fontB(W, 6, s);
    const bWidths = labels.map(l => ctx.measureText(l).width + bPad * 2);
    const totalW = bWidths.reduce((a, b) => a + b, 0) + bGap * (labels.length - 1);
    const grpX = rightPad - totalW;
    let bx = grpX;
    for (let i = 0; i < labels.length; i++) {
      const bw = bWidths[i];
      const isSel = i <= selIdx && stacks > 0;
      ctx.fillStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(bx, grpY, bw, grpH, bR); ctx.fill();
      ctx.strokeStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, grpY, bw, grpH, bR); ctx.stroke();
      ctx.fillStyle = isSel ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], bx + bw / 2, grpY + grpH / 2);
      bx += bw + bGap;
    }
  }

  // Chapter unlock badge (bottom right)
  const chNum = skill.unlockChapter || 1;
  const chLabel = 'Ch.' + chNum;
  ctx.font = fontB(W, 8, s);
  const chW = ctx.measureText(chLabel).width + 10 * s;
  const chH = 14 * s;
  const chX = rightPad - chW;
  const chY = y + h - chH - 4 * s;
  const chUnlocked = unlocked !== false; // default true for pause screen
  ctx.fillStyle = chUnlocked ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)';
  ctx.beginPath(); ctx.roundRect(chX, chY, chW, chH, chH / 2); ctx.fill();
  ctx.fillStyle = chUnlocked ? 'rgba(46,204,113,0.7)' : 'rgba(231,76,60,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(chLabel, chX + chW / 2, chY + chH / 2);

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
