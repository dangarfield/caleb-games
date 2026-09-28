/* game.js — Dino Park's screens and rules. HTML draws every menu and the HUD (templates.js, generated from the
 * Claude Design prototype); the park itself is the Three.js <dino-world> element underneath (world.js).
 * The Game class below is the prototype's logic component carried over nearly line for line, on a tiny
 * setState/morph shim instead of React. Arcade changes are marked ARCADE. */

import { DAYS, NDAYS, DINO_ORDER, DINO, PARK_ORDER, PARKS, PRICES, FEAT, RW, TIER_FRAC, PIECE_NAMES, TRAY, STOPS, PCOL, LEVEL_XP, PEN_RANK, SHOP, HOW, TREAT_TILES, SKIN_LIST, fmt } from './data.js';
import { stageHTML } from './templates.js';
import { sfx, worldSfx } from './audio.js';
import { musicFor } from './music.js';

// ---------------------------------------------------------------- saves (IndexedDB via ArcadeStore)
const Store = window.ArcadeStore('dino-park');
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
let gen = 0;
function freshProfile(name, avatar) { return { name, avatar, diff: 'normal', jar: 0, xp: 0, owned: ['park-jungle', 'pen-log'], days: {} }; }
function freshProfiles() { return { caleb: freshProfile('Caleb', 'rexy'), ezra: freshProfile('Ezra', 'zippy') }; }
function loadSave() {
  const d = Store.get(); if (!d || !d.profiles) return null;
  gen = d.gen || 0; const f = freshProfiles();
  for (const k of ['caleb', 'ezra']) f[k] = Object.assign(f[k], d.profiles[k] || {});
  return { profiles: f, player: d.player };
}
function writeSave(o) {
  if (Store.conflict && Store.conflict()) return false;
  gen += 1; Store.set(null, { v: 1, profiles: o.profiles, player: o.player, gen, sid: SID }, { guard: true }); return true;
}

// ---------------------------------------------------------------- shop effects in the world (ARCADE)
const SKIN_OF = {}; SKIN_LIST.forEach(([d, k]) => { SKIN_OF['skin-' + k] = [d, k]; });
const isOn = (p, id) => p.owned.includes(id) && !(p.off || []).includes(id);   // bought items can be switched off in the shop
function skinsOf(p) { const o = {}; p.owned.forEach(id => { if (SKIN_OF[id] && isOn(p, id)) o[SKIN_OF[id][0]] = SKIN_OF[id][1]; }); return o; }
function treatsOf(p) { return p.owned.filter(id => /^treat-/.test(id) && isOn(p, id)).map(id => id.slice(6)).sort(); }

// ---------------------------------------------------------------- who's in the park, and which egg (ARCADE)
// Every day starts with 3 dinos in the park's 5 pens (6 in Snowy Peaks), as in the design. They're the 3 most recently met
// dinos; early on, when fewer than 3 have been met, the next dinos in hatching order fill in (never today's new one).
// On a day that debuts a dino, the first egg you buy hatches it — the day's big reveal. Otherwise an egg hatches a met
// dino who isn't in the park, or any met dino. Every egg costs coins.
const EGG_PRICE = PRICES.egg;
const featuredFor = n => { const u = DAYS[n - 1].unlock; return u.kind === 'dino' ? u.id : null; };
const metBefore = n => DINO_ORDER.filter(id => DINO[id].day < n);
const PENS = { jungle: 5, volcano: 5, desert: 5, beach: 5, snowy: 6 };
function residentsFor(n) { const r = metBefore(n).slice(-3); for (const id of DINO_ORDER) { if (r.length >= 3) break; if (DINO[id].day > n) r.push(id); } return r; }

// ---------------------------------------------------------------- the React-ish shim
function morph(old, neu) {
  const oa = old.attributes, na = neu.attributes;
  for (let i = oa.length - 1; i >= 0; i--) { const n = oa[i].name; if (!neu.hasAttribute(n)) old.removeAttribute(n); }
  for (let i = 0; i < na.length; i++) { const { name, value } = na[i]; if (old.getAttribute(name) !== value) old.setAttribute(name, value); }
  if (old.tagName === 'DP-ICON') return;                        // its <img> is its own business
  const oc = old.childNodes, nArr = Array.from(neu.childNodes);
  for (let i = 0; i < nArr.length; i++) {
    const n = nArr[i], o = oc[i];
    if (!o) { old.appendChild(n); continue; }
    if (o.nodeType !== n.nodeType || (o.nodeType === 1 && o.tagName !== n.tagName)) { old.replaceChild(n, o); continue; }
    if (o.nodeType === 3) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; continue; }
    if (o.nodeType === 1) morph(o, n);
  }
  while (oc.length > nArr.length) old.removeChild(old.lastChild);
}
class Logic {
  constructor(root) { this.root = root; this._cbs = []; this._raf = 0; this.H = []; }
  setState(p, cb) {
    const patch = typeof p === 'function' ? p(this.state) : p;
    if (patch) this.state = Object.assign({}, this.state, patch);
    if (cb) this._cbs.push(cb);
    if (!this._raf) this._raf = requestAnimationFrame(() => this.render());
  }
  render() {
    this._raf = 0; this.H = [];
    const html = stageHTML(this.renderVals(), fn => { this.H.push(fn); return this.H.length - 1; });
    const t = document.createElement('div'); t.innerHTML = html;
    for (const a of this.root.attributes) t.setAttribute(a.name, a.value);
    morph(this.root, t);
    const ps = this._last; this._last = this.state;
    const cbs = this._cbs; this._cbs = []; cbs.forEach(f => f());
    if (this.componentDidUpdate) this.componentDidUpdate({}, ps);
  }
  mount() {
    this.root.addEventListener('click', e => {
      const t = e.target.closest('[data-on]'); if (!t || !this.root.contains(t)) return;
      const fn = this.H[+t.dataset.on]; if (typeof fn === 'function') { sfx.tap(); fn(e); }
    });
    this.componentDidMount && this.componentDidMount();
    this.render();
  }
}

