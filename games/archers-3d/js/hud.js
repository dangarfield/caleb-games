import { game } from './state.js';
import { clamp, wrapText, fmt } from './utils.js';
import { CHAPTERS, getChapterStages } from './chapters.js';
import { getJoystick } from './input.js';
import { ALL_SKILLS, rebuildPlayerFromSkills } from './skills.js';
import { rebuildOrbitals } from './orbitals.js';
import { getSkillIcon } from './icons.js';
import { drawSkillCard } from './skillCard.js';
import { saveDebug, saveChaptersCleared, saveCoins, unlockRing, setChosenWeaponLvl, setChosenArmorLvl, saveLastRun } from './storage.js';
import { toggleCamera, isOrthoCamera, toggleShadows, areShadowsEnabled } from './renderer3d.js';
import { RINGS } from './equipment.js';
import { TOTAL_CHAPTERS } from './constants.js';

const F = '"Segoe UI",system-ui,sans-serif';
function sc(W) { return Math.max(1, W / 400); }
function fontB(W, base) { return `bold ${Math.round(base * sc(W))}px ${F}`; }
function font(W, base) { return `${Math.round(base * sc(W))}px ${F}`; }

// Pause button hit area (set during draw, read by main.js)
let pauseBtnRect = null;
export function getPauseBtnRect() { return pauseBtnRect; }

// Pause screen click regions
let pauseClickRegions = [];
export function clearPauseClickRegions() { pauseClickRegions = []; }

export function handlePauseClick(mx, my) {
  for (const r of pauseClickRegions) {
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      r.action();
      return true; // consumed
    }
  }
  return false; // not consumed — resume
}

// Pause scroll
let pauseScrollY = 0;
export function resetPauseScroll() { pauseScrollY = 0; }
export function handlePauseScroll(deltaY) {
  pauseScrollY = Math.max(0, pauseScrollY + deltaY);
}

