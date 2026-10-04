// Ember Bay: the game shell — home + crew, story, tutorial, town HUD + minimap, tasks, map,
// task intro, pause/settings, well done / badge / try again / all done, debug (D).
// Ported from the Claude Design component (research/…/Ember Bay.dc.html): the logic below is the
// design's, running on the small Screens base instead of the design's React runtime. The markup
// is js/eb-view.js (generated from the design by tools/dc-to-view.mjs).
import * as gen from './city-gen-v3.js';
import { createCity3D } from './city-3d-v2.js';
import * as mg from './minigames.js';
import { META } from './minigames-meta.js';
import { sfx, setVolume, setMusicVolume } from './sfx.js';
import { music } from './theme-music.js';
import { createCrew } from './home-crew.js';
import { view } from './eb-view.js';
import { createDom } from './eb-dom.js';

// setState(patch | fn, cb) merges at once and re-renders once per microtask; callbacks run after it.
class Screens {
  mount(ui, stage, city, mgHost) {
    this.dom = createDom(ui); this.stageEl = stage; this.mgHostEl = mgHost;
    this.cityRef(city); this.mgRef(mgHost);
    this._q = []; this._render(); this.componentDidMount();
  }
  setState(p, cb) {
    const patch = typeof p === 'function' ? p(this.state) : p;
    if (patch) this.state = { ...this.state, ...patch };
    if (cb) this._q.push(cb);
    if (!this._pending) { this._pending = true; queueMicrotask(() => this._flush()); }
  }
  _flush() { this._pending = false; this._render(); const q = this._q; this._q = []; q.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  _render() {
    const v = this.renderVals();
    this.stageEl.style.transform = v.stageTf;
    this.mgHostEl.style.display = v.mgDisplay;
    this.dom.render(view, v);
    if (this.liveSync) this.liveSync();
  }
}

export class EmberBay extends Screens {
  KEY = 'emberbay';
  SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  blank = () => ({ lv: {}, seenStory: false, target: null });
  S = sfx;
  // Engine / water / fire loops only sound while you're actually driving or playing (not paused, not on a menu).
  liveSync() { const s = this.state, on = !s.paused && !s.debug && ['town', 'game', 'intro'].includes(s.screen); if (on !== this._live) { this._live = on; sfx.live(on); if (!on) sfx.horn(false); } }
  state = { screen: 'home', ready: false, stored: false, k: 1, lv: {}, crew: 0, seenStory: false, players: [this.blank(), this.blank()], set: { vol: 20, mus: 80, steerRight: false, far: true, fast: false },
      paused: false, pauseFrom: null, held: {}, siren: false, target: null, nav: null, near: null, story: 0, tut: 0, cur: null, res: null, mapSel: null, debug: false, resetting: false, goReady: false, ver: 0 };
  cityRef = el => { this.cityEl = el; };
  mgRef = el => { this.mgEl = el; };
  miniRef = el => { this.mini = el; };
  cv0 = el => { this.crewCv0 = el; };
  cv1 = el => { this.crewCv1 = el; };
  chiefRef = el => { this.chiefCv = el; };
  mapImgRef = el => { if (el && this.map && el.getAttribute('src') !== this.map.url) el.src = this.map.url; };

  componentDidMount() {
    this.theme = music('audio/ember-bay-theme.webm'); // plays through the sfx master, so the sound slider sets its level too
    this.fit = () => this.setState({ k: Math.min(innerWidth / 1333, innerHeight / 690) });
    addEventListener('resize', this.fit); this.fit();
    this.onKey = e => this.key(e); addEventListener('keydown', this.onKey);
    this.boot();
    const loop = () => { this.raf = requestAnimationFrame(loop); try { this.tick(); } catch (e) { if (!this.tErr) { this.tErr = 1; console.error(e); } } };
    this.raf = requestAnimationFrame(loop);
  }
  componentWillUnmount() { this.theme && this.theme.dispose(); this.crewV && this.crewV.dispose(); this.chiefV && this.chiefV.dispose(); removeEventListener('resize', this.fit); removeEventListener('keydown', this.onKey); cancelAnimationFrame(this.raf); this.stopMg(); this.c3 && this.c3.dispose(); }

