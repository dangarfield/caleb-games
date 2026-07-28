// Progression - levels, ranks, stars, localStorage persistence, per-player profiles

// Job titles earned by level (max level 20 for titles)
const JOB_TITLES = [
  { level: 1, title: 'Trainee' },
  { level: 2, title: 'Cadet' },
  { level: 3, title: 'Apprentice' },
  { level: 4, title: 'Junior Technician' },
  { level: 5, title: 'Technician' },
  { level: 6, title: 'Senior Technician' },
  { level: 7, title: 'Specialist' },
  { level: 8, title: 'Senior Specialist' },
  { level: 9, title: 'Field Operative' },
  { level: 10, title: 'Squad Leader' },
  { level: 11, title: 'Expert' },
  { level: 12, title: 'Senior Expert' },
  { level: 13, title: 'Master Defuser' },
  { level: 14, title: 'Chief Defuser' },
  { level: 15, title: 'Commander' },
  { level: 16, title: 'Elite Commander' },
  { level: 17, title: 'Director' },
  { level: 18, title: 'Head of Operations' },
  { level: 19, title: 'Bomb Disposal Legend' },
  { level: 20, title: 'Grandmaster' },
];

export function getJobTitle(highestLevel) {
  const capped = Math.min(highestLevel, 20);
  let title = JOB_TITLES[0].title;
  for (const jt of JOB_TITLES) {
    if (capped >= jt.level) title = jt.title;
  }
  return title;
}

// How many solution steps per level range
export function getSolutionCount(level) {
  if (level <= 3) return 3;
  if (level <= 7) return 4;
  if (level <= 12) return 5;
  return 6;
}

// Which component types are unlocked at a given level
export function getUnlockedComponents(level) {
  const pool = ['wire', 'button'];
  if (level >= 3) pool.push('keypad');
  if (level >= 5) pool.push('switch');
  if (level >= 7) pool.push('turnKey');
  if (level >= 9) pool.push('holdButton');
  if (level >= 11) pool.push('pressureValve');
  return pool;
}

// How many screw panels to place (0 at early levels)
export function getScrewPanelCount(level) {
  if (level <= 3) return 0;
  if (level <= 6) return 1;
  if (level <= 10) return 2;
  return 3;
}

// Which bomb shapes are available at a given level
export function getAvailableShapes(level) {
  const shapes = ['cube'];
  if (level >= 2) shapes.push('cylinder');
  if (level >= 4) shapes.push('suitcase');
  if (level >= 6) shapes.push('sphere');
  if (level >= 9) shapes.push('briefcase');
  return shapes;
}

export function getRank(totalDefused) {
  // Legacy compat — not used for job title but kept for stats
  if (totalDefused >= 200) return { name: 'Legend' };
  if (totalDefused >= 100) return { name: 'Master' };
  if (totalDefused >= 60) return { name: 'Expert' };
  if (totalDefused >= 30) return { name: 'Specialist' };
  if (totalDefused >= 10) return { name: 'Technician' };
  return { name: 'Recruit' };
}

export function getStars(timeRemaining, totalTime) {
  const ratio = timeRemaining / totalTime;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

// localStorage — per-player profiles
function loadArcadeData() {
  try { return JSON.parse(localStorage.getItem('calebArcadeData')) || {}; } catch (e) { return {}; }
}

function saveArcadeData(data) {
  localStorage.setItem('calebArcadeData', JSON.stringify(data));
}

function defaultPlayerData() {
  return {
    highestLevel: 1,
    totalDefused: 0,
    bestStreak: 0,
    currentLevel: 1,
    currentRound: 1,
  };
}

export function getPlayers() {
  const data = loadArcadeData();
  if (!data.bombDefuser) data.bombDefuser = {};
  if (!data.bombDefuser.players) {
    data.bombDefuser.players = {
      Caleb: defaultPlayerData(),
      Ezra: defaultPlayerData(),
    };
    saveArcadeData(data);
  }
  return data.bombDefuser.players;
}

export function loadPlayerData(playerName) {
  const data = loadArcadeData();
  if (!data.bombDefuser) data.bombDefuser = {};
  if (!data.bombDefuser.players) data.bombDefuser.players = {};
  if (!data.bombDefuser.players[playerName]) {
    data.bombDefuser.players[playerName] = defaultPlayerData();
    saveArcadeData(data);
  }
  return data.bombDefuser.players[playerName];
}

export function savePlayerData(playerName, playerData) {
  const data = loadArcadeData();
  if (!data.bombDefuser) data.bombDefuser = {};
  if (!data.bombDefuser.players) data.bombDefuser.players = {};
  data.bombDefuser.players[playerName] = playerData;
  saveArcadeData(data);
}

// Legacy compat
export function loadGameData() {
  return loadPlayerData('Caleb');
}

export function saveGameData(gameData) {
  savePlayerData('Caleb', gameData);
}
