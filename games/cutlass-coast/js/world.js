// world.js — the hand-authored 1660 Caribbean for Cutlass Coast.
// Everything geographic lives in the TABLES below (towns, island blobs, quest sites).
// A map generator can later replace TOWN_TABLE / ISLAND_TABLE and keep every function.
//
// Coordinates: world units, x = west→east (0..WORLD_W), z = north→south (0..WORLD_H).
// North is −z. Ship heading h (radians): forward = (sin h, cos h) in (x,z), so
// ship.rotation.y = h and heading 0 points SOUTH (+z, matching the PLT ship model).
// Compass bearings are degrees clockwise from north.

export const WORLD_W = 4000, WORLD_H = 3000;
export const KNOT = 3;            // world units / second per knot of ship speed
export const FLEET_MAX = 5;       // most ships you can own (shipwright + prizes share this)
export const PORT_RING = 70;      // enter a town when within this of town.harbour
export const EDGE = 30;           // the chart's edge: ships are kept this far inside
export const inBounds = (x, z, m = EDGE) => x >= m && z >= m && x <= WORLD_W - m && z <= WORLD_H - m;
export const SECONDS_PER_DAY = 6; // spec: ~1 in-game day per 6s of sailing

// ---------- small utils ----------
export function rng(seed = 1) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
function weighted(r, list) { const tot = list.reduce((s, e) => s + e.weight, 0); let x = r() * tot; for (const e of list) { if ((x -= e.weight) <= 0) return e; } return list[list.length - 1]; }

const LON0 = -91.5, LON1 = -59, LAT0 = 30.5, LAT1 = 8;
export function project(lon, lat) { return { x: (lon - LON0) / (LON1 - LON0) * WORLD_W, z: (LAT0 - lat) / (LAT0 - LAT1) * WORLD_H }; }

// ---------- nations ----------
export const NATION_IDS = ['england', 'france', 'holland', 'spain'];
export const NATIONS = {
  england: { id: 'england', name: 'England', adj: 'English', color: '#b3372c', colony: 'ENGLISH COLONY' },
  france:  { id: 'france',  name: 'France',  adj: 'French',  color: '#2d4f8e', colony: 'FRENCH COLONY' },
  holland: { id: 'holland', name: 'Holland', adj: 'Dutch',   color: '#d9772b', colony: 'DUTCH COLONY' },
  spain:   { id: 'spain',   name: 'Spain',   adj: 'Spanish', color: '#d8b43a', colony: 'SPANISH COLONY' },
  pirate:  { id: 'pirate',  name: 'Pirates', adj: 'Pirate',  color: '#1b1b1b', colony: 'PIRATE HAVEN' },
};
export const HOME_PORT = { england: 'portroyal', france: 'tortuga', holland: 'curacao', spain: 'santodomingo' };
// 1660: "no peace beyond the line" — Spain is at war with the English and French in the Caribbean.
export const RELATIONS_1660 = { 'england|spain': 'war', 'france|spain': 'war', 'england|france': 'peace', 'england|holland': 'peace', 'france|holland': 'peace', 'holland|spain': 'peace' };
export function relation(a, b, table = RELATIONS_1660) {
  if (a === b) return 'ally';
  if (a === 'pirate' || b === 'pirate') return 'war';
  return table[[a, b].sort().join('|')] || 'peace';
}

