// log.js — 1g/1h Captain's Log (overlay). Tabs: Status, Fleet & Cargo, Maps, Journal. ✕ → ctx.back().
// params: { tab?: 'status'|'fleet'|'maps'|'journal', questId? }
import { fameLabel, countOf } from './log-helpers.js';
import { pieceCanvas } from './treasure-maps.js';
import { canTrack, isTracked, setTrack } from '../track.js';

let ctx = null, root = null, tab = 'status', sel = null;
const TABS = [['status', 'Status'], ['fleet', 'Fleet & Cargo'], ['maps', 'Quests'], ['journal', 'Journal']];
const UPGRADE_NAMES = { copper: 'Copper sheathing', sheathing: 'Copper sheathing', cotton: 'Cotton sails', sails: 'Cotton sails', guns: 'Extra guns', extraGuns: 'Extra guns' };

export default {
  overlay: true,
  enter(c, params = {}) {
    ctx = c; tab = TABS.some(t => t[0] === params.tab) ? params.tab : 'status';
    sel = params.questId ? { type: 'treasure', id: params.questId } : null;
    root = ctx.ui.mount('log', null);
    render();
  },
  exit() { root = null; ctx = null; },
  update() {},
};

function close() { ctx.back(); }

function render() {
  const { h } = ctx.ui, c = ctx.state.career();
  const body = !c ? h('div', { class: 'lg-empty' }, 'No career in progress.')
    : tab === 'fleet' ? fleetTab(c) : tab === 'maps' ? mapsTab(c) : tab === 'journal' ? journalTab(c) : statusTab(c);
  // keep each list's scroll position when we redraw (tapping a quest used to jump back to the top)
  const keep = [...root.querySelectorAll('.lg-scroll')].map(el => el.scrollTop);
  const sameTab = root.dataset.tab === tab; root.dataset.tab = tab;
  root.replaceChildren(
    h('div', { class: 'lg-back blocker' }),
    h('div', { class: 'lg-head' },
      h('div', { class: 'lg-title' }, "Captain's Log"),
      TABS.map(([id, name]) => h('button', { class: 'lg-tab' + (id === tab ? ' on' : ''), dataset: { tab: id }, onTap: () => { if (tab !== id) { tab = id; render(); } } }, name)),
      h('button', { class: 'x-btn lg-close', 'aria-label': 'Close', onTap: close }, '✕')),
    h('div', { class: 'navy-frame lg-frame' + (tab === 'status' ? ' first' : '') },
      h('div', { class: 'parchment lg-parch lg-t-' + tab }, body)));
  if (sameTab) root.querySelectorAll('.lg-scroll').forEach((el, i) => { if (keep[i]) el.scrollTop = keep[i]; });
}

// "Track" — puts an arrow on the sailing compass pointing at this quest
function trackBtn(c, type, id, onNote = 'Points an arrow there while you sail') {
  const { h } = ctx.ui, on = isTracked(c, type, id), ok = canTrack(c, type, id);
  const tapIt = () => {
    if (on) { setTrack(c, null); ctx.ui.toast('The arrow is off your compass.', { title: 'Stopped tracking' }); }
    else { setTrack(c, type, id); ctx.audio.play('bell'); ctx.ui.toast('Follow the gold arrow when you sail.', { title: 'Tracking on your compass' }); }
    ctx.save(); render();
  };
  return [
    h('button', { class: 'gold-btn lg-track' + (on ? ' marked' : ''), disabled: !on && !ok.ok, onTap: tapIt }, on ? '➤ Tracking ✓' : '➤ Track'),
    h('div', { class: 'lg-mark-note' }, on ? 'Tap again to stop tracking' : ok.ok ? onNote : ok.why),
  ];
}

