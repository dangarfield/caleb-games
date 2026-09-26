// port-governor.js — Governor's mansion: welcome, titles & land, letter of marque, war news, the daughter.
import * as PC from './port-common.js';

const DATES = [
  n => `You told ${n} about the storm off Tortuga. She laughed at all your jokes!`,
  n => `You and ${n} walked along the harbour wall and counted the ships.`,
  n => `You brought ${n} a shell as big as your hand. She loves it!`,
  n => `${n} showed you her garden, full of parrots and orange trees.`,
  n => `You danced with ${n} at the governor's party. Nobody stepped on anybody's toes!`,
  n => `${n} asked about your lost family and promised to listen for news.`,
];

export default {
  title: P => ({ title: "The Governor's Mansion", sub: `${P.town.governor} · Governor of ${P.town.name}` }),
  open(P) { rescue(P); },
  render(P) {
    const { h, W, c, town: t, mods, fmt } = P, n = t.nation, N = W.NATIONS[n];
    const st = c.standing[n] || 0, title = c.titles[n];
    const who = title ? `${title} ${c.name}` : `Captain ${c.name}`;
    const welcome = title ? `Welcome back, ${who}! ${N.name} is proud of you.`
      : st >= 50 ? `Ah, ${who}, our hero! Come in, come in!`
      : st >= 20 ? `Welcome, ${who}. ${N.name} is glad to have friends like you.`
      : st >= 0 ? `Welcome to ${t.name}, ${who}. What can I do for you?`
      : P.visit.pardon ? `So, you have a pardon, ${who}. I will hear you, but be quick about it.`
      : `Hmm. I have heard stories about you, ${who}. Behave yourself in my town.`;

    // titles
    const nt = PC.nextTitle(c, n), nf = PC.nationFame(c, n, mods);
    const can = nt && nf >= nt.fame && st > 0;
    const titleBox = h('div', { class: 'pg-card' },
      h('div', { class: 'label-caps' }, `TITLES FROM ${N.name.toUpperCase()}`),
      h('div', { class: 'pg-line' }, title ? `You are a ${title} of ${N.name}.` : `${N.name} has not given you a title yet.`),
      nt ? [
        h('div', { class: 'pg-prog' },
          h('div', { class: 'pg-prog-bar' }, h('div', { style: { width: Math.min(100, Math.round(100 * nf / nt.fame)) + '%' } })),
          h('span', null, `${Math.min(nf, nt.fame)} / ${nt.fame}`)),
        h('div', { class: 'pg-note' }, can ? `You have earned the title of ${nt.name}${nt.land ? ` and ${fmt(nt.land)} acres of land` : ''}!`
          : st <= 0 ? `${N.name} must like you more first. Help their ships and fight their enemies.`
          : `Win more fame for ${N.name} to become a ${nt.name}${nt.land ? ` (${fmt(nt.land)} acres of land)` : ''}.`),
        can ? h('button', { class: 'gold-btn sm pg-award', onTap: () => award(P, nt) }, `Become a ${nt.name}`) : null,
      ] : h('div', { class: 'pg-note' }, 'You hold the highest title in the land!'));

    // letter of marque
    const enemies = W.NATION_IDS.filter(x => x !== n && W.relation(n, x, c.relations) === 'war');
    const letter = c.letters && c.letters[n];
    const marque = h('div', { class: 'pg-card' },
      h('div', { class: 'label-caps' }, 'LETTER OF MARQUE'),
      letter ? h('div', { class: 'pg-line' }, `You carry ${N.adj} papers to hunt ${letter.against.map(x => W.NATIONS[x].adj).join(' and ')} ships.`)
        : !enemies.length ? h('div', { class: 'pg-line' }, `${N.name} is at peace, so there are no enemy ships to hunt.`)
        : st < 0 ? h('div', { class: 'pg-line' }, `${N.name} doesn't trust you enough to give you papers.`)
        : [h('div', { class: 'pg-line' }, `Hunt ${enemies.map(x => W.NATIONS[x].adj).join(' and ')} ships for ${N.name}, and ${N.name} will thank you for every one.`),
          h('button', { class: 'ink-btn sm pg-marque', onTap: () => takeLetter(P, enemies) }, 'Take the letter')]);

    // war news
    const news = h('div', { class: 'pg-card' },
      h('div', { class: 'label-caps' }, 'NEWS OF THE WARS'),
      PC.warNews(c).map(s => h('div', { class: 'pg-news' }, s)));

    // daughter
    const dn = PC.daughterName(t, n), rv = (c.romance && c.romance[t.id]) || 0;
    let dBody;
    if (c.wife && c.wifeTown === t.id) dBody = [h('div', { class: 'pg-line' }, `Your wife ${c.wife} runs to meet you. Home at last!`)];
    else if (c.wife) dBody = [h('div', { class: 'pg-line' }, `${dn} waves hello. You are already happily married to ${c.wife}.`)];
    else if (st < 0) dBody = [h('div', { class: 'pg-line' }, `The governor won't let you anywhere near ${dn}!`)];
    else {
      const canPropose = rv >= 80 && !!title;
      dBody = [
        h('div', { class: 'pg-prog hearts' },
          h('div', { class: 'pg-prog-bar' }, h('div', { style: { width: rv + '%' } })),
          h('span', null, PC.romanceText(rv))),
        rv >= 80 && !title ? h('div', { class: 'pg-note' }, `Her father wants her to marry someone with a ${N.adj} title.`) : null,
        h('div', { class: 'pg-btns' },
          h('button', { class: 'ink-btn sm', disabled: P.visit.dated, onTap: () => visitDaughter(P, dn) }, P.visit.dated ? 'See her next visit' : `Visit ${dn}`),
          canPropose ? h('button', { class: 'gold-btn sm', onTap: () => propose(P, dn) }, 'Ask her to marry you') : null),
      ];
    }
    const daughter = h('div', { class: 'pg-card' }, h('div', { class: 'label-caps' }, `THE GOVERNOR'S DAUGHTER, ${dn.toUpperCase()}`), dBody);

    // a treasure-map piece the governor keeps (quest sources of kind 'governor')
    const gf = PC.fragmentFromGovernor(c, P.townId);
    const mapBox = gf ? h('div', { class: 'pg-card pg-map' },
      h('div', { class: 'label-caps' }, 'A TORN MAP PIECE'),
      h('div', { class: 'pg-line' }, `The governor keeps a scrap of an old map: part of ${gf.quest.name}.`),
      st >= 10 ? [h('div', { class: 'pg-note' }, `“You have been a good friend to ${N.name}. Take it, with my thanks.”`),
          h('button', { class: 'gold-btn sm', onTap: () => takeGovFragment(P, gf, 0) }, 'Take the map piece')]
        : st >= 0 || P.visit.pardon ? [h('div', { class: 'pg-note' }, `“It is not for free, Captain. Help ${N.name} and I might just give it to you.”`),
          h('button', { class: 'ink-btn sm', disabled: PC.money(c) < gf.price, onTap: () => takeGovFragment(P, gf, gf.price) }, `Buy it (${fmt(gf.price)} gold)`)]
        : h('div', { class: 'pg-note' }, `He won't even show it to you. ${N.name} has to like you more first.`)) : null;

    return h('div', { class: 'pg-grid' },
      h('div', { class: 'pg-col' }, h('div', { class: 'pg-welcome' }, `“${welcome}”`), titleBox, marque),
      h('div', { class: 'pg-col' }, mapBox, news, daughter));
  },
};

