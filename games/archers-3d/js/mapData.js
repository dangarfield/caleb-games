// mapData.js - Load and manage stage layouts from archers-map.json

let mapData = null;
let usedBossMaps = {};   // per chapter key: Set of used boss map ids
let usedAngelMaps = new Set();

export async function loadMapData() {
  const resp = await fetch('./archers-map.json');
  mapData = await resp.json();
  return mapData;
}

export function getMapData() { return mapData; }

export function getChapterConfig(chapterNum) {
  if (!mapData?.config) return null;
  return mapData.config[`ch${chapterNum}`] || null;
}

export function resetUsedMaps() {
  usedBossMaps = {};
  usedAngelMaps = new Set();
}

function getGroupEntries(groupId) {
  return mapData?.registry?.[groupId] || [];
}

// Parse a stage map into terrain cells and entity placements
export function parseStageMap(stageId) {
  const m = mapData?.maps?.[stageId];
  if (!m) return null;

  const walls = [];
  const water = [];
  const spikes = [];
  const entities = [];

  for (let row = 0; row < m.h; row++) {
    for (let col = 0; col < m.w; col++) {
      const idx = row * m.w + col;
      const tType = parseInt(m.t[idx], 36);
      if (tType === 1) walls.push({ col, row });
      else if (tType === 2) water.push({ col, row });
      else if (tType === 3) spikes.push({ col, row });

      const eChar = m.e[idx];
      if (eChar !== '.') {
        const typeKey = m.el?.[eChar];
        if (typeKey) entities.push({ col, row, typeKey });
      }
    }
  }

  return { w: m.w, h: m.h, walls, water, spikes, entities };
}

// Pick a stage map for given chapter and stage number
export function pickStageMap(chapterNum, stageInChapter) {
  if (!mapData) return null;

  const chKey = `ch${chapterNum}`;
  const config = mapData.config?.[chKey];
  const stageCount = config?.stageCount || 25;

  // Tutorial (ch0): play maps in order, not random
  if (chapterNum === 0) {
    const entries = getGroupEntries(chKey);
    if (entries.length > 0) {
      const idx = Math.min(stageInChapter - 1, entries.length - 1);
      const entry = entries[idx];
      return entry ? { stageId: entry.id, stageType: entry.type } : null;
    }
    return null;
  }

  // Last stage = final boss
  if (stageInChapter >= stageCount) {
    const entries = getGroupEntries(chKey);
    const fb = entries.find(e => e.type === 'final_boss');
    return fb ? { stageId: fb.id, stageType: 'final_boss' } : null;
  }

  const bossStages = (config?.bossStages || '').split(',').filter(Boolean).map(Number);
  const angelStages = (config?.angelStages || '').split(',').filter(Boolean).map(Number);

  // Boss stage (takes priority)
  if (bossStages.includes(stageInChapter)) {
    const entries = getGroupEntries(chKey);
    const bossMaps = entries.filter(e => e.type === 'boss');
    if (!usedBossMaps[chKey]) usedBossMaps[chKey] = new Set();
    const available = bossMaps.filter(e => !usedBossMaps[chKey].has(e.id));
    const pool = available.length > 0 ? available : bossMaps;
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      usedBossMaps[chKey].add(pick.id);
      return { stageId: pick.id, stageType: 'boss' };
    }
  }

  // Angel stage (only if not already a boss stage)
  if (angelStages.includes(stageInChapter) && !bossStages.includes(stageInChapter)) {
    const entries = getGroupEntries('angel');
    const available = entries.filter(e => !usedAngelMaps.has(e.id));
    const pool = available.length > 0 ? available : entries;
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      usedAngelMaps.add(pick.id);
      return { stageId: pick.id, stageType: 'angel' };
    }
  }

  // Regular stage from common pool (can repeat)
  const commonEntries = getGroupEntries('common');
  if (commonEntries.length > 0) {
    const pick = commonEntries[Math.floor(Math.random() * commonEntries.length)];
    return { stageId: pick.id, stageType: 'stage' };
  }

  return null;
}
