// port-shipwright.js — Shipwright: repair, guns, upgrades, sell / swap flagship, buy a new ship.
import * as PC from './port-common.js';

let sel = 0, tab = 'repair';

export default {
  title: P => ({ title: 'The Shipwright', sub: `Dockyard of ${P.town.name} · fixing hulls since before you were born` }),
  open() { sel = 0; tab = 'repair'; },
  render(P) {
    const { h, c } = P;
    if (sel >= c.fleet.length) sel = 0;
    const list = h('div', { class: 'ps-fleet' },
      h('div', { class: 'label-caps' }, c.fleet.length > PC.FLEET_MAX ? `YOUR FLEET · ${c.fleet.length} SHIPS (MAX ${PC.FLEET_MAX})` : `YOUR FLEET · ${c.fleet.length} OF ${PC.FLEET_MAX}`),
      c.fleet.map((s, i) => h('button', { class: 'ps-ship' + (i === sel ? ' on' : ''), onTap: () => { sel = i; if (tab === 'buy') tab = 'repair'; P.rerender(); } },
        h('div', { class: 'ps-ship-top' }, h('b', null, s.name), i === 0 ? h('span', { class: 'ps-tag' }, 'Flagship') : null),
        h('div', { class: 'ps-ship-sub' }, `${PC.cls(s).name} · ${s.guns} guns · ${PC.cls(s).cargo} t`),
        h('div', { class: 'ps-hull' }, h('div', { style: { width: PC.hullPct(s) + '%', background: PC.hullPct(s) < 50 ? '#d0685a' : '#7fbf7a' } })))));
    const tabs = P.ctx.ui.seg([{ id: 'repair', label: 'Repairs & guns' }, { id: 'upgrades', label: 'Upgrades' }, { id: 'buy', label: 'Buy a ship' }], tab, id => { tab = id; P.rerender(); }, { cls: 'ps-tabs' });
    const body = tab === 'buy' ? buyView(P) : tab === 'upgrades' ? upgradeView(P) : repairView(P);
    return h('div', { class: 'ps-grid' }, list, h('div', { class: 'ps-main' }, tabs, body));
  },
};

function row(P, title, note, btn) {
  const { h } = P;
  return h('div', { class: 'ps-row' }, h('div', { class: 'ps-row-t' }, h('b', null, title), h('span', null, note)), btn);
}

