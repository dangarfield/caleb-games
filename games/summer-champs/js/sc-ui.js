// Summer Champs: menus, championship flow, records. Entry point.
import * as THREE from 'three';
import { W, PERF, KITS, initRenderer, renderFrame, buildVenue, loadAssets, makeAthlete, clearAthletes, setCam, cheer, hasClip } from './sc-world.js';
import { EVENTS_A, cpuValue } from './sc-events-a.js';
import { EVENTS_B } from './sc-events-b.js';
import { createHUD } from './sc-hud.js';
import { SAVE } from './sc-save.js';
import { beep, setSfx, duckMusic, initMusic } from './sc-audio.js';
const V3 = THREE.Vector3;
const EVENTS = [...EVENTS_A, ...EVENTS_B];
const UI = document.getElementById('ui'), BACK = document.getElementById('back');
const PLAYERS = { caleb:'CALEB', ezra:'EZRA' };
const RIVALS = [{ name:'KAI', skill:0.8 }, { name:'MIA', skill:0.6 }, { name:'ASH', skill:0.45 }];
const PTS = [10, 8, 6, 5];

// ---------- storage ----------
const LS = SAVE;   // saves live in IndexedDB via arcade-store (sc-save.js)
const G = { who: LS.get('player', 'caleb'), sound: LS.get('sound', true), champ: null, practice: false, ev: null, inst: null, paused: false };
const kitOf = who => KITS.find(k => k.id === LS.get('kit.'+who, who==='caleb' ? 'teal' : 'orange')) || KITS[3];
const rec = who => { const r = LS.get('rec.'+who, { best:{}, champs:0, golds:0 }); if (r.best.fence !== undefined && !r.fenceLadder){ delete r.best.fence; r.fenceLadder = true; LS.set('rec.'+who, r); } return r; };
const me = () => ({ name: PLAYERS[G.who], kit: kitOf(G.who), skill:1 });
const rivals = () => { const used = kitOf(G.who).id; const ks = KITS.filter(k => k.id !== used); return RIVALS.map((r, i) => ({ ...r, kit: ks[i] })); };

// ---------- sound ----------
// SFX go through sc-audio.js; the SOUND EFFECTS setting mutes these only, never the theme.
const sfx = (...a) => beep(...a);
setSfx(G.sound); initMusic();

// ---------- helpers ----------
const SCRIMS = { none:[0,0,0,0, 0,0,0,0], full:[.9,.9,.9,.9, 0,0,0,0], left:[.95,.88,0,0, 0,0,0,0], intro:[.96,.92,.55,.1, 0,0,0,0], results:[.95,.92,.9,.5, 0,0,0,0], athlete:[0,0,0,0, .92,.2,0,.92], podium:[0,0,0,0, .94,.55,0,0] };
const SCRIM = document.getElementById('scrim');
function scrim(name){ SCRIMS[name].forEach((v, i) => SCRIM.style.setProperty('--'+['h0','h1','h2','h3','v0','v1','v2','v3'][i], v)); return ''; }
const html = (s) => { UI.innerHTML = s; UI.firstElementChild?.classList.add('fade-in'); };
const on = (sel, fn) => UI.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => { sfx(880, 0.04, 'triangle'); fn(b, e); }));
const fmtV = (ev, v) => v === null || v === undefined ? 'NO MARK' : ev.fmt(v);
const medalHtml = r => r < 3 ? `<span class="medal m${r+1}">${r+1}</span>` : `<span style="display:inline-block;width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.35);box-sizing:border-box;font:800 17px/26px 'Barlow Condensed';text-align:center;color:rgba(255,255,255,.75)">${r+1}</span>`;
function menuScene(pose='Idle_Loop'){
  if (!W.venue || W.venue.info.kind !== 'track' || G.inEvent){ buildVenue('track'); G.inEvent = false; }
  clearAthletes(); const a = makeAthlete(kitOf(G.who), PLAYERS[G.who]); a.pivot.position.set(53, 0, 2); a.pivot.rotation.y = -Math.PI/2.4; a.play(pose);
  setCam(new V3(49.2, 1.5, 9.5), new V3(51.4, 1.25, 2), true); return a;
}
const header = (eyebrow, title, right='') => `<div class="abs" style="left:72px;right:72px;top:112px;display:flex;justify-content:space-between;align-items:flex-end"><div style="display:flex;flex-direction:column;gap:4px"><span class="eyebrow">${eyebrow}</span><span class="sc-title">${title}</span></div>${right}</div>`;
function setBack(){}

