// duel.js — 1e sword duel. Generic: params { enemy, context:'boarding'|'sneak', returnTo, returnParams }.
// On finish: ctx.go(returnTo, {...returnParams, duelWon}). Applies NO rewards (the caller does).
import { createDuel, WEAPONS, WEAPON_IDS, HEIGHTS, HEIGHT_NAME, TRACK_CELLS, spiritWords } from './duel-logic.js';
import { buildStage } from './duel-scene.js';

let ctx = null, root = null, stage = null, duel = null, P = null;
let view = 'choose';           // choose | reveal | fight | end | result
let els = {}, timers = [], finished = false, uiT = 0, endT = 0, pWeapon = 'cutlass', eWeapon = 'cutlass';
let info = null;               // names, crews, context copy
const pt = { x: 0, y: 0 };

const GENTLE = { apprentice: 1.3, journeyman: 1.12, adventurer: 1.0, swashbuckler: 0.9 };
const SPEED = { relaxed: 1.3, normal: 1, fast: 0.8 };

export default {
  enter(c, params = {}) {
    ctx = c; P = params || {}; view = 'choose'; els = {}; timers = []; finished = false; uiT = 0; endT = 0; duel = null;
    info = makeInfo();
    pWeapon = 'cutlass'; eWeapon = pickEnemyWeapon();
    try {
      stage = ctx.PLT ? buildStage(ctx.PLT, {
        kind: info.context === 'boarding' ? 'deck' : 'town', who: info.who, age: info.age, pWeapon, eWeapon,
        enemyKind: info.context === 'boarding' ? 'captain' : 'soldier', nation: info.nation, brawl: !info.solo,
      }) : null;
    } catch (e) { console.error('duel stage failed', e); stage = null; }
    if (stage) ctx.engine.setView(stage.scene, stage.camera);
    root = ctx.ui.mount('duel', null);
    build();
    ctx.audio.ambience(info.context === 'boarding');
    const msgs = [].concat(P.messages || [], P.message ? [P.message] : []);
    msgs.forEach((m, i) => setTimeout(() => ctx && ctx.ui.toast(m), 300 + i * 400));
    window.PLT_DEBUG = window.PLT_DEBUG || {};
    window.PLT_DEBUG.duel = debugApi;
  },
  exit() {
    ctx.audio.ambience(false);
    if (stage) { try { stage.dispose(); } catch (e) { console.error(e); } }
    ctx.engine.clearView();
    if (window.PLT_DEBUG && window.PLT_DEBUG.duel === debugApi) delete window.PLT_DEBUG.duel;
    stage = null; duel = null; root = null; els = {}; timers = [];
  },
  update(dt, t) {
    if (!root) return;
    if (duel && view === 'fight') duel.update(dt);
    for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= dt; if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); } }
    if (stage) stage.update(dt, t);
    if (view === 'end') { endT -= dt; if (endT <= 0) showResult(); }
    uiT -= dt; if (uiT <= 0) { uiT = 0.2; refreshCards(); }
    placeTelegraph();
  },
  suspend() {}, resume() {},
};

