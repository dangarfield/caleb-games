// Static content: glass colours + rarity, beach compositions, ceramic sets,
// bottle styles and the milestone table. Pure data + tiny pure helpers, so every
// other module can import it without pulling in three/cannon.

export const RARITY = {
  common:   { id: 'common',   name: 'Common',   color: '#b8c6c4', stars: '★' },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#4fc3f7', stars: '★★' },
  rare:     { id: 'rare',     name: 'Rare',     color: '#ffd32a', stars: '★★★' },
};

// hex = body tint, grams = typical weight of one piece, value = points/score weight.
export const GLASS = {
  white:  { id: 'white',  name: 'Frosted White', hex: 0xdfeeea, rarity: 'common',   grams: 4.5, value: 1 },
  green:  { id: 'green',  name: 'Bottle Green',  hex: 0x6fb45f, rarity: 'common',   grams: 5.0, value: 1 },
  brown:  { id: 'brown',  name: 'Amber Brown',   hex: 0x96602f, rarity: 'common',   grams: 5.5, value: 1 },
  blue:   { id: 'blue',   name: 'Cobalt Blue',   hex: 0x3f7ec9, rarity: 'uncommon', grams: 4.2, value: 3 },
  aqua:   { id: 'aqua',   name: 'Seafoam Aqua',  hex: 0x62d3c4, rarity: 'uncommon', grams: 4.0, value: 3 },
  pink:   { id: 'pink',   name: 'Rose Pink',     hex: 0xeda2bd, rarity: 'rare',     grams: 3.6, value: 8 },
  red:    { id: 'red',    name: 'Ruby Red',      hex: 0xd93f38, rarity: 'rare',     grams: 3.4, value: 14 },
  orange: { id: 'orange', name: 'Sunset Orange', hex: 0xed8a34, rarity: 'rare',     grams: 3.5, value: 12 },
  yellow: { id: 'yellow', name: 'Lemon Yellow',  hex: 0xead45d, rarity: 'rare',     grams: 3.8, value: 9 },
  purple: { id: 'purple', name: 'Lavender',      hex: 0x9a72cc, rarity: 'rare',     grams: 3.9, value: 10 },
  black:  { id: 'black',  name: 'Black Glass',   hex: 0x2b3033, rarity: 'rare',     grams: 6.2, value: 8 },
};

export const GLASS_IDS = Object.keys(GLASS);

export const CERAMIC_GRAMS = 7.5;