// ---------- M1 home ----------
const HOME_ACT = { caleb:'Celebration', ezra:'Dance' }, HOME_D = 1.2;
function homeScene(){
  if (!W.venue || W.venue.info.kind !== 'track' || G.inEvent){ buildVenue('track'); G.inEvent = false; }
  clearAthletes(); const tok = {}, A = new V3(53, 0, 2), ry = -Math.PI/2.4, fwd = new V3(Math.cos(ry), 0, -Math.sin(ry)), lat = new V3(Math.sin(ry), 0, Math.cos(ry));
  const st = {};
  for (const [w, off] of [['caleb', -0.6], ['ezra', -2.6]]){
    const a = makeAthlete(kitOf(w), PLAYERS[w]), front = A.clone().addScaledVector(lat, off), back = front.clone().addScaledVector(fwd, -HOME_D), on = w === G.who;
    a.pivot.rotation.y = ry; a.pivot.position.copy(on ? front : back); a.play(on ? HOME_ACT[w] : 'Crouch_Idle', { fade:0 });
    st[w] = { a, w, front, back, fwd, state: on ? 'active' : 'crouch', target: on ? 'active' : 'inactive', moved:0, prevT:0, wait:0, speed:1 };
  }
  const go = (s, clip, state, o = {}) => { const d = s.a.play(clip, { fade:0.22, restart:true, ...o }); s.state = state; s.prevT = 0; s.wait = 0; s.moved = 0; if (/^Walk/.test(clip)) s.speed = HOME_D/(d || 1.33); };
  const step = (s, dt) => { const act = s.a.cur, t = act ? act.time : 0, dur = act ? act.getClip().duration : 0, wrapped = t + 1e-4 < s.prevT, done = !act || !act.isRunning() || t >= dur - 0.04; s.prevT = t;
    if (s.state === 'crouch' && s.target === 'active'){ s.wait += dt; if (wrapped || s.wait > 1.2) go(s, 'Crouch_Exit', 'exit', { once:true }); }
    else if (s.state === 'exit' && done) go(s, 'Walk_Fwd', 'walkF');
    else if (s.state === 'walkF'){ s.moved = Math.min(HOME_D, s.moved + s.speed*dt); s.a.pivot.position.copy(s.back).addScaledVector(s.fwd, s.moved); if (s.moved >= HOME_D) go(s, HOME_ACT[s.w], 'active'); }
    else if (s.state === 'active' && s.target === 'inactive'){ s.wait += dt; if (wrapped || s.wait > 1.2 || (act && act.loop === THREE.LoopOnce && done)) go(s, 'Walk_Bwd', 'walkB'); }
    else if (s.state === 'walkB'){ s.moved = Math.min(HOME_D, s.moved + s.speed*dt); s.a.pivot.position.copy(s.front).addScaledVector(s.fwd, -s.moved); if (s.moved >= HOME_D) go(s, 'Crouch_Enter', 'enter', { once:true }); }
    else if (s.state === 'enter' && done) go(s, 'Crouch_Idle', 'crouch'); };
  const tick = dt => { if (G.homeTok !== tok || !W.athletes.includes(st.caleb.a)){ tick.dead = true; return; } step(st.caleb, dt); step(st.ezra, dt); };
  G.homeTok = tok; G.home = st; W.tickers.push(tick);
  setCam(new V3(49.2, 1.5, 9.5), new V3(51.4, 1.25, 2), true);
}
function swapAthlete(){ const st = G.home; if (!st) return homeScene(); for (const w in st) st[w].target = w === G.who ? 'active' : 'inactive'; }
function home(soft){
  G.champ = null; setBack(false); if (!soft) homeScene();
  const r = { caleb: rec('caleb'), ezra: rec('ezra') }, k = kitOf(G.who);
  const card = w => `<button class="btn" data-who="${w}" style="width:200px;height:72px;border-radius:4px;display:flex;align-items:center;gap:12px;padding:0 14px;${G.who===w ? 'background:#F2B705;color:#0B1B3A;box-shadow:0 0 0 4px rgba(242,183,5,.3)' : 'background:rgba(7,18,42,.9);border:1px solid rgba(255,255,255,.22)'}"><span style="width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 26px 'Barlow Condensed';${G.who===w ? 'background:#0B1B3A;color:#F2B705' : 'border:2px solid rgba(255,255,255,.5)'}">${PLAYERS[w][0]}</span><span style="display:flex;flex-direction:column;align-items:flex-start"><span class="C" style="font-weight:800;font-size:28px;line-height:1">${PLAYERS[w]}</span><span style="font:700 12px Barlow;letter-spacing:.12em">${r[w].golds} GOLD</span></span></button>`;
  const markup = `<div>${scrim('left')}
    <button class="btn ghost abs" data-go="settings" style="left:206px;top:28px;height:60px">SETTINGS</button>
    <div class="abs" data-hm="cards" style="right:28px;top:28px;display:flex;gap:10px;align-items:center"><span style="font:600 13px/1.25 Barlow;letter-spacing:.2em;color:#F2B705;text-align:right;height:72px;display:flex;align-items:center;padding:0 14px;background:rgba(7,18,42,.9);border-radius:4px">WHO'S<br>PLAYING?</span>${card('caleb')}${card('ezra')}</div>
    <div class="abs" style="left:72px;top:130px;display:flex;flex-direction:column;gap:8px"><span class="eyebrow" style="font-size:16px;letter-spacing:.24em">10 EVENTS · 1 CHAMPION</span><span style="font:italic 800 104px/.86 'Barlow Condensed'">SUMMER<br>CHAMPS</span><span style="width:92px;height:8px;background:#F2B705;margin-top:10px"></span></div>
    <div class="abs" style="left:72px;top:390px;width:450px;display:flex;flex-direction:column;gap:12px">
      <button class="btn" data-go="champ" style="height:84px;background:#F2B705;color:#0B1B3A;display:flex;align-items:center;justify-content:space-between;padding:0 26px;border-radius:4px"><span class="C" style="font-weight:800;font-size:38px">CHAMPIONSHIP</span><span style="font:700 17px Barlow;letter-spacing:.08em">10 EVENTS ›</span></button>
      <button class="btn" data-go="practice" style="height:72px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;padding:0 26px;border-radius:4px"><span class="C" style="font-weight:700;font-size:32px">PRACTICE</span><span class="dim" style="font:600 15px Barlow">ANY EVENT</span></button>
      <button class="btn" data-go="records" style="height:72px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;padding:0 26px;border-radius:4px"><span class="C" style="font-weight:700;font-size:32px">RECORDS</span><span class="dim" data-hm="rec" style="font:600 15px Barlow">${PLAYERS[G.who]} · ${Object.keys(r[G.who].best).length} PBs</span></button>
    </div>
    <button class="btn abs" data-go="athlete" data-hm="ath" style="right:28px;bottom:28px;width:500px;height:84px;background:rgba(7,18,42,.92);border-radius:4px;display:flex;align-items:center;gap:16px;padding-right:12px;text-align:left"><span style="width:12px;height:100%;background:${k.color};border-radius:4px 0 0 4px"></span><span style="display:flex;flex-direction:column;flex:1"><span class="eyebrow" style="font-size:13px;letter-spacing:.2em">${PLAYERS[G.who]}'S ATHLETE · ${KITS.indexOf(k)+1} OF 6</span><span class="C" style="font-weight:800;font-size:32px;line-height:1.05">${k.name}</span></span><span class="C" style="height:64px;padding:0 18px;border:1px solid rgba(255,255,255,.25);border-radius:4px;display:flex;align-items:center;font-weight:700;font-size:22px">CHANGE</span></button>
  </div>`;
  if (soft){ const tmp = document.createElement('div'); tmp.innerHTML = markup; ['cards','rec','ath'].forEach(id => { const cur = UI.querySelector(`[data-hm="${id}"]`), nx = tmp.querySelector(`[data-hm="${id}"]`); if (!cur || !nx) return; if (id==='cards'){ cur.innerHTML = nx.innerHTML; return; } cur.style.transition = 'opacity .16s'; cur.style.opacity = 0; setTimeout(() => { cur.innerHTML = nx.innerHTML; if (id==='ath') cur.firstElementChild.style.background = nx.firstElementChild.style.background; cur.style.opacity = 1; }, 160); }); }
  else html(markup);
  on('[data-who]', b => { if (b.dataset.who === G.who) return; G.who = b.dataset.who; LS.set('player', G.who); swapAthlete(); home(true); });
  if (!soft) on('[data-go]', b => ({ champ: () => { G.champ = { i:0, results:[], table:{} }; schedule(); }, practice, records, settings, athlete: () => athlete(false) })[b.dataset.go]());
}

