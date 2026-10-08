// Portal Lab: the game shell (home, players, chambers, briefing, HUD, pause, results, group done).
// Ported from the Claude Design component (research/Blink Lab tablet design/Blink Lab 3D v3.dc.html):
// the logic below is the design's, running on the small Screens base instead of the design's React
// runtime (support.js). The markup is js/bl-view.js, generated from the design by tools/dc-to-view.mjs.
// The engine (game/*.js) is the design's, unchanged.
import { view, css } from './bl-view.js';
import { createDom } from './bl-dom.js';

const REFS = ['mountRef', 'stickRef', 'knobRef', 'hurtRef', 'touchRef'];

// setState(patch | fn, cb) merges at once and re-renders once per microtask; callbacks run after it.
class Screens {
  mount(ui) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    this.dom = createDom(ui);
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
    // React refs -> ref callbacks for the DOM layer.
    for (const k of REFS) { const r = this[k]; v[k] = el => { r.current = el; }; }
    this.dom.render(view, v);
  }
}

export class App extends Screens {
  props = { quality: 'Auto', showStats: false, lookSpeed: 1, gyro: false }; // the design's editor props, at their defaults
  state = { screen: 'loading', level: 0, gun: 'both', aimOK: false, pads: '', toastMsg: '', stats: '', err: '', canGrab: false, holding: false, tab: 0, result: null, gdGi: 0, spotT: 3, portrait: false, conflict: false, v: 0 };
  mountRef = { current: null }; stickRef = { current: null }; knobRef = { current: null }; hurtRef = { current: null }; touchRef = { current: null };
  PLAYERS = [{ id: 'caleb', name: 'CALEB', ch: 'C', col: '#2BF0D6' }, { id: 'ezra', name: 'EZRA', ch: 'E', col: '#A58BFF' }];
  LEVELS = []; GROUPS = [];

  componentDidMount() {
    this.onTap = (e) => {
      this.gestured = true; if (!this.g) return;
      this.g.audio();
      const b = e.target && e.target.closest ? e.target.closest('button,a') : null;
      if (b && !b.closest('[data-confirm]') && e.type === 'pointerdown') this.g.play('uiTap');
    };
    document.addEventListener('pointerdown', this.onTap, true); document.addEventListener('keydown', this.onTap, true);
    this.onResize = () => { const p = window.innerHeight > window.innerWidth * 1.05; if (p !== this.state.portrait) this.setState({ portrait: p }); };
    window.addEventListener('resize', this.onResize); this.onResize();
    const q = new URLSearchParams(location.search), base = location.href;
    this.unlockAll = q.get('unlock') === '1'; this.want = q.get('level');
    const loadStore = () => new Promise((res) => {
      if (window.ArcadeStore) return res();
      const s = document.createElement('script'); s.src = new URL('./game/arcade-store.js', base).href; s.onload = res; s.onerror = res; document.head.appendChild(s);
    }).then(() => new Promise((res) => {
      try { this.Store = window.ArcadeStore ? window.ArcadeStore('portal-lab') : null; } catch (e) { this.Store = null; }
      if (this.Store) { this.Store.ready(() => res()); setTimeout(res, 2500); } else res();
    }));
    Promise.all([
      import(new URL('./game/game.js', base).href),
      fetch(new URL('./game/levels.json', base).href).then((r) => r.json()),
      loadStore(),
    ]).then(([mod, data]) => {
      this.loadSave();
      let custom = [];
      try { custom = JSON.parse(localStorage.getItem('portallab.custom') || '[]'); } catch (e) {}
      const groups = data.groups.slice();
      // Editor test chambers only appear when the game is opened from the Level Editor's Playtest (?level=custom-…).
      if (custom.length && /^custom-/.test(this.want || '')) groups.push({ id: 'custom', name: 'Custom', custom: true, levels: custom });
      const levels = [];
      this.GROUPS = groups.map((g, gi) => { const start = levels.length; g.levels.forEach((l, k) => levels.push(Object.assign({}, l, { gi, gIdx: k, group: g.name }))); return { id: g.id, name: g.name, custom: !!g.custom, start, count: g.levels.length }; });
      this.LEVELS = levels;
      this.g = new mod.Game({
        refs: { mountRef: this.mountRef, stickRef: this.stickRef, knobRef: this.knobRef, hurtRef: this.hurtRef, touchRef: this.touchRef },
        levels, getProps: () => this.gameProps(), onState: (p) => this.onGame(p),
      });
      this.applyOpts();
      this.g.boot();
      window.__portalLab = this.g;
    }).catch((e) => this.setState({ err: 'COULD NOT LOAD THE GAME · ' + e.message }));
  }
  componentWillUnmount() { document.removeEventListener('pointerdown', this.onTap, true); document.removeEventListener('keydown', this.onTap, true); if (this.g && this.g.snd) this.g.snd.stop(); this.stopSpot(); clearTimeout(this.cfT); window.removeEventListener('resize', this.onResize); if (this.g) this.g.destroy(); }

