// state.js — save model, careers, calendar, ageing/health, settings. Store = IndexedDB via arcade-store.js.
import * as W from './world.js';

const Store = window.ArcadeStore('peg-leg-ted'); // key calebArcadeData:peg-leg-ted — the game's old name, kept so existing careers carry over
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0;

export const SLOTS = ['caleb', 'ezra'];
export const SLOT_NAMES = { caleb: 'Caleb', ezra: 'Ezra' };
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DEFAULT_SETTINGS = { music: 35, sfx: 100, steerHand: 'left', buttonSize: 'standard', battleSpeed: 'normal', captions: true, debug: false };
const START = { y: 1660, m: 6, d: 1 }; // 1 June 1660
const START_AGE = 20;

export function defaultSave() {
  return { v: 1, active: null, slots: { caleb: { career: null, topScore: null }, ezra: { career: null, topScore: null } }, settings: { ...DEFAULT_SETTINGS } };
}

/** The whole save record. state.data.slots.caleb.career etc. */
export let data = defaultSave();

export function ready(cb) { Store.ready(() => cb()); }
export function load() {
  const d = Store.get();
  if (d && typeof d === 'object' && d.slots) {
    gen = d.gen || 0;
    const base = defaultSave();
    data = { ...base, ...d, slots: { ...base.slots, ...d.slots }, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}), steerHand: 'left', buttonSize: 'standard', battleSpeed: 'normal', debug: false } }; // those three options were removed
    delete data.gen; delete data.sid; delete data.__guard;
    // new volume defaults (Dan): a save still on the old untouched defaults (70/85) moves to 35/100, once
    if (!data.settings.volV2) { if (data.settings.music === 70) data.settings.music = 35; if (data.settings.sfx === 85) data.settings.sfx = 100; data.settings.volV2 = true; }
    for (const s of SLOTS) data.slots[s] = { career: null, topScore: null, ...(data.slots[s] || {}) };
    for (const s of SLOTS) if (data.slots[s].career) migrateCareer(data.slots[s].career);
  } else data = defaultSave();
  return data;
}
/** Bring older saves up to the current shape (lists of ids, fields added by later modes). */
function migrateCareer(c) {
  for (const k of ['villainsCaught', 'treasuresFound']) {
    const v = c[k];
    if (Array.isArray(v)) continue;
    const n = Math.max(0, Math.floor(+v || 0)); // an old numeric count: keep the count with placeholder ids
    c[k] = Array.from({ length: n }, (_, i) => `legacy-${k}-${i + 1}`);
  }
  if (typeof c.fortune === 'number') { c.gold = (c.gold || 0) + c.fortune; delete c.fortune; } // no more gold ashore (Dan): it all goes in the purse
  if (typeof c.lastCheer !== 'number') { c.lastCheer = typeof c.lastDivision === 'number' ? c.lastDivision : (c.elapsed || 0); delete c.lastDivision; }
  c.difficulty = 'journeyman'; // one difficulty only (Dan): the second of the original four
  if (c.cargo && 'tobacco' in c.cargo) { c.cargo.cocoa = (c.cargo.cocoa || 0) + (c.cargo.tobacco || 0); delete c.cargo.tobacco; } // Tobacco became Cocoa
  if (!c.stats) c.stats = { shipsTaken: 0, shipsSunk: 0, duelsWon: 0 };
  if (!c.letters) c.letters = {};
  if (!c.romance) c.romance = {};
  if (!c.towns) c.towns = {};
  if (!c.relations) c.relations = { ...W.RELATIONS_1660 };
  if (!c.mapFragments) c.mapFragments = {};
  for (const q of W.TREASURE_QUESTS) if (!Array.isArray(c.mapFragments[q.id])) c.mapFragments[q.id] = [false, false, false, false];
}
/** Write now (memory; IndexedDB flush follows ~120ms). Returns false if another tab owns the save. */
export function save() {
  if (Store.conflict()) return false;
  gen += 1;
  Store.set(null, Object.assign({}, data, { gen, sid: SID }), { guard: true });
  return true;
}
let lastAuto = 0;
/** Throttled save (call often; writes at most every `ms`). */
export function autosave(ms = 20000) { const n = performance.now(); if (n - lastAuto < ms) return false; lastAuto = n; return save(); }
export const flush = () => Store.flush();
export const conflict = () => Store.conflict();
export const storageWorking = () => Store.working();

// ---------- settings ----------
export const settings = () => data.settings;
export function setSetting(key, value) { data.settings[key] = value; save(); return data.settings; }

// ---------- slots / careers ----------
export const slot = id => data.slots[id];
export const activeSlot = () => data.active;
export const career = () => (data.active && data.slots[data.active] ? data.slots[data.active].career : null);
export function setActive(id) { data.active = id; return career(); }

