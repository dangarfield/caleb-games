import { game } from './state.js';
import { PLAYER_R, PLAYER_BASE_SPEED, CRYSTAL_R, BULLET_R, ENEMY_BULLET_R, STAGES_PER_CHAPTER, TOTAL_CHAPTERS, BULLET_SPEED, BASE_SHOOT_CD } from './constants.js';
import { dist, clamp, pushOutRect, fmt, dmgVar, lineHitsRect } from './utils.js';
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
import { updateEnemies, spawnEnemyAt, isEnemyAlive } from './enemies.js';
import { pickSkill, rollSkillChoices, processPendingLevelUps, flushPendingXP, applyPlusBonuses, activateAuras, tickAuraRooms, rebuildPlayerFromSkills } from './skills.js';
import { CHAPTERS, CHAPTER_THEMES, getChapterStages, pickRandomEnemy, getStageScale } from './chapters.js';
import { loadMapData, pickStageMap, parseStageMap, resetUsedMaps } from './mapData.js';
import { drawHUD, drawPauseScreen, getPauseBtnRect, handlePauseClick, resetPauseScroll, handlePauseScroll } from './hud.js';
import { drawEquipScreen, drawMapScreen, drawLevelUpScreen, drawChapterClear, drawGameOver, drawSkillInfoScreen, handleClick, clearClickRegions, handleSkillInfoScroll, handleArmoryScroll, handleMapSwipe, resetMapSwipe, resetLevelUpAnim } from './screens.js';
import { initOrbitals, rebuildOrbitals, updateOrbitals, drawOrbitals } from './orbitals.js';
import { resetSummonTimers, updateSummons, drawSummons } from './summons.js';
import { preloadIcons } from './icons.js';
import { drawEnemy, drawAngel } from './enemyDraw.js';
import { getEnemyType } from './enemyTypes.js';
// 3D rendering modules
import { initRenderer3D, gameToWorld, worldScale, updateCamera, snapCamera, setChapterTheme, render3D, setVisible as set3DVisible, getScene, getTime, camera } from './renderer3d.js';
import * as THREE from 'three';
import { buildArena as buildArena3D, updateArena as updateArena3D, clearArena as clearArena3D, setDoorOpen as setDoorOpen3D } from './arena3d.js';
import { syncEntities, clearEntities, getPlayerWorldPos, getKoAnimDuration } from './entities3d.js';
import { syncEffects, clearEffects, initEffects, updateVFX } from './effects3d.js';
import { preloadEnemyModels } from './enemyModels.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('playBtn');

let W, H;
const _gameWrapper = document.getElementById('game-wrapper');
function resize() {
  const rect = _gameWrapper ? _gameWrapper.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
  W = canvas.width = Math.round(rect.width);
  H = canvas.height = Math.round(rect.height);
}
resize();
window.addEventListener('resize', resize);

setupInput(canvas);
setupLevelUpKeys(pickSkill);
preloadIcons();

// Load map data (starts immediately, awaited before first run)
const mapReady = loadMapData();

// Convert viewport clientX/Y to game-local coords (accounts for wrapper offset in landscape)
function localX(cx) { return _gameWrapper ? cx - _gameWrapper.getBoundingClientRect().left : cx; }
function localY(cy) { return _gameWrapper ? cy - _gameWrapper.getBoundingClientRect().top : cy; }

