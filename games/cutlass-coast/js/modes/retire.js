// retire.js — 1j Retirement & final score. params {forced?, townId?}.
// Computes the score (spec §5.8), writes a life story, calls state.endCareer(slot, points) exactly once.
// Buttons: Hall of Fame (in-screen panel), New Career (→ title), ← Arcade (../../index.html).
import * as THREE from 'three';
import { countOf, wifeName } from './log-helpers.js';

let ctx = null, root = null, scene = null, camera = null, bd = null, fx = null, captainFig = null;
let result = null, hallOpen = false, fwTimer = 0, fwRate = 0, offResize = null;
const _p = new THREE.Vector3();

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
function numWord(n) { n = Math.max(0, Math.round(n)); if (n <= 20) return NUM[n]; if (n < 60) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : ''); return String(n); }
const REL_WORD = { sister: 'sister', uncle: 'uncle', aunt: 'aunt', grandfather: 'grandfather' };

/** Score per spec §5.8 → { rows:[{k,sub,v}], points, rank }. Pure: reads the career only. */
export function computeScore(c, W, S) {
  const fmt = n => Math.round(n).toLocaleString('en-GB');
  const rows = [];
  const wealth = Math.max(0, c.gold || 0);
  rows.push({ k: 'Gold', sub: `${fmt(wealth)} gold`, v: Math.min(40, Math.round(Math.sqrt(wealth) / 7)) }); // gentle curve: 8k → 13, 20k → 20, 50k → 32, 80k+ → 40
  rows.push({ k: 'Land granted', sub: c.landAcres ? `${fmt(c.landAcres)} acres` : 'None', v: Math.min(20, Math.floor((c.landAcres || 0) / 1000)) });
  const best = S.highestTitle(c);
  rows.push({ k: 'Highest title', sub: best ? `${best.name} of ${W.NATIONS[best.nation].name}` : 'None', v: best ? Math.round((best.index + 1) * 20 / W.TITLES.length) : 0 });
  const found = (c.family || []).filter(f => f.found).length;
  rows.push({ k: 'Family rescued', sub: `${found} of ${(c.family || []).length || 4}`, v: found * 5 });
  rows.push({ k: 'Married', sub: c.wife ? wifeName(c.wife) : 'Never wed', v: c.wife ? 10 : 0 });
  const tr = countOf(c.treasuresFound);
  rows.push({ k: 'Treasures found', sub: String(tr), v: tr * 4 });
  const vi = countOf(c.villainsCaught);
  rows.push({ k: 'Villains caught', sub: String(vi), v: vi * 3 });
  const past = Math.max(0, c.age - 40);
  rows.push({ k: 'Years at sea', sub: `Retired at ${c.age}`, v: -Math.floor(past / 5) });
  const sub = rows.reduce((t, r) => t + r.v, 0);
  const d = W.difficultyById(c.difficulty);
  if (d.scoreMult > 1 && sub > 0) rows.push({ k: 'Difficulty bonus', sub: `${d.name} × ${d.scoreMult}`, v: Math.round(sub * (d.scoreMult - 1)) });
  const points = Math.max(0, rows.reduce((t, r) => t + r.v, 0));
  return { rows, points, rank: W.rankForPoints(points) };
}

function rankPhrase(rank, town, isle) {
  switch (rank) {
    case 'Beggar': return `retires as a beggar on the docks of ${town}`;
    case 'Pauper': return `retires a pauper in ${town}`;
    case 'Laborer': return `retires as a dock labourer in ${town}`;
    case 'Farmer': return `retires to a little farm near ${town}`;
    case 'Merchant': return `retires as a merchant of ${town}`;
    case 'Plantation Owner': return `retires as a plantation owner on ${isle || town}`;
    case 'Mayor': return `retires as Mayor of ${town}`;
    case 'Governor': return `retires as Governor of ${town}`;
    default: return "retires as the King's Advisor";
  }
}
function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

