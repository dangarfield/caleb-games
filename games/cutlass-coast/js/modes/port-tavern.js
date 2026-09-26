// port-tavern.js — Tavern: hire sailors, rumours, the stranger with a family clue, map pieces for sale.
import * as PC from './port-common.js';

const ROUND = 10; // gold for a round of drinks after the first free rumour
const CREW_ROUNDS = 3, CREW_CHEER = 12; // Dan: buy the crew a round, up to 3 times per port visit
export const crewRoundCost = c => Math.max(15, Math.round((c.crew || 0) * 2));

/** Sailors willing to sign on right now (before the ship-space limit). */
export function hirePool(P) {
  const { c, town: t } = P, m = PC.memo(c, t.id);
  if (m.hireDay == null || c.elapsed - m.hireDay >= 30) { m.hireDay = c.elapsed; m.hired = 0; }
  let n = (PC.TOWN_CREW[t.size] || 12) + Math.floor(c.fame / 4);
  if (c.morale < 45) n = Math.floor(n / 2);
  if (P.sneak) n = Math.floor(n / 2);
  return Math.max(0, n - (m.hired || 0));
}

export default {
  title: P => ({ title: P.sneak ? 'The Tavern (in disguise)' : 'The Tavern', sub: `The ${tavernName(P.town)} · ${P.town.name}` }),
  open(P) { rescue(P); },
  render(P) {
    const { h, c, S } = P;
    // ---- hire crew
    const pool = hirePool(P), space = Math.max(0, PC.crewCap(c) - c.crew), can = Math.min(pool, space);
    const hire = h('div', { class: 'pv-card' },
      h('div', { class: 'label-caps' }, 'SAILORS FOR HIRE'),
      h('div', { class: 'pv-big' }, pool ? pool > 1 ? `${pool} sailors want to join you` : '1 sailor wants to join you' : 'Nobody is looking for a ship today'),
      h('div', { class: 'pv-note' }, space <= 0 ? 'Your ships are full! Buy a bigger ship to carry more crew.'
        : c.morale < 45 ? 'Word is your crew is grumpy, so fewer sailors want to join. Buy them a round to cheer them up.'
        : 'Hiring is free. They just want a fair share of the plunder.'),
      h('div', { class: 'pv-row' },
        h('span', { class: 'pv-crew' }, `Crew ${c.crew} of ${PC.crewCap(c)} · ${S.moraleLabel(c.morale)}`),
        h('div', { class: 'pv-btns' },
          h('button', { class: 'ink-btn sm', disabled: can < 1, onTap: () => hireN(P, Math.min(5, can)) }, `Hire ${Math.max(1, Math.min(5, can))}`),
          h('button', { class: 'gold-btn sm', disabled: can < 1, onTap: () => hireN(P, can) }, can > 0 ? `Hire all ${can}` : 'Hire all'))));

    // ---- buy the crew a round (the only way to cheer them up now there's no Divide Plunder)
    const rounds = P.visit.crewRounds || 0, rc = crewRoundCost(c), maxed = rounds >= CREW_ROUNDS, happy = c.morale >= 100;
    const cheer = h('div', { class: 'pv-card' },
      h('div', { class: 'label-caps' }, 'THE CREW'),
      h('div', { class: 'pv-note' }, P.sneak ? "Your crew can't come ashore here. They'd be recognised."
        : maxed ? "They've had all they can manage for one visit. Come back next time you're in port."
        : `Your crew is ${S.moraleLabel(c.morale).toLowerCase()}. A round of rum keeps them sweet (${CREW_ROUNDS - rounds} left this visit).`),
      h('div', { class: 'pv-row' },
        h('span', { class: 'pv-crew' }, `${c.crew} sailors · ${rc} gold`),
        h('button', { class: 'gold-btn sm', disabled: P.sneak || maxed || happy || PC.money(c) < rc || c.crew < 1, onTap: () => crewRound(P) },
          happy && !maxed ? 'They are as happy as can be' : 'Buy the crew a round')));

    // ---- the stranger (family clue)
    const clue = PC.clueFor(c, P.townId), lost = c.family.filter(f => !f.found);
    const told = P.visit.clueText;
    const stranger = h('div', { class: 'pv-card' },
      h('div', { class: 'label-caps' }, 'THE STRANGER IN THE CORNER'),
      told ? h('div', { class: 'pv-clue' }, told)
        : !lost.length ? h('div', { class: 'pv-note' }, 'Your whole family is safe at home. Well done, Captain!')
        : clue ? [h('div', { class: 'pv-note' }, `A hooded stranger waves you over. "I know something about your ${clue.relation}..."`),
          h('button', { class: 'gold-btn sm', onTap: () => hearClue(P, clue) }, 'Talk to the stranger')]
        : h('div', { class: 'pv-note' }, knownList(P)));

    // ---- rumours
    const heard = P.visit.rumours;
    const cost = P.visit.rumourN === 0 ? 0 : ROUND;
    const talk = h('div', { class: 'pv-card pv-talk' },
      h('div', { class: 'label-caps' }, 'TAVERN TALK'),
      heard.length ? h('div', { class: 'pv-rumours' }, heard.slice(-3).map(r => h('div', { class: 'pv-rumour' }, `“${r}”`)))
        : h('div', { class: 'pv-note' }, 'Sailors swap stories about pirates, treasure and faraway ports.'),
      h('button', { class: 'ink-btn sm', disabled: P.visit.rumourN >= 4 || PC.money(c) < cost, onTap: () => listen(P, cost) },
        P.visit.rumourN >= 4 ? "That's all the gossip for today" : cost ? `Buy the table a drink and listen (${cost} gold)` : 'Listen to the gossip'));

    // ---- map piece for sale
    const frag = PC.fragmentForSale(c, P.townId);
    const map = frag ? h('div', { class: 'pv-card pv-map' },
      h('div', { class: 'label-caps' }, 'A PIECE OF A TREASURE MAP'),
      h('div', { class: 'pv-note' }, `A traveller unrolls a torn scrap of map. "It shows part of the ${frag.quest.name.replace(/^The /, '')}. Yours for ${P.fmt(frag.price)} gold."`),
      h('button', { class: 'gold-btn sm', disabled: PC.money(c) < frag.price, onTap: () => buyFragment(P, frag) }, PC.money(c) < frag.price ? 'Not enough gold' : `Buy it (${P.fmt(frag.price)} gold)`)) : null;

    // ---- sneaking into an enemy town: a clerk sells pardon letters that get you in to see the governor
    const price = pardonPrice(P);
    const pardon = P.sneak ? h('div', { class: 'pv-card pv-pardon' },
      h('div', { class: 'label-caps' }, "A CLERK FROM THE GOVERNOR'S OFFICE"),
      P.visit.pardon ? h('div', { class: 'pv-note' }, 'You carry a signed pardon. The guards will let you in to see the governor on this visit.')
        : [h('div', { class: 'pv-note' }, `"For ${P.fmt(price)} gold I can get you a pardon. Then the governor will see you, just this once."`),
          h('button', { class: 'gold-btn sm', disabled: PC.money(c) < price, onTap: () => buyPardon(P, price) }, PC.money(c) < price ? 'Not enough gold' : `Buy a pardon (${P.fmt(price)} gold)`)]) : null;

    return h('div', { class: 'pv-grid' },
      h('div', { class: 'pv-col' }, hire, stranger, pardon),
      h('div', { class: 'pv-col' }, cheer, talk, map));
  },
};