class Game extends Logic {
  state = { screen: 'home', player: 'caleb', profiles: freshProfiles(), day: 1, mapPark: null, needs: [], howPage: 0, bookSel: 'stompy', bookView: 0, bookFrom: 'home', treatUsed: {},
    coins: 150, happy: .6, happyCount: 0, hatched: 0, fed: 0, escapes: 0, caught: 0, built: {}, coinsEarned: 0, selected: null, paused: false,
    parkDinos: [], featPts: 0, bestHappy: 0, tiers: [300, 500, 750], emptyPens: 0, fullBins: 0, visitors: 0, toastIcon: 'item/net', starPop: 0,
    escapee: null, bannerBig: false, toast: null, hatchCard: null, introStep: 6, result: null, resultK: 0, shake: null, shopShake: null, jarBump: false };

  componentDidMount() {
    const sv = loadSave(); if (sv) this.state.profiles = sv.profiles, this.state.player = sv.player || 'caleb';
    this._ev = e => this.onWorld(e.detail || {}); window.addEventListener('dp:world', this._ev);
    this.sync();
  }
  componentDidUpdate(pp, ps) {
    const s = this.state;
    { // ARCADE: music follows the park on screen — the selected tab on the Day map, the current park on Home, the day's park in a day
      const p = this.prof(), cp = DAYS[this.curDay(p) - 1].park;
      const mk = s.screen === 'map' ? (s.mapPark || cp) : s.screen === 'home' ? cp : ['intro', 'play', 'result'].includes(s.screen) ? DAYS[s.day - 1].park : null;
      if (mk) musicFor(mk);
    }
    if (!ps || ps.screen !== s.screen || ps.player !== s.player) this.sync();
    if (s.screen === 'play' && s.introStep >= 6) {
      const R = this.ratingOf(s).total; const n = s.tiers.filter(t => R >= t).length;
      if (n > (this._lastStars || 0)) { this._lastStars = n; this.setState({ toast: n === 3 ? '3 stars! Amazing park!' : n === 1 ? '1 star! Keep growing!' : '2 stars! Nearly there!', toastIcon: 'item/star', starPop: n }); sfx.star(n - 1); this.later(() => this.setState({ toast: null }), 2400); }
      const tk = 3 + Math.floor(Math.max(0, R - (s.startRating || 0)) / 250); if (tk !== this._ticket) { this._ticket = tk; this.w('configure', { ticket: tk }); }
    }
  }
  ratingOf(s) {
    const n = s.parkDinos.length, k = new Set(s.parkDinos).size;
    const parts = [
      { label: n + ' dinos in the park', icon: 'dino/stompy?pose=happy&view=front', pts: n * RW.dino },
      { label: k + ' different kinds', icon: 'item/egg?dino=spike', pts: k * RW.kind },
      { label: 'Park features built', icon: 'piece/fountain', pts: Math.round(s.featPts * RW.feat) },
      { label: s.happyCount + ' happy visitors', icon: 'item/visitor?mood=happy&i=2', pts: Math.round(s.happyCount * RW.happy) },
      { label: s.fed + ' times you helped', icon: 'food/leaf', pts: Math.round(s.fed * RW.care) },
      { label: s.caught + ' runaways caught', icon: 'item/net', pts: s.caught * RW.catch },
    ];
    return { total: parts.reduce((a, p) => a + p.pts, 0), parts };
  }
  // ARCADE: the designer's targets (120 per resident + 100), on the resident rating; Day 1's empty park counts its first egg in
  tiersFor(n, start, pd) { const T3 = 120 * Math.max(1, pd.length) + 100, base = pd.length ? 0 : RW.dino + RW.kind; return TIER_FRAC.map(f => start + base + Math.round(T3 * f / 10) * 10); }
  nextEgg(s, dn) { dn = dn || s.day; const f = featuredFor(dn); if (f && !s.parkDinos.includes(f)) return f; const un = DINO_ORDER.filter(id => DINO[id].day <= dn); const fresh = un.slice().reverse().find(id => !s.parkDinos.includes(id)); return fresh || un[s.parkDinos.length % un.length] || 'stompy'; }
  eggPrice() { return EGG_PRICE; }
  tipFor(s, dn) {
    const esc = s.escapee, T = (icon, text, pts, tap, ring) => ({ icon, text, pts: pts || '', hasPts: !!pts, tap: tap || (() => {}), ring: ring || '#58B84F' });
    if (esc) return T('dino/' + esc.id + '?pose=escaped', 'Catch ' + esc.name + '! Tap it', '+10 rating', () => this.w('focusDino', esc.id), '#FF6B5B');
    const urg = s.needs.find(n => !n.escaped && n.need && Math.max(n.hunger, n.fun) >= .75);
    if (urg) return T(urg.need === 'fun' ? 'item/ball' : 'food/' + DINO[urg.id].eats, DINO[urg.id].name + (urg.need === 'fun' ? ' wants to play!' : ' is hungry!'), '+3 rating', () => this.w('focusDino', urg.id), '#FFC93C');
    if (s.fullBins > 0) return T('item/bin-full', 'A bin is full. Tap its bubble!', '', null, '#FFC93C');
    const egg = this.nextEgg(s, dn), isNew = !s.parkDinos.includes(egg);
    if (s.emptyPens > 0 && s.coins >= this.eggPrice(s)) return T('item/egg?dino=' + egg, isNew && egg === featuredFor(dn) ? 'Hatch today\'s new dino!' : isNew ? 'Hatch a new kind of dino!' : 'Hatch another dino!', isNew ? '+100 rating' : '+40 rating', () => this.tapTile('egg'));
    if (s.emptyPens === 0 && s.coins >= PRICES.pen_s) return T('piece/pen_s', 'Build a pen for more dinos', '+' + FEAT.pen_s + ' rating', () => this.tapTile('pen_s'));
    if (s.happy < .5 && dn >= 4 && s.coins >= PRICES.fountain) return T('piece/fountain', 'Visitors want more fun!', '+' + FEAT.fountain + ' rating', () => this.tapTile('fountain'), '#4BB4E6');
    if (s.visitors >= 12 && (s.built.icecream || 0) + (s.built.burger || 0) < 1 && s.coins >= PRICES.icecream) return T('piece/icecream', 'Hungry visitors! Build a snack stall', '+' + FEAT.icecream + ' rating', () => this.tapTile('icecream'), '#4BB4E6');
    const need = s.emptyPens > 0 ? this.eggPrice(s) : PRICES.pen_s;
    if (s.coins < need) return T('item/coin', 'Saving up: ' + s.coins + ' / ' + need + ' coins', '', null, '#FFC93C');
    return T('piece/tree', 'Trees and flowers make visitors smile', '+' + FEAT.tree + ' rating', () => this.tapTile('tree'));
  }
  save(profiles, player) { writeSave({ profiles: profiles || this.state.profiles, player: player || this.state.player }); }
  later(fn, ms) { this._timers = this._timers || []; const t = setTimeout(fn, ms); this._timers.push(t); return t; }
  w(fn, ...args) { const go = n => { const el = document.querySelector('dino-world'); if (el && typeof el[fn] === 'function') el[fn](...args); else if (n < 60) setTimeout(() => go(n + 1), 200); }; go(0); }

