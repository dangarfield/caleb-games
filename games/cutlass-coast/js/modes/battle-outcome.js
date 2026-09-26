// battle-outcome.js — applies ship-battle results to the career (battle owns battle outcomes).
// apply(ctx, career, type, data) mutates `career` and returns { title, sub, lines:[[k,v,cls?]], notes:[], message }.
// Deterministic per enemy (seeded by enemy.id) so a dry run on a cloned career previews exactly what will happen.

const FAME = { merchant: 2, smuggler: 3, privateer: 4, pirate: 5, warship: 6, treasure: 8 };
const JOIN = { merchant: 0.25, treasure: 0.2, smuggler: 0.35, privateer: 0.3, pirate: 0.45, warship: 0.15 };
import { FLEET_MAX } from '../world.js';
export const MAX_FLEET = FLEET_MAX;

export function holdCapacity(W, c, extraType) {
  let cap = 0; for (const f of c.fleet) cap += (W.SHIP_CLASSES[f.type] || W.SHIP_CLASSES.sloop).cargo;
  if (extraType) cap += W.SHIP_CLASSES[extraType].cargo;
  return cap;
}
export const cargoUsed = c => Object.values(c.cargo).reduce((s, v) => s + (v || 0), 0);
function crewCapacity(W, c, extraType) {
  let cap = 0; for (const f of c.fleet) cap += (W.SHIP_CLASSES[f.type] || W.SHIP_CLASSES.sloop).crewMax;
  if (extraType) cap += W.SHIP_CLASSES[extraType].crewMax;
  return cap;
}
/** Can the player crew the prize as an extra ship? (after joiners) */
export function canCrewPrize(W, c, enemy) {
  if (c.fleet.length >= MAX_FLEET) return { ok: false, why: 'Your fleet is full' };
  const join = joiners(W, c, enemy, true);
  const need = 10 * (c.fleet.length + 1);
  return (c.crew + join) >= need ? { ok: true } : { ok: false, why: `You need ${need} crew to sail ${c.fleet.length + 1} ships` };
}
function joiners(W, c, enemy, withPrize) {
  const n = Math.round(Math.max(0, enemy.crew) * (JOIN[enemy.kind] || 0.25));
  return Math.max(0, Math.min(n, crewCapacity(W, c, withPrize ? enemy.type : null) - c.crew));
}
const fmtN = n => Math.round(n).toLocaleString('en-GB');

/** Standing: angers the enemy nation, pleases its enemies. Pirates please everyone a little. */
function standing(ctx, c, enemy, amount, notes) {
  const S = ctx.state, W = ctx.world;
  if (enemy.nation === 'pirate') {
    for (const n of W.NATION_IDS) S.changeStanding(n, n === c.nation ? 4 : 2, c);
    notes.push('Every nation is glad to see pirates beaten.');
    return;
  }
  S.changeStanding(enemy.nation, -amount, c);
  const pleased = W.NATION_IDS.filter(n => n !== enemy.nation && W.relation(n, enemy.nation, c.relations) === 'war');
  // Your own nation and any nation whose letter of marque you carry reward you extra (keeps titles reachable).
  for (const n of pleased) S.changeStanding(n, 3 + (n === c.nation || (c.letters && c.letters[n] && (c.letters[n].against || []).includes(enemy.nation)) ? 3 : 0), c);
  notes.push(`${W.NATIONS[enemy.nation].name} is angry with you` + (pleased.length ? `, but ${pleased.map(n => W.NATIONS[n].name).join(' and ')} ${pleased.length > 1 ? 'are' : 'is'} pleased.` : '.'));
}

const questDone = (c, id) => Array.isArray(c.treasuresFound) && c.treasuresFound.includes(id);

/** Villain beaten → caught, fame, map fragment; plus a family clue. */
function villainRewards(ctx, c, enemy, notes, r) {
  const W = ctx.world, v = W.VILLAINS.find(x => x.id === enemy.villainId);
  if (!v) return 0;
  if (!Array.isArray(c.villainsCaught)) c.villainsCaught = [];
  if (!c.villainsCaught.includes(v.id)) c.villainsCaught.push(v.id);
  notes.push(`You caught ${v.name}! The Caribbean is safer tonight.`);
  if (v.fragment && !questDone(c, v.fragment.questId) && c.mapFragments[v.fragment.questId] && !c.mapFragments[v.fragment.questId][v.fragment.index]) {
    c.mapFragments[v.fragment.questId][v.fragment.index] = true;
    const q = W.questById(v.fragment.questId);
    notes.push(`In his sea chest: a piece of the map to ${q ? q.name : 'a treasure'}!`);
    ctx.state.addLog(`Found a map piece (${q ? q.name : 'treasure'}) aboard ${enemy.name}.`, c);
  }
  familyClue(ctx, c, notes, r, 1);
  return v.fame;
}
function familyClue(ctx, c, notes, r, chance) {
  if (r() >= chance) return;
  const m = c.family.find(f => !f.found && f.clues < 4);
  if (!m) return;
  m.clues += 1;
  const text = ctx.world.familyClue(m, m.townId, m.clues);
  notes.push(`The captain's letters mention your family: ${text}`);
  ctx.state.addLog(`Clue: ${text}`, c);
}
function shipFragment(ctx, c, enemy, notes, r) {
  const W = ctx.world;
  for (const q of W.TREASURE_QUESTS) q.sources.forEach((src, i) => {
    if (src.kind !== 'ship' || src.shipKind !== enemy.kind || questDone(c, q.id) || !c.mapFragments[q.id] || c.mapFragments[q.id][i]) return;
    if (r() < 0.45) {
      c.mapFragments[q.id][i] = true;
      notes.push(`Rolled up in the captain's cabin: a piece of the map to ${q.name}!`);
      ctx.state.addLog(`Found a map piece (${q.name}) aboard ${enemy.name}.`, c);
    }
  });
}