function pardonPrice(P) { return 200 + 150 * (P.town.wealth || 2); }
function buyPardon(P, price) {
  if (!PC.spend(P.c, price)) return;
  P.visit.pardon = true;
  P.S.addLog(`Bought a pardon in ${P.town.name} to see the governor.`);
  P.play('coins');
  P.toast("The governor will see you now. Head to his mansion.", 'Pardon bought!', 3200);
  P.rerender();
}
function tavernName(t) { return ['Salty Parrot', 'Jolly Anchor', 'Rusty Cutlass', 'Mermaid’s Rest', 'Laughing Crab', 'Golden Barrel'][t.seed % 6]; }

function knownList(P) {
  const { c, W } = P;
  const l = c.family.filter(f => !f.found);
  const f = l.sort((a, b) => b.clues - a.clues)[0];
  if (f && f.clues >= 1) return `No new news tonight. Remember: ${W.familyClue(f, f.townId, f.clues)}`;
  return 'No news of your family tonight. Try another town’s tavern.';
}
function rescue(P) {
  const { c, S, W } = P;
  for (const f of PC.pendingRescues(c, P.townId)) {
    f.found = true;
    const fame = (W.FAMILY.find(x => x.id === f.id) || {}).fame || 5;
    S.addFame(fame);
    S.addLog(`Rescued ${f.name} from ${P.town.name}!`);
    P.play('cheer');
    P.moment('moment-family-rescued', `You found ${f.name} in the back room and brought them safely aboard! (+${fame} fame)`, 'Family found!', 6000);
    P.visit.clueText = `${f.name} hugs you and cries happy tears. Welcome home!`;
  }
}
function crewRound(P) {
  const { c, S } = P, cost = crewRoundCost(c);
  if ((P.visit.crewRounds || 0) >= CREW_ROUNDS || !PC.spend(c, cost)) return;
  P.visit.crewRounds = (P.visit.crewRounds || 0) + 1;
  c.morale = Math.min(100, c.morale + CREW_CHEER); c.lastCheer = c.elapsed;
  S.addLog(`Bought the crew a round in ${P.town.name}.`);
  P.play('cheer');
  P.toast(`"To the Captain!" The crew cheer and raise their mugs. They are ${S.moraleLabel(c.morale).toLowerCase()} now.`, 'A round for the crew');
  P.rerender();
}
function hireN(P, n) {
  const { c, S } = P;
  if (n < 1) return;
  const m = PC.memo(c, P.townId);
  c.crew += n; m.hired = (m.hired || 0) + n;
  c.morale = Math.min(100, c.morale + Math.min(5, Math.round(n / 4))); // fresh faces lift spirits a little
  S.addLog(`Hired ${n} sailor${n > 1 ? 's' : ''} in ${P.town.name}.`);
  P.play('cheer');
  if (!P.advance(1)) return;
  P.toast(`${n} new sailor${n > 1 ? 's' : ''} climb aboard. Welcome to the crew!`, 'Crew hired');
  P.rerender();
}
function hearClue(P, f) {
  const { c, S, W } = P;
  f.clues = Math.min(4, f.clues + 1);
  PC.memo(c, P.townId).clueDay = c.elapsed;
  const txt = W.familyClue(f, f.townId, f.clues);
  P.visit.clueText = `“${txt}”`;
  S.addLog(txt);
  P.play('bell');
  P.toast(f.clues >= 4 ? `Sail to ${W.townById(f.townId).name} and visit its tavern or governor!` : `${f.clues} of 4 clues about ${f.name}.`, f.clues >= 4 ? `You know where ${f.name} is!` : 'A new clue!', 4000);
  if (f.townId === P.townId && f.clues >= 4) rescue(P);
  P.rerender();
}
function listen(P, cost) {
  const { c } = P;
  if (!PC.spend(c, cost)) return;
  const all = PC.rumours(c, P.town), next = all.find(r => !P.visit.rumours.includes(r)) || all[0];
  P.visit.rumours.push(next); P.visit.rumourN++;
  if (cost) P.play('coins');
  P.rerender();
}
function buyFragment(P, frag) {
  const { c, S } = P;
  if (!PC.spend(c, frag.price)) return;
  c.mapFragments[frag.quest.id][frag.index] = true;
  const n = c.mapFragments[frag.quest.id].filter(Boolean).length;
  S.addLog(`Bought a piece of the map to the ${frag.quest.name.replace(/^The /, '')} in ${P.town.name}.`);
  P.play('coins');
  P.moment('moment-map-piece', n >= 3 ? 'That makes enough pieces to search! Check the Quests page of your log.' : `You have ${n} of 4 pieces. Look in your Captain's Log.`, 'Map piece!', 5000);
  P.rerender();
}