// ---------------------------------------------------------------------------
// Beaches. Each is a *composition*: stone palette + size band + a weighted glass
// table + its own 10-shard ceramic set. Weights are relative, not percentages.
// ---------------------------------------------------------------------------
export const BEACHES = [
  {
    id: 'pebbleCove',
    name: 'Pebble Cove',
    blurb: 'Small smooth grey pebbles and gentle water. A kind place to start.',
    cardGradient: 'linear-gradient(150deg,#3f6f86,#6d93a4,#c9bfa4)',
    stones: [0x8e9aa0, 0xb6bdbf, 0x6f7c84, 0xd6d2c6, 0x9aa79b],
    stoneSize: [0.078, 0.125],
    coverage: 1.80,
    sandColor: 0xd8c9a6,
    seaColor: 0x2f88b5,
    hazeColor: 0xcfe6f2,
    glassWeights: { white: 34, green: 30, brown: 22, blue: 9, aqua: 5 },
    glassPerSection: [5, 8],
    ceramic: {
      name: 'The Willow Plate',
      kind: 'plate',
      base: 0xf3ece0,
      accent: 0x2d5da8,
      note: 'A blue-and-white plate that crossed an ocean before it broke.',
    },
  },
  {
    id: 'copperShore',
    name: 'Copper Shore',
    blurb: 'Coarse rust-red shingle below an old brickworks. Big, rattly stones.',
    cardGradient: 'linear-gradient(150deg,#7d3b21,#b3673a,#e0b483)',
    stones: [0x9e6543, 0x86503a, 0xc08a5e, 0x6f5343, 0xd6bb9a],
    stoneSize: [0.105, 0.172],
    coverage: 1.60,
    sandColor: 0xbf9a6f,
    seaColor: 0x2b7a9c,
    hazeColor: 0xe6d6bd,
    glassWeights: { brown: 32, green: 24, white: 16, aqua: 11, yellow: 8, orange: 5, red: 4 },
    glassPerSection: [5, 8],
    ceramic: {
      name: 'The Terracotta Pot',
      kind: 'pot',
      base: 0xc4703f,
      accent: 0xf0dcc0,
      note: 'A garden pot from the old works, back in one piece at last.',
    },
  },
  {
    id: 'shellBay',
    name: 'Shell Bay',
    blurb: 'Pale, tiny pebbles mixed with crushed shell. Pink glass hides here.',
    cardGradient: 'linear-gradient(150deg,#c98fa0,#e9c9c2,#f4e6cf)',
    stones: [0xe6d9c7, 0xf0e3d3, 0xd9b9ad, 0xc8b6a0, 0xf5ece0],
    stoneSize: [0.055, 0.09],
    coverage: 2.00,
    sandColor: 0xe8dcc2,
    seaColor: 0x3aa0bd,
    hazeColor: 0xf3e8dd,
    glassWeights: { white: 30, aqua: 20, green: 16, brown: 10, blue: 10, pink: 9, purple: 5 },
    glassPerSection: [6, 9],
    ceramic: {
      name: 'The Delft Tile',
      kind: 'tile',
      base: 0xf6f2e6,
      accent: 0x3a6fbe,
      note: 'A hand-painted tile with a little windmill on it.',
    },
  },
  {
    id: 'stormPoint',
    name: 'Storm Point',
    blurb: 'Dark slate boulders under a stiff wind. Rare glass gets thrown up here.',
    cardGradient: 'linear-gradient(150deg,#2b3238,#4c5b64,#7d8b8f)',
    stones: [0x3a4247, 0x555f66, 0x2a3033, 0x6b757a, 0x474f52],
    stoneSize: [0.118, 0.196],
    coverage: 1.45,
    sandColor: 0x9c9a90,
    seaColor: 0x1f5f7d,
    hazeColor: 0xb8c6cc,
    glassWeights: { green: 22, brown: 18, black: 16, white: 14, blue: 12, red: 8, orange: 6, yellow: 4 },
    glassPerSection: [5, 8],
    ceramic: {
      name: 'The Stoneware Jug',
      kind: 'jug',
      base: 0x8f7f66,
      accent: 0x3d4a52,
      note: 'A salt-glazed jug from a ship that never made harbour.',
    },
    lock: { milestone: 'ceramic1' },
  },
  {
    id: 'moonlitStrand',
    name: 'Moonlit Strand',
    blurb: 'Fine silver-lavender shingle that glitters. The rarest colours wash up here.',
    cardGradient: 'linear-gradient(150deg,#3c3470,#6c5ce7,#a9a6d8)',
    stones: [0x8f8bad, 0xb9b5cf, 0x6e6a8c, 0xd2cee0, 0xa39fbd],
    stoneSize: [0.068, 0.112],
    coverage: 1.95,
    sandColor: 0xc3bcc9,
    seaColor: 0x2a4f96,
    hazeColor: 0xd8d4ee,
    glassWeights: { white: 20, aqua: 18, purple: 16, green: 12, blue: 12, pink: 10, red: 6, orange: 6 },
    glassPerSection: [6, 9],
    ceramic: {
      name: 'The Porcelain Vase',
      kind: 'vase',
      base: 0xf0eef6,
      accent: 0x7d5bc6,
      note: 'Thin as an eggshell, and somehow all ten pieces survived.',
    },
    lock: { milestone: 'weight400' },
  },
  {
    id: 'lanternHarbour',
    name: 'Lantern Harbour',
    blurb: 'Coal-black cobbles under the old harbour wall. Lantern glass ends up here.',
    cardGradient: 'linear-gradient(150deg,#14232b,#2f5a5c,#8aa38f)',
    stones: [0x2f3a38, 0x46534d, 0x1e2724, 0x5d6b60, 0x39443c],
    // Small and densely packed: the opposite composition to Storm Point's
    // boulders, so the two dark beaches do not comb the same way.
    stoneSize: [0.112, 0.185],
    coverage: 1.55,
    sandColor: 0x7d7f72,
    seaColor: 0x18566b,
    hazeColor: 0xa9bcbb,
    glassWeights: { black: 22, brown: 20, green: 16, red: 12, white: 10, orange: 8, blue: 7, yellow: 5 },
    glassPerSection: [6, 10],
    ceramic: {
      name: 'The Harbour Bowl',
      kind: 'bowl',
      base: 0x46525a,
      accent: 0xe8c46a,
      note: 'A sailors’ mess bowl, gold rim and all, whole again after a century.',
    },
    lock: { milestone: 'ceramic3' },
  },
];

export const BEACH_BY_ID = {};
for (const b of BEACHES) BEACH_BY_ID[b.id] = b;

export const STARTING_BEACHES = ['pebbleCove', 'copperShore', 'shellBay'];

