// chapters.js - 11 chapters (0=tutorial, 1-10=main) with enemy definitions and stage generation
// CHAPTERS array is indexed by chapter id: CHAPTERS[0] = tutorial, CHAPTERS[1] = ch1, etc.
import { BOSS_INTERVAL, STAGES_PER_CHAPTER } from './constants.js';
import { weightedRandom } from './utils.js';
import { getEnemyType } from './enemyTypes.js';
import { getChapterConfig } from './mapData.js';

// ─── Chapter visual themes ───
// Each chapter gets floor, wall, door, and boundary colors/styles.
// Ch0 (Tutorial) shares Ch1's theme.
export const CHAPTER_THEMES = [
  // Ch0 - Tutorial (same as Ch1)
  { floor: '#6abf5a', floorGrid: 'rgba(0,0,0,0.15)', floorAccent: '#55a848',
    wall: '#5a5a5a', wallStroke: '#787878', wallDetail: '#444444',
    door: '#5a3a1e', doorStroke: '#8a6a3e', doorBars: '#4a2e14',
    doorGlow: '#90ee90', boundary: '#0d1f0d', boundaryEdge: 'rgba(60,120,60,0.25)',
    boundaryDetail: 'rgba(40,80,40,0.15)' },
  // Ch1 - Verdant Prairie
  { floor: '#6abf5a', floorGrid: 'rgba(0,0,0,0.15)', floorAccent: '#55a848',
    wall: '#5a5a5a', wallStroke: '#787878', wallDetail: '#444444',
    door: '#5a3a1e', doorStroke: '#8a6a3e', doorBars: '#4a2e14',
    doorGlow: '#90ee90', boundary: '#0d1f0d', boundaryEdge: 'rgba(60,120,60,0.25)',
    boundaryDetail: 'rgba(40,80,40,0.15)' },
  // Ch2 - Storm Desert
  { floor: '#3d2e1a', floorGrid: 'rgba(160,120,60,0.07)', floorAccent: '#2e2010',
    wall: '#8a7050', wallStroke: '#b09060', wallDetail: '#6a5030',
    door: '#6a5030', doorStroke: '#a08050', doorBars: '#504020',
    doorGlow: '#ffd700', boundary: '#2a1e0e', boundaryEdge: 'rgba(160,120,60,0.2)',
    boundaryDetail: 'rgba(120,90,40,0.12)' },
  // Ch3 - Abandoned Dungeon
  { floor: '#1a1a2e', floorGrid: 'rgba(80,80,140,0.06)', floorAccent: '#12122a',
    wall: '#4a4a6a', wallStroke: '#6a6a8a', wallDetail: '#3a3a5a',
    door: '#3a3a5a', doorStroke: '#6060a0', doorBars: '#2a2a4a',
    doorGlow: '#8888ff', boundary: '#0e0e1e', boundaryEdge: 'rgba(80,80,160,0.2)',
    boundaryDetail: 'rgba(60,60,120,0.1)' },
  // Ch4 - Crystal Mines
  { floor: '#1a2e2e', floorGrid: 'rgba(60,160,160,0.06)', floorAccent: '#102828',
    wall: '#2e5a5a', wallStroke: '#4a8a8a', wallDetail: '#1e4a4a',
    door: '#2a4a4a', doorStroke: '#4a8080', doorBars: '#1a3a3a',
    doorGlow: '#40e0d0', boundary: '#0e1e1e', boundaryEdge: 'rgba(60,160,160,0.2)',
    boundaryDetail: 'rgba(40,120,120,0.1)' },
  // Ch5 - Lost Castle
  { floor: '#261a3d', floorGrid: 'rgba(120,80,180,0.06)', floorAccent: '#1e1030',
    wall: '#5a3a7a', wallStroke: '#7a5aa0', wallDetail: '#4a2a6a',
    door: '#4a2a6a', doorStroke: '#7050a0', doorBars: '#3a1a5a',
    doorGlow: '#c898ff', boundary: '#160e26', boundaryEdge: 'rgba(120,80,180,0.2)',
    boundaryDetail: 'rgba(80,50,140,0.1)' },
  // Ch6 - Cave of Bones
  { floor: '#2e2a1a', floorGrid: 'rgba(140,120,80,0.06)', floorAccent: '#201c10',
    wall: '#5a5040', wallStroke: '#8a7a60', wallDetail: '#3a3020',
    door: '#4a3a20', doorStroke: '#7a6a40', doorBars: '#3a2a14',
    doorGlow: '#daa520', boundary: '#1a1a0e', boundaryEdge: 'rgba(140,120,80,0.2)',
    boundaryDetail: 'rgba(100,80,40,0.1)' },
  // Ch7 - Barrens of Shadow
  { floor: '#141418', floorGrid: 'rgba(60,60,80,0.05)', floorAccent: '#0a0a10',
    wall: '#2a2a3a', wallStroke: '#3a3a50', wallDetail: '#1a1a2a',
    door: '#222230', doorStroke: '#3a3a50', doorBars: '#1a1a28',
    doorGlow: '#6666aa', boundary: '#08080e', boundaryEdge: 'rgba(50,50,80,0.2)',
    boundaryDetail: 'rgba(30,30,60,0.1)' },
  // Ch8 - Silent Expanse
  { floor: '#2a2a1a', floorGrid: 'rgba(120,120,60,0.05)', floorAccent: '#1e1e10',
    wall: '#5a5a30', wallStroke: '#7a7a50', wallDetail: '#3a3a20',
    door: '#4a4a20', doorStroke: '#6a6a40', doorBars: '#3a3a14',
    doorGlow: '#cccc44', boundary: '#1a1a0e', boundaryEdge: 'rgba(120,120,60,0.2)',
    boundaryDetail: 'rgba(80,80,30,0.1)' },
  // Ch9 - Frozen Pinnacle
  { floor: '#1a2a3d', floorGrid: 'rgba(120,180,220,0.06)', floorAccent: '#102030',
    wall: '#4a6a8a', wallStroke: '#6a9aba', wallDetail: '#3a5a7a',
    door: '#3a5a7a', doorStroke: '#5a8ab0', doorBars: '#2a4a6a',
    doorGlow: '#88ddff', boundary: '#0e1828', boundaryEdge: 'rgba(100,160,220,0.25)',
    boundaryDetail: 'rgba(60,120,180,0.1)' },
  // Ch10 - Land of Doom
  { floor: '#3d1a1a', floorGrid: 'rgba(160,60,60,0.06)', floorAccent: '#2e1010',
    wall: '#6a2a2a', wallStroke: '#9a4a4a', wallDetail: '#4a1a1a',
    door: '#5a1a1a', doorStroke: '#8a3a3a', doorBars: '#4a1010',
    doorGlow: '#ff4444', boundary: '#1e0e0e', boundaryEdge: 'rgba(160,60,60,0.25)',
    boundaryDetail: 'rgba(120,30,30,0.1)' },
];