  prof(pid) { return this.state.profiles[pid || this.state.player]; }
  starsOf(p) { return Object.values(p.days).reduce((a, d) => a + (d.s || 0), 0); }
  curDay(p) { for (let i = 1; i <= NDAYS; i++) if (!p.days[i] || !p.days[i].s) return i; return NDAYS; }
  lvl(p) { const xp = p.xp || 0; return { level: 1 + Math.floor(xp / LEVEL_XP), pct: Math.round((xp % LEVEL_XP) / LEVEL_XP * 100) }; }
  penStyle(p) { if (p.pen && p.owned.includes(p.pen)) return p.pen.split('-')[1]; const o = PEN_RANK.find(id => p.owned.includes(id)); return o ? o.split('-')[1] : 'log'; }  // ARCADE: the pen chosen in the shop
  parkOpen(p, park) { return this.starsOf(p) >= PARKS[park].need; }  // ARCADE: stars alone open a park (Dan)
  dayOpen(p, n) { if (n === 1) return true; const prev = p.days[n - 1]; return !!(prev && prev.s) && this.parkOpen(p, DAYS[n - 1].park); }
  eggFor(n) { return featuredFor(n) || metBefore(n).slice(-1)[0] || 'stompy'; }

  sync() {
    const s = this.state; const p = this.prof();
    const park = s.screen === 'home' ? DAYS[this.curDay(p) - 1].park : DAYS[s.day - 1].park;
    const mode = { home: 'home', intro: 'preview', play: s.introStep >= 6 ? 'play' : 'preview', result: 'result' }[s.screen] || 'idle';
    this.w('configure', { park, mode, cameo: 'right', difficulty: 'normal', egg: this.eggFor(s.day), penStyle: this.penStyle(p), skins: skinsOf(p), treats: treatsOf(p), residents: s.screen === 'home' ? residentsFor(Math.min(NDAYS, this.curDay(p) + 1)) : residentsFor(s.day) });
    this.w('setPaused', s.paused);
    if (s.screen !== 'play') this.w('select', null);
  }
  go(screen, extra) { if (screen !== 'play') { (this._introT || []).forEach(clearTimeout); this._introT = []; } this.setState(Object.assign({ screen, paused: false, selected: null }, extra || {}), () => { this.sync(); if (screen === 'intro') this.w('resetDay'); }); }  // ARCADE: the intro previews a fresh park, so its targets match the day

