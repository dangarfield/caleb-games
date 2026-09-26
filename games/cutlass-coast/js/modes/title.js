// title.js — 1a: choose captain (Caleb / Ezra) and new-career setup, over the harbour-at-dusk backdrop.
import * as THREE from 'three';
import { showStory } from '../story.js';

let ctx = null, root = null, scene = null, camera = null, backdrop = null;
let view = 'choose', newFor = null;
const picks = { nation: 'england', difficulty: 'journeyman', skill: 'fencing' };

export default {
  enter(c) {
    ctx = c; view = 'choose'; newFor = null;
    buildBackdrop();
    root = ctx.ui.mount('title', null);
    render();
    ctx.audio.theme('normal');
    ctx.audio.ambience(true);
  },
  exit() {
    ctx.audio.ambience(false); // the normal theme carries on into the game
    if (backdrop) { try { backdrop.dispose ? backdrop.dispose() : ctx.engine.disposeTree(backdrop.root); } catch (e) { console.error(e); } }
    backdrop = null; scene = null; camera = null; root = null;
  },
  update(dt, t) { if (backdrop && backdrop.update) backdrop.update(dt, t, camera); for (const f of flags) if (f.el.isConnected) f.draw(t); },
};

function buildBackdrop() {
  const PLT = ctx.PLT;
  if (!PLT || !PLT.scenes || !PLT.scenes.titleHarbour) return;
  try {
    backdrop = PLT.scenes.titleHarbour();
    scene = new THREE.Scene(); scene.add(backdrop.root);
    camera = new THREE.PerspectiveCamera(45, ctx.engine.aspect(), 0.5, 6000);
    camera.position.set(0, 12, 60); camera.lookAt(0, 4, 0);
    ctx.engine.setView(scene, camera);
  } catch (e) { console.error('titleHarbour failed', e); backdrop = null; }
}

function render() {
  const { h } = ctx.ui;
  root.replaceChildren(
    h('div', { class: 'title-shade' + (backdrop ? '' : ' no-3d') }),
    h('div', { class: 'title-hero' },
      h('div', { class: 'title-kicker' }, 'THE SPANISH MAIN · 1660'),
      h('h1', { class: 'title-name' }, 'Cutlass Coast'),
      h('div', { class: 'title-rule' }),
      h('p', { class: 'title-blurb' }, 'Trade, duel and plunder your way across the Caribbean. Find your lost family and retire before age catches up with you.')),
    h('div', { class: 'navy-frame title-panel' },
      h('div', { class: 'parchment title-parch' }, view === 'choose' ? chooseView() : newCareerView())));
}