// ---------- island blobs (lon, lat, radius in world units) ----------
// Each blob is a rough circle; chains of blobs make the big landmasses. PLT.terrain.island
// makes the visual; world.coastDist() is the simple collision / shallows field.
const ISLAND_TABLE = [
  // Cuba
  ['Cuba', -84.5, 22.0, 70], ['Cuba', -83.4, 22.45, 80], ['Cuba', -82.2, 22.55, 85], ['Cuba', -80.9, 22.45, 85],
  ['Cuba', -79.6, 22.05, 85], ['Cuba', -78.3, 21.6, 85], ['Cuba', -77.1, 21.05, 85], ['Cuba', -75.9, 20.45, 80], ['Cuba', -74.8, 20.2, 55],
  ['Isle of Pines', -82.8, 21.65, 38], ['Grand Cayman', -81.25, 19.3, 18],
  // Hispaniola
  ['Hispaniola', -73.6, 18.45, 55], ['Hispaniola', -72.4, 18.95, 85], ['Hispaniola', -71.1, 19.1, 100], ['Hispaniola', -69.9, 18.95, 85], ['Hispaniola', -68.85, 18.65, 55],
  ['Tortuga', -72.75, 20.3, 26],
  // Jamaica
  ['Jamaica', -77.55, 18.2, 65], ['Jamaica', -76.75, 18.15, 60],
  // Puerto Rico & Virgins
  ['Puerto Rico', -66.85, 18.25, 60], ['Puerto Rico', -65.95, 18.25, 50], ['Virgin Islands', -64.7, 18.4, 20],
  // Lesser Antilles
  ['St. Martin', -63.05, 18.05, 18], ['St. Eustatius', -63.0, 17.55, 16], ['St. Kitts', -62.7, 17.3, 18], ['Antigua', -61.8, 17.1, 26],
  ['Guadeloupe', -61.6, 16.2, 42], ['Dominica', -61.35, 15.42, 28], ['Martinique', -61.0, 14.65, 38], ['St. Lucia', -60.97, 13.9, 26],
  ['St. Vincent', -61.2, 13.25, 20], ['Barbados', -59.55, 13.15, 28], ['Grenada', -61.68, 12.1, 20], ['Tobago', -60.7, 11.25, 20],
  ['Trinidad', -61.3, 10.4, 58],
  // ABC & Margarita
  ['Aruba', -70.0, 12.5, 18], ['Curaçao', -68.95, 12.2, 26], ['Bonaire', -68.3, 12.15, 20], ['Margarita', -64.0, 11.0, 30],
  // Bahamas
  ['Grand Bahama', -78.5, 26.65, 34], ['Andros', -77.95, 24.4, 50], ['Eleuthera', -76.3, 25.2, 28], ['Abaco', -77.2, 26.4, 30],
  // Florida
  ['Florida', -81.0, 25.6, 60], ['Florida', -81.3, 26.6, 95], ['Florida', -81.7, 27.9, 115], ['Florida', -82.2, 29.2, 130],
  ['Florida', -83.8, 30.6, 170], ['Florida', -86.5, 31.2, 170],
  // Yucatán & Central America
  ['Yucatán', -89.3, 20.3, 170], ['Yucatán', -88.0, 19.4, 120], ['Yucatán', -91.1, 19.0, 150], ['Yucatán', -90.6, 17.4, 190],
  ['Yucatán', -88.8, 17.2, 130], ['Honduras', -88.3, 15.4, 150], ['Honduras', -86.6, 14.9, 150], ['Honduras', -84.9, 14.5, 150],
  ['Mosquito Coast', -84.6, 12.9, 150], ['Mosquito Coast', -84.5, 11.2, 150], ['Panama', -83.2, 9.4, 140], ['Panama', -81.3, 8.3, 130],
  ['Panama', -79.6, 8.25, 115], ['Panama', -78.1, 8.1, 115],
  // The Main (South American coast)
  ['The Main', -76.4, 7.7, 170], ['The Main', -75.0, 8.9, 190], ['The Main', -73.6, 9.7, 190], ['The Main', -72.3, 10.4, 150],
  ['Guajira', -71.9, 11.45, 60], ['The Main', -70.9, 9.9, 150], ['Paraguaná', -70.05, 11.75, 40], ['The Main', -69.4, 9.6, 190],
  ['The Main', -67.2, 9.1, 210], ['The Main', -65.0, 8.9, 210], ['The Main', -62.7, 8.9, 220],
];
export const ISLANDS = ISLAND_TABLE.map(([isle, lon, lat, r], i) => {
  const p = project(lon, lat);
  const arid = /Curaçao|Aruba|Bonaire|Paraguaná|Guajira|Margarita/.test(isle);
  return { id: 'blob' + i, isle, cx: Math.round(p.x), cz: Math.round(p.z), r, seed: 1000 + i * 17, biome: arid ? 'arid' : 'jungle', height: Math.round(Math.min(90, 14 + r * 0.35)), mainland: r >= 110 };
});

/** Signed distance to the nearest coast: < 0 on land, > 0 at sea. Also returns the nearest blob. */
export function coastInfo(x, z) {
  let best = Infinity, blob = null;
  for (const b of ISLANDS) { const d = Math.hypot(x - b.cx, z - b.cz) - b.r; if (d < best) { best = d; blob = b; } }
  return { d: best, blob };
}
export const coastDist = (x, z) => coastInfo(x, z).d;
export const isLand = (x, z) => coastDist(x, z) < 0;
// normal pointing out to sea (gradient of coastDist)
function seaNormal(x, z) {
  const e = 4, gx = coastDist(x + e, z) - coastDist(x - e, z), gz = coastDist(x, z + e) - coastDist(x, z - e);
  const l = Math.hypot(gx, gz) || 1; return { x: gx / l, z: gz / l };
}
function toCoast(x, z) { for (let i = 0; i < 16; i++) { const d = coastDist(x, z); if (Math.abs(d) < 0.5) break; const n = seaNormal(x, z); x -= n.x * d; z -= n.z * d; } return { x, z }; }