// ---------------------------------------------------------------- setup
function makeInfo() {
  const S = ctx.state, W = ctx.world, car = S.career();
  const e = P.enemy || {};
  const context = ['boarding', 'sneak'].includes(P.context) ? P.context : 'boarding';
  const town = P.returnParams && P.returnParams.townId && W.townById ? W.townById(P.returnParams.townId) : null;
  const who = (S.activeSlot && S.activeSlot()) || (car && car.slot) || 'caleb';
  const mods = S.modifiers(car);
  const es = mods.enemySkill;
  let skill = e.skill != null ? (e.skill + es) / 2 : es;
  if (context === 'sneak') skill -= 0.05;
  const diff = car ? car.difficulty : 'journeyman';
  const set = S.settings ? S.settings() : {};
  const defName = context === 'sneak' ? 'Guard Captain' : 'Capt. Gritt';
  const ename = e.captain || e.name || defName;
  const kindMorale = { merchant: 45, treasure: 50, smuggler: 50, privateer: 58, pirate: 62, warship: 66 };
  return {
    context, town, who, age: car ? car.age : 20,
    pname: 'Capt. ' + (S.SLOT_NAMES ? S.SLOT_NAMES[who] || 'Caleb' : 'Caleb'), ename,
    nation: e.nation || (town && town.nation) || 'spain',
    solo: context === 'sneak',
    pCrew: context === 'sneak' ? 0 : Math.round(P.playerCrew != null ? P.playerCrew : (car ? car.crew : 30)),
    eCrew: context === 'sneak' ? 0 : Math.round(e.crew != null ? e.crew : 30),
    pMorale: car ? car.morale : 60, eMorale: e.morale != null ? e.morale : (kindMorale[e.kind] || 55),
    skill: Math.max(0.2, Math.min(1, skill)), windowMul: mods.duelWindow || 1, gentle: GENTLE[diff] || 1, speedMul: SPEED[set.battleSpeed] || 1,
    diff,
  };
}
function pickEnemyWeapon() {
  const e = P.enemy || {};
  if (e.weapon && WEAPONS[e.weapon]) return e.weapon;
  const w = info.context === 'boarding' ? [0.2, 0.35, 0.45] : [0.5, 0.3, 0.2]; // rapier, cutlass, longsword
  let r = Math.random(); for (let i = 0; i < 3; i++) { r -= w[i]; if (r <= 0) return WEAPON_IDS[i]; }
  return 'cutlass';
}
const initial = n => { const parts = String(n).replace(/^(Capt\.|Captain|The)\s+/i, '').trim().split(/\s+/); return (parts[0] || '?')[0].toUpperCase(); };

// ---------------------------------------------------------------- DOM
function build() {
  const { h } = ctx.ui;
  const trackHead = { boarding: 'DECK · PUSH HIM OVERBOARD', sneak: 'STREET · FIGHT YOUR WAY OUT' }[info.context];
  const railWord = info.context === 'boarding' ? 'RAIL' : 'WALL';
  els.cells = [];
  for (let i = 0; i < TRACK_CELLS; i++) els.cells.push(h('span', { class: 'dl-cell' }));
  els.railL = h('span', { class: 'dl-rail' }, railWord); els.railR = h('span', { class: 'dl-rail' }, railWord);
  els.pCard = card('p'); els.eCard = card('e');
  els.tip = h('div', { class: 'dl-tip' }, 'Watch his sword. Parry the height he swings at!');
  els.tele = h('div', { class: 'dl-tele' }, h('div', { class: 'dl-tele-orb' }), h('div', { class: 'dl-tele-txt' }, 'HIGH'));
  els.openTag = h('div', { class: 'dl-open' }, h('span', null, 'OPEN!'), h('div', { class: 'dl-open-bar' }, els.openFill = h('div')));
  els.flash = h('div', { class: 'dl-flash' });
  els.pops = h('div', { class: 'dl-pops' });
  els.parry = {}; els.strike = {};
  const parryCol = h('div', { class: 'dl-col dl-parry' }, h('div', { class: 'dl-col-h' }, 'PARRY'),
    HEIGHTS.map(k => (els.parry[k] = pressBtn(h('button', { class: 'dl-btn dl-pbtn', dataset: { h: k } }, heightIcon(k), h('span', null, HEIGHT_NAME[k])), () => onParry(k)))));
  const strikeCol = h('div', { class: 'dl-col dl-strike' }, els.strikeH = h('div', { class: 'dl-col-h' }, 'STRIKE'),
    HEIGHTS.map(k => (els.strike[k] = pressBtn(h('button', { class: 'dl-btn dl-sbtn', dataset: { h: k } }, h('span', null, HEIGHT_NAME[k]), heightIcon(k)), () => onStrike(k)))));
  els.controls = [parryCol, strikeCol];
  root.replaceChildren(
    els.flash,
    h('div', { class: 'dl-top' }, els.pCard,
      h('div', { class: 'dl-track glass' }, h('div', { class: 'dl-track-h' }, trackHead), h('div', { class: 'dl-cells' }, els.railL, els.cells, els.railR)),
      els.eCard),
    els.tele, els.openTag, els.pops,
    h('div', { class: 'dock-steer dl-dock' }, parryCol),
    h('div', { class: 'dock-act dl-dock' }, strikeCol),
    els.tip,
    ctx.ui.menuButton(() => ctx.go('pause')),
    els.overlay = h('div', { class: 'dl-overlay' }, chooseCard()),
  );
  setControls(false);
  drawTrack(4);
  refreshCards();
}
function card(side) {
  const { h } = ctx.ui, me = side === 'p';
  const name = me ? info.pname : info.ename;
  const el = h('div', { class: 'dl-card ' + (me ? 'mine' : 'theirs') });
  const av = h('div', { class: 'dl-av' }, initial(me ? (ctx.state.SLOT_NAMES ? ctx.state.SLOT_NAMES[info.who] : 'C') : name));
  el.nameEl = h('span', { class: 'dl-name' }, name);
  el.wEl = h('span', { class: 'dl-weapon' }, '');
  el.fill = h('div', { class: 'dl-bar-fill' });
  el.sub = h('div', { class: 'dl-sub' }, '');
  const body = h('div', { class: 'dl-card-body' },
    h('div', { class: 'dl-card-row' }, me ? [el.nameEl, el.wEl] : [el.wEl, el.nameEl]),
    h('div', { class: 'dl-bar' }, el.fill), el.sub);
  el.append(...(me ? [av, body] : [body, av]));
  return el;
}
function heightIcon(k) {
  const i = HEIGHTS.indexOf(k);
  return ctx.ui.h('span', { class: 'dl-hicon' }, [0, 1, 2].map(j => ctx.ui.h('i', { class: j === i ? 'on' : '' })));
}
/** Fires on pointer DOWN (reaction game), with press styling. */
function pressBtn(el, fn) {
  el.dataset.tap = '';
  el.addEventListener('pointerdown', e => {
    if (el.hasAttribute('disabled')) return;
    e.preventDefault(); el.classList.add('pressed'); fn();
  });
  const up = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  return el;
}
function setControls(on) {
  for (const k of HEIGHTS) { els.parry[k].toggleAttribute('disabled', !on); els.strike[k].toggleAttribute('disabled', !on); }
}