// ---------------------------------------------------------------------------
// Bottle styles for the collection view. r/h are in the collection world's units.
// ---------------------------------------------------------------------------
export const BOTTLES = [
  { id: 'jamjar',     name: 'Jam Jar',    r: 0.62, h: 1.05, neck: 0.86, tint: 0xdfeee8 },
  { id: 'tall',       name: 'Tall Bottle', r: 0.44, h: 1.55, neck: 0.44, tint: 0xbfe0d0 },
  { id: 'apothecary', name: 'Apothecary',  r: 0.58, h: 1.30, neck: 0.55, tint: 0xd6e2f2 },
  { id: 'demijohn',   name: 'Demijohn',    r: 0.78, h: 1.15, neck: 0.50, tint: 0xe6dcc4 },
  // Narrow and tall: the glass stacks into a column instead of a heap, which is a
  // genuinely different thing to look at (and to tip over).
  { id: 'thin',       name: 'Thin Jar',    r: 0.30, h: 1.62, neck: 0.78, tint: 0xf0d8e4 },
];
export const BOTTLE_BY_ID = {};
for (const b of BOTTLES) BOTTLE_BY_ID[b.id] = b;

// ---------------------------------------------------------------------------
// Milestones. progress(save) -> { have, need }. reward is granted once.
// ---------------------------------------------------------------------------
function totalGlass(s) {
  let n = 0;
  for (const id of GLASS_IDS) n += s.glass[id] || 0;
  return n;
}
function coloursFound(s, tier) {
  let n = 0;
  for (const id of GLASS_IDS) {
    if ((s.glass[id] || 0) > 0 && (!tier || GLASS[id].rarity === tier)) n++;
  }
  return n;
}
function ceramicsDone(s) { return s.completed.length; }

export const MILESTONES = [
  {
    id: 'radar', icon: '\u{1F4E1}', title: 'Radar Ping',
    desc: 'Find 30 pieces to learn the radar sweep — it shows you where buried glass is.',
    reward: { type: 'move', id: 'radar', label: 'Radar' },
    progress: (s) => ({ have: totalGlass(s) + s.ceramicFound, need: 30 }),
  },
  {
    id: 'torch', icon: '\u{1F4A1}', title: 'Beachcomber’s Shine',
    desc: 'Find 75 pieces to unlock Shine — sea glass glows through the pebbles.',
    reward: { type: 'move', id: 'torch', label: 'Shine' },
    progress: (s) => ({ have: totalGlass(s) + s.ceramicFound, need: 75 }),
  },
  {
    id: 'commonSet', icon: '\u{1F52C}', title: 'The Everyday Three',
    desc: 'Find white, green and brown glass. Unlocks the Apothecary jar.',
    reward: { type: 'bottle', id: 'apothecary', label: 'Apothecary jar' },
    progress: (s) => ({ have: coloursFound(s, 'common'), need: 3 }),
  },
  {
    id: 'pank', icon: '\u{1F338}', title: 'Pank!',
    desc: 'Beachcombers call pink sea glass “pank”. Find 10 of it to earn the Thin Jar.',
    reward: { type: 'bottle', id: 'thin', label: 'Thin Jar' },
    progress: (s) => ({ have: s.glass.pink || 0, need: 10 }),
  },
  {
    id: 'tallBottle', icon: '\u{1F9F4}', title: 'A Hundred and Fifty Finds',
    desc: 'Collect 150 pieces in total. Unlocks the Tall Bottle.',
    reward: { type: 'bottle', id: 'tall', label: 'Tall Bottle' },
    progress: (s) => ({ have: totalGlass(s) + s.ceramicFound, need: 150 }),
  },
  {
    id: 'ceramic1', icon: '\u{1F958}', title: 'Put Back Together',
    desc: 'Rebuild one ceramic item from its 10 shards. Opens up Storm Point.',
    reward: { type: 'beach', id: 'stormPoint', label: 'Storm Point' },
    progress: (s) => ({ have: ceramicsDone(s), need: 1 }),
  },
  {
    id: 'weight400', icon: '⚖️', title: 'Heavy Pockets',
    desc: 'Carry home 1200g of glass. Opens up the Moonlit Strand.',
    reward: { type: 'beach', id: 'moonlitStrand', label: 'Moonlit Strand' },
    progress: (s) => ({ have: Math.round(s.weight), need: 1200 }),
  },
  {
    id: 'uncommonSet', icon: '\u{1F30A}', title: 'Blue &amp; Aqua',
    desc: 'Find both uncommon colours: cobalt blue and seafoam aqua.',
    reward: { type: 'title', id: 'tideReader', label: 'Tide Reader' },
    progress: (s) => ({ have: coloursFound(s, 'uncommon'), need: 2 }),
  },
  {
    id: 'wave', icon: '\u{1F30A}', title: 'Wave Wash',
    desc: 'Find 3 rare colours to unlock Wave Wash — a sweep of water that rolls the pebbles back.',
    reward: { type: 'move', id: 'wave', label: 'Wave Wash' },
    progress: (s) => ({ have: coloursFound(s, 'rare'), need: 3 }),
  },
  {
    id: 'demijohn', icon: '\u{1F3FA}', title: 'Rare Collector',
    desc: 'Find 5 of the 6 rare colours. Unlocks the big Demijohn.',
    reward: { type: 'bottle', id: 'demijohn', label: 'Demijohn' },
    progress: (s) => ({ have: coloursFound(s, 'rare'), need: 5 }),
  },
  {
    id: 'rainbow', icon: '\u{1F308}', title: 'The Whole Rainbow',
    desc: 'Find every one of the 11 sea glass colours.',
    reward: { type: 'title', id: 'rainbow', label: 'Rainbow Combed' },
    progress: (s) => ({ have: coloursFound(s), need: GLASS_IDS.length }),
  },
  {
    id: 'weight1000', icon: '\u{1F5FF}', title: 'Three Kilos of Sea Glass',
    desc: 'Carry home 3000g. That is a proper haul.',
    reward: { type: 'title', id: 'kilo', label: 'Three Kilo Club' },
    progress: (s) => ({ have: Math.round(s.weight), need: 3000 }),
  },
  {
    id: 'white25', icon: '\u{1F90D}', title: 'Seventy-five Whites',
    desc: 'Frosted white is everywhere — gather 75 of it.',
    reward: { type: 'title', id: 'frost', label: 'Frost Hunter' },
    progress: (s) => ({ have: s.glass.white || 0, need: 75 }),
  },
  {
    id: 'ceramic3', icon: '\u{1F3FA}', title: 'Museum Shelf',
    desc: 'Rebuild three different ceramic items. Opens up Lantern Harbour.',
    reward: { type: 'beach', id: 'lanternHarbour', label: 'Lantern Harbour' },
    progress: (s) => ({ have: ceramicsDone(s), need: 3 }),
  },
  {
    id: 'ceramicAll', icon: '\u{1F451}', title: 'Every Last Shard',
    desc: 'Rebuild the ceramic item on all six beaches.',
    reward: { type: 'title', id: 'allCeramics', label: 'Master Beachcomber' },
    progress: (s) => ({ have: ceramicsDone(s), need: BEACHES.length }),
  },
];

