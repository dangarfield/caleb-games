// skills.js - Per-run skills (reset each run), XP, and level-up logic
import { game } from './state.js';
import { sfxLevelUp } from './audio.js';
import { applyEquipment } from './equipment.js';
import { getChosenWeaponLvl, getChosenArmorLvl, getEquippedRings, getUnlockedRings, getChaptersCleared } from './storage.js';

// Skill categories
export const SKILL_CATEGORIES = ['Arrow', 'Elemental', 'Explosive', 'Boost', 'Plus', 'Aura', 'Shield', 'Health', 'Circle', 'Sword', 'Strike', 'Star', 'Meteor', 'Scaling', 'Other'];

// Category icons for headers
export const CATEGORY_ICONS = {
  Arrow: '\u{1F3F9}', Elemental: '\u{1F52E}', Explosive: '\u{1F4A3}', Boost: '\u2694\uFE0F', Plus: '\u{1F4C8}',
  Aura: '\u{1F4AB}', Shield: '\u{1F6E1}\uFE0F', Health: '\u2764\uFE0F', Circle: '\u{1F534}', Sword: '\u{1F5E1}\uFE0F',
  Strike: '\u26C8\uFE0F', Star: '\u2604\uFE0F', Meteor: '\u{1F320}', Scaling: '\u{1F4CA}', Other: '\u2728'
};

