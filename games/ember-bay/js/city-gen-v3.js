// Blaze · Ember Bay v3: template + procedural town on a mainland and an island.
// Bands of blocks with their own column widths (so roads jog), a river with two 100 m bridges (+ 24 m ramps each end),
// the sea on the west and around the island, mountains north + east of the mainland.
import { GAMES } from './city-gen.js';
export { GAMES };

export const ROAD = 12, SPEED = 15, RIVER = 160, COAST = 34;
const HR = ROAD / 2, R90 = Math.PI / 2;

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const BANDS = [
  { cols: [40, 40, 40, 40, 40, 52, 40, 52, 40, 40, 64], rows: [40, 40, 48, 40], x0: 0 },
  { cols: [52, 40, 40, 64, 40, 40, 52, 52, 40, 'fill'], rows: [40, 40, 52, 40], x0: 0 },
  { cols: [40, 52, 40, 40, 64, 40, 52, 40], rows: [40, 40, 40], x0: 70, gap: RIVER },
];
export const DISTRICTS = [
  { id: 'hill', name: 'Hillside', short: 'HILL', band: 0, c0: 0, c1: 3, r0: 0, r1: 3, tint: '#e9dfc9' },
  { id: 'north', name: 'Northgate', short: 'NGT', band: 0, c0: 4, c1: 7, r0: 0, r1: 3, tint: '#efe4cc' },
  { id: 'farm', name: 'Farm & Woods', short: 'FARM', band: 0, c0: 8, c1: 10, r0: 0, r1: 3, tint: '#e6e2b4' },
  { id: 'park', name: 'Westcliff Park', short: 'PARK', band: 1, c0: 0, c1: 2, r0: 0, r1: 3, tint: '#d6e6c4' },
  { id: 'stn', name: 'Station Square', short: 'STN', band: 1, c0: 3, c1: 4, r0: 0, r1: 3, tint: '#e4e2dc' },
  { id: 'down', name: 'Downtown', short: 'DOWN', band: 1, c0: 5, c1: 7, r0: 0, r1: 3, tint: '#dcd9d3' },
  { id: 'ind', name: 'Industrial', short: 'IND', band: 1, c0: 8, c1: 9, r0: 0, r1: 3, tint: '#d9d7d0' },
  { id: 'isle', name: 'Island Village', short: 'ISLE', band: 2, c0: 0, c1: 3, r0: 0, r1: 2, tint: '#e8e1d2' },
  { id: 'stad', name: 'Stadium', short: 'STAD', band: 2, c0: 4, c1: 5, r0: 0, r1: 2, tint: '#e2e0d8' },
  { id: 'harb', name: 'Harbour', short: 'HARB', band: 2, c0: 6, c1: 7, r0: 0, r1: 2, tint: '#dde4e6' },
];
// [band, c0, r0, c1, r1, zone]
const PLAN = [
  [0, 0, 0, 0, 2, 'res'], [0, 1, 0, 1, 2, 'res'], [0, 2, 0, 2, 2, 'res'], [0, 3, 0, 3, 2, 'res'],
  [0, 0, 3, 1, 3, 'shops'], [0, 2, 3, 2, 3, 'park'], [0, 3, 3, 3, 3, 'shops'],
  [0, 4, 0, 6, 0, 'res'], [0, 4, 1, 6, 1, 'res'], [0, 4, 2, 5, 2, 'shops'], [0, 6, 2, 6, 2, 'park'], [0, 7, 0, 7, 2, 'park'],
  [0, 4, 3, 5, 3, 'shops'], [0, 6, 3, 7, 3, 'shops'],
  [0, 8, 0, 9, 2, 'farm'], [0, 10, 0, 10, 3, 'woods'], [0, 8, 3, 9, 3, 'field'],
  [1, 0, 0, 0, 2, 'res'], [1, 0, 3, 0, 3, 'shops'], [1, 1, 0, 2, 2, 'bigpark'], [1, 1, 3, 2, 3, 'shops'],
  [1, 3, 0, 3, 0, 'hq'], [1, 4, 0, 4, 0, 'shops'], [1, 3, 1, 4, 2, 'civic'], [1, 3, 3, 4, 3, 'shops'],
  [1, 5, 0, 6, 1, 'civic'], [1, 7, 0, 7, 1, 'shops'], [1, 5, 2, 7, 3, 'down'],
  [1, 8, 0, 9, 1, 'ind'], [1, 8, 2, 9, 2, 'ind'], [1, 8, 3, 9, 3, 'gas'],
  [2, 0, 0, 2, 0, 'res'], [2, 0, 1, 2, 1, 'res'], [2, 0, 2, 0, 2, 'shops'], [2, 1, 2, 2, 2, 'park'],
  [2, 3, 0, 3, 1, 'shops'], [2, 3, 2, 3, 2, 'park'], [2, 4, 0, 5, 2, 'stadium'], [2, 6, 0, 7, 1, 'civic'], [2, 6, 2, 7, 2, 'shops'],
];
const BRIDGE_COLS = [1, 6]; // island vertical roads that carry on over the river
const ZONE_T = { res: /^residential_/, shops: /^shops_/, civic: /^civic_/, down: /^downtown_/, ind: /^industrial_/, farm: /^farm_/, gas: /^gas_/, stadium: /^stadium_/ };
const UNIQUE = /^(industrial_|farm_|stadium_|downtown_|civic_|gas_)/;
export const ZONE_LABEL = { res: 'Residential', shops: 'Shops', civic: 'Civic', down: 'Downtown', ind: 'Industrial', farm: 'Farm', gas: 'Gas station', stadium: 'Stadium', park: 'Park', bigpark: 'Park & pond', woods: 'Woods', field: 'Fields', hq: 'Fire station' };
const TILE = { straight: 'road_a_02_v7', cross: 'road_a_13_v1', tee: 'road_a_12_v1', corner: 'road_a_06_v2', end: 'road_a_06_v3' };