// Pointer handlers for screen clicks - only register taps, not drag releases
let _tapStartX = 0, _tapStartY = 0, _tapStartTime = 0, _tapPointerId = null;
canvas.addEventListener('pointerdown', e => {
  if (game.state === 'equip' || game.state === 'map' || game.state === 'skillInfo' || game.state === 'levelUp' || game.state === 'dead' || game.state === 'chapterClear' || game.state === 'paused' || game.state === 'playing' || game.state === 'exiting') {
    _tapStartX = localX(e.clientX);
    _tapStartY = localY(e.clientY);
    _tapStartTime = performance.now();
    _tapPointerId = e.pointerId;
  }
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== _tapPointerId) return;
  const lx = localX(e.clientX), ly = localY(e.clientY);
  const dx = lx - _tapStartX;
  const dy = ly - _tapStartY;
  const dt = performance.now() - _tapStartTime;
  const isTap = Math.sqrt(dx * dx + dy * dy) < 20 && dt < 500;
  _tapPointerId = null;

  if (!isTap) return;

  // Pause screen: try click regions first, resume if not consumed
  if (game.state === 'paused') {
    if (!handlePauseClick(lx, ly)) {
      game.state = game._pausedFrom || 'playing';
      game._pausedFrom = null;
    }
    return;
  }

  // Pause button tap during gameplay
  if (game.state === 'playing' || game.state === 'exiting') {
    const btn = getPauseBtnRect();
    if (btn && lx >= btn.x && lx <= btn.x + btn.w && ly >= btn.y && ly <= btn.y + btn.h) {
      game._pausedFrom = game.state;
      game.state = 'paused';
      resetPauseScroll();
      return;
    }
  }

  // UI screen taps
  if (game.state === 'equip' || game.state === 'map' || game.state === 'skillInfo' || game.state === 'levelUp' || game.state === 'dead' || game.state === 'chapterClear') {
    handleClick(lx, ly);
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

// Initialize chapter — show active run's chapter if one exists, otherwise highest unlocked
const _initLastRun = getLastRun();
game.chapter = _initLastRun ? _initLastRun.chapter : Math.min(getChaptersCleared() + 1, TOTAL_CHAPTERS);

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
  game.strikeProjectiles = [];
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
  game.strikeProjectiles = [];
  game.starProjectiles = [];
  game.meteorProjectiles = [];
  game.clones = [];
  game._cloneTrail = [];
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
  game.stageIndicatorTimer = 5.0; // show for 5 seconds then fade
  // Rebuild 3D scene for this stage
  clearArena3D(); clearEntities(); clearEffects();
  setChapterTheme(CHAPTER_THEMES[game.chapter] || CHAPTER_THEMES[0]);
  buildArena3D();
  initEffects(); // eagerly create all effect pools during load screen
  snapCamera(game.player.x, game.player.y);
  // Stage fade-in: hold black screen until models are loaded
  game._stageFadeIn = 1.0; // 1 = fully black, fades to 0
  game._stageFadeOut = 0;
  game._stageFadeOutPending = false;
  game._modelsReady = false;
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
        game.specialEntities.push({ type: 'angel', x: cx, y: cy, r: 36, _spawnTime: getTime() });
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

  // Preload GLB models for all enemies on this stage (+ angel + split children)
  const typeIds = new Set(game.enemies.map(e => e.typeId).filter(Boolean));
  typeIds.add('angel');
  // Recursively collect split spawn types
  const queue = [...typeIds];
  while (queue.length) {
    const id = queue.pop();
    const def = getEnemyType(id);
    if (def && def.splitOnDeath && def.splitOnDeath.spawnType) {
      const childId = def.splitOnDeath.spawnType;
      if (!typeIds.has(childId)) {
        typeIds.add(childId);
        queue.push(childId);
      }
    }
  }
  const modelsPromise = preloadEnemyModels([...typeIds]);
  // Start fade once models load (or after 3s timeout as safety)
  const timeout = new Promise(r => setTimeout(r, 3000));
  Promise.race([modelsPromise, timeout]).then(() => { game._modelsReady = true; });
}

function spawnExitEntities() {
  // Spawn deferred entities from map (angels placed at map positions)
  const now = getTime(); // use Three.js clock to match 3D animation
  for (const de of game.deferredEntities || []) {
    de._spawnTime = now;
    game.specialEntities.push(de);
  }
  game.deferredEntities = [];
}

function update(dt) {
  // Freeze gameplay completely while waiting for models to load
  if (game._stageFadeIn > 0 && !game._modelsReady) return;

  // During fade-in (models ready, scene visible): player can move, no shooting/enemies
  const isFadingIn = game._stageFadeIn > 0 && game._modelsReady;

  // Dying state: only update projectiles/particles, countdown to dead
  if (game.state === 'dying') {
    game.dyingTimer -= dt;
    if (game.dyingTimer <= 0) {
      game.state = 'dead';
    }
    // Continue projectile/particle updates but no player movement or enemy AI
    updateBullets(dt);
    updateSummons(dt);
    updateOrbitals(dt);
    updateParticles(dt);
    updateBoltArcs(dt);
    // Update stuck arrows
    for (let i = (game.stuckArrows || []).length - 1; i >= 0; i--) {
      game.stuckArrows[i].life -= dt;
      if (game.stuckArrows[i].life <= 0) game.stuckArrows.splice(i, 1);
    }
    return;
  }

  if (game.state !== 'playing' && game.state !== 'exiting') return;

  // Stage fade-out countdown (250ms)
  if (game._stageFadeOut > 0 && game._stageFadeOutPending) {
    game._stageFadeOut = Math.max(0, game._stageFadeOut - dt / 0.25);
    if (game._stageFadeOut <= 0) {
      game._stageFadeOutPending = false;
      nextStage();
    }
    return; // freeze gameplay during fade-out
  }

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

  // Move player (apply speed aura dynamically, with subtle easing)
  const speedAuraBonus = p._speedAuraActive ? 0.6 * p.speedAuraStacks : 0;
  const pSpeed = PLAYER_BASE_SPEED * T() * (p.speedMult + speedAuraBonus);
  const targetVx = input.dx * pSpeed;
  const targetVy = input.dy * pSpeed;
  if (!p._vx) p._vx = 0;
  if (!p._vy) p._vy = 0;
  const accel = input.moving ? 18 : 24; // accelerate slightly slower than decelerate
  const ease = 1 - Math.exp(-accel * dt);
  p._vx += (targetVx - p._vx) * ease;
  p._vy += (targetVy - p._vy) * ease;
  p.x += p._vx * dt;
  p.y += p._vy * dt;

  // Player facing direction (movement takes priority, then shooting)
  if (p._facingAngle === undefined) p._facingAngle = -Math.PI / 2; // default: face up
  let targetAngle = p._facingAngle;
  if (input.moving) {
    targetAngle = Math.atan2(input.dy, input.dx);
  } else if (game._shootAngle !== undefined && game.enemies.length > 0) {
    targetAngle = game._shootAngle;
  }
  // Ease toward target angle (shortest arc)
  let diff = targetAngle - p._facingAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p._facingAngle += diff * (1 - Math.exp(-12 * dt));

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
  if (!isFadingIn) updateShooting(dt);
  if (!isFadingIn) updateBullets(dt);
  if (!isFadingIn) updateEnemies(dt);
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
  if (!isFadingIn) updateOrbitals(dt);
  if (!isFadingIn) updateSummons(dt);

  // Shadow clone - follows player with a delay
  if (p.shadowClones > 0) {
    // Maintain position trail (only record when player moves)
    if (!game._cloneTrail) game._cloneTrail = [];
    if (!game._cloneTrailTime) game._cloneTrailTime = 0;
    game._cloneTrailTime += dt;
    // Record position with timestamp
    const lastTrail = game._cloneTrail[game._cloneTrail.length - 1];
    if (!lastTrail || Math.abs(p.x - lastTrail.x) > 0.5 || Math.abs(p.y - lastTrail.y) > 0.5) {
      game._cloneTrail.push({ x: p.x, y: p.y, t: game._cloneTrailTime });
    }
    const trailDelaySec = 0.2; // 200ms delay (was 12 frames @ 60fps)
    // Prune old entries beyond what we need
    const cutoffTime = game._cloneTrailTime - trailDelaySec - 0.5;
    while (game._cloneTrail.length > 2 && game._cloneTrail[0].t < cutoffTime) {
      game._cloneTrail.shift();
    }
    // Clone reads from the delayed position
    const targetTime = game._cloneTrailTime - trailDelaySec;
    let found = false;
    for (let ti = game._cloneTrail.length - 1; ti >= 0; ti--) {
      if (game._cloneTrail[ti].t <= targetTime) {
        game._cloneX = game._cloneTrail[ti].x;
        game._cloneY = game._cloneTrail[ti].y;
        found = true;
        break;
      }
    }
    if (!found && game._cloneX === undefined) {
      // Initial position: offset from player
      game._cloneX = p.x - 1.1 * T();
      game._cloneY = p.y + 0.44 * T();
    }

    if (!game.cloneShootTimer) game.cloneShootTimer = 0;
    game.cloneShootTimer -= dt;
    const cloneInput = getInput();
    if (!cloneInput.moving && game.enemies.length > 0 && game.cloneShootTimer <= 0) {
      game.cloneShootTimer = BASE_SHOOT_CD * p.cdMult * 1.2;
      const cloneX = game._cloneX;
      const cloneY = game._cloneY;
      let nearest = null, nd = Infinity;
      let nearestClear = null, ncd = Infinity;
      for (const e of game.enemies) {
        if (e._spawnTimer > 0 || e._underground || !isEnemyAlive(e)) continue;
        const d = dist(cloneX, cloneY, e.x, e.y);
        if (d < nd) { nd = d; nearest = e; }
        if (d < ncd) {
          let blocked = false;
          for (const ob of game.obstacles) {
            if (lineHitsRect(cloneX, cloneY, e.x, e.y, ob.x, ob.y, ob.w, ob.h)) { blocked = true; break; }
          }
          if (!blocked) { ncd = d; nearestClear = e; }
        }
      }
      const cloneTarget = nearestClear || nearest;
      if (cloneTarget) {
        const ang = Math.atan2(cloneTarget.y - cloneY, cloneTarget.x - cloneX);
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

  // Player dead? → enter dying state (KO animation plays, projectiles continue)
  if (p.hp <= 0) {
    p.hp = 0;
    game.state = 'dying';
    game.dyingTimer = getKoAnimDuration() + 0.3; // wait for KO anim + brief pause
    game.iFrames = 0; // stop invincibility flashing
    game._deadFadeTimer = 0; // reset game over screen fade-in
    sfxGameOver();
    clearLastRun();
    const globalStage = game.chapter * STAGES_PER_CHAPTER + game.stage;
    saveBest(globalStage);
    saveCoins(getCoins() + game.runCoins);
    return;
  }

  // All enemies dead → flush XP, process level-ups, then enter exit phase
  if (game.enemies.every(e => !isEnemyAlive(e)) && game.state === 'playing') {
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
    setDoorOpen3D(true);
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

    // Touch detection for angel (skip during entrance animation)
    const nowSec = getTime();
    for (let i = game.specialEntities.length - 1; i >= 0; i--) {
      const se = game.specialEntities[i];
      if (se._spawnTime && nowSec - se._spawnTime < 0.5) continue;
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
        // Start fade-out, then advance stage
        game._stageFadeOut = 1.0;
        game._stageFadeOutPending = true;
      }
    }
  }
}

// Project a game-space position to screen coordinates via the 3D camera
const _projVec = new THREE.Vector3();
function gameToScreen(gx, gy, yOffset) {
  const w = gameToWorld(gx, gy);
  _projVec.set(w.x, yOffset || 0, w.z);
  _projVec.project(camera);
  return {
    x: (_projVec.x * 0.5 + 0.5) * W,
    y: (-_projVec.y * 0.5 + 0.5) * H,
  };
}

function draw3DHealthBars(ctx, W, H) {
  const p = game.player;
  if (!p || !camera) return;

  // ── Enemy HP bars ──
  for (const e of game.enemies) {
    if (e._spawnTimer > 0 || e._underground) continue;
    if (e._deathTimer) continue; // hide bar during death animation
    if (e._displayHp === undefined) e._displayHp = e.hp;
    e._displayHp += (e.hp - e._displayHp) * 0.08;
    if (Math.abs(e._displayHp - e.hp) < 0.5) e._displayHp = e.hp;

    const screen = gameToScreen(e.x, e.y - e.r - 0.22 * T(), 1.8);
    const bw = 40, bh = 5;
    const bx = screen.x - bw / 2, by = screen.y;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 3); ctx.fill();
    const ghostRatio = clamp(e._displayHp / e.maxHp, 0, 1);
    if (ghostRatio > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw * ghostRatio, bh, 2); ctx.fill();
    }
    const realRatio = clamp(e.hp / e.maxHp, 0, 1);
    if (realRatio > 0) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath(); ctx.roundRect(bx, by, bw * realRatio, bh, 2); ctx.fill();
    }
  }

  // ── Player HP bar (follows eased 3D position) ──
  if (p._displayHp === undefined) p._displayHp = p.hp;
  p._displayHp += (p.hp - p._displayHp) * 0.08;
  if (Math.abs(p._displayHp - p.hp) < 0.5) p._displayHp = p.hp;

  // Project from the actual eased 3D player position, not the game position
  const playerPos = getPlayerWorldPos();
  if (!playerPos) return;
  _projVec.set(playerPos.x, 0, playerPos.z + 0.8); // offset below player in world Z
  _projVec.project(camera);
  const pScreen = {
    x: (_projVec.x * 0.5 + 0.5) * W,
    y: (-_projVec.y * 0.5 + 0.5) * H,
  };

  const hpBarW = 56, hpBarH = 7;
  const hpBarX = pScreen.x - hpBarW / 2, hpBarY = pScreen.y;
  const hpRatio = clamp(p.hp / p.maxHp, 0, 1);
  const ghostRatio = clamp(p._displayHp / p.maxHp, 0, 1);
  const hpColor = p.hp > p.maxHp * 0.3 ? '#2ecc71' : '#e74c3c';

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(hpBarX - 1, hpBarY - 1, hpBarW + 2, hpBarH + 2, 3); ctx.fill();
  if (ghostRatio > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.roundRect(hpBarX, hpBarY, hpBarW * ghostRatio, hpBarH, 2); ctx.fill();
  }
  if (hpRatio > 0) {
    ctx.fillStyle = hpColor;
    ctx.beginPath(); ctx.roundRect(hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 2); ctx.fill();
  }
  // HP text
  const hpText = fmt(Math.ceil(p.hp));
  ctx.font = 'bold 14px "Segoe UI",system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(hpText, pScreen.x, hpBarY - 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(hpText, pScreen.x, hpBarY - 2);
}