// ---------------------------------------------------------------- Status (1g)
function standingRow(c, n) {
  const { h, fmt } = ctx.ui, W = ctx.world, S = ctx.state;
  const st = c.standing[n] || 0, title = c.titles[n];
  const rel = W.relation(c.nation, n, c.relations || W.RELATIONS_1660);
  const best = S.highestTitle(c);
  let sub = title ? title : 'No rank';
  if (title && best && best.nation === n && c.landAcres) sub += ` · ${fmt(c.landAcres)} acres`;
  if (!title && st <= -40) sub = `Wanted · ${fmt(Math.round(-st * 50 / 100) * 100)} gold bounty`;
  let tag = 'Peace', cls = 'peace';
  if (n === c.nation || st >= 40) { tag = 'Friendly'; cls = 'good'; }
  else if (rel === 'war' || st <= -30) { tag = 'At war'; cls = 'war'; }
  else if (st < 0) { tag = 'Wary'; cls = 'wary'; }
  return h('div', { class: 'lg-nation' },
    h('span', { class: 'lg-flag', style: { background: W.NATIONS[n].color } }),
    h('div', { class: 'lg-nat-id' }, h('span', { class: 'lg-nat-name' }, W.NATIONS[n].name), h('span', { class: 'lg-nat-sub' }, sub)),
    h('span', { class: 'lg-tag ' + cls }, tag));
}
function entryRow(e) {
  const { h } = ctx.ui;
  return h('div', { class: 'lg-entry' }, h('span', { class: 'lg-entry-d' }, ctx.state.fmtDateLong(e.date)), h('span', { class: 'lg-entry-t' }, e.t));
}
function statusTab(c) {
  const { h } = ctx.ui, S = ctx.state, W = ctx.world;
  const fame = Math.max(0, Math.round(c.fame));
  return [
    h('div', { class: 'lg-col lg-me' },
      ctx.ui.pic(ctx.state.captainPic(c.slot, c.age), 'lg-portrait'),
      h('div', { class: 'lg-name' }, `Captain ${c.name}`),
      h('div', { class: 'lg-meta' }, `Age ${c.age} · Health ${String(c.health).toLowerCase()} · ${W.skillById(c.skill).name}`),
      h('div', { class: 'lg-rank' }, S.rankText(c)),
      h('div', { class: 'lg-fame' },
        h('div', { class: 'lg-fame-row' }, h('span', null, 'Fame'), h('b', null, `${fameLabel(fame)} · ${fame}`)),
        h('div', { class: 'lg-fame-bar' }, h('div', { style: { width: Math.min(100, fame) + '%' } })))),
    h('div', { class: 'lg-col' },
      h('div', { class: 'label-caps' }, 'STANDING WITH THE NATIONS'),
      W.NATION_IDS.map(n => standingRow(c, n))),
    h('div', { class: 'lg-col lg-recent' },
      h('div', { class: 'label-caps' }, 'RECENT ENTRIES'),
      c.log.length ? c.log.slice(0, 5).map(entryRow) : h('div', { class: 'lg-none' }, 'Nothing written yet.')),
  ];
}