// ---------- M2 athlete ----------
function athlete(thenChamp){
  setBack(false); menuScene(); clearAthletes();
  const cur = kitOf(G.who); const as = KITS.map((k, i) => { const a = makeAthlete(k, k.name); a.pivot.position.set(46 + i*1.45, 0, 2); a.pivot.rotation.y = -Math.PI/2; a.play(k.id === cur.id ? 'Celebration' : 'Idle_Loop'); return a; });
  setCam(new V3(49.6, 1.9, 9.6), new V3(49.6, 1.3, 2), true);
  html(`<div>${scrim('athlete')}${header(PLAYERS[G.who]+(thenChamp ? ' · CHAMPIONSHIP' : ''), 'CHOOSE YOUR ATHLETE')}
    <div class="abs" style="left:72px;right:72px;bottom:120px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px">${KITS.map(k => `<button class="btn" data-kit="${k.id}" style="height:96px;border-radius:4px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;text-align:left;${k.id===cur.id ? 'border:3px solid #F2B705;background:rgba(242,183,5,.16)' : 'border:1px solid rgba(255,255,255,.16);background:rgba(7,18,42,.7)'}"><span style="height:8px;background:${k.color}"></span><span style="padding:10px 14px;display:flex;flex-direction:column"><span class="C" style="font-weight:800;font-size:28px;line-height:1">${k.name}</span></span></button>`).join('')}</div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    <div class="abs dim" style="left:260px;bottom:52px;font:500 17px Barlow">Your 3 rivals wear the other kits.</div>
    <button class="btn gbtn abs" data-ok style="right:72px;bottom:28px">${thenChamp ? 'START' : 'CONFIRM'} <span>›</span></button></div>`);
  on('[data-kit]', b => { LS.set('kit.'+G.who, b.dataset.kit); const i = KITS.findIndex(k => k.id === b.dataset.kit); as.forEach((a, j) => a.play(j===i ? 'Celebration' : 'Idle_Loop')); UI.querySelectorAll('[data-kit]').forEach(c => { const sel = c === b; c.style.border = sel ? '3px solid #F2B705' : '1px solid rgba(255,255,255,.16)'; c.style.background = sel ? 'rgba(242,183,5,.16)' : 'rgba(7,18,42,.7)'; }); });
  on('[data-ok]', () => { if (thenChamp){ G.champ = { i:0, results:[], table:{} }; schedule(); } else home(); }); on('[data-home]', () => home());
}

