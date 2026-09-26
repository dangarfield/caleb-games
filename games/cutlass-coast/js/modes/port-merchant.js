// port-merchant.js — Merchant: buy/sell the four goods and food with big +/− steppers (hold to repeat).
import * as PC from './port-common.js';

const FOOD_STEP = 10, FOOD_MAX = 999;
let rows = [], headEl = null, timer = null;

export default {
  title: P => ({ title: 'The Merchant', sub: `Trading house of ${P.town.name}${P.mods.tradeBonus ? ' · your Charm gets you better prices' : ''}` }),
  open() { stop(); },
  render(P) {
    const { h, W, town: t } = P;
    stop(); rows = [];
    headEl = h('div', { class: 'pm-head' });
    const table = h('div', { class: 'pm-table' },
      h('div', { class: 'pm-tr pm-th' }, h('span', null, 'Goods'), h('span', null, 'They sell'), h('span', null, 'They buy'), h('span', null, 'In your hold'), h('span')),
      W.GOOD_IDS.map(g => goodRow(P, g, t)),
      foodRow(P, t));
    update(P);
    return h('div', { class: 'pm-wrap' }, headEl, table,
      h('div', { class: 'pm-tip' }, 'Tip: buy where goods are made and cheap, then sell them in a town that doesn’t make them. Hold a button to trade faster.'));
  },
};

let lastCoin = 0;
function coins(P) { const t = performance.now(); if (t - lastCoin > 160) { lastCoin = t; P.play('coins'); } }
function stop() { if (timer) { clearTimeout(timer); timer = null; } }
/** Press-and-hold repeat: acts once, then faster and faster while held. */
function repeatBtn(P, h, cls, label, act) {
  let n = 0;
  const loop = () => { if (!headEl || !headEl.isConnected) { stop(); return; } n++; if (!act(n > 10 ? 5 : 1)) { stop(); return; } update(P); timer = setTimeout(loop, n > 4 ? 70 : 140); };
  return h('button', { class: cls, onHold: [() => { stop(); n = 0; if (act(1)) { update(P); timer = setTimeout(loop, 380); } }, () => { stop(); update(P); }] }, label);
}

function goodRow(P, g, t) {
  const { h, W } = P;
  const buyEl = h('b'), sellEl = h('b'), haveEl = h('b'), noteEl = h('span', { class: 'pm-note' });
  const minus = repeatBtn(P, h, 'pm-btn pm-sell pm-step', '−', k => sell(P, g, k));
  const plus = repeatBtn(P, h, 'pm-btn pm-buy pm-step', '+', k => buy(P, g, k));
  const all = h('button', { class: 'pm-btn pm-sell pm-all', onTap: () => { sell(P, g, 9999); update(P); } }, 'Sell all');
  const buyAll = h('button', { class: 'pm-btn pm-buy pm-all', onTap: () => { if (buy(P, g, 9999)) P.S.addLog(`Filled the hold with ${P.W.GOODS[g].name.toLowerCase()} in ${P.town.name}.`); update(P); } }, 'Buy all');
  const row = h('div', { class: 'pm-tr' },
    h('span', { class: 'pm-good' }, h('span', { class: 'pm-name' }, W.GOODS[g].name), noteEl),
    h('span', { class: 'pm-price' }, buyEl, h('small', null, 'gold a ton')),
    h('span', { class: 'pm-price' }, sellEl, h('small', null, 'gold a ton')),
    h('span', { class: 'pm-have' }, haveEl, h('small', null, 'tons')),
    h('span', { class: 'pm-ctl' }, all, minus, plus, buyAll));
  rows.push({ g, buyEl, sellEl, haveEl, noteEl, minus, plus, all, buyAll, t });
  return row;
}
function foodRow(P) {
  const { h } = P;
  const buyEl = h('b'), haveEl = h('b'), noteEl = h('span', { class: 'pm-note' });
  const plus = repeatBtn(P, h, 'pm-btn pm-buy pm-step', '+', k => buyFood(P, k));
  let fill = null;
  const row = h('div', { class: 'pm-tr pm-food' },
    h('span', { class: 'pm-good' }, h('span', { class: 'pm-name' }, 'Food'), noteEl),
    h('span', { class: 'pm-price' }, buyEl, h('small', null, `gold for ${FOOD_STEP}`)),
    h('span', { class: 'pm-price' }, h('b', null, '—')),
    h('span', { class: 'pm-have' }, haveEl, h('small', null, 'barrels')),
    h('span', { class: 'pm-ctl' }, h('span', { class: 'pm-all pm-food-note' }, `+ buys ${FOOD_STEP}`), h('span', { class: 'pm-step-gap' }), plus, fill = h('button', { class: 'pm-btn pm-buy pm-all', onTap: () => { buyFood(P, 9999); update(P); } }, 'Fill up')));
  rows.push({ g: 'food', buyEl, haveEl, noteEl, plus, fill });
  return row;
}

