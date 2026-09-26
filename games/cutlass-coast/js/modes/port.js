// port.js — 1c Port town: town panel, six building tiles, resource chips, status line, Leave Port.
// Buildings open parchment sub-panels from port-governor/tavern/merchant/shipwright.js.
// params: {townId, sneak?, conquered?, escaped?, duelWon?, message?, messages?}
import * as THREE from 'three';
import * as PC from './port-common.js';
import governor from './port-governor.js';
import tavern from './port-tavern.js';
import merchant from './port-merchant.js';
import shipwright from './port-shipwright.js';

const PANELS = { governor, tavern, merchant, shipwright };
let ctx = null, root = null, scene = null, camera = null, backdrop = null;
let townId = null, sneak = false, panel = null, alive = 0, visit = null, chipEls = null;
let P = null, fresh = false;

export default {
  enter(c, params = {}) {
    ctx = c; alive++; panel = null; chipEls = null;
    const W = ctx.world, S = ctx.state, car = S.career();
    townId = params.townId || (car && car.location && car.location.townId) || 'portroyal';
    if (!car || !W.townById(townId)) { ctx.ui.toast('No captain is sailing right now.', { title: 'Oops' }); ctx.go('title'); return; }
    const base = W.townById(townId);
    const msgs = [];
    if (params.message) msgs.push(params.message);
    if (Array.isArray(params.messages)) msgs.push(...params.messages);

    // conquered: the town may switch to the player's flag
    if (params.conquered) {
      const was = PC.townNation(car, base);
      if (was !== car.nation && ctx.world.relation(car.nation, was, car.relations) === 'war') {
        car.towns[townId] = Object.assign({}, car.towns[townId], { nation: car.nation, governor: 'Mr. Hobbs, your old mate', garrison: Math.round(base.garrison * 0.4) });
        S.addLog(`${base.name} now flies the flag of ${W.NATIONS[car.nation].name}.`);
        msgs.push(`${base.name} now flies the ${W.NATIONS[car.nation].adj} flag!`);
      }
    }
    // sneaking: from the sail prompt, or forced if the town is hostile
    sneak = !!params.sneak || (!params.conquered && PC.isHostile(car, base));
    if (params.escaped) {
      if (params.duelWon === false) { // caught!
        const fine = Math.round(car.gold * 0.3);
        car.gold -= fine; S.advanceDays(3);
        S.addLog(`Caught sneaking into ${base.name}. The guards took ${fine} gold and marched you back to your ship.`);
        car.location = { kind: 'sea', townId };
        ctx.go('sail', { fromTown: townId, message: `The guards caught you and marched you back to your ship. They kept ${ctx.ui.fmt(fine)} gold as a fine.` });
        return;
      }
      msgs.unshift('You beat the guard captain and slipped away into the crowd!');
    } else if (sneak && Math.random() < PC.SNEAK_CATCH) {
      // the guards get ONE look at you, at the town gate — before you're in (never again this visit)
      car.location = { kind: 'sea', townId };
      ctx.go('duel', { enemy: guardFor(base), context: 'sneak', returnTo: 'port', returnParams: { townId, sneak: true, escaped: true },
        message: `A guard at the gate of ${base.name} sees through your disguise. Draw your sword!` });
      return;
    }
    visit = { townId, rumours: [], rumourN: 0, dated: false, escaped: !!params.escaped };
    const already = car.location && car.location.kind === 'port' && car.location.townId === townId; // back from the log/reload
    car.location = { kind: 'port', townId };
    try { car.position = W.departurePoint(base); } catch (e) { /* keep old position */ }
    if (!params.escaped && !already) S.addLog(sneak ? `Sneaked into ${base.name} in disguise.` : `Dropped anchor at ${base.name}.`);

    P = makeP();
    buildBackdrop();
    root = ctx.ui.mount('port', null);
    render();
    ctx.audio.play('bell'); ctx.audio.ambience(true);
    if (sneak && !params.escaped) msgs.push('You slipped past the guards dressed as a fisherman. Only the Tavern and the Merchant will serve you here.');
    msgs.forEach((m, i) => setTimeout(() => { if (root) ctx.ui.toast(m, { ms: 3400 }); }, 300 + i * 1500));
  },
  exit() {
    alive++;
    ctx.audio.ambience(false);
    if (backdrop) { try { backdrop.dispose ? backdrop.dispose() : ctx.engine.disposeTree(backdrop.root); } catch (e) { console.error(e); } }
    backdrop = null; scene = null; camera = null; root = null; panel = null; chipEls = null;
  },
  update(dt, t) { if (backdrop && backdrop.update) backdrop.update(dt, t, camera); },
  resume() { if (root) render(); },
};