// ---------- M3 schedule ----------
function schedule(){
  setBack(false); menuScene('Idle_Loop'); const C = G.champ, p = me();
  const t = C.table[p.name] || { g:0, s:0, b:0 }, pos = standings().findIndex(x => x.me) + 1;
  const row = (ev, i) => { const r = C.results[i];
    if (r) return `<div class="row" style="height:64px"><span class="C dim" style="width:34px;font-weight:700;font-size:18px">${String(i+1).padStart(2,'0')}</span><span class="C" style="flex:1;font-weight:700;font-size:28px">${ev.name}</span><span class="C" style="font-weight:700;font-size:24px">${fmtV(ev, r.mine)}</span>${medalHtml(r.rank)}</div>`;
    if (i === C.i) return `<div class="row me" style="height:64px"><span class="C" style="width:34px;font-weight:700;font-size:18px">${String(i+1).padStart(2,'0')}</span><span class="C" style="flex:1;font-weight:800;font-size:28px">${ev.name}</span><span style="font:800 15px Barlow;letter-spacing:.16em">UP NEXT</span></div>`;
    return `<div class="row" style="height:64px;background:none;border:1px solid rgba(255,255,255,.12)"><span class="C" style="width:34px;font-weight:700;font-size:18px;color:rgba(255,255,255,.5)">${String(i+1).padStart(2,'0')}</span><span class="C dim" style="flex:1;font-weight:700;font-size:28px">${ev.name}</span></div>`; };
  html(`<div>${scrim('full')}${header('CHAMPIONSHIP · '+p.name+' · '+p.kit.name, 'EVENT '+(C.i+1)+' OF 10', `<div style="display:flex;align-items:center;gap:18px;height:64px;padding:0 20px;background:rgba(255,255,255,.07);border-radius:4px"><span class="dim" style="font:600 13px Barlow;letter-spacing:.2em">${p.name}</span><span class="C" style="display:flex;gap:8px;align-items:center;font-weight:800;font-size:26px"><span class="medal m1" style="width:22px;height:22px"></span>${t.g}<span class="medal m2" style="width:22px;height:22px;margin-left:8px"></span>${t.s}<span class="medal m3" style="width:22px;height:22px;margin-left:8px"></span>${t.b}</span>${C.i ? `<span class="C gold" style="font-weight:800;font-size:26px">${['1ST','2ND','3RD','4TH'][pos-1]} OVERALL</span>` : ''}</div>`)}
    <div class="abs" style="left:72px;right:72px;top:220px;display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:column;grid-template-rows:repeat(5,64px);gap:6px 24px">${EVENTS.map(row).join('')}</div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    ${C.i ? '<button class="btn ghost abs" data-mt style="left:260px;bottom:36px">MEDAL TABLE</button>' : ''}
    <button class="btn gbtn abs" data-start style="right:72px;bottom:28px"><span><small>START EVENT ${C.i+1}</small>${EVENTS[C.i].name}</span><span style="font-size:38px">›</span></button></div>`);
  on('[data-start]', () => intro(EVENTS[C.i])); on('[data-mt]', medalTable); on('[data-home]', () => home());
}
function standings(){ const C = G.champ, all = [me(), ...rivals()]; return all.map(p => ({ ...p, me: p.name === me().name, ...(C.table[p.name] || { g:0, s:0, b:0, pts:0 }) })).sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || b.pts - a.pts); }

// ---------- M4 practice ----------
function practice(){
  setBack(false); menuScene(); const r = rec(G.who);
  html(`<div>${scrim('full')}${header('PRACTICE · '+PLAYERS[G.who], 'PICK AN EVENT')}
    <div class="abs" style="left:72px;right:72px;top:220px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:170px;gap:14px">${EVENTS.map((ev, i) => `<button class="btn" data-ev="${i}" style="border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);border-radius:4px;padding:16px 18px;display:flex;flex-direction:column;justify-content:space-between;text-align:left"><span class="C gold" style="font-weight:700;font-size:15px">${String(i+1).padStart(2,'0')}</span><span style="display:flex;flex-direction:column"><span class="C" style="font-weight:800;font-size:28px;line-height:1">${ev.name}</span><span class="dim" style="font:600 14px Barlow;margin-top:4px">${r.best[ev.id] !== undefined ? 'BEST '+ev.fmt(r.best[ev.id]) : 'NOT PLAYED YET'}</span></span></button>`).join('')}</div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    <div class="abs dim" style="left:260px;bottom:52px;font:500 17px Barlow">No medals in practice, but personal bests still count.</div></div>`);
  on('[data-ev]', b => { G.champ = null; intro(EVENTS[+b.dataset.ev]); }); on('[data-home]', () => home());
}