function repairView(P) {
  const { h, c, mods, fmt } = P, s = c.fleet[sel], k = PC.cls(s);
  const cost = PC.repairCost(s, mods), hp = PC.hullPct(s), sails = s.sails == null ? 100 : s.sails;
  const gp = PC.gunPrice(mods), mg = PC.maxGuns(s), add = Math.min(2, mg - s.guns);
  const out = [
    row(P, `Hull ${hp}% · Sails ${Math.round(sails)}%`,
      cost <= 0 ? 'Not a scratch on her. She is shipshape!' : PC.money(c) >= cost ? `Patch every hole and stitch every sail. Takes ${repairDays(s)} day${repairDays(s) > 1 ? 's' : ''}.` : `You can't afford it all, so the shipwright will fix what ${fmt(PC.money(c))} gold pays for.`,
      h('button', { class: 'gold-btn sm', disabled: cost <= 0 || PC.money(c) < 10, onTap: () => repair(P, s) }, cost <= 0 ? 'No repairs needed' : PC.money(c) >= cost ? `Repair (${fmt(cost)} gold)` : 'Repair what you can')),
    row(P, `Cannon ${s.guns} of ${mg}`, add > 0 ? `More guns mean bigger broadsides. ${fmt(gp)} gold each.` : `A ${k.name.toLowerCase()} can't carry any more guns.`,
      h('button', { class: 'ink-btn sm', disabled: add <= 0 || PC.money(c) < gp * add, onTap: () => buyGuns(P, s, add) }, add > 0 ? `Buy ${add} ${add === 1 ? 'gun' : 'guns'} (${fmt(gp * add)})` : 'Full')),
  ];
  if (c.fleet.length > 1) {
    const price = PC.sellShipPrice(s, mods);
    out.push(row(P, sel === 0 ? 'Your flagship' : 'Change ships', sel === 0 ? 'You sail aboard this ship. Pick another ship to sail in it instead.' : `Move your flag to ${s.name}.`,
      h('button', { class: 'ink-btn sm', disabled: sel === 0, onTap: () => makeFlag(P) }, 'Sail in this ship')));
    out.push(row(P, 'Sell this ship', `The shipwright will pay ${fmt(price)} gold for ${s.name}.`,
      h('button', { class: 'ink-btn sm', onTap: () => sellShip(P, price) }, `Sell (${fmt(price)})`)));
  }
  return h('div', { class: 'ps-rows' }, out);
}
function upgradeView(P) {
  const { h, c, mods, fmt } = P, s = c.fleet[sel];
  const ups = s.upgrades || [];
  return h('div', { class: 'ps-rows' }, PC.UPGRADES.map(u => {
    const have = ups.includes(u.id), price = PC.upgradePrice(s, u, mods);
    return row(P, u.name, have ? `${s.name} already has this.` : u.note,
      h('button', { class: have ? 'ink-btn sm' : 'gold-btn sm', disabled: have || PC.money(c) < price, onTap: () => upgrade(P, s, u, price) }, have ? 'Fitted ✓' : `Fit it (${fmt(price)})`));
  }), h('div', { class: 'ps-tip' }, 'Upgrades stay with the ship. Copper = faster, cotton = quicker turns.'));
}
function buyView(P) {
  const { h, c, mods, fmt, town: t } = P;
  const types = PC.SHIPS_FOR_SALE[t.size] || PC.SHIPS_FOR_SALE.small;
  const full = c.fleet.length >= PC.FLEET_MAX;
  return h('div', { class: 'ps-buy' },
    full ? h('div', { class: 'warn-box' }, c.fleet.length > PC.FLEET_MAX ? `You have more ships than a fleet can hold (${PC.FLEET_MAX}). You can keep them, but sell some before you buy or capture another.` : `Your fleet is full (${PC.FLEET_MAX} ships). Sell a ship first.`) : null,
    h('div', { class: 'ps-cards' }, types.map(id => {
      const k = P.W.SHIP_CLASSES[id], price = PC.shipPrice(id, mods);
      return h('div', { class: 'ps-card' },
        h('div', { class: 'ps-card-t' }, h('b', null, k.name), h('span', null, `${k.guns} guns · ${k.cargo} t cargo · ${k.crewMax} crew · ${k.speed} knots`)),
        h('button', { class: 'gold-btn sm', disabled: full || PC.money(c) < price, onTap: () => buyShip(P, id, price) }, `${fmt(price)}`));
    })),
    h('div', { class: 'ps-tip' }, t.size === 'large' ? 'Big towns build big ships.' : 'Bigger towns have bigger ships for sale.'));
}

