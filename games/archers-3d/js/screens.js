import { game } from './state.js';
import { clamp, wrapText, fmt } from './utils.js';
import { CHAPTERS, getChapterStages } from './chapters.js';
import { getWeapon, getArmor, RINGS, getRingById, buyRing, RARITY_COLORS } from './equipment.js';
import { ALL_SKILLS, SKILL_CATEGORIES, CATEGORY_ICONS, pickSkill } from './skills.js';
import { getCoins, getChaptersCleared, getEquipLevel, getChosenWeaponLvl, getChosenArmorLvl, setChosenWeaponLvl, setChosenArmorLvl, getUnlockedRings, getEquippedRings, setEquippedRing, unlockRing, getLastRun, clearLastRun } from './storage.js';
import { sfxEquip, sfxSkillPick } from './audio.js';
import { TOTAL_CHAPTERS } from './constants.js';
import { getSkillIcon } from './icons.js';
import { drawSkillCard } from './skillCard.js';

// UI scale factor - all sizes relative to 400px base width
function sc(W) { return Math.max(1, W / 400); }
function font(W, base) { return Math.round(base * sc(W)) + 'px "Segoe UI",system-ui,sans-serif'; }
function fontB(W, base) { return 'bold ' + Math.round(base * sc(W)) + 'px "Segoe UI",system-ui,sans-serif'; }

// Draw a skill icon: use loaded image if available, else emoji fallback
function drawSkillIcon(ctx, skill, cx, cy, size) {
  const img = getSkillIcon(skill.id);
  if (img) {
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.font = Math.round(size * 0.75) + 'px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(skill.icon, cx, cy);
  }
}

// Track clickable regions for the current frame
let clickRegions = [];

export function clearClickRegions() { clickRegions = []; }
export function getClickRegions() { return clickRegions; }

function addClickRegion(x, y, w, h, action) {
  clickRegions.push({ x, y, w, h, action });
}

export function handleClick(mx, my) {
  // Iterate in reverse so later-added regions (e.g. nav bar) take priority
  for (let i = clickRegions.length - 1; i >= 0; i--) {
    const r = clickRegions[i];
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      r.action();
      return true;
    }
  }
  return false;
}

// ========== SCREEN TRANSITIONS ==========
const MENU_SCREENS = new Set(['equip', 'map', 'skillInfo']);
let _prevScreen = null;
let _slideOffsetY = 0;

// Call at start of each menu screen draw. Clips to content area and applies vertical slide.
// Returns { sliding, bottomBarTop, btnY, btnH, barW, barGap } for shared nav drawing.
function beginScreenDraw(ctx, W, H) {
  const s = sc(W);
  const pad = 16 * s;
  const btnH = 40 * s;
  const barGap = 5 * s;
  const barW = W - pad * 2;
  const btnY = H - btnH - 12 * s;
  const bottomBarTop = btnY - 8 * s;

  const curScreen = game.state;
  if (_prevScreen !== null && _prevScreen !== curScreen && MENU_SCREENS.has(_prevScreen) && MENU_SCREENS.has(curScreen)) {
    _slideOffsetY = H * 0.15;
    _prevScreen = curScreen;
  } else if (_prevScreen !== curScreen) {
    _prevScreen = curScreen;
    _slideOffsetY = 0;
  }
  _slideOffsetY *= 0.82;
  if (Math.abs(_slideOffsetY) < 1) _slideOffsetY = 0;

  // Clip content area above bottom bar and apply vertical offset
  const sliding = _slideOffsetY !== 0;
  if (sliding) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, bottomBarTop);
    ctx.clip();
    ctx.translate(0, _slideOffsetY);
    // Fade in: content alpha based on offset
    ctx.globalAlpha = clamp(1 - Math.abs(_slideOffsetY) / (H * 0.15), 0.3, 1);
  }

  return { sliding, bottomBarTop, btnY, btnH, barW, barGap, pad, s };
}

function endContentDraw(ctx, sliding) {
  if (sliding) ctx.restore();
}