  async boot() {
    this.Store = window.ArcadeStore ? window.ArcadeStore(this.KEY) : null;
    if (this.Store) await new Promise(r => this.Store.ready(r));
    let d = this.Store && this.Store.get();
    if (!d) { try { const o = JSON.parse(localStorage.getItem('blaze-emberbay-save-v1')); if (o) { const p = [this.blank(), this.blank()]; p[o.crew || 0] = { lv: o.lv || {}, seenStory: !!o.seenStory, target: o.target || null }; d = { crew: o.crew || 0, set: o.set, players: p }; localStorage.removeItem('blaze-emberbay-save-v1'); } } catch (e) {} }
    d = d || {}; this.gen = d.gen || 0;
    const players = [0, 1].map(i => ({ ...this.blank(), ...((d.players || [])[i] || {}) })), crew = d.crew || 0;
    await new Promise(r => this.setState({ players, crew, ...players[crew], set: { ...this.state.set, ...(d.set || {}) }, stored: true }, r));
    setVolume(this.state.set.vol / 100); setMusicVolume(this.state.set.mus / 100);
    this.load();
    // Chief Ember's story portrait (Cowboy_Male, head and shoulders), loaded up front so it's ready on Play.
    this.chiefP = createCrew(() => [this.chiefCv], ['person_cowboy_male'], { bust: true }).then(v => { this.chiefV = v; v.setActive(this.state.screen === 'story'); }).catch(e => console.warn('chief', e));
    createCrew(() => [this.crewCv0, this.crewCv1]).then(cv => { this.crewV = cv; cv.setSel(this.state.crew); cv.setActive(this.state.screen === 'home'); }).catch(e => console.warn('crew', e));
  }
  async load() {
    try {
      Object.assign(this, { MG: mg, META });
      setVolume(this.state.set.vol / 100); setMusicVolume(this.state.set.mus / 100);
      const data = await gen.loadGenData(); this.city = gen.generate(1333, data); this.GAMES = gen.GAMES;
      while (!this.cityEl) await new Promise(r => setTimeout(r, 50));
      this.c3 = await createCity3D(this.cityEl, { hud: false });
      this.c3.build(this.city, gen); this.c3.view('overview'); this.c3.setChase(this.state.set.far ? 24 : 16); this.c3.setFast(this.state.set.fast);
      await new Promise(r => setTimeout(r, 600));
      this.map = this.c3.snapshotTop(this.city, 1400);
      this.mapImg = new Image(); this.mapImg.src = this.map.url;
      this.c3.setPaused(true); this.syncPins();
      this.setState({ ready: true });
    } catch (e) { console.error('Ember Bay load failed', e); }
  }
  me(s = this.state) { return { lv: s.lv, seenStory: s.seenStory, target: s.target }; }
  save(extra) {
    const s = { ...this.state, ...extra }; if (!this.Store && window.ArcadeStore) this.Store = window.ArcadeStore(this.KEY); if (!this.Store || !s.stored) return;
    if (this.Store.conflict && this.Store.conflict()) return;
    const players = s.players.slice(); players[s.crew] = this.me(s);
    this.gen = (this.gen || 0) + 1;
    this.Store.set(null, { gen: this.gen, sid: this.SID, crew: s.crew, set: s.set, players }, { guard: true });
  }
  // Story line i: the chief is idle while talking, with a quick cheer on each new line and a big one on "Let's roll!".
  chief(i) {
    Promise.resolve(this.chiefP).then(() => { const v = this.chiefV; if (!v) return; v.setActive(true); clearTimeout(this.chiefT); v.setSel(0); if (i < 2) this.chiefT = setTimeout(() => v.setSel(-1), 1200); });
  }
  pickCrew(i) { const S = this.state; if (i === S.crew) return; const players = S.players.slice(); players[S.crew] = this.me(); this.upd({ players, crew: i, ...players[i] }); this.crewV && this.crewV.setSel(i); setTimeout(() => this.syncPins()); }
  upd(patch) { this.setState(patch, () => this.save()); }

  // ---------- progress ----------
  ids() { return (this.GAMES || []).map(g => g.id); }
  lvOf(id, lv = this.state.lv) { return lv[id] || 0; }
  ev(id, k) { return this.city && this.city.events.find(e => e.gid === id && e.k === k); }
  doneCount(lv = this.state.lv) { return this.ids().reduce((a, id) => a + this.lvOf(id, lv), 0); }
  openEvents() { return this.ids().filter(id => this.lvOf(id) < 3).map(id => this.ev(id, this.lvOf(id))).filter(Boolean); }
  visibleEvents() { if (this.state.tut && this.doneCount() === 0) return [this.ev('hose', 0)].filter(Boolean); return this.openEvents(); }
  syncPins() {
    if (!this.c3 || !this.city) return;
    const vis = new Set(this.visibleEvents().map(e => e.call));
    this.c3.setPins(this.city.events.map(e => ({ call: e.call, visible: vis.has(e.call), dim: false })));
    const t = this.targetEv(); this.c3.setSel(t ? t.call : null);
  }
  targetEv() {
    const open = this.visibleEvents(); if (!open.length) return null;
    if (this.state.target) { const e = open.find(e => e.gid === this.state.target); if (e) return e; }
    const me = this.c3 && this.c3.engineCity(); if (!me) return open[0];
    return open.reduce((a, e) => Math.hypot(e.x - me.x, e.z - me.z) < Math.hypot(a.x - me.x, a.z - me.z) ? e : a);
  }