// ---------- choose captain ----------
function chooseView() {
  const { h } = ctx.ui;
  return [
    h('div', { class: 'title-head' },
      h('div', { class: 'title-h2' }, "Who's sailing today?"),
      h('div', { class: 'title-sub' }, 'One saved career each')),
    h('div', { class: 'captain-grid' }, ctx.state.SLOTS.map(captainCard)),
  ];
}
function captainCard(slotId) {
  const { h, fmt } = ctx.ui, S = ctx.state, s = S.slot(slotId), c = s.career, top = s.topScore;
  const name = S.SLOT_NAMES[slotId];
  const age = c ? c.age : 20;
  const ageW = c ? Math.max(3, Math.min(100, Math.round((age - 18) / (55 - 18) * 100))) : 0;
  const found = c ? c.family.filter(f => f.found).length : 0;
  const stats = [
    ['Last voyage', c ? `${S.fmtDate(c.date)} · ${S.locationText(c)}` : 'Not yet sailed'],
    ['Gold', c ? `${fmt(c.gold)} gold` : '—'],
    ['Family found', `${found} of 4`],
    ['Top score', top ? `${top.points} pts · retired at ${top.retiredAge}` : 'None yet'],
  ];
  return h('div', { class: 'captain-card', dataset: { slot: slotId } },
    h('div', { class: 'cc-top' },
      ctx.ui.pic(S.captainPic(slotId, age), 'cc-portrait'),
      h('div', { class: 'cc-id' },
        h('div', { class: 'cc-name' }, name),
        h('div', { class: 'cc-rank' }, S.rankText(c)),
        h('div', { class: 'cc-age' },
          h('div', { class: 'cc-age-row' }, h('span', null, c ? `Age ${age}` : 'Age —'), h('span', null, c ? `Health ${c.health.toLowerCase()}` : '')),
          h('div', { class: 'cc-age-bar' }, h('div', { style: { width: ageW + '%', background: age > 44 ? '#b86a3a' : '#7a9a5a' } })),
          h('div', { class: 'cc-age-note' }, 'Most captains retire before 55')))),
    h('div', { class: 'cc-stats' }, stats.map(([k, v]) => h('div', { class: 'cc-stat' }, h('span', null, k), h('b', null, v)))),
    h('div', { class: 'cc-btns' },
      h('button', { class: 'gold-btn cc-continue', disabled: !c, onTap: () => continueCareer(slotId) }, 'Continue'),
      h('button', { class: 'ink-btn cc-new', onTap: () => { newFor = slotId; view = 'new'; render(); } }, 'New career')));
}
function continueCareer(slotId) {
  const S = ctx.state; const c = S.setActive(slotId); if (!c) return;
  if (c.location && c.location.kind === 'port' && c.location.townId) ctx.go('port', { townId: c.location.townId });
  else ctx.go('sail', {});
}