  startDay(n, opt = {}) {
    (this._timers || []).forEach(clearTimeout); this._timers = [];
    const p = this.prof(); const park = DAYS[n - 1].park;
    this._lastStars = 0; this._ticket = 0;
    this.setState({ screen: 'play', day: n, coins: 150, happy: .6, happyCount: 0, hatched: 0, fed: 0, escapes: 0, caught: 0, built: {}, coinsEarned: 0, featPts: 0, bestHappy: 0, starPop: 0, selected: null, paused: false, escapee: null, bannerBig: false, toast: null, hatchCard: null, introStep: opt.skipIntro ? 6 : 0, result: null, needs: [], treatUsed: {} });
    this.w('configure', { park, mode: opt.skipIntro ? 'play' : 'preview', difficulty: 'normal', egg: this.eggFor(n), penStyle: this.penStyle(p), skins: skinsOf(p), treats: treatsOf(p), residents: residentsFor(n) });
    this.w('resetDay');
    if (!opt.skipIntro) this.later(() => this.runIntro(), 50);
    if (opt.then) this.later(opt.then, 900);
  }
  runIntro() {
    (this._introT || []).forEach(clearTimeout); this._introT = [];
    this.setState({ introStep: 0 }); this.w('configure', { mode: 'preview' });
    const at = [450, 1550, 2650, 3750, 4850, 6400];
    at.forEach((ms, i) => this._introT.push(setTimeout(() => { this.setState({ introStep: i + 1 }); if (i < 5) sfx.whoosh(i); if (i + 1 === 6) this.w('configure', { mode: 'play' }); }, ms)));
  }
  onWorld(d) {
    const s = this.state;
    if (d.type === 'built') { const pd = d.dinos || []; const start = pd.length * RW.dino + new Set(pd).size * RW.kind; this._lastStars = 0; this.setState(x => ({ parkDinos: pd, startRating: start, tiers: this.tiersFor(x.day, start, pd) })); return; }
    if (s.screen !== 'play') return;
    const live = s.introStep >= 6;
    worldSfx(d);
    switch (d.type) {
      case 'coins': this.setState(x => ({ coins: x.coins + d.amount, coinsEarned: x.coinsEarned + d.amount })); break;
      case 'stats': this.setState(x => ({ happy: d.avg, happyCount: d.happyCount, bestHappy: live ? Math.max(x.bestHappy, d.avg) : x.bestHappy })); break;
      case 'placed': this.setState(x => ({ treatUsed: d.piece === 'balloons' || d.piece === 'statue' ? Object.assign({}, x.treatUsed, { [d.piece]: 1 }) : x.treatUsed, coins: x.coins - (d.piece === 'egg' ? this.eggPrice(x) : (PRICES[d.piece] || 0)), featPts: x.featPts + (FEAT[d.piece] || 0), built: Object.assign({}, x.built, { [d.piece]: (x.built[d.piece] || 0) + 1 }), selected: null })); break;
      case 'removed': this.setState(x => ({ coins: x.coins + Math.floor((PRICES[d.piece] || 0) / 2) })); break;
      case 'fixed': if (d.kind === 'food' || d.kind === 'fun') this.setState(x => ({ fed: x.fed + 1 })); break;
      case 'needs': this.setState({ needs: d.list || [], emptyPens: d.emptyPens || 0, fullBins: d.fullBins || 0, visitors: d.visitors || 0 }); break;
      case 'escaped': this.setState(x => ({ escapes: x.escapes + 1, escapee: { id: d.dino, name: d.name, taps: d.taps, left: d.taps, reason: d.reason || 'got out' }, bannerBig: true })); this.later(() => this.setState({ bannerBig: false }), 2600); break;
      case 'nospace': this.setState({ selected: null, toast: 'No room left for that!', toastIcon: 'item/lock' }); this.w('select', null); this.later(() => this.setState({ toast: null }), 2400); break;
      case 'net-hit': this.setState(x => ({ escapee: x.escapee ? Object.assign({}, x.escapee, { left: d.left }) : null })); break;
      case 'caught': this.setState(x => ({ caught: x.caught + 1, escapee: null, bannerBig: false, toast: 'Got ' + d.name + '!', toastIcon: 'item/net' })); this.later(() => this.setState({ toast: null }), 1700); break;
      case 'hatched': this.setState(x => ({ hatched: x.hatched + 1, parkDinos: x.parkDinos.concat(d.dino), hatchCard: { id: d.dino } })); this.later(() => this.closeHatch(), 4200); break;
    }
  }
  closeHatch() { if (this.state.hatchCard) { this.setState({ hatchCard: null }); this.w('releaseFocus'); } }
  goalView(g, s, n) {
    const t = g.t || 0; const eg = this.eggFor(n);
    if (g.k === 'hatch') return { icon: 'item/egg?dino=' + eg, big: '' + t, label: 'Hatch ' + t + ' egg' + (t > 1 ? 's' : ''), prog: Math.min(s.hatched, t) + '/' + t, met: s.hatched >= t };
    if (g.k === 'happy') return { icon: 'item/visitor?mood=happy&i=2', big: '' + t, label: t + ' happy visitors', prog: Math.min(s.happyCount, t) + '/' + t, met: s.happyCount >= t };
    if (g.k === 'build') return { icon: 'piece/' + g.p, big: '' + t, label: 'Build ' + PIECE_NAMES[g.p], prog: Math.min(s.built[g.p] || 0, t) + '/' + t, met: (s.built[g.p] || 0) >= t };
    if (g.k === 'coins') return { icon: 'item/coin', big: '' + t, label: 'Earn ' + t + ' coins', prog: Math.min(s.coinsEarned, t) + '/' + t, met: s.coinsEarned >= t };
    if (g.k === 'feed') return { icon: 'food/leaf', big: '' + t, label: 'Help ' + t + ' dinos', prog: Math.min(s.fed, t) + '/' + t, met: s.fed >= t };
    return { icon: 'item/net', big: 'All', label: 'Catch every runaway', prog: s.escapee ? 'Go!' : s.escapes ? s.caught + '/' + s.escapes : 'None out', met: !s.escapee, live: s.caught > 0 && !s.escapee };
  }
  endDay(fake) {
    const s = this.state; const n = s.day;
    let st = s;
    if (fake) { const extra = { featPts: 0, fed: 9, caught: 2, bestHappy: .84, happyCount: 38, coinsEarned: 312, escapee: null, parkDinos: s.parkDinos.concat(['tiny', 'bonk']) }; const base = this.ratingOf(Object.assign({}, s, extra)).total; const tgt = fake === 1 ? s.tiers[2] + 40 : Math.round((s.tiers[1] + s.tiers[2]) / 2); st = Object.assign({}, s, extra, { featPts: Math.max(20, tgt - base) }); }
    const R = this.ratingOf(st); const fw = isOn(this.prof(), 'treat-fireworks');
    if (fw) { const b = Math.round(R.total * .05); R.parts.push({ label: 'Fireworks show +5%', icon: 'item/fireworks', pts: b }); R.total += b; }  // ARCADE: Fireworks treat
    const stars = st.tiers.filter(t => R.total >= t).length; const score = R.total;
    const bonusJar = DAYS[n - 1].unlock.icon === 'item/jar' ? 2 : 1;  // ARCADE: Day 23 'Bonus jar' doubles the jar
    const parts = R.parts.filter(p => p.pts > 0).slice(-6).map((p, i) => Object.assign({}, p, { delay: 300 + i * 120 }));
    const starSlots = [0, 1, 2].map(i => ({ met: i < stars, delay: 600 + i * 550 }));
    const profiles = Object.assign({}, s.profiles); const p = Object.assign({}, profiles[s.player]); const prev = p.days[n] || { s: 0, b: 0 };
    const newBest = score > prev.b;
    const xp = st.happyCount + stars * 20 + st.caught * 10; const lv0 = this.lvl(p).level; p.xp = (p.xp || 0) + xp; const lv1 = this.lvl(p).level; const lvUp = lv1 > lv0;
    p.days = Object.assign({}, p.days, { [n]: { s: Math.max(prev.s, stars), b: Math.max(prev.b, score) } }); p.jar = p.jar + st.coinsEarned * bonusJar + (lvUp ? 100 * (lv1 - lv0) : 0); profiles[s.player] = p;
    (this._introT || []).forEach(clearTimeout); this._introT = [];
    this.setState({ screen: 'result', paused: false, escapee: null, hatchCard: null, toast: null, profiles, result: { day: n, stars, score, newBest, coins: st.coinsEarned * bonusJar, earned: st.coinsEarned, happy: st.happyCount, parts, starSlots, xp, lvUp, level: lv1 }, resultK: 0, needs: [] }, () => this.sync());
    this.save(profiles);
    const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 1800); this.setState({ resultK: k }); if (k < 1 && this.state.screen === 'result') requestAnimationFrame(step); };
    this.later(() => requestAnimationFrame(step), 400);
    if (stars === 3) this.later(() => { this.w('celebrate'); sfx.roar(); }, 1500);
    if (fw) this.later(() => this.w('fireworks'), 900);
    starSlots.forEach((g, i) => { if (g.met) this.later(() => sfx.star(i), 400 + g.delay + 500); });
    if (newBest) this.later(() => sfx.best(), 2400);
  }
  tapTile(id) {
    const s = this.state; const price = id === 'egg' ? this.eggPrice(s) : PRICES[id];
    if (s.selected === id) { this.setState({ selected: null }); this.w('select', null); sfx.tap(); return; }
    if (s.coins < price) { this.setState({ shake: id }); sfx.nope(); this.later(() => this.setState({ shake: null }), 450); return; }
    if (id === 'egg' && s.emptyPens === 0) { this.setState({ shake: id, toast: 'Build a pen first!', toastIcon: 'piece/pen_s' }); sfx.nope(); this.later(() => this.setState({ shake: null }), 450); this.later(() => this.setState({ toast: null }), 2200); return; }
    sfx.select();
    if (id === 'egg') this.w('configure', { egg: this.nextEgg(s) });
    this.setState({ selected: id }); this.w('select', id);
  }
  buy(it, row) {
    const p = this.prof();
    if (p.owned.includes(it.id)) {  // ARCADE: tap something you own to switch it on or off (pens: choose which one to use)
      if (row.id === 'pens') this.setProf(this.state.player, { pen: it.id });
      else { const off = (p.off || []).filter(x => x !== it.id); if (isOn(p, it.id)) off.push(it.id); this.setProf(this.state.player, { off }); }
      sfx.select(); return;
    }
    const locked = it.dino && DINO[it.dino].day > this.curDay(p);
    if (p.jar < it.price || locked) { this.setState({ shopShake: it.id }); sfx.nope(); this.later(() => this.setState({ shopShake: null }), 450); return; }
    const profiles = Object.assign({}, this.state.profiles); profiles[this.state.player] = Object.assign({}, p, { jar: p.jar - it.price, owned: p.owned.concat(it.id) }, row.id === 'pens' ? { pen: it.id } : {});
    this.setState({ profiles, jarBump: true }); sfx.buy(); this.later(() => this.setState({ jarBump: false }), 500); this.save(profiles);
  }
  setProf(pid, patch) { const profiles = Object.assign({}, this.state.profiles); profiles[pid] = Object.assign({}, profiles[pid], patch); this.setState({ profiles }); this.save(profiles); }

  renderVals() {
    const s = this.state;
    const me0 = this.prof(); const meStars = this.starsOf(me0);
    const LV = this.lvl(me0); const me = { name: me0.name, color: PCOL[s.player], avatarIcon: 'dino/' + me0.avatar + '?pose=happy&view=front', stars: meStars, jar: fmt(me0.jar), level: LV.level, lvPct: LV.pct };
    const mkPlayer = pid => { const p = s.profiles[pid]; const sel = s.player === pid; const e = p.diff === 'easy';
      return { name: p.name, color: PCOL[pid], avatarIcon: 'dino/' + p.avatar + '?pose=happy&view=front', stars: this.starsOf(p), day: this.curDay(p), level: this.lvl(p).level, selected: sel, ring: sel ? '#58B84F' : '#fff', lift: sel ? -8 : 0,
        select: () => { this.setState({ player: pid }); this.save(null, pid); }, cycle: ev => { ev && ev.stopPropagation && ev.stopPropagation(); const i = DINO_ORDER.indexOf(p.avatar); this.setProf(pid, { avatar: DINO_ORDER[(i + 1) % DINO_ORDER.length] }); },
        easy: ev => { ev && ev.stopPropagation && ev.stopPropagation(); this.setProf(pid, { diff: 'easy' }); }, normal: ev => { ev && ev.stopPropagation && ev.stopPropagation(); this.setProf(pid, { diff: 'normal' }); },
        easyBg: e ? '#58B84F' : 'transparent', easyInk: e ? '#fff' : '#7A6553', normalBg: e ? 'transparent' : '#58B84F', normalInk: e ? '#7A6553' : '#fff', isCard: true, isPlay: false }; };
    const players = [mkPlayer('caleb'), mkPlayer('ezra')];
    const isEasy = me0.diff === 'easy';
    // map
    const cur = this.curDay(me0);
    const mpk = s.mapPark || DAYS[cur - 1].park;
    const regions = PARK_ORDER.map(k => { const open = this.parkOpen(me0, k); const ds = DAYS.map((d, i) => i + 1).filter(n => DAYS[n - 1].park === k); const got = ds.reduce((a, n) => a + ((me0.days[n] && me0.days[n].s) || 0), 0); const sel = k === mpk;
      return { tint: PARKS[k].tint, ink: PARKS[k].ink, name: PARKS[k].name, icon: 'land/' + k, starText: got + ' / ' + ds.length * 3, locked: !open, f: open ? 'none' : 'grayscale(.7)', o: open ? 1 : .7, ring: sel ? '#58B84F' : '#fff', lift: sel ? -6 : 0, tap: () => this.setState({ mapPark: k }) }; });
    const mpOpen = this.parkOpen(me0, mpk); const mpNeed = PARKS[mpk].need; const mpOk = meStars >= mpNeed;
    const mpDays = DAYS.map((d, i) => i + 1).filter(n => DAYS[n - 1].park === mpk);
    const mpDinos = [...new Set(mpDays.map(n => DAYS[n - 1].unlock).filter(u => u.kind === 'dino').map(u => u.id))];
    const mp = Object.assign({}, PARKS[mpk], { icon: 'land/' + mpk + '?size=512', locked: !mpOpen, dinoText: 'Meet ' + mpDinos.map(id => DINO[id].name).join(', '), dinos: mpDinos.map(id => ({ icon: 'dino/' + id + '?pose=happy&view=front' + (DINO[id].day <= cur ? '' : '&sil=1'), f: 'none' })),
      lockLabel: 'Need ' + mpNeed + ' stars', lockSub: 'You have ' + meStars + ' stars', lockTap: () => {} });
    const stops = mpDays.map((n, j) => { const [x, y] = STOPS[j]; const d = me0.days[n]; const open = mpOpen && this.dayOpen(me0, n); const done = !!(d && d.s); const current = open && n === cur && !done;
      return { n, x, y, open, locked: !open, done, current, label: done ? 'Best ' + fmt(d.b) : DAYS[n - 1].title, starList: [0, 1, 2].map(k => ({ o: d && d.s > k ? 1 : .3, f: d && d.s > k ? 'none' : 'grayscale(1)' })),
        bg: !open ? '#E9DDC6' : current ? '#58B84F' : '#fff', ink: current ? '#fff' : '#3B2F2A', shadow: !open ? '#CDBC9E' : current ? '#2F7D3B' : '#E3CFA6', anim: current ? 'dpPulse 1.8s infinite' : 'none',
        tap: () => open && this.go('intro', { day: n }) }; });
    // intro
    const dn = s.day, D = DAYS[dn - 1];
    const introTiers = s.tiers.map((t, i) => ({ pts: fmt(t), stars: Array.from({ length: i + 1 }, () => ({})) }));
    const raisers = [{ icon: 'dino/stompy?pose=happy&view=front', t: 'Dinos' }, { icon: 'item/egg?dino=spike', t: 'New kinds' }, { icon: 'piece/fountain', t: 'Features' }, { icon: 'item/visitor?mood=happy&i=2', t: 'Happy visitors' }];
    const u = D.unlock; const unlockIcon = u.kind === 'dino' ? 'dino/' + u.id + '?pose=happy' : u.kind === 'piece' ? 'piece/' + u.id : u.icon;
    const unlockName = u.kind === 'dino' ? DINO[u.id].name + ' the ' + DINO[u.id].species : u.name;
    const unlockLine = u.kind === 'dino' ? DINO[u.id].line.split('.')[0] + '.' : u.line;
    // play hud
    const inPlay = s.screen === 'play'; const st = s.introStep;
    const lab = k => (st === k ? 1 : 0);
    const R = this.ratingOf(s); const starsNow = s.tiers.filter(t => R.total >= t).length; const t3 = s.tiers[2] || 1;
    const eggNext = this.nextEgg(s, dn); const eggNew = !s.parkDinos.includes(eggNext);
    const trayIds = TRAY.filter(([id, from]) => from <= dn).map(([id]) => id).concat(Object.keys(TREAT_TILES).filter(k => isOn(me0, k)).map(k => TREAT_TILES[k]).filter(id => !s.treatUsed[id]));
    const tsz = trayIds.length >= 11 ? 60 : trayIds.length >= 10 ? 64 : 70;  // ARCADE: shrink a long tray (treat tiles)
    const tray = trayIds.map((id, i) => { const price = id === 'egg' ? this.eggPrice(s) : PRICES[id]; const can = s.coins >= price; const sel = s.selected === id;
      return { sz: tsz, isz: Math.round(tsz * .74), icon: id === 'egg' ? 'item/egg?dino=' + eggNext : id === 'balloons' ? 'item/balloons' : id === 'statue' ? 'dino/rexy?pose=roar&skin=gold&stand=%23cfc7b8' : 'piece/' + id, price: price || 'Free', pts: '+' + (id === 'egg' ? (eggNew ? 100 : 40) : FEAT[id]), isNew: id === 'egg' && eggNew, o: can ? 1 : .5, f: can ? 'none' : 'grayscale(.9)', ring: sel ? '#58B84F' : '#fff', shadow: sel ? '#2F7D3B' : '#E3CFA6', discBg: sel ? '#dff1d2' : '#fff',
        y: st >= 5 ? (sel ? -14 : 0) : 40, s: st >= 5 ? 1 : .4, delay: st === 5 ? i * 60 : 0, anim: s.shake === id ? 'dpShake .45s' : 'none', tap: () => this.tapTile(id) }; });
    const h = s.happy;
    const moodIcon = 'item/smiley?mood=' + (h >= .66 ? 'happy' : h >= .36 ? 'okay' : 'sad');
    const tip = inPlay ? this.tipFor(s, dn) : { icon: 'item/star', text: '', pts: '', hasPts: false, tap: () => {}, ring: '#fff' };
    const watch = (inPlay ? s.needs : []).map(n => { const v = Math.max(n.hunger, n.fun); const out = n.escaped; const col = out || v >= .82 ? '#FF6B5B' : v >= .55 ? '#FFC93C' : '#58B84F';
      return { icon: 'dino/' + n.id + '?pose=happy&view=front', deg: out ? 360 : Math.round(v * 360), col, bg: out ? '#ffd9d4' : '#fff', anim: out || v >= .82 ? 'dpWiggle .5s infinite' : 'none', out, showNeed: !out && !!n.need, needKind: n.need === 'fun' ? 'item/ball' : 'food/' + ((DINO[n.id] && DINO[n.id].eats) || 'leaf'), sel: s.watchSel === n.id, name: DINO[n.id] ? DINO[n.id].name : n.id, species: DINO[n.id] ? DINO[n.id].species : '',
        tap: () => { this.w('focusDino', n.id); clearTimeout(this._wsT); this.setState({ watchSel: n.id }); this._wsT = setTimeout(() => this.setState({ watchSel: null }), 2600); } }; });
    const esc = s.escapee; const escPips = esc && esc.taps > 1 && !s.bannerBig ? Array.from({ length: esc.taps }, (_, i) => ({ bg: i < esc.left ? '#FFC93C' : 'rgba(255,255,255,.3)' })) : [];
    // hatch
    const hc = s.hatchCard; const hd = hc ? DINO[hc.id] : null;
    // result
    const r = s.result; const k = s.resultK;
    const res = r ? { day: r.day, parts: r.parts, starSlots: r.starSlots, newBest: r.newBest, coins: r.coins, xp: r.xp, lvUp: !!r.lvUp, level: r.level, roar: r.stars === 3, park: PARKS[DAYS[r.day - 1].park].name, tint: PARKS[DAYS[r.day - 1].park].tint, ink: PARKS[DAYS[r.day - 1].park].ink } : { parts: [], starSlots: [] };
    // book
    const reach = cur;
    const bookList = DINO_ORDER.map(id => { const o = DINO[id]; const open = o.day <= reach; const sel = s.bookSel === id;
      return { name: open ? o.name : '???', sub: open ? o.species : 'Meet on Day ' + o.day, icon: 'dino/' + id + '?pose=happy' + (open ? '' : '&sil=1'), bg: open ? o.tint : '#EFE6D4', ring: sel ? '#58B84F' : '#fff', lift: sel ? -6 : 0, tap: () => this.setState({ bookSel: id, bookView: 0 }) }; });
    const bo = DINO[s.bookSel]; const bOpen = bo.day <= reach; const views = ['q', 'front', 'side']; const poses = ['happy', 'idle', 'idle'];
    const bk = { open: bOpen, name: bOpen ? bo.name : '???', species: bOpen ? bo.species : 'Secret dino', line: bOpen ? bo.line : 'Keep playing to meet this dino. It hatches on Day ' + bo.day + '!', tint: bOpen ? bo.tint : '#EFE6D4',
      bigIcon: 'dino/' + s.bookSel + '?size=512&pose=' + poses[s.bookView] + '&view=' + views[s.bookView] + (bOpen ? '' : '&sil=1'), eatsIcon: bOpen ? 'food/' + bo.eats : 'item/lock', eats: bOpen ? bo.eatsL : '???', penIcon: bOpen ? bo.penIcon : 'item/lock', pen: bOpen ? bo.pen : '???',
      sneak: [1, 2, 3, 4, 5].map(i => ({ bg: bOpen && i <= bo.sneak ? '#FF6B5B' : '#EAD7B0', ring: bOpen && i <= bo.sneak ? '#C9433A' : '#D9C6A0' })), taps: bOpen ? Array.from({ length: bo.taps }, () => ({})) : [], tapsText: bOpen ? (bo.taps === 1 ? '1 tap' : bo.taps + ' taps') : '???', likes: bOpen ? bo.likes : 'A silhouette means you haven\u2019t met this dino yet.' };
    // how
    const hp = s.howPage; const howCards = HOW.slice(hp * 4, hp * 4 + 4).map((c, i) => Object.assign({}, c, { n: hp * 4 + i + 1, delay: i * 70, pics: c.pics.map(p => Object.assign({}, p, { y: p.y + 24 })), taps: c.taps.map(p => Object.assign({}, p, { y: p.y + 24 })) }));
    // shop
    const curPen = 'pen-' + this.penStyle(me0);
    const shopRows = SHOP.map(row => Object.assign({}, row, { items: row.items.map(it => {
      const owned = me0.owned.includes(it.id), met = !it.dino || DINO[it.dino].day <= cur, can = me0.jar >= it.price && met;
      const on = row.id === 'pens' ? curPen === it.id : isOn(me0, it.id);
      const name = it.dino ? (met ? it.adj + ' ' + DINO[it.dino].name : '???') : it.name;
      return { name, perk: it.perk, icon: it.icon + (met ? '' : '&sil=1'), owned: owned && on, showCoin: !owned && it.price > 0 && met,
        chip: owned ? (row.id === 'pens' ? (on ? 'Using' : 'Use') : (on ? 'On' : 'Off')) : !met ? 'Day ' + DINO[it.dino].day : it.price === 0 ? 'Free' : fmt(it.price),
        chipBg: owned ? (on ? '#58B84F' : '#EFE3CC') : can ? '#FFF1C7' : '#EFE3CC', chipInk: owned ? (on ? '#fff' : '#7A6553') : can ? '#3B2F2A' : '#9A8B78',
        o: owned || can ? 1 : .6, f: 'none', anim: s.shopShake === it.id ? 'dpShake .45s' : 'none', buy: () => this.buy(it, row) }; }) }));
    const scr = s.screen;
    return {
      isHomeB: scr === 'home', isHow: scr === 'how', isMap: scr === 'map', isShop: scr === 'shop', isIntro: scr === 'intro',
      inPlay, isPaused: inPlay && s.paused, isResult: scr === 'result', isBook: scr === 'book',
      players, playersB: [players[0], { isPlay: true, isCard: false }, players[1]],
      easyBg: isEasy ? '#58B84F' : 'transparent', easyInk: isEasy ? '#fff' : '#7A6553', normalBg: isEasy ? 'transparent' : '#58B84F', normalInk: isEasy ? '#7A6553' : '#fff',
      setEasy: () => this.setProf(s.player, { diff: 'easy' }), setNormal: () => this.setProf(s.player, { diff: 'normal' }),
      goMap: () => this.go('map'), goHome: () => this.go('home'), goShop: () => this.go('shop'), goHow: () => this.go('how', { howPage: 0 }), goBook: () => this.go('book', { bookFrom: scr }), bookBack: () => this.go(s.bookFrom === 'map' ? 'map' : 'home'),
      me, regions, mp, stops,
      dayN: dn, dayTitle: D.title, dayPark: PARKS[D.park], introTiers, raisers, unlockIcon, unlockName, unlockLine, letsGo: () => this.startDay(dn),
      cardY: st >= 1 ? 0 : 160, watchX: st >= 2 ? 0 : -100, helpY: st >= 3 ? 0 : 160, pauseS: st >= 4 ? 1 : 0, trayY: st >= 5 ? 0 : 170,
      l1: lab(1), l2: lab(2), l3: lab(3), l4: lab(4), l5: lab(5), watch, tip,
      coins: s.coins, moodIcon, ratingText: fmt(R.total), ratingPct: Math.min(100, R.total / t3 * 100).toFixed(1), tierMarks: [s.tiers[0] / t3 * 100, s.tiers[1] / t3 * 100].map(v => ({ left: v.toFixed(1) })),
      starRow: [0, 1, 2].map(i => ({ fill: i < starsNow ? '#FFC93C' : '#EAD7B0', line: i < starsNow ? '#D9982A' : '#D9C6A0', anim: s.starPop === i + 1 ? 'dpPop .5s' : 'none' })), ratingAnim: 'none',
      canFinish: inPlay && starsNow >= 1 && st >= 6, finishDay: () => this.endDay(), finishAnim: starsNow === 3 ? 'dpPulse 1.6s infinite' : 'none', finishHi: starsNow === 3, finishStars: [0, 1, 2].map(i => i < starsNow),  /* ARCADE: gold, bigger and pointed at when you have 3 stars */ toastIcon: s.toastIcon,
      tray, pause: () => { this.setState({ paused: true }); this.w('setPaused', true); }, resume: () => { this.setState({ paused: false }); this.w('setPaused', false); }, restart: () => this.startDay(s.day),
      hasEscapee: inPlay && !!esc, alertText: esc ? (s.bannerBig ? 'Oh no! ' + esc.name + ' ' + esc.reason + '!' : 'Catch ' + esc.name + '!') : '', escName: esc ? esc.name : '', escIcon: esc ? 'dino/' + esc.id + '?pose=escaped' : 'dino/zippy', escPips,
      hasToast: inPlay && !!s.toast, toast: s.toast || '',
      hasHatch: inPlay && !!hc, hatchIcon: hc ? 'dino/' + hc.id + '?pose=happy' + (DAYS[dn - 1].park === 'snowy' ? '&woolly=1' : '') : 'dino/stompy', hatchName: hd ? hd.name : '', hatchSpecies: hd ? hd.species : '', hatchLine: hd ? hd.line.split('.')[0] + '.' : '', hatchTint: hd ? hd.tint : '#fff', closeHatch: () => this.closeHatch(),
      res, resCoins: r ? fmt(r.earned * k) : 0, resHappy: r ? Math.round(r.happy * k) : 0, resScore: r ? fmt(r.score * k) : 0, nextDay: () => { const n = Math.min(NDAYS, (r ? r.day : dn) + 1); const pk = DAYS[n - 1].park; if (!this.parkOpen(me0, pk)) this.go('map', { mapPark: pk }); else this.go('intro', { day: n }); },
      bookCount: DINO_ORDER.filter(id => DINO[id].day <= reach).length, bookList, bk, turnDino: () => this.setState(x => ({ bookView: (x.bookView + 1) % 3 })),
      howCards, howDot0: hp === 0 ? '#58B84F' : '#EAD7B0', howDot1: hp === 1 ? '#58B84F' : '#EAD7B0', howPrevO: hp === 0 ? .35 : 1, howNextLabel: hp === 0 ? 'Next' : 'Got it!',
      howPrev: () => this.setState({ howPage: 0 }), howNext: () => hp === 0 ? this.setState({ howPage: 1 }) : this.go('home'),
      shopRows, jarAnim: s.jarBump ? 'dpPop .4s' : 'none',
    };
  }
}

// ---------------------------------------------------------------- boot
const stage = document.getElementById('stage');
function fit() {
  const sc = Math.min(innerWidth / 1333, innerHeight / 690);
  const x = (innerWidth - 1333 * sc) / 2, y = (innerHeight - 690 * sc) / 2;
  stage.style.transform = `translate(${x}px,${y}px) scale(${sc})`;
}
fit(); addEventListener('resize', fit);
Store.ready(() => {
  const go = () => { const g = new Game(document.getElementById('ui')); window.DP = g; g.mount(); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
});
document.getElementById('backBtn').addEventListener('click', () => { try { Store.flush(); } catch (e) {} });