export function catOf(base, h = 9) {
  if (/^fb_(fire_station|school)/.test(base) || /^sp_stadium/.test(base)) return 'civic';
  if (/^(fb_house|sp_house)/.test(base)) return 'house';
  if (/^(fb_(blue|red|corner)_building|sp_residential|sp_sky)/.test(base)) return 'tall';
  if (/^sp_(factory|gas_station|auto_service)/.test(base)) return 'industrial';
  if (/^sp_(bakery|bar|books|chicken|clothing|coffee_shop$|drug|fast|fruits|gift|music|pizza|restaurant|shoes|super)/.test(base)) return 'shop';
  if (/^(rg_|sp_(ambulance|police|taxi|bus$|suv|car$|pick|truck|container))/.test(base)) return 'vehicle';
  if (/^sp_(big_tree|fir_tree|cube_tree|bush)/.test(base)) return 'tree';
  if (/^sp_/.test(base)) return 'prop';
  if (/^house_/.test(base)) return h > 1.5 ? 'house' : 'green';
  if (/^(highliving|skyscraper)/.test(base)) return 'tall';
  if (/^(caffeeshop|cheesemarket|fruitshop|milk|sport|vegetables|flowers|plants|ice-cream|armchairs|gamingchair|boutique|antiques|watches|musicshop|supermarket)/.test(base)) return 'shop';
  if (/^(business|bank|hotel|government|hospital|school|police|postoffice|restaurant|travel|nationalstadium)/.test(base)) return 'civic';
  if (/^(factory|gasstation|farm)/.test(base)) return 'industrial';
  if (/^tree/.test(base)) return 'tree';
  if (/^(car_|jeep_|truck|tractor)/.test(base)) return 'vehicle';
  if (/^(park_|green_a|basketball)/.test(base)) return 'green';
  if (/^(parking|land$)/.test(base)) return 'paved';
  if (/^water/.test(base)) return 'water';
  if (/^road_/.test(base)) return 'road';
  if (/^bridge/.test(base)) return 'bridge';
  if (/^landscape/.test(base)) return 'mountain';
  if (/^sand/.test(base)) return 'sand';
  return 'prop';
}
const TAGS = [
  [/^fb_fire_station/, ['station', 'vehicle', 'garage', 'kitchen']], [/^fb_school/, ['big', 'dark', 'roof']], [/^(fb_house|sp_house)/, ['house', 'garden', 'roof']],
  [/^(fb_(blue|red|corner)|sp_residential|sp_sky)/, ['flats', 'tall', 'roof', 'power']], [/^sp_(bakery|pizza|fast|chicken|restaurant|coffee_shop$|bar)/, ['shop', 'bin', 'kitchen']],
  [/^sp_(books|clothing|drug|fruits|gift|music|shoes|super)/, ['shop', 'dark', 'bin']],
  [/^house_/, ['house', 'garden', 'roof']], [/^highliving/, ['flats', 'tall', 'roof', 'power']], [/^skyscraper/, ['tower', 'tall', 'helipad', 'roof']],
  [/^(hospital|school)/, ['big', 'dark', 'roof']], [/^policestation/, ['vehicle']], [/^(business|bank|government|postoffice|travel)/, ['shop', 'roof']],
  [/^(hotel|restaurant)/, ['shop', 'roof', 'kitchen']], [/^(caffeeshop|cheesemarket|fruitshop|milk|sport|vegetables|flowers|plants|ice-cream|armchairs|gamingchair)/, ['shop', 'bin', 'kitchen']],
  [/^(boutique|antiques|watches|musicshop)/, ['shop', 'dark']], [/^supermarket/, ['shop', 'big', 'dark', 'power']], [/^factoryenterence/, ['vehicle', 'industrial', 'garage']],
  [/^factory/, ['factory', 'industrial', 'power']], [/^gasstation/, ['gas', 'vehicle', 'garage']], [/^nationalstadium/, ['stadium', 'big', 'dark', 'helipad']],
  [/^farm/, ['field', 'barn']], [/^basketball/, ['playground', 'park']], [/^park_/, ['park', 'meadow', 'tree']],
];
const tagsOf = base => { for (const [re, t] of TAGS) if (re.test(base)) return t; return null; };
let NAMES = {};
const NICE = b => NAMES[b] || b.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/\b(a|b|c|d)$/, '').replace('highlivingbuilding', 'tower block').replace('nationalstadium', 'stadium').replace('factoryenterence', 'factory gate').replace('factorybuilding', 'factory').replace('factorystructure', 'silo').replace('caffeeshop', 'coffee kiosk').replace('farmstractures', 'farm silo').replace('farmbuilding', 'farm building').replace('policestation', 'police station').replace('postoffice', 'post office').replace('businesscenter', 'business centre').trim();

