// Every bit of DOM: screen routing, the combing HUD, find toasts, the beach
// picker, the milestone list and the collection totals sheet.

import {
  GLASS, GLASS_IDS, RARITY, BEACHES, BOTTLES, BOTTLE_BY_ID, MILESTONES,
  MILESTONE_BY_ID, beachGlassChances, globalGlassChance, pctLabel, hexCss,
} from './data.js';
import { PLAYERS, playerSummary, totalPieces, coloursFound } from './storage.js';
import { progressOf } from './unlocks.js';
import { MOVES, state as moveState } from './moves.js';

export const el = (id) => document.getElementById(id);

const SCREENS = {
  player: ['screen-player'],
  beach: ['screen-beach'],
  combing: ['hud', 'moveBar', 'bottomBar'],
  collection: ['collectionUI'],
  unlocks: ['screen-unlocks'],
};
// `tips` is hidden on every screen change but only revealed by setTip().
const ALL = [...new Set([...Object.values(SCREENS).flat(), 'tips'])];

export let currentScreen = 'player';

export function showScreen(name) {
  currentScreen = name;
  for (const id of ALL) el(id).classList.add('hidden');
  for (const id of SCREENS[name] || []) el(id).classList.remove('hidden');
  el('backBtn').style.display = 'block';
}

/** "1 piece", "2 pieces" — the singular turned up on a brand new player. */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- player select --------------------------------------------------------
export function renderPlayerCards(onPick) {
  const box = el('playerCards');
  box.innerHTML = '';
  for (const p of PLAYERS) {
    const s = playerSummary(p.id);
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML =
      `<div class="pav">${p.avatar}</div>` +
      `<div class="pname">${p.name}</div>` +
      `<div class="pstat">${plural(s.pieces, 'piece')} &bull; ${s.weight}g<br>` +
      `${s.ceramics} ceramic${s.ceramics === 1 ? '' : 's'} rebuilt</div>`;
    card.addEventListener('click', () => onPick(p.id));
    box.appendChild(card);
  }
}

// --- beach select ---------------------------------------------------------
export function renderBeachGrid(save, onPick) {
  const grid = el('beachGrid');
  grid.innerHTML = '';
  for (const b of BEACHES) {
    const unlocked = save.unlocked.beaches.includes(b.id);
    const card = document.createElement('div');
    card.className = 'beach-card' + (unlocked ? '' : ' locked');
    card.style.background = b.cardGradient;

    const stones = b.stones.map((h) =>
      `<span class="swatch" style="background:${hexCss(h)}"></span>`).join('');
    // Beaches differ by stone SIZE as much as by colour, and that is the thing a
    // player feels while combing, so the card says which sort of ground it is.
    const grade = stoneGrade(b);
    // Which colours turn up here, commonest first — but NO numbers. The chance
    // per piece lives in the Collection, where a player who wants the detail can
    // go and read it; on the way out of the door it is just noise.
    const glass = beachGlassChances(b).map(({ id }) => {
      const r = GLASS[id].rarity;
      return `<span class="swatch glass ${r}" title="${GLASS[id].name}" ` +
        `style="background:${hexCss(GLASS[id].hex)}"></span>`;
    }).join('');

    const found = (save.ceramics[b.id] || []).length;
    const done = save.completed.includes(b.id);

    card.innerHTML =
      `<div class="bname">${b.name}</div>` +
      `<div class="bblurb">${b.blurb}</div>` +
      `<div class="prow"><span class="plabel">Stones &bull; ${grade}</span>${stones}</div>` +
      `<div class="prow"><span class="plabel">Glass found here</span>${glass}</div>` +
      `<div class="cerbar">${done ? '✔ ' + b.ceramic.name + ' rebuilt'
        : b.ceramic.name + ' — ' + found + '/10 shards'}</div>`;

    if (!unlocked) {
      const m = MILESTONE_BY_ID[b.lock.milestone];
      const p = progressOf(save, m);
      const lock = document.createElement('div');
      lock.className = 'lockmsg';
      lock.innerHTML = `\u{1F512} ${m.title} &mdash; ${p.have}/${p.need}`;
      card.appendChild(lock);
    } else {
      card.addEventListener('click', () => onPick(b.id));
    }
    grid.appendChild(card);
  }
}

/** "fine" / "small" / "medium" / "coarse", from the beach's stone size band. */
function stoneGrade(b) {
  const avg = (b.stoneSize[0] + b.stoneSize[1]) / 2;
  if (avg < 0.08) return 'fine shingle';
  if (avg < 0.105) return 'small';
  if (avg < 0.15) return 'medium';
  return 'coarse';
}