// ─── Chapter metadata ───
// `stages` overrides STAGES_PER_CHAPTER for that chapter (tutorial = 3).

export const CHAPTERS = [
  // ─── Chapter 0: Tutorial ───
  {
    id: 0, name: 'Tutorial', desc: 'Learn the basics',
    bgTint: '#0a2e0a',
    stages: 4,
    useNewSystem: true,
    enemyPool: [
      { id: 'tutorialPlant', weight: 1 },
    ],
    bossPool: [],
  },

  // ─── Chapter 1: Verdant Prairie ───
  {
    id: 1, name: 'Verdant Prairie', desc: 'Rolling grasslands teeming with creatures',
    bgTint: '#0a2e0a',
    useNewSystem: true,
    enemyPool: [
      // Animals
      { id: 'greenBat',         weight: 3 },
      { id: 'redBat',           weight: 2 },
      { id: 'brownWolf',        weight: 1 },
      // Living Bombs
      { id: 'whiteBomb',        weight: 2 },
      { id: 'blueBomb',         weight: 1 },
      // Plants
      { id: 'purplePlantBlue',  weight: 2 },
      { id: 'purplePlantGreen', weight: 2 },
      { id: 'greenStump',       weight: 2 },
      { id: 'blueStump',        weight: 1 },
      // Rock Golems
      { id: 'whiteGolem',       weight: 1 },
      { id: 'blueGolem',        weight: 1 },
      // Slimes
      { id: 'greenSlime',       weight: 3 },
      { id: 'redSlime',         weight: 2 },
      // Undead
      { id: 'greenSkeleton',    weight: 2 },
      { id: 'redSkeleton',      weight: 1 },
      { id: 'whiteSkull',       weight: 3 },
      { id: 'yellowSkull',      weight: 2 },
    ],
    bossPool: [
      { id: 'bossRedPlant',   stage: 5 },
      { id: 'bossBlueStump',  stage: 10 },
      { id: 'bossFireDragon', stage: 15 },
      { id: 'bossRedSkull',   stage: 20 },
      { id: 'bossBlueGolem',  stage: 25 },
    ],
  },

  // ─── Chapter 2: Storm Desert ───
  {
    id: 2, name: 'Storm Desert', desc: 'Scorching sands and ancient ruins',
    bgTint: '#2e1a0a',
    useNewSystem: true,
    enemyPool: [
      // Animals
      { id: 'purpleCroc',      weight: 2 },
      { id: 'greenSnake',      weight: 2 },
      { id: 'blueSpider',      weight: 2 },
      { id: 'brownWorm',       weight: 2 },
      // Ground Turret
      { id: 'electricTurret',  weight: 2 },
      // Living Bomb
      { id: 'redBomb',         weight: 2 },
      // Plant
      { id: 'desertCactus',    weight: 2 },
      // Undead
      { id: 'tornadoMage',     weight: 2 },
      { id: 'ch2WhiteSkull',   weight: 3 },
      { id: 'ch2YellowSkull',  weight: 2 },
    ],
    bossPool: [
      { id: 'bossGiantWorm',       stage: 5 },
      { id: 'bossRedSpider',       stage: 10 },
      { id: 'bossTornadoSkeleton', stage: 15 },
      { id: 'bossRedSkull2',       stage: 20 },
      { id: 'bossGiantCactus',     stage: 25 },
    ],
  },

  // ─── Chapter 3: Abandoned Dungeon ───
  {
    id: 3, name: 'Abandoned Dungeon', desc: 'A dark dungeon crawling with familiar foes',
    bgTint: '#0a0a2e',
    useNewSystem: true,
    enemyPool: [
      // Ch1 animals
      { id: 'greenBat',         weight: 2 },
      { id: 'redBat',           weight: 2 },
      { id: 'brownWolf',        weight: 1 },
      // Ch1 living bombs
      { id: 'whiteBomb',        weight: 2 },
      { id: 'blueBomb',         weight: 1 },
      // Ch2 living bomb
      { id: 'redBomb',          weight: 1 },
      // Ch1 plants
      { id: 'purplePlantBlue',  weight: 2 },
      { id: 'purplePlantGreen', weight: 2 },
      { id: 'greenStump',       weight: 2 },
      { id: 'blueStump',        weight: 1 },
      // Ch2 plant
      { id: 'desertCactus',     weight: 1 },
      // Ch1 golems
      { id: 'whiteGolem',       weight: 1 },
      { id: 'blueGolem',        weight: 1 },
      // Ch1 slimes
      { id: 'greenSlime',       weight: 2 },
      { id: 'redSlime',         weight: 1 },
      // Ch1+ch2 undead
      { id: 'greenSkeleton',    weight: 2 },
      { id: 'redSkeleton',      weight: 1 },
      { id: 'tornadoMage',      weight: 1 },
      { id: 'whiteSkull',       weight: 2 },
      { id: 'yellowSkull',      weight: 1 },
      // Ch2 animals
      { id: 'purpleCroc',       weight: 1 },
      { id: 'greenSnake',       weight: 1 },
      { id: 'blueSpider',       weight: 1 },
      { id: 'brownWorm',        weight: 1 },
    ],
    bossPool: [
      { id: 'bossGiantBat',      stage: 5 },
      { id: 'bossBrownWormX2',   stage: 10 },
      { id: 'bossRedPlantX2',    stage: 15 },
      { id: 'bossRedSkull',      stage: 20 },
      { id: 'bossElectricDragon', stage: 25 },
    ],
  },

  // ─── Chapter 4: Crystal Mines ───
  {
    id: 4, name: 'Crystal Mines', desc: 'Glittering tunnels full of danger',
    bgTint: '#0a2e2e',
    useNewSystem: true,
    enemyPool: [
      // Animals
      { id: 'redBat',           weight: 2 },
      { id: 'grayWolf',         weight: 2 },
      { id: 'brownWorm',        weight: 1 },
      // Elementals
      { id: 'fireSpirit',       weight: 2 },
      // Ground turret
      { id: 'purpleOrbTurret',  weight: 2 },
      // Plants
      { id: 'peashooter',       weight: 2 },
      { id: 'greenStump',       weight: 2 },
      // Undead
      { id: 'fireballMage',     weight: 2 },
      { id: 'mummy',            weight: 2 },
    ],
    bossPool: [
      { id: 'bossRedGolem',       stage: 5 },
      { id: 'bossFireSpirit',     stage: 10 },
      { id: 'bossFireballMage',   stage: 15 },
      { id: 'bossGreenStumpCh4',  stage: 20 },
      { id: 'bossDarkAngel',      stage: 25 },
    ],
  },

  // ─── Chapter 5: Lost Castle ───
  {
    id: 5, name: 'Lost Castle', desc: 'Ruins of a forgotten fortress',
    bgTint: '#1a0a2e',
    useNewSystem: true,
    enemyPool: [
      // Animals
      { id: 'oneEyedBat',       weight: 2 },
      { id: 'smallOneEyedBat',  weight: 2 },
      { id: 'brownWolfCh5',     weight: 2 },
      // Elementals
      { id: 'electricSpirit',   weight: 2 },
      // Ground turrets
      { id: 'crossbowTurret',   weight: 2 },
      { id: 'fireballTurret',   weight: 1 },
      // Rock golems
      { id: 'brownGolem',       weight: 1 },
      // Undead
      { id: 'blueScytheMage',   weight: 2 },
      { id: 'spearSkeleton',    weight: 2 },
      { id: 'swordSkeleton',    weight: 2 },
    ],
    bossPool: [
      { id: 'bossGiantArcher',        stage: 5 },
      { id: 'bossRoundElectricDragon', stage: 10 },
      { id: 'bossPurplePlant',        stage: 15 },
      { id: 'bossGrayWolf',           stage: 20 },
      { id: 'bossDemon',              stage: 25 },
    ],
  },

  // ─── Chapter 6: Cave of Bones ───
  {
    id: 6, name: 'Cave of Bones', desc: 'Deep caverns littered with remains',
    bgTint: '#1a1a0a',
    useNewSystem: true,
    enemyPool: [
      // Animals
      { id: 'oneEyedBat',       weight: 1 },
      { id: 'redBat',           weight: 1 },
      { id: 'redSpider',        weight: 2 },
      { id: 'brownWolfCh5',     weight: 1 },
      { id: 'brownWorm',        weight: 1 },
      { id: 'blueWorm',         weight: 2 },
      // Elementals
      { id: 'electricSpirit',   weight: 2 },
      { id: 'fireSpirit',       weight: 2 },
      // Rock golems
      { id: 'brownGolem',       weight: 1 },
      // Undead
      { id: 'fireballMage',     weight: 2 },
      { id: 'blueScytheMage',   weight: 2 },
      { id: 'mummy',            weight: 2 },
      { id: 'brownScarecrow',   weight: 2 },
      { id: 'spearSkeleton',    weight: 1 },
    ],
    bossPool: [
      { id: 'bossRedWorm',        stage: 5 },
      { id: 'bossGiantBatX2',     stage: 10 },
      { id: 'bossFireSpiritX2',   stage: 15 },
      { id: 'bossDemon',          stage: 20 },
      { id: 'bossFireDragonGiant', stage: 25 },
    ],
  },

  // ─── Chapter 7: Barrens of Shadow ───
  // Special: 10 stages, ALL boss stages with teammate enemies
  {
    id: 7, name: 'Barrens of Shadow', desc: 'Every shadow hides a champion',
    bgTint: '#0a0a1a',
    stages: 10,
    bossInterval: 1,  // every stage is a boss stage
    useNewSystem: true,
    enemyPool: [
      // Teammate pool (used alongside bosses)
      { id: 'brownWolfCh5',     weight: 2 },
      { id: 'oneEyedBat',       weight: 2 },
      { id: 'electricSpirit',   weight: 2 },
      { id: 'blueScytheMage',   weight: 2 },
      { id: 'brownScarecrow',   weight: 2 },
      { id: 'redSpider',        weight: 2 },
      { id: 'blueWorm',         weight: 1 },
      { id: 'fireSpirit',       weight: 1 },
      { id: 'mummy',            weight: 1 },
    ],
    bossPool: [
      { id: 'bossGiantBat',          stage: 1,  teammates: ['greenBat', 'redBat'] },
      { id: 'bossBlueGolem',         stage: 2,  teammates: ['whiteGolem', 'blueGolem'] },
      { id: 'bossGiantWorm',         stage: 3,  teammates: ['brownWorm', 'blueWorm'] },
      { id: 'bossGiantScarecrow',    stage: 4,  teammates: ['brownScarecrow', 'brownScarecrow'] },
      { id: 'bossFireSpirit',        stage: 5,  teammates: ['fireSpirit', 'electricSpirit'] },
      { id: 'bossGiantArcher',       stage: 6,  teammates: ['spearSkeleton', 'swordSkeleton'] },
      { id: 'bossDarkAngel',         stage: 7,  teammates: ['mummy', 'mummy'] },
      { id: 'bossFireDragonGiant',   stage: 8,  teammates: ['fireSpirit', 'fireSpirit'] },
      { id: 'bossDemon',             stage: 9,  teammates: ['blueScytheMage', 'brownScarecrow'] },
      { id: 'bossRedWormX2',         stage: 10, teammates: ['redSpider', 'redSpider'] },
    ],
  },

  // ─── Chapter 8: Silent Expanse ───
  {
    id: 8, name: 'Silent Expanse', desc: 'A vast quiet broken by buzzing wings',
    bgTint: '#1a1a0a',
    useNewSystem: true,
    enemyPool: [
      // New ch8 enemies
      { id: 'bee',              weight: 3 },
      { id: 'blueBlob',        weight: 2 },
      { id: 'blueScarecrow',   weight: 2 },
      // Returning enemies
      { id: 'brownScarecrow',  weight: 2 },
      { id: 'electricSpirit',  weight: 2 },
      { id: 'blueScytheMage',  weight: 1 },
      { id: 'brownWolfCh5',    weight: 1 },
      { id: 'redSpider',       weight: 1 },
      { id: 'mummy',           weight: 1 },
    ],
    bossPool: [
      { id: 'bossQueenBee',             stage: 5 },
      { id: 'bossGiantBrownScarecrow',  stage: 10 },
      { id: 'bossFireDragonX2',         stage: 15 },
      { id: 'bossLaserDragon',          stage: 20 },
      { id: 'bossMaceSkeleton',         stage: 25 },
    ],
  },

  // ─── Chapter 9: Frozen Pinnacle ───
  {
    id: 9, name: 'Frozen Pinnacle', desc: 'Ice and frost claim all who enter',
    bgTint: '#0a1a2e',
    useNewSystem: true,
    enemyPool: [
      // New ch9 ice enemies
      { id: 'woolyBat',        weight: 2 },
      { id: 'iceSpirit',       weight: 2 },
      { id: 'blueOrbTurret',   weight: 2 },
      { id: 'giantBlueBomb',   weight: 2 },
      { id: 'iceGrassHand',    weight: 2 },
      { id: 'iceGolem',        weight: 2 },
      { id: 'iceMage',         weight: 2 },
      // Returning enemies
      { id: 'blueWorm',        weight: 1 },
      { id: 'blueScarecrow',   weight: 1 },
    ],
    bossPool: [
      { id: 'bossBlueWorm',        stage: 5 },
      { id: 'bossGiantBlueBomb',   stage: 10 },
      { id: 'bossDragonfly',       stage: 15 },
      { id: 'bossIceSpirit',       stage: 20 },
      { id: 'bossIceAngel',        stage: 25 },
    ],
  },

  // ─── Chapter 10: Land of Doom ───
  {
    id: 10, name: 'Land of Doom', desc: 'The final challenge awaits',
    bgTint: '#2e0a1a',
    useNewSystem: true,
    enemyPool: [
      // Mix of all chapter enemies
      { id: 'bee',              weight: 2 },
      { id: 'blueScarecrow',   weight: 2 },
      { id: 'woolyBat',        weight: 2 },
      { id: 'iceSpirit',       weight: 2 },
      { id: 'iceMage',         weight: 2 },
      { id: 'iceGolem',        weight: 2 },
      { id: 'redSpider',       weight: 2 },
      { id: 'blueWorm',        weight: 2 },
      { id: 'brownScarecrow',  weight: 1 },
      { id: 'giantBlueBomb',   weight: 1 },
      { id: 'blueBlob',        weight: 1 },
      { id: 'iceGrassHand',    weight: 1 },
    ],
    bossPool: [
      { id: 'bossGiantScytheMage',   stage: 5 },
      { id: 'bossGiantGrayBombX2',   stage: 10 },
      { id: 'bossDragonflyX2',       stage: 15 },
      { id: 'bossDemon',             stage: 20 },
      { id: 'bossIceDragon',         stage: 25 },
    ],
  },
];