export function drawHUD(ctx, W, H) {
  const p = game.player;
  if (!p) return;

  const s = sc(W);
  const pad = 12 * s;

  // ── Level bar (top center) ──
  const barW = Math.min(W * 0.52, 220 * s);
  const barH = 22 * s;
  const barX = (W - barW) / 2;
  const barY = 14 * s;
  const barR = barH / 2;
  const xpRatio = clamp(p.xp / p.xpToNext, 0, 1);

  // Bar background (dark with border)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barR); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barR); ctx.stroke();

  // XP fill (orange/yellow gradient)
  if (xpRatio > 0) {
    const fillW = Math.max(barH, barW * xpRatio);
    const xpGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    xpGrad.addColorStop(0, '#f39c12');
    xpGrad.addColorStop(1, '#f1c40f');
    ctx.fillStyle = xpGrad;
    ctx.beginPath(); ctx.roundRect(barX + 1, barY + 1, fillW - 2, barH - 2, barR - 1); ctx.fill();
  }

  // "Lv.X" text (white with dark outline)
  const lvText = 'Lv.' + p.level;
  ctx.font = fontB(W, 13);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lvX = barX + 10 * s;
  const lvY = barY + barH / 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3 * s;
  ctx.lineJoin = 'round';
  ctx.strokeText(lvText, lvX, lvY);
  ctx.fillStyle = '#fff';
  ctx.fillText(lvText, lvX, lvY);

  // ── Top right: gems + pause ──
  const rightX = W - pad;
  const iconY = barY + barH / 2;

  // Pause button
  const pauseW = 28 * s;
  const pauseH = 28 * s;
  const pauseX = rightX - pauseW;
  const pauseY = iconY - pauseH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.roundRect(pauseX, pauseY, pauseW, pauseH, 6 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(pauseX, pauseY, pauseW, pauseH, 6 * s); ctx.stroke();
  ctx.fillStyle = '#fff';
  const bw = 3.5 * s, bh = 12 * s;
  const bcx = pauseX + pauseW / 2;
  const bcy = pauseY + pauseH / 2;
  ctx.fillRect(bcx - bw - 1.5 * s, bcy - bh / 2, bw, bh);
  ctx.fillRect(bcx + 1.5 * s, bcy - bh / 2, bw, bh);
  pauseBtnRect = { x: pauseX, y: pauseY, w: pauseW, h: pauseH };

  // Gems
  const gemX = pauseX - 8 * s;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 13);
  ctx.fillText(fmt(game.runCoins), gemX, iconY);
  const coinTextW = ctx.measureText(fmt(game.runCoins)).width;
  ctx.fillStyle = '#a29bfe';
  ctx.font = fontB(W, 12);
  ctx.fillText('\u{1F48E}', gemX - coinTextW - 3 * s, iconY);

  // Joystick visual
  const j = getJoystick();
  if (j.active) {
    const joyR = 50 * s, thumbR = 18 * s;
    ctx.save();
    ctx.globalAlpha = 0.2; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(j.sx, j.sy, joyR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(j.sx + j.dx * joyR, j.sy + j.dy * joyR, thumbR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Tutorial hints (chapter 0 only)
  if (game.chapter === 0 && game.stage >= 1 && game.stage <= 3) {
    const hints = {
      1: ['Move with the joystick', 'Enter the next room'],
      2: ['Release joystick', 'Stand still to fire at enemies'],
      3: ['Go around obstacles', 'And defeat enemies'],
    };
    const lines = hints[game.stage];
    if (lines) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hintY = H * 0.18;
      const lineH = 22 * s;
      // Shadow for readability
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 8 * s;
      ctx.fillStyle = '#fff';
      ctx.font = fontB(W, 16);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], W / 2, hintY + i * lineH);
      }
      ctx.restore();
    }
  }

  // ── FPS counter (bottom-left) ──
  _fpsFrames++;
  const now = performance.now();
  if (now - _fpsLast >= 500) {
    _fpsDisplay = Math.round(_fpsFrames / ((now - _fpsLast) / 1000));
    _fpsFrames = 0;
    _fpsLast = now;
  }
  ctx.save();
  ctx.font = `bold ${Math.round(10 * s)}px ${F}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = _fpsDisplay >= 50 ? 'rgba(100,255,100,0.7)' : _fpsDisplay >= 30 ? 'rgba(255,255,100,0.7)' : 'rgba(255,80,80,0.8)';
  ctx.fillText(`${_fpsDisplay} FPS`, pad, H - pad);
  ctx.restore();
}

let _fpsFrames = 0;
let _fpsLast = performance.now();
let _fpsDisplay = 60;

// ── Helper: draw a toggle switch ──
function drawToggle(ctx, x, y, w, h, on, s) {
  const r = h / 2;
  ctx.fillStyle = on ? 'rgba(46,204,113,0.6)' : 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = on ? '#2ecc71' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke();
  const knobR = h * 0.35;
  const knobX = on ? x + w - r : x + r;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(knobX, y + r, knobR, 0, Math.PI * 2); ctx.fill();
}

// ── Pause Screen ──
export function drawPauseScreen(ctx, W, H) {
  const s = sc(W);
  const pad = 16 * s;
  const p = game.player;
  const dbg = game.debug;

  pauseClickRegions = [];

  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Paused', W / 2, 36 * s);

  // ── Close button (top right) ──
  const closeBtnSize = 32 * s;
  const closeBtnX = W - pad - closeBtnSize;
  const closeBtnY = 20 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, 6 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, 6 * s); ctx.stroke();
  const cx = closeBtnX + closeBtnSize / 2, cy = closeBtnY + closeBtnSize / 2;
  const xOff = 8 * s;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - xOff, cy - xOff); ctx.lineTo(cx + xOff, cy + xOff); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + xOff, cy - xOff); ctx.lineTo(cx - xOff, cy + xOff); ctx.stroke();
  pauseClickRegions.push({ x: closeBtnX, y: closeBtnY, w: closeBtnSize, h: closeBtnSize, action: () => {
    game.state = game._pausedFrom || 'playing';
    game._pausedFrom = null;
  }});

  // ── Quit button (top left) ──
  const quitBtnW = 56 * s;
  const quitBtnH = 32 * s;
  const quitBtnX = pad;
  const quitBtnY = 20 * s;
  ctx.fillStyle = 'rgba(231,76,60,0.7)';
  ctx.beginPath(); ctx.roundRect(quitBtnX, quitBtnY, quitBtnW, quitBtnH, 6 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.roundRect(quitBtnX, quitBtnY, quitBtnW, quitBtnH, 6 * s); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Quit', quitBtnX + quitBtnW / 2, quitBtnY + quitBtnH / 2);
  pauseClickRegions.push({ x: quitBtnX, y: quitBtnY, w: quitBtnW, h: quitBtnH, action: () => {
    game._pausedFrom = null;
    game.returnToEquip = true;
  }});

  // ── Debug toggle row ──
  const toggleW = 36 * s;
  const toggleH = 18 * s;
  let rowY = 60 * s;

  // Debug mode toggle
  ctx.fillStyle = dbg.enabled ? '#f39c12' : 'rgba(255,255,255,0.4)';
  ctx.font = fontB(W, 11);
  ctx.textAlign = 'left';
  ctx.fillText('Debug Mode', pad, rowY + toggleH / 2);
  const dbgTogX = W - pad - toggleW;
  drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, dbg.enabled, s);
  pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
    dbg.enabled = !dbg.enabled;
    saveDebug(dbg);
  }});
  rowY += toggleH + 8 * s;

  if (dbg.enabled) {
    // No damage to player toggle
    ctx.fillStyle = dbg.noDmgToPlayer ? '#2ecc71' : 'rgba(255,255,255,0.4)';
    ctx.font = font(W, 10);
    ctx.textAlign = 'left';
    ctx.fillText('Invincible (no dmg to player)', pad + 10 * s, rowY + toggleH / 2);
    drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, dbg.noDmgToPlayer, s);
    pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
      dbg.noDmgToPlayer = !dbg.noDmgToPlayer;
      saveDebug(dbg);
    }});
    rowY += toggleH + 6 * s;

    // No damage to enemies toggle
    ctx.fillStyle = dbg.noDmgToEnemy ? '#e74c3c' : 'rgba(255,255,255,0.4)';
    ctx.font = font(W, 10);
    ctx.textAlign = 'left';
    ctx.fillText('Enemies invincible (no dmg to enemies)', pad + 10 * s, rowY + toggleH / 2);
    drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, dbg.noDmgToEnemy, s);
    pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
      dbg.noDmgToEnemy = !dbg.noDmgToEnemy;
      saveDebug(dbg);
    }});
    rowY += toggleH + 6 * s;

    // Camera mode toggle (ortho / perspective)
    const ortho = isOrthoCamera();
    ctx.fillStyle = ortho ? '#3498db' : '#9b59b6';
    ctx.font = font(W, 10);
    ctx.textAlign = 'left';
    ctx.fillText('Camera: ' + (ortho ? 'Orthographic' : 'Perspective'), pad + 10 * s, rowY + toggleH / 2);
    drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, ortho, s);
    pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
      toggleCamera();
    }});
    rowY += toggleH + 6 * s;

    // No VFX / particles toggle
    ctx.fillStyle = dbg.noVFX ? '#e67e22' : 'rgba(255,255,255,0.4)';
    ctx.font = font(W, 10);
    ctx.textAlign = 'left';
    ctx.fillText('Disable Particle Effects', pad + 10 * s, rowY + toggleH / 2);
    drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, dbg.noVFX, s);
    pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
      dbg.noVFX = !dbg.noVFX;
      saveDebug(dbg);
    }});
    rowY += toggleH + 6 * s;

    // Shadows toggle
    const shadowsOn = areShadowsEnabled();
    ctx.fillStyle = shadowsOn ? '#1abc9c' : 'rgba(255,255,255,0.4)';
    ctx.font = font(W, 10);
    ctx.textAlign = 'left';
    ctx.fillText('Shadows', pad + 10 * s, rowY + toggleH / 2);
    drawToggle(ctx, dbgTogX, rowY, toggleW, toggleH, shadowsOn, s);
    pauseClickRegions.push({ x: pad, y: rowY - 2, w: W - pad * 2, h: toggleH + 4, action: () => {
      toggleShadows();
    }});
    rowY += toggleH + 12 * s;

    // Debug action buttons (3 in a row)
    const btnGap = 6 * s;
    const btnW = (W - pad * 2 - btnGap * 2) / 3;
    const btnH2 = 28 * s;
    const btnR = 6 * s;

    // Reset Data button
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.roundRect(pad, rowY, btnW, btnH2, btnR); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 9);
    ctx.textAlign = 'center';
    ctx.fillText('Reset Data', pad + btnW / 2, rowY + btnH2 / 2);
    pauseClickRegions.push({ x: pad, y: rowY, w: btnW, h: btnH2, action: () => {
      localStorage.removeItem('calebArcadeData');
      location.reload();
    }});

    // Unlock Everything button
    const unlockX = pad + btnW + btnGap;
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.roundRect(unlockX, rowY, btnW, btnH2, btnR); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 9);
    ctx.textAlign = 'center';
    ctx.fillText('Unlock All', unlockX + btnW / 2, rowY + btnH2 / 2);
    pauseClickRegions.push({ x: unlockX, y: rowY, w: btnW, h: btnH2, action: () => {
      saveChaptersCleared(TOTAL_CHAPTERS);
      setChosenWeaponLvl(TOTAL_CHAPTERS);
      setChosenArmorLvl(TOTAL_CHAPTERS);
      saveCoins(99999);
      for (const ring of RINGS) unlockRing(ring.id);
      location.reload();
    }});

    // New Cache URL button
    const cacheX = unlockX + btnW + btnGap;
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.roundRect(cacheX, rowY, btnW, btnH2, btnR); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 9);
    ctx.textAlign = 'center';
    ctx.fillText('Cache Bust', cacheX + btnW / 2, rowY + btnH2 / 2);
    pauseClickRegions.push({ x: cacheX, y: rowY, w: btnW, h: btnH2, action: () => {
      const url = new URL(location.href);
      url.searchParams.set('v', Date.now());
      location.href = url.toString();
    }});

    rowY += btnH2 + 10 * s;
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, rowY); ctx.lineTo(W - pad, rowY); ctx.stroke();
  rowY += 8 * s;

  // ── Skills section ──
  const skillHeaderY = rowY;
  ctx.fillStyle = '#a29bfe';
  ctx.font = fontB(W, 13);
  ctx.textAlign = 'center';
  if (dbg.enabled) {
    ctx.fillText('All Skills (tap to toggle)', W / 2, skillHeaderY);
  } else {
    const acquired = p ? Object.values(p.skills || {}).filter(v => v > 0).length : 0;
    ctx.fillText('Skills Acquired (' + acquired + ')', W / 2, skillHeaderY);
  }
  rowY += 20 * s;

  // Determine which skills to show
  const skillList = dbg.enabled
    ? ALL_SKILLS // show all skills in debug
    : ALL_SKILLS.filter(sk => p && p.skills[sk.id] > 0); // only acquired

  // Scrollable area
  const listTop = rowY;
  const statsBarH = 70 * s;
  const listBottom = H - statsBarH;
  const visibleH = listBottom - listTop;

  // Cards
  const cardH = 58 * s;
  const cardGap = 4 * s;
  const totalContentH = skillList.length * (cardH + cardGap);
  const maxScroll = Math.max(0, totalContentH - visibleH);
  if (pauseScrollY > maxScroll) pauseScrollY = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, listTop, W, visibleH);
  ctx.clip();

  skillList.forEach((skill, idx) => {
    const cy = listTop + idx * (cardH + cardGap) - pauseScrollY;
    if (cy + cardH < listTop - 5 || cy > listBottom + 5) return;

    const stacks = (p && p.skills[skill.id]) || 0;

    drawSkillCard(ctx, {
      skill, x: pad, y: cy, w: W - pad * 2, h: cardH, s, W,
      stacks, isDebug: dbg.enabled
    });

    // Click region for debug toggle — cycles off → 1 → 2 → ... → max → off
    if (dbg.enabled && p) {
      pauseClickRegions.push({ x: pad, y: cy, w: W - pad * 2, h: cardH, action: () => {
        const cur = p.skills[skill.id] || 0;
        p.skills[skill.id] = cur >= skill.maxStacks ? 0 : cur + 1;
        rebuildPlayerFromSkills();
        rebuildOrbitals();
        // Persist debug skills so they survive refresh
        saveLastRun(game.chapter, game.stage, {
          skills: { ...p.skills },
          level: p.level,
          xp: p.xp,
          xpToNext: p.xpToNext,
        });
      }});
    }
  });

  ctx.restore(); // clip

  // Scrollbar
  if (totalContentH > visibleH) {
    const scrollBarH = Math.max(20 * s, visibleH * (visibleH / totalContentH));
    const scrollBarY = listTop + (pauseScrollY / (totalContentH - visibleH)) * (visibleH - scrollBarH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(W - 6 * s, scrollBarY, 3 * s, scrollBarH, 2 * s); ctx.fill();
  }

  // ── Stats bar at bottom ──
  if (p) {
    const statsY = H - statsBarH + 10 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, statsY - 14 * s, W, statsBarH + 4 * s);

    ctx.font = fontB(W, 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const stats = [
      { label: 'HP', value: fmt(Math.ceil(p.hp)) + '/' + fmt(p.maxHp), color: '#2ecc71' },
      { label: 'ATK', value: fmt(p.dmgMult * 10), color: '#e74c3c' },
      { label: 'SPD', value: fmt(p.speedMult * 100) + '%', color: '#3498db' },
      { label: 'CRIT', value: (p.critChance * 100).toFixed(0) + '%', color: '#f39c12' },
    ];
    const statW = W / stats.length;
    stats.forEach((st, i) => {
      const sx = statW * i + statW / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(st.label, sx, statsY);
      ctx.fillStyle = st.color;
      ctx.font = fontB(W, 13);
      ctx.fillText(st.value, sx, statsY + 16 * s);
      ctx.font = fontB(W, 10);
    });

    // Resume hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = font(W, 10);
    ctx.textAlign = 'center';
    ctx.fillText('Tap empty area to resume', W / 2, H - 10 * s);
  }
}