// ---------------------------------------------------------------- Fleet & Cargo
function fleetTab(c) {
  const { h, fmt } = ctx.ui, S = ctx.state, W = ctx.world;
  const ships = c.fleet.map((s, i) => {
    const cls = W.SHIP_CLASSES[s.type] || W.SHIP_CLASSES.sloop, pct = Math.round(100 * s.hull / (s.hullMax || cls.hull));
    return h('div', { class: 'lg-ship' },
      h('div', { class: 'lg-ship-top' },
        h('div', null, h('div', { class: 'lg-ship-name' }, s.name || cls.name), h('div', { class: 'lg-ship-cls' }, `${cls.name}${i === 0 ? ' · Flagship' : ''}`)),
        h('div', { class: 'lg-ship-guns' }, h('b', null, s.guns), ' guns', h('span', { class: 'lg-ship-sep' }, ' · '), h('b', null, cls.cargo), ' t')),
      h('div', { class: 'lg-ship-bars' },
        ctx.ui.bar({ label: 'Hull', value: pct, color: pct > 60 ? '#4f7a47' : pct > 30 ? '#a3782f' : '#9a3a2e', text: pct + '%', dark: false }),
        ctx.ui.bar({ label: 'Sails', value: s.sails != null ? s.sails : 100, color: '#8a7650', text: Math.round(s.sails != null ? s.sails : 100) + '%', dark: false })),
      h('div', { class: 'lg-upgrades' }, (s.upgrades && s.upgrades.length ? s.upgrades : []).map(u => h('span', { class: 'lg-up' }, UPGRADE_NAMES[u] || u)),
        !(s.upgrades && s.upgrades.length) ? h('span', { class: 'lg-up none' }, 'No upgrades') : null));
  });
  const cap = c.fleet.reduce((t, s) => t + ((W.SHIP_CLASSES[s.type] || {}).cargo || 0), 0);
  const tons = W.GOOD_IDS.reduce((t, g) => t + (c.cargo[g] || 0), 0);
  const crewMax = c.fleet.reduce((t, s) => t + ((W.SHIP_CLASSES[s.type] || {}).crewMax || 0), 0);
  const m = Math.round(c.morale), food = S.foodDays(c);
  const stat = (k, v, sub, cls = '') => h('div', { class: 'lg-stat ' + cls }, h('div', null, h('span', { class: 'lg-stat-k' }, k), sub ? h('span', { class: 'lg-stat-sub' }, sub) : null), h('b', null, v));
  return [
    h('div', { class: 'lg-col lg-fleet' },
      h('div', { class: 'label-caps' }, `YOUR FLEET · ${c.fleet.length} ${c.fleet.length === 1 ? 'SHIP' : 'SHIPS'}`),
      h('div', { class: 'lg-scroll lg-ships' }, ships)),
    h('div', { class: 'lg-col' },
      h('div', { class: 'label-caps' }, 'CREW & STORES'),
      stat('Crew', ctx.ui.plural(c.crew, 'man', 'men'), `Room for ${crewMax}`),
      h('div', { class: 'lg-stat' }, h('div', null, h('span', { class: 'lg-stat-k' }, 'Morale')), h('b', { class: m < 45 ? 'bad' : '' }, S.moraleLabel(m))),
      ctx.ui.bar({ label: '', value: m, color: m >= 70 ? '#4f7a47' : m >= 45 ? '#a3782f' : '#9a3a2e', text: m, dark: false }),
      stat('Food', ctx.ui.plural(food, 'day'), `${Math.round(c.food)} barrels`, food < 5 ? 'warn' : ''),
      h('div', { class: 'label-caps lg-gap' }, `CARGO · ${tons} OF ${cap} TONS`),
      h('div', { class: 'lg-cargo' }, W.GOOD_IDS.map(g => h('div', { class: 'lg-good' }, h('span', null, W.GOODS[g].name), h('b', null, `${c.cargo[g] || 0} t`))))),
    h('div', { class: 'lg-col' },
      h('div', { class: 'label-caps' }, 'MONEY'),
      stat("Ship's purse", `${fmt(c.gold)} gold`, 'Counted for your final score'),
      stat('Land', c.landAcres ? `${fmt(c.landAcres)} acres` : 'None', 'Granted by governors'),
      h('div', { class: 'lg-note' }, `Days since you bought the crew a round: ${Math.floor(c.elapsed - (c.lastCheer || 0))}. The longer they go without, the grumpier they get. Buy one at any tavern.`)),
  ];
}