function rescue(P) {
  const { c, S, W, fmt } = P;
  for (const f of PC.pendingRescues(c, P.townId)) {
    f.found = true;
    const fame = (W.FAMILY.find(x => x.id === f.id) || {}).fame || 5;
    S.addFame(fame);
    S.addLog(`Rescued ${f.name} in ${P.town.name}!`);
    P.play('cheer');
    P.moment('moment-family-rescued', `${f.name} is safe and coming home with you! Everyone cheers. (+${fmt(fame)} fame)`, 'Family found!', 6000);
  }
}
function takeGovFragment(P, gf, price) {
  const { c, S } = P;
  if (price && !PC.spend(c, price)) return;
  if (!c.mapFragments[gf.quest.id]) c.mapFragments[gf.quest.id] = [false, false, false, false];
  c.mapFragments[gf.quest.id][gf.index] = true;
  const n = c.mapFragments[gf.quest.id].filter(Boolean).length;
  S.addLog(`The governor of ${P.town.name} gave you a piece of the map to ${gf.quest.name.replace(/^The /, 'the ')}.`);
  P.play(price ? 'coins' : 'fanfare');
  P.moment('moment-map-piece', n >= 3 ? 'That makes enough pieces to search! Check the Quests page of your log.' : `You have ${n} of 4 pieces. Look in your Captain's Log.`, 'Map piece!', 5000);
  P.rerender();
}
function award(P, nt) {
  const { c, S, W, town: t } = P, n = t.nation;
  c.titles[n] = nt.name; c.landAcres = (c.landAcres || 0) + (nt.land || 0);
  S.addLog(`The governor of ${t.name} made you a ${nt.name} of ${W.NATIONS[n].name}${nt.land ? `, with ${P.fmt(nt.land)} acres of land` : ''}.`);
  P.play('fanfare');
  P.moment('moment-title', nt.land ? `You get ${P.fmt(nt.land)} acres of land, too!` : `${W.NATIONS[n].name} salutes you!`, `You are now a ${nt.name}!`, 5500);
  P.rerender();
}
function takeLetter(P, enemies) {
  const { c, S, W, town: t } = P, n = t.nation;
  if (!c.letters) c.letters = {};
  c.letters[n] = { against: enemies.slice(), date: { ...c.date } };
  S.changeStanding(n, 5);
  S.addLog(`Took a letter of marque from ${W.NATIONS[n].name} against ${enemies.map(x => W.NATIONS[x].name).join(' and ')}.`);
  P.play('bell');
  P.toast(`Now ${W.NATIONS[n].name} will reward you for every ${enemies.map(x => W.NATIONS[x].adj).join(' or ')} ship you take.`, 'Letter of marque');
  P.rerender();
}
function visitDaughter(P, dn) {
  const { c, S, town: t, mods } = P;
  if (!c.romance) c.romance = {};
  const gain = Math.round((10 + Math.min(10, c.fame / 6) + (c.titles[t.nation] ? 6 : 0)) * mods.charm);
  c.romance[t.id] = Math.min(100, (c.romance[t.id] || 0) + gain);
  P.visit.dated = true;
  if (!P.advance(1)) return;
  const line = DATES[(Math.floor(c.elapsed) + t.seed) % DATES.length](dn);
  S.addLog(`Spent a day with ${dn}, the governor's daughter in ${t.name}.`);
  P.toast(line, PC.romanceText(c.romance[t.id]));
  P.rerender();
}
function propose(P, dn) {
  const { c, S, town: t } = P;
  c.wife = dn; c.wifeTown = t.id;
  S.addFame(5); S.changeStanding(t.nation, 10);
  S.addLog(`Married ${dn}, daughter of the governor of ${t.name}!`);
  P.play('fanfare'); setTimeout(() => P.play('cheer'), 700);
  P.moment('moment-wedding', `${dn} said YES! The whole town comes to the wedding.`, 'Wedding bells!', 6000);
  P.rerender();
}