  // ---------- frame loop ----------
  tick() {
    if (this.state.screen !== 'town' || this.state.paused || !this.c3) return;
    const me = this.c3.engineCity(); if (!me) return;
    const t = this.targetEv();
    let nav = null;
    if (t) { const dx = t.x - me.x, dz = t.z - me.z, rel = Math.atan2(dx, dz) - me.h; nav = { gid: t.gid, rot: Math.round(-rel * 180 / Math.PI / 5) * 5, dist: Math.round(Math.hypot(dx, dz) / 10) * 10 }; }
    let near = null;
    for (const e of this.visibleEvents()) { const d = Math.hypot(e.x - me.x, e.z - me.z); if (d < 16 && (!near || d < near.d)) near = { gid: e.gid, k: e.k, d, call: e.call }; }
    if (this.leftCall) { const e = this.city.events.find(e => e.call === this.leftCall); if (!e || Math.hypot(e.x - me.x, e.z - me.z) > 22) this.leftCall = null; else if (near && near.call === this.leftCall) near = null; }
    if (near && Math.abs(me.v) > 4) near = null;
    const nk = near ? near.call : null, ok = this.state.near ? this.state.near.call : null;
    const navKey = nav ? nav.gid + nav.rot + '|' + nav.dist : '', oKey = this.state.nav ? this.state.nav.gid + this.state.nav.rot + '|' + this.state.nav.dist : '';
    if (nk && nk !== ok) this.S.reached(); // pulled into a task ring
    if (nk !== ok || navKey !== oKey) this.setState({ near, nav });
    // tutorial steps
    const tut = this.state.tut;
    if (tut === 1 && this.tut0 && Math.hypot(me.x - this.tut0.x, me.z - this.tut0.z) > 20) this.setState({ tut: 2 }, () => (this.tut0 = { ...me }));
    else if (tut === 2 && this.tut0 && Math.abs(me.h - this.tut0.h) > 0.7) this.setState({ tut: 3 });
    this.drawMini(me);
  }
  drawMini(me) {
    const cv = this.mini, M = this.map, img = this.mapImg; if (!cv || !M || !img || !img.complete) return;
    const g = cv.getContext('2d'), S = cv.width, k = S / 280, ip = img.width / (M.x1 - M.x0);
    g.fillStyle = '#8fc3de'; g.fillRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.rotate(me.h - Math.PI);
    g.save(); g.scale(k / ip, k / ip); g.drawImage(img, -(me.x - M.x0) * ip, -(me.z - M.z0) * ip); g.restore();
    const t = this.targetEv(), cr = Math.cos(me.h - Math.PI), sr = Math.sin(me.h - Math.PI);
    for (const e of this.visibleEvents()) {
      let x = (e.x - me.x) * k, y = (e.z - me.z) * k; const lim = S / 2 - 14 * k, m = Math.max(Math.abs(x * cr - y * sr), Math.abs(x * sr + y * cr));
      if (m > lim) { x *= lim / m; y *= lim / m; }
      const cat = this.CAT[(this.GAMES.find(q => q.id === e.gid) || {}).cat] || ['#fff'];
      const tg = t && t.call === e.call, sz = tg ? 26 : 16;
      g.fillStyle = tg ? '#e5e043' : cat[2]; g.strokeStyle = '#1c1d1f'; g.lineWidth = 4;
      g.beginPath(); g.rect(x - sz / 2, y - sz / 2, sz, sz); g.fill(); g.stroke();
    }
    g.restore();
    g.fillStyle = '#e5e043'; g.strokeStyle = '#1c1d1f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(S / 2, S / 2 - 18); g.lineTo(S / 2 + 13, S / 2 + 14); g.lineTo(S / 2, S / 2 + 6); g.lineTo(S / 2 - 13, S / 2 + 14); g.closePath(); g.fill(); g.stroke();
  }

