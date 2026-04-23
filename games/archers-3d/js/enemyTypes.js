// enemyTypes.js - Enemy type registry (pure data / blueprints)
// Each entry is a template used by chapters.js to spawn enemies.
// AI functions, draw functions, and attack patterns are referenced by string keys
// and implemented in enemyAI.js, enemyDraw.js, and enemies.js respectively.

// ─── AI KEYS ───
// 'hoverLunge'  - hovers in place, then lunges at player (bats)
// 'stalkCharge' - follows at distance, anticipates player dir, then charges (wolves)
// 'stationary'  - does not move, shoots only (plants, stumps)
// 'lobber'      - wanders slowly, lobs arcing projectiles (living bombs)
// 'randomDash'  - dashes in random directions unpredictably (slimes)
// 'chase'       - constantly pursues the player (skulls)
// 'spinThrow'   - spins in place then throws projectiles in a fan (golems)
// 'spinCharge'  - spins toward the player then throws (blue golem)
// 'bounce'      - bounces off arena walls (boss skull)
//
// ─── ATTACK PATTERN KEYS ───
// 'none'        - no ranged attack
// 'single'      - fires 1 bullet at player
// 'lobSingle'   - lobs 1 arcing projectile at player (passes over walls)
// 'lobMulti'    - lobs N arcing projectiles at player
// 'fan'         - fires N bullets in a fan aimed at player
// 'cardinal'    - fires bullets in 4 cardinal directions (up/down/left/right)
// 'cardinal8'   - fires bullets in 8 directions
// 'bouncySingle'- fires 1 bullet at player that bounces off walls
// 'barrage'     - fires N bullets in a line toward player
// 'random'      - fires N bullets in random directions
//
// ─── DRAW KEYS ───
// 'bat', 'wolf', 'bomb', 'plant', 'stump', 'golem', 'slime',
// 'skeleton', 'skull', 'dragon'