// ---------- towns ----------
// id, name, nation, lon, lat, population, wealth 1..4, garrison, governor, produces, isle
const TOWN_TABLE = [
  ['havana', 'Havana', 'spain', -82.38, 23.13, 5200, 4, 400, 'Don Juan de Salamanca', 'cocoa'],
  ['santiago', 'Santiago', 'spain', -75.82, 20.02, 2100, 2, 200, 'Don Pedro de Bayona', 'sugar'],
  ['portroyal', 'Port Royal', 'england', -76.84, 17.94, 2400, 3, 180, "Colonel Edward D'Oyley", 'sugar'],
  ['tortuga', 'Tortuga', 'france', -72.78, 20.05, 900, 2, 60, 'Jérémie Deschamps', 'hides'],
  ['petitgoave', 'Petit-Goâve', 'france', -72.86, 18.43, 700, 1, 60, 'Sieur de Rossey', 'hides'],
  ['santodomingo', 'Santo Domingo', 'spain', -69.9, 18.47, 3800, 3, 300, 'Don Juan Balboa', 'sugar'],
  ['sanjuan', 'San Juan', 'spain', -66.1, 18.47, 2600, 3, 350, 'Don Juan Pérez de Guzmán', 'sugar'],
  ['staugustine', 'St. Augustine', 'spain', -81.31, 29.9, 900, 1, 150, 'Don Alonso de Aranguiz', 'hides'],
  ['steustatius', 'St. Eustatius', 'holland', -63.12, 17.52, 600, 2, 50, 'Pieter van Corselles', 'spices'],
  ['antigua', 'Antigua', 'england', -61.85, 17.12, 800, 2, 70, 'Colonel Christopher Keynell', 'cocoa'],
  ['guadeloupe', 'Guadeloupe', 'france', -61.85, 16.15, 1600, 2, 120, 'Charles Houël', 'sugar'],
  ['martinique', 'Martinique', 'france', -61.3, 14.5, 2000, 3, 150, 'Adrien de Vaudroques', 'sugar'],
  ['barbados', 'Barbados', 'england', -59.62, 13.1, 4500, 4, 250, 'Daniel Searle', 'sugar'],
  ['trinidad', 'Trinidad', 'spain', -61.51, 10.65, 500, 1, 80, 'Don Juan de Viedma', 'cocoa'],
  ['cumana', 'Cumaná', 'spain', -64.18, 10.46, 900, 2, 150, 'Don Juan de Urpín', 'spices'],
  ['caracas', 'Caracas', 'spain', -66.93, 10.6, 2400, 3, 250, 'Don Pedro de Porres', 'spices'],
  ['curacao', 'Curaçao', 'holland', -68.93, 12.11, 1400, 3, 150, 'Mathias Beck', 'spices'],
  ['maracaibo', 'Maracaibo', 'spain', -71.64, 10.65, 1500, 3, 200, 'Don Gabriel Guerrero', 'cocoa'],
  ['riohacha', 'Rio de la Hacha', 'spain', -72.91, 11.54, 600, 2, 100, 'Don Diego de Vargas', 'hides'],
  ['santamarta', 'Santa Marta', 'spain', -74.2, 11.24, 800, 2, 120, 'Don Pedro del Castillo', 'hides'],
  ['cartagena', 'Cartagena', 'spain', -75.51, 10.42, 4800, 4, 500, 'Don Pedro Zapata', 'spices'],
  ['portobello', 'Porto Bello', 'spain', -79.66, 9.55, 1200, 4, 350, 'Don Alonso de Guzmán', 'spices'],
  ['campeche', 'Campeche', 'spain', -90.53, 19.85, 1600, 2, 200, 'Don Francisco de Bazán', 'hides'],
  ['trujillo', 'Trujillo', 'spain', -85.95, 15.92, 500, 1, 80, 'Don Martín de Lezama', 'hides'],
];
// open water for the harbour ring: try the sea normal first, then swing either side
function findHarbour(c, n) {
  const base = Math.atan2(n.x, n.z);
  for (const need of [45, 32, 22]) for (let k = 0; k <= 12; k++) for (const sgn of k ? [1, -1] : [1]) {
    const a = base + sgn * k * 0.17, dx = Math.sin(a), dz = Math.cos(a);
    for (let dist = 60; dist <= 130; dist += 10) {
      const x = c.x + dx * dist, z = c.z + dz * dist;
      if (x < 20 || z < 20 || x > WORLD_W - 20 || z > WORLD_H - 20) break;
      let ok = coastDist(x, z) >= need;
      for (let s = 0.35; ok && s < 1; s += 0.2) ok = coastDist(c.x + dx * dist * s, c.z + dz * dist * s) > 4;
      if (ok) return { x, z };
    }
  }
  return { x: c.x + n.x * 70, z: c.z + n.z * 70 };
}
export const WEALTH_LABEL = ['', 'Poor', 'Modest', 'Prosperous', 'Rich'];
export const TOWNS = TOWN_TABLE.map(([id, name, nation, lon, lat, pop, wealth, garrison, governor, produces]) => {
  const raw = project(lon, lat);
  const c = toCoast(raw.x, raw.z);
  const n = seaNormal(c.x, c.z);
  const pos = { x: Math.round(c.x - n.x * 14), z: Math.round(c.z - n.z * 14) };
  const h = findHarbour(c, n);
  const { blob } = coastInfo(pos.x, pos.z);
  const size = pop >= 3500 ? 'large' : pop >= 1400 ? 'medium' : 'small';
  return { id, name, nation, x: pos.x, z: pos.z, harbour: { x: Math.round(h.x), z: Math.round(h.z) }, seaDir: Math.atan2(h.x - c.x, h.z - c.z), // heading pointing out to sea
    pop, wealth, garrison, governor, produces, isle: blob ? blob.isle : '', size, seed: hash(id) };
});
/** Where a ship appears when leaving town: outside the harbour ring in open water. → {x, z, heading} */
export function departurePoint(town, dist = PORT_RING + 60) {
  const t = typeof town === 'string' ? townById(town) : town;
  let best = null;
  for (let k = 0; k <= 15; k++) for (const sgn of k ? [1, -1] : [1]) {
    const a = t.seaDir + sgn * k * 0.2, x = t.harbour.x + Math.sin(a) * dist, z = t.harbour.z + Math.cos(a) * dist, d = coastDist(x, z);
    if (!inBounds(x, z, EDGE + 40)) continue;            // never put a ship off the edge of the chart
    if (d >= 45) return { x, z, heading: a };
    if (!best || d > best.d) best = { x, z, heading: a, d };
  }
  if (!best) { const x = Math.max(EDGE + 40, Math.min(WORLD_W - EDGE - 40, t.harbour.x)), z = Math.max(EDGE + 40, Math.min(WORLD_H - EDGE - 40, t.harbour.z)); return { x, z, heading: Math.atan2(WORLD_W / 2 - x, WORLD_H / 2 - z) }; }
  return { x: best.x, z: best.z, heading: best.heading };
}
export const townById = id => TOWNS.find(t => t.id === id) || null;
/** Town merged with career overrides (career.towns[id] = {nation, garrison, wealth, pop}). */
export function townInfo(idOrTown, career) {
  const t = typeof idOrTown === 'string' ? townById(idOrTown) : idOrTown; if (!t) return null;
  const o = career && career.towns && career.towns[t.id]; return o ? Object.assign({}, t, o) : t;
}
export function nearestTown(x, z, filter) {
  let best = null, bd = Infinity;
  for (const t of TOWNS) { if (filter && !filter(t)) continue; const d = Math.hypot(t.harbour.x - x, t.harbour.z - z); if (d < bd) { bd = d; best = t; } }
  return best ? { town: best, dist: bd } : null;
}
// ---------- names you can find on the chart ----------
// Every place the game talks about is either a port or one of these chart labels (Dan: no hard-to-find references).
const ISLE_DISPLAY = { 'The Main': 'the Spanish Main', Guajira: 'the Spanish Main', 'Paraguaná': 'the Spanish Main' };
/** Display name for an island/coast (the South American coast is "the Spanish Main"). */
export const isleName = isle => ISLE_DISPLAY[isle] || isle;
const LABELLED_LAND = ['Cuba', 'Hispaniola', 'Jamaica', 'Puerto Rico', 'Florida', 'Yucatán', 'Honduras', 'Panama', 'Isle of Pines', 'Andros'];
const isleCentre = isle => { const bs = ISLANDS.filter(b => b.isle === isle); return { x: bs.reduce((a, b) => a + b.cx, 0) / bs.length, z: bs.reduce((a, b) => a + b.cz, 0) / bs.length }; };
/** Labels drawn on the parchment chart. kind 'land' = a named coast/island, 'region' = a wider area used by family clues. */
export const CHART_LABELS = [
  ...LABELLED_LAND.map(isle => ({ kind: 'land', text: isle, ...isleCentre(isle), ...({ Cuba: { dx: 20, dz: 150 }, Florida: { dz: 70 }, Honduras: { dz: -30 }, 'Isle of Pines': { dz: 60 }, Andros: { dx: 10, dz: 100 }, Hispaniola: { dx: 60, dz: 160 }, Jamaica: { dz: 150 }, 'Puerto Rico': { dz: 120 }, Panama: { dz: 45 } }[isle] || {}) })),
  { kind: 'land', text: 'The Bahamas', x: 1990, z: 560 },
  { kind: 'land', text: 'The Spanish Main', x: 2640, z: 2890 },
  { kind: 'region', text: 'Greater Antilles', x: 2150, z: 1110 },
  { kind: 'region', text: 'Leeward &|Windward Isles', x: 3420, z: 1990 },
].map(l => ({ ...l, x: Math.round(l.x + (l.dx || 0)), z: Math.round(l.z + (l.dz || 0)) }));
const LABEL_SET = new Set(LABELLED_LAND);
/** "Off Tortuga" / "Near Cuba" / "Near Martinique" / "Open sea" — only names that are on the chart. */
export function placeName(x, z) {
  const nt = nearestTown(x, z);
  if (nt && nt.dist < 380) return 'Off ' + nt.town.name;
  const ci = coastInfo(x, z);
  if (ci.d < 220 && (LABEL_SET.has(ci.blob.isle) || ISLE_DISPLAY[ci.blob.isle])) return 'Near ' + isleName(ci.blob.isle);
  if (nt && nt.dist < 750) return 'Near ' + nt.town.name;
  return 'Open sea';
}