export function generate(seed, data) {
  const rnd = makeRng(seed);
  const { ids, index, templates } = data;
  NAMES = {}; for (const e of index) if (e.name) NAMES[e.id] = e.name.replace(/ \(SimplePoly\)/, '');
  const PI = {}; ids.forEach((id, i) => (PI[id] = i));
  const has = id => PI[id] != null;
  const inst = [], tints = [], feats = [], trees = [], anchors = [], warnings = [], animals = [];
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const firstOf = re => index.find(e => re.test(e.id))?.id;
  const TREES = [['tree_v2', -0.54], ['tree_v5', -0.43], ['tree_v6', -0.92], ['tree1_v1', -0.54], ['tree_v4', -1.79], ['tree_v7', -1.8], ['tree1_v4', -1.65], ['tree_v8', -1.5], ['tree1_v2', -1.79]].filter(t => has(t[0]));
  const CARS = index.filter(e => /^(car_|jeep_)/.test(e.base) && e.d > 4 && e.d < 5.6 && e.w < 2.6).map(e => e.id);
  const TRUCKS = index.filter(e => e.base === 'truck').sort((a, b) => a.d - b.d).map(e => e.id);
  const BENCH = firstOf(/^bench_b/), FENCE = firstOf(/^fence_g/), GATE = firstOf(/^gate_a/), PARKF = firstOf(/^park_f/), PARKE = firstOf(/^park_e/), PARKC = firstOf(/^park_c/), COURT = firstOf(/^basketballcourt_a/);
  const YARD_PROPS = index.filter(e => /^(barrel_|cratebox|props_40|props_41|props_50|timber|logs)/.test(e.base)).map(e => e.id);
  const LAWN = 'green_a_v1', BAYSQ = firstOf(/^parking_area_a/);
  const poolOf = re => { const out = []; for (const e of index) if (re.test(e.base) && e.h > 1.5 && !out.some(o => o.base === e.base)) out.push(e); return out; };
  const IND_POOL = poolOf(/^(factorybuilding|factorystructure)/);
  const CIVIC_POOL = poolOf(/^(hospital|school|policestation|postoffice|bank|hotel|restaurant|businesscenter|government|travel)/);
  let district = -1;

  const put = (id, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, tint) => {
    const pi = typeof id === 'number' ? id : PI[id];
    if (pi == null) { warnings.push('missing model ' + id); return -1; }
    inst.push([pi, x, y, z, yaw, sx, sy, sz]);
    if (tint) tints.push([inst.length - 1, tint]);
    const e = index[pi], c = catOf(e.base, e.h), q = Math.abs(Math.round(yaw / R90)) % 2 === 1;
    const w = q ? e.d * sz : e.w * sx, d = q ? e.w * sx : e.d * sz;
    if (c === 'tree') trees.push([x, z, Math.max(w, d) / 2, district]);
    else if (!['road', 'mountain', 'sand', 'water', 'bridge'].includes(c) || /^water_b/.test(e.base)) feats.push({ x, z, w, d, cat: c, base: e.base, h: e.h * sy, di: district, tint: !!tint });
    return inst.length - 1;
  };

  // ---------- bands ----------
  const bands = [];
  BANDS.forEach((B, bi) => {
    const xs = [B.x0 + HR];
    const cols = B.cols.slice();
    for (let i = 0; i < cols.length; i++) {
      if (cols[i] === 'fill') cols[i] = bands[0].xs[bands[0].xs.length - 1] - xs[i] - ROAD;
      xs.push(xs[i] + cols[i] + ROAD);
    }
    const z0 = bi === 0 ? HR : bands[bi - 1].zs[bands[bi - 1].zs.length - 1] + (B.gap || 0);
    const zs = [z0]; B.rows.forEach((r, j) => zs.push(zs[j] + r + ROAD));
    bands.push({ xs, zs, nc: cols.length, nr: B.rows.length, bid: [] });
  });
  const TW = bands[0].xs[bands[0].nc] + HR, mainBottom = bands[1].zs[bands[1].nr], isle = bands[2];
  const TD = isle.zs[isle.nr] + HR;
  const dRects = DISTRICTS.map(d => { const b = bands[d.band]; return { x: b.xs[d.c0] - HR, z: b.zs[d.r0] - HR, w: b.xs[d.c1 + 1] - b.xs[d.c0] + ROAD, d: b.zs[d.r1 + 1] - b.zs[d.r0] + ROAD }; });
  const districtAt = (x, z) => {
    let best = 0, bd = Infinity;
    dRects.forEach((r, i) => { const dx = Math.max(r.x - x, 0, x - r.x - r.w), dz = Math.max(r.z - z, 0, z - r.z - r.d), dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } });
    return best;
  };

  // ---------- blocks ----------
  const blocks = [];
  const addBlock = (bi, c0, r0, c1, r1, zone) => {
    const B = bands[bi];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) (B.bid[r] || (B.bid[r] = []))[c] = blocks.length;
    const x = B.xs[c0] + HR, z = B.zs[r0] + HR, w = B.xs[c1 + 1] - HR - x, d = B.zs[r1 + 1] - HR - z;
    blocks.push({ band: bi, c0, r0, c1, r1, zone, x, z, w, d, cx: x + w / 2, cz: z + d / 2, di: DISTRICTS.findIndex(D => D.band === bi && c0 >= D.c0 && c0 <= D.c1 && r0 >= D.r0 && r0 <= D.r1), template: null });
  };
  for (const p of PLAN) addBlock(...p);
  bands.forEach((B, bi) => { for (let r = 0; r < B.nr; r++) for (let c = 0; c < B.nc; c++) if ((B.bid[r] || [])[c] == null) addBlock(bi, c, r, c, r, 'park'); });

  // ---------- road graph ----------
  const nodeMap = new Map(), segs = [];
  const nk = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  const node = (x, z) => { const k = nk(x, z); let n = nodeMap.get(k); if (!n) { n = { x, z, N: 0, S: 0, E: 0, W: 0, id: nodeMap.size }; nodeMap.set(k, n); } return n; };
  const edge = (x1, z1, x2, z2, meta = {}) => {
    if (x1 === x2 && z1 === z2) return;
    const a = node(x1, z1), b = node(x2, z2), v = x1 === x2;
    if (v) { if (z1 < z2) { a.S = 1; b.N = 1; } else { a.N = 1; b.S = 1; } } else if (x1 < x2) { a.E = 1; b.W = 1; } else { a.W = 1; b.E = 1; }
    segs.push({ a, b, v, L: Math.abs(x2 - x1) + Math.abs(z2 - z1), ...meta });
  };
  const lines = new Map();
  const lineAdd = (z, x, x0, x1) => { let L = lines.get(z); if (!L) lines.set(z, (L = { xs: new Set(), x0, x1 })); L.xs.add(x); L.x0 = Math.min(L.x0, x0); L.x1 = Math.max(L.x1, x1); };
  bands.forEach(B => {
    const bid = (r, c) => B.bid[r][c];
    for (let i = 0; i <= B.nc; i++) for (let j = 0; j < B.nr; j++) if (i === 0 || i === B.nc || bid(j, i - 1) !== bid(j, i)) edge(B.xs[i], B.zs[j], B.xs[i], B.zs[j + 1], { art: i === 0 || i === B.nc });
    for (let j = 1; j < B.nr; j++) for (let i = 0; i < B.nc; i++) if (bid(j - 1, i) !== bid(j, i)) edge(B.xs[i], B.zs[j], B.xs[i + 1], B.zs[j], { art: false });
    for (const z of [B.zs[0], B.zs[B.nr]]) B.xs.forEach(x => lineAdd(z, x, B.xs[0], B.xs[B.nc]));
    // internal vertical roads that touch a band edge need a breakpoint (already in xs)
  });
  const bridgeXs = BRIDGE_COLS.map(c => isle.xs[c]);
  for (const x of bridgeXs) { lineAdd(mainBottom, x, x, x); lineAdd(isle.zs[0], x, x, x); }
  for (const [z, L] of lines) { const xs = [...L.xs].filter(x => x >= L.x0 && x <= L.x1).sort((a, b) => a - b); for (let k = 0; k < xs.length - 1; k++) edge(xs[k], z, xs[k + 1], z, { art: true }); }
  for (const x of bridgeXs) edge(x, mainBottom, x, isle.zs[0], { bridge: true, art: true });
  const nodes = [...nodeMap.values()];

  // ---------- road tiles ----------
  const tileCount = { straight: 0, cross: 0, tee: 0, corner: 0, end: 0, bridge: 0 };
  for (const s of segs) {
    const x1 = Math.min(s.a.x, s.b.x), z1 = Math.min(s.a.z, s.b.z), len = s.L - ROAD;
    s.rect = s.v ? { x: x1 - HR, z: z1 + HR, w: ROAD, d: len } : { x: x1 + HR, z: z1 - HR, w: len, d: ROAD };
    district = districtAt(s.rect.x + s.rect.w / 2, s.rect.z + s.rect.d / 2);
    if (s.bridge) {
      const RL = has('bridge_ramp') ? 24 : 0;
      put('bridge_a', s.a.x, RL ? -3.6 : -1.59, z1 + s.L / 2, 0, 1, 1, (len - 2 * RL) / 100); tileCount.bridge++;
      if (RL) { put('bridge_ramp', s.a.x, 0, z1 + HR + RL / 2, Math.PI); put('bridge_ramp', s.a.x, 0, z1 + s.L - HR - RL / 2, 0); }
      continue;
    }
    const n = Math.max(1, Math.round(len / 10)), tl = len / n;
    for (let k = 0; k < n; k++) {
      const o = HR + tl / 2 + tl * k;
      if (s.v) put(TILE.straight, s.a.x, 0, z1 + o, 0, 1, 1, tl / 10); else put(TILE.straight, x1 + o, 0, s.a.z, R90, 1, 1, tl / 10);
      tileCount.straight++;
    }
  }
  for (const n of nodes) {
    const c = n.N + n.S + n.W + n.E; let type, yaw = 0, sz = 1;
    district = districtAt(n.x, n.z);
    if (c === 4) type = 'cross';
    else if (c === 3) { type = 'tee'; yaw = !n.W ? 0 : !n.N ? -R90 : !n.S ? R90 : Math.PI; }
    else if (c === 2 && n.N && n.S) { type = 'straight'; sz = 1.2; }
    else if (c === 2 && n.E && n.W) { type = 'straight'; yaw = R90; sz = 1.2; }
    else if (c === 2) { type = 'corner'; yaw = n.S && n.W ? 0 : n.E && n.S ? R90 : n.N && n.E ? Math.PI : -R90; }
    else { type = 'end'; yaw = n.S ? 0 : n.W ? -R90 : n.N ? Math.PI : R90; }
    put(TILE[type], n.x, 0, n.z, yaw, 1, 1, sz); tileCount[type]++; n.type = type;
  }

  // ---------- fillers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const edgeAnchor = (b, x, z, tags, label) => {
    const dn = z - b.z, ds = b.z + b.d - z, dw = x - b.x, de = b.x + b.w - x, m = Math.min(dn, ds, dw, de);
    let a;
    if (m === dn) a = { x: clamp(x, b.x + 6, b.x + b.w - 6), z: b.z - 4 };
    else if (m === ds) a = { x: clamp(x, b.x + 6, b.x + b.w - 6), z: b.z + b.d + 4 };
    else if (m === dw) a = { x: b.x - 4, z: clamp(z, b.z + 6, b.z + b.d - 6) };
    else a = { x: b.x + b.w + 4, z: clamp(z, b.z + 6, b.z + b.d - 6) };
    anchors.push({ ...a, tags, label, d: b.di });
  };
  const scatter = (r, step, prob, avoid = []) => {
    for (let zz = r.z + step / 2; zz < r.z + r.d; zz += step) for (let xx = r.x + step / 2; xx < r.x + r.w; xx += step) {
      if (rnd() > prob) continue;
      const x = xx + (rnd() - 0.5) * step * 0.6, z = zz + (rnd() - 0.5) * step * 0.6;
      if (avoid.some(a => x > a.x - 3 && x < a.x + a.w + 3 && z > a.z - 3 && z < a.z + a.d + 3)) continue;
      const [id, y] = pick(TREES); const s = 0.85 + rnd() * 0.35; put(id, x, y * s, z, rnd() * 6.28, s, s, s);
    }
  };
  const lawn = r => put(LAWN, r.x + r.w / 2, 0.01, r.z + r.d / 2, 0, r.w / 12, 1, r.d / 20);
  const along = r => r.w >= r.d;
  const pocket = (r, b) => {
    lawn(r);
    const avoid = [];
    if (Math.min(r.w, r.d) >= 18 && PARKF && rnd() < 0.6) { put(PARKF, r.x + r.w / 2, 0.02, r.z + r.d / 2); avoid.push({ x: r.x + r.w / 2 - 3, z: r.z + r.d / 2 - 3, w: 6, d: 6 }); }
    if (BENCH) put(BENCH, r.x + 4, 0.02, r.z + 4, along(r) ? 0 : R90);
    scatter(r, 8, 0.65, avoid);
    edgeAnchor(b, r.x + r.w / 2, r.z + r.d / 2, ['park', 'tree', 'meadow'], 'Pocket park');
  };
  const fenceRect = (r, gateSide) => {
    if (!FENCE) return;
    for (let x = r.x + 2; x < r.x + r.w - 3; x += 3.65) {
      const mid = Math.abs(x + 1.8 - (r.x + r.w / 2)) < 4;
      if (!(gateSide === 'N' && mid)) put(FENCE, x + 1.8, 0, r.z + 1, 0);
      if (!(gateSide === 'S' && mid)) put(FENCE, x + 1.8, 0, r.z + r.d - 1, 0);
    }
    for (let z = r.z + 2; z < r.z + r.d - 3; z += 3.65) { put(FENCE, r.x + 1, 0, z + 1.8, R90); put(FENCE, r.x + r.w - 1, 0, z + 1.8, R90); }
    if (GATE && gateSide) put(GATE, r.x + r.w / 2, 0, gateSide === 'N' ? r.z + 1 : r.z + r.d - 1, 0);
  };
  const field = (r, b) => {
    lawn(r); fenceRect(r);
    if (has('tractor_a')) put('tractor_a', r.x + r.w * 0.35, 0, r.z + r.d / 2, R90);
    const herd = ['animal_cow', 'animal_cow', 'animal_sheep', 'animal_sheep', 'animal_sheep', 'animal_pig', 'animal_horse', 'animal_llama'];
    for (let k = 0; k < Math.min(herd.length, Math.floor(r.w * r.d / 500)); k++) animals.push({ id: herd[k], x: r.x + 8 + rnd() * (r.w - 16), z: r.z + 8 + rnd() * (r.d - 16), yaw: rnd() * 6.28, di: district });
    [[0, 0, 0.6], [0.7, 0.5, 2.2], [0.9, -0.4, 4.1], [0.4, 0.8, 5.3]].forEach(([dx, dz, yaw], k) => animals.push({ id: k ? 'animal_chick' : 'animal_hen', x: r.x + r.w - 20 + dx, z: r.z + 18 + dz, yaw, di: district }));
    const silo = firstOf(/^farmstractures_26/); if (silo) put(silo, r.x + r.w - 10, 0, r.z + 10, 0);
    edgeAnchor(b, r.x + r.w / 2, r.z + r.d / 2, ['field', 'lane', 'meadow'], 'Farm field');
  };
  const woods = (r, b) => {
    lawn(r);
    const hill = { x: r.x + r.w / 2 - 36.5, z: r.z + r.d - 56, w: 73, d: 46 };
    if (has('landscape_v2') && r.w >= 60) put('landscape_v2', hill.x + 36.5, -0.38, hill.z + 23, 0, Math.min(1, (r.w - 6) / 73), 1, 1);
    const clearing = { x: r.x + r.w / 2 - 12, z: r.z + 20, w: 24, d: 20 };
    scatter(r, 6.5, 0.85, [hill, clearing]);
    const logs = firstOf(/^logs_a/); if (logs) put(logs, clearing.x + 12, 0, clearing.z + 10, 0.4);
    for (let t = 0.2; t < 1; t += 0.3) { edgeAnchor(b, r.x + 2, r.z + r.d * t, ['woods', 'lane', 'tree'], 'Woods edge'); edgeAnchor(b, r.x + r.w - 2, r.z + r.d * t, ['woods', 'lane', 'tree'], 'Woods edge'); }
  };
  const park = (r, b) => {
    lawn(r);
    const avoid = [];
    if (COURT && r.w >= 24 && r.d >= 24 && rnd() < 0.6) { const x = r.x + r.w / 2, z = r.z + 14; put(COURT, x, 0.02, z, R90); avoid.push({ x: x - 10, z: z - 5, w: 20, d: 10 }); edgeAnchor(b, x, z, ['playground', 'park'], 'Basketball court'); }
    if (PARKE && r.d >= 60) { put(PARKE, r.x + r.w / 2, 0.02, r.z + r.d - 14); avoid.push({ x: r.x + r.w / 2 - 5, z: r.z + r.d - 17, w: 10, d: 6 }); }
    if (BENCH) { put(BENCH, r.x + 5, 0.02, r.z + r.d / 2, R90); put(BENCH, r.x + r.w - 5, 0.02, r.z + r.d / 2, -R90); }
    if (has('pg_pad') && r.w >= 28 && r.d >= 40) {
      const px = r.x + r.w / 2, pz = r.z + r.d * 0.6;
      put('pg_pad', px, 0.02, pz); put('pg_swings', px - 3.6, 0.08, pz - 2.4); put('pg_slide', px + 4.2, 0.08, pz - 1.2, R90);
      put('pg_roundabout', px - 3.8, 0.08, pz + 2.6); put('pg_seesaw', px + 3.4, 0.08, pz + 3, 0); put('pg_climber', px, 0.08, pz + 1.8);
      avoid.push({ x: px - 8, z: pz - 6, w: 16, d: 12 }); edgeAnchor(b, px, pz, ['playground', 'park'], 'Playground');
    }
    scatter(r, 7.5, 0.6, avoid);
    if (rnd() < 0.5) animals.push({ id: 'animal_pug', x: r.x + r.w / 2 + (rnd() - 0.5) * 8, z: r.z + r.d / 2, yaw: rnd() * 6.28, di: district });
    else if (rnd() < 0.6) animals.push({ id: 'animal_cat', x: r.x + 4 + rnd() * (r.w - 8), z: r.z + 4 + rnd() * (r.d - 8), yaw: rnd() * 6.28, di: district });
    edgeAnchor(b, r.x + r.w / 2, r.z + r.d / 2, ['park', 'meadow', 'tree'], 'Park');
  };
  const bigpark = (r, b) => {
    lawn(r);
    const px = r.x + r.w / 2, pz = r.z + r.d * 0.42;
    put('water_b', px, -5.6, pz, 0, Math.min(1, (r.w - 20) / 44), 1, 1);
    const pond = { x: px - 24, z: pz - 17, w: 48, d: 34 }, avoid = [pond];
    if (PARKC) for (const [dx, dz] of [[-30, -32], [30, -32], [-30, 32], [30, 32]]) if (Math.abs(dx) + 5 < r.w / 2) { put(PARKC, px + dx, 0.02, pz + dz); avoid.push({ x: px + dx - 5, z: pz + dz - 5, w: 10, d: 10 }); }
    if (has('hc_helicopter') && has('sp_roof_helipad')) { const hx = r.x + 12, hz = r.z + r.d - 14; put('sp_roof_helipad', hx, -0.5, hz, 0, 1.6, 1, 1.6); put('hc_helicopter', hx, 0.15, hz, 0.6); avoid.push({ x: hx - 9, z: hz - 9, w: 18, d: 18 }); anchors.push({ x: hx, z: hz + 12, tags: ['helipad', 'pond'], label: 'Park helipad', d: b.di }); }
    else if (COURT) { const z = r.z + r.d - 16; put(COURT, px, 0.02, z, 0); avoid.push({ x: px - 6, z: z - 10, w: 12, d: 20 }); edgeAnchor(b, px, z, ['playground', 'park'], 'Court'); }
    if (BENCH) for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; put(BENCH, px + Math.cos(a) * 29, 0.02, pz + Math.sin(a) * 21, -a + R90); }
    scatter(r, 7, 0.7, avoid);
    edgeAnchor(b, px, pz, ['pond', 'park', 'meadow'], 'Pond');
  };
  const hq = b => {
    lawn(b);
    if (has('land_v2')) put('land_v2', b.cx, 0.02, b.z + b.d - 8, 0, (b.w - 4) / 100, 1, 14 / 80);
    if (has('fb_fire_station')) put('fb_fire_station', b.cx, 0, b.z + 3 + 7.4, Math.PI, 1.9, 1.9, 1.9, '#ffffff');
    else put(firstOf(/^policestation/), b.cx, 0, b.z + 11, 0, 1, 1, 1, '#ff5a4a');
    const ft = has('rg_firetruck') ? 'rg_firetruck' : TRUCKS[0];
    if (ft) for (const dx of [-15, 15]) put(ft, b.cx + dx, 0.02, b.z + b.d - 8, R90, 1, 1, 1, ft === 'rg_firetruck' ? undefined : '#ff5a4a');
    if (has('sp_hydrant')) put('sp_hydrant', b.x + 3, 0.02, b.z + b.d - 3);
    if (has('dr_drone')) put('dr_drone', b.cx, 0.05, b.z + b.d - 8, 0);
    scatter({ x: b.x, z: b.z, w: 8, d: b.d }, 6, 0.8); scatter({ x: b.x + b.w - 8, z: b.z, w: 8, d: b.d }, 6, 0.8);
    edgeAnchor(b, b.cx, b.z + b.d - 2, ['vehicle', 'station', 'garage'], 'Fire station');
    edgeAnchor(b, b.cx, b.z + 2, ['house', 'kitchen', 'garage'], 'Fire station kitchen');
  };
  // Procedural compound: two strips of buildings facing the roads, a middle strip for yard / garden.
  const compound = (b, pool, kind) => {
    const ind = kind === 'ind';
    if (ind && has('land_v2')) put('land_v2', b.cx, 0.01, b.cz, 0, b.w / 100, 1, b.d / 80); else lawn(b);
    if (ind) fenceRect(b, 'N');
    const m = ind ? 5 : 4, gap = ind ? 6 : 5, two = b.d >= 64;
    const maxD = two ? (b.d - 2 * m - 10) / 2 : b.d - 2 * m - 6;
    const rowDepth = [0, 0];
    for (let row = 0; row < (two ? 2 : 1); row++) {
      let x = b.x + m, bag = [];
      for (let guard = 0; guard < 20; guard++) {
        const room = b.x + b.w - m - x; if (room < 10) break;
        if (!bag.length) bag = pool.slice();
        const opts = [];
        bag.forEach((e, k) => { for (const q of [0, 1]) { const fw = q ? e.d : e.w, fd = q ? e.w : e.d; if (fw <= room && fd <= maxD) opts.push({ e, k, q, fw, fd }); } });
        if (!opts.length) break;
        const o = pick(opts); bag.splice(o.k, 1);
        const z = row === 0 ? b.z + m + o.fd / 2 : b.z + b.d - m - o.fd / 2;
        put(o.e.id, x + o.fw / 2, 0, z, (o.q ? R90 : 0) + (row ? Math.PI : 0));
        const svc = /^hospital/.test(o.e.base) ? 'rg_ambulance' : /^policestation/.test(o.e.base) ? 'rg_police_sedan' : null;
        if (svc && has(svc)) put(svc, x + o.fw / 2, 0.02, row ? z - o.fd / 2 - 3 : z + o.fd / 2 + 3, R90);
        const tg = tagsOf(o.e.base); if (tg) edgeAnchor(b, x + o.fw / 2, z, tg, NICE(o.e.base));
        rowDepth[row] = Math.max(rowDepth[row], o.fd);
        x += o.fw + gap;
      }
    }
    const midZ0 = b.z + m + rowDepth[0] + 3, midZ1 = b.z + b.d - m - rowDepth[1] - 3;
    const mid = { x: b.x + m, z: midZ0, w: b.w - 2 * m, d: Math.max(0, midZ1 - midZ0) };
    if (mid.d < 6) return;
    if (ind) {
      for (let k = 0; k < Math.floor(mid.w / 14); k++) {
        const x = mid.x + 7 + k * 14, z = mid.z + mid.d / 2;
        if (rnd() < 0.35 && TRUCKS.length) put(pick(TRUCKS), x, 0.02, z, R90);
        else for (let p = 0; p < 3; p++) if (YARD_PROPS.length) put(pick(YARD_PROPS), x + (rnd() - 0.5) * 8, 0.02, z + (rnd() - 0.5) * Math.min(8, mid.d - 2), rnd() * 6.28);
      }
      edgeAnchor(b, mid.x + mid.w / 2, mid.z, ['industrial', 'vehicle', 'garage'], 'Yard');
    } else {
      const av = [];
      if (PARKF && mid.w > 20) { put(PARKF, mid.x + mid.w / 2, 0.02, mid.z + mid.d / 2); av.push({ x: mid.x + mid.w / 2 - 3, z: mid.z + mid.d / 2 - 3, w: 6, d: 6 }); }
      if (BENCH) put(BENCH, mid.x + 4, 0.02, mid.z + mid.d / 2, R90);
      scatter(mid, 7, 0.55, av);
    }
  };

  // ---------- templates ----------
  const used = {};
  const place = (t, rot, b) => {
    const th = rot * R90, c = Math.cos(th), s = Math.sin(th);
    const tw = rot % 2 ? t.d : t.w, td = rot % 2 ? t.w : t.d;
    const sx = b.w - tw, sz = b.d - td;
    const ox = sx > 10 ? (rnd() < 0.5 ? -sx / 2 : sx / 2) : 0, oz = sz > 10 ? (rnd() < 0.5 ? -sz / 2 : sz / 2) : 0;
    const cx = b.cx + ox, cz = b.cz + oz;
    for (const it of t.items) {
      let pi, lx, y, lz, yaw, ssx = 1, ssy = 1, ssz = 1;
      if (it.length === 5) [pi, lx, y, lz, yaw] = it;
      else { pi = it[0]; const e = it.slice(1, 13); [lx, y, lz] = it.slice(13, 16); yaw = Math.atan2(-e[2], e[0]); ssx = Math.hypot(e[0], e[1], e[2]); ssy = Math.hypot(e[4], e[5], e[6]); ssz = Math.hypot(e[8], e[9], e[10]); }
      const e = index[pi];
      if (/^parking_area/.test(e.base) && t.zone !== 'stadium' && rnd() < 0.6) continue; // thin out car parks
      if (/^(car_|jeep_)/.test(e.base) && t.zone !== 'stadium' && rnd() < 0.5) continue;
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
      put(pi, x, y, z, yaw + th, ssx, ssy, ssz);
      const svc = /^hospital/.test(e.base) ? 'rg_ambulance' : /^policestation/.test(e.base) ? 'rg_police_sedan' : /^(business|bank|hotel)/.test(e.base) && rnd() < 0.5 ? 'rg_taxi' : null;
      if (svc && has(svc)) { const off = Math.max(e.w, e.d) / 2 + 3; put(svc, x + (Math.abs(Math.cos(th)) > 0.5 ? off : 0), 0.02, z + (Math.abs(Math.cos(th)) > 0.5 ? 0 : off), th); }
      const tg = e.h > 1.5 || /^(basketball|park_)/.test(e.base) ? tagsOf(e.base) : null;
      if (tg && (!/^park_/.test(e.base) || rnd() < 0.35)) edgeAnchor(b, x, z, tg, NICE(e.base));
      if (/^tree/.test(e.base) && rnd() < 0.04) edgeAnchor(b, x, z, ['tree'], 'Tree');
    }
    const lo = [];
    if (sx > 10) lo.push({ x: ox < 0 ? b.x + tw : b.x, z: b.z, w: sx, d: b.d });
    if (sz > 10) lo.push({ x: b.x, z: oz < 0 ? b.z + td : b.z, w: b.w, d: sz });
    return lo;
  };
  const FILL = { pocket, field, woods, park, bigpark };
  const SP_SHOPS = index.filter(e => e.src === 'simplepoly' && catOf(e.base) === 'shop');
  const shopRow = b => {
    compound(b, SP_SHOPS, 'civic');
    for (let k = 0; k < 3; k++) { if (has('sp_coffee_shop_chair') && rnd() < 0.6) put('sp_coffee_shop_chair', b.x + 8 + rnd() * (b.w - 16), 0.02, b.cz + (rnd() - 0.5) * 4, 0); }
    if (has('sp_dustbin')) put('sp_dustbin', b.x + 3, 0.02, b.z + 3);
  };
  const PROC = { shops: shopRow, ind: b => compound(b, IND_POOL, 'ind'), civic: b => compound(b, CIVIC_POOL, 'civic'), down: b => compound(b, CIVIC_POOL, 'civic'), farm: b => field(b, b), stadium: b => park(b, b), gas: b => pocket(b, b) };
  const order = blocks.map((b, i) => i).sort((a, b) => (blocks[b].w * blocks[b].d) - (blocks[a].w * blocks[a].d));
  for (const bi of order) {
    const b = blocks[bi]; district = b.di;
    if (b.zone === 'hq') { hq(b); b.template = 'fire station'; continue; }
    const re = ZONE_T[b.zone];
    if (!re) { FILL[b.zone](b, b); b.template = ZONE_LABEL[b.zone].toLowerCase(); continue; }
    let best = null;
    for (const t of templates) {
      if (!re.test(t.id) || (UNIQUE.test(t.id) && used[t.id])) continue;
      for (let rot = 0; rot < 4; rot++) {
        const tw = rot % 2 ? t.d : t.w, td = rot % 2 ? t.w : t.d;
        if (tw > b.w + 1.5 || td > b.d + 1.5) continue;
        const sc = (tw * td) / (b.w * b.d) - 0.3 * (used[t.id] || 0) + rnd() * 0.15;
        if (!best || sc > best.sc) best = { t, rot, sc };
      }
    }
    if (best && b.zone === 'shops' && (used[best.t.id] || 0) >= 1 && SP_SHOPS.length && rnd() < 0.7) best = null;
    if (!best) {
      if (PROC[b.zone]) { PROC[b.zone](b); b.template = 'procedural ' + ZONE_LABEL[b.zone].toLowerCase(); continue; }
      warnings.push(`No ${b.zone} template fits ${Math.round(b.w)}×${Math.round(b.d)} m`); pocket(b, b); continue;
    }
    used[best.t.id] = (used[best.t.id] || 0) + 1;
    b.template = best.t.id;
    for (const r of place(best.t, best.rot, b)) (b.zone === 'farm' ? field : pocket)(r, b);
  }

  // ---------- road + water anchors ----------
  for (const s of segs) {
    const r = s.rect, mx = r.x + r.w / 2, mz = r.z + r.d / 2, di = districtAt(mx, mz);
    if (s.bridge) { anchors.push({ x: mx, z: mainBottom + 8, tags: ['bridge', 'river'], label: 'Bridge (north end)', d: di }); anchors.push({ x: mx, z: isle.zs[0] - 8, tags: ['bridge', 'river'], label: 'Bridge (south end)', d: districtAt(mx, isle.zs[0] + 10) }); continue; }
    anchors.push({ x: mx, z: mz, tags: ['road'], label: 'Street', d: di });
    if (Math.round(mx + mz) % 3 === 0) anchors.push({ x: s.v ? mx + 4 : mx, z: s.v ? mz : mz + 4, tags: ['lamp'], label: 'Lamp post', d: di });
    const onV = x => Math.abs(s.a.x - x) < 1 && s.v, onH = z => Math.abs(s.a.z - z) < 1 && !s.v;
    if (onV(bands[0].xs[0]) || (onV(bands[1].xs[0]) && s.a.z < mainBottom)) anchors.push({ x: mx - 4, z: mz, tags: ['river', 'harbour'], label: 'Beach road', d: di });
    if (onH(mainBottom)) anchors.push({ x: mx, z: mz + 4, tags: ['river'], label: 'Riverside', d: di });
    if (onH(isle.zs[0])) anchors.push({ x: mx, z: mz - 4, tags: ['river'], label: 'Island riverside', d: di });
    if (onH(isle.zs[isle.nr]) || onV(isle.xs[0]) || onV(isle.xs[isle.nc])) anchors.push({ x: s.v ? (s.a.x < TW / 2 ? mx - 4 : mx + 4) : mx, z: s.v ? mz : mz + 4, tags: ['harbour', 'river'], label: 'Harbour front', d: di });
  }
  for (const n of nodes) {
    const c = n.N + n.S + n.W + n.E, di = districtAt(n.x, n.z); district = di;
    if (c >= 3 && DISTRICTS[di].id !== 'farm' && rnd() < 0.55) { anchors.push({ x: n.x + 7.5, z: n.z + 7.5, tags: ['hydrant'], label: 'Hydrant', d: di, node: n }); if (has('sp_hydrant')) put('sp_hydrant', n.x + 7.5, 0.02, n.z + 7.5, rnd() * 6.28); }
    if (c === 4 && has('sp_traffic_signal_small')) { put('sp_traffic_signal_small', n.x - 7.2, 0, n.z - 7.2, 0); put('sp_traffic_signal_small', n.x + 7.2, 0, n.z + 7.2, Math.PI); }
  }
  if (has('sp_street_light')) for (const s of segs) {
    if (s.bridge || s.L < 30) continue;
    const r = s.rect; district = districtAt(r.x + r.w / 2, r.z + r.d / 2);
    if (DISTRICTS[district].id === 'farm') continue;
    const n = Math.max(1, Math.round((s.L - 12) / 26));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, side = (k % 2 ? 1 : -1);
      if (s.v) put('sp_street_light', s.a.x + side * 7.2, 0, r.z + r.d * t, side > 0 ? 0 : Math.PI);
      else put('sp_street_light', r.x + r.w * t, 0, s.a.z + side * 7.2, side > 0 ? -R90 : R90);
    }
  }

  // ---------- road distances (Dijkstra) ----------
  const adj = nodes.map(() => []);
  for (const s of segs) { adj[s.a.id].push([s.b.id, s.L]); adj[s.b.id].push([s.a.id, s.L]); }
  const dijkstra = src => {
    const D = new Float64Array(nodes.length).fill(Infinity), done = new Uint8Array(nodes.length); D[src] = 0;
    for (;;) { let u = -1, bd = Infinity; for (let i = 0; i < D.length; i++) if (!done[i] && D[i] < bd) { bd = D[i]; u = i; } if (u < 0) break; done[u] = 1; for (const [v, w] of adj[u]) if (D[u] + w < D[v]) D[v] = D[u] + w; }
    return D;
  };
  const hqB = blocks.find(b => b.zone === 'hq');
  const spawnZ = hqB.z + hqB.d + HR;
  const spawnSeg = segs.find(s => !s.v && Math.abs(s.a.z - spawnZ) < 1 && Math.min(s.a.x, s.b.x) <= hqB.cx && Math.max(s.a.x, s.b.x) >= hqB.cx);
  const spawn = { x: hqB.cx, z: spawnZ, yaw: R90 };
  const D = dijkstra((spawnSeg ? spawnSeg.a : nodes[0]).id);
  const segDist = (s, x, z) => {
    const x0 = Math.min(s.a.x, s.b.x), x1 = Math.max(s.a.x, s.b.x), z0 = Math.min(s.a.z, s.b.z), z1 = Math.max(s.a.z, s.b.z);
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  };
  const roadD = a => {
    if (a.node) return D[a.node.id];
    let best = null, bd = Infinity; for (const s of segs) { const d = segDist(s, a.x, a.z); if (d < bd) { bd = d; best = s; } }
    const t = best.v ? a.z : a.x, pa = best.v ? best.a.z : best.a.x, pb = best.v ? best.b.z : best.b.x;
    return Math.min(D[best.a.id] + Math.abs(t - pa), D[best.b.id] + Math.abs(t - pb)) + bd;
  };
  for (const a of anchors) a.rd = roadD(a);
  const maxD = Math.max(...anchors.map(a => a.rd).filter(Number.isFinite));

  // ---------- event solver ----------
  const targets = [0.18, 0.5, 0.82], events = [], taken = new Set();
  const cand = g => anchors.filter(a => Number.isFinite(a.rd) && a.tags.some(t => g.tags.includes(t)));
  const gorder = GAMES.map((g, rank) => ({ g, rank, c: cand(g) })).sort((a, b) => a.c.length - b.c.length);
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
  const passes = [{ sp: 44, distinct: true }, { sp: 30, distinct: true }, { sp: 20, distinct: false }, { sp: 8, distinct: false }];
  for (const { g, rank, c } of gorder) {
    const usedD = new Set();
    for (let k = 0; k < 3; k++) {
      let pickA = null, pass = 0;
      for (; pass < passes.length && !pickA; pass++) {
        const p = passes[pass]; let best = 1e9;
        for (const a of c) {
          const key = Math.round(a.x) + ',' + Math.round(a.z);
          if (taken.has(key) || (p.distinct && usedD.has(a.d))) continue;
          if (!events.every(e => cheb(e, a) >= p.sp)) continue;
          const ti = Math.min(...a.tags.map(t => g.tags.indexOf(t)).filter(v => v >= 0));
          const sc = Math.abs(a.rd / maxD - targets[k]) + ti * 0.06 + rnd() * 0.05;
          if (sc < best) { best = sc; pickA = a; }
        }
      }
      if (!pickA) { warnings.push(`${g.name} #${k + 1}: no free spot`); continue; }
      if (pass > 2) warnings.push(`${g.name} #${k + 1}: shares a district`);
      taken.add(Math.round(pickA.x) + ',' + Math.round(pickA.z)); usedD.add(pickA.d);
      events.push({ gid: g.id, rank, k, tier: k + 1, x: pickA.x, z: pickA.z, d: pickA.d, label: pickA.label, roadD: pickA.rd });
    }
  }
  events.sort((a, b) => a.tier - b.tier || a.rank - b.rank);
  events.forEach((e, i) => (e.call = i + 1));

  // ---------- terrain ----------
  district = -1;
  const terrain = { land: [], sand: [], mountains: [] };
  const MX1 = TW + 330, MZ0 = -330;
  const mainland = { x: 0, z: MZ0, w: MX1, d: mainBottom + HR + 4 - MZ0 };
  const isleR = { x: isle.xs[0] - HR - 8, z: isle.zs[0] - HR - 4, w: isle.xs[isle.nc] - isle.xs[0] + ROAD + 16, d: TD - isle.zs[0] + HR + 12 };
  terrain.land.push(mainland, isleR);
  const SL = 251.11, SW = 31.52;
  const beach = (x, z, len, along) => { for (let o = 0; o < len - 1; o += SL * 0.98) { const l = Math.min(SL, len - o); if (along === 'z') put('sand_a', x, -2.73, z + o + l / 2, R90, l / SL, 1, COAST / SW); else put('sand_a', x + o + l / 2, -2.73, z, 0, l / SL, 1, COAST / SW); } };
  beach(-COAST / 2, MZ0, mainland.d, 'z'); terrain.sand.push({ x: -COAST, z: MZ0, w: COAST, d: mainland.d });
  beach(isleR.x - COAST / 2, isleR.z, isleR.d + COAST, 'z'); terrain.sand.push({ x: isleR.x - COAST, z: isleR.z, w: COAST, d: isleR.d + COAST });
  beach(isleR.x + isleR.w + COAST / 2, isleR.z, isleR.d + COAST, 'z'); terrain.sand.push({ x: isleR.x + isleR.w, z: isleR.z, w: COAST, d: isleR.d + COAST });
  beach(isleR.x, isleR.z + isleR.d + COAST / 2, isleR.w, 'x'); terrain.sand.push({ x: isleR.x, z: isleR.z + isleR.d, w: isleR.w, d: COAST });
  const MT = [['landscape_v3', 308.08, 119.52, -0.24], ['landscape_v1', 227.82, 72.15, -0.88], ['landscape_v4', 100.51, 99.96, -0.54]].filter(m => has(m[0]));
  const mountain = (id, w, d, y, x, z, yaw) => { put(id, x, y, z, yaw); const q = Math.abs(Math.round(yaw / R90)) % 2 === 1; terrain.mountains.push({ x: x - (q ? d : w) / 2, z: z - (q ? w : d) / 2, w: q ? d : w, d: q ? w : d }); };
  for (let row = 0; row < 2; row++) {
    let x = -COAST - 10 + row * 60;
    while (x < TW + 60) { const [id, w, d, y] = row ? MT[0] : pick(MT); mountain(id, w, d, y, x + w / 2, -6 - d / 2 - row * 70 - rnd() * 8, row ? Math.PI : 0); x += w * 0.82; }
    let z = -40 + row * 50;
    while (z < mainBottom - 60) { const [id, w, d, y] = row ? MT[0] : pick(MT); mountain(id, w, d, y, TW + 6 + d / 2 + row * 70 + rnd() * 8, z + w / 2, row ? -R90 : R90); z += w * 0.82; }
  }

  // ---------- kerbside cars (cartoon pack) ----------
  const KERB = index.filter(e => /^cc_/.test(e.id) && !/(police|ambulance|truck|limus|lemus|cube012)/.test(e.id)).map(e => e.id);
  if (KERB.length) for (const s of segs) {
    if (s.bridge || s.art || s.L < 40) continue;
    const r = s.rect; district = districtAt(r.x + r.w / 2, r.z + r.d / 2);
    if (['farm', 'ind'].includes(DISTRICTS[district].id) || rnd() > 0.45) continue;
    const n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) { const t = 0.25 + 0.5 * rnd(), side = rnd() < 0.5 ? -1 : 1;
      if (s.v) put(pick(KERB), s.a.x + side * 3.4, 0.02, r.z + r.d * t, side > 0 ? 0 : Math.PI);
      else put(pick(KERB), r.x + r.w * t, 0.02, s.a.z + side * 3.4, side > 0 ? R90 : -R90); }
  }
  // ---------- flood defences: sandbags along the banks either side of each bridge ----------
  if (has('sb_wall')) for (const bx of bridgeXs) for (const zz of [mainBottom + HR + 0.8, isle.zs[0] - HR - 0.8]) { district = districtAt(bx, zz); for (const dx of [-17.4, -14.4, 14.4, 17.4]) put('sb_wall', bx + dx, 0.02, zz, 0); anchors.push({ x: bx + 16, z: zz, tags: ['sandbag', 'river'], label: 'Sandbag wall', d: district }); }
  // ---------- boats on the river and off the island ----------
  district = -1;
  const BOATS = ['bt_speed_boat', 'bt_scout_boat', 'bt_fisher_boat', 'bt_wood_boatv1', 'bt_wood_boatv2', 'bt_kayakv1'].filter(has);
  if (BOATS.length) {
    const rz0 = mainBottom + HR + 14, rz1 = isle.zs[0] - HR - 14;
    for (let k = 0; k < 7; k++) { const x = 30 + rnd() * (TW - 60); if (bridgeXs.some(bx => Math.abs(bx - x) < 22)) continue; put(pick(BOATS), x, -0.55, rz0 + rnd() * (rz1 - rz0), R90 + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.5); }
    const sz = TD + HR + 16 + COAST;
    const hi = DISTRICTS.findIndex(d => d.id === 'harb'), hr = dRects[hi], sb = terrain.sand.find(t => t.w > t.d && t.z > isle.zs[0]);
    if (sb && has('hb_jetty')) { district = hi; for (const f of [0.3, 0.5]) { const x = hr.x + hr.w * f; put('hb_jetty', x, -2.2, sb.z + 10); anchors.push({ x, z: sb.z + 18, tags: ['harbour', 'jetty', 'river'], label: 'Jetty', d: hi }); } if (has('hb_slipway')) { const x = hr.x + hr.w * 0.75; put('hb_slipway', x, -2.55, sb.z + 14.4); anchors.push({ x, z: sb.z + 4, tags: ['harbour', 'slipway'], label: 'Slipway', d: hi }); } district = -1; }
    for (let k = 0; k < 5; k++) put(pick(BOATS), isle.xs[0] + rnd() * (isle.xs[isle.nc] - isle.xs[0]), -0.55, sz + rnd() * 50, rnd() * 6.28);
    for (let k = 0; k < 4; k++) put(pick(BOATS), -COAST - 20 - rnd() * 60, -0.55, rnd() * mainBottom, rnd() * 6.28);
  }
  // ---------- summaries ----------
  const byD = DISTRICTS.map(() => ({}));
  for (const f of feats) if (f.di >= 0) { const g = byD[f.di], k = ['house', 'tall', 'shop', 'civic', 'industrial'].includes(f.cat) ? 'buildings' : f.cat === 'vehicle' ? 'vehicles' : ['green', 'paved', 'water'].includes(f.cat) ? 'ground' : 'props'; (g[k] || (g[k] = {}))[NICE(f.base)] = ((g[k] || {})[NICE(f.base)] || 0) + 1; }
  for (const t of trees) if (t[3] >= 0) { const g = byD[t[3]]; (g.nature || (g.nature = {})).trees = ((g.nature || {}).trees || 0) + 1; }
  const tplByD = DISTRICTS.map(() => ({}));
  for (const b of blocks) if (b.di >= 0 && b.template) tplByD[b.di][b.template] = (tplByD[b.di][b.template] || 0) + 1;
  const buildings = feats.filter(f => ['house', 'tall', 'shop', 'civic', 'industrial'].includes(f.cat) && f.h > 1.5).length;
  const parkingLots = feats.filter(f => /^parking_area/.test(f.base)).length;
  const nw = nodes.reduce((a, n) => (n.x + n.z < a.x + a.z ? n : a)), se = nodes.reduce((a, n) => (n.x + n.z > a.x + a.z ? n : a));
  const corner = dijkstra(nw.id)[se.id];
  const nodeRects = nodes.map(n => ({ x: n.x - HR, z: n.z - HR, w: ROAD, d: ROAD }));
  return {
    seed, TW, TD, inst, tints, feats, trees, animals, blocks, events, spawn, terrain, warnings, dRects,
    segs: segs.map(s => ({ ...s.rect, v: s.v, art: !!s.art, bridge: !!s.bridge, L: s.L, a: { id: s.a.id, x: s.a.x, z: s.a.z }, b: { id: s.b.id, x: s.b.x, z: s.b.z } })), nodes: nodeRects,
    view: { x0: -COAST - 60, z0: -140, span: Math.max(TW + 160, TD + 200) },
    byD, tplByD, tileCount,
    stats: {
      buildings, trees: trees.length, instances: inst.length, anchors: anchors.length, parkingLots,
      templates: Object.keys(used).length, procedural: blocks.filter(b => /^procedural/.test(b.template || '')).length,
      roadKm: (segs.reduce((s, x) => s + x.L, 0) / 1000).toFixed(1),
      cornerSec: Math.round(corner / SPEED), avgSec: Math.round(events.reduce((s, e) => s + e.roadD, 0) / Math.max(1, events.length) / SPEED),
    },
  };
}