/**
 * New career in slot ('caleb'|'ezra'). opts = {nation, difficulty, skill} (ids from world).
 * Replaces any saved career in that slot, makes it active, and saves.
 */
export function newCareer(slotId, { nation = 'england', difficulty = 'journeyman', skill = 'fencing' } = {}) {
  const diff = W.difficultyById(difficulty);
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const r = W.rng(seed);
  const home = W.townById(W.HOME_PORT[nation]);
  const standing = {}, titles = {};
  for (const n of W.NATION_IDS) { standing[n] = n === nation ? 20 : W.relation(nation, n) === 'war' ? -10 : 0; titles[n] = null; }
  // family: each held in a random town that isn't the home port
  const pool = W.TOWNS.filter(t => t.id !== home.id);
  const family = W.FAMILY.map(f => ({ id: f.id, name: f.name, relation: f.relation, clues: 0, found: false, townId: W.pick(r, pool).id }));
  const mapFragments = {}; for (const q of W.TREASURE_QUESTS) mapFragments[q.id] = [false, false, false, false];
  const cls = W.SHIP_CLASSES.sloop;
  const c = {
    slot: slotId, name: SLOT_NAMES[slotId], seed,
    startDate: { ...START }, date: { ...START }, elapsed: 0, // days since the career began
    age: START_AGE, health: 'Good', agePts: 100, wounds: 0,
    nation, difficulty: diff.id, skill,
    gold: diff.startGold,        // the ship's purse: all your money, and what the final score counts
    landAcres: 0, titles, standing, relations: { ...W.RELATIONS_1660 },
    fleet: [{ id: 'flag', name: W.PLAYER_SHIP_NAME, type: 'sloop', hull: cls.hull, hullMax: cls.hull, sails: 100, guns: cls.guns, upgrades: [] }],
    cargo: { sugar: 0, cocoa: 0, spices: 0, hides: 0 },
    crew: 40, morale: 80, food: 60, fame: 0, lastCheer: 0,
    family, mapFragments, treasuresFound: [], villainsCaught: [], wife: null, romance: {}, letters: {},
    towns: {},                   // per-town overrides {townId:{nation, garrison, wealth, pop}}
    wind: W.initWind(r),
    log: [],
    position: W.departurePoint(home),
    location: { kind: 'sea', townId: home.id },
    stats: { shipsTaken: 0, shipsSunk: 0, duelsWon: 0 },
  };
  data.slots[slotId].career = c;
  data.active = slotId;
  addLog(`Set sail from ${home.name} aboard ${W.PLAYER_SHIP_NAME} with 40 crew, sailing for ${W.NATIONS[nation].name}.`, c);
  save();
  return c;
}
/** End the active (or given) career: records top score, clears career. */
export function endCareer(slotId = data.active, points = 0) {
  const s = data.slots[slotId]; if (!s) return;
  const age = s.career ? s.career.age : 0;
  if (!s.topScore || points > s.topScore.points) s.topScore = { points, retiredAge: age };
  s.career = null; if (data.active === slotId) data.active = null;
  save();
  return s.topScore;
}

// ---------- calendar ----------
function toUTC(d) { return Date.UTC(d.y, d.m - 1, d.d); }
function fromUTC(ms) { const x = new Date(ms); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; }
export function addDaysToDate(d, n) { return fromUTC(toUTC(d) + Math.round(n) * 86400000); }
export const fmtDate = d => `${MONTHS[d.m - 1]} ${d.y}`;          // "June 1660"
export const fmtDateLong = d => `${d.d} ${MONTHS[d.m - 1]} ${d.y}`; // "1 June 1660"

/** Age-based health decline per day (points of 100). */
function ageRate(age) { return age < 35 ? 0 : age < 45 ? 0.004 : age < 55 ? 0.01 : 0.02; }
export function healthLabel(pts) { return pts >= 67 ? 'Good' : pts >= 34 ? 'Fair' : 'Poor'; }

/**
 * Advance the calendar n days (fractions allowed; the date moves in whole days).
 * opts.atSea: eat food and let morale drift. Returns an array of events:
 *  {type:'birthday',age} {type:'health',from,to} {type:'wind'} {type:'starving'} {type:'hungry'}
 *  {type:'retirePrompt'} (past 55) {type:'forcedRetire'} (past 60, rare)
 */