// Each skill: { id, name, desc, icon, maxStacks, unlockChapter, category, onPick(player) }
// unlockChapter: the chapter from which this skill can appear in level-up rolls
export const ALL_SKILLS = [
  // ── Arrow (8) ──
  { id: 'multishot', name: 'Multishot', desc: '+1 arrow (-10% dmg, -15% speed)', icon: '\u{1F3AF}', maxStacks: 3, unlockChapter: 1, category: 'Arrow',
    onPick(p) { p.extraShots += 1; p.dmgMult *= 0.9; p.cdMult *= (1 / 0.85); } },
  { id: 'frontArrow', name: 'Front Arrow +1', desc: '+1 front arrow (-25% dmg all)', icon: '\u2B06\uFE0F', maxStacks: 2, unlockChapter: 1, category: 'Arrow',
    onPick(p) { p.frontArrows = (p.frontArrows || 0) + 1; p.dmgMult *= 0.75; } },
  { id: 'diagonalArrows', name: 'Diagonal Arrows +1', desc: 'Fire 2 diagonal arrows', icon: '\u2197\uFE0F', maxStacks: 1, unlockChapter: 3, category: 'Arrow',
    onPick(p) { p.diagonalArrows = true; } },
  { id: 'sideArrows', name: 'Side Arrows +1', desc: '+1 arrow left & right', icon: '\u2194\uFE0F', maxStacks: 1, unlockChapter: 5, category: 'Arrow',
    onPick(p) { p.sideArrows = true; } },
  { id: 'rearArrow', name: 'Rear Arrow +1', desc: 'Fire backwards too', icon: '\u2B07\uFE0F', maxStacks: 1, unlockChapter: 3, category: 'Arrow',
    onPick(p) { p.rearShot = true; } },
  { id: 'pierce', name: 'Piercing Shot', desc: 'Pierce +1 enemy (-33% per pierce)', icon: '\u{1F4A0}', maxStacks: 3, unlockChapter: 1, category: 'Arrow',
    onPick(p) { p.pierce += 1; } },
  { id: 'bouncy', name: 'Bouncy Wall', desc: 'Arrows bounce off walls (-50% per bounce)', icon: '\u{1F4AB}', maxStacks: 1, unlockChapter: 4, category: 'Arrow',
    onPick(p) { p.bouncy = true; } },
  { id: 'ricochet', name: 'Ricochet', desc: 'Arrows ricochet to nearby enemy (-30%)', icon: '\u{1F500}', maxStacks: 1, unlockChapter: 5, category: 'Arrow',
    onPick(p) { p.ricochet = true; } },

  // ── Elemental (7) ──
  { id: 'blaze', name: 'Blaze', desc: 'Arrows ignite enemies (fire DoT)', icon: '\u{1F525}', maxStacks: 1, unlockChapter: 1, category: 'Elemental',
    onPick(p) { p.blaze = true; } },
  { id: 'freeze', name: 'Freeze', desc: 'Chance to freeze + deal ice damage', icon: '\u2744\uFE0F', maxStacks: 1, unlockChapter: 1, category: 'Elemental',
    onPick(p) { p.freeze = true; } },
  { id: 'poisonTouch', name: 'Poison Touch', desc: 'Arrows poison enemies (poison DoT)', icon: '\u2620\uFE0F', maxStacks: 1, unlockChapter: 3, category: 'Elemental',
    onPick(p) { p.poisonTouch = true; } },
  { id: 'bolt', name: 'Bolt', desc: 'Lightning chains to nearby enemies', icon: '\u26A1', maxStacks: 1, unlockChapter: 3, category: 'Elemental',
    onPick(p) { p.bolt = true; } },
  { id: 'darkTouch', name: 'Dark Touch', desc: 'Time bomb: explodes after 1s', icon: '\u{1F311}', maxStacks: 1, unlockChapter: 6, category: 'Elemental',
    onPick(p) { p.darkTouch = true; } },
  { id: 'elementUpgrade', name: 'Element Upgrade', desc: '+50% elemental damage', icon: '\u{1F52E}', maxStacks: 2, unlockChapter: 4, category: 'Elemental',
    onPick(p) { p.elementDmgMult = (p.elementDmgMult || 1) + 0.5; } },
  { id: 'elementBurst', name: 'Element Burst', desc: 'Elemental damage can crit', icon: '\u{1F4A5}', maxStacks: 1, unlockChapter: 5, category: 'Elemental',
    onPick(p) { p.elementBurst = true; } },

  // ── Explosive (3) ──
  { id: 'deathBomb', name: 'Death Bomb', desc: 'Enemies explode on death (AoE)', icon: '\u{1F4A3}', maxStacks: 1, unlockChapter: 3, category: 'Explosive',
    onPick(p) { p.deathBomb = true; } },
  { id: 'deathNova', name: 'Death Nova', desc: '8 projectiles on enemy death', icon: '\u{1F300}', maxStacks: 1, unlockChapter: 4, category: 'Explosive',
    onPick(p) { p.deathNova = true; } },
  { id: 'chillingBlast', name: 'Chilling Blast', desc: 'Frozen enemies AoE freeze on death', icon: '\u{1F9CA}', maxStacks: 1, unlockChapter: 3, category: 'Explosive',
    onPick(p) { p.chillingBlast = true; } },

  // ── Boost (3) ──
  { id: 'atkBoostMinor', name: 'Attack Boost', desc: '+20% damage', icon: '\u{1F5E1}\uFE0F', maxStacks: 5, unlockChapter: 1, category: 'Boost',
    onPick(p) { p.dmgMult += 0.2; } },
  { id: 'atkSpdMinor', name: 'Attack Speed', desc: '+15% attack speed', icon: '\u{1F52B}', maxStacks: 5, unlockChapter: 1, category: 'Boost',
    onPick(p) { p.cdMult *= 0.85; } },
  { id: 'critMinor', name: 'Crit Master', desc: '+8% crit, +25% crit dmg', icon: '\u2728', maxStacks: 5, unlockChapter: 1, category: 'Boost',
    onPick(p) { p.critChance += 0.08; p.critDmg = (p.critDmg || 2) + 0.25; } },

  // ── Plus (4) - Reward for clearing a room without damage ──
  { id: 'hpPlus', name: 'HP Plus', desc: '+2.2% HP on no-damage rooms', icon: '\u2764\uFE0F\u200D\u{1F525}', maxStacks: 3, unlockChapter: 1, category: 'Plus',
    onPick(p) { p.hpPlusStacks = (p.hpPlusStacks || 0) + 1; } },
  { id: 'atkPlus', name: 'Attack Plus', desc: '+2.25% ATK on no-damage rooms', icon: '\u2694\uFE0F', maxStacks: 3, unlockChapter: 3, category: 'Plus',
    onPick(p) { p.atkPlusStacks = (p.atkPlusStacks || 0) + 1; } },
  { id: 'critPlus', name: 'Crit Plus', desc: '+1.4% crit on no-damage rooms', icon: '\u{1F3AF}', maxStacks: 3, unlockChapter: 4, category: 'Plus',
    onPick(p) { p.critPlusStacks = (p.critPlusStacks || 0) + 1; } },
  { id: 'spdPlus', name: 'Speed Plus', desc: '+1.9% speed on no-damage rooms', icon: '\u{1F45F}', maxStacks: 3, unlockChapter: 3, category: 'Plus',
    onPick(p) { p.spdPlusStacks = (p.spdPlusStacks || 0) + 1; } },

  // ── Aura (3) - Activate for current room + next 2 rooms ──
  { id: 'hpGainAura', name: 'HP Gain Aura', desc: 'Regenerate 1 HP/sec', icon: '\u{1F49A}', maxStacks: 3, unlockChapter: 3, category: 'Aura',
    onPick(p) { p.hpRegen = (p.hpRegen || 0) + 1; } },
  { id: 'speedAura', name: 'Speed Aura', desc: '+60% speed for 3 rooms', icon: '\u{1F4A8}', maxStacks: 3, unlockChapter: 1, category: 'Aura',
    onPick(p) { p.speedAuraStacks = (p.speedAuraStacks || 0) + 1; } },
  { id: 'critAura', name: 'Crit Aura', desc: '+45% crit for 3 rooms', icon: '\u{1F534}', maxStacks: 3, unlockChapter: 4, category: 'Aura',
    onPick(p) { p.critAuraStacks = (p.critAuraStacks || 0) + 1; } },

  // ── Shield (2) ──
  { id: 'invincibilityStar', name: 'Invincibility Star', desc: '2s invincible every 12s', icon: '\u2B50', maxStacks: 2, unlockChapter: 4, category: 'Shield',
    onPick(p) { p.starDuration = (p.starDuration || 0) + 2; } },
  { id: 'shieldGuard', name: 'Shield Guard', desc: 'Orbiting shield blocks projectiles', icon: '\u{1F6E1}\uFE0F', maxStacks: 2, unlockChapter: 5, category: 'Shield',
    onPick(p) { p.shieldGuards = (p.shieldGuards || 0) + 1; } },

  // ── Health (4) ──
  { id: 'hpBoost', name: 'HP Boost', desc: '+20% max HP & heal', icon: '\u2764\uFE0F', maxStacks: 5, unlockChapter: 1, category: 'Health',
    onPick(p) { const gain = Math.floor(p.maxHp * 0.2); p.maxHp += gain; p.hp = Math.min(p.hp + gain, p.maxHp); } },
  { id: 'strongHeart', name: 'Strong Heart', desc: '+40% heart heal & drop rate', icon: '\u{1F497}', maxStacks: 3, unlockChapter: 1, category: 'Health',
    onPick(p) { p.heartHealMult = (p.heartHealMult || 1) + 0.4; p.heartDropChance = (p.heartDropChance || 0) + 0.03; } },
  { id: 'heal', name: 'Heal', desc: 'Heal 40% HP now', icon: '\u{1FA79}', maxStacks: 1, instant: true, unlockChapter: 1, category: 'Health',
    onPick(p) { p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.4), p.maxHp); } },
  { id: 'bloodthirst', name: 'Bloodthirst', desc: 'Heal 1.5% base HP per kill', icon: '\u{1FA78}', maxStacks: 3, unlockChapter: 3, category: 'Health',
    onPick(p) { p.healOnKillPct = (p.healOnKillPct || 0) + 0.015; } },

  // ── Circle (5) - Orbiting circles around player ──
  { id: 'fireCircle', name: 'Fire Circle', desc: 'Two flame orbs orbit you', icon: '\u{1F534}', maxStacks: 1, unlockChapter: 3, category: 'Circle',
    onPick(p) { p.circles.fire = (p.circles.fire || 0) + 1; } },
  { id: 'iceCircle', name: 'Ice Circle', desc: 'Two ice orbs orbit you', icon: '\u{1F535}', maxStacks: 1, unlockChapter: 3, category: 'Circle',
    onPick(p) { p.circles.ice = (p.circles.ice || 0) + 1; } },
  { id: 'poisonCircle', name: 'Poison Circle', desc: 'Two poison orbs orbit you', icon: '\u{1F7E2}', maxStacks: 1, unlockChapter: 4, category: 'Circle',
    onPick(p) { p.circles.poison = (p.circles.poison || 0) + 1; } },
  { id: 'boltCircle', name: 'Bolt Circle', desc: 'Two bolt orbs orbit you', icon: '\u{1F7E1}', maxStacks: 1, unlockChapter: 4, category: 'Circle',
    onPick(p) { p.circles.bolt = (p.circles.bolt || 0) + 1; } },
  { id: 'obsidianCircle', name: 'Obsidian Circle', desc: 'Two dark orbs orbit you', icon: '\u26AB', maxStacks: 1, unlockChapter: 6, category: 'Circle',
    onPick(p) { p.circles.obsidian = (p.circles.obsidian || 0) + 1; } },

  // ── Sword (4) - Orbiting swords, 100% dmg ──
  { id: 'fireSword', name: 'Fire Sword', desc: 'Orbiting fire sword', icon: '\u{1F5E1}\uFE0F', maxStacks: 1, unlockChapter: 1, category: 'Sword',
    onPick(p) { p.swords.fire = (p.swords.fire || 0) + 1; } },
  { id: 'iceSword', name: 'Ice Sword', desc: 'Orbiting ice sword', icon: '\u{1F5E1}\uFE0F', maxStacks: 1, unlockChapter: 1, category: 'Sword',
    onPick(p) { p.swords.ice = (p.swords.ice || 0) + 1; } },
  { id: 'poisonSword', name: 'Poison Sword', desc: 'Orbiting poison sword', icon: '\u{1F5E1}\uFE0F', maxStacks: 1, unlockChapter: 1, category: 'Sword',
    onPick(p) { p.swords.poison = (p.swords.poison || 0) + 1; } },
  { id: 'boltSword', name: 'Bolt Sword', desc: 'Orbiting bolt sword', icon: '\u{1F5E1}\uFE0F', maxStacks: 1, unlockChapter: 1, category: 'Sword',
    onPick(p) { p.swords.bolt = (p.swords.bolt || 0) + 1; } },

  // ── Strike (4) - Summoned swords, 150% dmg ──
  { id: 'blazingStrike', name: 'Blazing Strike', desc: 'Summon fire sword at enemies', icon: '\u{1F30B}', maxStacks: 2, unlockChapter: 6, category: 'Strike',
    onPick(p) { p.strikes.fire = (p.strikes.fire || 0) + 1; } },
  { id: 'frostStrike', name: 'Frost Strike', desc: 'Summon frost sword at enemies', icon: '\u{1F30A}', maxStacks: 2, unlockChapter: 6, category: 'Strike',
    onPick(p) { p.strikes.ice = (p.strikes.ice || 0) + 1; } },
  { id: 'toxicStrike', name: 'Toxic Strike', desc: 'Summon toxic sword at enemies', icon: '\u{1F9EA}', maxStacks: 2, unlockChapter: 6, category: 'Strike',
    onPick(p) { p.strikes.poison = (p.strikes.poison || 0) + 1; } },
  { id: 'boltStrike', name: 'Bolt Strike', desc: 'Summon bolt sword at enemies', icon: '\u26C8\uFE0F', maxStacks: 2, unlockChapter: 6, category: 'Strike',
    onPick(p) { p.strikes.bolt = (p.strikes.bolt || 0) + 1; } },

  // ── Star (4) - Homing stars, 200% dmg ──
  { id: 'blazingStar', name: 'Blazing Star', desc: 'Homing fire star', icon: '\u2604\uFE0F', maxStacks: 2, unlockChapter: 10, category: 'Star',
    onPick(p) { p.stars.fire = (p.stars.fire || 0) + 1; } },
  { id: 'frostStar', name: 'Frost Star', desc: 'Homing ice star', icon: '\u2744\uFE0F', maxStacks: 2, unlockChapter: 10, category: 'Star',
    onPick(p) { p.stars.ice = (p.stars.ice || 0) + 1; } },
  { id: 'toxicStar', name: 'Toxic Star', desc: 'Homing poison star', icon: '\u2623\uFE0F', maxStacks: 2, unlockChapter: 10, category: 'Star',
    onPick(p) { p.stars.poison = (p.stars.poison || 0) + 1; } },
  { id: 'boltStar', name: 'Bolt Star', desc: 'Homing bolt star', icon: '\u{1F4AB}', maxStacks: 2, unlockChapter: 10, category: 'Star',
    onPick(p) { p.stars.bolt = (p.stars.bolt || 0) + 1; } },

  // ── Meteor (4) - Big AoE, 200% dmg ──
  { id: 'blazingMeteor', name: 'Blazing Meteor', desc: 'Meteor strikes enemies', icon: '\u{1F320}', maxStacks: 2, unlockChapter: 9, category: 'Meteor',
    onPick(p) { p.meteors.fire = (p.meteors.fire || 0) + 1; } },
  { id: 'frostMeteor', name: 'Frost Meteor', desc: 'Ice meteor strikes enemies', icon: '\u{1F328}\uFE0F', maxStacks: 2, unlockChapter: 9, category: 'Meteor',
    onPick(p) { p.meteors.ice = (p.meteors.ice || 0) + 1; } },
  { id: 'toxicMeteor', name: 'Toxic Meteor', desc: 'Toxic meteor strikes enemies', icon: '\u{1F32B}\uFE0F', maxStacks: 2, unlockChapter: 9, category: 'Meteor',
    onPick(p) { p.meteors.poison = (p.meteors.poison || 0) + 1; } },
  { id: 'boltMeteor', name: 'Bolt Meteor', desc: 'Thunder meteor strikes enemies', icon: '\u{1F329}\uFE0F', maxStacks: 2, unlockChapter: 9, category: 'Meteor',
    onPick(p) { p.meteors.bolt = (p.meteors.bolt || 0) + 1; } },

  // ── Scaling (4) - Health-dependent, gradual scaling ──
  { id: 'fury', name: 'Fury', desc: '+0.4% atk speed per 1% HP missing', icon: '\u{1F624}', maxStacks: 1, unlockChapter: 7, category: 'Scaling',
    onPick(p) { p.fury = true; } },
  { id: 'rage', name: 'Rage', desc: 'Damage scales with missing HP', icon: '\u{1F92C}', maxStacks: 1, unlockChapter: 7, category: 'Scaling',
    onPick(p) { p.rage = true; } },
  { id: 'grace', name: 'Grace', desc: 'Hearts heal more at low HP', icon: '\u{1F607}', maxStacks: 1, unlockChapter: 7, category: 'Scaling',
    onPick(p) { p.grace = true; } },
  { id: 'agility', name: 'Agility', desc: '+0.3% dodge per 1% HP missing', icon: '\u{1F3C3}', maxStacks: 1, unlockChapter: 7, category: 'Scaling',
    onPick(p) { p.agility = true; } },

  // ── Other ──
  { id: 'headshot', name: 'Headshot', desc: '12.5% instant kill chance', icon: '\u{1F3AA}', maxStacks: 1, unlockChapter: 6, category: 'Other',
    onPick(p) { p.headshot = true; } },
  { id: 'smart', name: 'Smart', desc: '+30% XP, +2 max level', icon: '\u{1F9E0}', maxStacks: 3, unlockChapter: 1, category: 'Other',
    onPick(p) { p.xpMult = (p.xpMult || 1) + 0.3; p.maxLevelBonus = (p.maxLevelBonus || 0) + 2; } },
  { id: 'greed', name: 'Greed', desc: '+25% gems, enemies +20% dmg', icon: '\u{1F4B0}', maxStacks: 2, unlockChapter: 3, category: 'Other',
    onPick(p) { p.greedMult = (p.greedMult || 1) + 0.25; p.greedDmgTaken = (p.greedDmgTaken || 1) + 0.2; } },
  { id: 'overdraft', name: 'Overdraft', desc: '+45% atk speed, -20% XP', icon: '\u{1F4C9}', maxStacks: 3, unlockChapter: 5, category: 'Other',
    onPick(p) { p.cdMult *= (1 / 1.45); p.xpMult = (p.xpMult || 1) * 0.8; } },
  { id: 'holyTouch', name: 'Holy Touch', desc: 'Arrows spawn perpendicular bolts', icon: '\u271D\uFE0F', maxStacks: 1, unlockChapter: 4, category: 'Other',
    onPick(p) { p.holyTouchStacks = (p.holyTouchStacks || 0) + 1; } },
  { id: 'dodgeMaster', name: 'Dodge Master', desc: '+20% dodge chance', icon: '\u{1F32A}\uFE0F', maxStacks: 3, unlockChapter: 5, category: 'Other',
    onPick(p) { p.dodgeChance = 1 - (1 - (p.dodgeChance || 0)) * (1 - 0.2); } },
  { id: 'slowProjectile', name: 'Slow Projectile', desc: 'Enemy bullets 30% slower', icon: '\u{1F40C}', maxStacks: 2, unlockChapter: 3, category: 'Other',
    onPick(p) { p.slowProjectile = (p.slowProjectile || 0) + 0.3; } },
  { id: 'shadowClone', name: 'Shadow Clone', desc: 'Clone fires arrows at enemies', icon: '\u{1F464}', maxStacks: 1, unlockChapter: 3, category: 'Other',
    onPick(p) { p.shadowClones = (p.shadowClones || 0) + 1; } },
  { id: 'giant', name: 'Giant', desc: '+40% dmg, +5% HP, bigger body', icon: '\u{1F9CC}', maxStacks: 1, unlockChapter: 10, category: 'Other',
    onPick(p) { p.dmgMult += 0.4; const gain = Math.floor(p.maxHp * 0.05); p.maxHp += gain; p.hp = Math.min(p.hp + gain, p.maxHp); p.sizeScale = (p.sizeScale || 1) * 1.35; } },
  { id: 'dwarf', name: 'Dwarf', desc: '+10% crit, smaller body', icon: '\u{1F9D2}', maxStacks: 1, unlockChapter: 10, category: 'Other',
    onPick(p) { p.critChance += 0.10; p.sizeScale = (p.sizeScale || 1) * 0.7; } },
];