  // ---------- screens ----------
  go(screen, extra = {}) {
    const wasTown = this.state.screen === 'town'; this.crewV && this.crewV.setActive(screen === 'home'); this.chiefV && this.chiefV.setActive(false);
    if (screen === 'town') { if (this.c3) { this.c3.setPaused(false); this.c3.view('drive'); } this.syncPins(); }
    else if (wasTown && this.c3) { this.c3.clearKeys(); this.c3.setPaused(true); if (this.state.siren) this.S.siren(false); }
    this.setState({ screen, held: {}, near: screen === 'town' ? this.state.near : null, siren: screen === 'town' ? this.state.siren : false, ...extra }, () => this.save());
  }
  stopMg() { clearTimeout(this.winT); this.winT = null; if (this.mg) { try { this.mg.stop(); } catch (e) {} this.mg = null; } }
  async openIntro(gid, k) {
    this.stopMg(); const tok = (this.mgTok = (this.mgTok || 0) + 1);
    const me = this.c3 && this.c3.engineCity(); const e = this.ev(gid, k); if (e && me && Math.hypot(e.x - me.x, e.z - me.z) < 30) this.leftCall = e.call;
    this.go('intro', { cur: { gid, k }, debug: false, paused: false, goReady: false });
    const ctx = { level: k, sfx: this.S, win: () => this.win(), fail: () => this.fail(), c3: this.c3, ev: e };
    let m;
    try { m = await this.MG.createMinigame(gid, this.mgEl, ctx); }
    catch (err) { console.error('minigame ' + gid + ' failed to load', err); if (tok === this.mgTok) this.go('town'); return; }
    if (tok !== this.mgTok) { m.stop(); return; }
    this.mg = m; this.setState({ goReady: true });
  }
  begin() { if (!this.mg) return; this.S.started(); this.mg.begin(); this.go('game'); }
  win() {
    if (this.state.screen !== 'game' || this.winT) return; // one win per run; ignored once you've left the game
    const { gid, k } = this.state.cur, before = this.doneCount(), lv = { ...this.state.lv, [gid]: Math.max(this.lvOf(gid), k + 1) };
    const after = this.doneCount(lv), rankUp = Math.floor(after / 11) > Math.floor(before / 11);
    const badge = lv[gid] === 3 && this.lvOf(gid) < 3;
    this.winT = setTimeout(() => {
      this.winT = null; if (this.state.screen !== 'game') return;
      this.stopMg();
      if (after === 66 && before < 66) { this.S.achievement(); this.go('done', { lv, res: { gid, k, rankUp }, tut: 0 }); }
      else if (badge) { this.S.achievement(); this.go('badge', { lv, res: { gid, k, rankUp }, tut: 0 }); }
      else { if (rankUp) this.S.achievement(); else this.S.reached(); this.go('win', { lv, res: { gid, k, rankUp }, tut: 0, target: after > before && lv[gid] < 3 ? gid : this.state.target }); }
    }, 700);
  }
  fail() { this.S.fail(); if (this.mg) this.mg.setPaused(true); this.go('fail', { res: { ...this.state.cur } }); }
  pauseOpen(from) { if (this.mg) this.mg.setPaused(true); if (this.c3) { this.c3.clearKeys(); this.c3.setPaused(true); } this.setState({ paused: true, pauseFrom: from, held: {} }); }
  resume() { const f = this.state.pauseFrom; this.setState({ paused: false, pauseFrom: null }); if (f === 'game' && this.mg) this.mg.setPaused(false); if (f === 'town' && this.c3) this.c3.setPaused(false); }
  toggleDebug(on = !this.state.debug) {
    const s = this.state, live = !s.paused && (s.screen === 'town' || s.screen === 'game');
    if (live) { if (this.mg) this.mg.setPaused(on); if (this.c3 && s.screen === 'town') { this.c3.clearKeys(); this.c3.setPaused(on); } }
    this.setState({ debug: on, held: {} });
  }
  key(e) {
    const s = this.state;
    if (e.code === 'KeyD') { this.toggleDebug(); return; }
    if (e.code === 'Escape') { if (s.debug) return this.toggleDebug(false); if (s.paused) return this.resume(); if (s.screen === 'town' || s.screen === 'game') return this.pauseOpen(s.screen); }
    if (s.screen === 'game' && !s.paused && e.code === 'KeyW') this.win();
    if (s.screen === 'game' && !s.paused && e.code === 'KeyF') this.fail();
  }
  press(k, on) {
    if (!this.c3) return;
    if (k === 'horn') this.S.horn(on); // truck horn while held, tapers off on release
    else this.c3.setKey(k, on);
    if (on && this.state.tut === 1 && !this.tut0) this.tut0 = this.c3.engineCity();
    this.setState(s => ({ held: { ...s.held, [k]: on } }));
  }