/**
 * Get the number of stages for a chapter.
 * Uses map config if available, then chapter definition, then default.
 */
export function getChapterStages(chapter) {
  const mapConfig = getChapterConfig(chapter);
  if (mapConfig?.stageCount) return mapConfig.stageCount;
  const ch = CHAPTERS[chapter];
  return ch?.stages || STAGES_PER_CHAPTER;
}

// ─── Public API ───

/**
 * Get chapter metadata by chapter number (0-indexed: 0=tutorial, 1-10=main).
 */
export function getChapter(chapter) {
  return CHAPTERS[chapter] || null;
}

/**
 * Get the enemy spawn pool for a chapter.
 * Returns array of { id, type, weight } where type is the full ENEMY_TYPES definition.
 */
export function getEnemyPool(chapter) {
  const ch = CHAPTERS[chapter];
  if (!ch || !ch.enemyPool) return [];

  return ch.enemyPool.map(entry => ({
    id: entry.id,
    weight: entry.weight,
    type: getEnemyType(entry.id),
  }));
}

/**
 * Get boss definitions for a chapter.
 * Returns array of { id, stage, type } where type is the full ENEMY_TYPES definition.
 */
export function getBossPool(chapter) {
  const ch = CHAPTERS[chapter];
  if (!ch) return [];

  return (ch.bossPool || []).map(entry => ({
    id: entry.id,
    stage: entry.stage,
    type: getEnemyType(entry.id),
    teammates: entry.teammates || null,
  }));
}

