import { game } from './state.js';
import { PLAYER_R, PLAYER_BASE_SPEED, CRYSTAL_R, BULLET_R, ENEMY_BULLET_R, STAGES_PER_CHAPTER, TOTAL_CHAPTERS, BULLET_SPEED, BASE_SHOOT_CD } from './constants.js';
import { dist, clamp, pushOutRect, fmt, dmgVar } from './utils.js';
import { arena, T } from './arena.js';
import { ensureAudio, sfxStageClear, sfxGameOver, sfxChapterClear, sfxPlayerHit } from './audio.js';
import { saveBest, saveCoins, getCoins, saveChaptersCleared, getChaptersCleared, loadDebug, saveLastRun, clearLastRun, getLastRun } from './storage.js';
import { setupInput, getInput, setupLevelUpKeys, getJoystick } from './input.js';
import { drawShape, drawBar, drawArena } from './draw.js';
import { spawnParticles, spawnDmgNumber, updateParticles, drawParticles, updateBoltArcs, drawBoltArcs } from './particles.js';
import { createPlayer } from './player.js';
import { updateShooting, updateBullets } from './bullets.js';
import { updateCrystals, magnetAllCrystals } from './crystals.js';
import { updateHearts, magnetAllHearts } from './hearts.js';
import { updateEnemies, spawnEnemyAt } from './enemies.js';
import { pickSkill, rollSkillChoices, processPendingLevelUps, flushPendingXP, applyPlusBonuses, activateAuras, tickAuraRooms, rebuildPlayerFromSkills } from './skills.js';
import { CHAPTERS, CHAPTER_THEMES, getChapterStages, pickRandomEnemy, getStageScale } from './chapters.js';
import { loadMapData, pickStageMap, parseStageMap, resetUsedMaps } from './mapData.js';
import { drawHUD, drawPauseScreen, getPauseBtnRect, handlePauseClick, resetPauseScroll, handlePauseScroll } from './hud.js';
import { drawEquipScreen, drawMapScreen, drawLevelUpScreen, drawChapterClear, drawGameOver, drawSkillInfoScreen, handleClick, clearClickRegions, handleSkillInfoScroll, handleArmoryScroll, handleMapSwipe, resetMapSwipe } from './screens.js';
import { initOrbitals, rebuildOrbitals, updateOrbitals, drawOrbitals } from './orbitals.js';
import { resetSummonTimers, updateSummons, drawSummons } from './summons.js';
import { preloadIcons } from './icons.js';
import { drawEnemy, drawAngel } from './enemyDraw.js';
import { getEnemyType } from './enemyTypes.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('playBtn');

let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize();
window.addEventListener('resize', resize);

setupInput(canvas);
setupLevelUpKeys(pickSkill);
preloadIcons();

// Load map data (starts immediately, awaited before first run)
const mapReady = loadMapData();

// Pointer handlers for screen clicks - only register taps, not drag releases
let _tapStartX = 0, _tapStartY = 0, _tapStartTime = 0, _tapPointerId = null;
canvas.addEventListener('pointerdown', e => {
  if (game.state === 'equip' || game.state === 'map' || game.state === 'skillInfo' || game.state === 'levelUp' || game.state === 'dead' || game.state === 'chapterClear' || game.state === 'paused' || game.state === 'playing' || game.state === 'exiting') {
    _tapStartX = e.clientX;
    _tapStartY = e.clientY;
    _tapStartTime = performance.now();
    _tapPointerId = e.pointerId;
  }
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== _tapPointerId) return;
  const dx = e.clientX - _tapStartX;
  const dy = e.clientY - _tapStartY;
  const dt = performance.now() - _tapStartTime;
  const isTap = Math.sqrt(dx * dx + dy * dy) < 20 && dt < 500;
  _tapPointerId = null;

  if (!isTap) return;

  // Pause screen: try click regions first, resume if not consumed
  if (game.state === 'paused') {
    if (!handlePauseClick(e.clientX, e.clientY)) {
      game.state = game._pausedFrom || 'playing';
      game._pausedFrom = null;
    }
    return;
  }

  // Pause button tap during gameplay
  if (game.state === 'playing' || game.state === 'exiting') {
    const btn = getPauseBtnRect();
    if (btn && e.clientX >= btn.x && e.clientX <= btn.x + btn.w && e.clientY >= btn.y && e.clientY <= btn.y + btn.h) {
      game._pausedFrom = game.state;
      game.state = 'paused';
      resetPauseScroll();
      return;
    }
  }

  // UI screen taps
  if (game.state === 'equip' || game.state === 'map' || game.state === 'skillInfo' || game.state === 'levelUp' || game.state === 'dead' || game.state === 'chapterClear') {
    handleClick(e.clientX, e.clientY);
  }
});

// Scroll for skill info + armory screens (wheel + touch drag)
canvas.addEventListener('wheel', e => {
  if (game.state === 'skillInfo') { handleSkillInfoScroll(e.deltaY); e.preventDefault(); }
  if (game.state === 'equip') { handleArmoryScroll(e.deltaY); e.preventDefault(); }
  if (game.state === 'paused') { handlePauseScroll(e.deltaY); e.preventDefault(); }
}, { passive: false });

let scrollTouchY = null;
let scrollTouchX = null;
canvas.addEventListener('touchstart', e => {
  if (game.state === 'skillInfo' || game.state === 'equip' || game.state === 'paused') scrollTouchY = e.touches[0].clientY;
  if (game.state === 'map') { scrollTouchX = e.touches[0].clientX; scrollTouchY = null; }
});
canvas.addEventListener('touchmove', e => {
  if (scrollTouchX !== null && game.state === 'map') {
    const dx = scrollTouchX - e.touches[0].clientX;
    handleMapSwipe(dx);
    scrollTouchX = e.touches[0].clientX;
    e.preventDefault();
  } else if (scrollTouchY !== null) {
    const dy = scrollTouchY - e.touches[0].clientY;
    if (game.state === 'skillInfo') handleSkillInfoScroll(dy);
    if (game.state === 'equip') handleArmoryScroll(dy);
    if (game.state === 'paused') handlePauseScroll(dy);
    scrollTouchY = e.touches[0].clientY;
    e.preventDefault();
  }
}, { passive: false });
canvas.addEventListener('touchend', () => {
  scrollTouchY = null;
  if (scrollTouchX !== null) { resetMapSwipe(); scrollTouchX = null; }
});