// ---------- compass & wind ----------
export const headingVec = h => ({ x: Math.sin(h), z: Math.cos(h) });
export const headingToBearing = h => ((180 - h * 180 / Math.PI) % 360 + 360) % 360;
export const bearingToHeading = b => (180 - b) * Math.PI / 180;
export const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
const PTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = bearing => PTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

export const WIND_STRENGTHS = { light: { name: 'Light', mult: 0.82 }, fresh: { name: 'Fresh', mult: 1.0 }, strong: { name: 'Strong', mult: 1.25 } };
export const TRADE_WIND_FROM = 70; // ENE trades
/** wind state = { from: bearing the wind blows FROM, strength: 'light'|'fresh'|'strong', nextChangeDay } */
export function initWind(r = Math.random) { return { from: TRADE_WIND_FROM, strength: 'fresh', nextChangeDay: 18 + Math.floor(r() * 6) }; }
/** Drift the wind when career.elapsed passes nextChangeDay. Returns true if it changed. */
export function stepWind(w, day, r = Math.random) {
  if (day < w.nextChangeDay) return false;
  w.from = Math.round(((TRADE_WIND_FROM + (r() * 2 - 1) * 55) + 360) % 360);
  const x = r(); w.strength = x < 0.25 ? 'light' : x < 0.8 ? 'fresh' : 'strong';
  w.nextChangeDay = day + 16 + Math.floor(r() * 8);
  return true;
}
/** Unit vector the wind blows TOWARD, scaled by strength multiplier. */
export function windVec(w) { const b = w.from * Math.PI / 180, m = WIND_STRENGTHS[w.strength].mult; return { x: -Math.sin(b) * m, z: Math.cos(b) * m }; }
/** Sailing factor 0.3..1 for a ship heading h: peaks on a broad reach, 0.3 in the no-go zone. */
export function windFactor(h, w) {
  const f = headingVec(h), v = windVec(w), m = Math.hypot(v.x, v.z) || 1;
  const off = Math.acos(Math.max(-1, Math.min(1, (f.x * v.x + f.z * v.z) / m))) * 180 / Math.PI; // 0 = dead downwind, 180 = straight into wind
  // Dan: bad wind shouldn't bite so hard — even straight into the wind keeps over half speed
  const K = [[0, 0.9], [45, 1.0], [90, 0.96], [120, 0.86], [145, 0.72], [160, 0.62], [180, 0.55]];
  for (let i = 1; i < K.length; i++) if (off <= K[i][0]) { const [a0, v0] = K[i - 1], [a1, v1] = K[i]; return v0 + (v1 - v0) * (off - a0) / (a1 - a0); }
  return 0.55;
}
export const windLabel = w => `Wind ${compassName(w.from)} · ${WIND_STRENGTHS[w.strength].name}`;