/**
 * Get the specific boss for a given stage, or null if it's not a boss stage.
 */
export function getBossForStage(chapter, stageInChapter) {
  const ch = CHAPTERS[chapter];
  const interval = ch?.bossInterval || BOSS_INTERVAL;
  if (stageInChapter % interval !== 0) return null;
  const pool = getBossPool(chapter);
  const exact = pool.find(b => b.stage === stageInChapter);
  if (exact) return exact;
  return pool[0] || null;
}

/**
 * Pick a random enemy type from the chapter's pool, respecting weights.
 * Returns { id, type } or null.
 */
export function pickRandomEnemy(chapter) {
  const pool = getEnemyPool(chapter);
  if (pool.length === 0) return null;
  return weightedRandom(pool, e => e.weight);
}

// ─── Scaling ───

const SPEED_SCALE_CAP = 1.6;

/**
 * Compute difficulty scale for a chapter/stage.
 * Each chapter doubles: ch1=1x, ch2=2x, ch3=4x, ch4=8x...
 * Within a chapter, scales linearly from base to 2x base (= next chapter start).
 * Formula: 2^(chapter-1) * (1 + stageProgress)
 * where stageProgress goes 0..1 from first to last stage.
 */
export function getStageScale(chapter, stageInChapter) {
  const chapterDef = CHAPTERS[chapter];
  const maxStages = chapterDef?.stages || STAGES_PER_CHAPTER;
  const stageProgress = maxStages > 1 ? (stageInChapter - 1) / (maxStages - 1) : 0;
  const base = Math.pow(2, Math.max(chapter - 1, 0));
  return base * (1 + stageProgress);
}