// Space to restart from dead, Escape to pause/resume
document.addEventListener('keydown', e => {
  if (game.state === 'dead' && e.code === 'Space') {
    game.returnToEquip = true;
  }
  if (e.code === 'Escape') {
    if (game.state === 'playing' || game.state === 'exiting') {
      game._pausedFrom = game.state;
      game.state = 'paused';
      resetPauseScroll();
    } else if (game.state === 'paused') {
      game.state = game._pausedFrom || 'playing';
      game._pausedFrom = null;
    }
  }
});

// Initialize chapter
game.chapter = Math.min(getChaptersCleared() + 1, TOTAL_CHAPTERS);

// Restore debug state
Object.assign(game.debug, loadDebug());

function initRun() {
  const continueFromStage = game._continueFromStage || 0;
  game._continueFromStage = 0;
  game.stage = continueFromStage; // nextStage() will increment
  game.runCoins = 0;
  game._retryDmgMult = 1;
  game.specialEntities = [];
  resetUsedMaps();
  createPlayer();

  // Restore skills, level, and XP from saved run if continuing
  if (continueFromStage > 0) {
    const lastRun = getLastRun();
    if (lastRun && lastRun.player) {
      const snap = lastRun.player;
      if (snap.skills) {
        game.player.skills = { ...snap.skills };
        rebuildPlayerFromSkills();
      }
      if (snap.level) game.player.level = snap.level;
      if (snap.xp !== undefined) game.player.xp = snap.xp;
      if (snap.xpToNext) game.player.xpToNext = snap.xpToNext;
    }
  }

  game.orbitals = [];
  game.strikeEffects = [];
  game.starProjectiles = [];
  game.meteorProjectiles = [];
  nextStage();
}

function nextStage() {
  game.stage++;
  const a = arena();
  const p = game.player;

  game.enemies = [];
  game.bullets = [];
  game.enemyBullets = [];
  game.crystals = [];
  game.hearts = [];
  game.obstacles = [];
  game.waterTiles = [];
  game.spikeTiles = [];
  game.shootTimer = 0;
  game.stageTimer = 0;
  game.iFrames = 0;
  game.shakeTimer = 0; game.shakeX = 0; game.shakeY = 0;
  game.particles = [];
  game.orbitals = [];
  game.strikeEffects = [];
  game.starProjectiles = [];
  game.meteorProjectiles = [];
  game.clones = [];
  game._delayedBullets = [];
  game.specialEntities = [];
  game.deferredEntities = [];
  game.skipExitSpawns = false;
  game.stuckArrows = [];
  game.boltArcs = [];
  game.mapGrid = null;
  game.doorWalls = [];
  game.doorOpen = false;
  game.pendingXP = 0;
  game._angelUsed = false;

  // Rebuild orbitals from player skills
  rebuildOrbitals();
  resetSummonTimers();

  // Reset damage tracking for Plus skills
  game.player.tookDamageThisStage = false;

  // Tick down aura rooms and activate new ones if stacks > 0
  tickAuraRooms(game.player);

  // Invincibility star cycling timer (reset each stage)
  if (game.player.starDuration > 0) {
    game.player.starCycleTimer = game.player.starDuration; // start invincible
    game.iFrames = game.player.starDuration;
  }

  let mapPick;
  if (game._retryMapPick) {
    mapPick = game._retryMapPick;
    game._retryMapPick = null;
  } else {
    mapPick = pickStageMap(game.chapter, game.stage);
  }
  const parsed = mapPick?.stageId ? parseStageMap(mapPick.stageId) : null;
  if (!parsed) {
    console.error(`No map data for chapter ${game.chapter} stage ${game.stage}`);
    return;
  }
  // Save for potential retry
  game._lastMapPick = mapPick;
  applyMapLayout(parsed, mapPick.stageType);
  addExitDoorWall();
  game.camera.y = game.player.y;
  game.camera.x = a.x + a.w / 2;
  game.stageIndicatorTimer = 2.5; // show for 2.5 seconds then fade
  game.state = 'playing';
}

function addExitDoorWall() {
  const a = arena();
  const grid = game.mapGrid || { w: 11, h: 15 };
  const cellW = a.w / grid.w;
  const gateH = cellW * 2; // gate is 2 cells tall
  const wallY = a.y - gateH; // two rows above the arena
  const doorCells = 3;
  const doorStart = Math.floor((grid.w - doorCells) / 2);

  // Left wall segment
  if (doorStart > 0) {
    const wall = { x: a.x, y: wallY, w: doorStart * cellW, h: gateH, _isDoorWall: true };
    game.obstacles.push(wall);
    game.doorWalls.push(wall);
  }
  // Right wall segment
  const doorEnd = doorStart + doorCells;
  if (doorEnd < grid.w) {
    const wall = { x: a.x + doorEnd * cellW, y: wallY, w: (grid.w - doorEnd) * cellW, h: gateH, _isDoorWall: true };
    game.obstacles.push(wall);
    game.doorWalls.push(wall);
  }
  // Door segment (blocks until enemies die)
  const doorWall = {
    x: a.x + doorStart * cellW, y: wallY, w: doorCells * cellW, h: gateH,
    _isDoorWall: true, _isDoor: true,
  };
  game.obstacles.push(doorWall);
  game.doorWalls.push(doorWall);
}

