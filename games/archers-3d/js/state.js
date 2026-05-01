export const game = {
  state: 'menu',       // 'menu','equip','map','skillInfo','playing','dying','dead','stageClear','chapterClear','levelUp','paused'
  dyingTimer: 0,       // countdown during 'dying' state before showing game over
  chapter: 1,          // current chapter (1-10)
  stage: 0,            // current stage within chapter (1-25)
  player: null,
  enemies: [],
  bullets: [],
  enemyBullets: [],
  obstacles: [],
  crystals: [],
  hearts: [],
  orbitals: [],
  strikeEffects: [],
  strikeProjectiles: [],
  starProjectiles: [],
  meteorProjectiles: [],
  clones: [],
  particles: [],
  runCoins: 0,
  levelUpChoices: [],
  shakeTimer: 0,
  shakeX: 0,
  shakeY: 0,
  stageTimer: 0,
  iFrames: 0,
  shootTimer: 0,
  specialEntities: [],
  deferredEntities: [],
  skipExitSpawns: false,
  waterTiles: [],
  spikeTiles: [],
  mapGrid: null,
  stuckArrows: [],
  boltArcs: [],
  camera: { x: 0, y: 0, targetY: 0, zoom: 1 },
  doorWalls: [],   // wall segments for the exit door (removed when door opens)
  doorOpen: false,  // whether the exit door is open
  startRun: false,
  returnToEquip: false,
  continueFromChapter: false,
  retryRun: false,
  pendingXP: 0, // XP earned during combat, applied after all enemies die
  stageIndicatorTimer: 0, // countdown for bottom-right stage indicator fade
  debug: { enabled: false, noDmgToPlayer: false, noDmgToEnemy: false, noVFX: false },
};