export const ENEMY_TYPES = {

  // ══════════════════════════════════════
  // SPECIAL - Treasure Chest (spawns in exit phase)
  // ══════════════════════════════════════

  treasureChest: {
    name: 'Treasure Chest',
    chapter: -1,
    category: 'special',
    special: true,
    draw: 'chest',
    color: '#f39c12',
    colorAlt: '#8B4513',
    baseR: 16,
    baseHp: 60,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'lobSingle',
    attackParams: {
      shootInterval: 3.0,
      lobSpeed: 110,
      lobArc: 0.6,
    },
    xpValue: 20,
    crystalValue: 5,
  },

  // ══════════════════════════════════════
  // CHAPTER 0 - Tutorial
  // ══════════════════════════════════════

  tutorialPlant: {
    name: 'Purple Plant',
    chapter: 0,
    category: 'plant',
    draw: 'plant',
    color: '#8e44ad',
    colorAlt: '#5b7fc7',
    baseR: 13,
    baseHp: 15,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 3.5,      // slower than chapter 1 version
      lobSpeed: 100,
      lobArc: 0.6,
    },
    xpValue: 8,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Animals
  // ══════════════════════════════════════

  greenBat: {
    name: 'Green-Winged Bat',
    chapter: 1,
    category: 'animal',
    draw: 'bat',
    color: '#2ecc71',
    colorAlt: '#1a9c4a',
    baseR: 12,
    baseHp: 20,
    baseSpeed: 30,
    ai: 'hoverLunge',
    aiParams: {
      hoverTime: [1.5, 3.0],   // seconds to hover before lunging
      lungeSpeed: 280,          // speed during lunge
      lungeRange: 130,          // distance at which lunge triggers
      lungeDuration: 0.35,      // seconds the lunge lasts
      ignoreWalls: true,        // flies over obstacles during lunge
    },
    attack: 'none',
    attackParams: {},
    xpValue: 8,
    crystalValue: 1,
  },

  redBat: {
    name: 'Red-Winged Bat',
    chapter: 1,
    category: 'animal',
    draw: 'bat',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 12,
    baseHp: 22,
    baseSpeed: 40,
    ai: 'hoverLunge',
    aiParams: {
      hoverTime: [1.0, 2.5],
      lungeSpeed: 320,
      lungeRange: 140,
      lungeDuration: 0.35,
      ignoreWalls: true,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 10,
    crystalValue: 1,
  },

  brownWolf: {
    name: 'Brown Wolf',
    chapter: 1,
    category: 'animal',
    rare: true,
    draw: 'wolf',
    color: '#8B4513',
    colorAlt: '#654321',
    baseR: 14,
    baseHp: 35,
    baseSpeed: 45,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [100, 160],   // keeps this distance while stalking
      stalkTime: [2.0, 4.0],    // stalks for this long before charging
      chargeSpeed: 350,
      chargeDuration: 0.5,
      anticipatePlayer: true,   // charges toward player's last movement direction
    },
    attack: 'none',
    attackParams: {},
    xpValue: 15,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Living Bombs
  // ══════════════════════════════════════

  whiteBomb: {
    name: 'White Living Bomb',
    chapter: 1,
    category: 'bomb',
    draw: 'bomb',
    color: '#ecf0f1',
    colorAlt: '#bdc3c7',
    baseR: 11,
    baseHp: 18,
    baseSpeed: 25,
    ai: 'lobber',
    aiParams: {
      wanderSpeed: 25,
    },
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 2.8,
      lobSpeed: 140,
      lobArc: 0.6,             // arc height multiplier
    },
    xpValue: 8,
    crystalValue: 1,
  },

  blueBomb: {
    name: 'Blue Living Bomb',
    chapter: 1,
    category: 'bomb',
    draw: 'bomb',
    color: '#3498db',
    colorAlt: '#2980b9',
    baseR: 11,
    baseHp: 22,
    baseSpeed: 25,
    ai: 'lobber',
    aiParams: {
      wanderSpeed: 25,
    },
    attack: 'lobMulti',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 3.2,
      count: 3,
      lobSpeed: 140,
      lobArc: 0.6,
      spread: 0.3,             // radians spread between lobbed shots
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Plants
  // ══════════════════════════════════════

  purplePlantBlue: {
    name: 'Purple Plant (Blue Vines)',
    chapter: 1,
    category: 'plant',
    draw: 'plant',
    color: '#8e44ad',
    colorAlt: '#5b7fc7',       // blue vines
    baseR: 13,
    baseHp: 25,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 2.5,
      lobSpeed: 130,
      lobArc: 0.7,
    },
    xpValue: 8,
    crystalValue: 1,
  },

  purplePlantGreen: {
    name: 'Purple Plant (Green Vines)',
    chapter: 1,
    category: 'plant',
    draw: 'plant',
    color: '#8e44ad',
    colorAlt: '#27ae60',       // green vines
    baseR: 13,
    baseHp: 28,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'lobMulti',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 2.8,
      count: 2,
      lobSpeed: 130,
      lobArc: 0.7,
      spread: 0.25,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  greenStump: {
    name: 'Green Tree Stump',
    chapter: 1,
    category: 'plant',
    draw: 'stump',
    color: '#27ae60',
    colorAlt: '#6d4c2a',       // wood brown
    baseR: 15,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'cardinal',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 2.2,
      bulletBounce: true,      // projectiles bounce off walls
    },
    xpValue: 12,
    crystalValue: 1,
  },

  blueStump: {
    name: 'Blue Tree Stump',
    chapter: 1,
    category: 'plant',
    draw: 'stump',
    color: '#2980b9',
    colorAlt: '#6d4c2a',
    baseR: 15,
    baseHp: 40,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'cardinal8',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 2.5,
      bulletBounce: true,
    },
    xpValue: 14,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Rock Golems
  // ══════════════════════════════════════

  whiteGolem: {
    name: 'White Rock Golem',
    chapter: 1,
    category: 'golem',
    draw: 'golem',
    color: '#bdc3c7',
    colorAlt: '#95a5a6',
    baseR: 16,
    baseHp: 50,
    baseSpeed: 30,
    ai: 'spinThrow',
    aiParams: {
      spinDuration: 0.8,       // seconds spinning before throwing
      restTime: [2.0, 3.5],    // seconds between spin cycles
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 3.5,      // tied to spin cycle
      count: 3,                // 1 forward + 2 diagonal
      spread: 0.6,             // radians total fan spread
      bulletSpeed: 160,
    },
    xpValue: 14,
    crystalValue: 2,
  },

  blueGolem: {
    name: 'Blue Rock Golem',
    chapter: 1,
    category: 'golem',
    draw: 'golem',
    color: '#5dade2',
    colorAlt: '#2e86c1',
    baseR: 16,
    baseHp: 55,
    baseSpeed: 35,
    ai: 'spinCharge',
    aiParams: {
      spinDuration: 0.8,
      restTime: [1.8, 3.0],
      chargeSpeed: 120,        // moves toward player while spinning
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 3.0,
      count: 5,
      spread: 0.9,
      bulletSpeed: 160,
    },
    xpValue: 16,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Slimes
  // ══════════════════════════════════════

  greenSlime: {
    name: 'Green Slime',
    chapter: 1,
    category: 'slime',
    draw: 'slime',
    color: '#2ecc71',
    colorAlt: '#27ae60',
    baseR: 11,
    baseHp: 18,
    baseSpeed: 50,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 200,
      dashDuration: 0.3,
      dashCooldown: [0.8, 2.0],
      dashRange: 80,           // max distance per dash
    },
    attack: 'none',
    attackParams: {},
    xpValue: 6,
    crystalValue: 1,
  },

  redSlime: {
    name: 'Red Slime',
    chapter: 1,
    category: 'slime',
    draw: 'slime',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 13,
    baseHp: 28,
    baseSpeed: 55,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 220,
      dashDuration: 0.3,
      dashCooldown: [0.6, 1.5],
      dashRange: 90,
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'greenSlime',
      count: 2,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 - Verdant Prairie: Undead
  // ══════════════════════════════════════

  greenSkeleton: {
    name: 'Green Skeleton Archer',
    chapter: 1,
    category: 'undead',
    draw: 'skeleton',
    color: '#2ecc71',
    colorAlt: '#f1e7c9',      // bone
    baseR: 13,
    baseHp: 22,
    baseSpeed: 35,
    ai: 'chase',
    aiParams: {
      preferredDist: 120,      // tries to keep this distance
      moveStyle: 'walk',
    },
    attack: 'single',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 2.0,
      bulletSpeed: 180,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  redSkeleton: {
    name: 'Red Skeleton Archer',
    chapter: 1,
    category: 'undead',
    draw: 'skeleton',
    color: '#e74c3c',
    colorAlt: '#f1e7c9',
    baseR: 13,
    baseHp: 25,
    baseSpeed: 35,
    ai: 'chase',
    aiParams: {
      preferredDist: 140,
      moveStyle: 'walk',
    },
    attack: 'bouncySingle',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 2.2,
      bulletSpeed: 170,
      bulletBounces: 2,        // bounces off walls N times
    },
    xpValue: 12,
    crystalValue: 1,
  },

  whiteSkull: {
    name: 'White Skull',
    chapter: 1,
    category: 'undead',
    draw: 'skull',
    color: '#ecf0f1',
    colorAlt: '#bdc3c7',
    baseR: 11,
    baseHp: 15,
    baseSpeed: 30,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,        // chases directly, no preferred range
      moveStyle: 'walk',
    },
    attack: 'none',
    attackParams: {},
    xpValue: 6,
    crystalValue: 1,
  },

  yellowSkull: {
    name: 'Yellow Skull',
    chapter: 1,
    category: 'undead',
    draw: 'skull',
    color: '#f1c40f',
    colorAlt: '#f39c12',
    baseR: 13,
    baseHp: 25,
    baseSpeed: 30,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'whiteSkull',
      count: 2,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 1 BOSSES - Verdant Prairie
  // ══════════════════════════════════════

  bossRedPlant: {
    name: 'Giant Red Plant',
    chapter: 1,
    category: 'plant',
    boss: true,
    draw: 'plant',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 28,
    baseHp: 200,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    // Boss attack phases: cycles through these on timers
    attackPhases: [
      {
        name: '5-Line Barrage',
        pattern: 'barrage',
        params: {
          bulletStyle: 'acid',
          count: 5,            // 5 parallel lines
          bulletsPerLine: 4,
          bulletSpeed: 160,
          lineSpread: 0.15,    // radians between lines
          burstDelay: 0.12,    // seconds between bullets in a line
        },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: {
          bulletStyle: 'acid',
          count: 12,
          bulletSpeed: 140,
          burstDelay: 0.08,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 40,
    crystalValue: 5,
  },

  bossBlueStump: {
    name: 'Giant Blue Tree Stump',
    chapter: 1,
    category: 'plant',
    boss: true,
    draw: 'stump',
    color: '#2980b9',
    colorAlt: '#6d4c2a',
    baseR: 30,
    baseHp: 250,
    baseSpeed: 0,
    ai: 'stationary',          // stationary between bounces
    aiParams: {},
    attackPhases: [
      {
        name: 'Bounce and Release',
        pattern: 'cardinal8',
        params: {
          bulletStyle: 'rock',
          bulletSpeed: 150,
          bulletBounce: true,
          preAction: 'bounce',  // bounces 3 times before releasing
          bounceCount: 3,
          bounceSpeed: 200,
        },
        duration: 4.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: {
          bulletStyle: 'rock',
          count: 10,
          bulletSpeed: 130,
          burstDelay: 0.1,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 50,
    crystalValue: 6,
  },

  bossFireDragon: {
    name: 'Round Fire Dragon',
    chapter: 1,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#e67e22',
    colorAlt: '#d35400',
    baseR: 30,
    baseHp: 300,
    baseSpeed: 20,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: '3-Shooter Fan',
        pattern: 'fan',
        params: {
          bulletStyle: 'fire',
          count: 3,
          bulletSpeed: 120,
          spread: 0.5,
          bulletsPerShot: 2,   // 2 shots per fan direction
          burstDelay: 0.15,
        },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: '1-Line Fireball Barrage',
        pattern: 'barrage',
        params: {
          bulletStyle: 'fire',
          count: 1,
          bulletsPerLine: 5,
          bulletSpeed: 160,
          lineSpread: 0,
          burstDelay: 0.1,
        },
        duration: 1.5,
        cooldown: 2.5,
      },
    ],
    xpValue: 60,
    crystalValue: 7,
  },

  bossRedSkull: {
    name: 'Giant Red Skull',
    chapter: 1,
    category: 'undead',
    boss: true,
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 28,
    baseHp: 250,
    baseSpeed: 60,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 180,
    },
    attack: 'none',
    attackParams: {},
    // Splits at 50% HP into 2 smaller versions, those split again at 50%
    splitOnDeath: {
      spawnType: 'bossRedSkullMed',
      count: 2,
    },
    xpValue: 50,
    crystalValue: 6,
  },

  // Sub-units for boss red skull split chain
  bossRedSkullMed: {
    name: 'Red Skull',
    chapter: 1,
    category: 'undead',
    boss: false,
    subUnit: true,             // not in any spawn pool, only from splits
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 18,
    baseHp: 80,
    baseSpeed: 70,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 200,
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'bossRedSkullSmall',
      count: 2,
    },
    xpValue: 15,
    crystalValue: 2,
  },

  bossRedSkullSmall: {
    name: 'Tiny Red Skull',
    chapter: 1,
    category: 'undead',
    boss: false,
    subUnit: true,
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 11,
    baseHp: 30,
    baseSpeed: 80,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 220,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 8,
    crystalValue: 1,
  },

  bossBlueGolem: {
    name: 'Giant Blue Rock Golem',
    chapter: 1,
    category: 'golem',
    boss: true,
    draw: 'golem',
    color: '#5dade2',
    colorAlt: '#2e86c1',
    baseR: 32,
    baseHp: 400,
    baseSpeed: 25,
    ai: 'spinThrow',
    aiParams: {
      spinDuration: 1.0,
      restTime: [2.0, 3.0],
    },
    attackPhases: [
      {
        name: 'Spin and Release',
        pattern: 'fan',
        params: {
          count: 5,
          spread: 1.0,
          bulletSpeed: 150,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Rock Throw',
        pattern: 'fan',
        params: {
          count: 8,
          spread: 1.4,
          bulletSpeed: 140,
        },
        duration: 2.0,
        cooldown: 3.0,
      },
      {
        name: 'Summon Golem',
        pattern: 'summon',
        params: {
          spawnType: 'whiteGolem',
          maxActive: 2,
        },
        duration: 1.0,
        cooldown: 8.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 - Storm Desert: Animals
  // ══════════════════════════════════════

  purpleCroc: {
    name: 'Purple Crocodile',
    chapter: 2,
    category: 'animal',
    draw: 'crocodile',
    color: '#8e44ad',
    colorAlt: '#6c3483',
    baseR: 15,
    baseHp: 40,
    baseSpeed: 25,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.5,
      count: 5,
      spread: 0.4,
      bulletSpeed: 200,
    },
    xpValue: 14,
    crystalValue: 2,
  },

  greenSnake: {
    name: 'Green Snake',
    chapter: 2,
    category: 'animal',
    draw: 'snake',
    color: '#27ae60',
    colorAlt: '#1e8449',
    baseR: 10,
    baseHp: 25,
    baseSpeed: 50,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [80, 130],
      stalkTime: [1.5, 3.0],
      chargeSpeed: 380,
      chargeDuration: 0.4,
      anticipatePlayer: false,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 10,
    crystalValue: 1,
  },

  blueSpider: {
    name: 'Blue Spider',
    chapter: 2,
    category: 'animal',
    draw: 'spider',
    color: '#2980b9',
    colorAlt: '#1a5276',
    baseR: 11,
    baseHp: 22,
    baseSpeed: 65,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 250,
      dashDuration: 0.25,
      dashCooldown: [0.5, 1.5],
      dashRange: 100,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 8,
    crystalValue: 1,
  },

  brownWorm: {
    name: 'Brown Worm',
    chapter: 2,
    category: 'animal',
    draw: 'worm',
    color: '#8B4513',
    colorAlt: '#6d3610',
    baseR: 14,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [2.0, 3.5],
      undergroundTime: [1.0, 1.8],
      burrowTransition: 0.4,
    },
    attack: 'lobMulti',
    attackParams: {
      shootInterval: 99,        // controlled by burrow AI (fires on emerge)
      count: 3,
      lobSpeed: 120,
      lobArc: 0.7,
      spread: 0.35,
    },
    xpValue: 12,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 - Storm Desert: Ground Turret
  // ══════════════════════════════════════

  electricTurret: {
    name: 'Electric Ground Turret',
    chapter: 2,
    category: 'turret',
    draw: 'turret',
    color: '#f1c40f',
    colorAlt: '#7d6608',
    baseR: 13,
    baseHp: 30,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'lobMulti',
    attackParams: {
      bulletStyle: 'bolt',
      shootInterval: 3.0,
      count: 4,
      lobSpeed: 100,
      lobArc: 0.8,
      spread: 1.2,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 - Storm Desert: Living Bomb
  // ══════════════════════════════════════

  redBomb: {
    name: 'Red Living Bomb',
    chapter: 2,
    category: 'bomb',
    draw: 'bomb',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 11,
    baseHp: 24,
    baseSpeed: 25,
    ai: 'lobber',
    aiParams: {
      wanderSpeed: 25,
    },
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 2.5,
      lobSpeed: 140,
      lobArc: 0.6,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 - Storm Desert: Plant
  // ══════════════════════════════════════

  desertCactus: {
    name: 'Cactus',
    chapter: 2,
    category: 'plant',
    draw: 'cactus',
    color: '#27ae60',
    colorAlt: '#1e8449',
    baseR: 14,
    baseHp: 30,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'single',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 1.8,
      bulletSpeed: 220,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 - Storm Desert: Undead
  // ══════════════════════════════════════

  tornadoMage: {
    name: 'Tornado Mage',
    chapter: 2,
    category: 'undead',
    draw: 'mage',
    color: '#7f8c8d',
    colorAlt: '#5d6d7e',
    baseR: 13,
    baseHp: 30,
    baseSpeed: 30,
    ai: 'chase',
    aiParams: {
      preferredDist: 140,
      moveStyle: 'walk',
    },
    attack: 'bouncySingle',
    attackParams: {
      bulletStyle: 'bolt',
      shootInterval: 2.5,
      bulletSpeed: 150,
      bulletBounces: 3,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  ch2WhiteSkull: {
    name: 'White Skull',
    chapter: 2,
    category: 'undead',
    draw: 'skull',
    color: '#ecf0f1',
    colorAlt: '#bdc3c7',
    baseR: 12,
    baseHp: 22,
    baseSpeed: 35,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attack: 'none',
    attackParams: {},
    xpValue: 8,
    crystalValue: 1,
  },

  ch2YellowSkull: {
    name: 'Yellow Skull',
    chapter: 2,
    category: 'undead',
    draw: 'skull',
    color: '#f1c40f',
    colorAlt: '#f39c12',
    baseR: 14,
    baseHp: 32,
    baseSpeed: 32,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'ch2WhiteSkull',
      count: 2,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 2 BOSSES - Storm Desert
  // ══════════════════════════════════════

  bossGiantWorm: {
    name: 'Giant Brown Worm',
    chapter: 2,
    category: 'animal',
    boss: true,
    draw: 'worm',
    color: '#8B4513',
    colorAlt: '#6d3610',
    baseR: 30,
    baseHp: 280,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [3.0, 5.0],
      undergroundTime: [1.5, 2.5],
      burrowTransition: 0.5,
    },
    attackPhases: [
      {
        name: '3-4 Shooter',
        pattern: 'fan',
        params: {
          bulletStyle: 'acid',
          count: 4,
          spread: 0.5,
          bulletSpeed: 160,
        },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: {
          bulletStyle: 'acid',
          count: 14,
          bulletSpeed: 140,
          burstDelay: 0.08,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Fire Bomb',
        pattern: 'lobMulti',
        params: {
          bulletStyle: 'acid',
          count: 2,
          lobSpeed: 110,
          lobArc: 0.8,
          spread: 0.3,
        },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 50,
    crystalValue: 6,
  },

  bossRedSpider: {
    name: 'Giant Red Spider',
    chapter: 2,
    category: 'animal',
    boss: true,
    draw: 'spider',
    color: '#e74c3c',
    colorAlt: '#922b21',
    baseR: 28,
    baseHp: 260,
    baseSpeed: 60,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 200,
      dashDuration: 0.4,
      dashCooldown: [1.0, 2.5],
      dashRange: 120,
    },
    attackPhases: [
      {
        name: '8-Shooter',
        pattern: 'cardinal8',
        params: {
          bulletStyle: 'skull',
          bulletSpeed: 140,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    splitOnDeath: {
      spawnType: 'bossRedSpiderMed',
      count: 2,
    },
    xpValue: 50,
    crystalValue: 6,
  },

  bossRedSpiderMed: {
    name: 'Red Spider',
    chapter: 2,
    category: 'animal',
    boss: false,
    subUnit: true,
    draw: 'spider',
    color: '#e74c3c',
    colorAlt: '#922b21',
    baseR: 18,
    baseHp: 80,
    baseSpeed: 70,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 220,
      dashDuration: 0.3,
      dashCooldown: [0.8, 2.0],
      dashRange: 100,
    },
    attack: 'single',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.5,
      bulletSpeed: 150,
    },
    splitOnDeath: {
      spawnType: 'bossRedSpiderSmall',
      count: 2,
    },
    xpValue: 15,
    crystalValue: 2,
  },

  bossRedSpiderSmall: {
    name: 'Tiny Red Spider',
    chapter: 2,
    category: 'animal',
    boss: false,
    subUnit: true,
    draw: 'spider',
    color: '#e74c3c',
    colorAlt: '#922b21',
    baseR: 11,
    baseHp: 30,
    baseSpeed: 80,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 240,
      dashDuration: 0.25,
      dashCooldown: [0.6, 1.5],
      dashRange: 80,
    },
    attack: 'single',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.0,
      bulletSpeed: 160,
    },
    xpValue: 8,
    crystalValue: 1,
  },

  bossTornadoSkeleton: {
    name: 'Giant Tornado Skeleton',
    chapter: 2,
    category: 'undead',
    boss: true,
    draw: 'skeleton',
    color: '#7f8c8d',
    colorAlt: '#f1e7c9',
    baseR: 28,
    baseHp: 320,
    baseSpeed: 25,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Tornado Spawn',
        pattern: 'fan',
        params: {
          bulletStyle: 'bolt',
          count: 4,
          spread: 0.8,
          bulletSpeed: 130,
          bulletBounce: true,
          bulletBounces: 3,
        },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Tornado Wall',
        pattern: 'cardinal8',
        params: {
          bulletStyle: 'bolt',
          bulletSpeed: 110,
          bulletBounce: true,
          bulletBounces: 2,
        },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 60,
    crystalValue: 7,
  },

  bossRedSkull2: {
    name: 'Giant Red Skull',
    chapter: 2,
    category: 'undead',
    boss: true,
    bossCount: 2,
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 24,
    baseHp: 180,
    baseSpeed: 65,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 190,
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'bossRedSkull2Med',
      count: 2,
    },
    xpValue: 40,
    crystalValue: 5,
  },

  bossRedSkull2Med: {
    name: 'Red Skull',
    chapter: 2,
    category: 'undead',
    boss: false,
    subUnit: true,
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 16,
    baseHp: 60,
    baseSpeed: 75,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 210,
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'bossRedSkull2Small',
      count: 2,
    },
    xpValue: 12,
    crystalValue: 2,
  },

  bossRedSkull2Small: {
    name: 'Tiny Red Skull',
    chapter: 2,
    category: 'undead',
    boss: false,
    subUnit: true,
    draw: 'skull',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 10,
    baseHp: 25,
    baseSpeed: 85,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 230,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 6,
    crystalValue: 1,
  },

  bossGiantCactus: {
    name: 'Giant Cactus',
    chapter: 2,
    category: 'plant',
    boss: true,
    draw: 'cactus',
    color: '#27ae60',
    colorAlt: '#1e8449',
    baseR: 32,
    baseHp: 450,
    baseSpeed: 20,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Wind Barrage',
        pattern: 'barrage',
        params: {
          count: 3,
          bulletsPerLine: 4,
          bulletSpeed: 200,
          lineSpread: 0.12,
          burstDelay: 0.1,
        },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Wind Strike',
        pattern: 'fan',
        params: {
          count: 3,
          spread: 0.8,
          bulletSpeed: 220,
        },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Bounce and Release',
        pattern: 'cardinal',
        params: {
          bulletSpeed: 160,
        },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  // ══════════════════════════════════════
  // CHAPTER 3 BOSSES - Abandoned Dungeon
  // (Regular enemies are a mix of ch1+ch2 pools)
  // ══════════════════════════════════════

  bossGiantBat: {
    name: 'Giant Bat',
    chapter: 3,
    category: 'animal',
    boss: true,
    draw: 'bat',
    color: '#2ecc71',
    colorAlt: '#1a9c4a',
    baseR: 30,
    baseHp: 300,
    baseSpeed: 35,
    ai: 'hoverLunge',
    aiParams: {
      hoverTime: [2.0, 3.5],
      lungeSpeed: 300,
      lungeRange: 160,
      lungeDuration: 0.5,
      ignoreWalls: true,
    },
    attackPhases: [
      {
        name: 'Lunge and Release',
        pattern: 'random',
        params: { count: 10, bulletSpeed: 120, burstDelay: 0.06 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Spiral Fan',
        pattern: 'cardinal8',
        params: { bulletSpeed: 130 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 50,
    crystalValue: 6,
  },

  bossBrownWormX2: {
    name: 'Giant Brown Worm',
    chapter: 3,
    category: 'animal',
    boss: true,
    bossCount: 2,
    draw: 'worm',
    color: '#8B4513',
    colorAlt: '#6d3610',
    baseR: 28,
    baseHp: 250,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [3.0, 5.0],
      undergroundTime: [1.5, 2.5],
      burrowTransition: 0.5,
    },
    attackPhases: [
      {
        name: '3-4 Shooter',
        pattern: 'fan',
        params: { bulletStyle: 'acid', count: 4, spread: 0.5, bulletSpeed: 160 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: { bulletStyle: 'acid', count: 14, bulletSpeed: 140, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Fire Bomb',
        pattern: 'lobMulti',
        params: { bulletStyle: 'acid', count: 2, lobSpeed: 110, lobArc: 0.8, spread: 0.3 },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 45,
    crystalValue: 5,
  },

  bossRedPlantX2: {
    name: 'Giant Red Plant',
    chapter: 3,
    category: 'plant',
    boss: true,
    bossCount: 2,
    draw: 'plant',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 26,
    baseHp: 180,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: '5-Line Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'acid', count: 5, bulletsPerLine: 4, bulletSpeed: 160, lineSpread: 0.15, burstDelay: 0.12 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: { bulletStyle: 'acid', count: 12, bulletSpeed: 140, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 40,
    crystalValue: 5,
  },

  bossElectricDragon: {
    name: 'Giant Electric Dragon',
    chapter: 3,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#f1c40f',
    colorAlt: '#f39c12',
    baseR: 35,
    baseHp: 500,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: 'Electric Balls',
        pattern: 'cardinal8',
        params: { bulletStyle: 'bolt', bulletSpeed: 130, bulletBounce: true, bulletBounces: 3 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Thunder Bolt',
        pattern: 'lobMulti',
        params: { bulletStyle: 'bolt', count: 3, lobSpeed: 100, lobArc: 0.8, spread: 0.5 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Thunder Wall',
        pattern: 'barrage',
        params: { bulletStyle: 'bolt', count: 6, bulletsPerLine: 3, bulletSpeed: 160, lineSpread: 0.25, burstDelay: 0.1 },
        duration: 2.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 - Crystal Mines: Animals
  // ══════════════════════════════════════

  grayWolf: {
    name: 'Gray Wolf',
    chapter: 4,
    category: 'animal',
    draw: 'wolf',
    color: '#7f8c8d',
    colorAlt: '#636e72',
    baseR: 14,
    baseHp: 40,
    baseSpeed: 50,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [90, 150],
      stalkTime: [1.5, 3.5],
      chargeSpeed: 370,
      chargeDuration: 0.5,
      anticipatePlayer: true,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 15,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 - Crystal Mines: Elementals
  // ══════════════════════════════════════

  fireSpirit: {
    name: 'Fire Spirit',
    chapter: 4,
    category: 'elemental',
    draw: 'spirit',
    color: '#e67e22',
    colorAlt: '#f39c12',
    baseR: 12,
    baseHp: 28,
    baseSpeed: 30,
    ai: 'lobber',
    aiParams: { wanderSpeed: 30 },
    attack: 'single',
    attackParams: {
      bulletStyle: 'fire',
      shootInterval: 2.5,
      bulletSpeed: 180,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 - Crystal Mines: Ground Turret
  // ══════════════════════════════════════

  purpleOrbTurret: {
    name: 'Purple Orb Ground Turret',
    chapter: 4,
    category: 'turret',
    draw: 'turret',
    color: '#9b59b6',
    colorAlt: '#7d3c98',
    baseR: 13,
    baseHp: 32,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'cardinal',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.5,
      bulletSpeed: 160,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 - Crystal Mines: Plants
  // ══════════════════════════════════════

  peashooter: {
    name: 'Peashooter',
    chapter: 4,
    category: 'plant',
    draw: 'plant',
    color: '#27ae60',
    colorAlt: '#2ecc71',
    baseR: 12,
    baseHp: 25,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'fan',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 2.2,
      count: 3,
      spread: 0.5,
      bulletSpeed: 150,
    },
    xpValue: 8,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 - Crystal Mines: Undead
  // ══════════════════════════════════════

  fireballMage: {
    name: 'Fireball Mage',
    chapter: 4,
    category: 'undead',
    draw: 'mage',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 13,
    baseHp: 30,
    baseSpeed: 25,
    ai: 'chase',
    aiParams: {
      preferredDist: 150,
      moveStyle: 'walk',
    },
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'fire',
      shootInterval: 2.5,
      lobSpeed: 130,
      lobArc: 0.8,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  mummy: {
    name: 'Mummy',
    chapter: 4,
    category: 'undead',
    draw: 'mummy',
    color: '#d4c5a0',
    colorAlt: '#e74c3c',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 150,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 4 BOSSES - Crystal Mines
  // ══════════════════════════════════════

  bossRedGolem: {
    name: 'Giant Red Rock Golem',
    chapter: 4,
    category: 'golem',
    boss: true,
    draw: 'golem',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 32,
    baseHp: 420,
    baseSpeed: 25,
    ai: 'spinThrow',
    aiParams: {
      spinDuration: 1.0,
      restTime: [2.0, 3.0],
    },
    attackPhases: [
      {
        name: 'Spin and Release',
        pattern: 'fan',
        params: { bulletStyle: 'rock', count: 5, spread: 1.0, bulletSpeed: 150 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Boulder Toss',
        pattern: 'lobMulti',
        params: { bulletStyle: 'rock', count: 3, lobSpeed: 120, lobArc: 0.8, spread: 0.4 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossFireSpirit: {
    name: 'Giant Fire Spirit',
    chapter: 4,
    category: 'elemental',
    boss: true,
    draw: 'spirit',
    color: '#e67e22',
    colorAlt: '#f39c12',
    baseR: 30,
    baseHp: 380,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attackPhases: [
      {
        name: '8-Shooter Fireballs',
        pattern: 'cardinal8',
        params: { bulletStyle: 'fire', bulletSpeed: 150 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Fire Absorption',
        pattern: 'random',
        params: { bulletStyle: 'fire', count: 10, bulletSpeed: 130, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Fire Grid',
        pattern: 'cardinal',
        params: { bulletStyle: 'fire', bulletSpeed: 110, bulletBounce: true },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossFireballMage: {
    name: 'Giant Fireball Mage',
    chapter: 4,
    category: 'undead',
    boss: true,
    draw: 'mage',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 28,
    baseHp: 360,
    baseSpeed: 25,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Homing Purple Orbs',
        pattern: 'cardinal8',
        params: { bulletStyle: 'fire', bulletSpeed: 100 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: '6-Shooter Fireballs',
        pattern: 'fan',
        params: { bulletStyle: 'fire', count: 6, spread: 0.8, bulletSpeed: 170 },
        duration: 2.0,
        cooldown: 2.0,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossGreenStumpCh4: {
    name: 'Giant Green Tree Stump',
    chapter: 4,
    category: 'plant',
    boss: true,
    draw: 'stump',
    color: '#27ae60',
    colorAlt: '#6d4c2a',
    baseR: 30,
    baseHp: 350,
    baseSpeed: 0,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 160,
    },
    attackPhases: [
      {
        name: 'Bounce and Release',
        pattern: 'cardinal8',
        params: { bulletStyle: 'rock', bulletSpeed: 140, bulletBounce: true, bulletBounces: 2 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: { bulletStyle: 'rock', count: 10, bulletSpeed: 130, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Bouncy Fan',
        pattern: 'fan',
        params: { bulletStyle: 'rock', count: 3, spread: 0.5, bulletSpeed: 150, bulletBounce: true, bulletBounces: 2 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossDarkAngel: {
    name: 'Dark Angel',
    chapter: 4,
    category: 'undead',
    boss: true,
    draw: 'darkAngel',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 30,
    baseHp: 550,
    baseSpeed: 45,
    ai: 'chase',
    aiParams: {
      preferredDist: 80,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Fire Strings',
        pattern: 'random',
        params: { bulletStyle: 'skull', count: 8, bulletSpeed: 100, burstDelay: 0.1 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Fire String Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'skull', count: 3, bulletsPerLine: 4, bulletSpeed: 140, lineSpread: 0.2, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Lunge and Claw',
        pattern: 'fan',
        params: { bulletStyle: 'skull', count: 5, spread: 1.2, bulletSpeed: 200 },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 100,
    crystalValue: 12,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 - Lost Castle: Animals
  // ══════════════════════════════════════

  oneEyedBat: {
    name: 'One-Eyed Bat',
    chapter: 5,
    category: 'animal',
    draw: 'oneEyedBat',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attack: 'single',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 2.0,
      bulletSpeed: 220,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  smallOneEyedBat: {
    name: 'Small One-Eyed Bat',
    chapter: 5,
    category: 'animal',
    draw: 'oneEyedBat',
    color: '#b2bec3',
    colorAlt: '#636e72',
    baseR: 10,
    baseHp: 20,
    baseSpeed: 35,
    ai: 'hoverLunge',
    aiParams: {
      hoverTime: [2.0, 4.0],
      lungeSpeed: 0,
      lungeRange: 999,
      lungeDuration: 0.01,
      ignoreWalls: false,
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 2.5,
      count: 2,
      spread: 0.8,
      bulletSpeed: 160,
    },
    xpValue: 8,
    crystalValue: 1,
  },

  brownWolfCh5: {
    name: 'Brown Wolf',
    chapter: 5,
    category: 'animal',
    draw: 'wolf',
    color: '#6d4c2a',
    colorAlt: '#4a3418',
    baseR: 14,
    baseHp: 45,
    baseSpeed: 55,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [80, 140],
      stalkTime: [1.2, 3.0],
      chargeSpeed: 380,
      chargeDuration: 0.5,
      anticipatePlayer: true,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 15,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 - Lost Castle: Elementals
  // ══════════════════════════════════════

  electricSpirit: {
    name: 'Electric Spirit',
    chapter: 5,
    category: 'elemental',
    draw: 'spirit',
    color: '#3498db',
    colorAlt: '#f1c40f',
    baseR: 12,
    baseHp: 30,
    baseSpeed: 30,
    ai: 'lobber',
    aiParams: { wanderSpeed: 30 },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'bolt',
      shootInterval: 2.5,
      count: 3,
      spread: 0.4,
      bulletSpeed: 170,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 - Lost Castle: Ground Turrets
  // ══════════════════════════════════════

  crossbowTurret: {
    name: 'Crossbow Ground Turret',
    chapter: 5,
    category: 'turret',
    draw: 'turret',
    color: '#8B4513',
    colorAlt: '#6d3610',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'fan',
    attackParams: {
      bulletStyle: 'arrow',
      shootInterval: 2.2,
      count: 3,
      spread: 0.4,
      bulletSpeed: 190,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  fireballTurret: {
    name: 'Fireball Ground Turret',
    chapter: 5,
    category: 'turret',
    draw: 'turret',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'cardinal8',
    attackParams: {
      bulletStyle: 'fire',
      shootInterval: 2.5,
      bulletSpeed: 150,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 - Lost Castle: Rock Golems
  // ══════════════════════════════════════

  brownGolem: {
    name: 'Brown Rock Golem',
    chapter: 5,
    category: 'golem',
    draw: 'golem',
    color: '#8B4513',
    colorAlt: '#6d3610',
    baseR: 16,
    baseHp: 55,
    baseSpeed: 30,
    ai: 'spinThrow',
    aiParams: {
      spinDuration: 0.8,
      restTime: [2.0, 3.5],
    },
    attack: 'random',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 3.5,
      count: 5,
      bulletSpeed: 140,
      burstDelay: 0.08,
    },
    splitOnDeath: {
      spawnType: 'whiteGolem',
      count: 2,
    },
    xpValue: 16,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 - Lost Castle: Undead
  // ══════════════════════════════════════

  blueScytheMage: {
    name: 'Blue Scythe Mage',
    chapter: 5,
    category: 'undead',
    draw: 'mage',
    color: '#2980b9',
    colorAlt: '#1a5276',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 30,
    ai: 'chase',
    aiParams: {
      preferredDist: 130,
      moveStyle: 'walk',
    },
    attack: 'bouncySingle',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.2,
      bulletSpeed: 170,
      bulletBounces: 2,
    },
    xpValue: 14,
    crystalValue: 1,
  },

  spearSkeleton: {
    name: 'Spear Skeleton',
    chapter: 5,
    category: 'undead',
    draw: 'skeleton',
    color: '#bdc3c7',
    colorAlt: '#f1e7c9',
    baseR: 13,
    baseHp: 30,
    baseSpeed: 45,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [70, 120],
      stalkTime: [1.5, 3.0],
      chargeSpeed: 350,
      chargeDuration: 0.4,
      anticipatePlayer: false,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 12,
    crystalValue: 1,
  },

  swordSkeleton: {
    name: 'Sword Skeleton',
    chapter: 5,
    category: 'undead',
    draw: 'skeleton',
    color: '#95a5a6',
    colorAlt: '#f1e7c9',
    baseR: 14,
    baseHp: 35,
    baseSpeed: 45,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [60, 110],
      stalkTime: [1.3, 2.8],
      chargeSpeed: 340,
      chargeDuration: 0.5,
      anticipatePlayer: false,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 5 BOSSES - Lost Castle
  // ══════════════════════════════════════

  bossGiantArcher: {
    name: 'Giant Archer',
    chapter: 5,
    category: 'undead',
    boss: true,
    draw: 'skeleton',
    color: '#e74c3c',
    colorAlt: '#f1e7c9',
    baseR: 28,
    baseHp: 350,
    baseSpeed: 35,
    ai: 'chase',
    aiParams: {
      preferredDist: 150,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: '1-Shooter Bouncy',
        pattern: 'bouncySingle',
        params: { bulletStyle: 'arrow', bulletSpeed: 180, bulletBounces: 4 },
        duration: 2.0,
        cooldown: 1.5,
      },
      {
        name: 'Triple Arrow Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'arrow', count: 3, bulletsPerLine: 1, bulletSpeed: 190, lineSpread: 0.2, burstDelay: 0.3 },
        duration: 2.0,
        cooldown: 2.0,
      },
    ],
    xpValue: 60,
    crystalValue: 7,
  },

  bossRoundElectricDragon: {
    name: 'Round Electric Dragon',
    chapter: 5,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#3498db',
    colorAlt: '#f1c40f',
    baseR: 30,
    baseHp: 400,
    baseSpeed: 20,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: '2-Shooter Split',
        pattern: 'fan',
        params: { bulletStyle: 'bolt', count: 2, spread: 0.3, bulletSpeed: 130, bulletBounce: true, bulletBounces: 2 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Electric Barrage',
        pattern: 'cardinal',
        params: { bulletStyle: 'bolt', bulletSpeed: 120, bulletBounce: true },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossPurplePlant: {
    name: 'Giant Purple Plant',
    chapter: 5,
    category: 'plant',
    boss: true,
    draw: 'plant',
    color: '#8e44ad',
    colorAlt: '#5b7fc7',
    baseR: 30,
    baseHp: 380,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: 'Heavy 1-Shooter',
        pattern: 'lobSingle',
        params: { bulletStyle: 'acid', lobSpeed: 140, lobArc: 0.8 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Plant Spawn',
        pattern: 'summon',
        params: { bulletStyle: 'acid', spawnType: 'purplePlantGreen', maxActive: 2 },
        duration: 1.0,
        cooldown: 8.0,
      },
      {
        name: 'Projectile Barrage',
        pattern: 'random',
        params: { bulletStyle: 'acid', count: 10, bulletSpeed: 140, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossGrayWolf: {
    name: 'Giant Gray Wolf',
    chapter: 5,
    category: 'animal',
    boss: true,
    draw: 'wolf',
    color: '#7f8c8d',
    colorAlt: '#636e72',
    baseR: 28,
    baseHp: 320,
    baseSpeed: 55,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [80, 140],
      stalkTime: [1.0, 2.0],
      chargeSpeed: 400,
      chargeDuration: 0.5,
      anticipatePlayer: true,
    },
    attackPhases: [
      {
        name: 'Triple Charge Fan',
        pattern: 'fan',
        params: { count: 3, spread: 0.6, bulletSpeed: 180 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 60,
    crystalValue: 7,
  },

  bossDemon: {
    name: 'Demon',
    chapter: 5,
    category: 'undead',
    boss: true,
    draw: 'demon',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 32,
    baseHp: 600,
    baseSpeed: 50,
    ai: 'chase',
    aiParams: {
      preferredDist: 70,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Triple Claw Strike',
        pattern: 'fan',
        params: { bulletStyle: 'fire', count: 5, spread: 1.0, bulletSpeed: 200 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Fire Wave',
        pattern: 'barrage',
        params: { bulletStyle: 'fire', count: 1, bulletsPerLine: 5, bulletSpeed: 180, lineSpread: 0, burstDelay: 0.08 },
        duration: 1.5,
        cooldown: 2.5,
      },
      {
        name: 'Fireball Barrage',
        pattern: 'random',
        params: { bulletStyle: 'fire', count: 12, bulletSpeed: 120, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Jump and Release',
        pattern: 'cardinal8',
        params: { bulletStyle: 'fire', bulletSpeed: 150 },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 100,
    crystalValue: 12,
  },

  // ══════════════════════════════════════
  // CHAPTER 6 - Cave of Bones: Animals
  // ══════════════════════════════════════

  redSpider: {
    name: 'Red Spider',
    chapter: 6,
    category: 'animal',
    draw: 'spider',
    color: '#e74c3c',
    colorAlt: '#922b21',
    baseR: 12,
    baseHp: 30,
    baseSpeed: 60,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 240,
      dashDuration: 0.25,
      dashCooldown: [0.6, 1.5],
      dashRange: 90,
    },
    attack: 'cardinal',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.5,
      bulletSpeed: 150,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  blueWorm: {
    name: 'Blue Worm',
    chapter: 6,
    category: 'animal',
    draw: 'worm',
    color: '#2980b9',
    colorAlt: '#1a5276',
    baseR: 14,
    baseHp: 40,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [2.0, 3.5],
      undergroundTime: [1.0, 1.8],
      burrowTransition: 0.4,
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 99,
      count: 3,
      spread: 0.4,
      bulletSpeed: 170,
    },
    xpValue: 14,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 6 - Cave of Bones: Undead
  // ══════════════════════════════════════

  brownScarecrow: {
    name: 'Brown Scarecrow',
    chapter: 6,
    category: 'undead',
    draw: 'scarecrow',
    color: '#8B4513',
    colorAlt: 'rgba(200,100,50,0.3)',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 50,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 200,
      dashDuration: 0.2,
      dashCooldown: [0.8, 2.0],
      dashRange: 70,
    },
    attack: 'cardinal',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.0,
      bulletSpeed: 160,
    },
    xpValue: 14,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 6 BOSSES - Cave of Bones
  // ══════════════════════════════════════

  bossRedWorm: {
    name: 'Giant Red Worm',
    chapter: 6,
    category: 'animal',
    boss: true,
    draw: 'worm',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 32,
    baseHp: 400,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [2.5, 4.0],
      undergroundTime: [1.0, 2.0],
      burrowTransition: 0.4,
    },
    attackPhases: [
      {
        name: 'Dig and Release',
        pattern: 'cardinal',
        params: { bulletStyle: 'acid', bulletSpeed: 140 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Heavy Shot',
        pattern: 'lobSingle',
        params: { bulletStyle: 'acid', lobSpeed: 140, lobArc: 0.8 },
        duration: 1.5,
        cooldown: 2.5,
      },
      {
        name: '8-Direction Release',
        pattern: 'cardinal8',
        params: { bulletStyle: 'acid', bulletSpeed: 130 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossGiantBatX2: {
    name: 'Giant Bat',
    chapter: 6,
    category: 'animal',
    boss: true,
    bossCount: 2,
    draw: 'bat',
    color: '#2ecc71',
    colorAlt: '#1a9c4a',
    baseR: 28,
    baseHp: 260,
    baseSpeed: 35,
    ai: 'hoverLunge',
    aiParams: {
      hoverTime: [1.5, 3.0],
      lungeSpeed: 300,
      lungeRange: 160,
      lungeDuration: 0.5,
      ignoreWalls: true,
    },
    attackPhases: [
      {
        name: 'Lunge and Release',
        pattern: 'random',
        params: { count: 10, bulletSpeed: 120, burstDelay: 0.06 },
        duration: 2.5,
        cooldown: 2.0,
      },
    ],
    xpValue: 45,
    crystalValue: 5,
  },

  bossFireSpiritX2: {
    name: 'Giant Fire Spirit',
    chapter: 6,
    category: 'elemental',
    boss: true,
    bossCount: 2,
    draw: 'spirit',
    color: '#e67e22',
    colorAlt: '#f39c12',
    baseR: 26,
    baseHp: 300,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attackPhases: [
      {
        name: '8-Shooter Fireballs',
        pattern: 'cardinal8',
        params: { bulletStyle: 'fire', bulletSpeed: 150 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Fire Absorption',
        pattern: 'random',
        params: { bulletStyle: 'fire', count: 10, bulletSpeed: 130, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Fire Grid',
        pattern: 'cardinal',
        params: { bulletStyle: 'fire', bulletSpeed: 110, bulletBounce: true },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 60,
    crystalValue: 7,
  },

  bossFireDragonGiant: {
    name: 'Giant Fire Dragon',
    chapter: 6,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#e74c3c',
    colorAlt: '#ff6b2b',
    baseR: 38,
    baseHp: 650,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: 'Flamethrower',
        pattern: 'barrage',
        params: { bulletStyle: 'fire', count: 5, bulletsPerLine: 4, bulletSpeed: 170, lineSpread: 0.1, burstDelay: 0.08 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Giant Bouncing Fireballs',
        pattern: 'fan',
        params: { bulletStyle: 'fire', count: 5, spread: 1.2, bulletSpeed: 110, bulletBounce: true, bulletBounces: 3 },
        duration: 2.5,
        cooldown: 2.5,
      },
      {
        name: 'Rain of Fire',
        pattern: 'random',
        params: { bulletStyle: 'fire', count: 12, bulletSpeed: 100, burstDelay: 0.15 },
        duration: 3.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 100,
    crystalValue: 12,
  },

  // ══════════════════════════════════════
  // CHAPTER 7 BOSSES - Barrens of Shadow
  // (All stages are boss stages; regular enemies reuse ch1-ch6 pools)
  // ══════════════════════════════════════

  bossGiantScarecrow: {
    name: 'Giant Brown Scarecrow',
    chapter: 7,
    category: 'undead',
    boss: true,
    draw: 'scarecrow',
    color: '#8B4513',
    colorAlt: 'rgba(200,100,50,0.3)',
    baseR: 32,
    baseHp: 450,
    baseSpeed: 55,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 220,
      dashDuration: 0.35,
      dashCooldown: [1.0, 2.5],
      dashRange: 100,
    },
    attackPhases: [
      {
        name: 'Orb Summon',
        pattern: 'summon',
        params: { bulletStyle: 'skull', spawnType: 'purpleOrbTurret', maxActive: 3 },
        duration: 1.0,
        cooldown: 6.0,
      },
      {
        name: 'Curved Cardinal',
        pattern: 'cardinal8',
        params: { bulletStyle: 'skull', bulletSpeed: 140, bulletBounce: true, bulletBounces: 2 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Random Barrage',
        pattern: 'random',
        params: { bulletStyle: 'skull', count: 10, bulletSpeed: 130, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossRedWormX2: {
    name: 'Giant Red Worm',
    chapter: 7,
    category: 'animal',
    boss: true,
    bossCount: 2,
    draw: 'worm',
    color: '#e74c3c',
    colorAlt: '#c0392b',
    baseR: 30,
    baseHp: 380,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [2.5, 4.0],
      undergroundTime: [1.0, 2.0],
      burrowTransition: 0.4,
    },
    attackPhases: [
      {
        name: 'Dig and Release',
        pattern: 'cardinal',
        params: { bulletStyle: 'acid', bulletSpeed: 140 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: '8-Direction Release',
        pattern: 'cardinal8',
        params: { bulletStyle: 'acid', bulletSpeed: 130 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Heavy Shot',
        pattern: 'lobSingle',
        params: { bulletStyle: 'acid', lobSpeed: 140, lobArc: 0.8 },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  // ══════════════════════════════════════
  // CHAPTER 8 - Silent Expanse: Animals
  // ══════════════════════════════════════

  bee: {
    name: 'Bee',
    chapter: 8,
    category: 'animal',
    draw: 'bee',
    color: '#f1c40f',
    colorAlt: '#2d3436',
    baseR: 10,
    baseHp: 20,
    baseSpeed: 70,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attack: 'none',
    attackParams: {},
    xpValue: 6,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 8 - Silent Expanse: Blobs
  // ══════════════════════════════════════

  blueBlob: {
    name: 'Blue Blob',
    chapter: 8,
    category: 'slime',
    draw: 'blob',
    color: '#2980b9',
    colorAlt: '#1a5276',
    baseR: 15,
    baseHp: 45,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 3.0,
      lobSpeed: 120,
      lobArc: 0.7,
    },
    splitOnDeath: {
      spawnType: 'blueSlime',
      count: 3,
    },
    xpValue: 14,
    crystalValue: 2,
  },

  blueSlime: {
    name: 'Blue Slime',
    chapter: 8,
    category: 'slime',
    subUnit: true,
    draw: 'slime',
    color: '#3498db',
    colorAlt: '#2980b9',
    baseR: 10,
    baseHp: 15,
    baseSpeed: 55,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 210,
      dashDuration: 0.3,
      dashCooldown: [0.7, 1.8],
      dashRange: 80,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 5,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 8 - Silent Expanse: Undead
  // ══════════════════════════════════════

  blueScarecrow: {
    name: 'Blue Scarecrow',
    chapter: 8,
    category: 'undead',
    draw: 'scarecrow',
    color: '#2980b9',
    colorAlt: 'rgba(50,100,200,0.3)',
    baseR: 13,
    baseHp: 40,
    baseSpeed: 50,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 200,
      dashDuration: 0.2,
      dashCooldown: [0.8, 2.0],
      dashRange: 70,
    },
    attack: 'cardinal8',
    attackParams: {
      bulletStyle: 'skull',
      shootInterval: 2.5,
      bulletSpeed: 140,
    },
    xpValue: 16,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 8 BOSSES - Silent Expanse
  // ══════════════════════════════════════

  bossQueenBee: {
    name: 'Queen Bee',
    chapter: 8,
    category: 'animal',
    boss: true,
    draw: 'bee',
    color: '#f39c12',
    colorAlt: '#2d3436',
    baseR: 30,
    baseHp: 500,
    baseSpeed: 40,
    ai: 'chase',
    aiParams: {
      preferredDist: 80,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: '8-Line Barrage',
        pattern: 'barrage',
        params: { count: 8, bulletsPerLine: 3, bulletSpeed: 150, lineSpread: 0.12, burstDelay: 0.1 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Summon Bees',
        pattern: 'summon',
        params: { spawnType: 'bee', maxActive: 4 },
        duration: 1.0,
        cooldown: 5.0,
      },
      {
        name: 'Stinger Spray',
        pattern: 'random',
        params: { count: 12, bulletSpeed: 140, burstDelay: 0.06 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossGiantBrownScarecrow: {
    name: 'Giant Brown Scarecrow',
    chapter: 8,
    category: 'undead',
    boss: true,
    draw: 'scarecrow',
    color: '#6d4c2a',
    colorAlt: 'rgba(160,80,40,0.3)',
    baseR: 30,
    baseHp: 480,
    baseSpeed: 50,
    ai: 'randomDash',
    aiParams: {
      dashSpeed: 200,
      dashDuration: 0.35,
      dashCooldown: [1.0, 2.5],
      dashRange: 90,
    },
    attackPhases: [
      {
        name: 'Summon Orbs',
        pattern: 'summon',
        params: { bulletStyle: 'skull', spawnType: 'purpleOrbTurret', maxActive: 3 },
        duration: 1.0,
        cooldown: 6.0,
      },
      {
        name: 'Curved Cardinal',
        pattern: 'cardinal8',
        params: { bulletStyle: 'skull', bulletSpeed: 140 },
        duration: 2.5,
        cooldown: 2.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossFireDragonX2: {
    name: 'Round Fire Dragon',
    chapter: 8,
    category: 'animal',
    boss: true,
    bossCount: 2,
    draw: 'dragon',
    color: '#e67e22',
    colorAlt: '#d35400',
    baseR: 28,
    baseHp: 300,
    baseSpeed: 20,
    ai: 'chase',
    aiParams: {
      preferredDist: 0,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: '3-Shooter Fan',
        pattern: 'fan',
        params: { bulletStyle: 'fire', count: 3, bulletSpeed: 120, spread: 0.5 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: '1-Line Fireball Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'fire', count: 1, bulletsPerLine: 5, bulletSpeed: 160, lineSpread: 0, burstDelay: 0.1 },
        duration: 1.5,
        cooldown: 2.5,
      },
    ],
    xpValue: 55,
    crystalValue: 7,
  },

  bossLaserDragon: {
    name: 'Round Laser Dragon',
    chapter: 8,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#9b59b6',
    colorAlt: '#8e44ad',
    baseR: 32,
    baseHp: 550,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: 'Laser Sweep',
        pattern: 'cardinal',
        params: { bulletStyle: 'bolt', bulletSpeed: 200, bulletBounce: true },
        duration: 3.0,
        cooldown: 1.5,
      },
      {
        name: 'Orb Burst',
        pattern: 'cardinal8',
        params: { bulletStyle: 'bolt', bulletSpeed: 120, bulletBounce: true, bulletBounces: 3 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Focused Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'bolt', count: 3, bulletsPerLine: 5, bulletSpeed: 180, lineSpread: 0.15, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 90,
    crystalValue: 10,
  },

  bossMaceSkeleton: {
    name: 'Giant Mace Skeleton',
    chapter: 8,
    category: 'undead',
    boss: true,
    draw: 'maceSkeleton',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 34,
    baseHp: 750,
    baseSpeed: 45,
    ai: 'stalkCharge',
    aiParams: {
      stalkRange: [80, 140],
      stalkTime: [1.5, 3.0],
      chargeSpeed: 380,
      chargeDuration: 0.6,
      anticipatePlayer: true,
    },
    attackPhases: [
      {
        name: 'Mace Eruption',
        pattern: 'cardinal8',
        params: { bulletStyle: 'arrow', bulletSpeed: 160 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Firebomb Lob',
        pattern: 'lobMulti',
        params: { bulletStyle: 'arrow', count: 4, lobSpeed: 120, lobArc: 0.8, spread: 0.5 },
        duration: 2.5,
        cooldown: 2.5,
      },
      {
        name: 'Dash Strike Fan',
        pattern: 'fan',
        params: { bulletStyle: 'arrow', count: 6, spread: 1.2, bulletSpeed: 200 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 120,
    crystalValue: 15,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Animals
  // ══════════════════════════════════════

  woolyBat: {
    name: 'Wooly Bat',
    chapter: 9,
    category: 'animal',
    draw: 'bat',
    color: '#dfe6e9',
    colorAlt: '#b2bec3',
    baseR: 14,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 160,
    },
    attack: 'none',
    attackParams: {},
    splitOnDeath: {
      spawnType: 'smallWoolyBat',
      count: 2,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  smallWoolyBat: {
    name: 'Small Wooly Bat',
    chapter: 9,
    category: 'animal',
    subUnit: true,
    draw: 'bat',
    color: '#b2bec3',
    colorAlt: '#636e72',
    baseR: 9,
    baseHp: 15,
    baseSpeed: 0,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 190,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 5,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Elementals
  // ══════════════════════════════════════

  iceSpirit: {
    name: 'Ice Spirit',
    chapter: 9,
    category: 'elemental',
    draw: 'spirit',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 12,
    baseHp: 30,
    baseSpeed: 30,
    ai: 'lobber',
    aiParams: { wanderSpeed: 30 },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'ice',
      shootInterval: 2.0,
      count: 2,
      spread: 0.3,
      bulletSpeed: 220,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Turrets
  // ══════════════════════════════════════

  blueOrbTurret: {
    name: 'Blue Orb Ground Turret',
    chapter: 9,
    category: 'turret',
    draw: 'turret',
    color: '#0984e3',
    colorAlt: '#74b9ff',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'cardinal',
    attackParams: {
      bulletStyle: 'ice',
      shootInterval: 3.0,
      bulletSpeed: 120,
    },
    xpValue: 10,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Living Bombs
  // ══════════════════════════════════════

  giantBlueBomb: {
    name: 'Giant Blue Living Bomb',
    chapter: 9,
    category: 'bomb',
    draw: 'bomb',
    color: '#0984e3',
    colorAlt: '#74b9ff',
    baseR: 14,
    baseHp: 40,
    baseSpeed: 25,
    ai: 'lobber',
    aiParams: { wanderSpeed: 25 },
    attack: 'lobSingle',
    attackParams: {
      bulletStyle: 'acid',
      shootInterval: 3.0,
      lobSpeed: 120,
      lobArc: 0.7,
    },
    splitOnDeath: {
      spawnType: 'passiveBlueBomb',
      count: 4,
    },
    xpValue: 14,
    crystalValue: 2,
  },

  passiveBlueBomb: {
    name: 'Passive Blue Bomb',
    chapter: 9,
    category: 'bomb',
    subUnit: true,
    draw: 'bomb',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 10,
    baseHp: 15,
    baseSpeed: 0,
    ai: 'bounce',
    aiParams: {
      bounceSpeed: 140,
    },
    attack: 'none',
    attackParams: {},
    xpValue: 5,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Plants
  // ══════════════════════════════════════

  iceGrassHand: {
    name: 'Ice Grass Hand',
    chapter: 9,
    category: 'plant',
    draw: 'iceGrassHand',
    color: '#74b9ff',
    colorAlt: '#00cec9',
    baseR: 14,
    baseHp: 35,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attack: 'fan',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 2.5,
      count: 3,
      spread: 0.5,
      bulletSpeed: 160,
    },
    xpValue: 12,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Golems
  // ══════════════════════════════════════

  iceGolem: {
    name: 'Ice Golem',
    chapter: 9,
    category: 'golem',
    draw: 'golem',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 16,
    baseHp: 55,
    baseSpeed: 30,
    ai: 'spinThrow',
    aiParams: {
      spinDuration: 0.8,
      restTime: [2.0, 3.5],
    },
    attack: 'fan',
    attackParams: {
      bulletStyle: 'rock',
      shootInterval: 3.5,
      count: 6,
      spread: 1.2,
      bulletSpeed: 150,
    },
    xpValue: 16,
    crystalValue: 2,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 - Frozen Pinnacle: Undead
  // ══════════════════════════════════════

  iceMage: {
    name: 'Ice Mage',
    chapter: 9,
    category: 'undead',
    draw: 'mage',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 13,
    baseHp: 35,
    baseSpeed: 30,
    ai: 'chase',
    aiParams: {
      preferredDist: 130,
      moveStyle: 'walk',
    },
    attack: 'bouncySingle',
    attackParams: {
      bulletStyle: 'ice',
      shootInterval: 2.0,
      bulletSpeed: 180,
      bulletBounces: 3,
    },
    xpValue: 14,
    crystalValue: 1,
  },

  // ══════════════════════════════════════
  // CHAPTER 9 BOSSES - Frozen Pinnacle
  // ══════════════════════════════════════

  bossBlueWorm: {
    name: 'Giant Blue Worm',
    chapter: 9,
    category: 'animal',
    boss: true,
    draw: 'worm',
    color: '#0984e3',
    colorAlt: '#74b9ff',
    baseR: 32,
    baseHp: 450,
    baseSpeed: 0,
    ai: 'burrow',
    aiParams: {
      surfaceTime: [2.5, 4.0],
      undergroundTime: [1.0, 2.0],
      burrowTransition: 0.4,
    },
    attackPhases: [
      {
        name: 'Ice Fan',
        pattern: 'fan',
        params: { bulletStyle: 'acid', count: 5, spread: 0.8, bulletSpeed: 160 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Ice Burst',
        pattern: 'cardinal8',
        params: { bulletStyle: 'acid', bulletSpeed: 140 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Frost Bomb',
        pattern: 'lobMulti',
        params: { bulletStyle: 'acid', count: 3, lobSpeed: 110, lobArc: 0.8, spread: 0.4 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossGiantBlueBomb: {
    name: 'Giant Blue Living Bomb',
    chapter: 9,
    category: 'bomb',
    boss: true,
    draw: 'bomb',
    color: '#0984e3',
    colorAlt: '#74b9ff',
    baseR: 30,
    baseHp: 420,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attackPhases: [
      {
        name: 'Frost Lob',
        pattern: 'lobMulti',
        params: { bulletStyle: 'acid', count: 4, lobSpeed: 120, lobArc: 0.8, spread: 0.5 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Ice Burst',
        pattern: 'cardinal8',
        params: { bulletStyle: 'acid', bulletSpeed: 130 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Summon Bombs',
        pattern: 'summon',
        params: { bulletStyle: 'acid', spawnType: 'passiveBlueBomb', maxActive: 4 },
        duration: 1.0,
        cooldown: 6.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossDragonfly: {
    name: 'Giant Dragonfly',
    chapter: 9,
    category: 'animal',
    boss: true,
    draw: 'dragonfly',
    color: '#00cec9',
    colorAlt: '#0984e3',
    baseR: 28,
    baseHp: 480,
    baseSpeed: 50,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Wing Gust',
        pattern: 'fan',
        params: { bulletStyle: 'bolt', count: 5, spread: 1.0, bulletSpeed: 180 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Dive Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'bolt', count: 3, bulletsPerLine: 4, bulletSpeed: 170, lineSpread: 0.15, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Frost Ring',
        pattern: 'cardinal8',
        params: { bulletStyle: 'bolt', bulletSpeed: 140 },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossIceSpirit: {
    name: 'Giant Ice Spirit',
    chapter: 9,
    category: 'elemental',
    boss: true,
    draw: 'spirit',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 30,
    baseHp: 450,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attackPhases: [
      {
        name: 'Ice Burst',
        pattern: 'cardinal8',
        params: { bulletStyle: 'ice', bulletSpeed: 150 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Ice Storm',
        pattern: 'random',
        params: { bulletStyle: 'ice', count: 14, bulletSpeed: 130, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Frost Grid',
        pattern: 'cardinal',
        params: { bulletStyle: 'ice', bulletSpeed: 120, bulletBounce: true },
        duration: 1.5,
        cooldown: 3.0,
      },
    ],
    xpValue: 80,
    crystalValue: 10,
  },

  bossIceAngel: {
    name: 'Ice Angel',
    chapter: 9,
    category: 'undead',
    boss: true,
    draw: 'iceAngel',
    color: '#74b9ff',
    colorAlt: '#dfe6e9',
    baseR: 32,
    baseHp: 700,
    baseSpeed: 45,
    ai: 'chase',
    aiParams: {
      preferredDist: 80,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Ice Claw',
        pattern: 'fan',
        params: { bulletStyle: 'ice', count: 6, spread: 1.2, bulletSpeed: 200 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Blizzard Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'ice', count: 4, bulletsPerLine: 4, bulletSpeed: 160, lineSpread: 0.2, burstDelay: 0.1 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Frost Ring',
        pattern: 'cardinal8',
        params: { bulletStyle: 'ice', bulletSpeed: 150, bulletBounce: true, bulletBounces: 2 },
        duration: 2.0,
        cooldown: 2.5,
      },
      {
        name: 'Ice Storm',
        pattern: 'random',
        params: { bulletStyle: 'ice', count: 14, bulletSpeed: 120, burstDelay: 0.06 },
        duration: 2.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 120,
    crystalValue: 15,
  },

  // ══════════════════════════════════════
  // CHAPTER 10 BOSSES - Land of Doom
  // (Regular enemies are a mix of all chapter pools)
  // ══════════════════════════════════════

  bossGiantScytheMage: {
    name: 'Giant Scythe-Mage',
    chapter: 10,
    category: 'undead',
    boss: true,
    draw: 'mage',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 30,
    baseHp: 550,
    baseSpeed: 35,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Scythe Throw',
        pattern: 'bouncySingle',
        params: { bulletStyle: 'skull', bulletSpeed: 200, bulletBounces: 5 },
        duration: 2.0,
        cooldown: 1.5,
      },
      {
        name: 'Dark Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'skull', count: 4, bulletsPerLine: 4, bulletSpeed: 170, lineSpread: 0.2, burstDelay: 0.1 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Death Ring',
        pattern: 'cardinal8',
        params: { bulletStyle: 'skull', bulletSpeed: 150 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 90,
    crystalValue: 10,
  },

  bossGiantGrayBombX2: {
    name: 'Giant Gray Living Bomb',
    chapter: 10,
    category: 'bomb',
    boss: true,
    bossCount: 2,
    draw: 'bomb',
    color: '#636e72',
    colorAlt: '#2d3436',
    baseR: 28,
    baseHp: 350,
    baseSpeed: 20,
    ai: 'lobber',
    aiParams: { wanderSpeed: 20 },
    attackPhases: [
      {
        name: 'Fire Lob',
        pattern: 'lobMulti',
        params: { bulletStyle: 'acid', count: 3, lobSpeed: 130, lobArc: 0.8, spread: 0.4 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Random Spray',
        pattern: 'random',
        params: { bulletStyle: 'acid', count: 10, bulletSpeed: 130, burstDelay: 0.08 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossDragonflyX2: {
    name: 'Giant Dragonfly',
    chapter: 10,
    category: 'animal',
    boss: true,
    bossCount: 2,
    draw: 'dragonfly',
    color: '#00cec9',
    colorAlt: '#0984e3',
    baseR: 26,
    baseHp: 380,
    baseSpeed: 50,
    ai: 'chase',
    aiParams: {
      preferredDist: 100,
      moveStyle: 'walk',
    },
    attackPhases: [
      {
        name: 'Wing Gust',
        pattern: 'fan',
        params: { bulletStyle: 'bolt', count: 4, spread: 0.8, bulletSpeed: 170 },
        duration: 2.0,
        cooldown: 2.0,
      },
      {
        name: 'Dive Barrage',
        pattern: 'barrage',
        params: { bulletStyle: 'bolt', count: 2, bulletsPerLine: 4, bulletSpeed: 160, lineSpread: 0.15, burstDelay: 0.1 },
        duration: 2.0,
        cooldown: 2.5,
      },
    ],
    xpValue: 70,
    crystalValue: 8,
  },

  bossIceDragon: {
    name: 'Giant Ice Dragon',
    chapter: 10,
    category: 'animal',
    boss: true,
    draw: 'dragon',
    color: '#74b9ff',
    colorAlt: '#0984e3',
    baseR: 40,
    baseHp: 900,
    baseSpeed: 0,
    ai: 'stationary',
    aiParams: {},
    attackPhases: [
      {
        name: 'Frost Breath',
        pattern: 'barrage',
        params: { bulletStyle: 'ice', count: 6, bulletsPerLine: 4, bulletSpeed: 180, lineSpread: 0.12, burstDelay: 0.08 },
        duration: 3.0,
        cooldown: 2.0,
      },
      {
        name: 'Ice Balls',
        pattern: 'cardinal8',
        params: { bulletStyle: 'ice', bulletSpeed: 140, bulletBounce: true, bulletBounces: 3 },
        duration: 2.5,
        cooldown: 2.0,
      },
      {
        name: 'Blizzard Fan',
        pattern: 'fan',
        params: { bulletStyle: 'ice', count: 7, spread: 1.5, bulletSpeed: 130, bulletBounce: true, bulletBounces: 2 },
        duration: 2.5,
        cooldown: 2.5,
      },
      {
        name: 'Hailstorm',
        pattern: 'random',
        params: { bulletStyle: 'ice', count: 16, bulletSpeed: 110, burstDelay: 0.12 },
        duration: 3.0,
        cooldown: 3.0,
      },
    ],
    xpValue: 150,
    crystalValue: 20,
  },
};

// ─── Auto-convert pixel values to tile units at module load ───
// Reference: at 500px arena width, 11 cols → T_REF ≈ 45.45px per tile.
// All spatial values below were authored in pixels for that reference size.
// This converts them to tiles so they scale with screen size via T().
{
  const T_REF = 500 / 11;
  const SPEED_KEYS = ['lungeSpeed', 'chargeSpeed', 'wanderSpeed', 'dashSpeed', 'bounceSpeed'];
  const DIST_KEYS = ['lungeRange', 'dashRange', 'preferredDist'];
  const RANGE_KEYS = ['stalkRange']; // [min, max] arrays
  const ATTACK_SPEED_KEYS = ['bulletSpeed', 'lobSpeed'];

  for (const def of Object.values(ENEMY_TYPES)) {
    if (def.baseR) def.baseR /= T_REF;
    if (def.baseSpeed) def.baseSpeed /= T_REF;

    if (def.aiParams) {
      for (const k of SPEED_KEYS) if (def.aiParams[k] != null) def.aiParams[k] /= T_REF;
      for (const k of DIST_KEYS) if (def.aiParams[k] != null) def.aiParams[k] /= T_REF;
      for (const k of RANGE_KEYS) {
        if (def.aiParams[k]) def.aiParams[k] = def.aiParams[k].map(v => v / T_REF);
      }
    }

    if (def.attackParams) {
      for (const k of ATTACK_SPEED_KEYS) if (def.attackParams[k] != null) def.attackParams[k] /= T_REF;
    }

    if (def.attackPhases) {
      for (const phase of def.attackPhases) {
        if (phase.params) {
          for (const k of ATTACK_SPEED_KEYS) if (phase.params[k] != null) phase.params[k] /= T_REF;
        }
      }
    }
  }
}

// ─── Lookup helpers ───

/** Get a single enemy type definition by id */
export function getEnemyType(id) {
  return ENEMY_TYPES[id] || null;
}

/** Get all enemy type ids for a chapter (non-boss, non-subUnit) */
export function getChapterEnemyIds(chapter) {
  return Object.keys(ENEMY_TYPES).filter(id => {
    const t = ENEMY_TYPES[id];
    return t.chapter === chapter && !t.boss && !t.subUnit;
  });
}

/** Get all boss type ids for a chapter */
export function getChapterBossIds(chapter) {
  return Object.keys(ENEMY_TYPES).filter(id => {
    const t = ENEMY_TYPES[id];
    return t.chapter === chapter && t.boss;
  });
}

/** Get all enemy type definitions for a chapter (non-boss, non-subUnit) */
export function getChapterEnemies(chapter) {
  return getChapterEnemyIds(chapter).map(id => ({ id, ...ENEMY_TYPES[id] }));
}

/** Get all boss definitions for a chapter */
export function getChapterBosses(chapter) {
  return getChapterBossIds(chapter).map(id => ({ id, ...ENEMY_TYPES[id] }));
}