// ---------- goods & prices ----------
export const GOODS = {
  sugar:   { id: 'sugar',   name: 'Sugar',   base: 60 },
  cocoa:   { id: 'cocoa',   name: 'Cocoa',   base: 90 },
  spices:  { id: 'spices',  name: 'Spices',  base: 140 },
  hides:   { id: 'hides',   name: 'Hides',   base: 40 },
};
export const GOOD_IDS = Object.keys(GOODS);
/** Price per ton at a town: {buy, sell}. bonus = e.g. 0.15 for Charm; mult = difficulty priceMult. */
export function priceAt(town, good, { bonus = 0, mult = 1, day = 0 } = {}) {
  const t = typeof town === 'string' ? townById(town) : town, g = GOODS[good];
  const wobble = ((hash(t.id + good + Math.floor(day / 30)) % 31) - 15) / 100; // ±15%, changes monthly
  let p = g.base * (t.produces === good ? 0.62 : 1.05 + wobble) * (0.9 + t.wealth * 0.05) * mult;
  return { buy: Math.max(5, Math.round(p * 1.08 / (1 + bonus))), sell: Math.max(3, Math.round(p * 0.92 * (1 + bonus))) };
}

// ---------- ships ----------
// speed in knots (× KNOT for world units/s), turn in rad/s, hull = hit points, cargo in tons
export const SHIP_CLASSES = {
  pinnace:     { id: 'pinnace',     name: 'Pinnace',     speed: 9.0, turn: 1.30, guns: 4,  crewMax: 30,  hull: 40,  cargo: 20,  price: 800,   masts: 1 },
  sloop:       { id: 'sloop',       name: 'Sloop',       speed: 8.5, turn: 1.20, guns: 8,  crewMax: 60,  hull: 60,  cargo: 40,  price: 1500,  masts: 1 },
  barque:      { id: 'barque',      name: 'Barque',      speed: 7.5, turn: 1.00, guns: 10, crewMax: 90,  hull: 80,  cargo: 60,  price: 2500,  masts: 2 },
  fluyt:       { id: 'fluyt',       name: 'Fluyt',       speed: 6.5, turn: 0.80, guns: 8,  crewMax: 70,  hull: 90,  cargo: 120, price: 3000,  masts: 3 },
  merchantman: { id: 'merchantman', name: 'Merchantman', speed: 6.5, turn: 0.80, guns: 12, crewMax: 100, hull: 110, cargo: 150, price: 4000,  masts: 3 },
  frigate:     { id: 'frigate',     name: 'Frigate',     speed: 8.0, turn: 0.90, guns: 24, crewMax: 200, hull: 150, cargo: 80,  price: 7000,  masts: 3 },
  galleon:     { id: 'galleon',     name: 'Galleon',     speed: 5.5, turn: 0.60, guns: 24, crewMax: 250, hull: 200, cargo: 200, price: 8000,  masts: 3 },
  warGalleon:  { id: 'warGalleon',  name: 'War Galleon', speed: 5.0, turn: 0.50, guns: 36, crewMax: 350, hull: 260, cargo: 150, price: 12000, masts: 4 },
};
export const SHIP_NAMES = {
  england: ['Speedwell', 'Mary Rose', 'Good Hope', 'Swallow', 'Dove', 'Endeavour', 'Merlin', 'Pelican'],
  france:  ['La Belle', 'Saint-Louis', 'La Fortune', 'Le Dauphin', "L'Espoir", 'La Licorne', 'Le Faucon'],
  holland: ['De Zeeuw', 'Gouden Leeuw', 'Hoop', 'De Vlieger', 'Eendracht', 'Zeepaard', 'De Kat'],
  spain:   ['Santa Lucía', 'San Felipe', 'Nuestra Señora', 'San José', 'Santa Ana', 'La Concepción', 'San Pedro'],
  pirate:  ['Black Gull', 'Sea Wolf', 'Revenge', 'Night Heron', 'Red Fox', 'Crooked Crab'],
};
export const CAPTAIN_NAMES = {
  england: ['Capt. Harlow', 'Capt. Pym', 'Capt. Fenwick', 'Capt. Blackwood'],
  france:  ['Capt. Duval', 'Capt. Lemaire', 'Capt. Moreau', 'Capt. Girard'],
  holland: ['Capt. de Vries', 'Capt. Visser', 'Capt. Bakker', 'Capt. Jansen'],
  spain:   ['Capt. Ortega', 'Capt. Ruiz', 'Capt. Alvarado', 'Capt. Mendoza'],
  pirate:  ['Capt. Gritt', 'Capt. One-Boot', 'Capt. Salt', 'Capt. Mags'],
};