export function getAvailableSkills(player) {
  return ALL_SKILLS.filter(s =>
    (s.instant || (player.skills[s.id] || 0) < s.maxStacks) &&
    game.chapter >= (s.unlockChapter || 1)
  );
}

export function rollSkillChoices(player, count) {
  if (!count) count = 3;
  const available = getAvailableSkills(player);
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function pickSkill(index) {
  if (index < 0 || index >= game.levelUpChoices.length) return;
  const skill = game.levelUpChoices[index];
  const p = game.player;
  if (!skill.instant) {
    p.skills[skill.id] = (p.skills[skill.id] || 0) + 1;
  }
  skill.onPick(p);
  game.levelUpChoices = [];

  // Resume - check for explicit return state (angel panels)
  if (game._returnState) {
    game.state = game._returnState;
    game._returnState = null;
  } else if (game.enemies.length > 0) {
    game.state = 'playing';
  } else {
    game.state = 'exiting';
  }
}

// XP formula
export function xpForLevel(level) {
  return Math.floor(30 + level * 15 + level * level * 2);
}

export function giveXP(amount) {
  const p = game.player;
  // Accumulate XP during combat — applied after all enemies die
  game.pendingXP += Math.floor(amount * (p.xpMult || 1));
}

export function flushPendingXP() {
  const p = game.player;
  if (!p || game.pendingXP <= 0) return;
  p.xp += game.pendingXP;
  game.pendingXP = 0;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = xpForLevel(p.level);
    // Heal a little on level up
    p.hp = Math.min(p.hp + 15, p.maxHp);
    // Queue the level-up choice screen
    if (!game._pendingLevelUps) game._pendingLevelUps = 0;
    game._pendingLevelUps++;
  }
}

