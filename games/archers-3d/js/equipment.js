// equipment.js - Equipment system
// Weapons & armor auto-upgrade on chapter clear. Rings bought with gems in armory.
import { getCoins, saveCoins } from './storage.js';

// Weapons: level 1-10, dmgMult doubles each level (matches chapter scaling)
const WEAPONS = [
  { level: 1,  name: 'Short Bow',     icon: '\u{1F3F9}', img: 'images/equipment/weapon_01_short_bow.jpg', atk: 1,   rarity: 'common' },
  { level: 2,  name: 'Long Bow',      icon: '\u{1F3F9}', img: 'images/equipment/weapon_02_long_bow.jpg', atk: 2,   rarity: 'common' },
  { level: 3,  name: 'Hunter Bow',    icon: '\u{1F3F9}', img: 'images/equipment/weapon_03_hunter_bow.jpg', atk: 4,   rarity: 'uncommon' },
  { level: 4,  name: 'War Bow',       icon: '\u2694\uFE0F', img: 'images/equipment/weapon_04_war_bow.jpg', atk: 8,   rarity: 'uncommon' },
  { level: 5,  name: 'Ironwood Bow', icon: '\u2694\uFE0F', img: 'images/equipment/weapon_05_ironwood_bow.jpg', atk: 16,  rarity: 'rare' },
  { level: 6,  name: 'Arcane Bow',    icon: '\u2728', img: 'images/equipment/weapon_06_arcane_bow.jpg', atk: 32,  rarity: 'rare' },
  { level: 7,  name: 'Rune Bow',      icon: '\u2728', img: 'images/equipment/weapon_07_rune_bow.jpg', atk: 64,  rarity: 'epic' },
  { level: 8,  name: 'Spirit Bow',    icon: '\u{1F300}', img: 'images/equipment/weapon_08_spirit_bow.jpg', atk: 128, rarity: 'epic' },
  { level: 9,  name: 'Dragon Bow',    icon: '\u{1F409}', img: 'images/equipment/weapon_09_dragon_bow.jpg', atk: 256, rarity: 'legendary' },
  { level: 10, name: 'Celestial Bow', icon: '\u{1F31F}', img: 'images/equipment/weapon_10_celestial_bow.jpg', atk: 512, rarity: 'legendary' },
];

const ARMORS = [
  { level: 1,  name: 'Woven Tunic',    icon: '\u{1F455}', img: 'images/equipment/armor_01_woven_tunic.jpg', hp: 100,   rarity: 'common' },
  { level: 2,  name: 'Leather Vest',   icon: '\u{1F9BA}', img: 'images/equipment/armor_02_leather_vest.jpg', hp: 200,   rarity: 'common' },
  { level: 3,  name: 'Studded Vest',   icon: '\u{1F9BA}', img: 'images/equipment/armor_03_studded_vest.jpg', hp: 400,   rarity: 'uncommon' },
  { level: 4,  name: 'Chain Mail',     icon: '\u{1F6E1}\uFE0F', img: 'images/equipment/armor_04_chain_mail.jpg', hp: 800,   rarity: 'uncommon' },
  { level: 5,  name: 'Brigandine',     icon: '\u{1F6E1}\uFE0F', img: 'images/equipment/armor_05_brigandine.jpg', hp: 1600,  rarity: 'rare' },
  { level: 6,  name: 'Plate Armour',   icon: '\u{1F6E1}\uFE0F', img: 'images/equipment/armor_06_plate_armour.jpg', hp: 3200,  rarity: 'rare' },
  { level: 7,  name: 'Rune Armour',    icon: '\u{1F52E}', img: 'images/equipment/armor_07_rune_armour.jpg', hp: 6400,  rarity: 'epic' },
  { level: 8,  name: 'Spirit Armour',  icon: '\u{1F300}', img: 'images/equipment/armor_08_spirit_armour.jpg', hp: 12800, rarity: 'epic' },
  { level: 9,  name: 'Dragon Scale',   icon: '\u{1F432}', img: 'images/equipment/armor_09_dragon_scale.jpg', hp: 25600, rarity: 'legendary' },
  { level: 10, name: 'Celestial Mail', icon: '\u{1F31F}', img: 'images/equipment/armor_10_celestial_mail.jpg', hp: 51200, rarity: 'legendary' },
];