function lifeStory(c, W, S, rank, town, forced) {
  const y0 = (c.startDate || { y: 1660 }).y, y1 = c.date.y, years = Math.max(1, Math.round((c.elapsed || 0) / 365.25) || y1 - y0);
  const kicker = `${y0} – ${y1} · ${numWord(years).toUpperCase()} ${years === 1 ? 'YEAR' : 'YEARS'} AT SEA`;
  const headline = `Captain ${c.name} ${rankPhrase(rank, town.name, ctx.world.isleName(town.isle))}`;
  const parts = [];
  if (c.wife) parts.push(`He married ${wifeName(c.wife)}.`);
  const fam = (c.family || []).filter(f => f.found).map(f => { const t = W.townById(f.townId); return `his ${REL_WORD[f.relation] || f.relation || 'kin'}${t ? ' in ' + t.name : ''}`; });
  if (fam.length) parts.push(`He found ${listJoin(fam)}.`);
  const did = [];
  const tq = Array.isArray(c.treasuresFound) ? c.treasuresFound.map(id => W.questById(id)).filter(Boolean) : [];
  if (tq.length) did.push('dug up ' + listJoin(tq.map(q => q.name.replace(/^The /, 'the ').replace(/^Treasure/, 'the treasure'))));
  else if (countOf(c.treasuresFound)) did.push(`dug up ${numWord(countOf(c.treasuresFound))} buried treasures`);
  const vs = Array.isArray(c.villainsCaught) ? c.villainsCaught.map(id => W.VILLAINS.find(v => v.id === id)).filter(Boolean) : [];
  if (vs.length) did.push('brought ' + listJoin(vs.map(v => v.name)) + ' to justice');
  if (did.length) parts.push(`He ${did.join(' and ')}.`);
  if (!parts.length) parts.push(`He sailed the Caribbean for ${numWord(years)} ${years === 1 ? 'year' : 'years'} and lived to tell the tale.`);
  const best = S.highestTitle(c);
  if (best) parts.push(`${W.NATIONS[best.nation].name} made him a ${best.name}${c.landAcres ? ` with ${Math.round(c.landAcres).toLocaleString('en-GB')} acres of land` : ''}.`);
  if (!fam.length) parts.push('His lost family are still out there somewhere.');
  let foe = null; for (const n of W.NATION_IDS) if ((c.standing[n] || 0) < -20 && (!foe || c.standing[n] < c.standing[foe])) foe = n;
  if (foe) parts.push(`${W.NATIONS[foe].name} never caught him.`);
  if (forced) parts.push('In the end his health forced him ashore.');
  return { kicker, headline, story: parts.join(' ') };
}

export default {
  enter(c, params = {}) {
    ctx = c; hallOpen = false; fwTimer = 0;
    const S = ctx.state, W = ctx.world, car = S.career();
    if (car) {
      const slot = car.slot || S.activeSlot();
      const prev = S.slot(slot).topScore;
      const sc = computeScore(car, W, S);
      const tId = params.townId || (car.location && car.location.townId) || W.HOME_PORT[car.nation];
      const town = W.townById(tId) || W.townById(W.HOME_PORT[car.nation]);
      const life = lifeStory(car, W, S, sc.rank.name, town, !!params.forced);
      result = { ...sc, ...life, slot, name: car.name, age: car.age, forced: !!params.forced, record: !prev || sc.points > prev.points };
      S.endCareer(slot, sc.points); // exactly once: the career is cleared here
      ctx.audio.play(sc.rank.min >= 52 ? 'fanfare' : 'bell');
    } else if (!result) {
      result = null; hallOpen = true; // nothing to score (e.g. came here without a career): just the Hall of Fame
    }
    buildScene();
    root = ctx.ui.mount('retire', null);
    render();
    offResize = ctx.engine.onResize(fitView);
    requestAnimationFrame(fitView);
  },
  exit() {
    if (offResize) offResize(); offResize = null;
    if (fx) { try { fx.dispose(); } catch (e) {} } fx = null;
    if (captainFig) { try { captainFig.dispose(); } catch (e) {} } captainFig = null;
    if (bd) { try { bd.dispose(); } catch (e) { console.error(e); } } bd = null;
    if (camera) camera.clearViewOffset();
    scene = null; camera = null; root = null; result = null;
  },
  update(dt, t) {
    if (!bd) return;
    bd.update(dt, t, null);
    if (bd.sky) bd.sky.update(camera);
    if (captainFig) captainFig.update(dt);
    if (fx) {
      if (fwRate > 0) {
        fwTimer -= dt;
        if (fwTimer <= 0) {
          fwTimer = fwRate * (0.6 + Math.random() * 0.8);
          _p.set(-4 + (Math.random() - 0.5) * 16, 15 + Math.random() * 12, -48 + (Math.random() - 0.5) * 12);
          fx.fireworks.spawn(_p, Math.random() < 0.3 ? { color: ['#ffd76a', '#ff6a5a', '#8fd8ff'][Math.floor(Math.random() * 3)] } : undefined);
        }
      }
      fx.update(dt);
    }
  },
};