/**
 * Rebuild player stats from scratch based on current skills map.
 * Used by debug mode when toggling skills on/off.
 * Preserves: position, hp ratio, xp, level, skills map.
 */
export function rebuildPlayerFromSkills() {
  const p = game.player;
  if (!p) return;

  // Save state we want to keep
  const keep = {
    x: p.x, y: p.y,
    hpRatio: p.hp / p.maxHp,
    xp: p.xp, level: p.level, xpToNext: p.xpToNext,
    skills: { ...p.skills },
  };

  // Reset to base stats
  p.hp = 100; p.maxHp = 100;
  p.dmgMult = 1; p.speedMult = 1; p.cdMult = 1;
  p.critChance = 0; p.critDmg = 2;
  p.extraShots = 0; p.frontArrows = 0;
  p.diagonalArrows = false; p.sideArrows = false; p.rearShot = false;
  p.pierce = 0; p.bouncy = false; p.ricochet = false;
  p.blaze = false; p.freeze = false; p.poisonTouch = false; p.bolt = false; p.darkTouch = false;
  p.elementDmgMult = 1; p.elementBurst = false;
  p.deathBomb = false; p.deathNova = false; p.chillingBlast = false;
  p.healOnKillPct = 0; p.shieldCharges = 0; p.heartDropChance = 0;
  p.heartHealMult = 1; p.hpRegen = 0;
  p.iFrameBonus = 0; p.dodgeChance = 0;
  p.starDuration = 0; p.shieldGuards = 0;
  p.circles = { fire: 0, ice: 0, poison: 0, bolt: 0, obsidian: 0 };
  p.swords = { fire: 0, ice: 0, poison: 0, bolt: 0 };
  p.strikes = { fire: 0, ice: 0, poison: 0, bolt: 0 };
  p.stars = { fire: 0, ice: 0, poison: 0, bolt: 0 };
  p.meteors = { fire: 0, ice: 0, poison: 0, bolt: 0 };
  p.fury = false; p.rage = false; p.grace = false; p.agility = false;
  p.headshot = false; p.xpMult = 1; p.greedMult = 1; p.greedDmgTaken = 1;
  p.holyTouchStacks = 0; p.slowProjectile = 0;
  p.shadowClones = 0;
  p.magnetMult = 1;
  p.hpPlusStacks = 0; p.atkPlusStacks = 0; p.critPlusStacks = 0; p.spdPlusStacks = 0;
  p.speedAuraStacks = 0; p.critAuraStacks = 0;
  p.speedAuraRooms = 0; p.critAuraRooms = 0;
  p.maxLevelBonus = 0;
  p.sizeScale = 1;

  // Re-apply equipment
  if (getChaptersCleared() >= 0) {
    applyEquipment(p, getChosenWeaponLvl(), getChosenArmorLvl(), getEquippedRings(), getUnlockedRings());
  } else {
    p.dmgMult = 0.6;
    p.maxHp = 50;
  }

  // Re-apply all active skills
  for (const [id, count] of Object.entries(keep.skills)) {
    if (count <= 0) continue;
    const skill = ALL_SKILLS.find(sk => sk.id === id);
    if (!skill) continue;
    for (let i = 0; i < count; i++) {
      skill.onPick(p);
    }
  }

  // Restore position/progress
  p.x = keep.x; p.y = keep.y;
  p.xp = keep.xp; p.level = keep.level; p.xpToNext = keep.xpToNext;
  p.skills = keep.skills;
  p.hp = Math.round(keep.hpRatio * p.maxHp);
}

