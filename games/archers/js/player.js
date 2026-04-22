import { game } from './state.js';
import { PLAYER_R } from './constants.js';
import { arena } from './arena.js';
import { applyEquipment } from './equipment.js';
import { getChosenWeaponLvl, getChosenArmorLvl, getEquippedRings, getUnlockedRings, getChaptersCleared } from './storage.js';

export function createPlayer() {
  const a = arena();
  game.player = {
    x: a.x + a.w / 2,
    y: a.y + a.h * 0.8,
    hp: 100, maxHp: 100,
    xp: 0, level: 1, xpToNext: 30,

    // Base combat
    dmgMult: 1, speedMult: 1, cdMult: 1,
    critChance: 0, critDmg: 2, // critDmg is the multiplier (2 = double damage)

    // Arrow modifiers
    extraShots: 0, frontArrows: 0,
    diagonalArrows: false, sideArrows: false, rearShot: false,
    pierce: 0, bouncy: false, ricochet: false,

    // Elemental
    blaze: false, freeze: false, poisonTouch: false, bolt: false, darkTouch: false,
    elementDmgMult: 1, elementBurst: false,

    // Death effects
    deathBomb: false, deathNova: false, chillingBlast: false,

    // Health & defense
    healOnKillPct: 0, shieldCharges: 0, heartDropChance: 0,
    heartHealMult: 1, hpRegen: 0,
    iFrameBonus: 0, dodgeChance: 0,
    starDuration: 0, shieldGuards: 0,
    starCycleTimer: 0, // for invincibility star cycling

    // Orbiting entities
    circles: { fire: 0, ice: 0, poison: 0, bolt: 0, obsidian: 0 },
    swords: { fire: 0, ice: 0, poison: 0, bolt: 0 },

    // Summoned projectiles
    strikes: { fire: 0, ice: 0, poison: 0, bolt: 0 },
    stars: { fire: 0, ice: 0, poison: 0, bolt: 0 },
    meteors: { fire: 0, ice: 0, poison: 0, bolt: 0 },

    // Scaling (health-dependent)
    fury: false, rage: false, grace: false, agility: false,

    // Other
    headshot: false, xpMult: 1, greedMult: 1, greedDmgTaken: 1,
    holyTouchStacks: 0, slowProjectile: 0,
    shadowClones: 0,
    magnetMult: 1,
    maxLevelBonus: 0,
    sizeScale: 1, // giant/dwarf scaling

    // Plus stacks (no-damage room rewards)
    hpPlusStacks: 0, atkPlusStacks: 0, critPlusStacks: 0, spdPlusStacks: 0,

    // Aura stacks and room counters
    speedAuraStacks: 0, critAuraStacks: 0,
    speedAuraRooms: 0, critAuraRooms: 0,

    // Stage damage tracking for Plus skills
    tookDamageThisStage: false,

    skills: {} // id -> stack count (per-run)
  };
  // Apply persistent equipment bonuses (skip if tutorial not yet cleared)
  if (getChaptersCleared() >= 0) {
    applyEquipment(game.player, getChosenWeaponLvl(), getChosenArmorLvl(), getEquippedRings(), getUnlockedRings());
  } else {
    game.player.dmgMult = 0.6;
    game.player.maxHp = 50;
    game.player.hp = 50;
  }
}