// ---------------------------------------------------------------- weapon choice
function chooseCard() {
  const { h } = ctx.ui;
  const head = { boarding: 'Boarding! Choose your blade', sneak: 'Caught! The guard blocks your way' }[info.context];
  const sub = {
    boarding: `${info.ename} waits for you on the deck. Push him back to his rail to win.`,
    sneak: `${info.ename} spotted you. Push him back to the wall and slip away.`,
  }[info.context];
  return ctx.ui.frame([
    h('div', { class: 'dl-ch-h' }, head),
    h('div', { class: 'dl-ch-sub' }, sub),
    h('div', { class: 'dl-tiles' }, WEAPON_IDS.map(id => {
      const w = WEAPONS[id];
      return h('button', { class: 'dl-tile', dataset: { w: id }, onTap: () => choose(id) },
        h('div', { class: 'dl-tile-art', html: swordSVG(id) }),
        h('div', { class: 'dl-tile-name' }, w.name),
        h('div', { class: 'dl-tile-note' }, w.note),
        h('div', { class: 'dl-pips' }, pips('Speed', w.speed), pips('Reach', w.reach)),
        h('div', { class: 'dl-tile-blurb' }, w.blurb));
    })),
  ], { cls: 'dl-choose', pcls: 'dl-choose-in' });
}
function pips(label, n) {
  const { h } = ctx.ui;
  return h('div', { class: 'dl-pip-row' }, h('span', null, label), h('span', { class: 'dl-pip-dots' }, [1, 2, 3].map(i => h('i', { class: i <= n ? 'on' : '' }))));
}
function swordSVG(id) {
  const blade = id === 'rapier' ? 'M60 12 L63 12 L62.5 120 L60.5 120Z' : id === 'cutlass' ? 'M58 24 Q76 60 66 120 L58 120 Q64 70 52 30Z' : 'M56 4 L66 4 L65 120 L57 120Z';
  const guard = id === 'rapier' ? '<path d="M48 124 Q61 138 74 124" stroke="#c9a24e" stroke-width="4" fill="none"/><rect x="44" y="120" width="34" height="5" rx="2" fill="#c9a24e"/>'
    : id === 'cutlass' ? '<path d="M46 122 Q46 146 62 146 L76 146" stroke="#c9a24e" stroke-width="5" fill="none"/><rect x="42" y="119" width="38" height="6" rx="3" fill="#c9a24e"/>'
    : '<rect x="36" y="119" width="50" height="7" rx="3" fill="#c9a24e"/>';
  return `<svg viewBox="0 0 122 170" width="100%" height="100%" aria-hidden="true"><g transform="rotate(35 61 90)">
    <path d="${blade}" fill="#dfe6ea" stroke="#6b7a84" stroke-width="1.5"/>${guard}
    <rect x="57" y="126" width="8" height="${id === 'longsword' ? 30 : 22}" rx="3" fill="#6b4a2b"/>
    <circle cx="61" cy="${id === 'longsword' ? 160 : 152}" r="6" fill="#c9a24e"/></g></svg>`;
}
function choose(id) {
  if (view !== 'choose') return;
  pWeapon = id; view = 'reveal';
  if (stage) stage.setWeapons(pWeapon, eWeapon);
  ctx.audio.play('clash');
  const { h } = ctx.ui;
  els.overlay.replaceChildren(h('div', { class: 'dl-reveal' },
    h('div', { class: 'dl-rev-line' }, `You draw your ${WEAPONS[pWeapon].name.toLowerCase()}.`),
    h('div', { class: 'dl-rev-line enemy' }, `${info.ename} draws a ${WEAPONS[eWeapon].name.toLowerCase()}!`),
    h('div', { class: 'dl-rev-big' }, 'En garde!')));
  els.pCard.wEl.textContent = WEAPONS[pWeapon].name; els.eCard.wEl.textContent = WEAPONS[eWeapon].name;
  after(1.9, startFight);
}
function startFight() {
  view = 'fight';
  els.overlay.replaceChildren(); els.overlay.classList.add('gone');
  duel = createDuel({
    skill: info.skill, windowMul: info.windowMul, speedMul: info.speedMul, gentle: info.gentle,
    pWeapon, eWeapon, pCrew: info.pCrew, eCrew: info.eCrew, pMorale: info.pMorale, eMorale: info.eMorale, solo: info.solo, emit: onEvent,
  });
  setControls(true);
  setTip(info.solo ? 'Watch his sword. Parry the height he swings at, then strike!' : 'Watch his sword. Parry the height he swings at. Your crew is fighting too!');
  ctx.audio.play('clash', { caption: 'Swords drawn' });
}