// ---------- M5 intro ----------
const chip = k => !k ? '' : k==='LR' ? `<span style="display:flex;gap:6px">${['L','R'].map(x => `<span class="C" style="width:52px;height:52px;border:1px solid rgba(255,255,255,.4);border-radius:4px;font-weight:800;font-size:28px;line-height:52px;text-align:center">${x}</span>`).join('')}</span>` : `<span class="C" style="height:52px;padding:0 16px;background:#F2B705;color:#0B1B3A;border-radius:4px;font-weight:800;font-size:24px;line-height:52px">${k}</span>`;
function intro(ev){
  G.ev = ev; setBack(false); clearAthletes(); const info = buildVenue(ev.venue); G.inEvent = true; G.info = info;
  const a = makeAthlete(kitOf(G.who), PLAYERS[G.who]); const spot = { track:[2,0,0.5], field:[36,0,0], throw:[20,0,0], pool:[-2,0.3,-1], dive:[-3,100.3,0], range:[0,0,0], lift:[0,0.12,0], piste:[-1.3,0.06,0] }[ev.venue];
  a.pivot.position.set(...spot); a.pivot.rotation.y = -0.6; a.play(ev.venue==='dive' ? 'HD_Stand' : 'Idle_Loop');
  setCam(new V3(spot[0]+1.2, spot[1]+1.7, spot[2]+6.8), new V3(spot[0]-2.6, spot[1]+1.1, spot[2]), true);
  const idx = EVENTS.indexOf(ev), best = rec(G.who).best[ev.id];
  html(`<div>${scrim('intro')}
    <div class="abs" style="left:72px;top:118px;display:flex;flex-direction:column;gap:6px"><span class="eyebrow">${G.champ ? 'EVENT '+(idx+1)+' OF 10' : 'PRACTICE'}</span><span style="font:italic 800 84px/.92 'Barlow Condensed'">${ev.name}</span><span style="font:500 20px Barlow;color:rgba(255,255,255,.8)">${ev.attempts > 1 ? ev.attempts+(ev.id==='archery' ? ' arrows. Your total counts.' : ' goes. Your best one counts.') : ev.id==='fence' ? 'Start 4th. Win up to 3 bouts to climb to gold.' : 'One race against 3 rivals.'}</span></div>
    <div class="abs" style="left:72px;top:318px;width:700px;display:flex;flex-direction:column;gap:12px">${ev.howto.map(([t, k], i) => `<div class="row" style="height:76px;padding:0 18px"><span class="C" style="width:40px;height:40px;background:#fff;color:#0B1B3A;border-radius:4px;font-weight:800;font-size:24px;line-height:40px;text-align:center">${i+1}</span><span class="C" style="flex:1;font-weight:700;font-size:26px">${t}</span>${chip(k)}</div>`).join('')}</div>
    <div class="abs" style="right:72px;top:118px;width:320px;display:flex;flex-direction:column;gap:4px"><div class="hp" style="height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px"><span class="gold" style="font:600 14px Barlow;letter-spacing:.18em">${PLAYERS[G.who]}'S BEST</span><span class="C gold" style="font-weight:800;font-size:28px">${best !== undefined ? ev.fmt(best) : '—'}</span></div></div>
    <div class="abs" style="right:72px;bottom:28px;display:flex;align-items:center;gap:16px"><button class="btn ghost" data-home>MENU</button>
    <button class="btn gbtn" data-go style="height:84px;padding:0 36px;font-size:40px;box-shadow:0 0 0 5px rgba(242,183,5,.3)">I'M READY <span>›</span></button></div></div>`);
  on('[data-go]', () => startEvent(ev)); on('[data-home]', () => home());
}

// ---------- event runner ----------
function startEvent(ev){
  clearInterval(G.drawKey); G.drawKey = null;
  setBack(true); clearAthletes(); if (G.inst?.dispose) G.inst.dispose(); buildVenue(ev.venue); G.info = W.venue.info;
  const dispatch = (k, down, extra) => { if (G.paused || !G.inst) return; if (k==='L'||k==='R') sfx(k==='L' ? 520 : 600, 0.03); if (k==='btn'){ G.inst.btn ? G.inst.btn(extra) : G.inst.input(extra, true); } else if (k==='drag') G.inst.input('drag', extra); else if (k==='slider') G.inst.input('slider', true, extra); else G.inst.input(k, down); };
  G.dispatch = dispatch; const hud = createHUD(UI, me(), dispatch, pause);
  G.paused = false; G.ev = ev; scrim('none');
  const ctx = { hud, info:G.info, player:me(), rivals:rivals(), spawn:(kit, name) => makeAthlete(kit, name), done: res => finishEvent(ev, res) };
  G.inst = ev.make(ctx); sfx(300, 0.2, 'sawtooth', 0.03); duckMusic(true);
}
function finishEvent(ev, res){
  if (!G.inst) return; duckMusic(false); clearInterval(G.drawKey); G.drawKey = null; const done = G.inst; G.inst = null; G.paused = false; G.errOnce = false; done.dispose && setTimeout(() => done.dispose(), 400);
  const R = rivals(), mine = res.value ?? null;
  const vals = R.map((r, i) => res.rivals && res.rivals[i] !== undefined ? res.rivals[i] : ev.cpuSim ? ev.cpuSim(r.skill) : cpuValue(ev, r.skill));
  const rows = [{ ...me(), me:true, value:mine }, ...R.map((r, i) => ({ ...r, value: vals[i] }))];
  const score = v => v === null ? -1e9 : ev.lower ? -v : v;
  rows.sort((a, b) => score(b.value) - score(a.value)); rows.forEach((r, i) => r.rank = i);
  const myRank = rows.findIndex(r => r.me), rc = rec(G.who), prev = rc.best[ev.id], pb = mine !== null && (prev === undefined || (ev.lower ? mine < prev : mine > prev));
  if (pb){ rc.best[ev.id] = mine; } if (G.champ && myRank === 0) rc.golds++; LS.set('rec.'+G.who, rc);
  if (G.champ){ const C = G.champ; rows.forEach(r => { const t = C.table[r.name] || (C.table[r.name] = { g:0, s:0, b:0, pts:0 }); t.pts += PTS[r.rank]; if (r.rank===0) t.g++; if (r.rank===1) t.s++; if (r.rank===2) t.b++; }); C.results[C.i] = { mine, rank: myRank }; }
  if (myRank === 0) cheer(1);
  if (!['pool','dive','piste'].includes(ev.venue)){ const pa = W.athletes.find(a => a.name === me().name); if (pa) setTimeout(() => pa.play(myRank === 0 ? 'Celebration' : myRank < 3 ? (hasClip('Yes') ? 'Yes' : 'Celebration') : (hasClip('Idle_Tired') ? 'Idle_Tired' : 'Crying'), { fade:0.3 }), 300); }
  results(ev, rows, pb);
}
function pause(){
  if (!G.inst) return; G.paused = true; sfx(400, 0.05); duckMusic(false);
  const ov = document.createElement('div'); ov.className = 'abs'; ov.style.cssText = 'inset:0;background:rgba(7,18,42,.72);z-index:30'; ov.innerHTML = `<div style="animation:fo .2s ease-out;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;background:#07122A;border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:34px 36px;display:flex;flex-direction:column;gap:12px"><span class="eyebrow" style="font-size:14px">${G.ev.name}${G.champ ? ' · EVENT '+(G.champ.i+1)+' OF 10' : ''}</span><span class="sc-title" style="font-size:60px;margin-bottom:10px">PAUSED</span><button class="btn gbtn" data-r style="justify-content:center;font-size:34px">RESUME</button><button class="btn ghost" data-x style="justify-content:center;font-size:26px">RESTART EVENT</button><button class="btn ghost" data-q style="justify-content:center;font-size:26px">QUIT TO MENU</button><button class="btn ghost" data-s style="justify-content:center;height:48px;font:700 17px Barlow;letter-spacing:.1em">SOUND · ${G.sound ? 'ON' : 'OFF'}</button></div>`;
  UI.appendChild(ov);
  const close = () => { ov.remove(); G.paused = false; duckMusic(true); };
  ov.querySelector('[data-r]').onclick = close;
  ov.querySelector('[data-x]').onclick = () => { ov.remove(); G.inst?.dispose?.(); G.inst = null; startEvent(G.ev); };
  ov.querySelector('[data-q]').onclick = () => { ov.remove(); G.inst?.dispose?.(); G.inst = null; G.paused = false; G.champ = null; duckMusic(false); home(); };
  ov.querySelector('[data-s]').onclick = e => { G.sound = !G.sound; LS.set('sound', G.sound); setSfx(G.sound); e.target.textContent = 'SOUND · '+(G.sound ? 'ON' : 'OFF'); };
}