export function setBeachSubtitle(save, playerName) {
  const pieces = totalPieces(save);
  el('beachSubtitle').innerHTML =
    `${playerName} &bull; ${plural(pieces, 'piece')} &bull; ${Math.round(save.weight)}g &bull; ` +
    `${coloursFound(save)}/${GLASS_IDS.length} colours`;
}

// --- combing HUD ----------------------------------------------------------
export function updateHud(o) {
  el('hudSession').textContent = o.session;
  el('hudLeft').textContent = o.left;
  el('hudTotal').textContent = o.total;
  el('hudCeramic').textContent = o.ceramicFound + '/10';
}

let moveTick = 0;
export function updateMoveButtons(save, dt) {
  // Cooldown rings only need ~10Hz; this runs inside the frame loop.
  moveTick += dt || 0;
  if (moveTick < 0.1) return;
  moveTick = 0;
  for (const id of Object.keys(MOVES)) {
    const btn = el('mv' + id.charAt(0).toUpperCase() + id.slice(1));
    if (!btn) continue;
    const unlocked = save.unlocked.moves.includes(id);
    btn.classList.toggle('locked', !unlocked);
    const s = moveState[id];
    const ring = btn.querySelector('.cd');
    const frac = s.cd > 0 ? s.cd / MOVES[id].cooldown : 0;
    ring.style.setProperty('--p', (frac * 360).toFixed(1) + 'deg');
    btn.classList.toggle('on', s.active > 0);
  }
}

let tipTimer = 0;
/** `ms` of 0 leaves the tip up until something replaces or clears it. */
export function setTip(text, ms, win) {
  const t = el('tips');
  t.innerHTML = text;
  t.classList.remove('hidden');
  t.classList.toggle('win', !!win);
  t.style.opacity = '1';
  clearTimeout(tipTimer);
  if (ms) {
    tipTimer = setTimeout(() => { t.style.opacity = '0'; }, ms);
  }
}

export function clearTip() {
  clearTimeout(tipTimer);
  const t = el('tips');
  t.style.opacity = '0';
  t.classList.remove('win');
}

// --- toasts ---------------------------------------------------------------
export function toast(find) {
  const box = el('toasts');
  const r = RARITY[find.rarity];
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML =
    `<span class="swatch glass" style="background:${hexCss(find.hex)};width:20px;height:20px"></span>` +
    `<span><span class="tname">${find.name}</span><br>` +
    `<span class="trar" style="color:${r.color}">${r.stars} ${r.name}</span> ` +
    `<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">${find.grams}g</span></span>`;
  box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 1900);
  setTimeout(() => d.remove(), 2400);
  while (box.children.length > 4) box.firstChild.remove();
}

export function plainToast(html) {
  const box = el('toasts');
  const d = document.createElement('div');
  d.className = 'toast';
  d.innerHTML = html;
  box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2200);
  setTimeout(() => d.remove(), 2700);
}

// --- unlock banner --------------------------------------------------------
let bannerQueue = [];
let bannerBusy = false;

export function queueUnlock(m) {
  bannerQueue.push(m);
  if (!bannerBusy) nextBanner();
}

function nextBanner() {
  const b = el('unlockBanner');
  if (!bannerQueue.length) { bannerBusy = false; b.classList.add('hidden'); return; }
  bannerBusy = true;
  const m = bannerQueue.shift();
  b.innerHTML =
    `<div class="ub-icon">${m.icon}</div>` +
    `<div class="ub-kicker">Unlocked</div>` +
    `<div class="ub-title">${m.title}</div>` +
    `<div class="ub-desc">${m.reward && m.reward.label
      ? 'You have earned <strong>' + m.reward.label + '</strong>'
      : m.desc}</div>`;
  b.classList.remove('hidden');
  setTimeout(() => { b.classList.add('hidden'); setTimeout(nextBanner, 220); }, 2600);
}

// --- milestones screen ----------------------------------------------------
export function renderMilestones(save) {
  const box = el('mileList');
  box.innerHTML = '';
  let done = 0;
  for (const m of MILESTONES) {
    const p = progressOf(save, m);
    if (p.done) done++;
    const row = document.createElement('div');
    row.className = 'mile' + (p.done ? ' done' : '');
    const pct = Math.round((p.have / p.need) * 100);
    row.innerHTML =
      `<div class="mi">${p.done ? '✔' : m.icon}</div>` +
      `<div class="mbody"><div class="mt">${m.title}</div>` +
      `<div class="md">${m.desc}</div>` +
      `<div class="bar"><i style="width:${pct}%"></i></div>` +
      `<div class="mp">${p.have} / ${p.need}${m.reward && m.reward.label
        ? ' &nbsp;&bull;&nbsp; ' + (p.done ? 'Earned: ' : 'Reward: ') + m.reward.label : ''}</div></div>`;
    box.appendChild(row);
  }
  el('unlockSub').innerHTML = `${done} of ${MILESTONES.length} complete`;
}

