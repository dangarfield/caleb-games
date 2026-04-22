// All spatial values in TILE units.
// 1 tile = arena_width / grid_columns (≈45px at 500px width, 11 cols).
// Multiply by T() at runtime to get pixels.

export const PLAYER_R = 0.396;           // ~18px — player radius
export const PLAYER_BASE_SPEED = 4.62;   // ~210px/s — player movement speed
export const BULLET_SPEED = 10.56;       // ~480px/s — player arrow speed
export const BULLET_R = 0.11;            // ~5px — arrow collision radius
export const BASE_SHOOT_CD = 0.38;       // seconds (not spatial)
export const ENEMY_BULLET_SPEED = 3.96;  // ~180px/s — enemy projectile speed
export const ENEMY_BULLET_R = 0.132;     // ~6px — enemy bullet radius
export const CRYSTAL_R = 0.154;          // ~7px — crystal pickup radius
export const CRYSTAL_ATTRACT_R = 1.76;   // ~80px — magnet attract range
export const CRYSTAL_MAGNET_SPEED = 7.7; // ~350px/s — crystal pull speed
export const STAGES_PER_CHAPTER = 25;
export const TOTAL_CHAPTERS = 10;
export const BOSS_INTERVAL = 5; // boss every 5 stages (5,10,15,20 = mini-boss, 25 = chapter boss)