// ---------------------------------------------------------------- input
function onParry(k) {
  if (view !== 'fight' || !duel) return;
  if (!duel.parry(k)) return;
  if (stage) stage.act.playerParry(k, duel.phase === 'windup');
  for (const x of HEIGHTS) els.parry[x].classList.toggle('guard', x === k);
  after(0.5 * duel.W + 0.1, () => { if (duel && duel.guard !== k) els.parry[k].classList.remove('guard'); });
}
function onStrike(k) {
  if (view !== 'fight' || !duel) return;
  duel.strike(k);
}

// ---------------------------------------------------------------- duel events → visuals
function onEvent(ev, d) {
  const A = stage && stage.act, H = ctx.audio;
  switch (ev) {
    case 'windup':
      A && A.enemyWindup(d.h); showTele(d.h); hintParry(d.h); break;
    case 'feint':
      A && A.enemyWindup(d.h); showTele(d.h, true); hintParry(d.h); pop('e', 'A trick!', 'warn'); break;
    case 'enemyStrike':
      A && A.enemyRelease(); els.tele.classList.add('swing'); break;
    case 'block':
      hideTele(); A && A.playerRelease(); A && A.enemyStagger(); H.play('clash'); pop('p', 'Blocked!', 'good'); flash('good');
      clearGuard(); break;
    case 'open':
      openWindow(d.dur); break;
    case 'openEnd':
      closeWindow(); break;
    case 'hurt':
      hideTele(); clearGuard(); A && A.playerHit(); H.play('thud', { caption: 'Hit!' }); pop('p', 'Ouch!', 'bad'); flash('bad'); break;
    case 'pstrike':
      A && A.playerStrike(d.h);
      if (d.result === 'counter' || d.result === 'clean') {
        closeWindow();
        after(0.2, () => { A && A.enemyHit(); H.play('clash', { caption: 'A hit!' }); pop('e', d.result === 'counter' ? 'Counter!' : 'Hit!', 'good'); flash('good'); });
      } else if (d.result === 'early') {
        after(0.18, () => { H.play('clash'); pop('e', 'Too soon!', 'warn'); });
      }
      break;
    case 'eparry':
      if (duel && duel.phase !== 'windup') after(0.1, () => { A && A.enemyParry(d.h); H.play('clash'); pop('e', 'Blocked', 'warn'); });
      break;
    case 'push':
      drawTrack(d.pos); stage && stage.setTrack(d.pos);
      if (d.by === 'crew') { pop(d.dir > 0 ? 'e' : 'p', d.dir > 0 ? 'Crew push!' : 'Pushed!', d.dir > 0 ? 'good' : 'bad'); H.play('cheer', { caption: d.dir > 0 ? 'Your crew cheers' : 'Their crew cheers' }); }
      break;
    case 'tip':
      setTip(d.text); break;
    case 'win': case 'lose':
      finishFight(ev === 'win'); break;
  }
}
function showTele(hgt, feint) {
  els.tele.dataset.h = hgt; els.tele.classList.remove('swing');
  els.tele.classList.add('on'); els.tele.classList.toggle('feint', !!feint);
  els.tele.querySelector('.dl-tele-txt').textContent = HEIGHT_NAME[hgt].toUpperCase();
}
function hideTele() { els.tele.classList.remove('on', 'swing', 'feint'); for (const k of HEIGHTS) els.parry[k].classList.remove('hint'); }
function hintParry(hgt) {
  const show = info.diff === 'apprentice';
  for (const k of HEIGHTS) els.parry[k].classList.toggle('hint', show && k === hgt);
}
function clearGuard() { for (const k of HEIGHTS) els.parry[k].classList.remove('guard', 'hint'); }
function openWindow(dur) {
  for (const k of HEIGHTS) els.strike[k].classList.add('counter');
  els.strikeH.textContent = 'STRIKE NOW!';
  els.openTag.classList.add('on');
  els.openFill.style.transition = 'none'; els.openFill.style.width = '100%';
  void els.openFill.offsetWidth;
  els.openFill.style.transition = `width ${dur}s linear`; els.openFill.style.width = '0%';
}
function closeWindow() {
  for (const k of HEIGHTS) els.strike[k].classList.remove('counter');
  els.strikeH.textContent = 'STRIKE'; els.openTag.classList.remove('on');
}
function finishFight(won) {
  view = 'end'; endT = 2.4; setControls(false); hideTele(); closeWindow();
  if (duel) { drawTrack(duel.pos); stage && stage.setTrack(duel.pos); }
  after(0.35, () => {
    stage && stage.act.end(won);
    ctx.audio.play(won ? 'fanfare' : 'cheer', { caption: won ? 'Victory!' : 'The enemy crew cheers' });
  });
  (won ? els.railR : els.railL).classList.add('off');
  setTip(won ? `${info.ename} is off balance. He yields!` : 'You are pushed back and must yield.');
}