/**
 * type: 'capture' | 'sink' | 'escape' | 'defeat'
 * data: { enemy, addFleet?, surrendered?, afterDuel?, who? ('player'|'enemy' for escape), sunk? (player ship sank) }
 */
export function apply(ctx, c, type, data) {
  const W = ctx.world, S = ctx.state, e = data.enemy;
  const r = W.rng(W.hash(String(e.id || e.name)));
  const cls = W.SHIP_CLASSES[e.type] || W.SHIP_CLASSES.sloop;
  const notes = [], lines = [];
  const desc = W.describeShip(e).title;
  if (!c.stats) c.stats = { shipsTaken: 0, shipsSunk: 0, duelsWon: 0 };
  let out;

  if (type === 'capture') {
    if (data.afterDuel) { // the boarding fight leaves some of your crew too battered to sail on
      const hurt = Math.min(Math.round(c.crew * 0.25), Math.round(e.crew * 0.1) + 1);
      if (hurt > 0) { c.crew = Math.max(4, c.crew - hurt); notes.push(`${hurt} of your crew are too bruised to carry on and go home to rest.`); }
    }
    const addFleet = !!data.addFleet && canCrewPrize(W, c, e).ok;
    const swapAt = !addFleet && Number.isInteger(data.swapIndex) && data.swapIndex >= 0 && data.swapIndex < c.fleet.length ? data.swapIndex : -1;
    const join = joiners(W, c, e, addFleet);
    const prize = () => ({ id: 'prize' + String(e.id || '').slice(-6) + c.fleet.length, name: e.name, type: e.type, hull: Math.max(Math.round((e.hullMax || cls.hull) * 0.35), Math.round(e.hull || cls.hull)), hullMax: e.hullMax || cls.hull, sails: Math.max(40, Math.round(Number.isFinite(e.sails) ? e.sails : 100)), guns: e.guns || cls.guns, upgrades: [] });
    if (addFleet) c.fleet.push(prize());
    if (swapAt >= 0) { // fleet full: trade one of your ships for the prize — anything that no longer fits in the hold goes overboard
      const old = c.fleet[swapAt], oldCls = W.SHIP_CLASSES[old.type] || W.SHIP_CLASSES.sloop;
      c.fleet[swapAt] = prize();
      let over = cargoUsed(c) - holdCapacity(W, c), lost = 0;
      for (const g of [...W.GOOD_IDS].sort((a, b) => (c.cargo[b] || 0) - (c.cargo[a] || 0))) { if (over <= 0) break; const n = Math.min(over, c.cargo[g] || 0); c.cargo[g] -= n; over -= n; lost += n; }
      lines.push(['Swapped', `${old.name} (${oldCls.name}) → ${e.name}`, '']);
      if (lost > 0) notes.push(`${lost} tons of cargo wouldn't fit in the new fleet and went over the side.`);
      notes.push(`You leave ${old.name} adrift for her crew to sail home.`);
    }
    c.gold += e.gold || 0;
    lines.push(['Gold', `+${fmtN(e.gold || 0)}`, 'good']);
    let free = Math.max(0, holdCapacity(W, c) - cargoUsed(c));
    const taken = [], left = [];
    for (const g of W.GOOD_IDS) {
      const have = (e.cargo && e.cargo[g]) || 0; if (!have) continue;
      const n = Math.min(have, free); free -= n;
      if (n > 0) { c.cargo[g] = (c.cargo[g] || 0) + n; taken.push(`${n} ${W.GOODS[g].name.toLowerCase()}`); }
      if (n < have) left.push(W.GOODS[g].name.toLowerCase());
    }
    lines.push(['Cargo', taken.length ? taken.join(', ') : 'None aboard']);
    if (left.length) notes.push(`Your hold is full, so some ${left.join(' and ')} is left behind.`);
    if (join > 0) { c.crew += join; lines.push(['Crew', `+${join} ${join === 1 ? 'sailor joins' : 'sailors join'} you`, 'good']); }
    let fame = FAME[e.kind] || 3;
    fame += villainRewards(ctx, c, e, notes, r);
    if (!e.villainId) { shipFragment(ctx, c, e, notes, r); familyClue(ctx, c, notes, r, 0.3); }
    S.addFame(fame, c); lines.push(['Fame', `+${fame}`, 'good']);
    standing(ctx, c, e, 6, notes);
    lines.push(['Prize ship', addFleet ? `${e.name} joins your fleet` : swapAt >= 0 ? `${e.name} takes her place in your fleet` : 'You let her sail away']);
    c.morale = Math.min(100, c.morale + 8);
    c.stats.shipsTaken++;
    S.addLog(`Captured the ${desc} ${e.name} (${fmtN(e.gold || 0)} gold)${addFleet ? ' and added her to the fleet' : ''}.`, c);
    const how = data.afterDuel ? `You won the duel and ${e.captain || 'her captain'} hands over his sword.` : data.surrendered ? `${e.name} strikes her colours! Her crew surrender.` : `${e.name} is yours.`;
    out = { title: 'Prize taken!', sub: how, message: `Prize taken! ${e.name}: +${fmtN(e.gold || 0)} gold.` };
  } else if (type === 'sink') {
    let fame = Math.ceil((FAME[e.kind] || 3) / 2) + 1;
    fame += villainRewards(ctx, c, e, notes, r);
    S.addFame(fame, c); lines.push(['Plunder', 'None. Her hold is at the bottom of the sea.']); lines.push(['Fame', `+${fame}`, 'good']);
    standing(ctx, c, e, 4, notes);
    notes.push('Her crew row away in the boats and swim for the nearest shore.');
    c.morale = Math.min(100, c.morale + 3);
    c.stats.shipsSunk++;
    S.addLog(`Sank the ${desc} ${e.name}.`, c);
    out = { title: "She's going down!", sub: `${e.name} slips beneath the waves in a cloud of smoke.`, message: `You sank ${e.name}. +${fame} fame.` };
  } else if (type === 'escape') {
    if (data.who === 'enemy') {
      notes.push('Mend the sails and try again another day.');
      S.addLog(`The ${desc} ${e.name} escaped.`, c);
      out = { title: 'She got away', sub: `${e.name} slipped over the horizon.`, message: `${e.name} got away.` };
    } else {
      S.addLog(`Slipped away from the ${desc} ${e.name}.`, c);
      out = { title: 'Escaped!', sub: `You left ${e.name} far behind.`, message: `You escaped from ${e.name}.` };
    }
  } else { // defeat
    const lostGold = Math.round(c.gold * 0.5);
    c.gold -= lostGold;
    const flag = c.fleet[0];
    const capAll = holdCapacity(W, c), capFlag = flag ? (W.SHIP_CLASSES[flag.type] || cls).cargo : capAll;
    const frac = c.fleet.length <= 1 || capAll <= 0 ? 1 : Math.min(1, capFlag / capAll);
    let lostTons = 0;
    for (const g of W.GOOD_IDS) { const n = Math.round((c.cargo[g] || 0) * frac); c.cargo[g] -= n; lostTons += n; }
    const lostShip = flag ? flag.name : 'your ship';
    c.fleet.shift();
    const crewBefore = c.crew;
    c.crew = Math.max(12, Math.round(c.crew * 0.6));
    let gift = false;
    if (!c.fleet.length) {
      gift = true;
      c.fleet.push({ id: 'gift' + Date.now().toString(36), name: 'The Second Chance', type: 'sloop', hull: 36, hullMax: W.SHIP_CLASSES.sloop.hull, sails: 70, guns: 4, upgrades: [] });
    }
    c.crew = Math.min(c.crew, crewCapacity(W, c));
    c.morale = Math.max(0, c.morale - 15);
    if (data.afterDuel) S.wound(8, c);
    lines.push(['Ship lost', lostShip, 'bad']);
    lines.push(['Gold', `−${fmtN(lostGold)}`, 'bad']);
    lines.push(['Cargo', lostTons ? `−${lostTons} tons` : 'Nothing to lose', lostTons ? 'bad' : '']);
    if (crewBefore > c.crew) lines.push(['Crew', `${c.crew} still with you`]);
    notes.push(gift ? `${e.captain || 'Their captain'} is a fair sort. He sets you free with a leaky little sloop, The Second Chance.` : `You are set free and row over to ${c.fleet[0].name}, now your flagship.`);
    S.addLog(`Beaten by the ${desc} ${e.name}. Lost ${lostShip} and ${fmtN(lostGold)} gold.`, c);
    const how = data.afterDuel ? `You lost the duel. ${e.captain || 'Their captain'} takes your sword with a bow.` : data.sunk ? `${lostShip} is holed and sinking. The ${e.name} fishes your crew out of the water.` : 'You are outgunned and must strike your colours.';
    out = { title: 'Captured!', sub: how, message: `Captured by ${e.name}. You lost ${lostShip}, but you're free to sail again.` };
  }
  return Object.assign(out, { lines, notes });
}