// --- collection sheet -----------------------------------------------------
export function renderCollectionTotals(save) {
  const pieces = totalPieces(save);
  let rares = 0, uncommons = 0;
  for (const id of GLASS_IDS) {
    if ((save.glass[id] || 0) === 0) continue;
    if (GLASS[id].rarity === 'rare') rares++;
    if (GLASS[id].rarity === 'uncommon') uncommons++;
  }
  const chips = [
    ['Pieces', pieces],
    ['Weight', Math.round(save.weight) + 'g'],
    ['Colours', coloursFound(save) + '/' + GLASS_IDS.length],
    ['Rares', rares + '/6'],
    ['Uncommons', uncommons + '/2'],
    ['Ceramics', save.completed.length + '/' + BEACHES.length],
  ];
  el('colTotals').innerHTML = chips.map(([l, v]) =>
    `<div class="totchip"><div class="tv">${v}</div><div class="tl">${l}</div></div>`).join('');

  // The percentage is the colour's chance averaged over every beach in the game —
  // the honest answer to "how rare is ruby red, really?".
  el('colColors').innerHTML = GLASS_IDS.map((id) => {
    const n = save.glass[id] || 0;
    const r = RARITY[GLASS[id].rarity];
    return `<div class="colorrow${n ? '' : ' zero'}">` +
      `<span class="swatch glass" style="background:${hexCss(GLASS[id].hex)}"></span>` +
      `<span class="cname"><span class="cn1">${GLASS[id].name}</span>` +
      `<span class="cn2"><span style="font-size:0.62rem;color:${r.color}">${r.stars}</span> ` +
      `<span class="cpct">${pctLabel(globalGlassChance(id))}</span></span></span>` +
      `<span class="ccount">${n}</span></div>`;
  }).join('');
}

// Below this width the collection's button row wraps onto two lines, which eats
// the very screen space the jars need — so the labels get shorter instead.
const WIDE = 900;

export function setBottleStyleLabel(styleId) {
  const b = BOTTLE_BY_ID[styleId] || BOTTLES[0];
  el('btnBottleStyle').textContent = (window.innerWidth >= WIDE ? 'Style: ' : '') + b.name;
}

export function setPourLabel(mode) {
  const wide = window.innerWidth >= WIDE;
  el('btnPour').textContent = mode === 'mixed'
    ? (wide ? 'Sort by colour' : 'Sort')
    : (wide ? 'Pour together' : 'Pour');
}

// --- comb-further cooldown ------------------------------------------------
// A fresh stretch of beach is on a timer, so the answer to "no red glass here"
// is to keep looking rather than to mash the button.
//
// ...unless the section is EMPTY. Then the timer is asking the player to stare at
// bare shingle for half a minute, so main.js clears it and flips this flag: the
// button stops being "the reroll" and becomes the obvious next thing to press.
let combAllFound = false;

export function setCombAllFound(on) {
  combAllFound = !!on;
  el('btnComb').classList.toggle('allfound', combAllFound);
}

export function setCombCooldown(remaining, total) {
  const btn = el('btnComb');
  const cooling = remaining > 0;
  btn.classList.toggle('cooling', cooling);
  btn.disabled = cooling;
  btn.querySelector('.cdring').style.setProperty(
    '--p', ((cooling ? remaining / total : 0) * 360).toFixed(1) + 'deg');
  btn.querySelector('.lbl').innerHTML = cooling
    ? 'Comb in ' + Math.ceil(remaining) + 's'
    : combAllFound
      ? 'All found &mdash; Comb further &rarr;'
      : 'Comb further &rarr;';
}

// The frame readout is a development tool, not part of the game: it only appears
// with ?perf on the URL. Add it and it stays for the session.
const PERF_VISIBLE = /(\?|&)perf\b/.test(location.search);
if (PERF_VISIBLE) el('perfTag').classList.remove('hidden');
export function setPerf(text) {
  if (PERF_VISIBLE) el('perfTag').textContent = text;
}

export function hideLoading() {
  const l = el('loading');
  if (l) l.remove();
}