// ---------------------------------------------------------------- result
function showResult() {
  if (view === 'result') return;
  view = 'result';
  const { h } = ctx.ui, won = duel ? duel.result === 'won' : false, e = info.ename, s = duel ? duel.stats : { blocks: 0, hits: 0 };
  const text = won ? {
    boarding: `${e} throws down his sword and his crew surrender. The ship is yours!`,
    sneak: `${e} tumbles into a cart of melons. You slip away into the streets!`,
  }[info.context] : {
    boarding: `Your back is to the rail. You lower your sword and your crew scrambles back to your ship.`,
    sneak: `The guards chase you out of town. You run all the way back to your ship!`,
  }[info.context];
  els.overlay.classList.remove('gone');
  els.overlay.replaceChildren(ctx.ui.frame([
    h('div', { class: 'label-caps' }, won ? 'THE DUEL IS WON' : 'THE DUEL IS LOST'),
    h('div', { class: 'dl-res-h' + (won ? ' won' : ' lost') }, won ? 'Victory!' : 'You yield'),
    h('div', { class: 'dl-res-t' }, text),
    h('div', { class: 'dl-res-stats' }, h('span', null, h('b', null, String(s.blocks)), ' blocks'), h('span', null, h('b', null, String(s.hits)), ' hits'), h('span', null, h('b', null, WEAPONS[pWeapon].name))),
    h('button', { class: 'gold-btn dl-res-go', onTap: finish }, 'Continue'),
  ], { cls: 'dl-result', pcls: 'dl-result-in' }));
}
function finish() {
  if (finished) return; finished = true;
  const won = duel ? duel.result === 'won' : false;
  const to = P.returnTo || 'sail';
  ctx.go(to, { ...(P.returnParams || {}), duelWon: won });
}