// ---------- encounters ----------
export const ENCOUNTERS = [
  { kind: 'merchant',  weight: 40, classes: ['fluyt', 'merchantman', 'barque', 'pinnace'], note: "A trader. Slow, lightly armed, with cargo in the hold." },
  { kind: 'warship',   weight: 14, classes: ['frigate', 'warGalleon'], note: "A warship. Lots of guns and soldiers. Be careful." },
  { kind: 'pirate',    weight: 16, classes: ['pinnace', 'sloop', 'barque'], nation: 'pirate', note: "Pirates! Fast and hungry for a fight." },
  { kind: 'privateer', weight: 12, classes: ['sloop', 'barque', 'frigate'], note: "A privateer with a letter of marque." },
  { kind: 'treasure',  weight: 6,  classes: ['galleon'], nation: 'spain', note: "Probably a treasure fleet ship. It's slow and heavy with cargo." },
  { kind: 'smuggler',  weight: 12, classes: ['pinnace', 'sloop'], note: "A smuggler. Quick and slippery." },
];
/**
 * Roll a random ship near (x,z). Returns an ENEMY object — the shape battle/duel expect:
 * { id, name, captain, nation, type, kind, crew, guns, hull, hullMax, sails, gold, cargo{good:tons}, skill 0..1, villainId?, note }
 */
export function rollEncounter(r = Math.random, { x = 2000, z = 1500, enemySkill = 0.75 } = {}) {
  const e = weighted(r, ENCOUNTERS);
  let nation = e.nation;
  if (!nation) { // weight by the nations of the nearest towns
    const near = TOWNS.map(t => ({ t, d: Math.hypot(t.x - x, t.z - z) })).sort((a, b) => a.d - b.d).slice(0, 4);
    nation = pick(r, near.map(n => n.t.nation));
  }
  return makeShip(r, { kind: e.kind, nation, type: pick(r, e.classes), note: e.note, enemySkill });
}
export function makeShip(r, { kind = 'merchant', nation = 'spain', type = 'sloop', note = '', enemySkill = 0.75, name, captain } = {}) {
  const c = SHIP_CLASSES[type];
  const crewFrac = kind === 'merchant' || kind === 'treasure' ? 0.35 + r() * 0.2 : kind === 'warship' ? 0.8 + r() * 0.2 : 0.55 + r() * 0.35;
  const cargo = {};
  if (kind === 'merchant' || kind === 'treasure' || kind === 'smuggler') for (const g of GOOD_IDS) if (r() < 0.5) cargo[g] = Math.round(c.cargo * (0.1 + r() * 0.3));
  const goldMult = { merchant: 12, treasure: 60, warship: 6, pirate: 15, privateer: 10, smuggler: 14 }[kind] || 10;
  return {
    id: 'ship' + Math.floor(r() * 1e9).toString(36), name: name || pick(r, SHIP_NAMES[nation]), captain: captain || pick(r, CAPTAIN_NAMES[nation]),
    nation, type, kind, crew: Math.max(8, Math.round(c.crewMax * crewFrac)), guns: c.guns, hull: c.hull, hullMax: c.hull, sails: 100,
    gold: Math.round(c.guns * goldMult * (0.6 + r() * 0.8)) * 10, cargo, skill: Math.min(1, Math.max(0.2, enemySkill * (0.8 + r() * 0.4))), note,
  };
}
export function describeShip(s) {
  const who = s.kind === 'pirate' ? 'Pirate' : NATIONS[s.nation].adj;
  return { title: `${who} ${SHIP_CLASSES[s.type].name.toLowerCase()}`, note: s.note };
}