// Shared bottom nav bar drawn by each screen after content
function drawBottomNav(ctx, W, H, activeTab, bar) {
  const { bottomBarTop, btnY, btnH, barW, barGap, pad, s } = bar;
  const r = 10 * s;
  const tabBtnW = (barW - barGap * 2) / 3;
  const chaptersCleared = getChaptersCleared();

  // Background
  ctx.fillStyle = 'rgba(10,10,46,0.95)';
  ctx.fillRect(0, bottomBarTop, W, H - bottomBarTop);

  let bx = pad;
  const tutorialDone = chaptersCleared >= 0;

  // Armoury tab (hidden before tutorial is cleared)
  if (tutorialDone) {
    const armActive = activeTab === 'equip';
    const equipMax = Math.max(1, Math.min(chaptersCleared + 1, 10));
    const notBestEquip = getChosenWeaponLvl() < equipMax || getChosenArmorLvl() < equipMax;
    ctx.fillStyle = armActive ? 'rgba(108,92,231,0.5)' : 'rgba(108,92,231,0.25)';
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.fill();
    ctx.strokeStyle = armActive ? '#a29bfe' : 'rgba(162,155,254,0.4)';
    ctx.lineWidth = armActive ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.stroke();
    ctx.fillStyle = armActive ? '#fff' : '#a29bfe';
    ctx.font = fontB(W, 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Armoury', bx + tabBtnW / 2, btnY + btnH / 2);
    // Notification badge when not using best equipment
    if (notBestEquip) {
      const bR = 7 * s;
      const bX = bx + tabBtnW - 5 * s;
      const bY2 = btnY + 5 * s;
      ctx.fillStyle = '#0a0a2e';
      ctx.beginPath(); ctx.arc(bX, bY2, bR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bX, bY2, bR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold ' + Math.round(10 * s) + 'px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', bX, bY2);
    }
    addClickRegion(bx, btnY, tabBtnW, btnH, armActive ? () => {} : () => { game.state = 'equip'; });
  }
  bx += tabBtnW + barGap;

  // Middle tab: Adventure! (goes to map from equip/skills views)
  if (activeTab === 'map') {
    // On map screen: highlight as active
    ctx.fillStyle = 'rgba(108,92,231,0.5)';
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.fill();
    ctx.strokeStyle = '#a29bfe';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 12);
    ctx.textAlign = 'center';
    ctx.fillText('Adventure!', bx + tabBtnW / 2, btnY + btnH / 2);
    addClickRegion(bx, btnY, tabBtnW, btnH, () => {});
  } else {
    // Adventure! button: purple bg with gold border and text
    ctx.fillStyle = 'rgba(108,92,231,0.25)';
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = fontB(W, 12);
    ctx.textAlign = 'center';
    ctx.fillText('Adventure!', bx + tabBtnW / 2, btnY + btnH / 2);
    addClickRegion(bx, btnY, tabBtnW, btnH, () => { game.state = 'map'; });
  }
  bx += tabBtnW + barGap;

  // Skills tab
  const sklActive = activeTab === 'skillInfo';
  ctx.fillStyle = sklActive ? 'rgba(108,92,231,0.5)' : 'rgba(108,92,231,0.25)';
  ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.fill();
  ctx.strokeStyle = sklActive ? '#a29bfe' : 'rgba(162,155,254,0.4)';
  ctx.lineWidth = sklActive ? 2 : 1.5;
  ctx.beginPath(); ctx.roundRect(bx, btnY, tabBtnW, btnH, r); ctx.stroke();
  ctx.fillStyle = sklActive ? '#fff' : '#a29bfe';
  ctx.font = fontB(W, 12);
  ctx.textAlign = 'center';
  ctx.fillText('Skills', bx + tabBtnW / 2, btnY + btnH / 2);
  addClickRegion(bx, btnY, tabBtnW, btnH, sklActive ? () => {} : () => { game.state = 'skillInfo'; });
}

// ========== ARMORY SCREEN STATE ==========
let selectedSlot = null; // 'weapon', 'armor', 'ring1', 'ring2', or null
let armoryScrollY = 0;

export function handleArmoryScroll(deltaY) {
  armoryScrollY += deltaY;
  if (armoryScrollY < 0) armoryScrollY = 0;
}

// Keep old exports as no-ops for compatibility
export function handleEquipPointerDown() { return false; }
export function handleEquipPointerMove() { return false; }
export function handleEquipPointerUp() { return false; }

// ========== ARMORY SCREEN ==========
export function drawEquipScreen(ctx, W, H) {
  clearClickRegions();
  const bar = beginScreenDraw(ctx, W, H);
  const { sliding, bottomBarTop, s, pad } = bar;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#141452');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = 36 * s;
  ctx.fillText('Armoury', W / 2, titleY);

  // Gems
  ctx.fillStyle = '#a29bfe';
  ctx.font = fontB(W, 12);
  ctx.fillText('\u{1F48E} ' + fmt(getCoins()), W / 2, titleY + 20 * s);

  const equipLvl = getEquipLevel();
  const chosenWpn = getChosenWeaponLvl();
  const chosenArm = getChosenArmorLvl();
  const weapon = getWeapon(chosenWpn);
  const armor = getArmor(chosenArm);
  const unlockedRings = getUnlockedRings();
  const equippedRings = getEquippedRings();

  // ─── 3-column grid ───
  const colGap = 8 * s;
  const colW = (W - pad * 2 - colGap * 2) / 3;
  const gridTop = titleY + 38 * s;
  const slotH = 60 * s;
  const slotGap = 8 * s;
  const slotR = 10 * s;

  const slotDefs = [
    { slot: 'weapon', label: 'Weapon', col: 0, row: 0 },
    { slot: 'ring1',  label: 'Ring 1', col: 0, row: 1 },
    { slot: 'armor',  label: 'Armour', col: 2, row: 0 },
    { slot: 'ring2',  label: 'Ring 2', col: 2, row: 1 },
  ];

  // Draw slot cards
  slotDefs.forEach(def => {
    const sx = pad + def.col * (colW + colGap);
    const sy = gridTop + def.row * (slotH + slotGap);
    const isSelected = selectedSlot === def.slot;
    const rightAligned = def.col === 0;

    // Resolve what's in this slot
    let icon = null, name = null, subtitle = null, nameColor = '#a29bfe';
    let notBest = false;
    if (def.slot === 'weapon') {
      icon = weapon.icon; name = weapon.name; subtitle = 'Lv.' + chosenWpn;
      nameColor = RARITY_COLORS[weapon.rarity] || '#fff';
      notBest = chosenWpn < equipLvl;
    } else if (def.slot === 'armor') {
      icon = armor.icon; name = armor.name; subtitle = 'Lv.' + chosenArm;
      nameColor = RARITY_COLORS[armor.rarity] || '#fff';
      notBest = chosenArm < equipLvl;
    } else {
      const ri = def.slot === 'ring1' ? 0 : 1;
      const ring = equippedRings[ri] ? getRingById(equippedRings[ri]) : null;
      if (ring && unlockedRings.includes(ring.id)) {
        icon = ring.icon; name = ring.name; subtitle = ring.trait;
      }
    }

    const hasItem = icon !== null;

    // Card bg
    ctx.fillStyle = isSelected ? 'rgba(108,92,231,0.45)' : hasItem ? 'rgba(108,92,231,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.roundRect(sx, sy, colW, slotH, slotR); ctx.fill();
    ctx.strokeStyle = isSelected ? '#a29bfe' : hasItem ? (nameColor + '80') : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath(); ctx.roundRect(sx, sy, colW, slotH, slotR); ctx.stroke();

    if (hasItem) {
      const iconSize = slotH * 0.45;
      const iconY = sy + slotH / 2 + 4 * s;

      if (rightAligned) {
        const iconX = sx + colW - 6 * s - iconSize / 2;
        ctx.font = Math.round(iconSize * 0.7) + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(icon, iconX, iconY);
        const textX = sx + colW - iconSize - 12 * s;
        ctx.textAlign = 'right';
        ctx.fillStyle = nameColor;
        ctx.font = fontB(W, 10);
        ctx.fillText(name, textX, sy + 22 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = font(W, 8);
        ctx.fillText(subtitle, textX, sy + 34 * s);
      } else {
        const iconX = sx + 6 * s + iconSize / 2;
        ctx.font = Math.round(iconSize * 0.7) + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(icon, iconX, iconY);
        const textX = sx + iconSize + 12 * s;
        ctx.textAlign = 'left';
        ctx.fillStyle = nameColor;
        ctx.font = fontB(W, 10);
        ctx.fillText(name, textX, sy + 22 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = font(W, 8);
        ctx.fillText(subtitle, textX, sy + 34 * s);
      }
      // Notification badge top-right of card when not using best
      if (notBest) {
        const bR = 7 * s;
        const bX = sx + colW - 5 * s;
        const bY = sy + 5 * s;
        ctx.fillStyle = '#0a0a2e';
        ctx.beginPath(); ctx.arc(bX, bY, bR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bX, bY, bR, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold ' + Math.round(10 * s) + 'px "Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', bX, bY);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = font(W, 10);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.label + ' Empty', sx + colW / 2, sy + slotH / 2);
    }

    addClickRegion(sx, sy, colW, slotH, () => {
      selectedSlot = selectedSlot === def.slot ? null : def.slot;
      armoryScrollY = 0;
    });
  });

  // Middle column: player avatar + stats + ring buffs
  const midX = pad + colW + colGap;
  const midCx = midX + colW / 2;

  // Player avatar
  const avatarR = 20 * s;
  const avatarY = gridTop + 20 * s;
  ctx.save();
  const armorColor = RARITY_COLORS[armor.rarity] || '#00e5ff';
  ctx.shadowColor = armorColor; ctx.shadowBlur = 14 * s;
  ctx.fillStyle = armorColor;
  ctx.beginPath(); ctx.arc(midCx, avatarY, avatarR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0a2e';
  const cr = avatarR * 0.5;
  ctx.beginPath();
  ctx.moveTo(midCx, avatarY - cr);
  ctx.lineTo(midCx - cr * 0.8, avatarY + cr * 0.5);
  ctx.lineTo(midCx + cr * 0.8, avatarY + cr * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Stats
  const statsStartY = avatarY + avatarR + 14 * s;
  const statLines = [
    { label: 'ATK', value: fmt(weapon.atk * 10), color: '#e74c3c' },
    { label: 'HP',  value: fmt(armor.hp),         color: '#2ecc71' },
  ];
  statLines.forEach((st, i) => {
    const sy2 = statsStartY + i * 18 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = fontB(W, 11);
    ctx.textAlign = 'left';
    ctx.fillText(st.label, midX + 4 * s, sy2);
    ctx.fillStyle = st.color;
    ctx.font = fontB(W, 11);
    ctx.textAlign = 'right';
    ctx.fillText(st.value, midX + colW - 4 * s, sy2);
  });

  // Ring buff traits
  const traits = [];
  for (const rid of equippedRings) {
    if (!rid) continue;
    const r = getRingById(rid);
    if (r && unlockedRings.includes(rid)) traits.push(r.trait);
  }
  if (traits.length > 0) {
    const buffY = statsStartY + statLines.length * 18 * s + 8 * s;
    ctx.textAlign = 'center';
    traits.forEach((t, i) => {
      ctx.fillStyle = '#a29bfe';
      ctx.font = fontB(W, 9);
      ctx.fillText(t, midCx, buffY + i * 14 * s);
    });
  }

  // ─── Selection panel (below 3-col grid) ───
  const invTop = gridTop + 2 * (slotH + slotGap) + 6 * s;
  const contentW = W - pad * 2;

  if (selectedSlot) {
    // Build list of items for the selected slot
    let items = []; // { icon, name, subtitle, isCurrent, action }
    const isRingSlot = selectedSlot === 'ring1' || selectedSlot === 'ring2';
    const ringSlotIdx = selectedSlot === 'ring1' ? 0 : selectedSlot === 'ring2' ? 1 : -1;
    const otherRingSlot = ringSlotIdx === 0 ? 1 : ringSlotIdx === 1 ? 0 : -1;
    const otherRingId = otherRingSlot >= 0 ? equippedRings[otherRingSlot] : null;

    if (selectedSlot === 'weapon') {
      for (let lvl = equipLvl; lvl >= 1; lvl--) {
        const w = getWeapon(lvl);
        items.push({
          icon: w.icon, name: w.name, pills: ['Lv.' + lvl, 'ATK ' + fmt(w.atk * 10)],
          nameColor: RARITY_COLORS[w.rarity] || '#fff',
          isCurrent: lvl === chosenWpn, isOther: false,
          action: () => { setChosenWeaponLvl(lvl); sfxEquip(); }
        });
      }
    } else if (selectedSlot === 'armor') {
      for (let lvl = equipLvl; lvl >= 1; lvl--) {
        const a = getArmor(lvl);
        items.push({
          icon: a.icon, name: a.name, pills: ['Lv.' + lvl, 'HP ' + fmt(a.hp)],
          nameColor: RARITY_COLORS[a.rarity] || '#fff',
          isCurrent: lvl === chosenArm, isOther: false,
          action: () => { setChosenArmorLvl(lvl); sfxEquip(); }
        });
      }
    } else if (isRingSlot) {
      // All rings: owned ones can be equipped, unowned can be bought
      const coins = getCoins();
      for (const ring of RINGS) {
        const owned = unlockedRings.includes(ring.id);
        const isCurrent = equippedRings[ringSlotIdx] === ring.id;
        const isOther = otherRingId === ring.id;
        items.push({
          icon: ring.icon, name: ring.name, pills: [ring.trait],
          isCurrent, isOther, owned, cost: ring.cost, canAfford: coins >= ring.cost, ringId: ring.id,
          action: owned ? () => {
            if (isCurrent) {
              setEquippedRing(ringSlotIdx, null);
            } else if (!isOther) {
              setEquippedRing(ringSlotIdx, ring.id);
            }
            sfxEquip();
          } : null,
          buyAction: !owned && coins >= ring.cost ? () => {
            if (buyRing(ring.id, getUnlockedRings())) {
              unlockRing(ring.id);
              sfxEquip();
            }
          } : null,
        });
      }
    }

    // Header
    const slotLabel = slotDefs.find(d => d.slot === selectedSlot)?.label || selectedSlot;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = fontB(W, 12);
    ctx.textAlign = 'center';
    ctx.fillText('Select ' + slotLabel, W / 2, invTop);

    const itemH = 52 * s;
    const listTop = invTop + 16 * s;
    const listBottom = bottomBarTop - 12 * s;
    const visibleH = listBottom - listTop;
    const totalContentH = items.length * itemH;
    const maxScroll = Math.max(0, totalContentH - visibleH);
    if (armoryScrollY > maxScroll) armoryScrollY = maxScroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listTop, W, visibleH);
    ctx.clip();

    items.forEach((item, idx) => {
      const iy = listTop + idx * itemH - armoryScrollY;
      if (iy + itemH < listTop - 5 || iy > listBottom + 5) return;

      const invW = contentW;

      ctx.fillStyle = item.isCurrent ? 'rgba(108,92,231,0.3)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.roundRect(pad, iy, invW, itemH - 4 * s, 8 * s); ctx.fill();
      if (item.isCurrent) {
        ctx.strokeStyle = '#a29bfe';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(pad, iy, invW, itemH - 4 * s, 8 * s); ctx.stroke();
      }

      ctx.globalAlpha = item.isOther ? 0.45 : (item.owned === false ? 0.5 : 1);

      // Icon
      ctx.font = font(W, 18);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(item.icon, pad + 10 * s, iy + itemH / 2 - 2 * s);

      // Name + pills (two lines)
      const lineGap = 14 * s;
      const topLineY = iy + itemH / 2 - lineGap / 2;
      const pillY = iy + itemH / 2 + lineGap / 2;

      ctx.fillStyle = item.nameColor || '#a29bfe';
      ctx.font = fontB(W, 12);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(item.name, pad + 34 * s, topLineY);

      // Stat pills
      const pillH2 = 14 * s;
      const pillR2 = pillH2 / 2;
      const pillPadX2 = 6 * s;
      const pillGap2 = 3 * s;
      ctx.font = font(W, 9);
      let px2 = pad + 34 * s;
      const highlighted = item.isCurrent;
      for (const label of (item.pills || [])) {
        const tw2 = ctx.measureText(label).width;
        const pw2 = tw2 + pillPadX2 * 2;
        if (px2 + pw2 > pad + contentW - 70 * s) break;
        ctx.fillStyle = highlighted ? 'rgba(162,155,254,0.2)' : 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.roundRect(px2, pillY - pillH2 / 2, pw2, pillH2, pillR2); ctx.fill();
        ctx.fillStyle = highlighted ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, px2 + pw2 / 2, pillY);
        ctx.textAlign = 'left';
        px2 += pw2 + pillGap2;
      }

      // Right side
      if (item.isCurrent) {
        const eqLabel = 'EQUIPPED';
        ctx.font = fontB(W, 10);
        const eqW = ctx.measureText(eqLabel).width + 14 * s;
        const eqH = 18 * s;
        const eqX = pad + invW - eqW - 6 * s;
        const eqY = iy + itemH / 2 - eqH / 2 - 2 * s;
        ctx.fillStyle = 'rgba(108,92,231,0.3)';
        ctx.beginPath(); ctx.roundRect(eqX, eqY, eqW, eqH, eqH / 2); ctx.fill();
        ctx.fillStyle = '#a29bfe';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(eqLabel, eqX + eqW / 2, eqY + eqH / 2);
      } else if (idx === 0 && !item.isCurrent && !isRingSlot) {
        // Best available but not equipped — show ! badge
        const bR2 = 9 * s;
        const bX2 = pad + invW - bR2 - 6 * s;
        const bY3 = iy + itemH / 2 - 2 * s;
        ctx.fillStyle = '#0a0a2e';
        ctx.beginPath(); ctx.arc(bX2, bY3, bR2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bX2, bY3, bR2, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold ' + Math.round(12 * s) + 'px "Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', bX2, bY3);
      } else if (item.isOther) {
        const label = otherRingSlot === 0 ? 'Ring 1' : 'Ring 2';
        ctx.font = fontB(W, 9);
        const rlW = ctx.measureText(label).width + 12 * s;
        const rlH = 16 * s;
        const rlX = pad + invW - rlW - 6 * s;
        const rlY = iy + itemH / 2 - rlH / 2 - 2 * s;
        ctx.fillStyle = 'rgba(108,92,231,0.15)';
        ctx.beginPath(); ctx.roundRect(rlX, rlY, rlW, rlH, rlH / 2); ctx.fill();
        ctx.fillStyle = 'rgba(162,155,254,0.5)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, rlX + rlW / 2, rlY + rlH / 2);
      } else if (item.buyAction) {
        // Buy button for unowned rings
        const btnW2 = 56 * s;
        const btnX2 = pad + invW - btnW2 - 4 * s;
        const btnH2 = itemH - 14 * s;
        const btnY2 = iy + 5 * s;
        ctx.fillStyle = 'rgba(46,204,113,0.25)';
        ctx.beginPath(); ctx.roundRect(btnX2, btnY2, btnW2, btnH2, 6 * s); ctx.fill();
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(btnX2, btnY2, btnW2, btnH2, 6 * s); ctx.stroke();
        ctx.fillStyle = '#2ecc71';
        ctx.font = fontB(W, 9);
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F48E}' + fmt(item.cost), btnX2 + btnW2 / 2, btnY2 + btnH2 / 2);
        addClickRegion(btnX2, btnY2, btnW2, btnH2, item.buyAction);
      } else if (item.owned === false) {
        // Unaffordable ring: show cost dimmed
        const btnW2 = 56 * s;
        const btnX2 = pad + invW - btnW2 - 4 * s;
        const btnH2 = itemH - 14 * s;
        const btnY2 = iy + 5 * s;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath(); ctx.roundRect(btnX2, btnY2, btnW2, btnH2, 6 * s); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = fontB(W, 9);
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F48E}' + fmt(item.cost), btnX2 + btnW2 / 2, btnY2 + btnH2 / 2);
      }

      ctx.globalAlpha = 1;

      // Click to equip (for weapons/armor, and owned rings not in other slot)
      if (item.action && !item.isOther) {
        const clickW = (item.buyAction || item.owned === false) ? invW - 60 * s : invW;
        addClickRegion(pad, iy, clickW, itemH - 4 * s, item.action);
      }
    });

    ctx.restore(); // clip

    // Scrollbar
    if (totalContentH > visibleH) {
      const scrollBarH = Math.max(20 * s, visibleH * (visibleH / totalContentH));
      const scrollBarY = listTop + (armoryScrollY / (totalContentH - visibleH)) * (visibleH - scrollBarH);
      const clampedBarH = Math.min(scrollBarH, listBottom - scrollBarY);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.roundRect(W - 8 * s, scrollBarY, 4 * s, clampedBarH, 2 * s); ctx.fill();
    }
  } else {
    // No slot selected hint
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = font(W, 12);
    ctx.textAlign = 'center';
    ctx.fillText('Tap a slot to change gear', W / 2, invTop + 20 * s);
  }

  endContentDraw(ctx, sliding);
  drawBottomNav(ctx, W, H, 'equip', bar);
}

// ========== MAP / CHAPTER SELECT SCREEN ==========

const CHAPTER_ICONS = [
  '\u{1F331}', '\u{1F33F}', '\u{1F3DC}\uFE0F', '\u{1F3DA}\uFE0F', '\u{1F48E}',
  '\u{1F3F0}', '\u{1F9B4}', '\u{1F311}', '\u{1F41D}', '\u{2744}\uFE0F', '\u{1F525}',
];

const CHAPTER_COLORS = [
  '#4CAF50', '#66BB6A', '#FF9800', '#5C6BC0', '#26C6DA',
  '#7E57C2', '#8D6E63', '#37474F', '#FDD835', '#42A5F5', '#EF5350',
];

// Smooth animated position (fractional chapter index)
let mapAnimPos = -1;   // current animated position (-1 = uninitialised)
let mapSwipeDrag = 0;  // accumulated drag pixels during active touch

export function handleMapSwipe(deltaX) {
  mapSwipeDrag += deltaX;
}

export function resetMapSwipe() {
  // Touch ended - snap to nearest chapter from drag
  const W = innerWidth;
  const dragChapters = mapSwipeDrag / (W * 0.4); // how many chapters the drag covers
  const target = game.chapter + dragChapters;
  const snapped = clamp(Math.round(target), 0, TOTAL_CHAPTERS);
  game.chapter = snapped;
  mapSwipeDrag = 0;
}

function drawChapterCard(ctx, W, H, chIdx, cardX, cardTop, cardW, cardH, r, s, chaptersCleared, lastRun) {
  const ch = CHAPTERS[chIdx];
  const isLocked = chIdx > chaptersCleared + 1;
  const chColor = CHAPTER_COLORS[chIdx] || '#666';

  ctx.save();
  ctx.beginPath(); ctx.roundRect(cardX, cardTop, cardW, cardH, r); ctx.clip();

  // Card background
  const cardGrad = ctx.createLinearGradient(cardX, cardTop, cardX, cardTop + cardH);
  cardGrad.addColorStop(0, 'rgba(20,20,60,0.9)');
  cardGrad.addColorStop(0.5, 'rgba(20,20,60,0.7)');
  cardGrad.addColorStop(1, 'rgba(20,20,60,0.9)');
  ctx.fillStyle = cardGrad;
  ctx.fillRect(cardX, cardTop, cardW, cardH);

  // Image area (top half)
  const imgH = cardH * 0.48;
  const imgGrad = ctx.createLinearGradient(cardX, cardTop, cardX + cardW, cardTop + imgH);
  imgGrad.addColorStop(0, chColor + (isLocked ? '20' : '40'));
  imgGrad.addColorStop(1, chColor + (isLocked ? '10' : '20'));
  ctx.fillStyle = imgGrad;
  ctx.fillRect(cardX, cardTop, cardW, imgH);

  // Large icon (lock for locked, chapter icon for unlocked)
  const iconSize = Math.min(cardW, imgH) * 0.4;
  ctx.font = Math.round(iconSize) + 'px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = isLocked ? 0.35 : 0.8;
  ctx.fillText(isLocked ? '\u{1F512}' : (CHAPTER_ICONS[chIdx] || '\u2753'), cardX + cardW / 2, cardTop + imgH / 2);
  ctx.globalAlpha = 1;

  // Divider
  ctx.strokeStyle = chColor + (isLocked ? '30' : '60');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX, cardTop + imgH);
  ctx.lineTo(cardX + cardW, cardTop + imgH);
  ctx.stroke();

  // Chapter info
  const infoY = cardTop + imgH + 16 * s;

  // Chapter number badge
  ctx.fillStyle = isLocked ? (chColor + '60') : chColor;
  const badgeW = 90 * s;
  const badgeH = 24 * s;
  const badgeX2 = cardX + (cardW - badgeW) / 2;
  ctx.beginPath(); ctx.roundRect(badgeX2, infoY, badgeW, badgeH, 12 * s); ctx.fill();
  ctx.fillStyle = isLocked ? 'rgba(255,255,255,0.5)' : '#fff';
  ctx.font = fontB(W, 12);
  ctx.fillText(chIdx === 0 ? 'Tutorial' : 'Chapter ' + chIdx, cardX + cardW / 2, infoY + badgeH / 2);

  if (isLocked) {
    // Locked: unlock requirement where name would be
    const nameY = infoY + badgeH + 20 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = fontB(W, 16);
    const prevName = chIdx === 1 ? 'Tutorial' : 'Chapter ' + (chIdx - 1);
    ctx.fillText('Clear ' + prevName, cardX + cardW / 2, nameY);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = font(W, 13);
    ctx.fillText('to unlock', cardX + cardW / 2, nameY + 24 * s);
  } else {
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 20);
    const nameY = infoY + badgeH + 20 * s;
    ctx.fillText(ch?.name || 'Unknown', cardX + cardW / 2, nameY);

    // Description
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = font(W, 13);
    const descY = nameY + 24 * s;
    ctx.fillText(ch?.desc || '', cardX + cardW / 2, descY);

    // Stage count
    const stageCount = getChapterStages(chIdx);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = font(W, 11);
    ctx.fillText(stageCount + ' stages', cardX + cardW / 2, descY + 22 * s);

    // Check for saved progress on this chapter
    const hasSave = lastRun && lastRun.chapter === chIdx;
    const continueStage = hasSave ? lastRun.stage + 1 : 0;

    // Main action button
    const goBtnW = cardW * 0.55;
    const goBtnH = 34 * s;
    const goBtnX = cardX + (cardW - goBtnW) / 2;
    const goBtnY = descY + 46 * s;
    const goGrad = ctx.createLinearGradient(goBtnX, goBtnY, goBtnX + goBtnW, goBtnY + goBtnH);
    goGrad.addColorStop(0, '#ffd700'); goGrad.addColorStop(1, '#f0b800');
    ctx.fillStyle = goGrad;
    ctx.beginPath(); ctx.roundRect(goBtnX, goBtnY, goBtnW, goBtnH, 10 * s); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = fontB(W, hasSave ? 12 : 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hasSave ? 'Continue from Stage ' + continueStage : "Let's Go!", goBtnX + goBtnW / 2, goBtnY + goBtnH / 2);

    // "Start again" link (below main button, only when save exists)
    if (hasSave) {
      const restartY = goBtnY + goBtnH + 12 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = font(W, 10);
      ctx.textAlign = 'center';
      ctx.fillText('Start again', cardX + cardW / 2, restartY);
      // Underline
      const tw = ctx.measureText('Start again').width;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + cardW / 2 - tw / 2, restartY + 6 * s);
      ctx.lineTo(cardX + cardW / 2 + tw / 2, restartY + 6 * s);
      ctx.stroke();
    }

    // Cleared badge
    if (chIdx <= chaptersCleared) {
      const cBadgeW = 80 * s;
      const cBadgeH = 24 * s;
      const cBadgeX = cardX + (cardW - cBadgeW) / 2;
      const cBadgeY = hasSave ? goBtnY + goBtnH + 30 * s : goBtnY + goBtnH + 10 * s;
      ctx.fillStyle = 'rgba(46,204,113,0.15)';
      ctx.beginPath(); ctx.roundRect(cBadgeX, cBadgeY, cBadgeW, cBadgeH, 8 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(46,204,113,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(cBadgeX, cBadgeY, cBadgeW, cBadgeH, 8 * s); ctx.stroke();
      ctx.fillStyle = '#2ecc71';
      ctx.font = fontB(W, 10);
      ctx.fillText('\u2714 Cleared', cardX + cardW / 2, cBadgeY + cBadgeH / 2);
    }
  }

  ctx.restore(); // clip

  // Card border
  ctx.strokeStyle = isLocked ? 'rgba(255,255,255,0.08)' : chColor + '80';
  ctx.lineWidth = isLocked ? 1 : 2;
  ctx.beginPath(); ctx.roundRect(cardX, cardTop, cardW, cardH, r); ctx.stroke();
}

export function drawMapScreen(ctx, W, H) {
  clearClickRegions();
  const bar = beginScreenDraw(ctx, W, H);
  const { sliding, bottomBarTop, s, pad } = bar;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#141452');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = 36 * s;
  ctx.fillText('Choose Your Path', W / 2, titleY);

  const chaptersCleared = getChaptersCleared();
  const lastRun = getLastRun();

  // Animated position: lerp towards target chapter + drag offset
  if (mapAnimPos < 0) mapAnimPos = game.chapter;
  const dragOffset = mapSwipeDrag / (W * 0.4);
  const target = game.chapter + dragOffset;
  const lerpSpeed = mapSwipeDrag !== 0 ? 0.5 : 0.12;
  mapAnimPos += (target - mapAnimPos) * lerpSpeed;
  // Clamp animation range
  mapAnimPos = clamp(mapAnimPos, -0.3, TOTAL_CHAPTERS + 0.3);

  // Card area
  const cardTop = titleY + 30 * s;
  const cardBottom = bottomBarTop - 22 * s;
  const cardH = cardBottom - cardTop;
  const cardW = W - pad * 2 - 50 * s;
  const cardCenterX = W / 2;
  const cardSpacing = cardW + 16 * s;
  const r = 14 * s;

  // Draw visible chapter cards (current + neighbours)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cardTop - 4, W, cardH + 8);
  ctx.clip();

  const baseChapter = Math.round(mapAnimPos);
  for (let offset = -1; offset <= 1; offset++) {
    const chIdx = baseChapter + offset;
    if (chIdx < 0 || chIdx > TOTAL_CHAPTERS) continue;

    const slideX = (chIdx - mapAnimPos) * cardSpacing;
    const cx = cardCenterX + slideX - cardW / 2;

    // Skip if fully off-screen
    if (cx + cardW < -20 || cx > W + 20) continue;

    // Scale and fade cards that are off-centre
    const distFromCenter = Math.abs(chIdx - mapAnimPos);
    const cardScale = 1 - distFromCenter * 0.08;
    const cardAlpha = 1 - distFromCenter * 0.4;

    ctx.save();
    ctx.globalAlpha = clamp(cardAlpha, 0, 1);
    // Scale from centre of card
    const scaleCx = cx + cardW / 2;
    const scaleCy = cardTop + cardH / 2;
    ctx.translate(scaleCx, scaleCy);
    ctx.scale(cardScale, cardScale);
    ctx.translate(-scaleCx, -scaleCy);

    drawChapterCard(ctx, W, H, chIdx, cx, cardTop, cardW, cardH, r, s, chaptersCleared, lastRun);

    ctx.restore();
  }

  ctx.restore(); // clip

  // Click regions for current chapter card buttons
  {
    const isUnlocked = game.chapter <= chaptersCleared + 1;
    if (isUnlocked) {
      const cx = cardCenterX - cardW / 2;
      const imgH = cardH * 0.48;
      const infoY = cardTop + imgH + 16 * s;
      const badgeH = 24 * s;
      const nameY = infoY + badgeH + 20 * s;
      const descY = nameY + 24 * s;
      const goBtnW = cardW * 0.55;
      const goBtnH = 34 * s;
      const goBtnX = cx + (cardW - goBtnW) / 2;
      const goBtnY = descY + 46 * s;
      const hasSave = lastRun && lastRun.chapter === game.chapter;

      // Main button: continue or start fresh
      addClickRegion(goBtnX, goBtnY, goBtnW, goBtnH, () => {
        if (hasSave) {
          game._continueFromStage = lastRun.stage;
        }
        game.startRun = true;
      });

      // "Start again" link (wider hit area for easy tapping)
      if (hasSave) {
        const restartY = goBtnY + goBtnH + 2 * s;
        const restartH = 26 * s;
        const restartW = cardW * 0.6;
        const restartX = cx + (cardW - restartW) / 2;
        addClickRegion(restartX, restartY, restartW, restartH, () => {
          clearLastRun();
          game.startRun = true;
        });
      }
    }
  }

  // Left/right arrows
  const arrowY = cardTop + cardH / 2;
  const canPrev = game.chapter > 0;
  const canNext = game.chapter < TOTAL_CHAPTERS;

  ctx.font = fontB(W, 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = canPrev ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)';
  ctx.fillText('\u25C0', pad + 10 * s, arrowY);
  if (canPrev) {
    addClickRegion(0, cardTop, pad + 25 * s, cardH, () => { game.chapter--; });
  }

  ctx.fillStyle = canNext ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)';
  ctx.fillText('\u25B6', W - pad - 10 * s, arrowY);
  if (canNext) {
    addClickRegion(W - pad - 25 * s, cardTop, pad + 25 * s, cardH, () => { game.chapter++; });
  }

  // Chapter dots
  const dotY = cardBottom + 10 * s;
  const dotR2 = 3 * s;
  const dotGap = 10 * s;
  const dotsW = (TOTAL_CHAPTERS + 1) * dotGap;
  const dotsStartX = (W - dotsW) / 2 + dotGap / 2;
  for (let i = 0; i <= TOTAL_CHAPTERS; i++) {
    const dx = dotsStartX + i * dotGap;
    const isCurrent = i === game.chapter;
    const dotLocked = i > chaptersCleared + 1;
    ctx.fillStyle = isCurrent ? '#fff' : dotLocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(dx, dotY, isCurrent ? dotR2 * 1.4 : dotR2, 0, Math.PI * 2);
    ctx.fill();
  }

  endContentDraw(ctx, sliding);
  drawBottomNav(ctx, W, H, 'map', bar);
}

// ========== LEVEL UP SCREEN ==========
export function drawLevelUpScreen(ctx, W, H) {
  clearClickRegions();
  const s = sc(W);

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, H);

  const src = game._levelUpSource;
  const glowColor = src === 'angel' ? '#ffeaa7' : '#a29bfe';
  const title = src === 'angel' ? 'You found an Angel!' : 'Level Up!';
  const subtitle = src === 'angel' ? 'Choose a blessing' : 'Level ' + game.player.level;

  ctx.save();
  ctx.shadowColor = glowColor; ctx.shadowBlur = 25;
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 36);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, W / 2, H * 0.22);
  ctx.restore();

  ctx.fillStyle = glowColor;
  ctx.font = fontB(W, 20);
  ctx.textAlign = 'center';
  ctx.fillText(subtitle, W / 2, H * 0.22 + 36 * s);

  const numChoices = game.levelUpChoices.length || 3;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = font(W, 13);
  ctx.fillText('Choose an upgrade', W / 2, H * 0.22 + 60 * s);

  const pad = 16 * s;
  const cardGap = 10 * s;
  const cardW = (W - pad * 2 - cardGap * (numChoices - 1)) / numChoices;
  const cardH = 220 * s;
  const cardY = H * 0.38;

  game.levelUpChoices.forEach((skill, idx) => {
    const cx = pad + idx * (cardW + cardGap);
    const stacks = game.player.skills[skill.id] || 0;

    ctx.fillStyle = 'rgba(108,92,231,0.25)';
    ctx.beginPath(); ctx.roundRect(cx, cardY, cardW, cardH, 12 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(162,155,254,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cx, cardY, cardW, cardH, 12 * s); ctx.stroke();

    // Icon - fills most of card width
    const iconSize = cardW * 0.55;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    drawSkillIcon(ctx, skill, cx + cardW / 2, cardY + 12 * s + iconSize / 2, iconSize);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = fontB(W, 14);
    ctx.fillText(skill.name, cx + cardW / 2, cardY + iconSize + 26 * s);

    // Wrapped description
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(W, 11);
    const descLines = wrapText(ctx, skill.desc, cardW - 14 * s);
    const lineH = 14 * s;
    descLines.forEach((line, li) => {
      ctx.fillText(line, cx + cardW / 2, cardY + iconSize + 44 * s + li * lineH);
    });

    // Stack indicators [1][2][3] style (skip for unlimited stacks like Heal)
    if (skill.maxStacks > 1 && skill.maxStacks <= 10) {
      const maxS = skill.maxStacks;
      const fontSize = maxS <= 5 ? 8 : 6;
      const grpH = (maxS <= 5 ? 16 : 13) * s;
      const grpY2 = cardY + iconSize + 44 * s + descLines.length * lineH + 4 * s;
      const bPad2 = (maxS <= 5 ? 5 : 3) * s;
      const bGap2 = (maxS <= 5 ? 2 : 1.5) * s;
      const bR2 = 3 * s;
      ctx.font = fontB(W, fontSize);
      const bWidths = [];
      for (let n = 1; n <= maxS; n++) bWidths.push(ctx.measureText('' + n).width + bPad2 * 2);
      const totalW2 = bWidths.reduce((a, b) => a + b, 0) + bGap2 * (maxS - 1);
      let bx2 = cx + (cardW - totalW2) / 2;
      for (let i = 0; i < maxS; i++) {
        const bw = bWidths[i];
        const isSel = i < stacks;
        ctx.fillStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.roundRect(bx2, grpY2, bw, grpH, bR2); ctx.fill();
        ctx.strokeStyle = isSel ? '#a29bfe' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx2, grpY2, bw, grpH, bR2); ctx.stroke();
        ctx.fillStyle = isSel ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('' + (i + 1), bx2 + bw / 2, grpY2 + grpH / 2);
        bx2 += bw + bGap2;
      }
    }

    addClickRegion(cx, cardY, cardW, cardH, () => {
      sfxSkillPick();
      pickSkill(idx);
    });
  });
}