const repairDays = s => 1 + Math.round((1 - s.hull / Math.max(1, s.hullMax)) * 4);
function repair(P, s) {
  const { c, S, mods } = P, full = PC.repairCost(s, mods);
  if (full <= 0) return;
  const days = repairDays(s);
  if (PC.money(c) >= full) { PC.spend(c, full); s.hull = s.hullMax; s.sails = 100; }
  else { // fix what the purse pays for
    const f = PC.money(c) / full;
    s.hull = Math.min(s.hullMax, Math.round(s.hull + (s.hullMax - s.hull) * f));
    s.sails = Math.min(100, Math.round((s.sails == null ? 100 : s.sails) + (100 - (s.sails == null ? 100 : s.sails)) * f));
    PC.spend(c, PC.money(c));
  }
  S.addLog(`Repaired ${s.name} at ${P.town.name}.`);
  P.play('creak');
  if (!P.advance(days)) return;
  P.toast(`Hammers bang and saws buzz. ${s.name} is now at ${PC.hullPct(s)}% hull.`, 'Repairs done');
  P.rerender();
}
function buyGuns(P, s, n) {
  const { c, mods } = P, cost = PC.gunPrice(mods) * n;
  if (n <= 0 || !PC.spend(c, cost)) return;
  s.guns += n;
  P.play('thud');
  P.toast(`${n} shiny cannon rolled aboard ${s.name}.`, 'Guns bought');
  P.rerender();
}
function upgrade(P, s, u, price) {
  const { c, S } = P;
  if (!PC.spend(c, price)) return;
  s.upgrades = (s.upgrades || []).concat(u.id);
  if (u.id === 'extraGuns') s.guns += 4;
  S.addLog(`Fitted ${u.name.toLowerCase()} to ${s.name}.`);
  P.play('creak');
  if (!P.advance(1)) return;
  P.toast(`${s.name} now has ${u.name.toLowerCase()}!`, 'Upgrade fitted');
  P.rerender();
}
function makeFlag(P) {
  const { c, S } = P, s = c.fleet.splice(sel, 1)[0];
  c.fleet.unshift(s); sel = 0;
  S.addLog(`Moved your flag to ${s.name}.`);
  P.play('bell');
  P.toast(`You now sail aboard ${s.name}.`, 'New flagship');
  P.rerender();
}
async function sellShip(P, price) {
  const { c, S } = P, s = c.fleet[sel];
  if (c.fleet.length <= 1) return;
  const rest = c.fleet.filter((_, i) => i !== sel);
  const cap = rest.reduce((a, x) => a + PC.cls(x).cargo, 0);
  if (PC.cargoUsed(c) > cap) { P.toast("Your other ships can't hold all the cargo. Sell some goods at the Merchant first.", 'Too much cargo'); return; }
  const ok = await P.ctx.ui.confirm({ title: `Sell ${s.name}?`, text: `The shipwright pays ${P.fmt(price)} gold.`, ok: 'Sell', cancel: 'Keep her' });
  if (!ok || P.ctx.mode !== 'port') return;
  c.fleet.splice(sel, 1); sel = 0;
  c.gold += price;
  const crewCap = PC.crewCap(c);
  let extra = '';
  if (c.crew > crewCap) { extra = ` ${c.crew - crewCap === 1 ? '1 sailor had' : `${c.crew - crewCap} sailors had`} no bunk and stayed ashore.`; c.crew = crewCap; }
  S.addLog(`Sold ${s.name} for ${P.fmt(price)} gold.`);
  P.play('coins');
  P.toast(`You sold ${s.name} for ${P.fmt(price)} gold.${extra}`, 'Ship sold');
  P.rerender();
}
function buyShip(P, id, price) {
  const { c, S, W } = P;
  if (PC.money(c) < price || c.fleet.length >= PC.FLEET_MAX) return;
  const k = W.SHIP_CLASSES[id];
  const used = new Set(c.fleet.map(s => s.name));
  const name = PC.NEW_SHIP_NAMES.find(n => !used.has(n)) || `The ${k.name} ${c.fleet.length + 1}`;
  PC.spend(c, price);
  c.fleet.push({ id: 's' + Date.now().toString(36), name, type: id, hull: k.hull, hullMax: k.hull, sails: 100, guns: k.guns, upgrades: [] });
  sel = c.fleet.length - 1; tab = 'repair';
  S.addLog(`Bought a ${k.name.toLowerCase()}, ${name}, in ${P.town.name}.`);
  P.play('fanfare');
  if (!P.advance(1)) return;
  P.toast(`${name} joins your fleet! Pick "Sail in this ship" to make her your flagship.`, 'New ship!', 4000);
  P.rerender();
}