// ---------- villains ----------
export const VILLAINS = [
  { id: 'montbars', name: 'Montbars the Exterminator', ship: 'frigate', shipName: 'Black Gull', crew: 140, skill: 0.85, haunt: 'curacao', gold: 4000, fame: 12, fragment: { questId: 'silverfleet', index: 3 } },
  { id: 'brasiliano', name: 'Rock Brasiliano', ship: 'barque', shipName: 'Sea Wolf', crew: 90, skill: 0.75, haunt: 'campeche', gold: 2500, fame: 9, fragment: { questId: 'bishopbells', index: 2 } },
  { id: 'bartholomew', name: 'Bartholomew the Portuguese', ship: 'sloop', shipName: 'Night Heron', crew: 60, skill: 0.65, haunt: 'santiago', gold: 1800, fame: 7, fragment: { questId: 'crownhoard', index: 1 } },
  { id: 'pierre', name: 'Pierre le Grand', ship: 'barque', shipName: 'Revenge', crew: 80, skill: 0.7, haunt: 'sanjuan', gold: 2200, fame: 8, fragment: { questId: 'suncoins', index: 0 } },
  { id: 'blackpatch', name: 'Captain Blackpatch', ship: 'frigate', shipName: 'Crooked Crab', crew: 160, skill: 0.9, haunt: 'cartagena', gold: 5000, fame: 14, fragment: null },
];
export function villainShip(v, r = Math.random) {
  const s = makeShip(r, { kind: 'pirate', nation: 'pirate', type: v.ship, name: v.shipName, captain: v.name, enemySkill: v.skill, note: `The notorious ${v.name}!` });
  s.crew = v.crew; s.gold = v.gold; s.villainId = v.id; s.skill = v.skill; return s;
}

// ---------- family ----------
export const FAMILY = [
  { id: 'anne', name: 'Sister Anne', relation: 'sister', fame: 6 },
  { id: 'edmund', name: 'Uncle Edmund', relation: 'uncle', fame: 5 },
  { id: 'margaret', name: 'Aunt Margaret', relation: 'aunt', fame: 5 },
  { id: 'thomas', name: 'Grandfather Thomas', relation: 'grandfather', fame: 7 },
];
export const REGIONS = [
  { id: 'main', name: 'the Spanish Main', test: t => /The Main|Guajira|Paraguaná|Panama/.test(t.isle) || ['cartagena', 'portobello', 'santamarta', 'riohacha', 'maracaibo', 'caracas', 'cumana'].includes(t.id) },
  { id: 'antilles', name: 'the Greater Antilles', test: t => ['Cuba', 'Hispaniola', 'Jamaica', 'Puerto Rico', 'Tortuga'].includes(t.isle) },
  { id: 'islands', name: 'the Leeward & Windward Isles', test: t => ['Antigua', 'Guadeloupe', 'Martinique', 'Barbados', 'St. Eustatius', 'Trinidad', 'Curaçao'].includes(t.isle) },
  { id: 'west', name: 'Florida, Yucatán or Honduras', test: () => true },
];
export const regionOf = t => REGIONS.find(r => r.test(t));
/** Clue text for family member at clue level 1..4 (4 = exact town). */
export function familyClue(member, townId, level) {
  const t = townById(townId), reg = regionOf(t);
  if (level <= 1) return `Someone saw ${member.name} somewhere in ${reg.name}.`;
  if (level === 2) return `${member.name} is held in a ${NATIONS[t.nation].adj} town in ${reg.name}.`;
  if (level === 3) return `${member.name} is in a town on ${isleName(t.isle)}.`;
  return `${member.name} is in ${t.name}! Visit the town to bring them home.`;
}