function applyMapLayout(parsed, stageType) {
  // Set grid BEFORE calling arena() so it computes correct dimensions
  game.mapGrid = { w: parsed.w, h: parsed.h };
  const a = arena();
  const p = game.player;
  const cell = a.cellSize;

  // Default player position (overridden by _player entity)
  p.x = a.x + a.w / 2;
  p.y = a.y + a.h * 0.8;

  // Convert terrain to obstacles/water/spikes
  for (const w of parsed.walls) {
    game.obstacles.push({
      x: a.x + w.col * cell,
      y: a.y + w.row * cell,
      w: cell, h: cell,
    });
  }
  for (const wt of parsed.water) {
    game.waterTiles.push({
      x: a.x + wt.col * cell,
      y: a.y + wt.row * cell,
      w: cell, h: cell,
    });
  }
  for (const sp of parsed.spikes) {
    game.spikeTiles.push({
      x: a.x + sp.col * cell,
      y: a.y + sp.row * cell,
      w: cell, h: cell,
    });
  }

  // Resolve _enemy1/2/3 to specific enemy types from chapter pool
  let enemyGroupTypes;
  if (game._retryEnemyGroups) {
    enemyGroupTypes = game._retryEnemyGroups;
    game._retryEnemyGroups = null;
  } else {
    enemyGroupTypes = {};
    for (let g = 1; g <= 3; g++) {
      const pick = pickRandomEnemy(game.chapter);
      if (pick) enemyGroupTypes[`_enemy${g}`] = pick;
    }
  }
  // Save for potential retry
  game._lastEnemyGroups = enemyGroupTypes;

  const scale = getStageScale(game.chapter, game.stage);

  // Process entities from map
  for (const ent of parsed.entities) {
    const cx = a.x + (ent.col + 0.5) * cell;
    const cy = a.y + (ent.row + 0.5) * cell;

    if (ent.typeKey === '_player') {
      p.x = cx;
      p.y = cy;
    } else if (ent.typeKey === '_angel') {
      // Defer angel until enemies are dead
      game.deferredEntities.push({ type: 'angel', x: cx, y: cy, r: 36 });
      if (stageType === 'angel') {
        // Angel stages have no enemies, spawn immediately
        game.specialEntities.push({ type: 'angel', x: cx, y: cy, r: 36 });
        game.skipExitSpawns = true;
      }
    } else if (ent.typeKey === '_chest') {
      // Spawn treasure chest as enemy at this position
      const chestType = getEnemyType('treasureChest');
      if (chestType) {
        spawnEnemyAt('treasureChest', chestType, scale, cx, cy, { guaranteedDrop: true });
      }
    } else if (ent.typeKey.startsWith('_enemy')) {
      // Generic enemy slot - pick from chapter pool
      const group = enemyGroupTypes[ent.typeKey];
      if (group) {
        spawnEnemyAt(group.id, group.type, scale, cx, cy);
      }
    } else {
      // Explicit enemy/boss type from map
      const typeDef = getEnemyType(ent.typeKey);
      if (typeDef) {
        const isBoss = typeDef.boss || false;
        const isChapterBoss = stageType === 'final_boss' && isBoss;
        spawnEnemyAt(ent.typeKey, typeDef, scale, cx, cy, {
          isBoss,
          isChapterBoss,
          guaranteedDrop: isBoss,
          bossScale: isChapterBoss ? 1.5 : 1.0,
        });
      }
    }
  }
}

function spawnExitEntities() {
  // Spawn deferred entities from map (angels placed at map positions)
  for (const de of game.deferredEntities || []) {
    game.specialEntities.push(de);
  }
  game.deferredEntities = [];
}

