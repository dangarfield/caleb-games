function loadData() {
  try {
    return JSON.parse(localStorage.getItem('calebArcadeData')) || {};
  } catch {
    return {};
  }
}

function saveData(d) {
  localStorage.setItem('calebArcadeData', JSON.stringify(d));
}

function getArchers() {
  const d = loadData();
  if (!d.archers) d.archers = {};
  const a = d.archers;
  if (a.bestStage === undefined) a.bestStage = 0;
  if (a.coins === undefined) a.coins = 0;
  if (a.chaptersCleared === undefined) a.chaptersCleared = -1;
  if (!Array.isArray(a.unlockedRings)) a.unlockedRings = [];
  if (!Array.isArray(a.equippedRings)) a.equippedRings = [null, null];

  // Migrate from old systems
  if (a.inventory || a.equipped || a.nextIid !== undefined || a.weaponLevel !== undefined) {
    delete a.inventory;
    delete a.equipped;
    delete a.nextIid;
    delete a._seededAllEquip;
    delete a.weaponLevel;
    delete a.armorLevel;
    saveData(d);
  }

  return a;
}

function setArchers(a) {
  const d = loadData();
  d.archers = a;
  saveData(d);
}

export function getBest() {
  return getArchers().bestStage;
}

export function saveBest(s) {
  const a = getArchers();
  if (s > a.bestStage) a.bestStage = s;
  setArchers(a);
}

export function getCoins() {
  return getArchers().coins;
}

export function saveCoins(c) {
  const a = getArchers();
  a.coins = c;
  setArchers(a);
}

export function getChaptersCleared() {
  return getArchers().chaptersCleared;
}

export function saveChaptersCleared(c) {
  const a = getArchers();
  if (c > a.chaptersCleared) a.chaptersCleared = c;
  setArchers(a);
}

// Max equipment level derived from chapters cleared (1-10)
export function getEquipLevel() {
  return Math.max(1, Math.min(getArchers().chaptersCleared + 1, 10));
}

// Chosen weapon/armor levels (player picks from unlocked range)
export function getChosenWeaponLvl() {
  const a = getArchers();
  const max = Math.max(1, Math.min(a.chaptersCleared + 1, 10));
  if (a.chosenWeaponLvl === undefined) return max;
  return Math.min(a.chosenWeaponLvl, max);
}

export function getChosenArmorLvl() {
  const a = getArchers();
  const max = Math.max(1, Math.min(a.chaptersCleared + 1, 10));
  if (a.chosenArmorLvl === undefined) return max;
  return Math.min(a.chosenArmorLvl, max);
}

export function setChosenWeaponLvl(lvl) {
  const a = getArchers();
  a.chosenWeaponLvl = lvl;
  setArchers(a);
}

export function setChosenArmorLvl(lvl) {
  const a = getArchers();
  a.chosenArmorLvl = lvl;
  setArchers(a);
}

// Rings: unlocked ring IDs and equipped ring IDs (2 slots)
export function getUnlockedRings() {
  return getArchers().unlockedRings;
}

export function getEquippedRings() {
  return getArchers().equippedRings;
}

export function unlockRing(ringId) {
  const a = getArchers();
  if (!a.unlockedRings.includes(ringId)) {
    a.unlockedRings.push(ringId);
    setArchers(a);
  }
}

export function setEquippedRing(slot, ringId) {
  const a = getArchers();
  a.equippedRings[slot] = ringId;
  setArchers(a);
}

// Last run progress (chapter + last cleared stage)
export function getLastRun() {
  const a = getArchers();
  return a.lastRun || null; // { chapter, stage }
}

export function saveLastRun(chapter, stage, playerSnapshot) {
  const a = getArchers();
  a.lastRun = { chapter, stage, player: playerSnapshot };
  setArchers(a);
}

export function clearLastRun() {
  const a = getArchers();
  delete a.lastRun;
  setArchers(a);
}

// Debug state persistence
export function loadDebug() {
  const a = getArchers();
  return a.debug || { enabled: false, noDmgToPlayer: false, noDmgToEnemy: false, noVFX: false };
}

export function saveDebug(dbg) {
  const a = getArchers();
  a.debug = { enabled: dbg.enabled, noDmgToPlayer: dbg.noDmgToPlayer, noDmgToEnemy: dbg.noDmgToEnemy, noVFX: !!dbg.noVFX };
  setArchers(a);
}