// ---------------------------------------------------------------- Maps (1h)
function questRows(c) {
  const W = ctx.world, rows = [];
  const found = c.treasuresFound || [];
  for (const q of W.TREASURE_QUESTS) {
    const fr = (c.mapFragments && c.mapFragments[q.id]) || [false, false, false, false];
    const n = fr.filter(Boolean).length, done = Array.isArray(found) && found.includes(q.id);
    rows.push({ type: 'treasure', id: q.id, name: n || done ? q.name : 'Unknown treasure map', count: done ? 'Found' : `${n} / 4`,
      note: done ? 'Dug up and brought home' : n === 0 ? 'No pieces yet · ask in taverns' : c.markedQuest === q.id ? 'Tracking · marked on your chart' : n === 4 ? 'Map complete!' : `${4 - n} ${4 - n === 1 ? 'piece' : 'pieces'} missing`, weight: done ? -1 : n });
  }
  for (const f of c.family || []) {
    const def = W.FAMILY.find(x => x.id === f.id) || f, t = W.townById(f.townId);
    rows.push({ type: 'family', id: f.id, pic: `family-${f.id}`, name: f.name || def.name, count: f.found ? 'Home' : `${f.clues} / 4`,
      note: f.found ? 'Rescued and safe' : f.clues >= 4 && t ? `Held in ${t.name}` : f.clues > 0 ? 'Clues are pointing the way' : 'Ask in any tavern' });
  }
  const caught = Array.isArray(c.villainsCaught) ? c.villainsCaught : [];
  for (const v of W.VILLAINS) {
    const t = W.townById(v.haunt), got = caught.includes(v.id);
    rows.push({ type: 'villain', id: v.id, pic: `villain-${v.id}`, name: v.name, count: got ? 'Caught' : 'Hunt', note: got ? 'Brought to justice' : `Spotted near ${t ? t.name : 'the islands'}` });
  }
  return rows;
}
function defaultSel(c, rows) {
  if (c.markedQuest && rows.some(r => r.type === 'treasure' && r.id === c.markedQuest)) return { type: 'treasure', id: c.markedQuest };
  const t = rows.filter(r => r.type === 'treasure').sort((a, b) => b.weight - a.weight)[0];
  return t ? { type: t.type, id: t.id } : { type: rows[0].type, id: rows[0].id };
}
function mapsTab(c) {
  const { h } = ctx.ui;
  const rows = questRows(c);
  if (!sel || !rows.some(r => r.type === sel.type && r.id === sel.id)) sel = defaultSel(c, rows);
  const group = (type, label) => [h('div', { class: 'label-caps lg-qgroup' }, label), rows.filter(r => r.type === type).map(r =>
    h('button', { class: 'lg-quest' + (r.pic ? ' has-av' : '') + (sel.type === r.type && sel.id === r.id ? ' on' : ''), dataset: { quest: r.id }, onTap: () => { sel = { type: r.type, id: r.id }; render(); } },
      r.pic ? ctx.ui.pic(r.pic, 'lg-q-av') : null,
      h('div', { class: 'lg-q-top' }, h('span', { class: 'lg-q-name' }, isTracked(c, r.type, r.id) ? '➤ ' + r.name : r.name), h('span', { class: 'lg-q-count' }, r.count)),
      h('span', { class: 'lg-q-note' }, r.note)))];
  const caughtN = countOf(c.villainsCaught);
  return [
    h('div', { class: 'lg-col lg-quests' },
      h('div', { class: 'label-caps' }, 'QUESTS'),
      h('div', { class: 'lg-scroll lg-qlist' }, group('treasure', 'TREASURE MAPS'), group('family', 'LOST FAMILY'), group('villain', `VILLAINS · ${caughtN} OF ${ctx.world.VILLAINS.length} CAUGHT`))),
    sel.type === 'treasure' ? treasureDetail(c, sel.id) : sel.type === 'family' ? familyDetail(c, sel.id) : villainDetail(c, sel.id),
  ];
}
function treasureDetail(c, id) {
  const { h, fmt } = ctx.ui, W = ctx.world, q = W.questById(id);
  const fr = (c.mapFragments && c.mapFragments[id]) || [false, false, false, false];
  const n = fr.filter(Boolean).length, done = Array.isArray(c.treasuresFound) && c.treasuresFound.includes(id);
  const tiles = [0, 1, 2, 3].map(i => (fr[i] || done)
    ? h('div', { class: 'lg-piece have' }, pieceCanvas(id, i), h('span', { class: 'lg-piece-n' }, `Piece ${i + 1}`))
    : h('div', { class: 'lg-piece missing' }, h('span', { class: 'lg-miss-h' }, 'Missing'), h('span', { class: 'lg-miss-t' }, (q.sources[i] && q.sources[i].hint) || 'Somewhere out there')));
  return h('div', { class: 'lg-detail' },
    h('div', { class: 'lg-pieces' }, tiles),
    h('div', { class: 'lg-side' },
      h('div', { class: 'lg-q-title' }, n || done ? q.name : 'Unknown treasure map'),
      h('div', { class: 'lg-q-blurb' }, n || done ? q.blurb : 'Nobody knows what this map shows yet. Its pieces are scattered across the Caribbean.'),
      h('div', { class: 'lg-guess' }, h('span', { class: 'label-caps' }, 'BEST GUESS'),
        h('span', { class: 'lg-guess-v' }, done ? 'Already dug up' : n >= 2 ? q.area : 'Find two pieces to guess')),
      done ? h('div', { class: 'lg-found' }, `Found! ${fmt(q.gold)} gold`) : [
        trackBtn(c, 'treasure', id, 'Points an arrow there and marks the search area on your chart'),
      ]));
}
function familyDetail(c, id) {
  const { h } = ctx.ui, W = ctx.world, f = c.family.find(x => x.id === id), t = W.townById(f.townId);
  const tiles = [1, 2, 3, 4].map(level => f.clues >= level || f.found
    ? h('div', { class: 'lg-piece clue' }, h('span', { class: 'lg-clue-n' }, `Clue ${level}`), h('span', { class: 'lg-clue-t' }, W.familyClue(f, f.townId, level)))
    : h('div', { class: 'lg-piece missing' }, h('span', { class: 'lg-miss-h' }, 'Missing'), h('span', { class: 'lg-miss-t' }, level === 1 ? 'Ask in any tavern' : 'Taverns and captured ships')));
  const blurb = { sister: 'Your little sister, carried off by the storm. She always loved the sea.', uncle: 'Your father\'s brother, a gruff old merchant who owes you a story or two.', aunt: 'Your aunt, who taught you to read the stars. Clever and stubborn.', grandfather: 'Grandfather sailed with Peg Leg Ted long ago. He knows every trick of the trade winds.' }[f.relation] || '';
  return h('div', { class: 'lg-detail' },
    h('div', { class: 'lg-pieces clues' }, tiles),
    h('div', { class: 'lg-side' },
      ctx.ui.pic(`family-${id}`, 'lg-fam-pic'),
      h('div', { class: 'lg-q-title' }, f.name),
      h('div', { class: 'lg-q-blurb' }, blurb),
      h('div', { class: 'lg-guess' }, h('span', { class: 'label-caps' }, f.found ? 'SAFE AT HOME' : 'WHERE'),
        h('span', { class: 'lg-guess-v' }, f.found ? 'Rescued' : f.clues >= 4 && t ? `${t.name} — visit the town` : f.clues >= 3 && t ? `Somewhere on ${W.isleName(t.isle)}` : f.clues >= 1 && t ? W.regionOf(t).name.replace(/^the /, 'The ') : 'Nobody knows yet')),
      h('div', { class: 'lg-mark-note' }, 'Each clue narrows it down. With all four, sail to the town to bring them home.'),
      f.found ? null : trackBtn(c, 'family', id)));
}
function villainDetail(c, id) {
  const { h, fmt } = ctx.ui, W = ctx.world, v = W.VILLAINS.find(x => x.id === id), t = W.townById(v.haunt);
  const got = Array.isArray(c.villainsCaught) && c.villainsCaught.includes(id);
  const q = v.fragment ? W.questById(v.fragment.questId) : null;
  return h('div', { class: 'lg-detail' },
    h('div', { class: 'lg-poster' + (got ? ' caught' : '') },
      h('div', { class: 'lg-poster-h' }, 'WANTED'),
      ctx.ui.pic(`villain-${id}`, 'lg-poster-pic'),
      h('div', { class: 'lg-poster-name' }, v.name),
      h('div', { class: 'lg-poster-sub' }, `Captain of the ${v.shipName}`),
      h('div', { class: 'lg-poster-reward' }, `${fmt(v.gold)} gold aboard`),
      got ? h('div', { class: 'lg-stamp' }, 'CAUGHT') : null),
    h('div', { class: 'lg-side' },
      h('div', { class: 'lg-q-title' }, v.name),
      h('div', { class: 'lg-q-blurb' }, `Sails a ${W.SHIP_CLASSES[v.ship].name.toLowerCase()} with about ${v.crew} cut-throats.${q ? ` Carries a piece of ${q.name}.` : ''}`),
      h('div', { class: 'lg-guess' }, h('span', { class: 'label-caps' }, got ? 'CAUGHT' : 'LAST SEEN'), h('span', { class: 'lg-guess-v' }, got ? 'Brought to justice' : `Near ${t ? t.name : 'the islands'}`)),
      got ? null : h('div', { class: 'lg-mark-note' }, 'Beat him at sea and win the duel to catch him.'),
      got ? null : trackBtn(c, 'villain', id)));
}

// ---------------------------------------------------------------- Journal
function journalTab(c) {
  const { h } = ctx.ui;
  return [
    h('div', { class: 'lg-journal-head' }, h('div', { class: 'label-caps' }, `THE JOURNAL · ${c.log.length} ENTRIES`), h('div', { class: 'lg-journal-sub' }, `Since ${ctx.state.fmtDateLong(c.startDate || c.date)}`)),
    h('div', { class: 'lg-scroll lg-journal' }, c.log.length ? c.log.map(e => h('div', { class: 'lg-jrow' }, h('span', { class: 'lg-entry-d' }, ctx.state.fmtDateLong(e.date)), h('span', { class: 'lg-entry-t' }, e.t))) : h('div', { class: 'lg-none' }, 'Nothing written yet.')),
  ];
}