  renderVals() {
    const HV = 'oklch(0.9 0.17 100)', RED = 'oklch(0.6 0.21 27)', BLUE = 'oklch(0.62 0.13 235)';
    const CAT = this.CAT = { fire: [RED, '#fff', '#d8362d', 'local_fire_department', 'Fire'], rescue: [HV, '#1c1d1f', '#e5e043', 'support', 'Rescue'], water: [BLUE, '#fff', '#2f88c4', 'water', 'Water'], safety: ['#e4e2da', '#1c1d1f', '#f2f1ec', 'health_and_safety', 'Safety'], drive: ['#3b3c3f', '#f2f1ec', '#6b6d72', 'local_shipping', 'Drive'] };
    const S = this.state, M = this.META || {}, G = this.GAMES || [], lv = S.lv;
    const ROLES = ['Trainee Firefighter', 'Firefighter', 'Senior Firefighter', 'Crew Leader', 'Watch Leader', 'Station Chief', 'Chief of Ember Bay'];
    const done = this.city ? this.doneCount() : Object.values(lv).reduce((a, b) => a + b, 0), badges = Object.values(lv).filter(v => v >= 3).length, rank = Math.min(6, Math.floor(done / 11));
    const g = id => G.find(q => q.id === id) || { name: id, cat: 'safety', icon: 'help' };
    const catOf = id => CAT[g(id).cat] || CAT.safety;
    const place = (id, k) => { const e = this.ev(id, k); let l = e ? e.label : (M[id] ? M[id].spots[k][1] : ''); l = String(l || '').replace(/[\s_#-]*\d+$/, '').replace(/_/g, ' '); return l.charAt(0).toUpperCase() + l.slice(1); };
    const me = this.c3 && this.c3.engineCity();
    const distTo = (id, k, from) => { const e = this.ev(id, k), f = from || me; return e && f ? Math.round(Math.hypot(e.x - f.x, e.z - f.z) / 10) * 10 + ' m' : ''; };
    const pipsFor = (n, cur) => [0, 1, 2].map(i => i < n ? HV : i === cur ? '#f2f1ec' : '#48494c');
    const scr = S.screen;
    // HUD controls
    const ctl = {};
    for (const k of ['l', 'r', 'f', 'b', 'horn']) { const on = !!S.held[k]; ctl[k] = { bg: on ? HV : '#1c1d1f', fg: on ? '#1c1d1f' : '#f2f1ec', down: e => { e.preventDefault && e.preventDefault(); this.press(k, true); }, up: () => S.held[k] && this.press(k, false) }; }
    ctl.siren = { bg: S.siren ? HV : '#1c1d1f', fg: S.siren ? '#1c1d1f' : 'oklch(0.66 0.2 27)', down: () => { const v = !this.state.siren; this.S && this.S.siren(v); this.setState({ siren: v }); } };
    const nav = S.nav, tg = nav && g(nav.gid);
    const cur = S.cur || { gid: 'hose', k: 0 }, m = M[cur.gid] || { steps: [], gest: ['touch_app', ''], spots: [['place', ''], ['place', ''], ['place', '']] };
    const res = S.res || cur, rm = M[res.gid] || m;
    const TUT = [null, { title: 'Hold to go', text: 'Hold the ▲ button to drive. The one under it reverses.' }, { title: 'Tap to steer', text: 'Use ◀ and ▶ to turn the fire engine.' }, { title: 'Follow the arrow', text: 'The arrow at the top points to your first call. Stop in the glowing ring and tap Start.' }];
    const tasks = G.map(q => { const n = this.lvOf(q.id), full = n >= 3, c = catOf(q.id);
      return { name: q.name, icon: q.icon, catBg: c[0], catFg: c[1], bg: full ? HV : '#fff', edge: full ? '#1c1d1f' : (S.target === q.id ? '#1c1d1f' : '#fff'),
        place: full ? 'Badge earned' : 'Level ' + (n + 1) + ' · ' + place(q.id, n), placeIcon: full ? 'military_tech' : 'location_on',
        pips: [0, 1, 2].map(i => i < n ? { bg: HV, edge: '#1c1d1f' } : i === n ? { bg: '#1c1d1f', edge: '#1c1d1f' } : { bg: '#d6d4cc', edge: '#d6d4cc' }),
        pick: () => { if (full) return; this.upd({ target: q.id }); this.go('town'); } }; });
    // map
    const MP = this.map, fw = 1333 - 56 - 360 - 20 - 4, fh = 690 - 88 - 40 - 4;
    let mapW = fw, mapH = fh; if (MP) { const a = (MP.x1 - MP.x0) / (MP.z1 - MP.z0); if (fw / fh > a) mapW = fh * a; else mapH = fw / a; }
    const pct = (x, z) => MP ? { x: ((x - MP.x0) / (MP.x1 - MP.x0) * 100).toFixed(2) + '%', y: ((z - MP.z0) / (MP.z1 - MP.z0) * 100).toFixed(2) + '%' } : { x: '0%', y: '0%' };
    const tEv = this.city && this.targetEv(), selId = S.mapSel || (tEv && tEv.gid) || 'hose';
    const mapPins = this.city ? this.visibleEvents().map(e => { const c = catOf(e.gid), sel = e.gid === selId, p = pct(e.x, e.z);
      return { ...p, icon: g(e.gid).icon, s: sel ? '56px' : '38px', is: sel ? '32px' : '22px', bg: sel ? HV : c[0], fg: sel ? '#1c1d1f' : c[1], sh: sel ? '0 6px 0 #1c1d1f' : 'none', z: sel ? 3 : 2, pick: () => this.setState({ mapSel: e.gid }) }; }) : [];
    const selN = this.lvOf(selId), selC = catOf(selId);
    const inGame = S.pauseFrom === 'game', inTown = S.pauseFrom === 'town';
    const pauseBtns = [];
    if (inGame) pauseBtns.push({ icon: 'replay', label: 'Restart', go: () => { this.setState({ paused: false }); this.openIntro(cur.gid, cur.k); } }, { icon: 'schedule', label: 'Later', go: () => { this.setState({ paused: false }); this.stopMg(); this.go('town'); } });
    if (inGame || inTown) pauseBtns.push({ icon: 'checklist', label: 'Tasks', go: () => { this.setState({ paused: false }); this.stopMg(); this.go('tasks'); } }, { icon: 'home', label: 'Home', go: () => { this.setState({ paused: false }); this.stopMg(); this.go('home'); } });
    const setS = p => { const set = { ...this.state.set, ...p }; this.upd({ set }); if (this.c3) { this.c3.setChase(set.far ? 24 : 16); if ('fast' in p) this.c3.setFast(set.fast); } };
    const nextK = Math.min(2, res.k + 1);
    return {
      noMenu: e => e.preventDefault(),
      stageTf: `translate(-50%,-50%) scale(${S.k})`,
      cityRef: this.cityRef, chiefRef: this.chiefRef, mgRef: this.mgRef, miniRef: this.miniRef, mapImgRef: this.mapImgRef,
      mgDisplay: ['intro', 'game', 'fail'].includes(scr) ? 'block' : 'none',
      isHome: scr === 'home', isStory: scr === 'story', isTown: scr === 'town', isIntro: scr === 'intro', isGame: scr === 'game', isWin: scr === 'win', isBadge: scr === 'badge', isFail: scr === 'fail', isDone: scr === 'done', isTasks: scr === 'tasks', isMap: scr === 'map',
      paused: S.paused, debug: S.debug,
      done, donePct: (done / 66 * 100).toFixed(1) + '%', badges, open: 22 - badges,
      role: ROLES[rank], roleNext: rank >= 6 ? 'Top rank' : 'Next: ' + ROLES[rank + 1] + ' at ' + (rank + 1) * 11,
      crew: [['Caleb', '#d8362d'], ['Ezra', '#e5e043']].map(([name, helmet], i) => ({ name, helmet, cv: i ? this.cv1 : this.cv0, sel: S.crew === i, border: S.crew === i ? HV : 'transparent', count: (i === S.crew ? done : Object.values((S.players[i] || {}).lv || {}).reduce((a, b) => a + b, 0)) + ' / 66', pick: () => { this.S && this.S.started(); this.pickCrew(i); } })),
      playLabel: !S.ready ? 'Loading…' : done ? 'Continue' : 'Play', playIcon: S.ready ? 'play_arrow' : 'hourglass_top', playBg: S.ready ? HV : '#8b8c86',
      play: () => { if (!S.ready) return; this.S.unlock(); this.S.tap(); if (!S.seenStory) { this.c3.setPaused(false); this.c3.storyShot(0); this.S.radio(); this.chief(0); this.setState({ screen: 'story', story: 0 }); } else this.go('town'); },
      openSettings: () => { this.S && this.S.unlock(); this.setState({ paused: true, pauseFrom: 'home' }); },
      storyLine: ['Welcome to Ember Bay! The town needs a new firefighter. That’s you.', 'When someone needs help, a pin pops up. Drive there in your fire engine.', 'Each job has 3 levels. Finish all 3 to earn its badge. Ready? Let’s roll!'][S.story],
      storyDots: [0, 1, 2].map(i => ({ bg: i === S.story ? HV : '#48494c' })),
      nextStory: () => { this.S.tap(); if (S.story < 2) { this.c3.storyShot(S.story + 1, this.ev('hose', 0)); this.S.radio(); this.chief(S.story + 1); this.setState({ story: S.story + 1 }); } else { this.tut0 = null; this.c3.resetEngine(); this.go('town', { seenStory: true, tut: this.doneCount() ? 0 : 1 }); } },
      skipStory: () => { this.tut0 = null; this.c3.resetEngine(); this.go('town', { seenStory: true, tut: this.doneCount() ? 0 : 1 }); },
      pause: () => this.pauseOpen(scr),
      quitMg: () => { this.S && this.S.tap(); this.stopMg(); this.go('town'); },
      hasTarget: !!nav,
      tgt: nav ? { name: tg.name, icon: tg.icon, catBg: catOf(nav.gid)[0], catFg: catOf(nav.gid)[1], pips: pipsFor(this.lvOf(nav.gid), this.lvOf(nav.gid)), rot: `rotate(${nav.rot}deg)`, dist: nav.dist + ' m' } : { pips: [] },
      openTasks: () => { this.stopMg(); this.go('tasks'); }, openMap: () => this.go('map', { mapSel: null }),
      side: S.set.steerRight ? { sl: 'auto', sr: '28px', hl: '170px', hr: 'auto', pl: '28px', pr: 'auto' } : { sl: '28px', sr: 'auto', hl: 'auto', hr: '170px', pl: 'auto', pr: '28px' },
      ctl, tutGo: S.tut === 1 ? '5px dashed ' + HV : 'none',
      canStart: !!S.near, near: S.near ? { icon: g(S.near.gid).icon, name: g(S.near.gid).name, lvl: S.near.k + 1 } : {},
      startNear: () => { const n = this.state.near; if (n) { this.setState({ tut: 0 }); this.openIntro(n.gid, n.k); } },
      tutOn: scr === 'town' && S.tut > 0 && !S.paused, tut: S.tut ? { n: S.tut, ...TUT[S.tut] } : {}, skipTut: () => this.setState({ tut: 0 }, () => this.syncPins()),
      intro: { name: g(cur.gid).name, catBg: catOf(cur.gid)[0], catFg: catOf(cur.gid)[1], catIcon: catOf(cur.gid)[3], catLabel: catOf(cur.gid)[4], lvl: cur.k + 1, pips: pipsFor(this.lvOf(cur.gid), cur.k),
        place: place(cur.gid, cur.k), placeIcon: m.spots[cur.k] ? m.spots[cur.k][0] : 'location_on', steps: m.steps.map((s, i) => ({ n: i + 1, icon: s[0], label: s[1] })), goal: m.goal, gIcon: m.gest[0], gLabel: m.gest[1] },
      goLabel: S.goReady ? 'Go' : 'Loading', goBg: S.goReady ? HV : '#8b8c86',
      go: () => this.state.goReady && this.begin(),
      later: () => { this.stopMg(); this.go('town'); },
      retry: () => { const c = this.state.res || this.state.cur; this.openIntro(c.gid, c.k).then(() => this.state.goReady && this.begin()); },
      res: { name: g(res.gid).name, icon: g(res.gid).icon, lvl: res.k + 1, tip: (this.MG && this.MG.TIPS[res.gid]) || 'Have another go. You nearly had it!', rankUp: !!res.rankUp,
        track: [0, 1, 2].map(i => i < res.k ? { n: i + 1, icon: 'check_circle', place: place(res.gid, i), bg: '#2c2d30', fg: '#f2f1ec', border: 'solid transparent' } : i === res.k ? { n: i + 1, icon: 'check_circle', place: place(res.gid, i), bg: HV, fg: '#1c1d1f', border: 'solid transparent' } : { n: i + 1, icon: i === res.k + 1 ? 'lock_open' : 'lock', place: i === res.k + 1 ? 'Up next' : 'After that', bg: 'transparent', fg: '#b4b3ae', border: 'dashed #48494c' }),
        nextLvl: nextK + 1, nextPlace: place(res.gid, nextK), nextDist: distTo(res.gid, nextK, this.ev(res.gid, res.k)),
        places: [0, 1, 2].map(i => place(res.gid, i)) },
      replay: () => this.openIntro(res.gid, res.k),
      goNext: () => { this.S.started(); this.upd({ target: res.gid }); this.go('town'); },
      toTown: () => { this.stopMg(); this.go('town'); }, toHome: () => { this.stopMg(); this.go('home'); },
      badgeWall: G.map(q => q.icon),
      tasks,
      cats: Object.values(CAT).map(c => ({ bg: c[0], fg: c[1], icon: c[3], label: c[4] })),
      mapUrl: MP ? MP.url : '', hasMap: !!(MP && MP.url), mapW: mapW + 'px', mapH: mapH + 'px', mapPins,
      me: me ? { ...pct(me.x, me.z), rot: `${(Math.PI - me.h) * 180 / Math.PI}deg` } : { x: '50%', y: '50%', rot: '0deg' },
      sel: { name: g(selId).name, icon: g(selId).icon, tag: M[selId] ? M[selId].tag : '', catBg: selC[0], catFg: selC[1], lvl: Math.min(3, selN + 1), pips: pipsFor(selN, selN), place: selN >= 3 ? 'Badge earned' : place(selId, selN), dist: selN >= 3 ? '' : distTo(selId, selN) },
      setTargetSel: () => { this.S.started(); this.upd({ target: selId }); this.go('town'); },
      pauseTitle: S.pauseFrom === 'home' ? 'Settings' : 'Paused', resumeLabel: S.pauseFrom === 'home' ? 'Back' : 'Resume', resumeIcon: S.pauseFrom === 'home' ? 'arrow_back' : 'play_arrow',
      resume: () => this.resume(), pauseBtns,
      volVal: S.set.vol, setVol: e => { const v = +e.target.value; setVolume(v / 100); setS({ vol: v }); },
      musVal: S.set.mus, setMus: e => { const v = +e.target.value; setMusicVolume(v / 100); setS({ mus: v }); },
      steerL: () => setS({ steerRight: false }), steerR: () => setS({ steerRight: true }),
      steerLBg: S.set.steerRight ? 'transparent' : HV, steerLFg: S.set.steerRight ? '#f2f1ec' : '#1c1d1f', steerRBg: S.set.steerRight ? HV : 'transparent', steerRFg: S.set.steerRight ? '#1c1d1f' : '#f2f1ec',
      camClose: () => setS({ far: false }), camFar: () => setS({ far: true }),
      camCBg: S.set.far ? 'transparent' : HV, camCFg: S.set.far ? '#f2f1ec' : '#1c1d1f', camFBg: S.set.far ? HV : 'transparent', camFFg: S.set.far ? '#1c1d1f' : '#f2f1ec',
      togglePerf: () => setS({ fast: !this.state.set.fast }), perfBg: S.set.fast ? HV : 'transparent', perfIcon: S.set.fast ? 'check' : '',
      resetBg: S.resetting ? RED : 'transparent',
      resetDown: () => { this.setState({ resetting: true }); this.resetT = setTimeout(() => { this.upd({ lv: {}, target: null, seenStory: false, resetting: false }); this.syncPins(); this.S && this.S.bad(); }, 3000); },
      resetUp: () => { clearTimeout(this.resetT); if (this.state.resetting) this.setState({ resetting: false }); },
      dbgGames: G.map(q => ({ name: q.name, icon: q.icon, col: (this.MG && this.MG.BUILT.includes(q.id)) ? HV : '#6b6d72',
        lv: [0, 1, 2].map(k => ({ n: k + 1, bg: k < this.lvOf(q.id) ? HV : '#1c1d1f', fg: k < this.lvOf(q.id) ? '#1c1d1f' : '#f2f1ec', go: () => { if (!this.state.ready) return; this.setState({ debug: false, paused: false, pauseFrom: null }); this.openIntro(q.id, k); } })) })),
      dbgClose: () => this.toggleDebug(false),
      dbgAll: () => { const lv = {}; G.forEach(q => (lv[q.id] = 3)); lv.hose = 2; this.upd({ lv, seenStory: true }); this.syncPins(); },
      dbgReset: () => { this.upd({ lv: {}, target: null }); this.syncPins(); },
    };
  }
}