// ---------- treasure quests ----------
export function coastSite(isle, bearing, inland = 18) {
  const blobs = ISLANDS.filter(b => b.isle === isle); const b = blobs[Math.floor(blobs.length / 2)];
  const a = bearing * Math.PI / 180; const c = toCoast(b.cx + Math.sin(a) * b.r, b.cz - Math.cos(a) * b.r); const n = seaNormal(c.x, c.z);
  return { x: Math.round(c.x - n.x * inland), z: Math.round(c.z - n.z * inland), beach: { x: Math.round(c.x + n.x * 60), z: Math.round(c.z + n.z * 60) } };
}
export const TREASURE_QUESTS = [
  { id: 'silverfleet', name: 'Treasure of the Silver Fleet', gold: 8000, area: 'South coast of Hispaniola', site: coastSite('Hispaniola', 210),
    blurb: 'Buried by a wrecked captain in 1631. The pieces show a bay with three palms and a ruined chapel to the north.',
    sources: [{ kind: 'tavern', townId: 'tortuga', hint: "A traveller in Tortuga's tavern" }, { kind: 'ship', shipKind: 'treasure', hint: 'Aboard a Spanish treasure ship' }, { kind: 'governor', townId: 'portroyal', hint: 'The governor of Port Royal · ask at his mansion' }, { kind: 'villain', villainId: 'montbars', hint: 'Held by the pirate Montbars' }] },
  { id: 'bishopbells', name: "The Bishop's Silver Bells", gold: 6000, area: 'Isle of Pines, south of Cuba', site: coastSite('Isle of Pines', 200),
    blurb: 'A bishop hid the church bells from raiders. Look for a white rock shaped like a bell.',
    sources: [{ kind: 'tavern', townId: 'havana', hint: 'A fisherman in Havana' }, { kind: 'tavern', townId: 'santiago', hint: "Santiago's tavern keeper" }, { kind: 'villain', villainId: 'brasiliano', hint: 'Carried by Rock Brasiliano' }, { kind: 'ship', shipKind: 'merchant', hint: 'A merchant captain near Cuba' }] },
  { id: 'crownhoard', name: 'The Lost Crown Hoard', gold: 5000, area: 'West shore of Andros, the Bahamas', site: coastSite('Andros', 260),
    blurb: 'A pirate crown and a chest of coins, left on a sandy spit with a lone twisted palm.',
    sources: [{ kind: 'tavern', townId: 'staugustine', hint: 'An old sailor in St. Augustine' }, { kind: 'villain', villainId: 'bartholomew', hint: 'Held by Bartholomew the Portuguese' }, { kind: 'tavern', townId: 'tortuga', hint: 'A card player in Tortuga' }, { kind: 'ship', shipKind: 'pirate', hint: 'Any pirate ship might carry it' }] },
  { id: 'suncoins', name: 'The Sun Coins of Trinidad', gold: 7000, area: 'East shore of Trinidad', site: coastSite('Trinidad', 135), // well away from the town's harbour
    blurb: 'Gold coins stamped with a smiling sun, buried under a hill with two lookout stones.',
    sources: [{ kind: 'villain', villainId: 'pierre', hint: 'Taken by Pierre le Grand' }, { kind: 'tavern', townId: 'barbados', hint: "Barbados' tavern" }, { kind: 'governor', townId: 'martinique', hint: 'The governor of Martinique · ask at his mansion' }, { kind: 'tavern', townId: 'curacao', hint: 'A Dutch trader in Curaçao' }] },
];
export const questById = id => TREASURE_QUESTS.find(q => q.id === id) || null;

// ---------- careers: difficulties, skills, titles, ranks ----------
export const DIFFICULTIES = [
  { id: 'apprentice',   name: 'Apprentice',   note: 'Gentle', enemySkill: 0.55, priceMult: 0.9,  startGold: 1000, scoreMult: 1.0 },
  { id: 'journeyman',   name: 'Journeyman',   note: 'Fair',   enemySkill: 0.7,  priceMult: 1.0,  startGold: 700,  scoreMult: 1.25 },
  { id: 'adventurer',   name: 'Adventurer',   note: 'Bold',   enemySkill: 0.85, priceMult: 1.1,  startGold: 500,  scoreMult: 1.5 },
  { id: 'swashbuckler', name: 'Swashbuckler', note: 'Brutal', enemySkill: 1.0,  priceMult: 1.2,  startGold: 300,  scoreMult: 2.0 },
];
export const difficultyById = id => DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
export const SKILLS = [
  { id: 'fencing',    name: 'Fencing',     note: 'Faster blade' },
  { id: 'gunnery',    name: 'Gunnery',     note: 'Quicker reload' },
  { id: 'navigation', name: 'Navigation',  note: 'Faster ships' },
  { id: 'medicine',   name: 'Medicine',    note: 'Age slower' },
  { id: 'wit',        name: 'Charm', note: 'Better deals' },
];
export const skillById = id => SKILLS.find(s => s.id === id) || SKILLS[0];
// fame with a nation needed for each title, and land granted with it
export const TITLES = [
  { name: 'Captain', fame: 5, land: 0 }, { name: 'Major', fame: 12, land: 500 }, { name: 'Colonel', fame: 20, land: 1000 },
  { name: 'Baron', fame: 32, land: 3000 }, { name: 'Count', fame: 46, land: 5000 }, { name: 'Marquis', fame: 62, land: 8000 }, { name: 'Duke', fame: 80, land: 12000 },
];
export const titleIndex = name => TITLES.findIndex(t => t.name === name);
export const RETIRE_RANKS = [
  { name: 'Beggar', min: 0 }, { name: 'Pauper', min: 10 }, { name: 'Laborer', min: 20 }, { name: 'Farmer', min: 30 }, { name: 'Merchant', min: 40 },
  { name: 'Plantation Owner', min: 52 }, { name: 'Mayor', min: 64 }, { name: 'Governor', min: 76 }, { name: "King's Advisor", min: 90 },
];
export const rankForPoints = p => RETIRE_RANKS.filter(r => p >= r.min).pop();
export const PLAYER_SHIP_NAME = 'The Sea Hare';
const PTS_LONG = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Spelled-out compass point for kids' text: "south-east". */
export const compassWord = bearing => PTS_LONG[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