/**
 * Apply speed scale with cap so enemies don't get absurdly fast.
 */
export function getSpeedScale(scale) {
  return Math.min(scale, SPEED_SCALE_CAP);
}

// ─── Stage enemy generation ───

/**
 * Generate enemy definitions for a given stage.
 * Returns an array of enemy spawn descriptors ready for spawnEnemies().
 */
export function genStageEnemies(chapter, stageInChapter) {
  const chapterDef = CHAPTERS[chapter];
  if (!chapterDef) return [];

  const maxStages = chapterDef.stages || STAGES_PER_CHAPTER;
  const interval = chapterDef.bossInterval || BOSS_INTERVAL;
  const scale = getStageScale(chapter, stageInChapter);
  const isBoss = stageInChapter % interval === 0 && stageInChapter <= maxStages;
  const isChapterBoss = stageInChapter === maxStages && isBoss;

  return genNewSystemStage(chapter, stageInChapter, scale, isBoss, isChapterBoss);
}

// ─── New system stage gen ───

function genNewSystemStage(chapter, stageInChapter, scale, isBoss, isChapterBoss) {
  const enemies = [];

  if (isBoss) {
    const bossEntry = getBossForStage(chapter, stageInChapter);
    if (bossEntry && bossEntry.type) {
      const bossCount = bossEntry.type.bossCount || 1;
      for (let bc = 0; bc < bossCount; bc++) {
        enemies.push(makeNewEnemy(bossEntry.id, bossEntry.type, scale, {
          isBoss: true,
          isChapterBoss,
          guaranteedDrop: bc === 0, // only first drops loot
          bossScale: isChapterBoss ? 1.5 : 1.0,
        }));
      }
    }
    // Spawn teammates if specified (ch7 all-boss-stages mechanic)
    if (bossEntry && bossEntry.teammates) {
      for (const tmId of bossEntry.teammates) {
        const tmType = getEnemyType(tmId);
        if (tmType) enemies.push(makeNewEnemy(tmId, tmType, scale, {}));
      }
    }
    // Mini-boss stages can have 1 regular add (if no teammates already)
    else if (!isChapterBoss && stageInChapter >= 10) {
      const pick = pickRandomEnemy(chapter);
      if (pick) enemies.push(makeNewEnemy(pick.id, pick.type, scale, {}));
    }
  } else {
    // Regular stages: 1-3 enemies based on position in the 5-stage group
    const posInGroup = (stageInChapter - 1) % BOSS_INTERVAL;
    const count = Math.min(1 + Math.floor(posInGroup * 0.7), 3);
    for (let i = 0; i < count; i++) {
      const pick = pickRandomEnemy(chapter);
      if (pick) enemies.push(makeNewEnemy(pick.id, pick.type, scale, {}));
    }
  }

  return enemies;
}

/**
 * Build a spawn descriptor from an ENEMY_TYPES definition.
 */
function makeNewEnemy(typeId, type, scale, opts) {
  const bossScale = opts.bossScale || 1;
  return {
    typeId,
    hp: Math.floor(type.baseHp * scale * bossScale),
    speed: type.baseSpeed * getSpeedScale(scale),
    r: type.baseR || 13,
    draw: type.draw,
    color: type.color,
    colorAlt: type.colorAlt,
    shape: type.draw,
    ai: type.ai,
    aiParams: { ...type.aiParams },
    attack: type.attack || 'none',
    attackParams: type.attackParams ? { ...type.attackParams } : {},
    attackPhases: type.attackPhases || null,
    shoots: type.attack !== 'none' || !!type.attackPhases,
    shootInterval: type.attackParams?.shootInterval || (type.attackPhases ? 0 : 99),
    splitOnDeath: type.splitOnDeath || null,
    xpValue: Math.floor((type.xpValue || 10) * scale),
    crystalValue: type.crystalValue || 1,
    isBoss: opts.isBoss || false,
    isChapterBoss: opts.isChapterBoss || false,
    guaranteedDrop: opts.guaranteedDrop || false,
    boss: type.boss || false,
  };
}

