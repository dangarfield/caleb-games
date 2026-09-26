// port-common.js — shared rules & helpers for the port town (1c) and its building panels.
// Owned by the port builder. Pure functions over (career, town); no DOM except flagImg().
import * as W from '../world.js';

export const FLEET_MAX = W.FLEET_MAX; // one limit for buying ships and taking prizes
export const SNEAK_CATCH = 0.3;          // chance of being spotted at the town gate when sneaking in (rolled once per visit)
export const TOWN_CREW = { small: 10, medium: 18, large: 28 };
export const SHIPS_FOR_SALE = {
  small: ['pinnace', 'sloop'],
  medium: ['pinnace', 'sloop', 'barque', 'fluyt'],
  large: ['pinnace', 'sloop', 'barque', 'fluyt', 'merchantman', 'frigate', 'galleon'],
};
export const NEW_SHIP_NAMES = ['The Swift Otter', 'The Jolly Puffin', 'The Lucky Clam', 'The Brave Gull', 'The Merry Dolphin', 'The Red Lobster', 'The Sea Sparrow', 'The Golden Crab', 'The Happy Turtle', 'The Wild Pelican'];
export const UPGRADES = [
  { id: 'copper', name: 'Copper sheathing', note: 'A smooth copper bottom makes the ship faster.', mult: 0.3 },
  { id: 'cotton', name: 'Cotton sails', note: 'Light new sails help the ship turn quicker.', mult: 0.2 },
  { id: 'extraGuns', name: 'Extra gun ports', note: 'Cuts 4 more gun ports and fills them with cannon.', mult: 0.25 },
];
const DAUGHTERS = {
  england: ['Isabella', 'Charlotte', 'Elizabeth', 'Mary', 'Anne', 'Catherine'],
  france: ['Marie', 'Louise', 'Madeleine', 'Hélène', 'Jeanne', 'Claire'],
  holland: ['Johanna', 'Maria', 'Anneke', 'Geertruida', 'Elsje', 'Sara'],
  spain: ['Isabel', 'Catalina', 'Juana', 'Inés', 'Beatriz', 'Leonor'],
  pirate: ['Grace'],
};

// ---------- fleet capacity ----------
export const cls = s => W.SHIP_CLASSES[s.type] || W.SHIP_CLASSES.sloop;
export const cargoCap = c => c.fleet.reduce((a, s) => a + cls(s).cargo, 0);
export const cargoUsed = c => W.GOOD_IDS.reduce((a, g) => a + (c.cargo[g] || 0), 0);
export const crewCap = c => c.fleet.reduce((a, s) => a + cls(s).crewMax, 0);
export const maxGuns = s => cls(s).guns + (s.upgrades && s.upgrades.includes('extraGuns') ? 4 : 0);
export const hullPct = s => Math.round(100 * s.hull / Math.max(1, s.hullMax));

// ---------- money ----------
/** Money you can spend in port: the ship's purse. */
export const money = c => Math.max(0, c.gold || 0);
/** Spend n gold from the purse. Returns false (and spends nothing) if you can't afford it. */
export function spend(c, n) {
  n = Math.max(0, Math.round(n));
  if (money(c) < n) return false;
  c.gold -= n;
  return true;
}
export function prices(c, town, mods) {
  const out = {};
  for (const g of W.GOOD_IDS) out[g] = W.priceAt(town, g, { bonus: mods.tradeBonus, mult: mods.priceMult, day: c.elapsed });
  return out;
}
export const foodPrice = (town, mods) => Math.max(1, Math.round((1.4 + town.wealth * 0.35) * mods.priceMult / (1 + mods.tradeBonus))); // per unit (1 unit feeds 30 men for a day)
export function repairCost(s, mods) {
  const k = cls(s).price * mods.priceMult;
  const hullFrac = 1 - s.hull / Math.max(1, s.hullMax), sailFrac = (100 - (s.sails == null ? 100 : s.sails)) / 100;
  return Math.round(hullFrac * k * 0.45 + sailFrac * k * 0.1);
}
export const gunPrice = mods => Math.round(60 * mods.priceMult);
export const upgradePrice = (s, u, mods) => Math.max(200, Math.round(cls(s).price * u.mult * mods.priceMult / 10) * 10);
export const shipPrice = (type, mods) => Math.round(W.SHIP_CLASSES[type].price * mods.priceMult / 10) * 10;
export const sellShipPrice = (s, mods) => Math.round(cls(s).price * 0.5 * (0.4 + 0.6 * s.hull / Math.max(1, s.hullMax)) / 10) * 10;

// ---------- per-town memory (persisted in career.portMemo[townId]) ----------
export function memo(c, townId) {
  if (!c.portMemo) c.portMemo = {};
  return c.portMemo[townId] || (c.portMemo[townId] = {});
}

