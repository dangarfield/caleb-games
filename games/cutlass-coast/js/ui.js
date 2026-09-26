// ui.js — DOM helpers for the HTML layer. Modes build into the 1333×690 #stage inside #ui.
// #ui is pointer-events:none; buttons/panels (.gold-btn .navy-btn .panel .parchment [data-tap] …) opt back in via base.css.

const NS = 'http://www.w3.org/2000/svg';
let root = null, stage = null, toastLayer = null, capLayer = null, scale = 1, ox = 0, oy = 0;
let getSettings = () => ({ captions: true });
let clickSound = null;
const mounted = new Map();

export const STAGE_W = 1333, STAGE_H = 690;

export function init({ settings, onClick } = {}) {
  root = document.getElementById('ui');
  stage = document.getElementById('stage');
  if (!stage) { stage = document.createElement('div'); stage.id = 'stage'; root.appendChild(stage); }
  toastLayer = h('div', { class: 'toast-layer' }); capLayer = h('div', { class: 'caption-layer' });
  stage.append(toastLayer, capLayer);
  if (settings) getSettings = settings;
  if (onClick) clickSound = onClick;
  window.addEventListener('resize', fit); fit();
  dragScroll();
}
/** Scale the fixed 1333×690 stage to fit the window (letterboxed, centred). */
export function fit() {
  const w = window.innerWidth, hh = window.innerHeight;
  scale = Math.min(w / STAGE_W, hh / STAGE_H); ox = (w - STAGE_W * scale) / 2; oy = (hh - STAGE_H * scale) / 2;
  stage.style.transform = `translate(${ox}px,${oy}px) scale(${scale})`;
}
/** Window client coords → stage coords. */
export const toStage = (cx, cy) => ({ x: (cx - ox) / scale, y: (cy - oy) / scale });
export const getScale = () => scale;

/**
 * h('div', {class, style, onTap, onHold:[down,up], dataset, ...attrs}, ...children)
 * style may be a string or object; children may be strings, nodes, arrays, null/false (skipped).
 * onTap uses pointer events (press scale + click sound); on* others are added as listeners.
 */
export function h(tag, attrs, ...kids) {
  const svg = tag === 'svg' || tag.startsWith('svg:');
  const el = svg ? document.createElementNS(NS, tag.replace('svg:', '')) : document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'onTap') tap(el, v);
    else if (k === 'onHold') hold(el, v[0], v[1]);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) { for (const c of kids) { if (c == null || c === false) continue; if (Array.isArray(c)) append(el, c); else el.append(c.nodeType ? c : document.createTextNode(String(c))); } }

/**
 * Finger drag-scrolling for every scroll list on the stage. The page is touch-action:none (so the game
 * never pans or zooms), and some tablet browsers then refuse to scroll lists at all — so we scroll them
 * ourselves. If the browser does scroll natively it sends pointercancel and we simply step aside.
 * A drag of more than a few pixels also cancels the tap on whatever button the finger started on.
 */
const dragged = new Set(); // pointerIds that turned into a scroll this press
function scrollBox(el) {
  for (let p = el; p && p !== stage; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 2) { const oy = getComputedStyle(p).overflowY; if (oy === 'auto' || oy === 'scroll') return p; }
  }
  return null;
}
function dragScroll() {
  let d = null;
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return; // mice have wheels
    const box = scrollBox(e.target); if (!box) return;
    d = { id: e.pointerId, box, y: e.clientY, top: box.scrollTop, on: false, last: e.clientY, t: performance.now(), v: 0 };
  }, true);
  window.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dy = (e.clientY - d.y) / scale;
    if (!d.on && Math.abs(dy) > 8) { d.on = true; dragged.add(d.id); document.querySelectorAll('.pressed').forEach(x => x.classList.remove('pressed')); }
    if (d.on) {
      d.box.scrollTop = d.top - dy;
      const now = performance.now(), dt = Math.max(1, now - d.t); d.v = (d.last - e.clientY) / scale / dt; d.last = e.clientY; d.t = now;
    }
  }, true);
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const box = d.box, on = d.on; let v = d.v; d = null;
    if (on && e.type === 'pointerup' && Math.abs(v) > 0.2) { // a little fling
      const step = () => { box.scrollTop += v * 16; v *= 0.92; if (Math.abs(v) > 0.05) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    setTimeout(() => dragged.delete(e.pointerId), 0); // after the button's own pointerup has looked
  };
  window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
}
export const wasDragged = id => dragged.has(id);

