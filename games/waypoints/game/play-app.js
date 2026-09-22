// Waypoints — the game.
//
// `mapper.html` is the authoring tool: it is where a map gets drawn and where
// the printed sheet gets corrected. This is the game, and it is the only page a
// player ever opens.
//
// It reuses the mapper's renderer rather than reimplementing the sheet — the
// board, the score card, the map and the icons are already drawn correctly
// there, and a second copy of that drawing code would be a second set of bugs.
// What the game adds is everything a player needs and an author does not: the
// menus, the walkers, the turn prompts and the score table.

import { Doc, migrate } from '../mapper/state.js';
import { createSheet } from '../mapper/sheet.js';
import { Play2D } from './play2d.js';
import { loadState, addPlayer, removePlayer, rememberPlayer, record, table } from './store.js';

const $ = (id) => document.getElementById(id);
const DIFFS = [
  { id: 'easy', label: 'Easy', note: 'Finish three of the four hikes at a campsite.' },
  { id: 'hard', label: 'Hard', note: 'Finish every hike at a campsite.' },
];

const BLURB = `Four days on foot in Whistling Water National Park. The weather decides how far
you get, the contours decide what it costs, and the river only lets you over at a bridge.
Walk to the lookouts, the summits and the trig points, keep the journal, and be at a campsite
when the light goes.`;

const state = {
  player: null,
  difficulty: 'easy',
  play: null,
  ed: null,
  doc: null,
  filed: false,
};

// ---------------------------------------------------------------- screens
const SCREENS = ['scHome', 'scPlayer', 'scScores', 'scOver'];
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('hud').hidden = !!id;
  if (!id) $('hud').hidden = false;
}
function play() { for (const s of SCREENS) $(s).hidden = true; $('hud').hidden = false; }

// ---------------------------------------------------------------- boot
async function boot() {
  $('homeBlurb').textContent = BLURB;

  const res = await fetch('assets/maps/map-01.json');
  const map = migrate(await res.json());
  // `persist: false` — the game never writes to the mapper's autosave. A game in
  // progress is not an edit to the map, and the map is Dan's work.
  state.doc = new Doc(map, false);
  // The mapper's own setup module, so the map is drawn exactly as the mapper
  // draws it. What the game asks for is a BOARD rather than a document: no
  // tracing photo behind it, no loose-end markers on it, and nothing on it that
  // can be dragged out of place.
  state.ed = createSheet($('sheet'), state.doc, {
    underlay: false, pips: false, locked: true,
  });
  state.ed.onChange = () => {};
  frame();

  const s = loadState();
  state.player = s.last || s.players[0] || null;
  bindMenus();
  show('scHome');
  addEventListener('resize', frame);
}

/**
 * Frame the whole printed sheet.
 *
 * On the frame AFTER the layout, not during it: `fit()` measures the canvas, and
 * measuring it before the browser has laid the page out frames the sheet to a
 * rectangle that no longer exists — which is how the board ended up half off the
 * right-hand side.
 */
function frame() {
  requestAnimationFrame(() => {
    const r = $('sheet').getBoundingClientRect();
    if (!r.width || !r.height) return requestAnimationFrame(frame);
    state.ed.fit();
  });
}

// ---------------------------------------------------------------- menus
function bindMenus() {
  $('btnPlay').onclick = () => { renderPlayers(); show('scPlayer'); };
  $('btnScores').onclick = () => { renderScores(state.difficulty); show('scScores'); };
  $('btnScoresBack').onclick = () => show('scHome');
  $('btnBackHome').onclick = () => show('scHome');
  $('btnOverMenu').onclick = () => { teardown(); show('scHome'); };
  $('btnAddPlayer').onclick = () => {
    const name = prompt('Name of the walker');
    if (!name) return;
    addPlayer(name); state.player = name.trim().slice(0, 16); renderPlayers();
  };
  $('btnStart').onclick = startGame;
  $('btnPause').onclick = () => { renderScores(state.difficulty); show('scScores'); };
}