export function advanceDays(n, { atSea = false } = {}, c = career()) {
  const ev = []; if (!c || n <= 0) return ev;
  const before = Math.floor(c.elapsed);
  c.elapsed += n;
  const whole = Math.floor(c.elapsed) - before;
  if (whole > 0) c.date = addDaysToDate(c.date, whole);
  const newAge = START_AGE + Math.floor(c.elapsed / 365.25);
  // health: age decline (Medicine halves it) and wounds heal slowly
  const oldH = c.health;
  c.agePts = Math.max(0, c.agePts - ageRate(c.age) * n * (c.skill === 'medicine' ? 0.5 : 1));
  c.wounds = Math.max(0, c.wounds - 0.25 * n);
  c.health = healthLabel(c.agePts - c.wounds);
  if (c.health !== oldH) ev.push({ type: 'health', from: oldH, to: c.health });
  if (newAge !== c.age) {
    c.age = newAge; ev.push({ type: 'birthday', age: newAge });
    if (newAge >= 55) ev.push({ type: 'retirePrompt' });
    if (newAge >= 60 && Math.random() < 0.35) ev.push({ type: 'forcedRetire' });
  }
  if (c.wind && W.stepWind(c.wind, c.elapsed)) ev.push({ type: 'wind' });
  if (atSea) {
    const hadFood = c.food > 0, daysBefore = foodDays(c);
    c.food = Math.max(0, c.food - (c.crew / 30) * n);
    if (c.food <= 0) { c.morale = Math.max(0, c.morale - 3 * n); if (hadFood) ev.push({ type: 'starving' }); }
    else if (daysBefore >= 5 && foodDays(c) < 5) ev.push({ type: 'hungry' });
    const since = c.elapsed - (c.lastCheer || 0); // days since the crew last had a round bought for them
    c.morale = Math.max(0, c.morale - (since > 120 ? 0.25 : since > 60 ? 0.12 : 0.04) * n);
  }
  return ev;
}
export const foodDays = (c = career()) => (c && c.crew > 0 ? Math.floor(c.food / (c.crew / 30)) : 99);
/** Wound the captain (duel losses etc.). amount in health points. */
export function wound(amount, c = career()) { if (!c) return; c.wounds += amount; c.health = healthLabel(c.agePts - c.wounds); }

// ---------- derived values ----------
export function moraleLabel(m) { return m >= 70 ? 'Happy' : m >= 45 ? 'Content' : m >= 25 ? 'Grumbling' : 'Mutinous'; }
export const flagship = (c = career()) => (c ? c.fleet[0] : null);
/** Highest title across nations → {name, nation, index} or null */
export function highestTitle(c = career()) {
  let best = null;
  if (c) for (const n of W.NATION_IDS) { const t = c.titles[n]; if (!t) continue; const i = W.titleIndex(t); if (!best || i > best.index) best = { name: t, nation: n, index: i }; }
  return best;
}
/** "Baron of England" / "Privateer of England" / "No career yet" */
export function rankText(c) {
  if (!c) return 'No career yet';
  const t = highestTitle(c);
  return t ? `${t.name} of ${W.NATIONS[t.nation].name}` : `Privateer of ${W.NATIONS[c.nation].name}`;
}
/** Captain portrait for a slot at an age: images/captain-<slot>-young|old.webp (old from 45). */
export const captainPic = (slot, age = 20) => `captain-${slot === 'ezra' ? 'ezra' : 'caleb'}-${age >= 45 ? 'old' : 'young'}`;
/** Gameplay multipliers from skill, age and difficulty. */
export function modifiers(c = career()) {
  if (!c) return { duelWindow: 1, reload: 1, sailSpeed: 1, tradeBonus: 0, charm: 1, enemySkill: 0.7, priceMult: 1 };
  const d = W.difficultyById(c.difficulty);
  const ageSlow = c.age >= 50 ? 0.8 : c.age >= 40 ? 0.9 : 1;
  return {
    duelWindow: ageSlow * (c.skill === 'fencing' ? 1.2 : 1), // multiply the player's action window length
    reload: c.skill === 'gunnery' ? 0.75 : 1,                 // multiply reload time
    sailSpeed: c.skill === 'navigation' ? 1.1 : 1,
    tradeBonus: c.skill === 'wit' ? 0.15 : 0,
    charm: c.skill === 'wit' ? 1.5 : 1,                       // governors like you faster
    enemySkill: d.enemySkill, priceMult: d.priceMult,
  };
}
export function addLog(text, c = career()) { if (!c) return; c.log.unshift({ date: { ...c.date }, t: text }); if (c.log.length > 200) c.log.length = 200; }
export function addFame(n, c = career()) { if (c) c.fame = Math.max(0, c.fame + n); }
export function changeStanding(nation, delta, c = career()) { if (c && c.standing[nation] != null) c.standing[nation] = Math.max(-100, Math.min(100, c.standing[nation] + delta)); }
/** One-line summary used by the title warning: "age 34, June 1664" */
export const summary = c => (c ? `age ${c.age}, ${fmtDate(c.date)}` : '');
/** Location label for cards: "Port Royal" / "Off Tortuga" */
export function locationText(c) {
  if (!c) return '';
  if (c.location && c.location.kind === 'port') { const t = W.townById(c.location.townId); return t ? t.name : ''; }
  return W.placeName(c.position.x, c.position.z);
}