const backBtn = document.getElementById('backBtn');

function draw(dt) {
  dt = dt || 1 / 60;
  const isGameplay = game.state === 'playing' || game.state === 'exiting'
    || game.state === 'chapterClear' || game.state === 'levelUp'
    || game.state === 'dying' || game.state === 'dead' || game.state === 'paused';
  backBtn.classList.toggle('hidden', game.state !== 'menu');

  if (isGameplay) {
    // While waiting for models, show solid black — don't render 3D at all
    if (game._stageFadeIn > 0 && !game._modelsReady) {
      set3DVisible(false);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // 3D rendering for gameplay
    set3DVisible(true);
    const p = game.player;
    if (p) updateCamera(p.x, p.y, dt);
    updateArena3D(dt);
    syncEntities(dt);
    syncEffects();
    updateVFX(dt);
    render3D();
    // 2D canvas is transparent overlay for HUD + overlays
    ctx.clearRect(0, 0, W, H);
    drawHUD(ctx, W, H);
    draw3DHealthBars(ctx, W, H);
    // Stage indicator
    if (game.stageIndicatorTimer > 0) {
      const fadeDur = 0.8;
      const alpha = game.stageIndicatorTimer < fadeDur ? game.stageIndicatorTimer / fadeDur : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      const chDef = CHAPTERS[game.chapter];
      const chName = chDef ? chDef.name : 'Chapter ' + game.chapter;
      const totalStages = getChapterStages(game.chapter);
      const tx = 16;
      const ty = H - 16;
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const stageLabel = `Stage ${game.stage} / ${totalStages}`;
      ctx.font = 'bold 16px "Segoe UI",system-ui,sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.strokeText(stageLabel, tx, ty);
      ctx.fillStyle = '#fff';
      ctx.fillText(stageLabel, tx, ty);
      ctx.font = 'bold 13px "Segoe UI",system-ui,sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.strokeText(chName, tx, ty - 20);
      ctx.fillText(chName, tx, ty - 20);
      ctx.restore();
    }
    // Stage fade-in (black overlay until models loaded, then fade out over 600ms)
    if (game._stageFadeIn > 0) {
      if (game._modelsReady) {
        game._stageFadeIn = Math.max(0, game._stageFadeIn - dt / 0.6);
      }
      ctx.fillStyle = `rgba(0,0,0,${game._stageFadeIn})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Stage fade-out (fade to black over 250ms on completion)
    if (game._stageFadeOut > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - game._stageFadeOut})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Overlay states drawn on 2D canvas
    if (game.state === 'chapterClear') drawChapterClear(ctx, W, H);
    if (game.state === 'levelUp') drawLevelUpScreen(ctx, W, H);
    if (game.state === 'dead') drawGameOver(ctx, W, H);
    if (game.state === 'paused') drawPauseScreen(ctx, W, H);
    return;
  }

  // Non-gameplay: hide 3D, draw everything in 2D as before
  set3DVisible(false);
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
    if (se.type === 'angel') {
      const animDur = 0.8; // seconds to fly in
      const elapsed = se._spawnTime ? drawTime - se._spawnTime : animDur;
      const t = Math.min(elapsed / animDur, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const offsetY = (1 - ease) * -200;
      const alpha = ease;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawAngel(ctx, se.x, se.y + offsetY, se.r, drawTime);
      ctx.restore();
    }
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
    const cr = scaledR * 0.5;
    const fa = (p._facingAngle !== undefined ? p._facingAngle : -Math.PI / 2) + Math.PI / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(fa);
    ctx.beginPath();
    ctx.moveTo(0, -cr);
    ctx.lineTo(-cr * 0.8, cr * 0.5);
    ctx.lineTo(cr * 0.8, cr * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
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

    // Shadow clone (follows player with delay)
    if (p.shadowClones > 0 && game._cloneX !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.arc(game._cloneX, game._cloneY, PLAYER_R * T() * 0.85, 0, Math.PI * 2);
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

  // Stage indicator (bottom-left, fades out)
  if (game.stageIndicatorTimer > 0) {
    const fadeDur = 0.8;
    const alpha = game.stageIndicatorTimer < fadeDur ? game.stageIndicatorTimer / fadeDur : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    const chDef = CHAPTERS[game.chapter];
    const chName = chDef ? chDef.name : 'Chapter ' + game.chapter;
    const totalStages = getChapterStages(game.chapter);
    const tx = 16;
    const ty = H - 16;
    ctx.textAlign = 'left';
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
    resetLevelUpAnim();
  }
  prevState = game.state;

  if (game.state === 'playing' || game.state === 'exiting' || game.state === 'dying') update(dt);
  draw(dt);
}

// Start
startBtn.addEventListener('click', async () => {
  backBtn.classList.add('hidden');
  ensureAudio();
  await mapReady;
  initRenderer3D();
  set3DVisible(false);
  overlay.classList.add('hidden');
  game.state = 'map';
  lastTime = performance.now();
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(loop);
});