  // ---- saves (ArcadeStore → IndexedDB, key calebArcadeData:portal-lab) ----
  loadSave() {
    let d = null; try { d = this.Store ? this.Store.get() : null; } catch (e) {}
    if (!d || typeof d !== 'object' || !d.players) d = { current: 'caleb', players: {} };
    for (const p of this.PLAYERS) { const r = d.players[p.id] || (d.players[p.id] = {}); r.cleared = r.cleared || {}; r.opts = Object.assign({ sound: 0.8, music: 0.6 }, r.opts || {}); }
    if (!d.players[d.current]) d.current = 'caleb';
    // Performance mode is a device setting, not a player one: move any old per-player flag up and drop it.
    if (typeof d.perf !== 'boolean') d.perf = false;
    for (const p of this.PLAYERS) { const o = d.players[p.id].opts; if ('perf' in o) delete o.perf; }
    this.data = d; this.gen = d.gen || 0; this.sid = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  persist() {
    if (!this.Store || this.noSave) return;
    if (this.Store.conflict && this.Store.conflict()) { this.setState({ conflict: true }); return; }
    this.gen += 1;
    const out = { current: this.data.current, players: this.data.players, perf: !!this.data.perf, gen: this.gen, sid: this.sid };
    this.Store.set(null, out, { guard: true });
    clearTimeout(this.cfT);
    this.cfT = setTimeout(() => { if (!this.noSave && this.Store.conflict && this.Store.conflict()) this.setState({ conflict: true }); }, 800);
  }
  pdata() { return this.data.players[this.data.current]; }
  opts() { return this.pdata().opts; }
  applyOpts() { if (!this.g || !this.data) return; const o = this.opts(); this.g.sfx = o.sound; this.g.musicVol = o.music ?? 0.6; if (this.g.snd) this.g.snd.setVolumes(this.g.sfx, this.g.musicVol); }
  gameProps() { const perf = this.data ? !!this.data.perf : false; return Object.assign({}, this.props, { quality: perf ? 'Low' : (this.props.quality ?? 'Auto'), showStats: this.props.showStats ?? false }); }

  // ---- progress ----
  cleared(i) { const l = this.LEVELS[i]; return !!(l && this.data && this.pdata().cleared[l.id]); }
  groupDone(gi) { const G = this.GROUPS[gi]; if (!G) return false; for (let i = G.start; i < G.start + G.count; i++) if (!this.cleared(i)) return false; return true; }
  groupUnlocked(gi) { const G = this.GROUPS[gi]; if (!G) return false; if (this.unlockAll || G.custom || gi === 0 || this.groupDone(gi - 1)) return true; for (let i = G.start; i < G.start + G.count; i++) if (this.cleared(i)) return true; return false; }
  unlocked(i) { const l = this.LEVELS[i]; if (!l) return false; if (!this.groupUnlocked(l.gi)) return false; if (this.unlockAll || this.GROUPS[l.gi].custom || l.gIdx === 0 || this.cleared(i) || this.cleared(i - 1)) return true; const G = this.GROUPS[l.gi]; for (let k = i + 1; k < G.start + G.count; k++) if (this.cleared(k)) return true; return false; }
  continueIdx() { for (let i = 0; i < this.LEVELS.length; i++) if (!this.GROUPS[this.LEVELS[i].gi].custom && this.unlocked(i) && !this.cleared(i)) return i; return 0; }
  recordClear(r) {
    const L = this.LEVELS[r.li], P = this.pdata(), prev = P.cleared[L.id], gi = L.gi, was = this.groupDone(gi);
    const best = prev ? Math.min(prev.t, r.time) : r.time, fewest = prev ? Math.min(prev.p, r.portals) : r.portals;
    P.cleared[L.id] = { t: best, p: fewest };
    this.persist();
    const now = this.groupDone(gi);
    return { screen: !was && now && !this.GROUPS[gi].custom ? 'groupdone' : 'cleared', gdGi: gi, result: { li: r.li, time: r.time, portals: r.portals, best, fewest, newBest: !!prev && r.time < prev.t, first: !prev, fewer: !!prev && r.portals < prev.p } };
  }

  // ---- engine → app ----
  onGame(p) {
    if (p.screen === 'home' && !this.booted) {
      this.booted = true;
      if (this.gestured) this.g.audio();
      const i = this.want ? this.LEVELS.findIndex((l) => l.id === this.want) : -1;
      if (i >= 0) { this.setState(p); this.brief(i); return; }
      this.g.loadLevel(this.continueIdx());
    }
    if (p.screen === 'cleared' && p.result) { this.setState(Object.assign({}, p, this.recordClear(p.result))); return; }
    if (p.screen === 'spotted') this.startSpot();
    if (this.state.screen === 'play' && !p.screen) {
      const rank = { none: 0, blue: 1, both: 2 };
      if (p.gunUp && p.gun && (rank[p.gun] || 0) > (rank[this.state.gun] || 0)) this.flashTag(p.gun === 'both' ? 'tagB' : 'tagA');
      if (p.boxSeen && !this.state.boxSeen && this.data && !(this.opts().seen || {}).grab) { const o = this.opts(); o.seen = Object.assign({}, o.seen, { grab: true }); this.persist(); this.flashTag('tagGrab'); }
    }
    this.setState(p);
  }

  // ---- navigation ----
  go(screen, extra) { if (this.g) this.g.setState(Object.assign({ screen }, extra || {})); }
  QUIPS = ['PLEASE KEEP ALL LIMBS INSIDE THE PORTAL AT ALL TIMES', 'THE BOX IS YOUR FRIEND. DO NOT TELL THE BOX', 'YOUR BACK IS SHOWING THROUGH THE OTHER PORTAL', 'SENTRIES ARE MOSTLY HARMLESS. MOSTLY', 'REMEMBER · WHAT GOES IN MUST COME OUT', 'NO TEST SUBJECTS WERE LOST TODAY. YET', 'THE FLOOR IS NOT LAVA. WE CHECKED', 'PORTALS DO NOT WORK ON SANDWICHES', 'THINKING WITH PORTALS SINCE BREAKFAST', 'IF IN DOUBT · LOOK UP', 'WHITE WALLS GOOD · GREY WALLS SAD', 'MOMENTUM IS FREE. USE PLENTY'];
  brief(i) { const g = this.g; if (!g || !g.T || !this.LEVELS[i]) return; let q; do { q = Math.floor(Math.random() * this.QUIPS.length); } while (this.QUIPS.length > 1 && q === this.quipI); this.quipI = q; this.stopSpot(); g.releaseMouse(); g.loadLevel(i); this.setState({ tab: this.LEVELS[i].gi }); this.go('briefing', { level: i }); }
  begin() { if (this.g) { this.g.audio(); this.g.play('uiConfirm'); this.g.begin(); } }
  restart() { const g = this.g; if (!g || !g.T) return; this.stopSpot(); g.loadLevel(g.li); g.begin(); }
  toHome() { const g = this.g; if (!g || !g.T) return; this.stopSpot(); g.releaseMouse(); g.loadLevel(this.continueIdx()); this.go('home'); }
  toChambers() { const g = this.g; if (!g || !g.T) return; this.stopSpot(); g.releaseMouse(); const l = this.LEVELS[g.li]; this.setState({ tab: l ? l.gi : 0 }); this.go('chambers'); }
  resume() { const g = this.g; if (!g) return; g.pause(false); g.lockMouse(); }
  next() { const r = this.state.result, i = r ? r.li + 1 : -1; if (i > 0 && i < this.LEVELS.length && this.LEVELS[i].gi === this.LEVELS[r.li].gi && this.unlocked(i)) this.brief(i); else if (i > 0 && i < this.LEVELS.length && this.unlocked(i)) this.brief(i); else this.toChambers(); }
  setPlayer(id) { if (!this.data || this.data.current === id) return; this.data.current = id; this.persist(); this.applyOpts(); this.setState({ v: this.state.v + 1 }); }
  setSound(v) { this.opts().sound = Math.max(0, Math.min(1, v)); this.applyOpts(); this.persist(); this.setState({ v: this.state.v + 1 }); if (this.g) { this.g.audio(); this.g.play('uiTap'); } }
  setMusic(v) { this.opts().music = Math.max(0, Math.min(1, v)); this.applyOpts(); this.persist(); this.setState({ v: this.state.v + 1 }); if (this.g) this.g.audio(); }
  startSpot() { this.stopSpot(); const end = performance.now() + 3000; let last = 4; this.spotI = setInterval(() => { const t = Math.max(0, (end - performance.now()) / 1000); const sec = Math.ceil(t); if (sec < last && sec > 0) { last = sec; if (this.g) this.g.play('gotYouTick'); } this.setState({ spotT: t }); if (t <= 0) this.restart(); }, 100); this.setState({ spotT: 3 }); }
  flashTag(k) { clearTimeout(this.tagT); this.setState({ tagA: false, tagB: false, tagGrab: false, [k]: true }); this.tagT = setTimeout(() => this.setState({ [k]: false }), 4000); }
  stopSpot() { if (this.spotI) clearInterval(this.spotI); this.spotI = null; }

  renderVals() {
    const s = this.state, g = this.g, LV = this.LEVELS, GR = this.GROUPS, ready = !!(this.data && LV.length);
    const scr = s.screen, L = LV[s.level] || {}, gun = s.gun || 'both';
    const hasA = gun !== 'none', hasB = gun === 'both';
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmt = (t) => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + pad2(Math.floor(t % 60)); };
    const hatch = (c) => 'repeating-linear-gradient(45deg,' + c + ' 0 2px,transparent 2px 8px),rgba(6,18,21,0.92)';
    const P = ready ? this.pdata() : { cleared: {}, opts: { sound: 0.8, music: 0.6 } };
    const real = LV.filter((l) => GR[l.gi] && !GR[l.gi].custom);
    const total = real.length, countFor = (pd) => real.filter((l) => pd.cleared[l.id]).length;
    const clearedCount = ready ? countFor(P) : 0;
    const pl = this.PLAYERS.find((x) => ready && x.id === this.data.current) || this.PLAYERS[0];
    const players = this.PLAYERS.map((x) => {
      const d = ready ? this.data.players[x.id] : { cleared: {} }, c = ready ? countFor(d) : 0, on = ready && this.data.current === x.id;
      const f = c ? Math.max(1, Math.round(10 * c / Math.max(1, total))) : 0;
      return { name: x.name, ch: x.ch, col: x.col, on, ring: on ? '#2BF0D6' : '#17444A', fill: on ? 'rgba(15,42,47,0.96)' : 'rgba(6,18,21,0.92)', nameInk: on ? '#D7F4F1' : '#B4D9D5', glow: on ? 'drop-shadow(0 0 12px rgba(43,240,214,0.3))' : 'none', segs: Array.from({ length: 10 }, (_, i) => ({ bg: i < f ? x.col : '#0B3B3A' })), countText: c + ' / ' + total + ' CLEARED', pick: () => this.setPlayer(x.id) };
    });
    const ci = ready ? this.continueIdx() : 0, CL = LV[ci] || {}, everyDone = ready && total > 0 && clearedCount === total;
    const tabG = GR[s.tab] || { name: '', count: 0, start: 0 };
    const tabs = GR.map((G, gi) => {
      const lock = ready && !this.groupUnlocked(gi), on = s.tab === gi;
      let done = 0; for (let i = G.start; i < G.start + G.count; i++) if (this.cleared(i)) done++;
      return { code: pad2(gi + 1), name: G.name.toUpperCase(), count: lock ? 'LOCKED' : done + '/' + G.count, lock, notLock: !lock, ring: on ? '#2BF0D6' : '#17444A', fill: on ? '#2BF0D6' : lock ? hatch('rgba(43,240,214,0.16)') : 'rgba(6,18,21,0.92)', ink: on ? '#02080A' : lock ? '#4FB3AE' : '#D7F4F1', sub: on ? '#02080A' : '#2BF0D6', pick: () => this.setState({ tab: gi }) };
    });
    let tabDone = 0; for (let i = tabG.start; i < tabG.start + tabG.count; i++) if (this.cleared(i)) tabDone++;
    const tabLocked = ready && GR[s.tab] && !this.groupUnlocked(s.tab);
    const cards = [];
    for (let i = tabG.start; i < tabG.start + tabG.count; i++) {
      const l = LV[i]; if (!l) continue;
      const done = this.cleared(i), open = ready && this.unlocked(i), lock = !open, nxt = open && !done && i === ci;
      const rec = P.cleared[l.id], lg = l.gun || 'both';
      const prevName = l.gIdx === 0 && l.gi > 0 ? GR[l.gi - 1].name : '';
      cards.push({ code: l.code || l.id, num: (l.code || '').split('-').pop() || pad2(l.gIdx + 1), name: lock ? 'Locked' : l.name, isDone: done, isNext: nxt, isLock: lock, showPlay: open && !done,
        ring: nxt ? '#2BF0D6' : '#17444A', fill: lock ? hatch('rgba(43,240,214,0.08)') : nxt ? 'rgba(15,42,47,0.97)' : 'rgba(6,18,21,0.96)', glow: nxt ? 'drop-shadow(0 0 14px rgba(43,240,214,0.35))' : 'none', cursor: lock ? 'default' : 'pointer',
        codeInk: lock ? '#4FB3AE' : '#2BF0D6', nameInk: lock ? '#4FB3AE' : '#D7F4F1', bigInk: nxt ? 'rgba(43,240,214,0.16)' : 'rgba(43,240,214,0.07)',
        lockText: prevName ? 'Finish ' + prevName + ' to open.' : 'Clear ' + (LV[i - 1] ? LV[i - 1].code : 'the last one') + ' to open.',
        showGun: !lock && lg !== 'none', noGun: !lock && lg === 'none',
        pinkRing: lg === 'both' ? '#FF4FC8' : 'rgba(255,79,200,0.53)', pinkFill: lg === 'both' ? 'linear-gradient(#FF4FC855,#FF4FC855),#061215' : 'repeating-linear-gradient(45deg,rgba(255,79,200,0.4) 0 2px,#061215 2px 6px)',
        best: rec ? 'BEST ' + fmt(rec.t) : '', go: () => { if (open) this.brief(i); } });
    }
    const G = GR[L.gi];
    const r = s.result, nextI = r ? r.li + 1 : -1, hasNext = !!(r && nextI < LV.length && this.unlocked(nextI)), NL = hasNext ? LV[nextI] : null;
    const gd = GR[s.gdGi] || { name: '', count: 0 }, ng = GR[s.gdGi + 1] && !GR[s.gdGi + 1].custom ? GR[s.gdGi + 1] : null;
    const sound = P.opts.sound, music = P.opts.music ?? 0.6, perf = ready && !!this.data.perf;
    const up = (t) => String(t || '').toUpperCase();
    return {
      mountRef: this.mountRef, stickRef: this.stickRef, knobRef: this.knobRef, hurtRef: this.hurtRef, touchRef: this.touchRef,
      tDown: (e) => g && g.tDown(e), tMove: (e) => g && g.tMove(e), tUp: (e) => g && g.tUp(e),
      isLoading: scr === 'loading', loadingText: s.err || 'LOADING PORTAL LAB…', showGames: scr !== 'loading',
      isPlay: scr === 'play', isHome: scr === 'home', isChambers: scr === 'chambers', isBrief: scr === 'briefing', isPaused: scr === 'paused',
      isSpotted: scr === 'spotted', isCleared: scr === 'cleared', isGroupDone: scr === 'groupdone',
      showConflict: !!s.conflict && !this.noSave, isPortrait: !!s.portrait,
      playerName: pl.name, playerNameCap: pl.name.charAt(0) + pl.name.slice(1).toLowerCase(), players,
      cont: () => { if (!ready) return; this.brief(ci); }, contSub: everyDone ? 'ALL CLEARED · PLAY AGAIN' : (CL.code || '') + ' · ' + up(CL.name),
      clearedText: clearedCount + ' / ' + total + ' CLEARED',
      toHome: () => this.toHome(), toChambers: () => this.toChambers(),
      isCustomTab: !!(GR[s.tab] && GR[s.tab].custom), clearCustom: () => { try { localStorage.removeItem('portallab.custom'); } catch (e) {} location.reload(); },
      tabs, cards, tabCode: pad2(s.tab + 1), tabNote: tabLocked ? 'Finish ' + (GR[s.tab - 1] ? GR[s.tab - 1].name : 'the last group') + ' to unlock.' : up(tabG.name) + ' · ' + tabDone + ' of ' + tabG.count + ' cleared',
      levelCode: L.code || '', levelName: L.name || '', levelNameUp: up(L.name), hint: L.hint || '',
      briefKicker: G ? up(G.name) + ' // ' + pad2(L.gIdx + 1) + ' OF ' + pad2(G.count) : '',
      briefHasGun: gun !== 'none', briefGun: gun === 'none' ? 'NO GUN YET' : gun === 'blue' ? 'BLUE ONLY' : 'BLUE + PINK',
      briefPinkRing: hasB ? '#FF4FC8' : 'rgba(255,79,200,0.53)', briefPinkFill: hasB ? 'linear-gradient(#FF4FC855,#FF4FC855),#061215' : 'repeating-linear-gradient(45deg,rgba(255,79,200,0.4) 0 2px,#061215 2px 6px)',
      briefUpgrade: !!L.pedestal, briefUpgradeText: L.pedestalGun === 'both' ? 'PINK UPGRADE IN THIS CHAMBER' : 'PORTAL GUN IN THIS CHAMBER',
      briefPadsOn: !!(L.pads && L.pads.length), briefPads: (L.pads || []).length, briefSentryOn: !!(L.turrets && L.turrets.length), briefSentries: (L.turrets || []).length,
      begin: () => this.begin(), quip: this.QUIPS[this.quipI || 0],
      hasPads: !!s.pads, pads: s.pads,
      aVis: hasA ? 1 : 0, bVis: hasB ? 1 : 0, showA: hasA, showB: hasB, showGrab: !!s.boxSeen,
      tagA: !!s.tagA && scr === 'play', tagB: !!s.tagB && scr === 'play', tagGrab: !!s.tagGrab && scr === 'play',
      aFill: s.aimOK ? '#02080A' : 'none', aInk: s.aimOK ? '#3B8CFF' : 'none', bInk: s.aimOK ? '#FF4FC8' : 'none',
      aRing: hasA ? '#3B8CFF' : 'rgba(59,140,255,0.45)',
      aHexFill: hasA ? 'linear-gradient(rgba(59,140,255,0.22),rgba(59,140,255,0.22)),#061215' : 'repeating-linear-gradient(45deg,rgba(59,140,255,0.35) 0 2px,rgba(6,18,21,0.9) 2px 8px)',
      grabRing: s.canGrab ? '#FFB23F' : 'rgba(43,240,214,0.45)',
      grabDown: (e) => { e.preventDefault(); if (!g) return; g.audio(); g.toggleGrab(); },
      fireA: (e) => { e.preventDefault(); if (!g) return; g.audio(); g.fireAt(0, 0, 'a'); },
      fireB: (e) => { e.preventDefault(); if (!g) return; g.audio(); g.fireAt(0, 0, 'b'); },
      jumpDown: (e) => { e.preventDefault(); if (!g) return; g.audio(); g.jumpQ = 0.15; },
      restart: () => this.restart(), pauseOn: () => g && g.pause(true), resume: () => this.resume(),
      pauseTime: fmt(g ? g.elapsed : 0),
      soundIcon: sound <= 0 ? 'volume_off' : sound < 0.5 ? 'volume_down' : 'volume_up', soundVal: String(Math.round(sound * 100)),
      soundSegs: Array.from({ length: 10 }, (_, i) => ({ bg: i < Math.round(sound * 10) ? '#2BF0D6' : '#0B3B3A', h: i < Math.round(sound * 10) ? '18px' : '14px', set: () => this.setSound((i + 1) / 10) })),
      musicIcon: music <= 0 ? 'music_off' : 'music_note', musicVal: String(Math.round(music * 100)),
      musicSegs: Array.from({ length: 10 }, (_, i) => ({ bg: i < Math.round(music * 10) ? '#2BF0D6' : '#0B3B3A', h: i < Math.round(music * 10) ? '18px' : '14px', set: () => this.setMusic((i + 1) / 10) })),
      toggleMusicMute: () => { if (music > 0) { this.lastMusic = music; this.setMusic(0); } else this.setMusic(this.lastMusic || 0.6); },
      toggleMute: () => { if (sound > 0) { this.lastSound = sound; this.setSound(0); } else this.setSound(this.lastSound || 0.8); },
      perfOn: perf, perfOff: !perf, togglePerf: () => { if (this.perfLong) { this.perfLong = false; return; }  this.data.perf = !perf; this.persist(); this.setState({ v: s.v + 1 }); },
      spotNum: String(Math.ceil(s.spotT || 0)), spotDash: String((364.4 * Math.max(0, s.spotT || 0) / 3).toFixed(1)),
      resTime: r ? fmt(r.time) : '', resPortals: r ? String(r.portals) : '',
      resBest: !r ? '' : r.first ? 'FIRST CLEAR' : r.newBest ? 'NEW BEST!' : 'BEST ' + fmt(r.best),
      resFewest: !r ? '' : r.first ? 'FIRST CLEAR' : r.fewer ? 'NEW FEWEST!' : 'FEWEST ' + r.fewest,
      nextLabel: hasNext ? 'NEXT CHAMBER' : 'CHAMBERS', nextSub: NL ? (NL.code || '') + ' · ' + up(NL.name) : 'PICK ANOTHER CHAMBER',
      next: () => this.next(), replay: () => r && this.brief(r.li),
      gdKicker: 'GROUP ' + pad2(s.gdGi + 1) + ' // ' + gd.count + ' OF ' + gd.count, gdName: up(gd.name),
      gdSegs: Array.from({ length: gd.count }, () => ({ w: gd.count > 12 ? '18px' : '56px' })),
      hasNextGroup: !!ng, allDone: !ng, ngTitle: ng ? pad2(s.gdGi + 2) + ' · ' + up(ng.name) : '', ngNote: ng ? ng.count + ' new chambers to clear.' : '', ngStart: ng ? 'START ' + up(ng.name) : '',
      startNextGroup: () => ng && this.brief(ng.start),
      reloadTab: () => location.reload(), keepNoSave: () => { this.noSave = true; this.setState({ conflict: false }); },
      showStats: (this.props.showStats ?? false) && scr === 'play' && !s.showPerf, stats: s.stats,
      showPerf: !!s.showPerf && scr !== 'loading',
      perfFps: s.perfInfo ? String(s.perfInfo.fps) : '–', perfInk: !s.perfInfo ? '#D7F4F1' : s.perfInfo.fps >= 55 ? '#A6FF4D' : s.perfInfo.fps >= 40 ? '#FFB23F' : '#FF3B5C',
      perfMode: s.perfInfo ? s.perfInfo.mode : '', perfMs: s.perfInfo ? s.perfInfo.ms : '–', perfDraws: s.perfInfo ? String(s.perfInfo.draws) : '–', perfPasses: s.perfInfo ? String(s.perfInfo.passes) : '–',
      perfRes: s.perfInfo ? s.perfInfo.res : '–', perfScale: s.perfInfo ? s.perfInfo.scale : '', perfTex: s.perfInfo ? String(s.perfInfo.tex) : '',
      perfHoldStart: () => { clearTimeout(this.perfT); this.perfLong = false; this.perfT = setTimeout(() => { this.perfLong = true; if (g) { g.showPerf = !g.showPerf; g.setState({ showPerf: g.showPerf }); g.play('uiConfirm', 0.5); } }, 600); },
      perfHoldEnd: () => clearTimeout(this.perfT),
      hasToast: !!s.toastMsg, toastMsg: s.toastMsg,
      showLockHint: scr === 'play' && !!s.mouseUser && !s.locked,
      lockHint: s.lockFailed ? 'CURSOR LOCK BLOCKED · CLICK-DRAG TO LOOK' : 'CLICK TO LOCK MOUSE · ESC PAUSES',
      lockEdge: s.lockFailed ? '#FFB23F' : '#17444A', lockInk: s.lockFailed ? '#FFB23F' : '#B4D9D5', lockIcon: s.lockFailed ? 'pan_tool_alt' : 'mouse',
    };
  }
}