// Called after all enemies are dead to process queued level-ups
export function processPendingLevelUps() {
  if (!game._pendingLevelUps || game._pendingLevelUps <= 0) return false;
  game._pendingLevelUps--;
  sfxLevelUp();
  const choices = rollSkillChoices(game.player);
  if (choices.length > 0) {
    game.levelUpChoices = choices;
    game._levelUpSource = null; // regular level-up, not angel
    game._returnState = game.state;
    game.state = 'levelUp';
    return true;
  }
  return false;
}

// Apply Plus bonuses when a room is cleared without taking damage
export function applyPlusBonuses(player) {
  if (player.hpPlusStacks > 0) {
    const gain = Math.floor(player.maxHp * 0.022 * player.hpPlusStacks);
    player.maxHp += gain;
    player.hp = Math.min(player.hp + gain, player.maxHp);
  }
  if (player.atkPlusStacks > 0) {
    player.dmgMult += 0.0225 * player.atkPlusStacks;
  }
  if (player.critPlusStacks > 0) {
    player.critChance += 0.014 * player.critPlusStacks;
  }
  if (player.spdPlusStacks > 0) {
    player.speedMult += 0.019 * player.spdPlusStacks;
  }
}

// Activate aura rooms when entering a new stage
export function activateAuras(player) {
  if (player.speedAuraStacks > 0) {
    player.speedAuraRooms = 3; // current + next 2
  }
  if (player.critAuraStacks > 0) {
    player.critAuraRooms = 3;
  }
}

// Tick down aura rooms (call when entering a new stage)
export function tickAuraRooms(player) {
  if (player.speedAuraRooms > 0) player.speedAuraRooms--;
  if (player.critAuraRooms > 0) player.critAuraRooms--;
}