// ---------- M7 results ----------
function results(ev, rows, pb){
  setBack(false); const C = G.champ, last = C && C.i === 9;
  html(`<div>${scrim('results')}${header('RESULTS', ev.name, `<span class="dim" style="font:600 16px Barlow;letter-spacing:.16em">${C ? 'EVENT '+(C.i+1)+' OF 10' : 'PRACTICE'}</span>`)}
    <div class="abs" style="left:72px;top:212px;width:820px;display:flex;flex-direction:column;gap:4px;font-variant-numeric:tabular-nums">
      <div style="display:flex;padding:0 20px 6px;font:600 13px Barlow;letter-spacing:.18em;color:rgba(255,255,255,.55)"><span style="width:80px">RANK</span><span style="flex:1">ATHLETE</span><span style="width:170px;text-align:right">${ev.id==='fence' ? 'PLACE' : ev.lower ? 'TIME' : 'SCORE'}</span>${C ? '<span style="width:90px;text-align:right">PTS</span>' : ''}</div>
      ${rows.map(r => `<div class="row${r.me ? ' me' : ''}" style="height:72px"><span style="width:64px">${medalHtml(r.rank)}</span><span style="width:6px;height:40px;background:${r.kit.color}"></span><span class="C" style="flex:1;font-weight:${r.me ? 800 : 700};font-size:34px;display:flex;align-items:center;gap:12px">${r.name}${r.me && pb ? '<span class="tag">NEW PB</span>' : ''}</span><span class="C" style="width:170px;text-align:right;font-weight:800;font-size:34px">${fmtV(ev, r.value)}</span>${C ? `<span class="C" style="width:90px;text-align:right;font-weight:700;font-size:26px">${PTS[r.rank]}</span>` : ''}</div>`).join('')}
    </div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    <button class="btn ghost abs" data-again style="left:260px;bottom:36px">${C ? 'SCHEDULE' : 'TRY AGAIN'}</button>
    ${C ? `<button class="btn ghost abs" data-mt style="left:448px;bottom:36px">MEDAL TABLE</button>` : ''}
    <button class="btn gbtn abs" data-next style="right:72px;bottom:28px"><span><small>${C ? (last ? 'CHAMPIONSHIP' : 'NEXT · EVENT '+(C.i+2)) : 'PRACTICE'}</small>${C ? (last ? 'CEREMONY' : EVENTS[C.i+1].name) : 'PICK AN EVENT'}</span><span style="font-size:38px">›</span></button></div>`);
  on('[data-again]', () => { if (C){ C.i++; schedule(); } else intro(ev); });
  on('[data-mt]', () => { C.i++; medalTable(); }); on('[data-home]', () => home());
  on('[data-next]', () => { if (!C) return practice(); if (last) return podium(); C.i++; intro(EVENTS[C.i]); });
}