// ========== STAGE CLEAR ==========
export function drawStageClear(ctx, W, H) {
  const s = sc(W);
  ctx.save();
  ctx.shadowColor = '#ffd32a'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffd32a';
  ctx.font = fontB(W, 30);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Stage ' + game.stage + ' Clear!', W / 2, H / 2);
  ctx.restore();

}

// ========== CHAPTER CLEAR ==========
export function drawChapterClear(ctx, W, H) {
  clearClickRegions();
  const s = sc(W);
  const pad = 16 * s;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);

  const ch = CHAPTERS[game.chapter];

  ctx.save();
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffd700';
  ctx.font = fontB(W, 34);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(game.chapter === 0 ? 'Tutorial Complete!' : 'Chapter ' + game.chapter + ' Complete!', W / 2, H * 0.28);
  ctx.restore();

  if (ch) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = font(W, 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch.name, W / 2, H * 0.28 + 38 * s);
  }

  let contentY = H * 0.44;

  ctx.fillStyle = '#a29bfe';
  ctx.font = fontB(W, 17);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('\u{1F48E} ' + fmt(game.runCoins) + ' gems earned', W / 2, contentY);
  contentY += 34 * s;

  // Show new weapon/armor level
  const newLvl = Math.min(game.chapter + 1, 10);
  const newWeapon = getWeapon(newLvl);
  const newArmor = getArmor(newLvl);
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 14);
  ctx.fillText('Lv.' + newLvl + ' equipment unlocked!', W / 2, contentY);
  contentY += 26 * s;
  ctx.fillStyle = '#e74c3c';
  ctx.font = font(W, 13);
  ctx.fillText(newWeapon.icon + ' ' + newWeapon.name + '  \u00B7  ATK ' + fmt(newWeapon.atk * 10), W / 2, contentY);
  contentY += 22 * s;
  ctx.fillStyle = '#2ecc71';
  ctx.fillText(newArmor.icon + ' ' + newArmor.name + '  \u00B7  HP ' + fmt(newArmor.hp), W / 2, contentY);
  contentY += 30 * s;

  // Reminder to equip
  ctx.fillStyle = '#ffd700';
  ctx.font = fontB(W, 13);
  ctx.fillText('Don\'t forget to equip your new gear!', W / 2, contentY);
  contentY += 22 * s;

  const btnW = W - pad * 2, btnH = 52 * s;
  const btnY = Math.max(contentY + 20 * s, H * 0.70);
  const btnX = pad;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnGrad.addColorStop(0, '#ffd700'); btnGrad.addColorStop(1, '#f39c12');
  ctx.fillStyle = btnGrad;
  ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 14 * s); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = fontB(W, 18);
  ctx.fillText('Continue', W / 2, btnY + btnH / 2);
  addClickRegion(btnX, btnY, btnW, btnH, () => { game.continueFromChapter = true; });
}