// ---------------------------------------------------------------- HUD bits
function drawTrack(pos) {
  const p = Math.max(0, Math.min(TRACK_CELLS - 1, pos));
  els.cells.forEach((c, i) => { c.className = 'dl-cell ' + (i === p ? 'here' : i < p ? 'ours' : 'theirs'); });
}
function refreshCards() {
  if (!els.pCard) return;
  const pos = duel ? duel.pos : 4;
  for (const side of ['p', 'e']) {
    const el = side === 'p' ? els.pCard : els.eCard;
    let pct, sub;
    if (info.solo) {
      pct = side === 'p' ? (pos + 1) / TRACK_CELLS : (TRACK_CELLS - pos) / TRACK_CELLS;
      sub = side === 'p' ? 'Alone in the streets' : 'Town guard on patrol';
    } else {
      const crew = duel ? (side === 'p' ? duel.pCrew : duel.eCrew) : (side === 'p' ? info.pCrew : info.eCrew);
      const c0 = Math.max(1, side === 'p' ? info.pCrew : info.eCrew);
      const m = duel ? (side === 'p' ? duel.pMorale : duel.eMorale) : (side === 'p' ? info.pMorale : info.eMorale);
      pct = (crew / c0) * (0.4 + 0.6 * m / 100);
      const who = 'Crew';
      sub = `${who} ${Math.round(crew)} fighting · ${spiritWords(m, crew)}`;
    }
    el.fill.style.width = Math.round(Math.max(0.03, Math.min(1, pct)) * 100) + '%';
    if (el.sub.textContent !== sub) el.sub.textContent = sub;
    if (!el.wEl.textContent) el.wEl.textContent = view === 'choose' ? (side === 'p' ? 'Choosing…' : '') : WEAPONS[side === 'p' ? pWeapon : eWeapon].name;
  }
}
function setTip(t) { if (els.tip && els.tip.textContent !== t) { els.tip.textContent = t; els.tip.classList.remove('bump'); void els.tip.offsetWidth; els.tip.classList.add('bump'); } }
function toStagePt(fx, fy) {
  const cv = ctx.engine.canvas.getBoundingClientRect();
  return ctx.ui.toStage(cv.left + fx * cv.width, cv.top + fy * cv.height);
}
function placeTelegraph() {
  if (!stage || !els.tele) return;
  if (els.tele.classList.contains('on')) {
    stage.enemyPoint(els.tele.dataset.h || 'mid', pt);
    const s = toStagePt(pt.x, pt.y);
    els.tele.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
    if (duel) els.tele.style.setProperty('--p', duel.windupProgress().toFixed(3));
  }
  if (els.openTag.classList.contains('on')) {
    stage.actorPoint('e', 2.5, pt); const s = toStagePt(pt.x, pt.y);
    els.openTag.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
  }
}
function pop(side, text, kind) {
  let x = side === 'p' ? 520 : 800, y = 300;
  if (stage) { stage.actorPoint(side, 2.2, pt); const s = toStagePt(pt.x, pt.y); x = s.x; y = s.y; }
  const el = ctx.ui.h('div', { class: 'dl-pop ' + (kind || ''), style: { left: x + 'px', top: y + 'px' } }, text);
  els.pops.append(el); while (els.pops.children.length > 4) els.pops.firstChild.remove();
  setTimeout(() => el.remove(), 950);
}
function flash(kind) { els.flash.className = 'dl-flash'; void els.flash.offsetWidth; els.flash.className = 'dl-flash ' + kind; }
function after(t, fn) { timers.push({ t, fn }); }

// ---------------------------------------------------------------- test hooks (debug only)
const debugApi = {
  get view() { return view; }, get duel() { return duel; }, get info() { return info; },
  choose: id => choose(id || 'cutlass'),
  start() { if (view === 'choose') choose('cutlass'); timers = timers.filter(t => t.fn !== startFight); if (view === 'reveal') startFight(); },
  parry: onParry, strike: onStrike,
  forceEnd(won) { if (!duel) debugApi.start(); duel.forceEnd(won); },
  showResult, finish,
};