// ---------- M8 medal table ----------
function medalTable(){
  setBack(false); menuScene('Idle_Loop'); const st = standings(), C = G.champ;
  html(`<div>${scrim('full')}${header('CHAMPIONSHIP · AFTER '+C.i+' OF 10', 'MEDAL TABLE')}
    <div class="abs" style="left:72px;right:72px;top:212px;display:flex;flex-direction:column;gap:4px;font-variant-numeric:tabular-nums">
      <div style="display:flex;align-items:center;padding:0 24px 6px;font:600 13px Barlow;letter-spacing:.18em;color:rgba(255,255,255,.55)"><span style="width:80px">RANK</span><span style="flex:1">ATHLETE</span><span style="width:110px;text-align:center">GOLD</span><span style="width:110px;text-align:center">SILVER</span><span style="width:110px;text-align:center">BRONZE</span><span style="width:120px;text-align:right">POINTS</span></div>
      ${st.map((p, i) => `<div class="row${p.me ? ' me' : ''}" style="height:76px;padding:0 24px"><span class="C" style="width:64px;font-weight:800;font-size:34px">${i+1}</span><span style="width:6px;height:44px;background:${p.kit.color}"></span><span class="C" style="flex:1;font-weight:800;font-size:36px">${p.name}</span>${[p.g, p.s, p.b].map(n => `<span class="C" style="width:110px;text-align:center;font-weight:800;font-size:34px">${n}</span>`).join('')}<span class="C" style="width:120px;text-align:right;font-weight:800;font-size:34px">${p.pts}</span></div>`).join('')}
    </div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    <button class="btn ghost abs" data-sch style="left:260px;bottom:36px">SCHEDULE</button>
    <button class="btn gbtn abs" data-next style="right:72px;bottom:28px"><span><small>NEXT · EVENT ${C.i+1}</small>${EVENTS[C.i].name}</span><span style="font-size:38px">›</span></button></div>`);
  on('[data-sch]', schedule); on('[data-next]', () => intro(EVENTS[C.i])); on('[data-home]', () => home());
}

// ---------- M9 podium ----------
function podium(){
  setBack(false); clearAthletes(); const info = buildVenue('podium'); G.inEvent = true; const st = standings(), win = st[0];
  st.forEach((p, i) => { const a = makeAthlete(p.kit, p.name); const [x, y] = info.steps[i]; a.pivot.position.set(x, y, 2); a.pivot.rotation.y = -Math.PI/2; if (i===0 && hasClip('BackFlip')){ a.play('BackFlip', { once:true }); setTimeout(() => a.play(hasClip('Dance') ? 'Dance' : 'Celebration', { fade:0.3 }), 1700); } else a.play([null, 'Celebration', hasClip('Yes') ? 'Yes' : 'Wave', hasClip('Idle_Tired') ? 'Idle_Tired' : 'Idle_No_Loop'][i] || 'Celebration'); });
  setCam(new V3(50, 2.2, 10), new V3(50, 1.6, 2), true); cheer(1); setInterval(() => cheer(0.8), 2500);
  if (win.me){ const rc = rec(G.who); rc.champs++; LS.set('rec.'+G.who, rc); }
  html(`<div>${scrim('podium')}
    <div class="abs" style="left:0;right:0;top:56px;display:flex;flex-direction:column;align-items:center;gap:8px"><span class="eyebrow" style="font-size:16px;letter-spacing:.26em">CHAMPIONSHIP COMPLETE</span><span style="font:italic 800 96px/.9 'Barlow Condensed'">${win.name} IS CHAMPION</span>
    <div class="C" style="display:flex;gap:26px;margin-top:10px;font-weight:800;font-size:32px;align-items:center">${st.find(p => p.me) ? `<span class="dim" style="font:600 14px Barlow;letter-spacing:.18em">${me().name}</span><span style="display:flex;gap:10px;align-items:center"><span class="medal m1"></span>${st.find(p => p.me).g}</span><span style="display:flex;gap:10px;align-items:center"><span class="medal m2"></span>${st.find(p => p.me).s}</span><span style="display:flex;gap:10px;align-items:center"><span class="medal m3"></span>${st.find(p => p.me).b}</span>` : ''}</div></div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button>
    <button class="btn gbtn abs" data-again style="right:28px;bottom:28px">PLAY AGAIN <span>›</span></button></div>`);
  on('[data-home]', () => location.reload()); on('[data-again]', () => { G.champ = { i:0, results:[], table:{} }; schedule(); });
}