export const MILESTONE_BY_ID = {};
for (const m of MILESTONES) MILESTONE_BY_ID[m.id] = m;

// --- helpers ---------------------------------------------------------------

export function rarityOf(colourId) { return RARITY[GLASS[colourId].rarity]; }

export function hexCss(hexNum) {
  return '#' + hexNum.toString(16).padStart(6, '0');
}

/** Weighted pick from a beach's glass table. */
export function pickGlassColour(beach, rnd) {
  const entries = Object.entries(beach.glassWeights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rnd() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries[0][0];
}

/**
 * Spawn chance of every colour on one beach, as a percentage, commonest first.
 * The weights are relative, so this is the only place the player-facing number
 * gets worked out — showing "34%" is far more use than three stars alone.
 */
export function beachGlassChances(beach) {
  const entries = Object.entries(beach.glassWeights);
  let total = 0;
  for (const [, w] of entries) total += w;
  return entries
    .map(([id, w]) => ({ id, pct: (w / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

/**
 * A colour's chance averaged over every beach in the game — the "overall
 * rarity" number for the collection screen. Beaches where a colour never
 * appears count as zero, which is exactly why the rares come out so low.
 */
const _globalPct = {};
{
  for (const id of GLASS_IDS) _globalPct[id] = 0;
  for (const b of BEACHES) {
    for (const c of beachGlassChances(b)) _globalPct[c.id] += c.pct / BEACHES.length;
  }
}
export function globalGlassChance(colourId) { return _globalPct[colourId] || 0; }

/** One decimal below 10%, none above — 0.4% and 34% both need to read cleanly. */
export function pctLabel(pct) {
  if (pct <= 0) return '0%';
  if (pct < 1) return pct.toFixed(1) + '%';
  if (pct < 10) return pct.toFixed(1) + '%';
  return Math.round(pct) + '%';
}