export async function loadGenData(base = './assets/') {
  const [t, index, ...extra] = await Promise.all([fetch(base + 'city-templates.json').then(r => r.json()), fetch(base + 'city-assets-index.json').then(r => r.json()),
    ...['buildings', 'vehicles', 'props', 'vehicles2', 'air', 'kit'].map(c => fetch(base + 'extra-' + c + '.json').then(r => (r.ok ? r.json() : [])).catch(() => []))]);
  const ids = t.ids.slice(), idx = index.map(e => ({ ...e, src: 'lowpoly' }));
  for (const list of extra) for (const e of list) { ids.push(e.id); idx.push({ ...e, base: e.id }); }
  return { ids, index: idx, templates: t.templates };
}

// Assets the pack doesn't have that would make the game noticeably better.
export const HAVE = [
  { name: 'Fire station', how: 'FBX building pack, scaled ×1.9 (22 × 15 m) with two bay aprons', src: 'FBX building pack (licence to confirm)' },
  { name: 'Fire engine', how: 'Rgsdev Firetruck (9.6 m, ladder on top) is the player vehicle and parks ×2 at the station', src: 'Rgsdev (CC0)' },
  { name: 'Hydrants', how: 'Placed on every hydrant spot, so Hydrant Hookup / Thaw have something to aim at', src: 'SimplePoly City' },
  { name: 'Street lights + traffic signals', how: 'Lights every ~26 m along streets, signals on crossroads', src: 'SimplePoly City' },
  { name: 'Ambulance, police, taxi', how: 'Parked outside hospitals, police stations and hotels / banks', src: 'Rgsdev (CC0)' },
  { name: 'Shop fronts', how: '15 signed shops (bakery, pizza, books…) fill shop blocks instead of repeating templates', src: 'SimplePoly City' },
  { name: 'Kerbside cars', how: '39 cartoon cars; 1–2 parked along quiet streets so roads feel lived in', src: 'Cartoon cars pack' },
  { name: 'Rescue boats', how: 'Speed, scout and fishing boats, rowing boats and kayaks on the river and off the island. River Rescue can use the speed boat.', src: 'PolyPack boats' },
  { name: 'Animated farm animals, hen + chicks', how: 'Cows, sheep, pig, horse and llama graze in the fields (Idle loop). Pigs are the Catch! runaways. A hen and chicks on the farm (Pet Parade). Pugs and cats wander some parks.', src: 'Quaternius (CC0)' },
  { name: 'Helicopter + drone', how: 'Helicopter on a helipad in Westcliff Park next to the pond (Heli Bucket fills there). Drone parked between the engines at the station (Drone Drop).', src: 'Lowpoly Helicopter (Antonmoek) · Drone LVL2' },
  { name: 'Blaze kit (made here)', how: 'Bridge ramps (24 m, up to a 4 m deck), jetties + a slipway at the Harbour, sandbag walls by the bridges, playgrounds in parks (swings, slide, seesaw, roundabout, climbing frame), police tape and a turntable ladder rig.', src: 'Built in three.js to match LowPoly City' },
  { name: 'Quest markers', how: 'Every call is a hovering map-pin in its game colour with the game icon on both faces. It bobs and spins, with a rotating light burst, glow, a light column and a pool of light on the ground.', src: 'Made here (city-markers.js)' },
  { name: 'Pedestrians', how: '70 walkers (12 street characters from the 24) follow the pavements round the road graph, crossing at junctions; 40% start near the station. When the engine heads at one it turns 90° to the engine, jumps clear, waits for it to pass, then walks back and carries on.', src: 'Quaternius Ultimate Animated Characters (CC0)' },
  { name: 'Interiors (simplified)', how: '9 cut-away rooms incl. teal kitchen (chip pan fire) and kitchen diner, all 13–48k tris and under 1 MB for iPad.', src: 'Rooms FBX' },
  { name: 'Spinning rotors', how: 'Helicopter main + tail rotor and the drone\'s four props are separate parts and spin in the 3D town. The drone is red on top, charcoal below.', src: 'Split from the source files' },
  { name: 'Cones, barriers, billboards, bus stop, helipad', how: 'Converted and ready for incident cordons and rooftops', src: 'SimplePoly City' },
];
export const MISSING = [
  { p: 'Must', name: 'Licence check', why: 'Rgsdev and Quaternius are CC0. SimplePoly City, LowPoly City, the FBX buildings, cartoon cars, PolyPack boats, helicopter, drone and the rooms FBX need checking before the public repo.', src: 'Check each store page' },
  { p: 'Should', name: 'Cat clip ranges', why: 'Cat plays one 42 s take. Need frame ranges to split walk / idle / sit.', src: 'From the cat pack author' },
  { p: 'Nice', name: 'Drone texture atlas', why: 'Drone is plain white; T_TextureAtlas.png was not in the upload.', src: 'Drone pack' },
  { p: 'Code', name: 'Fire, smoke, water spray, beacons', why: '15 static hazard props are in (assets/hazards). Moving flames, smoke and water spray are still better as particles.', src: 'We build these in three.js' },
];