// ---------- M10 records / M11 settings ----------
function records(){
  setBack(false); menuScene(); const r = rec(G.who);
  html(`<div>${scrim('full')}${header('PERSONAL BESTS', 'RECORDS', `<div style="display:flex;gap:6px">${Object.keys(PLAYERS).map(w => `<button class="btn C" data-who="${w}" style="height:60px;width:150px;border-radius:4px;font-weight:800;font-size:28px;${w===G.who ? 'background:#F2B705;color:#0B1B3A' : 'border:1px solid rgba(255,255,255,.25)'}">${PLAYERS[w]}</button>`).join('')}</div>`)}
    <div class="abs dim" style="left:72px;top:206px;display:flex;gap:40px;font:600 15px Barlow;letter-spacing:.14em"><span>CHAMPIONSHIPS WON <b class="C" style="font-size:24px;color:#fff;margin-left:6px">${r.champs}</b></span><span>GOLD MEDALS <b class="C" style="font-size:24px;color:#fff;margin-left:6px">${r.golds}</b></span></div>
    <div class="abs" style="left:72px;right:72px;top:256px;display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:column;grid-template-rows:repeat(5,60px);gap:6px 24px">${EVENTS.map(ev => `<div class="row"><span class="C" style="flex:1;font-weight:700;font-size:26px">${ev.name}</span><span class="C" style="font-weight:800;font-size:28px">${r.best[ev.id] !== undefined ? ev.fmt(r.best[ev.id]) : '<span class="dim" style="font-size:22px">not played yet</span>'}</span></div>`).join('')}</div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button></div>`);
  on('[data-who]', b => { G.who = b.dataset.who; LS.set('player', G.who); records(); }); on('[data-home]', () => home());
}
function settings(){
  setBack(false); menuScene();
  const tog = (id, on, a='ON', b='OFF') => `<span style="display:flex;gap:4px"><button class="btn C" data-t="${id}:1" style="width:120px;height:56px;border-radius:3px;font-weight:800;font-size:24px;${on ? 'background:#F2B705;color:#0B1B3A' : 'border:1px solid rgba(255,255,255,.25)'}">${a}</button><button class="btn C" data-t="${id}:0" style="width:120px;height:56px;border-radius:3px;font-weight:800;font-size:24px;${!on ? 'background:#F2B705;color:#0B1B3A' : 'border:1px solid rgba(255,255,255,.25)'}">${b}</button></span>`;
  html(`<div>${scrim('full')}${header('SUMMER CHAMPS', 'SETTINGS')}
    <div class="abs" style="left:72px;top:220px;width:820px;display:flex;flex-direction:column;gap:8px">
      <div class="row" style="height:76px;padding:0 12px 0 24px"><span class="C" style="flex:1;font-weight:700;font-size:30px">SOUND EFFECTS</span>${tog('sound', G.sound)}</div>
      <div class="row" style="height:76px;padding:0 12px 0 24px"><span style="flex:1;display:flex;flex-direction:column"><span class="C" style="font-weight:700;font-size:30px;line-height:1">PERFORMANCE MODE</span><span class="dim" style="font:500 14px Barlow">Faster on older tablets: lower resolution, no shadows. Reloads the game.</span></span>${tog('perf', PERF)}</div>
      <div class="row" style="height:76px;padding:0 12px 0 24px"><span class="C" style="flex:1;font-weight:700;font-size:30px">RESET RECORDS</span><span style="display:flex;gap:4px">${Object.keys(PLAYERS).map(w => `<button class="btn C" data-reset="${w}" style="width:120px;height:56px;border-radius:3px;border:1px solid #E5484D;color:#FF8A8D;font-weight:700;font-size:24px">${PLAYERS[w]}</button>`).join('')}</span></div>
    </div>
    <button class="btn ghost abs" data-home style="left:72px;bottom:36px">MENU</button></div>`);
  on('[data-t]', b => { const [k, v] = b.dataset.t.split(':'); if (k === 'perf'){ if ((v === '1') !== PERF){ LS.set('perf', v === '1'); LS.flush(); setTimeout(() => location.reload(), 200); } return; } G[k] = v === '1'; LS.set(k, G[k]); if (k === 'sound') setSfx(G.sound); settings(); });
  on('[data-reset]', b => { if (b.dataset.armed === '2') return; if (b.dataset.armed){ LS.set('rec.'+b.dataset.reset, { best:{}, champs:0, golds:0 }); b.dataset.armed = '2'; b.textContent = 'CLEARED'; Object.assign(b.style, { background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.25)', color:'rgba(255,255,255,.7)' }); } else { b.dataset.armed = '1'; b.textContent = 'SURE?'; Object.assign(b.style, { background:'#E5484D', color:'#fff' }); } });
  on('[data-home]', () => home());
}

// ---------- boot ----------
// Keyboard: ← = L pad, → = R pad, Space = the gold action button (menus: the gold button on screen).
const KEYS = { ArrowLeft:'L', ArrowRight:'R', Space:'action' };
const pressVis = on => { const a = UI.querySelector('[data-in="action"]'); if (a) a.classList.toggle('press', on); };
const FENCE_KEYS = { KeyW:'pHigh', KeyS:'pMid', KeyX:'pLow', KeyU:'aHigh', KeyJ:'aMid', KeyM:'aLow' };
addEventListener('keydown', e => {
  if (FENCE_KEYS[e.code] && G.inst && !G.paused && G.ev?.id==='fence'){ e.preventDefault(); if (!e.repeat) G.inst.btn?.(FENCE_KEYS[e.code]); return; }
  const k = KEYS[e.code]; if (!k) return; e.preventDefault(); if (e.repeat) return;
  if (G.paused){ if (k==='action') UI.querySelector('[data-r]')?.click(); return; }
  if (!G.inst){ if (k==='action') UI.querySelector('.gbtn')?.click(); return; }
  if (k==='action' && G.ev.id==='archery'){ let dy = 0; G.dispatch('drag', true, { phase:'start', dy:0 }); clearInterval(G.drawKey); G.drawKey = setInterval(() => { dy += 5; G.dispatch('drag', true, { phase:'move', dy }); }, 16); return; }
  if (k==='action') pressVis(true);
  G.dispatch(k, true);
});
addEventListener('keyup', e => {
  if (G.inst && G.ev?.id==='dive' && KEYS[e.code] && e.code !== 'Space'){ G.dispatch(KEYS[e.code], false); return; }
  if (e.code !== 'Space' || !G.inst) return;
  if (G.drawKey){ clearInterval(G.drawKey); G.drawKey = null; G.dispatch('drag', false, { phase:'end' }); return; }
  pressVis(false); G.dispatch('action', false);
});
initRenderer(document.getElementById('gl'));
let last = performance.now();
(function loop(now){ requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last)/1000) * (W.timeScale ?? 1) * (W.slow ?? 1); last = now; if (G.inst && !G.paused){ try { G.inst.update(dt); } catch (e){ if (!G.errOnce){ G.errOnce = true; console.error('event update failed', e); } } } renderFrame(G.paused ? 0 : dt); })(last);
loadAssets(mb => document.getElementById('loadtxt').textContent = 'LOADING ATHLETES… '+mb.toFixed(1)+' MB')
  .then(() => { document.getElementById('load').remove(); home(); })
  .catch(e => { document.getElementById('loadtxt').textContent = 'COULD NOT LOAD: '+(e.message || e); console.error(e); });
window.__SC = { G, W, EVENTS, startEvent, intro, finishEvent };