function update(dt) {
  if (game.state !== 'playing' && game.state !== 'exiting') return;
  const a = arena();
  const p = game.player;
  const input = getInput();

  // Shake
  if (game.shakeTimer > 0) {
    game.shakeTimer -= dt;
    game.shakeX = (Math.random() - 0.5) * 6 * (game.shakeTimer / 0.15);
    game.shakeY = (Math.random() - 0.5) * 6 * (game.shakeTimer / 0.15);
  } else { game.shakeX = 0; game.shakeY = 0; }

  if (game.iFrames > 0) game.iFrames -= dt;
  if (game.stageIndicatorTimer > 0) game.stageIndicatorTimer -= dt;

  // Move player (apply speed aura dynamically)
  const speedAuraBonus = p._speedAuraActive ? 0.6 * p.speedAuraStacks : 0;
  const pSpeed = PLAYER_BASE_SPEED * T() * (p.speedMult + speedAuraBonus);
  p.x += input.dx * pSpeed * dt;
  p.y += input.dy * pSpeed * dt;
  const pr = PLAYER_R * T();
  p.x = clamp(p.x, a.x + pr, a.x + a.w - pr);
  // Allow player to move up into door area when door is open
  const grid = game.mapGrid || { w: 11 };
  const doorCellW = a.w / grid.w;
  const gateH = doorCellW * 2;
  const minY = game.doorOpen ? a.y - gateH - pr : a.y + pr;
  p.y = clamp(p.y, minY, a.y + a.h - pr);
  for (const ob of game.obstacles) {
    const pushed = pushOutRect(p.x, p.y, pr, ob.x, ob.y, ob.w, ob.h);
    if (pushed) { p.x = pushed.x; p.y = pushed.y; }
  }
  // Water blocks player movement (same as walls)
  for (const wt of game.waterTiles || []) {
    const pushed = pushOutRect(p.x, p.y, pr, wt.x, wt.y, wt.w, wt.h);
    if (pushed) { p.x = pushed.x; p.y = pushed.y; }
  }
  // Spike damage (DPS when standing on spikes)
  for (const sp of game.spikeTiles || []) {
    if (p.x >= sp.x && p.x <= sp.x + sp.w && p.y >= sp.y && p.y <= sp.y + sp.h) {
      if (game.iFrames <= 0) {
        const spkDmg = game.debug.noDmgToPlayer ? 0 : Math.floor(dmgVar(Math.floor(p.maxHp * 0.02)) * (game._retryDmgMult ?? 1));
        p.hp -= spkDmg;
        p.tookDamageThisStage = true;
        game.iFrames = 0.5 + (p.iFrameBonus || 0);
        sfxPlayerHit();
        spawnParticles(p.x, p.y, '#e74c3c', 2, 40);
        if (spkDmg > 0) spawnDmgNumber(p.x, p.y - pr, spkDmg, '#e74c3c');
      }
      break;
    }
  }

  // Subsystems
  updateShooting(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateCrystals(dt);
  updateHearts(dt);
  updateParticles(dt);
  updateBoltArcs(dt);

  // Update stuck arrows
  for (let i = (game.stuckArrows || []).length - 1; i >= 0; i--) {
    game.stuckArrows[i].life -= dt;
    if (game.stuckArrows[i].life <= 0) game.stuckArrows.splice(i, 1);
  }

  // HP Regen (flat from skills + percentage from ring)
  const totalRegen = (p.hpRegen || 0) + (p.regenPct || 0) * p.maxHp;
  if (totalRegen > 0 && p.hp < p.maxHp) {
    p.hp = Math.min(p.hp + totalRegen * dt, p.maxHp);
  }

  // Invincibility Star cycling: 2s on every 12s
  if (p.starDuration > 0) {
    p.starCycleTimer = (p.starCycleTimer || 0) - dt;
    if (p.starCycleTimer <= -12 + p.starDuration) {
      // Cycle complete, grant invincibility again
      p.starCycleTimer = p.starDuration;
      game.iFrames = Math.max(game.iFrames, p.starDuration);
    }
  }

  // Speed Aura: +60% speed while aura rooms active
  // (applied dynamically each frame so it doesn't stack permanently)
  if (p.speedAuraRooms > 0 && p.speedAuraStacks > 0) {
    p._speedAuraActive = true;
  } else {
    p._speedAuraActive = false;
  }

  // Crit Aura: +45% crit while aura rooms active
  if (p.critAuraRooms > 0 && p.critAuraStacks > 0) {
    p._critAuraActive = true;
  } else {
    p._critAuraActive = false;
  }

  // Update orbitals and summons
  updateOrbitals(dt);
  updateSummons(dt);

  // Shadow clone
  if (p.shadowClones > 0) {
    if (!game.cloneShootTimer) game.cloneShootTimer = 0;
    game.cloneShootTimer -= dt;
    const cloneInput = getInput();
    if (!cloneInput.moving && game.enemies.length > 0 && game.cloneShootTimer <= 0) {
      game.cloneShootTimer = BASE_SHOOT_CD * p.cdMult * 1.2; // slightly slower than player
      const cloneX = p.x - 1.1 * T();
      const cloneY = p.y + 0.44 * T();
      let nearest = null, nd = Infinity;
      for (const e of game.enemies) {
        const d = dist(cloneX, cloneY, e.x, e.y);
        if (d < nd) { nd = d; nearest = e; }
      }
      if (nearest) {
        const ang = Math.atan2(nearest.y - cloneY, nearest.x - cloneX);
        const cloneDmg = 10 * p.dmgMult * 0.5;
        game.bullets.push({
          x: cloneX + Math.cos(ang) * 0.44 * T(),
          y: cloneY + Math.sin(ang) * 0.44 * T(),
          vx: Math.cos(ang) * BULLET_SPEED * T(),
          vy: Math.sin(ang) * BULLET_SPEED * T(),
          dmg: cloneDmg, pierceLeft: 1, pierceCount: 0, bounces: 0,
          origDmg: cloneDmg, isCrit: false
        });
      }
    }
  }

  // Player dead?
  if (p.hp <= 0) {
    p.hp = 0;
    game.state = 'dead';
    sfxGameOver();
    clearLastRun();
    const globalStage = game.chapter * STAGES_PER_CHAPTER + game.stage;
    saveBest(globalStage);
    saveCoins(getCoins() + game.runCoins);
    return;
  }

  // All enemies dead → flush XP, process level-ups, then enter exit phase
  if (game.enemies.length === 0 && game.state === 'playing') {
    flushPendingXP();
    // Plus skill bonuses: reward for clearing room without damage
    if (!p.tookDamageThisStage) {
      applyPlusBonuses(p);
    }
    // Activate auras (affect current + next 2 rooms)
    activateAuras(p);
    // Process any pending level-ups first (one per frame) — skip if angel is waiting
    if ((game.deferredEntities || []).length === 0 && processPendingLevelUps()) return;
    game.state = 'exiting';
    game.doorOpen = true;
    // Remove the door obstacle (keep the side walls)
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      if (game.obstacles[i]._isDoor) game.obstacles.splice(i, 1);
    }
    sfxStageClear();
    spawnExitEntities();
  }

  // In exiting state: magnet pickups, check special entities, check exit reached
  if (game.state === 'exiting') {
    // If an angel is present or was used, skip XP level-ups — the angel is the reward
    if (game.specialEntities.length === 0 && !game._angelUsed && processPendingLevelUps()) return;
    magnetAllCrystals(dt);
    magnetAllHearts(dt);

    // Touch detection for angel
    for (let i = game.specialEntities.length - 1; i >= 0; i--) {
      const se = game.specialEntities[i];
      if (dist(p.x, p.y, se.x, se.y) < PLAYER_R * T() + se.r) {
        // Open 2-choice skill panel (angel blessing) — discard any pending XP level-ups
        game._pendingLevelUps = 0;
        game._angelUsed = true;
        const choices = rollSkillChoices(p, 2);
        if (choices.length > 0) {
          game.levelUpChoices = choices;
          game._levelUpSource = 'angel';
          game._returnState = 'exiting';
          game.state = 'levelUp';
        }
        game.specialEntities.splice(i, 1);
        break;
      }
    }

    // Check if player walked through the door (past the gate)
    const grid = game.mapGrid || { w: 11 };
    const doorCellW = a.w / grid.w;
    const exitY = a.y - doorCellW * 2 - PLAYER_R * T();
    if (p.y <= exitY) {
      if (game.stage >= getChapterStages(game.chapter)) {
        game.state = 'chapterClear';
        sfxChapterClear();
        saveChaptersCleared(game.chapter);
        clearLastRun();
        const globalStage = game.chapter * STAGES_PER_CHAPTER + game.stage;
        saveBest(globalStage);
        saveCoins(getCoins() + game.runCoins);
      } else {
        const globalStage = game.chapter * STAGES_PER_CHAPTER + game.stage;
        saveBest(globalStage);
        saveLastRun(game.chapter, game.stage, {
          skills: { ...game.player.skills },
          level: game.player.level,
          xp: game.player.xp,
          xpToNext: game.player.xpToNext,
        });
        nextStage();
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Background gradient (tinted by chapter)
  const ch = CHAPTERS[game.chapter];
  const bgTint = ch ? ch.bgTint : '#0a0a2e';
  const bgTheme = CHAPTER_THEMES[game.chapter] || CHAPTER_THEMES[0];
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bgTint);
  grad.addColorStop(0.5, bgTheme.boundary || '#141452');
  grad.addColorStop(1, bgTint);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (game.state === 'menu') return;
  if (game.state === 'equip') { drawEquipScreen(ctx, W, H); return; }
  if (game.state === 'map') { drawMapScreen(ctx, W, H); return; }
  if (game.state === 'skillInfo') { drawSkillInfoScreen(ctx, W, H); return; }

  const a = arena();
  const p = game.player;

  // Camera: zoom so arena + 1 cell of padding fills screen width (½ tile each side)
  const gridW = game.mapGrid?.w || 11;
  const viewUnits = gridW + 1; // ½ unit padding each side
  const cell = a.cellSize || (a.w / gridW);
  const desiredViewW = cell * viewUnits;
  const cam = game.camera;
  cam.zoom = W / desiredViewW;

  // Camera Y: ease toward player, then soft-clamp to boundary
  const halfViewH = (H / cam.zoom) / 2;
  const quarterScreen = (H / cam.zoom) / 4;
  const minY = a.y - quarterScreen + halfViewH;
  const maxY = a.y + a.h + quarterScreen - halfViewH;

  // Compute target: player position, clamped to boundary
  let targetY = p ? p.y : cam.y;
  if (minY < maxY) targetY = Math.max(minY, Math.min(maxY, targetY));

  // Single ease toward the (clamped) target — same feel everywhere
  cam.y += (targetY - cam.y) * 0.08;

  // Camera X centers on arena
  cam.x = a.x + a.w / 2;

  ctx.save();
  // Apply camera transform: zoom centered on screen, then offset to follow player
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + game.shakeX, -cam.y + game.shakeY);

  const theme = CHAPTER_THEMES[game.chapter] || CHAPTER_THEMES[0];
  drawArena(ctx, a, theme);

  // Water tiles
  for (const wt of game.waterTiles || []) {
    const waveOff = Math.sin(performance.now() / 600 + wt.x * 0.05) * 0.06;
    ctx.fillStyle = `rgba(30,100,200,${0.35 + waveOff})`;
    ctx.fillRect(wt.x, wt.y, wt.w, wt.h);
    // Wave line
    ctx.strokeStyle = `rgba(100,180,255,${0.25 + waveOff})`;
    ctx.lineWidth = 1;
    const midY = wt.y + wt.h * 0.5;
    ctx.beginPath();
    ctx.moveTo(wt.x + 2, midY);
    ctx.quadraticCurveTo(wt.x + wt.w * 0.25, midY - 2, wt.x + wt.w * 0.5, midY);
    ctx.quadraticCurveTo(wt.x + wt.w * 0.75, midY + 2, wt.x + wt.w - 2, midY);
    ctx.stroke();
  }

  // Spike tiles
  for (const sp of game.spikeTiles || []) {
    ctx.fillStyle = 'rgba(180,60,40,0.25)';
    ctx.fillRect(sp.x, sp.y, sp.w, sp.h);
    // Spike symbols
    ctx.fillStyle = 'rgba(220,80,50,0.5)';
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    const sz = Math.min(sp.w, sp.h) * 0.2;
    for (let dx = -1; dx <= 1; dx += 2) {
      for (let dy = -1; dy <= 1; dy += 2) {
        const sx = cx + dx * sz * 1.2;
        const sy = cy + dy * sz * 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - sz);
        ctx.lineTo(sx + sz * 0.4, sy + sz * 0.3);
        ctx.lineTo(sx - sz * 0.4, sy + sz * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Door wall + stage indicator (above arena)
  {
    const grid = game.mapGrid || { w: 11 };
    const cellW = a.w / grid.w;
    const gateH = cellW * 2; // 2 cells tall
    const wallY = a.y - gateH;
    const doorCells = 3;
    const doorStart = Math.floor((grid.w - doorCells) / 2);
    const doorX = a.x + doorStart * cellW;
    const doorW = doorCells * cellW;

    // Draw side walls (themed stone/material)
    for (const dw of game.doorWalls) {
      if (dw._isDoor) continue;
      ctx.fillStyle = theme.wall;
      ctx.fillRect(dw.x, dw.y, dw.w, dw.h);
      // Brick/block pattern
      ctx.strokeStyle = theme.wallDetail;
      ctx.lineWidth = 1;
      const brickH = gateH / 3;
      for (let row = 0; row < 3; row++) {
        const by = dw.y + row * brickH;
        ctx.strokeRect(dw.x + 0.5, by + 0.5, dw.w - 1, brickH);
        // Offset vertical lines per row
        const brickW = cellW * 1.5;
        const off = (row % 2) * brickW * 0.5;
        for (let bx2 = dw.x + off + brickW; bx2 < dw.x + dw.w; bx2 += brickW) {
          ctx.beginPath();
          ctx.moveTo(bx2, by);
          ctx.lineTo(bx2, by + brickH);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = theme.wallStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dw.x + 0.5, dw.y + 0.5, dw.w - 1, dw.h - 1);
    }

    if (game.doorOpen) {
      // Open door: glowing passage themed
      const pulse = 0.6 + Math.sin(performance.now() / 300) * 0.4;
      ctx.save();
      ctx.shadowColor = theme.doorGlow;
      ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = theme.door;
      ctx.globalAlpha = 0.3 + pulse * 0.15;
      ctx.fillRect(doorX, wallY, doorW, gateH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.doorGlow;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(doorX + 0.5, wallY + 0.5, doorW - 1, gateH - 1);
      // Arrow pointing up
      ctx.fillStyle = theme.doorGlow;
      ctx.globalAlpha = 0.5 + pulse * 0.3;
      const arrowCx = doorX + doorW / 2;
      const arrowCy = wallY + gateH / 2;
      const arrowSz = cellW * 0.4;
      ctx.beginPath();
      ctx.moveTo(arrowCx, arrowCy - arrowSz);
      ctx.lineTo(arrowCx + arrowSz * 0.7, arrowCy + arrowSz * 0.3);
      ctx.lineTo(arrowCx - arrowSz * 0.7, arrowCy + arrowSz * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      // Closed door: themed with gate bars
      ctx.fillStyle = theme.door;
      ctx.fillRect(doorX, wallY, doorW, gateH);
      ctx.strokeStyle = theme.doorStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(doorX + 0.5, wallY + 0.5, doorW - 1, gateH - 1);
      // Gate bars
      ctx.strokeStyle = theme.doorBars;
      ctx.lineWidth = 2;
      const barCount = 5;
      for (let b = 1; b < barCount; b++) {
        const bx = doorX + (doorW / barCount) * b;
        ctx.beginPath();
        ctx.moveTo(bx, wallY + 2);
        ctx.lineTo(bx, wallY + gateH - 2);
        ctx.stroke();
      }
      // Cross bar
      ctx.beginPath();
      ctx.moveTo(doorX + 2, wallY + gateH * 0.4);
      ctx.lineTo(doorX + doorW - 2, wallY + gateH * 0.4);
      ctx.stroke();
    }

    // Stage number above the door
    const stageText = '' + game.stage;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(cellW * 0.5)}px "Segoe UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    const textY = wallY - cellW * 0.4;
    ctx.strokeText(stageText, a.x + a.w / 2, textY);
    ctx.fillText(stageText, a.x + a.w / 2, textY);
  }

  // Walls / obstacles (skip door walls, they're drawn separately)
  for (const ob of game.obstacles) {
    if (ob._isDoorWall) continue;
    ctx.fillStyle = theme.wall;
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    // Inner highlight
    ctx.fillStyle = theme.wallDetail;
    ctx.fillRect(ob.x + 1, ob.y + 1, ob.w - 2, 2);
    ctx.strokeStyle = theme.wallStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(ob.x + 0.5, ob.y + 0.5, ob.w - 1, ob.h - 1);
  }

  // Crystals
  for (const c of game.crystals) {
    const bob = Math.sin(c.bobPhase) * 2;
    const alpha = c.life < 2 ? c.life / 2 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#a29bfe'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#a29bfe';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 7 + bob);
    ctx.lineTo(c.x + 4.2, c.y + bob);
    ctx.lineTo(c.x, c.y + 7 + bob);
    ctx.lineTo(c.x - 4.2, c.y + bob);
    ctx.closePath(); ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 4.2 + bob);
    ctx.lineTo(c.x + 1.75, c.y - 0.7 + bob);
    ctx.lineTo(c.x, c.y + bob);
    ctx.lineTo(c.x - 1.75, c.y - 0.7 + bob);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Hearts
  for (const h of game.hearts) {
    const bob = Math.sin(h.bobPhase) * 2;
    ctx.save();
    ctx.shadowColor = '#ff6b81'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath();
    const hx = h.x, hy = h.y + bob;
    const hr = 8;
    ctx.moveTo(hx, hy + hr * 0.3);
    ctx.bezierCurveTo(hx - hr, hy - hr * 0.5, hx - hr * 0.5, hy - hr, hx, hy - hr * 0.4);
    ctx.bezierCurveTo(hx + hr * 0.5, hy - hr, hx + hr, hy - hr * 0.5, hx, hy + hr * 0.3);
    ctx.fill();
    ctx.restore();
  }

  // Enemy bullets — style-based rendering
  if (game.enemyBullets.length > 0) {
    const at = T();
    const ebrDraw = ENEMY_BULLET_R * at;
    const drawTime = performance.now() / 1000;

    // Lobbed bullet shadows (all styles)
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    for (const b of game.enemyBullets) {
      if (!b.lobbed) continue;
      const groundX = b.startX + (b.targetX - b.startX) * (b.lobProgress || 0);
      const groundY = b.startY + (b.targetY - b.startY) * (b.lobProgress || 0);
      ctx.beginPath();
      ctx.ellipse(groundX, groundY, ebrDraw * 0.8, ebrDraw * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Per-bullet styled rendering
    for (const b of game.enemyBullets) {
      const s = b.style || 'default';
      const bAng = Math.atan2(b.vy, b.vx);
      ctx.save();

      switch (s) {
        case 'rock': {
          // Tumbling brown square
          const rot = drawTime * 6 + b.x * 0.1;
          ctx.translate(b.x, b.y);
          ctx.rotate(rot);
          ctx.fillStyle = '#8d6e63';
          const rr = ebrDraw * 0.9;
          ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(-rr * 0.4, -rr * 0.5, rr * 0.6, rr * 0.5);
          break;
        }
        case 'acid': {
          // Green glob with trail dots
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#7ed321';
          ctx.beginPath(); ctx.arc(b.x - b.vx * 0.04, b.y - b.vy * 0.04, ebrDraw * 0.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(b.x - b.vx * 0.09, b.y - b.vy * 0.09, ebrDraw * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#7ed321';
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#a8e86c';
          ctx.beginPath(); ctx.arc(b.x - ebrDraw * 0.25, b.y - ebrDraw * 0.25, ebrDraw * 0.3, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'arrow': {
          // Small tan arrow shape
          ctx.translate(b.x, b.y);
          ctx.rotate(bAng);
          ctx.strokeStyle = '#a1887f';
          ctx.lineWidth = 0.04 * at;
          ctx.beginPath(); ctx.moveTo(-0.18 * at, 0); ctx.lineTo(0.06 * at, 0); ctx.stroke();
          ctx.fillStyle = '#ffcc80';
          ctx.beginPath();
          ctx.moveTo(0.13 * at, 0);
          ctx.lineTo(0.02 * at, -0.055 * at);
          ctx.lineTo(0.02 * at, 0.055 * at);
          ctx.closePath(); ctx.fill();
          // Fletching
          ctx.fillStyle = 'rgba(161,136,127,0.5)';
          ctx.beginPath(); ctx.moveTo(-0.18 * at, 0); ctx.lineTo(-0.12 * at, -0.04 * at); ctx.lineTo(-0.1 * at, 0); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-0.18 * at, 0); ctx.lineTo(-0.12 * at, 0.04 * at); ctx.lineTo(-0.1 * at, 0); ctx.closePath(); ctx.fill();
          break;
        }
        case 'fire': {
          // Flickering orange-red fireball
          const pulse = 1 + Math.sin(drawTime * 12 + b.x) * 0.15;
          const fr = ebrDraw * pulse;
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#ff4500';
          ctx.beginPath(); ctx.arc(b.x, b.y, fr * 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ff6b35';
          ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffab40';
          ctx.beginPath(); ctx.arc(b.x, b.y, fr * 0.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'ice': {
          // Rotating diamond
          const rot = drawTime * 3 + b.y * 0.05;
          ctx.translate(b.x, b.y);
          ctx.rotate(rot);
          ctx.fillStyle = '#81d4fa';
          const dr = ebrDraw * 1.1;
          ctx.beginPath();
          ctx.moveTo(0, -dr); ctx.lineTo(dr * 0.65, 0);
          ctx.lineTo(0, dr); ctx.lineTo(-dr * 0.65, 0);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e1f5fe';
          ctx.beginPath();
          ctx.moveTo(0, -dr * 0.5); ctx.lineTo(dr * 0.3, 0);
          ctx.lineTo(0, dr * 0.5); ctx.lineTo(-dr * 0.3, 0);
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'bolt': {
          // Small zigzag lightning
          ctx.translate(b.x, b.y);
          ctx.rotate(bAng);
          ctx.strokeStyle = '#ffe066';
          ctx.lineWidth = 0.04 * at;
          ctx.beginPath();
          ctx.moveTo(-0.12 * at, 0);
          ctx.lineTo(-0.04 * at, -0.06 * at);
          ctx.lineTo(0.04 * at, 0.06 * at);
          ctx.lineTo(0.12 * at, 0);
          ctx.stroke();
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = '#fff9c4';
          ctx.lineWidth = 0.08 * at;
          ctx.beginPath();
          ctx.moveTo(-0.12 * at, 0);
          ctx.lineTo(-0.04 * at, -0.06 * at);
          ctx.lineTo(0.04 * at, 0.06 * at);
          ctx.lineTo(0.12 * at, 0);
          ctx.stroke();
          break;
        }
        case 'skull': {
          // Purple orb with outer ring
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#d580ff';
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw * 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#9b59b6';
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#d580ff';
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw * 0.45, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(213,128,255,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw + 0.044 * at, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        default: {
          // Original style: colored circle + glow
          const col = b.lobbed ? '#ff9f43' : b.bouncy ? '#e74c3c' : '#ff2d55';
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw + 0.09 * at, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw, 0, Math.PI * 2); ctx.fill();
          if (b.bouncy) {
            ctx.strokeStyle = 'rgba(231,76,60,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(b.x, b.y, ebrDraw + 0.044 * at, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }
      }
      ctx.restore();
    }
  }

  // Player arrows — batched, no shadowBlur
  if (game.bullets.length > 0) {
    const at = T();

    // Holy projectiles — bright blue rings
    ctx.save();
    ctx.strokeStyle = '#00bfff';
    ctx.lineWidth = 0.033 * at;
    ctx.globalAlpha = 0.8;
    for (const b of game.bullets) {
      if (!b.isHoly) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, 0.11 * at, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // Arrow shapes
    const arrowColor = game.player.arrowColor || '#00e5ff';
    for (const b of game.bullets) {
      if (b.isHoly) continue;
      if (b.opacity != null && b.opacity < 1) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang || 0);
      // Shaft
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 0.044 * at;
      ctx.beginPath(); ctx.moveTo(-0.22 * at, 0); ctx.lineTo(0.088 * at, 0); ctx.stroke();
      // Head
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0.154 * at, 0); ctx.lineTo(0.044 * at, -0.066 * at); ctx.lineTo(0.044 * at, 0.066 * at); ctx.closePath(); ctx.fill();
      // Fletching
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = arrowColor;
      ctx.beginPath(); ctx.moveTo(-0.22 * at, 0); ctx.lineTo(-0.154 * at, -0.055 * at); ctx.lineTo(-0.132 * at, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.22 * at, 0); ctx.lineTo(-0.154 * at, 0.055 * at); ctx.lineTo(-0.132 * at, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // Stuck arrows (fading in walls)
  for (const sa of game.stuckArrows || []) {
    const alpha = sa.life / 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sa.x, sa.y);
    ctx.rotate(sa.ang || 0);
    ctx.strokeStyle = '#5a8a9a';
    ctx.lineWidth = 0.033 * T();
    ctx.beginPath(); ctx.moveTo(-0.132 * T(), 0); ctx.lineTo(0.066 * T(), 0); ctx.stroke();
    ctx.fillStyle = '#8ab4c4';
    ctx.beginPath(); ctx.moveTo(0.11 * T(), 0); ctx.lineTo(0.022 * T(), -0.044 * T()); ctx.lineTo(0.022 * T(), 0.044 * T()); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Bolt lightning arcs
  drawBoltArcs(ctx);

  // Special entities (angel)
  const drawTime = performance.now() / 1000;
  for (const se of game.specialEntities) {
    if (se.type === 'angel') drawAngel(ctx, se.x, se.y, se.r, drawTime);
  }

  // Blaze ground indicators (drawn under enemies)
  for (const e of game.enemies) {
    if (e.blazeTimer > 0 && e._spawnTimer <= 0 && !e._underground) {
      const alpha = Math.min(e.blazeTimer / 0.5, 1) * 0.15;
      const pulseR = e.r * (1.6 + 0.15 * Math.sin(drawTime * 6));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ff4500';
      ctx.beginPath();
      ctx.arc(e.x, e.y, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Enemies
  for (const e of game.enemies) {
    if (e._spawnTimer > 0) {
      // Fade-in: draw with reduced alpha + scale up effect
      const t = 1 - e._spawnTimer / 0.6;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.translate(e.x, e.y);
      ctx.scale(0.5 + t * 0.5, 0.5 + t * 0.5);
      ctx.translate(-e.x, -e.y);
      drawEnemy(ctx, e, drawTime);
      ctx.restore();
    } else {
      drawEnemy(ctx, e, drawTime);
      if (!e._underground && e.hp < e.maxHp) {
        if (e._displayHp === undefined) e._displayHp = e.hp;
        e._displayHp += (e.hp - e._displayHp) * 0.08;
        if (Math.abs(e._displayHp - e.hp) < 0.5) e._displayHp = e.hp;
        const bx = e.x, by = e.y - e.r - 0.22 * T(), bw = e.r * 2, bh = 0.154 * T();
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(bx - bw / 2, by, bw, bh);
        // Ghost bar (white, trails behind)
        const ghostRatio = clamp(e._displayHp / e.maxHp, 0, 1);
        if (ghostRatio > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(bx - bw / 2, by, bw * ghostRatio, bh);
        }
        // Actual HP bar
        const realRatio = clamp(e.hp / e.maxHp, 0, 1);
        if (realRatio > 0) {
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(bx - bw / 2, by, bw * realRatio, bh);
        }
      }
    }
  }

  // Player
  if (p) {
    const pAlpha = (game.iFrames > 0 && Math.sin(game.iFrames * 30) > 0) ? 0.35 : 1;
    const pScale = p.sizeScale || 1;
    const scaledR = PLAYER_R * T() * pScale;
    ctx.save();
    ctx.globalAlpha = pAlpha;
    const acol = p.armorColor || '#00e5ff';
    ctx.shadowColor = acol; ctx.shadowBlur = 14;
    ctx.fillStyle = acol;
    ctx.beginPath(); ctx.arc(p.x, p.y, scaledR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bgTint;
    ctx.beginPath();
    const cr = scaledR * 0.5;
    ctx.moveTo(p.x, p.y - cr);
    ctx.lineTo(p.x - cr * 0.8, p.y + cr * 0.5);
    ctx.lineTo(p.x + cr * 0.8, p.y + cr * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // HP bar with damage tween
    if (p._displayHp === undefined) p._displayHp = p.hp;
    p._displayHp += (p.hp - p._displayHp) * 0.08;
    if (Math.abs(p._displayHp - p.hp) < 0.5) p._displayHp = p.hp;
    const hpBarW = PLAYER_R * 2.8 * T();
    const hpBarH = 0.18 * T();
    const hpBarX = p.x - hpBarW / 2;
    const hpBarY = p.y + (PLAYER_R + 0.396) * T();
    const hpRatio = clamp(p.hp / p.maxHp, 0, 1);
    const ghostRatio = clamp(p._displayHp / p.maxHp, 0, 1);
    const hpColor = p.hp > p.maxHp * 0.3 ? '#2ecc71' : '#e74c3c';
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(hpBarX - 1, hpBarY - 1, hpBarW + 2, hpBarH + 2, 3); ctx.fill();
    // Ghost bar (white, trails behind)
    if (ghostRatio > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.roundRect(hpBarX, hpBarY, hpBarW * ghostRatio, hpBarH, 2); ctx.fill();
    }
    // Actual HP bar
    if (hpRatio > 0) {
      ctx.fillStyle = hpColor;
      ctx.beginPath(); ctx.roundRect(hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 2); ctx.fill();
    }
    // HP text on top of bar (white on black)
    const hpText = fmt(Math.ceil(p.hp));
    ctx.font = `bold ${Math.round(0.29 * T())}px "Segoe UI",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const textW = ctx.measureText(hpText).width;
    const textPad = 0.088 * T();
    const textBgW = textW + textPad * 2;
    const textBgH = 0.352 * T();
    const textBgX = p.x - textBgW / 2;
    const textBgY = hpBarY - textBgH + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(textBgX, textBgY, textBgW, textBgH, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(hpText, p.x, textBgY + textBgH / 2);

    // Shadow clone
    if (p.shadowClones > 0) {
      const cloneOffX = -1.1 * T();
      const cloneOffY = 0.44 * T();
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.arc(p.x + cloneOffX, p.y + cloneOffY, PLAYER_R * T() * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw orbitals around player
  drawOrbitals(ctx);

  // Draw summons (strikes, stars, meteors)
  drawSummons(ctx);

  drawParticles(ctx);
  ctx.restore(); // shake

  drawHUD(ctx, W, H);

  // Stage indicator (bottom-right, fades out)
  if (game.stageIndicatorTimer > 0) {
    const fadeDur = 0.8;
    const alpha = game.stageIndicatorTimer < fadeDur ? game.stageIndicatorTimer / fadeDur : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    const chDef = CHAPTERS[game.chapter];
    const chName = chDef ? chDef.name : 'Chapter ' + game.chapter;
    const totalStages = getChapterStages(game.chapter);
    const tx = W - 16;
    const ty = H - 16;
    ctx.textAlign = 'right';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    // Stage line
    const stageLabel = `Stage ${game.stage} / ${totalStages}`;
    ctx.font = 'bold 16px "Segoe UI",system-ui,sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.strokeText(stageLabel, tx, ty);
    ctx.fillStyle = '#fff';
    ctx.fillText(stageLabel, tx, ty);
    // Chapter name above
    ctx.font = 'bold 13px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeText(chName, tx, ty - 20);
    ctx.fillText(chName, tx, ty - 20);
    ctx.restore();
  }

  // Overlay states
  if (game.state === 'chapterClear') drawChapterClear(ctx, W, H);
  if (game.state === 'levelUp') drawLevelUpScreen(ctx, W, H);
  if (game.state === 'dead') drawGameOver(ctx, W, H);
  if (game.state === 'paused') drawPauseScreen(ctx, W, H);
}

let lastTime = 0;
let animFrame;
let prevState = 'menu';

function loop(ts) {
  animFrame = requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  // Handle state transitions
  if (game.startRun) {
    game.startRun = false;
    initRun();
  }

  if (game.returnToEquip) {
    game.returnToEquip = false;
    game.state = 'map';
  }

  if (game.retryRun) {
    game.retryRun = false;
    game.stage = game.stage - 1; // nextStage will increment back
    game.player.hp = game.player.maxHp;
    // Hidden damage reduction perk on retry (stacks, capped at 0.4x)
    game._retryDmgMult = Math.max((game._retryDmgMult ?? 1) - 0.2, 0.4);
    // Preserve same map layout and enemies
    game._retryMapPick = game._lastMapPick;
    game._retryEnemyGroups = game._lastEnemyGroups;
    nextStage();
  }

  if (game.continueFromChapter) {
    game.continueFromChapter = false;
    game.chapter = Math.min(game.chapter + 1, TOTAL_CHAPTERS);
    game.state = 'map';
  }

  // Exiting state is handled inside update()

  // Rebuild orbitals after level-up skill pick
  if (prevState === 'levelUp' && (game.state === 'playing' || game.state === 'exiting')) {
    rebuildOrbitals();
  }
  prevState = game.state;

  if (game.state === 'playing' || game.state === 'exiting') update(dt);
  draw();
}

// Start
startBtn.addEventListener('click', async () => {
  ensureAudio();
  await mapReady;
  overlay.classList.add('hidden');
  game.state = 'map';
  lastTime = performance.now();
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(loop);
});