function guardFor(t) {
  const S = ctx.state, info = ctx.world.townInfo(t, S.career());
  return { id: 'guard-' + t.id, name: `${t.name} town guard`, captain: 'Guard Captain', nation: info.nation, type: 'sloop', kind: 'guard',
    crew: Math.max(8, Math.round(info.garrison / 12)), guns: 0, hull: 1, hullMax: 1, sails: 100, gold: 0, cargo: {},
    skill: Math.min(1, S.modifiers(S.career()).enemySkill * 0.85), note: 'The town guard has spotted you!' };
}

function buildBackdrop() {
  const PLT = ctx.PLT;
  if (!PLT || !PLT.scenes || !PLT.scenes.townSquare) return;
  try {
    const nation = PC.townNation(ctx.state.career(), townId);
    backdrop = PLT.scenes.townSquare({ nation });
    scene = new THREE.Scene(); scene.add(backdrop.root);
    camera = new THREE.PerspectiveCamera(45, ctx.engine.aspect(), 0.5, 2000);
    camera.position.set(20, 17, 30); camera.lookAt(0, 1.5, 0);
    ctx.engine.setView(scene, camera);
  } catch (e) { console.error('townSquare failed', e); backdrop = null; }
}

// ---------- the P context handed to building panels ----------
function makeP() {
  const S = ctx.state;
  return {
    get ctx() { return ctx; }, get h() { return ctx.ui.h; }, get W() { return ctx.world; }, get S() { return S; },
    get c() { return S.career(); }, get town() { return ctx.world.townInfo(townId, S.career()); }, get townId() { return townId; },
    get sneak() { return sneak; }, get mods() { return S.modifiers(S.career()); }, get visit() { return visit; },
    fmt: n => ctx.ui.fmt(n),
    rerender: () => render(),
    refreshChips,
    close: () => { panel = null; render(); },
    toast: (text, title, ms) => ctx.ui.toast(text, { title, ms: ms || 3000 }),
    /** An illustrated story moment (images/<pic>.webp) instead of a plain toast. */
    moment: (pic, text, title, ms) => ctx.ui.moment(pic, { title, text, ms: ms || 5200 }),
    play: n => ctx.audio.play(n),
    /** Advance the calendar in port. Returns false if we left the port (forced retirement). */
    advance(n) {
      const token = alive;
      const ev = S.advanceDays(n, {});
      for (const e of ev) {
        if (e.type === 'birthday') ctx.ui.toast(`Happy birthday, Captain! You are ${e.age} years old now.`, { title: 'Birthday' });
        else if (e.type === 'health') ctx.ui.toast(`Your health is now ${e.to.toLowerCase()}.`, { title: 'Health' });
        else if (e.type === 'retirePrompt') ctx.ui.toast('Your old bones ache. You can retire from any friendly port.', { title: 'Time to rest?' });
        else if (e.type === 'forcedRetire') { ctx.go('retire', { forced: true, townId }); return false; }
      }
      return token === alive;
    },
    /** Guards are rolled once, at the town gate, when you arrive (see enter). Buildings never trigger a fight. */
    guardCheck() { return false; },
  };
}

function openPanel(name) {
  const mod = PANELS[name]; if (!mod) return;
  panel = name;
  if (mod.open) mod.open(P);
  if (!root || panel !== name) return;
  fresh = true; render(); fresh = false;
}

// ---------- render ----------
function render() {
  if (!root) return;
  const { h } = ctx.ui;
  // keep scroll positions (fleet list, goods, etc.) when a tap redraws the same panel
  const keep = root.dataset.panel === String(panel) ? [...root.querySelectorAll('.ps-fleet, [class*="scroll"]')].map(el => el.scrollTop) : [];
  root.dataset.panel = String(panel);
  root.replaceChildren(
    h('div', { class: 'pt-shade' + (backdrop ? '' : ' no-3d') }),
    townPanel(),
    chips(),
    ctx.ui.menuButton(() => ctx.go('pause')),
    ...(panel ? [panelView()] : [tiles(), bottomBar()]),
  );
  if (keep.length) root.querySelectorAll('.ps-fleet, [class*="scroll"]').forEach((el, i) => { if (keep[i]) el.scrollTop = keep[i]; });
}