/** Tap with Pointer Events: press state, fires on release inside the element. Skips [disabled]. */
export function tap(el, fn, { sound = true } = {}) {
  let id = null;
  el.dataset.tap = '';
  el.addEventListener('pointerdown', e => {
    if (el.hasAttribute('disabled')) return;
    id = e.pointerId; el.classList.add('pressed');
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const end = (e, fire) => {
    if (e.pointerId !== id) return; id = null; el.classList.remove('pressed');
    if (!fire || el.hasAttribute('disabled') || dragged.has(e.pointerId)) return; // finger scrolled a list: not a tap
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
      if (sound && clickSound) clickSound();
      fn(e);
    }
  };
  el.addEventListener('pointerup', e => end(e, true));
  el.addEventListener('pointercancel', e => end(e, false));
  return el;
}
/** Press-and-hold (steering etc.). down(e) on press, up(e) on release/cancel. Multi-touch safe. */
export function hold(el, down, up) {
  let id = null; el.dataset.tap = '';
  el.addEventListener('pointerdown', e => { if (id !== null) return; id = e.pointerId; el.classList.add('pressed'); try { el.setPointerCapture(id); } catch (_) {} down && down(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; el.classList.remove('pressed'); up && up(e); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  return el;
}

/** Mount a mode's DOM: returns the root div.mode.mode-<name> appended to the stage. */
export function mount(name, content) {
  unmount(name);
  const el = h('div', { class: `mode mode-${name}` });
  if (typeof content === 'string') el.innerHTML = content; else if (content) append(el, [content]);
  stage.insertBefore(el, toastLayer);
  mounted.set(name, el);
  return el;
}
export function unmount(name) { const el = mounted.get(name); if (el) { el.remove(); mounted.delete(name); } }
export const modeRoot = name => mounted.get(name) || null;

// ---------- feedback ----------
/**
 * toast(text, {title, ms=2600, actions:[{label, primary, onTap}], sticky}) → {el, close()}
 * Bottom-centre navy toast (the "Sail ho!" style). With actions it stays until closed.
 */
export function toast(text, opts = {}) {
  const { title, ms = 2600, actions, sticky, cls = '' } = opts;
  const el = h('div', { class: 'toast ' + cls },
    h('div', { class: 'toast-text' }, title ? h('div', { class: 'toast-title' }, title) : null, text ? h('div', { class: 'toast-sub' }, text) : null));
  let closed = false;
  const close = () => { if (closed) return; closed = true; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  if (actions) for (const a of actions) el.append(h('button', { class: a.primary ? 'gold-btn sm' : 'navy-btn sm', onTap: () => { close(); a.onTap && a.onTap(); } }, a.label));
  toastLayer.append(el);
  if (!actions && !sticky) setTimeout(close, ms);
  return { el, close };
}
// ---------- illustrations (images/<name>.webp, see research/image-prompts.md) ----------
/** URL of an illustration by name, e.g. imgUrl('port-havana-governor'). */
export const imgUrl = name => `images/${name}.webp`;
/** <img> for an illustration. Never draggable; decoded off the main thread. */
export const pic = (name, cls = '') => h('img', { class: 'pic ' + cls, src: imgUrl(name), alt: '', draggable: 'false', decoding: 'async' });
/** Warm the browser cache so an illustration is ready before it's needed. */
export function preload(...names) { for (const n of names.flat()) { const i = new Image(); i.decoding = 'async'; i.src = imgUrl(n); } }
/**
 * A story moment: an illustrated card that drops in at the top (tap to dismiss). moment(name, {title, text, ms}).
 * Uses the toast layer so it queues with other notices.
 */
export function moment(name, { title, text, ms = 5200 } = {}) {
  const el = h('div', { class: 'toast moment' },
    h('div', { class: 'moment-pic', style: { backgroundImage: `url(${imgUrl(name)})` } }),
    h('div', { class: 'toast-text' }, title ? h('div', { class: 'toast-title' }, title) : null, text ? h('div', { class: 'toast-sub' }, text) : null));
  let closed = false;
  const close = () => { if (closed) return; closed = true; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  tap(el, close);
  toastLayer.append(el);
  setTimeout(close, ms);
  return { el, close };
}
/** Caption line for a sound or speech (only when settings.captions). */
export function caption(text) {
  if (!getSettings().captions || !capLayer || !text) return;
  const el = h('div', { class: 'caption' }, text);
  capLayer.append(el); while (capLayer.children.length > 3) capLayer.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 1800);
}
/** confirm({title, text, ok, cancel, danger}) → Promise<boolean>. Parchment dialog in a navy frame. */
export function confirm({ title = 'Are you sure?', text = '', ok = 'Yes', cancel = 'No' } = {}) {
  return new Promise(res => {
    const done = v => { back.remove(); res(v); };
    const back = h('div', { class: 'dialog-back' },
      h('div', { class: 'navy-frame dialog' },
        h('div', { class: 'parchment' },
          h('div', { class: 'dialog-title' }, title),
          text ? h('div', { class: 'dialog-text' }, text) : null,
          h('div', { class: 'dialog-btns' },
            h('button', { class: 'ink-btn', onTap: () => done(false) }, cancel),
            h('button', { class: 'gold-btn', onTap: () => done(true) }, ok)))));
    stage.insertBefore(back, toastLayer);
  });
}

// ---------- small components ----------
export const fmt = n => Math.round(n).toLocaleString('en-GB');
/** Resource chip (gold/food/guns/ships). {k, v, c} → element with .set(v) */
export function chip({ k, v, c = '#e0b44f', onTap }) {
  const val = h('span', { class: 'chip-v' }, v);
  const el = h('div', { class: 'chip', onTap }, h('span', { class: 'chip-dot', style: { background: c } }), val, h('span', { class: 'chip-k' }, k));
  el.set = x => { val.textContent = x; }; return el;
}
/** Bar {label, value, max=100, color, text, dark} → element with .set(value, text) */
export function bar({ label, value = 0, max = 100, color = '#7fbf7a', text, dark = true }) {
  const fill = h('div', { class: 'bar-fill', style: { background: color } });
  const val = h('span', { class: 'bar-v' });
  const el = h('div', { class: 'bar-row' + (dark ? '' : ' on-parchment') }, label != null ? h('span', { class: 'bar-k' }, label) : null, h('div', { class: 'bar' }, fill), val);
  let lw = null, lt = null; // skip unchanged writes (HUD bars are refreshed ~10×/s)
  el.set = (v, t) => { const w = Math.round(Math.max(0, Math.min(100, v / max * 100)) * 2) / 2 + '%', tx = String(t != null ? t : Math.round(v)); if (w !== lw) { lw = w; fill.style.width = w; } if (tx !== lt) { lt = tx; val.textContent = tx; } };
  el.set(value, text); return el;
}
/** Segmented picker: seg([{id,label,note,flag}], selectedId, onChange, {cls}) → element with .select(id) */
export function seg(options, selected, onChange, { cls = '' } = {}) {
  const el = h('div', { class: 'seg ' + cls });
  const items = options.map(o => h('button', { class: 'seg-opt', dataset: { id: o.id }, onTap: () => { el.select(o.id); onChange && onChange(o.id); } },
    o.icon ? h('span', { class: 'seg-icon' }, o.icon) : o.flag ? h('span', { class: 'flag-sm', style: { background: o.flag } }) : null,
    h('span', { class: 'seg-name' }, o.label), o.note ? h('span', { class: 'seg-note' }, o.note) : null));
  el.append(...items);
  el.select = id => items.forEach(b => b.classList.toggle('on', b.dataset.id === id));
  el.select(selected); return el;
}
/** Small nation flag swatch */
export const flag = (color, cls = 'flag-sm') => h('span', { class: cls, style: { background: color } });
/** Hamburger menu button (top-right HUD). */
export const menuButton = onTap => h('button', { class: 'menu-btn', 'aria-label': 'Menu', onTap }, h('span'), h('span'), h('span'));
/** Navy frame wrapping a parchment panel: frame(children, {cls}) */
export const frame = (kids, { cls = '', pcls = '' } = {}) => h('div', { class: 'navy-frame ' + cls }, h('div', { class: 'parchment ' + pcls }, kids));

/** Apply settings classes on #ui: steer-right mirrors HUD clusters; btn-large grows targets. */
export function applySettings(s) {
  if (!root) return;
  root.classList.toggle('steer-right', s.steerHand === 'right');
  root.classList.toggle('btn-large', s.buttonSize === 'large');
}
/** "1 man" / "3 men", "1 day" / "2 days": plural(n, 'man', 'men'); many defaults to one + 's'. */
export const plural = (n, one, many = one + 's') => `${fmt(n)} ${Math.round(n) === 1 ? one : many}`;