// ========== GAME OVER ==========
export function drawGameOver(ctx, W, H) {
  clearClickRegions();
  const s = sc(W);
  const pad = 16 * s;

  // Fade in over 0.5s
  if (!game._deadFadeTimer) game._deadFadeTimer = 0;
  game._deadFadeTimer = Math.min(game._deadFadeTimer + 1 / 60, 0.5);
  const fadeAlpha = Math.min(game._deadFadeTimer / 0.5, 1);

  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = '#e74c3c'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 42);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Oh no!', W / 2, H * 0.30);
  ctx.restore();

  ctx.fillStyle = '#ffd32a';
  ctx.font = fontB(W, 22);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Ch.' + game.chapter + ' Stage ' + game.stage + '  \u00B7  Level ' + game.player.level, W / 2, H * 0.30 + 44 * s);

  ctx.fillStyle = '#a29bfe';
  ctx.font = fontB(W, 17);
  ctx.fillText('\u{1F48E} ' + fmt(game.runCoins) + ' gems earned', W / 2, H * 0.30 + 78 * s);

  const btnW = W - pad * 2, btnH = 48 * s;
  const bx = pad;
  const gap = 12 * s;

  // Retry button (retry current stage)
  const retryY = H * 0.68;
  const retryGrad = ctx.createLinearGradient(bx, retryY, bx + btnW, retryY + btnH);
  retryGrad.addColorStop(0, '#e67e22'); retryGrad.addColorStop(1, '#d35400');
  ctx.fillStyle = retryGrad;
  ctx.beginPath(); ctx.roundRect(bx, retryY, btnW, btnH, 14 * s); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 16);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Retry Stage ' + game.stage, W / 2, retryY + btnH / 2);
  addClickRegion(bx, retryY, btnW, btnH, () => { game.retryRun = true; });

  // Back to Armoury button
  const armoryY = retryY + btnH + gap;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(bx, armoryY, btnW, btnH, 14 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, armoryY, btnW, btnH, 14 * s); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 16);
  ctx.fillText('Back to Armoury', W / 2, armoryY + btnH / 2);
  addClickRegion(bx, armoryY, btnW, btnH, () => { game.returnToEquip = true; });

  ctx.restore(); // fade alpha
}