// ---------- new career ----------
// the nation picker's flags wave like the ones on the ships (same artwork: PLT.utils.drawFlag)
let flags = [];
function wavyFlag(nation) {
  const FW = 84, FH = 52, PAD = 8, draw = ctx.PLT && ctx.PLT.utils && ctx.PLT.utils.drawFlag;
  const src = document.createElement('canvas'); src.width = FW; src.height = FH;
  if (draw) draw(src.getContext('2d'), FW, FH, nation); else { const g = src.getContext('2d'); g.fillStyle = ctx.world.NATIONS[nation].color; g.fillRect(0, 0, FW, FH); }
  const el = document.createElement('canvas'); el.width = FW + PAD + 6; el.height = FH + PAD * 2; el.className = 'nc-flag';
  const g = el.getContext('2d'), STEP = 3, phase = nation.length * 0.7;
  const f = { el, draw(t) {
    g.clearRect(0, 0, el.width, el.height);
    g.fillStyle = '#5a3d22'; g.fillRect(0, 2, 4, el.height - 2); g.fillStyle = '#e0b35a'; g.beginPath(); g.arc(2, 3, 3, 0, 7); g.fill(); // pole + finial
    for (let x = 0; x < FW; x += STEP) {
      const k = x / FW, a = x * 0.11 - t * 4.2 + phase, y = Math.sin(a) * 4.5 * k, shade = Math.cos(a) * 0.16 * k;
      g.drawImage(src, x, 0, STEP, FH, 5 + x, PAD + y, STEP + 0.6, FH);
      g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`; g.fillRect(5 + x, PAD + y, STEP + 0.6, FH);
    }
  } };
  f.draw(0); flags.push(f); return el;
}
const SKILL_SVG = {
  fencing: '<path d="M6 6l18 18M26 6L8 24"/><path d="M20 26l6-6M6 20l6 6"/><circle cx="26" cy="26" r="2"/><circle cx="6" cy="26" r="2"/>',
  gunnery: '<path d="M5 17l17-7 3 6-17 7z"/><circle cx="11" cy="24" r="4"/><path d="M25 13h3M26 9l2-2M26 17l2 2"/>',
  navigation: '<circle cx="16" cy="16" r="11"/><path d="M16 7l3 9-3 9-3-9z"/><path d="M16 3v2M16 27v2M3 16h2M27 16h2"/>',
  medicine: '<path d="M12 4h8M13 4v6l-5 8a6 6 0 0 0 5 10h6a6 6 0 0 0 5-10l-5-8V4"/><path d="M10 19h12"/>',
  wit: '<path d="M16 27s-10-6-10-13a5.5 5.5 0 0 1 10-3 5.5 5.5 0 0 1 10 3c0 7-10 13-10 13z"/><path d="M12 15q4 4 8 0"/>',
};
function skillIcon(id) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('class', 'nc-skill-ic'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = SKILL_SVG[id] || '<circle cx="16" cy="16" r="10"/>'; return s;
}

function newCareerView() {
  const { h, seg } = ctx.ui, S = ctx.state, W = ctx.world;
  const name = S.SLOT_NAMES[newFor], existing = S.slot(newFor).career;
  flags = []; // a fresh set of waving flags for this view
  queueMicrotask(updateSummary);
  return [
    h('div', { class: 'nc-head' },
      h('button', { class: 'ink-btn nc-back', 'aria-label': 'Back', onTap: () => { view = 'choose'; render(); } }, '←'),
      h('div', null,
        h('div', { class: 'title-h2' }, `New career for ${name}`),
        h('div', { class: 'title-sub' }, 'A fresh start at age 20 in 1660'))),
    existing ? h('div', { class: 'warn-box nc-warn' }, `This replaces ${name}'s saved career (${S.summary(existing)}).`) : null,
    h('div', { class: 'nc-row2' },
      h('div', { class: 'nc-group' }, h('div', { class: 'label-caps' }, 'SAIL FOR'),
        seg(W.NATION_IDS.map(id => ({ id, label: W.NATIONS[id].name, icon: wavyFlag(id) })), picks.nation, v => { picks.nation = v; updateSummary(); }, { cls: 'nc-seg nc-nation' })),
    ),
    h('div', { class: 'nc-group' }, h('div', { class: 'label-caps' }, 'SPECIAL SKILL'),
      seg(W.SKILLS.map(s => ({ id: s.id, label: s.name, note: s.note, icon: skillIcon(s.id) })), picks.skill, v => { picks.skill = v; updateSummary(); }, { cls: 'nc-tiles' })),
    summaryBox = h('div', { class: 'nc-summary' }),
    h('div', { class: 'nc-foot' },
      h('div', { class: 'nc-tip' }, 'Each year at sea ages your captain. Older captains duel more slowly.'),
      h('button', { class: 'gold-btn nc-go', onTap: setSail }, 'Set Sail')),
  ];
}
let summaryBox = null;
const SKILL_TEXT = {
  fencing: 'Your blade is quicker than most, so duels are a little easier.',
  gunnery: 'Your gun crews reload faster in a sea battle.',
  navigation: 'You know the winds and currents, so your ships sail faster.',
  medicine: 'You know your herbs and remedies, so age wears on you more slowly.',
  wit: 'Your charm wins better prices from merchants and faster favour from governors.',
};
function updateSummary() {
  if (!summaryBox) return;
  const W = ctx.world, d = W.difficultyById(picks.difficulty), home = W.townById(W.HOME_PORT[picks.nation]);
  summaryBox.replaceChildren(
    ctx.ui.h('div', { class: 'label-caps' }, 'YOUR VOYAGE BEGINS'),
    ctx.ui.h('p', null, `You set sail from ${home.name} for ${W.NATIONS[picks.nation].name}, aboard ${W.PLAYER_SHIP_NAME}: a sloop with 8 guns, 40 crew and ${ctx.ui.fmt(d.startGold)} gold. ${SKILL_TEXT[picks.skill]}`));
}
function setSail() {
  ctx.state.newCareer(newFor, { ...picks });
  ctx.audio.play('bell');
  // a new career opens with the story (four illustrated panels), then out to sea
  showStory(ctx, root, () => { if (ctx.mode === 'title') ctx.go('sail', { fresh: true }); });
}

// ---------- portrait (simple SVG; hair greys with age) ----------