// 10 rings with escalating gem costs (~2 chapter runs per ring)
// Rings that grant skills set p.skills[id] so the skill won't be offered again during the run.
export const RINGS = [
  { id: 'ring_crit',    name: 'Ring of Precision',  icon: '\u{1F3AF}', img: 'images/equipment/ring_01_precision.jpg', cost: 100,  trait: '+15% crit chance',          traitFn: p => { p.critChance = (p.critChance||0) + 0.15; } },
  { id: 'ring_regen',   name: 'Ring of Renewal',    icon: '\u{1F49A}', img: 'images/equipment/ring_02_renewal.jpg', cost: 150,  trait: 'Heal 1% HP/s',              traitFn: p => { p.regenPct = (p.regenPct||0) + 0.01; } },
  { id: 'ring_health',  name: 'Ring of Life',       icon: '\u2764\uFE0F', img: 'images/equipment/ring_03_life.jpg', cost: 200,  trait: '+20% max HP',            traitFn: p => { p.maxHp = Math.floor(p.maxHp * 1.2); } },
  { id: 'ring_wisdom',  name: 'Ring of Wisdom',     icon: '\u{1F4D6}', img: 'images/equipment/ring_04_wisdom.jpg', cost: 300,  trait: '+30% XP bonus',             traitFn: p => { p.xpMult = (p.xpMult || 1) * 1.3; } },
  { id: 'ring_fortune', name: 'Ring of Fortune',    icon: '\u{1F48E}', img: 'images/equipment/ring_05_fortune.jpg', cost: 400,  trait: '+25% extra gems',           traitFn: p => { p.greedMult = (p.greedMult || 1) * 1.25; } },
  { id: 'ring_speed',   name: 'Ring of Haste',      icon: '\u{1F4A8}', img: 'images/equipment/ring_06_haste.jpg', cost: 550,  trait: '+15% move speed',           traitFn: p => { p.speedMult += 0.15; } },
  { id: 'ring_storm',   name: 'Ring of the Storm',  icon: '\u26A1', img: 'images/equipment/ring_07_storm.jpg',    cost: 700,  trait: 'Start with Multishot',      traitFn: p => { p.extraShots += 1; p.dmgMult *= 0.9; p.cdMult *= (1 / 0.85); p.skills.multishot = (p.skills.multishot || 0) + 1; } },
  { id: 'ring_power',   name: 'Ring of Power',      icon: '\u{1F4AA}', img: 'images/equipment/ring_08_power.jpg', cost: 900,  trait: '+15% damage',               traitFn: p => { p.dmgMult *= 1.15; } },
  { id: 'ring_frost',   name: 'Ring of Frost',      icon: '\u2744\uFE0F', img: 'images/equipment/ring_09_frost.jpg', cost: 1150, trait: 'Start with frost trio',  traitFn: p => { p.stars.ice = (p.stars.ice||0) + 1; p.strikes.ice = (p.strikes.ice||0) + 1; p.swords.ice = (p.swords.ice||0) + 1; p.skills.frostStar = (p.skills.frostStar||0) + 1; p.skills.frostStrike = (p.skills.frostStrike||0) + 1; p.skills.iceSword = (p.skills.iceSword||0) + 1; } },
  { id: 'ring_titan',   name: 'Ring of the Titan',  icon: '\u{1F9CC}', img: 'images/equipment/ring_10_titan.jpg', cost: 1500, trait: 'Start with Giant',          traitFn: p => { p.dmgMult += 0.4; const gain = Math.floor(p.maxHp * 0.05); p.maxHp += gain; p.sizeScale = (p.sizeScale||1) * 1.35; p.skills.giant = (p.skills.giant||0) + 1; } },
];

export function getWeapon(level) { return WEAPONS[Math.min(level, WEAPONS.length) - 1] || WEAPONS[0]; }
export function getArmor(level) { return ARMORS[Math.min(level, ARMORS.length) - 1] || ARMORS[0]; }
export function getRingById(id) { return RINGS.find(r => r.id === id) || null; }

// Apply equipment stats to player at start of run
// weaponLevel & armorLevel = chaptersCleared + 1 (clamped to 1-10)
export function applyEquipment(player, weaponLevel, armorLevel, equippedRings, unlockedRings) {
  const weapon = getWeapon(weaponLevel);
  const armor = getArmor(armorLevel);
  player.dmgMult = weapon.atk;
  player.maxHp = armor.hp;
  player.arrowColor = RARITY_COLORS[weapon.rarity] || '#ffffff';
  player.armorColor = RARITY_COLORS[armor.rarity] || '#ffffff';

  for (const ringId of equippedRings) {
    if (!ringId) continue;
    if (!unlockedRings.includes(ringId)) continue;
    const ring = getRingById(ringId);
    if (ring && ring.traitFn) ring.traitFn(player);
  }

  player.hp = player.maxHp;
}

// Try to buy a ring. Returns true if successful.
export function buyRing(ringId, unlockedRings) {
  const ring = getRingById(ringId);
  if (!ring) return false;
  if (unlockedRings.includes(ringId)) return false;
  const coins = getCoins();
  if (coins < ring.cost) return false;
  saveCoins(coins - ring.cost);
  return true;
}

export const RARITY_COLORS = {
  common: '#ffffff',
  uncommon: '#2ecc71',
  rare: '#00e5ff',
  epic: '#9b59b6',
  legendary: '#ffd700',
};