// ========== SKILL INFO SCREEN ==========
let skillScrollY = 0;

// Pre-compute category layout: array of { type: 'header'|'skill', category, skill, height }
function buildSkillLayout(s) {
  const headerH = 28 * s;
  const cardH = 58 * s;
  const cardGap = 4 * s;
  const catGap = 10 * s;
  const items = [];
  for (const cat of SKILL_CATEGORIES) {
    const catSkills = ALL_SKILLS.filter(sk => sk.category === cat);
    if (catSkills.length === 0) continue;
    items.push({ type: 'header', category: cat, height: headerH + catGap });
    for (const skill of catSkills) {
      items.push({ type: 'skill', skill, height: cardH + cardGap });
    }
  }
  return items;
}

function getSkillLayoutTotalHeight(s) {
  const layout = buildSkillLayout(s);
  let total = 0;
  for (const item of layout) total += item.height;
  return total;
}

export function drawSkillInfoScreen(ctx, W, H) {
  clearClickRegions();
  const bar = beginScreenDraw(ctx, W, H);
  const { sliding, bottomBarTop, s, pad } = bar;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a2e');
  grad.addColorStop(1, '#141452');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = fontB(W, 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = 40 * s;
  ctx.fillText('Skills', W / 2, titleY);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = font(W, 11);
  ctx.fillText('Earned during runs on level up. Reset each run.', W / 2, titleY + 22 * s);

  // Layout
  const cardW = W - pad * 2;
  const cardH = 58 * s;
  const startX = pad;
  const startY = titleY + 44 * s;
  const currentChapter = game.chapter;
  const layout = buildSkillLayout(s);

  // Category header colors
  const catColors = {
    Arrow: '#00e5ff', Elemental: '#ff6b6b', Explosive: '#ff9f43', Boost: '#ffd32a',
    Plus: '#a29bfe', Aura: '#2ecc71', Shield: '#3498db', Health: '#e74c3c',
    Circle: '#fd79a8', Sword: '#fdcb6e', Strike: '#6c5ce7', Star: '#00cec9',
    Meteor: '#e17055', Scaling: '#74b9ff', Other: '#dfe6e9'
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, startY - 4, W, bottomBarTop - startY + 4);
  ctx.clip();

  let curY = startY - skillScrollY;
  for (const item of layout) {
    const itemBottom = curY + item.height;

    // Skip if off-screen
    if (itemBottom < startY - 10 || curY > bottomBarTop + 10) {
      curY += item.height;
      continue;
    }

    if (item.type === 'header') {
      // Category header line
      const catIcon = CATEGORY_ICONS[item.category] || '';
      const headerText = catIcon + ' ' + item.category;
      const headerY = curY + 16 * s;

      // Draw line
      ctx.strokeStyle = catColors[item.category] || 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;

      ctx.font = fontB(W, 13);
      ctx.textAlign = 'left';
      const textW = ctx.measureText(headerText).width;

      ctx.beginPath();
      ctx.moveTo(startX, headerY);
      ctx.lineTo(startX + textW + 12 * s, headerY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(startX + textW + 18 * s, headerY);
      ctx.lineTo(startX + cardW, headerY);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = catColors[item.category] || '#fff';
      ctx.font = fontB(W, 13);
      ctx.textAlign = 'left';
      ctx.fillText(headerText, startX + 2 * s, headerY);

    } else {
      // Skill card — shared rendering
      const skill = item.skill;
      const unlocked = currentChapter >= (skill.unlockChapter || 1);

      drawSkillCard(ctx, {
        skill, x: startX, y: curY, w: cardW, h: cardH, s, W,
        stacks: 0, isDebug: false, unlocked
      });
    }

    curY += item.height;
  }

  ctx.restore(); // clip

  // Scrollbar
  const totalHeight = getSkillLayoutTotalHeight(s);
  const visibleHeight = bottomBarTop - startY;
  if (totalHeight > visibleHeight) {
    const scrollBarH = Math.max(30 * s, visibleHeight * (visibleHeight / totalHeight));
    const scrollBarY = startY + (skillScrollY / (totalHeight - visibleHeight)) * (visibleHeight - scrollBarH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(W - 8 * s, scrollBarY, 4 * s, scrollBarH, 2 * s); ctx.fill();
  }

  endContentDraw(ctx, sliding);
  drawBottomNav(ctx, W, H, 'skillInfo', bar);
}

export function handleSkillInfoScroll(deltaY) {
  const s = sc(innerWidth);
  const titleY = 40 * s;
  const startY = titleY + 44 * s;
  const btnH = 40 * s;
  const bottomBarTop = innerHeight - btnH - 12 * s - 8 * s;
  const totalHeight = getSkillLayoutTotalHeight(s);
  const visibleHeight = bottomBarTop - startY;
  const maxScroll = Math.max(0, totalHeight - visibleHeight);
  skillScrollY = clamp(skillScrollY + deltaY, 0, maxScroll);
}