function townPanel() {
  const { h, fmt } = ctx.ui, W = ctx.world, S = ctx.state, c = S.career(), t = P.town, N = W.NATIONS[t.nation];
  const url = PC.flagURL(ctx.PLT, t.nation);
  const stats = [
    ['Population', `${fmt(t.pop)} · ${W.WEALTH_LABEL[t.wealth] || ''}`],
    ['Governor', t.governor],
    ['Garrison', `${fmt(t.garrison)} soldiers`],
    ...W.NATION_IDS.map(n => [`${W.NATIONS[n].name} thinks you're`, PC.standingText(c, n), (c.standing[n] || 0) <= -10 ? 'bad' : (c.standing[n] || 0) >= 20 || c.titles[n] ? 'good' : '']),
  ];
  const all = PC.rumours(c, t);
  const gossip = all.length ? all[(Math.floor(c.elapsed) + t.seed) % all.length] : 'All is quiet in town today.';
  return h('div', { class: 'navy-frame pt-town' },
    h('div', { class: 'parchment pt-town-in' },
      h('div', { class: 'pt-colony' },
        url ? h('img', { class: 'pt-flag', src: url, alt: '' }) : h('span', { class: 'pt-flag', style: { background: N.color } }),
        h('span', { class: 'label-caps' }, N.colony)),
      h('div', { class: 'pt-name' + (t.name.length > 11 ? ' long' : '') }, t.name),
      h('div', { class: 'pt-when' }, `${W.isleName(t.isle).replace(/^the /, 'The ')} · ${S.fmtDate(c.date)} · ${PC.weatherText(c)}`),
      h('div', { class: 'pt-stats' }, stats.map(([k, v, cls]) => h('div', { class: 'pt-stat' }, h('span', null, k), h('b', { class: cls || '' }, v)))),
      h('div', { class: 'pt-gossip' },
        h('div', { class: 'label-caps' }, 'DOCKSIDE GOSSIP'),
        h('div', { class: 'pt-gossip-t' }, `“${gossip}”`))));
}

function chipData() {
  const c = ctx.state.career(), fmt = ctx.ui.fmt;
  return {
    gold: fmt(c.gold), food: `${fmt(c.food)}`, crew: `${c.crew}/${PC.crewCap(c)}`, cargo: `${PC.cargoUsed(c)}/${PC.cargoCap(c)}`,
  };
}
function chips() {
  const d = chipData();
  chipEls = {
    gold: ctx.ui.chip({ k: 'gold', v: d.gold, c: '#e0b44f' }),
    food: ctx.ui.chip({ k: 'food', v: d.food, c: '#7fbf7a' }),
    crew: ctx.ui.chip({ k: 'crew', v: d.crew, c: '#8fb8de' }),
    cargo: ctx.ui.chip({ k: 'tons of cargo', v: d.cargo, c: '#c98a4a' }),
  };
  return ctx.ui.h('div', { class: 'pt-chips' }, Object.values(chipEls));
}
function refreshChips() {
  if (!chipEls) return; const d = chipData();
  for (const k in chipEls) chipEls[k].set(d[k]);
}

