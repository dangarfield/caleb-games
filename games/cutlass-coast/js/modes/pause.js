// pause.js — 1k: pause menu + settings (overlay; ctx.back() returns to the mode beneath).
import { STORY } from '../story.js';
let ctx = null, root = null, panel = 'settings';


export default {
  overlay: true,
  showBack: true,
  enter(c, params = {}) {
    ctx = c; panel = params.panel || 'settings';
    root = ctx.ui.mount('pause', null);
    render();
  },
  exit() { root = null; },
  update() {},
};

function render() {
  const { h } = ctx.ui;
  const hasCareer = !!ctx.state.career();
  const item = (id, label, onTap, extra = '') => h('button', { class: `pz-item ${extra} ${panel === id ? 'on' : ''}`, onTap }, label);
  root.replaceChildren(
    h('div', { class: 'pz-back blocker', onTap: () => ctx.back() }), // tap outside the menu = Resume
    h('div', { class: 'navy-frame pz-frame' },
      h('div', { class: 'pz-menu' },
        h('div', { class: 'pz-title' }, 'Paused'),
        hasCareer ? h('div', { class: 'pz-autosave' }, 'Your career saves itself as you play.') : null,
        h('button', { class: 'pz-item gold', onTap: () => ctx.back() }, 'Resume'),
        item('settings', 'Settings', () => { panel = 'settings'; render(); }),
        item('story', 'The Story', () => { panel = 'story'; render(); }),
        item('quit', 'Choose your captain', () => ctx.go('title')),
      ),
      h('div', { class: 'parchment pz-panel' }, panel === 'story' ? storyPanel() : settingsPanel())));
}

function storyPanel() {
  const { h } = ctx.ui;
  return [h('div', { class: 'pz-h' }, 'The Story'),
    h('div', { class: 'pz-story' },
      h('div', { class: 'pz-ted' }, ctx.ui.pic('peg-leg-ted', 'pz-ted-pic'), h('p', null, 'Old Peg Leg Ted has a story to tell…')),
      STORY.map(s => h('div', { class: 'pz-story-row' }, ctx.ui.pic(s.pic, 'pz-story-pic'), h('p', null, s.text))))];
}

let perfNote = null;
function settingsPanel() {
  const { h, seg } = ctx.ui, S = ctx.state, s = S.settings();
  const set = (k, v) => { S.setSetting(k, v); ctx.ui.applySettings(S.settings()); ctx.audio.setVolumes(S.settings()); };
  const row = (label, sub, control) => h('div', { class: 'pz-row' }, h('div', { class: 'pz-k' }, h('span', null, label), sub ? h('small', null, sub) : null), control);
  return [
    h('div', { class: 'pz-h' }, 'Settings'),
    slider('Music', 'music', s.music, set),
    slider('Sound effects', 'sfx', s.sfx, set),
    row('Captions', null, toggle(s.captions, v => set('captions', v), 'Show text for every sound and speech')),
    row('Performance mode', null, toggle(ctx.engine.perf, v => {
      ctx.engine.setPerf(v); perfNote.style.display = v === !!(ctx.PLT && ctx.PLT.lowQuality) ? 'none' : ''; // differs from how this page load was built
    }, 'For slower tablets: simpler lighting and water, less scenery, 30 frames a second')),
    perfNote = h('div', { class: 'pz-perf-note', style: { display: 'none' } },
      h('span', null, 'Some of this only switches over when the game restarts. Your career is saved.'),
      h('button', { class: 'ink-btn sm', onTap: async () => { ctx.save(); try { await ctx.state.flush(); } catch (e) {} location.reload(); } }, 'Restart now')),
  ];
}

/** Drag slider 0..100 with a big knob; saves on release. */
function slider(label, key, value, set) {
  const { h } = ctx.ui;
  const fill = h('div', { class: 'pz-fill' }), knob = h('div', { class: 'pz-knob' }), val = h('span', { class: 'pz-val' });
  const track = h('div', { class: 'pz-track' }, fill, knob);
  const hit = h('div', { class: 'pz-hit interactive' }, track);
  let v = value;
  const show = x => { v = Math.round(Math.max(0, Math.min(100, x))); fill.style.width = v + '%'; knob.style.left = v + '%'; val.textContent = v; };
  const fromEvent = e => { const r = track.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
  let id = null;
  hit.addEventListener('pointerdown', e => { id = e.pointerId; try { hit.setPointerCapture(id); } catch (_) {} show(fromEvent(e)); ctx.audio.setVolumes({ ...ctx.state.settings(), [key]: v }); });
  hit.addEventListener('pointermove', e => { if (e.pointerId !== id) return; show(fromEvent(e)); ctx.audio.setVolumes({ ...ctx.state.settings(), [key]: v }); });
  const end = e => { if (e.pointerId !== id) return; id = null; set(key, v); if (key === 'sfx') ctx.audio.play('coins', { caption: false }); };
  hit.addEventListener('pointerup', end); hit.addEventListener('pointercancel', end);
  show(value);
  return h('div', { class: 'pz-slider', dataset: { key } }, h('span', { class: 'pz-k' }, h('span', null, label)), hit, val);
}
function toggle(on, change, note) {
  const { h } = ctx.ui;
  const el = h('button', { class: 'pz-toggle' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onTap: () => { on = !on; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); change(on); } }, h('span'));
  return h('div', { class: 'pz-toggle-row' }, el, note ? h('span', { class: 'pz-note' }, note) : null);
}