function buildScene() {
  const PLT = ctx.PLT; if (!PLT || !PLT.scenes) return;
  try {
    bd = PLT.scenes.titleHarbour();
    const ri = result ? ctx.world.RETIRE_RANKS.findIndex(r => r.name === result.rank.name) : 4;
    bd.setPreset(ri >= 5 ? 'night' : 'dusk');
    fwRate = ri >= 6 ? 0.45 : ri >= 3 ? 1.6 : 0;
    scene = new THREE.Scene(); scene.add(bd.root);
    camera = new THREE.PerspectiveCamera(50, ctx.engine.aspect(), 0.5, 3000);
    camera.position.set(16, 7, 8); camera.lookAt(-4, 12, -48);
    fx = PLT.fx.create(scene);
    // the captain on the sloop's deck, cheering if it went well
    const sloop = bd.ships && bd.ships.sloop;
    if (sloop && result) {
      captainFig = PLT.characters.captain({ who: result.slot === 'ezra' ? 'ezra' : 'caleb', age: result.age });
      const y = sloop.userData.deckY ? sloop.userData.deckY(0.2) : 1.5;
      captainFig.position.set(0, y, 1.2); captainFig.rotation.y = Math.PI * 0.9;
      captainFig.setWeapon(null); captainFig.setAction(ri >= 3 ? 'cheer' : 'idle');
      sloop.add(captainFig);
    }
    ctx.engine.setView(scene, camera);
  } catch (e) { console.error('retire scene failed', e); bd = null; fx = null; }
}
/** Centre the 3D view inside the vignette window (the parchment covers the rest). */
function fitView() {
  if (!camera || !root) return;
  const win = root.querySelector('.rt-window'); if (!win) return;
  const r = win.getBoundingClientRect(), W = ctx.engine.size.w, H = ctx.engine.size.h;
  if (!r.width || !W) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  camera.aspect = W / H;
  camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  camera.updateProjectionMatrix();
  if (fx && fx.setPixelScale) fx.setPixelScale(H * ctx.engine.renderer.getPixelRatio(), camera.fov);
}

function render() {
  const { h } = ctx.ui;
  const kids = [h('div', { class: 'rt-top-shade' })];
  if (result) {
    const R = result;
    kids.push(h('div', { class: 'rt-frame' },
      h('div', { class: 'rt-window has-pic', style: { backgroundImage: `url(${ctx.ui.imgUrl('retire-' + R.rank.name.toLowerCase().replace(/'/g, '').replace(/ /g, '-'))})` } }, h('div', { class: 'rt-plate' }, h('span', { class: 'label-caps' }, 'FINAL RANK'), h('b', null, R.rank.name))),
      h('div', { class: 'parchment rt-parch' },
        h('div', { class: 'rt-story' },
          R.forced ? h('div', { class: 'warn-box rt-forced' }, 'Your health forced you ashore.') : null,
          h('div', { class: 'rt-kicker' }, R.kicker),
          h('div', { class: 'rt-headline' }, R.headline),
          h('div', { class: 'rt-text' }, R.story),
          h('div', { class: 'rt-btns' },
            h('button', { class: 'gold-btn rt-hof', onTap: () => { hallOpen = true; render(); } }, 'Hall of Fame'),
            h('button', { class: 'ink-btn rt-new', onTap: () => ctx.go('title') }, 'New Career'),
            h('a', { class: 'ink-btn rt-arcade', href: '../../index.html', onPointerdown: () => { ctx.state.save(); ctx.state.flush(); } }, '← Games'))),
        h('div', { class: 'rt-tally' },
          h('div', { class: 'label-caps' }, 'THE TALLY'),
          R.rows.map(r => h('div', { class: 'rt-row' }, h('div', { class: 'rt-k' }, h('span', null, r.k), h('small', null, r.sub)),
            h('b', { class: r.v < 0 ? 'neg' : r.v > 0 ? 'pos' : 'zero' }, r.v > 0 ? '+' + r.v : r.v < 0 ? '−' + (-r.v) : '0'))),
          h('div', { class: 'rt-final' }, h('span', null, 'Final score'), h('b', null, R.points)),
          R.record ? h('div', { class: 'rt-record' }, `A new best for ${R.name}!`) : null))));
  }
  if (hallOpen) kids.push(hallPanel());
  root.replaceChildren(...kids);
}

function hallPanel() {
  const { h } = ctx.ui, S = ctx.state, W = ctx.world;
  const card = id => {
    const s = S.slot(id), top = s && s.topScore, rank = top ? W.rankForPoints(top.points).name : null;
    const mine = result && result.slot === id;
    return h('div', { class: 'rt-hcard' + (mine ? ' mine' : '') },
      h('div', { class: 'rt-hname' }, S.SLOT_NAMES[id]),
      top ? [h('div', { class: 'rt-hpts' }, h('b', null, top.points), ' points'),
        h('div', { class: 'rt-hsub' }, `${rank} · retired at ${top.retiredAge}`)]
        : h('div', { class: 'rt-hsub' }, 'No retirement yet'),
      s && s.career ? h('div', { class: 'rt-hnow' }, `Now at sea · age ${s.career.age}`) : null);
  };
  return h('div', { class: 'dialog-back rt-hall-back' },
    h('div', { class: 'navy-frame rt-hall' },
      h('div', { class: 'parchment rt-hall-in' },
        h('div', { class: 'rt-hall-h' }, 'Hall of Fame'),
        h('div', { class: 'rt-hall-sub' }, 'The best retirement for each captain'),
        h('div', { class: 'rt-hcards' }, S.SLOTS.map(card)),
        h('div', { class: 'rt-hall-btns' },
          result ? h('button', { class: 'x-btn', 'aria-label': 'Close', onTap: () => { hallOpen = false; render(); } }, '✕') : null,
          h('button', { class: 'gold-btn', onTap: () => ctx.go('title') }, 'New Career')))));
}
