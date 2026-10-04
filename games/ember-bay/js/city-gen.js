// Blaze · Ember Bay: deterministic town generator.
// The SAME module feeds the 2D City Plan page and the three.js build, so the approved plan is what ships.
export const SIDEWALK = 2.5;
export const CELL = 8, W = 80, H = 80, SPEED = 15; // metres per cell, grid size, engine cruise m/s (54 km/h)
export const T = { EMPTY: 0, ROAD: 1, WATER: 2, BRIDGE: 3, GRASS: 4, FIELD: 5, FOREST: 6, POND: 7, LOT: 8 };

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-authored district plan (cell coords). block = street spacing; lot = [min,max] frontage; mix = building category weights.
export const DISTRICTS = [
  { id: 'res',   name: 'Residential',    short: 'RES',  x: 0,  y: 0,  w: 26, h: 44, block: 9, lot: [3, 4], mix: { house: 7, flats: 2 }, open: 0.3, openKind: 'garden',            tint: '#ebe0cc', lx: 13, ly: 22 },
  { id: 'high',  name: 'High Street',    short: 'HIGH', x: 26, y: 0,  w: 28, h: 22, block: 6, lot: [2, 3], mix: { shop: 8, flats: 1 }, open: 0.12, openKind: 'plaza',            tint: '#efd9c0', lx: 40, ly: 9.5 },
  { id: 'civic', name: 'Station Square', short: 'STN',  x: 26, y: 22, w: 28, h: 22, block: 8, lot: [3, 5], mix: { shop: 2, tall: 2, flats: 1 }, open: 0.28, openKind: 'plaza',  tint: '#e4e2dc', lx: 40, ly: 34 },
  { id: 'park',  name: 'Park & Pond',    short: 'PARK', x: 54, y: 0,  w: 26, h: 22, block: 0,                                                    tint: '#cfe2bd', lx: 67, ly: 20.2 },
  { id: 'ind',   name: 'Industrial',     short: 'IND',  x: 54, y: 22, w: 26, h: 22, block: 10, lot: [4, 6], mix: { industrial: 5 }, open: 0.3, openKind: 'yard',              tint: '#d9d7d0', lx: 67, ly: 37 },
  { id: 'rside', name: 'Riverside',      short: 'RIV',  x: 0,  y: 44, w: 80, h: 8,  block: 8, lot: [3, 4], mix: { tall: 3, flats: 2, shop: 2 }, open: 0.28, openKind: 'green', noH: true, tint: '#dbe3e6', lx: 56, ly: 56.5 },
  { id: 'farm',  name: 'Farm',           short: 'FARM', x: 0,  y: 60, w: 44, h: 20, block: 0,                                                    tint: '#ece6b4', lx: 20, ly: 75 },
  { id: 'woods', name: 'Woods',          short: 'WOOD', x: 44, y: 60, w: 36, h: 20, block: 0,                                                    tint: '#bcd6b0', lx: 70, ly: 75 },
];