function renderPlayers() {
  const s = loadState();
  const box = $('playerChips'); box.textContent = '';
  if (!s.players.length) {
    const hint = document.createElement('div');
    hint.className = 'blurb';
    hint.textContent = 'No walkers yet — add one to keep your scores.';
    box.appendChild(hint);
  }
  for (const name of s.players) {
    const c = document.createElement('button');
    c.className = 'chip' + (name === state.player ? ' on' : '');
    c.textContent = name;
    c.onclick = () => { state.player = name; rememberPlayer(name); renderPlayers(); };
    const x = document.createElement('span');
    x.className = 'x'; x.textContent = '✕';
    x.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${name} and their scores?`)) {
        removePlayer(name);
        if (state.player === name) state.player = loadState().players[0] || null;
        renderPlayers();
      }
    };
    c.appendChild(x);
    box.appendChild(c);
  }

  const d = $('diffChips'); d.textContent = '';
  for (const opt of DIFFS) {
    const c = document.createElement('button');
    c.className = 'chip' + (opt.id === state.difficulty ? ' on' : '');
    c.textContent = opt.label;
    c.title = opt.note;
    c.onclick = () => { state.difficulty = opt.id; renderPlayers(); };
    d.appendChild(c);
  }
  $('btnStart').disabled = !state.player;
}

function renderScores(diff) {
  const box = $('scoreDiff'); box.textContent = '';
  for (const opt of DIFFS) {
    const c = document.createElement('button');
    c.className = 'chip' + (opt.id === diff ? ' on' : '');
    c.textContent = opt.label;
    c.onclick = () => renderScores(opt.id);
    box.appendChild(c);
  }
  const rows = table(diff);
  const t = $('scoreTable');
  t.innerHTML = '<tr><th>Walker</th><th class="n">Best</th><th class="n">Hikes</th><th class="n">Finished</th></tr>';
  if (!rows.length) {
    t.innerHTML += '<tr><td colspan="4" style="color:var(--dim)">Nobody has been out yet.</td></tr>';
  }
  for (const r of rows) {
    t.innerHTML += `<tr${r.name === state.player ? ' class="me"' : ''}><td>${r.name}</td>` +
      `<td class="n">${r.best || '—'}</td><td class="n">${r.games}</td><td class="n">${r.wins}</td></tr>`;
  }
}

// ---------------------------------------------------------------- the game
function startGame() {
  if (!state.player) return;
  state.filed = false;
  state.play = new Play2D(state.ed, state.doc, renderHud);
  state.play.reset({ difficulty: state.difficulty, players: [state.player] });
  play();
  renderHud();
  frame();
  teach('Pick the goal you are playing for.');
}

function teardown() {
  if (state.play) { state.play.stop(); state.play = null; }
}

/** A line that slides in, says what to do, and gets out of the way. */
let teachTimer = null;
function teach(text) {
  $('teachText').textContent = text;
  $('teach').classList.add('show');
  clearTimeout(teachTimer);
  teachTimer = setTimeout(() => $('teach').classList.remove('show'), 4200);
}

function icon(path) {
  return `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
}
const ICON = {
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01',
  go: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M3 10h11a5 5 0 010 10H9M3 10l5-5M3 10l5 5',
  water: 'M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z',
  book: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM19 17H6',
};

function button(label, onClick, cls, svg) {
  const b = document.createElement('button');
  b.className = 'btn ' + (cls || '');
  b.innerHTML = (svg ? icon(svg) : '') + `<span>${label}</span>`;
  b.onclick = onClick;
  return b;
}

const WEATHER_WORD = { sun: 'clear', cloud: 'sun and cloud', fog: 'fog', rain: 'rain',
  snow: 'snow', dusk: 'dusk' };

function renderHud() {
  const p = state.play;
  if (!p) return;
  const v = p.view();

  if (v.phase === 'over' && !state.filed) {
    state.filed = true;
    record(state.player, state.difficulty, v.score.total, v.score.lost);
    return showOver(v);
  }

  $('status').innerHTML = [
    `<div><span class="lbl">Hike</span><b>${v.hike}<span style="color:var(--dim);font-size:13px">/4</span></b></div>`,
    v.budget ? `<div><span class="lbl">${WEATHER_WORD[v.weather] || 'weather'}</span><b>${v.budget}</b></div>` : '',
    `<div><span class="lbl">Water</span><b>${v.water}</b></div>`,
    `<div><span class="lbl">Score</span><b>${v.score.total}</b></div>`,
  ].filter(Boolean).join('');

  const row = $('iconRow'); row.textContent = '';
  const txt = [];

  if (v.phase === 'goal') {
    txt.push('Choose the goal for this game — it scores across all four hikes.');
    for (const g of state.doc.map.card.goals) {
      row.appendChild(button(`${g.id.toUpperCase()} · ${g.label}`, () => p.setGoal(g.id)));
    }
  } else if (v.phase === 'start') {
    if (v.startPick == null) {
      txt.push('Six campsites in the park. Roll to see which one you wake up at.');
      row.appendChild(button('Roll for a campsite', () => {
        const d = p.roll();
        teach(`Campsite ${d} — tap it on the map.`);
      }, 'primary', ICON.dice));
    } else {
      txt.push(`<b>Campsite ${v.startPick}.</b> Tap it on the map to set off.`);
      row.appendChild(button(`Set off from ${v.startPick}`, () => {
        p.confirmStart();
        teach('Roll the weather to see how far you get today.');
      }, 'primary', ICON.go));
    }
  } else if (v.pending) {
    txt.push(`<b>Woodland.</b> Mark which track?`);
    for (const t of ['bear', 'bird', 'rabbit']) {
      row.appendChild(button(t[0].toUpperCase() + t.slice(1), () => p.chooseWood(t)));
    }
  } else if (v.phase === 'roll') {
    txt.push('Roll for the weather. The space you land on is how far you can walk.');
    row.appendChild(button('Roll the weather', () => {
      const d = p.roll();
      const vv = p.view();
      teach(`${WEATHER_WORD[vv.weather] || ''} — ${vv.budget} movement point${vv.budget === 1 ? '' : 's'}.`);
    }, 'primary', ICON.dice));
  } else if (v.phase === 'move') {
    if (v.draft) {
      const d = v.draft;
      const gains = [d.lakes && `${d.lakes} lake`, d.woodland && `${d.woodland} woodland`,
        d.bridges && `${d.bridges} bridge`].filter(Boolean).join(', ');
      txt.push(d.ok
        ? `<span class="ok">To the <b>${d.to}</b> for <b>${d.cost}</b>${gains ? ' — picking up ' + gains : ''}</span>`
        : `<span class="bad">${d.why}</span>`);
      if (d.ok) row.appendChild(button(`Walk it (${d.cost})`, () => p.go(), 'primary', ICON.go));
      else if (v.water > 0 && /costs/.test(d.why || '')) {
        row.appendChild(button(`Drink ${v.water} water`, () => p.go(v.water), '', ICON.water));
      }
      row.appendChild(button('Start again', () => p.restart(), 'ghost', ICON.undo));
    } else {
      txt.push(v.stuck
        ? '<span class="bad">Nothing is in reach — rest here and take on water.</span>'
        : 'Drag from where you are standing to where you want to go.');
    }
    row.appendChild(button('Rest', () => p.takeRest(), v.stuck ? 'primary' : 'ghost', ICON.water));
  } else if (v.phase === 'journal') {
    txt.push('<b>The light is going.</b> Write up one journal entry for this hike.');
    const label = { j1: '1 per different type', j2: '2 per one type',
      j3: '3 per type seen twice', j4: '1 per 2 squares' };
    for (const o of v.journal) {
      if (o.used) continue;
      row.appendChild(button(`${label[o.id]} — ${o.score}${o.doubled ? ' ×2' : ''}`,
        () => { p.pickJournal(o.id); teach(`Hike ${p.view().hike} of 4.`); }, '', ICON.book));
    }
  }
  $('promptText').innerHTML = txt.join(' ');
}

function showOver(v) {
  const s = v.score;
  $('overSub').textContent = state.player;
  $('overTitle').childNodes[1].textContent = s.lost ? 'Lost the light' : 'Back at the car';
  $('overBreak').textContent = s.lost
    ? 'You did not finish enough hikes at a campsite — the score still stands, but the trip does not count.'
    : 'Four hikes walked and every night under canvas.';
  const t = $('overTable');
  t.innerHTML = '<tr><th>Scoring</th><th class="n">Points</th></tr>' +
    `<tr><td>Animals and summits</td><td class="n">${s.animals}</td></tr>` +
    `<tr><td>Lookouts, gear and trig</td><td class="n">${s.gear}</td></tr>` +
    `<tr><td>Journal</td><td class="n">${s.journal}</td></tr>` +
    `<tr><td>Goal ${(v.goal || '').toUpperCase()} — ${s.goalDetail.n} of ${s.goalDetail.of}` +
      `${s.goalDetail.complete ? ' (all of them)' : ''}</td><td class="n">${s.goal}</td></tr>` +
    `<tr class="me"><td><b>Total</b></td><td class="n"><b>${s.total}</b></td></tr>`;
  show('scOver');
}

boot();
export { state };