function price(P, g) { return PC.prices(P.c, P.town, P.mods)[g]; }
function buy(P, g, k) {
  const c = P.c, p = price(P, g).buy;
  const room = PC.cargoCap(c) - PC.cargoUsed(c), n = Math.min(k, room, Math.floor(PC.money(c) / p));
  if (n <= 0) return false;
  PC.spend(c, n * p); c.cargo[g] = (c.cargo[g] || 0) + n;
  coins(P); return true;
}
function sell(P, g, k) {
  const c = P.c, p = price(P, g).sell, n = Math.min(k, c.cargo[g] || 0);
  if (n <= 0) return false;
  c.gold += n * p; c.cargo[g] -= n;
  if (k >= 9999) P.S.addLog(`Sold ${n} tons of ${P.W.GOODS[g].name.toLowerCase()} in ${P.town.name} for ${P.fmt(n * p)} gold.`);
  coins(P); return true;
}
function buyFood(P, k) {
  const c = P.c, p = PC.foodPrice(P.town, P.mods) * FOOD_STEP;
  let n = 0;
  while (n < k && PC.money(c) >= p && c.food + FOOD_STEP <= FOOD_MAX) { PC.spend(c, p); c.food += FOOD_STEP; n++; }
  if (n) coins(P);
  return n > 0;
}

function update(P) {
  const { c, W, town: t, S } = P;
  if (!headEl) return;
  const cap = PC.cargoCap(c), used = PC.cargoUsed(c), pr = PC.prices(c, t, P.mods);
  headEl.replaceChildren(
    P.h('div', { class: 'pm-stat' }, P.h('span', null, 'Your purse'), P.h('b', null, `${P.fmt(PC.money(c))} gold`)),
    P.h('div', { class: 'pm-stat' }, P.h('span', null, 'Hold'), P.h('b', null, `${used} of ${cap} tons`),
      P.h('div', { class: 'pm-hold' }, P.h('div', { style: { width: Math.min(100, Math.round(100 * used / Math.max(1, cap))) + '%' } }))),
    P.h('div', { class: 'pm-stat' }, P.h('span', null, 'Food'), P.h('b', null, `${P.fmt(c.food)} · ${P.ctx.ui.plural(S.foodDays(c), 'day')}`)));
  for (const r of rows) {
    if (r.g === 'food') {
      const fp = PC.foodPrice(t, P.mods) * FOOD_STEP;
      r.buyEl.textContent = P.fmt(fp); r.haveEl.textContent = P.fmt(c.food);
      r.noteEl.textContent = S.foodDays(c) < 10 ? 'Running low!' : `Enough for ${P.ctx.ui.plural(S.foodDays(c), 'day')}`;
      r.noteEl.classList.toggle('bad', S.foodDays(c) < 10);
      setDis(r.plus, PC.money(c) < fp || c.food + FOOD_STEP > FOOD_MAX); setDis(r.fill, PC.money(c) < fp || c.food + FOOD_STEP > FOOD_MAX);
      continue;
    }
    const p = pr[r.g], base = W.GOODS[r.g].base;
    r.buyEl.textContent = P.fmt(p.buy); r.sellEl.textContent = P.fmt(p.sell); r.haveEl.textContent = c.cargo[r.g] || 0;
    const made = t.produces === r.g, high = p.sell >= base * 1.08;
    r.noteEl.textContent = made ? 'Made here, so cheap' : high ? 'Sells high here!' : p.sell <= base * 0.9 ? 'Sells low here' : 'A fair price';
    r.noteEl.classList.toggle('good', made || high);
    setDis(r.minus, !(c.cargo[r.g] > 0)); setDis(r.all, !(c.cargo[r.g] > 0));
    setDis(r.plus, used >= cap || PC.money(c) < p.buy); setDis(r.buyAll, used >= cap || PC.money(c) < p.buy);
  }
  P.refreshChips();
}
// toggle disabled without breaking a held press on the same button
function setDis(el, v) { if (v && el.classList.contains('pressed')) return; el.toggleAttribute('disabled', !!v); }