// src: 'pack' = SimplePoly City as-is, 'reskin' = pack model recoloured/dressed. Nothing else is needed for buildings.
export const MODELS = {
  house_a: { name: 'Modern house A', cat: 'house', src: 'pack', tags: ['house', 'garden', 'roof'] },
  house_b: { name: 'Modern house B', cat: 'house', src: 'pack', tags: ['house', 'garden', 'roof'] },
  house_c: { name: 'Modern house C', cat: 'house', src: 'pack', tags: ['house', 'garden', 'roof'] },
  house_d: { name: 'Modern house D', cat: 'house', src: 'pack', tags: ['house', 'garden', 'roof'] },
  flats:   { name: 'Residential block', cat: 'flats', src: 'pack', tags: ['flats', 'tall', 'roof', 'power'] },
  sky_s:   { name: 'Sky building (small)', cat: 'tall', src: 'pack', tags: ['tall', 'tower', 'roof'] },
  sky_b:   { name: 'Sky building (big)', cat: 'tall', src: 'pack', tags: ['tall', 'tower', 'roof', 'power', 'helipad'] },
  bakery:  { name: 'Bakery', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'kitchen'] },
  pizza:   { name: 'Pizza', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'kitchen'] },
  books:   { name: 'Book shop', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'dark'] },
  clothing:{ name: 'Clothing', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  shoes:   { name: 'Shoe shop', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  gift:    { name: 'Gift shop', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  music:   { name: 'Music store', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  fruit:   { name: 'Fruit shop', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  fastfood:{ name: 'Fast food', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'kitchen'] },
  chicken: { name: 'Chicken shop', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'kitchen'] },
  drug:    { name: 'Drug store', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  bar:     { name: 'Bar', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin'] },
  supermarket: { name: 'Supermarket', cat: 'shop', src: 'pack', tags: ['shop', 'roof', 'bin', 'power', 'dark', 'big'] },
  factory: { name: 'Factory', cat: 'industrial', src: 'pack', tags: ['factory', 'industrial', 'tall', 'roof', 'power'] },
  autoservice: { name: 'Auto service', cat: 'industrial', src: 'pack', tags: ['garage', 'vehicle', 'roof', 'dark'] },
  gas:     { name: 'Gas station', cat: 'industrial', src: 'pack', tags: ['gas', 'vehicle', 'industrial'] },
  stadium: { name: 'Stadium', cat: 'civic', src: 'pack', tags: ['stadium', 'roof', 'dark', 'big'] },
  windmill:{ name: 'Windmill', cat: 'civic', src: 'pack', tags: ['field', 'windmill'] },
  garden:  { name: 'Garden', cat: 'open', src: 'pack', col: '#bcd4a3', tags: ['garden', 'tree'] },
  plaza:   { name: 'Plaza', cat: 'open', src: 'pack', col: '#ebe8df', tags: ['plaza', 'bin'] },
  yard:    { name: 'Yard', cat: 'open', src: 'pack', col: '#c9c7c0', tags: ['yard'] },
  green:   { name: 'Green', cat: 'open', src: 'pack', col: '#c5d9ae', tags: ['tree'] },
  station: { name: 'Fire station', cat: 'hq', src: 'reskin', note: 'Auto service in engine red + helipad roof prop', tags: ['station', 'vehicle'] },
};
const CAT_MODELS = {
  house: ['house_a', 'house_b', 'house_c', 'house_d'],
  flats: ['flats'],
  tall: ['sky_s', 'sky_s', 'sky_b'],
  shop: ['bakery', 'pizza', 'books', 'clothing', 'shoes', 'gift', 'music', 'fruit', 'fastfood', 'chicken', 'drug', 'bar'],
  industrial: ['factory', 'factory', 'autoservice', 'gas'],
};
const LANDMARKS = [
  { m: 'station', at: [45, 26], whole: true },
  { m: 'stadium', at: [30, 26], whole: true },
  { m: 'supermarket', at: [29, 15] },
  { m: 'books', at: [36, 41] },
  { m: 'sky_b', at: [28, 48] },
  { m: 'gas', at: [4, 48] },
  { m: 'factory', at: [74, 48] },
  { m: 'factory', at: [57, 25] },
  { m: 'autoservice', at: [20, 40] },
  { m: 'flats', at: [5, 31] },
];

// Minigames in rank order. tags = anchor tags an instance may sit on (earlier = preferred).
export const GAMES = [
  { id: 'hose', name: 'Hose Down', icon: 'local_fire_department', cat: 'fire', world: 'cam', tags: ['bin', 'garden', 'road'] },
  { id: 'cat', name: 'Cat Rescue', icon: 'pets', cat: 'rescue', world: 'cam', tags: ['tree', 'lamp', 'roof'] },
  { id: 'catch', name: 'Catch!', icon: 'sports_handball', cat: 'rescue', world: 'cam', tags: ['flats', 'tower'] },
  { id: 'drop', name: 'Supply Drop', icon: 'medical_services', cat: 'rescue', world: 'cam', tags: ['bridge', 'river', 'tower'] },
  { id: 'hydrant', name: 'Hydrant Hookup', icon: 'plumbing', cat: 'water', world: 'overlay', tags: ['hydrant'] },
  { id: 'torch', name: 'Torch Hunt', icon: 'flashlight_on', cat: 'rescue', world: 'scene', tags: ['dark'] },
  { id: 'pets', name: 'Pet Parade', icon: 'flutter_dash', cat: 'rescue', world: 'town', tags: ['pond', 'playground', 'field', 'garden'] },
  { id: 'line', name: 'Fire Line', icon: 'draw', cat: 'fire', world: 'scene', tags: ['field', 'woods', 'meadow'] },
  { id: 'smoke', name: 'Smoke Out', icon: 'air', cat: 'fire', world: 'scene', tags: ['flats', 'shop'] },
  { id: 'road', name: 'Clear the Road', icon: 'forest', cat: 'drive', world: 'town', tags: ['lane', 'bridge', 'park'] },
  { id: 'drone', name: 'Drone Drop', icon: 'flight', cat: 'fire', world: 'cam', tags: ['helipad', 'factory', 'stadium', 'tower'] },
  { id: 'hazard', name: 'Hazard Hunt', icon: 'search', cat: 'safety', world: 'scene', tags: ['house', 'garage', 'kitchen'] },
  { id: 'sand', name: 'Sandbag Wall', icon: 'waves', cat: 'water', world: 'cam', tags: ['river', 'harbour'] },
  { id: 'check', name: 'Truck Check', icon: 'notifications_active', cat: 'safety', world: 'scene', tags: ['vehicle'] },
  { id: 'power', name: 'Power Off', icon: 'bolt', cat: 'safety', world: 'overlay', tags: ['power', 'factory'] },
  { id: 'race', name: 'Race to Rescue', icon: 'speed', cat: 'drive', world: 'town', tags: ['road'] },
  { id: 'heat', name: 'Heat Seeker', icon: 'thermostat', cat: 'rescue', world: 'scene', tags: ['factory', 'big', 'flats'] },
  { id: 'boat', name: 'River Rescue', icon: 'directions_boat', cat: 'water', world: 'cam', tags: ['harbour', 'river', 'pond', 'bridge'] },
  { id: 'heli', name: 'Heli Bucket', icon: 'flight', cat: 'fire', world: 'cam', tags: ['pond', 'river', 'field', 'harbour', 'bridge'] },
  { id: 'dispatch', name: 'Dispatch', icon: 'map', cat: 'safety', world: 'overlay', tags: ['road'] },
  { id: 'thaw', name: 'Hydrant Thaw', icon: 'ac_unit', cat: 'water', world: 'overlay', tags: ['hydrant'] },
  { id: 'foam', name: 'Foam Mixer', icon: 'science', cat: 'safety', world: 'overlay', tags: ['factory', 'gas', 'garage', 'vehicle'] },
];

// Planned SimplePoly dressing per district (buildings are counted live from the generator).
export const DISTRICT_KIT = {
  res:   { nature: ['Tree A', 'Tree B', 'Bush A', 'Bush B', 'Bush C', 'Grass fence', 'Pot bush A'], props: ['Fence', 'Bench A', 'Dustbin', 'Hydrant', 'Street light'], roof: ['Solar panel'], vehicles: ['Car', 'SUV', 'Pick up truck'] },
  high:  { nature: ['Tree B', 'Pot bush A', 'Pot bush B'], props: ['Coffee shop chair', 'Bench B', 'Dustbin', 'Billboard A', 'Bus stop', 'Hydrant', 'Street light', 'Signal A', 'Signal B', 'Signs'], roof: ['Air props', 'Antenna'], vehicles: ['Taxi', 'Bus', 'Car'] },
  civic: { nature: ['Tree C', 'Pot bush B'], props: ['Bench A', 'Billboard B', 'Billboard C', 'Bus stop', 'Street light', 'Signal A', 'Signs', 'Hydrant', 'Traffic barrier fence'], roof: ['Helipad (fire station)', 'Antenna'], vehicles: ['Police car', 'Ambulance', 'Bus', 'Taxi'] },
  park:  { nature: ['Tree A', 'Tree B', 'Tree C', 'Bush A', 'Bush B', 'Bush C', 'Rock A', 'Rock B', 'Grass bar'], props: ['Bench A', 'Bench B', 'Dustbin', 'Fence', 'Street light'], roof: [], vehicles: [] },
  ind:   { nature: ['Rock A', 'Grass bar'], props: ['Fence', 'Traffic barrier fence', 'Traffic cone', 'Signs', 'Hydrant', 'Street light', 'Billboard C'], roof: ['Air props', 'Antenna', 'Solar panel'], vehicles: ['Container', 'Truck', 'Pick up truck'] },
  rside: { nature: ['Tree B', 'Pot bush A'], props: ['Bench B', 'Street light', 'Bus stop', 'Fence (river edge)', 'Hydrant', 'Billboard A'], roof: ['Helipad (big sky)', 'Antenna', 'Air props'], vehicles: ['Taxi', 'SUV', 'Car', 'Container (harbour)'] },
  farm:  { nature: ['Tree A', 'Bush A', 'Bush B', 'Rock A', 'Rock B', 'Grass fence', 'Grass bar'], props: ['Windmill', 'Fence'], roof: [], vehicles: ['Pick up truck', 'Truck'] },
  woods: { nature: ['Tree A', 'Tree B', 'Tree C', 'Bush A', 'Bush B', 'Bush C', 'Rock A', 'Rock B'], props: ['Signs', 'Fence'], roof: [], vehicles: ['Pick up truck'] },
};
export const SHARED_KIT = [
  { label: 'Roads', icon: 'road', items: ['Road tiles (straight, corner, T, cross)', 'Concrete parts', 'Bridge deck (road tile + concrete)'] },
  { label: 'Driving vehicles', icon: 'directions_car', items: ['Fire engine = Truck kitbash + ladder (separated wheels)', 'Traffic: Car, Taxi, SUV, Bus (separated wheels)', 'Parked: static-wheel versions'] },
  { label: 'Event dressing', icon: 'traffic', items: ['Traffic cone', 'Traffic barrier fence', 'Hydrant (Hydrant Hookup / Thaw)', 'Dustbin (Hose Down)'] },
];

export function generate(seed) {
  const rnd = makeRng(seed);
  const N = W * H, grid = new Uint8Array(N), art = new Uint8Array(N), dist = new Int8Array(N).fill(-1);
  const idx = (x, y) => y * W + x, inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const dIndex = {}; DISTRICTS.forEach((d, i) => (dIndex[d.id] = i));

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let di = DISTRICTS.findIndex(d => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h);
    if (di < 0) di = y < 57 ? dIndex.rside : x < 44 ? dIndex.farm : dIndex.woods;
    dist[idx(x, y)] = di;
  }
  // River + pond
  const ph = rnd() * 6.28;
  for (let x = 0; x < W; x++) {
    const off = Math.round(Math.sin(x * 0.13 + ph) * 1.3);
    for (let y = 54 + off; y <= 59 + off; y++) grid[idx(x, y)] = T.WATER;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (((x - 67) / 5.5) ** 2 + ((y - 11) / 3.5) ** 2 <= 1) grid[idx(x, y)] = T.POND;
  }
  // Roads
  const road = (x, y, a) => {
    if (!inb(x, y)) return;
    const i = idx(x, y), g = grid[i];
    grid[i] = (g === T.WATER || g === T.BRIDGE) ? T.BRIDGE : T.ROAD;
    if (a) art[i] = 1;
  };
  const lineH = (y, x0, x1, a) => { for (let x = x0; x <= x1; x++) road(x, y, a); };
  const lineV = (x, y0, y1, a) => { for (let y = y0; y <= y1; y++) road(x, y, a); };
  lineH(1, 1, 78, 1); lineH(78, 1, 78, 1); lineV(1, 1, 78, 1); lineV(78, 1, 78, 1);
  lineV(40, 1, 78, 1); lineH(22, 26, 78, 1); lineH(44, 1, 78, 1);
  lineV(26, 1, 44, 0); lineV(54, 1, 44, 0); lineV(13, 44, 78, 0); lineH(52, 1, 78, 0);
  lineH(4, 58, 76, 0); lineH(18, 58, 76, 0); lineV(58, 4, 18, 0); lineV(76, 4, 18, 0); lineH(11, 54, 58, 0); lineH(11, 76, 78, 0);
  const lph = rnd() * 6.28; let py = null; const laneY = [];
  for (let x = 1; x <= 78; x++) {
    const y = 69 + Math.round(Math.sin(x * 0.11 + lph) * 3);
    road(x, y, 0); laneY[x] = y;
    if (py !== null && py !== y) { const s = Math.sign(y - py); for (let yy = py; yy !== y; yy += s) road(x, yy, 0); }
    py = y;
  }
  lineV(62, 62, 78, 0); lineV(26, 62, 78, 0);
  const Vs = [1, 13, 26, 40, 54, 62, 78], Hs = [1, 22, 44, 52, 78];
  const near = (arr, c, r) => arr.some(v => Math.abs(v - c) < r);
  for (const d of DISTRICTS) {
    if (!d.block) continue;
    const y0 = Math.max(d.y, 1), y1 = Math.min(d.y + d.h, 78), x0 = Math.max(d.x, 1), x1 = Math.min(d.x + d.w, 78);
    for (let c = d.x + d.block; c < d.x + d.w - 2; c += d.block) if (!near(Vs, c, 3)) lineV(c, y0, y1, 0);
    if (!d.noH) for (let r = d.y + d.block; r < d.y + d.h - 2; r += d.block) if (!near(Hs, r, 3)) lineH(r, x0, x1, 0);
  }
  // Ground fill for open districts
  for (let i = 0; i < N; i++) {
    if (grid[i] !== T.EMPTY) continue;
    const id = DISTRICTS[dist[i]].id;
    if (id === 'park') grid[i] = T.GRASS; else if (id === 'farm') grid[i] = T.FIELD; else if (id === 'woods') grid[i] = T.FOREST;
  }

  const lots = [], trees = [];
  const isRoad = (x, y) => inb(x, y) && (grid[idx(x, y)] === T.ROAD);
  const frontOf = r => {
    let best = null, bd = 1e9; const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const test = (x, y) => { if (!isRoad(x, y)) return; const dd = (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2; if (dd < bd) { bd = dd; best = { x, y }; } };
    for (let x = r.x; x < r.x + r.w; x++) { test(x, r.y - 1); test(x, r.y + r.h); }
    for (let y = r.y; y < r.y + r.h; y++) { test(r.x - 1, y); test(r.x + r.w, y); }
    return best;
  };
  const addLot = (r, m, di) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[idx(x, y)] = T.LOT;
    lots.push({ ...r, m, d: di, front: frontOf(r) });
  };
  const pickModel = (d, area) => {
    const ks = Object.keys(d.mix), tot = ks.reduce((s, k) => s + d.mix[k], 0);
    let r = rnd() * tot, cat = ks[0];
    for (const k of ks) { r -= d.mix[k]; if (r <= 0) { cat = k; break; } }
    if (cat === 'shop' && area >= 12 && rnd() < 0.25) return 'supermarket';
    const list = CAT_MODELS[cat]; return list[Math.floor(rnd() * list.length)];
  };
  const floodBlocks = () => {
    const seen = new Uint8Array(N), out = [];
    for (let i0 = 0; i0 < N; i0++) {
      if (grid[i0] !== T.EMPTY || seen[i0]) continue;
      const di = dist[i0], q = [i0]; seen[i0] = 1; const cells = [];
      while (q.length) {
        const i = q.pop(); cells.push(i); const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const j = idx(nx, ny);
          if (!seen[j] && grid[j] === T.EMPTY && dist[j] === di) { seen[j] = 1; q.push(j); }
        }
      }
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const i of cells) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      out.push({ di, cells, b: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
    }
    return out;
  };
  const inRect = (p, r) => p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;
  // Long blocks get a proper side street through the middle (same 8 m as every other road).
  for (const { di, cells, b } of floodBlocks()) {
    const d = DISTRICTS[di];
    if (!d.mix || cells.length < b.w * b.h || Math.max(b.w, b.h) < 12) continue;
    if (LANDMARKS.some(l => l.whole && inRect(l.at, b))) continue;
    if (b.w >= b.h) { let cx = b.x + Math.floor(b.w / 2); if (LANDMARKS.some(l => l.at[0] === cx && inRect(l.at, b))) cx++; lineV(cx, b.y - 1, b.y + b.h, 0); }
    else { let cy = b.y + Math.floor(b.h / 2); if (LANDMARKS.some(l => l.at[1] === cy && inRect(l.at, b))) cy++; lineH(cy, b.x - 1, b.x + b.w, 0); }
  }
  for (const { di, cells, b } of floodBlocks()) {
    const d = DISTRICTS[di];
    if (Math.min(b.w, b.h) < 3 || cells.length < b.w * b.h || !d.mix) {
      for (const i of cells) { grid[i] = T.GRASS; if (rnd() < 0.35) trees.push({ x: i % W + .5, y: ((i / W) | 0) + .5 }); }
      continue;
    }
    const lm = LANDMARKS.filter(l => inRect(l.at, b));
    const whole = lm.find(l => l.whole);
    if (whole) { addLot(b, whole.m, di); continue; }
    const [a, mx] = d.lot, horiz = b.w >= b.h, Lg = horiz ? b.w : b.h, S = horiz ? b.h : b.w;
    const depths = S >= 2 * a && S >= 5 ? [Math.floor(S / 2), S - Math.floor(S / 2)] : [S];
    let off = 0;
    for (const dep of depths) {
      let pos = 0;
      while (pos < Lg) {
        let size = a + Math.floor(rnd() * (mx - a + 1));
        if (Lg - pos - size < a) size = Lg - pos;
        const r = horiz ? { x: b.x + pos, y: b.y + off, w: size, h: dep } : { x: b.x + off, y: b.y + pos, w: dep, h: size };
        const hit = lm.find(l => inRect(l.at, r));
        const open = !hit && rnd() < (d.open || 0);
        addLot(r, hit ? hit.m : open ? d.openKind : pickModel(d, r.w * r.h), di);
        pos += size;
      }
      off += dep;
    }
  }
  // Rural lots along the lane
  const rural = (m, x, di) => {
    const ly = laneY[x];
    for (const r of [{ x, y: ly - 4, w: 4, h: 3 }, { x, y: ly + 1, w: 4, h: 3 }]) {
      let ok = true;
      for (let yy = r.y; yy < r.y + r.h && ok; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) { const g = grid[idx(xx, yy)]; if (g !== T.FIELD && g !== T.FOREST) { ok = false; break; } }
      if (ok) { addLot(r, m, di); return; }
    }
  };
  rural('house_a', 5, dIndex.farm); rural('windmill', 17, dIndex.farm); rural('windmill', 32, dIndex.farm); rural('house_c', 70, dIndex.woods);
  for (let i = 0; i < N; i++) {
    const g = grid[i], x = i % W, y = (i / W) | 0;
    if (g === T.GRASS && DISTRICTS[dist[i]].id === 'park' && rnd() < 0.16) trees.push({ x: x + .3 + rnd() * .4, y: y + .3 + rnd() * .4 });
    if (g === T.FOREST && rnd() < 0.55) trees.push({ x: x + .2 + rnd() * .6, y: y + .2 + rnd() * .6 });
  }

  // Sidewalks: a ${SIDEWALK} m strip inside every plot/verge cell that touches a road (built districts + park).
  const walkD = new Set(['res', 'high', 'civic', 'ind', 'rside', 'park']);
  const isDrive = (x, y) => inb(x, y) && (grid[idx(x, y)] === T.ROAD || grid[idx(x, y)] === T.BRIDGE);
  const sidewalks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = grid[idx(x, y)];
    if (g === T.ROAD || g === T.BRIDGE || g === T.WATER || g === T.POND || !walkD.has(DISTRICTS[dist[idx(x, y)]].id)) continue;
    const X = x * CELL, Z = y * CELL, S = SIDEWALK;
    const n = isDrive(x, y - 1), so = isDrive(x, y + 1), w = isDrive(x - 1, y), e = isDrive(x + 1, y);
    if (n) sidewalks.push({ x: X, z: Z, w: CELL, d: S });
    if (so) sidewalks.push({ x: X, z: Z + CELL - S, w: CELL, d: S });
    if (w) sidewalks.push({ x: X, z: Z, w: S, d: CELL });
    if (e) sidewalks.push({ x: X + CELL - S, z: Z, w: S, d: CELL });
    if (!n && !w && isDrive(x - 1, y - 1)) sidewalks.push({ x: X, z: Z, w: S, d: S });
    if (!n && !e && isDrive(x + 1, y - 1)) sidewalks.push({ x: X + CELL - S, z: Z, w: S, d: S });
    if (!so && !w && isDrive(x - 1, y + 1)) sidewalks.push({ x: X, z: Z + CELL - S, w: S, d: S });
    if (!so && !e && isDrive(x + 1, y + 1)) sidewalks.push({ x: X + CELL - S, z: Z + CELL - S, w: S, d: S });
  }
  // Building footprints: pull back from the pavement on road sides, leave gaps between neighbours.
  const SET = { house: [4, 3], flats: [3, 3], tall: [3, 3], shop: [0.5, 0.6], industrial: [4, 3], civic: [3, 3], hq: [2, 2] };
  const MAXFP = { house: 13, flats: 26, tall: 22 };
  const sideRoad = (l, side) => {
    for (let k = 0; k < (side === 'N' || side === 'S' ? l.w : l.h); k++) {
      const x = side === 'W' ? l.x - 1 : side === 'E' ? l.x + l.w : l.x + k;
      const y = side === 'N' ? l.y - 1 : side === 'S' ? l.y + l.h : l.y + k;
      if (isDrive(x, y)) return true;
    }
    return false;
  };
  for (const l of lots) {
    const m = MODELS[l.m];
    if (m.cat === 'open') { if (l.m === 'garden' || l.m === 'green') { const nT = 2 + Math.floor(rnd() * 3); for (let k = 0; k < nT; k++) trees.push({ x: l.x + 0.25 + rnd() * (l.w - 0.5), y: l.y + 0.25 + rnd() * (l.h - 0.5) }); } continue; }
    const [fr, sd] = SET[m.cat] || [3, 2];
    let x0 = l.x * CELL, x1 = (l.x + l.w) * CELL, z0 = l.y * CELL, z1 = (l.y + l.h) * CELL;
    x0 += sideRoad(l, 'W') ? SIDEWALK + fr : sd; x1 -= sideRoad(l, 'E') ? SIDEWALK + fr : sd;
    z0 += sideRoad(l, 'N') ? SIDEWALK + fr : sd; z1 -= sideRoad(l, 'S') ? SIDEWALK + fr : sd;
    const mx = l.m === 'windmill' ? 5 : MAXFP[m.cat];
    if (mx) {
      if (x1 - x0 > mx) { const c = (x0 + x1) / 2; x0 = c - mx / 2; x1 = c + mx / 2; }
      if (z1 - z0 > mx) { const c = (z0 + z1) / 2; z0 = c - mx / 2; z1 = c + mx / 2; }
    }
    if (x1 - x0 < 4) { const c = (x0 + x1) / 2; x0 = c - 2; x1 = c + 2; }
    if (z1 - z0 < 4) { const c = (z0 + z1) / 2; z0 = c - 2; z1 = c + 2; }
    l.fp = { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
  }

  // Anchors: every candidate spot an event could sit on. Position is always a road cell the engine can drive into.
  const anchors = [];
  const A = (x, y, tags, label, di) => anchors.push({ x, y, tags, label, d: di ?? dist[idx(x, y)] });
  for (const l of lots) if (l.front) A(l.front.x, l.front.y, MODELS[l.m].tags, MODELS[l.m].name, l.d);
  const built = new Set(['res', 'high', 'civic', 'ind', 'rside']);
  const waterNear = (x, y, r, kind) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (!inb(x + dx, y + dy)) continue; const g = grid[idx(x + dx, y + dy)]; if (kind ? g === kind : (g === T.WATER || g === T.BRIDGE)) return true; } return false; };
  const typeNear = (x, y, t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && grid[idx(x + dx, y + dy)] === t);
  let playground = null, pd = 1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), g = grid[i];
    if (g === T.BRIDGE) {
      if (isRoad(x, y - 1)) A(x, y - 1, ['bridge', 'river'], 'Bridge (north end)');
      if (isRoad(x, y + 1)) A(x, y + 1, ['bridge', 'river'], 'Bridge (south end)');
      continue;
    }
    if (g !== T.ROAD) continue;
    const dId = DISTRICTS[dist[i]].id;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => inb(x + dx, y + dy) && (grid[idx(x + dx, y + dy)] === T.ROAD || grid[idx(x + dx, y + dy)] === T.BRIDGE)).length;
    if (built.has(dId) && n >= 3 && rnd() < 0.6) A(x, y, ['hydrant'], 'Hydrant');
    if (built.has(dId) && (x * 7 + y * 3) % 11 === 0) A(x, y, ['lamp'], 'Lamp post');
    if ((x + y) % 5 === 0) A(x, y, ['road'], 'Street');
    if (!waterNear(x, y, 0) && waterNear(x, y, 2, T.WATER)) A(x, y, x >= 66 && dId === 'rside' ? ['harbour', 'river'] : ['river'], x >= 66 && dId === 'rside' ? 'Harbour' : 'River bank');
    if (dId === 'park') {
      if (waterNear(x, y, 2, T.POND)) A(x, y, ['pond', 'park'], 'Pond bank');
      else if ((x + y) % 3 === 0) A(x, y, ['meadow', 'park', 'tree'], 'Park meadow');
      const dd = (x - 76) ** 2 + (y - 4) ** 2; if (dd < pd) { pd = dd; playground = { x, y }; }
    }
    if (dId === 'farm' && typeNear(x, y, T.FIELD) && (x + y) % 2 === 0) A(x, y, ['field', 'lane'], 'Farm lane');
    if (dId === 'woods' && typeNear(x, y, T.FOREST) && (x + y) % 2 === 0) A(x, y, ['woods', 'lane', 'tree'], 'Woods lane');
    if (dId === 'res' && (x * 3 + y * 5) % 13 === 0) A(x, y, ['tree'], 'Street tree');
  }
  if (playground) A(playground.x, playground.y, ['playground', 'park'], 'Playground');

  // Road distance from the station
  const bfs = (sx, sy) => {
    const D = new Int32Array(N).fill(-1), q = [idx(sx, sy)]; D[q[0]] = 0; let h = 0;
    while (h < q.length) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const j = idx(nx, ny);
        if (D[j] < 0 && (grid[j] === T.ROAD || grid[j] === T.BRIDGE)) { D[j] = D[i] + 1; q.push(j); }
      }
    }
    return D;
  };
  const stationLot = lots.find(l => l.m === 'station');
  const spawn = stationLot.front;
  const D = bfs(spawn.x, spawn.y);
  let maxD = 0; for (let i = 0; i < N; i++) if (D[i] > maxD) maxD = D[i];
  const cornerD = bfs(1, 1)[idx(78, 78)];

  // Event solver: 3 instances per game, different districts, spaced, near → mid → far from the station.
  const targets = [0.18, 0.5, 0.82];
  const events = [], taken = new Set(), warnings = [];
  const cand = g => anchors.filter(a => D[idx(a.x, a.y)] >= 0 && a.tags.some(t => g.tags.includes(t)));
  const order = GAMES.map((g, rank) => ({ g, rank, c: cand(g) })).sort((a, b) => a.c.length - b.c.length);
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const passes = [{ sp: 6, distinct: true }, { sp: 4, distinct: true }, { sp: 3, distinct: false }, { sp: 1, distinct: false }];
  for (const { g, rank, c } of order) {
    const used = new Set();
    for (let k = 0; k < 3; k++) {
      let pick = null, pass = 0;
      for (; pass < passes.length && !pick; pass++) {
        const p = passes[pass];
        let best = 1e9;
        for (const a of c) {
          const key = a.x + ',' + a.y;
          if (taken.has(key) || (p.distinct && used.has(a.d))) continue;
          if (!events.every(e => cheb(e, a) >= p.sp)) continue;
          const ti = Math.min(...a.tags.map(t => g.tags.indexOf(t)).filter(v => v >= 0));
          const s = Math.abs(D[idx(a.x, a.y)] / maxD - targets[k]) + ti * 0.06 + rnd() * 0.05;
          if (s < best) { best = s; pick = a; }
        }
      }
      if (!pick) { warnings.push(`${g.name} #${k + 1}: no free spot`); continue; }
      if (pass > 2) warnings.push(`${g.name} #${k + 1}: relaxed rules (pass ${pass})`);
      taken.add(pick.x + ',' + pick.y); used.add(pick.d);
      events.push({ gid: g.id, rank, k, tier: k + 1, x: pick.x, y: pick.y, d: pick.d, label: pick.label, roadD: D[idx(pick.x, pick.y)] });
    }
  }
  events.sort((a, b) => a.tier - b.tier || a.rank - b.rank);
  events.forEach((e, i) => (e.call = i + 1));

  let roadCells = 0; for (let i = 0; i < N; i++) if (grid[i] === T.ROAD || grid[i] === T.BRIDGE) roadCells++;
  const customCounts = {}, packUsed = new Set();
  let openLots = 0;
  for (const l of lots) { const m = MODELS[l.m]; if (m.cat === 'open') { openLots++; continue; } if (m.src !== 'pack') customCounts[m.name] = (customCounts[m.name] || 0) + 1; else packUsed.add(l.m); }
  return {
    seed, grid, art, dist, lots, trees, sidewalks, events, spawn, warnings,
    stats: {
      buildings: lots.length - openLots, openLots, packModels: packUsed.size, custom: customCounts,
      roadKm: (roadCells * CELL / 1000).toFixed(1),
      cornerSec: Math.round(cornerD * CELL / SPEED),
      avgSec: Math.round(events.reduce((s, e) => s + e.roadD, 0) / Math.max(events.length, 1) * CELL / SPEED),
      anchors: anchors.length,
    },
  };
}