// ---------- hostility & standing ----------
export const townNation = (c, town) => W.townInfo(town, c).nation;
export function isHostile(c, town) {
  const n = townNation(c, town);
  if (n === c.nation) return false;
  return W.relation(c.nation, n, c.relations || W.RELATIONS_1660) === 'war' || (c.standing[n] != null && c.standing[n] <= -40);
}
/** "Fame with a nation": the smaller of your fame and your standing with them (Charm helps). */
export function nationFame(c, n, mods) {
  const s = Math.max(0, c.standing[n] || 0);
  return Math.floor(Math.min(c.fame, s) * (mods.charm > 1 ? 1.25 : 1));
}
export function nextTitle(c, n) {
  const cur = c.titles[n] ? W.titleIndex(c.titles[n]) : -1;
  return cur + 1 < W.TITLES.length ? { index: cur + 1, ...W.TITLES[cur + 1] } : null;
}
export function standingText(c, n) {
  if (c.titles[n]) return `A ${c.titles[n]}`;
  const s = c.standing[n] || 0;
  if (n === c.nation && s >= 0) return s >= 50 ? 'A national hero' : 'One of their own';
  if (s >= 50) return 'A hero';
  if (s >= 20) return 'A good friend';
  if (s >= 5) return 'A friend';
  if (s > -10) return 'A stranger';
  if (s > -40) return 'A troublemaker';
  return `Wanted · ${(Math.round(-s * 50 / 100) * 100).toLocaleString('en-GB')} gold`;
}
export function weatherText(c) {
  const s = c.wind ? c.wind.strength : 'fresh';
  return s === 'light' ? 'Calm and sunny' : s === 'strong' ? 'Windy weather' : 'Fair weather';
}

// ---------- family, maps, rumours ----------
export const pendingRescues = (c, townId) => c.family.filter(f => !f.found && f.clues >= 4 && f.townId === townId);
/** The family member the tavern stranger can tell you about (null if none / already told here recently). */
export function clueFor(c, townId) {
  const m = memo(c, townId);
  if (m.clueDay != null && c.elapsed - m.clueDay < 45) return null;
  const open = c.family.filter(f => !f.found && f.clues < 4);
  if (!open.length) return null;
  open.sort((a, b) => b.clues - a.clues); // keep pushing the nearest-to-found member
  return open[0];
}
/** A treasure map piece a traveller in this tavern will sell → {quest, index, price} or null. */
export function fragmentForSale(c, townId) {
  for (const q of W.TREASURE_QUESTS) {
    const have = c.mapFragments[q.id] || [false, false, false, false];
    if ((c.treasuresFound || []).includes(q.id)) continue;
    const i = q.sources.findIndex((s, k) => s.kind === 'tavern' && s.townId === townId && !have[k]);
    if (i >= 0) return { quest: q, index: i, price: Math.round(q.gold * 0.05 / 10) * 10 };
  }
  return null;
}
/** A treasure map piece this town's governor is keeping → {quest, index, price} or null. */
export function fragmentFromGovernor(c, townId) {
  for (const q of W.TREASURE_QUESTS) {
    const have = c.mapFragments[q.id] || [false, false, false, false];
    if ((c.treasuresFound || []).includes(q.id)) continue;
    const i = q.sources.findIndex((s, k) => s.kind === 'governor' && s.townId === townId && !have[k]);
    if (i >= 0) return { quest: q, index: i, price: Math.round(q.gold * 0.08 / 10) * 10 };
  }
  return null;
}
export function daughterName(town, nation) {
  const list = DAUGHTERS[nation] || DAUGHTERS.england;
  return list[town.seed % list.length];
}
export function romanceText(v) {
  return v >= 80 ? 'She adores you!' : v >= 55 ? 'She is very fond of you.' : v >= 30 ? 'She enjoys your stories.' : v > 0 ? 'She smiles politely.' : "She hasn't noticed you yet.";
}
export function warNews(c) {
  const rel = c.relations || W.RELATIONS_1660, wars = [], ids = W.NATION_IDS;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
    if (W.relation(ids[i], ids[j], rel) === 'war') wars.push(`${W.NATIONS[ids[i]].name} and ${W.NATIONS[ids[j]].name} are at war.`);
  const calm = ids.filter(n => !ids.some(o => o !== n && W.relation(n, o, rel) === 'war'));
  if (calm.length) wars.push(`${calm.map(n => W.NATIONS[n].name).join(' and ')} ${calm.length > 1 ? 'are' : 'is'} at peace with everyone.`);
  return wars;
}
/** All the rumours this tavern knows (strings). Deterministic per town and month. */
export function rumours(c, town) {
  const out = [];
  const caught = c.villainsCaught || [];
  for (const v of W.VILLAINS) if (!caught.includes(v.id)) {
    const t = W.townById(v.haunt);
    out.push(`The pirate ${v.name} was seen near ${t.name}, sailing a ${W.SHIP_CLASSES[v.ship].name.toLowerCase()} called the ${v.shipName}.`);
  }
  for (const q of W.TREASURE_QUESTS) {
    if ((c.treasuresFound || []).includes(q.id)) continue;
    const have = c.mapFragments[q.id] || [];
    q.sources.forEach((s, i) => { if (!have[i]) out.push(`A piece of the map to the ${q.name.replace(/^The /, '')}? ${s.hint}.`); });
  }
  for (const g of W.GOOD_IDS) {
    const makers = W.TOWNS.filter(t => t.produces === g && t.id !== town.id);
    if (makers.length) out.push(`${W.GOODS[g].name} is cheap in ${makers[(town.seed + g.length) % makers.length].name}, where they make it.`);
  }
  out.push(...warNews(c).filter(s => s.includes('war')).map(s => `Sailors grumble: "${s}"`));
  out.push('The Spanish treasure galleons sail heavy and slow. Only a brave captain would try to catch one!');
  // shuffle deterministically
  const r = W.rng(town.seed + Math.floor(c.elapsed / 30) * 7919);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ---------- flags ----------
const flagCache = {};
export function flagURL(PLT, nation) {
  if (flagCache[nation] !== undefined) return flagCache[nation];
  try { const tx = PLT && PLT.textures && PLT.textures.flag(nation); flagCache[nation] = tx && tx.image && tx.image.toDataURL ? tx.image.toDataURL() : null; }
  catch (e) { flagCache[nation] = null; }
  return flagCache[nation];
}