function tileInfo() {
  const W = ctx.world, S = ctx.state, c = S.career(), t = P.town, mods = P.mods, fmt = ctx.ui.fmt;
  const fs = c.fleet[0], rescue = PC.pendingRescues(c, townId);
  const nt = PC.nextTitle(c, t.nation), eligible = nt && PC.nationFame(c, t.nation, mods) >= nt.fame && (c.standing[t.nation] || 0) > 0;
  const dmg = c.fleet.reduce((a, s) => a + PC.repairCost(s, mods), 0);
  const pr = PC.prices(c, t, mods);
  const best = W.GOOD_IDS.slice().sort((a, b) => pr[b].sell / W.GOODS[b].base - pr[a].sell / W.GOODS[a].base)[0];
  const cheap = W.GOOD_IDS.find(g => t.produces === g);
  const clue = PC.clueFor(c, townId), frag = PC.fragmentForSale(c, townId), govFrag = PC.fragmentFromGovernor(c, townId);
  const gov = sneak && !visit.pardon ? { note: 'Guards stand at the door. A pardon from the tavern would get you in.', off: true }
    : sneak ? { note: 'Your pardon gets you past the guards, just this once.', badge: govFrag ? 'Map' : 'Pardon' }
    : rescue.length ? { note: `The governor has news about ${rescue[0].name}!`, badge: 'Family!' }
    : eligible ? { note: `An audience is granted. ${W.NATIONS[t.nation].name} may have a new title for you.`, badge: 'Reward' }
    : govFrag ? { note: `${t.governor} keeps a torn piece of an old treasure map.`, badge: 'Map' }
    : { note: `Ask ${t.governor} for titles and news of the wars.` };
  const tav = rescue.length ? { note: `Someone here knows where ${rescue[0].name} is held!`, badge: 'Family!' }
    : clue ? { note: `A stranger in the corner says he knows your ${clue.relation}.`, badge: 'New clue' }
    : frag ? { note: `A traveller is selling a piece of a treasure map.`, badge: 'Map' }
    : { note: 'Hire sailors and listen to the latest gossip.' };
  const holdNote = `Hold: ${PC.cargoUsed(c)} of ${PC.cargoCap(c)} tons.`;
  return [
    { id: 'governor', n: 'I', title: 'Governor', ...gov },
    { id: 'tavern', n: 'II', title: 'Tavern', ...tav },
    { id: 'merchant', n: 'III', title: 'Merchant', note: `${cheap ? `${W.GOODS[cheap].name} ${pl(cheap) ? 'are' : 'is'} cheap here. ` : ''}${W.GOODS[best].name} ${pl(best) ? 'sell' : 'sells'} well. ${holdNote}` },
    { id: 'shipwright', n: 'IV', title: 'Shipwright', off: sneak,
      note: sneak ? "The shipwright won't work for strangers." : dmg > 0 ? `Repair your ships (${fmt(dmg)} gold) or buy a bigger one.` : `${fs.name} is shipshape. Buy guns, upgrades or a new ship.`,
      badge: !sneak && PC.hullPct(fs) < 70 ? 'Repairs' : '' },
    { id: 'log', n: 'V', title: 'Captain’s Log', note: 'Your standing, fleet, cargo and family search.' },
    { id: 'retire', n: 'VI', title: 'Retire', off: sneak,
      note: sneak ? "You can't settle down in a town that wants you in irons." : `Hang up your sword and count up your ${fmt(c.gold)} gold, land, titles and family.`,
      badge: !sneak && c.age >= 50 ? 'Time to rest?' : '' },
  ];
}
const pl = g => /s$/.test(g); // spices, hides
// illustration for each tile: the port's own character, or the shared Log / Retire art
const ROLE_TILES = ['governor', 'tavern', 'merchant', 'shipwright'];
const tilePic = id => ROLE_TILES.includes(id) ? `port-${townId}-${id}` : `port-any-${id}`;
function tiles() {
  const { h } = ctx.ui;
  return h('div', { class: 'pt-tiles' }, tileInfo().map(b => h('button', {
    class: 'pt-tile has-pic' + (b.off ? ' off' : ''), dataset: { tile: b.id }, disabled: b.off,
    style: { backgroundImage: `linear-gradient(180deg, rgba(16,32,47,0) 28%, rgba(16,32,47,.82) 64%, rgba(16,32,47,.97) 100%), url(${ctx.ui.imgUrl(tilePic(b.id))})` },
    onTap: () => tileTap(b.id),
  },
  h('div', { class: 'pt-tile-n' }, b.n),
  b.badge ? h('div', { class: 'pt-badge' }, b.badge) : null,
  h('div', { class: 'pt-tile-title' }, b.title),
  h('div', { class: 'pt-tile-note' }, b.note))));
}
async function retireNow() {
  const ok = await ctx.ui.confirm({ title: 'Retire from the sea?', text: "Your adventure ends here. Your gold, land, titles and family are counted up for your final score.", ok: 'Retire', cancel: 'Not yet' });
  if (ok && ctx.mode === 'port') ctx.go('retire', { townId });
}
function tileTap(id) {
  if (id === 'retire') { retireNow(); return; }
  if (id === 'log') { ctx.go('log'); return; }
  openPanel(id);
}

function bottomBar() {
  const { h } = ctx.ui, S = ctx.state, c = S.career(), fs = c.fleet[0];
  let line;
  if (sneak) line = `You're in disguise. ${fs.name} waits in a quiet cove outside town.`;
  else {
    const mood = S.moraleLabel(c.morale).toLowerCase();
    line = `${fs.name} is moored with a ${PC.hullPct(fs)}% hull. The crew is ashore and ${mood === 'mutinous' ? 'very cross' : mood}.`;
    if (S.foodDays(c) < 10) line += ' Food is running low!';
  }
  return h('div', { class: 'pt-bottom' },
    h('div', { class: 'pt-status' }, line),
    h('button', { class: 'gold-btn pt-leave', onTap: leavePort }, 'Leave Port'));
}
function leavePort() {
  const c = ctx.state.career();
  c.location = { kind: 'sea', townId };
  ctx.audio.play('bell');
  ctx.go('sail', { fromTown: townId });
}

function panelView() {
  const { h } = ctx.ui, mod = PANELS[panel];
  const head = mod.title(P);
  let body;
  try { body = mod.render(P); } catch (e) { console.error('[port panel]', e); body = h('div', null, 'Something went wrong.'); }
  return h('div', { class: `navy-frame pt-panel pt-panel-${panel}${fresh ? ' fresh' : ''}` },
    h('div', { class: 'parchment pt-panel-in' },
      h('div', { class: 'pt-ph' },
        ROLE_TILES.includes(panel) ? ctx.ui.pic(tilePic(panel), 'pt-ph-pic') : null,
        h('div', { class: 'pt-ph-text' },
          h('div', { class: 'pt-ph-title' }, head.title),
          head.sub ? h('div', { class: 'pt-ph-sub' }, head.sub) : null),
        h('button', { class: 'x-btn pt-close', 'aria-label': 'Close', onTap: () => P.close() }, '✕')),
      h('div', { class: 'pt-pbody' }, body)));
}
